'use strict';
// What everything is made of, for a round (js/ballistics.js strike, crossSolid).
//
// MAT: every material a round can meet, armour and walls and furniture alike, by the same numbers:
//   K      the de Marre constant: the speed it takes to get through t mm is v = K·t^0.7·d^0.75/m^0.5 (d in mm, m in g).
//          It's fitted to what the material is known to do (below), and armour's to the NIJ ratings.
//   E      how well each core works on it: the speed needed is divided by this (default CORE_E).
//   rho    density, kg/m³: how hard it is to shove aside at speed, half rho v².
//   sig    the stress it stands up to, Pa. With rho it sets the pressure on the round's nose, and so whether the round
//          flattens, breaks up or stays whole (js/ballistics.js deform).
//   mu, e  a ricochet: the share of its speed along the surface it loses, and what it keeps of its speed into it.
//   noRic  it never glances (fabric, foam, anything a round just goes into).
//   clog   it plugs a hollow point's nose, which then doesn't open.
//   fx     what a hit looks and sounds like (js/render.js IMPACT).
//   blunt, wearJ, soft, hard: armour's (js/ballistics.js): the share of a stopped round's energy the body behind it
//          takes, joules per point of durability, and how it behaves.
// Fitted to: 9 mm ball stopped by about 3 mm of mild steel and 85 mm of pine, through a dozen sheets of plasterboard; M193
// 5.56 through 8 mm of mild steel; a single brick stopping 5.56 and 7.62x39 and passing 7.62x51 slowly; hollow block's
// shell not stopping a rifle, stopping a pistol; 100 mm of concrete stopping 7.62x51; a car door nothing to anyone.
//
// A SOLID is a box in the world (js/world.js), and the boxes are what the level's made of, not what it's built from: a
// wall is 67 cm thick. So each solid has a construction: { skin: the layers on each face, outside in, core: what's
// between the faces (null: a void), fill: the share of the way through the core that's really core, stud: the framing in
// the void, every so many metres }. of(map, solid, p, q) gives the construction of the solid a round met at p and left
// at q. A partition is two sheets of plasterboard and a void, with a stud every 40 cm; a bunker's wall is concrete all
// the way through; a fridge is thin steel with foam in it; a car is thin steel with an engine in it.
G.Materials = (() => {
  const CORE_E = { lead: 1, mild: 1.1, hard: 1.4, wc: 1.6 };
  const m = (name, K, rho, sig, fx, o) => Object.assign({ name, K, rho, sig, fx, E: CORE_E, mu: 0.3, e: 0.15 }, o || {});
  const MAT = {
    // armour (K, E, blunt, wearJ: the NIJ calibration, js/ballistics.js)
    aramid: m('aramid', 72, 1440, 3e8, 'soft', { E: { lead: 1, mild: 1.25, hard: 1.45, wc: 1.5 }, blunt: 0.25, wearJ: 900, soft: true, noRic: true, damp: 0.6 }),
    pe: m('UHMWPE', 77, 970, 2.5e8, 'soft', { E: { lead: 1, mild: 1.35, hard: 1.75, wc: 2 }, blunt: 0.15, wearJ: 2200, noRic: true, damp: 0.7 }),
    steel: m('steel', 163, 7850, 2.4e9, 'metal', { E: { lead: 0.9, mild: 1.1, hard: 1.5, wc: 1.9 }, blunt: 0.1, wearJ: 4500, hard: true, mu: 0.1, e: 0.25 }),
    ceramic: m('ceramic', 146, 3900, 4e9, 'stone', { E: { lead: 0.8, mild: 0.9, hard: 1, wc: 1.25 }, blunt: 0.08, wearJ: 1600, hard: true, mu: 0.15, e: 0.2 }),
    pc: m('polycarbonate', 55, 1200, 1.2e8, 'plastic', { E: { lead: 1, mild: 1.2, hard: 1.4, wc: 1.5 }, blunt: 0.2, wearJ: 900 }),
    abs: m('ABS', 25, 1050, 6e7, 'plastic', { E: { lead: 1, mild: 1.1, hard: 1.2, wc: 1.3 }, blunt: 0.4, wearJ: 300 }),
    // armour's trimmings (ARMOUR): damp, the share of a stopped round's back-face energy that gets past a layer behind it
    nylon: m('nylon cover', 1.2, 1150, 8e7, 'soft', { noRic: true, blunt: 0.3, wearJ: 900, damp: 0.95 }),
    polyurea: m('spall liner', 4, 1100, 3e7, 'plastic', { noRic: true, blunt: 0.3, wearJ: 900, damp: 0.8 }),
    pad: m('trauma pad', 0.5, 90, 4e5, 'soft', { noRic: true, blunt: 0.3, wearJ: 900, damp: 0.55 }),
    // people: the skull's outer table, for a round skimming it (the rest of a body: TISSUE)
    bone: m('bone', 14, 1900, 1.6e8, 'soft', { mu: 0.2, e: 0.15 }),
    // metals
    mild: m('mild steel', 120, 7850, 1.2e9, 'metal', { E: { lead: 1, mild: 0.85, hard: 1.4, wc: 1.6 }, mu: 0.12, e: 0.22 }),
    iron: m('cast iron', 150, 7200, 1.6e9, 'metal', { mu: 0.12, e: 0.2 }),
    alu: m('aluminium', 62, 2700, 4e8, 'metal', { mu: 0.2, e: 0.15 }),
    // masonry
    concrete: m('reinforced concrete', 34, 2400, 2.5e8, 'stone', { E: { lead: 1, mild: 1, hard: 1.05, wc: 1.1 }, mu: 0.2, e: 0.2 }),
    cmu: m('concrete block', 25, 2000, 1.4e8, 'stone', { mu: 0.22, e: 0.18 }),
    brick: m('brick', 20, 1900, 1.2e8, 'stone', { mu: 0.25, e: 0.18 }),
    ceram: m('sanitaryware', 34, 2300, 2e8, 'glass', { mu: 0.15, e: 0.2 }),
    // wood and boards
    hardwood: m('hardwood', 13, 750, 7e7, 'wood', { mu: 0.32, e: 0.1, clog: true }),
    pine: m('softwood', 9, 500, 4e7, 'wood', { mu: 0.35, e: 0.1, clog: true }),
    ply: m('plywood', 11, 600, 5e7, 'wood', { mu: 0.35, e: 0.1, clog: true }),
    mdf: m('particle board', 10, 750, 4.5e7, 'wood', { mu: 0.35, e: 0.1, clog: true }),
    gypsum: m('plasterboard', 8, 800, 2.5e7, 'plaster', { noRic: true, clog: true }),
    card: m('cardboard', 1.5, 300, 3e6, 'soft', { noRic: true }),
    paper: m('packed paper', 6.5, 800, 2e7, 'soft', { noRic: true, clog: true }),
    // soft goods
    fabric: m('upholstery', 0.8, 300, 1e6, 'soft', { noRic: true, clog: true }),
    foam: m('foam', 0.35, 40, 3e5, 'soft', { noRic: true }),
    pur: m('insulating foam', 0.5, 40, 4e5, 'soft', { noRic: true }),
    wool: m('mineral wool', 0.4, 60, 2e5, 'soft', { noRic: true }),
    goods: m('stock', 2.2, 450, 4e6, 'soft', { noRic: true }),
    foliage: m('foliage', 0.2, 80, 1e5, 'soft', { noRic: true }),
    rubber: m('rubber', 3, 1100, 2e7, 'soft', { noRic: true }),
    hdpe: m('plastic', 12, 950, 3e7, 'plastic', { mu: 0.3, e: 0.1 }),
    // ground and water
    soil: m('earth', 3.8, 1600, 5e6, 'soil', { mu: 0.4, e: 0.1 }),
    sand: m('sand', 5, 1600, 8e6, 'soil', { mu: 0.4, e: 0.1 }),
    water: m('water', 1.1, 1000, 0, 'water', { mu: 0.3, e: 0.2 }),
    // glass
    glass: m('glass', 12, 2500, 1.5e8, 'glass', { mu: 0.15, e: 0.2 }),
    bpglass: m('laminated glass', 30, 2300, 2e8, 'glass', { mu: 0.15, e: 0.2 }),
    paperT: m('paper target', 0.5, 700, 1e6, 'soft', { noRic: true }),
  };
  // What a body's made of, for a round going through it a step at a time (js/ballistics.js through): density, and the stress it
  // stands up to, which is what a round has to pay per unit of its track whatever its speed. Skin is tough (about 10 J for a
  // 9 mm to break through it, why a spent round stops under the skin on its way out); bone is hard and dense in its cortex
  // and light inside; lung is mostly air. bone: it deforms and turns a round, and breaks into fragments of its own.
  const TISSUE = {
    skin: { name: 'skin', rho: 1100, sig: 8e7 }, fat: { name: 'fat', rho: 920, sig: 2e5 }, muscle: { name: 'muscle', rho: 1060, sig: 4e5 },
    viscera: { name: 'viscera', rho: 1040, sig: 2.5e5 }, liver: { name: 'liver', rho: 1060, sig: 2.5e5 }, heart: { name: 'heart', rho: 1060, sig: 4e5 },
    brain: { name: 'brain', rho: 1040, sig: 1.5e5 }, lung: { name: 'lung', rho: 400, sig: 1.5e5 }, airway: { name: 'airway', rho: 600, sig: 2e5 }, vessel: { name: 'blood vessel', rho: 1060, sig: 2e5 },
    cortical: { name: 'cortical bone', rho: 1900, sig: 1.6e8, bone: true }, cancellous: { name: 'cancellous bone', rho: 1000, sig: 8e6, bone: true }, marrow: { name: 'marrow', rho: 980, sig: 2e5 },
    rib: { name: 'rib', rho: 1500, sig: 7e7, bone: true }, diploe: { name: 'diploë', rho: 1200, sig: 1.5e7, bone: true },
  };
  // What's over a plate or a panel, and behind it, as worn, by where it's worn (the ballistic element itself: each piece's
  // prot layers, js/gear.js): the carrier's cover, a steel plate's spall liner, the trauma pad against your chest, a
  // helmet's cover and its pads.
  const ARMOUR = {
    plate: [[['nylon', 1]], [['pad', 8], ['nylon', 1]]], side: [[['nylon', 1]], [['pad', 5], ['nylon', 1]]], torso: [[['nylon', 1]], [['nylon', 1]]],
    groin: [[['nylon', 1]], [['nylon', 1]]], shoulder: [[['nylon', 1]], [['nylon', 1]]], thigh: [[['nylon', 1]], [['nylon', 1]]],
    helmet: [[['nylon', 0.5]], [['pad', 15]]], face: [[], []],
  };
  // a piece's protection as it's really layered, outside in
  function built(pr) {
    const [over, under] = ARMOUR[pr.at] || [[], []], core = [];
    for (const l of pr.layers) { core.push(l); if (l[0] === 'steel') core.push(['polyurea', 3]); }
    return [...over, ...core, ...under];
  }
  const C = (skin, core = null, fill = 1, stud = null) => ({ skin, core, fill, stud });
  const SOLID = (mat) => C([], mat), ONE = (skin) => Object.assign(C(skin), { one: true }); // (ONE: a single sheet, however thick its box: a pane, a plank fence)
  const STUD = { every: 0.4, w: 0.038, mat: 'pine', mm: 89 }, STEELSTUD = { every: 0.6, w: 0.04, mat: 'mild', mm: 1.8 };
  const PLASTER = C([['gypsum', 13]], null, 1, STUD);
  // walls by environment: indoors, and those with the outside on one side
  const WALLS = {
    Apartment: [PLASTER, C([['gypsum', 13], ['brick', 102]])],
    Warehouse: [C([['cmu', 32]]), C([['mild', 0.8]], 'wool', 0.2)],
    Bunker: [SOLID('concrete'), SOLID('concrete')],
    Suburbs: [PLASTER, C([['pine', 16], ['gypsum', 13]], 'wool', 0.15, STUD)],
    'Research Lab': [C([['gypsum', 13], ['gypsum', 13]], 'wool', 0.1, STEELSTUD), C([['concrete', 150]])],
    Foundry: [C([['brick', 215]]), C([['brick', 215]])],
    'Cold Storage': [C([['mild', 0.7]], 'pur'), C([['mild', 0.7]], 'pur')],
    'Convenience Store': [PLASTER, C([['cmu', 32]], 'wool', 0.1)],
    Festival: [C([['ply', 12]], null, 1, STUD), C([['ply', 12]], null, 1, STUD)],
    Hangar: [SOLID('concrete'), SOLID('concrete')],
  };
  // floors and ceilings by environment: [the ground's, between storeys]
  const SLAB = SOLID('concrete'), JOISTS = C([['ply', 18], ['gypsum', 13]], 'wool', 0.1);
  const DECK = { Apartment: SLAB, Suburbs: JOISTS, Festival: C([['ply', 18]]), 'Cold Storage': C([['mild', 0.7]], 'pur'), Warehouse: C([['mild', 1.5]], 'wool', 0.1) };
  // furniture, by the piece (js/furniture.js)
  const CAB = C([['mdf', 18]]), SHEET = (mm, core = null, fill = 1) => C([['mild', mm]], core, fill), MACHINE = C([['mild', 12]], 'iron', 0.35);
  const PROPS = {
    sofa: C([['fabric', 8]], 'foam'), armchairs: C([['fabric', 8]], 'foam'), bed: C([['fabric', 6]], 'foam'), tv: C([['hdpe', 3]], 'mdf', 0.05),
    bookshelf: C([['mdf', 18]], 'paper', 0.55), counter: C([['mdf', 18]], 'goods', 0.15), island: C([['mdf', 18]], 'goods', 0.15), dining: ONE([['hardwood', 28]]), dresser: CAB, wardrobe: CAB, desk: ONE([['mdf', 25]]),
    deskpair: ONE([['mdf', 25]]), files: SHEET(0.9, 'paper', 0.4), lockers: SHEET(0.8), fridge: SHEET(0.7, 'pur', 0.5), icechest: SHEET(0.8, 'pur'), cooler: C([['hdpe', 4]], 'pur'), atm: SHEET(6, 'mild', 0.03), register: C([['mdf', 18]], 'goods', 0.1),
    rack: SHEET(2, 'goods', 0.3), gondola: SHEET(0.9, 'goods', 0.25), aisle: SHEET(0.9, 'goods', 0.25), shopwall: SHEET(0.9, 'goods', 0.25), endcap: SHEET(0.9, 'goods', 0.25), tobacco: C([['mdf', 15]], 'goods', 0.4), palletrack: SHEET(3, 'goods', 0.35),
    crates: C([['pine', 20]], 'goods', 0.5), pallet: C([['card', 5]], 'goods', 0.6), cardboard: C([['card', 5]]), plant: C([['hdpe', 3]], 'soil', 0.6), planter: C([['hdpe', 5]], 'soil', 0.8), lamp: SHEET(1), sidetable: CAB, bin: C([['hdpe', 3]], 'goods', 0.3),
    fence: ONE([['pine', 18]]), hoarding: ONE([['ply', 12]]), hedge: SOLID('foliage'), shed: C([['pine', 16]], 'goods', 0.05), bbq: SHEET(2), patio: ONE([['pine', 28]]), seats: ONE([['hdpe', 5]]), stagedeck: C([['ply', 18]], 'pine', 0.1), speaker: C([['ply', 18]], 'wool'), foh: C([['ply', 12]], 'goods', 0.2),
    picnic: ONE([['pine', 38]]), bench: ONE([['pine', 38]]), booth: C([['ply', 12]]), stall: C([['ply', 12]]), sinks: C([['ceram', 8]], 'goods', 0.05), toilet: C([['ceram', 8]], 'water', 0.2), car: SHEET(0.9, 'iron', 0.05), police: SHEET(0.9, 'iron', 0.05), tree: SOLID('hardwood'), fountain: C([['concrete', 100]], 'water'),
    furnace: C([['mild', 12], ['brick', 110]], 'brick', 0.6), vat: C([['mild', 15]], 'iron', 0.5), moulds: C([['sand', 200]], 'sand'), panel: SHEET(1.5, 'mild', 0.02), scrap: C([['mild', 5]], 'mild', 0.25), conveyor: SHEET(4, 'rubber', 0.1), mill: MACHINE, saw: MACHINE, press: MACHINE, quench: SHEET(10, 'water'),
    forklift: SHEET(4, 'iron', 0.2), billets: SOLID('mild'), ingots: SOLID('alu'), coils: C([['mild', 20]], 'mild', 0.6), console: C([['mild', 1.5]], 'goods', 0.1),
  };
  const CRATE = PROPS.crates, RAIL = ONE([['mild', 3]]);
  // the same construction with only what's needed changed: a void wall's stud, say
  const wallOf = (theme, out) => { const w = WALLS[theme.name] || WALLS.Apartment; return w[out ? 1 : 0]; };
  // is this point outdoors (on its floor's plan)?
  function outAt(map, p) {
    const fl = map.floors ? map.floors.find((f) => p.y >= (f.fy || 0) - 0.02 && p.y < (f.fy || 0) + G.Level.WALL_H + 0.3) || map.floors[0] : map, TS = G.Level.TS, x = Math.floor(p.x / TS), z = Math.floor(p.z / TS);
    if (x < 0 || z < 0 || x >= fl.W || z >= fl.H) return true;
    return !!(fl.out && fl.out[z * fl.W + x]);
  }
  // The construction of the solid s a round entered at p and left at q (null q: what its face is)
  function of(map, s, p, q) {
    if (s.mat) return s.mat;
    const theme = map.theme || {};
    switch (s.kind) {
      case 'wall': case 'lintel': if (s.edge) return SOLID('concrete'); return wallOf(theme, outAt(map, p) || (q && outAt(map, q)));
      case 'floor': case 'ceil': case 'step': {
        if (theme.hub) return SOLID('concrete');
        if ((s.kind === 'floor' && s.max[1] <= 0.01 && s.min[1] <= -0.4) || outAt(map, p)) return outAt(map, p) ? SOLID('soil') : SOLID('concrete'); // (the ground: earth outdoors, a slab on it in)
        return DECK[theme.name] || SLAB;
      }
      case 'door': case 'leaf': {
        const d = s.door || {};
        if (d.kind === 'vault') return C([['mild', 25]], 'mild', 0.04);
        if (s.glass != null) return ONE([['glass', 8]]);
        return theme.name === 'Bunker' || theme.name === 'Foundry' || theme.name === 'Warehouse' ? C([['mild', 1.5]], 'wool', 0.5) : theme.name === 'Cold Storage' || theme.name === 'Research Lab' ? C([['mild', 1]], 'pur') : C([['hardwood', 4]]); // (hollow-core timber, or a steel fire door)
      }
      case 'glass': return s.win && s.win.armor ? ONE([['bpglass', 40]]) : ONE([['glass', 5]]);
      case 'rail': return RAIL;
      case 'view': return SOLID('soil');
      case 'target': return s.target && (s.target.kind === 'steel' || (s.target.q && s.target.q.kind === 'steel')) ? ONE([['steel', 10]]) : ONE([['paperT', 2]]);
      case 'prop': default:
        if (s.prop) return PROPS[s.prop.name] || CAB;
        return theme.hub ? SOLID('concrete') : CRATE;
    }
  }
  return { MAT, TISSUE, CORE_E, PROPS, WALLS, of, outAt, built };
})();
