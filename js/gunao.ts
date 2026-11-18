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
  const REACH = 0.045, RAYS = 14, STRENGTH = 1.6, MAX = 0.8;
  const cache = new Map<string, Float32Array[]>();
  // the hemisphere's rays about +z, cosine-weighted
  const dirs: number[][] = [];
  for (let i = 0; i < RAYS; i++) { const u = (i + 0.5) / RAYS, r = Math.sqrt(u), ph = i * 2.399963; dirs.push([r * Math.cos(ph), r * Math.sin(ph), Math.sqrt(1 - u)]); }

  interface M { mesh: THREE.Mesh; pos: Float32Array; nor: Float32Array; idx: ArrayLike<number> | null; n: number }
  function collect(group: THREE.Object3D): M[] {
    group.updateMatrixWorld(true);
    const out: M[] = [], v = new T.Vector3(), nm = new T.Matrix3();
    group.traverse((o: any) => {
      if (!o.isMesh || !o.geometry || !o.geometry.attributes.position || !o.geometry.attributes.normal) return;
      const ms = Array.isArray(o.material) ? o.material : [o.material];
      if (ms.some((m: any) => !m || m.transparent || m.visible === false || m.alphaTest > 0)) return;
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

  function compute(ms: M[]): Float32Array[] {
    let x0 = 1e9, y0 = 1e9, z0 = 1e9, x1 = -1e9, y1 = -1e9, z1 = -1e9;
    for (const m of ms) for (let i = 0; i < m.n; i++) {
      const x = m.pos[i * 3], y = m.pos[i * 3 + 1], z = m.pos[i * 3 + 2];
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; if (z < z0) z0 = z; if (z > z1) z1 = z;
    }
    if (x1 < x0) return ms.map((m) => new Float32Array(m.n));
    const pad = REACH + 0.02, c = Math.max(0.003, Math.max(x1 - x0, y1 - y0, z1 - z0) / 300), ic = 1 / c;
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
    const res: Float32Array[] = [], steps = Math.ceil(REACH / c), start = 2;
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
        out[i] = Math.min(MAX, (sum / RAYS) * STRENGTH);
      }
      res.push(out);
    }
    return res;
  }

  /** Gives every opaque mesh of an assembled gun its aOcc attribute (a build's `key` keeps the numbers for the next ask). */
  function apply(group: THREE.Object3D, key?: string) {
    const ms = collect(group);
    if (!ms.length) return;
    let occ = key ? cache.get(key) : undefined;
    if (!occ || occ.length !== ms.length || occ.some((a, i) => a.length !== ms[i].n)) { occ = compute(ms); if (key) cache.set(key, occ); }
    ms.forEach((m, i) => m.mesh.geometry.setAttribute('aOcc', new T.BufferAttribute(occ![i], 1)));
  }
  return { apply, compute: (g: THREE.Object3D) => compute(collect(g)) };
})();
