'use strict';
// The level's acoustics: what the sound of a place does, shared by everything that makes sound in it (js/ambience.ts now;
// js/gunaudio.ts's reverb and echoes are next). Built once a level, from its tiles:
//   zones     the spaces sound fills: each floor's open tiles, split by the walls, and indoors split from out of doors.
//             Each has its volume (its own height: a room open to the floor above is two storeys of air; out of doors
//             there's no ceiling), its surface, and from those its reverberation time (Sabine: RT60 = 0.161 V / S α)
//   portals   where sound gets from one zone to the next: a door (open, or shut: through the leaf, dull and quiet), a
//             window (through the glass, or broken), an opening where indoors meets out of doors with no wall (a
//             garage's door up, a carport), a drop in the floor (a hall two storeys high, a stairwell)
// What's heard where you stand: listen() finds the strongest path from your zone to every other one, through the
// portals (a door's leaf, a pane, each passed takes its share), and how bright it still is (the dullest thing it passed).
type AcPortalKind = 'door' | 'window' | 'opening' | 'void';
interface AcZone {
  id: number; f: number; out: boolean; tiles: number; area: number; height: number; volume: number; surface: number;
  /** how much of what strikes its surfaces they take (0..1): from what its rooms are (ROOM_ALPHA), area-weighted */
  alpha: number; rt60: number;
  /** its plan's long and short extent (m), along its own axes: a room's shape wherever in it you stand */
  longM: number; shortM: number;
  /** what its walls, floor and ceiling take (α), what stands in it (per m² of floor), and its RT60 as measured (roomAt) */
  aw: number; af: number; ac: number; content: number; rt60m?: number;
  /** the same under 250 Hz (a stud wall's panel takes far more there; concrete no more; soft things less) */
  awL: number; afL: number; acL: number; contentL: number; cx: number; cz: number; y: number; portals: number[];
}
interface AcPortal { id: number; kind: AcPortalKind; a: number; b: number; cells: number; x: number; y: number; z: number; door?: LvDoor; win?: LvWin }
/** a room's measured response (js/acoustics.ts roomAt): the energy coming back over time (per bin of `bin` s, per ray), its
 *  first arrivals [t, energy], its whole against the direct sound's at 1 m, RT60 from its slope, its mean free path */
interface AcTrace { hist: Float32Array; bin: number; early: [number, number][]; wet: number; rt60: number; mfp: number; zone: number;
  /** the low band's (under 250 Hz): its energy response and its RT60 */
  histL: Float32Array; rt60L: number }
interface AcMapData { zones: AcZone[]; portals: AcPortal[]; zoneAt: Int32Array[]; NF: number }
/** what reaches you from a zone: its level (0..1, energy through the portals), how bright (a low-pass cutoff, Hz), and the
 *  portal it comes in by last (where it seems to come from), null for your own zone */
interface AcReach { level: number; lp: number; via: AcPortal | null; hops: number }

const G_Acoustics = (() => {
  const data = new WeakMap<LvMap, AcMapData>();
  const TS = () => G.Level.TS, WALL = () => G.Level.WALL_H || 4;
  // What the surfaces take of the sound that strikes them (α, mid frequencies), by what their face is: the walls', the
  // floor's and the ceiling's construction as js/materials.ts has it for the place (a flat's plasterboard on studs, the
  // foundry's brick, the bunker's concrete, cold storage's steel-skinned panels), its first layer facing the room.
  const FACE_ALPHA: Partial<Record<MatKey, number>> = {
    gypsum: 0.05, brick: 0.03, cmu: 0.08, concrete: 0.02, sheet: 0.05, mild: 0.03, steel: 0.03, iron: 0.03, alu: 0.03,
    ply: 0.12, pine: 0.1, hardwood: 0.08, mdf: 0.1, granite: 0.02, ceram: 0.02, glass: 0.03, pur: 0.05, card: 0.15,
    soil: 0.4, sand: 0.4, foliage: 0.4, goods: 0.3, fabric: 0.5, wool: 0.6, foam: 0.7,
  };
  // ...and under 250 Hz (125-250 Hz): a panel over an air gap flexes and takes the lows (plasterboard on studs about 0.2,
  // plywood 0.25, a pane 0.25); mass doesn't (concrete, brick, stone 0.01-0.03); soft things take less of the lows
  const FACE_ALPHA_LOW: Partial<Record<MatKey, number>> = {
    gypsum: 0.2, brick: 0.03, cmu: 0.1, concrete: 0.01, sheet: 0.1, mild: 0.04, steel: 0.04, iron: 0.04, alu: 0.06,
    ply: 0.25, pine: 0.15, hardwood: 0.15, mdf: 0.2, granite: 0.01, ceram: 0.01, glass: 0.25, pur: 0.1, card: 0.2,
    soil: 0.15, sand: 0.15, foliage: 0.15, goods: 0.25, fabric: 0.12, wool: 0.35, foam: 0.25,
  };
  const faceAlphaLow = (b: MatBuild | null | undefined) => { const m = b && (b.skin && b.skin.length ? b.skin[0][0] : b.core); return (m && FACE_ALPHA_LOW[m]) ?? 0.05; };
  const faceAlpha = (b: MatBuild | null | undefined) => { const m = b && (b.skin && b.skin.length ? b.skin[0][0] : b.core); return (m && FACE_ALPHA[m]) ?? 0.06; };
  // And what's in a room takes its share, as so much absorption per square metre of its floor: a furnished room's
  // chairs, beds, carpet and curtains a lot (0.8), a kitchen's cupboards or a corridor's doors and fittings less (0.5),
  // a works' machines and racking least (0.25) (CONTENT, by the room's type; floor in no room, DEFAULT_CONTENT). Bare
  // brick and concrete take almost nothing: it's what's in a room, and its openings, that stop it ringing for seconds.
  const SOFT: RoomType[] = ['living', 'bedroom', 'dining', 'office', 'cubicle', 'meeting', 'lobby', 'bar', 'cafe', 'seating', 'observe', 'giftshop', 'viewing', 'mart', 'store', 'aisle']; // (a shop's shelves packed with goods count as furnishing)
  const MID: RoomType[] = ['kitchen', 'kitchenette', 'bathroom', 'restroom', 'washroom', 'corridor', 'locker', 'cashier', 'control', 'breakroom', 'landing', 'greenhouse'];
  // Shops', offices' and their corridors' ceilings: suspended acoustic tiles (mineral fibre, α about 0.55), not the slab
  // above them, except in the works, the stores of goods and the bunker (bare slab and steel) and in homes (plaster)
  const TILED: RoomType[] = ['mart', 'store', 'aisle', 'cashier', 'office', 'cubicle', 'meeting', 'lobby', 'breakroom', 'control', 'observe', 'corridor', 'giftshop', 'cafe', 'kitchenette', 'restroom'];
  const BARE_THEMES = new Set(['Foundry', 'Warehouse', 'Cold Storage', 'Bunker', 'Hangar']);
  const TILE_ALPHA = 0.55, TILE_ALPHA_LOW = 0.35;
  const LOW_CONTENT = 0.6; // (what stands in a room takes 0.6 as much of the lows)
  const HARD: RoomType[] = ['melt', 'mill', 'loading', 'dock', 'mcc', 'catwalk', 'boss', 'hall'];
  // (a stockroom's shelves of cardboard boxes, a walk-in freezer's racks of product: nearly a furnished room's, 0.6)
  const STOCKED: RoomType[] = ['storage', 'storeroom', 'stockroom', 'freezer'];
  const DEFAULT_CONTENT = 0.4;
  const CONTENT = new Map<RoomType, number>([...SOFT.map((t) => [t, 0.8] as [RoomType, number]), ...MID.map((t) => [t, 0.5] as [RoomType, number]), ...HARD.map((t) => [t, 0.25] as [RoomType, number]), ...STOCKED.map((t) => [t, 0.6] as [RoomType, number]),
    // (the hangar's hall: 14 m up, but full: the shop's stalls and racks, the gunsmith's benches, lockers, crates, the
    // aircraft and their covers, what's hung from the roof: more per m² of floor than a furnished room's, it stands so high)
    ['hangar', 1.4]]);
  // (and the air's own: 4mV, m about 0.003 a metre at 2 kHz: in a big hall, as much as its walls)
  const AIR_M = 0.003, AIR_M_LOW = 0.0003; // (the air takes the highs, hardly the lows)
  /** how hard the place's surfaces are (the theme's reflect) -> their absorption, α: for floor in no room */
  // (bare plaster, concrete and steel take 2-15% of what strikes them: reflect 0.3 -> α 0.14, 0.4 -> 0.08; till each surface's own material counts)
  const alphaOf = (map: LvMap) => G.U.clamp(0.32 - 0.6 * ((map.theme && map.theme.reflect) || 0.32), 0.06, 0.35);
  /** air for sound: a wall, a door's own tiles (a portal), nothing else */
  const solid = (v: number) => v === 1;

  function build(map: LvMap): AcMapData {
    const floors = map.floors || [map], NF = floors.length, { W, H } = map, N = W * H, ts = TS(), wh = WALL();
    const zones: AcZone[] = [], portals: AcPortal[] = [], zoneAt: Int32Array[] = [];
    const alpha = alphaOf(map);
    // zones: flood fill each floor's air (not walls, not door openings), never across the line between in and out of doors
    floors.forEach((fm, f) => {
      const t = fm.t, out = fm.out, at = new Int32Array(N).fill(-1);
      zoneAt.push(at);
      const doorCell = new Set<number>(); for (const d of fm.doors || []) for (const c of d.cells || [d.tz * W + d.tx]) doorCell.add(c);
      const air = (i: number) => !solid(t[i]) && !doorCell.has(i);
      for (let s = 0; s < N; s++) {
        if (at[s] >= 0 || !air(s)) continue;
        const id = zones.length, isOut = !!(out && out[s]), q = [s];
        at[s] = id;
        let edges = 0, sx = 0, sz = 0, sxx = 0, szz = 0, sxz = 0, tall = 0;
        const above = floors[f + 1];
        for (let h = 0; h < q.length; h++) {
          const i = q[h], x = i % W, z = (i / W) | 0;
          sx += x; sz += z; sxx += x * x; szz += z * z; sxz += x * z;
          if (above && above.t[i] === 5) tall++; // (open to the floor above: a drop in its floor)
          for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
            const nx = x + dx, nz = z + dz;
            if (nx < 0 || nz < 0 || nx >= W || nz >= H) { edges++; continue; }
            const j = nz * W + nx;
            if (!air(j)) { if (solid(t[j])) edges++; continue; }
            if (!!(out && out[j]) !== isOut) continue; // (the other side of in/out: a portal, found below)
            if (at[j] < 0) { at[j] = id; q.push(j); }
          }
        }
        const n = q.length, area = n * ts * ts, height = isOut ? Infinity : wh * (1 + tall / n);
        // (its shape: the spread of its tiles along their principal axes; a uniform strip's length is sqrt(12) of its spread)
        const mx = sx / n, mz = sz / n, cxx = sxx / n - mx * mx, czz = szz / n - mz * mz, cxz = sxz / n - mx * mz;
        const tr = (cxx + czz) / 2, det = Math.sqrt(Math.max(0, ((cxx - czz) / 2) ** 2 + cxz * cxz));
        const longM = Math.sqrt(12 * Math.max(0, tr + det)) * ts + ts, shortM = Math.sqrt(12 * Math.max(0, tr - det)) * ts + ts;
        zones.push({ id, f, out: isOut, tiles: n, area, height, volume: 0, surface: edges, alpha: 0, rt60: 0.25, longM, shortM, aw: alpha, af: alpha, ac: alpha, content: DEFAULT_CONTENT, awL: alpha, afL: alpha, acL: alpha, contentL: DEFAULT_CONTENT * LOW_CONTENT, cx: (sx / n + 0.5) * ts, cz: (sz / n + 0.5) * ts, y: (fm.fy || 0) + 1.5, portals: [] });
      }
    });
    // the zones' surfaces: what their rooms are (and their own height: a room built tall, the hangar's hall), then
    // volume, surface and reverberation (out of doors: none to speak of; what's off the buildings round is an echo)
    floors.forEach((fm, f) => {
      const at = zoneAt[f], acc = new Map<number, { a: number; n: number; tall: number; hangar: number; tiled: number }>(), tiles = !BARE_THEMES.has((map.theme && map.theme.name) || '');
      for (const r of fm.rooms || []) {
        const ra = CONTENT.get(r.type);
        for (let z = r.z; z < r.z + r.h; z++) for (let x = r.x; x < r.x + r.w; x++) {
          const zi = at[z * W + x]; if (zi < 0) continue;
          const o = acc.get(zi) || { a: 0, n: 0, tall: 0, hangar: 0, tiled: 0 };
          if (tiles && TILED.includes(r.type)) o.tiled++;
          if (ra !== undefined) { o.a += ra; o.n++; }
          if (r.tall) o.tall++;
          if (r.type === 'hangar') o.hangar++;
          acc.set(zi, o);
        }
      }
      for (const z of zones) {
        if (z.f !== f) continue;
        const o = acc.get(z.id), edges = z.surface;
        if (!z.out && o && o.tall > z.tiles / 2) z.height = Math.max(z.height, wh * 2);
        if (!z.out && o && o.hangar > z.tiles / 2) z.height = Math.max(z.height, 14); // (an aircraft hangar's hall)
        z.volume = z.out ? Infinity : z.area * z.height;
        const wallA = edges * ts * (z.out ? wh : z.height);
        z.surface = 2 * z.area + wallA;
        // its faces: the walls' (the construction the place's walls have, faced this side), its floor's and its ceiling's
        const p = { x: z.cx, y: (fm.fy || 0) + 1.5, z: z.cz }, M = G.Materials;
        const aw = M ? faceAlpha(M.of(map, { kind: 'wall' }, p)) : alpha, af = M ? faceAlpha(M.of(map, { kind: 'floor', min: [0, (fm.fy || 0) - 0.5, 0], max: [0, (fm.fy || 0) + 0.01, 0] }, p)) : alpha;
        const wb = M ? M.of(map, { kind: 'wall' }, p) : null, fb = M ? M.of(map, { kind: 'floor', min: [0, (fm.fy || 0) - 0.5, 0], max: [0, (fm.fy || 0) + 0.01, 0] }, p) : null, cb = M ? M.of(map, { kind: 'ceil', min: [0, 0, 0], max: [0, 1, 0] }, p) : null;
        const ac0 = cb ? faceAlpha(cb) : alpha, tf = o ? Math.min(1, o.tiled / z.tiles) : 0;
        const ac = ac0 * (1 - tf) + TILE_ALPHA * tf; // (the share of it under acoustic tiles)
        z.awL = wb ? faceAlphaLow(wb) : alpha; z.afL = z.out ? 0.15 : fb ? faceAlphaLow(fb) : alpha; z.acL = (cb ? faceAlphaLow(cb) : alpha) * (1 - tf) + TILE_ALPHA_LOW * tf;
        const content = o && o.n ? (o.a + DEFAULT_CONTENT * (z.tiles - o.n)) / z.tiles : DEFAULT_CONTENT;
        z.aw = aw; z.af = z.out ? 0.3 : af; z.ac = ac; z.content = content; z.contentL = content * LOW_CONTENT; // (out of doors the ground's earth and growth: soft)
        const A = wallA * aw + z.area * (af + ac) + content * z.area + 4 * AIR_M * z.volume;
        z.alpha = A / z.surface;
        z.rt60 = z.out ? 0.25 : G.U.clamp((0.161 * z.volume) / Math.max(A, 1e-3), 0.15, 3);
      }
    });
    const portal = (kind: AcPortalKind, a: number, b: number, cells: number, x: number, y: number, z: number, extra: Partial<AcPortal> = {}) => {
      if (a < 0 || b < 0 || a === b) return;
      const p: AcPortal = Object.assign({ id: portals.length, kind, a, b, cells, x, y, z }, extra);
      portals.push(p); zones[a].portals.push(p.id); zones[b].portals.push(p.id);
    };
    floors.forEach((fm, f) => {
      const at = zoneAt[f], t = fm.t, out = fm.out, y = (fm.fy || 0) + 1.2;
      const nbrs = (i: number) => { const x = i % W, z = (i / W) | 0, r: number[] = []; for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nx = x + dx, nz = z + dz; if (nx >= 0 && nz >= 0 && nx < W && nz < H) r.push(nz * W + nx); } return r; };
      // doors: the zones either side of the opening
      for (const d of fm.doors || []) {
        const cells = d.cells || [d.tz * W + d.tx], zs = new Set<number>();
        for (const c of cells) for (const j of nbrs(c)) if (at[j] >= 0) zs.add(at[j]);
        const [a, b] = [...zs];
        if (b !== undefined) portal('door', a, b, cells.length, d.x, y, d.z, { door: d });
      }
      // windows: the zones either side of the pane, along its normal
      for (const w of fm.windows || []) {
        const c = w.cells[0], x = c % W, z = (c / W) | 0, zs = new Set<number>();
        for (const s of [-1, 1]) for (let k = 1; k <= 2; k++) { const nx = x + s * k * w.nx, nz = z + s * k * w.nz; if (nx >= 0 && nz >= 0 && nx < W && nz < H && at[nz * W + nx] >= 0) { zs.add(at[nz * W + nx]); break; } }
        const [a, b] = [...zs];
        if (b !== undefined) portal('window', a, b, w.cells.length, w.x, (w.fy || fm.fy || 0) + 1.4, w.z, { win: w });
      }
      // openings: open air meeting indoors with no wall between (one portal per pair of zones, sized by the cells along it)
      const open = new Map<string, { a: number; b: number; n: number; sx: number; sz: number }>();
      if (out) for (let i = 0; i < N; i++) {
        if (at[i] < 0 || !out[i]) continue;
        for (const j of nbrs(i)) if (at[j] >= 0 && !out[j]) {
          const k = at[i] + ',' + at[j], o = open.get(k) || { a: at[i], b: at[j], n: 0, sx: 0, sz: 0 };
          o.n++; o.sx += (i % W + j % W) / 2; o.sz += (((i / W) | 0) + ((j / W) | 0)) / 2; open.set(k, o);
        }
      }
      for (const o of open.values()) portal('opening', o.a, o.b, o.n, (o.sx / o.n + 0.5) * ts, y, (o.sz / o.n + 0.5) * ts);
      // drops in the floor: this floor's zone to the one below, where this floor has none (t 5)
      if (f > 0) {
        const below = zoneAt[f - 1], vo = new Map<string, { a: number; b: number; n: number; sx: number; sz: number }>();
        for (let i = 0; i < N; i++) if (t[i] === 5 && below[i] >= 0) {
          for (const j of [i, ...nbrs(i)]) if (at[j] >= 0) { const k = at[j] + ',' + below[i], o = vo.get(k) || { a: at[j], b: below[i], n: 0, sx: 0, sz: 0 }; o.n++; o.sx += i % W; o.sz += (i / W) | 0; vo.set(k, o); break; }
        }
        for (const o of vo.values()) portal('void', o.a, o.b, o.n, (o.sx / o.n + 0.5) * ts, fm.fy || 0, (o.sz / o.n + 0.5) * ts);
      }
      void t;
    });
    return { zones, portals, zoneAt, NF };
  }
  function of(map: LvMap) { let d = data.get(map); if (!d) { d = build(map); data.set(map, d); } return d; }
  /** a portal now: how much of the sound reaching it gets through (energy), and the brightest it lets it be (Hz) */
  function through(p: AcPortal): { k: number; lp: number } {
    if (p.kind === 'door') {
      const d = p.door!;
      if (d.fallen || d.gone) return { k: 1, lp: 20000 };
      return d.open ? { k: 0.9, lp: 20000 } : { k: 0.015, lp: 500 }; // (shut: the leaf and its frame take about 18 dB, the highs most)
    }
    // (a window's an insulating glass unit: two panes and the gas between, about 30 dB off, the lows least: a shop front's
    // a wall of them, and it's very nearly as good as the wall. A cooler's door is glazed against heat more than sound, a
    // little less; bulletproof glass, 30-50 mm of laminated glass and polycarbonate, lets through little more than a thud.
    // Broken, the hole's open; bulletproof doesn't break)
    if (p.kind === 'window') {
      const w = p.win;
      if (w && w.broken) return { k: 0.8, lp: 20000 };
      if (w && w.armor) return { k: 0.0002, lp: 400 };
      if (w && w.cooler) return { k: 0.002, lp: 700 };
      return { k: 0.001, lp: 800 };
    }
    return { k: 1, lp: 20000 };
  }
  /** the zone at a place (and its floor), or -1 in a wall */
  function zoneAt(map: LvMap, x: number, y: number, z: number) {
    const d = of(map), L = G.Level, f = map.floors ? (L.floorAt(map, x, y, z) || 0) : 0, at = d.zoneAt[Math.min(f, d.NF - 1)];
    const tx = Math.floor(x / TS()), tz = Math.floor(z / TS());
    if (tx < 0 || tz < 0 || tx >= map.W || tz >= map.H) return -1;
    let zi = at[tz * map.W + tx];
    if (zi < 0) { // (standing in a doorway or against a wall: the zone nearest where you are, the quieter on a tie)
      const ts = TS(); let bd = Infinity;
      for (let dz = -2; dz <= 2; dz++) for (let dx = -2; dx <= 2; dx++) {
        const nx = tx + dx, nz = tz + dz; if (nx < 0 || nz < 0 || nx >= map.W || nz >= map.H) continue;
        const zj = at[nz * map.W + nx]; if (zj < 0) continue;
        const dd = Math.hypot((nx + 0.5) * ts - x, (nz + 0.5) * ts - z) + d.zones[zj].rt60 * 1e-3;
        if (dd < bd) { bd = dd; zi = zj; }
      }
    }
    return zi;
  }
  /**
   * What reaches someone at (x, y, z) from every zone: the strongest path through the portals (Dijkstra on -log level).
   * At each portal, what's on the far side spreads into the near zone: the share that comes through is the portal's own
   * (a door's leaf, a pane) times how big the opening is against how far it then has to go to you (a doorway beside you
   * lets in far more than one across the hall).
   */
  function listen(map: LvMap, x: number, y: number, z: number): { zone: AcZone | null; reach: Map<number, AcReach> } {
    const d = of(map), z0 = zoneAt(map, x, y, z), reach = new Map<number, AcReach>();
    if (z0 < 0) return { zone: null, reach };
    reach.set(z0, { level: 1, lp: 20000, via: null, hops: 0 });
    // (from you outwards: where you are when each zone's sound gets to the portal into the one you're nearer)
    const best = new Map<number, number>([[z0, 0]]), from = new Map<number, { x: number; y: number; z: number }>([[z0, { x, y, z }]]);
    const q: [number, number][] = [[0, z0]];
    while (q.length) {
      q.sort((a, b) => a[0] - b[0]);
      const [cost, zi] = q.shift()!;
      if (cost > (best.get(zi) ?? Infinity) + 1e-9) continue;
      const here = reach.get(zi)!, pt = from.get(zi)!;
      for (const pi of d.zones[zi].portals) {
        const p = d.portals[pi], nz = p.a === zi ? p.b : p.a, th = through(p);
        const dist = Math.hypot(p.x - pt.x, p.y - pt.y, p.z - pt.z), size = p.cells * TS();
        const spread = G.U.clamp((size + 1) / (size + 1 + dist * 0.6), 0.04, 1);
        const level = here.level * th.k * spread;
        if (level < 1e-4) continue;
        const c = -Math.log(level);
        if (c < (best.get(nz) ?? Infinity)) {
          best.set(nz, c); from.set(nz, { x: p.x, y: p.y, z: p.z });
          reach.set(nz, { level, lp: Math.min(here.lp * (here.hops ? 0.85 : 1), th.lp), via: here.via || p, hops: here.hops + 1 });
          q.push([c, nz]);
        }
      }
    }
    return { zone: d.zones[z0], reach };
  }
  // ------------------------------------------------------------------ measuring a room: acoustic ray tracing
  // A room's reverberation, measured rather than guessed from its shape: from a point in it, RAYS rays go out in every
  // direction (in 3D) and bounce round it: off its walls (the tile grid's), its floor and its ceiling (the zone's own
  // height), each surface taking its share (α, by what it's made of), a share of each bounce scattered (rough surfaces
  // and the things on them), and what stands in the room and the air taking theirs along the way (CONTENT, AIR_M, per
  // metre). Through an open door or an opening a ray goes on into the next room (coupled rooms: a corridor off a hall
  // lengthens its tail), out of doors up into the sky it's gone, and so off the map's edge. A sphere at the start point
  // catches what comes back: when, and how much. That's the room's energy response: its early reflections (a few, from
  // the nearest walls), its build-up, its decay (RT60, from its slope: Schroeder's backward integral), and how loud the
  // whole of it is against the sound itself (wet: the reverberant energy against the direct sound's at 1 m).
  // It runs on the tile grid (a 2.5D grid walk, not the world's raycast), so a room's a few milliseconds' work: rooms are
  // measured in idle time once a level's up (prewarm), or the first time they're needed.
  const TR = { RAYS: 500, BIN: 0.002, MAX_T: 3.5, MIN_E: 2e-4, SCATTER: 0.35, C: 343, EARLY: 0.08, DOOR_H: 2.1, WIN_A: 0.04, DOOR_A: 0.1 };
  const traces = new WeakMap<LvMap, Map<string, AcTrace>>();
  /** cosine-weighted scatter round a face's normal (axis 0 x, 1 y, 2 z; sign s) */
  function scatterDir(axis: number, s: number): [number, number, number] {
    const u = Math.random(), v = Math.random() * Math.PI * 2, r = Math.sqrt(u), a = r * Math.cos(v), b = r * Math.sin(v), n = Math.sqrt(1 - u) * s;
    return axis === 0 ? [n, a, b] : axis === 1 ? [a, n, b] : [a, b, n];
  }
  function trace(map: LvMap, f: number, x0: number, y0: number, z0: number, zi: number): AcTrace {
    const d = of(map), fms = map.floors || [map], fm = fms[f], at = d.zoneAt[f], t = fm.t, W = map.W, H = map.H, ts = TS(), wh = WALL();
    const fy = fm.fy || 0, Z = d.zones, zone = Z[zi], NB = Math.ceil(TR.MAX_T / TR.BIN), hist = new Float64Array(NB), histL = new Float64Array(NB), early: [number, number][] = [];
    const doorAt = new Map<number, LvDoor>(); for (const dr of fm.doors || []) for (const c of dr.cells || [dr.tz * W + dr.tx]) doorAt.set(c, dr);
    const winAt = fm.winAt as { has?: (i: number) => boolean } | undefined, buildingTop = fy + wh * (fms.length - f);
    const mfp = zone.out ? 8 : 4 * zone.volume / zone.surface, R = G.U.clamp(0.3 * mfp, 0.6, 2.2), R2 = R * R;
    const loss = (q: AcZone) => (q.out ? AIR_M : (q.content * q.area + 4 * AIR_M * q.volume) / (4 * q.volume)); // (energy lost per metre: what's in it, and the air)
    const lossL = (q: AcZone) => (q.out ? AIR_M_LOW : (q.contentL * q.area + 4 * AIR_M_LOW * q.volume) / (4 * q.volume)); // (the lows: the air hardly takes any)
    const outWallA = zone.out ? zone.aw : 0.03, outWallAL = zone.out ? zone.awL : 0.02;
    for (let r = 0; r < TR.RAYS; r++) {
      const u = 2 * Math.random() - 1, ph = Math.random() * Math.PI * 2, sq = Math.sqrt(1 - u * u);
      let dx = sq * Math.cos(ph), dy = u, dz = sq * Math.sin(ph), px = x0, py = y0, pz = z0, e = 1, eL = 1, path = 0;
      for (let ev = 0; ev < 600; ev++) {
        const tx = Math.floor(px / ts), tz = Math.floor(pz / ts);
        if (tx < 0 || tz < 0 || tx >= W || tz >= H) break; // (off the map: gone)
        const i = tz * W + tx, zc = at[i], cz = zc >= 0 ? Z[zc] : zone, out = zc >= 0 && cz.out;
        const ceil = out ? Infinity : fy + cz.height, flo = fy;
        const sx = dx > 1e-9 ? ((tx + 1) * ts - px) / dx : dx < -1e-9 ? (tx * ts - px) / dx : Infinity;
        const sz = dz > 1e-9 ? ((tz + 1) * ts - pz) / dz : dz < -1e-9 ? (tz * ts - pz) / dz : Infinity;
        const sy = dy > 1e-9 ? (ceil - py) / dy : dy < -1e-9 ? (flo - py) / dy : Infinity;
        const s = Math.max(1e-6, Math.min(sx, sz, sy));
        if (!isFinite(s)) break;
        // the catching sphere: where this leg passes nearest the start point (not the first leg: that's the sound itself)
        if (ev > 0 || path > 0) {
          // (only the part of this leg inside it: a ray's legs are a tile long, and one pass through the sphere spans several)
          const wx = x0 - px, wy = y0 - py, wz = z0 - pz, proj = wx * dx + wy * dy + wz * dz, dd = wx * wx + wy * wy + wz * wz - proj * proj;
          if (dd < R2) {
            const h = Math.sqrt(R2 - dd), lo = Math.max(0, proj - h), hi = Math.min(s, proj + h);
            if (hi > lo) {
              const w = e * (hi - lo), at2 = (path + (lo + hi) / 2) / TR.C, b = Math.floor(at2 / TR.BIN);
              if (b < NB) { hist[b] += w; histL[b] += eL * (hi - lo); }
              if (at2 < TR.EARLY) early.push([at2, w]);
            }
          }
        }
        e *= Math.exp(-loss(cz) * s); eL *= Math.exp(-lossL(cz) * s); path += s; px += dx * s; py += dy * s; pz += dz * s;
        if ((e < TR.MIN_E && eL < TR.MIN_E) || path > TR.C * TR.MAX_T) break;
        if (s === sy) { // the ceiling or the floor
          if (dy > 0 && out) break; // (out of doors: up into the sky)
          if (dy < 0 && f > 0 && t[i] === 5) break; // (a drop in the floor: down into the room below, out of this one)
          e *= 1 - (dy > 0 ? cz.ac : cz.af); eL *= 1 - (dy > 0 ? cz.acL : cz.afL);
          if (Math.random() < TR.SCATTER) [dx, dy, dz] = scatterDir(1, dy > 0 ? -1 : 1); else dy = -dy;
          continue;
        }
        // into the next tile across: air (this zone's, another's: through an opening, or an open door), or a wall
        const axis = s === sx ? 0 : 2, sg = axis === 0 ? Math.sign(dx) : Math.sign(dz), nx = tx + (axis === 0 ? sg : 0), nz = tz + (axis === 2 ? sg : 0);
        if (nx < 0 || nz < 0 || nx >= W || nz >= H) break;
        const j = nz * W + nx, zj = at[j], dr = doorAt.get(j);
        let pass = false, a = cz.aw, aL = cz.awL;
        if (zj >= 0) pass = Z[zj].out || py < fy + Z[zj].height; // (a lower room beyond: its wall above the opening)
        else if (dr) { pass = (dr.open || !!dr.fallen || !!dr.gone) && py < fy + TR.DOOR_H; a = TR.DOOR_A; aL = 0.15; }
        else if (out && py > buildingTop) pass = true; // (over a building's roof, out of doors)
        else if (winAt && winAt.has && winAt.has(j)) { a = TR.WIN_A; aL = 0.25; }
        else if (out) { a = outWallA; aL = outWallAL; }
        if (pass) { px += (axis === 0 ? sg : 0) * 1e-4; pz += (axis === 2 ? sg : 0) * 1e-4; continue; }
        e *= 1 - a; eL *= 1 - aL;
        if (Math.random() < TR.SCATTER) [dx, dy, dz] = scatterDir(axis, -sg); else if (axis === 0) dx = -dx; else dz = -dz;
      }
    }
    // per ray, and as a ratio to the direct sound's energy at 1 m (a sphere of radius R catches 3 Σ(e·chord) / (N R³) of it)
    let sum = 0; for (let b = 0; b < NB; b++) { hist[b] /= TR.RAYS; histL[b] /= TR.RAYS; sum += hist[b]; }
    const wet = (3 * sum) / (R2 * R);
    // RT60 from the decay's slope: Schroeder's backward integral, its fall from -5 to -25 dB (or what there is of it)
    const rtOf = (h: Float64Array) => {
      const sch = new Float64Array(NB); let acc = 0; for (let b = NB - 1; b >= 0; b--) { acc += h[b]; sch[b] = acc; }
      const dB = (b: number) => 10 * Math.log10(sch[b] / (sch[0] || 1e-30) + 1e-30);
      let b5 = -1, b25 = -1, b15 = -1;
      for (let b = 0; b < NB; b++) { const v = dB(b); if (b5 < 0 && v <= -5) b5 = b; if (b15 < 0 && v <= -15) b15 = b; if (b25 < 0 && v <= -25) { b25 = b; break; } }
      const e2 = b25 > b5 ? b25 : b15 > b5 ? b15 : -1, fall = b25 > b5 ? 20 : 10;
      return e2 > 0 ? G.U.clamp((60 / fall) * (e2 - b5) * TR.BIN, 0.1, 6) : zone.out ? 0.3 : zone.rt60;
    };
    for (const q of early) q[1] /= TR.RAYS;
    return { hist: Float32Array.from(hist), histL: Float32Array.from(histL), bin: TR.BIN, early, wet, rt60: rtOf(hist), rt60L: rtOf(histL), mfp, zone: zi };
  }
  /** a zone's start point: its tile nearest its middle (an L-shaped room's middle can be outside it) */
  function startOf(map: LvMap, zi: number) {
    const d = of(map), z = d.zones[zi], at = d.zoneAt[z.f], W = map.W, ts = TS(), fm = (map.floors || [map])[z.f];
    let best = -1, bd = Infinity;
    for (let i = 0; i < at.length; i++) if (at[i] === zi && fm.t[i] === 0) { const dx = (i % W + 0.5) * ts - z.cx, dz = (((i / W) | 0) + 0.5) * ts - z.cz, dd = dx * dx + dz * dz; if (dd < bd) { bd = dd; best = i; } }
    if (best < 0) for (let i = 0; i < at.length; i++) if (at[i] === zi) { best = i; break; }
    return { x: (best % W + 0.5) * ts, y: (z.out ? (fm.fy || 0) + 1.6 : Math.min((fm.fy || 0) + 1.6, (fm.fy || 0) + z.height / 2)), z: (((best / W) | 0) + 0.5) * ts };
  }
  /** the doors' state round a zone, as a key (its response changes when they open: a room coupled to the next) */
  function doorKey(map: LvMap, zi: number) {
    const d = of(map); let k = '';
    for (const pi of d.zones[zi].portals) { const p = d.portals[pi]; if (p.door) k += p.door.open || p.door.fallen || p.door.gone ? '1' : '0'; }
    return k;
  }
  /**
   * The measured response of the room someone's in at (x, y, z): an indoor zone's, from its own start point (one per room:
   * its reverberation's much the same wherever in it you are); out of doors, from the 8 m cell you're in (open ground's
   * echoes are all where the buildings are). Measured the first time it's asked for, kept for the level (re-measured when
   * the doors round a room open or shut).
   */
  function roomAt(map: LvMap, x: number, y: number, z: number): AcTrace | null {
    const d = of(map), zi = zoneAt(map, x, y, z);
    if (zi < 0) return null;
    const zone = d.zones[zi];
    let m = traces.get(map); if (!m) { m = new Map(); traces.set(map, m); }
    if (zone.out) {
      const c = Math.floor(x / 8) + ',' + Math.floor(z / 8) + ',' + zone.f, key = 'o' + c;
      let tr = m.get(key);
      if (!tr) { const fy = ((map.floors || [map])[zone.f].fy || 0); tr = trace(map, zone.f, (Math.floor(x / 8) + 0.5) * 8, fy + 1.6, (Math.floor(z / 8) + 0.5) * 8, zi); m.set(key, tr); }
      return tr;
    }
    const key = 'z' + zi + '|' + doorKey(map, zi);
    let tr = m.get(key);
    if (!tr) { const p = startOf(map, zi); tr = trace(map, zone.f, p.x, p.y, p.z, zi); m.set(key, tr); zone.rt60m = tr.rt60; }
    return tr;
  }
  /** measure every indoor room in idle time, one at a time, so the first shot in each needn't wait */
  function prewarm(map: LvMap) {
    const d = of(map), todo = d.zones.filter((z) => !z.out && z.tiles > 3).map((z) => z.id);
    const step = () => {
      if (G.Game && G.Game.map !== map) return; // (a new level: its own)
      const zi = todo.shift(); if (zi === undefined) return;
      const p = startOf(map, zi); const tr = roomAt(map, p.x, p.y, p.z), c = G.Audio && G.Audio.ctx;
      if (tr && c) { impulse(c, tr); impulse(c, tr, 1); } // (its responses built too: the gun's, at its level, and the ambience's)
      setTimeout(step, 15);
    };
    setTimeout(step, 500);
  }
  // An impulse response from a measurement: its first EARLY seconds as the arrivals the trace caught (each a click from
  // a wall, either ear its own), then noise shaped to the measured energy (smoothed over 8 ms), losing its highs as it
  // goes (the air, and soft things, take those first), and past where the trace's energy ran out, on down its slope to
  // -60 dB. Its total energy: energy (the trace's wet, for a gun's report heard against it; 1 for a send that sets its
  // own level). Per context, per measurement.
  const irs = new WeakMap<BaseAudioContext, WeakMap<AcTrace, Map<number, AudioBuffer>>>();
  function impulse(c: BaseAudioContext, tr: AcTrace, energy = tr.wet) {
    let m = irs.get(c); if (!m) { m = new WeakMap(); irs.set(c, m); }
    let mm = m.get(tr); if (!mm) { mm = new Map(); m.set(tr, mm); }
    const had = mm.get(energy); if (had) return had;
    const sr = c.sampleRate, T = Math.min(4, Math.max(tr.rt60, tr.rt60L || 0) * 1.15 + 0.08), len = Math.ceil(sr * T), b = c.createBuffer(2, len, sr), NB = tr.hist.length;
    // the envelope: the histogram smoothed, and past its last real energy, on down the measured slope
    const envOf = (h: Float32Array, rt: number) => {
      const env = new Float64Array(Math.ceil(T / tr.bin) + 1), sm = 4;
      let last = 0; for (let k = 0; k < NB; k++) if (h[k] > 0) last = k;
      for (let k = 0; k < env.length; k++) {
        if (k <= last) { let s = 0, n = 0; for (let j = Math.max(0, k - sm); j <= Math.min(NB - 1, k + sm); j++) { s += h[j]; n++; } env[k] = s / n; }
        else env[k] = env[last] * Math.pow(10, (-6 * (k - last) * tr.bin) / rt);
      }
      return env;
    };
    const env = envOf(tr.hist, tr.rt60), envL = tr.histL ? envOf(tr.histL, tr.rt60L) : env;
    const aL = Math.exp(-2 * Math.PI * 250 / sr); // (the split: under 250 Hz on the low band's envelope, the rest on the mid band's)
    // (the two parts keep the measured share each has of the whole: the late noise scaled to the energy the trace found
    // past the early part, each early arrival as much as it brought; then the whole to `energy`)
    const k0 = Math.floor(TR.EARLY * 0.75 / tr.bin);
    let lateE = 0; for (let k = k0; k < env.length; k++) lateE += env[k];
    for (let ch = 0; ch < 2; ch++) {
      const d = b.getChannelData(ch);
      let lpState = 0, lowS = 0, e = 0;
      for (let i = 0; i < len; i++) {
        const t = i / sr; if (t < TR.EARLY * 0.75) continue;
        const k = Math.floor(t / tr.bin), fc = 9000 * Math.exp(-t / Math.max(0.25, tr.rt60 * 0.45)) + 600, a = Math.exp(-2 * Math.PI * fc / sr);
        const w = Math.random() * 2 - 1; lowS = aL * lowS + (1 - aL) * w;
        lpState = a * lpState + (1 - a) * (w - lowS);
        const fade = Math.min(1, (t - TR.EARLY * 0.75) / (TR.EARLY * 0.25)); // (the late part comes up as the early arrivals thin out)
        d[i] = (lpState * Math.sqrt(env[k] || 0) + lowS * Math.sqrt(envL[k] || 0)) * fade;
        e += d[i] * d[i];
      }
      const kl = Math.sqrt(lateE / (e || 1)); for (let i = 0; i < len; i++) d[i] *= kl;
      for (const [t, w] of tr.early) { const i = Math.floor((t + (ch ? 0.0003 : 0) * Math.random()) * sr); if (i < len) d[i] += (Math.random() < 0.5 ? -1 : 1) * Math.sqrt(w); }
      let all = 0; for (let i = 0; i < len; i++) all += d[i] * d[i];
      const k = Math.sqrt(energy / (all || 1)); for (let i = 0; i < len; i++) d[i] *= k;
    }
    mm.set(energy, b);
    return b;
  }

  // (the last listen, kept a moment: a burst of fire, or every placed source in a frame, from the same place)
  let lastKey = '', lastAt = 0, last: ReturnType<typeof listen> | null = null;
  function listenNear(map: LvMap, x: number, y: number, z: number) {
    const key = Math.floor(x / TS()) + ',' + Math.floor(y) + ',' + Math.floor(z / TS()) + '|' + (map.doorVer || 0), now = performance.now();
    if (last && key === lastKey && now - lastAt < 250 && data.has(map)) return last;
    last = listen(map, x, y, z); lastKey = key; lastAt = now;
    return last;
  }
  /**
   * How a sound made at src is heard at lis: k (amplitude, 0..1: what the openings let through), lp (how bright, Hz),
   * at (where it seems to come from: the source itself, or the opening it comes in by), same (one zone: in plain sight,
   * give or take what stands in the room: shelves, a pillar, a car, which only take the top off it).
   */
  function hear(map: LvMap, src: { x: number; y: number; z: number }, lis: { x: number; y: number; z: number }) {
    const zs = zoneAt(map, src.x, src.y, src.z), zl = zoneAt(map, lis.x, lis.y, lis.z);
    if (zs < 0 || zl < 0) return { k: 1, lp: 20000, at: src, same: true };
    if (zs === zl) {
      const seen = G.Level.los(map, lis.x, lis.y, lis.z, src.x, src.y, src.z);
      return { k: seen ? 1 : 0.8, lp: seen ? 20000 : 4000, at: src, same: true };
    }
    const r = listenNear(map, lis.x, lis.y, lis.z).reach.get(zs);
    if (!r) return { k: 0.1, lp: 300, at: src, same: false }; // (no way round: through the walls only)
    return { k: Math.sqrt(r.level), lp: r.lp, at: r.via ? { x: r.via.x, y: r.via.y, z: r.via.z } : src, same: false };
  }
  return {
    of, zoneAt, listen, through, hear, roomAt, impulse, prewarm,
    /** the zones and portals as a summary, to look at in the console */
    describe(map: LvMap) {
      const d = of(map), n = (k: AcPortalKind) => d.portals.filter((p) => p.kind === k).length;
      return {
        zones: d.zones.length, out: d.zones.filter((z) => z.out).length,
        portals: { door: n('door'), window: n('window'), opening: n('opening'), void: n('void') },
        biggest: d.zones.filter((z) => !z.out).sort((a, b) => b.volume - a.volume).slice(0, 5).map((z) => ({ id: z.id, f: z.f, area: Math.round(z.area), h: +z.height.toFixed(1), alpha: +z.alpha.toFixed(3), rt60: +z.rt60.toFixed(2) })),
      };
    },
  };
})();
G.Acoustics = G_Acoustics;
interface GameModules { Acoustics: typeof G_Acoustics; }
