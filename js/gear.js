'use strict';
// Personal kit and the grid inventory (Tarkov-style).
//
// Gear: helmets, plate carriers (and soft vests), armour plates and belts, each a named product from a brand.
// A carrier gives soft armour where it covers, a slot for a plate (the plate is what stops rifle rounds over
// the chest), and a MOLLE panel: rows of webbing that pouches mount on, column by column. A pouch is an item
// you can move, buy and sell; mounted, it's a small grid (its own footprint), some only for magazines,
// grenades or medkits. Gear comes with pouches as issued; rearrange them in the Kit tab. A belt has MOLLE too.
// A dump pouch takes anything, and it's where a dump reload (double-tap R) puts the empty magazine. Your pockets are two 1x2 (a rifle magazine each) and two 1x1, whatever you wear.
//
// Items take whole cells in those grids: a rifle magazine is 1x2, a pistol magazine or a box of shells 1x1,
// an LMG belt box 2x2. Items can be turned (1x2 <-> 2x1). Ammo isn't a number any more: it's the magazines
// and boxes you carry for each gun, and a reload takes one of them. Medkits and grenades are items too.
// Between levels everything you aren't carrying sits in your locker (a big grid) at the quartermaster's.
G.Gear = (() => {
  const B = { north: 'Northmark Defense', kest: 'Kestrel Tactical', iron: 'Ironvale Arms', mer: 'Meridian Armor', sable: 'Sable Ridge', para: 'Paragon Systems', halc: 'Halcyon Labs', gray: 'Graywater Supply', vant: 'Vantage Industries' };
  // pouch grids: [w, h, accepts] (accepts: null = anything small, or a list of item kinds)
  const MAG = ['mag', 'ammo'], MED = ['med'];
  const LIST = [
    // ---------------------------------------------------------------- carriers and vests: soft armour + plate slot + pouches
    { id: 'c.ghost', kind: 'carrier', brand: B.north, name: 'Ghost concealable vest', tier: 1, price: 450, speed: 1, dur: 6, plate: false,
      stop: { chest: [0.9, 0.12], abdomen: [0.9, 0.12] }, desc: 'Soft IIIA panels under a shirt. No plate pocket, no MOLLE.' },
    { id: 'c.slick', kind: 'carrier', brand: B.kest, name: 'PC-1 slick carrier', tier: 1, price: 380, speed: 1, dur: 4, plate: true,
      stop: {}, molle: [3, 2], pouches: [['q.rifle', 0, 0]], desc: 'Just a plate pocket and a little MOLLE, one magazine pouch as issued. Light and low.' },
    { id: 'c.patrol', kind: 'carrier', brand: B.iron, name: 'Patrol plate carrier', tier: 2, price: 900, speed: 0.99, dur: 6, plate: true,
      stop: { chest: [0.85, 0.1], abdomen: [0.85, 0.1] }, molle: [6, 2], pouches: [['q.rifle', 0, 0], ['q.rifle', 1, 0]],
      desc: 'Soft backer. Issued with two magazine pouches; the rest of the MOLLE is yours to fill.' },
    { id: 'c.recon', kind: 'carrier', brand: B.vant, name: 'Recon chest rig', tier: 2, price: 650, speed: 1, dur: 0, plate: false,
      stop: {}, molle: [7, 2], pouches: [['q.rifle', 0, 0], ['q.rifle', 1, 0]], desc: 'No armour at all: wide MOLLE, two magazine pouches as issued. Fast.' },
    { id: 'c.assault', kind: 'carrier', brand: B.para, name: 'Assaulter carrier', tier: 3, price: 1500, speed: 0.98, dur: 7, plate: true,
      stop: { chest: [0.88, 0.1], abdomen: [0.88, 0.1] }, molle: [8, 2], pouches: [['q.rifle2', 0, 0], ['q.rifle', 2, 0]],
      desc: 'The most MOLLE: issued with a double and a single magazine pouch, the rest to fill.' },
    { id: 'c.heavy', kind: 'carrier', brand: B.sable, name: 'Heavy assault armour', tier: 4, price: 2600, speed: 0.9, dur: 9, plate: true,
      stop: { chest: [0.9, 0.12], abdomen: [0.95, 0.65], uarm: [0.8, 0.1], thigh: [0.6, 0.05] }, molle: [6, 2], pouches: [['q.rifle', 0, 0], ['q.rifle', 1, 0], ['q.med', 2, 0]],
      desc: "Side and groin plates, shoulder and thigh protection. Slow, and less MOLLE than you'd like." },
    // ---------------------------------------------------------------- plates (go in a carrier's plate pocket; cover the chest)
    { id: 'p.soft', kind: 'plate', brand: B.gray, name: 'IIIA soft insert', tier: 1, price: 250, speed: 1, dur: 6, stop: { chest: [0.92, 0.12] }, desc: 'Stops handgun rounds and buckshot. Not rifles.' },
    { id: 'p.steel', kind: 'plate', brand: B.iron, name: 'AR550 steel plate (III)', tier: 2, price: 600, speed: 0.96, dur: 8, stop: { chest: [0.95, 0.85] }, desc: 'Stops rifle rounds and takes a beating. Heavy.' },
    { id: 'p.pe', kind: 'plate', brand: B.mer, name: 'UHMWPE plate (III+)', tier: 2, price: 1100, speed: 0.995, dur: 5, stop: { chest: [0.95, 0.82] }, desc: 'Polyethylene: barely there, stops rifle rounds. Wears faster than steel.' },
    { id: 'p.ceramic', kind: 'plate', brand: B.halc, name: 'Ceramic plate (IV)', tier: 3, price: 1600, speed: 0.98, dur: 4, stop: { chest: [0.97, 0.93] }, desc: 'Stops even armour-piercing rounds, cracking as it does.' },
    { id: 'p.ceramic2', kind: 'plate', brand: B.vant, name: 'Multi-hit ceramic plate (IV)', tier: 4, price: 2400, speed: 0.975, dur: 7, stop: { chest: [0.97, 0.94] }, desc: 'Level IV that holds together hit after hit.' },
    // ---------------------------------------------------------------- helmets (the top of the head; a visor covers the face)
    { id: 'h.bump', kind: 'helmet', brand: B.north, name: 'Bump helmet', tier: 1, price: 150, speed: 1, dur: 2, stop: { head: [0.3, 0] }, desc: 'For doorframes, not bullets. Turns the odd handgun round.' },
    { id: 'h.fast', kind: 'helmet', brand: B.kest, name: 'High-cut ballistic helmet (IIIA)', tier: 1, price: 600, speed: 1, dur: 3, face: true, stop: { head: [0.9, 0.15] }, desc: 'Stops handgun rounds to the top of the head. Not your face.' },
    { id: 'h.ach', kind: 'helmet', brand: B.iron, name: 'Full-cut combat helmet (IIIA)', tier: 2, price: 800, speed: 0.995, dur: 4, face: true, stop: { head: [0.92, 0.18] }, desc: 'More coverage, more hits before it gives.' },
    { id: 'h.rifle', kind: 'helmet', brand: B.mer, name: 'Rifle-rated helmet', tier: 3, price: 1700, speed: 0.99, dur: 3, face: true, stop: { head: [0.95, 0.55] }, desc: 'Turns some rifle rounds too. Still not your face.' },
    // ---------------------------------------------------------------- face protection (on a helmet's mount: face: true)
    // cover: the share of rounds to the face it's in the way of (a mandible guards the jaw, a shield the lot)
    { id: 'f.mandible', kind: 'face', brand: B.kest, name: 'Mandible guard', tier: 1, price: 350, speed: 0.995, dur: 2, cover: 0.4, stop: { face: [0.85, 0.1] }, desc: 'Bolts on under the rim and guards the jaw: in the way of about two face hits in five. Handgun-rated.' },
    { id: 'f.shield', kind: 'face', brand: B.iron, name: 'Ballistic face shield (IIIA)', tier: 2, price: 750, speed: 0.985, dur: 3, cover: 0.9, stop: { face: [0.88, 0.12] }, desc: 'A polycarbonate shield over the whole face. Stops handgun rounds, not rifles.' },
    { id: 'f.rifle', kind: 'face', brand: B.mer, name: 'Rifle-rated face shield', tier: 3, price: 1900, speed: 0.97, dur: 3, cover: 0.9, stop: { face: [0.95, 0.5] }, desc: 'Thick laminated shield over the whole face: turns some rifle rounds too. Heavy.' },
    { id: 'h.visor', kind: 'helmet', brand: B.sable, name: 'Helmet with ballistic visor', tier: 4, price: 2800, speed: 0.97, dur: 4, stop: { head: [0.95, 0.55], face: [0.85, 0.2] }, desc: 'Rifle-rated, and a visor that stops handgun rounds to the face.' },
    // ---------------------------------------------------------------- belts (more pouches)
    { id: 'b.duty', kind: 'belt', brand: B.gray, name: 'Duty belt', tier: 1, price: 120, speed: 1, molle: [4, 1], pouches: [['q.pistol', 0, 0]], desc: 'One row of MOLLE, one pistol magazine pouch as issued. Too shallow for rifle pouches.' },
    { id: 'b.battle', kind: 'belt', brand: B.kest, name: 'Battle belt', tier: 2, price: 400, speed: 1, molle: [6, 2], pouches: [['q.rifle', 0, 0], ['q.med', 1, 0]], desc: 'A magazine pouch and a medkit pouch as issued, plenty of MOLLE spare.' },
    // ---------------------------------------------------------------- the IFAK (its own slot, on the hip: medical gear only)
    { id: 'm.ifak', kind: 'ifak', brand: B.halc, name: 'IFAK', tier: 1, price: 150, speed: 1, sz: [2, 3], grids: [[2, 3, MED]], desc: 'Individual first aid kit: room for a bandage, a tourniquet, gauze, a chest seal and a splint.' },
    { id: 'b.war', kind: 'belt', brand: B.para, name: 'War belt with dump pouch', tier: 3, price: 700, speed: 0.995, molle: [7, 2], pouches: [['q.dump', 0, 0]], desc: 'Comes with its dump pouch and nothing else: wide MOLLE to fill.' },
    // ---------------------------------------------------------------- backpacks (one big grid; a big enough one takes a spare gun)
    { id: 'k.sling', kind: 'pack', brand: B.gray, name: 'Sling pack', tier: 1, price: 250, speed: 1, sz: [3, 3], grids: [[4, 3, null]], desc: 'Room for spare magazines, a pistol or a compact SMG.' },
    { id: 'k.assault', kind: 'pack', brand: B.kest, name: '3-day assault pack', tier: 2, price: 650, speed: 0.99, sz: [3, 4], grids: [[5, 3, null]], desc: 'Takes a carbine or shotgun, with a row to spare.' },
    { id: 'k.ruck', kind: 'pack', brand: B.sable, name: 'Large rucksack', tier: 3, price: 1200, speed: 0.97, sz: [4, 4], grids: [[6, 5, null]], desc: 'Any long gun, even a sniper rifle or an LMG, and plenty besides. Heavy.' },
  ];
  const DEFS = {};
  LIST.forEach((d) => (DEFS[d.id] = d));
  // pouches: w x h is what they hold (their grid inside, and their size stowed); mw x mh is the MOLLE they
  // take mounted (the same unless said: a rifle mag pouch or a med pouch hangs from one 1x1 slot)
  const POUCHES = {
    'q.pistol': { name: 'Pistol mag pouch', brand: B.gray, w: 2, h: 1, mw: 1, mh: 1, split: 2, acc: MAG, price: 30, desc: 'Two pockets, a pistol magazine, speedloader or box of shells in each, from a single MOLLE slot.' },
    'q.rifle': { name: 'Rifle mag pouch', brand: B.kest, w: 1, h: 2, mw: 1, mh: 1, acc: MAG, price: 45, desc: 'One rifle magazine, from a single MOLLE slot.' },
    'q.rifle2': { name: 'Double rifle mag pouch', brand: B.iron, w: 2, h: 2, acc: MAG, price: 85, desc: 'Two rifle magazines side by side (or four pistol ones).' },
    'q.rifle3': { name: 'Triple mag shingle', brand: B.para, w: 3, h: 2, acc: MAG, price: 120, desc: 'Three rifle magazines in one wide pouch, or an LMG box.' },
    'q.dump': { name: 'Dump pouch', brand: B.vant, w: 2, h: 2, mw: 2, mh: 1, acc: null, dump: true, price: 60, desc: 'Takes anything. A dump reload (double-tap R) drops the old magazine in here instead of on the floor.' },
    'q.med': { name: 'Med pouch', brand: B.halc, w: 2, h: 2, mw: 1, mh: 1, acc: MED, price: 60, desc: 'A 2×2 roll-out medical pouch on a single MOLLE slot: a splint and a few more.' },
  };
  // how gear sits in the locker
  const GEAR_SIZE = { carrier: [3, 3], plate: [2, 3], helmet: [2, 2], face: [2, 2], belt: [3, 1], pack: [3, 3], ifak: [2, 3] };
  // A gun as an item (stowed in a backpack or the locker): it's the weapon itself, magazine, build and all.
  // Long guns are wide: a pistol 2x1, a compact SMG 3x2, a carbine, rifle or shotgun 5x2, a sniper rifle or
  // LMG 6x2.
  function gunSize(def) {
    if (def.slot === 's') return [2, 1];
    if (def.id === 'thompson' || def.id === 'ppsh' || def.cls === 'GL') return [4, 2];
    if (def.cls === 'SMG') return [3, 2];
    if (def.cls === 'SNP' || def.cls === 'LMG' || def.cls === 'RAIL' || ['svd', 'mk14', 'fal', 'garand', 'mosin'].includes(def.id)) return [6, 2];
    return [5, 2];
  }

  // ---------------------------------------------------------------- ammo items
  // What a gun reloads from: magazines (and speedloaders and en-bloc clips) for that gun, or loose rounds of
  // its caliber in a box. Magazines belong to one gun; boxes of a caliber feed every gun that takes it.
  // Rounds come in types (G.AMMO): a box holds one type, and so does a magazine (loaded from a box).
  const bigBox = (cal) => { const g = (G.CALIBERS[cal] || {}).group; return g === 'grenade' || g === 'bolt'; };
  function ammoFor(def) {
    const loose = def.shell || def.mag <= 2;
    if (loose) {
      const cal = G.calOf(def), C = G.CALIBERS[cal];
      return { kind: 'ammo', key: cal, w: 1, h: bigBox(cal) ? 2 : 1, cap: C.box, label: C.name };
    }
    const plat = G.Gunsmith.PLATFORMS[def.id], rev = plat && plat.arch === 'revolver';
    if (G.beltFed(def)) return { kind: 'mag', key: def.id, w: 2, h: 2, cap: def.mag, label: 'BOX' };
    return { kind: 'mag', key: def.id, w: 1, h: def.mag <= 20 ? 1 : 2, cap: def.mag, label: rev ? 'LOADER' : def.enbloc ? 'CLIP' : 'MAG' };
  }
  let uid = 1;
  const item = (o) => Object.assign({ uid: uid++ }, o);
  // A magazine holds its rounds in order: r is the stack, bottom first, so the last round loaded is the
  // first fired, and a magazine can hold mixed types (a few tracers at the bottom, say). n and am are read
  // from it: the count, and the type of the round on top (or what it last held, when empty).
  function magItem(o, rounds) {
    const it = item(o);
    it.r = rounds;
    Object.defineProperty(it, 'n', { get() { return this.r.length; }, enumerable: true });
    Object.defineProperty(it, 'am', { get() { return this.r.length ? this.r[this.r.length - 1] : this.base; }, set(v) { this.base = v; }, enumerable: true });
    return it;
  }
  const mixed = (it) => !!(it && it.r && it.r.some((t) => t !== it.r[0]));
  // An item as plain data (to send, or to leave lying on the floor), and back. Everything inside comes with
  // it: a container's grids and what's in them, a carrier's MOLLE and plate, a gun's build and rounds.
  function pack(it) {
    const o = {};
    for (const k of Object.keys(it)) {
      if (k === 'uid' || (it.r && (k === 'n' || k === 'am'))) continue;
      const v = it[k];
      if (k === 'w') o.w = { id: v.def.id, build: Object.assign({}, v.def.build), mag: v.mag, ammo: v.ammo, tube: (v.tube || []).slice(), noMag: !!v.noMag, fm: v.fm, chamber: v.chamber || null };
      else if (k === 'grids') o.grids = v.map(packGrid);
      else if (k === 'molle') o.molle = packGrid(v);
      else if (k === 'plate' || k === 'face') o[k] = v ? pack(v) : null;
      else o[k] = v && typeof v === 'object' ? JSON.parse(JSON.stringify(v)) : v;
    }
    if (it.r) o.am0 = it.base; // what an empty magazine last held
    return o;
  }
  function packGrid(g) {
    const o = {};
    for (const k of Object.keys(g)) if (k !== 'id' && k !== 'items') o[k] = Array.isArray(g[k]) ? g[k].slice() : g[k];
    o.items = g.items.map((p) => ({ x: p.x, y: p.y, r: p.r, it: pack(p.it) }));
    return o;
  }
  function unpack(o) {
    if (o.k === 'gun' && o.w) {
      const w = G.Me.makeWeapon(o.w.id, o.w.build);
      w.mag = o.w.mag; w.ammo = o.w.ammo; w.tube = (o.w.tube || []).slice(); if (o.w.noMag) w.noMag = true; if (o.w.fm) w.fm = o.w.fm;
      if ('chamber' in o.w) w.chamber = o.w.chamber;
      return gunItem(w);
    }
    const rest = {};
    for (const k of Object.keys(o)) if (!['grids', 'molle', 'plate', 'face', 'r', 'am0'].includes(k)) rest[k] = o[k] && typeof o[k] === 'object' ? JSON.parse(JSON.stringify(o[k])) : o[k];
    const it = o.r ? magItem(rest, o.r.slice()) : item(rest);
    if (o.r) it.base = o.am0 || o.r[o.r.length - 1];
    if (o.grids) it.grids = o.grids.map(unpackGrid);
    if (o.molle) it.molle = unpackGrid(o.molle);
    if ('plate' in o) it.plate = o.plate ? unpack(o.plate) : null;
    if ('face' in o) it.face = o.face ? unpack(o.face) : null;
    return it;
  }
  function unpackGrid(o) {
    const g = grid(o.w, o.h, o.accept, o.label);
    for (const k of Object.keys(o)) if (!['w', 'h', 'accept', 'label', 'items'].includes(k)) g[k] = o[k];
    g.items = (o.items || []).map((p) => ({ x: p.x, y: p.y, r: p.r, it: unpack(p.it) }));
    return g;
  }
  // A full magazine (or box) for a gun, of ball unless said otherwise. vid: which magazine (a variant part:
  // compact, extended, drum...), by default the kind that's in that gun now, or its standard one.
  const magVid = (def, vid) => vid || (def.build && def.build.mag) || G.Gunsmith.defaultBuild(def.id).mag || null;
  function ammoItem(def, n, am, vid) {
    const a = ammoFor(def), type = am || G.ballFor(G.calOf(def));
    if (a.kind !== 'mag') { const count = n == null ? a.cap : n; return item({ k: a.kind, key: a.key, wid: def.id, cap: Math.max(count, boxCap(a.key)), n: count, am: type }); }
    const v = magVid(def, vid), cap = G.Gunsmith.magCap(def.id, v), count = Math.min(cap, n == null ? cap : n);
    const it = magItem({ k: 'mag', key: a.key, wid: def.id, cap, vid: v }, Array(count).fill(type));
    it.base = type;
    return it;
  }
  // a magazine's shape in the grid, by what it holds
  function magShape(def, cap, vid) {
    const a = ammoFor(def), drum = vid && G.Gunsmith.PARTS[vid] && G.Gunsmith.PARTS[vid].model && G.Gunsmith.PARTS[vid].model.mag && G.Gunsmith.PARTS[vid].model.mag.t === 'drum';
    if (G.beltFed(def)) return cap > def.mag * 1.2 ? [2, 3] : cap < def.mag * 0.8 ? [2, 1] : [2, 2];
    if (a.label !== 'MAG') return [1, 1]; // speedloaders, clips
    if (drum || cap > 60) return [2, 2];
    return [1, cap <= 20 ? 1 : 2];
  }
  // what a magazine's called: the gun and the variant
  function magName(it) {
    const def = G.WEAPONS[it.wid] || { name: it.wid }, p = it.vid && G.Gunsmith.PARTS[it.vid];
    if (p && p.fam) return p.name; // a shared magazine goes by its pattern (STANAG 5.56 30-round magazine)
    if (p && !p.factory) return `${def.name} · ${p.name.replace(/^\S+ /, '')}`;
    return `${def.name} ${it.cap}-round ${ammoFor(def).label === 'MAG' ? 'magazine' : ammoFor(def).label.toLowerCase()}`;
  }
  // a box of loose rounds of a caliber
  // (a box holds two of the boxes you buy: the caliber's box size is what's sold, twice that is what fits)
  const boxCap = (cal) => G.CALIBERS[cal].box * 2;
  function boxItem(cal, am, n) { return item({ k: 'ammo', key: cal, am, cap: Math.max(n, boxCap(cal)), n }); }
  // Pour one box into another of the same caliber and type, as far as it'll go. Returns the rounds moved.
  function mergeBox(from, into) {
    if (from === into || from.k !== 'ammo' || into.k !== 'ammo' || from.key !== into.key || from.am !== into.am) return 0;
    const t = Math.min(into.cap - into.n, from.n);
    into.n += t; from.n -= t;
    return t;
  }
  // a box arriving: topped into the part-used boxes of its kind in these grids first; what's left (n may now
  // be 0) still needs a place
  function absorb(it, grids) {
    if (it.k === 'med') { if (medStack(it) > 1) each(grids, (b) => { if (it.n > 0 && b !== it) mergeMed(it, b); }); return; }
    if (it.k !== 'ammo') return;
    each(grids, (b) => { if (it.n > 0 && b !== it && b.k === 'ammo' && b.n < b.cap) mergeBox(it, b); });
  }
  // every part-used box of that kind in these grids combined into as few as will hold them (the emptied ones go)
  function combine(grids, key, am) {
    const list = [];
    each(grids, (b, g) => { if (b.k === 'ammo' && b.key === key && b.am === am) list.push([b, g]); });
    list.sort((a, c) => c[0].n - a[0].n); // fill the fullest first
    let moved = 0;
    for (let i = 0; i < list.length; i++) for (let j = list.length - 1; j > i; j--) moved += mergeBox(list[j][0], list[i][0]);
    for (const [b, g] of list) if (b.n <= 0) removeFrom(g, b);
    return moved;
  }
  function gearItem(id) {
    const d = DEFS[id];
    const it = item({ k: d.kind, gid: id, dur: d.dur || 0 });
    if (d.grids) it.grids = d.grids.map(([w, h, acc]) => Object.assign(grid(w, h, acc), d.kind === 'pack' ? { pack: true } : {}));
    if (d.molle) { it.molle = Object.assign(grid(d.molle[0], d.molle[1], ['pouch'], 'MOLLE'), { molle: true }); for (const [pid, x, y] of d.pouches || []) put(it.molle, pouchItem(pid), x, y, 0); }
    if (d.kind === 'carrier') it.plate = null;
    if (d.kind === 'helmet' && d.face) it.face = null; // the mount for a face shield or mandible
    return it;
  }
  // a weapon's item (made once and kept on it, so it's the same item wherever it goes)
  function gunItem(w) { if (!w.item) Object.defineProperty(w, 'item', { value: item({ k: 'gun', w }), enumerable: false }); return w.item; }
  // (split: that many separate 1x1 pockets side by side, instead of one w x h grid)
  function pouchItem(pid) { const P = POUCHES[pid]; return item({ k: 'pouch', pid, grids: P.split ? Array.from({ length: P.split }, () => grid(1, 1, P.acc)) : [Object.assign(grid(P.w, P.h, P.acc), P.dump ? { dump: true } : {})] }); }
  // a weapon part (off the gun): its footprint by what it is
  function partItem(pid) { return item({ k: 'part', pid }); }
  const PART_SIZE = { barrel: [3, 1], limbs: [3, 1], handguard: [2, 1], stock: [2, 1], slide: [2, 1], pump: [2, 1], tube: [2, 1], mag: [1, 2] };
  function partSize(pid) {
    const p = G.Gunsmith.PARTS[pid];
    if (!p) return [1, 1];
    if (p.slot === 'optic') return p.set && p.set.magnif > 1.5 ? [2, 1] : [1, 1];
    if (p.slot === 'muzzle') return p.set && p.set.sup ? [2, 1] : [1, 1];
    return PART_SIZE[p.slot] || [1, 1];
  }
  // a medical item (js/medical.js: bandage, tourniquet, gauze, seal, splint, pills)
  const medItem = (mt = 'bandage', n = 1) => item({ k: 'med', mt, n });
  // how many of a medical item go in one slot (bandages and painkillers stack)
  const medStack = (it) => (it && it.k === 'med' && G.Med.ITEMS[it.mt] && G.Med.ITEMS[it.mt].stack) || 1;
  // one stack of medical items onto another of the same kind, as far as it goes; returns how many moved
  function mergeMed(from, into) {
    if (from === into || from.k !== 'med' || into.k !== 'med' || from.mt !== into.mt) return 0;
    const t = Math.min(medStack(into) - (into.n || 1), from.n || 1);
    if (t <= 0) return 0;
    into.n = (into.n || 1) + t; from.n = (from.n || 1) - t;
    return t;
  }
  // medical items you carry, counting what's in each stack
  function medCount(me) { let n = 0; each(body(me), (it) => { if (it.k === 'med') n += it.n || 1; }); return n; }
  const fragItem = () => item({ k: 'frag' });
  const flashItem = () => item({ k: 'flash' }); // a flashbang: blinds and deafens, hurts nobody

  // ---------------------------------------------------------------- grids
  let gid = 1;
  function grid(w, h, accept, label) { return { id: gid++, w, h, accept: accept || null, label: label || '', items: [] }; }
  // an item's footprint [w, h], turned or not
  // (g: the grid it's in or going into: a pouch on MOLLE takes its mounted size)
  function size(it, rot, g) {
    let w = 1, h = 1;
    if (it.k === 'mag') [w, h] = magShape(G.WEAPONS[it.wid], it.cap, it.vid);
    else if (it.k === 'ammo') h = bigBox(it.key) ? 2 : 1;
    else if (it.k === 'gun') [w, h] = gunSize(it.w.def);
    else if (it.k === 'pouch') { const P = POUCHES[it.pid], m = g && g.molle; w = m ? P.mw || P.w : P.w; h = m ? P.mh || P.h : P.h; }
    else if (it.k === 'part') [w, h] = partSize(it.pid);
    else if (it.k === 'med') [w, h] = (G.Med.ITEMS[it.mt] || G.Med.ITEMS.bandage).size;
    else if (it.gid && DEFS[it.gid].sz) [w, h] = DEFS[it.gid].sz;
    else if (GEAR_SIZE[it.k]) [w, h] = GEAR_SIZE[it.k];
    return rot ? [h, w] : [w, h];
  }
  const isGear = (it) => !!GEAR_SIZE[it.k];
  function fits(g, it, x, y, rot, ignore) {
    const [w, h] = size(it, rot, g);
    if (x < 0 || y < 0 || x + w > g.w || y + h > g.h) return false;
    if (g.accept && !g.accept.includes(it.k)) return false;
    if (isGear(it) && !g.locker) return false; // gear only goes in the locker
    if (it.k === 'gun' && !g.locker && !g.pack) return false; // guns in a backpack or the locker
    if (it.k === 'pouch' && !g.locker && !g.pack && !g.molle) return false; // pouches on MOLLE (or stored)
    if (g.molle && (it.k !== 'pouch' || rot)) return false; // and only pouches on MOLLE, upright
    for (const p of g.items) {
      if (p.it === ignore) continue;
      const [pw, ph] = size(p.it, p.r, g);
      if (x < p.x + pw && x + w > p.x && y < p.y + ph && y + h > p.y) return false;
    }
    return true;
  }
  function put(g, it, x, y, rot) { g.items.push({ it, x, y, r: rot ? 1 : 0 }); }
  function findSpot(g, it) {
    for (const rot of [0, 1]) for (let y = 0; y < g.h; y++) for (let x = 0; x < g.w; x++) if (fits(g, it, x, y, rot)) return { x, y, rot };
    return null;
  }
  function place(grids, it) {
    for (const g of grids) { const s = findSpot(g, it); if (s) { put(g, it, s.x, s.y, s.rot); return g; } }
    return null;
  }
  function removeFrom(g, it) { const i = g.items.findIndex((p) => p.it === it); if (i >= 0) g.items.splice(i, 1); }

  // ---------------------------------------------------------------- a player's kit
  // Me.kit = { helmet, carrier, belt } (items); Me.pockets: two 1x2 grids and two 1x1; Me.locker: the stash grid
  function newKit(me) {
    me.kit = { helmet: null, carrier: null, belt: null, pack: null, ifak: null };
    me.pockets = [[1, 2], [1, 2], [1, 1], [1, 1]].map(([w, h]) => grid(w, h, null, 'Pocket'));
    me.locker = grid(9, 7, null, 'Locker');
    me.locker.locker = true;
  }
  // every grid you carry, pockets first
  function body(me) {
    const out = [...me.pockets];
    out.push(...mounted(me.kit.carrier), ...mounted(me.kit.belt));
    if (me.kit.pack) out.push(...me.kit.pack.grids);
    if (me.kit.ifak) out.push(...me.kit.ifak.grids);
    return out;
  }
  // the grids of the pouches mounted on a carrier's or belt's MOLLE
  // (left to right across the panel, top to bottom in a column: the order you'd reach for them)
  function mounted(gear) { return gear && gear.molle ? [...gear.molle.items].sort((a, b) => a.x - b.x || a.y - b.y).flatMap((p) => p.it.grids) : []; }
  // the MOLLE panels you wear
  function molles(me) { return [me.kit.carrier, me.kit.belt].filter((g) => g && g.molle).map((g) => g.molle); }
  // the guns you have: in your hands, then any stowed in your backpack or locker
  function guns(me) {
    const out = Object.values(me.weapons).filter(Boolean);
    each(all(me), (it) => { if (it.k === 'gun') out.push(it.w); });
    return out;
  }
  // the guns in your backpack, as [item, grid]
  function packGuns(me) { const out = []; if (me.kit.pack) each(me.kit.pack.grids, (it, g) => { if (it.k === 'gun') out.push([it, g]); }); return out; }
  // In a level you only have what you carry: the locker is back at the quartermaster's.
  const inField = () => !!(G.Game && G.Game.phase === 'level' && !G.Game.hub); // (the hangar's between levels: your stash is there)
  function all(me) { return inField() ? [...body(me), ...molles(me)] : [...body(me), ...molles(me), me.locker]; }
  function each(grids, fn) { for (const g of grids) for (const p of [...g.items]) fn(p.it, g, p); }
  // what a gun can reload from, on you
  // what a gun can be fed from on you: its magazines, or boxes of its caliber
  const feeds = (me, def) => { const a = ammoFor(def), cal = G.calOf(def), out = []; each(body(me), (it, g) => { if (it.k === a.kind && (a.kind === 'mag' ? G.magFits(it.wid, def.id) : it.key === cal) && it.n > 0) out.push({ it, g }); }); return out; };
  // rounds you carry for a gun (the HUD's reserve)
  const rounds = (me, def) => feeds(me, def).reduce((a, f) => a + f.it.n, 0);
  const count = (me, k) => { let n = 0; each(body(me), (it) => { if (it.k === k) n++; }); return n; };
  function take(me, k) { for (const g of body(me)) { const p = g.items.find((q) => q.it.k === k); if (p) { removeFrom(g, p.it); return p.it; } } return null; }
  // Reloading. A magazine gun swaps magazines: the fullest one on you goes in, the one that was in goes into
  // its pouch (an empty en-bloc clip is thrown away). Loose rounds come out of the emptiest box first.
  // Which magazine a reload reaches for: the fullest with more in it than the gun has, from your pouches and
  // pockets; only if there's none there, from your backpack (slow: you're digging for it).
  const inPack = (me, g) => !!(me.kit.pack && me.kit.pack.grids.includes(g));
  // Any magazine with rounds in it will do (even one with fewer than the gun has: you asked for it): the one
  // with the most rounds, and between equals the first you come to (pockets, then the rig's pouches left to
  // right, then the belt, each top to bottom). The backpack only when there's nothing nearer.
  function pickMag(me, w) {
    const grids = body(me), rank = (f) => { const p = f.g.items.find((q) => q.it === f.it); return grids.indexOf(f.g) * 1000 + (p ? p.y * 50 + p.x : 0); };
    const fs = feeds(me, w.def).filter((f) => f.it.n > 0), near = fs.filter((f) => !inPack(me, f.g));
    const best = (near.length ? near : fs).sort((a, b) => b.it.n - a.it.n || rank(a) - rank(b))[0];
    return best ? Object.assign(best, { pack: inPack(me, best.g) }) : null;
  }
  // a dump pouch with room for one of that gun's magazines
  function dumpGrid(me, def) { const probe = ammoItem(def, 0); return body(me).find((g) => g.dump && findSpot(g, probe)) || null; }
  // A dump reload: the fresh magazine in, the old one into the dump pouch (dest) if there's room, else it's
  // on the floor (where you can pick it up again). Returns 'pouch', 'floor' or null; me.dumped is the
  // magazine that hit the floor.
  function dumpMag(me, w, cap, dest) {
    const best = pickMag(me, w);
    if (!best) return null;
    removeFrom(best.g, best.it);
    if (w.noMag) { loadIn(me, w, best.it); w.noMag = false; return 'none'; } // nothing in it to dump
    const old = best.it;
    exchange(me, w, old);
    const g = dest && findSpot(dest, old) ? dest : null;
    if (g) { const s = findSpot(g, old); put(g, old, s.x, s.y, s.rot); return 'pouch'; }
    me.dumped = old;
    return 'floor';
  }
  // a gun's rounds are now these (the magazine's own stack: the gun fires off the top of it)
  function setLoad(w, rounds) { w.tube = rounds; w.mag = rounds.length; if (rounds.length) w.ammo = rounds[rounds.length - 1]; }
  // a magazine goes in: its rounds are the gun's, and its variant is the gun's magazine (capacity, reload)
  function loadIn(me, w, mag) {
    setLoad(w, mag.r);
    if (mag.vid && w.def.build && w.def.build.mag !== mag.vid && me.refit) me.refit(w, Object.assign({}, w.def.build, { mag: mag.vid }));
  }
  // the magazine item becomes the one that was in the gun (its rounds and its variant), and the gun gets what
  // the item held
  function exchange(me, w, mag) {
    const inR = mag.r, inV = mag.vid, inCap = mag.cap, outV = w.def.build && w.def.build.mag;
    mag.r = w.tube || []; mag.base = w.ammo;
    if (outV) { mag.vid = outV; mag.cap = G.Gunsmith.magCap(w.def.id, outV); }
    loadIn(me, w, { r: inR, vid: inV, cap: inCap });
  }
  // A normal (retention) reload: the old magazine goes back in the pouch the fresh one came out of.
  function swapMag(me, w, cap) {
    const best = pickMag(me, w);
    if (!best) return false;
    if (w.noMag) { removeFrom(best.g, best.it); loadIn(me, w, best.it); w.noMag = false; return true; }
    exchange(me, w, best.it);
    // (a clip that came out empty goes back where the full one came from, like a magazine)
    return true;
  }
  // Loose rounds out of your boxes: the type you're already using first (prefer), else the first box you
  // carry; the emptiest box of a type goes first. Returns the type of each round taken.
  function takeRounds(me, def, want, prefer) {
    const out = [], fs = feeds(me, def);
    const first = fs.find((f) => f.it.am === prefer) ? prefer : fs.length ? fs[0].it.am : null;
    for (const f of fs.filter((q) => q.it.am === first).sort((a, b) => a.it.n - b.it.n)) {
      const t = Math.min(want - out.length, f.it.n);
      f.it.n -= t; for (let i = 0; i < t; i++) out.push(f.it.am);
      if (f.it.n <= 0) removeFrom(f.g, f.it);
      if (out.length >= want) break;
    }
    return out;
  }
  // Loading a magazine from a box of its caliber: the rounds go in on top of whatever's there (mixed types
  // are fine; they come out in reverse order). Returns the rounds loaded.
  function loadMag(me, mag, box) {
    if (mag.k !== 'mag' || box.k !== 'ammo' || box.key !== G.calOf(G.WEAPONS[mag.wid]) || mag.n >= mag.cap) return 0;
    const n = Math.min(mag.cap - mag.n, box.n);
    for (let i = 0; i < n; i++) mag.r.push(box.am);
    box.n -= n;
    if (box.n <= 0) each(all(me), (it, g) => { if (it === box) removeFrom(g, it); });
    return n;
  }
  // Every magazine you own topped up from your boxes (same type first; an empty one takes any), and the guns
  // themselves. Returns the rounds loaded.
  function loadAll(me) {
    let n = 0;
    const boxes = () => { const o = []; each(all(me), (it) => { if (it.k === 'ammo' && it.n > 0) o.push(it); }); return o; };
    each(all(me), (mag) => {
      if (mag.k !== 'mag' || mag.n >= mag.cap) return;
      const cal = G.calOf(G.WEAPONS[mag.wid]);
      const list = boxes().filter((q) => q.key === cal).sort((a, c) => (c.am === mag.am ? 1 : 0) - (a.am === mag.am ? 1 : 0));
      for (const b of list) {
        n += loadMag(me, mag, b);
        if (mag.n >= mag.cap) break;
      }
    });
    for (const w of guns(me)) {
      if (w.noMag) continue; // no magazine in it to load
      const cap = me.magSize(w.def), cal = G.calOf(w.def);
      if (G.chambered(w.def) && !w.chamber) { const b = boxes().find((q) => q.key === cal); if (b) { w.chamber = b.am; b.n--; n++; if (b.n <= 0) each(all(me), (it, g) => { if (it === b) removeFrom(g, it); }); } }
      for (const b of boxes().filter((q) => q.key === cal).sort((a, c) => (c.am === w.ammo) - (a.am === w.ammo))) {
        if (w.mag >= cap) break;
        const t = Math.min(cap - w.mag, b.n);
        w.mag += t; b.n -= t; w.ammo = b.am; n += t;
        if (w.tube) for (let i = 0; i < t; i++) w.tube.push(b.am);
        if (b.n <= 0) each(all(me), (it, g) => { if (it === b) removeFrom(g, it); });
      }
    }
    return n;
  }
  // somewhere for a new item: near `pref` if given, else on you, else the locker (which grows if it's full)
  // (in a level: only on you, unless the locker's asked for by name; false if there's no room)
  function stow(me, it, pref) {
    const gs = [...(pref || []), ...body(me), ...(inField() ? [] : [me.locker])];
    absorb(it, gs); // loose rounds top up the boxes you have first (and bandages their stacks)
    if ((it.k === 'ammo' || it.k === 'med') && it.n <= 0) return true;
    if (place(gs, it)) return true;
    if (inField() && !(pref || []).includes(me.locker)) return false;
    me.locker.h += 2;
    return !!place([me.locker], it);
  }
  // is there room on you for a box of those rounds (before unloading in the field)?
  const roomFor = (me, it) => body(me).some((g) => findSpot(g, it));
  // the rounds in a magazine (or gun) as boxes, one per type: counts [[type, n], ...]
  function toBoxes(me, cal, counts, pref) { for (const [am, n] of counts) if (n > 0) stow(me, boxItem(cal, am, n), pref); }
  function unloadMag(me, mag, pref) {
    if (mag.k !== 'mag' || !mag.n) return 0;
    const n = mag.n, counts = new Map();
    for (const t of mag.r) counts.set(t, (counts.get(t) || 0) + 1);
    toBoxes(me, G.calOf(G.WEAPONS[mag.wid]), [...counts], pref);
    mag.base = mag.am; mag.r.length = 0; // emptied in place (it may be the one in a gun)
    return n;
  }
  // a gun's loaded rounds out (a tube keeps its order of types)
  function unloadGun(me, w) {
    const n = w.mag + (w.chamber ? 1 : 0);
    if (!n) return 0;
    const counts = new Map();
    if (w.tube && w.tube.length) for (const t of w.tube) counts.set(t, (counts.get(t) || 0) + 1); else if (w.mag) counts.set(w.ammo, w.mag);
    if (w.chamber) { counts.set(w.chamber, (counts.get(w.chamber) || 0) + 1); w.chamber = null; }
    toBoxes(me, G.calOf(w.def), [...counts]);
    w.mag = 0; if (w.tube) w.tube.length = 0;
    return n;
  }
  // one magazine topped up from your boxes of its caliber (same type first)
  function fillMag(me, mag) {
    let n = 0;
    const cal = G.calOf(G.WEAPONS[mag.wid]), boxes = [];
    each(all(me), (it) => { if (it.k === 'ammo' && it.n > 0 && it.key === cal) boxes.push(it); });
    boxes.sort((a, c) => (c.am === mag.am ? 1 : 0) - (a.am === mag.am ? 1 : 0));
    for (const b of boxes) { n += loadMag(me, mag, b); if (mag.n >= mag.cap) break; }
    return n;
  }
  // a box's rounds into the magazines that take them
  function fillFrom(me, box) {
    let n = 0;
    each(all(me), (mag) => { if (box.n > 0 && mag.k === 'mag' && mag.n < mag.cap && G.calOf(G.WEAPONS[mag.wid]) === box.key) n += loadMag(me, mag, box); });
    return n;
  }
  // a loose-fed gun (tube, break-action) loaded from your boxes
  function fillGun(me, w) {
    let n = 0;
    const cap = me.magSize(w.def), cal = G.calOf(w.def);
    each(all(me), (b, g) => {
      if (b.k !== 'ammo' || b.key !== cal || w.mag >= cap) return;
      const t = Math.min(cap - w.mag, b.n);
      w.mag += t; b.n -= t; w.ammo = b.am; n += t;
      if (w.tube) for (let i = 0; i < t; i++) w.tube.push(b.am);
      if (b.n <= 0) removeFrom(g, b);
    });
    return n;
  }
  // Weapon parts you own but haven't fitted are items (in your locker, or wherever you put them). The old
  // { partId: count } stash still works on top of them, for the gunsmith: reading a part's count counts its
  // items, setting it adds items (to the locker) or takes them away.
  function partCount(me, pid) { let n = 0; each(all(me), (it) => { if (it.k === 'part' && it.pid === pid) n++; }); return n; }
  function stashProxy(me) {
    return new Proxy({}, {
      get(_, pid) { return typeof pid === 'string' && G.Gunsmith.PARTS[pid] ? partCount(me, pid) || undefined : undefined; },
      set(_, pid, v) {
        let have = partCount(me, pid);
        for (; have < v; have++) stow(me, partItem(pid), [me.locker]);
        for (; have > v; have--) { let done = false; for (const g of [me.locker, ...body(me)]) { const p = !done && g.items.find((q) => q.it.k === 'part' && q.it.pid === pid); if (p) { removeFrom(g, p.it); done = true; } } if (!done) break; }
        return true;
      },
      deleteProperty(_, pid) { this.set(_, pid, 0); return true; },
      has(_, pid) { return partCount(me, pid) > 0; },
    });
  }
  // a gun leaving you (into the weapon case): its magazines go with it; returns the rounds handed over
  function handOver(me, def) {
    let n = 0;
    // (its magazines: any of its pattern, unless another gun of yours takes them too, in which case they stay)
    const others = guns(me).filter((w) => w.def.id !== def.id);
    each(body(me), (it, g) => { if (it.k === 'mag' && G.magFits(it.wid, def.id) && !others.some((w) => G.magFits(it.wid, w.def.id))) { n += it.n; removeFrom(g, it); } });
    return n;
  }
  // a gun arriving: the rounds that came with it, as full magazines (or boxes) where they fit on you
  // ...of one type; what doesn't fit on you is dropped at your feet. { placed, dropped }
  function receive(me, def, nRounds, am) {
    const a = ammoFor(def), cal = G.calOf(def);
    let left = nRounds, placed = 0, dropped = 0;
    while (left > 0 && placed + dropped < 6) {
      const n = Math.min(a.cap, left), it = a.kind === 'mag' ? ammoItem(def, n, am) : boxItem(cal, am || G.ballFor(cal), n);
      if (place(body(me), it)) placed++;
      else { dropped++; if (G.Casings && me.pos) G.Casings.dropAt(def, it, me.pos); }
      left -= n;
    }
    return { placed, dropped };
  }
  // the gunsmith changed a gun's magazine size: its magazines follow
  function refitMags() { /* magazines keep their own capacity: it's theirs, not the gun's */ }

  // ---------------------------------------------------------------- protection
  const defOf = (it) => (it ? DEFS[it.gid] : null);
  const cond = (it) => { const d = defOf(it); return d && d.dur ? it.dur / d.dur : 0; };
  // which piece of kit a round to that zone meets: the helmet for the head and face, the plate over the chest
  // (if there is one), the carrier's soft armour anywhere else it covers
  function piece(me, zone, roll) {
    const k = me.kit;
    if (zone === 'face' && k.helmet && k.helmet.face) {
      const c = defOf(k.helmet.face).cover || 1;
      if (roll ? Math.random() < c : c >= 0.9) return k.helmet.face;
    }
    if (zone === 'head' || zone === 'face') return k.helmet;
    if (zone === 'chest' && k.carrier && k.carrier.plate) return k.carrier.plate;
    return k.carrier;
  }
  function speed(me) {
    const k = me.kit, ds = [k.helmet, k.helmet && k.helmet.face, k.carrier, k.carrier && k.carrier.plate, k.belt, k.pack, k.ifak].map(defOf).filter(Boolean);
    return ds.reduce((a, d) => a * (d.speed || 1), 1);
  }
  // the starting kit: a worn bump helmet and concealable vest, two spare pistol magazines in your pockets (no
  // grenade), and an IFAK with one of each
  // basic piece of medical gear (no painkillers)
  function starter(me) {
    newKit(me);
    const p9 = G.WEAPONS.p9;
    // two spare magazines of tracers (you see every round go), in the small pockets: the tall ones are left for rifle magazines
    put(me.pockets[2], ammoItem(p9, null, 'tracer'), 0, 0, 0); put(me.pockets[3], ammoItem(p9, null, 'tracer'), 0, 0, 0);
    // second-hand protection: a bump helmet and a concealable vest, both already half worn out
    me.kit.helmet = gearItem('h.bump'); me.kit.helmet.dur = DEFS['h.bump'].dur * 0.5;
    me.kit.carrier = gearItem('c.ghost'); me.kit.carrier.dur = DEFS['c.ghost'].dur * 0.5;
    me.kit.ifak = gearItem('m.ifak');
    const g = me.kit.ifak.grids[0];
    put(g, medItem('splint'), 0, 0, 0); // 1x2 down the left
    put(g, medItem('bandage'), 1, 0, 0); put(g, medItem('tourniquet'), 1, 1, 0);
    put(g, medItem('gauze'), 0, 2, 0); put(g, medItem('seal'), 1, 2, 0);
  }
  const roundPrice = (cal, am) => (G.CALIBERS[cal] ? G.CALIBERS[cal].per : 1) * (G.AMMO[am] ? G.AMMO[am].k : 1);
  // what an item's called and worth
  function label(it) {
    const tag = it.am && G.AMMO[it.am] ? G.AMMO[it.am].tag : '';
    if (it.k === 'mag') return `${magName(it)}${it.n ? ' · ' + (mixed(it) ? 'mixed, ' + tag + ' next' : tag) : ''}`;
    if (it.k === 'ammo') return `${(G.CALIBERS[it.key] || {}).name || it.key} ${tag}`;
    if (it.k === 'med') return (G.Med.ITEMS[it.mt] || G.Med.ITEMS.bandage).name; // (a stack's count is on its tile: n/most)
    if (it.k === 'frag') return 'Frag grenade';
    if (it.k === 'flash') return 'Flashbang';
    if (it.k === 'gun') return it.w.def.name;
    if (it.k === 'pouch') return POUCHES[it.pid].name;
    if (it.k === 'part') return (G.Gunsmith.PARTS[it.pid] || {}).name || it.pid;
    const d = defOf(it);
    return d ? d.name : it.k;
  }
  function price(it) {
    if (it.k === 'mag') { const cal = G.calOf(G.WEAPONS[it.wid]), v = it.vid && G.Gunsmith.PARTS[it.vid]; return Math.max(20 + Math.round((it.cap || 10) * 0.6), v && !v.factory ? Math.round(v.price * 0.6) : 0) + Math.round((it.r || []).reduce((a, t) => a + roundPrice(cal, t), 0)); }
    if (it.k === 'ammo') return Math.max(1, Math.round(it.n * roundPrice(it.key, it.am)));
    if (it.k === 'med') return (G.Med.ITEMS[it.mt] || G.Med.ITEMS.bandage).price * (it.n || 1);
    if (it.k === 'frag') return 200;
    if (it.k === 'flash') return 150;
    if (it.k === 'gun') return Math.floor(G.WEAPONS[it.w.def.id].price * 0.5); // sold for half: what a trade-in gets
    if (it.k === 'pouch') return POUCHES[it.pid].price;
    if (it.k === 'part') return (G.Gunsmith.PARTS[it.pid] || {}).price || 0;
    const d = defOf(it);
    return d ? d.price : 0;
  }
  return {
    LIST, DEFS, POUCHES, mixed, pack, unpack, mergeBox, mergeMed, medStack, medCount, absorb, combine, setLoad, loadIn, magShape, magName, magVid, BRANDS: B, ammoFor, ammoItem, gearItem, gunItem, pouchItem, mounted, molles, pickMag, dumpGrid, dumpMag, partItem, partSize, flashItem, stow, inField, roomFor, unloadMag, unloadGun, fillMag, fillFrom, fillGun, partCount, stashProxy, gunSize, guns, packGuns, medItem, fragItem, grid, size, isGear, fits, put, findSpot, place, removeFrom,
    newKit, starter, body, all, each, feeds, rounds, count, take, swapMag, takeRounds, handOver, receive, refitMags, boxItem, loadMag, loadAll, roundPrice,
    defOf, cond, piece, speed, label, price,
  };
})();
