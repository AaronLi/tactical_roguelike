// Bakes the hangar's fixed parts (docs/hangar-data.md) to glTF, from the game's own code: the hangar's builder (js/hangar.ts fixtures, js/range.ts and
// js/course.ts fixtures) and the shell's fixed pieces (the level description's hf nodes, js/levelview.ts build hubFixed), run here in node: the compiled
// game in a vm on npm's three (as the guns are baked: tools/model_env.mjs), its canvases (the signs, screens and floors) drawn by Skia in WebAssembly
// with fonts that come with npm (tools/node_canvas.mjs), exported with three's GLTFExporter, then compressed as the packs are (tools/model_emit.mjs).
// No browser, and nothing of the machine's: the same file wherever it's baked.
//   assets/models/scenes/hangar.glb    the scene: one root node `hangar` (translation z = RZ, the hall's coordinates under it), a group for each part of the
//                                      hall (zones, workshop, outfitters, store, stash, nightjar, lounge, helipad, range, course, shell), their meshes, and the
//                                      anchors (empties a_<kind>[_<i>], extras { anchor, i, ry, ... }) where the game adds what changes; the shell group (z = -RZ:
//                                      the map's coordinates) holds the shell's fixtures and `lights` (an empty per lamp, extras: the map's light)
//   assets/models/scenes/hangar.json   the same scene as data, for the Bevy port and the golden test: the anchors, the lights, the collision (the solids
//                                      js/hangar.ts decorate adds to the hangar's map, in the map's coordinates), the counts
//   assets/models/scenes/index.json    { version, scenes: { hangar: { file, data, bytes, tris, meshes, nodes, anchors } } }
// The files go into the model bundle (tools/bundle_models.mjs; `npm run bake:hangar` runs both). Needs the compiled game (tsc).
//   node tools/bake_hangar.mjs [--keep-raw]
import fs from 'fs'; import vm from 'vm'; import path from 'path'; import os from 'os';
import * as THREE_NS from 'three';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';
import { ROOT } from './model_env.mjs';
import { makeIO, compression } from './model_emit.mjs';
import { nodeCanvas } from './node_canvas.mjs';
import { dedup } from '@gltf-transform/functions';

const args = process.argv.slice(2);
const OUT = path.join(ROOT, 'assets/models/scenes/'), DIST = path.join(ROOT, 'dist/js/'), THREE_VER = JSON.parse(fs.readFileSync(path.join(ROOT, 'node_modules/three/package.json'), 'utf8')).version;
if (!fs.existsSync(DIST + 'hangar.js')) { console.error('dist/js/hangar.js missing: run tsc first (npm run bake:hangar does)'); process.exit(1); }

// ---- the game, as much of it as draws the hangar: its scripts in the page's order (index.html), in a vm whose document makes node's canvases
const WANT = new Set(['util', 'data', 'spacedata', 'shipgen', 'callsigns', 'arsenal', 'parts', 'gear', 'medical', 'sim', 'materials', 'ballistics', 'level', 'leveldesc', 'world', 'furnspec', 'furniture', 'homes', 'residents', 'furnmesh', 'levelview', 'scars', 'damage', 'stickers', 'course', 'range', 'highlights', 'hangar']);
async function loadGame() {
  const NC = await nodeCanvas(), order = [...fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8').matchAll(/src="dist\/js\/([a-z-]+)\.js"/g)].map((m) => m[1]).filter((f) => WANT.has(f));
  const ctx = { console, Math, JSON, Set, Map, WeakMap, WeakSet, Object, Array, Number, String, Boolean, Uint8Array, Uint8ClampedArray, Int8Array, Int16Array, Int32Array, Uint16Array, Uint32Array, Float32Array, Float64Array, ArrayBuffer, DataView, Infinity, NaN, isFinite, parseInt, parseFloat, Error, TypeError, RangeError, Symbol, Date, Proxy, Reflect, Promise, performance, THREE: { ...THREE_NS },
    document: { body: { prepend() {}, append() {}, appendChild() {} }, addEventListener() {}, getElementById: () => null, querySelector: () => null }, location: { search: '' }, navigator: { userAgent: 'node' }, URLSearchParams, addEventListener() {}, setTimeout, clearTimeout, setInterval, clearInterval, requestAnimationFrame: () => 0 };
  ctx.window = ctx; ctx.self = ctx; ctx.globalThis = ctx; ctx.G = {};
  NC.install(ctx); NC.install(globalThis); // (the game's canvases, and the exporter's)
  vm.createContext(ctx);
  for (const f of order) vm.runInContext(fs.readFileSync(DIST + f + '.js', 'utf8'), ctx, { filename: f + '.js' });
  return { G: ctx.G, T: ctx.THREE };
}

// ---- the hangar's map, its fixed parts drawn by the game's code, made ready for glTF, exported
async function bake(G, T) {
  const RZ = G.Hangar.RZ, WALL_H = G.Level.WALL_H;
  // the scene, for a map (Math.random seeded while it's drawn: the level's own textures' speckle, js/level.ts _tex, is random,
  // and a bake that came out the same twice would change the bundle for nothing)
  const build = (seed, level) => {
    let s = 0x5eed; const rnd = Math.random; Math.random = () => { s = (s + 0x6D2B79F5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
    try { return drawn(seed, level); } finally { Math.random = rnd; }
  };
  const drawn = (seed, level) => {
    const map = G.Level.generateHub(seed, level), root = G.Hangar.fixtures(map), shell = new T.Group();
    shell.name = 'shell'; shell.position.z = -RZ; root.add(shell);
    const lv = G.LevelView.build(map, { pool: false, hubFixed: true }); // (the shell's fixed pieces, marked: js/leveldesc.ts hf, js/levelview.ts build)
    for (const o of [...lv.children]) if (o.userData.hubFixed) { delete o.userData.hubFixed; shell.add(o); }
    const lights = new T.Group(); lights.name = 'lights'; shell.add(lights);
    (map.lights || []).forEach((l, i) => { const e = new T.Object3D(); e.name = 'light_' + i; e.position.set(l.x, (l.gy || 0) + (l.y != null ? l.y : WALL_H), l.z); e.userData = { light: JSON.parse(JSON.stringify(l)) }; lights.add(e); });
    return { map, root };
  };
  // the same whatever the seed and level the hangar's entered with (a fingerprint of every mesh's place, size, material and texture size)
  const fp = (root) => { root.updateMatrixWorld(true); const out = []; root.traverse((o) => { if (o.isMesh) { const m = o.material, g = o.geometry; out.push([o.matrixWorld.elements.map((v) => v.toFixed(4)).join(','), g.attributes.position.count, g.index ? g.index.count : 0, o.count || 1, m.type, m.color ? m.color.getHexString() : '', m.map ? m.map.image.width + 'x' + m.map.image.height : ''].join('|')); } else if (o.userData.anchor) out.push(o.name + o.position.toArray().map((v) => v.toFixed(4)).join(',')); }); return out.join('\n'); };
  const A = build(1, 1), B = build(987654, 7);
  if (fp(A.root) !== fp(B.root)) throw new Error('the hangar\'s fixed parts differ between two seeds and levels: something in them is not fixed');
  const { map, root } = A;
  root.updateMatrixWorld(true);
  // ready for glTF:
  //  - an instanced mesh (the rockwork, the shell's ceiling and roof) stays one (EXT_mesh_gpu_instancing, its colours _COLOR_0)
  const flatDone = new Map();
  root.traverse((o) => {
    if (o.layers.mask !== 1) o.userData.layers = o.layers.mask;
    if (!o.isMesh) return;
    const m = o.material;
    if (m.flatShading) { let g = flatDone.get(o.geometry); if (!g) { g = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone(); g.computeVertexNormals(); flatDone.set(o.geometry, g); } o.geometry = g; }
    if (!m.userData.rt) {
      const rt = {};
      if (m.transparent) rt.tr = 1;
      if (!m.depthWrite) rt.dw = 0;
      if (m.alphaTest) rt.at = m.alphaTest;
      if (m.polygonOffset) rt.po = [m.polygonOffsetFactor, m.polygonOffsetUnits];
      if (m.transparent) rt.op = m.opacity;
      if (m.map && m.map.anisotropy > 1) rt.an = m.map.anisotropy;
      if (Object.keys(rt).length || m.transparent) m.userData.rt = rt; // (a transparent one always: the loader makes BLEND materials not write depth)
    }
    if (!m.name) m.name = (m.isMeshBasicMaterial ? 'basic_' : 'std_') + (m.color ? m.color.getHexString() : '') + (m.map ? '_tex' : '');
  });
  // the data beside it: the anchors, the lights, the collision (decorate's solids, on a world of their own)
  const anchors = [], lights = [];
  root.traverse((o) => {
    if (o.userData.anchor) { const p = new T.Vector3(); o.getWorldPosition(p); anchors.push({ name: o.name, parent: o.parent.name, hall: o.position.toArray().map((v) => +v.toFixed(6)), map: p.toArray().map((v) => +v.toFixed(6)), extras: o.userData }); }
    if (o.userData.light) { const p = new T.Vector3(); o.getWorldPosition(p); lights.push({ name: o.name, map: p.toArray().map((v) => +v.toFixed(6)), light: o.userData.light }); }
  });
  const world = G.World.create(); G.Hangar.decorate(Object.assign({}, map, { world }));
  const solids = world.solids.filter(Boolean).map((s) => { const o = {}; for (const [k, v] of Object.entries(s)) if (k !== 'id' && k !== 'target') o[k] = Array.isArray(v) ? JSON.parse(JSON.stringify(v, (_, x) => (typeof x === 'number' ? +x.toFixed(6) : x))) : v; return o; });
  // export
  const scene = new T.Scene(); scene.add(root);
  const glb = await new GLTFExporter().parseAsync(scene, { binary: true, onlyVisible: false, maxTextureSize: 4096 });
  return { glb: Buffer.from(glb), anchors, lights, solids, rz: RZ, map: { W: map.W, H: map.H, TS: G.Level.TS } };
}

try {
  const t0 = Date.now(), { G, T } = await loadGame();
  const r = await bake(G, T), raw = r.glb;
  if (args.includes('--keep-raw')) fs.writeFileSync(path.join(os.tmpdir(), 'hangar-raw.glb'), raw);
  // compressed as the packs and props are (tools/model_emit.mjs: meshopt, int16 positions in each mesh's box, 10-bit normals, 12-bit UVs); identical
  // accessors, materials and pictures shared (dedup)
  const io = await makeIO(), doc = await io.readBinary(new Uint8Array(raw));
  await doc.transform(dedup(), ...compression());
  const buf = Buffer.from(await io.writeBinary(doc));
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(OUT + 'hangar.glb', buf);
  // the counts, from the file as written
  const rootDoc = doc.getRoot();
  let tris = 0, prims = 0;
  for (const nd of rootDoc.listNodes()) { const me = nd.getMesh(); if (!me) continue; for (const p of me.listPrimitives()) { prims++; const ix = p.getIndices(), n = ix ? ix.getCount() : p.getAttribute('POSITION').getCount(); tris += n / 3; } }
  const stats = { bytes: buf.length, raw: raw.length, tris, meshes: rootDoc.listNodes().filter((n) => n.getMesh()).length, primitives: prims, nodes: rootDoc.listNodes().length, materials: rootDoc.listMaterials().length, textures: rootDoc.listTextures().length, anchors: r.anchors.length, lights: r.lights.length, solids: r.solids.length };
  const data = { version: 1, about: 'the hangar scene as data (docs/hangar-data.md): anchors (hall and map coordinates), lights (map), solids (collision, map coordinates)', rz: r.rz, map: r.map, three: THREE_VER, stats, anchors: r.anchors, lights: r.lights, solids: r.solids };
  fs.writeFileSync(OUT + 'hangar.json', JSON.stringify(data));
  fs.writeFileSync(OUT + 'index.json', JSON.stringify({ version: 1, scenes: { hangar: { file: 'hangar.glb', data: 'hangar.json', ...stats } } }, null, 1) + '\n');
  console.log(`hangar: ${stats.meshes} meshes (${stats.tris} triangles), ${stats.materials} materials, ${stats.textures} textures, ${stats.anchors} anchors, ${stats.lights} lights, ${stats.solids} solids: ${buf.length} B (${raw.length} B as exported) in ${Date.now() - t0} ms (${OUT})`);
} catch (e) {
  console.error('bake_hangar failed: ' + (e && e.stack || e));
  process.exit(1);
}
