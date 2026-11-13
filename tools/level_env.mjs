// The level generator in node (tools/check_level_golden.mjs, and anything else that wants a level's description without a
// browser): the compiled game (dist/js) in a vm, the files the host's simulation loads for a level (js/serverworker.ts
// SERVER_SCRIPTS, as far as the level goes). three.js is there because some of those files reach for it as they load
// (js/util.ts, js/damage.ts); generating a level doesn't: pure(G) swaps it for one that throws on any use, and says what did.
import fs from 'fs'; import vm from 'vm'; import path from 'path'; import { fileURLToPath } from 'url';
import * as THREE_NS from 'three';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.join(ROOT, 'dist/js/');
export const LEVEL_SCRIPTS = ['util', 'data', 'spacedata', 'shipgen', 'callsigns', 'arsenal', 'parts', 'gear', 'medical', 'sim', 'materials', 'ballistics', 'level', 'leveldesc', 'world', 'furnspec', 'furniture', 'homes', 'residents', 'scars', 'damage', 'stickers'];

export function loadLevel() {
  const ctx2d = new Proxy({}, { get: (t, k) => (k in t ? t[k] : () => ({ addColorStop() {} })), set: (t, k, v) => { t[k] = v; return true; } });
  const document = { createElement: () => ({ width: 1, height: 1, getContext: () => ctx2d, style: {} }), body: { prepend() {}, append() {}, appendChild() {} }, addEventListener() {} };
  const ctx = { console, Math, JSON, Set, Map, WeakMap, WeakSet, Object, Array, Number, String, Boolean, Uint8Array, Int8Array, Int16Array, Int32Array, Uint16Array, Uint32Array, Float32Array, Float64Array, ArrayBuffer, DataView, Infinity, NaN, isFinite, parseInt, parseFloat, Error, TypeError, RangeError, Symbol, Date, Proxy, Reflect, Promise, performance, THREE: { ...THREE_NS }, document, location: { search: '' }, URLSearchParams, addEventListener() {}, setTimeout, clearTimeout, setInterval, clearInterval };
  ctx.window = ctx; ctx.self = ctx; ctx.globalThis = ctx; ctx.G = {};
  vm.createContext(ctx);
  for (const f of LEVEL_SCRIPTS) {
    const file = DIST + f + '.js';
    if (!fs.existsSync(file)) { console.error(`${path.relative(ROOT, file)} missing: run tsc first (npm run test:level does)`); process.exit(1); }
    vm.runInContext(fs.readFileSync(file, 'utf8'), ctx, { filename: f + '.js' });
  }
  ctx.G.Hangar = { decorate() {} }; // (the hangar's own fittings: js/hangar.ts, the screen's; its map is the level's)
  ctx.G.Range = null;
  return { G: ctx.G, ctx };
}

// three.js gone: anything that reaches for it while a level's generated is noted (and fails)
export function pure(env) {
  const used = new Set();
  env.ctx.THREE = new Proxy({}, { get: (_t, k) => { used.add(String(k)); throw new Error('three.js used generating a level: THREE.' + String(k)); } });
  return used;
}
