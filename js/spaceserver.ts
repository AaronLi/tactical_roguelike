'use strict';
import { Damage } from './damage.js';
import { ENEMIES } from './data.js';
import { Level } from './level.js';
import { Materials } from './materials.js';
import { Server } from './server.js';
import { ShipGen } from './shipgen.js';
import { SpaceData } from './spacedata.js';
import { SvBattle, SvBat } from './svbattle.js';
import { SuiteView } from './suiteview.js';
import { Radar } from './radar.js';
import { World } from './world.js';
// The host's side of the space direction (docs/space.md), in the simulation's thread with js/server.ts and through its
// SvNet: the missions board (what's offered this visit, which the squad has picked, which are done), the squad's fleet (the
// ships it owns, the one in use, what's fitted), who's in which seat of the ship and where she is (her pilot's game flies
// her and says; it's passed on), the jump to a mission and home again, and a mission's own business aboard a ship: the
// breach, the keycards and the locked doors, the artifact, the wanted officer, the self-destruct and the escape pods, and
// the compartments open to space (a hull window shot out: the air goes, the doors seal, whoever has no suit dies).
// Money: nothing is paid for a kill, an arrest or evidence on a mission (js/server.ts pay); the mission's fee is paid to
// every officer when it's done and the ship has left.
// All that's happened aboard a ship the squad's left (keepOf), for coming back to her as she was (restore): her people where they were
// and as they were (dead, hurt, in restraints, hiding), the dead, what's on her floors, her doors, glass, holes and cabinets
interface SvKeep { enemies: Enemy[]; bodies: any[]; evidence: any[]; loot: any[]; glass: number[]; cracked: [number, number[]][]; holes: any[]; fallen: any[]; doors: [number, any][]; cabs: any; wcase: any; caseOpen: boolean; abox: any; sbox: any; report: any; cards: SvCard[]; hvt: number | null; resp: Map<number, number> }
interface SvCard { key: string; eid: number; x: number; z: number; y: number; st: 0 | 1 | 2 } // (0 carried by one of the crew, 1 on the floor, 2 taken)
interface SvMission {
  ms: SpMission; meta: ShMeta | null; docked: boolean; done: boolean; keys: Record<string, boolean>; cards: SvCard[];
  art: 0 | 1 | 2; artBy: string | null; // (0 where it lies, 1 carried, 2 lost with the ship)
  hvt: number | null; hvtSt: 0 | 1 | 2; hvtAt?: { x: number; y: number; z: number; yaw: number; wear: any } | null; // (0 at large, 1 dead, 2 in restraints; hvtAt: where he was left so)
  gunners?: number[]; gn?: number; // (her gun crew, the ids of those posted in her gun control; how many of them are still at it, last told)
  arm: number | null; boom: boolean; cleared: boolean; unlocked?: number[];
  alarm?: boolean; camOp?: number | null; camOn?: boolean; belief?: { x: number; y: number; z: number; room: number } | null; beliefAt?: number; searchTo?: Map<number, { ri: number; at: number }>; searching?: boolean; sweepAt?: number; respT?: number; safe?: number; shutDoors?: Set<number>; zt: number; leftSaid?: number; revisit?: boolean; cutsWas?: number[][]; keep?: SvKeep | null; breached?: boolean; // (zt: the zone's clock, seconds since the squad came out of the jump: where everything that's under way out there is)
  staff?: string[]; // (holding a liner: her security with the squad, by rank and name)
  def?: { on: boolean; lead: number; t: number; pods: number; lost: boolean; said: number } | null; // (holding a liner, obj defend: begun, seconds left, pods come, all of her passengers dead, what was last told)
  site: number[] | null; raid: number[][]; hold: number; told?: boolean; // (raid: where the pirates' pods are in her hull, as sites; hold: the room their hostages are in)
  // (arm: seconds left on the self-destruct; site: where the squad's ship is against her, or last was)
  resp: Map<number, number>; salv: number[]; // (resp: the breach response squads' people, and the hull each is aboard; salv: the salvage taken, by its number)
  vac: Set<number>; sealT: Map<number, number>; doorRooms: Map<number, number[]> | null; vacT: number; armSay: number;
}
export const SpaceSv = (() => {
  const SD = SpaceData;
  const st = {
    board: { seed: 1, level: 1, picked: [] as number[], done: [] as number[], gone: [] as number[] }, // (gone: flown, done or not: off the board)
    fleet: SD.fleet0(),
    seats: {} as Record<string, number>,
    ship: { docked: true, at: null as number | null, ctl: null as string | null, pose: null as any, hatch: true }, // (hatch: her inner door open; a breach shuts it, its button opens it)
    M: null as SvMission | null,
    rank: 1, // how far the squad has got: what the board's missions are pitched at
  };
  const S = () => Server, net = () => Server.net;
  const offers = () => SD.offers(st.board.seed, st.board.level);
  const goneOf = (B: typeof st.board) => B.gone || (B.gone = B.done.slice()); // (a board kept from before there was gone: what's done is gone)
  const boardMsg = () => ({ t: 'board', seed: st.board.seed, level: st.board.level, picked: st.board.picked, done: st.board.done, gone: goneOf(st.board) });
  const shipMsg = () => ({ docked: st.ship.docked ? 1 : 0, at: st.ship.at, ctl: st.ship.ctl, pose: st.ship.pose, hatch: st.ship.hatch ? 1 : 0 });
  // what a screen needs to be in the hangar (or the space round it), and to be in a mission's level
  const shopMsg = () => ({ board: boardMsg(), fleet: st.fleet, seats: st.seats, ship: shipMsg() });
  // The zone the squad is in (js/spacedata.ts zone): the mission it came for (ms), which of the zone's ships the level is now
  // (active: 0 the mission's), the mission's own state while the squad is aboard another (main), the zone's clock, and what's
  // been carried off the others (loot: paid with the salvage at home).
  interface SvZone { stepN?: number; ms: SpMission; active: number; main: SvMission | null; zt: number; loot: number; cas?: SvCas; kept?: Map<number, SvMission>; casBy?: Record<number, SvCas> } // (kept: the others she's left, as they were left; casBy: what each ship's cost, as it stood when last left)
  // What a mission cost, for its debrief (js/space.ts debrief): the hostiles killed, put down (alive), in restraints; the civilians
  // dead (all of them, and how many by the squad's hand), safe at the end; the squad's own dead. Counted off each ship as she's
  // left (zone), and added up.
  interface SvCas { killed: number; downed: number; arrested: number; civDead: number; civBySquad: number; civSafe: number; squadDead: number }
  function casNow(): SvCas {
    const sv = S() as any, c: SvCas = { killed: 0, downed: 0, arrested: 0, civDead: 0, civBySquad: (sv.report && sv.report.civKilled) || 0, civSafe: 0, squadDead: 0 };
    for (const b of (sv.bodies || new Map()).values()) { if (b.pre) continue; if (b.civ) c.civDead++; else c.killed++; } // (pre: dead before the squad came aboard, a liner's first fight)
    for (const e of sv.enemies.values()) { if (e.def.civ) c.civSafe++; else if (e.state === 'cuffed') c.arrested++; else if (e.down) c.downed++; }
    for (const p of sv.players.values()) if (p.st && p.st.dd) c.squadDead++;
    return c;
  }
  const casAdd = (a: SvCas | undefined, b: SvCas): SvCas => (a ? (Object.fromEntries(Object.keys(b).map((k) => [k, (a as any)[k] + (b as any)[k]])) as unknown as SvCas) : b);
  let Z: SvZone | null = null;
  // her gun crew still at their posts' work: standing, not cuffed, not given up (without them her guns don't fire: js/space.ts guns)
  function gunnersLeft() {
    const M = st.M, sv = S(); if (!M || !M.gunners) return 0;
    return M.gunners.filter((id) => { const e = sv.enemies.get(id); return e && !e.down && e.hp > 0 && e.state !== 'dead' && e.state !== 'cuffed' && e.state !== 'surrender'; }).length;
  }
  function msMsg() {
    const M = st.M; if (!M) return null;
    return { t: 'ms', i: M.ms.i, docked: M.docked ? 1 : 0, done: M.done ? 1 : 0, keys: Object.keys(M.keys).filter((k) => M.keys[k]), cards: M.cards.filter((c) => c.st === 1).map((c) => [c.key, c.x, c.z, c.y]),
      art: M.art, artBy: M.artBy, artAt: M.meta && M.meta.artifact ? [M.meta.artifact.x, M.meta.artifact.z] : null, cuts: M.meta ? M.meta.cuts : [], site: M.site, unlocked: M.unlocked || [], salv: M.salv, hvt: M.hvtSt, hvtId: M.hvt, arm: M.arm == null ? null : Math.ceil(M.arm), boom: M.boom ? 1 : 0, vac: [...M.vac], cleared: M.cleared ? 1 : 0, raid: M.raid, hold: M.hold, zt: Z ? Math.round(Z.zt * 10) / 10 : 0, hostile: M.ms.obj === 'defend' ? 0 : M.ms.obj !== 'visit' || M.breached ? 1 : 0, gn: gunnersLeft(), left: M.ms.obj === 'hostage' || M.ms.obj === 'defend' ? S().remaining(false) : 0, def: M.def ? { on: M.def.on ? 1 : 0, lead: Math.ceil(M.def.lead), t: Math.ceil(M.def.t), pods: M.def.pods, lost: M.def.lost ? 1 : 0, civ: civUp() } : null };
  }
  const levelMsg = () => (st.M ? { zone: Z ? { ms: { seed: Z.ms.seed, size: Z.ms.size, th: Z.ms.th, wing: !!Z.ms.wing, name: Z.ms.name, obj: Z.ms.obj, other: Z.ms.other || null, diff: Z.ms.diff, night: !!Z.ms.night }, act: Z.active, near: Z.active !== 0 || !!st.M.revisit } : null, ms: st.M.ms, gen: genOf(st.M.ms), state: msMsg(), fleet: st.fleet, seats: st.seats, ship: shipMsg(), board: boardMsg() } : null);
  const genOf = (ms: SpMission): SpGen | null => (ms.kind === 'board' ? { size: ms.size!, obj: ms.obj, ship: st.fleet.ship, other: ms.other || null, wing: !!ms.wing } : null);
  const say = (m: string) => net().broadcast({ t: 'chat', id: null, m });
  const sync = () => { const m = msMsg(); if (m) net().broadcast(m); };

  // ---- a run begins: the hangar, the ship on its pad, a fresh board
  function startRun(fleet?: unknown, dbg?: boolean) {
    const sv = S();
    st.rank = 1; st.fleet = SD.cleanFleet(fleet || st.fleet); st.seats = {}; st.M = null;
    st.board = { seed: (Math.random() * 2 ** 31) | 0, level: st.rank, picked: [], done: [], gone: [] };
    st.ship = { docked: true, at: null, ctl: null, pose: null, hatch: true };
    sv.level = 1; sv.team = { ver: 0, items: [] }; sv.arms = {};
    net().broadcast({ t: 'newrun' });
    if (dbg) { sv.toShop(); return; }
    // first everyone's sidearm (the route screen's picker, with no route under it: js/game.ts armsOnly); the base once the
    // whole squad has one (js/server.ts checkArms)
    sv.route = null; sv.routeMap = null; sv.phase = 'route';
    for (const p of sv.players.values()) p.ready = false;
    net().broadcast({ t: 'phase', phase: 'route', level: 1, route: null });
    sv.sendRoster();
  }
  // the ship has set down in the hangar with every mission the squad took on flown: the board turns over (and the squad is that much
  // further on). With some still to fly, it stays as it is: what's done marked done, the rest still theirs
  function landed() {
    const B = st.board;
    if (!goneOf(B).length || B.picked.some((i) => !B.gone.includes(i))) return; // (every one taken flown, done or not)
    st.rank += st.board.done.length;
    S().level = st.rank;
    st.board = { seed: (Math.random() * 2 ** 31) | 0, level: st.rank, picked: [], done: [], gone: [] };
    net().broadcast(boardMsg());
    say('New contracts are on the missions board.');
  }

  // ---- the jump: to mission i's place, or home (to = -1)
  function jump(to: number, from: string) {
    const sv = S();
    if (sv.leaving || !sv.players.has(from)) return;
    if (sv.phase === 'shop' && to >= 0) {
      const ms = offers()[to];
      if (!ms || !st.board.picked.includes(to) || goneOf(st.board).includes(to) || st.ship.docked) return;
      sv.overBlack(() => begin(ms), 'ftl', to);
    } else if (sv.phase === 'level' && to === -1 && st.M && !st.M.docked) {
      sv.overBlack(() => home(), 'ftl', -1);
    }
  }
  function begin(ms: SpMission) {
    Z = { ms, active: 0, main: null, zt: 0, loot: 0 }; // (a new zone: the mission's)
    beginIn(ms);
  }
  // Zone ship k's level made the loaded one: as it was left (kept, restored) if it's been aboard, else fresh (a ship of the zone's
  // that isn't the mission's: a visit). The squad's ship's own state isn't touched (a level made ahead, warm, is made this way too)
  function bringUp(k: number) {
    const zz = Z!, sv = S(), c = SD.zone(zz.ms)[k]; zz.active = k;
    const B = k === 0 ? zz.main : (zz.kept && zz.kept.get(k)) || null;
    if (B) { if (k === 0) zz.main = null; else zz.kept!.delete(k); B.revisit = true; B.meta = null; B.docked = false; B.site = null; B.cards = []; B.resp = new Map(); B.hvt = null; st.M = B; sv.startLevel(B.ms); return; }
    const ms: SpMission = { i: zz.ms.i, kind: 'board', obj: 'visit', size: c.size, th: c.th, seed: c.seed, diff: Math.max(1, zz.ms.diff - 1), pay: 0, name: c.name, brief: SD.OBJ.visit.line, where: SD.SIZES[c.size].name, night: false, ly: 0, anchor: [0, 0, 0], wing: c.wing } as SpMission;
    st.M = missionOf(ms); sv.startLevel(ms);
  }
  // Coming up with a zone ship (the squad's ship within 5 km of it: js/space.ts ewNear): its level made ahead, live beside the loaded
  // one, so it's there when the squad's ship gets to it ('tboard'); going away from it (over 8 km), it's let go (put away once
  // nobody's in it: js/server.ts update). Two made ahead at most.
  const nearK = new Set<number>(); // (the zone ships the squad's ship is near, the one it's at too: 'tboard' keeps that one live)
  function warm(k: number, on: boolean) {
    const sv = S(); if (on) nearK.add(k); else nearK.delete(k);
    if (!Z || sv.phase !== 'level' || !st.M) return;
    const c0 = sv.ctxs.get(k);
    if (!on) { if (c0) c0.warm = false; return; }
    if (c0) { c0.warm = true; return; }
    if (k === Z.active || !SD.zone(Z.ms)[k] || [...sv.ctxs.values()].filter((c) => c.warm).length >= 2) return;
    const home = sv.ctxSave(); sv.quiet = true;
    try { bringUp(k); const c = sv.ctxSave(); c.warm = true; sv.ctxs.set(k, c); } finally { sv.quiet = false; sv.ctxLoad(home); }
  }
  function beginIn(ms: SpMission) {
    const sv = S();
    st.ship.docked = false; st.ship.at = ms.i; st.ship.pose = null;
    st.M = missionOf(ms);
    sv.startLevel(ms);
  }
  function missionOf(ms: SpMission): SvMission {
    return { ms, meta: null, docked: false, done: false, keys: {}, cards: [], art: 0, artBy: null, hvt: null, hvtSt: 0, arm: null, boom: false, cleared: false, zt: 0, site: null, raid: [], hold: -1, resp: new Map(), salv: [], vac: new Set(), sealT: new Map(), doorRooms: null, vacT: 0, armSay: 0 };
  }
  // A ship's complement, by her class (js/spacedata.ts SIZES crew), in place of the usual scatter (js/server.ts spawnEnemies):
  //   those who don't fight (civilians: the mess, the galley, the sick bay, the engine room, cabins, the bridge);
  //   light guards posted singly (a pistol each): the bridge, the spine, the engine room, then wherever;
  //   security squads of four, armed and armoured, weapons out, in the barracks, the armoury, the magazines; their chief with the first;
  //   breach response squads of three, lighter, in the mess and the cabins: when the hull is breached they come to it (respond).
  // A ship that isn't the mission's has a few guards and her crew.
  function crew() {
    const sv = S(), map = sv.map!, meta = map.sp!, M = st.M, TS = Level.TS, L = sv.level, np = Math.max(1, sv.players.size);
    if (M && M.revisit && M.cleared) return; // (come back to, and already hers no longer: nobody's left to fight)
    const hp = 1 + 0.04 * (L - 1) + 0.1 * (np - 1);
    sv.accMult = Math.min(1 + 0.03 * (L - 1), 1.5); sv.dmgMult = 1 + 0.07 * (L - 1); sv.unitsSeen = new Set();
    if (M && M.keep) return; // (come back to: her people are as they were left, restore)
    const used = new Set<string>(), fy = (f: number) => Level.floorMap(map, f).fy || 0;
    const spot = (ri: number) => {
      const rm = map.rooms[ri]; if (!rm) return null;
      const c = map.enemySpots.filter(([x, z, f]) => (f || 0) === (rm.fl || 0) && x >= rm.x && x < rm.x + rm.w && z >= rm.z && z < rm.z + rm.h && !used.has(x + ',' + z + ',' + (f || 0)) && ![...used].some((u) => { const [ux, uz, uf] = u.split(',').map(Number); return uf === (f || 0) && Math.abs(ux - x) + Math.abs(uz - z) < 3; }));
      if (!c.length) return null;
      const s = c[Math.floor(Math.random() * c.length)]; used.add(s[0] + ',' + s[1] + ',' + (s[2] || 0));
      return { x: (s[0] + 0.5) * TS, z: (s[1] + 0.5) * TS, y: fy(s[2] || 0) };
    };
    for (let h = 0; h < meta.hulls.length; h++) {
      // (a cruise liner, the mission's ship: a civilian ship's people, and a high-security ship: two more guards and a security squad more than a cruiser's)
      const liner = h === 0 && meta.hall === 'mall';
      const cls = SpaceData.SIZES[meta.hulls[h].size], C0 = liner ? Object.assign({}, cls.crew, { guard: cls.crew.guard + 2, squads: cls.crew.squads + 1 }) : h === 0 ? cls.crew : { guard: 2, squads: 0, resp: 0, civ: cls.crew.civ - 1 };
      const artShip = h === 0 && !!M && M.ms.obj === 'artifact' && !!meta.artifact, C = artShip ? Object.assign({}, C0, { resp: C0.resp + 1 }) : C0; // (carrying the artifact: a response team more)
      const rooms = (...roles: string[]) => { const out: number[] = []; for (const role of roles) map.rooms.forEach((rm, i) => { if (meta.hullOf[i] === h && meta.roles[i] === role) out.push(i); }); return out; };
      const all = rooms('spine', 'cargo', 'quarters', 'mess', 'barracks', 'engine', 'magazine', 'galley', 'medbay', 'reactor', 'brig');
      const wear = liner && !(M && M.ms.obj === 'hostage') ? 'civil' : SD.wearOf(meta.hulls[h].size, M && M.ms.obj); // (whose she is: what her people are called, js/server.ts titleOf)
      const put = (type: EnemyKind, list: number[], k: number) => { for (let a = 0; a < list.length + all.length; a++) { const ri = a < list.length ? list[(k + a) % list.length] : all[(k + a) % all.length], p = spot(ri); if (p) { const e = sv.addEnemy(type, p.x, p.z, hp, p.y); e.wear = wear; return e; } } return null; };
      // a ship pirates have taken: her people tied in her biggest compartment with three of them standing over it, the rest about
      // the ship, their leader on the bridge. No crew of her own is left to fight, and nobody answers a breach.
      if (M && M.ms.obj === 'hostage' && h === 0) {
        const area = (i: number) => map.rooms[i].w * map.rooms[i].h, hold = rooms('mall', 'mess', 'cargo', 'quarters', 'galley').sort((a, b) => area(b) - area(a))[0] ?? all[0];
        M.hold = hold;
        for (let k = 0; k < cls.crew.civ + 4; k++) { const e = put('civ', [hold], 0); if (e) { e.state = 'cuffed'; e.armed = false; } }
        for (const kd of ['suspect', 'suspect', 'rusher'] as EnemyKind[]) { const e = put(kd, [hold], 0); if (e) { e.guard = true; e.drawn = true; } }
        const about = 4 + Math.min(4, Math.floor(L / 2)) + 2 * (np - 1), rest = all.filter((i) => i !== hold);
        for (let k = 0; k < about; k++) { const e = put(k % 3 === 0 ? 'grunt' : k % 3 === 1 ? 'suspect' : 'rusher', rest.length ? [rest[(k * 2 + 1) % rest.length]] : all, 0); if (e) e.bold = true; }
        const e = put('leader', rooms('bridge'), 0); if (e) e.drawn = true;
        continue;
      }
      // A liner the pirates are coming for (obj defend): nobody of hers fights. Her passengers and her hands are in her shelter (the
      // compartment behind the mezzanine: meta.shelter; else her biggest cabin or mess), and stay there (shelter: js/server.ts).
      if (M && M.ms.obj === 'defend' && h === 0) {
        const area = (i: number) => map.rooms[i].w * map.rooms[i].h, sh = meta.shelter != null && meta.shelter >= 0 ? meta.shelter : rooms('quarters', 'mess', 'cargo').sort((a, b) => area(b) - area(a))[0] ?? all[0];
        const rm = map.rooms[sh], flow = Level.flow(map, [[rm.cx, rm.cz, rm.fl || 0]]);
        M.hold = sh;
        for (let k = 0; k < cls.crew.civ + 4; k++) { const e = put('civ', [sh], 0); if (e) { e.armed = false; e.shelter = { x: e.x, y: e.y || 0, z: e.z, flow, room: sh }; e.home = { x: e.x, y: e.y || 0, z: e.z }; } }
        // Her security: four (one more for each officer past the first), waiting for the squad in her court, on its side (ally: the
        // squad's no target of theirs, js/server.ts foesOf; they fight the pirates as her own, wear civil). They hold where they stand.
        const court = rooms('mall'), names = SD.STAFF.slice().sort(() => Math.random() - 0.5), staff: string[] = []; // (each of her security with the squad has a rank and a name: what they're called on every screen, and in the feed when they shoot someone or are shot)
        // The fight that's already been: the first pirates aboard, and most of her security, dead where they fell about her (not
        // in the shelter): ten of hers and eight of theirs. Why there's only a handful of her people left to help. Bodies from the
        // start (pre: nobody's kill, js/server.ts bodies), each as they'd be called and dressed alive.
        { const where = map.rooms.map((_r, i) => i).filter((i) => meta.hullOf[i] === 0 && i !== sh && !['stairs', 'pods'].includes(meta.roles[i] || ''));
          const dead = (type: EnemyKind, as: string, k: number) => { for (let a = 0; a < where.length; a++) { const p = spot(where[(k * 5 + a * 3) % where.length]); if (!p) continue; const e = sv.addEnemy(type, p.x, p.z, 1, p.y); e.wear = as; e.title = sv.titleOf(e); sv.enemies.delete(e.id); sv.bodies.set(e.id, { id: e.id, type: e.type, def: e.def, x: e.x, y: e.y || 0, z: e.z, yaw: e.yaw, civ: false, secured: false, rec: e, pre: true } as any); return; } }; // (as they fell: not tied, as a body the squad has secured is)
          for (let k = 0; k < 10; k++) dead(k % 3 === 2 ? 'suspect' : 'grunt', 'civil', k);
          for (let k = 0; k < 8; k++) dead(k % 3 === 0 ? 'grunt' : k % 3 === 1 ? 'suspect' : 'rusher', 'pirate', k + 3); }
        for (let k = 0; k < 4 + (np - 1); k++) { const e = put('grunt', court.length ? court : all, 0); if (e) { e.ally = true; e.named = `${k === 0 ? 'Security Lead' : k % 3 === 0 ? 'Senior Security Officer' : 'Security Officer'} ${names[k % names.length]}`; e.title = e.named; staff.push(e.named); e.drawn = true; e.guard = true; e.post = { x: e.x, y: e.y || 0, z: e.z, yaw: e.yaw, flow: sv.flowTo(e.x, e.y || 0, e.z) }; e.home = { x: e.x, y: e.y || 0, z: e.z }; } }
        M.staff = staff;
        continue;
      }
      // those who don't fight: a liner's civilians; a warship's or a pirate's own hands (ratings: a pistol, no stomach for it)
      const civAt = rooms('mess', 'galley', 'medbay', 'engine', 'quarters', 'bridge', 'cargo', 'reactor'), hands: EnemyKind = wear === 'civil' ? 'civ' : 'rating';
      for (let k = 0; k < C.civ; k++) put(hands, civAt, k);
      const post = rooms('bridge', 'spine', 'engine', 'cargo', 'quarters', 'mess');
      // handheld shields (js/data.ts SHIELDS): there's little cover aboard, so each of her fireteams has a point man who carries one
      // (js/server.ts giveShield: first in their stack, leading them on the move, the rest behind him in a fight). The better armed she
      // is (the level), the higher the rating, and so the smaller the shield
      const shieldId = () => { const r = Math.random(); return L <= 3 ? 'sh.3a' : L <= 6 ? (r < 0.6 ? 'sh.3a' : 'sh.3') : r < 0.5 ? 'sh.3' : 'sh.4'; };
      for (let k = 0; k < C.guard + (h === 0 ? np - 1 : 0); k++) { const e = put('suspect', post, k); if (e) e.stay = true; } // (each at a post of its own: no fireteam's)
      // carrying the artifact: her security with it, armed and armoured, weapons out, posted on it (in its compartment, and on its doors
      // when she's boarded: shelter); and more of them the more of the squad there are
      if (artShip) { const ar = ShipGen.roomAt(map, meta.artifact!.x, meta.artifact!.z, 0); if (ar >= 0) for (const kd of ['grunt', 'grunt', 'suspect', ...(np > 1 ? ['grunt'] : [])] as EnemyKind[]) { const e = put(kd, [ar], 0); if (e) { e.stay = true; e.drawn = true; e.artGuard = true; } } }
      const sq = rooms('barracks', 'armoury', 'magazine', 'spine');
      for (let q = 0; q < C.squads; q++) {
        const kinds: EnemyKind[] = [q === 0 ? 'leader' : 'grunt', 'grunt', 'rusher', L >= 3 ? 'heavy' : 'grunt'];
        kinds.forEach((kd, i) => { const e = put(kd, [sq[q % Math.max(1, sq.length)]].filter((v) => v != null), 0); if (e) { e.drawn = true; if (i === 1) sv.giveShield(e, shieldId()); } }); // (the second, a grunt, their point man)
      }
      // her security office (frigates and up): one on the cameras, watching the ship
      if (h === 0 && M) { const so = rooms('security'); if (so.length) { const e = put('suspect', so, 0); if (e) { M.camOp = e.id; e.stay = true; } } }
      // her gun crew: two at gun control for each hull that has guns (the boarded ship's are what her guns need: gunnersLeft)
      const G0 = SpaceData.gunsOf(meta.hulls[h].size, liner);
      if (G0.pd + G0.mg + G0.missile > 0) for (let k = 0; k < 2; k++) { const e = put('suspect', rooms('gunnery'), k); if (e) e.stay = true; if (e && M && h === 0) (M.gunners = M.gunners || []).push(e.id); }
      const rs = rooms('mess', 'quarters', 'spine', 'cargo');
      for (let q = 0; q < C.resp; q++) (['suspect', 'rusher', 'suspect'] as EnemyKind[]).forEach((kd, i) => { const e = put(kd, [rs[q % Math.max(1, rs.length)]].filter((v) => v != null), 0); if (e && M) M.resp.set(e.id, h); if (e && i === 0) sv.giveShield(e, shieldId()); }); // (the first of each with a shield: their point man)
    }
  }
  // ---- Her response to being boarded, by what she is (each hull of hers by its class):
  //   a civilian transport or a corvette: shelter. Her people are got to the safest compartment she has (the farthest from where the
  //     squad is, with the fewest ways in, none locked to her own crew), her guards and her breach team posted in its doorways, watching
  //     the way in; nobody goes looking for the squad.
  //   a frigate, a cruiser, a capital ship: sweep. The leaders of her fireteams (js/server.ts teamForm) are told the compartment they
  //     think the squad is in, and each sends his team to clear it (command, dispatch: each by its own way in, then searching outward);
  //     a leader who's seen the squad himself in the last few seconds goes on that instead (his own calls: callIn). With someone at her security office's
  //     cameras that's where the squad is, as they move; without, the breach, then wherever one of her crew last saw them.
  // The alarm's the breach (unless the squad's ship jammed her: then the first of her crew to see them).
  const doctrine = (h: number) => { const M = st.M, sz = M && M.meta && M.meta.hulls[h] ? M.meta.hulls[h].size : 'small'; return SpaceData.drill(sz, h === 0 && !!(M && M.meta && M.meta.wing)) === 'informal' ? 'shelter' : 'sweep'; }; // (informal, practiced: as the mission board has it, js/spacedata.ts drill)
  function alarm(x: number, z: number) {
    const sv = S(), M = st.M, map = sv.map; if (!M || !M.meta || !map || M.alarm || M.ms.obj === 'hostage' || M.ms.obj === 'defend') return;
    M.alarm = true;
    const ri = ShipGen.roomAt(map, x, z, 0), hull = ri >= 0 ? M.meta.hullOf[ri] : 0;
    M.belief = { x, y: 0, z, room: ri }; M.sweepAt = -1e9;
    if (doctrine(hull) === 'shelter') shelter(hull, x, z);
    else respond(x, z);
  }
  // her people to the safest compartment, her guards in its doorways
  function shelter(hull: number, x: number, z: number) {
    const sv = S(), M = st.M!, map = sv.map!, meta = M.meta!, L = Level, TS = L.TS;
    const from = sv.flowTo(x, 0, z), locked = (d: LvDoor) => !!meta.locks[d.id];
    const doorsOf = (i: number) => map.doors.filter((d) => { const rr = doorRooms(M).get(d.id) || []; return rr.includes(i); });
    let best = -1, bs = -1e9;
    map.rooms.forEach((rm, i) => {
      if (meta.hullOf[i] !== hull || (rm.fl || 0) !== 0 || ['spine', 'pods', 'stairs', 'engine', 'reactor'].includes(meta.roles[i] || '')) return;
      const ds = doorsOf(i); if (!ds.length || ds.some(locked)) return;
      const g = sv.flowDist(from, (rm.cx + 0.5) * TS, 0, (rm.cz + 0.5) * TS); if (g < 0) return;
      const sc = g - 12 * ds.length + rm.w * rm.h * 0.05; // (far from the squad, few ways in, room for everyone)
      if (sc > bs) { bs = sc; best = i; }
    });
    if (best < 0) { respond(x, z); return; }
    M.safe = best;
    const rm = map.rooms[best], flow = L.flow(map, [[rm.cx, rm.cz, 0]]), spots = map.enemySpots.filter(([sx, sz, f]) => (f || 0) === 0 && sx >= rm.x && sx < rm.x + rm.w && sz >= rm.z && sz < rm.z + rm.h && ShipGen.roomAt(map, (sx + 0.5) * TS, (sz + 0.5) * TS, 0) === best && !map.doors.some((d) => Math.hypot(d.x - (sx + 0.5) * TS, d.z - (sz + 0.5) * TS) < 1.6)); // (in it, not just in the box round it; and clear of its doorways, so its doors can be shut)
    const spot = (k: number) => { const s = spots.length ? spots[k % spots.length] : [rm.cx, rm.cz]; return { x: (s[0] + 0.5) * TS + (Math.random() - 0.5) * 0.4, y: 0, z: (s[1] + 0.5) * TS + (Math.random() - 0.5) * 0.4 }; };
    const onHull = (e: any) => { const r = ShipGen.roomAt(map, e.x, e.z, 0); return r >= 0 && meta.hullOf[r] === hull; };
    let k = 0;
    const d0 = doorsOf(best)[0], dx0 = d0 ? d0.x : (rm.cx + 0.5) * TS, dz0 = d0 ? d0.z : (rm.cz + 0.5) * TS;
    for (const e of sv.enemies.values()) if (e.def.timid && e.state === 'normal' && !e.down && onHull(e)) { const p = spot(k++); e.post = Object.assign(p, { yaw: Math.atan2(-(dx0 - p.x), -(dz0 - p.z)), flow }); e.home = { x: p.x, y: 0, z: p.z }; e.walkTo = null; } // (her ratings: in with them, guns on the door)
    for (const e of sv.enemies.values()) if (e.def.civ && e.state !== 'cuffed' && !e.down && onHull(e)) { const p = spot(k++); e.shelter = Object.assign(p, { flow, room: best }); e.state = e.state === 'cower' || e.state === 'hide' || e.state === 'flee' ? 'normal' : e.state; e.hide = null; e.crouch = false; e.home = { x: p.x, y: 0, z: p.z }; }
    // the doorways: two posts outside each, on the wall either side of it, facing out along the way the squad would come; the rest
    // a few metres further out on that way (in the room, only where there's no floor outside to stand on)
    type Post = { x: number; y: number; z: number; yaw: number; flow: Int16Array };
    const t0 = L.floorMap(map, 0).t, fl = (x: number, z: number) => L.flow(map, [[Math.floor(x / TS), Math.floor(z / TS), 0]]);
    const doorPosts = (ri: number) => {
      const r = map.rooms[ri], posts: Post[] = [], spare: Post[] = [], cx = (r.cx + 0.5) * TS, cz = (r.cz + 0.5) * TS;
      const open = (x: number, z: number) => { const tx = Math.floor(x / TS), tz = Math.floor(z / TS); return tx >= 0 && tz >= 0 && tx < map.W && tz < map.H && t0[tz * map.W + tx] === 0 && ShipGen.roomAt(map, x, z, 0) !== ri && !(sv.aiProp && sv.aiProp[tz * map.W + tx]); };
      for (const d of doorsOf(ri)) {
        const ax = d.axis === 'x' ? 1 : 0, az = d.axis === 'z' ? 1 : 0, sgn = -(ax ? Math.sign(cx - d.x) || 1 : Math.sign(cz - d.z) || 1); // (sgn: out of the room)
        const yaw = Math.atan2(-(ax * sgn), -(az * sgn)); // (facing out)
        for (const side of [-1, 1]) {
          let p: { x: number; z: number } | null = null;
          // (clear of the doorway's mouth, so her people can get past them into it)
          for (const [o, w] of [[0.9, 1.25], [0.6, 1.25], [0.9, 1.0], [0.55, 0.95], [0.9, 0.6]]) { const px = d.x + ax * sgn * o + az * side * w, pz = d.z + az * sgn * o + ax * side * w; if (open(px, pz)) { p = { x: px, z: pz }; break; } }
          if (p && !posts.some((q) => Math.hypot(q.x - p!.x, q.z - p!.z) < 0.4)) posts.push({ x: p.x, y: 0, z: p.z, yaw, flow: fl(p.x, p.z) });
        }
        for (const os of [[3.2, 2.4], [4.8, 4.2]]) for (const o of os) { const px = d.x + ax * sgn * o, pz = d.z + az * sgn * o; if (open(px, pz)) { spare.push({ x: px, y: 0, z: pz, yaw, flow: fl(px, pz) }); break; } }
      }
      return { all: posts.concat(spare), cx, cz };
    };
    const guards = [...sv.enemies.values()].filter((e) => !e.def.civ && !e.def.timid && !e.def.leader && e.state === 'normal' && !e.down && onHull(e) && e.id !== M.camOp && !(M.gunners || []).includes(e.id) && !(M.cards.some((c) => c.eid === e.id)));
    // (a ship carrying the artifact, still aboard her: her guards split between its compartment's doors and her people's, those posted
    // with it at its doors first, the rest by which they're nearer)
    const ar = M.ms.obj === 'artifact' && M.art === 0 && meta.artifact ? ShipGen.roomAt(map, meta.artifact.x, meta.artifact.z, 0) : -1;
    const art = ar >= 0 && ar !== best && meta.hullOf[ar] === hull && doorsOf(ar).length ? doorPosts(ar) : null;
    const shel = doorPosts(best);
    const send = (e: Enemy, p: Post) => { e.post = p; e.home = { x: p.x, y: 0, z: p.z }; e.walkTo = null; e.bold = false; e.lurk = false; e.hide = null; }; // (to their posts, not hiding where they were)
    let toArt: Enemy[] = [], toShel = guards;
    if (art) {
      const dA = (e: Enemy) => Math.hypot(e.x - art.cx, e.z - art.cz), dS = (e: Enemy) => Math.hypot(e.x - shel.cx, e.z - shel.cz);
      const q = Math.min(art.all.length, Math.max(2, Math.ceil(guards.length / 2)));
      const order = guards.slice().sort((a, b) => (b.artGuard ? 1 : 0) - (a.artGuard ? 1 : 0) || (dA(a) - dS(a)) - (dA(b) - dS(b)));
      toArt = order.slice(0, q); toShel = order.slice(q);
      toArt.sort((a, b) => dA(a) - dA(b)).forEach((e, i) => send(e, art.all[i]));
    }
    toShel.sort((a, b) => Math.hypot(a.x - shel.cx, a.z - shel.cz) - Math.hypot(b.x - shel.cx, b.z - shel.cz));
    toShel.slice(0, Math.max(shel.all.length, 2)).forEach((e, i) => send(e, shel.all[i] || Object.assign(spot(100 + i), { yaw: 0, flow })));
    if (art) say(`Her guards are splitting: some to ${meta.roles[ar] ? 'the ' + ShipGen.NAMES[meta.roles[ar]!].toLowerCase() : 'the artifact'}, holding its doors.`);
    say(`Her crew are falling back to ${meta.roles[best] ? 'the ' + ShipGen.NAMES[meta.roles[best]!].toLowerCase() : 'one compartment'}, her guards on its doors.`);
  }
  // A spot nobody but her sheltering people (and those posted inside with them) should go to hide in or take cover at: the safe
  // compartment, once there is one (js/server.ts findHide)
  function offLimits(e: any, x: number, z: number) {
    const M = st.M, sv = S(), map = sv.map; if (!M || M.safe == null || M.safe < 0 || !map) return false;
    if (e.shelter || (e.post && ShipGen.roomAt(map, e.post.x, e.post.z, 0) === M.safe)) return false;
    return ShipGen.roomAt(map, x, z, 0) === M.safe;
  }
  // The safe compartment's doors: a guard by one that's open (within 2 m: his post's beside it, clear of its mouth) shuts it as he passes, once her people are in (nobody sent there still
  // outside) and he's no threat on him (nobody in sight, none for a while, not shot at)
  function shut(room: number) {
    const sv = S(), M = st.M!, map = sv.map!, c = sv.clock || 0;
    const out = [...sv.enemies.values()].some((e) => e.shelter && e.shelter.room === room && !e.down && e.state !== 'cuffed' && e.state !== 'surrender' && ShipGen.roomAt(map, e.x, e.z, 0) !== room);
    if (out) return;
    // (nor while a guard who's posted outside is still in there: he'd shut himself in with them)
    const inside = (x: number, z: number) => ShipGen.roomAt(map, x, z, 0) === room;
    // (nor while anyone posted inside, her ratings with them, is still on their way in)
    if ([...sv.enemies.values()].some((e) => e.post && sv.able(e) && inside(e.post.x, e.post.z) && !inside(e.x, e.z))) return;
    if ([...sv.enemies.values()].some((e) => e.post && !e.def.civ && sv.able(e) && !inside(e.post.x, e.post.z) && inside(e.x, e.z))) return;
    for (const d of map.doors) {
      if (!d.open || d.fallen || !(doorRooms(M).get(d.id) || []).includes(room)) continue;
      const g = [...sv.enemies.values()].find((e) => e.post && !e.def.civ && sv.able(e) && !inside(e.x, e.z) && Math.hypot(e.x - d.x, e.z - d.z) < 2.0 && !e.canSee && c - (e.sawAt ?? -99) > 8 && c - (e.hitAt ?? -99) > 8 && c - (e.noiseAt ?? -99) > 4);
      if (!g) continue;
      const busy = [...sv.enemies.values()].some((e) => Math.hypot(e.x - d.x, e.z - d.z) < 0.7) || [...sv.players.values()].some((p: any) => p.st && Math.hypot(p.st.p[0] - d.x, p.st.p[2] - d.z) < 1.2); // (nobody in the doorway)
      if (!busy) { sv.setDoor(d.id, false); (M.shutDoors || (M.shutDoors = new Set())).add(d.id); }
    }
  }
  // each ship-response tick (respondTick): what the cameras show, what her crew have seen, and her teams sent to it
  function respondTick(dt: number) {
    const sv = S(), M = st.M, map = sv.map; if (!M || !M.meta || !map || M.ms.obj === 'hostage' || M.ms.obj === 'defend') return;
    M.respT = (M.respT || 0) - dt; if (M.respT > 0) return; M.respT = M.camOn ? 0.5 : 1; // (with her cameras on the squad: twice as often)
    const meta = M.meta, alive = [...sv.players.values()].filter((p: any) => p.st && !p.st.dd);
    // the alarm, if the breach didn't ring it: the first of her crew to see the squad
    if (!M.alarm) { for (const e of sv.enemies.values()) if (!e.def.civ && e.alert && e.lastSeen) { alarm(e.lastSeen.x, e.lastSeen.z); break; } if (!M.alarm) return; }
    sv.markSeen(); // (the rooms her people are in, and see there's nobody: searched)
    if (M.safe != null && M.safe >= 0) shut(M.safe);
    // her cameras: someone at them, on their feet, not given up
    const op = M.camOp != null ? sv.enemies.get(M.camOp) : null, opRoom = op ? ShipGen.roomAt(map, op.x, op.z, op.fl || 0) : -1;
    const cam = !!op && !op.down && op.state === 'normal' && opRoom >= 0 && meta.roles[opRoom] === 'security';
    if (cam !== !!M.camOn) { M.camOn = cam; if (cam) say('Her security office has you on camera: her teams know where you are.'); else if (M.camOp != null) say('Her cameras are out: her teams are guessing now.'); }
    const hull0 = (x: number, z: number) => { const r = ShipGen.roomAt(map, x, z, 0); return r >= 0 ? meta.hullOf[r] : -1; };
    // where they think the squad is
    let B = M.belief || null;
    // (on her cameras: those of the squad inside her, not still aboard their own ship at the breach: till then, the breach is where they are)
    const aboard = alive.filter((p: any) => { const r = sv.roomOf(p.st.p[0], p.st.p[1] || 0, p.st.p[2]); return r >= 0 && meta.hullOf[r] != null; });
    if (cam && aboard.length) {
      const p = aboard.reduce((a: any, q: any) => (!B || Math.hypot(q.st.p[0] - B.x, q.st.p[2] - B.z) < Math.hypot(a.st.p[0] - B.x, a.st.p[2] - B.z) ? q : a), aboard[0]);
      B = { x: p.st.p[0], y: p.st.p[1], z: p.st.p[2], room: ShipGen.roomAt(map, p.st.p[0], p.st.p[2], 0) }; M.beliefAt = sv.clock;
    } else {
      let last: any = null;
      for (const e of sv.enemies.values()) if (!e.def.civ && e.lastSeen && (e.sawAt || -1) > (last ? last.sawAt : -1)) last = e;
      if (last && (last.sawAt || 0) > (M.sweepAt || -1e9) && (last.sawAt || 0) > (M.beliefAt ?? -1e9)) { B = { x: last.lastSeen.x, y: last.lastSeen.y || 0, z: last.lastSeen.z, room: ShipGen.roomAt(map, last.lastSeen.x, last.lastSeen.z, 0) }; M.beliefAt = last.sawAt; }
    }
    if (!B) return;
    const moved = !M.belief || M.belief.room !== B.room; M.belief = B;
    const hull = hull0(B.x, B.z); if (hull < 0 || doctrine(hull) !== 'sweep') return;
    // blind (no cameras) and where they last had the squad has been cleared since, empty: they search outward from it, room by room
    if (!cam && B.room >= 0 && (sv.cleared.get(B.room) ?? -1e9) > (M.beliefAt ?? 0)) { search(B, hull); return; }
    if (M.searching) { M.searching = false; M.searchTo = new Map(); }
    // her fireteams' leaders: told when the squad's in a new compartment, or again a while after the last; each sends his own team.
    // One who's had eyes on the squad in the last few seconds knows better than the ship does, and is left to it.
    // (on her cameras: again every 8 s, and the moment they're in another compartment, the teams whose stacks haven't gone in yet
    // let go of them to take it; blind, every 25 s)
    if (!moved && sv.clock - (M.sweepAt || -1e9) < (cam ? 8 : 25)) return;
    if (moved && cam) for (const l of sv.enemies.values()) if (sv.leads(l) && !l.canSee && hull0(l.x, l.z) === hull) sv.dropStack(l);
    const where = B.room >= 0 && meta.roles[B.room] ? 'the ' + ShipGen.NAMES[meta.roles[B.room]!].toLowerCase() : 'where they were seen';
    let told = 0;
    for (const l of sv.enemies.values()) {
      if (!sv.leads(l) || l.post || l.canSee || sv.clock - (l.sawAt ?? -99) < 8 || hull0(l.x, l.z) !== hull) continue;
      if (sv.command(l, B.x, B.y, B.z, `the ship: sweep ${where}`)) told++;
    }
    if (!told) return;
    M.sweepAt = sv.clock;
    if (moved && M.camOn) say(`Her teams are moving on ${B.room >= 0 && meta.roles[B.room] ? 'the ' + ShipGen.NAMES[meta.roles[B.room]!].toLowerCase() : 'your position'}.`);
  }
  // Blind, and the last place they had the squad is empty: each of her fireteams' leaders with nothing on (not breaching a room, not in a
  // fight, not posted) is sent to the nearest room to it (along the ways through her) that nobody's cleared since, and nobody else is
  // on; so they work outward from it, a room each, till they find the squad or have been through her (and then round again).
  function search(B: { x: number; y: number; z: number; room: number }, hull: number) {
    const sv = S(), M = st.M!, map = sv.map!, meta = M.meta!, TS = Level.TS, c = sv.clock, since = M.beliefAt ?? 0;
    if (!M.searching) { M.searching = true; M.searchTo = new Map(); say('Her teams have lost you: they are searching her, room by room.'); }
    const to = M.searchTo!, from = sv.flowTo(B.x, B.y, B.z);
    const claimed = new Set<number>();
    for (const [id, a] of to) { const l = sv.enemies.get(id); if (l && (sv.breaching(l) || c - a.at < 6)) claimed.add(a.ri); else to.delete(id); } // (his: from the word, while he gets on the radio and his team on it, till it's clear)
    // a spot to send them to in each room: its middle, or the nearest place in it they can stand
    const spotIn = (i: number) => {
      const rm = map.rooms[i], cx = (rm.cx + 0.5) * TS, cz = (rm.cz + 0.5) * TS;
      if (sv.flowDist(from, cx, 0, cz) >= 0) return { x: cx, z: cz };
      let best: { x: number; z: number } | null = null, bd = 1e9;
      for (const [sx, sz, f] of map.enemySpots) { if ((f || 0) || sx < rm.x || sx >= rm.x + rm.w || sz < rm.z || sz >= rm.z + rm.h) continue; const x = (sx + 0.5) * TS, z = (sz + 0.5) * TS, d = Math.hypot(x - cx, z - cz); if (d < bd && sv.flowDist(from, x, 0, z) >= 0) { bd = d; best = { x, z }; } }
      return best;
    };
    const open = () => { const out: { i: number; g: number; p: { x: number; z: number } }[] = [];
      map.rooms.forEach((rm, i) => { if ((rm.fl || 0) || meta.hullOf[i] !== hull || meta.roles[i] === 'pods' || claimed.has(i) || (sv.cleared.get(i) ?? -1e9) > since) return; const p = spotIn(i); if (!p) return; const g = sv.flowDist(from, p.x, 0, p.z); if (g >= 0) out.push({ i, g, p }); });
      return out.sort((a, b) => a.g - b.g); };
    let rooms = open();
    if (!rooms.length && !claimed.size) { M.beliefAt = c; rooms = open(); } // (been through all of her: round again)
    for (const l of sv.enemies.values()) {
      if (!rooms.length) break;
      if (!sv.leads(l) || l.post || l.canSee || c - (l.sawAt ?? -99) < 8 || hull0of(l) !== hull || to.has(l.id) || sv.breaching(l) || (l.radioT || 0) > 0) continue;
      const r = rooms[0], name = meta.roles[r.i] ? 'the ' + ShipGen.NAMES[meta.roles[r.i]!].toLowerCase() : 'the next compartment';
      if (sv.command(l, r.p.x, 0, r.p.z, `the ship: search ${name}`)) { to.set(l.id, { ri: r.i, at: c }); claimed.add(r.i); rooms.shift(); M.sweepAt = c; }
    }
    function hull0of(e: { x: number; z: number }) { const ri = ShipGen.roomAt(map, e.x, e.z, 0); return ri >= 0 ? meta.hullOf[ri] : -1; }
  }
  // the hull's been breached there: her response squads come to it (what they do when they've heard something and mean to look)
  function respond(x: number, z: number) {
    const sv = S(), M = st.M, map = sv.map; if (!M || !M.meta || !map) return;
    const ri = ShipGen.roomAt(map, x, z, 0), hull = ri >= 0 ? M.meta.hullOf[ri] : 0;
    let n = 0;
    for (const [id, h] of M.resp) {
      const e = sv.enemies.get(id); if (!e || h !== hull || e.down || e.state !== 'normal') continue;
      e.bold = true; sv.suspect(e, x, z); sv.noted(e, x, 0, z); e.drawn = true; n++;
    }
    if (n) say('Her breach response team is moving.');
  }
  // the level is built and the crew is aboard her (js/server.ts startLevel calls it before it tells anyone): the mission's own people
  // A ship being left: all that's happened aboard her (SvKeep), her people as they are but with nothing in hand that's of this visit
  // (where they were going and how, their orders, what they were shooting at), to be taken up afresh when she's come back to
  function keepOf(): SvKeep {
    const sv = S() as any, map = sv.map, M = st.M!;
    const enemies = [...sv.enemies.values()].map((e: Enemy) => {
      const o: any = e;
      o.order = null; o.cover = null; o.inCover = false; o.coverFlow = null; o.dp = null; o.trv = undefined; o.dodge = null; o.walkTo = null; o.tgt = null; o.canSee = false; o.aiming = false; o.peek = false; o.peeking = false;
      o.threat = null; o.callTgt = null; o.guess = null; o.shieldBy = undefined; o.clearOut = null; o.dragTo = null; o.pushing = false; o.relocate = false;
      if (o.hide) delete o.hide.flow; if (o.post) o.post.flow = undefined; if (o.shelter) o.shelter.flow = undefined;
      return e;
    });
    return { enemies, bodies: [...sv.bodies.values()], evidence: sv.evidence || [], loot: [...(sv.loot || new Map()).values()], glass: [...(sv.glassBroken || [])], cracked: sv.glassCracked || [], holes: sv.holes || [], fallen: sv.fallen || [],
      doors: map ? map.doors.map((d: any) => [d.open ? 1 : 0, d.hp ? { ...d.hp } : null]) : [], cabs: sv.cabs, wcase: sv.wcase, caseOpen: !!sv.caseOpen, abox: sv.abox, sbox: sv.sbox, report: sv.report, cards: M.cards, hvt: M.hvt, resp: M.resp };
  }
  // Come back to a ship left before (js/server.ts startLevel, once she's laid out again from her seed): put back as she was left (keepOf).
  // True if she was.
  function restore() {
    const sv = S() as any, M = st.M, k = M && M.keep, map = sv.map;
    if (!M || !k || !map) return false;
    M.keep = null;
    sv.enemies.clear(); for (const e of k.enemies) sv.enemies.set(e.id, e);
    sv.nextEid = Math.max(sv.nextEid || 0, ...k.enemies.map((e) => e.id + 1), ...k.bodies.map((b) => (b.id < 900000 ? b.id + 1 : 0)));
    sv.bodies = new Map(k.bodies.map((b) => [b.id, b])); sv.evidence = k.evidence; sv.loot = new Map(k.loot.map((l) => [l.id, l]));
    sv.cabs = k.cabs; sv.wcase = k.wcase; sv.caseOpen = k.caseOpen; sv.abox = k.abox; sv.sbox = k.sbox; sv.report = k.report;
    M.cards = k.cards; M.hvt = k.hvt; M.resp = k.resp;
    // her plating, doors and glass as the squad left them (the holes and fallen doors over again, as whoever joins has them)
    k.doors.forEach(([o, hp], i) => { const d = map.doors[i]; if (!d) return; if (hp) d.hp = hp; if (d.open !== !!o) { d.open = !!o; World.door(map.world, map, d); } });
    sv.holes = k.holes; for (const h of k.holes) Damage.apply(map, h);
    sv.fallen = k.fallen; for (const [i, ...f] of k.fallen) { const d = map.doors[i]; if (d) Damage.fall(map, d, ...(f as [any, any, any])); }
    const ws = map.windows || [];
    sv.glassBroken = new Set(k.glass); for (const id of k.glass) if (ws[id]) { ws[id].broken = true; World.windowSolids(map.world, map, ws[id]); }
    sv.glassCracked = k.cracked; for (const [id] of k.cracked) if (ws[id]) ws[id].cracked = (ws[id].cracked || 0) + 1;
    map.doorVer = (map.doorVer || 0) + 1;
    return true;
  }
  function populate() {
    const M = st.M, sv = S(), map = sv.map;
    if (!M || !map) return;
    const meta = M.meta = map.sp || null, TS = Level.TS;
    if (!meta) return; // (a base on a planet: nothing but the people in it)
    const spotIn = (ri: number) => { const rm = map.rooms[ri]; if (!rm) return null; const c = map.enemySpots.filter(([x, z, f]) => (f || 0) === (rm.fl || 0) && x >= rm.x && x < rm.x + rm.w && z >= rm.z && z < rm.z + rm.h); const s = c.length ? c[Math.floor(Math.random() * c.length)] : [rm.cx, rm.cz]; return { x: (s[0] + 0.5) * TS, z: (s[1] + 0.5) * TS, y: Level.floorMap(map, rm.fl || 0).fy || 0 }; };
    const hp = 1 + 0.04 * (sv.level - 1) + 0.1 * (Math.max(1, sv.players.size) - 1);
    // (come back to: the holes the squad left in her are still there)
    for (const q of M.cutsWas || []) ShipGen.cut(map, ShipGen.siteAt(map, q));
    M.cutsWas = undefined;
    ShipGen.seal(map, null);
    // the pirates' own pods, still in her hull where they came through: two or three, apart from each other (nobody else can come in there)
    if (M.ms.obj === 'hostage' && !M.raid.length) {
      const W = map.W, want = Math.random() < 0.5 ? 2 : 3, by = Math.floor(meta.breach.z / TS) * W + Math.floor(meta.breach.x / TS), ss = ShipGen.sites(map).slice().sort(() => Math.random() - 0.5), far = (c: number, q: number[], m = 6.5) => Math.hypot(c % W - q[0] % W, ((c / W) | 0) - ((q[0] / W) | 0)) * TS > m; // (metres: a pod is four across, the squad's ship nine)
      for (const s of ss) { if (M.raid.length < want && M.raid.every((q) => far(s.c, q)) && far(s.c, [by], 9)) M.raid.push([s.c, s.nx, s.nz]); } // (and clear of the marked stretch: the squad's own way in)
    }
    if (M.keep) return; // (come back to: he and the keycards' carriers are where they were, restore)
    if (M.ms.obj === 'hvt' && M.hvtSt === 0) {
      const p = spotIn(meta.hvtRoom);
      if (p) { const e = sv.addEnemy('leader', p.x, p.z, hp * 1.4, p.y); e.guard = true; e.drawn = true; M.hvt = e.id; e.wear = SD.wearOf(meta.hulls[meta.hullOf[meta.hvtRoom] || 0].size, M.ms.obj); }
    } else if (M.ms.obj === 'hvt' && M.revisit && M.hvtAt) {
      // (come back to her once he's been dealt with: he's where he was left, dead or in restraints, not at large again. Her crew are at
      // their posts again, and her own officers among them: one of those isn't him)
      const a = M.hvtAt;
      if (M.hvtSt === 2) { const e = sv.addEnemy('leader', a.x, a.z, hp * 1.4, a.y); e.state = 'cuffed'; e.armed = false; e.yaw = a.yaw; e.drawn = true; if (a.wear) e.wear = a.wear; M.hvt = e.id; }
      else { // (his body: kept under a number no one living has, as the dead are by their own)
        const id = 900000 + M.ms.i; sv.bodies.set(id, { id, type: 'leader', def: (ENEMIES as any).leader, x: a.x, y: a.y, z: a.z, yaw: a.yaw, civ: false, secured: false, rec: null } as any); }
    }
    // a keycard's carrier: someone armed already in (or nearest) the room they'd be in, else one more of the crew there
    if (M.ms.obj !== 'defend') for (const key of Object.keys(meta.cardRooms)) { // (a liner being held: nobody of hers is armed, and nothing's locked against the squad that matters)
      const p = spotIn(meta.cardRooms[key]); if (!p || M.keys[key]) continue;
      let best: Enemy | null = null, bd = 9;
      for (const e of sv.enemies.values()) { if (e.def.civ || e.id === M.hvt || M.cards.some((c) => c.eid === e.id) || Math.abs((e.y || 0) - p.y) > 2) continue; const d = Math.hypot(e.x - p.x, e.z - p.z); if (d < bd) { bd = d; best = e; } }
      const e = best || Object.assign(sv.addEnemy('grunt', p.x, p.z, hp, p.y), { wear: SD.wearOf(meta.hulls[meta.hullOf[meta.cardRooms[key]] || 0].size, M.ms.obj) });
      M.cards.push({ key, eid: e.id, x: e.x, z: e.z, y: e.y || 0, st: 0 });
    }
  }
  // out of the mission's space: paid if it's done, and the hangar's space again (the ship at that mission's anchor)
  function home() {
    const sv = S(); let M = st.M;
    if (M) {
      const V = M.ms.obj === 'visit' && Z && Z.main ? M : null; // (jumped home from a ship that isn't the mission's)
      if (V) M = Z!.main!;
      // (salvage off every ship but the mission's that she's been aboard, the one she's jumped from among them; and what each ship cost,
      // as it stood when she last left her, this one as she is now)
      const vis = Z ? [...(Z.kept || new Map()).values()].filter((q) => q.ms.obj === 'visit' && q !== V).concat(V ? [V] : []) : [];
      if (Z) (Z.casBy = Z.casBy || {})[Z.active] = casNow();
      const ok = finished(M), nSalv = M.salv.length + vis.reduce((a, q) => a + q.salv.length, 0), cas = Object.values((Z && Z.casBy) || { 0: casNow() }).reduce((a: SvCas | undefined, b) => casAdd(a, b), undefined as SvCas | undefined)!;
      if (nSalv) net().broadcast({ t: 'mdone', i: M.ms.i, ok: 2, pay: nSalv * (350 + 60 * M.ms.diff), name: 'Salvage', ships: vis.filter((q) => q.salv.length).length });
      if (ok && !st.board.done.includes(M.ms.i)) {
        st.board.done.push(M.ms.i);
        const freed = M.ms.obj === 'defend' ? civUp() : M.ms.obj === 'hostage' ? [...sv.enemies.values()].filter((e) => e.def.civ && e.state !== 'dead' && e.hp > 0).length : 0;
        const bonus = M.ms.obj === 'hvt' && M.hvtSt === 2 ? Math.round(M.ms.pay * 0.5) : freed * 120;
        net().broadcast({ t: 'mdone', i: M.ms.i, ok: 1, pay: M.ms.pay, bonus, name: M.ms.name, diff: M.ms.diff, ms: M.ms, cas, freed, salv: nSalv ? nSalv * (350 + 60 * M.ms.diff) : 0, hvt: M.ms.obj === 'hvt' ? M.hvtSt : undefined });
      }
      // flown: off the board, done or not (each screen keeps it till its debrief's closed: js/space.ts isGone)
      if (M.ms.obj !== 'visit' && !goneOf(st.board).includes(M.ms.i)) { st.board.gone.push(M.ms.i); net().broadcast(boardMsg()); }
      if (!ok) net().broadcast({ t: 'mdone', i: M.ms.i, ok: 0, pay: 0, name: M.ms.name, diff: M.ms.diff, ms: M.ms, cas, salv: nSalv ? nSalv * (350 + 60 * M.ms.diff) : 0 });
      st.ship.at = M.ms.i;
    }
    st.M = null; Z = null; st.ship.docked = false; st.ship.pose = null;
    sv.enemies.clear();
    sv.level = st.rank;
    sv.toShop();
  }
  // ---- Holding a liner (obj defend). Her passengers are in her shelter (M.hold). From when the squad's aboard there are DEFEND.lead
  // seconds before anything happens (to get to her court in); then, for DEFEND.secs:
  // a pirate pod comes through her hull every so often (DEFEND.pods of them in that time, the first after DEFEND.first seconds),
  // anywhere along her lowest deck that's clear of the squad's own ship and of the pods already in her, and its boarders come
  // out of it inside her: three, more with her class's danger and with the squad's numbers. They make for the shelter (posts in
  // it), fighting whoever they meet. Pirates shoot her passengers as they'd shoot anyone not their own (js/server.ts npcFoes). When the
  // time's up and the last pirate aboard is dead, down or tied, she's held; if her last passenger dies first, the job's failed
  // (nothing to stay for). Returns whether there's anything new to tell.
  const civUp = () => { let n = 0; for (const e of S().enemies.values()) if (e.def.civ && !e.down && e.hp > 0 && e.state !== 'dead') n++; return n; };
  function defendTick(dt: number) {
    const sv = S(), M = st.M!, map = sv.map!, TS = Level.TS, C = SD.DEFEND; let ch = false;
    const D = M.def || (M.def = { on: false, lead: C.lead, t: C.secs, pods: 0, lost: false, said: -1 });
    if (M.cleared || D.lost) return false;
    if (!D.on) { if (!M.docked) return false; D.on = true; for (const e of sv.enemies.values()) if (e.ally) { e.alert = true; e.drawn = true; } // (her security: told, and ready for them)
      say(`More pirates inbound: ${C.lead} seconds out. Her passengers are in the shelter behind the mezzanine. Waiting for you in the court: ${(M.staff || []).join(', ') || 'what is left of her security'}.`); return true; }
    // (the lead: the squad's time to get to her court. Nothing comes through her hull, and the clock she's to be held by hasn't started)
    if (D.lead > 0) { D.lead = Math.max(0, D.lead - dt); if (D.lead > 0) return false; say('Their pods are on her. Hold for three minutes.'); return true; }
    const rm = map.rooms[M.hold], fl = rm ? rm.fl || 0 : 0, fy = Level.floorMap(map, fl).fy || 0;
    if (D.t > 0) {
      D.t = Math.max(0, D.t - dt);
      const gone = C.secs - D.t, gap = (C.secs - C.first - 22) / Math.max(1, C.pods - 1);
      if (D.pods < C.pods && gone >= C.first + D.pods * gap) {
        // (where: a site clear of the squad's ship and of every pod; who: out of it onto the nearest clear floor inside)
        const W = map.W, far = (c: number, q: number[], m: number) => Math.hypot(c % W - q[0] % W, ((c / W) | 0) - ((q[0] / W) | 0)) * TS > m;
        // (her court can't be come through, js/shipgen.ts sites: if what's left of her side is full of pods, the next comes in closer to them)
        const all = ShipGen.sites(map), pick = (pod: number, ship: number) => all.filter((q) => M.raid.every((a) => far(q.c, a, pod)) && (!M.site || far(q.c, M.site, ship)));
        let ss = pick(6.5, 12); if (!ss.length) ss = pick(4.5, 9); if (!ss.length) ss = pick(0.5, 5); if (!ss.length) ss = all;
        const s = ss.length ? ss[Math.floor(Math.random() * ss.length)] : null;
        D.pods++; ch = true;
        if (s) {
          M.raid.push([s.c, s.nx, s.nz]);
          const n = 3 + Math.floor(sv.level / 3) + (Math.max(1, sv.players.size) - 1), hp = 1 + 0.04 * (sv.level - 1), ax = s.nz ? 1 : 0, az = s.nx ? 1 : 0;
          const spots = map.enemySpots.filter(([x, z, f]) => !(f || 0) && Math.hypot((x + 0.5) * TS - (s.x - s.nx * 3), (z + 0.5) * TS - (s.z - s.nz * 3)) < 5).sort(() => Math.random() - 0.5);
          const cx = rm ? (rm.cx + 0.5) * TS : s.x, cz = rm ? (rm.cz + 0.5) * TS : s.z, flow = sv.flowTo(cx, fy, cz);
          for (let k = 0; k < n; k++) {
            const q = spots[k % Math.max(1, spots.length)], x = q ? (q[0] + 0.5) * TS : s.x - s.nx * 2 + ax * (k - n / 2) * 0.7, z = q ? (q[1] + 0.5) * TS : s.z - s.nz * 2 + az * (k - n / 2) * 0.7;
            const e = sv.addEnemy(k % 3 === 0 ? 'grunt' : k % 3 === 1 ? 'suspect' : 'rusher', x, z, hp, 0);
            e.wear = 'pirate'; e.bold = true; e.drawn = true;
            e.post = { x: cx + (Math.random() - 0.5) * 2, y: fy, z: cz + (Math.random() - 0.5) * 2, yaw: Math.random() * 6.28, flow }; e.home = { x: e.post.x, y: fy, z: e.post.z };
          }
          say(D.pods >= C.pods ? 'The last pod is through her hull.' : `A pirate pod is through her hull: ${n} boarders. ${C.pods - D.pods} more to come.`);
        }
      }
      if (D.t === 0) { say('No more pods. Clear the pirates still aboard.'); ch = true; }
    }
    const alive = civUp(), left = sv.remaining(false); // (her passengers still on their feet: one shot down is a casualty, living or not)
    if (alive === 0) { D.lost = true; say('Her passengers are all shot down. Nothing left to hold: back to the ship.'); return true; }
    if (D.t === 0 && left === 0) { M.cleared = true; say(`She is held: ${alive} of her people unhurt. Back to the ship and jump home.`); return true; }
    const key = Math.ceil(D.t / 10) * 1000 + left * 30 + alive; if (key !== D.said) { D.said = key; ch = true; }
    return ch;
  }
  function finished(M: SvMission) {
    const o = M.ms.obj;
    return o === 'artifact' ? M.art === 1 : o === 'hvt' ? M.hvtSt > 0 : o === 'destruct' ? M.arm != null || M.boom : o === 'defend' ? M.cleared && !(M.def && M.def.lost) : M.cleared;
  }

  // ---- The squad's ship against the hull, in the host's world as on everyone's screen: her walls, decks and the tunnel are there to
  // be seen through (they can't), shot through (hardened steel: js/materials.ts SHIP) or walked on, not open space past the hole
  let hostShip: { w: any; s: any[]; hatch: any[] } | null = null;
  function shipSolids(on: boolean) {
    const sv = S(), M = st.M, w = sv.map && sv.map.world;
    if (hostShip) { for (const s of [...hostShip.s, ...hostShip.hatch]) if (hostShip.w === w) World.remove(hostShip.w, s); hostShip = null; }
    if (sv.map) Level.setTilt(sv.map, null, null);
    if (!on || !M || !M.site || !w || !sv.map) return;
    const W = sv.map.W, TS = Level.TS, a = M.site, site = { x: (a[0] % W + 0.5) * TS, z: (((a[0] / W) | 0) + 0.5) * TS, nx: a[1], nz: a[2], ang: a[3] || 0, pt: a[4] || 0 }, d = SD.SHIPS[st.fleet.ship]; // (ang: an angled breach's, degrees off square)
    Level.setTilt(sv.map, d, SD.berthAt(d, site)); // (lying tilted: her own gravity aboard her)
    const solid = (q: any) => World.add(w, SD.solidOf(q, { kind: 'prop', mat: Materials.SHIP })), b = SD.berthAt(d, site);
    hostShip = { w, s: SD.worldBoxes(d, b, (t) => t !== 'nose' && t !== 'steps' && t !== 'hatch').map(solid), hatch: st.ship.hatch ? [] : SD.worldBoxes(d, b, (t) => t === 'hatch').map(solid) }; // (her inner door while it's shut)
    Level.tiltHatch(sv.map, !st.ship.hatch); // (and in her own frame, where anyone and any grenade aboard her is moved while she lies tilted)
  }
  // her inner door opened from its button (any of the squad's, while she's against a hull): for everyone, and out of the way here
  function openHatch(from: string) {
    if (st.ship.hatch || !st.M || !st.M.docked) return;
    st.ship.hatch = true;
    if (hostShip) { for (const s of hostShip.hatch) World.remove(hostShip.w, s); hostShip.hatch = []; }
    Level.tiltHatch(S().map, false);
    net().broadcast({ t: 'shatch', by: from });
  }
  // ---- the ship: she's against the hull (the plate goes in), on the pad, or away again
  function dock(on: boolean, from: string, at?: unknown) {
    const sv = S();
    if (sv.phase === 'shop') { st.ship.docked = on; if (on) { st.ship.at = null; landed(); } net().broadcast({ t: 'sdock', on: on ? 1 : 0, by: from }); return; }
    const M = st.M; if (!M || sv.phase !== 'level' || M.docked === on || M.boom) return;
    if (!on && M.docked && M.site && sv.map) { // (nobody living left behind in the hull she's against: everyone's aboard her first, or dead. Those down still count)
      const W = sv.map.W, TS = Level.TS, a = M.site, d = SD.SHIPS[st.fleet.ship], b = SD.berthAt(d, { x: (a[0] % W + 0.5) * TS, z: (((a[0] / W) | 0) + 0.5) * TS, nx: a[1], nz: a[2], ang: a[3] || 0, pt: a[4] || 0 } as any), k = sv.curK();
      const left = [...(sv.allPlayers || sv.players).values()].filter((q: any) => q.st && q.st.p && !q.st.dd && (sv.lvOf(q) !== k || !SD.aboard(d, b, q.st.p[0], q.st.p[1] || 0, q.st.p[2]))).map((q: any) => q.name || q.id);
      if (left.length) { net().sendTo(from, { t: 'sdock', on: 1, by: '', no: left }); return; }
    }
    // against her hull: at the site the pilot's game says she hit (any clear stretch of it), cut through there if it isn't already
    let site: ShSite | null = null;
    if (on && M.meta && sv.map) {
      const a = Array.isArray(at) && at.length >= 3 && at.length <= 5 && (at[3] == null || Math.abs(at[3]) <= SpaceData.BREACH_ANG) && (at[4] == null || Math.abs(at[4]) <= SpaceData.BREACH_PITCH) && at.every(Number.isInteger) ? (at as number[]) : null; // (a[3]: an angled breach's, degrees off square)
      if (a && M.raid.some((q) => Math.hypot(a[0] % sv.map!.W - q[0] % sv.map!.W, ((a[0] / sv.map!.W) | 0) - ((q[0] / sv.map!.W) | 0)) * Level.TS < 8)) return; // (a pirate pod's there)
      site = a ? ShipGen.siteOf(sv.map, a[0], a[1], a[2]) : null;
      if (site && a && (a[3] || a[4])) site = Object.assign({}, site, { ang: a[3] || 0, pt: a[4] || 0 }); // (the site's own record kept as it is)
      const was = a ? M.meta.cuts.find((q) => q[0] === a[0] && q[1] === a[1] && q[2] === a[2]) : null;
      if (!site && was) { M.site = was.slice(); } // (the hole she made before: at the angle it was made at)
      else if (!site) return;
      else { ShipGen.cut(sv.map, site); M.site = ShipGen.cutKey(site); }
    }
    if (on && M.meta && !M.breached) { M.breached = true; if (M.ms.obj === 'visit') say(`${M.ms.name} takes the breach for an attack: her crew are coming for you.`); }
    M.docked = on; st.ship.docked = on;
    if (on) st.ship.hatch = false; // (a breach shuts her inner door: it's opened from its button, js/space.ts)
    shipSolids(on);
    if (sv.map) ShipGen.seal(sv.map, on ? M.site : null); // (the holes she isn't against: shut)
    net().broadcast({ t: 'sdock', on: on ? 1 : 0, by: from, site: on ? M.site : undefined });
    if (on && M.meta && sv.map && M.site) {
      const W = sv.map.W, TS = Level.TS, x = (M.site[0] % W + 0.5) * TS, z = (((M.site[0] / W) | 0) + 0.5) * TS;
      sv.hear(x, z, SpaceData.fitted(st.fleet, 'jammer') ? 14 : 45, 0); // (the whole ship rings with it)
      if (M.ms.obj === 'hostage' && !M.told) { M.told = true; const role = M.meta.roles[M.hold]; say(`The pirates are holding her people in ${role ? 'the ' + ShipGen.NAMES[role].toLowerCase() : 'one compartment'}. Clear the ship.`); }
      if (!SpaceData.fitted(st.fleet, 'jammer')) alarm(x - M.site[1] * 2 * TS, z - M.site[2] * 2 * TS);
    } else if (!on && M.meta && sv.map && M.site) {
      // she's backed out of the hole: that compartment is open to space
      const W = sv.map.W, TS = Level.TS, x = (M.site[0] % W + 0.5 - M.site[1] * 1.5) * TS, z = (((M.site[0] / W) | 0) + 0.5 - M.site[2] * 1.5) * TS;
      vent(ShipGen.roomAt(sv.map, x, z), 'the breach');
    }
    sync();
  }

  // ---- what an officer does to the mission's things
  function near(p: Player | undefined, at: { x: number; z: number; y?: number } | null, r: number): p is LivePlayer { return !!(p && p.st && at && !p.st.dd && !p.st.dn && Math.hypot(p.st.p[0] - at.x, p.st.p[2] - at.z) < r && Math.abs(p.st.p[1] - (at.y || 0)) < 2.4); }
  function act(k: string, from: string, n?: number) {
    const sv = S(), M = st.M, p = sv.players.get(from);
    if (!M || !M.meta || sv.phase !== 'level' || M.boom) return;
    const meta = M.meta;
    if (k === 'art' && M.ms.obj === 'artifact' && M.art === 0 && near(p, meta.artifact, 2.6)) {
      M.art = 1; M.artBy = from; say(`${p.name} has the artifact. Get it back to the ship.`); sync();
    } else if (k === 'cons' && M.ms.obj === 'destruct' && M.arm == null && near(p, meta.console, 2.6)) {
      M.arm = (M.ms as any).fuse || (meta.size === 'large' ? 210 : meta.size === 'medium' ? 165 : 120); M.armSay = M.arm!;
      say(`${p.name} started the self-destruct: ${M.arm} seconds. Get off the ship.`);
      sv.hear(meta.console!.x, meta.console!.z, 60, 0);
      sync();
    } else if (k === 'salv' && meta.salvage[n as number] && !M.salv.includes(n as number) && near(p, meta.salvage[n as number], 2.6)) {
      // what's worth carrying off a ship that isn't the mission's: paid with the jump home, the mission done or not
      M.salv.push(n as number); say(`${p.name} has her cargo manifest: salvage, paid at home.`); sync();
    } else if (k === 'pod' && meta.pods[n as number] && near(p, meta.pods[n as number], 2.4)) {
      // an escape pod: away from her, and picked up by your own ship (your screen puts you aboard)
      if (M.artBy === from) { /* (it goes with you) */ }
      net().sendTo(from, { t: 'pod' });
      say(`${p.name} is away in an escape pod.`);
    }
  }
  const lockOf = (d: { id: number }) => (st.M && st.M.meta ? st.M.meta.locks[d.id] || null : null);
  // may this officer open this door (js/server.ts useDoor): not the plate at the breach, and a locked one only with its card
  function mayOpen(d: { id: number; open: boolean; fl?: number }, from: string) {
    const M = st.M, k = lockOf(d);
    if (!M || !k) return true;
    if (M.keys[k] || d.open) return true;
    // from inside the room it locks (its other side from the passage: the room of the key's name, else the one that isn't the spine):
    // it opens, and it's unlocked from then on
    const sv = S(), map = sv.map, p = sv.players.get(from), pos = p && p.st && p.st.p;
    if (map && pos) {
      const [a, b] = doorRooms(M).get(d.id) || [-1, -1], role = (i: number) => (i >= 0 && M.meta ? M.meta.roles[i] : null);
      const inside = role(a) === k ? a : role(b) === k ? b : role(a) === 'spine' ? b : role(b) === 'spine' ? a : -1;
      if (inside >= 0 && ShipGen.roomAt(map, pos[0], pos[2], d.fl || 0) === inside) {
        delete M.meta!.locks[d.id]; (M.unlocked || (M.unlocked = [])).push(d.id);
        net().broadcast({ t: 'unlock', i: d.id });
        return true;
      }
    }
    net().sendTo(from, { t: 'locked', i: d.id, k });
    return false;
  }
  // (the crew don't open a locked door: whoever's behind it holds it. Unless the room it locks has been breached: there's a hole in it,
  // and her people go in after whoever came through it, by its doors as well, as they'd have the code. The squad still needs the card)
  const crewMayOpen = (d: { id: number }, e?: any) => (!lockOf(d) || breachedRoomOf(d)) && !(st.M && st.M.sealT.has(d.id)) && !shelterShut(d, e);
  // A door of the room her people are sheltering in (informal drill: shelter) is theirs to keep shut: opened only by someone of hers
  // who belongs on its other side (one of those sheltering, on their way in; someone posted on the far side from where they are, on
  // their way to it). Her guards outside hold it, they don't open it to look in or go through (e: who's opening it; none: anyone)
  function shelterShut(d: { id: number }, e?: any) {
    const M = st.M, sv = S(), map = sv.map; if (!M || M.safe == null || M.safe < 0 || !map || !M.alarm) return false;
    if (!(doorRooms(M).get(d.id) || []).includes(M.safe)) return false;
    if (!e) return !!M.shutDoors && M.shutDoors.has(d.id); // (the ways through her: only once it's been shut on them all, shut)
    const inside = (x: number, z: number) => ShipGen.roomAt(map, x, z, 0) === M.safe;
    if (e.shelter && e.shelter.room === M.safe) return false;
    if (e.post && inside(e.post.x, e.post.z) !== inside(e.x, e.z)) return false;
    return true;
  }
  // the rooms of hers a hole's been cut into (each cut's way in: a step inside it), kept till there's another cut
  let breachedOf: { n: number; M: SvMission | null; rooms: Set<number> } = { n: -1, M: null, rooms: new Set() };
  function breachedRoomOf(d: { id: number }) {
    const M = st.M, map = S().map; if (!M || !M.meta || !map) return false;
    const cuts = M.meta.cuts || [];
    if (breachedOf.M !== M || breachedOf.n !== cuts.length) {
      const rooms = new Set<number>(), TS = Level.TS;
      for (const q of cuts) { const t = ShipGen.siteAt(map, q); for (const k of [1, 2.5]) { const ri = ShipGen.roomAt(map, t.x - t.nx * (TS / 2 + k), t.z - t.nz * (TS / 2 + k), 0); if (ri >= 0) rooms.add(ri); } }
      breachedOf = { n: cuts.length, M, rooms };
    }
    // (the room it locks: the key's own, else the side that isn't the spine, as mayOpen has it)
    const [a, b] = doorRooms(M).get(d.id) || [-1, -1], k = lockOf(d), role = (i: number) => (i >= 0 && M.meta ? M.meta.roles[i] : null);
    const inside = role(a) === k ? a : role(b) === k ? b : role(a) === 'spine' ? b : role(b) === 'spine' ? a : -1;
    return inside >= 0 ? breachedOf.rooms.has(inside) : breachedOf.rooms.has(a) && breachedOf.rooms.has(b);
  }

  // ---- open to space
  function doorRooms(M: SvMission) {
    if (M.doorRooms) return M.doorRooms;
    const map = S().map!, out = new Map<number, number[]>();
    for (const d of map.doors) {
      const ax = d.axis === 'x' ? 1 : 0, az = d.axis === 'z' ? 1 : 0, a = ShipGen.roomAt(map, d.x - ax * 1.4, d.z - az * 1.4, d.fl || 0), b = ShipGen.roomAt(map, d.x + ax * 1.4, d.z + az * 1.4, d.fl || 0);
      out.set(d.id, [a, b]);
    }
    return (M.doorRooms = out);
  }
  function vent(ri: number, why?: string) {
    const M = st.M, sv = S(); if (!M || !M.meta || ri < 0 || M.vac.has(ri) || !sv.map) return;
    if (['mall', 'gallery', 'shelter'].includes(M.meta.roles[ri] || '')) return; // (a liner's court, its mezzanine and her shelter: armoured, and never without air)
    M.vac.add(ri);
    const role = M.meta.roles[ri];
    net().broadcast({ t: 'vent', r: ri });
    say(`${(role && ShipGen.NAMES[role]) || 'A compartment'} is open to space${why ? ' (' + why + ')' : ''}: the doors are sealing.`);
    const rm = sv.map.rooms[ri]; if (rm) sv.hear((rm.cx + 0.5) * Level.TS, (rm.cz + 0.5) * Level.TS, 30, 0);
    sync();
  }
  // a pane's been broken (js/server.ts breakGlass): one in the hull lets the room's air out
  function glass(ids: number[]) {
    const M = st.M; if (!M || !M.meta) return;
    for (const id of ids) if (M.meta.hullWin[id] != null) vent(M.meta.hullWin[id], 'a window gone');
  }
  function vacuum(dt: number) {
    const M = st.M, sv = S(), map = sv.map;
    if (!M || !M.meta || !map || !M.vac.size) return;
    const DR = doorRooms(M), clock = sv.clock || 0;
    for (const d of map.doors as Door[]) {
      const rs = DR.get(d.id); if (!rs) continue;
      const va = M.vac.has(rs[0]), vb = M.vac.has(rs[1]);
      if (!va && !vb) continue;
      if (va && vb) { M.sealT.delete(d.id); continue; }
      // a door between a room with air and one without: off its hinges, the air goes from the next room too; open, it shuts
      // itself (2.5 s for anyone in the doorway)
      if (d.fallen) { vent(va ? rs[1] : rs[0], 'through a broken door'); continue; }
      if (!d.open) { M.sealT.set(d.id, 0); continue; }
      const t0 = M.sealT.get(d.id);
      if (!t0) M.sealT.set(d.id, clock);
      else if (clock - t0 > 2.5) { sv.setDoor(d.id, false); M.sealT.set(d.id, 0); }
    }
    // whoever's in there without a suit: about five seconds
    for (const e of [...sv.enemies.values()]) {
      if (e.state === 'dead' || e.hp <= 0) continue;
      if (!M.vac.has(ShipGen.roomAt(map, e.x, e.z, Level.floorAt(map, e.x, e.y || 0, e.z)))) continue;
      e.hp -= e.maxHp * 0.2 * dt;
      if (e.hp <= 0) { e.hp = 0.01; sv.applyHit({ e: e.id, d: 1, bo: 1, cz: 'vacuum' }, e.lastHit); }
    }
  }

  function tick(dt: number) {
    const sv = S(), M = st.M;
    if (!M || sv.phase !== 'level' || !sv.map) return;
    if (Z && Z.stepN !== sv.stepN) { Z.zt += dt; Z.stepN = sv.stepN; } // (once a step: this runs once for each level kept live, and the zone's one clock)
    // a base on a planet: done when it's under control
    if (!M.meta) { if (!M.cleared && M.docked && sv.remaining(false) === 0) { M.cleared = true; M.done = true; say('The base is under control. Back to the ship.'); sync(); } return; }
    if (M.boom) return;
    respondTick(dt);
    // her gun crew: told when there's one fewer (her guns stop with the last of them)
    const gl = gunnersLeft();
    if (M.gn == null) M.gn = gl;
    else if (gl !== M.gn) { const was = M.gn; M.gn = gl; if (was > 0 && gl === 0 && M.gunners && M.gunners.length) say('Her gun control is silent: nobody is left to man her guns.'); sync(); }
    // the keycards: with their carriers till they're down, in restraints or dead; then on the floor, for whoever walks up
    let ch = false;
    for (const c of M.cards) {
      if (c.st === 0) {
        const e = sv.enemies.get(c.eid);
        if (e && !e.down && e.state !== 'cuffed' && e.state !== 'dead' && e.hp > 0) { c.x = e.x; c.z = e.z; c.y = e.y || 0; }
        else { c.st = 1; ch = true; }
      } else if (c.st === 1) for (const p of sv.players.values()) if (near(p, c, 1.7)) { c.st = 2; M.keys[c.key] = true; ch = true; say(`${p.name} picked up the ${c.key === 'bridge' ? 'bridge' : 'armoury'} keycard.`); break; }
    }
    // a taken ship: hers again when the last pirate is dead, down or tied
    if (M.ms.obj === 'hostage' && !M.cleared) {
      const n = sv.remaining(false);
      if (n === 0 && M.docked) { M.cleared = true; ch = true; say('She is clear of pirates. Back to the ship and jump home.'); }
      else if (n !== M.leftSaid) { M.leftSaid = n; ch = true; }
    }
    if (M.ms.obj === 'defend' && defendTick(dt)) ch = true;
    // the wanted officer
    if (M.hvt != null && M.hvtSt === 0) {
      const e = sv.enemies.get(M.hvt);
      if (!e || e.state === 'dead' || e.hp <= 0) { M.hvtSt = 1; ch = true; say('The target is dead. Back to the ship.'); }
      else if (e.state === 'cuffed') { M.hvtSt = 2; ch = true; say('The target is in restraints. Back to the ship.'); }
      if (M.hvtSt) { const b = e || sv.bodies.get(M.hvt); if (b) M.hvtAt = { x: b.x, y: b.y || 0, z: b.z, yaw: b.yaw || 0, wear: (e && e.wear) || null }; } // (where he was left: he's there again if she's come back to, populate)
    }
    // the artifact goes where its carrier goes; if they're down, it's where they fell (anyone can pick it up again)
    if (M.art === 1) { const p = M.artBy ? sv.players.get(M.artBy) : null; if (!p || !p.st || p.st.dd) { if (p && p.st && M.meta.artifact) { M.meta.artifact.x = p.st.p[0]; M.meta.artifact.z = p.st.p[2]; } M.art = 0; M.artBy = null; ch = true; say('The artifact has been dropped.'); } }
    // the self-destruct
    if (M.arm != null) {
      M.arm -= dt;
      if (M.arm <= 0) { boom(M); return; }
      if (Math.ceil(M.arm / 10) !== Math.ceil(M.armSay / 10) || (M.arm < 10 && Math.ceil(M.arm) !== Math.ceil(M.armSay))) { M.armSay = M.arm; ch = true; }
    }
    M.vacT += dt;
    if (M.vacT > 0.25) { vacuum(M.vacT); M.vacT = 0; }
    const was = M.done; M.done = finished(M);
    if (ch || was !== M.done) sync();
  }
  // she goes up: whoever is still aboard her, or in a ship against her hull, goes with her
  function boom(M: SvMission) {
    const sv = S();
    M.arm = null; M.boom = true; M.done = true;
    const lost: string[] = [];
    for (const p of sv.players.values()) if (p.st && !p.st.dd && (M.docked || !p.st.se)) lost.push(p.id);
    sv.enemies.clear();
    net().broadcast({ t: 'sboom', lost });
    if (M.art === 0 && M.ms.obj === 'artifact') M.art = 2;
    sync();
    say(lost.length ? 'She\'s gone, and not everyone got off.' : 'She\'s gone. Good work.');
  }

  // ---- messages (js/server.ts handle hands on what it doesn't know)
  function handle(m: any, from: string, p: Player | undefined) {
    const sv = S(), F = st.fleet;
    switch (m.t) {
      case 'mpick': {
        const i = m.i | 0, B = st.board;
        if (!p || sv.phase !== 'shop' || !st.ship.docked || !offers()[i] || goneOf(B).includes(i)) break;
        if (B.picked.includes(i)) B.picked = B.picked.filter((q) => q !== i); else if (B.picked.length < SD.PICKS) B.picked.push(i); else break;
        net().broadcast(boardMsg());
        if (B.gone.length && B.picked.every((q) => B.gone.includes(q))) landed(); // (the last one still to fly let go of: the board turns over now)
        break;
      }
      case 'jump': jump(m.to | 0, from); break;
      // the squad's ship has closed with another of the zone's ships (js/space.ts): she's the level now. The one left behind goes on
      // her way; the mission's keeps what's been done aboard her (not who was left standing: her crew are at their posts again).
      case 'tboard': {
        const M = st.M, k = m.k | 0;
        if (!p || sv.phase !== 'level' || sv.leaving || !M || !M.meta || M.docked || M.boom || !Z || k === Z.active) break;
        const c = SD.zone(Z.ms)[k]; if (!c) break;
        const zz = Z, was = zz.active;
        // Whoever's inside the ship being left stays there: the level stays live beside the one the squad's ship goes to (js/server.ts
        // ctxs, docs/zone-levels.md), till nobody's in it. Nobody inside: it's kept as it is (putAway), all that's happened aboard it,
        // as it was left if the squad comes back to it. Everyone aboard the squad's ship goes with it.
        const here = [...sv.players.values()].filter((q) => sv.lvOf(q) === was); // (those in the level being left: others are aboard yet another, and stay)
        const inside = here.filter((q: any) => q.st && q.st.p && !q.st.dd && (() => { const r = sv.roomOf(q.st.p[0], q.st.p[1] || 0, q.st.p[2]); return r >= 0 && M.meta!.hullOf[r] != null; })());
        for (const q of here as any[]) q.lv = inside.includes(q) ? was : undefined;
        (zz.casBy = zz.casBy || {})[was] = casNow(); // (what it cost aboard the ship being left, as it's left)
        if (inside.length || nearK.has(was)) { const c = sv.ctxSave(); c.warm = nearK.has(was); sv.ctxs.set(was, c); } else putAway(); // (still near it: kept live too, warm)
        { // (at once: nothing's drawn over it. Each screen carries the squad's ship across as she is: js/space.ts carry)
          zz.active = k;
          const live = sv.ctxs.get(k);
          if (live) { // (the ship gone to is live already (someone's been left aboard it): it's the loaded level again, and they're with it)
            sv.ctxs.delete(k); sv.ctxLoad(live); zz.active = k; st.ship.docked = false;
            for (const q of sv.players.values() as Iterable<any>) if (q.lv === k) q.lv = undefined;
            sv.toLevel(sv.phaseMsg(true, true)); break;
          }
          st.ship.docked = false; bringUp(k);
        }
        break;
      }
      case 'tnear': case 'tfar': if (p && Number.isFinite(m.k)) warm(m.k | 0, m.t === 'tnear'); break; // (the squad's ship coming up with a zone ship, or going from it: its level made ahead, or let go)
      case 'sdock': if (p) dock(!!m.on, from, m.site); break;
      case 'shatch': if (p) openHatch(from); break;
      case 'seat': {
        if (!p) break;
        const s = m.s == null || m.s < 0 ? -1 : m.s | 0;
        if (s >= 0 && Object.keys(st.seats).some((id) => id !== from && st.seats[id] === s && sv.players.has(id))) { net().sendTo(from, { t: 'seats', s: st.seats, no: s }); break; }
        if (s < 0) delete st.seats[from]; else st.seats[from] = s;
        if (s === 0) st.ship.ctl = from; // (the helm: she's theirs to fly until someone else sits there)
        net().broadcast({ t: 'seats', s: st.seats, ctl: st.ship.ctl });
        break;
      }
      case 'spose': if (p && (st.ship.ctl === from || !st.ship.ctl || !sv.players.has(st.ship.ctl)) && Array.isArray(m.a) && m.a.length <= 16 && m.a.every(Number.isFinite)) { st.ship.ctl = from; st.ship.pose = m.a; net().broadcast({ t: 'spose', a: m.a, by: from }, from); if (m.a.length >= 10) SvBattle.heardPose(m.a, sv.stepN, sv.map); } break;
      case 'smis': if (p && Array.isArray(m.a) && m.a.length <= 8 && m.a.every(Number.isFinite)) { net().broadcast({ t: 'smis', a: m.a, by: from }, from); battleIn(m); } break; // (a missile off her hull, or one shot down: told to all)
      case 'sfire': if (p && Array.isArray(m.a) && m.a.length <= 12 && m.a.every(Number.isFinite)) net().broadcast({ t: 'sfire', a: m.a, by: from }, from); break;
      case 'strk': if (p && Array.isArray(m.a) && m.a.length <= 6 && m.a.every(Number.isFinite)) { net().broadcast({ t: 'strk', a: m.a, by: from }, from); battleIn(m); } break; // (a tracker switched or sent: js/space.ts trkOff, trkSend)
      case 'ssec': if (p && Array.isArray(m.a) && (m.a.length === 4 || m.a.length === 5) && m.a.every(Number.isFinite)) { net().broadcast({ t: 'ssec', a: m.a, by: from }, from); battleIn(m); } break; // (a scanner's search set: js/space.ts secSet)
      case 'sdbgq': if (p) { if (m.on && typeof m.id === 'string') dbgReq.set(from, { id: m.id, at: sv.stepN }); else dbgReq.delete(from); } break; // (F8 open on a suite: its debug picture to that player (battle))
      case 'sxpdr': if (p) { net().broadcast({ t: 'sxpdr', on: m.on ? 1 : 0, by: from }, from); battleIn(m); } break; // (her transponder switched: js/space.ts xpdr)
      case 'storp': if (p && Array.isArray(m.a) && m.a.length === 13 && m.a.every(Number.isFinite)) { net().broadcast({ t: 'storp', a: m.a, by: from }, from); battleIn(m); } break; // (a torpedo in flight: js/space.ts torps)
      case 'schaff': if (p && Array.isArray(m.a) && m.a.length === 6 && m.a.every(Number.isFinite)) { net().broadcast({ t: 'schaff', a: m.a, by: from }, from); battleIn(m); } break; // (chaff thrown out of her: js/space.ts chaffGo)
      case 'srcue': if (p && Array.isArray(m.a) && m.a.length <= 3 && m.a.every(Number.isFinite)) { net().broadcast({ t: 'srcue', a: m.a, by: from }, from); battleIn(m); } break; // (the sensor station's operator cued a tracker on a plot, or dropped them: js/space.ts sensorStep)
      case 'shit': if (p && Number.isFinite(m.i)) { net().broadcast({ t: 'shit', i: m.i | 0, hp: +m.hp || 0, by: from }, from); battleIn(m); } break; // (a hull gun hit by a turret, or the ship by one: told to all)
      case 'mobj': if (p) act(String(m.k), from, m.n); break;
      // the shipyard: a ship bought (paid for on the buyer's own screen, as the shop's stock is), taken out, fitted
      case 'fbuy': if (p && sv.phase === 'shop' && SD.SHIPS[m.id] && !F.owned.includes(m.id)) { F.owned.push(m.id); st.fleet = SD.cleanFleet(F); net().broadcast({ t: 'fleet', f: st.fleet, by: from, got: m.id }); } break;
      case 'fuse': if (p && sv.phase === 'shop' && st.ship.docked && F.owned.includes(m.id) && F.ship !== m.id) { F.ship = m.id; st.seats = {}; net().broadcast({ t: 'fleet', f: st.fleet, by: from }); net().broadcast({ t: 'seats', s: st.seats, ctl: st.ship.ctl }); } break;
      case 'ffit': {
        const d = SD.SHIPS[F.ship], s = m.s | 0, e = m.id == null ? null : SD.EQUIP[m.id];
        if (!p || sv.phase !== 'shop' || !st.ship.docked || s < 0 || s >= d.turrets + d.utils || (e && e.slot !== (s < d.turrets ? 'turret' : 'util'))) break;
        const fit = F.fit[F.ship] || (F.fit[F.ship] = []);
        if (e && fit.includes(e.id) && e.slot === 'util') break; // (one of each)
        fit[s] = e ? e.id : null;
        net().broadcast({ t: 'fleet', f: st.fleet, by: from });
        break;
      }
      // a debug start's (js/debugstart.ts ?board, ?assault): straight to a mission made up for it
      case 'dbgMs': {
        if (from !== net().myId || sv.phase !== 'shop' || !m.ms) break;
        const q = m.ms, board = q.kind !== 'assault', o = offers()[board ? 0 : 2];
        const ms: SpMission = Object.assign({}, o, { i: 0, kind: board ? 'board' : 'assault', obj: board ? (['artifact', 'hvt', 'destruct', 'hostage', 'defend'].includes(q.obj) && !(q.obj === 'destruct' && (!SD.SIZES[q.size as SpSize] || q.size === 'transport')) ? q.obj : 'artifact') : 'assault', /* (no scuttling a civilian transport: offers) */ size: board ? (SD.SIZES[q.size as SpSize] ? q.size : 'small') : null, other: board && SD.SIZES[q.other as SpSize] ? q.other : null, wing: !!q.wing,
          th: Number.isInteger(q.th) && SD.themeAt(q.th) ? q.th : board ? SD.TH0 : o.th, seed: Number.isInteger(q.seed) ? q.seed : o.seed, diff: Math.max(1, q.diff | 0), night: !!q.night, name: board ? 'MV Debug' : 'Debug', where: 'debug start', fuse: q.fuse > 0 ? +q.fuse : undefined });
        st.board.picked = [0]; st.ship.docked = false;
        sv.overBlack(() => begin(ms), 'ftl', 0);
        break;
      }
      case 'finit': if (from === net().myId && sv.phase === 'lobby') st.fleet = SD.cleanFleet(m.f); break; // (the host's own fleet, as its page kept it)
    }
  }
  function left(id: string) {
    if (st.seats[id] != null) { delete st.seats[id]; net().broadcast({ t: 'seats', s: st.seats, ctl: st.ship.ctl }); }
    if (st.M && st.M.artBy === id) { st.M.art = 0; st.M.artBy = null; sync(); }
  }
  // the mission's share of a level context (js/server.ts ctxSave): the mission aboard this ship, which of the zone's ships it is,
  // the squad's ship's solids as they're laid into its world, and the breach-room cache
  // the loaded level put away (dormant): all that's happened aboard it kept with its mission (keepOf), the mission's ship's as
  // the zone's main, another's among those kept, to be come back to (restore); the context dropped (js/server.ts update)
  function putAway() {
    const M = st.M, sv = S(); if (!M || !Z) return;
    const k = Z.active;
    if (M.meta) M.cutsWas = M.meta.cuts.map((q) => q.slice());
    M.keep = keepOf();
    if (M.ms.obj === 'visit') (Z.kept = Z.kept || new Map()).set(k, M); else Z.main = M;
    sv.ctxs.delete(k);
  }
  // ---- the battle (js/svbattle.ts): the zone's, on the server. Made with a boarding mission's level, made again when the level's
  // another of the zone's ships (tboard) or come back to, dropped when the zone's over (home, a new run). Stepped once a server step,
  // after every level's (js/serverhost.ts step), with the loaded level's (the squad's ship's) crew state
  let bat: SvBat | null = null;
  function battle(dt: number) {
    const sv = S(), M = st.M, map = sv.map;
    if (!Z || Z.ms.kind !== 'board' || sv.phase !== 'level' || !M || !M.meta || !map || !map.sp || !map.sp.hull) { bat = null; return; }
    if (!bat || bat.map !== map || bat.k !== Z.active) bat = SvBattle.make(map, Z.ms, Z.active, M.ms, st.fleet, bat);
    const hostile = M.ms.obj === 'defend' ? 0 : M.ms.obj !== 'visit' || M.breached ? 1 : 0;
    SvBattle.step(bat, dt, sv.stepN, { hostile, gn: gunnersLeft(), arm: M.arm == null ? null : Math.ceil(M.arm), boom: M.boom }, M.docked, Z.zt);
    SvBattle.out(bat, sv.stepN, Z.zt, (m) => net().broadcast(m));
    // (her radars' picture, as the server's battle has it (js/suiteview.ts pack): ten times a second on the fast channel's stream 1, to
    // everyone aboard (the sensor station, the hologram, the helm's targeting and her marks draw from it); k: which level's frame it's in)
    // (F8's, to a player who's asked (sdbgq, renewed every couple of seconds): the suite they're looking at with its debug extras (fast
    // stream 2, four times a second) and its scanners' maps and dishes' debug (stream 3, twice a second))
    if (bat && sv.stepN % 15 === 0) for (const [pid, q] of [...dbgReq]) {
      if (sv.stepN - q.at > 240) { dbgReq.delete(pid); continue; }
      const W = bat.W, su = q.id === 'own' ? W.own : q.id === 'hull' ? W.foe : (W.traffic.find((x) => x.t && x.t.id === q.id) || { su: null }).su; if (!su) continue;
      const enc = (o: any) => new TextEncoder().encode(JSON.stringify(o)).buffer as ArrayBuffer;
      net().fast(pid, enc({ k: bat.k, id: q.id, s: SuiteView.pack(su, W.t, { dbg: true }) }), 2);
      if (sv.stepN % 30 === 0) net().fast(pid, enc({ k: bat.k, id: q.id, m: SuiteView.packMaps(su, W.t) }), 3);
    }
    if (sv.stepN % 6 === 0 && bat && bat.W.own) { const t = bat.W.t, r1 = (v: THREE.Vector3) => [Math.round(v.x), Math.round(v.y), Math.round(v.z)], w = { trk: Radar.litTrk('own', t).map((e) => ({ k: e.k, f: r1(e.from), lk: e.lk ? 1 : 0 })), scan: Radar.paintsOn('own', t).map((e) => ({ k: e.k, f: r1(e.from), a: Math.round(e.age * 100) / 100 })) }; // (her warning receiver: who's tracking her, whose scanners are painting her: the server's radars')
      const js = JSON.stringify({ k: bat.k, s: SuiteView.pack(bat.W.own, bat.W.t), w }), u8 = new TextEncoder().encode(js); net().fast(null, u8.buffer as ArrayBuffer, 1); }
  }
  const dbgReq = new Map<string, { id: string; at: number }>(); // (who's asked for F8's picture of which suite, and when)
  const battleIn = (m: any) => SvBattle.request(bat, m); // (a crew request, relayed as before (the pages still run their own battle), and done to the server's)
  const battleSum = () => SvBattle.summary(bat);
  function ctxSave() { return { M: st.M, active: Z ? Z.active : 0, hostShip, breachedOf }; }
  function ctxLoad(c: any) { if (!c) return; st.M = c.M; if (Z) Z.active = c.active; hostShip = c.hostShip; breachedOf = c.breachedOf; }
  return { battle, battleSum, putAway, ctxSave, ctxLoad, st, offLimits, startRun, populate, crew, restore, tick, handle, left, glass, mayOpen, crewMayOpen, shopMsg, levelMsg, genOf, msMsg, vent };
})();
