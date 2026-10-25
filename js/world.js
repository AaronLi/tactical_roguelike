'use strict';
// The world in three dimensions: everything solid in a level is a 3D shape (a solid), indexed in a 3D spatial
// hash, and every question the game asks about space is answered from those shapes, at any height:
//   raycast  (rounds, sight, sound): the nearest solid along a ray, through glass if asked
//   los / see: whether a can see b (and how well, through intact glass)
//   resolve: a standing cylinder pushed out of whatever it walked into (stepping up onto anything low enough)
//   groundAt / ceilingAt: the surface under someone's feet, and over their head
// A solid is an axis-aligned box for now ({ min: [x, y, z], max: [x, y, z] }), with what it is (kind: 'wall',
// 'floor', 'ceil', 'door', 'leaf', 'glass', 'prop', 'step', ...) and how it behaves: move (it stops people),
// ray (it stops rays), plus anything its owner needs (door, glass id, prop). Doors and windows are dynamic:
// their solids change as they open, close and break.
// Levels are still planned on grids by the generators (js/level.js); fromTileMap turns a planned level into
// solids. Nothing here knows about tiles.
G.World = (() => {
  const CELL = 2; // the hash's cells, metres on a side (x, y and z)
  const key = (ix, iy, iz) => ((ix + 2048) * 4096 + (iy + 2048)) * 4096 + (iz + 2048);

  function create() {
    return { solids: [], cells: new Map(), stamp: 1, mark: new Int32Array(1024), free: [] };
  }
  const cellRange = (s) => [Math.floor(s.min[0] / CELL), Math.floor(s.min[1] / CELL), Math.floor(s.min[2] / CELL),
    Math.floor((s.max[0] - 1e-6) / CELL), Math.floor((s.max[1] - 1e-6) / CELL), Math.floor((s.max[2] - 1e-6) / CELL)];
  function insert(w, s) {
    const [x0, y0, z0, x1, y1, z1] = cellRange(s);
    for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) for (let z = z0; z <= z1; z++) {
      const k = key(x, y, z);
      let c = w.cells.get(k);
      if (!c) w.cells.set(k, (c = []));
      c.push(s.id);
    }
  }
  function unlink(w, s) {
    const [x0, y0, z0, x1, y1, z1] = cellRange(s);
    for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) for (let z = z0; z <= z1; z++) {
      const c = w.cells.get(key(x, y, z));
      if (!c) continue;
      const i = c.indexOf(s.id);
      if (i >= 0) c.splice(i, 1);
    }
  }
  // a solid into the world (its defaults: it stops people and rays); returns it, with its id
  function add(w, s) {
    if (s.move == null) s.move = true;
    if (s.ray == null) s.ray = true;
    s.id = w.free.length ? w.free.pop() : w.solids.length;
    w.solids[s.id] = s;
    if (w.mark.length <= s.id) { const m = new Int32Array(w.mark.length * 2); m.set(w.mark); w.mark = m; }
    insert(w, s);
    return s;
  }
  function remove(w, s) {
    if (!s || w.solids[s.id] !== s) return;
    unlink(w, s);
    w.solids[s.id] = null;
    w.free.push(s.id);
  }
  // a solid's new shape (a door swinging, say)
  function reshape(w, s, min, max) { unlink(w, s); s.min = min; s.max = max; insert(w, s); }
  const box = (x0, y0, z0, x1, y1, z1, o) => Object.assign({ min: [x0, y0, z0], max: [x1, y1, z1] }, o || {});

  // ray vs box: the entry distance and the face's normal, or null
  function slab(o, d, s) {
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
    return { t: Math.max(0, tmin), n };
  }

  // The nearest solid from o along the unit direction d, within maxT: { t, n, solid, view, pane }, or { t: maxT }
  // when nothing's there. opts.glass: through glass (the panes crossed, nearest first, in .glass);
  // opts.skip(solid): solids to ignore; opts.move: what stops people instead of what stops rays; opts.sight: a
  // look, not a round: it goes through clear solids (a glass door), with .clear set when it did.
  function raycast(w, ox, oy, oz, dx, dy, dz, maxT, opts) {
    const o = [ox, oy, oz], d = [dx, dy, dz], pass = !!(opts && opts.glass), skip = opts && opts.skip, mv = !!(opts && opts.move), sight = !!(opts && opts.sight);
    let seenThru = false;
    const crossed = pass ? [] : null, stamp = ++w.stamp, mark = w.mark;
    let best = null;
    // 3D DDA through the hash's cells
    let cx = Math.floor(ox / CELL), cy = Math.floor(oy / CELL), cz = Math.floor(oz / CELL);
    const step = d.map((v) => (v > 0 ? 1 : -1)), tDelta = d.map((v) => (Math.abs(v) > 1e-12 ? CELL / Math.abs(v) : Infinity));
    const tMax = [0, 1, 2].map((a) => (Math.abs(d[a]) > 1e-12 ? ((d[a] > 0 ? (Math.floor(o[a] / CELL) + 1) * CELL - o[a] : o[a] - Math.floor(o[a] / CELL) * CELL) / Math.abs(d[a])) : Infinity));
    let tEnter = 0;
    for (let guard = 0; guard < 4096 && tEnter <= maxT; guard++) {
      const c = w.cells.get(key(cx, cy, cz));
      if (c) for (let k = 0; k < c.length; k++) {
        const id = c[k];
        if (mark[id] === stamp) continue;
        mark[id] = stamp;
        const s = w.solids[id];
        if (!s || !(mv ? s.move : s.ray) || (skip && skip(s))) continue;
        const h = slab(o, d, s);
        if (!h || h.t > maxT) continue;
        if (s.glass != null && pass && !(s.win && s.win.armor && !sight)) { if (!crossed.some((q) => q[0] === s.glass)) crossed.push([s.glass, h.t]); continue; } // (bulletproof glass: a round stops on it)
        if (s.clear && sight) { seenThru = true; continue; } // (a look through a glass door)
        if (!best || h.t < best.t) { best = h; best.solid = s; best.view = !!s.view; best.pane = s.glass != null ? s.glass : undefined; }
      }
      const tExit = Math.min(tMax[0], tMax[1], tMax[2]);
      if (best && best.t <= tExit) break; // nothing in a later cell can be nearer
      const a = tMax[0] === tExit ? 0 : tMax[1] === tExit ? 1 : 2;
      tEnter = tExit; tMax[a] += tDelta[a];
      if (a === 0) cx += step[0]; else if (a === 1) cy += step[1]; else cz += step[2];
    }
    const out = best || { t: maxT, n: null };
    if (seenThru) out.clear = true;
    if (pass) out.glass = crossed.filter((q) => q[1] < out.t).sort((a, b) => a[1] - b[1]);
    return out;
  }
  function los(w, ax, ay, az, bx, by, bz) {
    const dx = bx - ax, dy = by - ay, dz = bz - az, d = Math.hypot(dx, dy, dz);
    if (d < 0.01) return true;
    return raycast(w, ax, ay, az, dx / d, dy / d, dz / d, d).t >= d - 0.05;
  }
  // how well a sees b: 0 (blocked), 1 (clear), or GLASS_SEE through glass that's still whole
  const GLASS_SEE = 0.4;
  function see(w, ax, ay, az, bx, by, bz) {
    const dx = bx - ax, dy = by - ay, dz = bz - az, d = Math.hypot(dx, dy, dz);
    if (d < 0.01) return 1;
    const h = raycast(w, ax, ay, az, dx / d, dy / d, dz / d, d, { glass: true, sight: true });
    if (h.t < d - 0.05) return 0;
    return (h.glass && h.glass.length) || h.clear ? GLASS_SEE : 1;
  }

  // every solid whose box overlaps [min, max] (each once)
  function query(w, min, max, fn) {
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
  function rampAt(st, x, z) {
    const along = st.axis === 'z', a = along ? z : x, lat = along ? x : z, lo = along ? st.z0 : st.x0, hi = along ? st.z1 : st.x1;
    const u = st.up < 0 ? hi - a : a - lo, len = hi - lo, n = st.steps ? st.steps.length : Math.round(st.rise / 0.2), rn = st.rise / n, run = len / n;
    return { u, len, across: lat > (along ? st.x0 : st.z0) && lat < (along ? st.x1 : st.z1), h: st.y0 + G.U.clamp((u / run + 0.5 * G.U.clamp(u / run, 0, 1)) * rn, 0, st.rise) }; // (the half step eased in over the first tread: no bump onto it)
  }
  // the flights someone at p can walk onto (or is on): across one's width, at its foot, on it or at its head,
  // and level with the slope there (not standing under its high end)
  function rampsFor(w, p, r, step) {
    let out = null;
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
  const STEP = 0.32, HEIGHT = 1.8;
  function resolve(w, p, r, h = HEIGHT, step = STEP, smooth = false) {
    const pass = smooth ? rampsFor(w, p, r, step) : null;
    for (let iter = 0; iter < 2; iter++) {
      query(w, [p.x - r, p.y + step, p.z - r], [p.x + r, p.y + h, p.z + r], (s) => {
        if (!s.move || (pass && s.stair && pass.has(s.stair))) return;
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
  function groundAt(w, x, z, r, y, step = STEP, smooth = false) {
    let g = -Infinity;
    const k = r * 0.6;
    query(w, [x - k, y - 50, z - k], [x + k, y + step, z + k], (s) => { if (s.move && !(smooth && s.stair) && s.max[1] <= y + step + 1e-6 && s.max[1] > g) g = s.max[1]; });
    if (smooth) for (const st of w.ramps || []) {
      const q = rampAt(st, x, z);
      if (q.across && q.u > 0 && q.u < q.len && q.h <= y + step + 1e-6 && q.h > g) g = q.h;
    }
    return g;
  }
  // the lowest surface over someone at (x, z) whose head is at y (Infinity: open sky)
  function ceilingAt(w, x, z, r, y) {
    let c = Infinity;
    query(w, [x - r, y - 0.2, z - r], [x + r, y + 50, z + r], (s) => { if (s.move && s.min[1] >= y - 0.2 && s.min[1] < c) c = s.min[1]; });
    return c;
  }

  // ------------------------------------------------------------------ a planned level into solids
  // A level from the tile planner (js/level.js generate) as solids, the same shapes its tiles describe: the
  // floor, the ceilings (none open to the sky), walls (runs of wall tiles merged into long boxes), furniture
  // (each piece's boxes, shelving's open frames for rays), fences, doors (a closed leaf, or the lintel over an
  // open one and its leaf standing out into the room) and windows (sill, head and the pane, and an outside
  // window's view). map.world holds it; the door and window solids hang off their records for updates.
  // A storey of a building (G.Level.stack): opts.world, the world it goes into; opts.y, its floor's height;
  // opts.skirt, how far its walls reach down past its floor (over the slab under it); opts.voidAbove, where the
  // floor above has a drop (no ceiling there); opts.ground: false for an upper floor (its floor only where it
  // has one: not over a drop).
  function fromTileMap(map, opts) {
    const o = opts || {}, L = G.Level, TS = L.TS, { W, H, t } = map, WH = L.WALL_H, w = o.world || create();
    const Y = o.y || 0, SK = o.skirt || 0, va = o.voidAbove;
    w.bounds = { min: [0, 0, 0], max: [W * TS, Y + WH, H * TS] };
    // runs of tiles merged into rectangles (greedy: along x, then down z while the whole run continues)
    const rects = (want) => {
      const used = new Uint8Array(W * H), out = [];
      for (let z = 0; z < H; z++) for (let x = 0; x < W; x++) {
        const i = z * W + x;
        if (used[i] || !want(i)) continue;
        let x1 = x;
        while (x1 + 1 < W && !used[i + x1 + 1 - x] && want(z * W + x1 + 1)) x1++;
        let z1 = z;
        for (;;) {
          if (z1 + 1 >= H) break;
          let ok = true;
          for (let xx = x; xx <= x1 && ok; xx++) { const j = (z1 + 1) * W + xx; if (used[j] || !want(j)) ok = false; }
          if (!ok) break;
          z1++;
        }
        for (let zz = z; zz <= z1; zz++) for (let xx = x; xx <= x1; xx++) used[zz * W + xx] = 1;
        out.push([x, z, x1, z1]);
      }
      return out;
    };
    // the floor (on the ground: everywhere, under the gardens too, and beyond the edge; upstairs, all but the drops)
    if (o.ground !== false) add(w, box(-TS * 4, Y - 0.5, -TS * 4, (W + 4) * TS, Y, (H + 4) * TS, { kind: 'floor' }));
    else {
      const gr = map.grate;
      for (const [x0, z0, x1, z1] of rects((i) => t[i] !== 5 && !(gr && gr[i]))) add(w, box(x0 * TS, Y - SK, z0 * TS, (x1 + 1) * TS, Y, (z1 + 1) * TS, { kind: 'floor' }));
      // steel grating (a catwalk): it holds you up, but rounds and eyes go through it, from above and from below
      if (gr) for (const [x0, z0, x1, z1] of rects((i) => gr[i] && t[i] !== 5)) add(w, box(x0 * TS, Y - 0.05, z0 * TS, (x1 + 1) * TS, Y, (z1 + 1) * TS, { kind: 'grate', ray: false }));
    }
    // ceilings over everything indoors (not under a drop in the floor above)
    for (const [x0, z0, x1, z1] of rects((i) => !map.out[i] && !(va && va[i]))) add(w, box(x0 * TS, Y + WH, z0 * TS, (x1 + 1) * TS, Y + WH + 0.3, (z1 + 1) * TS, { kind: 'ceil' }));
    // walls (not where a window is: its own solids below), and the solid edge round the map
    for (const [x0, z0, x1, z1] of rects((i) => t[i] === 1 && !(map.winAt && map.winAt.has(i)))) add(w, box(x0 * TS, Y - SK, z0 * TS, (x1 + 1) * TS, Y + WH, (z1 + 1) * TS, { kind: 'wall' }));
    const E = TS * 4;
    for (const b of [[-E, 0, -E, 0, WH, H * TS + E], [W * TS, 0, -E, W * TS + E, WH, H * TS + E], [0, 0, -E, W * TS, WH, 0], [0, 0, H * TS, W * TS, WH, H * TS + E]]) { b[1] = Y - SK; b[4] += Y; add(w, box(...b, { kind: 'wall', edge: true })); }
    // furniture and fences: each piece's boxes (a piece hangs on every tile it covers: once each)
    const fromB = (b, q) => box(b.cx - b.hx, Y + b.y0, b.cz - b.hz, b.cx + b.hx, Y + b.h, b.cz + b.hz, q);
    const seen = new Set();
    for (const [i, p] of map.props || []) {
      if (seen.has(p)) continue;
      seen.add(p);
      for (const b of p.boxes) {
        if (b.ray) { add(w, fromB(b, { kind: 'prop', prop: p, ray: false })); for (const q of b.ray) add(w, fromB(q, { kind: 'prop', prop: p, move: false })); }
        else add(w, fromB(b, { kind: 'prop', prop: p }));
      }
    }
    // furniture tiles without a piece: a crate, or a fence post
    for (let i = 0; i < W * H; i++) {
      if ((t[i] !== 2 && t[i] !== 4) || (map.props && map.props.has(i))) continue; // (5 drops and 7 flights: nothing here)
      const b = L.boxAt(map, i % W, (i / W) | 0);
      if (b) add(w, fromB(b, { kind: 'prop' }));
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
  function stairs(w, st) {
    const along = st.axis === 'z', len = along ? st.z1 - st.z0 : st.x1 - st.x0, n = Math.max(2, Math.round(st.rise / 0.2)), run = len / n, rise = st.rise / n;
    st.steps = [];
    (w.ramps = w.ramps || []).push(st); // (walkers take it as a slope: rampAt)
    for (let k = 0; k < n; k++) {
      // from the foot: climbing toward -axis (up < 0) the foot is at the far end
      const a = st.up < 0 ? (along ? st.z1 : st.x1) - (k + 1) * run : (along ? st.z0 : st.x0) + k * run, b = a + run, top = st.y0 + (k + 1) * rise;
      st.steps.push(add(w, along ? box(st.x0, st.y0, a, st.x1, top, b, { kind: 'step', stair: st }) : box(a, st.y0, st.z0, b, top, st.z1, { kind: 'step', stair: st })));
    }
  }
  // a door's solids as it stands: closed, a leaf across each of its cells; open, the lintel over each cell (you
  // walk under it) and the leaf standing out from its hinge (it stops rounds and sight, not people)
  function door(w, map, d) {
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
    if (d.open && d.leaf && !(d.pane && d.pane.broken)) { // (a glass leaf standing open: glass too; shot out, nothing much to stop anything)
      const b = d.leaf;
      d.solids.push(add(w, box(b.cx - b.hx, Y + b.y0, b.cz - b.hz, b.cx + b.hx, Y + b.h, b.cz + b.hz, { kind: 'leaf', door: d, move: false, glass: d.pane ? d.pane.id : undefined })));
    }
  }
  // a window's solids: its wall cells' sill and head (and an outside window's view), and the pane while it's whole
  function windowSolids(w, map, win) {
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

  return { CELL, STEP, HEIGHT, GLASS_SEE, create, add, remove, reshape, box, raycast, los, see, query, resolve, groundAt, rampAt, ceilingAt, fromTileMap, stairs, door, windowSolids };
})();
