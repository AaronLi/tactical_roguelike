// Writes the per-part pieces of tools/bake_parts.mjs as glTF binaries (assets/models/parts/<platform>/<tag>/<file>.glb).
// A pack is rebuilt from its capture build (the recipe's own display model), keeping only the meshes tagged with its slot, moved to the
// platform's reference frame (the capture's offsets undone) and exported exactly as the whole guns are (tools/bake_models.mjs): the game's
// materials by catalogue name, UVs only where a bump map or display needs them, welded, quantised (positions to int16 in each mesh's box: quantizePositions),
// meshopt-compressed; nothing is joined.
import fs from 'fs'; import path from 'path'; import zlib from 'zlib'; import crypto from 'crypto';
import * as THREE_NS from 'three';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS, EXTMeshoptCompression, KHRMeshQuantization } from '@gltf-transform/extensions';
import { dedup, weld, quantize, prune, reorder } from '@gltf-transform/functions';
import { MeshoptEncoder, MeshoptDecoder } from 'meshoptimizer';
import { defOf } from './model_sweep.mjs';

const T = THREE_NS;
/** Who owns the pivot of a part_ node (the pack whose tag this is): the animated parts belong to the slot they move with, the rest to the receiver. */
const PART_OWNER = { mag: 'mag', slide: 'slide', ch: 'charging', magn: 'magnifier', pump: 'pump', brk: 'barrel', barrel: 'barrel', spin: 'barrel', bipod: 'base', stringCocked: 'limbs', stringSlack: 'limbs' };
/** Position quantisation of the packs' vertices: 16 (int16, KHR_mesh_quantization, the default) or 0 (MODELS_POSITION_BITS=0: float32, exact). */
const POSITION_BITS = +(process.env.MODELS_POSITION_BITS ?? 16);
if (POSITION_BITS !== 0 && POSITION_BITS !== 16) throw new Error('MODELS_POSITION_BITS: 16 or 0');

/**
 * The positions of every mesh as normalised int16 (KHR_mesh_quantization), each mesh in its own box: p = o + s * q / 32767, with o (the box's centre) and s (its
 * half-size, rounded up) rounded to whole micrometres so they are short in the JSON. The node takes the decoding (its matrix times translate(o) scale(s): the file is
 * standard glTF and opens anywhere at the right size), and extras.dq = [ox, oy, oz, s] records it, so the game undoes it as it loads (js/glb.ts dequantize: float32
 * positions and the node's own transform back, so nothing downstream sees a scaled node). One step is s / 32767: 7.6 um for a 0.5 m mesh, the largest move half that.
 */
export const quantizePositions = () => (doc) => {
  const root = doc.getRoot(), done = new Map(); // (accessor -> the dq it was quantised with: dedup can share one between meshes)
  for (const mesh of root.listMeshes()) {
    const prims = mesh.listPrimitives().filter((p) => p.getAttribute('POSITION') && p.getAttribute('POSITION').getComponentType() === 5126);
    if (!prims.length) continue;
    if (root.listNodes().some((nd) => nd.getMesh() === mesh && nd.getExtension('EXT_mesh_gpu_instancing'))) continue; // (instanced (the hangar's: tools/bake_hangar.mjs): the node's transform comes after the instances', so a box's can't go there; float32 positions)
    const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity], el = [0, 0, 0];
    for (const p of prims) { const a = p.getAttribute('POSITION'); for (let i = 0; i < a.getCount(); i++) { a.getElement(i, el); for (let k = 0; k < 3; k++) { if (el[k] < min[k]) min[k] = el[k]; if (el[k] > max[k]) max[k] = el[k]; } } }
    const um = (x) => Math.round(x * 1e6) / 1e6, o = [0, 1, 2].map((k) => um((min[k] + max[k]) / 2));
    const s = Math.ceil((Math.max(...[0, 1, 2].map((k) => Math.max(max[k] - o[k], o[k] - min[k]))) + 1e-7) * 1e6) / 1e6 || 1e-6, dq = [...o, s];
    for (const p of prims) {
      let a = p.getAttribute('POSITION');
      const was = done.get(a); if (was && was.join() === dq.join()) continue;
      if (was) { a = a.clone(); p.setAttribute('POSITION', a); }
      const n = a.getCount(), q = new Int16Array(n * 3);
      for (let i = 0; i < n; i++) { a.getElement(i, el); for (let k = 0; k < 3; k++) q[i * 3 + k] = Math.max(-32767, Math.min(32767, Math.round(((el[k] - o[k]) / s) * 32767))); }
      a.setArray(q).setNormalized(true); done.set(a, dq);
    }
    const nodes = root.listNodes().filter((nd) => nd.getMesh() === mesh);
    for (const nd of nodes) {
      if (nd.listChildren().length) throw new Error(`quantizePositions: mesh node "${nd.getName()}" has children`);
      const m = nd.getMatrix(), Q = [s, 0, 0, 0, 0, s, 0, 0, 0, 0, s, 0, o[0], o[1], o[2], 1], r = new Array(16).fill(0);
      for (let c = 0; c < 4; c++) for (let rw = 0; rw < 4; rw++) for (let k = 0; k < 4; k++) r[c * 4 + rw] += m[k * 4 + rw] * Q[c * 4 + k];
      nd.setMatrix(r).setExtras({ ...nd.getExtras(), dq });
    }
  }
  if (root.listAccessors().some((a) => a.getNormalized() && a.getComponentType() !== 5126)) doc.createExtension(KHRMeshQuantization).setRequired(true);
};
/** The compression every baked file gets after its welding: vertices reordered for meshopt, normals (10 bits) and UVs (12) quantised, positions too (above, unless MODELS_POSITION_BITS=0), the whole meshopt-compressed (EXT_meshopt_compression). */
export const compression = () => [
  reorder({ encoder: MeshoptEncoder, target: 'size' }), quantize({ pattern: /^(NORMAL|TEXCOORD_\d+)$/, patternTargets: /.*/, quantizeNormal: 10, quantizeTexcoord: 12 }),
  ...(POSITION_BITS ? [quantizePositions()] : []),
  (d) => { d.createExtension(EXTMeshoptCompression).setRequired(true).setEncoderOptions({ method: EXTMeshoptCompression.EncoderMethod.QUANTIZE }); }];
/** A NodeIO that reads and writes the compressed files (meshopt encoder and decoder ready). */
export async function makeIO(logger) {
  await MeshoptEncoder.ready; await MeshoptDecoder.ready;
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder, 'meshopt.decoder': MeshoptDecoder });
  if (logger) io.setLogger(logger);
  return io;
}
export const ownerTag = (node) => (node.startsWith('part_') ? PART_OWNER[node.slice(5)] || 'base' : node.startsWith('group_') ? node.split('_')[1] : 'base');

export async function makeEmitter({ G, GM, Models, logger }) {
  const io = await makeIO(logger); // (the baker passes a quiet logger: gltf-transform's "prune: Removed types..." lines are noise unless --verbose)
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
    /** The node record of a group (made with its ancestors, up to the gun: a bipod's legs nest in part_bipod, which holds no mesh itself). */
    const nodeOf = (p) => {
      const name = nameOf(p);
      let nd = out.nodes.get(name);
      if (!nd) {
        if (p.quaternion.angleTo(new T.Quaternion()) > 1e-9 || Math.abs(p.scale.x - 1) + Math.abs(p.scale.y - 1) + Math.abs(p.scale.z - 1) > 1e-9) throw new Error(`node ${name} is rotated or scaled`);
        const w = new T.Vector3().setFromMatrixPosition(p.matrixWorld);
        if (p.parent !== group) nodeOf(p.parent);
        nd = { obj: p, parent: p.parent === group ? null : nameOf(p.parent), pivot: w, meshes: [] }; out.nodes.set(name, nd);
      }
      return nd;
    };
    group.traverse((o) => {
      if (!o.isMesh || (o.userData.slot || 'base') + (o.userData.at ? '@' + o.userData.at : '') !== tag) return;
      const p = o.parent;
      if (p === group) { out.root.push(o); return; }
      nodeOf(p).meshes.push(o);
    });
    return out;
  }

  /**
   * Builds the THREE scene of one pack from its capture: { root, hash, tris }. `off` = { rigid [f,u,r] } the capture carries (undone here).
   */
  function buildPack({ id, tag, entry, name }) {
    const cap = entry.capture, off = entry.off;
    const { group, info } = GM.display(defOf(G, id, cap.build));
    G.GunRig.describe(group); // (the magazine check's references as data on the nodes, as a whole-gun bake writes them)
    const fr = fragments(group, info, tag);
    const [rf, ru, rr] = off.rigid, shift = new T.Vector3(rr, ru, -rf);
    const un = (v) => v.sub(shift); // a point of the capture's frame back to the pack's
    const dep = {}; entry.dep.forEach((s, i) => (dep[s] = entry.key[i]));
    const pk = { platform: id, tag, key: dep };
    const root = new T.Group(); root.name = name; root.userData = { pack: pk };
    let n = 0, tris = 0; const h = crypto.createHash('sha1');
    // UVs only where something needs them (a bump map, a display surface); the bump map itself is rebuilt at load from the catalogue, by material name
    const catalogue = Models.contract.materials.names;
    const nameOfMat = (m) => m.name || matName.get(m) || ('m_' + m.color.getHexString());
    const needUv = (o) => !!((catalogue[nameOfMat(o.material)] || {}).bump || o.material.map || o.userData.display || (o.name || '').startsWith('display_'));
    const addMesh = (o, into) => {
      const c = new T.Mesh(o.geometry, matCopy(o.material, nameOfMat(o.material))); c.userData = { slot: tag.split('@')[0] }; if (o.userData.display) c.userData.display = o.userData.display; if (o.userData.chk) c.userData.chk = o.userData.chk;
      c.position.copy(o.position); c.quaternion.copy(o.quaternion); c.scale.copy(o.scale); c.name = o.name && o.name.startsWith('display_') ? o.name : `${tag}_${++n}`;
      if (!needUv(o) && c.geometry.attributes.uv) { c.geometry = c.geometry.clone(); c.geometry.deleteAttribute('uv'); }
      const m = c.material;
      const pos = c.geometry.attributes.position, idx = c.geometry.index; tris += (idx ? idx.count : pos.count) / 3;
      h.update(`${c.userData.slot}|${m.name}|${c.name.startsWith('display_') ? c.name : ''}|${Array.from(c.position.toArray().concat(c.quaternion.toArray(), c.scale.toArray()), (x) => Math.round(x * 1e6)).join(',')}|${pos.count}|`);
      h.update(Buffer.from(new Float32Array(pos.array).buffer)); if (idx) h.update(Buffer.from(new Uint32Array(idx.array).buffer));
      into.add(c);
    };
    for (const o of fr.root) { const tmp = new T.Group(); addMesh(o, tmp); const c = tmp.children[0]; c.position.sub(shift); root.add(c); h.update('r'); }
    for (const [nm, nd] of fr.nodes) {
      const g = new T.Group(); g.name = nm;
      const piv = nd.pivot.clone(); un(piv); g.position.copy(piv);
      g.userData = { ...(nm.startsWith('part_') ? { part: nm.slice(5) } : {}), ...(nd.obj.userData.check ? { check: nd.obj.userData.check } : {}), owner: ownerTag(nm) === tag, ...(nd.parent ? { parent: nd.parent } : {}), ...(nd.obj.userData.leg ? { leg: nd.obj.userData.leg } : {}) };
      g.__piv = piv; h.update(`n|${nm}|${nd.parent}|${g.userData.owner}|${nd.obj.userData.leg ? JSON.stringify(nd.obj.userData.leg) : ''}|${piv.toArray().map((x) => Math.round(x * 1e6)).join(',')}|`);
      for (const o of nd.meshes) addMesh(o, g);
      root.add(g);
    }
    return { root, hash: h.digest('hex').slice(0, 16), tris };
  }

  /** Exports a pack scene to compressed glb bytes, validating it against the pack contract. */
  async function write(root, id, tag) {
    const raw = await new GLTFExporter().parseAsync(root, { binary: true, onlyVisible: false, includeCustomExtensions: false });
    const doc = await io.readBinary(new Uint8Array(raw));
    // (welded on the float32 positions, as exact as before: the quantising comes after, in compression())
    await doc.transform(dedup(), weld({ tolerance: 1e-9, toleranceNormal: 0.01 }), prune({ keepLeaves: true, keepAttributes: true }), ...compression());
    const buf = Buffer.from(await io.writeBinary(doc));
    const rep = Models.validatePack(Models.describeGltfJson(Models.glbJson(buf)), tag);
    if (rep.errors.length) throw new Error(`pack ${id}/${tag} breaks the pack contract:\n  ` + rep.errors.join('\n  '));
    return { buf, gz: zlib.gzipSync(buf, { level: 9 }).length };
  }
  return { buildPack, write, sha };
}

/**
 * A pack scene in a form that can be compared with another's up to a move: the triangles of every mesh in the gun's frame (float32, 9 per triangle), the corner of their
 * bounding box (`min`, glTF axes), the nodes' pivots, and a `sig` text (materials, sizes, node names) that equal packs share. Two packs are one shared pack when
 * their canon matches (sameCanon): the same shape wherever it sits.
 */
export function canonOf(root) {
  root.updateMatrixWorld(true);
  const meshes = [], min = [Infinity, Infinity, Infinity];
  root.traverse((o) => {
    if (!o.isMesh) return;
    const e = o.matrixWorld.elements, pos = o.geometry.attributes.position, idx = o.geometry.index, n = idx ? idx.count : pos.count, v = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const j = idx ? idx.getX(i) : i, x = pos.getX(j), y = pos.getY(j), z = pos.getZ(j);
      const X = e[0] * x + e[4] * y + e[8] * z + e[12], Y = e[1] * x + e[5] * y + e[9] * z + e[13], Z = e[2] * x + e[6] * y + e[10] * z + e[14];
      v[i * 3] = X; v[i * 3 + 1] = Y; v[i * 3 + 2] = Z;
      if (X < min[0]) min[0] = X; if (Y < min[1]) min[1] = Y; if (Z < min[2]) min[2] = Z;
    }
    meshes.push({ mat: o.material.name, name: (o.name || '').startsWith('display_') ? o.name : '', v });
  });
  if (!isFinite(min[0])) min.fill(0);
  const nodes = root.children.filter((c) => !c.isMesh).map((c) => ({ name: c.name, owner: c.userData.owner, parent: c.userData.parent || '', p: [c.position.x, c.position.y, c.position.z] }));
  const sig = [root.userData.pack.tag, meshes.map((m) => m.mat + ':' + m.name + ':' + m.v.length).join(','), nodes.map((n) => n.name + ':' + n.owner + ':' + n.parent).join(',')].join('|');
  return { sig, meshes, nodes, min };
}
/** Whether two canons are the same shape up to a move (every vertex and pivot within `tol` metres of the other's, measured from its own bounding-box corner). */
export function sameCanon(a, b, tol = 2e-6) {
  if (a.sig !== b.sig) return false;
  for (let m = 0; m < a.meshes.length; m++) {
    const x = a.meshes[m].v, y = b.meshes[m].v;
    for (let i = 0; i < x.length; i += 3) for (let k = 0; k < 3; k++) if (Math.abs((x[i + k] - a.min[k]) - (y[i + k] - b.min[k])) > tol) return false;
  }
  for (let n = 0; n < a.nodes.length; n++) for (let k = 0; k < 3; k++) if (Math.abs((a.nodes[n].p[k] - a.min[k]) - (b.nodes[n].p[k] - b.min[k])) > tol) return false;
  return true;
}

/** A file name for a pack: its key's parts joined by '+', safe characters only. */
export function packFileName(tag, key) {
  const s = key.map((k) => (k === '' ? '_' : k === '*' ? 'x' : k.replace(/[^A-Za-z0-9._-]/g, '_'))).join('+') || 'all';
  return `${tag.replace('@', '-on-')}/${s.length > 110 ? s.slice(0, 80) + '-' + crypto.createHash('sha1').update(s).digest('hex').slice(0, 8) : s}.glb`;
}
