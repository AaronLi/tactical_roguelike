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
export function loadGame(withModels = false, extra = {}) {
  const THREE = { ...THREE_NS };
  const ctx2d = new Proxy({}, { get: (t, k) => (k in t ? t[k] : () => ({ addColorStop() {} })), set: (t, k, v) => { t[k] = v; return true; } });
  const document = { createElement: () => ({ width: 64, height: 64, getContext: () => ctx2d, style: {} }) };
  const ctx = { console, Math, JSON, Set, Map, WeakMap, Object, Array, Number, String, Boolean, Uint8Array, Int8Array, Int16Array, Int32Array, Uint16Array, Uint32Array, Float32Array, Float64Array, Infinity, NaN, isFinite, parseInt, parseFloat, Error, Symbol, Date, Proxy, Reflect, THREE, document, performance };
  Object.assign(ctx, extra); ctx.window = ctx; ctx.self = ctx; ctx.G = { R: { flashTexture: () => null, _envMap: () => null } };
  vm.createContext(ctx);
  for (const f of ['util', 'data', 'callsigns', 'arsenal', 'parts', 'gear', 'medical', 'materials', 'stickers', 'guntraces', 'gunmodels']) vm.runInContext(readDist(f), ctx, { filename: f + '.js' });
  if (withModels) vm.runInContext(readDist("glb"), ctx, { filename: "glb.js" });
  return ctx.G;
}

/**
 * The game as loadGame() gives it, plus js/glb.js running the way it does in the browser with ?bakedGuns: a G.GLB made of three's own GLTFLoader (on the
 * files under assets/models, with the meshopt decoder) and a fetch that reads those files. For tests that assemble guns from the packs (check_models_assembly.mjs).
 */
export async function loadGameWithModels() {
  const { GLTFLoader } = await import('three/examples/jsm/loaders/GLTFLoader.js');
  const { MeshoptDecoder } = await import('three/examples/jsm/libs/meshopt_decoder.module.js');
  await MeshoptDecoder.ready;
  const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder), cache = new Map();
  const file = (url) => path.join(ROOT, url);
  const G = loadGame(true, {
    location: { search: '?bakedGuns' }, URLSearchParams, TextDecoder, addEventListener() {},
    fetch: async (url) => { const f = file(url); if (!fs.existsSync(f) || /guns\/index\.json$/.test(url)) return { ok: false }; return { ok: true, json: async () => JSON.parse(fs.readFileSync(f, 'utf8')) }; },
  });
  G.GLB = {
    ready: Promise.resolve(true),
    load: (url) => { if (!cache.has(url)) { const b = fs.readFileSync(file(url)); cache.set(url, new Promise((res, rej) => loader.parse(b.buffer.slice(b.byteOffset, b.byteOffset + b.length), '', (g) => res(g.scene), rej))); } return cache.get(url); },
  };
  return G;
}
