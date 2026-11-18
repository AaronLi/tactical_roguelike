'use strict';
// A gun's ambient occlusion: a darkening at each vertex where the gun is shut in by itself (the receiver's well round a magazine, under a
// handguard, a sight's rail, the gap between a barrel and its shroud, a grip's ridges), read by the lit materials as the attribute aOcc
// (js/lightgrid.ts: the fill, the room's light on it and what it reflects of the room: not a muzzle flash).
//
// It is worked out for the assembled build, whatever parts are on it, so what one part does to its neighbour is in it (a bake of each
// part alone, as they're baked, couldn't): every mesh of the gun is stood in a grid of 3 mm cells, a cell any triangle's surface passes
// through marked; from each vertex a few rays leave over the hemisphere its normal faces, a few centimetres long, and what they meet
// is how shut in it is. About 40 ms for a rifle (23 000 vertices), done once for a build (the result's kept by its code), so the gun in
// the hands, in the world, in the gunsmith and on the hangar's wall all take the same numbers. A part that moves (a bolt, a slide, the
// magazine) takes its darkening along as it was in the gun at rest; the muzzle flash's, the lenses' and anything see-through has none.
export const GunAo = (() => {
  const T = THREE;
  /** What a thing's occlusion is made of: how far a ray reaches (m), how many rays, the finest cell (m) and the most cells along its longest side, the longest an edge may be before it is split (m), how much the shut-in share is scaled and its cap. */
  interface Opts { reach: number; rays: number; cell: number; cells: number; edge: number; strength: number; max: number; direct: boolean; async: boolean }
  const GUN: Opts = { reach: 0.045, rays: 14, cell: 0.003, cells: 300, edge: 0.012, strength: 3.2, max: 0.9, direct: false, async: false };
  /** The squad's ship (inside and out): rooms and hull plates metres across, so a ray reaches a metre and a half, cells of 8 cm. */
  const SHIP: Opts = { reach: 1.5, rays: 16, cell: 0.08, cells: 400, edge: 0.7, strength: 1.4, max: 0.75, direct: true, async: true };
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

  interface M { mesh: THREE.Mesh; pos: Float32Array; nor: Float32Array; idx: ArrayLike<number> | null; n: number }
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
      out.push({ mesh: o, pos, nor, idx: g.index ? g.index.array : null, n });
    });
    return out;
  }

  // The grid: the cells of 3 mm (a ship: 8 cm) any triangle's surface passes through are marked.
  interface Grid { occ: Uint8Array; x0: number; y0: number; z0: number; nx: number; ny: number; nz: number; c: number; ic: number }
  function makeGrid(ms: M[], o: Opts): Grid | null {
    let x0 = 1e9, y0 = 1e9, z0 = 1e9, x1 = -1e9, y1 = -1e9, z1 = -1e9;
    for (const m of ms) for (let i = 0; i < m.n; i++) {
      const x = m.pos[i * 3], y = m.pos[i * 3 + 1], z = m.pos[i * 3 + 2];
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; if (z < z0) z0 = z; if (z > z1) z1 = z;
    }
    if (x1 < x0) return null;
    const pad = o.reach + 0.02, c = Math.max(o.cell, Math.max(x1 - x0, y1 - y0, z1 - z0) / o.cells), ic = 1 / c;
    x0 -= pad; y0 -= pad; z0 -= pad;
    const nx = Math.ceil((x1 + pad - x0) * ic) + 1, ny = Math.ceil((y1 + pad - y0) * ic) + 1, nz = Math.ceil((z1 + pad - z0) * ic) + 1;
    return { occ: new Uint8Array(nx * ny * nz), x0, y0, z0, nx, ny, nz, c, ic };
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
  /** How shut in each vertex is (0 open .. o.max): rays over its hemisphere against the grid. `want`: only these meshes' vertices (the rest 0); `box`: and only those inside this box (x0, y0, z0, x1, y1, z1). */
  function* traceG(g: Grid, ms: M[], o: Opts, want?: (mi: number) => boolean, box?: number[]): Generator<void, Float32Array[], void> {
    const REACH = o.reach, RAYS = o.rays, dirs = dirsOf(o.rays), { occ, x0, y0, z0, nx, ny, nz, c, ic } = g, res: Float32Array[] = [], steps = Math.ceil(REACH / c), start = 3;
    for (let mi = 0; mi < ms.length; mi++) {
      const m = ms[mi], out = new Float32Array(m.n);
      if (want && !want(mi)) { res.push(out); continue; }
      for (let i = 0; i < m.n; i++) {
        const px = m.pos[i * 3], py = m.pos[i * 3 + 1], pz = m.pos[i * 3 + 2], nxv = m.nor[i * 3], nyv = m.nor[i * 3 + 1], nzv = m.nor[i * 3 + 2];
        if ((i & 255) === 255) yield; // (a place to stop at, for the time-sliced)
        if (box && (px < box[0] || py < box[1] || pz < box[2] || px > box[3] || py > box[4] || pz > box[5])) continue;
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
        out[i] = Math.min(o.max, (sum / RAYS) * o.strength);
      }
      res.push(out);
    }
    return res;
  }
  /** A generator run to its end. */
  function drain<R>(gen: Generator<void, R, void>): R { for (;;) { const r = gen.next(); if (r.done) return r.value; } }
  const trace = (g: Grid, ms: M[], o: Opts, want?: (mi: number) => boolean, box?: number[]) => drain(traceG(g, ms, o, want, box));
  function compute(ms: M[], o: Opts): Float32Array[] {
    const g = makeGrid(ms, o); if (!g) return ms.map((m) => new Float32Array(m.n));
    for (const m of ms) mark(g, m);
    return trace(g, ms, o);
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

  const layerCache = new Map<string, Layered>(), pending = new Map<string, ((r: Layered) => void)[]>();
  /**
   * Gives every opaque mesh of an assembled gun (or ship) its aOcc attribute (a build's `key` keeps the numbers for the next ask).
   * `layers`: the parts that move (each layer a list of nodes: a door's leaves, a ramp): their occlusion on what's round them is kept
   * apart, as aOccD (how much) and aOccI (which layer), and the lit materials take it times the layer's closedness (js/lightgrid.ts
   * U.lgAoK[1..]: 1 shut, 0 open: the game sets it as the part moves), so an open door leaves no shade where it was. Opts.async: it's
   * worked out a few ms a frame (a ship: a couple of seconds all told), and takes hold when it's done.
   */
  function apply(group: THREE.Object3D, key?: string, o: Opts = GUN, layers?: THREE.Object3D[][]) {
    const t0 = performance.now(), ms = collect(group, o);
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
    if (layers && layers.length) {
      const hit = key ? layerCache.get(key) : undefined;
      if (hit && same(hit.base)) { put(hit); return; }
      if (key && pending.has(key)) { pending.get(key)!.push((r) => { if (same(r.base)) put(r); }); return; }
      const sets = layers.map((ns) => { const st = new Set<THREE.Object3D>(); for (const n of ns) n.traverse((x) => st.add(x)); return st; }), waiters: ((r: Layered) => void)[] = [];
      if (key) pending.set(key, waiters);
      const gen = layeredG(ms, o, sets), done = (r: Layered) => { if (key) { layerCache.set(key, r); pending.delete(key); } put(r); for (const w of waiters) w(r); };
      if (o.async) {
        const step = () => { const t = performance.now(); for (;;) { const r = gen.next(); if (r.done) { done(r.value); return; } if (performance.now() - t > 6) break; } setTimeout(step, 0); };
        setTimeout(step, 0);
      } else done(drain(gen));
      return;
    }
    let occ = key ? cache.get(key) : undefined;
    if (!same(occ)) { occ = compute(ms, o); if (key) cache.set(key, occ); }
    put({ base: occ! });
  }
  return { apply, GUN, SHIP, get lastMs() { return last; }, compute: (g: THREE.Object3D, o: Opts = GUN) => compute(collect(g), o) };
})();
