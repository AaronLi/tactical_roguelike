'use strict';
// The helicopter that brings the squad in. Every level has a pad (G.Level.landing: map.lz), and you ride in on the same
// dropship you boarded at the hangar (js/hangar.ts ship): out of the distance, once round the site, spiralling in, a hover
// over the pad, the turn onto its heading, down. Then hold F to get out. It waits a little, lifts off and flies away; anyone
// still aboard then is put out on the pad.
// All of it's for show: officers stay in their seats on the pad as far as the host and everyone's rays are concerned (so
// nobody can be seen or shot on the way in), and the ride is a transform on the camera. Each machine runs it from when its
// own veil lifts.
// The flight is worked out once, as a real thing's would be: a path, the speed along it limited by how hard it can brake and
// bank, and from how that moves, the attitude: the rotors' thrust has to hold it up (g), push it where it's accelerating and
// overcome the drag, so the ship leans that way: nose down at speed, over in a turn, nose up in the flare.
G.Landing = (() => {
  const T = THREE, STAY = 14, // the longest it sits on the pad, in seconds
    AFTER = 2.5, // (flying alone: how soon after you're out it goes)
    HOLD = 0.45, GONE = 9;
  const GRAV = 9.8, BANK = 35 * Math.PI / 180, CRUISE = 38, BRAKE = 2.4, ACCEL = 2.4, DRAG = 0.09, HZ = 20, HOVER = 5.5, LEAN = 0.62; // (LEAN: the most it tilts, 35 degrees)
  const S = { root: null, ship: null, cloud: null, lz: null, map: null, fly: null, ft: 0, t: 0, out: -1, up: -1, hold: 0, solids: [], fog: null, landed: false };

  const seatPos = (i) => { const h = G.Hangar.HELI, z = S.lz; return { x: z.x - 1.3 + i * 0.5, y: z.y + h.floor, z: z.z + 0.85, yaw: 0 }; };
  const exitPos = (i) => { const z = S.lz; return { x: z.x - 1.3 + i * 0.5, y: z.y, z: z.z - 2.6 }; };

  // The ground track, a point every half metre: a straight run in, tangent to a circle round the site, a turn round it,
  // then the same turn tightening, its centre sliding over to the pad, until it's there.
  function track(map) {
    const lz = map.lz, Wm = map.W * G.Level.TS, Hm = map.H * G.Level.TS, cx = Wm / 2, cz = Hm / 2;
    const r0 = G.U.clamp(0.42 * Math.max(Wm, Hm), 26, 48), turn = 1.4 * Math.PI, spiral = Math.PI, dir = (map.seed & 1) ? 1 : -1;
    const a0 = Math.atan2(lz.z - cz, lz.x - cx) + dir * 0.6, pts = [], step = 0.5 / r0;
    const tx = -Math.sin(a0) * dir, tz = Math.cos(a0) * dir, sx = cx + Math.cos(a0) * r0, sz = cz + Math.sin(a0) * r0;
    for (let d = 120; d > 0; d -= 0.5) pts.push([sx - tx * d, sz - tz * d]);
    const start = pts.length;
    for (let a = 0; a < turn + spiral; a += step) {
      const q = Math.max(0, (a - turn) / spiral), s = q * q * (3 - 2 * q), r = r0 * (1 - s), th = a0 + dir * a;
      pts.push([cx + (lz.x - cx) * s + Math.cos(th) * r, cz + (lz.z - cz) * s + Math.sin(th) * r]);
    }
    pts.push([lz.x, lz.z]);
    return { pts, start, r0 };
  }
  // The flight, HZ samples a second: { x, y, z, q } each, and how long it takes.
  function plan(map) {
    const { pts, start, r0 } = track(map), n = pts.length, lz = map.lz, ds = new Float32Array(n), v = new Float32Array(n);
    for (let i = 1; i < n; i++) ds[i] = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    const orbit = Math.min(24, Math.sqrt(r0 * GRAV * Math.tan(BANK)));
    // as fast as it may go: cruising in, the circle's speed, and as tight as the track turns, no more than BANK
    for (let i = 0; i < n; i++) {
      v[i] = i < start ? CRUISE : orbit;
      if (i > 8 && i < n - 8) {
        const [ax, az] = pts[i - 8], [bx, bz] = pts[i], [cx, cz] = pts[i + 8], a = Math.atan2(bz - az, bx - ax), b = Math.atan2(cz - bz, cx - bx), da = Math.abs(G.U.angDiff(a, b)), len = Math.hypot(cx - ax, cz - az) || 1;
        if (i >= start && da > 1e-4) v[i] = Math.min(v[i], Math.sqrt(GRAV * Math.tan(BANK) * len / da));
      }
    }
    v[n - 1] = 0.3;
    for (let i = n - 2; i >= 0; i--) v[i] = Math.min(v[i], Math.sqrt(v[i + 1] * v[i + 1] + 2 * BRAKE * ds[i + 1])); // (it has to be able to stop for what's ahead)
    for (let i = 1; i < n; i++) v[i] = Math.min(v[i], Math.sqrt(v[i - 1] * v[i - 1] + 2 * ACCEL * ds[i]));
    // along it in time; height from how far there's left to go, high enough to clear everything until it's near
    const top = Math.max(lz.y, 8.6) + 24 - lz.y, smp = [];
    let left = 0; const rest = new Float32Array(n); for (let i = n - 1; i > 0; i--) { left += ds[i]; rest[i - 1] = left; }
    const dt = 1 / HZ; let i = 0, f = 0;
    while (i < n - 1) {
      const h = Math.min(top, HOVER + rest[i] * 0.2);
      smp.push({ x: pts[i][0] + (pts[i + 1][0] - pts[i][0]) * f, z: pts[i][1] + (pts[i + 1][1] - pts[i][1]) * f, y: lz.y + h, q: null });
      let go = Math.max(0.3, v[i]) * dt;
      while (i < n - 1 && go > 0) { const room = ds[i + 1] * (1 - f); if (go < room) { f += go / ds[i + 1]; go = 0; } else { go -= room; i++; f = 0; } }
    }
    const arrive = smp.length;
    // (the hover, turning onto the pad's heading, then down, slowing as the ground comes up)
    for (let k = 0; k < 1.4 * HZ; k++) smp.push({ x: lz.x, z: lz.z, y: lz.y + HOVER, q: null });
    for (let k = 1; k <= 3.2 * HZ; k++) { const u = k / (3.2 * HZ); smp.push({ x: lz.x, z: lz.z, y: lz.y + HOVER * (1 - u * u * (3 - 2 * u)), q: null }); }
    // (the smoothing a heavy thing's own inertia does)
    const N = smp.length, ease = (key, w) => { const a = smp.map((s) => s[key]); for (let j = 0; j < arrive; j++) { let sum = 0, c = 0; for (let m = -w; m <= w; m++) { const o = a[j + m]; if (o != null) { sum += o; c++; } } smp[j][key] = sum / c; } };
    ease('y', HZ);
    // attitude: yaw along the way it's going, held once it's slow; the thrust's lean on top
    const up = new T.Vector3(0, 1, 0), nv = new T.Vector3(), qa = new T.Quaternion(), qy = new T.Quaternion(), W = Math.round(0.5 * HZ);
    const vel = (j) => { const i0 = G.U.clamp(j - W, 0, N - 2), i1 = G.U.clamp(j + W, i0 + 1, N - 1), a = smp[i0], b = smp[i1], s = (i1 - i0) * dt; return [(b.x - a.x) / s, (b.y - a.y) / s, (b.z - a.z) / s]; };
    let yaw = null;
    for (let j = 0; j < N; j++) {
      const [vx, vy, vz] = vel(j), j0 = Math.max(W, j - W), j1 = Math.min(N - 1 - W, j + W), [ax0, ay0, az0] = vel(j0), [ax1, ay1, az1] = vel(j1), s = Math.max(1, j1 - j0) * dt, sp = Math.hypot(vx, vz);
      const want = j >= arrive ? 0 : sp > 3 ? Math.atan2(vz, -vx) : yaw; // (the ship's nose is -x)
      if (yaw == null) yaw = want;
      yaw += G.U.clamp(G.U.angDiff(yaw, want) * (j >= arrive ? 1 : 0.12), -1.1 * dt, 1.1 * dt); // (no faster than it can turn: slow, the nose lags the way it's drifting; in the hover, a pedal turn)
      nv.set((ax1 - ax0) / s + vx * DRAG, GRAV + (ay1 - ay0) / s + vy * DRAG, (az1 - az0) / s + vz * DRAG).normalize();
      const tilt = Math.acos(G.U.clamp(nv.y, -1, 1));
      if (tilt > LEAN) { const h = Math.sin(LEAN) / Math.hypot(nv.x, nv.z); nv.set(nv.x * h, Math.cos(LEAN), nv.z * h); }
      qa.setFromUnitVectors(up, nv); qy.setFromAxisAngle(up, yaw);
      smp[j].q = qa.clone().multiply(qy);
    }
    smp[N - 1].q = new T.Quaternion();
    return { smp, N, dur: (N - 1) / HZ, arrive };
  }
  const _q = new T.Quaternion(), _p = new T.Vector3(), _c = new T.Vector3();
  // where the ship is, ft seconds into the flight
  function pose(ft) {
    const F = S.fly, u = Math.min(F.N - 1.001, ft * HZ), i = Math.floor(u), f = u - i, a = F.smp[i], b = F.smp[i + 1];
    _p.set(a.x + (b.x - a.x) * f, a.y + (b.y - a.y) * f, a.z + (b.z - a.z) * f); _q.copy(a.q).slerp(b.q, f);
    const g = S.ship.group; g.position.copy(_p); g.quaternion.copy(_q);
  }
  // what the seat sees: the camera's where it'd be on the pad, carried along with the ship
  function ride() {
    const cam = G.R.camera, lz = S.lz;
    _c.set(cam.position.x - lz.x, cam.position.y - lz.y, cam.position.z - lz.z).applyQuaternion(_q).add(_p);
    cam.position.copy(_c); cam.quaternion.premultiply(_q); cam.updateMatrixWorld();
  }
  // the air's clearer from up there (the theme's fog's for rooms and streets), coming back as you come down
  function air(k) {
    const f = G.R.scene.fog, b = S.fog;
    if (!b || b[1] > 300) return;
    f.near = b[0] + (90 - b[0]) * k; f.far = b[1] + (320 - b[1]) * k;
  }
  // (and as far as the clouds, while you're up there)
  function reach(far) { const c = G.R.camera; if (c.far !== far) { c.far = far; c.updateProjectionMatrix(); } }

  // What's round the level, seen from the air (from the ground, past the fences, dark shapes at most): streets, and blocks
  // with a few windows lit, from the level's seed. Nothing to hit or see from: not in the world.
  function town(root, map) {
    const r = G.U.rng((map.seed ^ 0x70e4a) >>> 0), Wm = map.W * G.Level.TS, Hm = map.H * G.Level.TS, CELL = 38, R = 300, spots = [];
    const tex = (w, h, draw) => { const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h); const t = new T.CanvasTexture(c); t.wrapS = t.wrapT = T.RepeatWrapping; return t; };
    const ground = tex(256, 256, (g, w) => {
      g.fillStyle = '#0d0f11'; g.fillRect(0, 0, w, w); g.fillStyle = '#17191c'; g.fillRect(0, 0, w, 44); g.fillRect(0, 0, 44, w);
      g.fillStyle = '#b89a5a'; for (let i = 60; i < w; i += 64) { g.fillRect(i, 40, 4, 4); g.fillRect(40, i, 4, 4); } // (street lamps)
    });
    // (a frame round the level, a little way in under its edges: never under it, where a basement's stairs go down through it.
    // A mountain top has none: what's round it is the mountain, js/level.ts buildCrest)
    const gm = new T.MeshBasicMaterial({ map: ground }), RIM = 1, wild = !!map.crest;
    if (!wild) for (const [x0, z0, x1, z1] of [[-R, -R, Wm + R, RIM], [-R, Hm - RIM, Wm + R, Hm + R], [-R, RIM, RIM, Hm - RIM], [Wm - RIM, RIM, Wm + R, Hm - RIM]]) {
      const g = new T.PlaneGeometry(x1 - x0, z1 - z0), p = g.attributes.position, uv = g.attributes.uv;
      g.rotateX(-Math.PI / 2); g.translate((x0 + x1) / 2, -0.4, (z0 + z1) / 2);
      for (let i = 0; i < p.count; i++) uv.setXY(i, p.getX(i) / CELL, p.getZ(i) / CELL); // (the streets run on from one side to the next)
      root.add(new T.Mesh(g, gm));
    }
    const face = tex(128, 128, (g, w) => {
      g.fillStyle = '#16181b'; g.fillRect(0, 0, w, w);
      for (let y = 6; y < w; y += 16) for (let x = 6; x < w; x += 14) { const u = r(); g.fillStyle = u < 0.14 ? '#d8b070' : u < 0.2 ? '#8aa0b8' : '#0c0d0f'; g.fillRect(x, y, 8, 9); }
    });
    if (!wild) for (let x = -R; x < Wm + R; x += CELL) for (let z = -R; z < Hm + R; z += CELL) {
      if (x > -CELL - 8 && x < Wm + 8 && z > -CELL - 8 && z < Hm + 8) continue; // (not on the level)
      if (r() > 0.15) spots.push([x + CELL / 2, z + CELL / 2]);
    }
    const mesh = new T.InstancedMesh(new T.BoxGeometry(1, 1, 1), [0, 1, 2, 3, 4, 5].map((i) => new T.MeshBasicMaterial(i === 2 || i === 3 ? { color: 0x15171a } : { map: face })), spots.length), m = new T.Matrix4();
    spots.forEach(([x, z], i) => { const w = 18 + r() * 12, d = 18 + r() * 12, h = 7 + r() * r() * 26; m.makeScale(w, h, d); m.setPosition(x, h / 2 - 0.4, z); mesh.setMatrixAt(i, m); });
    root.add(mesh);
    // Cloud, for something to see go by when she banks and the door shows only sky: soft banks of it all round and overhead,
    // and scud out past the circle at about the height you're flying, close enough to slide past. It drifts on the wind.
    const puff = tex(128, 128, (g, w) => {
      for (let i = 0; i < 14; i++) { const a = r() * 6.3, d = r() * 26, x = w / 2 + Math.cos(a) * d, y = w / 2 + Math.sin(a) * d, q = 16 + r() * 20, f = g.createRadialGradient(x, y, 0, x, y, q); f.addColorStop(0, 'rgba(255,255,255,0.42)'); f.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = f; g.beginPath(); g.arc(x, y, q, 0, 7); g.fill(); }
    }), pts = [], y0 = map.lz.y, cx = Wm / 2, cz = Hm / 2;
    for (let i = 0; i < 46; i++) {
      const low = i < 16, a = r() * 6.3, d = low ? 95 + r() * 150 : r() * 400, x = cx + Math.cos(a) * d, z = cz + Math.sin(a) * d, y = y0 + (low ? 28 + r() * 22 : 62 + r() * 70);
      for (let k = 0; k < 7; k++) pts.push(x + (r() - 0.5) * 70, y + (r() - 0.5) * 8, z + (r() - 0.5) * 70);
    }
    const cg = new T.BufferGeometry(); cg.setAttribute('position', new T.Float32BufferAttribute(pts, 3));
    S.cloud = new T.Points(cg, new T.PointsMaterial({ map: puff, color: map.theme.cloud || 0x59606e, size: 62, sizeAttenuation: true, transparent: true, opacity: 0.6, depthWrite: false, fog: false }));
    S.cloud.frustumCulled = false; root.add(S.cloud);
  }
  function enter(map) {
    S.map = map; S.lz = map.lz; S.t = 0; S.ft = 0; S.out = -1; S.up = -1; S.hold = 0; S.solids = []; S.landed = false;
    const { x, y, z } = S.lz, root = S.root = new T.Group();
    const pad = G.Hangar.padMesh(); pad.position.set(x + 0.4, y + 0.02, z); root.add(pad);
    town(root, map);
    const sh = S.ship = G.Hangar.ship();
    root.add(sh.group);
    sh.glow.color.setRGB(0.1, 0.9, 0.3); sh.thrust.opacity = 0.3;
    G.R.levelRoot.add(root);
    S.fly = plan(map);
    S.fog = [G.R.scene.fog.near, G.R.scene.fog.far];
    pose(0); air(1); reach(Math.max(620, map.theme.far || 0));
  }
  function touchdown() {
    S.landed = true; S.t = 0; air(0); reach(S.map.theme.far || 280); S.ship.group.quaternion.identity(); S.ship.group.position.set(S.lz.x, S.lz.y, S.lz.z);
    // the cabin and the boom, while it's there (as in the hangar's)
    const { x, y, z } = S.lz, w = S.map.world, add = (x0, y0, z0, x1, y1, z1) => S.solids.push(G.World.add(w, G.World.box(x + x0, y + y0, z + z0, x + x1, y + y1, z + z1, { kind: 'prop' })));
    add(-3.4, 0, -1.35, 2.4, 2.8, 1.35);
    add(2.4, 1.5, -0.3, 8.3, 2.5, 0.3);
    for (const pv of G.Views.players.values()) if (pv.rig) pv.rig.root.visible = true;
  }
  function board(me, i) {
    const p = seatPos(i);
    me.seat = i; me.pos.set(p.x, p.y, p.z); me.vel.set(0, 0, 0); me.yaw = p.yaw; me.pitch = 0; me.crouch = true; me.stowed = true; me.mouse.l = me.mouse.r = false;
  }
  function getOut(me) {
    const p = exitPos(me.seat);
    me.seat = null; me.pos.set(p.x, p.y, p.z); me.vel.set(0, 0, 0); me.crouch = false; me.stowed = false;
    if (S.out < 0) S.out = S.t;
    G.Audio.click();
  }
  // F, while you're in it (from the player's interact()): in the air, it skips the rest of the flight
  function interact(me, dt, held) {
    const o = { prompt: S.landed ? 'Hold <b>F</b> to get out' : 'Inbound <small>· hold <b>F</b> to skip</small>', prog: -1, label: '' };
    if (held && !me.fLatch) {
      S.hold += dt; o.prog = S.hold / HOLD; o.label = S.landed ? 'Getting out' : 'Skipping';
      if (S.hold >= HOLD) { S.hold = 0; me.fLatch = true; if (S.landed) getOut(me); else S.ft = S.fly.dur; }
    } else S.hold = 0;
    return o;
  }
  function update(dt) {
    const sh = S.ship, me = G.Me;
    if (!sh || G.Game.map !== S.map) return;
    sh.rotors.forEach((o, i) => { o.rotation.y += (i ? -1 : 1) * 38 * dt; }); sh.tail.rotation.z += 60 * dt;
    if (S.cloud) S.cloud.position.x += 1.4 * dt;
    if (!S.landed) {
      if (!G.Game.$('veil').classList.contains('on')) S.ft += dt; // (it waits for you to see it)
      if (S.ft < S.fly.dur) {
        pose(S.ft); ride();
        air(G.U.clamp((S.fly.dur - S.ft - 3) / 6, 0, 1));
        for (const pv of G.Views.players.values()) if (pv.rig) pv.rig.root.visible = false; // (their seats, on the pad as far as anyone's concerned: they're up here with you)
        return;
      }
      touchdown();
    }
    S.t += dt;
    if (S.up < 0) {
      const alone = Object.keys(G.Game.roster || {}).length < 2;
      if (S.t < STAY && !(alone && S.out >= 0 && S.t > S.out + AFTER)) return;
      if (me.seat != null) getOut(me);
      for (const s of S.solids) G.World.remove(S.map.world, s);
      S.solids = []; S.up = 0;
    }
    // up, nose down, away to the west
    const u = (S.up += dt), g = sh.group, k = Math.min(1, u / 2);
    g.position.y = S.lz.y + 1.1 * u * u;
    g.position.x = S.lz.x - 2.2 * Math.max(0, u - 1.2) ** 2;
    g.rotation.z = 0.28 * k; // (nose to the west: down)
    sh.thrust.opacity = 0.3 + 0.3 * k;
    if (u > GONE) { g.parent.remove(g); S.ship = null; }
  }
  return { enter, board, interact, update, seatPos, exitPos, S };
})();
