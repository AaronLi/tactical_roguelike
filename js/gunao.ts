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
  interface Opts { reach: number; rays: number; cell: number; cells: number; edge: number; strength: number; max: number; direct: boolean }
  const GUN: Opts = { reach: 0.045, rays: 14, cell: 0.003, cells: 300, edge: 0.012, strength: 3.2, max: 0.9, direct: false };
  /** The squad's ship (inside and out): rooms and hull plates metres across, so a ray reaches a metre and a half, cells of 8 cm. */
  const SHIP: Opts = { reach: 1.5, rays: 24, cell: 0.08, cells: 400, edge: 0.4, strength: 1.8, max: 0.75, direct: true };
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
    const cnt = g.attributes.position.count;
    let cur = new Float32Array(cnt * stride);
    names.forEach((n, k) => { const a = g.attributes[n] as THREE.BufferAttribute; for (let i = 0; i < cnt; i++) for (let c = 0; c < sizes[k]; c++) cur[i * stride + offs[k] + c] = a.getComponent(i, c); });
    const po = offs[pi], e2 = maxEdge * maxEdge;
    const d2 = (v: Float32Array, a: number, b: number) => { const x = v[a + po] - v[b + po], y = v[a + po + 1] - v[b + po + 1], z = v[a + po + 2] - v[b + po + 2]; return x * x + y * y + z * z; };
    let changed = false;
    for (let pass = 0; pass < 6; pass++) {
      const nt = cur.length / stride / 3; let big = 0;
      for (let t = 0; t < nt; t++) { const a = t * 3 * stride, b = a + stride, c = b + stride; if (d2(cur, a, b) > e2 || d2(cur, b, c) > e2 || d2(cur, c, a) > e2) big++; }
      if (!big) break;
      changed = true;
      const out = new Float32Array((nt + big * 3) * 3 * stride); let o = 0;
      const mid = (a: number, b: number, at: number) => { for (let k = 0; k < stride; k++) out[at + k] = (cur[a + k] + cur[b + k]) / 2; if (ni >= 0) { const q = at + offs[ni], l = Math.hypot(out[q], out[q + 1], out[q + 2]) || 1; out[q] /= l; out[q + 1] /= l; out[q + 2] /= l; } };
      for (let t = 0; t < nt; t++) {
        const a = t * 3 * stride, b = a + stride, c = b + stride;
        if (d2(cur, a, b) > e2 || d2(cur, b, c) > e2 || d2(cur, c, a) > e2) {
          const ab = o + 3 * stride, bc = ab + stride, ca = bc + stride; // (a, b, c's corners and their midpoints, laid out as four triangles)
          // a ab ca / ab b bc / ca bc c / ab bc ca
          const tri = (i: number, p: number[]) => { for (let k = 0; k < 3; k++) out.set(p[k] >= 0 ? cur.subarray(p[k], p[k] + stride) : out.subarray(-p[k] - 1, -p[k] - 1 + stride), o + (i * 3 + k) * stride); };
          // the midpoints first, in the three slots after the first triangle's (a scratch the later triangles read), then every triangle
          const sc = new Float32Array(stride * 3), m = (x: number, y: number, at: number) => { for (let k = 0; k < stride; k++) sc[at + k] = (cur[x + k] + cur[y + k]) / 2; if (ni >= 0) { const q = at + offs[ni], l = Math.hypot(sc[q], sc[q + 1], sc[q + 2]) || 1; sc[q] /= l; sc[q + 1] /= l; sc[q + 2] /= l; } };
          m(a, b, 0); m(b, c, stride); m(c, a, stride * 2);
          const put = (v: Float32Array | null, src: number) => { if (v) out.set(v.subarray(src, src + stride), o); else out.set(cur.subarray(src, src + stride), o); o += stride; };
          put(null, a); put(sc, 0); put(sc, stride * 2);
          put(sc, 0); put(null, b); put(sc, stride);
          put(sc, stride * 2); put(sc, stride); put(null, c);
          put(sc, 0); put(sc, stride); put(sc, stride * 2);
          void ab; void bc; void ca; void tri; void mid;
        } else { out.set(cur.subarray(a, a + stride * 3), o); o += stride * 3; }
      }
      cur = out.subarray(0, o);
    }
    if (!changed) return geo;
    const n = cur.length / stride, bg = new THREE.BufferGeometry();
    names.forEach((nm, k) => { const arr = new Float32Array(n * sizes[k]); for (let i = 0; i < n; i++) for (let c = 0; c < sizes[k]; c++) arr[i * sizes[k] + c] = cur[i * stride + offs[k] + c]; bg.setAttribute(nm, new THREE.BufferAttribute(arr, sizes[k])); });
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

  function compute(ms: M[], o: Opts): Float32Array[] {
    const REACH = o.reach, RAYS = o.rays, dirs = dirsOf(o.rays);
    let x0 = 1e9, y0 = 1e9, z0 = 1e9, x1 = -1e9, y1 = -1e9, z1 = -1e9;
    for (const m of ms) for (let i = 0; i < m.n; i++) {
      const x = m.pos[i * 3], y = m.pos[i * 3 + 1], z = m.pos[i * 3 + 2];
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; if (z < z0) z0 = z; if (z > z1) z1 = z;
    }
    if (x1 < x0) return ms.map((m) => new Float32Array(m.n));
    const pad = REACH + 0.02, c = Math.max(o.cell, Math.max(x1 - x0, y1 - y0, z1 - z0) / o.cells), ic = 1 / c;
    x0 -= pad; y0 -= pad; z0 -= pad;
    const nx = Math.ceil((x1 + pad - x0) * ic) + 1, ny = Math.ceil((y1 + pad - y0) * ic) + 1, nz = Math.ceil((z1 + pad - z0) * ic) + 1, occ = new Uint8Array(nx * ny * nz);
    // the surfaces: each triangle sampled finely enough to leave no cell unmarked
    for (const m of ms) {
      const tri = m.idx ? m.idx.length / 3 : m.n / 3, P = m.pos;
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
    const res: Float32Array[] = [], steps = Math.ceil(REACH / c), start = 3;
    for (const m of ms) {
      const out = new Float32Array(m.n);
      for (let i = 0; i < m.n; i++) {
        const px = m.pos[i * 3], py = m.pos[i * 3 + 1], pz = m.pos[i * 3 + 2], nxv = m.nor[i * 3], nyv = m.nor[i * 3 + 1], nzv = m.nor[i * 3 + 2];
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

  /** Gives every opaque mesh of an assembled gun its aOcc attribute (a build's `key` keeps the numbers for the next ask). */
  function apply(group: THREE.Object3D, key?: string, o: Opts = GUN) {
    const t0 = performance.now(), ms = collect(group, o);
    if (!ms.length) return;
    let occ = key ? cache.get(key) : undefined;
    if (!occ || occ.length !== ms.length || occ.some((a, i) => a.length !== ms[i].n)) { occ = compute(ms, o); if (key) cache.set(key, occ); }
    // (a magazine takes none itself, though it still shuts in what it sits against)
    const isMag = (o: THREE.Object3D | null) => { for (; o; o = o.parent) if (o.userData && (o.userData.slot === 'mag' || o.userData.part === 'mag')) return true; return false; };
    if (o.direct) for (const m of ms) for (const mt of (Array.isArray(m.mesh.material) ? m.mesh.material : [m.mesh.material]) as any[]) if (mt && mt.isMeshStandardMaterial && !(mt.defines && mt.defines.AO_DIRECT !== undefined)) { mt.defines = Object.assign({}, mt.defines, { AO_DIRECT: '' }); mt.needsUpdate = true; } // (rooms lit by lamps with no shadows: the occlusion takes their light too)
    ms.forEach((m, i) => m.mesh.geometry.setAttribute('aOcc', new T.BufferAttribute(isMag(m.mesh) ? new Float32Array(m.n) : occ![i], 1)));
    last = Math.round(performance.now() - t0);
  }
  return { apply, GUN, SHIP, get lastMs() { return last; }, compute: (g: THREE.Object3D, o: Opts = GUN) => compute(collect(g), o) };
})();
