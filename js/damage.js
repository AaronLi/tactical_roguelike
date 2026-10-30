'use strict';
// What a round really does to a wall or a door: it takes the material away. js/scars.js draws what's left round the damage; this cuts it.
//   A hit's a record (rec, below) that means the same on every screen, told to the squad as the marks are ('hole'), and it's the
//   same record in the replays (from a round's path). apply() takes one and:
//   - bores a hole along the round's line: the hole's outline in the face it went in by, a bore lined down the way it went, the outline in
//     the face it came out of, or a floor where it stopped. Rounds and looks go down a bore (js/world.js raycast: bore), and one that
//     comes to the floor of a blind hole starts from there, so a wall too thick to go through is shot through by hitting the same place.
//   - cuts the cubes: a wall's an instanced cube a tile (js/level.js), so a hit tile's cube is hidden and its faces built as geometry with the
//     outlines left out of them (faceTris: every outline at once, however they overlap or run off the edge).
//   A hole's shape is the material's: hard stuff cracks, the cracks running out of the hole and real slits in the surface; wood's torn
//   long along the grain, with splinters at the ends; metal's a clean tear, and js/scars.js bends its petals the way the round went.
//   A door's leaf is a thin box, cut the same way, and it has what holds it up: a handle and three hinges. Shoot out the handle and
//   the latch lets go and it swings open; shoot out all the hinges and nothing's holding it, and it falls (fallTrack: worked out once, in
//   full, so everyone and every replay sees the same fall). The host keeps the score (js/server.js doorHit).
//   Furniture, floors, ceilings, lintels and the wall round a window aren't cut: they keep their marks.
G.Damage = (() => {
  const T = THREE, N = 28, MAX = 900, BORE = 0.85; // (N: the points round a hole. MAX: holes in a level; after that, marks only. BORE: how wide it is past its mouth, as a share of its radius)
  const CRACK = (o) => Object.assign({ jag: 0.22, sy: 1, spikes: 5, reach: 5, r: 0.02, lining: 0x6c6a64 }, o);
  // what a hole is like in each material: r its radius (m) for a rifle round, how rough, how long up the grain, cracks or splinters
  const HOLE = {
    concrete: CRACK({}), cmu: CRACK({ lining: 0x7a7870 }), brick: CRACK({ lining: 0x7c4230 }), ceram: CRACK({ lining: 0xcfcdc6, r: 0.016 }), iron: CRACK({ r: 0.016, lining: 0x3a3a3c }),
    pine: { r: 0.03, jag: 0.42, sy: 1.7, spikes: 6, reach: 2.4, lining: 0xb89a68, grain: true }, ply: { r: 0.03, jag: 0.45, sy: 1.5, spikes: 6, reach: 2.2, lining: 0xb89a68, grain: true }, hardwood: { r: 0.028, jag: 0.4, sy: 1.7, spikes: 6, reach: 2.4, lining: 0x7e5430, grain: true },
    mdf: { r: 0.03, jag: 0.34, sy: 1, spikes: 0, reach: 1, lining: 0xa08458 }, gypsum: { r: 0.026, jag: 0.2, sy: 1, spikes: 2, reach: 2, lining: 0xcfcabc },
    mild: { r: 0.016, jag: 0.14, sy: 1, spikes: 0, reach: 1, lining: 0x8a929a, metal: true }, steel: { r: 0.014, jag: 0.14, sy: 1, spikes: 0, reach: 1, lining: 0x8a929a, metal: true }, alu: { r: 0.018, jag: 0.18, sy: 1, spikes: 0, reach: 1, lining: 0xb8bec4, metal: true },
  };
  const rngOf = (s) => () => { s = (Math.imul(s, 1597334677) + 12345) | 0; return ((s ^ (s >>> 15)) >>> 0) / 4294967296; };
  const seedOf = (a) => (Math.round(a[0] * 997) * 31 + Math.round(a[1] * 991) * 17 + Math.round(a[2] * 983)) | 0;
  const radius = (m, J, cal) => { const h = HOLE[m]; return h ? h.r * G.U.clamp(Math.sqrt((J || 800) / 800), 0.7, 1.35) * G.U.clamp((cal || 8) / 8, 0.8, 1.3) : 0; };
  // a hole's radii round it, N of them, as a share of its radius: rough all round, and spikes that run out of it (cracks, splinters)
  function outline(seed, h, wide = 1) {
    const rnd = rngOf(seed), q = [], gr = h.grain;
    for (let i = 0; i < N; i++) q.push((1 - h.jag + rnd() * h.jag * 2) * wide);
    for (let k = 0; k < h.spikes; k++) {
      const i = gr ? Math.round((rnd() < 0.5 ? N / 4 : (3 * N) / 4) + (rnd() - 0.5) * 5) % N : Math.floor(rnd() * N), len = 1 + (h.reach - 1) * (0.4 + rnd() * 0.6);
      q[(i + N) % N] = len * wide;
    }
    return q;
  }
  const ring = (q, r, sy, cx, cy) => q.map((k, i) => { const a = (i / N) * Math.PI * 2; return [cx + Math.cos(a) * k * r, cy + Math.sin(a) * k * r * sy]; });

  // ---------------------------------------------------------------- a face with the holes left out of it
  // A rectangle less any number of outlines (each a list of [u, v]), overlapping or running off its edges as they please: cut into
  // bands at every height a point's at, and each band's stretches outside every outline are quads. Pushes [u, v] pairs, three to a
  // triangle, anticlockwise.
  function faceTris(u0, u1, v0, v1, polys, out) {
    const ys = [v0, v1], edges = [];
    for (const p of polys) for (let i = 0; i < p.length; i++) {
      const A = p[i], B = p[(i + 1) % p.length];
      if (A[1] > v0 && A[1] < v1) ys.push(A[1]);
      if (A[1] !== B[1]) edges.push({ A, B, lo: Math.min(A[1], B[1]), hi: Math.max(A[1], B[1]) });
    }
    ys.sort((a, b) => a - b); edges.sort((a, b) => a.lo - b.lo);
    let live = [], next = 0; // (the edges at this height: a face of many holes has thousands of bands and edges)
    const quad = (x0a, x1a, ya, x0b, x1b, yb) => out.push(x0a, ya, x1a, ya, x1b, yb, x0a, ya, x1b, yb, x0b, yb);
    for (let b = 0; b + 1 < ys.length; b++) {
      const ya = ys[b], yb = ys[b + 1];
      if (yb - ya < 1e-5) continue;
      const ym = (ya + yb) / 2, cuts = [];
      while (next < edges.length && edges[next].lo <= ym) live.push(edges[next++]);
      live = live.filter((e) => e.hi > ym);
      for (const { A, B } of live) {
        const k = (B[0] - A[0]) / (B[1] - A[1]), at = (y) => A[0] + k * (y - A[1]);
        cuts.push({ x: at(ym), a: at(ya), b: at(yb), w: B[1] > A[1] ? 1 : -1 });
      }
      cuts.sort((p, q) => p.x - q.x);
      let w = 0, lastA = u0, lastB = u0, solid = true;
      const emit = (ea, eb) => { const a0 = Math.max(u0, lastA), b0 = Math.max(u0, lastB), a1 = Math.min(u1, ea), b1 = Math.min(u1, eb); if (a1 > a0 || b1 > b0) quad(a0, Math.max(a0, a1), ya, b0, Math.max(b0, b1), yb); };
      for (const c of cuts) {
        const was = w === 0; w += c.w;
        if (was && w !== 0 && solid) { emit(c.a, c.b); solid = false; } else if (!was && w === 0) { lastA = c.a; lastB = c.b; solid = true; }
      }
      if (solid) emit(u1, u1);
    }
  }
  // the state of a level's damage (a map's: the host's has no meshes, only what rays need)
  const st = (map) => map.dmg || (map.dmg = { holes: [], seen: new Set(), faces: new Map(), tiles: new Map(), mats: new Map(), falls: [] });
  const floorOf = (map, y) => (map.floors ? map.floors.find((f) => y >= (f.fy || 0) - 0.5 && y < (f.fy || 0) + G.Level.WALL_H + 0.3) || map.floors[0] : map);
  const liningMat = (map, col) => {
    const D = st(map);
    if (!D.mats.has(col)) D.mats.set(col, new T.MeshLambertMaterial({ color: col, vertexColors: true, side: T.DoubleSide }));
    return D.mats.get(col);
  };
  // a wall's material, in the tile's shade (the cube was one of many, each its own: js/level.js)
  const wallMat = (map, fm, shade) => {
    const D = st(map), k = 'w' + fm.wallMesh.uuid + Math.round(shade * 16);
    if (!D.mats.has(k)) { const m = fm.wallMesh.material.clone(); m.color.setRGB(shade, shade, shade); D.mats.set(k, m); }
    return D.mats.get(k);
  };
  // the sides of a ring of points round a hole, from ring a to ring b: positions and a shade for each
  function strip(a, b, ka, kb, pos, col) {
    for (let i = 0; i < a.length; i++) {
      const j = (i + 1) % a.length, q = [a[i], a[j], b[j], a[i], b[j], b[i]], s = [ka, ka, kb, ka, kb, kb];
      q.forEach((p, n) => { pos.push(p.x, p.y, p.z); col.push(s[n], s[n], s[n]); });
    }
  }
  const lined = (pos, col, mat, off) => {
    const g = new T.BufferGeometry(); g.setAttribute('position', new T.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new T.Float32BufferAttribute(col, 3)); g.computeVertexNormals();
    const m = new T.Mesh(g, mat); if (off) m.position.copy(off); m.layers.enable(1); return m;
  };

  // ---------------------------------------------------------------- walls
  const faceKey = (fm, ax, sg, c) => `${fm.fl || 0}:${ax}:${sg}:${Math.round(c / G.Level.TS)}`;
  const axisOf = (n) => (Math.abs(n[0]) > 0.5 ? 0 : Math.abs(n[2]) > 0.5 ? 2 : -1);
  // a hole's outline in the face with normal n, at point a (world [u, v]: along the wall, up)
  function inFace(fm, H, a, n, q, r) {
    const ax = axisOf(n);
    if (ax < 0) return null;
    return { key: faceKey(fm, ax, Math.sign(n[ax]), a[ax]), pts: ring(q, r, H.look.sy, ax === 0 ? a[2] : a[0], a[1]), ax, a, q, r };
  }
  // a point of ring q (r) round a, in its face
  const ring3 = (F, sy, k = 1, along = null, by = 0) => F.q.map((v, i) => {
    const t = (i / N) * Math.PI * 2, e = k < 1 ? 1 : v, u = Math.cos(t) * e * F.r * k, w = Math.sin(t) * e * F.r * k * sy, p = new T.Vector3(F.a[0], F.a[1] + w, F.a[2]);
    if (F.ax === 0) p.z += u; else p.x += u;
    if (along) p.addScaledVector(along, by);
    return p;
  });
  // the bore's lining, and its floor if it's blind
  function bore(H) {
    const pos = [], col = [], u = new T.Vector3(...H.u), F = H.fa, FB = H.fb, sy = H.look.sy, shallow = Math.min(0.02, H.len * 0.3);
    const a0 = ring3(F, sy), a1 = ring3(F, sy, BORE, u, shallow), z1 = FB ? ring3(FB, sy, BORE, u, -Math.min(0.02, H.len * 0.3)) : ring3(F, sy, BORE, u, H.len);
    strip(a0, a1, 0.72, 0.5, pos, col); strip(a1, z1, 0.5, FB ? 0.5 : 0.22, pos, col);
    if (FB) strip(z1, ring3(FB, sy), 0.5, 0.72, pos, col);
    else { const mid = z1.reduce((s, p) => s.add(p), new T.Vector3()).divideScalar(N); for (let i = 0; i < N; i++) { for (const p of [z1[i], z1[(i + 1) % N], mid]) { pos.push(p.x, p.y, p.z); col.push(0.18, 0.18, 0.18); } } }
    return { pos, col };
  }
  // A tile's cube as geometry: its faces that show (not those against another wall), less what's been cut from them, and the linings of the
  // bores that start in it. Its instance in the level's walls is hidden.
  function tileOf(map, fm, x, z) {
    const D = st(map), wm = fm.wallMesh, i = z * fm.W + x, idx = fm.wallIdx && fm.wallIdx.get(i), k = `${fm.fl || 0}:${i}`;
    if (idx == null) return null;
    let tile = D.tiles.get(k);
    if (!tile) {
      tile = { group: new T.Group(), holes: [], faces: {} };
      D.tiles.set(k, tile); wm.parent.add(tile.group);
      const c = new T.Color(); if (wm.instanceColor) wm.getColorAt(idx, c); tile.shade = c.r || 1;
      wm.setMatrixAt(idx, new T.Matrix4().makeScale(0, 0, 0)); wm.instanceMatrix.needsUpdate = true;
    }
    return tile;
  }
  function tileMesh(map, fm, x, z) {
    const D = st(map), tile = tileOf(map, fm, x, z);
    if (!tile) return;
    const TS = G.Level.TS, Y = fm.fy || 0, SK = fm.skirt || 0, WH = G.Level.WALL_H;
    for (const c of [...tile.group.children]) { c.removeFromParent(); c.geometry.dispose(); }
    const pos = [], nor = [], uvs = [], x0 = x * TS, x1 = x0 + TS, z0 = z * TS, z1 = z0 + TS, v0 = -SK, v1 = WH;
    // (u along the face, v up it, and the texture across it as a BoxGeometry's runs: seen from outside, left to right)
    const side = (ax, sg, c, a0, a1, nx, nz, nbr) => {
      if (nbr === 1 && !(fm.winAt && fm.winAt.has(nbrI))) return;
      const list = D.faces.get(faceKey(fm, ax, sg, c)) || [], was = tile.faces[ax + sg]; // (only the face it hit has changed)
      let tris = was && was.n === list.length ? was.tris : null;
      if (!tris) { tris = []; faceTris(a0, a1, v0, v1, list.map((f) => f.pts.map((p) => [p[0], p[1] - Y])), tris); tile.faces[ax + sg] = { n: list.length, tris }; }
      for (let n = 0; n < tris.length; n += 6) {
        const a = [tris[n], tris[n + 1], tris[n + 2], tris[n + 3], tris[n + 4], tris[n + 5]];
        const order = (ax === 2) === (sg > 0) ? [0, 2, 4] : [0, 4, 2]; // (facing out)
        for (const m of order) {
          const u = a[m], v = a[m + 1], px = ax === 0 ? c : u, pz = ax === 0 ? u : c;
          pos.push(px, v, pz); nor.push(nx, 0, nz);
          const f = (u - a0) / (a1 - a0);
          uvs.push(ax === 0 ? (sg > 0 ? 1 - f : f) : (sg > 0 ? f : 1 - f), (v - v0) / (v1 - v0));
        }
      }
    };
    let nbrI = 0; const at = (dx, dz) => { const nx = x + dx, nz = z + dz; nbrI = nz * fm.W + nx; return nx >= 0 && nz >= 0 && nx < fm.W && nz < fm.H ? fm.t[nbrI] : 0; };
    side(0, 1, x1, z0, z1, 1, 0, at(1, 0)); side(0, -1, x0, z0, z1, -1, 0, at(-1, 0)); side(2, 1, z1, x0, x1, 0, 1, at(0, 1)); side(2, -1, z0, x0, x1, 0, -1, at(0, -1));
    for (const [px, pz, u, w] of [[x0, z0, 0, 0], [x0, z1, 0, 1], [x1, z1, 1, 1], [x0, z0, 0, 0], [x1, z1, 1, 1], [x1, z0, 1, 0]]) { pos.push(px, v1, pz); nor.push(0, 1, 0); uvs.push(u, w); } // (the top)
    const g = new T.BufferGeometry(); g.setAttribute('position', new T.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new T.Float32BufferAttribute(nor, 3)); g.setAttribute('uv', new T.Float32BufferAttribute(uvs, 2));
    const m = new T.Mesh(g, wallMat(map, fm, tile.shade)); m.layers.enable(1); tile.group.add(m);
    const by = new Map();
    for (const H of tile.holes) { const c = H.look.lining, b = by.get(c) || { pos: [], col: [] }; by.set(c, b); const q = H.geo || (H.geo = bore(H)); for (let n = 0; n < q.pos.length; n++) b.pos.push(q.pos[n]); for (let n = 0; n < q.col.length; n++) b.col.push(q.col[n]); }
    for (const [c, b] of by) tile.group.add(lined(b.pos, b.col, liningMat(map, c), new T.Vector3(0, -Y, 0)));
  }
  // every tile a hole touches: its outlines, and along its bore
  function touched(fm, H) {
    const TS = G.Level.TS, out = new Set(), add = (px, pz) => { const x = Math.floor(px / TS), z = Math.floor(pz / TS); if (x >= 0 && z >= 0 && x < fm.W && z < fm.H) out.add(z * fm.W + x); };
    for (const F of [H.fa, H.fb]) if (F) for (const p of F.pts) { const e = 1e-3; if (F.ax === 0) { add(F.a[0] + e, p[0]); add(F.a[0] - e, p[0]); } else { add(p[0], F.a[2] + e); add(p[0], F.a[2] - e); } }
    const r = H.r;
    for (let s = 0; s <= H.len + 0.05; s += 0.1) for (const [ox, oz] of [[0, 0], [r, 0], [-r, 0], [0, r], [0, -r]]) add(H.a[0] + H.u[0] * s + ox, H.a[2] + H.u[2] * s + oz);
    return out;
  }
  const hideFace = (D, F) => { if (F) { const l = D.faces.get(F.key) || []; if (!l.includes(F)) l.push(F); D.faces.set(F.key, l); } };
  function redraw(map, fm, H) {
    const D = st(map);
    H.geo = null;
    hideFace(D, H.fa); hideFace(D, H.fb);
    if (!fm.wallMesh) return;
    const TS = G.Level.TS, ts = touched(fm, H), home = Math.floor((H.a[2] + H.u[2] * 0.01) / TS) * fm.W + Math.floor((H.a[0] + H.u[0] * 0.01) / TS);
    // (the bore's mesh lives with a tile that's really there: the one it went in by, or the first along it that is)
    let owner = null;
    for (const i of ts) { const t = tileOf(map, fm, i % fm.W, (i / fm.W) | 0); if (t && (!owner || i === home)) owner = t; }
    if (owner && H.home !== owner) { if (H.home) H.home.holes.splice(H.home.holes.indexOf(H), 1); H.home = owner; owner.holes.push(H); }
    for (const i of ts) tileMesh(map, fm, i % fm.W, (i / fm.W) | 0);
  }
  // the solids along a bore have it, for rays
  function onSolids(map, H) {
    const w = map.world, u = H.u;
    for (const s of H.solids || []) s.holes.splice(s.holes.indexOf(H), 1);
    H.solids = [];
    for (let t = 0; t <= H.len + 0.01; t += 0.05) {
      const x = H.a[0] + u[0] * t, y = H.a[1] + u[1] * t, z = H.a[2] + u[2] * t, k = 0.002;
      G.World.query(w, [x - k, y - k, z - k], [x + k, y + k, z + k], (s) => { if (s.kind === 'wall' && !H.solids.includes(s)) { (s.holes = s.holes || []).push(H); H.solids.push(s); } });
    }
  }
  // how far along a ray (from t0, into a solid it leaves at t1) it stays in a bore: t0 if it doesn't go down it
  function bored(H, o, d, t0, t1) {
    const R = H.r * 0.8, u = H.u, A = H.a;
    const inside = (t) => { const x = o[0] + d[0] * t - A[0], y = o[1] + d[1] * t - A[1], z = o[2] + d[2] * t - A[2], s = x * u[0] + y * u[1] + z * u[2]; return s >= -0.03 && s <= H.len && x * x + y * y + z * z - s * s <= R * R; };
    if (!inside(t0 + 1e-3)) return t0;
    let t = t0;
    for (; t < t1; t = Math.min(t1, t + 0.02)) if (!inside(Math.min(t1 - 1e-4, t + 0.02))) return t;
    return t1;
  }
  // where along a ray a solid with holes in it really stops it: past its far side (t1) if it goes clean down a bore
  function clear(s, o, d, t0, t1) { let t = t0; for (const H of s.holes) t = Math.max(t, bored(H, o, d, t0, t1)); return t; }

  // ---------------------------------------------------------------- doors
  // a point on a door in its leaf's own terms ([x from the hinge, y up], js/level.js: pivot), shut or standing open
  function onLeaf(d, p) {
    const half = (d.w || G.Level.TS) / 2, m = d.mirror ? -1 : 1, y = p[1] - (d.fy || 0);
    if (d.open) return [d.axis === 'x' ? p[0] - d.x : d.z - p[2], y];
    return [d.axis === 'x' ? (p[2] - (d.z - half * m)) * m : (p[0] - (d.x - half * m)) * m, y];
  }
  // does a ray at this point on the door go through a hole in it?
  function doorHole(d, p) { const q = onLeaf(d, p); return d.holes.some((h) => Math.hypot(q[0] - h.x, (q[1] - h.y) / h.sy) <= h.r * 0.85); }
  const PARTS = { handle: 400, hinge: 600 }, HINGES = [0.3, 1.05, 1.85];
  // what of a door's a round struck there: 'h' its handle, 0 1 2 a hinge, or nothing
  function partAt(d, p) {
    if (d.kind === 'vault') return null;
    const q = onLeaf(d, p), L = (d.w || G.Level.TS) - 0.05;
    if (Math.hypot(q[0] - (L - 0.08), q[1] - 1) < 0.085) return 'h';
    if (q[0] < 0.12) for (let i = 0; i < 3; i++) if (Math.abs(q[1] - HINGES[i]) < 0.09) return i;
    return null;
  }
  // the leaf, rebuilt with its holes (a box's faces, the edges and a lining for each)
  function leafMesh(map, d) {
    const piv = map.doorMeshes && map.doorMeshes[d.id], leaf = piv && piv.userData.leaf;
    if (!leaf) return;
    const P = leaf.geometry.parameters, w = P.width, h = P.height, t = P.depth / 2, cx = leaf.position.x, cy = leaf.position.y, x0 = cx - w / 2, polys = d.holes.map((q) => q.pts), tris = [];
    faceTris(x0, x0 + w, 0, h, polys, tris);
    const pos = [], nor = [], uvs = [];
    for (let n = 0; n < tris.length; n += 2) { pos.push(tris[n] - cx, tris[n + 1] - cy, t); nor.push(0, 0, 1); uvs.push(0, 0); }
    for (let n = 0; n < tris.length; n += 6) for (const m of [0, 4, 2]) { pos.push(tris[n + m] - cx, tris[n + m + 1] - cy, -t); nor.push(0, 0, -1); uvs.push(0, 0); }
    const box = new T.BoxGeometry(w, h, P.depth).toNonIndexed(), bp = box.attributes.position, bn = box.attributes.normal;
    for (let i = 0; i < bp.count; i++) if (Math.abs(bn.getZ(i)) < 0.5) { pos.push(bp.getX(i), bp.getY(i), bp.getZ(i)); nor.push(bn.getX(i), bn.getY(i), bn.getZ(i)); uvs.push(0, 0); }
    box.dispose();
    const g = new T.BufferGeometry(); g.setAttribute('position', new T.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new T.Float32BufferAttribute(nor, 3)); g.setAttribute('uv', new T.Float32BufferAttribute(uvs, 2));
    g.parameters = P; leaf.geometry.dispose(); leaf.geometry = g;
    if (leaf.userData.lining) { leaf.userData.lining.removeFromParent(); leaf.userData.lining.geometry.dispose(); }
    const lp = [], lc = [];
    for (const q of d.holes) { const rim = (z) => q.pts.map((p) => new T.Vector3(p[0] - cx, p[1] - cy, z)); strip(rim(t), rim(-t), 0.75, 0.55, lp, lc); }
    if (lp.length) { const m = lined(lp, lc, liningMat(map, d.holes[0].lining)); leaf.add(m); leaf.userData.lining = m; }
  }

  // ---------------------------------------------------------------- a hit
  // A hit to record, or null. s: the solid; at: where it went in; u: the way it was going; n, the face's normal; r: js/ballistics.js crossSolid's
  // result; o: where the ray came from (the round's way out: o + u r.t); J, cal: its energy and width.
  function hit(map, s, at, u, n, r, o, J, cal) {
    if (r.ric || st(map).holes.length >= MAX) return null;
    const door = s.door && (s.kind === 'door' || s.kind === 'leaf') && s.glass == null, wall = s.kind === 'wall' && !s.edge && !s.win;
    if (!door && !wall) return null;
    const h = HOLE[r.mat];
    if (!h || (door && !r.v) || (h.metal && !r.v)) return null; // (a round steel stops only dents it)
    const round3 = (v) => [+v.x.toFixed(4), +v.y.toFixed(4), +v.z.toFixed(4)], R = radius(r.mat, J, cal);
    const rec = { a: round3(at), u: round3(u), n, m: r.mat, J: Math.round(J), c: +cal.toFixed(1), d: r.v ? 0 : +(r.depth || 0.02).toFixed(3) };
    if (r.v) { rec.b = round3(o.clone().addScaledVector(u, r.t)); rec.nb = r.nOut; }
    rec.id = seedOf(rec.a) ^ (seedOf(rec.b || rec.u.map((x) => x * 40)) * 7);
    return { rec, r: R, rOut: (r.matOut && HOLE[r.matOut] ? radius(r.matOut, J, cal) : R) * 1.25 };
  }
  // A round's mark in a replay (its path's entry event e, and the exit that followed, if it did): the same record
  function ofEvent(e, x) {
    if (e.k !== 'e' || !HOLE[e.m] || !e.dir || (HOLE[e.m].metal && e.stop)) return null;
    const a = [e.p.x, e.p.y, e.p.z].map((v) => +v.toFixed(4)), u = [e.dir.x, e.dir.y, e.dir.z].map((v) => +v.toFixed(4)), rec = { a, u, n: e.n, m: e.m, J: e.J, c: e.cal || 8, d: e.stop ? e.depth || 0.03 : 0 };
    if (!e.stop && x) { rec.b = [x.p.x, x.p.y, x.p.z].map((v) => +v.toFixed(4)); rec.nb = x.n; }
    if (!e.stop && !x) return null;
    rec.id = seedOf(a) ^ (seedOf(rec.b || u.map((v) => v * 40)) * 7);
    return rec;
  }
  // Take the record's material out of what's there, on this map (once)
  function apply(map, rec) {
    const D = st(map), w = map.world;
    if (!w || !rec || !rec.a || D.seen.has(rec.id) || D.holes.length >= MAX) return false;
    D.seen.add(rec.id);
    const a = rec.a, n = rec.n, in0 = [a[0] - n[0] * 0.01, a[1] - n[1] * 0.01, a[2] - n[2] * 0.01];
    let door = null, wall = false;
    G.World.query(w, in0.map((v) => v - 0.02), in0.map((v) => v + 0.02), (s) => { if (s.door && (s.kind === 'door' || s.kind === 'leaf') && s.glass == null) door = s.door; else if (s.kind === 'wall' && !s.edge && !s.win) wall = true; });
    const look = HOLE[rec.m] || HOLE.concrete, R = radius(rec.m, rec.J, rec.c), seed = seedOf(a);
    if (door) {
      if (!rec.b) return false;
      const c = [(a[0] + rec.b[0]) / 2, (a[1] + rec.b[1]) / 2, (a[2] + rec.b[2]) / 2], q = onLeaf(door, c);
      if (q[1] > G.Level.DOOR_H) return false;
      (door.holes = door.holes || []).push({ x: q[0], y: q[1], r: R, sy: look.sy, lining: look.lining, pts: ring(outline(seed, look), R, look.sy, q[0], q[1]) });
      leafMesh(map, door);
      return true;
    }
    if (!wall) return false;
    const fm = floorOf(map, a[1]), u = rec.u, len = rec.b ? Math.hypot(rec.b[0] - a[0], rec.b[1] - a[1], rec.b[2] - a[2]) : rec.d;
    // into a hole already there: it goes deeper
    const old = D.holes.find((H) => { const x = a[0] - H.a[0], y = a[1] - H.a[1], z = a[2] - H.a[2], s = x * H.u[0] + y * H.u[1] + z * H.u[2]; return s > -0.04 && s < H.len + 0.05 && x * x + y * y + z * z - s * s < H.r * H.r * 1.6; });
    if (old) {
      const s = (a[0] - old.a[0]) * old.u[0] + (a[1] - old.a[1]) * old.u[1] + (a[2] - old.a[2]) * old.u[2];
      old.len = Math.max(old.len, s + len);
      if (rec.b && !old.fb && axisOf(rec.nb) >= 0) old.fb = inFace(fm, old, rec.b, rec.nb, outline(seed + 5, old.look, 1.3), Math.max(R, old.r));
      onSolids(map, old); redraw(map, fm, old);
      return true;
    }
    if (axisOf(n) < 0) return false;
    const H = { a, u, len, r: R, look, m: rec.m };
    H.fa = inFace(fm, H, a, n, outline(seed, look), R);
    if (rec.b && axisOf(rec.nb) >= 0) H.fb = inFace(fm, H, rec.b, rec.nb, outline(seed + 5, look, 1.3), R);
    D.holes.push(H);
    onSolids(map, H); redraw(map, fm, H);
    return true;
  }
  // Can you see them through a hole? Each of the holes that goes right through, near enough to look down: a line from your eye down it,
  // and whether it passes near them (the look that shows them, js/views.js inSight)
  function seenThrough(map, c, p) {
    const D = map.dmg;
    if (!D || !D.holes.length) return false;
    for (const H of D.holes) {
      if (!H.fb) continue;
      const mx = H.a[0] + H.u[0] * H.len * 0.5, my = H.a[1] + H.u[1] * H.len * 0.5, mz = H.a[2] + H.u[2] * H.len * 0.5, dx = mx - c.x, dy = my - c.y, dz = mz - c.z, d = Math.hypot(dx, dy, dz);
      if (d > 40) continue;
      const ux = dx / d, uy = dy / d, uz = dz / d, tx = p.x - c.x, ty = p.y - c.y, tz = p.z - c.z, along = tx * ux + ty * uy + tz * uz;
      if (along < d) continue;
      const cx = tx - ux * along, cy = ty - uy * along, cz = tz - uz * along;
      if (cx * cx + cy * cy + cz * cz < 0.8 && G.World.raycast(map.world, c.x, c.y, c.z, ux, uy, uz, along).t >= along - 0.3) return true;
    }
    return false;
  }

  // ---------------------------------------------------------------- a door falling
  // Where a leaf stands: its centre, and how it's turned (ang 0 shut, 1 open)
  function leafPose(d, ang) {
    const half = (d.w || G.Level.TS) / 2, m = d.mirror ? -1 : 1, Y = d.fy || 0, L = (d.w || G.Level.TS) - 0.05, LH = G.Level.DOOR_H - 0.04;
    const base = d.axis === 'x' ? -Math.PI / 2 * m : d.mirror ? Math.PI : 0, yaw = base + ang * Math.PI / 2 * 0.95 * m;
    const px = d.axis === 'x' ? d.x : d.x - half * m, pz = d.axis === 'x' ? d.z - half * m : d.z;
    const q = new T.Quaternion().setFromAxisAngle(new T.Vector3(0, 1, 0), yaw), c = new T.Vector3(L / 2 + 0.02, LH / 2, 0).applyQuaternion(q).add(new T.Vector3(px, Y, pz));
    return { c, q, L, LH, centre: new T.Vector3(L / 2 + 0.02, LH / 2, 0) };
  }
  // The whole of its fall, worked out now, a rigid box on what's solid round it, at 240 steps a second: [t, cx, cy, cz, qx, qy, qz, qw] a
  // frame at 60. It's pushed the way the last round was going, its top tipping that way. seed: a little of chance, the same on every screen.
  function fallTrack(map, d, ang, dir, seed) {
    const w = map.world, P0 = leafPose(d, ang), rnd = rngOf(seed), hw = P0.L / 2, hh = P0.LH / 2, ht = 0.025, M = 22;
    const ib = new T.Vector3(3 * 1 / (M * (hh * hh + ht * ht)), 3 * 1 / (M * (hw * hw + ht * ht)), 3 * 1 / (M * (hw * hw + hh * hh)));
    const solids = [];
    G.World.query(w, [P0.c.x - 3.5, P0.c.y - 3, P0.c.z - 3.5], [P0.c.x + 3.5, P0.c.y + 3, P0.c.z + 3.5], (s) => { if (s.move && s.door !== d) solids.push(s); });
    const c = P0.c.clone(), q = P0.q.clone(), up = new T.Vector3(0, 1, 0), dh = new T.Vector3(dir[0], 0, dir[1]);
    if (dh.lengthSq() < 1e-4) dh.set(1, 0, 0);
    dh.normalize();
    const v = dh.clone().multiplyScalar(0.5), om = new T.Vector3().crossVectors(up, dh).multiplyScalar(0.7 + rnd() * 0.3).add(new T.Vector3(0, (rnd() - 0.5) * 0.5, 0));
    const pts = []; for (const x of [-1, 0, 1]) for (const y of [-1, 1]) for (const z of [-1, 1]) pts.push(new T.Vector3(x * hw, y * hh, z * ht));
    const frames = [], dt = 1 / 240, g = 9.8, r = new T.Vector3(), wp = new T.Vector3(), vp = new T.Vector3(), nv = new T.Vector3(), rn = new T.Vector3(), tmp = new T.Vector3(), tv = new T.Vector3();
    const Q = new T.Quaternion(), Qi = new T.Quaternion();
    const invI = (out, a) => { out.copy(a).applyQuaternion(Qi); out.set(out.x * ib.x, out.y * ib.y, out.z * ib.z).applyQuaternion(Q); return out; };
    let still = 0, thud = -1;
    for (let step = 0; step < 1920; step++) {
      v.y -= g * dt;
      Q.copy(q); Qi.copy(q).invert();
      let peak = 0;
      for (const b of pts) {
        wp.copy(b).applyQuaternion(q).add(c);
        for (const s of solids) {
          if (wp.x <= s.min[0] || wp.x >= s.max[0] || wp.y <= s.min[1] || wp.y >= s.max[1] || wp.z <= s.min[2] || wp.z >= s.max[2]) continue;
          let best = Infinity, ax = 1, sg = 1;
          for (let a = 0; a < 3; a++) { const lo = wp.getComponent(a) - s.min[a], hi = s.max[a] - wp.getComponent(a); if (lo < best) { best = lo; ax = a; sg = -1; } if (hi < best) { best = hi; ax = a; sg = 1; } }
          nv.set(0, 0, 0).setComponent(ax, sg);
          r.copy(wp).sub(c);
          vp.copy(v).add(tmp.crossVectors(om, r));
          const vn = vp.dot(nv);
          if (vn < 0) {
            rn.crossVectors(r, nv);
            const k = 1 / M + tmp.crossVectors(invI(tv, rn), r).dot(nv), j = (-(1 + (vn < -0.8 ? 0.15 : 0)) * vn) / k;
            v.addScaledVector(nv, j / M); om.add(invI(tv, rn).multiplyScalar(j));
            if (-vn > peak) peak = -vn;
            // (friction)
            vp.copy(v).add(tmp.crossVectors(om, r)); const vt = vp.addScaledVector(nv, -vp.dot(nv)), sp = vt.length();
            if (sp > 1e-4) {
              vt.divideScalar(sp); rn.crossVectors(r, vt);
              const kt = 1 / M + tmp.crossVectors(invI(tv, rn), r).dot(vt), jt = Math.min(sp / kt, 0.55 * j);
              v.addScaledVector(vt, -jt / M); om.addScaledVector(invI(tv, rn), -jt);
            }
          }
          c.addScaledVector(nv, Math.min(best, 0.02) * 0.25);
        }
      }
      if (peak > 1.2 && thud < 0) thud = step / 240;
      v.multiplyScalar(0.9995); om.multiplyScalar(0.998);
      c.addScaledVector(v, dt);
      const hq = new T.Quaternion(om.x * dt * 0.5, om.y * dt * 0.5, om.z * dt * 0.5, 0).multiply(q);
      q.set(q.x + hq.x, q.y + hq.y, q.z + hq.z, q.w + hq.w).normalize();
      if (step % 4 === 0) frames.push([step / 240, c.x, c.y, c.z, q.x, q.y, q.z, q.w]);
      still = v.lengthSq() < 0.02 && om.lengthSq() < 0.05 ? still + 1 : 0;
      if (still > 40) break;
    }
    frames.push([frames[frames.length - 1][0] + 1 / 60, c.x, c.y, c.z, q.x, q.y, q.z, q.w]);
    return { frames, thud, centre: P0.centre };
  }
  // what's left lying on the floor stops rounds, as what it is; it's walked over
  function restBox(d, T0) {
    const f = T0.frames[T0.frames.length - 1], P = leafPose(d, 0), q = new T.Quaternion(f[4], f[5], f[6], f[7]), mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
    for (const x of [-1, 1]) for (const y of [-1, 1]) for (const z of [-1, 1]) { const p = new T.Vector3(x * P.L / 2, y * P.LH / 2, z * 0.025).applyQuaternion(q); [p.x + f[1], p.y + f[2], p.z + f[3]].forEach((v, a) => { mn[a] = Math.min(mn[a], v); mx[a] = Math.max(mx[a], v); }); }
    return mx[1] - mn[1] < 0.25 ? [...mn, ...mx] : null;
  }
  function setPose(piv, u, f, Y) { if (!u.p0) u.p0 = piv.position.clone(); piv.quaternion.set(f[4], f[5], f[6], f[7]); piv.position.set(f[1], f[2] - Y, f[3]).sub(_p.copy(u.centre).applyQuaternion(piv.quaternion)); }
  const _p = new T.Vector3();
  // The door's down: nothing holds it now. Solids at once, its fall on the screen (ang, dir, seed: as the host gave them). snap: it fell before you got here.
  function fall(map, d, ang, dir, seed, snap) {
    if (d.fallen) return;
    d.fallen = true; d.open = true;
    const tr = fallTrack(map, d, ang, dir, seed);
    d.rest = restBox(d, tr);
    G.World.door(map.world, map, d);
    map.doorVer = (map.doorVer || 0) + 1;
    const piv = map.doorMeshes && map.doorMeshes[d.id];
    if (!piv) return;
    piv.userData.fallen = true;
    const u = piv.userData; u.centre = tr.centre;
    st(map).falls.push({ piv, tr, t: snap ? 1e3 : 0, Y: d.fy || 0, d, thud: false });
    if (!snap && G.Audio && G.Audio.sampleAt) G.Audio.sampleAt('door_close', new T.Vector3(d.x, 1.1, d.z), 0.5, 0.7);
  }
  function update(map, dt) {
    const D = map && map.dmg;
    if (!D || !D.falls.length) return;
    D.falls = D.falls.filter((F) => {
      F.t += dt;
      const fr = F.tr.frames, i = Math.min(fr.length - 1, Math.floor(F.t * 60));
      setPose(F.piv, F.piv.userData, fr[i], F.Y);
      if (!F.thud && F.tr.thud >= 0 && F.t >= F.tr.thud) {
        F.thud = true;
        if (F.t < 8 && G.Audio && G.Audio.kick) G.Audio.kick(G.R.camera.position.distanceTo(F.piv.position));
        if (G.R.particles && F.t < 8) G.R.particles(new T.Vector3(fr[i][1], (F.Y || 0) + 0.05, fr[i][3]), 16, 0xa8a090, 1.4, 0.8, 1, 0.8);
      }
      return i < fr.length - 1;
    });
  }
  // a part of a door shot away, on the screen
  function partGone(map, d, pt) {
    (d.gone = d.gone || {})[pt] = 1;
    const piv = map.doorMeshes && map.doorMeshes[d.id], u = piv && piv.userData;
    if (!u) return;
    for (const m of pt === 'h' ? u.knobs || [] : u.hinges ? u.hinges[pt] || [] : []) m.visible = false;
  }
  // back as it was built (a replay, starting again)
  function reset(map) {
    const D = map.dmg;
    if (!D) return;
    for (const t of D.tiles.values()) { for (const c of [...t.group.children]) { c.removeFromParent(); c.geometry.dispose(); } t.group.removeFromParent(); }
    for (const fm of map.floors || [map]) if (fm.wallMesh && fm.wallBase) { fm.wallMesh.instanceMatrix.array.set(fm.wallBase); fm.wallMesh.instanceMatrix.needsUpdate = true; }
    for (const s of map.world ? map.world.solids : []) if (s && s.holes) s.holes = null;
    for (const d of map.doors || []) { if (d.holes && d.holes.length) { d.holes = []; leafMesh(map, d); } d.holes = null; }
    D.holes = []; D.seen = new Set(); D.faces = new Map(); D.tiles = new Map(); D.falls = [];
  }
  // what the level's own warmup needs to have compiled (js/render.js warmup): a hole's lining
  function warm(map) {
    const m = lined([0, 0, 0, 1, 0, 0, 0, 1, 0], [1, 1, 1, 1, 1, 1, 1, 1, 1], liningMat(map, HOLE.concrete.lining));
    return [m];
  }
  return { HOLE, PARTS, HINGES, radius, hit, ofEvent, apply, clear, doorHole, onLeaf, partAt, fall, fallTrack, leafPose, setPose, partGone, update, reset, seenThrough, warm };
})();
