'use strict';
// A ship to board, as a level's layout (js/level.ts plan takes it as it takes a warehouse's or a house's): one deck on the
// coarse grid, bow to the west, stern to the east.
//   the bridge across the bow; a spine corridor aft from its door to the engine room across the stern; compartments off
//   the spine to port (north) and starboard (south), a bulkhead between each and the next. A big ship's deeper sides are
//   split in two: a compartment on the spine and another behind it against the hull, reached through the first.
//   Everything outside the hull is open space (tile 5, open to the sky, the floor 300 m down: nothing drawn, nothing to
//   stand on), with room to the south for the squad's ship to stand nose-on to the hull at the breach.
// What the compartments are goes by her size (PROGRAM): a corvette has a hold, a mess and somewhere to sleep; a frigate
// adds an armoury, barracks, a sick bay, a magazine and escape pods; a cruiser a galley, a brig, a reactor room, a vault
// and more of each. The armoury, the vault and (but on a corvette) the bridge are behind locked doors: a keycard each,
// carried by one of the crew (js/spaceserver.ts).
// finish(map, lay), after the plan: what the mission needs of the finished map (map.sp): the breach, the locked doors,
// which room is which, where the self-destruct console, the artifact and the escape pods are, which windows are in the hull.
type ShRole = 'bridge' | 'engine' | 'reactor' | 'cargo' | 'quarters' | 'barracks' | 'mess' | 'galley' | 'medbay' | 'armoury' | 'magazine' | 'vault' | 'brig' | 'pods' | 'spine';
interface ShSlot { rm: LvRoom; pos: number; side: number; deep: boolean; inner: LvRoom | null; door: number[] }
// a stretch of hull a ship can breach: three cells of its wall (c the middle one), the way out of her (nx, nz), the wall's middle there
interface ShSite { c: number; nx: number; nz: number; x: number; z: number; cells: number[] }
interface ShMeta { size: SpSize; obj: SpObj | null; breach: { x: number; z: number; face: number; door: number; room: number }; sites?: ShSite[]; cuts: number[][]; locks: Record<number, string>; roles: (ShRole | null)[]; console: { x: number; z: number } | null; artifact: { x: number; z: number } | null;
  pods: { x: number; z: number }[]; hullWin: Record<number, number>; hvtRoom: number; cardRooms: Record<string, number>; hull: { x0: number; z0: number; x1: number; z1: number; zc: number; bow: number[]; stern: number[] } }
const G_ShipGen = (() => {
  const SPEC: Record<SpSize, { len: number[]; sw: number; dep: number[]; bw: number; bd: number; ew: number; ed: number; split: number; foes: number; big: number }> = {
    small: { len: [10, 12], sw: 1, dep: [2, 3], bw: 3, bd: 1, ew: 3, ed: 1, split: 0, foes: 0.75, big: 1 },
    medium: { len: [19, 23], sw: 2, dep: [3, 4], bw: 4, bd: 2, ew: 4, ed: 2, split: 0, foes: 1.15, big: 1.5 },
    large: { len: [31, 36], sw: 2, dep: [5, 6], bw: 5, bd: 3, ew: 5, ed: 3, split: 0.65, foes: 1.7, big: 2.2 },
  };
  // what she has, most wanted first ([role, where along her it would rather be: 0 the bow, 1 the stern]); the first is
  // always the hold the breach comes into. What's left over is a hold, a cabin or a mess.
  const PROGRAM: Record<SpSize, [ShRole, number | null][]> = {
    small: [['quarters', 0.1], ['mess', null], ['cargo', 0.8]],
    medium: [['armoury', 0.3], ['barracks', null], ['mess', null], ['medbay', null], ['quarters', 0], ['magazine', 0.9], ['pods', 0.5], ['cargo', null]],
    large: [['armoury', 0.35], ['vault', 0.5], ['barracks', null], ['mess', null], ['galley', null], ['medbay', null], ['quarters', 0], ['magazine', 0.85], ['reactor', 1], ['pods', 0.5], ['brig', null], ['barracks', null], ['quarters', 0.1], ['magazine', 0.2], ['pods', 0.7]],
  };
  const FILL: ShRole[] = ['cargo', 'quarters', 'mess', 'cargo', 'barracks'];
  const MX = 12, MZ0 = 12, MZB = 12; // (the margins of open space all round her: room for the squad's ship to stand nose-on to any side)

  function lay(r: LvRng, _level: number, sp: SpGen | null): LvLay {
    const U = G.U, size: SpSize = (sp && sp.size) || 'small', S = SPEC[size], L = G.Level;
    const len = U.ri(r, S.len[0], S.len[1]), dmax = S.dep[1], sw = S.sw;
    const W = MX + 1 + S.bw + 1 + len + 1 + S.ew + 1 + MX, H = MZ0 + 1 + dmax + 1 + sw + 1 + dmax + 1 + MZB;
    const t = new Uint8Array(W * H).fill(5), out = new Uint8Array(W * H).fill(1);
    const rooms: LvRoom[] = [], doors: LvDoorSpec[] = [], locks: [number, number, string][] = [], roles: (ShRole | null)[] = [];
    const zc = MZ0 + 1 + dmax + 1; // (the spine's first row)
    // a compartment: its floor, and a wall round it wherever there was open space
    const carve = (x: number, z: number, w: number, h: number, role: ShRole, type: RoomType) => {
      for (let j = z - 1; j <= z + h; j++) for (let i = x - 1; i <= x + w; i++) {
        const k = j * W + i, inside = i >= x && i < x + w && j >= z && j < z + h;
        if (inside) { t[k] = 0; out[k] = 0; } else if (t[k] === 5) { t[k] = 1; out[k] = 0; }
      }
      const rm = L._room(x, z, w, h, { type, ship: role }); rooms.push(rm); roles.push(role);
      return rm;
    };
    const door = (x: number, z: number, axis: LvAxis, lock?: string | null, mirror?: boolean) => {
      doors.push([x, z, axis, !lock && r() < 0.15, !!mirror, lock ? 'blast' : 'slide']); // (a ship's doors slide: js/level.ts slides)
      if (lock && lock !== 'none') locks.push([x, z, lock]);
    };
    // the bridge, the spine, the engine room
    const bx0 = MX + 1, sx0 = bx0 + S.bw + 1, sx1 = sx0 + len - 1, ex0 = sx1 + 2;
    const bridge = carve(bx0, zc - S.bd, S.bw, sw + 2 * S.bd, 'bridge', 'bridge');
    const spine = carve(sx0, zc, len, sw, 'spine', 'spine');
    const engine = carve(ex0, zc - S.ed, S.ew, sw + 2 * S.ed, 'engine', 'engine');
    const bridgeLock = size === 'small' ? null : 'bridge';
    for (let k = 0; k < sw; k++) { door(sx0 - 1, zc + k, 'x', bridgeLock, k > 0); door(sx1 + 1, zc + k, 'x', null, k > 0); }
    // the compartments down each side: segments of 3 to 5 tiles, a bulkhead between each
    const slots: ShSlot[] = [], segs: number[][] = [];
    for (let x = sx0; x <= sx1;) {
      let w = U.ri(r, 3, size === 'small' ? 4 : 5);
      if (sx1 - (x + w) < 3) w = sx1 - x + 1;
      segs.push([x, w]); x += w + 1;
    }
    segs.forEach(([x, w], si) => {
      const pos = segs.length > 1 ? si / (segs.length - 1) : 0.5, taper = si === 0 || (si === segs.length - 1 && size !== 'small') ? 1 : 0;
      for (const side of [-1, 1]) {
        const d = Math.max(2, U.ri(r, S.dep[0], S.dep[1]) - taper), dx = x + U.ri(r, 0, w - 1);
        const z0 = side < 0 ? zc - 1 - d : zc + sw + 1, wallZ = side < 0 ? zc - 1 : zc + sw;
        if (d >= 5 && r() < S.split) {
          // split: two rows on the spine, a bulkhead, the rest against the hull
          const di = 2, zi = side < 0 ? zc - 1 - di : zc + sw + 1, zo = side < 0 ? z0 : zi + di + 1, ho = d - di - 1;
          const inner = carve(x, zi, w, di, 'cargo', 'cargo'), outer = carve(x, zo, w, ho, 'cargo', 'cargo');
          const dz = side < 0 ? zi - 1 : zi + di, ox = x + U.ri(r, 0, w - 1);
          slots.push({ rm: inner, pos, side, deep: false, inner: null, door: [dx, wallZ, 0] }, { rm: outer, pos, side, deep: true, inner, door: [ox, dz, 0] });
        } else slots.push({ rm: carve(x, z0, w, d, 'cargo', 'cargo'), pos, side, deep: false, inner: null, door: [dx, wallZ, 0] });
      }
    });
    // who gets which: the breach first (starboard, amidships, against the hull), then the programme
    const free = slots.slice(), take = (s: ShSlot, role: ShRole) => { free.splice(free.indexOf(s), 1); const i = rooms.indexOf(s.rm); roles[i] = role; s.rm.type = role as RoomType; s.rm.ship = role; if (role === 'armoury') s.rm.lootRoom = true; return s; };
    const hullSide = (s: ShSlot) => s.side > 0 && !slots.some((o) => o.inner === s.rm);
    const bs = take(free.filter(hullSide).sort((a, b) => Math.abs(a.pos - 0.5) - Math.abs(b.pos - 0.5) || rooms.indexOf(a.rm) - rooms.indexOf(b.rm))[0], 'cargo');
    for (const [role, pref] of PROGRAM[size]) {
      if (!free.length) break;
      const deepWant = role === 'vault' || role === 'reactor' || role === 'magazine';
      const sc = (s: ShSlot) => (pref == null ? 0 : Math.abs(s.pos - pref) * 2) + (deepWant && !s.deep ? 0.6 : 0) + ((role === 'pods' || role === 'medbay' || role === 'mess') && s.deep ? 1.5 : 0) + r() * 0.5;
      const scored = free.map((s) => [sc(s), s] as [number, ShSlot]).sort((a, b) => a[0] - b[0]);
      take(scored[0][1], role);
    }
    for (const s of free.slice()) take(s, U.pick(r, FILL));
    // their doors (a locked one for the armoury and the vault), and now and then one through the bulkhead to the next
    const roleOf = (rm: LvRoom) => roles[rooms.indexOf(rm)];
    for (const s of slots) {
      const role = roleOf(s.rm), lock = role === 'armoury' ? 'armory' : role === 'vault' ? 'bridge' : null;
      door(s.door[0], s.door[1], 'z', lock);
    }
    const locked = (rm: LvRoom) => roleOf(rm) === 'armoury' || roleOf(rm) === 'vault';
    for (let i = 0; i + 1 < segs.length; i++) for (const side of [-1, 1]) {
      const a = slots.filter((s) => s.side === side && s.rm.x === segs[i][0]), b = slots.filter((s) => s.side === side && s.rm.x === segs[i + 1][0]);
      for (const p of a) for (const q of b) {
        const z0 = Math.max(p.rm.z, q.rm.z), z1 = Math.min(p.rm.z + p.rm.h, q.rm.z + q.rm.h) - 1;
        if (z1 < z0 || locked(p.rm) || locked(q.rm) || r() > 0.3) continue;
        door(p.rm.x + p.rm.w, U.ri(r, z0, z1), 'x');
      }
    }
    // the breach: a plate in the hull at the south wall of the hold, the open space south of it clear to the map's edge
    const br = bs.rm, bx = br.cx, bz = br.z + br.h;
    // the spine's cover: on a two-wide spine a crate against one side or the other every few tiles (never in front of a door),
    // and at each bulkhead a rib that narrows it to one
    if (sw === 2) {
      const doorNear = (x: number, z: number) => doors.some(([dx, dz]) => Math.abs(dx - x) <= 1 && Math.abs(dz - z) <= 1);
      segs.forEach(([x, w], si) => {
        const k = si & 1, cx = x + (w >> 1), cz = zc + k;
        if (!doorNear(cx, cz) && r() < 0.8) (spine.cover = spine.cover || []).push(['crates', (cx + 0.5) * L.CTS, (cz + 0.5) * L.CTS + (k ? 0.25 : -0.25), U.ri(r, 0, 3), null]);
        const rx = x + w; // (the bulkhead's column)
        if (rx <= sx1 && !doorNear(rx, zc + 1 - k)) t[(zc + 1 - k) * W + rx] = 1;
      });
    }
    // the bridge's windows: glass the whole width of its bow wall
    const glass = [{ x0: bx0 - 1, x1: bx0 - 1, z0: bridge.z, z1: bridge.z + bridge.h - 1, v: 1, sill: 0.8, top: 2.7 }];
    const hull = { x0: bx0 - 1, z0: MZ0, x1: ex0 + S.ew, z1: zc + sw + dmax + 1, zc: zc + sw / 2, bow: [bridge.z, bridge.z + bridge.h], stern: [engine.z, engine.z + engine.h] };
    return { W, H, t, rooms, out, doors, glass, spawn: br, chasm: 300, sp: { size, obj: (sp && sp.obj) || null, locks, roles, breach: [bx, bz], hull, spine: rooms.indexOf(spine) } } as LvLay;
  }

  // After the plan (js/level.ts plan: the fine grid, the furniture, the doors and windows as they are): map.sp
  function finish(map: LvMap, lay: LvLay) {
    const L = G.Level, TS = L.TS, CT = L.CTS, src = (lay as any).sp, { W, H, t } = map, S = SPEC[src.size as SpSize];
    const doorAt = (cx: number, cz: number) => { let best: LvDoor | null = null, bd = 1.2; for (const d of map.doors) { const q = Math.hypot(d.x - (cx + 0.5) * CT, d.z - (cz + 0.5) * CT); if (q < bd) { bd = q; best = d; } } return best; };
    const locks: Record<number, string> = {};
    for (const [x, z, key] of src.locks as [number, number, string][]) { const d = doorAt(x, z); if (d) locks[d.id] = key; }
    const roles = src.roles as (ShRole | null)[], room = (role: ShRole, far?: { x: number; z: number }) => {
      let best = -1, bd = -1;
      map.rooms.forEach((rm, i) => { if (roles[i] !== role) return; const d = far ? Math.hypot((rm.cx + 0.5) * TS - far.x, (rm.cz + 0.5) * TS - far.z) : 1; if (d > bd) { bd = d; best = i; } });
      return best;
    };
    // a clear cell of a room, the nearest its middle (or to a point of it), in metres
    const clearIn = (ri: number, wx?: number, wz?: number) => {
      const rm = map.rooms[ri]; if (!rm) return null;
      const mx = wx != null ? wx / TS : rm.x + rm.w / 2, mz = wz != null ? wz / TS : rm.z + rm.h / 2;
      let best: { x: number; z: number } | null = null, bd = 1e9;
      for (let z = rm.z; z < rm.z + rm.h; z++) for (let x = rm.x; x < rm.x + rm.w; x++) {
        const i = z * W + x; if (t[i] !== 0 || map.props.has(i)) continue;
        let ok = true; for (const j of [i - 1, i + 1, i - W, i + W]) if (j >= 0 && j < W * H && t[j] === 3) ok = false;
        const d = Math.hypot(x + 0.5 - mx, z + 0.5 - mz);
        if (ok && d < bd) { bd = d; best = { x: (x + 0.5) * TS, z: (z + 0.5) * TS }; }
      }
      return best;
    };
    // where the breach is suggested (the hold's hull, amidships to starboard): the wall's middle line there. She can be breached anywhere (sites).
    const [bx, bz] = src.breach as number[], bri = map.rooms.indexOf(map.spawnRoom), bzc = (bz * L.K + 1.5) * TS;
    const breach = { x: (bx + 0.5) * CT, z: bzc, face: bzc + TS / 2, door: -1, room: bri };
    const bridge = room('bridge'), vault = room('vault'), at = { x: breach.x, z: breach.z };
    // the artifact: in the vault if she has one, else the hold or cabin furthest from the breach
    let ar = vault;
    if (ar < 0) { let bd2 = -1; map.rooms.forEach((rm, i) => { if (i === bri || !roles[i] || !['cargo', 'quarters', 'magazine', 'barracks'].includes(roles[i]!)) return; const d = Math.hypot((rm.cx + 0.5) * TS - at.x, (rm.cz + 0.5) * TS - at.z); if (d > bd2) { bd2 = d; ar = i; } }); }
    const brm = map.rooms[bridge], cons = brm ? clearIn(bridge, (brm.x + 1.5) * TS, (brm.z + brm.h / 2) * TS) : null;
    const pods: { x: number; z: number }[] = [];
    map.rooms.forEach((rm, i) => {
      if (roles[i] !== 'pods') return;
      // against the hull side of the room (the side away from the spine), up to three hatches
      const south = (rm.cz + 0.5) * TS > src.hull.zc * CT, z = south ? (rm.z + rm.h - 0.5) * TS : (rm.z + 0.5) * TS;
      for (let k = 0; k < 3; k++) { const x = (rm.x + (k + 0.5) * rm.w / 3) * TS, c = clearIn(i, x, z); if (c && !pods.some((p) => Math.hypot(p.x - c.x, p.z - c.z) < 1)) pods.push(c); }
    });
    // the windows in the hull (a pane with open space on one side): which room each lets the air out of
    const hullWin: Record<number, number> = {};
    for (const w of map.windows) {
      if (w.ext) continue;
      const c = w.cells[0], a = c - w.nx - w.nz * W, b = c + w.nx + w.nz * W, inner = t[a] === 5 ? b : t[b] === 5 ? a : -1;
      if (inner < 0) continue;
      const x = inner % W, z = (inner / W) | 0, ri = map.rooms.findIndex((rm) => x >= rm.x - 1 && x <= rm.x + rm.w && z >= rm.z - 1 && z <= rm.z + rm.h);
      if (ri >= 0) hullWin[w.id] = ri;
    }
    // the keycards' carriers start in: the bridge's with the watch officers (a cabin, the mess), the armoury's in the barracks
    const cardRooms: Record<string, number> = {};
    if (Object.values(locks).includes('bridge')) cardRooms.bridge = room('quarters', at) >= 0 ? room('quarters', at) : room('mess', at);
    if (Object.values(locks).includes('armory')) cardRooms.armory = room('barracks', at) >= 0 ? room('barracks', at) : room('mess', at);
    const hull = { x0: src.hull.x0 * CT, z0: src.hull.z0 * CT, x1: (src.hull.x1 + 1) * CT, z1: (src.hull.z1 + 1) * CT, zc: src.hull.zc * CT, bow: src.hull.bow.map((v: number) => v * CT), stern: src.hull.stern.map((v: number) => v * CT) };
    const sp: ShMeta = { size: src.size, obj: src.obj, breach, cuts: [], locks, roles, console: cons, artifact: ar >= 0 ? clearIn(ar) : null, pods, hullWin, hvtRoom: bridge, cardRooms, hull };
    map.sp = sp;
    // (more of a crew in a bigger ship: js/server.ts spawnEnemies reads the theme's)
    map.theme = Object.assign({}, map.theme, { foes: (map.theme.foes || 1) * S.foes, big: S.big });
    // the armoury holds what's worth taking: the weapon case and the attachments box are put there (js/level.ts finish reads lootRoom)
    return map;
  }
  // which room of the ship a point is in (its walls with it), or -1
  function roomAt(map: LvMap, x: number, z: number) {
    const TS = G.Level.TS, cx = x / TS, cz = z / TS;
    let best = -1, bd = 1e9;
    map.rooms.forEach((rm, i) => { if (cx < rm.x - 1 || cx > rm.x + rm.w + 1 || cz < rm.z - 1 || cz > rm.z + rm.h + 1) return; const d = Math.max(Math.abs(cx - (rm.x + rm.w / 2)) - rm.w / 2, Math.abs(cz - (rm.z + rm.h / 2)) - rm.h / 2); if (d < bd) { bd = d; best = i; } });
    return best;
  }
  // ---- breaching her anywhere. A site: three cells in a row of the hull's wall (two metres), floor clear behind each and
  // open space in front, with room out there for a ship to stand nose-on (22 m out, 4 m either side). Worked out once.
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
        for (let k = -1; k <= 1 && ok; k++) { const cx = x + ax * k, cz = z + az * k, in1 = at(cx - nx, cz - nz); ok = at(cx, cz) === 1 && !(win && win.has(cz * W + cx)) && in1 !== 1 && in1 !== 5 && in1 !== 3 && at(cx + nx, cz + nz) === 5; }
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
  const NAMES: Record<string, string> = { bridge: 'Bridge', engine: 'Engine room', reactor: 'Reactor', cargo: 'Hold', quarters: 'Quarters', barracks: 'Barracks', mess: 'Mess', galley: 'Galley', medbay: 'Sick bay', armoury: 'Armoury', magazine: 'Magazine', vault: 'Vault', brig: 'Brig', pods: 'Escape pods', spine: 'Spine' };
  return { lay, finish, roomAt, sites, siteOf, cut, NAMES, SPEC };
})();
G.ShipGen = G_ShipGen;
interface GameModules { ShipGen: typeof G_ShipGen; }
