'use strict';
import { HANGAR_ROWS, THEMES as G_THEMES } from './data.js';
import { U as G_U } from './util.js';
import { Materials } from './materials.js';
import { Level } from './level.js';
import { World } from './world.js';
// what a class carries on her hull, and who's aboard her: light guards posted singly, security squads (four, armed and armoured), breach
// response squads (three, lighter: they come to where the hull is breached), and those who don't fight
interface SpClass { name: string; tier: number; pay: number; diff: number; guns: { pd: number; cannon: number; missile: number }; crew: { guard: number; squads: number; resp: number; civ: number } }
/** The squad's ship as she's laid out (js/spacedata.ts layout): three levels. Her frame: x to starboard, y up from her keel, z aft (her nose to -z). */
interface SpLayout {
  fw: number; tw: number; sw: number; hw: number; // half-widths: the cockpit, the breach tunnel, the staging space behind it, the crew deck
  zc: number; zt: number; zw: number; zk: number; zr: number; z1: number; // the collar, the tunnel's mouth, the low wall, the cockpit's back (the stairs' top), the stairs' foot (the crew deck's front), the tail
  FC: number; FB: number; FM: number; CC: number; CB: number; CM: number; // floors and ceilings: the cockpit, the breach deck, the crew deck
  lw: number; // the low wall's half-width (a clear way round it either side, straight on from the up flight)
  lift: number; // how far over her keel the breach deck's floor is above a deck she's breaching (her keel sits that much lower)
}
interface SpEquip { id: string; name: string; slot: 'turret' | 'util'; price: number; blurb: string; dmg?: number; rof?: number; range?: number }
export const SpaceData = (() => {
  // The game plays in space (the hangar is the base, missions are flown to). Off, it is the game as it was: a route map and a
  // helicopter. A debug start's ?play goes the old way whatever this says (js/debugstart.ts).
  const ON = true;
  const FLOOR = 0.24; // the deck of the squad's ship, over the ground it stands on (low enough to step up onto: World.STEP)
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
    // (the cockpit two rows long: the pilot, then the sensor station and the gunners side by side; the tunnel over it as short as leaves a
    // space to wait in behind the low wall; the crew deck no wider than its two walls of seats and the way between them want)
    const k = d.hw / 1.7, zc = d.z0 - d.nose - 0.5, zt = zc + 1.5, zk = zc + 3.5, zr = zk + 2.0, FB = 2.4; // (the tunnel 1.5 m: the staging space behind it deep enough to go round the low wall either side; the stairs 2 m long)
    return { fw: 1.25 * k, tw: 0.85, sw: 1.85 * k, hw: d.hw + 0.3 * k, zc, zt, zw: zt + 0.85, lw: 0.6, zk, zr, z1: zr + 4.6 + Math.max(0, d.jump - 4) * 0.48, FC: 0.15, FB, FM: 1.5, CC: 2.2, CB: FB + 2.2, CM: 3.9, lift: FB - FLOOR };
  }
  function seats(d: SpShipDef): SpSeat[] {
    const L = layout(d), F = L.FC;
    const s: SpSeat[] = [
      { k: 'helm', x: 0, y: F + 0.1, z: L.zc + 1.45, yaw: 0, f: F, sx: 0.75, sz: L.zc + 1.6 }, // (low: the glass floor ahead of it, and headroom over it)
    ];
    // behind the pilot on the left, the copilot at the sensor station (raised, eyes over the pilot's head); the gunner in the alcove under the
    // up flight, facing forward (a second gun's on the right of the second row)
    const zrw = L.zc + 2.55, ax = (-L.fw - 0.06) / 2;
    s.push({ k: 'sensors', x: -0.55, y: F + 0.42, z: zrw, yaw: 0, f: F, sx: -0.55, sz: zrw + 0.65 });
    for (let i = 0; i < d.turrets; i++) s.push(i === 0 ? { k: 'turret', n: i, x: ax, y: F + 0.1, z: L.zk + 0.45, yaw: 0, f: F, sx: ax + 0.05, sz: L.zk - 0.45 } : { k: 'turret', n: i, x: 0.55, y: F + 0.1, z: zrw, yaw: 0, f: F, sx: 0.55, sz: zrw + 0.65 });
    for (let i = 0; i < d.jump; i++) { const sd = i % 2 ? 1 : -1, z = L.zr + 1.4 + Math.floor(i / 2) * 0.95; s.push({ k: 'jump', x: sd * (L.hw - 0.4), y: L.FM, z, yaw: sd * Math.PI / 2, f: L.FM, sx: sd * (L.hw - 1.1), sz: z }); }
    return s;
  }
  // What stops you aboard, as boxes in the ship's frame: [x0, y0, z0, x1, y1, z1, tag]. Tags: 'nose' the breaching door (gone
  // while it's open), 'ramp' the rear door (the same), 'steps' the steps down off the open ramp (there only while it's open).
  type ShipBox = [number, number, number, number, number, number, string?];
  function boxes(d: SpShipDef): ShipBox[] {
    const L = layout(d), W = 0.2, { fw, tw, sw, hw, zc, zt, zw, lw, zk, zr, z1, FC, FB, FM, CC, CB, CM } = L, top = CB + W;
    // (each flight as many steps as keep a rise to 0.3 m, over the same run)
    const nU = Math.ceil((FB - FM) / 0.3 - 1e-6), nD = Math.ceil((FM - FC) / 0.3 - 1e-6), run = zr - zk, rD = run - 0.75; // (rD: the down flight's run, on the cockpit's deck most of a metre before its ceiling, so your head's under it as you come to it)
    const out: ShipBox[] = [
      // the cockpit: its deck (on to the foot of the down flight), its sides, the glass at its front, its back wall under the up flight
      [-fw - W, 0, zc + 0.3, fw + W, FC, zr], [-fw - W, FC, zc + 0.3, -fw, CC, zk], [fw, FC, zc + 0.3, fw + W, CC, zk], [-fw, FC, zc + 0.3, fw, CC, zc + 0.5],
      [-fw - W, CC, zc + 0.3, fw + W, CC + 0.2, zt], // (and its roof, under the tunnel)
      [-fw, FC, zc + 0.3, -fw + 0.24, FC + 0.55, zc + 3.1], [fw - 0.24, FC, zc + 0.3, fw, FC + 0.55, zc + 3.1], [-fw, FC, zc + 0.3, fw, FC + 0.55, zc + 0.57], // (the glass leans in toward its foot: kept off it there)
      // the breach deck: the tunnel's floor, sides and roof; the staging space's floor, sides, roof and the wall either side of the tunnel's mouth; the low wall
      [-tw - W, CC, zc, tw + W, FB, zt], [-tw - W, FB, zc, -tw, CB, zt], [tw, FB, zc, tw + W, CB, zt], [-tw - W, CB, zc, tw + W, top, zt],
      [-sw - W, CC, zt, sw + W, FB, zk], [-sw - W, FB, zt, -sw, CB, zk], [sw, FB, zt, sw + W, CB, zk], [-sw - W, CB, zt, sw + W, top, zk],
      [-sw, FB, zt - W, -tw, CB, zt], [tw, FB, zt - W, sw, CB, zt],
      [-lw, FB, zw, lw, FB + 1.0, zw + 0.25],
      [-sw, FB, zk - 0.05, -fw, CB, zk], [0.06, FB, zk - 0.05, sw, FB + 1.0, zk], // (the stairwell's rail on the right; the up flight comes in on the left)
      [-tw, FB, zc - W, tw, CB, zc, 'nose'],
      // the stairs: their sides and roof, the wall between the two flights
      [-fw - W, 0, zk, -fw, CB, zr], [fw, 0, zk, fw + W, CB, zr], [-fw - W, CB, zk, fw + W, top, zr], [-0.06, 0, zk, 0.06, FB + 0.9, zr],
      // the crew deck: the hold under it, its sides, roof, the bulkhead at its front either side of the stairs (and over them), the ramp
      [-hw - W, 0, zr, 0.06, FM, z1], [fw, 0, zr, hw + W, FM, z1], [0.06, 0, zr + rD / (nD - 1), fw, FM, z1], [0.06, 0, zr, fw, FM, zr + rD / (nD - 1), 'down'], // (the hold; the strip at the down flight's head its last tread)
      [-hw - W, FM, zr, -hw, CM, z1], [hw, FM, zr, hw + W, CM, z1], [-hw - W, CM, zr, hw + W, CM + W, z1], // (the crew deck's sides and roof)
      [-hw, FM, zr - W, -fw, CM, zr], [fw, FM, zr - W, hw, CM, zr], [-fw, CM, zr - 0.05, fw, CB, zr + 0.05],
      [-hw, FM, z1, hw, CM, z1 + W, 'ramp'],
    ];
    for (let i = 0; i < nD - 1; i++) out.push([0.06, 0, zr - rD * (i + 1) / (nD - 1), fw, FM - (FM - FC) * (i + 1) / nD, zr - rD * i / (nD - 1), 'down']); // down to the cockpit, on the right
    for (let i = 0; i < nU; i++) { const t = FM + (FB - FM) * (i + 1) / nU; out.push([-fw, t - 0.3, zr - run * (i + 1) / nU, -0.06, t, zr - run * i / nU, 'up']); } // up to the breach deck, on the left: treads, the gunner's alcove under them
    for (let i = 0; i < 4; i++) out.push([-hw + 0.3, 0, z1 + W + 0.38 * i, hw - 0.3, FM - 0.3 * (i + 1), z1 + W + 0.38 * (i + 1), 'steps']); // off the open ramp
    return out;
  }
  // Her flights of stairs, walked as slopes (js/world.ts rampAt, as a level's are): each across x0..x1, from its foot (zf, at y0) to its
  // head (zh, rise higher) in n treads; its steps are the boxes tagged with its tag (the last tread may be the deck it comes up to)
  function flights(d: SpShipDef) {
    const L = layout(d), { fw, zk, zr, z1, FC, FB, FM, hw } = L, W = 0.2;
    const nU = Math.ceil((FB - FM) / 0.3 - 1e-6), nD = Math.ceil((FM - FC) / 0.3 - 1e-6), rD = zr - zk - 0.75, tD = rD / (nD - 1);
    return [
      { tag: 'up', x0: -fw, x1: -0.06, zf: zr, zh: zk, y0: FM, rise: FB - FM, n: nU },
      { tag: 'down', x0: 0.06, x1: fw, zf: zr - rD, zh: zr - rD + nD * tD, y0: FC, rise: FM - FC, n: nD },
      { tag: 'steps', x0: -hw + 0.3, x1: hw - 0.3, zf: z1 + W + 1.52, zh: z1 + W + 1.52 - 5 * 0.38, y0: 0, rise: FM, n: 5 }, // (off the open ramp)
    ];
  }
  /** where she stands against a stretch of a ship's hull (js/shipgen.ts site: its middle, the way out of it), nose-on: her collar in the hole, her breach deck level with that deck.
   * s.ang: she came in that many degrees off square (an angled breach, up to BREACH_ANG): she lies at that angle, her collar's middle at the
   * same place, a crumpled tunnel from it into the hull (js/shipgen.ts tunnel) */
  // s.pt: she came in that many degrees nose up (- down), up to BREACH_PITCH: she lies tilted so, about her collar's middle (pt on the berth, radians)
  function berthAt(d: SpShipDef, s: { x: number; z: number; nx: number; nz: number; ang?: number; pt?: number }) {
    const TS = Level.TS, yaw = (s.nz > 0 ? 0 : s.nz < 0 ? Math.PI : s.nx > 0 ? Math.PI / 2 : -Math.PI / 2) + (s.ang || 0) * Math.PI / 180, L = layout(d), zN = L.zc - 0.22;
    const px = s.x + s.nx * (TS / 2 + 0.03), pz = s.z + s.nz * (TS / 2 + 0.03);
    const b = { x: px - zN * Math.sin(yaw), y: -L.lift, z: pz - zN * Math.cos(yaw), yaw, pt: (s.pt || 0) * Math.PI / 180 };
    if (!b.pt) return b;
    const yc = L.FB + 1.16, a = toWorld({ ...b, pt: 0 }, 0, yc, zN), t = toWorld(b, 0, yc, zN); // (her collar's middle where it'd be level: tilted, put back there)
    b.x += a.x - t.x; b.y += a.y - t.y; b.z += a.z - t.z;
    return b;
  }
  type Berth = { x: number; y: number; z: number; yaw: number; pt?: number };
  /** her solids in the world at berth b ([min x, y, z, max x, y, z] and the box's tag), those keep says */
  // (yb: lying at an angle that isn't a quarter turn, each a box turned with her: its middle, her yaw, its half-widths, its height. World.ybox makes it)
  // (ob: lying tilted, each a box turned and tilted with her: its middle, her yaw and pitch, its half-widths. World.obox makes it)
  function worldBoxes(d: SpShipDef, b: Berth, keep: (tag?: string) => boolean = () => true) {
    const out: { b: number[]; tag?: string; yb?: { cx: number; cz: number; yaw: number; hx: number; hz: number; y0: number; y1: number }; ob?: number[] }[] = [];
    const turned = Math.abs(Math.sin(2 * b.yaw)) > 1e-6, L = layout(d), zN = L.zc - 0.22, tp = Math.tan(b.pt || 0);
    for (let q of boxes(d)) {
      if (!keep(q[6])) continue;
      // (lying tilted: her collar's floor to just where it meets the hull's face, and its sides and roof on to the face wherever they cross it,
      // so there's no gap to step out of at the mouth, and no ledge into it)
      if (b.pt && q[2] === L.zc && q[5] === L.zt && q[6] === undefined) { q = q.slice() as ShipBox; q[2] = q[4] === L.FB ? zN + 1.16 * tp : Math.min(L.zc, zN - 1.3 * Math.abs(tp) - 0.1); }
      const a = toWorld(b, q[0], q[1], q[2]), c = toWorld(b, q[3], q[4], q[5]);
      if (b.pt) {
        const m = toWorld(b, (q[0] + q[3]) / 2, (q[1] + q[4]) / 2, (q[2] + q[5]) / 2), hx = Math.abs(q[3] - q[0]) / 2, hy = Math.abs(q[4] - q[1]) / 2, hz = Math.abs(q[5] - q[2]) / 2;
        const ob = [m.x, m.y, m.z, b.yaw, b.pt, hx, hy, hz], o = World.obox(ob[0], ob[1], ob[2], ob[3], ob[4], ob[5], ob[6], ob[7]);
        out.push({ tag: q[6], b: [...o.min, ...o.max], ob });
      } else if (turned) {
        const m = toWorld(b, (q[0] + q[3]) / 2, 0, (q[2] + q[5]) / 2), hx = Math.abs(q[3] - q[0]) / 2, hz = Math.abs(q[5] - q[2]) / 2, ex = Math.abs(hx * Math.cos(b.yaw)) + Math.abs(hz * Math.sin(b.yaw)), ez = Math.abs(hx * Math.sin(b.yaw)) + Math.abs(hz * Math.cos(b.yaw));
        out.push({ tag: q[6], b: [m.x - ex, Math.min(a.y, c.y), m.z - ez, m.x + ex, Math.max(a.y, c.y), m.z + ez], yb: { cx: m.x, cz: m.z, yaw: b.yaw, hx, hz, y0: Math.min(a.y, c.y), y1: Math.max(a.y, c.y) } });
      } else out.push({ tag: q[6], b: [Math.min(a.x, c.x), Math.min(a.y, c.y), Math.min(a.z, c.z), Math.max(a.x, c.x), Math.max(a.y, c.y), Math.max(a.z, c.z)] });
    }
    return out;
  }
  // her boxes and her flights as she's built, level and square (her own frame): a world for those aboard her while she lies tilted
  // (js/level.ts setTilt: they're moved in it), her nose shut behind her collar's mouth no more than it is docked (no nose, no steps out)
  function frameWorld(d: SpShipDef) {
    const W = World, w = W.create(), mat = Materials.SHIP;
    const fls = flights(d).map((fl) => ({ tag: fl.tag, axis: 'z', up: fl.zh > fl.zf ? 1 : -1, x0: Math.min(fl.x0, fl.x1), x1: Math.max(fl.x0, fl.x1), z0: Math.min(fl.zf, fl.zh), z1: Math.max(fl.zf, fl.zh), y0: fl.y0, rise: fl.rise, n: fl.n, f: 0, steps: [] as any[], on: true }));
    for (const q of boxes(d)) {
      if (q[6] === 'nose' || q[6] === 'steps') continue;
      const fl = fls.find((f) => f.tag === q[6]), s = W.add(w, W.box(q[0], q[1], q[2], q[3], q[4], q[5], fl ? { kind: 'step', stair: fl, mat } : { kind: 'prop', mat }));
      if (fl) fl.steps.push(s);
    }
    (w as any).ramps = fls.filter((f) => f.steps.length);
    return w;
  }
  // the most a breach may be off square (js/space.ts events), degrees; and nose up or down
  const BREACH_ANG = 45, BREACH_PITCH = 30;
  // a solid of hers (worldBoxes) made in the world's terms, o its kind
  const solidOf = (q: { b: number[]; yb?: any; ob?: number[] }, o: any) => q.ob ? World.obox(q.ob[0], q.ob[1], q.ob[2], q.ob[3], q.ob[4], q.ob[5], q.ob[6], q.ob[7], o)
    : q.yb ? World.ybox(q.yb.cx, q.yb.cz, q.yb.yaw, q.yb.hx, q.yb.hz, q.yb.y0, q.yb.y1, o) : World.box(q.b[0], q.b[1], q.b[2], q.b[3], q.b[4], q.b[5], o);
  // a point of the ship's frame in the world, the ship standing at berth b ({ x, y, z, yaw }: yaw as an officer's, 0 facing -z)
  // (b.pt: tilted that much nose up about her own x, then turned)
  function toWorld(b: Berth, lx: number, ly: number, lz: number) {
    const c = Math.cos(b.yaw), s = Math.sin(b.yaw);
    if (b.pt) { const cp = Math.cos(b.pt), sp = Math.sin(b.pt), y = ly * cp - lz * sp; lz = ly * sp + lz * cp; ly = y; }
    return { x: b.x + lx * c + lz * s, y: b.y + ly, z: b.z - lx * s + lz * c };
  }
  function toShip(b: Berth, wx: number, wy: number, wz: number) {
    const c = Math.cos(b.yaw), s = Math.sin(b.yaw), dx = wx - b.x, dz = wz - b.z;
    const x = dx * c - dz * s, y = wy - b.y, z = dx * s + dz * c;
    if (!b.pt) return { x, y, z };
    const cp = Math.cos(b.pt), sp = Math.sin(b.pt);
    return { x, y: y * cp + z * sp, z: -y * sp + z * cp };
  }
  // is this point of the world aboard (inside the hull's box)
  function aboard(d: SpShipDef, b: Berth, wx: number, wy: number, wz: number) {
    const p = toShip(b, wx, wy, wz);
    const L = layout(d);
    if (p.y < -0.2 || p.z < L.zc - 0.3 || p.z > L.z1 + 0.1) return false;
    return p.z < L.zr ? p.y < L.CB + 0.4 && Math.abs(p.x) < (p.y > L.CC - 0.1 ? (p.z < L.zt ? L.tw : L.sw) : L.fw) + 0.1 : p.y < L.CM + 0.4 && Math.abs(p.x) < L.hw + 0.05;
  }
  // Where the ship stands in the hangar (the pad in front of the hall: js/hangar.ts), nose to the west.
  const HUB_BERTH = { x: 27, y: 0, z: HANGAR_ROWS * 2 + 35, yaw: Math.PI / 2 };

  // ---- the places missions go to (the level's theme: js/level.ts generate, th from 1000 up)
  const THEMES: ThemeDef[] = [
    { name: 'Freighter', layout: 'ship', space: 1, noFog: true, winRate: 0, thru: 0.1, foes: 1.0, crowd: 1.2, home: 0, reflect: 0.3, floor: '#4a4e52', wall: '#868b8c', crate: '#b0702c', accent: '#e8922a', fog: 0x020306, light: 0xffe2c0, ceil: '#5a5f66', hemi: 0x8fa6c8, hemiI: 0.35, far: 30000 },
    { name: 'Corporate cutter', layout: 'ship', space: 1, noFog: true, winRate: 0, thru: 0.14, foes: 1.1, crowd: 0.8, home: 0, reflect: 0.4, floor: '#a9afb4', wall: '#dde2e4', crate: '#4f7896', accent: '#2fc6d6', fog: 0x020306, light: 0xeef4ff, ceil: '#cfd5d8', hemi: 0x9fb4d8, hemiI: 0.4, far: 30000 },
    { name: 'Navy warship', layout: 'ship', space: 1, noFog: true, winRate: 0, thru: 0.07, foes: 1.35, crowd: 0.4, home: 0, reflect: 0.3, floor: '#3a4149', wall: '#65717b', crate: '#566650', accent: '#d23a30', fog: 0x020306, light: 0xdfe8ff, ceil: '#4a525b', hemi: 0x8fa6c8, hemiI: 0.3, far: 30000 },
  ];
  const TH0 = 1000;
  const themeAt = (th: number | null | undefined): ThemeDef | null => (th == null ? null : th >= TH0 ? THEMES[th - TH0] || null : G_THEMES[th] || null);
  const themeIndex = (T: ThemeDef | null | undefined) => { if (!T) return -1; const i = G_THEMES.findIndex((q) => q.name === T.name); return i >= 0 ? i : THEMES.findIndex((q) => q.name === T.name) >= 0 ? TH0 + THEMES.findIndex((q) => q.name === T.name) : -1; };

  // ---- A mission's zone: a vast stretch of open space with the ship the mission is about under way in it (contact 0: bow
  // first, in a straight line, slowly) and now and then someone else passing (the rest: four or five, each on a wide loop of
  // its own; the first of them comes within a few kilometres). Any of them can be closed with and boarded (js/spaceserver.ts
  // 'tboard'): each is a ship of her own class, theme and seed, so she's the same ship whenever she's looked at.
  // The zone's frame: the mission ship's own at the moment the squad came out of the jump, its middle the origin.
  function zone(ms: { seed: number; size: SpSize | null; th: number; wing?: boolean; name: string }): SpContact[] {
    const r = G_U.rng((ms.seed ^ 0x20e5) >>> 0), U = G_U, out: SpContact[] = [];
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
  /** What her armed people are called aboard a ship, by whose she is (wearOf) and where they stand in her (js/server.ts titleOf): the
   *  officer the mission's after (hvt), her highest-ranked fighter (top, when that officer isn't aboard), a Leader (leader), anyone else
   *  leading a fireteam (tl), and the rest by what they are, the strongest of them (vet: the prefix) a step up. */
  const TITLES: Record<string, Record<string, string>> = {
    civil: { hvt: "Ship's Officer", top: 'Chief of Security', leader: 'Head of Security', tl: 'Security Lead', vet: 'Senior', rating: 'Crewman', suspect: 'Security Guard', grunt: 'Security Officer', rusher: 'Security Officer', heavy: 'Security Officer', marksman: 'Security Marksman' },
    pirate: { hvt: 'Pirate Captain', top: 'Pirate Captain', leader: 'First Mate', tl: 'Boatswain', vet: 'Veteran', rating: 'Deckhand', suspect: 'Pirate', grunt: 'Raider', rusher: 'Cutthroat', heavy: 'Brute', marksman: 'Sharpshooter' },
    navy: { hvt: 'Captain', top: 'Commander', leader: 'Lieutenant', tl: 'Sergeant', vet: 'Senior', rating: 'Rating', suspect: 'Sentry', grunt: 'Marine', rusher: 'Breacher', heavy: 'Heavy Marine', marksman: 'Marine Sharpshooter' },
  };
  /** ...aboard the ship being boarded now (null anywhere else). */
  const wearNow = (g: { map?: { sp?: { size: string; obj?: string | null } | null } | null } | null | undefined): string | null => { const sp = g && g.map && g.map.sp; return sp ? wearOf(sp.size, sp.obj) : null; }; // (g: the game; the page's files ask with ReplayEnv.Game, the export worker's has no map)
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
    const r = G_U.rng((seed ^ 0x5bace) >>> 0), U = G_U, out: SpMission[] = [];
    // what's about goes by how far the squad has got: transports and corvettes first, capital ships late
    const sizes: SpSize[] = level < 2 ? ['transport', 'transport', 'small'] : level < 3 ? ['transport', 'small', 'small', 'medium'] : level < 5 ? ['small', 'medium', 'medium', 'large'] : level < 7 ? ['medium', 'large', 'large', 'capital'] : ['large', 'capital', 'capital'];
    const planets = G_THEMES.map((T, i) => i).filter((i) => { const T = G_THEMES[i]; return !T.starter && !T.residents && !T.rock && T.layout !== 'festival' && T.layout !== 'houses' && !(T.from! > level + 1); });
    for (let i = 0; i < OFFERS; i++) {
      // (the fifth is always a ship taken by pirates: a civilian transport, whatever else is about)
      const assault = i === 2 || (i === 5 && r() < 0.5), taken = i === 4, size = assault ? null : taken ? 'transport' : i === 0 ? sizes[0] : U.pick(r, sizes);
      // (scuttling's a job against a navy or a pirate: never a civilian transport)
      const obj: SpObj = assault ? 'assault' : taken ? 'hostage' : i === 0 ? 'artifact' : U.pick(r, (size === 'transport' ? ['artifact', 'hvt'] : ['artifact', 'hvt', 'destruct']) as SpObj[]);
      const rth = TH0 + U.ri(r, 0, THEMES.length - 1), th = assault ? U.pick(r, planets) : size === 'transport' ? TH0 + U.ri(r, 0, 1) : size === 'capital' ? TH0 + 2 : rth, T = themeAt(th)!;
      void (!assault && size !== 'capital' && r() < 0.4 ? level >= 4 && r() < 0.35 : 0); const other: SpSize | null = null; // (no second ship lying off her any more: its draws kept, so every board's the same otherwise)
      const wing = (size === 'small' || size === 'medium') && r() < 0.3; // (some corvettes and frigates are flying wings: two arms swept back from a glazed corner)
      const diff = Math.max(1, level + (size ? SIZES[size].diff : 1) + (r() < 0.3 ? 1 : 0) - (i === 0 ? 1 : 0));
      const pay = Math.round(((size ? SIZES[size].pay : 1300) + OBJ[obj].pay + 160 * diff) / 50) * 50;
      // its anchor: a direction off the golden angle, a little above or below the plane, 7 to 13 km out
      const a = i * 2.39996 + r() * 0.5, el = (r() - 0.5) * 0.7, d = 7000 + r() * 6000;
      const name = assault ? U.pick(r, WORLDS) : (T.name === 'Navy warship' ? 'NSV ' : T.name === 'Freighter' ? 'MV ' : 'CSV ') + U.pick(r, SHIP_NAMES);
      // (a cruiser with a promenade court is a cruise liner, a civilian ship in the cutter's livery: below, once her seed's drawn)
      out.push({ i, kind: assault ? 'assault' : 'board', obj, size, th, seed: (r() * 2 ** 31) | 0, diff, pay, name, wing, where: assault ? T.name + ' on ' + name : T.name + ', ' + SIZES[size!].name + (wing ? ' (a flying wing)' : ''), brief: OBJ[obj].line, other, night: assault && !T.night && r() < 0.25,
        ly: Math.round((3 + r() * 40) * 10) / 10, anchor: [Math.cos(a) * Math.cos(el) * d, Math.sin(el) * d, Math.sin(a) * Math.cos(el) * d] });
      { const o = out[out.length - 1]; if (o.kind === 'board' && hallOf(o.seed, o.size) === 'mall') { o.th = TH0 + 1; o.name = 'SS ' + o.name.replace(/^\S+ /, ''); o.where = 'Cruise liner'; } }
    }
    return out;
  }
  // How a ship answers being boarded, by her size (js/spaceserver.ts doctrine): a transport or a corvette's is informal (her people
  // shelter, under guard), a frigate's and up practiced (her teams sweep for the squad); and as the mission board says it
  // Which hall two decks high a cruiser has, if any (js/shipgen.ts HALLS): from her seed alone, so every machine lays her out the
  // same without being told. Eight cruisers in ten have one: a hangar bay, an arboretum, machinery halls or (a cruise liner) a promenade court, as likely as each other.
  const HALL_KINDS: ShHallKind[] = ['bay', 'grove', 'works', 'mall'];
  // (what the terminal says of a cruiser that has one, and the objective's panel aboard her)
  const HALL_LINE: Record<ShHallKind, { brief: string; offer: string }> = {
    bay: { brief: 'a hangar bay', offer: 'Two decks, with a hangar bay right across her, open through both: a gallery round it looks down on its floor.' },
    grove: { brief: 'an arboretum', offer: 'Two decks, with an arboretum down her port side, open through both: a gallery round it looks down on its floor.' },
    mall: { brief: 'a promenade court', offer: 'A cruise liner. Two decks, with a promenade court right across her forward, open through both: shops, a fountain, a gallery round it looking down on its floor.' },
    works: { brief: 'machinery halls', offer: 'Two decks, with machinery halls fore and aft, open through both: a gallery round each looks down on its floor.' },
  };
  const hallOf = (seed: number, size: SpSize | null | undefined): ShHallKind | null => { if (size !== 'large') return null; const q = (Math.imul(seed ^ 0x5ca1ab1e, 0x9e3779b1) >>> 0) % 10; return q < 8 ? HALL_KINDS[q >> 1] : null; };
  const drill = (size: SpSize | null | undefined, wing = false): 'informal' | 'practiced' => (!wing && (!size || size === 'transport' || size === 'small') ? 'informal' : 'practiced'); // (a flying wing: a warship's crew, even a corvette's, with her own security office: js/shipgen.ts wingDeck)
  const DRILL_LINE = {
    informal: 'Her breach response is informal: her people shelter in her safest compartment, under guard, and nobody comes looking for you.',
    practiced: 'Her breach response is practiced: her teams sweep the ship for you, on her security cameras while someone is at them.',
  };
  const drillLine = (m: SpMission) => (m.kind === 'board' && m.obj !== 'hostage' ? DRILL_LINE[drill(m.size, !!m.wing)] : ''); // (a pirate-held ship answers nobody)
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
  return { hallOf, HALL_KINDS, HALL_LINE, BREACH_ANG, BREACH_PITCH, solidOf, frameWorld, ON, FLOOR, HEAD, SHIPS, EQUIP, fleet0, cleanFleet, fitted, layout, seats, boxes, flights, berthAt, worldBoxes, toWorld, toShip, aboard, HUB_BERTH, THEMES, TH0, themeAt, themeIndex, SIZES, HULLGUN, OBJ, OFFERS, PICKS, offers, drill, drillLine, dist, speed, eta, wearOf, TITLES, wearNow, zone, zonePos };
})();
