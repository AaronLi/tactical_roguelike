'use strict';
// The rest of who lives in the apartments (docs/apartment-personas/): more entries for js/homes.js RESIDENTS, and what they
// own. The notes at the top of js/homes.js say what each field does. Pieces as js/furniture.js R (back at -z, against
// the wall), what stops a round in js/materials.js PROPS.
(() => {
  const R = G.Furniture.R, lit = (k, c, i = 1) => k.mat(c, 0.5, 0, { emissive: c, emissiveIntensity: i });
  // ---------------------------------------------------------------- pieces more than one of them has
  // A small bathroom basin on a pedestal, a mirror's worth of tap
  R.basin = { small: 1, w: 0.56, d: 0.46, boxes: [[0, 0, 0.56, 0.44, 0.9]], build(k) {
    const c = k.mat(0xeceae4, 0.25), m = k.mat(0xb8bcc0, 0.3, 0.8);
    k.cyl(c, 0.09, 0.12, 0.72, 0, 0.36, -0.06, 10); k.box(c, 0.56, 0.14, 0.44, 0, 0.8, 0); k.box(k.mat(0xc8c6c0, 0.2), 0.42, 0.01, 0.3, 0, 0.872, 0.02);
    k.cyl(m, 0.012, 0.012, 0.12, 0, 0.93, -0.17, 8); k.box(m, 0.02, 0.02, 0.11, 0, 0.985, -0.12);
  } };
  // A shower: a white tray, a glass screen, the head on its rail
  R.shower = { w: 0.92, d: 0.92, boxes: [[0, 0, 0.9, 0.9, 2.0]], build(k) {
    const m = k.mat(0xb8bcc0, 0.3, 0.8), g = k.mat(0xc4d6dc, 0.08, 0.2, { transparent: true, opacity: 0.2, depthWrite: false });
    k.box(k.mat(0xe8e6e0, 0.3), 0.9, 0.08, 0.9, 0, 0.04, 0); k.box(g, 0.9, 1.9, 0.01, 0, 1.03, 0.44); k.box(g, 0.01, 1.9, 0.9, -0.44, 1.03, 0);
    k.box(m, 0.02, 1.0, 0.02, 0.2, 1.4, -0.43); k.cyl(m, 0.07, 0.07, 0.02, 0.2, 1.92, -0.34, 12);
  } };
  // A floor lamp on a thin stand. style: shade, its colour
  R.flamp = { small: 1, w: 0.4, d: 0.4, boxes: [[0, 0, 0.34, 0.34, 1.62]], build(k, v, s) {
    const m = k.mat(0x2a2a2a, 0.4, 0.4);
    k.cyl(m, 0.14, 0.15, 0.03, 0, 0.015, 0, 12); k.cyl(m, 0.012, 0.012, 1.4, 0, 0.72, 0, 8); k.cyl(lit(k, s.shade || 0xe8d8b0, 0.7), 0.12, 0.17, 0.24, 0, 1.5, 0, 12);
  } };
  // A pot plant. style: dead, what's left of one
  R.potplant = { small: 1, w: 0.46, d: 0.46, boxes: [[0, 0, 0.4, 0.4, 0.95]], build(k, v, s) {
    k.cyl(k.mat(s.pot || 0xa0522d, 0.8), 0.17, 0.12, 0.28, 0, 0.14, 0, 12);
    const stem = k.mat(s.dead ? 0x6a5a3a : 0x3f5a2c, 0.8);
    for (let i = 0; i < 7; i++) { const a = i * 2.3 + k.rnd(), h = 0.32 + k.rnd() * 0.32; k.box(stem, 0.014, h, 0.014, Math.cos(a) * 0.06, 0.28 + h / 2, Math.sin(a) * 0.06, a, 0.2); if (!s.dead) k.ico(k.leaf(), 0.09 + k.rnd() * 0.04, Math.cos(a) * 0.12, 0.3 + h, Math.sin(a) * 0.12); }
  } };
  // A kitchen run. style: cab, top; on: what's left out on it
  R.kitrun = { w: 1.98, d: 0.64, cover: 1, boxes: [[0, 0, 1.98, 0.64, 0.92]], build(k, v, s) {
    const cab = k.mat(s.cab, 0.5), dark = k.mat(0x201c18, 0.9), metal = k.mat(0xb0b4b4, 0.3, 0.8), y = 0.92;
    k.box(dark, 1.9, 0.1, 0.56, 0, 0.05, -0.04); k.box(cab, 1.96, 0.78, 0.58, 0, 0.49, -0.02); k.box(k.mat(s.top, 0.3), 1.98, 0.04, 0.64, 0, 0.9, 0);
    for (const x of [-0.49, 0, 0.49]) k.box(dark, 0.006, 0.76, 0.005, x, 0.49, 0.272);
    for (const x of [-0.735, -0.245, 0.245, 0.735]) k.box(metal, 0.1, 0.014, 0.02, x, 0.8, 0.285);
    k.box(metal, 0.5, 0.012, 0.38, 0.6, 0.926, 0.03); k.box(dark, 0.42, 0.01, 0.3, 0.6, 0.933, 0.03); k.cyl(metal, 0.015, 0.018, 0.24, 0.6, 1.04, -0.2, 8);
    if (s.on === 'kettle') { k.cyl(metal, 0.075, 0.09, 0.2, -0.3, y + 0.1, -0.1, 12); k.box(k.mat(0x222222, 0.5), 0.16, 0.03, 0.03, -0.3, y + 0.23, -0.1); k.box(k.mat(0x3a3a3a, 0.6), 0.3, 0.06, 0.26, -0.72, y + 0.03, -0.05); }
    if (s.on === 'espresso') { k.box(k.mat(0xc8ccd0, 0.15, 0.9), 0.3, 0.34, 0.3, -0.5, y + 0.17, -0.1); k.box(k.mat(0x151515, 0.4), 0.2, 0.06, 0.1, -0.5, y + 0.14, 0.08); k.fruit(0.1, y, 0); }
    if (s.on === 'boxes') for (let i = 0; i < 9; i++) k.box(k.mat(k.pick([0xe8e4da, 0xc8302a, 0x8a6a42]), 0.8), 0.24, 0.05, 0.24, -0.85 + i * 0.13 + k.rnd() * 0.04, y + 0.025 + (i % 3) * 0.05, -0.1 + k.rnd() * 0.14, k.rnd());
    if (s.on === 'jars') for (let i = 0; i < 16; i++) k.cyl(k.mat(k.pick([0xd8a040, 0x9a4a2a, 0xc8c098, 0x5a7a3a]), 0.2), 0.05, 0.05, 0.12 + (i % 3) * 0.04, -0.9 + (i % 8) * 0.17, y + 0.08, -0.17 + (i >> 3) * 0.2, 10);
    if (s.on === 'tape') { k.box(k.mat(0xe0d8b0, 0.7), 0.04, 0.002, 0.62, -0.1, y + 0.001, 0); k.box(k.mat(0xe0d8b0, 0.7), 0.04, 0.5, 0.002, -0.1, 0.62, 0.287); for (let i = 0; i < 4; i++) k.cyl(k.mat(0xe6e2d8, 0.3), 0.1, 0.09, 0.012, 0.25 + k.rnd() * 0.05, y + 0.006 + i * 0.014, -0.05, 12); }
    if (s.on === 'pans') for (const x of [-0.6, -0.25]) k.cyl(k.mat(0x2a2a2a, 0.5, 0.4), 0.13, 0.11, 0.06, x, y + 0.03, -0.05, 14);
  } };
  // A fridge. style: c, its colour; magnets; tape, the door held shut
  R.icebox = { w: 0.74, d: 0.72, boxes: [[0, 0, 0.72, 0.7, 1.76]], build(k, v, s) {
    const c = k.mat(s.c || 0xe4e2dc, s.steel ? 0.25 : 0.35, s.steel ? 0.7 : 0.1), dark = k.mat(0x2a2622, 0.8), m = k.mat(0xb8bcc0, 0.3, 0.8);
    k.box(dark, 0.68, 0.08, 0.6, 0, 0.04, 0); k.box(c, 0.72, 1.68, 0.68, 0, 0.92, 0); k.box(dark, 0.7, 0.008, 0.005, 0, 1.26, 0.342); k.box(m, 0.03, 0.26, 0.03, -0.3, 1.04, 0.355); k.box(m, 0.03, 0.14, 0.03, -0.3, 1.42, 0.355);
    if (s.magnets) for (let i = 0; i < 14; i++) k.box(k.mat(k.pick([0xe8c040, 0xd8642a, 0x3a7aa8, 0xf0ece0, 0x70a050]), 0.6), 0.05 + k.rnd() * 0.1, 0.05 + k.rnd() * 0.12, 0.004, -0.2 + k.rnd() * 0.46, 0.8 + k.rnd() * 0.8, 0.343);
    if (s.tape) for (const y of [1.15, 1.38]) k.box(k.mat(0x9a9aa0, 0.5), 0.74, 0.05, 0.006, 0, y, 0.345);
  } };
  // A flat television on a low stand. style: stand, its colour
  R.flattv = { w: 1.5, d: 0.42, boxes: [[0, 0, 1.5, 0.42, 0.46], [0, -0.1, 1.28, 0.1, 1.2]], build(k, v, s) {
    const b = k.mat(0x111214, 0.3); k.box(k.mat(s.stand || 0x2a2622, 0.5), 1.5, 0.42, 0.42, 0, 0.21, 0); k.box(b, 0.3, 0.04, 0.2, 0, 0.44, -0.08); k.box(b, 1.28, 0.74, 0.04, 0, 0.84, -0.09); k.box(k.screen(), 1.22, 0.68, 0.004, 0, 0.84, -0.068);
  } };
  // A double bed. style: cover, sheet, frame; unmade; low (a platform, or a mattress on pallets)
  const bedBuild = (W) => (k, v, s) => {
    const f = k.mat(s.frame || 0x4a3a2c, 0.5), sheet = k.mat(s.sheet || 0xd8d6d0, 0.95), c = k.mat(s.cover, 0.95), lo = s.low ? 0.16 : 0.3;
    k.box(f, W, lo, 1.9, 0, lo / 2, 0.02); k.box(sheet, W - 0.06, 0.2, 1.84, 0, lo + 0.1, 0.02);
    k.box(sheet, W > 1.2 ? 0.6 : 0.6, 0.11, 0.36, W > 1.2 ? -0.38 : 0, lo + 0.25, -0.72); if (W > 1.2) k.box(sheet, 0.6, 0.11, 0.36, 0.38, lo + 0.25, -0.72, 0.1);
    if (s.unmade) { k.box(c, W - 0.2, 0.08, 0.9, 0.05, lo + 0.24, 0.42, 0.1); k.box(c, W * 0.6, 0.13, 0.42, -0.08, lo + 0.27, -0.14, -0.2, 0.14); }
    else { k.box(c, W + 0.02, 0.06, 1.42, 0, lo + 0.22, 0.22); k.box(k.mat(k.tint(s.cover, 1.25), 0.95), W + 0.02, 0.07, 0.16, 0, lo + 0.23, -0.42); }
    if (!s.low) k.box(f, W, 0.8, 0.06, 0, 0.5, -0.94);
  };
  R.bedd = { w: 1.6, d: 1.95, boxes: [[0, 0.02, 1.6, 1.9, 0.6]], build: bedBuild(1.6) };
  R.bedn = { w: 0.96, d: 1.95, boxes: [[0, 0.02, 0.96, 1.9, 0.6]], build: bedBuild(0.96) };
  // Three monitors on a desk with lights behind them, a tower under it. style: back, the glow
  R.rigdesk = { w: 1.8, d: 0.8, cover: 1, boxes: [[0, 0, 1.8, 0.8, 0.76], [0, -0.25, 1.7, 0.2, 1.22]], build(k, v, s) {
    const b = k.mat(0x141416, 0.4), g = lit(k, s.back || 0xff3fa4, 1.4);
    k.box(b, 1.8, 0.04, 0.8, 0, 0.74, 0); for (const x of [-0.84, 0.84]) k.box(b, 0.06, 0.72, 0.7, x, 0.36, 0);
    k.box(g, 1.72, 0.03, 0.012, 0, 0.77, -0.38);
    [[-0.56, 0.35], [0, 0], [0.56, -0.35]].forEach(([x, ry]) => { k.box(b, 0.54, 0.34, 0.03, x, 1.04, -0.22 + Math.abs(x) * 0.1, ry); k.box(k.screen(), 0.5, 0.3, 0.004, x, 1.04, -0.2 + Math.abs(x) * 0.1, ry); k.box(b, 0.05, 0.14, 0.05, x, 0.82, -0.25); });
    k.box(k.mat(0x1c1c20, 0.4), 0.38, 0.03, 0.14, 0, 0.775, 0.18); k.box(k.mat(0x18181c, 0.4), 0.22, 0.5, 0.46, 0.6, 0.25, 0.05); k.box(g, 0.004, 0.42, 0.38, 0.49, 0.25, 0.05);
  } };
  // A racing-style gaming chair, on its five-star base
  R.gamechair = { small: 1, w: 0.7, d: 0.7, boxes: [[0, 0, 0.56, 0.56, 1.3]], build(k, v, s) {
    const b = k.mat(0x18181a, 0.5), c = k.mat(s.c || 0xc0202e, 0.5);
    for (let i = 0; i < 5; i++) { const a = i * 1.257; k.box(b, 0.04, 0.03, 0.3, Math.sin(a) * 0.14, 0.06, Math.cos(a) * 0.14, a); }
    k.cyl(b, 0.03, 0.03, 0.34, 0, 0.24, 0, 8); k.box(b, 0.52, 0.1, 0.5, 0, 0.46, 0.02); k.box(c, 0.2, 0.11, 0.46, 0, 0.47, 0.02); k.box(b, 0.5, 0.74, 0.1, 0, 0.88, -0.22, 0, -0.12); k.box(c, 0.2, 0.72, 0.11, 0, 0.88, -0.215, 0, -0.12);
  } };
  // A ring light on a tripod
  R.ringlight = { small: 1, w: 0.46, d: 0.46, boxes: [[0, 0, 0.4, 0.4, 1.72]], build(k) {
    const b = k.mat(0x1c1c1e, 0.4, 0.4), l = lit(k, 0xf5f5f0, 1.3);
    for (const a of [0, 2.1, 4.2]) k.box(b, 0.02, 1.0, 0.02, Math.sin(a) * 0.13, 0.48, Math.cos(a) * 0.13, a, 0.27); k.cyl(b, 0.012, 0.012, 0.8, 0, 1.15, 0, 8);
    k.box(l, 0.4, 0.03, 0.03, 0, 1.72, 0); k.box(l, 0.4, 0.03, 0.03, 0, 1.36, 0); k.box(l, 0.03, 0.36, 0.03, -0.19, 1.54, 0); k.box(l, 0.03, 0.36, 0.03, 0.19, 1.54, 0);
  } };
  // Cardboard cartons in a pile, as they came. style: h, how many rows
  R.cartons = { w: 1.2, d: 0.62, cover: 1, boxes: [[0, 0, 1.2, 0.6, 1.25]], build(k, v, s) {
    const c = [0xb08a5c, 0xa07c50, 0xc09a68, 0xe8e6e0];
    for (let y = 0; y < (s.h || 3); y++) for (let x = 0; x < 2; x++) { const h = 0.36 + k.rnd() * 0.05; k.box(k.mat(k.pick(c), 0.9), 0.54, h, 0.52, -0.28 + x * 0.57 + k.rnd() * 0.03, 0.2 + y * 0.42, k.rnd() * 0.05, (k.rnd() - 0.5) * 0.14); k.box(k.mat(0xc8b890, 0.5), 0.54, 0.002, 0.06, -0.28 + x * 0.57, 0.39 + y * 0.42, 0); }
  } };
  // A map on the wall with pins in it. style: c, what it's printed in; pin
  R.pinmap = { hung: 1, w: 0.9, build(k, v, s) {
    const y = s.h; k.box(k.mat(0x18181a, 0.5), 0.92, 0.62, 0.02, 0, y, 0.01); k.box(k.mat(s.c || 0x7a8a9a, 0.8), 0.86, 0.56, 0.004, 0, y, 0.022);
    for (let i = 0; i < 6; i++) k.box(k.mat(0xc8ccd0, 0.8), i < 3 ? 0.84 : 0.01, i < 3 ? 0.01 : 0.54, 0.002, i < 3 ? 0 : -0.3 + (i - 3) * 0.3, i < 3 ? y - 0.18 + i * 0.18 : y, 0.025);
    for (let i = 0; i < 9; i++) k.sph(k.mat(s.pin || 0xc02020, 0.4), 0.012, -0.38 + k.rnd() * 0.76, y - 0.23 + k.rnd() * 0.46, 0.03);
  } };
  // Clothes on a hook. style: c
  R.hookd = { hung: 1, w: 0.5, build(k, v, s) { const c = k.mat(s.c, 0.9), y = s.h; k.box(k.mat(0x888888, 0.3, 0.8), 0.04, 0.04, 0.06, 0, y + 0.3, 0.03); k.box(c, 0.46, 0.6, 0.05, 0, y, 0.04); k.box(c, 0.1, 0.44, 0.05, -0.27, y + 0.06, 0.04); k.box(c, 0.1, 0.44, 0.05, 0.27, y + 0.06, 0.04); } };
  // A bicycle on wall hooks. style: c
  R.wallbike = { hung: 1, w: 1.6, build(k, v, s) {
    const c = k.mat(s.c || 0x2f8a8a, 0.4, 0.3), t = k.mat(0x151515, 0.8), y = s.h;
    for (const x of [-0.52, 0.52]) { k.cyl(t, 0.33, 0.33, 0.04, x, y, 0.1, 18, Math.PI / 2); k.cyl(k.mat(0xc8c8c8, 0.3, 0.8), 0.29, 0.29, 0.042, x, y, 0.1, 18, Math.PI / 2); k.cyl(k.mat(0x2a2a2a, 0.4), 0.27, 0.27, 0.044, x, y, 0.1, 18, Math.PI / 2); }
    k.box(c, 1.02, 0.03, 0.03, 0, y + 0.18, 0.1); k.box(c, 0.03, 0.46, 0.03, -0.05, y + 0.02, 0.1, 0, 0); k.box(c, 0.6, 0.03, 0.03, -0.26, y + 0.02, 0.1, 0, 0); k.box(k.mat(0x151515, 0.6), 0.2, 0.04, 0.07, -0.05, y + 0.28, 0.1);
  } };

  // ---------------------------------------------------------------- Stan's shop
  R.lathe = { w: 1.4, d: 0.62, cover: 1, boxes: [[0, 0, 1.4, 0.6, 1.2]], build(k) {
    const g = k.mat(0x6a7a6a, 0.5, 0.3), d = k.mat(0x3a4238, 0.5, 0.4), m = k.mat(0xb8bcc0, 0.25, 0.85), brass = k.mat(0xc8a040, 0.3, 0.8);
    for (const x of [-0.56, 0.56]) k.box(g, 0.24, 0.8, 0.5, x, 0.4, 0); k.box(k.mat(0xb09868, 0.9), 1.3, 0.01, 0.6, 0, 0.005, 0);
    k.box(g, 1.36, 0.1, 0.34, 0, 0.85, 0); k.box(d, 0.36, 0.3, 0.36, -0.5, 1.05, 0); k.cylX(m, 0.07, 0.07, 0.12, -0.26, 1.05, 0, 12); k.cylX(brass, 0.02, 0.02, 0.3, -0.06, 1.05, 0, 8); k.box(d, 0.14, 0.2, 0.2, 0.5, 1.0, 0); k.box(m, 0.2, 0.08, 0.26, 0.06, 0.94, 0.02);
    for (let i = 0; i < 16; i++) k.box(m, 0.012, 0.002, 0.03, -0.5 + k.rnd(), 0.902, -0.14 + k.rnd() * 0.3, k.rnd() * 3);
  } };
  R.toolbench = { w: 1.9, d: 0.72, cover: 1, boxes: [[0, 0, 1.9, 0.7, 0.92]], build(k) {
    const w = k.mat(0x8a6a42, 0.7), s = k.mat(0x4a4a48, 0.5, 0.5), b = k.mat(0x5a6a7a, 0.45, 0.5);
    k.box(w, 1.9, 0.06, 0.7, 0, 0.89, 0); for (const x of [-0.88, 0.88]) for (const z of [-0.3, 0.3]) k.box(s, 0.06, 0.86, 0.06, x, 0.43, z); k.box(w, 1.76, 0.03, 0.56, 0, 0.3, 0);
    k.box(b, 0.2, 0.12, 0.14, 0.62, 0.98, 0.25); k.box(b, 0.04, 0.03, 0.22, 0.62, 1.0, 0.28); k.cyl(k.mat(0xc8c8c0, 0.4, 0.7), 0.09, 0.09, 0.18, -0.68, 1.01, -0.2, 12);
    k.box(k.mat(0xece4c4, 0.8), 0.22, 0.05, 0.1, -0.2, 0.945, 0.1, 0.4); k.box(k.mat(0x6a6660, 0.8), 0.6, 0.12, 0.42, 0, 0.24, 0.06);
  } };
  R.toolchest = { small: 1, w: 0.82, d: 0.52, boxes: [[0, 0, 0.8, 0.5, 1.0]], build(k) {
    const r = k.mat(0xb8402a, 0.35, 0.3), m = k.mat(0xc0c4c8, 0.3, 0.8);
    k.box(r, 0.8, 0.86, 0.5, 0, 0.53, 0); k.box(r, 0.82, 0.04, 0.52, 0, 0.98, 0); for (let i = 0; i < 6; i++) { k.box(k.mat(0x1c1c1c, 0.8), 0.76, 0.004, 0.004, 0, 0.26 + i * 0.13, 0.251); k.box(m, 0.26, 0.016, 0.02, 0, 0.21 + i * 0.13, 0.26); } for (const x of [-0.33, 0.33]) k.cyl(k.mat(0x222222, 0.8), 0.05, 0.05, 0.05, x, 0.05, 0.15, 10, 0);
  } };
  R.drillpress = { small: 1, w: 0.52, d: 0.62, boxes: [[0, 0, 0.48, 0.6, 1.62]], build(k) {
    const g = k.mat(0x6a6e6a, 0.45, 0.4), y = k.mat(0xd0a020, 0.4), m = k.mat(0xb0b4b8, 0.3, 0.8);
    k.box(g, 0.46, 0.05, 0.56, 0, 0.025, 0); k.cyl(m, 0.035, 0.035, 1.5, 0, 0.78, -0.18, 10); k.box(g, 0.3, 0.04, 0.3, 0, 0.82, 0.08); k.box(y, 0.26, 0.3, 0.44, 0, 1.42, 0); k.cyl(m, 0.016, 0.016, 0.28, 0, 1.14, 0.12, 8); k.box(m, 0.3, 0.02, 0.02, 0.2, 1.3, 0.1, 0.5);
  } };
  R.pegboard = { hung: 1, w: 1.5, build(k, v, s) {
    const y = s.h, c = k.mat(0xe6e0cc, 0.8), m = k.mat(0x5a5e62, 0.4, 0.6); k.box(c, 1.5, 1.0, 0.02, 0, y, 0.012);
    for (let i = 0; i < 9; i++) { const x = -0.6 + (i % 5) * 0.3, yy = y + (i < 5 ? 0.2 : -0.22), h = 0.2 + (i * 7 % 4) * 0.05; k.box(k.mat(0x2a2a2a, 0.8), 0.07, h + 0.04, 0.002, x, yy, 0.023); k.box(i % 3 ? m : k.mat(0xb8402a, 0.5), 0.04, h, 0.02, x, yy, 0.034); }
  } };
  // ---------------------------------------------------------------- the stash flat
  R.floorbed = { w: 0.96, d: 1.95, boxes: [[0, 0, 0.92, 1.9, 0.24]], build(k, v, s) { k.box(k.mat(0x6a6f78, 0.95), 0.92, 0.2, 1.9, 0, 0.1, 0); k.box(k.mat(0x4c4a42, 1), 0.4, 0.002, 0.5, 0.1, 0.201, 0.2, 0.5); k.box(k.mat(0x2e3a30, 0.9), 0.7, 0.12, 1.4, 0, 0.26, 0.2, 0.05); } };
  R.tubs = { w: 0.68, d: 0.5, cover: 1, boxes: [[0, 0, 0.66, 0.48, 1.6]], build(k) { for (let i = 0; i < 4; i++) { k.box(k.mat(0x6a6e72, 0.5), 0.6, 0.34, 0.42, (k.rnd() - 0.5) * 0.03, 0.17 + i * 0.4, 0); k.box(k.mat(0xe8e8e4, 0.5), 0.64, 0.05, 0.46, 0, 0.365 + i * 0.4, 0, (k.rnd() - 0.5) * 0.06); } } };
  R.sportbags = { w: 0.82, d: 0.48, cover: 1, boxes: [[0, 0, 0.8, 0.46, 0.84]], build(k) { for (let i = 0; i < 3; i++) { k.box(k.mat(i % 2 ? 0xa02020 : 0x141416, 0.8), 0.74, 0.27, 0.4, (k.rnd() - 0.5) * 0.05, 0.14 + i * 0.27, 0, (k.rnd() - 0.5) * 0.12); k.box(k.mat(0xc8c8c8, 0.4, 0.5), 0.6, 0.008, 0.01, 0, 0.27 + i * 0.27, 0.1); } } };
  R.pizzas = { small: 1, w: 0.46, d: 0.46, boxes: [[0, 0, 0.4, 0.4, 0.8]], build(k) { for (let i = 0; i < 14; i++) { k.box(k.mat(i % 3 ? 0xece8dc : 0xb83a2a, 0.8), 0.36, 0.05, 0.36, (k.rnd() - 0.5) * 0.04, 0.03 + i * 0.056, (k.rnd() - 0.5) * 0.04, (k.rnd() - 0.5) * 0.2); } } };
  R.foldtable = { w: 1.22, d: 0.62, boxes: [[0, 0, 1.2, 0.6, 0.76]], build(k) {
    const c = k.mat(0xcfc4a8, 0.5), m = k.mat(0x8a8a88, 0.4, 0.6); k.box(c, 1.2, 0.04, 0.6, 0, 0.72, 0); for (const x of [-0.45, 0.45]) { k.box(m, 0.03, 0.74, 0.03, x, 0.36, 0.2, 0, 0.1); k.box(m, 0.03, 0.74, 0.03, x, 0.36, -0.2, 0, -0.1); }
    for (let i = 0; i < 12; i++) k.box(k.mat(0xdcdcd8, 0.3), 0.06, 0.012, 0.09, -0.45 + k.rnd() * 0.9, 0.748, -0.2 + k.rnd() * 0.4, k.rnd() * 3);
  } };
  R.lantern = { small: 1, w: 0.26, d: 0.26, boxes: [[0, 0, 0.2, 0.2, 0.26]], build(k) { k.cyl(k.mat(0xd8641a, 0.5), 0.09, 0.1, 0.05, 0, 0.025, 0, 10); k.cyl(lit(k, 0xffd48a, 0.6), 0.06, 0.06, 0.13, 0, 0.115, 0, 10); k.cyl(k.mat(0xd8641a, 0.5), 0.09, 0.08, 0.04, 0, 0.2, 0, 10); } };
  R.lockbox = { small: 1, w: 0.52, d: 0.3, boxes: [[0, 0, 0.5, 0.26, 0.28]], build(k) { k.box(k.mat(0xd8b020, 0.4), 0.5, 0.26, 0.26, 0, 0.13, 0); k.box(k.mat(0x2a2a2a, 0.5), 0.52, 0.02, 0.27, 0, 0.27, 0); k.box(k.mat(0xb0b4b8, 0.3, 0.8), 0.06, 0.07, 0.03, 0, 0.2, 0.14); } };
  // ---------------------------------------------------------------- Mags's stock
  R.tvstack = { w: 1.12, d: 0.42, cover: 1, boxes: [[0, 0, 1.1, 0.4, 1.24]], build(k) { for (let i = 0; i < 9; i++) { const x = -0.45 + (i % 3) * 0.45, y = 0.21 + (i >> 1) * 0; k.box(k.mat(k.pick([0x2a2a2e, 0x121214, 0xe0e0dc]), 0.5), 0.09, 0.62 + k.rnd() * 0.1, 0.36, x + (i >> 2) * 0.1 - 0.1, y + 0.2, 0); } for (let i = 0; i < 3; i++) k.box(k.mat(0xb08a5c, 0.9), 1.06, 0.14, 0.38, 0, 0.82 + i * 0.15, 0, (k.rnd() - 0.5) * 0.06); } };
  R.heaptable = { w: 1.9, d: 1.1, cover: 1, boxes: [[0, 0, 1.9, 1.05, 1.15]], build(k) {
    const c = k.mat(0xdedad0, 0.95), w = k.mat(0x5e3e26, 0.5); for (const x of [-0.85, 0.85]) for (const z of [-0.42, 0.42]) k.box(w, 0.07, 0.72, 0.07, x, 0.36, z); k.box(c, 1.92, 0.06, 1.06, 0, 0.75, 0); k.box(c, 1.92, 0.38, 0.01, 0, 0.58, 0.53); k.box(c, 1.92, 0.38, 0.01, 0, 0.58, -0.53);
    for (let i = 0; i < 16; i++) k.box(k.mat(k.pick([0xece8dc, 0xc8ccd0, 0x2a2a2e, 0xb08a5c]), 0.6), 0.2 + k.rnd() * 0.24, 0.06 + k.rnd() * 0.16, 0.2 + k.rnd() * 0.2, -0.75 + k.rnd() * 1.5, 0.82 + (i % 4) * 0.08, -0.38 + k.rnd() * 0.76, k.rnd() * 3);
  } };
  R.tallspk = { small: 1, w: 0.42, d: 0.4, boxes: [[0, 0, 0.36, 0.34, 1.2]], build(k) { k.box(k.mat(0x141416, 0.5), 0.36, 1.2, 0.34, 0, 0.6, 0); for (const [y, r] of [[0.92, 0.13], [0.5, 0.15]]) k.cyl(k.mat(0xd8641a, 0.5), r, r, 0.01, 0, y, 0.175, 16, Math.PI / 2); } };
  R.goldmirror = { hung: 1, w: 0.9, build(k, v, s) { const y = s.h, g = k.mat(0xc8a040, 0.3, 0.8); k.box(g, 0.9, 1.3, 0.04, 0, y, 0.02); k.box(k.mat(0xbcd0d8, 0.08, 0.9), 0.74, 1.14, 0.005, 0, y, 0.043); for (const q of [-1, 1]) k.box(g, 1.02, 0.08, 0.05, 0, y + q * 0.68, 0.025); } };
  // ---------------------------------------------------------------- Teo's four small things
  R.cardtable = { w: 1.0, d: 1.3, boxes: [[0, 0, 0.9, 0.9, 0.76], [0, 0.62, 0.42, 0.42, 0.95]], build(k) {
    const w = k.mat(0x1f1a16, 0.4), g = k.mat(0x2f5d3f, 0.95); k.box(w, 0.9, 0.04, 0.9, 0, 0.74, 0); k.box(g, 0.82, 0.004, 0.82, 0, 0.762, 0); for (const x of [-0.4, 0.4]) for (const z of [-0.4, 0.4]) k.box(w, 0.05, 0.72, 0.05, x, 0.36, z);
    k.box(w, 0.42, 0.04, 0.42, 0, 0.46, 0.62); k.box(w, 0.42, 0.46, 0.03, 0, 0.7, 0.82); for (const x of [-0.17, 0.17]) for (const z of [0.45, 0.8]) k.box(w, 0.03, 0.44, 0.03, x, 0.22, z);
    k.box(k.mat(0xc0c4c8, 0.2, 0.8), 0.3, 0.012, 0.2, -0.12, 0.77, -0.1); k.cyl(k.mat(0x8a5a20, 0.15), 0.05, 0.06, 0.2, -0.16, 0.876, -0.1, 8); for (const x of [-0.02, 0.06]) k.cyl(k.mat(0xdcecf0, 0.1), 0.03, 0.026, 0.07, x, 0.81, -0.1, 8);
  } };
  R.wallsafe = { hung: 1, w: 0.46, build(k, v, s) { const y = s.h, m = k.mat(0x5a5e62, 0.35, 0.7); k.box(m, 0.46, 0.46, 0.03, 0, y, 0.016); k.cyl(k.mat(0x2a2a2c, 0.3, 0.8), 0.06, 0.06, 0.03, 0.06, y, 0.04, 14, Math.PI / 2); k.box(k.mat(0x9a9ea2, 0.3, 0.8), 0.03, 0.12, 0.03, -0.16, y, 0.04); } };
  R.stairmon = { hung: 1, w: 0.44, build(k, v, s) { const y = s.h; k.box(k.mat(0x141416, 0.4), 0.44, 0.3, 0.05, 0, y, 0.03); k.box(lit(k, 0x8a9490, 0.8), 0.4, 0.26, 0.004, 0, y, 0.057); for (let i = 0; i < 5; i++) k.box(k.mat(0x3a4240, 0.5), 0.3 - i * 0.04, 0.02, 0.002, 0.02 * i, y - 0.1 + i * 0.045, 0.06); } };
  // ---------------------------------------------------------------- Priya, the Okafor-Reyes, Tomasz and Elliot
  R.yogamat = { small: 1, w: 0.2, d: 0.2, boxes: [[0, 0, 0.16, 0.16, 0.66]], build(k) { k.cyl(k.mat(0x6e4a6b, 0.8), 0.07, 0.07, 0.64, 0.02, 0.32, 0, 12, 0.08); } };
  R.textbooks = { small: 1, w: 0.34, d: 0.28, boxes: [[0, 0, 0.3, 0.24, 0.5]], build(k) { for (let i = 0; i < 9; i++) k.box(k.mat(k.pick([0xe07a20, 0xf0ece0, 0xd8641a]), 0.5), 0.27, 0.05, 0.22, (k.rnd() - 0.5) * 0.02, 0.03 + i * 0.054, 0, (k.rnd() - 0.5) * 0.2); } };
  R.boots = { small: 1, w: 0.36, d: 0.34, boxes: [[0, 0, 0.3, 0.3, 0.2]], build(k, v, s) { const c = k.mat(s.c || 0xa77b3d, 0.75); for (const x of [-0.08, 0.08]) { k.box(k.mat(0x1c1a18, 0.9), 0.11, 0.03, 0.3, x, 0.015, 0); k.box(c, 0.1, 0.09, 0.27, x, 0.07, 0.01); k.box(c, 0.1, 0.1, 0.13, x, 0.16, -0.06); } } };
  // ---------------------------------------------------------------- Dessa's studio
  R.kiln = { w: 1.02, d: 1.02, cover: 1, boxes: [[0, 0, 1.0, 1.0, 1.15]], build(k) {
    const m = k.mat(0x8a8e92, 0.45, 0.5); k.box(k.mat(0x2a2a2c, 0.5), 0.9, 0.12, 0.9, 0, 0.06, 0); k.box(m, 1.0, 0.92, 1.0, 0, 0.58, 0); k.box(k.mat(0x6a6e72, 0.45, 0.5), 1.02, 0.1, 1.02, 0, 1.09, 0); k.box(lit(k, 0xff8a2a, 1.6), 0.96, 0.012, 0.012, 0, 1.03, 0.508); k.box(k.mat(0x1c1c1e, 0.4), 0.2, 0.26, 0.02, 0.3, 0.8, 0.51); k.box(lit(k, 0xff3020, 1), 0.04, 0.02, 0.006, 0.3, 0.88, 0.522);
  } };
  R.wheel = { w: 0.82, d: 0.82, cover: 1, boxes: [[0, 0, 0.78, 0.78, 0.62]], build(k) {
    const b = k.mat(0x3d6fa3, 0.45), c = k.mat(0x9a948a, 0.9); k.box(b, 0.64, 0.44, 0.64, 0, 0.22, 0); k.cyl(c, 0.38, 0.34, 0.1, 0, 0.5, 0, 18); k.cyl(k.mat(0x6e6a64, 0.7), 0.17, 0.17, 0.04, 0, 0.57, 0, 16); k.cyl(k.mat(0xb9b2a6, 0.8), 0.07, 0.1, 0.16, 0, 0.67, 0, 12); k.box(k.mat(0x6a4e36, 0.7), 0.3, 0.28, 0.3, 0, 0.14, 0.6);
  } };
  R.dryrack = { w: 1.5, d: 0.42, boxes: [[0, 0, 1.5, 0.4, 1.96]], build(k) {
    const m = k.mat(0x4a4e52, 0.5, 0.5); for (const x of [-0.73, 0.73]) for (const z of [-0.18, 0.18]) k.box(m, 0.03, 1.96, 0.03, x, 0.98, z);
    for (const y of [0.2, 0.68, 1.16, 1.64]) { k.box(m, 1.46, 0.02, 0.38, 0, y, 0); for (let i = 0; i < 6; i++) { const r = 0.05 + k.rnd() * 0.05, h = 0.1 + k.rnd() * 0.2; k.cyl(k.mat(k.pick([0xb9b2a6, 0xc8c0b2, 0xa89e90]), 0.9), r + k.rnd() * 0.03, r, h, -0.6 + i * 0.24, y + 0.01 + h / 2, (k.rnd() - 0.5) * 0.12, 10); } }
  } };
  R.glazes = { w: 0.96, d: 0.42, boxes: [[0, 0, 0.94, 0.4, 0.42]], build(k) { for (let i = 0; i < 3; i++) { const x = -0.3 + i * 0.31; k.cyl(k.mat(0xe6e6e6, 0.5), 0.15, 0.13, 0.34, x, 0.17, 0, 12); k.cyl(k.mat(0xdcdcdc, 0.5), 0.155, 0.155, 0.03, x + 0.02, 0.36, 0, 12, 0.14); } } };
  R.claysacks = { w: 0.92, d: 0.6, cover: 1, boxes: [[0, 0, 0.9, 0.58, 0.96]], build(k) { for (let i = 0; i < 5; i++) k.box(k.mat(0xd6d0c2, 0.95), 0.84, 0.17, 0.54, (k.rnd() - 0.5) * 0.04, 0.09 + i * 0.19, 0, (k.rnd() - 0.5) * 0.1); } };
  R.clothesrail = { w: 1.3, d: 0.5, boxes: [[0, 0, 1.3, 0.46, 1.6]], build(k) { const m = k.mat(0x8a8e92, 0.3, 0.7); for (const x of [-0.62, 0.62]) { k.box(m, 0.03, 1.6, 0.03, x, 0.8, 0); k.box(m, 0.04, 0.03, 0.44, x, 0.03, 0); } k.box(m, 1.27, 0.03, 0.03, 0, 1.56, 0); for (let i = 0; i < 9; i++) k.box(k.mat(k.pick([0x8a3a2a, 0x2f7f7a, 0xd8a63a, 0xe6dcc0, 0x3a3a48]), 0.9), 0.05, 0.8 + k.rnd() * 0.3, 0.38, -0.5 + i * 0.125, 1.0, 0); } };
  R.tapestry = { hung: 1, w: 1.9, build(k, v, s) { const y = s.h, c = [0xa84a26, 0xe6dcc4, 0x7a3a22, 0xc8843a]; k.box(k.mat(0x6a4e36, 0.6), 2.0, 0.04, 0.04, 0, y + 0.72, 0.03); for (let i = 0; i < 16; i++) k.box(k.mat(c[i % 4], 1), 0.117, 1.4, 0.008, -0.88 + i * 0.117, y, 0.016); } };
  // ---------------------------------------------------------------- Kez's room
  R.foampanels = { hung: 1, w: 1.8, build(k, v, s) { const y = s.h; for (let c = 0; c < 6; c++) for (let r = 0; r < 3; r++) k.box(k.mat(c + r & 1 ? 0x2b2b2f : 0x34343a, 1), 0.28, 0.28, 0.05, -0.75 + c * 0.3, y - 0.3 + r * 0.3, 0.026); } };
  R.greenscreen = { hung: 1, w: 1.9, build(k, v, s) { const y = s.h; k.box(k.mat(0x1c1c1e, 0.4), 1.96, 0.04, 0.05, 0, y + 0.92, 0.04); k.box(k.mat(0x3fbf3f, 0.9), 1.9, 1.84, 0.01, 0, y, 0.02); } };
  R.canpyramid = { w: 1.02, d: 0.62, boxes: [[0, 0, 1.0, 0.6, 0.98]], build(k) {
    for (let y = 0; y < 7; y++) for (let x = 0; x < 7 - y; x++) for (let z = 0; z < 2; z++) k.cyl(k.mat(k.pick([0xc8ccd0, 0x70e040, 0xc8ccd0]), 0.3, 0.5), 0.05, 0.05, 0.13, -0.42 + y * 0.07 + x * 0.14, 0.066 + y * 0.135, -0.1 + z * 0.2, 8);
  } };
  R.pctower = { small: 1, w: 0.26, d: 0.5, boxes: [[0, 0, 0.22, 0.46, 0.5]], build(k) { k.box(k.mat(0x141416, 0.4), 0.22, 0.5, 0.46, 0, 0.25, 0); k.box(lit(k, 0x8a4dff, 1.4), 0.004, 0.44, 0.4, 0.112, 0.25, 0); } };
  R.livesign = { hung: 1, w: 0.5, build(k, v, s) { const y = s.h; k.box(k.mat(0x141416, 0.4), 0.5, 0.2, 0.04, 0, y, 0.022); k.box(lit(k, 0xff2020, 1.8), 0.44, 0.14, 0.004, 0, y, 0.044); } };
  // ---------------------------------------------------------------- what Tobias paid for
  R.barcart = { small: 1, w: 0.82, d: 0.46, boxes: [[0, 0, 0.78, 0.42, 0.95]], build(k) { const b = k.mat(0xb8924a, 0.25, 0.9), g = k.mat(0x2a2a2c, 0.1, 0.3); for (const x of [-0.37, 0.37]) for (const z of [-0.19, 0.19]) k.cyl(b, 0.012, 0.012, 0.86, x, 0.43, z, 8); for (const y of [0.3, 0.76]) k.box(g, 0.78, 0.015, 0.42, 0, y, 0); for (let i = 0; i < 5; i++) k.cyl(k.mat(k.pick([0x8a5a20, 0x2a4a2a, 0xdcecf0]), 0.15), 0.035, 0.04, 0.24, -0.28 + i * 0.14, 0.89, 0, 8); } };
  R.treadmill = { w: 0.86, d: 1.7, cover: 1, boxes: [[0, 0.1, 0.84, 1.5, 0.2], [0, -0.68, 0.84, 0.16, 1.3]], build(k) { const b = k.mat(0x18181a, 0.4); k.box(b, 0.84, 0.16, 1.5, 0, 0.08, 0.1); k.box(k.mat(0x2e2e30, 0.9), 0.56, 0.01, 1.36, 0, 0.165, 0.1); for (const x of [-0.38, 0.38]) k.box(b, 0.06, 1.2, 0.06, x, 0.66, -0.62, 0, 0.14); k.box(b, 0.8, 0.24, 0.1, 0, 1.26, -0.72, 0, 0.5); k.box(k.screen(), 0.4, 0.14, 0.004, 0, 1.28, -0.67, 0, 0.5); } };
  R.winefridge = { small: 1, w: 0.62, d: 0.62, boxes: [[0, 0, 0.6, 0.6, 1.5]], build(k) { k.box(k.mat(0x101012, 0.2, 0.5), 0.6, 1.5, 0.6, 0, 0.75, 0); k.box(k.mat(0x1c2a34, 0.08, 0.3), 0.52, 1.36, 0.01, 0, 0.75, 0.302); k.box(lit(k, 0x3a7aff, 1.5), 0.5, 0.012, 0.004, 0, 1.4, 0.31); for (let y = 0; y < 5; y++) for (let x = 0; x < 3; x++) k.cylX(k.mat(0x2a3a2a, 0.2), 0.035, 0.035, 0.02, -0.15 + x * 0.15, 0.25 + y * 0.25, 0.3, 8); } };
  R.canvas = { hung: 1, w: 1.9, build(k, v, s) { const y = s.h; k.box(k.mat(0x111112, 0.8), 1.9, 1.3, 0.04, 0, y, 0.022); k.box(k.mat(0xb3202a, 0.8), 0.9, 0.86, 0.004, -0.36, y + 0.12, 0.044); k.box(k.mat(0xb3202a, 0.8), 0.4, 0.3, 0.004, 0.56, y - 0.38, 0.044); k.box(k.mat(0xece6d8, 0.8), 0.14, 1.26, 0.004, 0.22, y, 0.045); } };
  R.standdesk = { w: 1.42, d: 0.72, boxes: [[0, 0, 1.4, 0.7, 1.08], [0, -0.22, 1.36, 0.16, 1.5]], build(k) { const w = k.mat(0xece8e0, 0.4), b = k.mat(0x141416, 0.35); k.box(w, 1.4, 0.04, 0.7, 0, 1.06, 0); for (const x of [-0.6, 0.6]) { k.box(b, 0.05, 1.04, 0.05, x, 0.52, 0); k.box(b, 0.06, 0.03, 0.6, x, 0.015, 0); } [-0.46, 0, 0.46].forEach((x) => { k.box(b, 0.44, 0.27, 0.03, x, 1.3, -0.2); k.box(k.screen(), 0.41, 0.24, 0.004, x, 1.3, -0.183); }); } };
  // ---------------------------------------------------------------- a house's worth, the Vargas'
  R.piano = { w: 1.5, d: 0.62, cover: 1, boxes: [[0, 0, 1.5, 0.6, 1.26]], build(k) {
    const b = k.mat(0x0e0e10, 0.2, 0.2); k.box(b, 1.5, 1.2, 0.34, 0, 0.6, -0.13); k.box(b, 1.52, 0.04, 0.38, 0, 1.22, -0.13); k.box(b, 1.5, 0.12, 0.3, 0, 0.72, 0.16); k.box(k.mat(0xf0ece0, 0.3), 1.36, 0.02, 0.15, 0, 0.785, 0.2); for (let i = 0; i < 26; i++) if (i % 7 !== 2 && i % 7 !== 6) k.box(b, 0.02, 0.02, 0.09, -0.63 + i * 0.05, 0.8, 0.17); for (const x of [-0.7, 0.7]) k.box(b, 0.06, 0.68, 0.06, x, 0.34, 0.24);
    for (let i = 0; i < 6; i++) k.box(k.mat(i % 2 ? 0xb8a060 : 0x3a2414, 0.4, i % 2 ? 0.7 : 0), 0.13, 0.17, 0.012, -0.55 + i * 0.22, 1.33, -0.14, (i - 2.5) * 0.14, -0.1);
  } };
  R.grandclock = { small: 1, w: 0.52, d: 0.32, boxes: [[0, 0, 0.5, 0.3, 2.06]], build(k) { const m = k.mat(0x3e1e14, 0.35), b = k.mat(0xb8a060, 0.3, 0.85); k.box(m, 0.5, 0.42, 0.3, 0, 0.21, 0); k.box(m, 0.36, 1.08, 0.24, 0, 0.96, 0); k.box(m, 0.5, 0.56, 0.3, 0, 1.78, 0); k.cyl(k.mat(0xf0ece0, 0.5), 0.17, 0.17, 0.01, 0, 1.78, 0.155, 18, Math.PI / 2); k.box(b, 0.02, 0.5, 0.01, 0, 1.0, 0.125); k.cyl(b, 0.06, 0.06, 0.01, 0, 0.74, 0.125, 12, Math.PI / 2); k.box(k.mat(0x111111, 0.5), 0.006, 0.12, 0.003, 0, 1.83, 0.163); } };
  R.chaise = { w: 1.8, d: 0.8, cover: 1, boxes: [[0, 0, 1.8, 0.78, 0.8]], build(k) { const f = k.mat(0x1f6a48, 0.9), d = k.mat(0x2e1d10, 0.45); for (const x of [-0.8, 0.8]) for (const z of [-0.32, 0.32]) k.box(d, 0.06, 0.16, 0.06, x, 0.08, z); k.box(f, 1.8, 0.26, 0.78, 0, 0.29, 0); k.box(k.mat(k.tint(0x1f6a48, 1.15), 0.9), 1.72, 0.1, 0.7, 0, 0.47, 0); k.box(f, 0.3, 0.62, 0.78, -0.76, 0.5, 0); k.box(f, 1.1, 0.34, 0.14, -0.2, 0.62, -0.33); } };
  R.dressform = { small: 1, w: 0.44, d: 0.44, boxes: [[0, 0, 0.36, 0.36, 1.5]], build(k) { const c = k.mat(0xc8b890, 0.9), w = k.mat(0x3a2414, 0.45); k.cyl(w, 0.16, 0.18, 0.03, 0, 0.015, 0, 12); k.cyl(w, 0.018, 0.018, 0.86, 0, 0.45, 0, 8); k.cyl(c, 0.14, 0.17, 0.3, 0, 0.98, 0, 12); k.cyl(c, 0.15, 0.13, 0.26, 0, 1.25, 0, 12); k.cyl(c, 0.04, 0.05, 0.1, 0, 1.43, 0, 8); k.cyl(w, 0.06, 0.06, 0.02, 0, 1.49, 0, 8); } };
  R.rolledcarpet = { small: 1, w: 0.3, d: 0.3, boxes: [[0, 0, 0.24, 0.24, 1.96]], build(k) { for (let i = 0; i < 6; i++) k.cyl(k.mat(i % 2 ? 0x7a2f3a : 0x22305a, 0.95), 0.11, 0.11, 0.33, 0, 0.17 + i * 0.32, 0, 10); } };
  R.samovar = { small: 1, w: 0.46, d: 0.46, boxes: [[0, 0, 0.42, 0.42, 1.08]], build(k) { const w = k.mat(0x4a2c18, 0.45), c = k.mat(0xb8703a, 0.25, 0.85); k.box(w, 0.42, 0.03, 0.42, 0, 0.56, 0); for (const x of [-0.18, 0.18]) for (const z of [-0.18, 0.18]) k.box(w, 0.03, 0.55, 0.03, x, 0.275, z); k.cyl(c, 0.08, 0.1, 0.05, 0, 0.6, 0, 12); k.cyl(c, 0.13, 0.09, 0.26, 0, 0.76, 0, 12); k.cyl(c, 0.05, 0.1, 0.06, 0, 0.92, 0, 12); k.box(c, 0.02, 0.02, 0.1, 0, 0.72, 0.15); } };

  // ---------------------------------------------------------------- who they are
  const carpet = (color) => ({ kind: 'carpet', color }), wood = (color) => ({ kind: 'wood', color }), tile = (color, grout = '#6a6660') => ({ kind: 'tile', color, grout });
  const lino = (color, grout) => ({ kind: 'lino', color, grout: grout || color, sound: 'tile' }), slab = (color) => ({ kind: 'concrete', color, sound: 'concrete' }), lam = (color) => ({ kind: 'laminate', color, sound: 'wood' }), parquet = (color) => ({ kind: 'parquet', color, sound: 'wood' });
  const bath = (wall, ceil, trim, floor) => ({ carve: { from: ['bedroom', 'dining', 'office', 'kitchen'], size: [3, 4] }, tight: 1, wall, ceil, trim, floor, items: [{ id: 'basin', piece: 'basin', at: 'wall' }, { id: 'toilet', piece: 'toilet', at: 'corner', swap: [{ piece: 'toilet', at: 'wall' }] }, { id: 'shower', piece: 'shower', at: 'corner', swap: [{ piece: 'basin', at: 'wall' }] }] });
  const FLAT = 0.055, LOFT = 0.15; // (the chance of each: a loft's rarer, and has fewer who'd take it)
  G.Homes.RESIDENTS.push(
    { id: 'stash', name: 'Dario Vance and Kell Adeyemi', home: 'flat', rate: FLAT,
      rest: { wall: '#8f9a88', ceil: '#b9b9ab', trim: '#5c5f55', floor: slab('#7a7873') },
      rooms: {
        living: { wall: '#8f9a88', ceil: '#b9b9ab', trim: '#5c5f55', floor: slab('#7a7873'), items: [
          { id: 'sofa', piece: 'couch', at: 'long', must: 1, style: { fabric: 0x4b4a47, plain: 1 } },
          { id: 'chair', piece: 'easy', at: 'cross:sofa', need: 1, style: { fabric: 0x3e4240 } },
          { id: 'table', piece: 'foldtable', at: 'facing:sofa', need: 1 },
          { id: 'pizza', piece: 'pizzas', at: 'corner' }, { id: 'lantern', piece: 'lantern', at: 'beside:chair' }, { id: 'box', piece: 'lockbox', at: 'beside:table' }, { id: 'bin', piece: 'cardboard', at: 'wall' },
        ] },
        kitchen: { wall: '#a7a58c', ceil: '#b9b9ab', trim: '#3f4038', floor: lino('#8c7a55', '#7a6a48'), items: [
          { id: 'run', piece: 'kitrun', at: 'long', must: 1, style: { cab: 0xa8a48e, top: 0x6a665a, on: 'boxes' } },
          { id: 'fridge', piece: 'icebox', at: 'beside:run', must: 1, style: { c: 0xd8d4c8, tape: 1 } },
          { id: 'tubs', piece: 'tubs', at: 'wall', need: 1 }, { id: 'tubs2', piece: 'tubs', at: 'beside:tubs' },
        ] },
        bedroom: { wall: '#8f9a88', ceil: '#b9b9ab', trim: '#5c5f55', floor: slab('#7a7873'), items: [
          { id: 'bed', piece: 'floorbed', at: 'long', must: 1 }, { id: 'bed2', piece: 'floorbed', at: 'away:bed' },
          { id: 'bags', piece: 'sportbags', at: 'wall' }, { id: 'bags2', piece: 'sportbags', at: 'beside:bags' },
        ] },
        bathroom: bath('#9fb0a6', '#b9b9ab', '#3f4038', tile('#b8c0b8')),
      } },
    { id: 'teo', name: 'Teodor Brandt', home: 'flat', rate: FLAT,
      rest: { wall: '#4f6a73', ceil: '#d8dbd8', trim: '#1f2a30', floor: wood('#5a4636') },
      rooms: {
        living: { wall: '#4f6a73', ceil: '#d8dbd8', trim: '#1f2a30', floor: wood('#5a4636'), items: [
          { id: 'tv', piece: 'flattv', at: 'long', must: 1, style: { stand: 0x1a1c1e } },
          { id: 'sofa', piece: 'couch', at: 'facing:tv', must: 1, style: { fabric: 0x2b2f33, plain: 1 } },
          { id: 'chair', piece: 'easy', at: 'cross:sofa', style: { fabric: 0x22262a, vinyl: 1 } },
          { id: 'map', piece: 'pinmap', hang: 1.6, at: 'wall', style: { c: 0x6a7a8a } },
          { id: 'mon', piece: 'stairmon', hang: 1.7, at: 'wall' },
        ] },
        kitchen: { wall: '#8aa0a0', ceil: '#d8dbd8', trim: '#1f2a30', floor: tile('#2f3538', '#1c2022'), items: [
          { id: 'run', piece: 'kitrun', at: 'long', must: 1, style: { cab: 0x2a3034, top: 0xc8ccd0 } },
          { id: 'fridge', piece: 'icebox', at: 'beside:run', must: 1, style: { c: 0xb8bcc0, steel: 1 } },
        ] },
        dining: { spare: 1, wall: '#4f6a73', ceil: '#d8dbd8', trim: '#1f2a30', floor: wood('#5a4636'), items: [
          { id: 'table', piece: 'cardtable', at: 'long', need: 1 }, { id: 'safe', piece: 'wallsafe', hang: 1.4, at: 'wall' }, { id: 'mon', piece: 'stairmon', hang: 1.7, at: 'facing:table' },
        ] },
        bedroom: { wall: '#3d4f66', ceil: '#c5cad0', trim: '#b89a5a', floor: carpet('#2c3340'), items: [
          { id: 'bed', piece: 'bedd', at: 'long', must: 1, style: { cover: 0x1f2a30, sheet: 0xece8e0 } }, { id: 'wardrobe', piece: 'wardrobe', at: 'wall' }, { id: 'bag', piece: 'sportbags', at: 'beside:bed' },
        ] },
      } },
    { id: 'priya', name: 'Priya Nair', home: 'flat', rate: FLAT,
      rest: { wall: '#8fa391', ceil: '#d6d9cf', trim: '#3f4f45', floor: carpet('#6b6f66') },
      rooms: {
        living: { wall: '#8fa391', ceil: '#d6d9cf', trim: '#3f4f45', floor: carpet('#6b6f66'), items: [
          { id: 'sofa', piece: 'couch', at: 'long', must: 1, style: { fabric: 0x35564f, plain: 1 } },
          { id: 'tv', piece: 'flattv', at: 'facing:sofa', style: { stand: 0x5a5448 } },
          { id: 'plant', piece: 'tallplant', at: 'corner', need: 1, swap: [{ piece: 'potplant', at: 'wall' }] },
          { id: 'lamp', piece: 'flamp', at: 'beside:sofa', style: { shade: 0xf0d8a0 } }, { id: 'mat', piece: 'yogamat', at: 'corner' }, { id: 'books', piece: 'textbooks', at: 'beside:sofa' },
        ] },
        kitchen: { wall: '#c9d3c4', ceil: '#dfe2d8', trim: '#5d7a68', floor: lino('#a8a592', '#989480'), items: [
          { id: 'run', piece: 'kitrun', at: 'long', must: 1, style: { cab: 0xe4e6dc, top: 0x8a8e82, on: 'kettle' } },
          { id: 'fridge', piece: 'icebox', at: 'beside:run', must: 1 },
        ] },
        bedroom: { wall: '#4d5a52', ceil: '#8a9489', trim: '#1f2622', floor: carpet('#3d423e'), items: [
          { id: 'bed', piece: 'bedd', at: 'long', must: 1, style: { cover: 0x22304a } }, { id: 'night', piece: 'nightstand', at: 'beside:bed' }, { id: 'wardrobe', piece: 'wardrobe', at: 'wall' },
          { id: 'scrubs', piece: 'hookd', hang: 1.45, at: 'wall', style: { c: 0x3b7fa6 } },
        ] },
        bathroom: bath('#b9cfc9', '#e4ece8', '#7d9c96', tile('#cfd8d6')),
      } },
    { id: 'wrona', name: 'Tomasz Wrona and Elliot Sayer', home: 'flat', rate: FLAT,
      rest: { wall: '#9aa3ad', ceil: '#d2d5d8', trim: '#4b5560', floor: lam('#8c8579') },
      rooms: {
        living: { wall: '#9aa3ad', ceil: '#d2d5d8', trim: '#4b5560', floor: lam('#8c8579'), items: [
          { id: 'tv', piece: 'flattv', at: 'long', must: 1 },
          { id: 'sofa', piece: 'couch', at: 'facing:tv', must: 1, style: { fabric: 0x5c6168, plain: 1 } },
          { id: 'his', piece: 'easy', at: 'away:tv', style: { fabric: 0x6e4b34, vinyl: 1 } }, // (Tomasz's, its back to all of it)
          { id: 'boots', piece: 'boots', at: 'wall' },
          { id: 'vest', piece: 'hookd', hang: 1.45, at: 'wall', style: { c: 0xe87a1c } },
        ] },
        kitchen: { wall: '#c8c6b8', ceil: '#dcdad0', trim: '#8b8776', floor: lino('#7e8a8e', '#6a7478'), items: [
          { id: 'run', piece: 'kitrun', at: 'long', must: 1, style: { cab: 0xb8b6a8, top: 0x7a776a, on: 'tape' } },
          { id: 'fridge', piece: 'icebox', at: 'beside:run', must: 1 }, { id: 'bin', piece: 'cardboard', at: 'wall' },
        ] },
        bedroom: { wall: '#a89d86', ceil: '#cfc8b8', trim: '#5a4a35', floor: wood('#6b5a45'), items: [
          { id: 'bed', piece: 'bedn', at: 'long', must: 1, style: { cover: 0x4a5a3a } }, { id: 'wardrobe', piece: 'wardrobe', at: 'wall' }, { id: 'radio', piece: 'nightstand', at: 'beside:bed' },
        ] },
        office: { spare: 1, wall: '#3a3550', ceil: '#6a6580', trim: '#d94fa0', floor: carpet('#2b2838'), items: [ // (Elliot's: a room of his own, the streaming rig in it)
          { id: 'rig', piece: 'rigdesk', at: 'long', need: 1, style: { back: 0xd94fa0 } }, { id: 'chair', piece: 'gamechair', at: 'beside:rig', style: { c: 0xb52a2a } }, { id: 'light', piece: 'ringlight', at: 'corner' },
          { id: 'bed', piece: 'bedn', at: 'away:rig', style: { cover: 0x2a2838, unmade: 1 } },
        ] },
        bathroom: bath('#bfc7c0', '#dde0dc', '#6e756f', tile('#b8c0bd')),
      } },
    { id: 'kez', name: 'Kez Marchetti', home: 'flat', rate: FLAT,
      rest: { wall: '#2d2a3a', ceil: '#1a1822', trim: '#8a4dff', floor: carpet('#2a2a30') },
      rooms: {
        living: { wall: '#232a3d', ceil: '#14161f', trim: '#ff3fa4', floor: carpet('#2a2a30'), items: [
          { id: 'tv', piece: 'flattv', at: 'long', must: 1, style: { stand: 0x121214 } },
          { id: 'sofa', piece: 'couch', at: 'facing:tv', must: 1, style: { fabric: 0x18181c, plain: 1 } },
          { id: 'cans', piece: 'canpyramid', at: 'wall' },
        ] },
        kitchen: { wall: '#3a3f4c', ceil: '#20232b', trim: '#3fe0d0', floor: lino('#55575e', '#4a4c52'), items: [
          { id: 'run', piece: 'kitrun', at: 'long', must: 1, style: { cab: 0x2a2c34, top: 0x3a3c44, on: 'boxes' } },
          { id: 'fridge', piece: 'icebox', at: 'beside:run', must: 1, style: { c: 0x2a2c30 } }, { id: 'bin', piece: 'cardboard', at: 'wall' },
        ] },
        bedroom: { wall: '#0f0f14', ceil: '#0a0a0d', trim: '#8a4dff', floor: carpet('#1c1c22'), items: [
          { id: 'rig', piece: 'rigdesk', at: 'long', need: 1, must: 1, style: { back: 0xff3fa4 } }, { id: 'chair', piece: 'gamechair', at: 'beside:rig' }, { id: 'light', piece: 'ringlight', at: 'corner' }, { id: 'pc', piece: 'pctower', at: 'beside:rig' },
          { id: 'bed', piece: 'bedd', at: 'away:rig', style: { cover: 0x141418, unmade: 1 } },
          { id: 'green', piece: 'greenscreen', hang: 1.5, at: 'facing:rig' }, { id: 'foam', piece: 'foampanels', hang: 1.6, at: 'wall' }, { id: 'live', piece: 'livesign', hang: 2.2, at: 'wall' },
        ] },
        bathroom: bath('#3a3f4c', '#20232b', '#3fe0d0', tile('#55575e', '#2a2c32')),
      } },
    // ---- lofts: up: 1, a room they'd have if there's one, upstairs on the gallery as often as not
    { id: 'stan', name: 'Stanislaw Kowalczyk', home: 'loft', rate: LOFT,
      rest: { wall: '#b5b8ae', ceil: '#d2d0c0', trim: '#c99a2e', floor: lino('#8a8a80', '#7a7a70') },
      rooms: {
        living: { wall: '#7f9a85', ceil: '#d2d0c0', trim: '#3a4a40', floor: wood('#6a5844'), items: [
          { id: 'his', piece: 'easy', at: 'long', must: 1, need: 1, style: { fabric: 0x5a3a24, worn: 0x8a6a4a, vinyl: 1 } },
          { id: 'tv', piece: 'crt', at: 'facing:his' }, { id: 'books', piece: 'bookshelf', at: 'wall' }, { id: 'lamp', piece: 'flamp', at: 'beside:his' },
          { id: 'bench', piece: 'toolbench', at: 'wall' }, { id: 'chest', piece: 'toolchest', at: 'beside:bench' }, { id: 'peg', piece: 'pegboard', hang: 1.75, at: 'beside:bench' },
        ] },
        kitchen: { wall: '#b5b8ae', ceil: '#d2d0c0', trim: '#c99a2e', floor: lino('#8a8a80', '#7a7a70'), items: [
          { id: 'run', piece: 'kitrun', at: 'long', must: 1, style: { cab: 0xc0c2b8, top: 0x6a6a64, on: 'kettle' } }, { id: 'fridge', piece: 'icebox', at: 'beside:run', must: 1, style: { magnets: 1 } },
        ] },
        office: { up: 1, wall: '#6f7f78', ceil: '#bfbdb0', trim: '#b8402a', floor: slab('#7a7770'), items: [
          { id: 'lathe', piece: 'lathe', at: 'long', must: 1 }, { id: 'bench', piece: 'toolbench', at: 'wall' }, { id: 'drill', piece: 'drillpress', at: 'corner' }, { id: 'chest', piece: 'toolchest', at: 'beside:lathe' }, { id: 'files', piece: 'files', at: 'wall' }, { id: 'peg', piece: 'pegboard', hang: 1.75, at: 'beside:bench' },
        ] },
        bedroom: { up: 1, wall: '#8f949c', ceil: '#d2d0c0', trim: '#5a5f66', floor: carpet('#55606a'), items: [
          { id: 'bed', piece: 'bedn', at: 'long', must: 1, style: { cover: 0x4a5a3a } }, { id: 'wardrobe', piece: 'wardrobe', at: 'wall' },
        ] },
      } },
    { id: 'varga', name: 'Ines and Tomas Varga', home: 'loft', rate: LOFT,
      rest: { wall: '#c98e7a', ceil: '#e2d4c0', trim: '#6b2f2a', floor: carpet('#7a2f3a') },
      rooms: {
        living: { wall: '#c98e7a', ceil: '#e2d4c0', trim: '#6b2f2a', floor: carpet('#7a2f3a'), items: [
          { id: 'sofa', piece: 'couch', at: 'long', must: 1, style: { fabric: 0x2a5a42, plain: 1 } },
          { id: 'chaise', piece: 'chaise', at: 'cross:sofa' },
          { id: 'piano', piece: 'piano', at: 'wall', need: 1, swap: [{ piece: 'shrine' }] },
          { id: 'clock', piece: 'grandclock', at: 'corner', swap: [{ piece: 'grandclock', at: 'wall' }] },
          { id: 'chair', piece: 'easy', at: 'wall', style: { fabric: 0xa86a5a } }, { id: 'tv', piece: 'crt', at: 'wall' },
          { id: 'carpet', piece: 'rolledcarpet', at: 'corner', swap: [{ piece: 'rolledcarpet', at: 'wall' }] }, { id: 'form', piece: 'dressform', at: 'wall' }, { id: 'samovar', piece: 'samovar', at: 'wall' },
          { id: 'p1', piece: 'tallplant', at: 'corner' }, { id: 'p2', piece: 'potplant', at: 'wall' }, { id: 'p3', piece: 'potplant', at: 'wall' }, { id: 'lamp', piece: 'flamp', at: 'beside:sofa', style: { shade: 0xf0c890 } },
          { id: 'photo', piece: 'photo', hang: 1.6, at: 'wall' }, { id: 'photo2', piece: 'photo', hang: 1.6, at: 'wall' },
        ] },
        kitchen: { wall: '#e0b84a', ceil: '#e2d4c0', trim: '#2f5a8a', floor: tile('#c8b890', '#7a5a3a'), items: [
          { id: 'run', piece: 'kitrun', at: 'long', must: 1, style: { cab: 0x2f5a8a, top: 0xd8d0b8, on: 'jars' } }, { id: 'fridge', piece: 'icebox', at: 'beside:run', must: 1, style: { magnets: 1 } }, { id: 'p', piece: 'potplant', at: 'corner' },
        ] },
        dining: { up: 1, wall: '#a7627a', ceil: '#e2d4c0', trim: '#d4af37', floor: parquet('#7a5230'), items: [{ id: 'table', piece: 'lacetable', at: 'middle', must: 1 }, { id: 'side', piece: 'shrine', at: 'long' }] },
        bedroom: { up: 1, wall: '#b99ac0', ceil: '#e2d4c0', trim: '#f2e8d8', floor: carpet('#a89098'), items: [
          { id: 'bed', piece: 'bedd', at: 'long', must: 1, style: { cover: 0x8a6a8e, sheet: 0xf2e8d8 } }, { id: 'w1', piece: 'wardrobe', at: 'wall' }, { id: 'w2', piece: 'wardrobe', at: 'wall' }, { id: 'd', piece: 'dresser', at: 'wall' },
        ] },
        office: { up: 1, wall: '#3f5f7a', ceil: '#cfc8ba', trim: '#a8742a', floor: wood('#4a3a2c'), items: [{ id: 'sew', piece: 'treadle', at: 'long' }, { id: 'books', piece: 'bookshelf', at: 'wall' }, { id: 'form', piece: 'dressform', at: 'corner' }] },
      } },
    { id: 'mags', name: 'Marguerite Delacroix', home: 'loft', rate: LOFT,
      rest: { wall: '#d9b25c', ceil: '#e6dcc0', trim: '#7a3b2a', floor: wood('#6b4a30') },
      rooms: {
        living: { wall: '#d9b25c', ceil: '#e6dcc0', trim: '#7a3b2a', floor: carpet('#7d3f35'), items: [
          { id: 'sofa', piece: 'couch', at: 'long', must: 1, style: { fabric: 0x8a3b2d, plain: 1 } },
          { id: 'tvs', piece: 'tvstack', at: 'wall', need: 1 }, { id: 'tvs2', piece: 'tvstack', at: 'beside:tvs' }, { id: 'c1', piece: 'cartons', at: 'wall' }, { id: 'c2', piece: 'cartons', at: 'beside:c1', style: { h: 2 } },
          { id: 'tv', piece: 'flattv', at: 'facing:sofa' }, { id: 's1', piece: 'tallspk', at: 'beside:tv' }, { id: 's2', piece: 'tallspk', at: 'beside:tv' },
          { id: 'mirror', piece: 'goldmirror', hang: 1.55, at: 'wall' }, { id: 'bike', piece: 'wallbike', hang: 1.3, at: 'wall', style: { c: 0xa02a2a } },
        ] },
        kitchen: { wall: '#c9884a', ceil: '#e6dcc0', trim: '#4a2f22', floor: tile('#c8b88e'), items: [
          { id: 'run', piece: 'kitrun', at: 'long', must: 1, style: { cab: 0xece6d6, top: 0x8a7a62, on: 'kettle' } }, { id: 'fridge', piece: 'icebox', at: 'beside:run', must: 1 },
        ] },
        dining: { up: 1, wall: '#d9b25c', ceil: '#e6dcc0', trim: '#7a3b2a', floor: wood('#6b4a30'), items: [{ id: 'heap', piece: 'heaptable', at: 'middle', must: 1, swap: [{ piece: 'heaptable', at: 'long' }] }, { id: 'c', piece: 'cartons', at: 'wall' }] },
        bedroom: { up: 1, wall: '#b46a5a', ceil: '#e6dcc0', trim: '#4a2f22', floor: carpet('#7d3f35'), items: [{ id: 'bed', piece: 'bedd', at: 'long', must: 1, style: { cover: 0xa35a50 } }, { id: 'c', piece: 'cartons', at: 'wall', style: { h: 2 } }, { id: 'w', piece: 'wardrobe', at: 'wall' }] },
        office: { up: 1, wall: '#c9884a', ceil: '#e6dcc0', trim: '#4a2f22', floor: wood('#6b4a30'), items: [{ id: 'desk', piece: 'desk', at: 'long', must: 1 }, { id: 'f', piece: 'files', at: 'wall' }, { id: 'c', piece: 'cartons', at: 'wall' }] },
      } },
    { id: 'okafor', name: 'Marcus and Dani Okafor-Reyes', home: 'loft', rate: LOFT,
      rest: { wall: '#c98f56', ceil: '#e5d5bb', trim: '#5c3b25', floor: wood('#7a5434') },
      rooms: {
        living: { wall: '#c98f56', ceil: '#e5d5bb', trim: '#5c3b25', floor: wood('#7a5434'), items: [
          { id: 'sofa', piece: 'couch', at: 'long', must: 1, style: { fabric: 0xa2492e, plain: 1 } },
          { id: 'tv', piece: 'flattv', at: 'facing:sofa' }, { id: 'chair', piece: 'easy', at: 'cross:sofa', style: { fabric: 0x4f6b4a } },
          { id: 'parcels', piece: 'cartons', at: 'wall', need: 1, style: { h: 2 } }, { id: 'parcels2', piece: 'cartons', at: 'beside:parcels' },
          { id: 'bike', piece: 'wallbike', hang: 1.3, at: 'wall' }, { id: 'route', piece: 'pinmap', hang: 1.6, at: 'wall', style: { c: 0xd8d0b8 } }, { id: 'hivis', piece: 'hookd', hang: 1.45, at: 'wall', style: { c: 0xd6e13a } },
        ] },
        kitchen: { wall: '#d8b45e', ceil: '#eadfc2', trim: '#8a3d2a', floor: tile('#b5482f', '#6a3020'), items: [
          { id: 'run', piece: 'kitrun', at: 'long', must: 1, style: { cab: 0xd8c8a8, top: 0x6a5a4a, on: 'espresso' } }, { id: 'fridge', piece: 'icebox', at: 'beside:run', must: 1, style: { magnets: 1 } },
        ] },
        dining: { up: 1, wall: '#b86f4a', ceil: '#e5d5bb', trim: '#3a2a22', floor: wood('#7a5434'), items: [{ id: 'table', piece: 'heaptable', at: 'middle', must: 1, swap: [{ piece: 'heaptable', at: 'long' }] }] },
        office: { up: 1, wall: '#7a6a50', ceil: '#cfc4aa', trim: '#2d3b2e', floor: lam('#9b8461'), items: [{ id: 'desk', piece: 'desk', at: 'long', must: 1 }, { id: 'f', piece: 'files', at: 'wall' }] },
        bedroom: { up: 1, wall: '#a9806f', ceil: '#d9c8b8', trim: '#4a3329', floor: carpet('#8a6f5a'), items: [{ id: 'bed', piece: 'bedd', at: 'long', must: 1, style: { cover: 0x6a6a70, unmade: 1 } }, { id: 'w', piece: 'wardrobe', at: 'wall' }] },
      } },
    { id: 'dessa', name: 'Dessa Okonkwo', home: 'loft', rate: LOFT,
      rest: { wall: '#d9c7a8', ceil: '#efe3d0', trim: '#3b2a22', floor: wood('#6a4e36') },
      rooms: {
        living: { wall: '#c9774f', ceil: '#efe3d0', trim: '#3b2a22', floor: slab('#8d867c'), items: [
          { id: 'kiln', piece: 'kiln', at: 'corner', need: 1, swap: [{ piece: 'kiln', at: 'wall' }] },
          { id: 'wheel', piece: 'wheel', at: 'middle', swap: [{ piece: 'wheel', at: 'wall' }] },
          { id: 'rack', piece: 'dryrack', at: 'long', must: 1 }, { id: 'rack2', piece: 'dryrack', at: 'beside:rack' },
          { id: 'glaze', piece: 'glazes', at: 'beside:kiln' }, { id: 'clay', piece: 'claysacks', at: 'wall' },
          { id: 'c1', piece: 'easy', at: 'wall', style: { fabric: 0xd8a63a } }, { id: 'c2', piece: 'easy', at: 'wall', style: { fabric: 0x2f7f7a } },
          { id: 'p1', piece: 'potplant', at: 'corner', style: { dead: 1 } }, { id: 'p2', piece: 'tallplant', at: 'corner' },
        ] },
        kitchen: { wall: '#e0b86a', ceil: '#efe3d0', trim: '#6e4a2e', floor: tile('#b5553a', '#6a3a28'), items: [
          { id: 'run', piece: 'kitrun', at: 'long', must: 1, style: { cab: 0xc8b890, top: 0x8a6a42, on: 'jars' } }, { id: 'fridge', piece: 'icebox', at: 'beside:run', must: 1, style: { magnets: 1 } },
        ] },
        bedroom: { up: 1, wall: '#a9b59a', ceil: '#e8e4d4', trim: '#f0ede2', floor: wood('#7a5a3c'), items: [
          { id: 'bed', piece: 'bedd', at: 'long', must: 1, style: { cover: 0xa84a26, frame: 0xb09868, low: 1 } }, { id: 'rail', piece: 'clothesrail', at: 'wall' }, { id: 'tap', piece: 'tapestry', hang: 1.75, at: 'wall' },
        ] },
        office: { up: 1, wall: '#d9c7a8', ceil: '#efe3d0', trim: '#3b2a22', floor: wood('#6a4e36'), items: [{ id: 'desk', piece: 'desk', at: 'long', must: 1 }, { id: 'f', piece: 'files', at: 'wall' }] },
      } },
    { id: 'tobias', name: 'Tobias Rennick', home: 'loft', rate: LOFT,
      rest: { wall: '#d4cfc6', ceil: '#f6f5f2', trim: '#b8924a', floor: wood('#8b7355') },
      rooms: {
        living: { wall: '#e4e1da', ceil: '#f6f5f2', trim: '#1a1a1a', floor: slab('#9a9a9a'), items: [
          { id: 'sofa', piece: 'couch', at: 'long', must: 1, style: { fabric: 0xe8e2d4, plain: 1 } },
          { id: 'tv', piece: 'flattv', at: 'facing:sofa', style: { stand: 0xe4e0d8 } }, { id: 'chair', piece: 'easy', at: 'cross:sofa', need: 1, style: { fabric: 0x141416, vinyl: 1 } },
          { id: 'cart', piece: 'barcart', at: 'wall' }, { id: 'tree', piece: 'tallplant', at: 'corner' }, { id: 'treadmill', piece: 'treadmill', at: 'wall' }, { id: 'wine', piece: 'winefridge', at: 'wall' },
          { id: 'canvas', piece: 'canvas', hang: 1.75, at: 'long' },
        ] },
        kitchen: { wall: '#cfd3d6', ceil: '#f6f5f2', trim: '#b8924a', floor: tile('#d9d9d6', '#c0c0bc'), items: [
          { id: 'run', piece: 'kitrun', at: 'long', must: 1, style: { cab: 0x2a2c30, top: 0xececec } }, { id: 'fridge', piece: 'icebox', at: 'beside:run', must: 1, style: { c: 0xb8bcc0, steel: 1 } }, { id: 'island', piece: 'island', at: 'middle' },
        ] },
        bedroom: { up: 1, wall: '#b9bfc7', ceil: '#eceef0', trim: '#1a1a1a', floor: carpet('#8d8f94'), items: [{ id: 'bed', piece: 'bedd', at: 'long', must: 1, style: { cover: 0xece8e0, frame: 0x1a1a1a, low: 1 } }, { id: 'w', piece: 'wardrobe', at: 'wall' }] },
        office: { up: 1, wall: '#d4cfc6', ceil: '#f6f5f2', trim: '#b8924a', floor: wood('#8b7355'), items: [{ id: 'desk', piece: 'standdesk', at: 'long', must: 1 }] },
      } },
  );
})();
