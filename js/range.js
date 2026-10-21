// The shooting range behind the hangar's garage door (js/hangar.js builds the hangar, this is what's beyond its north wall).
// Everything is in the hall's coordinates (z negative past the wall; G.Hangar.RZ is how far the hall sits from the map's
// origin, js/level.js layHangar). Two ranges side by side off a yard: pistol lanes to the west, 16 m deep, and rifle lanes
// to the east, 100 m deep, each lane marked in metres from the firing line. The guns work here: you can load, fire and
// reload as you like, and every round you use is given back when you walk out (the magazines, boxes and chambers as they
// were when you came in). Nobody else is hurt by it: friendly fire is off in the hangar.
G.Range = (() => {
  const T = THREE;
  const RZ = G.HANGAR_ROWS * 2;
  const FL = -6; // the firing line (z)
  const PIS = { x0: 2, x1: 12, lanes: [3.67, 7.0, 10.33], len: 16, marks: [3, 5, 7, 10, 15] };
  const RIF = { x0: 14, x1: 24, lanes: [15.25, 17.75, 20.25, 22.75], len: 100, marks: [10, 20, 25, 30, 40, 50, 60, 70, 75, 80, 90, 100], big: [25, 50, 75, 100] };
  const S = { root: null, tg: [], lanes: [], inside: false, snap: null, ring: [] };
  const HOLE_PX = 4;

  // ---------------------------------------------------------------- the world: what stops rounds and people
  function decorate(map, add) {
    for (const L of lanes()) add(L.cx - 0.55, 0, FL + 0.15 - 0.3, L.cx - 0.15, 1.1, FL + 0.15 + 0.3, { kind: 'prop' }); // (the lane's console, at the line)
  }
  // every lane: { range, n, cx, x0, x1 }
  function lanes() {
    if (S.laneList) return S.laneList;
    const out = [];
    for (const [name, R] of [['pistol', PIS], ['rifle', RIF]]) R.lanes.forEach((cx, i) => out.push({ range: name, R, n: i + 1, cx, w: (R.x1 - R.x0) / R.lanes.length }));
    return (S.laneList = out);
  }

  // ---------------------------------------------------------------- drawing
  const mats = {};
  const M = (c, o) => { const k = c + JSON.stringify(o || {}); return mats[k] || (mats[k] = new T.MeshStandardMaterial(Object.assign({ color: c, roughness: 0.8, metalness: 0.1 }, o || {}))); };
  const basic = (c, o) => new T.MeshBasicMaterial(Object.assign({ color: c }, o || {}));
  function tex(w, h, draw) { const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h); const t = new T.CanvasTexture(c); t.anisotropy = 4; t.userData = { canvas: c }; return t; }
  const labelTex = {};
  function label(text, fg = '#f4f4f0', bg = null) {
    const k = text + fg + bg;
    return labelTex[k] || (labelTex[k] = new T.MeshBasicMaterial({ transparent: true, depthWrite: false, map: tex(256, 128, (g, w, h) => {
      if (bg) { g.fillStyle = bg; g.fillRect(0, 0, w, h); }
      g.fillStyle = fg; g.font = 'bold 84px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(text, w / 2, h / 2 + 4);
    }) }));
  }
  function flat(r, x0, z0, x1, z1, mat, y = 0.014) { const m = new T.Mesh(new T.PlaneGeometry(Math.abs(x1 - x0), Math.abs(z1 - z0)), mat); m.rotation.x = -Math.PI / 2; m.position.set((x0 + x1) / 2, y, (z0 + z1) / 2); r.add(m); return m; }
  function sign(r, lines, w, h, x, y, z, ry = 0, bg = '#101418', fg = '#ffb43a') {
    const m = new T.Mesh(new T.PlaneGeometry(w, h), H.signMat(lines, 512, Math.round(512 * h / w), bg, fg, '#cfd6dc'));
    m.position.set(x, y, z); m.rotation.y = ry; r.add(m); return m;
  }
  let H = null;

  // ---------------------------------------------------------------- the scene
  function build(root, hangarS, helpers) {
    H = helpers; S.root = root; S.tg = []; S.hangar = hangarS; S.lanes = []; S.laneList = null;
    const white = basic(0xeceae4), yellow = basic(0xe8c030);
    // the yard's own sign, over the garage door inside the hall
    sign(root, ['SHOOTING RANGE', 'pistol · rifle · everything you fire here comes back'], 5.2, 0.85, 7, 3.5, 2.03, 0);
    // the firing line and the markings of each range
    for (const R of [PIS, RIF]) {
      flat(root, R.x0 + 0.1, FL - 0.07, R.x1 - 0.1, FL + 0.07, yellow, 0.016);
      flat(root, R.x0 + 0.1, FL + 0.25, R.x1 - 0.1, FL + 0.31, yellow, 0.016);
      for (let i = 0; i <= R.lanes.length; i++) { const x = R.x0 + (R.x1 - R.x0) * i / R.lanes.length; flat(root, x - 0.04, FL - R.len, x + 0.04, FL, white, 0.013); } // (the lane lines)
      for (const d of R.marks) {
        const big = R.big && R.big.includes(d), z = FL - d;
        flat(root, R.x0 + 0.1, z - (big ? 0.07 : 0.035), R.x1 - 0.1, z + (big ? 0.07 : 0.035), big ? yellow : white, 0.015);
        for (const cx of R.lanes) {
          const m = new T.Mesh(new T.PlaneGeometry(big ? 1.3 : 0.9, big ? 0.65 : 0.45), label(d + ' m', big ? '#ffd24a' : '#f4f4f0'));
          m.rotation.x = -Math.PI / 2; m.position.set(cx - (big ? 0 : 0), 0.017, z + (big ? 0.85 : 0.6)); root.add(m);
        }
      }
    }
    // a board on a pole for each 25 m of the rifle range, beside the walls, readable from the line
    for (const d of RIF.big) for (const x of [RIF.x0 + 0.35, RIF.x1 - 0.35]) {
      H.box(root, x - 0.04, 0, FL - d - 0.04, x + 0.04, 2.3, FL - d + 0.04, M(0x4a4f55));
      sign(root, [d + ' m'], 0.9, 0.5, x, 2.3, FL - d + 0.05, 0, '#101418', '#ffd24a');
    }
    // and for the pistol range's last marks, on its walls
    for (const d of PIS.marks) for (const x of [PIS.x0 + 0.06, PIS.x1 - 0.06]) {
      const m = new T.Mesh(new T.PlaneGeometry(0.7, 0.35), label(d + ' m', '#ffffff', '#101418')); m.rotation.y = x < 7 ? Math.PI / 2 : -Math.PI / 2; m.position.set(x, 1.5, FL - d); root.add(m);
    }
    // what each range is called, over its firing line
    for (const [R, lines] of [[PIS, ['PISTOL RANGE', '3 – 15 m · paper and steel']], [RIF, ['RIFLE RANGE', '10 – 100 m · steel']]]) {
      const mid = (R.x0 + R.x1) / 2;
      sign(root, lines, 4.4, 0.8, mid, 3.0, FL + 1.4, 0, '#101418', '#58b8ff');
      for (const x of [R.x0 + 0.5, R.x1 - 0.5]) H.box(root, x - 0.04, 0, FL + 1.36, x + 0.04, 3.4, FL + 1.44, M(0x3b3f44));
    }
    // the back of each range: the backstop, a bank of sand against the wall
    H.box(root, PIS.x0, 0, FL - PIS.len - 0.001, PIS.x1, 1.8, FL - PIS.len - 0.9, M(0x8a7a58, { roughness: 1 }));
    H.box(root, RIF.x0, 0, FL - RIF.len - 2 - 0.001, RIF.x1, 2.6, FL - RIF.len - 3.4, M(0x8a7a58, { roughness: 1 }));
    // lanes: a console at the line and the targets down it
    lanes().forEach((L) => { laneConsole(root, L); L.hits = 0; L.last = '—'; S.lanes.push(L); });
    targets(root);
  }

  // a console at the left of each lane: its hits, and F clears the targets
  function laneConsole(root, L) {
    const x = L.cx - 0.35, z = FL + 0.15;
    H.box(root, L.cx - 0.55, 0, z - 0.3, L.cx - 0.15, 1.0, z + 0.3, M(0x2c3036));
    const scr = new T.Mesh(new T.PlaneGeometry(0.62, 0.32), new T.MeshBasicMaterial({ map: null }));
    scr.position.set(x, 1.2, z + 0.03); scr.rotation.x = -0.45; root.add(scr);
    L.scr = scr; paintLane(L);
    H.addTarget({ id: 'lane' + L.range + L.n, kind: 'pos', box: [L.cx - 0.6, 0.6, z - 0.35, L.cx - 0.1, 1.5, z + 0.35], label: `lane ${L.n}'s targets`, run: () => reset(L), runText: `reset lane ${L.n}'s targets` });
  }
  function paintLane(L) {
    const t = tex(256, 132, (g, w, h) => {
      g.fillStyle = '#05121a'; g.fillRect(0, 0, w, h);
      g.fillStyle = 'rgba(80,200,255,0.06)'; for (let y = 0; y < h; y += 4) g.fillRect(0, y, w, 1);
      g.fillStyle = '#7fe0ff'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.font = 'bold 26px monospace'; g.fillText(`${L.range.toUpperCase()} · LANE ${L.n}`, w / 2, 22);
      g.font = 'bold 40px monospace'; g.fillStyle = '#a8ffc0'; g.fillText(`${L.hits} HITS`, w / 2, 66);
      g.font = '20px monospace'; g.fillStyle = '#a8e8ff'; g.fillText(`last: ${L.last}`, w / 2, 98); g.fillText('F: reset targets', w / 2, 120);
    });
    if (L.scr.material.map) L.scr.material.map.dispose();
    L.scr.material.map = t; L.scr.material.needsUpdate = true;
  }

  // ---------------------------------------------------------------- targets
  function steel(root, L, d, off, size) {
    const x = L.cx + off, z = FL - d, top = 1.5 + size, tg = { kind: 'steel', d, lane: L, hits: 0, size, x, z, swing: 0, vel: 0, flash: 0 };
    H.box(root, x - 0.03, 0, z - 0.12, x + 0.03, top, z - 0.06, M(0x3b3f44)); // (its post)
    const pivot = new T.Group(); pivot.position.set(x, top, z); root.add(pivot);
    tg.mat = new T.MeshStandardMaterial({ color: 0xb0452c, roughness: 0.55, metalness: 0.5, emissive: 0x000000 });
    const plate = new T.Mesh(new T.BoxGeometry(size, size, 0.04), tg.mat); plate.position.set(0, -size / 2 - 0.05, 0.0); pivot.add(plate);
    const num = new T.Mesh(new T.PlaneGeometry(size * 0.8, size * 0.4), label(d + '', '#f4f4f0')); num.position.set(0, -size / 2 - 0.05, 0.022); pivot.add(num);
    tg.pivot = pivot;
    const sol = G.World.add(S.hangar.map.world, G.World.box(x - size / 2, top - size - 0.05, z - 0.03 + RZ, x + size / 2, top - 0.05, z + 0.03 + RZ, { kind: 'target', move: false, target: tg }));
    tg.solid = sol; S.tg.push(tg); return tg;
  }
  function paper(root, L, d) {
    const w = 0.5, h = 0.8, y = 1.35, x = L.cx, z = FL - d, tg = { kind: 'paper', d, lane: L, hits: 0, w, h, x, y, z };
    H.box(root, x - 0.04, 0, z - 0.1, x + 0.04, y - h / 2, z - 0.05, M(0x6a5030));
    H.box(root, x - w / 2 - 0.03, y - h / 2 - 0.03, z - 0.045, x + w / 2 + 0.03, y + h / 2 + 0.03, z - 0.03, M(0x6a5030));
    tg.tex = tex(256, 410, (g, W, Hh) => {
      g.fillStyle = '#e8e4d4'; g.fillRect(0, 0, W, Hh);
      g.strokeStyle = '#3a3a34'; g.lineWidth = 3;
      for (const [r, v] of [[110, 5], [80, 7], [50, 9], [22, 10]]) { g.beginPath(); g.arc(W / 2, Hh * 0.38, r, 0, 7); g.stroke(); g.fillStyle = '#3a3a34'; g.font = '18px sans-serif'; g.textAlign = 'center'; g.fillText(v, W / 2, Hh * 0.38 - r + 18); }
      g.fillStyle = '#3a3a34'; g.fillRect(W / 2 - 14, Hh * 0.38 - 14, 28, 28);
      g.font = 'bold 30px sans-serif'; g.fillText(d + ' m', W / 2, Hh - 22);
    });
    const m = new T.Mesh(new T.PlaneGeometry(w, h), new T.MeshBasicMaterial({ map: tg.tex })); m.position.set(x, y, z - 0.025); root.add(m); // (its face is toward the line)
    const sol = G.World.add(S.hangar.map.world, G.World.box(x - w / 2, y - h / 2, z - 0.04 + RZ, x + w / 2, y + h / 2, z - 0.02 + RZ, { kind: 'target', move: false, target: tg }));
    tg.solid = sol; S.tg.push(tg); return tg;
  }
  function targets(root) {
    // pistol: paper at 5, 7 and 10 m (one to a lane), steel at 12 and 15 m either side of the lane's middle
    PIS.lanes.forEach((cx, i) => {
      const L = lanes().find((q) => q.range === 'pistol' && q.n === i + 1);
      paper(root, L, [5, 7, 10][i]);
      steel(root, L, 12, -0.7, 0.25); steel(root, L, 15, 0.7, 0.3);
    });
    // rifle: a plate at each 25 m in every lane, set across the lane so none stands in front of another, and larger the farther it is
    const sizes = [0.3, 0.42, 0.55, 0.7], offs = [-0.75, -0.25, 0.25, 0.75];
    RIF.lanes.forEach((cx, j) => {
      const L = lanes().find((q) => q.range === 'rifle' && q.n === j + 1);
      RIF.big.forEach((d, k) => steel(root, L, d, offs[(k + j) % 4], sizes[k]));
    });
  }

  // ---------------------------------------------------------------- a round meets a target (js/player.js roundSegment)
  function hit(solid, p) {
    const t = solid && solid.target;
    if (!t || !S.root) return;
    t.hits++; t.lane.hits++; t.lane.last = `${t.kind} ${t.d} m`;
    if (t.kind === 'steel') {
      t.vel -= 5.5 / (0.4 + t.size); t.flash = 0.25;
      // the ring arrives with the speed of sound
      const cam = G.R.camera, dist = cam ? Math.hypot(cam.position.x - p.x, cam.position.z - p.z) : t.d;
      setTimeout(() => { if (S.root && G.Audio.impact) G.Audio.impact('metal', Math.min(14, dist * 0.35), 0); }, Math.min(900, dist / 343 * 1000));
    } else {
      const u = (p.x - t.x) / t.w + 0.5, v = 0.5 - (p.y - t.y) / t.h, g = t.tex.userData.canvas.getContext('2d');
      g.fillStyle = '#17140f'; g.beginPath(); g.arc(u * 256, v * 410, HOLE_PX, 0, 7); g.fill(); t.tex.needsUpdate = true;
    }
    G.Audio.hit(false);
    paintLane(t.lane);
  }
  function reset(L) {
    for (const t of S.tg) {
      if (L && t.lane !== L) continue;
      t.hits = 0;
      if (t.kind === 'paper') { const g = t.tex.userData.canvas.getContext('2d'); g.fillStyle = '#e8e4d4'; g.fillRect(0, 0, 256, 410); redrawPaper(t); }
    }
    for (const q of S.lanes) if (!L || q === L) { q.hits = 0; q.last = '—'; paintLane(q); }
    G.Audio.click();
  }
  function redrawPaper(t) {
    const g = t.tex.userData.canvas.getContext('2d'), W = 256, Hh = 410;
    g.strokeStyle = '#3a3a34'; g.lineWidth = 3;
    for (const [r, v] of [[110, 5], [80, 7], [50, 9], [22, 10]]) { g.beginPath(); g.arc(W / 2, Hh * 0.38, r, 0, 7); g.stroke(); g.fillStyle = '#3a3a34'; g.font = '18px sans-serif'; g.textAlign = 'center'; g.fillText(v, W / 2, Hh * 0.38 - r + 18); }
    g.fillStyle = '#3a3a34'; g.fillRect(W / 2 - 14, Hh * 0.38 - 14, 28, 28);
    g.font = 'bold 30px sans-serif'; g.fillText(t.d + ' m', W / 2, Hh - 22);
    t.tex.needsUpdate = true;
  }

  // ---------------------------------------------------------------- ammunition: used here, given back on the way out
  // Every gun you have (what's in your hands, your pack, your locker), every magazine and box in everything you carry, and
  // where each sits in its pouch: as they are when you walk in, put back as they were when you walk out.
  function grids(me) {
    const seen = new Set(), list = [], push = (g) => { if (g && !seen.has(g)) { seen.add(g); list.push(g); } };
    for (const g of G.Gear.all(me)) push(g);
    for (let i = 0; i < list.length; i++) for (const p of list[i].items) { const it = p.it; (it.grids || []).forEach(push); push(it.molle); }
    return list;
  }
  function snapshot(me) {
    const gs = grids(me), items = new Map(), guns = G.Gear.guns(me).map((w) => ({ w, mag: w.mag, chamber: w.chamber, ammo: w.ammo, tube: w.tube && w.tube.slice(), spent: w.spent && w.spent.slice(), spentCh: w.spentCh }));
    const layout = gs.map((g) => ({ g, ps: g.items.map((p) => ({ p, x: p.x, y: p.y, r: p.r, it: p.it })) }));
    for (const L of layout) for (const q of L.ps) { const it = q.it; if (it.k === 'mag') items.set(it, { r: it.r.slice() }); else if (it.k === 'ammo') items.set(it, { n: it.n }); }
    return { guns, layout, items, slot: me.slot };
  }
  function restore(me, s) {
    for (const q of s.guns) { const w = q.w; w.mag = q.mag; w.chamber = q.chamber; w.ammo = q.ammo; if (q.tube) w.tube = q.tube.slice(); if (q.spent) w.spent = q.spent.slice(); else delete w.spent; w.spentCh = q.spentCh; }
    for (const L of s.layout) { L.g.items.length = 0; for (const q of L.ps) { q.p.x = q.x; q.p.y = q.y; q.p.r = q.r; q.p.it = q.it; L.g.items.push(q.p); } }
    for (const [it, v] of s.items) { if (v.r) { it.r.length = 0; it.r.push(...v.r); } else it.n = v.n; }
    me.reloading = false; me.act = null; me.burstQ = 0; me.pressBuf = 0; // (whatever was half done with a magazine isn't any more)
  }

  // ---------------------------------------------------------------- every frame
  const on = () => S.inside;
  function update(dt) {
    const me = G.Me;
    if (!S.root || !me || !me.pos || me.seat != null) return;
    const inside = me.pos.z - RZ < -0.4; // (past the garage door's threshold)
    if (inside && !S.inside) {
      S.inside = true;
      try { S.snap = snapshot(me); } catch (e) { S.snap = null; console.warn('range snapshot', e); }
      G.HUD.toast('THE RANGE', 'Fire as much as you like: what you use here comes back when you leave', 3.2);
    } else if (!inside && S.inside) {
      S.inside = false;
      back(me);
    }
    // the plates swing on their hooks and settle
    for (const t of S.tg) {
      if (t.kind !== 'steel') continue;
      t.vel += (-30 * t.swing - 2.6 * t.vel) * dt; t.swing += t.vel * dt;
      t.pivot.rotation.x = t.swing;
      if (t.flash > 0) { t.flash -= dt; const k = Math.max(0, t.flash / 0.25); t.mat.emissive.setRGB(0.5 * k, 0.4 * k, 0.2 * k); }
    }
  }
  function back(me) {
    if (S.snap) { restore(me || G.Me, S.snap); S.snap = null; G.HUD.toast('THE RANGE', 'Your ammunition is back as it was', 2.4); }
  }
  function leave() {
    if (S.snap && G.Me && G.Me.kit) { try { restore(G.Me, S.snap); } catch (e) { /* the kit changed under it */ } }
    if (S.hangar && S.hangar.map) for (const t of S.tg) G.World.remove(S.hangar.map.world, t.solid);
    S.snap = null; S.inside = false; S.root = null; S.tg = []; S.lanes = []; S.laneList = null;
  }

  return { decorate, build, update, leave, hit, on, reset, S, FL, PIS, RIF };
})();
