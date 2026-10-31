'use strict';
// Who lives in the apartments (docs/apartment-personas/). The block's layout knows nothing of them: its walls, doors,
// lofts and stairs, its rooms' types and everything planned on them come first (js/level.js layApartments, plan, finish).
// Then, floor by floor, fill() goes through the homes and now and then one gets a resident, from the level's seed alone
// (start()), and that resident's rooms are done over to suit whatever size and shape they turned out:
//   the room's own furniture comes out, and what's on its list goes in against walls that are really free, one piece
//   at a time, biggest say first, each kept clear of doors, windows, the weapon case and the like, and each only if every
//   cell that could be walked to still can be. What doesn't fit is swapped for what's next on its list, or left out.
//   rm.dress holds what's left to draw: the wall, ceiling, trim and floor colours and what hangs on the walls. Walls:
//   js/lightgrid.js (from paint()); ceilings: js/level.js buildMesh; floor, trim, hung things: js/furniture.js dressRoom.
// All of it's on its own random streams and comes after everything else, so a home that gets a resident changes nothing
// outside the rooms it redoes.
//
// RESIDENTS is the data: adding a resident is adding an entry (and any new pieces, below, and their js/materials.js PROPS).
//   home: 'flat' a single-floor home, 'loft' a home with a loft
//   rate: the chance, each eligible home, of it being theirs (at most once a level)
//   rooms: by room type: { wall, ceil, trim (hex strings), paper (the walls striped, as wallpaper),
//     floor: { kind (a texture of js/furniture.js textures), color },
//     items: what goes in, in order: { id, piece, style?, at, hang?, need?, pull?, swap? }
//       piece: a name in G.Furniture.R; style: handed to its build
//       at: 'long': the wall with the most free run of it. 'facing:id', 'cross:id': the wall opposite that item's, one
//         across it. 'beside:id', 'away:id': as near to it, as far from it, as there's room. 'corner': in a corner.
//         'wall': anywhere, spread round the room
//       hang: hung at this height on a free wall, not over a window or anything that tall (no collision: as a picture)
//       pull: stood this far out from the wall, if the room's deep enough to walk round behind it
//       need: without this the room's not theirs after all (the home's left as it was)
//       swap: what to try instead, smaller (a list of { piece, style, at }) } }
// A home needs all the room types its resident lists: a room type left out stays as the level made it.
G.Homes = (() => {
  const U = G.U, F = G.Furniture, R = F.R;
  const RESIDENTS = [
    { id: 'harold', name: 'Harold Pruitt', home: 'flat', rate: 0.08, rooms: {
      living: { wall: '#d6c68c', paper: 1, ceil: '#d9d0b0', trim: '#7a4e2d', floor: { kind: 'carpet', color: '#6b4a3a' }, items: [
        { id: 'sofa', piece: 'couch', at: 'long', pull: 1.3, style: { fabric: 0x8f7230 }, swap: [{ piece: 'easy', style: { fabric: 0x8f7230 } }] },
        { id: 'tv', piece: 'crt', at: 'facing:sofa' },
        { id: 'his', piece: 'easy', at: 'cross:sofa', need: 1, style: { fabric: 0x6e5a3e, worn: 0xa89a7c, slippers: 1 } }, // (worn bald: his)
        { id: 'cups', piece: 'cuptable', at: 'beside:his' },
        { id: 'hers', piece: 'easy', at: 'away:his', style: { fabric: 0xc8601e, vinyl: 1 } }, // (orange vinyl, hers, untouched)
        { id: 'lamp', piece: 'lamp', at: 'beside:sofa' },
        { id: 'china', piece: 'china', at: 'wall', swap: [{ piece: 'sidetable' }] },
        { id: 'sewing', piece: 'treadle', at: 'wall', swap: [{ piece: 'guides' }] },
        { id: 'plant', piece: 'tallplant', at: 'corner', swap: [{ piece: 'tallplant', at: 'wall' }] },
        { id: 'guides', piece: 'guides', at: 'beside:his' },
        { id: 'sign', piece: 'enamel', hang: 1.72, at: 'wall' },
        { id: 'clock', piece: 'clockshelf', hang: 1.5, at: 'wall' },
        { id: 'calendar', piece: 'calendar', hang: 1.55, at: 'beside:his' },
        { id: 'photo', piece: 'photo', hang: 1.6, at: 'wall' },
      ] },
    } },
  ];

  // ---------------------------------------------------------------- pieces
  // As js/furniture.js R: back at -z, against the wall. Their colours and what makes them theirs come in `style`.
  // A deep old sofa, a crocheted throw of squares over its back and down onto the seat
  R.couch = { w: 2.0, d: 0.92, cover: 1, boxes: [[0, 0, 2.0, 0.92, 0.88]], build(k, v, s) {
    const f = k.mat(s.fabric, 0.95), f2 = k.mat(k.tint(s.fabric, 1.14), 0.95), dark = k.mat(0x3a2414, 0.5);
    for (const x of [-0.88, 0.88]) for (const z of [-0.38, 0.38]) k.box(dark, 0.07, 0.1, 0.07, x, 0.05, z);
    k.box(f, 2.0, 0.32, 0.92, 0, 0.26, 0);
    for (const x of [-0.42, 0.42]) k.box(f2, 0.82, 0.14, 0.66, x, 0.49, 0.1);
    for (const x of [-0.42, 0.42]) k.box(f2, 0.8, 0.42, 0.18, x, 0.7, -0.26, 0, -0.12);
    k.box(f, 1.7, 0.56, 0.16, 0, 0.62, -0.38);
    for (const x of [-0.92, 0.92]) { k.box(f, 0.18, 0.3, 0.92, x, 0.54, 0); k.cyl(f2, 0.1, 0.1, 0.92, x, 0.69, 0, 8, Math.PI / 2); } // (rolled arms)
    const yarn = [0xe6dcc4, 0xb5492a, 0x6f7a3c, 0xd2a03c, 0xe6dcc4].map((c) => k.mat(c, 1)), cols = 7, sq = 0.145, x0 = 0.42 - ((cols - 1) * sq) / 2;
    for (let i = 0; i < cols; i++) {
      const x = x0 + i * sq;
      for (const [y, z, rx] of [[0.97, -0.34, 0], [0.82, -0.27, -0.2], [0.68, -0.2, -0.2], [0.565, -0.09, 1.45], [0.565, 0.06, 1.45]]) k.box(k.pick(yarn), sq - 0.008, 0.145, 0.018, x, y, z, 0, rx);
    }
  } };
  // A wing chair. style: fabric; worn: the bald patches on its seat, back and arms; vinyl: shiny and hardly sat in; slippers
  R.easy = { w: 0.84, d: 0.86, cover: 1, boxes: [[0, 0, 0.84, 0.86, 1.02]], build(k, v, s) {
    const rough = s.vinyl ? 0.3 : 0.95, f = k.mat(s.fabric, rough), f2 = k.mat(k.tint(s.fabric, s.vinyl ? 1.08 : 1.12), rough), dark = k.mat(0x2e1d10, 0.5);
    for (const x of [-0.34, 0.34]) for (const z of [-0.36, 0.36]) k.box(dark, 0.06, 0.1, 0.06, x, 0.05, z);
    k.box(f, 0.84, 0.3, 0.86, 0, 0.25, 0);
    k.box(f2, 0.54, 0.13, 0.64, 0, 0.465, 0.09);
    k.box(f, 0.56, 0.72, 0.18, 0, 0.66, -0.33);
    for (const x of [-0.345, 0.345]) { k.box(f, 0.15, 0.26, 0.82, x, 0.53, 0.02); k.box(f, 0.14, 0.34, 0.2, x * 0.98, 0.84, -0.3); } // (arms, and the wings at the head)
    if (s.worn) {
      const b = k.mat(s.worn, 1);
      k.box(b, 0.36, 0.006, 0.4, 0, 0.533, 0.12);
      k.box(b, 0.3, 0.34, 0.006, 0, 0.74, -0.238);
      for (const x of [-0.345, 0.345]) k.box(b, 0.1, 0.006, 0.34, x, 0.663, 0.2);
    }
    if (s.slippers) { // one pair, side by side, ready for the morning
      const sl = k.mat(0x6a4a3a, 0.9), sole = k.mat(0x2a2018, 0.9);
      for (const x of [-0.11, 0.11]) { k.box(sole, 0.1, 0.02, 0.27, x, 0.01, 0.62); k.box(sl, 0.095, 0.055, 0.15, x, 0.045, 0.56); }
    }
  } };
  // A small boxy television on a little table, its aerial up
  R.crt = { w: 0.72, d: 0.52, boxes: [[0, 0, 0.72, 0.52, 0.56], [0, 0, 0.56, 0.46, 1.06]], build(k) {
    const w = k.mat(0x6b4428, 0.55), case_ = k.mat(0x4a3320, 0.5), black = k.mat(0x151515, 0.4), metal = k.mat(0xb0b0a8, 0.3, 0.8);
    k.box(w, 0.72, 0.03, 0.52, 0, 0.545, 0);
    for (const x of [-0.32, 0.32]) for (const z of [-0.22, 0.22]) k.box(w, 0.04, 0.53, 0.04, x, 0.265, z);
    k.box(w, 0.62, 0.02, 0.42, 0, 0.16, 0);
    k.box(case_, 0.56, 0.44, 0.44, 0, 0.78, 0);
    k.box(black, 0.4, 0.33, 0.01, -0.05, 0.78, 0.222);
    k.box(k.screen(), 0.36, 0.29, 0.006, -0.05, 0.78, 0.228);
    for (const y of [0.87, 0.77]) k.cyl(k.mat(0xc8b890, 0.4), 0.022, 0.022, 0.02, 0.21, y, 0.23, 10, Math.PI / 2);
    k.box(metal, 0.06, 0.02, 0.05, 0, 1.01, 0);
    for (const s of [-1, 1]) k.box(metal, 0.006, 0.42, 0.006, s * 0.09, 1.2, 0, s * Math.PI / 2, 0.4); // (rabbit ears)
    k.box(k.mat(0xe0d8c0, 0.8), 0.46, 0.012, 0.3, 0, 0.56, 0.0); // (a lace runner under it)
  } };
  // A glass-fronted china cabinet: a cupboard under, shelves of white plates behind the glass
  R.china = { w: 1.2, d: 0.42, cover: 1, boxes: [[0, 0, 1.2, 0.42, 1.86]], build(k) {
    const w = k.mat(0x4d2f1c, 0.45), face = k.mat(0x5e3a22, 0.45), back = k.mat(0x2a1a10, 0.8), brass = k.mat(0xb8a060, 0.3, 0.9);
    const plate = k.mat(0xf0ece0, 0.3), rim = k.mat(0x3a5a8a, 0.4), glass = k.mat(0xc4d6dc, 0.08, 0.2, { transparent: true, opacity: 0.16, depthWrite: false });
    k.box(w, 1.2, 0.74, 0.42, 0, 0.37, 0);
    for (const x of [-0.295, 0.295]) { k.box(face, 0.56, 0.62, 0.012, x, 0.38, 0.214); k.sph(brass, 0.016, x + (x < 0 ? 0.22 : -0.22), 0.42, 0.226); }
    k.box(back, 1.14, 1.04, 0.02, 0, 1.26, -0.19);
    for (const x of [-0.585, 0.585]) k.box(w, 0.03, 1.08, 0.42, x, 1.28, 0);
    k.box(w, 1.26, 0.06, 0.46, 0, 1.83, 0);
    k.box(w, 1.14, 0.03, 0.38, 0, 0.755, 0);
    for (const y of [1.08, 1.42]) k.box(w, 1.14, 0.02, 0.36, 0, y, 0);
    for (const y of [0.775, 1.095, 1.435]) for (let i = 0; i < 4; i++) {
      const x = -0.42 + i * 0.28, r = 0.1 + (i % 2) * 0.015;
      k.cyl(rim, r, r, 0.012, x, y + r + 0.012, -0.1, 16, Math.PI / 2 - 0.15);
      k.cyl(plate, r - 0.012, r - 0.012, 0.014, x, y + r + 0.012, -0.098, 16, Math.PI / 2 - 0.15);
      k.cyl(plate, 0.035, 0.03, 0.05, x + 0.13, y + 0.03, 0.08, 10);
    }
    for (const x of [-0.57, -0.19, 0.19, 0.57]) k.box(w, 0.025, 1.04, 0.02, x, 1.28, 0.2);
    for (const y of [0.78, 1.28, 1.79]) k.box(w, 1.14, 0.02, 0.02, 0, y, 0.2);
    k.box(glass, 1.14, 1.02, 0.008, 0, 1.28, 0.198);
  } };
  // Margaret's sewing machine, black and gold, on its treadle table with the cast-iron legs
  R.treadle = { w: 0.92, d: 0.46, boxes: [[0, 0, 0.92, 0.46, 0.76], [-0.02, 0, 0.5, 0.2, 1.1]], build(k) {
    const iron = k.mat(0x17171a, 0.5, 0.6), wood = k.mat(0x5e3a22, 0.45), black = k.mat(0x0e0e10, 0.25, 0.3), gold = k.mat(0xc8a040, 0.3, 0.8);
    k.box(wood, 0.92, 0.03, 0.46, 0, 0.745, 0);
    k.box(wood, 0.2, 0.09, 0.4, 0.34, 0.685, 0);
    for (const x of [-0.38, 0.38]) {
      k.box(iron, 0.04, 0.7, 0.05, x, 0.37, 0.16); k.box(iron, 0.04, 0.7, 0.05, x, 0.37, -0.16);
      k.box(iron, 0.04, 0.04, 0.42, x, 0.03, 0); k.box(iron, 0.04, 0.04, 0.36, x, 0.42, 0);
      k.box(iron, 0.04, 0.44, 0.04, x, 0.26, 0, 0, 0.6);
    }
    k.box(iron, 0.76, 0.035, 0.035, 0, 0.42, -0.16);
    k.box(iron, 0.56, 0.025, 0.24, 0, 0.09, 0.02, 0, -0.12); // the treadle
    k.cyl(iron, 0.15, 0.15, 0.025, -0.2, 0.28, 0, 18, 0);
    k.box(black, 0.46, 0.05, 0.18, -0.02, 0.785, 0);
    k.box(black, 0.08, 0.27, 0.11, 0.17, 0.92, 0);
    k.box(black, 0.42, 0.075, 0.11, -0.03, 1.05, 0);
    k.box(black, 0.06, 0.14, 0.09, -0.21, 0.95, 0);
    k.cyl(black, 0.065, 0.065, 0.03, 0.23, 1.01, 0, 14, Math.PI / 2);
    k.box(gold, 0.26, 0.016, 0.004, -0.03, 1.055, 0.057); k.box(gold, 0.2, 0.01, 0.004, -0.03, 1.03, 0.057); k.box(gold, 0.03, 0.14, 0.004, 0.17, 0.92, 0.057);
    k.box(gold, 0.3, 0.008, 0.004, -0.02, 0.79, 0.092);
  } };
  // A rubber plant gone leggy: a long bare stem, the last few big dark leaves near the top
  R.tallplant = { small: 1, w: 0.5, d: 0.5, boxes: [[0, 0, 0.44, 0.44, 1.62]], build(k) {
    k.cyl(k.mat(0x8a4a2a, 0.8), 0.17, 0.13, 0.3, 0, 0.15, 0);
    k.cyl(k.mat(0x2a1e14, 1), 0.155, 0.155, 0.02, 0, 0.29, 0);
    const stem = k.mat(0x4a3a24, 0.8), leaf = k.mat(0x1c3e24, 0.35), leaf2 = k.mat(0x28502e, 0.35);
    k.cyl(stem, 0.012, 0.02, 1.2, 0.01, 0.88, 0, 8);
    for (let i = 0; i < 9; i++) {
      const a = i * 2.4 + k.rnd(), y = 1.0 + i * 0.075, ry = Math.atan2(Math.cos(a), Math.sin(a));
      k.box(i % 2 ? leaf : leaf2, 0.11, 0.008, 0.3, Math.cos(a) * 0.15, y, Math.sin(a) * 0.15, ry + Math.PI / 2, -0.45 + i * 0.1);
    }
  } };
  // A stack of TV Guides, kept
  R.guides = { small: 1, w: 0.3, d: 0.24, boxes: [[0, 0, 0.27, 0.21, 0.3]], build(k) {
    for (let i = 0; i < 12; i++) k.box(k.mat(k.pick([0xe6c326, 0xd8b420, 0xf0d040]), 0.25), 0.26, 0.024, 0.2, (k.rnd() - 0.5) * 0.015, 0.012 + i * 0.025, (k.rnd() - 0.5) * 0.015, (k.rnd() - 0.5) * 0.14);
  } };
  // His side table: rings in the varnish, and two cups set out, one used
  R.cuptable = { small: 1, w: 0.5, d: 0.5, boxes: [[0, 0, 0.5, 0.5, 0.62]], build(k) {
    const w = k.mat(0x6b4428, 0.45), ring = k.mat(0x3e2412, 0.8), cup = k.mat(0xece6d6, 0.3), tea = k.mat(0x3a2010, 0.3);
    k.box(w, 0.5, 0.03, 0.5, 0, 0.545, 0);
    for (const x of [-0.21, 0.21]) for (const z of [-0.21, 0.21]) k.box(w, 0.035, 0.53, 0.035, x, 0.265, z);
    k.box(w, 0.42, 0.02, 0.42, 0, 0.16, 0);
    for (const [x, z] of [[-0.14, 0.13], [0.03, -0.14], [0.15, 0.1], [-0.05, 0.02]]) { k.cyl(ring, 0.043, 0.043, 0.002, x, 0.561, z, 14); k.cyl(w, 0.034, 0.034, 0.002, x, 0.562, z, 14); }
    for (const [x, z, full] of [[0.11, 0.12, 1], [-0.12, -0.1, 0]]) {
      k.cyl(cup, 0.065, 0.06, 0.01, x, 0.566, z, 14); k.cyl(cup, 0.042, 0.032, 0.06, x, 0.6, z, 12); k.box(cup, 0.008, 0.035, 0.016, x + 0.048, 0.602, z);
      if (full) k.cyl(tea, 0.037, 0.037, 0.002, x, 0.628, z, 12);
    }
  } };
  // hung on a wall (h: the height it's hung at, from `hang`): no collision, as a picture
  // The bus company's enamel sign, red and white
  R.enamel = { hung: 1, w: 0.42, build(k, v, s) {
    const red = k.mat(0xb02020, 0.25), white = k.mat(0xf0ece0, 0.25), y = s.h;
    k.box(red, 0.42, 0.28, 0.012, 0, y, 0.008);
    k.box(white, 0.38, 0.09, 0.004, 0, y + 0.02, 0.016); k.box(white, 0.4, 0.008, 0.003, 0, y - 0.125, 0.015); k.box(white, 0.4, 0.008, 0.003, 0, y + 0.125, 0.015);
    for (const x of [-0.14, -0.08, -0.02, 0.04, 0.1]) k.box(red, 0.04, 0.05, 0.003, x, y + 0.02, 0.019); // (the bus, its windows)
    k.box(white, 0.2, 0.03, 0.003, 0, y - 0.075, 0.015);
  } };
  // The mantel clock, tall and brown, on a shelf of its own (the flat has no mantel)
  R.clockshelf = { hung: 1, w: 0.62, build(k, v, s) {
    const w = k.mat(0x6b4428, 0.45), body = k.mat(0x4a2c18, 0.4), y = s.h;
    k.box(w, 0.62, 0.03, 0.17, 0, y, 0.085);
    for (const x of [-0.22, 0.22]) k.box(w, 0.025, 0.12, 0.1, x, y - 0.075, 0.05);
    k.box(body, 0.26, 0.3, 0.11, 0, y + 0.165, 0.08);
    k.cyl(body, 0.13, 0.13, 0.11, 0, y + 0.315, 0.08, 16, Math.PI / 2);
    k.cyl(k.mat(0xb8a060, 0.3, 0.8), 0.098, 0.098, 0.008, 0, y + 0.27, 0.137, 16, Math.PI / 2);
    k.cyl(k.mat(0xf0ece0, 0.5), 0.088, 0.088, 0.006, 0, y + 0.27, 0.14, 16, Math.PI / 2);
    k.box(k.mat(0x111111, 0.5), 0.006, 0.07, 0.003, 0, y + 0.3, 0.145); k.box(k.mat(0x111111, 0.5), 0.05, 0.006, 0.003, 0.022, y + 0.27, 0.145);
    k.box(k.mat(0x2a1a10, 0.7), 0.16, 0.1, 0.004, 0, y + 0.09, 0.137);
  } };
  // The calendar, still on October 2019: a picture over a page of days, one month's
  R.calendar = { hung: 1, w: 0.3, build(k, v, s) {
    const y = s.h, ink = k.mat(0x3a3a3a, 0.7), red = k.mat(0xa82424, 0.6);
    k.box(k.mat(0xece6d6, 0.8), 0.3, 0.44, 0.006, 0, y, 0.004);
    k.box(k.mat(0x5a7a8a, 0.7), 0.27, 0.17, 0.003, 0, y + 0.115, 0.008);
    k.box(red, 0.27, 0.025, 0.003, 0, y + 0.01, 0.008);
    for (let r = 0; r < 5; r++) for (let c = 0; c < 7; c++) if (r * 7 + c >= 1 && r * 7 + c < 32) k.box(c > 4 ? red : ink, 0.018, 0.014, 0.002, -0.114 + c * 0.038, y - 0.03 - r * 0.036, 0.008);
  } };
  // Margaret, framed
  R.photo = { hung: 1, w: 0.34, build(k, v, s) {
    const y = s.h;
    k.box(k.mat(0x4a2c18, 0.45), 0.34, 0.42, 0.024, 0, y, 0.012);
    k.box(k.mat(0xe6dcc0, 0.8), 0.27, 0.35, 0.004, 0, y, 0.025);
    k.box(k.mat(0x9a8468, 0.8), 0.18, 0.25, 0.003, 0, y, 0.028);
    k.box(k.mat(0x5a4a38, 0.8), 0.13, 0.11, 0.002, 0, y - 0.06, 0.03); k.sph(k.mat(0xc8b090, 0.8), 0.035, 0, y + 0.04, 0.028);
  } };

  // ---------------------------------------------------------------- who lives where
  // the level's: a random stream from its seed and nothing else, and who's still to find a home
  const start = (seed) => { const r = U.rng((seed ^ 0x48a401d) >>> 0); return { seed, r, left: U.shuffle(r, RESIDENTS.slice()) }; };

  // One floor's homes, each roll from the level's stream. A loft's rooms all carry `loft` or live under one that does.
  function fill(map, ctx) {
    const units = [...new Set(map.rooms.filter((q) => q.unit != null).map((q) => q.unit))].sort((a, b) => a - b);
    for (const id of units) {
      const mine = map.rooms.filter((q) => q.unit === id), loft = mine.some((q) => q.loft), roll = ctx.r();
      let sum = 0, who = null;
      for (const p of ctx.left) {
        if ((p.home === 'loft') !== loft || !Object.keys(p.rooms).every((ty) => mine.some((q) => q.type === ty))) continue;
        sum += p.rate;
        if (roll < sum) { who = p; break; }
      }
      if (!who) continue;
      const done = [];
      let ok = true;
      for (const [ty, spec] of Object.entries(who.rooms)) {
        const rm = mine.filter((q) => q.type === ty).sort((a, b) => b.w * b.h - a.w * a.h)[0]; // (the biggest of them, if there are two)
        ok = dress(map, rm, spec, who, ctx.seed);
        if (!ok) break;
        done.push(rm);
      }
      if (!ok) { for (const rm of done) undress(map, rm); continue; }
      ctx.left.splice(ctx.left.indexOf(who), 1);
      for (const rm of done) G.Level.respot(map, rm);
    }
  }

  // Everything in the room out. was: every cell touched, as it stood (rm.dress: js/furniture.js still builds the room as
  // it would have been, into nothing, for the sake of the looks of every room after it).
  function clear(map, rm) {
    const { W, t, props } = map, TS = G.Level.TS, was = new Map(), x0 = rm.x * TS, x1 = (rm.x + rm.w) * TS, z0 = rm.z * TS, z1 = (rm.z + rm.h) * TS;
    const note = (i) => { if (!was.has(i)) was.set(i, [t[i], props.get(i)]); };
    for (let z = rm.z; z < rm.z + rm.h; z++) for (let x = rm.x; x < rm.x + rm.w; x++) note(z * W + x);
    const gone = map.propList.filter((p) => !p.own && p.x >= x0 && p.x < x1 && p.z >= z0 && p.z < z1), dead = new Set();
    for (const p of gone) { p.gone = true; for (const b of p.boxes) dead.add(b); }
    for (const [i, q] of [...props]) {
      if (!q.boxes.some((b) => dead.has(b))) continue;
      note(i);
      const rest = q.boxes.filter((b) => !dead.has(b)), mx = ((i % W) + 0.5) * TS, mz = (((i / W) | 0) + 0.5) * TS;
      if (rest.length) props.set(i, { name: q.name, boxes: rest }); else props.delete(i);
      if ((t[i] === 2 || t[i] === 4) && !rest.some((b) => Math.abs(mx - b.cx) <= b.hx + 0.05 && Math.abs(mz - b.cz) <= b.hz + 0.05)) t[i] = 0;
    }
    return { was, gone };
  }
  // the room as it was and as it is, swapped
  function swap(map, rm) {
    const d = rm.dress, { t, props } = map;
    for (const [i, e] of d.was) {
      const a = t[i], b = props.get(i);
      t[i] = e[0];
      if (e[1]) props.set(i, e[1]); else props.delete(i);
      e[0] = a; e[1] = b;
    }
  }
  function undress(map, rm) {
    const d = rm.dress;
    swap(map, rm);
    for (const p of d.gone) p.gone = false;
    map.propList = map.propList.filter((p) => !d.own.includes(p));
    rm.dress = null;
  }

  // The cells a room's walls, ceiling and floor cover: its rectangle, and any strip of floor off the side of it that's in no
  // room's rectangle (where a thinned wall opened up beside a wall that didn't: js/level.js refine). They'd keep the theme's
  // colours otherwise, a grey slot down the side of a papered room.
  function cellsOf(map, rm) {
    const { W, t } = map, inRect = (q, x, z) => x >= q.x && x < q.x + q.w && z >= q.z && z < q.z + q.h, seen = new Set(), todo = [];
    for (let z = rm.z; z < rm.z + rm.h; z++) for (let x = rm.x; x < rm.x + rm.w; x++) { seen.add(z * W + x); if (t[z * W + x] !== 1) todo.push(z * W + x); }
    while (todo.length) {
      const i = todo.pop(), x = i % W, z = (i / W) | 0;
      for (const [nx, nz] of [[x + 1, z], [x - 1, z], [x, z + 1], [x, z - 1]]) {
        const j = nz * W + nx, v = t[j];
        if (seen.has(j) || (v !== 0 && v !== 2 && v !== 4) || map.rooms.some((q) => inRect(q, nx, nz))) continue;
        seen.add(j); todo.push(j);
      }
    }
    return [...seen];
  }

  // What the room won't take: where the doors swing and you walk through them, the weapon case and the first aid cabinets
  // and the like and the way to them, the room's middle (a boss's spot, a room's lamp over it). Cells.
  function kept(map, rm) {
    const { W, t } = map, TS = G.Level.TS, keep = new Set(), inRoom = (x, z) => x >= rm.x && x < rm.x + rm.w && z >= rm.z && z < rm.z + rm.h;
    const mark = (x, z) => { if (inRoom(x, z)) keep.add(z * W + x); };
    for (let z = rm.z; z < rm.z + rm.h; z++) for (let x = rm.x; x < rm.x + rm.w; x++) {
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, nz = z + dz;
        if (inRoom(nx, nz) || t[nz * W + nx] === 1) continue;
        // a doorway: its width and a cell either side, 2.7 m into the room
        for (let d = 0; d < 4; d++) for (let s = -1; s <= 1; s++) mark(x - dx * d + dz * s, z - dz * d + dx * s);
      }
      if ((map.leafAt && map.leafAt.has(z * W + x))) keep.add(z * W + x);
    }
    for (const o of [map.case, map.abox, map.sbox, ...(map.cabinets || [])]) {
      if (!o) continue;
      const cx = Math.floor(o.x / TS), cz = Math.floor(o.z / TS);
      for (let dz = -2; dz <= 2; dz++) for (let dx = -2; dx <= 2; dx++) mark(cx + dx, cz + dz);
    }
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) mark(rm.cx + dx, rm.cz + dz);
    return keep;
  }

  // A room done over for a resident. false: it can't be (what's left of it as it was).
  function dress(map, rm, spec, who, seed) {
    const L = G.Level, TS = L.TS, { W, H, t } = map, r = U.rng((seed ^ Math.imul(rm.z * W + rm.x + 1, 0x2545f491)) >>> 0);
    const { was, gone } = clear(map, rm), own = [], hung = [];
    rm.dress = { who: who.id, wall: spec.wall, paper: spec.paper, ceil: spec.ceil, trim: spec.trim, floor: spec.floor, cells: cellsOf(map, rm), hung, was, gone, own };
    const keep = kept(map, rm), X0 = rm.x * TS, X1 = (rm.x + rm.w) * TS, Z0 = rm.z * TS, Z1 = (rm.z + rm.h) * TS;
    // the four sides, n pointing out through the wall; a: along it, b: into the room
    const sides = [{ n: [0, -1], A0: X0, A1: X1, B: Z0 }, { n: [0, 1], A0: X0, A1: X1, B: Z1 }, { n: [-1, 0], A0: Z0, A1: Z1, B: X0 }, { n: [1, 0], A0: Z0, A1: Z1, B: X1 }];
    const at = (s, a, b) => (s.n[0] ? [s.B - s.n[0] * b, a] : [a, s.B - s.n[1] * b]);
    const depth = (s) => (s.n[0] ? X1 - X0 : Z1 - Z0);
    // the wall cells behind a span of a side
    const behind = (s, a0, a1) => {
      const out = [];
      for (let c = Math.floor((a0 + 0.01) / TS); c <= Math.floor((a1 - 0.01) / TS); c++) {
        const wx = s.n[0] ? (s.n[0] < 0 ? rm.x - 1 : rm.x + rm.w) : c, wz = s.n[0] ? c : (s.n[1] < 0 ? rm.z - 1 : rm.z + rm.h);
        out.push([wx, wz]);
      }
      return out;
    };
    const wallOk = (cells, high) => cells.every(([x, z]) => L.tile(map, x, z) === 1 && !(high && map.winAt && map.winAt.has(z * W + x)));
    // what's in the room so far (tight: a cell any of it touches counts as blocked, so a way through it's a real one)
    const placed = [], tight = t.slice();
    const under = (b, f) => {
      for (let z = Math.floor((b.cz - b.hz + 0.03) / TS); z <= Math.floor((b.cz + b.hz - 0.03) / TS); z++) for (let x = Math.floor((b.cx - b.hx + 0.03) / TS); x <= Math.floor((b.cx + b.hx - 0.03) / TS); x++) if (!f(x, z)) return false;
      return true;
    };
    const free = (boxes) => boxes.every((b) => under(b, (x, z) => x >= rm.x && x < rm.x + rm.w && z >= rm.z && z < rm.z + rm.h && t[z * W + x] === 0 && !map.props.has(z * W + x) && !keep.has(z * W + x))
      && !placed.some((e) => e.boxes.some((q) => Math.abs(q.cx - b.cx) < q.hx + b.hx + 0.06 && Math.abs(q.cz - b.cz) < q.hz + b.hz + 0.06)));
    // does everything that could be walked to still can be, past this as well?
    const src = [[map.spawnRoom.cx, map.spawnRoom.cz]].concat(map.entries || []), reach0 = L.flow(map, src);
    const passes = (boxes) => {
      const q = tight.slice();
      for (const b of boxes) under(b, (x, z) => { q[z * W + x] = 4; return true; });
      const f = L.flow({ W, H, t: q }, src);
      for (let i = 0; i < f.length; i++) if (reach0[i] >= 0 && f[i] < 0 && (q[i] === 0 || q[i] === 3)) return false;
      return true;
    };
    const find = (id) => placed.find((e) => e.id === id);
    const span = (s, e) => { const b = e.boxes[0]; return s.n[0] ? b.cz : b.cx; }; // (where an item is along side s)
    // Where a rule would have it, best first: [side, a along it, score (low is good)]
    const candidates = (rule, w) => {
      const [how, id] = rule.split(':'), ref = id ? find(id) : null, out = [];
      if (id && !ref) return candidates('wall', w); // (what it goes with wasn't placed)
      const longest = (s) => { // the most free wall on a side
        let best = 0, run = 0;
        for (let a = s.A0 + TS / 2; a < s.A1; a += TS) { const c = behind(s, a - 0.1, a + 0.1)[0], [x, z] = at(s, a, 0.3), ci = Math.floor(z / TS) * W + Math.floor(x / TS); run = L.tile(map, c[0], c[1]) === 1 && !keep.has(ci) ? run + 1 : 0; if (run > best) best = run; }
        return best * TS;
      };
      for (const s of sides) {
        if (s.A1 - s.A0 < w + 0.04) continue;
        const clear = how === 'long' ? longest(s) : 0;
        for (let a = s.A0 + w / 2 + 0.02; a <= s.A1 - w / 2 - 0.02 + 1e-6; a += TS / 4) {
          const mid = (s.A0 + s.A1) / 2, [px, pz] = at(s, a, 0.4), ends = Math.min(a - s.A0, s.A1 - a) - w / 2;
          let score = r() * 0.3;
          if (how === 'long') score += -clear * 3 + Math.abs(a - mid) * 0.4;
          else if (how === 'corner') { if (ends > 0.12) continue; score += placed.some((e) => e.at === 'corner' && Math.hypot(e.x - px, e.z - pz) < 1.5) ? 5 : 0; }
          else if (how === 'facing') { const opp = s.n[0] === -ref.side.n[0] && s.n[1] === -ref.side.n[1]; score += (opp ? 0 : 6) + (opp ? Math.abs(a - span(s, ref)) : Math.hypot(ref.x - px, ref.z - pz) * -0.3); }
          else if (how === 'cross') { const perp = !!s.n[0] !== !!ref.side.n[0]; score += (perp ? 0 : 8) + Math.hypot(ref.x - px, ref.z - pz) * 0.35; }
          else if (how === 'beside') score += Math.hypot(ref.x - px, ref.z - pz);
          else if (how === 'away') score -= Math.hypot(ref.x - px, ref.z - pz);
          else score += r() * 2 + placed.filter((e) => e.side === s).length * 0.8; // (spread round the room)
          out.push([s, a, score]);
        }
      }
      return out.sort((p, q) => p[2] - q[2]);
    };
    // A piece on the floor, by its rule. Returns whether it went in.
    const stand = (item, o) => {
      const rec = R[o.piece], tall = Math.max(...rec.boxes.map((b) => b[4])) > L.SILL - 0.02, v = r(), pulls = item.pull ? [item.pull, 0] : [0];
      for (const pull of pulls) for (const [s, a] of candidates(o.at || item.at, rec.w)) {
        if (pull && depth(s) < pull + rec.d + 4.2) continue; // (room behind it, and to the far wall)
        const q = F.facing(s.n[0], s.n[1]), [x, z] = at(s, a, 0.02 + pull + rec.d / 2), boxes = F.worldBoxes(rec, x, z, q, v);
        if (!wallOk(behind(s, a - rec.w / 2, a + rec.w / 2), tall)) continue;
        if (!free(boxes) || !passes(boxes)) continue;
        for (const b of boxes) under(b, (cx, cz) => { tight[cz * W + cx] = 4; return true; });
        const p = { name: o.piece, q, x, z, v, style: o.style || {}, boxes, own: true };
        L.layProp(map, p, rec.small ? 0 : rec.cover ? 2 : 4);
        own.push(p); placed.push({ id: item.id, at: item.at, side: s, x, z, boxes });
        return true;
      }
      return false;
    };
    // Hung on a wall: not over a window or a door, nor behind anything that reaches up to it, nor beside what else is hung.
    const hang = (item) => {
      const rec = R[item.piece], y = item.hang;
      for (const [s, a] of candidates(item.at, rec.w)) {
        const a0 = a - rec.w / 2, a1 = a + rec.w / 2, cells = behind(s, a0 - TS * 0.8, a1 + TS * 0.8), [x, z] = at(s, a, 0);
        if (!wallOk(cells, true)) continue;
        if (hung.some((h) => Math.hypot(h.x - x, h.z - z) < (rec.w + R[h.name].w) / 2 + 0.3)) continue;
        if (own.some((p) => p.boxes.some((b) => Math.abs(b.cx - x) < b.hx + rec.w / 2 + 0.05 && Math.abs(b.cz - z) < b.hz + rec.w / 2 + 0.05 && b.h > y - 0.35))) continue;
        if ((map.cabinets || []).some((c) => Math.hypot(c.x - x, c.z - z) < 1)) continue;
        hung.push({ name: item.piece, x, z, q: F.facing(s.n[0], s.n[1]), v: r(), style: { h: y } });
        return true;
      }
      return false;
    };
    for (const item of spec.items) {
      const ok = item.hang ? hang(item) : [item].concat(item.swap || []).some((o) => stand(item, o));
      if (!ok && item.need) { undress(map, rm); return false; }
    }
    return true;
  }

  // ---------------------------------------------------------------- their colours, for js/level.js and js/lightgrid.js
  // A surface's colour over the theme's: what to multiply it by, in linear light, as a Color
  const over = (hex, base) => { const c = new THREE.Color(hex), b = new THREE.Color(base); return new THREE.Color(c.r / b.r, c.g / b.g, c.b / b.b); };
  // this floor's ceiling tints, by cell (null: no resident on it)
  function ceilings(map) {
    let out = null;
    for (const rm of map.rooms) {
      if (!rm.dress) continue;
      const c = over(rm.dress.ceil, map.theme.ceil);
      out = out || new Map();
      for (const i of rm.dress.cells) out.set(i, c);
    }
    return out;
  }
  // The walls' colour by the cell they face, every floor (js/lightgrid.js FS_PAINT). null: there's nobody in this level.
  function paint(map) {
    const floors = map.floors || [map];
    if (!floors.some((m) => m.rooms.some((rm) => rm.dress))) return null;
    const { W, H } = map, NF = floors.length, data = new Uint8Array(W * H * NF * 4);
    floors.forEach((m, f) => {
      for (const rm of m.rooms) {
        if (!rm.dress) continue;
        const c = over(rm.dress.wall, map.theme.wall), v = [c.r, c.g, c.b].map((q) => Math.min(255, Math.round(q * 127.5)));
        for (const i of rm.dress.cells) { const o = (f * W * H + i) * 4; data[o] = v[0]; data[o + 1] = v[1]; data[o + 2] = v[2]; data[o + 3] = rm.dress.paper ? 255 : 128; }
      }
    });
    const tx = new THREE.DataTexture(data, W, H * NF, THREE.RGBAFormat);
    tx.magFilter = tx.minFilter = THREE.NearestFilter; tx.wrapS = tx.wrapT = THREE.ClampToEdgeWrapping; tx.generateMipmaps = false; tx.needsUpdate = true;
    return tx;
  }
  return { RESIDENTS, start, fill, swap, ceilings, paint };
})();
