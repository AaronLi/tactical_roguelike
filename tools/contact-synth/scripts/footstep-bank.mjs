// Usage: node scripts/footstep-bank.mjs <out-dir> [variants=4]
// Bakes the game's synthesized footsteps: for each sole, every floor at every gait, a few variations (left and
// right feet, each a little different), and the kit's rattle for each gait, apart, to lay over any step.
// Writes <out-dir>/<sole>/<floor>-<gait>-<n>.ogg, <out-dir>/kit/<kit>-<gait>-<n>.ogg and <out-dir>/manifest.json:
// each clip's anchor (s into the clip where the foot strikes: the moment the game's step lines up with) and length.
// Levels are baked in: every clip sits where its sole, floor and gait put it (SoleSpec/FloorSpec/GaitSpec.levelDb,
// measured on its loudest 50 ms), all scaled together so the loudest just fits. Rendered dry.
import { writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { stepScene, renderScene, encodeWav, SOLES, FLOORS, GAITS, STRIKE } from '../dist/index.js';
import { T0 } from '../dist/excitation.js';

const out = process.argv[2], VARIANTS = Number(process.argv[3] ?? 4);
if (!out) { console.error('usage: footstep-bank.mjs <out-dir> [variants]'); process.exit(1); }
const sr = 48000;
// who walks in what: the officers in boots (all of it), suspects and civilians in sneakers (all of it) and dress
// shoes (walking and running on the floors indoors and the street)
const BAKE = {
  boot: { floors: Object.keys(FLOORS), gaits: Object.keys(GAITS) },
  sneaker: { floors: Object.keys(FLOORS), gaits: Object.keys(GAITS) },
  dress: { floors: ['concrete', 'pave', 'tile', 'lino', 'wood', 'metal', 'carpet'], gaits: ['walk', 'run'] },
};
const KITS = { light: -10, heavy: -5 }; // (dB against a boot walking on concrete, at a walk)

const dB = (x) => Math.pow(10, x / 20);
function render(sc) {
  const els = sc.tracks.flatMap((t) => t.elements);
  const r = renderScene(sc, sr, 1, { dry: true });
  const origin = Math.min(...els.map((e) => e.at - (e.sound.kind === 'contact' ? T0 : 0)));
  return { data: r.mix, anchor: 0 - origin }; // (the strike is at 0 in a step's scene)
}
// loudness: RMS over the loudest 50 ms
function loud(d) {
  const W = Math.round(0.05 * sr); let s = 0, best = 0;
  for (let i = 0; i < d.length; i++) { s += d[i] * d[i]; if (i >= W) s -= d[i - W] * d[i - W]; if (s > best) best = s; }
  return Math.sqrt(best / W);
}
const peak = (d) => { let m = 0; for (let i = 0; i < d.length; i++) m = Math.max(m, Math.abs(d[i])); return m; };
function trim(d) { const p = peak(d) * 0.0005; let e = d.length; while (e > 1 && Math.abs(d[e - 1]) < p) e--; return d.subarray(0, Math.min(d.length, e + Math.round(0.02 * sr))); }

const clips = []; // { dir, name, data, anchor, level }
const t0 = Date.now();
for (const [sole, b] of Object.entries(BAKE)) for (const floor of b.floors) for (const gait of b.gaits) for (let n = 1; n <= VARIANTS; n++) {
  const sc = stepScene({ sole, floor, gait, foot: n % 2 ? 'R' : 'L', seed: n });
  const c = render({ ...sc, tracks: sc.tracks.filter((t) => t.name !== 'kit') });
  clips.push({ dir: sole, name: `${floor}-${gait}-${n}`, ...c, level: SOLES[sole].levelDb + FLOORS[floor].levelDb + GAITS[gait].levelDb });
}
for (const [kit, lv] of Object.entries(KITS)) for (const gait of Object.keys(GAITS)) for (let n = 1; n <= VARIANTS; n++) {
  const sc = stepScene({ sole: 'boot', floor: 'concrete', gait, kit, foot: n % 2 ? 'R' : 'L', seed: n });
  const c = render({ ...sc, tracks: sc.tracks.filter((t) => t.name === 'kit') });
  clips.push({ dir: 'kit', name: `${kit}-${gait}-${n}`, ...c, level: lv + GAITS[gait].levelDb * 0.6 });
}
console.log(`rendered ${clips.length} clips in ${((Date.now() - t0) / 1000).toFixed(1)}s`);

// every clip to its level, then all of them together so the loudest peak sits at 0.95
for (const c of clips) { c.data = trim(c.data); c.k = dB(c.level) / Math.max(1e-9, loud(c.data)); }
const top = Math.max(...clips.map((c) => peak(c.data) * c.k));
rmSync(out, { recursive: true, force: true });
const tmp = join(tmpdir(), 'footstep-bank.wav');
const manifest = { sampleRate: sr, note: 'Baked by tools/contact-synth/scripts/footstep-bank.mjs. anchor: s into the clip where the foot strikes. Levels are baked in.', strike: STRIKE, variants: VARIANTS, soles: {}, kit: {} };
for (const c of clips) {
  const g = new Float32Array(c.data.length), k = (c.k * 0.95) / top;
  for (let i = 0; i < g.length; i++) g[i] = c.data[i] * k;
  mkdirSync(join(out, c.dir), { recursive: true });
  writeFileSync(tmp, Buffer.from(encodeWav(g, sr)));
  execFileSync('ffmpeg', ['-loglevel', 'error', '-y', '-i', tmp, '-c:a', 'libvorbis', '-q:a', '4', join(out, c.dir, c.name + '.ogg')]);
  const entry = { anchor: +c.anchor.toFixed(4), len: +(g.length / sr).toFixed(3), db: +(20 * Math.log10(k * loud(c.data))).toFixed(1) };
  if (c.dir === 'kit') manifest.kit[c.name] = entry; else (manifest.soles[c.dir] ??= {})[c.name] = entry;
}
writeFileSync(join(out, 'manifest.json'), JSON.stringify(manifest, null, 1));
rmSync(tmp, { force: true });
console.log('wrote', out);
