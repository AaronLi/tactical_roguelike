'use strict';
// What a round really does to a wall or a door: it takes the material away. js/scars.js draws what's left round the damage; this cuts it.
//   A hit's a record (rec, below) that means the same on every screen, told to the squad as the marks are ('hole'), and it's the
//   same record in the replays (from a round's path). apply() takes one and:
//   - bores a hole along the round's line: the hole's outline in the face it went in by, a bore lined down the way it went, the outline in
//     the face it came out of, or a floor where it stopped. Rounds and looks go down a bore (js/world.js raycast: bore), and one that
//     comes to the floor of a blind hole starts from there, so a wall too thick to go through is shot through by hitting the same place.
//   - fuses it with any hole it touches: one outline round the two, the material between them gone, one bore that shape, one set of marks round it
//     (fuse). So holes side by side open up into one, and a burst tears a wide ragged gap.
//   - cuts the cubes: a wall's an instanced cube a tile (js/level.js), so a hit tile's cube is hidden and its faces built as geometry with the
//     outlines left out of them (faceTris: every outline at once, however they overlap or run off the edge).
//   A hole's shape is the material's: hard stuff cracks, the cracks running out of the hole and real slits in the surface; wood's torn
//   long along the grain, with splinters at the ends; metal's a clean tear, and js/scars.js bends its petals the way the round went.
//   A door's leaf is a thin box, cut the same way, and it has what holds it up: a handle and three hinges. Shoot out the handle and
//   the latch lets go and it swings open; shoot out all the hinges and nothing's holding it, and it falls (fallTrack: worked out once, in
//   full, so everyone and every replay sees the same fall). The host keeps the score (js/server.js doorHit).
//   Furniture, floors, ceilings, lintels and the wall round a window aren't cut: they keep their marks.
G.Damage = (() => {
  const T = THREE, N = 36, MAX = 900, BORE = 0.85, REACH = 0.17, THIN = 0.012; // (N: the points round a hole. MAX: holes in a level; after that, marks only. BORE: how wide it is past its mouth, as a share of its radius. REACH: how near a wall's end a hit breaks a piece off it. THIN: narrower than this, what's left between two holes has crumbled)
  const CRACK = (o) => Object.assign({ jag: 0.22, sy: 1, spikes: 5, reach: 5, r: 0.026, lining: 0x6c6a64 }, o);
  // what a hole is like in each material: r its radius (m) for a rifle round, how rough, how long up the grain, cracks or splinters
  const HOLE = {
    concrete: CRACK({}), cmu: CRACK({ r: 0.03, lining: 0x7a7870 }), brick: CRACK({ r: 0.03, lining: 0x7c4230 }), ceram: CRACK({ lining: 0xcfcdc6, r: 0.016 }), iron: CRACK({ r: 0.016, lining: 0x3a3a3c }),
    pine: { r: 0.03, jag: 0.42, sy: 1.7, spikes: 6, reach: 2.4, lining: 0xb89a68, grain: true, flap: { c: 0xd8bb82, l: 1.5, h: 0.9 } }, ply: { r: 0.03, jag: 0.45, sy: 1.5, spikes: 6, reach: 2.2, lining: 0xb89a68, grain: true, flap: { c: 0xd8bb82, l: 1.5, h: 0.9 } }, hardwood: { r: 0.028, jag: 0.4, sy: 1.7, spikes: 6, reach: 2.4, lining: 0x7e5430, grain: true, flap: { c: 0x9a6a3a, l: 1.5, h: 0.9 } },
    mdf: { r: 0.03, jag: 0.34, sy: 1, spikes: 0, reach: 1, lining: 0xa08458 }, gypsum: { r: 0.026, jag: 0.2, sy: 1, spikes: 2, reach: 2, lining: 0xcfcabc, flap: { c: 0xf0ece0, l: 0.8, h: 0.3 } },
    mild: { r: 0.016, jag: 0.14, sy: 1, spikes: 0, reach: 1, lining: 0x8a929a, metal: true, flap: { c: 0xaeb6be, m: 1, l: 1.3, h: 1, in: 1 } }, steel: { r: 0.014, jag: 0.14, sy: 1, spikes: 0, reach: 1, lining: 0x8a929a, metal: true, flap: { c: 0xaeb6be, m: 1, l: 1.3, h: 1, in: 1 } }, alu: { r: 0.018, jag: 0.18, sy: 1, spikes: 0, reach: 1, lining: 0xb8bec4, metal: true, flap: { c: 0xd4d8dc, m: 1, l: 1.5, h: 1, in: 1 } },
  };
  const rngOf = (s) => () => { s = (Math.imul(s, 1597334677) + 12345) | 0; return ((s ^ (s >>> 15)) >>> 0) / 4294967296; };
  const seedOf = (a) => (Math.round(a[0] * 997) * 31 + Math.round(a[1] * 991) * 17 + Math.round(a[2] * 983)) | 0;
  const radius = (m, J, cal) => { const h = HOLE[m]; return h ? h.r * G.U.clamp(Math.sqrt((J || 800) / 800), 0.7, 1.35) * G.U.clamp((cal || 8) / 8, 0.8, 1.3) : 0; };
  // a hole's outline: how far out it is at each of N angles (m), rough all round, with spikes that run out of it (cracks, splinters),
  // long up the grain
  function outline(seed, h, r, wide = 1) {
    const rnd = rngOf(seed), q = [], gr = h.grain;
    for (let i = 0; i < N; i++) q.push((1 - h.jag + rnd() * h.jag * 2) * wide);
    for (let k = 0; k < h.spikes; k++) {
      const i = gr ? Math.round((rnd() < 0.5 ? N / 4 : (3 * N) / 4) + (rnd() - 0.5) * 5) % N : Math.floor(rnd() * N), len = 1 + (h.reach - 1) * (0.4 + rnd() * 0.6);
      q[(i + N) % N] = len * wide;
    }
    return q.map((k, i) => { const a = (i / N) * Math.PI * 2; return k * r * Math.hypot(Math.cos(a), h.sy * Math.sin(a)); });
  }
  const ring = (rad, c) => rad.map((k, i) => { const a = (i / N) * Math.PI * 2; return [c[0] + Math.cos(a) * k, c[1] + Math.sin(a) * k]; });
  const nth = (a) => ((Math.round((a / (Math.PI * 2)) * N) % N) + N) % N;
  // A hole's shape: F.c its middle, F.rad its outline, F.core the same without the spikes (the bore's shape), F.max how far that reaches, F.pts its points
  let shapes = 0; // (every outline ever drawn has its own number: what a face was cut by: side, below)
  function shape(F, c, rad) {
    F.c = c; F.rad = rad; F.pts = ring(rad, c); F.v = (F.v || 0) + 1; F.drawn = ++shapes;
    F.core = rad.map((r, i) => Math.min(r, [-2, -1, 0, 1, 2].map((k) => rad[(i + k + N) % N]).sort((a, b) => a - b)[2]));
    F.max = Math.max(...F.core);
  }
  // is an outline at c2 near enough to fuse with this one? (nearly touching's enough: what's between two holes that close has nothing left to hold it)
  const touches = (F, c2, r) => { const dx = c2[0] - F.c[0], dy = c2[1] - F.c[1]; return Math.hypot(dx, dy) < F.core[nth(Math.atan2(dy, dx))] + r * 1.7; };
  // Two outlines become one: from a middle between them (the bigger counts for more), as far out as either goes at each angle. Nothing
  // of what was between them is left; a waist where they only just met is broken out to most of the width of the rest.
  function fuse(F, c2, rad2) {
    const A = F.rad.reduce((s, r) => s + r * r, 0), B = rad2.reduce((s, r) => s + r * r, 0), c = [(F.c[0] * A + c2[0] * B) / (A + B), (F.c[1] * A + c2[1] * B) / (A + B)], polys = [F.pts, ring(rad2, c2)], rad = [];
    for (let i = 0; i < N; i++) {
      const a = (i / N) * Math.PI * 2, dx = Math.cos(a), dy = Math.sin(a);
      let t = 0;
      for (const p of polys) for (let k = 0; k < p.length; k++) {
        const P = p[k], Q = p[(k + 1) % p.length], ex = Q[0] - P[0], ey = Q[1] - P[1], de = dx * ey - dy * ex;
        if (Math.abs(de) < 1e-12) continue;
        const wx = P[0] - c[0], wy = P[1] - c[1], tt = (wx * ey - wy * ex) / de, u = (wx * dy - wy * dx) / de;
        if (u >= 0 && u <= 1 && tt > t) t = tt;
      }
      rad.push(t);
    }
    const mid = [...rad].sort((a, b) => a - b)[N >> 1] * 0.6;
    shape(F, c, rad.map((r) => Math.max(r, mid)));
  }

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
      // (a strip too thin to stand has crumbled away: nothing's left hanging between two holes)
      const emit = (ea, eb) => { const a0 = Math.max(u0, lastA), b0 = Math.max(u0, lastB), a1 = Math.min(u1, ea), b1 = Math.min(u1, eb); if ((polys.length && a1 - a0 < THIN && b1 - b0 < THIN) || (a1 <= a0 && b1 <= b0)) return; quad(a0, Math.max(a0, a1), ya, b0, Math.max(b0, b1), yb); };
      for (const c of cuts) {
        const was = w === 0; w += c.w;
        if (was && w !== 0 && solid) { emit(c.a, c.b); solid = false; } else if (!was && w === 0) { lastA = c.a; lastB = c.b; solid = true; }
      }
      if (solid) emit(u1, u1);
    }
  }
  // the state of a level's damage (a map's: the host's has no meshes, only what rays need)
  const st = (map) => map.dmg || (map.dmg = { holes: [], bites: [], seen: new Set(), faces: new Map(), tiles: new Map(), mats: new Map(), falls: [] });
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
  // a hole's outline in the face with normal n, at a point in it, with its place in the world
  function inFace(fm, m, a, n, rad) {
    const ax = axisOf(n);
    if (ax < 0) return null;
    const F = { key: faceKey(fm, ax, Math.sign(n[ax]), a[ax]), ax, n, m, plane: a[ax] };
    place(F, ax === 0 ? [a[2], a[1]] : [a[0], a[1]], rad);
    return F;
  }
  function place(F, c, rad) { shape(F, c, rad); located(F); }
  const located = (F) => { F.a = F.ax === 0 ? [F.plane, F.c[1], F.c[0]] : [F.c[0], F.c[1], F.plane]; };
  const uvOf = (F, a) => (F.ax === 0 ? [a[2], a[1]] : [a[0], a[1]]);
  // a ring round a hole in the world: its outline, or (k < 1) its bore's, moved along the bore by `by`
  const ring3 = (F, k = 1, along = null, by = 0) => (k < 1 ? F.core : F.rad).map((v, i) => {
    const t = (i / N) * Math.PI * 2, u = Math.cos(t) * v * k, w = Math.sin(t) * v * k, p = new T.Vector3(F.a[0], F.a[1] + w, F.a[2]);
    if (F.ax === 0) p.z += u; else p.x += u;
    if (along) p.addScaledVector(along, by);
    return p;
  });
  const i0 = (q) => Math.round(q.c[0] * 500 + q.c[1] * 700);
  // the bore's lining, and its floor if it's blind
  function bore(H) {
    const pos = [], col = [], u = new T.Vector3(...H.u), F = H.fa, FB = H.fb, shallow = Math.min(0.02, H.len * 0.3);
    // (its mouth goes straight back, cracks and all, then in to the bore: nothing stands across the opening)
    const a0 = ring3(F), aD = ring3(F, 1, u, shallow), a1 = ring3(F, BORE, u, shallow), z1 = FB ? ring3(FB, BORE, u, -shallow) : ring3(F, BORE, u, H.len);
    strip(a0, aD, 0.72, 0.6, pos, col); strip(aD, a1, 0.6, 0.5, pos, col); strip(a1, z1, 0.5, FB ? 0.5 : 0.22, pos, col);
    if (FB) { const zD = ring3(FB, 1, u, -shallow); strip(z1, zD, 0.5, 0.6, pos, col); strip(zD, ring3(FB), 0.6, 0.72, pos, col); }
    else { const mid = z1.reduce((s, p) => s.add(p), new T.Vector3()).divideScalar(N); for (let i = 0; i < N; i++) { for (const p of [z1[i], z1[(i + 1) % N], mid]) { pos.push(p.x, p.y, p.z); col.push(0.18, 0.18, 0.18); } } }
    return { pos, col };
  }
  // What's torn up round the edge of a hole, following it whatever shape it's become (a ring of world points rim about a middle): a petal or a
  // splinter every other point, out from the edge and up off the surface (n), leaning the way the round was going (dir).
  // (Not at a crack: an edge that's there all the way along it.)
  function rimFlaps(rim, mid, n, dir, L, Hh, seed, rad, core) {
    const rnd = rngOf(seed), pos = [], col = [], tang = dir.clone().addScaledVector(n, -dir.dot(n)), a = new T.Vector3(), b = new T.Vector3(), o = new T.Vector3();
    const tri = (p, q, r, k) => { for (const v of [p, q, r]) { pos.push(v.x, v.y, v.z); col.push(k, k, k); } };
    for (let i = 0; i < N; i += 3) {
      const j = (i + 3) % N;
      if (rad[i] > core[i] * 1.15 || rad[j] > core[j] * 1.15) continue;
      const A = rim[i], B = rim[j], l = L * (0.5 + rnd() * 0.9), h = Hh * (0.5 + rnd() * 0.9), k = 0.72 + rnd() * 0.38;
      o.copy(a.copy(A).add(B).multiplyScalar(0.5)).sub(mid).normalize();
      a.copy(A).lerp(B, 0.5);
      const up = (u) => a.clone().addScaledVector(o, l * u).addScaledVector(n, h * u * u * (3 - 2 * u)).addScaledVector(tang, h * u * 0.9);
      const M1 = up(0.55), T1 = up(1), ml = A.clone().lerp(B, 0.2).add(M1.clone().sub(a).multiplyScalar(1)), mr = A.clone().lerp(B, 0.8).add(M1.clone().sub(a).multiplyScalar(1));
      tri(A, B, mr, k); tri(A, mr, ml, k); tri(ml, mr, T1, k * 0.9);
    }
    return { pos, col };
  }
  // the marks round a hole's edge (a face's, on its side of the wall): js/scars.js's, less anything it'd stand up: rimFlaps has that
  function marksOf(F, H, k) {
    const h = HOLE[F.m] || H.look, dir = new T.Vector3(...H.u), n = new T.Vector3(...F.n), o = { m: F.m, k, n: F.n, dir, J: H.J, stop: k === 'e' && !H.fb, cal: H.c, fit: F.max * 1.5 }, ua = F.ax === 0 ? 2 : 0, sd = (F.v * 31 + Math.round(F.a[1] * 500)) | 0;
    F.marks = G.Scars.plan(o).filter((c) => c.mat.map);
    F.flip = [Math.sign(dir.getComponent(ua)) || 1, sd & 1 ? 1 : -1];
    F.flap = !H.bite && h.flap && (k === 'x' || h.flap.in) ? { h: h.flap, geo: rimFlaps(ring3(F, 0.999), new T.Vector3(...F.a), k === 'x' ? n : n.clone().negate(), dir, H.R0 * h.flap.l, H.R0 * h.flap.h, sd, F.rad, F.core) } : null;
  }
  // A mark on a surface: only where there's surface. It's squared to the face and cut against every hole in it (faceTris) and the ends of the wall
  // (rect [u0, u1, v0, v1]), so it never lies across an opening or hangs in the air past an edge. c: a mark (js/scars.js plan), at (cu, cv) on the face;
  // flip: which way round its picture is; put(u, v): the point in the world; order: the winding that faces out.
  function clipInto(by, c, cu, cv, rect, polys, flip, put, n, order) {
    const w = c.s[0] / 2, h = c.s[1] / 2, tris = [], b = by.get(c.mat) || { pos: [], nor: [], uv: [] }, ua = c.geo.attributes.uv;
    let u0 = 1, u1 = 0, v0 = 1, v1 = 0;
    for (let i = 0; i < ua.count; i++) { u0 = Math.min(u0, ua.getX(i)); u1 = Math.max(u1, ua.getX(i)); v0 = Math.min(v0, ua.getY(i)); v1 = Math.max(v1, ua.getY(i)); }
    by.set(c.mat, b);
    faceTris(Math.max(rect[0], cu - w), Math.min(rect[1], cu + w), Math.max(rect[2], cv - h), Math.min(rect[3], cv + h), polys, tris);
    for (let t = 0; t < tris.length; t += 6) for (const m of order) {
      const u = tris[t + m], v = tris[t + m + 1];
      b.pos.push(...put(u, v)); b.nor.push(n[0], n[1], n[2]);
      b.uv.push(u0 + (((u - cu) / (2 * w)) * flip[0] + 0.5) * (u1 - u0), v0 + (((v - cv) / (2 * h)) * flip[1] + 0.5) * (v1 - v0));
    }
  }
  function markMeshes(by) {
    const out = [];
    for (const [mat, b] of by) {
      if (!b.pos.length) continue;
      const g = new T.BufferGeometry(); g.setAttribute('position', new T.Float32BufferAttribute(b.pos, 3)); g.setAttribute('normal', new T.Float32BufferAttribute(b.nor, 3)); g.setAttribute('uv', new T.Float32BufferAttribute(b.uv, 2));
      const m = new T.Mesh(g, mat); m.renderOrder = 1; m.userData.keepMat = true; out.push(m);
    }
    return out;
  }
  // how far a face's surface runs along the wall from a point on it: to the wall's ends (a doorway, a corner), a few tiles either way at most
  function spanOf(fm, F) {
    const TS = G.Level.TS, sg = Math.sign(F.n[F.ax]), back = Math.round(F.plane / TS) + (sg > 0 ? -1 : 0);
    const ok = (k) => { const x = F.ax === 0 ? back : k, z = F.ax === 0 ? k : back; return x >= 0 && z >= 0 && x < fm.W && z < fm.H && fm.t[z * fm.W + x] === 1; };
    let ut = Math.floor(F.c[0] / TS);
    if (!ok(ut)) ut = ok(ut - 1) ? ut - 1 : ok(ut + 1) ? ut + 1 : ut; // (a piece off a wall's end sits on the corner itself: the wall's the tile beside it)
    let lo = ut, hi = ut;
    while (lo > ut - 4 && ok(lo - 1)) lo--;
    while (hi < ut + 4 && ok(hi + 1)) hi++;
    const Y = fm.fy || 0;
    return [lo * TS, (hi + 1) * TS, Y, Y + G.Level.WALL_H];
  }
  // what's torn up, into a mesh a material
  function flapMeshes(faces, off) {
    const by = new Map(), out = [];
    for (const F of faces) { if (!F.flap) continue; const mat = G.Scars.flapMat(F.flap.h.c, !!F.flap.h.m), b = by.get(mat) || { pos: [], col: [] }; by.set(mat, b); for (const x of F.flap.geo.pos) b.pos.push(x); for (const x of F.flap.geo.col) b.col.push(x); }
    for (const [mat, b] of by) { const m = lined(b.pos, b.col, mat, off); m.userData.keepMat = true; out.push(m); }
    return out;
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
      tile.x = x; tile.z = z;
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
      const list = D.faces.get(faceKey(fm, ax, sg, c)) || [], was = tile.faces[`${ax}${sg}`], ver = list.map((f) => f.drawn).join(); // (only the face it hit has changed)
      let tris = was && was.n === ver ? was.tris : null;
      if (!tris) { tris = []; faceTris(a0, a1, v0, v1, list.map((f) => f.pts.map((p) => [p[0], p[1] - Y])), tris); tile.faces[`${ax}${sg}`] = { n: ver, tris }; }
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
    for (const H of tile.holes) { const c = H.look.lining, b = by.get(c) || { pos: [], col: [] }; by.set(c, b); const q = H.geo || (H.geo = H.bite ? biteGeo(H) : bore(H)); for (let n = 0; n < q.pos.length; n++) b.pos.push(q.pos[n]); for (let n = 0; n < q.col.length; n++) b.col.push(q.col[n]); }
    const off = new T.Vector3(0, -Y, 0);
    for (const [c, b] of by) tile.group.add(lined(b.pos, b.col, liningMat(map, c), off));
    // (what's round each hole, on this tile's account however far it reaches)
    const faces = tile.holes.flatMap((H) => [H.fa, H.fb]).filter(Boolean), marks = new Map();
    for (const F of faces) {
      const polys = (D.faces.get(F.key) || []).map((f) => f.pts), rect = spanOf(fm, F), sg = Math.sign(F.n[F.ax]), order = (F.ax === 2) === (sg > 0) ? [0, 2, 4] : [0, 4, 2];
      const put = F.ax === 0 ? (u, v) => [F.plane + sg * 0.004, v - Y, u] : (u, v) => [u, v - Y, F.plane + sg * 0.004];
      for (const c of F.marks || []) clipInto(marks, c, F.c[0], F.c[1], rect, polys, F.flip, put, F.n, order);
    }
    for (const q of [...markMeshes(marks), ...flapMeshes(faces, off)]) tile.group.add(q);
  }
  // every tile a hole touches: its outlines, and along its bore
  function touched(fm, H) {
    const TS = G.Level.TS, out = new Set(), add = (px, pz) => { const x = Math.floor(px / TS), z = Math.floor(pz / TS); if (x >= 0 && z >= 0 && x < fm.W && z < fm.H) out.add(z * fm.W + x); };
    for (const F of [H.fa, H.fb]) if (F) for (const p of F.pts) { const e = 1e-3; if (F.ax === 0) { add(F.a[0] + e, p[0]); add(F.a[0] - e, p[0]); } else { add(p[0], F.a[2] + e); add(p[0], F.a[2] - e); } }
    const r = H.r;
    for (let s = 0; s <= H.len + 0.05; s += 0.1) for (const [ox, oz] of [[0, 0], [r, 0], [-r, 0], [0, r], [0, -r]]) add(H.a[0] + H.u[0] * s + ox, H.a[2] + H.u[2] * s + oz);
    return out;
  }
  const hideFace = (D, F, H) => { if (F) { F.owner = H; const l = D.faces.get(F.key) || []; if (!l.includes(F)) l.push(F); D.faces.set(F.key, l); } };
  function redraw(map, fm, H) {
    const D = st(map);
    H.geo = null;
    hideFace(D, H.fa, H); hideFace(D, H.fb, H);
    if (!fm.wallMesh) return;
    marksOf(H.fa, H, 'e'); if (H.fb) marksOf(H.fb, H, 'x');
    const TS = G.Level.TS, ts = touched(fm, H), home = Math.floor((H.a[2] + H.u[2] * 0.01) / TS) * fm.W + Math.floor((H.a[0] + H.u[0] * 0.01) / TS);
    // (the bore's mesh lives with a tile that's really there: the one it went in by, or the first along it that is)
    let owner = null;
    for (const i of ts) { const t = tileOf(map, fm, i % fm.W, (i / fm.W) | 0); if (t && (!owner || i === home)) owner = t; }
    if (owner && H.home !== owner) { if (H.home) H.home.holes.splice(H.home.holes.indexOf(H), 1); H.home = owner; owner.holes.push(H); }
    const done = new Set();
    for (const i of ts) { tileMesh(map, fm, i % fm.W, (i / fm.W) | 0); done.add(D.tiles.get(`${fm.fl || 0}:${i}`)); }
    // (marks near it are cut against it too, wherever they're kept)
    for (const F of [H.fa, H.fb]) if (F) for (const f of D.faces.get(F.key) || []) { const t = f.owner && f.owner.home; if (t && !done.has(t) && Math.hypot(f.c[0] - F.c[0], f.c[1] - F.c[1]) < 1.5) { done.add(t); tileMesh(map, fm, t.x, t.z); } }
  }
  // the way a hole runs, once where it went in and came out have moved
  function aim(H) { if (!H.fb) return; const x = H.fb.a[0] - H.a[0], y = H.fb.a[1] - H.a[1], z = H.fb.a[2] - H.a[2]; H.len = Math.hypot(x, y, z); H.u = [x / H.len, y / H.len, z / H.len]; }
  // A hole that's grown till it's near others in the same face takes them in: one hole, whatever they were
  function absorb(map, fm, by) {
    const D = st(map), TS = G.Level.TS, stale = [];
    for (let again = true; again;) {
      again = false;
      for (const o of D.holes) {
        if (o === by || o.fa.key !== by.fa.key || !touches(by.fa, o.fa.c, o.fa.max)) continue;
        stale.push(...touched(fm, o));
        fuse(by.fa, o.fa.c, o.fa.rad); located(by.fa); by.a = by.fa.a;
        if (o.fb) { if (by.fb && by.fb.key === o.fb.key) { fuse(by.fb, o.fb.c, o.fb.rad); located(by.fb); } else if (!by.fb) by.fb = o.fb; }
        by.len = Math.max(by.len, o.len);
        D.holes.splice(D.holes.indexOf(o), 1);
        for (const F of [o.fa, o.fb]) if (F && F !== by.fb) { const l = D.faces.get(F.key) || [], i = l.indexOf(F); if (i >= 0) l.splice(i, 1); }
        if (o.home) o.home.holes.splice(o.home.holes.indexOf(o), 1);
        for (const s of o.solids || []) s.holes.splice(s.holes.indexOf(o), 1);
        again = true;
        break;
      }
    }
    aim(by); by.r = by.fa.max;
    onSolids(map, by); redraw(map, fm, by);
    if (fm.wallMesh) for (const i of new Set(stale)) tileMesh(map, fm, i % fm.W, (i / fm.W) | 0);
  }
  // ---------------------------------------------------------------- the ends of walls
  // A hit near where a wall ends (a door jamb, a corner) doesn't make a neat hole: the corner's brittle, with nothing beside it to hold it, and a
  // piece breaks off, into both faces. More hits along it take more, wider and deeper, the way a machine gun eats the end of a brick wall.
  // A bite's a wedge out of the corner: B.p the point on the corner, an outline in each face (fuse, as holes), and a rough fan of faces in from
  // them to the back of it, B.d in from each face; rays go into it as they do a bore.
  function edgeOf(fm, a, n) {
    const TS = G.Level.TS, ax = axisOf(n), ua = ax === 0 ? 2 : 0, c = a[ua], across = Math.floor((a[ax] - n[ax] * 0.02) / TS);
    for (const dir of [1, -1]) {
      const b = (dir > 0 ? Math.ceil(c / TS - 1e-6) : Math.floor(c / TS + 1e-6)) * TS;
      if (Math.abs(b - c) > REACH) continue;
      const along = Math.floor((b + dir * 0.01) / TS), x = ax === 0 ? across : along, z = ax === 0 ? along : across;
      if (x < 0 || z < 0 || x >= fm.W || z >= fm.H) continue;
      const v = fm.t[z * fm.W + x];
      if (v === 1 || (v === 3 && a[1] - (fm.fy || 0) > G.Level.DOOR_H)) continue;
      return { ua, b, dir };
    }
    return null;
  }
  const inBite = (B, x, y, z, pad = 0) => {
    const dx = x - B.p[0], dy = y - B.p[1], dz = z - B.p[2], a = dx * B.in1[0] + dz * B.in1[2], b = dx * B.in2[0] + dz * B.in2[2];
    return a > -0.03 - pad && b > -0.03 - pad && a + b < B.d * 1.1 + pad && Math.abs(dy) < Math.max(B.fa.max, B.fb.max) * (1 - G.U.clamp((a + b) / (B.d * 1.3), 0, 1)) + pad;
  };
  function biteGeo(B) {
    const pos = [], col = [], rnd = rngOf(seedOf(B.p)), apex = new T.Vector3(B.p[0] + (B.in1[0] + B.in2[0]) * B.d * 0.6, B.p[1], B.p[2] + (B.in1[2] + B.in2[2]) * B.d * 0.6);
    for (const F of [B.fa, B.fb]) {
      // (its outline, kept to the wall's side of the corner)
      const ownUp = F === B.fa ? B.dir : Math.sign(B.n1[B.ax]), lim = F === B.fa ? B.p[B.ua] : B.p[B.ax];
      const rim = F.pts.map(([u, v]) => { const k = ownUp > 0 ? Math.min(u, lim) : Math.max(u, lim); return F.ax === 0 ? new T.Vector3(F.plane, v, k) : new T.Vector3(k, v, F.plane); });
      const mid = rim.map((p) => p.clone().lerp(apex, 0.5).add(new T.Vector3((rnd() - 0.5) * B.d * 0.25, (rnd() - 0.5) * B.d * 0.25, (rnd() - 0.5) * B.d * 0.25)));
      strip(rim, mid, 0.74, 0.5, pos, col); strip(mid, rim.map(() => apex), 0.5, 0.3, pos, col);
    }
    return { pos, col };
  }
  function bite(map, fm, rec, e, look, R, seed, into) {
    const D = st(map), n = rec.n, ax = axisOf(n), p = into ? [into.p[0], rec.a[1], into.p[2]] : [...rec.a], n2 = [0, 0, 0]; if (!into) p[e.ua] = e.b; n2[e.ua] = e.dir;
    const rad = outline(seed, look, R * 1.9), rad2 = outline(seed + 3, look, R * 1.9);
    const near = (q, y) => Math.hypot(q.p[0] - p[0], q.p[2] - p[2]) < 0.02 && Math.abs(q.p[1] - y) < q.fa.max + R * 2.6;
    let B = into || D.bites.find((q) => near(q, p[1]));
    if (B) {
      fuse(B.fa, uvOf(B.fa, p), rad); located(B.fa); fuse(B.fb, uvOf(B.fb, p), rad2); located(B.fb);
      B.p[1] = B.fa.c[1]; B.d = Math.min(0.55, B.d + R * 0.9); B.J = Math.max(B.J, rec.J);
      // (grown into another along the same corner: one piece gone)
      for (let again = true; again;) {
        again = false;
        for (const q of D.bites) {
          if (q === B || !near(q, B.p[1])) continue;
          fuse(B.fa, q.fa.c, q.fa.rad); located(B.fa); fuse(B.fb, q.fb.c, q.fb.rad); located(B.fb); B.p[1] = B.fa.c[1]; B.d = Math.max(B.d, q.d);
          D.bites.splice(D.bites.indexOf(q), 1);
          for (const F of [q.fa, q.fb]) { const l = D.faces.get(F.key) || [], i = l.indexOf(F); if (i >= 0) l.splice(i, 1); }
          if (q.home) { q.home.holes.splice(q.home.holes.indexOf(q), 1); if (fm.wallMesh) tileMesh(map, fm, q.home.x, q.home.z); }
          for (const s of q.solids || []) s.holes.splice(s.holes.indexOf(q), 1);
          again = true; break;
        }
      }
      B.r = Math.max(B.fa.max, B.fb.max);
    } else {
      B = { bite: true, p, a: p, u: rec.u, len: 0, r: R * 1.9, R0: R, look, m: rec.m, J: rec.J, c: rec.c, d: R * 3, ua: e.ua, ax, dir: e.dir, n1: n, in1: [-n[0], 0, -n[2]], in2: [-n2[0], 0, -n2[2]] };
      B.fa = inFace(fm, rec.m, p, n, rad); B.fb = inFace(fm, rec.m, p, n2, rad2);
      D.bites.push(B);
    }
    B.a = B.p;
    biteSolids(map, B); redraw(map, fm, B);
    if (fm.wallMesh && map === G.Game.map && G.R.debris) G.R.debris.burst(new T.Vector3(...rec.a), { m: rec.m, k: 'e', n, J: rec.J * 3, dir: new T.Vector3(...rec.u) }); // (a piece of it, not a chip)
  }
  function biteSolids(map, B) {
    const w = map.world, x = B.p[0] + (B.in1[0] + B.in2[0]) * 0.05, y = B.p[1], z = B.p[2] + (B.in1[2] + B.in2[2]) * 0.05, k = B.d + 0.02;
    for (const s of B.solids || []) s.holes.splice(s.holes.indexOf(B), 1);
    B.solids = [];
    G.World.query(w, [x - k, y - k, z - k], [x + k, y + k, z + k], (s) => { if (s.kind === 'wall' && !s.edge && !s.win) { (s.holes = s.holes || []).push(B); B.solids.push(s); } });
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
    const F = H.fa, u = H.u, A = H.a;
    const inside = H.bite ? (t) => inBite(H, o[0] + d[0] * t, o[1] + d[1] * t, o[2] + d[2] * t) : (t) => {
      const x = o[0] + d[0] * t - A[0], y = o[1] + d[1] * t - A[1], z = o[2] + d[2] * t - A[2], s = x * u[0] + y * u[1] + z * u[2];
      if (s < -0.03 || s > H.len) return false;
      const px = x - u[0] * s, py = y - u[1] * s, pz = z - u[2] * s, h = F.ax === 0 ? pz : px, rr = F.core[nth(Math.atan2(py, h))] * BORE * 0.95;
      return h * h + py * py <= rr * rr;
    };
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
  function doorHole(d, p) { const q = onLeaf(d, p); return d.holes.some((h) => { const x = q[0] - h.c[0], y = q[1] - h.c[1]; return Math.hypot(x, y) <= h.core[nth(Math.atan2(y, x))] * 0.95; }); }
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
    // what's round each hole, on both faces of it, moving with the leaf
    for (const q of leaf.userData.marks || []) { q.removeFromParent(); q.geometry.dispose(); }
    const by = new Map(), faces = [], rect = [x0, x0 + w, 0, h];
    for (const q of d.holes) {
      const look = HOLE[q.m], dir = q.dirL, mid = new T.Vector3(q.c[0] - cx, q.c[1] - cy, 0), sg = dir.z > 0 ? -1 : 1, flip = [Math.sign(dir.x) || 1, 1]; // (sg: the side it came in by)
      for (const [side, k] of [[sg, 'e'], [-sg, 'x']]) {
        const n = [0, 0, side], put = (u, v) => [u - cx, v - cy, side * (t + 0.003)];
        for (const c of G.Scars.plan({ m: q.m, k, n, dir, J: q.J, cal: q.c0, fit: q.max * 1.5 }).filter((c) => c.mat.map)) clipInto(by, c, q.c[0], q.c[1], rect, polys, flip, put, n, side > 0 ? [0, 2, 4] : [0, 4, 2]);
        if (look.flap && (k === 'x' || look.flap.in)) { const rim = q.core.map((r, i) => { const a = (i / N) * Math.PI * 2; return new T.Vector3(mid.x + Math.cos(a) * r, mid.y + Math.sin(a) * r, side * t); }); faces.push({ flap: { h: look.flap, geo: rimFlaps(rim, mid.clone().setZ(side * t), new T.Vector3(0, 0, k === 'x' ? side : -side), dir, q.R0 * look.flap.l, q.R0 * look.flap.h, (q.v * 31 + i0(q)) | 0, q.rad, q.core) } }); }
      }
    }
    leaf.userData.marks = [...markMeshes(by), ...flapMeshes(faces)];
    for (const m of leaf.userData.marks) leaf.add(m);
  }

  // ---------------------------------------------------------------- a hit
  // A hit to record, or null. s: the solid; at: where it went in; u: the way it was going; n, the face's normal; r: js/ballistics.js crossSolid's
  // result; o: where the ray came from (the round's way out: o + u r.t); J, cal: its energy and width.
  function hit(map, s, at, u, n, r, o, J, cal) {
    if (r.ric || st(map).holes.length >= MAX) return null;
    const door = s.door && (s.kind === 'door' || s.kind === 'leaf') && s.glass == null, wall = s.kind === 'wall' && !s.edge && !s.win;
    if (!door && !wall) return null;
    if (wall ? !floorOf(map, at.y).wallMesh : !map.doorMeshes) return null; // (nothing here to cut)
    const h = HOLE[r.mat];
    if (!h || (door && !r.v) || (h.metal && !r.v)) return null; // (a round steel stops only dents it)
    const round3 = (v) => [+v.x.toFixed(4), +v.y.toFixed(4), +v.z.toFixed(4)], R = radius(r.mat, J, cal);
    const rec = { a: round3(at), u: round3(u), n, m: r.mat, J: Math.round(J), c: +cal.toFixed(1), d: r.v ? 0 : +(r.depth || 0.02).toFixed(3) };
    if (r.v) { rec.b = round3(o.clone().addScaledVector(u, r.t)); rec.nb = r.nOut; rec.mo = r.matOut; }
    rec.id = seedOf(rec.a) ^ (seedOf(rec.b || rec.u.map((x) => x * 40)) * 7);
    return { rec, r: R, rOut: (r.matOut && HOLE[r.matOut] ? radius(r.matOut, J, cal) : R) * 1.25 };
  }
  // A round's mark in a replay (its path's entry event e, and the exit that followed, if it did): the same record
  function ofEvent(e, x) {
    if (e.k !== 'e' || !HOLE[e.m] || !e.dir || (HOLE[e.m].metal && e.stop)) return null;
    const a = [e.p.x, e.p.y, e.p.z].map((v) => +v.toFixed(4)), u = [e.dir.x, e.dir.y, e.dir.z].map((v) => +v.toFixed(4)), rec = { a, u, n: e.n, m: e.m, J: e.J, c: e.cal || 8, d: e.stop ? e.depth || 0.03 : 0 };
    if (!e.stop && x) { rec.b = [x.p.x, x.p.y, x.p.z].map((v) => +v.toFixed(4)); rec.nb = x.n; rec.mo = x.m; }
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
      const piv = map.doorMeshes && map.doorMeshes[door.id], leaf = piv && piv.userData.leaf, dirL = new T.Vector3(...rec.u);
      if (leaf) dirL.applyQuaternion(leaf.getWorldQuaternion(new T.Quaternion()).invert());
      const rad = outline(seed, look, R), old = (door.holes = door.holes || []).find((h) => touches(h, q, R));
      let h = old;
      if (old) { fuse(old, q, rad); old.dirL = dirL; } else { h = { lining: look.lining, m: rec.m, J: rec.J, c0: rec.c, R0: R, dirL }; shape(h, q, rad); door.holes.push(h); }
      for (let again = true; again;) { again = false; for (const o of door.holes) if (o !== h && touches(h, o.c, o.max)) { fuse(h, o.c, o.rad); door.holes.splice(door.holes.indexOf(o), 1); again = true; break; } }
      leafMesh(map, door);
      return true;
    }
    if (!wall) return false;
    const fm = floorOf(map, a[1]), ax = axisOf(n), len = rec.b ? Math.hypot(rec.b[0] - a[0], rec.b[1] - a[1], rec.b[2] - a[2]) : rec.d, onFace = ax >= 0 ? faceKey(fm, ax, Math.sign(n[ax]), a[ax]) : null;
    // down a hole that's already there, to its floor: it goes deeper
    const deep = D.holes.find((H) => { const x = a[0] - H.a[0], y = a[1] - H.a[1], z = a[2] - H.a[2], s = x * H.u[0] + y * H.u[1] + z * H.u[2], r = H.fa.max * 1.1; return s > 0.02 && s < H.len + 0.05 && x * x + y * y + z * z - s * s < r * r; });
    if (deep) {
      const s = (a[0] - deep.a[0]) * deep.u[0] + (a[1] - deep.a[1]) * deep.u[1] + (a[2] - deep.a[2]) * deep.u[2];
      deep.len = Math.max(deep.len, s + len);
      if (rec.b && !deep.fb && axisOf(rec.nb) >= 0) deep.fb = inFace(fm, rec.mo || rec.m, rec.b, rec.nb, outline(seed + 5, deep.look, R, 1.3));
      onSolids(map, deep); redraw(map, fm, deep);
      return true;
    }
    if (ax < 0) return false;
    // into a piece already gone from a wall's end, or near enough the end to break one off (metal tears, it doesn't break)
    const B0 = D.bites.find((q) => inBite(q, a[0], a[1], a[2], 0.05));
    const e = B0 ? { ua: B0.ua, b: B0.p[B0.ua], dir: B0.dir } : !look.metal ? edgeOf(fm, a, n) : null;
    if (e) {
      bite(map, fm, B0 ? Object.assign({}, rec, { n: B0.n1 }) : rec, e, look, R, seed, B0);
      if (rec.b && axisOf(rec.nb) >= 0) apply(map, { a: rec.b, u: rec.u, n: rec.nb, m: rec.mo || rec.m, J: rec.J, c: rec.c, d: 0.03, id: rec.id + 1 }); // (the far side: what's blown out of it)
      return true;
    }
    // beside one: they're one hole now (not if it came out somewhere else altogether: that's another hole)
    const c = uvOf({ ax }, a), out = rec.b && axisOf(rec.nb) >= 0 ? rec.b : null, uvB = out && uvOf({ ax: axisOf(rec.nb) }, out);
    const by = D.holes.find((H) => H.fa.key === onFace && touches(H.fa, c, R) && (!out || !H.fb || H.fb.ax !== axisOf(rec.nb) || touches(H.fb, uvB, R * 3)));
    if (by) {
      fuse(by.fa, c, outline(seed, look, R)); located(by.fa); by.a = by.fa.a;
      if (out) { if (by.fb) { fuse(by.fb, uvB, outline(seed + 5, look, R, 1.3)); located(by.fb); } else by.fb = inFace(fm, rec.mo || rec.m, out, rec.nb, outline(seed + 5, look, R, 1.3)); }
      by.len = Math.max(by.len, len); by.J = Math.max(by.J, rec.J);
      absorb(map, fm, by);
      return true;
    }
    const H = { u: rec.u, len, r: R, R0: R, look, m: rec.m, J: rec.J, c: rec.c };
    H.fa = inFace(fm, rec.m, a, n, outline(seed, look, R)); H.a = H.fa.a;
    if (out) H.fb = inFace(fm, rec.mo || rec.m, out, rec.nb, outline(seed + 5, look, R, 1.3));
    D.holes.push(H);
    absorb(map, fm, H);
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
    D.holes = []; D.bites = []; D.seen = new Set(); D.faces = new Map(); D.tiles = new Map(); D.falls = [];
  }
  // what the level's own warmup needs to have compiled (js/render.js warmup): a hole's lining
  function warm(map) {
    const m = lined([0, 0, 0, 1, 0, 0, 0, 1, 0], [1, 1, 1, 1, 1, 1, 1, 1, 1], liningMat(map, HOLE.concrete.lining)), n = [0, 0, 1], out = [m];
    // (and the marks, the first time anything's cut)
    for (const [mm, k] of [['concrete', 'e'], ['pine', 'x'], ['mild', 'x']]) { const by = new Map(); for (const c of G.Scars.plan({ m: mm, k, n, dir: new T.Vector3(0, 0, 1), J: 800, cal: 8, fit: 0.03 }).filter((c) => c.mat.map)) clipInto(by, c, 0, 0, [-1, 1, -1, 1], [], [1, 1], (u, v) => [u, v, 0], n, [0, 2, 4]); out.push(...markMeshes(by)); const f = HOLE[mm].flap; if (f) out.push(lined([0, 0, 0, 1, 0, 0, 0, 1, 0], [1, 1, 1, 1, 1, 1, 1, 1, 1], G.Scars.flapMat(f.c, !!f.m))); }
    return out;
  }
  // ---------------------------------------------------------------- glass
  // A pane that's taken a round fractures, all of it, from where it was hit: cracks running out to the frame and rings across them, a crushed
  // white patch and a hole at the point of impact. It stays up, drawn over the pane, till something else breaks it (js/views.js crackGlass, breakGlass).
  function crack(pane, at) {
    if (!pane) return null;
    if (pane.userData.crack) return pane.userData.crack;
    const g = pane.geometry; if (!g.boundingBox) g.computeBoundingBox();
    const b = g.boundingBox, sx = b.max.x - b.min.x, sz = b.max.z - b.min.z, side = sx < sz && sx < 0.2, A = side ? sz : sx, H = b.max.y - b.min.y, l = pane.worldToLocal(at.clone()), lo = side ? b.min.z : b.min.x;
    const W = 512, Hp = Math.max(64, Math.min(1024, Math.round((W * H) / A))), cv = typeof document !== 'undefined' ? Object.assign(document.createElement('canvas'), { width: W, height: Hp }) : new OffscreenCanvas(W, Hp), c = cv.getContext('2d');
    const hx = G.U.clamp(((side ? l.z : l.x) - lo) / A, 0.02, 0.98) * W, hy = (1 - G.U.clamp((l.y - b.min.y) / H, 0.02, 0.98)) * Hp, rnd = rngOf(seedOf([at.x, at.y, at.z])), R = Math.hypot(W, Hp) * 1.1, n = 15 + Math.floor(rnd() * 6), arms = [];
    c.fillStyle = 'rgba(214,230,238,0.07)'; c.fillRect(0, 0, W, Hp);
    c.lineCap = 'round'; c.lineJoin = 'round';
    const pen = (w, col) => { c.lineWidth = w; c.strokeStyle = col; c.stroke(); };
    for (let i = 0; i < n; i++) {
      let a = (i / n) * Math.PI * 2 + (rnd() - 0.5) * 0.3, x = hx, y = hy, d = 0;
      const pts = [[x, y, 0]];
      while (d < R && x > -20 && y > -20 && x < W + 20 && y < Hp + 20) { const st = 14 + rnd() * 34; a += (rnd() - 0.5) * 0.28; x += Math.cos(a) * st; y += Math.sin(a) * st; d += st; pts.push([x, y, d]); }
      arms.push(pts);
      c.beginPath(); pts.forEach((p, k) => c[k ? 'lineTo' : 'moveTo'](p[0], p[1]));
      pen(2.4, 'rgba(30,40,46,0.28)'); pen(1.2, 'rgba(240,248,252,0.85)');
      // (and a branch off it, here and there)
      for (let k = 2; k < pts.length - 1; k++) if (rnd() < 0.16) {
        const dir = Math.atan2(pts[k][1] - pts[k - 1][1], pts[k][0] - pts[k - 1][0]) + (rnd() < 0.5 ? 0.6 : -0.6);
        c.beginPath(); c.moveTo(pts[k][0], pts[k][1]); c.lineTo(pts[k][0] + Math.cos(dir) * (26 + rnd() * 60), pts[k][1] + Math.sin(dir) * (26 + rnd() * 60)); pen(1, 'rgba(240,248,252,0.6)');
      }
    }
    // the rings: from arm to arm, nearer together toward the middle
    for (const r of [22, 46, 80, 130, 200, 300, 430]) {
      for (let i = 0; i < n; i++) {
        if (rnd() < 0.3 + r / 1400) continue;
        const near = (p) => p.reduce((q, s) => (Math.abs(s[2] - r) < Math.abs(q[2] - r) ? s : q), p[0]), a = near(arms[i]), z = near(arms[(i + 1) % n]);
        c.beginPath(); c.moveTo(a[0], a[1]); c.quadraticCurveTo((a[0] + z[0]) / 2 + (rnd() - 0.5) * 12, (a[1] + z[1]) / 2 + (rnd() - 0.5) * 12, z[0], z[1]); pen(1, 'rgba(236,246,250,0.62)');
      }
    }
    const gr = c.createRadialGradient(hx, hy, 2, hx, hy, 30); gr.addColorStop(0, 'rgba(255,255,255,0.95)'); gr.addColorStop(0.6, 'rgba(240,248,252,0.6)'); gr.addColorStop(1, 'rgba(240,248,252,0)');
    c.fillStyle = gr; c.beginPath(); c.arc(hx, hy, 30, 0, 7); c.fill();
    c.globalCompositeOperation = 'destination-out'; c.beginPath(); c.arc(hx, hy, 5, 0, 7); c.fill();
    const tex = new T.CanvasTexture(cv); if (T.sRGBEncoding) tex.encoding = T.sRGBEncoding;
    const m = new T.Mesh(new T.PlaneGeometry(A, H), new T.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, side: T.DoubleSide }));
    m.position.set((b.min.x + b.max.x) / 2, (b.min.y + b.max.y) / 2, (b.min.z + b.max.z) / 2); if (side) m.rotation.y = Math.PI / 2;
    m.renderOrder = 3; pane.add(m); pane.userData.crack = m;
    return m;
  }
  return { crack, HOLE, PARTS, HINGES, radius, hit, ofEvent, apply, clear, doorHole, onLeaf, partAt, fall, fallTrack, leafPose, setPose, partGone, update, reset, seenThrough, warm };
})();
