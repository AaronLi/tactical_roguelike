'use strict';
// Procedural weapon models at real-world scale (metres), assembled from parametric parts.
//
// Gun frame: the bore runs along -Z starting at the receiver's rear face (z = 0); +Y is up, +X is
// the shooter's right. Parts are placed by forward distance f along the bore (z = -f).
// One recipe per weapon builds both the first-person viewmodel (separate parts, some animated)
// and the third-person world model (merged into one mesh per material and shared by every actor).
// Every recipe returns where the sights, muzzle(s) and hands are, so the viewmodel can line up
// aim-down-sights and the character rig can put its hands on the gun.
G.GunModels = (() => {
  const T = THREE;
  const cache = {};
  const std = (key, color, roughness, metalness, extra) =>
    cache[key] || (cache[key] = new T.MeshStandardMaterial(Object.assign({ color, roughness, metalness }, extra)));
  // a relief map tiling every `cell` metres: diamonds (chequering) or scattered pits (stippling), on a part's flat faces
  const relief = (kind, cell) => {
    const key = 'relief' + kind;
    if (cache[key]) return cache[key];
    const c = document.createElement('canvas'); c.width = c.height = 64;
    const g = c.getContext('2d');
    g.fillStyle = '#808080'; g.fillRect(0, 0, 64, 64);
    if (kind === 'chq') {
      g.fillStyle = '#fff'; g.strokeStyle = '#000'; g.lineWidth = 7;
      g.beginPath(); for (const o of [-64, 0, 64]) { g.moveTo(o, 0); g.lineTo(o + 64, 64); g.moveTo(o + 64, 0); g.lineTo(o, 64); } g.stroke();
    } else for (let i = 0; i < 70; i++) { g.fillStyle = i % 2 ? '#fff' : '#000'; g.beginPath(); g.arc((i * 37) % 64, (i * 23 + (i * i) % 17) % 64, 2.6, 0, Math.PI * 2); g.fill(); }
    const t = new T.CanvasTexture(c);
    t.wrapS = t.wrapT = T.RepeatWrapping; t.repeat.set(1 / cell, 1 / cell);
    return (cache[key] = t);
  };
  const M = {
    black: () => std('black', 0x25272b, 0.45, 0.5),
    gunmetal: () => std('gunmetal', 0x41464d, 0.35, 0.7),
    steel: () => std('steel', 0xa7adb4, 0.25, 0.9),
    blued: () => std('blued', 0x252a32, 0.3, 0.75),
    park: () => std('park', 0x3b3b37, 0.7, 0.4),
    polymer: () => std('polymer', 0x2a2b2e, 0.85, 0.05),
    tan: () => std('tan', 0xa18d67, 0.8, 0.05),
    od: () => std('od', 0x4d5639, 0.8, 0.05),
    green: () => std('green', 0x414c35, 0.75, 0.1),
    wood: () => std('wood', 0x7c4b27, 0.6, 0),
    woodDark: () => std('woodDark', 0x4f2d18, 0.6, 0),
    woodRed: () => std('woodRed', 0x8b4023, 0.55, 0),
    brass: () => std('brass', 0xbb933d, 0.3, 0.9),
    rubber: () => std('rubber', 0x161616, 0.95, 0),
    stipple: () => std('stipple', 0x232326, 0.95, 0.02, { bumpMap: relief('stp', 0.006), bumpScale: 0.2 }), // (a polymer grip's texture)
    chequer: () => std('chequer', 0x1c1c1e, 0.8, 0.05, { bumpMap: relief('chq', 0.0028), bumpScale: 0.22 }),
    chequerWood: () => std('chequerWood', 0x5b3019, 0.55, 0, { bumpMap: relief('chq', 0.0024), bumpScale: 0.22 }),
    rust: () => std('rust', 0x6b4d37, 0.8, 0.35),
    tape: () => std('tape', 0x7e8357, 0.9, 0),
    clear: () => std('clear', 0x95aaa5, 0.2, 0, { transparent: true, opacity: 0.45 }),
    glass: () => std('glass', 0x204050, 0.05, 0.6, { transparent: true, opacity: 0.25, depthWrite: false }),
    tubeDS: () => std('tubeDS', 0x1d1f22, 0.45, 0.5, { side: T.DoubleSide }),
    lens: () => std('lens', 0x3a6a8a, 0.05, 0.8),
    // reflex sight glass: the front element carries the dot's reflective coating (a faint blue-violet tint)
    // (barely there: you look straight through a 1x sight's glass; only the faintest tint and sheen)
    reflexLens: () => std('reflexLens', 0x8a94d8, 0.04, 0.6, { transparent: true, opacity: 0.05, depthWrite: false }),
    clearLens: () => std('clearLens', 0xb4c4cc, 0.04, 0.5, { transparent: true, opacity: 0.025, depthWrite: false }),
    dot: () => std('dot', 0xff3030, 1, 0, { emissive: 0xff2020, emissiveIntensity: 3 }),
    amber: () => std('amber', 0xffaa20, 1, 0, { emissive: 0xff9a10, emissiveIntensity: 2.5 }),
    glow: () => std('glow', 0x40d8ff, 0.4, 0, { emissive: 0x30c8ff, emissiveIntensity: 2 }),
    sightPaint: () => std('sightPaint', 0xf4f2ea, 0.6, 0, { emissive: 0x2a2a28 }), // white dots and outlines
    tritium: () => std('tritium', 0x7dff8a, 0.5, 0, { emissive: 0x3dff5a, emissiveIntensity: 2.2 }), // night sights
    redInsert: () => std('redInsert', 0xd8261c, 0.5, 0, { emissive: 0x5a0a06 }), // revolver ramp insert
    string: () => std('string', 0xd8d0b8, 0.9, 0),
    fabric: () => std('fabric', 0x2f352b, 0.95, 0),
    glove: () => std('glove', 0x1b1c1e, 0.9, 0),
  };
  // a shotgun's front bead: bright brass with a little glow, so it reads against a dark room
  const BEAD = new T.MeshStandardMaterial({ color: 0xf2dc96, emissive: 0x5a4210, roughness: 0.3, metalness: 0.6 });

  // ---------------------------------------------------------------- primitive kit
  function kit() {
    const g = new T.Group();
    let tgt = g, of = 0, oy = 0, slot = 'base';
    const put = (geo, m, x, y, f) => { const mesh = new T.Mesh(geo, m); mesh.position.set(x, y - oy, -(f - of)); mesh.userData.slot = slot; tgt.add(mesh); return mesh; };
    return {
      g,
      // everything built after this belongs to that slot's part (the gunsmith highlights and picks by it)
      tag(s) { slot = s || 'base'; },
      add(mesh) { mesh.userData.slot = slot; g.add(mesh); return mesh; },
      get slot() { return slot; },
      // animated sub-assembly pivoting at (f, y); parts added after into() use absolute gun coordinates
      part(f = 0, y = 0) { const p = new T.Group(); p.position.set(0, y, -f); g.add(p); return p; },
      into(p, f = 0, y = 0) { tgt = p || g; of = p ? f : 0; oy = p ? y : 0; },
      box: (w, h, len, m, f0, y = 0, x = 0) => put(new T.BoxGeometry(w, h, len), m, x, y, f0 + len / 2),
      // cylinder along the bore from f0 to f0 + len (rRear at f0, rFront at the far end)
      cyl(r, len, m, f0, y = 0, x = 0, rFront = r, seg = 16, open = false) {
        const geo = new T.CylinderGeometry(r, rFront, len, seg, 1, open);
        geo.rotateX(Math.PI / 2);
        return put(geo, m, x, y, f0 + len / 2);
      },
      cylX(r, w, m, f, y = 0, x = 0, seg = 16) { const geo = new T.CylinderGeometry(r, r, w, seg); geo.rotateZ(Math.PI / 2); return put(geo, m, x, y, f); },
      cylY: (r, h, m, f, y = 0, x = 0, seg = 12, rBot = r) => put(new T.CylinderGeometry(r, rBot, h, seg), m, x, y, f),
      sphere: (r, m, f, y = 0, x = 0) => put(new T.SphereGeometry(r, 12, 8), m, x, y, f),
      // ring in the side plane (axis across the gun)
      ringX(r, tube, m, f, y = 0, x = 0, arc = Math.PI * 2, rot = 0) {
        const geo = new T.TorusGeometry(r, tube, 6, 20, arc); geo.rotateZ(rot); geo.rotateY(Math.PI / 2);
        return put(geo, m, x, y, f);
      },
      // ring facing down the bore (axis along the gun)
      ringZ(r, tube, m, f, y = 0, x = 0) { return put(new T.TorusGeometry(r, tube, 6, 20), m, x, y, f); },
      // a flat ring facing down the bore (a rear aperture): hole radius rIn, edge rOut, thick along the bore from f0
      annulus(rIn, rOut, thick, m, f0, y = 0, x = 0) {
        const s = new T.Shape(); s.absarc(0, 0, rOut, 0, Math.PI * 2, false);
        const h = new T.Path(); h.absarc(0, 0, rIn, 0, Math.PI * 2, true); s.holes.push(h);
        const geo = new T.ExtrudeGeometry(s, { depth: thick, bevelEnabled: false, curveSegments: 24 });
        geo.translate(0, 0, -thick / 2);
        return put(geo, m, x, y, f0 + thick / 2);
      },
      // a flat plate facing down the bore, outline [[x, y], ...] as you'd see it from behind the gun
      plate(pts, thick, m, f0) {
        const s = new T.Shape();
        pts.forEach(([x, y], i) => (i ? s.lineTo(x, y) : s.moveTo(x, y)));
        const geo = new T.ExtrudeGeometry(s, { depth: thick, bevelEnabled: false });
        geo.translate(0, 0, -thick / 2);
        return put(geo, m, 0, 0, f0 + thick / 2);
      },
      // a short tube along the bore with an opening of `gap` radians at the top (a front sight hood)
      // a ring facing down the bore with an opening of `gap` radians at the top (a hood's rim)
      arcRing(r, tube, m, f, y, gap = 0) {
        const geo = new T.TorusGeometry(r, tube, 6, 28, Math.PI * 2 - gap);
        geo.rotateZ(Math.PI / 2 + gap / 2);
        return put(geo, m, 0, y, f);
      },
      hood(r, len, m, f0, y, gap = 0) {
        const geo = new T.CylinderGeometry(r, r, len, 24, 1, true, Math.PI + gap / 2, Math.PI * 2 - gap);
        geo.rotateX(Math.PI / 2);
        return put(geo, m, 0, y, f0 + len / 2);
      },
      // side profile [[f, y], ...] extruded to width w, centred on x; optional holes
      prof(pts, w, m, x = 0, holes, bevel = 0.002) {
        const shape = new T.Shape();
        pts.forEach(([f, y], i) => (i ? shape.lineTo(f, y) : shape.moveTo(f, y)));
        (holes || []).forEach((h) => { const p = new T.Path(); h.forEach(([f, y], i) => (i ? p.lineTo(f, y) : p.moveTo(f, y))); shape.holes.push(p); });
        const depth = Math.max(0.001, w - 2 * bevel);
        // (a big bevel rounds the edges off within the outline, not outside it: the shell of a bullpup)
        const big = bevel > 0.003, geo = new T.ExtrudeGeometry(shape, { depth, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelOffset: big ? -bevel : 0, bevelSegments: big ? 3 : 1, curveSegments: 4 });
        geo.rotateY(Math.PI / 2);
        geo.translate(x - depth / 2, 0, 0);
        return put(geo, m, 0, 0, 0);
      },
      // many small outlines (serrations, chequering) as one mesh, w thick, centred on x
      profs(list, w, m, x = 0) {
        const shapes = list.map((pts) => { const sh = new T.Shape(); pts.forEach(([f, y], i) => (i ? sh.lineTo(f, y) : sh.moveTo(f, y))); return sh; });
        const geo = new T.ExtrudeGeometry(shapes, { depth: w, bevelEnabled: false, curveSegments: 4 });
        geo.rotateY(Math.PI / 2);
        geo.translate(x - w / 2, 0, 0);
        return put(geo, m, 0, 0, 0);
      },
      // a section swept along the bore: stations [[f, [[x, y], ...]], ...] rear to front, every section the same length,
      // anticlockwise seen from behind, closed at both ends (two stations at one f make a step)
      loft(st, m) {
        const pos = [], n = st[0][1].length;
        const v = (f, [x, y]) => [x, y, -f], tri = (a, b, c) => pos.push(...a, ...b, ...c);
        for (let s = 0; s + 1 < st.length; s++) for (let i = 0; i < n; i++) {
          const j = (i + 1) % n, a = v(st[s][0], st[s][1][i]), b = v(st[s + 1][0], st[s + 1][1][i]), a2 = v(st[s][0], st[s][1][j]), b2 = v(st[s + 1][0], st[s + 1][1][j]);
          tri(a, b, a2); tri(a2, b, b2);
        }
        const cap = ([f, sec], flip) => {
          const mid = [0, 0]; for (const p of sec) { mid[0] += p[0] / n; mid[1] += p[1] / n; }
          for (let i = 0; i < n; i++) { const a = v(f, sec[i]), b = v(f, sec[(i + 1) % n]), c = v(f, mid); if (flip) tri(c, b, a); else tri(c, a, b); }
        };
        cap(st[0], false); cap(st[st.length - 1], true);
        const geo = new T.BufferGeometry();
        geo.setAttribute('position', new T.Float32BufferAttribute(pos, 3));
        geo.computeVertexNormals();
        return put(geo, m, 0, 0, 0);
      },
    };
  }

  // ---------------------------------------------------------------- sights (return sight line height + eye relief)
  const S = {
    rail(k, f0, len, y, m = M.black()) {
      k.box(0.021, 0.007, len, m, f0, y + 0.0035);
      const n = Math.floor(len / 0.0105);
      for (let i = 0; i < n; i++) k.box(0.023, 0.004, 0.0052, m, f0 + 0.003 + i * 0.0105, y + 0.009);
      return y + 0.011;
    },
    // Reflex sights record their window in k.reflex; the viewmodel puts a collimated reticle behind it.
    reddot(k, f, top, o = {}) { // a tube on a QD riser (30 mm by default): turrets, brightness dial
      const R = o.dotR || 0.02, len = o.dotLen || 0.056, f0 = f - len / 2, sy = top + 0.014 + R;
      k.box(0.03, 0.01, 0.05, M.black(), f - 0.025, top + 0.005);
      k.box(0.02, sy - top - 0.012, 0.03, M.black(), f - 0.015, (sy + top) / 2 - 0.006);
      k.box(0.006, 0.008, 0.022, M.black(), f - 0.011, top + 0.007, 0.018);
      k.cyl(R, len, M.tubeDS(), f0, sy, 0, R, 24, true);
      k.ringZ(R, 0.0022, M.black(), f0, sy); k.ringZ(R, 0.0022, M.black(), f0 + len, sy);
      k.ringZ(R + 0.001, 0.0018, M.rubber(), f0 + 0.014, sy);
      k.cylX(0.0075, 0.012, M.black(), f + 0.004, sy, R + 0.005);
      k.cylY(0.0075, 0.012, M.black(), f + 0.004, sy + R + 0.005);
      k.cylX(0.006, 0.014, M.black(), f - 0.016, sy - 0.004, -R - 0.006);
      k.cyl(R - 0.0022, 0.0015, M.clearLens(), f0 + 0.004, sy);
      k.cyl(R - 0.0022, 0.0015, M.reflexLens(), f0 + len - 0.005, sy);
      k.reflex = { f: f0 + len - 0.006, y: sy, w: (R - 0.0022) * 2, h: (R - 0.0022) * 2, round: true, kind: o.ret || 'dot' };
      return { sy, fSight: f0, relief: 0.085 };
    },
    holo(k, f, top) { // box-hooded holographic sight, battery and electronics in the base
      const sy = top + 0.033, wW = 0.033, wH = 0.027, f0 = f - 0.034, f1 = f + 0.03;
      const yb = top + 0.012, yt = sy + wH / 2 + 0.003, hl = f1 - f0 - 0.012;
      k.box(0.04, 0.012, f1 - f0, M.black(), f0, top + 0.006);
      k.box(0.036, 0.008, 0.03, M.black(), f0, top + 0.015);
      for (const x of [-1, 1]) k.box(0.004, yt - yb, hl, M.black(), f0 + 0.012, (yt + yb) / 2, x * (wW / 2 + 0.002));
      k.box(wW + 0.008, 0.004, hl, M.black(), f0 + 0.012, yt + 0.002);
      for (const ff of [f0 + 0.012, f1 - 0.004]) k.box(wW + 0.008, 0.003, 0.004, M.black(), ff, sy - wH / 2 - 0.0015);
      k.box(wW, wH, 0.0015, M.clearLens(), f0 + 0.014, sy);
      k.box(wW, wH, 0.0015, M.reflexLens(), f1 - 0.006, sy);
      for (const x of [-0.009, 0.009]) k.box(0.007, 0.005, 0.008, M.rubber(), f0 - 0.006, top + 0.012, x);
      k.box(0.006, 0.01, 0.024, M.black(), f - 0.012, top + 0.006, 0.024);
      k.reflex = { f: f1 - 0.007, y: sy, w: wW, h: wH, kind: 'holo' };
      return { sy, fSight: f0 + 0.012, relief: 0.1 };
    },
    acog(k, f, top) {
      const sy = top + 0.036;
      k.box(0.03, 0.016, 0.05, M.black(), f - 0.025, top + 0.008);
      k.cyl(0.015, 0.15, M.tubeDS(), f - 0.075, sy, 0, 0.021, 18, true);
      k.ringZ(0.015, 0.003, M.black(), f - 0.075, sy); k.ringZ(0.021, 0.003, M.black(), f + 0.075, sy);
      k.box(0.034, 0.008, 0.03, M.black(), f - 0.03, sy + 0.022);
      k.cylY(0.0012, 0.004, M.amber(), f + 0.06, sy - 0.002, 0, 6, 0.0001);
      k.cyl(0.0125, 0.001, M.lens(), f - 0.0762, sy);
      k.pip = { f: f - 0.0765, y: sy, r: 0.0125 };
      return { sy, fSight: f - 0.075, relief: 0.06 };
    },
    scope(k, f, top, len = 0.33, obj = 0.025, h = 0.04) {
      const sy = top + h;
      for (const rf of [f - len * 0.22, f + len * 0.18]) { k.box(0.026, sy - top, 0.014, M.black(), rf - 0.007, top + (sy - top) / 2); k.ringZ(0.0135, 0.004, M.black(), rf, sy); }
      k.cyl(0.0127, len * 0.55, M.black(), f - len * 0.3, sy);
      k.cyl(0.019, len * 0.22, M.black(), f - len / 2, sy, 0, 0.0135);
      k.cyl(0.0135, len * 0.25, M.black(), f + len * 0.25, sy, 0, obj);
      k.cyl(obj, 0.01, M.black(), f + len / 2, sy);
      k.cylY(0.009, 0.022, M.black(), f, sy + 0.02);
      k.cylX(0.009, 0.022, M.black(), f, sy, 0.02);
      k.cyl(obj * 0.85, 0.002, M.lens(), f + len / 2 + 0.009, sy);
      k.cyl(0.0165, 0.001, M.lens(), f - len / 2 - 0.0012, sy);
      k.pip = { f: f - len / 2 - 0.0015, y: sy, r: 0.0165 };
      return { sy, fSight: f - len / 2, relief: 0.07 };
    },
    // Iron sights, modelled on the real sight pictures. In every family the top of the front post is exactly on
    // the sight line (sy), which is where the round goes:
    //  'ar'       rear aperture (the big 0-2 "ghost ring") between protective ears; square front post between
    //             wings. You centre the post tip in the ring. (AR-15/M4, BUIS, FAL, Garand, M249...)
    //  'hk'       rear drum aperture; front post inside a ring hood: a circle inside a circle with the post tip
    //             in the middle. (MP5)
    //  'ak'       U-notch on a tangent leaf partway down the gun; round front post under a hood open at the top.
    //             The post top sits level with the top of the notch. (AK, SVD, PKM, PPSh, Mosin)
    //  'buckhorn' semi-buckhorn rear blade (curved wings, a small V at the centre); gold bead front. (lever guns)
    irons(k, fR, fF, sy, rb, fb, style = 'ar') {
      const B = M.black();
      const col = (w, y0, y1, len, f0, x = 0) => { if (y1 - y0 > 0.0008) k.box(w, y1 - y0, len, B, f0, (y0 + y1) / 2, x); };
      if (style === 'ak') {
        // rear: the leaf rises toward you from its hinge; the notch blade stands at its back end
        k.prof([[fR - 0.004, sy - 0.007], [fR + 0.05, rb + 0.002], [fR + 0.05, rb], [fR - 0.004, rb]], 0.017, B);
        const nw = 0.0018, nd = 0.004, hw = 0.012; // notch half-width and depth, blade half-width
        for (const x of [-1, 1]) col(hw - nw, sy - 0.009, sy, 0.003, fR - 0.0042, x * (nw + (hw - nw) / 2));
        col(2 * nw, sy - 0.009, sy - nd, 0.003, fR - 0.0042);
        const t = 0.45, yl = sy - 0.007 + t * (rb + 0.002 - (sy - 0.007));
        k.box(0.021, 0.004, 0.009, B, fR + t * 0.054 - 0.0045, yl + 0.001); // range slider
        // front: round post under a hood open at the top, on a block over the barrel
        col(0.012, fb, sy - 0.012, 0.014, fF - 0.007);
        k.cylY(0.0017, 0.012, B, fF, sy - 0.006);
        k.hood(0.0105, 0.014, M.tubeDS(), fF - 0.007, sy - 0.004, 1.1);
        for (const ff of [fF - 0.007, fF + 0.007]) k.arcRing(0.0105, 0.0014, B, ff, sy - 0.004, 1.1);
        return { sy, fSight: fR - 0.0042, relief: 0.17 };
      }
      if (style === 'buckhorn') {
        // rear: a semi-buckhorn blade on a dovetail; the bead sits in the little V, level with its shoulders
        col(0.008, rb, sy - 0.006, 0.006, fR - 0.003);
        k.plate([[-0.016, sy - 0.007], [0.016, sy - 0.007], [0.016, sy + 0.004], [0.013, sy + 0.0055], [0.008, sy + 0.0022], [0.0026, sy + 0.0003],
          [0, sy - 0.0026], [-0.0026, sy + 0.0003], [-0.008, sy + 0.0022], [-0.013, sy + 0.0055], [-0.016, sy + 0.004]], 0.0025, B, fR - 0.0012);
        col(0.0035, fb, sy - 0.0025, 0.012, fF - 0.006);
        k.sphere(0.0018, M.brass(), fF - 0.004, sy - 0.0018);
        return { sy, fSight: fR - 0.0012, relief: 0.2 };
      }
      if (style === 'hk') {
        // rear: drum housing between protective wings, the aperture facing you
        col(0.022, rb, sy - 0.0085, 0.02, fR - 0.012);
        k.cylX(0.0095, 0.018, B, fR + 0.004, sy - 0.0145); // the drum, below the aperture
        k.annulus(0.0038, 0.0082, 0.003, B, fR - 0.003, sy);
        for (const x of [-1, 1]) col(0.003, rb, sy + 0.009, 0.02, fR - 0.012, x * 0.0125);
        // front: a ring hood with the post standing up to its centre
        col(0.011, fb, sy - 0.0095, 0.012, fF - 0.006);
        k.hood(0.0085, 0.012, M.tubeDS(), fF - 0.006, sy);
        for (const ff of [fF - 0.006, fF + 0.006]) k.ringZ(0.0085, 0.0012, B, ff, sy);
        col(0.0022, sy - 0.0088, sy, 0.0025, fF - 0.0012);
        return { sy, fSight: fR - 0.003, relief: 0.1 };
      }
      // 'ar': the large aperture between ears; square post between wings
      col(0.022, rb, sy - 0.0075, 0.02, fR - 0.012);
      k.annulus(0.0049, 0.0076, 0.003, B, fR - 0.003, sy);
      for (const x of [-1, 1]) col(0.003, rb, sy + 0.009, 0.016, fR - 0.01, x * 0.0115);
      k.cylX(0.004, 0.006, B, fR - 0.006, sy - 0.012, 0.014); // windage drum
      col(0.015, fb, sy - 0.014, 0.014, fF - 0.007);
      for (const x of [-1, 1]) col(0.0028, sy - 0.016, sy + 0.003, 0.01, fF - 0.005, x * 0.0072);
      col(0.0021, sy - 0.016, sy, 0.0021, fF - 0.001);
      return { sy, fSight: fR - 0.003, relief: 0.1 };
    },
    notch(k, fRear, fFront, sy, rearBase, frontBase) { return S.irons(k, fRear, fFront, sy, rearBase, frontBase, 'ak'); },
    // Pistol sights: a dovetailed rear blade with a U-notch and a front blade, tops level. Factory sights have a
    // white outline round the notch and a white dot on the front ("ball in a cup"); night sights put tritium dots
    // either side of the notch and on the front instead (three green dots in a row).
    pistolSights(k, fR, fF, sy, base, night, rearBase = base, hw = 0.0105) {
      const B = M.black(), paint = night ? M.tritium() : M.sightPaint(), nw = 0.0019, nd = Math.min(0.0035, (sy - rearBase) * 0.6), rh = sy - rearBase;
      for (const x of [-1, 1]) k.box(hw - nw, rh, 0.008, B, fR - 0.004, rearBase + rh / 2, x * (nw + (hw - nw) / 2));
      k.box(2 * nw, rh - nd, 0.008, B, fR - 0.004, rearBase + (rh - nd) / 2);
      if (night) for (const x of [-1, 1]) k.cyl(0.0011, 0.0006, paint, fR - 0.0046, sy - 0.0021, x * (nw + 0.0032));
      else {
        for (const x of [-1, 1]) k.box(0.0007, nd, 0.0006, paint, fR - 0.0046, sy - nd / 2, x * (nw + 0.00035));
        k.box(2 * nw + 0.0014, 0.0007, 0.0006, paint, fR - 0.0046, sy - nd - 0.00035);
      }
      if (fF != null) S.pistolFront(k, fF, sy, base, night);
      return { sy, fSight: fR - 0.004, relief: 0.36 };
    },
    pistolFront(k, fF, sy, base, night) {
      const h = sy - base;
      k.box(0.0034, h, 0.007, M.black(), fF - 0.0035, base + h / 2);
      k.cyl(night ? 0.0011 : 0.0012, 0.0006, night ? M.tritium() : M.sightPaint(), fF - 0.0041, sy - Math.min(0.0019, h * 0.5));
    },
    // Revolver: the rear notch is cut into the topstrap; the front is a ramp with a red insert.
    revSights(k, fR, fF, sy, base, m) {
      const nw = 0.0019, hw = 0.0085;
      for (const x of [-1, 1]) k.box(hw - nw, sy - base, 0.012, m, fR - 0.006, (sy + base) / 2, x * (nw + (hw - nw) / 2));
      k.prof([[fF - 0.016, base], [fF - 0.001, sy], [fF + 0.001, sy], [fF + 0.001, base]], 0.0034, m);
      // the red insert lies along the ramp's sloped back face, which is what you see from behind
      const sl = (sy - base) / 0.015, fa = fF - 0.016 + (sy - 0.0048 - base) / sl, fb = fF - 0.016 + (sy - 0.0005 - base) / sl;
      k.prof([[fa, sy - 0.0048], [fb, sy - 0.0005], [fb, sy], [fa, sy - 0.0041]], 0.0036, M.redInsert());
      return { sy, fSight: fR - 0.006, relief: 0.36 };
    },
    prism(k, f, top, o = {}) { // a prism sight: longer the more it magnifies
      const px = o.px || 2, hl = px <= 1 ? 0.024 : px < 2 ? 0.029 : px < 3 ? 0.035 : 0.042, sy = top + 0.03;
      k.box(0.03, 0.012, 0.05, M.black(), f - 0.025, top + 0.006);
      k.box(0.034, 0.034, hl * 2, M.black(), f - hl, sy);
      k.ringZ(0.012, 0.003, M.black(), f - hl, sy); k.ringZ(0.015, 0.003, M.black(), f + hl, sy);
      k.cyl(0.013, 0.002, M.lens(), f + hl + 0.001, sy);
      k.cylY(0.007, 0.012, M.black(), f, sy + 0.022);
      k.cyl(0.0115, 0.001, M.lens(), f - hl - 0.0012, sy);
      k.pip = { f: f - hl - 0.0015, y: sy, r: 0.0115 };
      return { sy, fSight: f - hl, relief: 0.07 };
    },
    // An open reflex sight (pistol size, on the slide; o.riser lifts it to rifle height on a rail), or an enclosed
    // one (o.closed: a hood all round, glass at both ends)
    minidot(k, f, top, o = {}) {
      if (o.riser) { k.box(0.024, o.riser, 0.034, M.black(), f - 0.017, top + o.riser / 2); top += o.riser; }
      const sy = top + 0.016;
      k.box(0.024, 0.008, 0.032, M.black(), f - 0.016, top + 0.004);
      // the window: a thin frame round the lens (two posts and a top bar), open in the middle
      for (const x of [-1, 1]) k.box(0.003, 0.019, o.closed ? 0.032 : 0.004, M.black(), o.closed ? f - 0.016 : f + 0.012, top + 0.0155, x * 0.0115);
      k.box(0.026, 0.003, o.closed ? 0.032 : 0.004, M.black(), o.closed ? f - 0.016 : f + 0.012, top + 0.0255);
      k.box(0.026, 0.003, 0.03, M.black(), f - 0.016, top + 0.025);
      if (o.closed) k.box(0.02, 0.016, 0.0015, M.clearLens(), f - 0.015, sy);
      k.box(0.02, 0.016, 0.0015, M.reflexLens(), f + 0.01, sy);
      k.reflex = { f: f + 0.0095, y: sy, w: 0.02, h: 0.016, kind: o.ret || 'dot' };
      return { sy, fSight: f - 0.016, relief: o.riser ? 0.12 : 0.3 };
    },
    // A flip-to-side magnifier behind a reflex sight, on a hinge at its lower right: in line (anim.magn at 0) it
    // magnifies the dot; swung out and down beside the receiver (about -160°) you look past it. Its rear lens is the picture-in-picture lens.
    magnifier(k, sight, top, m, anim) {
      const sy = sight.sy, len = m.len || 0.085, R = 0.0165, fRear = sight.fSight - 0.025 - len, fc = fRear + len * 0.5;
      const hx = 0.024, hy = top + 0.014;
      k.box(0.03, 0.012, 0.034, M.black(), fc - 0.017, top + 0.006);
      k.box(0.008, 0.014, 0.03, M.black(), fc - 0.015, hy, hx);
      const hinge = new T.Group(); hinge.position.set(hx, hy, -fc); k.g.add(hinge);
      const add = (geo, mat, x, y, f) => { const mesh = new T.Mesh(geo, mat); mesh.position.set(x - hx, y - hy, -(f - fc)); mesh.userData.slot = k.slot; hinge.add(mesh); return mesh; };
      const tube = new T.CylinderGeometry(R, R * 1.08, len, 24, 1, true); tube.rotateX(Math.PI / 2); add(tube, M.tubeDS(), 0, sy, fc);
      for (const ff of [fRear, fRear + len]) { const ring = new T.TorusGeometry(R, 0.0025, 6, 24); add(ring, M.black(), 0, sy, ff); }
      add(new T.BoxGeometry(0.02, sy - hy - R + 0.004, 0.026), M.black(), hx * 0.45, (sy - R + hy) / 2, fc);
      const front = new T.CircleGeometry(R * 0.95, 24); add(front, M.lens(), 0, sy, fRear + len - 0.002);
      k.pip = { f: fRear - 0.001, y: sy, r: R - 0.0015, parent: hinge, pos: new T.Vector3(-hx, sy - hy, -(fRear - 0.001 - fc)) };
      anim.magn = hinge;
      return { sy, fSight: fRear, relief: 0.075 };
    },
    // A shotgun's bead: a flat rib from the receiver to the muzzle, level with the top of the receiver (on
    // posts where the barrel sits lower), and the brass bead on its front end. You look along the rib; the
    // bead sits on it at the far end, the barrel(s) below.
    bead(k, fRear, fFront, sy, rib, barrelTop) {
      if (rib) {
        const ry = sy - 0.0065, len = rib[1] - rib[0];
        k.box(0.007, 0.003, len, M.black(), rib[0], ry);
        const gap = ry - 0.0015 - barrelTop;
        if (gap > 0.004) for (let i = 0; i < 5; i++) k.box(0.003, gap, 0.004, M.black(), rib[0] + 0.01 + (len - 0.02) * i / 4, barrelTop + gap / 2);
      }
      // the bead sits on the rib, its top just over the sight line: put it on the target
      k.sphere(0.0036, BEAD, fFront, sy - 0.0018);
      return { sy, fSight: fRear, relief: 0.3 };
    },
  };

  // ---------------------------------------------------------------- shared parts
  function grip(k, gf, m, type = 'ar') {
    if (type === 'none') return;
    if (type === 'wood') { k.prof([[gf - 0.005, -0.04], [gf + 0.035, -0.04], [gf + 0.02, -0.13], [gf - 0.025, -0.125]], 0.032, m); return; }
    if (type === 'vertical') { k.prof([[gf - 0.01, -0.035], [gf + 0.03, -0.035], [gf + 0.028, -0.135], [gf - 0.012, -0.135]], 0.03, m); return; }
    k.prof([[gf - 0.012, -0.036], [gf + 0.028, -0.036], [gf + 0.012, -0.132], [gf - 0.028, -0.124]], 0.03, m);
  }
  function triggerGuard(k, gf, m) {
    k.box(0.01, 0.004, 0.06, m, gf + 0.02, -0.062);
    k.box(0.01, 0.024, 0.004, m, gf + 0.076, -0.05);
    k.box(0.004, 0.02, 0.005, M.black(), gf + 0.04, -0.048);
  }
  // Stocks sit behind the eye in first person and only read as stray geometry at the screen edge,
  // so the viewmodel build skips them (third-person models keep them).
  let buildingVM = false;
  function stock(k, type, m, wrist) {
    if (buildingVM && !wrist) return; // (wrist: the stock is what the hand holds, on guns with no pistol grip)
    const pad = (f, y, h) => k.box(0.044, h, 0.012, M.rubber(), f - 0.012, y);
    switch (type) {
      case 'tubeonly': // a buffer tube adapter with nothing on it
        k.cyl(0.0155, 0.2, M.black(), -0.2, -0.002);
        k.cyl(0.02, 0.012, M.black(), -0.02, -0.002);
        break;
      case 'm4':
        k.cyl(0.0155, 0.2, M.black(), -0.2, -0.002);
        k.prof([[-0.1, 0.018], [-0.235, 0.022], [-0.255, -0.085], [-0.215, -0.096], [-0.13, -0.042], [-0.1, -0.022]], 0.044, m);
        pad(-0.25, -0.03, 0.11);
        break;
      case 'crane':
        k.cyl(0.0155, 0.2, M.black(), -0.2, -0.002);
        k.prof([[-0.09, 0.022], [-0.25, 0.03], [-0.27, -0.09], [-0.23, -0.1], [-0.12, -0.05], [-0.09, -0.024]], 0.05, m);
        pad(-0.265, -0.03, 0.12);
        break;
      case 'fixed':
        k.prof([[0, 0.022], [-0.3, 0.018], [-0.312, -0.1], [-0.27, -0.118], [-0.04, -0.05], [0, -0.045]], 0.044, m);
        pad(-0.31, -0.04, 0.12);
        break;
      case 'skeleton':
        k.prof([[0, 0.022], [-0.29, 0.018], [-0.3, -0.105], [-0.26, -0.118], [-0.03, -0.05], [0, -0.045]], 0.03, m, 0,
          [[[-0.05, 0.006], [-0.26, 0.004], [-0.262, -0.085], [-0.07, -0.038]]]);
        pad(-0.298, -0.043, 0.122);
        break;
      case 'thumbhole':
        k.prof([[0, 0.015], [-0.285, 0.01], [-0.302, -0.13], [-0.252, -0.142], [-0.025, -0.07], [0, -0.055]], 0.04, m, 0,
          [[[-0.055, -0.008], [-0.14, -0.012], [-0.15, -0.065], [-0.065, -0.045]]]);
        pad(-0.3, -0.06, 0.13);
        break;
      case 'wood':
        k.prof([[0, 0.012], [-0.04, 0.008], [-0.3, -0.035], [-0.315, -0.16], [-0.27, -0.165], [-0.05, -0.068], [0, -0.052]], 0.042, m);
        k.box(0.044, 0.13, 0.008, M.blued(), -0.322, -0.098);
        break;
      case 'akwood': // the AK's short, straight-dropped buttstock
        k.prof([[0, 0.01], [-0.03, 0.006], [-0.24, -0.03], [-0.25, -0.15], [-0.21, -0.155], [-0.04, -0.06], [0, -0.048]], 0.04, m);
        k.box(0.042, 0.12, 0.006, M.blued(), -0.256, -0.09);
        break;
      case 'straight':
        k.prof([[0, 0.012], [-0.3, -0.012], [-0.313, -0.14], [-0.267, -0.15], [-0.043, -0.066], [0, -0.052]], 0.042, m);
        pad(-0.31, -0.076, 0.13);
        break;
      case 'sniper':
        k.prof([[0, 0.012], [-0.15, 0.02], [-0.34, 0.022], [-0.365, -0.145], [-0.3, -0.155], [-0.09, -0.085], [-0.03, -0.11], [0.03, -0.1], [0.03, -0.05], [0, -0.05]], 0.045, m);
        pad(-0.362, -0.06, 0.16);
        break;
      case 'barrett':
        k.prof([[0, 0.03], [-0.3, 0.022], [-0.31, -0.11], [-0.26, -0.125], [0, -0.065]], 0.05, m);
        k.box(0.056, 0.15, 0.03, M.rubber(), -0.34, -0.045);
        break;
      case 'pdw':
        k.cyl(0.0155, 0.14, M.black(), -0.14, -0.002);
        for (const x of [-0.016, 0.016]) k.box(0.006, 0.01, 0.16, m, -0.18, 0.006, x);
        if (!buildingVM) k.box(0.044, 0.08, 0.014, M.rubber(), -0.19, -0.02); // (its pad: right in front of your eye, aiming, so first person leaves it out)
        break;
      case 'wire':
        k.cyl(0.004, 0.195, M.blued(), -0.195, 0.0, 0.012); k.cyl(0.004, 0.195, M.blued(), -0.195, 0.0, -0.012);
        k.cyl(0.004, 0.18, M.blued(), -0.18, -0.05, 0);
        k.box(0.04, 0.07, 0.006, M.blued(), -0.2, -0.025);
        break;
      case 'qbz': // the QBZ-191's: a hinge at the receiver, a square rail back from it, the stock telescoping on it
        k.box(0.032, 0.048, 0.022, M.black(), -0.022, 0.004);
        k.cylY(0.005, 0.05, M.steel(), -0.012, 0.004, -0.019);
        k.box(0.022, 0.022, 0.16, M.black(), -0.18, 0.012);
        k.prof([[-0.11, 0.03], [-0.262, 0.03], [-0.27, -0.098], [-0.232, -0.106], [-0.15, -0.058], [-0.12, -0.038], [-0.11, -0.012]], 0.044, m, 0,
          [[[-0.175, -0.01], [-0.232, -0.012], [-0.236, -0.07], [-0.2, -0.062]]]);
        pad(-0.268, -0.034, 0.13);
        break;
      case 'mcx': // the MCX's skeleton side-folder: a hinge, a top strut, the butt plate and a strut back up to the hinge
      case 'spearlt': // the Spear LT's: the same frame, filled in, with a pad for the cheek
        k.box(0.03, 0.044, 0.022, M.black(), -0.022, 0.0);
        k.cylY(0.005, 0.046, M.steel(), -0.012, 0.0, -0.018);
        k.prof([[-0.02, 0.024], [-0.268, 0.02], [-0.276, -0.098], [-0.25, -0.106], [-0.03, -0.022], [-0.02, -0.022]], type === 'mcx' ? 0.022 : 0.03, m, 0,
          type === 'mcx' ? [[[-0.06, 0.008], [-0.248, 0.006], [-0.25, -0.076], [-0.08, -0.016]]] : null);
        if (type === 'spearlt') k.box(0.034, 0.014, 0.12, M.rubber(), -0.25, 0.026);
        pad(-0.272, -0.04, 0.13);
        break;
      case 'rattler': // the Rattler's: a single folding strut and a narrow butt plate
        k.box(0.03, 0.04, 0.02, M.black(), -0.02, 0.0);
        k.cylY(0.005, 0.042, M.steel(), -0.011, 0.0, -0.018);
        k.prof([[-0.02, 0.02], [-0.215, 0.016], [-0.225, -0.082], [-0.205, -0.088], [-0.196, -0.004], [-0.02, 0.0]], 0.018, m);
        pad(-0.222, -0.034, 0.1);
        break;
      case 'scar': { // the SCAR's: its hinge on the back of the receiver, a raised comb for the cheek, the butt raked a
        // little, its lower front edge ribbed (traced with the receiver: scarTrace)
        const V = scarTrace, pts = (a) => a.map(V);
        k.box(0.036, V([0, 199])[1] - V([0, 324])[1], 0.03, m, V([388, 0])[0] - 0.01, (V([0, 199])[1] + V([0, 324])[1]) / 2);
        k.prof(pts([[390, 196], [241, 206], [113, 216], [114, 224], [148, 425], [160, 415], [238, 309], [390, 310]]), 0.04, m, 0, null, 0.004);
        k.prof(pts([[100, 220], [114, 216], [150, 427], [137, 429]]), 0.042, M.rubber(), 0, null, 0.0008);
        for (let i = 0; i < 6; i++) { const t = (i + 0.5) / 6, [f, y] = V([162 + 74 * t, 412 - 100 * t]); k.box(0.041, 0.004, 0.006, M.rubber(), f - 0.003, y); }
        break;
      }
      case 'g36': { // the G36's: a skeleton folding on the hinge at the back of the receiver, a window through it and a
        // small one ahead of that, the strut under them sweeping down to the foot of the butt (traced with the receiver)
        const V = g36Trace, pts = (a) => a.map(V);
        k.prof(pts([[318, 96], [300, 104], [287, 114], [220, 126], [42, 122], [33, 272], [35, 276], [61, 276], [64, 265], [77, 234], [103, 209], [154, 191], [241, 183], [318, 183]]), 0.03, m, 0,
          [pts([[70, 132], [220, 132], [220, 170], [86, 186], [70, 186]]), pts([[233, 138], [285, 138], [285, 167], [233, 167]])], 0.003);
        k.prof(pts([[40, 122], [49, 122], [41, 276], [31, 274]]), 0.032, M.rubber(), 0, null, 0.001);
        break;
      }
      case 'folded': // folded along the left side
        k.prof([[0.02, 0.01], [0.24, 0.01], [0.24, -0.03], [0.02, -0.03]], 0.008, m, -0.026, [[[0.05, 0.0], [0.21, 0.0], [0.21, -0.02], [0.05, -0.02]]]);
        break;
    }
  }
  // What you see checking a magazine: the round on top, and down the back a column of witness holes showing brass
  // as far as it's loaded (in a clear magazine, the rounds themselves). rear(t): the back edge's f at depth t (0 at
  // the top, 1 at the floorplate); top: its top y; len, w, d: its size. js/vmanim.js shows them for the real count.
  // The rounds in a magazine: its feed lips, the top round between them, and (a clear magazine) the whole stack,
  // each round its real cartridge (rnd: the case's head diameter, the case and bullet lengths, the bullet's diameter,
  // from the gun's caliber: roundDims), lying along the gun with its base against the back wall. A double stack
  // (anything wider than a round and a half) zig-zags, each round half a diameter down from the last, offset each
  // side; a single stack (a shotgun's shells) is one column. Which of them show follows the rounds in it: the top
  // ones stay, the follower rises (js/vmanim.js magFill). An opaque magazine shows its witness holes instead.
  function magCheck(k, rear, top, len, w, d, clear, rnd) {
    const R = rnd || { head: Math.min(0.009, w * 0.4), cs: d * 0.5, bl: d * 0.16, bd: Math.min(0.0085, w * 0.35), shell: false };
    const r = R.head / 2, oal = Math.min(R.cs + R.bl, d * 0.94), cs = oal * R.cs / (R.cs + R.bl), bl = oal - cs, rb = R.bd / 2;
    const chk = { holes: [], rounds: [], w }, yAt = (t) => top - 0.012 - t * (len - 0.026), back = (t) => rear(t) + Math.max(0.002, (d - oal) * 0.25);
    // the feed lips, and the top round sitting down between them (its crown just under their edges)
    for (const s of [-1, 1]) k.box(w * 0.16, 0.003, d * 0.6, M.black(), rear(0) + 0.004, top + 0.0015, s * w * 0.42);
    const ty = top - r + 0.0024;
    const round = (f, y, x) => [k.cyl(r * 0.97, cs, M.brass(), f, y, x, R.shell ? r * 0.97 : rb * 1.15, 10), R.shell ? null : k.cyl(rb, bl, M.brass(), f + cs, y, x, rb * (R.pistol ? 0.55 : 0.18), 8)];
    chk.top = round(back(0), ty, 0); if (!chk.top[1]) chk.top[1] = k.box(0.0001, 0.0001, 0.0001, M.brass(), back(0), ty);
    if (clear) {
      // as many as it holds under the top round (one drawn for each: R.cap), at the stack's pitch from the top down
      const dbl = w > r * 2 * 1.45, pitch = dbl ? r * 1.05 : r * 2.02, fit = Math.max(2, Math.floor((len - 0.026) / pitch)), n = R.cap > 1 ? R.cap - 1 : fit, xo = dbl ? Math.min(w / 2 - r - 0.0012, r * 0.86) : 0;
      const tOf = (j) => Math.min(1, j * Math.min(pitch, (len - 0.026) / n) / (len - 0.026)); // (packed tighter if it holds more than fits at its pitch)
      for (let j = 1; j <= n; j++) { // each with its own tip (or, a shotgun's, its hull coloured): js/vmanim.js magFill
        const t = tOf(j), x = dbl ? (j % 2 ? 1 : -1) * xo : 0, [mesh, tip] = round(back(t), yAt(t), x);
        chk.rounds.push({ t, mesh, tip });
      }
    }
    else for (let i = 1; i <= 5; i++) { const t = (i / 6) * 0.94; chk.holes.push({ t, mesh: k.box(w * 0.22, 0.0055, 0.0025, M.brass(), rear(t) - 0.0035, yAt(t), -w * 0.27) }); }
    return chk;
  }
  // A drum's, for the same check: the top round up in its feed tower and (a clear drum) the rest wound round inside
  // it, each lying along the bore, ring by ring from the outside in round the hub, the ones nearest the tower (the
  // next to feed, t near 0) first. As many as fit, standing for as many as it holds (js/vmanim.js scales the count).
  function drumCheck(k, f, y, R, dw, d, w, clear, rnd) {
    const C = rnd || { head: 0.0096, cs: 0.045, bl: 0.012, bd: 0.0057, shell: false };
    const r = C.head / 2, oal = Math.min(C.cs + C.bl, dw * 0.92), cs = oal * C.cs / (C.cs + C.bl), bl = oal - cs, rb = C.bd / 2;
    const round = (f0, yy, x) => [k.cyl(r * 0.97, cs, M.brass(), f0, yy, x, C.shell ? r * 0.97 : rb * 1.15, 10), C.shell ? null : k.cyl(rb, bl, M.brass(), f0 + cs, yy, x, rb * (C.pistol ? 0.55 : 0.18), 8)];
    const chk = { holes: [], rounds: [], w };
    const tf = f - d * 0.35 - Math.min(oal, d * 0.7) / 2 + 0.002; // (the feed tower)
    for (const sd of [-1, 1]) k.box(w * 0.16, 0.003, d * 0.6, M.black(), f - d * 0.35 - d * 0.3 + 0.004, y + 0.0015, sd * w * 0.42);
    chk.top = round(tf, y - r + 0.0024, 0); if (!chk.top[1]) chk.top[1] = k.box(0.0001, 0.0001, 0.0001, M.brass(), tf, y);
    if (clear) {
      const cy = y - R * 0.95, f0 = f - dw / 2 + (dw - oal) / 2, step = r * 2.1, spots = [];
      for (let rr = R - r - 0.004; rr > R * 0.35 + r + 0.001; rr -= step) {
        const n = Math.floor((2 * Math.PI * rr) / step);
        for (let i = 0; i < n; i++) { const a = Math.PI / 2 + (i / n) * Math.PI * 2; spots.push([Math.cos(a) * rr, cy + Math.sin(a) * rr]); }
      }
      const n = Math.min(spots.length, rnd && rnd.cap > 1 ? rnd.cap - 1 : spots.length);
      for (let j = 0; j < n; j++) { const [x, yy] = spots[j], [mesh, tip] = round(f0, yy, x); chk.rounds.push({ t: (j + 1) / n, mesh, tip }); }
    }
    return chk;
  }
  // A cartridge's dimensions (metres) from the gun's caliber (G.GUN_SPECS: bullet diameter and case length, mm): a
  // bottlenecked rifle case's head is about 3.6 mm wider than its bullet; a straight pistol case's, 0.9; a shotgun
  // shell is its bore and its length.
  function roundDims(def) {
    const g = G.GUN_SPECS[def.id];
    if (!g || !g.caliber || !g.caseLength) return null;
    const cal = g.caliber, cl = g.caseLength;
    if (g.shotCount > 1 || cal > 15) return { head: (cal + 2.2) / 1000, cs: cl / 1000, bl: 0, bd: cal / 1000, shell: true };
    const rifle = cl / cal > 2.6 && (cal < 10 || cl / cal > 6); // (a big straight-walled case, .44 Magnum, .45-70, .500 S&W, is a pistol's shape)
    return { head: (cal + (rifle ? 3.6 : 0.9)) / 1000, cs: cl / 1000, bl: cal * (rifle ? 1.6 : 1.15) / 1000, bd: cal / 1000, pistol: !rifle };
  }
  // Magazines hang from y (the receiver's underside) at forward position f.
  function mag(k, o) {
    const m = o.m || M.black(), y = o.y, len = o.len || 0.18, d = o.d || 0.06, w = o.w || 0.024;
    if (o.well) k.box(w + 0.01, 0.014, d + 0.016, o.well, o.f - d / 2 - 0.008, y - 0.006);
    switch (o.t) {
      case 'curved': {
        // bent, not sheared: the centreline curves forward (c at the foot), the body keeps its depth square to it,
        // and the floorplate tilts with it
        // (st: how much of it runs straight down before the bend, as a STANAG's top does; ribs: the grooves pressed down
        // each side, following the curve)
        const c = o.c || 0.05, st = o.st || 0, N = 14, front = [], rear = [];
        const at = (t) => { const u = Math.max(0, (t - st) / (1 - st)), sl = 2 * c * u / (1 - st), n = Math.hypot(len, sl); return [o.f + c * u * u, y - len * t, len / n, sl / n]; }; // [f, y, normal f, normal y]
        const edge = (k0) => { const out = []; for (let i = 0; i <= N; i++) { const [cf, cy, nf, ny] = at(i / N); out.push([cf + nf * d * k0, cy + ny * d * k0]); } return out; };
        front.push(...edge(0.5)); rear.push(...edge(-0.5));
        k.prof(front.concat(rear.reverse()), w, m);
        for (const k0 of (o.ribs && !m.transparent ? [-0.18, 0.18] : [])) { const a = edge(k0 - 0.04), b = edge(k0 + 0.04); k.prof(a.slice(1, -1).concat(b.slice(1, -1).reverse()), w + 0.0012, M.rubber(), 0, null, 0); }
        const [bf, by] = at(1), fp = k.box(w + 0.004, 0.008, d + 0.006, m, bf - (d + 0.006) / 2, by - 0.002);
        fp.rotation.x = Math.atan2(2 * c / (1 - st), len);
        return magCheck(k, (t) => { const [cf, , nf] = at(t); return cf - nf * d / 2; }, y, len, w, d, m.transparent, o.rnd);
      }
      case 'straight': {
        const rk = o.rake || 0.012;
        k.prof([[o.f - d / 2, y], [o.f + d / 2, y], [o.f + d / 2 + rk, y - len], [o.f - d / 2 + rk, y - len]], w, m);
        k.box(w + 0.004, 0.008, d + 0.004, m, o.f - d / 2 + rk - 0.002, y - len - 0.002);
        return magCheck(k, (t) => o.f - d / 2 + rk * t, y, len, w, d, m.transparent, o.rnd);
      }
      case 'pistol': { // a pistol magazine in a carbine's well adapter (the Glock-mag conversions)
        const pd = 0.032, pw = 0.022, pl = len * 0.85;
        k.box(pw + 0.012, 0.03, pd + 0.014, M.black(), o.f - pd / 2 - 0.007, y - 0.01);
        k.prof([[o.f - pd / 2, y], [o.f + pd / 2, y], [o.f + pd / 2 + 0.006, y - pl], [o.f - pd / 2 + 0.006, y - pl]], pw, m);
        k.box(pw + 0.004, 0.01, pd + 0.006, m, o.f - pd / 2 + 0.004, y - pl - 0.003);
        return magCheck(k, (t) => o.f - pd / 2 + 0.006 * t, y, pl, pw, pd, m.transparent, o.rnd);
      }
      case 'drum': { // the round face toward the shooter, its axis along the bore
        const R = o.r || 0.075, dw = o.dw || 0.05;
        k.box(w, 0.03, d * 0.7, m, o.f - d * 0.35, y - 0.012);
        k.cyl(R, dw, m, o.f - dw / 2, y - R * 0.95, 0, R, 24);
        k.cyl(R * 0.35, dw + 0.006, M.steel(), o.f - dw / 2 - 0.003, y - R * 0.95);
        return drumCheck(k, o.f, y, R, dw, d, w, m.transparent, o.rnd);
      }
      case 'ammobox': {
        const sc = o.scale || 1;
        k.box(0.07 * sc, 0.11 * sc, 0.1 * sc, m, o.f - 0.05 * sc, y - 0.05 * sc, -0.02);
        k.box(0.004, 0.02, 0.06, M.brass(), o.f - 0.03, y + 0.005, -0.03);
        break;
      }
    }
  }
  function muzzle(k, type, f0, br, y = 0) {
    switch (type) {
      case 'flash': k.cyl(br * 1.3, 0.055, M.black(), f0, y); for (let i = 0; i < 3; i++) k.box(0.0035, br * 2.7, 0.03, M.rubber(), f0 + 0.02, y, (i - 1) * br * 0.9); return 0.055;
      case 'prong':
        k.cyl(br * 1.3, 0.015, M.black(), f0, y);
        for (let i = 0; i < 3; i++) { const a = (i / 3) * Math.PI * 2 + 0.5; k.box(0.005, 0.005, 0.045, M.black(), f0 + 0.012, y + Math.cos(a) * br * 1.15, Math.sin(a) * br * 1.15); }
        return 0.057;
      case 'brake': k.box(0.04, 0.026, 0.065, M.black(), f0, y); for (let i = 0; i < 3; i++) k.box(0.044, 0.012, 0.008, M.rubber(), f0 + 0.012 + i * 0.016, y); return 0.065;
      case 'bigbrake': k.box(0.06, 0.04, 0.11, M.black(), f0, y); for (let i = 0; i < 3; i++) k.box(0.064, 0.02, 0.014, M.rubber(), f0 + 0.02 + i * 0.03, y); return 0.11;
      case 'comp': k.cyl(br * 1.45, 0.045, M.black(), f0, y); for (let i = 0; i < 3; i++) k.box(0.006, 0.004, 0.006, M.rubber(), f0 + 0.01 + i * 0.012, y + br * 1.45); return 0.045;
      case 'slant': k.cyl(br * 1.35, 0.05, M.black(), f0, y); k.box(0.012, 0.006, 0.012, M.rubber(), f0 + 0.032, y + br * 1.35); return 0.05;
      case 'cutts': k.cyl(br * 1.5, 0.06, M.blued(), f0, y); for (let i = 0; i < 4; i++) k.box(0.012, 0.004, 0.005, M.rubber(), f0 + 0.015 + i * 0.01, y + br * 1.5); return 0.06;
      case 'tri': k.cyl(br * 1.15, 0.03, M.black(), f0, y); for (let i = 0; i < 3; i++) { const a = (i / 3) * Math.PI * 2; k.box(0.006, 0.006, 0.02, M.black(), f0 + 0.005, y + Math.cos(a) * br * 1.3, Math.sin(a) * br * 1.3); } return 0.03;
      case 'can': { const r = Math.max(0.019, br * 1.9); k.cyl(r, 0.17, M.black(), f0, y); k.cyl(r + 0.0005, 0.01, M.gunmetal(), f0 + 0.16, y); return 0.17; }
      case 'shortcan': k.cyl(Math.max(0.0155, br * 1.7), 0.11, M.black(), f0, y); k.ringZ(Math.max(0.0155, br * 1.7), 0.0012, M.gunmetal(), f0 + 0.02, y); return 0.11;
      case 'longcan': k.cyl(0.015, 0.16, M.black(), f0, y); k.ringZ(0.015, 0.0015, M.gunmetal(), f0 + 0.04, y); return 0.16;
      case 'pcomp': k.box(0.026, 0.024, 0.032, M.black(), f0, y + 0.004); for (let i = 0; i < 2; i++) k.box(0.01, 0.004, 0.006, M.rubber(), f0 + 0.008 + i * 0.012, y + 0.016); return 0.032;
      case 'choke': k.cyl(br * 1.12, 0.025, M.blued(), f0, y); k.ringZ(br * 1.12, 0.0012, M.steel(), f0 + 0.025, y); return 0.025;
      case 'breacher':
        k.cyl(br * 1.4, 0.05, M.black(), f0, y);
        for (let i = 0; i < 4; i++) { const a = (i / 4) * Math.PI * 2; k.box(0.006, 0.006, 0.016, M.black(), f0 + 0.05, y + Math.cos(a) * br * 1.2, Math.sin(a) * br * 1.2); }
        return 0.066;
      case 'boxcan': k.box(0.05, 0.052, 0.2, M.black(), f0, y); k.cyl(0.012, 0.004, M.rubber(), f0 + 0.2, y); return 0.2;
      default: return 0;
    }
  }
  function handguard(k, o, f0, fm, rm) {
    const len = o.len, m = o.m || fm;
    switch (o.t) {
      case 'rail': {
        const geo = new T.CylinderGeometry(0.024, 0.024, len, 8); geo.rotateY(Math.PI / 8); geo.rotateX(Math.PI / 2);
        const mesh = new T.Mesh(geo, o.m || rm); mesh.position.set(0, 0, -(f0 + len / 2)); k.add(mesh);
        S.rail(k, f0, len, 0.022, o.m || rm);
        for (const x of [-0.026, 0.026]) sideRail(k, f0 + 0.01, len - 0.02, 0, x, o.m || rm); // (and one each side)
        return;
      }
      case 'mlok': {
        const geo = new T.CylinderGeometry(0.021, 0.021, len, 8); geo.rotateY(Math.PI / 8); geo.rotateX(Math.PI / 2);
        const mesh = new T.Mesh(geo, o.m || rm); mesh.position.set(0, 0, -(f0 + len / 2)); k.add(mesh);
        for (let i = 0; i < Math.floor(len / 0.04); i++) for (const x of [-0.021, 0.021]) k.box(0.002, 0.008, 0.022, M.rubber(), f0 + 0.012 + i * 0.04, -0.004, x);
        S.rail(k, f0, len, 0.02, o.m || rm);
        return;
      }
      case 'wood':
        if (o.under) { // side-by-side barrels: a splinter forend beneath them, nothing over the top (the sight line runs there)
          k.prof([[f0, -0.03], [f0, -0.008], [f0 + len, -0.008], [f0 + len, -0.022]], 0.04, m);
          return;
        }
        k.prof([[f0, -0.032], [f0, 0.012], [f0 + len, 0.012], [f0 + len, -0.025]], 0.042, m);
        k.cyl(0.012, len * 0.8, m, f0, 0.022);
        return;
      case 'stockfore': // one-piece rifle stock running under the barrel
        k.prof([[f0 - 0.01, -0.038], [f0 - 0.01, 0.006], [f0 + len, 0.004], [f0 + len, -0.018], [f0 + len * 0.3, -0.03]], 0.036, m);
        return;
      case 'slim': k.cyl(0.018, len, m, f0, 0); return;
      case 'carbine':
        k.cyl(0.021, len, m, f0, 0, 0, 0.019, 12);
        for (let i = 0; i < Math.floor(len / 0.03); i++) k.box(0.044, 0.004, 0.012, M.rubber(), f0 + 0.012 + i * 0.03, -0.004);
        return;
      case 'shroud':
        k.cyl(0.018, len, m, f0, 0);
        for (let i = 0; i < Math.floor(len / 0.025); i++) k.box(0.038, 0.008, 0.01, M.rubber(), f0 + 0.008 + i * 0.025, 0.006);
        return;
      case 'fins':
        for (let i = 0; i < Math.floor(len / 0.008); i++) k.cyl(0.014, 0.004, M.blued(), f0 + i * 0.008, 0);
        return;
      case 'box': k.box(0.046, 0.05, len, m, f0, -0.005); return;
      case 'g36': { // the G36's: deep, its top just under the receiver's, a sloped nose, a lip along its foot, vents high
        // on its sides (from the front back: six on the rifle's, fewer on the G36K's), or (rails) a rail each side and
        // under; ahead of it, round the barrel, the sleeve with the bayonet lug (o.bl: the barrel, if there's room)
        const V = (px) => px * 0.000945, top = V(37.6), bot = V(-13.4), lip = V(-29.4), x = 0.021;
        k.prof([[f0, top], [f0 + len - V(22), top], [f0 + len, V(5.6)], [f0 + len, bot], [f0 + len - V(40), bot], [f0 + len - V(46), lip], [f0 + V(28), lip], [f0, V(-36)]], 0.042, m, 0, null, 0.003);
        if (o.rails) { for (const sd of [-1, 1]) sideRail(k, f0 + 0.04, len - 0.07, V(4), sd * (x + 0.0035)); S.rail(k, f0 + 0.04, len - 0.08, lip - 0.0045, M.black()); k.box(0.02, 0.005, len - 0.08, M.black(), f0 + 0.04, lip - 0.002); }
        else for (let i = 0; i < 6; i++) { const f = f0 + len - V(49) - i * V(30); if (f < f0 + 0.05) break; for (const sd of [-1, 1]) k.box(0.0006, V(4.5), V(20), M.rubber(), f, V(30.6), sd * x); }
        if (o.bl && o.bl - len > V(52)) { k.cyl(V(10), V(27), M.black(), f0 + len + V(25), 0); k.box(0.008, V(18), V(22), M.black(), f0 + len + V(27), V(-11)); }
        return;
      }
      case 'sig': { // the MCX's and MPX's: the upper's top rail runs on forward of the receiver (o.ext of it: the upper's,
        // its colour), and the handguard slides in under that and carries the rail on, flush, from where it stops; so
        // it's flat-topped and as tall as the upper (no AR handguard fits). Its sides: M-LOK slots, a Gen 1's KeyMod
        // keyholes, or (lite) a Spear LT's triangular windows
        const hm = o.m || rm, ext = Math.min(o.ext || 0, len - 0.03);
        k.prof([[f0, -0.022], [f0, 0.0175], [f0 + ext, 0.0175], [f0 + ext, 0.026], [f0 + len, 0.026], [f0 + len, -0.018], [f0 + len - 0.012, -0.024], [f0 + 0.006, -0.024]], 0.03, hm, 0, null, 0.005);
        const n = Math.floor((len - 0.02) / (o.slots === 'lite' ? 0.045 : 0.034));
        for (let i = 0; i < n; i++) for (const x of [-0.0151, 0.0151]) {
          if (o.slots === 'lite') { const f = f0 + 0.012 + i * 0.045, up = i % 2; k.prof(up ? [[f, -0.014], [f + 0.04, -0.014], [f + 0.02, 0.012]] : [[f, 0.012], [f + 0.04, 0.012], [f + 0.02, -0.014]], 0.0004, M.rubber(), x, null, 0); continue; }
          const f = f0 + 0.014 + i * 0.034;
          k.box(0.0004, 0.006, o.slots === 'keymod' ? 0.014 : 0.022, M.rubber(), f, -0.002, x);
          if (o.slots === 'keymod') k.cylX(0.0045, 0.0004, M.rubber(), f + 0.018, -0.002, x);
        }
        S.rail(k, f0 + ext, len - ext, 0.026, hm);
        return;
      }
      case 'qbz': { // the QBZ-191's: deep and squared off, its rail level with the receiver's, M-LOK slots low down, vents through the bottom
        k.prof([[f0, -0.026], [f0, 0.03], [f0 + len - 0.012, 0.03], [f0 + len, 0.022], [f0 + len, -0.018], [f0 + len - 0.02, -0.026]], 0.04, m, 0, null, 0.004);
        for (let i = 0; i < Math.floor((len - 0.04) / 0.04); i++) for (const x of [-0.0201, 0.0201]) k.box(0.002, 0.008, 0.022, M.rubber(), f0 + 0.02 + i * 0.04, -0.012, x);
        for (let i = 0; i < 4; i++) k.box(0.0402, 0.006, 0.012, M.rubber(), f0 + len - 0.09 + i * 0.02, -0.02);
        S.rail(k, f0, len, 0.03, o.m || rm);
        return;
      }
      case 'vector': // the Vector's: its rails are the upper's (rcv 'vector'); out of the front only the barrel's collar
        k.cyl(0.0145, 0.012, o.m || rm, f0, 0, 0, 0.0135, 16);
        return;
    }
  }

  // ---------------------------------------------------------------- attachments
  // Foregrips hang under the handguard at forward position f.
  function foregrip(k, t, f, m) {
    switch (t) {
      case 'vertical': k.prof([[f - 0.012, -0.022], [f + 0.016, -0.022], [f + 0.014, -0.11], [f - 0.01, -0.11]], 0.026, m); break;
      case 'angled': k.prof([[f - 0.045, -0.022], [f + 0.03, -0.022], [f + 0.012, -0.058], [f - 0.03, -0.05]], 0.026, m); break;
      case 'stubby': k.prof([[f - 0.01, -0.022], [f + 0.016, -0.022], [f + 0.014, -0.068], [f - 0.008, -0.068]], 0.026, m); k.box(0.03, 0.006, 0.03, M.rubber(), f - 0.012, -0.07); break;
      case 'stop': k.box(0.02, 0.016, 0.014, M.black(), f, -0.03); break;
      case 'bipod':
        k.box(0.03, 0.016, 0.03, M.black(), f - 0.015, -0.03);
        for (const x of [-0.012, 0.012]) { k.cyl(0.004, 0.2, M.black(), f - 0.2, -0.04, x); k.box(0.012, 0.008, 0.01, M.rubber(), f - 0.21, -0.04, x); }
        break;
    }
  }
  // Laser / aiming modules on a side rail at forward position f: the right (side 1), or the left (-1), mirrored.
  function tactical(k, t, f, y, x, side = 1) {
    if (!t) return;
    if (t === 'light' || t === 'lightX' || t === 'plight' || t === 'pcombo') { // a weapon light: a tube with a lens on the front
      const r = t === 'lightX' ? 0.016 : t === 'light' ? 0.013 : 0.011, len = t === 'lightX' ? 0.12 : t === 'light' ? 0.095 : 0.055, cx = x + side * r * 0.9;
      k.box(0.01, 0.012, len * 0.5, M.black(), f - len * 0.75, y, x + side * 0.002);
      k.cyl(r, len, M.black(), f - len, y, cx, r * 1.15, 16);
      k.cyl(r * 1.08, 0.003, M.reflexLens(), f, y, cx);
      if (t === 'pcombo') k.cyl(0.0035, 0.004, M.dot(), f, y - r - 0.004, cx);
      return;
    }
    const peq = t === 'peq', big = peq ? 1.4 : 1;
    k.box(0.02 * big, 0.022 * big, 0.05 * big, peq ? M.tan() : M.black(), f - 0.05 * big, y, x + side * 0.01 * big);
    k.cyl(0.0045, 0.004, t === 'laserG' || t === 'plaserG' ? M.glow() : M.dot(), f, y + 0.004, x + side * 0.01 * big);
    if (peq) k.cyl(0.006, 0.004, M.lens(), f, y - 0.008, x + side * 0.01 * big);
  }
  // A short rail on the side (standing on edge, its teeth outward) from f0, len long, centred at y, its face at x.
  function sideRail(k, f0, len, y, x, m = M.black()) {
    const s = Math.sign(x) || 1;
    k.box(0.007, 0.019, len, m, f0, y, x - s * 0.0035);
    for (let i = 0; i < Math.floor(len / 0.0105); i++) k.box(0.004, 0.021, 0.0052, m, f0 + 0.003 + i * 0.0105, y, x + s * 0.002);
  }
  // Charging handle at the back of an AR upper.
  function charging(k, t, rm) {
    k.box(0.03, 0.007, 0.022, rm, -0.012, 0.02);
    if (t === 'ext' || t === 'ambi') k.box(0.012, 0.009, 0.016, M.black(), -0.008, 0.021, -0.02);
    if (t === 'ambi') k.box(0.012, 0.009, 0.016, M.black(), -0.008, 0.021, 0.02);
  }
  // A cocking handle. h: f, y, x (where it sits), travel (how far back it comes), style, sz (its size), recip (it
  // rides the bolt: it moves when the gun fires). Styles: 'knob' (a stem out the side with a ball on it: an AK's,
  // an op rod's), 'pair' (one each side: a Skorpion's, a P90's), 'tube' (HK: a tab in a slot along a tube that stays
  // put), 'top' (a knob standing up on top: an Uzi's, a Thompson's), 'tee' (a T at the back of the top, like an
  // AR's: an MP7's, a G36's), 'fold' (a flat lever along the side with its tab folded out: a FAL's, a Vector's).
  // Sets h.grab, where the hand takes it ([f, y, x]); returns the part that moves (the tube's built outside it).
  function cockHandle(k, h) {
    const st = h.style || 'knob', s = Math.sign(h.x) || 1, z = h.sz || 1, B = M.black(), St = M.steel();
    if (st === 'tube') k.cyl(0.006, 0.09, B, h.f - 0.07, h.y, h.x + 0.002);
    const p = k.part(h.f, h.y);
    k.into(p, h.f, h.y);
    if (st === 'tube') { k.box(0.012, 0.016, 0.01, B, h.f - 0.006, h.y, h.x - 0.006); h.grab = [h.f, h.y + 0.006, h.x - 0.02]; }
    else if (st === 'top') { const sh = h.stem || 0.014; k.cylY(0.004, sh, St, h.f, h.y + sh / 2, h.x); k.box(0.012, 0.009, 0.014, B, h.f - 0.007, h.y + sh + 0.003, h.x); h.grab = [h.f, h.y + sh + 0.018, h.x]; }
    else if (st === 'tee') { k.box(0.008, 0.006, 0.03, B, h.f - 0.015, h.y, h.x); k.box(0.034, 0.007, 0.008, B, h.f - 0.019, h.y, h.x); h.grab = [h.f - 0.015, h.y + 0.014, h.x]; }
    else if (st === 'fold') { k.box(0.004, 0.012 * z, 0.032, B, h.f - 0.016, h.y, h.x); k.box(0.016 * z, 0.01 * z, 0.008, B, h.f - 0.004, h.y, h.x + s * 0.009 * z); h.grab = [h.f, h.y + 0.006, h.x + s * 0.028 * z]; }
    else for (const side of st === 'pair' ? [-1, 1] : [s]) { // (a pair: the left hand takes the left one)
      const x = side * Math.abs(h.x);
      k.cylX(0.004 * z, 0.022 * z, St, h.f, h.y, x);
      k.sphere(0.0065 * z, B, h.f, h.y, x + side * 0.012 * z);
      if (side === (st === 'pair' ? -1 : s)) h.grab = [h.f, h.y + 0.006, x + side * 0.026 * z];
    }
    k.into(null);
    return p;
  }
  // Sights by type. top = height of the rail / mounting surface.
  function sightOf(k, o, top, L, bl, br, front, ofs) {
    const frontF = L + Math.min(bl * 0.82, bl - 0.03);
    if (o.optic === 'riser') k.box(0.024, o.riser || 0.022, 0.034, M.black(), ofs - 0.017, top + (o.riser || 0.022) / 2); // a pistol optic riser with nothing on it (the irons still work)
    switch (o.optic || 'irons') {
      case 'reddot': return S.reddot(k, ofs, top, o);
      case 'minidot': return S.minidot(k, ofs, top, o);
      case 'holo': return S.holo(k, ofs, top);
      case 'acog': return S.acog(k, ofs, top);
      case 'prism': return S.prism(k, ofs, top, o);
      case 'lpvo': return S.scope(k, ofs, top, 0.24, 0.022, 0.038);
      case 'scope': return S.scope(k, ofs, top, o.scopeLen, o.scopeObj);
      case 'bead': { const sy = Math.max(top, br) + 0.009; return S.bead(k, 0.02, front - 0.008, sy, [L, front - 0.006], br); } // clear of the receiver's (bevelled) top
      case 'notch': if ((o.irons || 'ak') === 'ak') return S.irons(k, L * 0.85, frontF, top + 0.02, top, br, 'ak');
      // falls through: a gun whose own sights are an aperture
      default: {
        const st = o.irons || 'ar';
        return S.irons(k, Math.max(0.015, ofs - L * 0.4), frontF, top + (st === 'buckhorn' ? 0.014 : 0.034), top, br, st);
      }
    }
  }

  // ---------------------------------------------------------------- archetypes
  // Long gun: receiver (base), then every part in its slot.
  // the AUG's trace (rifle(), rcv 'aug'): a pixel of its reference photo ([x, y]: x back from the muzzle to the butt at
  // 1385, y down from the bore at 365) to gun space ([forward from the butt, up], metres)
  const augTrace = ([x, y]) => [(1385 - x) * 0.00057, (365 - y) * 0.00057];
  // the Vector's trace (rifle(), rcv 'vector'): a pixel of the reference photo ([x, y], x forward from the receiver's back
  // at 318, y down from the bore at 140) to gun space ([forward, up], metres)
  const vecTrace = ([x, y]) => [(x - 318) * 0.00087, (140 - y) * 0.00087];
  // the QBZ-95's trace (rifle(), rcv 'qbz95'): a pixel of its reference photo ([x, y]: x forward from the butt at 88, y
  // down from the bore at 262, the photo drawn 1500 px wide) to gun space ([forward, up], metres)
  const qbzTrace = ([x, y]) => [(x - 88) * 0.000574, (262 - y) * 0.000574];
  // the F2's trace (rifle(), rcv 'f2'): a pixel of its reference photo ([x, y]: x forward from the butt at 204, y down
  // from the bore at 931, the photo drawn 3000 px wide) to gun space ([forward, up], metres)
  const f2Trace = ([x, y]) => [(x - 204) * 0.0003554, (931 - y) * 0.0003554];
  // the SCAR's trace (rifle(), rcv 'scar', and its stock): a pixel of its reference photo ([x, y]: x forward from the back
  // of the upper at 400, y down from the bore at 245, the photo drawn 1500 px wide) to gun space ([forward, up], metres)
  const scarTrace = ([x, y]) => [(x - 400) * 0.00059, (245 - y) * 0.00059];
  // the G36's trace (rifle(), rcv 'g36', its handguard and its stock): a pixel of its reference photo ([x, y]: x forward
  // from the stock's hinge at 330, y down from the bore at 143.6) to gun space ([forward, up], metres)
  const g36Trace = ([x, y]) => [(x - 330) * 0.000945, (143.6 - y) * 0.000945];
  function rifle(k, o) {
    const L = o.L || 0.26, rm = o.rm || M.black(), fm = o.fm || M.polymer(), bull = o.rcv === 'bullpup' || o.rcv === 'qbz95';
    const gf = o.grip != null ? o.grip : bull ? L * 0.62 : 0.045;
    const anim = {};
    let top;
    const rcv = o.rcv || 'ar', tr = o.look && G.GunTraces[o.look], VT = tr ? tracer(tr) : null, mats = { frame: o.rm || fm, grip: o.gm || fm, slide: rm, stock: o.sm || fm }; // (traced: js/guntraces.js)
    k.tag('base');
    if (rcv === 'ar') {
      k.prof([[0, -0.012], [0, 0.026], [L, 0.026], [L, -0.012]], 0.03, rm);
      k.prof([[0.004, -0.012], [0.004, -0.034], [0.03, -0.042], [L * 0.74, -0.042], [L * 0.8, -0.012]], 0.028, rm);
      k.box(0.004, 0.013, 0.045, M.black(), L * 0.36, 0.007, 0.0158);
      top = o.railTop === false ? 0.026 : S.rail(k, 0.004, L - 0.008, 0.026, rm);
    } else if (rcv === 'ak') {
      k.prof([[0, -0.046], [0, 0.014], [0.012, 0.026], [L - 0.01, 0.026], [L, 0.016], [L, -0.046]], 0.036, rm);
      for (let i = 0; i < 3; i++) k.box(0.038, 0.003, 0.004, rm, 0.05 + i * 0.06, 0.027);
      k.box(0.003, 0.012, L * 0.55, rm, 0.04, 0.0, 0.0195);
      top = 0.027;
    } else if (rcv === 'box') {
      const H = o.H || 0.085, Wd = o.W || 0.045;
      if (tr) { tracedParts(k, tr, VT, 'base', mats); top = VT([0, tr.topY])[1]; }
      else { k.prof([[0, -H * 0.55], [0, H * 0.45], [L, H * 0.45], [L, -H * 0.55]], Wd, rm); top = H * 0.45; }
      if (o.siderails) for (const x of [-1, 1]) sideRail(k, L * 0.58, L * 0.38, -0.004, x * (Wd / 2 + 0.0035)); // (a short rail each side of the front: an MP7's)
      if (o.optic && !['irons', 'notch', 'bead', 'none'].includes(o.optic)) top = S.rail(k, L * 0.15, L * 0.7, top, rm);
    } else if (rcv === 'round') {
      k.prof([[0, -0.045], [0, 0.01], [L, 0.01], [L, -0.04]], 0.036, rm);
      k.cyl(0.018, L, rm, 0, 0.01);
      top = 0.028;
    } else if (rcv === 'bullpup') {
      k.prof([[-0.01, 0.03], [L, 0.03], [L, -0.045], [L * 0.32, -0.045], [0.06, -0.06], [0.04, -0.135], [-0.01, -0.135]], 0.046, fm);
      k.box(0.05, 0.17, 0.014, M.rubber(), -0.024, -0.052);
      if (o.siderails) for (const x of [-0.028, 0.028]) sideRail(k, L - 0.14, 0.12, -0.006, x); // (on the front of the shell, each side)
      top = o.railTop === false && ['irons', 'notch', 'bead'].includes(o.optic) ? 0.03 : S.rail(k, L * 0.35, L * 0.6, 0.03, rm);
    } else if (rcv === 'aug') {
      // The Steyr AUG (A1, the StG 77), traced from a side photo (Wikimedia Commons, "Steyr AUG 5,56 mm.JPG", MoserB,
      // public domain) at 0.57 mm a pixel: 790 mm overall with its 508 mm barrel, Steyr's figures. A bullpup: the
      // receiver and the magazine behind the hand, everything in one moulded shell from the butt to the nose under
      // the barrel lock; the trigger guard encloses the whole hand, a bar from the nose down to the foot of the grip
      // (you fire it with gloves on, from either hand). The aluminium receiver housing runs along the top of the
      // shell's front, the barrel locking into its front with the folding foregrip hinged under it; on top, the
      // integral 1.5x optic in its carrying handle (the A3's rail instead, when there's another sight on it). The
      // magazine is clear, raked a little forward. Its width is the Bundesheer's figure for the StG 77, 85 mm across
      // everything (the charging handle and the sling swivels standing proud): the shell 70 mm, bevelled round, the
      // grip and guard narrower, the receiver housing 48.
      const V = augTrace, pts = (a) => a.map(V), B = M.black(), D = M.rubber(), sh = fm;
      // the shell: butt, cheek and the magazine well behind the grip, its nose under the receiver
      const shell = k.prof(pts([[490, 400], [690, 400], [700, 330], [1240, 330], [1300, 334], [1350, 345], [1385, 368], [1372, 425], [1336, 608], [1318, 626], [1215, 622], [1198, 600], [1160, 556], [1110, 526], [1098, 505],
        [1062, 492], [940, 492], [928, 478], [900, 463], [870, 450], [845, 443], [805, 440], [712, 438], [540, 440], [488, 428]]), 0.07, sh, 0, null, 0.007);
      // its top is a roof: the flanks are flat up to a crease just above the bore line, then lean in to a top a little
      // under half as wide (what keeps it slender from above and from the front)
      { const ys = V([0, 358])[1], yt = V([0, 330])[1], pa = shell.geometry.attributes.position;
        for (let i = 0; i < pa.count; i++) { const y = pa.getY(i); if (y > ys) pa.setX(i, pa.getX(i) * (1 - 0.56 * Math.min(1, (y - ys) / (yt - ys)))); }
        pa.needsUpdate = true; shell.geometry.computeVertexNormals(); }
      // the grip and the trigger guard: one moulding, the bar from the nose down round the whole hand to the grip's foot.
      // The grip itself is slim (about 40 mm front to back) and raked back, the opening in front of it running down under
      // its slanted front edge; a finger rest where it meets the shell
      k.prof(pts([[805, 440], [800, 470], [812, 500], [832, 530], [846, 565], [848, 600], [840, 612], [770, 612], [720, 606], [690, 595], [488, 428], [538, 440], [700, 575],
        [725, 592], [770, 596], [792, 588], [790, 560], [770, 525], [752, 495], [737, 475], [722, 455], [712, 440]]), 0.034, sh, 0, null, 0.004);
      k.box(0.006, 0.04, 0.008, B, V([706, 0])[0], V([0, 466])[1]); // the trigger, just in front of the finger rest
      // the butt pad, a sling loop on the butt's side, the crossbolt safety and the screws through the shell
      k.prof(pts([[1376, 368], [1386, 368], [1374, 425], [1338, 610], [1328, 610], [1364, 425]]), 0.066, D, 0, null, 0.0004);
      { const [f, y] = V([1325, 435]); k.cylX(0.006, 0.085, M.steel(), f, y); } // (the sling swivel through the butt: 85 mm across)
      for (const [x, y] of [[920, 408], [737, 462]]) { const [f, yy] = V([x, y]); k.box(0.074, 0.009, 0.012, B, f - 0.006, yy); }
      for (const [x, y] of [[1085, 467], [1295, 600]]) { const [f, yy] = V([x, y]); k.cylX(0.004, 0.0712, M.steel(), f, yy); }
      // the receiver housing over the front of the shell: the bolt carrier's rods showing in its slot
      k.prof(pts([[462, 330], [705, 330], [693, 398], [462, 412]]), 0.048, rm);
      k.box(0.0505, 0.009, V([505, 0])[0] - V([700, 0])[0], M.steel(), V([700, 0])[0], V([0, 386])[1]);
      // the barrel lock at its front, the barrel's collar and gas cylinder forward of it, short side rails on the lock
      k.prof(pts([[440, 320], [495, 320], [495, 412], [440, 412]]), 0.052, rm);
      k.cyl(0.0137, V([360, 0])[0] - V([440, 0])[0], rm, V([440, 0])[0], V([0, 367])[1]);
      for (const x of [-0.03, 0.03]) sideRail(k, V([492, 0])[0], 0.028, V([0, 372])[1], x);
      // the folding foregrip, hinged under the lock
      k.prof(pts([[445, 405], [492, 405], [492, 430], [445, 430]]), 0.03, rm);
      k.prof(pts([[402, 425], [470, 425], [470, 598], [458, 604], [412, 602], [402, 590]]), 0.03, o.vfgM || sh);
      top = V([0, 330])[1];
    } else if (rcv === 'qbz95') {
      // The QBZ-95 (Type 95), traced from a side photo of the right side (Wikimedia Commons, "QBZ95 automatic rifle mod
      // noBG.png") at 0.574 mm a pixel: 760 mm overall, the PLA's figure, its 463 mm barrel nearly all inside. A bullpup in
      // one polymer shell: the butt, the receiver over the magazine (the ejection port right above it), and in front of
      // the grip the long nose, ribbed underneath, ending at the front sight. Over it all the carrying handle, a loop
      // from the magazine well to the front sight with the rear aperture and the cocking handle in its opening. The
      // grip is raked back, the trigger guard a bar from its top to the "front grip" moulded under the nose.
      const V = qbzTrace, pts = (a) => a.map(V), B = M.black(), D = M.rubber(), sh = fm;
      k.prof(pts([[88, 192], [110, 187], [200, 192], [214, 204], [420, 210], [545, 212], [640, 207], [890, 204], [935, 199], [1092, 197], [1158, 210], [1165, 222], [1165, 300],
        [1100, 302], [965, 302], [950, 317], [938, 350], [930, 420], [882, 420], [882, 312], [785, 313], [780, 330], [690, 328], [545, 331], [400, 331], [275, 331],
        [260, 335], [245, 342], [230, 361], [215, 387], [200, 394], [95, 394], [88, 388]]), 0.054, sh, 0, null, 0.007);
      // the carrying handle: the loop, narrower than the shell
      k.prof(pts([[545, 213], [548, 166], [560, 115], [578, 96], [600, 98], [875, 114], [890, 120], [905, 140], [920, 165], [935, 199]]), 0.03, sh, 0,
        [pts([[625, 141], [872, 141], [888, 160], [893, 196], [625, 204]])], 0.004);
      // the grip and the trigger guard's bar to the front grip; the trigger
      k.prof(pts([[690, 326], [785, 313], [782, 330], [770, 364], [756, 422], [752, 488], [740, 500], [690, 496], [678, 490], [680, 420], [684, 380]]), 0.032, sh, 0, null, 0.004);
      k.prof(pts([[780, 357], [876, 372], [884, 418], [866, 410], [845, 394], [800, 372], [780, 366]]), 0.018, sh, 0, null, 0.003);
      k.box(0.006, V([0, 313])[1] - V([0, 356])[1], 0.007, B, V([815, 0])[0], (V([0, 313])[1] + V([0, 356])[1]) / 2);
      // the butt pad, the ejection port (right side, over the magazine), the magazine catch behind the well, the pins
      k.prof(pts([[86, 192], [97, 190], [97, 393], [86, 390]]), 0.056, D, 0, null, 0.0005);
      k.box(0.002, V([0, 222])[1] - V([0, 250])[1], V([544, 0])[0] - V([412, 0])[0], D, V([412, 0])[0], V([0, 236])[1], 0.0271);
      k.box(0.003, 0.012, V([536, 0])[0] - V([420, 0])[0], M.steel(), V([420, 0])[0], V([0, 240])[1], 0.0272); // (the bolt's flank in the port)
      k.prof(pts([[362, 329], [388, 329], [384, 372], [366, 372]]), 0.02, B);
      for (const [x, y] of [[131, 304], [599, 304]]) { const [f, yy] = V([x, y]); k.cylX(0.0065, 0.0565, B, f, yy); }
      // the ribs under the nose, and the lug under the barrel at the front cap
      for (let i = 0; i < 8; i++) k.box(0.0565, V([0, 232])[1] - V([0, 290])[1], 0.0045, D, V([992 + i * 13, 0])[0], V([0, 261])[1]);
      k.box(0.012, V([0, 270])[1] - V([0, 290])[1], V([1215, 0])[0] - V([1165, 0])[0], B, V([1165, 0])[0], V([0, 280])[1]);
      // the front sight's base (the post on it, below: the sights)
      k.prof(pts([[1098, 198], [1156, 206], [1150, 166], [1104, 166]]), 0.028, sh, 0, null, 0.003);
      top = V([0, 204])[1];
    } else if (rcv === 'f2') {
      // The FAMAS G2 (this is the F2), traced from a side photo of the right side (Wikimedia Commons, "FAMAS-G2-IMG
      // 8894-white.jpg", CC BY-SA 2.0 fr; the first cut of it, an F1, was "FAMAS Assaultrifle FRA noBG.png", CC BY-SA 4.0,
      // the same shell) at 0.3554 mm a pixel: 757 mm overall, the G2's figure, the barrel nearly all inside. A bullpup
      // in a composite shell: the butt and cheek step, the ejection port, the magazine well behind the hand, the belly
      // arching up to the grip. What makes it a G2 is the guard: one moulding with the grip, a band from the grip's foot
      // up to the handguard that encloses the whole hand (the F1's is a thin loop). Over the receiver the carrying
      // handle, a hollow box (two walls and a roof, the sights looking down the tunnel between them) with the cocking
      // lever in its window; the handguard's cooling bumps underneath, the grenade sight along the receiver, the spigot's
      // ridges and the flash hider out front.
      const V = f2Trace, pts = (a) => a.map(V), B = M.black(), D = M.rubber(), sh = fm;
      // the shell from the butt to the front of the magazine well, wider than the receiver
      k.prof(pts([[205, 949], [225, 827], [239, 815], [252, 823], [265, 816], [280, 817], [304, 818], [470, 818], [510, 868], [520, 871], [603, 873], [611, 862], [624, 861], [905, 854], [905, 1150], [896, 1155], [861, 1161],
        [652, 1170], [651, 1106], [623, 1103], [610, 1115], [528, 1133], [515, 1151], [486, 1159], [461, 1175], [449, 1174], [441, 1158], [434, 1156], [322, 1181], [307, 1195], [285, 1196], [277, 1203], [237, 1203],
        [226, 1193], [211, 1162], [217, 1155], [209, 1143], [208, 1123], [215, 1119], [207, 1107], [206, 1088], [213, 1083], [204, 1068], [203, 1035]]), 0.064, sh, 0, null, 0.007);
      // the receiver and handguard: the belly arching up behind the grip, the bumps along the underside, the barrel's collar at the front
      k.prof(pts([[905, 846], [1992, 846], [1990, 862], [2000, 893], [2008, 975], [1995, 976], [1985, 991], [1928, 1037], [1905, 1052], [1881, 1062], [1840, 1062], [1815, 1054], [1758, 1063], [1704, 1050], [1681, 1063],
        [1661, 1063], [1608, 1052], [1595, 1063], [1522, 1065], [1522, 1058], [1117, 1056], [1116, 1049], [1083, 1031], [1010, 1042], [953, 1076], [922, 1110], [896, 1155], [905, 1150]]), 0.052, sh, 0, null, 0.006);
      // the grip and its guard, one moulding. The grip is raked back with finger grooves down its front; fit a grip sleeve
      // ('vertical', or any shape that isn't the F2's own) and it takes the grip's place on the same joint and rake; the
      // guard is the band from its foot up to the handguard, clear of both
      k.tag('grip');
      if ((o.gripT || 'ar') === 'ar') k.prof(pts([[1117, 1056], [1109, 1083], [1040, 1157], [1002, 1246], [1003, 1289], [1014, 1305], [1050, 1329], [1114, 1351], [1150, 1345], [1142, 1300], [1147, 1284], [1168, 1268],
        [1176, 1231], [1205, 1202], [1213, 1165], [1241, 1135], [1235, 1106], [1253, 1065], [1265, 1050]]), 0.034, o.gm || sh, 0, null, 0.006);
      else k.prof(pts([[1140, 1056], [1245, 1056], [1160, 1338], [1066, 1338]]), 0.03, o.gm || sh, 0, null, 0.004);
      k.tag('base');
      k.prof(pts([[1452, 1066], [1444, 1087], [1332, 1242], [1307, 1260], [1204, 1296], [1142, 1300], [1114, 1351], [1232, 1348], [1361, 1300], [1384, 1275], [1522, 1065], [1530, 1060], [1452, 1060]]), 0.012, B, 0, null, 0.002);
      // the trigger, and the selector's bar behind it
      k.prof(pts([[1281, 1062], [1308, 1062], [1306, 1096], [1328, 1118], [1318, 1125], [1287, 1094]]), 0.007, B, 0, null, 0.0008);
      k.prof(pts([[1326, 1064], [1370, 1064], [1343, 1099], [1318, 1092]]), 0.01, B, 0, null, 0.001);
      // the carrying handle: two walls and a roof, so the sight line runs down the tunnel between them; the window shows the lever
      const win = pts([[1126, 803], [1131, 794], [1165, 776], [1486, 772], [1550, 770], [1821, 767], [1876, 768], [1872, 819], [1688, 819], [1666, 810], [1641, 825], [1638, 845], [1580, 840], [1463, 839], [1138, 823]]);
      for (const x of [-0.0165, 0.0165]) k.prof(pts([[972, 860], [972, 844], [1001, 712], [1014, 693], [1034, 683], [1143, 682], [1849, 690], [1939, 693], [1953, 699], [1991, 737], [2000, 756], [2000, 860]]), 0.006, sh, x, [win], 0.0008);
      k.prof(pts([[989, 768], [1001, 712], [1014, 693], [1034, 683], [1143, 682], [1849, 690], [1939, 693], [1953, 699], [1991, 737], [2000, 756], [2000, 768]]), 0.04, sh, 0, null, 0.005);
      // the grenade sight's rod along the right of the receiver, its ear standing in the window
      { const [f0, y] = V([1140, 902]); k.cyl(0.0045, V([1710, 0])[0] - f0, M.gunmetal(), f0, y, 0.0275); }
      k.box(0.008, V([0, 810])[1] - V([0, 845])[1], V([1666, 0])[0] - V([1638, 0])[0], B, V([1638, 0])[0], (V([0, 810])[1] + V([0, 845])[1]) / 2);
      // the butt pad, the sling loop on its side, the ejection port (right side) with the bolt in it, the pins, the magazine catch
      k.prof(pts([[239, 815], [225, 827], [205, 949], [203, 1035], [204, 1068], [213, 1083], [206, 1088], [207, 1107], [215, 1119], [208, 1123], [209, 1143], [217, 1155], [211, 1162], [226, 1193], [237, 1203], [277, 1203],
        [285, 1196], [290, 820], [265, 816]]), 0.0662, D, 0, null, 0.0005);
      k.prof(pts([[262, 1002], [297, 1002], [300, 1078], [266, 1078]]), 0.003, M.steel(), 0.0325, [pts([[270, 1010], [289, 1010], [292, 1070], [274, 1070]])], 0.0004);
      k.box(0.002, V([0, 933])[1] - V([0, 979])[1], V([956, 0])[0] - V([647, 0])[0], D, V([647, 0])[0], V([0, 956])[1], 0.0321);
      k.box(0.003, 0.009, V([946, 0])[0] - V([657, 0])[0], M.steel(), V([657, 0])[0], V([0, 950])[1], 0.0322);
      { const [f, y] = V([909, 1049]); k.cylX(0.0075, 0.067, B, f, y); }
      { const [f, y] = V([1065, 889]); k.cylX(0.0058, 0.054, M.steel(), f, y); }
      { const [f, y] = V([688, 1078]); k.cylX(0.0058, 0.066, B, f, y); }
      if (o.siderails) for (const x of [-0.029, 0.029]) sideRail(k, L - 0.065, 0.055, -0.006, x); // (short rails on the handguard's flanks, the light and laser's)
      top = V([0, 846])[1];
    } else if (rcv === 'qbz192') {
      // The QBZ-192 (the QBZ-191 carbine), from photos (Wikimedia Commons, "QBZ-192 extended stock.jpg") and its 10.5"
      // barrel: a conventional layout. A tall flat-sided upper with a rail its whole length, carried on over the
      // handguard; a one-piece lower, the magazine well flaring under it; the charging handle on the right at the front.
      // The stock folds and telescopes on a rail (stock 'qbz').
      const B = M.black(), D = M.rubber();
      k.prof([[0, -0.01], [0, 0.03], [L, 0.03], [L, -0.01]], 0.034, rm);
      k.prof([[0.004, -0.01], [0.004, -0.03], [0.026, -0.044], [gf + 0.072, -0.046], [gf + 0.072, -0.064], [gf + 0.168, -0.064], [gf + 0.172, -0.046], [L * 0.9, -0.03], [L * 0.92, -0.01]], 0.032, rm);
      k.box(0.036, 0.006, gf + 0.172 - (gf + 0.068), rm, gf + 0.068, -0.062);
      k.box(0.002, 0.018, 0.072, D, 0.075, 0.012, 0.0172); // the ejection port
      k.box(0.003, 0.01, 0.06, M.steel(), 0.08, 0.012, 0.0174);
      for (const x of [-1, 1]) k.box(0.004, 0.006, 0.022, B, gf + 0.004, -0.002, x * 0.0175); // the selector, both sides
      k.box(0.004, 0.012, 0.014, B, gf + 0.06, -0.034, -0.0165); // the magazine release
      top = S.rail(k, 0.004, L - 0.006, 0.03, rm);
    } else if (rcv === 'mcx' || rcv === 'mpx') {
      // The SIG MCX and MPX (by eye from Wikimedia Commons, "SIG-MCX-Rifle.jpeg", "SIG MPX.jpg"): an AR-shaped upper and
      // lower but no buffer tube, the stock folding on a hinge at the back of the upper; a short-stroke piston, so the
      // upper is plain. The lower's magazine well flares out at its foot, much deeper on the MPX (its 9 mm magazine is
      // narrow), the trigger guard moulded in.
      const B = M.black(), D = M.rubber(), mpx = rcv === 'mpx';
      k.prof([[0, -0.012], [0, 0.026], [L, 0.026], [L, -0.012]], 0.031, rm);
      k.box(0.03, 0.044, 0.02, rm, -0.018, 0.004); // (the back of the upper, where the stock hinges)
      const w0 = gf + (mpx ? 0.054 : 0.04), w1 = gf + (mpx ? 0.104 : 0.118), wy = mpx ? -0.068 : -0.058;
      k.prof([[0.004, -0.012], [0.004, -0.034], [0.03, -0.044], [w0, -0.044], [w0 - 0.004, wy], [w1 + 0.006, wy], [w1, -0.044], [L * 0.8, -0.026], [L * 0.84, -0.012]], 0.028, rm);
      k.box(mpx ? 0.034 : 0.036, 0.007, w1 - w0 + 0.016, rm, w0 - 0.008, wy + 0.002); // (the flared lip)
      k.box(0.002, 0.014, 0.06, D, L * 0.38, 0.008, 0.0156); // the ejection port
      k.box(0.003, 0.009, 0.05, M.steel(), L * 0.4, 0.008, 0.0158);
      for (const x of [-1, 1]) k.box(0.004, 0.006, 0.02, B, gf + 0.006, -0.02, x * 0.0145); // ambidextrous selector
      k.box(0.004, 0.012, 0.016, B, w0 - 0.012, -0.03, 0.0145); // the bolt catch
      // the top rail: one piece with the upper, running on forward of it over the back of the handguard (o.railExt)
      const ext = o.railExt || 0;
      if (ext) k.box(0.024, 0.009, ext, rm, L, 0.0215);
      top = S.rail(k, 0.004, L + ext - 0.004, 0.026, rm);
    } else if (rcv === 'scar') {
      // The FN SCAR (the L, Mk 16), traced from a side photo of the right side (Wikimedia Commons, "FN SCAR-L noBG.png",
      // CC BY-SA 4.0) at 0.59 mm a pixel: 787 mm overall with the stock in (FN: 850 extended), its STANAG magazine 66
      // mm deep. One long aluminium upper from the hinge to the gas block, a rail along its whole top, short rails each
      // side of its front and one under it (so no handguard: the rails are the upper's); the charging handle rides a slot
      // along its side. The lower is polymer: the grip, the trigger guard and the magazine well in one moulding. The H
      // is the same gun scaled up in the magazine well (its 7.62 magazine) with a longer barrel.
      const V = scarTrace, pts = (a) => a.map(V), B = M.black(), D = M.rubber(), up = rm, lo = fm;
      k.prof(pts([[400, 188], [1042, 188], [1042, 269], [750, 269], [745, 281], [400, 281]]), 0.034, up);
      // (the magazine well: its front face straight down from a curve in under the upper, its mouth sloping up toward the
      // front, the magazine going in along it)
      k.prof(pts([[410, 281], [770, 281], [758, 288], [748, 298], [746, 346], [640, 370], [548, 370], [541, 340], [447, 330], [425, 300], [410, 295]]), 0.03, lo, 0,
        [pts([[554, 331], [636, 331], [636, 365], [554, 365]])]);
      k.box(0.005, V([0, 331])[1] - V([0, 352])[1], 0.006, B, V([584, 0])[0], (V([0, 331])[1] + V([0, 352])[1]) / 2); // the trigger
      // the rails: under the front, and a short one each side of it
      { const [f0] = V([785, 0]), [f1] = V([1040, 0]), yb = V([0, 271])[1]; k.box(0.021, 0.006, f1 - f0, B, f0, yb - 0.003); for (let i = 0; i < Math.floor((f1 - f0) / 0.0105); i++) k.box(0.023, 0.004, 0.0052, B, f0 + 0.003 + i * 0.0105, yb - 0.008); }
      for (const x of [-0.0185, 0.0185]) sideRail(k, V([882, 0])[0], V([1044, 0])[0] - V([882, 0])[0], V([0, 254])[1], x, B);
      // the lightening cuts down the front, the charging handle's slot, the ejection port (right side)
      for (const sd of [-1, 1]) for (const [a, b] of [[865, 905], [912, 952], [958, 996]]) k.box(0.0005, V([0, 206])[1] - V([0, 215])[1], V([b, 0])[0] - V([a, 0])[0], D, V([a, 0])[0], V([0, 210])[1], sd * 0.0171);
      k.box(0.0005, V([0, 206])[1] - V([0, 216])[1], V([846, 0])[0] - V([620, 0])[0], D, V([620, 0])[0], V([0, 211])[1], -0.0171);
      k.box(0.0005, V([0, 242])[1] - V([0, 259])[1], V([739, 0])[0] - V([617, 0])[0], D, V([617, 0])[0], V([0, 250])[1], 0.0171);
      k.box(0.003, 0.009, V([730, 0])[0] - V([625, 0])[0], M.steel(), V([625, 0])[0], V([0, 251])[1], 0.0172);
      // the gas block at the front of the upper, round the barrel
      k.box(0.026, V([0, 225])[1] - V([0, 263])[1], V([1119, 0])[0] - V([1040, 0])[0], B, V([1040, 0])[0], (V([0, 225])[1] + V([0, 263])[1]) / 2);
      top = S.rail(k, V([405, 0])[0], V([1040, 0])[0] - V([405, 0])[0], V([0, 188])[1], up);
    } else if (rcv === 'g36') {
      // The HK G36, traced from a side photo of the right side (Wikimedia Commons, "Gewehr G36 weiss.jpg", CC BY-SA 3.0)
      // at 0.945 mm a pixel: 999 mm overall with the stock out, HK's figure. Polymer throughout: the receiver, the
      // trigger group (the grip's seat, the trigger and the magazine well, its foot raked back) pinned up under it, the
      // stock's hinge at its back. Over it the carrying handle, a loop from the back of the receiver to over the
      // handguard, the charging handle under it; this one has a rail along the top of the handle in place of the
      // German army's built-in sights (the export guns' and the G36KV's), so a sight sits as high over the bore as theirs
      const V = g36Trace, pts = (a) => a.map(V), B = M.black(), D = M.rubber();
      k.prof(pts([[322, 95], [589, 100], [589, 165], [322, 170]]), 0.044, rm, 0, null, 0.003);
      k.prof(pts([[318, 92], [346, 92], [346, 184], [318, 184]]), 0.047, rm, 0, null, 0.003); // (the hinge block)
      k.prof(pts([[338, 150], [589, 156], [589, 163], [561, 209], [473, 232], [466, 226], [466, 186], [354, 187], [340, 178]]), 0.04, fm, 0, null, 0.003);
      // the carrying handle, and its rail
      k.prof(pts([[345, 100], [345, 60], [360, 50], [640, 50], [667, 60], [700, 90], [716, 101], [600, 101]]), 0.03, rm, 0, [pts([[470, 63], [636, 63], [680, 93], [682, 100], [470, 100]])], 0.003);
      top = S.rail(k, V([352, 0])[0], V([640, 0])[0] - V([352, 0])[0], V([0, 50])[1], rm);
      // the ejection port and the bolt in it (right side), the pins through the trigger group, the magazine catch
      k.box(0.0006, V([0, 126])[1] - V([0, 138])[1], V([561, 0])[0] - V([468, 0])[0], D, V([468, 0])[0], V([0, 132])[1], 0.0222);
      k.box(0.003, 0.008, V([553, 0])[0] - V([478, 0])[0], M.steel(), V([478, 0])[0], V([0, 133])[1], 0.0222);
      for (const [px, py] of [[352, 158], [492, 168], [575, 168]]) { const [f, y] = V([px, py]); k.cylX(0.0035, 0.0425, B, f, y); }
      k.box(0.024, 0.012, 0.008, B, V([458, 0])[0], V([0, 200])[1]);
    } else if (rcv === 'vector') {
      // The KRISS Vector Gen II, traced from a side photo of the right side (Wikimedia Commons, "Kriss-Vector-CRB.jpg",
      // CC BY-SA 4.0) at 0.87 mm a pixel: the receiver's back at x 318, the bore at y 140; that puts the front of the upper
      // 365 mm on, the SDP pistol's 406 mm overall with its barrel's stub (KRISS USA: 5.5" barrel, 658.6 mm with the stock
      // collapsed). Its Super V action drives the bolt down into the housing under the upper instead of straight back,
      // so the bore sits low, in line with the hand; the lower is the shape that makes: the grip, an enclosed trigger
      // opening raked forward, the deep V body, and in front the magazine well, a leg raked back (its front edge
      // serrated), the Glock-pattern magazine going in at its foot along the rake. An aluminium upper with a
      // full-length rail, the ejection port over the well, a rail under the front; a polymer lower.
      const V = vecTrace, pts = (a) => a.map(V), up = rm, lo = fm, B = M.black(), D = M.rubber();
      // the upper: the rail's length, the tang curving down over the hand at the back, deep at the front (the barrel
      // runs into it), stepping down under the front to the bottom rail
      k.prof(pts([[318, 92], [738, 90], [738, 168], [652, 168], [640, 160], [600, 136], [580, 128], [382, 128], [362, 141], [332, 139], [318, 128]]), 0.052, up);
      // the ejection port over the well (the bolt in it), on the right
      k.box(0.002, V([0, 95])[1] - V([0, 134])[1], V([622, 0])[0] - V([568, 0])[0], D, V([568, 0])[0], V([0, 114])[1], 0.0261);
      k.box(0.003, 0.016, V([616, 0])[0] - V([574, 0])[0], M.steel(), V([574, 0])[0], V([0, 124])[1], 0.0262); // (the bolt's flank, bright in the dark of the port)
      // the lower: over the trigger, its V body down to the foot, the magazine well's leg raked back up to the upper,
      // the trigger opening a notch behind the body that the grip closes
      k.prof(pts([[437, 128], [600, 128], [652, 166], [612, 265], [609, 272], [540, 272], [532, 265], [425, 265], [405, 252], [412, 250], [452, 250], [540, 142], [533, 134], [440, 134]]), 0.05, lo);
      // the grip, raked back, a stippled panel each side
      k.prof(pts([[378, 128], [440, 128], [437, 134], [408, 245], [404, 251], [345, 247], [341, 233], [372, 140]]), 0.032, lo);
      k.prof(pts([[368, 168], [420, 168], [406, 230], [352, 226]]), 0.0332, D, 0, null, 0.0004);
      // the trigger
      k.box(0.005, 0.024, 0.006, B, V([441, 0])[0], V([0, 147])[1]);
      // what's moulded down the sides: the two slots raked with the well, the V, the serrations up the well's front
      for (const s of [[[606, 180], [618, 182], [588, 254], [576, 251]], [[560, 210], [572, 212], [557, 262], [545, 259]]]) k.prof(pts(s), 0.0506, D, 0, null, 0.0003);
      k.prof(pts([[504, 183], [548, 183], [526, 218]]), 0.0506, D, 0, [pts([[514, 188], [538, 188], [526, 206]])], 0.0003);
      for (let i = 0; i < 12; i++) { const t = (i + 0.5) / 12, [f, y] = V([652 - 40 * t, 168 + 97 * t]); k.box(0.0508, 0.003, 0.004, D, f - 0.002, y).rotation.x = -0.38; }
      // the pins through it, the magazine release's boss behind the well, the selector over the grip (each side)
      for (const [x, y] of [[520, 108], [668, 108], [668, 150], [712, 150], [636, 157], [537, 196], [471, 262], [528, 262], [560, 248]]) { const [f, yy] = V([x, y]); k.cylX(0.0055, 0.0535, M.steel(), f, yy); }
      { const [f, y] = V([563, 158]); k.box(0.0535, 0.009, 0.009, B, f - 0.0045, y); }
      for (const x of [-0.027, 0.027]) { const [f, y] = V([382, 112]); k.cylX(0.006, 0.004, B, f, y, x); k.box(0.003, 0.005, 0.02, B, f - 0.018, y + 0.006, x * 1.03).rotation.x = 0.35; }
      // the rail under the front (a foregrip or a light), and on the right of the front a short side rail
      { const [f0] = V([655, 0]), [f1] = V([735, 0]), yb = V([0, 168])[1]; k.box(0.021, 0.004, f1 - f0, up, f0, yb - 0.002); for (let i = 0; i < Math.floor((f1 - f0) / 0.0105); i++) k.box(0.023, 0.003, 0.0052, up, f0 + 0.003 + i * 0.0105, yb - 0.0055); }
      for (const x of [0.0262, -0.0262]) sideRail(k, V([668, 0])[0], 0.05, V([0, 132])[1], x);
      // the end cap and stock adapter at the back (the tube goes in it, up level with the rail)
      k.box(0.05, V([0, 92])[1] - V([0, 128])[1], 0.01, B, -0.01, V([0, 110])[1]);
      top = S.rail(k, V([322, 0])[0], V([735, 0])[0] - V([322, 0])[0], V([0, 90])[1], up);
      // the flip-up sights folded flat at the rail's two ends when there's an optic on it (up, they're the irons below)
      if (o.optic && !['irons', 'notch'].includes(o.optic)) { k.box(0.024, 0.009, 0.026, B, V([346, 0])[0], top + 0.0045); k.box(0.022, 0.009, 0.022, B, V([690, 0])[0], top + 0.0045); }
    } else if (rcv === 'break') {
      // the action: the barrels hinge at its front (L), so it's as long as the receiver
      if (tr) { tracedParts(k, tr, VT, 'base', mats); top = VT([0, tr.topY])[1]; }
      else { k.prof([[0, -0.04], [0, 0.012], [L, 0.012], [L, -0.04]], 0.044, o.rm || M.steel()); top = 0.012; }
    }
    if (!tr && rcv !== 'vector' && rcv !== 'aug' && rcv !== 'qbz95' && rcv !== 'scar' && rcv !== 'f2') triggerGuard(k, gf, rm); // (the F2's is a loop of its own) // (the SCAR's is its lower's) // (the QBZ-95's is its shell) // (the Vector's opening is in its lower; the AUG's guard is its shell)
    if (o.extra === 'ksgTubes') for (const x of [-0.013, 0.013]) k.cyl(0.011, 0.3, M.black(), 0.1, -0.03, x);
    // a carry handle: low enough to keep clear of the line of sight (the irons sit 34 mm over the top), or,
    // like the FAL's, folded down along the left side of the receiver
    if (o.carry && o.carrySide) { const cf = o.carry, x = -((o.W || 0.045) / 2 + 0.004); k.prof([[cf - 0.06, top - 0.004], [cf - 0.05, top - 0.03], [cf + 0.05, top - 0.03], [cf + 0.06, top - 0.004]], 0.006, M.black(), x, [[[cf - 0.035, top - 0.008], [cf + 0.035, top - 0.008], [cf + 0.035, top - 0.022], [cf - 0.035, top - 0.022]]]); }
    else if (o.carry) { const cf = o.carry; k.prof([[cf - 0.06, top], [cf - 0.05, top + 0.026], [cf + 0.05, top + 0.026], [cf + 0.06, top]], 0.016, M.black(), 0, [[[cf - 0.035, top + 0.004], [cf + 0.035, top + 0.004], [cf + 0.035, top + 0.018], [cf - 0.035, top + 0.018]]]); }
    if (o.feed) { // belt feed cover: hinges at the front and lifts at the back
      const p = k.part(0.02 + L * 0.55, top + 0.02);
      k.into(p, 0.02 + L * 0.55, top + 0.02);
      k.box(0.05, 0.022, L * 0.55, rm, 0.02, top + 0.01);
      k.into(null);
      anim.cover = p;
      top += 0.022;
    }
    if (o.bolt) {
      const p = k.part(o.bolt, 0.01);
      k.into(p, o.bolt, 0.01);
      k.cylX(0.0045, 0.05, M.steel(), o.bolt, 0.01, 0.042);
      k.sphere(0.009, M.steel(), o.bolt, 0.01, 0.068);
      k.into(null);
      anim.bolt = p;
    }
    if (o.lever) {
      const p = k.part(gf + 0.03, -0.035);
      k.into(p, gf + 0.03, -0.035);
      k.ringX(0.028, 0.004, M.blued(), gf + 0.05, -0.075, 0, Math.PI * 1.2, Math.PI * 0.9);
      k.into(null);
      anim.lever = p;
    }
    if ((rcv === 'ar' && !o.cock) || o.ch) {
      k.tag('charging');
      const p = k.part();
      k.into(p);
      charging(k, o.ch, rm);
      k.into(null);
      anim.ch = p;
    }
    // the handle you rack on everything that isn't an AR or a bolt/pump/lever/break action: AK side carrier
    // handle, HK cocking tube, bullpup side handle, top knob on open-bolt SMGs, an op rod's; or the platform's own
    // (o.cock, over these: js/parts.js)
    let handle = null;
    if (rcv !== 'ar' && rcv !== 'break' && !o.bolt && !o.pump && !o.lever && !o.ch) {
      const H = o.H || 0.085;
      if (rcv === 'ak') handle = { f: L * 0.68, y: 0.002, x: 0.026, travel: 0.085, recip: true };
      else if (rcv === 'bullpup') handle = { f: L * 0.86, y: 0.018, x: -0.03, travel: 0.08 };
      else if (o.feed) handle = { f: L * 0.55, y: -0.012, x: 0.03, travel: 0.09 };
      else if (rcv === 'box' && (o.grip || 0) >= 0.05) handle = { f: L * 0.6, y: H * 0.45, x: 0, travel: 0.06, style: 'top' }; // (Uzi, MAC)
      else if (rcv === 'box') handle = { f: L + 0.025, y: 0.024, x: -0.03, travel: 0.05, style: 'tube' }; // (HK, front left)
      else handle = { f: L * 0.62, y: 0.016, x: 0.024, travel: 0.07, recip: true }; // (an op rod or a bolt handle: Garand, M14, PPSh, Benelli)
    }
    if (o.cock) handle = Object.assign(handle || {}, o.cock);
    if (handle) anim.handle = cockHandle(k, handle);

    k.tag('grip');
    if (tr) tracedParts(k, tr, VT, 'grip', mats);
    else if (o.gripT !== 'none' && rcv !== 'qbz95' && rcv !== 'f2' && !((rcv === 'vector' || rcv === 'aug') && (o.gripT || 'ar') === 'ar')) grip(k, gf, o.gm || fm, o.gripT || (rcv === 'ak' ? 'wood' : 'ar')); // (the Vector's own is part of its lower)
    k.tag('stock');
    if (rcv === 'vector' && o.stock) { const sp = k.part(0, vecTrace([0, 110])[1]); k.into(sp); stock(k, o.stock, o.sm || fm, false); k.into(null); } // (its tube level with the top of the receiver: the bore's below the shoulder)
    else if (tr && o.stock === 'wood' && tr.parts.some((p) => p.on === 'stock')) { if (!buildingVM || o.gripT === 'none') tracedParts(k, tr, VT, 'stock', mats); } // (the traced stock, while the factory one's fitted)
    else if (!bull && o.stock) stock(k, o.stock, o.sm || fm, o.gripT === 'none');
    k.tag('mag');
    let magAt = null;
    if (o.mag && o.mag.t !== 'internal') {
      const mo = Object.assign({ f: bull ? L * 0.22 : gf + 0.078, y: rcv === 'ak' ? -0.046 : rcv === 'box' ? -(o.H || 0.085) * 0.55 : -0.042 }, o.mag);
      if (rcv !== 'ar') mo.well = null; // (a magazine's well block is an AR lower's; any other gun's well is its own)
      if (o.magFit && mo.len) { mo.len *= o.magFit.len; mo.c = (mo.c || 0) * o.magFit.c; mo.d = o.magFit.d; } // (a shared magazine drawn to this gun's: the F2's short near-straight box)
      const p = k.part(mo.f, mo.y);
      k.into(p, mo.f, mo.y);
      const chk = mag(k, mo);
      if (chk) p.userData.chk = chk;
      k.into(null);
      anim.mag = p; magAt = [mo.f, mo.y];
    }

    // barrel, handguard, muzzle device
    const b = o.barrel || {}, bl = b.len || 0.37, br = b.r || 0.0095, by = b.y || 0;
    let front;
    k.tag('barrel');
    const hy = tr && tr.pin ? VT(tr.pin)[1] : -0.035, brk = rcv === 'break' ? k.part(L, hy) : null;
    if (brk) { k.into(brk, L, hy); anim.brk = brk; if (tr) tracedParts(k, tr, VT, 'brk', mats); } // (the Thor's breech sleeve and its rail tip up with the barrel)
    if (o.integral) {
      k.cyl(o.integral.r, o.integral.len, M.black(), L, by);
      for (let i = 0; i < 3; i++) k.ringZ(o.integral.r, 0.0012, M.rubber(), L + 0.03 + i * o.integral.len * 0.3, by);
      front = L + o.integral.len;
    } else {
      const bIn = o.bIn || 0; // (how much of it's inside the receiver: a Vector's is mostly)
      if (o.barrels) for (const x of o.barrels) k.cyl(br, bl, b.m || M.blued(), L, by, x);
      else k.cyl(br, bl, b.m || M.blued(), L - bIn, by, 0, br * (b.taper || 1), 14);
      if (o.barrels && tr && tr.rib) { k.box(0.008, 0.0102, bl, b.m || M.blued(), L, by + 0.0091); k.box(0.008, 0.008, bl, b.m || M.blued(), L, by - 0.008); } // (the ribs filling the valleys between the barrels, over and under)
      if (rcv === 'f2') { // the collar and the grenade spigot's ridges (as much of them as the barrel has)
        k.cyl(0.0105, Math.min(0.022, bl), M.black(), L + 0.003, by, 0, br);
        for (let i = 0; i < 10 && 0.022 + i * 0.0049 < bl - 0.006; i++) k.ringZ(br + 0.0004, 0.0014, M.black(), L + 0.022 + i * 0.0049, by);
      }
      front = L - bIn + bl;
    }
    let hgLen = 0;
    if (o.hg) {
      k.tag('handguard');
      const hg = Object.assign({}, o.hg, o.barrels ? { under: true } : {});
      if (hg.t !== 'stockfore') hg.len = Math.max(0.06, Math.min(hg.len, (o.integral ? o.integral.len : bl - (o.bIn || 0)) - 0.015));
      hgLen = hg.len;
      if (hg.t === 'sig') hg.ext = o.railExt || 0;
      if (hg.t === 'g36') hg.bl = bl;
      if (tr && tr.parts.some((p) => p.on === 'fore') && hg.t === 'wood') { const sc = (hg.len - 0.03) / (tr.foreLen - 0.03), VF = (p) => { const [f, y] = VT(p); return [f > L + 0.03 ? L + 0.03 + (f - L - 0.03) * sc : f, y]; }; tracedParts(k, tr, VF, 'fore', Object.assign({}, mats, { fore: hg.m || fm })); } // (the traced forend, stretched or shortened ahead of the action to the wooden hand guard's length)
      else handguard(k, hg, L, fm, rm);
    }
    if (o.tube) { k.tag('tube'); k.cyl(0.0105, o.tube, M.blued(), L, -0.026); k.cyl(0.012, 0.012, M.blued(), L + o.tube - 0.012, -0.026); }
    if (o.saddle) { // shells on the left of the receiver (a side saddle), or a loader's caddy of 2 or 4
      k.tag('loader');
      const n = o.saddle === 'quad' ? 4 : o.saddle === 'twin' ? 2 : 6, x = -(o.W || 0.036) / 2 - 0.012, f0 = L * 0.5 - n * 0.0125;
      k.box(0.004, 0.03, n * 0.025 + 0.006, M.black(), f0 - 0.003, -0.012, x + 0.008);
      for (let i = 0; i < n; i++) { k.cylY(0.0095, 0.05, M.redInsert(), f0 + 0.0125 + i * 0.025, -0.008, x); k.cylY(0.0098, 0.012, M.brass(), f0 + 0.0125 + i * 0.025, -0.038, x); }
    }
    if (!o.integral && o.muzzle) { k.tag('muzzle'); front += muzzle(k, o.muzzle, front, br, by); }
    if (brk) k.into(null);
    if (o.pump) {
      k.tag('pump');
      const p = k.part();
      k.into(p);
      const pm = o.pump.m || fm;
      k.cyl(0.021, o.pump.len, pm, L + o.pump.f, -0.025, 0, 0.021, 14);
      for (let i = 0; i < 6; i++) k.ringZ(0.021, 0.0016, M.rubber(), L + o.pump.f + 0.02 + i * (o.pump.len - 0.04) / 5, -0.025);
      if (o.pump.rail) S.rail(k, L + o.pump.f + 0.02, o.pump.len - 0.04, -0.012, M.black());
      if (o.tac) { k.tag('tac'); tactical(k, o.tac, L + o.pump.f + o.pump.len - 0.01, -0.025, 0.022); }
      if (o.tacL) { k.tag('tacL'); tactical(k, o.tacL, L + o.pump.f + o.pump.len - 0.01, -0.025, -0.022, -1); }
      k.into(null);
      anim.pump = p;
    }
    k.tag('base');
    if (o.bipod) for (const x of [-0.012, 0.012]) { k.cyl(0.004, 0.2, M.black(), L + o.bipod - 0.2, -0.032, x); k.box(0.012, 0.008, 0.01, M.rubber(), L + o.bipod - 0.21, -0.032, x); }
    if (o.vfg != null) k.prof([[L + o.vfg - 0.012, -0.022], [L + o.vfg + 0.016, -0.022], [L + o.vfg + 0.014, -0.11], [L + o.vfg - 0.01, -0.11]], 0.026, o.vfgM || fm);
    let fgF = null;
    if (o.fg && !hgLen && o.fgAt != null) { k.tag('fg'); fgF = o.fgAt; foregrip(k, o.fg, fgF, fm); } // (a rail under the receiver itself: the SCAR's)
    else if (o.fg && hgLen) { k.tag('fg'); fgF = rcv === 'vector' && o.hg && o.hg.t === 'vector' ? L - 0.05 : L + Math.min(hgLen * 0.35, 0.09, hgLen - 0.04); foregrip(k, o.fg, fgF, fm); } // (the Vector's: on the rail under the front of the upper) // (near the rail's back: the support arm bent, the gun out in front)
    // a clamp-on rail mount: a collar round the barrel (or the can), in front of any jacket, a short rail on one side or both
    let tacAt = o.tacAt ? Object.assign({}, o.tacAt) : rcv === 'vector' && o.hg && o.hg.t === 'vector' ? { f: L - 0.012, y: vecTrace([0, 132])[1], x: 0.027 } // (on the short rails each side of the front)
      : hgLen && !o.pump ? { f: L + hgLen - 0.01, y: 0, x: 0.024 } : o.siderails ? (rcv === 'box' ? { f: L - 0.012, y: -0.004, x: (o.W || 0.045) / 2 + 0.0075 } : { f: L - 0.02, y: -0.006, x: 0.029 }) : null;
    if (o.railmount) {
      k.tag('railmount');
      if (brk) k.into(brk, L, hy); // (it's clamped to the barrel: it tips open with it)
      const run = o.integral ? o.integral.len : bl, R = (o.integral ? o.integral.r : br * (b.taper || 1)) + 0.002;
      const f0 = L + Math.max(0.005, Math.min(hgLen ? hgLen + 0.012 : 0.03, run - 0.05));
      k.cyl(R + 0.004, 0.032, M.black(), f0, by, 0, R + 0.004, 16);
      for (const sd of o.railmount === 'twin' ? [1, -1] : [1]) { k.box(0.006, 0.012, 0.03, M.black(), f0 + 0.001, by, sd * (R + 0.006)); sideRail(k, f0 - 0.004, 0.04, by, sd * (R + 0.011)); }
      tacAt = { f: f0 + 0.045, y: by, x: R + 0.012 };
    }
    if (tacAt) {
      if (o.tac) { k.tag('tac'); tactical(k, o.tac, tacAt.f, tacAt.y, tacAt.x); }
      if (o.tacL) { k.tag('tacL'); tactical(k, o.tacL, tacAt.f, tacAt.y, -tacAt.x, -1); }
    }
    if (brk) k.into(null);

    // sights
    k.tag('optic');
    const ofs = o.optF != null ? o.optF : bull ? L * 0.65 : L * 0.5;
    // (a break-action's bead and rib are on its barrels, so they tip open with them)
    const onBarrels = brk && ((o.optic || 'irons') === 'bead' || tr);
    if (onBarrels) k.into(brk, L, hy);
    let sight;
    if (rcv === 'aug') {
      const V = augTrace;
      if (!o.optic || o.optic === 'augscope') {
        // the integral optic in its carrying handle: a strut down to the lock, a swept leg back to the receiver, the
        // tube between, its turret on top (its magnification is the optic's: js/parts.js)
        k.prof([V([575, 262]), V([612, 262]), V([545, 320]), V([500, 322])], 0.022, rm);
        k.prof([V([785, 262]), V([815, 262]), V([772, 290]), V([754, 330]), V([728, 330]), V([745, 288])], 0.02, rm);
        const [f0, sy] = V([925, 240]), [f1] = V([565, 0]), r = 0.0137;
        k.cyl(r, f1 - f0, rm, f0, sy);
        k.cyl(r + 0.0022, 0.012, rm, f0, sy); k.cyl(r + 0.0028, 0.013, rm, f1 - 0.013, sy);
        { const [tf, ty] = V([590, 222]); k.cylY(0.007, 0.012, rm, tf, ty); }
        k.cyl(r - 0.002, 0.002, M.lens(), f1 + 0.0002, sy);
        k.cyl(r - 0.002, 0.001, M.lens(), f0 - 0.0012, sy);
        k.pip = { f: f0 - 0.0015, y: sy, r: r - 0.002 };
        sight = { sy, fSight: f0, relief: 0.07 };
      } else {
        // The A3 M2's: no handle and no hump, a flat-top receiver with its Picatinny rail the whole length of it, from the
        // barrel lock back over the front of the shell (25 slots, about 26 cm), on a low base moulded into the top
        const [ra] = V([900, 0]), [rb] = V([440, 0]);
        k.box(0.03, V([0, 322])[1] - top, rb - ra, rm, ra, (top + V([0, 322])[1]) / 2);
        top = S.rail(k, ra, rb - ra, V([0, 322])[1], rm);
        sight = ['irons', 'notch'].includes(o.optic) ? S.irons(k, V([905, 0])[0], V([482, 0])[0], top + 0.034, top, top, 'ar') : sightOf(k, o, top, L, o.integral ? o.integral.len : bl, br, front, ofs);
      }
    } else if (rcv === 'qbz95') {
      // its own sights stay whatever's fitted: the rear aperture standing in the handle's opening, the front post
      // between its ears
      const V = qbzTrace, sy = V([0, 150])[1], [fR] = V([845, 0]), [fF] = V([1127, 0]), B = M.black();
      k.box(0.012, sy - 0.0055 - top, 0.01, B, fR - 0.005, (top + sy - 0.0055) / 2);
      k.annulus(0.0022, 0.0052, 0.003, B, fR - 0.0015, sy);
      k.box(0.003, sy - V([0, 166])[1], 0.003, B, fF - 0.0015, (sy + V([0, 166])[1]) / 2);
      for (const x of [-0.012, 0.012]) k.box(0.004, V([0, 95])[1] - V([0, 166])[1], V([1148, 0])[0] - V([1106, 0])[0], fm, V([1106, 0])[0], (V([0, 95])[1] + V([0, 166])[1]) / 2, x);
      k.box(0.028, V([0, 95])[1] - V([0, 108])[1], V([1148, 0])[0] - V([1106, 0])[0], fm, V([1106, 0])[0], (V([0, 95])[1] + V([0, 108])[1]) / 2);
      if (!o.optic || ['irons', 'notch', 'qbzirons'].includes(o.optic)) sight = { sy, fSight: fR - 0.0015, relief: 0.12 };
      else {
        // anything else sits on a rail clamped along the top of the handle: very high over the bore, as on the real one
        const [ra] = V([598, 0]), [rb] = V([862, 0]), hy = V([0, 97])[1];
        sight = sightOf(k, o, S.rail(k, ra, rb - ra, hy, rm), L, bl, br, front, ofs);
      }
    } else if (rcv === 'f2') {
      // its own sights stay whatever's fitted: the aperture in the handle's rear leg, the post in its front, the line between
      // them down the tunnel; anything else goes on a rail along the top of the handle, as high over the bore as the real handle
      const V = f2Trace, own = S.irons(k, 0.3, 0.6, V([0, 798])[1], top, top, 'ar');
      if (!o.optic || ['irons', 'notch'].includes(o.optic)) sight = Object.assign(own, { relief: 0.14 }); // (the eye well back from the handle's rear leg)
      else { const [ra] = V([1050, 0]), [rb] = V([1783, 0]); sight = sightOf(k, o, S.rail(k, ra, rb - ra, V([0, 692])[1], rm), L, bl, br, front, ofs); }
    } else if (rcv === 'g36' && ['irons', 'notch', undefined].includes(o.optic)) sight = S.irons(k, g36Trace([362, 0])[0], g36Trace([632, 0])[0], top + 0.016, top, top, 'ar'); // (low ones at the ends of the handle's rail)
    else if (o.ironsAt && ['irons', 'notch', undefined].includes(o.optic)) sight = S.irons(k, o.ironsAt[0], o.ironsAt[1], top + 0.034, top, o.ironsAt[2] != null ? o.ironsAt[2] : top, 'ar'); // (the upper's own flip-ups: the SCAR's, the front on its gas block)
    else sight = rcv === 'vector' && ['irons', 'notch', undefined].includes(o.optic) ? S.irons(k, vecTrace([358, 0])[0], vecTrace([700, 0])[0], top + 0.034, top, top, 'ar') // (the flip-ups at the rail's two ends, raised)
      : tr && o.optic === 'notch' ? S.pistolSights(k, tr.sightF, (rcv === 'break' ? front : L) - 0.012, top + (tr.sh || 0.0075), rcv === 'break' ? br : top, false, top, tr.sw)
      : sightOf(k, o, top, L, o.integral ? o.integral.len : bl, br, front, ofs);
    if (onBarrels) k.into(null);
    if (o.magnifier && k.reflex) { k.tag('magnifier'); sight = S.magnifier(k, sight, top, o.magnifier, anim); }
    k.tag('base');
    const support = o.support != null ? o.support : rcv === 'vector' && fgF == null ? L - 0.045 : o.pump ? L + o.pump.f + o.pump.len * 0.5 : fgF != null && o.fg !== 'bipod' ? fgF : o.vfg != null ? L + o.vfg : bull ? L + 0.07 : L + (hgLen ? Math.min(hgLen * 0.15, 0.04) : 0.03); // (a plain handguard: held near its back, the arm bent, not out at full stretch)
    // where the hands go for reloads and racking (gun space: [forward, up, right])
    const port = o.bolt ? [o.bolt - 0.02, top - 0.004, 0] : o.lever ? [L * 0.55, 0.0, 0.02] : o.pump || o.tube ? [L * 0.62, -0.042, 0] : rcv === 'break' ? [L, 0.0, 0] : [L * 0.5, top, 0];
    // where a chamber check shows the round: through the ejection port on the right (js/vmanim.js), or for a
    // break-action, the shell heads in the breech
    const hw = { ar: 0.0178, ak: 0.022, box: (o.W || 0.045) / 2, round: 0.018, bullpup: 0.023, vector: 0.026, aug: 0.029, f2: 0.032, qbz95: 0.027, qbz192: 0.0172, scar: 0.0172, g36: 0.022, mcx: 0.0156, mpx: 0.0156 }[rcv] || 0.018;
    const chamberAt = tr && tr.chamber ? { side: 'breech', heads: [[0, by - hy]], z: L - tr.chamber, r: 0.0064 } // (the Thor's: at the back of its sleeve)
      : rcv === 'break' ? { side: 'breech', heads: (o.barrels || [0]).map((x) => [x, by - hy]), z: -0.0005, r: br } // (in the barrels' hinge frame)
      : o.bolt ? { side: 'top', f: o.bolt - 0.05, y: rcv === 'round' ? top - 0.0015 : top, x: rcv === 'round' ? 0.006 : 0.011, w: 0.024 } // (a bolt gun's port is its open top, to the right of a scope's line, above the stock)
      : { side: 'right', f: o.lever ? L * 0.55 : magAt ? magAt[0] + 0.005 : !o.pump && handle && handle.x > 0 ? handle.f + 0.026 : o.pump || o.tube ? L * 0.55 : L * 0.5, y: o.chY != null ? o.chY : by, x: hw };
    return {
      sy: sight.sy, fSight: sight.fSight, relief: sight.relief,
      muzzles: [[front, by, 0]],
      grip: [gf + 0.005, -0.075, 0], support: [support, o.pump ? -0.03 : -0.028, 0],
      anim, magAt, handle, port, chamberAt, ch: (rcv === 'ar' && !o.cock) || o.ch ? [-0.006, 0.026, 0] : null, bolt: o.bolt ? [o.bolt, 0.01, 0.068] : null,
      cheek: o.cheek != null ? o.cheek : null, // (a bullpup: where your eye is, whatever's on the rail: js/gunmodels.js viewmodel)
    };
  }

  // A pistol traced from its reference photo (o.look: js/guntraces.js). Each trace's numbers are pixels of the photo; its
  // V() turns one into gun space ([forward, up], metres), the bore at y = 0.009 and the back of the slide at f = 0.
  const tracer = (t) => ([x, y]) => [t.dir * (x - t.x0) * t.mm * 0.001, (t.y0 - y) * t.mm * 0.001 + (t.by != null ? t.by : 0.009)];
  const along = (pts, f) => { // the height of an edge ([[f, y], ...], rear to front) at f
    if (f <= pts[0][0]) return pts[0][1];
    for (let i = 1; i < pts.length; i++) if (f <= pts[i][0]) { const [a, b] = [pts[i - 1], pts[i]]; return b[0] > a[0] ? a[1] + (b[1] - a[1]) * (f - a[0]) / (b[0] - a[0]) : b[1]; }
    return pts[pts.length - 1][1];
  };
  // The slide: the section swept from its traced top and bottom edges, its top corners chamfered or rounded (t.c: how far
  // in, t.seg: how many facets), the ejection port cut out of the right of it from xp over. A long slide stretches
  // its front half. Returns its edges, for what sits on them.
  function tracedSlide(k, t, V, len, w, m) {
    const hi = t.top.map(V), lo = t.bot.map(V), L0 = t.nose ? V([t.nose, 0])[0] : hi[hi.length - 1][0], reach = (f) => (f <= L0 / 2 ? f : L0 / 2 + (f - L0 / 2) * (len - L0 / 2) / (L0 / 2));
    for (const e of [hi, lo]) for (const p of e) p[0] = reach(p[0]);
    const [p1, p0] = t.port.map((x) => V([x, 0])[0]).sort((a, b) => b - a), yP = t.portY != null ? V([0, t.portY])[1] : 0.016, xp = -0.0015, seg = t.seg || 1;
    const sec = (f, cut) => {
      const y1 = along(hi, f), y0 = along(lo, f), hw = w / 2, c = Math.min(t.c || 0.002, hw - 0.002, Math.max(0, (y1 - y0) * 0.45));
      const arc = (sx) => Array.from({ length: seg + 1 }, (_, i) => { const a = (i / seg) * Math.PI / 2; return [sx * (hw - c + c * Math.cos(a)), y1 - c + c * Math.sin(a)]; });
      const R = arc(1), L = arc(-1).reverse();
      if (cut) { const n = R.length; R.forEach((p, i) => { const u = n > 1 ? i / (n - 1) : 0; p[0] = hw + (xp - hw) * u; p[1] = yP; }); }
      return [[-hw, y0], [hw, y0], ...R, [xp, y1], ...L];
    };
    const fs = [...new Set([...hi, ...lo].map((p) => p[0]))].sort((a, b) => a - b);
    for (const f of [p0, p1]) if (!fs.includes(f)) fs.push(f);
    fs.sort((a, b) => a - b);
    const st = [];
    for (const f of fs) {
      if (f === p0) st.push([f, sec(f, false)], [f, sec(f, true)]);
      else if (f === p1) st.push([f, sec(f, true)], [f, sec(f, false)]);
      else st.push([f, sec(f, f > p0 && f < p1)]);
    }
    k.loft(st, m);
    return { hi, lo, p0, p1, yP, reach };
  }
  // the rest of a trace: outlines ({ on: which part they're tagged as, pts, holes, w, x, m, b: bevel, two: both sides at
  // +x and -x }), m a material's name, or the gun's own frame, grip or slide
  function tracedParts(k, t, V, on, mats) {
    for (const p of t.parts || []) {
      if ((p.on || 'base') !== on) continue;
      if (p.strips) { const list = p.strips.map((q) => q.map(V)); for (const x of p.two ? [p.x, -p.x] : [p.x || 0]) k.profs(list, p.w, M[p.m](), x); continue; }
      const mat = mats[p.m] || (M[p.m] ? M[p.m]() : mats.frame), pts = p.pts.map(V), holes = p.holes && p.holes.map((h) => h.map(V));
      for (const x of p.two ? [p.x, -p.x] : [p.x || 0]) k.prof(pts, p.w, mat, x, holes, p.b != null ? p.b : 0.001);
    }
  }
  // serrations: { from, to: px along, n, y: [top, bottom] px, rake: how far the bottom's offset, px } cut in each side
  function tracedSer(k, list, V, w, m) {
    for (const s of list || []) {
      const strips = [];
      for (let i = 0; i < s.n; i++) {
        const x = s.from + (s.to - s.from) * (i / (s.n - 1)), d = (s.to - s.from) / (s.n - 1) * (s.fill || 0.5), r = s.rake || 0;
        strips.push([[x, s.y[0]], [x + d, s.y[0]], [x + d + r, s.y[1]], [x + r, s.y[1]]].map(V));
      }
      for (const x of [-1, 1]) k.profs(strips, 0.0006, m, x * (w / 2 - 0.0002));
    }
  }

  function pistol(k, o) {
    const sl = o.slide || {}, tr = o.look && G.GunTraces[o.look], V = tr ? tracer(tr) : null, len = sl.len || 0.19, w = sl.w || 0.026, sm = sl.sm || M.black(), fm = o.fm || M.polymer(), gm = o.gm || fm;
    const anim = {}, mats = { frame: fm, grip: gm, slide: sm };
    k.tag('slide');
    const slide = k.part();
    k.into(slide);
    // the slide, with its ejection port: a cut out of the right half of its top, over the chamber (forward of where
    // a pistol dot sits), so a press-check shows the round in the barrel
    const ts = tr ? tracedSlide(k, tr, V, len, w, sm) : null, pc = len * 0.44, p0 = ts ? ts.p0 : pc - 0.016, p1 = ts ? ts.p1 : pc + 0.016, sy = ts ? ts.yP : 0.016, topAt = (f) => (ts ? along(ts.hi, f) : 0.026);
    if (!ts) k.prof([[0, 0.002], [0, sy], [len, sy], [len, 0.002]], w, sm, 0, null, 0.001);
    const nose = 0.012, noseY = 0.02;
    if (ts) { tracedSer(k, tr.ser, V, w, M[tr.serM] ? M[tr.serM]() : M.rubber()); tracedParts(k, tr, V, 'slide', mats); }
    else {
      k.prof([[0, sy], [0, 0.026], [len - nose, 0.026], [len, noseY], [len, sy]], w / 2, sm, -w / 4, null, 0.001);
      k.prof([[0, sy], [0, 0.026], [p0, 0.026], [p0, sy]], w / 2, sm, w / 4, null, 0.001);
      k.prof([[p1, sy], [p1, 0.026], [len - nose, 0.026], [len, noseY], [len, sy]], w / 2, sm, w / 4, null, 0.001);
    }
    if (!ts) for (let i = 0; i < 5; i++) k.box(w + 0.001, 0.016, 0.0025, M.rubber(), 0.01 + i * 0.006, 0.014);
    if (sl.vent) for (let i = 0; i < 4; i++) { const vf = len * 0.45 + i * 0.022; if (vf + 0.012 > p0 - 0.002 && vf < p1 + 0.002) continue; k.box(w + 0.002, 0.006, 0.012, M.rubber(), vf, topAt(vf) - 0.002); } // (none over the port)
    k.into(null);
    anim.slide = slide;
    k.box(w / 2 - 0.002, 0.0015, p1 - p0, M.rubber(), p0, sy + 0.0008, w / 4); // (the barrel hood under it: the barrel's, so it stays put)
    let front = len;
    if (sl.comp) { const fb = len - 0.014, y1 = tr && tr.noseTop ? V([0, tr.noseTop])[1] : topAt(fb), y0 = ts ? along(ts.lo, fb) : 0.001; k.box(w, y1 - y0, 0.03, sm, len, (y1 + y0) / 2); front += 0.03; }
    k.tag('base');
    const ch = o.chassis ? pistolChassis(k, o, len, w, p0, p1) : null;
    if (ch) { /* (the frame's inside it) */ } else if (tr) tracedParts(k, tr, V, 'base', mats);
    else {
      k.prof([[0.004, 0.002], [len * 0.92, 0.002], [len * 0.92, -0.014], [0.07, -0.016], [0.05, -0.012], [0.004, -0.012]], w - 0.002, fm);
      k.ringX(0.016, 0.0025, fm, 0.055, -0.016, 0, Math.PI, Math.PI);
    }
    if (!tr) k.box(0.004, 0.016, 0.005, M.black(), 0.05, -0.016);
    if (o.hammer && !tr) k.box(0.008, 0.014, 0.008, M.blued(), -0.008, 0.022);
    k.tag('grip');
    if (ch) { /* (its grip is the chassis's) */ } else if (tr) tracedParts(k, tr, V, 'grip', mats);
    else k.prof([[-0.004, -0.004], [0.04, -0.004], [0.028, -0.115], [-0.018, -0.108]], 0.03, gm);
    if (o.stock && !ch) { // a shoulder stock clipped to the back of the frame
      k.tag('stock');
      // (an SMG stock mount on the lug, js/parts.js stk.pistol.2: a block, and the SMG stock on its back if there is one)
      const mount = o.stock === 'smgmount' || (o.slotOf && o.slotOf.stock === 'stk.pistol.2');
      if (mount) { const [lf, ly] = tr ? V(tr.lug) : [-0.006, -0.03]; k.box(0.024, 0.032, 0.03, M.black(), lf - 0.028, ly + 0.004); k.box(0.016, 0.012, 0.006, M.steel(), lf - 0.034, ly + 0.012); }
      if (o.stock !== 'smgmount') {
        const [lf, ly] = tr ? V(tr.lug) : [-0.006, -0.03], sp = mount ? k.part(lf - 0.034, ly + 0.012) : k.part(lf, ly);
        k.into(sp);
        stock(k, o.stock, o.sm || M.black(), true); // (true: shown in first person too: a brace rides along your forearm, in view)
        k.into(null);
      }
    }
    k.tag('mag');
    const mg = o.mag || {};
    // (traced: its top back corner, its bottom back corner, how deep it is: tr.mag)
    // (in a chassis it's in the chassis's own grip: as the plain gun's)
    const tm = tr && !ch ? tr.mag : null, [mf, my] = tm ? V(tm.top) : [0, -0.006], [bf, by] = tm ? V(tm.bot) : [-0.012, -0.102], mD = tm ? tm.D : 0.03, mW = tm ? tm.w : 0.02;
    const magAt = [mf + 0.012, my + 0.002], magP = k.part(magAt[0], magAt[1]), mm = mg.m || M.black(); // (the magazine's own: a translucent one shows its rounds)
    k.into(magP, magAt[0], magAt[1]);
    const ext = mg.t === 'drum' ? 2 : (mg.len || 0.15) > 0.16 ? 1 : (mg.len || 0.15) < 0.12 ? -1 : o.ext ? 1 : 0;
    const out = ext === 1 ? G.U.clamp((mg.len || 0.15) - 0.13, 0.03, 0.14) || 0.05 : 0; // (how far a long one stands out of the grip)
    // the body: in the grip, raked back with it (K: its back edge, 12 mm back over the 96 mm down), and a long one
    // carrying straight on out of it as long as it really is (a 33-rounder ~11 cm more), one piece, its floorplate on the end
    const K = (mf - bf) / (my - by), L = (tm ? my - by : 0.096) + out, tilt = -Math.atan(K);
    k.prof([[mf, my], [mf + mD, my], [bf + mD - K * out + (tm ? 0 : 0.002), by - out - (tm ? 0 : 0.006)], [bf - K * out, by - out]], mW, mm);
    if (tm && tm.foot) { const foot = tm.foot.map(V).map(([f, y]) => [f - K * out, y - out]); k.prof(foot, tm.fw || mW + 0.005, M[tm.fm] ? M[tm.fm]() : M.black(), 0, null, 0.001); }
    else if (ext === 1) k.box(0.024, 0.008, 0.035, M.black(), bf - 0.002 - K * out, by - 0.007 - out).rotation.x = tilt; // (f runs along -z: tilting the bottom back is a negative turn)
    if (ext === 2) { k.box(0.022, 0.03, 0.03, M.black(), bf + 0.012, by - 0.016); k.cyl(0.045, 0.034, M.black(), bf + 0.01, by - 0.058, 0, 0.045, 20); } // (a drum, face toward the shooter)
    else if (ext === 0 && !tm) k.box(0.026, 0.008, 0.032, M.black(), -0.006, -0.112);
    // (what the check shows, down its whole length along that back edge: witness holes, or a clear one's rounds)
    // (rear(t): the edge level with what's at depth t, as magCheck places it: 12 mm down, then over all but 26 mm of it)
    magP.userData.chk = magCheck(k, (t) => mf - K * (0.012 + t * (L - 0.026)), my, L, mW, mD, !!mm.transparent, mg.rnd);
    k.into(null);
    anim.mag = magP;
    k.tag('barrel');
    if (tr) tracedParts(k, tr, ([x, y]) => { const [f, u] = V([x, y]); return [ts.reach(f), u]; }, 'barrel', mats); // (the Desert Eagle's fixed barrel block: a long slide's stretches it too)
    k.cyl(tr ? tr.bore : 0.0065, 0.01, M.rubber(), len - 0.009, 0.009);
    if (tr) k.ringZ(tr.bore + 0.0008, 0.0008, M.gunmetal(), len + 0.0004, 0.009); // (the barrel's lip, in the end of the slide)
    if (tr && tr.tube) k.cyl(tr.tube.r, len + tr.tube.out - tr.tube.from, M[tr.tube.m] ? M[tr.tube.m]() : M.gunmetal(), tr.tube.from, 0.009, 0, tr.tube.r, 20); // (an open-topped slide's: it shows, and it stays put)
    if (o.match && !sl.comp) { k.cyl(0.0068, 0.012, M.steel(), len, 0.009); front += 0.012; }
    if (o.thread && !sl.comp) { k.cyl(0.0058, 0.012, M.steel(), front, 0.009); front += 0.012; }
    if (o.muzzle && o.thread) { k.tag('muzzle'); front += muzzle(k, o.muzzle, front, 0.0065, 0.009); }
    let sight;
    if (ch) sight = ch.sights(anim);
    else {
      k.tag('tac');
      const [tf, ty] = tr ? V(tr.tac).map((n, i) => (i ? n - 0.0115 : n)) : [len * 0.86, -0.026]; // (traced: its top, r 11 mm, on the frame's underside)
      tactical(k, o.tac, tf, ty, -0.01); // (hung under the dust cover's rail)
      k.tag('optic');
      if (o.optic === 'minidot') sight = S.minidot(k, len * 0.32, topAt(len * 0.32), o);
      else {
        const fR = tr ? V([tr.sights[0], 0])[0] : 0.012, fF = tr ? ts.reach(V([tr.sights[1], 0])[0]) : len - 0.01, base = tr && tr.frontY ? V([0, tr.frontY])[1] : topAt(fF), rb = topAt(fR), sy1 = Math.max(base, rb) + (tr && tr.sh || 0.0075);
        k.into(slide); sight = S.pistolSights(k, fR, tr && tr.frontY ? null : fF, sy1, base, o.optic === 'night', rb, tr && tr.sw); k.into(null);
        if (tr && tr.frontY) S.pistolFront(k, fF, sy1, base, o.optic === 'night'); // (on the fixed barrel: the slide runs back under it)
      }
    }
    k.tag('base');
    const hold = tr && !ch ? V(tr.hold) : [0.012, -0.06];
    return {
      sy: sight.sy, fSight: sight.fSight, relief: sight.relief || (o.optic === 'minidot' ? 0.3 : 0.36),
      muzzles: [[Math.max(front, ch ? ch.front : 0), 0.009, 0]], grip: [hold[0], hold[1], 0], support: ch ? ch.support : [hold[0] + 0.018, hold[1] - 0.005, -0.022], anim, pistol: true,
      magAt, slide: [len * 0.2, topAt(len * 0.2) - 0.006, 0], chamberAt: { side: 'port', f: p0 - 0.006, y: sy + 0.0015, x: w / 4 }, // (the round's back end, behind the hood, and its top, just under the hood's)
    };
  }

  // A pistol in a carbine chassis (o.chassis, js/parts.js gr.pistol.chassis): a polymer shell round the frame and up both
  // sides of the slide (a window on the right over the ejection port), a shroud on past the muzzle, a full-length rail
  // over the top; a grip round the magazine well and a big trigger guard; a rail each side and one under the shroud; an
  // SMG stock mount at the back. The slide still runs inside it. Returns its sights (drawn after the rest: sights(anim)),
  // where the other hand goes, and how far the shroud runs.
  function pistolChassis(k, o, len, w, p0, p1) {
    const C = M.polymer(), B = M.black(), W = w + 0.014, f0 = -0.05, fN = len + 0.045, rl = fN - f0;
    k.tag('grip');
    // the lower: under the frame from the stock mount to the shroud's front, its belly down to the bottom rail
    k.prof([[f0, 0.004], [fN, 0.004], [fN, -0.016], [len * 0.5, -0.016], [0.082, -0.022], [0.07, -0.02], [f0 + 0.012, -0.018], [f0, -0.01]], W, C, 0, null, 0.002);
    // its sides up past the slide to the rail: the left whole, the right open over the port (and a little behind it)
    k.box(0.0035, 0.036, rl, C, f0, 0.021, -(W / 2 - 0.00175));
    k.box(0.0035, 0.036, p0 - 0.012 - f0, C, f0, 0.021, W / 2 - 0.00175);
    k.box(0.0035, 0.036, fN - (p1 + 0.01), C, p1 + 0.01, 0.021, W / 2 - 0.00175);
    k.box(0.0035, 0.008, p1 + 0.01 - (p0 - 0.012), C, p0 - 0.012, 0.0, W / 2 - 0.00175); // (the window's sill)
    // the top, the rail on it the whole length
    k.box(W, 0.004, rl, C, f0, 0.041);
    const top = S.rail(k, f0 + 0.004, rl - 0.008, 0.043, B);
    // the grip round the magazine well (raked as the pistol's), the trigger guard
    k.prof([[-0.008, -0.016], [0.044, -0.016], [0.032, -0.118], [-0.022, -0.112]], 0.034, C, 0, null, 0.003);
    for (let i = 0; i < 4; i++) k.box(0.0352, 0.004, 0.02, M.rubber(), -0.004 - i * 0.003, -0.04 - i * 0.018); // (finger grooves' texture)
    k.ringX(0.019, 0.003, C, 0.057, -0.022, 0, Math.PI, Math.PI);
    // the stock mount at the back: a block, its steel dovetail
    k.box(0.026, 0.034, 0.016, C, f0 - 0.014, -0.004);
    k.box(0.016, 0.012, 0.006, M.steel(), f0 - 0.018, -0.004);
    // rails: each side of the shroud, and under it
    const rf = len * 0.48, RL = Math.max(0.044, fN - rf - 0.006);
    for (const x of [-1, 1]) sideRail(k, rf, RL, -0.006, x * (W / 2 + 0.001));
    k.box(0.02, 0.004, RL, B, rf, -0.018);
    for (let i = 0; i < Math.floor(RL / 0.0105); i++) k.box(0.022, 0.003, 0.0052, B, rf + 0.003 + i * 0.0105, -0.0215);
    let fgF = null;
    if (o.fg) { k.tag('fg'); fgF = rf + RL * 0.45; foregrip(k, o.fg, fgF, M.polymer()); }
    if (o.tac) { k.tag('tac'); tactical(k, o.tac, rf + RL - 0.004, -0.006, W / 2 + 0.006); }
    if (o.tacL) { k.tag('tacL'); tactical(k, o.tacL, rf + RL - 0.004, -0.006, -(W / 2 + 0.006), -1); }
    if (o.stock) { k.tag('stock'); const sp = k.part(f0 - 0.018, -0.004); k.into(sp); stock(k, o.stock, o.sm || M.black(), true); k.into(null); }
    k.tag('base');
    return {
      front: fN, support: fgF != null && o.fg !== 'bipod' ? [fgF, -0.07, 0] : [len * 0.72, -0.034, -0.004],
      // a rifle's sight on the rail (with a magnifier behind a red dot, the sight forward so the magnifier's mount is on
      // the rail too); with none, flip-up irons at its ends
      sights(anim) {
        k.tag('optic');
        let sight;
        if (o.optic && !['irons', 'notch', 'bead', 'none', 'night', 'minidot', 'riser'].includes(o.optic)) {
          sight = sightOf(k, o, top, f0, rl, 0.01, fN, f0 + (o.magnifier ? Math.max(rl * 0.55, Math.min(rl - 0.035, 0.15)) : rl * 0.5));
          if (o.magnifier && k.reflex) { k.tag('magnifier'); sight = S.magnifier(k, sight, top, o.magnifier, anim); }
        } else sight = S.irons(k, f0 + 0.012, fN - 0.014, top + 0.026, top, top, 'ar');
        return sight;
      },
    };
  }

  // A revolver traced from its photo (o.look): the frame with its window, the barrel with its rib and full under-lug (a
  // longer barrel stretches them), and the cylinder swept in the round, its flutes running in from the front.
  function tracedRevolver(k, o, t) {
    const V = tracer(t), fm = o.m || M.steel(), bl = o.blen || 0.1, cl = o.cl, cr = o.cr, anim = {}, mats = { frame: fm, grip: o.gm || M.chequer() };
    const f1 = V([t.frameF, 0])[0], bl0 = V([t.muzzle, 0])[0] - f1, stretch = ([x, y]) => { const [f, u] = V([x, y]); return [f <= f1 ? f : f1 + (f - f1) * bl / bl0, u]; };
    const fc = V([t.cyl[0], 0])[0], axis = V([0, t.cyl[2]])[1], Rc = 0.009 - axis, top = V([0, t.topY])[1], front0 = f1 + bl;
    k.tag('base');
    tracedParts(k, t, V, 'base', mats);
    const cyl = k.part(fc + cl / 2, axis);
    k.into(cyl, fc + cl / 2, axis);
    const round = (rim, flute) => Array.from({ length: 48 }, (_, i) => {
      const a = (i / 48) * Math.PI * 2, d = Math.abs(((a - Math.PI / 2 - Math.PI / 6 + Math.PI * 40) % (Math.PI / 3)) - Math.PI / 6) - Math.PI / 6, u = Math.max(0, 1 - (d / 0.42) ** 2), r = cr - rim - flute * u;
      return [Math.cos(a) * r, axis + Math.sin(a) * r];
    });
    k.loft([[fc, round(0.0012, 0)], [fc + 0.0012, round(0, 0)], [fc + 0.018, round(0, 0)], [fc + 0.026, round(0, 0.0032)], [fc + cl - 0.0012, round(0, 0.0032)], [fc + cl, round(0.001, 0.0032)]], fm);
    for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; k.cyl(0.0047, 0.002, M.rubber(), fc + cl - 0.0015, axis + Math.cos(a) * Rc, Math.sin(a) * Rc, 0.0047, 10); }
    k.into(null);
    anim.cyl = cyl;
    k.tag('barrel');
    k.cyl(t.br, bl + 0.004, fm, f1 - 0.004, 0.009, 0, t.br, 20);
    tracedParts(k, t, stretch, 'barrel', mats);
    k.cyl(0.0028, f1 - stretch([t.rod[0], 0])[0] < 0 ? stretch([t.rod[0], 0])[0] - f1 : 0.01, M.gunmetal(), f1, V([0, t.rod[1]])[1]); // (the ejector rod, in its shroud)
    k.cyl(0.0042, 0.006, M.gunmetal(), stretch([t.rod[0], 0])[0] - 0.006, V([0, t.rod[1]])[1]);
    k.cyl(0.0043, 0.002, M.rubber(), front0 - 0.0012, 0.009);
    let front = front0;
    if (o.comp) { k.box(0.02, 0.022, 0.03, fm, front, 0.008); front += 0.03; }
    k.tag('grip');
    tracedParts(k, t, V, 'grip', mats);
    k.tag('optic');
    const fR = V([t.sights[0], 0])[0], sy = V([0, t.sights[1]])[1];
    const sight = o.optic === 'minidot' ? S.minidot(k, fc + cl * 0.5, top) : S.revSights(k, fR, front0 - 0.006, sy, top, fm);
    if (o.optic === 'night') { k.cyl(0.0011, 0.0006, M.tritium(), front0 - 0.0122, sy - 0.002); for (const x of [-1, 1]) k.cyl(0.001, 0.0006, M.tritium(), fR - 0.0063, sy - 0.0023, x * 0.0045); }
    k.tag('base');
    const hold = V(t.hold);
    return { sy: sight.sy, fSight: sight.fSight, relief: o.optic === 'minidot' ? 0.3 : 0.36, muzzles: [[front, 0.009, 0]], grip: [hold[0], hold[1], 0], support: [hold[0] + 0.02, hold[1] - 0.005, -0.022], anim, pistol: true, cylAt: [fc + cl / 2, axis, 0], chamberAt: { side: 'cyl', z: cl / 2, R: Rc, r: 0.0047 } };
  }

  function revolver(k, o) {
    if (o.look) return tracedRevolver(k, o, G.GunTraces[o.look]);
    const fm = o.m || M.steel(), bl = o.blen || 0.1, cl = o.cl || 0.042, cr = o.cr || 0.021;
    const anim = {};
    k.tag('base');
    k.prof([[-0.012, 0.022], [0.06 + cl, 0.024], [0.06 + cl, -0.026], [0.02, -0.026], [0.0, -0.01], [-0.012, 0.0]], 0.024, fm);
    const cyl = k.part(0.03 + cl / 2, -0.004);
    k.into(cyl, 0.03 + cl / 2, -0.004);
    k.cyl(cr, cl, fm, 0.03, -0.004, 0, cr, 18);
    for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; k.cyl(cr * 0.28, 0.002, M.rubber(), 0.03 + cl, -0.004 + Math.cos(a) * cr * 0.6, Math.sin(a) * cr * 0.6, cr * 0.28, 8); }
    k.into(null);
    anim.cyl = cyl;
    k.box(0.008, 0.016, 0.012, fm, -0.018, 0.02);
    k.box(0.007, 0.008, 0.03, fm, -0.044, 0.026);
    k.ringX(0.016, 0.0025, fm, 0.03, -0.03, 0, Math.PI, Math.PI);
    k.tag('barrel');
    k.cyl(0.0085, bl, fm, 0.03 + cl + 0.004, 0.009);
    k.box(0.014, 0.014, bl * 0.9, fm, 0.03 + cl + 0.004, -0.006);
    k.box(0.006, 0.004, bl, fm, 0.03 + cl + 0.004, 0.02);
    let front = 0.03 + cl + 0.004 + bl;
    if (o.comp) { k.box(0.02, 0.022, 0.03, fm, front, 0.008); front += 0.03; }
    k.tag('grip');
    k.prof([[-0.012, 0.0], [0.022, -0.012], [0.016, -0.11], [-0.03, -0.1], [-0.024, -0.02]], 0.032, o.gm || M.woodDark());
    k.tag('optic');
    const sight = o.optic === 'minidot' ? S.minidot(k, 0.02 + cl * 0.5, 0.024) : S.revSights(k, 0.006, front - 0.006, 0.0295, 0.022, fm);
    if (o.optic === 'night') { k.cyl(0.0011, 0.0006, M.tritium(), front - 0.0122, 0.0275); for (const x of [-1, 1]) k.cyl(0.001, 0.0006, M.tritium(), -0.0003, 0.0272, x * 0.0045); }
    k.tag('base');
    return { sy: sight.sy, fSight: sight.fSight, relief: o.optic === 'minidot' ? 0.3 : 0.36, muzzles: [[front, 0.009, 0]], grip: [0.0, -0.06, 0], support: [0.02, -0.065, -0.022], anim, pistol: true, cylAt: [0.03 + cl / 2, -0.004, 0], chamberAt: { side: 'cyl', z: cl / 2, R: cr * 0.6, r: cr * 0.28 } }; // (the case heads on the cylinder's back face)
  }

  // the derringer's trace: a pixel of its reference photo ([x, y]: x forward from the breech face at 314, y down from the
  // top barrel's bore at 155) to gun space ([forward, up], metres)
  const derTrace = ([x, y]) => [(x - 314) * 0.000167, (155 - y) * 0.000167];
  function derringer(k, o) {
    // The American Derringer Model 1 (the Remington over-under's pattern in stainless), traced from a side photo of the
    // right side (Wikimedia Commons, "American Corp. Derringer M1.jpg", public domain) at 0.167 mm a pixel: 122 mm
    // overall, the maker's figure. Two barrels in one block, one over the other, hinged at the top of their back on the
    // frame: they tip up, muzzles first, to load (the breech drops forward off the standing breech). A spur trigger
    // (no guard), the hammer behind, the bird's-head grip. In .44 Magnum (the Model 1 is made in it).
    const V = derTrace, pts = (a) => a.map(V), S0 = M.steel(), D = M.rubber();
    const bl = o.blen || 0.084, [, y0] = V([0, 107]), [, y1] = V([0, 299]), [, yS] = V([0, 81]);
    k.tag('base');
    // the frame: the standing breech, the strap under the barrels, the grip frame; the spur trigger; the hammer
    k.prof(pts([[273, 150], [302, 124], [322, 118], [322, 299], [512, 302], [522, 316], [512, 330], [330, 334], [304, 386], [296, 420], [290, 500], [273, 557], [202, 568],
      [150, 555], [115, 500], [95, 415], [110, 335], [160, 255], [190, 214], [231, 178]]), 0.019, S0, 0, null, 0.002);
    k.prof(pts([[440, 330], [478, 332], [486, 360], [482, 420], [470, 446], [458, 440], [462, 400], [452, 352]]), 0.008, S0, 0, null, 0.0015);
    k.prof(pts([[206, 92], [220, 80], [246, 83], [264, 102], [288, 142], [302, 166], [292, 182], [266, 162], [248, 122], [230, 104], [210, 100]]), 0.009, S0, 0, null, 0.0015);
    for (let i = 0; i < 4; i++) k.box(0.0094, 0.0006, 0.0018, D, V([214 + i * 9, 0])[0], V([0, 84 + i * 1.5])[1]); // (the spur's chequering)
    // the hinge: the frame's two ears up off the top of the standing breech, either side of the barrels' lug, the pin
    // through them (the barrels turn on it)
    const [pf, py] = V([392, 101]);
    k.prof(pts([[300, 128], [322, 104], [380, 80], [404, 80], [414, 92], [414, 112], [398, 124], [322, 130]]), 0.0235, S0, 0, null, 0.0012);
    k.cylX(V([0, 89])[1] - py, 0.0245, S0, pf, py, 0);
    k.tag('grip');
    if (o.gripT === 'lug') {
      // a squared polymer grip, its butt flat, a steel lug at its back for a stock (any SMG stock: o.stock), on a
      // part at the lug so it sits level with the top of the grip, under the bore
      k.prof(pts([[118, 300], [176, 246], [250, 252], [290, 300], [300, 344], [298, 556], [140, 560], [124, 470], [112, 380]]), 0.024, o.gm || M.polymer(), 0, null, 0.003);
      k.prof(pts([[84, 262], [128, 262], [128, 340], [84, 340]]), 0.02, S0, 0, null, 0.0015);
      if (o.stock) { k.tag('stock'); const sp = k.part(V([90, 0])[0], V([0, 284])[1]); k.into(sp); stock(k, o.stock, o.sm || M.black(), true); k.into(null); k.tag('grip'); }
    } else {
      k.prof(pts([[122, 300], [176, 246], [250, 252], [290, 300], [300, 344], [292, 420], [284, 500], [265, 548], [205, 558], [156, 546], [126, 500], [107, 420], [106, 352]]), 0.023, o.gm || M.woodDark(), 0, null, 0.003);
      for (const x of [-0.0118, 0.0118]) { const [f, y] = V([150, 405]); k.cylX(0.0028, 0.0008, S0, f, y, x); } // (the grip screw's escutcheons)
    }
    k.tag('barrel');
    const anim = {};
    // the barrels, on the hinge: two round tubes one over the other, joined by a web between them and a rib along the
    // top (its front sight a blade on it at the muzzle, FS over the factory hump: as low as that, the hinge's ears and
    // the hammer's spur stood as high as it, and hid it); at the back, the square lug the hinge pin goes through
    const brk = k.part(pf, py);
    k.into(brk, pf, py);
    const lo = V([0, 251])[1], br = (y0 - y1) / 4, lug = V([420, 0])[0], FS = 0.004, yF = yS + FS;
    for (const yy of [0, lo]) k.cyl(br, bl - lug, S0, lug, yy, 0, br, 20);
    k.prof([[0, y0], [lug, y0], [lug, y1], [0, y1]], 0.0215, S0, 0, null, 0.0015);
    k.box(0.009, -lo, bl - lug, S0, lug, lo / 2);
    k.prof([[lug, y0 - 0.002], [bl - 0.011, y0 - 0.002], [bl - 0.011, y0 + 0.0008], [bl - 0.0068, yF], [bl - 0.0008, yF], [bl, yS - 0.002], [bl, y0 - 0.002]], 0.0035, S0, 0, null, 0.0005);
    for (const yy of [0, lo]) { k.cyl(0.0058, 0.0012, D, bl - 0.0008, yy); k.cyl(0.0066, 0.0012, S0, -0.0012, yy); } // (the bores at the muzzle; the extractor's rims at the breech)
    // an integral suppressor (o.can): one oval can round both barrels from `from` to the muzzle (two tubes and the web
    // between), a band at each end, the bores' exits in its end cap, a front sight blade on top
    let canTop = null;
    if (o.can) {
      const cf = o.can.from, cr = o.can.r, B = M.black();
      for (const yy of [0, lo]) k.cyl(cr, bl - cf + 0.001, B, cf, yy, 0, cr, 24);
      k.box(cr * 1.9, -lo, bl - cf + 0.001, B, cf, lo / 2);
      for (const f of [cf + 0.004, bl - 0.004]) for (const yy of [0, lo]) k.ringZ(cr + 0.0004, 0.004, M.rubber(), f, yy);
      for (const yy of [0, lo]) k.cyl(0.0062, 0.0014, D, bl + 0.0004, yy);
      canTop = cr;
      k.box(0.0022, 0.0045 + FS, 0.008, S0, bl - 0.012, cr + 0.002 + FS / 2);
    }
    // long barrels (a carbine's, a rifle's): a forend clamped round them, a rail under (a foregrip) and one each side
    // (a light, a laser), on the barrels, so they tip open with them
    let fgF = null;
    if (bl > 0.2) {
      // (the clamp, then each rail four slots long, enough for a grip or a light)
      const f0 = bl * 0.35, r0 = f0 + 0.034, RL = 0.044, B = M.black();
      k.box(0.026, y0 - y1 + 0.004, 0.032, B, f0, (y0 + y1) / 2);
      k.box(0.02, 0.006, RL + 0.034, B, f0, y1 - 0.003);
      for (let i = 0; i < 4; i++) k.box(0.022, 0.004, 0.0052, B, r0 + 0.003 + i * 0.0105, y1 - 0.008);
      for (const x of [-1, 1]) sideRail(k, r0, RL, lo / 2, x * 0.0135);
      if (o.fg) { k.tag('fg'); fgF = r0 + RL / 2 - 0.002; foregrip(k, o.fg, fgF, o.fm || M.polymer()); }
      if (o.tac) { k.tag('tac'); tactical(k, o.tac, r0 + RL - 0.004, lo / 2, 0.017); }
      if (o.tacL) { k.tag('tacL'); tactical(k, o.tacL, r0 + RL - 0.004, lo / 2, -0.017, -1); }
      k.tag('barrel');
    }
    // the sights on the barrels (they tip open with them): the 3" optic-cut pair's pistol sight on the flat cut in the
    // rib just ahead of the lug (night sights: tritium dots on the front sight and either side of the rib behind), or
    // a rail along a long pair's rib for a rifle's sight (and a magnifier behind a red dot). (railmount: the old
    // clamp-on plate, retired: a build that still has it)
    let sight = null;
    if (o.optCut || o.railmount === 'derringer') {
      const pf0 = lug + 0.003, ptop = y0 + 0.003;
      k.box(0.017, 0.004, 0.044, o.optCut ? S0 : M.black(), pf0, y0 + 0.001);
      k.tag('optic');
      if (o.optic === 'minidot') sight = S.minidot(k, pf0 + 0.03, ptop, o);
      else if (o.optic === 'night') { k.cyl(0.0011, 0.0006, M.tritium(), bl - 0.0062, yF - 0.0016); for (const x of [-1, 1]) k.cyl(0.001, 0.0006, M.tritium(), pf0 - 0.0006, ptop - 0.0016, x * 0.004); }
    } else if (bl > 0.2) {
      const r0 = lug + 0.004, rl = Math.min(0.16, bl * 0.4);
      k.box(0.016, 0.004, rl, M.black(), r0, y0 + 0.001);
      const top = S.rail(k, r0, rl, y0 + 0.003, M.black());
      if (o.optic && !['irons', 'notch', 'bead', 'none'].includes(o.optic)) {
        // (with a magnifier behind it, the sight goes forward on the rail, so the magnifier's mount sits on the rail too)
        k.tag('optic'); sight = sightOf(k, o, top, lug, bl, br, bl, r0 + (o.magnifier ? Math.max(rl * 0.55, Math.min(rl - 0.035, 0.125)) : rl * 0.55));
        if (o.magnifier && k.reflex) { k.tag('magnifier'); sight = S.magnifier(k, sight, top, o.magnifier, anim); }
      }
    }
    k.into(null);
    anim.brk = brk;
    k.tag('base');
    // where the breeches are with the barrels tipped open (js/vmanim.js: the rounds go in there, up the bores)
    const OPEN = 2.88, c = Math.cos(OPEN), s = Math.sin(OPEN), at = (y) => [pf - pf * c + (py - y) * s, py - pf * s - (py - y) * c];
    // (long barrels, a carbine's or a rifle's: the other hand out under them)
    return { sy: sight ? sight.sy : canTop != null ? canTop + 0.0045 + FS : yF + 0.001, fSight: sight ? sight.fSight : 0.0, relief: sight ? sight.relief : 0.36, muzzles: [[bl, 0, 0], [bl, lo, 0]], grip: [-0.016, -0.042, 0], // (the top barrel fires first)
      support: fgF != null && o.fg !== 'bipod' ? [fgF, -0.07, 0] : bl > 0.2 ? [Math.min(bl * 0.45, 0.2), lo - 0.016, 0] : [0.002, -0.05, -0.02], anim, pistol: true, port: [0.0, 0.0, 0], // (on the foregrip if there's one)
      load: { at: [at(0), at(lo)], pitch: OPEN }, cup: [0.002, -0.05, -0.02], // (cup: the left hand under the frame, whatever the barrels: js/vmanim.js inspect)
      chamberAt: { side: 'breech', heads: [[0, lo - py], [0, -py]], z: pf + 0.0026, r: 0.0066 } }; // (in the hinge's frame: just proud of the block's back; the bottom's first, the round left when the top's fired)
  }

  function minigun(k, o) {
    const anim = {}, bl = o.blen || 0.55;
    k.tag('base');
    k.box(0.09, 0.1, 0.22, M.gunmetal(), 0, -0.01);
    k.prof([[0.02, -0.06], [0.06, -0.06], [0.05, -0.15], [0.01, -0.14]], 0.03, M.polymer());
    let top = 0.04;
    top = S.rail(k, 0.03, 0.15, top, M.black());
    k.tag('motor');
    const mr = o.motor === 'torque' ? 0.05 : 0.04;
    k.cylX(mr, o.motor === 'volt' ? 0.07 : 0.05, o.motor === 'volt' ? M.glow() : M.black(), 0.06, -0.01, -0.06);
    k.tag('mag');
    const sc = (o.mag && o.mag.scale) || 1;
    const box = k.part(0.12, -0.06);
    k.into(box, 0.12, -0.06);
    k.box(0.07 * sc, 0.12 * sc, 0.12 * sc, M.od(), 0.06, -0.12 - 0.04 * (sc - 1), -0.07);
    k.into(null);
    anim.mag = box;
    k.tag('barrel');
    const spin = k.part(0.22, -0.01);
    k.into(spin, 0.22, -0.01);
    for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; k.cyl(0.0085, bl, M.blued(), 0.22, -0.01 + Math.cos(a) * 0.028, Math.sin(a) * 0.028); }
    for (const f of [0.26, 0.22 + bl * 0.5, 0.22 + bl - 0.03]) k.cyl(0.042, 0.018, M.black(), f, -0.01);
    k.into(null);
    anim.spin = spin;
    // the support hand's handle: out on the left side, forward of the motor (nothing over the top rail, so a sight sits
    // low on it and the eye gets down to it), and a short rail on the right for a light or laser
    k.box(0.075, 0.022, 0.03, M.gunmetal(), 0.168, 0.0, -0.082);
    k.prof([[0.166, 0.008], [0.2, 0.008], [0.197, -0.098], [0.17, -0.098]], 0.028, M.polymer(), -0.128);
    k.box(0.03, 0.006, 0.032, M.rubber(), 0.168, -0.1, -0.128);
    sideRail(k, 0.13, 0.08, -0.012, 0.05);
    if (o.tac) { k.tag('tac'); tactical(k, o.tac, 0.215, -0.012, 0.052); }
    k.tag('optic');
    let sight;
    if (!o.optic || o.optic === 'none' || o.optic === 'irons') sight = S.irons(k, 0.04, 0.17, top + 0.034, top, top, 'ar'); // (low on the rail: no carry handle in the way any more)
    else sight = sightOf(k, o, top, 0.22, bl, 0.01, 0.22 + bl, 0.12);
    k.tag('base');
    return { sy: sight.sy, fSight: sight.fSight, relief: sight.relief, muzzles: [[0.22 + bl, -0.01, 0]], grip: [0.035, -0.08, 0], support: [0.184, -0.03, -0.128], anim, magAt: [0.12, -0.06] };
  }

  function launcher(k, o) {
    const anim = {}, bl = o.blen || 0.3;
    if (o.drum) {
      k.tag('base');
      k.box(0.05, 0.05, 0.1, M.black(), 0, -0.01);
      const drum = k.part(0.17, -0.005);
      k.into(drum, 0.17, -0.005);
      k.cyl(0.072, 0.14, M.black(), 0.1, -0.005, 0, 0.072, 18);
      for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; k.cyl(0.021, 0.003, M.rubber(), 0.24, -0.005 + Math.cos(a) * 0.045, Math.sin(a) * 0.045, 0.021, 10); }
      k.into(null);
      anim.cyl = drum;
      grip(k, 0.03, M.polymer());
      triggerGuard(k, 0.03, M.black());
      grip(k, 0.38, M.polymer(), 'vertical');
      const top = S.rail(k, 0.24, 0.2, 0.065, M.black());
      k.tag('barrel');
      k.cyl(0.024, bl, M.black(), 0.24, 0.04);
      k.box(0.05, 0.03, bl, M.black(), 0.24, 0.01);
      k.tag('stock');
      stock(k, o.stock || 'm4', o.sm || M.polymer());
      k.tag('optic');
      const sight = sightOf(k, o, top, 0.24, bl, 0.024, 0.24 + bl, 0.34);
      k.tag('base');
      return { sy: sight.sy, fSight: sight.fSight, relief: sight.relief, muzzles: [[0.24 + bl, 0.04, 0]], grip: [0.035, -0.075, 0], support: [0.38, -0.06, 0], anim, port: [0.24, -0.005, 0] };
    }
    k.tag('base');
    k.box(0.03, 0.04, 0.08, M.black(), 0.02, -0.03);
    grip(k, 0.03, M.polymer());
    triggerGuard(k, 0.03, M.black());
    k.tag('barrel');
    k.cyl(0.024, bl, M.od(), 0.0, 0.0);
    k.cyl(0.027, 0.03, M.black(), 0.0, 0.0);
    k.tag('stock');
    stock(k, o.stock || 'wire', o.sm || M.blued());
    k.tag('optic');
    const sight = o.optic && o.optic !== 'notch' ? sightOf(k, o, S.rail(k, 0.05, 0.12, 0.024, M.black()), bl, bl, 0.024, bl, 0.1) : S.notch(k, 0.05, bl - 0.03, 0.042, 0.024, 0.024);
    k.tag('base');
    return { sy: sight.sy, fSight: sight.fSight, relief: sight.relief || 0.3, muzzles: [[bl, 0, 0]], grip: [0.035, -0.075, 0], support: [0.2, -0.03, 0], anim, port: [0.0, 0.0, 0] };
  }

  function railgun(k, o) {
    const bl = o.blen || 0.55;
    k.tag('base');
    k.prof([[0, -0.05], [0, 0.03], [0.34, 0.03], [0.36, 0.0], [0.34, -0.05]], 0.05, M.gunmetal());
    grip(k, 0.06, M.polymer());
    triggerGuard(k, 0.06, M.black());
    const top = S.rail(k, 0.08, 0.22, 0.03, M.black());
    k.tag('stock');
    stock(k, o.stock || 'skeleton', o.sm || M.polymer());
    k.tag('barrel');
    for (const y of [0.022, -0.022]) k.box(0.03, 0.01, bl, M.black(), 0.34, y);
    for (let i = 0; i < Math.round(bl / 0.09); i++) k.ringZ(0.03, 0.005, M.glow(), 0.4 + i * 0.08, 0);
    k.cyl(0.006, bl, M.steel(), 0.34, 0);
    k.tag('cap');
    const cb = o.cap === 'big' ? 1.35 : o.cap === 'rapid' ? 0.8 : 1;
    const capP = k.part(0.19, -0.04);
    k.into(capP, 0.19, -0.04);
    k.box(0.02 * cb, 0.06 * cb, 0.14, o.cap === 'rapid' ? M.amber() : M.glow(), 0.12, -0.07, -0.01);
    k.into(null);
    const anim = { mag: capP };
    k.tag('optic');
    const sight = sightOf(k, o, top, 0.34, bl, 0.006, 0.34 + bl, 0.18);
    k.tag('base');
    return { sy: sight.sy, fSight: sight.fSight, relief: sight.relief, muzzles: [[0.34 + bl, 0, 0]], grip: [0.065, -0.075, 0], support: [0.5, -0.03, 0], anim, magAt: [0.19, -0.04] };
  }

  // A crossbow bolt (a quarrel), built along -z with its nock at z = 0 (centred: its middle at 0, for the hand): a nock, a
  // carbon shaft, three vanes (the odd one down, into the rail's slot) and a head, 0.40 m in all. The nock, the head, the
  // vanes and the shaft each have a material of their own, so a bolt type can recolour them (js/data.js, js/ballistics.js).
  function quarrel(centre) {
    const g = new T.Group(), z0 = centre ? 0.2 : 0;
    const mats = {
      nock: new T.MeshStandardMaterial({ color: 0xe8e2d0, roughness: 0.5 }),
      shaft: new T.MeshStandardMaterial({ color: 0x2a2c30, roughness: 0.7, metalness: 0 }),
      vane: new T.MeshStandardMaterial({ color: 0xf0661a, roughness: 0.7, side: T.DoubleSide }),
      head: new T.MeshStandardMaterial({ color: 0xb9bec4, roughness: 0.3, metalness: 0.85 }),
    };
    const cyl = (r, rFront, len, f0, m) => { const geo = new T.CylinderGeometry(r, rFront, len, 10); geo.rotateX(Math.PI / 2); const o = new T.Mesh(geo, m); o.position.z = -(f0 + len / 2) + z0; return o; };
    const fin = (a, r, w, h, len, f0, m) => { const o = new T.Mesh(new T.BoxGeometry(w, h, len), m); o.position.set(Math.sin(a) * r, Math.cos(a) * r, -(f0 + len / 2) + z0); o.rotation.z = -a; return o; };
    const nock = new T.Group(), head = new T.Group(), vanes = new T.Group(), shaft = cyl(0.0042, 0.0042, 0.335, 0.018, mats.shaft);
    nock.add(cyl(0.0052, 0.0046, 0.018, 0, mats.nock));
    const slot = new T.Mesh(new T.BoxGeometry(0.0016, 0.0032, 0.007), mats.shaft); slot.position.set(0, 0.0036, -0.0035 + z0); nock.add(slot); // (the string's slot across its tail)
    for (const a of [Math.PI, Math.PI / 3, -Math.PI / 3]) vanes.add(fin(a, 0.0042 + 0.0053, 0.0008, 0.0106, 0.05, 0.025, mats.vane));
    head.add(cyl(0.0042, 0.0042, 0.012, 0.353, mats.head), cyl(0.0042, 0.0006, 0.035, 0.365, mats.head));
    for (const a of [0, (Math.PI * 2) / 3, (Math.PI * 4) / 3]) head.add(fin(a, 0.0042 + 0.0065, 0.0008, 0.013, 0.03, 0.362, mats.head));
    g.add(nock, shaft, vanes, head);
    return { group: g, nock, head, vanes, mats };
  }

  // The crossbow, traced from the TenPoint Stealth SS (a modern compound hunting crossbow: 874 mm with its stirrup) and,
  // for the limbs from above, the Horton Hunter Supreme. A flat aluminium flight rail with the bolt in its deck, a latch
  // where the string cocks, a riser at the front clamped round the rail with a limb pocket each side, split limbs with a
  // cam at each tip, string and cables, a steel stirrup, a scope rail bridged over the bolt's vane, a thumbhole stock and
  // a fore-end. (Forward from the stock's front, f = 0: the latch at 0.075, the riser 0.31-0.375, the stirrup to 0.51.)
  // anim: quarrel (the bolt on the rail: gone once it's shot), stringCocked (the string back at the latch) and stringSlack
  // (forward at the cams): one shows at a time, js/vmanim.js. quarrelHead and quarrelNock are the bolt's head and nock.
  function crossbow(k, o) {
    const B = M.black(), GM = M.gunmetal(), ya = 0.0165, yc = 0.014;
    const heavy = o.limb === 'heavy', compact = o.limb === 'compact', Tx = heavy ? 0.19 : compact ? 0.135 : 0.17, lw = heavy ? 1.6 : 1, LM = heavy ? GM : B;
    k.tag('base');
    // the flight rail: a deep extrusion (lightening slots down its side) with a slotted deck for the odd vane
    k.box(0.036, 0.032, 0.4, B, 0.0, -0.008);
    for (const x of [-0.0125, 0.0125]) k.box(0.011, 0.004, 0.4, GM, 0.0, 0.01, x);
    for (let i = 0; i < 7; i++) for (const x of [-0.0185, 0.0185]) k.box(0.0012, 0.012, 0.022, GM, 0.1 + i * 0.04, -0.008, x);
    k.box(0.03, 0.012, 0.04, GM, 0.055, 0.006); // the latch, the string's seat
    for (const x of [-0.009, 0.009]) k.box(0.004, 0.011, 0.014, GM, 0.058, 0.0185, x); // its claws
    grip(k, 0.03, M.polymer());
    triggerGuard(k, 0.03, B);
    // the trigger housing under the rail behind the grip, the fore-end under it
    k.box(0.034, 0.022, 0.08, B, 0.0, -0.035);
    k.prof([[0.1, -0.024], [0.31, -0.024], [0.312, -0.056], [0.292, -0.072], [0.2, -0.078], [0.125, -0.066], [0.1, -0.05]], 0.034, M.polymer());
    // the riser: two cheeks round the rail leaving the bolt's path open, a limb pocket each side, the cable slide below
    for (const s of [-1, 1]) {
      k.box(0.022, 0.07, 0.065, GM, 0.31, 0.004, s * 0.029);
      k.box(0.035, 0.052, 0.05, B, 0.318, 0.014, s * 0.0585);
    }
    k.box(0.01, 0.01, 0.02, GM, 0.275, -0.029);
    // the stirrup: a steel loop out in front of the riser to put your foot in
    for (const s of [-1, 1]) k.cyl(0.0045, 0.14, M.steel(), 0.37, -0.016, s * 0.033);
    k.cylX(0.0045, 0.075, M.steel(), 0.51, -0.016, 0, 8);
    const top = S.rail(k, 0.1, 0.2, 0.025, B);
    for (const f of [0.1, 0.275]) for (const x of [-0.0125, 0.0125]) k.box(0.004, 0.018, 0.02, B, f, 0.017, x); // (the posts that bridge it over the bolt)
    k.tag('stock');
    const stk = o.stock || 'sniper';
    if (stk !== 'sniper') stock(k, stk, o.sm || M.polymer());
    else if (!buildingVM) { // the factory stock: a thumbhole with a high comb, the pad on its butt
      k.prof([[0, -0.024], [0, 0.012], [-0.1, 0.012], [-0.18, 0.026], [-0.33, 0.034], [-0.356, 0.03], [-0.364, -0.13], [-0.33, -0.14], [-0.26, -0.13], [-0.19, -0.1], [-0.13, -0.075], [-0.07, -0.082], [-0.01, -0.095], [0.0, -0.05]], 0.042, o.sm || M.polymer(), 0,
        [[[-0.03, -0.012], [-0.15, -0.002], [-0.2, -0.04], [-0.12, -0.07], [-0.04, -0.06]]]);
      k.box(0.044, 0.15, 0.012, M.rubber(), -0.376, -0.056);
    }
    k.tag('limbs');
    // split limbs: two plates (above and below the bolt's plane) from each pocket out to a cam, sweeping back a little
    const R = 0.07, fR = 0.343, fT = 0.3, sc = new T.Group(), sl = new T.Group(), V = (x, y, f) => new T.Vector3(x, y, -f);
    const seg = (grp, a, b, r, m, sides = 5) => {
      const d = new T.Vector3().subVectors(b, a), mesh = new T.Mesh(new T.CylinderGeometry(r, r, d.length(), sides), m);
      mesh.position.copy(a).addScaledVector(d, 0.5); mesh.quaternion.setFromUnitVectors(new T.Vector3(0, 1, 0), d.normalize()); mesh.userData.slot = 'limbs'; grp.add(mesh);
    };
    for (const s of [-1, 1]) {
      const dx = s * (Tx - R), dz = fR - fT, len = Math.hypot(dx, dz);
      for (const dy of [-0.0105, 0.0105]) {
        const limb = new T.Mesh(new T.BoxGeometry(0.03, 0.008 * lw, len), LM);
        limb.position.set(s * R + dx / 2, yc + dy, -(fR + fT) / 2); limb.rotation.y = Math.atan2(dx, dz); k.add(limb);
        k.cylY(0.021, 0.004, GM, fT - 0.005, yc + dy * 1.15, s * Tx, 20);
        k.cylY(0.007, 0.006, B, fT - 0.005, yc + dy * 1.15, s * Tx, 8);
      }
      k.cylY(0.004, 0.036, M.steel(), fT - 0.005, yc, s * Tx, 8); // (the axle through both)
      k.box(0.02, 0.006 + 0.022 * lw, 0.012, B, fR - 0.012, yc, s * (R - 0.012)); // (the limb bolt clamp at its root)
      // the string leaves the cam's rear: cocked, back to the latch; slack, nearly straight across the rail's front
      const rim = V(s * (Tx - 0.008), ya, fT - 0.025);
      seg(sc, rim, V(0, ya, 0.0745), 0.0016, M.string());
      seg(sl, rim, V(0, ya, 0.275), 0.0016, M.string());
      // the cables: from each cam under the rail to the slide
      for (const dy of [-0.0105, 0.0105]) for (const grp of [sc, sl]) seg(grp, V(s * (Tx - 0.01), yc + dy, fT + 0.015), V(s * 0.004, -0.029, 0.285), 0.0011, B, 4);
    }
    k.add(sc); k.add(sl);
    sl.visible = false;
    // the bolt, cocked and ready: its nock on the string at the latch
    k.tag('base');
    const q = quarrel(false);
    q.group.position.set(0, ya, -0.077);
    q.group.traverse((m) => { m.userData.slot = 'base'; });
    k.add(q.group);
    k.tag('optic');
    const sight = sightOf(k, o, top, 0.2, 0.3, 0.004, 0.48, 0.2);
    k.tag('base');
    return { sy: sight.sy, fSight: sight.fSight, relief: sight.relief, muzzles: [[0.47, ya, 0]], grip: [0.035, -0.075, 0], support: [0.2, -0.05, 0], port: [0.16, 0.03, 0],
      anim: { quarrel: q.group, quarrelHead: q.head, quarrelNock: q.nock, stringCocked: sc, stringSlack: sl }, quarrelMats: q.mats };
  }

  // The P90, traced from FN's side view (500 mm overall): a thumbhole stock and a finger hole through one moulded
  // frame; the magazine lying along the top behind a sight housing (a post in front, a leg slanting back over it,
  // a beam between carrying the optic rail, a short side rail each side); the cocking handles low at the front.
  // (Points are the photo's pixels, butt at x 1110 and bore at y 287, 0.485 mm each.)
  function p90(k, o) {
    const bl = o.blen || 0.04, PX = 0.5 / 1032, F = (x) => -0.03 + (1110 - x) * PX, Y = (y) => (287 - y) * PX;
    const pts = (a) => a.map(([x, y]) => [F(x), Y(y)]);
    const oval = (cx, cy, rx, ry, n = 14) => Array.from({ length: n }, (_, i) => [F(cx + Math.cos((i / n) * Math.PI * 2) * rx), Y(cy + Math.sin((i / n) * Math.PI * 2) * ry)]);
    const P0 = M.polymer(), B = M.black();
    k.tag('base');
    // the frame: the stock; underneath, the grip lobe round the thumbhole, a notch, the front lobe round the finger hole
    // (the trigger at its back), the hand stop's narrow hook at the front with a notch behind it
    k.prof(pts([[1110, 212], [1110, 450], [840, 452], [700, 480], [560, 495], [470, 490], [444, 452], [430, 420], [416, 452], [398, 490], [320, 497], [285, 485], [268, 450],
      [264, 372], [202, 372], [200, 415], [168, 415], [167, 315], [460, 315], [460, 258], [790, 258], [790, 212]]), 0.055, P0, 0, [oval(600, 378, 80, 41), oval(358, 373, 33, 42)]);
    k.box(0.057, 0.115, 0.008, M.rubber(), F(1110), Y(331)); // the butt pad
    k.box(0.012, 0.005, 0.016, B, F(420), Y(398), 0); // the trigger, at the back of the finger hole
    // the upper receiver over the frame's front, the barrel in it, the cocking handles' slots along its sides
    k.prof(pts([[167, 315], [167, 262], [460, 257], [460, 315]]), 0.05, B);
    for (const x of [-0.0255, 0.0255]) k.box(0.002, 0.012, F(285) - F(460), M.steel(), F(460), Y(300), x);
    // the sight housing: a post in front of the magazine, a beam (a window through it) to a leg slanting down over the
    // magazine, a short side rail each side of the beam, the optic rail on top
    k.prof(pts([[170, 262], [170, 136], [186, 122], [470, 118], [496, 136], [530, 212], [530, 290], [462, 290], [456, 214], [430, 190], [252, 190], [250, 262]]), 0.044, B, 0,
      [pts([[420, 150], [482, 148], [486, 168], [422, 170]])]);
    for (const x of [-0.0232, 0.0232]) sideRail(k, F(410), F(250) - F(410), Y(161), x);
    const top = S.rail(k, F(445), F(200) - F(445), Y(119), B);
    k.tag('tac'); tactical(k, o.tac, F(232), Y(161), 0.0245);
    k.tag('tacL'); tactical(k, o.tacL, F(232), Y(161), -0.0245, -1);
    // the magazine: clear, lying along the top from the housing's front post to the stock, the rounds across it
    k.tag('mag');
    const mk = ((o.mag && o.mag.len) || 0.15) / 0.15, m0 = F(790), m1 = F(250), mlen = (m1 - m0) * Math.min(1.15, mk), my = Y(232);
    const magP = k.part(m0, my);
    k.into(magP, m0, my);
    k.box(0.042, 0.024, mlen, M.clear(), m0, my);
    k.box(0.03, 0.012, mlen - 0.014, M.brass(), m0 + 0.007, my - 0.002);
    k.box(0.044, 0.026, 0.007, M.steel(), m0 + mlen - 0.007, my); // (its front cap)
    k.into(null);
    const handle = { f: F(262), y: Y(300), x: 0.027, travel: F(262) - F(440), style: 'pair', sz: 0.8 }, hp = cockHandle(k, handle);
    k.tag('barrel');
    k.cyl(0.0085, bl, M.blued(), F(167) - 0.045, 0); // (most of it in the receiver: a stub and the flash hider stand out of it)
    let front = F(167) - 0.045 + bl;
    if (o.muzzle) { k.tag('muzzle'); front += muzzle(k, o.muzzle, front, 0.0085, 0); }
    k.tag('optic');
    // (irons at the two ends of the housing's rail; anything else in the middle of it)
    const sight = ['irons', 'notch', undefined].includes(o.optic) ? S.irons(k, F(440), F(210), top + 0.034, top, top, o.irons || 'ar') : sightOf(k, o, top, F(167), bl, 0.0085, front, F(325));
    k.tag('base');
    return { sy: sight.sy, fSight: sight.fSight, relief: sight.relief, muzzles: [[front, 0, 0]], grip: [F(468), Y(425), 0], support: [F(300), Y(445), 0], anim: { mag: magP, handle: hp }, handle,
      magAt: [m0 + 0.08, my], magTop: true, chamberAt: { side: 'right', f: F(780), y: Y(275), x: 0.028 } };
  }

  const ARCH = { rifle, pistol, revolver, derringer, minigun, launcher, railgun, crossbow, p90 };
  // Material names in a model spec ('tan', 'woodDark') become materials.
  const MAT_KEYS = new Set(['rm', 'fm', 'sm', 'gm', 'm', 'well', 'vfgM']);
  function resolveMats(o) {
    if (!o || typeof o !== 'object') return o;
    for (const [key, v] of Object.entries(o)) {
      if (typeof v === 'string' && MAT_KEYS.has(key)) o[key] = M[v] ? M[v]() : null;
      else if (v && typeof v === 'object' && !Array.isArray(v)) resolveMats(v);
    }
    return o;
  }

  function build(k, def) {
    const plat = G.Gunsmith.PLATFORMS[def.id];
    const spec = resolveMats(G.Gunsmith.modelSpec(def));
    if (spec.mag && typeof spec.mag === 'object') { spec.mag.rnd = roundDims(def); if (spec.mag.rnd) spec.mag.rnd.cap = def.mag; } // (the cartridges a clear magazine shows, as many as it holds)
    const info = (ARCH[plat.arch] || rifle)(k, spec);
    k.tag('base');
    info.anim = info.anim || {};
    return info;
  }

  // ---------------------------------------------------------------- muzzle flash sprite
  function flashMesh(color) {
    const m = new T.Mesh(new T.PlaneGeometry(0.2, 0.2), new T.MeshBasicMaterial({ map: G.R.flashTexture(), transparent: true, blending: T.AdditiveBlending, depthWrite: false, color }));
    m.visible = false;
    return m;
  }

  // ---------------------------------------------------------------- first-person viewmodel
  // Arms: a sleeve from just off-screen to each hand anchor, ending in a glove.
  function arm(g, hand, dir, len) {
    const d = new T.Vector3(...dir).normalize();
    const sleeve = new T.Mesh(new T.CylinderGeometry(0.026, 0.034, len, 10), M.fabric());
    sleeve.quaternion.setFromUnitVectors(new T.Vector3(0, 1, 0), d);
    sleeve.position.set(hand[0] + d.x * (len / 2 + 0.03), hand[1] + d.y * (len / 2 + 0.03), hand[2] + d.z * (len / 2 + 0.03));
    g.add(sleeve);
    const glove = new T.Mesh(new T.BoxGeometry(0.042, 0.045, 0.08), M.glove());
    glove.position.set(hand[0], hand[1], hand[2]);
    glove.quaternion.copy(sleeve.quaternion).multiply(new T.Quaternion().setFromAxisAngle(new T.Vector3(1, 0, 0), Math.PI / 2));
    g.add(glove);
  }
  // ---------------------------------------------------------------- reflex reticles
  // A reflex sight's reticle is collimated: it sits at infinity along the sight's axis, so it points where the
  // gun points, not where the glass is, and you only see it through the window. It's drawn as a glowing plane
  // a few metres down the axis, masked by the stencil to the sight's window (the window mesh writes 1; hands
  // or the housing in front of the window keep it at 0).
  const RETICLE_D = 6;
  const texCache = {};
  function reticleTex(kind) {
    if (texCache[kind]) return texCache[kind];
    const N = kind === 'holo' || kind === 'cdot' ? 256 : 128, c = document.createElement('canvas');
    c.width = c.height = N;
    const g = c.getContext('2d'), m = N / 2;
    if (kind === 'holo') {
      // 68 MOA ring with tick marks and a centre dot, laser-red, with the grain of a hologram
      g.shadowColor = 'rgba(255,40,25,1)'; g.shadowBlur = 7;
      g.strokeStyle = 'rgba(255,95,75,1)'; g.lineWidth = 4;
      g.beginPath(); g.arc(m, m, 100, 0, Math.PI * 2); g.stroke();
      g.lineWidth = 5;
      for (let i = 0; i < 4; i++) { const a = (i * Math.PI) / 2; g.beginPath(); g.moveTo(m + Math.cos(a) * 100, m + Math.sin(a) * 100); g.lineTo(m + Math.cos(a) * 84, m + Math.sin(a) * 84); g.stroke(); }
      g.fillStyle = 'rgba(255,225,215,1)'; g.beginPath(); g.arc(m, m, 8, 0, Math.PI * 2); g.fill();
      const img = g.getImageData(0, 0, N, N), d = img.data;
      for (let i = 3; i < d.length; i += 4) d[i] *= 0.62 + Math.random() * 0.38;
      g.putImageData(img, 0, 0);
    } else if (kind === 'cdot') {
      // a 65 MOA circle round a 2 MOA dot: a clean LED ring
      g.shadowColor = 'rgba(255,40,25,1)'; g.shadowBlur = 6;
      g.strokeStyle = 'rgba(255,90,70,1)'; g.lineWidth = 4;
      g.beginPath(); g.arc(m, m, 98, 0, Math.PI * 2); g.stroke();
      g.fillStyle = 'rgba(255,225,215,1)'; g.beginPath(); g.arc(m, m, 7, 0, Math.PI * 2); g.fill();
    } else {
      // an LED dot: a hot near-white core bleeding to red (or green), with a soft halo
      const grn = kind === 'dotG', c1 = grn ? 'rgba(235,255,235,1)' : 'rgba(255,245,240,1)', c2 = grn ? 'rgba(110,255,120,1)' : 'rgba(255,120,100,1)';
      const c3 = grn ? 'rgba(40,255,60,0.75)' : 'rgba(255,45,30,0.75)', c4 = grn ? 'rgba(20,255,40,0.16)' : 'rgba(255,25,15,0.16)';
      const grd = g.createRadialGradient(m, m, 0, m, m, m);
      grd.addColorStop(0, c1); grd.addColorStop(0.16, c2); grd.addColorStop(0.26, c3);
      grd.addColorStop(0.45, c4); grd.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = grd; g.fillRect(0, 0, N, N);
    }
    const t = new T.CanvasTexture(c);
    t.minFilter = T.LinearMipmapLinearFilter;
    return (texCache[kind] = t);
  }
  // angular size (radians) of the whole reticle texture: dot core about 3.5 mrad, holo ring 50 mrad across
  const RETICLE_RAD = { dot: 0.028, dotG: 0.028, holo: 0.064, cdot: 0.062 };
  function reflex(k, o) {
    const mask = new T.Mesh(o.round ? new T.CircleGeometry(o.w / 2, 28) : new T.PlaneGeometry(o.w, o.h), new T.MeshBasicMaterial({
      colorWrite: false, depthWrite: false, transparent: true, side: T.DoubleSide,
      stencilWrite: true, stencilRef: 1, stencilFunc: T.AlwaysStencilFunc, stencilZPass: T.ReplaceStencilOp,
    }));
    mask.position.set(0, o.y, -o.f);
    mask.renderOrder = 20;
    k.g.add(mask);
    const size = RETICLE_D * RETICLE_RAD[o.kind];
    const ret = new T.Mesh(new T.PlaneGeometry(size, size), new T.MeshBasicMaterial({
      map: reticleTex(o.kind), transparent: true, blending: T.AdditiveBlending, depthTest: false, depthWrite: false,
      stencilWrite: true, stencilRef: 1, stencilFunc: T.EqualStencilFunc, stencilFail: T.KeepStencilOp, stencilZFail: T.KeepStencilOp, stencilZPass: T.KeepStencilOp,
    }));
    ret.position.set(0, o.y, -(o.f + RETICLE_D));
    ret.renderOrder = 21;
    ret.frustumCulled = false;
    k.g.add(ret);
  }

  // ---------------------------------------------------------------- picture-in-picture scopes
  // The ocular lens shows the world through the scope: G.R renders the scene from the lens along the scope's
  // axis with a field of view set by the magnification, into a texture this disk shows. The reticle is drawn
  // over it, and a dark crescent creeps in when your eye is off the scope's axis (the eyebox).
  // (dot, dotG, cdot and holo: a reflex sight's own reticle, seen through a magnifier)
  const PIP_RETICLE = { cross: 0, chevron: 1, lpvo: 2, dot: 3, dotG: 3, cdot: 4, holo: 4, ring: 5 };
  const PIP_ILLUM = { ring: 0x000000, cross: 0x000000, chevron: 0xff9a18, lpvo: 0xff2a20, dot: 0xff2a20, dotG: 0x30ff50, cdot: 0xff2a20, holo: 0xff2a20 };
  const PIP_VS = 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }';
  const PIP_FS = G.R.TONE + `
    uniform sampler2D map; uniform float live; uniform vec2 eye; uniform int ret; uniform vec3 illum;
    varying vec2 vUv;
    float seg(vec2 p, vec2 a, vec2 b) { vec2 pa = p - a, ba = b - a; float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0); return length(pa - ba * h); }
    float ink(float d, float w) { float aa = fwidth(d) * 0.75; return 1.0 - smoothstep(w - aa, w + aa, d); }
    void main() {
      vec2 p = vUv * 2.0 - 1.0; float r = length(p);
      vec3 img = bpTone(texture2D(map, vUv).rgb); // (the scene through it, rolled off as the screen's is: js/render.js)
      float black = 0.0, glow = 0.0;
      if (ret == 0) { // duplex crosshair: fine wires in the middle, heavy posts outside
        float tw = abs(p.x) > 0.42 ? 0.026 : 0.0045, th = abs(p.y) > 0.42 ? 0.026 : 0.0045;
        black = max(ink(abs(p.y), tw), ink(abs(p.x), th));
      } else if (ret == 1) { // illuminated chevron over a bullet-drop post
        glow = max(ink(seg(p, vec2(0.0), vec2(-0.085, -0.1)), 0.011), ink(seg(p, vec2(0.0), vec2(0.085, -0.1)), 0.011));
        black = ink(seg(p, vec2(0.0, -0.15), vec2(0.0, -0.78)), 0.005);
        for (int i = 1; i < 5; i++) { float y = -0.15 - float(i) * 0.13, w = 0.075 - float(i) * 0.012; black = max(black, ink(seg(p, vec2(-w, y), vec2(w, y)), 0.0045)); }
      } else if (ret == 3) { // a red dot, magnified
        glow = ink(r, 0.035);
      } else if (ret == 4) { // a holographic or circle-dot ring, magnified
        glow = max(ink(abs(r - 0.42), 0.012), ink(r, 0.03));
      } else if (ret == 5) { // the AUG's: a black ring, the target in it (its size: a man at 300 m)
        black = ink(abs(r - 0.13), 0.012);
      } else { // illuminated circle-dot with a gapped crosshair
        glow = max(ink(abs(r - 0.2), 0.006), ink(r, 0.018));
        float tw = abs(p.x) > 0.55 ? 0.022 : 0.0035, th = abs(p.y) > 0.55 ? 0.022 : 0.0035;
        black = max(ink(abs(p.y), tw), ink(abs(p.x), th)) * step(0.3, max(abs(p.x), abs(p.y)));
      }
      vec3 col = img * (1.0 - black * 0.94) + illum * glow * 1.5;
      col *= (1.0 - smoothstep(0.7, 1.0, length(p - eye))) * smoothstep(1.0, 0.9, r);
      vec3 glass = vec3(0.025, 0.04, 0.055) + vec3(0.1, 0.12, 0.18) * pow(max(0.0, 1.0 - length(p - vec2(-0.35, 0.4))), 3.0);
      glass = pow(glass, vec3(2.2)); // (sRGB, as written: to linear)
      gl_FragColor = linearToOutputTexel(vec4(mix(glass, col, live), 1.0));
    }`;
  function pipLens(k, o, def) {
    const reticle = def.reticle || 'cross';
    const mat = new T.ShaderMaterial({
      uniforms: { map: { value: G.R.pipTexture() }, live: { value: 0 }, eye: { value: new T.Vector2() }, ret: { value: PIP_RETICLE[reticle] || 0 }, illum: { value: new T.Color(PIP_ILLUM[reticle] || 0) } },
      vertexShader: PIP_VS, fragmentShader: PIP_FS, extensions: { derivatives: true }, toneMapped: false, // (it rolls off the picture itself: bpTone)
    });
    const disk = new T.Mesh(new T.CircleGeometry(o.r, 48), mat);
    if (o.parent) { disk.position.copy(o.pos); o.parent.add(disk); } // (a magnifier's lens swings with it)
    else { disk.position.set(0, o.y, -o.f); k.g.add(disk); }
    return { disk, r: o.r, mat, mag: def.magnif || 4 };
  }

  // (skin: the gun's stickers, js/stickers.js: on its parts as built, before the arms go on)
  function viewmodel(def, skin) {
    const root = new T.Group();
    const guns = def.akimbo ? [-1, 1] : [1];
    let info0 = null, pip = null;
    const flashes = [], holders = [];
    for (const side of guns) {
      const k = kit();
      buildingVM = true;
      let info;
      try { info = build(k, def); } finally { buildingVM = false; }
      if (skin && skin.length) G.Stickers.decorate(k.g, skin);
      if (k.reflex) reflex(k, k.reflex);
      if (k.pip && !pip) pip = pipLens(k, k.pip, def);
      if (!info0) info0 = info;
      const holder = new T.Group();
      holder.add(k.g);
      if (def.akimbo) holder.position.x = side * 0.13;
      holders.push({ holder, info, side });
      for (const [f, y, x] of info.muzzles) {
        const fl = flashMesh(def.tracer || 0xffc070);
        fl.position.set(x, y, -f - 0.04);
        holder.add(fl);
        flashes.push(fl);
      }
      root.add(holder);
    }
    const info = info0;
    // Aim-down-sights puts the sight's rear at eye-relief distance straight ahead of the camera.
    // where your eye is along the gun when you aim: the sight's eye relief behind it, or (a bullpup, info.cheek) your
    // cheek on the stock's comb, the sight wherever it is on the rail in front of it
    const adsZ = info.cheek != null && info.cheek <= info.fSight - 0.03 ? info.cheek : info.fSight - info.relief;
    const ads = def.akimbo ? new T.Vector3(0, -0.12, -0.36) : new T.Vector3(0, -info.sy, adsZ);
    // hip: lower-right and well forward of the eye, so the optic doesn't fill the screen
    const hip = def.akimbo ? new T.Vector3(0, -0.15, -0.34) : info.pistol ? new T.Vector3(0.1, -0.1 - info.sy, -0.32) : new T.Vector3(0.1, -0.1 - info.sy * 0.6, adsZ - 0.1);
    root.userData = { flash: flashes[0], flashes, sightY: info.sy, hip, ads, anim: info.anim, info, holders, pip };
    G.VMAnim.prepare(root, def); // arms, reload and inspect animation (js/vmanim.js)
    return root;
  }

  // ---------------------------------------------------------------- third-person world model (merged, cached)
  const worldCache = new Map();
  function merge(group) {
    group.updateMatrixWorld(true);
    const byMat = new Map();
    group.traverse((o) => {
      if (!o.isMesh) return;
      const geo = (o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone());
      geo.applyMatrix4(o.matrixWorld);
      for (const name of Object.keys(geo.attributes)) if (name !== 'position' && name !== 'normal') geo.deleteAttribute(name);
      if (!byMat.has(o.material)) byMat.set(o.material, []);
      byMat.get(o.material).push(geo);
    });
    const out = [];
    for (const [material, geos] of byMat) {
      let n = 0;
      geos.forEach((gg) => (n += gg.attributes.position.count));
      const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3);
      let off = 0;
      for (const gg of geos) { pos.set(gg.attributes.position.array, off * 3); nor.set(gg.attributes.normal.array, off * 3); off += gg.attributes.position.count; gg.dispose(); }
      const bg = new T.BufferGeometry();
      bg.setAttribute('position', new T.BufferAttribute(pos, 3));
      bg.setAttribute('normal', new T.BufferAttribute(nor, 3));
      bg.computeBoundingSphere();
      out.push({ geometry: bg, material });
    }
    group.traverse((o) => o.geometry && o.geometry.dispose());
    return out;
  }
  // (its magazine merged on its own, centred on itself, so a rig can take it off the gun and hold it: a reload,
  // a magazine check. g.userData.mag: the magazine's group; magHome: where it sits on the gun.)
  // (skin: its stickers, js/stickers.js, on this one: the cached model's shared)
  function world(def, skin) {
    if (typeof def === 'string') def = G.Gunsmith.fromCode(def);
    let proto = worldCache.get(def.code);
    if (!proto) {
      const k = kit();
      const info = build(k, def);
      let mag = null;
      const mn = info.anim && info.anim.mag;
      if (mn && mn.parent && !info.magTop) {
        k.g.updateMatrixWorld(true);
        const mw = mn.matrixWorld.clone(), solo = new T.Group();
        mn.parent.remove(mn);
        solo.add(mn); mw.decompose(mn.position, mn.quaternion, mn.scale);
        const meshes = merge(solo), box = new T.Box3();
        for (const m of meshes) { m.geometry.computeBoundingBox(); box.union(m.geometry.boundingBox); }
        const c = box.getCenter(new T.Vector3());
        for (const m of meshes) m.geometry.translate(-c.x, -c.y, -c.z);
        mag = { meshes, home: c };
      }
      // (a crossbow's bolt and its two strings, kept as groups of their own: the bolt's gone once it's shot, the string's
      // forward until it's cocked. Merged on their own, each in place; setLoaded)
      const xb = {};
      k.g.updateMatrixWorld(true);
      for (const [key, name] of [['bolt', 'quarrel'], ['cocked', 'stringCocked'], ['slack', 'stringSlack']]) {
        const n = info.anim && info.anim[name];
        if (!n || !n.parent) continue;
        const solo = new T.Group();
        n.parent.remove(n); solo.add(n); n.visible = true;
        xb[key] = merge(solo);
      }
      proto = { meshes: merge(k.g), info, mag, xb: xb.bolt ? xb : null };
      worldCache.set(def.code, proto);
    }
    const g = new T.Group();
    for (const m of proto.meshes) g.add(new T.Mesh(m.geometry, m.material));
    if (proto.mag) {
      const mg = new T.Group();
      for (const m of proto.mag.meshes) mg.add(new T.Mesh(m.geometry, m.material));
      mg.position.copy(proto.mag.home);
      g.add(mg);
      g.userData.mag = mg; g.userData.magHome = proto.mag.home;
    }
    if (proto.xb) {
      g.userData.xb = {};
      for (const [key, list] of Object.entries(proto.xb)) {
        const sub = new T.Group();
        for (const m of list) sub.add(new T.Mesh(m.geometry, m.material));
        g.add(sub); g.userData.xb[key] = sub;
      }
      g.userData.xb.slack.visible = false;
    }
    g.userData.info = proto.info;
    if (skin && skin.length) G.Stickers.decorate(g, skin);
    return g;
  }
  // A world model's crossbow: whether its bolt's on the rail (bolt) and its string's cocked (cocked: back at the latch).
  // Other guns have no such parts. A bolt that's on the rail is always on a cocked string.
  function setLoaded(g, bolt, cocked) {
    const x = g && g.userData.xb;
    if (!x) return;
    if (cocked == null) cocked = bolt;
    x.bolt.visible = !!bolt; x.cocked.visible = !!cocked; x.slack.visible = !cocked;
  }

  // the gunsmith's display model: every part as separate meshes (tagged by slot), stock included
  function display(def, skin) { const k = kit(); const info = build(k, def); if (skin && skin.length) G.Stickers.decorate(k.g, skin); return { group: k.g, info }; }

  return { M, build, viewmodel, world, display, roundDims, setLoaded, quarrel };
})();
