// The wind (js/sim.ts windAt, windStep, windy, lagAt; docs/level-data.md "Wind"), checked in node on the compiled game:
//  - a round flown as js/player.ts stepRound flies it (the same step: drag, gravity, the wind's pull) drifts sideways in a
//    crosswind by what the lag-time rule says (w * (t - s / v0)), at 100, 300 and 600 m, for a few calibres; and G.flight's
//    lag (what the ballistic computer's marker uses) says the same;
//  - the wind's smooth in time (no steps from one 50 ms tick to the next), slow (its direction turning over minutes), its
//    mean about the theme's, and the same on two machines (two separately loaded games) for the same seed and time;
//  - the Sandia Crest has flagpoles; indoors (the Crest House) there's no wind, out in the open there is.
//   node tools/wind.test.mjs        (after tsc -p .)
import { loadLevel } from './level_env.mjs';

const A = loadLevel().G, B = loadLevel().G; // (two peers)
let bad = 0;
const fail = (m) => { bad++; console.log('FAIL ' + m); };
const ok = (m) => console.log('ok   ' + m);

// ---- drift: a round flown level, a crosswind of W m/s across it (+z), stepped as stepRound steps it
const W = 5;
function fly(def, am, dt = 1 / 120) {
  const { v0, drag, g } = A.ballistics(def, am), out = {};
  let p = { x: 0, y: 0, z: 0 }, v = { x: v0, y: 0, z: 0 }, t = 0;
  const marks = [100, 300, 600];
  while (marks.length && t < 6) {
    const p1 = { x: p.x + v.x * dt, y: p.y + v.y * dt - 0.5 * g * dt * dt, z: p.z + v.z * dt }, len = Math.hypot(p1.x - p.x, p1.y - p.y, p1.z - p.z), k = Math.exp(-len / drag);
    if (p1.x >= marks[0]) { const u = (marks[0] - p.x) / (p1.x - p.x); out[marks.shift()] = { z: p.z + (p1.z - p.z) * u, t: t + dt * u }; continue; }
    v = { x: v.x * k, y: v.y * k - g * dt, z: v.z * k }; A.Sim.windStep(v, k, { x: 0, z: W });
    p = p1; t += dt;
    if (Math.hypot(v.x, v.y, v.z) < A.ROUND_LIFE.v) break;
  }
  return { out, v0, drag };
}
const guns = [['p9', 'pistol 9 mm'], ['m4', 'Mk18 5.56'], ['ak', 'KV-47 7.62x39'], ['r700', 'R700 .308'], ['awm', 'AWM .338'], ['barrett', 'M82 .50 BMG']];
console.log(`drift in a ${W} m/s full crosswind (cm): flown / lag-time rule / G.flight lag`);
for (const [id, name] of guns) {
  const def = A.WEAPONS[id], am = A.ballFor(A.calOf(def)), { out, v0, drag } = fly(def, am), path = A.flight(def, am, 0, 600);
  const row = [];
  for (const s of [100, 300, 600]) {
    const q = out[s];
    if (!q) { row.push(`${s} m: spent`); continue; }
    const rule = W * A.Sim.lagAt(v0, drag, s), fl = path[s] ? W * path[s].lag : NaN, err = Math.abs(q.z - rule) / Math.max(rule, 1e-3);
    row.push(`${s} m: ${(q.z * 100).toFixed(1)} / ${(rule * 100).toFixed(1)} / ${(fl * 100).toFixed(1)}`);
    // (the flown round, stepped at 120 Hz as G.flight is, within 3% of the rule or 5 mm: the step takes the wind's pull at its end)
    if (err > 0.03 && Math.abs(q.z - rule) > 0.005) fail(`${id} at ${s} m: flown ${q.z.toFixed(3)} m, the rule ${rule.toFixed(3)} m`);
    if (Number.isFinite(fl) && Math.abs(fl - q.z) > 0.003 + 0.01 * rule) fail(`${id} at ${s} m: G.flight's lag ${fl.toFixed(3)} m, the rule ${rule.toFixed(3)} m`);
  }
  const f60 = fly(def, am, 1 / 60).out; row.push(`(at 60 fps, 600 m: ${f60[600] ? (f60[600].z * 100).toFixed(1) : 'spent'})`);
  console.log(`  ${name.padEnd(16)} v0 ${String(Math.round(v0)).padStart(4)} m/s, drag ${String(Math.round(drag)).padStart(4)} m   ${row.join('   ')}`);
}
{ const d = A.WEAPONS.m4, am = A.ballFor(A.calOf(d)), { v0, drag } = A.ballistics(d, am), at20 = W * A.Sim.lagAt(v0, drag, 20); if (at20 > 0.01) fail(`5.56 at 20 m drifts ${at20} m`); else ok(`close in it's nothing: 5.56 at 20 m in ${W} m/s, ${(at20 * 1000).toFixed(1)} mm`); }

// ---- the wind over time: smooth, slow, the same on both peers
const th = A.THEMES.find((t) => t.name === 'Sandia Crest'), mean = th.wind;
if (!(mean > 0)) fail('the Sandia Crest has no wind');
for (const seed of [31, 424242, 7]) {
  let maxStep = 0, same = true, sum = 0, n = 0, prev = null, turn = 0, lo = Infinity, hi = 0;
  for (let t = 0; t <= 900; t += 0.05) {
    const a = A.Sim.windAt(seed, mean, t), b = B.Sim.windAt(seed, mean, t);
    if (a.x !== b.x || a.z !== b.z) same = false;
    const s = Math.hypot(a.x, a.z); sum += s; n++; lo = Math.min(lo, s); hi = Math.max(hi, s);
    if (prev) { maxStep = Math.max(maxStep, Math.hypot(a.x - prev.x, a.z - prev.z)); }
    prev = a;
  }
  // how far its direction turns in 10 s, at most
  for (let t = 0; t <= 890; t += 1) { const a = A.Sim.windAt(seed, mean, t), b = A.Sim.windAt(seed, mean, t + 10); let d = Math.atan2(b.z, b.x) - Math.atan2(a.z, a.x); d = Math.abs(Math.atan2(Math.sin(d), Math.cos(d))); turn = Math.max(turn, d); }
  const avg = sum / n;
  const msg = `seed ${seed}: mean ${avg.toFixed(2)} m/s (theme ${mean}), ${lo.toFixed(2)}..${hi.toFixed(2)}; biggest change in a 50 ms tick ${(maxStep * 100).toFixed(1)} cm/s; turns at most ${(turn * 180 / Math.PI).toFixed(0)} deg in 10 s; two peers ${same ? 'identical' : 'DIFFER'}`;
  if (!same || maxStep > 0.25 || Math.abs(avg - mean) > mean * 0.2 || turn > 0.7) fail(msg); else ok(msg);
}
if (A.Sim.windAt(5, 0, 10).x !== 0 || A.Sim.windAt(5, undefined, 10).z !== 0) fail('no mean, yet wind'); else ok('a theme with no wind has none');

// ---- the Sandia Crest's flags, and indoors
{
  const map = A.Level.generate(31, 6, A.THEMES.indexOf(th), false), poles = map.propList.filter((p) => p.name === 'flagpole');
  if (poles.length < 4) fail(`the Sandia Crest has ${poles.length} flagpoles`); else ok(`the Sandia Crest (seed 31) has ${poles.length} flagpoles: ${poles.map((p) => `(${p.x.toFixed(1)}, ${p.z.toFixed(1)})`).join(' ')}`);
  for (const p of poles) if (!A.Sim.windy(map, p.x, (p.gy || 0) + 1, p.z)) fail(`a flagpole at (${p.x}, ${p.z}) out of the wind`);
  const [HX, HZ] = map.crest.house, CS = A.Level.CTS, hx = (HX + 4.5) * CS, hz = (HZ + 4.5) * CS, gy = A.Level.groundHeight ? A.Level.groundHeight(map, hx, hz) : 0;
  if (A.Sim.windy(map, hx, gy + 1.5, hz)) fail('wind inside the Crest House'); else ok('none inside the Crest House');
  const sp = map.spawn; if (!A.Sim.windy(map, sp.x, 1.5, sp.z)) fail('no wind in the parking lot'); else ok('wind out in the parking lot');
  for (const name of ['Apartment', 'Warehouse', 'Bunker', 'Research Lab', 'Foundry', 'Cold Storage', 'Convenience Store']) { const t = A.THEMES.find((q) => q.name === name); if (t.wind) fail(`${name} has wind ${t.wind}`); }
  ok('the indoor themes have none');
}
console.log(bad ? `${bad} FAILED` : 'all ok');
process.exit(bad ? 1 : 0);
