'use strict';
// Ships to board, as a level's layout (js/level.ts plan takes it as it takes a warehouse's or a house's): decks on the
// coarse grid, bow to the west, stern to the east.
//   A deck: a room across the bow (the bridge, on her top deck); a spine corridor aft from its door to the room across the
//   stern (the engine room; the reactor over it); compartments off the spine to port (north) and starboard (south), a
//   bulkhead between each and the next. A big ship's deeper sides are split in two: a compartment on the spine and another
//   behind it against the hull, reached through the first.
//   Everything outside a hull is open space (tile 5, open to the sky, the floor 300 m down: nothing drawn, nothing to stand
//   on), with room all round for the squad's ship to stand nose-on to any side of her.
// Her class (SpSize: js/spacedata.ts SIZES) is what she is: a civilian transport, a corvette, a frigate, a cruiser, a
// capital ship. What compartments she has goes by it (PROGRAM), and a capital ship has TWO decks, the same hull on both,
// stairwells between them (js/level.ts stack, as a building's storeys).
// A level can hold a second ship, nothing to do with the mission (sp.other: a transport or a corvette lying off the
// target's port side), to be boarded or left alone.
// finish(map, lay), after the plan: what the mission needs of the finished map (map.sp).
type ShRole = 'bridge' | 'engine' | 'reactor' | 'cargo' | 'quarters' | 'barracks' | 'mess' | 'galley' | 'medbay' | 'armoury' | 'magazine' | 'vault' | 'brig' | 'pods' | 'spine' | 'stairs';
interface ShSlot { rm: LvRoom; pos: number; side: number; deep: boolean; inner: LvRoom | null; door: number[]; x: number }
interface ShSeg { x: number; w: number; d: number[]; split: boolean[]; stair: boolean }
interface ShSk { size: SpSize; len: number; sw: number; dmax: number; W: number; H: number; zc: number; segs: ShSeg[] }
interface ShPt { x: number; z: number; y: number }
// a stretch of hull a ship can breach: three cells of its wall (c the middle one), the way out of her (nx, nz), the wall's middle there
interface ShSite { c: number; nx: number; nz: number; x: number; z: number; cells: number[] }
interface ShHull { x0: number; z0: number; x1: number; z1: number; zc: number; main: boolean; size: SpSize }
interface ShMeta { size: SpSize; obj: SpObj | null; decks: number; other: SpSize | null; breach: { x: number; z: number; face: number; door: number; room: number }; sites?: ShSite[]; cuts: number[][]; locks: Record<number, string>; roles: (ShRole | null)[];
  hullOf: number[]; console: ShPt | null; artifact: ShPt | null; pods: ShPt[]; salvage: ShPt[]; hullWin: Record<number, number>; hvtRoom: number; cardRooms: Record<string, number>; hull: ShHull; hulls: ShHull[] }
const G_ShipGen = (() => {
  // her frame by class: the spine's length (tiles), its width, how deep her sides are, the bow and stern rooms, how often a deep side is split
  const SPEC: Record<SpSize, { len: number[]; sw: number; dep: number[]; bw: number; bd: number; ew: number; ed: number; split: number; big: number; decks: number }> = {
    transport: { len: [7, 9], sw: 1, dep: [2, 2], bw: 2, bd: 1, ew: 2, ed: 1, split: 0, big: 1, decks: 1 },
    small: { len: [10, 12], sw: 1, dep: [2, 3], bw: 3, bd: 1, ew: 3, ed: 1, split: 0, big: 1, decks: 1 },
    medium: { len: [19, 23], sw: 2, dep: [3, 4], bw: 4, bd: 2, ew: 4, ed: 2, split: 0, big: 1.5, decks: 1 },
    large: { len: [31, 36], sw: 2, dep: [5, 6], bw: 5, bd: 3, ew: 5, ed: 3, split: 0.65, big: 2.2, decks: 1 },
    capital: { len: [44, 50], sw: 2, dep: [5, 6], bw: 6, bd: 3, ew: 6, ed: 3, split: 0.7, big: 3, decks: 2 },
  };
  // what she has, deck by deck, most wanted first ([role, where along her it would rather be: 0 the bow, 1 the stern]). The
  // hold the breach is suggested at is apart from these. What's left over is a hold, a cabin or a mess.
  const PROGRAM: Record<string, [ShRole, number | null][]> = {
    'transport:0': [['quarters', 0.2], ['mess', null], ['cargo', 0.8]],
    'small:0': [['quarters', 0.1], ['mess', null], ['cargo', 0.8]],
    'medium:0': [['armoury', 0.3], ['barracks', null], ['mess', null], ['medbay', null], ['quarters', 0], ['magazine', 0.9], ['pods', 0.5], ['cargo', null]],
    'large:0': [['armoury', 0.35], ['vault', 0.5], ['barracks', null], ['mess', null], ['galley', null], ['medbay', null], ['quarters', 0], ['magazine', 0.85], ['reactor', 1], ['pods', 0.5], ['brig', null], ['barracks', null], ['quarters', 0.1], ['magazine', 0.2], ['pods', 0.7]],
    'capital:0': [['armoury', 0.35], ['vault', 0.55], ['barracks', 0.25], ['barracks', 0.7], ['magazine', 0.9], ['magazine', 0.15], ['brig', null], ['medbay', null], ['pods', 0.5], ['cargo', null], ['barracks', null], ['cargo', null], ['magazine', 0.5]],
    'capital:1': [['quarters', 0.05], ['armoury', 0.2], ['mess', 0.5], ['galley', 0.55], ['medbay', null], ['barracks', 0.8], ['pods', 0.4], ['quarters', 0.15], ['quarters', null], ['pods', 0.75], ['mess', null], ['barracks', null], ['quarters', null]],
  };
  const FILL: ShRole[] = ['cargo', 'quarters', 'mess', 'cargo', 'barracks'];
  const MX = 12, MZ0 = 12, MZB = 12, GAP = 22; // (open space all round a hull, and between two)

  // a hull's frame: the same for every deck of her
  function skeleton(r: LvRng, size: SpSize): ShSk {
    const U = G.U, S = SPEC[size], len = U.ri(r, S.len[0], S.len[1]), dmax = S.dep[1], sw = S.sw, segs: ShSeg[] = [];
    const stairs = S.decks > 1 ? [Math.round(len * 0.28), Math.round(len * 0.68)] : [];
    for (let x = 0; x < len;) {
      const stair = stairs.length > 0 && x >= stairs[0] && len - x >= 6;
      if (stair) stairs.shift();
      let w = stair ? 5 : U.ri(r, 3, size === 'small' || size === 'transport' ? 4 : 5);
      if (len - (x + w) < 4) w = len - x;
      const first = x === 0, last = x + w >= len && size !== 'small' && size !== 'transport';
      const d = [0, 1].map(() => Math.max(2, U.ri(r, S.dep[0], S.dep[1]) - (first || last ? 1 : 0)));
      segs.push({ x, w, d, split: d.map((q, k) => q >= 5 && !(stair && k === 0) && r() < S.split), stair });
      x += w + 1;
    }
    return { size, len, sw, dmax, W: 1 + S.bw + 1 + len + 1 + S.ew + 1, H: 1 + dmax + 1 + sw + 1 + dmax + 1, zc: 1 + dmax + 1, segs };
  }
  interface Ctx { W: number; H: number; t: Uint8Array; out: Uint8Array; rooms: LvRoom[]; doors: LvDoorSpec[]; locks: [number, number, string][]; glass: any[]; entries: number[][] }
  // one deck of a hull, carved into the grid at (ox, oz). f: which deck, of n. hi: which hull (0 the mission's).
  function deck(c: Ctx, sk: ShSk, ox: number, oz: number, f: number, n: number, r: LvRng, hi: number, stairs: any[]) {
    const U = G.U, L = G.Level, S = SPEC[sk.size], { W, t, out, rooms, doors, locks } = c, sw = sk.sw, zc = oz + sk.zc, top = f === n - 1;
    const carve = (x: number, z: number, w: number, h: number, role: ShRole) => {
      for (let j = z - 1; j <= z + h; j++) for (let i = x - 1; i <= x + w; i++) {
        const k = j * W + i, inside = i >= x && i < x + w && j >= z && j < z + h;
        if (inside) { t[k] = 0; out[k] = 0; } else if (t[k] === 5) { t[k] = 1; out[k] = 0; }
      }
      const rm = L._room(x, z, w, h, { type: role === 'stairs' ? 'landing' : role, ship: role, hull: hi, stairs: role === 'stairs' }); rooms.push(rm);
      return rm;
    };
    const door = (x: number, z: number, axis: LvAxis, lock?: string | null, mirror?: boolean) => {
      doors.push([x, z, axis, !lock && r() < 0.15, !!mirror, lock ? 'blast' : 'slide']); // (a ship's doors slide: js/level.ts slides)
      if (lock) locks.push([x, z, lock]);
    };
    const bx0 = ox + 1, sx0 = bx0 + S.bw + 1, sx1 = sx0 + sk.len - 1, ex0 = sx1 + 2;
    // the bow room (the bridge on her top deck; under it on a ship of two, the forward magazine), the spine, the stern room
    const bow = carve(bx0, zc - S.bd, S.bw, sw + 2 * S.bd, top ? 'bridge' : 'magazine');
    const spine = carve(sx0, zc, sk.len, sw, 'spine');
    carve(ex0, zc - S.ed, S.ew, sw + 2 * S.ed, f === 0 ? 'engine' : 'reactor');
    const bridgeLock = top && sk.size !== 'small' && sk.size !== 'transport' ? 'bridge' : null;
    for (let k = 0; k < sw; k++) { door(sx0 - 1, zc + k, 'x', bridgeLock, k > 0); door(sx1 + 1, zc + k, 'x', null, k > 0); }
    const slots: ShSlot[] = [];
    sk.segs.forEach((sg, si) => {
      const x = sx0 + sg.x, w = sg.w, pos = sk.segs.length > 1 ? si / (sk.segs.length - 1) : 0.5;
      [-1, 1].forEach((side, k) => {
        const d = sg.d[k], dx = x + U.ri(r, 0, w - 1), z0 = side < 0 ? zc - 1 - d : zc + sw + 1, wallZ = side < 0 ? zc - 1 : zc + sw;
        if (sg.stair && k === 0) {
          // a stairwell: the flight along its hull side, climbing aft; over it on the deck above, the drop, and where you come up
          carve(x, z0, w, d, 'stairs');
          for (let i = x + 1; i <= x + 3; i++) t[z0 * W + i] = f === 0 ? 6 : 5;
          if (f === 0) stairs.push({ f: 0, x0: x + 1, z0, x1: x + 3, z1: z0, axis: 'x', up: 1 }); else c.entries.push([x + 4, z0]);
          door(x + (w >> 1), wallZ, 'z');
          return;
        }
        if (sg.split[k]) {
          const di = 2, zi = side < 0 ? zc - 1 - di : zc + sw + 1, zo = side < 0 ? z0 : zi + di + 1, ho = d - di - 1;
          const inner = carve(x, zi, w, di, 'cargo'), outer = carve(x, zo, w, ho, 'cargo');
          slots.push({ rm: inner, pos, side, deep: false, inner: null, door: [dx, wallZ], x }, { rm: outer, pos, side, deep: true, inner, door: [x + U.ri(r, 0, w - 1), side < 0 ? zi - 1 : zi + di], x });
        } else slots.push({ rm: carve(x, z0, w, d, 'cargo'), pos, side, deep: false, inner: null, door: [dx, wallZ], x });
      });
    });
    // who gets which: the hold the breach is suggested at first (her lowest deck: starboard, amidships, against the hull), then the programme
    const free = slots.slice(), take = (s: ShSlot, role: ShRole) => { free.splice(free.indexOf(s), 1); s.rm.type = role as RoomType; s.rm.ship = role; if (role === 'armoury') s.rm.lootRoom = true; return s; };
    let hold: ShSlot | null = null;
    if (f === 0) hold = take(free.filter((s) => s.side > 0 && !slots.some((o) => o.inner === s.rm)).sort((a, b) => Math.abs(a.pos - 0.5) - Math.abs(b.pos - 0.5) || rooms.indexOf(a.rm) - rooms.indexOf(b.rm))[0], 'cargo');
    for (const [role, pref] of PROGRAM[sk.size + ':' + f] || PROGRAM[sk.size + ':0']) {
      if (!free.length) break;
      const deepWant = role === 'vault' || role === 'reactor' || role === 'magazine';
      const sc = (s: ShSlot) => (pref == null ? 0 : Math.abs(s.pos - pref) * 2) + (deepWant && !s.deep ? 0.6 : 0) + ((role === 'pods' || role === 'medbay' || role === 'mess') && s.deep ? 1.5 : 0) + r() * 0.5;
      take(free.map((s) => [sc(s), s] as [number, ShSlot]).sort((a, b) => a[0] - b[0])[0][1], role);
    }
    for (const s of free.slice()) take(s, U.pick(r, FILL));
    const locked = (rm: LvRoom) => rm.ship === 'armoury' || rm.ship === 'vault';
    for (const s of slots) door(s.door[0], s.door[1], 'z', s.rm.ship === 'armoury' ? 'armory' : s.rm.ship === 'vault' ? 'bridge' : null);
    for (let i = 0; i + 1 < sk.segs.length; i++) for (const side of [-1, 1]) {
      const a = slots.filter((s) => s.side === side && s.x === sx0 + sk.segs[i].x), b = slots.filter((s) => s.side === side && s.x === sx0 + sk.segs[i + 1].x);
      for (const p of a) for (const q of b) {
        const z0 = Math.max(p.rm.z, q.rm.z), z1 = Math.min(p.rm.z + p.rm.h, q.rm.z + q.rm.h) - 1;
        if (z1 < z0 || locked(p.rm) || locked(q.rm) || r() > 0.3) continue;
        door(p.rm.x + p.rm.w, U.ri(r, z0, z1), 'x');
      }
    }
    // the spine's cover: on a two-wide spine a crate against one side or the other every few tiles (never in front of a door),
    // and at each bulkhead a rib that narrows it to one
    if (sw === 2) {
      const doorNear = (x: number, z: number) => doors.some(([dx, dz]) => Math.abs(dx - x) <= 1 && Math.abs(dz - z) <= 1);
      sk.segs.forEach((sg, si) => {
        const k = si & 1, x = sx0 + sg.x, cx = x + (sg.w >> 1), cz = zc + k;
        if (!doorNear(cx, cz) && r() < 0.8) (spine.cover = spine.cover || []).push(['crates', (cx + 0.5) * L.CTS, (cz + 0.5) * L.CTS + (k ? 0.25 : -0.25), U.ri(r, 0, 3), null]);
        const rx = x + sg.w;
        if (rx <= sx1 && !doorNear(rx, zc + 1 - k)) t[(zc + 1 - k) * W + rx] = 1;
      });
    }
    // the bridge's windows: glass the whole width of its bow wall
    if (top) c.glass.push({ x0: bx0 - 1, x1: bx0 - 1, z0: bow.z, z1: bow.z + bow.h - 1, v: 1, sill: 0.8, top: 2.7 });
    const st = rooms.find((q) => q.ship === 'stairs' && (q as any).hull === hi) || spine;
    return { hold: hold ? hold.rm : null, breach: hold ? [hold.rm.cx, hold.rm.z + hold.rm.h] : null, stairs: st };
  }

  function lay(r: LvRng, _level: number, sp: SpGen | null): LvLay {
    const U = G.U, size: SpSize = (sp && sp.size && SPEC[sp.size] ? sp.size : 'small'), S = SPEC[size], main = skeleton(r, size);
    const osz = sp && sp.other && SPEC[sp.other] && S.decks === 1 ? sp.other : null, other = osz ? skeleton(r, osz) : null;
    const W = 2 * MX + Math.max(main.W, other ? other.W : 0), H = MZ0 + (other ? other.H + GAP : 0) + main.H + MZB;
    const mo = [MX, MZ0 + (other ? other.H + GAP : 0)], oo = other ? [MX + U.ri(r, 0, Math.max(0, main.W - other.W)), MZ0] : [0, 0];
    const stairs: any[] = [], floors: LvLay[] = [], locks: [number, number, number, string][] = [];
    let breach: number[] = [0, 0];
    for (let f = 0; f < S.decks; f++) {
      const c: Ctx = { W, H, t: new Uint8Array(W * H).fill(5), out: new Uint8Array(W * H).fill(1), rooms: [], doors: [], locks: [], glass: [], entries: [] };
      const m = deck(c, main, mo[0], mo[1], f, S.decks, r, 0, stairs);
      if (m.breach) breach = m.breach;
      if (other && f === 0) deck(c, other, oo[0], oo[1], 0, 1, r, 1, []);
      for (const [x, z, k] of c.locks) locks.push([f, x, z, k]);
      floors.push({ W, H, t: c.t, rooms: c.rooms, out: c.out, doors: c.doors, glass: c.glass, spawn: f === 0 ? m.hold : m.stairs, entries: c.entries.length ? c.entries : null, chasm: 300 });
    }
    const hull = (sk: ShSk, o: number[], isMain: boolean): any => ({ x0: o[0], z0: o[1], x1: o[0] + sk.W - 1, z1: o[1] + sk.H - 1, zc: o[1] + sk.zc + sk.sw / 2, main: isMain, size: sk.size });
    const src = { size, obj: (sp && sp.obj) || null, decks: S.decks, other: osz, locks, breach, hulls: [hull(main, mo, true)].concat(other ? [hull(other, oo, false)] : []) };
    if (S.decks === 1) return Object.assign(floors[0], { sp: src });
    return { floors, stairs, sp: src } as unknown as LvLay;
  }

  // After the plan (and the stacking of her decks): map.sp
  function finish(map: LvMap, lay: LvLay) {
    const L = G.Level, TS = L.TS, CT = L.CTS, src = (lay as any).sp, S = SPEC[src.size as SpSize], floors = map.floors || [map];
    const fl = (rm: { fl?: number }) => floors[rm.fl || 0], roles = map.rooms.map((rm) => (rm.ship as ShRole) || null), hullOf = map.rooms.map((rm) => (rm as any).hull || 0);
    const locks: Record<number, string> = {};
    for (const [f, x, z, key] of src.locks as [number, number, number, string][]) {
      let best: LvDoor | null = null, bd = 1.2;
      for (const d of map.doors) { if ((d.fl || 0) !== f) continue; const q = Math.hypot(d.x - (x + 0.5) * CT, d.z - (z + 0.5) * CT); if (q < bd) { bd = q; best = d; } }
      if (best) locks[best.id] = key;
    }
    const mid = (i: number) => { const rm = map.rooms[i]; return { x: (rm.cx + 0.5) * TS, z: (rm.cz + 0.5) * TS }; };
    const room = (role: ShRole, far?: { x: number; z: number }, hull = 0) => {
      let best = -1, bd = -1;
      map.rooms.forEach((rm, i) => { if (roles[i] !== role || hullOf[i] !== hull) return; const m = mid(i), d = far ? Math.hypot(m.x - far.x, m.z - far.z) + (rm.fl || 0) * 30 : 1; if (d > bd) { bd = d; best = i; } });
      return best;
    };
    // a clear cell of a room, the nearest its middle (or to a point of it), in metres
    const clearIn = (ri: number, wx?: number, wz?: number): ShPt | null => {
      const rm = map.rooms[ri]; if (!rm) return null;
      const fm = fl(rm), W = fm.W, t = fm.t, mx = wx != null ? wx / TS : rm.x + rm.w / 2, mz = wz != null ? wz / TS : rm.z + rm.h / 2;
      let best: ShPt | null = null, bd = 1e9;
      for (let z = rm.z; z < rm.z + rm.h; z++) for (let x = rm.x; x < rm.x + rm.w; x++) {
        const i = z * W + x; if (t[i] !== 0 || fm.props.has(i)) continue;
        let ok = true; for (const j of [i - 1, i + 1, i - W, i + W]) if (t[j] === 3 || t[j] === 5) ok = false;
        const d = Math.hypot(x + 0.5 - mx, z + 0.5 - mz);
        if (ok && d < bd) { bd = d; best = { x: (x + 0.5) * TS, z: (z + 0.5) * TS, y: fm.fy || 0 }; }
      }
      return best;
    };
    // where the breach is suggested (the hold's hull, amidships to starboard): the wall's middle line there. She can be breached anywhere (sites).
    const [bx, bz] = src.breach as number[], bri = map.rooms.indexOf(map.spawnRoom), bzc = (bz * L.K + 1.5) * TS;
    const breach = { x: (bx + 0.5) * CT, z: bzc, face: bzc + TS / 2, door: -1, room: bri };
    const bridge = room('bridge'), vault = room('vault'), at = { x: breach.x, z: breach.z };
    // the artifact: in the vault if she has one, else the hold or cabin furthest from the breach
    let ar = vault;
    if (ar < 0) { let bd2 = -1; map.rooms.forEach((rm, i) => { if (i === bri || hullOf[i] || !roles[i] || !['cargo', 'quarters', 'magazine', 'barracks'].includes(roles[i]!)) return; const m = mid(i), d = Math.hypot(m.x - at.x, m.z - at.z); if (d > bd2) { bd2 = d; ar = i; } }); }
    const brm = map.rooms[bridge], cons = brm ? clearIn(bridge, (brm.x + 1.5) * TS, (brm.z + brm.h / 2) * TS) : null;
    const hulls: ShHull[] = src.hulls.map((h: ShHull) => ({ x0: h.x0 * CT, z0: h.z0 * CT, x1: (h.x1 + 1) * CT, z1: (h.z1 + 1) * CT, zc: h.zc * CT, main: h.main, size: h.size }));
    const pods: ShPt[] = [], salvage: ShPt[] = [];
    map.rooms.forEach((rm, i) => {
      // a ship that isn't the mission's: what's worth carrying off is in her hold
      if (hullOf[i] && roles[i] === 'cargo' && salvage.length < 2) { const c = clearIn(i); if (c) salvage.push(c); }
      if (roles[i] !== 'pods' || hullOf[i]) return;
      // against the hull side of the room (the side away from the spine), up to three hatches
      const south = (rm.cz + 0.5) * TS > hulls[0].zc, z = south ? (rm.z + rm.h - 0.5) * TS : (rm.z + 0.5) * TS;
      for (let k = 0; k < 3; k++) { const x = (rm.x + (k + 0.5) * rm.w / 3) * TS, c = clearIn(i, x, z); if (c && !pods.some((p) => Math.hypot(p.x - c.x, p.z - c.z) < 1 && p.y === c.y)) pods.push(c); }
    });
    // the windows in the hull (a pane with open space on one side): which room each lets the air out of
    const hullWin: Record<number, number> = {};
    for (const w of map.windows) {
      if (w.ext || !w.cells || !w.cells.length || w.nx == null) continue;
      const fm = floors[w.fl || 0], W = fm.W, t = fm.t, c = w.cells[0], a = c - w.nx - w.nz * W, b = c + w.nx + w.nz * W, inner = t[a] === 5 && fm.out[a] ? b : t[b] === 5 && fm.out[b] ? a : -1;
      if (inner < 0) continue;
      const x = inner % W, z = (inner / W) | 0, ri = map.rooms.findIndex((rm) => (rm.fl || 0) === (w.fl || 0) && x >= rm.x - 1 && x <= rm.x + rm.w && z >= rm.z - 1 && z <= rm.z + rm.h);
      if (ri >= 0) hullWin[w.id] = ri;
    }
    // the keycards' carriers start in: the bridge's with the watch officers (a cabin, the mess), the armoury's in the barracks
    const cardRooms: Record<string, number> = {};
    if (Object.values(locks).includes('bridge')) cardRooms.bridge = room('quarters', at) >= 0 ? room('quarters', at) : room('mess', at);
    if (Object.values(locks).includes('armory')) cardRooms.armory = room('barracks', at) >= 0 ? room('barracks', at) : room('mess', at);
    const sp: ShMeta = { size: src.size, obj: src.obj, decks: src.decks, other: src.other, breach, cuts: [], locks, roles, hullOf, console: cons, artifact: ar >= 0 ? clearIn(ar) : null, pods, salvage, hullWin, hvtRoom: bridge, cardRooms, hull: hulls[0], hulls };
    map.sp = sp;
    map.theme = Object.assign({}, map.theme, { big: S.big });
    return map;
  }
  // which room of a ship a point is in (its walls with it) on deck fl, or -1
  function roomAt(map: LvMap, x: number, z: number, fl = 0) {
    const TS = G.Level.TS, cx = x / TS, cz = z / TS;
    let best = -1, bd = 1e9;
    map.rooms.forEach((rm, i) => { if ((rm.fl || 0) !== fl || cx < rm.x - 1 || cx > rm.x + rm.w + 1 || cz < rm.z - 1 || cz > rm.z + rm.h + 1) return; const d = Math.max(Math.abs(cx - (rm.x + rm.w / 2)) - rm.w / 2, Math.abs(cz - (rm.z + rm.h / 2)) - rm.h / 2); if (d < bd) { bd = d; best = i; } });
    return best;
  }
  // ---- breaching her anywhere (her lowest deck: the squad's ship stands level with it). A site: three cells in a row of the
  // hull's wall (two metres), the way in clear behind the middle of it and open space in front, with room out there for a
  // ship to stand nose-on. Worked out once.
  function sites(map: LvMap): ShSite[] {
    const sp = map.sp!; if (sp.sites) return sp.sites;
    const { W, H, t } = map, TS = G.Level.TS, out: ShSite[] = [], win = map.winAt as Map<number, unknown> | undefined;
    const at = (x: number, z: number) => (x < 0 || z < 0 || x >= W || z >= H ? -1 : t[z * W + x]);
    const free = (x: number, z: number) => at(x, z) === 0 && !map.props.has(z * W + x);
    for (let z = 2; z < H - 2; z++) for (let x = 2; x < W - 2; x++) {
      if (t[z * W + x] !== 1) continue;
      for (const [nx, nz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const ax = nz ? 1 : 0, az = nx ? 1 : 0; let ok = true;
        // (the way in clear behind the middle of it; what stands against the wall either side can stay)
        for (let k = -1; k <= 1 && ok; k++) { const cx = x + ax * k, cz = z + az * k, in1 = at(cx - nx, cz - nz); ok = at(cx, cz) === 1 && !(win && win.has(cz * W + cx)) && in1 !== 1 && in1 !== 5 && in1 !== 3 && in1 !== 7 && in1 !== 6 && at(cx + nx, cz + nz) === 5; }
        ok = ok && free(x - nx, z - nz) && free(x - 2 * nx, z - 2 * nz);
        // (out there: the collar's width at the hull, her cabin's behind it, her engine pods' from ten metres out)
        for (let d = 1; d <= 33 && ok; d++) for (let w = d <= 5 ? 3 : d <= 14 ? 5 : 7, k = -w; k <= w && ok; k++) ok = at(x + nx * d + ax * k, z + nz * d + az * k) === 5;
        if (ok) out.push({ c: z * W + x, nx, nz, x: (x + 0.5) * TS, z: (z + 0.5) * TS, cells: [-1, 0, 1].map((k) => (z + az * k) * W + x + ax * k) });
      }
    }
    return (sp.sites = out);
  }
  const siteOf = (map: LvMap, c: number, nx: number, nz: number) => sites(map).find((s) => s.c === c && s.nx === nx && s.nz === nz) || null;
  // The hull cut through at a site: its three cells are floor now, and the wall there is gone up to a door's height (the
  // world's wall boxes that cross it are cut round the opening). The same on the host and on every screen.
  function cut(map: LvMap, s: ShSite) {
    const sp = map.sp!, TS = G.Level.TS, W = map.W, w = map.world, Wd = G.World;
    if (sp.cuts.some((q) => q[0] === s.c && q[1] === s.nx)) return false;
    sp.cuts.push([s.c, s.nx, s.nz]); sp.sites = undefined;
    let x0 = 1e9, z0 = 1e9, x1 = -1e9, z1 = -1e9;
    for (const c of s.cells) { map.t[c] = 0; const x = c % W, z = (c / W) | 0; x0 = Math.min(x0, x * TS); z0 = Math.min(z0, z * TS); x1 = Math.max(x1, (x + 1) * TS); z1 = Math.max(z1, (z + 1) * TS); }
    const H0 = [x0, -0.6, z0], H1 = [x1, G.Level.DOOR_H + 0.1, z1], hit: any[] = [];
    Wd.query(w, [x0 + 0.01, 0.1, z0 + 0.01], [x1 - 0.01, 2, z1 - 0.01], (q: any) => { if (q.kind === 'wall' && !q.edge) hit.push(q); });
    for (const q of hit) {
      const a = q.min as number[], b = q.max as number[]; Wd.remove(w, q);
      const add = (m0: number[], m1: number[]) => { if (m1[0] - m0[0] > 1e-3 && m1[1] - m0[1] > 1e-3 && m1[2] - m0[2] > 1e-3) Wd.add(w, Wd.box(m0[0], m0[1], m0[2], m1[0], m1[1], m1[2], { kind: 'wall' })); };
      const ix0 = Math.max(a[0], H0[0]), ix1 = Math.min(b[0], H1[0]), iz0 = Math.max(a[2], H0[2]), iz1 = Math.min(b[2], H1[2]);
      add([a[0], a[1], a[2]], [ix0, b[1], b[2]]); add([ix1, a[1], a[2]], [b[0], b[1], b[2]]);
      add([ix0, a[1], a[2]], [ix1, b[1], iz0]); add([ix0, a[1], iz1], [ix1, b[1], b[2]]);
      add([ix0, a[1], iz0], [ix1, H0[1], iz1]); add([ix0, H1[1], iz0], [ix1, b[1], iz1]);
    }
    map.doorVer = (map.doorVer || 0) + 1; // (sound gets through it now)
    return true;
  }
  const NAMES: Record<string, string> = { bridge: 'Bridge', engine: 'Engine room', reactor: 'Reactor', cargo: 'Hold', quarters: 'Quarters', barracks: 'Barracks', mess: 'Mess', galley: 'Galley', medbay: 'Sick bay', armoury: 'Armoury', magazine: 'Magazine', vault: 'Vault', brig: 'Brig', pods: 'Escape pods', spine: 'Spine', stairs: 'Stairwell' };
  return { lay, finish, roomAt, sites, siteOf, cut, NAMES, SPEC };
})();
G.ShipGen = G_ShipGen;
interface GameModules { ShipGen: typeof G_ShipGen; }
