// How one tag's geometry differs between two builds: the same, a rigid move, or a different shape.
// Used by the tests' comparisons (tools/model_compare.mjs). Positions are world-space (tools/model_sweep.mjs meshesOf), metres, in glTF axes
// (x right, y up, z = -forward); displacements are reported as [forward, up, right] = [-dz, dy, dx], the contract's order.

export const TOL = 2e-6;        // metres: float noise of the recipe's own arithmetic ("the same", "a rigid move")

/** The two units (arrays of { mat, node, v }) have the same layout: mesh count, materials, nodes, vertex counts. */
export function aligned(a, b) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i].mat !== b[i].mat || a[i].node !== b[i].node || a[i].v.length !== b[i].v.length) return false;
  return true;
}

/**
 * Classifies b against a. Returns { kind: 'same' } | { kind: 'move', d: [df, du, dr] } (every vertex moved alike) | { kind: 'shape' }.
 */
export function diffUnits(a, b) {
  if (!a && !b) return { kind: 'same' };
  if (!a || !b || !aligned(a, b)) return { kind: 'shape' };
  let n = 0; for (const m of a) n += m.v.length / 3;
  if (!n) return { kind: 'same' };
  let d0 = null, same = true, rigid = true;
  for (let i = 0; i < a.length; i++) for (let j = 0; j < a[i].v.length; j += 3) {
    const dx = b[i].v[j] - a[i].v[j], dy = b[i].v[j + 1] - a[i].v[j + 1], dz = b[i].v[j + 2] - a[i].v[j + 2];
    if (Math.abs(dx) > TOL || Math.abs(dy) > TOL || Math.abs(dz) > TOL) same = false;
    if (!d0) d0 = [dx, dy, dz]; else if (Math.abs(dx - d0[0]) > TOL * 2 || Math.abs(dy - d0[1]) > TOL * 2 || Math.abs(dz - d0[2]) > TOL * 2) rigid = false;
  }
  if (same) return { kind: 'same' };
  return rigid ? { kind: 'move', d: [-d0[2], d0[1], d0[0]] } : { kind: 'shape' };
}

/** The largest coordinate difference between two aligned units (Infinity if they are not aligned). */
export function maxDev(a, b) {
  if (!a && !b) return 0; if (!a || !b || !aligned(a, b)) return Infinity;
  let m = 0;
  for (let i = 0; i < a.length; i++) for (let j = 0; j < a[i].v.length; j++) { const d = Math.abs(a[i].v[j] - b[i].v[j]); if (d > m) m = d; }
  return m;
}

/**
 * Whether two sets of meshes hold the same triangles to within `tol` (any order of triangles, any rotation of a triangle's corners, the same material):
 * each assembled triangle is matched to a not yet matched recipe triangle near it. Returns the largest vertex deviation of the matches, or Infinity.
 */
export function matchTriangles(a, p, tol) {
  const CELL = 0.004, ikey = (a, b, c) => ((a + 512) * 1024 + (b + 512)) * 1024 + (c + 512), key = (x, y, z) => ikey(Math.floor(x / CELL), Math.floor(y / CELL), Math.floor(z / CELL));
  const flat = (ms) => { const out = []; for (const m of ms) for (let i = 0; i < m.v.length; i += 9) out.push({ m: m.mat, v: m.v, i }); return out; };
  const ta = flat(a), tp = flat(p); if (ta.length !== tp.length) return Infinity;
  const cells = new Map();
  tp.forEach((t, n) => { const v = t.v, i = t.i, k = key((v[i] + v[i + 3] + v[i + 6]) / 3, (v[i + 1] + v[i + 4] + v[i + 7]) / 3, (v[i + 2] + v[i + 5] + v[i + 8]) / 3); const l = cells.get(k); if (l) l.push(n); else cells.set(k, [n]); });
  const used = new Uint8Array(tp.length); let dev = 0;
  for (const t of ta) {
    const v = t.v, i = t.i, cx = (v[i] + v[i + 3] + v[i + 6]) / 3, cy = (v[i + 1] + v[i + 4] + v[i + 7]) / 3, cz = (v[i + 2] + v[i + 5] + v[i + 8]) / 3;
    let best = -1, bd = Infinity;
    const ax = Math.floor(cx / CELL), ay = Math.floor(cy / CELL), az = Math.floor(cz / CELL); // (whole cells: a centroid on a cell boundary must find a neighbour that rounded the other way)
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) for (let dz = -1; dz <= 1; dz++) {
      const l = cells.get(ikey(ax + dx, ay + dy, az + dz)); if (!l) continue;
      for (const n of l) {
        if (used[n] || tp[n].m !== t.m) continue;
        const w = tp[n].v, j = tp[n].i;
        for (let r = 0; r < 3; r++) {
          let d = 0;
          for (let c = 0; c < 3 && d <= tol; c++) { const q = ((c + r) % 3) * 3; d = Math.max(d, Math.abs(v[i + c * 3] - w[j + q]), Math.abs(v[i + c * 3 + 1] - w[j + q + 1]), Math.abs(v[i + c * 3 + 2] - w[j + q + 2])); }
          if (d < bd) { bd = d; best = n; }
        }
      }
    }
    if (best < 0 || bd > tol) return Infinity;
    used[best] = 1; if (bd > dev) dev = bd;
  }
  return dev;
}
