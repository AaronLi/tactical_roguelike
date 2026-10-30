'use strict';
// where a door stops being a kick and starts being a push: aim below this (m) to kick, above to open
const KICK_H = 1.3;
// The local player: input, movement, weapons, damage, revive/down state.
G.Me = {
  keys: {},
  // CQB pace (m/s): normal walk; weapon lowered (Space) to move quicker; steadied (Shift) to creep and
  // hold the gun still; crouch-walk
  SPEED: { walk: 1.9, low: 3.0, steady: 1.4, crouch: 1.3, prone: 0.55 },
  PRONE_T: 0.8, // getting down onto your front, or back up (s): no shooting meanwhile
  LEAN: 0.38, // metres the head moves sideways at full lean
  mouse: { l: false, r: false },
  pos: null,
  vel: null,
  yaw: 0,
  pitch: 0,

  // ------------------------------------------------------------- run state
  newRun() {
    this.credits = 500;
    this.stk = {}; // (the stickers you've found: yours for the run, js/stickers.js)
    G.Gear.starter(this); // kit, pockets and locker (js/gear.js)
    this.weapons = {}; this.setSidearm('p9'); // just a sidearm: the first primary comes from the shop (G.Game's picker: the P9, TX22 or derringer)
    this.sidearmChosen = false;
    this.stash = G.Gear.stashProxy(this); // weapon parts owned but not fitted: items, read as { partId: count }
    this.stats = { kills: 0, dmg: 0, hs: 0, downs: 0, revives: 0 };
  },
  // the sidearm you start a run with (G.STARTERS), loaded with tracers, and two spare loads of them in the small
  // pockets (in place of the last one's)
  setSidearm(id) {
    const w = this.makeWeapon(id), am = G.ammoOk(G.calOf(w.def), 'tracer');
    w.ammo = am; w.tube = w.tube.map(() => am); if (w.chamber) w.chamber = am;
    this.weapons.s = w; this.slot = 's';
    for (const g of [this.pockets[2], this.pockets[3]]) {
      if (!g) continue;
      for (const pl of g.items.slice()) if (pl.it.k === 'mag' || pl.it.k === 'ammo') G.Gear.removeFrom(g, pl.it);
      const it = G.Gear.ammoItem(w.def, G.Gear.ammoFor(w.def).kind === 'mag' ? null : 12, am); // (loose rounds: a dozen a box)
      const sp = G.Gear.findSpot(g, it);
      if (sp) G.Gear.put(g, it, sp.x, sp.y, sp.rot); else if (!G.Gear.stow(this, it)) break; // (too big for the pocket: wherever it goes)
    }
    this.sidearmChosen = true;
  },
  // medkits and grenades are items in your pouches and pockets
  get meds() { return this.kit ? G.Gear.medCount(this) : 0; },
  get nades() { return this.kit ? G.Gear.count(this, 'frag') : 0; },
  // condition of what covers your chest and head (for the HUD)
  vestCond() { return G.Gear.cond(G.Gear.piece(this, 'chest')); },
  helmCond() { return G.Gear.cond(this.kit.helmet); },
  maxHp() { return 100; },
  maxNades() { return 3; },
  magSize(def) { return def.mag; },
  reserveMax(def) { return def.reserve; },
  // a weapon as built: def is the compiled build (stats changed by its parts), see js/parts.js
  makeWeapon(id, build) {
    const def = G.Gunsmith.compile(id, build);
    // ammo: the type of round in it (a magazine holds one type); a gun loaded a round at a time keeps the
    // order in its tube (the last one in is the next one fired)
    const w = { def, sup: def.sup, mag: def.mag, ammo: G.ballFor(G.calOf(def)), fm: (def.modes || [def.mode])[0] }; // fm: where its selector is
    w.tube = Array(w.mag).fill(w.ammo); // every gun: its rounds in order (a magazine's own stack, when it has one in)
    w.chamber = G.chambered(def) ? w.ammo : null; // and the round in the chamber (G.chambered)
    // reserve: the rounds in the magazines and boxes you carry for it
    Object.defineProperty(w, 'reserve', { get: () => (G.Me.kit ? G.Gear.rounds(G.Me, w.def) : 0) });
    return w;
  },
  // the host handed us the case's weapon (after we put ours in): it replaces ours in that slot
  // something you picked up, from the host: onto you (no room after all: put back down)
  lootGot(packed, x, z) {
    const Gr = G.Gear, it = Gr.unpack(packed), name = G.Loot.name(packed);
    let ok = false;
    if (it.k === 'gun') { // into your hands if that slot's free, else a backpack
      const slot = it.w.def.slot;
      if (!this.weapons[slot]) { this.weapons[slot] = it.w; ok = true; if (G.R.vm && this.cur() === it.w) G.R.setViewmodel(it.w.def); }
      else ok = !!Gr.place(Gr.body(this).filter((g) => g.pack), it);
    } else if (Gr.isGear(it) && it.k !== 'plate' && it.k !== 'face' && !this.kit[it.k]) { this.kit[it.k] = it; ok = true; } // worn, if that's free
    else if (it.k === 'plate' && this.kit.carrier && Gr.defOf(this.kit.carrier).plate && !this.kit.carrier.plate) { this.kit.carrier.plate = it; ok = true; }
    else if (it.k === 'face') { if (this.kit.helmet && Gr.defOf(this.kit.helmet).face && !this.kit.helmet.face) { this.kit.helmet.face = it; ok = true; } else ok = Gr.stow(this, it); }
    else if (it.k === 'pouch') ok = !!Gr.place(Gr.molles(this), it) || Gr.stow(this, it); // a pouch: straight onto your MOLLE if there's room
    else ok = Gr.stow(this, it);
    if (ok) { G.HUD.toast('', `Picked up: ${name}`, 1.4); G.Audio.pickup(); if (G.InvUI.field) G.InvUI.render(); }
    else { G.HUD.toast('', `No room on you for the ${name}`, 1.6); G.Net.toHost({ t: 'drop', item: packed, x, z }); }
  },
  // put something down at your feet (from the inventory): it's the host's to hand out now
  dropItem(it) {
    const a = this.yaw + (Math.random() - 0.5) * 0.8, d = 0.45 + Math.random() * 0.25;
    G.Net.toHost({ t: 'drop', item: G.Gear.pack(it), x: this.pos.x - Math.sin(a) * d, z: this.pos.z - Math.cos(a) * d });
    G.Audio.click();
  },
  // the host's answer to a cabinet edit: what you took that someone else had already (it comes off you again),
  // and what you put in that didn't fit after all (it comes back)
  cabSettle(deny, ret) {
    const Gr = G.Gear, lost = [];
    for (const [mt, n0] of Object.entries(deny || {})) {
      let n = n0;
      Gr.each(Gr.body(this), (it, g) => { if (n > 0 && it.k === 'med' && it.mt === mt) { const k = Math.min(n, it.n || 1); it.n = (it.n || 1) - k; n -= k; if (it.n <= 0) Gr.removeFrom(g, it); } });
      lost.push(G.Med.ITEMS[mt].name);
    }
    if (lost.length) G.HUD.toast('', `Someone got there first: ${lost.join(', ')}`, 1.8);
    for (const [mt, n] of ret || []) if (!Gr.stow(this, Gr.medItem(mt, n))) G.HUD.toast('', `No room for the ${G.Med.ITEMS[mt].name.toLowerCase()}: left behind`, 1.8);
    if ((lost.length || (ret && ret.length)) && G.InvUI.field) G.InvUI.render();
  },
  // an attachment the host gave you from the attachments box: fitted to the weapon in your hands if you said so and
  // it still goes straight on (what it replaces, and anything that no longer has a place, into your inventory, or
  // at your feet if there's no room), else carried (at your feet if there's no room)
  takeAttachment(pid, fit) {
    const GS = G.Gunsmith, Gr = G.Gear, p = GS.PARTS[pid], w = this.cur();
    if (!p) return;
    const keep = (q) => { const it = Gr.partItem(q); if (Gr.stow(this, it)) return true; this.dropItem(it); return false; };
    const sl = fit && w && GS.slotsOf(w.def.id, w.def.build).find((s) => GS.fitsSlot(s, p, w.def.id));
    if (sl) {
      const build = Object.assign({}, w.def.build), off = build[sl.slot] ? [build[sl.slot]] : [];
      build[sl.slot] = pid;
      off.push(...GS.prune(w.def.id, build));
      this.refit(w, build);
      const dropped = off.filter((q) => !keep(q)).map((q) => (GS.PARTS[q] || {}).name || q);
      G.HUD.toast('', `${p.name} fitted to your ${w.def.name}${dropped.length ? ` — no room for the ${dropped.join(', ')}: on the floor` : ''}`, 2);
    } else G.HUD.toast('', keep(pid) ? `${p.name}: in your inventory` : `No room on you for the ${p.name}: on the floor`, 1.8);
    G.Audio.pickup();
    if (G.InvUI.field) G.InvUI.render();
  },
  takeFromCase([code, mag, reserve, am, kit, sk]) {
    const def = G.Gunsmith.fromCode(code);
    if (!def) return;
    // a conversion kit packed in with it
    const kits = (Array.isArray(kit) ? kit : kit ? [kit] : []).filter((pid) => G.Gunsmith.PARTS[pid]), K = kits.length ? G.Gunsmith.PARTS[kits[0]] : null;
    for (const pid of kits) { const it = G.Gear.partItem(pid); if (!G.Gear.stow(this, it)) this.dropItem(it); }
    const old = this.weapons[def.slot];
    // ours went in the case, or (if we said so and there's room) into our backpack, build and all
    const stowed = old && this.caseStow && this.kit.pack && G.Gear.place(this.kit.pack.grids, G.Gear.gunItem(old));
    this.caseStow = false; // (left in the case, it's in there as built: its parts went with it, see the swap below)
    const w = this.makeWeapon(def.id, def.build);
    if (sk && sk.length) w.stickers = G.Stickers.clean(sk); // (someone's, stuck on it before they put it in)
    w.ammo = G.ammoOk(G.calOf(w.def), am);
    const ch = G.chambered(w.def) && mag > 0; // (the count is everything in it: one of them's in the chamber)
    w.mag = Math.min(mag - (ch ? 1 : 0), this.magSize(w.def));
    if (w.tube) w.tube = Array(w.mag).fill(w.ammo);
    w.chamber = ch ? w.ammo : null;
    // the magazines that came in the case, where they fit on you (the rest on the floor at your feet)
    const spare = G.Gear.receive(this, w.def, reserve, w.ammo), A = G.AMMO[w.ammo];
    this.weapons[def.slot] = w;
    const what = `${spare.placed ? `, ${spare.placed} spare ${G.Gear.ammoFor(w.def).kind === 'mag' ? 'magazine' : 'box'}${spare.placed > 1 ? 's' : ''}` : ''}${spare.dropped ? ` (${spare.dropped} on the floor: no room)` : ''}${A && A.k !== 1 ? ` · loaded with ${A.name}` : ''}`;
    this.inHand(def.slot, `${def.name}${what}${K ? ', and a ' + K.name + (kits.length > 1 ? ' with the parts for it' : '') : ''} — ${!old ? 'taken from the case' : stowed ? 'your ' + old.def.name + ' is in your backpack' : 'your ' + old.def.name + ' is in the case'}`);
  },
  // a different gun in that slot now: it's the one in your hands, drawn
  inHand(slot, msg) {
    const w = this.weapons[slot];
    this.slot = slot; this.reloading = false; this.inspectT = 0; this.burstQ = 0;
    G.R.setViewmodel(w.def);
    this.raiseT = this.raiseMax = this.drawTime();
    if (G.GunAudio.available()) { G.GunAudio.buildDry(w.def.soundKey); G.GunAudio.buildDry(G.Gunsmith.roundSoundKey(w.def, w.chamber || w.ammo)); }
    G.Audio.pickup();
    G.HUD.toast('', msg, 2);
  },
  // is there room in your backpack for a gun (with another one taken out of it first)?
  packRoom(gunIt, out) {
    const pack = this.kit.pack;
    if (!pack) return false;
    const where = out && G.Gear.packGuns(this).find(([it]) => it === out);
    const p = where && where[1].items.find((q) => q.it === out);
    if (where) G.Gear.removeFrom(where[1], out);
    const ok = pack.grids.some((g) => G.Gear.findSpot(g, gunIt));
    if (where) G.Gear.put(where[1], out, p.x, p.y, p.r);
    return ok;
  },
  // B: swap the gun in your hands of that kind for the next one in your backpack (yours goes in its place).
  // Takes a couple of seconds with your hands busy; hold B.
  packSwap() {
    if (this.action || this.down || this.dead) return;
    const list = G.Gear.packGuns(this);
    if (!list.length) { G.HUD.toast('', this.kit.pack ? 'No gun in your backpack' : 'No backpack', 1.2); return; }
    this.packIdx = ((this.packIdx || 0) + 1) % list.length;
    const [it] = list[this.packIdx], slot = it.w.def.slot, old = this.weapons[slot];
    if (old && !this.packRoom(G.Gear.gunItem(old), it)) { G.HUD.toast('', `No room in your backpack for your ${old.def.name}`, 1.5); G.Audio.deny(); return; }
    this.startAction(old ? `Swapping to the ${it.w.def.name}` : `Getting out the ${it.w.def.name}`, old ? 2.2 : 1.6, () => {
      const at = G.Gear.packGuns(this).find(([q]) => q === it);
      if (!at) return;
      const cur = this.weapons[slot];
      if (cur && !this.packRoom(G.Gear.gunItem(cur), it)) return;
      G.Gear.removeFrom(at[1], it);
      if (cur) G.Gear.place(this.kit.pack.grids, G.Gear.gunItem(cur));
      this.weapons[slot] = it.w;
      this.inHand(slot, `${it.w.def.name} out of your backpack${cur ? ', your ' + cur.def.name + ' in' : ''}`);
    }, 'case');
    this.action.key = 'KeyB';
  },
  // refit a weapon after the gunsmith changed its build (ammo carried over, mag clamped to the new size)
  refit(w, build) {
    const conv = G.Gunsmith.convert(w.def.id, build);
    if (conv) return this.convert(w, conv);
    const def = G.Gunsmith.compile(w.def.id, build);
    w.def = def; w.sup = def.sup;
    if (this.cur && this.cur() === w && G.R && G.R.vm && G.Game.phase === 'level') G.R.setViewmodel(def); // a different magazine in it, say
    w.mag = Math.min(w.mag, this.magSize(def));
    G.Gear.refitMags(this, def);
    if (w.tube) w.tube.length = Math.min(w.tube.length, w.mag);
  },
  // Another gun's receiver kit went in: it's that gun now (G.Gunsmith.convert). The parts that came off go to
  // your locker (the old gun's own barrel and such go with its kit); what was loaded stays only if the new gun
  // takes the same rounds from the same magazines, otherwise the magazine comes out with its rounds (or the
  // loose rounds go back in boxes).
  convert(w, { id, build, off }) {
    const Gr = G.Gear, GS = G.Gunsmith, old = w.def, def = GS.compile(id, build), a0 = Gr.ammoFor(old), a1 = Gr.ammoFor(def);
    for (const pid of off) { const p = GS.PARTS[pid]; if (p && !p.variant) this.stash[pid] = (this.stash[pid] || 0) + 1; } // (parts with nowhere to go on it)
    const keep = G.calOf(old) === G.calOf(def) && a0.kind === a1.kind && (a1.kind !== 'mag' || G.magFits(old.id, id));
    if (!keep) {
      if (a0.kind === 'mag' && !w.noMag) {
        const m = Gr.ammoItem(old, 0, w.ammo, old.build && old.build.mag);
        m.r.push(...(w.tube || []));
        if (!Gr.stow(this, m)) this.dropItem(m);
      } else Gr.unloadGun(this, w);
      if (w.chamber) { if (!Gr.stow(this, Gr.boxItem(G.calOf(old), w.chamber, 1))) { /* (a single round: let it go) */ } }
      w.mag = 0; w.tube = []; w.ammo = G.ballFor(G.calOf(def)); w.chamber = null;
      if (a1.kind === 'mag') w.noMag = true; else delete w.noMag;
    }
    w.def = def; w.sup = def.sup;
    if (keep) { w.mag = Math.min(w.mag, this.magSize(def)); if (w.tube) w.tube.length = Math.min(w.tube.length, w.mag); }
    if (!G.chambered(def)) { if (w.chamber) { w.tube.push(w.chamber); w.mag++; } w.chamber = null; } // (no chamber of its own: into the magazine)
    if (this.cur && this.cur() === w && G.R && G.R.vm && G.Game.phase === 'level') G.R.setViewmodel(def);
    const misfit = (def.misfit || []).map((s) => GS.PARTS[def.build[s]].name);
    if (G.HUD) G.HUD.toast('', `Your ${old.name} is now a ${def.name}${keep ? '' : a0.kind === 'mag' && a1.kind === 'mag' ? ', its magazine out' : ''}${misfit.length ? `. It won't fire until you replace: ${misfit.join(', ')}` : ''}`, 3.5);
  },
  cur() { return this.weapons[this.slot]; },
  // The sight as it's set now: its power (a variable scope's step, or a magnifier in or out), whether you're
  // looking through a magnified picture, and the aiming sensitivity / view tightening (zoom).
  sight(w) {
    const d = w.def, L = d.magLevels;
    if (!L) return { i: 0, mag: d.magnif || 1, scoped: d.scoped, zoom: d.zoom };
    const i = G.U.clamp(w.magI != null ? w.magI : d.magDef || 0, 0, L.length - 1), mag = L[i];
    if (d.magnifier) return { i, mag, scoped: mag > 1, zoom: mag > 1 ? d.zoom / mag : d.zoom };
    return { i, mag, scoped: true, zoom: G.U.clamp(d.zoom * (d.magnif || mag) / mag, 0.08, 0.85) };
  },
  // ------------------------------------------------------------- the comms wheel
  // Hold the middle button (a tap is still a ping): a wheel of eight round the crosshair. The mouse moves a pointer
  // out from its middle instead of your view; let go over a slice to do it, or in the middle to do nothing. Your
  // gun's switches (light, laser, a magnifier flipped in or out) and calls to the squad (what you're hit with, from
  // your injuries; contact, with a ping where you're looking; clear; ammo, with what you've got; hold). (The mouse's
  // side buttons used to work the light and laser, but a browser's back and forward can't be reliably kept off them.)
  WHEEL_HOLD: 0.22,
  wheelItems() {
    const w = this.cur(), d = w && w.def, on = (k) => (w && w[k] ? 'on' : 'off');
    const L = d && d.magLevels, mi = w && L ? this.sight(w).i : 0;
    return [
      { id: 'light', label: 'Light', sub: d && d.light ? on('light') : 'none fitted', off: !(d && d.light), act: () => this.toggleTac('light') },
      { id: 'laser', label: 'Laser', sub: d && d.laser ? on('laser') : 'none fitted', off: !(d && d.laser), act: () => this.toggleTac('laser') },
      { id: 'mag', label: 'Magnifier', sub: d && d.magnifier ? (mi ? 'in' : 'out') : 'none fitted', off: !(d && d.magnifier), act: () => { w.magI = mi ? 0 : L.length - 1; G.Audio.click(); G.HUD.toast('', mi ? 'Magnifier out: 1×' : `Magnifier in: ${L[L.length - 1]}×`, 0.7); } },
      { id: 'hurt', label: 'Injuries', sub: 'report them', act: () => this.say(this.injuryReport()) },
      { id: 'ammo', label: 'Ammo', sub: 'report it', act: () => this.say(this.ammoReport()) },
      { id: 'hold', label: 'Hold', sub: 'hold position', act: () => this.say('Holding here.') },
      { id: 'clear', label: 'Clear', sub: 'room clear', act: () => this.say('Clear!') },
      { id: 'contact', label: 'Contact', sub: 'and ping it', act: () => { this.ping(true); this.say('Contact! Where I\'ve marked.'); } },
    ];
  },
  wheelOpen() {
    if (this.wheel || this.dead || G.Game.phase !== 'level') return;
    this.wheel = { x: 0, y: 0, sel: -1, items: this.wheelItems() };
    let el = document.getElementById('commWheel');
    if (!el) { el = document.createElement('div'); el.id = 'commWheel'; document.body.appendChild(el); }
    const N = this.wheel.items.length;
    el.innerHTML = this.wheel.items.map((it, i) => { const a = (i / N) * Math.PI * 2 - Math.PI / 2; return `<div class="cw-it${it.off ? ' off' : ''}" style="left:calc(50% + ${(Math.cos(a) * 118).toFixed(1)}px);top:calc(50% + ${(Math.sin(a) * 118).toFixed(1)}px)"><b>${it.label}</b><small>${it.sub}</small></div>`; }).join('') + '<i class="cw-ptr"></i>';
    el.classList.add('on');
    G.Audio.click();
  },
  wheelMove(dx, dy) {
    const W = this.wheel, el = document.getElementById('commWheel');
    W.x += dx; W.y += dy;
    const r = Math.hypot(W.x, W.y);
    if (r > 90) { W.x *= 90 / r; W.y *= 90 / r; }
    const N = W.items.length, a = Math.atan2(W.y, W.x) + Math.PI / 2;
    const sel = r > 28 ? ((Math.round(a / (Math.PI * 2 / N)) % N) + N) % N : -1;
    if (sel !== W.sel) { W.sel = sel; el.querySelectorAll('.cw-it').forEach((e, i) => e.classList.toggle('sel', i === sel)); if (sel >= 0) G.Audio.click(); }
    const p = el.querySelector('.cw-ptr'); if (p) p.style.transform = `translate(${W.x.toFixed(1)}px, ${W.y.toFixed(1)}px)`;
  },
  wheelClose(pick) {
    const W = this.wheel, el = document.getElementById('commWheel');
    this.wheel = null;
    if (el) el.classList.remove('on');
    const it = W && pick && W.sel >= 0 ? W.items[W.sel] : null;
    if (!it) return;
    if (it.off) { G.HUD.toast('', `No ${it.label.toLowerCase()} on the ${this.cur().def.name}`, 1); G.Audio.deny(); return; }
    it.act();
  },
  // a call to the squad (the chat, under your name)
  say(m) {
    const now = performance.now();
    if (now - (this.sayAt || 0) < 700) return;
    this.sayAt = now;
    G.Net.toHost({ t: 'chat', m });
  },
  // what you're hit with, as you'd call it: each hurt part and what's wrong with it, and how much blood you've lost
  injuryReport() {
    const b = this.body;
    if (!b) return 'I\'m good.';
    const parts = Object.entries(b.parts).map(([k, p]) => [G.Med.NAME[k].toLowerCase(), G.Med.describe(p).filter((s) => s !== 'tourniquet on'), p]).filter(([, d, p]) => d.length || p.hp < p.max * 0.9);
    const blood = Math.round(b.blood);
    if (!parts.length) return blood < 95 ? `Not hit, but I've lost blood: ${blood}%.` : 'I\'m not hit. Good to go.';
    const bleeding = parts.some(([, d]) => d.some((s) => /bleeding/.test(s)));
    return `I'm hit: ${parts.map(([n, d]) => `${n}${d.length ? ' (' + d.join(', ') + ')' : ' (hurt)'}`).join('; ')}. Blood ${blood}%.${bleeding ? ' Bleeding.' : ''}`;
  },
  // what you've got for the gun in your hands: in it, and in your magazines and boxes
  ammoReport() {
    const w = this.cur();
    if (!w || w.def.cls === 'BOW' && !w.def.cal) return 'Need ammo.';
    const inGun = w.mag + (w.chamber ? 1 : 0), spare = G.Gear.rounds(this, w.def), cap = this.magSize(w.def), mags = cap ? spare / cap : 0;
    return spare + inGun === 0 ? 'I\'m out! Need ammo.' : mags < 1.5 ? `Low on ammo: ${inGun} in the gun, ${spare} spare.` : `Ammo's fine: ${inGun} in the gun, ${spare} spare (about ${Math.floor(mags)} reloads).`;
  },

  // switch the gun's light or laser (it remembers: each gun has its own switches)
  toggleTac(kind) {
    const w = this.cur();
    if (!w || this.dead) return;
    if (kind === 'light' ? !w.def.light : !w.def.laser) { G.HUD.toast('', `No ${kind} on the ${w.def.name}`, 1); G.Audio.deny(); return; }
    w[kind] = !w[kind];
    G.Audio.click();
    G.HUD.toast('', `${kind === 'light' ? 'Light' : 'Laser'} ${w[kind] ? 'on' : 'off'}`, 0.7);
  },
  // what's lit on this gun (as sent to the squad): 1 light, 2 laser, 4 green laser, 8 bright light
  tacFlags(w) {
    if (!w || this.stowed) return 0;
    const d = w.def;
    return (w.light && d.light ? 1 | (d.light > 1.2 ? 8 : 0) : 0) | (w.laser && d.laser ? 2 | (d.laser === 'g' ? 4 : 0) : 0);
  },
  // A ping: the spot you're looking at (on a wall, the floor, someone) marked for the whole squad, in your colour
  // with your name, and nothing about what's there (G.Views.addPing). Not too often.
  ping() {
    const now = performance.now();
    if (now - (this.pingAt || 0) < 400) return;
    this.pingAt = now;
    const cam = G.R.camera, o = cam.position, f = new THREE.Vector3(0, 0, -1).applyQuaternion(cam.quaternion);
    const h = G.Level.raycast(G.Game.map, o.x, o.y, o.z, f.x, f.y, f.z, 200);
    let t = h.t;
    const rc = new THREE.Raycaster(o.clone(), f.clone(), 0, t);
    for (const ev of G.Views.enemies.values()) { // (on whoever's in the way: just the spot)
      if (!ev.alive || !ev.rig || !ev.rig.root.visible) continue;
      const hit = rc.intersectObject(ev.rig.root, true)[0];
      if (hit && hit.distance < t) t = hit.distance;
    }
    const p = o.clone().addScaledVector(f, Math.max(0.5, t - 0.05));
    G.Net.toHost({ t: 'ping', p: [p.x, p.y, p.z].map((v) => Math.round(v * 100) / 100) });
  },
  // the way the bore points now (your aim, plus recoil and sway): where rounds, and the laser, go
  boreDir() {
    const off = this.aimOffset(), cam = G.R.camera;
    return new THREE.Vector3(0, 0, -1).applyEuler(new THREE.Euler(this.pitch + off.p, this.yaw + off.y, cam.rotation.z, 'YXZ'));
  },

  // ------------------------------------------------------------- input
  bindInput() {
    const isGameKey = (c) => ['Tab', 'Space', 'KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyQ', 'KeyE'].includes(c);
    window.addEventListener('keydown', (e) => {
      if (G.Game.chatOpen || G.Game.phase !== 'level') return;
      if (isGameKey(e.code)) e.preventDefault();
      if (e.repeat) return;
      this.keys[e.code] = true;
      if (!G.Game.locked) return;
      switch (e.code) {
        case 'Digit1': this.swap('p'); break;
        case 'Digit2': this.swap('s'); break;
        case 'KeyR': this.rPress(); break;
        case 'KeyI': this.inspect(); break;
        case 'KeyC': if (this.prone) this.setProne(false); else if (!this.down) this.crouch = !this.crouch; break;
        case 'KeyZ': this.setProne(!this.prone); break;
        case 'Digit3': this.equip(0); break;
        case 'Digit4': this.equip(1); break;
        case 'Digit5': this.equip(2); break;
        case 'KeyH': this.useMed(); break;
        case 'KeyB': this.packSwap(); break;
        case 'KeyV': this.shout(); break;
        case 'KeyX': this.selectFire(); break;
        case 'KeyM': G.Game.setMuted(!G.Audio.muted); G.HUD.toast('', G.Audio.muted ? 'Sound muted' : 'Sound on', 1); break;
        case 'KeyF': this.fEdge = true; break;
        case 'Space': this.lowToggle = !this.lowToggle; break;
        case 'F8': G.GunAudio.debugEchoes = !G.GunAudio.debugEchoes; G.HUD.toast('', G.GunAudio.debugEchoes ? 'Echo paths shown' : 'Echo paths hidden', 1); break;
        case 'F9': G.HUD.toast('', G.Rig.toggleDebug() ? 'Hitboxes shown' : 'Hitboxes hidden', 1); break;
      }
    });
    window.addEventListener('keyup', (e) => { this.keys[e.code] = false; if (e.code === 'KeyR') this.rRelease(); });
    window.addEventListener('blur', () => { this.keys = {}; this.mouse.l = this.mouse.r = false; this.midAt = 0; if (this.wheel) this.wheelClose(false); });
    window.addEventListener('mousedown', (e) => {
      if (!G.Game.locked) return;
      if (e.button === 0) { this.mouse.l = true; this.pressBuf = 0.15; if (this.dead) this.specIdx++; }
      if (e.button === 2) this.mouse.r = true;
      if (e.button === 1) { // the middle button: a tap pings, held it opens the comms wheel (wheelOpen)
        e.preventDefault();
        const at = (this.midAt = performance.now());
        setTimeout(() => { if (this.midAt === at) this.wheelOpen(); }, this.WHEEL_HOLD * 1000);
      }
    });
    window.addEventListener('mouseup', (e) => {
      if (e.button === 0) this.mouse.l = false;
      if (e.button === 2) this.mouse.r = false;
      if (e.button === 1 && this.midAt) {
        const held = performance.now() - this.midAt;
        this.midAt = 0;
        if (this.wheel) this.wheelClose(true);
        else if (held < this.WHEEL_HOLD * 1000 && G.Game.locked && G.Game.phase === 'level' && !this.dead) this.ping();
      }
    });
    window.addEventListener('auxclick', (e) => { if (e.button === 1) e.preventDefault(); });
    window.addEventListener('contextmenu', (e) => e.preventDefault());
    // the wheel: while aiming through a variable scope or a magnifier, steps the power (up: more); otherwise
    // swaps weapons
    window.addEventListener('wheel', (e) => {
      if (!G.Game.locked || G.Game.phase !== 'level' || Math.abs(e.deltaY) <= 5) return;
      const w = this.cur(), L = w && w.def.magLevels;
      if (L && this.ads && this.adsT > 0.5) {
        const i = this.sight(w).i, n = G.U.clamp(i + (e.deltaY < 0 ? 1 : -1), 0, L.length - 1);
        if (n !== i) { w.magI = n; G.Audio.click(); G.HUD.toast('', w.def.magnifier ? (n ? `Magnifier in: ${L[n]}×` : 'Magnifier out: 1×') : `${L[n]}×`, 0.7); }
        return;
      }
      this.swap(this.slot === 'p' ? 's' : 'p');
    });
    document.addEventListener('mousemove', (e) => {
      if (!G.Game.locked || this.dead || this.out) return; // (out cold: no looking round)
      if (this.wheel) { this.wheelMove(e.movementX, e.movementY); return; } // (the comms wheel open: the mouse picks on it)
      const z = G.U.lerp(1, this.sight(this.cur()).zoom, this.adsT || 0);
      const s = 0.0022 * G.Game.settings.sens * z;
      // a magazine in your hand, or the gun held open for a chamber check: the mouse turns that, not your view
      const mc = this.magChk;
      if (mc && !mc.rel && mc.k > 0.6) { mc.yaw = G.U.clamp(mc.yaw + e.movementX * s * 1.6, -1.4, 1.4); mc.pitch = G.U.clamp(mc.pitch + e.movementY * s * 1.6, -0.8, 1.4); return; }
      if (this.inspHold || (this.rChk && !this.rChk.rel && this.rChk.k > 0.6)) { this.inspYaw = G.U.clamp((this.inspYaw || 0) + e.movementX * s * 1.4, -1.5, 1.5); this.inspPitch = G.U.clamp((this.inspPitch || 0) + e.movementY * s, -0.6, 0.6); return; } // (inspYaw: the roll)
      this.yaw -= e.movementX * s;
      this.pitch = G.U.clamp(this.pitch - e.movementY * s, -1.5, 1.5);
    });
  },

  // ------------------------------------------------------------- lifecycle
  spawn(x, z) {
    this.pos = new THREE.Vector3(x, 0, z);
    this.vel = new THREE.Vector3();
    this.yaw = 0; this.pitch = 0;
    this.body = G.Med.newBody(); // injuries part by part (js/medical.js); hp is the overall, for the team display
    this.hp = this.maxHp();
    this.down = false; this.out = false; this.dead = false; // (out: unconscious, as well as down)
    this.rounds = [];
    this.crouch = false; this.prone = false; this.stanceT = 0; this.onGround = true; this.seat = null; this.treating = new Map();
    this.eyeH = 1.62;
    this.fireCd = 0; this.swapT = 0; this.reloading = false; this.reloadT = 0; this.burstQ = 0;
    this.adsT = 0; this.ads = false; this.kick = 0; this.flashT = 0;
    this.rc = { y: 0, p: 0, vy: 0, vp: 0 }; // recoil: aim offset (rad, yaw left / pitch up) and its momentum
    this.shove = 0; this.shoveV = 0; // and the gun driven back into the shoulder (m) and how fast
    this.flinch = { y: 0, p: 0 }; this.swayOff = { y: 0, p: 0 }; this.swayT = Math.random() * 20; this.walkAmp = 0;
    this.sinceHurt = 99; this.sinceFire = 99; this.healLeft = 0;
    this.reviveT = 0; this.bobT = 0;
    this.stateT = 0; this.specIdx = 0; this.pressBuf = 0; this.lastTrigger = false;
    this.lowToggle = false; this.stowed = false; this.action = null; this.held = null; this.stowW = 0; this.raiseMax = 0.3; this.shakeT = 0;
    this.spin = 0; this.hyperQ = 0; this.cylTarget = 0; this.cycleMax = 0; this.flashIdx = 0;
    this.hitQ = new Map();
    if (this.slot === 's' && this.weapons.p) this.slot = 'p';
    if (!this.weapons[this.slot]) this.slot = Object.keys(this.weapons)[0];
    G.R.setViewmodel(this.cur().def);
    // face away from the nearest wall
    const m = G.Game.map;
    let best = -1;
    for (let a = 0; a < 8; a++) {
      const yaw = (a / 8) * Math.PI * 2;
      const t = G.Level.raycast(m, x, 1.5, z, -Math.sin(yaw), 0, -Math.cos(yaw), 50).t;
      if (t > best) { best = t; this.yaw = yaw; }
    }
  },

  speedMult() {
    return this.cur().def.speed * G.Gear.speed(this) * (this.body ? G.Med.speedMult(this.body) : 1);
  },

  update(dt) {
    const map = G.Game.map;
    if (!map || !this.pos) return;
    this.stepRounds(dt);
    G.R.fisheye = 0; // (spectating turns it on: js/player.js spectate)
    if (this.dead) { if (G.R.vm) G.R.vm.visible = false; this.sendState(dt); return; } // (no gun of yours in the view of someone else's helmet; the camera's placed once their rigs are posed: G.Game.loop, spectate)

    this.sinceHurt += dt; this.sinceFire += dt;
    this.pressBuf = Math.max(0, this.pressBuf - dt);
    const maxHp = this.maxHp();

    // bleeding (down: slowly, and nothing clots: you're dead when it's all gone, unless someone stops it). Very low,
    // you black out; blood bags from a teammate bring you round (still down: they get you up)
    const fate = G.Med.tick(this.body, dt, this.down);
    this.hp = G.Med.overall(this.body);
    if (fate === 'dead') return this.die(this.down ? this.downCause() : 'Bled out');
    if (fate === 'out' && !this.out) this.goDown(true);
    else if (this.out && fate !== 'out') { this.out = false; G.HUD.toast('', 'You come round: a teammate can get you up', 2.4); }
    this.bleed = this.down ? G.Med.bleedOut(this.body) : null; // (seconds left, or null: stable)

    this.move(dt, map);
    // the gun in your hands is the one in view (moved out of its slot in the Tab screen, rebuilt, swapped, a sticker put on: whatever changed it)
    const cw = this.cur();
    if (cw ? !G.R.vm || G.R.vm.userData.key !== G.R.vmKey(cw.def, cw.stickers) : G.R.vm) G.R.setViewmodel(cw ? cw.def : null);
    this.weaponUpdate(dt);
    this.interact(dt);
    this.updateCamera(dt);
    this.sendState(dt);
    this.fEdge = false;
  },

  move(dt, map) {
    // belted into a seat in the hangar's helicopter: nowhere to go, the view turned no further than a head turns
    if (this.seat != null) {
      const sp = G.Hangar.seatPos(this.seat);
      this.pos.set(sp.x, sp.y, sp.z); this.vel.set(0, 0, 0); this.onGround = true; this.hspeed = 0;
      this.crouch = true; this.stowed = true; this.lowToggle = false;
      this.yaw = sp.yaw + G.U.clamp(G.U.angDiff(sp.yaw, this.yaw), -1.9, 1.9);
      this.pitch = G.U.clamp(this.pitch, -0.7, 0.6);
      this.eyeH += (1.12 - this.eyeH) * Math.min(1, dt * 12);
      return;
    }
    const k = this.keys, blocked = this.down || G.Game.chatOpen || !G.Game.locked || !!(this.action && (this.action.kind === 'zip' || this.action.kind === 'bag'));
    let fw = blocked ? 0 : (k.KeyW ? 1 : 0) - (k.KeyS ? 1 : 0);
    let st = blocked ? 0 : (k.KeyD ? 1 : 0) - (k.KeyA ? 1 : 0);
    // Space: weapon to low ready, move quicker, can't shoot. Shift: creep with the weapon steadied.
    const wasLow = this.lowReady;
    if (this.mouse.l || this.mouse.r || this.down || this.stowed) this.lowToggle = false; // firing or aiming brings the weapon up
    this.lowReady = !blocked && !!this.lowToggle;
    this.steadying = !blocked && !this.lowReady && !!(k.ShiftLeft || k.ShiftRight);
    if (wasLow && !this.lowReady) this.raiseT = this.raiseMax = 0.5; // bringing the gun back up
    this.stanceT = Math.max(0, (this.stanceT || 0) - dt);
    let speed = this.lowReady ? this.SPEED.low : this.steadying ? this.SPEED.steady : this.SPEED.walk;
    if (this.prone) speed = this.stanceT > 0 ? 0 : this.SPEED.prone; // (a crawl; nothing while getting down or up)
    else if (this.crouch) speed = Math.min(speed, this.SPEED.crouch) * (this.lowReady ? 1.3 : this.steadying ? 0.75 : 1);
    speed *= this.speedMult();
    if (this.adsT > 0.5) speed *= 0.55; // aimed walk
    if (Math.abs(this.lean || 0) > 0.3) speed *= 0.7;
    const sy = Math.sin(this.yaw), cy = Math.cos(this.yaw);
    let wx = -sy * fw + cy * st, wz = -cy * fw - sy * st;
    const wl = Math.hypot(wx, wz);
    if (wl > 0) { wx /= wl; wz /= wl; }
    const accel = this.onGround ? 7 : 2; // kit has weight: starts and stops take a moment
    this.vel.x += (wx * speed - this.vel.x) * Math.min(1, accel * dt);
    this.vel.z += (wz * speed - this.vel.z) * Math.min(1, accel * dt);
    this.vel.y -= 20 * dt;
    const prevY = this.pos.y, STEP = G.World.STEP, was = this.onGround;
    this.pos.x += this.vel.x * dt;
    this.pos.z += this.vel.z * dt;
    G.Level.resolve(map, this.pos, 0.35, prevY, STEP, true); // (anything a step high or less: walked up onto, not into; stairs as slopes)
    this.pos.y += this.vel.y * dt;
    const g = G.Level.groundAt(map, this.pos.x, this.pos.z, 0.35, prevY, STEP, true);
    // on the ground, or a step down from it (walking down stairs: stay on them, don't hop from tread to tread)
    if (this.pos.y <= g || (was && this.vel.y <= 0 && prevY - g <= STEP + 0.02)) { this.pos.y = g; this.vel.y = 0; this.onGround = true; } else this.onGround = false;
    let eyeTarget = this.down ? 0.45 : this.prone ? 0.36 : this.crouch ? 1.0 : 1.62;
    const ac = this.action;
    if (ac && (ac.kind === 'zip' || ac.kind === 'bag')) { // going down with them / kneeling at the evidence
      const p = ac.t / ac.dur;
      const kneel = ac.approach ? 0 : ac.kind === 'zip' && ac.living ? G.U.smooth(0.12, 0.5, p) : G.U.smooth(0, 0.25, p);
      eyeTarget = G.U.lerp(eyeTarget, ac.kind === 'zip' && ac.living ? 0.88 : 0.95, kneel);
    }
    this.eyeH += (eyeTarget - this.eyeH) * Math.min(1, dt * 12);
    const ceil = map.world ? G.World.ceilingAt(map.world, this.pos.x, this.pos.z, 0.2, this.pos.y + 1.0) : G.Level.WALL_H; // (the ceiling over you, wherever you are: none outdoors)
    if (this.pos.y + this.eyeH > ceil - 0.15) { this.pos.y = ceil - 0.15 - this.eyeH; this.vel.y = Math.min(0, this.vel.y); }
    this.hspeed = Math.hypot(this.vel.x, this.vel.z);
    if (this.onGround && this.hspeed > 0.5) this.bobT += dt * this.hspeed * 1.8;
  },
  // Spread/recoil multiplier from steadiness: holding Shift tightens it.
  steadiness() { return this.steadying ? 0.65 : 1; },

  // ------------------------------------------------------------- recoil and sway
  // Recoil doesn't move your view: it throws the GUN off your aim point, and the gun's bore is where the round
  // goes. Each shot kicks an aim offset (up, and a random side), part as an instant jump and the rest as
  // momentum. A spring-damper pulls it back to centre; it's underdamped (ζ≈0.6) so the muzzle overshoots
  // slightly below the line before settling, and on full auto the kicks outpace the spring and the muzzle
  // climbs to a ceiling. Breathing sway, walking, low-health tremor, getting hit and the gun lagging behind
  // fast turns all add to the same offset. Red dots, scopes and the hip crosshair all show the real aim point.
  // KP/KD: spring and damper (ζ = KD / 2√KP ≈ 0.6). Softer than a top-down game's so full auto visibly climbs.
  // KP/KD: the spring pulling the muzzle back (softer: sustained fire stacks up and climbs); POS/VEL: how a
  // kick splits between an instant jump and momentum; PUNCH: how much of it the camera shows (climb, side,
  // and a little roll), the rest is the gun turning on screen; VIEW: the part
  // of each kick that moves your actual view and stays there (you pull it back down yourself)
  RECOIL: { KP: 110, KD: 13, VMAX: 20, POS: 0.6, VEL: 7, PUNCH: 0.8, PUNCH_Y: 0.7, ROLL: 0.25, VIEW: { p: 0.3, y: 0.25 },
    // the shove back: each shot drives the gun back toward you (J m/s for a kick of 1); you push it forward again (K,
    // D), harder and harder as it nears what room there is (STIFF: at the limit the push is 1 + STIFF times as hard).
    // The room: aiming, the sight's eye relief short of your eye; from the hip, HIP. Near it, a shot's kick can't go
    // into the shove, so it goes out sideways and up instead: at the limit, SIDE of its climb more to the side and UP
    // more climb.
    SHOVE: { K: 300, D: 26, J: 0.55, STIFF: 30, HIP: 0.12, SIDE: 0.9, UP: 0.5 } },
  SWAY_GAIN: 1.6, // how big the aim wobble is (breathing, twitch, walking); 1 = the old, subtler sway
  // per-build handling, from the build's recoil (degrees/shot), class, weight and handling
  recoilModel(def) {
    this._rm = this._rm || new WeakMap();
    let m = this._rm.get(def);
    if (m) return m;
    const deg = Math.PI / 180, cls = def.cls, onehand = cls === 'PST' || cls === 'MP';
    const up = def.recoil * 2.3 * deg;
    const sideK = { PST: 0.8, MP: 0.9, SMG: 0.75, SG: 0.7, LMG: 0.8, SNP: 0.4, DMR: 0.55, BR: 0.7, RAIL: 0.4, BOW: 0.4, GL: 0.55 }[cls] || 0.65;
    const kg = def.weight || 3, aim = G.aimSway(def);
    m = {
      up, side: up * sideK,
      rec: G.U.clamp((def.handling || 1) * (onehand ? 1.15 : 1), 0.55, 1.6), // spring strength: how fast it comes back
      capUp: up * 6 + 0.03, capSide: Math.max(0.025, up * sideK * 6),
      sway: aim.sway, erratic: aim.erratic, // breathing, and the faster twitch that makes a pistol wander: with a stock or without (G.aimSway)
    };
    this._rm.set(def, m);
    return m;
  },
  // how badly injuries throw your aim (0..1): pain, a punctured lung, blood loss (js/medical.js)
  lowHealth() { return this.down ? 1 : this.body ? G.Med.aimPenalty(this.body) : 0; },
  recoilStep(dt, def) {
    const R = this.RECOIL, rc = this.rc, m = this.recoilModel(def);
    // bleeding out saps the strength to muscle the muzzle back down
    const g = m.rec * (1 - 0.8 * this.lowHealth()), kd = R.KD * Math.sqrt(g);
    for (let left = dt; left > 1e-6; left -= 1 / 120) { // fixed small steps keep the spring stable at low fps
      const h = Math.min(left, 1 / 120);
      rc.vy = G.U.clamp(rc.vy + (-R.KP * g * rc.y - kd * rc.vy) * h, -R.VMAX, R.VMAX); rc.y += rc.vy * h;
      rc.vp = G.U.clamp(rc.vp + (-R.KP * g * rc.p - kd * rc.vp) * h, -R.VMAX, R.VMAX); rc.p += rc.vp * h;
      const S = R.SHOVE, q = this.shove / this.shoveRoom(); // (the push forward: stiffening as the room runs out)
      this.shoveV += (-S.K * this.shove * (1 + S.STIFF * q * q) - S.D * this.shoveV) * h; this.shove = Math.max(-0.01, this.shove + this.shoveV * h);
    }
    rc.y = G.U.clamp(rc.y, -m.capSide, m.capSide);
    rc.p = G.U.clamp(rc.p, -m.capUp * 0.4, m.capUp);
    const f = Math.exp(-6 * dt); this.flinch.y *= f; this.flinch.p *= f;
  },
  // how far the gun can come back toward you (m): aiming, its sight's eye relief short of your eye; from the hip, more
  shoveRoom() {
    const u = G.R && G.R.vm && G.R.vm.userData, give = Math.max(0.006, ((u && u.info && u.info.relief) || 0.3) - 0.04);
    return G.U.lerp(this.RECOIL.SHOVE.HIP, give, this.adsT || 0);
  },
  recoilKick(def) {
    const R = this.RECOIL, rc = this.rc, m = this.recoilModel(def);
    // a hyper-burst pair (AN-94) leaves before the recoil reaches you: the two rounds kick less than two
    const hyper = this.fireMode && this.fireMode(this.cur()) === 'hyper' && this.hyperQ > 0 ? 0.7 : 1;
    const k = this.steadiness() * (this.prone ? 0.6 : this.crouch ? 0.8 : 1) * (this.adsT > 0.5 ? 0.85 : 1) * hyper; // (prone: the ground takes it)
    const up0 = m.up * (0.85 + Math.random() * 0.3) * k, dir = Math.random() < 0.5 ? -1 : 1;
    // driven back near the limit: what's left of the kick comes out sideways and up
    const S = R.SHOVE, c = G.U.smooth(0.55, 1, this.shove / this.shoveRoom());
    const side = dir * (m.side * (0.9 + Math.random() * 0.8) * k + up0 * S.SIDE * c); // never fires flat
    const up = up0 * (1 + S.UP * c);
    this.shoveV += S.J * (0.35 + def.recoil * 0.06) * k * (1 - 0.6 * c);
    rc.y += side * R.POS; rc.vy += side * R.VEL;
    rc.p += up * R.POS; rc.vp += up * R.VEL;
    // and some of it for keeps: the view itself climbs and drifts (pull down to hold it on target)
    this.pitch = Math.min(1.45, this.pitch + up * R.VIEW.p);
    this.yaw += side * R.VIEW.y;
  },
  // Breathing (two slow frequencies), the erratic twitch, walking and the low-health tremor. Looser from the
  // hip, tighter crouched or holding your breath (Shift).
  swayStep(dt, def) {
    const m = this.recoilModel(def), a = this.adsT || 0, low = this.lowHealth();
    this.swayT += dt;
    this.walkAmp += ((this.onGround ? Math.min((this.hspeed || 0) / this.SPEED.walk, 1.4) : 0) - this.walkAmp) * Math.min(1, dt * 4);
    const t = this.swayT, atro = 1 + low * 1.4, hold = this.steadying ? 0.4 : 1, lying = this.prone && this.stanceT <= 0;
    // prone, the gun rests on your elbows and the ground: the least sway there is (breathing barely moves it)
    const amp = m.sway * G.U.lerp(1.6, 1, a) * (lying ? 0.25 : this.crouch ? 0.75 : 1) * hold * atro;
    const er = m.erratic * atro * hold * (lying ? 0.3 : 1), wa = this.walkAmp * (1 - a * 0.5);
    const tremor = (s) => low * (0.004 * Math.sin(t * 11.3 + s) + 0.0035 * Math.sin(t * 17.7 + s * 2) + 0.003 * Math.sin(t * 24.9 + s * 3));
    // breathing traces a slow, lopsided figure eight (pitch at twice the yaw rate), with a drift and a faster
    // wander on top; SWAY_GAIN scales the lot
    const k = this.SWAY_GAIN;
    this.swayOff.y = k * ((0.0055 * Math.sin(t * 0.85) + 0.0028 * Math.sin(t * 2.3 + 1.7) + 0.0014 * Math.sin(t * 4.1 + 0.3)) * amp
      + er * (0.006 * Math.sin(t * 6.3 + 0.5) + 0.0042 * Math.sin(t * 9.7 + 2.3))
      + wa * 0.009 * Math.sin(this.bobT + 0.5)) + tremor(2.1);
    this.swayOff.p = k * ((0.0042 * Math.sin(t * 1.7 + 0.6) + 0.0055 * Math.sin(t * 0.37 + 2.0) + 0.0022 * Math.sin(t * 3.3 + 3.1)) * amp
      + er * (0.005 * Math.sin(t * 5.7 + 1.1) + 0.0036 * Math.sin(t * 8.9 + 0.4))
      + wa * 0.02 * (Math.abs(Math.cos(this.bobT)) - 0.64)) + tremor(0.7);
  },
  // the gun's total offset from where you're looking (rad): recoil + sway + flinch + lag behind fast turns
  aimOffset() {
    const sc = 1 - (this.adsT || 0) * 0.75;
    return {
      y: this.rc.y + this.swayOff.y + this.flinch.y - (this.swayX || 0) * 0.25 * sc, // (a little drag behind a fast turn, not much)
      p: this.rc.p + this.swayOff.p + this.flinch.p + (this.swayY || 0) * 0.25 * sc,
    };
  },

  // ------------------------------------------------------------- weapons
  swap(slot) {
    if (this.held) { this.unequip(); if (slot === this.slot) return; }
    if (slot === this.slot || this.down || this.dead || !this.weapons[slot]) return;
    this.slot = slot;
    this.reloading = false; this.burstQ = 0;
    this.swapT = this.swapMax = 0.42;
    this.inspectT = 0; this.act = null; this.magChk = null; this.rChk = null; this.rHeldAt = 0;
    G.R.setViewmodel(this.cur().def);
    G.Audio.click();
  },
  // R: a tap reloads (on letting go); held, it pulls the magazine to check it (when the gun takes one), or, on a gun
  // with none to pull (a revolver, a shotgun's tube, a break-action, a magazine you can't get at), goes straight to
  // the chamber check a held inspect ends on (rChk)
  rPress() {
    if (this.held) return;
    const w = this.cur();
    if (this.reloading || this.magChk || this.rChk || this.stowed || this.down || !w || w.def.akimbo || w.def.cls === 'BOW' || (w.noMag && G.VMAnim.canMagCheck(G.R.vm))) { this.reloadKey(); return; }
    this.rHeldAt = performance.now();
  },
  rRelease() {
    if (this.rHeldAt) { this.rHeldAt = 0; this.reloadKey(); }
    else if (this.magChk) this.magChk.rel = true;
    else if (this.rChk) this.rChk.rel = true;
  },
  // R reloads; R again straight away (a double tap) turns it into a dump reload
  reloadKey() {
    const now = performance.now();
    if (this.reloading && this.reloadMode === 'retain' && now - (this.lastR || 0) < 350) this.toDump();
    else this.startReload();
    this.lastR = now;
  },
  // Reloads. A magazine gun's normal reload is a retention reload: the old magazine comes out and goes back
  // in its pouch on your chest before the fresh one comes out (slow, keeps every round). A dump reload drops
  // the old one: into a dump pouch if you wear one with room (a little slower), else on the floor, gone with
  // whatever was left in it (fastest). Digging a magazine out of your backpack takes much longer.
  RELOAD_K: { retain: 1.35, pouch: 1.0, floor: 0.82, plain: 1 },
  startReload() {
    const w = this.cur(), mag = this.magSize(w.def);
    if (!this.reloading && this.swapT <= 0 && G.chambered(w.def) && !w.chamber && w.mag > 0 && w.mag >= mag) { this.rack(w); return; } // (full, nothing chambered: just work the action)
    if (this.reloading || w.mag >= mag || this.swapT > 0) return;
    // something to reload from: a fuller magazine, or rounds
    const isMag = G.Gear.ammoFor(w.def).kind === 'mag', best = isMag ? G.Gear.pickMag(this, w) : null;
    if (isMag ? !best : !G.Gear.feeds(this, w.def).length) { if (!this.noAmmoT || this.noAmmoT < performance.now()) { G.HUD.toast('', 'No magazines for it on you', 1.2); this.noAmmoT = performance.now() + 1500; } return; }
    if (w.def.enbloc && w.mag > 0) return;
    this.reloading = true;
    this.reloadMode = isMag && !w.def.enbloc ? 'retain' : 'plain';
    this.reloadPackK = best && best.pack ? 1.8 : 1;
    this.magDropped = false; this.dumpDest = null;
    this.burstQ = 0;
    this.reloadEmpty = G.chambered(w.def) ? !w.chamber : w.mag === 0; // (dry: it'll need the action worked)
    this.reloadN = mag - w.mag; // (rounds to go in: a derringer with one fired takes just the one)
    // A reload is put together from what the gun needs: the magazine change, then from empty either a thumb on
    // the bolt catch (a gun that locked open on its last round: quick) or the action worked by hand (a rack)
    this.reloadAct = this.reloadEmpty && isMag && !w.def.enbloc && !w.def.akimbo && G.VMAnim.kinds(w.def).action ? (G.boltHold(w.def) ? 'release' : 'rack') : null; // (a revolver has nothing to work)
    this.reloadTimes(w.def);
    this.reloadEv = 0;
    G.Casings.emptied(w.def, mag - w.mag, w.spent); w.spent = []; // a revolver or break-action: the empties fall out (each hull its load's colour)
    if (w.def.shell || !G.Audio.sample('pull_magazine')) G.Audio.reload();
  },
  reloadTime(def) { return def.reload; },
  ACT_T: { release: 0.4, rack: 0.6 },
  // how far through its motions a magazine change goes before the action, from empty: it stops as the magazine
  // seats and the hand goes straight on to the catch or the handle (no trip back to the handguard first)
  SEAT: { retain: 0.78, pouch: 0.78, floor: 0.7, plain: 0.7 },
  // the reload's length: the magazine change (how depends on where the old one goes; run dry, up to its seating:
  // reloadSeat). The action after it is its own (workAction).
  reloadTimes(def, done = 0) {
    const seat = this.reloadAct && G.VMAnim.kinds(def).reload === 'mag' ? this.SEAT[this.reloadMode] || 0.7 : 1;
    this.reloadSeat = seat;
    this.reloadTotal = this.reloadTime(def) * this.RELOAD_K[this.reloadMode] * this.reloadPackK * seat;
    const plat = G.Gunsmith.PLATFORMS[def.id];
    if (plat && plat.arch === 'derringer' && this.reloadN) this.reloadTotal *= 0.6 + 0.4 * this.reloadN / this.magSize(def); // (turning it over, opening and shutting it take most of it: one round in is a little quicker)
    this.reloadT = Math.max(0.05, this.reloadTotal - done);
  },
  // a retention reload turned into a dump reload: where the old magazine goes decides how long it takes
  toDump() {
    const def = this.cur().def;
    this.dumpDest = G.Gear.dumpGrid(this, def);
    this.reloadMode = this.dumpDest ? 'pouch' : 'floor';
    this.reloadTimes(def, this.reloadTotal - this.reloadT);
  },
  // look the weapon over: turn it, check the chamber (animated by js/vmanim.js)
  // the fire selector: on to its next position (a click), or nothing to switch to
  selectFire() {
    const w = this.cur(), modes = w && (w.def.modes || [w.def.mode]);
    if (!w || this.down || this.dead) return;
    if (modes.length < 2) { G.HUD.toast('', `The ${w.def.name} has no selector: ${G.MODE_NAME[modes[0]].toLowerCase()} only`, 1.4); G.Audio.deny(); return; }
    w.fm = modes[(modes.indexOf(this.fireMode(w)) + 1) % modes.length];
    this.burstQ = 0; this.hyperQ = 0;
    G.Audio.click();
    G.HUD.toast('', G.MODE_NAME[w.fm], 0.9);
  },
  fireMode(w) { const modes = w.def.modes || [w.def.mode]; return modes.includes(w.fm) ? w.fm : modes[0]; },
  inspect() {
    if (this.reloading || this.act || this.magChk || this.rChk || this.stowed || this.swapT > 0 || this.adsT > 0.2 || this.down || this.inspectT > 0) return;
    this.inspYaw = this.inspPitch = 0;
    this.inspectDur = this.cur().def.slot === 's' ? 2.0 : 2.6;
    this.inspectT = this.inspectDur;
  },

  weaponUpdate(dt) {
    const w = this.cur(), def = w.def, mag = this.magSize(def);
    this.fireCd = Math.max(-0.05, this.fireCd - dt); // (a little below zero: what's left of a frame carries into the next shot)
    this.sinceShot = (this.sinceShot || 0) + dt;
    this.swapT = Math.max(0, this.swapT - dt);
    this.flashT = Math.max(0, this.flashT - dt);
    this.kick = Math.max(0, this.kick - dt * 8);
    this.recoilStep(dt, def);
    this.swayStep(dt, def);

    this.raiseT = Math.max(0, (this.raiseT || 0) - dt);
    if (this.held) this.heldStep(dt);
    this.ads = this.mouse.r && !this.held && !this.magChk && !this.lowReady && !this.stowed && !(this.stanceT > 0) && this.raiseT <= 0 && this.swapT <= 0 && !(this.reloading && !def.shell) && G.Game.locked && !def.akimbo;
    this.adsT += ((this.ads ? 1 : 0) - this.adsT) * Math.min(1, dt * 9 * (this.cur().def.handling || 1)); // ergonomics: aim speed

    // inspecting stops the moment you do anything with the gun; racking after the last shell takes a beat
    if (this.inspectT > 0 && (this.ads || this.mouse.l || this.reloading || this.stowed || this.lowReady)) this.inspectT = 0;
    this.inspectT = Math.max(0, (this.inspectT || 0) - dt);
    // holding I holds the chamber check open (the mouse turns the gun, see bindInput); letting go finishes it
    const IH = G.VMAnim.INSPECT_HOLD;
    this.inspHold = this.inspectT > 0 && !!this.keys.KeyI && 1 - this.inspectT / this.inspectDur >= IH;
    if (this.inspHold) this.inspectT = this.inspectDur * (1 - IH);
    else if ((this.inspYaw || this.inspPitch) && !(this.rChk && !this.rChk.rel)) { const k = Math.min(1, dt * 6); this.inspYaw -= this.inspYaw * k; this.inspPitch -= this.inspPitch * k; if (Math.abs(this.inspYaw) + Math.abs(this.inspPitch) < 1e-3) this.inspYaw = this.inspPitch = 0; }
    // holding R: the magazine check (js/vmanim.js magCheckClip). Out, look, and back in when you let go (or do anything else).
    if (this.rHeldAt && performance.now() - this.rHeldAt > 260) {
      this.rHeldAt = 0;
      if (!this.reloading && !w.noMag && G.VMAnim.canMagCheck(G.R.vm)) { this.magChk = { k: 0, back: 0, yaw: 0, pitch: 0 }; this.inspectT = 0; G.Audio.click(); }
      else if (!this.reloading && !this.act) { this.rChk = { k: 0, rel: false }; this.inspectT = 0; this.inspYaw = this.inspPitch = 0; G.Audio.click(); }
    }
    // held R on a gun with no magazine to pull: into the chamber check (0.45 s), held while R is (the mouse turns the
    // gun, as a held inspect's), and back out when you let go or do anything else (0.35 s)
    const rc = this.rChk;
    if (rc) {
      if (!rc.rel && (this.mouse.l || this.mouse.r || this.stowed || this.lowReady || this.down || this.swapT > 0 || this.reloading || !this.keys.KeyR)) rc.rel = true;
      rc.k = rc.rel ? rc.k - dt / 0.35 : Math.min(1, rc.k + dt / 0.45);
      if (rc.rel && rc.k <= 0) this.rChk = null;
      this.fireCd = Math.max(this.fireCd, 0.12);
    }
    const mc = this.magChk;
    if (mc) {
      if (!mc.rel && (this.mouse.l || this.mouse.r || this.stowed || this.lowReady || this.down || this.swapT > 0 || this.reloading || !this.keys.KeyR)) mc.rel = true;
      if (!mc.rel) mc.k = Math.min(1, mc.k + dt / 0.6);
      else {
        if (!mc.back) mc.back = Math.max(0.001, 1 - mc.k);
        mc.back += dt / 0.5;
        if (mc.back >= 0.78 && !mc.seated) { mc.seated = true; G.Audio.sample('insert_magazine', 0.35, 1.2) || G.Audio.click(); }
        if (mc.back >= 1) this.magChk = null;
      }
      this.fireCd = Math.max(this.fireCd, 0.12); // (no magazine in it)
    }
    // the action being worked (js/vmanim.js rack / release): the case it held thrown as it comes back, a round fed
    // as it goes home
    const ac = this.act;
    if (ac) {
      ac.t += dt / ac.dur;
      this.fireCd = Math.max(this.fireCd, (1 - ac.t) * ac.dur);
      const pistol = def.cls === 'PST' || def.cls === 'MP';
      if (!ac.b && ac.t >= ac.back) { ac.b = true; if (w.spentCh) this.ejectSpent(w, 0); if (ac.kind === 'rack') G.Audio.sample(pistol ? 'drop_slide' : 'rack_slide', 0.8, this.boltGun(def) ? 0.85 : 1); }
      if (!ac.h && ac.t >= ac.home) { ac.h = true; this.feed(w); if (ac.kind === 'release') G.Audio.sample('drop_slide', 0.9, pistol ? 1 : 0.85); }
      if (ac.t >= 1) this.act = null;
    }
    if (this.reloading) {
      this.reloadT -= dt;
      if (!def.shell && this.reloadTotal) {
        const k = 1 - this.reloadT / this.reloadTotal, pistol = def.cls === 'PST' || def.cls === 'MP';
        // the old magazine leaves your hand onto the floor (as the viewmodel lets go of it)
        const km = k * (this.reloadSeat || 1); // (through the magazine change's motions)
        if (this.reloadMode === 'floor' && !this.magDropped && !w.noMag && km > (pistol ? 0.06 : 0.2)) this.magDropped = G.Casings.dropMag(def) || true;
        if (this.reloadEv === 0 && km > (this.reloadMode === 'retain' || this.reloadMode === 'pouch' ? 0.76 : 0.68)) { this.reloadEv = 1; G.Audio.sample('insert_magazine'); }
      }
      if (this.reloadT <= 0) {
        if (def.shell) {
          // one shell, or with a speed loader several at a push
          const got = w.mag < mag ? G.Gear.takeRounds(this, def, Math.min(def.perLoad || 1, mag - w.mag), w.ammo) : [];
          if (got.length) { w.mag += got.length; w.ammo = got[got.length - 1]; if (w.tube) w.tube.push(...got); G.Audio.sample('insert_magazine', 0.5, 1.6) || G.Audio.shell(); }
          if (w.mag < mag && w.reserve > 0) { this.reloadT = this.reloadTime(def); this.reloadTotal = this.reloadT; }
          else { this.reloading = false; if (this.reloadEmpty) this.rack(w); else this.feed(w); }
        } else {
          // a fresh magazine in (the old one goes back in its pouch), or loose rounds into a break-action
          if (this.reloadMode === 'pouch' || this.reloadMode === 'floor') {
            this.dumped = null;
            const went = G.Gear.dumpMag(this, w, mag, this.dumpDest);
            // the magazine on the floor is that one (it can be picked up again)
            if (went === 'floor') { const c = this.magDropped && this.magDropped !== true ? this.magDropped : G.Casings.dropMag(def); if (c && this.dumped) c.item = this.dumped; }
          } else if (G.Gear.ammoFor(def).kind === 'mag') G.Gear.swapMag(this, w, mag);
          else { const got = G.Gear.takeRounds(this, def, mag - w.mag, w.ammo); w.mag += got.length; for (const t of got) w.tube.push(t); if (got.length) w.ammo = got[got.length - 1]; }
          this.reloading = false;
          if (this.reloadAct) this.workAction(w, this.reloadAct, this.reloadSeat < 1 ? this.reloadSeat : null); // run dry: then the action, straight on
          else this.feed(w);
          if (!G.Audio.samples.insert_magazine) G.Audio.click();
        }
      }
    }

    const trigger = this.mouse.l && !G.Game.chatOpen && G.Game.locked;
    const pressed = trigger && !this.lastTrigger;
    this.lastTrigger = trigger;
    // miniguns spin up before they fire and wind down when you let go
    if (def.spinUp) {
      const spinning = trigger && !this.lowReady && this.swapT <= 0;
      if (spinning && this.spin === 0) G.Audio.spinUp(def.spinUp);
      this.spin = spinning ? Math.min(1, this.spin + dt / def.spinUp) : Math.max(0, this.spin - dt / (def.spinUp * 1.5));
    }
    if (this.out || this.stanceT > 0 || this.swapT > 0 || this.lowReady || this.stowed || this.held || this.raiseT > 0 || (G.Game.hub && !G.Range.on())) { this.burstQ = 0; return; } // (the hangar's no place for it: the range is)
    // a bolt gun: the shot's case stays in till you work the bolt, which you do as you let go of the trigger (hold
    // it to stay on the sight and watch where it went)
    if (w.spentCh && !trigger && this.fireCd <= 0 && !this.act && !this.reloading) { this.rack(w); return; }
    const mode = this.fireMode(w); // where the selector is
    if (mode === 'burst' && this.pressBuf > 0 && this.burstQ === 0 && this.fireCd <= 0) { this.burstQ = def.burst || 3; this.pressBuf = 0; }
    if (mode === 'hyper' && pressed) this.hyperQ = def.hyper;
    if (mode === 'hyper' && !trigger) this.hyperQ = 0;
    const want = mode === 'auto' || mode === 'hyper' ? trigger && (!def.spinUp || this.spin >= 1) : mode === 'semi' ? this.pressBuf > 0 : this.burstQ > 0;
    if (!want || this.fireCd > 0) return;
    if (def.missing && def.missing.length) { // a core part off: the trigger does nothing
      if (pressed || this.pressBuf > 0) {
        G.Audio.dry();
        const mis = def.misfit || [], none = def.missing.filter((s) => !mis.includes(s));
        G.HUD.toast('', `It won't fire: ${[...none.map((s) => 'no ' + G.Gunsmith.SLOT_LABEL[s].toLowerCase()), ...mis.map((s) => `the ${G.Gunsmith.PARTS[def.build[s]].name} doesn't fit the ${def.name}`)].join(', ')}`, 1.6);
      }
      this.burstQ = 0; this.pressBuf = 0;
      return;
    }
    const ch = G.chambered(def);
    if (ch && !w.chamber && (w.mag > 0 || w.spentCh) && (!this.reloading || def.shell) && (pressed || this.pressBuf > 0)) { this.reloading = false; this.rack(w); this.burstQ = 0; this.pressBuf = 0; return; } // click: tap, rack (shells: stop loading and rack)
    if (ch ? !w.chamber : w.mag <= 0) {
      if (pressed || mode !== 'auto' || !this.dryT || this.dryT < performance.now()) { G.Audio.dry(); this.dryT = performance.now() + 300; }
      this.burstQ = 0; this.pressBuf = 0; // just the click: reloading is up to you (R)
      return;
    }
    if (this.reloading) { if (def.shell) this.reloading = false; else return; }
    const bolt = ch && this.boltGun(def), round = w.chamber;
    this.shoot(w);
    if (bolt) { w.chamber = null; w.spentCh = round || w.ammo; } // (the case stays in: js/player.js rack)
    else if (ch) { w.chamber = null; this.feed(w, true); } else w.mag--; // (the action strips the next round into the chamber)
    // AN-94 style hyper-burst: the first rounds of each pull leave at a much higher rate. The wait after this
    // round is set by the next one: still part of the pair (hyper rate), or the gun's own cyclic rate after it.
    if (this.hyperQ > 0) this.hyperQ--;
    const rate = mode === 'hyper' && this.hyperQ > 0 ? def.hyperRpm : mode === 'burst' && def.burstRpm ? def.burstRpm : def.rpm;
    // high rates aren't rounded up to whole frames: within a string of shots, what's left of the last frame
    // carries over (the first shot of a pull starts the clock fresh)
    this.fireCd = (this.sinceShot > 60 / rate + 0.034 ? 0 : Math.max(this.fireCd, -0.034)) + 60 / rate;
    this.sinceShot = 0;
    if (bolt) this.fireCd = Math.max(0.25, this.fireCd - this.BOLT_T); // (the rest of the gun's rate is the bolt, worked by hand)
    this.cycleMax = this.fireCd;
    this.cylTarget += Math.PI / 3;
    if (def.enbloc && w.mag === 0) { // the clip flies out with the last round's case ("ping"): it goes back in your kit, empty
      G.Audio.ping();
      const clip = G.Gear.ammoItem(w.def, 0, w.ammo, w.def.build && w.def.build.mag);
      if (!G.Gear.stow(this, clip)) this.dropItem(clip); // (no room on you: at your feet)
      w.tube = []; w.noMag = true; // (the gun stands open for the next one)
    }
    this.pressBuf = 0;
    if (mode === 'burst') { this.burstQ--; if (this.burstQ <= 0 || !G.loaded(w)) { this.burstQ = 0; this.fireCd += 0.24; } }
  },
  // the next round from the magazine (or tube) into an empty chamber
  feed(w) {
    if (!G.chambered(w.def) || w.chamber || w.mag <= 0) return false;
    w.chamber = w.tube && w.tube.length ? w.tube.pop() : w.ammo;
    w.mag--;
    if (G.GunAudio.available()) G.GunAudio.buildDry(G.Gunsmith.roundSoundKey(w.def, w.chamber)); // (its report ready for the shot: a no-op once it is)
    return true;
  },
  // working the action by hand: a round from the magazine into the chamber (a moment, both hands; a bolt gun's
  // bolt, the right hand, throwing the case it last fired if that's still in there)
  BOLT_T: 0.7,
  rack(w) {
    if (!(G.chambered(w.def) && !w.chamber && w.mag > 0) && !w.spentCh) return;
    this.workAction(w, 'rack');
  },
  // The action worked by hand, its own animation (js/vmanim.js): kind 'rack' (pulled through and let go) or
  // 'release' (locked open: the catch hit). After a magazine change run dry it follows on from the seating (seat:
  // how far through its motions that went); a partial reload has none. The rounds move as the action does (above).
  workAction(w, kind, seat = null) {
    const ev = G.VMAnim.actEvents(kind, G.VMAnim.kinds(w.def).action);
    const dur = kind === 'release' ? this.ACT_T.release : this.boltGun(w.def) ? this.BOLT_T : seat ? this.ACT_T.rack : 0.45;
    this.act = { kind, seat, t: 0, dur, back: ev.back, home: ev.home };
    this.fireCd = Math.max(this.fireCd, dur);
  },
  // a bolt-action: its bolt's worked by hand after every shot
  boltGun(def) { const P = G.Gunsmith.PLATFORMS[def.id]; return !!(P && P.spec && P.spec.bolt); },
  // the fired case out of the port (at: how long from now)
  ejectSpent(w, at) { G.Casings.fired(w.def, true, null, null, w.spentCh, at); w.spentCh = null; },

  shoot(w) {
    // the round being fired, and the gun as that round sees it (G.roundDef: hollow points, AP, slugs...)
    const round = G.chambered(w.def) && w.chamber ? w.chamber : w.tube && w.tube.length ? w.tube.pop() : w.ammo; // (the chambered one, if it has a chamber)
    if (!G.chambered(w.def)) { w.spent = w.spent || []; w.spent.unshift(round); w.spent.length = Math.min(w.spent.length, 8); } // (the empties a revolver or break-action keeps till it's opened)
    const def = G.roundDef(w.def, round), cam = G.R.camera;
    this.sinceFire = 0;
    // the round leaves along the gun's bore: your aim plus the gun's offset (recoil, sway), not the camera
    const off = this.aimOffset();
    const aq = new THREE.Quaternion().setFromEuler(new THREE.Euler(this.pitch + off.p, this.yaw + off.y, cam.rotation.z, 'YXZ'));
    const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(aq);
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(aq);
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(aq);
    const origin = cam.position.clone();
    let side = 1;
    if (def.akimbo) { this.flashIdx = this.flashIdx ? 0 : 1; side = this.flashIdx ? 1 : -1; }
    else if ((G.Gunsmith.PLATFORMS[w.def.id] || {}).arch === 'derringer') this.flashIdx = w.tube && w.tube.length ? 0 : 1; // (the top barrel first, then the bottom)
    const muzzle = origin.clone().addScaledVector(fwd, 0.7).addScaledVector(right, (def.akimbo ? 0.13 * side : 0.17) * (1 - this.adsT)).addScaledVector(up, -0.12 * (1 - this.adsT) - 0.05);

    let spread = G.U.lerp(def.spreadNoLaser && !w.laser ? def.spreadNoLaser : def.spread, def.ads, this.adsT); // (a laser helps only while it's on)
    spread *= this.steadiness();
    if (this.prone) spread *= 0.5; else if (this.crouch) spread *= 0.75;
    spread *= 1 + Math.min(this.hspeed / this.SPEED.walk, 1.4) * 0.8 * (1 - this.adsT * 0.6);
    if (!this.onGround) spread *= 1.8;
    const sr = (spread * Math.PI) / 180;

    // where the gun actually points this shot (one error for the whole shot), then for a shotgun the pattern
    // around it: the choke's cone, denser in the middle (roughly normal, clipped at 1.6x)
    const a0 = Math.random() * Math.PI * 2, r0 = Math.sqrt(Math.random()) * Math.tan(sr);
    const aim = fwd.clone().addScaledVector(right, Math.cos(a0) * r0).addScaledVector(up, Math.sin(a0) * r0).normalize();
    const pr = Math.tan(((def.choke || 0) * Math.PI) / 180);
    // each round (or pellet) leaves as a projectile (fly); the squad is told where it's headed, as far as the
    // walls go (to draw it and hear it go by)
    const shot = { ff: new Map(), w: w.def.code, am: round, f: [origin.x, origin.y, origin.z].map((v) => Math.round(v * 100) / 100), tos: def.pellets > 1 ? [] : null }; // (tos: each pellet's end, for the highlights)
    for (let i = 0; i < def.pellets; i++) {
      let dir = aim;
      if (def.pellets > 1 && pr > 0) {
        const a = Math.random() * Math.PI * 2, rr = pr * Math.min(1.6, Math.sqrt(-2 * Math.log(1 - Math.random())) * 0.6);
        dir = aim.clone().addScaledVector(right, Math.cos(a) * rr).addScaledVector(up, Math.sin(a) * rr).normalize();
      }
      this.fly(origin, dir, muzzle, def, round, i === 0 || def.pellets <= 10, shot, w.sup, G.boreTip(w));
    }
    const firstEnd = shot.to;

    if (def.cls === 'RAIL') G.Audio.rail();
    else if (def.cls === 'BOW') G.Audio.bow();
    else if (!G.GunAudio.play(G.Gunsmith.roundSoundKey(def, round), null)) G.Audio.shot(w.sup ? G.SUPPRESSOR.snd : def.snd); // (the report of the round fired, not just the gun's)
    if (!w.sup && def.cls !== 'BOW') {
      this.flashT = 0.05;
      G.R.vmMuzzle.intensity = 3;
      G.R.muzzleFlashAt(muzzle, def.tracer || 0xffb060);
    }

    if (G.Game.hub && G.Range.on()) G.Course.shot(); // (on the clock in the IPSC course: a split)
    if (!this.boltGun(w.def)) G.Casings.fired(def, true, null, null, round); // the spent case, out of the port (a bolt gun's when the bolt's worked)
    // the kick only throws the muzzle for the next shot: this one already left where you were aiming
    this.recoilKick(def);
    this.kick = Math.min(1, this.kick + 0.35 + def.recoil * 0.06);

    const r2 = (v) => Math.round(v * 100) / 100;
    // (a shotgun's: every pellet's end, so the squad's highlights show the pattern)
    const tos = shot.tos ? shot.tos.slice(0, 24).map((p) => [r2(p.x), r2(p.y), r2(p.z)]) : undefined;
    if (G.Highlights) { shot.rec = G.Highlights.shot('p' + G.Net.myId, muzzle, firstEnd, def.code, round, tos); if (shot.rec) shot.rec.f0 = muzzle.clone(); }
    G.Net.toHost({ t: 'shot', f: [r2(muzzle.x), r2(muzzle.y), r2(muzzle.z)], to: [r2(firstEnd.x), r2(firstEnd.y), r2(firstEnd.z)], tos, w: def.code, am: round, sil: def.cls === 'BOW' ? 2 : w.sup ? (def.quiet ? 2 : 1) : 0 });
  },

  // ---------------------------------------------------------------- rounds in flight
  // Every round is a projectile. It leaves at its muzzle velocity (G.roundSpeed: the caliber, the barrel, the
  // load), slows with drag and falls with gravity, and is stepped a frame at a time: each step is a short straight
  // segment, checked against the world and against everyone's hitboxes as they stand that frame (so someone can
  // step out of its way, or into it). The sights are zeroed (G.zeroOf): it leaves a hair above the line of sight,
  // crosses it at the zero and drops below it further out. What you see is a streak from the muzzle that closes
  // onto the round's true path (from your eye) over its first few metres: a faint one for ordinary rounds, a long
  // bright one for tracers.
  // shot: what the shot's rounds share (the friendly-fire hits to send, together); sup: through a suppressor
  fly(origin, dir, muzzle, def, am, show, shot, sup, tip = null) {
    const rail = def.cls === 'RAIL', v0 = rail ? 3000 : Math.max(40, G.roundSpeed(def, am) || 400);
    const d = dir.clone(), start = origin.clone(), drag = rail ? 1e9 : G.dragOf(def, am);
    const upP = new THREE.Vector3(0, 1, 0).addScaledVector(d, -d.y);
    if (!rail && upP.lengthSq() > 1e-6) {
      // it starts the sight height under your eye, the bore tipped up over the line of sight as the sights are set
      // (G.boreTip: zeroed for the class's distance, then turned at the zeroing table; every load from the same tip)
      upP.normalize();
      const k = tip != null ? tip : G.zeroSlope(def, am, G.zeroOf(def)) || 0;
      start.addScaledVector(upP, -G.sightH(def));
      d.addScaledVector(upP, k).normalize();
    }
    const tracer = !!(G.AMMO[am] && G.AMMO[am].tracer);
    this.rounds = this.rounds || [];
    if (!shot.to || shot.tos) { const end = this.predictEnd(start, d.clone().multiplyScalar(v0), drag, rail ? 0 : G.GRAVITY); if (!shot.to) shot.to = end; if (shot.tos) shot.tos.push(end); }
    this.rounds.push({ p: start, v: d.multiplyScalar(v0), def, am, drag, drag0: drag, grav: rail ? 0 : G.GRAVITY,
      n: 0, dist: 0, t: 0, off: muzzle.clone().sub(start), muzzle: muzzle.clone(), show, tracer, shot, hit: new Set(), proj: G.Ballistics.projectile(def, am), // (proj: the round itself, js/ballistics.js)
      trail: G.Rig.debug ? G.R.trailStart(shot, start, v0) : null }); // (F9: its path drawn as it flies, coloured by its speed, js/render.js trails)
  },
  // A suspect's round (the host's, from js/server.js fire): as any other, flown here where the shooter's run. It goes by
  // suspects and civilians, and what it does to an officer is worked out here, as your rounds' are.
  enemyRound(id, from, dir, def, am, shot) {
    const drag = G.dragOf(def, am), v0 = Math.max(40, G.roundSpeed(def, am) || 400);
    (this.rounds = this.rounds || []).push({ p: from.clone(), v: dir.clone().multiplyScalar(v0), def, am, drag, drag0: drag, grav: G.GRAVITY, n: 0, dist: 0, t: 0, off: new THREE.Vector3(), muzzle: from.clone(), show: false, tracer: false, shot, hit: new Set(), proj: G.Ballistics.projectile(def, am), enemy: id,
      trail: G.Rig.debug ? G.R.trailStart(shot, from, v0) : null });
  },
  // where a round would end up if nobody's in the way: its arc, stepped against the walls only (what the squad
  // is told, to draw it going there)
  predictEnd(p0, v0, drag, grav) {
    const map = G.Game.map, p = p0.clone(), v = v0.clone(), dt = 1 / 60;
    for (let i = 0, dist = 0; i < 240 && dist < G.ROUND_LIFE.dist; i++) {
      const p1 = p.clone().addScaledVector(v, dt); p1.y -= 0.5 * grav * dt * dt;
      const seg = p1.clone().sub(p), len = seg.length();
      if (len < 1e-4) break;
      seg.divideScalar(len);
      const h = G.Level.raycast(map, p.x, p.y, p.z, seg.x, seg.y, seg.z, len);
      if (h.t < len) return p.addScaledVector(seg, h.t);
      v.multiplyScalar(Math.exp(-len / drag)); v.y -= grav * dt;
      p.copy(p1); dist += len;
    }
    return p;
  },
  // every round in flight, one frame on (and the friendly fire they did, sent)
  stepRounds(dt) {
    const rs = this.rounds;
    if (!rs || !rs.length) return;
    dt = Math.min(dt, 0.05);
    const shots = new Set();
    for (let i = rs.length - 1; i >= 0; i--) {
      const b = rs[i];
      shots.add(b.shot);
      if (!G.Game.map || this.stepRound(b, dt)) rs.splice(i, 1);
    }
    for (const sh of shots) {
      if (sh.ff.size) { for (const [tg, q] of sh.ff) G.Net.toHost(Object.assign({ t: 'ff', tg, f: sh.f, e: sh.enemy }, q)); sh.ff.clear(); } // (what they did to a teammate)
      if (sh.fx && sh.fx.length) G.Net.toHost({ t: 'rfx', a: sh.fx.splice(0, 32), e: sh.end, w: sh.w }); // (the marks it left, for the squad)
    }
  },
  // one round, one frame: true when it's done (stopped in something, spent, out of range)
  stepRound(b, dt) {
    const sp = b.v.length();
    // where it gets to this frame: drag takes speed by the metre (G.dragOf), gravity pulls it down
    const p1 = b.p.clone().addScaledVector(b.v, dt); p1.y -= 0.5 * b.grav * dt * dt;
    const seg = p1.clone().sub(b.p), len = seg.length();
    if (len < 1e-4) return true;
    const dir = seg.divideScalar(len);
    const end = this.roundSegment(b, b.p, dir, len);
    const k = Math.exp(-len / b.drag);
    b.v.multiplyScalar(k); b.v.y -= b.grav * dt;
    b.t += dt;
    const head = end ? end.p : b.turned ? b.at : p1, way = b.turned ? b.v.clone().normalize() : dir;
    if (b.trail && !(end && end.body)) G.R.trailAdd(b.trail, head, !!end, end ? end.v : b.v.length()); // (stopped in someone: its track through them ends the trail)
    // the streak you see: from the muzzle side, closing onto the true path over the first 12 m
    if (b.show || b.tracer) {
      const came = b.dist + (end ? end.t : len), near = Math.max(0, 1 - came / 12);
      G.R.bullet(head.clone().addScaledVector(b.off, near), way, came - (b.came0 || 0), b.def, b.tracer, sp);
    }
    if (end) { // (where it ended up, if it came here more or less straight: the replays draw it to here, js/highlights.js)
      if (b.shot.rec && !b.def.explosive && b.def.pellets <= 1 && b.events && b.p.clone().sub(b.shot.rec.f0).normalize().dot(way) > 0.99) { b.shot.rec.to = end.p.toArray().map((q) => Math.round(q * 100) / 100); b.shot.end = b.shot.rec.to; }
      if (b.def.cls === 'RAIL') G.R.tracer(b.muzzle, end.p, b.def.tracer || 0x55ddff, 0.06); // (a railgun leaves its line hanging)
      return true;
    }
    b.dist += len; b.p.copy(head); b.turned = false;
    return b.t > G.ROUND_LIFE.t || b.dist > G.ROUND_LIFE.dist || b.v.length() < G.ROUND_LIFE.v || b.p.y < ((G.Game.map && G.Game.map.minY) || 0) - 2; // (through the lowest floor: a basement's is below ground)
  },
  // A round's step from a along dir for len metres, a leg at a time: everyone in its way and the first solid (nearest
  // first). A body is worked out physically (js/ballistics.js through: their armour, then the track through them, organ by
  // organ), and a solid from what it's built of (crossSolid: js/materials.js); either can stop it, turn it (a ricochet)
  // or let it through, slower, off line and changed (b.proj, the round as it now is: its drag goes with it), and it goes
  // on from there with what's left of the step. Returns where it stopped ({ p, t }), or null if it flies on (b.at, if it
  // was turned: where it's got to, and b.v what it's doing now).
  roundSegment(b, a, dir, len) {
    const map = G.Game.map, L = G.Level, def = b.def, B = G.Ballistics;
    if (def.explosive && !b.enemy) {
      const wall = L.raycast(map, a.x, a.y, a.z, dir.x, dir.y, dir.z, len, { glass: true }), hitWall = wall.t < len - 1e-4, wallT = Math.min(wall.t, len), hits = this.roundHits(b, a, dir, wallT), t = hits.length ? hits[0].t : hitWall ? wallT : null;
      if (t == null) { this.roundGlass(a, dir, wall, len); return null; }
      const p = a.clone().addScaledVector(dir, Math.max(0, t - 0.15));
      this.explode(p, def.explosive.r, def.explosive.dmg, false);
      return { p, t };
    }
    const o = a.clone(), v0 = b.v.length();
    let d = dir.clone(), rest = len, v = v0, done = 0, turned = false;
    const on = (t) => { o.addScaledVector(d, t); rest -= t; done += t; }; // (along this leg)
    const turn = (nd, nv) => { d = nd; v = nv; turned = true; b.events = (b.events || 0) + 1; };
    const stopped = (p, t, body, vs) => ({ p, t, body, v: vs });
    legs: for (let leg = 0; leg < 12 && rest > 1e-4 && v > G.ROUND_LIFE.v; leg++) {
      const wall = L.raycast(map, o.x, o.y, o.z, d.x, d.y, d.z, rest), hitWall = !!wall.solid && wall.t < rest - 1e-4, wallT = Math.min(wall.t, rest);
      const look = hitWall ? wallT : rest + 0.8; // (a body that straddles the end of this step: all of it, now)
      for (const h of this.roundHits(b, o, d, wallT)) {
        const tr = b.trail ? [] : null, ev = h.ev, mate = h.mate; // (F9: the track through them, a step at a time, for the trail)
        // Whoever fired it decides what it did, on what they can see: the body as it stands on this screen, and what it's wearing
        const rig = ev ? ev.rig : mate ? mate.rig : h.rig, armour = ev ? B.suspectArmour(ev) : mate ? B.stateArmour(mate.st) : B.kitArmour(this);
        const r = B.through(rig, o, d, v, b.proj, armour, look, tr);
        if (!r || r.entryT == null) continue; // (inside the hitbox, outside the body: a near miss)
        b.hit.add(ev || mate || this);
        const hp = o.clone().addScaledVector(d, r.entryT);
        if (tr) { this.trailTrack(b, o, d, r, v, tr, h.self ? null : rig); G.HUD.hbPath = r.log.concat({ m: r.exitV ? 'out' : 'stopped', v: Math.round(r.exitV) }); } // (F9: what it went through)
        if (ev) {
          B.wearOut(armour);
          this.hitEnemy(ev, r);
          ev.engagedT = performance.now(); // (yours to watch: its body's physics wherever it is, js/views.js)
          ev.rig.hit(d);
          ev.selfHit = true;
          ev.lastHitDir = d.clone().setY(0).normalize();
        } else {
          const out = B.outcome(r, armour);
          if (h.self) {
            if (b.enemy && G.Highlights) G.Highlights.hitBy(G.Net.myId, b.enemy);
            this.applyWounds(out, o.clone(), !b.enemy);
          } else { // (theirs to take, as it was here: told to them at the end of the frame)
            const q = b.shot.ff.get(mate.id) || { ws: [], rang: 0, stopped: 0, wear: {}, at: hp.toArray().map((x) => Math.round(x * 100) / 100) };
            q.ws.push(...out.ws); q.rang |= out.rang; q.stopped += out.stopped;
            for (const [k, j] of Object.entries(out.wear)) q.wear[k] = (q.wear[k] || 0) + j;
            b.shot.ff.set(mate.id, q);
            mate.rig.hit(d);
          }
        }
        if (r.hits.some((x) => x.armour.some((q) => !q.through))) { G.R.impact(hp, null, 'armor'); if (G.Audio.armorHit) G.Audio.armorHit(); }
        if (r.hits.some((x) => x.E > 1)) {
          G.R.impact(hp, null, 'blood');
          // out the far side onto a wall close behind them
          if (r.exitV) { const back = L.raycast(map, hp.x, hp.y, hp.z, d.x, d.y, d.z, 1.6); if (back.n && back.t < 1.6) G.R.bloodWall(hp.clone().addScaledVector(d, back.t), back.n, 0.25 + 0.25 * (1 - back.t / 1.6)); }
        }
        b.proj = r.p;
        if (r.ric) { // off their armour (or round their skull) and away
          on(r.ric.t);
          turn(B.deflect(d, r.ric, r.ric.n), r.ric.v);
          o.addScaledVector(d, 0.02);
          this.roundMark(b, o, r.ric.n, 'metal', 'r', v);
          continue legs;
        }
        if (!r.exitV) return stopped(o.clone().addScaledVector(d, r.entryT), done + r.entryT, true, 0);
        on(r.exitT);
        turn(B.deflect(d, { dev: r.dev, bend: 0 }, null), r.exitV);
        continue legs;
      }
      if (!hitWall) { on(rest); break; }
      // the solid it's met: a target if it's that, and then what it's made of
      const s = wall.solid, at = o.clone().addScaledVector(d, wall.t), vIn = v, r = B.crossSolid(map, b.proj, v, wall, o, d);
      if (s.target) G.Range.hit(s, at, d, b.proj.m * vIn);
      if (wall.pane != null && !(s.win && s.win.armor)) this.roundPane(wall.pane, at, d);
      if (!wall.view) this.roundMark(b, at, wall.n, r.fx, r.ric ? 'r' : 'e', vIn, s);
      else if (b.trail) G.R.trailAdd(b.trail, at, true, vIn);
      if (r.ric) {
        on(wall.t);
        o.addScaledVector(new THREE.Vector3(...wall.n), 0.004);
        turn(B.deflect(d, r, wall.n), r.v);
        if (G.Audio.ricochet) G.Audio.ricochet(at);
        continue;
      }
      if (!r.v) return stopped(at, done + wall.t, false, vIn); // (v: how fast it struck)
      const n0 = wall.n;
      on(r.t);
      if (!wall.view) this.roundMark(b, o, r.nOut, r.fxOut, 'x', r.v);
      turn(B.deflect(d, r, n0), r.v);
      o.addScaledVector(d, 0.004);
    }
    if (v <= G.ROUND_LIFE.v) return stopped(o.clone(), done, false, v);
    if (turned) {
      b.at = o.clone(); b.v.copy(d).multiplyScalar(v); b.turned = true;
      b.drag = B.flightDrag(b.proj, b.drag0);
      if (done > 0) b.came0 = b.dist + done; // (the streak starts over from the last thing it left)
      b.off.set(0, 0, 0);
    }
    return null;
  },
  // who's on the line from a along dir, out to t, nearest first
  roundHits(b, a, dir, wallT) {
    const hits = [];
    if (!b.enemy) for (const ev of G.Views.enemies.values()) { // (a suspect's round looks for officers: it goes by anyone else)
      if (!ev.alive || b.hit.has(ev) || !ev.rig) continue;
      const sc = ev.def.scale;
      // cheap reject: the segment must pass within ~1.4 m of the body before testing bone capsules
      const cx = ev.pos.x - a.x, cy = ev.pos.y + sc - a.y, cz = ev.pos.z - a.z;
      const along = cx * dir.x + cy * dir.y + cz * dir.z;
      if (along < -1.5 || along > wallT + 1.5) continue;
      const px = cx - dir.x * along, py = cy - dir.y * along, pz = cz - dir.z * along;
      if (px * px + py * py + pz * pz > 1.96 * sc * sc) continue;
      const h = G.Rig.raycast(ev.rig, a, dir, wallT);
      if (h) hits.push({ t: h.t, zone: h.zone, c: h.c, up: h.up, side: h.side, head: h.zone === 'head', ev, behind: h.behind });
    }
    // friendly fire is on: your teammates are in the way too (not in the hangar: the range is for everyone)
    if (!G.Game.hub) for (const pv of G.Views.players.values()) {
      if (!pv.st || pv.st.dd || !pv.st.p || !pv.rig || !pv.rig.root.visible || b.hit.has(pv)) continue;
      const cx = pv.pos.x - a.x, cy = pv.pos.y + 1 - a.y, cz = pv.pos.z - a.z, along = cx * dir.x + cy * dir.y + cz * dir.z;
      if (along < -1.5 || along > wallT + 1.5) continue;
      const h = G.Rig.raycast(pv.rig, a, dir, wallT);
      if (h) hits.push({ t: h.t, zone: h.zone, c: h.c, side: h.side, mate: pv, behind: h.behind });
    }
    // and you: once it's been turned, a round can come back; a suspect's is meant for you
    if ((b.events || b.enemy) && !G.Game.hub && !b.hit.has(this) && !this.down && !this.dead) {
      const cx = this.pos.x - a.x, cy = this.pos.y + 1 - a.y, cz = this.pos.z - a.z, along = cx * dir.x + cy * dir.y + cz * dir.z;
      if (along > -1 && along < wallT + 1 && Math.hypot(cx - dir.x * along, cy - dir.y * along, cz - dir.z * along) < 1.3) {
        const rig = G.Ballistics.self(), h = G.Rig.raycast(rig, a, dir, wallT);
        if (h) hits.push({ t: h.t, zone: h.zone, c: h.c, side: h.side, self: true, rig });
      }
    }
    return hits.sort((x, y) => x.t - y.t);
  },
  // where a round struck or left something: its mark here (s: a target's own, its picture), on its trail, and for the squad
  roundMark(b, p, n, fx, kind, v, s) {
    G.R.impactOn(p, n, s, fx);
    if (b.trail) G.R.trailAdd(b.trail, p, true, v);
    (b.shot.fx = b.shot.fx || []).push(G.Ballistics.mark(p, n, fx, kind));
  },
  // a pane a round went through breaks (here at once, and for everyone through the host)
  roundPane(id, at, dir) {
    const win = G.Game.map.windows[id];
    if (!win || win.broken) return;
    G.Views.breakGlass(id, at, dir);
    G.Net.toHost({ t: 'glass', ids: [id] });
  },
  // F9: a round's track through someone on its trail: in at the speed it arrived (marked), each step inside at its speed
  // as it slowed (js/ballistics.js through, traced), and where it stopped, if it did (marked)
  // (and the same track kept on them: their bones carry it as they move and fall, js/render.js woundTrack)
  trailTrack(b, a, dir, r, vIn, tr, rig) {
    const at = (t) => a.clone().addScaledVector(dir, t), pts = [];
    G.R.trailAdd(b.trail, at(r.entryT), true, vIn);
    if (tr.length) pts.push({ p: at(r.entryT), v: vIn, bone: tr[0].bone, mark: true });
    for (const s of tr) { G.R.trailAdd(b.trail, at(s.t), false, s.v); pts.push({ p: at(s.t), v: s.v, bone: s.bone }); }
    if (!r.exitV && tr.length) { G.R.trailAdd(b.trail, at(tr[tr.length - 1].t), true, 0); pts.push({ p: at(tr[tr.length - 1].t), v: 0, bone: tr[tr.length - 1].bone, mark: true }); }
    if (rig && pts.length > 1) G.R.woundTrack(rig, pts);
  },
  // the windows a blast round went through on the way break
  roundGlass(a, dir, wall, upTo) {
    for (const [id, gt] of wall.glass || []) if (gt < upTo) this.roundPane(id, a.clone().addScaledVector(dir, gt), dir);
  },
  // A round's wounds on a suspect, from its track through them (js/ballistics.js): each part's damage (a share of a
  // standard person's life) and what it did there (bleeding, a broken bone, a collapsed lung, the organs it went
  // through), for the host to apply (js/server.js applyHit, injure). A round through the brain, brainstem or the
  // spine in the neck is the end of them.
  hitEnemy(ev, r) {
    let f = 0, kill = false, head = false, ap = false;
    this.hitQ = this.hitQ || new Map();
    const q = this.hitQ.get(ev.id) || { d: 0, f: 0, h: false, k: false };
    for (const h of r.hits) {
      const w = G.Ballistics.effects(h);
      if (w.dmg < 0.05 && !w.effects.length) continue;
      f += w.dmg / 100;
      if (w.effects.includes('dead')) kill = true;
      if (h.seg === 'cranium' || h.seg === 'jaw' || h.seg === 'neck') head = true;
      if (h.armour.some((a) => a.through)) ap = true; // (through their armour, and it still did harm: for the highlights)
      (q.w = q.w || []).push([w.part, w.effects.join(','), w.side || '', w.organs.map(([id, d, hp]) => `${id}:${Math.round(Math.min(1, d / hp) * 100)}`).join(',')]);
    }
    q.f += f; q.h = q.h || head; q.k = q.k || kill; q.ap = q.ap || ap;
    this.hitQ.set(ev.id, q);
  },
  // d: plain damage (blasts); f: wounds, as a share of a standard person's life; k: a killing headshot
  queueHit(eid, dmg, head, f = 0, kill = false) {
    const q = this.hitQ.get(eid) || { d: 0, f: 0, h: false, k: false };
    q.d += dmg; q.f += f; q.h = q.h || head; q.k = q.k || kill;
    this.hitQ.set(eid, q);
  },
  flushHits() {
    if (!this.hitQ || !this.hitQ.size) return;
    for (const [e, q] of this.hitQ) {
      G.Net.toHost({ t: 'hit', e, d: Math.round(q.d), f: Math.round(q.f * 1000) / 1000, k: q.k ? 1 : 0, h: q.h, ap: q.ap ? 1 : undefined, w: q.w ? q.w.slice(0, 12) : undefined });
      this.stats.dmg += q.d + q.f * 100 + (q.k ? 100 : 0);
    }
    this.hitQ.clear();
  },

  explode(p, r, dmg, isNade) {
    G.R.explosion(p, r);
    G.Audio.boom(G.R.camera.position.distanceTo(p));
    const map = G.Game.map;
    for (const ev of G.Views.enemies.values()) {
      if (!ev.alive) continue;
      const cy = (ev.pos.y || 0) + 1.0 * ev.def.scale; // (their middle, on whatever floor they stand on)
      const d = Math.hypot(ev.pos.x - p.x, cy - p.y, ev.pos.z - p.z);
      if (d > r + 0.4 * ev.def.scale) continue;
      if (!G.Level.los(map, p.x, p.y + 0.2, p.z, ev.pos.x, cy, ev.pos.z)) continue;
      this.queueHit(ev.id, dmg * (1 - Math.min(1, d / r) * 0.6), false);
      ev.selfHit = true;
    }
    const r2 = (v) => Math.round(v * 100) / 100;
    G.Net.toHost({ t: 'boom', p: [r2(p.x), r2(p.y), r2(p.z)], r: r2(r), d: Math.round(dmg) });
  },

  // a flashbang of yours went off: the host works out who it blinds (and tells everyone, you too)
  flashBang(p) {
    const r2 = (v) => Math.round(v * 100) / 100;
    G.Net.toHost({ t: 'flash', p: [r2(p.x), r2(p.y), r2(p.z)] });
  },
  // ------------------------------------------------------------- quick slots: 3, 4 and 5
  // Each holds a kind of throwable: 'frag' or 'flash' (or nothing). The key throws one from your kit. Bound by
  // dragging a grenade onto the slot's box in the inventory (G.InvUI); kept between sessions.
  QUICK_DEFAULT: ['frag', 'flash', null],
  get quick() {
    if (!this._quick) { const q = G.U.store.get('quick', null); this._quick = Array.isArray(q) && q.length === 3 ? q.slice() : this.QUICK_DEFAULT.slice(); }
    return this._quick;
  },
  setQuick(i, kind) {
    const q = this.quick, was = kind ? q.indexOf(kind) : -1;
    if (was >= 0 && was !== i) q[was] = q[i]; // (it was on another key: they swap)
    q[i] = kind || null;
    G.U.store.set('quick', q);
    G.HUD.toast('', kind ? `${this.quickName(kind)} on key ${i + 3}` : `Key ${i + 3} cleared`, 1.2);
  },
  // the kind of quick-slot gear an item is (null: not one)
  // the kind of quick-slot gear an item is: a throwable (null: not one; medical gear isn't)
  quickKind(it) { return it && (it.k === 'frag' || it.k === 'flash') ? it.k : null; },
  quickName(kind) { return kind === 'frag' ? 'Frag' : kind === 'flash' ? 'Flashbang' : '—'; },
  // how many of that kind you carry
  quickCount(kind) { return this.kit && kind ? G.Gear.count(this, kind) : 0; },
  // ------------------------------------------------------------- gear in hand (keys 3, 4, 5)
  // The key brings that grenade into your hand (the weapon goes down; the key again, or 1 / 2, brings it back).
  // Left click pulls the pin and draws back, letting go throws it; right click picks the throw: underhand (a lob
  // that rolls on along the floor), weak, or strong. While it's in your hand, its arc shows where it'll go off.
  // Out of them, the weapon comes back up. held: { kind, cock, str, readyT (bringing it up), throwT (the throw) }.
  THROWS: [['Underhand', 6.5, 2.4], ['Weak', 10, 3], ['Strong', 15.5, 3.2]],
  equip(i) {
    const kind = this.quick[i];
    if (this.dead || this.down || this.action || G.Game.hub || this.seat != null) return; // (no throwing in the hangar)
    if (!kind) { G.HUD.toast('', `Nothing on key ${i + 3}: drag a grenade onto its box in the inventory`, 1.6); return; }
    if (this.held && this.held.kind === kind) { if (this.held.throwT < 0 && !this.held.cock) this.unequip(); return; }
    if (!this.quickCount(kind)) { G.HUD.toast('', kind === 'flash' ? 'No flashbangs' : 'No grenades', 1.2); G.Audio.deny(); return; }
    this.held = { kind, cock: false, str: this.throwStr == null ? 2 : this.throwStr, readyT: 0.35, throwT: -1, lastL: true, lastR: true };
    this.reloading = false; this.burstQ = 0; this.inspectT = 0; this.magChk = null; this.rChk = null; this.rHeldAt = 0; this.lowToggle = false;
    G.Audio.click();
  },
  unequip() {
    if (!this.held) return;
    this.held = null;
    this.raiseT = this.raiseMax = this.drawTime(); // (the weapon comes back up)
  },
  fuseOf(kind) { return kind === 'flash' ? 1.5 : 2.2; },
  // where a throw of this strength leaves your hand, and how fast (underhand: from the hip, a lob)
  throwLaunch(str) {
    const cam = G.R.camera, fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(cam.quaternion), [, sp, up] = this.THROWS[str];
    const from = cam.position.clone(), p = from.clone().addScaledVector(fwd, 0.45);
    if (str === 0) p.y -= 0.65;
    // (never from inside a wall you're standing against)
    const d = p.clone().sub(from), len = d.length(), h = G.Level.raycast(G.Game.map, from.x, from.y, from.z, d.x / len, d.y / len, d.z / len, len);
    if (h.t < len) p.copy(from).addScaledVector(d, Math.max(0, h.t - 0.12) / len);
    const v = fwd.multiplyScalar(sp).add(new THREE.Vector3(this.vel.x * 0.5, up, this.vel.z * 0.5));
    return { p, v };
  },
  heldStep(dt) {
    const h = this.held, ok = G.Game.locked && !G.Game.chatOpen, l = this.mouse.l && ok, r = this.mouse.r && ok;
    const pressL = l && !h.lastL, pressR = r && !h.lastR;
    h.lastL = l; h.lastR = r;
    if (pressR) { h.str = this.throwStr = (h.str + 1) % 3; G.Audio.click(); G.HUD.toast('', `${this.THROWS[h.str][0]} throw`, 0.8); }
    if (h.throwT >= 0) { // following through; then the next one, or the weapon back
      h.throwT += dt;
      if (h.throwT > 0.5) { if (this.quickCount(h.kind)) { h.throwT = -1; h.readyT = 0.3; } else this.unequip(); }
      return;
    }
    if (pressL) h.queued = true; // (pressed while it's still coming up: the pin comes out as soon as it's there)
    if (!l) h.queued = false;
    h.readyT -= dt;
    if (h.readyT > 0) return;
    if (h.queued && !h.cock) { h.cock = true; h.queued = false; G.Audio.pin(); } // pin out, drawn back
    if (h.cock && !l) { h.cock = false; this.throwHeld(); } // let go: thrown
    if (!h.cock && !this.down) { const { p, v } = this.throwLaunch(h.str); G.R.throwArc(G.Views.predictNade(p, v, this.fuseOf(h.kind), G.Game.map), false); }
    else if (h.cock) { const { p, v } = this.throwLaunch(h.str); G.R.throwArc(G.Views.predictNade(p, v, this.fuseOf(h.kind), G.Game.map), true); }
  },
  throwHeld() {
    const h = this.held, kind = h.kind;
    if (!G.Gear.take(this, kind)) { this.unequip(); return; }
    const { p, v } = this.throwLaunch(h.str), fuse = this.fuseOf(kind);
    G.Views.addNade(p, v, fuse, true, false, kind);
    h.throwT = 0;
    const r2 = (x) => Math.round(x * 100) / 100;
    G.Net.toHost({ t: 'nade', p: [p.x, p.y, p.z].map(r2), v: [v.x, v.y, v.z].map(r2), fuse, k: kind, s: h.str });
  },
  shout() {
    if (this.dead || (this.shoutT || 0) > performance.now()) return;
    this.shoutT = performance.now() + 1500;
    G.Audio.shout(null);
    G.HUD.toast('', G.U.pick(Math.random, ['POLICE! SHOW ME YOUR HANDS!', 'POLICE! DROP THE WEAPON!', 'GET ON THE GROUND! NOW!', 'POLICE! HANDS WHERE I CAN SEE THEM!']), 1.4);
    G.Net.toHost({ t: 'shout' });
  },
  // H: there's no medkit to slap on; your body and your medical gear are in the Tab screen
  useMed() { if (!this.dead && !this.out) G.Game.toggleInv(true); },
  // A teammate has started putting something on you (or stopped, or finished): who, what, which part, how long. The
  // HUD says so while it lasts, with the part lit on your body.
  beingTreated(by, name, part, mt, dur, off) {
    this.treating = this.treating || new Map();
    if (off) { this.treating.delete(by); return; }
    if (this.dead || !G.Med.ITEMS[mt]) return;
    this.treating.set(by, { name, part, mt, t0: performance.now(), dur: Math.max(0.5, dur || G.Med.ITEMS[mt].time) });
  },
  // how many of each medical item you carry (in the order of G.Med.ITEMS): what a teammate treating you may use of yours
  medCounts() {
    const keys = Object.keys(G.Med.ITEMS), out = keys.map(() => 0);
    if (this.kit) G.Gear.each(G.Gear.body(this), (it) => { if (it.k === 'med') { const i = keys.indexOf(it.mt); if (i >= 0) out[i] += it.n || 1; } });
    return out;
  },
  // one of your medical items, used (by a teammate, on you): off its stack, or out of its pouch
  takeMed(mt) {
    for (const g of G.Gear.body(this)) for (const p of g.items) if (p.it.k === 'med' && p.it.mt === mt) {
      if ((p.it.n || 1) > 1) p.it.n--; else G.Gear.removeFrom(g, p.it);
      return true;
    }
    return false;
  },
  treatingParts() { return this.treating && this.treating.size ? [...this.treating.values()].map((q) => q.part) : null; },
  // a teammate treated you (they used their item; it lands here)
  // theirs: it's your own item they used (it comes off you here); nothing of it left, or no longer needed: it isn't used
  treated(part, mt, by, byId, theirs) {
    if (byId != null && this.treating) this.treating.delete(byId); // (done)
    if (this.dead) return;
    if (theirs && (G.Med.cantTreat(this.body, part, mt) || !this.takeMed(mt))) return;
    if (!G.Med.treat(this.body, part, mt)) return;
    G.Audio.heal();
    G.HUD.toast('', `${by} used ${theirs ? 'your ' : ''}${G.Med.ITEMS[mt].name.toLowerCase()} on your ${G.Med.NAME[part].toLowerCase()}`, 2);
  },

  // ------------------------------------------------------------- F interactions
  // Every interaction puts the weapon away (hands are busy); afterwards it takes drawTime() to bring
  // it back up. Everything is a hold: let go of F and the action is abandoned (unless its effect has
  // already happened, e.g. the boot has landed). After finishing, F must be released before the next one.
  drawTime() { const d = this.cur().def; return (d.slot === 's' ? 0.65 : 1.0) / (d.handling || 1); },
  // kind drives the animation; events fire part-way through (e.g. the door moves when the push lands)
  startAction(label, dur, onDone, kind = null, events = []) { if (this.held && !this.held.cock) this.held = null; this.action = { label, dur, t: 0, onDone, kind, events }; },
  // where you're looking: the camera and the direction through the crosshair
  aimRay() { const cam = G.R.camera; return { o: cam.position.clone(), d: new THREE.Vector3(0, 0, -1).applyQuaternion(cam.quaternion) }; },
  // the person (or body) under the crosshair, within reach: their hitboxes, or within 7 deg of their torso.
  // ok(ev) picks who counts. The nearest along your aim wins.
  // the teammate under your crosshair, close enough to reach (a downed one a little further: you kneel to them)
  aimedMate() {
    const { o, d } = this.aimRay(), _v = new THREE.Vector3();
    let best = null, bt = Infinity;
    for (const pv of G.Views.players.values()) {
      if (!pv.st || pv.st.dd || !pv.rig) continue;
      const reach = pv.st.dn ? 2.4 : 2.0;
      if (Math.hypot(pv.pos.x - this.pos.x, pv.pos.z - this.pos.z) > reach) continue;
      const h = G.Rig.raycast(pv.rig, o, d, reach + 0.6);
      let t = h ? h.t : Infinity;
      if (!h) { // a little leeway: close to the middle of them
        (pv.st.dn ? pv.rig.hips : pv.rig.chest).getWorldPosition(_v);
        const to = _v.sub(o), dist = to.length();
        if (dist < reach + 0.6 && to.normalize().dot(d) > Math.cos(6 * Math.PI / 180)) t = dist;
      }
      if (t < bt) { bt = t; best = pv; }
    }
    return best;
  },
  aimedPerson(ok, reach = 2.2) {
    const { o, d } = this.aimRay(), _v = new THREE.Vector3();
    let best = null, bt = Infinity;
    for (const ev of G.Views.enemies.values()) {
      if (!ok(ev) || !ev.rig) continue;
      const at = !ev.alive || ev.down ? G.Rig.bodyAt(ev.rig) : ev.pos; // (someone lying: where their ragdoll is)
      if (Math.hypot(at.x - this.pos.x, at.z - this.pos.z) > reach) continue;
      const h = G.Rig.raycast(ev.rig, o, d, reach + 0.6);
      let t = h ? h.t : Infinity;
      if (!h) { // a little leeway: close enough to the middle of them
        (ev.alive && !ev.down ? ev.rig.chest : ev.rig.hips).getWorldPosition(_v);
        const to = _v.sub(o), dist = to.length();
        if (dist < reach + 0.6 && to.normalize().dot(d) > Math.cos(7 * Math.PI / 180)) t = dist;
      }
      if (t < bt) { bt = t; best = ev; }
    }
    return best;
  },
  // The first aid cabinet under the crosshair (its index), within arm's reach and with nothing in between: the ray from
  // your eye against its box on the wall (js/level.js cabViews: 0.44 x 0.52 m, 0.15 deep, its middle 1.32 m up, a couple
  // of centimetres' grace round it), or -1.
  aimedCabinet(map, reach = 1.7) {
    const { o, d } = this.aimRay(), HW = 0.24, HH = 0.28, HD = 0.11, Y = 1.32;
    let best = -1, bt = reach;
    map.cabinets.forEach((c, i) => {
      const cy = (c.fy || 0) + Y, px = o.x - c.x, py = o.y - cy, pz = o.z - c.z;
      if (px * px + pz * pz > (reach + 0.4) ** 2) return;
      // into the cabinet's frame (turned by its yaw)
      const cs = Math.cos(c.yaw), sn = Math.sin(c.yaw);
      const lo = [px * cs - pz * sn, py, px * sn + pz * cs], ld = [d.x * cs - d.z * sn, d.y, d.x * sn + d.z * cs], hb = [HW, HH, HD];
      let t0 = 0, t1 = bt;
      for (let a = 0; a < 3; a++) {
        if (Math.abs(ld[a]) < 1e-9) { if (Math.abs(lo[a]) > hb[a]) return; continue; }
        let q0 = (-hb[a] - lo[a]) / ld[a], q1 = (hb[a] - lo[a]) / ld[a]; if (q0 > q1) [q0, q1] = [q1, q0];
        t0 = Math.max(t0, q0); t1 = Math.min(t1, q1); if (t0 > t1) return;
      }
      const wall = G.Level.raycast(map, o.x, o.y, o.z, d.x, d.y, d.z, t0 + 0.02);
      if (wall.t < t0 - 0.05) return; // (something in the way: the wall it's on, from the far side)
      best = i; bt = t0;
    });
    return best;
  },
  // how far off the crosshair a point is (radians)
  offAim(x, y, z) { const { o, d } = this.aimRay(), to = new THREE.Vector3(x - o.x, y - o.y, z - o.z).normalize(); return Math.acos(G.U.clamp(to.dot(d), -1, 1)); },
  // the dropped weapon under the crosshair (within about 9 deg), within reach
  aimedEvidence(reach = 1.8) {
    const { o, d } = this.aimRay();
    let best = null, bd = Infinity;
    for (const [i, v] of G.Views.evidence) {
      if (v.secured) continue;
      const to = new THREE.Vector3(v.x - o.x, (v.y || 0) + 0.04 - o.y, v.z - o.z), dist = to.length();
      if (Math.hypot(v.x - this.pos.x, v.z - this.pos.z) > reach || Math.abs((v.y || 0) - this.pos.y) > 1.5) continue;
      if (to.normalize().dot(d) > Math.cos(9 * Math.PI / 180) && dist < bd) { bd = dist; best = i; }
    }
    return best;
  },
  // the closed door under the crosshair, and how high on it you're looking
  aimedDoor(map) {
    const cam = G.R.camera, L = G.Level, REACH = 1.9;
    const f = new THREE.Vector3(0, 0, -1).applyQuaternion(cam.quaternion);
    const h = L.raycast(map, cam.position.x, cam.position.y, cam.position.z, f.x, f.y, f.z, REACH, { move: true }); // (what you'd walk into: a door with its glass shot out is still there)
    if (h.t >= REACH || !h.n) return null;
    let d = h.solid ? (h.solid.kind === 'door' ? h.solid.door : null) : null;
    if (!h.solid) { // (no world: the tile the ray stopped in)
      const px = cam.position.x + f.x * (h.t + 0.03), pz = cam.position.z + f.z * (h.t + 0.03), tx = Math.floor(px / L.TS), tz = Math.floor(pz / L.TS);
      d = L.tile(map, tx, tz) === 3 ? map.doorAt.get(tz * map.W + tx) : null;
    }
    const y = cam.position.y + f.y * h.t - ((d && d.fy) || 0);
    if (!d || d.open || y > L.DOOR_H) return null; // the lintel isn't the door
    return { d, y };
  },
  interact(dt) {
    let prompt = '', prog = -1, label = '', busy = false;
    const map = G.Game.map, held = this.keys.KeyF && !G.Game.chatOpen;
    if (!held) this.fLatch = false;
    const F = held && !this.fLatch;
    // the hangar: look at what's for sale or what to use (js/hangar.js)
    if (G.Game.hub) {
      const o = G.Hangar.interact(this, dt, held, F);
      G.HUD.setPrompt(o.prompt); G.HUD.setProgress(o.prog, o.label);
      return;
    }

    if (this.action) {
      // a timed action in progress: weapon away until it's done
      const a = this.action;
      const committed = !a.onDone && a.events.length && a.events.every((ev) => ev.done);
      const tgt = a.kind === 'zip' ? G.Views.enemies.get(a.target) : null;
      const evd = a.kind === 'bag' ? G.Views.evidence.get(a.target) : null;
      const lost = (a.kind === 'zip' && (!tgt || (a.living && !tgt.alive) || Math.hypot(tgt.pos.x - this.pos.x, tgt.pos.z - this.pos.z) > 2.8)) ||
        (a.kind === 'bag' && (!evd || evd.secured));
      const kept = a.key ? this.keys[a.key] && !G.Game.chatOpen : held; // most are F; a backpack swap is B
      if (!kept && !committed || this.down || lost) this.action = null; // let go: abandoned
      else if (a.approach) { // too far for the animation: walk into position first (it starts once you're there)
        busy = true; label = a.label; prog = 0;
        const dx = a.approach.x - this.pos.x, dz = a.approach.z - this.pos.z, d = Math.hypot(dx, dz);
        const was = this.pos.clone();
        if (d > 0.05) {
          const step = Math.min(d, this.SPEED.walk * dt);
          this.pos.x += (dx / d) * step; this.pos.z += (dz / d) * step;
          G.Level.resolve(map, this.pos, 0.35, this.pos.y);
        }
        if (a.face) this.yaw += G.U.angDiff(this.yaw, Math.atan2(-(a.face.x - this.pos.x), -(a.face.z - this.pos.z))) * Math.min(1, dt * 6);
        a.stuck = this.pos.distanceTo(was) < 0.004 ? (a.stuck || 0) + dt : 0;
        if (d <= 0.05 || a.stuck > 0.5) { // in place (or as close as the room allows)
          a.approach = null; a.start = this.pos.clone();
          if (a.kind === 'zip' && a.living && tgt) this.planPull(a, tgt);
        }
      }
      else if (a.pull) { // not enough room to lay them down: drag them back first, stepping back with them
        busy = true; label = 'Pulling back'; prog = 0;
        const pl = a.pull;
        pl.t = Math.min(1, pl.t + dt / pl.dur);
        const k = G.U.smooth(0, 1, pl.t);
        this.pos.x = pl.me.x + pl.dx * k; this.pos.z = pl.me.z + pl.dz * k;
        G.Level.resolve(map, this.pos, 0.35, this.pos.y);
        if (pl.t >= 1) { a.pull = null; a.start = this.pos.clone(); a.spot = { x: pl.to.x + pl.fx * 0.75, z: pl.to.z + pl.fz * 0.75 }; }
      }
      else if (a.spot) { // follow them down: step in over their legs as they fall
        const k = G.U.smooth(0.1, 0.5, a.t / a.dur);
        this.pos.x = a.start.x + (a.spot.x - a.start.x) * k; this.pos.z = a.start.z + (a.spot.z - a.start.z) * k;
        G.Level.resolve(map, this.pos, 0.35, this.pos.y);
      }
      if (this.action && !a.approach && !a.pull) {
        const was = a.t / a.dur;
        a.t += dt; busy = a.kind !== 'order'; prog = a.t / a.dur; label = a.label;
        if (!a.civBody) G.Audio.foley(a.kind, was, prog, 0, a.living);
        for (const ev of a.events) if (!ev.done && prog >= ev.at) { ev.done = true; ev.fn(); }
        if (a.t >= a.dur) { this.action = null; this.fLatch = true; if (a.onDone) a.onDone(); }
      }
    } else if (!this.down) {
      // a teammate: check their injuries (downed ones within reach, standing ones you're facing). It opens
      // your Tab screen with their body in it: treat them with your gear there, and revive them
      const tgt = this.aimedMate(); // (the one under your crosshair)
      if (tgt) {
        const need = 0.8;
        prompt = `Hold <b>F</b> to ${tgt.st.dn ? 'treat and revive' : 'check'} ${G.U.esc(tgt.name)}`;
        if (F) {
          this.reviveT += dt; busy = true; prog = this.reviveT / need; label = 'Checking ' + tgt.name;
          if (this.reviveT >= need) { this.reviveT = 0; this.fLatch = true; G.Game.toggleInv(true, { patient: tgt.id }); }
        } else this.reviveT = 0;
      } else this.reviveT = 0;

      // restrain the living / secure the dead (hold)
      // (the one under your crosshair: look at who you mean). A weapon dropped by a body: whichever of the
      // two is nearer the middle of the crosshair is what you mean
      let cuffTgt = tgt ? null : this.aimedPerson((ev) => (ev.alive ? ev.scode === 1 || ev.down || (ev.def.civ && ev.scode === 3) : !ev.bodySecured && ev.deadT > 1));
      const evAim = tgt ? null : this.aimedEvidence();
      if (cuffTgt && evAim !== null) {
        const v = G.Views.evidence.get(evAim), c = new THREE.Vector3();
        (cuffTgt.alive && !cuffTgt.down ? cuffTgt.rig.chest : cuffTgt.rig.hips).getWorldPosition(c);
        if (this.offAim(v.x, (v.y || 0) + 0.04, v.z) < this.offAim(c.x, c.y, c.z)) cuffTgt = null;
      }
      if (cuffTgt) {
        const ev = cuffTgt, who = ev.def.civ ? 'civilian' : ev.def.name.toLowerCase(), lying = !ev.alive || ev.down; // (down for good: tied where they lie, as a body is)
        // the living are restrained from behind: walk round them first
        const fx = -Math.sin(ev.yaw), fz = -Math.cos(ev.yaw);
        const bx = this.pos.x - ev.pos.x, bz = this.pos.z - ev.pos.z, bl = Math.hypot(bx, bz) || 1;
        const behind = lying || (fx * bx + fz * bz) / bl < -0.3;
        if (!ev.alive) prompt = ev.def.civ ? 'Hold <b>F</b> to report civilian casualty' : 'Hold <b>F</b> to zip-tie body';
        else if (!behind) prompt = 'Hold <b>F</b> to order the ' + G.U.esc(who) + ' to turn around';
        else prompt = ev.def.civ ? 'Hold <b>F</b> to restrain civilian' : 'Hold <b>F</b> to arrest ' + G.U.esc(who);
        if (F && !behind && !lying) { // "Turn around!" - weapon stays on them
          const id = ev.id;
          this.startAction('Ordering to turn around', 0.45, () => G.Net.toHost({ t: 'turn', e: id }), 'order');
          this.action.target = id;
          G.Audio.order(null);
        } else if (F && behind) {
          const id = ev.id;
          const wr = G.Views.zipPoint(ev, 0, !lying); // a body (or someone down): kneel by its shoulder, where the ragdoll lies (not where they dropped)
          const at = lying ? [Math.round(wr.x * 100) / 100, Math.round(wr.z * 100) / 100] : undefined; // (and tell the host where that is)
          this.startAction(ev.alive ? 'Zip-tying' : ev.def.civ ? 'Reporting' : 'Zip-tying', !lying ? 2.2 : ev.def.civ && !ev.alive ? 1.6 : 2.6, () => G.Net.toHost({ t: 'cuff', e: id, at }), 'zip');
          Object.assign(this.action, { target: id, living: !lying, civBody: !ev.alive && !!ev.def.civ, // a casualty is reported, not tied
            // living: walked in to just behind them, then they're shoved forward and you kneel astride their thighs
            approach: !lying ? { x: ev.pos.x - fx * 0.7, z: ev.pos.z - fz * 0.7 } : this.standOff(wr.x, wr.z, 0.65),
            spot: !lying ? { x: ev.pos.x + fx * 0.75, z: ev.pos.z + fz * 0.75 } : null,
            face: !lying ? { x: ev.pos.x, z: ev.pos.z } : { x: wr.x, z: wr.z } });
          busy = true;
        }
      }

      // evidence (timed): bag the weapon
      // (the weapon you're looking at)
      const evTgt = !tgt && !cuffTgt ? evAim : null;
      if (evTgt !== null) {
        const w = G.WEAPONS[G.Views.evidence.get(evTgt).wpn];
        prompt = 'Hold <b>F</b> to bag evidence' + (w ? ' (' + G.U.esc(w.name) + ')' : '');
        if (F) {
          const i = evTgt, ev = G.Views.evidence.get(i);
          this.startAction('Bagging evidence', 2.3, () => G.Net.toHost({ t: 'secure', i }), 'bag');
          // kneel down just short of it, on the side you came from
          Object.assign(this.action, { target: i, approach: this.standOff(ev.x, ev.z, 0.75), face: { x: ev.x, z: ev.z } });
          busy = true;
        }
      }

      // doors: look at the door above its middle to open it quietly, lower to kick it (the line is at 1.3 m
      // of a 2.3 m door: a little above the middle, about where a boot lands on a kick); open doors close
      if (!tgt && !cuffTgt && evTgt === null) {
        const aimed = this.aimedDoor(map);
        if (aimed) {
          const vault = aimed.d.kind === 'vault', kick = aimed.y < KICK_H && !vault, id = aimed.d.id;
          prompt = vault ? 'Hold <b>F</b> to haul the vault door open <small>(too heavy to kick)</small>' : kick ? 'Hold <b>F</b> to kick door' : 'Hold <b>F</b> to open door';
          if (F && vault) this.startAction('Spinning the wheel', 2.4, null, 'open', [{ at: 0.95, fn: () => G.Net.toHost({ t: 'useDoor', i: id }) }]);
          else if (F) {
            // the door reacts when the boot lands / the push begins, not when the animation ends
            if (kick) this.startAction('Kicking', 0.55, null, 'kick', [{ at: 0.5, fn: () => { G.Net.toHost({ t: 'kickDoor', i: id }); this.shakeT = 0.3; } }]);
            else this.startAction('Opening door', 0.7, null, 'open', [{ at: 0.5, fn: () => G.Net.toHost({ t: 'useDoor', i: id }) }]);
          }
        } else {
          const near = G.Level.doorNear(map, this.pos.x, this.pos.z, 1.9, this.pos.y);
          if (near && near.open && this.offAim(near.x, (near.fy || 0) + 1.1, near.z) < 0.6) { // (facing it, roughly)
            prompt = 'Hold <b>F</b> to close door';
            if (F) { const id = near.id; this.startAction('Closing door', 0.6, null, 'close', [{ at: 0.6, fn: () => G.Net.toHost({ t: 'useDoor', i: id }) }]); }
          }
        }
      }

      // something lying on the floor (dropped from someone's inventory): pick it up
      const lt = !tgt && !cuffTgt && !prompt ? G.Loot.near(this.pos, this.yaw) : null;
      if (lt) {
        prompt = `Hold <b>F</b> to pick up the ${G.Loot.name(lt.item)}`;
        if (F) { const id = lt.id; this.startAction('Picking up', 0.5, () => G.Net.toHost({ t: 'take', id }), 'case'); busy = true; }
      }
      // a magazine you dropped: pick it back up (if there's somewhere on you for it)
      const dm = !tgt && !cuffTgt && !prompt ? G.Casings.nearMag(this.pos, 1.3) : null;
      if (dm) {
        const it = dm.item, name = it.k === 'mag' ? G.Gear.magName(it) : G.Gear.label(it);
        const room = G.Gear.body(this).some((g) => G.Gear.findSpot(g, it));
        prompt = room ? `Hold <b>F</b> to pick up the ${name} (${it.n} rounds)` : `No room on you for the ${name}`;
        if (F && room) {
          this.startAction('Picking up the magazine', 0.6, () => {
            if (G.Gear.place(G.Gear.body(this), it)) { G.Casings.takeMag(dm); G.Audio.sample('insert_magazine', 0.3, 0.8) || G.Audio.click(); }
          }, 'case');
          busy = true;
        }
      }

      // a first aid cabinet on the wall: opened, it's a grid in your inventory you move medical gear in and out of
      if (!tgt && !cuffTgt && !prompt && map.cabinets && G.Game.cabs) {
        const ci = this.aimedCabinet(map);
        const cab = ci >= 0 && G.Game.cabs[ci];
        if (cab) {
          const n = cab[1].reduce((a, e) => a + e[1], 0);
          prompt = !cab[0] ? 'Hold <b>F</b> to open the first aid cabinet' : `Hold <b>F</b> to look in the first aid cabinet <small>(${n ? n + ' item' + (n > 1 ? 's' : '') : 'empty'})</small>`;
          if (F) {
            this.startAction(cab[0] ? 'Looking in the cabinet' : 'Opening the cabinet', cab[0] ? 0.25 : 0.5, () => { if (!cab[0]) G.Net.toHost({ t: 'openCab', i: ci }); G.Game.toggleInv(true, { cab: ci }); }, 'case');
            busy = true;
          }
        }
      }
      // the attachments box: one use each. Your first look rolls your three (for the weapon in your hands); then look
      // in again till you've taken one
      const ab = map.abox, abs = G.Game.abox, mineAb = G.Game.aboxMine();
      if (!tgt && !cuffTgt && !prompt && ab && abs && Math.hypot(ab.x - this.pos.x, ab.z - this.pos.z) < 1.4) {
        if (!mineAb) {
          const w = this.cur();
          prompt = `Hold <b>F</b> to ${abs[0] ? 'take your turn at' : 'open'} the attachments box${w ? ` <small>(three attachments for your ${w.def.name})</small>` : ''}`;
          if (F) { this.startAction(abs[0] ? 'Looking in the box' : 'Opening the box', abs[0] ? 0.4 : 0.8, () => { const cw = this.cur(); G.Net.toHost({ t: 'openAbox', code: cw ? cw.def.code : '' }); }, 'case'); busy = true; }
        } else if (mineAb[1]) prompt = 'You\'ve had your pick from the attachments box';
        else {
          prompt = 'Hold <b>F</b> to look in the attachments box';
          if (F) { this.startAction('Looking in the box', 0.25, () => G.Game.aboxShow(false), 'case'); busy = true; }
        }
      }
      // the sticker box: close by and facing it, the sticker's yours (the first to open it)
      const sb = map.sbox, sbs = G.Game.sbox;
      if (!tgt && !cuffTgt && !prompt && sb && sbs && sbs[0] && Math.hypot(sb.x - this.pos.x, sb.z - this.pos.z) < 1.5) {
        const fx = -Math.sin(this.yaw), fz = -Math.cos(this.yaw), dx = sb.x - this.pos.x, dz = sb.z - this.pos.z, dl = Math.hypot(dx, dz) || 1;
        if ((fx * dx + fz * dz) / dl > 0.6) {
          if (sbs[1]) prompt = 'The sticker box is empty';
          else {
            prompt = 'Hold <b>F</b> to open the sticker box';
            if (F) { this.startAction('Opening the sticker box', 0.6, () => G.Net.toHost({ t: 'openSbox' }), 'case'); busy = true; }
          }
        }
      }
      // the level's weapon case: open it, then take what's inside or swap your weapon of that kind for it
      const mc = map.case, wc = G.Game.wcase;
      if (!tgt && !cuffTgt && !prompt && mc && Math.hypot(mc.x - this.pos.x, mc.z - this.pos.z) < 1.6) {
        const inCase = wc && G.Gunsmith.fromCode(wc.code);
        if (!G.Game.caseOpen) {
          prompt = 'Hold <b>F</b> to open the weapon case';
          if (F) { this.startAction('Opening the case', 1.0, () => G.Net.toHost({ t: 'openCase' }), 'case'); busy = true; }
        } else if (!inCase) prompt = 'The weapon case is empty';
        else {
          const mine = this.weapons[inCase.slot], col = G.TIER_COLORS[inCase.tier];
          // with room in your backpack, yours goes in there instead of the case
          const stow = mine && this.packRoom(G.Gear.gunItem(mine));
          prompt = stow ? `Hold <b>F</b> to take the <b style="color:${col}">${inCase.name}</b> (your ${mine.def.name} goes in your backpack)`
            : mine ? `Hold <b>F</b> to swap your ${mine.def.name} for the <b style="color:${col}">${inCase.name}</b> in the case`
            : `Hold <b>F</b> to take the <b style="color:${col}">${inCase.name}</b> from the case`;
          if (F) {
            const slot = inCase.slot;
            this.startAction('Swapping weapons', 1.2, () => {
              const w = this.weapons[slot];
              this.caseStow = !!(w && this.packRoom(G.Gear.gunItem(w)));
              // your weapon goes in the case in its standard build: your aftermarket parts stay with you
              // its magazines go into the case with it (unless it's going in your backpack)
              G.Net.toHost({ t: 'swap', give: w && !this.caseStow ? [w.def.code, G.loaded(w), G.Gear.handOver(this, w.def), w.ammo, w.stickers || null] : null }); // (its stickers with it)
            }, 'case');
            busy = true;
          }
        }
      }
    }

    // hands busy: the weapon goes away; when they're free again it takes a moment to draw
    if (busy && !this.stowed) { this.stowed = true; this.reloading = false; this.burstQ = 0; this.lowToggle = false; }
    else if (!busy && this.stowed) { this.stowed = false; this.raiseT = this.raiseMax = this.drawTime(); }
    G.HUD.setPrompt(this.action ? '' : prompt);
    G.HUD.setProgress(prog, label);
  },

  // ------------------------------------------------------------- damage
  // Rounds that hit you, as the enemy's are rolled by the host: [zone, central] per round (or pellet). The
  // same wounds as you deal: an unarmoured head (or a face below the helmet's brim) is a kill; elsewhere your
  // armour stops its share and wears.
  // A round's wounds on you, whole, as whoever fired it worked them out (js/ballistics.js outcome: a teammate's or a suspect's
  // through the host, your own off a ricochet here): the wounds on your body, the wear on what you're wearing. from:
  // where it came from; friendly: it wasn't a suspect's (you aren't told whose).
  applyWounds(o, from, friendly) {
    if (o.ws && o.ws.length && G.R.particles) G.R.particles(new THREE.Vector3(this.pos.x, 1.2, this.pos.z), 4 + 2 * o.ws.length, 0x8a0a0a, 1.5, 1.2, 9, 0.6, null, true); // some of it lands at your feet
    if (this.down || this.dead || G.Game.phase !== 'level' || !from) return;
    const B = G.Ballistics, armour = B.kitArmour(this);
    let f = 0, killed = false, fate = null;
    for (const [part, dmg, effects, organs, seg] of o.ws || []) {
      if (effects.includes('dead')) killed = seg === 'jaw' ? 'Shot in the face' : seg === 'neck' ? 'Shot through the neck' : 'Shot in the head';
      f += dmg;
      fate = this.worse(fate, G.Med.wound(this.body, part, dmg, effects, organs));
    }
    for (const a of armour) if (o.wear && o.wear[a.key]) a.wear = o.wear[a.key];
    B.wearOut(armour);
    if (o.rang) G.Audio.armorHit();
    if (killed) { this.killed(from, friendly ? 'Friendly fire' : killed); return; }
    if (fate === 'dead') { this.killed(from, friendly ? 'Friendly fire' : this.body.parts.head.hp <= 0 ? 'A head wound' : 'Bled out where they fell'); return; }
    if (o.stopped && !friendly) G.Net.toHost({ t: 'saved', n: o.stopped }); // (your armour stopped them: js/highlights.js saved)
    this.hurt(f, from, fate);
  },
  // a round to the head you weren't wearing a helmet for: no bleeding out, no revive
  killed(from, how) {
    G.HUD.damage(from, 100);
    G.Audio.hurt();
    this.stats.downs++;
    this.die(how || 'Killed outright');
  },
  // Blasts and other plain damage. Body armour takes some of the fragments.
  takeDamage(d, from) {
    if (this.down || this.dead || G.Game.phase !== 'level' || !(d > 0)) return;
    // what's on your torso against a fragment (a ragged 0.3 g steel chip at ~900 m/s, js/ballistics.js): stopped, the
    // torso's share of them stays in the armour
    const B = G.Ballistics, frag = { m: 0.0003, d: 0.004, len: 0.004, core: 'mild', nose: 'ball' };
    let st = 0;
    const ka = B.kitArmour(this);
    for (const a of ka) for (const pr of a.def.prot) if (pr.at === 'torso' || pr.at === 'plate') { const r = B.stack(Object.assign({}, frag), 900, pr.layers, a.cond, 1); if (!r.through) { st = Math.max(st, pr.at === 'torso' ? 0.85 : 0.5); a.wear = (a.wear || 0) + r.absorbed * 4; } }
    if (st > 0) { B.wearOut(ka); G.Audio.armorHit(); }
    // fragments: spread over the body, the legs and lower body most
    const total = d * (1 - st * 0.4);
    let fate = null;
    for (const [part, share] of [['legL', 0.25], ['legR', 0.25], ['stomach', 0.2], ['thorax', 0.15], ['armL', 0.075], ['armR', 0.075]]) {
      fate = this.worse(fate, G.Med.hit(this.body, part, total * share, false, 1, false));
    }
    if (fate === 'dead') { this.killed(from, 'Killed by the blast'); return; }
    this.hurt(total, from, fate);
  },
  // Prone (Z): down onto your front, or back up (to a crouch). It takes a moment either way (no shooting meanwhile);
  // lying there you crawl, can't lean, and hold the gun as still as it gets.
  setProne(on) {
    if (on === !!this.prone || this.down || this.dead || this.seat != null || this.action) return;
    this.prone = on; this.crouch = !on; this.stanceT = this.PRONE_T;
    this.lowToggle = false; this.burstQ = 0;
    G.Audio.foley && G.Audio.foley('prone', 0, 1, 0);
  },
  // the worse of two fates from G.Med.hit (null, 'down', 'out', 'dead')
  worse(a, b) { const R = [null, 'down', 'out', 'dead']; return R.indexOf(b) > R.indexOf(a) ? b : a; },
  // the effect of being hit (the injuries are already on the body): flinch, the HUD, going down (fate: 'down', or
  // 'out' for blacking out)
  hurt(d, from, fate) {
    if (!(d > 0)) return;
    this.hp = G.Med.overall(this.body);
    this.sinceHurt = 0;
    const fl = 0.035 * G.U.clamp(d / 30, 0.4, 1.5); // the hit throws your aim
    this.flinch.y += (Math.random() - 0.5) * 2 * fl; this.flinch.p += (Math.random() - 0.3) * fl;
    G.HUD.damage(from, d);
    G.Audio.hurt();
    if (fate === 'down' || fate === 'out') this.goDown(fate === 'out');
  },
  // down (on the floor: a sidearm, nothing else), or out cold as well (nothing at all)
  goDown(out = false) {
    if (out) { this.out = true; this.mouse.l = this.mouse.r = false; }
    if (this.down) return; // (already down: now out as well)
    this.hp = 0;
    this.down = true;
    this.crouch = false; this.prone = false;
    this.bleed = G.Med.bleedOut(this.body);
    this.stats.downs++;
    this.reloading = false;
    if (this.slot !== 's' && this.weapons.s) { this.slot = 's'; G.R.setViewmodel(this.cur().def); }
    G.Audio.down();
    G.Net.toHost({ t: 'chat', m: '[is down and needs a revive!]' });
    if (G.Game.invOpen) G.Game.toggleInv(false);
  },
  revived(hp) {
    if (!this.down || this.out || G.Med.cantRevive(this.body)) return; // (unconscious: blood first)
    this.down = false;
    this.hp = G.Med.overall(this.body);
    this.sinceHurt = 0;
    G.Audio.revive();
  },
  // why you died when nobody reached you in time: what put you down
  downCause() {
    const b = this.body;
    if (!b) return 'Nobody reached you in time';
    if (b.parts.thorax.lung) return 'Bled out from a chest wound (a punctured lung)';
    return 'Bled out: nobody stopped it in time';
  },
  die(how) {
    G.Views.spawnSelfBody(); // (before anything else changes: as you were, then down)
    this.down = false; this.out = false;
    this.dead = true;
    this.hp = 0;
    this.deathCause = how || 'Bled out';
    G.R.setViewmodel(null);
    G.HUD.toast('KIA', this.deathCause, 3);
  },
  spectate(dt) {
    const alive = [...G.Views.players.values()].filter((p) => p.st && !p.st.dd);
    const cam = G.R.camera;
    if (!alive.length) { cam.position.set(this.pos.x, 3.5, this.pos.z); cam.rotation.set(-1.2, this.yaw, 0); return; }
    const p = alive[this.specIdx % alive.length], head = p.rig && p.rig.head;
    if (this.spectating !== p) this._specQ = null; // (a new officer: no easing in from the last one's view)
    this.spectating = p;
    if (!head) { cam.position.set(p.pos.x, p.pos.y + (p.st.dn ? 0.45 : p.st.cr ? 1.0 : 1.62), p.pos.z); cam.rotation.set(p.st.pt, p.st.yw, 0); return; }
    // An action camera on the right of their helmet, on the rail above the ear, hard-mounted: where it is and which
    // way it points come from their head's own pose, every frame, once their rig has been posed for it (this runs
    // after G.Views.update). It looks a little down and in, so their arm and weapon are in the frame. Like a real
    // one it stabilises electronically: it can't move the lens, only shift a cropped window over the frame, so it
    // smooths the turn (a low-pass on the rotation), mostly levels the horizon, and is never more than its crop
    // margin off where the mount actually points (a sharp turn drags it along). Wide, with a fisheye's barrel
    // distortion (js/render.js); a little narrower for the crop.
    G.R.fisheye = 1;
    const wide = G.Game.settings.fov * 1.12;
    if (Math.abs(cam.fov - wide) > 0.05) { cam.fov = wide; cam.updateProjectionMatrix(); }
    head.updateWorldMatrix(true, false);
    const M = this.HELMCAM;
    cam.position.copy(head.localToWorld(new THREE.Vector3(M.x, M.y, M.z)));
    const hq = head.getWorldQuaternion(new THREE.Quaternion());
    const mount = hq.clone().multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(M.pitch, M.yaw, 0, 'YXZ'))); // where the lens points
    // what the stabiliser aims for: the mount's direction, with most of its roll taken out
    const e = new THREE.Euler().setFromQuaternion(mount, 'YXZ'); e.z *= 1 - M.level;
    const want = new THREE.Quaternion().setFromEuler(e);
    const q = this._specQ ? this._specQ.slerp(want, 1 - Math.exp(-(dt || 0.016) * M.smooth)) : want.clone();
    const off = q.angleTo(mount); // (never past the crop margin)
    if (off > M.crop) q.slerp(mount, 1 - M.crop / off);
    this._specQ = q;
    cam.quaternion.copy(q);
  },
  // the helmet camera: where it's mounted on the head (m, the head's frame: right, up, ahead -z), which way it's
  // tilted (rad: down, and in toward the middle), and its stabiliser: how quickly it follows (1/s), how much of the
  // roll it levels out, its crop margin (rad)
  HELMCAM: { x: 0.142, y: 0.2, z: -0.035, pitch: -0.2, yaw: 0.1, smooth: 7, level: 0.7, crop: 0.1 },

  // ------------------------------------------------------------- camera + viewmodel
  updateCamera(dt) {
    this._dtCam = dt;
    const cam = G.R.camera, def = this.cur().def;
    // lean: Q left, E right. Never lean the head into a wall.
    const want = this.down || this.dead || this.lowReady || this.prone || G.Game.chatOpen || !G.Game.locked ? 0 : (this.keys.KeyE ? 1 : 0) - (this.keys.KeyQ ? 1 : 0);
    const sideX = Math.cos(this.yaw), sideZ = -Math.sin(this.yaw), eye = this.pos.y + this.eyeH;
    let room = 1;
    if (want) {
      const t = G.Level.raycast(G.Game.map, this.pos.x, eye, this.pos.z, sideX * want, 0, sideZ * want, this.LEAN + 0.4).t;
      room = G.U.clamp((t - 0.22) / this.LEAN, 0, 1);
    }
    this.lean = (this.lean || 0) + (want * room - (this.lean || 0)) * Math.min(1, dt * 9);
    const lo = this.lean * this.LEAN;
    cam.position.set(this.pos.x + sideX * lo, eye - Math.abs(this.lean) * 0.06, this.pos.z + sideZ * lo);
    cam.rotation.set(this.pitch, this.yaw, (this.down ? 0.25 : 0) - this.lean * 0.2);
    // restraining someone or bagging evidence: your eyes follow your hands (and ease back afterwards)
    const lk = this.lookTarget(this.action);
    if (lk) { this._look = lk.p; this._lookW = lk.w; }
    this.zipW = (this.zipW || 0) + ((lk ? 1 : 0) - (this.zipW || 0)) * Math.min(1, dt * 6);
    if (this.zipW > 0.001 && this._look) {
      const d = new THREE.Vector3().subVectors(this._look, cam.position), w = this.zipW * this._lookW;
      cam.rotation.y = this.yaw + G.U.angDiff(this.yaw, Math.atan2(-d.x, -d.z)) * w;
      cam.rotation.x = G.U.lerp(this.pitch, Math.atan2(d.y, Math.hypot(d.x, d.z)), w);
    }
    if (this.shakeT > 0) { this.shakeT -= dt; const j = this.shakeT * 0.08; cam.rotation.x += (Math.random() - 0.5) * j; cam.rotation.z += (Math.random() - 0.5) * j; }
    // most of the kick shows as the view itself punching up and aside (with a touch of roll); the rest is
    // the gun turning on screen. Where the rounds go is the same either way: along the bore.
    const R = this.RECOIL, punch = this.rc.p * R.PUNCH, punchY = this.rc.y * R.PUNCH_Y;
    cam.rotation.x += punch;
    cam.rotation.y += punchY;
    cam.rotation.z -= this.rc.y * R.ROLL;
    // magnified optics are picture-in-picture: the view itself only tightens a little, like any other sight
    const sg = this.sight(this.cur());
    const fov = G.Game.settings.fov * G.U.lerp(1, sg.scoped ? 0.8 : sg.zoom, this.adsT);
    if (Math.abs(cam.fov - fov) > 0.05) { cam.fov = fov; cam.updateProjectionMatrix(); }

    const vm = G.R.vm;
    if (!vm) return;
    const u = vm.userData, a = this.adsT;
    G.R.pipLive = sg.scoped ? a : 0; // how far the scope picture is faded in (js/render.js)
    if (u.pip) u.pip.mag = sg.mag; // (at the power it's set to)
    const bobAmt = (1 - a * 0.85) * Math.min((this.hspeed || 0) / this.SPEED.walk, 1.5);
    let x = G.U.lerp(u.hip.x, u.ads.x, a) + Math.sin(this.bobT) * 0.012 * bobAmt;
    let y = G.U.lerp(u.hip.y, u.ads.y, a) - Math.abs(Math.cos(this.bobT)) * 0.012 * bobAmt;
    // the gun turns so its bore points at the real aim point (relative to the punched view) and shoves back
    const off = this.aimOffset();
    this.aimScreen = { y: off.y - punchY, p: off.p - punch }; // for the crosshair
    // (the shove back into your shoulder, recoilStep; from the hip the muzzle climbing tips it back a little more)
    let z = G.U.lerp(u.hip.z, u.ads.z, a) + this.shove + Math.max(0, this.rc.p) * 0.35 * (1 - a);
    let rx = off.p - punch, ry = off.y - punchY, rz = -this.rc.y * 0.3;
    if (this.lowReady) { ry = 0.35; rx -= 0.6; x -= 0.04; y -= 0.07; } // muzzle down
    this.stowW = (this.stowW || 0) + ((this.stowed || this.held ? 1 : 0) - (this.stowW || 0)) * Math.min(1, dt * 9); // (a grenade in hand: the weapon down too)
    y -= this.stowW * 0.55; rx -= this.stowW * 1.1; // weapon put away while the hands are busy
    if (this.raiseT > 0) { const k = this.raiseT / (this.raiseMax || 0.3); rx -= k * 1.0; y -= k * 0.3; }
    // reloads, racking and inspecting (js/vmanim.js)
    const ao = G.VMAnim.sample(this, vm);
    x += ao[0]; y += ao[1]; z += ao[2]; rx += ao[3]; ry += ao[4]; rz += ao[5];
    // drawing: the gun comes up from low right in an arc
    const sw = this.swapT / (this.swapMax || 0.42);
    y -= sw * 0.32; rx -= sw * 0.9; rz -= sw * 0.5; x += sw * 0.06;
    // sway: the gun lags behind the mouse and leans into strafes (less while aiming)
    const dyaw = G.U.angDiff(this._lyaw == null ? this.yaw : this._lyaw, this.yaw), dpitch = this.pitch - (this._lpitch == null ? this.pitch : this._lpitch);
    this._lyaw = this.yaw; this._lpitch = this.pitch;
    const sk = Math.min(1, dt * 18), sc = 1 - a * 0.75, idt = 1 / Math.max(dt, 1e-3); // (settles fast: the bore, and the laser, keep up with your aim)
    this.swayX = (this.swayX || 0) + (G.U.clamp(dyaw * idt * 0.012, -0.07, 0.07) - (this.swayX || 0)) * sk;
    this.swayY = (this.swayY || 0) + (G.U.clamp(dpitch * idt * 0.01, -0.05, 0.05) - (this.swayY || 0)) * sk;
    const strafe = this.vel.x * Math.cos(this.yaw) - this.vel.z * Math.sin(this.yaw);
    x -= this.swayX * 0.2 * sc; y -= this.swayY * 0.15 * sc; rz -= strafe * 0.025 * sc; // (the turn lag itself is in aimOffset)
    if (this.down) { y -= 0.05; rz += 0.3; }
    const lp = Math.min(1, dt * 18);
    vm.position.x += (x - vm.position.x) * lp;
    vm.position.y += (y - vm.position.y) * lp;
    vm.position.z += (z - vm.position.z) * lp;
    vm.rotation.x += (rx - vm.rotation.x) * lp;
    vm.rotation.y += (ry - vm.rotation.y) * lp * 0.6;
    vm.rotation.z += (rz - vm.rotation.z) * lp * 0.6;
    u.flashes.forEach((fl, i) => {
      fl.visible = this.flashT > 0 && (u.flashes.length < 2 || i === this.flashIdx);
      if (fl.visible) { fl.rotation.z = Math.random() * 6; fl.scale.setScalar(0.8 + Math.random() * 0.6); }
    });
    // moving parts: slides cycle (and lock back on empty), pumps and bolts work between shots,
    // revolver cylinders index, minigun barrels spin
    const an = u.anim, w = this.cur();
    const cyc = this.cycleMax > 0.2 && this.fireCd > 0 ? Math.sin(Math.PI * Math.min(1, (1 - this.fireCd / this.cycleMax) * 1.25)) : 0;
    if (an.slide) an.slide.position.z = Math.min(0.035, this.kick * 0.04 + (!G.loaded(w) ? 0.035 : 0)); // (locked back: nothing left, chamber included)
    if (an.pump) an.pump.position.z = cyc * 0.085;
    if (an.cyl) an.cyl.rotation.z += (this.cylTarget - an.cyl.rotation.z) * Math.min(1, dt * 18);
    if (an.spin) an.spin.rotation.z += dt * this.spin * 55;
    if (an.magn) an.magn.rotation.z += ((sg.scoped ? 0 : -2.8) - an.magn.rotation.z) * Math.min(1, dt * 14); // a magnifier flips in or out
    G.VMAnim.apply(this, vm, cyc); // hands and the parts they work
    this.animateLimbs(cam);
  },

  // First-person hand and boot for door actions, drawn in the viewmodel pass (camera space: forward -z).
  // Built once from the same parts as the viewmodel arms.
  fpLimbs() {
    if (this._limbs) return this._limbs;
    const T = THREE, M = G.GunModels.M;
    const arm = new T.Group();
    const glove = new T.Mesh(new T.BoxGeometry(0.075, 0.05, 0.11), M.glove()); arm.add(glove);
    const fingers = new T.Mesh(new T.BoxGeometry(0.07, 0.03, 0.05), M.glove()); fingers.position.set(0, 0.01, -0.07); arm.add(fingers);
    const sleeve = new T.Mesh(new T.CylinderGeometry(0.03, 0.038, 0.5, 10), M.fabric()); sleeve.rotation.x = Math.PI / 2; sleeve.position.z = 0.3; arm.add(sleeve);
    // leg: a boot (posed on its own) and a shin stretched between the ankle and a knee below the view
    const leg = new T.Group();
    const boot = new T.Group(); leg.add(boot);
    const upper = new T.Mesh(new T.BoxGeometry(0.12, 0.14, 0.3), M.tan()); upper.position.z = -0.05; boot.add(upper);
    const toe = new T.Mesh(new T.BoxGeometry(0.125, 0.09, 0.08), M.rubber()); toe.position.set(0, -0.03, -0.2); boot.add(toe);
    const sole = new T.Mesh(new T.BoxGeometry(0.14, 0.04, 0.34), M.rubber()); sole.position.set(0, -0.085, -0.06); boot.add(sole);
    const heel = new T.Mesh(new T.BoxGeometry(0.13, 0.05, 0.09), M.rubber()); heel.position.set(0, -0.09, 0.08); boot.add(heel);
    const cuff = new T.Mesh(new T.CylinderGeometry(0.07, 0.075, 0.14, 10), M.tan()); cuff.position.set(0, 0.1, 0.05); boot.add(cuff);
    const laces = new T.Mesh(new T.BoxGeometry(0.05, 0.012, 0.2), M.black()); laces.position.set(0, 0.072, -0.07); boot.add(laces);
    const shin = new T.Mesh(new T.CylinderGeometry(0.075, 0.068, 1, 10), M.fabric()); leg.add(shin);
    const pad = new T.Mesh(new T.BoxGeometry(0.16, 0.14, 0.09), M.black()); leg.add(pad);
    leg.userData = { boot, shin, pad };
    // second hand (zip-tying needs both) and the tie itself
    const armL = arm.clone();
    const tie = new T.Mesh(new T.TorusGeometry(0.045, 0.005, 6, 20), new T.MeshStandardMaterial({ color: 0xf2f2ee, roughness: 0.6 }));
    const tail = new T.Mesh(new T.BoxGeometry(0.008, 0.004, 0.09), tie.material); tail.position.set(0.045, 0, 0.045); tie.add(tail);
    // bagging: the weapon picked up, and an evidence envelope with a flap that folds shut
    const held = new T.Group();
    const env = new T.Group(), envBody = G.Views.envelopeMesh(); env.add(envBody);
    const flapPivot = new T.Group(); flapPivot.position.set(0, 0.007, -0.165); env.add(flapPivot);
    const flap = new T.Mesh(new T.BoxGeometry(0.24, 0.004, 0.08), new T.MeshLambertMaterial({ color: 0xb8975c })); flap.position.z = 0.04; flapPivot.add(flap);
    env.userData.flap = flapPivot;
    // a grenade in the hand (keys 3, 4, 5): a frag, or a flashbang's can
    const nade = { frag: new T.Mesh(new T.SphereGeometry(0.038, 12, 8), new T.MeshStandardMaterial({ color: 0x3a4a2a, roughness: 0.7 })), flash: new T.Mesh(new T.CylinderGeometry(0.026, 0.026, 0.1, 12), new T.MeshStandardMaterial({ color: 0x7d8388, roughness: 0.5, metalness: 0.4 })) };
    for (const m of Object.values(nade)) { m.position.set(0, 0.035, -0.075); m.visible = false; arm.add(m); }
    arm.visible = leg.visible = armL.visible = tie.visible = held.visible = env.visible = false;
    G.R.vmRoot.add(arm, leg, armL, tie, held, env);
    return (this._limbs = { arm, leg, armL, tie, held, env, nade });
  },
  // Before laying someone face down: is there room in front of them? Their body will reach ~1.85 m from the
  // knees. If a wall or furniture is in the way, drag them back (toward you) far enough, and step back with them.
  planPull(a, ev) {
    const L = G.Level, map = G.Game.map, s = ev.def.scale || 1, need = 1.85 * s;
    const fx = -Math.sin(ev.yaw), fz = -Math.cos(ev.yaw);
    const solid = (x, z, r = 0.12) => {
      const tx = Math.floor(x / L.TS), tz = Math.floor(z / L.TS);
      for (let oz = -1; oz <= 1; oz++) for (let ox = -1; ox <= 1; ox++) if (L.boxesAt(map, tx + ox, tz + oz).some((b) => b.y0 < 0.5 && b.h > 0.15 && Math.abs(x - b.cx) < b.hx + r && Math.abs(z - b.cz) < b.hz + r)) return true;
      return false;
    };
    let room = need;
    for (let d = 0.3; d <= need && room === need; d += 0.08) {
      for (const side of [-0.22, 0, 0.22]) if (solid(ev.pos.x + fx * d - fz * side, ev.pos.z + fz * d + fx * side)) { room = d - 0.08; break; }
    }
    let back = Math.min(1.5, need - room + (room < need ? 0.08 : 0));
    // only as far as you can step back yourself (your back to a wall: not at all)
    let free = 0;
    while (free < back && !solid(this.pos.x - fx * (free + 0.05), this.pos.z - fz * (free + 0.05), 0.33)) free += 0.05;
    back = Math.min(back, free);
    if (back < 0.05) return;
    const to = { x: ev.pos.x - fx * back, z: ev.pos.z - fz * back };
    G.Net.toHost({ t: 'drag', e: ev.id, x: to.x, z: to.z });
    a.pull = { t: 0, dur: Math.max(0.45, back / 1.3), me: this.pos.clone(), dx: -fx * back, dz: -fz * back, to, fx, fz };
  },
  // a spot `dist` short of (x, z), on the side you're standing on
  standOff(x, z, dist) {
    const dx = this.pos.x - x, dz = this.pos.z - z, d = Math.hypot(dx, dz) || 1;
    return d <= dist + 0.05 ? null : { x: x + (dx / d) * dist, z: z + (dz / d) * dist };
  },
  lookTarget(ac) {
    if (!ac || ac.approach || ac.kind === 'order') return null;
    const t = ac.t / ac.dur;
    if (ac.kind === 'zip') { const ev = G.Views.enemies.get(ac.target); return ev ? { p: G.Views.zipPoint(ev, t, ac.living), w: 1 } : null; }
    if (ac.kind === 'bag') { const v = G.Views.evidence.get(ac.target); return v ? { p: new THREE.Vector3(v.x, (v.y || 0) + 0.05, v.z), w: 1 - 0.7 * G.U.bagPhases(t).lift * (1 - G.U.bagPhases(t).down) } : null; }
    return null;
  },
  // a grenade in your hand: brought up, held, drawn back (high for an overhand throw, low for underhand),
  // thrown and followed through. Eased toward each pose so it moves like an arm. Returns whether it drew.
  animateHeld(L, dt) {
    const h = this.held;
    for (const [k, m] of Object.entries(L.nade)) m.visible = !!h && h.kind === k && h.throwT < 0;
    if (!h) { this._hp = null; return false; }
    const under = h.str === 0, P = (x, y, z, rx, rz = 0) => [x, y, z, rx, rz];
    let want, wantL = null;
    if (h.throwT >= 0) { const t = h.throwT / 0.5; want = t < 0.35 ? (under ? P(0.14, -0.22, -0.62, -0.2) : P(0.12, -0.08, -0.68, -0.5)) : P(0.22, -0.5, -0.38, -0.4); }
    else if (h.readyT > 0) want = P(0.3, -0.7, -0.3, -0.6);
    else if (h.cock) { want = under ? P(0.26, -0.48, -0.16, -0.9) : P(0.33, -0.02, -0.1, 0.5, -0.2); wantL = P(-0.2, -0.14, -0.55, -0.2); }
    else want = P(0.2, -0.24, -0.42, -0.25);
    if (!this._hp) this._hp = P(0.3, -0.7, -0.3, -0.6);
    const k = Math.min(1, (dt || 0.016) * (h.throwT >= 0 ? 22 : 12));
    this._hp = this._hp.map((v, i) => v + (want[i] - v) * k);
    const [x, y, z, rx, rz] = this._hp;
    L.arm.visible = true; L.arm.position.set(x, y, z); L.arm.rotation.set(rx, 0.1, rz);
    if (wantL) { this._hpL = (this._hpL || wantL).map((v, i) => v + (wantL[i] - v) * k); L.armL.visible = true; L.armL.position.set(...this._hpL.slice(0, 3)); L.armL.rotation.set(this._hpL[3], -0.1, 0); }
    else this._hpL = null;
    return true;
  },
  animateLimbs(cam) {
    const L = this.fpLimbs(), a = this.action, kind = a && a.kind, S = G.U.smooth;
    if (!a && this.animateHeld(L, this._dtCam)) { L.armL.visible = !!this._hpL; L.tie.visible = L.held.visible = L.env.visible = L.leg.visible = false; return; }
    if (this.held === null || !this.held) for (const m of Object.values(L.nade)) m.visible = false;
    let t = a ? Math.min(1, a.t / a.dur) : 0;
    L.arm.visible = kind === 'open' || kind === 'close' || kind === 'zip' || kind === 'bag';
    L.armL.visible = kind === 'zip' || kind === 'bag';
    L.tie.visible = false;
    if (kind !== 'bag') L.held.visible = L.env.visible = false;
    L.leg.visible = kind === 'kick';
    // Camera-space keyframes (x right, y up, -z forward), so the hand and boot land in frame at any pitch.
    const path = (keys) => { // keys: [[t, x, y, z, rx, rz], ...] - eased between neighbours
      let k = 0;
      while (k < keys.length - 2 && t > keys[k + 1][0]) k++;
      const A = keys[k], B = keys[k + 1], u = S(A[0], B[0], t);
      return A.slice(1).map((v, n) => v + (B[n + 1] - v) * u);
    };
    if (kind === 'open') {
      // reach for the handle, turn it, push the door away
      const [x, y, z, rx, rz] = path([[0, 0.32, -0.5, -0.12, -0.3, 0], [0.35, 0.09, -0.16, -0.48, -0.1, 0], [0.5, 0.09, -0.16, -0.5, -0.1, -0.9], [1, 0.05, -0.12, -0.72, -0.05, -0.35]]);
      L.arm.position.set(x, y, z); L.arm.rotation.set(rx, 0.12, rz);
    } else if (kind === 'close') {
      // reach to the door's edge, pull it shut
      const [x, y, z, rx, rz] = path([[0, 0.32, -0.5, -0.12, -0.3, 0], [0.45, 0.26, -0.14, -0.62, -0.1, 0.4], [1, 0.2, -0.22, -0.3, -0.25, 0.4]]);
      L.arm.position.set(x, y, z); L.arm.rotation.set(rx, -0.2, rz);
    }
    // point a first-person hand at a camera-space position, reaching from a shoulder just below the view
    const hand = (arm, pos, sd) => {
      arm.position.copy(pos);
      const dir = new THREE.Vector3(sd * 0.22, -0.38, 0.12).sub(pos).negate().normalize();
      arm.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, -1), dir);
    };
    const rest = (sd) => new THREE.Vector3(sd * 0.24, -0.55, -0.15);
    if (kind === 'zip') {
      // hands stay on the person: between the shoulder blades as they're shoved down, then at the wrists
      const ev = G.Views.enemies.get(a.target);
      if (ev) {
        cam.updateMatrixWorld();
        const u = t;
        const c = cam.worldToLocal(G.Views.zipPoint(ev, u, a.living));
        c.multiplyScalar(1 - 0.06 / Math.max(0.1, c.length())); // gloves sit on the surface, not inside it
        const reach = a.pull ? 1 : S(0, 0.14, t), cinch = S(0.82, 0.9, u) * (1 - S(0.92, 1, u)); // hands on their back while dragging them
        const spread = u < 0.45 ? 0.12 : 0.055 + cinch * 0.05;
        for (const [arm, sd] of [[L.arm, 1], [L.armL, -1]]) hand(arm, rest(sd).lerp(c.clone().add(new THREE.Vector3(sd * spread, 0, 0)), reach), sd);
        if (u > (a.living ? 0.5 : 0.62) && !a.civBody) {
          const k = 1 - S(0.82, 0.92, u) * 0.45;
          L.tie.visible = true;
          L.tie.position.copy(c).add(new THREE.Vector3(0, 0.01, 0));
          L.tie.quaternion.copy(cam.quaternion).invert(); L.tie.rotateX(Math.PI / 2); // lies flat around the wrists
          L.tie.scale.set(k, k, 1);
        }
      }
    }
    if (kind === 'bag') {
      // kneel, pick the weapon up off the floor, slide it into an envelope, seal it, put it down
      const v = G.Views.evidence.get(a.target);
      cam.updateMatrixWorld();
      const floor = v ? cam.worldToLocal(new THREE.Vector3(v.x, (v.y || 0) + 0.06, v.z)) : new THREE.Vector3(0.05, -0.5, -0.6);
      const H = new THREE.Vector3(0.05, -0.12, -0.42), E = new THREE.Vector3(-0.07, -0.16, -0.4);
      const { reach, lift, envUp, insert, seal, down } = G.U.bagPhases(t);
      if (v && L.held.userData.wpn !== v.wpn) {
        while (L.held.children.length) L.held.remove(L.held.children[0]);
        L.held.add(G.GunModels.world(v.wpn, false)); L.held.userData.wpn = v.wpn;
      }
      L.held.visible = !!v && t > 0.22 && t < 0.6;
      if (L.held.visible) {
        if (!a.qFloor) a.qFloor = cam.quaternion.clone().invert().multiply(v.mesh.quaternion);
        const qHold = new THREE.Quaternion().setFromEuler(new THREE.Euler(0.15, Math.PI / 2 + 0.5, 0.1));
        L.held.position.copy(floor).lerp(H, lift).lerp(E, insert);
        L.held.quaternion.copy(a.qFloor).slerp(qHold, lift);
        L.held.scale.setScalar(1 - 0.85 * insert);
      }
      L.env.visible = t > 0.3;
      if (L.env.visible) {
        L.env.position.copy(rest(-1)).lerp(E, envUp).lerp(floor, down);
        L.env.rotation.set(1.15 - down * 1.1, 0.35 * (1 - down), 0);
        L.env.userData.flap.rotation.x = 2.3 * (1 - seal);
      }
      const press = E.clone().add(new THREE.Vector3(0.03, 0.03, 0.02));
      hand(L.arm, rest(1).lerp(floor, reach).lerp(H, lift).lerp(E.clone().add(new THREE.Vector3(0.07, 0.02, 0)), insert).lerp(press, seal).lerp(floor, down), 1);
      hand(L.armL, rest(-1).lerp(E.clone().add(new THREE.Vector3(-0.07, 0, 0.02)), envUp).lerp(floor.clone().add(new THREE.Vector3(-0.08, 0, 0)), down), -1);
    }
    if (kind === 'kick') {
      // boot: chamber (rises into view, toes up), drive the heel through (sole to the door), recover
      const [bx, by, bz, brx] = path([[0, 0.07, -0.85, -0.2, 0.3], [0.35, 0.06, -0.42, -0.42, 0.75], [0.58, 0.05, -0.34, -0.88, 1.25], [0.72, 0.05, -0.36, -0.84, 1.2], [1, 0.07, -0.85, -0.2, 0.3]]);
      // knee: below the view, lifts toward the chamber
      const [kx, ky, kz] = path([[0, 0.12, -1.05, 0.05], [0.35, 0.1, -0.5, -0.12], [0.58, 0.09, -0.6, -0.28], [0.72, 0.09, -0.62, -0.27], [1, 0.12, -1.05, 0.05]]);
      const u = L.leg.userData;
      u.boot.position.set(bx, by, bz); u.boot.rotation.set(brx, 0, 0);
      const ankle = new THREE.Vector3(bx, by + 0.08, bz + 0.06), knee = new THREE.Vector3(kx, ky, kz);
      const dir = new THREE.Vector3().subVectors(knee, ankle), len = dir.length();
      u.shin.position.copy(ankle).addScaledVector(dir, 0.5);
      u.shin.scale.set(1, len, 1);
      u.shin.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
      u.pad.position.copy(knee).addScaledVector(dir, -0.06); u.pad.quaternion.copy(u.shin.quaternion);
      // weight goes into it: a small dip on the chamber and a lunge with the thrust
      const thrust = S(0.35, 0.58, t) * (1 - S(0.72, 1, t));
      cam.position.y -= 0.04 * S(0, 0.35, t) * (1 - S(0.72, 1, t));
      cam.position.addScaledVector(new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw)), 0.08 * thrust);
    }
  },


  sendState(dt) {
    this.stateT -= dt;
    if (this.stateT > 0) return;
    this.stateT = 0.05;
    G.Net.toHost({ t: 'st', s: this.state() });
  },
  // what you're wearing, as others see it (js/rig.js setKit)
  kitLook() {
    const k = this.kit || {}, g = (it) => (it ? it.gid : 0), n = (it) => (it && it.molle ? it.molle.items.length : 0);
    return { helmet: g(k.helmet), face: k.helmet && k.helmet.face ? k.helmet.face.gid : 0, carrier: g(k.carrier), plate: k.carrier && k.carrier.plate ? 1 : 0, cp: n(k.carrier), belt: g(k.belt), bp: n(k.belt), pack: g(k.pack), ifak: k.ifak ? 1 : 0 };
  },
  state() {
    const r2 = (v) => Math.round(v * 100) / 100;
    return {
      p: [r2(this.pos.x), r2(this.pos.y), r2(this.pos.z)], yw: r2(this.yaw), pt: r2(this.pitch),
      hp: Math.ceil(this.hp), mhp: this.maxHp(), ar: Math.round(this.vestCond() * 100), amx: G.Gear.piece(this, 'chest') ? 100 : 0,
      pr: this.prone ? 1 : 0, dn: this.down ? 1 : 0, uc: this.out ? 1 : 0, dd: this.dead ? 1 : 0, bl: this.down ? (this.bleed == null ? -1 : Math.ceil(this.bleed)) : 0, bd: this.body ? G.Med.encode(this.body) : null,
      w: this.cur().def.code, ac: G.Ballistics.armourState(this), sk: G.Stickers.share(this.cur().stickers) || undefined, tl: this.tacFlags(this.cur()), cr: this.crouch || this.down || this.prone ? 1 : 0, ln: r2(this.lean || 0), lr: this.lowReady ? 1 : 0, sd: this.steadying ? 1 : 0, sw: this.stowed || this.held ? 1 : 0,
      hk: this.held ? (this.held.kind === 'flash' ? 2 : 1) : 0, hc: this.held && this.held.cock ? 1 : 0, hs: this.held ? this.held.str : 0,
      rl: this.reloading && this.reloadTotal ? r2(G.U.clamp(1 - this.reloadT / this.reloadTotal, 0, 1)) : -1, in: this.inspectT > 0 && this.inspectDur ? r2(1 - this.inspectT / this.inspectDur) : this.rChk ? r2(0.58 + (G.VMAnim.INSPECT_HOLD - 0.58) * this.rChk.k) : -1,
      mc: this.magChk ? r2(this.magChk.back > 0 ? Math.max(0, 1 - this.magChk.back) : this.magChk.k) : -1,
      act: this.action && this.action.kind ? this.action.kind[0] : 0, ap: this.action ? r2(Math.min(1, this.action.t / this.action.dur)) : 0, zt: this.action && this.action.kind === 'zip' ? this.action.target : -1, bt: this.action && this.action.kind === 'bag' ? this.action.target : -1, pl: this.action && this.action.pull ? 1 : 0, mv: r2(this.hspeed || 0),
      cred: Math.round(this.credits), sx: [this.stats.kills, Math.round(this.stats.dmg), this.stats.hs, this.stats.downs, this.stats.revives],
      kt: this.kitLook(), md: this.medCounts(),
    };
  },
};
