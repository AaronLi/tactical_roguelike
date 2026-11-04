// Shared by tools/bake_models.mjs and tools/check_models.mjs: the compiled game (dist/js) in a node vm, and the model contract.
import fs from 'fs'; import vm from 'vm'; import path from 'path'; import { fileURLToPath } from 'url';
import * as THREE_NS from 'three';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const DIST = path.join(ROOT, 'dist/js/');

function readDist(f) {
  if (!fs.existsSync(DIST + f + '.js')) { console.error(`dist/js/${f}.js missing: run tsc first (npm run bake:models / check:models do)`); process.exit(1); }
  return fs.readFileSync(DIST + f + '.js', 'utf8');
}

/** js/glb.ts on its own (it needs nothing from the game to describe and check a model): { G.Models: contract, validate, ... }. */
export function loadModels() {
  const ctx = { console, JSON, Object, Array, Number, String, Boolean, Math, Map, Set, Error, RegExp, Uint8Array, DataView, TextDecoder, URLSearchParams, Promise, G: {} };
  ctx.window = ctx; vm.createContext(ctx);
  vm.runInContext(readDist('glb'), ctx, { filename: 'glb.js' });
  return ctx.G.Models;
}

/** The game's data and gun-building files, on the node build of three (ONE copy: the game's and the exporter's). */
export function loadGame() {
  const THREE = { ...THREE_NS };
  const ctx2d = new Proxy({}, { get: (t, k) => (k in t ? t[k] : () => ({ addColorStop() {} })), set: (t, k, v) => { t[k] = v; return true; } });
  const document = { createElement: () => ({ width: 64, height: 64, getContext: () => ctx2d, style: {} }) };
  const ctx = { console, Math, JSON, Set, Map, WeakMap, Object, Array, Number, String, Boolean, Uint8Array, Int8Array, Int16Array, Int32Array, Uint16Array, Uint32Array, Float32Array, Float64Array, Infinity, NaN, isFinite, parseInt, parseFloat, Error, Symbol, Date, Proxy, Reflect, THREE, document, performance };
  ctx.window = ctx; ctx.self = ctx; ctx.G = { R: { flashTexture: () => null, _envMap: () => null } };
  vm.createContext(ctx);
  for (const f of ['util', 'data', 'callsigns', 'arsenal', 'parts', 'gear', 'medical', 'materials', 'stickers', 'guntraces', 'gunmodels', 'gunrig']) vm.runInContext(readDist(f), ctx, { filename: f + '.js' });
  return ctx.G;
}
