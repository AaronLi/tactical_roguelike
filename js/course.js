'use strict';
// The IPSC course: the strip on the left of the shooting range (x 2..12, from the yard 28 m north, js/level.js
// layHangar), a random stage laid out in it. A stage is three shooting boxes one behind the other, barriers to work
// round, and eight to eleven targets downrange of them: IPSC cardboard (two hits each, best two count), white
// no-shoots beside some of them, and steel poppers that fall when hit.
//   - The stage is laid from a seed every squad member shares. The REGENERATE button by the entrance (in the yard)
//     lays a new one, but only while nobody is in the course (G.Net: 'course').
//   - The START button in the first box: "standby", a random pause, the beep, and the clock runs. Every shot you
//     fire is a split; every hit is scored where it lands. The run ends when every target's done (each paper hit
//     twice, every popper down), or when you walk out of the course.
//   - The board in the yard shows the run: each target's hits, every shot's time and split, then the total, the
//     points (A 5, C 3, D 1, steel 5; a miss or a no-shoot hit -10) and the hit factor (points / seconds). Whoever's
//     shooting sends it to the others as it happens (G.Net: 'crun').
//   - Two spectator screens in the yard switch on while anyone's in the course: one behind the shooter, one looking
//     back at them from the far end.
// Coordinates are the hall's, as in js/range.js (z negative past the hall's north wall; the yard's north edge, the
// range's firing line, is at FL).
G.Course = (() => {
  const T = THREE;
  const A = { x0: 2, x1: 12, z0: -6, z1: -34 }; // the course: x0..x1, from its open end on the yard (z0) to its backstop (z1)
  const BOXES = [-8.5, -14.5, -20.5]; // the shooting boxes (their middles, z)
  const POINTS = { A: 5, B: 3, C: 3, D: 1 };
  const S = { root: null, grp: null, H: null, world: null, RZ: 0, seed: 0, tg: [], solids: [], run: null, last: null, board: null, screens: [], cams: [], rts: [], on: false, frame: 0 };

  const inside = (x, z) => x > A.x0 && x < A.x1 && z < A.z0 && z > A.z1; // (hall coordinates)
  function anyoneIn() {
    const RZ = S.RZ, ps = [];
    if (G.Me.pos && !G.Me.dead) ps.push(G.Me.pos);
    for (const pv of G.Views.players.values()) if (pv.st && !pv.st.dd) ps.push(pv.pos);
    return ps.some((p) => inside(p.x, p.z - RZ));
  }
  function shooterPos() { // the one in the course (you, or a teammate), for the screens to follow
    const RZ = S.RZ;
    if (G.Me.pos && !G.Me.dead && inside(G.Me.pos.x, G.Me.pos.z - RZ)) return { p: G.Me.pos, yaw: G.Me.yaw, me: true };
    for (const pv of G.Views.players.values()) if (pv.st && !pv.st.dd && inside(pv.pos.x, pv.pos.z - RZ)) return { p: pv.pos, yaw: pv.yaw };
    return null;
  }

  // ---------------------------------------------------------------- building
  function build(root, hangar, H) {
    S.root = root; S.H = H; S.world = hangar.map.world; S.RZ = G.HANGAR_ROWS * 2;
    const M = (c, o) => new T.MeshStandardMaterial(Object.assign({ color: c, roughness: 0.85, metalness: 0.05 }, o || {}));
    // the backstop, its sign, the course's name over the entrance
    H.box(root, A.x0, 0, A.z1 + 0.9, A.x1, 2.4, A.z1 - 0.001, M(0x8a7a58, { roughness: 1 }));
    // the buttons: START in the first box (on a post to its right), REGENERATE in the yard beside the entrance
    post(root, 11.2, BOXES[0], 0x2a7a3a, 'START', () => start(), 'start a run (standby, then the beep)');
    post(root, 11.6, -3.2, 0x3a5a8a, 'NEW', () => regenerate(), 'lay a new stage (nobody may be in the course)');
    // the board and the two screens, on the hall's north wall over the yard (east of the garage door), facing the course
    S.board = panel(root, 16.5, 3.2, 1.8, 2.4);
    S.screens = [panel(root, 12.4, 1.9, 1.07, 2.5, true), panel(root, 20.6, 1.9, 1.07, 2.5, true)];
    for (let i = 0; i < 2; i++) { S.rts[i] = new T.WebGLRenderTarget(384, 216); S.cams[i] = new T.PerspectiveCamera(60, 16 / 9, 0.1, 120); }
    for (const sc of S.screens) sc.mesh.material.color.setHex(0x000000);
    S.seed = S.seed || 1 + Math.floor((hangar.map.seed || 7) * 7919) % 100000;
    lay(S.seed);
    paintBoard();
  }
  // a post with a big button on top, F to press it
  function post(root, x, z, col, text, run, runText) {
    const H = S.H;
    H.box(root, x - 0.06, 0, z - 0.06, x + 0.06, 1.0, z + 0.06, new T.MeshStandardMaterial({ color: 0x3b3f44, roughness: 0.7 }));
    const b = new T.Mesh(new T.CylinderGeometry(0.09, 0.09, 0.05, 16), new T.MeshStandardMaterial({ color: col, emissive: col, emissiveIntensity: 0.35 }));
    b.position.set(x, 1.03, z); root.add(b);
    const lab = canvasPlane(256, 64, 0.32, 0.08, (g, w, h) => { g.fillStyle = '#101418'; g.fillRect(0, 0, w, h); g.fillStyle = '#f4f4f0'; g.font = 'bold 40px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(text, w / 2, h / 2 + 2); });
    lab.mesh.position.set(x, 1.18, z + 0.001); root.add(lab.mesh);
    H.addTarget({ id: 'course-' + text, kind: 'pos', box: [x - 0.15, 0.95, z - 0.15, x + 0.15, 1.12, z + 0.15], label: text, run, runText });
  }
  function canvasPlane(cw, ch, w, h, draw) {
    const c = document.createElement('canvas'); c.width = cw; c.height = ch; draw(c.getContext('2d'), cw, ch);
    const tx = new T.CanvasTexture(c); tx.anisotropy = 4;
    const mesh = new T.Mesh(new T.PlaneGeometry(w, h), new T.MeshBasicMaterial({ map: tx, side: T.DoubleSide }));
    return { mesh, c, tx };
  }
  // a board or screen on the hall's north wall (its yard side, z 0), facing north over the yard: w x h, its middle at x, y
  function panel(root, x, w, h, y, screen) {
    const z = -0.08;
    S.H.box(root, x - w / 2 - 0.06, y - h / 2 - 0.06, z + 0.01, x + w / 2 + 0.06, y + h / 2 + 0.06, 0.0, new T.MeshStandardMaterial({ color: 0x2c3036, roughness: 0.7 }));
    const mesh = screen ? new T.Mesh(new T.PlaneGeometry(w, h), new T.MeshBasicMaterial({ color: 0x000000 })) : null;
    const p = screen ? { mesh } : canvasPlane(1024, 576, w, h, () => {});
    p.mesh.position.set(x, y, z); p.mesh.rotation.y = Math.PI; root.add(p.mesh); return p;
  }

  // ---------------------------------------------------------------- the stage, from its seed
  function clear() {
    for (const s of S.solids) G.World.remove(S.world, s);
    S.solids = []; S.tg = [];
    if (S.grp) { G.R.freeMarks(S.grp); S.root.remove(S.grp); S.grp.traverse((o) => { if (o.geometry) o.geometry.dispose(); if (o.material && o.material.map) o.material.map.dispose(); }); }
    S.grp = new T.Group(); S.root.add(S.grp);
  }
  const solid = (x0, y0, z0, x1, y1, z1, o) => { const s = G.World.add(S.world, G.World.box(Math.min(x0, x1), y0, Math.min(z0, z1) + S.RZ, Math.max(x0, x1), y1, Math.max(z0, z1) + S.RZ, Object.assign({ kind: 'prop', move: false }, o || {}))); S.solids.push(s); return s; };
  function lay(seed) {
    S.seed = seed; clear();
    const r = G.U.rng(seed >>> 0), g = S.grp, wood = new T.MeshStandardMaterial({ color: 0x8a6a44, roughness: 0.9 }), white = new T.MeshBasicMaterial({ color: 0xe8e4d4 });
    const flat = (x0, z0, x1, z1) => { const m = new T.Mesh(new T.PlaneGeometry(x1 - x0, z1 - z0), white); m.rotation.x = -Math.PI / 2; m.position.set((x0 + x1) / 2, 0.016, (z0 + z1) / 2); g.add(m); };
    // the shooting boxes: a square of tape, numbered
    S.boxes = BOXES.map((z, i) => ({ x: 7 + (i === 1 ? (r() - 0.5) * 3 : 0), z }));
    S.boxes.forEach(({ x, z }) => {
      const h = 0.6;
      for (const [x0, z0, x1, z1] of [[x - h, z - h, x + h, z - h + 0.06], [x - h, z + h - 0.06, x + h, z + h], [x - h, z - h, x - h + 0.06, z + h], [x + h - 0.06, z - h, x + h, z + h]]) flat(x0, z0, x1, z1);
    });
    // barriers: a wall beside each box (alternating sides), and between the boxes a wall with a port in it
    const walls = [];
    const wall = (x0, z, x1, h = 1.9) => { const m = new T.Mesh(new T.BoxGeometry(x1 - x0, h, 0.08), wood); m.position.set((x0 + x1) / 2, h / 2, z); g.add(m); solid(x0, 0, z - 0.04, x1, h, z + 0.04); walls.push([x0, z, x1, h]); };
    const side = r() < 0.5 ? -1 : 1;
    BOXES.forEach((z, i) => { const s = i % 2 ? -side : side; if (s < 0) wall(A.x0 + 0.1, z - 1.6, 4.6 + r() * 0.8); else wall(9.4 - r() * 0.8, z - 1.6, A.x1 - 0.1); });
    for (const z of [BOXES[0] - 3.4, BOXES[1] - 3.4]) { const gap = 5 + r() * 4; wall(A.x0 + 0.1, z, gap - 0.7, 1.0); wall(gap + 0.7, z, A.x1 - 0.1, 1.0); } // knee-high walls with a gap to walk through
    // the targets: two to four downrange of each box, spread across, none too close to another or behind a wall
    const tg = [];
    const clearOf = (x, z) => tg.every((q) => Math.hypot(q.x - x, q.z - z) > 1.1) && walls.every(([x0, wz, x1]) => Math.abs(z - wz) > 0.6 || x < x0 - 0.4 || x > x1 + 0.4);
    BOXES.forEach((bz, i) => {
      const n = 2 + Math.floor(r() * 3);
      for (let k = 0, tries = 0; k < n && tries < 60; tries++) {
        const z = bz - 3.8 - r() * (i === 2 ? 9 : 4.5), x = A.x0 + 0.8 + r() * (A.x1 - A.x0 - 1.6);
        if (z < A.z1 + 2 || !clearOf(x, z)) continue;
        const kind = r() < 0.28 ? 'steel' : 'paper';
        tg.push({ kind, x, z, box: i }); k++;
        if (kind === 'paper' && r() < 0.2 && tg.filter((t) => t.kind === 'noshoot').length < 2) tg.push({ kind: 'noshoot', x: x + (x < 7 ? 0.62 : -0.62), z: z + 0.05, box: i }); // (a no-shoot beside it, toward the middle)
      }
    });
    tg.forEach((q, i) => { q.n = i + 1; q.hits = []; (q.kind === 'steel' ? popper : paper)(q); S.tg.push(q); });
    resetTargets();
  }
  // a cardboard target on two stakes, facing the boxes
  function paper(q) {
    const w = 0.46, h = 0.75, foot = 0.85;
    q.yaw = 0; q.w = w; q.h = h; q.y0 = foot; // (square to the range, as the collision box is: a round stops on the cardboard it meets)
    q.c = document.createElement('canvas'); q.c.width = 128; q.c.height = 209; q.tex = new T.CanvasTexture(q.c);
    q.grp = new T.Group(); q.grp.position.set(q.x, 0, q.z); q.grp.rotation.y = q.yaw; S.grp.add(q.grp);
    const face = new T.Mesh(new T.PlaneGeometry(w, h), new T.MeshBasicMaterial({ map: q.tex, transparent: true, alphaTest: 0.5 })); face.position.y = foot + h / 2; q.grp.add(face);
    for (const sx of [-0.12, 0.12]) { const st = new T.Mesh(new T.BoxGeometry(0.03, foot + 0.2, 0.03), new T.MeshStandardMaterial({ color: 0x6a5030 })); st.position.set(sx, (foot + 0.2) / 2, -0.02); q.grp.add(st); }
    const hw = (w / 2) * Math.abs(Math.cos(q.yaw)) + 0.02, hd = (w / 2) * Math.abs(Math.sin(q.yaw)) + 0.02;
    q.solid = solid(q.x - hw, foot, q.z - hd, q.x + hw, foot + h, q.z + hd, { kind: 'target', target: { kind: 'course', q } });
  }
  // a steel popper: a plate on a hinge at its foot; it falls back when hit
  function popper(q) {
    q.yaw = 0;
    q.grp = new T.Group(); q.grp.position.set(q.x, 0, q.z); q.grp.rotation.y = q.yaw; S.grp.add(q.grp);
    H_(q.grp, 0.3, 0.05, 0.2, 0x3b3f44, 0, 0.025, 0); // its base
    q.hinge = new T.Group(); q.hinge.position.set(0, 0.06, 0); q.grp.add(q.hinge);
    q.mat = new T.MeshStandardMaterial({ color: 0xc8c2b4, roughness: 0.6, metalness: 0.4 });
    const body = new T.Mesh(new T.BoxGeometry(0.15, 0.85, 0.02), q.mat); body.position.y = 0.45; q.hinge.add(body);
    const top = new T.Mesh(new T.CylinderGeometry(0.15, 0.15, 0.02, 20), q.mat); top.rotation.x = Math.PI / 2; top.position.y = 1.0; q.hinge.add(top);
    q.y0 = 0.06;
  }
  function H_(parent, w, h, d, c, x, y, z) { const m = new T.Mesh(new T.BoxGeometry(w, h, d), new T.MeshStandardMaterial({ color: c, roughness: 0.7 })); m.position.set(x, y, z); parent.add(m); return m; }
  function redraw(q) {
    if (q.kind === 'steel') return;
    const g = q.c.getContext('2d'); g.clearRect(0, 0, q.c.width, q.c.height);
    G.Range.drawIpsc(g, 0, 0, q.c.width, q.c.height, q.hits, true, q.kind === 'noshoot' ? '#ecebe6' : null);
    g.fillStyle = q.kind === 'noshoot' ? '#c04030' : '#5a4428'; g.font = 'bold 22px sans-serif'; g.textAlign = 'center'; g.fillText(q.kind === 'noshoot' ? 'NS' : 'T' + q.n, 64, 200);
    q.tex.needsUpdate = true;
  }
  function resetTargets() {
    for (const q of S.tg) {
      q.hits = [];
      if (q.kind === 'steel') { G.R.freeMarks(q.hinge); q.down = false; q.fall = 0; q.hinge.rotation.x = 0; if (!q.solid) q.solid = solid(q.x - 0.16, 0.06, q.z - 0.06, q.x + 0.16, 1.15, q.z + 0.06, { kind: 'target', target: { kind: 'course', q } }); }
      else redraw(q);
    }
  }

  // ---------------------------------------------------------------- a run
  // run: { who, state: 'standby' | 'running' | 'done', t0 (performance.now at the beep), shots: [s], hits: [[n, zone, s]], end: s }
  function start() {
    const me = G.Me;
    if (!inside(me.pos.x, me.pos.z - S.RZ)) return G.HUD.toast('THE COURSE', 'Start from inside the course, in the first box', 1.6);
    if (S.run && S.run.state !== 'done' && S.run.who !== G.Net.myId) return G.HUD.toast('THE COURSE', 'Someone else is shooting it', 1.4);
    resetTargets();
    S.run = { who: G.Net.myId, name: G.Game.myName, seed: S.seed, state: 'standby', t0: 0, shots: [], hits: [], end: 0 };
    G.HUD.toast('THE COURSE', 'Shooter ready… standby', 1.4);
    G.Audio.click();
    const run = S.run, wait = 1.5 + Math.random() * 2.5;
    setTimeout(() => {
      if (S.run !== run || run.state !== 'standby') return;
      run.state = 'running'; run.t0 = performance.now();
      G.Audio.tone(2500, 0.32, 'square', 0.22); // the beep
      send();
    }, wait * 1000);
    send(); paintBoard();
  }
  const now = (run) => (performance.now() - run.t0) / 1000;
  // a shot of yours (js/player.js shoot): a split, if you're on the clock
  function shot() {
    const run = S.run;
    if (!run || run.who !== G.Net.myId) return;
    if (run.state === 'standby') { run.state = 'done'; run.dq = 'Shot before the beep'; send(); paintBoard(); G.HUD.toast('THE COURSE', 'Shot before the beep: the run is stopped', 1.8); return; }
    if (run.state !== 'running') return;
    run.shots.push(+now(run).toFixed(2));
    send(); paintBoard();
  }
  // a round of yours met a course target at p (from dir)
  function hit(t, p, dir) {
    const q = t.q;
    if (q.kind === 'steel') {
      if (q.down) return;
      q.down = true; q.vel = 0; if (q.solid) { G.World.remove(S.world, q.solid); S.solids = S.solids.filter((s) => s !== q.solid); q.solid = null; }
      setTimeout(() => G.Audio.impact && G.Audio.impact('metal', 3, 0), 30);
      record(q, 'S');
      return;
    }
    // where it crossed the cardboard: the round's line through the target's plane, in the target's frame (cm)
    const RZ = S.RZ, n = new T.Vector3(Math.sin(q.yaw), 0, Math.cos(q.yaw)), c = new T.Vector3(q.x, 0, q.z + RZ);
    let hp = p.clone();
    if (dir) { const den = dir.dot(n); if (Math.abs(den) > 1e-4) hp = p.clone().addScaledVector(dir, c.clone().sub(p).dot(n) / den); }
    const right = new T.Vector3(Math.cos(q.yaw), 0, -Math.sin(q.yaw));
    const x = hp.clone().sub(c).dot(right) * 100, y = (hp.y - q.y0) * 100, z = G.Range.zoneAt(x, y);
    if (!z) return;
    q.hits.push({ x, y, z }); redraw(q);
    G.Audio.hit(false);
    record(q, z);
  }
  function record(q, zone) {
    const run = S.run;
    if (!run || run.who !== G.Net.myId || run.state !== 'running') return;
    run.hits.push([q.n, zone, +now(run).toFixed(2)]);
    // done when every target is: paper hit twice, every popper down (no-shoots don't count)
    const done = S.tg.every((t) => (t.kind === 'steel' ? t.down : t.kind === 'noshoot' ? true : t.hits.length >= 2));
    if (done) finish();
    send(); paintBoard();
  }
  function finish(dq) {
    const run = S.run;
    if (!run || run.state === 'done') return;
    run.state = 'done'; if (dq) run.dq = dq;
    run.end = run.shots.length ? run.shots[run.shots.length - 1] : +now(run).toFixed(2);
    G.Audio.tone(1800, 0.12, 'square', 0.18); setTimeout(() => G.Audio.tone(1800, 0.12, 'square', 0.18), 160);
    send(); paintBoard();
  }
  // the score: best two hits on each paper, steel down or not, no-shoot hits; points and hit factor
  function score(run) {
    const by = new Map();
    for (const [n, z] of run.hits) { if (!by.has(n)) by.set(n, []); by.get(n).push(z); }
    let pts = 0, miss = 0, ns = 0;
    const rows = S.tg.map((q) => {
      const hz = by.get(q.n) || [];
      if (q.kind === 'noshoot') { ns += hz.length; return { q, txt: hz.length ? `${hz.length} hit${hz.length > 1 ? 's' : ''} (-${10 * hz.length})` : '—' }; }
      if (q.kind === 'steel') { if (hz.length) pts += 5; else miss++; return { q, txt: hz.length ? 'down' : 'standing (M)' }; }
      const best = hz.map((z) => POINTS[z]).sort((a, b) => b - a).slice(0, 2);
      pts += best.reduce((a, b) => a + b, 0); miss += Math.max(0, 2 - best.length);
      return { q, txt: hz.length ? hz.join(' ') + (hz.length < 2 ? '  M' : '') : 'M M' };
    });
    const total = Math.max(0, pts - 10 * miss - 10 * ns), time = run.end || (run.shots.length ? run.shots[run.shots.length - 1] : 0);
    return { rows, pts, miss, ns, total, time, hf: time > 0 ? total / time : 0 };
  }

  // ---------------------------------------------------------------- the squad: the stage and the runs
  function send() { if (S.run) G.Net.toHost({ t: 'crun', s: { who: S.run.who, name: S.run.name, seed: S.run.seed, state: S.run.state, shots: S.run.shots, hits: S.run.hits, end: S.run.end, dq: S.run.dq || null, el: S.run.state === 'running' ? now(S.run) : 0 } }); }
  // someone else's run, as they send it
  function remoteRun(s) {
    if (!s || s.who === G.Net.myId) return;
    if (s.seed !== S.seed) setCourse(s.seed);
    const was = S.run && S.run.who === s.who ? S.run : null;
    if (s.state === 'standby' && !(was && was.state === 'standby')) resetTargets(); // (a fresh run: the targets set up again)
    S.run = Object.assign({}, s, { t0: s.state === 'running' ? performance.now() - (s.el || 0) * 1000 : was ? was.t0 : 0 });
    // their hits, on our copy of the targets
    for (const q of S.tg) if (q.kind === 'steel') { const d = s.hits.some(([n]) => n === q.n); if (d && !q.down) { q.down = true; if (q.solid) { G.World.remove(S.world, q.solid); S.solids = S.solids.filter((x) => x !== q.solid); q.solid = null; } } }
    paintBoard();
  }
  function regenerate() {
    if (anyoneIn()) return G.HUD.toast('THE COURSE', 'Everyone has to be out of the course first', 1.6);
    const seed = 1 + Math.floor(Math.random() * 1e6);
    setCourse(seed); G.Net.toHost({ t: 'course', seed });
    G.HUD.toast('THE COURSE', 'A new stage is laid out', 1.4); G.Audio.click();
  }
  function setCourse(seed) {
    if (!S.root || !(seed > 0) || seed === S.seed) return;
    S.run = null; lay(seed); paintBoard();
  }

  // ---------------------------------------------------------------- the board
  function paintBoard() {
    const B = S.board;
    if (!B) return;
    const g = B.c.getContext('2d'), W = B.c.width, Hh = B.c.height, run = S.run;
    g.fillStyle = '#071018'; g.fillRect(0, 0, W, Hh);
    g.fillStyle = '#7fe0ff'; g.font = 'bold 34px monospace'; g.textBaseline = 'top'; g.textAlign = 'left';
    g.fillText(`IPSC COURSE  ·  STAGE ${S.seed}`, 24, 18);
    const nT = S.tg.filter((q) => q.kind !== 'noshoot').length, nNS = S.tg.length - nT;
    g.font = '22px monospace'; g.fillStyle = '#6aa8c0';
    g.fillText(`${nT} targets, ${nNS} no-shoot${nNS === 1 ? '' : 's'} · ${S.tg.filter((q) => q.kind === 'paper').length * 2 + S.tg.filter((q) => q.kind === 'steel').length} rounds minimum · START in box 1`, 24, 60);
    if (!run) { g.fillStyle = '#a8e8ff'; g.font = 'bold 40px monospace'; g.fillText('READY', 24, 120); return void (B.tx.needsUpdate = true); }
    const sc = score(run), st = run.state === 'standby' ? 'STANDBY' : run.state === 'running' ? `RUNNING  ${now(run).toFixed(2)}` : run.dq ? `STOPPED: ${run.dq}` : `FINISHED  ${sc.time.toFixed(2)} s`;
    g.fillStyle = run.state === 'done' ? (run.dq ? '#ff8a6a' : '#a8ffc0') : '#ffd040'; g.font = 'bold 38px monospace';
    g.fillText(`${(run.name || '').slice(0, 14).toUpperCase()}  ${st}`, 24, 104);
    // the targets, two columns
    g.font = '22px monospace';
    sc.rows.forEach((r, i) => {
      const col = i < 7 ? 0 : 1, row = i % 7, x = 24 + col * 300, y = 160 + row * 34;
      g.fillStyle = r.q.kind === 'noshoot' ? '#ff9a8a' : '#d8e4ea';
      g.fillText(`${r.q.kind === 'noshoot' ? 'NS' : (r.q.kind === 'steel' ? 'P' : 'T') + r.q.n}`.padEnd(4) + r.txt, x, y);
    });
    // the splits
    g.fillStyle = '#7fe0ff'; g.font = 'bold 24px monospace'; g.fillText('SHOT   TIME  SPLIT', 640, 160);
    g.font = '22px monospace'; g.fillStyle = '#d8e4ea';
    const shots = run.shots, from = Math.max(0, shots.length - 9);
    for (let i = from; i < shots.length; i++) g.fillText(`${String(i + 1).padStart(3)}  ${shots[i].toFixed(2).padStart(6)}  ${(i ? shots[i] - shots[i - 1] : shots[i]).toFixed(2).padStart(5)}`, 640, 194 + (i - from) * 30);
    if (run.state === 'done') {
      g.fillStyle = '#a8ffc0'; g.font = 'bold 30px monospace';
      g.fillText(`TIME ${sc.time.toFixed(2)}  POINTS ${sc.total}  HF ${sc.hf.toFixed(3)}`, 24, Hh - 62);
      g.font = '20px monospace'; g.fillStyle = '#9ab8c4'; g.fillText(`${sc.pts} scored · ${sc.miss} miss${sc.miss === 1 ? '' : 'es'} · ${sc.ns} no-shoot hit${sc.ns === 1 ? '' : 's'} · first shot ${shots.length ? shots[0].toFixed(2) : '—'} s`, 24, Hh - 26);
    }
    B.tx.needsUpdate = true;
  }

  // ---------------------------------------------------------------- every frame
  function update(dt) {
    if (!S.root) return;
    const me = G.Me, RZ = S.RZ;
    // poppers fall back on their hinges
    for (const q of S.tg) if (q.kind === 'steel' && q.down && q.hinge.rotation.x > -1.45) { q.vel = (q.vel || 0) - 14 * dt; q.hinge.rotation.x = Math.max(-1.45, q.hinge.rotation.x + q.vel * dt); }
    const run = S.run;
    if (run && run.state === 'running') {
      // walked out of the course: the run ends there (yours); the clock on the board
      if (run.who === G.Net.myId && me.pos && !inside(me.pos.x, me.pos.z - RZ)) finish();
      if ((S.frame & 7) === 0) paintBoard();
    }
    if (run && run.state === 'standby' && run.who === G.Net.myId && me.pos && !inside(me.pos.x, me.pos.z - RZ)) { S.run = null; paintBoard(); }
    // the spectator screens: on while someone's in the course
    const sh = shooterPos();
    if (!!sh !== S.on) { S.on = !!sh; for (let i = 0; i < 2; i++) { const m = S.screens[i].mesh.material; m.map = S.on ? S.rts[i].texture : null; m.color.setHex(S.on ? 0xffffff : 0x000000); m.needsUpdate = true; } }
    S.frame++;
    if (S.on && (S.frame & 1) === 0) {
      const p = sh.p, c0 = S.cams[0], c1 = S.cams[1], r = G.R.renderer;
      // behind and above the shooter, looking where they face; and from the far end, back at them
      c0.position.set(p.x + Math.sin(sh.yaw) * 2.6, (p.y || 0) + 2.2, p.z + Math.cos(sh.yaw) * 2.6);
      c0.lookAt(p.x - Math.sin(sh.yaw) * 6, (p.y || 0) + 1.0, p.z - Math.cos(sh.yaw) * 6);
      c1.position.set(7, 3.2, A.z1 + 1.6 + RZ); c1.lookAt(p.x, (p.y || 0) + 1.0, p.z);
      const prevT = r.getRenderTarget();
      G.LightGrid.on(true);
      for (let i = 0; i < 2; i++) { r.setRenderTarget(S.rts[i]); r.clear(); r.render(G.R.scene, S.cams[i]); }
      G.LightGrid.on(false);
      r.setRenderTarget(prevT);
    }
  }
  function leave() {
    if (S.world) for (const s of S.solids) G.World.remove(S.world, s);
    for (const rt of S.rts) if (rt) rt.dispose();
    Object.assign(S, { root: null, grp: null, seed: 0, tg: [], solids: [], run: null, board: null, screens: [], cams: [], rts: [], on: false });
  }
  return { build, update, leave, hit, shot, remoteRun, setCourse, regenerate, start, inside, anyoneIn, score, A, S };
})();
