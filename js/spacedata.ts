'use strict';
// The space direction's data, the same on every screen and in the host's simulation (docs/space.md): the squad's ships and
// what fits on their hardpoints, the kinds of place a mission goes to (a ship to board, a base on a planet to assault), the
// missions a visit to the base offers (from the visit's seed, so nobody has to be sent the list), where each one's anchor
// is in the space round the base, and how a distance is written. Nothing here draws.
type SpObj = 'artifact' | 'hvt' | 'destruct' | 'assault' | 'hostage' | 'visit';
// a ship under way in a mission's zone (zone): what she is (kind: her lines; size, th, seed, wing: the level she is when she's boarded), her course (a loop of points, metres in the zone's frame), her pace and where on it she started
interface SpContact { k: number; kind: string; size: SpSize; th: number; seed: number; wing: boolean; name: string; pts: number[][]; lens: number[]; total: number; speed: number; off: number }
// a ship's class, least to most: a civilian transport, a corvette, a frigate, a cruiser, a capital ship (SIZES, js/shipgen.ts SPEC)
type SpSize = 'transport' | 'small' | 'medium' | 'large' | 'capital';
// what a class carries on her hull, and who's aboard her: light guards posted singly, security squads (four, armed and armoured), breach
// response squads (three, lighter: they come to where the hull is breached), and those who don't fight
interface SpClass { name: string; tier: number; pay: number; diff: number; guns: { pd: number; cannon: number; missile: number }; crew: { guard: number; squads: number; resp: number; civ: number } }
// what a level is generated for, besides the four figures (js/level.ts generate: its fifth). size: the ship boarded; obj: what's
// wanted aboard; side: which side the breach is on (1 starboard, -1 port); ship: the squad's own ship (its berth is cut to it)
interface SpGen { size?: SpSize; obj?: SpObj; ship?: string; planet?: number; other?: SpSize | null; wing?: boolean } // (other: a second ship lying off her, nothing to do with the mission)
interface SpMission { i: number; kind: 'board' | 'assault'; obj: SpObj; size: SpSize | null; th: number; seed: number; diff: number; pay: number; name: string; brief: string; where: string; night: boolean; ly: number; anchor: [number, number, number]; other?: SpSize | null; fuse?: number; wing?: boolean } // (wing: a corvette or a frigate built as a flying wing: js/shipgen.ts wingDeck)
interface SpSeat { k: 'helm' | 'sensors' | 'turret' | 'jump'; x: number; y: number; z: number; yaw: number; n?: number; f: number; sx: number; sz: number } // (f: the floor it stands on; sx, sz: where you stand when you get up)
/** The squad's ship as she's laid out (js/spacedata.ts layout): three levels. Her frame: x to starboard, y up from her keel, z aft (her nose to -z). */
interface SpLayout {
  fw: number; tw: number; sw: number; hw: number; // half-widths: the cockpit, the breach tunnel, the staging space behind it, the crew deck
  zc: number; zt: number; zw: number; zk: number; zr: number; z1: number; // the collar, the tunnel's mouth, the low wall, the cockpit's back (the stairs' top), the stairs' foot (the crew deck's front), the tail
  FC: number; FB: number; FM: number; CC: number; CB: number; CM: number; // floors and ceilings: the cockpit, the breach deck, the crew deck
  lift: number; // how far over her keel the breach deck's floor is above a deck she's breaching (her keel sits that much lower)
}
interface SpShipDef { id: string; name: string; cls: string; blurb: string; price: number; hw: number; z0: number; z1: number; nose: number; hull: number; speed: number; cruise: number; turn: number; turrets: number; utils: number; jump: number }
interface SpEquip { id: string; name: string; slot: 'turret' | 'util'; price: number; blurb: string; dmg?: number; rof?: number; range?: number }
interface SpFleet { owned: string[]; ship: string; fit: Record<string, (string | null)[]> }
const G_SpaceData = (() => {
  // The game plays in space (the hangar is the base, missions are flown to). Off, it is the game as it was: a route map and a
  // helicopter. A debug start's ?play goes the old way whatever this says (js/debugstart.ts).
  const ON = true;
  const FLOOR = 0.24; // the deck of the squad's ship, over the ground it stands on (low enough to step up onto: G.World.STEP)
  const HEAD = 2.4; // and its ceiling over that
  // The squad's ships. A ship is a deck: a nose airlock with the breaching door on its end (z0 - nose .. z0), the cockpit
  // behind it, the cabin, and the ramp at the back (z1). hw: half the cabin's width inside. Lengths in metres, the ship's own
  // frame: x to starboard, y up, -z forward.
  const SHIPS: Record<string, SpShipDef> = {
    kestrel: { id: 'kestrel', name: 'Kestrel', cls: 'Breaching cutter', blurb: 'What the squad starts with: small, quick to turn, one dorsal hardpoint and one equipment bay.', price: 0, hw: 1.7, z0: -5, z1: 5, nose: 3, hull: 100, speed: 140, cruise: 1100, turn: 1.25, turrets: 1, utils: 1, jump: 4 },
    atlas: { id: 'atlas', name: 'Atlas', cls: 'Assault lander', blurb: 'A longer, wider deck with two hardpoints and two equipment bays, and armour to take a point-defence gun on the way in. Slower to turn.', price: 9000, hw: 2.3, z0: -6, z1: 7, nose: 3, hull: 180, speed: 120, cruise: 1000, turn: 0.9, turrets: 2, utils: 2, jump: 6 },
    wraith: { id: 'wraith', name: 'Wraith', cls: 'Interceptor', blurb: 'Light and very fast, with a long-legged warp drive. One hardpoint, two equipment bays, thin plating.', price: 14000, hw: 1.5, z0: -5, z1: 4, nose: 3, hull: 70, speed: 190, cruise: 1700, turn: 1.6, turrets: 1, utils: 2, jump: 4 },
  };
  // What goes on a hardpoint (a turret a teammate mans from its seat) or in an equipment bay.
  const EQUIP: Record<string, SpEquip> = {
    pd: { id: 'pd', name: 'PD-20 autocannon', slot: 'turret', price: 0, blurb: 'A 20 mm point-defence gun: fast, short-ranged.', dmg: 6, rof: 0.09, range: 1400 },
    rail: { id: 'rail', name: 'Lancet railgun', slot: 'turret', price: 4200, blurb: 'One heavy slug every second and a half, out to four kilometres: what takes a turret off a hull.', dmg: 60, rof: 1.5, range: 4000 },
    sensors: { id: 'sensors', name: 'Deck scanner', slot: 'util', price: 0, blurb: 'The sensor station reads a ship\'s deck plan through its hull: rooms, doors, and who is in them once you are close.' },
    plating: { id: 'plating', name: 'Ablative plating', slot: 'util', price: 2600, blurb: 'Half as much hull again.' },
    drive: { id: 'drive', name: 'Tuned warp drive', slot: 'util', price: 3400, blurb: 'The warp drive spins up sooner and runs a third faster.' },
    jammer: { id: 'jammer', name: 'Comms jammer', slot: 'util', price: 3800, blurb: 'A crew that sees you can\'t raise the rest of the ship: nobody is called to the breach.' },
  };
  const fleet0 = (): SpFleet => ({ owned: ['kestrel'], ship: 'kestrel', fit: { kestrel: ['pd', 'sensors'] } });
  // a fleet off the wire or out of storage, made whole: only what exists, the ship in use owned, each ship's slots its own
  function cleanFleet(f: any): SpFleet {
    const out = fleet0();
    if (!f || typeof f !== 'object') return out;
    for (const id of Array.isArray(f.owned) ? f.owned : []) if (SHIPS[id] && !out.owned.includes(id)) out.owned.push(id);
    if (typeof f.ship === 'string' && out.owned.includes(f.ship)) out.ship = f.ship;
    for (const id of out.owned) {
      const d = SHIPS[id], src = f.fit && Array.isArray(f.fit[id]) ? f.fit[id] : id === 'kestrel' ? out.fit.kestrel : ['pd'], fit: (string | null)[] = [];
      for (let s = 0; s < d.turrets + d.utils; s++) { const e = EQUIP[src[s]]; fit.push(e && e.slot === (s < d.turrets ? 'turret' : 'util') ? e.id : null); }
      out.fit[id] = fit;
    }
    return out;
  }
  const fitted = (f: SpFleet, id: string) => (f.fit[f.ship] || []).includes(id);
  // The seats of a ship, in its own frame: the helm (port, forward), the sensor station beside it, a seat under each
  // hardpoint, and the jump seats down the cabin's sides.
  // ---- How she's laid out (the Kestrel's plan; the others the same, to their size). Three levels, joined at her waist by two
  // flights of stairs, a wall between them:
  //   the cockpit, low in her narrow nose: the pilot at the front glass, the sensor station behind and raised to see over, the
  //     gunners side by side behind that (their guns are on her roof: they're laid from here);
  //   the breach deck over it, as long: the tunnel forward to the collar and the breaching door, and behind the tunnel's mouth
  //     the space to wait in, wider, with a wall at crouching height a metre back from the mouth to wait behind;
  //   the crew deck aft, between the two: wide and lower, jump seats down both walls, the ramp at the tail (steps down to the
  //     ground when it's open). Up the left flight from it to the breach deck, down the right to the cockpit.
  // When she's breaching, it's the breach deck's floor that's level with the deck she's breached (her keel lift lower).
  function layout(d: SpShipDef): SpLayout {
    // (the breach deck a step lower than it might be, 2.2 m clear over it; the cockpit's floor low in her keel so it keeps its headroom under that;
    // the crew deck no longer than its two rows of seats and the ramp need)
    const k = d.hw / 1.7, zc = d.z0 - d.nose - 0.5, zt = zc + 2.4, zk = zc + 4.6, zr = zk + 2.3, FB = 2.4;
    return { fw: 1.25 * k, tw: 0.85, sw: 1.85 * k, hw: d.hw + 0.9 * k, zc, zt, zw: zt + 1.0, zk, zr, z1: zr + 4.6 + Math.max(0, d.jump - 4) * 0.48, FC: 0.15, FB, FM: 1.5, CC: 2.2, CB: FB + 2.2, CM: 3.9, lift: FB - FLOOR };
  }
  function seats(d: SpShipDef): SpSeat[] {
    const L = layout(d), F = L.FC;
    const s: SpSeat[] = [
      { k: 'helm', x: 0, y: F + 0.1, z: L.zc + 1.45, yaw: 0, f: F, sx: 0.75, sz: L.zc + 1.6 }, // (low: the glass floor ahead of it, and headroom over it)
      { k: 'sensors', x: 0, y: F + 0.42, z: L.zc + 2.5, yaw: 0, f: F, sx: 0.75, sz: L.zc + 2.65 }, // (raised: eyes over the pilot's head)
    ];
    for (let i = 0; i < d.turrets; i++) s.push({ k: 'turret', n: i, x: (i ? 1 : -1) * 0.55, y: F + 0.1, z: L.zc + 3.55, yaw: 0, f: F, sx: 0, sz: L.zc + 4.25 });
    for (let i = 0; i < d.jump; i++) { const sd = i % 2 ? 1 : -1, z = L.zr + 1.4 + Math.floor(i / 2) * 0.95; s.push({ k: 'jump', x: sd * (L.hw - 0.4), y: L.FM, z, yaw: sd * Math.PI / 2, f: L.FM, sx: sd * (L.hw - 1.1), sz: z }); }
    return s;
  }
  // What stops you aboard, as boxes in the ship's frame: [x0, y0, z0, x1, y1, z1, tag]. Tags: 'nose' the breaching door (gone
  // while it's open), 'ramp' the rear door (the same), 'steps' the steps down off the open ramp (there only while it's open).
  type ShipBox = [number, number, number, number, number, number, string?];
  function boxes(d: SpShipDef): ShipBox[] {
    const L = layout(d), W = 0.2, { fw, tw, sw, hw, zc, zt, zw, zk, zr, z1, FC, FB, FM, CC, CB, CM } = L, top = CB + W;
    // (each flight as many steps as keep a rise to 0.3 m, over the same run)
    const nU = Math.ceil((FB - FM) / 0.3 - 1e-6), nD = Math.ceil((FM - FC) / 0.3 - 1e-6), run = zr - zk;
    const out: ShipBox[] = [
      // the cockpit: its deck (on to the foot of the down flight), its sides, the glass at its front, its back wall under the up flight
      [-fw - W, 0, zc + 0.3, fw + W, FC, zr], [-fw - W, FC, zc + 0.3, -fw, CC, zk], [fw, FC, zc + 0.3, fw + W, CC, zk], [-fw, FC, zc + 0.3, fw, CC, zc + 0.5],
      [-fw, FC, zk, -0.06, FB - 0.3, zk + 0.05], [-fw - W, CC, zc + 0.3, fw + W, CC + 0.2, zt], // (and its roof, under the tunnel)
      // the breach deck: the tunnel's floor, sides and roof; the staging space's floor, sides, roof and the wall either side of the tunnel's mouth; the low wall
      [-tw - W, CC, zc, tw + W, FB, zt], [-tw - W, FB, zc, -tw, CB, zt], [tw, FB, zc, tw + W, CB, zt], [-tw - W, CB, zc, tw + W, top, zt],
      [-sw - W, CC, zt, sw + W, FB, zk], [-sw - W, FB, zt, -sw, CB, zk], [sw, FB, zt, sw + W, CB, zk], [-sw - W, CB, zt, sw + W, top, zk],
      [-sw, FB, zt - W, -tw, CB, zt], [tw, FB, zt - W, sw, CB, zt],
      [-1.0, FB, zw, 1.0, FB + 1.0, zw + 0.25],
      [-sw, FB, zk - 0.05, -fw, CB, zk], [0.06, FB, zk - 0.05, sw, FB + 1.0, zk], // (the stairwell's rail on the right; the up flight comes in on the left)
      [-tw, FB, zc - W, tw, CB, zc, 'nose'],
      // the stairs: their sides and roof, the wall between the two flights
      [-fw - W, 0, zk, -fw, CB, zr], [fw, 0, zk, fw + W, CB, zr], [-fw - W, CB, zk, fw + W, top, zr], [-0.06, 0, zk, 0.06, FB + 0.9, zr],
      // the crew deck: the hold under it, its sides, roof, the bulkhead at its front either side of the stairs (and over them), the ramp
      [-hw - W, 0, zr, hw + W, FM, z1], [-hw - W, FM, zr, -hw, CM, z1], [hw, FM, zr, hw + W, CM, z1], [-hw - W, CM, zr, hw + W, CM + W, z1],
      [-hw, FM, zr - W, -fw, CM, zr], [fw, FM, zr - W, hw, CM, zr], [-fw, CM, zr - 0.05, fw, CB, zr + 0.05],
      [-hw, FM, z1, hw, CM, z1 + W, 'ramp'],
    ];
    const rD = run - 0.95; // (down: on the cockpit's deck the best part of a metre before its ceiling, so your head's under it as you come to it)
    for (let i = 0; i < nD - 1; i++) out.push([0.06, 0, zr - rD * (i + 1) / (nD - 1), fw, FM - (FM - FC) * (i + 1) / nD, zr - rD * i / (nD - 1)]); // down to the cockpit, on the right
    for (let i = 0; i < nU; i++) out.push([-fw, 0, zr - run * (i + 1) / nU, -0.06, FM + (FB - FM) * (i + 1) / nU, zr - run * i / nU]); // up to the breach deck, on the left
    for (let i = 0; i < 4; i++) out.push([-hw + 0.3, 0, z1 + W + 0.38 * i, hw - 0.3, FM - 0.3 * (i + 1), z1 + W + 0.38 * (i + 1), 'steps']); // off the open ramp
    return out;
  }
  // a point of the ship's frame in the world, the ship standing at berth b ({ x, y, z, yaw }: yaw as an officer's, 0 facing -z)
  function toWorld(b: { x: number; y: number; z: number; yaw: number }, lx: number, ly: number, lz: number) {
    const c = Math.cos(b.yaw), s = Math.sin(b.yaw);
    return { x: b.x + lx * c + lz * s, y: b.y + ly, z: b.z - lx * s + lz * c };
  }
  function toShip(b: { x: number; y: number; z: number; yaw: number }, wx: number, wy: number, wz: number) {
    const c = Math.cos(b.yaw), s = Math.sin(b.yaw), dx = wx - b.x, dz = wz - b.z;
    return { x: dx * c - dz * s, y: wy - b.y, z: dx * s + dz * c };
  }
  // is this point of the world aboard (inside the hull's box)
  function aboard(d: SpShipDef, b: { x: number; y: number; z: number; yaw: number }, wx: number, wy: number, wz: number) {
    const p = toShip(b, wx, wy, wz);
    const L = layout(d);
    if (p.y < -0.2 || p.z < L.zc - 0.3 || p.z > L.z1 + 0.1) return false;
    return p.z < L.zr ? p.y < L.CB + 0.4 && Math.abs(p.x) < (p.y > L.CC - 0.1 ? (p.z < L.zt ? L.tw : L.sw) : L.fw) + 0.1 : p.y < L.CM + 0.4 && Math.abs(p.x) < L.hw + 0.05;
  }
  // Where the ship stands in the hangar (the pad in front of the hall: js/hangar.ts), nose to the west.
  const HUB_BERTH = { x: 27, y: 0, z: G_HANGAR_ROWS * 2 + 35, yaw: Math.PI / 2 };

  // ---- the places missions go to (the level's theme: js/level.ts generate, th from 1000 up)
  const THEMES: ThemeDef[] = [
    { name: 'Freighter', layout: 'ship', space: 1, noFog: true, winRate: 0, thru: 0.1, foes: 1.0, crowd: 1.2, home: 0, reflect: 0.3, floor: '#4a4e52', wall: '#868b8c', crate: '#b0702c', accent: '#e8922a', fog: 0x020306, light: 0xffe2c0, ceil: '#5a5f66', hemi: 0x8fa6c8, hemiI: 0.35, far: 30000 },
    { name: 'Corporate cutter', layout: 'ship', space: 1, noFog: true, winRate: 0, thru: 0.14, foes: 1.1, crowd: 0.8, home: 0, reflect: 0.4, floor: '#a9afb4', wall: '#dde2e4', crate: '#4f7896', accent: '#2fc6d6', fog: 0x020306, light: 0xeef4ff, ceil: '#cfd5d8', hemi: 0x9fb4d8, hemiI: 0.4, far: 30000 },
    { name: 'Navy warship', layout: 'ship', space: 1, noFog: true, winRate: 0, thru: 0.07, foes: 1.35, crowd: 0.4, home: 0, reflect: 0.3, floor: '#3a4149', wall: '#65717b', crate: '#566650', accent: '#d23a30', fog: 0x020306, light: 0xdfe8ff, ceil: '#4a525b', hemi: 0x8fa6c8, hemiI: 0.3, far: 30000 },
  ];
  const TH0 = 1000;
  const themeAt = (th: number | null | undefined): ThemeDef | null => (th == null ? null : th >= TH0 ? THEMES[th - TH0] || null : G.THEMES[th] || null);
  const themeIndex = (T: ThemeDef | null | undefined) => { if (!T) return -1; const i = G.THEMES.findIndex((q) => q.name === T.name); return i >= 0 ? i : THEMES.findIndex((q) => q.name === T.name) >= 0 ? TH0 + THEMES.findIndex((q) => q.name === T.name) : -1; };

  // ---- A mission's zone: a vast stretch of open space with the ship the mission is about under way in it (contact 0: bow
  // first, in a straight line, slowly) and now and then someone else passing (the rest: four or five, each on a wide loop of
  // its own; the first of them comes within a few kilometres). Any of them can be closed with and boarded (js/spaceserver.ts
  // 'tboard'): each is a ship of her own class, theme and seed, so she's the same ship whenever she's looked at.
  // The zone's frame: the mission ship's own at the moment the squad came out of the jump, its middle the origin.
  function zone(ms: { seed: number; size: SpSize | null; th: number; wing?: boolean; name: string }): SpContact[] {
    const r = G.U.rng((ms.seed ^ 0x20e5) >>> 0), U = G.U, out: SpContact[] = [];
    const mk = (kind: string, size: SpSize, th: number, seed: number, wing: boolean, name: string, pts: number[][], speed: number, off: number) => {
      const lens = pts.map((p, i) => { const q = pts[(i + 1) % pts.length]; return Math.hypot(q[0] - p[0], q[1] - p[1], q[2] - p[2]); });
      out.push({ k: out.length, kind, size, th, seed, wing, name, pts, lens, total: lens.reduce((a, b) => a + b, 0), speed, off });
    };
    const wing = !!ms.wing, size = ms.size || 'small', d = wing ? [-0.7071, 0, -0.7071] : [-1, 0, 0], T0 = themeAt(ms.th);
    mk(wing ? 'wing' : size === 'transport' ? (T0 && T0.name === 'Corporate cutter' ? 'cutter' : 'freighter') : size === 'large' || size === 'capital' ? 'navy' : 'pirate', size, ms.th, ms.seed, wing, ms.name,
      [[-d[0] * 60000, 0, -d[2] * 60000], [d[0] * 60000, 0, d[2] * 60000]], 12, 60000);
    const n = 4 + (r() < 0.5 ? 1 : 0), n0 = U.ri(r, 0, SHIP_NAMES.length - 1); // (no two of them of a name)
    for (let i = 1; i <= n; i++) {
      const kind = U.pick(r, ['freighter', 'freighter', 'cutter', 'pirate', 'navy', 'wing']), sz: SpSize = kind === 'freighter' || kind === 'cutter' ? 'transport' : kind === 'navy' ? 'large' : r() < 0.5 ? 'small' : 'medium';
      const th = kind === 'freighter' ? TH0 : kind === 'cutter' ? TH0 + 1 : kind === 'navy' ? TH0 + 2 : TH0 + U.ri(r, 0, 2);
      const m = 3 + Math.floor(r() * 3), rad = i === 1 ? 2200 + r() * 1200 : 5000 + r() * 20000, a0 = r() * 6.283, tilt = (r() - 0.5) * 0.3, pts: number[][] = [];
      for (let k = 0; k < m; k++) { const an = a0 + k * 6.283 / m + (r() - 0.5) * 0.4, rr = rad * (0.85 + r() * 0.3); pts.push([Math.cos(an) * rr, Math.sin(an) * rr * tilt + (r() - 0.5) * 300, Math.sin(an) * rr]); }
      mk(kind, sz, th, (ms.seed ^ Math.imul(i, 0x9e3779b1)) >>> 0 & 0x7fffffff, kind === 'wing', (kind === 'navy' ? 'NSV ' : kind === 'freighter' ? 'MV ' : 'CSV ') + SHIP_NAMES[(n0 + i * 5) % SHIP_NAMES.length],
        pts, kind === 'freighter' ? 35 + r() * 25 : kind === 'navy' ? 50 + r() * 30 : 60 + r() * 50, r() * 1e5);
    }
    return out;
  }
  /** Where a contact is at the zone's time t, and the way she's heading (her head comes round over the last and first of each leg). */
  function zonePos(c: { pts: number[][]; lens: number[]; total: number; speed: number; off: number }, t: number): { p: number[]; d: number[] } {
    let s = (t * c.speed + c.off) % c.total, k = 0;
    while (s > c.lens[k]) { s -= c.lens[k]; k = (k + 1) % c.lens.length; }
    const n = c.pts.length, a = c.pts[k], b = c.pts[(k + 1) % n], u = s / c.lens[k], turn = Math.min(0.5, 1500 / c.lens[k]);
    const dir = (p: number[], q: number[]) => { const x = q[0] - p[0], y = q[1] - p[1], z = q[2] - p[2], l = Math.hypot(x, y, z) || 1; return [x / l, y / l, z / l]; };
    let d = dir(a, b), w = 0, o = d;
    if (u > 1 - turn) { o = dir(b, c.pts[(k + 2) % n]); w = (u - (1 - turn)) / turn * 0.5; } else if (u < turn) { o = dir(c.pts[(k + n - 1) % n], a); w = (1 - u / turn) * 0.5; }
    if (w > 0) { d = [d[0] + (o[0] - d[0]) * w, d[1] + (o[1] - d[1]) * w, d[2] + (o[2] - d[2]) * w]; const l = Math.hypot(d[0], d[1], d[2]) || 1; d = [d[0] / l, d[1] / l, d[2] / l]; }
    return { p: [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u, a[2] + (b[2] - a[2]) * u], d };
  }
  /** What a ship's people wear, by her class (js/rig.ts create): a liner's are civilians, the big warships a navy's, the rest pirates'. */
  const wearOf = (size: string | null | undefined, obj?: string | null): string | null => (!size ? null : obj === 'hostage' ? 'pirate' : size === 'transport' ? 'civil' : size === 'large' || size === 'capital' ? 'navy' : 'pirate');
  /** ...aboard the ship being boarded now (null anywhere else). */
  const wearNow = (): string | null => { const g = (G as any).Game, sp = g && g.map && g.map.sp; return sp ? wearOf(sp.size, sp.obj) : null; };
  const SIZES: Record<SpSize, SpClass> = {
    transport: { name: 'civilian transport', tier: 1, pay: 600, diff: -1, guns: { pd: 0, cannon: 0, missile: 0 }, crew: { guard: 3, squads: 0, resp: 0, civ: 6 } },
    small: { name: 'corvette', tier: 2, pay: 900, diff: 0, guns: { pd: 1, cannon: 0, missile: 0 }, crew: { guard: 4, squads: 0, resp: 1, civ: 3 } },
    medium: { name: 'frigate', tier: 3, pay: 1700, diff: 1, guns: { pd: 2, cannon: 1, missile: 0 }, crew: { guard: 4, squads: 1, resp: 1, civ: 5 } },
    large: { name: 'cruiser', tier: 4, pay: 2800, diff: 2, guns: { pd: 3, cannon: 2, missile: 1 }, crew: { guard: 5, squads: 2, resp: 2, civ: 7 } },
    capital: { name: 'capital ship', tier: 5, pay: 4600, diff: 3, guns: { pd: 5, cannon: 3, missile: 2 }, crew: { guard: 6, squads: 4, resp: 3, civ: 10 } },
  };
  // the hull's weapons: what each does to the squad's ship (js/space.ts guns)
  const HULLGUN = { pd: { range: 1300, cool: [0.8, 1.7], dmg: 2.2 }, cannon: { range: 4500, cool: [3.5, 5.5], dmg: 10 }, missile: { range: 6500, cool: [9, 14], dmg: 24, speed: 230, turn: 0.85, life: 34 } };
  const OBJ: Record<SpObj, { name: string; pay: number; line: string }> = {
    artifact: { name: 'Recover the artifact', pay: 500, line: 'Something old and valuable is locked aboard. Find it, carry it back to your ship and get clear.' },
    hvt: { name: 'High value target', pay: 400, line: 'One of the ship\'s officers is wanted. Dead pays; in restraints pays half as much again.' },
    destruct: { name: 'Scuttle her', pay: 700, line: 'Reach the bridge, start the self-destruct, and be off the ship (yours, or one of her escape pods) before it runs out.' },
    hostage: { name: 'Retake the ship', pay: 600, line: 'Pirates have boarded her (their pods are still in her hull) and hold her people tied in one compartment. Clear every pirate off her: dead, down or in restraints. Each hostage alive at the end pays.' },
    visit: { name: 'Unlisted ship', pay: 0, line: 'Not the mission: a ship that happened to be passing. What is in her hold is worth carrying off. A breach is an attack: she will fight.' },
    assault: { name: 'Planetary assault', pay: 300, line: 'Land at the pad outside the base and bring it under control: every hostile down or in restraints.' },
  };
  const SHIP_NAMES = ['Calliope', 'Morrow', 'Ibex', 'Halcyon', 'Tantalus', 'Brightwater', 'Osprey', 'Vantongeren', 'Larkspur', 'Meridian', 'Oriel', 'Castellan', 'Wintermute', 'Anselm', 'Petrel', 'Corvid'];
  const WORLDS = ['Hesper IV', 'Tarn', 'Coldharbour', 'Vesta Minor', 'Ansible', 'Karst', 'Orrery', 'Low Meridian'];
  // The missions a visit to the base offers: six, from the visit's seed and how far the squad has got (level). The board
  // lets the squad take up to PICKS of them out together.
  const OFFERS = 6, PICKS = 3;
  function offers(seed: number, level: number): SpMission[] {
    const r = G.U.rng((seed ^ 0x5bace) >>> 0), U = G.U, out: SpMission[] = [];
    // what's about goes by how far the squad has got: transports and corvettes first, capital ships late
    const sizes: SpSize[] = level < 2 ? ['transport', 'transport', 'small'] : level < 3 ? ['transport', 'small', 'small', 'medium'] : level < 5 ? ['small', 'medium', 'medium', 'large'] : level < 7 ? ['medium', 'large', 'large', 'capital'] : ['large', 'capital', 'capital'];
    const planets = G.THEMES.map((T, i) => i).filter((i) => { const T = G.THEMES[i]; return !T.starter && !T.residents && !T.rock && T.layout !== 'festival' && T.layout !== 'houses' && !(T.from! > level + 1); });
    for (let i = 0; i < OFFERS; i++) {
      // (the fifth is always a ship taken by pirates: a civilian transport, whatever else is about)
      const assault = i === 2 || (i === 5 && r() < 0.5), taken = i === 4, size = assault ? null : taken ? 'transport' : i === 0 ? sizes[0] : U.pick(r, sizes);
      const obj: SpObj = assault ? 'assault' : taken ? 'hostage' : i === 0 ? 'artifact' : U.pick(r, ['artifact', 'hvt', 'destruct'] as SpObj[]);
      const rth = TH0 + U.ri(r, 0, THEMES.length - 1), th = assault ? U.pick(r, planets) : size === 'transport' ? TH0 + U.ri(r, 0, 1) : size === 'capital' ? TH0 + 2 : rth, T = themeAt(th)!;
      const other: SpSize | null = !assault && size !== 'capital' && r() < 0.4 ? (level >= 4 && r() < 0.35 ? 'small' : 'transport') : null;
      const wing = (size === 'small' || size === 'medium') && r() < 0.3; // (some corvettes and frigates are flying wings: two arms swept back from a glazed corner)
      const diff = Math.max(1, level + (size ? SIZES[size].diff : 1) + (r() < 0.3 ? 1 : 0) - (i === 0 ? 1 : 0));
      const pay = Math.round(((size ? SIZES[size].pay : 1300) + OBJ[obj].pay + 160 * diff) / 50) * 50;
      // its anchor: a direction off the golden angle, a little above or below the plane, 7 to 13 km out
      const a = i * 2.39996 + r() * 0.5, el = (r() - 0.5) * 0.7, d = 7000 + r() * 6000;
      const name = assault ? U.pick(r, WORLDS) : (T.name === 'Navy warship' ? 'NSV ' : T.name === 'Freighter' ? 'MV ' : 'CSV ') + U.pick(r, SHIP_NAMES);
      out.push({ i, kind: assault ? 'assault' : 'board', obj, size, th, seed: (r() * 2 ** 31) | 0, diff, pay, name, wing, where: assault ? T.name + ' on ' + name : T.name + ', ' + SIZES[size!].name + (wing ? ' (a flying wing)' : ''), brief: OBJ[obj].line + (other ? ' A ' + SIZES[other].name + ' is lying off her: nothing to do with the job, but she can be boarded.' : ''), other, night: assault && !T.night && r() < 0.25,
        ly: Math.round((3 + r() * 40) * 10) / 10, anchor: [Math.cos(a) * Math.cos(el) * d, Math.sin(el) * d, Math.sin(a) * Math.cos(el) * d] });
    }
    return out;
  }
  // A distance, written: metres under a kilometre, then kilometres, megametres, light-seconds; a jump's in light-years.
  function dist(m: number): string {
    m = Math.abs(m);
    if (m < 995) return Math.round(m) + ' m';
    if (m < 99950) return (m / 1000).toFixed(1) + ' km';
    if (m < 999500) return Math.round(m / 1000) + ' km';
    if (m < 2.5e8) return (m / 1e6).toFixed(m < 9.95e6 ? 2 : 1) + ' Mm';
    return (m / 299792458).toFixed(1) + ' ls';
  }
  const speed = (v: number) => (Math.abs(v) < 995 ? Math.round(Math.abs(v)) + ' m/s' : (Math.abs(v) / 1000).toFixed(2) + ' km/s');
  const eta = (s: number) => (!isFinite(s) || s > 5999 ? '--:--' : Math.floor(s / 60) + ':' + String(Math.floor(s % 60)).padStart(2, '0'));
  return { ON, FLOOR, HEAD, SHIPS, EQUIP, fleet0, cleanFleet, fitted, layout, seats, boxes, toWorld, toShip, aboard, HUB_BERTH, THEMES, TH0, themeAt, themeIndex, SIZES, HULLGUN, OBJ, OFFERS, PICKS, offers, dist, speed, eta, wearOf, wearNow, zone, zonePos };
})();
G.SpaceData = G_SpaceData;
interface GameModules { SpaceData: typeof G_SpaceData; }
