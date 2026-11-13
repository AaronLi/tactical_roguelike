'use strict';
// The host's side of the space direction (docs/space.md), in the simulation's thread with js/server.ts and through its
// SvNet: the missions board (what's offered this visit, which the squad has picked, which are done), the squad's fleet (the
// ships it owns, the one in use, what's fitted), who's in which seat of the ship and where she is (her pilot's game flies
// her and says; it's passed on), the jump to a mission and home again, and a mission's own business aboard a ship: the
// breach, the keycards and the locked doors, the artifact, the wanted officer, the self-destruct and the escape pods, and
// the compartments open to space (a hull window shot out: the air goes, the doors seal, whoever has no suit dies).
// Money: nothing is paid for a kill, an arrest or evidence on a mission (js/server.ts pay); the mission's fee is paid to
// every officer when it's done and the ship has left.
interface SvCard { key: string; eid: number; x: number; z: number; y: number; st: 0 | 1 | 2 } // (0 carried by one of the crew, 1 on the floor, 2 taken)
interface SvMission {
  ms: SpMission; meta: ShMeta | null; docked: boolean; done: boolean; keys: Record<string, boolean>; cards: SvCard[];
  art: 0 | 1 | 2; artBy: string | null; // (0 where it lies, 1 carried, 2 lost with the ship)
  hvt: number | null; hvtSt: 0 | 1 | 2; // (0 at large, 1 dead, 2 in restraints)
  arm: number | null; boom: boolean; cleared: boolean; // (arm: seconds left on the self-destruct)
  vac: Set<number>; sealT: Map<number, number>; doorRooms: Map<number, number[]> | null; vacT: number; armSay: number;
}
const G_SpaceSv = (() => {
  const SD = G.SpaceData;
  const st = {
    board: { seed: 1, level: 1, picked: [] as number[], done: [] as number[] },
    fleet: SD.fleet0(),
    seats: {} as Record<string, number>,
    ship: { docked: true, at: null as number | null, ctl: null as string | null, pose: null as any },
    M: null as SvMission | null,
    rank: 1, // how far the squad has got: what the board's missions are pitched at
  };
  const S = () => G.Server, net = () => G.Server.net;
  const offers = () => SD.offers(st.board.seed, st.board.level);
  const boardMsg = () => ({ t: 'board', seed: st.board.seed, level: st.board.level, picked: st.board.picked, done: st.board.done });
  const shipMsg = () => ({ docked: st.ship.docked ? 1 : 0, at: st.ship.at, ctl: st.ship.ctl, pose: st.ship.pose });
  // what a screen needs to be in the hangar (or the space round it), and to be in a mission's level
  const shopMsg = () => ({ board: boardMsg(), fleet: st.fleet, seats: st.seats, ship: shipMsg() });
  function msMsg() {
    const M = st.M; if (!M) return null;
    return { t: 'ms', i: M.ms.i, docked: M.docked ? 1 : 0, done: M.done ? 1 : 0, keys: Object.keys(M.keys).filter((k) => M.keys[k]), cards: M.cards.filter((c) => c.st === 1).map((c) => [c.key, c.x, c.z, c.y]),
      art: M.art, artBy: M.artBy, artAt: M.meta && M.meta.artifact ? [M.meta.artifact.x, M.meta.artifact.z] : null, hvt: M.hvtSt, hvtId: M.hvt, arm: M.arm == null ? null : Math.ceil(M.arm), boom: M.boom ? 1 : 0, vac: [...M.vac], cleared: M.cleared ? 1 : 0 };
  }
  const levelMsg = () => (st.M ? { ms: st.M.ms, gen: genOf(st.M.ms), state: msMsg(), fleet: st.fleet, seats: st.seats, ship: shipMsg(), board: boardMsg() } : null);
  const genOf = (ms: SpMission): SpGen | null => (ms.kind === 'board' ? { size: ms.size!, obj: ms.obj, ship: st.fleet.ship } : null);
  const say = (m: string) => net().broadcast({ t: 'chat', id: null, m });
  const sync = () => { const m = msMsg(); if (m) net().broadcast(m); };

  // ---- a run begins: the hangar, the ship on its pad, a fresh board
  function startRun(fleet?: unknown) {
    const sv = S();
    st.rank = 1; st.fleet = SD.cleanFleet(fleet || st.fleet); st.seats = {}; st.M = null;
    st.board = { seed: (Math.random() * 2 ** 31) | 0, level: st.rank, picked: [], done: [] };
    st.ship = { docked: true, at: null, ctl: null, pose: null };
    sv.level = 1; sv.team = { ver: 0, items: [] }; sv.arms = {};
    net().broadcast({ t: 'newrun' });
    sv.toShop();
  }
  // the ship has set down in the hangar with missions flown: the board turns over (and the squad is that much further on)
  function landed() {
    if (!st.board.done.length) return;
    st.rank += st.board.done.length;
    S().level = st.rank;
    st.board = { seed: (Math.random() * 2 ** 31) | 0, level: st.rank, picked: [], done: [] };
    net().broadcast(boardMsg());
    say('New contracts are on the missions board.');
  }

  // ---- the jump: to mission i's place, or home (to = -1)
  function jump(to: number, from: string) {
    const sv = S();
    if (sv.leaving || !sv.players.has(from)) return;
    if (sv.phase === 'shop' && to >= 0) {
      const ms = offers()[to];
      if (!ms || !st.board.picked.includes(to) || st.board.done.includes(to) || st.ship.docked) return;
      sv.overBlack(() => begin(ms), 'ftl');
    } else if (sv.phase === 'level' && to === -1 && st.M && !st.M.docked) {
      sv.overBlack(() => home(), 'ftl');
    }
  }
  function begin(ms: SpMission) {
    const sv = S();
    st.ship.docked = false; st.ship.at = ms.i; st.ship.pose = null;
    st.M = { ms, meta: null, docked: false, done: false, keys: {}, cards: [], art: 0, artBy: null, hvt: null, hvtSt: 0, arm: null, boom: false, cleared: false, vac: new Set(), sealT: new Map(), doorRooms: null, vacT: 0, armSay: 0 };
    sv.startLevel(ms);
  }
  // the level is built and the crew is aboard her (js/server.ts startLevel calls it before it tells anyone): the mission's own people
  function populate() {
    const M = st.M, sv = S(), map = sv.map;
    if (!M || !map) return;
    const meta = M.meta = map.sp || null, TS = G.Level.TS;
    if (!meta) return; // (a base on a planet: nothing but the people in it)
    const spotIn = (ri: number) => { const rm = map.rooms[ri]; if (!rm) return null; const c = map.enemySpots.filter(([x, z]) => x >= rm.x && x < rm.x + rm.w && z >= rm.z && z < rm.z + rm.h); const s = c.length ? c[Math.floor(Math.random() * c.length)] : [rm.cx, rm.cz]; return { x: (s[0] + 0.5) * TS, z: (s[1] + 0.5) * TS }; };
    const hp = 1 + 0.04 * (sv.level - 1) + 0.1 * (Math.max(1, sv.players.size) - 1);
    if (M.ms.obj === 'hvt') {
      const p = spotIn(meta.hvtRoom);
      if (p) { const e = sv.addEnemy('leader', p.x, p.z, hp * 1.4); e.guard = true; e.drawn = true; M.hvt = e.id; }
    }
    // a keycard's carrier: someone armed already in (or nearest) the room they'd be in, else one more of the crew there
    for (const key of Object.keys(meta.cardRooms)) {
      const p = spotIn(meta.cardRooms[key]); if (!p) continue;
      let best: Enemy | null = null, bd = 9;
      for (const e of sv.enemies.values()) { if (e.def.civ || e.id === M.hvt || M.cards.some((c) => c.eid === e.id)) continue; const d = Math.hypot(e.x - p.x, e.z - p.z); if (d < bd) { bd = d; best = e; } }
      const e = best || sv.addEnemy('grunt', p.x, p.z, hp);
      M.cards.push({ key, eid: e.id, x: e.x, z: e.z, y: e.y || 0, st: 0 });
    }
  }
  // out of the mission's space: paid if it's done, and the hangar's space again (the ship at that mission's anchor)
  function home() {
    const sv = S(), M = st.M;
    if (M) {
      const ok = finished(M);
      if (ok && !st.board.done.includes(M.ms.i)) {
        st.board.done.push(M.ms.i);
        const bonus = M.ms.obj === 'hvt' && M.hvtSt === 2 ? Math.round(M.ms.pay * 0.5) : 0;
        net().broadcast({ t: 'mdone', i: M.ms.i, ok: 1, pay: M.ms.pay, bonus, name: M.ms.name });
      } else if (!ok) net().broadcast({ t: 'mdone', i: M.ms.i, ok: 0, pay: 0, name: M.ms.name });
      st.ship.at = M.ms.i;
    }
    st.M = null; st.ship.docked = false; st.ship.pose = null;
    sv.enemies.clear();
    sv.level = st.rank;
    sv.toShop();
  }
  function finished(M: SvMission) {
    const o = M.ms.obj;
    return o === 'artifact' ? M.art === 1 : o === 'hvt' ? M.hvtSt > 0 : o === 'destruct' ? M.arm != null || M.boom : M.cleared;
  }

  // ---- the ship: she's against the hull (the plate goes in), on the pad, or away again
  function dock(on: boolean, from: string) {
    const sv = S();
    if (sv.phase === 'shop') { st.ship.docked = on; if (on) { st.ship.at = null; landed(); } net().broadcast({ t: 'sdock', on: on ? 1 : 0, by: from }); return; }
    const M = st.M; if (!M || sv.phase !== 'level' || M.docked === on || M.boom) return;
    M.docked = on; st.ship.docked = on;
    net().broadcast({ t: 'sdock', on: on ? 1 : 0, by: from });
    if (on && M.meta && sv.map) {
      const b = M.meta.breach, d = sv.map.doors[b.door] as Door;
      if (d && !d.fallen) {
        const fall: [number, number[], number] = [0, [0, -1], (Math.random() * 1e9) | 0];
        (sv.fallen = sv.fallen || []).push([d.id, ...fall]);
        G.Damage.fall(sv.map as unknown as DamageMap, d as any, ...fall);
        net().broadcast({ t: 'dfall', i: d.id, f: fall });
      }
      sv.hear(b.x, b.z, G.SpaceData.fitted(st.fleet, 'jammer') ? 14 : 45, 0); // (the whole ship rings with it)
    }
    sync();
  }

  // ---- what an officer does to the mission's things
  function near(p: Player | undefined, at: { x: number; z: number } | null, r: number): p is LivePlayer { return !!(p && p.st && at && !p.st.dd && !p.st.dn && Math.hypot(p.st.p[0] - at.x, p.st.p[2] - at.z) < r); }
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
    } else if (k === 'pod' && meta.pods[n as number] && near(p, meta.pods[n as number], 2.4)) {
      // an escape pod: away from her, and picked up by your own ship (your screen puts you aboard)
      if (M.artBy === from) { /* (it goes with you) */ }
      net().sendTo(from, { t: 'pod' });
      say(`${p.name} is away in an escape pod.`);
    }
  }
  const lockOf = (d: { id: number }) => (st.M && st.M.meta ? st.M.meta.locks[d.id] || null : null);
  // may this officer open this door (js/server.ts useDoor): not the plate at the breach, and a locked one only with its card
  function mayOpen(d: { id: number; open: boolean }, from: string) {
    const M = st.M, k = lockOf(d);
    if (!M || !k) return true;
    if (k === 'breach') return false;
    if (M.keys[k] || d.open) return true;
    net().sendTo(from, { t: 'locked', i: d.id, k });
    return false;
  }
  // (the crew don't open a locked door: whoever's behind it holds it)
  const crewMayOpen = (d: { id: number }) => !lockOf(d) && !(st.M && st.M.sealT.has(d.id));

  // ---- open to space
  function doorRooms(M: SvMission) {
    if (M.doorRooms) return M.doorRooms;
    const map = S().map!, out = new Map<number, number[]>();
    for (const d of map.doors) {
      const ax = d.axis === 'x' ? 1 : 0, az = d.axis === 'z' ? 1 : 0, a = G.ShipGen.roomAt(map, d.x - ax * 1.4, d.z - az * 1.4), b = G.ShipGen.roomAt(map, d.x + ax * 1.4, d.z + az * 1.4);
      out.set(d.id, [a, b]);
    }
    return (M.doorRooms = out);
  }
  function vent(ri: number, why?: string) {
    const M = st.M, sv = S(); if (!M || !M.meta || ri < 0 || M.vac.has(ri) || !sv.map) return;
    M.vac.add(ri);
    const role = M.meta.roles[ri];
    net().broadcast({ t: 'vent', r: ri });
    say(`${(role && G.ShipGen.NAMES[role]) || 'A compartment'} is open to space${why ? ' (' + why + ')' : ''}: the doors are sealing.`);
    const rm = sv.map.rooms[ri]; if (rm) sv.hear((rm.cx + 0.5) * G.Level.TS, (rm.cz + 0.5) * G.Level.TS, 30, 0);
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
      const rs = DR.get(d.id); if (!rs || M.meta.locks[d.id] === 'breach') continue;
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
      if (!M.vac.has(G.ShipGen.roomAt(map, e.x, e.z))) continue;
      e.hp -= e.maxHp * 0.2 * dt;
      if (e.hp <= 0) { e.hp = 0.01; sv.applyHit({ e: e.id, d: 1, bo: 1, cz: 'vacuum' }, e.lastHit); }
    }
  }

  function tick(dt: number) {
    const sv = S(), M = st.M;
    if (!M || sv.phase !== 'level' || !sv.map) return;
    // a base on a planet: done when it's under control
    if (!M.meta) { if (!M.cleared && M.docked && sv.remaining(false) === 0) { M.cleared = true; M.done = true; say('The base is under control. Back to the ship.'); sync(); } return; }
    if (M.boom) return;
    // the keycards: with their carriers till they're down, in restraints or dead; then on the floor, for whoever walks up
    let ch = false;
    for (const c of M.cards) {
      if (c.st === 0) {
        const e = sv.enemies.get(c.eid);
        if (e && !e.down && e.state !== 'cuffed' && e.state !== 'dead' && e.hp > 0) { c.x = e.x; c.z = e.z; c.y = e.y || 0; }
        else { c.st = 1; ch = true; }
      } else if (c.st === 1) for (const p of sv.players.values()) if (near(p, c, 1.7)) { c.st = 2; M.keys[c.key] = true; ch = true; say(`${p.name} picked up the ${c.key === 'bridge' ? 'bridge' : 'armoury'} keycard.`); break; }
    }
    // the wanted officer
    if (M.hvt != null && M.hvtSt === 0) {
      const e = sv.enemies.get(M.hvt);
      if (!e || e.state === 'dead' || e.hp <= 0) { M.hvtSt = 1; ch = true; say('The target is dead. Back to the ship.'); }
      else if (e.state === 'cuffed') { M.hvtSt = 2; ch = true; say('The target is in restraints. Back to the ship.'); }
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
        if (!p || sv.phase !== 'shop' || !st.ship.docked || !offers()[i] || B.done.includes(i)) break;
        if (B.picked.includes(i)) B.picked = B.picked.filter((q) => q !== i); else if (B.picked.length < SD.PICKS) B.picked.push(i); else break;
        net().broadcast(boardMsg());
        break;
      }
      case 'jump': jump(m.to | 0, from); break;
      case 'sdock': if (p) dock(!!m.on, from); break;
      case 'seat': {
        if (!p) break;
        const s = m.s == null || m.s < 0 ? -1 : m.s | 0;
        if (s >= 0 && Object.keys(st.seats).some((id) => id !== from && st.seats[id] === s && sv.players.has(id))) { net().sendTo(from, { t: 'seats', s: st.seats, no: s }); break; }
        if (s < 0) delete st.seats[from]; else st.seats[from] = s;
        if (s === 0) st.ship.ctl = from; // (the helm: she's theirs to fly until someone else sits there)
        net().broadcast({ t: 'seats', s: st.seats, ctl: st.ship.ctl });
        break;
      }
      case 'spose': if (p && (st.ship.ctl === from || !st.ship.ctl || !sv.players.has(st.ship.ctl)) && Array.isArray(m.a) && m.a.length <= 16 && m.a.every(Number.isFinite)) { st.ship.ctl = from; st.ship.pose = m.a; net().broadcast({ t: 'spose', a: m.a, by: from }, from); } break;
      case 'sfire': if (p && Array.isArray(m.a) && m.a.length <= 12 && m.a.every(Number.isFinite)) net().broadcast({ t: 'sfire', a: m.a, by: from }, from); break;
      case 'shit': if (p && Number.isFinite(m.i)) net().broadcast({ t: 'shit', i: m.i | 0, hp: +m.hp || 0, by: from }, from); break; // (a hull gun hit by a turret, or the ship by one: told to all)
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
        const ms: SpMission = Object.assign({}, o, { i: 0, kind: board ? 'board' : 'assault', obj: board ? (['artifact', 'hvt', 'destruct'].includes(q.obj) ? q.obj : 'artifact') : 'assault', size: board ? (['small', 'medium', 'large'].includes(q.size) ? q.size : 'small') : null,
          th: Number.isInteger(q.th) && SD.themeAt(q.th) ? q.th : board ? SD.TH0 : o.th, seed: Number.isInteger(q.seed) ? q.seed : o.seed, diff: Math.max(1, q.diff | 0), night: !!q.night, name: board ? 'MV Debug' : 'Debug', where: 'debug start', fuse: q.fuse > 0 ? +q.fuse : undefined });
        st.board.picked = [0]; st.ship.docked = false;
        sv.overBlack(() => begin(ms), 'ftl');
        break;
      }
      case 'finit': if (from === net().myId && sv.phase === 'lobby') st.fleet = SD.cleanFleet(m.f); break; // (the host's own fleet, as its page kept it)
    }
  }
  function left(id: string) {
    if (st.seats[id] != null) { delete st.seats[id]; net().broadcast({ t: 'seats', s: st.seats, ctl: st.ship.ctl }); }
    if (st.M && st.M.artBy === id) { st.M.art = 0; st.M.artBy = null; sync(); }
  }
  return { st, startRun, populate, tick, handle, left, glass, mayOpen, crewMayOpen, shopMsg, levelMsg, genOf, msMsg, vent };
})();
G.SpaceSv = G_SpaceSv;
interface GameModules { SpaceSv: typeof G_SpaceSv; }
