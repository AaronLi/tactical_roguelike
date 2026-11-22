// The space battle stepped in node, with no browser (docs/space-server.md phase D): js/spacesim.ts's SpaceSim.worldStep in a tight
// loop at fixed 1/60 s steps, as fast as the CPU allows, repeatable from a seed. The world is built from a scenario (a boarding
// map, her ship and fit, where she starts) with shapes from data alone (js/hullshape.ts, js/rcstris.ts, assets/models/ships/
// space.json), as js/space.ts setupBoard and ewStep build it from meshes; the crew are scripted: a pilot (hold still, fly to a
// point, or a P/V script), a sensor operator (her scanners on, a track kept on the nearest HOSTILE), a helm (a torpedo at a fix).
//   node tools/space_sim.mjs                  run the golden scenarios, compare with tests/space-golden-node.json (exit 1 on a difference)
//   node tools/space_sim.mjs --update         write it
//   node tools/space_sim.mjs --only pd        one scenario
//   node tools/space_sim.mjs --print pd       print a scenario's per-second fingerprints
//   node tools/space_sim.mjs --metrics 20     the point-defence scenario over seeds 1..20: a table, and the speed
//        [--range 5000] [--map 3,1,1000,small,artifact,0] (seed,level,th,size,obj,wing) [--jobs n] (runs at once: half the cores)
// Each run is a worker thread of its own (its own three: the game's files patch three's prototypes as they load) and a vm context
// in it (tools/vm_game.mjs, the globals the hot loops read made module-locals: its locals), the compiled files loaded afresh, Math.random a mulberry32 from the
// run's seed, the radars' streams from Radar.seed(seed) and the battle's from Radar.rngOf('space'): a run shares nothing with
// the one before. Run `npx tsc -p .` first (npm run test:space does).
import { runScripts, runFile, moduleOf } from './vm_game.mjs'; // (first: it starts node again with what the ES modules need)
import fs from 'node:fs'; import vm from 'node:vm'; import os from 'node:os'; import { Worker, isMainThread, workerData, parentPort } from 'node:worker_threads'; import path from 'node:path'; import { fileURLToPath } from 'node:url';
import * as THREE_NS from 'three';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'), DIST = path.join(ROOT, 'dist/js/');
const GOLDEN = path.join(ROOT, 'tests/space-golden-node.json');
const SHIPS = JSON.parse(fs.readFileSync(path.join(ROOT, 'assets/models/ships/space.json'), 'utf8')).ships;
const DT = 1 / 60;
// (the globals the battle's files read in their loops, made module-locals in the vm: tools/vm_game.mjs locals)
const LOCALS = ['Math', 'THREE', 'Float32Array', 'Float64Array', 'Uint8Array', 'Int16Array', 'Int32Array', 'Uint32Array', 'Array', 'Object', 'Number', 'Map', 'Set', 'JSON', 'Infinity', 'NaN', 'isFinite'];
const argv = process.argv.slice(2), arg = (k, d) => (argv.includes(k) ? argv[argv.indexOf(k) + 1] : d);

function mulberry(a) { return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const fnv = (s) => { let h = 0x811c9dc5; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; } return h.toString(16).padStart(8, '0'); };

// ---------------------------------------------------------------- the game's files, fresh, in a context of their own
async function load(rndSeed) {
  const ctx2d = new Proxy({}, { get: (t, k) => (k in t ? t[k] : () => ({ addColorStop() {} })), set: (t, k, v) => { t[k] = v; return true; } });
  const document = { createElement: () => ({ width: 1, height: 1, getContext: () => ctx2d, style: {} }), body: { prepend() {}, append() {}, appendChild() {} }, addEventListener() {} };
  const ctx = { console, JSON, Set, Map, WeakMap, WeakSet, Object, Array, Number, String, Boolean, Uint8Array, Uint8ClampedArray, Int8Array, Int16Array, Int32Array, Uint16Array, Uint32Array, Float32Array, Float64Array, ArrayBuffer, DataView, Infinity, NaN, isFinite, parseInt, parseFloat, Error, TypeError, RangeError, Symbol, Date, Proxy, Reflect, Promise, BigInt,
    performance: { now: () => 0 }, THREE: { ...THREE_NS }, document, location: { search: '' }, URLSearchParams, addEventListener() {}, setTimeout: () => 0, clearTimeout() {}, setInterval: () => 0, clearInterval() {}, structuredClone, queueMicrotask, TextEncoder, TextDecoder, atob, btoa };
  ctx.window = ctx; ctx.self = ctx; ctx.globalThis = ctx; ctx.G = {};
  vm.createContext(ctx);
  // (the context's own Math, its random a mulberry32 from the seed: nothing that draws on Math.random escapes it. Not an object made
  // from Math: V8 inlines Math.imul, Math.log ... only on a real Math, and the radars' noise is all Math.imul and Math.log)
  vm.runInContext('Math', ctx).random = mulberry(rndSeed);
  await runScripts(ctx, DIST, ['prepentry'], { what: 'npx tsc -p .', locals: LOCALS });
  moduleOf(ctx, DIST + 'util.js').Hooks.hangarDecorate = () => {};
  for (const f of ['radar', 'spacesim', 'hullshape', 'rcstris', 'asteroidshape', 'helm', 'snapcodec', 'spacenet', 'svbattle']) await runFile(ctx, DIST + f + '.js');
  const m = (f) => moduleOf(ctx, DIST + f + '.js');
  return { ctx, T: ctx.THREE, Level: ctx.G.Level, SD: m('spacedata').SpaceData, Radar: m('radar').Radar, SpaceSim: m('spacesim').SpaceSim, HS: m('hullshape'), RT: m('rcstris'), SvBattle: m('svbattle').SvBattle, Helm: m('helm'), ShipGen: ctx.G.ShipGen || m('shipgen').ShipGen };
}

// ---------------------------------------------------------------- a scenario -> a world (js/space.ts setupBoard and ewStep, from data)
// sc: { seed (the battle's: Math.random, the radars, the battle's stream), map: { seed, level, th, size, obj, wing }, ship, fit,
//       start: { r, dir } (her place: the mission ship's middle plus dir * r, facing her), xpdr }
function build(E, sc) {
  const { T, Level, SD, Radar, SpaceSim, HS, RT } = E;
  Radar.seed(sc.seed); // (before any suite: each takes its stream from the seed and its id)
  const W = SpaceSim.world(Radar.rngOf('space'));
  const mp = sc.map, map = Level.generate(mp.seed, mp.level, mp.th, false, { size: mp.size, obj: mp.obj, ship: sc.ship, other: null, wing: !!mp.wing }), sp = map.sp, hb = sp.hull;
  // the zone (setupBoard): her course and the others', the rocks; the level is zone ship 0, her middle zC
  const msDef = { seed: map.seed, size: sp.size, th: SD.themeIndex(map.theme), wing: !!sp.wing, name: mp.name || '' };
  const zdef = SD.zone(msDef);
  W.zone = { zdef, zact: 0, wing: !!sp.wing, zC: new T.Vector3((hb.x0 + hb.x1) / 2, 0, (hb.z0 + hb.z1) / 2), zt0: 0, ztAt: 0 };
  W.rockList = SD.rocks(msDef);
  const obj = mp.obj, wear = SD.wearOf(sp.size, obj), missionAff = wear === 'navy' ? 'navy' : wear === 'pirate' ? 'pirate' : 'civ';
  const hullName = (zdef[0] && zdef[0].name) || mp.name || 'target';
  const kindAff = (c) => (c.k === 0 ? missionAff : c.kind === 'navy' || c.kind === 'wing' ? 'navy' : c.kind === 'pirate' ? 'pirate' : 'civ');
  // the mission ship (ewStep): her suite on her hull box's middle, its mounts fitted onto her plating, her table with the radars' kit
  const sh = HS.HullShape.of(map), ch = RT.hullRcs(map, sh);
  W.foe = ch.su; Radar.sched(W.foe); W.foe.aff = missionAff;
  W.foeT = { sz: ch.sz, kind: 'ship', id: 'hull', p: ch.c.clone(), v: new T.Vector3(), q: new T.Quaternion(), rcs: ch.rcs, aff: missionAff, iff: { c: missionAff === 'navy' ? 'navy' : 'civ', n: hullName }, xon: missionAff !== 'pirate' };
  W.hb = hb; W.foeL = { P: W.foe.P.clone(), Q: W.foe.Q.clone(), Tp: W.foeT.p.clone(), Tq: W.foeT.q.clone() }; // (as her level has her: carried through the zone, js/spacesim.ts worldStep)
  W.guns = sh.guns.map((g, i) => ({ k: g.k, x: g.x, y: ch.fit.guns[i].y, z: g.z, inv: g.inv, hp: g.hp, cool: g.cool }));
  // her crew (js/spaceserver.ts's for a crewed hostile ship: two at gun control, no countdown)
  W.crew = { hostile: obj === 'defend' ? 0 : 1, gn: sh.guns.length ? 2 : 0, arm: null, boom: false };
  // her own ship (space.json: the fit's box and table, as ewStep makes them from her drawing)
  const shipDef = SD.SHIPS[sc.ship], F = SHIPS[sc.ship].fits[sc.fit];
  W.own = Radar.suite('own', F.size, F.top, F.beam, F.bot); Radar.sched(W.own); W.own.aff = 'squad'; W.own.hostNames = new Set([hullName]);
  W.own.scans.forEach((s) => { s.mode = 'off'; }); // (silent till her operator switches them on)
  W.ownT = { sz: F.size, kind: 'ship', id: 'own', p: new T.Vector3(), v: new T.Vector3(), q: new T.Quaternion(), rcs: RT.rcsFromB64(F.rcs), iff: { c: 'squad', n: shipDef.name || 'squad' }, aff: 'squad' };
  W.xpdr = !!sc.xpdr; // (the page's EW.xpdr starts off)
  // (her heading: head, as js/space.ts arriveAt points her out of the jump; her place off the mission ship's middle: dir in her own frame, r away)
  W.ship.Q.setFromRotationMatrix(new T.Matrix4().lookAt(new T.Vector3(), new T.Vector3(...(sc.start.head || [-0.15, -0.08, -1])).normalize(), new T.Vector3(0, 1, 0)));
  const dir = new T.Vector3(...(sc.start.dir || [-0.87, -0.1, 0.5])).normalize().applyQuaternion(W.ship.Q);
  W.ship.P.copy(ch.c).addScaledVector(dir, sc.start.r); W.ship.V.set(0, 0, 0);
  W.ship.size = F.size; W.ship.docked = false; W.ship.ftl = false;
  // the zone's other ships: their stand-ins' shapes when first seen (js/space.ts trafficTargets, the stand-in: real false)
  W.traffic = zdef.filter((c) => c.k !== 0).map((c) => ({ c, shape: null }));
  W.trafficShape = (c) => {
    const s = HS.TrafficShape.of(c.kind, c.seed), b = s.bbox, a = s.bboxAll, sz = [0, 1, 2].map((k) => b.max[k] - b.min[k]), all = [0, 1, 2].map((k) => a.max[k] - a.min[k]);
    return { rcs: RT.rcsOfTris(s.exact, s.flags), sz: Math.max(4, Math.max(...all) / 2), long: sz[2], wide: sz[0], tall: sz[1], ctr: new T.Vector3((b.min[0] + b.max[0]) / 2, (b.min[1] + b.max[1]) / 2, (b.min[2] + b.max[2]) / 2), real: false };
  };
  return { W, map, kindAff, tube: new T.Vector3(...F.tube), hullName, missionAff, TP: { n: 1 }, lv: { P: W.ship.P.clone(), Q: W.ship.Q.clone(), V: W.ship.V.clone() } }; // (lv: her pose in the level's frame, as the pilot flies her)
}

// ---------------------------------------------------------------- the crew, scripted
// the pilot: { k: 'hold' } (still in the level's frame), { k: 'goto', to: [x, y, z] | 'hull', off, v, a } (accelerates at a to at most
// v, brakes to stop there), { k: 'script', f(t, ship, T) } (sets P, V, Q itself). face: her nose kept on the mission ship, else as she was
// (her pose's the level's, as a pilot flies her (B.lv): brought into the battle's frame, the zone's, as each step begins: run)
function pilotStep(E, B, pl, dt) {
  const { T } = E, S = B.lv, W = B.W, hullP = W.foeL ? W.foeL.Tp : W.foeT.p;
  if (!pl || pl.k === 'hold') { S.V.set(0, 0, 0); }
  else if (pl.k === 'goto') {
    const to = pl.to === 'hull' ? hullP.clone().add(new T.Vector3(...(pl.off || [0, 0, 0]))) : new T.Vector3(...pl.to), d = to.sub(S.P), L = d.length(), a = pl.a || 30;
    const want = L > 0.5 ? d.multiplyScalar(Math.min(pl.v || 100, Math.sqrt(2 * a * L * 0.8)) / L) : new T.Vector3(), dv = want.sub(S.V), m = a * dt;
    if (dv.length() > m) dv.setLength(m); S.V.add(dv); S.P.addScaledVector(S.V, dt);
  } else if (pl.k === 'script') pl.f(W.t, S, T);
  if (pl && pl.face && S.P.distanceTo(hullP) > 1) S.Q.setFromRotationMatrix(new T.Matrix4().lookAt(S.P, hullP, new T.Vector3(0, 1, 0))); // (face: her nose on the mission ship)
}
// the sensor operator: her scanners on (at on, s), then (keep) a track kept (Radar.want, her pick: pri 1, op) on the nearest HOSTILE
// belief she isn't keeping already, looked at once a second (as a person would)
function sensorStep(E, B, so) {
  const { Radar } = E, W = B.W, own = W.own;
  if (!so) return;
  if (W.t >= (so.on || 0)) own.scans.forEach((s) => { if (s.mode === 'off') s.mode = 'round'; });
  if (!so.keep || W.t < (so.next || 0)) return; so.next = W.t + 1;
  let best = null, bd = Infinity;
  for (const a of own.ass) if (a.cls === 'HOSTILE' && a.f) { const d = a.f.pl.distanceTo(W.ship.P); if (d < bd) { bd = d; best = a; } }
  if (!best) return;
  const S0 = Radar.sched(own); if (S0.tts.some((q) => q.op && q.bel === best.f.n)) return;
  Radar.want(own, { f: best.f, plot: best.plot, pri: 1, op: true }, W.t);
}
// the helm: a torpedo (js/space.ts torpFire / torpNew) at a fix of hers near the mission ship (within 600 m: a 3D fix of her), once,
// at or after at s. Returns the torpedo
function helmStep(E, B, hm) {
  const { T } = E, W = B.W;
  if (!hm || hm.done || W.t < (hm.at || 0)) return null;
  const f = W.own.fus.find((q) => q.pl.distanceTo(W.foeT.p) < 600); if (!f) return null;
  hm.done = true;
  const S = W.ship, id = 1000 + B.TP.n++, p = B.tube.clone().applyQuaternion(S.Q).add(S.P), v = S.V.clone().addScaledVector(new T.Vector3(0, -1, 0).applyQuaternion(S.Q), E.SpaceSim.TORP.eject), q = S.Q.clone();
  const tp = { id, p: p.clone(), v: v.clone(), q: q.clone(), ph: 0, t: 0, fus: f.n, est: f.pl.clone(), ev: f.v.clone(), side: new T.Vector3(), mine: true, lock: '', thr: 0, rcs: false, lf: new T.Vector3(),
    rt: { sz: 3, kind: 'torpedo', id: 'torp' + id, p: p.clone(), v: v.clone(), q: q.clone(), rcs: { s: new Float32Array(1), max: 0, mean: 0 }, iso: 1.5, iff: { c: 'squad', n: 'TORP ' + (id % 1000) }, aff: 'squad', only: 'squad' } };
  W.torps.push(tp); return tp;
}

// ---------------------------------------------------------------- a fingerprint of a second
const r2 = (x) => (Math.round(x * 100) / 100).toFixed(2), r4 = (x) => String(Math.round(x * 1e4) / 1e4);
const v3 = (v) => r4(v.x) + ',' + r4(v.y) + ',' + r4(v.z);
const CLS = ['HOSTILE', 'SUSPECT', 'WATCH', 'NEUTRAL', 'CIV', 'FRIENDLY'];
function suiteFp(E, su) {
  const cons = su.scans.map((s) => s.cons.length).join('+'), cl = CLS.map((c) => su.ass.filter((a) => a.cls === c).length).join('');
  const S0 = su.sched, tts = S0 ? S0.tts.map((q) => q.n + ':' + (q.tgt || '-') + ':' + r2(q.est.q)).join(';') : '';
  const trk = su.trks.map((t) => t.st[0] + ':' + (t.tgt || '-')).join(';');
  const deep = su.fus.map((f) => f.n + '@' + v3(f.pl)).join(';') + '|' + su.ass.map((a) => a.n + a.cls[0] + r2(a.r)).join(';');
  return `c${cons} b${su.fus.length} a${su.ass.length}[${cl}] tr{${trk}} tt{${tts}} #${fnv(deep)}`;
}
function fingerprint(E, B, ev) {
  const W = B.W, S = W.ship;
  const parts = [String(Math.round(W.t)), 'P ' + v3(S.P) + ' V ' + v3(S.V)];
  parts.push('own ' + suiteFp(E, W.own), 'foe ' + suiteFp(E, W.foe));
  for (const q of W.traffic) if (q.su) parts.push(q.su.id + ' ' + suiteFp(E, q.su));
  parts.push(`torp ${W.torps.length} #${fnv(W.torps.map((t) => t.id + ':' + t.ph + ':' + v3(t.p) + ':' + (t.lock || '-')).join(';'))}`);
  parts.push(`mis ${W.mis.length} #${fnv(W.mis.map((m) => m.id + ':' + v3(m.p)).join(';'))}`);
  parts.push(`rnd ${W.rounds.length} #${fnv(W.rounds.map((q) => v3(q.p)).join(';'))}`);
  parts.push(`chaff ${W.chaff.length} guns ${W.guns.map((g) => g.hp).join(',')} fc ${W.fc ? W.fc.id + ':' + W.fc.n : '-'}`);
  const kinds = {}; for (const e of ev) kinds[e.k] = (kinds[e.k] || 0) + 1;
  parts.push(`ev ${Object.entries(kinds).map(([k, n]) => k + ':' + n).join(',') || '-'} #${fnv(ev.map(evStr).join(';'))}`);
  return parts.join(' | ');
}
const evStr = (e) => e.k + ':' + (e.k === 'damage' ? r4(e.dmg) + ':' + e.hits : e.k === 'missile' ? e.m.id : e.k === 'missileEnd' ? e.id + ':' + e.hit : e.k === 'torpEnd' ? e.id + ':' + e.how + ':' + (e.on || '') : e.k === 'gunHit' ? e.i : e.p ? v3(e.p) : '');

// ---------------------------------------------------------------- a run
// o: { fp: fingerprint every second, pd: the point-defence timeline }. Returns { fps, pd, steps, wall, setup }
async function run(sc, o = {}) {
  const t0 = performance.now(), E = await load(sc.seed), B = build(E, sc), W = B.W, T = E.T, Radar = E.Radar;
  const tl = performance.now();
  const fps = [], pd = { fix: null, launch: null, hostile: null, track: null, burst: null, end: null, how: null, on: null, minR: Infinity, dmg: 0, hits: 0 };
  const hm = sc.helm ? { ...sc.helm } : null, so = sc.sensors ? { ...sc.sensors } : null;
  let ev = [], tp = null, steps = 0, next = 1, rounds0 = 0;
  const N = Math.round(sc.secs / DT);
  for (let i = 0; i < N; i++) {
    pilotStep(E, B, sc.pilot, DT); sensorStep(E, B, so);
    const fired = helmStep(E, B, hm); if (fired) { tp = fired; pd.launch = W.t; }
    rounds0 = W.rounds.length;
    E.SpaceSim.worldStep(W, DT, { kindAff: B.kindAff, fix: (t) => W.own.fus.find((q) => q.n === t.fus) || null, ship: (L) => { L.toZ(B.lv.P, W.ship.P); W.ship.Q.copy(L.qz).multiply(B.lv.Q); L.vToZ(B.lv.P, B.lv.V, W.ship.V); } });
    steps++;
    for (const e of W.out) {
      ev.push(e);
      if (e.k === 'damage') { pd.dmg += e.dmg; pd.hits += e.hits; }
      if (tp && e.k === 'torpEnd' && e.id === tp.id && pd.end == null) { pd.end = W.t - pd.launch; pd.how = e.how; pd.on = e.on || null; }
    }
    W.out.length = 0;
    if (pd.fix == null && W.own.fus.some((q) => q.pl.distanceTo(W.foeT.p) < 600)) pd.fix = W.t;
    if (tp && pd.end == null) { // (the mission ship's picture of the torpedo: js/space.ts tools/space_steps/torpedo_defence.mjs's marks)
      const rel = W.t - pd.launch, id = tp.rt.id, isT = (x) => x === id;
      pd.minR = Math.min(pd.minR, tp.p.distanceTo(W.foe.P));
      const ids = (a) => [a.c && a.c.p.id, a.f && a.f.a && a.f.a.p.id, a.f && a.f.b && a.f.b.p.id, a.f && a.f.trk && a.f.trk.tgt].filter(Boolean);
      if (pd.hostile == null && W.foe.ass.some((a) => a.cls === 'HOSTILE' && ids(a).some(isT))) pd.hostile = rel;
      // (a track of hers good enough for her guns (q 0.15: what they'll fire on) where the torpedo is: her tracks are by place, a tracker's tgt only while it's on it)
      if (pd.track == null && Radar.sched(W.foe).tts.some((q) => q.est.q >= 0.15 && q.est.p && q.est.p.distanceTo(tp.p) < Math.max(150, 0.05 * tp.p.distanceTo(W.foe.P)))) pd.track = rel;
      if (pd.burst == null && W.rounds.length > rounds0) pd.burst = rel;
    }
    if (o.fp && W.t >= next - 1e-9) { fps.push(fingerprint(E, B, ev)); ev = []; next++; }
    if (o.stopWhenDone && tp && pd.end != null && W.t - pd.launch > pd.end + 1) break;
  }
  const t1 = performance.now();
  return { fps, pd, steps, simS: steps * DT, wall: (t1 - tl) / 1000, setup: (tl - t0) / 1000 };
}

// ---------------------------------------------------------------- a run of the server's own battle (docs/space-server.md C3)
// The world made and stepped by js/svbattle.ts as the host's server worker does it, her helm flown on it from a scripted pilot's steps
// (sin: as the pilot's page sends them, js/space.ts c2Post), what the host would do on its events stood in for (hc: docking, jumping,
// another ship made the level). sc.pilot: { k: 'breach', out: metres } (from that far out from a breach site, square to it, W held).
// Fingerprinted every second: her helm (pose, way, modes, docked) and the battle's events.
async function runServer(sc, o = {}) {
  const t0 = performance.now(), E = await load(sc.seed), { T, Level, SD, Radar, SvBattle, Helm } = E;
  SvBattle.useSpace({ ships: SHIPS }); SvBattle.reset();
  Radar.seed(sc.seed);
  const mp = sc.map, map = Level.generate(mp.seed, mp.level, mp.th, false, { size: mp.size, obj: mp.obj, ship: sc.ship, other: null, wing: !!mp.wing }), sp = map.sp;
  const zms = { seed: map.seed, size: sp.size, th: SD.themeIndex(map.theme), wing: !!sp.wing, name: mp.name || '' }, ms = { size: mp.size, obj: mp.obj, name: 'test' };
  const fleet = { ship: sc.ship, owned: [sc.ship], fit: { [sc.ship]: sc.fit === 'g' ? ['pd'] : sc.fit === 'r' ? ['rail'] : [] } };
  const B = SvBattle.make(map, zms, 0, ms, fleet, null, 'board');
  const got = { docked: false, dockAt: null, events: {} };
  const hc = { fleet, board: { seed: 1, level: 1, picked: [], done: [] }, gone: () => false, raid: [], done: false, say() {}, jump() {}, tboard() {}, warm() {}, ready: () => false,
    docked: false, at: null, near: false, act: 0, site: null, shipName: 'test', dock: (on) => { got.docked = on; return on; } };
  const crew = { hostile: 0, gn: 0, arm: null, boom: false }; // (her guns held: the breach alone)
  // the pilot: her start as a state of her helm (from that far out from the site her nose line meets, square to it, at 20 m/s), then W
  const def = SD.SHIPS[sc.ship], site = E.ShipGen.sites(map).sort((a, b) => b.nz - a.nz || a.c - b.c).find((st) => true), TS = Level.TS;
  const fx = site.x + site.nx * TS / 2, fz = site.z + site.nz * TS / 2, P = new T.Vector3(fx + site.nx * sc.pilot.out, 0.2, fz + site.nz * sc.pilot.out);
  const Q = new T.Quaternion().setFromRotationMatrix(new T.Matrix4().lookAt(new T.Vector3(), new T.Vector3(-site.nx, 0, -site.nz), new T.Vector3(0, 1, 0)));
  const b = Helm.helmBerth('board', map, def), Dq = new T.Quaternion().setFromAxisAngle(new T.Vector3(0, 1, 0), b.yaw);
  const S0 = { P, Q, V: new T.Vector3(-site.nx * 20, 0, -site.nz * 20), Wv: new T.Vector3(), stick: new T.Vector2(), tv: new T.Vector3(), tvP: new T.Vector3(), tvJ: -1, docked: false, spin: 0, cruise: false, roundBrake: false, brThrust: false, match: null, tgt: 0, berth: b, Dp: new T.Vector3(b.x, b.y, b.z), Dq, warp: null, auto: null, brLock: null, brRound: null, stage: 'space', thru: null, ftl: null };
  const zm = { vz: new T.Vector3(), v: new T.Vector3(NaN, 0, 0) };
  let zt = 0, n = 0;
  const send = (e) => SvBattle.request(B, { t: 'sin', by: 'node', a: [e] });
  send({ s: 0, st: Helm.helmPack(S0, zm), turn: def.turn });
  const fps = [], N = Math.round(sc.secs / DT); let next = 1, ev = [];
  const r3 = (v) => v.toFixed(3);
  for (let i = 0; i < N; i++) {
    n++; zt += DT;
    send({ s: n, i: [1, 1 /* W */, 0, 0], tg: null, m: null, zt }); // (the pilot's step: at the helm, W held)
    SvBattle.step(B, DT, n, crew, got.docked, zt, () => null, hc);
    for (const e of B.W.out) ev.push(e.k);
    const H = SvBattle.helmState();
    if (got.docked && got.dockAt == null) got.dockAt = +(i * DT).toFixed(3);
    if (o.fp && (i + 1) * DT >= next - 1e-9) { const k = {}; for (const x of ev) k[x] = (k[x] || 0) + 1; ev = [];
      fps.push([next, [H.P.x, H.P.y, H.P.z, H.Q.x, H.Q.y, H.Q.z, H.Q.w, H.V.x, H.V.y, H.V.z].map(r3).join(','), [H.brLock ? 'lock' : '', H.brRound ? 'round' : '', H.auto ? 'auto' : '', H.docked ? 'docked' : '', got.docked ? 'HOST-DOCKED' : ''].filter(Boolean).join('+'), JSON.stringify(k)].join(' | ')); next++; }
  }
  const t1 = performance.now();
  return { fps, pd: { dockAt: got.dockAt, docked: got.docked, dmg: 0, hits: 0, launch: null, server: true }, steps: N, simS: N * DT, wall: (t1 - t0) / 1000, setup: 0 };
}

// ---------------------------------------------------------------- the scenarios
const MAP0 = { seed: 3, level: 1, th: 1000, size: 'small', obj: 'artifact', wing: 0 };
const pdScenario = (seed, range = 5000, map = MAP0) => ({ name: 'pd', seed, map, ship: 'kestrel', fit: 'g', start: { r: range, dir: [-0.87, -0.1, 0.5] }, pilot: { k: 'hold' }, sensors: { on: 0 }, helm: { at: 1.5 }, secs: 60 });
const SCENARIOS = [
  // the breach, on the server's own battle and helm: from 150 m out, square to a site, W held: breached, laid in, docked (tools/space_steps/breach_fp.mjs in the game)
  { name: 'breach', server: true, seed: 3, map: MAP0, ship: 'kestrel', fit: 'g', pilot: { k: 'breach', out: 150 }, secs: 6 },
  // a torpedo at the mission ship from 5 km, her point defence against it (tools/space_steps/torpedo_defence.mjs)
  { ...pdScenario(1), secs: 45 },
  // flying in on her from 7 km at up to 150 m/s to 600 m off her beam, her operator keeping a track on what's HOSTILE; the mission ship's guns and missiles at her
  { name: 'approach', seed: 2, map: { seed: 7, level: 2, th: 1002, size: 'medium', obj: 'artifact', wing: 0 }, ship: 'kestrel', fit: 'g', start: { r: 7000, dir: [0.3, 0.15, 1] }, pilot: { k: 'goto', to: 'hull', off: [0, 60, 600], v: 150, a: 30 }, sensors: { on: 0.5, keep: true }, secs: 60 },
];

// a scenario from what's sent to a worker (data only: a scenario with a pilot script is run with run() in this thread)
const scenarioOf = (spec) => (spec.name ? SCENARIOS.find((s) => s.name === spec.name) : pdScenario(spec.pd, spec.range, spec.map));
// A run in a worker thread of its own: its own three (node's three is a module; the game's files patch its prototypes as they load,
// js/lightgrid.ts receiveShadow), its own vm context, nothing shared with any other run
function runIsolated(spec, o) {
  return new Promise((res, rej) => {
    const w = new Worker(new URL(import.meta.url), { workerData: { spaceSim: true, spec, o } });
    w.once('message', res); w.once('error', rej); w.once('exit', (c) => { if (c) rej(new Error('worker exit ' + c)); });
  });
}
export { load, build, run, runServer, runIsolated, SCENARIOS, pdScenario, pilotStep, sensorStep, helmStep, fingerprint, DT };

if (!isMainThread && workerData && workerData.spaceSim) {
  const sc = scenarioOf(workerData.spec), r = await (sc.server ? runServer : run)(sc, workerData.o);
  parentPort.postMessage(r);
}
const MAIN = isMainThread && !!process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
const pad = (s, n) => String(s).padStart(n);
const f1 = (x) => (x == null || x === Infinity ? '-' : x.toFixed(2));
if (MAIN && argv.includes('--metrics')) {
  const n = +arg('--metrics', 20), range = +arg('--range', 5000), mapArg = arg('--map', null), jobs = Math.max(1, +arg('--jobs', Math.max(1, Math.min(n, Math.floor(os.availableParallelism() / 2)))));
  const map = mapArg ? (([seed, level, th, size, obj, wing]) => ({ seed: +seed, level: +level, th: +th, size, obj, wing: +wing }))(mapArg.split(',')) : MAP0;
  console.log(`point defence: one torpedo at the mission ship from ${range} m (map ${Object.values(map).join(',')}), seeds 1..${n}, ${jobs} at a time; times from launch, s`);
  console.log(['seed', 'fix', 'HOSTILE', 'gun trk', 'burst', 'end', 'how', 'minR', 'her dmg', 'sim s', 'x real'].map((h, i) => pad(h, i ? 8 : 4)).join(' '));
  const HOW = { 1: 'SHOT', 2: 'HIT', 3: 'spent' };
  const T0 = performance.now(), res = new Array(n); let k = 0;
  await Promise.all(Array.from({ length: jobs }, async () => { while (k < n) { const s = ++k; res[s - 1] = await runIsolated({ pd: s, range, map }, { stopWhenDone: true }); } }));
  const wallAll = (performance.now() - T0) / 1000;
  let sim = 0, wall = 0, steps = 0, setup = 0;
  res.forEach((r, i) => {
    sim += r.simS; wall += r.wall; steps += r.steps; setup += r.setup; const p = r.pd;
    console.log([pad(i + 1, 4), ...[p.fix, p.hostile, p.track, p.burst, p.end].map((x) => pad(f1(x), 8)), pad(p.how ? HOW[p.how] + (p.how === 2 ? ':' + p.on : '') : 'none', 8), pad(p.minR == null || p.minR === Infinity ? '-' : Math.round(p.minR), 8), pad(p.dmg.toFixed(1), 8), pad(r.simS.toFixed(1), 8), pad((r.simS / r.wall).toFixed(1), 8)].join(' '));
  });
  const rows = res.map((r) => r.pd), cnt = (h) => rows.filter((p) => p.how === h).length;
  const mean = (key) => { const v = rows.map((p) => p[key]).filter((x) => x != null); return v.length ? (v.reduce((a, b) => a + b, 0) / v.length).toFixed(2) + ` (${v.length})` : '-'; };
  console.log(`shot down ${cnt(1)}/${n}, hit ${cnt(2)} (${[...new Set(rows.filter((p) => p.how === 2).map((p) => p.on))].join(', ')}), spent ${cnt(3)}, none ${rows.filter((p) => p.how == null).length}; mean HOSTILE ${mean('hostile')}, gun track ${mean('track')}, first round ${mean('burst')}`);
  console.log(`speed: one battle ${(steps / wall).toFixed(0)} steps/s = ${(sim / wall).toFixed(1)} sim s per wall s (setup ${(setup / n).toFixed(2)} s a run, not counted); all ${n}: ${sim.toFixed(0)} sim s in ${wallAll.toFixed(1)} s wall on ${jobs} threads (${(sim / wallAll).toFixed(1)}x real time)`);
  process.exit(0);
}

if (MAIN) {
  const UPDATE = argv.includes('--update'), ONLY = arg('--only', null) || arg('--print', null), PRINT = argv.includes('--print');
  const golden = fs.existsSync(GOLDEN) ? JSON.parse(fs.readFileSync(GOLDEN, 'utf8')) : {};
  let bad = 0; const out = {};
  for (const sc of SCENARIOS) {
    if (ONLY && sc.name !== ONLY) continue;
    const r = await runIsolated({ name: sc.name }, { fp: true }); out[sc.name] = r.fps;
    console.log(`${sc.name}: ${r.steps} steps, ${r.simS.toFixed(0)} sim s in ${r.wall.toFixed(2)} s (${(r.simS / r.wall).toFixed(1)}x real time, ${(r.steps / r.wall).toFixed(0)} steps/s; setup ${r.setup.toFixed(2)} s); ${r.pd.server ? (r.pd.docked ? 'docked by the host at ' + r.pd.dockAt + ' s' : 'not docked') : `damage to her ${r.pd.dmg.toFixed(1)} (${r.pd.hits} hits)`}${r.pd.launch != null ? `; torpedo: ${r.pd.how ? ['', 'shot down', 'hit ' + r.pd.on, 'spent'][r.pd.how] : 'still going'}` : ''}`);
    if (PRINT) { for (const l of r.fps) console.log('  ' + l); continue; }
    if (UPDATE) continue;
    const g = golden[sc.name];
    if (!g) { console.log(`  no golden for ${sc.name} (--update)`); bad++; continue; }
    const k = r.fps.findIndex((l, i) => l !== g[i]);
    if (k >= 0 || g.length !== r.fps.length) { bad++; const i = k >= 0 ? k : Math.min(g.length, r.fps.length); console.log(`  DIFFERS at second ${i + 1}:\n    golden ${g[i]}\n    now    ${r.fps[i]}`); }
    else console.log(`  matches the golden (${g.length} seconds)`);
  }
  if (UPDATE && !PRINT) { const all = { ...golden, ...out }; fs.writeFileSync(GOLDEN, JSON.stringify(all, null, 1) + '\n'); console.log('wrote ' + path.relative(ROOT, GOLDEN)); }
  process.exit(bad ? 1 : 0);
}
