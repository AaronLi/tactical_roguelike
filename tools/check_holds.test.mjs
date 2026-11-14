// HAND FRAMES: for every gun (its factory build, and each foregrip on a gun that takes one), how the hands take it (G.GunRig.holds:
// docs/models.md "Hand frames") must be a frame a hand can have, the right way round:
//   - every vector finite, palm and fingers unit length and square to each other (within 1e-3);
//   - the grip: the right hand's palm facing the gun's left (palm.x < -0.7), its fingers forward (fingers.z < -0.5), not up or down the gun
//     (|fingers.y| < 0.5): a frame the other way round puts the hand on the grip back to front or upside down;
//   - the support: on a forend the palm facing up into it (palm.y > 0.5) and the fingers out to the right (fingers.x > 0.3); closed round a
//     foregrip or on a pistol's grip the palm facing right (palm.x > 0.7) and the fingers forward (fingers.z < -0.5);
//   - the points: the grip's behind the support's on a long gun (a hand ahead of the other's would cross the arms), and a foregrip's under
//     the bore.
//   node tools/check_holds.test.mjs [id ...]        (after tsc: npm run test:models runs it)
import { loadGame } from './model_env.mjs';

const G = loadGame();
const only = process.argv.slice(2).filter((a) => !a.startsWith('-'));
const fails = [];
let n = 0;
const near = (x, y, e = 1e-3) => Math.abs(x - y) <= e;
const fin = (u) => [u.x, u.y, u.z].every(Number.isFinite);
function check(label, def, info) {
  const h = G.GunRig.holds(def, info);
  n++;
  const bad = (why) => fails.push(`${label}: ${why}`);
  for (const [k, f] of [['grip', h.grip], ['support', h.support]]) {
    if (!fin(f.at) || !fin(f.palm) || !fin(f.fingers)) { bad(`${k}: not finite`); continue; }
    if (!near(f.palm.length(), 1) || !near(f.fingers.length(), 1)) bad(`${k}: palm or fingers not unit length`);
    if (!near(f.palm.dot(f.fingers), 0)) bad(`${k}: fingers not square to the palm (${f.palm.dot(f.fingers).toFixed(3)})`);
    if (f.hold !== 'closed' && f.hold !== 'palm') bad(`${k}: hold '${f.hold}'`);
  }
  const g = h.grip, s = h.support;
  if (!(g.palm.x < -0.7)) bad(`grip: the palm faces ${g.palm.toArray().map((x) => x.toFixed(2))}, not the gun's left: the right hand would be on the grip back to front`);
  if (!(g.fingers.z < -0.5)) bad(`grip: the fingers run ${g.fingers.toArray().map((x) => x.toFixed(2))}, not forward`);
  if (!(Math.abs(g.fingers.y) < 0.5)) bad('grip: the fingers run up or down the gun: the hand would be upside down');
  if (s.kind === 'forend') {
    if (!(s.palm.y > 0.5)) bad('support: a forend\'s palm not facing up into it');
    if (!(s.fingers.x > 0.3)) bad('support: a forend\'s fingers not out to the right');
  } else {
    if (!(s.palm.x > 0.7)) bad(`support (${s.kind}): the palm not facing right`);
    if (!(s.fingers.z < -0.5)) bad(`support (${s.kind}): the fingers not forward`);
  }
  if (!info.pistol && !(s.at.z < g.at.z)) bad('support: not ahead of the grip');
  if (s.kind === 'fg' && !(s.at.y < 0)) bad('support: a foregrip\'s hold above the bore');
}
// (first that it catches what it's for: a grip frame back to front, and one with the fingers up the gun)
{
  const real = G.GunRig.holds, def = G.Gunsmith.fromCode('ak'), info = G.GunModels.display(def).info, before = fails.length;
  for (const spoil of [(h) => h.grip.palm.negate(), (h) => { h.grip.fingers.set(0, 1, 0); h.grip.palm.set(-1, 0, 0); }]) {
    G.GunRig.holds = (d, i) => { const h = real(d, i); spoil(h); return h; };
    const k = fails.length; check('selftest', def, info);
    if (fails.length === k) { console.log('check_holds: the self-test passed a spoiled frame'); process.exit(1); }
  }
  G.GunRig.holds = real; fails.length = before; n = 0;
}
const ids = only.length ? only : G.WEAPON_LIST.map((w) => w.id);
const fgs = G.Gunsmith.LIST ? G.Gunsmith.LIST.filter((p) => p.slot === 'fg') : [];
for (const id of ids) {
  const def = G.Gunsmith.fromCode(id);
  if (!def) { fails.push(`${id}: no build`); continue; }
  let info;
  try { info = G.GunModels.display(def).info; } catch (e) { fails.push(`${id}: no model (${e.message})`); continue; }
  check(id, def, info);
  // with a foregrip on it, where it takes one
  if (G.Gunsmith.PLATFORMS[id] && fgs.length && (def.parts || []).some((p) => p && p.provides && p.provides.fg)) {
    for (const fg of fgs) check(`${id} + ${fg.id}`, Object.assign({}, def, { parts: [...(def.parts || []).filter((p) => p && p.slot !== 'fg'), fg] }), info);
  }
}
for (const id of Object.keys(G.GunRig.HOLD_FIX)) if (!G.WEAPONS[id]) fails.push(`HOLD_FIX: ${id} is no gun`);
if (fails.length) { console.log(fails.join('\n')); console.log(`check_holds: ${fails.length} problem(s) in ${n} frames`); process.exit(1); }
console.log(`check_holds: ${n} hand frames ok`);
