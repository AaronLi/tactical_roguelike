// The pieces' levels of detail (docs/models.md "Levels of detail"): beside every piece file <file>.glb the bake writes <file>.lod1.glb,
// .lod2.glb and .lod3.glb, the same nodes with fewer triangles, and the game builds the third-person gun (everyone else's gun, the loot and
// the evidence on the floor: GunModels.world) from them, the level by how far it is. The first-person gun, the gunsmith, the hangar and the
// icons use the piece itself.
//
// A level is defined by the distance it is first used at: its tolerance is half a pixel there (the game's 75 degree view, 1080 pixels tall:
// 1.42 mm a pixel per metre), and the level is as few triangles as leave every part of the surface within that of where it was. Level 1 is
// used from nearest (it must stand a look from 1.5 m), level 2 from 10 m, level 3 from 40 m: js/viewmodel.ts WORLD_LOD_STEPS has the same
// distances (a scope's magnification and the screen's height are taken into the distance there).
//
// What a level does to each mesh of the piece (meshoptimizer's simplifier: edge collapse onto the vertices the mesh has, the topology kept,
// so a closed part stays closed):
//   - a display surface, a magazine-check mesh (extras.chk), a see-through one and one of 12 triangles or fewer are kept as they are (a
//     bump-mapped mesh is simplified like any other and loses its UVs: the third-person gun is drawn without them, js/viewmodel.ts merge);
//   - from level 2, a mesh smaller than a pixel (its box's diagonal under twice the tolerance) is left out (the piece keeps its largest if
//     that would leave none: a level file always holds something to place);
//   - the rest, each mesh on its own: its vertices welded by position and simplified to the tolerance, which is never more than 12 % of the
//     mesh's own size NOR 30 % OF ITS THINNEST SIDE. The second matters most: a receiver 35 mm across or a barrel 15 mm thick is "within
//     28 mm" of a flat sheet or of nothing at all, and a collapse to that is what a level 3 without the rule did (the AK's receiver and
//     barrel gone, its furniture left). A part that is drawn keeps its thickness, so its outline; what a far level sheds is the detail on
//     it. Loose bits smaller than the tolerance go (Prune);
//   - each corner is given back the normal the source had at that vertex that is nearest the new face's (a flat face stays flat, a round
//     one smooth), or the face's own where none is near.
// Then the plain meshes of a node that share a material are joined into one (the file is mostly nodes and accessors otherwise).
// The nodes (part_<key> pivots, group_ nodes, their extras) are the piece's own: a level is placed and animated exactly as the piece is.
import * as T from 'three';
import { MeshoptSimplifier } from 'meshoptimizer';

const FOV = 75, HEIGHT = 1080, PX = 0.5, SHAPE = 0.12, THIN = 0.3, KEEP_TRIS = 12;
const PIXEL = 2 * Math.tan((FOV * Math.PI) / 360) / HEIGHT; // (metres a pixel, a metre away)
/** The levels: { lod, from (m: the nearest it is looked at from), tol (m) }. */
export const LODS = [{ lod: 1, from: 1.5 }, { lod: 2, from: 10 }, { lod: 3, from: 40 }].map((l) => ({ ...l, tol: l.from * PIXEL * PX }));
export const lodFile = (file, lod) => file.replace(/\.glb$/, '.lod' + lod + '.glb');
export const lodReady = () => MeshoptSimplifier.ready;

const triCount = (g) => (g.index ? g.index.count : g.attributes.position.count) / 3;
const thinOf = (g) => { if (!g.boundingBox) g.computeBoundingBox(); if (g.boundingBox.isEmpty()) return 0; const z = g.boundingBox.getSize(new T.Vector3()); return Math.min(z.x, z.y, z.z); };
const diagOf = (g) => { if (!g.boundingBox) g.computeBoundingBox(); return g.boundingBox.isEmpty() ? 0 : g.boundingBox.getSize(new T.Vector3()).length(); };

/** A geometry simplified to tol (its own units), or the geometry itself when nothing is gained, or null when nothing is left of it. */
export function simplifyGeometry(geo, tol) {
  const pos = geo.attributes.position, nor = geo.attributes.normal, idx = geo.index, n = pos.count, tris = triCount(geo);
  if (!nor || tris < 1) return geo;
  // welded by position (a flat-shaded part has a vertex a face at every corner: the simplifier needs to know they are one place)
  const at = new Map(), remap = new Uint32Array(n), wp = [], normals = [];
  for (let i = 0; i < n; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i), k = Math.round(x * 1e6) + ',' + Math.round(y * 1e6) + ',' + Math.round(z * 1e6);
    let j = at.get(k);
    if (j === undefined) { j = wp.length / 3; at.set(k, j); wp.push(x, y, z); normals.push([]); }
    remap[i] = j;
    const l = normals[j], nx = nor.getX(i), ny = nor.getY(i), nz = nor.getZ(i);
    if (!l.some((q) => q[0] * nx + q[1] * ny + q[2] * nz > 0.9999)) l.push([nx, ny, nz]);
  }
  const ind = [];
  for (let t = 0; t < tris; t++) {
    const a = remap[idx ? idx.getX(t * 3) : t * 3], b = remap[idx ? idx.getX(t * 3 + 1) : t * 3 + 1], c = remap[idx ? idx.getX(t * 3 + 2) : t * 3 + 2];
    if (a !== b && b !== c && c !== a) ind.push(a, b, c);
  }
  if (!ind.length) return null;
  const P = new Float32Array(wp), [out] = MeshoptSimplifier.simplify(new Uint32Array(ind), P, 3, 0, tol, ['ErrorAbsolute', 'Prune']);
  if (!out.length) return null;
  if (out.length / 3 >= tris) return geo;
  const m = out.length, op = new Float32Array(m * 3), on = new Float32Array(m * 3);
  for (let t = 0; t < m; t += 3) {
    const a = out[t] * 3, b = out[t + 1] * 3, c = out[t + 2] * 3;
    const ux = P[b] - P[a], uy = P[b + 1] - P[a + 1], uz = P[b + 2] - P[a + 2], vx = P[c] - P[a], vy = P[c + 1] - P[a + 1], vz = P[c + 2] - P[a + 2];
    let fx = uy * vz - uz * vy, fy = uz * vx - ux * vz, fz = ux * vy - uy * vx; const fl = Math.hypot(fx, fy, fz) || 1; fx /= fl; fy /= fl; fz /= fl;
    for (let k = 0; k < 3; k++) {
      const v = out[t + k]; let best = null, bd = 0.5; // (a source normal within 60 degrees of the new face, else the face's own)
      for (const q of normals[v]) { const d = q[0] * fx + q[1] * fy + q[2] * fz; if (d > bd) { bd = d; best = q; } }
      op[(t + k) * 3] = P[v * 3]; op[(t + k) * 3 + 1] = P[v * 3 + 1]; op[(t + k) * 3 + 2] = P[v * 3 + 2];
      on[(t + k) * 3] = best ? best[0] : fx; on[(t + k) * 3 + 1] = best ? best[1] : fy; on[(t + k) * 3 + 2] = best ? best[2] : fz;
    }
  }
  const g = new T.BufferGeometry();
  g.setAttribute('position', new T.BufferAttribute(op, 3)); g.setAttribute('normal', new T.BufferAttribute(on, 3));
  return g;
}

/** Plain meshes of one node and one material as ONE mesh (positions and normals in the node's frame, the first's name): the third-person gun is merged by material
 *  anyway (js/viewmodel.ts merge), and a file's size is mostly its nodes and accessors, not its triangles. */
function joined(list) {
  let n = 0; for (const o of list) n += triCount(o.geometry) * 3;
  const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), v = new T.Vector3(), nm = new T.Matrix3(); let k = 0;
  for (const o of list) {
    o.updateMatrix(); nm.getNormalMatrix(o.matrix);
    const g = o.geometry, P = g.attributes.position, N = g.attributes.normal, I = g.index, c = I ? I.count : P.count;
    for (let i = 0; i < c; i++, k++) {
      const j = I ? I.getX(i) : i;
      v.fromBufferAttribute(P, j).applyMatrix4(o.matrix); pos[k * 3] = v.x; pos[k * 3 + 1] = v.y; pos[k * 3 + 2] = v.z;
      v.fromBufferAttribute(N, j).applyMatrix3(nm).normalize(); nor[k * 3] = v.x; nor[k * 3 + 1] = v.y; nor[k * 3 + 2] = v.z;
    }
  }
  const g = new T.BufferGeometry(); g.setAttribute('position', new T.BufferAttribute(pos, 3)); g.setAttribute('normal', new T.BufferAttribute(nor, 3));
  const m = new T.Mesh(g, list[0].material); m.name = list[0].name; m.userData = list[0].userData;
  return m;
}

/** A pack scene (tools/model_emit.mjs buildPack's root) at a level: a new root with the same nodes, names and extras; { root, tris, dropped }. */
export function lodRoot(root, level) {
  const out = new T.Group(); out.name = root.name; out.userData = root.userData;
  let tris = 0, dropped = 0; const made = [], gone = [];
  const special = (o) => (o.name || '').startsWith('display_') || o.userData.display || o.userData.chk || !o.geometry.attributes.normal;
  const kept = (o) => special(o) || o.material.transparent || o.material.opacity < 1 || triCount(o.geometry) <= KEEP_TRIS;
  const add = (c, into, g) => { into.add(c); made.push(c); tris += triCount(g); };
  const copy = (o, g) => { const c = new T.Mesh(g, o.material); c.name = o.name; c.userData = o.userData; c.__plain = !special(o); c.position.copy(o.position); c.quaternion.copy(o.quaternion); c.scale.copy(o.scale); return c; };
  const small = (o) => { const s = Math.max(Math.abs(o.scale.x), Math.abs(o.scale.y), Math.abs(o.scale.z)) || 1; return level.lod >= 2 && diagOf(o.geometry) * s < 2 * level.tol; };
  const meshAt = (o, into, force = false) => {
    const s = Math.max(Math.abs(o.scale.x), Math.abs(o.scale.y), Math.abs(o.scale.z)) || 1, diag = diagOf(o.geometry) * s;
    let g = o.geometry;
    if (!kept(o)) {
      if (!force && small(o)) { dropped++; gone.push([o, into]); return; }
      g = simplifyGeometry(o.geometry, Math.min(level.tol, SHAPE * diag, THIN * thinOf(o.geometry) * s) / s);
      if (!g) { if (!force) { dropped++; gone.push([o, into]); return; } g = o.geometry; }
    }
    add(copy(o, g), into, g);
  };
  const nodeAt = (list, into) => { for (const o of list) meshAt(o, into); };
  const groups = [out]; const rootMeshes = [];
  for (const ch of root.children) {
    if (ch.isMesh) { rootMeshes.push(ch); continue; }
    const g = new T.Group(); g.name = ch.name; g.userData = ch.userData; g.position.copy(ch.position); g.quaternion.copy(ch.quaternion); g.scale.copy(ch.scale);
    out.add(g); groups.push(g);
    nodeAt(ch.children.filter((m) => m.isMesh), g);
  }
  nodeAt(rootMeshes, out);
  if (!made.length && gone.length) { // (nothing left: the largest of what went, as far down as it goes)
    gone.sort((a, b) => diagOf(b[0].geometry) - diagOf(a[0].geometry)); dropped--; meshAt(gone[0][0], gone[0][1], true);
  }
  // the plain meshes of each node, one mesh a material
  for (const g of groups) {
    const by = new Map();
    for (const c of g.children) if (c.isMesh && c.__plain) { if (!by.has(c.material)) by.set(c.material, []); by.get(c.material).push(c); }
    for (const list of by.values()) { if (list.length < 2) continue; const at = g.children.indexOf(list[0]), m = joined(list); for (const c of list) g.remove(c); g.children.splice(at, 0, m); m.parent = g; }
  }
  return { root: out, tris, dropped };
}
