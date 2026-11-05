// AUTHORED SOURCES: a gun modelled in Blender is baked from its .glb with no recipe of its own (docs/models.md "Authored models", the contract in
// js/glb.ts GUN_MODEL_CONTRACT.authored).
//
//   models/<id>/<id>.glb     the model: base + factory parts (meshes by slot, part_<key> nodes), root extras info / anchors / seat
//   models/<id>/model.json   { "source": "authored", "sights": { "builtin": [...], "rail": [...] } }: marks the .glb as the authority for <id>
//
// What this file does for the baker (tools/bake_models.mjs, tools/model_env.mjs; nothing here is about one gun):
//   authoredIds()                      the guns that have an authored source
//   checkAuthored(Models, id, G?)      the source against the contract (js/glb.ts validateAuthored) and, with the game loaded, against the platform's
//                                      spec in js/parts.ts (its default build's factory slots, L / hgMax / mag against the anchors)
//   loadAuthoredInto(G)                reads every source into G.Authored (tools/models/authored.ts): the mesh geometry in the gun's frame, the
//                                      mount anchors as the frame the shared parts are seated on (rig), the sights rules, the factory info. The
//                                      generic seating (rcv 'authored' in tools/models/recipes.ts rifle()) builds the whole gun from that, and the
//                                      per-part packs, the platform index (anchors, info tables) and the sharing of the other guns' parts then come
//                                      from the one pipeline every platform goes through (tools/model_packs.mjs, model_emit.mjs, bake_parts.mjs)
//   authoredSrc()                      the sources' text, for the bake's staleness hash
// The .glb is read here with a small synchronous reader (positions, normals, indices, node transforms, extras): the recipes are synchronous.
import fs from 'fs'; import path from 'path'; import { fileURLToPath } from 'url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'), MODELS = path.join(ROOT, 'models');
const glbPath = (id) => path.join(MODELS, id, id + '.glb'), cfgPath = (id) => path.join(MODELS, id, 'model.json');

/** The ids with models/<id>/model.json saying source 'authored'. */
export function authoredIds() {
  if (!fs.existsSync(MODELS)) return [];
  return fs.readdirSync(MODELS).filter((id) => fs.existsSync(cfgPath(id))).filter((id) => { try { return JSON.parse(fs.readFileSync(cfgPath(id), 'utf8')).source === 'authored'; } catch (e) { return true; /* reported by checkAuthored */ } });
}
export const authoredFiles = (id) => ({ glb: glbPath(id), json: cfgPath(id) });
/** The text of every authored source (the bake's staleness hash covers it). */
export function authoredSrc() { return authoredIds().map((id) => id + '\0' + fs.readFileSync(cfgPath(id), 'utf8') + '\0' + (fs.existsSync(glbPath(id)) ? fs.readFileSync(glbPath(id)).toString('latin1') : '')).join('\0'); }

// ---- the .glb ----
export function parseGlb(buf) {
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  if (dv.getUint32(0, true) !== 0x46546c67) throw new Error('not a .glb (bad magic)');
  const jl = dv.getUint32(12, true), json = JSON.parse(new TextDecoder().decode(buf.subarray(20, 20 + jl)));
  let bin = null; const o = 20 + jl;
  if (o + 8 <= buf.length && dv.getUint32(o + 4, true) === 0x004e4942) bin = buf.subarray(o + 8, o + 8 + dv.getUint32(o, true));
  return { json, bin };
}
const COMP = { 5120: Int8Array, 5121: Uint8Array, 5122: Int16Array, 5123: Uint16Array, 5125: Uint32Array, 5126: Float32Array }, NCOMP = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 };
/** An accessor's elements as a plain Float64Array/typed copy (n * components). */
export function readAccessor(g, i) {
  const a = g.json.accessors[i], bv = g.json.bufferViews[a.bufferView], T = COMP[a.componentType], nc = NCOMP[a.type];
  if (!T || !nc) throw new Error(`accessor ${i}: unsupported type`);
  if (a.sparse) throw new Error(`accessor ${i}: sparse accessors are not supported`);
  const base = g.bin.byteOffset + (bv.byteOffset || 0) + (a.byteOffset || 0), stride = bv.byteStride || nc * T.BYTES_PER_ELEMENT, out = new T(a.count * nc);
  const dv = new DataView(g.bin.buffer, base - 0, Math.max(0, bv.byteLength - (a.byteOffset || 0)));
  const rd = { 5120: 'getInt8', 5121: 'getUint8', 5122: 'getInt16', 5123: 'getUint16', 5125: 'getUint32', 5126: 'getFloat32' }[a.componentType], sz = T.BYTES_PER_ELEMENT;
  for (let n = 0; n < a.count; n++) for (let c = 0; c < nc; c++) out[n * nc + c] = dv[rd](n * stride + c * sz, true);
  return out;
}
export const mul = (a, b) => { const o = new Array(16).fill(0); for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) for (let k = 0; k < 4; k++) o[c * 4 + r] += a[k * 4 + r] * b[c * 4 + k]; return o; };
export function local(n) {
  if (n.matrix) return n.matrix.slice();
  const t = n.translation || [0, 0, 0], [x, y, z, w] = n.rotation || [0, 0, 0, 1], s = n.scale || [1, 1, 1];
  return [(1 - 2 * (y * y + z * z)) * s[0], 2 * (x * y + z * w) * s[0], 2 * (x * z - y * w) * s[0], 0, 2 * (x * y - z * w) * s[1], (1 - 2 * (x * x + z * z)) * s[1], 2 * (y * z + x * w) * s[1], 0,
    2 * (x * z + y * w) * s[2], 2 * (y * z - x * w) * s[2], (1 - 2 * (x * x + y * y)) * s[2], 0, t[0], t[1], t[2], 1];
}
const jsonExtra = (ex, k) => { if (ex[k] !== undefined) return ex[k]; if (typeof ex[k + '_json'] === 'string') return JSON.parse(ex[k + '_json']); return undefined; };

/** One authored source, read: { cfg, root extras, meshes in the gun's frame, rig, sights, info }. Throws on a malformed file (checkAuthored reports the contract). */
export function readAuthored(id) {
  const cfg = JSON.parse(fs.readFileSync(cfgPath(id), 'utf8')), buf = fs.readFileSync(glbPath(id)), g = parseGlb(buf);
  const j = g.json, roots = (j.scenes[j.scene || 0] || {}).nodes || [];
  if (roots.length !== 1 || j.nodes[roots[0]].name !== id) throw new Error(`models/${id}/${id}.glb: one root node named "${id}"`);
  const rn = j.nodes[roots[0]], rx = rn.extras || {}, info = jsonExtra(rx, 'info'), anchors = jsonExtra(rx, 'anchors'), meshes = [];
  const walk = (ni, parentW, part) => {
    const n = j.nodes[ni], W = mul(parentW, local(n)), ex = n.extras || {};
    if ((n.name || '').startsWith('part_')) part = { key: ex.part || n.name.slice(5), at: [W[12], W[13], W[14]] };
    if (n.mesh != null) {
      for (const prim of j.meshes[n.mesh].primitives) {
        const P = readAccessor(g, prim.attributes.POSITION), Nm = prim.attributes.NORMAL != null ? readAccessor(g, prim.attributes.NORMAL) : null, cnt = P.length / 3;
        const pos = new Float32Array(cnt * 3), nrm = new Float32Array(cnt * 3);
        for (let i = 0; i < cnt; i++) {
          const x = P[i * 3], y = P[i * 3 + 1], z = P[i * 3 + 2];
          for (let a = 0; a < 3; a++) pos[i * 3 + a] = W[a] * x + W[4 + a] * y + W[8 + a] * z + W[12 + a];
          if (Nm) { const u = Nm[i * 3], v = Nm[i * 3 + 1], w = Nm[i * 3 + 2]; const q = [0, 1, 2].map((a) => W[a] * u + W[4 + a] * v + W[8 + a] * w), l = Math.hypot(q[0], q[1], q[2]) || 1; for (let a = 0; a < 3; a++) nrm[i * 3 + a] = q[a] / l; }
        }
        const idx = prim.indices != null ? readAccessor(g, prim.indices) : Uint32Array.from({ length: cnt }, (_, i) => i);
        const e = { slot: ex.slot || 'base', mat: (prim.material != null && j.materials[prim.material].name) || 'black', pos, nrm, idx: idx instanceof Uint16Array || idx instanceof Uint32Array ? idx : Uint32Array.from(idx) };
        if (part) { e.part = part.key; e.at = part.at.map((c) => +c.toFixed(5)); }
        if (ex.role === 'tube') e.legacyTube = true; // (an older export: see below)
        meshes.push(e);
      }
    }
    for (const c of n.children || []) walk(c, W, part);
  };
  const I = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
  for (const c of rn.children || []) walk(c, mul(I, local(rn)), null);
  // An older export marks the barrel's bare tube with extras.role "tube" and holds the fixed fittings on the barrel (gas block, gas tube, collar) in slot
  // barrel too. Slot barrel is now only the factory barrel and the fittings are slot base: read such a file that way (until it is exported again).
  if (meshes.some((e) => e.legacyTube)) for (const e of meshes) if (e.slot === 'barrel' && !e.legacyTube) e.slot = 'base';
  for (const e of meshes) delete e.legacyTube;
  return { id, cfg, json: j, rootExtras: rx, info, anchors, meshes };
}
/** The recipes' view of a source (tools/models/authored.ts AuthoredGun): the anchors become the frame the shared parts are seated on. */
export function toAuthoredGun(src) {
  const a = src.anchors, f = (k) => a[k][0];
  return {
    src: `models/${src.id}/${src.id}.glb`, info: src.info, meshes: src.meshes, sights: { builtin: src.cfg.sights.builtin.slice(), rail: src.cfg.sights.rail.slice() },
    rig: { top: a.mount_optic[1], rail: [f('mount_optic'), f('mount_optic_end')], hgF: f('mount_handguard'), hgEnd: f('mount_handguard_end'), end: f('mount_muzzle'), barrel: f('mount_barrel'), stockY: a.mount_stock[1], gripY: a.mount_grip[1], mag: [a.mount_mag[0], a.mount_mag[1]] },
  };
}
/** Fills G.Authored (the vm's, tools/models/authored.ts) from every authored source. Call after the recipes are loaded. */
export function loadAuthoredInto(G) { for (const id of authoredIds()) G.Authored[id] = toAuthoredGun(readAuthored(id)); }

// ---- checks ----
const FACTORY_SLOTS = ['barrel', 'handguard', 'stock', 'grip', 'mag', 'muzzle', 'optic'];
/** The mesh slots the platform's default build fills (a part in the build slot of that kind). */
export function factorySlots(G, id) { const b = G.Gunsmith.defaultBuild(id); return [...new Set(Object.keys(b).filter((s) => b[s]).map((s) => s.replace(/\d+$/, '')).filter((s) => FACTORY_SLOTS.includes(s)))]; }
const near = (a, b) => Math.abs(a - b) < 1e-6;

/**
 * An authored source against the contract (Models = js/glb.ts in node) and, given the loaded game G, against the platform's spec in js/parts.ts. Returns
 * { errors, warnings }: a missing anchor or slot names itself.
 */
export function checkAuthored(Models, id, G = null) {
  const errors = [], warnings = [], E = (m) => errors.push(m);
  if (!fs.existsSync(glbPath(id))) return { errors: [`models/${id}/${id}.glb is missing (model.json says the gun is authored)`], warnings };
  let cfg; try { cfg = JSON.parse(fs.readFileSync(cfgPath(id), 'utf8')); } catch (e) { return { errors: [`models/${id}/model.json: ${e.message}`], warnings }; }
  for (const m of Models.validateAuthoredConfig(cfg)) E(m);
  const rep = Models.validateAuthored(Models.describeGltfJson(Models.glbJson(fs.readFileSync(glbPath(id)))), id, { factory: G ? factorySlots(G, id) : undefined });
  errors.push(...rep.errors); warnings.push(...rep.warnings);
  if (G && !errors.length) {
    const a = readAuthored(id), A = toAuthoredGun(a), spec = G.Gunsmith.modelSpec({ id, build: G.Gunsmith.defaultBuild(id) });
    if (spec.rcv !== 'authored' || spec.authored !== id) E(`js/parts.ts: the platform ${id} is an authored gun: its spec needs rcv: 'authored', authored: '${id}' (it says rcv ${spec.rcv}, authored ${spec.authored})`);
    if (spec.L == null || !near(spec.L, A.rig.hgF)) E(`js/parts.ts: ${id}'s spec L is ${spec.L}, the model's mount_handguard is ${A.rig.hgF}: the same point (where a handguard starts)`);
    const room = A.rig.hgEnd - A.rig.hgF - 0.003;
    if (spec.hgMax == null || Math.abs(spec.hgMax - room) > 1e-4) E(`js/parts.ts: ${id}'s spec hgMax is ${spec.hgMax}, the model's mount_handguard_end - mount_handguard - 3 mm is ${room.toFixed(4)}: the longest handguard it takes (fit is data)`);
    const mg = spec.mag || {};
    if (!near(mg.f, A.rig.mag[0]) || !near(mg.y, A.rig.mag[1])) E(`js/parts.ts: ${id}'s spec mag is [${mg.f}, ${mg.y}], the model's mount_mag is [${A.rig.mag}]`);
  }
  return { errors, warnings };
}
