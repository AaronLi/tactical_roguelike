'use strict';
// The world in three dimensions: everything solid in a level is a 3D shape (a solid), indexed in a 3D spatial
// hash, and every question the game asks about space is answered from those shapes, at any height:
//   raycast  (rounds, sight, sound): the nearest solid along a ray, through glass if asked
//   los / see: whether a can see b (and how well, through intact glass)
//   resolve: a standing cylinder pushed out of whatever it walked into (stepping up onto anything low enough)
//   groundAt / ceilingAt: the surface under someone's feet, and over their head
// A solid is an axis-aligned box ({ min: [x, y, z], max: [x, y, z] }), or a convex shape inside its box (hull: the planes
// round it, a rock's: hullOf) that rays meet as it is, with what it is (kind: 'wall',
// 'floor', 'ceil', 'door', 'leaf', 'glass', 'prop', 'step', ...) and how it behaves: move (it stops people),
// ray (it stops rays), plus anything its owner needs (door, glass id, prop). Doors and windows are dynamic:
// their solids change as they open, close and break.
// Levels are still planned on grids by the generators (js/level.ts); fromTileMap turns a planned level into
// solids. Nothing here knows about tiles.
const G_World = (() => {
  const CELL = 2; // the hash's cells, metres on a side (x, y and z)
  const key = (ix: number, iy: number, iz: number) => ((ix + 2048) * 4096 + (iy + 2048)) * 4096 + (iz + 2048);

  // a world: its solids (null where one was removed), the hash of their ids by cell, and whatever the level adds (ramps, terrain, bounds)
  interface Solid { min: number[]; max: number[]; kind?: string; ray?: boolean; [k: string]: any } // (a collision solid: an aabb plus whatever the layout hangs on it)
  interface WorldT { solids: (Solid | null)[]; cells: Map<number, number[]>; stamp: number; mark: Int32Array; free: number[]; [k: string]: any }
  function create(): WorldT {
    return { solids: [], cells: new Map(), stamp: 1, mark: new Int32Array(1024), free: [] };
  }
  const cellRange = (s: Solid) => [Math.floor(s.min[0] / CELL), Math.floor(s.min[1] / CELL), Math.floor(s.min[2] / CELL),
    Math.floor((s.max[0] - 1e-6) / CELL), Math.floor((s.max[1] - 1e-6) / CELL), Math.floor((s.max[2] - 1e-6) / CELL)];
  function insert(w: WorldT, s: Solid) {
    const [x0, y0, z0, x1, y1, z1] = cellRange(s);
    for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) for (let z = z0; z <= z1; z++) {
      const k = key(x, y, z);
      let c = w.cells.get(k);
      if (!c) w.cells.set(k, (c = []));
      c.push(s.id);
    }
  }
  function unlink(w: WorldT, s: Solid) {
    const [x0, y0, z0, x1, y1, z1] = cellRange(s);
    for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) for (let z = z0; z <= z1; z++) {
      const c = w.cells.get(key(x, y, z));
      if (!c) continue;
      const i = c.indexOf(s.id);
      if (i >= 0) c.splice(i, 1);
    }
  }
  // a solid into the world (its defaults: it stops people and rays); returns it, with its id
  function add(w: WorldT, s: Solid) {
    if (s.move == null) s.move = true;
    if (s.ray == null) s.ray = true;
    s.id = w.free.length ? w.free.pop() : w.solids.length;
    w.solids[s.id] = s;
    if (w.mark.length <= s.id) { const m = new Int32Array(w.mark.length * 2); m.set(w.mark); w.mark = m; }
    insert(w, s);
    return s;
  }
  function remove(w: WorldT, s: Solid) {
    if (!s || w.solids[s.id] !== s) return;
    unlink(w, s);
    w.solids[s.id] = null;
    w.free.push(s.id);
  }
  // a solid's new shape (a door swinging, say)
  function reshape(w: WorldT, s: Solid, min: number[], max: number[]) { unlink(w, s); s.min = min; s.max = max; insert(w, s); }
  const box = (x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, o?: any) => Object.assign({ min: [x0, y0, z0], max: [x1, y1, z1] }, o || {});

  // A convex solid (a rock): its faces' planes, [nx, ny, nz, d] (inside where n.p <= d), from its triangles (flat
  // [x, y, z] corners, nine to a face, as a mesh draws them) and any planes more (cut: a floor it's cut off at). Its box is round
  // its corners, inside the cuts. Rays, sight and a round's way through it are the shape's own (hullHit); what stops people is
  // boxes (its owner's: fitBoxes fits them to it).
  function hullOf(tris: ArrayLike<number>, cut: number[][] = [], o?: any): Solid {
    const P: number[][] = [], n = tris.length / 3;
    let cx = 0, cy = 0, cz = 0;
    for (let i = 0; i < tris.length; i += 3) { cx += tris[i]; cy += tris[i + 1]; cz += tris[i + 2]; }
    cx /= n; cy /= n; cz /= n;
    for (let i = 0; i + 8 < tris.length; i += 9) {
      const ax = tris[i], ay = tris[i + 1], az = tris[i + 2], ux = tris[i + 3] - ax, uy = tris[i + 4] - ay, uz = tris[i + 5] - az, vx = tris[i + 6] - ax, vy = tris[i + 7] - ay, vz = tris[i + 8] - az;
      let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
      const l = Math.hypot(nx, ny, nz);
      if (l < 1e-12) continue;
      nx /= l; ny /= l; nz /= l;
      if (nx * (ax - cx) + ny * (ay - cy) + nz * (az - cz) < 0) { nx = -nx; ny = -ny; nz = -nz; } // (outward)
      P.push([nx, ny, nz, nx * ax + ny * ay + nz * az]);
    }
    P.push(...cut);
    const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
    for (let i = 0; i < tris.length; i += 3) for (let a = 0; a < 3; a++) { min[a] = Math.min(min[a], tris[i + a]); max[a] = Math.max(max[a], tris[i + a]); }
    for (const q of cut) for (let a = 0; a < 3; a++) if (Math.abs(Math.abs(q[a]) - 1) < 1e-9) { if (q[a] > 0) max[a] = Math.min(max[a], q[3]); else min[a] = Math.max(min[a], -q[3]); } // (cut along an axis: its box too)
    return Object.assign({ min, max, hull: P }, o || {});
  }
  // a ray against a convex solid's planes: where it goes in (and that face's normal) and comes out (and that one's), or null
  function hullHit(o: number[], d: number[], P: number[][]) {
    let t0 = -Infinity, t1 = Infinity, n0: number[] | null = null, n1: number[] | null = null;
    for (const q of P) {
      const dn = q[0] * d[0] + q[1] * d[1] + q[2] * d[2], dist = q[3] - (q[0] * o[0] + q[1] * o[1] + q[2] * o[2]);
      if (Math.abs(dn) < 1e-12) { if (dist < 0) return null; continue; }
      const t = dist / dn;
      if (dn < 0) { if (t > t0) { t0 = t; n0 = q; } } else if (t < t1) { t1 = t; n1 = q; }
      if (t0 > t1) return null;
    }
    if (t1 < 0 || !Number.isFinite(t1)) return null;
    return { t: Math.max(0, t0), n: n0 ? [n0[0], n0[1], n0[2]] : [0, 1, 0], out: t1, nOut: n1 ? [n1[0], n1[1], n1[2]] : [0, 1, 0] }; // (starting inside it: as slab has it)
  }
  // Boxes filling a convex solid h (hullOf's), for people to bump into: [x0, y0, z0, x1, y1, z1] each, from the floor (y0) up.
  // In slabs, the first up to about a step over the floor and the rest about 20 cm each; in each, a column of cells (cell
  // metres on a side) counts if the shape is anywhere between the slab's bottom and top straight up through the cell's middle
  // (so the boxes are within half a cell of the shape's side, at its widest in the slab). Runs of cells along x are merged, and
  // the same run in the row after, and the same box in the slab over it. (A rock's: js/furniture.ts boulder, js/hangar.ts.)
  function fitBoxes(h: Solid, y0 = h.min[1], cell = 0.1) {
    const P = h.hull!, top = h.max[1], nx = Math.max(1, Math.ceil((h.max[0] - h.min[0]) / cell)), nz = Math.max(1, Math.ceil((h.max[2] - h.min[2]) / cell));
    const x0 = (h.min[0] + h.max[0] - nx * cell) / 2, z0 = (h.min[2] + h.max[2] - nz * cell) / 2;
    const base = Math.min(top, y0 + 0.36), up = top - base > 0.08 ? Math.max(1, Math.round((top - base) / 0.2)) : 0, edges = [y0, up ? base : top];
    for (let i = 1; i <= up; i++) edges.push(base + (top - base) * i / up);
    // where the shape is up a column: from where it goes in to where it comes out
    const span = new Float64Array(nx * nz * 2);
    for (let iz = 0; iz < nz; iz++) for (let ix = 0; ix < nx; ix++) {
      const x = x0 + (ix + 0.5) * cell, z = z0 + (iz + 0.5) * cell;
      let lo = -Infinity, hi = Infinity;
      for (const q of P) {
        const k = q[3] - q[0] * x - q[2] * z;
        if (Math.abs(q[1]) < 1e-9) { if (k < 0) hi = -Infinity; } else if (q[1] > 0) hi = Math.min(hi, k / q[1]); else lo = Math.max(lo, k / q[1]);
      }
      span[(iz * nx + ix) * 2] = lo; span[(iz * nx + ix) * 2 + 1] = hi;
    }
    const there = (ix: number, iz: number, a: number, b: number) => { const i = (iz * nx + ix) * 2; return span[i] < span[i + 1] && span[i] < b && span[i + 1] > a; };
    const out: number[][] = [], open = new Map<string, number[]>(); // (open: the boxes still growing upward, by their footprint)
    for (let iy = 0; iy + 1 < edges.length; iy++) {
      const here = new Set<string>(), rects: number[][] = [];
      let rows: number[][] = [];
      for (let iz = 0; iz < nz; iz++) { // a row of runs along x, merged with the same run in the row before it
        const next: number[][] = [];
        for (let ix = 0, run = -1; ix <= nx; ix++) {
          const on = ix < nx && there(ix, iz, edges[iy], edges[iy + 1]);
          if (on && run < 0) run = ix;
          if (!on && run >= 0) { const prev = rows.find((q) => q[0] === run && q[1] === ix && q[3] === iz); if (prev) { prev[3] = iz + 1; next.push(prev); } else { const q = [run, ix, iz, iz + 1]; rects.push(q); next.push(q); } run = -1; }
        }
        rows = next;
      }
      for (const q of rects) {
        const key = q.join(','), grown = open.get(key);
        here.add(key);
        if (grown) grown[4] = edges[iy + 1]; else { const bx = [x0 + q[0] * cell, edges[iy], z0 + q[2] * cell, x0 + q[1] * cell, edges[iy + 1], z0 + q[3] * cell]; out.push(bx); open.set(key, bx); }
      }
      for (const key of [...open.keys()]) if (!here.has(key)) open.delete(key);
    }
    return out;
  }
  // whether solid s takes up any of the box [min, max] (a convex one: unless the box is all outside one of its faces)
  function touches(s: Solid, min: number[], max: number[]) {
    if (!(s.max[0] > min[0] && s.min[0] < max[0] && s.max[1] > min[1] && s.min[1] < max[1] && s.max[2] > min[2] && s.min[2] < max[2])) return false;
    if (!s.hull) return true;
    for (const q of s.hull) if ((q[0] > 0 ? min[0] : max[0]) * q[0] + (q[1] > 0 ? min[1] : max[1]) * q[1] + (q[2] > 0 ? min[2] : max[2]) * q[2] > q[3]) return false;
    return true;
  }

  // ray vs box: the entry distance and the face's normal, or null
  function slab(o: number[], d: number[], s: Solid) {
    let tmin = -Infinity, tmax = Infinity, ax = -1, sg = 0;
    for (let a = 0; a < 3; a++) {
      const lo = s.min[a], hi = s.max[a];
      if (Math.abs(d[a]) < 1e-9) { if (o[a] < lo || o[a] > hi) return null; continue; }
      let t1 = (lo - o[a]) / d[a], t2 = (hi - o[a]) / d[a], g = -1;
      if (t1 > t2) { const q = t1; t1 = t2; t2 = q; g = 1; }
      if (t1 > tmin) { tmin = t1; ax = a; sg = g; }
      if (t2 < tmax) tmax = t2;
      if (tmin > tmax) return null;
    }
    if (tmax < 0) return null;
    const n = [0, 0, 0];
    if (ax >= 0) n[ax] = sg; else n[1] = 1; // (starting inside it)
    return { t: Math.max(0, tmin), n, out: tmax };
  }

  // A round's way through a grating (h: its way through the whole box): down between the bars it meets nothing. The first
  // bar it comes to moves h.t and h.n there, and h.bar is its way out of that: { t, n, mm (of steel) }. Struck on its edge a
  // bar's still only a thin strip: it's bent aside, or the round breaks round it, and it never takes more than going through it would.
  // (BAR_DEEP: as deep as the flat picture of them shows: a gap you can see is one you can shoot through.)
  const BAR_STEP = 0.003, BAR_MM = 4, BAR_DEEP = 0.012;
  function barHit(o: number[], d: number[], h: any, s: Solid) {
    const L = G.Level, at = (t: number) => L.onBar(o[0] + d[0] * t, o[2] + d[2] * t), face = (b: number, g: number) => { const n = [0, 0, 0], a = b === 1 ? 0 : 2; n[a] = g * Math.sign(d[a] || 1); return n; };
    const top = s.max[1], t1 = (top - o[1]) / d[1], t2 = (top - BAR_DEEP - o[1]) / d[1], flat = Math.abs(d[1]) < 1e-9;
    if (flat && (o[1] > top || o[1] < top - BAR_DEEP)) return false;
    const lo = flat ? h.t : Math.max(h.t, Math.min(t1, t2)), hi = flat ? h.out : Math.min(h.out, Math.max(t1, t2));
    if (lo >= hi) return false;
    let t = lo, b = at(t), was = 0, n0 = lo > h.t ? [0, -Math.sign(d[1]), 0] : h.n;
    if (!b) {
      do { t += BAR_STEP; b = t < hi ? at(t) : 0; } while (!b && t < hi);
      if (!b) return false;
      n0 = face(b, -1);
    }
    const t0 = t;
    for (was = b; t < hi; t += BAR_STEP) { b = at(t); if (!b) break; was = b; }
    const end = Math.min(t, hi), n = end < hi ? face(was, 1) : [0, Math.sign(d[1] || 1), 0];
    h.t = t0; h.n = n0;
    h.bar = { t: end, n, mm: Math.min(BAR_MM, Math.max(1, (end - t0) * 1000)) };
    return true;
  }

  // The nearest solid from o along the unit direction d, within maxT: { t, n, solid, view, pane }, or { t: maxT }
  // when nothing's there. opts.glass: through glass (the panes crossed, nearest first, in .glass);
  // opts.skip(solid): solids to ignore; opts.move: what stops people instead of what stops rays; opts.sight: a
  // look, not a round: it goes through clear solids (a glass door), with .clear set when it did. opts.bars: a round: it
  // meets a grating's bars (.bar: see barHit), where anything else goes through it.
  function raycast(w: WorldT, ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, maxT: number, opts?: LvRayOpts) {
    const o = [ox, oy, oz], d = [dx, dy, dz], pass = !!(opts && opts.glass), skip = opts && opts.skip, mv = !!(opts && opts.move), sight = !!(opts && opts.sight), bars = !!(opts && opts.bars);
    let seenThru = false;
    const crossed: any[] | null = pass ? [] : null, stamp = ++w.stamp, mark = w.mark;
    let best: any = null;
    // 3D DDA through the hash's cells
    let cx = Math.floor(ox / CELL), cy = Math.floor(oy / CELL), cz = Math.floor(oz / CELL);
    const step = d.map((v: number) => (v > 0 ? 1 : -1)), tDelta = d.map((v: number) => (Math.abs(v) > 1e-12 ? CELL / Math.abs(v) : Infinity));
    const tMax = [0, 1, 2].map((a) => (Math.abs(d[a]) > 1e-12 ? ((d[a] > 0 ? (Math.floor(o[a] / CELL) + 1) * CELL - o[a] : o[a] - Math.floor(o[a] / CELL) * CELL) / Math.abs(d[a])) : Infinity));
    let tEnter = 0;
    for (let guard = 0; guard < 4096 && tEnter <= maxT; guard++) {
      const c = w.cells.get(key(cx, cy, cz));
      if (c) for (let k = 0; k < c.length; k++) {
        const id = c[k];
        if (mark[id] === stamp) continue;
        mark[id] = stamp;
        const s = w.solids[id];
        if (!s || !(mv ? s.move : s.ray || (bars && s.bars)) || (skip && skip(s))) continue;
        const h = s.hull ? (slab(o, d, s) && hullHit(o, d, s.hull)) : slab(o, d, s);
        if (!h || h.t > maxT) continue;
        if (s.bars && !mv && (!barHit(o, d, h, s) || h.t > maxT)) continue;
        // (shot through: down a hole in it there's nothing to meet, and a blind hole's met at its floor: js/damage.ts)
        if (!mv && s.holes && s.holes.length) { const c = G.Damage.clear(s, o, d, h.t, h.out); if (c >= h.out - 1e-3) continue; h.t = c; if (c > maxT) continue; }
        if (!mv && s.door && s.door.holes && s.door.holes.length) { const q = (h.t + h.out) / 2; if (G.Damage.doorHole(s.door, [o[0] + d[0] * q, o[1] + d[1] * q, o[2] + d[2] * q])) continue; }
        if (s.glass != null && pass && !(s.win && s.win.armor && !sight)) { if (!crossed!.some((q) => q[0] === s.glass)) crossed!.push([s.glass, h.t]); continue; } // (bulletproof glass: a round stops on it)
        if (s.clear && sight) { seenThru = true; continue; } // (a look through a glass door)
        if (!best || h.t < best.t) { best = h; best.solid = s; best.view = !!s.view; best.pane = s.glass != null ? s.glass : undefined; }
      }
      const tExit = Math.min(tMax[0], tMax[1], tMax[2]);
      if (best && best.t <= tExit) break; // nothing in a later cell can be nearer
      const a = tMax[0] === tExit ? 0 : tMax[1] === tExit ? 1 : 2;
      tEnter = tExit; tMax[a] += tDelta[a];
      if (a === 0) cx += step[0]; else if (a === 1) cy += step[1]; else cz += step[2];
    }
    const out: any = best || { t: maxT, n: null };
    if (seenThru) out.clear = true;
    if (pass) out.glass = crossed!.filter((q) => q[1] < out.t).sort((a, b) => a[1] - b[1]);
    return out;
  }
  function los(w: WorldT, ax: number, ay: number, az: number, bx: number, by: number, bz: number) {
    const dx = bx - ax, dy = by - ay, dz = bz - az, d = Math.hypot(dx, dy, dz);
    if (d < 0.01) return true;
    return raycast(w, ax, ay, az, dx / d, dy / d, dz / d, d).t >= d - 0.05;
  }
  // how well a sees b: 0 (blocked), 1 (clear), or GLASS_SEE through glass that's still whole
  const GLASS_SEE = 0.4;
  function see(w: WorldT, ax: number, ay: number, az: number, bx: number, by: number, bz: number) {
    const dx = bx - ax, dy = by - ay, dz = bz - az, d = Math.hypot(dx, dy, dz);
    if (d < 0.01) return 1;
    const h = raycast(w, ax, ay, az, dx / d, dy / d, dz / d, d, { glass: true, sight: true });
    if (h.t < d - 0.05) return 0;
    return (h.glass && h.glass.length) || h.clear ? GLASS_SEE : 1;
  }

  // Where a round going from o along unit d comes out of solid s: { t, n (the far face's normal) }. Walls that butt up to
  // each other are the one wall (the planner merges tiles into boxes, wherever it happens to), floors and ceilings too.
  const family = (s: Solid) => (s.kind === 'wall' || s.kind === 'lintel' ? 'w' : s.kind === 'floor' || s.kind === 'ceil' || s.kind === 'step' ? 'f' : null);
  function span(w: WorldT, s: Solid, o: { x: number, y: number, z: number }, d: { x: number, y: number, z: number }) {
    const O = [o.x, o.y, o.z], D = [d.x, d.y, d.z], fam = family(s), seen = new Set<Solid>([s]);
    if (s.hull) { const h = hullHit(O, D, s.hull); if (h) return { t: h.out, n: h.nOut }; } // (a convex solid: out through its far face)
    const exit = (q: Solid) => { let t = Infinity, ax = 0; for (let a = 0; a < 3; a++) { if (Math.abs(D[a]) < 1e-9) continue; const tt = ((D[a] > 0 ? q.max[a] : q.min[a]) - O[a]) / D[a]; if (tt < t) { t = tt; ax = a; } } return { t, ax }; };
    let e = exit(s);
    for (let i = 0; fam && i < 16; i++) {
      const x = O[0] + D[0] * (e.t + 0.003), y = O[1] + D[1] * (e.t + 0.003), z = O[2] + D[2] * (e.t + 0.003);
      let next: Solid | null = null;
      query(w, [x - 0.001, y - 0.001, z - 0.001], [x + 0.001, y + 0.001, z + 0.001], (q: Solid) => { if (!next && q.ray && !seen.has(q) && family(q) === fam) next = q; });
      if (!next) break;
      seen.add(next); e = exit(next);
    }
    const n = [0, 0, 0]; n[e.ax] = D[e.ax] > 0 ? 1 : -1;
    return { t: e.t, n };
  }

  // every solid whose box overlaps [min, max] (each once)
  function query(w: WorldT, min: number[], max: number[], fn: (s: Solid) => void) {
    const stamp = ++w.stamp, mark = w.mark;
    const x0 = Math.floor(min[0] / CELL), y0 = Math.floor(min[1] / CELL), z0 = Math.floor(min[2] / CELL);
    const x1 = Math.floor(max[0] / CELL), y1 = Math.floor(max[1] / CELL), z1 = Math.floor(max[2] / CELL);
    for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) for (let z = z0; z <= z1; z++) {
      const c = w.cells.get(key(x, y, z));
      if (!c) continue;
      for (let k = 0; k < c.length; k++) {
        const id = c[k];
        if (mark[id] === stamp) continue;
        mark[id] = stamp;
        const s = w.solids[id];
        if (s && s.max[0] > min[0] && s.min[0] < max[0] && s.max[1] > min[1] && s.min[1] < max[1] && s.max[2] > min[2] && s.min[2] < max[2]) fn(s);
      }
    }
  }

  // A flight of stairs, for walking on: a smooth slope through its steps (half a step above each tread's front
  // edge, so feet never sink more than half a step into it, eased in from the floor at its foot), so whoever climbs it rises steadily instead of
  // hopping from tread to tread. Everything else (rounds, bodies, grenades, things dropped) meets the steps
  // themselves. Returns the slope's height at (x, z), how far up the flight that is (u, 0 at its foot), and
  // whether (x, z) is across its width.
  function rampAt(st: any, x: number, z: number) {
    const along = st.axis === 'z', a = along ? z : x, lat = along ? x : z, lo = along ? st.z0 : st.x0, hi = along ? st.z1 : st.x1;
    const u = st.up < 0 ? hi - a : a - lo, len = hi - lo, n = st.steps ? st.steps.length : Math.round(st.rise / 0.2), rn = st.rise / n, run = len / n;
    return { u, len, across: lat > (along ? st.x0 : st.z0) && lat < (along ? st.x1 : st.z1), h: st.y0 + G.U.clamp((u / run + 0.5 * G.U.clamp(u / run, 0, 1)) * rn, 0, st.rise) }; // (the half step eased in over the first tread: no bump onto it)
  }
  // the flights someone at p can walk onto (or is on): across one's width, at its foot, on it or at its head,
  // and level with the slope there (not standing under its high end)
  function rampsFor(w: WorldT, p: { x: number, y: number, z: number }, r: number, step: number) {
    let out: Set<Solid> | null = null;
    for (const st of w.ramps || []) {
      const q = rampAt(st, p.x, p.z);
      if (!q.across || q.u < -r - 0.15 || q.u > q.len + r + 0.15) continue;
      if (q.u > 0 && p.y < q.h - step - 0.15) continue; // (under the flight's high end)
      if (q.u <= 0 && p.y > st.y0 + 0.5) continue;
      (out = out || new Set()).add(st);
    }
    return out;
  }

  // Someone standing at p (their feet), r round and h tall, pushed out of everything solid they overlap. What
  // they could step up onto (its top within `step` of their feet) doesn't stop them: groundAt lifts them onto it.
  // smooth: they walk stairs as slopes (rampAt): the steps of a flight they're on or walking onto don't stop them.
  // nostep: a solid that's never stepped up onto, however low its top (a rock's boxes: you'd climb it like stairs), only stood
  // on once you're up on it (its top within NOSTEP of your feet)
  const STEP = 0.32, HEIGHT = 1.8, NOSTEP = 0.02;
  function resolve(w: WorldT, p: { x: number, y: number, z: number }, r: number, h = HEIGHT, step = STEP, smooth = false) {
    const pass = smooth ? rampsFor(w, p, r, step) : null;
    for (let iter = 0; iter < 2; iter++) {
      query(w, [p.x - r, p.y + Math.min(step, NOSTEP), p.z - r], [p.x + r, p.y + h, p.z + r], (s: Solid) => {
        if (!s.move || (pass && s.stair && pass.has(s.stair))) return;
        if (s.max[1] <= p.y + (s.nostep ? NOSTEP : step)) return; // (low enough to step up onto; a rock's never is: only what you're stood on)
        const qx = G.U.clamp(p.x, s.min[0], s.max[0]), qz = G.U.clamp(p.z, s.min[2], s.max[2]);
        const ddx = p.x - qx, ddz = p.z - qz, d = Math.hypot(ddx, ddz);
        if (d >= r) return;
        if (d > 1e-5) { p.x += (ddx / d) * (r - d); p.z += (ddz / d) * (r - d); return; }
        // the centre inside it: out along the shallowest axis
        const px = Math.min(p.x - s.min[0], s.max[0] - p.x), pz = Math.min(p.z - s.min[2], s.max[2] - p.z);
        const cx = (s.min[0] + s.max[0]) / 2, cz = (s.min[2] + s.max[2]) / 2;
        if (px < pz) p.x += Math.sign(p.x - cx || 1) * (px + r); else p.z += Math.sign(p.z - cz || 1) * (pz + r);
      });
    }
  }
  // the highest surface under someone at (x, z) with their feet at y: the top of anything under them no higher
  // than a step up (-Infinity: nothing, they're falling into the void)
  // smooth: a walker's ground (stairs as their slope, not their treads: rampAt)
  // Rolling ground (a level's terrain: G.Level.crestGround): its height at (x, z), across a cell the two triangles between
  // its corners (corner 00 to 10 to 01, and 10 to 11 to 01), as it's drawn. 0 off it. (The ground floor of a level with it
  // is all of it: sloped, or level and built on, high or low.)
  function terrainAt(tr: any, x: number, z: number) {
    const fx = x / tr.TS, fz = z / tr.TS, cx = Math.floor(fx), cz = Math.floor(fz);
    if (cx < 0 || cz < 0 || cx >= tr.VW - 1 || cz >= tr.VH - 1) return 0;
    const u = fx - cx, q = fz - cz, k = cz * tr.VW + cx, v = tr.v, a = v[k], b = v[k + 1], c = v[k + tr.VW], d = v[k + tr.VW + 1];
    return u + q <= 1 ? a + (b - a) * u + (c - a) * q : d + (c - d) * (1 - u) + (b - d) * (1 - q);
  }
  // the ground there to stand or lie on: as terrainAt, but none over a hole in it (tr.hole: a cell of open air, a gorge)
  function terrainUnder(tr: any, x: number, z: number) {
    const cx = Math.floor(x / tr.TS), cz = Math.floor(z / tr.TS);
    if (tr.hole && cx >= 0 && cz >= 0 && cx < tr.VW - 1 && cz < tr.VH - 1 && tr.hole[cz * (tr.VW - 1) + cx]) return -Infinity;
    return terrainAt(tr, x, z);
  }
  function groundAt(w: WorldT, x: number, z: number, r: number, y: number, step = STEP, smooth = false) {
    let g = -Infinity;
    const k = r * 0.6;
    query(w, [x - k, y - 50, z - k], [x + k, y + step, z + k], (s) => { if (s.move && !(smooth && s.stair) && s.max[1] <= y + (s.nostep ? NOSTEP : step) + 1e-6 && s.max[1] > g) g = s.max[1]; });
    if (w.terrain) { const th = terrainUnder(w.terrain, x, z); if (th > g) g = th; } // (walked on as it lies: its blocks are for rays. There's nothing under it: anyone who's got under it is back up on it, not falling through it to the gorge's floor)
    if (smooth) for (const st of w.ramps || []) {
      const q = rampAt(st, x, z);
      if (q.across && q.u > 0 && q.u < q.len && q.h <= y + step + 1e-6 && q.h > g) g = q.h;
    }
    return g;
  }
  // the lowest surface over someone at (x, z) whose head is at y (Infinity: open sky)
  function ceilingAt(w: WorldT, x: number, z: number, r: number, y: number) {
    let c = Infinity;
    query(w, [x - r, y - 0.2, z - r], [x + r, y + 50, z + r], (s) => { if (s.move && s.min[1] >= y - 0.2 && s.min[1] < c) c = s.min[1]; });
    return c;
  }

  // ------------------------------------------------------------------ a planned level into solids
  // A level from the tile planner (js/level.ts generate) as solids, the same shapes its tiles describe: the
  // floor, the ceilings (none open to the sky), walls (runs of wall tiles merged into long boxes), furniture
  // (each piece's boxes, shelving's open frames for rays), fences, doors (a closed leaf, or the lintel over an
  // open one and its leaf standing out into the room) and windows (sill, head and the pane, and an outside
  // window's view). map.world holds it; the door and window solids hang off their records for updates.
  // A storey of a building (G.Level.stack): opts.world, the world it goes into; opts.y, its floor's height;
  // opts.skirt, how far its walls reach down past its floor (over the slab under it); opts.voidAbove, where the
  // floor above has a drop (no ceiling there); opts.ground: false for an upper floor (its floor only where it
  // has one: not over a drop).
  function fromTileMap(map: any, opts?: any) {
    const o = opts || {}, L = G.Level, TS = L.TS, { W, H, t } = map, WH = L.WALL_H, w = o.world || create();
    const Y = o.y || 0, SK = o.skirt || 0, va = o.voidAbove;
    w.bounds = { min: [0, 0, 0], max: [W * TS, Y + WH, H * TS] };
    // runs of tiles merged into rectangles (greedy: along x, then down z while the whole run continues); by: only tiles
    // with the same value in it in one rectangle (its fifth number)
    const rects = (want: (i: number) => boolean, by?: Int16Array | null) => {
      const used = new Uint8Array(W * H), out: number[][] = [];
      for (let z = 0; z < H; z++) for (let x = 0; x < W; x++) {
        const i = z * W + x, n = by ? by[i] : 0, ok1 = (j: number) => !used[j] && want(j) && (!by || by[j] === n);
        if (used[i] || !want(i)) continue;
        let x1 = x;
        while (x1 + 1 < W && ok1(z * W + x1 + 1)) x1++;
        let z1 = z;
        for (;;) {
          if (z1 + 1 >= H) break;
          let ok = true;
          for (let xx = x; xx <= x1 && ok; xx++) if (!ok1((z1 + 1) * W + xx)) ok = false;
          if (!ok) break;
          z1++;
        }
        for (let zz = z; zz <= z1; zz++) for (let xx = x; xx <= x1; xx++) used[zz * W + xx] = 1;
        out.push([x, z, x1, z1, n]);
      }
      return out;
    };
    // rolling ground (map.terrain), on the ground floor: a cell's corners' heights, and the height it's built on (gb: the
    // lowest of them, in 5 cm steps, which is where its wall stands, and its ceiling over it). What's built is level ground
    // (G.Level.crestGround), so that's its height all over.
    const tr = o.ground !== false ? map.terrain : null, VW = tr ? tr.VW : 0;
    const corners = (i: number) => { const k = ((i / W) | 0) * VW + (i % W); return [tr.v[k], tr.v[k + 1], tr.v[k + VW], tr.v[k + VW + 1]]; };
    const gb = tr ? Int16Array.from({ length: W * H }, (_, i) => Math.round(Math.min(...corners(i)) / 0.05)) : null;
    // the floor (on the ground: everywhere, under the gardens too, and beyond the edge; upstairs, all but the drops)
    // (a mountain top's gorge, map.chasm metres deep: nothing under its open air but the gorge's floor, far down)
    if (o.ground !== false && map.chasm) {
      for (const [x0, z0, x1, z1] of rects((i: number) => t[i] !== 5 && (!tr || corners(i).every((h) => Math.abs(h) < 1e-3)))) add(w, box(x0 * TS, Y - 0.5, z0 * TS, (x1 + 1) * TS, Y, (z1 + 1) * TS, { kind: 'floor' }));
      add(w, box(-TS * 4, Y - map.chasm - 0.5, -TS * 4, (W + 4) * TS, Y - map.chasm, (H + 4) * TS, { kind: 'floor' }));
    } else if (o.ground !== false) add(w, box(-TS * 4, Y - 0.5, -TS * 4, (W + 4) * TS, Y, (H + 4) * TS, { kind: 'floor' }));
    else {
      const gr = map.grate;
      for (const [x0, z0, x1, z1] of rects((i: number) => t[i] !== 5 && !(gr && gr[i]))) add(w, box(x0 * TS, Y - SK, z0 * TS, (x1 + 1) * TS, Y, (z1 + 1) * TS, { kind: 'floor' }));
      // steel grating (a catwalk): it holds you up, and eyes go through it from above and below; a round goes between its bars, or meets one (barHit)
      if (gr) for (const [x0, z0, x1, z1] of rects((i: number) => gr[i] && t[i] !== 5)) add(w, box(x0 * TS, Y - 0.05, z0 * TS, (x1 + 1) * TS, Y, (z1 + 1) * TS, { kind: 'grate', ray: false, bars: true }));
    }
    // rolling ground over it (map.terrain), wherever it isn't level at 0: for rays and sight, a block under each cell up to
    // its corners' mean (5 cm steps, merged), half a metre deep (from under 0 where it's over it); feet go by the slope
    // itself (groundAt), so the blocks don't stop anyone
    if (tr) {
      const q = new Int16Array(W * H), none = -32768;
      for (let i = 0; i < W * H; i++) {
        const c = corners(i);
        q[i] = t[i] === 5 || c.every((h) => Math.abs(h) < 1e-3) ? none : Math.round((c[0] + c[1] + c[2] + c[3]) / 4 / 0.05);
      }
      for (const [x0, z0, x1, z1, n] of rects((i: number) => q[i] !== none, q)) add(w, box(x0 * TS, Y + Math.min(0, n * 0.05) - 0.5, z0 * TS, (x1 + 1) * TS, Y + n * 0.05, (z1 + 1) * TS, { kind: 'floor', terrain: true, move: false }));
      w.terrain = tr;
    }
    // ceilings over everything indoors (not under a drop in the floor above), over the ground each stands on
    for (const [x0, z0, x1, z1, n] of rects((i: number) => !map.out[i] && !(va && va[i]), gb)) add(w, box(x0 * TS, Y + n * 0.05 + WH, z0 * TS, (x1 + 1) * TS, Y + n * 0.05 + WH + 0.3, (z1 + 1) * TS, { kind: 'ceil' }));
    // walls (not where a window is: its own solids below), and the solid edge round the map
    for (const [x0, z0, x1, z1, n] of rects((i: number) => t[i] === 1 && !(map.winAt && map.winAt.has(i)), gb)) add(w, box(x0 * TS, Y + n * 0.05 - SK, z0 * TS, (x1 + 1) * TS, Y + n * 0.05 + WH, (z1 + 1) * TS, { kind: 'wall' }));
    const E = TS * 4;
    // (on a mountain top it reaches down to the gorge's floor, and rounds fly on over it: there's only air past the wall)
    for (const b of [[-E, 0, -E, 0, WH, H * TS + E], [W * TS, 0, -E, W * TS + E, WH, H * TS + E], [0, 0, -E, W * TS, WH, 0], [0, 0, H * TS, W * TS, WH, H * TS + E]]) { b[1] = Y - SK - (map.chasm || 0); b[4] += Y; add(w, box(...(b as [number, number, number, number, number, number]), { kind: 'wall', edge: true, ray: !map.chasm })); }
    // furniture and fences: each piece's boxes (a piece hangs on every tile it covers: once each)
    const fromB = (b: any, q: any, gy = b.gy || 0) => box(b.cx - b.hx, Y + gy + b.y0, b.cz - b.hz, b.cx + b.hx, Y + gy + b.h, b.cz + b.hz, q); // (gy: a piece on rolling ground)
    // a piece's convex shape (its triangles: x and z where it stands, y up from its foot) stood at y0, and cut off there (the ground)
    const hullAt = (tris: number[], y0: number, q: any) => { const v = tris.slice(); for (let i = 1; i < v.length; i += 3) v[i] += y0; return hullOf(v, [[0, -1, 0, -y0]], q); };
    // (each box once, with the piece it's part of: a cell two pieces share, or one piece's boxes overlap, holds them all
    // again, js/level.ts layProp)
    const seen = new Set<LvProp>(), seenB = new Set<LvBox>();
    for (const p of [...(map.propList || []), ...(map.props || new Map()).values()]) {
      if (seen.has(p)) continue;
      seen.add(p);
      for (const b of p.boxes) {
        if (seenB.has(b)) continue;
        seenB.add(b);
        // (open pieces: their ray boxes; a rock: its own shapes for rays, and for people boxes fitted inside them, b.walk)
        const walk = b.walk ? { ray: false, nostep: true } : null;
        if (b.ray) { add(w, fromB(b, Object.assign({ kind: 'prop', prop: p, ray: false }, walk))); for (const q of b.ray) add(w, q.hull ? hullAt(q.hull, Y + (b.gy || 0), { kind: 'prop', prop: p, move: false }) : fromB(q, Object.assign({ kind: 'prop', prop: p, move: false }, q.m ? { mat: (G.Materials.PARTS as Record<string, any>)[q.m] } : null), b.gy || 0)); }
        else add(w, fromB(b, Object.assign({ kind: 'prop', prop: p }, walk)));
      }
    }
    // furniture tiles without a piece: a crate, or a fence post
    for (let i = 0; i < W * H; i++) {
      if ((t[i] !== 2 && t[i] !== 4) || (map.props && map.props.has(i))) continue; // (5 drops and 7 flights: nothing here)
      const b = L.boxAt(map, i % W, (i / W) | 0);
      if (b) add(w, fromB(b, { kind: 'prop' }, gb ? gb[i] * 0.05 : 0));
    }
    // doors (a storey's: their floor's map holds their cells)
    for (const d of map.doors) { d.solids = []; door(w, map, d); }
    // windows
    for (const win of map.windows || []) { win.solids = []; windowSolids(w, map, win); }
    if (!o.world) map.world = w;
    return w;
  }
  // A flight of stairs (G.Level.stack's): steps as solids, each a block from the floor at its foot up to its tread,
  // climbing st.rise over its run in about 20 cm steps (low enough to walk up: STEP)
  function stairs(w: WorldT, st: LvStair) {
    const along = st.axis === 'z', len = along ? st.z1 - st.z0 : st.x1 - st.x0, n = Math.max(2, Math.round(st.rise! / 0.2)), run = len / n, rise = st.rise! / n;
    st.steps = [];
    (w.ramps = w.ramps || []).push(st); // (walkers take it as a slope: rampAt)
    for (let k = 0; k < n; k++) {
      // from the foot: climbing toward -axis (up < 0) the foot is at the far end
      const a = st.up < 0 ? (along ? st.z1 : st.x1) - (k + 1) * run : (along ? st.z0 : st.x0) + k * run, b = a + run, top = st.y0! + (k + 1) * rise;
      st.steps.push(add(w, along ? box(st.x0, st.y0!, a, st.x1, top, b, { kind: 'step', stair: st }) : box(a, st.y0!, st.z0, b, top, st.z1, { kind: 'step', stair: st })));
    }
  }
  // a door's solids as it stands: closed, a leaf across each of its cells; open, the lintel over each cell (you
  // walk under it) and the leaf standing out from its hinge (it stops rounds and sight, not people)
  function door(w: WorldT, map: any, d: any) {
    const L = G.Level, TS = L.TS;
    for (const s of d.solids || []) remove(w, s);
    d.solids = [];
    const Y = d.fy || 0;
    for (const i of d.cells || [d.i]) {
      const tx = i % map.W, tz = (i / map.W) | 0, cx = (tx + 0.5) * TS, cz = (tz + 0.5) * TS;
      if (d.open) d.solids.push(add(w, box(cx - TS / 2, Y + L.DOOR_H, cz - TS / 2, cx + TS / 2, Y + L.WALL_H, cz + TS / 2, { kind: 'lintel', door: d })));
      else {
        const thin = d.axis === 'x', hx = thin ? 0.07 : TS / 2, hz = thin ? TS / 2 : 0.07;
        if (d.kind === 'stair') { // a glass door: its pane is glass (seen and shot through, and shot out: d.pane, as a window's), the wall over it isn't
          const pane = d.pane, whole = !pane || !pane.broken;
          d.solids.push(add(w, box(cx - hx, Y, cz - hz, cx + hx, Y + L.DOOR_H, cz + hz, whole ? { kind: 'door', door: d, glass: pane ? pane.id : undefined } : { kind: 'door', door: d, ray: false }))); // (broken: the frame still stops you)
          d.solids.push(add(w, box(cx - hx, Y + L.DOOR_H, cz - hz, cx + hx, Y + L.WALL_H, cz + hz, { kind: 'lintel', door: d })));
        } else d.solids.push(add(w, box(cx - hx, Y, cz - hz, cx + hx, Y + L.WALL_H, cz + hz, { kind: 'door', door: d })));
      }
    }
    if (d.rest) d.solids.push(add(w, box(...(d.rest as [number, number, number, number, number, number]), { kind: 'prop', move: false, mat: G.Materials.of(map, { kind: 'door', door: d }) }))); // (shot off its hinges, lying where it fell: js/damage.ts)
    if (d.open && d.leaf && !d.fallen && !(d.pane && d.pane.broken)) { // (a glass leaf standing open: glass too; shot out, nothing much to stop anything)
      const b = d.leaf;
      d.solids.push(add(w, box(b.cx - b.hx, Y + b.y0, b.cz - b.hz, b.cx + b.hx, Y + b.h, b.cz + b.hz, { kind: 'leaf', door: d, move: false, glass: d.pane ? d.pane.id : undefined })));
    }
  }
  // a window's solids: its wall cells' sill and head (and an outside window's view), and the pane while it's whole
  function windowSolids(w: WorldT, map: any, win: any) {
    if (win.door) return door(w, map, win.door); // (a glass door's pane: its door's solids)
    if (win.rail) { // a railing's glass: under its handrail, while it's whole (it never stopped anyone walking: the drop's edge does)
      for (const s of win.solids || []) remove(w, s);
      const r = win.rail, Y = r.y, H = G.Level.RAIL_H;
      win.solids = win.broken ? [] : [add(w, box(r.x0, Y + 0.08, r.z0, r.x1, Y + H - 0.04, r.z1, { kind: 'glass', glass: win.id, move: false, win }))];
      return;
    }
    for (const s of win.solids || []) remove(w, s);
    win.solids = [];
    const Y = win.fy || 0, fm = G.Level.floorMap(map, win.fl || 0);
    for (const i of win.cells) {
      const wa = fm.winAt.get(i);
      for (const b of win.broken ? wa.open : wa.shut) win.solids.push(add(w, box(b.cx - b.hx, Y + b.y0 - (b.y0 === 0 ? fm.skirt || 0 : 0), b.cz - b.hz, b.cx + b.hx, Y + b.h, b.cz + b.hz, { kind: b.glass != null ? 'glass' : b.view ? 'view' : 'wall', glass: b.glass != null ? win.id : undefined, view: !!b.view, win } /* (the pane is the level's window, not its floor's: a floor numbers its own from 0) */)));
    }
  }

  return { CELL, STEP, HEIGHT, GLASS_SEE, create, add, remove, reshape, box, hullOf, fitBoxes, touches, raycast, span, los, see, query, resolve, groundAt, terrainAt, terrainUnder, rampAt, ceilingAt, fromTileMap, stairs, door, windowSolids };
})();
G.World = G_World;

interface GameModules { World: typeof G_World; }
