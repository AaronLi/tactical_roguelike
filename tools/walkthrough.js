// Walkthrough recorder: a camera walk through the level that's loaded, rendered frame by frame (so it doesn't matter how
// fast the machine draws, or whether the window's even shown), and the place's ambience rendered offline along the
// same walk (G.Ambience.renderWalk: the indoor/outdoor mix and the level's sound sources follow the camera). Frames and
// the soundtrack are POSTed to a receiver (any server that writes the request body to ?name=&file=); ffmpeg joins them.
// Load it into a level opened with the debug start (?mute&play=<place>&nofoes): then
//   const w = Walk.plan({ metres: 70 }); await Walk.record(w, { name: 'foundry', post: 'http://localhost:8199/' })
(() => {
  const TS = () => G.Level.TS;
  /** a floor's walkable tiles (the one you stand on: a basement can be floor 0), and how far each is from the nearest wall (in tiles), so the walk keeps to the middle */
  function grid(map, f = map.floors ? G.Level.floorAt(map, G.Me.pos.x, G.Me.pos.y, G.Me.pos.z) : 0) {
    const fm = G.Level.floorMap(map, f), { W, H } = map, t = fm.t, N = W * H;
    const walk = new Uint8Array(N), clr = new Int16Array(N).fill(-1), q = [];
    for (let i = 0; i < N; i++) {
      const x = i % W, z = (i / W) | 0;
      walk[i] = (t[i] === 0 || t[i] === 3) && !(map.props && map.props.has && map.props.has(i) && map.props.get(i).boxes && map.props.get(i).boxes.some((b) => b.h > 0.6)) ? 1 : 0;
      if (!walk[i] || x === 0 || z === 0 || x === W - 1 || z === H - 1) { clr[i] = 0; q.push(i); }
    }
    for (let h = 0; h < q.length; h++) {
      const i = q[h], x = i % W, z = (i / W) | 0;
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, nz = z + dz, j = nz * W + nx;
        if (nx < 0 || nz < 0 || nx >= W || nz >= H || clr[j] >= 0) continue;
        clr[j] = clr[i] + 1; q.push(j);
      }
    }
    return { W, H, walk, clr, fm, fy: fm.fy || 0 };
  }
  /** cheapest walk from tile a to tile b (Dijkstra; tiles near walls cost more, so it takes the middle of rooms and doorways) */
  function route(g, a, b) {
    const isB = typeof b === 'function' ? b : (i) => i === b; // (a tile, or the first tile that passes a test)
    const { W, H, walk, clr } = g, N = W * H, cost = new Float64Array(N).fill(Infinity), from = new Int32Array(N).fill(-1);
    const heap = [[0, a]]; cost[a] = 0;
    const push = (c, i) => { heap.push([c, i]); let k = heap.length - 1; while (k > 0) { const p = (k - 1) >> 1; if (heap[p][0] <= heap[k][0]) break; [heap[p], heap[k]] = [heap[k], heap[p]]; k = p; } };
    const pop = () => { const top = heap[0], last = heap.pop(); if (heap.length) { heap[0] = last; let k = 0; for (;;) { const l = 2 * k + 1, r = l + 1; let m = k; if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r < heap.length && heap[r][0] < heap[m][0]) m = r; if (m === k) break; [heap[m], heap[k]] = [heap[k], heap[m]]; k = m; } } return top; };
    while (heap.length) {
      const [c, i] = pop();
      if (isB(i)) { b = i; break; }
      if (c > cost[i]) continue;
      const x = i % W, z = (i / W) | 0;
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]) {
        const nx = x + dx, nz = z + dz, j = nz * W + nx;
        if (nx < 0 || nz < 0 || nx >= W || nz >= H || !walk[j]) continue;
        if (dx && dz && (!walk[z * W + nx] || !walk[nz * W + x])) continue; // (no cutting a wall's corner)
        const nc = c + (dx && dz ? 1.414 : 1) * (1 + 6 / (1 + clr[j] * clr[j]));
        if (nc < cost[j]) { cost[j] = nc; from[j] = i; push(nc, j); }
      }
    }
    if (typeof b === 'function' || !isFinite(cost[b])) return null;
    const out = []; for (let i = b; i >= 0; i = from[i]) { out.push(i); if (i === a) break; }
    return out.reverse();
  }
  const tileAt = (g, x, z) => Math.floor(z / TS()) * g.W + Math.floor(x / TS());
  /** the walk: from where you stand into the nearest buildings, through a few of their rooms (the ones with something to
   *  hear first: a furnace, a freezer, a stage...), and back out; then smoothed and spaced at walking pace */
  function plan(o = {}) {
    const map = G.Game.map, g = o.floor != null ? grid(map, o.floor) : grid(map), metres = o.metres || 70, speed = o.speed || 1.45;
    let start = o.from ? tileAt(g, o.from[0], o.from[1]) : tileAt(g, G.Me.pos.x, G.Me.pos.z);
    if (o.floor != null && !o.from) { // (another floor than yours, the street under a roof you landed on: start outside, near the building)
      const ins = (g.fm.rooms || []).filter((r) => !r.out).map((r) => [r.cx, r.cz]); let bd = Infinity;
      for (let i = 0; i < g.W * g.H; i++) if (g.fm.out && g.fm.out[i] && g.walk[i] && g.clr[i] > 2) { const x = i % g.W, z = (i / g.W) | 0, d = Math.min(...ins.map(([a, b]) => Math.hypot(a - x, b - z))); if (d < bd) { bd = d; start = i; } }
    }
    if (!g.walk[start]) { // (a floor with no open air of its own, a block's storeys: start in its first room you can stand in)
      const r = (g.fm.rooms || []).find((q) => g.walk[q.cz * g.W + q.cx] && g.clr[q.cz * g.W + q.cx] > 1); if (r) start = r.cz * g.W + r.cx;
    }
    const loud = new Set(['melt', 'freezer', 'kitchen', 'kitchenette', 'mcc', 'control', 'stage', 'mart', 'store', 'aisle', 'cashier']);
    const rooms = (g.fm.rooms || map.rooms).filter((r) => !r.out || r.type === 'stage').map((r) => ({ r, i: r.cz * g.W + r.cx }))
      .filter((p) => g.walk[p.i] || p.r.out);
    let at = start, tiles = [start];
    const seen = new Set(), fm0 = g.fm;
    // (the walk starts a few metres short of the first doorway: the way there from the helicopter's pad is skipped)
    const lead = () => { const k = tiles.findIndex((i) => fm0.out && !fm0.out[i]); return k < 0 ? 0 : Math.max(0, k - Math.round((o.approach || 9) / TS())); };
    const len = () => (tiles.length - lead()) * TS();
    while (len() < metres * 0.6 && rooms.length) {
      // the next room: near, and better if it's a loud one or of a type not yet visited
      let best = null, bestS = Infinity, bestR = null;
      for (const p of rooms) {
        if (seen.has(p.r)) continue;
        const d = Math.hypot((p.i % g.W) - (at % g.W), ((p.i / g.W) | 0) - ((at / g.W) | 0)) * TS();
        const s = d * (loud.has(p.r.type) ? 0.4 : 1) * ([...seen].some((q) => q.type === p.r.type) ? 2 : 1) * (o.prefer && o.prefer.includes(p.r.type) ? 0.02 : 1);
        if (s < bestS && d > 3) { bestS = s; best = p; }
      }
      if (!best) break;
      seen.add(best.r);
      // (into the room a little way: a few metres past its door, not all the way to the middle of a big hall)
      const R = best.r, m = R.out ? -5 : Math.max(0, Math.min(4, Math.floor(Math.min(R.w, R.h) / 2) - 1)); // (an open-air one like a stage: up to it, in front)
      const r = o.deep ? route(g, at, (i) => Math.hypot((i % g.W) - R.cx, ((i / g.W) | 0) - R.cz) < 3 && g.clr[i] > 1) // (o.deep: to the middle, a big hall's)
        : route(g, at, (i) => { const x = i % g.W, z = (i / g.W) | 0; return x >= R.x + m && x < R.x + R.w - m && z >= R.z + m && z < R.z + R.h - m && g.clr[i] > 1; });
      if (!r) continue;
      tiles.push(...r.slice(1)); at = r[r.length - 1];
    }
    // and back outside (the nearest open air), so the walk hears the change both ways
    if (o.out !== false) {
      // (the nearest open air, by the way there, well clear of the walls, and o.tail metres on from where the walk came in: a stretch outside to end on)
      const fm = g.fm, ax = at % g.W, az = (at / g.W) | 0, tail = (o.tail || 8) / TS();
      const r = fm.out && (route(g, at, (i) => fm.out[i] && g.clr[i] > 3 && Math.hypot((i % g.W) - ax, ((i / g.W) | 0) - az) > tail) || route(g, at, (i) => fm.out[i] && g.clr[i] > 3));
      if (r) tiles.push(...r.slice(1));
    }
    // to points, smoothed (Chaikin, twice), then at an even walking pace
    let pts = tiles.slice(lead()).map((i) => [((i % g.W) + 0.5) * TS(), (((i / g.W) | 0) + 0.5) * TS()]);
    for (let k = 0; k < 3; k++) { const n = [pts[0]]; for (let i = 0; i < pts.length - 1; i++) { const [a, b] = [pts[i], pts[i + 1]]; n.push([a[0] * 0.75 + b[0] * 0.25, a[1] * 0.75 + b[1] * 0.25], [a[0] * 0.25 + b[0] * 0.75, a[1] * 0.25 + b[1] * 0.75]); } n.push(pts[pts.length - 1]); pts = n; }
    const cum = [0]; for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
    const skip = o.skip || 0; // (metres of the walk left out at its start)
    const total = Math.min(cum[cum.length - 1] - skip, metres * 1.5), at_ = (s0) => { const s = s0 + skip; let i = cum.findIndex((c) => c >= s); if (i <= 0) return pts[Math.max(0, i)]; const k = (s - cum[i - 1]) / (cum[i] - cum[i - 1] || 1); return [pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * k, pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * k]; };
    return { at: at_, total, speed, secs: total / speed + 2, rooms: [...seen].map((r) => r.type), fy: g.fy };
  }
  /** the camera at time t on the walk: eye height, a gentle step bob, looking a little way ahead (turning smoothly) */
  function poseFn(w) {
    let yaw = null;
    return (t) => {
      const s = Math.min(w.total, Math.max(0, (t - 1) * w.speed)), [x, z] = w.at(s), [ax, az] = w.at(Math.min(w.total, s + 3));
      const want = Math.hypot(ax - x, az - z) > 0.05 ? Math.atan2(-(ax - x), -(az - z)) : yaw || 0;
      if (yaw == null) yaw = want;
      let d = want - yaw; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI;
      yaw += d * 0.06;
      const moving = t > 1 && s < w.total, bob = moving ? Math.sin(t * 2 * Math.PI * 1.7) * 0.02 : 0;
      return { x, y: (w.fy || 0) + 1.62 + bob, z, yaw, pitch: -0.03 + (moving ? Math.sin(t * Math.PI * 1.7) * 0.004 : 0) };
    };
  }
  async function wav(buf) {
    const n = buf.length, ch = buf.numberOfChannels, out = new DataView(new ArrayBuffer(44 + n * ch * 2)), w = (o, s) => [...s].forEach((c, i) => out.setUint8(o + i, c.charCodeAt(0)));
    w(0, 'RIFF'); out.setUint32(4, 36 + n * ch * 2, true); w(8, 'WAVEfmt '); out.setUint32(16, 16, true); out.setUint16(20, 1, true); out.setUint16(22, ch, true);
    out.setUint32(24, buf.sampleRate, true); out.setUint32(28, buf.sampleRate * ch * 2, true); out.setUint16(32, ch * 2, true); out.setUint16(34, 16, true); w(36, 'data'); out.setUint32(40, n * ch * 2, true);
    const d = [...Array(ch)].map((_, c) => buf.getChannelData(c));
    for (let i = 0, o = 44; i < n; i++) for (let c = 0; c < ch; c++, o += 2) out.setInt16(o, Math.max(-1, Math.min(1, d[c][i])) * 32767, true);
    return new Blob([out.buffer], { type: 'audio/wav' });
  }
  /** the walk's gunshots: three bursts of yours (at a quarter, half and three quarters of the way), and another gun's
   *  pairs every ~7 s from the indoor zone 15-35 m off the middle of the walk; their renders made (and waited for) first */
  async function planShots(map, w, track, dt, so) {
    const GA = G.GunAudio, mine = (so.mine || (G.Me.cur && G.Me.cur() && (G.Me.cur().def.soundKey || G.Me.cur().def.id)) || 'p9'), theirs = so.theirs || 'ak';
    const out = [], T = w.secs;
    for (const f of [0.25, 0.5, 0.75]) for (let k = 0; k < (so.burst || 3); k++) out.push({ t: T * f + k * 0.28, x: 0, y: 0, z: 0, id: mine, own: true });
    const mid = track[Math.floor(track.length / 2)], d = G.Acoustics.of(map);
    const zs = d.zones.filter((z) => !z.out).map((z) => ({ z, r: Math.hypot(z.cx - mid.x, z.cz - mid.z) })).filter((q) => q.r > 15 && q.r < 35).sort((a, b) => b.z.area - a.z.area);
    const far = zs[0] && zs[0].z;
    if (far) for (let t = 3; t < T - 1; t += 6 + Math.random() * 3) for (let k = 0; k < 2; k++) out.push({ t: t + k * 0.18, x: far.cx, y: far.y, z: far.cz, id: theirs });
    // their renders: dry, and each shooter's room's
    const ids = [...new Set(out.map((s) => s.id))];
    for (const id of ids) GA.buildDry(id, true);
    for (const s of out) { const i = Math.min(track.length - 1, Math.round(s.t / dt)), p = s.own ? track[i] : s; GA.build(s.id, GA.roomSig(map, p.x, p.z, GA.floorY(map, p)), true); }
    for (let k = 0; k < 120 && (GA.pending.size || GA.queue.length || GA.busy || ids.some((id) => !GA.dry.has(id))); k++) await new Promise((r) => setTimeout(r, 250));
    return out;
  }
  /** record: the soundtrack first (offline), then every frame; o.name, o.post (the receiver), o.fps, o.w, o.h, o.gain (the soundtrack's level) */
  async function record(w, o) {
    const fps = o.fps || 30, W = o.w || 1280, H = o.h || 720, map = G.Game.map, pose = poseFn(w), n = Math.ceil(w.secs * fps);
    const post = (file, body) => fetch(`${o.post}?name=${o.name}&file=${file}`, { method: 'POST', body });
    window.requestAnimationFrame = () => 0; // (the game's own loop stops: the frames are stepped here)
    // the doors: each shut till the walk comes within 3 m of it (swung open by the time it's in the doorway), then open (in the picture and in the sound alike);
    // o.doors 'open' opens them all from the start
    const doorT = new Map();
    { const p2 = poseFn(w); for (let t = 0; t < w.secs; t += 0.05) { const p = p2(t); for (const d of map.doors || []) if (!doorT.has(d) && Math.hypot(d.x - p.x, d.z - p.z) < 3 && Math.abs(p.y - 1.62 - (d.fy || 0)) < 2) doorT.set(d, Math.max(0, t - 0.3)); } }
    const doorsAt = (t) => { let ch = false; for (const d of map.doors || []) { const open = o.doors === 'open' || (doorT.has(d) && t >= doorT.get(d)); if (d.open !== open) { d.open = open; ch = true; } } if (ch) map.doorVer = (map.doorVer || 0) + 1; };
    // the soundtrack: the walk's poses every 50 ms
    const dt = 0.05, track = []; { const p2 = poseFn(w); for (let t = 0; t < w.secs; t += dt) track.push(p2(t)); }
    // gunshots (o.shots): yours, a few bursts along the walk; and someone else's, from a room off the route, now and then
    const shots = o.shots ? await planShots(map, w, track, dt, o.shots) : [];
    const buf = await G.Ambience.renderWalk(map, track, dt, undefined, shots, doorsAt);
    doorsAt(0);
    if (o.gain && o.gain !== 1) for (let c = 0; c < buf.numberOfChannels; c++) { const d = buf.getChannelData(c); for (let i = 0; i < d.length; i++) d[i] *= o.gain; }
    await post('audio.wav', await wav(buf));
    // the picture: doors open, the gun out of the shot, the camera on the walk
    const R = G.R, r = R.renderer, cam = R.camera;
    G.Game.updateDoors(5);
    r.setPixelRatio(1); r.setSize(W, H, false); cam.aspect = W / H; cam.updateProjectionMatrix();
    if (R.vmScene) R.vmScene.visible = false; // (the gun in hand, and its flash, out of the picture: just the place)
    cam.rotation.order = 'YXZ';
    for (let i = 0; i < n; i++) {
      const p = pose(i / fps);
      cam.position.set(p.x, p.y, p.z); cam.rotation.set(p.pitch, p.yaw, 0);
      doorsAt(i / fps); G.Game.updateDoors(1 / fps);
      R.update(1 / fps);
      R.render();
      // (toDataURL, not toBlob: it encodes there and then, where toBlob's queued, and a page in the background gets to it a second later)
      const u = r.domElement.toDataURL('image/jpeg', 0.9), bin = Uint8Array.from(atob(u.slice(u.indexOf(',') + 1)), (c) => c.charCodeAt(0));
      await post('f' + String(i).padStart(5, '0') + '.jpg', bin);
      if (o.progress) o.progress(i, n);
    }
    return { frames: n, secs: w.secs, rooms: w.rooms };
  }
  window.Walk = { plan, record, grid, route };
})();
