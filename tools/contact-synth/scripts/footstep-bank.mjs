// Usage: node scripts/footstep-bank.mjs <out-dir> [variants=4] [-j N]
// Bakes the game's synthesized footsteps: for each walker (a sole and a weight: BAKE), every floor at every gait, a
// few variations (left and right feet, each a little different), and the kit's rattle for each gait, apart, to lay over
// any step. Writes <out-dir>/<walker>/<floor>-<gait>-<n>.ogg, <out-dir>/kit/<kit>-<gait>-<n>.ogg and <out-dir>/manifest.json:
// each clip's anchor (s into the clip where the foot strikes: the moment the game's step lines up with) and length.
// Levels are baked in: every clip sits where its sole, floor and gait put it (SoleSpec/FloorSpec/GaitSpec.levelDb,
// measured on its loudest 50 ms), all scaled together so the loudest just fits. Rendered dry.
// Rendered on worker threads and encoded n at a time (render-pool.mjs; -j N, default the cores less one).
import { writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { stepScene, SOLES, FLOORS, GAITS, STRIKE } from '../dist/index.js';
import { T0 } from '../dist/excitation.js';
import { renderPool, encodeAll, jobsArg } from './render-pool.mjs';

const args = process.argv.slice(2).filter((a, i, all) => a !== '-j' && a !== '--jobs' && all[i - 1] !== '-j' && all[i - 1] !== '--jobs');
const out = args[0], VARIANTS = Number(args[1] ?? 4), J = jobsArg();
if (!out) { console.error('usage: footstep-bank.mjs <out-dir> [variants] [-j N]'); process.exit(1); }
const sr = 48000;
// Who walks, each a profile (a folder of the bank): what's on their feet and what they weigh with what they carry. The
// officers in boots with their armour and kit (~105 kg); a suspect in boots (~80 kg); civilians in sneakers, everyday
// rubber-soled shoes, or leather dress shoes (~70-75 kg; the dress shoes walking and running on floors indoors and the
// street). A heavier walker's steps are heavier (more of the leg's mass stopping) and louder (10 log of the mass: the
// impact's energy).
const ALL = { floors: Object.keys(FLOORS), gaits: Object.keys(GAITS) };
const BAKE = {
  boot: { sole: 'boot', mass: 105, ...ALL },
  suspect: { sole: 'boot', mass: 80, ...ALL },
  sneaker: { sole: 'sneaker', mass: 70, ...ALL },
  shoe: { sole: 'shoe', mass: 75, ...ALL },
  dress: { sole: 'dress', mass: 75, floors: ['concrete', 'pave', 'tile', 'lino', 'wood', 'metal', 'carpet'], gaits: ['walk', 'run'] },
};
const KITS = { light: -14, heavy: -9 }; // (dB against a boot walking on concrete, at a walk: under the step, so a soft floor stays soft)

const dB = (x) => Math.pow(10, x / 20);
// a scene's anchor: where the strike (0 in a step's scene) falls in its render
function anchorOf(sc) {
  const els = sc.tracks.flatMap((t) => t.elements);
  return 0 - Math.min(...els.map((e) => e.at - (e.sound.kind === 'contact' ? T0 : 0)));
}
// loudness: RMS over the loudest 50 ms
function loud(d) {
  const W = Math.round(0.05 * sr); let s = 0, best = 0;
  for (let i = 0; i < d.length; i++) { s += d[i] * d[i]; if (i >= W) s -= d[i - W] * d[i - W]; if (s > best) best = s; }
  return Math.sqrt(best / W);
}
const peak = (d) => { let m = 0; for (let i = 0; i < d.length; i++) m = Math.max(m, Math.abs(d[i])); return m; };
function trim(d) { const p = peak(d) * 0.0005; let e = d.length; while (e > 1 && Math.abs(d[e - 1]) < p) e--; return d.subarray(0, Math.min(d.length, e + Math.round(0.02 * sr))); }

const clips = []; // { dir, name, scene, anchor, level } (then data, once rendered)
const t0 = Date.now();
for (const [who, b] of Object.entries(BAKE)) for (const floor of b.floors) for (const gait of b.gaits) for (let n = 1; n <= VARIANTS; n++) {
  const sc = stepScene({ sole: b.sole, floor, gait, massKg: b.mass, foot: n % 2 ? 'R' : 'L', seed: n }), scene = { ...sc, tracks: sc.tracks.filter((t) => t.name !== 'kit') };
  clips.push({ dir: who, name: `${floor}-${gait}-${n}`, scene, anchor: anchorOf(scene), level: SOLES[b.sole].levelDb + FLOORS[floor].levelDb + GAITS[gait].levelDb + 10 * Math.log10(b.mass / 80) });
}
for (const [kit, lv] of Object.entries(KITS)) for (const gait of Object.keys(GAITS)) for (let n = 1; n <= VARIANTS; n++) {
  const sc = stepScene({ sole: 'boot', floor: 'concrete', gait, kit, foot: n % 2 ? 'R' : 'L', seed: n }), scene = { ...sc, tracks: sc.tracks.filter((t) => t.name === 'kit') };
  clips.push({ dir: 'kit', name: `${kit}-${gait}-${n}`, scene, anchor: anchorOf(scene), level: lv + GAITS[gait].levelDb }); // (as quiet as the gait is: a creep moves the kit no more than the feet)
}
const pool = renderPool(J), mixes = await pool.render(clips.map((c) => c.scene));
await pool.close();
clips.forEach((c, i) => { c.data = mixes[i]; delete c.scene; });
console.log(`rendered ${clips.length} clips in ${((Date.now() - t0) / 1000).toFixed(1)}s on ${J} threads`);

// every clip to its level, then all of them together so the loudest peak sits at 0.95
for (const c of clips) { c.data = trim(c.data); c.k = dB(c.level) / Math.max(1e-9, loud(c.data)); }
const top = Math.max(...clips.map((c) => peak(c.data) * c.k));
rmSync(out, { recursive: true, force: true });
const manifest = { sampleRate: sr, note: 'Baked by tools/contact-synth/scripts/footstep-bank.mjs. anchor: s into the clip where the foot strikes. Levels are baked in.', strike: STRIKE, variants: VARIANTS, soles: {}, kit: {} };
const enc = [];
for (const c of clips) {
  const g = new Float32Array(c.data.length), k = (c.k * 0.95) / top;
  for (let i = 0; i < g.length; i++) g[i] = c.data[i] * k;
  mkdirSync(join(out, c.dir), { recursive: true });
  enc.push({ data: g, sr, path: join(out, c.dir, c.name + '.ogg') });
  const entry = { anchor: +c.anchor.toFixed(4), len: +(g.length / sr).toFixed(3), db: +(20 * Math.log10(k * loud(c.data))).toFixed(1) };
  if (c.dir === 'kit') manifest.kit[c.name] = entry; else (manifest.soles[c.dir] ??= {})[c.name] = entry;
}
await encodeAll(enc, J, 4);
writeFileSync(join(out, 'manifest.json'), JSON.stringify(manifest, null, 1));
console.log('wrote', out);
