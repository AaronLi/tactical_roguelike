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
  // A convenience store's shelving: a low gondola, shelves both sides of a pegboard back (1.45 m: you see over it
  // standing, not crouched), stocked with packets, tins and bottles
  R.gondola = { w: 1.9, d: 0.9, cover: 1, boxes: [[0, 0, 1.9, 0.86, 1.45]], build(k) {
    const frame = k.mat(k.pick([0xd8dcdc, 0x2f3a46, 0xb8463a]), 0.5, 0.3), shelf = k.mat(0xe8eaea, 0.4, 0.2);
    k.box(frame, 1.9, 0.12, 0.86, 0, 0.06, 0);
    k.box(frame, 1.9, 1.45, 0.05, 0, 0.725, 0);
    for (const y of [0.42, 0.78, 1.14]) k.box(shelf, 1.88, 0.025, 0.84, 0, y, 0);
    for (const sd of [-1, 1]) for (const y of [0.12, 0.42, 0.78, 1.14]) for (let x = -0.86; x < 0.86; x += 0.16 + k.rnd() * 0.08) {
      if (k.rnd() < 0.15) continue; // (gaps where it's sold)
      const h = 0.1 + k.rnd() * 0.18, w = 0.1 + k.rnd() * 0.06;
      k.box(k.mat(k.pick(ACCENT.concat(CARD)), 0.6), w, h, 0.26, x + w / 2, y + 0.012 + h / 2, sd * 0.25);
    }
  } };
  // The cashier's counter: a till, a card reader and a screen on it, a cigarette shelf behind
  R.register = { w: 1.98, d: 0.64, cover: 1, boxes: [[0, 0, 1.98, 0.64, 0.92]], build(k) {
    const cab = k.mat(0x3a3f45, 0.6), top = k.mat(0xd8d4cc, 0.35), dark = k.mat(0x16181a, 0.6), screen = k.mat(0x1a2a3a, 0.2, 0, { emissive: 0x2a4a6a });
    k.box(cab, 1.96, 0.88, 0.58, 0, 0.44, -0.02);
    k.box(top, 1.98, 0.04, 0.64, 0, 0.9, 0);
    k.box(dark, 0.42, 0.12, 0.38, -0.4, 0.98, 0.02); // the till
    k.box(dark, 0.36, 0.24, 0.03, -0.4, 1.16, -0.12); k.box(screen, 0.32, 0.2, 0.005, -0.4, 1.16, -0.103);
    k.box(dark, 0.09, 0.03, 0.15, 0.25, 0.935, 0.18); // the card reader
    k.box(k.mat(0xe8e2d0, 0.7), 0.5, 0.18, 0.3, 0.55, 1.01, -0.05); // a stack of papers and gum
  } };
  // Stock on a shelf, the way a corner store packs it: faced up to the edge, one thing after another along it (boxes,
  // bottles, cans, bags), a price strip on the shelf's edge. (x0..x1 along the shelf at height y, its front edge at z
  // facing dir (+1 or -1), d deep, up to h tall; under: a shelf over it, its shadow on the stock.)
  function shelfStock(k, x0, x1, y, z, dir, d, h, under) {
    k.box(k.mat(k.pick([0xf2efe6, 0xf5d020, 0xe8eef2]), 0.5), x1 - x0, 0.035, 0.012, (x0 + x1) / 2, y + 0.005, z + dir * 0.006); // the price strip
    for (let x = x0 + 0.01; x < x1 - 0.06;) {
      const kind = k.rnd(), lb = k.label(), n = 2 + Math.floor(k.rnd() * 3); // (a facing: a few of the same, side by side)
      const m = k.pack(kind < 0.35 || kind >= 0.8 ? 'card' : kind < 0.6 ? 'bottle' : 'tin', under ? 0.72 : 1), ry = dir < 0 ? Math.PI : 0; // (the label to the aisle)
      for (let j = 0; j < n && x < x1 - 0.06; j++) {
        if (kind < 0.35) { const w = 0.08 + k.rnd() * 0.05, hh = Math.min(h, 0.18 + k.rnd() * 0.14); k.boxL(m, lb, w, hh, d * 0.9, x + w / 2, y + hh / 2 + 0.02, z - dir * d * 0.47, ry); x += w + 0.008; } // boxes
        else if (kind < 0.6) { const r = 0.035 + k.rnd() * 0.012, hh = Math.min(h, 0.2 + k.rnd() * 0.12); for (const zz of [0.25, 0.6]) k.cylL(m, lb, r * 0.5, r, hh, x + r, y + hh / 2 + 0.02, z - dir * d * zz, 8); x += 2 * r + 0.01; } // bottles
        else if (kind < 0.8) { const r = 0.035, hh = Math.min(h, 0.12); for (const zz of [0.2, 0.5, 0.8]) k.cylL(m, lb, r, r, hh, x + r, y + hh / 2 + 0.02, z - dir * d * zz, 8); x += 2 * r + 0.006; } // cans
        else { const w = 0.14 + k.rnd() * 0.06, hh = Math.min(h, 0.2 + k.rnd() * 0.08); k.boxL(m, lb, w, hh, d * 0.6, x + w / 2, y + hh / 2 + 0.02, z - dir * d * 0.35, ry, 0.12); x += w + 0.01; } // bags, leaning (back, against the shelf: turned with the label)
      }
      x += 0.01;
    }
  }
  // A two-sided aisle of shelving (gondola), 2.6 m long, 1.6 m tall: a pegboard spine, four shelves each side packed with
  // stock, a sign along the top.
  R.aisle = { w: 2.6, d: 1.2, cover: 1, boxes: [[0, 0, 2.6, 1.15, 1.6]], build(k) {
    const frame = k.mat(k.pick([0xe8eaea, 0xd8dcdc, 0x3a4048]), 0.5, 0.3), shelf = k.mat(0xdfe2e2, 0.4, 0.3);
    k.box(frame, 2.6, 1.6, 0.06, 0, 0.8, 0); k.box(frame, 2.6, 0.12, 1.15, 0, 0.06, 0);
    for (const x of [-1.29, 1.29]) k.box(frame, 0.03, 1.6, 1.15, x, 0.8, 0);
    for (const sd of [-1, 1]) for (const y of [0.12, 0.5, 0.88, 1.26]) {
      if (y > 0.12) k.box(shelf, 2.56, 0.025, 0.52, 0, y, sd * 0.31);
      shelfStock(k, -1.27, 1.27, y + 0.012, sd * 0.57, sd, 0.5, 0.34, y < 1.2);
    }
    k.box(k.mat(k.pick([0xd83a2a, 0x2a6ad8, 0x2ab04a, 0xf07a1a]), 0.5), 1.2, 0.22, 0.04, 0, 1.75, 0); // the aisle sign
  } };
  // Shelving against a wall, floor to well over your head: five shelves of stock, a sign along the top.
  R.shopwall = { w: 1.98, d: 0.5, boxes: [[0, 0, 1.98, 0.5, 2.0]], build(k) {
    const frame = k.mat(k.pick([0xe8eaea, 0x3a4048]), 0.5, 0.3), shelf = k.mat(0xdfe2e2, 0.4, 0.3);
    k.box(frame, 1.98, 2.0, 0.04, 0, 1.0, -0.23); k.box(frame, 1.98, 0.12, 0.48, 0, 0.06, 0);
    for (const y of [0.12, 0.48, 0.84, 1.2, 1.56]) { if (y > 0.12) k.box(shelf, 1.96, 0.025, 0.46, 0, y, 0); shelfStock(k, -0.97, 0.97, y + 0.012, 0.24, 1, 0.44, 0.32, y < 1.5); }
    k.box(k.mat(k.pick([0xd83a2a, 0x2a6ad8, 0xf0c020]), 0.5), 1.98, 0.25, 0.03, 0, 2.1, -0.2);
  } };
  // An endcap: a low display at the end of an aisle, cases of soda stacked on it and a promotion over them.
  R.endcap = { w: 1.2, d: 0.5, cover: 1, boxes: [[0, 0, 1.2, 0.5, 1.3]], build(k) {
    const frame = k.mat(0xe8eaea, 0.5, 0.3), card = k.pack('card'), c = [k.label(), k.label()];
    k.box(frame, 1.2, 0.12, 0.48, 0, 0.06, 0);
    for (let l = 0; l < 3; l++) for (let i = 0; i < 3; i++) k.boxL(card, c[(l + i) % 2], 0.38, 0.3, 0.44, -0.4 + i * 0.4, 0.27 + l * 0.31, 0);
    k.box(k.mat(0xf5d020, 0.5), 0.6, 0.35, 0.02, 0, 1.25, -0.2); k.box(k.mat(0xd83a2a, 0.5), 0.5, 0.12, 0.022, 0, 1.25, -0.2);
  } };
  // The cigarettes behind the till: a wall cabinet of packs in rows, a lit sign over it.
  R.tobacco = { w: 1.98, d: 0.45, boxes: [[0, 0, 1.98, 0.45, 2.2]], build(k) {
    const body = k.mat(0x2a2c30, 0.5, 0.3), card = k.pack('card'), packs = [0, 1, 2, 3, 4, 5].map(() => k.label());
    k.box(body, 1.98, 2.0, 0.42, 0, 1.0, 0); k.box(k.mat(0xb8bcc0, 0.4, 0.3), 1.98, 0.9, 0.5, 0, 0.45, 0.02);
    for (let r = 0; r < 6; r++) for (let i = 0; i < 16; i++) k.boxL(card, k.pick(packs), 0.09, 0.13, 0.02, -0.88 + i * 0.117, 1.0 + r * 0.16, 0.215);
    k.box(k.mat(0xffffff, 0.5, 0, { emissive: 0xd83a2a, emissiveIntensity: 0.9 }), 1.6, 0.18, 0.03, 0, 2.08, 0.2);
  } };
  R.atm = { w: 0.65, d: 0.6, cover: 1, boxes: [[0, 0, 0.6, 0.6, 1.6]], build(k) {
    const body = k.mat(0x3a4a5a, 0.5, 0.4), dark = k.mat(0x16181a, 0.5);
    k.box(body, 0.6, 1.25, 0.58, 0, 0.625, 0); k.box(body, 0.6, 0.4, 0.3, 0, 1.4, -0.14, 0, -0.3);
    k.box(k.screen(), 0.3, 0.22, 0.01, 0, 1.38, 0.03, 0, -0.3); k.box(dark, 0.26, 0.04, 0.12, 0, 1.0, 0.33); k.box(k.mat(0x30a040, 0.5, 0, { emissive: 0x208030, emissiveIntensity: 1 }), 0.12, 0.02, 0.005, 0.15, 1.1, 0.292);
  } };
  R.icechest = { w: 1.3, d: 0.75, cover: 1, boxes: [[0, 0, 1.3, 0.75, 1.05]], build(k) {
    const white = k.mat(0xeef2f4, 0.45, 0.2), blue = k.mat(0x2a6ad8, 0.5);
    k.box(white, 1.3, 0.95, 0.75, 0, 0.5, 0); k.box(white, 1.32, 0.08, 0.77, 0, 1.01, 0);
    k.box(blue, 1.0, 0.3, 0.01, 0, 0.6, 0.376); k.box(white, 0.4, 0.12, 0.012, 0, 0.6, 0.38); // ICE, in white on blue
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

  // ---------------------------------------------------------------- festival
  // A stall: a booth open at the back, its counter across the front (cover to crouch behind), side panels, a
  // striped awning and a lit sign. Inside, behind the counter, there's room for someone to hide.
  const STALL = [[0xc0392b, 0xf2efe6], [0x2e86c1, 0xf2efe6], [0x27ae60, 0xf7dc6f], [0x8e44ad, 0xf2efe6], [0xd35400, 0xf9e79f], [0x16a085, 0xf2efe6], [0xe84393, 0xfdf2e9], [0xf1c40f, 0x2c3e50]];
  // hw: half its width (a 2 m stall, or a 4 m one across two tiles)
  function stallShell(k, v, hw) {
    const [c1, c2] = STALL[Math.floor(v * STALL.length) % STALL.length], W2 = hw * 2;
    const frame = k.mat(0x2a2a2c, 0.6, 0.4), A = k.mat(c1, 0.8), B = k.mat(c2, 0.8), top = k.mat(k.pick([0xd8d4cc, 0x8a5a34, 0x3a3d40]), 0.45);
    for (const x of [-hw, hw]) for (const z of [-0.85, 0.85]) k.box(frame, 0.05, 2.45, 0.05, x, 1.225, z);
    k.box(k.mat(k.pick(WOOD), 0.7), W2, 0.98, 0.32, 0, 0.49, 0.72); // the counter
    k.box(A, W2 + 0.04, 0.72, 0.02, 0, 0.47, 0.89);
    for (let i = 0; i < 4; i++) k.box(B, W2 + 0.04, 0.05, 0.022, 0, 0.18 + i * 0.17, 0.892); // stripes down its front
    k.box(top, W2 + 0.06, 0.05, 0.4, 0, 1.03, 0.72);
    for (const x of [-hw, hw]) k.box(B, 0.03, 2.2, 1.0, x, 1.1, 0.4); // side panels, the front half
    k.box(A, W2 + 0.16, 0.06, 1.9, 0, 2.46, 0); // the roof
    const n = Math.round((W2 + 0.04) / 0.25), sw = (W2 + 0.04) / n;
    for (let i = 0; i < n; i++) k.box(i % 2 ? A : B, sw, 0.025, 0.6, -hw - 0.02 + sw * (i + 0.5), 2.32, 1.1, 0, 0.45); // the awning
    for (let i = 0; i < n; i++) k.box(i % 2 ? A : B, sw, 0.14, 0.02, -hw - 0.02 + sw * (i + 0.5), 2.12, 1.36); // its edge
    // the sign over the front, lit
    k.box(k.mat(0x111111, 0.5), Math.min(W2 - 0.2, 3.0), 0.4, 0.04, 0, 2.72, 0.9);
    k.box(k.mat(c2, 0.5, 0, { emissive: c2, emissiveIntensity: 0.7 }), Math.min(W2 - 0.3, 2.9), 0.3, 0.01, 0, 2.72, 0.925);
    k.box(k.mat(c1, 0.5, 0, { emissive: c1, emissiveIntensity: 0.9 }), Math.min(W2 - 0.8, 2.0), 0.08, 0.012, 0, 2.72, 0.93);
    // a string of little bulbs under the awning
    const glow = k.mat(0xfff0c8, 0.5, 0, { emissive: 0xffd890, emissiveIntensity: 1.6 }), nb = Math.round(W2 / 0.22);
    for (let i = 0; i <= nb; i++) k.sph(glow, 0.03, -hw + 0.04 + i * (W2 - 0.08) / nb, 2.0 + Math.sin(i * 0.7) * 0.02, 1.32);
    return { A, B, c1, c2 };
  }
  // left as they ran: a stool on its side, cups and a bag on the ground out front
  function abandoned(k, hw) {
    if (k.rnd() < 0.55) k.box(k.mat(k.pick([0xc0392b, 0x2a2a2a, 0xe8e4da]), 0.6), 0.34, 0.04, 0.34, (k.rnd() - 0.5) * hw * 1.3, 0.17, 1.25, k.rnd() * 3, Math.PI / 2);
    for (let i = 0; i < 2 + hw * 1.5; i++) if (k.rnd() < 0.6) k.cyl(k.mat(k.pick([0xf2efe6, 0xc0392b, 0x2e86c1]), 0.6), 0.04, 0.035, 0.12, (k.rnd() - 0.5) * hw * 1.7, 0.04, 1.1 + k.rnd() * 0.5, 8, Math.PI / 2);
    if (k.rnd() < 0.35) k.box(k.mat(k.pick([0x6b4428, 0x2a2a2a, 0x8e44ad]), 0.8), 0.32, 0.22, 0.12, (k.rnd() - 0.5) * hw * 1.5, 0.11, 1.5, k.rnd() * 3);
  }
  // A food stall: the grill (or fryer) at the back, a cooler, food on the counter, the menu board. Open at the back.
  const stallFood = (hw) => ({ w: hw * 2 + 0.14, d: 1.8, cover: 1, boxes: [[0, 0.72, hw * 2 + 0.06, 0.36, 1.06], [-hw, 0.4, 0.06, 1.0, 2.3], [hw, 0.4, 0.06, 1.0, 2.3], [-hw + 0.37, -0.6, 0.7, 0.45, 0.92]], build(k, v) {
    const { c2 } = stallShell(k, v, hw), steel = k.mat(0x9a9ea2, 0.35, 0.7), black = k.mat(0x1c1c1e, 0.5, 0.4), gx = -hw + 0.37;
    k.box(steel, 0.7, 0.88, 0.45, gx, 0.44, -0.6);
    k.box(black, 0.66, 0.03, 0.41, gx, 0.9, -0.6);
    for (let i = 0; i < 4; i++) k.cyl(k.mat(0x4a2a18, 0.8), 0.06, 0.06, 0.02, gx - 0.17 + (i % 2) * 0.3, 0.92, -0.68 + (i >> 1) * 0.18);
    if (k.rnd() < 0.6) k.box(k.mat(0x2e86c1, 0.4), 0.5, 0.45, 0.35, hw - 0.37, 0.225, -0.55);
    const items = [0xc0392b, 0xf1c40f, 0xf2efe6, 0x8a5a34, 0x27ae60];
    for (let i = 0; i < 6 * hw; i++) {
      const x = -hw + 0.12 + k.rnd() * (hw * 2 - 0.24);
      if (k.rnd() < 0.5) k.cyl(k.mat(k.pick(items), 0.5), 0.035, 0.03, 0.16, x, 1.14, 0.68); // cups, sauce bottles
      else k.box(k.mat(k.pick([0xf2efe6, 0xd35400, 0xe8c040]), 0.7), 0.14, 0.06, 0.12, x, 1.09, 0.7, k.rnd()); // boxes of food
    }
    k.box(k.mat(0x1c1c1e, 0.6), 0.5, 0.36, 0.02, hw - 0.42, 1.6, -0.84); // a menu board on the back
    for (const [w, y] of [[0.44, 1.7], [0.36, 1.6], [0.4, 1.52]]) k.box(k.mat(c2, 0.8), w, 0.025, 0.005, hw - 0.42, y, -0.828);
    abandoned(k, hw);
  } });
  // A merchandise stall: folded shirts and caps on the counter, a rail of shirts at the back, posters on the panels.
  const stallMerch = (hw) => ({ w: hw * 2 + 0.14, d: 1.8, cover: 1, boxes: [[0, 0.72, hw * 2 + 0.06, 0.36, 1.06], [-hw, 0.4, 0.06, 1.0, 2.3], [hw, 0.4, 0.06, 1.0, 2.3], [hw - 0.37, -0.62, 0.7, 0.4, 1.75]], build(k, v) {
    stallShell(k, v, hw);
    const shirts = [0x1c1c1e, 0xf2efe6, 0xc0392b, 0x2e86c1, 0x8e44ad, 0x27ae60, 0xf1c40f], piles = Math.round(hw * 5.4);
    for (let i = 0; i < piles; i++) for (let j = 0; j < 1 + Math.floor(k.rnd() * 3); j++) k.box(k.mat(k.pick(shirts), 0.95), 0.26, 0.03, 0.22, -hw + 0.2 + i * (hw * 2 - 0.4) / Math.max(1, piles - 1), 1.07 + j * 0.032, 0.7);
    for (let i = 0; i < 3 * hw; i++) if (k.rnd() < 0.7) k.sph(k.mat(k.pick(shirts), 0.8), 0.07, -hw + 0.3 + k.rnd() * (hw * 2 - 0.6), 1.08, 0.82);
    const rail = k.mat(0x9a9ea2, 0.35, 0.7), rx = hw - 0.37;
    for (const x of [rx - 0.3, rx + 0.3]) k.box(rail, 0.03, 1.7, 0.03, x, 0.85, -0.62);
    k.box(rail, 0.66, 0.03, 0.03, rx, 1.68, -0.62);
    for (let i = 0; i < 6; i++) k.box(k.mat(k.pick(shirts), 0.95), 0.05, 0.6, 0.44, rx - 0.25 + i * 0.1, 1.33, -0.62);
    for (const s of [-1, 1]) for (let i = 0; i < 2; i++) k.box(k.mat(k.pick(shirts), 0.7), 0.01, 0.5, 0.36, s * (hw - 0.02), 1.55, 0.2 + i * 0.4);
    abandoned(k, hw);
  } });
  R.stallfood = stallFood(0.92); R.stallmerch = stallMerch(0.92);
  R.bigfood = stallFood(1.92); R.bigmerch = stallMerch(1.92); // (across two tiles)
  // A row of folding chairs facing the stage (their fronts, +z, toward it).
  R.seats = { w: 1.98, d: 0.7, cover: 1, boxes: [[0, 0, 1.98, 0.6, 0.9]], build(k, v) {
    const p = k.mat([0x2e4a7d, 0x7d2e2e, 0x2a2a2a, 0x2e6b3f, 0x5a5f6a][Math.floor(v * 5)], 0.6), leg = k.mat(0x6a6e72, 0.4, 0.7);
    for (const x of [-0.66, 0, 0.66]) {
      k.box(p, 0.46, 0.04, 0.42, x, 0.46, 0.04);
      k.box(p, 0.46, 0.4, 0.03, x, 0.72, -0.19, 0, -0.08);
      for (const a of [-0.2, 0.2]) { k.box(leg, 0.025, 0.47, 0.025, x + a, 0.235, 0.22, 0, 0.2); k.box(leg, 0.025, 0.9, 0.025, x + a, 0.45, -0.2, 0, -0.1); }
    }
    k.box(leg, 1.9, 0.02, 0.02, 0, 0.12, 0.0); // the rail that ties the row together
  } };
  // The stage: decking 1.2 m up, black skirt to the ground.
  R.stagedeck = { w: 2, d: 2, cover: 1, boxes: [[0, 0, 2, 2, 1.2]], build(k) {
    k.box(k.mat(0x0c0c0e, 0.95), 2.0, 1.14, 2.0, 0, 0.57, 0);
    k.box(k.mat(0x1c1a18, 0.7), 2.0, 0.06, 2.0, 0, 1.17, 0);
    if (k.rnd() < 0.3) k.box(k.mat(0xf2efe6, 0.6), 0.6, 0.004, 0.05, (k.rnd() - 0.5) * 1.2, 1.202, (k.rnd() - 0.5) * 1.2, k.rnd() * 3); // tape marks
    if (k.rnd() < 0.25) k.box(k.mat(0x1c1c1e, 0.5), 0.5, 0.4, 0.4, k.rnd() - 0.5, 1.4, k.rnd() - 0.5, k.rnd()); // a wedge monitor
  } };
  R.speaker = { w: 1.3, d: 1.2, boxes: [[0, 0, 1.3, 1.1, 3.3]], build(k) {
    const box = k.mat(0x151517, 0.8), grille = k.mat(0x2a2a2c, 0.95), cone = k.mat(0x0a0a0b, 0.6);
    for (let i = 0; i < 3; i++) {
      k.box(box, 1.26, 1.04, 1.06, 0, 0.53 + i * 1.08, 0);
      k.box(grille, 1.14, 0.92, 0.02, 0, 0.53 + i * 1.08, 0.535);
      for (const x of [-0.28, 0.28]) k.cyl(cone, 0.22, 0.22, 0.03, x, 0.53 + i * 1.08, 0.55, 18, Math.PI / 2);
    }
  } };
  // Front of house: the sound desk under a little canopy, out among the seats.
  R.foh = { w: 1.9, d: 1.5, cover: 1, boxes: [[0, 0, 1.8, 1.0, 1.1]], build(k) {
    const black = k.mat(0x18191b, 0.6), pole = k.mat(0x9a9ea2, 0.4, 0.6);
    k.box(black, 1.8, 0.95, 1.0, 0, 0.475, 0);
    k.box(k.mat(0x2a2a2c, 0.5), 1.4, 0.1, 0.7, 0, 1.0, 0.0, 0, -0.15); // the console
    for (let i = 0; i < 24; i++) k.box(k.mat(k.pick([0x40ff60, 0xffb040, 0xff4040, 0x40a0ff]), 0.5, 0, { emissive: 0x404040 }), 0.02, 0.01, 0.06, -0.6 + (i % 12) * 0.11, 1.07, -0.1 + (i >> 4) * 0.25);
    k.box(k.screen(), 0.5, 0.32, 0.02, -0.4, 1.3, -0.35);
    for (const x of [-0.9, 0.9]) for (const z of [-0.7, 0.7]) k.box(pole, 0.04, 2.4, 0.04, x, 1.2, z);
    k.box(k.mat(0xf2efe6, 0.9), 2.0, 0.04, 1.6, 0, 2.42, 0);
  } };
  R.picnic = { w: 1.9, d: 1.6, boxes: [[0, 0, 1.8, 0.8, 0.76], [0, -0.62, 1.8, 0.28, 0.45], [0, 0.62, 1.8, 0.28, 0.45]], build(k) {
    const w = k.mat(k.pick(WOOD), 0.85);
    k.box(w, 1.8, 0.05, 0.8, 0, 0.74, 0);
    for (const s of [-1, 1]) { k.box(w, 1.8, 0.04, 0.28, 0, 0.44, s * 0.62); for (const x of [-0.75, 0.75]) k.box(w, 0.06, 0.74, 0.06, x, 0.37, s * 0.3, 0, s * 0.35); }
    if (k.rnd() < 0.6) for (let i = 0; i < 3; i++) k.cyl(k.mat(k.pick([0xf2efe6, 0xc0392b, 0x2e86c1]), 0.6), 0.04, 0.035, 0.12, (k.rnd() - 0.5) * 1.4, 0.82, (k.rnd() - 0.5) * 0.5);
  } };
  // A ticket booth by the gate: a little hut with a window and a lit sign.
  R.booth = { w: 1.7, d: 1.6, boxes: [[0, 0, 1.6, 1.5, 2.5]], build(k) {
    const wall = k.mat(k.pick([0xc0392b, 0x2e86c1, 0x16a085]), 0.7), trim = k.mat(0xf2efe6, 0.6);
    k.box(wall, 1.6, 2.4, 1.5, 0, 1.2, 0);
    k.box(trim, 1.7, 0.1, 1.6, 0, 2.45, 0);
    k.box(k.mat(0x0e1418, 0.15, 0.3), 1.1, 0.7, 0.02, 0, 1.45, 0.755);
    k.box(trim, 1.2, 0.06, 0.2, 0, 1.08, 0.8);
    k.box(k.mat(0xf1c40f, 0.5, 0, { emissive: 0xf1c40f, emissiveIntensity: 0.8 }), 1.2, 0.3, 0.03, 0, 2.15, 0.77);
  } };
  R.sinks = { w: 1.98, d: 0.6, cover: 1, boxes: [[0, 0, 1.98, 0.56, 0.9]], build(k) {
    const white = k.mat(0xeceae4, 0.35), steel = k.mat(0xc4c8cc, 0.25, 0.8);
    k.box(k.mat(0xb9bdc2, 0.5), 1.96, 0.86, 0.5, 0, 0.43, -0.03);
    k.box(white, 1.98, 0.05, 0.56, 0, 0.88, 0);
    for (const x of [-0.5, 0.5]) { k.box(k.mat(0xd8d6d0, 0.3), 0.44, 0.012, 0.32, x, 0.9, 0.04); k.cyl(steel, 0.015, 0.015, 0.2, x, 1.0, -0.2); k.box(steel, 0.02, 0.02, 0.12, x, 1.09, -0.15); }
    k.box(k.mat(0x8e9ea8, 0.12, 0.6), 1.8, 0.8, 0.01, 0, 1.6, -0.27); // the mirror
    k.box(k.mat(0xeceae4, 0.4), 0.28, 0.38, 0.12, 0.92, 1.3, -0.22); // a hand dryer
  } };
  R.toilet = { small: 1, w: 0.5, d: 0.75, boxes: [[0, -0.05, 0.42, 0.7, 0.8]], build(k) {
    const white = k.mat(0xf2f0ea, 0.3);
    k.cyl(white, 0.17, 0.12, 0.4, 0, 0.2, 0.08);
    k.cyl(k.mat(0x1c1c1e, 0.5), 0.19, 0.19, 0.03, 0, 0.42, 0.1);
    k.box(white, 0.4, 0.4, 0.18, 0, 0.6, -0.27);
    k.box(k.mat(0xc4c8cc, 0.25, 0.8), 0.06, 0.02, 0.04, 0.12, 0.81, -0.27);
  } };
  // Event fencing round the site: steel mesh panels on block feet, dark scrim, now and then a sponsor's banner.
  R.hoarding = { w: 0.68, d: 0.14, boxes: [[0, 0, 0.68, 0.14, 2.3]], build(k, v) {
    const tube = k.mat(0x8a8f94, 0.4, 0.6), banner = v < 0.12;
    k.box(tube, 0.68, 0.04, 0.04, 0, 2.28, 0); k.box(tube, 0.68, 0.04, 0.04, 0, 0.12, 0);
    if (v < 0.5) k.box(tube, 0.04, 2.3, 0.04, -0.32, 1.15, 0);
    k.box(k.mat(banner ? [0xc0392b, 0x2e86c1, 0xf1c40f, 0x8e44ad][Math.floor(v * 33) % 4] : 0x14261c, 0.95), 0.68, 2.1, 0.012, 0, 1.17, 0.015);
    if (banner) for (let i = 0; i < 3; i++) k.box(k.mat(0xf2efe6, 0.9), 0.5, 0.06, 0.004, 0, 0.9 + i * 0.35, 0.023);
    if (v < 0.5) k.box(k.mat(0x6a6e72, 0.9), 0.2, 0.12, 0.6, -0.32, 0.06, 0);
  } };

  // ---------------------------------------------------------------- the town square and the car park
  // A parked car, nose to +z: body, cabin and glass, wheels, lights. Solid cover across two tiles.
  const CAR = [0x8a1c1c, 0x1c3a6a, 0xd8d8d4, 0x2a2a2c, 0x6a6e72, 0x2e5a3a, 0xc8a040, 0x5a2a5a, 0xe8e4da, 0x3a4a5a];
  R.car = { w: 1.9, d: 4.3, cover: 1, boxes: [[0, 0, 1.8, 4.22, 0.93], [0, -0.2, 1.62, 2.1, 1.43, 0.93]], build(k, v) { // (the body, then the cabin on it: over the bonnet and the boot is open air)
    const paint = k.mat(CAR[Math.floor(v * CAR.length) % CAR.length], 0.35, 0.5), glass = k.mat(0x0c1218, 0.1, 0.6), tyre = k.mat(0x111112, 0.9), trim = k.mat(0x1c1c1e, 0.6);
    k.box(paint, 1.8, 0.62, 4.2, 0, 0.62, 0);
    k.box(paint, 1.62, 0.5, 2.1, 0, 1.18, -0.2);
    k.box(glass, 1.64, 0.36, 1.6, 0, 1.18, -0.2); // the side windows
    k.box(glass, 1.5, 0.42, 0.04, 0, 1.17, 0.86, 0, -0.55); k.box(glass, 1.5, 0.38, 0.04, 0, 1.17, -1.27, 0, 0.5); // windscreen, rear window
    for (const x of [-0.8, 0.8]) for (const z of [-1.35, 1.35]) { k.box(tyre, 0.24, 0.64, 0.64, x, 0.32, z); k.box(k.mat(0x9a9ea2, 0.3, 0.8), 0.25, 0.34, 0.34, x, 0.32, z); }
    k.box(trim, 1.84, 0.16, 0.12, 0, 0.42, 2.1); k.box(trim, 1.84, 0.16, 0.12, 0, 0.42, -2.1); // bumpers
    for (const x of [-0.66, 0.66]) { k.box(k.mat(0xf2efe6, 0.3, 0, { emissive: 0x303030 }), 0.3, 0.1, 0.02, x, 0.74, 2.105); k.box(k.mat(0x8a1010, 0.4, 0, { emissive: 0x200404 }), 0.32, 0.1, 0.02, x, 0.74, -2.105); }
  } };
  // A patrol car, nose to +z: black and white, its light bar lit (red and blue), a push bar on the front.
  R.police = { w: 1.9, d: 4.6, cover: 1, boxes: [[0, 0, 1.84, 4.42, 0.93], [0, -0.2, 1.64, 2.15, 1.43, 0.93], [0, -0.15, 1.3, 0.36, 1.57, 1.43], [0, 2.28, 1.2, 0.14, 0.87, 0.37]], build(k) {
    const black = k.mat(0x111214, 0.35, 0.5), white = k.mat(0xeceae4, 0.35, 0.4), glass = k.mat(0x0c1218, 0.1, 0.6), tyre = k.mat(0x111112, 0.9), trim = k.mat(0x1c1c1e, 0.6);
    k.box(black, 1.82, 0.62, 4.4, 0, 0.62, 0);
    k.box(white, 1.84, 0.5, 2.0, 0, 0.66, -0.15); // the doors
    k.box(white, 1.64, 0.5, 2.15, 0, 1.18, -0.2);
    k.box(glass, 1.66, 0.36, 1.65, 0, 1.18, -0.2);
    k.box(glass, 1.5, 0.42, 0.04, 0, 1.17, 0.88, 0, -0.55); k.box(glass, 1.5, 0.38, 0.04, 0, 1.17, -1.3, 0, 0.5);
    for (const x of [-0.8, 0.8]) for (const z of [-1.4, 1.4]) { k.box(tyre, 0.24, 0.66, 0.66, x, 0.33, z); k.box(k.mat(0x6a6e72, 0.3, 0.8), 0.25, 0.34, 0.34, x, 0.33, z); }
    k.box(trim, 1.86, 0.16, 0.12, 0, 0.42, -2.2); // rear bumper
    k.box(trim, 1.2, 0.5, 0.1, 0, 0.62, 2.28); // the push bar
    k.box(trim, 1.3, 0.08, 0.36, 0, 1.47, -0.15); // the light bar: red one side, blue the other
    k.box(k.mat(0xff2a1a, 0.3, 0, { emissive: 0xc01208 }), 0.6, 0.1, 0.3, -0.33, 1.52, -0.15);
    k.box(k.mat(0x2a5aff, 0.3, 0, { emissive: 0x1030d0 }), 0.6, 0.1, 0.3, 0.33, 1.52, -0.15);
    for (const x of [-0.66, 0.66]) { k.box(k.mat(0xf2efe6, 0.3, 0, { emissive: 0x404040 }), 0.3, 0.1, 0.02, x, 0.74, 2.205); k.box(k.mat(0x8a1010, 0.4, 0, { emissive: 0x200404 }), 0.32, 0.1, 0.02, x, 0.74, -2.205); }
  } };
  R.bench = { w: 1.8, d: 0.6, boxes: [[0, 0, 1.8, 0.55, 0.85]], build(k) {
    const w = k.mat(k.pick(WOOD), 0.85), iron = k.mat(0x1c1c1e, 0.5, 0.5);
    for (let i = 0; i < 3; i++) k.box(w, 1.8, 0.04, 0.12, 0, 0.45, 0.16 - i * 0.14);
    for (let i = 0; i < 2; i++) k.box(w, 1.8, 0.1, 0.03, 0, 0.62 + i * 0.14, -0.24, 0, -0.15);
    for (const x of [-0.8, 0.8]) { k.box(iron, 0.05, 0.45, 0.5, x, 0.225, 0); k.box(iron, 0.05, 0.4, 0.05, x, 0.65, -0.24); }
  } };
  // A plane tree: a trunk you can stand behind and a canopy overhead (only the trunk stops you).
  R.tree = { small: 1, w: 0.6, d: 0.6, boxes: [[0, 0, 0.45, 0.45, 3.2]], build(k) {
    k.cyl(k.mat(0x4a3a2a, 0.95), 0.18, 0.24, 3.2, 0, 1.6, 0, 8);
    const leaf = k.mat(k.pick([0x22401c, 0x2a4a22, 0x1e3a1a]), 0.95, 0, { flatShading: true });
    for (let i = 0; i < 9; i++) k.ico(leaf, 0.9 + k.rnd() * 0.6, (k.rnd() - 0.5) * 2.2, 3.4 + k.rnd() * 1.4, (k.rnd() - 0.5) * 2.2);
    k.box(k.mat(0x2a2622, 0.9), 1.0, 0.04, 1.0, 0, 0.02, 0); // its grate
  } };
  // The fountain in the middle of the square: a round stone basin and a column in the middle.
  R.fountain = { w: 3.9, d: 3.9, boxes: [[0, 0, 3.7, 3.7, 0.6], [0, 0, 0.8, 0.8, 1.9]], build(k) {
    const stone = k.mat(0x8a8478, 0.85), water = k.mat(0x2a5a7a, 0.1, 0.3, { emissive: 0x0a1a28 });
    k.cyl(stone, 1.85, 1.9, 0.6, 0, 0.3, 0, 28);
    k.cyl(water, 1.65, 1.65, 0.02, 0, 0.52, 0, 28);
    k.cyl(stone, 0.35, 0.45, 1.4, 0, 1.2, 0, 14);
    k.cyl(stone, 0.75, 0.55, 0.15, 0, 1.6, 0, 18);
    k.cyl(water, 0.62, 0.62, 0.02, 0, 1.66, 0, 18);
    k.cyl(stone, 0.12, 0.16, 0.5, 0, 1.9, 0, 10);
  } };
  // ---------------------------------------------------------------- a foundry (js/level.js layFoundry)
  // fx: what a piece throws off (G.Level.buildFx: 'sparks' and 'jet' along dir, 'embers' off a molten surface r across,
  // 'smoke', 'steam'), glow: the light it gives (a lamp of its own); both in its own frame, from the floor up.
  const MOLTEN = [0xffc060, 0.4, 0, { emissive: 0xff7010, emissiveIntensity: 2.6 }], DULL = [0x7a3010, 0.6, 0, { emissive: 0xb02a06, emissiveIntensity: 1.1 }];
  // An electric arc furnace (across 2 x 2 tiles): a squat steel shell on its tilting rockers, its water-cooled panels'
  // headers round it, the refractory roof, three graphite electrodes down through it from their arms on the mast at
  // the back; the slag door glowing at the front, the tapping spout under it.
  R.furnace = { w: 3.9, d: 3.9, cover: 1, boxes: [[0, 0, 3.4, 3.4, 3.3]], fx: [{ kind: 'sparks', y: 1.5, z: 1.75, r: 0.4, dir: [0, 0.35, 1] }, { kind: 'smoke', y: 3.6, r: 0.6, rate: 1.6 }], glow: { y: 1.8, z: 2.3, color: 0xff6a20, i: 0.55, d: 9 }, build(k) {
    const shell = k.mat(0x3d4246, 0.55, 0.6), rust = k.mat(0x5a4436, 0.8, 0.3), roof = k.mat(0x6a6660, 0.85), brick = k.mat(0x7a4a36, 0.9);
    const graphite = k.mat(0x2a2a2c, 0.5, 0.3), arm = k.mat(0x8a8f94, 0.45, 0.7), pipe = k.mat(0x2f5a7a, 0.5, 0.5), hot = k.mat(...MOLTEN), warm = k.mat(...DULL);
    for (const x of [-1.1, 1.1]) k.box(rust, 0.5, 0.45, 3.4, x, 0.225, 0); // the rockers
    k.box(shell, 3.4, 0.2, 3.4, 0, 0.55, 0); // the cradle
    k.cyl(shell, 1.62, 1.5, 2.1, 0, 1.7, 0, 22); // the shell
    for (const y of [1.0, 1.55, 2.1, 2.6]) k.cyl(pipe, 1.67, 1.67, 0.07, 0, y, 0, 22);
    k.cyl(roof, 1.2, 1.7, 0.5, 0, 3.0, 0, 22); k.cyl(brick, 0.7, 0.9, 0.2, 0, 3.35, 0, 16);
    // the mast at the back corner, an arm from it to each electrode
    const mx = 1.35, mz = -1.35;
    k.box(arm, 0.42, 6.3, 0.42, mx, 3.15, mz);
    for (let i = 0; i < 3; i++) {
      const a = i * Math.PI * 2 / 3 + 0.6, x = Math.cos(a) * 0.45, z = Math.sin(a) * 0.45, y = 5.5 + i * 0.25, dx = x - mx, dz = z - mz;
      k.cyl(graphite, 0.17, 0.17, 3.2, x, 4.85, z, 10);
      k.box(arm, Math.hypot(dx, dz), 0.22, 0.26, (x + mx) / 2, y, (z + mz) / 2, Math.atan2(-dz, dx));
      k.box(arm, 0.5, 0.36, 0.5, x, y, z); // the clamp
      k.cyl(pipe, 0.05, 0.05, y - 3.4, x + 0.2, (y + 3.4) / 2, z + 0.2, 6); // (its cooling water)
    }
    k.box(warm, 0.9, 0.55, 0.06, 0, 1.55, 1.6); k.box(hot, 0.6, 0.3, 0.02, 0, 1.5, 1.64); // the slag door, white hot inside
    k.box(shell, 1.1, 0.75, 0.2, 0, 1.55, 1.52); // its frame (round the door)
    k.box(rust, 0.5, 0.22, 0.9, 0, 1.0, 1.85, 0, 0.18); k.box(warm, 0.3, 0.02, 0.8, 0, 1.12, 1.85, 0, 0.18); // the tapping spout
    for (const x of [-0.9, 0.9]) k.cyl(pipe, 0.08, 0.08, 3.2, x, 1.6, -1.6, 8); // water down the back
  } };
  // A ladle of molten steel on its stand (across 2 x 2 tiles): a tapering steel shell banded round, the bail over it on
  // its trunnions, the lip lined with refractory brick and the steel in it glowing, a crust of slag on it here and there.
  R.vat = { w: 3.9, d: 3.9, cover: 1, boxes: [[0, 0, 3.1, 3.1, 2.05]], fx: [{ kind: 'embers', y: 2.04, r: 1.1 }, { kind: 'smoke', y: 2.4, r: 1.0, rate: 2.4 }], glow: { y: 2.9, color: 0xff7a28, i: 0.7, d: 10 }, build(k) {
    const steel = k.mat(0x44484c, 0.7, 0.5), rim = k.mat(0x2e3134, 0.6, 0.6), brick = k.mat(0x6e5244, 0.9), crust = k.mat(0x2a2220, 0.95), hot = k.mat(...MOLTEN);
    for (const x of [-1.25, 1.25]) for (const z of [-1.25, 1.25]) k.box(steel, 0.3, 0.62, 0.3, x, 0.31, z); // the stand
    for (const z of [-1.25, 1.25]) k.box(steel, 3.0, 0.14, 0.3, 0, 0.62, z);
    k.cyl(steel, 1.42, 1.15, 1.35, 0, 1.3, 0, 24);
    for (const [y, rr] of [[0.92, 1.24], [1.45, 1.36]]) k.cyl(rim, rr, rr, 0.09, 0, y, 0, 24);
    k.cyl(rim, 1.5, 1.5, 0.12, 0, 1.96, 0, 24); // the lip
    k.cyl(brick, 1.34, 1.34, 0.02, 0, 2.03, 0, 24);
    k.cyl(hot, 1.24, 1.24, 0.02, 0, 2.045, 0, 24); // the steel
    for (let i = 0; i < 6; i++) { const a = k.rnd() * 6.283, rr = 0.3 + k.rnd() * 0.75; k.box(crust, 0.15 + k.rnd() * 0.25, 0.02, 0.12 + k.rnd() * 0.2, Math.cos(a) * rr, 2.06, Math.sin(a) * rr, k.rnd() * 3); }
    k.box(rim, 0.36, 0.14, 0.42, 0, 1.98, 1.55); // the pouring lip
    for (const x of [-1, 1]) { k.cylX(rim, 0.17, 0.17, 0.32, x * 1.55, 1.55, 0); k.box(steel, 0.14, 1.95, 0.32, x * 1.69, 2.45, 0); } // the trunnions, the bail's arms
    k.box(steel, 3.52, 0.22, 0.32, 0, 3.42, 0); k.box(rim, 0.3, 0.4, 0.12, 0, 3.72, 0); // the bail, the crane's eye
  } };
  // An ingot mould table: two rows of iron moulds on a frame, some of them full and still glowing, some cooled.
  R.moulds = { w: 1.98, d: 1.9, cover: 1, boxes: [[0, 0, 1.9, 1.5, 0.8]], fx: [{ kind: 'embers', y: 0.78, r: 0.6, rate: 1.2 }], glow: { y: 1.3, color: 0xff7a30, i: 0.15, d: 4 }, build(k) {
    const iron = k.mat(0x2c2e30, 0.75, 0.5), frame = k.mat(0x4a4e52, 0.6, 0.5), cool = k.mat(0x8a8e92, 0.4, 0.8), hot = k.mat(...MOLTEN), dull = k.mat(...DULL);
    for (const x of [-0.85, 0.85]) for (const z of [-0.65, 0.65]) k.box(frame, 0.1, 0.6, 0.1, x, 0.3, z);
    k.box(frame, 1.9, 0.08, 1.5, 0, 0.62, 0);
    for (const z of [-0.36, 0.36]) for (let i = 0; i < 4; i++) {
      const x = -0.68 + i * 0.45;
      k.box(iron, 0.4, 0.14, 0.6, x, 0.73, z);
      k.box(k.pick([hot, dull, cool, cool, dull]), 0.3, 0.02, 0.48, x, 0.8, z);
    }
  } };
  // A bank of electrical cabinets against a wall: doors with their handles, lights and a screen on each, a warning sign.
  R.panel = { w: 1.9, d: 0.6, boxes: [[0, 0, 1.9, 0.55, 2.1]], build(k) {
    const grey = k.mat(k.pick([0x8a9298, 0x6d7a84, 0xb8bcb4]), 0.5, 0.3), dark = k.mat(0x1a1c1e, 0.6), yel = k.mat(0xf0c020, 0.6);
    const red = k.mat(0xff3020, 0.4, 0, { emissive: 0xff2010, emissiveIntensity: 1.5 }), green = k.mat(0x30ff60, 0.4, 0, { emissive: 0x20d040, emissiveIntensity: 1.5 });
    k.box(dark, 1.9, 0.1, 0.52, 0, 0.05, -0.02); k.box(grey, 1.9, 2.0, 0.5, 0, 1.1, -0.02);
    for (const x of [-0.63, 0, 0.63]) {
      k.box(dark, 0.01, 1.9, 0.006, x + 0.315, 1.1, 0.232);
      k.box(dark, 0.03, 0.16, 0.04, x + 0.24, 1.1, 0.24);
      for (let j = 0; j < 3; j++) k.box(k.rnd() < 0.75 ? green : red, 0.035, 0.035, 0.02, x - 0.18 + j * 0.07, 1.78, 0.236);
      k.box(k.screen(), 0.22, 0.14, 0.01, x - 0.05, 1.55, 0.234);
      if (k.rnd() < 0.5) k.box(yel, 0.16, 0.14, 0.006, x - 0.05, 1.3, 0.235); // (the lightning-bolt sign)
    }
  } };
  // A charging bucket of scrap for the furnace: an open steel bin heaped with rusted offcuts.
  R.scrap = { w: 1.9, d: 1.9, cover: 1, boxes: [[0, 0, 1.8, 1.6, 1.15]], build(k) {
    const bin = k.mat(0x4a3f36, 0.85, 0.4), RUST = [0x6a4a36, 0x5a5048, 0x7a5a40, 0x4a4a4c, 0x8a6a4a, 0x3a3634];
    k.box(bin, 1.8, 0.08, 1.6, 0, 0.04, 0);
    for (const s of [-1, 1]) { k.box(bin, 1.8, 1.1, 0.06, 0, 0.55, s * 0.77); k.box(bin, 0.06, 1.1, 1.6, s * 0.87, 0.55, 0); k.box(bin, 0.12, 0.2, 0.3, s * 0.95, 0.95, 0); }
    k.box(k.mat(0x3a302a, 1), 1.68, 0.7, 1.48, 0, 0.5, 0); // (the heap's mass, under what shows)
    for (let i = 0; i < 18; i++) {
      const m = k.mat(k.pick(RUST), 0.9, 0.3), x = (k.rnd() - 0.5) * 1.5, z = (k.rnd() - 0.5) * 1.3, y = 0.85 + k.rnd() * 0.3;
      if (k.rnd() < 0.4) k.cyl(m, 0.04 + k.rnd() * 0.05, 0.04 + k.rnd() * 0.05, 0.4 + k.rnd() * 0.5, x, y, z, 6, k.rnd() * 3);
      else k.box(m, 0.15 + k.rnd() * 0.5, 0.03 + k.rnd() * 0.1, 0.1 + k.rnd() * 0.35, x, y, z, k.rnd() * 6, (k.rnd() - 0.5) * 1.2);
    }
  } };
  // A roller conveyor (one tile of a processing line, running along x): rollers between two side beams on legs, a billet
  // on it now and then, a hot one glowing.
  R.conveyor = { w: 1.98, d: 1.2, cover: 1, boxes: [[0, 0, 1.98, 1.1, 0.92]], build(k, v) {
    const frame = k.mat(k.pick([0x3f6e9a, 0xc89a20, 0x4a5a3a]), 0.5, 0.4), roller = k.mat(0x9aa0a6, 0.3, 0.8), dark = k.mat(0x2a2c2e, 0.6, 0.5);
    for (const x of [-0.85, 0.85]) for (const z of [-0.45, 0.45]) k.box(dark, 0.08, 0.8, 0.08, x, 0.4, z);
    for (const z of [-0.5, 0.5]) k.box(frame, 1.98, 0.16, 0.08, 0, 0.82, z);
    for (let x = -0.9; x <= 0.91; x += 0.18) k.cyl(roller, 0.05, 0.05, 0.94, x, 0.84, 0, 10, Math.PI / 2);
    if (v < 0.55) k.box(v < 0.22 ? k.mat(...MOLTEN) : k.mat(0x6a6e72, 0.5, 0.7), 1.6, 0.16, 0.16, (v * 7 % 1 - 0.5) * 0.3, 0.97, 0);
  } };
  // A rolling mill stand (one tile of the line): a housing post each side, the two work rolls across between them, the
  // screw-down on top, steam off the rolls.
  R.mill = { w: 1.98, d: 1.9, cover: 1, boxes: [[0, 0, 1.3, 1.9, 2.7]], fx: [{ kind: 'steam', y: 1.3, r: 0.5, rate: 2.2 }], build(k) {
    const housing = k.mat(k.pick([0x4d6f8f, 0x5a6a50, 0x8a4a2a]), 0.55, 0.4), roll = k.mat(0xc8ccd0, 0.2, 0.9), dark = k.mat(0x2a2c2e, 0.6, 0.5);
    k.box(dark, 1.5, 0.2, 1.98, 0, 0.1, 0);
    for (const z of [-0.78, 0.78]) { k.box(housing, 1.2, 2.5, 0.3, 0, 1.45, z); k.box(dark, 0.5, 0.9, 0.32, 0, 1.0, z); } // (the window the chocks ride in)
    k.box(housing, 1.3, 0.32, 1.9, 0, 2.55, 0);
    for (const y of [0.76, 1.22]) k.cyl(roll, 0.22, 0.22, 1.36, 0, y, 0, 18, Math.PI / 2);
    k.cyl(dark, 0.12, 0.12, 0.45, 0, 2.92, 0, 10);
    k.box(k.mat(0xf0c020, 0.6), 1.22, 0.06, 0.32, 0, 2.2, -0.78); // (a stripe of warning paint)
  } };
  // A hot saw (one tile of the line): a guard over the blade across the line, the motor behind; sparks off it while it cuts.
  R.saw = { w: 1.98, d: 1.6, cover: 1, boxes: [[0, 0, 1.4, 1.5, 1.75]], fx: [{ kind: 'jet', y: 0.95, z: 0.45, r: 0.1, dir: [0, 0.35, 1] }], build(k) {
    const body = k.mat(k.pick([0xc8a020, 0xb84a2a, 0x4a6a8a]), 0.5, 0.4), dark = k.mat(0x2a2c2e, 0.6, 0.5), blade = k.mat(0xd0d4d8, 0.2, 0.9);
    k.box(dark, 1.4, 0.7, 1.4, 0, 0.35, 0);
    k.cylX(body, 0.66, 0.66, 0.2, 0, 1.15, -0.05, 22); k.cylX(blade, 0.6, 0.6, 0.02, 0, 1.0, 0.1, 22);
    k.box(body, 0.6, 0.6, 0.7, 0.3, 1.2, -0.5); k.cylX(dark, 0.16, 0.16, 0.5, -0.1, 1.2, -0.5, 10); // the motor, its spindle
    for (const s of [-1, 1]) k.box(k.mat(0xf0c020, 0.6), 0.04, 0.4, 1.0, s * 0.68, 0.5, 0); // (warning paint)
  } };
  // A hydraulic forging press (one tile of the line): four columns between the bed and the crown, the ram on them, its
  // cylinder on top.
  R.press = { w: 1.98, d: 1.9, cover: 1, boxes: [[0, 0, 1.8, 1.7, 3.4]], build(k) {
    const body = k.mat(k.pick([0x3a5a7a, 0x5a5f63, 0x7a3a2a]), 0.5, 0.5), chrome = k.mat(0xd8dce0, 0.15, 0.95), dark = k.mat(0x2a2c2e, 0.6, 0.5);
    k.box(body, 1.8, 0.7, 1.7, 0, 0.35, 0); k.box(body, 1.8, 0.6, 1.7, 0, 3.1, 0);
    for (const x of [-0.72, 0.72]) for (const z of [-0.62, 0.62]) k.cyl(chrome, 0.1, 0.1, 2.2, x, 1.8, z, 12);
    k.box(dark, 1.3, 0.5, 1.2, 0, 2.2, 0); k.cyl(body, 0.4, 0.4, 0.45, 0, 3.6, 0, 16);
    k.cyl(k.mat(0x1a1a1a, 0.7), 0.03, 0.03, 2.6, 0.85, 2.0, -0.8, 6); // (a hydraulic line)
  } };
  // A quench tank at the end of the line: a steel tank of water, steam off it.
  R.quench = { w: 1.98, d: 1.5, cover: 1, boxes: [[0, 0, 1.9, 1.4, 0.95]], fx: [{ kind: 'steam', y: 0.95, r: 0.8, rate: 3.5 }], build(k) {
    const steel = k.mat(0x5a5f63, 0.55, 0.6), water = k.mat(0x2a3e48, 0.08, 0.3);
    k.box(steel, 1.9, 0.08, 1.4, 0, 0.04, 0);
    for (const s of [-1, 1]) { k.box(steel, 1.9, 0.95, 0.06, 0, 0.475, s * 0.67); k.box(steel, 0.06, 0.95, 1.4, s * 0.92, 0.475, 0); }
    k.box(water, 1.78, 0.02, 1.28, 0, 0.82, 0);
  } };
  // A forklift (across two tiles, lengthwise; the forks at the front, +z): the body and its counterweight, the seat
  // under the overhead guard, the mast with the carriage and forks down.
  R.forklift = { w: 1.4, d: 3.4, cover: 1, boxes: [[0, -0.55, 1.25, 2.3, 1.2], [0, -0.5, 1.15, 1.4, 2.2, 2.1], [0, 0.78, 1.0, 0.25, 2.3], [0, 1.28, 0.95, 0.9, 0.12]], build(k) {
    const paint = k.mat(k.pick([0xe0b020, 0xd86a1a, 0x3a7a3a, 0xc02a1a]), 0.5, 0.2), black = k.mat(0x1a1a1a, 0.7), cw = k.mat(0x3a3c3e, 0.6, 0.4), steel = k.mat(0x5a5e62, 0.4, 0.6), chrome = k.mat(0xd0d4d8, 0.15, 0.9);
    k.box(paint, 1.2, 0.55, 1.9, 0, 0.6, -0.4); k.box(cw, 1.25, 0.75, 0.45, 0, 0.65, -1.45); // the body, the counterweight
    k.box(black, 0.5, 0.12, 0.45, 0, 0.95, -0.75); k.box(black, 0.5, 0.45, 0.08, 0, 1.22, -0.98, 0, -0.15); // the seat
    k.box(black, 0.36, 0.42, 0.16, 0, 1.05, -0.12); k.cyl(black, 0.16, 0.16, 0.03, 0, 1.3, -0.26, 14, -0.9); // the dash, the wheel
    for (const z of [0.3, -1.2]) for (const s of [-1, 1]) { k.cylX(black, 0.3, 0.3, 0.26, s * 0.5, 0.3, z, 14); k.cylX(steel, 0.14, 0.14, 0.27, s * 0.5, 0.3, z, 10); }
    for (const x of [-0.54, 0.54]) for (const z of [-1.18, 0.12]) k.box(black, 0.06, 1.3, 0.06, x, 1.5, z); // the overhead guard
    k.box(black, 1.15, 0.05, 1.4, 0, 2.15, -0.53);
    k.box(k.mat(0xff8a10, 0.5, 0, { emissive: 0xff6a00, emissiveIntensity: 1.6 }), 0.1, 0.08, 0.1, 0, 2.22, -1.0); // the beacon
    for (const x of [-0.38, 0.38]) k.box(steel, 0.1, 2.3, 0.14, x, 1.15, 0.72); // the mast
    k.box(steel, 0.86, 0.08, 0.1, 0, 2.25, 0.72); k.cyl(chrome, 0.04, 0.04, 1.6, 0, 1.1, 0.66, 8);
    k.box(black, 0.9, 0.4, 0.06, 0, 0.38, 0.84); // the carriage
    for (const x of [-0.28, 0.28]) { k.box(steel, 0.1, 0.45, 0.05, x, 0.28, 0.86); k.box(steel, 0.1, 0.05, 0.95, x, 0.06, 1.3); } // the forks
  } };
  // Raw stock on pallets: billets (square bars in layers, sticks between, banded), ingots (stacked crosswise), coils
  // of strip steel lying on a cradle.
  R.billets = { w: 1.9, d: 1.4, cover: 1, boxes: [[0, 0, 1.85, 1.25, 0.9]], build(k) {
    const wood = k.mat(0x8a6a44, 0.9), band = k.mat(0x2a4a8a, 0.5, 0.4), BAR = [0x6a6e72, 0x5e5a56, 0x7a6a5a, 0x6e5444];
    for (const z of [-0.5, 0, 0.5]) k.box(wood, 1.85, 0.12, 0.12, 0, 0.06, z);
    for (let l = 0; l < 4; l++) {
      const y = 0.18 + l * 0.17;
      for (let i = 0; i < 6; i++) k.box(k.mat(k.pick(BAR), 0.55, 0.7), 1.8, 0.13, 0.13, 0, y, -0.48 + i * 0.19);
      if (l < 3) for (const x of [-0.6, 0.6]) k.box(wood, 0.06, 0.04, 1.2, x, y + 0.085, 0);
    }
    for (const x of [-0.75, 0.75]) k.box(band, 0.03, 0.72, 1.24, x, 0.48, 0);
  } };
  R.ingots = { w: 1.5, d: 1.5, cover: 1, boxes: [[0, 0, 1.3, 1.3, 1.0]], build(k) {
    const wood = k.mat(0x8a6a44, 0.9), m = k.pick([[0xb8bcc0, 0.35, 0.8], [0xb06a3a, 0.35, 0.8], [0x6a6e72, 0.5, 0.7]]), metal = k.mat(...m);
    for (const z of [-0.5, 0, 0.5]) k.box(wood, 1.3, 0.12, 0.12, 0, 0.06, z);
    for (let l = 0; l < 7; l++) for (let i = 0; i < 4; i++) {
      const y = 0.18 + l * 0.12, o = -0.45 + i * 0.3;
      if (l % 2) k.box(metal, 0.26, 0.11, 1.25, o, y, 0); else k.box(metal, 1.25, 0.11, 0.26, 0, y, o);
    }
  } };
  R.coils = { w: 1.9, d: 1.9, cover: 1, boxes: [[0, 0, 1.8, 1.5, 1.35]], build(k) {
    const steel = k.mat(k.pick([0x8a8e92, 0x6a6e72, 0x9a7a5a]), 0.35, 0.8), dark = k.mat(0x1c1d1e, 0.8), cradle = k.mat(0x4a3f36, 0.8, 0.4), band = k.mat(0x2a4a8a, 0.5, 0.4);
    for (const z of [-0.5, 0.5]) k.box(cradle, 1.8, 0.14, 0.3, 0, 0.07, z);
    for (const x of [-0.45, 0.45]) {
      k.cylX(steel, 0.65, 0.65, 0.78, x, 0.72, 0, 26); k.cylX(dark, 0.26, 0.26, 0.79, x, 0.72, 0, 16);
      k.box(band, 0.04, 1.32, 0.03, x, 0.72, 0); k.box(band, 0.04, 0.03, 1.32, x, 0.72, 0);
    }
  } };
  // A control desk against the window: a sloping panel of buttons, three screens on it, a chair at it.
  R.console = { w: 1.9, d: 0.95, cover: 1, boxes: [[0, -0.12, 1.9, 0.7, 0.95]], build(k) {
    const body = k.mat(k.pick([0xc8ccd0, 0x5a6068]), 0.5, 0.2), dark = k.mat(0x1a1c1e, 0.5), BTN = [0xd03020, 0x30a040, 0xe0c020, 0x2a60c0];
    k.box(body, 1.9, 0.76, 0.7, 0, 0.38, -0.12);
    k.box(dark, 1.88, 0.04, 0.42, 0, 0.82, 0.02, 0, -0.3);
    for (let i = 0; i < 14; i++) k.box(k.mat(k.pick(BTN), 0.4, 0, { emissive: 0x202020 }), 0.04, 0.02, 0.04, -0.8 + (i % 7) * 0.26 + k.rnd() * 0.05, 0.84 + (i < 7 ? 0 : 0.05), i < 7 ? 0.12 : -0.04);
    for (const x of [-0.6, 0, 0.6]) { k.box(dark, 0.06, 0.2, 0.06, x, 0.86, -0.36); k.box(dark, 0.56, 0.36, 0.04, x, 1.15, -0.34); k.box(k.screen(), 0.51, 0.31, 0.005, x, 1.15, -0.318); }
    k.cyl(dark, 0.22, 0.22, 0.08, 0.1, 0.47, 0.38, 12); k.cyl(dark, 0.03, 0.03, 0.4, 0.1, 0.24, 0.38, 6); k.box(dark, 0.42, 0.45, 0.06, 0.1, 0.78, 0.6);
  } };
  // A toilet stall against the wall: partitions either side, the door standing open inward, the toilet at the back.
  R.stall = { w: 1.9, d: 1.6, boxes: [[-0.92, 0, 0.04, 1.5, 1.9, 0.12], [0.92, 0, 0.04, 1.5, 1.9, 0.12], [0, -0.45, 0.42, 0.66, 0.8]], build(k) {
    const part = k.mat(k.pick([0x8a9aa8, 0xc8c0b0, 0x5a6a5a]), 0.5, 0.1), steel = k.mat(0xb8bcc0, 0.3, 0.8), white = k.mat(0xeceae4, 0.3);
    for (const x of [-0.92, 0.92]) { k.box(part, 0.04, 1.78, 1.5, x, 1.01, 0); k.box(steel, 0.05, 0.12, 0.05, x, 0.06, 0.6); }
    k.box(steel, 1.88, 0.05, 0.05, 0, 1.92, 0.74); // the header rail
    k.box(part, 0.62, 1.7, 0.035, 0.55, 1.0, 0.45, -1.2); // the door, swung in
    k.cyl(white, 0.2, 0.15, 0.4, 0, 0.2, -0.38, 14); k.cyl(white, 0.21, 0.21, 0.03, 0, 0.42, -0.38, 14); k.box(white, 0.42, 0.38, 0.18, 0, 0.62, -0.66);
    k.cyl(k.mat(0xf2f0ea, 0.8), 0.06, 0.06, 0.1, -0.7, 0.75, -0.2, 10, Math.PI / 2); // (the paper)
  } };
  // A row of steel lockers.
  R.lockers = { w: 1.9, d: 0.5, boxes: [[0, 0, 1.9, 0.48, 1.9]], build(k) {
    const c = k.mat(k.pick([0x4a6a8a, 0x8a9298, 0x6a7a5a, 0x9a4a3a]), 0.5, 0.4), dark = k.mat(0x1a1c1e, 0.6);
    k.box(dark, 1.9, 0.1, 0.46, 0, 0.05, 0); k.box(c, 1.9, 1.8, 0.46, 0, 1.0, 0);
    for (let i = 0; i < 5; i++) {
      const x = -0.76 + i * 0.38;
      k.box(dark, 0.008, 1.76, 0.006, x + 0.19, 1.0, 0.232);
      for (const y of [1.65, 1.71, 1.77]) k.box(dark, 0.2, 0.012, 0.006, x, y, 0.232);
      k.box(dark, 0.03, 0.1, 0.03, x + 0.13, 1.1, 0.24);
    }
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
    // the hangar between levels (js/hangar.js): dressed by hand, and the helipad outside it
    hangar: { floor: 'pave', bare: 1 }, pad: { floor: 'pave', bare: 1, out: 1 }, range: { floor: 'pave', bare: 1, out: 1 },
    // outside: the street in front of a house, the lot in front of a building (bins, pallets, crates)
    street: { must: 'bin', wall: ['bin', 'planter', 'bin'], center: [], small: ['planter', 'bin'], floor: 'pave', out: 1 },
    // a road (the suburbs: the patrol cars are set where the layout says, rm.cars), and a front lawn
    road: { bare: 1, floor: 'pave', out: 1 }, lawn: { must: 'planter', wall: ['planter', 'bin'], center: ['hedge'], small: ['planter'], floor: 'grass', out: 1 },
    lot: { must: 'crates', wall: ['pallet', 'bin', 'crates', 'pallet'], center: [], small: ['bin', 'cardboard'], floor: 'pave', out: 1 },
    // an apartment block's hallway and the landing at the top of the stairs: bare
    corridor: { floor: 'carpet', bare: 1 }, landing: { floor: 'tile', bare: 1 },
    alley: { floor: 'pave', bare: 1, out: 1 }, // the passage between two houses
    // a festival (laid out on its own: plan()); the field's lawn is laid in G.Level.buildFestival
    stage: { floor: null, out: 1 }, seating: { floor: null, out: 1 }, court: { floor: null, out: 1 }, picnic: { floor: null, out: 1 }, gate: { floor: null, out: 1 },
    washroom: { must: 'sinks', wall: ['sinks'], center: [], small: ['bin'], floor: 'tile' }, cubicle: { floor: 'tile', bare: 1 },
    plaza: { floor: null, out: 1 }, parking: { floor: null, out: 1 }, aisle: { floor: null, bare: 1, out: 1 },
    // the shops round the town square
    cafe: { must: 'counter', wall: ['counter', 'fridge', 'bookshelf'], center: ['dining', 'dining'], small: ['plant', 'bin'], floor: 'tile' },
    store: { must: 'counter', wall: ['rack', 'rack', 'files'], center: ['rack'], small: ['cardboard', 'plant'], floor: 'tile', dense: 1 },
    // a convenience store (js/level.js layMart): laid out on its own (plan())
    mart: { floor: 'tile' }, cashier: { floor: 'tile' }, stockroom: { floor: null }, freezer: { floor: 'tile' },
    bar: { must: 'counter', wall: ['counter', 'fridge', 'sofa', 'tv'], center: ['dining', 'armchairs'], small: ['plant', 'lamp'], floor: 'wood' },
    // a foundry (js/level.js layFoundry): its halls, the loading bay, the control room, the toilets and the car park are
    // laid out on their own (plan()); noArt: no pictures on the walls
    melt: { floor: null, noArt: 1 }, mill: { floor: null, noArt: 1 }, loading: { floor: 'pave', noArt: 1 }, catwalk: { floor: null, bare: 1, noArt: 1 },
    control: { floor: 'carpet', noArt: 1 }, restroom: { floor: 'tile', noArt: 1 }, carpark: { floor: 'pave', out: 1 },
    mcc: { must: 'panel', wall: ['panel', 'panel', 'files'], center: [], small: ['bin'], floor: null, noArt: 1 },
    locker: { must: 'lockers', wall: ['lockers', 'lockers', 'bench'], center: ['bench'], small: ['bin'], floor: 'tile', noArt: 1 },
    kitchenette: { must: 'counter', wall: ['fridge', 'counter', 'counter'], center: ['dining'], small: ['bin', 'cooler', 'plant'], floor: 'tile' },
    lobby: { must: 'counter', wall: ['sofa', 'files', 'sofa'], center: ['armchairs'], small: ['plant', 'plant', 'bin'], floor: 'tile' },
    observe: { must: 'console', wall: ['desk', 'console', 'desk'], center: ['deskpair'], small: ['plant', 'cooler', 'bin'], floor: 'carpet' },
    boss: { must: 'desk', wall: ['bookshelf', 'files', 'sofa', 'bookshelf'], center: ['armchairs'], small: ['plant', 'lamp'], floor: 'carpet', rug: 1 },
    meeting: { must: 'tv', wall: ['files', 'bookshelf'], center: ['dining'], small: ['plant', 'cooler'], floor: 'carpet' },
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
    // A festival is laid out on its own: the stage, rows of seats in front of it, stalls facing each other across
    // lanes, picnic tables, ticket booths at the gate, a toilet in each cubicle. Where civilians hide (behind a
    // stall's counter: map.civSpots) and the strings of lights over it all (map.fest.strings: ends in metres,
    // with a pole under each end that has one) go with it.
    function festival() {
      const F = map.fest = { strings: [], stage: null, gate: null, lamps: [], bays: [], plaza: null, lot: null }, C = (v) => (v + 0.5) * TS;
      map.civSpots = [];
      const str = (a, b, kind, pa, pb) => F.strings.push({ a, b, kind, pa, pb });
      return {
        stage(rm) {
          F.stage = { x0: rm.x * TS, x1: (rm.x + rm.w) * TS, z0: rm.z * TS, z1: (rm.z + rm.h) * TS };
          for (let z = rm.z; z < rm.z + rm.h; z++) for (let x = rm.x; x < rm.x + rm.w; x++) {
            const wing = (x === rm.x || x === rm.x + rm.w - 1) && z === rm.z + rm.h - 1; // the PA stacks, at the front corners
            if (!tryBlock(x, z, wing ? 4 : 2)) continue;
            put(wing ? 'speaker' : 'stagedeck', x, z, C(x), C(z), wing ? facing(0, -1) : 0, r());
          }
        },
        seating(rm) {
          const cx = rm.cx, half = Math.min(11, (rm.w >> 1) - 2);
          for (const dz of [2, 4, 6, 8]) {
            const z = rm.z + dz, v = r();
            if (z >= rm.z + rm.h - 1) continue;
            for (let x = cx - half; x <= cx + half; x++) { // a centre aisle and one down each side
              if (x === cx || Math.abs(x - cx) === 6 || x <= rm.x || x >= rm.x + rm.w - 1) continue;
              if (tryBlock(x, z, 2)) put('seats', x, z, C(x), C(z), facing(0, 1), v);
            }
          }
          const fz = rm.z + rm.h - 1;
          if (tryBlock(cx, fz, 2)) put('foh', cx, fz, C(cx), C(fz), facing(0, 1), r());
          // strings fanning out from the top of the stage's truss over the seats to poles at the back
          const s = F.stage;
          if (s) for (let i = 0; i < 7; i++) str([s.x0 + 0.4 + (i / 6) * (s.x1 - s.x0 - 0.8), 7.0, s.z1 - 0.3], [C(cx) + (i - 3) * 7.5 + (i === 3 ? 2.4 : 0), 5.2, (rm.z + rm.h) * TS - 0.6], 'bulb', false, true);
        },
        court(rm) {
          // rows of stalls, two facing each other across each lane with their backs to a service alley. Most are
          // 4 m wide across two tiles (room behind the counter for two); a way through every few.
          const rows = [[1, 1], [5, -1], [8, 1], [12, -1], [15, 1], [19, -1]].map(([o, f]) => [rm.z + o, f]).filter(([z]) => z < rm.z + rm.h - 1);
          const gap = (x) => (x - rm.x - 1) % 5 === 4;
          for (const [z, f] of rows) {
            const q = facing(0, -f), yaw = Math.atan2(0, -f), free = (x) => t[z * W + x] === 0;
            for (let x = rm.x + 1; x <= rm.x + rm.w - 2;) {
              const k = (x - rm.x - 1) % 5, food = r() < 0.55;
              if (k === 4) { x++; continue; }
              if ((k === 0 || k === 2) && x + 1 <= rm.x + rm.w - 2 && free(x) && free(x + 1) && tryBlock(x, z, 2)) {
                if (tryBlock(x + 1, z, 2)) {
                  put(food ? 'bigfood' : 'bigmerch', x, z, (x + 1) * TS, C(z), q, r());
                  for (const o of [-0.95, 0.95]) map.civSpots.push({ x: (x + 1) * TS + o, z: C(z), yaw }); // behind the counter
                  x += 2; continue;
                }
                put(food ? 'stallfood' : 'stallmerch', x, z, C(x), C(z), q, r()); map.civSpots.push({ x: C(x), z: C(z), yaw }); x++; continue;
              }
              if (tryBlock(x, z, 2)) { put(food ? 'stallfood' : 'stallmerch', x, z, C(x), C(z), q, r()); map.civSpots.push({ x: C(x), z: C(z), yaw }); }
              x++;
            }
          }
          // lights strung back and forth across each lane, from poles in the gaps
          const xs = [rm.x]; for (let x = rm.x + 1; x <= rm.x + rm.w - 2; x++) if (gap(x)) xs.push(x);
          xs.push(rm.x + rm.w - 1);
          for (let p = 0; p + 1 < rows.length; p += 2) {
            const zA = C(rows[p][0]), zB = C(rows[p + 1][0]), kind = p % 4 ? 'bulb' : 'lantern';
            for (let i = 0; i < xs.length; i++) {
              str([C(xs[i]), 4.6, zA], [C(xs[i]), 4.6, zB], kind, true, true);
              if (i + 1 < xs.length) str([C(xs[i]), 4.6, zB], [C(xs[i + 1]), 4.6, zA], kind, true, true);
            }
          }
        },
        picnic(rm) {
          for (let z = rm.z + 1; z < rm.z + rm.h - 1; z += 3) for (let x = rm.x + 1; x < rm.x + rm.w - 1; x += 2) if (tryBlock(x, z, 4)) put('picnic', x, z, C(x), C(z), r() < 0.5 ? 0 : 2, r());
          put('bin', rm.x, rm.z + rm.h - 1, C(rm.x), C(rm.z + rm.h - 1) + 0.5, 0, r());
        },
        gate(rm) { // inside the festival's gate: the ticket booths either side of it, lights over
          F.gate = { x0: rm.x * TS, x1: (rm.x + rm.w) * TS, z0: rm.z * TS, z1: (rm.z + rm.h) * TS };
          const bz = rm.z + rm.h - 1;
          for (const x of [rm.cx - 4, rm.cx + 3]) if (tryBlock(x, bz, 4)) put('booth', x, bz, C(x), C(bz), facing(0, 1), r());
          const xs = []; for (let x = rm.x; x < rm.x + rm.w; x += 5) if (Math.abs(x - rm.cx) > 1) xs.push(x); // (no pole right where you come in)
          for (let i = 0; i + 1 < xs.length; i++) str([C(xs[i]), 4.4, rm.z * TS + 0.4], [C(xs[i + 1]), 4.4, rm.z * TS + 0.4], 'bulb', true, true);
        },
        // the town square: a fountain in the middle with benches round it, cafe tables out in front of the shops,
        // plane trees down the far side, street lamps, lanterns strung across
        plaza(rm) {
          F.plaza = { x0: rm.x * TS, x1: (rm.x + rm.w) * TS, z0: rm.z * TS, z1: (rm.z + rm.h) * TS };
          const cx = rm.cx, cz = rm.cz;
          if ([[0, 0], [1, 0], [0, 1], [1, 1]].every(([a, b]) => t[(cz + b) * W + cx + a] === 0) && tryBlock(cx, cz, 4)) {
            tryBlock(cx + 1, cz, 4); tryBlock(cx, cz + 1, 4); tryBlock(cx + 1, cz + 1, 4);
            put('fountain', cx, cz, (cx + 1) * TS, (cz + 1) * TS, 0, r());
          }
          for (const [x, z, dx, dz] of [[cx - 2, cz, -1, 0], [cx - 2, cz + 1, -1, 0], [cx + 3, cz, 1, 0], [cx + 3, cz + 1, 1, 0], [cx, cz - 2, 0, -1], [cx + 1, cz + 3, 0, 1]])
            if (tryBlock(x, z, 4)) put('bench', x, z, C(x), C(z), facing(dx, dz), r());
          for (let z = rm.z + 2; z < rm.z + rm.h - 1; z += 4) if (t[z * W + rm.x + rm.w - 1] === 0) put('tree', rm.x + rm.w - 1, z, C(rm.x + rm.w - 1), C(z), 0, r());
          for (let z = rm.z + 3; z < rm.z + rm.h - 2; z += 6) if (Math.abs(z - cz) > 3 && tryBlock(rm.x + 1, z, 4)) put('patio', rm.x + 1, z, C(rm.x + 1), C(z), 0, r());
          for (let z = rm.z + 1; z < rm.z + rm.h; z += 8) F.lamps.push([C(rm.x + rm.w - 2), C(z)]);
          for (const [a, b] of [[-3, -3], [4, -3], [-3, 4], [4, 4]]) F.lamps.push([C(cx + a), C(cz + b)]);
          const zs = []; for (let z = rm.z + 1; z < rm.z + rm.h; z += 5) zs.push(z);
          for (let i = 0; i + 1 < zs.length; i++) { const [xa, xb] = i % 2 ? [rm.x + rm.w - 2, rm.x] : [rm.x, rm.x + rm.w - 2]; str([C(xa), 4.6, C(zs[i])], [C(xb), 4.6, C(zs[i + 1])], 'lantern', true, true); }
        },
        // the car park: two rows of bays (two tiles deep, a car in most), aisles between, tall lamps down the middle
        parking(rm) {
          F.lot = { x0: rm.x * TS, x1: (rm.x + rm.w) * TS, z0: rm.z * TS, z1: (rm.z + rm.h) * TS };
          for (const za of [rm.z + 1, rm.z + 5]) {
            if (za + 1 >= rm.z + rm.h) continue;
            F.bays.push([rm.x * TS, (rm.x + rm.w) * TS, za * TS, (za + 2) * TS]);
            for (let x = rm.x + 1; x <= rm.x + rm.w - 2; x++) {
              if (r() < 0.3 || t[za * W + x] !== 0 || t[(za + 1) * W + x] !== 0 || !tryBlock(x, za, 2)) continue; // (an empty bay)
              if (!tryBlock(x, za + 1, 2)) continue;
              put('car', x, za, C(x), (za + 1) * TS, r() < 0.5 ? 0 : 2, r());
            }
          }
          for (let x = rm.x + 2; x < rm.x + rm.w; x += 8) F.lamps.push([C(x), (rm.z + 4) * TS]);
        },
        cubicle(rm) { // the toilet against the wall facing the door
          let dir = null;
          for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (t[(rm.z + dz) * W + rm.x + dx] === 3) dir = [-dx, -dz];
          if (!dir) return;
          const off = 1 - 0.02 - R.toilet.d / 2;
          put('toilet', rm.x, rm.z, C(rm.x) + dir[0] * off, C(rm.z) + dir[1] * off, facing(dir[0], dir[1]), r(), [dir]);
        },
      };
    }
    // A foundry: the melt shop (its furnaces, the ladles in front of them, the moulds), the processing hall (its two
    // lines, a way through the middle of each), the loading bay (pallet racking down its east wall, raw stock in two
    // blocks clear of the doors, two forklifts), the control room (a desk under every window not by a door), the
    // toilets (stalls along the back wall, the basins by the door) and the car park (cars along the fence).
    function foundry() {
      const C = (v) => (v + 0.5) * TS, free = (x, z) => t[z * W + x] === 0;
      const side = (name, x, z, dx, dz) => { // against the wall in (dx, dz)
        const rec = R[name];
        if (!free(x, z) || !tryBlock(x, z, rec.cover ? 2 : 4)) return false;
        const off = 1 - 0.02 - rec.d / 2; put(name, x, z, C(x) + dx * off, C(z) + dz * off, facing(dx, dz), r(), [[dx, dz]]); return true;
      };
      const one = (name, x, z, q = 0) => { if (!free(x, z) || !tryBlock(x, z, R[name].cover ? 2 : 4)) return false; put(name, x, z, C(x), C(z), q, r()); return true; };
      const big = (name, x, z, q = 0) => { // across 2 x 2 tiles, (x, z) the north-west one
        const cells = [[x, z], [x + 1, z], [x, z + 1], [x + 1, z + 1]];
        if (!cells.every(([a, b]) => free(a, b)) || !tryBlock(x, z, 2)) return false;
        for (const [a, b] of cells.slice(1)) tryBlock(a, b, 2);
        put(name, x, z, (x + 1) * TS, (z + 1) * TS, q, r()); return true;
      };
      const long = (name, x, z, q) => { // across (x, z) and (x, z + 1), lengthwise
        if (!free(x, z) || !free(x, z + 1) || !tryBlock(x, z, 2)) return false;
        tryBlock(x, z + 1, 2); put(name, x, z, C(x), (z + 1) * TS, q, r()); return true;
      };
      return {
        melt(rm) {
          const X = rm.x, Z = rm.z;
          for (const x of [X + 3, X + 9]) big('furnace', x, Z + 1); // (their tapping spouts toward the ladles)
          for (const x of [X + 3, X + 9]) big('vat', x, Z + 6, r() < 0.5 ? 0 : 2);
          for (let x = X + 7; x <= X + 11; x++) one('moulds', x, Z + 9);
          one('quench', X + 12, Z + 9);
          for (const x of [X + 6, X + 7]) side('panel', x, Z, 0, -1);
          for (const z of [Z + 4, Z + 5]) side('panel', X + rm.w - 1, z, 1, 0);
          for (const z of [Z + 2, Z + 4]) one('scrap', X, z, Math.floor(r() * 4));
        },
        mill(rm) {
          const X = rm.x, Z = rm.z, lines = [['conveyor', 'mill', 'mill', 'conveyor', 'saw', null, 'conveyor', 'press', 'conveyor', 'quench'], ['conveyor', 'conveyor', 'mill', 'conveyor', 'conveyor', null, 'saw', 'conveyor', 'conveyor', 'coils']];
          if (r() < 0.5) lines.reverse();
          lines.forEach((ln, i) => ln.forEach((name, k) => { if (name) one(name, X + 1 + k, Z + 2 + i * 5); }));
          for (const z of [Z + 4, Z + 5]) side('panel', X, z, -1, 0);
          for (const x of [X + 1, X + 2]) one('billets', x, Z + 9);
          for (const x of [X + 9, X + 10]) one('coils', x, Z + 9);
        },
        loading(rm) {
          const X = rm.x, Z = rm.z, E = X + rm.w - 1, B = Z + rm.h - 1, stock = ['billets', 'billets', 'ingots', 'coils', 'coils', 'crates', 'pallet'];
          for (let z = Z + 1; z < B; z++) side('palletrack', E, z, 1, 0);
          let n = 2;
          for (const [x, z] of [[X + 6, Z + 2], [X + 8, Z + 4], [X + 1, Z + 5], [X + 13, Z + 2]]) if (n > 0 && long('forklift', x, z, r() < 0.5 ? 0 : 2)) n--;
          for (const z of [Z + 2, Z + 3, Z + 5]) for (const [x0, x1] of [[X + 2, X + 4], [X + 10, X + 12]]) for (let x = x0; x <= x1; x++) if (r() < 0.8) one(U.pick(r, stock), x, z, r() < 0.5 ? 0 : 2);
        },
        control(rm) {
          for (let z = rm.z; z < rm.z + rm.h; z++) for (const [x, dx] of [[rm.x, -1], [rm.x + rm.w - 1, 1]]) if (t[z * W + x + dx] !== 3) side('console', x, z, dx, 0);
          side('panel', rm.x + 1, rm.z, 0, -1);
        },
        restroom(rm) {
          const xs = [...Array(rm.w).keys()].map((i) => rm.x + i), door = xs.find((x) => t[(rm.z + rm.h) * W + x] === 3);
          for (const x of xs) if (x !== door) side('stall', x, rm.z, 0, -1);
          if (door != null) side('sinks', door, rm.z, 0, -1);
        },
        carpark(rm) {
          const z = rm.z + rm.h - 2;
          for (let x = rm.x + 1; x < rm.x + rm.w - 1; x += 2) if (r() < 0.6) long('car', x, z, r() < 0.5 ? 0 : 2);
        },
      };
    }
    const fest = map.theme.layout === 'festival' ? festival() : null, fdy = map.theme.layout === 'foundry' ? foundry() : null;
    let nFine = 0; // (pieces laid on the fine grid: kept past the tiles' own keys)
    for (const rm of rooms) {
      rm.type = rm.type || (r() < home ? homes[hi++ % homes.length] : WORK[wi++ % WORK.length]);
      if (fest && fest[rm.type]) { fest[rm.type](rm); continue; }
      if (fdy && fdy[rm.type]) { fdy[rm.type](rm); continue; }
      // patrol cars where the layout puts them: [x, z, along] (coarse tiles; along: lengthwise down the road, else across)
      for (const [x, z, along] of rm.cars || []) {
        const [x2, z2] = along ? [x + 1, z] : [x, z + 1];
        if (t[z * W + x] !== 0 || t[z2 * W + x2] !== 0 || !tryBlock(x, z, 2)) continue;
        tryBlock(x2, z2, 2); // (its far half: the car's own boxes are what stop you either way)
        put('police', x, z, along ? (x + 1) * TS : (x + 0.5) * TS, along ? (z + 0.5) * TS : (z + 1) * TS, along ? (r() < 0.5 ? 1 : 3) : (r() < 0.5 ? 0 : 2), r());
      }
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
      // a convenience store (js/level.js layMart): the shop floor's aisles of low shelving (a cross-aisle through
      // them) and shelving down its west wall; the cashier's counter along the inside of its glass, the till at
      // the end by the door; racks along the back wall of the freezer and of the stockroom (the rest of the
      // stockroom's walls left for the weapon case, the attachments box and the first aid cabinet)
      const C2 = (v) => (v + 0.5) * TS, against = (name, x, z, dx, dz) => { const off = 1 - 0.02 - R[name].d / 2; put(name, x, z, C2(x) + dx * off, C2(z) + dz * off, facing(dx, dz), r(), [[dx, dz]]); };
      // (the shop and the booth: laid on the fine grid, 2/3 m, in metres, each piece blocking what it stands on: block)
      const lay = (name, x, z, q) => { const rec = R[name], v = r(); map.props.set(W * map.H + nFine++, { name, q, x, z, v, block: rec.small ? 0 : rec.cover ? 2 : 4, boxes: worldBoxes(rec, x, z, q, v) }); };
      const F = 2 / 3, opn = (x, z) => x >= 0 && z >= 0 && x < W && z < map.H && t[z * W + x] !== 1; // (the room as it'll be: grown into the walls it shares, which thin)
      const x0 = rm.x * TS - (opn(rm.x - 2, rm.cz) ? F : 0), x1 = (rm.x + rm.w) * TS + (opn(rm.x + rm.w + 1, rm.cz) ? F : 0), z0 = rm.z * TS - (opn(rm.cx, rm.z - 2) ? F : 0), z1 = (rm.z + rm.h) * TS + (opn(rm.cx, rm.z + rm.h + 1) ? F : 0);
      if (rm.type === 'mart') {
        // shelving down the west wall; three aisles of it across the floor (each 1.2 m, 1.5 m between: two cells), a
        // way round the back by the coolers and along the front, an endcap at the front of each; the ATM by the till
        for (let z = z0 + 1; z < z1 - 1.5; z += 2) lay('shopwall', x0 + 0.26, z, facing(-1, 0));
        for (let i = 0; i < 3; i++) {
          const x = x0 + 4 * F + i * 4 * F;
          for (const z of [z0 + 5 * F, z0 + 9 * F]) lay('aisle', x, z, 1);
          lay('endcap', x, z0 + 11 * F + 0.26, 0);
        }
        lay('atm', x1 - 0.32, z1 - 0.62, facing(1, 0));
        continue;
      }
      if (rm.type === 'cashier') {
        // the counter along the inside of the glass (the till nearest the door), the cigarettes on the back wall
        const door = [...Array(rm.h).keys()].map((i) => rm.z + i).find((z) => t[z * W + rm.x - 1] === 3), dz0 = door * TS - 0.3, dz1 = (door + 1) * TS + 0.3;
        let first = true;
        for (let z = z0 + 1; z + 1 <= z1; z += 2) { if (z + 1 > dz0 && z - 1 < dz1) continue; lay(first ? 'register' : 'counter', x0 + 0.33, z, facing(-1, 0)); first = false; }
        for (let z = z0 + 2; z + 1 <= z1; z += 2) lay('tobacco', x1 - 0.23, z, facing(1, 0));
        continue;
      }
      if (rm.type === 'lot' && map.theme.starter) { // (the corner store's: the ice chest against the front wall, clear of the door)
        const dx = [...Array(W).keys()].find((x) => t[(rm.z - 1) * W + x] === 3), x = dx != null && dx * TS < 5 ? 10.6 : 3.2;
        lay('icechest', x, rm.z * TS - F + 0.4, 0);
      }
      if (rm.type === 'freezer' || rm.type === 'stockroom') {
        for (let x = rm.x + (rm.type === 'stockroom' ? 1 : 0); x < rm.x + rm.w; x += 2) if (tryBlock(x, rm.z, 4)) against('rack', x, rm.z, 0, -1);
        if (rm.type === 'stockroom') { const x = rm.x + rm.w - 1, z = rm.z + rm.h - 1; if (tryBlock(x, z, 2)) put('crates', x, z, C2(x), C2(z), Math.floor(r() * 4), r()); }
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
  // Packaging: an atlas of printed labels, PACK_N x PACK_N of them, each a product's face (a colour, a band across it,
  // a maker's mark, lines of type, a printed edge), in the colours print has, not pure ones (made once, kept). A piece
  // of stock takes one of them over every face (k.boxL, k.cylL): it reads as a packet, a tin, a bottle with a label,
  // not a block of colour, and the light falls on card and paper, matte.
  const PACK_N = 8;
  let packTex = null;
  function packaging() {
    if (packTex) return packTex;
    const S = 128, c = document.createElement('canvas'); c.width = c.height = S * PACK_N;
    const g = c.getContext('2d'), rnd = G.U.rng(0x9ac4a6e);
    const INK = ['#b8392e', '#d8a632', '#2c5aa6', '#2f8a48', '#d0702c', '#6c3a9a', '#26262a', '#b8386e', '#3a9a9e', '#9a7238', '#e8e2d2', '#5a2a22', '#c8c03a', '#1e3a5e', '#e6d9b8', '#8a1e24'];
    const pick = (a) => a[Math.floor(rnd() * a.length)];
    for (let ty = 0; ty < PACK_N; ty++) for (let tx = 0; tx < PACK_N; tx++) {
      const x0 = tx * S, y0 = ty * S, bg = pick(INK);
      let a = pick(INK); while (a === bg) a = pick(INK);
      g.save(); g.beginPath(); g.rect(x0, y0, S, S); g.clip();
      g.fillStyle = bg; g.fillRect(x0, y0, S, S);
      const sh = g.createLinearGradient(0, y0, 0, y0 + S); sh.addColorStop(0, 'rgba(255,255,255,0.10)'); sh.addColorStop(1, 'rgba(0,0,0,0.14)'); g.fillStyle = sh; g.fillRect(x0, y0, S, S);
      const style = rnd(), light = ['#e8e2d2', '#e6d9b8', '#c8c03a', '#d8a632'].includes(bg), type = light ? '#2a2420' : '#f0ebe0';
      if (style < 0.4) { // a band across the middle, the mark on it
        const by = y0 + S * (0.3 + rnd() * 0.15), bh = S * (0.22 + rnd() * 0.12);
        g.fillStyle = rnd() < 0.5 ? '#ece6d8' : a; g.fillRect(x0, by, S, bh);
        g.fillStyle = rnd() < 0.5 ? bg : '#26262a'; g.font = `bold ${Math.round(bh * 0.62)}px sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
        g.fillText(pick(['CRISP', 'ZAP', 'MAXI', 'GOLD', 'FRESH', 'KO', 'BOLT', 'RUSH', 'PURE', 'MEGA', 'SNAX', 'FIZZ']), x0 + S / 2, by + bh / 2, S * 0.9);
      } else if (style < 0.7) { // a round mark, a burst of colour behind it
        const cx = x0 + S * (0.35 + rnd() * 0.3), cy = y0 + S * (0.35 + rnd() * 0.2), r = S * (0.18 + rnd() * 0.1);
        g.fillStyle = a; g.beginPath(); g.ellipse(cx, cy, r * 1.3, r, 0, 0, 7); g.fill();
        g.fillStyle = '#ece6d8'; g.beginPath(); g.ellipse(cx, cy, r * 0.8, r * 0.55, 0, 0, 7); g.fill();
        g.fillStyle = a; g.font = `bold ${Math.round(r * 0.6)}px sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(pick(['Co', 'No.1', 'Hi', 'XL', 'OK', '99']), cx, cy, r * 1.4);
      } else { // a window onto the product: a lighter panel, a shape in it
        const px = x0 + S * 0.18, py = y0 + S * 0.3, pw = S * 0.64, ph = S * 0.4;
        g.fillStyle = '#e8dcc0'; g.fillRect(px, py, pw, ph);
        g.fillStyle = pick(['#a8642a', '#c89a4a', '#7a3a22', '#d8b060', '#6a8a3a']);
        for (let i = 0; i < 5; i++) { g.beginPath(); g.ellipse(px + pw * (0.15 + rnd() * 0.7), py + ph * (0.25 + rnd() * 0.5), pw * 0.12, ph * 0.18, rnd() * 3, 0, 7); g.fill(); }
        g.fillStyle = a; g.fillRect(x0, y0 + S * 0.08, S, S * 0.16);
      }
      g.fillStyle = type; g.globalAlpha = 0.8; // lines of type
      for (let i = 0; i < 3; i++) g.fillRect(x0 + S * 0.14, y0 + S * (0.76 + i * 0.06), S * (0.3 + rnd() * 0.5), S * 0.025);
      g.globalAlpha = 1;
      g.fillStyle = a; g.fillRect(x0, y0 + S * 0.94, S, S * 0.06); // the printed edge
      g.restore();
    }
    packTex = new THREE.CanvasTexture(c); packTex.anisotropy = 4;
    return packTex;
  }
  // a geometry's UVs (0..1 a face) squeezed onto one label of the atlas (a little in from its edges: no neighbour bleeds in)
  function labelUV(geo, i) {
    const uv = geo.attributes.uv, n = PACK_N, u0 = (i % n) / n, v0 = 1 - (Math.floor(i / n) + 1) / n, s = (1 - 0.06) / n, o = 0.03 / n;
    for (let j = 0; j < uv.count; j++) uv.setXY(j, u0 + o + uv.getX(j) * s, v0 + o + uv.getY(j) * s);
    return geo;
  }

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
    // (its pictures sampled as written, sRGB, mixed with the colours below as they're written, and the result turned
    // linear at the end: js/util.js)
    const mk = (w, h, draw) => { const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h); const t = new THREE.CanvasTexture(c); t.encoding = THREE.LinearEncoding; t.wrapS = THREE.RepeatWrapping; t.anisotropy = 4; return t; };
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
          gl_FragColor = linearToOutputTexel(vec4(pow(col * 0.9 + vec3(0.02, 0.025, 0.035) + fres * 0.06, vec3(2.2)), 1.0));
        }`,
    });
  }

  function build(map, root, crateTex) {
    const T = THREE, L = G.Level, TS = L.TS, { W, t } = map;
    // (the one stream everything's looks draw on, in turn, so a room that's built differently would change every room
    // after it. A resident's room: what it would have been is still built, into nothing (sink), and what's really there
    // draws on a stream of its own (cur). Every other room comes out the same, Harold's or no.)
    const rnd0 = G.U.rng((map.seed ^ 0x5eed1e) >>> 0);
    let cur = rnd0, sink = false;
    const rnd = () => cur();
    // A piece's colour goes in its vertices: what's drawn is one material per finish (roughness, metalness, texture,
    // glow), not one per colour as well, so a houseful of furniture is a few dozen draw calls, not hundreds.
    // (mat() still hands back a material of that colour, to be read and tinted; base is what it's drawn with.)
    const cache = new Map(), base = new Map(), finish = new Map();
    const texIds = new Map(), texId = (t) => { if (!texIds.has(t)) texIds.set(t, texIds.size); return texIds.get(t); }; // (by the texture itself, not its uuid)
    const mat = (hex, rough = 0.8, metal = 0, extra) => {
      const fk = rough + '|' + metal + (extra ? JSON.stringify(Object.keys(extra)) + (extra.map ? texId(extra.map) : '') + (extra.emissive || '') : ''), key = hex + '|' + fk;
      let m = cache.get(key);
      if (!m) {
        m = new T.MeshStandardMaterial(Object.assign({ color: hex, roughness: rough, metalness: metal }, extra || {})); cache.set(key, m);
        if (!finish.has(fk)) finish.set(fk, new T.MeshStandardMaterial(Object.assign({ color: 0xffffff, roughness: rough, metalness: metal, vertexColors: true }, extra || {})));
        base.set(m, finish.get(fk));
      }
      return m;
    };
    const tint = (hex, f) => { const c = new T.Color(hex); c.r = Math.min(1, c.r * f); c.g = Math.min(1, c.g * f); c.b = Math.min(1, c.b * f); return c.getHex(); };
    const pick = (a) => a[Math.floor(rnd() * a.length)];
    // everything static is merged into one mesh per material
    const byMat = new Map();
    const add = (geo, m, matrix) => {
      if (sink) { geo.dispose(); return; }
      const g2 = geo.index ? geo.toNonIndexed() : geo;
      g2.applyMatrix4(matrix);
      const b = base.get(m) || m;
      if (b !== m) g2.userData.col = m.color; // (its colour, for its vertices: the merge below)
      if (!byMat.has(b)) byMat.set(b, []);
      byMat.get(b).push(g2);
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
      cylX: (m, rt, rb, h, x, y, z, seg = 14) => place(new T.CylinderGeometry(rt, rb, h, seg), m, x, y, z, Math.PI / 2, Math.PI / 2), // (lying along x)
      sph: (m, r, x, y, z) => place(new T.SphereGeometry(r, 8, 6), m, x, y, z),
      ico: (m, r, x, y, z) => place(new T.IcosahedronGeometry(r, 0), m, x, y, z, rnd() * 6),
      leaf: () => mat(pick([0x3f6b35, 0x4d7a3a, 0x2f5a2c, 0x5a8040]), 0.85, 0, { flatShading: true }),
      screen: () => mat(0x0b0f14, 0.15, 0.2, { emissive: pick([0x1a2a3a, 0x0c1622, 0x202a20]), emissiveIntensity: 0.6 }),
      shade: () => shadeMat,
      crate: () => mat(0xffffff, 0.8, 0, { map: crateTex }),
      // stock: one of the packaging atlas' labels (packaging()) over a box or a cylinder; its material by what it's made
      // of (card and paper, a tin, a plastic bottle), each a little lighter or darker (shade: in the shadow of a shelf)
      pack: (kind, shade = 1) => mat(tint(0xffffff, (0.86 + rnd() * 0.14) * shade), kind === 'tin' ? 0.42 : kind === 'bottle' ? 0.3 : 0.82, kind === 'tin' ? 0.15 : 0, { map: packaging() }),
      label: () => Math.floor(rnd() * PACK_N * PACK_N),
      boxL: (m, lb, w, h, d, x, y, z, ry, rx) => place(labelUV(new T.BoxGeometry(w, h, d), lb), m, x, y, z, ry, rx),
      cylL: (m, lb, rt, rb, h, x, y, z, seg = 14) => place(labelUV(new T.CylinderGeometry(rt, rb, h, seg), lb), m, x, y, z),
      tableLamp(x, y, z) { k.cyl(mat(pick([0x2a2a2a, 0xb8a060, 0xe8e4da, 0x6d7b66]), 0.4, 0.3), 0.05, 0.08, 0.22, x, y + 0.11, z); k.cyl(shadeMat, 0.1, 0.16, 0.2, x, y + 0.31, z); },
      plantSmall(x, y, z) { k.cyl(mat(pick([0xa0522d, 0xe8e4da, 0x2f3a40]), 0.7), 0.07, 0.055, 0.12, x, y + 0.06, z); for (let i = 0; i < 3; i++) k.ico(k.leaf(), 0.06 + rnd() * 0.04, x + (rnd() - 0.5) * 0.06, y + 0.16 + rnd() * 0.08, z + (rnd() - 0.5) * 0.06); },
      fruit(x, y, z) { k.cyl(mat(pick([0xe8e4da, 0x6b4428, 0x3a5a6a]), 0.4), 0.13, 0.08, 0.06, x, y + 0.03, z); for (let i = 0; i < 4; i++) k.sph(mat(pick([0xd8642a, 0xc0302a, 0x8fb040, 0xe8c040]), 0.5), 0.04, x + (rnd() - 0.5) * 0.12, y + 0.08, z + (rnd() - 0.5) * 0.12); },
    };

    // furniture
    for (const p of map.propList || new Set(map.props.values())) {
      frame = new T.Matrix4().compose(new T.Vector3(p.x, 0, p.z), new T.Quaternion().setFromAxisAngle(new T.Vector3(0, 1, 0), p.q * Math.PI / 2), new T.Vector3(1, 1, 1));
      sink = !!p.gone; cur = p.own ? G.U.rng(Math.floor(p.v * 4294967295)) : rnd0; // (p.gone, p.own: js/homes.js)
      R[p.name].build(k, p.v, p.style);
    }
    sink = false; cur = rnd0;
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
    // a floor covering over a room (a lawn runs under the fences to the edge; inside, the floor stops at the walls)
    const layFloor = (rm, fm) => {
      const x0 = rm.x * TS, z0 = rm.z * TS, w = rm.w * TS, d = rm.h * TS;
      let drop = false;
      for (let z = rm.z; z < rm.z + rm.h && !drop; z++) for (let x = rm.x; x < rm.x + rm.w; x++) if (t[z * W + x] === 5) { drop = true; break; }
      if (rm.out) place(new T.PlaneGeometry(w + 2 * TS, d + TS), fm, x0 + w / 2, 0.004, z0 + d / 2, 0, -Math.PI / 2);
      else if (!drop) place(new T.PlaneGeometry(w, d), fm, x0 + w / 2, 0.004, z0 + d / 2, 0, -Math.PI / 2);
      else for (let z = rm.z; z < rm.z + rm.h; z++) for (let x = rm.x; x < rm.x + rm.w;) { // (round a drop in the floor: a strip per run of floor)
        if (t[z * W + x] === 5) { x++; continue; }
        let x1 = x; while (x1 + 1 < rm.x + rm.w && t[z * W + x1 + 1] !== 5) x1++;
        const g = new T.PlaneGeometry((x1 - x + 1) * TS, TS), uv = g.attributes.uv;
        for (let k = 0; k < uv.count; k++) uv.setXY(k, (x - rm.x + uv.getX(k) * (x1 - x + 1)) / rm.w, (rm.z + rm.h - 1 - z + uv.getY(k)) / rm.h); // (the room's texture, continuous across strips)
        place(g, fm, (x + x1 + 1) / 2 * TS, 0.004, (z + 0.5) * TS, 0, -Math.PI / 2);
        x = x1 + 1;
      }
    };
    // A resident's room (js/homes.js, rm.dress): its floor, its trim round the walls, what hangs on them. Its walls and
    // ceiling are G.Level.buildMesh's; its furniture went by with the rest.
    const dressRoom = (rm) => {
      const dr = rm.dress, f = dr.floor;
      cur = G.U.rng((map.seed ^ Math.imul(rm.z * W + rm.x + 1, 0x9e3779b1)) >>> 0);
      const tex = tx[f.kind](f.color, f.grout || '#7a7670');
      tex.repeat.set(rm.w, rm.h);
      const fm = mat(0xffffff, f.kind === 'tile' ? 0.45 : 0.85, 0, { map: tex }), mine = new Set(dr.cells);
      layFloor(rm, fm);
      const trim = mat(parseInt(dr.trim.slice(1), 16), 0.5);
      for (const i of dr.cells) {
        const x = i % W, z = (i / W) | 0;
        if (t[i] === 1 || t[i] === 5) continue;
        if (!inRoom(rm, x, z)) { // (a strip off the side of the room: the room's floor carried on over it)
          const g = new T.PlaneGeometry(TS, TS), uv = g.attributes.uv;
          for (let n = 0; n < uv.count; n++) uv.setXY(n, (x - rm.x + uv.getX(n)) / rm.w, (rm.z + rm.h - 1 - z + uv.getY(n)) / rm.h);
          place(g, fm, (x + 0.5) * TS, 0.004, (z + 0.5) * TS, 0, -Math.PI / 2);
        }
        for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          if (mine.has(z * W + x + dx + dz * W) || L.tile(map, x + dx, z + dz) !== 1) continue;
          place(new T.BoxGeometry(TS, 0.14, 0.03), trim, (x + 0.5) * TS + dx * (TS / 2 - 0.02), 0.07, (z + 0.5) * TS + dz * (TS / 2 - 0.02), Math.atan2(-dx, -dz));
        }
      }
      for (const h of dr.hung) {
        frame = new T.Matrix4().compose(new T.Vector3(h.x, 0, h.z), new T.Quaternion().setFromAxisAngle(new T.Vector3(0, 1, 0), h.q * Math.PI / 2), new T.Vector3(1, 1, 1));
        R[h.name].build(k, h.v, h.style);
      }
      frame = new T.Matrix4(); cur = rnd0;
    };
    for (const rm of map.rooms) {
      const spec = ROOMS[rm.type] || {};
      const x0 = rm.x * TS, z0 = rm.z * TS, w = rm.w * TS, d = rm.h * TS;
      if (rm.dress) { G.Homes.swap(map, rm); sink = true; } // (the room as it would have been, for the stream's sake)
      if (spec.floor) {
        let tex;
        if (spec.floor === 'wood') tex = tx.wood(pick(['#7a5232', '#9a6e44', '#5e4028', '#a88458']));
        else if (spec.floor === 'grass') tex = tx.grass();
        else if (spec.floor === 'pave') tex = tx.tile(pick(['#55524c', '#4a4844', '#5e5a52']), '#34322e');
        else if (spec.floor === 'tile') tex = tx.tile(pick(['#d8d4cc', '#b8c0c4', '#e4dccc', '#3a3d40']), '#7a7670');
        else tex = tx.carpet(pick(['#5a5f6a', '#6a5a4a', '#4a5a52', '#7a6e62', '#3d4452']));
        tex.repeat.set(rm.w, rm.h);
        if (spec.floor === 'wood' && rnd() < 0.5) { tex.rotation = Math.PI / 2; }
        layFloor(rm, mat(0xffffff, spec.floor === 'tile' ? 0.45 : spec.floor === 'grass' ? 1 : 0.85, 0, { map: tex }));
      }
      if (rm.out) continue; // no rugs, skirting, pictures or windows out in the garden
      if (spec.rug && rnd() < spec.rug && rm.w >= 3 && rm.h >= 3) {
        const rw = Math.min(3.6, w - 2.4), rd = Math.min(2.6, d - 2.4);
        const rt = tx.rug(pick(['#7a2e2e', '#2e4a6a', '#5a4a3a', '#3a5a4a', '#6a5a7a']), pick(['#d8c8a0', '#c0a060', '#e8e0d0']), pick(['#2a2a2a', '#5a2a1a', '#1a2a3a']));
        place(new T.PlaneGeometry(rw, rd), mat(0xffffff, 1, 0, { map: rt }), x0 + w / 2, 0.008, z0 + d / 2, rnd() < 0.5 ? 0 : Math.PI / 2, -Math.PI / 2);
      }
      let pics = 0, wins = 0, clock = rm.type === 'kitchen' || rm.type === 'office' || rm.type === 'breakroom';
      for (let z = rm.z; z < rm.z + rm.h; z++) for (let x = rm.x; x < rm.x + rm.w; x++) {
        if (t[z * W + x] === 1 || t[z * W + x] === 5) continue; // a wall corner inside the room's rectangle (or a drop)
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
          } else if (pics < 3 && v < 0.5 && rm.type !== 'washroom' && rm.type !== 'cubicle' && !spec.noArt) { // (no art in a toilet block)
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
      if (rm.dress) { G.Homes.swap(map, rm); sink = false; dressRoom(rm); }
    }

    // merge
    for (const [m, geos] of byMat) {
      let n = 0; for (const g of geos) n += g.attributes.position.count;
      const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), uv = new Float32Array(n * 2), col = m.vertexColors ? new Float32Array(n * 3) : null;
      let o = 0;
      for (const g of geos) {
        const c = g.attributes.position.count;
        pos.set(g.attributes.position.array, o * 3); nor.set(g.attributes.normal.array, o * 3);
        if (g.attributes.uv) uv.set(g.attributes.uv.array, o * 2);
        if (col) { const k = g.userData.col; for (let i = o; i < o + c; i++) { col[i * 3] = k.r; col[i * 3 + 1] = k.g; col[i * 3 + 2] = k.b; } }
        o += c; g.dispose();
      }
      const bg = new T.BufferGeometry();
      bg.setAttribute('position', new T.BufferAttribute(pos, 3));
      bg.setAttribute('normal', new T.BufferAttribute(nor, 3));
      bg.setAttribute('uv', new T.BufferAttribute(uv, 2));
      if (col) bg.setAttribute('color', new T.BufferAttribute(col, 3));
      bg.computeBoundingSphere();
      root.add(new T.Mesh(bg, m));
    }
  }

  return { plan, build, R, ROOMS, worldBoxes, facing, outsideMaterial, textures };
})();
