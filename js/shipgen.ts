'use strict';
import { U as G_U } from './util.js';
import { Materials } from './materials.js';
import { Level } from './level.js';
import { World } from './world.js';
interface ShSlot { rm: LvRoom; pos: number; side: number; deep: boolean; inner: LvRoom | null; door: number[]; x: number }
interface ShSeg { x: number; w: number; d: number[]; split: boolean[]; stair: boolean; hall?: boolean[] }
// A hall two decks high (a cruiser's: HALLS): where along her spine (x, w: tiles from its bow end), which side of it (-1 port,
// 1 starboard, 0 right across her, spine and all), and inside it, from its own corner: the flights up to its gallery
// ([i, j]: three tiles climbing aft from i, along row j), the columns under the gallery's edge and the frames standing on its
// floor ([i, j] each)
interface ShHall { kind: ShHallKind; x: number; w: number; side: number; hh: number; stairs: number[][]; pillars: number[][]; frames: number[][] }
interface ShWing { dO: number; dI: number; ew: number; len: number }
interface ShSk { wing?: ShWing; decks: number; halls: ShHall[]; size: SpSize; len: number; sw: number; dmax: number; W: number; H: number; zc: number; segs: ShSeg[] }
export const ShipGen = (() => {
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
    'small:0': [['gunnery', 0.3], ['quarters', 0.1], ['mess', null], ['cargo', 0.8]],
    'medium:0': [['gunnery', 0.4], ['security', 0.55], ['armoury', 0.3], ['barracks', null], ['mess', null], ['medbay', null], ['quarters', 0], ['magazine', 0.9], ['pods', 0.5], ['cargo', null]],
    'large:0': [['gunnery', 0.4], ['security', 0.6], ['armoury', 0.35], ['vault', 0.5], ['barracks', null], ['mess', null], ['galley', null], ['medbay', null], ['quarters', 0], ['magazine', 0.85], ['reactor', 1], ['pods', 0.5], ['brig', null], ['barracks', null], ['quarters', 0.1], ['magazine', 0.2], ['pods', 0.7]],
    'capital:0': [['gunnery', 0.4], ['security', 0.6], ['armoury', 0.35], ['vault', 0.55], ['barracks', 0.25], ['barracks', 0.7], ['magazine', 0.9], ['magazine', 0.15], ['brig', null], ['medbay', null], ['pods', 0.5], ['cargo', null], ['barracks', null], ['cargo', null], ['magazine', 0.5]],
    'capital:1': [['quarters', 0.05], ['armoury', 0.2], ['mess', 0.5], ['galley', 0.55], ['medbay', null], ['barracks', 0.8], ['pods', 0.4], ['quarters', 0.15], ['quarters', null], ['pods', 0.75], ['mess', null], ['barracks', null], ['quarters', null]],
  };
  // (a cruiser with a hall, HALLS: two decks. Her lower deck is her working one, her people live on the upper)
  PROGRAM['large+:0'] = [['gunnery', 0.4], ['security', 0.6], ['armoury', 0.35], ['vault', 0.5], ['barracks', null], ['magazine', 0.85], ['medbay', null], ['brig', null], ['pods', 0.5], ['magazine', 0.2], ['cargo', null], ['barracks', null], ['pods', 0.7]];
  PROGRAM['large+:1'] = [['quarters', 0.05], ['mess', 0.5], ['galley', 0.55], ['quarters', 0.15], ['medbay', null], ['barracks', 0.8], ['pods', 0.4], ['quarters', null], ['mess', null], ['barracks', null]];
  const FILL: ShRole[] = ['cargo', 'quarters', 'mess', 'cargo', 'barracks'];
  // ---- A cruiser's halls (sp.hall; which a cruiser has, if any, goes by her seed: js/spacedata.ts hallOf). She has two decks,
  // and one or two compartments the height of both: open from the lower deck's floor to the upper deck's roof, a gallery round
  // them on the upper deck (a walkway a tile wide against the walls, a rail along its edge) looking down into them, a flight
  // or two up to it inside the hall. Columns stand under the gallery's edge; frames (short lengths of bulkhead) and what's
  // stowed or grown or run in there (js/furniture.ts shipHalls) stand about the floor, so no one place sees all of it.
  //   bay:   a hangar bay right across her amidships, the spine running into it at each end and over it as a bridge of grating
  //   grove: an arboretum down her port side amidships
  //   works: a machinery hall to starboard aft, next the engine room, and a second, smaller, to port forward
  //   mall:  a cruise liner's promenade court, right across her well forward (she takes the liner's theme with it, js/level.ts: wood
  //          panelling, carpet, coffered ceilings, a low warm light). Honey marble underfoot, marble columns with gilt capitals in
  //          place of lengths of bulkhead (js/furniture.ts gcolumn), chandeliers, glass balustrades round its gallery (not steel
  //          rails), the spine over it a deck (not a grating) that ends at the head of a grand stair: the spine's own width, up the
  //          middle of the court's after end. A fountain in the middle, a gilt statue forward of it; display cases, cabinets,
  //          a cafe's tables, a lounge's sofas, palms in urns about it. No frames on its floor.
  // stairs: where her ordinary stairwells are along her (of her spine's length), clear of the halls.
  const HALLS: Record<ShHallKind, { stairs: number[]; at: [number, number, number, number][] }> = { // at: [side, where along her, least and most tiles long]
    bay: { stairs: [0.08, 0.84], at: [[0, 0.48, 11, 16]] },
    grove: { stairs: [0.08, 0.84], at: [[-1, 0.5, 13, 19]] },
    works: { stairs: [0.5], at: [[1, 0.8, 10, 15], [-1, 0.2, 8, 12]] },
    mall: { stairs: [0.64, 0.86], at: [[0, 0.27, 11, 16]] },
  };
  function halls(r: LvRng, sk: ShSk, kind: ShHallKind) {
    const U = G_U, segs = sk.segs, n = segs.length, dmax = sk.dmax;
    for (const [side, at, min, max] of HALLS[kind].at) {
      const ks = side === 0 ? [0, 1] : [side < 0 ? 0 : 1], taken = (sg: ShSeg) => (sg.stair && ks.includes(0)) || ks.some((k) => sg.hall && sg.hall[k]);
      // the run of whole segments nearest there that's long enough (not her first or her last: her hull narrows at them)
      // (if nothing of that length fits between her stairwells, something a little shorter or longer does)
      let best: number[] | null = null, bd = 1e9;
      for (const [lo, hi] of [[min, max], [min - 3, max + 5]]) {
        for (let a = 1; a < n - 1; a++) for (let b = a; b < n - 1 && !taken(segs[b]); b++) {
          const w = segs[b].x + segs[b].w - segs[a].x; if (w < lo) continue; if (w > hi) break;
          const d = Math.abs((segs[a].x + w / 2) / sk.len - at); if (d < bd) { bd = d; best = [a, b]; }
          break;
        }
        if (best) break;
      }
      if (!best) continue;
      const [a, b] = best, x = segs[a].x, w = segs[b].x + segs[b].w - x, hh = side === 0 ? 2 * dmax + sk.sw + 2 : dmax;
      for (let i = a; i <= b; i++) { const sg = segs[i]; sg.hall = sg.hall || [false, false]; for (const k of ks) { sg.hall[k] = true; sg.d[k] = dmax; sg.split[k] = false; } }
      // the flights: along the hull's side, climbing aft, from two tiles in; right across her, a second up her other side from its after end
      // (a liner's court: its second is a grand stair, the spine's own width, up the middle of its after end to the upper deck's spine: [i, j, rows])
      const jH = side > 0 ? hh - 1 : 0, stairs = [[2, jH]]; if (side === 0) stairs.push(kind === 'mall' ? [w - 5, dmax + 1, sk.sw] : [w - 6, hh - 1]);
      // columns under the gallery's edge: its corners, and about every four tiles down its long sides
      const pillars: number[][] = [], np = Math.max(1, Math.round((w - 3) / 4));
      for (let q = 0; q <= np; q++) { const i = 1 + Math.round(q * (w - 3) / np); pillars.push([i, 1], [i, hh - 2]); }
      if (side === 0) for (let j = 5; j < hh - 5; j += 4) if (j < dmax || j > dmax + sk.sw + 1) pillars.push([1, j], [w - 2, j]); // (down its ends too, clear of where the spine comes in)
      // frames: lengths of bulkhead two or three tiles long standing free on its floor, turn and turn about along it and
      // from one side to the other, a tile clear of the gallery's columns and of each other. Right across her, one stands
      // in the spine's own line at each end of it, half across it: nobody sees down the hall from its door.
      const frames: number[][] = [], lo = side === 0 ? 2 : 1, hi = hh - 1 - lo, clear = (i: number, j: number) => i >= 2 && i <= w - 3 && j >= lo && j <= hi && !frames.some(([p, q]) => Math.abs(p - i) <= 1 && Math.abs(q - j) <= 1);
      const frame = (i: number, j: number, di: number, dj: number, len: number) => { const c: number[][] = []; for (let q = 0; q < len; q++) c.push([i + di * q, j + dj * q]); if (c.every(([p, q]) => clear(p, q))) frames.push(...c); };
      if (side === 0) {
        const js = dmax + 1; // (the spine's first row, in the hall)
        if (kind !== 'mall') { frame(3, js, 0, 1, 1); frame(w - 4, js + sk.sw - 1, 0, -1, 1); } // (a liner's court has none: a statue stands in the spine's line forward, its grand stair aft)
        for (let i = 4 + U.ri(r, 0, 1), q = 0; kind !== 'mall' && i <= w - 4; i += U.ri(r, 3, 4), q++) {
          const across = q % 2 === 0, len = U.ri(r, 2, 3);
          frame(i, U.ri(r, lo, js - 2 - (across ? len - 1 : 0)), across ? 0 : 1, across ? 1 : 0, len);
          frame(i + U.ri(r, 0, 1), U.ri(r, js + sk.sw + 1, hi - (across ? 0 : len - 1)), across ? 1 : 0, across ? 0 : 1, len);
        }
      } else for (let i = 3 + U.ri(r, 0, 1), q = U.ri(r, 0, 1); i <= w - 3; i += 3, q++) frame(i, q % 2 ? lo : hi - 2, 0, 1, 3); // (across it, from one side then the other: each reaches past its middle, the gallery's tile clear at both ends)
      sk.halls.push({ kind, x, w, side, hh, stairs, pillars, frames });
    }
  }
  const MX = 12, MZ0 = 12, MZB = 12, GAP = 36; // (open space all round a hull, and between two: room for the squad's ship to stand nose-on to either, js/shipgen.ts sites)

  // a hull's frame: the same for every deck of her
  function skeleton(r: LvRng, size: SpSize, hall?: ShHallKind | null): ShSk {
    const U = G_U, S = SPEC[size], len = U.ri(r, S.len[0], S.len[1]), dmax = S.dep[1], sw = S.sw, segs: ShSeg[] = [], decks = hall ? 2 : S.decks;
    const stairs = hall ? HALLS[hall].stairs.map((q) => Math.round(len * q)) : decks > 1 ? [Math.round(len * 0.28), Math.round(len * 0.68)] : [];
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
    const sk: ShSk = { decks, halls: [], size, len, sw, dmax, W: 1 + S.bw + 1 + len + 1 + S.ew + 1, H: 1 + dmax + 1 + sw + 1 + dmax + 1, zc: 1 + dmax + 1, segs };
    if (hall) halls(r, sk, hall);
    return sk;
  }
  interface Ctx { W: number; H: number; t: Uint8Array; out: Uint8Array; grate: Uint8Array | null; rooms: LvRoom[]; doors: LvDoorSpec[]; locks: [number, number, string][]; glass: any[]; entries: number[][] }
  // one deck of a hull, carved into the grid at (ox, oz). f: which deck, of n. hi: which hull (0 the mission's).
  function deck(c: Ctx, sk: ShSk, ox: number, oz: number, f: number, n: number, r: LvRng, hi: number, stairs: any[]) {
    const U = G_U, L = Level, S = SPEC[sk.size], { W, t, out, rooms, doors, locks } = c, sw = sk.sw, zc = oz + sk.zc, top = f === n - 1;
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
    // (the spine: one corridor her length, or a length of it either end of a hall that's right across her)
    const across = sk.halls.filter((h) => h.side === 0).sort((a, b) => a.x - b.x), spines: LvRoom[] = [];
    { let x = 0; for (const h of across) { spines.push(carve(sx0 + x, zc, h.x - 1 - x, sw, 'spine')); x = h.x + h.w + 1; } spines.push(carve(sx0 + x, zc, sk.len - x, sw, 'spine')); }
    const spine = spines[0], spineAt = (x: number) => spines.find((q) => x >= q.x && x < q.x + q.w) || null;
    carve(ex0, zc - S.ed, S.ew, sw + 2 * S.ed, f === 0 ? 'engine' : 'reactor');
    const bridgeLock = top && sk.size !== 'small' && sk.size !== 'transport' ? 'bridge' : null;
    for (let k = 0; k < sw; k++) { door(sx0 - 1, zc + k, 'x', bridgeLock, k > 0); door(sx1 + 1, zc + k, 'x', null, k > 0); }
    const slots: ShSlot[] = [];
    sk.segs.forEach((sg, si) => {
      const x = sx0 + sg.x, w = sg.w, pos = sk.segs.length > 1 ? si / (sk.segs.length - 1) : 0.5;
      [-1, 1].forEach((side, k) => {
        if (sg.hall && sg.hall[k]) return; // (part of a hall: below)
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
    // her halls (HALLS): on her lower deck the hall itself, its columns and frames, the foot of its flights; on her upper deck its
    // gallery, a tile wide round the walls, the drop inside it (and the columns standing up through it), the spine's bridge of
    // grating over a hall right across her. Doors on both decks: from the spine where it runs into the hall's ends, or two (three
    // into a long one) through the wall between them.
    for (const h of sk.halls) {
      const x = sx0 + h.x, z = h.side > 0 ? zc + sw + 1 : zc - 1 - sk.dmax, w = h.w, hh = h.hh, rm = carve(x, z, w, hh, f === 0 ? h.kind : 'gallery');
      if (f === 0) rm.tall = true; else rm.type = 'catwalk';
      if (f > 0) for (let j = 1; j < hh - 1; j++) for (let i = 1; i < w - 1; i++) {
        const k = (z + j) * W + x + i, bridge = h.side === 0 && z + j >= zc && z + j < zc + sw;
        if (bridge) { if (h.kind !== 'mall') c.grate![k] = 1; } else t[k] = 5; // (a liner's court: the spine crosses it on a deck of its own)
      }
      // (a liner's court: its columns aren't lengths of bulkhead but marble, a piece of furniture each, js/furniture.ts gcolumn, standing
      // on the lower deck up through the drop; their tiles kept clear for them, 4)
      if (h.kind === 'mall') { if (f === 0) for (const [i, j] of h.pillars) { t[(z + j) * W + x + i] = 4; (rm.cover = rm.cover || []).push(['gcolumn', (x + i + 0.5) * L.CTS, (z + j + 0.5) * L.CTS, 0, null]); } }
      else for (const [i, j] of h.pillars) t[(z + j) * W + x + i] = 1;
      if (f === 0) for (const [i, j] of h.frames) t[(z + j) * W + x + i] = 1;
      for (const [i, j, rows = 1] of h.stairs) {
        for (let q = 0; q < 3; q++) for (let p = 0; p < rows; p++) t[(z + j + p) * W + x + i + q] = f === 0 ? 6 : 5;
        if (f === 0) stairs.push({ f: 0, x0: x + i, z0: z + j, x1: x + i + 2, z1: z + j + rows - 1, axis: 'x', up: 1 }); else c.entries.push([x + i + 3, z + j]);
      }
      if (h.side === 0) for (let k = 0; k < sw; k++) { door(x - 1, zc + k, 'x', null, k > 0); door(x + w, zc + k, 'x', null, k > 0); }
      else { const wz = h.side < 0 ? zc - 1 : zc + sw; for (const i of w >= 14 ? [1, w >> 1, w - 2] : [1, w - 2]) door(x + i, wz, 'z'); }
    }
    // who gets which: the hold the breach is suggested at first (her lowest deck: starboard, amidships, against the hull), then the programme
    const free = slots.slice(), take = (s: ShSlot, role: ShRole) => { free.splice(free.indexOf(s), 1); s.rm.type = role as RoomType; s.rm.ship = role; if (role === 'armoury') s.rm.lootRoom = true; return s; };
    let hold: ShSlot | null = null;
    if (f === 0) hold = take(free.filter((s) => s.side > 0 && !slots.some((o) => o.inner === s.rm)).sort((a, b) => Math.abs(a.pos - 0.5) - Math.abs(b.pos - 0.5) || rooms.indexOf(a.rm) - rooms.indexOf(b.rm))[0], 'cargo');
    for (const [role, pref] of PROGRAM[sk.size + (sk.halls.length ? '+' : '') + ':' + f] || PROGRAM[sk.size + ':' + f] || PROGRAM[sk.size + ':0']) {
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
        const k = si & 1, x = sx0 + sg.x, cx = x + (sg.w >> 1), cz = zc + k, sp = spineAt(cx);
        if (!sp) return; // (in a hall that's right across her)
        if (!doorNear(cx, cz) && r() < 0.8) (sp.cover = sp.cover || []).push(['crates', (cx + 0.5) * L.CTS, (cz + 0.5) * L.CTS + (k ? 0.25 : -0.25), U.ri(r, 0, 3), null]);
        const rx = x + sg.w;
        if (rx <= sx1 && spineAt(rx) && !doorNear(rx, zc + 1 - k)) t[(zc + 1 - k) * W + rx] = 1;
      });
    }
    // the bridge's windows: glass the whole width of its bow wall
    if (top) c.glass.push({ x0: bx0 - 1, x1: bx0 - 1, z0: bow.z, z1: bow.z + bow.h - 1, v: 1, sill: 0.8, top: 2.7 });
    const st = rooms.find((q) => q.ship === 'stairs' && (q as any).hull === hi) || spine;
    return { hold: hold ? hold.rm : null, breach: hold ? [hold.rm.cx, hold.rm.z + hold.rm.h] : null, stairs: st };
  }

  // ---- A flying wing (sp.wing: a corvette or a frigate): she flies corner first. Two arms run back from her bow corner, one
  // east and one south, each a spine with compartments on its leading side (against the outer hull) and its trailing side,
  // an engine room across its end. The bridge is across the corner itself, glazed on both of its outer walls; the spines
  // meet behind it, and a compartment sits in the crook between the arms.
  function wingSkeleton(r: LvRng, size: SpSize): ShSk {
    const U = G_U, S = SPEC[size], big = size !== 'small', dO = big ? 3 : 2, dI = big ? 3 : 2, ew = big ? 3 : 2, len = big ? U.ri(r, 14, 17) : U.ri(r, 9, 11), sw = S.sw;
    const span = 1 + dO + 1 + sw + 1 + len + 1 + ew + 1;
    return { wing: { dO, dI, ew, len }, decks: 1, halls: [], size, len, sw, dmax: dO, W: span, H: span, zc: 1 + dO + 1, segs: [] };
  }
  function wingDeck(c: Ctx, sk: ShSk, ox: number, oz: number, r: LvRng, hi: number) {
    const U = G_U, L = Level, { W, t, out, rooms, doors, locks } = c, sw = sk.sw, { dO, dI, ew, len } = sk.wing!;
    const carve = (x: number, z: number, w: number, h: number, role: ShRole) => {
      for (let j = z - 1; j <= z + h; j++) for (let i = x - 1; i <= x + w; i++) {
        const k = j * W + i, inside = i >= x && i < x + w && j >= z && j < z + h;
        if (inside) { t[k] = 0; out[k] = 0; } else if (t[k] === 5) { t[k] = 1; out[k] = 0; }
      }
      const rm = L._room(x, z, w, h, { type: role, ship: role, hull: hi, stairs: false }); rooms.push(rm);
      return rm;
    };
    const door = (x: number, z: number, axis: LvAxis, lock?: string | null, mirror?: boolean) => { doors.push([x, z, axis, !lock && r() < 0.15, !!mirror, lock ? 'blast' : 'slide']); if (lock) locks.push([x, z, lock]); };
    // (where the spines cross behind the bridge; where each arm's compartments begin)
    const xS = ox + 1 + dO + 1, zS = oz + 1 + dO + 1, a0 = xS + sw + 1, b0 = zS + sw + 1;
    const bridge = carve(ox + 1, oz + 1, dO + 1 + sw, dO, 'bridge');
    const spineA = carve(xS, zS, sw + 1 + len, sw, 'spine'); carve(xS, zS + sw, sw, 1 + len, 'spine');
    carve(a0 + len + 1, zS - 1, ew, sw + 2, 'engine'); carve(xS - 1, b0 + len + 1, sw + 2, ew, 'engine');
    const lock = sk.size !== 'small' ? 'bridge' : null;
    for (let k = 0; k < sw; k++) { door(xS + k, zS - 1, 'z', lock, k > 0); door(a0 + len, zS + k, 'x', null, k > 0); door(xS + k, b0 + len, 'z', null, k > 0); }
    // a run of compartments: each three or four tiles, a bulkhead between
    const runs = (n: number) => { const o: number[][] = []; for (let x = 0; x < n;) { let w = U.ri(r, 3, 4); if (n - (x + w) < 4) w = n - x; if (w >= 2) o.push([x, w]); x += w + 1; } return o; };
    interface WSlot { rm: LvRoom; pos: number; side: number; deep: boolean; door: [number, number, LvAxis] }
    const slots: WSlot[] = [], slot = (rm: LvRoom, pos: number, side: number, d: [number, number, LvAxis]) => { slots.push({ rm, pos, side, deep: false, door: d }); return rm; };
    slot(carve(a0, b0, dI, dI, 'cargo'), 0.1, 1, [a0 + U.ri(r, 0, dI - 1), zS + sw, 'z']); // (the crook)
    for (const [x, w] of runs(len)) slot(carve(a0 + x, oz + 1, w, dO, 'cargo'), (x + w / 2) / len, -1, [a0 + x + U.ri(r, 0, w - 1), zS - 1, 'z']);
    const holds: LvRoom[] = [];
    for (const [x, w] of runs(len - dI - 1)) holds.push(slot(carve(a0 + dI + 1 + x, b0, w, dI, 'cargo'), (dI + 1 + x + w / 2) / len, 1, [a0 + dI + 1 + x + U.ri(r, 0, w - 1), zS + sw, 'z']));
    for (const [z, w] of runs(len + sw + 1)) slot(carve(ox + 1, zS + z, dO, w, 'cargo'), Math.max(0, z - sw) / len, -1, [xS - 1, zS + z + U.ri(r, 0, w - 1), 'x']);
    for (const [z, w] of runs(len - dI - 1)) slot(carve(a0, b0 + dI + 1 + z, dI, w, 'cargo'), (dI + 1 + z + w / 2) / len, 1, [xS + sw, b0 + dI + 1 + z + U.ri(r, 0, w - 1), 'x']);
    // who gets which: the hold the breach is suggested at (on the east arm's trailing side, well out along it), then the programme
    const free = slots.slice(), take = (s: WSlot, role: ShRole) => { free.splice(free.indexOf(s), 1); s.rm.type = role as RoomType; s.rm.ship = role; if (role === 'armoury') s.rm.lootRoom = true; };
    const hold = slots.filter((s) => holds.includes(s.rm)).sort((a, b) => Math.abs(a.pos - 0.65) - Math.abs(b.pos - 0.65))[0] || slots[0];
    take(hold, 'cargo');
    // (a flying wing is a warship, a corvette's too: her security office second only to her guns, her cameras running her crew's response, js/spaceserver.ts)
    const prog = PROGRAM[sk.size + ':0'].some(([ro]) => ro === 'security') ? PROGRAM[sk.size + ':0'] : [PROGRAM[sk.size + ':0'][0], ['security', 0.55] as [ShRole, number], ...PROGRAM[sk.size + ':0'].slice(1)];
    for (const [role, pref] of prog) {
      if (!free.length) break;
      const sc = (s: WSlot) => (pref == null ? 0 : Math.abs(s.pos - pref) * 2) + r() * 0.5;
      take(free.map((s) => [sc(s), s] as [number, WSlot]).sort((a, b) => a[0] - b[0])[0][1], role);
    }
    for (const s of free.slice()) take(s, U.pick(r, FILL));
    for (const s of slots) door(s.door[0], s.door[1], s.door[2], s.rm.ship === 'armoury' ? 'armory' : s.rm.ship === 'vault' ? 'bridge' : null);
    // the bridge's windows: glass down both of its outer walls, meeting at her bow corner
    c.glass.push({ x0: ox, x1: ox, z0: bridge.z, z1: bridge.z + bridge.h - 1, v: 1, sill: 0.8, top: 2.7 }, { x0: bridge.x, x1: bridge.x + bridge.w - 1, z0: oz, z1: oz, v: 0, sill: 0.8, top: 2.7 });
    return { hold: hold.rm, breach: [hold.rm.cx, hold.rm.z + hold.rm.h], stairs: spineA };
  }

  function lay(r: LvRng, _level: number, sp: SpGen | null): LvLay {
    const U = G_U, size: SpSize = (sp && sp.size && SPEC[sp.size] ? sp.size : 'small'), wing = !!(sp && sp.wing) && (size === 'small' || size === 'medium');
    const hall = size === 'large' && sp && sp.hall && HALLS[sp.hall] ? sp.hall : null, main = wing ? wingSkeleton(r, size) : skeleton(r, size, hall), decks = main.decks;
    const osz = sp && sp.other && SPEC[sp.other] && decks === 1 ? sp.other : null, other = osz ? skeleton(r, osz) : null;
    const W = 2 * MX + Math.max(main.W, other ? other.W : 0), H = MZ0 + (other ? other.H + GAP : 0) + main.H + MZB;
    const mo = [MX, MZ0 + (other ? other.H + GAP : 0)], oo = other ? [MX + U.ri(r, 0, Math.max(0, main.W - other.W)), MZ0] : [0, 0];
    const stairs: any[] = [], floors: LvLay[] = [], locks: [number, number, number, string][] = [];
    let breach: number[] = [0, 0];
    for (let f = 0; f < decks; f++) {
      const c: Ctx = { W, H, t: new Uint8Array(W * H).fill(5), out: new Uint8Array(W * H).fill(1), grate: hall ? new Uint8Array(W * H) : null, rooms: [], doors: [], locks: [], glass: [], entries: [] };
      const m = wing ? wingDeck(c, main, mo[0], mo[1], r, 0) : deck(c, main, mo[0], mo[1], f, decks, r, 0, stairs);
      if (m.breach) breach = m.breach;
      if (other && f === 0) deck(c, other, oo[0], oo[1], 0, 1, r, 1, []);
      for (const [x, z, k] of c.locks) locks.push([f, x, z, k]);
      floors.push({ W, H, t: c.t, rooms: c.rooms, out: c.out, grate: c.grate, doors: c.doors, glass: c.glass, spawn: f === 0 ? m.hold : m.stairs, entries: c.entries.length ? c.entries : null, chasm: 300 });
    }
    const hull = (sk: ShSk, o: number[], isMain: boolean): any => ({ x0: o[0], z0: o[1], x1: o[0] + sk.W - 1, z1: o[1] + sk.H - 1, zc: o[1] + sk.zc + sk.sw / 2, main: isMain, size: sk.size });
    const src = { wing, hall, size, obj: (sp && sp.obj) || null, decks, other: osz, locks, breach, hulls: [hull(main, mo, true)].concat(other ? [hull(other, oo, false)] : []) };
    if (decks === 1) return Object.assign(floors[0], { sp: src });
    return { floors, stairs, sp: src, rail: hall && hall !== 'mall' ? 'steel' : undefined } as unknown as LvLay; // (a hall's gallery: steel rails, open between, as a foundry's catwalks; a liner's court: glass balustrades, as a building's stairwells)
  }

  // After the plan (and the stacking of her decks): map.sp
  function finish(map: LvMap, lay: LvLay) {
    for (const w of map.windows || []) (w as any).ship = true; // (a ship's glass: rounds don't go through it and it never comes down, js/level.ts paneBreaks)
    const L = Level, TS = L.TS, CT = L.CTS, src = (lay as any).sp, S = SPEC[src.size as SpSize], floors = map.floors || [map];
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
      if ((hullOf[i] || src.obj === 'visit') && roles[i] === 'cargo' && salvage.length < (src.obj === 'visit' ? 3 : 2)) { const c = clearIn(i); if (c) salvage.push(c); }
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
    const sp: ShMeta = { wing: !!src.wing, hall: src.hall || null, size: src.size, obj: src.obj, decks: src.decks, other: src.other, breach, cuts: [], locks, roles, hullOf, console: cons, artifact: ar >= 0 ? clearIn(ar) : null, pods, salvage, hullWin, hvtRoom: bridge, cardRooms, hull: hulls[0], hulls };
    map.sp = sp;
    // (sp.breach: a stretch of the hold's hull she can be breached at, nothing more than a point to reckon from: where the squad's
    // ship comes out of the jump lying off, what the pirates' pods keep clear of. Nothing marks it: she's breached wherever she's rammed)
    { const b = sp.breach, near = sites(map).filter((q) => q.nz === 1 && Math.abs(q.z - b.z) < TS).sort((p, q) => Math.abs(p.x - b.x) - Math.abs(q.x - b.x))[0]; if (near) b.x = near.x; }
    map.theme = Object.assign({}, map.theme, { big: S.big });
    return map;
  }
  // which room of a ship a point is in (its walls with it) on deck fl, or -1
  // Her fairings (streamlining: js/shipmodel.ts hull draws them). Where her side steps in or out (an inside corner of her plan, on the
  // map's cells: t 5 is outside her) the corner's filled: a wedge from the step's full depth (short, along v) down to nothing along the
  // longer wall (long, along u), from the corner (cx, cz).
  function fairings(W: number, H: number, t: ArrayLike<number>) {
    const TS = Level.TS, solid = (x: number, z: number) => x >= 0 && z >= 0 && x < W && z < H && t[z * W + x] !== 5, seen = new Set<string>();
    const out: { cx: number; cz: number; ux: number; uz: number; vx: number; vz: number; short: number; long: number }[] = [];
    for (let z = 1; z < H - 1; z++) for (let x = 1; x < W - 1; x++) {
      if (solid(x, z)) continue;
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
        if (!solid(x + sx, z) || !solid(x, z + sz)) continue;
        // (the wall across x there runs away along z, the wall across z along x: each as far as it's still her side)
        let da = 0; while (da < 14 && solid(x + sx, z - da * sz) && !solid(x, z - da * sz)) da++;
        let db = 0; while (db < 14 && solid(x - db * sx, z + sz) && !solid(x - db * sx, z)) db++;
        if (da < 2 || db < 2) continue;
        const cx = (sx > 0 ? x + 1 : x) * TS, cz = (sz > 0 ? z + 1 : z) * TS, key = cx.toFixed(2) + ',' + cz.toFixed(2); if (seen.has(key)) continue; seen.add(key);
        const A = da * TS, B = db * TS, alongX = B >= A, short = Math.min(alongX ? A : B, 6), long = Math.min(alongX ? B : A, Math.max(3, 2.4 * short), 10);
        out.push({ cx, cz, ux: alongX ? -sx : 0, uz: alongX ? 0 : -sz, vx: alongX ? 0 : -sx, vz: alongX ? -sz : 0, short, long });
      }
    }
    return out;
  }
  // the cells outside her a fairing reaches into (what's against her side there is covered: no window in it, js/level.ts placeWindows)
  function faired(W: number, H: number, t: ArrayLike<number>) {
    const TS = Level.TS, cov = new Set<number>();
    for (const f of fairings(W, H, t)) {
      const x0 = Math.floor(Math.min(f.cx, f.cx + f.ux * f.long + f.vx * f.short) / TS) - 1, x1 = Math.ceil(Math.max(f.cx, f.cx + f.ux * f.long + f.vx * f.short) / TS) + 1;
      const z0 = Math.floor(Math.min(f.cz, f.cz + f.uz * f.long + f.vz * f.short) / TS) - 1, z1 = Math.ceil(Math.max(f.cz, f.cz + f.uz * f.long + f.vz * f.short) / TS) + 1;
      for (let z = Math.max(0, z0); z <= Math.min(H - 1, z1); z++) for (let x = Math.max(0, x0); x <= Math.min(W - 1, x1); x++) {
        if (t[z * W + x] !== 5) continue;
        const px = (x + 0.5) * TS - f.cx, pz = (z + 0.5) * TS - f.cz, a = px * f.ux + pz * f.uz, o = px * f.vx + pz * f.vz;
        if (a > -TS / 2 && a < f.long && o > -TS / 2 && o - TS / 2 < f.short * (1 - Math.max(0, a) / f.long)) cov.add(z * W + x); // (any of the wedge in the cell)
      }
    }
    return cov;
  }
  function roomAt(map: LvMap, x: number, z: number, fl = 0) {
    const TS = Level.TS, cx = x / TS, cz = z / TS;
    let best = -1, bd = 1e9;
    map.rooms.forEach((rm, i) => { if ((rm.fl || 0) !== fl || cx < rm.x - 1 || cx > rm.x + rm.w + 1 || cz < rm.z - 1 || cz > rm.z + rm.h + 1) return; const d = Math.max(Math.abs(cx - (rm.x + rm.w / 2)) - rm.w / 2, Math.abs(cz - (rm.z + rm.h / 2)) - rm.h / 2); if (d < bd) { bd = d; best = i; } });
    return best;
  }
  // ---- breaching her anywhere (her lowest deck: the squad's ship stands level with it). A site: three cells in a row of the
  // hull's wall (two metres), the way in clear behind the middle of it and open space in front, with room out there for a
  // ship to stand nose-on. Worked out once.
  function sites(map: LvMap): ShSite[] {
    const sp = map.sp!; if (sp.sites) return sp.sites;
    const { W, H, t } = map, TS = Level.TS, out: ShSite[] = [];
    const at = (x: number, z: number) => (x < 0 || z < 0 || x >= W || z >= H ? -1 : t[z * W + x]);
    for (let z = 2; z < H - 2; z++) for (let x = 2; x < W - 2; x++) {
      if (t[z * W + x] !== 1) continue;
      for (const [nx, nz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const ax = nz ? 1 : 0, az = nx ? 1 : 0; let ok = true;
        // (any of her outside wall, windows and all, with her inside behind it: what's stood against it is no bar, nor a bulkhead that
        // meets the hull there (a ram goes through those too: cut), nor a door. Not where her hull turns a corner behind the middle:
        // no way in from it)
        for (let k = -1; k <= 1 && ok; k++) { const cx = x + ax * k, cz = z + az * k, in1 = at(cx - nx, cz - nz); ok = at(cx, cz) === 1 && in1 !== 5 && in1 !== 7 && in1 !== 6 && in1 !== -1 && (in1 !== 1 || k !== 0 || bulkhead(map, cx - nx, cz - nz, nx, nz)) && at(cx + nx, cz + nz) === 5; }
        // (not through an engine room's wall: her nozzles stand out of it, and her engine block over and under it; nor the bridge's
        // prow, where a ram or a bow juts out under her deck: js/shipmodel.ts hull. The squad's ship would sit in them)
        if (ok) { const ix = x - nx, iz = z - nz; ok = !map.rooms.some((rm, i) => (rm.fl || 0) === 0 && ix >= rm.x && ix < rm.x + rm.w && iz >= rm.z && iz < rm.z + rm.h && (sp.roles[i] === 'engine' || (sp.roles[i] === 'bridge' && nx < 0))); }
        // (out there: the collar's width at the hull, her cabin's behind it, her engine pods' from ten metres out)
        for (let d = 1; d <= 33 && ok; d++) for (let w = d <= 5 ? 3 : d <= 14 ? 5 : 7, k = -w; k <= w && ok; k++) { const o = at(x + nx * d + ax * k, z + nz * d + az * k); ok = o === 5 || o === -1; } // (past the map's edge: open space too)
        if (ok) out.push({ c: z * W + x, nx, nz, x: (x + 0.5) * TS, z: (z + 0.5) * TS, cells: [-1, 0, 1].map((k) => (z + az * k) * W + x + ax * k) });
      }
    }
    return (sp.sites = out);
  }
  // a bulkhead's end where it meets the hull: wall at (x, z), her inside to either side of it across the way in (nx, nz)
  function bulkhead(map: LvMap, x: number, z: number, nx: number, nz: number) {
    const { W, H, t } = map, inside = (q: number, r: number) => q >= 0 && r >= 0 && q < W && r < H && t[r * W + q] !== 1 && t[r * W + q] !== 5;
    return x >= 0 && z >= 0 && x < W && z < H && t[z * W + x] === 1 && inside(x + nz, z + nx) && inside(x - nz, z - nx);
  }
  const siteOf = (map: LvMap, c: number, nx: number, nz: number) => sites(map).find((s) => s.c === c && s.nx === nx && s.nz === nz) || null;
  // The hull cut through at a site: its three cells are floor now, and the wall there is gone up to a door's height (the
  // world's wall boxes that cross it are cut round the opening). A window any of it touches goes with it, all of it (its glass,
  // its frame, its solids); a bulkhead that meets the hull behind it is broken through, two cells in, so the way in opens on
  // both compartments. The same on the host and on every screen. Returns every cell it opened (the hull's, a window's beyond
  // them, the bulkheads'), or null if it's been cut there already.
  // ---- An angled breach (s.ang: the squad's ship came in that many degrees off square, up to SpaceData.BREACH_ANG). Her collar's against
  // the hull at the site, at her angle; what she drove in is a tunnel of torn, crumpled plating from her collar's mouth, curving round
  // to come out square inside, as wide and as high as her own (TUN.HW either side, TUN.H high): only as far in as gets it through the
  // hull's wall, a little more the further off square she came (room for the bend), TUN.IN at BREACH_ANG (tunnelIn). The same on every
  // machine from the site and the angle. Its line: points along it, each with which way it runs there (a curve from her heading to
  // straight in). (A breach nose up or down but square across has none: her deck where it meets the hull is within a step of the deck
  // inside at any pitch she can come in at, and the hole's square to the wall)
  const TUN = { HW: 0.85, H: 2.2, IN: 1.9, N: 9 };
  const bent = (s: ShSite) => !!s.ang;
  // how far in from the hull's face it comes out: through the wall (a cell) and a hand's breadth, more with the angle
  const tunnelIn = (s: ShSite) => { const TS = Level.TS, k = Math.min(1, Math.abs(s.ang || 0) / 45), a = TS + 0.25; return a + (TUN.IN - a) * k; };
  // a site's record as a cut's: [cell, nx, nz], and how far off square and nose up she came in when she did
  const cutKey = (s: ShSite) => s.pt ? [s.c, s.nx, s.nz, s.ang || 0, s.pt] : s.ang ? [s.c, s.nx, s.nz, s.ang] : [s.c, s.nx, s.nz];
  function tunnelPath(s: ShSite) {
    const TS = Level.TS, nx = s.nx, nz = s.nz, yaw = (nz > 0 ? 0 : nz < 0 ? Math.PI : nx > 0 ? Math.PI / 2 : -Math.PI / 2) + (s.ang || 0) * Math.PI / 180;
    const fx = s.x + nx * TS / 2, fz = s.z + nz * TS / 2, mx = fx + nx * 0.03, mz = fz + nz * 0.03, dx = -Math.sin(yaw), dz = -Math.cos(yaw), IN = tunnelIn(s), ex = fx - nx * IN, ez = fz - nz * IN, H = IN * 0.4; // (H: the bend's handles, short of half its depth: no loop in it)
    const P = [[mx, mz], [mx + dx * H, mz + dz * H], [ex + nx * H, ez + nz * H], [ex, ez]], out: { x: number; z: number; tx: number; tz: number }[] = [];
    for (let i = 0; i <= TUN.N; i++) {
      const t = i / TUN.N, u = 1 - t, b = [u * u * u, 3 * u * u * t, 3 * u * t * t, t * t * t], db = [-3 * u * u, 3 * u * u - 6 * u * t, 6 * u * t - 3 * t * t, 3 * t * t];
      const x = b.reduce((a, k, j) => a + k * P[j][0], 0), z = b.reduce((a, k, j) => a + k * P[j][1], 0); let tx = db.reduce((a, k, j) => a + k * P[j][0], 0), tz = db.reduce((a, k, j) => a + k * P[j][1], 0);
      const l = Math.hypot(tx, tz) || 1; tx /= l; tz /= l;
      out.push({ x, z, tx, tz });
    }
    return out;
  }
  // the grid's cells of wall (and of window) the tunnel goes through
  function tunnelCells(map: LvMap, s: ShSite) {
    const TS = Level.TS, W = map.W, out: number[] = [], path = tunnelPath(s), winAt = map.winAt as Map<number, unknown> | undefined;
    for (let i = 0; i < path.length - 1; i++) for (let k = 0; k < 6; k++) {
      const u = k / 6, x = path[i].x + (path[i + 1].x - path[i].x) * u, z = path[i].z + (path[i + 1].z - path[i].z) * u, R = TUN.HW + 0.12;
      for (let cz = Math.floor((z - R) / TS); cz <= Math.floor((z + R) / TS); cz++) for (let cx = Math.floor((x - R) / TS); cx <= Math.floor((x + R) / TS); cx++) {
        if (cx < 0 || cz < 0 || cx >= W || cz >= map.H || Math.hypot((cx + 0.5) * TS - x, (cz + 0.5) * TS - z) > R + TS * 0.35) continue;
        const c = cz * W + cx; if ((map.t[c] === 1 || (winAt && winAt.has(c))) && !out.includes(c)) out.push(c);
      }
    }
    return out;
  }
  // its plating in the world (on the host and every screen): a floor, the two sides and a roof for each stretch of it, turned with it
  function tunnelSolids(map: LvMap, s: ShSite) {
    const Wd = World, w = map.world, path = tunnelPath(s), out: any[] = []; if (!w) return out;
    for (let i = 0; i < path.length - 1; i++) {
      const a = path[i], b = path[i + 1], cx = (a.x + b.x) / 2, cz = (a.z + b.z) / 2, len = Math.hypot(b.x - a.x, b.z - a.z), yaw = Math.atan2(-(b.x - a.x), -(b.z - a.z)), c = Math.cos(yaw), sn = Math.sin(yaw), hz = len / 2 + 0.06;
      const o = { kind: 'prop', mat: Materials.SHIP, tunnel: true };
      out.push(Wd.add(w, Wd.ybox(cx, cz, yaw, TUN.HW + 0.14, hz, -0.25, 0, o)));
      for (const sd of [-1, 1]) out.push(Wd.add(w, Wd.ybox(cx + sd * (TUN.HW + 0.07) * c, cz - sd * (TUN.HW + 0.07) * sn, yaw, 0.07, hz, 0, TUN.H, o)));
      out.push(Wd.add(w, Wd.ybox(cx, cz, yaw, TUN.HW + 0.14, hz, TUN.H, TUN.H + 0.14, o)));
    }
    return out;
  }
  function cut(map: LvMap, s: ShSite): { cells: number[]; walls: number[]; wins: number[] } | null {
    const sp = map.sp!, TS = Level.TS, W = map.W, w = map.world, Wd = World;
    if (sp.cuts.some((q) => q[0] === s.c && q[1] === s.nx && q[2] === s.nz)) return null;
    sp.cuts.push(cutKey(s)); sp.sites = undefined;
    const cells = s.cells.slice(), walls: number[] = [], wins: number[] = [];
    if (bent(s)) for (const c of tunnelCells(map, s)) if (!cells.includes(c)) cells.push(c); // (an angled breach: the walls the tunnel goes through too)
    // (the windows it touches, and their cells beyond the hole: the hole takes them in)
    const winAt = map.winAt as Map<number, { win: LvWin }> | undefined;
    for (const c of cells.slice()) { const wa = winAt && winAt.get(c); if (wa && !wins.includes(wa.win.id)) wins.push(wa.win.id); }
    for (const id of wins) {
      const win = map.windows[id];
      for (const q of win.solids || []) Wd.remove(w, q);
      win.solids = []; win.broken = true; (win as any).gone = true;
      for (const c of win.cells) { if (!cells.includes(c)) cells.push(c); if (winAt) winAt.delete(c); }
    }
    // (the bulkheads behind it: each that meets the hull at one of its cells, two cells of it in from there)
    for (const c of cells.slice()) {
      const x = c % W, z = (c / W) | 0;
      for (let j = 1; j <= 2; j++) { const bx = x - s.nx * j, bz = z - s.nz * j; if (!bulkhead(map, bx, bz, s.nx, s.nz)) break; const q = bz * W + bx; if (!walls.includes(q)) walls.push(q); }
    }
    const open = (list: number[], y1: number) => {
      for (const c of list) {
        map.t[c] = 0;
        const x = c % W, z = (c / W) | 0, x0 = x * TS, z0 = z * TS, x1 = x0 + TS, z1 = z0 + TS, H0 = [x0, -0.6, z0], H1 = [x1, y1, z1], hit: any[] = [];
        Wd.query(w, [x0 + 0.01, 0.1, z0 + 0.01], [x1 - 0.01, 2, z1 - 0.01], (q: any) => { if (q.kind === 'wall' && !q.edge) hit.push(q); });
        for (const q of hit) {
          const a = q.min as number[], b = q.max as number[]; Wd.remove(w, q);
          const add = (m0: number[], m1: number[]) => { if (m1[0] - m0[0] > 1e-3 && m1[1] - m0[1] > 1e-3 && m1[2] - m0[2] > 1e-3) Wd.add(w, Wd.box(m0[0], m0[1], m0[2], m1[0], m1[1], m1[2], { kind: 'wall' })); };
          const ix0 = Math.max(a[0], H0[0]), ix1 = Math.min(b[0], H1[0]), iz0 = Math.max(a[2], H0[2]), iz1 = Math.min(b[2], H1[2]);
          add([a[0], a[1], a[2]], [ix0, b[1], b[2]]); add([ix1, a[1], a[2]], [b[0], b[1], b[2]]);
          add([ix0, a[1], a[2]], [ix1, b[1], iz0]); add([ix0, a[1], iz1], [ix1, b[1], b[2]]);
          add([ix0, a[1], iz0], [ix1, H0[1], iz1]); add([ix0, H1[1], iz0], [ix1, b[1], iz1]);
        }
      }
    };
    open(cells, Level.DOOR_H + 0.1); open(walls, Level.DOOR_H + 0.1);
    // What stood inside where she came through is gone with the plate: every piece of furniture any part of which is within
    // a couple of metres either side of the hole and three and a half in from it. Out of the world (nothing stops there now),
    // out of the grid (it's floor), out of the list; where each was is kept (sp.gone: boxes [x0, y0, z0, x1, y1, z1]) for the
    // screens to clear its picture away (js/space.ts cutHere).
    const D = 1.75, cxm = s.x - s.nx * (TS / 2 + D), czm = s.z - s.nz * (TS / 2 + D), hx = s.nx ? D : 2.3, hz = s.nz ? D : 2.3, gone = new Set<LvProp>();
    Wd.query(w, [cxm - hx, 0.05, czm - hz], [cxm + hx, 2.8, czm + hz], (q: any) => { if (q.kind === 'prop' && q.prop) gone.add(q.prop); });
    if (bent(s)) for (const p of tunnelPath(s)) Wd.query(w, [p.x - 1.3, 0.05, p.z - 1.3], [p.x + 1.3, 2.8, p.z + 1.3], (q: any) => { if (q.kind === 'prop' && q.prop) gone.add(q.prop); }); // (and along the tunnel)
    const boxes: number[][] = [];
    if (gone.size) {
      const gb = new Set<LvBox>();
      for (const p of gone) for (const b of p.boxes) { gb.add(b); const y = (b.gy || 0) + (b.y0 || 0); boxes.push([b.cx - b.hx - 0.14, y - 0.02, b.cz - b.hz - 0.14, b.cx + b.hx + 0.14, y + b.h + 0.75, b.cz + b.hz + 0.14]); }
      for (const q of w.solids.slice()) if (q && (q as any).prop && gone.has((q as any).prop)) Wd.remove(w, q);
      for (const [i, p] of [...map.props]) {
        if (!gone.has(p) && !p.boxes.some((b) => gb.has(b))) continue;
        const left = p.boxes.filter((b) => !gb.has(b));
        if (left.length && !gone.has(p)) { p.boxes = left; continue; } // (a cell two pieces shared: the other's still there)
        map.props.delete(i); if (i < W * map.H && (map.t[i] === 2 || map.t[i] === 4)) map.t[i] = 0;
      }
      if (map.propList) map.propList = map.propList.filter((p: LvProp) => !gone.has(p));
    }
    (sp as any).gone = boxes;
    map.doorVer = (map.doorVer || 0) + 1; // (sound gets through it now)
    ((sp as any).cutCells || ((sp as any).cutCells = {}))[s.c + ',' + s.nx + ',' + s.nz] = cells;
    if (bent(s)) tunnelSolids(map, s);
    return { cells, walls, wins };
  }
  // A site from a cut's record [cell, nx, nz] (what's been cut stays one, whatever the grid round it is now)
  function siteAt(map: LvMap, a: number[]): ShSite {
    const W = map.W, TS = Level.TS, x = a[0] % W, z = (a[0] / W) | 0, ax = a[2] ? 1 : 0, az = a[1] ? 1 : 0;
    return { c: a[0], nx: a[1], nz: a[2], x: (x + 0.5) * TS, z: (z + 0.5) * TS, cells: [-1, 0, 1].map((k) => (z + az * k) * W + x + ax * k), ang: a[3] || 0, pt: a[4] || 0 };
  }
  // Every hole she's been breached through but the one the squad's ship is against (site, or none: she's away) shut by an unseen
  // wall: open space past it, nothing to walk out into (what's out there isn't made yet). On the host and every screen alike.
  function seal(map: LvMap, site: number[] | null) {
    const sp = map.sp as any; if (!sp || !map.world) return;
    const Wd = World, w = map.world, W = map.W, TS = Level.TS, H = Level.WALL_H;
    for (const q of sp.seals || []) Wd.remove(w, q);
    sp.seals = [];
    for (const c of sp.cuts as number[][]) {
      if (site && c[0] === site[0] && c[1] === site[1] && c[2] === site[2]) continue;
      for (const cell of (sp.cutCells && sp.cutCells[c.slice(0, 3).join(',')]) || siteAt(map, c).cells) {
        const x = (cell % W) * TS, z = ((cell / W) | 0) * TS;
        sp.seals.push(Wd.add(w, Wd.box(x, -0.6, z, x + TS, H, z + TS, { kind: 'wall', seal: true })));
      }
    }
  }
  const NAMES: Record<string, string> = { bridge: 'Bridge', security: 'Security', gunnery: 'Gun control', engine: 'Engine room', reactor: 'Reactor', cargo: 'Hold', quarters: 'Quarters', barracks: 'Barracks', mess: 'Mess', galley: 'Galley', medbay: 'Sick bay', armoury: 'Armoury', magazine: 'Magazine', vault: 'Vault', brig: 'Brig', pods: 'Escape pods', spine: 'Spine', stairs: 'Stairwell', bay: 'Hangar bay', grove: 'Arboretum', works: 'Machinery hall', mall: 'Promenade court', gallery: 'Gallery' };
  return { lay, finish, fairings, faired, roomAt, sites, siteOf, siteAt, cut, seal, tunnelPath, bent, cutKey, TUN, NAMES, SPEC, HALLS };
})();
