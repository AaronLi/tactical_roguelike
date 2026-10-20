'use strict';
// where a door stops being a kick and starts being a push: aim below this (m) to kick, above to open
const KICK_H = 1.3;
// The local player: input, movement, weapons, damage, revive/down state.
G.Me = {
  keys: {},
  // CQB pace (m/s): normal walk; weapon lowered (Space) to move quicker; steadied (Shift) to creep and
  // hold the gun still; crouch-walk
  SPEED: { walk: 1.9, low: 3.0, steady: 1.4, crouch: 1.3 },
  LEAN: 0.38, // metres the head moves sideways at full lean
  mouse: { l: false, r: false },
  pos: null,
  vel: null,
  yaw: 0,
  pitch: 0,

  // ------------------------------------------------------------- run state
  newRun() {
    this.credits = 500;
    G.Gear.starter(this); // kit, pockets and locker (js/gear.js)
    this.weapons = { s: this.makeWeapon('p9') }; // just a sidearm: the first primary comes from the shop
    this.stash = G.Gear.stashProxy(this); // weapon parts owned but not fitted: items, read as { partId: count }
    this.slot = 's';
    this.stats = { kills: 0, dmg: 0, hs: 0, downs: 0, revives: 0 };
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
  takeFromCase([code, mag, reserve, am, kit]) {
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
    if (G.GunAudio.available()) G.GunAudio.buildDry(w.def.soundKey);
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
  // Many browsers (and mouse software that sends a real "browser back") navigate on the side buttons whatever the
  // page does with the click. So the page keeps three history entries of its own and sits on the middle one:
  // back or forward lands on a neighbour, which it notices (popstate), steps off again, and reads as the button
  // (back: the light, forward: the laser). Only in a level: elsewhere back is left alone (a second back leaves
  // the page), and entering a level puts it on the middle entry again.
  navTrap() {
    try {
      history.replaceState({ bp: 'base' }, '');
      history.pushState({ bp: 'mid' }, '');
      history.pushState({ bp: 'top' }, '');
      this.navSkip = 1; history.back(); // (onto the middle one: that popstate is ours)
    } catch (e) { return; }
    window.addEventListener('popstate', (e) => {
      const s = e.state && e.state.bp;
      if (this.navSkip > 0) { this.navSkip--; return; }
      if (s !== 'base' && s !== 'top') return;
      if (G.Game.phase !== 'level') return; // (not playing: let it be)
      this.navSkip = 1;
      if (s === 'base') history.forward(); else history.back();
      // (a browser that let the page cancel the click already toggled it on mousedown)
      if (performance.now() - (this.sideAt || 0) > 500) this.toggleTac(s === 'base' ? 'light' : 'laser');
    });
  },
  // back on the middle history entry (entering a level after a back or forward outside one)
  navRearm() {
    const s = history.state && history.state.bp;
    if (s === 'base') { this.navSkip = 1; history.forward(); } else if (s === 'top') { this.navSkip = 1; history.back(); }
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
        case 'KeyC': if (!this.down) this.crouch = !this.crouch; break;
        case 'KeyG': this.throwNade(); break;
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
    window.addEventListener('blur', () => { this.keys = {}; this.mouse.l = this.mouse.r = false; });
    window.addEventListener('mousedown', (e) => {
      if (!G.Game.locked) return;
      if (e.button === 0) { this.mouse.l = true; this.pressBuf = 0.15; if (this.dead) this.specIdx++; }
      if (e.button === 2) this.mouse.r = true;
      if (e.button === 1) { e.preventDefault(); if (G.Game.phase === 'level' && !this.dead) this.ping(); } // middle click: ping
      // the side buttons: back for the weapon light, forward for the laser (not the browser's back/forward)
      // a tap switches it; held, it's on (or off) only while you hold it
      if (e.button === 3 || e.button === 4) {
        e.preventDefault(); this.sideAt = performance.now();
        if (G.Game.phase === 'level') {
          const kind = e.button === 3 ? 'light' : 'laser', w = this.cur(), was = w && !!w[kind];
          this.toggleTac(kind);
          (this.tacHold = this.tacHold || {})[kind] = { t: performance.now(), w, was, now: w && !!w[kind] };
        }
      }
    });
    window.addEventListener('mouseup', (e) => {
      if (e.button === 0) this.mouse.l = false;
      if (e.button === 2) this.mouse.r = false;
      if (e.button === 3 || e.button === 4) {
        e.preventDefault();
        const kind = e.button === 3 ? 'light' : 'laser', h = this.tacHold && this.tacHold[kind];
        if (h) { this.tacHold[kind] = null; if (performance.now() - h.t > 300 && h.w === this.cur() && h.now !== h.was && !!h.w[kind] === h.now) this.toggleTac(kind); } // (held: back as it was)
      }
    });
    window.addEventListener('auxclick', (e) => { if (e.button === 3 || e.button === 4) e.preventDefault(); });
    this.navTrap();
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
      if (!G.Game.locked || this.dead) return;
      const z = G.U.lerp(1, this.sight(this.cur()).zoom, this.adsT || 0);
      const s = 0.0022 * G.Game.settings.sens * z;
      // a magazine in your hand, or the gun held open for a chamber check: the mouse turns that, not your view
      const mc = this.magChk;
      if (mc && !mc.rel && mc.k > 0.6) { mc.yaw = G.U.clamp(mc.yaw + e.movementX * s * 1.6, -1.4, 1.4); mc.pitch = G.U.clamp(mc.pitch + e.movementY * s * 1.6, -1.0, 0.6); return; }
      if (this.inspHold) { this.inspYaw = G.U.clamp((this.inspYaw || 0) + e.movementX * s * 1.4, -1.5, 1.5); this.inspPitch = G.U.clamp((this.inspPitch || 0) + e.movementY * s, -0.6, 0.6); return; } // (inspYaw: the roll)
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
    this.down = false; this.dead = false;
    this.crouch = false; this.onGround = true;
    this.eyeH = 1.62;
    this.fireCd = 0; this.swapT = 0; this.reloading = false; this.reloadT = 0; this.burstQ = 0;
    this.adsT = 0; this.ads = false; this.kick = 0; this.flashT = 0;
    this.rc = { y: 0, p: 0, vy: 0, vp: 0 }; // recoil: aim offset (rad, yaw left / pitch up) and its momentum
    this.flinch = { y: 0, p: 0 }; this.swayOff = { y: 0, p: 0 }; this.swayT = Math.random() * 20; this.walkAmp = 0;
    this.sinceHurt = 99; this.sinceFire = 99; this.healLeft = 0;
    this.reviveT = 0; this.bobT = 0;
    this.stateT = 0; this.specIdx = 0; this.pressBuf = 0; this.lastTrigger = false;
    this.lowToggle = false; this.stowed = false; this.action = null; this.stowW = 0; this.raiseMax = 0.3; this.shakeT = 0;
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
    if (this.dead) { this.spectate(); this.sendState(dt); return; }

    this.sinceHurt += dt; this.sinceFire += dt;
    this.pressBuf = Math.max(0, this.pressBuf - dt);
    const maxHp = this.maxHp();

    // bleeding; down, the clock runs too
    const fate = G.Med.tick(this.body, dt);
    this.hp = G.Med.overall(this.body);
    if (fate === 'dead') return this.die('Bled out');
    if (!this.down) { if (fate === 'down') this.goDown(); }
    else {
      this.bleed -= dt;
      if (this.bleed <= 0) this.die(this.downCause());
    }

    this.move(dt, map);
    this.weaponUpdate(dt);
    this.interact(dt);
    this.updateCamera(dt);
    this.sendState(dt);
    this.fEdge = false;
  },

  move(dt, map) {
    const k = this.keys, blocked = this.down || G.Game.chatOpen || !G.Game.locked || !!(this.action && (this.action.kind === 'zip' || this.action.kind === 'bag'));
    let fw = blocked ? 0 : (k.KeyW ? 1 : 0) - (k.KeyS ? 1 : 0);
    let st = blocked ? 0 : (k.KeyD ? 1 : 0) - (k.KeyA ? 1 : 0);
    // Space: weapon to low ready, move quicker, can't shoot. Shift: creep with the weapon steadied.
    const wasLow = this.lowReady;
    if (this.mouse.l || this.mouse.r || this.down || this.stowed) this.lowToggle = false; // firing or aiming brings the weapon up
    this.lowReady = !blocked && !!this.lowToggle;
    this.steadying = !blocked && !this.lowReady && !!(k.ShiftLeft || k.ShiftRight);
    if (wasLow && !this.lowReady) this.raiseT = this.raiseMax = 0.5; // bringing the gun back up
    let speed = this.lowReady ? this.SPEED.low : this.steadying ? this.SPEED.steady : this.SPEED.walk;
    if (this.crouch) speed = Math.min(speed, this.SPEED.crouch) * (this.lowReady ? 1.3 : this.steadying ? 0.75 : 1);
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
    const prevY = this.pos.y;
    this.pos.x += this.vel.x * dt;
    this.pos.z += this.vel.z * dt;
    G.Level.resolve(map, this.pos, 0.35, prevY);
    this.pos.y += this.vel.y * dt;
    const g = G.Level.groundAt(map, this.pos.x, this.pos.z, 0.35, prevY);
    if (this.pos.y <= g) { this.pos.y = g; this.vel.y = 0; this.onGround = true; } else this.onGround = false;
    let eyeTarget = this.down ? 0.45 : this.crouch ? 1.0 : 1.62;
    const ac = this.action;
    if (ac && (ac.kind === 'zip' || ac.kind === 'bag')) { // going down with them / kneeling at the evidence
      const p = ac.t / ac.dur;
      const kneel = ac.approach ? 0 : ac.kind === 'zip' && ac.living ? G.U.smooth(0.12, 0.5, p) : G.U.smooth(0, 0.25, p);
      eyeTarget = G.U.lerp(eyeTarget, ac.kind === 'zip' && ac.living ? 0.88 : 0.95, kneel);
    }
    this.eyeH += (eyeTarget - this.eyeH) * Math.min(1, dt * 12);
    if (this.pos.y + this.eyeH > G.Level.WALL_H - 0.15) { this.pos.y = G.Level.WALL_H - 0.15 - this.eyeH; this.vel.y = Math.min(0, this.vel.y); }
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
  RECOIL: { KP: 110, KD: 13, VMAX: 20, POS: 0.6, VEL: 7, PUNCH: 0.8, PUNCH_Y: 0.7, ROLL: 0.25, VIEW: { p: 0.3, y: 0.25 } },
  SWAY_GAIN: 1.6, // how big the aim wobble is (breathing, twitch, walking); 1 = the old, subtler sway
  // per-build handling, from the build's recoil (degrees/shot), class, weight and handling
  recoilModel(def) {
    this._rm = this._rm || new WeakMap();
    let m = this._rm.get(def);
    if (m) return m;
    const deg = Math.PI / 180, cls = def.cls, onehand = cls === 'PST' || cls === 'MP';
    const up = def.recoil * 2.3 * deg;
    const sideK = { PST: 0.8, MP: 0.9, SMG: 0.75, SG: 0.7, LMG: 0.8, SNP: 0.4, DMR: 0.55, BR: 0.7, RAIL: 0.4, BOW: 0.4, GL: 0.55 }[cls] || 0.65;
    const kg = def.weight || 3;
    m = {
      up, side: up * sideK,
      rec: G.U.clamp((def.handling || 1) * (onehand ? 1.15 : 1), 0.55, 1.6), // spring strength: how fast it comes back
      capUp: up * 6 + 0.03, capSide: Math.max(0.025, up * sideK * 6),
      sway: onehand ? 1.25 : G.U.clamp(0.75 + kg * 0.07, 0.8, 1.6), // breathing amplitude (heavy guns droop more)
      erratic: onehand ? 0.35 : cls === 'SMG' ? 0.12 : 0.03, // the faster twitch that makes a pistol wander
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
    }
    rc.y = G.U.clamp(rc.y, -m.capSide, m.capSide);
    rc.p = G.U.clamp(rc.p, -m.capUp * 0.4, m.capUp);
    const f = Math.exp(-6 * dt); this.flinch.y *= f; this.flinch.p *= f;
  },
  recoilKick(def) {
    const R = this.RECOIL, rc = this.rc, m = this.recoilModel(def);
    // a hyper-burst pair (AN-94) leaves before the recoil reaches you: the two rounds kick less than two
    const hyper = this.fireMode && this.fireMode(this.cur()) === 'hyper' && this.hyperQ > 0 ? 0.7 : 1;
    const k = this.steadiness() * (this.crouch ? 0.8 : 1) * (this.adsT > 0.5 ? 0.85 : 1) * hyper;
    const side = (Math.random() < 0.5 ? -1 : 1) * m.side * (0.9 + Math.random() * 0.8) * k; // never fires flat
    const up = m.up * (0.85 + Math.random() * 0.3) * k;
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
    const t = this.swayT, atro = 1 + low * 1.4, hold = this.steadying ? 0.4 : 1;
    const amp = m.sway * G.U.lerp(1.6, 1, a) * (this.crouch ? 0.75 : 1) * hold * atro;
    const er = m.erratic * atro * hold, wa = this.walkAmp * (1 - a * 0.5);
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
    if (slot === this.slot || this.down || this.dead || !this.weapons[slot]) return;
    this.slot = slot;
    this.reloading = false; this.burstQ = 0;
    this.swapT = this.swapMax = 0.42;
    this.inspectT = 0; this.rackT = 0; this.magChk = null; this.rHeldAt = 0;
    G.R.setViewmodel(this.cur().def);
    G.Audio.click();
  },
  // R: a tap reloads (on letting go); held, it pulls the magazine to check it (when the gun takes one)
  rPress() {
    const w = this.cur();
    if (this.reloading || this.magChk || this.stowed || this.down || !w || w.noMag || !G.VMAnim.canMagCheck(G.R.vm)) { this.reloadKey(); return; }
    this.rHeldAt = performance.now();
  },
  rRelease() {
    if (this.rHeldAt) { this.rHeldAt = 0; this.reloadKey(); }
    else if (this.magChk) this.magChk.rel = true;
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
    // A reload is put together from what the gun needs: the magazine change, then from empty either a thumb on
    // the bolt catch (a gun that locked open on its last round: quick) or the action worked by hand (a rack)
    this.reloadAct = this.reloadEmpty && isMag && !w.def.enbloc && !G.beltFed(w.def) && !w.def.akimbo ? (G.boltHold(w.def) ? 'release' : 'rack') : null;
    this.reloadTimes(w.def);
    this.reloadEv = 0;
    G.Casings.emptied(w.def, mag - w.mag, w.spent); w.spent = []; // a revolver or break-action: the empties fall out (each hull its load's colour)
    if (w.def.shell || !G.Audio.sample('pull_magazine')) G.Audio.reload();
  },
  reloadTime(def) { return def.reload; },
  ACT_T: { release: 0.3, rack: 0.6 },
  // the reload's length: the magazine change (how depends on where the old one goes) and then the action;
  // reloadSplit: the share that's the magazine change (js/vmanim.js times the two to it)
  reloadTimes(def, done = 0) {
    const mag = this.reloadTime(def) * this.RELOAD_K[this.reloadMode] * this.reloadPackK, act = this.ACT_T[this.reloadAct] || 0;
    this.reloadTotal = mag + act; this.reloadSplit = mag / this.reloadTotal;
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
    if (this.reloading || this.magChk || this.stowed || this.swapT > 0 || this.adsT > 0.2 || this.down || this.inspectT > 0) return;
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
    this.ads = this.mouse.r && !this.magChk && !this.lowReady && !this.stowed && this.raiseT <= 0 && this.swapT <= 0 && !(this.reloading && !def.shell) && G.Game.locked && !def.akimbo;
    this.adsT += ((this.ads ? 1 : 0) - this.adsT) * Math.min(1, dt * 9 * (this.cur().def.handling || 1)); // ergonomics: aim speed

    // inspecting stops the moment you do anything with the gun; racking after the last shell takes a beat
    if (this.inspectT > 0 && (this.ads || this.mouse.l || this.reloading || this.stowed || this.lowReady)) this.inspectT = 0;
    this.inspectT = Math.max(0, (this.inspectT || 0) - dt);
    // holding I holds the chamber check open (the mouse turns the gun, see bindInput); letting go finishes it
    const IH = G.VMAnim.INSPECT_HOLD;
    this.inspHold = this.inspectT > 0 && !!this.keys.KeyI && 1 - this.inspectT / this.inspectDur >= IH;
    if (this.inspHold) this.inspectT = this.inspectDur * (1 - IH);
    else if (this.inspYaw || this.inspPitch) { const k = Math.min(1, dt * 6); this.inspYaw -= this.inspYaw * k; this.inspPitch -= this.inspPitch * k; if (Math.abs(this.inspYaw) + Math.abs(this.inspPitch) < 1e-3) this.inspYaw = this.inspPitch = 0; }
    // holding R: the magazine check (js/vmanim.js magCheckClip). Out, look, and back in when you let go (or do anything else).
    if (this.rHeldAt && performance.now() - this.rHeldAt > 260) {
      this.rHeldAt = 0;
      if (!this.reloading && !w.noMag && G.VMAnim.canMagCheck(G.R.vm)) { this.magChk = { k: 0, back: 0, yaw: 0, pitch: 0 }; this.inspectT = 0; G.Audio.click(); }
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
    this.rackT = Math.max(0, (this.rackT || 0) - dt);
    if (this.rackT > 0) this.fireCd = Math.max(this.fireCd, this.rackT);
    if (this.reloading) {
      this.reloadT -= dt;
      if (!def.shell && this.reloadTotal) {
        const k = 1 - this.reloadT / this.reloadTotal, pistol = def.cls === 'PST' || def.cls === 'MP';
        // the old magazine leaves your hand onto the floor (as the viewmodel lets go of it)
        if (this.reloadMode === 'floor' && !this.magDropped && !w.noMag && k > (pistol ? 0.06 : 0.2)) this.magDropped = G.Casings.dropMag(def) || true;
        const km = k / (this.reloadSplit || 1), ka = this.reloadSplit < 1 ? (k - this.reloadSplit) / (1 - this.reloadSplit) : -1; // (through the magazine change; through the action)
        if (this.reloadEv === 0 && km > (this.reloadMode === 'retain' || this.reloadMode === 'pouch' ? 0.76 : 0.68)) { this.reloadEv = 1; G.Audio.sample('insert_magazine'); }
        if (this.reloadEv === 1 && this.reloadAct === 'release' && ka > 0.45) { this.reloadEv = 2; G.Audio.sample('drop_slide', 0.9, pistol ? 1 : 0.85); }
        if (this.reloadEv === 1 && this.reloadAct === 'rack' && ka > 0.5) { this.reloadEv = 2; G.Audio.sample(pistol ? 'drop_slide' : 'rack_slide'); }
      }
      if (this.reloadT <= 0) {
        if (def.shell) {
          // one shell, or with a speed loader several at a push
          const got = w.mag < mag ? G.Gear.takeRounds(this, def, Math.min(def.perLoad || 1, mag - w.mag), w.ammo) : [];
          if (got.length) { w.mag += got.length; w.ammo = got[got.length - 1]; if (w.tube) w.tube.push(...got); G.Audio.sample('insert_magazine', 0.5, 1.6) || G.Audio.shell(); }
          if (w.mag < mag && w.reserve > 0) { this.reloadT = this.reloadTime(def); this.reloadTotal = this.reloadT; }
          else { this.reloading = false; if (this.reloadEmpty) { this.rackT = 0.5; G.Audio.sample('rack_slide', 0.7, 0.9); } this.feed(w); }
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
          this.feed(w); // run dry: the reload ended by working the action (its sound is above)
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
    if (this.swapT > 0 || this.lowReady || this.stowed || this.raiseT > 0) { this.burstQ = 0; return; }
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
    if (ch && !w.chamber && w.mag > 0 && (!this.reloading || def.shell) && (pressed || this.pressBuf > 0)) { this.reloading = false; this.rack(w); this.burstQ = 0; this.pressBuf = 0; return; } // click: tap, rack (shells: stop loading and rack)
    if (ch ? !w.chamber : w.mag <= 0) {
      if (pressed || mode !== 'auto' || !this.dryT || this.dryT < performance.now()) { G.Audio.dry(); this.dryT = performance.now() + 300; }
      this.burstQ = 0; this.pressBuf = 0; // just the click: reloading is up to you (R)
      return;
    }
    if (this.reloading) { if (def.shell) this.reloading = false; else return; }
    this.shoot(w);
    if (ch) { w.chamber = null; this.feed(w, true); } else w.mag--; // (the action strips the next round into the chamber)
    // AN-94 style hyper-burst: the first rounds of each pull leave at a much higher rate. The wait after this
    // round is set by the next one: still part of the pair (hyper rate), or the gun's own cyclic rate after it.
    if (this.hyperQ > 0) this.hyperQ--;
    const rate = mode === 'hyper' && this.hyperQ > 0 ? def.hyperRpm : mode === 'burst' && def.burstRpm ? def.burstRpm : def.rpm;
    // high rates aren't rounded up to whole frames: within a string of shots, what's left of the last frame
    // carries over (the first shot of a pull starts the clock fresh)
    this.fireCd = (this.sinceShot > 60 / rate + 0.034 ? 0 : Math.max(this.fireCd, -0.034)) + 60 / rate;
    this.sinceShot = 0;
    this.cycleMax = this.fireCd;
    this.cylTarget += Math.PI / 3;
    if (def.enbloc && w.mag === 0) G.Audio.ping(); // the clip flies out
    this.pressBuf = 0;
    if (mode === 'burst') { this.burstQ--; if (this.burstQ <= 0 || !G.loaded(w)) { this.burstQ = 0; this.fireCd += 0.24; } }
  },
  // the next round from the magazine (or tube) into an empty chamber
  feed(w) {
    if (!G.chambered(w.def) || w.chamber || w.mag <= 0) return false;
    w.chamber = w.tube && w.tube.length ? w.tube.pop() : w.ammo;
    w.mag--;
    return true;
  },
  // working the action by hand: a round from the magazine into the chamber (a moment, both hands)
  rack(w) {
    if (!this.feed(w)) return;
    this.rackT = 0.45; this.fireCd = Math.max(this.fireCd, 0.45);
    G.Audio.sample(w.def.cls === 'PST' || w.def.cls === 'MP' ? 'drop_slide' : 'rack_slide', 0.8);
  },

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
    const muzzle = origin.clone().addScaledVector(fwd, 0.7).addScaledVector(right, (def.akimbo ? 0.13 * side : 0.17) * (1 - this.adsT)).addScaledVector(up, -0.12 * (1 - this.adsT) - 0.05);

    let spread = G.U.lerp(def.spreadNoLaser && !w.laser ? def.spreadNoLaser : def.spread, def.ads, this.adsT); // (a laser helps only while it's on)
    spread *= this.steadiness();
    if (this.crouch) spread *= 0.75;
    spread *= 1 + Math.min(this.hspeed / this.SPEED.walk, 1.4) * 0.8 * (1 - this.adsT * 0.6);
    if (!this.onGround) spread *= 1.8;
    const sr = (spread * Math.PI) / 180;

    // where the gun actually points this shot (one error for the whole shot), then for a shotgun the pattern
    // around it: the choke's cone, denser in the middle (roughly normal, clipped at 1.6x)
    const a0 = Math.random() * Math.PI * 2, r0 = Math.sqrt(Math.random()) * Math.tan(sr);
    const aim = fwd.clone().addScaledVector(right, Math.cos(a0) * r0).addScaledVector(up, Math.sin(a0) * r0).normalize();
    const pr = Math.tan(((def.choke || 0) * Math.PI) / 180);
    let firstEnd = null;
    for (let i = 0; i < def.pellets; i++) {
      let dir = aim;
      if (def.pellets > 1 && pr > 0) {
        const a = Math.random() * Math.PI * 2, rr = pr * Math.min(1.6, Math.sqrt(-2 * Math.log(1 - Math.random())) * 0.6);
        dir = aim.clone().addScaledVector(right, Math.cos(a) * rr).addScaledVector(up, Math.sin(a) * rr).normalize();
      }
      const end = this.trace(origin, dir, muzzle, def, i === 0 || def.pellets <= 10);
      if (!firstEnd) firstEnd = end;
    }
    // friendly fire: the wounds you put in teammates this shot, sent on (a shotgun's pellets together)
    if (this.ffQ && this.ffQ.size) {
      for (const [tg, hz] of this.ffQ) G.Net.toHost({ t: 'ff', tg, hz, w: w.def.code, f: [origin.x, origin.y, origin.z].map((v) => Math.round(v * 100) / 100) });
      this.ffQ.clear();
    }

    if (def.cls === 'RAIL') G.Audio.rail();
    else if (def.cls === 'BOW') G.Audio.bow();
    else if (!G.GunAudio.play(def.soundKey, null)) G.Audio.shot(w.sup ? G.SUPPRESSOR.snd : def.snd);
    if (!w.sup && def.cls !== 'BOW') {
      this.flashT = 0.05;
      G.R.vmMuzzle.intensity = 3;
      G.R.muzzleFlashAt(muzzle, def.tracer || 0xffb060);
    }

    G.Casings.fired(def, true, null, null, round); // the spent case, out of the port (or when the action's worked)
    // the kick only throws the muzzle for the next shot: this one already left where you were aiming
    this.recoilKick(def);
    this.kick = Math.min(1, this.kick + 0.35 + def.recoil * 0.06);

    const r2 = (v) => Math.round(v * 100) / 100;
    G.Net.toHost({ t: 'shot', f: [r2(muzzle.x), r2(muzzle.y), r2(muzzle.z)], to: [r2(firstEnd.x), r2(firstEnd.y), r2(firstEnd.z)], w: def.code, am: round, sil: def.cls === 'BOW' ? 2 : w.sup ? (def.quiet ? 2 : 1) : 0 });
  },

  // Raycast one bullet: world geometry + enemy hitboxes, with penetration.
  trace(origin, dir, muzzle, def, drawTracer) {
    const map = G.Game.map, L = G.Level;
    const wall = L.raycast(map, origin.x, origin.y, origin.z, dir.x, dir.y, dir.z, 250, { glass: true }); // (through windows)
    const hits = [];
    for (const ev of G.Views.enemies.values()) {
      if (!ev.alive) continue;
      const sc = ev.def.scale;
      // cheap reject: the ray must pass within ~1.4 m of the body before testing bone capsules
      const cx = ev.pos.x - origin.x, cy = ev.pos.y + sc - origin.y, cz = ev.pos.z - origin.z;
      const along = cx * dir.x + cy * dir.y + cz * dir.z;
      if (along < -1.5 || along > wall.t + 1.5) continue;
      const px = cx - dir.x * along, py = cy - dir.y * along, pz = cz - dir.z * along;
      if (px * px + py * py + pz * pz > 1.96 * sc * sc) continue;
      const h = G.Rig.raycast(ev.rig, origin, dir, wall.t);
      if (h) hits.push({ t: h.t, zone: h.zone, c: h.c, up: h.up, side: h.side, head: h.zone === 'head', ev, behind: h.behind });
    }
    // friendly fire is on: your teammates are in the way too
    for (const pv of G.Views.players.values()) {
      if (!pv.st || pv.st.dd || !pv.rig || !pv.rig.root.visible) continue;
      const cx = pv.pos.x - origin.x, cy = pv.pos.y + 1 - origin.y, cz = pv.pos.z - origin.z, along = cx * dir.x + cy * dir.y + cz * dir.z;
      if (along < -1.5 || along > wall.t + 1.5) continue;
      const h = G.Rig.raycast(pv.rig, origin, dir, wall.t);
      if (h) hits.push({ t: h.t, zone: h.zone, c: h.c, side: h.side, mate: pv, behind: h.behind });
    }
    hits.sort((a, b) => a.t - b.t);
    let endT = wall.t, hitWall = true;

    if (def.explosive) {
      if (hits.length) { endT = hits[0].t; hitWall = false; }
      const p = origin.clone().addScaledVector(dir, Math.max(0, endT - 0.15));
      G.R.tracer(muzzle, p, 0xbbbbbb, 0.05);
      this.explode(p, def.explosive.r, def.explosive.dmg, false);
      return p;
    }

    const pen = def.pen;
    let n = 0;
    const sup = this.cur().sup ? G.SUPPRESSOR.dmg : 1;
    for (const h of hits) {
      const d = h.t;
      const fall = d <= def.range ? 1 : Math.max(def.falloff, 1 - ((d - def.range) / (def.range * 1.5)) * (1 - def.falloff));
      // how hard this round still hits (range, a suppressor, anything it already went through), then the wound
      const k = G.woundPower(def.dmg) * fall * sup * Math.pow(0.75, n);
      if (h.mate) { // a teammate: the wound's theirs to take (js/player.js takeHits, on their machine)
        const q = (this.ffQ = this.ffQ || new Map()), list = q.get(h.mate.id) || [];
        list.push([h.zone, h.c < 0.5 ? 1 : 0, h.side || 'R']); if (h.behind) list.push([h.behind.zone, h.behind.c < 0.5 ? 1 : 0, h.behind.side || 'R']); // (central: through the middle of the part)
        q.set(h.mate.id, list);
        h.mate.rig.hit(dir);
        G.R.impact(origin.clone().addScaledVector(dir, d), null, 'blood');
        n++;
        if (n > pen) { endT = d; hitWall = false; break; }
        continue;
      }
      this.wound(h, k, def);
      // through the arm and on into the body behind it, a little slower
      if (h.behind) this.wound(Object.assign({ ev: h.ev, head: h.behind.zone === 'head' }, h.behind), k * 0.85, def);
      h.ev.rig.hit(dir);
      h.ev.selfHit = true;
      h.ev.lastHitDir = dir.clone().setY(0).normalize();
      const hp = origin.clone().addScaledVector(dir, d);
      G.R.impact(hp, null, 'blood');
      // out the far side onto a wall close behind them
      if (wall.n && wall.t - d < 1.6 && wall.t - d > 0) G.R.bloodWall(origin.clone().addScaledVector(dir, wall.t), wall.n, 0.25 + 0.25 * (1 - (wall.t - d) / 1.6));
      n++;
      if (n > pen) { endT = d; hitWall = false; break; }
    }
    const end = origin.clone().addScaledVector(dir, endT);
    // the windows it went through on the way break (here at once, and for everyone through the host)
    const panes = (wall.glass || []).filter(([id, gt]) => gt < endT && map.windows[id] && !map.windows[id].broken).map(([id]) => id);
    if (panes.length) { for (const id of panes) G.Views.breakGlass(id, origin.clone().addScaledVector(dir, (wall.glass.find((g) => g[0] === id) || [0, endT])[1]), dir); G.Net.toHost({ t: 'glass', ids: panes }); }
    if (hitWall && !wall.view) G.R.impact(end, wall.n, 'wall'); // (not on the view behind an outside window)
    if (def.cls === 'BOW') G.R.tracer(muzzle, end, def.tracer, 0.03, 0.25);
    else if (drawTracer) G.R.tracer(muzzle, end, def.tracer || 0xffd080, def.cls === 'RAIL' ? 0.06 : 0.018);
    return end;
  },
  // One round's wound on one body part (k: how hard it still hits). An unarmoured head is a kill; a helmet covers
  // the top of the head, not the face below its brim. Elsewhere the wound depends on the part and how centrally
  // the round went through it (G.WOUNDS), less whatever their armour stops; their armour wears as yours does
  // (tracked here as ev.vc / ev.hc, its condition).
  wound(h, k, def) {
    const ev = h.ev, ed = ev.def;
    if (h.head) {
      const helm = G.ARMORS[ed.helmet], zone = h.up < -0.05 ? 'face' : 'head';
      const st = G.armorStop(helm, zone, def, ev.hc == null ? 1 : ev.hc);
      if (st <= 0) { this.queueHit(ev.id, 0, true, 0, true); return; }
      ev.hc = Math.max(0, (ev.hc == null ? 1 : ev.hc) - G.armorWear(def) / helm.dur);
      this.queueHit(ev.id, 0, true, 1.1 * k * (1 - st));
      return;
    }
    const w = G.woundOf(h.zone, h.c < G.WOUND_CENTRAL, k), vest = G.ARMORS[ed.vest];
    const st = G.armorStop(vest, h.zone, def, ev.vc == null ? 1 : ev.vc);
    if (st > 0) ev.vc = Math.max(0, (ev.vc == null ? 1 : ev.vc) - G.armorWear(def) / vest.dur);
    this.queueHit(ev.id, 0, false, w * (1 - st) + w * st * 0.1);
    // and the wound itself, for the host's injuries: where, through the middle or not, how much got through
    const q = this.hitQ.get(ev.id);
    (q.w = q.w || []).push([h.zone, h.c < G.WOUND_CENTRAL ? 1 : 0, Math.round((1 - st) * 100) / 100, h.side || '']);
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
      G.Net.toHost({ t: 'hit', e, d: Math.round(q.d), f: Math.round(q.f * 1000) / 1000, k: q.k ? 1 : 0, h: q.h, w: q.w ? q.w.slice(0, 12) : undefined });
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
      const cy = 1.0 * ev.def.scale;
      const d = Math.hypot(ev.pos.x - p.x, cy - p.y, ev.pos.z - p.z);
      if (d > r + 0.4 * ev.def.scale) continue;
      if (!G.Level.los(map, p.x, p.y + 0.2, p.z, ev.pos.x, cy, ev.pos.z)) continue;
      this.queueHit(ev.id, dmg * (1 - Math.min(1, d / r) * 0.6), false);
      ev.selfHit = true;
    }
    const r2 = (v) => Math.round(v * 100) / 100;
    G.Net.toHost({ t: 'boom', p: [r2(p.x), r2(p.y), r2(p.z)], r: r2(r), d: Math.round(dmg) });
  },

  throwNade() {
    if (this.down || this.dead || !G.Gear.take(this, 'frag')) return;
    const cam = G.R.camera;
    const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(cam.quaternion);
    const p = cam.position.clone().addScaledVector(fwd, 0.5);
    const v = fwd.multiplyScalar(15).add(new THREE.Vector3(this.vel.x * 0.5, 3, this.vel.z * 0.5));
    G.Views.addNade(p, v, 2.2, true);
    G.Audio.pin();
    const r2 = (x) => Math.round(x * 100) / 100;
    G.Net.toHost({ t: 'nade', p: [p.x, p.y, p.z].map(r2), v: [v.x, v.y, v.z].map(r2), fuse: 2.2 });
  },
  shout() {
    if (this.dead || (this.shoutT || 0) > performance.now()) return;
    this.shoutT = performance.now() + 1500;
    G.Audio.shout(null);
    G.HUD.toast('', G.U.pick(Math.random, ['POLICE! SHOW ME YOUR HANDS!', 'POLICE! DROP THE WEAPON!', 'GET ON THE GROUND! NOW!', 'POLICE! HANDS WHERE I CAN SEE THEM!']), 1.4);
    G.Net.toHost({ t: 'shout' });
  },
  // H: there's no medkit to slap on; your body and your medical gear are in the Tab screen
  useMed() { if (!this.dead) G.Game.toggleInv(true); },
  // a teammate treated you (they used their item; it lands here)
  treated(part, mt, by) {
    if (this.dead || !G.Med.treat(this.body, part, mt)) return;
    G.Audio.heal();
    G.HUD.toast('', `${by} used ${G.Med.ITEMS[mt].name.toLowerCase()} on your ${G.Med.NAME[part].toLowerCase()}`, 2);
  },

  // ------------------------------------------------------------- F interactions
  // Every interaction puts the weapon away (hands are busy); afterwards it takes drawTime() to bring
  // it back up. Everything is a hold: let go of F and the action is abandoned (unless its effect has
  // already happened, e.g. the boot has landed). After finishing, F must be released before the next one.
  drawTime() { const d = this.cur().def; return (d.slot === 's' ? 0.65 : 1.0) / (d.handling || 1); },
  // kind drives the animation; events fire part-way through (e.g. the door moves when the push lands)
  startAction(label, dur, onDone, kind = null, events = []) { this.action = { label, dur, t: 0, onDone, kind, events }; },
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
      if (!ok(ev) || !ev.rig || Math.hypot(ev.pos.x - this.pos.x, ev.pos.z - this.pos.z) > reach) continue;
      const h = G.Rig.raycast(ev.rig, o, d, reach + 0.6);
      let t = h ? h.t : Infinity;
      if (!h) { // a little leeway: close enough to the middle of them
        (ev.alive ? ev.rig.chest : ev.rig.hips).getWorldPosition(_v);
        const to = _v.sub(o), dist = to.length();
        if (dist < reach + 0.6 && to.normalize().dot(d) > Math.cos(7 * Math.PI / 180)) t = dist;
      }
      if (t < bt) { bt = t; best = ev; }
    }
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
      const to = new THREE.Vector3(v.x - o.x, 0.04 - o.y, v.z - o.z), dist = to.length();
      if (Math.hypot(v.x - this.pos.x, v.z - this.pos.z) > reach) continue;
      if (to.normalize().dot(d) > Math.cos(9 * Math.PI / 180) && dist < bd) { bd = dist; best = i; }
    }
    return best;
  },
  // the closed door under the crosshair, and how high on it you're looking
  aimedDoor(map) {
    const cam = G.R.camera, L = G.Level, REACH = 1.9;
    const f = new THREE.Vector3(0, 0, -1).applyQuaternion(cam.quaternion);
    const h = L.raycast(map, cam.position.x, cam.position.y, cam.position.z, f.x, f.y, f.z, REACH);
    if (h.t >= REACH || !h.n) return null;
    const px = cam.position.x + f.x * (h.t + 0.03), pz = cam.position.z + f.z * (h.t + 0.03);
    const tx = Math.floor(px / L.TS), tz = Math.floor(pz / L.TS);
    if (L.tile(map, tx, tz) !== 3) return null;
    const d = map.doorAt.get(tz * map.W + tx);
    const y = cam.position.y + f.y * h.t;
    if (!d || d.open || y > L.DOOR_H) return null; // the lintel isn't the door
    return { d, y };
  },
  interact(dt) {
    let prompt = '', prog = -1, label = '', busy = false;
    const map = G.Game.map, held = this.keys.KeyF && !G.Game.chatOpen;
    if (!held) this.fLatch = false;
    const F = held && !this.fLatch;

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
      let cuffTgt = tgt ? null : this.aimedPerson((ev) => (ev.alive ? ev.scode === 1 || (ev.def.civ && ev.scode === 3) : !ev.bodySecured && ev.deadT > 1));
      const evAim = tgt ? null : this.aimedEvidence();
      if (cuffTgt && evAim !== null) {
        const v = G.Views.evidence.get(evAim), c = new THREE.Vector3();
        (cuffTgt.alive ? cuffTgt.rig.chest : cuffTgt.rig.hips).getWorldPosition(c);
        if (this.offAim(v.x, 0.04, v.z) < this.offAim(c.x, c.y, c.z)) cuffTgt = null;
      }
      if (cuffTgt) {
        const ev = cuffTgt, who = ev.def.civ ? 'civilian' : ev.def.name.toLowerCase();
        // the living are restrained from behind: walk round them first
        const fx = -Math.sin(ev.yaw), fz = -Math.cos(ev.yaw);
        const bx = this.pos.x - ev.pos.x, bz = this.pos.z - ev.pos.z, bl = Math.hypot(bx, bz) || 1;
        const behind = !ev.alive || (fx * bx + fz * bz) / bl < -0.3;
        if (!ev.alive) prompt = ev.def.civ ? 'Hold <b>F</b> to report civilian casualty' : 'Hold <b>F</b> to zip-tie body';
        else if (!behind) prompt = 'Hold <b>F</b> to order the ' + G.U.esc(who) + ' to turn around';
        else prompt = ev.def.civ ? 'Hold <b>F</b> to restrain civilian' : 'Hold <b>F</b> to arrest ' + G.U.esc(who);
        if (F && !behind && ev.alive) { // "Turn around!" - weapon stays on them
          const id = ev.id;
          this.startAction('Ordering to turn around', 0.45, () => G.Net.toHost({ t: 'turn', e: id }), 'order');
          this.action.target = id;
          G.Audio.order(null);
        } else if (F && behind) {
          const id = ev.id;
          this.startAction(ev.alive ? 'Zip-tying' : ev.def.civ ? 'Reporting' : 'Zip-tying', ev.alive ? 2.2 : ev.def.civ ? 1.6 : 2.6, () => G.Net.toHost({ t: 'cuff', e: id }), 'zip');
          const wr = G.Views.zipPoint(ev, 0, ev.alive); // a body: kneel by its shoulder
          Object.assign(this.action, { target: id, living: ev.alive, civBody: !ev.alive && !!ev.def.civ, // a casualty is reported, not tied
            // living: walked in to just behind them, then they're shoved forward and you kneel astride their thighs
            approach: ev.alive ? { x: ev.pos.x - fx * 0.7, z: ev.pos.z - fz * 0.7 } : this.standOff(wr.x, wr.z, 0.65),
            spot: ev.alive ? { x: ev.pos.x + fx * 0.75, z: ev.pos.z + fz * 0.75 } : null,
            face: ev.alive ? { x: ev.pos.x, z: ev.pos.z } : { x: wr.x, z: wr.z } });
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
          const near = G.Level.doorNear(map, this.pos.x, this.pos.z, 1.9);
          if (near && near.open && this.offAim(near.x, 1.1, near.z) < 0.6) { // (facing it, roughly)
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
        const ci = map.cabinets.findIndex((c) => Math.hypot(c.x - this.pos.x, c.z - this.pos.z) < 1.3);
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
              G.Net.toHost({ t: 'swap', give: w && !this.caseStow ? [w.def.code, G.loaded(w), G.Gear.handOver(this, w.def), w.ammo] : null });
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
  takeHits(hz, wdef, from, by) { // by: a teammate's name, when it's friendly fire
    if (hz && hz.length && G.R.particles) G.R.particles(new THREE.Vector3(this.pos.x, 1.2, this.pos.z), 4 + 2 * hz.length, 0x8a0a0a, 1.5, 1.2, 9, 0.6, null, true); // some of it lands at your feet
    if (this.down || this.dead || G.Game.phase !== 'level' || !hz || !hz.length) return;
    const d = from ? from.distanceTo(this.pos) : 0;
    const fall = d <= wdef.range ? 1 : Math.max(wdef.falloff, 1 - ((d - wdef.range) / (wdef.range * 1.5)) * (1 - wdef.falloff));
    const k = G.woundPower(wdef.dmg) * fall;
    let f = 0, killed = false, rang = false, fate = null;
    for (const [zone, central, side] of hz) {
      // the piece of kit that round meets: helmet, plate, or the carrier's soft armour (js/gear.js)
      const pc = G.Gear.piece(this, zone, true), st = G.armorStop(G.Gear.defOf(pc), zone, wdef, G.Gear.cond(pc)); // (a face shield's in the way of most face hits)
      if (st > 0) { rang = true; pc.dur = Math.max(0, pc.dur - G.armorWear(wdef)); }
      if ((zone === 'head' || zone === 'face') && st <= 0) { // the head, unprotected: on the body too, so it shows
        const h = this.body.parts.head; h.hp = 0; h.heavy = true;
        killed = zone === 'face' ? 'Shot in the face' : 'Shot in the head';
        continue;
      }
      // the part it lands on takes the wound (what armour stopped still bruises), and maybe an injury
      const w = zone === 'head' || zone === 'face' ? 1.1 * k : G.woundOf(zone, central, k), d = (w * (1 - st) + w * st * 0.1) * 100;
      f += d;
      const r = G.Med.hit(this.body, G.Med.partOf(zone, side), d, !!central, 1 - st, true);
      if (r === 'dead') fate = 'dead'; else if (r === 'down' && fate !== 'dead') fate = 'down';
    }
    if (rang) G.Audio.armorHit();
    if (killed || fate === 'dead') { this.killed(from, by ? `Friendly fire: ${by}` : killed || 'A head wound'); return; }
    this.hurt(f, from, fate === 'down');
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
    const frag = { cls: 'PST', pellets: 1, pen: 0 }, pc = G.Gear.piece(this, 'chest'), st = G.armorStop(G.Gear.defOf(pc), 'chest', frag, G.Gear.cond(pc));
    if (st > 0) { pc.dur = Math.max(0, pc.dur - 0.5); G.Audio.armorHit(); }
    // fragments: spread over the body, the legs and lower body most
    const total = d * (1 - st * 0.4);
    let fate = null;
    for (const [part, share] of [['legL', 0.25], ['legR', 0.25], ['stomach', 0.2], ['thorax', 0.15], ['armL', 0.075], ['armR', 0.075]]) {
      const r = G.Med.hit(this.body, part, total * share, false, 1, false);
      if (r === 'dead') fate = 'dead'; else if (r === 'down' && !fate) fate = 'down';
    }
    if (fate === 'dead') { this.killed(from, 'Killed by the blast'); return; }
    this.hurt(total, from, fate === 'down');
  },
  // the effect of being hit (the injuries are already on the body): flinch, the HUD, going down
  hurt(d, from, down) {
    if (!(d > 0)) return;
    this.hp = G.Med.overall(this.body);
    this.sinceHurt = 0;
    const fl = 0.035 * G.U.clamp(d / 30, 0.4, 1.5); // the hit throws your aim
    this.flinch.y += (Math.random() - 0.5) * 2 * fl; this.flinch.p += (Math.random() - 0.3) * fl;
    G.HUD.damage(from, d);
    G.Audio.hurt();
    if (down) this.goDown();
  },
  goDown() {
    this.hp = 0;
    this.down = true;
    this.crouch = false;
    this.bleed = 30;
    this.stats.downs++;
    this.reloading = false;
    if (this.slot !== 's' && this.weapons.s) { this.slot = 's'; G.R.setViewmodel(this.cur().def); }
    G.Audio.down();
    G.Net.toHost({ t: 'chat', m: '[is down and needs a revive!]' });
    if (G.Game.invOpen) G.Game.toggleInv(false);
  },
  revived(hp) {
    if (!this.down || G.Med.cantRevive(this.body)) return; // (not enough blood: still out)
    this.down = false;
    G.Med.revive(this.body);
    this.hp = G.Med.overall(this.body);
    this.sinceHurt = 0;
    G.Audio.revive();
    if (G.Med.bleeding(this.body)) G.HUD.toast('', 'Still bleeding: treat it (Tab)', 2.5);
  },
  // why you died when nobody reached you in time: what put you down
  downCause() {
    const b = this.body;
    if (!b) return 'Nobody reached you in time';
    if (b.parts.thorax.hp <= 0) return `Died of your chest wound${b.parts.thorax.lung ? ' (a punctured lung)' : ''}`;
    if (b.blood <= 15) return 'Bled out';
    return 'Nobody reached you in time';
  },
  die(how) {
    this.down = false;
    this.dead = true;
    this.hp = 0;
    this.deathCause = how || 'Bled out';
    G.R.setViewmodel(null);
    G.HUD.toast('KIA', this.deathCause, 3);
  },
  spectate() {
    const alive = [...G.Views.players.values()].filter((p) => p.st && !p.st.dd);
    const cam = G.R.camera;
    if (!alive.length) { cam.position.set(this.pos.x, 3.5, this.pos.z); cam.rotation.set(-1.2, this.yaw, 0); return; }
    const p = alive[this.specIdx % alive.length];
    this.spectating = p;
    cam.position.set(p.pos.x, p.pos.y + (p.st.dn ? 0.45 : p.st.cr ? 1.0 : 1.62), p.pos.z);
    cam.rotation.set(p.st.pt, p.st.yw, 0);
  },

  // ------------------------------------------------------------- camera + viewmodel
  updateCamera(dt) {
    const cam = G.R.camera, def = this.cur().def;
    // lean: Q left, E right. Never lean the head into a wall.
    const want = this.down || this.dead || this.lowReady || G.Game.chatOpen || !G.Game.locked ? 0 : (this.keys.KeyE ? 1 : 0) - (this.keys.KeyQ ? 1 : 0);
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
    let z = G.U.lerp(u.hip.z, u.ads.z, a) + this.kick * 0.045 + Math.max(0, this.rc.p) * 0.35;
    let rx = off.p - punch, ry = off.y - punchY, rz = -this.rc.y * 0.3;
    if (this.lowReady) { ry = 0.35; rx -= 0.6; x -= 0.04; y -= 0.07; } // muzzle down
    this.stowW = (this.stowW || 0) + ((this.stowed ? 1 : 0) - (this.stowW || 0)) * Math.min(1, dt * 9);
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
    if (an.bolt) { an.bolt.rotation.z = cyc * 1.3; an.bolt.position.z = Math.max(0, cyc - 0.4) * 0.12; }
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
    arm.visible = leg.visible = armL.visible = tie.visible = held.visible = env.visible = false;
    G.R.vmRoot.add(arm, leg, armL, tie, held, env);
    return (this._limbs = { arm, leg, armL, tie, held, env });
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
    if (ac.kind === 'bag') { const v = G.Views.evidence.get(ac.target); return v ? { p: new THREE.Vector3(v.x, 0.05, v.z), w: 1 - 0.7 * G.U.bagPhases(t).lift * (1 - G.U.bagPhases(t).down) } : null; }
    return null;
  },
  animateLimbs(cam) {
    const L = this.fpLimbs(), a = this.action, kind = a && a.kind, S = G.U.smooth;
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
      const floor = v ? cam.worldToLocal(new THREE.Vector3(v.x, 0.06, v.z)) : new THREE.Vector3(0.05, -0.5, -0.6);
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
      dn: this.down ? 1 : 0, dd: this.dead ? 1 : 0, bl: this.down ? Math.ceil(this.bleed) : 0, bd: this.body ? G.Med.encode(this.body) : null,
      w: this.cur().def.code, tl: this.tacFlags(this.cur()), cr: this.crouch || this.down ? 1 : 0, ln: r2(this.lean || 0), lr: this.lowReady ? 1 : 0, sd: this.steadying ? 1 : 0, sw: this.stowed ? 1 : 0,
      act: this.action && this.action.kind ? this.action.kind[0] : 0, ap: this.action ? r2(Math.min(1, this.action.t / this.action.dur)) : 0, zt: this.action && this.action.kind === 'zip' ? this.action.target : -1, bt: this.action && this.action.kind === 'bag' ? this.action.target : -1, pl: this.action && this.action.pull ? 1 : 0, mv: r2(this.hspeed || 0),
      cred: Math.round(this.credits), sx: [this.stats.kills, Math.round(this.stats.dmg), this.stats.hs, this.stats.downs, this.stats.revives],
      kt: this.kitLook(),
    };
  },
};
