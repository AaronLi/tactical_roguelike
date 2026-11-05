// Shared by tools/bake_models.mjs and tools/check_models.mjs: the compiled game (dist/js) in a node vm, and the model contract.
// The gun recipes are bake-time code (tools/models/*.ts, tsconfig.tools.json -> dist/tools/tools/models): this file is what loads them, next to the game's data.
import fs from 'fs'; import vm from 'vm'; import path from 'path'; import { fileURLToPath } from 'url';
import * as THREE_NS from 'three';
import { loadAuthoredInto } from './bake_authored.mjs';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const DIST = path.join(ROOT, 'dist/js/'), DIST_RECIPES = path.join(ROOT, 'dist/tools/tools/models/');

function readDist(f, dir = DIST) {
  if (!fs.existsSync(dir + f + '.js')) { console.error(`${path.relative(ROOT, dir + f)}.js missing: run tsc first (npm run bake:models / check:models do: tsc -p . and tsc -p tsconfig.tools.json)`); process.exit(1); }
  return fs.readFileSync(dir + f + '.js', 'utf8');
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
  for (const f of ['util', 'data', 'callsigns', 'arsenal', 'parts', 'gear', 'medical', 'materials', 'stickers', 'gunmaterials']) vm.runInContext(readDist(f), ctx, { filename: f + '.js' });
  for (const f of ['guntraces', 'authored', 'recipes']) vm.runInContext(readDist(f, DIST_RECIPES), ctx, { filename: f + '.js' }); // (the recipes: G.GunRecipes, the bake's only; the game's runtime has none)
  loadAuthoredInto(ctx.G); // (the guns modelled in Blender: models/<id>/, tools/bake_authored.mjs)
  vm.runInContext(readDist('gunrig'), ctx, { filename: 'gunrig.js' });
  ctx.G.GunModels = ctx.G.GunRecipes; // (the baker's name for them: .display(def), .M, .build; the game's G.GunModels is the facade over the baked files, js/gunmodels.ts, not loaded here)
  if (withModels) { vm.runInContext(readDist('modelbundles'), ctx, { filename: 'modelbundles.js' }); vm.runInContext(readDist("glb"), ctx, { filename: "glb.js" }); }
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
  // The files the game reads: the bundles (assets/models/bundles, js/modelbundles.ts through a fetch that serves the bundle files), so the tests assemble from what the game loads.
  const file = (url) => path.join(ROOT, url);
  const G = loadGame(true, {
    location: { search: '' }, URLSearchParams, TextDecoder, addEventListener() {}, DecompressionStream, Response, Blob,
    fetch: async (url) => { const f = file(url); if (!fs.existsSync(f) || /guns\/index\.json$/.test(url)) return { ok: false, status: 404 }; const b = fs.readFileSync(f); return { ok: true, status: 200, arrayBuffer: async () => b.buffer.slice(b.byteOffset, b.byteOffset + b.length), json: async () => JSON.parse(b.toString('utf8')) }; },
  });
  G.GLB = {
    ready: Promise.resolve(true),
    load: (url) => { if (!cache.has(url)) cache.set(url, G.Bundles.getFile(url).then((ab) => new Promise((res, rej) => loader.parse(ab, '', (g) => res(g.scene), rej)))); return cache.get(url); },
  };
  return G;
}
