// Usage: node scripts/game-bank.mjs <out-dir>
// Bakes the game's synthesized gun-handling sounds: for each family of guns, its action worked by hand (on the
// game's two rack clocks, and the manual one), the hold-open release, the action's run home alone, the magazine in
// and out (loaded and empty), the 16 simulated magazine drops, and the rounds loaded by hand. Writes
// <out-dir>/<family>/<clip>.ogg and <out-dir>/manifest.json: each clip's anchor (the moment, s into the clip, the
// game lines up with its cue: the rear stop on the handle reaching the rear, the slam on the action home, the catch
// on the magazine seating, the first contact on the magazine landing) and each family's playback gain.
// Rendered dry: the game places them and adds its own space.
// Every clip's scene is built first, then all of them rendered on worker threads and encoded n at a time
// (render-pool.mjs; -j N, default the cores less one).
import { writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { renderPool, encodeAll, jobsArg } from './render-pool.mjs';
import {
  SCENES, arChargeScene, chargeScene, magDropScene, chargeFromSpec, releaseFromSpec, magFromSpec,
  GUN_SPECS, MAG_TYPES, boltActionScene, roundInScene,
  revolverOpen, revolverClose, revolverLoader, breakOpen, breakClose, breakLoad, beltOut, beltIn, enblocIn,
} from '../dist/index.js';
import { readFileSync, existsSync } from 'node:fs';
import { T0 } from '../dist/excitation.js';

// --only fam,fam: bake just those families into an existing bank (the rest of its manifest kept)
const J = jobsArg();
const out = process.argv[2], oi = process.argv.indexOf('--only'), only = oi > 0 ? new Set(process.argv[oi + 1].split(',')) : null;
if (!out) { console.error('usage: game-bank.mjs <out-dir> [--only fam,fam]'); process.exit(1); }
const doing = (f) => !only || only.has(f);
const sr = 48000;
const scene = (id) => { const s = SCENES.find((x) => x.id === id); if (!s) throw new Error('no scene ' + id); return s; };
// the game's rack clock (js/vmanim.ts): the hand draws the action from 30% to 52% of the motion and lets go at once
const RACKS = { 45: 0.45, 60: 0.6 };
const pullOf = (dur) => ({ pull: 0.22 * dur, hold: 0 });

// Each family: how its sounds are built, and the elements the game's cues line up with.
const HAND = {
  ar15: { mag: 'ar15', charge: (t) => arChargeScene('loaded', t), rear: 'handle bottoms out', slam: 'carrier slams onto the bolt', release: 'ar15-bolt-release',
    magIn: 'ar15-mag-in', magInEmpty: 'ar15-mag-in-empty', magOut: 'ar15-mag-out', magOutEmpty: 'ar15-mag-out-empty', click: 'mag catch clicks into the hole in the magazine' },
  kv47: { mag: 'kv47', charge: (t) => chargeScene('ak', 'loaded', t), rear: 'carrier slams into the rear trunnion', slam: 'carrier slams home',
    magIn: 'kv47-mag-in', magInEmpty: 'kv47-mag-in-empty', magOut: 'kv47-mag-out', magOutEmpty: 'kv47-mag-out-empty', click: 'paddle snaps over the rear lug' },
  mp5: { mag: 'mp5', charge: (t) => chargeScene('mp5', 'loaded', t), rear: 'handle stops at the end of its slot', slam: 'rollers snap out into the trunnion',
    magIn: 'mp5-mag-in', magInEmpty: 'mp5-mag-in-empty', magOut: 'mp5-mag-out', magOutEmpty: 'mp5-mag-out-empty', click: 'catch clicks into the magazine' },
  g19: { mag: 'g19', charge: (t) => chargeScene('g19', 'loaded', t), rear: 'slide stops at the rear', slam: 'slide slams home', release: 'g19-slide-release',
    magIn: 'g19-mag-in', magInEmpty: 'g19-mag-in-empty', magOut: 'g19-mag-out', magOutEmpty: 'g19-mag-out-empty', click: 'catch clicks into the magazine' },
};
for (const id of ['sr25', 'smg', 'bullpup']) {
  const g = GUN_SPECS[id], tilt = g.action.lockup === 'tilting';
  HAND[id] = {
    mag: id, charge: (t) => chargeFromSpec(g, 'loaded', t), rear: tilt ? 'slide stops at the rear' : 'carrier hits the rear stop',
    slam: g.action.lockup === 'blowback' ? 'bolt slams into the breech' : tilt ? 'slide slams home' : g.action.lockup === 'rollers' ? 'carrier slams home' : 'carrier slams home',
    release: g.action.holdOpen ? releaseFromSpec(g) : null,
    magIn: magFromSpec(g, 'in', 'loaded'), magInEmpty: magFromSpec(g, 'in', 'empty'), magOut: magFromSpec(g, 'out', 'loaded'), magOutEmpty: magFromSpec(g, 'out', 'empty'),
    click: g.magazine.insert === 'rock-in' ? 'catch snaps over the rear lug' : 'catch clicks into the magazine',
  };
}

// (a clip to render: its scene queued, its data filled in once the pool's rendered them all)
const queue = [];
const later = (scene, anchor) => { const c = { scene, anchor, data: null }; queue.push(c); return c; };
// a scene (or the tracks `keep` passes) rendered; its anchor: where element `what` sits in the mix (0: its start)
function render(sc0, what = null, keep = null) {
  const sc = typeof sc0 === 'string' ? scene(sc0) : sc0;
  const s = keep ? { ...sc, tracks: sc.tracks.filter(keep) } : sc;
  const els = s.tracks.flatMap((t) => t.elements);
  const origin = Math.min(...els.map((e) => e.at - (e.sound.kind === 'contact' ? T0 : 0)));
  let anchor = 0;
  if (what) { const el = els.find((e) => e.what === what); if (!el) throw new Error(`${s.id}: no "${what}"`); anchor = el.at - origin; }
  else if (what === null && keep === 'first') anchor = 0;
  return later(s, anchor);
}
// a drop: its first contact is the anchor (the fall before it is the game's own)
function renderDrop(o) {
  const sc = magDropScene({ ...o, surface: 'concrete' });
  const els = sc.tracks.flatMap((t) => t.elements);
  const origin = Math.min(...els.map((e) => e.at - (e.sound.kind === 'contact' ? T0 : 0)));
  const first = Math.min(...els.map((e) => e.at));
  return later(sc, first - origin);
}
const peak = (d) => { let m = 0; for (let i = 0; i < d.length; i++) m = Math.max(m, Math.abs(d[i])); return m; };
// trim the silent tail
function trim(d) { const p = peak(d) * 0.0005; let e = d.length; while (e > 1 && Math.abs(d[e - 1]) < p) e--; return d.subarray(0, Math.min(d.length, e + Math.round(0.02 * sr))); }

if (!only) rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
const enc = [];
const old = only && existsSync(join(out, 'manifest.json')) ? JSON.parse(readFileSync(join(out, 'manifest.json'), 'utf8')) : null;
const manifest = { sampleRate: sr, note: 'Baked by tools/contact-synth/scripts/game-bank.mjs. anchor: s into the clip the cue lines up with; gain: the family\'s playback gain.', families: {} };
function write(fam, name, clip, k, entry) {
  const d = trim(clip.data), g = new Float32Array(d.length);
  for (let i = 0; i < d.length; i++) g[i] = d[i] * k;
  mkdirSync(join(out, fam), { recursive: true });
  enc.push({ data: g, sr, path: join(out, fam, name + '.ogg') });
  entry.clips[name] = { anchor: +clip.anchor.toFixed(4), len: +(d.length / sr).toFixed(3) };
}
// Each family is levelled as one: its loaded magazine going in peaks where the game's recorded insert_magazine did
// (0.89), and every other clip of the family keeps its level against it. What would clip is turned down in the file and
// back up by the family's playback gain.
const REF = 0.89;
// (each family levelled once every clip's rendered: family() queues it, level() does it)
const fams = [];
function family(fam, clips) { fams.push([fam, clips]); }
function level(fam, clips) {
  let k = REF / peak(clips['mag-in'].data);
  const top = Math.max(...Object.values(clips).map((c) => peak(c.data))) * k;
  const gain = top > 0.97 ? top / 0.97 : 1;
  k /= gain;
  rmSync(join(out, fam), { recursive: true, force: true });
  const entry = { gain: +gain.toFixed(3), clips: {} };
  for (const [name, c] of Object.entries(clips)) write(fam, name, c, k, entry);
  manifest.families[fam] = entry;
  console.log(`${fam}: ${Object.keys(clips).length} clips, gain ${gain.toFixed(2)}`);
}

if (old) for (const [f, e] of Object.entries(old.families)) if (!only.has(f)) manifest.families[f] = e;
// an action's racks on the game's two clocks, and the pull alone and the run home alone
function racks(F, clips) {
  for (const [n, dur] of Object.entries(RACKS)) {
    const sc = F.charge(pullOf(dur));
    clips[`rack-${n}`] = render(sc, F.rear);
    if (n === '45') {
      const at = sc.tracks.flatMap((t) => t.elements).find((e) => e.what === F.rear).at;
      const part = (f) => ({ ...sc, tracks: sc.tracks.map((t) => ({ ...t, elements: t.elements.filter(f) })).filter((t) => t.elements.length) });
      clips['pull'] = render(part((e) => e.at <= at + 0.0005), F.rear);
      clips['home'] = render(part((e) => e.at > at + 0.0005), F.slam);
    }
  }
}
const FILLS = { empty: 0, third: 1 / 3, 'two-thirds': 2 / 3, full: 1 };
const WAYS = ['bottom', 'top', 'sideways', 'forwards'];
for (const [fam, F] of Object.entries(HAND)) {
  if (!doing(fam)) continue;
  const clips = {};
  for (const [n, dur] of Object.entries(RACKS)) {
    const sc = F.charge(pullOf(dur));
    clips[`rack-${n}`] = render(sc, F.rear);
    // (the pull alone and the run home alone: an MP5's slap reload works them apart, the handle parked in its notch)
    if (n === '45') {
      // (split at the rear stop: what's before it and the stop itself, and what comes after)
      const at = sc.tracks.flatMap((t) => t.elements).find((e) => e.what === F.rear).at;
      const part = (f) => ({ ...sc, tracks: sc.tracks.map((t) => ({ ...t, elements: t.elements.filter(f) })).filter((t) => t.elements.length) });
      clips['pull'] = render(part((e) => e.at <= at + 0.0005), F.rear);
      clips['home'] = render(part((e) => e.at > at + 0.0005), F.slam);
    }
  }
  if (F.release) { const r = typeof F.release === 'string' ? scene(F.release) : F.release; clips['release'] = render(r, F.slam); }
  clips['mag-in'] = render(F.magIn, F.click);
  clips['mag-in-empty'] = render(F.magInEmpty, F.click);
  clips['mag-out'] = render(F.magOut);
  clips['mag-out-empty'] = render(F.magOutEmpty);
  const cap = MAG_TYPES[F.mag].capacity;
  for (const [fill, f] of Object.entries(FILLS)) for (const way of WAYS) clips[`drop-${fill}-${way}`] = renderDrop({ mag: F.mag, rounds: Math.round(cap * f), way });
  family(fam, clips);
}
// manual actions (the game's manual clock: 0.6 s, the action at the rear at 55%), and the rounds loaded by hand,
// levelled against the AR's magazine (their own clip standing in for mag-in)
if (doing('manual')) {
  const ar = render(HAND.ar15.magIn, HAND.ar15.click);
  const manual = {
    'mag-in': ar,
    bolt: render(boltActionScene(0.33), 'bolt hits its stop'),
    pump: render(scene('pump-shotgun'), 'bolt hits rear of receiver'),
    'shell-in': render(roundInScene('shell'), 'shell latch clicks behind its rim'),
    'cartridge-in': render(roundInScene('cartridge'), 'rim seats on the chamber face'),
  };
  family('manual', manual);
}
// The guns with no magazine of the from-spec kinds (scenes/no-family.ts). Open: its start's the cue; shut: the latch.
// mag-out / mag-in are what the game's magazine cues play for them (the cylinder out and the empties punched out, a
// speed loader in and the cylinder shut; the barrels dropped open, the shells in and the gun shut; the feed cover up and
// the belt out, a box on and the cover slammed; an M1's clip thumbed in and the bolt home).
if (doing('revolver')) {
  const open = render(revolverOpen()), load = render(revolverLoader(), 'rim seats on the cylinder');
  family('revolver', { open, close: render(revolverClose(), 'latch clicks home into the frame'), 'mag-out': open, 'mag-out-empty': open, 'mag-in': load, 'mag-in-empty': load,
    'open-cue': render(revolverOpen(), 'crane stops against the frame'), load: render(revolverLoader(6, null), 'rim seats on the cylinder') });
}
if (doing('break')) {
  const open = render(breakOpen()), load = render(breakLoad(2), 'rim seats on the extractor');
  family('break', { open, close: render(breakClose(), 'locking bolt snaps into the lumps'), 'mag-out': open, 'mag-out-empty': open, 'mag-in': load, 'mag-in-empty': load,
    'mag-in-one': render(breakLoad(1, 0.3, 'cartridge'), 'rim seats on the extractor'),
    'open-cue': render(breakOpen(), 'barrels stop on the action'), load: render(breakLoad(2, null), 'rim seats on the extractor'), 'load-one': render(breakLoad(1, null, 'cartridge'), 'rim seats on the extractor') });
}
if (doing('belt')) {
  const load = render(beltIn(), 'cover slammed shut'), clips = { 'mag-out': render(beltOut()), 'mag-out-empty': render(beltOut(true)), 'mag-in': load, 'mag-in-empty': load };
  // (the parts on their own, for the cues on the animation's own moments)
  const part = (sc, a, b, what) => render({ ...sc, tracks: sc.tracks.map((t) => ({ ...t, elements: t.elements.filter((e) => e.at >= a && e.at < b) })) }, what);
  const o = beltOut(), oe = beltOut(true), i = beltIn();
  Object.assign(clips, { 'cover-up': part(o, 0, 0.2, 'cover stops at the top'), 'belt-off': part(o, 0.2, 0.5, null), 'box-off': part(o, 0.5, 9, 'box unhooked'),
    'box-on': part(i, 0, 0.15, 'box hooks on'), 'belt-on': part(i, 0.15, 0.48, null), 'cover-down': part(i, 0.48, 9, 'cover slammed shut') });
  void oe;
  racks(HAND.kv47, clips);
  family('belt', clips);
}
if (doing('enbloc')) {
  const load = render(enblocIn(), 'clip latch catches the clip'), clips = { 'mag-in': load, 'mag-in-empty': load, 'mag-out': render(HAND.sr25.magOut), 'mag-out-empty': render(HAND.sr25.magOutEmpty) };
  racks(HAND.sr25, clips);
  family('enbloc', clips);
}
{
  const t0 = Date.now(), pool = renderPool(J), mixes = await pool.render(queue.map((c) => c.scene));
  await pool.close();
  queue.forEach((c, i) => { c.data = mixes[i]; });
  console.log(`rendered ${queue.length} clips in ${((Date.now() - t0) / 1000).toFixed(1)}s on ${J} threads`);
}
for (const [fam, clips] of fams) level(fam, clips);
await encodeAll(enc, J, 5);
writeFileSync(join(out, 'manifest.json'), JSON.stringify(manifest, null, 1));
console.log('wrote', out);
