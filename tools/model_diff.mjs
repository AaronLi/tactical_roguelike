// How one tag's geometry differs between two builds: the same, a rigid move, a 1-D stretch along the forward axis between two planes, or a different shape.
// Used by the baker's coupling detection (tools/model_packs.mjs). Positions are world-space (tools/model_sweep.mjs meshesOf), metres, in glTF axes
// (x right, y up, z = -forward); displacements are reported as [forward, up, right] = [-dz, dy, dx], the contract's order.

export const TOL = 2e-6;        // metres: float noise of the recipe's own arithmetic ("the same", "a rigid move")
export const WARP_TOL = 5e-5;   // metres (0.05 mm, half the 0.1 mm hash step): how far a stretch may be from the recipe's own geometry (it scales a taper with length, say)

/** The two units (arrays of { mat, node, v }) have the same layout: mesh count, materials, nodes, vertex counts. */
export function aligned(a, b) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i].mat !== b[i].mat || a[i].node !== b[i].node || a[i].v.length !== b[i].v.length) return false;
  return true;
}

/**
 * Classifies b against a. Returns { kind: 'same' } | { kind: 'move', d: [df, du, dr] } (every vertex moved alike) |
 * { kind: 'warp', from, to, front: [df, 0, 0] } (the forward axis stretched: behind `from` nothing moves, ahead of `to` everything moves
 * by `front`, linear between) | { kind: 'shape' }.   `loose` = the largest deviation from the fitted model that was accepted (<= WARP_TOL).
 */
export function diffUnits(a, b) {
  if (!a && !b) return { kind: 'same' };
  if (!a || !b || !aligned(a, b)) return { kind: 'shape' };
  let n = 0; for (const m of a) n += m.v.length / 3;
  if (!n) return { kind: 'same' };
  const fa = new Float64Array(n), df = new Float64Array(n), dy = new Float64Array(n), dx = new Float64Array(n);
  let k = 0, same = true;
  for (let i = 0; i < a.length; i++) for (let j = 0; j < a[i].v.length; j += 3) {
    const ddx = b[i].v[j] - a[i].v[j], ddy = b[i].v[j + 1] - a[i].v[j + 1], ddz = b[i].v[j + 2] - a[i].v[j + 2];
    fa[k] = -a[i].v[j + 2]; df[k] = -ddz; dy[k] = ddy; dx[k] = ddx;
    if (Math.abs(ddx) > TOL || Math.abs(ddy) > TOL || Math.abs(ddz) > TOL) same = false;
    k++;
  }
  if (same) return { kind: 'same' };
  for (const tol of [TOL * 2, WARP_TOL]) {
    const r = fit(fa, df, dy, dx, n, tol); if (r) return r;
  }
  return { kind: 'shape' };
}

function fit(fa, df, dy, dx, n, tol) {
  // sideways / up displacement: the same for every vertex (a rigid component), or nothing beyond tol
  let uy = dy[0], ux = dx[0], uniform = true;
  for (let i = 1; i < n; i++) if (Math.abs(dy[i] - uy) > tol || Math.abs(dx[i] - ux) > tol) { uniform = false; break; }
  if (!uniform) { // not uniform: acceptable only as noise around zero
    for (let i = 0; i < n; i++) if (Math.abs(dy[i]) > tol || Math.abs(dx[i]) > tol) return null;
    uy = 0; ux = 0;
  }
  let mn = Infinity, mx = -Infinity, rear = 0, front = 0;
  for (let i = 0; i < n; i++) { if (fa[i] < mn) { mn = fa[i]; rear = df[i]; } if (fa[i] > mx) { mx = fa[i]; front = df[i]; } }
  let rigid = true;
  for (let i = 0; i < n; i++) if (Math.abs(df[i] - rear) > tol) { rigid = false; break; }
  if (rigid) return { kind: 'move', d: [rear, uy, ux] };
  if (uy !== 0 || ux !== 0 || Math.abs(rear) > tol) return null; // a stretch holds its rear still
  let f0 = mn, f1 = mx;
  for (let i = 0; i < n; i++) if (Math.abs(df[i]) <= tol && fa[i] > f0) f0 = fa[i];
  for (let i = 0; i < n; i++) if (Math.abs(df[i] - front) <= tol && fa[i] < f1) f1 = fa[i];
  if (!(f1 > f0)) return null;
  for (let i = 0; i < n; i++) {
    const t = fa[i] <= f0 ? 0 : fa[i] >= f1 ? 1 : (fa[i] - f0) / (f1 - f0);
    if (Math.abs(df[i] - front * t) > tol * 2) return null;
  }
  return { kind: 'warp', from: f0, to: f1, front: [front, 0, 0] };
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
  const CELL = 0.004, key = (x, y, z) => ((Math.floor(x / CELL) + 512) * 1024 + (Math.floor(y / CELL) + 512)) * 1024 + (Math.floor(z / CELL) + 512);
  const flat = (ms) => { const out = []; for (const m of ms) for (let i = 0; i < m.v.length; i += 9) out.push({ m: m.mat, v: m.v, i }); return out; };
  const ta = flat(a), tp = flat(p); if (ta.length !== tp.length) return Infinity;
  const cells = new Map();
  tp.forEach((t, n) => { const v = t.v, i = t.i, k = key((v[i] + v[i + 3] + v[i + 6]) / 3, (v[i + 1] + v[i + 4] + v[i + 7]) / 3, (v[i + 2] + v[i + 5] + v[i + 8]) / 3); const l = cells.get(k); if (l) l.push(n); else cells.set(k, [n]); });
  const used = new Uint8Array(tp.length); let dev = 0;
  for (const t of ta) {
    const v = t.v, i = t.i, cx = (v[i] + v[i + 3] + v[i + 6]) / 3, cy = (v[i + 1] + v[i + 4] + v[i + 7]) / 3, cz = (v[i + 2] + v[i + 5] + v[i + 8]) / 3;
    let best = -1, bd = Infinity;
    for (let dx = -CELL; dx <= CELL; dx += CELL) for (let dy = -CELL; dy <= CELL; dy += CELL) for (let dz = -CELL; dz <= CELL; dz += CELL) {
      const l = cells.get(key(cx + dx, cy + dy, cz + dz)); if (!l) continue;
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
