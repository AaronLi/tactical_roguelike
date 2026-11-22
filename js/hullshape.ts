'use strict';
// Shapes as data (docs/space-server.md phase B): what js/shipmodel.ts draws of a ship, as triangles only, with no scene, no meshes,
// no materials and no DOM, so the battle can be worked out where nothing's drawn (the server worker, node). Each triangle carries
// what the mesh code's consumers filter on: whether its material is a flat colour (MeshBasic: a glow, a lamp), see-through, added
// light (additive: plumes, washes), two-sided, part of the hull's dressing that cutAt smashes away, and which hull gun it's on.
//   HullShape.of(map):         ShipModel.hull(map)'s triangles, in her group's frame, and her guns, the same seeded draws in the same order
//   TrafficShape.of(kind, s):  ShipModel.traffic(kind, seed)'s, bow to -z, her middle at the origin, and her length
// They're built through a little scene graph of their own (N: a position, rotation and scale, children, a geometry), so the code
// below reads as shipmodel.ts's does, call for call; three's geometry classes and maths (no materials) do the rest, which the
// worker and node both have. Keep them in step with js/shipmodel.ts hull / traffic: tools/space_steps/shapes_check.mjs and
// tools/shapes_node_check.mjs compare them.
import { Level } from './level.js';
import { ShipGen } from './shipgen.js';
import { SpaceData } from './spacedata.js';
import { U as G_U } from './util.js';

/** what a triangle's material is, as the mesh code's filters see it */
export const SF = { BASIC: 1, TRANS: 2, ADD: 4, DS: 8, DECOR: 16 } as const;
export interface ShapeGun { k: 'pd' | 'mg' | 'missile'; inv: boolean; x: number; y: number; z: number; hp: number; cool: number; oy: number }
export interface Shape {
  /** x, y, z of each corner, 9 a triangle, in the model group's frame */
  tris: Float32Array;
  /** a triangle's SF bits */
  flags: Uint8Array;
  /** the hull gun a triangle is on (its index in guns), -1 for none */
  gun: Int16Array;
  /** the box round what isn't a glow (neither BASIC nor TRANS): js/space.ts ewStep's */
  bbox: { min: number[]; max: number[] };
  /** the box round everything */
  bboxAll: { min: number[]; max: number[] };
  /** tris as the radar's maths sees them: what the mesh code bakes into one merged mesh (js/shipmodel.ts compact) as stored there,
   *  in 32-bit floats; what it leaves as meshes of their own, moved by their matrices when they're read (her guns, the radars'
   *  kit), unrounded, as rcsOf and the raycaster work them out from the meshes' matrices */
  exact: Float64Array;
}
export interface HullShapeT extends Shape {
  guns: ShapeGun[];
  /** exact with each gun's mount at height oy[i] (fitMounts moves them): worked out through the same matrices as the mount's mesh */
  regun: (oy: number[]) => Float64Array;
}
export interface TrafficShapeT extends Shape { len: number }

type Mat = number; // (its SF bits)
const T = () => THREE;
// ---- a scene graph of its own: just enough of Object3D for the matrices to come out as three's do
class N {
  position = new THREE.Vector3(); rotation = new THREE.Euler(); scale = new THREE.Vector3(1, 1, 1); children: N[] = [];
  quaternion: THREE.Quaternion | null = null; // (set: used as it is, as Object3D.quaternion; else the rotation's)
  geo: THREE.BufferGeometry | null = null; m: Mat = 0; gun = -1; decor = false; live = false; // (live: not baked, js/shipmodel.ts compact keeps it a mesh of its own)
  constructor(geo?: THREE.BufferGeometry, m?: Mat) { if (geo) { this.geo = geo; this.m = m || 0; } }
  add(c: N) { this.children.push(c); return this; }
}
const mesh = (geo: THREE.BufferGeometry, m: Mat) => new N(geo, m);
const part = (g: N, me: N, x: number, y: number, z: number) => { me.position.set(x, y, z); g.add(me); return me; };
// (every geometry node under root, in root's frame: the world matrix as Object3D.updateMatrixWorld makes it, parent times own)
type Walked = { pos: number[]; live: number[]; fl: number[]; gn: number[]; at: Map<N, [number, number]>; boxes: { f: number; b: THREE.Box3 }[] };
function walkOf(root: N, W0 = new THREE.Matrix4(), into?: Walked): Walked {
  const w: Walked = into || { pos: [], live: [], fl: [], gn: [], at: new Map(), boxes: [] };
  const q = new THREE.Quaternion(), L = new THREE.Matrix4(), v = new THREE.Vector3();
  const walk = (o: N, W: THREE.Matrix4, gun: number, decor: boolean, live: boolean) => {
    if (o.quaternion) q.copy(o.quaternion); else q.setFromEuler(o.rotation); L.compose(o.position, q, o.scale);
    const Wo = new THREE.Matrix4().multiplyMatrices(W, L), gi = o.gun >= 0 ? o.gun : gun, dc = decor || o.decor, lv = live || o.live, t0 = w.fl.length;
    if (o.geo) {
      const P = o.geo.attributes.position as THREE.BufferAttribute, ix = o.geo.index, n = ix ? ix.count : P.count, f = o.m | (dc ? SF.DECOR : 0);
      for (let i = 0; i + 2 < n; i += 3) {
        for (let k = 0; k < 3; k++) { v.fromBufferAttribute(P, ix ? ix.getX(i + k) : i + k).applyMatrix4(Wo); w.pos.push(v.x, v.y, v.z); }
        w.fl.push(f); w.gn.push(gi); w.live.push(lv ? 1 : 0);
      }
      // (a mesh of its own's box, as three makes it: its geometry's box, its corners moved by its matrix)
      if (lv) w.boxes.push({ f, b: new THREE.Box3().setFromBufferAttribute(P).applyMatrix4(Wo) });
    }
    for (const c of o.children) walk(c, Wo, gi, dc, lv);
    if (o.gun >= 0) w.at.set(o, [t0, w.fl.length]);
  };
  walk(root, W0, -1, false, false);
  return w;
}
function emit(root: N): Shape { return emitW(root).sh; }
function emitW(root: N): { sh: Shape; at: Map<N, [number, number]> } {
  const { pos, fl, gn, live, at, boxes } = walkOf(root);
  const tris = new Float32Array(pos), exact = new Float64Array(pos), b0 = [1e30, 1e30, 1e30], b1 = [-1e30, -1e30, -1e30], a0 = [1e30, 1e30, 1e30], a1 = [-1e30, -1e30, -1e30];
  for (let t = 0; t < fl.length; t++) if (!live[t]) for (let k = 0; k < 9; k++) exact[t * 9 + k] = tris[t * 9 + k];
  // (the boxes: a baked mesh's round its stored corners; a mesh of its own's, its own box moved by its matrix: js/space.ts ewStep's way)
  const put = (x: number, c: number, f: number) => { if (x < a0[c]) a0[c] = x; if (x > a1[c]) a1[c] = x; if (!(f & (SF.BASIC | SF.TRANS))) { if (x < b0[c]) b0[c] = x; if (x > b1[c]) b1[c] = x; } };
  for (let t = 0; t < fl.length; t++) if (!live[t]) for (let k = 0; k < 3; k++) for (let c = 0; c < 3; c++) put(tris[t * 9 + k * 3 + c], c, fl[t]);
  for (const { f, b } of boxes) if (!b.isEmpty()) for (let c = 0; c < 3; c++) { put(b.min.getComponent(c), c, f); put(b.max.getComponent(c), c, f); }
  return { sh: { tris, exact, flags: new Uint8Array(fl), gun: new Int16Array(gn), bbox: { min: b0, max: b1 }, bboxAll: { min: a0, max: a1 } }, at };
}
// ---- js/shipmodel.ts Kit: boxes gathered by material, each six faces of two triangles (the same corners in the same order)
class Kit {
  by = new Map<Mat, number[][]>();
  box(m: Mat, x0: number, y0: number, z0: number, x1: number, y1: number, z1: number) { let a = this.by.get(m); if (!a) this.by.set(m, a = []); a.push([Math.min(x0, x1), Math.min(y0, y1), Math.min(z0, z1), Math.max(x0, x1), Math.max(y0, y1), Math.max(z0, z1)]); }
  build(into: N) {
    for (const [m, bs] of this.by) {
      const pos = new Float32Array(bs.length * 72), idx: number[] = [];
      bs.forEach(([x0, y0, z0, x1, y1, z1], b) => {
        const F: number[][][] = [[[x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1]], [[x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0]], [[x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0]],
          [[x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1]], [[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]], [[x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0]]];
        F.forEach((vs, f) => { const o = (b * 6 + f) * 4; vs.forEach((vv, k) => pos.set(vv, (o + k) * 3)); idx.push(o, o + 1, o + 2, o, o + 2, o + 3); });
      });
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setIndex(idx);
      into.add(mesh(g, m));
    }
    this.by.clear();
  }
}
const flat = (pos: number[]) => { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); return g; };
// the materials, by what the filters see: standard (front side only), standard two-sided, a flat colour, see-through, added light
const STD = 0, STD2 = SF.DS, LIT = SF.BASIC, GLASS = SF.TRANS | SF.DS, ADDL = SF.BASIC | SF.TRANS | SF.ADD | SF.DS;
const sideOf = (o?: Record<string, any>) => (o && o.side === 2 ? SF.DS : 0) | (o && o.transparent ? SF.TRANS : 0); // (THREE.DoubleSide is 2)
const M = (_c?: unknown, o?: Record<string, any>): Mat => sideOf(o);

// ---- js/shipmodel.ts hull(map): the outside of a ship that's boarded
function hullOf(map: LvMap): HullShapeT {
  const T3 = T(), g = new N(), K = new Kit(), TS = Level.TS, { W, H, t } = map, sp = map.sp!, th = map.theme, WH = Level.WALL_H, FH = Level.FLOOR_H, NF = map.floors ? map.floors.length : 1, TOP = (NF - 1) * FH + WH;
  const langOf = (size: SpSize): string => (th.liner && size === 'large' ? 'liner' : size === 'transport' ? (th.name === 'Corporate cutter' ? 'cutter' : 'freighter') : size === 'large' || size === 'capital' ? 'navy' : 'pirate');
  const r = G_U.rng((map.seed ^ 0x4a11) >>> 0);
  const shade = (_k: number, o?: Record<string, any>) => M(0, o);
  const plate = STD, dark = STD, light = STD, trim = STD, win = LIT, nav = LIT, eng = LIT;
  const solid = (x: number, z: number) => x >= 0 && z >= 0 && x < W && z < H && t[z * W + x] !== 5;
  for (let z = 0; z < H; z++) for (let x = 0; x < W;) {
    if (!solid(x, z)) { x++; continue; }
    let x1 = x; while (solid(x1 + 1, z)) x1++;
    K.box(plate, x * TS - 0.02, -1.0, z * TS, (x1 + 1) * TS + 0.02, -0.03, (z + 1) * TS);
    x = x1 + 1;
  }
  const belt = (x0: number, z0: number, x1: number, z1: number) => {
    K.box(dark, x0, -1.0, z0, x1, -0.02, z1);
    for (let f = 0; f < NF; f++) K.box(dark, x0, f * FH + 2.92, z0, x1, f === NF - 1 ? TOP + 0.5 : (f + 1) * FH + 0.72, z1);
  };
  const runL = LIT, keelL = LIT, lampL = LIT, port = LIT, stbd = LIT, white = LIT;
  const washM = ADDL, washG = new T3.PlaneGeometry(3.4, 2.95);
  const sideLights = (alongX: boolean, u0: number, u1: number, f: number, o: number) => {
    const bx = (m: Mat, a0: number, y0: number, d0: number, a1: number, y1: number, d1: number) => (alongX ? K.box(m, a0, y0, Math.min(f + o * d0, f + o * d1), a1, y1, Math.max(f + o * d0, f + o * d1)) : K.box(m, Math.min(f + o * d0, f + o * d1), y0, a0, Math.max(f + o * d0, f + o * d1), y1, a1));
    bx(runL, u0 + 0.2, TOP + 0.36, 0.28, u1 - 0.2, TOP + 0.44, 0.34);
    bx(keelL, u0 + 0.2, -0.72, 0.28, u1 - 0.2, -0.66, 0.34);
    for (let f2 = 0; f2 < NF; f2++) for (let u = u0 + 1.6; u < u1 - 1; u += 5.2) {
      bx(lampL, u - 0.3, f2 * FH + 2.8, 0.02, u + 0.3, f2 * FH + 2.9, 0.26);
      const wm = mesh(washG, washM); wm.position.set(alongX ? u : f + o * 0.03, f2 * FH + 1.42, alongX ? f + o * 0.03 : u); if (!alongX) wm.rotation.y = Math.PI / 2; g.add(wm);
    }
  };
  let bx0 = 1e9, bx1 = -1e9, bz0 = 1e9, bz1 = -1e9;
  for (let z = 0; z < H; z++) for (let x = 0; x < W; x++) if (solid(x, z)) { bx0 = Math.min(bx0, x); bx1 = Math.max(bx1, x + 1); bz0 = Math.min(bz0, z); bz1 = Math.max(bz1, z + 1); }
  if (bx1 > bx0) {
    const cx = (bx0 + bx1) / 2 * TS, cz = (bz0 + bz1) / 2 * TS, nb = (m: Mat, x: number, y: number, z: number, sz = 0.3) => K.box(m, x - sz / 2, y - sz / 2, z - sz / 2, x + sz / 2, y + sz / 2, z + sz / 2);
    const longX = bx1 - bx0 >= bz1 - bz0;
    for (const [m, sd] of [[port, -1], [stbd, 1]] as [Mat, number][]) for (const k of [0.2, 0.5, 0.8]) longX ? nb(m, (bx0 + (bx1 - bx0) * k) * TS, TOP + 0.75, sd < 0 ? bz0 * TS - 0.4 : bz1 * TS + 0.4) : nb(m, sd < 0 ? bx0 * TS - 0.4 : bx1 * TS + 0.4, TOP + 0.75, (bz0 + (bz1 - bz0) * k) * TS);
    for (const e of [0, 1]) longX ? nb(white, (e ? bx1 : bx0) * TS + (e ? 0.4 : -0.4), TOP * 0.5, cz, 0.36) : nb(white, cx, TOP * 0.5, (e ? bz1 : bz0) * TS + (e ? 0.4 : -0.4), 0.36);
    nb(white, cx, TOP + 2.3, cz, 0.3); K.box(dark, cx - 0.06, TOP, cz - 0.06, cx + 0.06, TOP + 2.2, cz + 0.06);
  }
  for (let z = 0; z < H; z++) for (const dz of [-1, 1]) for (let x = 0; x < W;) {
    if (!(solid(x, z) && !solid(x, z + dz))) { x++; continue; }
    let x1 = x; while (solid(x1 + 1, z) && !solid(x1 + 1, z + dz)) x1++;
    const zf = dz < 0 ? z * TS : (z + 1) * TS; belt(x * TS - 0.3, zf + (dz < 0 ? -0.3 : 0), (x1 + 1) * TS + 0.3, zf + (dz < 0 ? 0 : 0.3)); sideLights(true, x * TS, (x1 + 1) * TS, zf, dz);
    x = x1 + 1;
  }
  for (let x = 0; x < W; x++) for (const dx of [-1, 1]) for (let z = 0; z < H;) {
    if (!(solid(x, z) && !solid(x + dx, z))) { z++; continue; }
    let z1 = z; while (solid(x, z1 + 1) && !solid(x + dx, z1 + 1)) z1++;
    const xf = dx < 0 ? x * TS : (x + 1) * TS; belt(xf + (dx < 0 ? -0.3 : 0), z * TS, xf + (dx < 0 ? 0 : 0.3), (z1 + 1) * TS); sideLights(false, z * TS, (z1 + 1) * TS, xf, dx);
    z = z1 + 1;
  }
  // her guns (js/spacedata.ts SIZES guns), each its own subtree (gun: its index), as gunAt builds them
  const guns: ShapeGun[] = [], gunObjs: N[] = [], Y = TOP + 0.3, KEEL = -2.4, bellM = shade(0.3, { metalness: 0.5, side: 2 });
  const gunAt = (k: 'pd' | 'mg' | 'missile', x: number, z: number, y: number, inv = false) => {
    const o = new N(), gn = new N(); o.position.set(x, y, z); if (inv) o.rotation.z = Math.PI; o.gun = guns.length; o.live = true; gunObjs.push(o);
    if (k === 'pd') {
      part(o, mesh(new T3.CylinderGeometry(0.9, 1.1, 0.7, 12), dark), 0, 0.35, 0);
      part(gn, mesh(new T3.BoxGeometry(1.1, 0.7, 1.4), plate), 0, 0.35, 0);
      for (const sx of [-0.25, 0.25]) part(gn, mesh(new T3.CylinderGeometry(0.08, 0.08, 2.6, 8), dark), sx, 0.4, -1.7).rotation.x = Math.PI / 2;
    } else if (k === 'mg') {
      part(o, mesh(new T3.CylinderGeometry(1.5, 1.8, 0.9, 14), dark), 0, 0.45, 0);
      part(gn, mesh(new T3.BoxGeometry(1.8, 1.3, 2.6), plate), 0, 0.6, 0.5);
      part(gn, mesh(new T3.CylinderGeometry(0.75, 0.75, 1.4, 8, 1, true), plate), 1.25, 0.55, 0.6).rotation.x = Math.PI / 2;
      const spin = new N(); spin.position.set(0, 0.6, -0.9); gn.add(spin);
      for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2; part(spin, mesh(new T3.CylinderGeometry(0.09, 0.09, 4.2, 6), dark), Math.cos(a) * 0.3, Math.sin(a) * 0.3, -2.1).rotation.x = Math.PI / 2; }
      for (const zz of [-0.6, -3.6]) part(spin, mesh(new T3.CylinderGeometry(0.46, 0.46, 0.2, 10), dark), 0, 0, zz).rotation.x = Math.PI / 2;
    } else {
      part(o, mesh(new T3.BoxGeometry(3.2, 0.6, 3.2), dark), 0, 0.3, 0);
      const bx = part(gn, mesh(new T3.BoxGeometry(2.6, 1.5, 3.4), plate), 0, 0.9, 0); bx.rotation.x = 0.5;
      for (const sx of [-0.8, 0, 0.8]) for (const sy of [0.5, 1.2]) part(gn, mesh(new T3.CircleGeometry(0.3, 10), nav), sx, sy + 0.95, -1.42).rotation.x = 0.5;
    }
    gn.position.y = k === 'mg' ? 0.9 : 0.7; o.add(gn); g.add(o);
    guns.push({ k, inv, x, y: y + (inv ? -1 : 1) * (k === 'mg' ? 1.5 : 1.1), z, hp: k === 'pd' ? 100 : k === 'mg' ? 220 : 180, cool: 1 + r() * 3, oy: y });
  };
  {
    const C = SpaceData.gunsOf(sp.size, sp.hall === 'mall'), list: ('pd' | 'mg' | 'missile')[] = [], hm = sp.hull;
    for (let k = 0; k < Math.max(C.pd, C.mg, C.missile); k++) { if (k < C.mg) list.push('mg'); if (k < C.pd) list.push('pd'); if (k < C.missile) list.push('missile'); }
    for (let k = C.pd; k > 0 && list.filter((q) => q === 'pd').length < C.pd; k--) list.push('pd');
    let ng = 0;
    list.forEach((k, n) => {
      const u = (n + 0.5) / list.length, x = hm.x0 + (hm.x1 - hm.x0) * (0.14 + 0.72 * u), z = hm.zc + (n % 2 ? 1 : -1) * 3.4, inv = k !== 'missile' && ng++ % 2 === 1;
      if (!inv) { K.box(dark, x - 2.6, Y, z - 2.6, x + 2.6, Y + 0.8, z + 2.6); gunAt(k, x, z, Y + 0.8); }
      else { K.box(dark, x - 1.2, KEEL + 0.6, z - 1.2, x + 1.2, -0.8, z + 1.2); K.box(dark, x - 2.6, KEEL - 0.8, z - 2.6, x + 2.6, KEEL + 0.6, z + 2.6); gunAt(k, x, z, KEEL - 0.8, true); }
    });
  }
  map.rooms.forEach((rm, i) => {
    const role = sp.roles[i], x0 = rm.x * TS, z0 = rm.z * TS, x1 = (rm.x + rm.w) * TS, z1 = (rm.z + rm.h) * TS, cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, in1 = Math.min(1.2, (x1 - x0) / 5, (z1 - z0) / 5);
    const f = rm.fl || 0, own = sp.hulls[sp.hullOf[i]] || sp.hull, roof = f === NF - 1 || !own.main, RY = own.main ? Y : WH + 0.3, keel = f === 0;
    if (role === 'bridge') {
      K.box(light, x0 + 0.6, RY, z0 + 1.2, x1 - 0.6, RY + 2.6, z1 - 1.2); K.box(dark, x0 + 0.3, RY + 2.6, z0 + 0.9, x1 - 0.3, RY + 2.9, z1 - 0.9);
      K.box(win, x0 + 0.55, RY + 1.3, z0 + 1.6, x0 + 0.6, RY + 2.0, z1 - 1.6); K.box(win, x0 + 1.2, RY + 1.3, z0 + 1.15, x1 - 1.2, RY + 2.0, z0 + 1.2); K.box(win, x0 + 1.2, RY + 1.3, z1 - 1.2, x1 - 1.2, RY + 2.0, z1 - 1.15);
      K.box(dark, cx - 0.06, RY + 2.9, cz - 0.06, cx + 0.06, RY + 7.5, cz + 0.06); K.box(dark, cx + 1.2, RY + 2.9, cz + 1.0, cx + 1.26, RY + 5.2, cz + 1.06); K.box(nav, cx - 0.1, RY + 7.5, cz - 0.1, cx + 0.1, RY + 7.7, cz + 0.1);
      if (langOf(own.size) === 'pirate' && !(sp.wing && own.main)) for (let k = 0; k < 4; k++) K.box(k & 1 ? plate : dark, x0 - 1.5 * (k + 1), -1.0 - 0.25 * k, z0 + 1.2 * (k + 1), x0 - 1.5 * k, 0.7 - 0.2 * k, z1 - 1.2 * (k + 1));
      if (!(sp.wing && own.main)) K.box(dark, x0 - 1.2, f * FH + 2.95, z0, x0, RY + 0.2, z1);
    } else if (role === 'engine') {
      const top = own.main ? TOP : WH, mid = top / 2 - 0.1;
      if (sp.wing && own.main && cz - own.z0 > cx - own.x0) {
        K.box(dark, x0 + 0.5, top + 0.3, z0 + 0.5, x1 - 0.5, top + 1.7, z1 + 0.6); K.box(plate, x0 + 1.5, top + 1.7, z0 + 1.5, x1 - 1.5, top + 2.3, z1 - 0.5); K.box(dark, x0 + 1, -2.2, z0, x1 - 1, -1.0, z1 + 0.6);
        const nN = Math.max(2, Math.round((x1 - x0) / 5));
        for (let k = 0; k < nN; k++) {
          const x = x0 + (k + 0.5) * (x1 - x0) / nN, rad = Math.min(top * 0.47, (x1 - x0) / nN * 0.42);
          part(g, mesh(new T3.CylinderGeometry(rad, rad * 0.62, 3.2, 14, 1, true), bellM), x, mid, z1 + 2.2).rotation.x = -Math.PI / 2;
          part(g, mesh(new T3.CircleGeometry(rad * 0.7, 14), eng), x, mid, z1 + 1.4);
          part(g, mesh(new T3.ConeGeometry(rad * 0.8, rad * 8, 12, 1, true), ADDL), x, mid, z1 + 2.6 + rad * 4).rotation.x = Math.PI / 2;
        }
        return;
      }
      K.box(dark, x0 + 0.5, top + 0.3, z0 + 0.5, x1 + 0.6, top + 1.7, z1 - 0.5); K.box(plate, x0 + 1.5, top + 1.7, z0 + 1.5, x1 - 0.5, top + 2.3, z1 - 1.5); K.box(dark, x0, -2.2, z0 + 1, x1 + 0.6, -1.0, z1 - 1);
      const nN = Math.max(2, Math.round((z1 - z0) / (NF > 1 && own.main ? 7 : 5)));
      for (let k = 0; k < nN; k++) {
        const z = z0 + (k + 0.5) * (z1 - z0) / nN, rad = Math.min(top * 0.47, (z1 - z0) / nN * 0.42);
        const bell = part(g, mesh(new T3.CylinderGeometry(rad, rad * 0.62, 3.2, 14, 1, true), bellM), x1 + 2.2, mid, z); bell.rotation.z = Math.PI / 2;
        const disc = part(g, mesh(new T3.CircleGeometry(rad * 0.7, 14), eng), x1 + 1.4, mid, z); disc.rotation.y = Math.PI / 2;
        const plume = part(g, mesh(new T3.ConeGeometry(rad * 0.8, rad * 8, 12, 1, true), ADDL), x1 + 2.6 + rad * 4, mid, z); plume.rotation.z = -Math.PI / 2;
      }
    } else if (role === 'reactor' && roof) {
      K.box(dark, x0 + in1, RY, z0 + in1, x1 - in1, RY + 0.9, z1 - in1);
      for (let x = x0 + 1; x < x1 - 0.8; x += 1.1) K.box(light, x, RY + 0.9, z0 + 0.6, x + 0.12, RY + 3.2, z1 - 0.6);
    } else if (role === 'cargo') {
      if (roof) { K.box(plate, x0 + in1, RY, z0 + in1, x1 - in1, RY + 0.35, z1 - in1); K.box(trim, cx - 0.06, RY + 0.35, z0 + in1, cx + 0.06, RY + 0.4, z1 - in1); }
      if (keel) K.box(dark, x0 + 1, -1.9, z0 + 1, x1 - 1, -1.0, z1 - 1);
    } else if (role === 'pods') {
      const south = cz > own.zc, zf = south ? z1 + TS : z0 - TS, by = f * FH;
      for (let k = 0; k < 3; k++) { const x = x0 + (k + 0.5) * (x1 - x0) / 3; K.box(trim, x - 0.9, by + 2.95, zf + (south ? 0 : -1.3), x + 0.9, by + 3.9, zf + (south ? 1.3 : 0)); }
      if (roof) K.box(plate, x0 + in1, RY, z0 + in1, x1 - in1, RY + 0.3, z1 - in1);
    } else if (role === 'spine') {
      if (roof) { K.box(dark, x0, RY, cz - 0.9, x1, RY + 0.7, cz + 0.9); for (let x = x0 + 3; x < x1 - 2; x += 8) K.box(win, x, RY + 0.7, cz - 0.15, x + 0.6, RY + 0.76, cz + 0.15); }
    } else {
      if (roof) { const hgt = 0.3 + r() * 0.7; K.box(r() < 0.5 ? plate : light, x0 + in1, RY, z0 + in1, x1 - in1, RY + hgt, z1 - in1); if (r() < 0.4) K.box(dark, cx - 0.7, RY + hgt, cz - 0.7, cx + 0.7, RY + hgt + 0.5, cz + 0.7); }
      if (keel && r() < 0.5) K.box(dark, x0 + 1.2, -1.6, z0 + 1.2, x1 - 1.2, -1.0, z1 - 1.2);
    }
  });
  // ---- her own lines (the dressing: cutAt smashes it away where she's rammed)
  {
    const DM = (_c?: unknown, _k = 1): Mat => STD2;
    const tris = new Map<Mat, number[]>(), V = (x: number, y: number, z: number) => new T3.Vector3(x, y, z);
    const tri = (m: Mat, a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3) => { let q = tris.get(m); if (!q) tris.set(m, q = []); q.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z); };
    const quad = (m: Mat, a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, d: THREE.Vector3) => { tri(m, a, b, c); tri(m, a, c, d); };
    const hexa = (m: Mat, b: THREE.Vector3[], tt: THREE.Vector3[]) => { quad(m, b[0], b[1], b[2], b[3]); quad(m, tt[0], tt[1], tt[2], tt[3]); for (let i = 0; i < 4; i++) quad(m, b[i], b[(i + 1) % 4], tt[(i + 1) % 4], tt[i]); };
    const prism = (m: Mat, poly: THREE.Vector3[], off: THREE.Vector3) => { const q = poly.map((v) => v.clone().add(off)), n = poly.length; for (let i = 1; i + 1 < n; i++) { tri(m, poly[0], poly[i], poly[i + 1]); tri(m, q[0], q[i], q[i + 1]); } for (let i = 0; i < n; i++) quad(m, poly[i], poly[(i + 1) % n], q[(i + 1) % n], q[i]); };
    const bar = (m: Mat, a: THREE.Vector3, b: THREE.Vector3, r0 = 0.09, r1 = r0, n = 4) => {
      const d = b.clone().sub(a).normalize(), u = (Math.abs(d.y) < 0.9 ? V(0, 1, 0) : V(1, 0, 0)).cross(d).normalize(), v = d.clone().cross(u);
      const ring = (c: THREE.Vector3, rd: number) => Array.from({ length: n }, (_, i) => c.clone().addScaledVector(u, Math.cos(i * 2 * Math.PI / n + 0.7854) * rd).addScaledVector(v, Math.sin(i * 2 * Math.PI / n + 0.7854) * rd));
      const A = ring(a, r0), B = ring(b, r1);
      for (let i = 0; i < n; i++) quad(m, A[i], A[(i + 1) % n], B[(i + 1) % n], B[i]);
      for (let i = 1; i + 1 < n; i++) { tri(m, A[0], A[i], A[i + 1]); tri(m, B[0], B[i], B[i + 1]); }
    };
    const dPlate = DM(), dDark = DM(), dLight = DM(), rust = DM(), rust2 = DM(), paint = DM(), glowO = LIT, glowB = LIT, red = LIT, blue = LIT;
    const CONT = [0, 1, 2, 3, 4, 5].map(() => DM());
    const ti = (m: number) => Math.max(0, Math.min(W - 1, Math.floor(m / TS))), tj = (m: number) => Math.max(0, Math.min(H - 1, Math.floor(m / TS)));
    sp.hulls.forEach((hm, h) => {
      const lang = hm.main && sp.wing ? 'wing' : langOf(hm.size), top = hm.main ? TOP : WH, RY = top + 0.3, rr = G_U.rng((map.seed ^ (0x51ed + h * 977)) >>> 0), R = (a: number, b: number) => a + rr() * (b - a);
      const side = (xm: number, sg: number) => { const x = ti(xm); let z = tj(hm.zc); if (!solid(x, z)) return null; while (solid(x, z + sg)) z += sg; return (z + (sg > 0 ? 1 : 0)) * TS; };
      const end = (sg: number) => { let x = ti((hm.x0 + hm.x1) / 2); const z = tj(hm.zc); if (!solid(x, z)) return sg < 0 ? hm.x0 : hm.x1; while (solid(x + sg, z)) x += sg; return (x + (sg > 0 ? 1 : 0)) * TS; };
      const bow = end(-1), stern = end(1), L = stern - bow, zc = hm.zc;
      const pz0 = side(bow + 1.5, -1) ?? zc - 3, pz1 = side(bow + 1.5, 1) ?? zc + 3, pw = pz1 - pz0, pc = (pz0 + pz1) / 2;
      const onRoof = (xm: number, zm: number) => solid(ti(xm), tj(zm));
      const face = [V(bow, -1.0, pz0), V(bow, -1.0, pz1), V(bow, RY, pz1), V(bow, RY, pz0)];
      const nose = (m: Mat, len: number, hw: number, y0: number, y1: number) => hexa(m, face, [V(bow - len, y0, pc - hw), V(bow - len, y0, pc + hw), V(bow - len, y1, pc + hw), V(bow - len, y1, pc - hw)]);
      const along = (x0: number, x1: number, step: number, f: (x: number, len: number, zf: number, sg: number) => void) => { for (let x = x0; x < x1 - 0.5; x += step) for (const sg of [-1, 1]) { const zf = side(x + step / 2, sg); if (zf != null && Math.abs(zf - zc) > 2.5) f(x, Math.min(step, x1 - x), zf, sg); } };
      if (lang === 'wing') {
        const X0 = hm.x0, Z0 = hm.z0, X1 = hm.x1, Z1 = hm.z1, bi = map.rooms.findIndex((q, i) => sp.roles[i] === 'bridge' && sp.hullOf[i] === h), br = map.rooms[bi];
        const bx1 = br ? (br.x + br.w + 1) * TS : X0 + 8, bz1 = br ? (br.z + br.h + 1) * TS : Z0 + 6, wm = langOf(hm.size) === 'pirate' ? dDark : dPlate;
        let ni = 0;
        for (let x = bx1 + 0.3; x < X1 - 1; x += TS * 2) { const ln = Math.min(TS * 2, X1 - x); prism(wm, [V(x, RY + 0.2, Z0 - 0.3), V(x, RY + 1.0, Z0 + 2.0), V(x, RY + 0.2, Z0 + 2.0)], V(ln, 0, 0)); if (ni++ % 3 !== 2) prism(wm, [V(x + 0.04, -1.0, Z0), V(x + 0.04, 1.1, Z0 - 1.9), V(x + 0.04, 2.95, Z0)], V(ln - 0.08, 0, 0)); }
        for (let z = bz1 + 0.3; z < Z1 - 1; z += TS * 2) { const ln = Math.min(TS * 2, Z1 - z); prism(wm, [V(X0 - 0.3, RY + 0.2, z), V(X0 + 2.0, RY + 1.0, z), V(X0 + 2.0, RY + 0.2, z)], V(0, 0, ln)); if (ni++ % 3 !== 2) prism(wm, [V(X0, -1.0, z + 0.04), V(X0 - 1.9, 1.1, z + 0.04), V(X0, 2.95, z + 0.04)], V(0, 0, ln - 0.08)); }
        const nn = 3.2, kite = (y: number) => [[V(X0, y, bz1), V(X0 - nn, y, Z0 - nn), V(X0, y, Z0)], [V(X0, y, Z0), V(X0 - nn, y, Z0 - nn), V(bx1, y, Z0)]];
        const glassM = GLASS;
        for (const [m, y, hh] of [[wm, -1.0, 1.55], [glassM, 0.55, 2.3], [dDark, 2.85, RY + 0.25 - 2.85]] as [Mat, number, number][]) for (const half of kite(y)) prism(m, half, V(0, hh, 0));
        for (const [a, b] of [[V(X0 - nn, 0.55, Z0 - nn), V(X0 - nn, 2.85, Z0 - nn)], [V(X0 - nn * 0.5, 0.55, (bz1 + Z0 - nn) / 2), V(X0 - nn * 0.5, 2.85, (bz1 + Z0 - nn) / 2)], [V((bx1 + X0 - nn) / 2, 0.55, Z0 - nn * 0.5), V((bx1 + X0 - nn) / 2, 2.85, Z0 - nn * 0.5)]]) bar(dDark, a, b, 0.09);
        K.box(blue, X0 - nn - 0.12, RY + 0.25, Z0 - nn - 0.12, X0 - nn + 0.12, RY + 0.45, Z0 - nn + 0.12);
        const tk = Math.min(X1 - X0, Z1 - Z0) * 0.45;
        hexa(dDark, [V(X0 + 1.2, RY, Z0 + 2.6), V(X0 + 2.6, RY, Z0 + 1.2), V(X0 + tk + 0.7, RY, Z0 + tk - 0.7), V(X0 + tk - 0.7, RY, Z0 + tk + 0.7)], [V(X0 + 1.8, RY + 1.3, Z0 + 2.2), V(X0 + 2.2, RY + 1.3, Z0 + 1.8), V(X0 + tk + 0.2, RY + 0.5, Z0 + tk - 0.2), V(X0 + tk - 0.2, RY + 0.5, Z0 + tk + 0.2)]);
        prism(dDark, [V(X1 - 6, RY, Z0 + 0.3), V(X1 + 0.4, RY, Z0 + 0.3), V(X1 + 2.6, RY + 4.6, Z0 + 0.3), V(X1 - 0.6, RY + 4.6, Z0 + 0.3)], V(0, 0, 0.28));
        prism(dDark, [V(X0 + 0.3, RY, Z1 - 6), V(X0 + 0.3, RY, Z1 + 0.4), V(X0 + 0.3, RY + 4.6, Z1 + 2.6), V(X0 + 0.3, RY + 4.6, Z1 - 0.6)], V(0.28, 0, 0));
        for (const [x, z] of [[X1 + 1.6, Z0 + 0.3], [X0 + 0.3, Z1 + 1.6]]) K.box(red, x - 0.1, RY + 4.6, z - 0.1, x + 0.18, RY + 4.8, z + 0.18);
      } else if (lang === 'navy') {
        const len = Math.min(20, pw * 0.8 + 5);
        nose(dDark, len, 0.25, 0.1, top * 0.55);
        hexa(dPlate, [V(bow, RY - 0.9, pz0 - 0.05), V(bow, RY - 0.9, pz1 + 0.05), V(bow, RY + 0.05, pz1 + 0.05), V(bow, RY + 0.05, pz0 - 0.05)], [V(bow - len * 0.96, top * 0.5, pc - 0.28), V(bow - len * 0.96, top * 0.5, pc + 0.28), V(bow - len * 0.96, top * 0.58, pc + 0.28), V(bow - len * 0.96, top * 0.58, pc - 0.28)]);
        along(bow + 0.5, stern - 0.5, 4, (x, ln, zf, sg) => {
          prism(dPlate, [V(x, RY + 0.2, zf + sg * 0.3), V(x, RY + 1.5, zf - sg * 2.4), V(x, RY + 0.2, zf - sg * 2.4)], V(ln, 0, 0));
          prism(dDark, [V(x, -1.0, zf + sg * 0.3), V(x, -2.7, zf - sg * 3.2), V(x, -1.0, zf - sg * 3.2)], V(ln, 0, 0));
        });
        { let ni = 0; along(bow + 0.7, stern - 0.7, TS * 2, (x, ln, zf, sg) => { if ((ni++ >> 1) % 3 === 2) return; const o = zf + sg * 0.02; prism(dPlate, [V(x + 0.04, 2.9, o), V(x + 0.04, 2.05, o + sg * 0.7), V(x + 0.04, 0.85, o + sg * 0.7), V(x + 0.04, 0, o)], V(ln - 0.08, 0, 0)); }); }
        if (hm.main && NF > 1) for (let f2 = 1; f2 < NF; f2++) {
          const yb = (f2 - 1) * FH + 2.92, yt = f2 * FH + 0.72; let ni = 0;
          along(bow + 0.7, stern - 0.7, TS * 2, (x, ln, zf, sg) => {
            const o = zf + sg * 0.3;
            prism(dDark, [V(x, yb, o), V(x, (yb + yt) / 2 - 0.25, o + sg * 1.0), V(x, (yb + yt) / 2 + 0.25, o + sg * 1.0), V(x, yt, o)], V(ln, 0, 0));
            if ((ni++ >> 1) % 3 === 2) return;
            const o2 = zf + sg * 0.02; prism(dPlate, [V(x + 0.04, f2 * FH + 2.9, o2), V(x + 0.04, f2 * FH + 2.2, o2 + sg * 0.45), V(x + 0.04, f2 * FH + 1.1, o2 + sg * 0.7), V(x + 0.04, yt, o2 + sg * 0.3)], V(ln - 0.08, 0, 0));
          });
        }
        const cx = bow + L * 0.46, cw = Math.min(5, pw * 0.3), cl = Math.max(6, L * 0.1), fr = (y0: number, y1: number, a: number, b: number, c2: number, d: number, m: Mat) => hexa(m, [V(cx - a, y0, zc - b), V(cx + a, y0, zc - b), V(cx + a, y0, zc + b), V(cx - a, y0, zc + b)], [V(cx - c2, y1, zc - d), V(cx + c2, y1, zc - d), V(cx + c2, y1, zc + d), V(cx - c2, y1, zc + d)]);
        fr(RY, RY + 3.4, cl, cw, cl - 1.6, cw - 1.2, dPlate); fr(RY + 3.4, RY + 5.6, cl - 2.2, cw - 1.6, cl - 3.2, cw - 2.3, dLight);
        K.box(win, cx - cl + 1.5, RY + 4.2, zc - cw + 1.55, cx - cl + 1.6, RY + 4.9, zc + cw - 1.55);
        for (const dx of [-1.6, 1.8]) { bar(dDark, V(cx + dx, RY + 5.6, zc), V(cx + dx, RY + 11.5 - Math.abs(dx), zc), 0.12, 0.06); for (const yy of [7.4, 8.8]) bar(dDark, V(cx + dx, RY + yy, zc - 1.6), V(cx + dx, RY + yy, zc + 1.6), 0.05); K.box(blue, cx + dx - 0.1, RY + 11.5 - Math.abs(dx), zc - 0.1, cx + dx + 0.1, RY + 11.7 - Math.abs(dx), zc + 0.1); }
        hexa(dLight, [V(cx + 3.2, RY + 6.2, zc - 2.2), V(cx + 3.2, RY + 6.2, zc + 2.2), V(cx + 3.2, RY + 8.6, zc + 2.2), V(cx + 3.2, RY + 8.6, zc - 2.2)], [V(cx + 3.8, RY + 6.0, zc - 2.2), V(cx + 3.8, RY + 6.0, zc + 2.2), V(cx + 3.8, RY + 8.4, zc + 2.2), V(cx + 3.8, RY + 8.4, zc - 2.2)]);
        for (const sg of [-1, 1]) { const z = zc + sg * Math.min(pw * 0.32, 6); prism(dDark, [V(stern - 9, RY, z), V(stern - 1.5, RY, z), V(stern + 2, RY + 6.5, z), V(stern - 1, RY + 6.5, z)], V(0, 0, 0.3)); K.box(blue, stern + 0.4, RY + 6.5, z, stern + 0.7, RY + 6.7, z + 0.3); }
      } else if (lang === 'cutter') {
        nose(paint, pw * 1.1 + 6, 0.12, 1.1, 1.6);
        along(bow + 0.3, stern - 0.3, 4, (x, ln, zf, sg) => {
          prism(paint, [V(x, RY + 0.2, zf + sg * 0.3), V(x, RY + 0.9, zf - sg * 0.5), V(x, RY + 1.15, zf - sg * 2.2), V(x, RY + 0.2, zf - sg * 2.2)], V(ln, 0, 0));
          prism(dLight, [V(x, -1.0, zf + sg * 0.3), V(x, -1.75, zf - sg * 0.7), V(x, -2.0, zf - sg * 2.6), V(x, -1.0, zf - sg * 2.6)], V(ln, 0, 0));
        });
        { let ni = 0; along(bow + 0.5, stern - 0.5, TS * 2, (x, ln, zf, sg) => { if ((ni++ >> 1) % 4 === 3) return; const o = zf + sg * 0.02; prism(paint, [V(x + 0.02, 2.9, o), V(x + 0.02, 2.4, o + sg * 0.42), V(x + 0.02, 0.5, o + sg * 0.42), V(x + 0.02, 0, o)], V(ln - 0.04, 0, 0)); }); }
        prism(paint, [V(stern - 10, RY, zc - 0.12), V(stern - 2, RY, zc - 0.12), V(stern + 2.5, RY + 5.5, zc - 0.12), V(stern + 0.4, RY + 5.5, zc - 0.12)], V(0, 0, 0.24));
        for (const sg of [-1, 1]) {
          const zf = side(stern - 5, sg) ?? zc + sg * 4, z = zf + sg * 2.3, y = top + 1.5;
          bar(paint, V(stern - 10, y, z), V(stern - 8, y, z), 0.15, 0.85, 10); bar(paint, V(stern - 8, y, z), V(stern + 1, y, z), 0.85, 0.7, 10); bar(glowB, V(stern + 1, y, z), V(stern + 1.05, y, z), 0.55, 0.55, 10);
          for (const dx of [-7, -2]) bar(dLight, V(stern + dx, RY, zf - sg * 0.6), V(stern + dx, y, z), 0.14);
        }
      } else if (lang === 'liner') {
        const navy = DM(), brass = DM(), glassM = LIT, CT = Level.CTS, paint = M(0, { side: 2 });
        nose(paint, Math.min(18, pw * 0.6 + 6), 0.5, -0.4, RY * 0.8);
        along(bow + 0.3, stern - 0.3, 4, (x, ln, zf, sg) => {
          prism(paint, [V(x, RY + 0.2, zf + sg * 0.3), V(x, RY + 0.9, zf - sg * 0.5), V(x, RY + 1.15, zf - sg * 2.2), V(x, RY + 0.2, zf - sg * 2.2)], V(ln, 0, 0));
          prism(navy, [V(x, -1.0, zf + sg * 0.34), V(x, -1.75, zf - sg * 0.7), V(x, -2.0, zf - sg * 2.6), V(x, -1.0, zf - sg * 2.6)], V(ln, 0, 0));
          prism(navy, [V(x, -1.0, zf + sg * 0.34), V(x, -0.22, zf + sg * 0.34), V(x, -0.22, zf + sg * 0.3), V(x, -1.0, zf + sg * 0.3)], V(ln, 0, 0));
          prism(brass, [V(x, -0.22, zf + sg * 0.35), V(x, -0.1, zf + sg * 0.35), V(x, -0.1, zf + sg * 0.3), V(x, -0.22, zf + sg * 0.3)], V(ln, 0, 0));
        });
        const ci = map.rooms.findIndex((q, i) => !(q.fl) && sp.roles[i] === 'mall' && sp.hullOf[i] === h), court = map.rooms[ci] as any;
        const cx0 = court ? court.x * TS : bow + L * 0.25, mzX = court && court.mz ? court.mz * CT : bow + L * 0.55, hw = Math.max(4, pw * 0.34);
        { const a = cx0 + 3, b = mzX - 2, gw = Math.min(5.5, hw);
          if (b - a > 6) { K.box(light, a - 0.5, RY, zc - gw - 0.5, b + 0.5, RY + 0.55, zc + gw + 0.5); K.box(glassM, a, RY + 0.5, zc - gw, b, RY + 0.62, zc + gw); for (let x = a + 3; x < b - 1; x += 3) K.box(navy, x - 0.08, RY + 0.55, zc - gw, x + 0.08, RY + 0.7, zc + gw); K.box(navy, a, RY + 0.55, zc - 0.1, b, RY + 0.7, zc + 0.1); } }
        const tier = (x0: number, x1: number, y0: number, y1: number, w: number) => { K.box(light, x0, y0, zc - w, x1, y1, zc + w); K.box(navy, x0 - 0.25, y1, zc - w - 0.25, x1 + 0.25, y1 + 0.12, zc + w + 0.25);
          for (const sg of [-1, 1]) K.box(win, x0 + 0.6, y0 + 1.0, zc + sg * w - 0.03, x1 - 0.6, y0 + 1.85, zc + sg * w + 0.03); K.box(win, x0 - 0.03, y0 + 1.0, zc - w + 0.6, x0 + 0.03, y0 + 1.85, zc + w - 0.6); K.box(win, x1 - 0.03, y0 + 1.0, zc - w + 0.6, x1 + 0.03, y0 + 1.85, zc + w - 0.6); };
        const t1a = mzX + 1, t1b = stern - 7;
        if (t1b - t1a > 10) { tier(t1a, t1b, RY, RY + 2.8, hw); tier(t1a + 3, t1b - 5, RY + 2.92, RY + 5.5, hw * 0.68);
          const fx = t1a + (t1b - t1a) * 0.55, fy = RY + 5.62;
          prism(navy, [V(fx, fy, zc - 1.4), V(fx + 5, fy, zc - 1.4), V(fx + 6.6, fy + 5.2, zc - 1.4), V(fx + 2.6, fy + 5.2, zc - 1.4)], V(0, 0, 2.8));
          prism(brass, [V(fx + 2.0, fy + 3.8, zc - 1.45), V(fx + 6.2, fy + 3.8, zc - 1.45), V(fx + 6.42, fy + 4.4, zc - 1.45), V(fx + 2.2, fy + 4.4, zc - 1.45)], V(0, 0, 2.9)); }
        tier(bow + 1.5, Math.min(bow + 9, cx0 - 1), RY, RY + 2.4, Math.max(3, pw * 0.3));
      } else if (lang === 'freighter') {
        nose(dPlate, 2.8, pw * 0.36, -0.4, top * 0.8);
        along(bow + 0.5, stern - 0.5, TS * 4, (x, ln, zf, sg) => {
          bar(dDark, V(x, -0.02, zf + sg * 0.26), V(x, 2.92, zf + sg * 0.26), 0.11);
          bar(dLight, V(x, 2.45, zf + sg * 0.42), V(x + ln, 2.45, zf + sg * 0.42), 0.13, 0.13, 6); bar(dDark, V(x, 0.45, zf + sg * 0.4), V(x + ln, 0.45, zf + sg * 0.4), 0.1, 0.1, 6);
        });
        along(bow + 0.4, stern - 0.4, 4, (x, ln, zf, sg) => prism(dPlate, [V(x, RY + 0.2, zf + sg * 0.3), V(x, RY + 0.75, zf - sg * 0.9), V(x, RY + 0.2, zf - sg * 0.9)], V(ln, 0, 0)));
        const rows = pw > 15 ? [-4.9, -2.2, 2.2, 4.9] : pw > 9 ? [-2.2, 2.2] : [0];
        for (let x = bow + L * 0.28; x < stern - L * 0.22 - 6; x += 6.3) for (const dz of rows) {
          if (!onRoof(x + 3, zc + dz) || rr() < 0.2) continue;
          const m = CONT[Math.floor(rr() * CONT.length)], two = rr() < 0.35;
          K.box(m, x, RY, zc + dz - 1.2, x + 6, RY + 2.5, zc + dz + 1.2); if (two) K.box(CONT[Math.floor(rr() * CONT.length)], x + 0.05, RY + 2.5, zc + dz - 1.2, x + 6.05, RY + 5, zc + dz + 1.2);
        }
        for (const u of [0.4, 0.66]) for (const sg of [-1, 1]) {
          const x = bow + L * u, zf = side(x, sg); if (zf == null) continue;
          const z = zf + sg * 1.5, y = top + 1.5, ln = Math.min(8, L * 0.16);
          bar(paint, V(x - ln / 2, y, z), V(x + ln / 2, y, z), 1.05, 1.05, 12); bar(paint, V(x - ln / 2 - 0.7, y, z), V(x - ln / 2, y, z), 0.5, 1.05, 12); bar(paint, V(x + ln / 2, y, z), V(x + ln / 2 + 0.7, y, z), 1.05, 0.5, 12);
          for (const dx of [-ln * 0.3, ln * 0.3]) { bar(dDark, V(x + dx, RY, zf - sg * 1.0), V(x + dx, y + 1.2, zf - sg * 1.0), 0.12); bar(dDark, V(x + dx, y + 1.2, zf - sg * 1.0), V(x + dx, y + 1.2, z), 0.12); bar(dDark, V(x + dx, y + 1.2, z), V(x + dx, y + 1.0, z), 0.1); }
        }
        for (const u of [0.36, 0.6]) {
          const x = bow + L * u, a = (side(x, -1) ?? zc - 3) + 0.6, b = (side(x, 1) ?? zc + 3) - 0.6, y = RY + 6.2;
          bar(dDark, V(x, RY, a), V(x, y, a), 0.16); bar(dDark, V(x, RY, b), V(x, y, b), 0.16); bar(dDark, V(x, y, a - 0.8), V(x, y, b + 0.8), 0.2); K.box(trim, x - 0.5, y - 0.9, zc + R(-2, 2) - 0.5, x + 0.5, y - 0.2, zc + 0.5);
        }
        { const x = stern - L * 0.14, y = RY + 2.2; bar(dDark, V(x, RY, zc + 2), V(x, y + 1.5, zc + 2), 0.1); bar(paint, V(x - 0.2, y + 1.5, zc + 2), V(x - 1.0, y + 2.6, zc + 2), 0.15, 1.5, 12); }
      } else {
        const nT = Math.max(3, Math.round(pw / 2.2));
        for (let k = 0; k < nT; k++) { const z = pz0 + (k + 0.5) * pw / nT, ln = R(3, 7.5); prism(k & 1 ? rust : dDark, [V(bow + 0.3, 0.3, z - 0.12), V(bow + 0.3, 2.7, z - 0.12), V(bow - ln, 1.2 + R(-0.5, 0.6), z - 0.12)], V(0, 0, 0.24)); }
        for (const sg of [-1, 1]) K.box(red, bow - 0.12, top * 0.72, pc + sg * pw * 0.25 - 0.35, bow, top * 0.72 + 0.25, pc + sg * pw * 0.25 + 0.35);
        along(bow + 1, stern - 1, 3.4, (x, ln, zf, sg) => {
          if (rr() < 0.55) { const hh = R(0.9, 2.2), lean = R(0.3, 1.5), a = V(x + 0.2, RY - 0.2, zf + sg * 0.3), b = V(x + 0.2, RY + hh, zf + sg * (0.3 + lean)); prism(rr() < 0.5 ? rust : rust2, [a, b, b.clone().add(V(0, 0, -sg * 0.14)), a.clone().add(V(0, 0, -sg * 0.14))], V(ln * R(0.6, 0.95), 0, 0)); }
          if (rr() < 0.4) bar(rust2, V(x + 1, RY, zf - sg * 0.2), V(x + 1 + R(-1.5, 1.5), RY + R(1.5, 4), zf + sg * R(1.2, 3.6)), 0.1, 0.02);
        });
        along(bow + 0.6, stern - 0.6, TS * 2, (x, ln, zf, sg) => {
          if (rr() > 0.5) return;
          const o = zf + sg * 0.02, y0 = R(0, 1.1), y1 = Math.min(2.9, y0 + R(1, 1.8)), t0 = R(0.05, 0.25), t1 = R(0.15, 0.6), x0 = x + R(0, 0.3);
          prism(rr() < 0.4 ? rust : rr() < 0.5 ? rust2 : dDark, [V(x0, y0, o + sg * t0), V(x0, y1, o + sg * t1), V(x0, y1, o + sg * (t1 + 0.08)), V(x0, y0, o + sg * (t0 + 0.08))], V(ln * R(0.7, 1.25), 0, 0));
        });
        for (let x = bow + L * 0.2; x < stern - 3; x += R(5.5, 8.5)) {
          const a = (side(x, -1) ?? zc - 3) - 0.7, b = (side(x, 1) ?? zc + 3) + 0.7, y = RY + R(1.8, 2.8);
          bar(dDark, V(x, RY - 0.4, a), V(x, y, a + 0.6), 0.13); bar(dDark, V(x, RY - 0.4, b), V(x, y, b - 0.6), 0.13); bar(dDark, V(x, y, a + 0.6), V(x, y + R(-0.4, 0.4), b - 0.6), 0.13);
        }
        const sg = rr() < 0.5 ? -1 : 1, xb = bow + L * R(0.35, 0.6), zb = (side(xb, sg) ?? zc + sg * 3), tip = V(xb + R(-2, 3), RY + R(3, 5), zb + sg * R(7, 11));
        bar(dDark, V(xb, RY, zc + sg * 1), tip, 0.2, 0.1); bar(rust2, V(xb + 2.5, RY, zb - sg * 0.5), tip.clone().lerp(V(xb, RY, zc), 0.35), 0.08); bar(rust, tip, tip.clone().add(V(-0.6, 0.9, sg * 0.5)), 0.12, 1.3, 8); K.box(red, tip.x - 0.12, tip.y - 0.4, tip.z - 0.12, tip.x + 0.12, tip.y - 0.16, tip.z + 0.12);
        { const zf = side(stern - 3, -sg) ?? zc - sg * 3, z = zf - sg * 2.2, y = top + 1.3, ln = R(4.5, 7); bar(rust, V(stern - ln, y, z), V(stern + 1.2, y, z), 1.0, 1.15, 8); bar(rust2, V(stern + 1.2, y, z), V(stern + 2.4, y, z), 1.15, 0.8, 8); bar(glowO, V(stern + 2.4, y, z), V(stern + 2.45, y, z), 0.62, 0.62, 8);
          for (const dx of [-ln + 0.8, -0.5]) { bar(dDark, V(stern + dx, RY, zf + sg * 0.8), V(stern + dx, y, z), 0.13); bar(dDark, V(stern + dx + 0.9, RY, zf + sg * 0.3), V(stern + dx, y + 0.5, z), 0.08); } }
      }
    });
    {
      const fairM = langOf(sp.size) === 'cutter' || langOf(sp.size) === 'liner' ? paint : dPlate;
      for (const f of ShipGen.fairings(W, H, t)) {
        const { cx, cz, short, long } = f, u = V(f.ux, 0, f.uz), v = V(f.vx, 0, f.vz), C0 = V(cx, 0, cz);
        const hm = sp.hulls.find((q) => cx > q.x0 - 2 && cx < q.x1 + 2 && cz > q.z0 - 2 && cz < q.z1 + 2) || sp.hull, y0 = -1.0, y1 = (hm.main ? TOP : WH) + 0.5, n = Math.max(2, Math.ceil(long / (TS * 1.5)));
        for (let k = 0; k < n; k++) {
          const t0 = long * k / n, t1 = long * (k + 1) / n, P = (tt: number, out: number, y: number) => C0.clone().addScaledVector(u, tt).addScaledVector(v, out * short * (1 - tt / long)).setY(y);
          hexa(fairM, [P(t0, 0, y0), P(t1, 0, y0), P(t1, 1, y0), P(t0, 1, y0)], [P(t0, 0, y1), P(t1, 0, y1), P(t1, 1, y1), P(t0, 1, y1)]);
        }
      }
    }
    for (const [m, q] of tris) { const me = mesh(flat(q), m); me.decor = true; g.add(me); }
  }
  K.build(g);
  const { sh, at } = emitW(g); // (at: where each gun's triangles are in the list)
  const regun = (oy: number[]) => {
    const out = sh.exact.slice();
    gunObjs.forEach((o, i) => {
      if (oy[i] == null || oy[i] === o.position.y) return;
      const was = o.position.y; o.position.y = oy[i];
      const w = walkOf(o), r = at.get(o)!; o.position.y = was;
      out.set(w.pos, r[0] * 9);
    });
    return out;
  };
  return { ...sh, guns, regun };
}

// ---- js/shipmodel.ts traffic(kind, seed): a ship under way out in the zone, bow to -z, her middle at the origin
function trafficOf(kind: string, seed: number): TrafficShapeT {
  const T3 = T(), r = G_U.rng(seed >>> 0), R = (a: number, b: number) => a + r() * (b - a), K = new Kit(), g = new N();
  const body = STD, dark = STD, eng = LIT, win = LIT;
  const L = kind === 'navy' ? R(120, 200) : kind === 'freighter' ? R(70, 130) : kind === 'cutter' ? R(40, 65) : R(45, 85), w = L * R(0.16, 0.22), h = L * R(0.07, 0.095);
  const cone = (m: Mat, rad: number, len: number, z: number, sy: number) => { const c = mesh(new T3.ConeGeometry(rad, len, 4), m); c.rotation.order = 'YXZ'; c.rotation.x = -Math.PI / 2; c.rotation.z = Math.PI / 4; c.scale.set(1, 1, 1); c.position.set(0, 0, z - len / 2); const o = new N(); o.scale.y = sy; o.add(c); g.add(o); };
  const plume = (x: number, y: number, z: number, rad: number) => {
    part(g, mesh(new T3.CircleGeometry(rad, 10), eng), x, y, z + 0.2);
    const p = part(g, mesh(new T3.ConeGeometry(rad * 1.1, rad * 9, 10, 1, true), ADDL), x, y, z + rad * 4.5); p.rotation.x = Math.PI / 2;
  };
  let aft = L / 2;
  if (kind === 'wing') {
    const al = L * 0.75, aw = L * 0.2;
    for (const sd of [-1, 1]) {
      const arm = mesh(new T3.BoxGeometry(aw, h, al), body), o = new N(); arm.position.set(0, 0, al / 2); o.rotation.y = sd * Math.PI / 4; o.position.set(0, 0, -L * 0.3); o.add(arm);
      const fin = mesh(new T3.BoxGeometry(0.6, h * 1.6, aw * 0.8), dark); fin.position.set(0, h * 1.1, al - aw * 0.4); o.add(fin); g.add(o);
      plume(sd * (al * 0.7071 + aw * 0.1), 0, -L * 0.3 + al * 0.7071 + aw * 0.5, h * 0.45);
    }
    part(g, mesh(new T3.BoxGeometry(aw * 0.9, h * 0.5, aw * 0.9), STD), 0, h * 0.1, -L * 0.3).rotation.y = Math.PI / 4;
    aft = L * 0.3;
  } else {
    K.box(body, -w / 2, -h / 2, -L * 0.36, w / 2, h / 2, L / 2); K.box(dark, -w * 0.3, h / 2, L * 0.12, w * 0.3, h * 0.95, L * 0.4); K.box(win, -w * 0.3 - 0.05, h * 0.62, L * 0.14, w * 0.3 + 0.05, h * 0.78, L * 0.2);
    cone(kind === 'pirate' ? dark : body, w * 0.7071, kind === 'navy' ? L * 0.34 : kind === 'cutter' ? L * 0.42 : kind === 'pirate' ? L * 0.18 : L * 0.1, -L * 0.36, h / w);
    for (const sd of [-1, 1]) { K.box(win, sd * w / 2 - 0.06, -h * 0.1, -L * 0.3, sd * w / 2 + 0.06, h * 0.12, L * 0.4); }
    const n = kind === 'navy' ? 3 : 2;
    for (let k = 0; k < n; k++) { const x = (k - (n - 1) / 2) * w * 0.34; K.box(dark, x - w * 0.13, -h * 0.35, L / 2, x + w * 0.13, h * 0.35, L / 2 + h * 0.6); plume(x, 0, L / 2 + h * 0.6, h * 0.3); }
    if (kind === 'freighter') { const C = [0, 1, 2, 3, 4].map(() => STD); for (let z = -L * 0.3; z < L * 0.06; z += h * 1.05) for (const x of [-w * 0.24, w * 0.24]) if (r() < 0.8) K.box(C[Math.floor(r() * C.length)], x - w * 0.2, h / 2, z, x + w * 0.2, h / 2 + h * R(0.45, 0.9), z + h); }
    if (kind === 'navy') { for (const sd of [-1, 1]) K.box(dark, sd * w * 0.3 - 0.4, h / 2, L * 0.34, sd * w * 0.3 + 0.4, h * 1.7, L * 0.5); K.box(dark, -w * 0.18, h * 0.95, L * 0.16, w * 0.18, h * 1.3, L * 0.3); K.box(dark, -0.25, h * 1.3, L * 0.22, 0.25, h * 2.3, L * 0.24); }
    if (kind === 'cutter') K.box(body, -0.3, h / 2, L * 0.3, 0.3, h * 1.8, L * 0.48);
    if (kind === 'pirate') { const rust = STD; for (let k = 0; k < 6; k++) { const z = R(-L * 0.3, L * 0.4), sd = r() < 0.5 ? -1 : 1; K.box(rust, sd * w / 2, R(-h * 0.4, 0), z, sd * (w / 2 + R(0.6, 2)), R(0.1, h * 0.5), z + R(3, 8)); } K.box(dark, w / 2, h * 0.2, -L * 0.05, w / 2 + L * 0.16, h * 0.32, -L * 0.03); }
  }
  K.build(g);
  for (const [, x] of [[0xff3528, -w / 2 - 0.4], [0x30ff60, w / 2 + 0.4]] as number[][]) part(g, mesh(new T3.SphereGeometry(Math.max(0.7, L * 0.008), 6, 5), LIT), kind === 'wing' ? x * 2.2 : x, 0, kind === 'wing' ? L * 0.1 : 0);
  part(g, mesh(new T3.SphereGeometry(Math.max(1.2, L * 0.014), 6, 5), LIT), 0, h * 1.6, aft * 0.5).live = true; // (the strobe: blinked, kept a mesh of its own)
  return { ...emit(g), len: L };
}

export const HullShape = { of: hullOf };
/** the little scene graph, for other shapes built the same way (js/rcstris.ts radarKitTris) */
export const ShapeKit = { N, mesh, part, emit, STD, STD2, LIT, GLASS, ADDL };
export const TrafficShape = { of: trafficOf };
