'use strict';
// First-person weapon handling: the arms, reloads, racking and inspecting.
//
// The viewmodel (js/gunmodels.js) gives each gun its moving parts (magazine, charging handle, side bolt
// handle, slide, pump, bolt, lever, belt cover, break-open barrels, revolver cylinder) and anchor points
// (grip, support hand, magazine well, ports). Every frame G.VMAnim.update() samples the clip that's
// playing for the current state (reloading, racking after the last shell, inspecting) and poses the parts
// and both hands. The arms run from fixed shoulders just off-screen to wherever the hands are, so a hand
// can leave the gun, go to a pouch for a magazine and come back.
G.VMAnim = (() => {
  const T = THREE;
  const S = (a, b, t) => G.U.smooth(a, b, t);
  const lerpV = (a, b, k) => a.clone().lerp(b, k);
  const v = (p) => (p ? new T.Vector3(p[2] || 0, p[1], -p[0]) : null); // [forward, up, right] -> gun space
  // shoulders (camera space: x right, y up, z back) and the pouch on your left hip, below the view
  const SHOULDER_R = new T.Vector3(0.3, -0.48, 0.28), SHOULDER_L = new T.Vector3(-0.3, -0.52, 0.2);
  const POUCH = new T.Vector3(-0.2, -0.62, -0.12);
  // where the left hand holds a magazine up to look at it (camera space), a little left of centre and low
  const FACE = new T.Vector3(-0.07, -0.15, -0.45);

  // ------------------------------------------------------------------ setup
  function makeArm(M) {
    const g = new T.Group();
    const sleeve = new T.Mesh(new T.CylinderGeometry(0.03, 0.036, 1, 10), M.fabric());
    const glove = new T.Group();
    glove.add(new T.Mesh(new T.BoxGeometry(0.046, 0.05, 0.085), M.glove()));
    const fingers = new T.Mesh(new T.BoxGeometry(0.042, 0.03, 0.04), M.glove()); fingers.position.set(0, -0.012, -0.05); glove.add(fingers);
    g.add(sleeve, glove);
    return { g, sleeve, glove };
  }
  function prop(kind, M) { // things carried in the hand: a shell, a speed loader, a stripper clip, a bolt
    const g = new T.Group();
    if (kind === 'shell') { const c = new T.Mesh(new T.CylinderGeometry(0.0095, 0.0095, 0.06, 10), new T.MeshStandardMaterial({ color: 0xa82a20, roughness: 0.6 })); c.rotation.x = Math.PI / 2; g.add(c); const b = new T.Mesh(new T.CylinderGeometry(0.0098, 0.0098, 0.014, 10), M.brass()); b.rotation.x = Math.PI / 2; b.position.z = 0.024; g.add(b); }
    else if (kind === 'loader') { const r = new T.Mesh(new T.CylinderGeometry(0.02, 0.02, 0.012, 14), M.black()); r.rotation.x = Math.PI / 2; g.add(r); for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; const c = new T.Mesh(new T.CylinderGeometry(0.0045, 0.0045, 0.035, 8), M.brass()); c.rotation.x = Math.PI / 2; c.position.set(Math.cos(a) * 0.012, Math.sin(a) * 0.012, -0.02); g.add(c); } }
    else if (kind === 'clip') { const c = new T.Mesh(new T.BoxGeometry(0.014, 0.03, 0.06), M.brass()); g.add(c); }
    else if (kind === 'bolt') { const c = new T.Mesh(new T.CylinderGeometry(0.003, 0.003, 0.36, 6), M.woodDark()); c.rotation.x = Math.PI / 2; g.add(c); }
    g.visible = false;
    return g;
  }
  // what kind of reload and which handle a weapon has
  function kinds(def) {
    const plat = G.Gunsmith.PLATFORMS[def.id], o = plat ? plat.spec : {}, arch = plat ? plat.arch : 'rifle';
    let reload = 'mag', action = 'ar';
    if (def.akimbo) reload = 'akimbo';
    else if (arch === 'revolver') reload = 'revolver';
    else if (arch === 'derringer' || o.rcv === 'break' || def.id === 'pocketgl') reload = 'break';
    else if (def.enbloc) reload = 'enbloc';
    else if (def.cls === 'BOW') reload = 'bow';
    else if (def.shell) reload = 'shell';
    else if (o.feed) reload = 'belt';
    if (arch === 'pistol') action = 'pistol';
    else if (o.bolt) action = 'bolt';
    else if (o.pump) action = 'pump';
    else if (o.lever) action = 'lever';
    else if (arch !== 'rifle') action = null;
    else if ((o.rcv || 'ar') !== 'ar' && !o.ch) action = o.rcv === 'break' ? null : 'handle';
    return { reload, action };
  }
  function prepare(root, def) {
    const M = G.GunModels.M, u = root.userData;
    const k = kinds(def);
    const hs = u.holders.map(({ holder, info, side }) => {
      const an = info.anim || {};
      const A = { G: v(info.grip), S: v(info.support), W: v(info.magAt), port: v(info.port), ch: v(info.ch), slide: v(info.slide), cyl: v(info.cylAt), bolt: v(info.bolt) };
      if (info.handle) A.H = v([info.handle.f, info.handle.y, info.handle.x]);
      // the bottom of the magazine, where the hand takes hold of it
      if (an.mag) {
        const box = new T.Box3().setFromObject(an.mag);
        an.mag.updateMatrixWorld(true);
        const inv = new T.Matrix4().copy(holder.matrixWorld).invert();
        box.applyMatrix4(inv);
        A.WB = new T.Vector3((box.min.x + box.max.x) / 2, info.magTop ? box.max.y : box.min.y, (box.min.z + box.max.z) / 2);
        A.magHome = an.mag.position.clone(); A.magQ = an.mag.quaternion.clone();
        A.magGrab = A.WB.clone().sub(an.mag.position); // hand -> magazine origin offset (inverted below)
      }
      if (an.handle) A.handleHome = an.handle.position.clone();
      if (an.ch) A.chHome = an.ch.position.clone();
      if (an.cyl) A.cylHome = an.cyl.position.clone();
      return { holder, info, side, an, A, travel: info.handle ? info.handle.travel : 0.07 };
    });
    const R = makeArm(M), L = makeArm(M);
    root.add(R.g, L.g);
    const props = { shell: prop('shell', M), loader: prop('loader', M), clip: prop('clip', M), bolt: prop('bolt', M) };
    for (const p of Object.values(props)) hs[0].holder.add(p);
    u.vma = { def, k, hs, R, L, props, drop: null, chv: chamberView(hs[0], def, M), fw: 0 };
  }

  // What a chamber check shows: the ejection port open (a dark window on the right of the receiver, or on top of
  // a pistol's slide) with the round in it, if there is one, its case and tip set in just under the edge; on a
  // break-action, the shell heads sitting in the breech (seen whenever the barrels are open).
  // a case head seen from behind: brass; a shotshell's with a ring of its hull's colour round it (its load)
  function head(r, th, shot, M) {
    const g = new T.Group(), b = new T.Mesh(new T.CylinderGeometry(shot ? r * 0.8 : r, shot ? r * 0.8 : r, th, 16), M.brass());
    b.rotation.x = Math.PI / 2; b.position.z = shot ? 0.0005 : 0; g.add(b);
    if (shot) { const ring = new T.Mesh(new T.CylinderGeometry(r, r, th, 16), shellMat('buck')); ring.rotation.x = Math.PI / 2; g.add(ring); g.userData.ring = ring; }
    return g;
  }
  function chamberView(h, def, M) {
    const c = h.info.chamberAt;
    if (!c) return null;
    const grp = (G.CALIBERS[G.calOf(def)] || { group: 'rifle' }).group, shot = grp === 'shotgun';
    if (c.side === 'cyl') { // a revolver: six case heads on the back of the cylinder, one per round in it
      if (!h.an.cyl) return null;
      const heads = [];
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2, d = head(c.r * 1.15, 0.0016, shot, M);
        d.position.set(Math.sin(a) * c.R, Math.cos(a) * c.R, c.z + 0.0006);
        h.an.cyl.add(d); heads.push(d);
      }
      return { heads, shot };
    }
    if (c.side === 'breech') {
      if (!h.an.brk) return null;
      const heads = c.heads.map(([x, y]) => {
        const d = head(c.r * 1.05, 0.003, shot, M);
        d.position.set(x, y, c.z);
        h.an.brk.add(d);
        return d;
      });
      return { heads, shot };
    }
    const r = shot ? 0.0092 : grp === 'pistol' ? 0.0045 : 0.0048, len = shot ? 0.05 : grp === 'pistol' ? 0.026 : 0.042;
    // (a pistol's slide has a real port cut in it: the round just sits in the barrel under it, always there to see.
    // A rifle's receiver is solid, so the open port's drawn: a dark window on its right side.)
    const g = new T.Group(), real = c.side === 'port', top = c.side === 'top';
    const plate = real ? null : top ? new T.Mesh(new T.BoxGeometry(Math.min(c.w, 2 * r + 0.006), 0.0012, len + 0.014), DARK) : new T.Mesh(new T.BoxGeometry(0.0012, 2 * r + 0.006, len + 0.014), DARK);
    if (plate && top) plate.position.set(c.x, c.y + 0.0007, -c.f); else if (plate) plate.position.set(c.x + 0.0007, c.y, -c.f);
    const round = new T.Group();
    const piece = (rf, rr, l, m, z) => // (front radius, rear radius)
       { const geo = new T.CylinderGeometry(rf, rr, l, 14); geo.rotateX(-Math.PI / 2); /* (its top end to the front) */ const me = new T.Mesh(geo, m); me.position.z = z; round.add(me); return me; };
    let face; // (what shows the load: a shell's hull, a bullet's tip)
    if (shot) { face = piece(r, r, len * 0.75, shellMat('buck'), -len * 0.125); piece(r * 1.04, r * 1.04, len * 0.25, M.brass(), len * 0.375); }
    else { piece(r, r, len * 0.72, M.brass(), len * 0.14); face = piece(0.0012, r * 0.95, len * 0.28, tipMat('ball'), -len * 0.36); }
    if (real) round.position.set(c.x, c.y - r, -c.f); else if (top) round.position.set(c.x, c.y - r + 0.0028, -c.f); else round.position.set(c.x - r + 0.0028, c.y, -c.f);
    g.add(round); if (plate) g.add(plate);
    g.visible = false;
    h.holder.add(g);
    return { g, round, face, shot, real };
  }

  // ------------------------------------------------------------------ clips
  // Each clip is a function of normalised time returning a pose:
  //   gun: [x, y, z, rx, ry, rz] added to the viewmodel; L / R: hand targets in gun space (null = resting);
  //   mag: { mode: 'in' | 'hand' | 'drop' | 'gone', at }; ch / handle / slide: rack amount 0..1;
  //   cyl: revolver cylinder swung out 0..1; brk: barrels opened 0..1; cover: belt cover opened 0..1;
  //   prop: { kind, at } something carried in the left hand.
  const path = (t, keys) => { // keys: [[t, Vector3], ...] eased between neighbours
    let i = 0;
    while (i < keys.length - 2 && t > keys[i + 1][0]) i++;
    const [t0, a] = keys[i], [t1, b] = keys[i + 1];
    return lerpV(a, b, S(t0, t1, t));
  };
  const off = (p, f = 0, y = 0, x = 0) => p.clone().add(new T.Vector3(x, y, -f));

  // Racking: pull the charging handle / bolt handle / slide, let it fly. c: 0..1 over the rack.
  function rack(c, h, kind, pose) {
    const A = h.A;
    if (kind === 'pistol') {
      const g = off(A.slide, -0.02, 0.012);
      pose.L = path(c, [[0, A.S], [0.3, g], [0.55, off(g, -0.045)], [0.62, g], [1, A.S]]);
      pose.slide = S(0.3, 0.55, c) * (1 - S(0.55, 0.62, c));
      const r = S(0.1, 0.3, c) * (1 - S(0.7, 1, c));
      pose.gun[5] -= 0.35 * r; pose.gun[0] -= 0.05 * r; pose.gun[1] += 0.03 * r; pose.gun[3] += 0.15 * r;
    } else if (kind === 'ar' && A.ch) {
      pose.L = path(c, [[0, A.S], [0.32, off(A.ch, 0, 0.012)], [0.52, off(A.ch, -0.065, 0.012)], [0.6, off(A.ch, 0, 0.012)], [1, A.S]]);
      pose.ch = S(0.32, 0.52, c) * (1 - S(0.52, 0.6, c));
      const r = S(0.05, 0.3, c) * (1 - S(0.7, 1, c));
      pose.gun[3] += 0.35 * r; pose.gun[2] -= 0.1 * r; pose.gun[0] -= 0.04 * r; pose.gun[1] += 0.02 * r;
    } else if (kind === 'handle' && A.H) {
      pose.L = path(c, [[0, A.S], [0.3, A.H], [0.52, off(A.H, -h.travel)], [0.6, A.H], [1, A.S]]);
      pose.handle = S(0.3, 0.52, c) * (1 - S(0.52, 0.6, c));
      const r = S(0.05, 0.3, c) * (1 - S(0.7, 1, c));
      pose.gun[5] += (A.H.x > 0 ? 0.45 : -0.3) * r; pose.gun[3] += 0.2 * r; pose.gun[0] -= 0.05 * r; pose.gun[1] += 0.03 * r; // turn the handle side toward you
    } else if (kind === 'bolt' && A.bolt) {
      const knob = off(A.bolt, 0, 0, 0.0);
      pose.R = path(c, [[0, A.G], [0.25, knob], [0.4, off(knob, 0, 0.02)], [0.6, off(knob, -0.08, 0.02)], [0.75, off(knob, 0, 0.02)], [0.85, knob], [1, A.G]]);
      pose.bolt = [S(0.25, 0.4, c) * (1 - S(0.75, 0.85, c)), S(0.4, 0.6, c) * (1 - S(0.6, 0.75, c))];
    } else if (kind === 'pump') {
      pose.pump = S(0.1, 0.45, c) * (1 - S(0.5, 0.9, c));
    } else if (kind === 'lever') {
      pose.lever = S(0.1, 0.45, c) * (1 - S(0.5, 0.9, c));
    }
  }

  // Box/stick magazine (rifles, SMGs, pistols, P90, minigun box, railgun bank), then, from empty, the action:
  // act 'release' (it locked open on its last round: a thumb on the bolt catch or the slide stop) or 'rack' (worked
  // by hand), over the last (1 - split) of the time. how: 'retain' (the old magazine goes back in its pouch first),
  // 'pouch' (into the dump pouch, lower down), or 'floor' / anything else (let go of it)
  function magClip(t, h, act, kind, freeDrop, how, split) {
    const A = h.A, pose = base();
    const e = act ? split || 0.75 : 1, m = Math.min(1, t / e), c = act ? G.U.clamp((t - e) / (1 - e), 0, 1) : 0;
    if (act === 'release' && kind === 'pistol') pose.slide = 1; // (locked back the whole time, till it's released)
    const WB = A.WB || A.S, below = off(WB, 0.0, -0.07);
    const tilt = S(0.02, 0.14, m) * (1 - S(0.72, 0.9, m));
    // bring the magazine well up into view: lift, pull toward the middle, muzzle up, cant right
    pose.gun[3] += 0.42 * tilt; pose.gun[5] -= 0.5 * tilt; pose.gun[1] += 0.05 * tilt; pose.gun[0] -= 0.07 * tilt; pose.gun[2] += 0.02 * tilt;
    if (m < 1) {
      if (how === 'retain' || how === 'pouch') {
        // old one out, carried down and stowed (the hand pauses in the pouch), a fresh one out, in
        const P = how === 'pouch' ? off(A.P, -0.02, -0.07) : A.P, Pin = off(P, 0, -0.035);
        pose.L = path(m, [[0, A.S], [0.1, WB], [0.18, below], [0.32, P], [0.38, Pin], [0.44, Pin], [0.48, A.P], [0.53, off(A.P, 0, -0.03)], [0.58, A.P], [0.68, below], [0.74, WB], [0.78, off(WB, 0, 0.012)], [0.9, A.S], [1, A.S]]);
        pose.mag = m < 0.1 ? { mode: 'in' } : m < 0.38 ? { mode: 'hand' } : m < 0.53 ? { mode: 'gone' } : m < 0.74 ? { mode: 'hand' } : { mode: 'in' };
        if (m > 0.74 && m < 0.8) pose.gun[1] += 0.008 * Math.sin(Math.PI * (m - 0.74) / 0.06); // seat it
      } else if (freeDrop) { // pistols: the magazine falls out when you hit the release
        pose.L = path(m, [[0, A.S], [0.12, off(A.S, -0.02, -0.04)], [0.36, A.P], [0.44, A.P], [0.58, below], [0.66, WB], [0.7, off(WB, 0, 0.012)], [0.86, A.S], [1, A.S]]);
        pose.mag = m < 0.06 ? { mode: 'in' } : m < 0.42 ? { mode: 'drop', at: 0.06 } : m < 0.66 ? { mode: 'hand' } : { mode: 'in' };
      } else {
        pose.L = path(m, [[0, A.S], [0.14, WB], [0.22, below], [0.36, A.P], [0.44, A.P], [0.58, below], [0.66, WB], [0.7, off(WB, 0, 0.012)], [0.86, A.S], [1, A.S]]);
        pose.mag = m < 0.14 ? { mode: 'in' } : m < 0.24 ? { mode: 'hand' } : m < 0.42 ? { mode: 'drop', at: 0.24 } : m < 0.66 ? { mode: 'hand' } : { mode: 'in' };
      }
      if (how !== 'retain' && how !== 'pouch' && m > 0.66 && m < 0.72) pose.gun[1] += 0.008 * Math.sin(Math.PI * (m - 0.66) / 0.06); // seat it
    }
    if (act === 'rack' && c > 0) rack(c, h, kind, pose);
    if (act === 'release' && c > 0) release(c, h, kind, pose);
    return pose;
  }
  // Sending the action home from where it locked open: the left thumb on the slide stop (a pistol) or the palm
  // on the bolt catch over the magazine well (a rifle); the slide (or bolt) slams forward and the gun jumps.
  function release(c, h, kind, pose) {
    const A = h.A;
    const at = kind === 'pistol' ? off(A.G, 0.035, 0.045, -0.02) : off(A.W || A.WB || A.S, 0.01, 0.045, -0.03);
    pose.L = path(c, [[0, A.S], [0.35, at], [0.5, off(at, 0, -0.008)], [0.7, A.S], [1, A.S]]);
    if (kind === 'pistol') pose.slide = 1 - S(0.42, 0.5, c);
    const j = c > 0.45 && c < 0.65 ? Math.sin(Math.PI * (c - 0.45) / 0.2) : 0;
    pose.gun[2] += 0.012 * j; pose.gun[3] += 0.03 * j;
    const r = S(0, 0.3, c) * (1 - S(0.7, 1, c)); pose.gun[5] -= 0.25 * r; pose.gun[3] += 0.12 * r; // (turned a little to get at it)
  }
  // Belt-fed: cover up, box out, new box in, lay the belt, cover down, rack.
  function beltClip(t, h, empty) {
    const A = h.A, pose = base(), WB = A.WB || A.S;
    const top = off(A.port || A.S, 0, 0.03);
    const tilt = S(0.02, 0.12, t) * (1 - S(0.86, 0.96, t));
    pose.gun[5] += 0.3 * tilt; pose.gun[3] += 0.1 * tilt;
    pose.cover = S(0.06, 0.16, t) * (1 - S(0.74, 0.82, t));
    pose.L = path(t, [[0, A.S], [0.08, top], [0.16, off(top, 0, 0.04)], [0.24, WB], [0.3, off(WB, 0, -0.08)], [0.4, A.P], [0.46, A.P], [0.58, off(WB, 0, -0.06)], [0.62, WB], [0.7, top], [0.76, off(top, 0, 0.04)], [0.82, top], [0.9, A.S], [1, A.S]]);
    pose.mag = t < 0.24 ? { mode: 'in' } : t < 0.3 ? { mode: 'hand' } : t < 0.46 ? { mode: 'drop', at: 0.3 } : t < 0.62 ? { mode: 'hand' } : { mode: 'in' };
    if (empty && t > 0.84 && A.H) { const c = (t - 0.84) / 0.16; pose.handle = S(0.2, 0.6, c) * (1 - S(0.6, 0.8, c)); }
    return pose;
  }
  // One round at a time into a tube / internal magazine / drum.
  function shellClip(t, h) {
    const A = h.A, pose = base(), port = A.port || A.S;
    const under = port.y < -0.02, side = port.x > 0.01;
    const tilt = S(0.0, 0.2, t) * (1 - S(0.8, 1, t));
    pose.gun[5] += (under ? 0.45 : side ? -0.4 : 0.1) * tilt; pose.gun[3] += (under ? -0.05 : 0.1) * tilt;
    const into = under ? off(port, 0.01, 0.0) : side ? off(port, 0, 0, 0.02) : off(port, 0, 0.03);
    pose.L = path(t, [[0, A.S], [0.3, A.P], [0.38, A.P], [0.62, into], [0.72, port], [0.8, port], [1, A.S]]);
    if (t > 0.34 && t < 0.72) pose.prop = { kind: 'shell' };
    return pose;
  }
  function revolverClip(t, h) {
    const A = h.A, pose = base(), cyl = A.cyl || A.S;
    const out = S(0.06, 0.16, t) * (1 - S(0.78, 0.86, t));
    pose.cyl = out;
    pose.gun[5] += 0.55 * S(0.02, 0.14, t) * (1 - S(0.84, 0.95, t));
    pose.gun[3] += 0.8 * S(0.16, 0.26, t) * (1 - S(0.3, 0.38, t)) - 0.25 * S(0.38, 0.5, t) * (1 - S(0.8, 0.92, t)); // muzzle up to eject, down to load
    const behind = off(cyl, -0.05, 0, -0.03);
    pose.L = path(t, [[0, A.S], [0.12, off(cyl, 0, -0.02, -0.04)], [0.32, off(cyl, 0, -0.02, -0.04)], [0.46, A.P], [0.52, A.P], [0.64, behind], [0.7, off(behind, 0.02)], [0.76, off(behind, 0.02)], [0.82, off(cyl, 0, -0.01, -0.03)], [0.94, A.S], [1, A.S]]);
    if (t > 0.48 && t < 0.74) pose.prop = { kind: 'loader' };
    return pose;
  }
  function breakClip(t, h) {
    const A = h.A, pose = base(), port = A.port || A.S;
    pose.brk = S(0.04, 0.16, t) * (1 - S(0.8, 0.9, t));
    pose.gun[3] -= 0.2 * S(0.02, 0.14, t) * (1 - S(0.85, 1, t));
    pose.gun[5] += 0.2 * S(0.02, 0.14, t) * (1 - S(0.85, 1, t));
    pose.L = path(t, [[0, A.S], [0.3, A.P], [0.38, A.P], [0.56, off(port, -0.02, 0.03)], [0.66, off(port, 0.01, 0.0)], [0.78, A.S], [0.84, off(A.S, 0, 0.03)], [1, A.S]]);
    if (t > 0.34 && t < 0.66) pose.prop = { kind: 'shell' };
    return pose;
  }
  function enblocClip(t, h) {
    const A = h.A, pose = base(), port = A.port || A.S;
    pose.gun[5] += 0.25 * S(0.0, 0.15, t) * (1 - S(0.8, 1, t));
    pose.L = path(t, [[0, A.S], [0.25, A.P], [0.32, A.P], [0.48, off(port, 0, 0.06)], [0.56, off(port, 0, 0.01)], [0.6, off(port, 0.05, 0.04)], [0.86, A.S], [1, A.S]]);
    if (t > 0.3 && t < 0.56) pose.prop = { kind: 'clip' };
    if (t > 0.56 && t < 0.62) pose.gun[2] += 0.02 * Math.sin(Math.PI * (t - 0.56) / 0.06); // op rod slams home
    return pose;
  }
  function bowClip(t, h) {
    const A = h.A, pose = base(), port = A.port || A.S;
    pose.gun[3] += 0.35 * S(0.0, 0.15, t) * (1 - S(0.85, 1, t));
    pose.L = path(t, [[0, A.S], [0.25, A.P], [0.32, A.P], [0.5, off(port, -0.05, 0.03)], [0.7, off(port, 0.12, 0.03)], [0.85, A.S], [1, A.S]]);
    if (t > 0.3 && t < 0.72) pose.prop = { kind: 'bolt' };
    return pose;
  }
  // Show it off: left side, then the top and right, then a chamber check. Holding I holds the chamber check
  // open (t stops at INSPECT_HOLD) and the mouse turns the gun (rot: [yaw, pitch]) to look in from either side.
  const INSPECT_HOLD = 0.69;
  // the chamber check's pose, on top of the turn (gun [x, y, z, rx, ry, rz]): the port faces your eye
  const RIFLE_CV = [-0.03, 0.01, -0.18, 0.21, 0.95, 1.05], PISTOL_CV = [-0.04, 0.04, -0.1, 0.1, 1.7, 0.25], BREAK_CV = [-0.06, -0.08, -0.08, 0.8, 0.4, 0.2], REV_CV = [0.02, 0.02, -0.06, 0.3, -0.5, -0.5], BOLT_CV = [-0.03, -0.01, -0.18, 0.31, 0.55, 0.25]; // (a bolt gun: less cant, its open top toward you) // (a break-action: low, its top tipped up at you, looking down into the breech)
  function inspectClip(t, h, kind, rot) {
    const A = h.A, pose = base();
    if (rot) { pose.gun[5] -= rot[0]; pose.gun[3] -= rot[1]; } // (side to side rolls it over, up and down tips the muzzle)
    const a = S(0.0, 0.18, t) * (1 - S(0.36, 0.5, t)), b = S(0.4, 0.55, t) * (1 - S(0.8, 0.95, t));
    pose.gun[4] += 0.95 * a - 0.5 * b; pose.gun[5] += -0.3 * a + 0.35 * b; pose.gun[3] += 0.12 * a + 0.32 * b;
    pose.gun[0] -= 0.02 * a; pose.gun[2] += 0.04 * (a + b); pose.gun[1] += 0.02 * a;
    const c = G.U.clamp((t - 0.58) / 0.22, 0, 1);
    // for the chamber check: muzzle level, nearer, canted so the port faces you
    const cv = S(0, 0.25, c) * (1 - S(0.75, 1, c));
    pose.chk = kind === 'break' || kind === 'revolver' ? 0 : cv; // (the port open: js/vmanim.js chamberView)
    // (a pistol: its port's on top of the slide, so tip the muzzle down and look in from above instead)
    const CV = kind === 'pistol' ? PISTOL_CV : kind === 'break' ? BREAK_CV : kind === 'revolver' ? REV_CV : kind === 'bolt' ? BOLT_CV : RIFLE_CV;
    for (let i = 0; i < 6; i++) pose.gun[i] += CV[i] * cv;
    if (c > 0 && c < 1) {
      if (kind === 'pistol' && A.slide) { const g = off(A.slide, -0.035, 0.002, -0.024); pose.L = path(c, [[0, A.S], [0.25, g], [0.5, off(g, -0.014)], [0.7, g], [1, A.S]]); /* (pinching the back of the slide from the left, clear of the port) */ pose.slide = 0.35 * S(0.25, 0.5, c) * (1 - S(0.6, 0.75, c)); }
      else if (kind === 'ar' && A.ch) { // the bolt locked back, then the hand off it and back on the handguard so you can see in
        pose.L = path(c, [[0, A.S], [0.18, off(A.ch, 0, 0.012)], [0.32, off(A.ch, -0.04, 0.012)], [0.5, A.S], [1, A.S]]);
        pose.ch = 0.6 * S(0.18, 0.32, c) * (1 - S(0.38, 0.5, c)); // (the handle goes home; the bolt stays locked back)
      }
      else if (kind === 'handle' && A.H) { // the handle back and caught there (as an HK's is), the hand back on the gun so you can see in
        pose.L = path(c, [[0, A.S], [0.18, A.H], [0.32, off(A.H, -h.travel * 0.6)], [0.5, A.S], [1, A.S]]);
        pose.handle = 0.6 * S(0.18, 0.32, c) * (1 - S(0.75, 0.85, c));
      }
      else if (kind === 'bolt' && A.bolt) { // bolt up and back, the hand back on the grip while you look in, then it closes it
        const back = off(A.bolt, -0.06);
        pose.R = path(c, [[0, A.G], [0.18, A.bolt], [0.34, back], [0.48, A.G], [0.76, A.G], [0.86, back], [0.95, A.bolt], [1, A.G]]);
        pose.bolt = [S(0.18, 0.26, c) * (1 - S(0.92, 0.97, c)), 0.5 * S(0.26, 0.34, c) * (1 - S(0.86, 0.92, c))];
      }
      else if (kind === 'pump') pose.pump = 0.35 * S(0.2, 0.45, c) * (1 - S(0.6, 0.8, c));
      else if (kind === 'lever') pose.lever = 0.4 * S(0.2, 0.45, c) * (1 - S(0.6, 0.8, c));
      else if (kind === 'break') { pose.brk = S(0.15, 0.4, c) * (1 - S(0.65, 0.85, c)); const low = off(A.S, -0.02, -0.06, -0.05); pose.L = path(c, [[0, A.S], [0.25, low], [0.75, low], [1, A.S]]); } // (the left hand down under the barrels, out of the way)
      else if (kind === 'revolver') { pose.cyl = S(0.15, 0.4, c) * (1 - S(0.65, 0.85, c)); const under = off(A.cyl || A.S, 0.05, -0.035, -0.03); pose.L = path(c, [[0, A.S], [0.2, under], [0.8, under], [1, A.S]]); } // (thumb on the cylinder from in front and below: its back is clear to see)
      else if (A.WB) { pose.mag = { mode: 'peek', d: 0.025 * S(0.2, 0.4, c) * (1 - S(0.6, 0.8, c)) }; pose.L = path(c, [[0, A.S], [0.2, A.WB], [0.8, A.WB], [1, A.S]]); }
    }
    return pose;
  }
  // Hold R: the magazine out into the left hand and up in front of you, held upright (as it sits in the gun, its back
  // and witness holes toward you); then the mouse turns
  // it in your hand as far as a wrist goes (mc.yaw: rolled about its length, mc.pitch: tipped toward or away) to
  // see the witness holes down its back or the rounds through a clear one. mc.k: out 0..1, mc.back: going back 0..1.
  function magCheckClip(mc, h, Qh) {
    const A = h.A, pose = base(), WB = A.WB || A.S, below = off(WB, 0.0, -0.07);
    const p = mc.back > 0 ? 1 - mc.back : mc.k;
    const g = S(0.0, 0.45, p);
    pose.gun[0] += 0.07 * g; pose.gun[1] -= 0.06 * g; pose.gun[5] -= 0.45 * g; pose.gun[3] -= 0.08 * g; pose.gun[4] -= 0.15 * g; // the gun down and away to the right
    pose.L = path(p, [[0, A.S], [0.22, WB], [0.4, below], [1, A.F]]);
    if (p < 0.22) { pose.mag = { mode: 'in' }; return pose; }
    // its turn in camera space: upright, tipped as the mouse tips it, then rolled; back into the gun's frame (Qh: the gun's turn)
    const tip = mc.pitch, k = S(0.4, 1, p);
    const qc = new T.Quaternion().setFromEuler(new T.Euler(tip * k, mc.yaw * k, 0, 'XYZ')).multiply(A.magQ);
    pose.mag = { mode: 'chk', q: Qh.clone().invert().multiply(qc).slerp(A.magQ, 1 - S(0.22, 0.5, p)) };
    return pose;
  }
  // whether this gun's magazine can be pulled to check it
  function canMagCheck(vm) {
    const a = vm && vm.userData.vma;
    return !!(a && a.k.reload === 'mag' && !a.def.akimbo && a.hs[0].an.mag && a.hs[0].A.WB && !a.hs[0].info.magTop);
  }
  const base = () => ({ gun: [0, 0, 0, 0, 0, 0], L: null, R: null, mag: { mode: 'in' }, ch: 0, handle: 0, slide: null, cyl: 0, brk: 0, cover: 0, pump: null, lever: null, bolt: null, prop: null });

  const _m = new T.Matrix4(), _inv = new T.Matrix4();
  // ------------------------------------------------------------------ per frame
  // pl: the player. Returns the gun offset [x, y, z, rx, ry, rz] to add to the viewmodel pose.
  function sample(pl, vm) {
    const u = vm.userData, a = u.vma;
    if (!a) return [0, 0, 0, 0, 0, 0];
    const h = a.hs[0];
    // the pouch, in this gun's space (from last frame's pose: close enough)
    vm.updateMatrix(); h.holder.updateMatrix();
    h.A.P = POUCH.clone().applyMatrix4(_inv.copy(vm.matrix).invert()).applyMatrix4(_m.copy(h.holder.matrix).invert());
    h.A.F = FACE.clone().applyMatrix4(_inv).applyMatrix4(_m);
    let pose = null;
    const { reload, action } = a.k;
    if (pl.reloading && pl.reloadTotal) {
      const t = G.U.clamp(1 - pl.reloadT / pl.reloadTotal, 0, 1);
      if (reload === 'shell') pose = shellClip(t, h);
      else if (reload === 'revolver') pose = revolverClip(t, h);
      else if (reload === 'break') pose = breakClip(t, h);
      else if (reload === 'enbloc') pose = enblocClip(t, h);
      else if (reload === 'bow') pose = bowClip(t, h);
      else if (reload === 'belt') pose = beltClip(t, h, pl.reloadEmpty);
      else if (reload === 'akimbo') { pose = base(); const tilt = S(0.02, 0.15, t) * (1 - S(0.75, 0.92, t)); pose.gun[3] += 0.4 * tilt; pose.gun[1] -= 0.04 * tilt; pose.mag = t < 0.08 ? { mode: 'in' } : t < 0.4 ? { mode: 'drop', at: 0.08 } : t < 0.62 ? { mode: 'gone' } : { mode: 'rise', k: S(0.62, 0.72, t) }; }
      else pose = magClip(t, h, pl.reloadAct, action === 'pistol' ? 'pistol' : action === 'bolt' ? 'bolt' : a.hs[0].A.ch ? 'ar' : 'handle', action === 'pistol', pl.reloadMode, pl.reloadSplit);
    } else if (pl.rackT > 0) {
      pose = base(); rack(1 - pl.rackT / 0.5, h, action, pose);
    } else if (pl.magChk && canMagCheck(vm)) {
      const Qh = new T.Quaternion(); _m.copy(vm.matrix).multiply(h.holder.matrix).decompose(new T.Vector3(), Qh, new T.Vector3());
      pose = magCheckClip(pl.magChk, h, Qh);
    } else if (pl.inspectT > 0) {
      const kind = action === 'pistol' || action === 'bolt' || action === 'pump' || action === 'lever' ? action : reload === 'revolver' || reload === 'break' ? reload : h.A.ch ? 'ar' : 'handle';
      pose = inspectClip(1 - pl.inspectT / pl.inspectDur, h, kind, pl.inspHold || pl.inspYaw || pl.inspPitch ? [pl.inspYaw || 0, pl.inspPitch || 0] : null);
    }
    a.pose = pose;
    a.reloadT = pl.reloading ? 1 - pl.reloadT / (pl.reloadTotal || 1) : -1;
    return pose ? pose.gun : [0, 0, 0, 0, 0, 0];
  }

    // After the viewmodel is posed: parts and hands.
  function apply(pl, vm, cyc) {
    const u = vm.userData, a = u.vma;
    if (!a) return;
    const pose = a.pose, w = pl.cur();
    vm.updateMatrix();
    _inv.copy(vm.matrix).invert();
    a.hs.forEach((h, idx) => {
      const A = h.A, an = h.an;
      h.holder.updateMatrix();
      const res = (p) => p;
      // magazine
      if (an.mag && A.magHome) {
        const mg = pose ? pose.mag : { mode: 'in' };
        an.mag.visible = mg.mode !== 'gone';
        if (mg.mode !== 'chk') an.mag.quaternion.copy(A.magQ);
        if (idx === 0 && !pl.reloading) magFill(a, an.mag, w, pl.magSize(w.def));
        if (mg.mode === 'in') an.mag.position.copy(A.magHome);
        else if (mg.mode === 'peek') an.mag.position.copy(A.magHome).y -= mg.d;
        else if (mg.mode === 'rise') { an.mag.position.copy(A.magHome); an.mag.position.y -= 0.15 * (1 - mg.k); }
        else if (mg.mode === 'hand' && pose.L) { const hand = res(pose.L); an.mag.position.copy(hand).sub(A.WB).add(A.magHome); }
        else if (mg.mode === 'chk' && pose.L) { // turned in the hand about where the hand holds it
          an.mag.quaternion.copy(mg.q);
          const rel = mg.q.clone().multiply(A.magQ.clone().invert());
          an.mag.position.copy(A.magHome).sub(A.WB).applyQuaternion(rel).add(pose.L);
        }
        else if (mg.mode === 'drop') {
          if (!a.drop || a.drop.idx !== idx || a.drop.at !== mg.at) a.drop = { idx, at: mg.at, from: an.mag.position.clone(), t0: performance.now() };
          const tt = (performance.now() - a.drop.t0) / 1000;
          an.mag.position.copy(a.drop.from); an.mag.position.y -= 0.5 * 9.8 * tt * tt; an.mag.position.z += 0.05 * tt;
          an.mag.visible = tt < 0.5;
        }
        if (mg.mode !== 'drop' && a.drop && a.drop.idx === idx) a.drop = null;
      }
      // handles and slides
      if (an.ch && A.chHome) an.ch.position.copy(A.chHome).z += (pose ? pose.ch : 0) * 0.065;
      if (an.handle && A.handleHome) an.handle.position.copy(A.handleHome).z += (pose ? pose.handle : 0) * h.travel;
      if (an.slide && pose && pose.slide != null) an.slide.position.z = pose.slide * 0.04;
      if (an.cyl && A.cylHome) { const k = pose ? pose.cyl : 0; an.cyl.position.copy(A.cylHome); an.cyl.position.x -= 0.05 * k; an.cyl.position.y -= 0.016 * k; /* (swung clear of the frame) */ }
      if (an.brk) an.brk.rotation.x = (pose ? pose.brk : 0) * (a.k.reload === 'break' && G.Gunsmith.PLATFORMS[a.def.id].arch === 'derringer' ? -0.9 : -0.55); // (a derringer's hinge is at the top front: its breech swings up)
      if (an.cover) an.cover.rotation.x = (pose ? pose.cover : 0) * 1.1;
      if (an.pump && pose && pose.pump != null) an.pump.position.z = pose.pump * 0.085;
      if (an.lever) an.lever.rotation.x = (pose && pose.lever != null ? pose.lever : cyc && a.k.action === 'lever' ? cyc : 0) * 0.9;
      if (an.bolt && pose && pose.bolt) { an.bolt.rotation.z = pose.bolt[0] * 1.3; an.bolt.position.z = pose.bolt[1] * 0.12; }

      // hands: resting on the gun unless the clip has them somewhere else
      let Rt = pose && pose.R ? res(pose.R) : A.G.clone(), Lt = pose && pose.L ? res(pose.L) : A.S.clone();
      // working the action between shots: the right hand on the bolt, the left riding the pump
      if (!pose && cyc > 0) {
        if (a.k.action === 'bolt' && A.bolt && an.bolt) Rt = lerpV(A.G, an.bolt.position.clone().add(new T.Vector3(0.068, 0, 0)), Math.min(1, cyc * 2.5));
        if (a.k.action === 'pump' && an.pump) Lt = A.S.clone().add(new T.Vector3(0, 0, an.pump.position.z));
      }
      if (a.def.akimbo) { // one gun in each hand
        const arm = h.side > 0 ? a.R : a.L, sh = h.side > 0 ? SHOULDER_R : SHOULDER_L;
        place(arm, sh.clone().applyMatrix4(_inv), A.G.clone().applyMatrix4(h.holder.matrix));
        return;
      }
      if (idx === 0) {
        place(a.R, SHOULDER_R.clone().applyMatrix4(_inv), Rt.applyMatrix4(h.holder.matrix));
        place(a.L, SHOULDER_L.clone().applyMatrix4(_inv), Lt.clone().applyMatrix4(h.holder.matrix));
        // looking something over, the hands turn with it: the right with the gun on its grip, the left under
        // the magazine it's holding (eased in and out so nothing snaps)
        const look = !!(pose && (pl.inspectT > 0 || pl.magChk));
        a.fw += ((look ? 1 : 0) - a.fw) * 0.15;
        const gq = _q2.copy(h.holder.quaternion); // (the gun's turn in the viewmodel, where the arms are)
        // the right hand's hold on the grip, as it sits at rest (relative to the gun, once it's settled back): kept, locked, while it turns
        if ((!pose && a.fw < 0.02) || !a.gripQ) { a.gripQ = (a.gripQ || new T.Quaternion()); a.gripQ.copy(gq).invert().multiply(a.R.glove.quaternion); }
        if (a.fw > 0.01) {
          a.R.glove.quaternion.slerp(_q3.copy(gq).multiply(a.gripQ), a.fw);
          if (pose.mag && pose.mag.mode === 'chk' && an.mag) {
            const mq = _q3.copy(h.holder.quaternion).multiply(an.mag.quaternion);
            a.L.glove.quaternion.slerp(mq.multiply(PALM_Q), a.fw);
            a.L.glove.position.add(_v2.set(0, -0.024, 0).applyQuaternion(mq));
          }
        }
        // the chamber: the port open during a check, the round in it if there is one
        const chv = a.chv;
        if (chv && chv.heads) chv.heads.forEach((d, i) => { // (a head per round in it, each ringed for its own load)
          d.visible = i < (w.mag || 0);
          if (d.visible && d.userData.ring) d.userData.ring.material = shellMat((w.tube && w.tube[i]) || w.ammo);
        });
        else if (chv) {
          chv.g.visible = chv.real || !!(pose && pose.chk > 0.35);
          // (a gun whose chamber is its magazine's top, a Garand's: the next round, unless it's open-bolt)
          const rd = G.chambered(a.def) ? w.chamber : !G.OPEN_BOLT.includes(a.def.id) && w.mag > 0 ? (w.tube && w.tube.length ? w.tube[w.tube.length - 1] : w.ammo) : null;
          chv.round.visible = !!rd;
          if (rd) chv.face.material = chv.shot ? shellMat(rd) : tipMat(rd);
        }
        // something in the left hand
        for (const [kind, obj] of Object.entries(a.props)) {
          obj.visible = !!(pose && pose.prop && pose.prop.kind === kind);
          if (obj.visible) obj.position.copy(Lt).add(new T.Vector3(0.0, -0.012, -0.03));
          if (obj.visible && kind === 'shell') {
            const shot = (G.CALIBERS[G.calOf(a.def)] || {}).group === 'shotgun', [hull, base] = obj.children, s = shot ? 1 : 0.5;
            hull.material = shot ? shellMat(w.ammo) : G.GunModels.M.brass(); hull.scale.set(s, 1, s); base.scale.set(s, 1, s);
          }
        }
      }
    });
  }
  // what a magazine shows: the top round (its tip coloured for the load) if there is one, witness holes showing brass
  // down to where the stack ends, or the rounds through a clear body (js/gunmodels.js magCheck)
  const DARK = new T.MeshStandardMaterial({ color: 0x0a0b0c, roughness: 0.9 });
  const NUMS = new Map(), SHELLS = new Map(), TIPS = new Map();
  // the colour code (js/icons.js): a shell's hull for its load, a bullet's tip for its type
  function shellMat(am) { if (!SHELLS.has(am)) SHELLS.set(am, new T.MeshStandardMaterial({ color: G.Icons.shellCol(am), roughness: 0.55 })); return SHELLS.get(am); }
  function tipMat(am) { if (!TIPS.has(am)) TIPS.set(am, new T.MeshStandardMaterial({ color: G.Icons.tipCol(am), roughness: 0.4, metalness: 0.6 })); return TIPS.get(am); }
  function numMat(n) { // a count stamped beside a witness hole, white on the polymer
    if (NUMS.has(n)) return NUMS.get(n);
    const c = document.createElement('canvas'); c.width = 64; c.height = 48;
    const g = c.getContext('2d'); g.fillStyle = '#e8e8e8'; g.font = 'bold 44px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(String(n), 32, 26);
    const tex = new T.CanvasTexture(c); tex.anisotropy = 4;
    const m = new T.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false });
    NUMS.set(n, m);
    return m;
  }
  function magFill(a, mag, w, cap) {
    const chk = mag.userData.chk;
    if (!chk || w.noMag) return;
    const n = w.mag || 0, tube = w.tube || [], top = tube.length ? tube[tube.length - 1] : w.ammo, key = n + '|' + cap + '|' + tube.join(',') + '|' + w.ammo;
    if (chk.key === key) return;
    chk.key = key;
    const f = cap ? n / cap : 0, shot = (G.CALIBERS[G.calOf(a.def)] || {}).group === 'shotgun', M = G.GunModels.M;
    // the round at depth t down the stack (the top is the last in the tube)
    const at = (t) => tube.length ? tube[Math.max(0, tube.length - 1 - Math.min(tube.length - 1, Math.floor(t * cap)))] : w.ammo;
    // the top round: a bullet with its tip coloured for its type, or a shell (hull coloured, no point)
    chk.top[0].visible = n > 0; chk.top[1].visible = n > 0 && !shot;
    chk.top[0].material = shot ? shellMat(top) : M.brass();
    chk.top[1].material = tipMat(top);
    // each hole stamped with the count it stands for (brass in it: at least that many rounds)
    if (chk.labCap !== cap) {
      chk.labCap = cap;
      const step = cap >= 25 ? 5 : cap >= 12 ? 2 : 1; // (stamped in round numbers, like the real thing)
      let last = 0;
      for (const hl of chk.holes) {
        hl.n = last = Math.max(last + step, Math.round(hl.t * cap / step) * step);
        if (!hl.lab) {
          hl.lab = new T.Mesh(new T.PlaneGeometry(chk.w * 0.56, 0.0095), null);
          hl.lab.position.set(chk.w * 0.16, hl.mesh.position.y, hl.mesh.position.z);
          hl.mesh.parent.add(hl.lab);
        }
        hl.lab.material = numMat(hl.n);
      }
    }
    // through a hole: the case's side (brass), or a shell's hull; past the end of the stack, the follower's dark
    for (const hl of chk.holes) hl.mesh.material = n >= hl.n ? (shot ? shellMat(at(hl.t)) : M.brass()) : DARK;
    for (const r of chk.rounds) {
      const on = n > 1 && f >= r.t, am = at(r.t);
      r.mesh.visible = on; r.mesh.material = shot ? shellMat(am) : M.brass();
      if (r.tip) { r.tip.visible = on && !shot; r.tip.material = tipMat(am); }
    }
  }
  // stretch an arm from the shoulder to the hand (both in viewmodel space)
  const _q2 = new T.Quaternion(), _q3 = new T.Quaternion(), _v2 = new T.Vector3();
  const PALM_Q = new T.Quaternion(); // palm under the floorplate, fingers along it
  const _d = new T.Vector3(), _q = new T.Quaternion(), UPV = new T.Vector3(0, 1, 0), RX = new T.Quaternion().setFromAxisAngle(new T.Vector3(1, 0, 0), Math.PI / 2);
  function place(arm, shoulder, hand) {
    _d.subVectors(shoulder, hand);
    const len = _d.length();
    _d.normalize();
    _q.setFromUnitVectors(UPV, _d);
    arm.sleeve.quaternion.copy(_q);
    arm.sleeve.scale.set(1, Math.max(0.05, len - 0.05), 1);
    arm.sleeve.position.copy(hand).addScaledVector(_d, 0.05 + (len - 0.05) / 2);
    arm.glove.position.copy(hand);
    arm.glove.quaternion.copy(_q).multiply(RX);
  }

  return { prepare, sample, apply, kinds, canMagCheck, INSPECT_HOLD };
})();
