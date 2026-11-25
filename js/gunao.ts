'use strict';
// A gun's ambient occlusion: a darkening at each vertex where the gun is shut in by itself (the receiver's well round a magazine, under a
// handguard, a sight's rail, the gap between a barrel and its shroud, a grip's ridges), read by the lit materials as the attribute aOcc
// (js/lightgrid.ts: the fill, the room's light on it and what it reflects of the room: not a muzzle flash).
//
// It is worked out for the assembled build, whatever parts are on it, so what one part does to its neighbour is in it (a bake of each
// part alone, as they're baked, couldn't): every mesh of the gun is stood in a grid of 3 mm cells, a cell any triangle's surface passes
// through marked; from each vertex a few rays leave over the hemisphere its normal faces, a few centimetres long, and what they meet
// is how shut in it is. Done once for a build (the result's kept by its code), so the gun in the hands, in the world, in the gunsmith and
// on the hangar's wall all take the same numbers. A part that moves (a bolt, a slide, the magazine) takes its darkening along as it was in
// the gun at rest; the muzzle flash's, the lenses' and anything see-through has none.
//
// What it costs: a rifle (an M4, 21 000 vertices refined to 24 000; 111 meshes) is 148 ms in JavaScript, nearly all of it refine's rays
// (136 000 occlusions asked for; the grid's marking 11 ms, the weld 15). The numeric core has a second implementation in WebAssembly
// (js/gunaowasm.ts, wasm/gunao: docs/wasm.md), the same numbers bit for bit, used when the module has loaded: 60 ms. And the gun in the hands
// (GUN_ASYNC: js/gunmodels.ts viewmodel) isn't worked out in the frame that draws it: refineNow takes a few ms a frame for it, the gun drawn
// without its darkening for the 6-8 frames that takes (a frame of 60-190 ms on drawing a gun not drawn before, before). The JavaScript stays
// as the fallback (no module yet, the node tools, ?aojs) and the reference.
import { AoWasm, type AoRefineJob } from './gunaowasm.js';
export const GunAo = (() => {
  const T = THREE;
  /** What a thing's occlusion is made of: how far a ray reaches (m), how many rays, the finest cell (m) and the most cells along its longest side, the longest an edge may be before it is split (m), how much the shut-in share is scaled and its cap. */
  interface Opts { reach: number; rays: number; cell: number; cells: number; edge: number; strength: number; max: number; direct: boolean; async: boolean; adaptive: boolean; fine: number; tol: number }
  const GUN: Opts = { reach: 0.045, rays: 14, cell: 0.003, cells: 300, edge: 0.04, strength: 3.2, max: 0.9, direct: false, async: false, adaptive: true, fine: 0.003, tol: 0.2 };
  /** A gun's far levels of detail (models/lod_kit.py: level 2 on): the same rays, but no triangle is split: each vertex the level has takes its own occlusion and that is all (a split
   *  would put back the triangles the level took out: an M4's 20 m level 1,033 -> 3,966). edge 0: nothing is split. */
  const GUN_FAR: Opts = { ...GUN, adaptive: false, edge: 0, fine: 0, tol: 0 };
  /** The gun in the hands (js/gunmodels.ts viewmodel): GUN's numbers, worked out a few ms a frame when the build's aren't kept (see refineNow): drawing a gun not drawn
   *  before was one frame of 60-190 ms, nearly all of it this. */
  const GUN_ASYNC: Opts = { ...GUN, async: true };
  /** The squad's ship (inside and out): rooms and hull plates metres across, so a ray reaches a metre and a half, cells of 8 cm. */
  const SHIP: Opts = { reach: 1.5, rays: 16, cell: 0.08, cells: 400, edge: 0.7, strength: 1.4, max: 0.75, direct: true, async: true, adaptive: false, fine: 0, tol: 0 };
  const cache = new Map<string, Float32Array[]>();
  let last = 0; // (the last apply, ms)
  // the hemisphere's rays about +z, cosine-weighted
  const dirCache = new Map<number, number[][]>();
  function dirsOf(n: number): number[][] {
    let dirs = dirCache.get(n); if (dirs) return dirs;
    dirs = [];
    for (let i = 0; i < n; i++) { const u = (i + 0.5) / n, r = Math.sqrt(u), ph = i * 2.399963; const d = [r * Math.cos(ph), r * Math.sin(ph), Math.sqrt(1 - u) + 0.45], l = Math.hypot(d[0], d[1], d[2]); dirs.push([d[0] / l, d[1] / l, d[2] / l]); } // (leaned toward the normal: a ray along the surface meets the next facet of the same curve)
    dirCache.set(n, dirs); return dirs;
  }

  // A big flat face is two triangles with a value at each corner, and a value that differs from one corner to the next is a smear across
  // the diagonal. So a triangle with an edge past MAXEDGE is split (midpoints, as often as it takes) before the occlusion is worked out:
  // the values are then ones a few centimetres apart, and the face takes the shading of what is close to each part of it.
  function subdivide(geo: THREE.BufferGeometry, maxEdge: number): THREE.BufferGeometry {
    if (geo.groups && geo.groups.length > 1) return geo;
    const g = geo.index ? geo.toNonIndexed() : geo, names = Object.keys(g.attributes), offs: number[] = [], sizes: number[] = [];
    let stride = 0;
    for (const n of names) { offs.push(stride); sizes.push(g.attributes[n].itemSize); stride += g.attributes[n].itemSize; }
    const pi = names.indexOf('position'), ni = names.indexOf('normal');
    if (pi < 0) return geo;
    const cnt = g.attributes.position.count, po = offs[pi], e2 = maxEdge * maxEdge;
    const cur = new Float32Array(cnt * stride);
    names.forEach((n, k) => { const a = g.attributes[n] as THREE.BufferAttribute; for (let i = 0; i < cnt; i++) for (let c = 0; c < sizes[k]; c++) cur[i * stride + offs[k] + c] = a.getComponent(i, c); });
    const d2 = (a: Float32Array, b: Float32Array) => { const x = a[po] - b[po], y = a[po + 1] - b[po + 1], z = a[po + 2] - b[po + 2]; return x * x + y * y + z * z; };
    const mid = (a: Float32Array, b: Float32Array) => { const m = new Float32Array(stride); for (let k = 0; k < stride; k++) m[k] = (a[k] + b[k]) / 2; if (ni >= 0) { const q = offs[ni], l = Math.hypot(m[q], m[q + 1], m[q + 2]) || 1; m[q] /= l; m[q + 1] /= l; m[q + 2] /= l; } return m; };
    // each triangle: its longest edge is halved while it is too long (so a sliver is cut across its length, not into slivers of slivers)
    let out = new Float32Array(cnt * stride * 2), o = 0, changed = false;
    const emit = (a: Float32Array, b: Float32Array, c: Float32Array) => { if (o + stride * 3 > out.length) { const n = new Float32Array(out.length * 2); n.set(out); out = n; } out.set(a, o); out.set(b, o + stride); out.set(c, o + stride * 2); o += stride * 3; };
    const stack: Float32Array[][] = [];
    for (let t = 0; t < cnt / 3; t++) {
      const v0 = cur.subarray(t * 3 * stride, t * 3 * stride + stride), v1 = cur.subarray((t * 3 + 1) * stride, (t * 3 + 1) * stride + stride), v2 = cur.subarray((t * 3 + 2) * stride, (t * 3 + 2) * stride + stride);
      stack.push([v0, v1, v2]);
      let guard = 0;
      while (stack.length) {
        const [a, b, c] = stack.pop()!, ab = d2(a, b), bc = d2(b, c), ca = d2(c, a), mx = Math.max(ab, bc, ca);
        if (mx <= e2 || ++guard > 4096) { emit(a, b, c); continue; }
        changed = true;
        if (mx === ab) { const m = mid(a, b); stack.push([m, b, c], [a, m, c]); } else if (mx === bc) { const m = mid(b, c); stack.push([a, m, c], [a, b, m]); } else { const m = mid(c, a); stack.push([b, c, m], [a, b, m]); }
      }
    }
    if (!changed) return geo;
    const n = o / stride, bg = new THREE.BufferGeometry();
    names.forEach((nm, k) => { const arr = new Float32Array(n * sizes[k]); for (let i = 0; i < n; i++) for (let c = 0; c < sizes[k]; c++) arr[i * sizes[k] + c] = out[i * stride + offs[k] + c]; bg.setAttribute(nm, new THREE.BufferAttribute(arr, sizes[k])); });
    bg.userData = geo.userData; geo.dispose();
    bg.computeBoundingBox(); bg.computeBoundingSphere();
    return bg;
  }

  /** a mesh as the occlusion sees it: its world positions and normals, and its world and normal matrices as they were then (a refine worked out over frames reads these, not the mesh's, which has moved on) */
  interface M { mesh: THREE.Mesh; pos: Float32Array; nor: Float32Array; idx: ArrayLike<number> | null; n: number; mw: number[]; nmx: number[] }
  function collect(group: THREE.Object3D, split: Opts | null = null): M[] {
    group.updateMatrixWorld(true);
    const out: M[] = [], v = new T.Vector3(), nm = new T.Matrix3();
    group.traverse((o: any) => {
      if (!o.isMesh || !o.geometry || !o.geometry.attributes.position || !o.geometry.attributes.normal) return;
      const ms = Array.isArray(o.material) ? o.material : [o.material];
      if (ms.some((m: any) => !m || m.transparent || m.visible === false || m.alphaTest > 0)) return;
      if (split && !o.geometry.attributes.aOcc) o.geometry = subdivide(o.geometry, split.edge);
      const g = o.geometry, p = g.attributes.position, nn = g.attributes.normal, n = p.count, pos = new Float32Array(n * 3), nor = new Float32Array(n * 3);
      nm.getNormalMatrix(o.matrixWorld);
      for (let i = 0; i < n; i++) {
        v.fromBufferAttribute(p, i).applyMatrix4(o.matrixWorld); pos[i * 3] = v.x; pos[i * 3 + 1] = v.y; pos[i * 3 + 2] = v.z;
        v.fromBufferAttribute(nn, i).applyMatrix3(nm).normalize(); nor[i * 3] = v.x; nor[i * 3 + 1] = v.y; nor[i * 3 + 2] = v.z;
      }
      out.push({ mesh: o, pos, nor, idx: g.index ? g.index.array : null, n, mw: o.matrixWorld.elements.slice(), nmx: nm.elements.slice() });
    });
    return out;
  }

  // The grid: the cells of 3 mm (a ship: 8 cm) any triangle's surface passes through are marked.
  interface Grid { occ: Uint8Array; x0: number; y0: number; z0: number; nx: number; ny: number; nz: number; c: number; ic: number }
  function makeGrid(ms: M[], o: Opts, alloc = true): Grid | null { // (alloc false: the numbers only, for a grid in the WebAssembly module's memory)
    let x0 = 1e9, y0 = 1e9, z0 = 1e9, x1 = -1e9, y1 = -1e9, z1 = -1e9;
    for (const m of ms) for (let i = 0; i < m.n; i++) {
      const x = m.pos[i * 3], y = m.pos[i * 3 + 1], z = m.pos[i * 3 + 2];
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; if (z < z0) z0 = z; if (z > z1) z1 = z;
    }
    if (x1 < x0) return null;
    const pad = o.reach + 0.02, c = Math.max(o.cell, Math.max(x1 - x0, y1 - y0, z1 - z0) / o.cells), ic = 1 / c;
    x0 -= pad; y0 -= pad; z0 -= pad;
    const nx = Math.ceil((x1 + pad - x0) * ic) + 1, ny = Math.ceil((y1 + pad - y0) * ic) + 1, nz = Math.ceil((z1 + pad - z0) * ic) + 1;
    return { occ: new Uint8Array(alloc ? nx * ny * nz : 0), x0, y0, z0, nx, ny, nz, c, ic };
  }
  /** A mesh's surfaces into the grid: each triangle sampled finely enough to leave no cell unmarked. */
  function mark(g: Grid, m: M) {
    const { occ, x0, y0, z0, nx, ny, ic } = g, tri = m.idx ? m.idx.length / 3 : m.n / 3, P = m.pos;
    for (let t = 0; t < tri; t++) {
      const a = (m.idx ? m.idx[t * 3] : t * 3) * 3, b = (m.idx ? m.idx[t * 3 + 1] : t * 3 + 1) * 3, d = (m.idx ? m.idx[t * 3 + 2] : t * 3 + 2) * 3;
      const ex = P[b] - P[a], ey = P[b + 1] - P[a + 1], ez = P[b + 2] - P[a + 2], fx = P[d] - P[a], fy = P[d + 1] - P[a + 1], fz = P[d + 2] - P[a + 2];
      const L = Math.max(Math.hypot(ex, ey, ez), Math.hypot(fx, fy, fz), Math.hypot(P[d] - P[b], P[d + 1] - P[b + 1], P[d + 2] - P[b + 2])), k = Math.max(1, Math.ceil(L * ic * 1.4));
      for (let i = 0; i <= k; i++) for (let j = 0; i + j <= k; j++) {
        const u = i / k, w = j / k, x = Math.floor((P[a] + ex * u + fx * w - x0) * ic), y = Math.floor((P[a + 1] + ey * u + fy * w - y0) * ic), z = Math.floor((P[a + 2] + ez * u + fz * w - z0) * ic);
        occ[(z * ny + y) * nx + x] = 1;
      }
    }
  }
  /** How shut in a point is (0 open .. o.max): rays over the hemisphere its normal faces, against the grid. */
  function shut(g: Grid, o: Opts, px: number, py: number, pz: number, nxv: number, nyv: number, nzv: number): number {
    const REACH = o.reach, RAYS = o.rays, dirs = dirsOf(o.rays), { occ, x0, y0, z0, nx, ny, nz, c, ic } = g, steps = Math.ceil(REACH / c), start = 3;
    // a frame about the normal
    let tx: number, ty: number, tz: number;
    if (Math.abs(nxv) < 0.8) { tx = 0; ty = -nzv; tz = nyv; } else { tx = nzv; ty = 0; tz = -nxv; }
    const tl = Math.hypot(tx, ty, tz) || 1; tx /= tl; ty /= tl; tz /= tl;
    const bx = nyv * tz - nzv * ty, by = nzv * tx - nxv * tz, bz = nxv * ty - nyv * tx;
    let sum = 0;
    for (const dv of dirs) {
      const dx = tx * dv[0] + bx * dv[1] + nxv * dv[2], dy = ty * dv[0] + by * dv[1] + nyv * dv[2], dz = tz * dv[0] + bz * dv[1] + nzv * dv[2];
      for (let s = start; s <= steps; s++) {
        const q = s * c, cx = Math.floor((px + dx * q - x0) * ic), cy = Math.floor((py + dy * q - y0) * ic), cz = Math.floor((pz + dz * q - z0) * ic);
        if (cx < 0 || cy < 0 || cz < 0 || cx >= nx || cy >= ny || cz >= nz) break;
        if (occ[(cz * ny + cy) * nx + cx]) { sum += 1 - q / REACH; break; }
      }
    }
    return Math.min(o.max, (sum / RAYS) * o.strength);
  }
  /** How shut in each vertex is (0 open .. o.max): rays over its hemisphere against the grid. `want`: only these meshes' vertices (the rest 0); `box`: and only those inside this box (x0, y0, z0, x1, y1, z1). */
  function* traceG(g: Grid, ms: M[], o: Opts, want?: (mi: number) => boolean, box?: number[]): Generator<void, Float32Array[], void> {
    const res: Float32Array[] = [];
    for (let mi = 0; mi < ms.length; mi++) {
      const m = ms[mi], out = new Float32Array(m.n);
      if (want && !want(mi)) { res.push(out); continue; }
      for (let i = 0; i < m.n; i++) {
        const px = m.pos[i * 3], py = m.pos[i * 3 + 1], pz = m.pos[i * 3 + 2], nxv = m.nor[i * 3], nyv = m.nor[i * 3 + 1], nzv = m.nor[i * 3 + 2];
        if ((i & 255) === 255) yield; // (a place to stop at, for the time-sliced)
        if (box && (px < box[0] || py < box[1] || pz < box[2] || px > box[3] || py > box[4] || pz > box[5])) continue;
        out[i] = shut(g, o, px, py, pz, nxv, nyv, nzv);
      }
      res.push(out);
    }
    return res;
  }
  /** A generator run to its end. */
  function drain<R>(gen: Generator<void, R, void>): R { for (;;) { const r = gen.next(); if (r.done) return r.value; } }
  const trace = (g: Grid, ms: M[], o: Opts, want?: (mi: number) => boolean, box?: number[]) => drain(traceG(g, ms, o, want, box));
  function compute(ms: M[], o: Opts): Float32Array[] {
    if (AoWasm.ready) { try { return computeW(ms, o); } catch (e) { AoWasm.fail(String((e as Error)?.message || e)); } }
    const g = makeGrid(ms, o); if (!g) return ms.map((m) => new Float32Array(m.n));
    for (const m of ms) mark(g, m);
    return trace(g, ms, o);
  }


  // Where the occlusion is worked out first and the mesh made to fit it: a triangle is split (its longest edge halved) only where the occlusion
  // at its edges' middles isn't what the corners' average says (or its middle isn't), so a flat plate in the open, a long cylinder facet that
  // is lit the same along its length, keeps its three vertices, and the places the occlusion changes quickly get the vertices. Nothing is
  // bigger than o.edge (4 cm for a gun) either way, so a small thing in the middle of a face isn't missed, and nothing is smaller than o.fine.
  function refine(m: M, g: Grid, o: Opts): { geo: THREE.BufferGeometry; ao: Float32Array } | null {
    const geo = m.mesh.geometry, src = geo.index ? geo.toNonIndexed() : geo, names = Object.keys(src.attributes), offs: number[] = [], sizes: number[] = [];
    if (geo.groups && geo.groups.length > 1) return null;
    let stride = 0;
    for (const n of names) { offs.push(stride); sizes.push(src.attributes[n].itemSize); stride += src.attributes[n].itemSize; }
    const pi = names.indexOf('position'), ni = names.indexOf('normal');
    if (pi < 0 || ni < 0) return null;
    const po = offs[pi], no = offs[ni], cnt = src.attributes.position.count, W = stride + 1, mw = m.mw, nm = m.nmx;
    const cur = new Float32Array(cnt * W);
    names.forEach((nme, k) => { const a = src.attributes[nme] as THREE.BufferAttribute; for (let i = 0; i < cnt; i++) for (let c = 0; c < sizes[k]; c++) cur[i * W + offs[k] + c] = a.getComponent(i, c); });
    const aoOf = (v: Float32Array) => {
      const x = v[po], y = v[po + 1], z = v[po + 2], a = v[no], b = v[no + 1], c = v[no + 2];
      let nx = nm[0] * a + nm[3] * b + nm[6] * c, ny = nm[1] * a + nm[4] * b + nm[7] * c, nz = nm[2] * a + nm[5] * b + nm[8] * c; const l = Math.hypot(nx, ny, nz) || 1; nx /= l; ny /= l; nz /= l;
      return shut(g, o, mw[0] * x + mw[4] * y + mw[8] * z + mw[12], mw[1] * x + mw[5] * y + mw[9] * z + mw[13], mw[2] * x + mw[6] * y + mw[10] * z + mw[14], nx, ny, nz);
    };
    const d2 = (a: Float32Array, b: Float32Array) => { const x = a[po] - b[po], y = a[po + 1] - b[po + 1], z = a[po + 2] - b[po + 2]; return x * x + y * y + z * z; };
    const mid = (a: Float32Array, b: Float32Array) => { const r = new Float32Array(W); for (let k = 0; k < stride; k++) r[k] = (a[k] + b[k]) / 2; const l = Math.hypot(r[no], r[no + 1], r[no + 2]) || 1; r[no] /= l; r[no + 1] /= l; r[no + 2] /= l; r[stride] = aoOf(r); return r; };
    const big = o.edge * o.edge, small = o.fine * o.fine, tol = o.tol, dark = o.max - 0.05, SAMPLE = o.edge / 2;   // (dark: as shut in as a vertex gets; SAMPLE: how far apart a long edge's occlusion is read)
    let out = new Float32Array(cnt * W * 2), n = 0;
    const emit = (a: Float32Array, b: Float32Array, c: Float32Array) => { if (n + W * 3 > out.length) { const r = new Float32Array(out.length * 2); r.set(out); out = r; } out.set(a, n); out.set(b, n + W); out.set(c, n + W * 2); n += W * 3; };
    const sub = (t: number, k: number) => cur.subarray((t * 3 + k) * W, (t * 3 + k + 1) * W);
    let changed = false;
    for (let t = 0; t < cnt / 3; t++) {
      const v = [sub(t, 0), sub(t, 1), sub(t, 2)]; for (const x of v) x[stride] = aoOf(x);
      const stack: Float32Array[][] = [v]; let guard = 0;
      while (stack.length) {
        const [a, b, c] = stack.pop()!, ab = d2(a, b), bc = d2(b, c), ca = d2(c, a), mx = Math.max(ab, bc, ca);
        if (mx <= small || ++guard > 512) { emit(a, b, c); continue; }
        let split = mx > big;
        if (split && Math.min(a[stride], b[stride], c[stride]) >= dark) {
          // (all its corners shut in, the inside of a handguard, a buffer tube in its stock: long, but split only if its middle isn't
          // dark too; uniformly dark faces were 41% of an M4's triangles after the split and added nothing)
          const mab = mid(a, b), mbc = mid(b, c), mca = mid(c, a);
          if (Math.min(mab[stride], mbc[stride], mca[stride]) >= dark) split = false;
        }
        if (split && mx > big) {
          // (a long triangle, a barrel's or tube's facet, a rail's flank: it used to be cut to 4 cm whatever its occlusion did, so
          // long parts grew x5-19. Now its occlusion is read every 2 cm along each long edge and at points inside it, and it's cut only
          // if that doesn't follow its corners: a shadow line across it is still found, an evenly lit stretch stays whole)
          const at = (p: Float32Array, q: Float32Array, t: number) => { const r = new Float32Array(W); for (let k = 0; k < stride; k++) r[k] = p[k] + (q[k] - p[k]) * t; const l = Math.hypot(r[no], r[no + 1], r[no + 2]) || 1; r[no] /= l; r[no + 1] /= l; r[no + 2] /= l; return aoOf(r); };
          let err = 0;
          for (const [p, q] of [[a, b], [b, c], [c, a]] as Float32Array[][]) {
            const L = Math.sqrt(d2(p, q)), n = Math.ceil(L / SAMPLE);
            for (let i = 1; i < n && err <= tol; i++) { const t = i / n; err = Math.max(err, Math.abs(at(p, q, t) - (p[stride] + (q[stride] - p[stride]) * t))); }
            if (err > tol) break;
          }
          if (err <= tol) {   // (and inside: its middle and halfway from it to each corner)
            const cen = new Float32Array(W); for (let k = 0; k < stride; k++) cen[k] = (a[k] + b[k] + c[k]) / 3;
            cen[stride] = (a[stride] + b[stride] + c[stride]) / 3;
            for (const p of [a, b, c]) { const e = Math.abs(at(cen, p, 0.5) - (cen[stride] + p[stride]) / 2); if (e > err) err = e; }
            const l = Math.hypot(cen[no], cen[no + 1], cen[no + 2]) || 1; cen[no] /= l; cen[no + 1] /= l; cen[no + 2] /= l;
            err = Math.max(err, Math.abs(aoOf(cen) - cen[stride]));
          }
          split = err > tol;
        }
        if (!split && mx <= big) { // (does the occlusion in the middle of an edge, and at the face's middle, follow the corners'?)
          const mab = mid(a, b), mbc = mid(b, c), mca = mid(c, a);
          let err = Math.max(Math.abs(mab[stride] - (a[stride] + b[stride]) / 2), Math.abs(mbc[stride] - (b[stride] + c[stride]) / 2), Math.abs(mca[stride] - (c[stride] + a[stride]) / 2));
          if (err <= tol) { const cen = new Float32Array(W); for (let k = 0; k < stride; k++) cen[k] = (a[k] + b[k] + c[k]) / 3; const l = Math.hypot(cen[no], cen[no + 1], cen[no + 2]) || 1; cen[no] /= l; cen[no + 1] /= l; cen[no + 2] /= l; err = Math.abs(aoOf(cen) - (a[stride] + b[stride] + c[stride]) / 3); }
          split = err > tol;
        }
        if (!split) { emit(a, b, c); continue; }
        changed = true;
        if (mx === ab) { const mm = mid(a, b); stack.push([mm, b, c], [a, mm, c]); } else if (mx === bc) { const mm = mid(b, c); stack.push([a, mm, c], [a, b, mm]); } else { const mm = mid(c, a); stack.push([b, c, mm], [a, b, mm]); }
      }
    }
    const nt = n / W;
    if (!changed && !geo.index) { const ao = new Float32Array(nt); for (let i = 0; i < nt; i++) ao[i] = out[i * W + stride]; return { geo, ao }; }
    // indexed again: a corner the triangles share (same position, normal, everything, so the same occlusion) is one vertex, as in the
    // model it came from; left as three per triangle the mesh had ~3x its vertices (82k on a 28k-triangle handguard, not 34k)
    const idx = new Uint32Array(nt), weld = new Map<string, number>(), keep: number[] = [];
    for (let i = 0; i < nt; i++) {
      let key = '';
      for (let k = 0; k < W; k++) key += Math.round(out[i * W + k] * 1e6) + ',';
      let j = weld.get(key);
      if (j === undefined) { j = keep.length; weld.set(key, j); keep.push(i); }
      idx[i] = j;
    }
    const nv = keep.length, bg = new THREE.BufferGeometry(), ao = new Float32Array(nv);
    names.forEach((nme, k) => { const arr = new Float32Array(nv * sizes[k]); for (let i = 0; i < nv; i++) for (let c = 0; c < sizes[k]; c++) arr[i * sizes[k] + c] = out[keep[i] * W + offs[k] + c]; bg.setAttribute(nme, new THREE.BufferAttribute(arr, sizes[k])); });
    for (let i = 0; i < nv; i++) ao[i] = out[keep[i] * W + stride];
    bg.setIndex(new THREE.BufferAttribute(nv > 65535 ? idx : new Uint16Array(idx), 1));
    bg.userData = geo.userData; bg.computeBoundingBox(); bg.computeBoundingSphere();
    return { geo: bg, ao };
  }
  const refCache = new Map<string, { n: number; geo: THREE.BufferGeometry }[]>(), REF_KEEP = 6;

  // ---------------------------------------------------------------- the same in WebAssembly (js/gunaowasm.ts, wasm/gunao: docs/wasm.md)
  // makeGrid, mark, shut, the trace loop and refine's triangle loop and weld are the module's when it's loaded (AoWasm.ready), the functions above
  // otherwise: the same numbers and the same mesh, bit for bit (tools/gunao_wasm_check.mjs compares them), an M4 in 60 ms against 148 (the module
  // also remembers each vertex's occlusion within a mesh, so a corner shared by several triangles is traced once: 136 000 asks, 76 000 traced).
  // What stays JavaScript is three.js's side: the meshes' world positions (collect), the attributes laid out in a row for the module, and the new
  // geometry made from what comes back.
  /** The grid in the module's memory, every mesh marked (but those `skip` says): its handle, which the caller frees (AoWasm.gridFree). */
  function gridW(ms: M[], o: Opts, skip?: (i: number) => boolean): number {
    const g = makeGrid(ms, o, false); if (!g) return 0;
    const gp = AoWasm.grid(g, o, dirsOf(o.rays));
    try { ms.forEach((m, i) => { if (!skip || !skip(i)) AoWasm.mark(gp, m.pos, m.idx); }); } catch (e) { AoWasm.gridFree(gp); throw e; }
    return gp;
  }
  type Ref = { geo: THREE.BufferGeometry; ao: Float32Array } | null;
  /** refine() with the module doing the work: the attributes laid out as refine lays them (toNonIndexed's values, getComponent's), the triangle loop and the weld in the module, and the geometry made from what comes back. */
  function refineW(m: M, geo: THREE.BufferGeometry, gp: number, o: Opts): { job: AoRefineJob; end: () => Ref } | null {
    const names = Object.keys(geo.attributes), offs: number[] = [], sizes: number[] = [];
    if (geo.groups && geo.groups.length > 1) return null;
    let stride = 0;
    for (const n of names) { offs.push(stride); sizes.push(geo.attributes[n].itemSize); stride += geo.attributes[n].itemSize; }
    const pi = names.indexOf('position'), ni = names.indexOf('normal');
    if (pi < 0 || ni < 0) return null;
    const ix = geo.index ? geo.index.array : null, cnt = ix ? ix.length : geo.attributes.position.count, W = stride + 1, mt = [...m.mw, ...m.nmx];
    const job = AoWasm.refine(gp, cnt, W, offs[pi], offs[ni], mt, o.edge, o.fine, o.tol, !!geo.index, (cur) => names.forEach((nme, k) => {
      const a = geo.attributes[nme] as THREE.BufferAttribute, sz = sizes[k], of = offs[k];
      if (!(a as any).isInterleavedBufferAttribute && !a.normalized) { const arr = a.array; for (let i = 0; i < cnt; i++) { const s = (ix ? ix[i] : i) * sz, d = i * W + of; for (let c = 0; c < sz; c++) cur[d + c] = arr[s + c]; } }
      else for (let i = 0; i < cnt; i++) for (let c = 0; c < sz; c++) cur[i * W + of + c] = a.getComponent(ix ? ix[i] : i, c);
    }));
    return { job, end: () => job.end((r) => {
      const rows = r.rows, nv = r.nv;
      if (!r.changed && !geo.index) { const ao = new Float32Array(r.nt); for (let i = 0; i < r.nt; i++) ao[i] = rows[i * W + stride]; return { geo, ao }; }
      const bg = new THREE.BufferGeometry(), ao = new Float32Array(nv);
      names.forEach((nme, k) => { const sz = sizes[k], of = offs[k], arr = new Float32Array(nv * sz); for (let i = 0; i < nv; i++) for (let c = 0; c < sz; c++) arr[i * sz + c] = rows[i * W + of + c]; bg.setAttribute(nme, new THREE.BufferAttribute(arr, sz)); });
      for (let i = 0; i < nv; i++) ao[i] = rows[i * W + stride];
      bg.setIndex(new THREE.BufferAttribute(nv > 65535 ? r.idx.slice() : new Uint16Array(r.idx), 1));
      bg.userData = geo.userData; bg.computeBoundingBox(); bg.computeBoundingSphere();
      return { geo: bg, ao };
    }) };
  }
  const TRIS = 256; // (the module's triangles between stops: a fraction of a millisecond)
  /** Every mesh refined, as a piece of work with places to stop: the grid and the triangles in the module (`useW`), or in JavaScript a mesh at a time. `geos`: the meshes' geometries when it began. */
  function* refineAllG(ms: M[], o: Opts, geos: THREE.BufferGeometry[], useW: boolean): Generator<void, Ref[] | null, void> {
    if (useW) {
      let gp = 0, cur: AoRefineJob | null = null;
      try {
        const g = makeGrid(ms, o, false); if (!g) return null;
        gp = AoWasm.grid(g, o, dirsOf(o.rays));
        for (const m of ms) { AoWasm.mark(gp, m.pos, m.idx); yield; }
        const res: Ref[] = [];
        for (let i = 0; i < ms.length; i++) {
          const w = refineW(ms[i], geos[i], gp, o); if (!w) { res.push(null); continue; }
          cur = w.job;
          while (!w.job.run(TRIS)) yield;
          cur = null; res.push(w.end());
        }
        return res;
      } finally { if (cur) cur.drop(); if (gp) AoWasm.gridFree(gp); }
    }
    const g = makeGrid(ms, o); if (!g) return null;
    for (const m of ms) mark(g, m);
    const res: Ref[] = [];
    for (const m of ms) { yield; res.push(refine(m, g, o)); }
    return res;
  }
  /** traceG over a grid of the module's: a few thousand vertices between stops (each a fraction of a millisecond) */
  function* traceWG(gp: number, ms: M[], want?: (mi: number) => boolean, box?: number[]): Generator<void, Float32Array[], void> {
    const res: Float32Array[] = [];
    for (let mi = 0; mi < ms.length; mi++) {
      const m = ms[mi], out = new Float32Array(m.n);
      if (want && !want(mi)) { res.push(out); continue; }
      const tr = AoWasm.tracer(gp, m.pos, m.nor);
      try { for (let i = 0; i < m.n; i += 4096) { tr.run(i, Math.min(m.n, i + 4096), out, box); yield; } } finally { tr.free(); }
      res.push(out);
    }
    return res;
  }
  function computeW(ms: M[], o: Opts): Float32Array[] {
    const gp = gridW(ms, o); if (!gp) return ms.map((m) => new Float32Array(m.n));
    try { return drain(traceWG(gp, ms)); } finally { AoWasm.gridFree(gp); }
  }

  /** The numbers of a thing with moving parts: `base` with every one of them away (and each one's own surfaces against what stays), and for each layer (a door, a ramp: its meshes) what it adds to a vertex of what stays when it's in place: `d`, and `l` the layer's number (1 up; the vertex's strongest). */
  interface Layered { base: Float32Array[]; d: Float32Array[]; l: Float32Array[] }
  function* layeredG(ms: M[], o: Opts, layers: Set<THREE.Object3D>[]): Generator<void, Layered, void> {
    const which = ms.map((m) => layers.findIndex((s) => s.has(m.mesh))), g = makeGrid(ms, o);
    const zeros = () => ms.map((m) => new Float32Array(m.n));
    if (!g) return { base: zeros(), d: zeros(), l: zeros() };
    ms.forEach((m, i) => { if (which[i] < 0) mark(g, m); });
    const base = yield* traceG(g, ms, o), d = zeros(), l = zeros();
    for (let j = 0; j < layers.length; j++) {
      const g2: Grid = { ...g, occ: g.occ.slice() };
      let bx0 = 1e9, by0 = 1e9, bz0 = 1e9, bx1 = -1e9, by1 = -1e9, bz1 = -1e9;
      ms.forEach((m, i) => {
        if (which[i] !== j) return;
        mark(g2, m);
        for (let v = 0; v < m.n; v++) { const x = m.pos[v * 3], y = m.pos[v * 3 + 1], z = m.pos[v * 3 + 2]; if (x < bx0) bx0 = x; if (x > bx1) bx1 = x; if (y < by0) by0 = y; if (y > by1) by1 = y; if (z < bz0) bz0 = z; if (z > bz1) bz1 = z; }
      });
      if (bx1 < bx0) continue;
      const r = o.reach, withIt = yield* traceG(g2, ms, o, (i) => which[i] < 0, [bx0 - r, by0 - r, bz0 - r, bx1 + r, by1 + r, bz1 + r]);
      ms.forEach((m, i) => { if (which[i] >= 0) return; for (let v = 0; v < m.n; v++) { const dd = withIt[i][v] - base[i][v]; if (dd > 0.004 && dd > d[i][v]) { d[i][v] = dd; l[i][v] = j + 1; } } });
    }
    return { base, d, l };
  }
  /** layeredG with the module's grids (the grid with what stays, and a copy of it for each layer with the layer's meshes marked in) */
  function* layeredWG(ms: M[], o: Opts, layers: Set<THREE.Object3D>[]): Generator<void, Layered, void> {
    const which = ms.map((m) => layers.findIndex((s) => s.has(m.mesh)));
    const zeros = () => ms.map((m) => new Float32Array(m.n));
    const gp = gridW(ms, o, (i) => which[i] >= 0);
    if (!gp) return { base: zeros(), d: zeros(), l: zeros() };
    try {
      const base = yield* traceWG(gp, ms), d = zeros(), l = zeros();
      for (let j = 0; j < layers.length; j++) {
        const g2 = AoWasm.gridClone(gp);
        try {
          let bx0 = 1e9, by0 = 1e9, bz0 = 1e9, bx1 = -1e9, by1 = -1e9, bz1 = -1e9;
          ms.forEach((m, i) => {
            if (which[i] !== j) return;
            AoWasm.mark(g2, m.pos, m.idx);
            for (let v = 0; v < m.n; v++) { const x = m.pos[v * 3], y = m.pos[v * 3 + 1], z = m.pos[v * 3 + 2]; if (x < bx0) bx0 = x; if (x > bx1) bx1 = x; if (y < by0) by0 = y; if (y > by1) by1 = y; if (z < bz0) bz0 = z; if (z > bz1) bz1 = z; }
          });
          if (bx1 < bx0) continue;
          const r = o.reach, withIt = yield* traceWG(g2, ms, (i) => which[i] < 0, [bx0 - r, by0 - r, bz0 - r, bx1 + r, by1 + r, bz1 + r]);
          ms.forEach((m, i) => { if (which[i] >= 0) return; for (let v = 0; v < m.n; v++) { const dd = withIt[i][v] - base[i][v]; if (dd > 0.004 && dd > d[i][v]) { d[i][v] = dd; l[i][v] = j + 1; } } });
        } finally { AoWasm.gridFree(g2); }
      }
      return { base, d, l };
    } finally { AoWasm.gridFree(gp); }
  }

  // ---------------------------------------------------------------- the refined gun: worked out now, or (Opts.async: the gun in the hands) a few ms a frame
  const isMagNode = (x: THREE.Object3D | null) => { for (; x; x = x.parent) if (x.userData && (x.userData.slot === 'mag' || x.userData.part === 'mag')) return true; return false; };
  /** A build's refined meshes from the cache onto these (the build's own meshes, in the same order): false if it isn't there or doesn't fit. */
  function fromCache(ms: M[], key: string): boolean {
    const hit = refCache.get(key);
    if (!(hit && hit.length === ms.length && hit.every((h, i) => h.n === ms[i].n))) return false;
    refCache.delete(key); refCache.set(key, hit); // (the most recently used goes to the end)
    ms.forEach((m, i) => { m.mesh.geometry.dispose(); const gm = hit[i].geo.clone(); m.mesh.geometry = gm; if (isMagNode(m.mesh)) gm.setAttribute('aOcc', new T.BufferAttribute(new Float32Array(gm.attributes.position.count), 1)); });
    return true;
  }
  /** What came out onto the meshes (each its own copy; a magazine's occlusion 0) and into the cache. A mesh whose geometry isn't the one it began with (`geos`) is left alone. */
  function adopt(ms: M[], res: Ref[], key: string | undefined, geos: THREE.BufferGeometry[]) {
    const made: { n: number; geo: THREE.BufferGeometry }[] = [];
    ms.forEach((m, i) => {
      const r = res[i];
      if (!r) { made.push({ n: m.n, geo: geos[i].clone() }); return; }
      const gm = r.geo; gm.setAttribute('aOcc', new T.BufferAttribute(r.ao, 1));
      made.push({ n: m.n, geo: gm });
      if (m.mesh.geometry !== geos[i]) return;
      const own = gm.clone(); if (isMagNode(m.mesh)) own.setAttribute('aOcc', new T.BufferAttribute(new Float32Array(own.attributes.position.count), 1));
      if (m.mesh.geometry !== gm) m.mesh.geometry.dispose();
      m.mesh.geometry = own;
    });
    if (key) {
      refCache.set(key, made);
      // (a refined gun is megabytes of geometry: only the last few builds are kept, the oldest let go)
      while (refCache.size > REF_KEEP) { const k = refCache.keys().next().value as string; for (const h of refCache.get(k)!) h.geo.dispose(); refCache.delete(k); }
    }
  }
  /** builds being refined a few ms a frame: whoever else asks for one waits for it (`waiters`, their meshes), or has it finished there and then */
  const refJobs = new Map<string, { waiters: M[][]; finish: () => void }>(), SLICE = 6;
  /**
   * Refines a build's meshes: at once, or (o.async, with a key) a few ms at a time (SLICE) between frames, the meshes shown as they are (no aOcc: none
   * of the darkening) till it's done, when they take it as they would have at once: the numbers are the same, worked out from the meshes as they were
   * when asked (collect's positions and matrices, the geometries then), not as they've moved since. The module's when it's there; if it fails on the
   * way, the work starts again in JavaScript.
   */
  function refineNow(ms: M[], o: Opts, key: string | undefined, t0: number) {
    const geos = ms.map((m) => m.mesh.geometry);
    let useW = AoWasm.ready, gen = refineAllG(ms, o, geos, useW), fin = false;
    const next = () => {
      try { return gen.next(); } catch (e) {
        if (!useW) throw e;
        AoWasm.fail(String((e as Error)?.message || e)); useW = false; gen = refineAllG(ms, o, geos, false); return gen.next();
      }
    };
    const job = { waiters: [] as M[][], finish: () => { if (!fin) { fin = true; while (!step(Infinity)); } } };
    const step = (budget: number) => {
      const t = performance.now();
      for (;;) {
        const r = next();
        if (r.done) {
          if (key) refJobs.delete(key);
          if (r.value) adopt(ms, r.value, key, geos);
          if (key) for (const w of job.waiters) if (!fromCache(w, key)) refineNow(w, GUN, undefined, performance.now()); // (one that doesn't fit what was made: its own, now)
          last = Math.round(performance.now() - t0);
          return true;
        }
        if (performance.now() - t > budget) return false;
      }
    };
    if (!(o.async && key)) { fin = true; step(Infinity); return; }
    refJobs.set(key, job);
    const tick = () => { if (fin) return; if (step(SLICE)) { fin = true; return; } setTimeout(tick, 0); };
    setTimeout(tick, 0);
  }

  const layerCache = new Map<string, Layered>(), pending = new Map<string, ((r: Layered) => void)[]>();
  /**
   * Gives every opaque mesh of an assembled gun (or ship) its aOcc attribute (a build's `key` keeps the numbers for the next ask).
   * `layers`: the parts that move (each layer a list of nodes: a door's leaves, a ramp): their occlusion on what's round them is kept
   * apart, as aOccD (how much) and aOccI (which layer), and the lit materials take it times the layer's closedness (js/lightgrid.ts
   * U.lgAoK[1..]: 1 shut, 0 open: the game sets it as the part moves), so an open door leaves no shade where it was. Opts.async: it's
   * worked out a few ms a frame (a ship: a couple of seconds all told; a gun, GUN_ASYNC: 6-8 frames), and takes hold when it's done. GunAo.busy:
   * how many builds are under way so.
   */
  function apply(group: THREE.Object3D, key?: string, o: Opts = GUN, layers?: THREE.Object3D[][]) {
    const t0 = performance.now(), ms = collect(group, o.adaptive || !(o.edge > 0) ? null : o);
    if (!ms.length) return;
    const same = (a: Float32Array[] | undefined) => !!a && a.length === ms.length && a.every((x, i) => x.length === ms[i].n);
    // (a magazine takes none itself, though it still shuts in what it sits against)
    const isMag = (o: THREE.Object3D | null) => { for (; o; o = o.parent) if (o.userData && (o.userData.slot === 'mag' || o.userData.part === 'mag')) return true; return false; };
    if (o.direct) for (const m of ms) for (const mt of (Array.isArray(m.mesh.material) ? m.mesh.material : [m.mesh.material]) as any[]) if (mt && mt.isMeshStandardMaterial && !(mt.defines && mt.defines.AO_DIRECT !== undefined)) { mt.defines = Object.assign({}, mt.defines, { AO_DIRECT: '' }); mt.needsUpdate = true; } // (rooms lit by lamps with no shadows: the occlusion takes their light too)
    const put = (c: { base: Float32Array[]; d?: Float32Array[]; l?: Float32Array[] }) => {
      ms.forEach((m, i) => {
        const gm = m.mesh.geometry;
        gm.setAttribute('aOcc', new T.BufferAttribute(isMag(m.mesh) ? new Float32Array(m.n) : c.base[i], 1));
        if (c.d && c.l) { gm.setAttribute('aOccD', new T.BufferAttribute(c.d[i], 1)); gm.setAttribute('aOccI', new T.BufferAttribute(c.l[i], 1)); }
      });
      last = Math.round(performance.now() - t0);
    };
    if (o.adaptive && !(layers && layers.length)) {
      const job = key ? refJobs.get(key) : undefined;
      if (job) { if (o.async) { job.waiters.push(ms); return; } job.finish(); } // (the same build under way: wait for it, or (asked for now) see it done now)
      if (key && fromCache(ms, key)) { last = Math.round(performance.now() - t0); return; }
      refineNow(ms, o, key, t0);
      return;
    }
    if (layers && layers.length) {
      const hit = key ? layerCache.get(key) : undefined;
      if (hit && same(hit.base)) { put(hit); return; }
      if (key && pending.has(key)) { pending.get(key)!.push((r) => { if (same(r.base)) put(r); }); return; }
      const sets = layers.map((ns) => { const st = new Set<THREE.Object3D>(); for (const n of ns) n.traverse((x) => st.add(x)); return st; }), waiters: ((r: Layered) => void)[] = [];
      if (key) pending.set(key, waiters);
      // (the module's when it's there; if it fails on the way, the work starts again in JavaScript)
      let useW = AoWasm.ready, gen = useW ? layeredWG(ms, o, sets) : layeredG(ms, o, sets);
      const next = () => { try { return gen.next(); } catch (e) { if (!useW) throw e; AoWasm.fail(String((e as Error)?.message || e)); useW = false; gen = layeredG(ms, o, sets); return gen.next(); } };
      const done = (r: Layered) => { if (key) { layerCache.set(key, r); pending.delete(key); } put(r); for (const w of waiters) w(r); };
      if (o.async) {
        const step = () => { const t = performance.now(); for (;;) { const r = next(); if (r.done) { done(r.value); return; } if (performance.now() - t > 6) break; } setTimeout(step, 0); };
        setTimeout(step, 0);
      } else { for (;;) { const r = next(); if (r.done) { done(r.value); break; } } }
      return;
    }
    let occ = key ? cache.get(key) : undefined;
    if (!same(occ)) { occ = compute(ms, o); if (key) cache.set(key, occ); }
    put({ base: occ! });
  }
  return { apply, GUN, GUN_FAR, GUN_ASYNC, SHIP, wasm: AoWasm, get lastMs() { return last; }, /** builds being refined across frames (GUN_ASYNC) */ get busy() { return refJobs.size; }, compute: (g: THREE.Object3D, o: Opts = GUN) => compute(collect(g), o) };
})();
