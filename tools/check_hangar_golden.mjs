// The golden fingerprint of the baked hangar (assets/models/scenes/hangar.glb and hangar.json: tools/bake_hangar.mjs; docs/hangar-data.md):
// what the file holds, by part of the hall (its meshes, triangles, instances, the box round them), every named node (the parts, the anchors,
// the lights, the named pieces), each anchor where it is and what its extras say, the lights, the collision (hangar.json's solids), and a hash
// of all of it. The geometry is compared to the millimetre (the file's positions are int16 in each mesh's box: tools/model_emit.mjs), never the
// pictures (a sign's text is the fonts' business: tools/node_canvas.mjs). The Bevy port checks itself against the same file.
// Also checked: the collision in hangar.json is what the game's code says it is now (js/hangar.ts decorate, run here): a bake older than a
// change to the hangar's solids fails.
//   node tools/check_hangar_golden.mjs            compares with tests/hangar-golden.json
//   node tools/check_hangar_golden.mjs --update   rewrites it (review the diff: it's the change in the hangar's scene)
// (Needs the compiled game and the baked scene: npm run test:models compiles; npm run bake:hangar bakes.)
import fs from 'fs'; import vm from 'vm'; import path from 'path'; import crypto from 'crypto';
import * as THREE_NS from 'three';
import { getBounds } from '@gltf-transform/core';
import { ROOT, DIST } from './model_env.mjs';
import { makeIO } from './model_emit.mjs';

const update = process.argv.includes('--update');
const SCENES = path.join(ROOT, 'assets/models/scenes/'), GOLDEN = path.join(ROOT, 'tests/hangar-golden.json');
const fail = (m) => { console.error('HANGAR GOLDEN: ' + m); process.exit(1); };
if (!fs.existsSync(SCENES + 'hangar.glb') || !fs.existsSync(SCENES + 'hangar.json')) fail('assets/models/scenes/hangar.glb or hangar.json missing: npm run bake:hangar');
const mm = (v) => Math.round(v * 1000) / 1000, hash = (o) => crypto.createHash('sha1').update(typeof o === 'string' ? o : JSON.stringify(o)).digest('hex').slice(0, 16);

// ---- the file
const io = await makeIO(), doc = await io.read(SCENES + 'hangar.glb'), root = doc.getRoot();
const top = root.listScenes()[0].listChildren();
if (top.length !== 1 || top[0].getName() !== 'hangar') fail('the scene\'s one root node is not "hangar"');
const hangar = top[0], parts = {}, names = [], anchors = {}, lights = {};
const instOf = (nd) => { const e = nd.getExtension('EXT_mesh_gpu_instancing'); if (!e) return 1; const a = e.listAttributes()[0]; return a ? a.getCount() : 1; };
for (const sec of hangar.listChildren()) {
  const p = parts[sec.getName()] = { meshes: 0, tris: 0, drawn: 0, instanced: 0 };
  sec.traverse((nd) => {
    const me = nd.getMesh(), n = nd.getName(), x = nd.getExtras() || {};
    if (n) names.push(n);
    if (x.anchor) anchors[n] = { at: nd.getTranslation().map(mm), part: sec.getName(), extras: Object.fromEntries(Object.entries(x).map(([k, v]) => [k, typeof v === 'number' ? mm(v) : v])) };
    if (x.light) lights[n] = { at: nd.getWorldTranslation().map(mm), kind: x.light.kind || 'lamp' };
    if (!me) return;
    let t = 0; for (const pr of me.listPrimitives()) { const ix = pr.getIndices(); t += (ix ? ix.getCount() : pr.getAttribute('POSITION').getCount()) / 3; }
    const k = instOf(nd);
    p.meshes++; p.tris += t; p.drawn += t * k; if (k > 1) p.instanced += k;
  });
  if (p.meshes) { const b = getBounds(sec); p.box = [...b.min, ...b.max].map((v) => Math.round(v * 100) / 100); } // (to the centimetre: the instances' spread isn't in it)
}
names.sort();
// ---- the data beside it
const data = JSON.parse(fs.readFileSync(SCENES + 'hangar.json', 'utf8'));
const solidKey = (s) => JSON.stringify([s.min.map(mm), s.max.map(mm), s.kind, s.move, s.ray, !!s.nostep, s.hull ? s.hull.length : 0]);
const solids = data.solids.map(solidKey);
// ---- the collision the code makes now (js/hangar.ts decorate, js/range.ts decorate on node's three)
{
  const ctx = { console, Math, JSON, Set, Map, WeakMap, Object, Array, Number, String, Boolean, Uint8Array, Int8Array, Int16Array, Int32Array, Uint16Array, Uint32Array, Float32Array, Float64Array, Infinity, NaN, isFinite, parseInt, parseFloat, Error, Symbol, Date, Proxy, Reflect, performance, location: { search: '' }, URLSearchParams, THREE: { ...THREE_NS }, addEventListener() {} };
  ctx.window = ctx; ctx.self = ctx; ctx.G = {}; vm.createContext(ctx);
  for (const f of ['util', 'data', 'spacedata', 'world', 'course', 'range', 'hangar']) { const file = DIST + f + '.js'; if (!fs.existsSync(file)) fail(`${path.relative(ROOT, file)} missing: run tsc first`); vm.runInContext(fs.readFileSync(file, 'utf8'), ctx, { filename: f + '.js' }); }
  const G = ctx.G, world = G.World.create();
  G.Hangar.decorate({ world });
  const now = world.solids.filter(Boolean).map((s) => solidKey(JSON.parse(JSON.stringify(s, (k, v) => (k === 'id' || k === 'target' ? undefined : v)))));
  if (now.length !== solids.length || now.some((k, i) => k !== solids[i])) {
    const i = now.findIndex((k, j) => k !== solids[j]);
    fail(`the baked collision (hangar.json, ${solids.length} solids) is not what js/hangar.ts decorate makes now (${now.length}; first difference at ${i}: ${now[i]} vs ${solids[i]}): rebake (npm run bake:hangar)`);
  }
}
const fp = {
  note: 'node tools/check_hangar_golden.mjs --update (docs/hangar-data.md)',
  counts: { nodes: root.listNodes().length, meshes: Object.values(parts).reduce((a, p) => a + p.meshes, 0), tris: Object.values(parts).reduce((a, p) => a + p.tris, 0), drawn: Object.values(parts).reduce((a, p) => a + p.drawn, 0), materials: root.listMaterials().length, textures: root.listTextures().length, anchors: Object.keys(anchors).length, lights: Object.keys(lights).length, solids: solids.length },
  parts, anchors, lights,
  names: { count: names.length, hash: hash(names.join('\n')), named: [...new Set(names.filter((n) => !/^(a_|light_)/.test(n)))] },
  solids: { count: solids.length, hash: hash(solids.join('\n')) },
};
fp.hash = hash({ parts: fp.parts, anchors: fp.anchors, lights: fp.lights, names: fp.names, solids: fp.solids });
if (update) { fs.writeFileSync(GOLDEN, JSON.stringify(fp, null, 1) + '\n'); console.log(`hangar golden written: ${fp.counts.meshes} meshes, ${fp.counts.tris} triangles (${fp.counts.drawn} drawn), ${fp.counts.anchors} anchors, ${fp.counts.lights} lights, ${fp.counts.solids} solids, hash ${fp.hash}`); process.exit(0); }
if (!fs.existsSync(GOLDEN)) fail('tests/hangar-golden.json missing: node tools/check_hangar_golden.mjs --update');
const want = JSON.parse(fs.readFileSync(GOLDEN, 'utf8')), errs = [];
const cmp = (a, b, at) => {
  if (a === b) return;
  if (a && b && typeof a === 'object' && typeof b === 'object') { for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) cmp(a[k], b[k], at + '.' + k); return; }
  errs.push(`${at}: ${JSON.stringify(b)} (golden ${JSON.stringify(a)})`);
};
for (const k of ['counts', 'parts', 'anchors', 'lights', 'names', 'solids']) cmp(want[k], fp[k], k);
if (errs.length) { for (const e of errs.slice(0, 30)) console.error('HANGAR GOLDEN: ' + e); if (errs.length > 30) console.error(`... and ${errs.length - 30} more`); fail(`${errs.length} differences from tests/hangar-golden.json (a change to the hangar's scene: rebake and review, then --update)`); }
console.log(`hangar golden OK: ${fp.counts.meshes} meshes, ${fp.counts.tris} triangles (${fp.counts.drawn} drawn), ${fp.counts.anchors} anchors, ${fp.counts.lights} lights, ${fp.counts.solids} solids (the code's collision matches the bake), hash ${fp.hash}`);
