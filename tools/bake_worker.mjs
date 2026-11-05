// The baker's work, one job at a time: bake a gun's default .glb, analyse a platform's packs, write a pack file. tools/bake_models.mjs (the driver)
// runs these in-process (-j 1) or in worker threads (-j N, tools/bake_pool.mjs): every worker loads its own copy of the game and the recipes (a vm on the
// node build of three), so a job gives the same bytes wherever it runs. Jobs: { type: 'gun', id, check } | { type: 'platform', id } | { type: 'write', ... }.
import fs from 'fs'; import path from 'path'; import zlib from 'zlib'; import crypto from 'crypto';
import { isMainThread, parentPort, workerData } from 'worker_threads';
import { ROOT, loadGame, loadModels } from './model_env.mjs';
import * as THREE_NS from 'three';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';
import { NodeIO, Logger } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, weld, quantize, meshopt, prune } from '@gltf-transform/functions';
import { MeshoptEncoder, MeshoptDecoder } from 'meshoptimizer';
import { makeEmitter } from './model_emit.mjs';
import { platformJob } from './bake_parts.mjs';
import { authoredSrc } from './bake_authored.mjs';
import { authoredPartsSrc } from './authored_parts.mjs';

export const GUNS_DIR = path.join(ROOT, 'assets/models/guns/');
const sha = (s) => crypto.createHash('sha1').update(s).digest('hex').slice(0, 16);

/** The baker's environment: the game in a vm, the contract, the exporter. `verbose`: gltf-transform's own log lines (prune's "Removed types..."). */
export async function makeEnv({ verbose = false } = {}) {
  globalThis.FileReader = class { // (GLTFExporter wants a browser's FileReader on a Blob)
    readAsArrayBuffer(b) { b.arrayBuffer().then((r) => { this.result = r; this.onloadend && this.onloadend(); }); }
    readAsDataURL(b) { b.arrayBuffer().then((r) => { this.result = 'data:' + b.type + ';base64,' + Buffer.from(r).toString('base64'); this.onloadend && this.onloadend(); }); }
  };
  const G = loadGame(), GM = G.GunRecipes, GS = G.Gunsmith, Models = loadModels();
  const src = sha(['tools/models/recipes', 'tools/models/guntraces', 'tools/models/authored', 'tools/models/authoredparts', 'js/parts', 'js/materials', 'js/gunmaterials'].map((f) => fs.readFileSync(path.join(ROOT, f + '.ts'), 'utf8')).join('\0') + '\0' + authoredSrc() + '\0' + authoredPartsSrc());
  await MeshoptEncoder.ready; await MeshoptDecoder.ready;
  const logger = new Logger(verbose ? Logger.Verbosity.INFO : Logger.Verbosity.WARN);
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder, 'meshopt.decoder': MeshoptDecoder }).setLogger(logger);
  return { G, GM, GS, Models, src, io, verbose, logger };
}

/** The job handlers over an environment (one per thread). */
export function createHandlers(env) {
  const { G, GM, GS, Models, src, io } = env;
  let emitter = null; const keep = new Map(); // (platform id -> its pack scenes, kept for the write jobs)
  const getEmitter = async () => emitter || (emitter = await makeEmitter({ G, GM, Models, logger: env.logger }));

  // material -> its catalogue name
  const matName = new Map();
  for (const [k, f] of Object.entries(GM.M)) { try { const m = f(); if (m && m.isMaterial && !matName.has(m)) matName.set(m, k); } catch (e) { /* not a material */ } }
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
      try { ex[k] = JSON.parse(JSON.stringify(v, function (kk, vv) { return vv && vv.isObject3D ? undefined : kk === "uuid" && this && this.metadata ? undefined : vv; })); } /* (a three Material serialises with a random uuid: dropped, so a bake is the same every time) */ catch (e) { /* skip */ }
    }
    group.userData.info = ex; group.userData.gun = id;
    return { ex, tris, meshes, hash: h.digest('hex').slice(0, 16) };
  }

  return {
    /** A platform's default build as assets/models/guns/<id>.glb (check: just its hash). Returns { entry, warnings, secs } (entry: the index.json row). */
    async gun({ id, check }) {
      const t0 = Date.now(), warnings = [];
      const def = GS.compile(id, GS.defaultBuild(id));
      const { group, info } = GM.display(def);
      const p = prepare(id, group, info);
      if (check) return { hash: p.hash, secs: (Date.now() - t0) / 1000 };
      const raw = await new GLTFExporter().parseAsync(group, { binary: true, onlyVisible: false, includeCustomExtensions: false });
      const doc = await io.readBinary(new Uint8Array(raw));
      await doc.transform(dedup(), weld({ tolerance: 1e-7, toleranceNormal: 0.01 }), prune({ keepLeaves: true, keepAttributes: true }),
        quantize({ quantizePosition: 14, quantizeNormal: 10, quantizeTexcoord: 12 }), meshopt({ encoder: MeshoptEncoder, level: 'medium' }));
      const buf = Buffer.from(await io.writeBinary(doc)), gz = zlib.gzipSync(buf, { level: 9 }).length;
      const rep = Models.validate(Models.describeGltfJson(Models.glbJson(buf)), id); // (the contract, js/glb.ts: a bake that breaks it fails loudly)
      for (const w of rep.warnings) warnings.push(`${id}: warning ${w}`);
      if (rep.errors.length) throw new Error(`${id}.glb breaks the model contract:\n  ` + rep.errors.join('\n  '));
      fs.mkdirSync(GUNS_DIR, { recursive: true });
      fs.writeFileSync(GUNS_DIR + id + '.glb', buf);
      return { entry: { file: id + '.glb', code: def.code, hash: p.hash, bytes: buf.length, gz, raw: raw.byteLength, meshes: p.meshes, tris: p.tris }, warnings, secs: (Date.now() - t0) / 1000 };
    },
    /** One platform's packs: analysis, covering, indexing (tools/bake_parts.mjs). Returns the lean state; the pack scenes stay here for the write jobs. */
    async platform({ id }) {
      const t0 = Date.now();
      const r = await platformJob({ G, GS, GM }, Models, await getEmitter(), id, src, keep);
      r.secs = (Date.now() - t0) / 1000; return r;
    },
    /** Writes one pack scene of a platform as a file ({ platform, local, shared, min, name, tag, id, path }). */
    async write(j) {
      const root = keep.get(j.platform)[j.local]; keep.get(j.platform)[j.local] = null;
      if (j.shared) { // in its own frame: the corner of its bounding box at the origin, named by its shape
        for (const c of root.children) c.position.set(c.position.x - j.min[0], c.position.y - j.min[1], c.position.z - j.min[2]);
        root.name = j.name; root.userData = { pack: { platform: '_shared', tag: j.tag, key: {} } };
      }
      const em = await getEmitter();
      const wr = await em.write(root, j.shared ? '_shared' : j.id, j.tag);
      fs.mkdirSync(path.dirname(j.path), { recursive: true }); fs.writeFileSync(j.path, wr.buf);
      return { bytes: wr.buf.length, gz: wr.gz };
    },
  };
}

// ---- worker thread entry (tools/bake_pool.mjs starts this file as a Worker)
if (!isMainThread && workerData && workerData.bakeWorker) {
  const h = createHandlers(await makeEnv({ verbose: workerData.verbose }));
  parentPort.on('message', async ({ id, job }) => {
    try { parentPort.postMessage({ id, ok: true, r: await h[job.type](job) }); }
    catch (e) { parentPort.postMessage({ id, ok: false, err: String((e && e.stack) || e) }); }
  });
  parentPort.postMessage({ ready: true });
}
