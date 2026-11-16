// The determinism check (docs/modules-plan.md: no phase changes behaviour): the host's simulation (js/server.ts and what
// the server's thread loads with it, js/serverworker.ts SERVER_SCRIPTS) run in node from fixed seeds, with a scripted
// officer walking the level, shouting and firing, and what it does fingerprinted every second of the level's time: each
// suspect's and civilian's state (where they are, which way they face, what they're doing, their health), the doors, and
// every message the simulation sends. The same code gives the same fingerprints exactly; a refactor that changes
// anything the simulation does, or the order it draws its random numbers in, shows as the first second that differs.
//   node tools/check_sim_golden.mjs            compare with tests/sim-golden.json
//   node tools/check_sim_golden.mjs --update   write it (after a change that's meant to change the simulation)
//   node tools/check_sim_golden.mjs --only warehouse   one scenario
// Math.random is a seeded generator here (the simulation's own randomness: a suspect's choices, its aim), timers run on
// the level's clock (G.Server.overBlack's wait), and three.js is node's copy (some files use its maths). Each run is a vm context of its
// own with the compiled files (ES modules and scripts: tools/vm_game.mjs) loaded in it afresh, so a run shares nothing with the one before.
// Run `tsc` first (npm run test:sim does).
import { runScripts } from './vm_game.mjs'; // (first: it starts node again with what the ES modules need)
import fs from 'node:fs'; import vm from 'node:vm'; import path from 'node:path'; import crypto from 'node:crypto'; import { fileURLToPath } from 'node:url';
import * as THREE_NS from 'three';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'), DIST = path.join(ROOT, 'dist/js/');
const GOLDEN = path.join(ROOT, 'tests/sim-golden.json');
const argv = process.argv.slice(2), UPDATE = argv.includes('--update'), ONLY = argv.includes('--only') ? argv[argv.indexOf('--only') + 1] : null;
const SCRIPTS = (() => { const t = fs.readFileSync(path.join(ROOT, 'js/serverworker.ts'), 'utf8'), i = t.indexOf('SERVER_SCRIPTS ='), a = t.indexOf('[', i), b = t.indexOf(']', a); return [...t.slice(a, b).matchAll(/'([\w-]+)'/g)].map((m) => m[1]); })();

// name, the level (theme by name, level number, night), the seed of the level and of Math.random, seconds to run
const SCENARIOS = [
  { name: 'warehouse', th: 'Warehouse', lvl: 3, seed: 1101, rnd: 7, secs: 60 },
  { name: 'apartment-night', th: 'Apartment', lvl: 4, seed: 2202, rnd: 11, secs: 60, night: true },
  { name: 'research-leader', th: 'Research Lab', lvl: 6, seed: 3303, rnd: 13, secs: 60, leader: true },
  // a boarding (js/spaceserver.ts): a transport carrying an artifact, docked against, her crew's response and shelter drill
  { name: 'board-artifact', board: { kind: 'board', size: 'transport', obj: 'artifact', diff: 3 }, seed: 4404, rnd: 17, secs: 60 },
];
const DT = 1 / 60;

function mulberry(a) { return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const hash = (s) => crypto.createHash('sha1').update(s).digest('hex').slice(0, 12);

/** the simulation, fresh, in a context of its own (a whole new module graph in it: tools/vm_game.mjs, so nothing is shared between two runs): its randomness seeded, its timers on a clock we move */
async function load(rndSeed) {
  const ctx2d = new Proxy({}, { get: (t, k) => (k in t ? t[k] : () => ({ addColorStop() {} })), set: (t, k, v) => { t[k] = v; return true; } });
  const document = { createElement: () => ({ width: 1, height: 1, getContext: () => ctx2d, style: {} }), body: { prepend() {}, append() {}, appendChild() {} }, addEventListener() {} };
  const M = Object.create(Math); M.random = mulberry(rndSeed);
  const timers = []; let now = 0, tid = 1;
  const setTimeout = (fn, ms = 0) => { const id = tid++; timers.push({ id, at: now + ms / 1000, fn }); return id; };
  const clearTimeout = (id) => { const i = timers.findIndex((t) => t.id === id); if (i >= 0) timers.splice(i, 1); };
  const clock = { now: () => now * 1000 };
  const ctx = { console, Math: M, JSON, Set, Map, WeakMap, WeakSet, Object, Array, Number, String, Boolean, Uint8Array, Uint8ClampedArray, Int8Array, Int16Array, Int32Array, Uint16Array, Uint32Array, Float32Array, Float64Array, ArrayBuffer, DataView, Infinity, NaN, isFinite, parseInt, parseFloat, Error, TypeError, RangeError, Symbol, Date, Proxy, Reflect, Promise, BigInt,
    performance: clock, THREE: { ...THREE_NS }, document, location: { search: '' }, URLSearchParams, addEventListener() {}, setTimeout, clearTimeout, setInterval: () => 0, clearInterval() {}, structuredClone, queueMicrotask, TextEncoder, TextDecoder, atob, btoa };
  ctx.window = ctx; ctx.self = ctx; ctx.globalThis = ctx; ctx.G = {};
  vm.createContext(ctx);
  await runScripts(ctx, DIST, SCRIPTS, { what: 'npm run test:sim does' });
  const advance = (dt) => { now += dt; for (;;) { timers.sort((a, b) => a.at - b.at || a.id - b.id); const t = timers[0]; if (!t || t.at > now) break; timers.shift(); t.fn(); } };
  return { G: ctx.G, advance, time: () => now };
}

// (numbers kept to 1e-6: the same code gives the same bits, but a digest that printed them in full would be unreadable)
const r6 = (v) => (typeof v === 'number' && Number.isFinite(v) ? Math.round(v * 1e6) / 1e6 : v);
function enemyDigest(e) {
  return [e.id, e.type, e.state, r6(e.x), r6(e.y || 0), r6(e.z), r6(e.yaw), r6(e.hp), e.alert ? 1 : 0, e.tgt || 0, e.canSee ? 1 : 0, e.mag, e.crouch ? 1 : 0, e.inCover ? 1 : 0, e.order ? e.order.phase : 0, e.down ? 1 : 0, r6(e.morale)];
}
async function run(sc) {
  const { G, advance } = await load(sc.rnd), S = G.Server, out = [];
  // what the simulation says, in order: every message, as JSON (Maps and Sets as their entries)
  const enc = (m) => JSON.stringify(m, (_k, v) => (v instanceof Map ? ['Map', [...v]] : v instanceof Set ? ['Set', [...v]] : ArrayBuffer.isView(v) ? ['TA', Array.from(v)] : v));
  const kinds = {};
  let msgHash = crypto.createHash('sha1');
  const said = (to, m) => { const k = (m && m.t) || '?'; kinds[k] = (kinds[k] || 0) + 1; msgHash.update(to + ':' + enc(m) + '\n'); };
  S.net.broadcast = (m, x) => said('*' + (x || ''), m);
  S.net.sendTo = (id, m) => said(id, m);
  const ME = 'p1';
  S.net.myId = ME;
  S.reset();
  S.handle({ t: 'hello', name: 'Check', prefs: [], look: {} }, ME);
  if (sc.board) {
    // (as js/debugstart.ts asks it: the run, the hangar, the mission, docked)
    S.handle({ t: 'startRun', dbg: {} }, ME);
    for (let i = 0; i < 200 && S.phase !== 'shop'; i++) { S.update(0.05); advance(0.05); }
    if (S.phase !== 'shop') throw new Error('not in the hangar: ' + S.phase);
    S.handle({ t: 'dbgMs', ms: { ...sc.board, seed: sc.seed } }, ME);
    for (let i = 0; i < 400 && S.phase !== 'level'; i++) { S.update(0.05); advance(0.05); }
    S.handle({ t: 'sdock', on: 1 }, ME);
  } else {
    const th = G.THEMES.findIndex((t) => t.name === sc.th);
    if (th < 0) throw new Error('no theme ' + sc.th);
    S.handle({ t: 'startRun', dbg: { classic: true, th, lvl: sc.lvl, seed: sc.seed, leader: !!sc.leader, night: !!sc.night } }, ME);
    if (S.phase !== 'route') throw new Error('not on the route map: ' + S.phase);
    const opt = G.Route.options(S.routeMap, S.route.path[S.route.path.length - 1])[0];
    S.handle({ t: 'pick', n: opt }, ME);
  }
  for (let i = 0; i < 120 && S.phase !== 'level'; i++) advance(0.05);
  if (S.phase !== 'level' || !S.map) throw new Error('the level did not start: ' + S.phase);
  const map = S.map, L = G.Level, TS = L.TS;
  // the officer: from the spawn, room to room (the furthest from the spawn last), at a walk, opening shut doors on the way
  const sp = map.spawn, rooms = [...map.rooms].filter((r) => r !== map.spawnRoom);
  const d0 = L.flow(map, [L.src(map, sp.x, 0, sp.z)]), dOf = (r) => d0[r.cz * map.W + r.cx] ?? -1;
  const way = rooms.filter((r) => dOf(r) >= 0).sort((a, b) => dOf(a) - dOf(b)).map((r) => ({ x: (r.cx + 0.5) * TS, z: (r.cz + 0.5) * TS }));
  const me = { x: sp.x, y: 0, z: sp.z, yaw: 0 };
  me.y = L.groundAt(map, me.x, me.z, 0.3, 1.5);
  const st = () => ({ p: [me.x, me.y, me.z], yw: me.yaw, pt: 0, cr: 0, pr: 0, ln: 0, sd: 0, se: 0, lr: 0, dd: 0, dn: 0, mv: 1, tl: 0, w: 'p9', hp: 100, mhp: 100 });
  let wi = 0, flow = null, shoutT = 0, shotT = 0, holdT = 0;
  const ticks = Math.round(sc.secs / DT), per = Math.round(1 / DT), seconds = [];
  for (let k = 0; k < ticks; k++) {
    // walk: toward the next room by the level's own ways; a few seconds in each
    if (holdT > 0) holdT -= DT;
    else if (wi < way.length) {
      const g = way[wi];
      if (!flow) flow = L.flow(map, [L.src(map, g.x, me.y, g.z)]);
      const n = L.flowStep(map, flow, me.x, me.z, me.y), tx = n ? n.x : g.x, tz = n ? n.z : g.z, dx = tx - me.x, dz = tz - me.z, d = Math.hypot(dx, dz);
      if (Math.hypot(g.x - me.x, g.z - me.z) < 1 || !n) { wi++; flow = null; holdT = 3; }
      else { const s = Math.min(d, 2.5 * DT); me.x += (dx / d) * s; me.z += (dz / d) * s; me.yaw = Math.atan2(-dx, -dz); me.y = L.groundAt(map, me.x, me.z, 0.3, me.y + 0.5); }
      for (const dr of map.doors) if (!dr.open && Math.hypot(dr.x - me.x, dr.z - me.z) < 1.6) S.handle({ t: 'useDoor', i: map.doors.indexOf(dr) }, ME);
    }
    S.handle({ t: 'st', s: st() }, ME);
    // shout when someone's near; a shot every few seconds once the first room's reached (noise: they hear it)
    if ((shoutT -= DT) <= 0) { shoutT = 1.5; if ([...S.enemies.values()].some((e) => Math.hypot(e.x - me.x, e.z - me.z) < 9)) S.handle({ t: 'shout' }, ME); }
    if (wi > 0 && (shotT -= DT) <= 0) { shotT = 4; S.handle({ t: 'shot', sil: 0, fl: 1 }, ME); }
    S.update(DT);
    advance(DT);
    if ((k + 1) % per === 0) {
      const es = [...S.enemies.values()].sort((a, b) => (a.id < b.id ? -1 : 1)).map(enemyDigest), doors = map.doors.map((d) => (d.open ? 1 : 0) + (d.fallen ? 2 : 0)).join('');
      const m = msgHash.copy().digest('hex').slice(0, 12);
      seconds.push(hash(JSON.stringify([es, doors, m])));
      out.push({ es, doors });
    }
  }
  const last = out[out.length - 1], states = {};
  for (const e of S.enemies.values()) states[e.state] = (states[e.state] || 0) + 1;
  return { seconds, final: seconds[seconds.length - 1], enemies: S.enemies.size, states, rooms: way.length, reached: wi, msgs: Object.values(kinds).reduce((a, b) => a + b, 0), kinds, bodies: S.bodies ? S.bodies.size : 0, lastDigest: last };
}

const golden = fs.existsSync(GOLDEN) ? JSON.parse(fs.readFileSync(GOLDEN, 'utf8')) : {};
let bad = 0;
const t0 = Date.now(), res = {};
for (const sc of SCENARIOS.filter((s) => !ONLY || s.name.includes(ONLY))) {
  const t = Date.now();
  let r;
  try { r = await run(sc); } catch (e) { console.log(`FAIL ${sc.name}: ${e.stack || e}`); bad++; continue; }
  // twice in a row must agree, or the check itself isn't deterministic
  const again = await run(sc);
  if (again.final !== r.final) { console.log(`FAIL ${sc.name}: two runs of the same code differ (from second ${again.seconds.findIndex((h, i) => h !== r.seconds[i]) + 1}): the check isn't deterministic`); bad++; continue; }
  res[sc.name] = { final: r.final, seconds: r.seconds, enemies: r.enemies, states: r.states, msgs: r.msgs, kinds: r.kinds, reached: `${r.reached}/${r.rooms}` };
  const g = golden[sc.name], tag = `${sc.name.padEnd(18)} ${((Date.now() - t) / 1000).toFixed(1)} s, ${r.enemies} left ${JSON.stringify(r.states)}, ${r.msgs} messages, rooms ${r.reached}/${r.rooms}`;
  if (UPDATE) { console.log('wrote ' + tag); continue; }
  if (!g) { console.log(`NEW  ${tag} (no golden: --update)`); bad++; continue; }
  if (g.final === r.final) { console.log(`ok   ${tag}`); continue; }
  const at = r.seconds.findIndex((h, i) => h !== g.seconds[i]);
  console.log(`FAIL ${tag}\n     differs from second ${at + 1} of ${r.seconds.length}${JSON.stringify(g.kinds) !== JSON.stringify(r.kinds) ? `; messages by kind were ${JSON.stringify(g.kinds)}, now ${JSON.stringify(r.kinds)}` : ''}`);
  bad++;
}
if (UPDATE) { fs.writeFileSync(GOLDEN, JSON.stringify({ ...golden, ...res }, null, 1) + '\n'); console.log('wrote ' + path.relative(ROOT, GOLDEN)); }
console.log(`${((Date.now() - t0) / 1000).toFixed(1)} s`);
process.exit(UPDATE ? 0 : bad ? 1 : 0);
