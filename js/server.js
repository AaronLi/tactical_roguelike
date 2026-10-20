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

  reset() {
    this.players.clear(); this.enemies.clear();
    this.phase = 'lobby'; this.level = 0; this.map = null;
  },
  roster() {
    const r = {};
    for (const [id, p] of this.players) r[id] = { name: p.name, color: p.color, look: p.look, ready: p.ready, host: id === G.Net.myId };
    return r;
  },
  sendRoster() { G.Net.broadcast({ t: 'roster', roster: this.roster() }); },

  handle(m, from) {
    const p = this.players.get(from);
    switch (m.t) {
      case 'hello': {
        const name = String(m.name || 'Operator').slice(0, 16);
        const color = typeof m.color === 'number' ? m.color : 0x3fa9f5;
        this.players.set(from, { id: from, name, color, look: G.Rig.cleanLook(m.look), ready: false, st: null });
        G.Net.sendTo(from, {
          t: 'welcome', id: from, roster: this.roster(), phase: this.phase, level: this.level,
          seed: this.seed, shopSeed: this.shopSeed, th: this.theme, route: this.routeMsg(),
          doors: this.map && this.phase === 'level' ? this.map.doors.map((d) => (d.open ? 1 : 0)) : null,
          evidence: this.phase === 'level' && this.evidence ? this.evidence.filter((v) => !v.taken).map((v) => [v.i, v.wpn, v.x, v.z, v.secured ? 1 : 0]) : null,
          bodies: this.phase === 'level' && this.bodies ? [...this.bodies.values()].map((b) => [b.id, b.type, b.x, b.z, b.yaw, b.secured ? 1 : 0]) : null,
          wcase: this.phase === 'level' ? this.caseMsg() : null, cabs: this.phase === 'level' ? this.cabMsg() : null,
          loot: this.phase === 'level' && this.loot ? [...this.loot.values()].map((l) => [l.id, l.x, l.y, l.z, l.item, l.yaw]) : null,
          glass: this.phase === 'level' && this.glassBroken ? [...this.glassBroken] : null,
        });
        this.sendRoster();
        if (from !== G.Net.myId) G.Net.broadcast({ t: 'chat', id: null, m: name + ' joined the squad.' });
        break;
      }
      case 'st': if (p) p.st = m.s; break;
      case 'hit': this.applyHit(m, from); break;
      case 'shot':
        if (p && p.st) this.hear(p.st.p[0], p.st.p[2], m.sil === 2 ? 2 : m.sil ? 6 : 28);
        if (m.f && m.to && this.phase === 'level') this.suppress(m.f, m.to);
        G.Net.broadcast({ t: 'shot', id: from, f: m.f, to: m.to, w: m.w, sil: m.sil, am: G.AMMO[m.am] ? m.am : undefined }, from);
        break;
      case 'nade': G.Net.broadcast({ t: 'nade', id: from, p: m.p, v: m.v, fuse: m.fuse }, from); break;
      // an officer's round went through these windows
      case 'glass': if (this.phase === 'level' && Array.isArray(m.ids)) this.breakGlass(m.ids, m.p); break;
      case 'boom':
        this.hear(m.p[0], m.p[2], 35);
        // the blast takes out the windows round it
        if (this.map && this.map.windows && Array.isArray(m.p)) this.breakGlass(this.map.windows.filter((w) => !w.broken && Math.hypot(w.x - m.p[0], w.z - m.p[2]) < (+m.r || 4) * 1.3).map((w) => w.id), m.p);
        G.Net.broadcast({ t: 'boom', id: from, p: m.p, r: m.r, d: m.d });
        break;
      case 'revive': G.Net.broadcast({ t: 'revive', tg: m.tg, by: from, hp: m.hp }); break;
      // one officer's medical item on another: passed on to them (they apply it)
      case 'treat': if (G.Med.ITEMS[m.mt] && G.Med.NAME[m.part]) G.Net.broadcast({ t: 'treat', tg: m.tg, by: from, part: m.part, mt: m.mt }); break;
      // a vote to leave (or taking it back), once order's restored
      case 'vote':
        if (this.phase === 'level' && this.extract.active && p) { if (m.v) this.extract.votes.add(from); else this.extract.votes.delete(from); }
        break;
      case 'ready':
        if (p) { p.ready = !!m.r; this.sendRoster(); this.checkReady(); }
        break;
      // a vote on the route map for where to go next
      case 'pick':
        if (p && this.phase === 'route' && G.Route.options(this.routeMap, this.route.path[this.route.path.length - 1]).includes(m.n)) {
          this.route.votes[from] = m.n;
          G.Net.broadcast({ t: 'rvotes', v: this.route.votes });
          this.checkPicks();
        }
        break;
      case 'chat': if (p) G.Net.broadcast({ t: 'chat', id: from, m: String(m.m).slice(0, 120) }); break;
      // friendly fire: one officer's rounds in another (the shooter traced them; the one hit takes the wounds)
      case 'ff': if (p && this.phase === 'level' && this.players.has(m.tg) && Array.isArray(m.hz)) G.Net.broadcast({ t: 'ffhit', by: from, tg: m.tg, hz: m.hz.slice(0, 12), w: m.w, f: m.f }); break;
      case 'ping': if (p && Array.isArray(m.p) && m.p.length === 3) G.Net.broadcast({ t: 'ping', id: from, p: m.p.map(Number) }); break;
      // something put down (dropped from an inventory), or picked up: the first to ask gets it
      case 'drop': {
        // (never refused once it's off them: an item can't be lost. Their position, when we have it, keeps it
        // at their feet)
        if (this.phase !== 'level' || !p || !m.item || typeof m.item !== 'object') break;
        let x = +m.x, z = +m.z;
        if (!isFinite(x) || !isFinite(z)) { if (!p.st) break; x = p.st.p[0]; z = p.st.p[2]; }
        if (p.st && Math.hypot(x - p.st.p[0], z - p.st.p[2]) > 2.5) { x = p.st.p[0]; z = p.st.p[2]; }
        const l = { id: (this.lootId = (this.lootId || 0) + 1), x, z, y: G.Level.groundAt(this.map, x, z, 0.05, ((p.st && p.st.p[1]) || 0) + 1.2), item: m.item, yaw: Math.random() * Math.PI * 2 };
        this.loot.set(l.id, l);
        if (this.loot.size > 80) { const old = this.loot.keys().next().value; this.loot.delete(old); G.Net.broadcast({ t: 'lootRm', id: old }); }
        G.Net.broadcast({ t: 'loot', a: [[l.id, l.x, l.y, l.z, l.item, l.yaw]], by: from });
        break;
      }
      case 'take': {
        const l = this.loot && this.loot.get(m.id);
        if (this.phase !== 'level' || !l || !p || !p.st || Math.hypot(l.x - p.st.p[0], l.z - p.st.p[2]) > 2.5) break;
        this.loot.delete(l.id);
        G.Net.broadcast({ t: 'lootRm', id: l.id });
        G.Net.sendTo(from, { t: 'lootGot', item: l.item, x: l.x, z: l.z });
        break;
      }
      case 'useDoor': {
        const d = this.map && this.phase === 'level' ? this.map.doors[m.i] : null;
        if (d && p && p.st && Math.hypot(p.st.p[0] - d.x, p.st.p[2] - d.z) < 2.8) {
          this.setDoor(d.id, !d.open);
          if (d.kind === 'vault') { // both leaves together
            const partner = d.mirror ? this.map.doors[d.id - 1] : this.map.doors[d.id + 1] && this.map.doors[d.id + 1].mirror ? this.map.doors[d.id + 1] : null;
            if (partner) this.setDoor(partner.id, d.open);
          }
          const field = this.soundField(d.x, d.z);
          for (const e of this.enemies.values()) if (this.heardAt(field, e.x, e.z) < 7) this.suspect(e, d.x, d.z); // a door is heard
        }
        break;
      }
      case 'kickDoor': {
        const d = this.map && this.phase === 'level' ? this.map.doors[m.i] : null;
        if (d && !d.open && d.kind !== 'vault' && p && p.st && Math.hypot(p.st.p[0] - d.x, p.st.p[2] - d.z) < 2.8) this.kickDoor(d);
        break;
      }
      case 'shout': if (p && p.st && this.phase === 'level') this.shout(p, from); break;
      // open the weapon case (once, for everyone)
      case 'openCase': {
        const c = this.map && this.map.case;
        if (this.phase !== 'level' || !c || this.caseOpen || !p || !p.st || Math.hypot(c.x - p.st.p[0], c.z - p.st.p[2]) > 2.4) break;
        this.caseOpen = true;
        G.Net.broadcast({ t: 'wcase', c: this.caseMsg(), opened: from });
        break;
      }
      // first aid cabinets: opened (once, for everyone), and officers' edits (what they took and put in)
      case 'openCab': case 'cabEdit': {
        const c = this.map && this.map.cabinets && this.map.cabinets[m.i], cab = this.cabs && this.cabs[m.i];
        if (this.phase !== 'level' || !c || !cab || !p || !p.st || Math.hypot(c.x - p.st.p[0], c.z - p.st.p[2]) > 2.6) break;
        let r = null;
        if (m.t === 'openCab') { if (cab.open) break; cab.open = true; }
        else { if (!cab.open) break; r = this.cabEdit(cab, m); }
        G.Net.broadcast({ t: 'cab', i: m.i, c: [cab.open ? 1 : 0, cab.items, cab.ver], by: r ? from : null, took: r && r.took, deny: r && r.deny, ret: r && r.ret });
        break;
      }
      // swap a weapon with the (open) case: what's in it goes to them, what they gave goes in
      case 'swap': {
        const c = this.map && this.map.case, got = this.wcase;
        if (this.phase !== 'level' || !c || !got || !this.caseOpen || !p || !p.st || Math.hypot(c.x - p.st.p[0], c.z - p.st.p[2]) > 2.4) break;
        const def = G.Gunsmith.fromCode(got.code), give = Array.isArray(m.give) ? m.give : null;
        if (!def || (give && (G.Gunsmith.fromCode(give[0]) || {}).slot !== def.slot)) break;
        this.wcase = give ? { code: String(give[0]), mag: +give[1] || 0, reserve: +give[2] || 0, am: String(give[3] || ''), kit: null } : null;
        G.Net.broadcast({ t: 'wcase', c: this.caseMsg(), by: from, got: [got.code, got.mag, got.reserve, got.am, got.kit || null] });
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
      case 'cuff': if (p && p.st && this.phase === 'level') this.cuff(m.e, p, from); break;
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
    if (this.phase !== 'route' || !this.players.size) return;
    for (const id of this.players.keys()) if (this.route.votes[id] == null) return;
    const tally = {};
    for (const n of Object.values(this.route.votes)) tally[n] = (tally[n] || 0) + 1;
    const top = Math.max(...Object.values(tally)), best = Object.keys(tally).filter((n) => tally[n] === top);
    const n = +best[Math.floor(Math.random() * best.length)];
    this.route.path.push(n);
    this.theme = this.routeMap.nodes.get(n).th;
    this.startLevel();
  },
  startLevel() {
    this.phase = 'level';
    this.seed = (Math.random() * 2 ** 31) | 0;
    this.map = G.Level.generate(this.seed, this.level, this.theme);
    this.enemies.clear();
    this.extract = { active: false, votes: new Set() };
    this.flow = null; this.flowT = 0; this.wipeT = 0; this.summons = 0; this.nadeT = 8;
    this.report = { kills: 0, arrests: 0, rescued: 0, civKilled: 0, unauth: 0, evidence: 0, bodies: 0 };
    this.evidence = []; // weapons on the floor: { i, wpn, x, z, owner, secured, taken }
    this.loot = new Map(); // things officers have put down: id -> { id, x, y, z, item (packed), yaw }
    this.glassBroken = new Set(); // windows broken (map.windows ids)
    this.bodies = new Map(); // the dead, until secured: id -> { id, type, x, z, yaw, civ, secured }
    for (const p of this.players.values()) { p.ready = false; p.st = null; }
    this.spawnEnemies();
    this.wcase = this.map.case ? this.rollCase() : null;
    this.cabs = (this.map.cabinets || []).map(() => ({ open: false, ver: 0, items: this.layCab(this.rollCab()) }));
    this.caseOpen = false;
    G.Net.broadcast({ t: 'phase', phase: 'level', level: this.level, seed: this.seed, th: this.theme, route: this.routeMsg(), wcase: this.caseMsg(), cabs: this.cabMsg() });
  },
  // The level's weapon case: a weapon in its standard build, fully loaded, picked by rarity. Each tier has a
  // share (CASE_RARITY), split evenly between that tier's weapons so a tier with many weapons isn't more
  // likely; deeper levels shift the odds toward rarer tiers, and legendaries only turn up from level 3.
  // Three in four are long guns.
  CASE_RARITY: { 1: 60, 2: 28, 3: 10, 4: 2 },
  caseOdds(level, slot) {
    const byTier = {};
    for (const w of G.WEAPON_LIST) if (w.slot === slot && this.CASE_RARITY[w.tier] && !(w.tier === 4 && level < 3)) (byTier[w.tier] = byTier[w.tier] || []).push(w);
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
    const kits = G.Gunsmith.kitsFor(w.id);
    if (kits.length && Math.random() < 0.35) w = G.WEAPONS[G.Gunsmith.PARTS[kits[Math.floor(Math.random() * kits.length)]].becomes] || w;
    return { code: G.Gunsmith.defaultCode(w.id), mag: w.mag, reserve: w.mag * 2, am: G.rollAmmo(G.calOf(w)), kit: null };
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
  // [code (null when empty), mag, reserve, open, ammo type] or null when the level has no case
  caseMsg() { return this.map && this.map.case ? [this.wcase ? this.wcase.code : null, this.wcase ? this.wcase.mag : 0, this.wcase ? this.wcase.reserve : 0, this.caseOpen ? 1 : 0, this.wcase ? this.wcase.am : null, this.wcase ? this.wcase.kit || null : null] : null; },
  toShop() {
    this.phase = 'shop';
    this.shopSeed = (Math.random() * 2 ** 31) | 0;
    for (const p of this.players.values()) p.ready = false;
    G.Net.broadcast({ t: 'phase', phase: 'shop', level: this.level, shopSeed: this.shopSeed, report: this.report });
    this.sendRoster();
  },
  checkReady() {
    if (this.phase !== 'shop' || this.players.size === 0) return;
    for (const p of this.players.values()) if (!p.ready) return;
    this.level++;
    this.toRoute(); // where next: the map
  },
  gameOver() {
    this.phase = 'gameover';
    const stats = {};
    for (const [id, p] of this.players) stats[id] = { name: p.name, color: p.color, sx: p.st ? p.st.sx : null };
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
    const count = Math.min(Math.round((4 + Math.floor(L * 1.5) + (np - 1) * 2) * (this.map.theme.foes || 1)), 32); // (a bigger map: more of them)
    const hpMult = 1 + 0.04 * (L - 1) + 0.1 * (np - 1);
    this.accMult = Math.min(1 + 0.03 * (L - 1), 1.5);
    this.dmgMult = 1 + 0.07 * (L - 1);
    const weights = [['suspect', 4], ['grunt', 2.5 + L * 0.2], ['rusher', 1 + L * 0.2], ['marksman', L >= 2 ? 0.8 + L * 0.15 : 0], ['heavy', L >= 3 ? 0.4 + L * 0.2 : 0]];
    const total = weights.reduce((a, w) => a + w[1], 0);
    let spots = U.shuffle(Math.random, this.map.enemySpots.slice());
    const ua = this.map.unitAt, W = this.map.W;
    if (ua) { // apartments: a spot in each one goes to the front of the list
      const first = [], seen = new Set();
      for (const s of spots) { const u = ua[s[1] * W + s[0]]; if (u >= 0 && !seen.has(u)) { seen.add(u); first.push(s); } }
      spots = first.concat(spots.filter((s) => !first.includes(s)));
    }
    this.unitsSeen = new Set(); // apartments an officer has been inside
    const used = [];
    for (const [tx, tz] of spots) {
      if (used.length >= count) break;
      if (used.some(([ux, uz]) => Math.abs(ux - tx) + Math.abs(uz - tz) < 2 * G.Level.K)) continue;
      used.push([tx, tz]);
      let roll = Math.random() * total, type = 'grunt';
      for (const [ty, w] of weights) { if (roll < w) { type = ty; break; } roll -= w; }
      this.addEnemy(type, (tx + 0.5) * G.Level.TS, (tz + 0.5) * G.Level.TS, hpMult);
    }
    // civilians caught up in it (more at a festival: some of them hiding behind the stalls' counters; the other
    // stalls were left as they ran)
    const crowd = this.map.theme.crowd || 1, civs = Math.min(Math.round((2 + Math.floor(L / 2)) * crowd), 8), TS = G.Level.TS;
    let placed = 0;
    for (const s of U.shuffle(Math.random, (this.map.civSpots || []).slice())) {
      if (placed >= Math.ceil(civs * 0.6)) break;
      const tx = Math.floor(s.x / TS), tz = Math.floor(s.z / TS);
      if (this.map.t[tz * this.map.W + tx] !== 0 || used.some(([ux, uz]) => Math.abs(ux - tx) + Math.abs(uz - tz) < 2 * G.Level.K)) continue;
      used.push([tx, tz]);
      const c = this.addEnemy('civ', s.x, s.z, 1);
      c.state = 'hide'; c.hide = { x: s.x, z: s.z, lean: 0 }; c.crouch = true; c.yaw = s.yaw; c.peekT = 1 + Math.random() * 3;
      placed++;
    }
    for (const [tx, tz] of spots) {
      if (placed >= civs) break;
      if (used.some(([ux, uz]) => Math.abs(ux - tx) + Math.abs(uz - tz) < 2 * G.Level.K)) continue;
      used.push([tx, tz]);
      this.addEnemy('civ', (tx + 0.5) * G.Level.TS, (tz + 0.5) * G.Level.TS, 1);
      placed++;
    }
    if (G.Route.isBoss(L)) {
      const ex = this.map.extract;
      const b = this.addEnemy('warden', ex.x, ex.z, (1 + 0.5 * (G.Route.actOf(L) - 1)) * (1 + 0.35 * (np - 1)));
      b.guard = true;
    }
  },
  // A suspect's kit for this level: a weapon from its type's pool and armour, at a gear tier around the level's.
  // The def is the type's, with the kit laid over it (weapon, its damage, pellets and rate of fire, armour).
  equip(type) {
    const base = G.ENEMIES[type], G2 = G.ENEMY_GEAR;
    if (base.civ || !G2.weapons[type]) return base;
    const r = Math.random(), tier = base.boss ? G.gearTier(this.level) : G.U.clamp(G.gearTier(this.level) + (r < 0.2 ? -1 : r > 0.88 ? 1 : 0), 1, 4);
    const pool = G2.weapons[type][tier - 1], wpn = pool[Math.floor(Math.random() * pool.length)], w = G.WEAPONS[wpn];
    const roll = (chances, ids) => { let x = Math.random(); for (let i = 0; i < chances.length; i++) { if (x < chances[i]) return ids[i]; x -= chances[i]; } return ids[chances.length]; };
    const fixed = base.armor && G2.fixed[base.armor];
    const d = Object.create(base);
    d.wpn = wpn; d.gear = tier; d.dmg = w.dmg; d.pellets = w.pellets; d.snd = w.cls;
    d.vest = fixed ? fixed.vest[tier - 1] : roll(G2.vest[tier - 1], ['soft', 'steel', 'ceramic', 'none']);
    d.helmet = fixed ? fixed.helmet[tier - 1] : roll(G2.helmet[tier - 1], ['ach', 'riflehelm', 'nohelm']);
    // automatic weapons fire at their own rate in the type's bursts; others as fast as the type works them
    if (base.rof) {
      if (w.mode === 'auto') d.rof = 60 / w.rpm;
      else { d.rof = Math.max(base.rof, 60 / w.rpm); d.burst = [1, w.shell || w.cls === 'SNP' ? 1 : 2]; }
    }
    return d;
  },
  addEnemy(type, x, z, hpMult) {
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
      runner: !!def.civ && Math.random() < 0.3, home: { x, z }, walkTo: null, fleeT: 0, fake: false, fakeT: 0,
    };
    const w = !def.civ && G.WEAPONS[def.wpn];
    if (w && w.mag > 0 && !w.explosive) { e.magMax = w.mag; e.mag = Math.random() < 0.25 ? Math.max(1, Math.ceil(w.mag * (0.3 + Math.random() * 0.6))) : w.mag; }
    if (this.map) G.Level.resolve(this.map, e, 0.38 * def.scale); // (spots are cell centres: clear of the walls beside them)
    this.enemies.set(e.id, e);
    return e;
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
      const field = this.soundField(e.x, e.z);
      for (const o of this.enemies.values()) {
        if (!o.alert && !o.def.civ && o.pendingAlert < 0 && this.heardAt(field, o.x, o.z) < 12) o.pendingAlert = 0.4 + Math.random() * 0.6;
      }
    }
  },
  // Sound travels through the building, not through walls: distance in metres along walkable tiles from
  // the source, where a closed door adds 10 m (muffled) and walls stop it. Cached per source tile + door state.
  soundField(x, z) {
    const map = this.map, TS = G.Level.TS, W = map.W, H = map.H, t = map.t;
    const sx = G.U.clamp(Math.floor(x / TS), 0, W - 1), sz = G.U.clamp(Math.floor(z / TS), 0, H - 1);
    const key = sz * W + sx + '|' + (map.doorVer || 0);
    if (!this._sound || this._sound.map !== map) this._sound = { map, cache: new Map() };
    const hit = this._sound.cache.get(key);
    if (hit) return hit;
    // distances counted in cells (whole numbers, for the bucket queue), returned in metres by heardAt
    const MAXD = Math.round(60 / TS), DOOR = Math.round(10 / TS), dist = new Float32Array(W * H).fill(Infinity), buckets = [];
    const push = (i, d) => { if (d < dist[i] && d <= MAXD) { dist[i] = d; (buckets[d] || (buckets[d] = [])).push(i); } };
    push(sz * W + sx, 0);
    for (let d = 0; d <= MAXD; d++) {
      const b = buckets[d];
      if (!b) continue;
      for (const i of b) {
        if (dist[i] !== d) continue;
        const tx = i % W, tz = (i / W) | 0;
        for (const [ox, oz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nx = tx + ox, nz = tz + oz;
          if (nx < 0 || nz < 0 || nx >= W || nz >= H) continue;
          const j = nz * W + nx, v = t[j];
          if (v === 1) continue; // walls stop it (crates don't)
          let cost = 1;
          if (v === 3) { const dd = map.doorAt.get(j); if (dd && !dd.open) cost += DOOR; }
          push(j, d + cost);
        }
      }
    }
    if (this._sound.cache.size > 48) this._sound.cache.clear();
    this._sound.cache.set(key, dist);
    return dist;
  },
  heardAt(field, x, z) {
    const TS = G.Level.TS;
    return field[G.U.clamp(Math.floor(z / TS), 0, this.map.H - 1) * this.map.W + G.U.clamp(Math.floor(x / TS), 0, this.map.W - 1)] * TS;
  },
  hear(x, z, radius) {
    const field = this.soundField(x, z);
    for (const e of this.enemies.values()) {
      if (this.heardAt(field, e.x, e.z) > radius) continue;
      if (e.def.civ) { this.panic(e, { x, z }); continue; }
      if (e.state === 'normal') e.noise = { x, z };
      if (!e.alert && e.state === 'normal') e.pendingAlert = e.pendingAlert >= 0 ? e.pendingAlert : 0.2 + Math.random() * 0.5;
    }
  },
  // Rounds passing close by, or smacking into things next to them: suspects flinch into cover and shoot
  // worse. Suppression (e.sup, 0..1) builds with every round, more the closer it comes (a round past the ear
  // counts for a lot, one a couple of metres off for little), so sustained close fire pins them; it wears off
  // over a few seconds. It costs them up to 60% of their accuracy.
  suppress(f, to) {
    const ax = f[0], az = f[2], bx = to[0] - ax, bz = to[2] - az, len2 = bx * bx + bz * bz || 1;
    for (const e of this.enemies.values()) {
      if (e.def.civ || e.state !== 'normal') continue;
      const t = G.U.clamp(((e.x - ax) * bx + (e.z - az) * bz) / len2, 0, 1);
      const miss = Math.hypot(ax + bx * t - e.x, az + bz * t - e.z);
      if (miss >= 2.2) continue;
      e.sup = Math.min(1, (e.sup || 0) + 0.12 + 0.3 * (1 - miss / 2.2));
      e.suppressT = Math.max(e.suppressT, 1.2 + 2 * e.sup);
      // a burst is frightening, but not once per round: at most one morale hit every 0.35 s
      if (this.clock - (e.supAt || -9) > 0.35) { e.morale -= 0.06 * (e.def.steady || 1); e.supAt = this.clock; }
      this.alertEnemy(e, false);
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
      const [px, , pz] = p.st.p;
      const field = this.soundField(px, pz);
      for (const e of this.enemies.values()) {
        if (e.def.civ || e.alert || e.state !== 'normal') continue;
        if (this.heardAt(field, e.x, e.z) > r) continue;
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
    for (const c of map.cover) {
      const d = Math.hypot(c.x - e.x, c.z - e.z);
      if (d > 14) continue;
      const score = d - Math.hypot(c.x - from.x, c.z - from.z) * 0.35;
      if (score >= bs || L.los(map, from.x, 1.5, from.z, c.x, 0.75, c.z) || taken(c.x, c.z)) continue;
      best = { x: c.x, z: c.z, lean: 0 }; bs = score;
    }
    let tried = 0;
    for (const w of map.wallSpots) {
      const d = Math.hypot(w.x - e.x, w.z - e.z);
      if (d > 12 || tried > 40) continue;
      const fd = Math.hypot(w.x - from.x, w.z - from.z) || 1, score = d - fd * 0.35 + 1;
      if (score >= bs) continue;
      tried++;
      if (L.los(map, from.x, 1.5, from.z, w.x, 1.4, w.z) || taken(w.x, w.z)) continue;
      const nx = -(from.z - w.z) / fd, nz = (from.x - w.x) / fd;
      for (const side of [1, -1]) {
        const px = w.x + nx * side * 0.55, pz = w.z + nz * side * 0.55;
        if (L.tile(map, Math.floor(px / TS), Math.floor(pz / TS)) !== 0 || !this.leanClear(w.x, w.z, px, pz, 1.5) || !L.los(map, px, 1.5, pz, from.x, 1.4, from.z)) continue;
        best = { x: w.x, z: w.z, lean: side }; bs = score;
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
      if (!h.flow) h.flow = L.flow(this.map, [[Math.floor(h.x / L.TS), Math.floor(h.z / L.TS)]]);
      const step = d > 1.6 ? L.flowStep(this.map, h.flow, e.x, e.z) : null;
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
      e.peekT = e.peeking ? 0.6 + Math.random() * 1.1 : 2 + Math.random() * 3.5;
      if (!e.peeking && Math.random() < 0.15) e.relocate = true;
    }
    const look = e.threat;
    if (look) e.yaw += U.angDiff(e.yaw, Math.atan2(-(look.x - e.x), -(look.z - e.z))) * Math.min(1, dt * 4);
    e.crouch = h.lean ? false : !e.peeking;
    e.leanOut = e.peeking && h.lean ? h.lean : 0;
    return true;
  },
  setDoor(id, open, kicked) {
    const d = this.map && this.map.doors[id];
    if (!d || d.open === open) return;
    d.open = open;
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
    const field = this.soundField(d.x, d.z);
    for (const e of this.enemies.values()) {
      const hd = this.heardAt(field, e.x, e.z);
      if (hd > 16) continue;
      if (e.def.civ) { this.panic(e, { x: d.x, z: d.z }); continue; }
      if (e.state !== 'normal') continue;
      if (hd <= 6) {
        if (!e.alert) { this.alertEnemy(e, false); e.surprisedT = 1.2 + Math.random() * 0.6; }
        else e.cool = Math.max(e.cool, 0.6);
      } else if (!e.alert) e.pendingAlert = e.pendingAlert >= 0 ? e.pendingAlert : 0.3 + Math.random() * 0.5;
    }
  },
  remaining(civ = null) { let n = 0; for (const e of this.enemies.values()) if (e.state !== 'cuffed' && (civ === null || !!e.def.civ === civ)) n++; return n; },
  openBodies() { let n = 0; for (const b of this.bodies.values()) if (!b.secured) n++; return n; },
  openEvidence() { let n = 0; for (const v of this.evidence) if (!v.secured && !v.taken) n++; return n; },
  // Objectives. "Bring Order to Chaos" (required): every suspect zip-tied or dead. "Rescue All of the
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
    const [px, py, pz] = p.st.p, ey = py + (p.st.cr ? 1.0 : 1.6), map = this.map, L = G.Level;
    const officers = [...this.players.values()].filter((q) => q.st && !q.st.dn && !q.st.dd);
    let complied = 0;
    for (const e of this.enemies.values()) {
      if (!(e.state === 'normal' || e.state === 'cower' || e.state === 'flee' || e.state === 'hide')) continue;
      const d = Math.hypot(e.x - px, e.z - pz);
      const eh = 1.4 * e.def.scale;
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
          + 0.08 * Math.min(3, e.shouts) + 0.08 * Math.max(0, seen - 1) - (d > 10 ? 0.1 : 0)
          - Math.max(0, e.morale - 0.5) * 0.8 - (e.def.hunt && e.drawn ? 0.15 : 0);
        chance = e.def.comply ? G.U.clamp(chance, 0, e.collapsed ? 0.97 : 0.92) : 0; // never a sure thing
        // Braver together: with armed friends around who can see them, almost nobody gives up. And anyone
        // who's already been shooting at you, or who faked a surrender and went back for a weapon, is past
        // being talked down (unless they're breaking or badly weakened). Bleeding out on the floor, friends
        // count for little.
        const weak = e.collapsed ? 1 : G.U.clamp(1 - (e.str == null ? 1 : e.str) / 0.6, 0, 1);
        chance *= G.U.lerp([1, 0.3, 0.08, 0.03][Math.min(3, this.allies(e))], 1, weak * 0.85);
        const shaken = e.broken || e.collapsed || (e.str != null && e.str < 0.5);
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
    this.hear(px, pz, 14); // anyone else nearby now knows police are inside
    G.Net.broadcast({ t: 'shout', id: from, n: complied });
  },
  // windows broken (by a round or a blast): for everyone, and heard round about
  breakGlass(ids, p) {
    const ws = this.map && this.map.windows;
    if (!ws) return;
    const fresh = ids.filter((id) => Number.isInteger(id) && ws[id] && !ws[id].broken).slice(0, 20);
    if (!fresh.length) return;
    for (const id of fresh) { ws[id].broken = true; this.glassBroken.add(id); this.hear(ws[id].x, ws[id].z, 16); }
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
    const eh = 1.4 * e.def.scale;
    for (const o of this.enemies.values()) {
      if (o === e || o.def.civ || !o.armed || o.state !== 'normal' || Math.hypot(o.x - e.x, o.z - e.z) > 9) continue;
      if (G.Level.los(this.map, o.x, 1.4 * o.def.scale, o.z, e.x, eh, e.z)) n++;
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
    const v = { i: this.evidence.length, wpn: e.def.wpn, x: e.x + Math.cos(a) * 0.5, z: e.z + Math.sin(a) * 0.5, owner: e.id, secured: false, taken: false };
    G.Level.resolve(this.map, v, 0.15);
    this.evidence.push(v);
    G.Net.broadcast({ t: 'evid', i: v.i, wpn: v.wpn, x: Math.round(v.x * 100) / 100, z: Math.round(v.z * 100) / 100 });
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
  cuff(eid, p, from) {
    const e = this.enemies.get(eid);
    if (!e) {
      const b = this.bodies.get(eid);
      if (!b || b.secured || Math.hypot(b.x - p.st.p[0], b.z - p.st.p[2]) > 2.6) return;
      b.secured = true;
      this.report.bodies++;
      G.Net.broadcast({ t: 'cuffed', e: eid, by: from, cr: b.civ ? 0 : this.carrierShare(b.def || G.ENEMIES[b.type]), civ: b.civ, ty: b.type, body: true });
      this.checkClear();
      return;
    }
    if (!e || !(e.state === 'surrender' || (e.def.civ && (e.state === 'cower' || e.state === 'flee')))) return;
    if (Math.hypot(e.x - p.st.p[0], e.z - p.st.p[2]) > 2.6) return;
    e.state = 'cuffed'; e.armed = false; e.fake = false;
    const civ = !!e.def.civ;
    const cr = civ ? 200 + 40 * this.level : Math.round(e.def.cr * 2.5 * (1 + 0.08 * (this.level - 1))) + this.carrierShare(e.def);
    if (civ) this.report.rescued++; else this.report.arrests++;
    G.Net.broadcast({ t: 'cuffed', e: e.id, by: from, cr, civ, ty: e.type });
    this.checkClear();
  },
  // ---------------------------------------------------------------- suspects' injuries
  // Simpler than an officer's body, the same idea: a wound can bleed (heavy, or light that clots in half a
  // minute), break an arm (their aim goes) or a leg (they limp), or puncture a lung (both). Bleeding drains
  // their health and their nerve, and can kill them (credited to whoever shot them). Restraining someone
  // stops it: you treat them as you cuff them.
  injure(e, zone, central, through, side) {
    if (!(through > 0.2)) return;
    const part = G.Med.partOf(zone, side === 'L' || side === 'R' ? side : null), person = e.maxHp * (100 / e.def.hp);
    const r = Math.random() / through;
    if (r < (central ? 0.45 : 0.15)) e.bleedH = (e.bleedH || 0) + person * 0.02; // a standard person gone in ~50 s
    else if (r < (central ? 0.9 : 0.7)) { e.bleedL = (e.bleedL || 0) + person * 0.004; e.clotT = 0; }
    if (G.Med.isLimb(part) && Math.random() < (central ? 0.4 : 0.15) * through) { if (part.startsWith('leg')) e.legs = (e.legs || 0) + 1; else e.arms = (e.arms || 0) + 1; }
    if (part === 'thorax' && central && Math.random() < 0.35 * through) e.lung = true;
  },
  // bleeding, every tick; true when it killed them
  injuryTick(e, dt) {
    if (e.state === 'cuffed') { e.bleedH = e.bleedL = 0; return false; }
    if (e.bleedL) { e.clotT = (e.clotT || 0) + dt; if (e.clotT > 30) { e.bleedL = 0; e.clotT = 0; } }
    const b = (e.bleedH || 0) + (e.bleedL || 0);
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
    const tx = st.p[0], ty = st.p[1] + (st.cr ? 0.75 : 1.2), tz = st.p[2], s = e.str == null ? 1 : e.str;
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
    // the wounds, for injuries (where they landed, through the middle, how much got through armour)
    if (Array.isArray(m.w)) for (const w of m.w.slice(0, 12)) if (Array.isArray(w)) this.injure(e, String(w[0]), !!w[1], +w[2] || 0, w[3]);
    // wounds are a share of a standard person's life (tougher types have proportionally more), so lethality
    // doesn't fall as health scales up with the level and the squad; an unarmoured headshot kills outright
    const person = e.maxHp * (100 / e.def.hp);
    const d = m.k ? e.hp + 1 : Math.min(5000, (+m.d || 0) + Math.min(5, Math.max(0, +m.f || 0)) * person);
    if (!(d > 0)) return;
    e.hp -= d;
    if (!m.bo) { e.lastHit = from; e.hitState = e.state; } // bleeding out is judged by what they were doing when shot
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
          const n = this.addEnemy('grunt', e.x + Math.cos(a) * 2.5, e.z + Math.sin(a) * 2.5, 1 + 0.1 * this.level);
          G.Level.resolve(this.map, n, 0.4);
          this.alertEnemy(n, false);
        }
        G.Net.broadcast({ t: 'chat', id: null, m: 'The Kingpin is calling for backup!' });
      }
    }
    if (e.hp <= 0) {
      this.dropEvidence(e);
      this.enemies.delete(e.id);
      this.bodies.set(e.id, { id: e.id, type: e.type, def: e.def, x: e.x, z: e.z, yaw: e.yaw, civ: !!e.def.civ, secured: false });
      // watching a friend go down rattles everyone nearby
      for (const o of this.enemies.values()) if (!o.def.civ && o.state === 'normal' && Math.hypot(o.x - e.x, o.z - e.z) < 15) o.morale -= 0.2 * (o.def.steady || 1);
      let cr, why = null;
      if (e.def.civ) { cr = -(400 + 50 * this.level); why = 'civ'; this.report.civKilled++; }
      else if ((m.bo ? e.hitState || e.state : e.state) !== 'normal') { cr = -Math.round(e.def.cr * 2); why = 'unauth'; this.report.unauth++; }
      else { cr = Math.round(e.def.cr * 0.25 * (1 + 0.08 * (this.level - 1))); this.report.kills++; } // lethal force pays least
      G.Net.broadcast({ t: 'kill', e: e.id, by: from, cr, h: !!m.h, ty: e.type, why });
      this.checkClear();
    }
  },

  // Apartments cleared: an officer has been inside, and no suspect in it is still a threat (armed and free).
  unitsCleared() {
    const ua = this.map && this.map.unitAt;
    if (!ua) return 0;
    const TS = G.Level.TS, W = this.map.W, at = (x, z) => ua[Math.floor(z / TS) * W + Math.floor(x / TS)];
    for (const p of this.players.values()) if (p.st && !p.st.dd) { const u = at(p.st.p[0], p.st.p[2]); if (u >= 0) this.unitsSeen.add(u); }
    const hot = new Set();
    for (const e of this.enemies.values()) if (!e.def.civ && e.state !== 'cuffed' && e.state !== 'surrender') { const u = at(e.x, e.z); if (u >= 0) hot.add(u); }
    let n = 0;
    for (const u of this.unitsSeen) if (!hot.has(u)) n++;
    return n;
  },
  update(dt) {
    if (this.phase !== 'level' || !this.map) return;
    this.clock = (this.clock || 0) + dt;
    const map = this.map, L = G.Level;
    const all = [...this.players.values()].filter((p) => p.st);
    const alive = all.filter((p) => !p.st.dn && !p.st.dd);

    this.flowT -= dt;
    if (this.flowT <= 0) {
      this.flowT = 0.5;
      this.flow = alive.length ? L.flow(map, alive.map((p) => [Math.floor(p.st.p[0] / L.TS), Math.floor(p.st.p[2] / L.TS)])) : null;
    }

    this.nadeT -= dt;
    this.noiseT = (this.noiseT || 0) - dt;
    if (this.noiseT <= 0) { this.noiseT = 0.25; this.footsteps(alive); }
    for (const e of this.enemies.values()) this.think(e, dt, alive);

    // keep enemies from stacking
    const es = [...this.enemies.values()];
    for (let i = 0; i < es.length; i++) for (let j = i + 1; j < es.length; j++) {
      const a = es[i], b = es[j], dx = b.x - a.x, dz = b.z - a.z, d = Math.hypot(dx, dz), min = 0.45 * (a.def.scale + b.def.scale);
      if (d < min && d > 1e-4) {
        const push = (min - d) / 2;
        a.x -= (dx / d) * push; a.z -= (dz / d) * push; b.x += (dx / d) * push; b.z += (dz / d) * push;
      }
    }

    // the vote to leave: everyone still alive (downed officers vote too)
    const living = all.filter((p) => !p.st.dd);
    for (const id of [...this.extract.votes]) if (!living.some((p) => p.id === id)) this.extract.votes.delete(id);
    if (this.extract.active && living.length && living.every((p) => this.extract.votes.has(p.id))) {
      this.report.allRescued = this.allRescued();
      this.toShop();
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
        e.push([en.id, en.type, r2(en.x), r2(en.z), r2(en.yaw), Math.max(1, Math.round((en.hp / en.maxHp) * 100)), en.aiming ? en.tgt : 0, en.alert ? 1 : 0, en.crouch ? 1 : 0, en.leanOut || 0, en.armed ? (en.drawn ? 2 : 1) : 0, STATE_CODE[en.state] || 0, en.surprisedT > 0 ? 1 : 0, en.doorWait > 0 ? 1 : 0, en.def.civ ? 0 : `${en.def.wpn}|${en.def.vest}|${en.def.helmet}`, ((en.bleedH || en.bleedL) ? 1 : 0) | (en.legs ? 2 : 0) | (en.reloadT > 0 ? 4 : 0), Math.round((en.str == null ? 1 : en.str) * 100)]);
      }
      const p = {};
      for (const pl of all) p[pl.id] = pl.st;
      G.Net.broadcast({ t: 'snap', e, p, x: [this.extract.active ? 1 : 0, this.extract.votes.size, all.filter((q) => !q.st.dd).length, this.report.civKilled || 0, all.filter((q) => this.extract.votes.has(q.id)).map((q) => q.id), this.unitsCleared()], n: this.remaining(false), c: this.remaining(true), b: this.openBodies(), w: this.openEvidence() });
    }
  },

  think(e, dt, alive) {
    const def = e.def, map = this.map, L = G.Level, U = G.U, s = def.scale;
    e.complyCd = Math.max(0, e.complyCd - dt);
    e.suppressT = Math.max(0, e.suppressT - dt);
    e.sup = Math.max(0, (e.sup || 0) - dt * 0.3); e.shock = Math.max(0, (e.shock || 0) - dt * 0.35); // (rattled, and getting over it)
    if (e.kick) e.kick *= Math.exp(-this.kickBack(e) * dt); // bringing the gun back down
    if (this.injuryTick(e, dt)) return; // bled out
    e.str = this.strength(e);
    e.collapsed = e.str < this.COLLAPSE && e.state !== 'cuffed';
    if (this.obedient(e) && this.obey(e, dt)) return;
    if (def.civ) return this.thinkCiv(e, dt);
    if (e.state === 'cuffed') return;
    if (e.state === 'surrender') return this.thinkSurrendered(e, dt, alive);
    this.reloadTick(e, dt);
    if (e.pendingAlert >= 0) { e.pendingAlert -= dt; if (e.pendingAlert < 0) this.alertEnemy(e, false, true); }
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
      const ey = Math.min(1.6 * s, 2.4);
      for (const p of alive) {
        const [px, py, pz] = p.st.p;
        const d = Math.hypot(px - e.x, pz - e.z);
        // (outdoors at night they can't pick you out past `night` metres, unless your light or laser gives you away)
        if (d > (map.theme.night && !(p.st.tl & 3) ? map.theme.night : 75)) continue;
        const lx = e.cover && e.cover.lean ? e.cover.px : e.x, lz = e.cover && e.cover.lean ? e.cover.pz : e.z;
        const [hx, hz] = this.headXZ(p.st);
        const k = L.see(map, lx, ey, lz, hx, py + (p.st.cr ? 0.95 : 1.5), hz), vis = k > 0; // (through a window: k < 1)
        const score = d + (vis ? 0 : 40) + (k < 1 && vis ? 8 : 0);
        if (score < bs) { bs = score; best = p; bvis = vis; bd = d; e.seeK = k; }
      }
      e.tgt = best ? best.id : null; e.canSee = bvis; e.tgtD = bd;
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
          const rate = (1.7 - e.tgtD / (def.range * 1.4)) * (st.cr ? 0.7 : 1) * 1.3 * (e.suspicious ? 1.8 : 1) * (e.seeK == null ? 1 : e.seeK); // slower through glass
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
          e.idleT = 2 + Math.random() * 4; e.idleYaw = e.yaw + (Math.random() - 0.5) * 2.6;
          const a = Math.random() * Math.PI * 2, r = Math.random() * 2.5;
          e.walkTo = Math.random() < 0.45 ? { x: e.home.x + Math.cos(a) * r, z: e.home.z + Math.sin(a) * r } : null;
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
      e.crouch = false; e.aiming = false;
      return;
    }

    // --- alert: fight or hunt
    let mx = 0, mz = 0, sp = 1;
    const towards = (tx, tz) => { const dx = tx - e.x, dz = tz - e.z, d = Math.hypot(dx, dz) || 1; mx = dx / d; mz = dz / d; };
    const huntStep = () => {
      if (!this.flow) return;
      const step = L.flowStep(map, this.flow, e.x, e.z);
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
      e.lastSeen = { x: st.p[0], z: st.p[2] };
      const dx = st.p[0] - e.x, dz = st.p[2] - e.z, d = Math.hypot(dx, dz) || 1;
      const toYaw = Math.atan2(-dx, -dz);
      e.yaw += U.angDiff(e.yaw, toYaw) * Math.min(1, dt * 8);

      // Cover: move to a spot with a crate between us and the target, crouch, pop up to shoot.
      if (usesCover && !e.cover && e.coverT <= 0) {
        e.coverT = 3 + Math.random() * 3;
        e.cover = this.findCover(e, st);
        e.coverStuck = 0;
        // path there on a flow field seeded at the cover tile (routes through doorways)
        if (e.cover) e.coverFlow = L.flow(map, [[Math.floor(e.cover.x / L.TS), Math.floor(e.cover.z / L.TS)]]);
      }
      if (e.cover) {
        const cd = Math.hypot(e.cover.x - e.x, e.cover.z - e.z);
        if (cd > 0.25) {
          const step = cd > 1.6 && e.coverFlow ? L.flowStep(map, e.coverFlow, e.x, e.z) : null;
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
      if (d < def.range && e.drawT <= 0) {
        e.cool -= dt;
        const ready = def.aimTime ? e.aiming || e.cool <= 0 : e.cool <= 0;
        if (e.inCover && ready && !e.peek) { e.peek = true; e.peekT = 0.35; }
        if (e.peek && e.peekT > 0) e.peekT -= dt;
        const canFire = !e.inCover || (e.peek && e.peekT <= 0);
        if (canFire) {
          if (def.aimTime) {
            if (!e.aiming && e.cool <= 0) { e.aiming = true; e.aimT = def.aimTime; }
            if (e.aiming) {
              sp = 0;
              e.aimT -= dt;
              if (e.aimT <= 0 && this.onTarget(e, st, dt)) { this.fire(e, p); e.aiming = false; e.peek = false; e.cool = U.rf(def.pause[0], def.pause[1]); }
            }
          } else if (e.cool <= 0 && this.onTarget(e, st, dt)) {
            if (e.burstLeft <= 0) e.burstLeft = def.burst[0] + Math.floor(Math.random() * (def.burst[1] - def.burst[0] + 1));
            this.fire(e, p);
            e.burstLeft--;
            if (e.burstLeft > 0) e.cool = def.rof;
            else { e.cool = U.rf(def.pause[0], def.pause[1]); e.peek = false; }
          }
        }
      }
      // flush a target that's ducked behind cover we can't shoot through
      if (st.cr && d > 5 && d < 20 && !L.los(map, e.x, 1.35 * s, e.z, st.p[0], st.p[1] + 0.75, st.p[2])) this.tryNade(e, st.p[0], st.p[2]);
    } else {
      e.aiming = false; e.peek = false; e.leanOut = 0;
      // just lost sight of them (round a door, behind its leaf): about half keep firing for a moment at where
      // they were, blind. Rounds rarely land, and only if you're still there and in the open.
      if (e.lostT === 0) e.blind = !def.aimTime && Math.random() < 0.5;
      e.lostT += dt;
      if (e.blind && st && e.drawn && e.lastSeen && e.lostT < 1.1 && e.tgtD < def.range) {
        e.cool -= dt;
        if (e.cool <= 0) { this.fire(e, p, true); e.cool = U.rf(0.15, 0.4); }
      } else e.cool = Math.max(e.cool, 0.6);
      // lost sight: lob a grenade where they were last seen
      if (e.lastSeen && e.lostT > 2 && e.lostT < 12) {
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
    const corner = e.cover && e.cover.lean;
    if (st && e.canSee) e.holding = false;
    e.crouch = (e.inCover && !e.peek && !corner) || (e.holding && !mx && !mz && !e.inCover) || (e.reloadT > 0 && e.inCover && !corner);
    e.leanOut = e.inCover && e.peek && corner ? e.cover.lean : 0;

    if (mx || mz) this.moveEntity(e, mx, mz, def.speed * sp, dt);
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
      const step = this.flow ? L.flowAway(this.map, this.flow, e.x, e.z) : null;
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
    const tx = Math.floor((e.x + mx * 0.9) / L.TS), tz = Math.floor((e.z + mz * 0.9) / L.TS);
    if (L.tile(map, tx, tz) === 3) {
      const d = map.doorAt.get(tz * map.W + tx);
      if (d && !d.open) { this.setDoor(d.id, true); e.doorWait = 0.5; return; }
    }
    if (e.collapsed) return; // legs gone: they're on the floor
    speed *= this.injSpeed(e) * (e.str == null || e.str >= 0.6 ? 1 : 0.3 + 0.7 * e.str / 0.6); // a broken leg limps; blood loss slows
    e.x += mx * speed * dt; e.z += mz * speed * dt;
    L.resolve(map, e, 0.38 * e.def.scale);
  },

  // Someone on their knees (surrendered, or a cowering civilian) does what the police tell them.
  obedient(e) { return e.state === 'surrender' || (e.def.civ && e.state === 'cower'); },
  obey(e, dt) {
    if (e.dragTo) { // being pulled back by an officer
      const dx = e.dragTo.x - e.x, dz = e.dragTo.z - e.z, d = Math.hypot(dx, dz), st = Math.min(d, 1.3 * dt);
      const ox = e.x, oz = e.z;
      if (d > 0.02) { e.x += (dx / d) * st; e.z += (dz / d) * st; G.Level.resolve(this.map, e, 0.3); }
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
      const a = Math.random() * Math.PI * 2, r = Math.random() * 2.5;
      e.walkTo = Math.random() < 0.55 ? { x: e.home.x + Math.cos(a) * r, z: e.home.z + Math.sin(a) * r } : null;
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
    for (const c of map.cover) {
      const d = Math.hypot(c.x - e.x, c.z - e.z);
      if (d > 12) continue;
      const dt = Math.hypot(c.x - st.p[0], c.z - st.p[2]);
      if (dt < 4 || dt > def.range * 0.9) continue;
      const score = d + Math.abs(dt - def.pref) * 0.4;
      if (score >= bs || !this.coverProtects(c, st)) continue;
      let claimed = false;
      for (const o of this.enemies.values()) if (o !== e && o.cover && Math.hypot(o.cover.x - c.x, o.cover.z - c.z) < 1.2) { claimed = true; break; }
      if (claimed) continue;
      if (!L.los(map, c.x, 1.6 * def.scale, c.z, st.p[0], st.p[1] + 1.2, st.p[2])) continue; // can shoot when peeking
      best = c; bs = score;
    }
    // Corners: stand hidden beside a wall edge, lean out sideways to shoot.
    const ey = 1.6 * def.scale, ty = st.p[1] + 1.4;
    let tried = 0;
    for (const w of map.wallSpots) {
      const d = Math.hypot(w.x - e.x, w.z - e.z);
      if (d > 10 || tried > 30) continue;
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
        if (L.tile(map, Math.floor(px / L.TS), Math.floor(pz / L.TS)) !== 0) continue;
        if (!this.leanClear(w.x, w.z, px, pz, ey)) continue; // (round the edge, not through a door jamb or a thin wall)
        if (!L.los(map, px, ey, pz, st.p[0], ty, st.p[2])) continue;
        best = { x: w.x, z: w.z, lean: side, px, pz }; bs = score;
        break;
      }
    }
    return best;
  },
  coverValid(c, st, def) {
    if (!c.lean) return this.coverProtects(c, st);
    const L = G.Level, map = this.map, ey = 1.6 * def.scale, ty = st.p[1] + 1.4;
    return !L.los(map, c.x, ey, c.z, st.p[0], ty, st.p[2]) && this.leanClear(c.x, c.z, c.px, c.pz, ey) && L.los(map, c.px, ey, c.pz, st.p[0], ty, st.p[2]);
  },
  // Can someone standing at (x, z) actually lean out to (px, pz)? Nothing solid between: a corner's edge, not a
  // door jamb, a door leaf or a thin wall to the next room (at chest and at eye height; and the way the head
  // goes, a little further out still)
  leanClear(x, z, px, pz, ey) {
    const L = G.Level, map = this.map, ox = px + (px - x) * 0.3, oz = pz + (pz - z) * 0.3;
    return L.los(map, x, 1.1, z, px, 1.1, pz) && L.los(map, x, ey, z, px, ey, pz) && L.los(map, x, ey, z, ox, ey, oz);
  },

  tryNade(e, tx, tz) {
    if (!e.def.nades || e.nadeT > 0 || this.nadeT > 0 || this.level < 2) return;
    e.nadeT = 14 + Math.random() * 8;
    this.nadeT = 5;
    const s = e.def.scale, p = [e.x, 1.6 * s, e.z];
    const dx = tx - e.x, dz = tz - e.z, d = Math.hypot(dx, dz);
    const T = G.U.clamp(d / 11, 0.6, 1.5), g = 18;
    const v = [dx / T, (0.3 - p[1] + 0.5 * g * T * T) / T, dz / T];
    const r2 = (x) => Math.round(x * 100) / 100;
    G.Net.broadcast({ t: 'nade', id: 'enemy', e: e.id, p: p.map(r2), v: v.map(r2), fuse: 2.6, en: 1 });
  },
  enemyBoom(p) {
    const r2 = (x) => Math.round(x * 100) / 100;
    this.hear(p.x, p.z, 20);
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
    let from = [bx + fx * 0.5 * s, (e.collapsed ? 0.45 : 1.35) * s, bz + fz * 0.5 * s]; // (down on the floor, shooting up)
    // standing against a door or wall: the muzzle must not poke through it
    if (!L.los(map, bx, from[1], bz, from[0], from[1], from[2])) from = [bx, from[1], bz];
    // aim at the exposed part: a leaning player shows head and shoulder, not centre mass
    const [hx, hz] = this.headXZ(st), leaning = Math.abs(st.ln || 0) > 0.3;
    let tx = hx, ty = st.p[1] + (st.cr ? 0.75 : 1.2) + (leaning ? 0.3 : 0) + (leaning ? 0 : up * (st.cr ? 0.25 : 0.38)), tz = hz;
    const realY = ty;
    if (blind) { tx = e.lastSeen.x + (Math.random() - 0.5) * 1.4; tz = e.lastSeen.z + (Math.random() - 0.5) * 1.4; ty = 0.8 + Math.random() * 0.9; }
    const dx = tx - from[0], dy = ty - from[1], dz = tz - from[2], d = Math.hypot(dx, dy, dz);
    // a bit worse up close, much worse at range: at their weapon's range they hit about a sixth as often
    const distF = 0.9 * G.U.clamp(0.95 - 0.8 * Math.pow(d / def.range, 1.2), 0.12, 0.95);
    const moveF = st.mv > 3 ? 0.72 : st.mv > 0.5 ? 0.88 : 1;
    const chance = (blind ? 0.15 : 1) * (1 - 0.2 * up) * this.injAim(e) * def.acc * distF * moveF * (st.cr ? 0.8 : 1) * this.accMult * (1 - 0.6 * (e.sup || 0)) * (1 - 0.5 * Math.min(1, e.shock || 0)) * (e.collapsed ? 0.4 : 1) * (e.str != null && e.str < this.TWO_HAND ? 0.7 : 1) * (1 - Math.min(0.5, kickNow / 16)) * (e.broken ? (e.fleeT > 0 ? 0.4 : 0.8) : 1) * this.dazzle(e, st);
    // anything solid between muzzle and target stops the round: a closed door right in front of the player included
    // a blind round can only find someone still standing where they were, with nothing in the way
    const thru = (ax, ay, az, bx, by, bz) => { const ddx = bx - ax, ddy = by - ay, ddz = bz - az, dd = Math.hypot(ddx, ddy, ddz) || 1; const h = L.raycast(map, ax, ay, az, ddx / dd, ddy / dd, ddz / dd, dd, { glass: true }); return { clear: h.t >= dd - 0.05, glass: h.glass || [] }; };
    const path = blind ? thru(from[0], from[1], from[2], hx, realY, hz) : thru(from[0], from[1], from[2], tx, ty, tz);
    const blocked = blind ? Math.hypot(hx - e.lastSeen.x, hz - e.lastSeen.z) > 1.2 || !path.clear : !path.clear;
    const intact = path.glass.some(([id]) => map.windows && map.windows[id] && !map.windows[id].broken);
    const wounds = [];
    if (!blocked) for (let i = 0; i < def.pellets; i++) if (Math.random() < chance * (intact ? 0.75 : 1)) wounds.push(this.hitZone(st, def, up));
    if (!blocked && path.glass.length) this.breakGlass(path.glass.map(([id]) => id), from);
    let to;
    if (wounds.length) to = [tx + (Math.random() - 0.5) * 0.3, ty + (Math.random() - 0.5) * 0.3, tz + (Math.random() - 0.5) * 0.3];
    else {
      // miss: aim off to the side, then extend into the world
      const off = 0.6 + Math.random() * 1.2, side = Math.random() < 0.5 ? -1 : 1;
      const mxp = tx + (-dz / d) * off * side, myp = ty + (Math.random() - 0.4) * 1.2, mzp = tz + (dx / d) * off * side;
      const ddx = mxp - from[0], ddy = myp - from[1], ddz = mzp - from[2], dd = Math.hypot(ddx, ddy, ddz);
      const h = L.raycast(map, from[0], from[1], from[2], ddx / dd, ddy / dd, ddz / dd, 90, { glass: true });
      to = [from[0] + (ddx / dd) * h.t, from[1] + (ddy / dd) * h.t, from[2] + (ddz / dd) * h.t];
      if (h.glass && h.glass.length) this.breakGlass(h.glass.map(([id]) => id), from); // a miss through a window takes it out
    }
    const r2 = (v) => Math.round(v * 100) / 100;
    G.Net.broadcast({ t: 'eshot', e: e.id, ty: e.type, w: def.wpn, f: from.map(r2), to: to.map(r2), tg: p.id, d: wounds.length, hz: wounds });
  },
  // Where a round that hits an officer lands: [zone, central]. A leaning officer shows head and shoulder, a
  // crouched one less leg; a marksman taking an aimed shot goes for the head and lands more centrally. A head
  // hit is 'face' (below a helmet's brim) more often than not, since they're shooting at the front of you.
  // up: how far their aim has walked from your body to your head (0 .. 1, see fire).
  hitZone(st, def, up = 0) {
    const lean = Math.abs(st.ln || 0) > 0.3;
    const W = lean ? { head: 0.4, chest: 0.3, uarm: 0.2, farm: 0.1 }
      : st.cr ? { head: 0.14, chest: 0.4, abdomen: 0.14, uarm: 0.14, farm: 0.1, thigh: 0.08 }
      : { head: 0.1, chest: 0.34, abdomen: 0.2, uarm: 0.1, farm: 0.07, thigh: 0.14, shin: 0.05 };
    if (def.aimTime) W.head *= 2.5;
    if (!lean) { // centre mass first (head hits rare, legs more likely), then the head (about 35-45% of hits)
      W.head *= 0.4 + 4.6 * up;
      for (const z of ['thigh', 'shin']) if (W[z]) W[z] *= 1 - 0.6 * up;
    }
    let x = Math.random() * Object.values(W).reduce((a, b) => a + b, 0), zone = 'chest';
    for (const [z, w] of Object.entries(W)) { if (x < w) { zone = z; break; } x -= w; }
    if (zone === 'head') zone = Math.random() < 0.6 ? 'face' : 'head';
    return [zone, Math.random() < (def.aimTime ? 0.7 : 0.45) ? 1 : 0, Math.random() < 0.5 ? 'L' : 'R'];
  },
};
