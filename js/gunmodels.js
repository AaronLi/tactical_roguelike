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
        const geo = new T.ExtrudeGeometry(shape, { depth, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 1, curveSegments: 4 });
        geo.rotateY(Math.PI / 2);
        geo.translate(x - depth / 2, 0, 0);
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
    pistolSights(k, fR, fF, sy, base, night) {
      const B = M.black(), paint = night ? M.tritium() : M.sightPaint(), nw = 0.0019, nd = 0.0035, hw = 0.0105, h = sy - base;
      for (const x of [-1, 1]) k.box(hw - nw, h, 0.008, B, fR - 0.004, base + h / 2, x * (nw + (hw - nw) / 2));
      k.box(2 * nw, h - nd, 0.008, B, fR - 0.004, base + (h - nd) / 2);
      if (night) for (const x of [-1, 1]) k.cyl(0.0011, 0.0006, paint, fR - 0.0046, sy - 0.0021, x * (nw + 0.0032));
      else {
        for (const x of [-1, 1]) k.box(0.0007, nd, 0.0006, paint, fR - 0.0046, sy - nd / 2, x * (nw + 0.00035));
        k.box(2 * nw + 0.0014, 0.0007, 0.0006, paint, fR - 0.0046, sy - nd - 0.00035);
      }
      k.box(0.0034, h, 0.007, B, fF - 0.0035, base + h / 2);
      k.cyl(night ? 0.0011 : 0.0012, 0.0006, paint, fF - 0.0041, sy - 0.0019);
      return { sy, fSight: fR - 0.004, relief: 0.36 };
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
      case 'folded': // folded along the left side
        k.prof([[0.02, 0.01], [0.24, 0.01], [0.24, -0.03], [0.02, -0.03]], 0.008, m, -0.026, [[[0.05, 0.0], [0.21, 0.0], [0.21, -0.02], [0.05, -0.02]]]);
        break;
    }
  }
  // What you see checking a magazine: the round on top, and down the back a column of witness holes showing brass
  // as far as it's loaded (in a clear magazine, the rounds themselves). rear(t): the back edge's f at depth t (0 at
  // the top, 1 at the floorplate); top: its top y; len, w, d: its size. js/vmanim.js shows them for the real count.
  function magCheck(k, rear, top, len, w, d, clear) {
    const chk = { holes: [], rounds: [], w }, r = Math.min(0.0045, w * 0.2), yAt = (t) => top - 0.012 - t * (len - 0.026), cl = d * 0.5;
    // the feed lips, and the top round sitting down between them (its crown just under their edges)
    for (const s of [-1, 1]) k.box(w * 0.16, 0.003, d * 0.6, M.black(), rear(0) + 0.004, top + 0.0015, s * w * 0.42);
    const ty = top - r + 0.0024;
    chk.top = [k.cyl(r, cl, M.brass(), rear(0) + 0.006, ty), k.cyl(r, d * 0.2, M.brass(), rear(0) + 0.006 + cl, ty, 0, 0.0015, 10)];
    if (clear) for (let j = 1; j <= 9; j++) { // each with its own tip (or, a shotgun's, its hull coloured): js/vmanim.js magFill
      const t = j / 10, x = (j % 2 ? 1 : -1) * w * 0.12;
      chk.rounds.push({ t, mesh: k.cyl(r * 0.92, d * 0.46, M.brass(), rear(t) + 0.009, yAt(t), x, r * 0.92, 8), tip: k.cyl(r * 0.88, d * 0.16, M.brass(), rear(t) + 0.009 + d * 0.46, yAt(t), x, 0.0012, 8) });
    }
    else for (let i = 1; i <= 5; i++) { const t = (i / 6) * 0.94; chk.holes.push({ t, mesh: k.box(w * 0.22, 0.0055, 0.0025, M.brass(), rear(t) - 0.0035, yAt(t), -w * 0.27) }); }
    return chk;
  }
  // Magazines hang from y (the receiver's underside) at forward position f.
  function mag(k, o) {
    const m = o.m || M.black(), y = o.y, len = o.len || 0.18, d = o.d || 0.06, w = o.w || 0.024;
    if (o.well) k.box(w + 0.01, 0.014, d + 0.016, o.well, o.f - d / 2 - 0.008, y - 0.006);
    switch (o.t) {
      case 'curved': {
        const c = o.c || 0.05, N = 8, front = [], rear = [];
        for (let i = 0; i <= N; i++) {
          const t = i / N, dy = y - len * t, sh = c * t * t;
          front.push([o.f + d / 2 + sh, dy]); rear.push([o.f - d / 2 + sh * 0.85, dy]);
        }
        k.prof(front.concat(rear.reverse()), w, m);
        k.box(w + 0.004, 0.008, d + 0.006, m, o.f - d / 2 + c - 0.003, y - len - 0.002);
        return magCheck(k, (t) => o.f - d / 2 + c * t * t * 0.85, y, len, w, d, m.transparent);
      }
      case 'straight': {
        const rk = o.rake || 0.012;
        k.prof([[o.f - d / 2, y], [o.f + d / 2, y], [o.f + d / 2 + rk, y - len], [o.f - d / 2 + rk, y - len]], w, m);
        k.box(w + 0.004, 0.008, d + 0.004, m, o.f - d / 2 + rk - 0.002, y - len - 0.002);
        return magCheck(k, (t) => o.f - d / 2 + rk * t, y, len, w, d, m.transparent);
      }
      case 'pistol': { // a pistol magazine in a carbine's well adapter (the Glock-mag conversions)
        const pd = 0.032, pw = 0.022, pl = len * 0.85;
        k.box(pw + 0.012, 0.03, pd + 0.014, M.black(), o.f - pd / 2 - 0.007, y - 0.01);
        k.prof([[o.f - pd / 2, y], [o.f + pd / 2, y], [o.f + pd / 2 + 0.006, y - pl], [o.f - pd / 2 + 0.006, y - pl]], pw, m);
        k.box(pw + 0.004, 0.01, pd + 0.006, m, o.f - pd / 2 + 0.004, y - pl - 0.003);
        return magCheck(k, (t) => o.f - pd / 2 + 0.006 * t, y, pl, pw, pd, m.transparent);
      }
      case 'drum': { // the round face toward the shooter, its axis along the bore
        const R = o.r || 0.075, dw = o.dw || 0.05;
        k.box(w, 0.03, d * 0.7, m, o.f - d * 0.35, y - 0.012);
        k.cyl(R, dw, m, o.f - dw / 2, y - R * 0.95, 0, R, 24);
        k.cyl(R * 0.35, dw + 0.006, M.steel(), o.f - dw / 2 - 0.003, y - R * 0.95);
        break;
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
    else if (st === 'top') { k.cylY(0.004, 0.014, St, h.f, h.y + 0.007, h.x); k.box(0.012, 0.009, 0.014, B, h.f - 0.007, h.y + 0.017, h.x); h.grab = [h.f, h.y + 0.032, h.x]; }
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
  function rifle(k, o) {
    const L = o.L || 0.26, rm = o.rm || M.black(), fm = o.fm || M.polymer(), bull = o.rcv === 'bullpup';
    const gf = o.grip != null ? o.grip : bull ? L * 0.62 : 0.045;
    const anim = {};
    let top;
    const rcv = o.rcv || 'ar';
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
      k.prof([[0, -H * 0.55], [0, H * 0.45], [L, H * 0.45], [L, -H * 0.55]], Wd, rm);
      top = H * 0.45;
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
    } else if (rcv === 'break') {
      // the action: the barrels hinge at its front (L), so it's as long as the receiver
      k.prof([[0, -0.04], [0, 0.012], [L, 0.012], [L, -0.04]], 0.044, o.rm || M.steel());
      top = 0.012;
    }
    triggerGuard(k, gf, rm);
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
    if (o.gripT !== 'none') grip(k, gf, o.gm || fm, o.gripT || (rcv === 'ak' ? 'wood' : 'ar'));
    k.tag('stock');
    if (!bull && o.stock) stock(k, o.stock, o.sm || fm, o.gripT === 'none');
    k.tag('mag');
    let magAt = null;
    if (o.mag && o.mag.t !== 'internal') {
      const mo = Object.assign({ f: bull ? L * 0.22 : gf + 0.078, y: rcv === 'ak' ? -0.046 : rcv === 'box' ? -(o.H || 0.085) * 0.55 : -0.042 }, o.mag);
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
    const brk = rcv === 'break' ? k.part(L, -0.035) : null;
    if (brk) { k.into(brk, L, -0.035); anim.brk = brk; }
    if (o.integral) {
      k.cyl(o.integral.r, o.integral.len, M.black(), L, by);
      for (let i = 0; i < 3; i++) k.ringZ(o.integral.r, 0.0012, M.rubber(), L + 0.03 + i * o.integral.len * 0.3, by);
      front = L + o.integral.len;
    } else {
      if (o.barrels) for (const x of o.barrels) k.cyl(br, bl, b.m || M.blued(), L, by, x);
      else k.cyl(br, bl, b.m || M.blued(), L, by, 0, br * (b.taper || 1), 14);
      front = L + bl;
    }
    let hgLen = 0;
    if (o.hg) {
      k.tag('handguard');
      const hg = Object.assign({}, o.hg, o.barrels ? { under: true } : {});
      if (hg.t !== 'stockfore') hg.len = Math.max(0.06, Math.min(hg.len, (o.integral ? o.integral.len : bl) - 0.015));
      hgLen = hg.len;
      handguard(k, hg, L, fm, rm);
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
    if (o.fg && hgLen) { k.tag('fg'); fgF = L + Math.min(hgLen * 0.35, 0.09, hgLen - 0.04); foregrip(k, o.fg, fgF, fm); } // (near the rail's back: the support arm bent, the gun out in front)
    // a clamp-on rail mount: a collar round the barrel (or the can), in front of any jacket, a short rail on one side or both
    let tacAt = hgLen && !o.pump ? { f: L + hgLen - 0.01, y: 0, x: 0.024 } : o.siderails ? { f: L - 0.02, y: -0.006, x: 0.029 } : null;
    if (o.railmount) {
      k.tag('railmount');
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

    // sights
    k.tag('optic');
    const ofs = o.optF != null ? o.optF : bull ? L * 0.65 : L * 0.5;
    // (a break-action's bead and rib are on its barrels, so they tip open with them)
    const onBarrels = brk && (o.optic || 'irons') === 'bead';
    if (onBarrels) k.into(brk, L, -0.035);
    let sight = sightOf(k, o, top, L, o.integral ? o.integral.len : bl, br, front, ofs);
    if (onBarrels) k.into(null);
    if (o.magnifier && k.reflex) { k.tag('magnifier'); sight = S.magnifier(k, sight, top, o.magnifier, anim); }
    k.tag('base');
    const support = o.support != null ? o.support : o.pump ? L + o.pump.f + o.pump.len * 0.5 : fgF != null && o.fg !== 'bipod' ? fgF : o.vfg != null ? L + o.vfg : bull ? L + 0.07 : L + (hgLen ? Math.min(hgLen * 0.15, 0.04) : 0.03); // (a plain handguard: held near its back, the arm bent, not out at full stretch)
    // where the hands go for reloads and racking (gun space: [forward, up, right])
    const port = o.bolt ? [o.bolt - 0.02, top - 0.004, 0] : o.lever ? [L * 0.55, 0.0, 0.02] : o.pump || o.tube ? [L * 0.62, -0.042, 0] : rcv === 'break' ? [L, 0.0, 0] : [L * 0.5, top, 0];
    // where a chamber check shows the round: through the ejection port on the right (js/vmanim.js), or for a
    // break-action, the shell heads in the breech
    const hw = { ar: 0.0178, ak: 0.022, box: (o.W || 0.045) / 2, round: 0.018, bullpup: 0.023 }[rcv] || 0.018;
    const chamberAt = rcv === 'break' ? { side: 'breech', heads: (o.barrels || [0]).map((x) => [x, by + 0.035]), z: -0.0005, r: br } // (in the barrels' hinge frame)
      : o.bolt ? { side: 'top', f: o.bolt - 0.05, y: rcv === 'round' ? top - 0.0015 : top, x: rcv === 'round' ? 0.006 : 0.011, w: 0.024 } // (a bolt gun's port is its open top, to the right of a scope's line, above the stock)
      : { side: 'right', f: o.lever ? L * 0.55 : magAt ? magAt[0] + 0.005 : !o.pump && handle && handle.x > 0 ? handle.f + 0.026 : o.pump || o.tube ? L * 0.55 : L * 0.5, y: by, x: hw };
    return {
      sy: sight.sy, fSight: sight.fSight, relief: sight.relief,
      muzzles: [[front, by, 0]],
      grip: [gf + 0.005, -0.075, 0], support: [support, o.pump ? -0.03 : -0.028, 0],
      anim, magAt, handle, port, chamberAt, ch: (rcv === 'ar' && !o.cock) || o.ch ? [-0.006, 0.026, 0] : null, bolt: o.bolt ? [o.bolt, 0.01, 0.068] : null,
    };
  }

  function pistol(k, o) {
    const sl = o.slide || {}, len = sl.len || 0.19, w = sl.w || 0.026, sm = sl.sm || M.black(), fm = o.fm || M.polymer(), gm = o.gm || fm;
    const anim = {};
    k.tag('slide');
    const slide = k.part();
    k.into(slide);
    // the slide, with its ejection port: a cut out of the right half of its top, over the chamber (forward of where
    // a pistol dot sits), so a press-check shows the round in the barrel
    const pc = len * 0.44, p0 = pc - 0.016, p1 = pc + 0.016, sy = 0.016;
    k.prof([[0, 0.002], [0, sy], [len, sy], [len, 0.002]], w, sm, 0, null, 0.001);
    // (the TX22, o.tx: a steep bevel down the front of the slide, deep slanted serrations at both ends)
    const nose = o.tx ? 0.022 : 0.012, noseY = o.tx ? 0.017 : 0.02;
    k.prof([[0, sy], [0, 0.026], [len - nose, 0.026], [len, noseY], [len, sy]], w / 2, sm, -w / 4, null, 0.001);
    k.prof([[0, sy], [0, 0.026], [p0, 0.026], [p0, sy]], w / 2, sm, w / 4, null, 0.001);
    k.prof([[p1, sy], [p1, 0.026], [len - nose, 0.026], [len, noseY], [len, sy]], w / 2, sm, w / 4, null, 0.001);
    if (o.tx) for (const [f0, n] of [[0.006, 7], [len * 0.72, 5]]) for (let i = 0; i < n; i++) k.box(w + 0.0012, 0.019, 0.0022, M.gunmetal(), f0 + i * 0.0058, 0.0155).rotation.x = -0.42; // (raked forward at the top)
    else for (let i = 0; i < 5; i++) k.box(w + 0.001, 0.016, 0.0025, M.rubber(), 0.01 + i * 0.006, 0.014);
    if (sl.vent) for (let i = 0; i < 4; i++) { const vf = len * 0.45 + i * 0.022; if (vf + 0.012 > p0 - 0.002 && vf < p1 + 0.002) continue; k.box(w + 0.002, 0.006, 0.012, M.rubber(), vf, 0.024); } // (none over the port)
    k.into(null);
    anim.slide = slide;
    k.box(w / 2 - 0.002, 0.0015, p1 - p0, M.rubber(), p0, sy + 0.0008, w / 4); // (the barrel hood under it: the barrel's, so it stays put)
    let front = len;
    if (sl.comp) { k.box(w, 0.026, 0.03, sm, len, 0.014); front += 0.03; }
    k.tag('base');
    if (o.tx) { // the TX22's frame: its dust cover runs right out under the muzzle, railed underneath; a squared-off trigger guard
      k.prof([[0.004, 0.002], [len * 0.99, 0.002], [len * 0.99, -0.015], [0.085, -0.015], [0.07, -0.013], [0.004, -0.012]], w - 0.002, fm);
      for (let i = 0; i < 3; i++) k.box(w - 0.006, 0.003, 0.006, M.rubber(), len * 0.62 + i * 0.012, -0.0155);
      k.prof([[0.03, -0.012], [0.088, -0.012], [0.09, -0.017], [0.083, -0.037], [0.038, -0.037], [0.03, -0.03]], 0.011, fm, 0, [[[0.037, -0.016], [0.081, -0.016], [0.078, -0.032], [0.042, -0.032], [0.037, -0.027]]]);
      k.box(0.006, 0.008, 0.012, fm, 0.006, 0.0, 0); // (the takedown ledge over the grip)
    } else {
      k.prof([[0.004, 0.002], [len * 0.92, 0.002], [len * 0.92, -0.014], [0.07, -0.016], [0.05, -0.012], [0.004, -0.012]], w - 0.002, fm);
      k.ringX(0.016, 0.0025, fm, 0.055, -0.016, 0, Math.PI, Math.PI);
    }
    k.box(0.004, 0.016, 0.005, M.black(), 0.05, -0.016);
    if (o.hammer) k.box(0.008, 0.014, 0.008, M.blued(), -0.008, 0.022);
    k.tag('grip');
    if (o.tx) { // raked hard back, a flared base round the magazine well, stippled panels each side
      k.prof([[-0.006, -0.004], [0.04, -0.004], [0.021, -0.108], [0.025, -0.119], [-0.038, -0.119], [-0.031, -0.104]], 0.03, gm);
      for (const x of [-0.0152, 0.0152]) k.prof([[0.0, -0.022], [0.03, -0.022], [0.016, -0.094], [-0.024, -0.092]], 0.0016, M.rubber(), x, null, 0.0003);
    } else k.prof([[-0.004, -0.004], [0.04, -0.004], [0.028, -0.115], [-0.018, -0.108]], 0.03, gm);
    if (o.stock) { // a shoulder stock clipped to the back of the frame
      k.tag('stock');
      const sp = k.part(-0.006, -0.03);
      k.into(sp);
      stock(k, o.stock, o.sm || M.black(), true); // (true: shown in first person too: a brace rides along your forearm, in view)
      k.into(null);
    }
    k.tag('mag');
    const mg = o.mag || {};
    const magP = k.part(0.012, -0.004);
    k.into(magP, 0.012, -0.004);
    k.prof([[0.0, -0.006], [0.03, -0.006], [0.02, -0.108], [-0.012, -0.102]], 0.02, M.black());
    const ext = mg.t === 'drum' ? 2 : (mg.len || 0.15) > 0.16 ? 1 : (mg.len || 0.15) < 0.12 ? -1 : o.ext ? 1 : 0;
    if (ext === 1) { // a long magazine: the part out of the grip as long as it really is (a 33-rounder ~11 cm), its floorplate on the end
      const out = G.U.clamp((mg.len || 0.15) - 0.13, 0.03, 0.14) || 0.05, rake = 0.107; // (raked back with the grip)
      k.box(0.021, out + 0.01, 0.028, M.black(), -rake * out / 2, -0.096 - out / 2).rotation.x = -rake; // (f runs along -z: tilting the bottom back is a negative turn)
      k.box(0.024, 0.008, 0.033, M.black(), -0.002 - rake * out, -0.1 - out).rotation.x = -rake;
    }
    else if (ext === 2) { k.box(0.022, 0.03, 0.03, M.black(), 0.0, -0.118); k.cyl(0.045, 0.034, M.black(), -0.002, -0.16, 0, 0.045, 20); } // (a drum, face toward the shooter)
    else if (ext === 0) k.box(0.026, 0.008, 0.032, M.black(), -0.006, -0.112);
    magP.userData.chk = magCheck(k, (t) => -0.012 * t, -0.006, 0.096, 0.02, 0.03, false);
    k.into(null);
    anim.mag = magP;
    k.tag('barrel');
    k.cyl(0.0065, 0.01, M.rubber(), len - 0.009, 0.009);
    if (o.match && !sl.comp) { k.cyl(0.0068, 0.012, M.steel(), len, 0.009); front += 0.012; }
    if (o.thread && !sl.comp) { k.cyl(0.0058, 0.012, M.steel(), front, 0.009); front += 0.012; }
    if (o.muzzle && o.thread) { k.tag('muzzle'); front += muzzle(k, o.muzzle, front, 0.0065, 0.009); }
    k.tag('tac');
    tactical(k, o.tac, len * 0.86, -0.014, -0.01);
    k.tag('optic');
    let sight;
    if (o.optic === 'minidot') sight = S.minidot(k, len * 0.32, 0.026, o);
    else { k.into(slide); sight = S.pistolSights(k, 0.012, len - 0.01, 0.0335, 0.026, o.optic === 'night'); k.into(null); }
    k.tag('base');
    return {
      sy: sight.sy, fSight: sight.fSight, relief: o.optic === 'minidot' ? 0.3 : 0.36,
      muzzles: [[front, 0.009, 0]], grip: [0.012, -0.06, 0], support: [0.03, -0.065, -0.022], anim, pistol: true,
      magAt: [0.012, -0.004], slide: [len * 0.2, 0.02, 0], chamberAt: { side: 'port', f: p0 - 0.006, y: 0.0175, x: w / 4 }, // (the round's back end, behind the hood, and its top, just under the hood's)
    };
  }

  function revolver(k, o) {
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

  function derringer(k, o) {
    const bl = o.blen || 0.09;
    k.tag('base');
    k.box(0.006, 0.012, 0.008, M.steel(), -0.006, 0.03);
    k.tag('barrel');
    const anim = {};
    const brk = k.part(bl, 0.03);
    k.into(brk, bl, 0.03);
    k.prof([[0, -0.02], [0, 0.03], [bl, 0.03], [bl, -0.02]], 0.02, M.steel());
    k.cyl(0.006, 0.002, M.rubber(), bl, 0.017); k.cyl(0.006, 0.002, M.rubber(), bl, -0.006);
    k.into(null);
    anim.brk = brk;
    k.tag('grip');
    k.prof([[-0.004, -0.004], [0.025, -0.01], [0.012, -0.075], [-0.022, -0.07]], 0.026, o.gm || M.woodDark());
    k.tag('base');
    return { sy: 0.034, fSight: 0.0, relief: 0.36, muzzles: [[bl, 0.017, 0]], grip: [0.0, -0.045, 0], support: [0.015, -0.05, -0.02], anim, pistol: true, port: [0.0, 0.0, 0], chamberAt: { side: 'breech', heads: [[0, -0.013], [0, -0.036]], z: bl + 0.0026, r: 0.006 } }; // (just proud of the barrel block's bevelled back)
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
    k.tag('optic');
    let sight;
    if (!o.optic || o.optic === 'none') { k.prof([[0.02, top], [0.05, top + 0.06], [0.17, top + 0.06], [0.2, top]], 0.02, M.black(), 0, [[[0.06, top + 0.01], [0.07, top + 0.045], [0.15, top + 0.045], [0.16, top + 0.01]]]); sight = { sy: top + 0.075, fSight: 0.08, relief: 0.4 }; }
    else sight = sightOf(k, o, top, 0.22, bl, 0.01, 0.22 + bl, 0.12);
    k.tag('base');
    return { sy: sight.sy, fSight: sight.fSight, relief: sight.relief, muzzles: [[0.22 + bl, -0.01, 0]], grip: [0.035, -0.08, 0], support: [0.1, 0.1, 0], anim, magAt: [0.12, -0.06] };
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

  function crossbow(k, o) {
    k.tag('base');
    k.box(0.036, 0.04, 0.6, M.black(), 0.0, -0.01);
    k.box(0.01, 0.006, 0.6, M.gunmetal(), 0.0, 0.012);
    grip(k, 0.03, M.polymer());
    triggerGuard(k, 0.03, M.black());
    k.cyl(0.004, 0.42, M.woodDark(), 0.2, 0.016);
    k.cyl(0.006, 0.03, M.steel(), 0.62, 0.016, 0, 0.0005, 8);
    k.box(0.04, 0.03, 0.05, M.black(), 0.6, -0.02);
    const top = S.rail(k, 0.06, 0.16, 0.015, M.black());
    k.tag('stock');
    stock(k, o.stock || 'sniper', o.sm || M.polymer());
    k.tag('limbs');
    const ll = o.limb === 'heavy' ? 0.37 : o.limb === 'compact' ? 0.26 : 0.33, lw = o.limb === 'heavy' ? 1.6 : 1;
    for (const s of [-1, 1]) {
      const limb = new T.Mesh(new T.BoxGeometry(0.03, 0.012 * lw, ll), o.limb === 'heavy' ? M.gunmetal() : M.black());
      limb.position.set(s * ll * 0.45, 0.0, -0.56); limb.rotation.y = s * 1.25; k.add(limb);
      const str = new T.Mesh(new T.CylinderGeometry(0.0015, 0.0015, ll * 1.27, 4), M.string());
      str.rotation.z = Math.PI / 2; str.rotation.y = s * -0.55; str.position.set(s * ll * 0.45, 0.012, -0.38); k.add(str);
    }
    k.tag('optic');
    const sight = sightOf(k, o, top, 0.3, 0.3, 0.004, 0.62, 0.14);
    k.tag('base');
    return { sy: sight.sy, fSight: sight.fSight, relief: sight.relief, muzzles: [[0.62, 0.016, 0]], grip: [0.035, -0.075, 0], support: [0.3, -0.03, 0], anim: {}, port: [0.2, 0.02, 0] };
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
    const info = (ARCH[plat.arch] || rifle)(k, spec);
    k.tag('base');
    info.anim = info.anim || {};
    return info;
  }

  // ---------------------------------------------------------------- muzzle flash sprite
  function flashMesh(color) {
    const m = new T.Mesh(new T.PlaneGeometry(0.2, 0.2), new T.MeshBasicMaterial({ map: G.R.flashTex, transparent: true, blending: T.AdditiveBlending, depthWrite: false, color }));
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
  const PIP_RETICLE = { cross: 0, chevron: 1, lpvo: 2, dot: 3, dotG: 3, cdot: 4, holo: 4 };
  const PIP_ILLUM = { cross: 0x000000, chevron: 0xff9a18, lpvo: 0xff2a20, dot: 0xff2a20, dotG: 0x30ff50, cdot: 0xff2a20, holo: 0xff2a20 };
  const PIP_VS = 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }';
  const PIP_FS = `
    uniform sampler2D map; uniform float live; uniform vec2 eye; uniform int ret; uniform vec3 illum;
    varying vec2 vUv;
    float seg(vec2 p, vec2 a, vec2 b) { vec2 pa = p - a, ba = b - a; float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0); return length(pa - ba * h); }
    float ink(float d, float w) { float aa = fwidth(d) * 0.75; return 1.0 - smoothstep(w - aa, w + aa, d); }
    void main() {
      vec2 p = vUv * 2.0 - 1.0; float r = length(p);
      vec3 img = texture2D(map, vUv).rgb;
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
      } else { // illuminated circle-dot with a gapped crosshair
        glow = max(ink(abs(r - 0.2), 0.006), ink(r, 0.018));
        float tw = abs(p.x) > 0.55 ? 0.022 : 0.0035, th = abs(p.y) > 0.55 ? 0.022 : 0.0035;
        black = max(ink(abs(p.y), tw), ink(abs(p.x), th)) * step(0.3, max(abs(p.x), abs(p.y)));
      }
      vec3 col = img * (1.0 - black * 0.94) + illum * glow * 1.5;
      col *= (1.0 - smoothstep(0.7, 1.0, length(p - eye))) * smoothstep(1.0, 0.9, r);
      vec3 glass = vec3(0.025, 0.04, 0.055) + vec3(0.1, 0.12, 0.18) * pow(max(0.0, 1.0 - length(p - vec2(-0.35, 0.4))), 3.0);
      gl_FragColor = vec4(mix(glass, col, live), 1.0);
    }`;
  function pipLens(k, o, def) {
    const reticle = def.reticle || 'cross';
    const mat = new T.ShaderMaterial({
      uniforms: { map: { value: G.R.pipTexture() }, live: { value: 0 }, eye: { value: new T.Vector2() }, ret: { value: PIP_RETICLE[reticle] || 0 }, illum: { value: new T.Color(PIP_ILLUM[reticle] || 0) } },
      vertexShader: PIP_VS, fragmentShader: PIP_FS, extensions: { derivatives: true },
    });
    const disk = new T.Mesh(new T.CircleGeometry(o.r, 48), mat);
    if (o.parent) { disk.position.copy(o.pos); o.parent.add(disk); } // (a magnifier's lens swings with it)
    else { disk.position.set(0, o.y, -o.f); k.g.add(disk); }
    return { disk, r: o.r, mat, mag: def.magnif || 4 };
  }

  function viewmodel(def) {
    const root = new T.Group();
    const guns = def.akimbo ? [-1, 1] : [1];
    let info0 = null, pip = null;
    const flashes = [], holders = [];
    for (const side of guns) {
      const k = kit();
      buildingVM = true;
      let info;
      try { info = build(k, def); } finally { buildingVM = false; }
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
    const adsZ = info.fSight - info.relief;
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
  function world(def) {
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
      proto = { meshes: merge(k.g), info, mag };
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
    g.userData.info = proto.info;
    return g;
  }

  // the gunsmith's display model: every part as separate meshes (tagged by slot), stock included
  function display(def) { const k = kit(); const info = build(k, def); return { group: k.g, info }; }

  return { M, build, viewmodel, world, display };
})();
