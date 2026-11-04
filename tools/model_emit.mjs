// Writes the packs of tools/model_packs.mjs as glTF binaries (assets/models/parts/<platform>/<tag>/<file>.glb) and the platform's index.json.
// A pack is rebuilt from its capture build (the recipe's own display model), keeping only the meshes tagged with its slot, moved to the
// platform's reference frame (the capture's offsets undone) and exported exactly as the whole guns are (tools/bake_models.mjs): the game's
// materials by catalogue name, UVs only where a bump map or display needs them, welded, quantised, meshopt-compressed; nothing is joined.
import fs from 'fs'; import path from 'path'; import zlib from 'zlib'; import crypto from 'crypto';
import * as THREE_NS from 'three';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS, EXTMeshoptCompression } from '@gltf-transform/extensions';
import { dedup, weld, quantize, meshopt, prune, reorder } from '@gltf-transform/functions';
import { MeshoptEncoder, MeshoptDecoder } from 'meshoptimizer';
import { defOf } from './model_sweep.mjs';

const T = THREE_NS;
/** Who owns the pivot of a part_ node (the pack whose tag this is): the animated parts belong to the slot they move with, the rest to the receiver. */
const PART_OWNER = { mag: 'mag', slide: 'slide', ch: 'charging', magn: 'magnifier', pump: 'pump', brk: 'barrel', barrel: 'barrel', spin: 'barrel', stringCocked: 'limbs', stringSlack: 'limbs' };
/** Position quantisation of the packs' vertices, in bits (MODELS_POSITION_BITS=14 for the smallest files); 0: float32, exact. */
const POSITION_BITS = +(process.env.MODELS_POSITION_BITS || 0);
export const ownerTag = (node) => (node.startsWith('part_') ? PART_OWNER[node.slice(5)] || 'base' : node.startsWith('group_') ? node.split('_')[1] : 'base');

export async function makeEmitter({ G, GM, Models }) {
  await MeshoptEncoder.ready; await MeshoptDecoder.ready;
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder, 'meshopt.decoder': MeshoptDecoder });
  const matName = new Map();
  for (const [k, f] of Object.entries(GM.M)) { try { const m = f(); if (m && m.isMaterial && !matName.has(m)) matName.set(m, k); } catch (e) { /* not a material */ } }
  const copies = new Map(); // (the game's materials are shared: the export gets copies without the canvas bump map, named by catalogue key)
  const matCopy = (m, name) => { let c = copies.get(m); if (!c) { c = m.clone(); c.bumpMap = null; c.name = name; copies.set(m, c); } return c; };
  const sha = (s) => crypto.createHash('sha1').update(s).digest('hex').slice(0, 16);

  /** The meshes of `tag` in a built gun, grouped by the node that holds them: { root: [mesh], nodes: Map(name -> { obj, parent, pivot, meshes }) }. */
  function fragments(group, info, tag) {
    group.updateMatrixWorld(true);
    const animOf = new Map(); for (const [k, v] of Object.entries(info.anim || {})) if (v && v.isObject3D) animOf.set(v, k);
    const names = new Map(), counts = {};
    const nameOf = (o) => {
      if (names.has(o)) return names.get(o);
      let n;
      if (animOf.has(o)) n = 'part_' + animOf.get(o);
      else { let t = null; o.traverse((c) => { if (!t && c.isMesh) t = c.userData.slot || 'base'; }); counts[t] = (counts[t] || 0) + 1; n = `group_${t}_${counts[t]}`; }
      names.set(o, n); return n;
    };
    const out = { root: [], nodes: new Map() };
    group.traverse((o) => {
      if (!o.isMesh || (o.userData.slot || 'base') !== tag) return;
      const p = o.parent;
      if (p === group) { out.root.push(o); return; }
      const name = nameOf(p);
      let nd = out.nodes.get(name);
      if (!nd) {
        if (p.quaternion.angleTo(new T.Quaternion()) > 1e-9 || Math.abs(p.scale.x - 1) + Math.abs(p.scale.y - 1) + Math.abs(p.scale.z - 1) > 1e-9) throw new Error(`node ${name} is rotated or scaled`);
        const w = new T.Vector3().setFromMatrixPosition(p.matrixWorld);
        nd = { obj: p, parent: p.parent === group ? null : nameOf(p.parent), pivot: w, meshes: [] }; out.nodes.set(name, nd);
      }
      nd.meshes.push(o);
    });
    return out;
  }

  /**
   * Builds the THREE scene of one pack from its capture: { root, hash, tris }. `off` = { rigid [f,u,r], F } the capture carries (undone here),
   * `st` = the stretch region (for undoing a stretch), `key` = { slot: part } for the root's extras.
   */
  function buildPack({ id, tag, entry, name }) {
    const cap = entry.capture, off = entry.off, st = entry.stretch || (entry.region || null);
    const { group, info } = GM.display(defOf(G, id, cap.build));
    const fr = fragments(group, info, tag);
    const [rf, ru, rr] = off.rigid, shift = new T.Vector3(rr, ru, -rf), bake = !!(off.F && st);
    const un = (v) => { // a point of the capture's frame back to the pack's
      v.sub(shift);
      if (bake) { const g = -v.z, L = st.to - st.from; let d = 0; if (g > st.from) d = g >= st.to + off.F ? off.F : g - (st.from + ((g - st.from) * L) / (L + off.F)); v.z += d; }
      return v;
    };
    const dep = {}; entry.dep.forEach((s, i) => (dep[s] = entry.key[i]));
    const pk = { platform: id, tag, key: dep };
    const root = new T.Group(); root.name = name; root.userData = { pack: pk };
    let n = 0, tris = 0; const h = crypto.createHash('sha1');
    // UVs only where something needs them (a bump map, a display surface); the bump map itself is rebuilt at load from the catalogue, by material name
    const catalogue = Models.contract.materials.names;
    const nameOfMat = (m) => m.name || matName.get(m) || ('m_' + m.color.getHexString());
    const needUv = (o) => !!((catalogue[nameOfMat(o.material)] || {}).bump || o.material.map || o.userData.display || (o.name || '').startsWith('display_'));
    const addMesh = (o, into, bakeFrom) => {
      const c = new T.Mesh(o.geometry, matCopy(o.material, nameOfMat(o.material))); c.userData = { slot: tag }; if (o.userData.display) c.userData.display = o.userData.display;
      c.position.copy(o.position); c.quaternion.copy(o.quaternion); c.scale.copy(o.scale); c.name = o.name && o.name.startsWith('display_') ? o.name : `${tag}_${++n}`;
      if (!needUv(o) && c.geometry.attributes.uv) { c.geometry = c.geometry.clone(); c.geometry.deleteAttribute('uv'); }
      const m = c.material;
      if (bake) { // the capture was stretched: put the vertices back where the pack keeps them (the mesh's own transform baked in)
        const g = c.geometry.clone(), pos = g.attributes.position, arr = new Float32Array(pos.count * 3), v = new T.Vector3(); c.updateMatrix();
        const M = c.matrix, piv = bakeFrom || new T.Vector3();
        for (let i = 0; i < pos.count; i++) { v.fromBufferAttribute(pos, i).applyMatrix4(M).add(piv); un(v); v.sub(into.__piv || new T.Vector3()); arr[i * 3] = v.x; arr[i * 3 + 1] = v.y; arr[i * 3 + 2] = v.z; }
        g.setAttribute('position', new T.BufferAttribute(arr, 3));
        const nor = g.attributes.normal; if (nor) { const NM = new T.Matrix3().getNormalMatrix(M), v2 = new T.Vector3(); for (let i = 0; i < nor.count; i++) { v2.fromBufferAttribute(nor, i).applyMatrix3(NM).normalize(); nor.setXYZ(i, v2.x, v2.y, v2.z); } }
        c.geometry = g; c.position.set(0, 0, 0); c.quaternion.identity(); c.scale.set(1, 1, 1);
      }
      const pos = c.geometry.attributes.position, idx = c.geometry.index; tris += (idx ? idx.count : pos.count) / 3;
      h.update(`${c.userData.slot}|${m.name}|${c.name.startsWith('display_') ? c.name : ''}|${Array.from(c.position.toArray().concat(c.quaternion.toArray(), c.scale.toArray()), (x) => Math.round(x * 1e6)).join(',')}|${pos.count}|`);
      h.update(Buffer.from(new Float32Array(pos.array).buffer)); if (idx) h.update(Buffer.from(new Uint32Array(idx.array).buffer));
      into.add(c);
    };
    for (const o of fr.root) { const tmp = new T.Group(); addMesh(o, tmp, null); const c = tmp.children[0]; if (!bake) c.position.sub(shift); else { /* baked above, in gun frame */ } root.add(c); h.update('r'); }
    for (const [nm, nd] of fr.nodes) {
      const g = new T.Group(); g.name = nm;
      const piv = nd.pivot.clone(); un(piv); g.position.copy(piv);
      g.userData = { ...(nm.startsWith('part_') ? { part: nm.slice(5) } : {}), owner: ownerTag(nm) === tag, ...(nd.parent ? { parent: nd.parent } : {}) };
      g.__piv = piv; h.update(`n|${nm}|${nd.parent}|${g.userData.owner}|${piv.toArray().map((x) => Math.round(x * 1e6)).join(',')}|`);
      for (const o of nd.meshes) addMesh(o, g, bake ? nd.pivot : null);
      root.add(g);
    }
    if (entry.stretch) { pk.stretch = entry.stretch; h.update(JSON.stringify(entry.stretch)); }
    return { root, hash: h.digest('hex').slice(0, 16), tris };
  }

  /** Exports a pack scene to compressed glb bytes, validating it against the pack contract. */
  async function write(root, id, tag) {
    const raw = await new GLTFExporter().parseAsync(root, { binary: true, onlyVisible: false, includeCustomExtensions: false });
    const doc = await io.readBinary(new Uint8Array(raw));
    await doc.transform(dedup(), weld({ tolerance: POSITION_BITS ? 1e-7 : 1e-9, toleranceNormal: 0.01 }), prune({ keepLeaves: true, keepAttributes: true }),
      ...(POSITION_BITS ? [meshopt({ encoder: MeshoptEncoder, level: 'medium', quantizePosition: POSITION_BITS, quantizeNormal: 10, quantizeTexcoord: 12 })] : [
        // positions stay float32 (exact: assembling reproduces the recipe's triangles bit for bit); normals and UVs are quantised; the whole is meshopt-compressed
        reorder({ encoder: MeshoptEncoder, target: 'size' }), quantize({ pattern: /^(NORMAL|TEXCOORD_\d+)$/, patternTargets: /.*/, quantizeNormal: 10, quantizeTexcoord: 12 }),
        (d) => { d.createExtension(EXTMeshoptCompression).setRequired(true).setEncoderOptions({ method: EXTMeshoptCompression.EncoderMethod.QUANTIZE }); }]));
    const buf = Buffer.from(await io.writeBinary(doc));
    const rep = Models.validatePack(Models.describeGltfJson(Models.glbJson(buf)), tag);
    if (rep.errors.length) throw new Error(`pack ${id}/${tag} breaks the pack contract:\n  ` + rep.errors.join('\n  '));
    return { buf, gz: zlib.gzipSync(buf, { level: 9 }).length };
  }
  return { buildPack, write, sha };
}

/** A file name for a pack: its key's parts joined by '+', safe characters only. */
export function packFileName(tag, key) {
  const s = key.map((k) => (k === '' ? '_' : k === '*' ? 'x' : k.replace(/[^A-Za-z0-9._-]/g, '_'))).join('+') || 'all';
  return `${tag}/${s.length > 110 ? s.slice(0, 80) + '-' + crypto.createHash('sha1').update(s).digest('hex').slice(0, 8) : s}.glb`;
}
