'use strict';
// Host-authoritative simulation: lobby/phase flow, suspect + civilian AI, doors, compliance and arrests,
// damage resolution, objectives and the vote to leave.
// Only runs on the hosting peer. Talks to clients exclusively through G.Net.
const STATE_CODE = { normal: 0, flee: 0, surrender: 1, cuffed: 2, cower: 3 };

G.Server = {
  players: new Map(),
  phase: 'lobby',
  level: 0,
  seed: 0,
  shopSeed: 0,
  map: null,
  enemies: new Map(),
  nextEid: 1,
  extract: { active: false, votes: new Set() }, // active: order restored (the required objective); votes: who's voted to leave
  flow: null,
  flowT: 0,
  snapT: 0,
  wipeT: 0,
  summons: 0,
  accMult: 1,
  dmgMult: 1,
  skins: new Map(), // the squad's guns' sticker lists by hash (js/stickers.js share): kept for whoever joins

  reset() {
    this.players.clear(); this.enemies.clear();
    this.phase = 'lobby'; this.level = 0; this.map = null; this.leaving = null;
  },
  roster() {
    const r = {};
    for (const [id, p] of this.players) r[id] = { name: p.name, color: p.color, animal: p.animal, look: p.look, ready: p.ready, host: id === G.Net.myId };
    return r;
  },
  sendRoster() { G.Net.broadcast({ t: 'roster', roster: this.roster() }); },

  handle(m, from) {
    const p = this.players.get(from);
    switch (m.t) {
      case 'hello': {
        const name = String(m.name || 'Operator').slice(0, 16);
        // their animal (one of each to a squad: if theirs is taken, the first one free)
        const CS = G.Callsigns, taken = new Set([...this.players.values()].filter((q) => q.id !== from).map((q) => q.animal));
        let animal = CS.valid(m.animal) ? m.animal : null;
        if (!animal || taken.has(animal)) animal = (CS.LIST.find((a) => !taken.has(a.id)) || CS.of(animal)).id;
        const color = CS.of(animal).color;
        this.players.set(from, { id: from, name, color, animal, look: G.Rig.cleanLook(m.look), ready: false, st: null });
        G.Net.sendTo(from, {
          t: 'welcome', id: from, roster: this.roster(), phase: this.phase, level: this.level,
          seed: this.seed, shopSeed: this.shopSeed, th: this.theme, route: this.routeMsg(), stock: this.phase === 'shop' ? this.stock : null,
          doors: this.map && this.phase === 'level' ? this.map.doors.map((d) => (d.open ? 1 : 0)) : null,
          holes: this.phase === 'level' ? this.holes || null : null, fallen: this.phase === 'level' ? this.fallen || null : null,
          evidence: this.phase === 'level' && this.evidence ? this.evidence.filter((v) => !v.taken).map((v) => [v.i, v.wpn, v.x, v.z, v.secured ? 1 : 0, v.y || 0]) : null,
          bodies: this.phase === 'level' && this.bodies ? [...this.bodies.values()].map((b) => [b.id, b.type, b.x, b.z, b.yaw, b.secured ? 1 : 0, b.y || 0]) : null,
          wcase: this.phase === 'level' ? this.caseMsg() : null, cabs: this.phase === 'level' ? this.cabMsg() : null, abox: this.phase === 'level' ? this.aboxMsg() : null,
          loot: this.phase === 'level' && this.loot ? [...this.loot.values()].map((l) => this.lootMsg(l)) : null,
          glass: this.phase === 'level' && this.glassBroken ? [...this.glassBroken] : null, cracked: this.phase === 'level' ? this.glassCracked || null : null,
          skins: [...this.skins], sbox: this.phase === 'level' ? this.sboxMsg() : null,
        });
        if (this.phase === 'shop') G.Net.sendTo(from, this.teamMsg());
        this.sendRoster();
        if (from !== G.Net.myId) G.Net.broadcast({ t: 'chat', id: null, m: name + ' joined the squad.' });
        break;
      }
      case 'st': if (p) p.st = m.s; break;
      case 'rfx': if (p && Array.isArray(m.a)) G.Net.broadcast({ t: 'rfx', a: m.a.slice(0, 32) }, from); break; // (the marks a round left on what it went through or off)
      case 'bstk': if (p) G.Net.broadcast(m, from); break; // (a bolt that stuck: js/bolts.js)
      case 'hole': // (what it took out of them, js/damage.js: kept for whoever joins, and here for the suspects' eyes and rounds)
        if (p && Array.isArray(m.a) && this.map && this.phase === 'level') {
          const a = m.a.slice(0, 32); (this.holes = this.holes || []).push(...a);
          for (const h of a) G.Damage.apply(this.map, h);
          G.Net.broadcast({ t: 'hole', a }, from);
        }
        break;
      case 'dhit': { const d = this.map && this.phase === 'level' ? this.map.doors[m.i] : null; if (d && p) this.doorHit(d, m.pt, m.J, m.dir); break; }
      case 'rpath': if (p && Array.isArray(m.ps)) G.Net.broadcast({ t: 'rpath', k: m.e ? 'e' + m.e : 'p' + from, sid: m.sid, ps: m.ps.slice(0, 32) }, from); break; // (where it went: for everyone's replays)
      // a gun's stickers (js/stickers.js): kept and passed on; asked for by someone who's seen its hash and not it
      case 'skin': {
        if (!p || typeof m.h !== 'string' || m.h.length > 24 || this.skins.has(m.h)) break;
        if (this.skins.size > 300) this.skins.delete(this.skins.keys().next().value);
        this.skins.set(m.h, G.Stickers.clean(m.l));
        G.Net.broadcast({ t: 'skin', h: m.h, l: this.skins.get(m.h) });
        break;
      }
      case 'skinReq': if (this.skins.has(m.h)) G.Net.sendTo(from, { t: 'skin', h: m.h, l: this.skins.get(m.h) }); break;
      case 'hit': this.applyHit(m, from); break;
      // an officer's armour stopped rounds and they're still up: everyone's highlights (js/highlights.js saved)
      case 'saved': if (p && this.phase === 'level') G.Net.broadcast({ t: 'saved', id: from, n: Math.max(1, Math.min(9, m.n | 0)) }); break;
      case 'shot':
        if (p && p.st && this.phase === 'level') this.hear(p.st.p[0], p.st.p[2], m.sil === 2 ? 2 : m.sil ? 6 : 28, p.st.p[1]); // (not at the range)
        if (m.f && m.to && this.phase === 'level') this.suppress(m.f, m.to, G.Gunsmith.fromCode(m.w), G.AMMO[m.am] ? m.am : undefined);
        G.Net.broadcast({ t: 'shot', id: from, sid: m.sid, f: m.f, to: m.to, w: m.w, sil: m.sil, am: G.AMMO[m.am] ? m.am : undefined,
          tos: Array.isArray(m.tos) && m.tos.length <= 24 && m.tos.every((p) => Array.isArray(p) && p.length === 3 && p.every(Number.isFinite)) ? m.tos : undefined }, from); // (a shotgun's pellets: for the highlights)
        break;
      case 'nade': G.Net.broadcast({ t: 'nade', id: from, p: m.p, v: m.v, fuse: m.fuse, k: m.k === 'flash' ? 'flash' : 'frag', s: [0, 1, 2].includes(m.s) ? m.s : 2 }, from); break;
      case 'flash': if (this.phase === 'level' && Array.isArray(m.p) && m.p.length === 3 && m.p.every(Number.isFinite)) this.flashbang(m.p); break;
      // an officer's round went through these windows
      case 'glass': if (this.phase === 'level' && Array.isArray(m.ids)) this.breakGlass(m.ids, m.p); break;
      case 'crack': { // (a first round through a pane: it's fractured, and it's heard)
        const w = this.phase === 'level' && this.map && this.map.windows && this.map.windows[m.id];
        if (!w || w.broken || w.armor || w.cracked || !Array.isArray(m.p)) break;
        w.cracked = true; this.glassCracked.push([m.id, m.p]); this.hear(w.x, w.z, 10, w.fy || 0);
        G.Net.broadcast({ t: 'crack', id: m.id, p: m.p }, from);
        break;
      }
      case 'boom':
        this.hear(m.p[0], m.p[2], 35, m.p[1] || 0);
        // the blast takes out the windows round it
        if (this.map && this.map.windows && Array.isArray(m.p)) this.breakGlass(this.map.windows.filter((w) => !w.broken && Math.hypot(w.x - m.p[0], w.z - m.p[2]) < (+m.r || 4) * 1.3 && Math.abs((w.fy || 0) + 1.3 - (m.p[1] || 0)) < 2.5).map((w) => w.id), m.p);
        G.Net.broadcast({ t: 'boom', id: from, p: m.p, r: m.r, d: m.d });
        break;
      case 'revive': G.Net.broadcast({ t: 'revive', tg: m.tg, by: from, hp: m.hp }); break;
      // the range's IPSC course: a new stage laid (its seed), and a run as it happens (passed on to the others)
      case 'course': if (+m.seed > 0) G.Net.broadcast({ t: 'course', seed: Math.floor(+m.seed) }, from); break;
      case 'crun': if (m.s && typeof m.s === 'object') G.Net.broadcast({ t: 'crun', s: m.s, by: from }, from); break;
      // one officer's medical item on another: passed on to them (they apply it)
      case 'treat': if (G.Med.ITEMS[m.mt] && G.Med.NAME[m.part]) G.Net.broadcast({ t: 'treat', tg: m.tg, by: from, part: m.part, mt: m.mt, th: m.th ? 1 : 0 }); break;
      // an officer has started (or stopped) putting a medical item on another: only the one it's going on hears of it
      case 'applying': if (p && G.Med.ITEMS[m.mt] && G.Med.NAME[m.part] && this.players.has(m.tg)) G.Net.sendTo(m.tg, { t: 'applying', by: from, part: m.part, mt: m.mt, dur: G.U.clamp(+m.dur || 0, 0, 30), off: m.off ? 1 : 0 }); break;
      // a vote to leave (or taking it back), once order's restored
      case 'vote':
        if (this.phase === 'level' && this.extract.active && p) { if (m.v) this.extract.votes.add(from); else this.extract.votes.delete(from); }
        break;
      case 'ready':
        if (p) { p.ready = !!m.r; this.sendRoster(); this.checkReady(); }
        break;
      // a vote on the route map for where to go next
      case 'arm': // a player's own sidearm for the run (not a vote: everyone's told who took what)
        if (p && G.Arsenal.has(m.id)) { this.arms = this.arms || {}; this.arms[from] = m.id; G.Net.broadcast({ t: 'arms', a: this.arms }); }
        break;
      case 'pick':
        if (p && this.phase === 'route' && G.Route.options(this.routeMap, this.route.path[this.route.path.length - 1]).includes(m.n)) {
          this.route.votes[from] = m.n;
          G.Net.broadcast({ t: 'rvotes', v: this.route.votes });
          this.checkPicks();
        }
        break;
      case 'chat': if (p) G.Net.broadcast({ t: 'chat', id: from, m: String(m.m).slice(0, 120) }); break;
      // friendly fire: one officer's rounds in another (the shooter traced them; the one hit takes the wounds)
      case 'ff': if (p && this.phase === 'level' && this.players.has(m.tg) && Array.isArray(m.ws)) G.Net.broadcast({ t: 'ffhit', by: from, tg: m.tg, ws: m.ws.slice(0, 24), rang: m.rang, stopped: m.stopped, wear: m.wear, at: m.at, f: m.f, e: m.e, fc: Array.isArray(m.fc) ? m.fc.slice(0, 12) : undefined, hd: Array.isArray(m.hd) ? m.hd.slice(0, 12) : undefined }); break; // (what someone's round did to an officer, as they worked it out; e: a suspect's)
      case 'ping': if (p && Array.isArray(m.p) && m.p.length === 3) G.Net.broadcast({ t: 'ping', id: from, p: m.p.map(Number) }); break;
      // something put down (dropped from an inventory), or picked up: the first to ask gets it
      case 'drop': {
        // (never refused once it's off them: an item can't be lost. Their position, when we have it, keeps it
        // at their feet)
        if (this.phase !== 'level' || !p || !m.item || typeof m.item !== 'object') break;
        let x = +m.x, z = +m.z;
        if (!isFinite(x) || !isFinite(z)) { if (!p.st) break; x = p.st.p[0]; z = p.st.p[2]; }
        if (p.st && Math.hypot(x - p.st.p[0], z - p.st.p[2]) > 2.5) { x = p.st.p[0]; z = p.st.p[2]; }
        // (at: back where something else lay, a gun swapped for one in the weapon case, or what you'd no room for: its height, yaw and fit)
        const back = Array.isArray(m.at) && x === +m.x && z === +m.z ? m.at : null;
        const l = this.lootAdd(x, back ? +back[0] || 0 : G.Level.groundAt(this.map, x, z, 0.05, ((p.st && p.st.p[1]) || 0) + 1.2), z, m.item, back ? +back[1] || 0 : Math.random() * Math.PI * 2, back ? back[2] : undefined);
        G.Net.broadcast({ t: 'loot', a: [this.lootMsg(l)], by: from });
        break;
      }
      case 'take': {
        const l = this.loot && this.loot.get(m.id);
        if (this.phase !== 'level' || !l || !p || !p.st || Math.hypot(l.x - p.st.p[0], l.z - p.st.p[2]) > 2.5) break;
        this.loot.delete(l.id);
        G.Net.broadcast({ t: 'lootRm', id: l.id });
        G.Net.sendTo(from, { t: 'lootGot', item: l.item, x: l.x, z: l.z, at: [l.y, l.yaw, l.fit] });
        break;
      }
      case 'useDoor': {
        const d = this.map && this.phase === 'level' ? this.map.doors[m.i] : null;
        if (d && p && p.st && Math.hypot(p.st.p[0] - d.x, p.st.p[2] - d.z) < 2.8 && Math.abs(p.st.p[1] - (d.fy || 0)) < 2) {
          this.setDoor(d.id, !d.open);
          if (d.kind === 'vault') { // both leaves together
            const partner = d.mirror ? this.map.doors[d.id - 1] : this.map.doors[d.id + 1] && this.map.doors[d.id + 1].mirror ? this.map.doors[d.id + 1] : null;
            if (partner) this.setDoor(partner.id, d.open);
          }
          const field = this.soundField(d.x, d.z, d.fy || 0);
          for (const e of this.enemies.values()) if (this.heardAt(field, e.x, e.z, e.y) < 7) this.suspect(e, d.x, d.z); // a door is heard
        }
        break;
      }
      case 'kickDoor': {
        const d = this.map && this.phase === 'level' ? this.map.doors[m.i] : null;
        if (d && !d.open) { this.kickAt = this.kickAt || {}; this.kickAt[from] = this.clock || 0; } // (a kill soon after: a breach, for the highlights)
        if (d && !d.open && d.kind !== 'vault' && p && p.st && Math.hypot(p.st.p[0] - d.x, p.st.p[2] - d.z) < 2.8 && Math.abs(p.st.p[1] - (d.fy || 0)) < 2) this.kickDoor(d);
        break;
      }
      case 'shout': if (p && p.st && this.phase === 'level') this.shout(p, from); break;
      // open the weapon case (once, for everyone)
      case 'openCase': {
        const c = this.map && this.map.case;
        if (this.phase !== 'level' || !c || this.caseOpen || !p || !p.st || Math.hypot(c.x - p.st.p[0], c.z - p.st.p[2]) > 2.4) break;
        this.caseOpen = true;
        G.Net.broadcast({ t: 'wcase', c: this.caseMsg() });
        this.casePut();
        break;
      }
      // the attachments box: one use each. Your first look rolls your three (for the weapon in your hands: its code);
      // then you take one of them, fitted to your weapon or carried
      case 'openAbox': case 'takeAbox': {
        const b = this.map && this.map.abox, a = this.abox;
        if (this.phase !== 'level' || !b || !a || !p || !p.st || Math.hypot(b.x - p.st.p[0], b.z - p.st.p[2]) > 2.4) break;
        const mine = a.uses[from];
        if (m.t === 'openAbox') {
          if (mine) break;
          a.open = true; a.uses[from] = { items: this.rollAbox(typeof m.code === 'string' ? m.code : ''), taken: null };
          G.Net.broadcast({ t: 'abox', a: this.aboxMsg(), opened: from });
        } else {
          const pid = mine && !mine.taken ? mine.items[m.i | 0] : null;
          if (!pid) break;
          mine.taken = pid;
          G.Net.broadcast({ t: 'abox', a: this.aboxMsg(), by: from, got: pid, fit: !!m.fit });
        }
        break;
      }
      // the sticker box: the sticker goes to whoever opens it first
      case 'openSbox': {
        const b = this.map && this.map.sbox, s = this.sbox;
        if (this.phase !== 'level' || !b || !s || s.by || !p || !p.st || Math.hypot(b.x - p.st.p[0], b.z - p.st.p[2]) > 2.4) break;
        s.by = from;
        G.Net.broadcast({ t: 'sbox', s: this.sboxMsg() });
        break;
      }
      // first aid cabinets: opened (once, for everyone), and officers' edits (what they took and put in)
      case 'teamEdit': {
        if (this.phase !== 'shop' || !p) break;
        const r = this.teamEdit(m);
        G.Net.broadcast(Object.assign(this.teamMsg(), { by: from, deny: r.deny, ret: r.ret }));
        break;
      }
      case 'openCab': case 'cabEdit': {
        const c = this.map && this.map.cabinets && this.map.cabinets[m.i], cab = this.cabs && this.cabs[m.i];
        if (this.phase !== 'level' || !c || !cab || !p || !p.st || Math.hypot(c.x - p.st.p[0], c.z - p.st.p[2]) > 2.6) break;
        let r = null;
        if (m.t === 'openCab') { if (cab.open) break; cab.open = true; }
        else { if (!cab.open) break; r = this.cabEdit(cab, m); }
        G.Net.broadcast({ t: 'cab', i: m.i, c: [cab.open ? 1 : 0, cab.items, cab.ver], by: r ? from : null, took: r && r.took, deny: r && r.deny, ret: r && r.ret });
        break;
      }
      // "Turn around!": a kneeling suspect (or cowering civilian) turns to face away from the officer
      case 'turn': {
        const e = this.enemies.get(m.e);
        if (!e || !p || !p.st || !this.obedient(e) || Math.hypot(e.x - p.st.p[0], e.z - p.st.p[2]) > 3.5) break;
        e.turnYaw = Math.atan2(-(e.x - p.st.p[0]), -(e.z - p.st.p[2])); // facing straight away from them
        e.ordered = true;
        G.Net.broadcast({ t: 'order', id: from, e: e.id });
        break;
      }
      // pulled back from a wall so there's room to lay them down
      case 'drag': {
        const e = this.enemies.get(m.e);
        if (!e || !p || !p.st || !this.obedient(e) || Math.hypot(e.x - p.st.p[0], e.z - p.st.p[2]) > 2.6) break;
        if (Math.hypot(m.x - e.x, m.z - e.z) > 1.6) break;
        e.dragTo = { x: m.x, z: m.z };
        break;
      }
      case 'cuff': if (p && p.st && this.phase === 'level') this.cuff(m.e, p, from, m.at); break;
      // the store's shared stock (js/shop.js take): one off the shelf if there's one left; put back if it couldn't be paid for
      case 'stake': {
        const ok = p && this.phase === 'shop' && this.stock && this.stock[m.k] > 0;
        if (ok) { this.stock[m.k]--; G.Net.broadcast({ t: 'stock', s: this.stock }); }
        G.Net.sendTo(from, { t: 'took', q: m.q, ok: ok ? 1 : 0 });
        break;
      }
      case 'sgive': if (p && this.phase === 'shop' && this.stock && m.k in this.stock) { this.stock[m.k]++; G.Net.broadcast({ t: 'stock', s: this.stock }); } break;
      case 'secure': if (p && p.st && this.phase === 'level') this.secure(m.i, p, from); break;
    }
  },
  onLeave(id) {
    const p = this.players.get(id);
    if (!p) return;
    this.players.delete(id);
    G.Net.broadcast({ t: 'left', id });
    G.Net.broadcast({ t: 'chat', id: null, m: p.name + ' left the squad.' });
    this.sendRoster();
    this.checkReady();
    if (this.route) { delete this.route.votes[id]; this.checkPicks(); }
  },

  // --------------------------------------------------------------- phases
  startRun() {
    this.level = 1;
    this.team = { ver: 0, items: [] };
    this.arms = {}; // (the sidearms picked: each player's own)
    G.Net.broadcast({ t: 'newrun' });
    this.toRoute();
  },
  // ---------------------------------------------------------------- the route map
  // Before each level the squad picks where to go on the act's map (a new map every ten levels, the last
  // the boss). Everyone votes; when all have, the most votes wins (a tie is settled at random).
  toRoute() {
    const act = G.Route.actOf(this.level);
    if (!this.route || this.route.act !== act) {
      this.route = { seed: (Math.random() * 2 ** 31) | 0, act, path: [], votes: {} };
      this.routeMap = G.Route.gen(this.route.seed, act);
    }
    this.route.votes = {};
    this.phase = 'route';
    for (const p of this.players.values()) p.ready = false;
    G.Net.broadcast({ t: 'phase', phase: 'route', level: this.level, route: this.routeMsg() });
    this.sendRoster();
  },
  routeMsg() { return this.route ? { seed: this.route.seed, act: this.route.act, path: this.route.path, votes: this.route.votes } : null; },
  checkPicks() {
    if (this.phase !== 'route' || !this.players.size || this.leaving) return;
    for (const id of this.players.keys()) if (this.route.votes[id] == null) return;
    const tally = {};
    for (const n of Object.values(this.route.votes)) tally[n] = (tally[n] || 0) + 1;
    const top = Math.max(...Object.values(tally)), best = Object.keys(tally).filter((n) => tally[n] === top);
    const n = +best[Math.floor(Math.random() * best.length)];
    this.route.path.push(n);
    this.theme = this.routeMap.nodes.get(n).th;
    this.overBlack(() => this.startLevel());
  },
  // Building the next place stalls the host, and it's built before anyone's told: so everyone's screen goes black first
  // (js/game.js veil), and go runs once it has, if the phase is still the one it was asked from. Only one at a time.
  overBlack(go) {
    if (this.leaving) return;
    const run = this.leaving = {}, from = this.phase;
    G.Net.broadcast({ t: 'veil' });
    setTimeout(() => {
      if (this.leaving !== run) return; // (gone back to the menu)
      this.leaving = null;
      if (this.phase === from) go();
    }, G.Game.VEIL_MS + 40);
  },
  startLevel() {
    this.phase = 'level';
    this.seed = (Math.random() * 2 ** 31) | 0;
    this.map = G.Level.generate(this.seed, this.level, this.theme);
    this.enemies.clear();
    this.extract = { active: false, votes: new Set() };
    this.flow = null; this.flowT = 0; this.wipeT = 0; this.summons = 0; this.nadeT = 8;
    this.report = { incap: 0, bleedouts: 0, bleedBy: {}, arrests: 0, rescued: 0, civKilled: 0, unauth: 0, evidence: 0, bodies: 0 };
    this.evidence = []; // weapons on the floor: { i, wpn, x, z, owner, secured, taken }
    this.loot = new Map(); // things officers have put down: id -> { id, x, y, z, item (packed), yaw }
    this.glassBroken = new Set(); this.glassCracked = []; // windows broken (map.windows ids), and fractured ([id, where])
    this.holes = []; this.fallen = []; // (what's been shot out of the place: js/damage.js)
    this.bodies = new Map(); // the dead, until secured: id -> { id, type, x, z, yaw, civ, secured }
    for (const p of this.players.values()) { p.ready = false; p.st = null; }
    this.spawnEnemies();
    this.wcase = this.map.case ? this.rollCase() : null;
    this.cabs = (this.map.cabinets || []).map(() => ({ open: false, ver: 0, items: this.layCab(this.rollCab()) }));
    this.caseOpen = false;
    this.abox = this.map.abox ? { open: false, uses: {} } : null; // uses: player id -> { items, taken }
    // the sticker box's sticker: one of the host's (js/stickers.js names; none, and the box isn't there)
    const sn = G.Stickers.names;
    this.sbox = this.map.sbox && sn.length ? { s: sn[Math.floor(Math.random() * sn.length)], by: null } : null;
    G.Net.broadcast({ t: 'phase', phase: 'level', level: this.level, seed: this.seed, th: this.theme, route: this.routeMsg(), wcase: this.caseMsg(), cabs: this.cabMsg(), abox: this.aboxMsg(), sbox: this.sboxMsg() });
  },
  // The level's weapon case: a weapon in its standard build, fully loaded, picked by rarity. Each tier has a
  // share (CASE_RARITY), split evenly between that tier's weapons so a tier with many weapons isn't more
  // likely; deeper levels shift the odds toward rarer tiers, and legendaries only turn up from level 3.
  // Three in four are long guns. (Tier 0, the starter pistol, turns up too: less often the deeper you go.)
  CASE_RARITY: { 0: 15, 1: 60, 2: 28, 3: 10, 4: 2 },
  caseOdds(level, slot) {
    const byTier = {};
    for (const w of G.WEAPON_LIST) if (w.slot === slot && G.obtainable(w) && this.CASE_RARITY[w.tier] && !(w.tier === 4 && level < 3)) (byTier[w.tier] = byTier[w.tier] || []).push(w);
    const out = [];
    for (const [tier, list] of Object.entries(byTier)) {
      const share = this.CASE_RARITY[tier] * Math.pow(1 + 0.25 * (level - 1), tier - 1);
      for (const w of list) out.push([w, share / list.length]);
    }
    return out;
  },
  rollCase() {
    const odds = this.caseOdds(this.level, Math.random() < 0.75 ? 'p' : 's');
    let x = Math.random() * odds.reduce((a, [, wt]) => a + wt, 0), w = odds[0][0];
    for (const [cand, wt] of odds) { x -= wt; if (x <= 0) { w = cand; break; } }
    // loaded, with two full spare magazines (or that many rounds), all of one type: mostly ball, now and then
    // something better
    // A gun that takes other receiver groups (js/parts.js RCV) now and then turns up built on one of them: an M4
    // lower with the AR-9 kit in it, an AK with the RPK's, fitted and working (its barrel and all), magazines and
    // rounds to match.
    const kits = G.Gunsmith.kitsFor(w.id).filter((k) => G.obtainable(G.WEAPONS[G.Gunsmith.PARTS[k].becomes]));
    if (kits.length && Math.random() < 0.35) w = G.WEAPONS[G.Gunsmith.PARTS[kits[Math.floor(Math.random() * kits.length)]].becomes] || w;
    return { code: G.Gunsmith.defaultCode(w.id), mag: w.mag, reserve: w.mag * 2, am: G.rollAmmo(G.calOf(w)) };
  },
  // Something lying in the world (G.Loot), and how it's sent
  lootAdd(x, y, z, item, yaw, fit) {
    const l = { id: (this.lootId = (this.lootId || 0) + 1), x, y, z, item, yaw, fit };
    this.loot.set(l.id, l);
    if (this.loot.size > 80) { const old = this.loot.keys().next().value; this.loot.delete(old); G.Net.broadcast({ t: 'lootRm', id: old }); }
    return l;
  },
  lootMsg(l) { return [l.id, l.x, l.y, l.z, l.item, l.yaw, l.fit]; },
  // The case, opened: what's in it is loose in the foam, to be picked up like anything else lying about. The gun along
  // the back with its grip to the front, and its spares in a row along the front, by the muzzle.
  casePut() {
    const c = this.map.case, got = this.wcase, def = got && G.Gunsmith.fromCode(got.code);
    if (!def) return;
    this.wcase = null;
    const Gr = G.Gear, w = G.Me.makeWeapon(def.id, def.build), ch = G.chambered(def) && got.mag > 0; // (the count is everything in it: one of them's in the chamber)
    w.ammo = G.ammoOk(G.calOf(def), got.am);
    w.mag = Math.min(got.mag - (ch ? 1 : 0), G.Me.magSize(def));
    if (w.tube) w.tube = Array(w.mag).fill(w.ammo);
    w.chamber = ch ? w.ammo : null;
    const cos = Math.cos(c.yaw), sin = Math.sin(c.yaw), FOAM = 0.032;
    const put = (it, lx, lz, turn, fit) => this.lootMsg(this.lootAdd(c.x + lx * cos + lz * sin, FOAM, c.z - lx * sin + lz * cos, Gr.pack(it), c.yaw + turn, fit));
    G.Net.broadcast({ t: 'loot', a: [put(Gr.gunItem(w), 0, -0.03, -Math.PI / 2, 1.28), ...Gr.spares(def, got.reserve, w.ammo).map((it, i) => put(it, 0.55 - i * 0.2, 0.13, 0))] });
  },
  // A first aid cabinet's contents: one to three things, mostly bandages and painkillers, now and then a
  // tourniquet, gauze, a chest seal or a splint. [[mt, n], ...], like kinds stacked together.
  CAB_ODDS: [['bandage', 30], ['pills', 16], ['tourniquet', 18], ['gauze', 14], ['seal', 12], ['splint', 10], ['bloodbag', 5]],
  rollCab() {
    const n = Math.random() < 0.45 ? 1 : Math.random() < 0.73 ? 2 : 3, out = [], total = this.CAB_ODDS.reduce((a, [, w]) => a + w, 0);
    for (let i = 0; i < n; i++) {
      let x = Math.random() * total, mt = 'bandage';
      for (const [k, w] of this.CAB_ODDS) { x -= w; if (x <= 0) { mt = k; break; } }
      const k = (mt === 'bandage' || mt === 'pills') && Math.random() < 0.4 ? 2 : 1, have = out.find((o) => o[0] === mt);
      if (have && have[1] + k <= (G.Med.ITEMS[mt].stack || 1)) have[1] += k; else out.push([mt, k]);
    }
    return out;
  },
  // A cabinet is a CAB_W x CAB_H grid (medical gear only): items [[mt, n, x, y, rot], ...]. ver counts changes,
  // so an edit made against an older state is checked rather than taken as it is.
  CAB_W: 3, CAB_H: 2,
  cabGrid(items) {
    const Gr = G.Gear, g = Gr.grid(this.CAB_W, this.CAB_H, ['med']);
    for (const [mt, n, x, y, r] of items) Gr.put(g, Gr.medItem(mt, n), x, y, r);
    return g;
  },
  cabItems(g) { return g.items.map((p) => [p.it.mt, p.it.n || 1, p.x, p.y, p.r ? 1 : 0]); },
  // [[mt, n]] laid into the grid (stacks first); returns the items, and what didn't fit in .left
  layCab(list, items = []) {
    const Gr = G.Gear, g = this.cabGrid(items), left = [];
    for (const [mt, n] of list) {
      const it = Gr.medItem(mt, n);
      for (const p of g.items) if (it.n > 0) Gr.mergeMed(it, p.it);
      if (it.n > 0) { const s = Gr.findSpot(g, it); if (s) Gr.put(g, it, s.x, s.y, s.rot); else left.push([mt, it.n]); }
    }
    const out = this.cabItems(g);
    out.left = left;
    return out;
  },
  cabCounts(items) { const c = {}; for (const [mt, n] of items) c[mt] = (c[mt] || 0) + n; return c; },
  // an officer's edit: what they took out and put in, and how they left it laid out
  cabEdit(cab, m) {
    const Gr = G.Gear, clean = (o) => { const r = {}; for (const [k, v] of Object.entries(o || {})) if (G.Med.ITEMS[k] && v > 0) r[k] = Math.min(20, Math.floor(+v) || 0); return r; };
    const take = clean(m.take), put = clean(m.put), have = this.cabCounts(cab.items), took = {}, deny = {};
    for (const [mt, n] of Object.entries(take)) { took[mt] = Math.min(n, have[mt] || 0); if (took[mt] < n) deny[mt] = n - took[mt]; }
    // the layout as they left it, if nothing changed under them and it adds up
    let lay = null;
    if (m.ver === cab.ver && !Object.keys(deny).length && Array.isArray(m.lay) && m.lay.length <= this.CAB_W * this.CAB_H) {
      const g = Gr.grid(this.CAB_W, this.CAB_H, ['med']), want = Object.assign({}, have);
      for (const [mt, n] of Object.entries(took)) want[mt] -= n;
      for (const [mt, n] of Object.entries(put)) want[mt] = (want[mt] || 0) + n;
      let ok = true;
      for (const e of m.lay) {
        const [mt, n, x, y, r] = Array.isArray(e) ? e : [];
        const it = G.Med.ITEMS[mt] && Gr.medItem(mt, Math.floor(+n));
        if (!it || !(it.n >= 1 && it.n <= Gr.medStack(it)) || !Gr.fits(g, it, x | 0, y | 0, r ? 1 : 0)) { ok = false; break; }
        Gr.put(g, it, x | 0, y | 0, r ? 1 : 0); want[mt] -= it.n;
      }
      if (ok && Object.values(want).every((v) => v === 0)) lay = this.cabItems(g);
    }
    let ret = [];
    if (!lay) { // re-laid here: what they took comes off the stacks, what they put in goes on (what doesn't fit goes back)
      const items = cab.items.map((e) => e.slice());
      for (const [mt, n0] of Object.entries(took)) { let n = n0; for (const e of items) if (e[0] === mt && n > 0) { const k = Math.min(n, e[1]); e[1] -= k; n -= k; } }
      lay = this.layCab(Object.entries(put), items.filter((e) => e[1] > 0));
      ret = lay.left;
    }
    cab.items = lay; cab.ver++;
    return { took, deny, ret };
  },
  cabMsg() { return (this.cabs || []).map((c) => [c.open ? 1 : 0, c.items, c.ver]); },
  // The team locker: a TEAM_W x TEAM_H grid at the quartermaster's that the whole squad shares for the run.
  // items: [[tid, x, y, rot, packed item], ...]; ver counts changes. An officer sends how they left it: take
  // (the tids they took out), keep (where the rest now sit), put (what they put in, and where). Made against
  // the state as it is, it's taken as it is; against an older one, their takes and puts are merged into
  // what's there now (taking something already gone is denied, a put with no room left comes back).
  TEAM_W: 7, TEAM_H: 5,
  team: null,
  teamMsg() { const t = this.team || { ver: 0, items: [] }; return { t: 'team', ver: t.ver, items: t.items }; },
  teamGrid() { const g = G.Gear.grid(this.TEAM_W, this.TEAM_H, null, 'Team locker'); g.locker = true; return g; },
  teamEdit(m) {
    const Gr = G.Gear, t = this.team || (this.team = { ver: 0, items: [] }), have = new Map(t.items.map((e) => [e[0], e]));
    const arr = (a) => (Array.isArray(a) ? a.slice(0, this.TEAM_W * this.TEAM_H) : []);
    const take = arr(m.take).map(String), keep = arr(m.keep).filter(Array.isArray), put = [];
    for (const e of arr(m.put)) { if (!Array.isArray(e)) continue; try { const it = Gr.unpack(e[4]); put.push([String(e[0]), e[1] | 0, e[2] | 0, e[3] ? 1 : 0, Gr.pack(it), it]); } catch (err) { /* not an item */ } }
    const deny = take.filter((tid) => !have.has(tid)), unpack = (e) => Gr.unpack(e[4]);
    let items = null;
    const ret = [];
    if (m.ver === t.ver && !deny.length && keep.length + take.length === have.size && keep.every((e) => have.has(String(e[0])))) {
      const g = this.teamGrid(), out = [];
      let ok = true;
      for (const [tid, x, y, r] of keep) { const e = have.get(String(tid)), it = unpack(e); if (!Gr.fits(g, it, x | 0, y | 0, r ? 1 : 0)) { ok = false; break; } Gr.put(g, it, x | 0, y | 0, r); out.push([e[0], x | 0, y | 0, r ? 1 : 0, e[4]]); }
      for (const [tid, x, y, r, pk, it] of ok ? put : []) { if (have.has(tid) || !Gr.fits(g, it, x, y, r)) { ok = false; break; } Gr.put(g, it, x, y, r); out.push([tid, x, y, r, pk]); }
      if (ok) items = out;
    }
    if (!items) { // merged into what's there now
      const g = this.teamGrid(), gone = new Set(take);
      items = t.items.filter((e) => !gone.has(e[0]));
      for (const e of items) Gr.put(g, unpack(e), e[1], e[2], e[3]);
      for (const [tid0, , , , pk, it] of put) {
        const s = Gr.findSpot(g, it), tid = have.has(tid0) ? tid0 + '+' : tid0;
        if (s) { Gr.put(g, it, s.x, s.y, s.rot); items.push([tid, s.x, s.y, s.rot ? 1 : 0, pk]); } else ret.push(pk);
      }
    }
    t.items = items; t.ver++;
    return { deny, ret };
  },
  // An attachments box's three, rolled when it's opened: attachments that go straight onto the weapon in the opener's
  // hands as it's built (G.Gunsmith.attachOptions), the lower tiers likelier; if that's fewer than three (or they had
  // nothing in their hands), the rest are attachments for anything, to carry
  rollAbox(code) {
    const GS = G.Gunsmith, def = code ? GS.fromCode(code) : null, out = [];
    const draw = (pool) => {
      while (out.length < 3 && pool.length) {
        let r = Math.random() * pool.reduce((a, p) => a + 1 / (p.tier || 1), 0), at = 0;
        for (; at < pool.length - 1; at++) { r -= 1 / (pool[at].tier || 1); if (r <= 0) break; }
        out.push(pool[at].id); pool = pool.filter((_, i) => i !== at);
      }
    };
    draw(def ? GS.attachOptions(def.id, def.build) : []);
    draw(GS.LIST.filter((p) => !p.factory && !p.variant && !p.retired && !p.becomes && (p.tier || 1) <= 2 && !out.includes(p.id) && ['muzzle', 'fg', 'tac', 'optic', 'magnifier', 'stock'].includes(p.slot)));
    return out;
  },
  // [open, { player id: [their three part ids, the one they took (or null)] }] or null when the level has no box
  sboxMsg() { return this.map && this.map.sbox && this.sbox ? [this.sbox.s, this.sbox.by || 0] : null; }, // [the sticker, who took it]
  aboxMsg() {
    if (!this.map || !this.map.abox || !this.abox) return null;
    const u = {};
    for (const [id, e] of Object.entries(this.abox.uses)) u[id] = [e.items, e.taken];
    return [this.abox.open ? 1 : 0, u];
  },
  // [code (null when empty), mag, reserve, open, ammo type] or null when the level has no case
  caseMsg() { return !!this.caseOpen; },
  toShop() {
    this.phase = 'shop';
    this.shopSeed = (Math.random() * 2 ** 31) | 0;
    this.stock = G.Shop.scaleStock(G.Shop.baseStock(this.level, this.shopSeed), this.players.size); // (as many of each as there are of you)
    this.liftT = null; this.snapT = 0;
    for (const p of this.players.values()) p.ready = false;
    G.Net.broadcast({ t: 'phase', phase: 'shop', level: this.level, shopSeed: this.shopSeed, report: this.report, stock: this.stock });
    G.Net.broadcast(this.teamMsg());
    this.sendRoster();
  },
  // Everyone in the helicopter: it takes a few seconds to spin up (anyone who gets out stops it), then it's off to the map
  checkReady(go) {
    if (this.phase !== 'shop' || this.players.size === 0) return;
    for (const p of this.players.values()) if (!p.ready) { this.liftT = null; return; }
    if (!go) { if (this.liftT == null) this.liftT = 3; return; }
    this.level++;
    this.toRoute(); // where next: the map
  },
  gameOver() {
    this.phase = 'gameover';
    const stats = {};
    for (const [id, p] of this.players) stats[id] = { name: p.name, color: p.color, animal: p.animal, sx: p.st ? p.st.sx : null };
    G.Net.broadcast({ t: 'phase', phase: 'gameover', level: this.level, stats });
  },
  toLobby() {
    this.phase = 'lobby';
    this.route = null; this.routeMap = null; this.theme = null;
    this.enemies.clear();
    for (const p of this.players.values()) p.ready = false;
    G.Net.broadcast({ t: 'phase', phase: 'lobby' });
    this.sendRoster();
  },

  // --------------------------------------------------------------- enemies
  spawnEnemies() {
    const L = this.level, np = Math.max(1, this.players.size), U = G.U;
    const big = this.map.theme.big || 1, count = Math.min(Math.round((4 + Math.floor(L * 1.5) + (np - 1) * 2) * (this.map.theme.foes || 1)), 32 * big); // (a bigger map: more of them, and room for more)
    const hpMult = 1 + 0.04 * (L - 1) + 0.1 * (np - 1);
    this.accMult = Math.min(1 + 0.03 * (L - 1), 1.5);
    this.dmgMult = 1 + 0.07 * (L - 1);
    const weights = [['suspect', 4], ['grunt', 2.5 + L * 0.2], ['rusher', 1 + L * 0.2], ['marksman', L >= 2 ? 0.8 + L * 0.15 : 0], ['heavy', L >= 3 ? 0.4 + L * 0.2 : 0]];
    const total = weights.reduce((a, w) => a + w[1], 0);
    // (a spot: [tx, tz] on the fine grid, and in a building of several floors its floor)
    let spots = U.shuffle(Math.random, this.map.enemySpots.slice());
    const W = this.map.W, unitOf = (sp) => { const ua = G.Level.floorMap(this.map, sp[2] || 0).unitAt; return ua ? ua[sp[1] * W + sp[0]] : -1; };
    if (this.map.unitAt) { // apartments: a spot in each one goes to the front of the list
      const first = [], seen = new Set();
      for (const sp of spots) { const u = unitOf(sp); if (u >= 0 && !seen.has(u)) { seen.add(u); first.push(sp); } }
      spots = first.concat(spots.filter((sp) => !first.includes(sp)));
    } else if (this.map.NF > 1 || this.map.theme.starter) { // houses (and the corner store): a spot in every room indoors, on every floor (the basements and upstairs too), first
      const OUT = new Set(['yard', 'alley', 'lawn', 'road', 'lot', 'carpark']), rooms = this.map.rooms;
      const roomOf = (sp) => rooms.findIndex((r) => (r.fl || 0) === (sp[2] || 0) && sp[0] >= r.x && sp[0] < r.x + r.w && sp[1] >= r.z && sp[1] < r.z + r.h);
      const first = [], seen = new Set();
      for (const sp of spots) { const ri = roomOf(sp); if (ri >= 0 && !OUT.has(rooms[ri].type) && !seen.has(ri)) { seen.add(ri); first.push(sp); } }
      spots = first.concat(spots.filter((sp) => !first.includes(sp)));
    }
    this.unitsSeen = new Set(); // apartments an officer has been inside
    const used = [], fy = (f) => G.Level.floorMap(this.map, f || 0).fy || 0;
    const close = (tx, tz, f) => used.some(([ux, uz, uf]) => (uf || 0) === (f || 0) && Math.abs(ux - tx) + Math.abs(uz - tz) < 2 * G.Level.K);
    for (const [tx, tz, tf] of spots) {
      if (used.length >= count) break;
      if (close(tx, tz, tf)) continue;
      used.push([tx, tz, tf]);
      let roll = Math.random() * total, type = 'grunt';
      for (const [ty, w] of weights) { if (roll < w) { type = ty; break; } roll -= w; }
      this.addEnemy(type, (tx + 0.5) * G.Level.TS, (tz + 0.5) * G.Level.TS, hpMult, fy(tf));
    }
    // civilians caught up in it (more at a festival: some of them hiding behind the stalls' counters; the other
    // stalls were left as they ran)
    const crowd = this.map.theme.crowd || 1, civs = Math.min(Math.round((2 + Math.floor(L / 2)) * crowd), 8 * big), TS = G.Level.TS;
    let placed = 0;
    for (const s of U.shuffle(Math.random, (this.map.civSpots || []).slice())) {
      if (placed >= Math.ceil(civs * 0.6)) break;
      const tx = Math.floor(s.x / TS), tz = Math.floor(s.z / TS);
      if (this.map.t[tz * this.map.W + tx] !== 0 || close(tx, tz, 0)) continue;
      used.push([tx, tz]);
      const c = this.addEnemy('civ', s.x, s.z, 1);
      c.state = 'hide'; c.hide = { x: s.x, z: s.z, lean: 0 }; c.crouch = true; c.yaw = s.yaw; c.peekT = 1 + Math.random() * 3;
      placed++;
    }
    for (const [tx, tz, tf] of spots) {
      if (placed >= civs) break;
      if (close(tx, tz, tf)) continue;
      used.push([tx, tz, tf]);
      this.addEnemy('civ', (tx + 0.5) * G.Level.TS, (tz + 0.5) * G.Level.TS, 1, fy(tf));
      placed++;
    }
    if (G.Route.isBoss(L)) {
      const ex = this.map.extract;
      const b = this.addEnemy('warden', ex.x, ex.z, (1 + 0.5 * (G.Route.actOf(L) - 1)) * (1 + 0.35 * (np - 1)));
      b.guard = true;
    }
  },
  // The chance of each of a kind of armour (G.ENEMY_GEAR.odds) on someone dressed for level L, and one of them rolled (0: none)
  armourRoll(kind, L) {
    const G2 = G.ENEMY_GEAR, at = G2.at, o = G2.odds[kind];
    let i = 0; while (i < at.length - 2 && L >= at[i + 1]) i++;
    const f = G.U.clamp((L - at[i]) / (at[i + 1] - at[i]), 0, 1);
    let x = Math.random();
    for (let k = 0; k < o.ids.length; k++) { x -= o.by[i][k] + (o.by[i + 1][k] - o.by[i][k]) * f; if (x < 0) return o.ids[k]; }
    return 0;
  },
  // A suspect's kit for this level: a weapon from its type's pool and armour, at a gear tier around the level's.
  // The def is the type's, with the kit laid over it (weapon, its damage, pellets and rate of fire, armour).
  equip(type) {
    const base = G.ENEMIES[type], G2 = G.ENEMY_GEAR;
    if (base.civ || !G2.weapons[type]) return base;
    const r = Math.random(), tier = base.boss ? G.gearTier(this.level) : G.U.clamp(G.gearTier(this.level) + (r < 0.2 ? -1 : r > 0.88 ? 1 : 0), 1, 4);
    const pool = G2.weapons[type][tier - 1], wpn = pool[Math.floor(Math.random() * pool.length)], w = G.WEAPONS[wpn];
    const kitL = Math.max(1, this.level + (tier - G.gearTier(this.level)) * 2); // (a tier up or down is dressed a couple of levels on or back)
    const fixed = base.armor && G2.fixed[base.armor];
    const d = Object.create(base);
    d.wpn = wpn; d.gear = tier; d.pellets = w.pellets; d.snd = w.cls;
    d.vest = fixed ? fixed.vest[tier - 1] : this.armourRoll('vest', kitL) || 'none';
    d.helmet = fixed ? fixed.helmet[tier - 1] : this.armourRoll('helmet', kitL) || 'nohelm';
    // a mandible or a face shield on the helmet's mount (a helmet with a visor has its own; no helmet, nowhere to put one)
    d.face = d.helmet === 'ach' || d.helmet === 'riflehelm' ? (fixed && fixed.face ? fixed.face[tier - 1] || 0 : this.armourRoll('face', kitL)) : 0;
    // shoulder, pelvis and leg armour, on what a plate carrier can take
    d.ex = fixed ? (fixed.ex || [])[tier - 1] || [] : d.vest === 'steel' || d.vest === 'ceramic' ? ['shoulder', 'groin', 'legs'].map((k) => this.armourRoll(k, kitL)).filter(Boolean) : [];
    // a light and a laser on the gun, more often the better equipped they are (flags as an officer's: js/player.js tacFlags)
    const tl = G2.tac, light = this.level >= tl.lightFrom && (base.boss || Math.random() < tl.light[tier - 1]), laser = this.level >= tl.laserFrom && (base.boss || Math.random() < tl.laser[tier - 1]);
    d.tac = (light ? 1 | (tier >= 4 ? 8 : 0) : 0) | (laser ? 2 | (Math.random() < 0.35 ? 4 : 0) : 0);
    // automatic weapons fire at their own rate in the type's bursts; others as fast as the type works them
    if (base.rof) {
      if (w.mode === 'auto') d.rof = 60 / w.rpm;
      else { d.rof = Math.max(base.rof, 60 / w.rpm); d.burst = [1, w.shell || w.cls === 'SNP' ? 1 : 2]; }
    }
    return d;
  },
  addEnemy(type, x, z, hpMult, y = 0) {
    const def = this.equip(type);
    const e = {
      id: this.nextEid++, type, def, x, z, yaw: Math.random() * Math.PI * 2,
      hp: def.hp * hpMult, maxHp: def.hp * hpMult, alert: false, spot: 0, tgt: null, tgtD: 99, canSee: false,
      percT: Math.random() * 0.3, cool: 1, burstLeft: 0, aiming: false, aimT: 0, strafe: 0, strafeT: 0,
      idleT: Math.random() * 3, idleYaw: 0, pendingAlert: -1, lostT: 0, lastHit: null,
      cover: null, inCover: false, peek: false, peekT: 0, coverT: Math.random(), coverStuck: 0, crouch: false,
      nadeT: 4 + Math.random() * 6, lastSeen: null,
      morale: def.morale != null ? def.morale : 0.5, broken: false, noise: null, holding: false,
      // the magazine in their gun (a part-used one, sometimes), and injuries (see injure)
      mag: 0, magMax: 0, reloadT: 0, bleedH: 0, bleedL: 0, clotT: 0, legs: 0, arms: 0, lung: false,
      // unaware suspects carry their weapon holstered/slung; drawing it takes def.draw seconds
      drawn: !def.civ && !!def.ready, drawT: 0, surprisedT: 0, suspicious: false, calmT: 0,
      state: 'normal', armed: !def.civ, shouts: 0, complyCd: 0, suppressT: 0, doorWait: 0, leanOut: 0,
      runner: !!def.civ && Math.random() < 0.3, home: { x, y, z }, walkTo: null, fleeT: 0, fake: false, fakeT: 0,
      y, // the floor under their feet (on the stairs: the step they're on)
    };
    const w = !def.civ && G.WEAPONS[def.wpn];
    if (w && w.mag > 0 && !w.explosive) { e.magMax = w.mag; e.mag = Math.random() < 0.25 ? Math.max(1, Math.ceil(w.mag * (0.3 + Math.random() * 0.6))) : w.mag; }
    if (this.map) G.Level.resolve(this.map, e, 0.38 * def.scale, y, G.World.STEP); // (spots are cell centres: clear of the walls beside them)
    if (this.map) e.yaw = this.openYaw(e, e.yaw); // (facing into the room, not the wall: a gun at the ready would go through it)
    this.enemies.set(e.id, e);
    return e;
  },
  // How far someone can go straight ahead facing `yaw` (to the first thing in the way at the knee or the chest),
  // up to max.
  roomAhead(e, yaw, max) {
    const w = this.map && this.map.world;
    if (!w) return max;
    const dx = -Math.sin(yaw), dz = -Math.cos(yaw), y = e.y || 0;
    return Math.min(G.World.raycast(w, e.x, y + 0.5, e.z, dx, 0, dz, max, { move: true }).t, G.World.raycast(w, e.x, y + 1.3, e.z, dx, 0, dz, max, { move: true }).t);
  },
  // A way to face with room in front (not nose to a wall, a gun held out through it): yaw itself if it has, else
  // the roomiest of a few tries within spread of it.
  openYaw(e, yaw, spread = Math.PI * 2) {
    let best = yaw, room = -1;
    for (let k = 0; k < 6; k++) {
      const a = k ? yaw + (Math.random() - 0.5) * spread : yaw, d = this.roomAhead(e, a, 1.5);
      if (d >= 1.5) return a;
      if (d > room) { room = d; best = a; }
    }
    return best;
  },
  // Somewhere to amble to, near where they started: a few steps along a way with room to walk it (not toward a
  // point behind a wall, to stand pressed against the wall till they give up), or null to stay put.
  amble(e) {
    for (let k = 0; k < 4; k++) {
      const a = Math.random() * Math.PI * 2, want = 0.6 + Math.random() * 1.9;
      const r = Math.min(want, this.roomAhead(e, a, want + 0.8) - 0.8);
      if (r < 0.5) continue;
      const x = e.x - Math.sin(a) * r, z = e.z - Math.cos(a) * r;
      if (Math.hypot(x - e.home.x, z - e.home.z) <= 2.5) return { x, z };
    }
    return null;
  },
  draw(e) {
    if (e.def.civ || !e.armed || e.drawn) return;
    e.drawn = true;
    e.drawT = e.def.draw || 0.8;
  },
  alertEnemy(e, spread, heardOnly) {
    if (heardOnly && !e.alert && !e.def.ready && !e.def.boss && Math.random() < 0.55) e.lurk = true; // hides first, draws when it sees you
    else { e.lurk = false; this.draw(e); }
    if (!e.alert) {
      e.alert = true;
      e.cool = Math.max(e.cool, 0.8 + Math.random() * 0.9); // hesitate before the first shot
    }
    if (spread) {
      const field = this.soundField(e.x, e.z, e.y);
      for (const o of this.enemies.values()) {
        if (!o.alert && !o.def.civ && o.pendingAlert < 0 && this.heardAt(field, o.x, o.z, o.y) < 12) o.pendingAlert = 0.4 + Math.random() * 0.6;
      }
    }
  },
  // Sound travels through the building, not through walls: distance in metres along walkable tiles from
  // the source, where a closed door adds 10 m (muffled) and walls stop it. In a building of several floors it
  // goes up and down the stairs, straight up or down through a drop (a stairwell, a loft's living room), and
  // through a floor, heavily muffled (another 15 m: a shot overhead is heard, footsteps aren't). Cached per
  // source cell (and floor) + door state. y: the source's height.
  soundField(x, z, y = 0) {
    const map = this.map, L = G.Level, TS = L.TS, W = map.W, H = map.H, WH = W * H, floors = map.floors || [map], NF = floors.length;
    const sx = G.U.clamp(Math.floor(x / TS), 0, W - 1), sz = G.U.clamp(Math.floor(z / TS), 0, H - 1), f0 = L.floorAt(map, x, y, z);
    const key = f0 * WH + sz * W + sx + '|' + (map.doorVer || 0);
    if (!this._sound || this._sound.map !== map) this._sound = { map, cache: new Map() };
    const hit = this._sound.cache.get(key);
    if (hit) return hit;
    // distances counted in cells (whole numbers, for the bucket queue), returned in metres by heardAt
    const MAXD = Math.round(60 / TS), DOOR = Math.round(10 / TS), SLAB = Math.round(15 / TS), dist = new Float32Array(NF * WH).fill(Infinity), buckets = [];
    const links = map.floors ? L.nav(map).links : null;
    const push = (n, d) => { if (d < dist[n] && d <= MAXD) { dist[n] = d; (buckets[d] || (buckets[d] = [])).push(n); } };
    push(f0 * WH + sz * W + sx, 0);
    for (let d = 0; d <= MAXD; d++) {
      const b = buckets[d];
      if (!b) continue;
      for (const n of b) {
        if (dist[n] !== d) continue;
        const f = (n / WH) | 0, i = n - f * WH, fm = floors[f], t = fm.t, tx = i % W, tz = (i / W) | 0;
        for (const [ox, oz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nx = tx + ox, nz = tz + oz;
          if (nx < 0 || nz < 0 || nx >= W || nz >= H) continue;
          const j = nz * W + nx, v = t[j];
          if (v === 1) continue; // walls stop it (crates don't)
          let cost = 1;
          if (v === 3) { const dd = fm.doorAt.get(j); if (dd && !dd.open) cost += DOOR; }
          push(f * WH + j, d + cost);
        }
        if (NF === 1 || t[i] === 1) continue;
        for (const m of (links && links.get(n)) || []) push(m, d + 1); // up or down a flight
        // straight up or down: through a drop, or (muffled) through the floor
        if (f + 1 < NF) { const u = floors[f + 1].t[i]; if (u !== 1) push(n + WH, d + (u === 5 ? 1 : SLAB)); }
        if (f > 0 && floors[f - 1].t[i] !== 1) push(n - WH, d + (t[i] === 5 ? 1 : SLAB));
      }
    }
    if (this._sound.cache.size > 48) this._sound.cache.clear();
    this._sound.cache.set(key, dist);
    return dist;
  },
  // how far (metres, through the building) a sound is from (x, y, z), from its field
  heardAt(field, x, z, y = 0) {
    const L = G.Level, TS = L.TS, map = this.map, f = map.floors ? L.floorAt(map, x, y, z) : 0;
    return field[f * map.W * map.H + G.U.clamp(Math.floor(z / TS), 0, map.H - 1) * map.W + G.U.clamp(Math.floor(x / TS), 0, map.W - 1)] * TS;
  },
  hear(x, z, radius, y = 0) {
    const field = this.soundField(x, z, y);
    for (const e of this.enemies.values()) {
      if (this.heardAt(field, e.x, e.z, e.y) > radius) continue;
      if (e.def.civ) { this.panic(e, { x, z }); continue; }
      if (e.state === 'normal') e.noise = { x, z };
      if (!e.alert && e.state === 'normal') e.pendingAlert = e.pendingAlert >= 0 ? e.pendingAlert : 0.2 + Math.random() * 0.5;
    }
  },
  // Rounds passing close by, or smacking into things next to them: suspects flinch into cover and shoot
  // worse. Suppression (e.sup, 0..1) builds with every round, more the closer it comes (a round past the ear
  // counts for a lot, one a couple of metres off for little), so sustained close fire pins them; it wears off
  // over a few seconds. It costs them up to 60% of their accuracy.
  // It reaches them when the round does, or its report if that's first (a subsonic round's), and then it takes a person
  // a moment to react, 100 to 200 ms, mostly about 150, a startle's time: nothing changes in them till then, so a
  // shot they're taking still goes. What the shooter fired is told here, and each suspect it passes close to gets it
  // from e.supQ ([when, how close]) in their own time: nearMiss.
  SOUND: 343, REACT: [0.1, 0.2],
  suppress(f, to, def, am) {
    const ax = f[0], ay = f[1], az = f[2], bx = to[0] - ax, by = to[1] - ay, bz = to[2] - az, len2 = bx * bx + by * by + bz * bz || 1;
    const v0 = def ? G.roundSpeed(def, am) : 0;
    for (const e of this.enemies.values()) {
      if (e.def.civ || e.state !== 'normal') continue;
      const ey = (e.y || 0) + 1.2 * e.def.scale, t = G.U.clamp(((e.x - ax) * bx + (ey - ay) * by + (e.z - az) * bz) / len2, 0, 1);
      const miss = Math.hypot(ax + bx * t - e.x, ay + by * t - ey, az + bz * t - e.z);
      if (miss >= 2.2) continue;
      const d = t * Math.sqrt(len2), v = def ? (v0 + G.roundSpeed(def, am, d)) / 2 : 0; // (its average speed over the way there)
      const react = this.REACT[0] + (this.REACT[1] - this.REACT[0]) * (Math.random() + Math.random()) / 2;
      (e.supQ = e.supQ || []).push([(this.clock || 0) + d / Math.max(this.SOUND, v) + react, miss]);
    }
  },
  // A round's gone past. Close enough to feel it, they get down where they stand, out of a peek, for a moment. Then they
  // have a moment up before the next can do it: fire keeps them rattled, but no one gun holds anyone down for good. A
  // boss and a rusher, who never take cover, take it on their feet.
  FLINCH: { R: 1.5, T: 0.35, SUP: 0.4, UP: 0.5 },
  // coming out of cover to shoot: how long before they can fire (their body's still coming out: js/views.js), and the
  // least they stay out, from when they start, whether or not the shot's done
  PEEK: { UP: 0.7, MIN: 1.5 },
  nearMiss(e, miss) {
    const F = this.FLINCH;
    e.sup = Math.min(1, (e.sup || 0) + 0.12 + 0.3 * (1 - miss / 2.2));
    e.suppressT = Math.max(e.suppressT, 1.2 + 2 * e.sup);
    // a burst is frightening, but not once per round: at most one morale hit every 0.35 s
    if (this.clock - (e.supAt || -9) > 0.35) { e.morale -= 0.06 * (e.def.steady || 1); e.supAt = this.clock; }
    this.alertEnemy(e, false);
    if (miss < F.R && !e.def.boss && e.type !== 'rusher' && this.clock >= (e.flinchOk || 0)) {
      e.flinchT = F.T + F.SUP * e.sup; e.flinchOk = this.clock + e.flinchT + F.UP;
      e.peek = false; e.aiming = false;
    }
  },
  suspect(e, x, z) {
    if (e.def.civ || e.alert || e.state !== 'normal') return;
    e.suspicious = true;
    e.calmT = 20;
    e.noise = { x, z };
    this.draw(e);
  },
  // Footsteps: louder the faster you move (lowered weapon > walk > steadied), quieter crouched; they
  // carry along the building (around corners, muffled by shut doors) rather than through walls. Unaware suspects who hear you get suspicious instead of being caught off guard.
  footsteps(alive) {
    const L = G.Level, map = this.map;
    for (const p of alive) {
      const mv = p.st.mv || 0;
      // by how you're moving, not raw speed (kit weight changes speed, not how carefully you place your feet)
      let r = mv < 0.4 ? 0 : p.st.lr ? 9 : p.st.sd ? 2 : 5;
      if (p.st.cr) r *= 0.6;
      if (!r) continue;
      const [px, py, pz] = p.st.p;
      const field = this.soundField(px, pz, py);
      for (const e of this.enemies.values()) {
        if (e.def.civ || e.alert || e.state !== 'normal') continue;
        if (this.heardAt(field, e.x, e.z, e.y) > r) continue;
        this.suspect(e, px, pz);
      }
    }
  },
  panic(e, src) {
    if (e.state !== 'normal') return;
    e.threat = src || this.nearestOfficer(e);
    // many duck behind something and peek out, exactly like a suspect in cover; the rest run or freeze
    const r = Math.random();
    if (r < (e.runner ? 0.3 : 0.5) && this.seekHide(e)) { e.state = 'hide'; return; }
    e.state = e.runner || r > 0.75 ? 'flee' : 'cower';
    e.fleeT = 3 + Math.random() * 3;
  },
  nearestOfficer(e) {
    let best = null;
    for (const p of this.players.values()) {
      if (!p.st || p.st.dn || p.st.dd) continue;
      const d = Math.hypot(p.st.p[0] - e.x, p.st.p[2] - e.z);
      if (!best || d < best.d) best = { x: p.st.p[0], z: p.st.p[2], d };
    }
    return best;
  },

  // ---------------------------------------------------------------- hiding (civilians and suspects alike)
  // A spot out of sight of the danger: crouched behind furniture, or standing round a wall edge where
  // leaning out gives a look. Nobody shares a spot.
  findHide(e, from) {
    const L = G.Level, map = this.map, TS = L.TS;
    let best = null, bs = 1e9;
    const taken = (x, z) => { for (const o of this.enemies.values()) if (o !== e && ((o.hide && Math.hypot(o.hide.x - x, o.hide.z - z) < 1.1) || (o.cover && Math.hypot(o.cover.x - x, o.cover.z - z) < 1.1))) return true; return false; };
    const ey = e.y || 0, fy = from.y || 0, here = (q) => Math.abs((q.y || 0) - ey) < 1.5; // (a spot on their own floor)
    for (const c of map.cover) {
      const d = Math.hypot(c.x - e.x, c.z - e.z);
      if (d > 14 || !here(c)) continue;
      const score = d - Math.hypot(c.x - from.x, c.z - from.z) * 0.35, cy = c.y || 0;
      if (score >= bs || L.los(map, from.x, fy + 1.5, from.z, c.x, cy + 0.75, c.z) || taken(c.x, c.z)) continue;
      best = { x: c.x, y: cy, z: c.z, lean: 0, fl: c.fl || 0 }; bs = score;
    }
    let tried = 0;
    for (const w of map.wallSpots) {
      const d = Math.hypot(w.x - e.x, w.z - e.z);
      if (d > 12 || tried > 40 || !here(w)) continue;
      const fd = Math.hypot(w.x - from.x, w.z - from.z) || 1, score = d - fd * 0.35 + 1, wy = w.y || 0;
      if (score >= bs) continue;
      tried++;
      if (L.los(map, from.x, fy + 1.5, from.z, w.x, wy + 1.4, w.z) || taken(w.x, w.z)) continue;
      const nx = -(from.z - w.z) / fd, nz = (from.x - w.x) / fd;
      for (const side of [1, -1]) {
        const px = w.x + nx * side * 0.55, pz = w.z + nz * side * 0.55;
        if (L.tile(L.floorMap(map, w.fl || 0), Math.floor(px / TS), Math.floor(pz / TS)) !== 0 || !this.leanClear(w.x, w.z, px, pz, 1.5, wy) || !L.los(map, px, wy + 1.5, pz, from.x, fy + 1.4, from.z)) continue;
        best = { x: w.x, y: wy, z: w.z, lean: side, fl: w.fl || 0 }; bs = score;
        break;
      }
    }
    return best;
  },
  seekHide(e) {
    const from = e.threat || this.nearestOfficer(e);
    const spot = from && this.findHide(e, from);
    e.hide = spot || null;
    e.peeking = false; e.peekT = 1 + Math.random() * 2;
    return !!spot;
  },
  // Run to the spot; once there, stay down and every few seconds pop up (or lean out round the edge) to
  // look toward the danger, now and then moving somewhere else. Returns false if they can't get there.
  hideStep(e, dt, speed) {
    const h = e.hide, U = G.U, L = G.Level;
    const d = Math.hypot(h.x - e.x, h.z - e.z);
    if (d > 0.3) {
      if (!h.flow) h.flow = L.flow(this.map, [L.src(this.map, h.x, h.y, h.z)]);
      const step = d > 1.6 ? L.flowStep(this.map, h.flow, e.x, e.z, e.y) : null;
      const tx = step ? step.x : h.x, tz = step ? step.z : h.z, dx = tx - e.x, dz = tz - e.z, dd = Math.hypot(dx, dz) || 1;
      e.yaw += U.angDiff(e.yaw, Math.atan2(-dx, -dz)) * Math.min(1, dt * 8);
      e.crouch = d < 2.5; e.leanOut = 0; // ducks as they get there
      const ox = e.x, oz = e.z;
      this.moveEntity(e, dx / dd, dz / dd, speed * (e.crouch ? 0.7 : 1), dt);
      h.stuck = Math.hypot(e.x - ox, e.z - oz) < speed * dt * 0.2 ? (h.stuck || 0) + dt : 0;
      if (h.stuck > 2) { e.hide = null; return false; }
      return true;
    }
    e.peekT -= dt;
    if (e.peekT <= 0) {
      e.peeking = !e.peeking;
      e.peekT = e.peeking ? this.PEEK.MIN + Math.random() * 1.1 : 2 + Math.random() * 3.5;
      if (!e.peeking && Math.random() < 0.15) e.relocate = true;
    }
    const look = e.threat;
    if (look) e.yaw += U.angDiff(e.yaw, Math.atan2(-(look.x - e.x), -(look.z - e.z))) * Math.min(1, dt * 4);
    e.crouch = h.lean ? false : !e.peeking;
    e.leanOut = e.peeking && h.lean ? h.lean : 0;
    return true;
  },
  // A round struck what holds a door. Its handle gone, the latch lets go and it swings open; all its hinges gone, nothing's holding
  // it up, and it falls (js/damage.js: the same fall for everyone, from what's said here).
  doorHit(d, pt, J, dir) {
    if (d.fallen || d.kind === 'vault' || !(pt === 'h' || pt === 0 || pt === 1 || pt === 2) || !Array.isArray(dir)) return;
    const hp = d.hp || (d.hp = { h: G.Damage.PARTS.handle, 0: G.Damage.PARTS.hinge, 1: G.Damage.PARTS.hinge, 2: G.Damage.PARTS.hinge });
    if (hp[pt] <= 0) return;
    hp[pt] -= Math.max(0, +J || 0);
    if (hp[pt] > 0) return;
    G.Net.broadcast({ t: 'dpart', i: d.id, pt });
    if (pt === 'h' && !d.open) this.setDoor(d.id, true, true);
    if (hp[0] <= 0 && hp[1] <= 0 && hp[2] <= 0) {
      const fall = [d.open ? 1 : 0, [dir[0], dir[1]], (Math.random() * 1e9) | 0];
      (this.fallen = this.fallen || []).push([d.id, ...fall]);
      G.Damage.fall(this.map, d, ...fall);
      G.Net.broadcast({ t: 'dfall', i: d.id, f: fall });
    }
  },
  setDoor(id, open, kicked) {
    const d = this.map && this.map.doors[id];
    if (!d || d.open === open || d.fallen) return;
    d.open = open;
    G.World.door(this.map.world, this.map, d);
    this.map.doorVer = (this.map.doorVer || 0) + 1; // sound paths change
    G.Net.broadcast({ t: 'door', i: id, o: open ? 1 : 0, k: kicked ? 1 : 0 });
  },
  // the level clears when every living person — suspect or civilian — is restrained (the dead count as resolved)
  // Dynamic entry: the door slams open, loud. Unaware suspects right behind it are startled; those already
  // alert lose a beat; everyone in earshot is alerted; civilians panic.
  kickDoor(d) {
    this.setDoor(d.id, true, true);
    // a double door: both leaves go (the second leaf is the one flagged mirror, right after its partner)
    const partner = d.mirror ? this.map.doors[d.id - 1] : this.map.doors[d.id + 1] && this.map.doors[d.id + 1].mirror ? this.map.doors[d.id + 1] : null;
    if (partner) this.setDoor(partner.id, true, true);
    const field = this.soundField(d.x, d.z, d.fy || 0);
    for (const e of this.enemies.values()) {
      const hd = this.heardAt(field, e.x, e.z, e.y);
      if (hd > 16) continue;
      if (e.def.civ) { this.panic(e, { x: d.x, z: d.z }); continue; }
      if (e.state !== 'normal') continue;
      if (hd <= 6) {
        if (!e.alert) { this.alertEnemy(e, false); e.surprisedT = 1.2 + Math.random() * 0.6; }
        else e.cool = Math.max(e.cool, 0.6);
      } else if (!e.alert) e.pendingAlert = e.pendingAlert >= 0 ? e.pendingAlert : 0.3 + Math.random() * 0.5;
    }
  },
  // (a suspect down and bleeding out is dealt with: they never get up again. A civilian down still needs rescuing.)
  remaining(civ = null) { let n = 0; for (const e of this.enemies.values()) if (e.state !== 'cuffed' && !(e.down && !e.def.civ) && (civ === null || !!e.def.civ === civ)) n++; return n; },
  openBodies() { let n = 0; for (const b of this.bodies.values()) if (!b.secured) n++; return n; },
  openEvidence() { let n = 0; for (const v of this.evidence) if (!v.secured && !v.taken) n++; return n; },
  // Objectives. "Bring Order to Chaos" (required): every suspect zip-tied, down or dead. "Rescue All of the
  // Civilians" (optional, a bonus): every civilian secured alive. Bodies and evidence pay too. Once order is
  // restored the squad can vote to leave (Y); the level ends when every officer still alive has voted.
  checkClear() {
    const left = this.remaining(false);
    if (left === 0 && !this.extract.active) { this.extract.active = true; G.Net.broadcast({ t: 'clear' }); }
  },
  // every civilian secured, none killed
  allRescued() { return this.remaining(true) === 0 && !this.report.civKilled; },

  // "POLICE! SHOW ME YOUR HANDS!" Everyone in earshot and sight rolls to comply.
  shout(p, from) {
    const [px, py, pz] = p.st.p, ey = py + (p.st.pr ? 0.36 : p.st.cr ? 1.0 : 1.6), map = this.map, L = G.Level;
    const officers = [...this.players.values()].filter((q) => q.st && !q.st.dn && !q.st.dd);
    let complied = 0;
    for (const e of this.enemies.values()) {
      if (!(e.state === 'normal' || e.state === 'cower' || e.state === 'flee' || e.state === 'hide')) continue;
      const d = Math.hypot(e.x - px, e.z - pz);
      const eh = (e.y || 0) + 1.4 * e.def.scale;
      if (d > 16 || e.complyCd > 0 || !L.los(map, px, ey, pz, e.x, eh, e.z)) continue;
      e.complyCd = 1.0;
      let chance;
      if (e.def.civ) chance = e.runner ? 0.35 : 0.9;
      else {
        // Caught off guard with the weapon still holstered: very likely to give up. Gun already up and
        // feeling brave: unlikely. Hurt, pinned down, outnumbered, broken or yelled at repeatedly all help.
        const seen = officers.filter((q) => L.los(map, q.st.p[0], q.st.p[1] + 1.5, q.st.p[2], e.x, eh, e.z)).length;
        const surprised = e.surprisedT > 0 || !e.alert;
        chance = e.def.comply
          + (surprised ? 0.4 : 0)
          + (!e.drawn ? 0.3 : e.drawT > 0 ? 0.05 : -0.15) // holstered / still drawing / gun up
          + 0.5 * (1 - (e.str == null ? 1 : e.str)) + (e.collapsed ? 0.3 : 0) + (e.suppressT > 0 ? 0.15 : 0) + (e.broken ? 0.3 : 0) // weakened: losing the will to fight
          + 0.08 * Math.min(3, e.shouts) + 0.08 * Math.max(0, seen - 1) - (d > 10 ? 0.1 : 0) + (e.flashT > 0 ? 0.35 : 0) // (dazed by a flashbang: in no state to argue)
          - Math.max(0, e.morale - 0.5) * 0.8 - (e.def.hunt && e.drawn ? 0.15 : 0);
        chance = e.def.comply ? G.U.clamp(chance, 0, e.collapsed ? 0.97 : 0.92) : 0; // never a sure thing
        // Braver together: with armed friends around who can see them, almost nobody gives up. And anyone
        // who's already been shooting at you, or who faked a surrender and went back for a weapon, is past
        // being talked down (unless they're breaking or badly weakened). Bleeding out on the floor, friends
        // count for little.
        const weak = e.collapsed ? 1 : G.U.clamp(1 - (e.str == null ? 1 : e.str) / 0.6, 0, 1);
        chance *= G.U.lerp([1, 0.3, 0.08, 0.03][Math.min(3, this.allies(e))], 1, weak * 0.85);
        const shaken = e.broken || e.collapsed || (e.str != null && e.str < 0.5) || e.flashT > 0;
        if (!shaken && (this.clock - (e.firedAt || -99) < 30 || e.emboldened)) chance *= 0.1;
        e.shouts++;
      }
      if (Math.random() < chance) { this.surrender(e); complied++; }
      else if (!e.def.civ) {
        // refuses: snaps out of it, gets the weapon up and fights
        e.morale -= 0.08 * (e.def.steady || 1);
        e.surprisedT = 0;
        this.alertEnemy(e, false);
        e.cool = Math.min(e.cool, e.broken ? 1 : 0.5);
      }
    }
    this.hear(px, pz, 14, py); // anyone else nearby now knows police are inside
    G.Net.broadcast({ t: 'shout', id: from, n: complied });
  },
  // windows broken (by a round or a blast): for everyone, and heard round about
  breakGlass(ids, p) {
    const ws = this.map && this.map.windows;
    if (!ws) return;
    const fresh = ids.filter((id) => Number.isInteger(id) && ws[id] && !ws[id].broken && !ws[id].armor).slice(0, 20); // (bulletproof glass doesn't break)
    if (!fresh.length) return;
    for (const id of fresh) { ws[id].broken = true; G.World.windowSolids(this.map.world, this.map, ws[id]); this.glassBroken.add(id); this.hear(ws[id].x, ws[id].z, 16, ws[id].fy || 0); }
    G.Net.broadcast({ t: 'glass', ids: fresh });
  },
  // A weapon light in their eyes (the player they're shooting at has one on and pointed at them, close enough):
  // they can hardly see to aim. Returns a multiplier on their hit chance.
  dazzle(e, st) {
    if (!st || !(st.tl & 1)) return 1;
    const dx = e.x - st.p[0], dz = e.z - st.p[2], d = Math.hypot(dx, dz);
    if (d < 0.3 || d > (st.tl & 8 ? 22 : 15)) return 1;
    const c = (dx * -Math.sin(st.yw) + dz * -Math.cos(st.yw)) / d;
    return c > 0.97 ? 0.55 : c > 0.93 ? 0.8 : 1;
  },
  // armed suspects still in the fight near this one (within 9 m) who can see them
  allies(e) {
    let n = 0;
    const eh = (e.y || 0) + 1.4 * e.def.scale;
    for (const o of this.enemies.values()) {
      if (o === e || o.def.civ || !o.armed || o.state !== 'normal' || Math.hypot(o.x - e.x, o.z - e.z) > 9) continue;
      if (G.Level.los(this.map, o.x, (o.y || 0) + 1.4 * o.def.scale, o.z, e.x, eh, e.z)) n++;
    }
    return n;
  },
  surrender(e) {
    e.state = 'surrender';
    e.aiming = false; e.cover = null; e.inCover = false; e.peek = false; e.leanOut = 0; e.crouch = false; e.hide = null; e.lurk = false;
    if (!e.def.civ) {
      this.dropEvidence(e);
      e.armed = false; e.drawn = false;
      e.fake = Math.random() < (e.def.fake || 0); e.fakeT = 5 + Math.random() * 8;
    }
  },
  // A suspect's weapon hits the floor (surrendering or dead) and becomes evidence to secure.
  dropEvidence(e) {
    if (e.def.civ || !e.armed || !e.def.wpn) return;
    const a = Math.random() * Math.PI * 2;
    const v = { i: this.evidence.length, wpn: e.def.wpn, x: e.x + Math.cos(a) * 0.5, y: e.y || 0, z: e.z + Math.sin(a) * 0.5, owner: e.id, secured: false, taken: false };
    G.Level.resolve(this.map, v, 0.15, v.y, G.World.STEP);
    v.y = G.Level.groundAt(this.map, v.x, v.z, 0.05, v.y + 0.3, 0.05); // (on the floor where they were: upstairs or down)
    this.evidence.push(v);
    G.Net.broadcast({ t: 'evid', i: v.i, wpn: v.wpn, x: Math.round(v.x * 100) / 100, z: Math.round(v.z * 100) / 100, y: Math.round(v.y * 100) / 100 });
  },
  evidenceValue(wpn) { return 60 + Math.round((G.WEAPONS[wpn] ? G.WEAPONS[wpn].price : 500) * 0.04) + 10 * this.level; },
  // A weapon's worth is split: half for bagging it, half for securing whoever carried it (arrest or body).
  carrierShare(def) { return def && !def.civ && def.wpn ? Math.round(this.evidenceValue(def.wpn) / 2) : 0; },
  secure(i, p, from) {
    const v = this.evidence[i];
    if (!v || v.secured || v.taken || Math.hypot(v.x - p.st.p[0], v.z - p.st.p[2]) > 2.4) return;
    v.secured = true;
    this.report.evidence++;
    // a secured weapon can't be grabbed back by a faking suspect
    const owner = this.enemies.get(v.owner);
    if (owner) owner.fake = false;
    G.Net.broadcast({ t: 'evsec', i, by: from, cr: Math.round(this.evidenceValue(v.wpn) / 2), wpn: v.wpn });
    this.checkClear();
  },
  // at: where the officer saw the body lying, its ragdoll (it can slide or fall a way from where they went down):
  // in reach of that is in reach, if it's within 4 m of where the host has them
  cuff(eid, p, from, at) {
    const e = this.enemies.get(eid);
    const reach = (x, z) => {
      const ok = Array.isArray(at) && Number.isFinite(+at[0]) && Number.isFinite(+at[1]) && Math.hypot(at[0] - x, at[1] - z) < 4;
      return Math.min(Math.hypot(x - p.st.p[0], z - p.st.p[2]), ok ? Math.hypot(at[0] - p.st.p[0], at[1] - p.st.p[2]) : Infinity);
    };
    if (!e) {
      const b = this.bodies.get(eid);
      if (!b || b.secured || reach(b.x, b.z) > 2.6) return;
      b.secured = true;
      this.report.bodies++;
      G.Net.broadcast({ t: 'cuffed', e: eid, by: from, cr: b.civ ? 0 : this.carrierShare(b.def || G.ENEMIES[b.type]), civ: b.civ, ty: b.type, body: true });
      this.checkClear();
      return;
    }
    if (!e || !(e.state === 'surrender' || e.collapsed || (e.def.civ && (e.state === 'cower' || e.state === 'flee')))) return; // (down: no giving up, just cuffed where they lie)
    if ((e.collapsed ? reach(e.x, e.z) : Math.hypot(e.x - p.st.p[0], e.z - p.st.p[2])) > 2.6) return;
    const dn = !!e.collapsed; // (cuffed where they lay, bleeding: a living arrest, but no arrest to show in the highlights)
    e.state = 'cuffed'; e.armed = false; e.fake = false;
    const civ = !!e.def.civ;
    // (a suspect cuffed where they lay is already counted, incapacitated: securing them pays like securing a body)
    const cr = civ ? 200 + 40 * this.level : dn ? this.carrierShare(e.def) : Math.round(e.def.cr * 2.5 * (1 + 0.08 * (this.level - 1))) + this.carrierShare(e.def);
    if (civ) this.report.rescued++; else if (!dn) this.report.arrests++;
    G.Net.broadcast({ t: 'cuffed', e: e.id, by: from, cr, civ, ty: e.type, dn: dn ? 1 : 0 });
    this.checkClear();
  },
  // ---------------------------------------------------------------- suspects' injuries
  // The same wounds as an officer's (js/ballistics.js works out what each round did, on the shooter's machine), kept
  // more simply: bleeding (heavy: a standard person gone in ~50 s; massive, from the heart, aorta or an iliac artery:
  // in ~8 s; light, which clots in half a minute), a broken arm (their aim goes) or leg (they limp), a collapsed lung
  // (both), a gut wound (a slow bleed), a spine (they go down and stay down) or a heart wrecked (they black out).
  // Bleeding drains their health and their nerve, and can kill them (credited to whoever shot them). Restraining
  // someone stops it: you treat them as you cuff them. organs: what was hit, kept for the record (id:% of it gone).
  injure(e, part, effs, side, organs) {
    if (!G.Med.NAME[part]) return;
    const person = e.maxHp * (100 / e.def.hp), E = new Set(effs.split(',').filter(Boolean));
    if (E.has('massive')) e.bleedH = (e.bleedH || 0) + person * 0.12;
    if (E.has('heavy')) e.bleedH = (e.bleedH || 0) + person * 0.02;
    if (E.has('light') || E.has('gut')) { e.bleedL = (e.bleedL || 0) + person * (E.has('gut') ? 0.006 : 0.004); e.clotT = 0; }
    if (E.has('frac')) {
      // which limb (the pelvis: the leg on its side, from the organs), kept for the record (e.broke: the F9 readout)
      const pl = /pelvis([LR])/.exec(organs || ''), limb = part.startsWith('arm') || part.startsWith('leg') ? part : 'leg' + (pl ? pl[1] : side === 'L' ? 'L' : 'R');
      e.broke = e.broke || {};
      if (!e.broke[limb]) { e.broke[limb] = 1; if (limb.startsWith('arm')) e.arms = (e.arms || 0) + 1; else e.legs = (e.legs || 0) + 1; }
    }
    if (E.has('lung')) e.lung = true;
    if (E.has('spine')) e.spine = true;
    if (E.has('out')) e.out = true;
    if (E.has('cardiac')) { e.cardiac = true; e.bleedH = (e.bleedH || 0) + person * 0.35; } // (a wrecked heart: gone in a second or two)
    if (organs) { e.organs = e.organs || {}; for (const o of organs.split(',')) { const [id, pct] = o.split(':'); if (id) e.organs[id] = Math.max(e.organs[id] || 0, +pct || 0); } }
  },
  // Would they have given up, told to now (roughly the odds a shout has: js/server.js shout)? For the highlights.
  wouldYield(e) {
    if (!e.def.comply || e.state === 'cuffed') return false;
    const unaware = !e.alert || (e.surprisedT || 0) > 0;
    let c = e.def.comply + (unaware ? 0.4 : 0) + (!e.drawn ? 0.3 : -0.15) + 0.5 * (1 - (e.str == null ? 1 : e.str)) + (e.collapsed ? 0.3 : 0) + (e.broken ? 0.3 : 0) - Math.max(0, (e.morale || 0) - 0.5) * 0.8;
    c *= [1, 0.3, 0.08, 0.03][Math.min(3, this.allies ? this.allies(e) : 0)];
    return c >= 0.55;
  },
  // bleeding, every tick; true when it killed them. (BLEED_K: everyone bleeds at this share of the wounds' rates, as
  // officers do: js/medical.js)
  BLEED_K: 0.5,
  injuryTick(e, dt) {
    if (e.state === 'cuffed') { e.bleedH = e.bleedL = 0; return false; }
    if (e.bleedL) { e.clotT = (e.clotT || 0) + dt; if (e.clotT > 30) { e.bleedL = 0; e.clotT = 0; } }
    const b = ((e.bleedH || 0) + (e.bleedL || 0)) * this.BLEED_K;
    if (!b) return false;
    e.hp -= b * dt;
    if (!e.def.civ && e.morale != null) e.morale = Math.max(0, e.morale - dt * 0.6 * b / e.maxHp); // weakening: closer to giving up
    if (e.hp <= 0) { e.hp = 0.01; this.applyHit({ e: e.id, d: 1, bo: 1 }, e.lastHit); return true; }
    return false;
  },
  // what wounds leave of their pace and aim
  injSpeed(e) { return (e.legs ? (e.legs > 1 ? 0.45 : 0.65) : 1) * (e.lung ? 0.85 : 1); },
  injAim(e) { return (e.arms ? (e.arms > 1 ? 0.45 : 0.7) : 1) * (e.lung ? 0.8 : 1) * (0.6 + 0.4 * (e.str == null ? 1 : e.str)); },
  // Strength (0..1): what blood loss (their health) and broken legs leave them to hold themselves up with. Full
  // above 70% health, falling steadily to nothing at 15%. Weak, they slow and stagger (their body is physically
  // simulated on every screen, held up by muscles this strong: js/rig.js). Below TWO_HAND they can't get the
  // other hand on the gun any more (it props them up instead) and shoot one-handed; below COLLAPSE (about 31%
  // health) their legs give out and they go down, still alive, until they bleed out. The weaker they are, the
  // more readily they give up.
  COLLAPSE: 0.3, TWO_HAND: 0.4,
  // A shot kicks the gun off target (degrees of muzzle rise: the weapon's recoil, worse one-handed and weak),
  // and the arms bring it back, faster with two hands and strength. They fire again once it's back on.
  kickOf(e, w) { const s = e.str == null ? 1 : e.str; return w.recoil * 3 * (s < this.TWO_HAND ? 1.6 : 1) * (1 + 0.6 * (1 - s)); },
  kickBack(e) { const s = e.str == null ? 1 : e.str; return (s >= this.TWO_HAND ? 7 : 4) * (0.4 + 0.6 * G.U.clamp(s / 0.6, 0, 1)); },
  // Is their gun on the target? Facing it, with the kick of the last shot settled (what sags off it from
  // weakness is allowed for: they can't do better). On the host's own screen the suspect's body is simulated
  // (js/rig.js powerStep), so where that gun's bore actually points has to agree too. Kept waiting too long,
  // they snap a shot off anyway.
  onTarget(e, st, dt) {
    const tx = st.p[0], ty = st.p[1] + (st.pr ? 0.25 : st.cr ? 0.75 : 1.2), tz = st.p[2], s = e.str == null ? 1 : e.str;
    const sag = (1 - G.U.clamp(s / 0.6, 0, 1)) * 45;
    let on = Math.abs(G.U.angDiff(e.yaw, Math.atan2(-(tx - e.x), -(tz - e.z)))) < 0.16 && (e.kick || 0) < 2.5;
    const ev = on && G.Views && G.Views.enemies && G.Views.enemies.get(e.id), rig = ev && ev.rig, gi = rig && rig.gunInfo;
    if (rig && rig.rd && rig.gun && gi && !rig.slung && gi.muzzles && gi.muzzles[0]) {
      const m = rig.gun.localToWorld(new THREE.Vector3(gi.muzzles[0][2], gi.muzzles[0][1], -gi.muzzles[0][0]));
      const bore = new THREE.Vector3(0, 0, -1).transformDirection(rig.gun.matrixWorld), to = new THREE.Vector3(tx - m.x, ty - m.y, tz - m.z).normalize();
      on = Math.acos(G.U.clamp(bore.dot(to), -1, 1)) * 180 / Math.PI < 6 + sag * 1.1;
    }
    e.onWait = on ? 0 : (e.onWait || 0) + (dt || 0);
    return on || e.onWait > 0.8;
  },
  strength(e) {
    const f = e.hp / e.maxHp;
    return G.U.clamp((f - 0.15) / 0.55, 0, 1) * (e.legs ? (e.legs > 1 ? 0.6 : 0.85) : 1);
  },

  // ---------------------------------------------------------------- suspects' reloads
  // Each carries its gun's magazine. Empty, they reload (the gun's reload time; pump and lever guns shell by
  // shell, firing again from a part-loaded tube when they have to); with nobody in sight and the magazine
  // half spent, they top up. They duck while they do it if they're in cover, and it can be heard.
  startReload(e) {
    const w = G.WEAPONS[e.def.wpn];
    if (!w || e.reloadT > 0) return;
    e.reloadT = w.shell ? w.reload : w.reload * (1 + Math.random() * 0.3);
    G.Net.broadcast({ t: 'ereload', e: e.id, n: w.shell ? Math.min(8, e.magMax - e.mag) : 0, dur: Math.round(e.reloadT * 100) / 100 });
  },
  reloadTick(e, dt) {
    const w = G.WEAPONS[e.def.wpn];
    if (!w || !e.magMax) return;
    if (e.reloadT > 0) {
      e.reloadT -= dt;
      if (e.reloadT <= 0) {
        e.reloadT = 0;
        if (w.shell) { e.mag++; if (e.mag < e.magMax && !(e.canSee && e.mag >= 2)) e.reloadT = w.reload; }
        else e.mag = e.magMax;
      }
    } else if (e.alert && !e.canSee && e.mag < e.magMax * 0.5) this.startReload(e);
  },
  applyHit(m, from) {
    if (this.phase !== 'level') return;
    const e = this.enemies.get(m.e);
    if (!e) return;
    // the wounds, for injuries: the part, what the round did there (js/ballistics.js effects), the side, the organs
    if (Array.isArray(m.w)) for (const w of m.w.slice(0, 12)) if (Array.isArray(w)) this.injure(e, String(w[0]), String(w[1] || ''), w[2], String(w[3] || ''));
    // wounds are a share of a standard person's life (tougher types have proportionally more), so lethality
    // doesn't fall as health scales up with the level and the squad; an unarmoured headshot kills outright
    const person = e.maxHp * (100 / e.def.hp);
    const d = m.k ? e.hp + 1 : Math.min(5000, (+m.d || 0) + Math.min(5, Math.max(0, +m.f || 0)) * person);
    if (!(d > 0)) return;
    e.hp -= d;
    if (!m.bo) { e.lastHit = from; e.lastHitAt = this.clock || 0; e.lastH = !!m.h; e.lastAp = !!m.ap; e.hitState = e.state; e.hitUnaware = !e.alert || (e.surprisedT || 0) > 0; e.hitYield = this.wouldYield(e); } // bleeding out is judged by what they were doing when shot
    // Shock: being hit wrecks your aim for a moment (most of it, for a hard hit), throws off the shot you were
    // about to take, and starts your aim over from the body. It fades over a couple of seconds.
    if (!m.bo) {
      e.shock = Math.min(1.5, (e.shock || 0) + 0.5 + 0.7 * Math.min(1, d / person));
      e.sup = Math.min(1, (e.sup || 0) + 0.3);
      e.engAt = this.clock; e.headDelay = 0.3 + Math.random() * 0.2;
      e.cool = Math.max(e.cool || 0, 0.25 + Math.random() * 0.35);
    }
    e.hitAt = this.clock;
    if (!e.def.civ) e.morale -= (0.2 + 0.6 * Math.min(1, d / e.maxHp)) * (e.def.steady || 1);
    if (e.def.civ) this.panic(e);
    else if (e.state === 'normal') this.alertEnemy(e, true);
    if (e.def.boss) {
      const frac = e.hp / e.maxHp;
      if ((this.summons === 0 && frac < 0.66) || (this.summons === 1 && frac < 0.33)) {
        this.summons++;
        for (let i = 0; i < 3 + this.players.size; i++) {
          const a = Math.random() * Math.PI * 2;
          const n = this.addEnemy('grunt', e.x + Math.cos(a) * 2.5, e.z + Math.sin(a) * 2.5, 1 + 0.1 * this.level, e.y || 0);
          this.settle(n, 0.4);
          this.alertEnemy(n, false);
        }
        G.Net.broadcast({ t: 'chat', id: null, m: 'The Kingpin is calling for backup!' });
      }
    }
    if (e.hp <= 0) {
      this.dropEvidence(e);
      this.enemies.delete(e.id);
      this.bodies.set(e.id, { id: e.id, type: e.type, def: e.def, x: e.x, y: e.y || 0, z: e.z, yaw: e.yaw, civ: !!e.def.civ, secured: false, rec: e }); // (rec: their record as they died: every wound, for the F9 readout, js/hud.js)
      // watching a friend go down rattles everyone nearby
      for (const o of this.enemies.values()) if (!o.def.civ && o.state === 'normal' && Math.hypot(o.x - e.x, o.z - e.z) < 15) o.morale -= 0.2 * (o.def.steady || 1);
      let cr = 0, why = null;
      const inc = !e.def.civ && !!e.incap; // (counted already: incapacitated when they went down)
      if (e.def.civ) { cr = -(400 + 50 * this.level); why = 'civ'; this.report.civKilled++; }
      else if (inc) { if (m.bo) { this.report.bleedouts++; const by = e.incap.by; if (by) this.report.bleedBy[by] = (this.report.bleedBy[by] || 0) + 1; } } // (bled out: kept, by who put them down)
      else ({ cr, why } = this.incapacitate(e, from, m.bo ? e.hitState || e.state : e.state));
      // and what makes it one for the highlights (js/highlights.js): taken by surprise, would have given up if told to,
      // just after the killer kicked a door in, how far, what the rounds did inside
      const kp = from && this.players.get(from), kpos = kp && kp.st && kp.st.p;
      const hl = { sur: e.hitUnaware && !e.def.civ ? 1 : 0, ws: e.hitYield && !e.def.civ ? 1 : 0, br: from && this.kickAt && this.clock - (this.kickAt[from] == null ? -99 : this.kickAt[from]) < 5 ? 1 : 0,
        d: kpos ? Math.round(Math.hypot(kpos[0] - e.x, kpos[2] - e.z)) : 0, o: e.organs || undefined,
        // (bled out: not this round but the wounds, bt seconds after the last one. Within 3 s of it, or through the
        // heart, it's the round that killed them: a shot kill, hd seconds before they died)
        ...(() => {
          const since = m.bo && e.lastHitAt != null ? (this.clock || 0) - e.lastHitAt : null, shot = since != null && (e.cardiac || since < 3);
          return { bo: m.bo && !shot ? 1 : 0, bt: m.bo && !shot && since != null ? Math.round(since) : 0, hd: shot ? Math.round(since * 100) / 100 : 0 };
        })() };
      if (e.lastAp && !hl.bo) hl.ap = 1; // (the round that did it went through their armour)
      G.Net.broadcast(Object.assign({ t: 'kill', e: e.id, by: from, cr, h: !!m.h, ty: e.type, why, inc: inc ? 1 : 0 }, hl));
      this.checkClear();
    }
  },

  // A suspect incapacitated: down for good, or dead outright, whichever comes first. It's counted once, then and
  // there, the same as a kill: the officer's credit and tally, and whether it was authorised (st: what they were
  // doing when shot). Lethal force pays least. If they bleed out afterwards, that's kept (report.bleedouts, and
  // bleedBy: by the officer who put them down), not counted again.
  incapacitate(e, by, st) {
    e.incap = { by: by || null, t: this.clock || 0 };
    if (st !== 'normal') { this.report.unauth++; return { cr: -Math.round(e.def.cr * 2), why: 'unauth' }; }
    this.report.incap++;
    return { cr: Math.round(e.def.cr * 0.25 * (1 + 0.08 * (this.level - 1))), why: null };
  },
  // A suspect down for good: incapacitated, counted now (incapacitate), told to everyone
  incapMsg(e) {
    if (e.def.civ || e.incap) return; // (a civilian down still needs rescuing)
    const { cr, why } = this.incapacitate(e, e.lastHit, e.hitState || e.state);
    G.Net.broadcast({ t: 'incap', e: e.id, by: e.lastHit || null, cr, h: !!e.lastH, ty: e.type, why, sur: e.hitUnaware ? 1 : 0 });
  },
  // A suspect down for good, for the highlights (js/highlights.js suspectDown): incapacitated, their clip. The round
  // that put them down, with what a kill of it would carry; or, more than 4 s after a round last hit them, a bleed-out
  // (bo: down from the blood loss, bt seconds after the last round: no round to show). None for a civilian.
  downMsg(e) {
    const from = e.lastHit, since = e.lastHitAt != null ? (this.clock || 0) - e.lastHitAt : null;
    if (!from || e.def.civ) return;
    const bo = since == null || since > 4;
    const kp = this.players.get(from), kpos = kp && kp.st && kp.st.p, kick = this.kickAt && this.kickAt[from];
    G.Net.broadcast({ t: 'edown', e: e.id, by: from, h: !!e.lastH, ty: e.type, why: (e.hitState || e.state) !== 'normal' ? 'unauth' : null,
      sur: e.hitUnaware ? 1 : 0, ws: e.hitYield ? 1 : 0, br: kick != null && e.lastHitAt - kick < 5 ? 1 : 0,
      d: kpos ? Math.round(Math.hypot(kpos[0] - e.x, kpos[2] - e.z)) : 0, o: e.organs || undefined, hd: bo ? 0 : Math.round(since * 100) / 100, bo: bo ? 1 : 0, bt: bo && since != null ? Math.round(since) : 0,
      ap: e.lastAp && !bo ? 1 : undefined });
  },

  // Apartments cleared: an officer has been inside, and no suspect in it is still a threat (armed and free).
  unitsCleared() {
    const ua = this.map && this.map.unitAt;
    if (!ua) return 0;
    const L = G.Level, TS = L.TS, W = this.map.W, at = (x, y, z) => { const a = L.floorMap(this.map, L.floorAt(this.map, x, y, z)).unitAt; return a ? a[Math.floor(z / TS) * W + Math.floor(x / TS)] : -1; };
    for (const p of this.players.values()) if (p.st && !p.st.dd) { const u = at(p.st.p[0], p.st.p[1], p.st.p[2]); if (u >= 0) this.unitsSeen.add(u); }
    const hot = new Set();
    for (const e of this.enemies.values()) if (!e.def.civ && e.state !== 'cuffed' && e.state !== 'surrender' && !e.down) { const u = at(e.x, e.y || 0, e.z); if (u >= 0) hot.add(u); }
    let n = 0;
    for (const u of this.unitsSeen) if (!hot.has(u)) n++;
    return n;
  },
  update(dt) {
    if (this.phase === 'shop') return this.updateHub(dt);
    if (this.phase !== 'level' || !this.map) return;
    this.clock = (this.clock || 0) + dt;
    const map = this.map, L = G.Level;
    const all = [...this.players.values()].filter((p) => p.st);
    const alive = all.filter((p) => !p.st.dn && !p.st.dd);

    this.flowT -= dt;
    if (this.flowT <= 0) {
      this.flowT = 0.5;
      this.flow = alive.length ? L.flow(map, alive.map((p) => L.src(map, p.st.p[0], p.st.p[1], p.st.p[2]))) : null;
    }

    this.nadeT -= dt;
    this.noiseT = (this.noiseT || 0) - dt;
    if (this.noiseT <= 0) { this.noiseT = 0.25; this.footsteps(alive); }
    for (const e of this.enemies.values()) this.think(e, dt, alive);

    // keep enemies from stacking
    const es = [...this.enemies.values()];
    for (let i = 0; i < es.length; i++) for (let j = i + 1; j < es.length; j++) {
      const a = es[i], b = es[j], dx = b.x - a.x, dz = b.z - a.z, d = Math.hypot(dx, dz), min = 0.45 * (a.def.scale + b.def.scale);
      if (d < min && d > 1e-4 && Math.abs((a.y || 0) - (b.y || 0)) < 1.5) { // (one upstairs and one down don't get in each other's way)
        const push = (min - d) / 2;
        a.x -= (dx / d) * push; a.z -= (dz / d) * push; b.x += (dx / d) * push; b.z += (dz / d) * push;
      }
    }

    // the vote to leave: everyone still alive (downed officers vote too)
    const living = all.filter((p) => !p.st.dd);
    for (const id of [...this.extract.votes]) if (!living.some((p) => p.id === id)) this.extract.votes.delete(id);
    if (this.extract.active && living.length && living.every((p) => this.extract.votes.has(p.id))) {
      this.report.allRescued = this.allRescued();
      this.overBlack(() => this.toShop());
      return;
    }

    // squad wipe
    if (all.length && alive.length === 0) {
      this.wipeT += dt;
      if (this.wipeT > 5) { this.gameOver(); return; }
    } else this.wipeT = 0;

    this.snapT -= dt;
    if (this.snapT <= 0) {
      this.snapT = 0.05;
      const r2 = (v) => Math.round(v * 100) / 100;
      const e = [];
      for (const en of this.enemies.values()) {
        e.push([en.id, en.type, r2(en.x), r2(en.z), r2(en.yaw), Math.max(1, Math.round((en.hp / en.maxHp) * 100)), en.aiming ? en.tgt : 0, en.alert ? 1 : 0, en.crouch ? 1 : 0, en.leanOut || 0, en.armed ? (en.drawn ? 2 : 1) : 0, STATE_CODE[en.state] || 0, en.surprisedT > 0 ? 1 : 0, en.doorWait > 0 ? 1 : 0, en.def.civ ? 0 : `${en.def.wpn}|${en.def.vest}|${en.def.helmet}|${en.def.face || ''}|${en.def.tac || 0}|${(en.def.ex || []).join(',')}`, ((en.bleedH || en.bleedL) ? 1 : 0) | (en.legs ? 2 : 0) | (en.reloadT > 0 ? 4 : 0) | (en.down ? 8 : 0), Math.round(Math.min(en.down ? 0.25 : 1, en.str == null ? 1 : en.str) * 100), r2(en.y || 0)]);
      }
      const p = {};
      for (const pl of all) p[pl.id] = pl.st;
      G.Net.broadcast({ t: 'snap', e, p, x: [this.extract.active ? 1 : 0, this.extract.votes.size, all.filter((q) => !q.st.dd).length, this.report.civKilled || 0, all.filter((q) => this.extract.votes.has(q.id)).map((q) => q.id), this.unitsCleared()], n: this.remaining(false), c: this.remaining(true), b: this.openBodies(), w: this.openEvidence() });
    }
  },

  // The hangar: no enemies, nothing to win; where everyone is, as the squad sees it, and the helicopter leaving once
  // everyone's in it.
  updateHub(dt) {
    this.snapT -= dt;
    if (this.snapT <= 0) {
      this.snapT = 0.05;
      const p = {};
      for (const pl of this.players.values()) if (pl.st) p[pl.id] = pl.st;
      G.Net.broadcast({ t: 'snap', e: [], p, x: [0, 0, this.players.size, 0, [], 0], n: 0, c: 0, b: 0, w: 0 });
    }
    if (this.liftT != null && (this.liftT -= dt) <= 0) { this.liftT = null; this.checkReady(true); }
  },

  think(e, dt, alive) {
    const def = e.def, map = this.map, L = G.Level, U = G.U, s = def.scale;
    if (e.flashT > 0) e.flashT -= dt;
    e.complyCd = Math.max(0, e.complyCd - dt);
    e.suppressT = Math.max(0, e.suppressT - dt);
    e.flinchT = Math.max(0, (e.flinchT || 0) - dt);
    e.sup = Math.max(0, (e.sup || 0) - dt * 0.3); e.shock = Math.max(0, (e.shock || 0) - dt * 0.35); // (rattled, and getting over it)
    if (e.kick) e.kick *= Math.exp(-this.kickBack(e) * dt); // bringing the gun back down
    if (this.injuryTick(e, dt)) return; // bled out
    e.str = this.strength(e);
    // Down (too weak to stand, a spine, a heart that's stopped): down for good. From there it's only bleeding out (or
    // being cuffed: it stops it): no more aiming, shooting, turning, moving or giving up.
    if ((e.str < this.COLLAPSE || e.spine || e.out) && e.state !== 'cuffed' && !e.down) { e.down = true; this.dropEvidence(e); e.armed = false; e.drawn = false; this.downMsg(e); this.incapMsg(e); this.checkClear(); } // (the gun falls from their hand)
    e.collapsed = !!e.down && e.state !== 'cuffed';
    if (e.collapsed) { e.aiming = false; e.leanOut = 0; e.cover = null; e.crouch = false; return; }
    if (this.obedient(e) && this.obey(e, dt)) return;
    if (def.civ) return this.thinkCiv(e, dt);
    if (e.state === 'cuffed') return;
    if (e.state === 'surrender') return this.thinkSurrendered(e, dt, alive);
    this.reloadTick(e, dt);
    if (e.pendingAlert >= 0) { e.pendingAlert -= dt; if (e.pendingAlert < 0) this.alertEnemy(e, false, true); }
    if (e.supQ && e.supQ.length) e.supQ = e.supQ.filter((q) => { if (q[0] > this.clock) return true; if (e.state === 'normal') this.nearMiss(e, q[1]); return false; });
    if (e.suppressT > 0 && !e.cover) e.coverT = Math.min(e.coverT, 0); // get behind something
    // nerve recovers slowly while nobody is shooting at them, and drains while they're pinned
    if (e.suppressT > 0) e.morale -= dt * 0.04 * (def.steady || 1); else e.morale = Math.min(def.morale, e.morale + dt * 0.01);
    e.morale = Math.max(0, e.morale);
    // In an active gunfight nobody breaks off: fear keeps building, but they only crack once the fight
    // lulls. Engaged = saw the target in the last 4 s (ducking into cover between shots still counts)
    // and traded fire in the last 3 s.
    const now = this.clock, lastAction = Math.max(e.firedAt || -99, e.hitAt || -99, e.supAt || -99);
    if (e.canSee) e.sawAt = now;
    if (now - (e.sawAt || -99) < 4 && now - lastAction < 3) e.engagedAt = now;
    const engaged = now - (e.engagedAt || -99) < 1.5;
    // (friends around hold them together: each one nearby lowers the point where they break)
    if ((e.allyT = (e.allyT || 0) - dt) <= 0) { e.allyT = 1; e.allyN = this.allies(e); }
    if (!e.broken && !engaged && e.alert && e.morale < 0.3 - 0.08 * Math.min(3, e.allyN || 0) && !def.boss) {
      e.broken = true; e.fleeT = 3 + Math.random() * 3;
      e.cover = null; e.inCover = false; e.peek = false; e.leanOut = 0; e.aiming = false;
    }

    // --- perception (throttled)
    e.percT -= dt;
    if (e.percT <= 0) {
      e.percT = 0.12 + Math.random() * 0.1;
      let best = null, bs = 1e9, bvis = false, bd = 99;
      e.proof = false;
      if (e.flashT > 0) alive = []; // (blinded by a flashbang: sees nobody)
      const ey = (e.y || 0) + Math.min(1.6 * s, 2.4);
      for (const p of alive) {
        const [px, py, pz] = p.st.p;
        const d = Math.hypot(px - e.x, pz - e.z);
        // (outdoors at night they can't pick you out past `night` metres, unless your light or laser gives you away)
        if (d > (map.theme.night && !(p.st.tl & 3) ? map.theme.night : 75)) continue;
        const lx = e.cover && e.cover.lean ? e.cover.px : e.x, lz = e.cover && e.cover.lean ? e.cover.pz : e.z;
        const [hx, hz] = this.headXZ(p.st);
        const hy = py + (p.st.pr ? 0.35 : p.st.cr ? 0.95 : 1.5), k = L.see(map, lx, ey, lz, hx, hy, hz);
        // (through a window: k < 1; through bulletproof glass, seen but not to be shot: no round gets through it)
        let proof = false;
        if (k > 0 && k < 1) { const dx = hx - lx, dy = hy - ey, dz = hz - lz, dd = Math.hypot(dx, dy, dz) || 1; proof = L.raycast(map, lx, ey, lz, dx / dd, dy / dd, dz / dd, dd, { glass: true }).t < dd - 0.1; }
        const vis = k > 0 && !proof, score = d + (vis ? 0 : proof ? 30 : 40) + (k < 1 && vis ? 8 : 0);
        if (score < bs) { bs = score; best = p; bvis = vis; bd = d; e.seeK = k; e.proof = proof; }
      }
      e.tgt = best ? best.id : null; e.canSee = bvis; e.tgtD = bd;
      // seen behind bulletproof glass: they know where you are (and that shooting's no use): they come round for you
      if (best && e.proof) { e.alert = true; e.lostT = G.U.clamp(e.lostT || 0, 0.01, 1); e.blind = false; e.lastSeen = { x: best.st.p[0], y: best.st.p[1], z: best.st.p[2] }; }
    }
    const p = e.tgt ? this.players.get(e.tgt) : null;
    const st = p && p.st && !p.st.dn && !p.st.dd ? p.st : null;
    if (!st) { e.canSee = false; e.aiming = false; }

    if (e.broken) return this.thinkBroken(e, dt, p, st);

    // --- unaware: idle and try to spot
    if (!e.alert) {
      if (st && e.canSee) {
        const toYaw = Math.atan2(-(st.p[0] - e.x), -(st.p[2] - e.z));
        const inFov = Math.abs(U.angDiff(e.yaw, toYaw)) < 1.2 || e.tgtD < 5;
        if (inFov && e.tgtD < def.range * 1.4) {
          const rate = (1.7 - e.tgtD / (def.range * 1.4)) * (st.pr ? 0.5 : st.cr ? 0.7 : 1) * 1.3 * (e.suspicious ? 1.8 : 1) * (e.seeK == null ? 1 : e.seeK); // slower through glass
          e.spot += dt * rate;
          if (e.spot >= 1) {
            // caught off guard: police appear close by while they weren't expecting anyone
            const surprised = !e.suspicious && e.tgtD < 10;
            this.alertEnemy(e, true);
            if (surprised) e.surprisedT = 1.5 + Math.random() * 0.8;
          }
        }
      } else e.spot = Math.max(0, e.spot - dt * 0.3);
      if (e.suspicious) {
        // weapon out, watching where the noise came from; settles back down if nothing else happens
        if (e.noise) e.idleYaw = Math.atan2(-(e.noise.x - e.x), -(e.noise.z - e.z));
        e.calmT -= dt;
        if (e.calmT <= 0) { e.suspicious = false; e.noise = null; if (!def.ready) e.drawn = false; }
      } else {
        // pottering about like anyone else in the building
        e.idleT -= dt;
        if (e.idleT <= 0) {
          e.idleT = 2 + Math.random() * 4; e.idleYaw = this.openYaw(e, e.yaw + (Math.random() - 0.5) * 2.6, 2.6);
          e.walkTo = Math.random() < 0.45 ? this.amble(e) : null;
        }
        if (e.walkTo) {
          const dx = e.walkTo.x - e.x, dz = e.walkTo.z - e.z, d = Math.hypot(dx, dz);
          if (d < 0.3) e.walkTo = null;
          else { e.idleYaw = Math.atan2(-dx, -dz); this.moveEntity(e, dx / d, dz / d, Math.min(1.4, def.speed * 0.5), dt); }
        }
      }
      e.yaw += U.angDiff(e.yaw, e.idleYaw) * Math.min(1, dt * (e.suspicious ? 4 : e.walkTo ? 5 : 2));
      return;
    }

    // --- surprised: frozen for a moment, staring at the police, weapon not yet up
    e.drawT = Math.max(0, e.drawT - dt);
    if (e.surprisedT > 0) {
      e.surprisedT -= dt;
      e.cool -= dt; // the initial hesitation runs out during the freeze, not after it
      if (st) e.yaw += U.angDiff(e.yaw, Math.atan2(-(st.p[0] - e.x), -(st.p[2] - e.z))) * Math.min(1, dt * 3);
      e.crouch = e.flinchT > 0; e.aiming = false;
      return;
    }

    // --- alert: fight or hunt
    let mx = 0, mz = 0, sp = 1;
    const towards = (tx, tz) => { const dx = tx - e.x, dz = tz - e.z, d = Math.hypot(dx, dz) || 1; mx = dx / d; mz = dz / d; };
    const huntStep = () => {
      if (!this.flow) return;
      const step = L.flowStep(map, this.flow, e.x, e.z, e.y);
      if (step) towards(step.x, step.z);
      else if (st) towards(st.p[0], st.p[2]);
    };
    e.coverT -= dt;
    e.nadeT -= dt;
    const usesCover = !def.boss && e.type !== 'rusher';
    // lurking: heard the police but hasn't seen them, so it hides and peeks like anyone else would, gun still
    // away. The moment it sees an officer it draws.
    if (e.lurk) {
      if (st && e.canSee) { e.lurk = false; e.hide = null; e.leanOut = 0; this.draw(e); }
      else {
        if (!e.hide) { e.threat = e.noise || this.nearestOfficer(e); if (!this.seekHide(e)) { e.lurk = false; this.draw(e); } }
        if (e.lurk) {
          if (e.relocate) { e.relocate = false; this.seekHide(e); }
          if (e.hide && this.hideStep(e, dt, def.speed * 1.1)) return;
          e.lurk = false; this.draw(e);
        }
      }
    }

    if (st && e.canSee) {
      e.lostT = 0;
      e.lastSeen = { x: st.p[0], y: st.p[1], z: st.p[2] };
      const dx = st.p[0] - e.x, dz = st.p[2] - e.z, d = Math.hypot(dx, dz) || 1;
      const toYaw = Math.atan2(-dx, -dz);
      e.yaw += U.angDiff(e.yaw, toYaw) * Math.min(1, dt * 8);

      // Cover: move to a spot with a crate between us and the target, crouch, pop up to shoot.
      if (usesCover && !e.cover && e.coverT <= 0) {
        e.coverT = 3 + Math.random() * 3;
        e.cover = this.findCover(e, st);
        e.coverStuck = 0;
        // path there on a flow field seeded at the cover tile (routes through doorways)
        if (e.cover) e.coverFlow = L.flow(map, [L.src(map, e.cover.x, e.cover.y, e.cover.z)]);
      }
      if (e.cover) {
        const cd = Math.hypot(e.cover.x - e.x, e.cover.z - e.z);
        if (cd > 0.25) {
          const step = cd > 1.6 && e.coverFlow ? L.flowStep(map, e.coverFlow, e.x, e.z, e.y) : null;
          if (step) towards(step.x, step.z); else towards(e.cover.x, e.cover.z);
          e.inCover = false; e.peek = false;
          e.coverStuck += dt;
          if (e.coverStuck > 6) { e.cover = null; e.coverT = 2; }
        } else {
          e.inCover = true;
          e.coverCheckT = (e.coverCheckT || 0) - dt;
          if (e.coverCheckT <= 0) {
            e.coverCheckT = 0.3;
            if (!this.coverValid(e.cover, st, def)) { e.cover = null; e.inCover = false; e.peek = false; e.leanOut = 0; e.coverT = 0.5; }
          }
        }
      } else if (d > def.pref * 1.25 && this.brave(e) && !(e.guard && Math.hypot(e.x - map.extract.x, e.z - map.extract.z) > 6)) { huntStep(); sp = 0.8; }
      else if (d > def.pref * 1.25) { mx = 0; mz = 0; } // hold the position and shoot from where they are
      else if (d < def.pref * 0.6 && e.type !== 'rusher') { mx = -dx / d; mz = -dz / d; sp = 0.6; }
      else {
        e.strafeT -= dt;
        if (e.strafeT <= 0) { e.strafeT = 0.7 + Math.random() * 1.6; e.strafe = [-1, 0, 1][Math.floor(Math.random() * 3)]; }
        mx = (-dz / d) * e.strafe; mz = (dx / d) * e.strafe; sp = 0.5;
      }

      // shooting: from cover, stand up first (a short window where the head is exposed)
      if (d < def.range && e.drawT <= 0 && !e.flinchT) {
        e.cool -= dt;
        const ready = def.aimTime ? e.aiming || e.cool <= 0 : e.cool <= 0;
        if (e.inCover && ready && !e.peek) { e.peek = true; e.peekT = this.PEEK.UP; e.peekOut = this.PEEK.MIN; e.peekDone = false; }
        if (e.peek && e.peekT > 0) e.peekT -= dt;
        const canFire = !e.inCover || (e.peek && e.peekT <= 0);
        if (canFire) {
          if (def.aimTime) {
            if (!e.aiming && e.cool <= 0) { e.aiming = true; e.aimT = def.aimTime; }
            if (e.aiming) {
              sp = 0;
              e.aimT -= dt;
              if (e.aimT <= 0 && this.onTarget(e, st, dt)) { this.fire(e, p); e.aiming = false; e.peekDone = true; e.cool = U.rf(def.pause[0], def.pause[1]); }
            }
          } else if (e.cool <= 0 && this.onTarget(e, st, dt)) {
            if (e.burstLeft <= 0) e.burstLeft = def.burst[0] + Math.floor(Math.random() * (def.burst[1] - def.burst[0] + 1));
            this.fire(e, p);
            e.burstLeft--;
            if (e.burstLeft > 0) e.cool = def.rof;
            else { e.cool = U.rf(def.pause[0], def.pause[1]); e.peekDone = true; }
          }
        }
      }
      // flush a target that's ducked behind cover we can't shoot through
      if (st.cr && d > 5 && d < 20 && !L.los(map, e.x, (e.y || 0) + 1.35 * s, e.z, st.p[0], st.p[1] + 0.75, st.p[2])) this.tryNade(e, st.p[0], st.p[2]);
    } else {
      e.aiming = false; e.peekDone = true; e.leanOut = 0;
      // just lost sight of them (round a door, behind its leaf): about half keep firing for a moment at where
      // they were, blind. Rounds rarely land, and only if you're still there and in the open.
      if (e.lostT === 0) e.blind = !def.aimTime && Math.random() < 0.5;
      e.lostT += dt;
      if (e.blind && !e.flinchT && st && e.drawn && e.lastSeen && e.lostT < 1.1 && e.tgtD < def.range) {
        e.cool -= dt;
        if (e.cool <= 0) { this.fire(e, p, true); e.cool = U.rf(0.15, 0.4); }
      } else e.cool = Math.max(e.cool, 0.6);
      // lost sight: lob a grenade where they were last seen
      if (e.lastSeen && e.lostT > 2 && e.lostT < 12 && !e.proof) { // (not at someone behind bulletproof glass: it'd come back at them)
        const ld = Math.hypot(e.lastSeen.x - e.x, e.lastSeen.z - e.z);
        if (ld > 5 && ld < 20) this.tryNade(e, e.lastSeen.x, e.lastSeen.z);
      }
      const leash = Math.hypot(e.x - e.home.x, e.z - e.home.z) < 12;
      if (this.brave(e) && e.lastSeen && e.lostT < 12 && leash && Math.hypot(e.lastSeen.x - e.x, e.lastSeen.z - e.z) > 2) {
        e.cover = null; e.inCover = false; e.holding = false;
        huntStep(); sp = 0.6; // advance cautiously toward where police were last seen
      } else {
        // dig in: stay put (in cover if they have it), crouched, watching the way the threat came from
        e.holding = true;
        const look = e.lastSeen || e.noise;
        if (look) e.yaw += U.angDiff(e.yaw, Math.atan2(-(look.x - e.x), -(look.z - e.z))) * Math.min(1, dt * 3);
      }
      if (mx || mz) e.yaw += U.angDiff(e.yaw, Math.atan2(-mx, -mz)) * Math.min(1, dt * 6);
    }
    if (e.peek) { e.peekOut -= dt; if (e.peekDone && e.peekOut <= 0) e.peek = false; }
    const corner = e.cover && e.cover.lean;
    if (st && e.canSee) e.holding = false;
    e.crouch = e.flinchT > 0 || (e.inCover && !e.peek && !corner) || (e.holding && !mx && !mz && !e.inCover) || (e.reloadT > 0 && e.inCover && !corner);
    e.leanOut = e.inCover && e.peek && corner ? e.cover.lean : 0;

    if ((mx || mz) && !e.flinchT) this.moveEntity(e, mx, mz, def.speed * sp, dt);
  },

  // where a player's head actually is: leaning (Q/E) moves it sideways off their feet position
  headXZ(st) {
    const ln = st.ln || 0, yw = st.yw || 0;
    return [st.p[0] + Math.cos(yw) * ln * 0.38, st.p[2] - Math.sin(yw) * ln * 0.38];
  },
  brave(e) { return !!e.def.hunt && e.morale > 0.6; },

  // Broken: run from the police, then hide. Panicked, inaccurate shots only; a cornered suspect with
  // nothing left may give up without being told. Nerve comes back slowly.
  thinkBroken(e, dt, p, st) {
    const L = G.Level, U = G.U;
    e.aiming = false; e.peek = false; e.leanOut = 0; e.cover = null; e.inCover = false;
    if (e.fleeT > 0) {
      e.fleeT -= dt;
      e.crouch = false;
      const step = this.flow ? L.flowAway(this.map, this.flow, e.x, e.z, e.y) : null;
      if (step) {
        const dx = step.x - e.x, dz = step.z - e.z, d = Math.hypot(dx, dz) || 1;
        e.yaw += U.angDiff(e.yaw, Math.atan2(-dx, -dz)) * Math.min(1, dt * 8);
        this.moveEntity(e, dx / d, dz / d, e.def.speed * 1.15, dt);
      } else e.fleeT = 0;
      return;
    }
    e.crouch = true;
    if (st && e.canSee) {
      e.yaw += U.angDiff(e.yaw, Math.atan2(-(st.p[0] - e.x), -(st.p[2] - e.z))) * Math.min(1, dt * 5);
      e.cool -= dt;
      // cornered with police in sight: fight back, not token shots
      if (e.cool <= 0 && e.tgtD < e.def.range && this.onTarget(e, st, dt)) { this.fire(e, p); e.cool = U.rf(0.5, 1.2); }
    } else e.cool = Math.max(e.cool, 0.8);
    if (e.morale > 0.45) e.broken = false;
  },

  // Walk, opening any closed door in the way first (which costs a moment and makes noise).
  moveEntity(e, mx, mz, speed, dt) {
    const L = G.Level, map = this.map;
    if (e.doorWait > 0) { e.doorWait -= dt; return; }
    const ahead = map.world && G.World.raycast(map.world, e.x, (e.y || 0) + 1.0, e.z, mx, 0, mz, 0.9, { move: true }); // (what they'd walk into)
    const d = ahead && ahead.solid && ahead.solid.kind === 'door' ? ahead.solid.door : null;
    if (d && !d.open) { this.setDoor(d.id, true); e.doorWait = 0.5; return; }
    if (e.collapsed) return; // legs gone: they're on the floor
    speed *= this.injSpeed(e) * (e.str == null || e.str >= 0.6 ? 1 : 0.3 + 0.7 * e.str / 0.6); // a broken leg limps; blood loss slows
    e.x += mx * speed * dt; e.z += mz * speed * dt;
    this.settle(e, 0.38 * e.def.scale);
  },
  // someone who's moved: out of what they walked into (stepping up onto anything low), and onto the floor or step
  // under them
  settle(e, r) {
    const L = G.Level, map = this.map, y = e.y || 0;
    L.resolve(map, e, r, y, G.World.STEP, true);
    e.y = L.groundAt(map, e.x, e.z, r, y, G.World.STEP, true); // (stairs as slopes: no hopping from tread to tread)
  },

  // Someone on their knees (surrendered, or a cowering civilian) does what the police tell them.
  obedient(e) { return e.state === 'surrender' || (e.def.civ && e.state === 'cower'); },
  obey(e, dt) {
    if (e.dragTo) { // being pulled back by an officer
      const dx = e.dragTo.x - e.x, dz = e.dragTo.z - e.z, d = Math.hypot(dx, dz), st = Math.min(d, 1.3 * dt);
      const ox = e.x, oz = e.z;
      if (d > 0.02) { e.x += (dx / d) * st; e.z += (dz / d) * st; this.settle(e, 0.3); }
      // there, or up against something (it isn't getting any closer)
      if (d <= 0.02 || Math.hypot(e.x - ox, e.z - oz) < st * 0.2) e.dragTo = null;
      return true;
    }
    if (e.turnYaw != null) { // shuffling round on their knees
      const da = G.U.angDiff(e.yaw, e.turnYaw), st = 2.2 * dt;
      if (Math.abs(da) <= st) { e.yaw = e.turnYaw; e.turnYaw = null; } else e.yaw += Math.sign(da) * st;
      return true;
    }
    return false;
  },
  // Surrendered suspects kneel with hands up until cuffed. A few are faking and go for a hidden
  // weapon when nobody is standing over them.
  thinkSurrendered(e, dt, alive) {
    const near = alive.reduce((b, p) => { const d = Math.hypot(p.st.p[0] - e.x, p.st.p[2] - e.z); return d < b.d ? { d, p } : b; }, { d: 1e9, p: null });
    // they watch the police approach, then hold still as ordered once an officer is on top of them
    // (so you can walk round behind to restrain them)
    if (near.p && near.d > 3 && !e.ordered) e.yaw += G.U.angDiff(e.yaw, Math.atan2(-(near.p.st.p[0] - e.x), -(near.p.st.p[2] - e.z))) * Math.min(1, dt * 3);
    if (!e.fake) return;
    e.fakeT -= dt;
    if (e.fakeT <= 0 && near.d > 2.2) {
      const gun = this.evidence.find((v) => v.owner === e.id && !v.secured && !v.taken);
      if (!gun) { e.fake = false; return; }
      gun.taken = true;
      G.Net.broadcast({ t: 'evtake', i: gun.i });
      e.state = 'normal'; e.armed = true; e.fake = false;
      e.emboldened = true; e.morale = Math.max(e.morale, 1); e.broken = false; e.shouts = 0; // got away with it once: not giving up again
      this.alertEnemy(e, false);
      e.cool = 0.3;
      G.Net.broadcast({ t: 'chat', id: null, m: 'A surrendered suspect is going for a weapon!' });
    }
  },

  // Civilians: mill about until something scares them, then cower or bolt away from the shooting.
  thinkCiv(e, dt) {
    const def = e.def, U = G.U, L = G.Level;
    if (e.state === 'cuffed' || e.state === 'surrender' || e.state === 'cower') return;
    if (e.state === 'hide') {
      if (!e.hide && !this.seekHide(e)) { e.state = 'cower'; e.crouch = false; e.leanOut = 0; return; }
      // an officer right on top of them: they give up and freeze
      const near = this.nearestOfficer(e);
      if (near && near.d < 3) { e.state = 'cower'; e.hide = null; e.crouch = false; e.leanOut = 0; return; }
      if (e.relocate) { e.relocate = false; this.seekHide(e); }
      if (!e.hide || !this.hideStep(e, dt, def.run)) { e.state = 'flee'; e.fleeT = 2; e.crouch = false; e.leanOut = 0; }
      return;
    }
    if (e.state === 'flee') {
      e.fleeT -= dt;
      const step = this.flow ? L.flowAway(this.map, this.flow, e.x, e.z) : null;
      if (step) {
        const dx = step.x - e.x, dz = step.z - e.z, d = Math.hypot(dx, dz) || 1;
        e.yaw += U.angDiff(e.yaw, Math.atan2(-dx, -dz)) * Math.min(1, dt * 8);
        this.moveEntity(e, dx / d, dz / d, def.run, dt);
      }
      if (e.fleeT <= 0 || !step) e.state = Math.random() < 0.6 && this.seekHide(e) ? 'hide' : 'cower';
      return;
    }
    e.idleT -= dt;
    if (e.idleT <= 0) {
      e.idleT = 2 + Math.random() * 4;
      e.walkTo = Math.random() < 0.55 ? this.amble(e) : null;
    }
    if (e.walkTo) {
      const dx = e.walkTo.x - e.x, dz = e.walkTo.z - e.z, d = Math.hypot(dx, dz);
      if (d < 0.3) e.walkTo = null;
      else { e.yaw += U.angDiff(e.yaw, Math.atan2(-dx, -dz)) * Math.min(1, dt * 5); this.moveEntity(e, dx / d, dz / d, def.speed, dt); }
    }
  },

  // A crate at cover spot c shields it from the target if it lies roughly toward them.
  coverProtects(c, st) {
    const tx = st.p[0] - c.x, tz = st.p[2] - c.z, td = Math.hypot(tx, tz);
    if (td < 3) return false;
    const kx = c.cx - c.x, kz = c.cz - c.z, kd = Math.hypot(kx, kz);
    return (tx * kx + tz * kz) / (td * kd) > 0.55;
  },
  findCover(e, st) {
    const L = G.Level, map = this.map, def = e.def;
    let best = null, bs = 1e9;
    const here = (q) => Math.abs((q.y || 0) - (e.y || 0)) < 1.5; // (on their own floor)
    for (const c of map.cover) {
      const d = Math.hypot(c.x - e.x, c.z - e.z);
      if (d > 12 || !here(c)) continue;
      const dt = Math.hypot(c.x - st.p[0], c.z - st.p[2]);
      if (dt < 4 || dt > def.range * 0.9) continue;
      const score = d + Math.abs(dt - def.pref) * 0.4;
      if (score >= bs || !this.coverProtects(c, st)) continue;
      let claimed = false;
      for (const o of this.enemies.values()) if (o !== e && o.cover && Math.hypot(o.cover.x - c.x, o.cover.z - c.z) < 1.2) { claimed = true; break; }
      if (claimed) continue;
      if (!L.los(map, c.x, (c.y || 0) + 1.6 * def.scale, c.z, st.p[0], st.p[1] + 1.2, st.p[2])) continue; // can shoot when peeking
      best = c; bs = score;
    }
    // Corners: stand hidden beside a wall edge, lean out sideways to shoot.
    const ty = st.p[1] + 1.4;
    let tried = 0;
    for (const w of map.wallSpots) {
      const d = Math.hypot(w.x - e.x, w.z - e.z), ey = (w.y || 0) + 1.6 * def.scale;
      if (d > 10 || tried > 30 || !here(w)) continue;
      const dt = Math.hypot(w.x - st.p[0], w.z - st.p[2]);
      if (dt < 5 || dt > def.range * 0.9) continue;
      const score = d + Math.abs(dt - def.pref) * 0.4 + 0.5;
      if (score >= bs) continue;
      let claimed = false;
      for (const o of this.enemies.values()) if (o !== e && o.cover && Math.hypot(o.cover.x - w.x, o.cover.z - w.z) < 1.2) { claimed = true; break; }
      if (claimed) continue;
      tried++;
      if (L.los(map, w.x, ey, w.z, st.p[0], ty, st.p[2])) continue; // must be hidden when standing at the spot
      const nx = -(st.p[2] - w.z) / dt, nz = (st.p[0] - w.x) / dt;
      for (const side of [1, -1]) {
        const px = w.x + nx * side * 0.55, pz = w.z + nz * side * 0.55;
        if (L.tile(L.floorMap(map, w.fl || 0), Math.floor(px / L.TS), Math.floor(pz / L.TS)) !== 0) continue;
        if (!this.leanClear(w.x, w.z, px, pz, ey, w.y || 0)) continue; // (round the edge, not through a door jamb or a thin wall)
        if (!L.los(map, px, ey, pz, st.p[0], ty, st.p[2])) continue;
        best = { x: w.x, y: w.y || 0, z: w.z, lean: side, px, pz, fl: w.fl || 0 }; bs = score;
        break;
      }
    }
    return best;
  },
  coverValid(c, st, def) {
    if (!c.lean) return this.coverProtects(c, st);
    const L = G.Level, map = this.map, ey = (c.y || 0) + 1.6 * def.scale, ty = st.p[1] + 1.4;
    return !L.los(map, c.x, ey, c.z, st.p[0], ty, st.p[2]) && this.leanClear(c.x, c.z, c.px, c.pz, ey, c.y || 0) && L.los(map, c.px, ey, c.pz, st.p[0], ty, st.p[2]);
  },
  // Can someone standing at (x, z) actually lean out to (px, pz)? Nothing solid between: a corner's edge, not a
  // door jamb, a door leaf or a thin wall to the next room (at chest and at eye height; and the way the head
  // goes, a little further out still)
  leanClear(x, z, px, pz, ey, y = 0) { // (ey: their eyes' height; y: the floor they stand on)
    const L = G.Level, map = this.map, ox = px + (px - x) * 0.3, oz = pz + (pz - z) * 0.3;
    return L.los(map, x, y + 1.1, z, px, y + 1.1, pz) && L.los(map, x, ey, z, px, ey, pz) && L.los(map, x, ey, z, ox, ey, oz);
  },

  tryNade(e, tx, tz) {
    if (!e.def.nades || e.nadeT > 0 || this.nadeT > 0 || this.level < 2) return;
    e.nadeT = 14 + Math.random() * 8;
    this.nadeT = 5;
    const s = e.def.scale, p = [e.x, (e.y || 0) + 1.6 * s, e.z];
    const dx = tx - e.x, dz = tz - e.z, d = Math.hypot(dx, dz);
    const T = G.U.clamp(d / 11, 0.6, 1.5), g = 18;
    const v = [dx / T, (0.3 - p[1] + 0.5 * g * T * T) / T, dz / T];
    const r2 = (x) => Math.round(x * 100) / 100;
    G.Net.broadcast({ t: 'nade', id: 'enemy', e: e.id, p: p.map(r2), v: v.map(r2), fuse: 2.6, en: 1 });
  },
  // A flashbang: everyone hears it; anyone with an eye on it (in sight of the blast, close enough) is blinded
  // for a few seconds, longer the closer and the more squarely they were facing it. Blinded, a suspect can't
  // see to fight and stands frozen, and is far easier to talk down; civilians panic.
  flashbang(p) {
    const L = G.Level, map = this.map, [x, y, z] = p;
    this.hear(x, z, 30, y);
    for (const e of this.enemies.values()) {
      if (e.state === 'cuffed' || e.state === 'dead') continue;
      const s = e.def.scale, ey = (e.y || 0) + 1.55 * s, d = Math.hypot(e.x - x, ey - y, e.z - z);
      if (d > 14 || !L.los(map, x, y, z, e.x, ey, e.z)) continue;
      const look = (-Math.sin(e.yaw) * (x - e.x) + -Math.cos(e.yaw) * (z - e.z)) / (Math.hypot(x - e.x, z - e.z) || 1);
      const k = (1 - d / 14) * (look > 0.3 ? 1 : 0.55);
      if (e.def.civ) { this.panic(e, { x, z }); continue; }
      e.flashT = Math.max(e.flashT || 0, 1.5 + 4.5 * k);
      e.morale -= 0.25 * k * (e.def.steady || 1);
      if (e.state === 'normal') { this.alertEnemy(e, false); e.surprisedT = Math.max(e.surprisedT || 0, e.flashT * 0.8); }
    }
    G.Net.broadcast({ t: 'flash', p });
  },
  enemyBoom(p) {
    const r2 = (x) => Math.round(x * 100) / 100;
    this.hear(p.x, p.z, 20, p.y || 0);
    G.Net.broadcast({ t: 'boom', id: 'enemy', p: [p.x, p.y, p.z].map(r2), r: 5, d: Math.round(95 * this.dmgMult), en: 1 });
  },

  // blind: firing at where the target was last seen, not at them
  fire(e, p, blind) {
    // no shooting with the gun still holstered or slung, or while it's coming up: they start drawing instead
    if (!e.armed) return;
    if (!e.drawn) { this.draw(e); return; }
    if (e.drawT > 0) return;
    if (e.magMax) {
      if (e.reloadT > 0) return;
      if (e.mag <= 0) { this.startReload(e); return; }
      e.mag--;
      if (e.mag <= 0) this.startReload(e);
    }
    // A string of fire: centre mass first, then, 0.3-0.5 s in, they walk their aim up to the head (over half a
    // second). A pause of over a second, or a new target, starts again from the body.
    if (blind || e.engTgt !== p.id || !(this.clock - (e.firedAt || -9) < 1.0)) { e.engAt = this.clock; e.engTgt = p.id; e.headDelay = 0.3 + Math.random() * 0.2; }
    const up = blind ? 0 : G.U.clamp((this.clock - e.engAt - e.headDelay) / 0.5, 0, 1); // 0 body .. 1 head
    e.firedAt = this.clock;
    const kickNow = e.kick || 0; // (still coming back from the last one: a snap shot)
    e.kick = kickNow + this.kickOf(e, G.WEAPONS[e.def.wpn] || { recoil: 1 });
    const def = e.def, s = def.scale, st = p.st, L = G.Level, map = this.map;
    const fx = -Math.sin(e.yaw), fz = -Math.cos(e.yaw);
    const lc = e.leanOut && e.cover && e.cover.lean ? e.cover : null; // cover can be dropped earlier in the same tick
    const bx = lc ? lc.px : e.x, bz = lc ? lc.pz : e.z;
    let from = [bx + fx * 0.5 * s, (e.y || 0) + (e.collapsed ? 0.45 : 1.35) * s, bz + fz * 0.5 * s]; // (down on the floor, shooting up)
    // standing against a door or wall: the muzzle must not poke through it
    if (!L.los(map, bx, from[1], bz, from[0], from[1], from[2])) from = [bx, from[1], bz];
    // aim at the exposed part: a leaning player shows head and shoulder, not centre mass
    const [hx, hz] = this.headXZ(st), leaning = Math.abs(st.ln || 0) > 0.3;
    let tx = hx, ty = st.p[1] + (st.pr ? 0.25 : st.cr ? 0.75 : 1.2) + (leaning ? 0.3 : 0) + (leaning ? 0 : up * (st.pr ? 0.08 : st.cr ? 0.25 : 0.38)), tz = hz; // (prone: low, a small target)
    if (blind) { tx = e.lastSeen.x + (Math.random() - 0.5) * 1.4; tz = e.lastSeen.z + (Math.random() - 0.5) * 1.4; ty = (e.lastSeen.y || 0) + 0.8 + Math.random() * 0.9; }
    const dx = tx - from[0], dy = ty - from[1], dz = tz - from[2], d = Math.hypot(dx, dy, dz);
    // a bit worse up close, much worse at range: at their weapon's range they hit about a sixth as often
    const distF = 0.9 * G.U.clamp(0.95 - 0.8 * Math.pow(d / def.range, 1.2), 0.12, 0.95);
    const moveF = st.mv > 3 ? 0.72 : st.mv > 0.5 ? 0.88 : 1;
    const chance = (blind ? 0.15 : 1) * (1 - 0.2 * up) * this.injAim(e) * def.acc * distF * moveF * this.accMult * (1 - 0.6 * (e.sup || 0)) * (1 - 0.5 * Math.min(1, e.shock || 0)) * (e.collapsed ? 0.4 : 1) * (e.str != null && e.str < this.TWO_HAND ? 0.7 : 1) * (1 - Math.min(0.5, kickNow / 16)) * (e.broken ? (e.fleeT > 0 ? 0.4 : 0.8) : 1) * this.dazzle(e, st);
    // Their round is a round, flown from here as yours are (js/player.js enemyRound) to whatever it meets. All that's rolled is
    // how well it's aimed: chance is the share that would land on a body a BODY_R across at that distance, so the aim's
    // error at the target is the spread that gives that (a two-dimensional normal: 1 - exp(-R²/2σ²)). The rest is what's
    // there: how much of you shows, what's in the way, what the round does.
    const wdef = G.WEAPONS[def.wpn] || G.WEAPONS.p9, am = G.ballFor(G.calOf(wdef)), v0 = G.roundSpeed(wdef, am) || 400;
    const norm = () => Math.sqrt(-2 * Math.log(1 - Math.random())) * Math.cos(Math.PI * 2 * Math.random());
    const sd = this.BODY_R / Math.sqrt(-2 * Math.log(1 - G.U.clamp(chance, 0.01, 0.97))), ex = norm() * sd, ey = norm() * sd;
    const fv = new THREE.Vector3(...from), aim = new THREE.Vector3(tx + (-dz / d) * ex, ty + ey, tz + (dx / d) * ex).sub(fv), far = aim.length();
    aim.divideScalar(far); aim.y += G.GRAVITY * far / (2 * v0 * v0); aim.normalize(); // (held up for the drop: they've used this gun before)
    const right = new THREE.Vector3(-aim.z, 0, aim.x).normalize(), upv = new THREE.Vector3().crossVectors(right, aim), pr = Math.tan(((wdef.choke || 0) * Math.PI) / 180), pellets = def.pellets || 1;
    const r2 = (v) => Math.round(v * 100) / 100, shot = { sid: (this.eSid = (this.eSid || 0) + 1), ff: new Map(), w: wdef.code || def.wpn, am, f: from.map(r2), tos: null, enemy: e.id };
    for (let i = 0; i < pellets; i++) {
      let dir = aim;
      if (pellets > 1 && pr > 0) { const a = Math.random() * Math.PI * 2, rr = pr * Math.min(1.6, Math.abs(norm()) * 0.6); dir = aim.clone().addScaledVector(right, Math.cos(a) * rr).addScaledVector(upv, Math.sin(a) * rr).normalize(); }
      G.Me.enemyRound(e.id, fv, dir, wdef, am, shot);
    }
    const to = G.Me.predictEnd(fv, aim.clone().multiplyScalar(v0), G.dragOf(wdef, am), G.GRAVITY).toArray();
    G.Net.broadcast({ t: 'eshot', e: e.id, ty: e.type, w: def.wpn, f: from.map(r2), to: to.map(r2), tg: p.id, sid: shot.sid });
  },
  BODY_R: 0.24,
};
