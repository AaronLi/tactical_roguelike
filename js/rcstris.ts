'use strict';
// What js/radar.ts rcsOf and js/space.ts fitMounts, radarKit and hullClear work out from drawn meshes, worked out from triangles
// (js/hullshape.ts): the same maths, no scene. docs/space-server.md phase B. Checked against the meshes' by
// tools/space_steps/shapes_check.mjs (the page) and tools/shapes_node_check.mjs (node).
//   rcsOfTris(tris, flags?)        Radar.rcsOf's table (flags: what rcsOf leaves out, flat colours and see-through, is left out)
//   foeSuite(map, shape)           the mission ship's radar suite as ewStep makes it (her box from the shape)
//   fitMountsTris(su, shape)       fitMounts: her guns, scanners and trackers set on her plating (su changed in place, as it is
//                                  there; the guns' new heights returned, oy the mount's, y the gun's)
//   radarKitTris(su)               radarKit's antennae, masts and dishes, as triangles in her frame
//   hullClearPrep(tris, flags), hullClearTris(prep, site, boxes)   hullClear: whether the squad's ship at a site is clear of her
//   hullRcs(map, shape)            the chain ewStep runs for the mission ship: suite, mounts fitted, kit, table
import { Radar } from './radar.js';
import { SF, ShapeKit, Shape, HullShapeT, ShapeGun } from './hullshape.js';

export interface RcsT { s: Float32Array; max: number; mean: number }
const NAZ = 72, NEL = 37, KS = 3, KP = 40, KD = 0.05, TAU = Math.PI * 2;
const azOf = (x: number, z: number) => Math.atan2(x, -z);
/** js/radar.ts rcsOf, on a triangle list (x, y, z of each corner, 9 a triangle, in the target's own frame) */
export function rcsOfTris(tris: ArrayLike<number>, flags?: Uint8Array | null, skip = SF.BASIC | SF.TRANS): RcsT {
  const HA = 64, HE = 32, area = new Float32Array(HA * HE), nx = new Float32Array(HA * HE), ny = new Float32Array(HA * HE), nz = new Float32Array(HA * HE);
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), n = new THREE.Vector3(), nt = tris.length / 9;
  for (let t = 0; t < nt; t++) {
    if (flags && (flags[t] & skip)) continue;
    const o = t * 9; a.set(tris[o], tris[o + 1], tris[o + 2]); b.set(tris[o + 3], tris[o + 4], tris[o + 5]); c.set(tris[o + 6], tris[o + 7], tris[o + 8]);
    n.subVectors(b, a).cross(c.sub(a)); const A = n.length() / 2; if (A < 1e-6) continue; n.multiplyScalar(0.5 / A);
    const ia = Math.min(HA - 1, Math.floor(((azOf(n.x, n.z) / TAU) + 1) % 1 * HA)), ie = Math.min(HE - 1, Math.floor((Math.asin(Math.max(-1, Math.min(1, n.y))) / Math.PI + 0.5) * HE)), k = ie * HA + ia;
    area[k] += A; nx[k] += A * n.x; ny[k] += A * n.y; nz[k] += A * n.z;
  }
  const bins: number[][] = [];
  for (let k = 0; k < HA * HE; k++) if (area[k] > 0) { const l = Math.hypot(nx[k], ny[k], nz[k]) || 1; bins.push([area[k], nx[k] / l, ny[k] / l, nz[k] / l]); }
  const s = new Float32Array(NAZ * NEL); let max = 0, sum = 0;
  for (let j = 0; j < NEL; j++) {
    const el = (j / (NEL - 1) - 0.5) * Math.PI, ce = Math.cos(el), uy = Math.sin(el);
    for (let i = 0; i < NAZ; i++) {
      const az = i / NAZ * TAU, ux = Math.sin(az) * ce, uz = -Math.cos(az) * ce;
      let sig = 0;
      for (const q of bins) { const d = q[1] * ux + q[2] * uy + q[3] * uz; if (d > 0) sig += q[0] * (KS * Math.pow(d, KP) + KD * d); }
      s[j * NAZ + i] = sig; if (sig > max) max = sig; sum += sig * ce;
    }
  }
  let wsum = 0; for (let j = 0; j < NEL; j++) wsum += Math.cos((j / (NEL - 1) - 0.5) * Math.PI) * NAZ;
  return { s, max, mean: sum / wsum };
}
/** the table to base64 (its Float32 bytes, little-endian) and back: space.json's form */
export function rcsB64(r: RcsT) { const u = new Uint8Array(r.s.buffer, r.s.byteOffset, r.s.byteLength); let bin = ''; for (let i = 0; i < u.length; i++) bin += String.fromCharCode(u[i]); return btoa(bin); }
export function rcsFromB64(b64: string): RcsT {
  const bin = atob(b64), u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
  const s = new Float32Array(u.buffer); let max = 0, sum = 0, wsum = 0;
  for (let j = 0; j < NEL; j++) { const ce = Math.cos((j / (NEL - 1) - 0.5) * Math.PI); for (let i = 0; i < NAZ; i++) { const v = s[j * NAZ + i]; if (v > max) max = v; sum += v * ce; } wsum += ce * NAZ; }
  return { s, max, mean: sum / wsum };
}

/** a hull shape's exact triangles with its guns' mounts where fitMounts put them (fit: fitMountsTris's) */
export function withGuns(sh: HullShapeT, fit: { guns: { oy: number }[] }): Float64Array { return sh.regun(fit.guns.map((g) => g.oy)); }
const cat = (a: Float64Array, b: Float64Array) => { const o = new Float64Array(a.length + b.length); o.set(a); o.set(b, a.length); return o; };
const cat8 = (a: Uint8Array, b: Uint8Array) => { const o = new Uint8Array(a.length + b.length); o.set(a); o.set(b, a.length); return o; };

/** js/space.ts ewStep's suite for the mission ship (hb: map.sp.hull; her box: what isn't a glow, the shape's bbox) */
export function foeSuite(map: LvMap, sh: Shape) {
  const hb = map.sp!.hull, bb = sh.bbox, empty = !(bb.max[0] >= bb.min[0]);
  const c = new THREE.Vector3((hb.x0 + hb.x1) / 2, empty ? 0 : (bb.min[1] + bb.max[1]) / 2, (hb.z0 + hb.z1) / 2), h = empty ? 20 : bb.max[1] - c.y;
  const su = Radar.suite('hull', (hb.x1 - hb.x0) / 2, h + 0.6, (hb.z1 - hb.z0) / 2 + 0.8, (empty ? -20 : bb.min[1] - c.y) - 0.6, 8);
  su.P.copy(c); su.Q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 2);
  return { su, c, sz: Math.max((hb.x1 - hb.x0), (hb.z1 - hb.z0)) / 2 };
}

// ---- fitMounts: rays onto her plating. Each triangle tested as three's Mesh.raycast does (Ray.intersectTriangle, a one-sided
// material's back faces culled; a hit past far not counted), the nearest hit taken (Raycaster.intersectObjects sorts by distance)
type RayTris = { tris: Float64Array; ds: Uint8Array; n: number; bb: Float64Array };
function rayTris(tris: ArrayLike<number> & { subarray(a: number, b: number): ArrayLike<number> }, flags: Uint8Array, keep: (t: number) => boolean): RayTris {
  const idx: number[] = []; for (let t = 0; t < flags.length; t++) if (keep(t)) idx.push(t);
  const out = new Float64Array(idx.length * 9), ds = new Uint8Array(idx.length), bb = new Float64Array(idx.length * 6);
  idx.forEach((t, i) => {
    out.set(tris.subarray(t * 9, t * 9 + 9), i * 9); ds[i] = flags[t] & SF.DS ? 1 : 0;
    for (let c = 0; c < 3; c++) { const a = out[i * 9 + c], b = out[i * 9 + 3 + c], d = out[i * 9 + 6 + c]; bb[i * 6 + c] = Math.min(a, b, d); bb[i * 6 + 3 + c] = Math.max(a, b, d); }
  });
  return { tris: out, ds, n: idx.length, bb };
}
function hitAt(rt: RayTris, from: THREE.Vector3, dir: THREE.Vector3, far = 400): THREE.Vector3 | null {
  // (Mesh.raycast takes the ray into the mesh's frame, its way through transformDirection: normalised. Every solid mesh of hers is
  // in her group's frame, the identity, so that's all it does)
  const ray = new THREE.Ray(from.clone(), dir.clone().normalize()), a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), p = new THREE.Vector3();
  let best: THREE.Vector3 | null = null, bd = Infinity;
  // (a cheap reject first: the ray's box out to far against the triangle's)
  const e = from.clone().addScaledVector(dir, far), lo = [Math.min(from.x, e.x), Math.min(from.y, e.y), Math.min(from.z, e.z)], hi = [Math.max(from.x, e.x), Math.max(from.y, e.y), Math.max(from.z, e.z)];
  for (let i = 0; i < rt.n; i++) {
    const B = rt.bb; let out = false; for (let k = 0; k < 3; k++) if (B[i * 6 + 3 + k] < lo[k] - 1e-6 || B[i * 6 + k] > hi[k] + 1e-6) { out = true; break; }
    if (out) continue;
    const o = i * 9; a.set(rt.tris[o], rt.tris[o + 1], rt.tris[o + 2]); b.set(rt.tris[o + 3], rt.tris[o + 4], rt.tris[o + 5]); c.set(rt.tris[o + 6], rt.tris[o + 7], rt.tris[o + 8]);
    if (!ray.intersectTriangle(a, b, c, !rt.ds[i], p)) continue;
    const d = from.distanceTo(p); if (d > far) continue;
    if (d < bd) { bd = d; best = p.clone(); }
  }
  return best;
}
/** js/space.ts fitMounts on the shape: su's scanners and trackers moved onto her plating (in place); returns each gun's mount
 *  height (oy) and gun height (y) after it, and dy, how far each gun's mount moved */
export function fitMountsTris(su: ReturnType<typeof Radar.suite>, sh: HullShapeT) {
  const rt = rayTris(sh.exact, sh.flags, (t) => !(sh.flags[t] & (SF.BASIC | SF.TRANS)) && sh.gun[t] < 0);
  const guns = sh.guns.map((g) => ({ oy: g.oy, y: g.y })), dy = sh.guns.map(() => 0);
  sh.guns.forEach((gn: ShapeGun, i) => {
    if (gn.k === 'missile') return;
    const p = hitAt(rt, new THREE.Vector3(gn.x, gn.inv ? -200 : 200, gn.z), new THREE.Vector3(0, gn.inv ? 1 : -1, 0)); if (!p) return;
    const q = guns[i];
    if (gn.inv) { if (p.y < q.oy + 0.3) { q.oy = p.y - 0.1; q.y = q.oy - 1.5; } }
    else if (p.y > q.oy - 0.3) { q.oy = p.y + 0.1; q.y = q.oy + 1.5; }
    dy[i] = q.oy - gn.oy;
  });
  for (const sc of su.scans) {
    const n = sc.n.clone().applyQuaternion(su.Q), foot = sc.at.clone().addScaledVector(sc.n, -sc.mast).applyQuaternion(su.Q).add(su.P);
    const p = hitAt(rt, foot.clone().addScaledVector(n, 200), n.clone().negate()); if (!p) continue;
    sc.at.copy(p.addScaledVector(n, sc.mast).sub(su.P).applyQuaternion(su.Q.clone().invert()));
  }
  for (const tr of su.trks) {
    const out = new THREE.Vector3(tr.side, 0, 0).applyQuaternion(su.Q), w = tr.at.clone().applyQuaternion(su.Q).add(su.P), p = hitAt(rt, w.clone().addScaledVector(out, 3), out.clone().negate());
    if (p) tr.at.copy(p.addScaledVector(out, 0.2).sub(su.P).applyQuaternion(su.Q.clone().invert()));
  }
  return { guns, dy };
}
/** js/space.ts radarKit's meshes (as it builds them, before anything's turned), in her frame */
export function radarKitTris(su: ReturnType<typeof Radar.suite>): Shape {
  const { N, mesh, emit, STD } = ShapeKit, T3 = THREE, g = new N(); g.live = true; const M = STD, D = STD, mz = new T3.Vector3(0, 0, -1);
  const mount = (at: THREE.Vector3) => { const o = new N(); o.position.copy(at).applyQuaternion(su.Q).add(su.P); o.quaternion = su.Q.clone(); g.add(o); return o; };
  for (const sc of su.scans) {
    const o = mount(sc.at), up = new T3.Quaternion().setFromUnitVectors(new T3.Vector3(0, 1, 0), sc.n), L = sc.mast, ms = new N(); ms.quaternion = up; ms.position.copy(sc.n).multiplyScalar(-L); o.add(ms);
    for (const [lx, lz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) { const leg = mesh(new T3.CylinderGeometry(0.12, 0.16, L, 6), D); leg.position.set(lx * 0.55 * (1 - 0.0), L / 2, lz * 0.55); ms.add(leg); }
    for (let k = 1; k < 4; k++) { const ring = mesh(new T3.BoxGeometry(1.3, 0.12, 1.3), D); ring.position.y = L * k / 4; ms.add(ring); }
    const plate = mesh(new T3.CylinderGeometry(1.4, 1.6, 0.4, 12), D); plate.position.y = 0.1; ms.add(plate);
    const r = new N(); o.add(r);
    const bar = mesh(sc.ax === 'y' ? new T3.BoxGeometry(7, 1.0, 0.35) : sc.ax === 'x' ? new T3.BoxGeometry(1.0, 7, 0.35) : new T3.BoxGeometry(7, 0.35, 1.0), M); bar.position.copy(Radar.dirOf(sc.ax, 0, 0)).multiplyScalar(0.4); r.add(bar);
    r.add(mesh(new T3.BoxGeometry(0.9, 0.9, 0.9), D));
  }
  for (const tr of su.trks) {
    const o = mount(tr.at), arm = mesh(new T3.BoxGeometry(1.4, 0.7, 0.7), D); arm.position.x = tr.side * 0.5; o.add(arm); const plate = mesh(new T3.BoxGeometry(0.4, 2.2, 2.2), D); plate.position.x = -tr.side * 0.1; o.add(plate);
    const d = new N(); d.position.x = tr.side * 1.3; o.add(d);
    const dish = mesh(new T3.CylinderGeometry(1.3, 0.35, 0.6, 16, 1, true), SF.DS); dish.rotation.x = -Math.PI / 2; dish.position.z = -0.3; d.add(dish);
    const feed = mesh(new T3.CylinderGeometry(0.06, 0.06, 1.4, 5), D); feed.rotation.x = Math.PI / 2; feed.position.z = -0.9; d.add(feed);
    d.quaternion = new T3.Quaternion().setFromUnitVectors(mz, tr.b);
  }
  return emit(g);
}
/** the whole of ewStep's chain for the mission ship: her suite, its mounts fitted, its kit added, her table (key: rcsOf's cache key there) */
export function hullRcs(map: LvMap, sh: HullShapeT) {
  const { su, c, sz } = foeSuite(map, sh), fit = fitMountsTris(su, sh), kit = radarKitTris(su);
  const tris = cat(withGuns(sh, fit), kit.exact), flags = cat8(sh.flags, kit.flags);
  return { su, c, sz, fit, kit, tris, flags, rcs: rcsOfTris(tris, flags) };
}

// ---- hullClear: her triangles (bar added light) against the squad's ship's solids berthed at a site
export type ClearPrep = { v: Float64Array; b: Float64Array; n: number };
export function hullClearPrep(tris: Float64Array, flags: Uint8Array): ClearPrep {
  const keep: number[] = [];
  for (let t = 0; t < flags.length; t++) {
    if (flags[t] & SF.ADD) continue;
    const o = t * 9; if (tris[o] === tris[o + 3] && tris[o + 1] === tris[o + 4] && tris[o + 2] === tris[o + 5] && tris[o + 3] === tris[o + 6] && tris[o + 4] === tris[o + 7] && tris[o + 5] === tris[o + 8]) continue; // (cut away: js/shipmodel.ts cutAt)
    keep.push(t);
  }
  const v = new Float64Array(keep.length * 9), b = new Float64Array(keep.length * 6);
  keep.forEach((t, i) => { v.set(tris.subarray(t * 9, t * 9 + 9), i * 9); for (let c = 0; c < 3; c++) { const x = v[i * 9 + c], y = v[i * 9 + 3 + c], z = v[i * 9 + 6 + c]; b[i * 6 + c] = Math.min(x, y, z); b[i * 6 + 3 + c] = Math.max(x, y, z); } });
  return { v, b, n: keep.length };
}
/** js/space.ts hullClear for one site: boxes, SpaceData.worldBoxes(def, SpaceData.berthAt(def, s)) */
export function hullClearTris(P: ClearPrep, s: { x: number; z: number; nx: number; nz: number }, boxes: { b: number[] }[]) {
  if (!P.n) return true;
  const inHole = (c: THREE.Vector3) => { const out = (c.x - s.x) * s.nx + (c.z - s.z) * s.nz, al = s.nx ? c.z - s.z : c.x - s.x; return Math.abs(al) < 2.3 && out > -0.5 && out < 2.4 && c.y > -0.9 && c.y < 3.5; };
  const B = new THREE.Box3(), tb = new THREE.Box3(), tri = new THREE.Triangle(), c = new THREE.Vector3(), a = new THREE.Vector3(), b2 = new THREE.Vector3(), d = new THREE.Vector3();
  for (const bx of boxes) {
    B.min.set(bx.b[0] + 0.02, bx.b[1] + 0.02, bx.b[2] + 0.02); B.max.set(bx.b[3] - 0.02, bx.b[4] - 0.02, bx.b[5] - 0.02);
    for (let i = 0; i < P.n; i++) {
      tb.min.set(P.b[i * 6], P.b[i * 6 + 1], P.b[i * 6 + 2]); tb.max.set(P.b[i * 6 + 3], P.b[i * 6 + 4], P.b[i * 6 + 5]); if (!tb.intersectsBox(B)) continue;
      const o = i * 9; a.set(P.v[o], P.v[o + 1], P.v[o + 2]); b2.set(P.v[o + 3], P.v[o + 4], P.v[o + 5]); d.set(P.v[o + 6], P.v[o + 7], P.v[o + 8]);
      c.copy(a).add(b2).add(d).multiplyScalar(1 / 3); if (inHole(c)) continue;
      tri.set(a, b2, d); if (B.intersectsTriangle(tri)) return false;
    }
  }
  return true;
}
