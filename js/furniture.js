'use strict';
// Furnishing. Every room gets a purpose (living room, kitchen, bedroom, ...) and furniture to suit.
//   plan()  - deterministic layout from the level seed: which tile holds what, and its collision boxes.
//             Runs on every peer (host and clients) as part of G.Level.generate.
//   build() - the meshes: furniture, room floors, rugs, wall art, windows, baseboards. Merged per material.
// Furniture tiles: 2 = furniture you can take cover behind (sofa, counter, dresser, crates), 4 = other
// furniture (beds, tables, shelves, wardrobes). Small things in corners (plants, lamps) leave the tile as
// floor (0) but still carry a collision box. map.props: tile index -> { name, q, x, z, v, boxes }.
G.Furniture = (() => {
  // Local frame of a piece: footprint centred on the origin, back at -z (against the wall), front +z.
  // boxes: [x, z, w, d, h] in that frame (all from the floor up).
  const R = {};
  const FABRIC = [0x56677a, 0x7a4e3a, 0x4f6b4a, 0x8a7a5a, 0x6a3f4f, 0x3f4f6a, 0x9a8f7c, 0x7d3434, 0x46545c];
  const ACCENT = [0xd9a441, 0xc0504d, 0x4f81bd, 0x9bbb59, 0xe8e0d0, 0x8064a2, 0xd27b4b];
  const WOOD = [0x8a5a34, 0x6b4428, 0xa87a4f, 0x4a2f1c, 0xb58d62];
  const CAB = [0xe9e4da, 0x5b6770, 0x8a5a34, 0x2f3a40, 0xcfc6b4, 0x6d7b66];
  const BOOKS = [0x7d2e2e, 0x2e4a7d, 0x2e6b3f, 0xb08a3e, 0x4a4a4a, 0x8a5a2e, 0xd8cfb8, 0x5a2e6b, 0x1f3b4d, 0xa0412d];
  const CARD = [0xa8865a, 0x9c7a50, 0xb4936a, 0x8f6e47];

  // ---------------------------------------------------------------- living room
  R.sofa = { w: 2.0, d: 0.92, cover: 1, boxes: [[0, 0, 2.0, 0.92, 0.85]], build(k) {
    const f = k.mat(k.pick(FABRIC), 0.95), f2 = k.mat(k.tint(f.color.getHex(), 1.12), 0.95), dark = k.mat(0x241c16, 0.6);
    for (const x of [-0.9, 0.9]) for (const z of [-0.38, 0.38]) k.box(dark, 0.06, 0.08, 0.06, x, 0.04, z);
    k.box(f, 2.0, 0.34, 0.92, 0, 0.25, 0);
    for (const x of [-0.41, 0.41]) k.box(f2, 0.8, 0.13, 0.66, x, 0.485, 0.11);
    k.box(f, 1.64, 0.44, 0.24, 0, 0.64, -0.33);
    for (const x of [-0.91, 0.91]) k.box(f, 0.18, 0.26, 0.92, x, 0.55, 0);
    const acc = k.mat(k.pick(ACCENT), 0.95);
    k.box(acc, 0.4, 0.36, 0.12, -0.58, 0.72, -0.17, 0.15);
    if (k.rnd() < 0.6) k.box(acc, 0.4, 0.36, 0.12, 0.58, 0.72, -0.17, -0.2);
    if (k.rnd() < 0.4) k.box(k.mat(k.pick(ACCENT), 1), 0.55, 0.025, 0.6, 0.45, 0.565, 0.12, 0.1);
  } };
  R.armchairs = { w: 1.9, d: 0.86, cover: 1, boxes: [[-0.55, 0, 0.8, 0.86, 0.85], [0.55, 0, 0.8, 0.86, 0.85], [0, 0, 0.3, 0.3, 0.56]], build(k) {
    const f = k.mat(k.pick(FABRIC), 0.95), f2 = k.mat(k.tint(f.color.getHex(), 1.12), 0.95), dark = k.mat(0x241c16, 0.6);
    for (const cx of [-0.55, 0.55]) {
      for (const x of [-0.34, 0.34]) for (const z of [-0.36, 0.36]) k.box(dark, 0.05, 0.08, 0.05, cx + x, 0.04, z);
      k.box(f, 0.8, 0.34, 0.86, cx, 0.25, 0);
      k.box(f2, 0.5, 0.12, 0.6, cx, 0.48, 0.1);
      k.box(f, 0.5, 0.42, 0.2, cx, 0.63, -0.33);
      for (const x of [-0.325, 0.325]) k.box(f, 0.15, 0.26, 0.86, cx + x, 0.55, 0);
    }
    const w = k.mat(k.pick(WOOD), 0.6);
    k.cyl(w, 0.15, 0.15, 0.03, 0, 0.545, 0); k.cyl(w, 0.025, 0.025, 0.52, 0, 0.27, 0); k.cyl(w, 0.12, 0.12, 0.02, 0, 0.01, 0);
    k.cyl(k.mat(0xf0ede6, 0.4), 0.04, 0.035, 0.09, 0.05, 0.605, 0.03);
  } };
  R.tv = { w: 1.7, d: 0.5, boxes: [[0, 0, 1.6, 0.45, 0.5], [0, -0.08, 1.24, 0.14, 1.26]], build(k) {
    const w = k.mat(k.pick(WOOD), 0.6), black = k.mat(0x111214, 0.4), gap = k.mat(0x1a1410, 0.9);
    for (const x of [-0.75, 0.75]) for (const z of [-0.17, 0.17]) k.box(black, 0.04, 0.06, 0.04, x, 0.03, z);
    k.box(w, 1.6, 0.42, 0.44, 0, 0.27, 0);
    k.box(w, 1.62, 0.03, 0.46, 0, 0.495, 0);
    for (const x of [-0.53, 0.53]) k.box(gap, 0.006, 0.38, 0.005, x, 0.27, 0.221);
    k.box(black, 0.3, 0.06, 0.24, 0.5, 0.54, 0.05);
    k.box(black, 0.4, 0.02, 0.2, 0, 0.52, -0.08);
    k.box(black, 0.06, 0.14, 0.04, 0, 0.59, -0.1);
    k.box(black, 1.22, 0.7, 0.05, 0, 0.99, -0.08);
    k.box(k.screen(), 1.16, 0.64, 0.006, 0, 0.99, -0.054);
    if (k.rnd() < 0.6) k.plantSmall(-0.62, 0.51, 0.04);
  } };
  R.bookshelf = { w: 1.5, d: 0.38, boxes: [[0, 0, 1.5, 0.38, 2.0]], build(k) {
    const w = k.mat(k.pick(WOOD.concat([0xe9e4da, 0x2f3a40])), 0.65), back = k.mat(k.tint(w.color.getHex(), 0.7), 0.8);
    for (const x of [-0.735, 0.735]) k.box(w, 0.03, 2.0, 0.38, x, 1.0, 0);
    k.box(w, 1.5, 0.03, 0.38, 0, 1.985, 0);
    k.box(w, 1.44, 0.08, 0.36, 0, 0.04, 0);
    k.box(back, 1.44, 1.94, 0.01, 0, 1.0, -0.185);
    const levels = [0.08, 0.5, 0.92, 1.34, 1.76];
    for (const y of levels.slice(1)) k.box(w, 1.44, 0.025, 0.36, 0, y, 0);
    for (const y0 of levels) {
      const base = y0 + (y0 > 0.1 ? 0.0125 : 0), full = 0.55 + k.rnd() * 0.45;
      let x = -0.71;
      while (x < 0.7) {
        if (k.rnd() > full) { // a gap, sometimes with an ornament in it
          const gw = 0.12 + k.rnd() * 0.18;
          if (k.rnd() < 0.35 && x + gw < 0.7) k.cyl(k.mat(k.pick(ACCENT), 0.3), 0.04, 0.05, 0.16, x + gw / 2, base + 0.08, 0.02);
          x += gw; continue;
        }
        const bw = 0.025 + k.rnd() * 0.035, bh = 0.2 + k.rnd() * 0.13, bd = 0.18 + k.rnd() * 0.08;
        if (x + bw > 0.71) break;
        k.box(k.mat(k.pick(BOOKS), 0.85), bw, bh, bd, x + bw / 2, base + bh / 2, 0.18 - bd / 2);
        x += bw + 0.002;
      }
    }
  } };
  // ---------------------------------------------------------------- kitchen
  R.counter = { w: 1.98, d: 0.64, cover: 1, boxes: [[0, 0, 1.98, 0.64, 0.92]], build(k) {
    const cab = k.mat(k.pick(CAB), 0.6), top = k.mat(k.pick([0x2b2b2b, 0xd8d4cc, 0x4a4540, 0x6e6a62]), 0.35);
    const dark = k.mat(0x16130f, 0.9), metal = k.mat(0xb8bcc0, 0.3, 0.8);
    k.box(dark, 1.9, 0.1, 0.56, 0, 0.05, -0.04);
    k.box(cab, 1.96, 0.78, 0.58, 0, 0.49, -0.02);
    for (const x of [-0.49, 0, 0.49]) k.box(dark, 0.006, 0.76, 0.005, x, 0.49, 0.272);
    k.box(dark, 1.94, 0.006, 0.005, 0, 0.74, 0.272);
    for (const x of [-0.735, -0.245, 0.245, 0.735]) { k.box(metal, 0.12, 0.015, 0.02, x, 0.81, 0.285); k.box(metal, 0.015, 0.1, 0.02, x + (x < 0 ? 0.2 : -0.2), 0.62, 0.285); }
    k.box(top, 1.98, 0.04, 0.64, 0, 0.9, 0);
    const v = k.rnd();
    if (v < 0.4) { // sink
      k.box(metal, 0.62, 0.012, 0.42, -0.4, 0.926, 0.02);
      k.box(dark, 0.54, 0.01, 0.34, -0.4, 0.933, 0.02);
      k.cyl(metal, 0.015, 0.018, 0.28, -0.4, 1.06, -0.2);
      k.box(metal, 0.03, 0.03, 0.17, -0.4, 1.2, -0.13);
      if (k.rnd() < 0.6) k.box(k.mat(k.pick(ACCENT), 0.5), 0.07, 0.18, 0.05, -0.02, 1.01, -0.2);
    } else if (v < 0.75) { // hob
      k.box(k.mat(0x0d0d0e, 0.15), 0.6, 0.012, 0.52, 0.42, 0.926, 0);
      for (const x of [-0.14, 0.14]) for (const z of [-0.12, 0.12]) k.cyl(k.mat(0x3a3a3c, 0.6), 0.075, 0.075, 0.006, 0.42 + x, 0.935, z);
      for (const x of [-0.18, -0.06, 0.06, 0.18]) k.cyl(metal, 0.02, 0.02, 0.025, 0.42 + x, 0.83, 0.3, 8, Math.PI / 2);
      k.cyl(k.mat(0x30302e, 0.4, 0.6), 0.12, 0.1, 0.12, 0.28, 0.98, 0.1);
    } else { // microwave, chopping board, fruit
      k.box(k.mat(0xdedad2, 0.4), 0.5, 0.3, 0.36, 0.5, 1.07, -0.1);
      k.box(k.mat(0x111416, 0.15), 0.32, 0.2, 0.005, 0.44, 1.07, 0.081);
      k.box(k.mat(0xb58d62, 0.6), 0.4, 0.02, 0.28, -0.35, 0.93, 0.05);
      k.fruit(-0.05, 0.92, -0.05);
    }
    if (k.rnd() < 0.75) { // wall cupboards above
      k.box(cab, 1.96, 0.7, 0.34, 0, 1.9, -0.15);
      for (const x of [-0.49, 0, 0.49]) k.box(dark, 0.006, 0.68, 0.005, x, 1.9, 0.022);
      for (const x of [-0.735, -0.245, 0.245, 0.735]) k.box(metal, 0.015, 0.1, 0.02, x + (x < 0 ? 0.2 : -0.2), 1.62, 0.035);
    }
  } };
  R.fridge = { w: 1.9, d: 0.72, boxes: [[-0.48, 0, 0.9, 0.72, 1.86], [0.5, 0, 0.9, 0.62, 2.1]], build(k) {
    const steel = k.mat(k.pick([0xc4c8cc, 0xe8e6e0, 0x2c2e30]), 0.35, 0.5), dark = k.mat(0x16130f, 0.9), metal = k.mat(0xb8bcc0, 0.3, 0.8);
    k.box(steel, 0.88, 1.84, 0.68, -0.48, 0.94, 0);
    k.box(dark, 0.86, 0.008, 0.005, -0.48, 1.28, 0.342);
    k.box(metal, 0.025, 0.3, 0.03, -0.1, 1.48, 0.355);
    k.box(metal, 0.025, 0.55, 0.03, -0.1, 0.92, 0.355);
    for (let i = 0; i < 3; i++) k.box(k.mat(k.pick(ACCENT), 0.6), 0.06, 0.06, 0.01, -0.7 + k.rnd() * 0.4, 1.4 + k.rnd() * 0.35, 0.345);
    if (k.rnd() < 0.7) k.box(k.mat(0xf2efe6, 0.9), 0.15, 0.2, 0.004, -0.55, 1.05, 0.343, 0.05);
    const cab = k.mat(k.pick(CAB), 0.6);
    k.box(cab, 0.9, 2.08, 0.6, 0.5, 1.04, -0.05);
    k.box(dark, 0.006, 2.0, 0.005, 0.5, 1.04, 0.252);
    k.box(dark, 0.88, 0.006, 0.005, 0.5, 1.5, 0.252);
    for (const x of [0.44, 0.56]) { k.box(metal, 0.015, 0.14, 0.02, x, 1.0, 0.265); k.box(metal, 0.015, 0.1, 0.02, x, 1.6, 0.265); }
  } };
  R.island = { w: 1.8, d: 1.25, cover: 1, boxes: [[0, -0.17, 1.8, 0.9, 0.95], [-0.5, 0.43, 0.38, 0.38, 0.78], [0.5, 0.43, 0.38, 0.38, 0.78]], build(k) {
    const cab = k.mat(k.pick(CAB), 0.6), top = k.mat(k.pick([0x2b2b2b, 0xd8d4cc, 0x4a4540]), 0.3), dark = k.mat(0x16130f, 0.9);
    k.box(dark, 1.62, 0.1, 0.78, 0, 0.05, -0.2);
    k.box(cab, 1.7, 0.8, 0.84, 0, 0.5, -0.2);
    k.box(top, 1.8, 0.05, 0.92, 0, 0.925, -0.12);
    const seat = k.mat(k.pick([0x2a2a2a, 0x8a5a34, 0x5b6770]), 0.6), leg = k.mat(0x9a9ea2, 0.35, 0.8);
    for (const x of [-0.5, 0.5]) {
      k.cyl(seat, 0.17, 0.16, 0.05, x, 0.75, 0.43);
      for (const [a, b] of [[-0.11, -0.11], [0.11, -0.11], [-0.11, 0.11], [0.11, 0.11]]) k.box(leg, 0.025, 0.73, 0.025, x + a, 0.365, 0.43 + b);
      k.box(leg, 0.25, 0.02, 0.02, x, 0.28, 0.54);
    }
    k.fruit(0.1, 0.95, -0.2);
  } };
  R.dining = { w: 1.9, d: 1.7, boxes: [[0, 0, 1.6, 0.9, 0.76], [-0.4, -0.64, 0.44, 0.42, 0.95], [0.4, -0.64, 0.44, 0.42, 0.95], [-0.4, 0.64, 0.44, 0.42, 0.95], [0.4, 0.64, 0.44, 0.42, 0.95]], build(k) {
    const w = k.mat(k.pick(WOOD), 0.55), cw = k.rnd() < 0.5 ? w : k.mat(k.pick(WOOD.concat([0x2a2a2a, 0xe9e4da])), 0.6);
    k.box(w, 1.6, 0.04, 0.9, 0, 0.74, 0);
    for (const x of [-0.74, 0.74]) for (const z of [-0.39, 0.39]) k.box(w, 0.06, 0.72, 0.06, x, 0.36, z);
    const plate = k.mat(0xf2efe8, 0.3);
    for (const s of [-1, 1]) for (const x of [-0.4, 0.4]) {
      const z = s * 0.64;
      k.box(cw, 0.42, 0.04, 0.42, x, 0.46, z);
      for (const a of [-0.18, 0.18]) for (const b of [-0.18, 0.18]) k.box(cw, 0.035, 0.44, 0.035, x + a, 0.22, z + b);
      k.box(cw, 0.42, 0.48, 0.03, x, 0.72, z + s * 0.195);
      if (k.rnd() < 0.7) k.cyl(plate, 0.11, 0.1, 0.012, x, 0.766, s * 0.27);
    }
    if (k.rnd() < 0.6) { k.cyl(k.mat(k.pick(ACCENT), 0.3), 0.06, 0.05, 0.22, 0, 0.87, 0); k.ico(k.leaf(), 0.12, 0, 1.02, 0); }
    else for (const x of [-0.08, 0.08]) { k.cyl(k.mat(0x9a9ea2, 0.3, 0.8), 0.03, 0.04, 0.03, x, 0.775, 0); k.cyl(k.mat(0xf3eedf, 0.7), 0.012, 0.012, 0.2, x, 0.89, 0); }
  } };
  // ---------------------------------------------------------------- bedroom
  R.bed = { w: 1.6, d: 1.95, boxes: [[0, 0.03, 1.6, 1.89, 0.6], [0, -0.94, 1.6, 0.07, 1.12]], build(k) {
    const w = k.mat(k.pick(WOOD), 0.6), sheet = k.mat(0xece8de, 0.95), blanket = k.mat(k.pick(FABRIC), 0.95);
    for (const x of [-0.76, 0.76]) for (const z of [-0.88, 0.92]) k.box(w, 0.06, 0.08, 0.06, x, 0.04, z);
    k.box(w, 1.6, 0.24, 1.88, 0, 0.2, 0.03);
    k.box(sheet, 1.5, 0.22, 1.84, 0, 0.43, 0.03);
    k.box(blanket, 1.56, 0.07, 1.25, 0, 0.555, 0.33);
    k.box(k.mat(k.tint(blanket.color.getHex(), 1.25), 0.95), 1.56, 0.08, 0.16, 0, 0.56, -0.25);
    for (const x of [-0.36, 0.36]) k.box(sheet, 0.6, 0.12, 0.36, x, 0.6, -0.7, (k.rnd() - 0.5) * 0.15);
    const hb = k.rnd() < 0.5 ? w : k.mat(k.pick(FABRIC), 0.95);
    k.box(hb, 1.64, 0.95, 0.07, 0, 0.6, -0.94);
    k.box(w, 1.68, 0.05, 0.09, 0, 1.095, -0.94);
    if (k.rnd() < 0.5) k.box(k.mat(k.pick(ACCENT), 0.95), 0.4, 0.3, 0.1, 0, 0.66, -0.55, 0.1);
  } };
  R.dresser = { w: 1.3, d: 0.5, cover: 1, boxes: [[0, 0, 1.3, 0.5, 0.95]], build(k) {
    const w = k.mat(k.pick(WOOD.concat([0xe9e4da])), 0.6), face = k.mat(k.tint(w.color.getHex(), 1.08), 0.55), knob = k.mat(0xb8a060, 0.3, 0.9);
    k.box(k.mat(0x1a1410, 0.8), 1.26, 0.07, 0.44, 0, 0.035, 0);
    k.box(w, 1.3, 0.86, 0.48, 0, 0.5, 0);
    k.box(w, 1.34, 0.03, 0.52, 0, 0.945, 0);
    for (const y of [0.22, 0.5, 0.78]) for (const x of [-0.32, 0.32]) { k.box(face, 0.6, 0.25, 0.02, x, y, 0.25); k.sph(knob, 0.018, x, y, 0.27); }
    if (k.rnd() < 0.55) k.tableLamp(-0.42, 0.96, -0.05);
    else {
      k.box(w, 0.9, 0.7, 0.03, 0, 1.6, -0.23);
      k.box(k.mat(0xc8d0d8, 0.05, 1), 0.82, 0.62, 0.005, 0, 1.6, -0.213);
    }
    k.box(k.mat(0x2a2a2a, 0.5), 0.18, 0.24, 0.02, 0.15, 1.08, -0.08, 0.2);
    k.box(k.mat(0xe0dccf, 0.7), 0.15, 0.2, 0.004, 0.152, 1.08, -0.068, 0.2);
    if (k.rnd() < 0.6) for (let i = 0; i < 3; i++) k.box(k.mat(k.pick(BOOKS), 0.85), 0.2, 0.035, 0.27, 0.45, 0.98 + i * 0.036, 0, (k.rnd() - 0.5) * 0.3);
  } };
  R.wardrobe = { w: 1.6, d: 0.62, boxes: [[0, 0, 1.6, 0.62, 2.1]], build(k) {
    const w = k.mat(k.pick(WOOD.concat([0xe9e4da, 0xcfc6b4])), 0.6), face = k.mat(k.tint(w.color.getHex(), 1.07), 0.55), metal = k.mat(0xb8bcc0, 0.3, 0.8);
    k.box(k.mat(0x1a1410, 0.8), 1.56, 0.05, 0.56, 0, 0.025, 0);
    k.box(w, 1.6, 2.0, 0.6, 0, 1.05, 0);
    k.box(w, 1.64, 0.05, 0.64, 0, 2.075, 0);
    for (const x of [-0.395, 0.395]) k.box(face, 0.78, 1.9, 0.02, x, 1.05, 0.305);
    for (const x of [-0.04, 0.04]) k.box(metal, 0.02, 0.3, 0.02, x, 1.1, 0.325);
    if (k.rnd() < 0.5) k.box(k.mat(k.pick([0x2a2a2a, 0x6a3f2f, 0x3f4f6a]), 0.6), 0.6, 0.22, 0.42, 0.3, 2.21, 0);
  } };
  // ---------------------------------------------------------------- office
  R.desk = { w: 1.4, d: 1.15, boxes: [[0, -0.225, 1.4, 0.7, 0.76], [0, 0.3, 0.56, 0.52, 1.0]], build(k) {
    const w = k.mat(k.pick(WOOD.concat([0xe9e4da, 0x2f3a40])), 0.55), black = k.mat(0x18191b, 0.5);
    k.box(w, 1.4, 0.04, 0.7, 0, 0.74, -0.225);
    for (const x of [-0.68, 0.68]) k.box(w, 0.03, 0.72, 0.66, x, 0.36, -0.225);
    k.box(w, 1.34, 0.4, 0.02, 0, 0.5, -0.54);
    k.box(w, 0.4, 0.5, 0.6, 0.45, 0.42, -0.225);
    k.box(k.mat(0x1a1410, 0.9), 0.38, 0.006, 0.005, 0.45, 0.5, 0.076);
    k.box(black, 0.22, 0.015, 0.16, 0, 0.768, -0.42);
    k.box(black, 0.04, 0.3, 0.03, 0, 0.92, -0.44);
    k.box(black, 0.62, 0.38, 0.03, 0, 1.07, -0.41);
    k.box(k.screen(), 0.58, 0.34, 0.005, 0, 1.07, -0.393);
    k.box(black, 0.42, 0.02, 0.14, 0, 0.77, -0.16);
    k.box(black, 0.05, 0.02, 0.08, 0.3, 0.77, -0.15);
    k.cyl(k.mat(k.pick(ACCENT), 0.4), 0.04, 0.035, 0.09, -0.45, 0.805, -0.3);
    k.box(k.mat(0xf2efe6, 0.9), 0.21, 0.004, 0.3, -0.35, 0.762, -0.2, 0.2);
    // office chair, pulled up to the desk
    const seat = k.mat(k.pick([0x222326, 0x3f4f6a, 0x5a2e2e]), 0.9);
    for (let i = 0; i < 5; i++) { const a = (i / 5) * Math.PI * 2; k.box(black, 0.04, 0.03, 0.3, Math.sin(a) * 0.13, 0.05, 0.3 + Math.cos(a) * 0.13, a); }
    k.cyl(black, 0.025, 0.025, 0.38, 0, 0.27, 0.3);
    k.box(seat, 0.5, 0.08, 0.48, 0, 0.5, 0.3);
    k.box(seat, 0.46, 0.5, 0.06, 0, 0.82, 0.54);
    for (const x of [-0.25, 0.25]) k.box(black, 0.04, 0.03, 0.26, x, 0.68, 0.3);
  } };
  R.files = { w: 1.0, d: 0.62, cover: 1, boxes: [[0, 0, 1.0, 0.62, 1.32]], build(k) {
    const m = k.mat(k.pick([0x7d8389, 0x5b6770, 0xb9bbb6, 0x3a4044]), 0.45, 0.5), face = k.mat(k.tint(m.color.getHex(), 1.1), 0.4, 0.5), metal = k.mat(0xc8ccd0, 0.3, 0.8);
    for (const x of [-0.25, 0.25]) {
      k.box(m, 0.48, 1.3, 0.6, x, 0.65, 0);
      for (const y of [0.17, 0.48, 0.79, 1.1]) { k.box(face, 0.44, 0.29, 0.02, x, y, 0.305); k.box(metal, 0.14, 0.02, 0.025, x, y + 0.08, 0.32); k.box(k.mat(0xf2efe6, 0.9), 0.08, 0.03, 0.004, x, y + 0.03, 0.317); }
    }
    if (k.rnd() < 0.5) k.plantSmall(0.25, 1.3, 0); else for (let i = 0; i < 4; i++) k.box(k.mat(k.pick(BOOKS), 0.8), 0.08, 0.3, 0.26, -0.4 + i * 0.09, 1.45, 0);
  } };
  R.deskpair = { w: 1.6, d: 1.5, cover: 1, boxes: [[0, 0, 1.6, 1.5, 0.76], [0, 0, 1.6, 0.06, 1.25]], build(k) {
    const w = k.mat(k.pick([0xe9e4da, 0xb58d62, 0x8a8f94]), 0.55), black = k.mat(0x18191b, 0.5), leg = k.mat(0x7d8389, 0.4, 0.6);
    for (const s of [-1, 1]) {
      k.box(w, 1.6, 0.04, 0.72, 0, 0.74, s * 0.37);
      for (const x of [-0.76, 0.76]) k.box(leg, 0.05, 0.72, 0.6, x, 0.36, s * 0.38);
      k.box(black, 0.62, 0.38, 0.03, -0.3, 1.07, s * 0.12);
      k.box(k.screen(), 0.58, 0.34, 0.005, -0.3, 1.07, s * 0.137);
      k.box(black, 0.04, 0.3, 0.03, -0.3, 0.92, s * 0.1);
      k.box(black, 0.42, 0.02, 0.14, -0.3, 0.77, s * 0.42);
      k.box(k.mat(0xf2efe6, 0.9), 0.21, 0.004, 0.3, 0.35, 0.762, s * 0.4, 0.3);
      if (k.rnd() < 0.5) k.cyl(k.mat(k.pick(ACCENT), 0.4), 0.04, 0.035, 0.09, 0.55, 0.805, s * 0.3);
    }
    k.box(k.mat(k.pick([0x5b6770, 0x4f6b4a, 0x6a3f4f]), 1), 1.6, 0.48, 0.04, 0, 1.0, 0);
    k.box(leg, 1.62, 0.025, 0.05, 0, 1.25, 0);
  } };
  // ---------------------------------------------------------------- storage
  // Open shelving: what's on it is laid out from the piece's own seed (v), so the meshes and what stops a
  // round or blocks a look (ray: posts, shelves, cartons, not the gaps) agree on every peer.
  const RACK_Y = [0.12, 0.7, 1.3, 1.9];
  const rackLoad = (v) => {
    const r = G.U.rng(Math.floor(v * 4294967295)), out = [];
    for (const y of RACK_Y) {
      if (y > 1.8) continue;
      let x = -0.88;
      while (x < 0.8) {
        const bw = 0.3 + r() * 0.3, bh = 0.2 + r() * 0.25, bd = 0.3 + r() * 0.2;
        if (x + bw > 0.9) break;
        if (r() < 0.8) out.push([x + bw / 2, y + 0.015, bw, bh, bd]);
        x += bw + 0.03;
      }
    }
    return out;
  };
  R.rack = { w: 1.9, d: 0.6, boxes: [[0, 0, 1.9, 0.6, 2.0]],
    ray: (v) => [
      ...[-0.92, 0.92].flatMap((x) => [-0.27, 0.27].map((z) => [x, z, 0.04, 0.04, 2.0, 0])),
      ...RACK_Y.map((y) => [0, 0, 1.88, 0.58, y + 0.015, y - 0.015]),
      ...rackLoad(v).map(([x, y, bw, bh, bd]) => [x, 0, bw, bd, y + bh, y]),
    ],
    build(k, v) {
      const metal = k.mat(k.pick([0x3f5a7a, 0x8a8f94, 0xc06a2a]), 0.5, 0.6), shelf = k.mat(0x9a9ea2, 0.5, 0.6);
      for (const x of [-0.92, 0.92]) for (const z of [-0.27, 0.27]) k.box(metal, 0.04, 2.0, 0.04, x, 1.0, z);
      for (const y of RACK_Y) k.box(shelf, 1.88, 0.03, 0.58, 0, y, 0);
      for (const [x, y, bw, bh, bd] of rackLoad(v)) { k.box(k.mat(k.pick(CARD), 0.95), bw, bh, bd, x, y + bh / 2, 0); k.box(k.mat(0xc8b48a, 0.6), bw + 0.002, 0.004, 0.05, x, y + 0.002 + bh, 0); }
    } };
  R.crates = { w: 1.7, d: 1.7, cover: 1, boxes: (v) => v < 0.5 ? [[0, 0, 1.6, 1.6, 1.1], [0.25, -0.2, 0.8, 0.8, 1.75]] : [[0, 0, 1.6, 1.6, 1.1]], build(k, v) {
    const c = k.crate();
    k.box(c, 1.6, 1.1, 1.6, 0, 0.55, 0);
    if (v < 0.5) k.box(c, 0.8, 0.65, 0.8, 0.25, 1.425, -0.2, 0.15);
  } };
  R.pallet = { w: 1.4, d: 1.4, cover: 1, boxes: [[0, 0, 1.25, 1.25, 1.27]], build(k) {
    const pw = k.mat(0x9c7a50, 0.9);
    for (const x of [-0.55, 0, 0.55]) k.box(pw, 0.1, 0.1, 1.2, x, 0.05, 0);
    for (let i = 0; i < 6; i++) k.box(pw, 1.2, 0.02, 0.14, 0, 0.11, -0.52 + i * 0.208);
    for (let y = 0; y < 2; y++) for (const x of [-0.3, 0.3]) for (const z of [-0.3, 0.3]) {
      if (y && k.rnd() < 0.25) continue;
      k.box(k.mat(k.pick(CARD), 0.95), 0.58, 0.55, 0.58, x, 0.4 + y * 0.56, z);
    }
  } };
  // ---------------------------------------------------------------- small things in corners
  R.plant = { small: 1, boxes: [[0, 0, 0.44, 0.44, 1.15]], build(k) {
    k.cyl(k.mat(k.pick([0xa0522d, 0xe8e4da, 0x2f3a40, 0x6d7b66]), 0.7), 0.2, 0.15, 0.34, 0, 0.17, 0);
    k.cyl(k.mat(0x2a1e14, 1), 0.18, 0.18, 0.02, 0, 0.33, 0);
    const n = 5 + Math.floor(k.rnd() * 3);
    for (let i = 0; i < n; i++) { const a = k.rnd() * 6.28, r = k.rnd() * 0.12; k.ico(k.leaf(), 0.14 + k.rnd() * 0.12, Math.cos(a) * r, 0.5 + k.rnd() * 0.55, Math.sin(a) * r); }
  } };
  R.lamp = { small: 1, boxes: [[0, 0, 0.36, 0.36, 1.62]], build(k) {
    const m = k.mat(k.pick([0x1c1c1e, 0xb8a060, 0x9a9ea2]), 0.3, 0.8);
    k.cyl(m, 0.16, 0.17, 0.03, 0, 0.015, 0);
    k.cyl(m, 0.012, 0.012, 1.4, 0, 0.72, 0);
    k.cyl(k.shade(), 0.13, 0.2, 0.28, 0, 1.48, 0);
  } };
  R.sidetable = { small: 1, boxes: [[0, 0, 0.5, 0.5, 0.56]], build(k) {
    const w = k.mat(k.pick(WOOD), 0.6);
    k.box(w, 0.5, 0.03, 0.5, 0, 0.545, 0);
    for (const x of [-0.22, 0.22]) for (const z of [-0.22, 0.22]) k.box(w, 0.035, 0.53, 0.035, x, 0.265, z);
    k.box(w, 0.44, 0.02, 0.44, 0, 0.15, 0);
    if (k.rnd() < 0.6) k.tableLamp(0, 0.56, 0); else k.plantSmall(0, 0.56, 0);
  } };
  R.bin = { small: 1, boxes: [[0, 0, 0.32, 0.32, 0.42]], build(k) {
    k.cyl(k.mat(k.pick([0x3a3d40, 0x6d7b66, 0xb9bbb6]), 0.5, 0.3), 0.15, 0.13, 0.42, 0, 0.21, 0);
    k.cyl(k.mat(0x111111, 0.9), 0.135, 0.135, 0.005, 0, 0.415, 0);
  } };
  R.cooler = { small: 1, boxes: [[0, 0, 0.34, 0.34, 1.32]], build(k) {
    k.box(k.mat(0xe8e6e0, 0.5), 0.32, 0.95, 0.32, 0, 0.475, 0);
    k.box(k.mat(0x2a2a2a, 0.5), 0.2, 0.08, 0.02, 0, 0.8, 0.165);
    k.cyl(k.mat(0x6aa8d8, 0.1, 0.1), 0.13, 0.13, 0.38, 0, 1.14, 0);
  } };
  R.cardboard = { small: 1, boxes: [[0, 0, 0.62, 0.52, 0.75]], build(k) {
    k.box(k.mat(k.pick(CARD), 0.95), 0.6, 0.4, 0.5, 0, 0.2, 0);
    k.box(k.mat(k.pick(CARD), 0.95), 0.45, 0.33, 0.38, 0.05, 0.565, -0.02, 0.2);
  } };

  // ---------------------------------------------------------------- warehouse
  // A bay of pallet racking: blue uprights, orange beams, three levels of pallets with cargo. Fills its tile
  // along its length and stands taller than you, so the aisles between rows are what you see down.
  const PRACK_Y = [0.12, 1.0, 1.9];
  // each level's load: [y, kind (0 empty, 1 shrink-wrapped stack, 2 cartons, 3 drums), heights]
  const prackLoad = (v) => {
    const r = G.U.rng(Math.floor(v * 4294967295));
    return PRACK_Y.map((y) => {
      if (r() < 0.15) return [y, 0]; // an empty bay
      const kind = r();
      if (kind < 0.4) return [y, 1, [0.6 + r() * 0.15]];
      if (kind < 0.8) return [y, 2, [0, 1, 2, 3].map(() => 0.45 + r() * 0.2)];
      return [y, 3];
    });
  };
  const PRACK_XZ = [[-0.3, -0.24], [-0.3, 0.24], [0.3, -0.24], [0.3, 0.24]];
  R.palletrack = { w: 1.98, d: 1.15, boxes: [[0, 0, 1.98, 1.15, 2.7]],
    ray: (v) => {
      const o = [];
      for (const x of [-0.97, 0.97]) for (const z of [-0.54, 0.54]) o.push([x, z, 0.06, 0.06, 2.7, 0]); // uprights
      for (const [y, kind, hs] of prackLoad(v)) {
        for (const z of [-0.54, 0.54]) o.push([0, z, 1.9, 0.05, y + 0.05, y - 0.05]); // beams
        if (!kind) continue;
        o.push([0, 0, 1.2, 1.0, y + 0.17, y + 0.05]); // the pallet
        if (kind === 1) o.push([0, 0, 1.15, 0.95, y + 0.5 + hs[0] / 2, y + 0.5 - hs[0] / 2]);
        else if (kind === 2) PRACK_XZ.forEach(([x, z], i) => o.push([x, z, 0.56, 0.45, y + 0.4 + hs[i] / 2, y + 0.4 - hs[i] / 2]));
        else for (const [x, z] of PRACK_XZ) o.push([x, z, 0.34, 0.34, y + 0.79, y + 0.17]); // drums (the square inside each)
      }
      return o;
    },
    build(k, v) {
      const up = k.mat(0x2f4f86, 0.5, 0.5), beam = k.mat(0xd2691e, 0.5, 0.4), pw = k.mat(0x9c7a50, 0.9);
      for (const x of [-0.97, 0.97]) for (const z of [-0.54, 0.54]) k.box(up, 0.06, 2.7, 0.06, x, 1.35, z);
      for (const x of [-0.97, 0.97]) for (let y = 0.3; y < 2.7; y += 0.45) k.box(up, 0.02, 0.02, 1.08, x, y, 0, 0, 0.6);
      for (const [y, kind, hs] of prackLoad(v)) {
        for (const z of [-0.54, 0.54]) k.box(beam, 1.9, 0.1, 0.05, 0, y, z);
        if (!kind) continue;
        k.box(pw, 1.2, 0.12, 1.0, 0, y + 0.11, 0);
        if (kind === 1) k.box(k.mat(0xc8ccd0, 0.25, 0, { transparent: true, opacity: 0.85 }), 1.15, hs[0], 0.95, 0, y + 0.5, 0); // shrink-wrapped
        else if (kind === 2) PRACK_XZ.forEach(([x, z], i) => k.box(k.mat(k.pick(CARD), 0.95), 0.56, hs[i], 0.45, x, y + 0.4, z)); // cartons
        else for (const [x, z] of PRACK_XZ) k.cyl(k.mat(k.pick([0x2a5a8a, 0x3a6a3a, 0x8a2a2a]), 0.5, 0.3), 0.21, 0.21, 0.62, x, y + 0.48, z); // drums
      }
    } };
  // ---------------------------------------------------------------- gardens
  // A close-boarded garden fence, 1.9 m: too tall to see over. Fills its tile along its length.
  // (one panel per 0.67 m cell)
  R.fence = { w: 0.68, d: 0.14, boxes: [[0, 0, 0.68, 0.14, 1.9]], build(k, v) {
    const wood = k.mat([0x6b5236, 0x7a5f3e, 0x5e4a33, 0x84694a][Math.floor(v * 4)], 0.95), post = k.mat(0x4a3a28, 0.95);
    if (v < 0.5) k.box(post, 0.09, 1.95, 0.09, -0.3, 0.975, 0);
    for (const y of [0.35, 1.55]) k.box(post, 0.68, 0.08, 0.04, 0, y, -0.05);
    for (let i = 0; i < 5; i++) { const bh = 1.82 + (k.rnd() - 0.5) * 0.04; k.box(wood, 0.13, bh, 0.018, -0.27 + i * 0.135, bh / 2 + 0.03, 0.01); }
    if (v < 0.08) k.box(k.mat(0x2a3a22, 0.9, 0, { flatShading: true }), 0.4, 0.45, 0.3, 0, 0.22, 0.2); // a weed at the foot
  } };
  // A clipped hedge, chest high: cover.
  R.hedge = { w: 1.9, d: 0.9, cover: 1, boxes: [[0, 0, 1.9, 0.9, 1.25]], build(k) {
    const leaf = k.mat(k.pick([0x2f5a2c, 0x35602e, 0x2a4f28]), 0.95, 0, { flatShading: true });
    k.box(leaf, 1.86, 1.15, 0.86, 0, 0.575, 0);
    for (let i = 0; i < 10; i++) k.ico(leaf, 0.2 + k.rnd() * 0.12, (k.rnd() - 0.5) * 1.7, 0.7 + k.rnd() * 0.5, (k.rnd() - 0.5) * 0.7);
  } };
  // A timber garden shed with a felt roof: solid, taller than you.
  R.shed = { w: 1.9, d: 1.6, boxes: [[0, 0, 1.9, 1.5, 2.3]], build(k) {
    const wood = k.mat(k.pick([0x6b4f32, 0x5a6b4a, 0x7a6248, 0x4a5a62]), 0.9), roof = k.mat(0x2a2a2c, 0.95);
    k.box(wood, 1.86, 1.95, 1.46, 0, 0.975, 0);
    for (let i = 0; i < 9; i++) k.box(k.mat(0x000000, 1, 0, { transparent: true, opacity: 0.18 }), 1.87, 0.01, 1.47, 0, 0.2 + i * 0.2, 0);
    k.box(roof, 2.0, 0.08, 0.9, 0, 2.12, -0.38, 0, -0.42); k.box(roof, 2.0, 0.08, 0.9, 0, 2.12, 0.38, 0, 0.42);
    k.box(k.mat(0x3a2a1c, 0.9), 0.8, 1.7, 0.03, 0.3, 0.87, 0.745);
    k.box(k.mat(0x9fb0b8, 0.2, 0.3), 0.4, 0.35, 0.02, -0.5, 1.35, 0.745);
  } };
  // A kettle barbecue on legs, low cover.
  R.bbq = { w: 0.9, d: 0.7, cover: 1, boxes: [[0, 0, 0.8, 0.6, 1.0]], build(k) {
    const black = k.mat(0x1c1c1e, 0.5, 0.4), steel = k.mat(0x9a9ea2, 0.4, 0.6);
    for (const x of [-0.25, 0.25]) for (const z of [-0.18, 0.18]) k.box(steel, 0.03, 0.75, 0.03, x, 0.375, z);
    k.box(steel, 0.75, 0.03, 0.5, 0, 0.35, 0);
    k.sph(black, 0.3, 0, 0.82, 0);
    k.box(steel, 0.12, 0.03, 0.03, 0, 1.12, 0.12);
  } };
  // A patio table with an umbrella and four chairs.
  R.patio = { w: 1.9, d: 1.9, boxes: [[0, 0, 1.0, 1.0, 0.74], [0, -0.75, 0.45, 0.45, 0.9], [0, 0.75, 0.45, 0.45, 0.9], [-0.75, 0, 0.45, 0.45, 0.9], [0.75, 0, 0.45, 0.45, 0.9]], build(k) {
    const frame = k.mat(k.pick([0x2a2a2c, 0xe8e4da, 0x6b4428]), 0.5, 0.3), top = k.mat(0xe8e4da, 0.4);
    k.cyl(top, 0.5, 0.5, 0.03, 0, 0.73, 0, 24);
    k.cyl(frame, 0.03, 0.03, 0.72, 0, 0.36, 0);
    k.cyl(frame, 0.02, 0.02, 1.6, 0, 1.5, 0);
    k.cyl(k.mat(k.pick([0xc0504d, 0x4f81bd, 0xe8e0d0, 0x9bbb59]), 0.8), 0.05, 1.1, 0.35, 0, 2.15, 0, 8);
    for (const [x, z, ry] of [[0, -0.75, 0], [0, 0.75, Math.PI], [-0.75, 0, Math.PI / 2], [0.75, 0, -Math.PI / 2]]) {
      k.box(frame, 0.42, 0.04, 0.42, x, 0.45, z);
      for (const a of [-0.18, 0.18]) for (const b of [-0.18, 0.18]) k.box(frame, 0.03, 0.45, 0.03, x + a, 0.225, z + b);
      k.box(frame, Math.abs(x) > 0 ? 0.04 : 0.42, 0.4, Math.abs(x) > 0 ? 0.42 : 0.04, x + Math.sign(x) * 0.19, 0.67, z + Math.sign(z) * 0.19, ry * 0);
    }
  } };
  // A raised planter with flowers.
  R.planter = { small: 1, boxes: [[0, 0, 0.6, 0.6, 0.55]], build(k) {
    k.box(k.mat(k.pick([0x6b4428, 0x8a7a6a, 0x5a5f62]), 0.9), 0.58, 0.4, 0.58, 0, 0.2, 0);
    k.box(k.mat(0x2a1e14, 1), 0.52, 0.02, 0.52, 0, 0.41, 0);
    for (let i = 0; i < 6; i++) k.sph(k.mat(k.pick([0xd8642a, 0xc0302a, 0xe8c040, 0xb060c0, 0xf2efe6]), 0.6), 0.05, (k.rnd() - 0.5) * 0.4, 0.5 + k.rnd() * 0.06, (k.rnd() - 0.5) * 0.4);
    for (let i = 0; i < 4; i++) k.ico(k.leaf(), 0.1, (k.rnd() - 0.5) * 0.35, 0.45, (k.rnd() - 0.5) * 0.35);
  } };

  // What goes in each kind of room. `must` is placed first, against a wall.
  const ROOMS = {
    living: { must: 'tv', wall: ['sofa', 'bookshelf', 'dresser', 'bookshelf', 'sofa'], center: ['sofa', 'armchairs'], small: ['plant', 'lamp', 'sidetable', 'plant'], floor: 'wood', rug: 1 },
    kitchen: { must: 'counter', wall: ['counter', 'fridge', 'counter', 'counter'], center: ['island', 'dining'], small: ['plant', 'bin'], floor: 'tile' },
    dining: { must: 'dresser', wall: ['bookshelf', 'dresser', 'counter'], center: ['dining', 'dining'], small: ['plant', 'lamp'], floor: 'wood', rug: 1 },
    bedroom: { must: 'bed', wall: ['wardrobe', 'dresser', 'desk', 'bookshelf'], center: [], small: ['plant', 'lamp', 'sidetable', 'bin'], floor: 'carpet', rug: 0.6 },
    office: { must: 'desk', wall: ['desk', 'files', 'bookshelf', 'files'], center: ['deskpair'], small: ['plant', 'cooler', 'bin'], floor: 'carpet' },
    storage: { must: 'rack', wall: ['rack', 'rack', 'crates'], center: ['crates', 'crates', 'pallet'], small: ['cardboard', 'bin', 'cardboard'], floor: null, dense: 1 },
    breakroom: { must: 'counter', wall: ['fridge', 'sofa', 'tv', 'files'], center: ['dining'], small: ['plant', 'cooler', 'bin'], floor: 'tile' },
    // a garden: things against the house wall, a hedge or a shed or a patio set out on the lawn
    yard: { must: 'bbq', wall: ['shed', 'planter', 'bbq', 'shed'], center: ['hedge', 'patio', 'hedge', 'shed'], small: ['planter', 'bin', 'planter'], floor: 'grass', out: 1 },
    // the warehouse floor and loading dock are laid out on their own (plan())
    hall: { floor: null }, dock: { floor: 'pave' },
    // outside: the street in front of a house, the lot in front of a building (bins, pallets, crates)
    street: { must: 'bin', wall: ['bin', 'planter', 'bin'], center: [], small: ['planter', 'bin'], floor: 'pave', out: 1 },
    lot: { must: 'crates', wall: ['pallet', 'bin', 'crates', 'pallet'], center: [], small: ['bin', 'cardboard'], floor: 'pave', out: 1 },
    // an apartment block's hallway and the landing at the top of the stairs: bare
    corridor: { floor: 'carpet', bare: 1 }, landing: { floor: 'tile', bare: 1 },
    alley: { floor: 'pave', bare: 1, out: 1 }, // the passage between two houses
  };
  // small pieces give only their boxes; they need a footprint too when they're set against a wall
  for (const rec of Object.values(R)) if (rec.w == null || rec.d == null) {
    const b = (typeof rec.boxes === 'function' ? rec.boxes(0) : rec.boxes)[0];
    rec.w = rec.w == null ? b[2] : rec.w; rec.d = rec.d == null ? b[3] : rec.d;
  }
  const HOME = ['living', 'kitchen', 'bedroom', 'dining', 'living', 'bedroom', 'office'];
  const WORK = ['storage', 'office', 'breakroom', 'storage'];

  // world-space collision boxes for a piece placed at (x, z) turned q quarter-turns
  function worldBoxes(rec, x, z, q, v) {
    const s = Math.round(Math.sin(q * Math.PI / 2)), c = Math.round(Math.cos(q * Math.PI / 2));
    const at = (list) => list.map(([lx, lz, w, d, h, y0 = 0]) => ({
      cx: x + lx * c + lz * s, cz: z - lx * s + lz * c,
      hx: (c ? w : d) / 2, hz: (c ? d : w) / 2, y0, h,
    }));
    const out = at(typeof rec.boxes === 'function' ? rec.boxes(v) : rec.boxes).sort((a, b) => b.h - a.h);
    // open pieces (shelving): you walk into the whole footprint, but rounds and eyes meet only what's solid
    if (rec.ray) out[0].ray = at(rec.ray(v));
    return out;
  }
  // quarter-turns that put the back (-z) of a piece against the wall in direction (dx, dz)
  const facing = (dx, dz) => ((Math.round(Math.atan2(-dx, -dz) / (Math.PI / 2)) % 4) + 4) % 4;

  // Runs on the coarse (2 m) grid; G.Level.refine then lays the pieces on the fine grid. wd: the wall(s) a
  // piece is set against, so it can follow the wall when the wall is thinned.
  function plan(map, r, spawnRoom, exitRoom, tryBlock) {
    const U = G.U, { W, t, rooms } = map, TS = map.TS || G.Level.TS, home = map.theme.home == null ? 1 : map.theme.home;
    map.props = new Map();
    const homes = U.shuffle(r, HOME.slice());
    let hi = 0, wi = Math.floor(r() * WORK.length);
    const put = (name, tx, tz, x, z, q, v, wd) => {
      const rec = R[name], i = tz * W + tx;
      map.props.set(i, { name, q, x, z, v, wd, boxes: worldBoxes(rec, x, z, q, v) });
    };
    for (const rm of rooms) {
      rm.type = rm.type || (r() < home ? homes[hi++ % homes.length] : WORK[wi++ % WORK.length]);
      const spec = ROOMS[rm.type];
      if (spec.bare) continue;
      // the warehouse floor: rows of racking with two-tile aisles between, cut by cross-aisles
      if (rm.type === 'hall') {
        for (let z = rm.z + 1; z < rm.z + rm.h - 1; z += 3) for (let x = rm.x + 1; x < rm.x + rm.w - 1; x++) {
          if ((x - rm.x) % 7 === 0 || !tryBlock(x, z, 4)) continue;
          put('palletrack', x, z, (x + 0.5) * TS, (z + 0.5) * TS, 0, r());
        }
        continue;
      }
      // the loading dock: pallets and crates waiting to go out, clear of where you come in
      if (rm.type === 'dock') {
        let n = Math.floor((rm.w * rm.h) / 9);
        for (let a = 0; a < 80 && n > 0; a++) {
          const x = U.ri(r, rm.x, rm.x + rm.w - 1), z = U.ri(r, rm.z, rm.z + rm.h - 2);
          if (rm === spawnRoom && Math.abs(x - rm.cx) <= 2) continue;
          if ([[1, 0], [-1, 0], [0, 1], [0, -1]].some(([a2, b]) => t[(z + b) * W + x + a2] === 2)) continue;
          const name = r() < 0.6 ? 'pallet' : 'crates';
          if (!tryBlock(x, z, 2)) continue;
          put(name, x, z, (x + 0.5) * TS, (z + 0.5) * TS, Math.floor(r() * 4), r());
          n--;
        }
        continue;
      }
      const inRoom = (x, z) => x >= rm.x && x < rm.x + rm.w && z >= rm.z && z < rm.z + rm.h;
      // keep doorways and corridor mouths clear
      const nearOpening = (x, z) => {
        for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) if (!inRoom(x + dx, z + dz) && t[(z + dz) * W + x + dx] !== 1) return true;
        return false;
      };
      const edges = [], corners = [];
      for (let z = rm.z; z < rm.z + rm.h; z++) for (let x = rm.x; x < rm.x + rm.w; x++) {
        const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]].filter(([dx, dz]) => !inRoom(x + dx, z + dz) && t[(z + dz) * W + x + dx] === 1);
        if (!dirs.length || nearOpening(x, z)) continue;
        (dirs.length === 1 ? edges : corners).push({ x, z, dirs });
      }
      U.shuffle(r, edges); U.shuffle(r, corners);
      const center = (x) => (x + 0.5) * TS;
      // against the walls
      let want = Math.max(1, Math.round((edges.length + corners.length) * (spec.dense ? 0.5 : 0.42)));
      const pool = [spec.must].concat(U.shuffle(r, spec.wall.slice()));
      let pi = 0;
      for (const e of edges) {
        if (want <= 0) break;
        const name = pool[pi % pool.length], rec = R[name], [dx, dz] = e.dirs[0];
        if (!tryBlock(e.x, e.z, rec.cover ? 2 : 4)) continue;
        const off = 1 - 0.02 - rec.d / 2;
        put(name, e.x, e.z, center(e.x) + dx * off, center(e.z) + dz * off, facing(dx, dz), r(), [[dx, dz]]);
        e.used = true; pi++; want--;
      }
      // the middle of the room (not the spawn room, not on top of the extraction point)
      if (rm !== spawnRoom && spec.center.length && rm.w >= 3 && rm.h >= 3) {
        let n = spec.dense ? Math.floor((rm.w * rm.h) / 6) : rm.w * rm.h >= 25 ? 2 : rm.w >= 4 && rm.h >= 4 ? 1 : 0;
        const inner = [];
        for (let z = rm.z + 1; z < rm.z + rm.h - 1; z++) for (let x = rm.x + 1; x < rm.x + rm.w - 1; x++) inner.push([x, z]);
        U.shuffle(r, inner);
        for (const [x, z] of inner) {
          if (n <= 0) break;
          if (rm === exitRoom && Math.abs(x - rm.cx) <= 1 && Math.abs(z - rm.cz) <= 1) continue;
          if (t[z * W + x] !== 0 || [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([a, b]) => t[(z + b) * W + x + a] === 2 || t[(z + b) * W + x + a] === 4) && !spec.dense) continue;
          const name = U.pick(r, spec.center), rec = R[name];
          if (!tryBlock(x, z, rec.cover ? 2 : 4)) continue;
          put(name, x, z, center(x), center(z), Math.floor(r() * 4), r());
          n--;
        }
      }
      // small things: tucked into corners, sometimes against a bare wall
      for (const c of corners) {
        if (r() > 0.7 || t[c.z * W + c.x] !== 0) continue;
        const [a, b] = c.dirs;
        const cdx = a[0] + b[0], cdz = a[1] + b[1];
        put(U.pick(r, spec.small), c.x, c.z, center(c.x) + cdx * 0.62, center(c.z) + cdz * 0.62, facing(a[0], a[1]), r(), [a, b]);
      }
      for (const e of edges) {
        if (e.used || r() > 0.3 || t[e.z * W + e.x] !== 0) continue;
        const [dx, dz] = e.dirs[0], side = r() < 0.5 ? -1 : 1;
        // along the wall, off to one side, so the tile centre stays free to walk
        put(U.pick(r, spec.small), e.x, e.z, center(e.x) + dx * 0.68 + dz * side * 0.62, center(e.z) + dz * 0.68 + dx * side * 0.62, facing(dx, dz), r(), [[dx, dz]]);
      }
    }
  }

  // ---------------------------------------------------------------- meshes
  function textures(rnd) {
    const mk = (w, h, draw) => { const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h); const tx = new THREE.CanvasTexture(c); tx.wrapS = tx.wrapT = THREE.RepeatWrapping; tx.anisotropy = 4; return tx; };
    const speckle = (g, w, h, n, a) => { for (let i = 0; i < n; i++) { const v = rnd() < 0.5 ? 0 : 255; g.fillStyle = `rgba(${v},${v},${v},${rnd() * a})`; g.fillRect(rnd() * w, rnd() * h, 1 + rnd() * 3, 1 + rnd() * 3); } };
    return {
      wood: (base) => mk(256, 256, (g, w, h) => {
        g.fillStyle = base; g.fillRect(0, 0, w, h);
        const rows = 8, rh = h / rows;
        for (let i = 0; i < rows; i++) {
          let x = -rnd() * 200;
          while (x < w) {
            const len = 120 + rnd() * 140, l = (rnd() - 0.5) * 0.16;
            g.fillStyle = l > 0 ? `rgba(255,240,220,${l})` : `rgba(0,0,0,${-l})`;
            g.fillRect(x, i * rh, len, rh);
            for (let k = 0; k < 5; k++) { g.fillStyle = `rgba(40,20,5,${0.05 + rnd() * 0.08})`; g.fillRect(x, i * rh + rnd() * rh, len, 1); }
            g.fillStyle = 'rgba(20,10,0,0.55)'; g.fillRect(x, i * rh, 2, rh);
            x += len;
          }
          g.fillStyle = 'rgba(20,10,0,0.5)'; g.fillRect(0, i * rh, w, 2);
        }
      }),
      tile: (base, grout) => mk(128, 128, (g, w, h) => {
        g.fillStyle = grout; g.fillRect(0, 0, w, h);
        const n = 4, s = w / n;
        for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
          g.fillStyle = base; g.fillRect(i * s + 1.5, j * s + 1.5, s - 3, s - 3);
          g.fillStyle = `rgba(${rnd() < 0.5 ? '0,0,0' : '255,255,255'},${rnd() * 0.06})`; g.fillRect(i * s + 1.5, j * s + 1.5, s - 3, s - 3);
        }
        speckle(g, w, h, 300, 0.06);
      }),
      carpet: (base) => mk(128, 128, (g, w, h) => { g.fillStyle = base; g.fillRect(0, 0, w, h); speckle(g, w, h, 2500, 0.12); }),
      // a lawn at night: dark green with blades and the odd bare patch
      grass: () => mk(256, 256, (g, w, h) => {
        g.fillStyle = '#2c4423'; g.fillRect(0, 0, w, h);
        for (let i = 0; i < 6; i++) { g.fillStyle = `rgba(${60 + rnd() * 30},${50 + rnd() * 20},30,0.25)`; g.beginPath(); g.arc(rnd() * w, rnd() * h, 10 + rnd() * 25, 0, 7); g.fill(); }
        for (let i = 0; i < 5000; i++) { const v = rnd(); g.fillStyle = v < 0.5 ? `rgba(20,40,15,${0.3 + rnd() * 0.4})` : `rgba(${80 + rnd() * 40},${110 + rnd() * 50},${50 + rnd() * 30},${0.25 + rnd() * 0.35})`; g.fillRect(rnd() * w, rnd() * h, 1, 2 + rnd() * 4); }
      }),
      rug: (a, b, c) => mk(256, 256, (g, w, h) => {
        g.fillStyle = a; g.fillRect(0, 0, w, h);
        g.strokeStyle = b; g.lineWidth = 14; g.strokeRect(14, 14, w - 28, h - 28);
        g.strokeStyle = c; g.lineWidth = 4; g.strokeRect(30, 30, w - 60, h - 60);
        g.fillStyle = b;
        for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) {
          const x = 64 + i * 64, y = 64 + j * 64;
          g.beginPath(); g.moveTo(x, y - 20); g.lineTo(x + 20, y); g.lineTo(x, y + 20); g.lineTo(x - 20, y); g.closePath(); g.fill();
        }
        speckle(g, w, h, 1500, 0.1);
      }),
      art: () => mk(128, 96, (g, w, h) => {
        if (rnd() < 0.5) { // landscape
          const sky = g.createLinearGradient(0, 0, 0, h);
          const top = U8(), hor = U8();
          sky.addColorStop(0, `rgb(${top})`); sky.addColorStop(1, `rgb(${hor})`);
          g.fillStyle = sky; g.fillRect(0, 0, w, h);
          g.fillStyle = `rgba(255,240,200,0.8)`; g.beginPath(); g.arc(20 + rnd() * 88, 18 + rnd() * 20, 6 + rnd() * 6, 0, 7); g.fill();
          for (let l = 0; l < 3; l++) {
            const y0 = h * (0.5 + l * 0.15), sh = 30 + l * 25;
            g.fillStyle = `rgb(${sh + rnd() * 30},${sh + 20 + rnd() * 40},${sh * 0.6 + rnd() * 20})`;
            g.beginPath(); g.moveTo(0, h);
            for (let x = 0; x <= w; x += 8) g.lineTo(x, y0 + Math.sin(x * 0.05 + l * 2 + rnd()) * 8);
            g.lineTo(w, h); g.closePath(); g.fill();
          }
        } else { // abstract
          g.fillStyle = `rgb(${U8()})`; g.fillRect(0, 0, w, h);
          for (let i = 0; i < 6; i++) {
            g.fillStyle = `rgba(${U8()},0.85)`;
            if (rnd() < 0.5) g.fillRect(rnd() * w, rnd() * h, 10 + rnd() * 50, 10 + rnd() * 40);
            else { g.beginPath(); g.arc(rnd() * w, rnd() * h, 6 + rnd() * 22, 0, 7); g.fill(); }
          }
        }
      }),
    };
    function U8() { return `${Math.floor(40 + rnd() * 200)},${Math.floor(40 + rnd() * 200)},${Math.floor(40 + rnd() * 200)}`; }
  }


  // ---------------------------------------------------------------- the view out of a window
  // A night street behind the glass, faked in the shader. The view ray from the camera is traced from the
  // glass: first the ground outside (level with the floor), then a near layer 7 m out (trees, a fence,
  // streetlamps), then a city skyline and sky at infinity. Everything shifts with parallax as you move.
  function outsideMaterial(rnd, drop = 0) {
    const mk = (w, h, draw) => { const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h); const t = new THREE.CanvasTexture(c); t.wrapS = THREE.RepeatWrapping; t.anisotropy = 4; return t; };
    // sky + skyline panorama; the horizon sits at 62% down the canvas
    const sky = mk(2048, 512, (g, w, h) => {
      const hz = Math.round(h * 0.62);
      const gr = g.createLinearGradient(0, 0, 0, hz);
      gr.addColorStop(0, '#04070f'); gr.addColorStop(0.7, '#0e1626'); gr.addColorStop(1, '#3a2c26');
      g.fillStyle = gr; g.fillRect(0, 0, w, hz);
      g.fillStyle = '#07080a'; g.fillRect(0, hz, w, h - hz);
      for (let i = 0; i < 500; i++) { g.fillStyle = `rgba(255,255,255,${0.2 + rnd() * 0.7})`; g.fillRect(rnd() * w, rnd() * hz * 0.75, rnd() < 0.1 ? 2 : 1, 1); }
      const mx = 300 + rnd() * 1400, my = 70 + rnd() * 60;
      const mg = g.createRadialGradient(mx, my, 0, mx, my, 60); mg.addColorStop(0, 'rgba(220,225,240,0.35)'); mg.addColorStop(1, 'rgba(220,225,240,0)');
      g.fillStyle = mg; g.fillRect(mx - 60, my - 60, 120, 120);
      g.fillStyle = '#e8ecf4'; g.beginPath(); g.arc(mx, my, 13, 0, 7); g.fill();
      // skyline: far, then nearer and taller, with lit windows and aircraft-warning lights
      for (const [col, minH, maxH, lit] of [['#0d121c', 15, 55, 0.05], ['#090c13', 25, 120, 0.22], ['#06080c', 10, 60, 0.3]]) {
        let x = -20;
        while (x < w) {
          const bw = 20 + rnd() * 70, bh = minH + rnd() * (maxH - minH);
          g.fillStyle = col; g.fillRect(x, hz - bh, bw, bh + 2);
          for (let wy = hz - bh + 4; wy < hz - 3; wy += 6) for (let wx = x + 3; wx < x + bw - 3; wx += 5) {
            if (rnd() < lit) { g.fillStyle = rnd() < 0.7 ? `rgba(255,${190 + rnd() * 50},${110 + rnd() * 60},${0.5 + rnd() * 0.5})` : 'rgba(170,200,255,0.7)'; g.fillRect(wx, wy, 2, 3); }
          }
          if (bh > 90 && rnd() < 0.5) { g.fillStyle = '#ff3020'; g.fillRect(x + bw / 2, hz - bh - 3, 2, 2); }
          x += bw + rnd() * 6;
        }
      }
    });
    // near layer, 24 m wide x 8 m tall, repeating along the street
    const near = mk(1024, 256, (g, w, h) => {
      g.clearRect(0, 0, w, h);
      const px = w / 24, py = h / 8, Y = (m) => h - m * py;
      for (const ux of [6, 18]) { // streetlamps, glow first
        const lx = ux * px, ly = Y(5);
        const gl = g.createRadialGradient(lx, ly, 0, lx, ly, 70); gl.addColorStop(0, 'rgba(255,200,120,0.55)'); gl.addColorStop(1, 'rgba(255,200,120,0)');
        g.fillStyle = gl; g.fillRect(lx - 70, ly - 70, 140, 140);
      }
      for (const ux of [2.5, 11.5, 21]) { // a few street trees between the lamps
        if (rnd() < 0.25) continue;
        const tx = (ux + (rnd() - 0.5) * 2) * px, th = 3.6 + rnd() * 2;
        g.fillStyle = '#0a0806'; g.fillRect(tx - 3, Y(th * 0.45), 6, th * 0.45 * py);
        for (let k = 0; k < 7; k++) {
          const r = (0.6 + rnd() * 0.7) * px;
          g.fillStyle = ['#05070a', '#070a0c', '#090c0e'][k % 3];
          g.beginPath(); g.ellipse(tx + (rnd() - 0.5) * 1.6 * px, Y(th * (0.6 + rnd() * 0.35)), r, r * 0.85, 0, 0, 7); g.fill();
        }
      }
      for (const ux of [6, 18]) { // lamp posts and heads
        const lx = ux * px;
        g.fillStyle = '#0c0c0e'; g.fillRect(lx - 2, Y(5), 4, 5 * py); g.fillRect(lx - 2, Y(5.05), 22, 5);
        g.fillStyle = '#ffe2b0'; g.fillRect(lx + 10, Y(4.95), 12, 4);
      }
      g.fillStyle = '#0b0b0c'; // fence
      for (let x = 0; x < w; x += 2 * px) g.fillRect(x, Y(1.3), 4, 1.3 * py);
      g.fillRect(0, Y(1.15), w, 4); g.fillRect(0, Y(0.5), w, 4);
      for (let i = 0; i < 12; i++) { g.fillStyle = '#070b08'; g.beginPath(); g.ellipse(rnd() * w, h, (0.6 + rnd()) * px, (0.5 + rnd() * 0.5) * py, 0, Math.PI, 0); g.fill(); } // hedges
    });
    return new THREE.ShaderMaterial({
      uniforms: { sky: { value: sky }, near: { value: near }, drop: { value: drop } },
      vertexShader: `
        varying vec3 vW; varying vec3 vN;
        void main() { vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; vN = normalize(mat3(modelMatrix) * normal); gl_Position = projectionMatrix * viewMatrix * w; }`,
      fragmentShader: `
        uniform sampler2D sky; uniform sampler2D near; uniform float drop;
        varying vec3 vW; varying vec3 vN;
        float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        // a tower block across the road (high up): concrete, a grid of windows, some lit
        vec3 facade(vec3 h, vec3 r) {
          vec2 c = vec2(dot(h, r) / 2.6, h.y / 3.1), f = fract(c), id = floor(c);
          float win = step(0.18, f.x) * step(f.x, 0.82) * step(0.22, f.y) * step(f.y, 0.78);
          float lit = step(0.62, hash(id)), warm = hash(id + 7.0);
          vec3 wall = vec3(0.035, 0.036, 0.04), dark = vec3(0.02, 0.028, 0.04);
          vec3 light = mix(vec3(1.0, 0.78, 0.5), vec3(0.7, 0.8, 1.0), step(0.8, warm)) * (0.45 + 0.3 * hash(id + 3.0));
          return mix(wall, mix(dark, light, lit), win);
        }
        vec3 ground(vec3 g, vec3 o, vec3 r, float t) {
          // dark grass and pavement, lit in pools under the streetlamps (every 12 m, 7 m out)
          float u = dot(g, r), s = dot(g - vW, o);
          float lu = (fract(u / 12.0 - 0.5) - 0.5) * 12.0;
          float pool = exp(-(lu * lu) / 10.0 - (s - 7.0) * (s - 7.0) / 6.0);
          vec3 c = vec3(0.018, 0.022, 0.02) + vec3(0.32, 0.22, 0.12) * pool;
          return mix(c, vec3(0.03, 0.035, 0.05), smoothstep(12.0, 70.0, t));
        }
        void main() {
          vec3 d = normalize(vW - cameraPosition), o = -vN, r = normalize(cross(vec3(0.0, 1.0, 0.0), o));
          float dn = max(dot(d, o), 0.02);
          float tN = 7.0 / dn;
          float tG = d.y < -0.001 ? (-drop - vW.y) / d.y : 1e9; // the ground: level with the floor, or far below
          vec3 col;
          if (drop > 0.5) { // high up: the tower across the road, else the street below, else the sky and skyline
            float tF = 38.0 / dn; vec3 hf = vW + d * tF;
            if (tF < tG && hf.y > -drop && hf.y < 4.0 + 6.0 * step(0.5, fract(dot(hf, r) / 60.0))) col = facade(hf, r); // (two blocks, one taller)
            else if (tG < 1e8) col = ground(vW + d * tG, o, r, tG) * 1.6;
            else col = texture2D(sky, vec2(atan(d.x, d.z) / 6.2831853 * 3.0, clamp(0.38 + asin(clamp(d.y, -1.0, 1.0)) / 1.4, 0.0, 0.999))).rgb;
          } else if (tG < tN) col = ground(vW + d * tG, o, r, tG);
          else {
            vec3 h = vW + d * tN;
            vec2 uv = vec2(dot(h, r) / 24.0, h.y / 8.0);
            vec4 nr = (uv.y >= 0.0 && uv.y <= 1.0) ? texture2D(near, uv) : vec4(0.0);
            vec3 far = d.y < -0.001 ? ground(vW + d * tG, o, r, tG)
              : texture2D(sky, vec2(atan(d.x, d.z) / 6.2831853 * 3.0, clamp(0.38 + asin(clamp(d.y, -1.0, 1.0)) / 1.4, 0.0, 0.999))).rgb;
            col = mix(far, nr.rgb, nr.a);
          }
          // a little sheen on the glass
          float fres = pow(1.0 - abs(dot(d, vN)), 3.0);
          gl_FragColor = vec4(col * 0.9 + vec3(0.02, 0.025, 0.035) + fres * 0.06, 1.0);
        }`,
    });
  }

  function build(map, root, crateTex) {
    const T = THREE, L = G.Level, TS = L.TS, { W, t } = map;
    const rnd = G.U.rng((map.seed ^ 0x5eed1e) >>> 0);
    const cache = new Map();
    const mat = (hex, rough = 0.8, metal = 0, extra) => {
      const key = hex + '|' + rough + '|' + metal + (extra ? JSON.stringify(Object.keys(extra)) + (extra.map ? extra.map.uuid : '') + (extra.emissive || '') : '');
      let m = cache.get(key);
      if (!m) { m = new T.MeshStandardMaterial(Object.assign({ color: hex, roughness: rough, metalness: metal }, extra || {})); cache.set(key, m); }
      return m;
    };
    const tint = (hex, f) => { const c = new T.Color(hex); c.r = Math.min(1, c.r * f); c.g = Math.min(1, c.g * f); c.b = Math.min(1, c.b * f); return c.getHex(); };
    const pick = (a) => a[Math.floor(rnd() * a.length)];
    // everything static is merged into one mesh per material
    const byMat = new Map();
    const add = (geo, m, matrix) => {
      const g2 = geo.index ? geo.toNonIndexed() : geo;
      g2.applyMatrix4(matrix);
      if (!byMat.has(m)) byMat.set(m, []);
      byMat.get(m).push(g2);
      if (g2 !== geo) geo.dispose();
    };
    const tmp = new T.Object3D(); tmp.rotation.order = 'YXZ'; // turn to face the room first, then tilt
    let frame = new T.Matrix4();
    const place = (geo, m, x, y, z, ry = 0, rx = 0) => {
      tmp.position.set(x, y, z); tmp.rotation.set(rx, ry, 0); tmp.updateMatrix();
      add(geo, m, new T.Matrix4().multiplyMatrices(frame, tmp.matrix));
    };
    const shadeMat = mat(0xf2e2c0, 0.9, 0, { emissive: 0xffc070, emissiveIntensity: 0.55 });
    const k = {
      rnd, pick, tint, mat,
      box: (m, w, h, d, x, y, z, ry, rx) => place(new T.BoxGeometry(w, h, d), m, x, y, z, ry, rx),
      cyl: (m, rt, rb, h, x, y, z, seg = 14, rx = 0) => place(new T.CylinderGeometry(rt, rb, h, seg), m, x, y, z, 0, rx),
      sph: (m, r, x, y, z) => place(new T.SphereGeometry(r, 8, 6), m, x, y, z),
      ico: (m, r, x, y, z) => place(new T.IcosahedronGeometry(r, 0), m, x, y, z, rnd() * 6),
      leaf: () => mat(pick([0x3f6b35, 0x4d7a3a, 0x2f5a2c, 0x5a8040]), 0.85, 0, { flatShading: true }),
      screen: () => mat(0x0b0f14, 0.15, 0.2, { emissive: pick([0x1a2a3a, 0x0c1622, 0x202a20]), emissiveIntensity: 0.6 }),
      shade: () => shadeMat,
      crate: () => mat(0xffffff, 0.8, 0, { map: crateTex }),
      tableLamp(x, y, z) { k.cyl(mat(pick([0x2a2a2a, 0xb8a060, 0xe8e4da, 0x6d7b66]), 0.4, 0.3), 0.05, 0.08, 0.22, x, y + 0.11, z); k.cyl(shadeMat, 0.1, 0.16, 0.2, x, y + 0.31, z); },
      plantSmall(x, y, z) { k.cyl(mat(pick([0xa0522d, 0xe8e4da, 0x2f3a40]), 0.7), 0.07, 0.055, 0.12, x, y + 0.06, z); for (let i = 0; i < 3; i++) k.ico(k.leaf(), 0.06 + rnd() * 0.04, x + (rnd() - 0.5) * 0.06, y + 0.16 + rnd() * 0.08, z + (rnd() - 0.5) * 0.06); },
      fruit(x, y, z) { k.cyl(mat(pick([0xe8e4da, 0x6b4428, 0x3a5a6a]), 0.4), 0.13, 0.08, 0.06, x, y + 0.03, z); for (let i = 0; i < 4; i++) k.sph(mat(pick([0xd8642a, 0xc0302a, 0x8fb040, 0xe8c040]), 0.5), 0.04, x + (rnd() - 0.5) * 0.12, y + 0.08, z + (rnd() - 0.5) * 0.12); },
    };

    // furniture
    for (const p of map.propList || new Set(map.props.values())) {
      frame = new T.Matrix4().compose(new T.Vector3(p.x, 0, p.z), new T.Quaternion().setFromAxisAngle(new T.Vector3(0, 1, 0), p.q * Math.PI / 2), new T.Vector3(1, 1, 1));
      R[p.name].build(k, p.v);
    }
    frame = new T.Matrix4();

    // rooms: floor covering, rug, baseboards, art and windows on the walls
    const tx = textures(rnd), inRoom = (rm, x, z) => x >= rm.x && x < rm.x + rm.w && z >= rm.z && z < rm.z + rm.h;
    const arts = [0, 1, 2, 3, 4, 5].map(() => mat(0xffffff, 0.7, 0, { map: tx.art() }));
    const board = mat(map.theme.home >= 1 ? 0xe8e4da : 0x2a2826, 0.6);
    const frameMats = [mat(0x1c1c1e, 0.5), mat(0xb8a060, 0.35, 0.7), mat(0x6b4428, 0.6), mat(0xe8e4da, 0.6)];
    const glass = outsideMaterial(rnd), blind = mat(0xd8d4ca, 0.7), sill = mat(0xe8e4da, 0.5);
    // a wall facing the outside of the building: solid wall from here to the edge of the map, and not
    // impossibly thick; windows only go there
    const exterior = (x, z, dx, dz) => {
      let n = 0;
      for (let cx = x + dx, cz = z + dz; cx >= 0 && cz >= 0 && cx < map.W && cz < map.H; cx += dx, cz += dz) {
        if (t[cz * W + cx] !== 1 || ++n > 4 * (G.Level.K || 1)) return false;
      }
      return true;
    };
    // a wall face wide enough to hang something on: this cell and its neighbours either side along the wall
    // all face the same wall, and nothing's been hung there yet
    const hung = new Set();
    const wide = (x, z, dx, dz) => {
      const ax = dz ? 1 : 0, az = dx ? 1 : 0;
      for (const s of [-1, 0, 1]) {
        const xx = x + ax * s, zz = z + az * s;
        if (t[zz * W + xx] !== 0 || L.tile(map, xx + dx, zz + dz) !== 1 || hung.has(zz * W + xx)) return false;
        if (map.winAt && [-1, 0, 1].some((k) => map.winAt.has((zz + dz + az * k) * W + xx + dx + ax * k))) return false; // (not over a window)
      }
      for (const s of [-1, 0, 1]) hung.add((z + az * s) * W + x + ax * s);
      return true;
    };
    for (const rm of map.rooms) {
      const spec = ROOMS[rm.type] || {};
      const x0 = rm.x * TS, z0 = rm.z * TS, w = rm.w * TS, d = rm.h * TS;
      if (spec.floor) {
        let tex;
        if (spec.floor === 'wood') tex = tx.wood(pick(['#7a5232', '#9a6e44', '#5e4028', '#a88458']));
        else if (spec.floor === 'grass') tex = tx.grass();
        else if (spec.floor === 'pave') tex = tx.tile(pick(['#55524c', '#4a4844', '#5e5a52']), '#34322e');
        else if (spec.floor === 'tile') tex = tx.tile(pick(['#d8d4cc', '#b8c0c4', '#e4dccc', '#3a3d40']), '#7a7670');
        else tex = tx.carpet(pick(['#5a5f6a', '#6a5a4a', '#4a5a52', '#7a6e62', '#3d4452']));
        tex.repeat.set(rm.w, rm.h);
        if (spec.floor === 'wood' && rnd() < 0.5) { tex.rotation = Math.PI / 2; }
        const fm = mat(0xffffff, spec.floor === 'tile' ? 0.45 : spec.floor === 'grass' ? 1 : 0.85, 0, { map: tex });
        // a lawn runs under the fences to the edge; inside, the floor stops at the walls
        if (rm.out) place(new T.PlaneGeometry(w + 2 * TS, d + TS), fm, x0 + w / 2, 0.004, z0 + d / 2, 0, -Math.PI / 2);
        else place(new T.PlaneGeometry(w, d), fm, x0 + w / 2, 0.004, z0 + d / 2, 0, -Math.PI / 2);
      }
      if (rm.out) continue; // no rugs, skirting, pictures or windows out in the garden
      if (spec.rug && rnd() < spec.rug && rm.w >= 3 && rm.h >= 3) {
        const rw = Math.min(3.6, w - 2.4), rd = Math.min(2.6, d - 2.4);
        const rt = tx.rug(pick(['#7a2e2e', '#2e4a6a', '#5a4a3a', '#3a5a4a', '#6a5a7a']), pick(['#d8c8a0', '#c0a060', '#e8e0d0']), pick(['#2a2a2a', '#5a2a1a', '#1a2a3a']));
        place(new T.PlaneGeometry(rw, rd), mat(0xffffff, 1, 0, { map: rt }), x0 + w / 2, 0.008, z0 + d / 2, rnd() < 0.5 ? 0 : Math.PI / 2, -Math.PI / 2);
      }
      let pics = 0, wins = 0, clock = rm.type === 'kitchen' || rm.type === 'office' || rm.type === 'breakroom';
      for (let z = rm.z; z < rm.z + rm.h; z++) for (let x = rm.x; x < rm.x + rm.w; x++) {
        if (t[z * W + x] === 1) continue; // a wall corner inside the room's rectangle
        for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nx = x + dx, nz = z + dz;
          if (inRoom(rm, nx, nz) || L.tile(map, nx, nz) !== 1) continue;
          const cx = (x + 0.5) * TS + dx * (TS / 2 - 0.01), cz = (z + 0.5) * TS + dz * (TS / 2 - 0.01), ry = Math.atan2(-dx, -dz);
          // baseboard along this wall face
          place(new T.BoxGeometry(TS, 0.1, 0.02), board, cx - dx * 0.01, 0.05, cz - dz * 0.01, ry);
          const p = map.props.get(z * W + x), tall = p && p.boxes[0].h > 1.0 && !(R[p.name] && R[p.name].small);
          if (tall) continue;
          const v = rnd() * 3;
          if (v > 0.65 || !wide(x, z, dx, dz)) continue;
          // under a window there can only be something low (a sofa, a plant in the corner)
          const clear = !p || p.name === 'sofa' || (R[p.name] && R[p.name].small);
          if (false && clear && wins < 2 && v < 0.4 && exterior(x, z, dx, dz)) {
            wins++;
            place(new T.BoxGeometry(1.2, 1.32, 0.04), sill, cx, 1.6, cz, ry);
            place(new T.PlaneGeometry(1.08, 1.2), glass, cx - dx * 0.022, 1.6, cz - dz * 0.022, ry);
            place(new T.BoxGeometry(0.04, 1.2, 0.03), sill, cx - dx * 0.03, 1.6, cz - dz * 0.03, ry); // mullion
            const open = rnd() < 0.3 ? 0 : 0.15 + rnd() * 0.5; // blinds up, or part-way down
            for (let s = 0; s < 14 * open; s++) place(new T.BoxGeometry(1.1, 0.012, 0.05), blind, cx - dx * 0.06, 2.15 - s * 0.042, cz - dz * 0.06, ry, 0.35);
            place(new T.BoxGeometry(1.3, 0.04, 0.12), sill, cx - dx * 0.05, 0.98, cz - dz * 0.05, ry);
          } else if (pics < 3 && v < 0.5) {
            pics++;
            const fw = 0.5 + rnd() * 0.5, fh = fw * 0.75, y = p ? 1.7 : 1.55;
            place(new T.BoxGeometry(fw + 0.06, fh + 0.06, 0.03), pick(frameMats), cx - dx * 0.015, y, cz - dz * 0.015, ry);
            place(new T.PlaneGeometry(fw, fh), pick(arts), cx - dx * 0.032, y, cz - dz * 0.032, ry);
          } else if (clock && v < 0.65) {
            clock = false;
            place(new T.CylinderGeometry(0.16, 0.16, 0.04, 20), mat(0x1c1c1e, 0.5), cx - dx * 0.02, 2.35, cz - dz * 0.02, ry, Math.PI / 2);
            place(new T.CylinderGeometry(0.14, 0.14, 0.01, 20), mat(0xf2efe6, 0.6), cx - dx * 0.042, 2.35, cz - dz * 0.042, ry, Math.PI / 2);
            place(new T.BoxGeometry(0.012, 0.1, 0.004), mat(0x111111, 0.5), cx - dx * 0.05, 2.38, cz - dz * 0.05, ry);
            place(new T.BoxGeometry(0.075, 0.012, 0.004), mat(0x111111, 0.5), cx - dx * 0.05, 2.35, cz - dz * 0.05, ry);
          }
        }
      }
    }

    // merge
    for (const [m, geos] of byMat) {
      let n = 0; for (const g of geos) n += g.attributes.position.count;
      const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), uv = new Float32Array(n * 2);
      let o = 0;
      for (const g of geos) {
        pos.set(g.attributes.position.array, o * 3); nor.set(g.attributes.normal.array, o * 3);
        if (g.attributes.uv) uv.set(g.attributes.uv.array, o * 2);
        o += g.attributes.position.count; g.dispose();
      }
      const bg = new T.BufferGeometry();
      bg.setAttribute('position', new T.BufferAttribute(pos, 3));
      bg.setAttribute('normal', new T.BufferAttribute(nor, 3));
      bg.setAttribute('uv', new T.BufferAttribute(uv, 2));
      bg.computeBoundingSphere();
      root.add(new T.Mesh(bg, m));
    }
  }

  return { plan, build, R, ROOMS, worldBoxes, outsideMaterial };
})();
