// The reload mocap's reckoning (js/mocapmath.ts: mocap.html's), checked in node on the compiled file. It has no three.js and no browser in it:
//  - a hand or a body put somewhere in front of a camera and projected comes back where it was (solveT), at several fields of view, with a few
//    points missing, and with the picture's points jittered by a pixel;
//  - the 1-euro filter settles on a still value and follows a moving one;
//  - a hand's curl runs from flat to a fist, a grab holds between its two thresholds, and a beat has when the hand closed and opened in it;
//  - a zone reaches further along the camera's ray than across it (zoneRatio, depthK);
//  - the tracker holds a zone against flicker at its edge, lets go of it between zones, and goes from one straight into a nearer one;
//  - a stream is cut into a take from the hand leaving the handguard to its return, with its beats; a hand that goes nowhere makes none;
//  - two takes' beats pair up in order, and a path's corners come out as keys named by their anchors.
//   node tools/mocap.test.mjs        (after tsc -p .)
import fs from 'node:fs'; import path from 'node:path'; import { fileURLToPath } from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
// (dist/js has no package.json saying its files are modules, and this one imports nothing: it is loaded from its text)
const { MocapMath: M } = await import('data:text/javascript;base64,' + fs.readFileSync(path.join(ROOT, 'dist/js/mocapmath.js')).toString('base64'));
let bad = 0;
const fail = (m) => { bad++; console.log('FAIL ' + m); };
const ok = (m) => console.log('ok   ' + m);
const check = (cond, m) => (cond ? ok(m) : fail(m));
let seed = 7; const rnd = () => { seed = (Math.imul(seed, 1103515245) + 12345) >>> 0; return seed / 4294967296; };

// ---- solveT
{
  const shape = Array.from({ length: 21 }, () => [(rnd() - 0.5) * 0.16, (rnd() - 0.5) * 0.18, (rnd() - 0.5) * 0.06]);
  let worst = 0, worstN = 0;
  for (const fov of [45, 62, 90]) for (const at of [[0.2, -0.1, -0.6], [-0.5, 0.3, -1.8], [0, 0, -3.5]]) {
    const tanH = Math.tan(fov / 2 * Math.PI / 180), tanV = tanH * 9 / 16;
    const img = shape.map((p) => M.project(M.add(p, at), tanH, tanV));
    const t = M.solveT(shape, img, tanH, tanV);
    worst = Math.max(worst, t ? M.len(M.sub(t, at)) : 9);
    // a pixel of jitter on a 1280-wide picture, and a third of the points unseen
    const w = shape.map((_, i) => (i % 3 ? 1 : 0)), noisy = img.map((q) => [q[0] + (rnd() - 0.5) / 640, q[1] + (rnd() - 0.5) / 360]);
    const tn = M.solveT(shape, noisy, tanH, tanV, w);
    worstN = Math.max(worstN, tn ? M.len(M.sub(tn, at)) / -at[2] : 9);
  }
  check(worst < 1e-9, `solveT finds a projected shape again (worst ${worst.toExponential(1)} m)`);
  check(worstN < 0.06, `solveT with a pixel of jitter and a third of the points gone: within ${(worstN * 100).toFixed(1)}% of the distance`);
  check(M.solveT(shape.slice(0, 2), shape.slice(0, 2), 1, 1) === null, 'solveT wants three points');
}

// ---- the filter
{
  const f = M.oneEuro(1.5, 4);
  let y = 0;
  for (let i = 0; i < 120; i++) y = f.filter(1 + (rnd() - 0.5) * 0.01, i / 30);
  check(Math.abs(y - 1) < 0.004, 'the filter settles on a still value through its jitter');
  const g = M.oneEuro(1.5, 4); let lag = 0;
  for (let i = 0; i < 60; i++) { const x = i / 30 * 2; lag = x - g.filter(x, i / 30); } // 2 m/s
  check(lag < 0.06, `the filter follows a hand at 2 m/s (${(lag * 100).toFixed(1)} cm behind)`);
  const pf = M.pointFilter();
  check(pf.filter([[1, 2, 3]], 0)[0].join() === '1,2,3' && pf.filter([[9, 9, 9]], 5)[0].join() === '9,9,9', 'a set of points starts afresh after a gap');
}

// ---- the hand: open or closed
{
  // a hand of four fingers, each three bones bent by `c` of a fist's angles, as js/mocap.ts makes the demo's
  const hand = (c) => { const p = [[0, 0, 0], [0, 0, 0], [0, 0, 0], [0, 0, 0], [0, 0, 0]]; for (const x of [0.025, 0.003, -0.017, -0.035]) { let at = [x, 0.09, 0], a = 0; p.push(at); for (const [l, b] of [[0.042, 80], [0.026, 100], [0.021, 70]]) { a += b * c * Math.PI / 180; at = [at[0], at[1] + l * Math.cos(a), at[2] + l * Math.sin(a)]; p.push(at); } } return p; };
  const cs = [0, 0.25, 0.5, 0.75, 1].map((c) => M.curl(hand(c)));
  check(cs[0] < 0.02 && cs[4] > 0.95 && cs.every((c, i) => !i || c > cs[i - 1]), `curl runs from a flat hand to a fist (${cs.map((c) => c.toFixed(2)).join(' ')})`);
  const g = M.grabber();
  check([0.2, 0.5, 0.6, 0.45, 0.4, 0.3, null].map((c) => g.step(c)).join() === 'false,false,true,true,true,false,false', 'a grab holds from closed until properly open');
  const s = [['support', 0], ['support', 0], [null, 0], ['mag', 0], ['mag', 1], ['mag', 1], [null, 1], ['rig', 1], ['rig', 0], ['rig', 0], ['rig', 1], [null, 1], ['support', 1]].flatMap(([zone, g], i) => [0, 1, 2].map((k) => ({ t: (i * 3 + k) / 10, zone, g: !!g })));
  const v = M.visitsOf(s, 0.6, 3.6, 'support');
  check(v.length === 2 && Math.abs(v[0].g0 - 0.6) < 1e-9 && v[0].g1 === null && Math.abs(v[1].g1 - 1.8) < 1e-9 && Math.abs(v[1].g0 - 2.4) < 1e-9, 'a beat has when the hand closed in it and when it opened: taken at the magazine, stowed then a fresh one taken at the rig');
}

// ---- zones
{
  const z = { id: 'z', a: [0, 0, -2], b: [0, 0, -2], r: 0.1 };
  check(Math.abs(M.zoneRatio([0.1, 0, -2], z, 0.5) - 1) < 0.01 && M.zoneRatio([0, 0, -1.82], z, 0.5) < 1 && M.zoneRatio([0, 0, -1.82], z, 1) > 1, 'a zone is deeper along the ray than it is wide');
  const cap = { id: 'c', a: [-0.1, 0, -1], b: [0.1, 0, -1], r: 0.05 };
  check(M.zoneRatio([0.05, 0.04, -1], cap, 1) < 1 && M.zoneRatio([0.2, 0, -1], cap, 1) > 1, 'a capsule holds what is beside its core, not what is past its end');
}

// ---- the tracker
{
  const tr = M.tracker(); let t = 0; const run = (rs) => rs.map((r) => tr.step((t += 1 / 30), r));
  check(run([{ a: 0.5, b: 3 }, { a: 0.5, b: 3 }, { a: 0.5, b: 3 }]).pop() === 'a', 'into a zone once it has held');
  check(run([{ a: 1.1, b: 3 }, { a: 0.95, b: 3 }, { a: 1.2, b: 3 }, { a: 1.25, b: 3 }]).every((z) => z === 'a'), 'kept at its edge');
  check(run([{ a: 1.5, b: 2 }, { a: 1.8, b: 1.6 }, { a: 2, b: 1.4 }]).pop() === null, 'let go between zones');
  check(run([{ a: 3, b: 0.8 }, { a: 3, b: 0.6 }, { a: 3, b: 0.5 }]).pop() === 'b', 'and into the next');
  check(run([{ a: 0.3, b: 0.9 }, { a: 0.2, b: 1 }, { a: 0.2, b: 1.1 }]).pop() === 'a', 'straight into a nearer zone from one it is still in');
  check(run([null, null, null]).pop() === 'a' && run(Array(12).fill(null)).pop() === null, 'a hand lost for a moment is where it was; for longer, nowhere');
}

// ---- takes
{
  const stream = (spans) => { const out = []; let t = 0; for (const [zone, d] of spans) for (let i = 0; i < Math.round(d * 30); i++) out.push({ t: (t += 1 / 30), zone, p: [t, 0, 0] }); return out; };
  const feed = (spans) => { const c = M.takes({ home: 'support' }), ev = []; for (const s of stream(spans)) { const e = c.step(s); if (e) ev.push(e); } return ev; };
  const ev = feed([['support', 1], [null, 0.2], ['mag', 0.3], [null, 0.3], ['rig', 0.4], [null, 0.3], ['mag', 0.3], [null, 0.05], ['action', 0.05], [null, 0.2], ['support', 1]]);
  const take = ev.length === 2 && ev[1].kind === 'end' ? ev[1].take : null;
  check(ev[0] && ev[0].kind === 'start' && !!take, 'a take starts as the hand leaves the handguard and ends when it is back');
  check(!!take && Math.abs(take.dur - 2.1) < 0.07, `it lasts from leaving to coming back (${take && take.dur.toFixed(2)} s of 2.10)`);
  check(!!take && take.visits.map((v) => v.zone).join() === 'mag,rig,mag', 'its beats are its stops: a zone crossed in a twentieth of a second is not one');
  check(!!take && Math.abs(take.visits[1].t0 - 0.8) < 0.07 && Math.abs(take.visits[1].f1 - 1.2 / 2.1) < 0.04, 'each with its times and its fractions of the whole');
  check(feed([['support', 1], [null, 0.5], ['support', 1]]).map((e) => e.kind).join() === 'start,cancel', 'a hand that goes nowhere makes no take');
  check(feed([['support', 0.1], [null, 0.5], ['mag', 0.5], ['support', 1]]).length === 0, 'nor one that had not rested on the handguard');
  const mine = [{ zone: 'mag' }, { zone: 'belt' }, { zone: 'rig' }, { zone: 'mag' }, { zone: 'action' }], ref = [{ zone: 'mag' }, { zone: 'rig' }, { zone: 'mag' }];
  check(M.compare(mine, ref).map((r) => r.zone + (r.mine ? 1 : 0) + (r.ref ? 1 : 0)).join() === 'mag11,belt10,rig11,mag11,action10', 'two takes pair up beat by beat, in order');
  check(M.compare([{ zone: 'rig' }], ref).map((r) => (r.mine ? 1 : 0) + '' + (r.ref ? 1 : 0)).join() === '01,11,01', 'a beat only one has stands alone');
}

// ---- keys
{
  const A = { 'A.S': [0, 0, -0.35], WB: [0, -0.2, -0.17], 'A.P': [-0.15, -0.25, 0.2] }, legs = [A['A.S'], A.WB, M.add(A.WB, [0, -0.07, 0]), A['A.P'], A.WB, A['A.S']];
  const s = []; let t = 0;
  for (let i = 0; i < legs.length - 1; i++) for (let k = 0; k < 10; k++) s.push({ t: (t += 0.03), zone: null, p: M.add(M.lerp(legs[i], legs[i + 1], k / 10), [(rnd() - 0.5) * 0.004, 0, 0]) });
  s.push({ t: (t += 0.03), zone: null, p: A['A.S'] });
  const keys = M.keysOf(s, s[0].t, t, A, 0.02);
  check(keys.map((k) => k.near).join() === 'A.S,WB,WB,A.P,WB,A.S', `a path's corners are its keys, each by its anchor (${keys.length})`);
  check(/^\[0, A\.S\], \[0\.2, WB\], \[0\.4, off\(WB, 0, -0\.07\)\], \[0\.6, A\.P\], \[0\.8, WB\], \[1, A\.S\]$/.test(M.keysText(keys)), 'written as js/vmanim.ts writes a clip: ' + M.keysText(keys));
}

console.log(bad ? `\n${bad} FAILED` : '\nall passed');
process.exit(bad ? 1 : 0);
