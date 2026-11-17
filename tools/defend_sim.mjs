// Holding a liner (obj defend, js/spaceserver.ts defendTick) run in node, as tools/check_sim_golden.mjs runs the simulation: what's
// said, how many of her passengers and of the pirates are left every 25 s, when the first pirate got into her shelter.
//   node tools/defend_sim.mjs [passive|win] [seed] [objective]
// passive: the officer stands where he came aboard (the pirates get to the shelter); win: every boarder dies twelve seconds after he
// comes aboard (she's held). Seeds 9, 22, 33 are liners. Run tsc first.
import { runScripts } from './vm_game.mjs'; // (first: it starts node again with what the ES modules need)
import fs from 'node:fs'; import vm from 'node:vm'; import path from 'node:path'; import crypto from 'node:crypto'; import { fileURLToPath } from 'node:url';
import * as THREE_NS from 'three';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'), DIST = path.join(ROOT, 'dist/js/');
const GOLDEN = path.join(ROOT, 'tests/sim-golden.json');
const argv = process.argv.slice(2), UPDATE = argv.includes('--update'), ONLY = argv.includes('--only') ? argv[argv.indexOf('--only') + 1] : null;
const DT = 1 / 30, ENTRY = 'serverhost';
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
  await runScripts(ctx, DIST, [ENTRY], { what: 'npm run test:sim does' });
  const advance = (dt) => { now += dt; for (;;) { timers.sort((a, b) => a.at - b.at || a.id - b.id); const t = timers[0]; if (!t || t.at > now) break; timers.shift(); t.fn(); } };
  return { G: ctx.G, advance, time: () => now };
}

const mode = process.argv[2] || 'passive', seed = +(process.argv[3] || 9);
const { G, advance } = await load(5), S = G.Server, ME = 'p1', said = [];
let T = 0;
S.net.broadcast = (m) => { if (m && m.t === 'chat') said.push(`[${T.toFixed(0).padStart(3)}s] ${m.m}`); };
S.net.sendTo = () => {};
S.net.myId = ME; S.reset();
S.handle({ t: 'hello', name: 'Check', prefs: [], look: {} }, ME);
S.handle({ t: 'startRun', dbg: {} }, ME);
for (let i = 0; i < 200 && S.phase !== 'shop'; i++) { S.update(0.05); advance(0.05); }
S.handle({ t: 'dbgMs', ms: { kind: 'board', size: 'large', obj: process.argv[4] || 'defend', diff: 3, seed } }, ME);
for (let i = 0; i < 400 && S.phase !== 'level'; i++) { S.update(0.05); advance(0.05); }
for (let i = 0; i < 120 && S.phase !== 'level'; i++) advance(0.05);
{ const b = S.map.sp.breach, ss = G.ShipGen.sites(S.map).slice().sort((p, q) => Math.hypot(p.x - b.x, p.z - b.z) - Math.hypot(q.x - b.x, q.z - b.z))[0]; S.handle({ t: 'sdock', on: 1, site: [ss.c, ss.nx, ss.nz] }, ME); }
const map = S.map, L = G.Level, TS = L.TS, sp = map.sp, M = G.SpaceSv.st ? G.SpaceSv.st.M : null;
console.log('theme', map.theme.name, '| hall', sp.hall, '| shelter room', sp.shelter, sp.roles[sp.shelter], 'floor', map.rooms[sp.shelter].fl, '| enemies at start', S.enemies.size, 'civ', S.remaining(true), 'hostile', S.remaining(false));
const me = { x: map.spawn.x, y: 0, z: map.spawn.z, yaw: 0 }; me.y = L.groundAt(map, me.x, me.z, 0.3, 1.5);
const st = () => ({ p: [me.x, me.y, me.z], yw: me.yaw, pt: 0, cr: 0, pr: 0, ln: 0, sd: 0, se: 0, lr: 0, dd: 0, dn: 0, mv: 0, tl: 0, w: 'p9', hp: 100, mhp: 100 });
const rm = map.rooms[sp.shelter], fy = L.floorMap(map, rm.fl || 0).fy || 0;
let maxIn = 0, first = null;
for (let k = 0; k < 250 / DT; k++) {
  T = k * DT;
  S.handle({ t: 'st', s: st() }, ME);
  if (mode === 'win') for (const e of [...S.enemies.values()]) if (!e.def.civ && e.hp > 0 && (e.spawnedAt = e.spawnedAt ?? T) < T - 12) { e.hp = 0.01; S.applyHit({ e: e.id, d: 1, bo: 1, cz: 'shot' }, ME); } // (each boarder shot dead twelve seconds after he comes aboard)
  S.update(DT); advance(DT);
  const inS = [...S.enemies.values()].filter((e) => !e.def.civ && Math.abs((e.y || 0) - fy) < 1.5 && G.ShipGen.roomAt(map, e.x, e.z, rm.fl || 0) === sp.shelter).length;
  if (inS && first == null) first = T; maxIn = Math.max(maxIn, inS);
  if (k % Math.round(25 / DT) === 0) { const up = [...S.enemies.values()].filter((e) => !e.def.civ && (e.y || 0) > 2).length; console.log(`t=${T.toFixed(0).padStart(3)}s  passengers on their feet ${[...S.enemies.values()].filter((e) => e.def.civ && !e.down).length}  pirates ${S.remaining(false)} (${up} on the upper deck, ${inS} in the shelter)`); }
}
console.log(said.join('\n'));
console.log(`first pirate in the shelter: ${first == null ? 'never' : first.toFixed(0) + ' s'}; most in it at once: ${maxIn}; passengers on their feet at the end: ${[...S.enemies.values()].filter((e) => e.def.civ && !e.down).length}, dead ${[...S.bodies.values()].filter((b) => b.civ).length}; pirates left: ${S.remaining(false)}`);
