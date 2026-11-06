// Usage: node scripts/game-bank.mjs <out-dir>
// Bakes the game's synthesized gun-handling sounds: for each family of guns, its action worked by hand (on the
// game's two rack clocks, and the manual one), the hold-open release, the action's run home alone, the magazine in
// and out (loaded and empty), the 16 simulated magazine drops, and the rounds loaded by hand. Writes
// <out-dir>/<family>/<clip>.ogg and <out-dir>/manifest.json: each clip's anchor (the moment, s into the clip, the
// game lines up with its cue: the rear stop on the handle reaching the rear, the slam on the action home, the catch
// on the magazine seating, the first contact on the magazine landing) and each family's playback gain.
// Rendered dry: the game places them and adds its own space.
import { writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  SCENES, renderScene, encodeWav, arChargeScene, chargeScene, magDropScene, chargeFromSpec, releaseFromSpec, magFromSpec,
  GUN_SPECS, MAG_TYPES, boltActionScene, roundInScene,
} from '../dist/index.js';
import { T0 } from '../dist/excitation.js';

const out = process.argv[2];
if (!out) { console.error('usage: game-bank.mjs <out-dir>'); process.exit(1); }
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

// a scene (or the tracks `keep` passes) rendered; its anchor: where element `what` sits in the mix (0: its start)
function render(sc0, what = null, keep = null) {
  const sc = typeof sc0 === 'string' ? scene(sc0) : sc0;
  const s = keep ? { ...sc, tracks: sc.tracks.filter(keep) } : sc;
  const els = s.tracks.flatMap((t) => t.elements);
  const r = renderScene(s, sr, 1, { dry: true });
  const origin = Math.min(...els.map((e) => e.at - (e.sound.kind === 'contact' ? T0 : 0)));
  let anchor = 0;
  if (what) { const el = els.find((e) => e.what === what); if (!el) throw new Error(`${s.id}: no "${what}"`); anchor = el.at - origin; }
  else if (what === null && keep === 'first') anchor = 0;
  return { data: r.mix, anchor };
}
// a drop: its first contact is the anchor (the fall before it is the game's own)
function renderDrop(o) {
  const sc = magDropScene({ ...o, surface: 'concrete' });
  const els = sc.tracks.flatMap((t) => t.elements);
  const r = renderScene(sc, sr, 1, { dry: true });
  const origin = Math.min(...els.map((e) => e.at - (e.sound.kind === 'contact' ? T0 : 0)));
  const first = Math.min(...els.map((e) => e.at));
  return { data: r.mix, anchor: first - origin };
}
const peak = (d) => { let m = 0; for (let i = 0; i < d.length; i++) m = Math.max(m, Math.abs(d[i])); return m; };
// trim the silent tail
function trim(d) { const p = peak(d) * 0.0005; let e = d.length; while (e > 1 && Math.abs(d[e - 1]) < p) e--; return d.subarray(0, Math.min(d.length, e + Math.round(0.02 * sr))); }

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
const tmp = join(tmpdir(), 'game-bank.wav');
const manifest = { sampleRate: sr, note: 'Baked by tools/contact-synth/scripts/game-bank.mjs. anchor: s into the clip the cue lines up with; gain: the family\'s playback gain.', families: {} };
function write(fam, name, clip, k, entry) {
  const d = trim(clip.data), g = new Float32Array(d.length);
  for (let i = 0; i < d.length; i++) g[i] = d[i] * k;
  mkdirSync(join(out, fam), { recursive: true });
  writeFileSync(tmp, Buffer.from(encodeWav(g, sr)));
  execFileSync('ffmpeg', ['-loglevel', 'error', '-y', '-i', tmp, '-c:a', 'libvorbis', '-q:a', '5', join(out, fam, name + '.ogg')]);
  entry.clips[name] = { anchor: +clip.anchor.toFixed(4), len: +(d.length / sr).toFixed(3) };
}
// Each family is levelled as one: its loaded magazine going in peaks where the game's recorded insert_magazine did
// (0.89), and every other clip of the family keeps its level against it. What would clip is turned down in the file and
// back up by the family's playback gain.
const REF = 0.89;
function family(fam, clips) {
  let k = REF / peak(clips['mag-in'].data);
  const top = Math.max(...Object.values(clips).map((c) => peak(c.data))) * k;
  const gain = top > 0.97 ? top / 0.97 : 1;
  k /= gain;
  const entry = { gain: +gain.toFixed(3), clips: {} };
  for (const [name, c] of Object.entries(clips)) write(fam, name, c, k, entry);
  manifest.families[fam] = entry;
  console.log(`${fam}: ${Object.keys(clips).length} clips, gain ${gain.toFixed(2)}`);
}

const FILLS = { empty: 0, third: 1 / 3, 'two-thirds': 2 / 3, full: 1 };
const WAYS = ['bottom', 'top', 'sideways', 'forwards'];
for (const [fam, F] of Object.entries(HAND)) {
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
{
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
writeFileSync(join(out, 'manifest.json'), JSON.stringify(manifest, null, 1));
rmSync(tmp, { force: true });
console.log('wrote', out);
