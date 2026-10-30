'use strict';
// What a round does to what it hits: the damage it leaves on a surface and what it throws out of it, by what the surface is made
// of (js/materials.js). plan() works out a mark; the game puts it in its pool of marks (js/render.js impact: they stay on doors and
// targets), the replays in their own scene (js/highlights.js struck). Walls and doors have the hole really cut in them (js/damage.js);
// a mark is what's left round it, or all there is on anything else: a picture of the damage laid on the surface (one sheet of them, drawn
// here, lit as the level is; a second with the holes left clear, for what's been cut) and, where something really stands proud of
// it, a piece of geometry too: metal torn open and bent the way the round was going, splinters, torn paper. The way it went
// matters: a dent's dragged along the round's line, a gouge runs with it, an exit's petals lean with it.
//   - metal dimples into the hole on the way in and comes out of the far side in petals; a round it stops leaves a dent and lead
//     smeared in it; cast iron's brittle, and cracks and chips instead
//   - concrete, block, brick and tile crater and crack, thrown chips and dust, spalling wider out of the back than the front
//   - wood takes a ragged hole and blows out in splinters along the grain; particle board just crumbles
//   - plasterboard takes a neat hole in, a torn paper-edged blowout out, and hangs in the air as dust
//   - cardboard, paper, cloth, foam, wool and stock tear and let go of what's in them, which drifts
//   - glass and tile star; plastic whitens and stars; earth and sand crater; water splashes; leaves fall
G.Scars = (() => {
  const T = THREE, CELLS = 4, PX = 256, CUT_R = 0.28; // (CUT_R: the hole in a mark that's been cut, as a share of the mark's radius)
  // chips: n, size (m), speed (m/s), gravity, shape (chunk, sliver, flake), colours, drag (flakes drift), how long they lie
  const CHIP = {
    chunk: (cols, n = 8, size = 0.012, v = 3.2) => ({ n, size, v, g: 9.8, shape: 'chunk', cols, drag: 0, life: 40 }),
    sliver: (cols, n = 9, size = 0.03, v = 3) => ({ n, size, v, g: 9.8, shape: 'sliver', cols, drag: 0.4, life: 40 }),
    flake: (cols, n = 10, size = 0.012, v = 1.8, g = 2.2, drag = 2.4) => ({ n, size, v, g, shape: 'flake', cols, drag, life: 14 }),
  };
  const CONC = [0x8f8d86, 0x77756f, 0xa4a198], CMU = [0x8a8780, 0x9d9a90, 0x6f6c66], BRICK = [0xa85a3e, 0x8f4a32, 0xbf7350], PINE = [0xd8bb82, 0xc4a266, 0xe6d2a4], HARD = [0x9a6a3a, 0x7e5430, 0xb6865a], STEEL = [0xc8d0d8, 0x9aa4ae];
  const LOOK = {
    steel: { look: 'metal', chips: CHIP.chunk(STEEL, 3, 0.005, 5) }, mild: { look: 'metal', chips: CHIP.chunk(STEEL, 3, 0.005, 5) }, alu: { look: 'metal', soft: true, chips: CHIP.flake([0xdfe3e6], 5, 0.008, 2.5, 6, 1) },
    iron: { look: 'tile', tint: 0x3a3a3c, chips: CHIP.chunk([0x4a4a4c, 0x35353a], 8, 0.01, 4), dust: 0x55524e },
    concrete: { look: 'stone', chips: CHIP.chunk(CONC, 12), dust: 0xa8a59c }, cmu: { look: 'stone', chips: CHIP.chunk(CMU, 11), dust: 0xb0ada2 }, brick: { look: 'brick', chips: CHIP.chunk(BRICK, 10), dust: 0xb07858 },
    ceram: { look: 'tile', tint: 0xf2f0ea, chips: CHIP.sliver([0xf4f2ec, 0xe2e0da], 10, 0.02, 3.6), dust: 0xe8e6e0 }, bone: { look: 'stone', chips: CHIP.chunk([0xe6dcc4], 4) },
    pine: { look: 'wood', chips: CHIP.sliver(PINE), dust: 0xd8c49a }, ply: { look: 'wood', chips: CHIP.sliver(PINE, 11, 0.026), dust: 0xd8c49a }, hardwood: { look: 'wood', dark: true, chips: CHIP.sliver(HARD), dust: 0xa88a64 },
    mdf: { look: 'chipboard', chips: CHIP.chunk([0xb89a70, 0xa08458], 12, 0.006, 2), dust: 0xc8b490 },
    gypsum: { look: 'plaster', chips: CHIP.chunk([0xece8de, 0xdcd8cc], 8, 0.01, 1.8), dust: 0xf0ece2 },
    card: { look: 'paper', chips: CHIP.flake([0xb89868, 0xa88858]) }, paper: { look: 'paper', chips: CHIP.flake([0xf2f0e6, 0xe4e2d8], 16) }, paperT: { look: 'paper', chips: CHIP.flake([0xf2f0e6], 6) },
    fabric: { look: 'fluff', chips: CHIP.flake([0xe8e4da, 0xd4d0c6], 12, 0.014, 1.4, 1, 3) }, foam: { look: 'fluff', tint: 0xe2cf72, chips: CHIP.chunk([0xe6d478, 0xd4c060], 10, 0.009, 1.6) }, pur: { look: 'fluff', tint: 0xe2cf72, chips: CHIP.chunk([0xe6d478], 8, 0.009, 1.6) },
    wool: { look: 'fluff', tint: 0xd8c070, chips: CHIP.flake([0xd8c070, 0xc4ae60], 12, 0.012, 1.4, 1, 3) }, goods: { look: 'fluff', chips: CHIP.flake([0xcfc8b8, 0xb8b0a0], 8) }, rubber: { look: 'plastic', tint: 0x1c1c1e, chips: CHIP.chunk([0x222224], 3, 0.006, 1.5) },
    glass: { look: 'glass', chips: CHIP.sliver([0xcfe6f0, 0xe4f2f8], 12, 0.016, 2.8) }, bpglass: { look: 'glass', chips: CHIP.flake([0xcfe6f0], 5, 0.008, 2, 7, 0.5) },
    hdpe: { look: 'plastic', chips: CHIP.sliver([0x8a8b8d, 0xb0b1b3], 6, 0.016, 2.4) }, abs: { look: 'plastic', chips: CHIP.sliver([0x55565a, 0x77787a], 7, 0.016, 2.4) }, pc: { look: 'plastic', tint: 0xdfeef6, chips: CHIP.sliver([0xdfeef6], 5, 0.016, 2.4) },
    soil: { look: 'soil', chips: CHIP.chunk([0x6a5238, 0x54412c], 12, 0.012, 2.8), dust: 0x8a7458 }, sand: { look: 'soil', tint: 0xc8b078, chips: CHIP.chunk([0xc8b078, 0xb49c68], 14, 0.006, 2.8), dust: 0xd8c490 },
    foliage: { look: 'none', chips: CHIP.flake([0x4a7a34, 0x38602a, 0x5e8c40], 10, 0.02, 1.2, 1.4, 2.6) }, water: { look: 'none', chips: CHIP.flake([0xbcd8e4, 0xdcecf4], 14, 0.012, 3.6, 9.8, 0) },
    aramid: { look: 'fluff', tint: 0xd6a92e, chips: CHIP.flake([0xd6a92e], 6) }, pe: { look: 'fluff', chips: CHIP.flake([0xf0ecdc], 6) },
  };
  const BY_FX = { metal: 'mild', stone: 'concrete', wood: 'pine', plaster: 'gypsum', soft: 'goods', glass: 'glass', soil: 'soil', plastic: 'hdpe', water: 'water' }; // (a mark from before marks said what they were: an old recording)
  const rngOf = (s) => () => { s = (Math.imul(s, 1597334677) + 12345) | 0; return ((s ^ (s >>> 15)) >>> 0) / 4294967296; };

  // ---------------------------------------------------------------- the sheet of marks
  const CELL = { dent: 0, dentStop: 1, gouge: 2, stone: 3, spall: 4, woodIn: 5, woodOut: 6, chip: 7, plasIn: 8, plasOut: 9, paper: 10, fluff: 11, star: 12, plastic: 13, soil: 14, tile: 15, brick: 16, brickOut: 17 };
  const ROWS = 5;
  function sheet(cut) {
    const W = CELLS * PX, Hh = ROWS * PX, cv = typeof document !== 'undefined' ? Object.assign(document.createElement('canvas'), { width: W, height: Hh }) : new OffscreenCanvas(W, Hh), g = cv.getContext('2d');
    const at = (i, fn) => { g.save(); g.translate((i % CELLS) * PX, Math.floor(i / CELLS) * PX); g.beginPath(); g.rect(0, 0, PX, PX); g.clip(); g.translate(PX / 2, PX / 2); fn(rngOf(i * 7919 + 1)); g.restore(); };
    const blob = (r, rnd, jag, sx = 1, sy = 1, n = 28) => { g.beginPath(); for (let i = 0; i <= n; i++) { const a = i / n * Math.PI * 2, q = r * (1 - jag + rnd() * jag * 2); g[i ? 'lineTo' : 'moveTo'](Math.cos(a) * q * sx, Math.sin(a) * q * sy); } g.closePath(); };
    const radial = (r, stops) => { const gr = g.createRadialGradient(0, 0, 0, 0, 0, r); for (const [t, c] of stops) gr.addColorStop(t, c); return gr; };
    const cracks = (n, r0, r1, col, w, rnd) => {
      g.strokeStyle = col; g.lineWidth = w; g.lineCap = 'round';
      for (let i = 0; i < n; i++) {
        let a = i / n * Math.PI * 2 + rnd() * 0.5, q = r0, x = Math.cos(a) * q, y = Math.sin(a) * q; const end = r0 + (r1 - r0) * (0.45 + rnd() * 0.55);
        g.beginPath(); g.moveTo(x, y);
        while (q < end) { const st = 8 + rnd() * 16; q += st; a += (rnd() - 0.5) * 0.6; x += Math.cos(a) * st; y += Math.sin(a) * st; g.lineTo(x, y); if (rnd() < 0.14) { g.lineTo(x + Math.cos(a + 1) * st, y + Math.sin(a + 1) * st); g.moveTo(x, y); } }
        g.stroke();
      }
    };
    // (a hole. On a sheet for what's really been cut (js/damage.js), it's nothing at all, and the same size in every mark: CUT_R)
    const hole = (r, rnd, jag = 0.15, x = 0) => { g.save(); g.translate(x, 0); if (cut) { g.globalCompositeOperation = 'destination-out'; g.beginPath(); g.arc(0, 0, CUT_R * PX / 2, 0, 7); g.fillStyle = '#000'; g.fill(); } else { blob(r, rnd, jag); g.fillStyle = 'rgba(8,7,6,0.97)'; g.fill(); } g.restore(); };
    // (the dents are lit from above, as a dimple would be: dark where it falls away from the light, bright where it turns to it.
    // The round went toward +x: it's dragged out that way, the hole at the near end)
    const dent = (holed) => (rnd) => {
      g.save(); g.translate(14, 0); g.scale(1.25, 1);
      blob(92, rnd, 0.05); g.fillStyle = radial(92, [[0, '#30343a'], [0.45, '#5a6068'], [0.72, 'rgba(176,186,196,0.95)'], [0.88, 'rgba(214,222,230,0.75)'], [1, 'rgba(180,190,200,0)']]); g.fill();
      const sh = g.createLinearGradient(0, -90, 0, 90); sh.addColorStop(0, 'rgba(0,0,0,0.62)'); sh.addColorStop(0.5, 'rgba(0,0,0,0)'); sh.addColorStop(1, 'rgba(255,255,255,0.4)');
      blob(74, rnd, 0.03); g.fillStyle = sh; g.fill(); g.restore();
      if (holed) hole(25, rnd, 0.18, -8); else { g.save(); g.translate(0, 2); blob(30, rnd, 0.3); g.fillStyle = radial(30, [[0, '#8f9398'], [0.7, '#6c7076'], [1, 'rgba(90,92,98,0)']]); g.fill(); g.restore(); } // (the lead left in it)
    };
    at(CELL.dent, dent(true)); at(CELL.dentStop, dent(false));
    at(CELL.gouge, (rnd) => {
      g.save(); g.scale(1.3, 0.34); blob(92, rnd, 0.1); g.fillStyle = radial(92, [[0, '#f0f4f8'], [0.55, '#b8c2cc'], [0.86, 'rgba(120,128,136,0.8)'], [1, 'rgba(60,62,66,0)']]); g.fill(); g.restore();
      g.strokeStyle = 'rgba(30,32,36,0.5)'; g.lineWidth = 2; for (let i = 0; i < 7; i++) { const y = -18 + i * 6 + rnd() * 3; g.beginPath(); g.moveTo(-90 + rnd() * 40, y); g.lineTo(90 - rnd() * 40, y); g.stroke(); }
    });
    const crater = (r, base, deep, nCr, rCr, crack) => (rnd) => {
      cracks(nCr, r * 0.7, rCr, crack, 3, rnd);
      blob(r, rnd, 0.2); g.fillStyle = radial(r, [[0, deep], [0.5, base], [0.92, base], [1, 'rgba(0,0,0,0)']]); g.fill();
      for (let i = 0; i < 26; i++) { const a = rnd() * 7, q = r * (0.3 + rnd() * 0.8), s = 2 + rnd() * 7; g.fillStyle = rnd() < 0.5 ? 'rgba(0,0,0,0.3)' : 'rgba(255,255,255,0.14)'; g.fillRect(Math.cos(a) * q, Math.sin(a) * q, s, s * 0.7); }
      hole(r * 0.27, rnd, 0.2);
    };
    at(CELL.stone, crater(64, '#9a978e', '#55524c', 10, 122, 'rgba(24,22,20,0.8)'));
    at(CELL.spall, crater(112, '#a4a198', '#5e5b54', 8, 126, 'rgba(24,22,20,0.7)'));
    at(CELL.brick, crater(66, '#a4583c', '#5a2e20', 7, 118, 'rgba(30,14,10,0.8)'));
    at(CELL.brickOut, crater(114, '#b0664a', '#622f22', 7, 126, 'rgba(30,14,10,0.7)'));
    at(CELL.tile, (rnd) => { cracks(13, 16, 124, 'rgba(14,14,16,0.85)', 3, rnd); blob(38, rnd, 0.3); g.fillStyle = radial(38, [[0, '#26262a'], [0.75, '#6a6a6e'], [1, 'rgba(120,120,124,0)']]); g.fill(); hole(16, rnd, 0.2); });
    const grain = (rnd, r, col) => { g.strokeStyle = col; g.lineWidth = 2; for (let i = 0; i < 16; i++) { const x = -r + rnd() * r * 2, y = (rnd() - 0.5) * r * 1.3; g.beginPath(); g.moveTo(x - 4, y - 30 - rnd() * 40); g.lineTo(x + 3, y + 30 + rnd() * 40); g.stroke(); } };
    at(CELL.woodIn, (rnd) => { blob(48, rnd, 0.28, 0.8, 1.35); g.fillStyle = radial(66, [[0, '#6a4a2a'], [0.6, '#c8a874'], [1, 'rgba(216,188,136,0.2)']]); g.fill(); grain(rnd, 34, 'rgba(70,44,20,0.5)'); hole(24, rnd, 0.28); });
    at(CELL.woodOut, (rnd) => { blob(84, rnd, 0.36, 0.72, 1.45); g.fillStyle = radial(118, [[0, '#5a3e22'], [0.5, '#c8a874'], [1, 'rgba(226,202,156,0.5)']]); g.fill(); grain(rnd, 58, 'rgba(70,44,20,0.55)'); hole(34, rnd, 0.32); });
    at(CELL.chip, (rnd) => { blob(92, rnd, 0.28); g.fillStyle = radial(92, [[0, '#4a3a24'], [0.55, '#a88c62'], [1, 'rgba(176,150,110,0.4)']]); g.fill(); for (let i = 0; i < 70; i++) { const a = rnd() * 7, q = rnd() * 88; g.fillStyle = ['#c8b088', '#8a7048', '#e0cca4', '#5e4a30'][Math.floor(rnd() * 4)]; g.fillRect(Math.cos(a) * q, Math.sin(a) * q, 3 + rnd() * 5, 2 + rnd() * 4); } hole(26, rnd, 0.3); });
    at(CELL.plasIn, (rnd) => { blob(44, rnd, 0.14); g.fillStyle = radial(44, [[0, '#c8c4b8'], [0.7, '#f4f0e6'], [1, 'rgba(244,240,230,0)']]); g.fill(); cracks(5, 34, 70, 'rgba(90,86,78,0.4)', 2, rnd); hole(20, rnd, 0.1); });
    at(CELL.plasOut, (rnd) => { blob(106, rnd, 0.3); g.fillStyle = radial(106, [[0, '#8e8a7e'], [0.5, '#d8d4c8'], [0.82, '#f2eee4'], [0.96, 'rgba(250,247,240,0.9)'], [1, 'rgba(250,247,240,0)']]); g.fill(); hole(36, rnd, 0.3); });
    at(CELL.paper, (rnd) => { blob(58, rnd, 0.36); g.fillStyle = 'rgba(214,190,150,0.95)'; g.fill(); hole(36, rnd, 0.34); });
    at(CELL.fluff, (rnd) => { for (let i = 0; i < 90; i++) { const a = rnd() * 7, q = rnd() * rnd() * 100; g.fillStyle = `rgba(238,234,224,${0.25 + rnd() * 0.4})`; g.beginPath(); g.arc(Math.cos(a) * q, Math.sin(a) * q, 5 + rnd() * 12, 0, 7); g.fill(); } hole(16, rnd, 0.4); });
    at(CELL.star, (rnd) => {
      cracks(14, 10, 126, 'rgba(230,244,250,0.9)', 2.5, rnd);
      g.strokeStyle = 'rgba(225,240,248,0.6)'; g.lineWidth = 1.5; for (const r of [32, 58, 88]) { g.beginPath(); for (let i = 0; i <= 14; i++) { const a = i / 14 * Math.PI * 2, q = r * (0.85 + rnd() * 0.3); g[i ? 'lineTo' : 'moveTo'](Math.cos(a) * q, Math.sin(a) * q); } g.stroke(); }
      blob(20, rnd, 0.3); g.fillStyle = radial(20, [[0, 'rgba(255,255,255,0.95)'], [1, 'rgba(210,232,240,0.55)']]); g.fill();
    });
    at(CELL.plastic, (rnd) => { g.fillStyle = radial(84, [[0, 'rgba(250,250,250,0.85)'], [0.6, 'rgba(236,236,236,0.5)'], [1, 'rgba(230,230,230,0)']]); g.fillRect(-100, -100, 200, 200); cracks(7, 14, 84, 'rgba(20,20,22,0.8)', 3, rnd); hole(18, rnd, 0.42); });
    at(CELL.soil, (rnd) => { blob(100, rnd, 0.24); g.fillStyle = radial(100, [[0, '#2c2014'], [0.55, '#54412c'], [1, 'rgba(92,72,50,0)']]); g.fill(); for (let i = 0; i < 40; i++) { const a = rnd() * 7, q = 40 + rnd() * 80; g.fillStyle = 'rgba(60,44,28,0.75)'; g.fillRect(Math.cos(a) * q, Math.sin(a) * q, 3 + rnd() * 6, 3 + rnd() * 6); } });
    const tex = new T.CanvasTexture(cv); tex.colorSpace = T.SRGBColorSpace || tex.colorSpace; if (T.sRGBEncoding) tex.encoding = T.sRGBEncoding; tex.anisotropy = 4;
    return tex;
  }
  let matD = null, matC = null; const geos = new Map(), mats = new Map();
  const decalMat = (tint, cut) => {
    const k = (tint || 0xffffff) + (cut ? 'c' : '');
    if (!mats.has(k)) { const tex = cut ? (matC = matC || sheet(true)) : (matD = matD || sheet()); mats.set(k, new T.MeshLambertMaterial({ map: tex, color: k, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 })); }
    return mats.get(k);
  };
  function cellGeo(i) {
    if (geos.has(i)) return geos.get(i);
    const g = new T.PlaneGeometry(1, 1), uv = g.attributes.uv, u0 = (i % CELLS) / CELLS, v1 = 1 - Math.floor(i / CELLS) / ROWS;
    for (let k = 0; k < uv.count; k++) uv.setXY(k, u0 + uv.getX(k) / CELLS, v1 - (1 - uv.getY(k)) / ROWS);
    geos.set(i, g);
    return g;
  }
  // ---------------------------------------------------------------- what stands proud of the surface
  // Flaps round a hole, each bent up out of the surface: n of them, from radius r0, up to len out and up to h high, the
  // tips sheared slant along +x (the way the round was going), narrower toward their tips. The hole's middle is left open.
  function flaps(seed, n, r0, len, h, slant, wide, grain = 0) {
    const rnd = rngOf(seed), pos = [], col = [];
    for (let i = 0; i < n; i++) {
      const a = (i + rnd() * 0.5) / n * Math.PI * 2, w = (Math.PI / n) * wide * (0.7 + rnd() * 0.5), L = len * (0.6 + rnd() * 0.6), H = h * (0.6 + rnd() * 0.7), S = 4;
      const ang = grain ? a * (1 - grain) + (Math.sin(a) > 0 ? Math.PI / 2 : -Math.PI / 2) * grain : a; // (along the grain, a splinter)
      const pt = (u, s) => { const q = r0 + (L - r0) * u, aa = ang + s * w * (1 - u * u), z = H * u * u * (3 - 2 * u); return [Math.cos(aa) * q + slant * z, Math.sin(aa) * q, z]; };
      for (let k = 0; k < S; k++) {
        const u0 = k / S, u1 = (k + 1) / S, A = pt(u0, -1), B = pt(u0, 1), C = pt(u1, 1), D = pt(u1, -1), sh = 0.72 + rnd() * 0.38;
        pos.push(...A, ...B, ...C, ...A, ...C, ...D);
        for (let q = 0; q < 6; q++) col.push(sh, sh, sh);
      }
    }
    const g = new T.BufferGeometry(); g.setAttribute('position', new T.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new T.Float32BufferAttribute(col, 3)); g.computeVertexNormals();
    return g;
  }
  const flapMat = (col, metal) => {
    const k = 'f' + col;
    if (!mats.has(k)) mats.set(k, metal ? new T.MeshStandardMaterial({ color: col, metalness: 0.35, roughness: 0.45, vertexColors: true, side: T.DoubleSide }) : new T.MeshLambertMaterial({ color: col, vertexColors: true, side: T.DoubleSide }));
    return mats.get(k);
  };
  const flapGeo = (key, make) => { if (!geos.has(key)) geos.set(key, make()); return geos.get(key); };

  // ---------------------------------------------------------------- a mark
  // What a round leaves here. o: { m (its material, js/materials.js), fx, k (e in, x out, r off), n (the surface's normal), dir (the
  // way the round was going), J (the energy it came with), stop (it stopped in it), cal (its width, mm) }. Returns the
  // pieces to place: [{ geo, mat, s: [x, y, z], q (turned so z is out of the surface, x along the round), off }].
  function plan(o) {
    const key = o.m || BY_FX[o.fx] || 'concrete', L = LOOK[key] || LOOK.concrete;
    if (L.look === 'none' || !o.n) return [];
    const z = new T.Vector3(o.n[0], o.n[1], o.n[2]).normalize(), dir = o.dir ? new T.Vector3(o.dir.x != null ? o.dir.x : o.dir[0], o.dir.y != null ? o.dir.y : o.dir[1], o.dir.z != null ? o.dir.z : o.dir[2]) : null;
    const tang = dir ? dir.clone().addScaledVector(z, -dir.dot(z)) : new T.Vector3(), lean = tang.length();
    const q = (spin) => {
      const x = lean > 0.05 && !spin ? tang.clone().divideScalar(lean) : new T.Vector3(z.y, z.z, z.x).cross(z).normalize();
      if (spin) x.applyAxisAngle(z, Math.random() * 6.28);
      const y = new T.Vector3().crossVectors(z, x);
      return new T.Quaternion().setFromRotationMatrix(new T.Matrix4().makeBasis(x, y, z));
    };
    const J = o.J == null ? 800 : o.J, sz = G.U.clamp(Math.sqrt(J / 1000), 0.55, 1.7), cal = (o.cal || 8) / 8, tint = L.tint, out = [];
    const cutR = o.cut || 0; // (really cut: the mark's sized to go round the hole)
    const decal = (cell, r, spin = true, sy = 1, t = tint) => { const R = cutR && o.k !== 'r' ? cutR / CUT_R : r; out.push({ geo: cellGeo(cell), mat: decalMat(t, cutR && o.k !== 'r'), s: [R * 2, R * 2 * sy, 1], q: q(spin), off: 0.004 }); };
    const look = L.look, x = o.k === 'x', v = Math.floor(Math.random() * 3);
    if (o.k === 'r') { // (a skid: along the way it was going, as long as it was shallow)
      const r = 0.05 + 0.08 * sz;
      decal(look === 'metal' ? CELL.gouge : look === 'wood' ? CELL.woodOut : look === 'brick' ? CELL.brick : look === 'glass' ? CELL.star : CELL.stone, r, false, look === 'metal' ? 1 : 0.42);
      return out;
    }
    if (look === 'metal') {
      if (x) { // (out of the far side: torn open, the petals bent on the way it was going)
        const slant = Math.round(Math.min(1, lean * 1.6) * 2), r = cutR ? cutR / 0.4 : (L.soft ? 0.05 : 0.04) * sz * cal;
        decal(CELL.dent, r * 0.9, true);
        out.push({ geo: flapGeo(`petal${v}${slant}`, () => flaps(11 + v * 7 + slant, 7, 0.26, 1, 0.8, slant * 0.5, 0.92)), mat: flapMat(L.soft ? 0xd4d8dc : 0xaeb6be, true), s: [r, r, r], q: q(false), off: 0.002 });
      } else {
        decal(o.stop && !cutR ? CELL.dentStop : CELL.dent, (L.soft ? 0.05 : 0.038) * sz * cal, false);
        // (going in: the edge of it torn in, down the way it went)
        if (cutR) { const r = cutR * 1.3; out.push({ geo: flapGeo(`petal${v}2`, () => flaps(11 + v * 7 + 2, 7, 0.5, 1, 0.8, 1, 0.92)), mat: flapMat(L.soft ? 0xd4d8dc : 0xaeb6be, true), s: [r, r, -r * 0.9], q: q(false), off: -0.001 }); }
      }
    } else if (look === 'stone' || look === 'brick') decal(look === 'brick' ? (x ? CELL.brickOut : CELL.brick) : x ? CELL.spall : CELL.stone, (x ? 0.1 : 0.058) * sz, true);
    else if (look === 'tile') decal(CELL.tile, 0.09 * sz, true);
    else if (look === 'wood') {
      decal(x ? CELL.woodOut : CELL.woodIn, (x ? 0.07 : 0.034) * sz, true, 1, L.dark ? 0xb08a60 : undefined);
      if (x) { const r = cutR ? cutR / 0.16 : 0.085 * sz; out.push({ geo: flapGeo(`spl${v}`, () => flaps(31 + v * 13, 13, 0.16, 1, 0.75, 0.25, 0.3, 0.7)), mat: flapMat(L.dark ? 0x9a6a3a : 0xd8bb82), s: [r, r, r], q: q(false), off: 0.002 }); }
    } else if (look === 'chipboard') decal(CELL.chip, (x ? 0.07 : 0.04) * sz, true);
    else if (look === 'plaster') {
      decal(x ? CELL.plasOut : CELL.plasIn, (x ? 0.085 : 0.036) * sz, true);
      if (x) { const r = cutR ? cutR / 0.42 : 0.06 * sz; out.push({ geo: flapGeo(`pap${v}`, () => flaps(51 + v * 3, 6, 0.42, 1, 0.3, 0.2, 0.8)), mat: flapMat(0xf0ece0), s: [r, r, r], q: q(true), off: 0.002 }); }
    } else if (look === 'paper') { decal(CELL.paper, 0.022 * sz * cal, true); if (x) { const r = 0.024 * sz; out.push({ geo: flapGeo(`pap${v}`, () => flaps(51 + v * 3, 6, 0.42, 1, 0.3, 0.2, 0.8)), mat: flapMat(key === 'paper' ? 0xf2f0e6 : 0xc8a878), s: [r, r, r], q: q(true), off: 0.002 }); } }
    else if (look === 'fluff') decal(CELL.fluff, (x ? 0.06 : 0.042) * sz, true);
    else if (look === 'glass') decal(CELL.star, (key === 'bpglass' ? 0.1 : 0.13) * sz, true);
    else if (look === 'plastic') decal(CELL.plastic, 0.05 * sz, true);
    else if (look === 'soil') decal(CELL.soil, 0.075 * sz, true);
    return out;
  }
  // a mark's pieces as meshes of their own (the replays': js/highlights.js)
  function meshes(o, p, parent) {
    return plan(o).map((c) => { const m = new T.Mesh(c.geo, c.mat); m.quaternion.copy(c.q); m.scale.set(...c.s); m.position.set(p.x + o.n[0] * c.off, p.y + o.n[1] * c.off, p.z + o.n[2] * c.off); m.renderOrder = 1; parent.add(m); return m; });
  }

  // ---------------------------------------------------------------- what's thrown out of it
  // Chips: a fixed number of little pieces that fly, tumble, land on the floor and lie there a while, oldest reused
  // first, and the dust that hangs. One draw call for all of them. floor(x, z, y): the ground under a point.
  function debris(scene, floor) {
    const N = 360, geo = new T.TetrahedronGeometry(1), mesh = new T.InstancedMesh(geo, new T.MeshLambertMaterial({ color: 0xffffff }), N), P = [];
    mesh.frustumCulled = false; mesh.count = N; mesh.instanceMatrix.setUsage(T.DynamicDrawUsage);
    const zero = new T.Matrix4().makeScale(0, 0, 0), m4 = new T.Matrix4(), q = new T.Quaternion(), e = new T.Euler(), v = new T.Vector3(), s = new T.Vector3(), c = new T.Color();
    for (let i = 0; i < N; i++) { mesh.setMatrixAt(i, zero); mesh.setColorAt(i, c.setHex(0xffffff)); P.push({ on: false }); }
    scene.add(mesh);
    let idx = 0, dirty = false;
    const puffs = [];
    const dustTex = (() => { const cv = typeof document !== 'undefined' ? Object.assign(document.createElement('canvas'), { width: 64, height: 64 }) : new OffscreenCanvas(64, 64), g = cv.getContext('2d'), gr = g.createRadialGradient(32, 32, 2, 32, 32, 32); gr.addColorStop(0, 'rgba(255,255,255,0.6)'); gr.addColorStop(0.5, 'rgba(255,255,255,0.22)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, 64, 64); return new T.CanvasTexture(cv); })();
    for (let i = 0; i < 18; i++) { const sp = new T.Sprite(new T.SpriteMaterial({ map: dustTex, transparent: true, depthWrite: false, opacity: 0 })); sp.visible = false; scene.add(sp); puffs.push({ obj: sp, t: 1, life: 1, k: 1, v: new T.Vector3() }); }
    let puffI = 0;
    // o as plan's, at p
    function burst(p, o) {
      const L = LOOK[o.m || BY_FX[o.fx] || 'concrete'] || LOOK.concrete, ch = L.chips, n0 = o.n ? new T.Vector3(o.n[0], o.n[1], o.n[2]) : new T.Vector3(0, 1, 0), dir = o.dir ? new T.Vector3(o.dir.x != null ? o.dir.x : o.dir[0], o.dir.y != null ? o.dir.y : o.dir[1], o.dir.z != null ? o.dir.z : o.dir[2]) : null;
      const k = G.U.clamp(Math.sqrt((o.J == null ? 800 : o.J) / 800), 0.5, 1.6), out = o.k === 'x' && dir ? dir : o.k === 'r' && dir ? dir.clone().addScaledVector(n0, 0.5).normalize() : n0;
      if (ch) {
        const n = Math.round(ch.n * k * (o.k === 'x' ? 1.5 : 1));
        for (let i = 0; i < n; i++) {
          const b = P[idx], at = idx; idx = (idx + 1) % N;
          const sp = ch.v * (0.35 + Math.random()) * k, big = 0.5 + Math.random() * Math.random() * 2;
          b.on = true; b.i = at; b.p = (b.p || new T.Vector3()).copy(p).addScaledVector(n0, 0.01);
          b.v = (b.v || new T.Vector3()).copy(out).multiplyScalar(0.8).add(v.set(Math.random() - 0.5, Math.random() - 0.3, Math.random() - 0.5).multiplyScalar(1.3)).normalize().multiplyScalar(sp);
          if (b.v.dot(n0) < 0 && o.k !== 'x') b.v.addScaledVector(n0, -2 * b.v.dot(n0)); // (not back into the wall)
          b.a = b.a || new T.Vector3(); b.a.set(Math.random() * 14 - 7, Math.random() * 14 - 7, Math.random() * 14 - 7);
          b.r = (b.r || new T.Vector3()).set(Math.random() * 6, Math.random() * 6, Math.random() * 6);
          const sz = ch.size * big; b.s = (b.s || new T.Vector3()); if (ch.shape === 'sliver') b.s.set(sz * 0.14, sz * 1, sz * 0.22); else if (ch.shape === 'flake') b.s.set(sz, sz * 0.16, sz * 0.8); else b.s.set(sz * 0.6, sz * 0.5, sz * 0.6);
          b.g = ch.g; b.drag = ch.drag; b.life = ch.life * (0.7 + Math.random() * 0.6); b.t = 0; b.rest = false; b.floor = floor(p.x + b.v.x * 0.4, p.z + b.v.z * 0.4, p.y);
          mesh.setColorAt(at, c.setHex(ch.cols[Math.floor(Math.random() * ch.cols.length)])); mesh.instanceColor.needsUpdate = true;
        }
      }
      if (L.dust != null) {
        const u = puffs[puffI], m = u.obj; puffI = (puffI + 1) % puffs.length;
        u.t = 0; u.life = 1.6 + Math.random() * 1.2; u.k = 0.22 * k * (o.k === 'x' ? 1.5 : 1); u.v.copy(out).multiplyScalar(0.7 * k);
        m.position.copy(p).addScaledVector(n0, 0.03); m.material.color.setHex(L.dust); m.material.opacity = 0.7; m.scale.setScalar(u.k); m.visible = true;
      }
    }
    function update(dt) {
      if (dt <= 0) return;
      for (const b of P) {
        if (!b.on) continue;
        b.t += dt;
        if (b.t > b.life) { b.on = false; mesh.setMatrixAt(b.i, zero); dirty = true; continue; }
        if (b.rest) { if (b.t > b.life - 1) { const f = b.life - b.t; m4.compose(b.p, q.setFromEuler(e.set(b.r.x, b.r.y, b.r.z)), s.copy(b.s).multiplyScalar(f)); mesh.setMatrixAt(b.i, m4); dirty = true; } continue; }
        b.v.y -= b.g * dt; if (b.drag) b.v.multiplyScalar(Math.max(0, 1 - b.drag * dt));
        b.p.addScaledVector(b.v, dt); b.r.addScaledVector(b.a, dt);
        if (b.p.y <= b.floor + 0.004) { b.p.y = b.floor + 0.004; if (Math.abs(b.v.y) < 0.8) { b.rest = true; b.r.x = b.r.x > 3 ? Math.PI / 2 : 0; b.r.z = 0; } b.v.y *= -0.32; b.v.x *= 0.5; b.v.z *= 0.5; b.a.multiplyScalar(0.5); }
        m4.compose(b.p, q.setFromEuler(e.set(b.r.x, b.r.y, b.r.z)), b.s); mesh.setMatrixAt(b.i, m4); dirty = true;
      }
      if (dirty) { mesh.instanceMatrix.needsUpdate = true; dirty = false; }
      for (const u of puffs) {
        if (!u.obj.visible) continue;
        u.t += dt; const f = u.t / u.life;
        if (f >= 1) { u.obj.visible = false; continue; }
        u.obj.position.addScaledVector(u.v, dt); u.v.multiplyScalar(Math.max(0, 1 - 2.4 * dt)); u.obj.position.y -= 0.03 * dt;
        u.obj.scale.setScalar(u.k * (1 + 2.6 * Math.sqrt(f))); u.obj.material.opacity = 0.7 * (1 - f) * (1 - f);
      }
    }
    function clear() { for (const b of P) if (b.on) { b.on = false; mesh.setMatrixAt(b.i, zero); } mesh.instanceMatrix.needsUpdate = true; for (const u of puffs) u.obj.visible = false; }
    return { burst, update, clear };
  }
  return { plan, meshes, debris, flapMat };
})();
