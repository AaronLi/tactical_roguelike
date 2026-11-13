'use strict'; interface LvMap { W: number; H: number; t: Uint8Array; out: Uint8Array; rooms: LvRoom[]; doors: LvDoor[]; cover: LvPt[]; wallSpots: LvPt[]; lights: LvLight[]; lamps: LvLight[]; stairs: LvStair[]; windows: LvWin[]; cabinets: LvCab[]; fx: Record<string, any>[]; winMeshes: THREE.Object3D[]; lightPool: THREE.PointLight[]; enemySpots: number[][];
  seed: number; level: number; theme: ThemeDef; TS?: number; world: ReturnType<typeof G_World.create>; crest?: any; chasm: number; floors: LvMap[]; props: Map<number, LvProp>; propList: LvProp[];
  case?: any; abox?: any; sbox?: any; winAt?: any; leafAt: Map<number, any>; unitAt?: Int8Array | null; doorAt?: any; doorMeshes?: any; fy: number; fl?: number; spawn: any; spawnRoom: LvRoom; exitRoom: LvRoom; extract?: any;
  grate?: any; railSteel?: boolean; fest?: any; base?: number; NF: number; minY?: number; rails: any[]; lz?: any; lzSpots?: number[][]; terrain?: any; skirt: number; entries?: number[][]; caseView?: any; cabViews?: any; aboxView?: any; sboxView?: any;
  above?: LvMap | null; voidAbove?: ArrayLike<number> | null; units?: number; navG?: any; lightT?: number; underground?: boolean; rollers?: number[][]; hub?: boolean; glassRuns?: any; fences: LvFence[]; doorVer?: number; cracked?: any; dmg?: any;
  wallMesh?: any; wallIdx?: Map<number, number>; wallBase?: Float32Array; homes?: any; civSpots?: { x: number; z: number; yaw: number }[] | null; night?: boolean; lux?: LvLux; desc?: LvDesc; sp?: ShMeta | null } interface LvLight { x: number; z: number; y?: number; gy?: number; kind?: LvLightKind; color?: number; i?: number; d?: number; up?: number; porch?: number; fl?: number; glow?: number; off?: boolean; sign?: { x: number; z: number; ax: LvAxis } } interface LvLux { W: number; H: number; NF: number; v: Float32Array } interface LvWin { solids?: any[]; id: number; cells: number[]; nx: number; nz: number; ext: boolean; broken: boolean; x: number; z: number; len: number; armor?: boolean; cooler?: boolean; sill?: number; top?: number; door?: LvDoor; cracked?: any; fy?: number; rail?: any; fl?: number } interface LvCab { x: number; z: number; yaw: number; fy?: number } interface LvRoom { cars?: any; type: RoomType; x: number; z: number; w: number; h: number; cx: number; cz: number; dress?: LvDress | null; unit?: number; lid?: any; door?: any; out?: boolean; loft?: boolean; lamp?: any; cover?: any[][]; carved?: boolean; front?: any; tall?: any; house?: any; fl?: number; flush?: boolean; ship?: string; lootRoom?: boolean } interface LvLz { x: number; z: number; f?: number; lamps?: number[][]; y?: number } type LvFence = [number, number, string, string?]; type LvRng = () => number; type LvObj = THREE.Object3D & Record<string, any>; interface LvBox { m?: any; cx: number; cz: number; hx: number; hz: number; y0: number; h: number; ray?: LvBox[]; gy?: number; walk?: boolean; hull?: number[] } interface LvDoor { id: number; i: number; tx: number; tz: number; x: number; z: number; axis: LvAxis; open: boolean; mirror: boolean; kind: any; cells?: number[]; w?: number; leaf?: LvBox; solids?: any[]; holes: any; gone: any; fallen?: boolean; rest?: any; pane?: any; fy?: number; fl?: number } interface LvProp { style?: Record<string, any>; name: string; x: number; z: number; q: number; v: number; boxes: LvBox[]; gy?: number; wd?: any; own?: boolean; block?: number } // a room's purpose (what furniture.ts fits it out as; homes.ts re-types a room to a resident's)
type RoomType = 'living' | 'kitchen' | 'dining' | 'bedroom' | 'office' | 'storage' | 'breakroom' | 'yard' | 'hall' | 'hangar' | 'lz' | 'street' | 'road' | 'lot' | 'corridor' | 'bathroom' | 'alley' | 'stage' | 'washroom' | 'plaza' | 'cafe' | 'store' | 'mart' | 'bar' | 'melt' | 'control' | 'mcc' | 'locker' | 'kitchenette' | 'lobby' | 'observe' | 'boss' | 'meeting' | 'trail' | 'garden' | 'giftshop' | 'storeroom' | 'stockroom' | 'freezer' | 'cashier' | 'dock' | 'lawn' | 'landing' | 'range' | 'seating' | 'roof' | 'picnic' | 'parking' | 'pad' | 'gate' | 'cubicle' | 'court' | 'aisle' | 'overlook' | 'catwalk' | 'ridge' | 'saddle' | 'greenhouse' | 'antennas' | 'carpark' | 'mill' | 'loading' | 'restroom' | 'terrace' | 'viewing' | 'bridge' | 'engine' | 'reactor' | 'cargo' | 'quarters' | 'barracks' | 'mess' | 'galley' | 'medbay' | 'armoury' | 'magazine' | 'vault' | 'brig' | 'pods' | 'spine';
type LvAxis = 'x' | 'z'; // (which way a door, stair or fence runs)
type LvDoorKind = 'stair' | 'fire' | 'vault'; // (a door that isn't the plain wooden one)
type LvLightKind = 'string' | 'highbay' | 'panel' | 'exit';
type LvFxKind = 'sparks' | 'jet' | 'embers' | 'steam' | 'smoke';
interface LvDress { who: string; type0: RoomType; wall: string; paper?: number; ceil: string; trim: string; floor: HomeFloor; cells: number[] | null; hung: any[]; was: Map<any, any>; own: any[] }
// what a ray is asked to do (G.World.raycast, G.Level.raycast): through glass, a look not a round, bars, what stops people, solids to skip
interface LvRayOpts { glass?: boolean; sight?: boolean; bars?: boolean; move?: boolean; skip?: (s: any) => boolean }
interface LvBuilding { floors: LvLay[]; stairs: any; rail?: string; base?: number; units?: number; lz?: LvLz | null }
interface LvLay { W: number; H: number; t: Uint8Array; rooms: LvRoom[]; out?: Uint8Array; doors?: LvDoorSpec[]; fences?: LvFence[]; grate?: any; crest?: any; glass?: any[]; spawn?: any; lz?: LvLz | null; entries?: number[][] | null; units?: number; underground?: boolean; chasm?: number; rollers?: number[][]; ids?: Int16Array; homes?: any; ringDoors?: boolean; sp?: any } interface LvPt { x: number; z: number; y?: number; cx?: number; cz?: number; fl?: number; lean?: any } interface LvFl { t: Uint8Array; out: Uint8Array; rooms: LvRoom[]; doors: any[]; fences?: LvFence[]; ids?: Int16Array; glass?: any[] } type LvDoorSpec = [number, number, LvAxis, boolean?, boolean?, any?]; type LvTheme = Record<string, any>; interface LvUnit { x: number; w: number; z0: number; h: number; wallZ: number; loft: boolean; unit?: number; head?: number[]; drop?: number[] } interface LvStair { axis: LvAxis; up: number; x0: number; x1: number; z0: number; z1: number; f: number; y0?: number; steps?: any; rise?: number } interface LvNav { stairOf: number[]; foot: Set<string>; WH: number }
// Procedural level generation, collision, raycasting and path flow-fields.
// The map is a tile grid (TS metres per tile, after refinement: see TS/CTS/K below). 0 = floor, 1 = wall, 2 = furniture you can take cover behind,
// 3 = door, 4 = other furniture (garden fences are furniture too). map.out marks tiles open to the sky. Furniture collision boxes live in map.props (see js/furniture.ts).
const G_Level = {
  // The grid: levels are laid out on 2 m cells (CTS), then refined 3x (K) to 0.67 m cells (TS) so walls between
  // spaces are a single 0.67 m cell thick instead of a whole 2 m tile. Everything that plays on the map
  // (collision, rays, paths, AI, rendering) works on the fine grid.
  TS: 2 / 3,
  CTS: 2,
  K: 3,
  CASE_CHANCE: 1, // share of levels with a weapon case (every one)
  CAB_CHANCE: 0.35, // share of levels with a first aid cabinet on a wall (and of those, CAB_TWO with a second)
  CAB_TWO: 0.2,
  ABOX_CHANCE: 0.7, // share of levels with an attachments box
  SBOX_CHANCE: 0.1, // share of levels with a sticker box (js/stickers.ts)
  WALL_H: 4,
  CRATE_H: 1.1,
  CRATE_HX: 0.8,
  DOOR_H: 2.3,

  // th: the environment (index into G.THEMES) picked on the route map; by default they come round in turn. night: a night
  // level (the route node's: js/route.ts), the same place with the lights out (nightify)
  // sp: what a mission's level is for besides (js/spacedata.ts SpGen: a ship's size and what's wanted aboard her)
  generate(seed: number, level: number, th?: number, night = false, sp?: SpGen | null) {
    this.genSp = sp || null;
    this.genNight = night; // (the furniture's plan reads it: fewer cars left in the car parks at night, js/furniture.ts)
    let map: LvMap;
    try { map = this.generateDay(seed, level, th); } finally { this.genNight = false; }
    if (night) this.nightify(map, seed);
    return this.described(map);
  },
  // The level as data (js/leveldesc.ts, docs/level-data.md): map.desc, everything that's drawn and everything that's solid,
  // the same wherever it's made from the same seed. The light grid's lamps are its (map.lamps); the world everyone collides
  // with, sees and shoots through is built from its solids alone (G.World.fromDesc: the planner's own, which the landing's
  // sight lines were worked out in, is let go).
  described(map: LvMap) {
    const lampsOf = (m: LvMap) => m.lights.map((l) => this.lampOf(l, map.theme)).filter((l): l is LvLight => !!l);
    if (map.floors) {
      map.lamps = [];
      for (const m of map.floors) { m.lamps = lampsOf(m); for (const l of m.lamps) map.lamps.push(Object.assign({}, l, { y: l.y! + m.fy, fl: m.fl })); }
    } else map.lamps = lampsOf(map);
    map.desc = G.LevelDesc.describe(map);
    G.World.fromDesc(map.desc, map);
    return map;
  },
  genNight: false,
  genSp: null as SpGen | null,
  generateDay(seed: number, level: number, th?: number) {
    const U = G.U, r = U.rng(seed);
    const theme = (th != null && G.SpaceData.themeAt(th)) || G.THEMES[(level - 1) % G.THEMES.length]; // (th from 1000: a ship, js/spacedata.ts)
    // the layout: an apartment block, a warehouse, two houses back to back with their gardens between, or a
    // building of rooms and corridors. Every one starts outside it (or, for the apartments, on the stairs).
    if (theme.layout === 'ship') { // a ship to board (js/shipgen.ts): one deck, open space round it
      const sl = G.ShipGen.lay(r, level, this.genSp), sm = G.ShipGen.finish(this.plan(sl, r, seed, level, theme), sl);
      G.World.fromTileMap(sm);
      return sm;
    }
    const lay = (theme.layout === 'apartments' ? this.layApartments(r, level) : theme.layout === 'warehouse' ? this.layWarehouse(r, level)
      : theme.layout === 'houses' ? this.layHouses(r, level) : theme.layout === 'festival' ? this.layFestival(r, level) : theme.layout === 'mart' ? this.layMart(r, level)
      : theme.layout === 'foundry' ? this.layFoundry(r, level) : theme.layout === 'crest' ? this.layCrest(r, level)
      : this.approach(this.layRooms(r, level), r, theme)) as LvLay & Partial<LvBuilding>;
    // a building of several floors: each one planned as a storey, then stacked (stack: the stairs between them)
    if (lay.floors) {
      // (who lives where: nothing to do with the layout, and from the seed alone: js/homes.ts)
      if (theme.residents) { const homes = G.Homes.start(seed); lay.floors.forEach((fl: LvLay) => { fl.homes = homes; }); }
      return this.landing(this.stack(lay.floors.map((fl: LvLay) => this.plan(fl, r, seed, level, theme)), lay), lay.lz);
    }
    const map = this.plan(lay, r, seed, level, theme);
    if (map.crest) { this.crestLadder(map); this.crestGround(map); } // (a way up onto the Crest House; a mountain top: the ground rolls)
    G.World.fromTileMap(map); // the level as 3D solids (js/world.ts): what every ray, sight line and step is asked of
    if (map.crest) this.crestSolids(map); // (the viewing building's roof and its parapet)
    return this.landing(map, lay.lz);
  },
  // Where the helicopter sets the squad down (js/landing.ts): a pad of LZ_W x LZ_H coarse tiles, its rectangle the layout's
  // (lz: { x, z, f }, f the floor it's on). The cabin sits at the pad's west end, the tail out over the rest. Nobody can
  // start in view of it, or close by on its level: a suspect's spot with a line to the pad is dropped (what's parked round it
  // does most of that), and any within LZ_NEAR of it. LZ_FAR: further than anyone's rifle reaches, no need to look.
  LZ_W: 7, LZ_H: 5, LZ_NEAR: 22, LZ_FAR: 70,
  landing(map: LvMap, lz?: LvLz | null) {
    if (!lz) return map;
    const cs = this.CTS, m = this.floorMap(map, lz.f || 0), y = m.fy || 0, x = lz.x * cs + 3.8, z = (lz.z + this.LZ_H / 2) * cs;
    map.lz = { x, y, z, f: lz.f || 0 };
    map.spawn = { x, z };
    m.lights.unshift({ kind: 'string', x: x + 2.5, z: z - 3, y: 5, color: 0xffe6c4, i: 0.8, d: 16 }); // (a work light over the pad)
    for (const [lx, lz2] of lz.lamps || []) m.lights.unshift({ kind: 'string', x: lx * cs, z: lz2 * cs, y: 3, color: 0xffd59a, i: 0.7, d: 11 }); // (and one at each way off it)
    // (the pad's middle and corners, the bench, and the line you step out along: at a head's height, a crouch's and a stood officer's)
    const eyes = [[0, 0], [-3, -4], [-3, 4], [9, -4], [9, 4], [3, 0]].map(([dx, dz]) => [x + dx, y + 1.5, z + dz]);
    for (let dx = -1.4; dx <= 1.4; dx += 0.7) for (const [dz, h] of [[0.85, 1.7], [-2.6, 1.6], [-2.6, 1.05]]) eyes.push([x + dx, y + h, z + dz]);
    const seen = ([tx, tz, f]: number[]) => {
      const sx = (tx + 0.5) * this.TS, sz = (tz + 0.5) * this.TS, fy = (this.floorMap(map, f || 0).fy || 0) + (f ? 0 : this.groundHeight(map, sx, sz)), d = Math.hypot(sx - x - 2.5, sz - z);
      if (d < this.LZ_NEAR && Math.abs(fy - y) < 2) return true;
      return d < this.LZ_FAR && eyes.some(([ex, ey, ez]) => this.see(map, sx, fy + 1.6, sz, ex, ey, ez) > 0);
    };
    // (the ones dropped are still somewhere a civilian can be: no threat to anyone landing, a shopper in the store's
    // window. The corner store's whole shop floor is in sight of its pad.)
    const kept: number[][] = [], lzSpots: number[][] = [];
    for (const sp of map.enemySpots) (seen(sp) ? lzSpots : kept).push(sp);
    map.enemySpots = kept; map.lzSpots = lzSpots;
    return map;
  },
  // A night level: the same place with the power off. The theme's lamps are dark (their fittings still there, unlit), what
  // glows of itself still glows (a furnace, molten metal: a light with glow), and a few emergency lights are on: exit signs
  // over doorways (green, one in five red), each a dim light of a few metres, over every stairwell's door and about one
  // door in four besides. Outdoors, and in through the windows, it's the moon: the theme's sky light (js/lightgrid.ts),
  // much dimmer and bluer (NIGHT). Drawn from a generator of its own (from the seed), so the place is the day's.
  NIGHT: { fog: 0x04060b, hemi: 0x8a9ad0, hemiI: 0.15, cloud: 0x1c2030 }, // (cloud: the clouds the helicopter flies through, js/landing.ts)
  nightify(map: LvMap, seed: number) {
    const r = G.U.rng(seed ^ 0x6e1647), TS = this.TS, th = Object.assign({}, map.theme, this.NIGHT) as ThemeDef;
    map.night = true; map.theme = th;
    for (const fm of map.floors || [map]) {
      fm.night = true; fm.theme = th;
      for (const l of fm.lights) if (!l.glow) l.off = true;
      const W = fm.W, t = fm.t;
      for (const d of fm.doors) {
        if (d.kind !== 'stair' && r() >= 0.25) continue;
        // the sign goes over the doorway on its indoor side (open floor, under a roof), or whichever side's open
        const side = [-1, 1].map((sg) => { const i = d.axis === 'z' ? (d.tz + sg) * W + d.tx : d.tz * W + d.tx + sg; return { sg, open: t[i] != null && t[i] !== 1 && t[i] !== 5, inside: !(fm.out && fm.out[i]) }; });
        const sd = side.find((q) => q.open && q.inside) || side.find((q) => q.open);
        if (!sd) continue;
        const ox = d.axis === 'x' ? sd.sg : 0, oz = d.axis === 'z' ? sd.sg : 0, green = r() < 0.8;
        fm.lights.push({ kind: 'exit', x: d.x + ox * (TS / 2 + 0.3), z: d.z + oz * (TS / 2 + 0.3), y: this.DOOR_H + 0.35, color: green ? 0x5cff88 : 0xff4a3a, i: 0.18, d: 5.5,
          sign: { x: d.x + ox * (TS / 2 + 0.03), z: d.z + oz * (TS / 2 + 0.03), ax: d.axis } });
      }
    }
    return map;
  },
  // The light a lamp gives off, as the light grid takes it (js/lightgrid.ts), from where it hangs (map.lights): null for one
  // that's off (a night level's). Its height from its own floor.
  lampOf(l: LvLight, th: ThemeDef): LvLight | null {
    if (l.off) return null;
    if (l.kind === 'string' || l.kind === 'exit') return { x: l.x, y: l.y, z: l.z, color: l.color, i: l.i, d: l.d };
    if (l.porch) return { x: l.x, y: l.y! - 0.1, z: l.z + l.porch * 0.5, color: 0xffd59a, i: 0.9, d: 11 };
    if (l.kind === 'panel') return { x: l.x, y: this.WALL_H - 0.4, z: l.z, color: 0xf2f6ff, i: 0.45, d: 9 };
    if (l.kind === 'highbay') return { x: l.x, y: l.y! - 0.4, z: l.z, color: l.color, i: l.i, d: l.d };
    return { x: l.x, y: this.WALL_H - 0.4, z: l.z, color: th.light, i: 0.85, d: 14 };
  },
  // How lit each spot on the floor is, for the suspects' eyes (js/server.ts lightK): a number a fine tile, a layer a
  // floor, worked out once a level (the first time it's asked) from the same lamps and sky the light grid draws
  // (js/lightgrid.ts), but cheaply and in grey (a light's brightness the mean of its colour, as written: (r + g + b) / 3):
  //   tile = FILL                               what's flat everywhere (the hemisphere light's share: js/render.ts setLevel;
  //                                             none on a night level)
  //        + sky                                open to the sky, the theme's (hemiI^2); by an outside window 0.6 of it
  //        + sum over lamps i * (1 - d / r)^1.6 each in line of the tile (no wall between; the doors taken as open), d to a
  //                                             point a metre over it (a body's middle), r the lamp's reach
  //        + BOUNCE * that, spread round        (a blur over the open tiles: the light back off the walls and floor)
  // On the light grid's scale: under a room's lamp 0.3 to 0.7, a corridor between its lamps about 0.1, outdoors under a
  // level's evening sky about 0.08; a night level's rooms, away from the exit signs, under 0.01.
  lux(map: LvMap): LvLux {
    if (map.lux) return map.lux;
    const TS = this.TS, fms = map.floors || [map], W = map.W, H = map.H, N = W * H, NF = fms.length, th = map.theme, v = new Float32Array(N * NF);
    const lum = (hex: number) => (((hex >> 16) & 255) + ((hex >> 8) & 255) + (hex & 255)) / 765;
    const sky = (th.hemiI || 0.26) ** 2 * lum(th.hemi || th.light || 0xffffff), FILL = map.night ? 0 : sky * 0.25, BOUNCE = 0.45, PASSES = 12, DECAY = 1.6;
    fms.forEach((fm: LvMap, f: number) => {
      const t = fm.t, base = f * N, win = new Set<number>(), out = new Float32Array(N);
      for (const w of map.windows || []) if ((w.fl || 0) === f) for (const c of w.cells) win.add(c);
      for (const l0 of fm.lights) {
        const l = this.lampOf(l0, th);
        if (!l) continue;
        const k = l.i! * lum(l.color!), r = l.d!, dy = l.y! - 1;
        const x0 = Math.max(0, Math.floor((l.x - r) / TS)), x1 = Math.min(W - 1, Math.floor((l.x + r) / TS));
        const z0 = Math.max(0, Math.floor((l.z - r) / TS)), z1 = Math.min(H - 1, Math.floor((l.z + r) / TS));
        for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) {
          const i = z * W + x;
          if (t[i] === 1) continue;
          const cx = (x + 0.5) * TS, cz = (z + 0.5) * TS, dx: number = l.x - cx, dz: number = l.z - cz, d = Math.hypot(dx, dy, dz);
          if (d >= r) continue;
          // (the line to it, as the light grid's: through no wall but glass; it may start in one, a lantern on a wall)
          const flat = Math.hypot(dx, dz), steps = Math.ceil(flat / (TS * 0.4));
          let blocked = false;
          for (let s = 1; s < steps && !blocked; s++) {
            const u = s / steps;
            if (flat * (1 - u) < 0.35) continue;
            const j = Math.floor((cz + dz * u) / TS) * W + Math.floor((cx + dx * u) / TS);
            if (j !== i && t[j] === 1 && !win.has(j)) blocked = true;
          }
          if (!blocked) out[i] += k * Math.pow(1 - d / r, DECAY);
        }
      }
      if (fm.out) for (let i = 0; i < N; i++) if (fm.out[i] && t[i] !== 1) out[i] += sky;
      for (const w of map.windows || []) if ((w.fl || 0) === f && w.ext) for (const c of w.cells) { const q = c - w.nx - w.nz * W; if (q >= 0 && q < N && t[q] !== 1) out[q] += sky * 0.6; }
      let a = Float32Array.from(out), b = new Float32Array(N);
      for (let pass = 0; pass < PASSES; pass++) {
        for (let z = 0, i = 0; z < H; z++) for (let x = 0; x < W; x++, i++) {
          if (t[i] === 1) { b[i] = 0; continue; }
          let sum = a[i], n = 1;
          if (x > 0 && t[i - 1] !== 1) { sum += a[i - 1]; n++; }
          if (x < W - 1 && t[i + 1] !== 1) { sum += a[i + 1]; n++; }
          if (z > 0 && t[i - W] !== 1) { sum += a[i - W]; n++; }
          if (z < H - 1 && t[i + W] !== 1) { sum += a[i + W]; n++; }
          b[i] = sum / n;
        }
        [a, b] = [b, a];
      }
      for (let i = 0; i < N; i++) v[base + i] = t[i] === 1 ? 0 : FILL + out[i] + BOUNCE * a[i];
    });
    return (map.lux = { W, H, NF, v });
  },
  // the light at (x, y, z) (lux): its tile's on its floor (by a wall, the open tile beside it), or none off the map
  luxAt(map: LvMap, x: number, y: number, z: number) {
    const g = this.lux(map), W = g.W, N = W * g.H, tx = Math.floor(x / this.TS), tz = Math.floor(z / this.TS);
    if (tx < 0 || tz < 0 || tx >= W || tz >= g.H) return 0;
    const o = Math.min(g.NF - 1, this.floorAt(map, x, y, z)) * N, i = tz * W + tx;
    let v = g.v[o + i];
    if (!v) for (const j of [i - 1, i + 1, i - W, i + W]) if (j >= 0 && j < N) v = Math.max(v, g.v[o + j]);
    return v;
  },
  // The hangar between levels (js/hangar.ts): the whole map is the same as any level's (the same walls, floor,
  // lights, collision and rays), with nothing in it but what G.Hangar puts there.
  generateHub(seed: number, level: number) {
    const r = G.U.rng(seed), lay = this.layHangar(r, level);
    const map = this.plan(lay, r, seed, level, G.HANGAR_THEME);
    map.case = null; map.abox = null; map.sbox = null; map.cabinets = []; map.enemySpots = []; map.hub = true;
    G.World.fromTileMap(map);
    this.described(map); // (the hall as any level's: its own fittings are js/hangar.ts', added to the world after)
    G.Hangar.decorate(map);
    return map;
  },
  // One storey, from its layout: doors, furniture, the fine grid and everything placed on it
  plan(lay: LvLay, r: LvRng, seed: number, level: number, theme: LvTheme) {
    const { W, H, t, rooms } = lay;

    // Doors (tile value 3). `axis` is the direction you walk through the door. The rooms layout puts single and
    // double doors on the ring just outside each room where a corridor arrives; the others say where theirs go.
    const doors: LvDoor[] = [], doorAt = new Map<number, LvDoor>();
    const isWall = (x: number, z: number) => x < 0 || z < 0 || x >= W || z >= H || t[z * W + x] === 1;
    const addDoor = (x: number, z: number, axis: LvAxis, open?: boolean, mirror?: boolean, kind?: LvDoorKind | null) => {
      const i = z * W + x;
      t[i] = 3;
      const d = { id: doors.length, i, tx: x, tz: z, x: (x + 0.5) * this.CTS, z: (z + 0.5) * this.CTS, axis, open: !!open, mirror: !!mirror, kind: kind || null } as LvDoor;
      doors.push(d); doorAt.set(i, d);
    };
    if (lay.ringDoors) rooms.forEach((rm) => {
      const ring: [number, number, LvAxis][] = [];
      for (let x = rm.x; x < rm.x + rm.w; x++) { ring.push([x, rm.z - 1, 'z']); ring.push([x, rm.z + rm.h, 'z']); }
      for (let z = rm.z; z < rm.z + rm.h; z++) { ring.push([rm.x - 1, z, 'x']); ring.push([rm.x + rm.w, z, 'x']); }
      for (const [x, z, axis] of ring) {
        if (x <= 0 || z <= 0 || x >= W - 1 || z >= H - 1 || t[z * W + x] !== 0) continue;
        const near = axis === 'z' ? [t[(z - 1) * W + x], t[(z + 1) * W + x]] : [t[z * W + x - 1], t[z * W + x + 1]];
        if (near.includes(3)) continue; // no doors back to back
        // (ax, az) steps along the room edge, across the opening
        const ax = axis === 'z' ? 1 : 0, az = axis === 'z' ? 0 : 1;
        const single = isWall(x - ax, z - az) && isWall(x + ax, z + az);
        const double = !single && isWall(x - ax, z - az) && t[(z + az) * W + x + ax] === 0 && isWall(x + 2 * ax, z + 2 * az);
        if (!(single || double) || r() > 0.8) continue;
        const open = r() < 0.2;
        addDoor(x, z, axis, open, false);
        if (double) addDoor(x + ax, z + az, axis, open, true); // second leaf of a double door, hinged on the far side
      }
    });
    for (const [x, z, axis, open, mirror, kind] of lay.doors || []) if (t[z * W + x] !== 3) addDoor(x, z, axis, open, mirror, kind);
    // The coarse plan. out: tiles open to the sky (gardens); fences: garden fence tiles [x, z, axis].
    const c = { W, H, t, rooms, seed, level, doors, doorAt, out: lay.out || new Uint8Array(W * H), fences: lay.fences || [], grate: lay.grate || null, crest: lay.crest || null, TS: this.CTS, theme } as unknown as LvMap;
    const spawnRoom = lay.spawn || rooms[0];
    const distFromSpawn = this.flow(c, [[spawnRoom.cx, spawnRoom.cz]]);
    const seeds = [[spawnRoom.cx, spawnRoom.cz]].concat(lay.entries || []); // (upstairs: the stair heads too, so a loft's upper floor counts)
    let exitRoom = rooms[1] || rooms[0], far = -1;
    rooms.forEach((rm) => { const d = distFromSpawn[rm.cz * W + rm.cx]; if (rm !== spawnRoom && d > far) { far = d; exitRoom = rm; } });

    // Furniture, planned on the coarse grid, only where it keeps the map fully connected
    const countReach = () => {
      const f = this.flow(c, seeds);
      let n = 0; for (let i = 0; i < f.length; i++) if (f[i] >= 0) n++;
      return n;
    };
    let reach = countReach();
    const tryBlock = (x: number, z: number, v: number) => {
      const i = z * W + x;
      if (t[i] !== 0) return false;
      t[i] = v;
      const nr = countReach();
      if (nr !== reach - 1) { t[i] = 0; return false; }
      reach = nr; return true;
    };
    G.Furniture.plan(c, r, spawnRoom, exitRoom, tryBlock);

    // then the fine grid, and everything that's placed on it
    const map = this.refine(c);
    map.entries = (lay.entries || []).map(([x, z]: number[]) => [x * this.K + 1, z * this.K + 1]); // (upstairs: where a loft's own stair comes up, on the fine grid: spawn spots count from there too)
    map.units = lay.units || 0; // apartments: how many (rooms carry .unit)
    map.underground = !!lay.underground; // (a basement: no windows)
    map.glassRuns = lay.glass || null; // (glass the layout puts in walls between rooms: placeWindows)
    // roller doors (rolled up): [x from, x to, z of the wall] in metres
    map.rollers = (lay.rollers || []).map(([x0, z, w]: number[]) => [x0 * this.CTS, (x0 + w) * this.CTS, (z + 0.5) * this.CTS]);
    map.fest = c.fest || null; map.civSpots = c.civSpots || null; // (a festival: its light strings, where civilians hide)
    map.crest = c.crest; map.chasm = lay.chasm || 0; // (the Sandia Crest: which walls are rock, where the masts stand; how far down the gorge's floor is)
    map.spawnRoom = map.rooms[rooms.indexOf(spawnRoom)];
    map.exitRoom = map.rooms[rooms.indexOf(exitRoom)];
    // (a gorge: the strip of ground past the wall along its rim, that nobody can reach, is the gorge's air; the wall stands on the edge)
    if (map.chasm) {
      const { W, H, t } = map, f = this.flow(map, [[map.spawnRoom.cx, map.spawnRoom.cz]]), nb = (i: number, v: number) => [i - 1, i + 1, i - W, i + W].some((j) => j >= 0 && j < W * H && t[j] === v);
      const air = []; for (let i = 0; i < W * H; i++) if (t[i] === 0 && f[i] < 0 && nb(i, 4) && nb(i, 5)) air.push(i);
      for (const i of air) t[i] = 5;
    }
    this.finish(map, r);
    // (the Sandia Crest's a sniper's level: most of them over on the east summit, across the gorge from the overlook; a few
    // on the saddle, fewer still on the way up the west summit)
    if (map.crest) { const cr = map.crest, west = cr.CX0 * this.CTS, east = (cr.CX1 + 1) * this.CTS; map.enemySpots = map.enemySpots.filter(([x]: number[]) => { const m = (x + 0.5) * this.TS; return m >= east || r() < (m < west ? 0.2 : 0.4); }); }
    // the walls, the doors and everything else are done: now who lives here redoes the rooms they have (after all of
    // it, on its own random stream, so nothing else on the map moves for them)
    if (lay.homes) G.Homes.fill(map, lay.homes);
    return map;
  },

  // Coarse plan -> fine grid (K x K cells per tile).
  //  - A wall tile between two open spaces thins to its middle line of cells; the cells either side become
  //    part of the spaces. Walls with solid mass behind them (the outside of the building) keep their bulk.
  //  - A door becomes a 2-cell (1.33 m) opening in the middle line, the third cell wall; the two leaves of a
  //    double door sit side by side (2.67 m).
  //  - A garden fence becomes a line of 1-cell fence panels down the middle of its tile.
  //  - Rooms grow into the cells their thinned walls gave up. Furniture against a wall slides out to the
  //    wall's new face, and each piece blocks the fine cells it covers.
  refine(c: LvMap): LvMap {
    const K = this.K, cs = this.TS, W = c.W * K, H = c.H * K;
    const t = new Uint8Array(W * H).fill(1), out = new Uint8Array(W * H);
    const cv = (x: number, z: number) => (x < 0 || z < 0 || x >= c.W || z >= c.H ? 1 : c.t[z * c.W + x]);
    const cout = (x: number, z: number) => x >= 0 && z >= 0 && x < c.W && z < c.H && !!c.out[z * c.W + x];
    const solid = (x: number, z: number) => { const v = cv(x, z); return v === 1 || v === 3; };
    const fenceC = new Map<number, any>(c.fences.map(([x, z, axis]: LvFence) => [z * c.W + x, axis])), fenceAx = new Map();
    const fenceName = new Map(c.fences.filter((f: LvFence) => f[3]).map(([x, z, , name]: LvFence) => [z * c.W + x, name])); // (a fourth figure: what it is, if it isn't the theme's fencing)
    const fenceInto = new Map<number, any>(); // (a fence's cells run on into a wall's tile: what they are, the fence's: below)
    // steel grating (a foundry's catwalks, upstairs): floor you stand on that rounds and eyes go through (c.grate, coarse)
    const cg = c.grate, grate = cg ? new Uint8Array(W * H) : null, cgr = (x: number, z: number) => !!cg && x >= 0 && z >= 0 && x < c.W && z < c.H && !!cg[z * c.W + x];
    // A thin wall separates two spaces (open on both sides along one axis). A wall where thin walls meet (a T or
    // a corner) is thinned with them. Thinning keeps the wall's centre line and its arms toward the walls it
    // joins; the rest of the tile opens up to the spaces around it. Walls with solid mass behind them (the
    // outside of the building, the rock around a corridor) keep their bulk.
    const open = (x: number, z: number) => !solid(x, z);
    const thinWall = (x: number, z: number) => cv(x, z) === 1 && ((open(x - 1, z) && open(x + 1, z)) || (open(x, z - 1) && open(x, z + 1)));
    for (let z = 0; z < c.H; z++) for (let x = 0; x < c.W; x++) {
      const v = cv(x, z), ci = z * c.W + x;
      const thinned = v === 1 && (thinWall(x, z) || [thinWall(x - 1, z), thinWall(x + 1, z), thinWall(x, z - 1), thinWall(x, z + 1)].filter(Boolean).length >= 2);
      for (let j = 0; j < K; j++) for (let i = 0; i < K; i++) {
        const fi = (z * K + j) * W + x * K + i;
        // the coarse neighbour a side cell faces (a thinned cell takes its garden-ness)
        
        if (fenceC.has(ci)) { const ax = fenceC.get(ci), line = ax === 'x' ? j === 1 : i === 1; t[fi] = line ? 4 : 0; out[fi] = 1; if (line) fenceAx.set(fi, ax); continue; }
        if (v === 1) {
          if (!thinned || (i === 1 && j === 1)) continue;
          // an arm toward a neighbouring wall stays; any other cell opens if it faces open space
          const di = i - 1, dj = j - 1;
          if ((dj === 0 && solid(x + di, z)) || (di === 0 && solid(x, z + dj))) continue;
          const faces = [[x + di, z], [x, z + dj], [x + di, z + dj]].filter(([a, b]) => (a !== x || b !== z) && open(a, b));
          if (!faces.length) continue;
          // (facing nothing but open air, upstairs outside a house: open air too, not a ledge to stand on)
          t[fi] = faces.every(([a, b]) => cv(a, b) === 5) ? 5 : 0; out[fi] = faces.some(([a, b]) => cout(a, b)) ? 1 : 0;
          if (grate && t[fi] === 0 && faces.some(([a, b]) => cgr(a, b))) grate[fi] = 1; // (beside a catwalk: the catwalk's)
          continue;
        }
        if (v === 3) {
          const d = c.doorAt.get(ci), along = d.axis === 'z' ? i : j, across = d.axis === 'z' ? j : i;
          if (across !== 1) { const nb = d.axis === 'z' ? [x, z + (j ? 1 : -1)] : [x + (i ? 1 : -1), z]; t[fi] = 0; out[fi] = cout(...nb as [number, number]) ? 1 : 0; if (grate && cgr(...nb as [number, number])) grate[fi] = 1; continue; }
          t[fi] = (d.mirror ? along <= 1 : along >= 1) ? 3 : 1;
          continue;
        }
        if (v === 5) { t[fi] = 5; out[fi] = c.out[ci] ? 1 : 0; continue; } // a drop: no floor (the floor below shows through), or upstairs, the open air outside
        if (v === 6) { t[fi] = 7; continue; } // a flight of stairs (its steps are solids: G.Level.stack)
        t[fi] = 0; out[fi] = c.out[ci] ? 1 : 0; // floor (furniture is laid on it below)
        if (grate && cg[ci]) grate[fi] = 1;
      }
    }
    // fence lines run through to the fence tiles beside them (no gap where a side fence meets the middle one)
    for (const [ci] of fenceC) {
      const x = ci % c.W, z = (ci / c.W) | 0;
      for (const [dx, dz] of [[1, 0], [0, 1]]) {
        if (x + dx >= c.W || z + dz >= c.H || !fenceC.has((z + dz) * c.W + x + dx)) continue;
        for (let s = 1; s < K; s++) { const fi = (z * K + 1 + dz * s) * W + x * K + 1 + dx * s; t[fi] = 4; out[fi] = 1; if (!fenceAx.has(fi)) fenceAx.set(fi, dx ? 'x' : 'z'); }
      }
      // on a mountain top, a fence that ends at a wall in line with it runs on into the wall's middle line (a gap between
      // them there would be a way over the edge: the Sandia Crest's viewing site, its railing to the building's front)
      if (c.crest) for (const [dx, dz] of fenceC.get(ci) === 'x' ? [[1, 0], [-1, 0]] : [[0, 1], [0, -1]]) {
        if (cv(x + dx, z + dz) !== 1) continue;
        for (let s = 1; s < K; s++) {
          const fi = (z * K + 1 + dz * s) * W + x * K + 1 + dx * s;
          if (t[fi] === 0 || t[fi] === 5) { t[fi] = 4; out[fi] = 1; fenceAx.set(fi, dx ? 'x' : 'z'); if (fenceName.has(ci)) fenceInto.set(fi, fenceName.get(ci)); }
        }
      }
    }
    // doors: one record for both cells of each opening
    const doors: LvDoor[] = [], doorAt = new Map<number, LvDoor>();
    for (const d0 of c.doors) {
      const ax = d0.tx * K, az = d0.tz * K, cells = (d0.mirror ? [0, 1] : [1, 2]).map((a) => (d0.axis === 'z' ? [ax + a, az + 1] : [ax + 1, az + a]));
      const ids = cells.map(([x, z]) => z * W + x);
      const d = { id: doors.length, i: ids[0], cells: ids, tx: cells[0][0], tz: cells[0][1], axis: d0.axis, open: d0.open, mirror: d0.mirror, kind: d0.kind, w: 2 * cs,
        x: ((cells[0][0] + cells[1][0] + 1) / 2) * cs, z: ((cells[0][1] + cells[1][1] + 1) / 2) * cs } as LvDoor;
      doors.push(d); ids.forEach((i) => doorAt.set(i, d));
    }
    // rooms: the coarse rectangle, grown into any side the thinned walls opened up
    const rooms = c.rooms.map((rm) => {
      const x0 = rm.x * K, z0 = rm.z * K, x1 = (rm.x + rm.w) * K - 1, z1 = (rm.z + rm.h) * K - 1;
      const col = (x: number) => { for (let z = z0; z <= z1; z++) if (t[z * W + x] !== 0) return false; return true; };
      const row = (z: number) => { for (let x = x0; x <= x1; x++) if (t[z * W + x] !== 0) return false; return true; };
      const nx0 = col(x0 - 1) ? x0 - 1 : x0, nx1 = col(x1 + 1) ? x1 + 1 : x1, nz0 = row(z0 - 1) ? z0 - 1 : z0, nz1 = row(z1 + 1) ? z1 + 1 : z1;
      const q = Object.assign({}, rm, { x: nx0, z: nz0, w: nx1 - nx0 + 1, h: nz1 - nz0 + 1, cx: (nx0 + nx1) >> 1, cz: (nz0 + nz1) >> 1 });
      // its centre on floor you can stand on (not on a flight of stairs, say): the nearest such cell in it
      if (t[q.cz * W + q.cx] !== 0) {
        let best = null, bd = 1e9;
        for (let z = q.z; z < q.z + q.h; z++) for (let x = q.x; x < q.x + q.w; x++) { const d = Math.abs(x - q.cx) + Math.abs(z - q.cz); if (t[z * W + x] === 0 && d < bd) { bd = d; best = [x, z]; } }
        if (best) [q.cx, q.cz] = best;
      }
      return q;
    });
    // furniture: slid out to its wall's new face, then laid on the cells it covers
    const R = G.Furniture.R, wb = G.Furniture.worldBoxes, props = new Map<number, LvProp>(), propList: LvProp[] = [];
    for (const [ci, p0] of c.props) {
      if (fenceC.has(ci)) continue;
      const cx = ci % c.W, cz = (ci / c.W) | 0;
      let x = p0.x, z = p0.z;
      for (const [dx, dz] of p0.wd || []) {
        const fx = dx > 0 ? cx * K + K : dx < 0 ? cx * K - 1 : cx * K + 1, fz = dz > 0 ? cz * K + K : dz < 0 ? cz * K - 1 : cz * K + 1;
        if (t[fz * W + fx] === 0) { x += dx * cs; z += dz * cs; }
      }
      const p = Object.assign({}, p0, { x, z, boxes: wb(R[p0.name], x, z, p0.q, p0.v) });
      this.layProp({ W, H, t, props, propList }, p, p0.block || (c.t[ci] === 2 || c.t[ci] === 4 ? c.t[ci] : 0)); // (block: a piece laid on the fine grid itself, not on a tile: what it blocks, 2 or 4)
    }
    // garden fence panels
    for (let i = 0; i < W * H; i++) {
      if (t[i] !== 4 || props.has(i)) continue;
      const x = i % W, z = (i / W) | 0;
      const name = fenceInto.get(i) || fenceName.get(((z / K) | 0) * c.W + ((x / K) | 0)) || c.theme.fence || 'fence'; // (a festival's site fencing)
      const p = { name, q: fenceAx.get(i) === 'z' ? 1 : 0, x: (x + 0.5) * cs, z: (z + 0.5) * cs, v: ((x * 7 + z * 13) % 17) / 17 } as LvProp;
      p.boxes = wb(R[name], p.x, p.z, p.q, p.v);
      props.set(i, p); propList.push(p);
    }
    return { W, H, t, out, grate, rooms, seed: c.seed, level: c.level, doors, doorAt, props, propList, theme: c.theme } as unknown as LvMap;
  },
  // A piece on the fine grid: hung on every cell it covers, those it stands on blocked (bv: 2 or 4; 0: it blocks nothing).
  layProp(m: Pick<LvMap, 'W' | 'H' | 't' | 'props' | 'propList'>, p: LvProp, bv: number) {
    const { W, H, t, props } = m, cs = this.TS, blocks = !!bv;
    const hang = (i: number) => { const q = props.get(i); if (q && (q === p || q.boxes.includes(p.boxes[0]))) return; props.set(i, q ? { name: q.name, boxes: q.boxes.concat(p.boxes).sort((a: LvBox, b: LvBox) => b.h - a.h) } as LvProp : p); }; // (once a cell: each of its boxes over it would hang it again)
    m.propList.push(p);
    let any = false;
    for (const b of p.boxes) {
      for (let fz = Math.floor((b.cz - b.hz) / cs); fz <= Math.floor((b.cz + b.hz) / cs); fz++) for (let fx = Math.floor((b.cx - b.hx) / cs); fx <= Math.floor((b.cx + b.hx) / cs); fx++) {
        if (fx < 0 || fz < 0 || fx >= W || fz >= H) continue;
        const i = fz * W + fx;
        if (t[i] !== 0 && !(blocks && (t[i] === 2 || t[i] === 4))) continue;
        hang(i); any = true;
        // a cell whose middle it covers is blocked (a small thing in a corner leaves the floor walkable)
        if (blocks && Math.abs((fx + 0.5) * cs - b.cx) <= b.hx + 0.05 && Math.abs((fz + 0.5) * cs - b.cz) <= b.hz + 0.05) t[i] = bv;
      }
    }
    if (!any) hang(Math.floor(p.z / cs) * W + Math.floor(p.x / cs));
  },

  // Everything placed on the fine grid: cover spots, hiding spots, where suspects start, the weapon case, the
  // lights, spawn and extraction.
  finish(map: LvMap, r: LvRng) {
    const U = G.U, { W, H, t, rooms, spawnRoom, exitRoom } = map, TS = this.TS, K = this.K;
    // Cover spots: floor cells beside furniture you can hide behind, tight against its side
    map.cover = [];
    for (let z = 1; z < H - 1; z++) for (let x = 1; x < W - 1; x++) this.coverAt(map, x, z);
    // spots by a wall edge to lean out from (every third cell is plenty)
    map.wallSpots = [];
    for (let z = 1; z < H - 1; z++) for (let x = 1; x < W - 1; x++) this.wallSpotAt(map, x, z);
    // Enemy candidate spots: floor cells in rooms away from the spawn
    const dist2 = this.flow(map, [[spawnRoom.cx, spawnRoom.cz]].concat(map.entries || [])); // (a loft's upper floor is reached by its own stair: from its head too)
    map.enemySpots = [];
    rooms.forEach((rm) => {
      if (rm === spawnRoom || rm.front || rm.type === 'road' || rm.type === 'lawn' || rm.type === 'roof' || rm.lid) return; // (not out on the street among the patrol cars, nor out the front by the pad)
      for (let z = rm.z; z < rm.z + rm.h; z++) for (let x = rm.x; x < rm.x + rm.w; x++) {
        const i = z * W + x;
        if (t[i] === 0 && !map.props.has(i) && dist2[i] > 5 * K) map.enemySpots.push([x, z]);
      }
    });
    // The weapon case: only some levels have one (CASE_CHANCE, from the level seed so everyone agrees), on the
    // floor along a wall in a room away from the spawn: two clear cells side by side against the wall
    map.case = null;
    const hasCase = r() < this.CASE_CHANCE || !!map.theme.starter;
    const lootRooms = rooms.some((q) => q.lootRoom), keepIn = (q: LvRoom) => (!map.theme.starter || q.type === 'stockroom') && (!lootRooms || !!q.lootRoom); // (a ship with an armoury: in it) // (a starter level: its stockroom has them all)
    const clear = (x: number, z: number) => t[z * W + x] === 0 && !map.props.has(z * W + x);
    if (hasCase) for (const rm of U.shuffle(r, rooms.filter((q) => q !== spawnRoom && !q.front && !q.lid && q.type !== 'roof' && keepIn(q)))) {
      const spots = [];
      for (let z = rm.z; z < rm.z + rm.h; z++) for (let x = rm.x; x < rm.x + rm.w; x++) {
        let nearDoor = false;
        for (let dz = -2; dz <= 2; dz++) for (let dx = -2; dx <= 2; dx++) if (t[(z + dz) * W + x + dx] === 3) nearDoor = true;
        if (nearDoor) continue;
        for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const ax = dz ? 1 : 0, az = dx ? 1 : 0; // along the wall
          if (clear(x, z) && clear(x + ax, z + az) && t[(z + dz) * W + x + dx] === 1 && t[(z + az + dz) * W + x + ax + dx] === 1) spots.push([x, z, dx, dz, ax, az]);
        }
      }
      if (!spots.length) continue;
      const [x, z, dx, dz, ax, az] = U.pick(r, spots);
      // long side along the wall, latches and handle facing the room, hinge at the back
      map.case = { x: (x + 0.5 + ax * 0.5) * TS + dx * (TS / 2 - 0.22), z: (z + 0.5 + az * 0.5) * TS + dz * (TS / 2 - 0.22), yaw: Math.atan2(-dx, -dz) };
      break;
    }
    // First aid cabinets: rare, screwed to a wall at chest height in a room (not right by a door, not over
    // furniture). Their own random stream from the seed, so the rest of the level doesn't change with them.
    map.cabinets = [];
    {
      const rc = U.rng((map.seed ^ 0x5eed0cab) >>> 0);
      const want = rc() < this.CAB_CHANCE || map.theme.starter ? (rc() < this.CAB_TWO && !map.theme.starter ? 2 : 1) : 0;
      const used = new Set();
      for (const rm of U.shuffle(rc, rooms.filter(keepIn))) {
        if (map.cabinets.length >= want) break;
        if (used.has(rm)) continue;
        const spots = [];
        for (let z = rm.z; z < rm.z + rm.h; z++) for (let x = rm.x; x < rm.x + rm.w; x++) {
          if (!clear(x, z) || (map.out && map.out[z * W + x])) continue; // indoors only
          let nearDoor = false;
          for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) if (t[(z + dz) * W + x + dx] === 3) nearDoor = true;
          if (nearDoor) continue;
          for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (t[(z + dz) * W + x + dx] === 1) spots.push([x, z, dx, dz]);
        }
        if (!spots.length) continue;
        const [x, z, dx, dz] = U.pick(rc, spots);
        used.add(rm);
        // the back against the wall's face, the door facing the room
        map.cabinets.push({ x: (x + 0.5) * TS + dx * (TS / 2 - 0.075), z: (z + 0.5) * TS + dz * (TS / 2 - 0.075), yaw: Math.atan2(-dx, -dz) });
      }
    }
    // The attachments box: on most levels (ABOX_CHANCE), a small hard case on the floor against a wall in a room away
    // from the spawn (not by a door, not by the weapon case). Opened, it holds three attachments for the weapon in
    // the opener's hands (js/server.ts rollAbox). Its own random stream from the seed, like the cabinets'.
    map.abox = null;
    {
      const ra = U.rng((map.seed ^ 0xa77ac4ed) >>> 0);
      if (ra() < this.ABOX_CHANCE || map.theme.starter) for (const rm of U.shuffle(ra, rooms.filter((q) => q !== spawnRoom && keepIn(q)))) {
        const spots = [];
        for (let z = rm.z; z < rm.z + rm.h; z++) for (let x = rm.x; x < rm.x + rm.w; x++) {
          if (!clear(x, z) || (map.out && map.out[z * W + x])) continue;
          if (map.case && Math.hypot((x + 0.5) * TS - map.case.x, (z + 0.5) * TS - map.case.z) < 3) continue;
          let nearDoor = false;
          for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) if (t[(z + dz) * W + x + dx] === 3) nearDoor = true;
          if (nearDoor) continue;
          for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (t[(z + dz) * W + x + dx] === 1) spots.push([x, z, dx, dz]);
        }
        if (!spots.length) continue;
        const [x, z, dx, dz] = U.pick(ra, spots);
        // the hinge against the wall, the latches facing the room
        map.abox = { x: (x + 0.5) * TS + dx * (TS / 2 - 0.24), z: (z + 0.5) * TS + dz * (TS / 2 - 0.24), yaw: Math.atan2(-dx, -dz) };
        break;
      }
    }
    // The sticker box: on one level in ten (SBOX_CHANCE), a little display box on the floor against a wall in some room
    // indoors (not by a door, the weapon case or the attachments box), one sticker in it under a clear lid, for whoever
    // opens it first (js/server.ts, the host's pick of which). Its own random stream from the seed.
    map.sbox = null;
    {
      const rs = U.rng((map.seed ^ 0x571c4e25) >>> 0), far = (o: any, x: number, z: number) => !o || Math.hypot((x + 0.5) * TS - o.x, (z + 0.5) * TS - o.z) > 3;
      if (rs() < this.SBOX_CHANCE) for (const rm of U.shuffle(rs, rooms.filter(keepIn))) {
        const spots = [];
        for (let z = rm.z; z < rm.z + rm.h; z++) for (let x = rm.x; x < rm.x + rm.w; x++) {
          if (!clear(x, z) || (map.out && map.out[z * W + x]) || !far(map.case, x, z) || !far(map.abox, x, z)) continue;
          let nearDoor = false;
          for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) if (t[(z + dz) * W + x + dx] === 3) nearDoor = true;
          if (nearDoor) continue;
          for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (t[(z + dz) * W + x + dx] === 1) spots.push([x, z, dx, dz]);
        }
        if (!spots.length) continue;
        const [x, z, dx, dz] = U.pick(rs, spots);
        map.sbox = { x: (x + 0.5) * TS + dx * (TS / 2 - 0.13), z: (z + 0.5) * TS + dz * (TS / 2 - 0.13), yaw: Math.atan2(-dx, -dz) };
        break;
      }
    }
    // Ceiling lamps: one per room, a grid of them over a warehouse floor, none in the open; porch lanterns over
    // doors that open onto a garden
    map.lights = [];
    for (const rm of rooms) {
      if (rm.out || rm.type === 'catwalk') continue; // (a catwalk: lit by its hall's lamps, high over it)
      if (rm.tall) { // a hall the building's full height: high-bay lamps under its roof, a grid of them (lighting the catwalks too: stack)
        for (let z = rm.z + 5; z < rm.z + rm.h - 2; z += 12) for (let x = rm.x + 6; x < rm.x + rm.w - 2; x += 15) map.lights.push({ kind: 'highbay', x: (x + 0.5) * TS, z: (z + 0.5) * TS, y: this.FLOOR_H + this.WALL_H - 0.6, color: 0xffe2b8, i: 0.5, d: 17, up: 1 });
        continue;
      }
      if (rm.type === 'mart' || rm.type === 'cashier') { // a shop's: flat panels in rows, every three metres or so
        const x0 = rm.x * TS, z0 = rm.z * TS, nx = Math.max(1, Math.round(rm.w * TS / 3.2)), nz = Math.max(1, Math.round(rm.h * TS / 3.2));
        for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++) map.lights.push({ kind: 'panel', x: x0 + (i + 0.5) * rm.w * TS / nx, z: z0 + (j + 0.5) * rm.h * TS / nz });
        continue;
      }
      if (rm.type === 'corridor' || rm.type === 'spine') { for (let x = rm.x + 2; x < rm.x + rm.w; x += 7) map.lights.push({ x: (x + 0.5) * TS, z: (rm.cz + 0.5) * TS }); continue; } // down a hallway
      if (rm.type === 'hangar') { // a lamp every 8 m by 6 m down the hall
        for (let z = rm.z + 3; z < rm.z + rm.h; z += 9) for (let x = rm.x + 6; x < rm.x + rm.w - 2; x += 12) map.lights.push({ x: (x + 0.5) * TS, z: (z + 0.5) * TS });
      } else if (rm.type === 'hall' || rm.type === 'dock') {
        for (let z = rm.z + 3; z < rm.z + rm.h; z += 9) for (let x = rm.x + 6; x < rm.x + rm.w - 2; x += 18) map.lights.push({ x: (x + 0.5) * TS, z: (z + 0.5) * TS });
      } else map.lights.push({ x: (rm.cx + 0.5) * TS, z: (rm.cz + 0.5) * TS });
    }
    for (const d of map.doors) {
      if (d.axis !== 'z' || (d.mirror && map.doors.some((o) => o !== d && !o.mirror && Math.abs(o.x - d.x) < 1.5 && Math.abs(o.z - d.z) < 0.1))) continue;
      const below = map.out[(d.tz + 1) * W + d.tx], above = map.out[(d.tz - 1) * W + d.tx];
      if (below === above) continue;
      const dir = below ? 1 : -1, pair = map.doors.find((o) => o !== d && o.mirror && Math.abs(o.x - d.x) < 1.5 && Math.abs(o.z - d.z) < 0.1);
      map.lights.push({ x: pair ? (d.x + pair.x) / 2 : d.x, z: d.z + dir * (TS / 2 + 0.06), y: 2.55, porch: dir });
    }
    // what machinery gives off (js/furniture.ts R[name].glow, .fx, in the piece's own frame): its glow, a lamp of its own
    // (lighting the floor above too: up), and what it throws off (sparks, embers, smoke, steam: buildFx)
    map.fx = [];
    for (const p of map.propList || []) {
      const rec = G.Furniture.R[p.name];
      if (!rec.glow && !rec.fx) continue;
      const s = Math.round(Math.sin(p.q * Math.PI / 2)), c = Math.round(Math.cos(p.q * Math.PI / 2)), at = (lx: number, lz: number) => [p.x + lx * c + lz * s, p.z - lx * s + lz * c];
      if (rec.glow) { const g = rec.glow, [x, z] = at(g.x || 0, g.z || 0); map.lights.push({ kind: 'string', x, z, y: g.y, color: g.color, i: g.i, d: g.d, up: 1, glow: 1 }); }
      for (const f of rec.fx || []) {
        const [x, z] = at(f.x || 0, f.z || 0), d = f.dir ? [f.dir[0] * c + f.dir[2] * s, f.dir[1], -f.dir[0] * s + f.dir[2] * c] : null;
        map.fx.push(Object.assign({}, f, { x, z, dir: d }));
      }
    }
    // a festival: real lights along the strings (a warm pool every few metres) and coloured ones over the stage. They're
    // many and close together, so each is dim: what they add up to is a lit night (the light under the strings about a
    // room lamp's), not every surface past white
    if (map.fest) {
      for (const s of map.fest.strings) {
        const len = Math.hypot(s.b[0] - s.a[0], s.b[2] - s.a[2]), n = Math.max(1, Math.round(len / 9));
        for (let i = 0; i < n; i++) {
          const u = (i + 0.5) / n;
          map.lights.push({ kind: 'string', x: s.a[0] + (s.b[0] - s.a[0]) * u, z: s.a[2] + (s.b[2] - s.a[2]) * u, y: s.a[1] + (s.b[1] - s.a[1]) * u - 0.6, color: s.kind === 'lantern' ? 0xffa868 : 0xffd29a, i: 0.5, d: 11 });
        }
      }
      for (const [x, z] of map.fest.lamps) map.lights.push({ kind: 'string', x, z, y: 5.6, color: 0xffcf98, i: 0.85, d: 17 }); // street lamps
      const st = map.fest.stage;
      if (st) [0xff3fa0, 0x40c0ff, 0xffb040].forEach((color, i) => map.lights.push({ kind: 'string', x: st.x0 + (st.x1 - st.x0) * (0.2 + i * 0.3), z: st.z1 - 0.6, y: 5.5, color, i: 1.3, d: 20 }));
    }
    // the lamps nearest where you come in first (only the first dozen are real lights)
    { const sx = (spawnRoom.cx + 0.5) * TS, sz = (spawnRoom.cz + 0.5) * TS; map.lights.sort((a, b) => Math.hypot(a.x - sx, a.z - sz) - Math.hypot(b.x - sx, b.z - sz)); }
    // An open door's leaf stands out into the room beside its hinge; it hides whoever's behind it and stops
    // rounds (like the closed door), though you can walk past it. Which cells it stands in, per door.
    map.leafAt = new Map();
    for (const d of map.doors) this.hangLeaf(map, d);
    map.unitAt = null;
    if (map.units) {
      map.unitAt = new Int8Array(W * H).fill(-1);
      for (const rm of rooms) if (rm.unit != null) for (let z = rm.z; z < rm.z + rm.h; z++) for (let x = rm.x; x < rm.x + rm.w; x++) map.unitAt[z * W + x] = rm.unit;
      // the doorways and thinned walls between an apartment's rooms are the apartment's too (not the hallway's)
      for (const rm of rooms) if (rm.unit == null) for (let z = rm.z; z < rm.z + rm.h; z++) for (let x = rm.x; x < rm.x + rm.w; x++) map.unitAt[z * W + x] = -2;
      for (let pass = 0; pass < 2; pass++) for (let i = W; i < W * (H - 1); i++) {
        if (map.unitAt[i] !== -1 || t[i] === 1) continue;
        for (const j of [i - 1, i + 1, i - W, i + W]) if (map.unitAt[j] >= 0) { map.unitAt[i] = map.unitAt[j]; break; }
      }
      for (let i = 0; i < W * H; i++) if (map.unitAt[i] === -2) map.unitAt[i] = -1;
    }
    this.placeWindows(map);
    map.spawn = { x: (spawnRoom.cx + 0.5) * TS, z: (spawnRoom.cz + 0.5) * TS };
    map.extract = { x: (exitRoom.cx + 0.5) * TS, z: (exitRoom.cz + 0.5) * TS, r: 3 };
    return map;
  },
  // which cells a door's open leaf stands in
  hangLeaf(map: LvMap, d: LvDoor) {
    const TS = this.TS, b = d.leaf = this.leafBox(d);
    for (let z = Math.floor((b.cz - b.hz) / TS); z <= Math.floor((b.cz + b.hz) / TS); z++) for (let x = Math.floor((b.cx - b.hx) / TS); x <= Math.floor((b.cx + b.hx) / TS); x++) {
      const i = z * map.W + x;
      if (!map.leafAt.has(i)) map.leafAt.set(i, []);
      map.leafAt.get(i).push(d);
    }
  },
  // A door added once the floor's planned (js/homes.ts cut): two wall cells on the fine grid, [x, z] each, shut. A record as
  // refine makes them. (id: numbered through as the floors stack.)
  layDoor(map: LvMap, cells: number[][], axis: LvAxis) {
    const cs = this.TS, ids = cells.map(([x, z]) => z * map.W + x);
    const d = { id: map.doors.length, i: ids[0], cells: ids, tx: cells[0][0], tz: cells[0][1], axis, open: false, mirror: false, kind: null, w: 2 * cs,
      x: ((cells[0][0] + cells[1][0] + 1) / 2) * cs, z: ((cells[0][1] + cells[1][1] + 1) / 2) * cs } as LvDoor;
    map.doors.push(d); ids.forEach((i) => { map.t[i] = 3; map.doorAt.set(i, d); });
    this.hangLeaf(map, d);
    return d;
  },
  // the cover spots of a floor cell, if it's beside furniture you can hide behind
  coverAt(map: LvMap, x: number, z: number) {
    const { W, t } = map, TS = this.TS;
    if (t[z * W + x] !== 0) return;
    const tcx = (x + 0.5) * TS, tcz = (z + 0.5) * TS;
    for (const [ox, oz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      if (t[(z + oz) * W + x + ox] !== 2) continue;
      const b = this.boxesAt(map, x + ox, z + oz)[0];
      if (!b || b.h < 0.85) continue;
      // stand half a metre off the face nearest this cell, level with its centre
      const sx = ox ? b.cx - ox * (b.hx + 0.5) : tcx, sz = oz ? b.cz - oz * (b.hz + 0.5) : tcz;
      if (ox ? Math.abs(tcz - b.cz) > b.hz + 0.1 : Math.abs(tcx - b.cx) > b.hx + 0.1) continue;
      if (Math.abs(sx - tcx) > 0.8 || Math.abs(sz - tcz) > 0.8) continue;
      if (map.cover.some((q) => Math.abs(q.x - sx) < 0.5 && Math.abs(q.z - sz) < 0.5)) continue;
      map.cover.push({ x: sx, z: sz, cx: b.cx, cz: b.cz });
    }
  },
  wallSpotAt(map: LvMap, x: number, z: number) {
    const { W, t } = map;
    if (t[z * W + x] !== 0 || (x + z) % 2) return;
    if (t[z * W + x - 1] === 1 || t[z * W + x + 1] === 1 || t[(z - 1) * W + x] === 1 || t[(z + 1) * W + x] === 1) map.wallSpots.push({ x: (x + 0.5) * this.TS, z: (z + 0.5) * this.TS });
  },
  // A room's spots again, after its furniture's changed (js/homes.ts): cover, wall spots and where suspects can start
  respot(map: LvMap, rm: LvRoom) {
    const { W, t } = map, TS = this.TS, K = this.K, x1 = rm.x + rm.w, z1 = rm.z + rm.h;
    const inside = (c: LvPt) => c.x >= rm.x * TS && c.x < x1 * TS && c.z >= rm.z * TS && c.z < z1 * TS;
    map.cover = map.cover.filter((c) => !inside(c)); map.wallSpots = map.wallSpots.filter((c) => !inside(c));
    map.enemySpots = map.enemySpots.filter(([x, z]) => x < rm.x || x >= x1 || z < rm.z || z >= z1);
    const dist = this.flow(map, [[map.spawnRoom.cx, map.spawnRoom.cz]].concat(map.entries || []));
    for (let z = rm.z; z < z1; z++) for (let x = rm.x; x < x1; x++) {
      this.coverAt(map, x, z); this.wallSpotAt(map, x, z);
      const i = z * W + x;
      if (t[i] === 0 && !map.props.has(i) && dist[i] > 5 * K) map.enemySpots.push([x, z]);
    }
  },
  // ---------------------------------------------------------------- windows
  // Real windows: a wall opening two cells wide with a sill (to 0.95 m), a lintel (from 2.25 m) and a pane of
  // glass between. You can't climb through (to movement and paths it's still wall), but you can see through,
  // shoot through (the glass breaks), and suspects can see you through it, less well until it's broken.
  //   thru: in a wall between indoors and outdoors (a house onto its garden or the street, a warehouse onto its
  //     dock, a building onto its lot): there's real ground on the far side.
  //   ext: in the outer wall of the building, looking out at the city (the view in the glass, js/furniture.ts
  //     outsideMaterial; high up in an apartment block). Rounds through it stop in the wall behind.
  // From the level's own random stream, so every peer has the same windows. map.windows[id], map.winAt: cell -> ray boxes.
  SILL: 0.95, TOP: 2.25,
  placeWindows(map: LvMap) {
    const { W, H, t, out, rooms } = map, TS = this.TS, K = this.K, U = G.U, rw = U.rng((map.seed ^ 0x51d0b0) >>> 0);
    map.windows = []; map.winAt = new Map();
    if (map.theme.entry === 'vault' || map.theme.hub || map.underground || rooms.some((q) => q.lid)) return; // a bunker has none, nor does the hangar, nor a basement, nor a roof's stair heads
    const used = new Set(), floor = (i: number) => t[i] === 0 || t[i] === 2 || t[i] === 4 || (t[i] === 5 && out[i]); // (upstairs, the open air outside a house counts)
    const nearDoor = (x: number, z: number) => { for (let dz = -2; dz <= 2; dz++) for (let dx = -2; dx <= 2; dx++) if (t[(z + dz) * W + x + dx] === 3) return true; return false; };
    const tall = (i: number) => { const p = map.props && map.props.get(i); return !!(p && p.boxes[0] && p.boxes[0].h > 1.0); };
    const inside = (x: number, z: number) => x > 0 && z > 0 && x < W - 1 && z < H - 1;
    const add = (cells: number[], nx: number, nz: number, ext: boolean, kind?: Record<string, any>) => {
      const [a, b] = cells.map((i) => [i % W, (i / W) | 0]);
      const mx = ((a[0] + b[0]) / 2 + 0.5) * TS, mz = ((a[1] + b[1]) / 2 + 0.5) * TS, near = (o: LvPt | null) => o && Math.hypot(o.x - mx, o.z - mz) < 1.6;
      if (!kind && (near(map.case) || near(map.abox) || near(map.sbox) || (map.cabinets || []).some(near))) return; // (not through the wall a cabinet or the weapon case is against)
      const id = map.windows.length;
      // the opening's middle, on the wall's centre line (thru) or the room-side cell's middle (ext)
      const w: LvWin = { id, cells, nx, nz, ext, broken: false, x: ((a[0] + b[0]) / 2 + 0.5) * TS, z: ((a[1] + b[1]) / 2 + 0.5) * TS, len: 2 * TS };
      if (kind && kind.armor) w.armor = true; // (wired, bulletproof: it stops rounds, never breaks; you see through it)
      if (kind && kind.cooler) w.cooler = true; // (a cooler's glass doors)
      // (its own sill and top: a cooler's doors nearly to the floor, a cashier's glass from the counter up)
      const S0 = kind && kind.sill != null ? kind.sill : this.SILL, T0 = kind && kind.top != null ? kind.top : this.TOP;
      if (S0 !== this.SILL || T0 !== this.TOP) { w.sill = S0; w.top = T0; }
      map.windows.push(w);
      for (const i of cells) {
        used.add(i);
        const cx = ((i % W) + 0.5) * TS, cz = (((i / W) | 0) + 0.5) * TS, h = TS / 2, along = nx ? { hx: 0.02, hz: h } : { hx: h, hz: 0.02 };
        const full = { cx, cz, hx: h, hz: h };
        const boxes = [Object.assign({ y0: 0, h: S0 }, full), Object.assign({ y0: T0, h: this.WALL_H }, full)];
        const glass = Object.assign({ cx, cz, y0: S0, h: T0, glass: id }, along);
        // an outside window: what's past the glass is the view (the wall behind): rounds stop there, unseen
        const back = ext ? Object.assign({ cx: cx + nx * (h - 0.01), cz: cz + nz * (h - 0.01), y0: this.SILL, h: this.TOP, view: true }, nx ? { hx: 0.01, hz: h } : { hx: h, hz: 0.01 }) : null;
        map.winAt.set(i, { win: w, open: back ? boxes.concat([back]) : boxes, shut: (back ? boxes.concat([back]) : boxes).concat([glass]) });
      }
    };
    // glass the layout puts in walls between rooms (runs of coarse wall tiles: a convenience store's coolers and its
    // cashier's bulletproof glass): along the thinned wall's middle line, two cells to a pane, wherever there's floor
    // both sides (not a door, not a corner)
    for (const run of map.glassRuns || []) {
      const horiz = !run.v, nx = horiz ? 0 : 1, nz = horiz ? 1 : 0, cells = []; // (v: a north-south wall)
      if (horiz) { const z = run.z0 * K + 1; for (let x = run.x0 * K; x < (run.x1 + 1) * K; x++) cells.push(z * W + x); }
      else { const x = run.x0 * K + 1; for (let z = run.z0 * K; z < (run.z1 + 1) * K; z++) cells.push(z * W + x); }
      const ok = (i: number) => t[i] === 1 && !used.has(i) && floor(i - nx - nz * W) && floor(i + nx + nz * W);
      for (let k = 0; k + 1 < cells.length; k++) if (ok(cells[k]) && ok(cells[k + 1])) { add([cells[k], cells[k + 1]], nx, nz, false, run); k++; }
    }
    // a wall cell with floor either side along one axis (a thin wall), indoors on one side and outdoors on the other
    const thruAt = (x: number, z: number) => {
      const i = z * W + x;
      if (t[i] !== 1 || used.has(i) || !inside(x, z)) return null;
      for (const [nx, nz] of [[1, 0], [0, 1]]) {
        const a = i - nx - nz * W, b = i + nx + nz * W;
        if (!floor(a) || !floor(b) || !!out[a] === !!out[b]) continue;
        const s = out[b] ? 1 : -1; // pointing outdoors
        return [nx * s, nz * s, out[b] ? a : b];
      }
      return null;
    };
    for (let z = 2; z < H - 2; z++) for (let x = 2; x < W - 2; x++) {
      const c = thruAt(x, z);
      if (!c) continue;
      const [nx, nz, roomSide] = c, ax = nz ? 1 : 0, az = nx ? 1 : 0, c2 = thruAt(x + ax, z + az);
      if (!c2 || c2[0] !== nx || c2[1] !== nz || nearDoor(x, z) || nearDoor(x + ax, z + az)) continue;
      if (tall(roomSide) || tall(c2[2]) || used.has((z - az) * W + x - ax) || used.has((z - 2 * az) * W + x - 2 * ax)) continue;
      if (rw() < (map.theme.thru != null ? map.theme.thru : 0.45)) add([z * W + x, (z + az) * W + x + ax], nx, nz, false);
    }
    // the building's outer walls: a wall face of a room, with solid wall from there to the edge of the map (and
    // not too thick); a couple to a room
    const solidOut = (x: number, z: number, dx: number, dz: number) => { let n = 0; for (let cx = x, cz = z; cx >= 0 && cz >= 0 && cx < W && cz < H; cx += dx, cz += dz) { if (t[cz * W + cx] !== 1 || ++n > 4 * K) return false; } return true; };
    for (const rm of rooms) {
      if (rm.out) continue;
      let n = 0;
      for (let z = rm.z; z < rm.z + rm.h && n < 2; z++) for (let x = rm.x; x < rm.x + rm.w && n < 2; x++) {
        if (!floor(z * W + x) || out[z * W + x]) continue;
        for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const wx = x + dx, wz = z + dz, ax = dz ? 1 : 0, az = dx ? 1 : 0, w2 = (wz + az) * W + wx + ax;
          if (!solidOut(wx, wz, dx, dz) || !solidOut(wx + ax, wz + az, dx, dz) || used.has(wz * W + wx) || used.has(w2) || !floor((z + az) * W + x + ax) || out[(z + az) * W + x + ax]) continue;
          if (nearDoor(wx, wz) || nearDoor(wx + ax, wz + az) || tall(z * W + x) || tall((z + az) * W + x + ax) || used.has((wz - az) * W + wx - ax) || used.has((wz + 2 * az) * W + wx + 2 * ax)) continue;
          if (rw() > (map.theme.winRate || 0.12)) continue;
          add([wz * W + wx, w2], dx, dz, true); n++;
          break;
        }
      }
    }
  },
  // the box an open door's leaf fills (it swings from its hinge jamb: +x for doors you walk through along x,
  // -z for the others; see the door meshes in buildMesh)
  leafBox(d: LvDoor) {
    const half = (d.w || this.TS) / 2, len = (d.w || this.TS) - 0.05, m = d.mirror ? -1 : 1;
    return d.axis === 'x'
      ? { cx: d.x + 0.02 + len / 2, cz: d.z - half * m, hx: len / 2, hz: 0.035, y0: 0, h: this.DOOR_H }
      : { cx: d.x - half * m, cz: d.z - 0.02 - len / 2, hx: 0.035, hz: len / 2, y0: 0, h: this.DOOR_H };
  },
  // what a ray meets in a tile: its solid boxes, and any open door leaf standing in it
  // (shelving gives its posts, shelves and loads instead of its footprint: you see and shoot through the gaps)
  rayBoxesAt(map: LvMap, tx: number, tz: number) {
    const wa = map.winAt && map.winAt.get(tz * map.W + tx);
    if (wa) return wa.win.broken ? wa.open : wa.shut;
    let bs: LvBox[] & { _ray?: LvBox[] } = this.boxesAt(map, tx, tz);
    if (bs._ray || bs.some((b: LvBox) => b.ray)) bs =bs._ray || (bs._ray = bs.flatMap((b: LvBox) => b.ray || [b]));
    const ds = map.leafAt && map.leafAt.get(tz * map.W + tx);
    if (!ds) return bs;
    let out = bs;
    for (const d of ds) if (d.open) out = (out === bs ? bs.slice() : out).concat([d.leaf]);
    return out;
  },

  // ----------------------------------------------------------------- layouts
  // A music festival at night, on the edge of a town, about 120 x 108 m, all of it open to the sky.
  //  - The festival (the east): the stage at the far end with rows of seats in front of it (long sight lines over
  //    them), then the food court (rows of food and merchandise stalls facing each other across lanes), lights
  //    strung over everything, a toilet block on one side (two washrooms, cubicles behind their own doors), picnic
  //    tables behind it, and its gate, ticket booths either side.
  //  - The town square (the west), behind the festival's fence with a side gate through: shops down the west side
  //    and along the north (cafes, stores, bars, each with a door onto the square), a fountain in the middle.
  //  - The car park along the south, where you come in: rows of parked cars, the festival's gate under its arch
  //    and the street into the square opening off it.
  // (What goes where: G.Furniture.plan's festival(); the lights, sky and stage rig: buildFestival.)
  layFestival(r: LvRng, level: number): LvLay {
    const U = G.U, W = 58 + Math.min(level, 4) * 2, H = 61, TX = 17, PZ = 42; // the town west of TX; the car park south of PZ, the overflow beyond it where the helicopter lands
    const t = new Uint8Array(W * H).fill(1), out = new Uint8Array(W * H).fill(1), rooms: LvRoom[] = [], doors: LvDoorSpec[] = [], fences: LvFence[] = [];
    const fill = (x0: number, z0: number, w: number, h: number) => { for (let z = z0; z < z0 + h; z++) for (let x = x0; x < x0 + w; x++) t[z * W + x] = 0; };
    const solid = (x0: number, z0: number, x1: number, z1: number) => { for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) { t[z * W + x] = 1; out[z * W + x] = 0; } }; // a building's footprint
    const fence = (x: number, z: number, axis: string) => { t[z * W + x] = 4; fences.push([x, z, axis]); };
    fill(1, 1, W - 2, H - 2);
    // the town's buildings: a row of shops down the west edge and along the north of the square
    solid(0, 0, 5, PZ - 1); solid(6, 0, TX - 1, 5);
    const shop = (x: number, z: number, door: LvDoorSpec) => { fill(x, z, 4, 4); rooms.push(this._room(x, z, 4, 4, { type: U.pick(r, ['cafe', 'store', 'store', 'bar']) })); doors.push(door); };
    for (let z = 6; z + 3 <= PZ - 3; z += 5) shop(1, z, [5, z + 1 + (r() < 0.5 ? 0 : 1), 'x', false, false]); // (below the north row: the corner's solid)
    for (let x = 7; x + 3 <= TX - 2; x += 5) shop(x, 1, [x + 1 + (r() < 0.5 ? 0 : 1), 5, 'z', false, false]);
    // fencing round the site (not where a building is the edge), between the festival and the square (a side gate
    // half way down), and along the car park (the festival's gate, and the street into the square)
    for (let x = 0; x < W; x++) for (const z of [0, H - 1]) if (out[z * W + x]) fence(x, z, 'x');
    for (let z = 1; z < H - 1; z++) for (const x of [0, W - 1]) if (out[z * W + x]) fence(x, z, 'z');
    const gz = PZ >> 1;
    for (let z = 1; z < PZ; z++) if (Math.abs(z - gz) > 1) fence(TX, z, 'z');
    const fx = (TX + 1 + W - 2) >> 1;
    for (let x = 1; x < W - 1; x++) if (!(x >= fx - 2 && x <= fx + 1) && !(x >= 8 && x <= 10)) fence(x, PZ, 'x');
    // the toilet block, against the festival's east fence: a washroom each side of a dividing wall, two cubicles off each
    const x0 = TX + 1, x1 = W - 2, fw = x1 - x0 + 1, bx0 = x1 - 6, bx1 = x1, bz0 = 16, bz1 = 26;
    for (let z = bz0; z <= bz1; z++) for (let x = bx0; x <= bx1; x++) { t[z * W + x] = 1; out[z * W + x] = 0; }
    fill(bx0 + 1, bz0 + 1, 3, 4); fill(bx0 + 1, bz0 + 6, 3, 4);
    const cubX = bx1 - 1;
    for (const z of [bz0 + 1, bz0 + 3, bz0 + 6, bz0 + 8]) { t[z * W + cubX] = 0; doors.push([cubX - 1, z, 'x', false, false]); rooms.push(this._room(cubX, z, 1, 1, { type: 'cubicle' })); }
    doors.push([bx0, bz0 + 2, 'x', false, false], [bx0, bz0 + 7, 'x', false, false]);
    rooms.push(this._room(bx0 + 1, bz0 + 1, 3, 4, { type: 'washroom' }), this._room(bx0 + 1, bz0 + 6, 3, 4, { type: 'washroom' }));
    // the open ground (the stage first: the seats string their lights from it)
    const cxF = (x0 + x1) >> 1;
    const stage = this._room(cxF - 7, 1, 14, 4, { type: 'stage', out: true });
    const seating = this._room(x0, 5, fw, 10, { type: 'seating', out: true });
    const court = this._room(x0, 16, bx0 - x0, PZ - 21, { type: 'court', out: true });
    const picnic = this._room(bx0, bz1 + 1, x1 - bx0 + 1, PZ - 6 - bz1, { type: 'picnic', out: true });
    const gate = this._room(x0, PZ - 5, fw, 5, { type: 'gate', out: true });
    const plaza = this._room(6, 6, TX - 6, PZ - 6, { type: 'plaza', out: true });
    const lot = this._room(1, PZ + 1, W - 2, 10, { type: 'parking', out: true });
    const aisle = this._room(1, PZ + 4, W - 2, 2, { type: 'aisle', out: true }); // (the lane between the rows of cars: where you come in)
    const over = this._room(1, PZ + 12, W - 2, 6, { type: 'lz', out: true }), lz = this._pad(over, W, (W - this.LZ_W) >> 1, PZ + 12, this.LZ_KIT.festival);
    rooms.unshift(stage, seating, court, picnic, gate, plaza, lot, aisle, over);
    return { W, H, t, rooms, doors, out, fences, spawn: over, lz };
  },
  // The top of the Sandia Mountains over Albuquerque at sundown: two summits of pink granite either side of a gorge, a
  // saddle between them at the north end, 580 x 92 m, all of it open to the sky. A sniper's level: from the overlook on the
  // west summit the greenhouse on the east one is about 500 m off across the gorge, and 22 m lower (the east summit's the
  // lower one: crestGround). The way over on foot is the saddle (the way the suspects come), a long walk falling all the
  // way; halfway along it, out over the gorge, a viewing building. Two ziplines are quicker, both downhill: from the ridge
  // by the overlook to the viewing site, and from there to the garden (crest.lines: js/player.ts rides them).
  //  - The west summit, where you come in: the crest's parking lot (south-west), the helicopter's pad on it; north of it a
  //    band of outcrops with a way through, the Crest House past it (a stone gift shop, its office and storeroom behind), then
  //    the trail north among the outcrops to the overlook, a flagstone terrace out over the gorge. North of that the ridge,
  //    and the saddle over to the east summit.
  //  - The viewing site, halfway along the saddle: a concrete room out over the gorge from the rim, glass across its front
  //    and down both sides (the gorge under it, the overlook one way along it and the garden the other), a terrace either
  //    side of it, where the ziplines come in and go on.
  //  - The east summit: a chile garden (raised beds, fruit trees) round a glass greenhouse in the middle of it; south of
  //    the garden, behind a coyote fence, the antenna farm (masts on their equipment huts).
  //  - The gorge: open air (5) CHASM metres down to its floor (lay.chasm: js/world.ts puts the ground there), a low stone
  //    wall (the theme's fence) along every edge of it and round the map.
  // The outcrops (wall tiles, lay.crest.kind 1) are laid in blobs, each kept only if every bit of ground is still reached,
  // and never a tile thick (a wall that thick between two open spaces thins to a slab: refine).
  // (What goes where: G.Furniture.plan's crest(); the sky, the mountain under it and the city below: buildCrest.)
  CHASM: 45,
  // The Sandia Crest's ground, not flat: map.terrain, a height at each corner of the fine grid (v, (W + 1) x (H + 1)), the
  // ground across a cell the two triangles between its corners (js/world.ts terrainAt; drawn the same: build). What it's
  // built on first, base: level at 0 over the west summit; the saddle falls away from past the overlook, VIEW down at the
  // viewing site and GARDEN at the east summit, the falls eased in and out (crestFall: the steepest about 6 degrees); and the
  // garden rolls, HILLS of it up from there, level again round the greenhouse, along the rim and by the antenna farm. At
  // every wall, outcrop, fence, rim, piece of furniture, door and zipline end and the ladder's foot, and all over the pad,
  // the overlook, the terraces and the rooms, the ground's the base: what's built there stands on it (js/world.ts and build:
  // the walls, doors and windows from there, every piece at the lowest of the corners under it, gy). Elsewhere it rises from
  // the base no steeper than GROUND.RISE a cell (about 17 degrees: a walk), so the slopes come up off what's built into the
  // open ground between. What it rises toward there: the west summit's hump behind the overlook and a lower one on the
  // ridge north of it, the east summit's past the garden, the saddle a little, and a roll over all of it (from the seed:
  // the same for everyone). (The rocks and trees on it, NATURAL, don't keep it level: they sit where it lies, as low as it
  // goes under them.)
  GROUND: { RISE: 0.2, ROLL: 0.45, VIEW: -15, GARDEN: -22, HILLS: 1.8, NATURAL: new Set(['boulder', 'juniper', 'pinon', 'cholla']) },
  crestGround(map: LvMap) {
    const { W, H, t } = map, TS = this.TS, VW = W + 1, VH = H + 1, cr = map.crest, CS = this.CTS, G2 = this.GROUND, rr = G.U.rng((map.seed ^ 0x51ab0e) >>> 0);
    const s1 = rr() * 6.3, s2 = rr() * 6.3, s3 = rr() * 6.3;
    // cells something stands on, or that are kept level: then their corners (and a corner round them, for what overhangs)
    const flat = new Uint8Array(W * H), keepRooms = map.rooms.filter((q) => q.type === 'lz' || q.type === 'overlook' || q.type === 'terrace' || q.type === 'greenhouse' || !q.out);
    const natural = (i: number) => { const p = map.props.get(i); return p && G2.NATURAL.has(p.name); };
    for (let i = 0; i < W * H; i++) if ((t[i] !== 0 && !natural(i)) || !map.out[i] || (map.props.has(i) && !natural(i))) flat[i] = 1;
    for (const q of keepRooms) for (let z = q.z; z < q.z + q.h; z++) for (let x = q.x; x < q.x + q.w; x++) flat[z * W + x] = 1;
    for (const d of map.doors) for (const i of d.cells || []) flat[i] = 1;
    for (const l of cr.lines.concat((cr.ladders || []).map((l: any) => ({ on: l.foot, off: l.foot })))) for (const [mx, mz] of [l.on, l.off]) for (let z = Math.floor((mz - 2.5) / TS); z <= (mz + 2.5) / TS; z++) for (let x = Math.floor((mx - 2.5) / TS); x <= (mx + 2.5) / TS; x++) if (x >= 0 && z >= 0 && x < W && z < H) flat[z * W + x] = 1;
    const fixed = new Uint8Array(VW * VH);
    for (let i = 0; i < W * H; i++) if (flat[i]) { const x = i % W, z = (i / W) | 0; for (let dz = -1; dz <= 2; dz++) for (let dx = -1; dx <= 2; dx++) { const vx = x + dx, vz = z + dz; if (vx >= 0 && vz >= 0 && vx < VW && vz < VH) fixed[vz * VW + vx] = 1; } }
    // what the ground would do left to itself (m)
    const gauss = (x: number, z: number, cx: number, cz: number, rx: number, rz: number) => Math.exp(-(((x - cx) / rx) ** 2) - (((z - cz) / rz) ** 2));
    const rim0 = cr.CX0 * CS, rim1 = (cr.CX1 + 1) * CS, sz = cr.SZ * CS, Wm = W * TS, sm = (a: number, b: number, x: number) => G.U.smooth(a, b, x);
    // what it's built on (m): the falls along the saddle (none till past the overlook; the viewing site level, VIEW, from a
    // few metres either side of it; GARDEN from short of the east rim), and the garden's hills
    const [gx, gz] = cr.gh, g0 = [gx * CS - 3, gz * CS - 3], g1 = [(gx + 7) * CS + 3, (gz + 9) * CS + 3];
    const base = (x: number, z: number) => {
      let h = this.crestFall(cr, x);
      if (x > rim1) {
        const off = Math.hypot(Math.max(0, g0[0] - x, x - g1[0]), Math.max(0, g0[1] - z, z - g1[1])); // (how far from the greenhouse)
        const k = sm(rim1 + 3, rim1 + 16, x) * sm(7, 13, z) * (1 - sm(56, 62, z)) * sm(0, 10, off) * (1 - sm(Wm - 16, Wm - 4, x));
        h += k * G2.HILLS * (0.5 + 0.32 * Math.sin(x / 8.5 + s1) * Math.sin(z / 7.2 + s2) + 0.18 * Math.sin((x - z * 0.7) / 10.5 + s3));
      }
      return h;
    };
    const want = (x: number, z: number) => {
      let h;
      if (x < rim0) h = 3.4 * gauss(x, z, rim0 * 0.36, 34, 16, 26) + 1.6 * gauss(x, z, rim0 * 0.25, 10, 12, 9); // the west summit, the ridge
      else if (x > rim1) h = 2.6 * gauss(x, z, (rim1 + W * TS) / 2 + 6, 44, 14, 30); // the east summit
      else h = z < sz ? 1.0 + 0.4 * Math.sin(x / 23 + s3) : 0; // the saddle
      h += G2.ROLL * (Math.sin(x * 0.31 + s1) * Math.sin(z * 0.27 + s2) + 0.6 * Math.sin((x + z) * 0.53 + s3));
      return Math.max(0, h);
    };
    const v = new Float32Array(VW * VH);
    for (let vz = 0; vz < VH; vz++) for (let vx = 0; vx < VW; vx++) { const k = vz * VW + vx, x = vx * TS, z = vz * TS; v[k] = base(x, z) + (fixed[k] ? 0 : want(x, z)); }
    // no steeper than RISE a cell anywhere (from every side, the diagonals too): sweeps both ways, twice
    const R = G2.RISE, RD = R * Math.SQRT2;
    const sweep = (fwd: boolean) => {
      for (let n = 0; n < VW * VH; n++) {
        const k = fwd ? n : VW * VH - 1 - n, x = k % VW, z = (k / VW) | 0, s = fwd ? -1 : 1;
        let h = v[k];
        if (x + s >= 0 && x + s < VW) h = Math.min(h, v[k + s] + R);
        if (z + s >= 0 && z + s < VH) { h = Math.min(h, v[k + s * VW] + R); if (x + 1 < VW) h = Math.min(h, v[k + s * VW + 1] + RD); if (x > 0) h = Math.min(h, v[k + s * VW - 1] + RD); }
        v[k] = h;
      }
    };
    for (let p = 0; p < 2; p++) { sweep(true); sweep(false); }
    const hole = new Uint8Array(W * H); for (let i = 0; i < W * H; i++) if (t[i] === 5) hole[i] = 1; // (the gorge's open air: nothing to stand on, js/world.ts terrainUnder)
    map.terrain = { VW, VH, TS, v, hole };
    map.minY = -map.chasm; // (rounds fly on down into the gorge, and to the east summit under the west's: js/player.ts)
    // every piece on it at the lowest of the corners under it (the rocks and trees never in the air on the downhill side;
    // what's built, where it's level, on it)
    for (const p of map.propList || []) {
      let lo = Infinity;
      for (const b of p.boxes) for (let z = Math.max(0, Math.floor((b.cz - b.hz) / TS)); z <= Math.min(H, Math.ceil((b.cz + b.hz) / TS)); z++) for (let x = Math.max(0, Math.floor((b.cx - b.hx) / TS)); x <= Math.min(W, Math.ceil((b.cx + b.hx) / TS)); x++) lo = Math.min(lo, v[z * VW + x]);
      p.gy = Number.isFinite(lo) ? lo : 0;
      for (const b of p.boxes) b.gy = p.gy; // (the boxes too: a cell two pieces share holds both pieces' boxes, not either piece)
    }
    // and everything else that stands on it where it's built: doors and windows (fy, as a storey's floor is), the lamps
    // (gy: the floor they hang over), the spots suspects take cover at or start from, the weapon case and the
    // boxes, the cabinets (fy), the coin-op viewers, each zipline's ends
    const gh = (x: number, z: number) => G.World.terrainAt(map.terrain, x, z);
    for (const d of map.doors) d.fy = gh(d.x, d.z);
    for (const w of map.windows || []) w.fy = gh(w.x, w.z);
    for (const l of map.lights) l.gy = gh(l.x, l.z);
    for (const c of map.cover.concat(map.wallSpots)) c.y = gh(c.x, c.z);
    for (const o of [map.case, map.abox, map.sbox, ...(map.cabinets || [])]) if (o) o.fy = gh(o.x, o.z);
    for (const s of cr.scopes) s.y = gh(s.x, s.z);
    for (const l of cr.lines) { l.gy = [gh(l.on[0], l.on[1]), gh(l.off[0], l.off[1])]; l.a[1] += l.gy[0]; l.b[1] += l.gy[1]; }
  },
  // how far the Sandia Crest's ground has fallen at x (m, from the west summit's: crestGround), the garden's hills left out
  crestFall(cr: any, x: number) {
    const CS = this.CTS, G2 = this.GROUND, rim0 = cr.CX0 * CS, rim1 = (cr.CX1 + 1) * CS, sx0 = cr.site[0] * CS, sx1 = (cr.site[1] + 1) * CS;
    return G2.VIEW * G.U.smooth(rim0 + 14, sx0 - 8, x) + (G2.GARDEN - G2.VIEW) * G.U.smooth(sx1 + 8, rim1 - 10, x);
  },
  // the height of the floor a spot is on (f, a storey's: fy), and of the ground there on the ground floor of a level whose
  // ground rolls
  spotY(map: LvMap, x: number, z: number, f?: number) { return (this.floorMap(map, f || 0).fy || 0) + (f ? 0 : this.groundHeight(map, x, z)); },
  // The flat roofs on the Sandia Crest, each a perch over the gorge (crest.roofs), and a ladder up to each (crest.ladders).
  //  - The Crest House's: over the whole house (the slab over its ceilings: you stand on that, js/world.ts), nothing round
  //    its edge but air, ROOF_Y up.
  //  - The viewing building's, out over the gorge: a slab over the whole of it, out past its walls to the edge of their tiles
  //    (crestSolids), a railing round it on a low kerb (PARAPET high: you can't walk off it, and you see and shoot through it), the overlook
  //    one way along the gorge and the garden the other.
  // Each roof's ladder is on its east wall (the house's, the gorge side; the viewing building's, at its back corner, from
  // the east terrace): at a stretch of wall with no window or door in it and clear ground in front, nearest the middle.
  // foot: where you stand to climb (and step off at the bottom), y0 the ground there; top: the roof's height; head: where
  // you step off on the roof; over: how high over the roof's edge you're lifted getting on and off (a parapet's).
  // (Hold F at either end: js/player.ts climbStep. Suspects don't climb them.)
  ROOF_Y: 4.3, PARAPET: { H: 1.05, T: 0.2, KERB: 0.15 }, GUARD_H: 1.05,
  crestLadder(map: LvMap) {
    const cr = map.crest, { W, t } = map, TS = this.TS, K = this.K, [HX, HZ] = cr.house, [BX0, BX1] = cr.viewing, VZ1 = cr.site[2];
    cr.roofs = []; cr.ladders = [];
    for (const [cx, cz, cw, ch, parapet] of [[HX, HZ, 9, 9, false], [BX0, cr.SZ, BX1 - BX0 + 1, VZ1 - cr.SZ + 1, true]] as [number, number, number, number, boolean][]) {
      let x0 = Infinity, x1 = -1, z0 = Infinity, z1 = -1;
      for (let z = cz * K; z < (cz + ch) * K; z++) for (let x = cx * K; x < (cx + cw) * K; x++) if (!map.out[z * W + x]) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); }
      if (x1 < 0) continue;
      const gy = this.crestFall(cr, (x0 + x1) / 2 * TS), top = gy + this.ROOF_Y; // (what it's built on: the summit's, or the viewing site's level, down the saddle)
      cr.roofs.push({ x0: x0 * TS, x1: (x1 + 1) * TS, z0: z0 * TS, z1: (z1 + 1) * TS, y: top, gy, parapet });
      const doorCell = new Set(map.doors.flatMap((d) => d.cells || [])), mid = (z0 + z1) >> 1;
      const clear = (z: number) => {
        for (let zz = z - 1; zz <= z + 1; zz++) {
          const wi = zz * W + x1;
          if (t[wi] !== 1 || doorCell.has(wi) || (map.winAt && map.winAt.has(wi))) return false;
          for (let x = x1 + 1; x <= x1 + 2; x++) if (t[zz * W + x] !== 0 || map.props.has(zz * W + x)) return false;
        }
        return true;
      };
      search: for (let d = 0; d <= (z1 - z0) / 2 - 1; d++) for (const z of d ? [mid + d, mid - d] : [mid]) {
        if (!clear(z)) continue;
        const wx = (x1 + 1) * TS, wz = (z + 0.5) * TS;
        cr.ladders.push({ x: wx, z: wz, y0: gy, top, foot: [wx + 0.55, wz], head: [wx - 0.7, wz], yaw: Math.PI / 2, over: parapet ? this.PARAPET.H + 0.1 : 0 }); // (yaw: facing the wall, west)
        break search;
      }
    }
  },
  // the ladder someone at (x, z) is on (the nearest of a level's: crest.ladders), or null
  ladderAt(map: LvMap | null | undefined, x: number, z: number) {
    const ls = map && map.crest && map.crest.ladders;
    if (!ls || !ls.length) return null;
    return ls.reduce((a: any, l: any) => (Math.hypot(l.x - x, l.z - z) < Math.hypot(a.x - x, a.z - z) ? l : a));
  },
  // The viewing building's roof as solids (after the rest of the level's: js/world.ts fromTileMap): its slab over the whole
  // of it (the ceilings stop at the walls' middle lines), the parapet round its edge; and the guard rail inside its front
  // glass (crest.guard: it stops you walking out where the glass is shot out; only its handrail stops a round, as a
  // railing's: G.Level.stack)
  // The outcrops' rough tops (an icosahedron over each one's wall, sometimes a smaller one on that) and a lump or two at their
  // feet: each one's matrix (placed, turned, stretched) and its shade (p). From the seed alone, so the meshes (buildCrest) and
  // what rays meet (crestSolids: each its own convex shape, js/world.ts hullOf) are the same rocks.
  crestCaps(map: LvMap): { m: number[]; p: number }[] {
    const cr = map.crest;
    if (cr.caps) return cr.caps;
    const D = G.LevelDesc, TS = this.TS, CS = this.CTS, W = map.W, rnd = G.U.rng((map.seed ^ 0xca95e7) >>> 0), out: { m: number[]; p: number }[] = [];
    const open = (x: number, z: number) => x >= 0 && z >= 0 && x < cr.W && z < cr.H && cr.kind[z * cr.W + x] !== 1 && cr.kind[z * cr.W + x] !== 2;
    for (let i = 0; i < cr.W * cr.H; i++) {
      if (cr.kind[i] !== 1) continue;
      const x = i % cr.W, z = (i / cr.W) | 0, X = (x + 0.5) * CS, Z = (z + 0.5) * CS, gy = this.builtY(map, Math.floor(Z / TS) * W + Math.floor(X / TS)); // (on the ground the outcrop stands on)
      // (placed, turned (Euler angles, x then y then z) and stretched: the matrix three.js composes, column by column)
      const put = (px: number, py: number, pz: number, sx: number, sy: number, sz: number) => {
        const q = D.quatEuler(rnd() * 3, rnd() * 3, rnd() * 3);
        out.push({ m: D.compose([px, py, pz], q, [sx, sy, sz]), p: 0.9 + rnd() * 0.15 });
      };
      put(X + (rnd() - 0.5) * 0.6, gy + this.WALL_H - 0.1 + rnd() * 0.3, Z + (rnd() - 0.5) * 0.6, 1.05 + rnd() * 0.25, 0.5 + rnd() * 0.7, 1.05 + rnd() * 0.25);
      if (rnd() < 0.4) put(X + (rnd() - 0.5) * 0.8, gy + this.WALL_H + 0.3 + rnd() * 0.4, Z + (rnd() - 0.5) * 0.8, 0.6, 0.5 + rnd() * 0.4, 0.6);
      const side = [[1, 0], [-1, 0], [0, 1], [0, -1]].filter(([dx, dz]) => open(x + dx, z + dz));
      if (side.length && rnd() < 0.7) { const [dx, dz] = side[Math.floor(rnd() * side.length)]; put(X + dx * 0.5, this.groundHeight(map, X + dx * 0.5, Z + dz * 0.5) + 0.15, Z + dz * 0.5, 0.6, 0.45 + rnd() * 0.3, 0.6); }
    }
    return (cr.caps = out);
  },
  crestSolids(map: LvMap) {
    const w = map.world, WH = this.WALL_H, P = this.PARAPET, gd = map.crest.guard;
    // the outcrops' tops and the lumps at their feet, as drawn: rays meet them (you never get up there, and the lumps are at the
    // walls' feet: what stops you is the walls)
    // (the icosahedron's corners as three.js has them, and the matrix applied as it applies one: G.LevelDesc.ICO, apply)
    const D = G.LevelDesc, tri = D.ICO;
    for (const c of this.crestCaps(map)) {
      const t: number[] = []; for (let i = 0; i < tri.length; i += 3) t.push(...D.apply(c.m, tri[i], tri[i + 1], tri[i + 2]));
      G.World.add(w, G.World.hullOf(t, [], { kind: 'prop', move: false, mat: G.Materials.PROPS.boulder }));
    }
    if (gd) {
      const [x0, x1, z] = gd, y = this.crestFall(map.crest, (x0 + x1) / 2), H = this.GUARD_H;
      G.World.add(w, G.World.box(x0, y, z - 0.03, x1, y + H, z + 0.03, { kind: 'rail', ray: false }));
      G.World.add(w, G.World.box(x0, y + H - 0.05, z - 0.03, x1, y + H, z + 0.03, { kind: 'rail', move: false }));
    }
    for (const R of map.crest.roofs || []) {
      if (!R.parapet) continue;
      G.World.add(w, G.World.box(R.x0, R.gy + WH, R.z0, R.x1, R.y, R.z1, { kind: 'ceil' }));
      // (a steel railing on a low concrete kerb: you can't walk through it or off the roof, but you see and shoot through it, as at the
      // terraces: only the kerb and the handrail stop a round)
      for (const [x0, z0, x1, z1] of this.parapetRuns(R)) {
        G.World.add(w, G.World.box(x0, R.y, z0, x1, R.y + P.KERB, z1, { kind: 'wall', edge: true })); // (the kerb: concrete, cast)
        G.World.add(w, G.World.box(x0, R.y, z0, x1, R.y + P.H, z1, { kind: 'rail', ray: false }));
        G.World.add(w, G.World.box(x0, R.y + P.H - 0.05, z0, x1, R.y + P.H, z1, { kind: 'rail', move: false }));
      }
    }
  },
  // a roof's parapet, as boxes [x0, z0, x1, z1] in plan: along each edge, inside it
  parapetRuns(R: any) {
    const T = this.PARAPET.T;
    return [[R.x0, R.z0, R.x1, R.z0 + T], [R.x0, R.z1 - T, R.x1, R.z1], [R.x0, R.z0 + T, R.x0 + T, R.z1 - T], [R.x1 - T, R.z0 + T, R.x1, R.z1 - T]];
  },
  // Where a climber's hand or foot is on the ladder (limb: hL, hR, fL, fR), their feet at y, as [x, y, z]: each holds its rung
  // while they rise past it, then goes up two rungs (RUNG apart) over the last third of that, the left hand with the right foot
  // and the right with the left (a climber's own and everyone else's view of them: js/player.ts, js/rig.ts). Over the top, the
  // hands are on the rails and the feet come up onto the roof's edge.
  RUNG: 0.3,
  ladderGrip(l: { x: number; z: number; top: number }, y: number, limb: string) {
    const R = this.RUNG, hand = limb[0] === 'h', left = limb[1] === 'L', u0 = y / (2 * R) + (hand === left ? 0 : 0.5), u = u0 - Math.floor(u0);
    let gy = y + (hand ? 1.8 : 0.3) + 2 * R * (G.U.smooth(0.65, 1, u) - u);
    const rail = hand && gy > l.top;
    gy = hand ? Math.min(gy, l.top + 0.9) : Math.max(Math.min(gy, l.top), y); // (a foot's never under where they stand: over the top, on the roof's edge)
    return [l.x + (hand ? 0.13 : 0.16), gy + (hand ? 0 : 0.02), l.z + (left ? 1 : -1) * (rail ? 0.24 : hand ? 0.17 : 0.13)]; // (the climber faces the wall, west: their left is +z)
  },
  // the ground's height at (x, z) on a level with it (0 elsewhere, and off it)
  groundHeight(map: LvMap, x: number, z: number) { return map.terrain ? G.World.terrainAt(map.terrain, x, z) : 0; },
  // what's built on fine cell i stands on (on rolling ground: the lowest of its corners, in 5 cm steps, as its solids are:
  // js/world.ts fromTileMap), 0 elsewhere
  builtY(map: LvMap, i: number) {
    const tr = map.terrain;
    if (!tr) return 0;
    const k = ((i / map.W) | 0) * tr.VW + (i % map.W);
    return Math.round(Math.min(tr.v[k], tr.v[k + 1], tr.v[k + tr.VW], tr.v[k + tr.VW + 1]) / 0.05) * 0.05;
  },
  layCrest(r: LvRng, level: number): LvLay {
    const U = G.U, CX0 = 24, CX1 = 265, W = CX1 + 25, H = 46, SZ = 6; // the gorge from x CX0 to CX1 (482 m across), south of the saddle's wall (row SZ)
    const OZ0 = 12, OZ1 = 17, OX1 = CX0 + 3; // the overlook: its rows, its east side
    const HX = 13, HZ = 23, GX = CX1 + 9, GZ = 13; // the Crest House's and the greenhouse's north-west corners (walls and all)
    // the viewing site halfway along the saddle, out over the gorge from its rim: x SX0 to SX1 (the railing down each side),
    // rows SZ + 1 to VZ1 (the railing along its front); the viewing building in the middle of it, x BX0 to BX1 (walls and
    // all), from the rim to its glass front over the drop (row VZ1, in line with the railing); a terrace either side of it
    const SX0 = 139, SX1 = 156, VZ1 = 12, BX0 = 143, BX1 = 152;
    // the ziplines, a tile each end to step on and off them ([x, z], coarse), and where on the rim each end's cable is (x, m: just
    // out over the drop from the wall), how far it sags: from the ridge north of the overlook down to the viewing site's west
    // terrace, and on from its east terrace down to the garden's west edge. (Both downhill: the way back up is the saddle.)
    const CS = this.CTS, ZL = [{ on: [CX0 - 2, 8], off: [SX0 + 1, 9], ax: (CX0 - 0.5) * CS + 0.9, bx: (SX0 + 0.5) * CS - 0.9, sag: 4 },
      { on: [SX1 - 1, 9], off: [CX1 + 2, 10], ax: (SX1 + 0.5) * CS + 0.9, bx: (CX1 + 1.5) * CS - 0.9, sag: 4 }];
    const t = new Uint8Array(W * H), out = new Uint8Array(W * H).fill(1), kind = new Uint8Array(W * H), rooms: LvRoom[] = [], doors: LvDoorSpec[] = [], fences: LvFence[] = [], glass: any[] = [];
    const at = (x: number, z: number) => z * W + x;
    const fill = (x0: number, z0: number, w: number, h: number, v: number) => { for (let z = z0; z < z0 + h; z++) for (let x = x0; x < x0 + w; x++) t[at(x, z)] = v; };
    const fence = (x: number, z: number, axis: string, name?: string) => { t[at(x, z)] = 4; fences.push(name ? [x, z, axis, name] : [x, z, axis]); };
    const room = (x: number, z: number, w: number, h: number, type: RoomType, o?: Record<string, any>) => { const q = this._room(x, z, w, h, Object.assign({ type, out: true, flush: true }, o)); rooms.push(q); return q; };
    // the gorge, the overlook out over it
    fill(CX0, SZ + 1, CX1 - CX0 + 1, H - SZ - 1, 5);
    fill(CX0, OZ0, OX1 - CX0 + 1, OZ1 - OZ0 + 1, 0);
    fill(SX0, SZ + 1, SX1 - SX0 + 1, VZ1 - SZ - 1, 0);
    // the low stone wall: round the map (not across the gorge), along the gorge's rims and the saddle's, round the overlook
    // and round the viewing site's terraces (the saddle open onto them)
    for (let x = 0; x < W; x++) for (const z of [0, H - 1]) if (t[at(x, z)] !== 5) fence(x, z, 'x');
    for (let z = 1; z < H - 1; z++) for (const x of [0, W - 1]) fence(x, z, 'z');
    for (let x = CX0; x <= CX1; x++) if (x < SX0 || x > SX1) fence(x, SZ, 'x');
    // (the viewing site's: a railing on it, chest high, js/furniture.ts siterail; along the front it runs into the viewing
    // building's front wall, in line with it: refine)
    for (let z = SZ; z <= VZ1; z++) for (const x of [SX0, SX1]) fence(x, z, 'z', z > SZ ? 'siterail' : undefined);
    for (let x = SX0 + 1; x < SX1; x++) if (x < BX0 || x > BX1) fence(x, VZ1, 'x', 'siterail');
    for (let z = SZ; z < H - 1; z++) { if (z < OZ0 || z > OZ1) fence(CX0 - 1, z, 'z'); fence(CX1 + 1, z, 'z'); }
    for (let x = CX0; x <= OX1 + 1; x++) { fence(x, OZ0 - 1, 'x'); fence(x, OZ1 + 1, 'x'); }
    for (let z = OZ0; z <= OZ1; z++) fence(OX1 + 1, z, 'z');
    // the Crest House, 9 x 9 tiles: the gift shop across the front (south), its double door under a lantern; the office
    // and the storeroom behind it, the storeroom's door out the back
    fill(HX, HZ, 9, 9, 1);
    for (let z = HZ; z < HZ + 9; z++) for (let x = HX; x < HX + 9; x++) { out[at(x, z)] = 0; kind[at(x, z)] = 2; }
    fill(HX + 1, HZ + 4, 7, 4, 0); fill(HX + 1, HZ + 1, 3, 2, 0); fill(HX + 5, HZ + 1, 3, 2, 0);
    room(HX + 1, HZ + 4, 7, 4, 'giftshop', { out: false }); room(HX + 1, HZ + 1, 3, 2, 'office', { out: false }); room(HX + 5, HZ + 1, 3, 2, 'storeroom', { out: false });
    doors.push([HX + 3, HZ + 8, 'z', false, false], [HX + 4, HZ + 8, 'z', false, true]);
    doors.push([HX + 2, HZ + 3, 'z', false, false], [HX + 6, HZ + 3, 'z', false, false], [HX + 6, HZ, 'z', false, false]);
    // the viewing building, out over the gorge from its rim: concrete walls, glass nearly floor to ceiling across the front
    // (the gorge below it), in line with the terraces' railings, and down both sides (the overlook along it one way, the
    // garden the other: lay.glass); a double door in the back from the saddle, a door onto each terrace; a flat roof over it
    // with a parapet round it, a ladder up to it (crestLadder)
    fill(BX0, SZ, BX1 - BX0 + 1, VZ1 - SZ + 1, 1); fill(BX0 + 1, SZ + 1, BX1 - BX0 - 1, VZ1 - SZ - 1, 0);
    for (let z = SZ; z <= VZ1; z++) for (let x = BX0; x <= BX1; x++) { out[at(x, z)] = 0; kind[at(x, z)] = 2; }
    const VM = (BX0 + BX1) >> 1, VD = SZ + 1, view = { sill: 0.15, top: 3.7 };
    doors.push([VM, SZ, 'z', false, false], [VM + 1, SZ, 'z', false, true], [BX0, VD, 'x', false, false], [BX1, VD, 'x', false, false]);
    glass.push(Object.assign({ x0: BX0 + 1, z0: VZ1, x1: BX1 - 1, z1: VZ1 }, view), Object.assign({ x0: BX0, z0: VD + 1, x1: BX0, z1: VZ1 - 1, v: 1 }, view), Object.assign({ x0: BX1, z0: VD + 1, x1: BX1, z1: VZ1 - 1, v: 1 }, view));
    // the greenhouse, 7 x 9 tiles: glass all round from a low sill (lay.glass), a double door on the west (toward the
    // overlook), one on the east; no roof over it but glass (open to the sky: buildCrest's)
    fill(GX, GZ, 7, 9, 1); fill(GX + 1, GZ + 1, 5, 7, 0);
    for (let z = GZ; z < GZ + 9; z++) for (let x = GX; x < GX + 7; x++) if (t[at(x, z)] === 1) kind[at(x, z)] = 3;
    doors.push([GX, GZ + 3, 'x', false, false], [GX, GZ + 4, 'x', false, true], [GX + 6, GZ + 4, 'x', false, false]);
    const pane = { sill: 0.3, top: 3.75 };
    glass.push(Object.assign({ x0: GX, z0: GZ + 1, x1: GX, z1: GZ + 7, v: 1 }, pane), Object.assign({ x0: GX + 6, z0: GZ + 1, x1: GX + 6, z1: GZ + 7, v: 1 }, pane),
      Object.assign({ x0: GX + 1, z0: GZ, x1: GX + 5, z1: GZ }, pane), Object.assign({ x0: GX + 1, z0: GZ + 8, x1: GX + 5, z1: GZ + 8 }, pane));
    // the coyote fence between the garden and the antenna farm, a gate in the middle
    for (let x = CX1 + 2; x < W - 1; x++) if (x < GX + 2 || x > GX + 4) fence(x, 32, 'x', 'coyote');
    // the outcrops. Where none go: the lot and the pad's shelter, in front of every door, the way onto the overlook, the
    // saddle's ends and the viewing site, the garden.
    const keep = new Uint8Array(W * H);
    const clear = (x0: number, z0: number, x1: number, z1: number) => { for (let z = Math.max(0, z0); z <= Math.min(H - 1, z1); z++) for (let x = Math.max(0, x0); x <= Math.min(W - 1, x1); x++) keep[at(x, z)] = 1; };
    clear(0, 37, CX0, H - 1); clear(CX0 - 3, OZ0 - 1, CX0, OZ1 + 1); clear(CX0 - 2, 0, CX0 + 1, SZ); clear(CX1 - 1, 0, CX1 + 3, SZ); clear(CX1 + 1, 0, W - 1, 33); clear(SX0 - 2, 0, SX1 + 2, VZ1);
    for (const [x, z, axis] of doors) clear(x - (axis === 'x' ? 2 : 1), z - (axis === 'z' ? 2 : 1), x + (axis === 'x' ? 2 : 1), z + (axis === 'z' ? 2 : 1));
    for (const l of ZL) for (const [x, z] of [l.on, l.off]) clear(x - 1, z - 1, x + 1, z + 1); // (the zipline's ends)
    // (ground that's reached: from the lot, through the doors as if they were open)
    const doorAt = new Set(doors.map(([x, z]) => at(x, z))), walk = (i: number) => t[i] === 0 || doorAt.has(i);
    const reached = () => {
      const seen = new Uint8Array(W * H), q = [at(5, 41)]; seen[q[0]] = 1; let n = 1;
      while (q.length) { const i = q.pop()!, x = i % W; for (const j of [x > 0 ? i - 1 : -1, x < W - 1 ? i + 1 : -1, i - W, i + W]) if (j >= 0 && j < W * H && !seen[j] && walk(j)) { seen[j] = 1; n++; q.push(j); } }
      return n;
    };
    let ground = 0; for (let i = 0; i < W * H; i++) if (walk(i)) ground++;
    const open = (x: number, z: number) => x < 0 || z < 0 || x >= W || z >= H || t[at(x, z)] !== 1;
    // a blob of rock round (cx, cz), rx by rz tiles out from it, a ragged edge; then no rock a tile thick anywhere in it
    const blob = (cx: number, cz: number, rx: number, rz: number) => {
      const put = [];
      for (let z = cz - rz; z <= cz + rz; z++) for (let x = cx - rx; x <= cx + rx; x++) {
        if (x < 1 || z < 1 || x >= W - 1 || z >= H - 1 || keep[at(x, z)] || t[at(x, z)] !== 0) continue;
        const e = ((x - cx) / (rx + 0.5)) ** 2 + ((z - cz) / (rz + 0.5)) ** 2;
        if (e <= 0.8 + r() * 0.4) put.push(at(x, z));
      }
      for (const i of put) { t[i] = 1; kind[i] = 1; }
      for (let pass = 0, thin = true; thin && pass < 6; pass++) {
        thin = false;
        for (const i of put) {
          if (t[i] !== 1) continue;
          const x = i % W, z = (i / W) | 0;
          if ((open(x - 1, z) && open(x + 1, z)) || (open(x, z - 1) && open(x, z + 1))) { t[i] = 0; kind[i] = 0; thin = true; }
        }
      }
      const left = put.filter((i) => t[i] === 1).length;
      if (left && reached() !== ground - left) { for (const i of put) { t[i] = 0; kind[i] = 0; } return 0; } // (it cut something off)
      ground -= left;
      return left;
    };
    // the band between the lot and the Crest House, a way through it somewhere along it; the outcrops along the trail
    // and on the ridge; a couple on the saddle and round the antenna farm
    const gap = U.ri(r, 3, 9);
    for (let x = 2; x <= 20; x += 3) if (Math.abs(x - gap) > 2) blob(x, 35, 2, 1);
    blob(8, 17, 2, 2); blob(18, 19, 3, 1); blob(3, 6, 2, 2); blob(14, 4, 2, 1);
    for (let n = 0, tries = 0; n < 5 + U.ri(r, 0, 3) && tries < 40; tries++) if (blob(U.ri(r, 3, 20), U.ri(r, 3, 20), U.ri(r, 1, 2), U.ri(r, 1, 2))) n++;
    for (let n = 0, tries = 0; n < 18 && tries < 100; tries++) if (blob(U.ri(r, CX0 + 3, CX1 - 3), U.ri(r, 2, 4), 1, 1)) n++;
    blob(U.ri(r, CX1 + 19, CX1 + 22), U.ri(r, 36, 41), 2, 2); blob(U.ri(r, CX1 + 4, CX1 + 7), U.ri(r, 40, 43), 1, 1);
    // the rooms: the lot (where you come in), the trail up to the Crest House and round it (out the front: no suspects
    // there), the approach to the overlook, the overlook, the ridge, the saddle either side of the viewing site and along
    // the back of it, its terraces and the viewing room; the garden round the greenhouse in four, the greenhouse, the antenna
    // farm
    const lot = room(1, 37, CX0 - 2, 8, 'lz'), lz = this._pad(lot, W, 3, 39, this.LZ_KIT.crest);
    lot.cover!.push(['bmw340', 40, 84, 1, {}]); // (someone's up here for the sunset: a silver 340i nosed in toward the rim at the lot's east end)
    room(1, 32, CX0 - 2, 5, 'trail', { front: true }); room(1, 21, HX - 1, 11, 'trail', { front: true }); room(HX, 21, CX0 - 1 - HX, 2, 'trail');
    room(1, 11, CX0 - 2, 10, 'trail'); room(1, 1, CX0 - 2, 10, 'ridge');
    room(CX0 - 1, OZ0, OX1 - CX0 + 2, OZ1 - OZ0 + 1, 'overlook', { front: true }); // (yours: nobody starts on it)
    room(CX0 - 1, 1, SX0 - CX0 + 1, SZ - 1, 'saddle'); room(SX0, 1, SX1 - SX0 + 1, SZ - 1, 'saddle'); room(SX1 + 1, 1, CX1 - SX1 + 1, SZ - 1, 'saddle');
    room(SX0 + 1, SZ, BX0 - SX0 - 1, VZ1 - SZ, 'terrace'); room(BX1 + 1, SZ, SX1 - BX1 - 1, VZ1 - SZ, 'terrace');
    room(BX0 + 1, SZ + 1, BX1 - BX0 - 1, VZ1 - SZ - 1, 'viewing', { out: false });
    room(CX1 + 2, 1, W - CX1 - 3, 3, 'ridge');
    room(CX1 + 2, 4, GX - CX1 - 2, 28, 'garden'); room(GX + 7, 4, W - GX - 8, 28, 'garden'); room(GX, 4, 7, GZ - 4, 'garden'); room(GX, GZ + 9, 7, 32 - GZ - 9, 'garden');
    room(GX + 1, GZ + 1, 5, 7, 'greenhouse');
    room(CX1 + 2, 33, W - CX1 - 3, H - 34, 'antennas');
    // each zipline in metres: its cable from the top of the pole at the start, just out past the wall, to the bottom of the pole
    // at the end (a, b: [x, y, z], over the ground each end stands on: gy, which crestGround adds), how far it sags in the
    // middle, and the ground you step on and off at
    const C = ([x, z]: number[]) => [(x + 0.5) * CS, (z + 0.5) * CS];
    const lines = ZL.map(({ on, off, ax, bx, sag }) => ({ a: [ax, 6.6, C(on)[1]], b: [bx, 3.9, C(off)[1]], sag, on: C(on), off: C(off), keep: [on, off], gy: [0, 0] }));
    // the guard rail inside the viewing building's front glass (x0, x1, z in metres: just inside the wall's middle line), a
    // hand's width in from it: shot out, the glass leaves a sill you'd step over into the gorge (crestSolids)
    const guard = [(BX0 + 1) * CS, BX1 * CS, VZ1 * CS + this.TS - 0.14];
    const crest = { W, H, kind, CX0, CX1, SZ, OZ0, OZ1, OX1, site: [SX0, SX1, VZ1], viewing: [BX0, BX1], house: [HX, HZ], gh: [GX, GZ], masts: [], scopes: [], lines, guard };
    return { W, H, t, rooms, doors, out, fences, glass, spawn: lot, lz, crest, chasm: this.CHASM };
  },
  // Each returns { W, H, t, rooms, doors?, ringDoors?, out?, fences?, spawn? } on the coarse grid. t starts as all wall
  // (1); rooms are carved to floor (0).
  _room(x: number, z: number, w: number, h: number, o?: Record<string, any>) { return Object.assign({ x, z, w, h, cx: x + (w >> 1), cz: z + (h >> 1) }, o || {}) as LvRoom; },
  // A landing pad on open ground, the building to the north, and what's parked or stacked there that shelters it, what you'd
  // find in that kind of place (LZ_KIT): a row of the long thing along the pad's north side with room to walk between, the
  // short thing turned at each end of it. (east: the threat's east, not north: across that end of the pad instead.)
  // On rm (the pad's room): js/furniture.ts plan lays rm.cover. Returns the layout's lz.
  LZ_KIT: {
    store: { long: 'boxtruck', short: 'dumpster', style: { c: 0xdcd8cc, stripe: 0xb02a2a } },
    yard: { long: 'container', short: 'dumpster', style: { c: 0x2f5a7a } },
    Bunker: { long: 'hesco', short: 'hesco', style: {} },
    'Research Lab': { long: 'boxtruck', short: 'dumpster', style: { c: 0xe4e6e6, stripe: 0x3a7aa8 } },
    'Cold Storage': { long: 'container', short: 'dumpster', style: { c: 0xdfe4e6, chill: 1 } },
    foundry: { long: 'container', short: 'scrap', style: { c: 0x7a3f28 } },
    festival: { long: 'boxtruck', short: 'portaloo', style: { c: 0x2a2a32, stripe: 0xd94fa0 } },
    suburbs: { long: 'boxtruck', short: 'hedge', style: { c: 0xe0d8c8, stripe: 0x2f7a4a } },
    crest: { long: 'boxtruck', short: 'boulder', style: { c: 0xe6e2d6, stripe: 0x2f6a44 } }, // (the Forest Service's)
  },
  _pad(rm: LvRoom, W: number, x: number, z: number, kit: Record<string, any>, east?: boolean) {
    const c: any[][] = rm.cover = [], cs = this.CTS, GAP = 1.6, put = (name: string, px: number, pz: number, q: number) => c.push([name, px, pz, q, kit.style]);
    if (east) { const px = (x + this.LZ_W) * cs + 1; put(kit.long, px, (z + 2.5) * cs, 1); put(kit.short, px, (z + 0.6) * cs, 1); return { x, z }; }
    const x0 = Math.max(3, (x - 1) * cs), x1 = Math.min(W * cs - 3, (x + this.LZ_W + 1) * cs), L = G.Furniture.R[kit.long].w, n = Math.max(1, Math.floor((x1 - x0 + GAP) / (L + GAP))), run = n * L + (n - 1) * GAP, a0 = (x0 + x1 - run) / 2, pz = (z - 0.5) * cs - 0.5;
    for (let i = 0; i < n; i++) put(kit.long, a0 + L / 2 + i * (L + GAP), pz, 0);
    // (a row that doesn't fill its side: the short thing either end of it, a step's gap off; else turned at the ends)
    const S = G.Furniture.R[kit.short].w, side = a0 - x0;
    for (const [px, sn] of [[a0, -1], [a0 + run, 1]]) {
      if (side >= S + 1) put(kit.short, px + sn * (1 + S / 2), pz, 0);
      if (px + sn * 2.4 > 2 && px + sn * 2.4 < W * cs - 2) put(kit.short, px + sn * (side >= S + 1 ? 2 + S : 1.2), z * cs + 1.6, 1);
    }
    return { x, z };
  },

  // A corner convenience store, small and crowded, the first deployment of a run (by the look of real ones: tall shelving
  // packed close, aisles a little over a metre wide, a wall of cooler doors, the till behind its glass). 20 x 26 m with
  // its lot. Coarse tiles (2 m), north (low z) to south:
  //   the back: the walk-in freezer (west) and the stockroom (east), a door between them; the freezer's front wall is
  //     the coolers, glass doors onto the shop (glass: windows in it, js/level.ts placeWindows);
  //   the shop floor (west, about 10.5 x 9.5 m), a door up into the stockroom; the cashier's booth (east), behind a
  //     wall of wired, bulletproof glass (it stops rounds, not looks) with one door through it, more of it onto the street;
  //   the front wall, glass either side of its double door, and the lot outside it (fenced), delivery trucks parked across
  //     it and the helicopter's pad behind them, where you come in.
  // The shelving is laid on the fine grid (js/furniture.ts plan, mart), not tile by tile: that's what makes the aisles narrow.
  // Its weapon case, attachments box and first aid cabinet are always in the stockroom (G.THEMES starter).
  layMart(r: LvRng, level: number): LvLay {
    const W = 10, B = 9, D = 10, H = B + D, U = G.U;
    const t = new Uint8Array(W * H).fill(1), out = new Uint8Array(W * H), fences: LvFence[] = [], doors: LvDoorSpec[] = [];
    const fill = (x0: number, z0: number, w: number, h: number) => { for (let z = z0; z < z0 + h; z++) for (let x = x0; x < x0 + w; x++) t[z * W + x] = 0; };
    fill(1, 1, 3, 2); fill(5, 1, 4, 2); // the freezer, the stockroom
    fill(1, 4, 5, 4); fill(7, 4, 2, 4); // the shop floor, the cashier's booth
    const freezer = this._room(1, 1, 3, 2, { type: 'freezer' }), stock = this._room(5, 1, 4, 2, { type: 'stockroom' });
    const shop = this._room(1, 4, 5, 4, { type: 'mart' }), till = this._room(7, 4, 2, 4, { type: 'cashier' });
    doors.push([4, 1 + U.ri(r, 0, 1), 'x', false, false]); // freezer <-> stockroom
    doors.push([5, 3, 'z', false, false]); // shop floor -> stockroom
    const tillDoor = 4 + U.ri(r, 0, 1);
    doors.push([6, tillDoor, 'x', false, false]); // the one door through the cashier's glass
    // the front: the double door, the lot outside
    const ex = U.ri(r, 2, 3);
    doors.push([ex, B - 1, 'z', false, false], [ex + 1, B - 1, 'z', false, true]);
    for (let z = B; z < H; z++) for (let x = 0; x < W; x++) out[z * W + x] = 1;
    for (let z = B; z < H - 1; z++) for (let x = 1; x < W - 1; x++) t[z * W + x] = 0;
    for (let x = 0; x < W; x++) { t[(H - 1) * W + x] = 4; fences.push([x, H - 1, 'x']); }
    for (let z = B; z < H - 1; z++) for (const x of [0, W - 1]) { t[z * W + x] = 4; fences.push([x, z, 'z']); }
    // the lot: the two rows in front of the shop, the delivery trucks parked across it, the pad behind them
    const lot = this._room(1, B, W - 2, 2, { type: 'lot', out: true, front: true }), pad = this._room(1, B + 3, W - 2, 6, { type: 'lz', out: true }), lz = this._pad(pad, W, 2, B + 3, this.LZ_KIT.store);
    // glass between rooms: the coolers (the freezer's front wall), the cashier's wall (all of it but its door) and the
    // booth's front; the shop's front windows either side of the door
    const glass: any[] = [{ x0: 1, z0: 3, x1: 3, z1: 3, cooler: true, sill: 0.12, top: 2.05 }];
    for (const [z0, z1] of [[4, tillDoor - 1], [tillDoor + 1, B - 2]]) if (z1 >= z0) glass.push({ x0: 6, z0, x1: 6, z1, armor: true, v: 1, sill: 0.95, top: 2.7 }); // (either side of its door; v: down a wall that runs north-south)
    glass.push({ x0: 7, z0: B - 1, x1: 8, z1: B - 1, armor: true, sill: 0.95, top: 2.7 }, { x0: 1, z0: B - 1, x1: 5, z1: B - 1, sill: 0.5, top: 2.7 });
    return { W, H, t, rooms: [pad, lot, shop, till, stock, freezer], doors, out, fences, glass, spawn: pad, lz };
  },

  // A steel foundry, two storeys, 68 x 56 m. Coarse tiles (2 m), north (low z) to south:
  //   the melt shop (west) and the processing hall (east), each the building's full height (8.3 m): on the ground,
  //     the melt shop's arc furnaces, the ladles of molten steel in front of them and the ingot moulds; the hall's two
  //     processing lines (roller conveyors through rolling mills, hot saws, a press, a quench tank). Upstairs in each,
  //     catwalks of steel grating round the walls and across it (over the ladles, between the lines), seen and shot
  //     through from above and below, railed where they're over the drop; a stair up to them in each hall.
  //   between them, a block of three: the switchgear room and the locker room on the ground, a door from each into both
  //     halls; over them, the control room and an observation office, glass down both sides looking into the halls and
  //     doors out onto both halls' catwalks.
  //   the office wing (south-west): a stairwell at its west end, a corridor from it to the loading bay; the kitchenette
  //     and the toilets on one side, reception (its front door onto the car park) and offices on the other. Upstairs,
  //     two observation offices looking north into the melt shop through glass (doors out onto its catwalk), the
  //     manager's office and the meeting room. A door from the stairwell into the melt shop.
  //   the loading bay (south-east), full height too: raw stock on pallets (billets, ingots, coils), forklifts, pallet
  //     racking; a roller door up into the processing hall, two out onto the car park and a door between them.
  //   the car park along the front, fenced; past it, behind a row of containers, the helicopter's pad, where you come in.
  // Floors: 0 the ground, 1 upstairs (tile 5 the drop, open to the floor below; grate: the catwalks).
  layFoundry(r: LvRng, level: number): LvBuilding {
    const W = 34, H = 35, LZ = 22; // the car park from row LZ; past it, behind the containers along row 27, the pad
    const mk = (): LvFl & { glass: any[] } => ({ t: new Uint8Array(W * H).fill(1), out: new Uint8Array(W * H), rooms: [], doors: [], glass: [] });
    const F0 = mk(), F1 = mk(), grate = new Uint8Array(W * H), fences: LvFence[] = [], stairs: LvStair[] = [];
    const fill = (F: LvFl, x0: number, z0: number, w: number, h: number, v = 0) => { for (let z = z0; z < z0 + h; z++) for (let x = x0; x < x0 + w; x++) F.t[z * W + x] = v; };
    const room = (F: LvFl, x: number, z: number, w: number, h: number, type: RoomType, o?: Record<string, any>) => { const q = this._room(x, z, w, h, Object.assign({ type }, o)); F.rooms.push(q); return q; };
    const door = (F: LvFl, x: number, z: number, axis: string, mirror?: boolean) => F.doors.push([x, z, axis, false, !!mirror]);
    // ---- the car park: open to the sky on both floors, fenced
    for (let z = LZ; z < H; z++) for (let x = 0; x < W; x++) { F0.out[z * W + x] = 1; F1.out[z * W + x] = 1; F1.t[z * W + x] = 5; }
    fill(F0, 1, LZ, W - 2, H - LZ - 1);
    for (let x = 0; x < W; x++) { F0.t[(H - 1) * W + x] = 4; fences.push([x, H - 1, 'x']); }
    for (let z = LZ; z < H - 1; z++) for (const x of [0, W - 1]) { F0.t[z * W + x] = 4; fences.push([x, z, 'z']); }
    room(F0, 1, LZ, 16, 5, 'carpark', { out: true, front: true }); room(F0, 17, LZ, W - 18, 5, 'carpark', { out: true, front: true });
    const pad = room(F0, 1, 28, W - 2, 6, 'lz', { out: true }), lz = this._pad(pad, W, 13, 28, this.LZ_KIT.foundry);
    // ---- the ground floor
    fill(F0, 1, 1, 14, 11); fill(F0, 3, 10, 3, 1, 6); room(F0, 1, 1, 14, 11, 'melt', { tall: true }); // the melt shop, its stair up the south wall
    stairs.push({ f: 0, x0: 3, z0: 10, x1: 5, z1: 10, axis: 'x', up: -1 });
    fill(F0, 16, 1, 3, 5); room(F0, 16, 1, 3, 5, 'mcc'); fill(F0, 16, 7, 3, 5); room(F0, 16, 7, 3, 5, 'locker');
    fill(F0, 20, 1, 13, 11); fill(F0, 32, 8, 1, 3, 6); room(F0, 20, 1, 13, 11, 'mill', { tall: true }); // the processing hall, its stair up the east wall
    stairs.push({ f: 0, x0: 32, z0: 8, x1: 32, z1: 10, axis: 'z', up: -1 });
    fill(F0, 17, 13, 16, 8); room(F0, 17, 13, 16, 8, 'loading', { tall: true });
    fill(F0, 1, 13, 2, 8); fill(F0, 1, 14, 1, 3, 6); room(F0, 1, 13, 2, 8, 'landing', { stairs: true }); // the office stairwell
    stairs.push({ f: 0, x0: 1, z0: 14, x1: 1, z1: 16, axis: 'z', up: -1 });
    fill(F0, 3, 16, 13, 1); room(F0, 3, 16, 13, 1, 'corridor');
    fill(F0, 4, 13, 4, 2); room(F0, 4, 13, 4, 2, 'kitchenette');
    fill(F0, 9, 13, 3, 2); room(F0, 9, 13, 3, 2, 'restroom'); fill(F0, 13, 13, 3, 2); room(F0, 13, 13, 3, 2, 'restroom');
    fill(F0, 4, 18, 5, 3); room(F0, 4, 18, 5, 3, 'lobby');
    fill(F0, 10, 18, 3, 3); room(F0, 10, 18, 3, 3, 'office'); fill(F0, 14, 18, 2, 3); room(F0, 14, 18, 2, 3, 'office');
    door(F0, 2, 12, 'z'); // the stairwell into the melt shop
    door(F0, 5, 15, 'z'); door(F0, 9, 15, 'z'); door(F0, 13, 15, 'z'); door(F0, 6, 17, 'z'); door(F0, 11, 17, 'z'); door(F0, 14, 17, 'z');
    door(F0, 5, 21, 'z'); door(F0, 6, 21, 'z', true); // reception's front doors
    door(F0, 16, 16, 'x'); // the corridor into the loading bay
    door(F0, 15, 3, 'x'); door(F0, 19, 3, 'x'); door(F0, 15, 9, 'x'); door(F0, 19, 9, 'x'); door(F0, 17, 6, 'z'); // the block between the halls
    door(F0, 24, 21, 'z'); // the loading bay's own door out
    const rollers = [[24, 12, 3], [19, 21, 3], [27, 21, 3]]; // (rolled up: wide openings) the bay into the hall; the bay out onto the car park
    for (const [x0, z, w] of rollers) for (let x = x0; x < x0 + w; x++) F0.t[z * W + x] = 0;
    // ---- upstairs: the halls' and the bay's drops, the catwalks over them
    fill(F1, 1, 1, 14, 11, 5); fill(F1, 20, 1, 13, 11, 5); fill(F1, 17, 13, 16, 8, 5);
    const walk = (x: number, z: number, w: number, h: number) => { fill(F1, x, z, w, h); for (let zz = z; zz < z + h; zz++) for (let xx = x; xx < x + w; xx++) grate[zz * W + xx] = 1; return room(F1, x, z, w, h, 'catwalk'); };
    walk(1, 11, 14, 1); walk(1, 1, 14, 1); walk(1, 2, 1, 9); walk(14, 2, 1, 9); walk(7, 2, 2, 5); walk(2, 7, 12, 1); walk(2, 10, 1, 1); // the melt shop's: round it, a spine between the furnaces, a bridge over the ladles, the stair's head
    walk(20, 1, 13, 1); walk(20, 2, 1, 10); walk(32, 2, 1, 6); walk(21, 6, 11, 1); // the processing hall's: round it, and across between the lines
    fill(F1, 16, 1, 3, 5); room(F1, 16, 1, 3, 5, 'control'); fill(F1, 16, 7, 3, 5); room(F1, 16, 7, 3, 5, 'observe');
    door(F1, 15, 2, 'x'); door(F1, 19, 3, 'x'); door(F1, 17, 6, 'z'); door(F1, 15, 10, 'x'); door(F1, 19, 9, 'x');
    fill(F1, 1, 13, 2, 8); fill(F1, 1, 14, 1, 3, 5); room(F1, 1, 13, 2, 8, 'landing', { stairs: true });
    fill(F1, 3, 16, 13, 1); room(F1, 3, 16, 13, 1, 'corridor');
    fill(F1, 4, 13, 6, 2); room(F1, 4, 13, 6, 2, 'observe'); fill(F1, 11, 13, 5, 2); room(F1, 11, 13, 5, 2, 'observe');
    fill(F1, 4, 18, 6, 3); room(F1, 4, 18, 6, 3, 'boss'); fill(F1, 11, 18, 5, 3); room(F1, 11, 18, 5, 3, 'meeting');
    door(F1, 2, 12, 'z'); door(F1, 8, 12, 'z'); door(F1, 12, 12, 'z'); // out onto the melt shop's catwalk
    door(F1, 6, 15, 'z'); door(F1, 13, 15, 'z'); door(F1, 6, 17, 'z'); door(F1, 13, 17, 'z');
    // glass looking into the halls: the control block's both sides, the observation offices' north wall
    const look = { sill: 0.9, top: 2.75 };
    F1.glass.push(Object.assign({ x0: 15, z0: 1, x1: 15, z1: 11, v: 1 }, look), Object.assign({ x0: 19, z0: 1, x1: 19, z1: 11, v: 1 }, look), Object.assign({ x0: 4, z0: 12, x1: 14, z1: 12 }, look));
    const floor0 = { W, H, t: F0.t, out: F0.out, rooms: F0.rooms, doors: F0.doors, fences, spawn: pad, rollers, glass: F0.glass };
    const floor1 = { W, H, t: F1.t, out: F1.out, rooms: F1.rooms, doors: F1.doors, fences: [], spawn: F1.rooms[0], grate, glass: F1.glass, entries: [[2, 10], [32, 7], [1, 13]] };
    return { floors: [floor0, floor1], stairs, rail: 'steel', lz };
  },

  // Rooms joined by corridors (apartments, bunkers, labs...).
  layRooms(r: LvRng, level: number): LvLay {
    const U = G.U;
    // compact: ~38 m across on level 1, never more than 60 m
    const W = Math.min(18 + level, 30), H = W;
    const t = new Uint8Array(W * H).fill(1);
    const rooms: LvRoom[] = [];
    const want = 5 + Math.min(level, 6);
    for (let a = 0; a < 600 && rooms.length < want; a++) {
      const w = U.ri(r, 3, 6), h = U.ri(r, 3, 6); // 6-12 m rooms
      const x = U.ri(r, 1, W - w - 2), z = U.ri(r, 1, H - h - 2);
      // rooms may share a single wall, so neighbours connect straight through a doorway
      if (rooms.some((o) => x < o.x + o.w + 1 && x + w + 1 > o.x && z < o.z + o.h + 1 && z + h + 1 > o.z)) continue;
      rooms.push(this._room(x, z, w, h));
    }
    const set = (x: number, z: number, v: number) => { if (x > 0 && z > 0 && x < W - 1 && z < H - 1) t[z * W + x] = v; };
    rooms.forEach((rm) => { for (let z = rm.z; z < rm.z + rm.h; z++) for (let x = rm.x; x < rm.x + rm.w; x++) set(x, z, 0); });
    const corridor = (a: LvRoom, b: LvRoom) => {
      const wide = r() < 0.2 ? 2 : 1;
      const horizFirst = r() < 0.5;
      const carveH = (x0: number, x1: number, z: number) => { for (let x = Math.min(x0, x1); x <= Math.max(x0, x1); x++) for (let k = 0; k < wide; k++) set(x, z + k, 0); };
      const carveV = (z0: number, z1: number, x: number) => { for (let z = Math.min(z0, z1); z <= Math.max(z0, z1); z++) for (let k = 0; k < wide; k++) set(x + k, z, 0); };
      if (horizFirst) { carveH(a.cx, b.cx, a.cz); carveV(a.cz, b.cz, b.cx); }
      else { carveV(a.cz, b.cz, a.cx); carveH(a.cx, b.cx, b.cz); }
    };
    for (let i = 1; i < rooms.length; i++) {
      let best = 0, bd = 1e9;
      for (let j = 0; j < i; j++) {
        const d = Math.abs(rooms[i].cx - rooms[j].cx) + Math.abs(rooms[i].cz - rooms[j].cz);
        if (d < bd) { bd = d; best = j; }
      }
      corridor(rooms[i], rooms[best]);
    }
    // extra loops give flanking routes
    const extra = Math.max(1, Math.floor(rooms.length / 3));
    for (let k = 0; k < extra; k++) corridor(U.pick(r, rooms), U.pick(r, rooms));
    return { W, H, t, rooms, ringDoors: true };
  },

  // Outside the building: a lot along its front (open to the sky, fenced), the helicopter's pad at the far side of it behind
  // what's parked there (LZ_KIT), and the way in, a corridor from the nearest room out to a double door in the front wall (a vault door
  // into a bunker).
  approach(lay: LvLay, r: LvRng, theme: LvTheme) {
    const D = 10, { W, H } = lay, H2 = H + D, t = new Uint8Array(W * H2).fill(1), out = new Uint8Array(W * H2), fences: LvFence[] = [], doors = lay.doors ? lay.doors.slice() : [];
    t.set(lay.t);
    for (let z = H; z < H2; z++) for (let x = 0; x < W; x++) out[z * W + x] = 1;
    for (let z = H; z < H2 - 1; z++) for (let x = 1; x < W - 1; x++) t[z * W + x] = 0;
    for (let x = 0; x < W; x++) { t[(H2 - 1) * W + x] = 4; fences.push([x, H2 - 1, 'x']); }
    for (let z = H; z < H2 - 1; z++) for (const x of [0, W - 1]) { t[z * W + x] = 4; fences.push([x, z, 'z']); }
    const lot = this._room(1, H, W - 2, 2, { type: 'lot', out: true, front: true }), pad = this._room(1, H + 3, W - 2, 6, { type: 'lz', out: true });
    const lz = this._pad(pad, W, (W - this.LZ_W) >> 1, H + 3, (this.LZ_KIT as Record<string, any>)[theme.name] || this.LZ_KIT.store);
    // the room nearest the front, and a two-wide corridor from it to the front wall
    const rm = lay.rooms.reduce((a, b) => (b.z + b.h > a.z + a.h ? b : a));
    const x0 = G.U.clamp(rm.cx, 2, W - 4);
    for (let z = rm.z + rm.h; z < H - 1; z++) for (const x of [x0, x0 + 1]) t[z * W + x] = 0;
    doors.push([x0, H - 1, 'z', false, false, theme.entry || null], [x0 + 1, H - 1, 'z', false, true, theme.entry || null]);
    return Object.assign({}, lay, { H: H2, t, out, fences, doors, rooms: lay.rooms.concat([lot, pad]), spawn: pad, lz });
  },

  // A home split into rooms (the houses' splitter): a door between every room and the next until they're all
  // reached, now and then another. c: { r, t, W, ids, rooms, doors }. Returns its rooms.
  // c.even (an apartment): no corridors for rooms. A split lands near the middle, and a room twice as long as it's wide
  // is split again if it can be, however deep. (Without it a home can leave a room 4 tiles by 2.)
  _house(c: Record<string, any>, x0: number, z0: number, w: number, h: number): LvRoom[] {
    const U = G.U, { r, t, W, ids, rooms, doors } = c;
    const fill = (x1: number, z1: number, w1: number, h1: number) => { for (let z = z1; z < z1 + h1; z++) for (let x = x1; x < x1 + w1; x++) t[z * W + x] = 0; };
    const leaves: number[][] = [], lo = c.lo || 3; // the smallest room, in tiles
    const split = (x: number, z: number, w: number, h: number, depth: number) => {
      const canV = w >= 2 * lo + 1, canH = h >= 2 * lo + 1;
      if ((!canV && !canH) || depth > 3 || (depth >= 2 && r() < 0.3 && !(c.even && Math.max(w, h) >= 2 * Math.min(w, h)))) { leaves.push([x, z, w, h]); return; }
      const vert = canV && (!canH || (w >= h ? r() < 0.8 : r() < 0.2));
      const at = (n: number) => { const s = U.ri(r, lo, n - lo - 1), m = (n - 1) >> 1; return c.even ? U.clamp(s, m, n - 1 - m) : s; }; // (the two sides of a wall n long: no more than a tile apart, if even)
      if (vert) { const s = at(w); split(x, z, s, h, depth + 1); split(x + s + 1, z, w - s - 1, h, depth + 1); }
      else { const s = at(h); split(x, z, w, s, depth + 1); split(x, z + s + 1, w, h - s - 1, depth + 1); }
    };
    split(x0, z0, w, h, 0);
    const base = rooms.length;
    leaves.forEach(([x, z, w, h], i) => {
      fill(x, z, w, h);
      for (let zz = z; zz < z + h; zz++) for (let xx = x; xx < x + w; xx++) ids[zz * W + xx] = base + i;
      rooms.push(this._room(x, z, w, h));
    });
    // a door through the wall between rooms until every room is reached, then a couple more for loops
    const cands = [];
    for (let z = z0; z < z0 + h; z++) for (let x = x0; x < x0 + w; x++) {
      if (t[z * W + x] !== 1) continue;
      const a = ids[z * W + x - 1], b = ids[z * W + x + 1], c = ids[(z - 1) * W + x], d = ids[(z + 1) * W + x];
      if (a >= 0 && b >= 0 && a !== b && t[(z - 1) * W + x] === 1 && t[(z + 1) * W + x] === 1) cands.push([x, z, 'x', a, b]);
      if (c >= 0 && d >= 0 && c !== d && t[z * W + x - 1] === 1 && t[z * W + x + 1] === 1) cands.push([x, z, 'z', c, d]);
    }
    U.shuffle(r, cands);
    const parent = new Map(), find = (i: number) => { while (parent.has(i) && parent.get(i) !== i) i = parent.get(i); return i; };
    const near = (c: any[]) => doors.some((d: LvDoorSpec) => Math.abs(d[0] - c[0]) + Math.abs(d[1] - c[1]) < 3);
    for (const c of cands) { const a = find(c[3]), b = find(c[4]); if (a === b || near(c)) continue; parent.set(a, b); doors.push([c[0], c[1], c[2], r() < 0.3]); }
    for (const c of cands) if (r() < 0.05 && !near(c)) doors.push([c[0], c[1], c[2], r() < 0.3]);
    return rooms.slice(base);
  },

  // An apartment block of two floors. On each, a hallway runs the length of the block with apartments either side,
  // each its own home (a few rooms, one front door onto the hallway), and a stairwell at each end of it: the
  // flight up its outer side, a walkway down its inner side from the foot of the stairs to the hall door. Upstairs a
  // second flight, in the lane between them, goes on up to the roof: you come in there, the helicopter's pad out on it, a
  // parapet round the edge and the two stair heads either end. A third or so of the ground-floor homes try to be lofts: the living room
  // goes up two floors with a stair up its wall, to an open upper floor over the rest of the home (railed where
  // it looks down into the living room). Upstairs are single-floor apartments and the lofts' upper floors. Each
  // apartment has to be cleared. Tile values on the plan: 5 a drop (no floor), 6 a flight of stairs.
  layApartments(r: LvRng, level: number): LvBuilding {
    const U = G.U, per = 2 + Math.min(level >> 1, 2); // apartments each side of the hallway
    const ud = U.ri(r, 5, 6), ud2 = U.ri(r, 5, 6);
    const W = 10 + per * 8, hz = ud + 2, H = hz + 2 + ud2 + 1, xa0 = 5, xa1 = W - 6; // (the homes between the stairwells)
    // the homes along each side, the same on both floors (a loft's upper floor sits over it)
    const homes: LvUnit[] = [];
    for (const [z0, h, wallZ] of [[1, ud, hz - 1], [hz + 2, ud2, hz + 1]]) {
      for (let x = xa0; x <= xa1 - 2;) {
        let w = U.ri(r, 5, 7);
        if (xa1 - (x + w) < 5) w = xa1 - x + 1;
        homes.push({ x, w, z0, h, wallZ, loft: r() < 0.35 });
        x += w + 1;
      }
    }
    if (!homes.some((u) => u.loft)) U.pick(r, homes).loft = true;
    const floors = [], stairs = [];
    let unit = 0;
    for (let f = 0; f < 2; f++) {
      const t = new Uint8Array(W * H).fill(1), rooms: LvRoom[] = [], doors: LvDoorSpec[] = [], ids = new Int16Array(W * H).fill(-1), entries: number[][] = [];
      const fill = (x0: number, z0: number, w: number, h: number, v = 0) => { for (let z = z0; z < z0 + h; z++) for (let x = x0; x < x0 + w; x++) t[z * W + x] = v; };
      // the stairwells: [outer lane, inner lane, the way the flight climbs (z), the hall door's x]
      for (const [xo, xm, xi, up, dx] of [[1, 2, 3, -1, 4], [W - 2, W - 3, W - 4, 1, W - 5]]) {
        const x0 = Math.min(xo, xi);
        fill(x0, hz - 2, 3, 5);
        rooms.push(this._room(x0, hz - 2, 3, 5, { type: 'landing', stairs: true }));
        doors.push([dx, hz, 'x', false, false, 'stair']); // (a stairwell door: glass, a push bar one side, a pull handle the other)
        if (f === 0) { fill(xo, hz - 1, 1, 3, 6); stairs.push({ f: 0, x0: xo, z0: hz - 1, x1: xo, z1: hz + 1, axis: 'z', up }); }
        else {
          fill(xo, hz - 1, 1, 3, 5); entries.push([xo, up < 0 ? hz - 2 : hz + 2]); // (over the flight: the drop; where you come up)
          fill(xm, hz - 1, 1, 3, 6); stairs.push({ f: 1, x0: xm, z0: hz - 1, x1: xm, z1: hz + 1, axis: 'z', up: -up }); // (and the flight on up, climbing back the other way)
        }
      }
      // the hallway between them
      fill(xa0, hz, xa1 - xa0 + 1, 1);
      rooms.push(this._room(xa0, hz, xa1 - xa0 + 1, 1, { type: 'corridor' }));
      for (const u of homes) {
        if (f === 0 || !u.loft) {
          // (a home that may become a loft keeps the long room its stair needs: no `even`)
          const mine: LvRoom[] = this._house({ r, t, W, ids, rooms, doors, lo: 2, even: !(f === 0 && u.loft) }, u.x, u.z0, u.w, u.h), id = unit++;
          if (f === 0) u.unit = id;
          mine.forEach((q) => { q.unit = id; });
          // the front door, from the hallway into a room along it: the smallest with a way on to the back of the home
          // (the living room goes there, where the windows are: _program)
          const front = mine.filter((q) => (u.wallZ < u.z0 ? q.z === u.z0 : q.z + q.h === u.wallZ) && q.w >= 2);
          const back = (q: LvRoom) => (u.wallZ < u.z0 ? q.z + q.h === u.z0 + u.h : q.z === u.z0), through = front.filter((q) => this._through(q, mine, doors).some(back));
          const fr = (through.length ? through : front.length ? front : mine).reduce((a, q) => (q.w * q.h < a.w * a.h ? q : a));
          doors.push([U.ri(r, fr.x, fr.x + fr.w - 1), u.wallZ, 'z', false, false]);
          if (f === 0 && u.loft && !this._loftStairs(r, u, mine, t, W, doors, stairs)) u.loft = false; // (no room for a stair: a flat after all)
          this._program(r, mine, doors, fr, back);
        } else {
          // a loft's upper floor: the drop over its living room, and a room over the rest of the home
          fill(u.x, u.z0, u.w, u.h);
          const [vx, vz, vw, vh] = u.drop!;
          fill(vx, vz, vw, vh, 5);
          const pieces = [[u.x, u.z0, u.w, vz - u.z0], [u.x, vz + vh, u.w, u.z0 + u.h - vz - vh], [u.x, vz, vx - u.x, vh], [vx + vw, vz, u.x + u.w - vx - vw, vh]];
          for (const [x, z, w, h] of pieces) if (w > 0 && h > 0) rooms.push(this._room(x, z, w, h, { type: U.pick(r, ['bedroom', 'bedroom', 'office']), unit: u.unit, loft: true }));
          entries.push(u.head!);
        }
      }
      floors.push({ W, H, t, rooms, doors, spawn: rooms[0], entries: f ? entries : null, units: 0 });
    }
    // the roof: open to the sky, a parapet round it, a stair head over each stairwell (its door onto the roof, the hole the
    // flight comes up through)
    {
      const t = new Uint8Array(W * H), out = new Uint8Array(W * H).fill(1), doors: LvDoorSpec[] = [], fences: LvFence[] = [], entries: number[][] = [];
      const wall = (x: number, z: number, axis: string) => { t[z * W + x] = 4; fences.push([x, z, axis, 'parapet']); };
      for (let x = 0; x < W; x++) { wall(x, 0, 'x'); wall(x, H - 1, 'x'); }
      for (let z = 1; z < H - 1; z++) { wall(0, z, 'z'); wall(W - 1, z, 'z'); }
      const roof = this._room(1, 1, W - 2, H - 2, { type: 'roof', out: true }), rooms = [roof], mid = W; // (x in metres: W tiles of 2 m, halved)
      // what a roof has on it: air handlers to either side of the pad, the block's water tank
      roof.cover = [['hvac', mid - 11, 4, 0], ['hvac', mid + 11, 4, 0], ['hvac', mid - 11, H * 2 - 4, 2], ['hvac', mid + 6, H * 2 - 4, 2], ['watertank', mid - 2, 4, 0]];
      for (const [x0, xm, up, dx] of [[0, 2, 1, 4], [W - 5, W - 3, -1, W - 5]]) {
        const hd = up > 0 ? hz + 2 : hz - 2, lx = x0 ? x0 + 1 : 1;
        for (let z = hz - 3; z <= hz + 3; z++) for (let x = x0; x < x0 + 5; x++) { t[z * W + x] = 1; out[z * W + x] = 0; }
        for (let z = hz - 2; z <= hz + 2; z++) for (let x = lx; x < lx + 3; x++) t[z * W + x] = 0;
        for (let z = hz - 1; z <= hz + 1; z++) t[z * W + xm] = 5;
        rooms.push(this._room(lx, hz - 2, 3, 5, { type: 'landing', stairs: true, lid: true }));
        doors.push([dx, hd, 'x', false, false, 'fire']); entries.push([xm, hd]); // (a steel door, as a way onto a roof is)
      }
      floors.push({ W, H, t, out, rooms, doors, fences: fences.filter(([x, z]) => t[z * W + x] === 4), spawn: roof, entries, units: 0 }); // (the stair heads stand where the parapet would)
    }
    for (const fl of floors) fl.units = unit;
    return { floors, stairs, units: unit, lz: { x: (W - this.LZ_W) >> 1, z: (H - this.LZ_H) >> 1, f: 2, lamps: [[5.8, hz + 2.5], [W - 5.8, hz - 1.5]] } };
  },
  // the rooms of a home with a door to q
  _through(q: LvRoom, mine: LvRoom[], doors: LvDoorSpec[]) {
    const inside = (o: LvRoom, x: number, z: number) => x >= o.x && x < o.x + o.w && z >= o.z && z < o.z + o.h;
    return mine.filter((o) => o !== q && doors.some(([x, z, axis]) => {
      const dx = axis === 'x' ? 1 : 0, dz = 1 - dx;
      return (inside(q, x - dx, z - dz) && inside(o, x + dx, z + dz)) || (inside(o, x - dx, z - dz) && inside(q, x + dx, z + dz));
    }));
  },
  // What each room of a home is, so it's a home and not a deal of the cards: the front door opens into the kitchen, the
  // biggest room through it at the back of the home is the living room (a loft's already is), and the rest are a bedroom,
  // the biggest, then whatever suits. Set here, the types don't come from G.Furniture.plan's deal.
  _program(r: LvRng, mine: LvRoom[], doors: LvDoorSpec[], fr: LvRoom, back: (q: LvRoom) => boolean) {
    const U = G.U, size = (q: LvRoom) => q.w * q.h, big = (a: LvRoom, b: LvRoom) => size(b) - size(a), next = this._through(fr, mine, doors);
    const living = mine.find((q) => q.type === 'living') || (back(fr) ? null : next.filter(back).sort(big)[0]) || fr;
    const near = this._through(living, mine, doors);
    const kitchen = living !== fr && near.includes(fr) ? fr : near.concat(mine.filter((q) => q !== living)).sort((a: LvRoom, b: LvRoom) => ((near.includes(b) as unknown as number) - (near.includes(a) as unknown as number)) || big(b, a))[0];
    living.type = 'living';
    if (kitchen) kitchen.type = 'kitchen';
    mine.filter((q) => q !== living && q !== kitchen).sort(big).forEach((q, i) => { q.type = i ? U.pick(r, ['bedroom', 'dining', 'office']) : 'bedroom'; });
  },
  // A loft's stair: up the wall of one of its rooms (which becomes the double-height living room), its foot in the
  // room and its head over the wall at the room's end, onto the upper floor. Not against a doorway, and the head
  // over the home's own walls (not the hallway's or a neighbour's). Returns whether there was a room for one.
  _loftStairs(r: LvRng, u: LvUnit, mine: LvRoom[], t: Uint8Array, W: number, doors: LvDoorSpec[], stairs: any[]) {
    const isDoor = (x: number, z: number) => doors.some((d) => d[0] === x && d[1] === z), wall = (x: number, z: number) => t[z * W + x] === 1 && !isDoor(x, z);
    const inHome = (x: number, z: number) => x >= u.x && x < u.x + u.w && z >= u.z0 && z < u.z0 + u.h;
    const cands = [];
    for (const q of mine) {
      // along z: up the west or east wall, climbing north or south; along x: up the north or south wall
      if (q.h >= 4 && q.w >= 2) for (const lx of [q.x, q.x + q.w - 1]) for (const up of [-1, 1]) {
        const side = lx === q.x ? -1 : 1, z0 = up < 0 ? q.z : q.z + q.h - 3, hz = up < 0 ? q.z - 1 : q.z + q.h;
        let ok = inHome(lx, hz) && wall(lx, hz);
        for (let z = z0; z < z0 + 3 && ok; z++) ok = wall(lx + side, z);
        if (ok) cands.push({ q, x0: lx, z0, x1: lx, z1: z0 + 2, axis: 'z', up, head: [lx, hz] });
      }
      if (q.w >= 4 && q.h >= 2) for (const lz of [q.z, q.z + q.h - 1]) for (const up of [-1, 1]) {
        const side = lz === q.z ? -1 : 1, x0 = up < 0 ? q.x : q.x + q.w - 3, hx = up < 0 ? q.x - 1 : q.x + q.w;
        let ok = inHome(hx, lz) && wall(hx, lz);
        for (let x = x0; x < x0 + 3 && ok; x++) ok = wall(x, lz + side);
        if (ok) cands.push({ q, x0, z0: lz, x1: x0 + 2, z1: lz, axis: 'x', up, head: [hx, lz] });
      }
    }
    if (!cands.length) return false;
    const c = cands[Math.floor(r() * cands.length)];
    for (let z = c.z0; z <= c.z1; z++) for (let x = c.x0; x <= c.x1; x++) t[z * W + x] = 6;
    c.q.type = 'living'; c.q.loft = true;
    stairs.push({ f: 0, x0: c.x0, z0: c.z0, x1: c.x1, z1: c.z1, axis: c.axis, up: c.up });
    u.drop = [c.q.x, c.q.z, c.q.w, c.q.h]; u.head = c.head;
    return true;
  },
  // ---------------------------------------------------------------- floors stacked
  FLOOR_H: 4.3, // one floor to the next: a room's height and the slab between
  // Storeys planned one by one (plan), into one level: each at its height (fy), the solids of all of them in one
  // world, the stairs' steps between them, railings round every drop. The level is floor 0's map, with
  // everything that's counted across floors (doors, windows, rooms, spots) gathered from all of them (and ids
  // numbered through); map.floors holds each floor's own.
  // lay.base: which floor is at ground level (0 unless there's a basement under it: floors below it are below ground).
  // the floor above has a hole over the top of this wall (the edge of a stairwell): the wall stops short of that floor by the
  // thickness of the slab, and the slab's what fills it, or there's a ledge down there and the wall above's underside in the dark
  _capped(m: LvMap, up: LvMap, i: number) { return m.t[i] === 1 && up.t[i] === 5 && !(up.out && up.out[i]); },
  stack(fms: LvMap[], lay: Partial<LvBuilding>) {
    const FH = this.FLOOR_H, TS = this.TS, CTS = this.CTS, base = lay.base || 0;
    fms.forEach((m, f) => { m.fl = f; m.fy = (f - base) * FH; m.skirt = f ? FH - this.WALL_H : 0; });
    fms.forEach((m, f) => { const up = fms[f + 1]; m.voidAbove = up ? up.t.map((v, i) => (v === 5 || (up.grate && up.grate[i]) ? 1 : 0)) : null; m.above = up || null; }); // (over a drop or a grating: no ceiling)
    // a hall the full height of the building: its lamps, and what glows in it, light the floor above as well (its catwalks)
    fms.forEach((m, f) => {
      const up = fms[f + 1];
      if (up) for (const l of m.lights) if (l.up) {
        const i = Math.floor(l.z / TS) * up.W + Math.floor(l.x / TS);
        if (up.t[i] === 5 || (up.grate && up.grate[i])) up.lights.push({ kind: 'string', x: l.x, z: l.z, y: l.y! - FH, color: l.color, i: l.i, d: l.d, glow: l.glow });
      }
    });
    const map = Object.assign({}, fms[base]); // (the level's own map is the ground floor's: the spawn, the outdoors)
    map.floors = fms; map.NF = fms.length; map.base = base;
    map.minY = -base * FH; // (the lowest floor: a basement's is below the ground)
    map.doors = []; map.windows = []; map.rooms = []; map.cover = []; map.wallSpots = []; map.enemySpots = [];
    fms.forEach((m, f) => {
      if (f !== base) { m.case = null; m.abox = null; m.sbox = null; m.cabinets = []; } // (the weapon case, the attachments box, the sticker box and first aid cabinets: on the ground floor)
      for (const d of m.doors) { d.id = map.doors.length; d.fl = f; d.fy = m.fy; map.doors.push(d); }
      for (const w of m.windows) { w.id = map.windows.length; w.fl = f; w.fy = m.fy; map.windows.push(w); }
      for (const rm of m.rooms) { rm.fl = f; map.rooms.push(rm); }
      for (const c of m.cover) map.cover.push(Object.assign(c, { y: m.fy, fl: f }));
      for (const w of m.wallSpots) map.wallSpots.push(Object.assign(w, { y: m.fy, fl: f }));
      for (const sp of m.enemySpots) map.enemySpots.push([sp[0], sp[1], f]);
    });
    // a glass door's pane, counted with the windows (shot through and shot out the same way: G.Views.breakGlass,
    // G.Server.breakGlass); its mesh is the door's leaf
    for (const d of map.doors) if (d.kind === 'stair') { d.pane = { id: map.windows.length, door: d, x: d.x, z: d.z, fy: d.fy, fl: d.fl, broken: false, cells: [], len: d.w || TS }; map.windows.push(d.pane); }
    // the stairs, in metres: their footprint, the floor at their foot, which way they climb
    map.stairs = lay.stairs.map((st: LvStair) => ({ f: st.f, y0: fms[st.f].fy, rise: FH, axis: st.axis, up: st.up, x0: st.x0 * CTS, x1: (st.x1 + 1) * CTS, z0: st.z0 * CTS, z1: (st.z1 + 1) * CTS }));
    // railings round every drop, but not across the head of a flight (where you step off it)
    const head = (st: LvStair, ex: number, ez: number, dx: number, dz: number) => (st.axis === 'z'
      ? dz === -st.up && Math.abs(ez - (st.up < 0 ? st.z0 : st.z1)) < 0.01 && ex > st.x0 && ex < st.x1
      : dx === -st.up && Math.abs(ex - (st.up < 0 ? st.x0 : st.x1)) < 0.01 && ez > st.z0 && ez < st.z1);
    map.rails = [];
    fms.forEach((m, f) => {
      if (!f) return;
      const { W, H, t } = m;
      for (let z = 0; z < H; z++) for (let x = 0; x < W; x++) {
        const v = t[z * W + x];
        if (v === 1 || v === 5) continue;
        for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nx = x + dx, nz = z + dz;
          if (nx < 0 || nz < 0 || nx >= W || nz >= H || t[nz * W + nx] !== 5) continue;
          const ex = (x + 0.5 + dx * 0.5) * TS, ez = (z + 0.5 + dz * 0.5) * TS;
          if (map.stairs.some((st) => st.f === f - 1 && head(st, ex, ez, dx, dz))) continue;
          map.rails.push({ f, y: m.fy, x0: dx ? ex - 0.03 : x * TS, x1: dx ? ex + 0.03 : (x + 1) * TS, z0: dz ? ez - 0.03 : z * TS, z1: dz ? ez + 0.03 : (z + 1) * TS });
        }
      }
    });
    // each railing's glass is a pane like a window's (shot through and shot out, for everyone: map.windows); steel
    // railings (a foundry's catwalks: lay.rail) have none, only rails, open between
    map.railSteel = lay.rail === 'steel';
    if (!map.railSteel) for (const r of map.rails) {
      const alongX = r.x1 - r.x0 > r.z1 - r.z0;
      r.pane = { id: map.windows.length, rail: r, x: (r.x0 + r.x1) / 2, z: (r.z0 + r.z1) / 2, fy: r.y, fl: r.f, broken: false, cells: [], len: alongX ? r.x1 - r.x0 : r.z1 - r.z0, nz: alongX ? 1 : 0, nx: alongX ? 0 : 1 };
      map.windows.push(r.pane);
    }
    // one world for all of it
    const w = G.World.create();
    fms.forEach((m, f) => G.World.fromTileMap(m, { world: w, y: m.fy, skirt: m.skirt, voidAbove: m.voidAbove, ground: f === 0 && base === 0 })); // (over a basement, the ground floor has its stair holes)
    for (const st of map.stairs) G.World.stairs(w, st);
    fms.forEach((m, f) => { const up = fms[f + 1]; if (up) for (let i = 0; i < m.W * m.H; i++) if (this._capped(m, up, i)) { const x = (i % m.W) * TS, z = Math.floor(i / m.W) * TS; G.World.add(w, G.World.box(x, m.fy + this.WALL_H, z, x + TS, up.fy, z + TS, { kind: 'floor' })); } });
    // a railing stops you walking off the drop (glass or not); only its steel handrail stops a round: under it, the
    // glass is a pane (its solids: G.World.windowSolids), shot through and out
    for (const rl of map.rails) {
      G.World.add(w, G.World.box(rl.x0, rl.y, rl.z0, rl.x1, rl.y + this.RAIL_H, rl.z1, { kind: 'rail', ray: false }));
      G.World.add(w, G.World.box(rl.x0, rl.y + this.RAIL_H - 0.05, rl.z0, rl.x1, rl.y + this.RAIL_H, rl.z1, { kind: 'rail', move: false }));
      if (rl.pane) { rl.pane.solids = []; G.World.windowSolids(w, map, rl.pane); }
    }
    map.world = w; fms.forEach((m) => { m.world = w; });
    return map;
  },
  RAIL_H: 1.0,
  // which floor someone at (x, y, z) is on: the one whose floor they're standing nearest above (on a flight of
  // stairs, the floor at its foot)
  floorAt(map: LvMap, x: number, y: number, z: number) {
    if (!map.floors) return 0;
    for (const st of map.stairs) if (x > st.x0 && x < st.x1 && z > st.z0 && z < st.z1 && y < st.y0! + st.rise! + 0.3 && y > st.y0! - 0.5) return st.f; // (on its top tread too: the floor above has a drop there)
    return G.U.clamp(Math.floor((y + 0.6) / this.FLOOR_H) + (map.base || 0), 0, map.NF - 1);
  },
  floorMap(map: LvMap, f: number) { return map.floors ? map.floors[f] : map; },
  // The space a blast fills, on the floor it went off on: cell by cell out from the one it's in, nearest (along the floor)
  // first, the way gas spreads. Walls stop it; a shut door stops it, an open doorway lets it through into the next room
  // (furniture doesn't: the air goes round it). It stops when it's taken `cap` cells, or there's nowhere left to go (the
  // room, and whatever's open onto it, is full). out: how many of them are open to the sky; vents: how many times it
  // met a way out of the building (a broken window, the sky's edge). The same on every machine: it is worked out from the
  // map and its doors alone. Returns the cells in the order it reached them (order, the cell index on that floor) and how
  // far along the floor each is from where it went off (d, metres).
  blastFill(map: LvMap, x: number, y: number, z: number, cap: number) {
    const TS = this.TS, W = map.W, H = map.H, f = this.floorAt(map, x, y, z), fm = this.floorMap(map, f), t = fm.t, out = fm.out || map.out;
    const doorAt: Map<number, LvDoor> = (fm as any).doorAt || map.doorAt || new Map();
    const order = new Int32Array(cap), d = new Float32Array(cap), seen = new Uint8Array(W * H), broken = new Set<number>();
    for (const w of map.windows || []) if (w.broken && (w.fl || 0) === f) for (const c of w.cells) broken.add(c);
    let sx = G.U.clamp(Math.floor(x / TS), 0, W - 1), sz = G.U.clamp(Math.floor(z / TS), 0, H - 1);
    // (gone off against a wall, or over a cell the grid calls solid: the nearest open cell next to it)
    if (t[sz * W + sx] === 1) { // (the one whose middle is nearest the point: the side of the wall it's on)
      let bx = sx, bz = sz, bd = Infinity;
      for (const [ox, oz] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]]) { const nx = sx + ox, nz = sz + oz, dd = Math.hypot((nx + 0.5) * TS - x, (nz + 0.5) * TS - z); if (nx >= 0 && nz >= 0 && nx < W && nz < H && t[nz * W + nx] !== 1 && dd < bd) { bd = dd; bx = nx; bz = nz; } }
      sx = bx; sz = bz;
    }
    let n = 0, outN = 0, vents = 0;
    const s0 = sz * W + sx;
    if (t[s0] === 1) return { f, order, d, n: 0, out: 0, vents: 0, cx: x, cz: z };
    // (nearest first: cells in buckets by distance, a tenth of a metre each; diagonal steps too, so it spreads round, not as a
    // diamond, though never across a corner)
    const best = new Float32Array(W * H).fill(Infinity), Q: number[][] = [], open = (j: number) => { const v = t[j]; if (v === 1) return false; if (v === 3) { const dd = doorAt.get(j); if (dd && !dd.open && !dd.fallen) return false; } return true; };
    const push = (j: number, dj: number) => { if (dj >= best[j]) return; best[j] = dj; const b = Math.round(dj * 10); (Q[b] || (Q[b] = [])).push(j); };
    push(s0, Math.hypot((sx + 0.5) * TS - x, (sz + 0.5) * TS - z));
    for (let b = 0; b < Q.length && n < cap; b++) {
      const q = Q[b]; if (!q) continue;
      for (let k = 0; k < q.length && n < cap; k++) {
        const i = q[k];
        if (seen[i]) continue;
        seen[i] = 1; order[n] = i; d[n++] = best[i];
        if (out[i]) outN++;
        const tx = i % W, tz = (i / W) | 0, di = best[i];
        for (const [ox, oz] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, 1], [1, -1], [-1, -1]]) {
          const nx = tx + ox, nz = tz + oz;
          if (nx < 0 || nz < 0 || nx >= W || nz >= H) { if (!ox || !oz) vents++; continue; }
          const j = nz * W + nx;
          if (seen[j]) continue;
          if (t[j] === 1) { if (broken.has(j) && !ox !== !oz) { seen[j] = 1; vents++; } continue; }
          if (!open(j)) continue;
          if (ox && oz && (!open(tz * W + nx) || !open(nz * W + tx))) continue; // (not across a corner)
          push(j, di + (ox && oz ? TS * Math.SQRT2 : TS));
        }
      }
    }
    return { f, order, d, n, out: outN, vents, cx: x, cz: z };
  },
  // a flow source for something at (x, y, z): its cell, and (in a building of several floors) its floor
  src(map: LvMap, x: number, y: number, z: number) { return [Math.floor(x / this.TS), Math.floor(z / this.TS), this.floorAt(map, x, y || 0, z)]; },

  // A warehouse: a row of offices along the back wall, then the warehouse floor (rows of pallet racks with
  // aisles between and cross-aisles through them), open at the front onto the loading dock, the yard past it, where you
  // come in: the helicopter's pad behind a row of containers.
  layWarehouse(r: LvRng, level: number): LvLay {
    const U = G.U, W = 26 + Math.min(level, 4), lzH = 7, H = 22 + Math.min(level, 3) + lzH; // (the last rows: the blast walls and the helicopter's pad past the dock)
    const t = new Uint8Array(W * H).fill(1), rooms: LvRoom[] = [], doors: LvDoorSpec[] = [];
    const fill = (x0: number, z0: number, w: number, h: number) => { for (let z = z0; z < z0 + h; z++) for (let x = x0; x < x0 + w; x++) t[z * W + x] = 0; };
    // offices, 4 tiles deep, side by side with a wall between each
    const od = 4, offices = [];
    for (let x = 1; x < W - 2;) {
      let w = U.ri(r, 4, 6);
      if (W - 1 - (x + w + 1) < 4) w = W - 1 - x;
      fill(x, 1, w, od);
      offices.push(this._room(x, 1, w, od, { type: x === 1 ? 'breakroom' : U.pick(r, ['office', 'office', 'storage']) }));
      doors.push([x + U.ri(r, 1, w - 2), od + 1, 'z', r() < 0.3]); // into the warehouse
      if (x > 1 && r() < 0.5) doors.push([x - 1, U.ri(r, 2, od - 1), 'x', r() < 0.3]); // through to the next office
      x += w + 1;
    }
    // the floor inside, then the front wall, then the loading dock outside (where you come in): two roller doors
    // (rolled up: wide openings) and a door between them
    const hz = od + 2, dockH = 4, hallH = H - 2 - hz - dockH - lzH, fz = hz + hallH, out = new Uint8Array(W * H), fences: LvFence[] = [];
    fill(1, hz, W - 2, hallH);
    fill(1, fz + 1, W - 2, dockH + lzH);
    for (let z = fz + 1; z < H; z++) for (let x = 0; x < W; x++) out[z * W + x] = 1;
    const rollers = [U.ri(r, 3, (W >> 1) - 4), U.ri(r, (W >> 1) + 2, W - 6)];
    for (const x0 of rollers) for (let x = x0; x < x0 + 3; x++) t[fz * W + x] = 0;
    doors.push([(rollers[0] + rollers[1] + 3) >> 1, fz, 'z', false, false]);
    for (let x = 0; x < W; x++) { t[(H - 1) * W + x] = 4; fences.push([x, H - 1, 'x']); }
    for (let z = fz + 1; z < H - 1; z++) for (const x of [0, W - 1]) { t[z * W + x] = 4; fences.push([x, z, 'z']); }
    const dock = this._room(1, fz + 1, W - 2, dockH, { type: 'dock', out: true, front: true });
    const hall = this._room(1, hz, W - 2, hallH, { type: 'hall' });
    const pz = fz + dockH + 2, pad = this._room(1, pz, W - 2, 6, { type: 'lz', out: true }), lz = this._pad(pad, W, (W - this.LZ_W) >> 1, pz, this.LZ_KIT.yard);
    rooms.push(pad, dock, hall, ...offices);
    return { W, H, t, rooms, doors, out, fences, spawn: pad, lz, rollers: rollers.map((x0) => [x0, fz, 3]) };
  },

  // The hangar: one big hall (the workshop, the store and the warehouse side by side in it), a wide opening in its
  // front wall, and the helipad out in front of that, open to the sky and fenced. 52 x 42 m.
  // Behind its north wall (a garage door in it) is the shooting range, in the first G.HANGAR_ROWS rows: a yard to stand in
  // at the firing line, an IPSC course on the left, a pistol range (16 m) and a rifle range (300 m), walled between and open
  // to the sky, a backstop at the far end of each.
  layHangar(_r?: LvRng, _level?: number): LvLay {
    const R = G.HANGAR_ROWS, W = 26, H = 21 + R, hallH = 12, hz = R + 1, fz = hz + hallH, padH = 6, ox = 9, ow = 8;
    const t = new Uint8Array(W * H).fill(1), out = new Uint8Array(W * H), fences: LvFence[] = [];
    const fill = (x0: number, z0: number, w: number, h: number) => { for (let z = z0; z < z0 + h; z++) for (let x = x0; x < x0 + w; x++) t[z * W + x] = 0; };
    fill(1, hz, W - 2, hallH);
    fill(1, fz + 1, W - 2, padH);
    for (let x = ox; x < ox + ow; x++) t[fz * W + x] = 0; // (the opening)
    for (let z = fz + 1; z < H; z++) for (let x = 0; x < W; x++) out[z * W + x] = 1;
    for (let x = 0; x < W; x++) { t[(H - 1) * W + x] = 4; fences.push([x, H - 1, 'x']); }
    for (let z = fz + 1; z < H - 1; z++) for (const x of [0, W - 1]) { t[z * W + x] = 4; fences.push([x, z, 'z']); }
    // the range: the yard (3 rows, x 1..17), the IPSC course on the left (x 1..5, 14 rows up: js/course.ts), the pistol
    // lanes (x 7..11, 8 rows up), the rifle lanes (x 13..17, to the top)
    const yz = R - 3, laneZ = 1, rifH = yz - laneZ, pisH = 8, crsH = 14;
    fill(1, yz, 17, 3); fill(1, yz - crsH, 5, crsH); fill(7, yz - pisH, 5, pisH); fill(13, laneZ, 5, rifH);
    for (let z = yz - crsH; z < R; z++) for (let x = 1; x < 12; x++) out[z * W + x] = 1;
    for (let z = yz; z < R; z++) for (let x = 12; x < 18; x++) out[z * W + x] = 1;
    for (let z = laneZ; z < yz; z++) for (let x = 13; x < 18; x++) out[z * W + x] = 1;
    for (let x = 2; x < 5; x++) t[R * W + x] = 0; // (the garage door: a wide opening in the hall's north wall, the shutter rolled up)
    const pad = this._room(1, fz + 1, W - 2, padH, { type: 'pad', out: true }), hall = this._room(1, hz, W - 2, hallH, { type: 'hangar' });
    const yard = this._room(1, yz, 17, 3, { type: 'range', out: true }), crs = this._room(1, yz - crsH, 5, crsH, { type: 'range', out: true }), pis = this._room(7, yz - pisH, 5, pisH, { type: 'range', out: true }), rif = this._room(13, laneZ, 5, rifH, { type: 'range', out: true });
    return { W, H, t, rooms: [pad, hall, yard, crs, pis, rif], doors: [], out, fences, spawn: pad, rollers: [[ox, fz, ow], [2, R, 3]] };
  },

  // The suburbs: two detached family homes side by side on a street, the houses of interest, each with a basement, a
  // ground floor and an upstairs. Coarse tiles (2 m), north (low z) to south:
  //   the street, four tiles wide (a road with its pavements), running the whole width. You start at its west end, on the
  //     helicopter's pad on the turning circle there, a removal van across the road east of it, then the roadblock: two
  //     patrol cars staggered across the road (a gap to walk through), with the neighbour's house on the corner between
  //     you and the houses' windows. More patrol cars at the kerb in front of the houses
  //     and across the far end.
  //   front lawns, then the houses (18-22 m across, 12-14 m deep), a narrow alley between them and a path down the
  //     east side, and the back gardens behind, joined by a gap in the fence between them.
  // Inside each house a stair hall runs front to back down its west side (two tiles wide): the front door opens into
  // it, the flight down to the basement goes down one lane of it and the flight up the other, and a door from the hall
  // into the rooms on every floor. The rooms beside it are split up for each floor on its own (living rooms, kitchen
  // and dining room on the ground floor, bedrooms and a study upstairs, storage and a den in the basement).
  // Floors: 0 the basement, 1 the ground floor (base), 2 upstairs. Upstairs, everything outside the houses is open
  // air (tile 5, open to the sky): nothing to stand on, no ceiling, and a roof over the top.
  layHouses(r: LvRng, level: number): LvBuilding {
    const U = G.U, S = 4, SP = 21, TC = 8; // the street, S tiles deep; its west end, SP tiles, before the houses; the first TC of them the turning circle
    const grow = Math.min(level >> 1, 2);
    const hwA = U.ri(r, 9, 10) + (grow >> 1), hwB = U.ri(r, 9, 10) + (grow >> 1), hh = U.ri(r, 6, 7), yd = U.ri(r, 5, 6);
    const zF = S + 3, z0 = zF + 1, zb = z0 + hh, H = zb + yd + 2; // the front wall row, the first row inside, the back wall row
    const xA = SP + 2, xl = xA + hwA + 1, xB = xl + 2, xE = xB + hwB + 1, W = xE + 2; // house A's first column, the alley, house B's, the east path
    const houses = [{ x: xA, w: hwA }, { x: xB, w: hwB }];
    const mk = (v: number): LvFl & { fences: LvFence[] } => ({ t: new Uint8Array(W * H).fill(v), out: new Uint8Array(W * H), rooms: [], doors: [], fences: [], ids: new Int16Array(W * H).fill(-1) });
    const B = mk(1), Gf = mk(1), Up = mk(5);
    Up.out.fill(1);
    const fill = (F: LvFl, x0: number, zz: number, w: number, h: number, v = 0) => { for (let z = zz; z < zz + h; z++) for (let x = x0; x < x0 + w; x++) F.t[z * W + x] = v; };
    const setOut = (F: LvFl, x0: number, zz: number, w: number, h: number, v: number) => { for (let z = zz; z < zz + h; z++) for (let x = x0; x < x0 + w; x++) F.out[z * W + x] = v; };
    const fence = (x: number, z: number, axis: string) => { Gf.t[z * W + x] = 4; Gf.out[z * W + x] = 1; Gf.fences.push([x, z, axis]); };
    // ---- the ground floor's outdoors
    fill(Gf, 1, 1, W - 2, S); setOut(Gf, 0, 0, W, S + 1, 1); // the street
    fill(Gf, SP + 1, S + 1, W - SP - 2, zF - S - 1); setOut(Gf, SP, S + 1, W - SP, zF - S - 1, 1); // front lawns
    fill(Gf, xl, zF, 1, zb - zF + 1); setOut(Gf, xl, zF, 1, zb - zF + 1, 1); // the alley
    fill(Gf, xE, zF, 1, zb - zF + 1); setOut(Gf, xE, zF, 1, zb - zF + 1, 1); // the east path
    fill(Gf, SP + 1, zb + 1, W - SP - 2, yd); setOut(Gf, SP, zb + 1, W - SP, yd + 1, 1); // the back gardens
    // the neighbour on the corner: a front garden behind a fence, their house (not to be entered) behind it
    fill(Gf, 1, S + 1, SP - 1, 2); setOut(Gf, 0, S + 1, SP, 2, 1);
    for (let x = TC + 1; x < SP; x++) fence(x, S + 1, 'x');
    for (let x = 0; x < W; x++) { fence(x, 0, 'x'); fence(x, H - 1, 'x'); }
    for (let z = 1; z <= S; z++) { fence(0, z, 'z'); fence(W - 1, z, 'z'); }
    for (let z = S + 1; z < S + 3; z++) fence(0, z, 'z'); // (the turning circle's west side)
    for (let z = S + 1; z < H - 1; z++) { fence(SP, z, 'z'); fence(W - 1, z, 'z'); } // (the neighbour's side, and the east edge)
    for (let z = zb + 2; z <= zb + yd; z++) if (z !== zb + 3) fence(xl, z, 'z'); // between the gardens, a gap near the house
    // ---- the houses, floor by floor
    const stairs: LvStair[] = [], entries: Record<number, number[][]> = { 0: [], 2: [] }, HOME: Record<number, RoomType[] | null> = { 0: ['storage', 'living', 'storage', 'office'], 1: null, 2: ['bedroom', 'bedroom', 'office', 'bedroom', 'bedroom'] };
    for (const hs of houses) {
      const a = hs.x, bL = hs.x + 1, wc = hs.x + 2, rx = hs.x + 3, rw = hs.w - 3, sz = z0 + 2; // the hall's two lanes, its wall, the rooms beside it; the stairs' first row
      for (const [f, F] of [[0, B], [1, Gf], [2, Up]] as [number, any][]) {
        fill(F, hs.x - 1, zF, hs.w + 2, hh + 2, 1); setOut(F, hs.x - 1, zF, hs.w + 2, hh + 2, 0); // the shell
        fill(F, a, z0, 2, hh); // the stair hall
        const hall = this._room(a, z0, 2, hh, { type: 'landing', stairs: true });
        F.rooms.push(hall);
        // the stairs: up from the basement (lane a, climbing north into the hall), up from the ground floor (lane b,
        // climbing south to the landing upstairs); a drop over each flight on the floor above
        if (f === 0) { fill(F, a, sz, 1, 3, 6); stairs.push({ f: 0, x0: a, z0: sz, x1: a, z1: sz + 2, axis: 'z', up: -1 }); }
        if (f === 1) { fill(F, a, sz, 1, 3, 5); fill(F, bL, sz, 1, 3, 6); stairs.push({ f: 1, x0: bL, z0: sz, x1: bL, z1: sz + 2, axis: 'z', up: 1 }); }
        if (f === 2) { fill(F, bL, sz, 1, 3, 5); entries[2].push([bL, sz + 3]); }
        if (f === 0) entries[0].push([a, sz + 3]);
        // the rooms beside the hall, this floor's own split
        const mine: LvRoom[] = this._house({ r, t: F.t, W, ids: F.ids, rooms: F.rooms, doors: F.doors }, rx, z0, rw, hh);
        mine.forEach((q, i: number) => { if (HOME[f]) q.type = HOME[f][i % HOME[f].length]; q.house = houses.indexOf(hs); });
        // a door from the hall into each room along its wall (not opposite a flight or the drop beside it)
        let n = 0;
        for (const q of mine) {
          if (q.x !== rx) continue;
          const rows = []; for (let z = q.z; z < q.z + q.h; z++) if (f === 0 || z < sz || z > sz + 2) rows.push(z);
          if (!rows.length || (n && r() < 0.35)) continue;
          F.doors.push([wc, U.pick(r, rows), 'x', r() < 0.3]); n++;
        }
        if (!n) F.doors.push([wc, f === 0 ? sz + 3 : z0, 'x', false]); // (always one)
        if (f === 1) {
          F.doors.push([U.ri(r, a, bL), zF, 'z', false, false]); // the front door, into the hall
          const back = mine.filter((q) => q.z + q.h === zb && q.w >= 2), bq = back.length ? U.pick(r, back) : null; // the back door, from a room into the garden
          if (bq) { const x = bq.x + U.ri(r, 0, bq.w - 1); F.doors.push([x, zb, 'z', false, false]); if (x + 1 < bq.x + bq.w && bq.w >= 3 && r() < 0.5) F.doors.push([x + 1, zb, 'z', false, true]); }
          else F.doors.push([bL, zb, 'z', false, false]);
          F.doors.push([hs.x + hs.w, z0 + hh - 1, 'x', false]); // a side door, out of its east wall onto the alley (A) or the path (B)
        }
      }
    }
    // ---- the outdoor rooms; the street, its patrol cars
    const curb = S; // (the row along the lawns)
    const spawn = this._room(1, 1, TC, S + 2, { type: 'lz', out: true }), way = this._room(TC + 1, 1, SP - TC - 3, S, { type: 'road', out: true });
    const road = this._room(SP - 2, 1, W - SP + 1, S, { type: 'road', out: true, cars: [
      [SP - 1, 1, false], [SP + 1, 3, false], // the roadblock: staggered across the road
      [xA + 1, curb, true], [xB + hwB - 4, curb, true], // at the kerb in front of the houses
      [W - 3, 1, false], [W - 3, 3, false], // across the far end
    ] });
    const lawnA = this._room(SP + 1, S + 1, xl - SP - 1, zF - S - 1, { type: 'lawn', out: true }), lawnB = this._room(xl, S + 1, W - xl - 1, zF - S - 1, { type: 'lawn', out: true });
    const alley = this._room(xl, zF, 1, zb - zF + 1, { type: 'alley', out: true }), path = this._room(xE, zF, 1, zb - zF + 1, { type: 'alley', out: true });
    const yardA = this._room(SP + 1, zb + 1, xl - SP - 1, yd, { type: 'yard', out: true }), yardB = this._room(xl + 1, zb + 1, W - xl - 2, yd, { type: 'yard', out: true });
    const nbr = this._room(TC + 1, S + 2, SP - TC - 1, 1, { type: 'lawn', out: true });
    const lz = this._pad(spawn, W, 1, 2, this.LZ_KIT.suburbs, true);
    Gf.rooms.push(yardA, yardB, alley, path, lawnA, lawnB, nbr, road, way, spawn);
    const floor = (F: LvFl, f: number) => ({ W, H, t: F.t, out: F.out, rooms: F.rooms, doors: F.doors, fences: F.fences, spawn: f === 1 ? spawn : F.rooms[0], entries: f === 1 ? null : entries[f], underground: f === 0 });
    return { floors: [floor(B, 0), floor(Gf, 1), floor(Up, 2)], stairs, base: 1, lz: Object.assign(lz, { f: 1 }) };
  },

  tile(map: LvMap, tx: number, tz: number) {
    if (tx < 0 || tz < 0 || tx >= map.W || tz >= map.H) return 1;
    return map.t[tz * map.W + tx];
  },
  // Axis-aligned box for a solid tile (null for floor)
  boxAt(map: LvMap, tx: number, tz: number) {
    const v = this.tile(map, tx, tz);
    if (v === 0) return null;
    const cx = (tx + 0.5) * this.TS, cz = (tz + 0.5) * this.TS;
    if (v === 2 || v === 4) {
      const p = map.props && map.props.get(tz * map.W + tx);
      if (p) return p.boxes[0];
      return v === 2 ? { cx, cz, hx: this.CRATE_HX, hz: this.CRATE_HX, y0: 0, h: this.CRATE_H } : { cx, cz, hx: this.TS / 2, hz: this.TS / 2, y0: 0, h: this.WALL_H };
    }
    if (v === 3) {
      const d = map.doorAt.get(tz * map.W + tx);
      if (d && d.open) return { cx, cz, hx: this.TS / 2, hz: this.TS / 2, y0: this.DOOR_H, h: this.WALL_H };
      const thin = d && d.axis === 'x';
      return { cx, cz, hx: thin ? 0.07 : this.TS / 2, hz: thin ? this.TS / 2 : 0.07, y0: 0, h: this.WALL_H, door: d };
    }
    return { cx, cz, hx: this.TS / 2, hz: this.TS / 2, y0: 0, h: this.WALL_H };
  },

  // Every solid box in a tile: walls and doors are one box, furniture can be several (a desk and its chair),
  // and small things in corners (plants, lamps) sit on floor tiles.
  boxesAt(map: LvMap, tx: number, tz: number) {
    if (tx >= 0 && tz >= 0 && tx < map.W && tz < map.H && map.props) {
      const p = map.props.get(tz * map.W + tx);
      if (p) return p.boxes;
    }
    const b = this.boxAt(map, tx, tz);
    return b ? [b] : this.NONE;
  },
  NONE: [],
  // Returns {t, n:[nx,ny,nz]} — distance along the (unit) direction to the first solid surface
  // opts.glass: go through glass (listing the panes crossed, nearest first, in .glass) instead of stopping at it.
  // A hit on the view behind an outside window comes back with .view (no mark to leave there).
  raycast(map: LvMap, ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, maxD: number, opts?: LvRayOpts) {
    if (map.world) return G.World.raycast(map.world, ox, oy, oz, dx, dy, dz, maxD, opts);
    const pass = !!(opts && opts.glass), crossed: number[][] | null = pass ? [] : null;
    const TS = this.TS;
    let limit = maxD, ln = null;
    if (dy < -1e-6) { const tf = -oy / dy; if (tf < limit) { limit = tf; ln = [0, 1, 0]; } }
    else if (dy > 1e-6) {
      const tc = (this.WALL_H - oy) / dy;
      if (tc < limit) {
        // a garden has no ceiling
        const cx = Math.floor((ox + dx * tc) / TS), cz = Math.floor((oz + dz * tc) / TS);
        const open = map.out && cx >= 0 && cz >= 0 && cx < map.W && cz < map.H && map.out[cz * map.W + cx];
        if (!open) { limit = tc; ln = [0, -1, 0]; }
      }
    }
    let tx = Math.floor(ox / TS), tz = Math.floor(oz / TS);
    const sx = dx > 0 ? 1 : -1, sz = dz > 0 ? 1 : -1;
    const tdx = Math.abs(dx) > 1e-9 ? Math.abs(TS / dx) : Infinity;
    const tdz = Math.abs(dz) > 1e-9 ? Math.abs(TS / dz) : Infinity;
    let tmx = Math.abs(dx) > 1e-9 ? (dx > 0 ? (tx + 1) * TS - ox : ox - tx * TS) / Math.abs(dx) : Infinity;
    let tmz = Math.abs(dz) > 1e-9 ? (dz > 0 ? (tz + 1) * TS - oz : oz - tz * TS) / Math.abs(dz) : Infinity;
    let t = 0;
    for (let guard = 0; guard < 400 && t <= limit; guard++) {
      const bs = this.rayBoxesAt(map, tx, tz);
      if (bs.length) {
        let best: { t: number; n: number[]; view?: boolean; pane?: any; glass?: any } | null = null; // boxes never leave their tile, so the nearest hit in this tile is the nearest overall
        for (const b of bs) {
          const hit = this._slab(ox, oy, oz, dx, dy, dz, b);
          if (!hit || hit.t > limit) continue;
          if (b.glass != null && pass) { if (!crossed!.some((c) => c[0] === b.glass)) crossed!.push([b.glass, hit.t]); continue; }
          if (!best || hit.t < best.t) { best = hit; best.view = !!b.view; best.pane = b.glass != null ? b.glass : undefined; }
        }
        if (best) { if (pass) best.glass = crossed!.filter((c) => c[1] < best.t).sort((a, c) => a[1] - c[1]); return best; }
      }
      if (tmx < tmz) { t = tmx; tmx += tdx; tx += sx; } else { t = tmz; tmz += tdz; tz += sz; }
    }
    return { t: limit, n: ln, glass: pass ? crossed!.sort((a, c) => a[1] - c[1]) : undefined };
  },
  // how well a sees b: 0 (blocked), 1 (clear), or seen through glass that's still whole (GLASS_SEE)
  GLASS_SEE: 0.4,
  see(map: LvMap, ax: number, ay: number, az: number, bx: number, by: number, bz: number) {
    const dx = bx - ax, dy = by - ay, dz = bz - az, d = Math.hypot(dx, dy, dz);
    if (d < 0.01) return 1;
    const h = this.raycast(map, ax, ay, az, dx / d, dy / d, dz / d, d, { glass: true, sight: true }); // (a look: through bulletproof glass too)
    if (h.t < d - 0.05) return 0;
    return (h.glass && h.glass.length) || h.clear ? this.GLASS_SEE : 1;
  },
  _slab(ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, b: LvBox) {
    let tmin = -Infinity, tmax = Infinity, n = null;
    const axes = [[ox, dx, b.cx - b.hx, b.cx + b.hx, 0], [oy, dy, b.y0, b.h, 1], [oz, dz, b.cz - b.hz, b.cz + b.hz, 2]];
    for (const [o, d, lo, hi, ax] of axes) {
      if (Math.abs(d) < 1e-9) { if (o < lo || o > hi) return null; continue; }
      let t1 = (lo - o) / d, t2 = (hi - o) / d, s = -1;
      if (t1 > t2) { const tmp = t1; t1 = t2; t2 = tmp; s = 1; }
      if (t1 > tmin) { tmin = t1; n = [0, 0, 0]; n[ax] = s; }
      if (t2 < tmax) tmax = t2;
      if (tmin > tmax) return null;
    }
    if (tmax < 0) return null;
    return { t: Math.max(0, tmin), n: n || [0, 1, 0] };
  },
  los(map: LvMap, ax: number, ay: number, az: number, bx: number, by: number, bz: number) {
    const dx = bx - ax, dy = by - ay, dz = bz - az;
    const d = Math.hypot(dx, dy, dz);
    if (d < 0.01) return true;
    return this.raycast(map, ax, ay, az, dx / d, dy / d, dz / d, d).t >= d - 0.05;
  },

  // Circle-vs-tile collision. Boxes the entity is standing on top of (y >= box height) are ignored.
  // step: how high a thing can be and still be stepped up onto, not walked into (a stair's step is 0.2)
  // smooth: someone walking (stairs are slopes for them: G.World.rampAt)
  resolve(map: LvMap, p: LvPt, r: number, y = 0, step = 0.02, smooth = false) {
    if (map.world) { const q = { x: p.x, y, z: p.z }; G.World.resolve(map.world, q, r, 1.9, step, smooth); p.x = q.x; p.z = q.z; return; }
    const TS = this.TS;
    for (let iter = 0; iter < 2; iter++) {
      const x0 = Math.floor((p.x - r) / TS), x1 = Math.floor((p.x + r) / TS);
      const z0 = Math.floor((p.z - r) / TS), z1 = Math.floor((p.z + r) / TS);
      for (let tz = z0; tz <= z1; tz++) for (let tx = x0; tx <= x1; tx++) {
        for (const b of this.boxesAt(map, tx, tz)) {
        if (y >= b.h - 0.02 || b.y0 > 1.9) continue; // stood on top of it, or walking under a door lintel
        const qx = G.U.clamp(p.x, b.cx - b.hx, b.cx + b.hx), qz = G.U.clamp(p.z, b.cz - b.hz, b.cz + b.hz);
        let ddx = p.x - qx, ddz = p.z - qz;
        const d = Math.hypot(ddx, ddz);
        if (d >= r) continue;
        if (d > 1e-5) { p.x += (ddx / d) * (r - d); p.z += (ddz / d) * (r - d); }
        else {
          // centre inside the box: push out along the shallowest axis
          const px = b.hx - Math.abs(p.x - b.cx), pz = b.hz - Math.abs(p.z - b.cz);
          if (px < pz) p.x += Math.sign(p.x - b.cx || 1) * (px + r); else p.z += Math.sign(p.z - b.cz || 1) * (pz + r);
        }
        }
      }
    }
  },
  groundAt(map: LvMap, x: number, z: number, r: number, y: number, step = 0.05, smooth = false) {
    if (map.world) { const g = G.World.groundAt(map.world, x, z, r, y, step, smooth); return Number.isFinite(g) ? g : 0; }
    const TS = this.TS;
    let g = 0;
    const x0 = Math.floor((x - r) / TS), x1 = Math.floor((x + r) / TS);
    const z0 = Math.floor((z - r) / TS), z1 = Math.floor((z + r) / TS);
    for (let tz = z0; tz <= z1; tz++) for (let tx = x0; tx <= x1; tx++) {
      for (const b of this.boxesAt(map, tx, tz)) {
        if (b.h >= this.WALL_H) continue;
        if (Math.abs(x - b.cx) < b.hx + r * 0.6 && Math.abs(z - b.cz) < b.hz + r * 0.6 && y >= b.h - 0.05) g = Math.max(g, b.h);
      }
    }
    return g;
  },

  // ---------------------------------------------------------------- getting about a building of several floors
  // Every floor's walkable cells are nodes (node = floor * W * H + cell). A flight of stairs' cells join each other
  // only along the flight, and the rest of their floor only across its foot; the cells at its head join the cells
  // just past it on the floor above. map.nav, built once: for each node, the flight it's part of (-1: none).
  nav(map: LvMap) {
    if (map.navG) return map.navG;
    const { W, H } = map, WH = W * H, NF = map.NF, TS = this.TS;
    const stairOf = new Int16Array(NF * WH).fill(-1), links = new Map(), foot = new Set();
    const link = (a: number, b: number) => { for (const [p, q] of [[a, b], [b, a]]) { if (!links.has(p)) links.set(p, []); links.get(p).push(q); } };
    map.stairs.forEach((st, k) => {
      const base = st.f * WH, up = (st.f + 1) * WH;
      const cx0 = Math.round(st.x0 / TS), cx1 = Math.round(st.x1 / TS) - 1, cz0 = Math.round(st.z0 / TS), cz1 = Math.round(st.z1 / TS) - 1;
      for (let z = cz0; z <= cz1; z++) for (let x = cx0; x <= cx1; x++) stairOf[base + z * W + x] = k;
      // the head row and the cells past it upstairs; the foot row and the cells before it downstairs
      const along = st.axis === 'z', hi = st.up < 0 ? (along ? cz0 : cx0) : (along ? cz1 : cx1), lo = st.up < 0 ? (along ? cz1 : cx1) : (along ? cz0 : cx0), d = st.up < 0 ? -1 : 1;
      for (let a = along ? cx0 : cz0; a <= (along ? cx1 : cz1); a++) {
        const cell = (u: number) => (along ? u * W + a : a * W + u);
        link(base + cell(hi), up + cell(hi + d));
        foot.add(base + cell(lo - d) + ',' + (base + cell(lo)));
      }
    });
    return (map.navG = { WH, NF, stairOf, links, foot });
  },
  // can you walk straight from node a to its neighbour b (both on one floor)? Off a flight only along it; onto it
  // only at its foot
  navStep(g: LvNav, a: number, b: number, W: number) {
    const sa = g.stairOf[a], sb = g.stairOf[b];
    if (sa < 0 && sb < 0) return true;
    if (sa >= 0 && sb >= 0) return sa === sb;
    return g.foot.has(sa >= 0 ? b + ',' + a : a + ',' + b);
  },
  // the node someone at (x, y, z) stands on
  navNode(map: LvMap, x: number, y: number, z: number) {
    const tx = Math.floor(x / this.TS), tz = Math.floor(z / this.TS);
    if (tx < 0 || tz < 0 || tx >= map.W || tz >= map.H) return -1;
    return this.floorAt(map, x, y, z) * map.W * map.H + tz * map.W + tx;
  },
  // BFS distance field (in tiles) from source tiles over walkable floor; -1 = unreachable. A building of several
  // floors: sources [x, z, floor], and the field covers every floor (up and down the stairs).
  flow(map: LvMap, sources: number[][]) {
    if (map.floors) return this.flow3(map, sources);
    const { W, H, t } = map;
    const dist = new Int16Array(W * H).fill(-1);
    const q = new Int32Array(W * H);
    let qh = 0, qt = 0;
    for (const [x, z] of sources) {
      if (x < 0 || z < 0 || x >= W || z >= H) continue;
      const i = z * W + x;
      if (!(t[i] === 0 || t[i] === 3) || dist[i] >= 0) continue;
      dist[i] = 0; q[qt++] = i;
    }
    const ok = (j: number) => (t[j] === 0 || t[j] === 3) && dist[j] < 0;
    while (qh < qt) {
      const i = q[qh++], x = i % W, z = (i / W) | 0, d = dist[i] + 1;
      if (x > 0 && ok(i - 1)) { dist[i - 1] = d; q[qt++] = i - 1; }
      if (x < W - 1 && ok(i + 1)) { dist[i + 1] = d; q[qt++] = i + 1; }
      if (z > 0 && ok(i - W)) { dist[i - W] = d; q[qt++] = i - W; }
      if (z < H - 1 && ok(i + W)) { dist[i + W] = d; q[qt++] = i + W; }
    }
    return dist;
  },
  flow3(map: LvMap, sources: number[][]) {
    const g = this.nav(map), { W, H } = map, WH = g.WH, dist = new Int16Array(g.NF * WH).fill(-1), q = new Int32Array(g.NF * WH);
    const walk = (n: number) => { const v = map.floors[(n / WH) | 0].t[n % WH]; return v === 0 || v === 3 || v === 7; };
    let qh = 0, qt = 0;
    for (const [x, z, f] of sources) {
      if (x < 0 || z < 0 || x >= W || z >= H) continue;
      const n = (f || 0) * WH + z * W + x;
      if (!walk(n) || dist[n] >= 0) continue;
      dist[n] = 0; q[qt++] = n;
    }
    while (qh < qt) {
      const n = q[qh++], i = n % WH, x = i % W, z = (i / W) | 0, d = dist[n] + 1;
      const go = (m: number) => { if (dist[m] < 0 && walk(m) && this.navStep(g, n, m, W)) { dist[m] = d; q[qt++] = m; } };
      if (x > 0) go(n - 1);
      if (x < W - 1) go(n + 1);
      if (z > 0) go(n - W);
      if (z < H - 1) go(n + W);
      const up = g.links.get(n);
      if (up) for (const m of up) if (dist[m] < 0 && walk(m)) { dist[m] = d; q[qt++] = m; }
    }
    return dist;
  },
  // a building's next waypoint: downhill (or, away, uphill) on the field from where someone stands, on their floor
  // or up or down a flight
  flowStep3(map: LvMap, dist: Int16Array, x: number, z: number, y: number, away: boolean) {
    const g = this.nav(map), W = map.W, WH = g.WH, n = this.navNode(map, x, y, z);
    if (n < 0 || dist[n] < 0) return null;
    let best = null, bd = dist[n];
    const i = n % WH, tx = i % W, tz = (i / W) | 0, base = n - i;
    const take = (m: number, score: number) => { if (dist[m] < 0) return; if (away ? score > bd : score < bd) { bd = score; best = m; } };
    for (let oz = -1; oz <= 1; oz++) for (let ox = -1; ox <= 1; ox++) {
      if (!ox && !oz) continue;
      if (away && ox && oz) continue;
      const nx = tx + ox, nz = tz + oz;
      if (nx < 0 || nz < 0 || nx >= W || nz >= map.H) continue;
      const m = base + nz * W + nx;
      if (ox && oz) { // no diagonal corner-cutting (or through door frames, or on or off a flight)
        const fl = map.floors[(n / WH) | 0].t;
        if (fl[tz * W + nx] !== 0 || fl[nz * W + tx] !== 0 || g.stairOf[n] >= 0 || g.stairOf[m] >= 0) continue;
      } else if (!this.navStep(g, n, m, W)) continue;
      take(m, dist[m] + (ox && oz ? 0.4 : 0));
    }
    for (const m of g.links.get(n) || []) take(m, dist[m]);
    if (best == null) return null;
    const j = best % WH, f = (best / WH) | 0;
    return { x: ((j % W) + 0.5) * this.TS, z: (((j / W) | 0) + 0.5) * this.TS, y: map.floors[f].fy, fl: f };
  },
  // Next waypoint (world coords) that walks downhill on the flow field from (x, z) (y: their height, in a building
  // of several floors)
  flowStep(map: LvMap, dist: Int16Array, x: number, z: number, y = 0) {
    if (map.floors) return this.flowStep3(map, dist, x, z, y, false);
    const TS = this.TS, W = map.W;
    const tx = Math.floor(x / TS), tz = Math.floor(z / TS);
    const here = dist[tz * W + tx];
    if (here < 0) return null;
    let best = null, bd = here;
    for (let oz = -1; oz <= 1; oz++) for (let ox = -1; ox <= 1; ox++) {
      if (!ox && !oz) continue;
      const nx = tx + ox, nz = tz + oz;
      if (nx < 0 || nz < 0 || nx >= W || nz >= map.H) continue;
      const nd = dist[nz * W + nx];
      if (nd < 0) continue;
      if (ox && oz && (map.t[tz * W + nx] !== 0 || map.t[nz * W + tx] !== 0)) continue; // no diagonal corner-cutting (or through door frames)
      const score = nd + (ox && oz ? 0.4 : 0);
      if (score < bd) { bd = score; best = [nx, nz]; }
    }
    if (!best) return null;
    return { x: (best[0] + 0.5) * TS, z: (best[1] + 0.5) * TS };
  },

  flowAway(map: LvMap, dist: Int16Array, x: number, z: number, y = 0) {
    if (map.floors) return this.flowStep3(map, dist, x, z, y, true);
    const TS = this.TS, W = map.W;
    const tx = Math.floor(x / TS), tz = Math.floor(z / TS);
    const here = dist[tz * W + tx];
    if (here < 0) return null;
    let best = null, bd = here;
    for (const [ox, oz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = tx + ox, nz = tz + oz;
      if (nx < 0 || nz < 0 || nx >= W || nz >= map.H) continue;
      const nd = dist[nz * W + nx];
      if (nd > bd) { bd = nd; best = [nx, nz]; }
    }
    return best ? { x: (best[0] + 0.5) * TS, z: (best[1] + 0.5) * TS } : null;
  },
  doorNear(map: LvMap, x: number, z: number, r = 1.8, y = 0) {
    let best = null, bd = r;
    for (const d of map.doors) { const dd = Math.hypot(d.x - x, d.z - z); if (dd < bd && Math.abs((d.fy || 0) - y) < 2) { bd = dd; best = d; } } // (a door on this floor)
    return best;
  },

  // ---------------------------------------------------------------- steel grating
  // A catwalk's floor (map.grate): bar grating, bearing bars a few centimetres apart and a cross bar every so often, seen
  // through from above and below (drawn: js/leveldesc.ts grate, its texture js/levelview.ts). Rounds meet the bars where
  // they're drawn: onBar.
  GRATE: { PX: 96, PITCH: 6, CROSS: 32, BAR: 2 }, // (a tile's worth, in the texture's pixels)
  // is this point on the floor over a bar? 1 a bearing bar, 2 a cross bar, 0 a gap
  onBar(x: number, z: number) {
    const { PX, PITCH, CROSS, BAR } = this.GRATE, k = PX / this.TS, a = ((x * k) % PX + PX) % PX, b = ((z * k) % PX + PX) % PX;
    return a % PITCH < BAR ? 1 : b % CROSS < BAR ? 2 : 0;
  },
  // A zipline's trolley as it hangs off the cable (js/levelview.ts zipKit): a strap down to the handle ZIP_BAR under the cable.
  // A rider takes one across (js/rig.ts, js/player.ts zipArms), hanging by the bar, their feet ZIP_HANG under the cable.
  ZIP_BAR: 0.65, ZIP_HANG: 2.65,
  // a point on a zipline's cable (crest.lines), s from 0 at its start to 1 at its end: straight between its ends, sagging in
  // the middle (a parabola's near enough to the catenary)
  zipPoint(l: { a: number[]; b: number[]; sag: number }, s: number) { return [l.a[0] + (l.b[0] - l.a[0]) * s, l.a[1] + (l.b[1] - l.a[1]) * s - l.sag * 4 * s * (1 - s), l.a[2] + (l.b[2] - l.a[2]) * s]; },
};
G.Level = G_Level;
 interface GameModules { Level: typeof G_Level; }
