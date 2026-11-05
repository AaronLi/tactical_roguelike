// Bakes the game's procedural guns into glTF binaries (.glb), so the browser can load a model instead of building it.
//   npm run bake:models              (tsc, then this)         node tools/bake_models.mjs [id ...]   (just those guns)
//   node tools/bake_models.mjs --check                        lists the bakes that are stale against the current code
//   node tools/bake_models.mjs --guns | --parts [id ...]      only the whole default guns / only the per-part packs (default: both)
//
// WHAT IT DOES. Loads the compiled game (dist/js) in a vm with the node build of three r149, builds every platform's
// DEFAULT build with G.GunRecipes.display(G.Gunsmith.compile(id, defaultBuild(id))), exports it with three's GLTFExporter,
// then shrinks it with gltf-transform (dedup, weld, prune, quantize, meshopt: never join/flatten, the parts stay separate
// nodes). Output (all git-ignored, regenerate with the script):
//   assets/models/guns/<id>.glb     a whole default gun. Every mesh keeps userData.slot (-> glTF extras.slot) and is named
//                                   <slot>_<n>; each animated sub-group is its own named node `part_<animKey>`; materials
//                                   are named by their G.GunMaterials.M catalogue key (js/glb.ts puts the catalogue's material
//                                   back by name, which restores the shared cache and the stipple/chequer bump maps); the
//                                   root node (named <id>) has extras.info = the build's info with anim refs as node names.
//   assets/models/guns/index.json   { version, three, src, guns: { <id>: { file, code, hash, bytes, gz, meshes, tris } } }
//                                   code = the default build's code (the browser serves the bake only for a gun whose build
//                                   is that), hash = sha1 of the baked triangles (slot, material, positions), src = sha1 of the
//                                   sources the geometry comes from; `--check` rebuilds and compares hashes to find stale bakes.
// (The recipes are bake-time code: tools/models/*.ts, compiled by tsconfig.tools.json to dist/tools; tools/model_env.mjs loads them.)
//
// AUTHORED MODELS (made in Blender: models/<id>/<id>.glb + model.json { source: 'authored' }) are baked from that file, with no recipe of their own:
// tools/bake_authored.mjs checks the source against the contract and the platform's spec (a missing anchor or slot fails the bake here, naming it), reads it
// into G.Authored, and the generic seating of the other parts on its mount anchors (tools/models/recipes.ts rifle(), rcv 'authored') makes every build, so
// the whole gun, the packs and their checks treat it like any other. docs/models.md "Authored models".
//
// PER-PART PACKS (milestone 2; tools/bake_parts.mjs, model_packs.mjs, model_emit.mjs, docs/models.md): next to guns/,
//   assets/models/parts/<platform>/index.json            the platform index: which slots shape which (JOINT packs), the anchors (offsets
//                                                        parts give other slots), the info model, the pack list per slot
//   assets/models/parts/<platform>/<slot>/<file>.glb     one pack: one slot's meshes for a combination of parts, in the gun's frame
// guns/<id>.glb stays the fast path for default builds; js/glb.ts assemble(def) builds any build from the packs.
import fs from 'fs'; import path from 'path'; import zlib from 'zlib'; import crypto from 'crypto';
import { ROOT, loadGame, loadModels } from './model_env.mjs';
import * as THREE_NS from 'three';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, weld, quantize, meshopt, prune } from '@gltf-transform/functions';
import { MeshoptEncoder, MeshoptDecoder } from 'meshoptimizer';
import { bakeParts, staleParts, PARTS_DIR } from './bake_parts.mjs';
import { authoredIds, authoredSrc, checkAuthored } from './bake_authored.mjs';

const OUT = path.join(ROOT, 'assets/models/guns/');
const args = process.argv.slice(2), check = args.includes('--check'), only = args.filter((a) => !a.startsWith('--'));
const doGuns = !args.includes('--parts') || args.includes('--guns'), doParts = !args.includes('--guns') || args.includes('--parts');

// ---- the game, in a vm, on the node build of three (one copy: used by the game and the exporter)
globalThis.FileReader = class { // (GLTFExporter wants a browser's FileReader on a Blob)
  readAsArrayBuffer(b) { b.arrayBuffer().then((r) => { this.result = r; this.onloadend && this.onloadend(); }); }
  readAsDataURL(b) { b.arrayBuffer().then((r) => { this.result = 'data:' + b.type + ';base64,' + Buffer.from(r).toString('base64'); this.onloadend && this.onloadend(); }); }
};
const G = loadGame(), GM = G.GunRecipes, GS = G.Gunsmith, Models = loadModels();
const sha = (s) => crypto.createHash('sha1').update(s).digest('hex').slice(0, 16);
const src = sha(['tools/models/recipes', 'tools/models/guntraces', 'tools/models/authored', 'js/parts', 'js/materials', 'js/gunmaterials'].map((f) => fs.readFileSync(path.join(ROOT, f + '.ts'), 'utf8')).join('\0') + '\0' + authoredSrc());

// material -> its catalogue name
const matName = new Map();
for (const [k, f] of Object.entries(GM.M)) { try { const m = f(); if (m && m.isMaterial && !matName.has(m)) matName.set(m, k); } catch (e) { /* not a material */ } }

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder, 'meshopt.decoder': MeshoptDecoder });
await MeshoptEncoder.ready; await MeshoptDecoder.ready;

const copies = new Map(); // (shared game material -> its export copy)
const copyOf = (m, name) => { let c = copies.get(m); if (!c) { c = m.clone(); c.bumpMap = null; c.name = name; copies.set(m, c); } return c; };
/** Names the group's nodes and materials for export; returns the glTF extras.info and a triangle hash. */
function prepare(id, group, info) {
  const animNames = new Map();
  for (const [k, v] of Object.entries(info.anim || {})) if (v && v.isObject3D) animNames.set(v, k);
  const h = crypto.createHash('sha1');
  let n = 0, tris = 0, meshes = 0;
  G.GunRig.describe(group); // (the magazine check's mesh references written down as data on the nodes: js/gunrig.ts, docs/models.md)
  group.name = id; group.updateMatrixWorld(true);
  // UVs are kept only where something uses them: a bump map (rebuilt at load, needs them to tile) or a display surface
  const needUv = new Set();
  // (the bump map is a property of the catalogue's material, found by NAME: the game's materials are shared, so never read or change them here)
  const bumpy = (m) => !!(Models.contract.materials.names[m.name || matName.get(m)] || {}).bump;
  group.traverse((o) => { if (o.isMesh && (bumpy(o.material) || o.material.map || (o.userData.display) || (o.name || '').startsWith('display_'))) needUv.add(o.geometry); });
  group.traverse((o) => { if (o.isMesh && !needUv.has(o.geometry) && o.geometry.attributes.uv) o.geometry.deleteAttribute('uv'); });
  group.traverse((o) => {
    if (o === group) return;
    if (o.isMesh) {
      meshes++; n++; o.name = (o.userData.slot || 'base') + '_' + n;
      const m0 = o.material, m = copyOf(m0, m0.name || matName.get(m0) || ('m_' + m0.color.getHexString())); o.material = m; // (a copy without the bump map: rebuilt at load from the catalogue, by name)
      const pos = o.geometry.attributes.position, idx = o.geometry.index;
      tris += (idx ? idx.count : pos.count) / 3;
      h.update(o.userData.slot + '|' + m.name + '|' + pos.count + '|' + Array.from(pos.array, (x) => Math.round(x * 1e5)).join(','));
    } else {
      delete o.userData.chk; // mag-check data: object refs to other meshes, viewmodel only
      const a = animNames.get(o);
      o.name = a ? 'part_' + a : 'group_' + (++n);
      if (a) o.userData.part = a;
    }
  });
  const ex = {};
  for (const [k, v] of Object.entries(info)) {
    if (k === 'anim') { ex.anim = Object.fromEntries([...animNames].map(([o, nm]) => [nm, o.name])); continue; }
    try { ex[k] = JSON.parse(JSON.stringify(v, (kk, vv) => (vv && vv.isObject3D ? undefined : vv))); } catch (e) { /* skip */ }
  }
  group.userData.info = ex; group.userData.gun = id;
  return { ex, tris, meshes, hash: h.digest('hex').slice(0, 16) };
}

for (const id of authoredIds()) { // (the authored sources: the contract and the platform's spec first)
  const r = checkAuthored(Models, id, G); for (const w of r.warnings) console.warn(id + ': warning ' + w);
  if (r.errors.length) { console.error('authored source ' + id + ' is not valid:\n  ' + r.errors.join('\n  ')); process.exit(1); }
}
const platIds = Object.keys(GS.PLATFORMS || {}).filter((id) => G.WEAPONS[id]);
const ids2 = only.length ? only : platIds.length ? platIds : G.WEAPON_LIST.map((w) => w.id);
fs.mkdirSync(OUT, { recursive: true });
const indexFile = OUT + 'index.json';
const old = fs.existsSync(indexFile) ? JSON.parse(fs.readFileSync(indexFile, 'utf8')) : { guns: {} };
const index = { version: 1, three: THREE_NS.REVISION, src, guns: only.length || check ? { ...old.guns } : {} };
let fails = 0, rawTotal = 0, gzTotal = 0, stale = 0;
for (const id of doGuns ? ids2 : []) {
  try {
    const def = GS.compile(id, GS.defaultBuild(id));
    const { group, info } = GM.display(def);
    const p = prepare(id, group, info);
    if (check) { const was = old.guns[id]; if (!was || was.hash !== p.hash) { stale++; console.log('STALE', id); } continue; }
    const raw = await new GLTFExporter().parseAsync(group, { binary: true, onlyVisible: false, includeCustomExtensions: false });
    const doc = await io.readBinary(new Uint8Array(raw));
    await doc.transform(dedup(), weld({ tolerance: 1e-7, toleranceNormal: 0.01 }), prune({ keepLeaves: true, keepAttributes: true }),
      quantize({ quantizePosition: 14, quantizeNormal: 10, quantizeTexcoord: 12 }), meshopt({ encoder: MeshoptEncoder, level: 'medium' }));
    const buf = Buffer.from(await io.writeBinary(doc)), gz = zlib.gzipSync(buf, { level: 9 }).length;
    const rep = Models.validate(Models.describeGltfJson(Models.glbJson(buf)), id); // (the contract, js/glb.ts: a bake that breaks it fails loudly)
    for (const w of rep.warnings) console.warn(`${id}: warning ${w}`);
    if (rep.errors.length) throw new Error(`${id}.glb breaks the model contract:\n  ` + rep.errors.join('\n  '));
    fs.writeFileSync(OUT + id + '.glb', buf);
    index.guns[id] = { file: id + '.glb', code: def.code, hash: p.hash, bytes: buf.length, gz, raw: raw.byteLength, meshes: p.meshes, tris: p.tris };
    rawTotal += buf.length; gzTotal += gz;
    console.log(id.padEnd(14), String(p.meshes).padStart(4), 'meshes', String(p.tris).padStart(7), 'tris', String(buf.length).padStart(7), 'B', String(gz).padStart(7), 'gz');
  } catch (e) { fails++; console.error('FAIL', id, (e && e.stack) || e); }
}
if (check) {
  let staleP = 0;
  if (doParts) { const sp = staleParts(ids2, src); staleP = sp.length; for (const id of sp) console.log('STALE parts', id); }
  console.log(stale || staleP ? `${stale} stale guns, ${staleP} stale part sets: run npm run bake:models` : 'all baked guns and packs are current');
  process.exit(stale || staleP ? 1 : 0);
}
if (doGuns) {
  const all = Object.values(index.guns);
  index.totals = { guns: all.length, bytes: all.reduce((a, g) => a + g.bytes, 0), gz: all.reduce((a, g) => a + g.gz, 0) };
  fs.writeFileSync(indexFile, JSON.stringify(index, null, 1));
  console.log(`\nbaked ${all.length} guns (${fails} failed): ${index.totals.bytes} B, ${index.totals.gz} B gzipped (this run: ${rawTotal} / ${gzTotal})`);
}
if (doParts) {
  console.log('\nper-part packs:');
  const r = await bakeParts({ G, GS, GM }, Models, ids2, src, console.log, only.length > 0);
  fails += r.fails;
  if (!r.fails) {
    const old2 = fs.existsSync(PARTS_DIR + 'index.json') ? JSON.parse(fs.readFileSync(PARTS_DIR + 'index.json', 'utf8')).platforms : {};
    const plats = { ...(only.length ? old2 : {}), ...r.summary };
    const vals = Object.values(plats), sum = (k) => vals.reduce((a, x) => a + (x[k] || 0), 0);
    const totals = { platforms: vals.length, packs: sum('entries'), files: sum('files'), bytes: sum('bytes'), gz: sum('gz'), sharedFiles: r.shared.files, sharedBytes: r.shared.bytes, sharedGz: r.shared.gz, index: sum('index'), indexGz: sum('indexGz'), builds: sum('builds'), coverBuilds: sum('coverBuilds') };
    fs.writeFileSync(PARTS_DIR + 'index.json', JSON.stringify({ version: 2, src, platforms: plats, totals }, null, 1));
    // what each platform's coverage was made of (the joint packs and info tables, with their combination counts): for docs/models.md and review
    fs.writeFileSync(PARTS_DIR + 'coverage.json', JSON.stringify(Object.fromEntries(r.states.map((st) => [st.id, { builds: st.builds, coverBuilds: st.cover, rounds: st.rounds, combinations: st.stats, joint: st.joint, info: st.infoDeps }])), null, 1));
    fs.writeFileSync(PARTS_DIR + 'couplings.json', JSON.stringify(r.couplings, null, 1)); // (slot pairs where one slot's part reshapes another's geometry: tools/model_policy.mjs)
    const gzAll = totals.gz + totals.sharedGz;
    console.log(`\nbaked packs for ${vals.length} platforms: ${totals.packs} index entries; ${totals.files} platform files (${totals.bytes} B, ${totals.gz} B gzipped) + ${totals.sharedFiles} shared files (${totals.sharedBytes} B, ${totals.sharedGz} B gzipped) = ${gzAll} B gzipped (+ indexes ${totals.index} B, ${totals.indexGz} gzipped); ${totals.builds} builds (of which ${totals.coverBuilds} made to cover every combination) assemble from them`);
  }
}
process.exit(fails ? 1 : 0);
