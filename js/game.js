'use strict';
// Glue: menus, lobby, phase transitions, message dispatch, pointer lock, main loop.
G.Game = {
  phase: 'menu',
  map: null,
  level: 0,
  roster: {},
  extract: { active: false, votes: 0, need: 0, civDead: 0, voted: false }, // order restored; the vote to leave
  enemiesLeft: 0,
  chatOpen: false,
  locked: false,
  runStarted: false,

  init() {
    this.settings = { sens: G.U.store.get('sens', 1), fov: G.U.store.get('fov', 80), vol: G.U.store.get('vol', 0.6) };
    this.myName = G.U.store.get('name', 'Operator' + Math.floor(Math.random() * 90 + 10));
    G.U.store.set('name', this.myName); // (kept: the same name after a refresh, so the squad knows who's back)
    // your callsign: an animal (its emblem and colour mark you out to the squad; js/callsigns.js)
    this.myAnimal = G.U.store.get('animal', null);
    if (!G.Callsigns.valid(this.myAnimal)) this.myAnimal = G.Callsigns.LIST[Math.floor(Math.random() * G.Callsigns.LIST.length)].id;
    this.myColor = G.Callsigns.of(this.myAnimal).color;
    this.myLook = G.Rig.cleanLook(G.U.store.get('look', null)); // top, pants, eyewear, gloves (the menu)
    G.R.init();
    G.HUD.init();
    G.Me.bindInput();
    G.Shop.bind();
    G.Audio.vol = this.settings.vol;
    G.Audio.muted = new URLSearchParams(location.search).has('mute') || G.U.store.get('muted', false);
    this.bindMenu();
    G.Net.onServer = (m, from) => G.Server.handle(m, from);
    G.Net.onClient = (m) => this.onMsg(m);
    G.Net.onPeerLeave = (id) => G.Server.onLeave(id);
    // lost the host (they refreshed, or dropped): back to the menu, trying the same code again for a minute, so
    // as soon as they're hosting again you're back in
    G.Net.onHostLost = () => { const code = G.Net.code; this.toMenu('Lost connection to the host. Reconnecting...'); this.rejoin(code, Date.now() + 60000); };
    this.menuBackdrop();
    this.last = performance.now();
    this.serverLast = performance.now();
    requestAnimationFrame(() => this.loop());
    // keep the host simulation ticking even if its tab is in the background
    setInterval(() => { if (G.Net.isHost && performance.now() - this.last > 150) this.serverTick(); }, 50);
  },

  // ------------------------------------------------------------- menu UI
  $(id) { return document.getElementById(id); },
  screen(id) {
    for (const s of ['menu', 'lobby', 'shop', 'route', 'gameover', 'pause']) this.$(s).classList.toggle('hidden', s !== id);
    G.HUD.show(this.phase === 'level');
  },
  // ------------------------------------------------------------- your look (top, pants, eyewear, gloves)
  // the menu's options, a preview of you, and your own arms in first person
  bindLook() {
    const L = this.myLook, O = G.Rig.LOOKS, NAMES = { combat: 'Combat', longsleeve: 'Long-sleeve', tshirt: 'T-shirt', hoodie: 'Hoodie', cargo: 'Cargo', jeans: 'Jeans', none: 'None', glasses: 'Glasses', shooting: 'Shooting glasses', goggles: 'Goggles', tactical: 'Tactical', leather: 'Leather', fingerless: 'Fingerless' };
    const TOPC = [0x3a4048, 0x4d5639, 0x5a5240, 0x26282c, 0x2e3a52, 0x6a6e70, 0x7a2e2a, 0xb8b0a0], PANTC = [0x2e3238, 0x4d5639, 0x5a5240, 0x1f2226, 0x2b3550, 0x6b5b45, 0x3a3a3c];
    const sel = (k, label) => `<label>${label}<select data-look="${k}">${O[k].map((v) => `<option value="${v}"${L[k] === v ? ' selected' : ''}>${NAMES[v] || v}</option>`).join('')}</select></label>`;
    const sw = (k, cols) => `<div class="color-row look-row">${cols.map((c) => `<button class="sw${L[k] === c ? ' on' : ''}" data-lookc="${k}" data-c="${c}" style="background:${G.U.hex(c)}"></button>`).join('')}</div>`;
    this.$('lookBox').innerHTML = `<div class="look-grid"><div>${sel('top', 'Top')}${sw('topC', TOPC)}${sel('pants', 'Pants')}${sw('pantsC', PANTC)}${sel('eyes', 'Eyewear')}${sel('gloves', 'Gloves')}</div><canvas id="lookPreview" width="150" height="230"></canvas></div>`;
    const save = () => { G.U.store.set('look', this.myLook); this.lookPreview(); this.applyLook(); };
    this.$('lookBox').addEventListener('change', (e) => { const k = e.target.dataset.look; if (k) { this.myLook[k] = e.target.value; save(); } });
    this.$('lookBox').addEventListener('click', (e) => {
      const b = e.target.closest('[data-lookc]'); if (!b) return;
      this.myLook[b.dataset.lookc] = +b.dataset.c;
      b.parentElement.querySelectorAll('.sw').forEach((x) => x.classList.toggle('on', x === b));
      save();
    });
    this.lookPreview();
    this.applyLook();
  },
  // a small turning figure of you, dressed as picked
  lookPreview() {
    const cv = this.$('lookPreview');
    if (!cv) return;
    if (!this._lp) {
      const r = new THREE.WebGLRenderer({ canvas: cv, antialias: true, alpha: true });
      r.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
      const sc = new THREE.Scene(), cam = new THREE.PerspectiveCamera(30, cv.width / cv.height, 0.1, 20);
      cam.position.set(0, 1.1, 3.0); cam.lookAt(0, 0.92, 0);
      sc.add(new THREE.HemisphereLight(0xffffff, 0x404048, 1.1)); const dl = new THREE.DirectionalLight(0xffffff, 0.8); dl.position.set(1, 2, 2); sc.add(dl);
      this._lp = { r, sc, cam, rig: null, yaw: 0.5 };
      const spin = () => {
        if (!this._lp) return;
        const lp = this._lp;
        if (lp.rig && !document.getElementById('menu').classList.contains('hidden')) {
          lp.yaw += 0.008; // (turning all the way round: the name patch on the back too)
          lp.rig.update(1 / 60, { pos: new THREE.Vector3(0, 0, 0), yaw: Math.PI + lp.yaw, pitch: 0, crouch: false, alert: false });
          lp.r.render(lp.sc, lp.cam);
        }
        requestAnimationFrame(spin);
      };
      requestAnimationFrame(spin);
    }
    const lp = this._lp;
    if (lp.rig) lp.sc.remove(lp.rig.root);
    lp.rig = G.Rig.create({ style: 'tactical', color: this.myColor, animal: this.myAnimal, callName: this.myName, bare: true, seed: 977, look: this.myLook });
    lp.rig.setKit({ helmet: 0, carrier: 'c.patrol', plate: 1, cp: 3, belt: 'b.battle', bp: 2, ifak: 1 });
    lp.sc.add(lp.rig.root);
  },
  // your callsign (picked in the menu, or the host's pick for you when yours was taken)
  setAnimal(id, keep) {
    if (!G.Callsigns.valid(id) || id === this.myAnimal) return;
    this.myAnimal = id; this.myColor = G.Callsigns.of(id).color;
    if (keep) G.U.store.set('animal', id);
    if (this._lp && this._lp.rig) this.lookPreview(); // (the officer in the menu, in the new patches)
  },
  // your own arms in first person: sleeves in your top's colour (bare forearms in a T-shirt), your gloves
  applyLook() {
    const L = this.myLook, M = G.GunModels && G.GunModels.M;
    if (!M) return;
    const SKIN = 0xc89a78;
    M.fabric().color.setHex(L.top === 'tshirt' ? SKIN : L.topC);
    M.glove().color.setHex({ tactical: 0x1b1c1e, leather: 0x5e3e24, fingerless: 0x1b1c1e }[L.gloves] || SKIN);
  },
  bindMenu() {
    this.bindLook();
    this.$('routeMap').addEventListener('click', (e) => { const g = e.target.closest('[data-node]'); if (g) this.pickRoute(+g.dataset.node); });
    const name = this.$('nameInput');
    name.value = this.myName;
    name.addEventListener('input', () => { this.myName = name.value.trim().slice(0, 16) || 'Operator'; G.U.store.set('name', this.myName); if (this._lp && this._lp.rig) this._lp.rig.setCallsign(this.myAnimal, this.myName); });
    const row = this.$('colorRow');
    row.innerHTML = G.Callsigns.LIST.map((a) => `<button class="sw animal${a.id === this.myAnimal ? ' on' : ''}" data-a="${a.id}" title="${a.name}">${G.Callsigns.html(a.id)}<span style="color:${G.U.hex(a.color)}">${a.name}</span></button>`).join('');
    row.addEventListener('click', (e) => {
      const b = e.target.closest('.sw'); if (!b) return;
      this.setAnimal(b.dataset.a, true);
      row.querySelectorAll('.sw').forEach((x) => x.classList.toggle('on', x === b));
    });

    const bindRange = (ids, key, fmt, apply) => {
      ids.forEach((id) => {
        const el = this.$(id);
        el.value = this.settings[key];
        el.addEventListener('input', () => {
          this.settings[key] = +el.value; G.U.store.set(key, +el.value);
          ids.forEach((o) => { if (o !== id) this.$(o).value = el.value; });
          if (this.$(key + 'Val')) this.$(key + 'Val').textContent = fmt(+el.value);
          if (apply) apply(+el.value);
        });
      });
      if (this.$(key + 'Val')) this.$(key + 'Val').textContent = fmt(this.settings[key]);
    };
    bindRange(['sens', 'sens2'], 'sens', (v) => v.toFixed(2));
    bindRange(['fov', 'fov2'], 'fov', (v) => v + '°');
    bindRange(['vol', 'vol2'], 'vol', (v) => Math.round(v * 100) + '%', (v) => G.Audio.setVolume(v));

    const mute = this.$('mute');
    mute.checked = G.Audio.muted;
    mute.addEventListener('change', () => this.setMuted(mute.checked));
    this.$('btnHost').onclick = () => this.host();
    this.$('btnSolo').onclick = () => this.solo();
    this.$('btnJoin').onclick = () => this.join();
    this.$('joinCode').addEventListener('keydown', (e) => { if (e.key === 'Enter') this.join(); });
    this.$('joinCode').value = G.U.store.get('lastCode', ''); // (the last game you joined)
    this.$('btnLan').onclick = () => this.lanScan();
    // your own relay server, if you have one (used for every connection from now on: js/net.js opts)
    { const t = G.U.store.get('turn', {}) || {}, save = () => G.U.store.set('turn', { url: this.$('turnUrl').value.trim(), user: this.$('turnUser').value.trim(), pass: this.$('turnPass').value });
      this.$('turnUrl').value = t.url || ''; this.$('turnUser').value = t.user || ''; this.$('turnPass').value = t.pass || '';
      for (const id of ['turnUrl', 'turnUser', 'turnPass']) this.$(id).addEventListener('change', save); }
    // what a host's LAN beacon tells whoever's looking
    G.Net.lanInfo = () => ({ name: this.myName, players: G.Server.players.size, phase: this.phase });
    this.$('btnStart').onclick = () => { if (G.Net.isHost) G.Server.startRun(); };
    this.$('btnLeave').onclick = () => this.toMenu();
    this.$('btnNewCode').onclick = () => this.newCode();
    this.$('btnCopy').onclick = () => { navigator.clipboard && navigator.clipboard.writeText(G.Net.code || ''); this.$('btnCopy').textContent = 'Copied'; setTimeout(() => (this.$('btnCopy').textContent = 'Copy'), 1200); };
    this.$('btnResume').onclick = () => this.lock();
    this.$('btnQuit').onclick = () => this.toMenu();
    this.$('btnNewRun').onclick = () => { if (G.Net.isHost) G.Server.toLobby(); };
    this.$('btnMenu').onclick = () => this.toMenu();
    this.$('clickToPlay').onclick = () => this.lock();
    G.R.renderer.domElement.addEventListener('click', () => { if (this.phase === 'level' && !this.locked) this.lock(); });

    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === G.R.renderer.domElement;
      if (this.phase !== 'level') return;
      if (this.locked) { this.$('pause').classList.add('hidden'); this.$('clickToPlay').classList.add('hidden'); }
      else if (!this.chatOpen && !this.invOpen) { this.$('pause').classList.remove('hidden'); this.$('pauseCode').textContent = G.Net.code ? 'Room code: ' + G.Net.code : ''; }
    });

    window.addEventListener('keydown', (e) => {
      if (this.phase !== 'level') return;
      if (e.code === 'Tab') { e.preventDefault(); if (!this.chatOpen && !e.repeat) this.toggleInv(!this.invOpen); return; }
      if (e.code === 'Escape' && this.invOpen) { this.toggleInv(false); return; }
      if (e.code === 'KeyY' && !this.chatOpen && !e.repeat) this.vote();
      if (e.code === 'Enter') {
        const inp = this.$('chatInput');
        if (!this.chatOpen) { this.chatOpen = true; inp.classList.remove('hidden'); inp.value = ''; setTimeout(() => inp.focus(), 0); G.Me.keys = {}; }
        else {
          const t = inp.value.trim();
          if (t && !G.Net.solo) G.Net.toHost({ t: 'chat', m: t });
          else if (t) G.HUD.chat(this.myName, this.myColor, t);
          this.closeChat();
        }
      }
      if (e.code === 'Escape' && this.chatOpen) this.closeChat();
    });

  },
  setMuted(m) {
    G.Audio.setMuted(m);
    G.U.store.set('muted', m);
    this.$('mute').checked = m;
  },
  closeChat() {
    this.chatOpen = false;
    const inp = this.$('chatInput');
    inp.blur(); inp.classList.add('hidden');
    if (!this.locked && this.phase === 'level') this.lock();
  },
  // Y, once order's restored: vote to leave (again to take it back)
  vote() {
    if (!this.extract.active || G.Me.dead) { if (!this.extract.active) G.HUD.toast('', 'Bring order to chaos first: every suspect arrested or down', 1.6); return; }
    const v = !this.extract.voted;
    this.extract.voted = v;
    G.Net.toHost({ t: 'vote', v });
    G.Audio.click();
    G.HUD.toast('', v ? 'You voted to leave' : 'You took your vote back', 1.2);
  },
  // Tab in a level: your kit and health (and the scoreboard), the mouse freed to move things about. You stand
  // still while it's open; the level doesn't stop.
  toggleInv(open, opts) {
    if (!!open === !!this.invOpen) return;
    this.invOpen = !!open;
    this.$('fieldInv').classList.toggle('hidden', !open);
    if (open) {
      G.Me.keys = {}; G.Me.mouse.l = G.Me.mouse.r = false;
      this.$('fiScore').innerHTML = G.HUD.scoreboardHTML();
      G.InvUI.show(this.$('fiBody'), { field: true, patient: opts && opts.patient, cab: opts && opts.cab });
      this.$('pause').classList.add('hidden'); this.$('clickToPlay').classList.add('hidden');
      if (document.pointerLockElement) document.exitPointerLock();
    } else {
      G.InvUI.hide();
      if (this.phase !== 'level') return;
      this.lock();
      // if the browser wouldn't take the mouse back from a key press, a click will
      setTimeout(() => { if (!this.locked && !this.invOpen && this.phase === 'level') this.$('clickToPlay').classList.remove('hidden'); }, 300);
    }
  },
  lock() {
    G.Audio.init();
    const c = G.R.renderer.domElement;
    try {
      const p = c.requestPointerLock({ unadjustedMovement: true });
      if (p && p.catch) p.catch(() => { try { c.requestPointerLock(); } catch (e) { /* ignore */ } });
    } catch (e) { try { c.requestPointerLock(); } catch (e2) { /* ignore */ } }
  },
  msg(id, text, err) { const el = this.$(id); el.textContent = text; el.classList.toggle('err', !!err); },

  host() {
    G.Audio.init();
    this.msg('menuMsg', 'Contacting matchmaking server...');
    this.setBusy(true);
    G.Net.host((err, code) => {
      this.setBusy(false);
      if (err) { this.msg('menuMsg', err + ' — you can still Play Solo.', true); G.Net.leave(); return; }
      this.afterConnect();
    });
  },
  solo() {
    G.Audio.init();
    G.Net.hostSolo();
    this.afterConnect();
  },
  join() {
    const code = this.$('joinCode').value.trim().toUpperCase();
    G.U.store.set('lastCode', code);
    if (code.length < 4) { this.msg('menuMsg', 'Enter the room code from your host.', true); return; }
    G.Audio.init();
    this.msg('menuMsg', 'Connecting to ' + code + '...');
    this.setBusy(true);
    G.Net.join(code, (err) => {
      this.setBusy(false);
      if (err) { this.msg('menuMsg', err, true); G.Net.leave(); return; }
      this.afterConnect();
    });
  },
  // the host, in the lobby: start over under a fresh room code (the kept one's dropped; anyone already in the lobby
  // is dropped too and needs the new code)
  newCode() {
    if (!G.Net.isHost || G.Net.solo || this.phase !== 'lobby') return;
    try { sessionStorage.removeItem('bp_hostCode'); } catch (e) { /* storage unavailable */ }
    G.Net.leave();
    this.$('lobbyCode').textContent = '-----';
    G.Net.host((err) => {
      if (err) { this.toMenu(err); return; }
      this.afterConnect();
    });
  },
  // Look for games hosted on this network (js/net.js lanScan) and list them: click one to join it
  lanScan() {
    const list = this.$('lanList'), btn = this.$('btnLan');
    btn.disabled = true; btn.textContent = 'Looking...'; list.innerHTML = '';
    G.Net.lanScan().then((games) => {
      btn.disabled = false; btn.textContent = 'Find LAN games';
      if (games == null) { list.innerHTML = '<small class="dim">Could not tell which network you are on (offline, or WebRTC blocked).</small>'; return; }
      if (!games.length) { list.innerHTML = '<small class="dim">No games hosted on your network.</small>'; return; }
      const PH = { lobby: 'in the lobby', route: 'picking a route', level: 'mid-level', shop: 'in the shop' };
      list.innerHTML = games.map((g) => `<button class="btn small lan-game" data-code="${G.U.esc(g.code)}"><b>${G.U.esc(g.name)}</b> · ${g.players} in squad${PH[g.phase] ? ' · ' + PH[g.phase] : ''} <span class="dim">${G.U.esc(g.code)}</span></button>`).join('');
      list.querySelectorAll('[data-code]').forEach((b) => (b.onclick = () => { this.$('joinCode').value = b.dataset.code; this.join(); }));
    });
  },
  rejoin(code, until) {
    if (!code || this.phase !== 'menu' || G.Net.peer || Date.now() > until) { if (this.phase === 'menu' && !G.Net.peer && code) this.msg('menuMsg', 'Lost connection to the host.', true); return; }
    this.$('joinCode').value = code;
    G.Net.join(code, (err) => {
      if (!err) { this.afterConnect(); return; }
      G.Net.leave();
      if (this.phase === 'menu') { this.msg('menuMsg', 'Lost connection to the host. Reconnecting...'); setTimeout(() => this.rejoin(code, until), 3000); }
    });
  },
  setBusy(b) { ['btnHost', 'btnSolo', 'btnJoin'].forEach((id) => (this.$(id).disabled = b)); },
  afterConnect() {
    this.msg('menuMsg', '');
    if (G.Net.isHost) G.Server.reset();
    if (G.Net.isHost && !G.Net.solo) G.Net.startBeacon(); // (findable from the same network)
    G.Me.newRun();
    this.runStarted = false;
    G.Net.toHost({ t: 'hello', name: this.myName, animal: this.myAnimal, look: this.myLook });
  },
  toMenu(reason) {
    G.Net.leave();
    G.Server.reset();
    G.Views.clearAll();
    G.R.clearLevel();
    G.R.setViewmodel(null);
    this.map = null;
    this.phase = 'menu';
    if (document.pointerLockElement) document.exitPointerLock();
    this.screen('menu');
    this.menuBackdrop();
    this.msg('menuMsg', reason || '', !!reason);
  },
  // a slowly rotating level behind the main menu
  menuBackdrop() {
    this.map = G.Level.generate(1234, 3);
    G.R.setLevel(this.map);
    this.backdropT = 0;
  },

  // ------------------------------------------------------------- messages
  onMsg(m) {
    switch (m.t) {
      case 'welcome':
        this.roster = m.roster;
        if (this.roster[G.Net.myId]) this.setAnimal(this.roster[G.Net.myId].animal);
        G.Views.syncRoster(this.roster);
        if (m.route) this.setRoute(m.route);
        if (m.phase === 'route') this.enterRoute(m.level, m.route);
        else if (m.phase === 'level') {
          this.enterLevel(m.level, m.seed, m.th);
          if (m.doors) m.doors.forEach((o, i) => { if (this.map.doors[i]) this.map.doors[i].open = !!o; });
          if (m.evidence) m.evidence.forEach(([i, wpn, x, z, sec]) => { G.Views.addEvidence(i, wpn, x, z); if (sec) G.Views.secureEvidence(i); });
          if (m.bodies) m.bodies.forEach(([id, type, x, z, yaw, sec]) => G.Views.addBody(id, type, x, z, yaw, sec));
          this.setCase(m.wcase);
          this.cabs = m.cabs || []; G.Views.syncCabs();
          G.Loot.clear(); for (const a of m.loot || []) G.Loot.add(...a);
          for (const id of m.glass || []) G.Views.breakGlass(id); // windows already broken when we joined
        } else if (m.phase === 'shop') this.enterShop(m.level, m.shopSeed);
        else this.enterLobby();
        break;
      case 'roster': {
        // someone else just readied up: a chime and a line saying so
        const prev = this.roster || {};
        this.roster = m.roster;
        if (this.roster[G.Net.myId]) this.setAnimal(this.roster[G.Net.myId].animal); // (yours was taken: the host's pick)
        for (const [id, r] of Object.entries(this.roster)) if (id !== G.Net.myId && r.ready && prev[id] && !prev[id].ready) this.readyNote(r);
        G.Views.syncRoster(this.roster);
        if (this.phase === 'lobby') this.renderLobby();
        if (this.phase === 'shop') G.Shop.render();
        if (this.phase === 'route') this.renderRoute();
        break;
      }
      case 'rvotes': if (this.routeSt) { this.routeSt.votes = m.v || {}; if (this.phase === 'route') this.renderRoute(); } break;
      case 'newrun':
        this.tGrid = null;
        G.Me.newRun();
            break;
      case 'phase':
        if (m.route) this.setRoute(m.route);
        if (m.phase === 'route') this.enterRoute(m.level, m.route);
        else if (m.phase === 'level') { this.enterLevel(m.level, m.seed, m.th); this.setCase(m.wcase); this.cabs = m.cabs || []; G.Views.syncCabs(); }
        else if (m.phase === 'shop') this.enterShop(m.level, m.shopSeed, m.report);
        else if (m.phase === 'gameover') this.enterGameover(m);
        else if (m.phase === 'lobby') this.enterLobby();
        break;
      case 'snap': if (this.phase === 'level') G.Views.applySnap(m); break;
      // a first aid cabinet opened, emptied a bit, or put back into
      // things lying about: put down, picked up, and what you picked up
      case 'loot': if (this.phase === 'level') for (const a of m.a || []) G.Loot.add(...a); break;
      case 'lootRm': G.Loot.remove(m.id); break;
      case 'glass': if (this.phase === 'level') for (const id of m.ids || []) G.Views.breakGlass(id); break;
      case 'lootGot': G.Me.lootGot(m.item, m.x, m.z); break;
      case 'team': this.teamSet(m); break;
      case 'cab': {
        if (this.phase !== 'level' || !this.cabs) break;
        this.cabs[m.i] = m.c;
        this.cabGridSet(m.i, m.c);
        G.Views.syncCabs();
        if (m.by === G.Net.myId) G.Me.cabSettle(m.deny, m.ret);
        const took = Object.entries(m.took || {}).filter(([, n]) => n > 0);
        if (m.by && m.by !== G.Net.myId && took.length) G.HUD.feed(`<b>${G.U.esc(this.nameOf(m.by))}</b> took ${took.map(([mt, n]) => (n > 1 ? n + ' ' : '') + G.Med.ITEMS[mt].name.toLowerCase()).join(', ')} from a first aid cabinet`);
        if (G.InvUI.field && G.InvUI.cab === m.i) G.InvUI.render();
        break;
      }
      case 'wcase':
        this.setCase(m.c);
        if (m.by === G.Net.myId && m.got) G.Me.takeFromCase(m.got);
        else if (m.by) { const d = m.got && G.Gunsmith.fromCode(m.got[0]); if (d) G.HUD.feed(`<b>${G.U.esc(this.nameOf(m.by))}</b> took the ${d.name} from the weapon case`); }
        break;
      case 'eshot': if (this.phase === 'level') G.Views.enemyShot(m); break;
      case 'shot': if (this.phase === 'level' && m.id !== G.Net.myId) G.Views.remoteShot(m); break;
      case 'nade': if (this.phase === 'level' && m.id !== G.Net.myId) { G.Views.addNade(new THREE.Vector3(...m.p), new THREE.Vector3(...m.v), m.fuse, false, !!m.en); if (m.en) G.Views.enemyThrow(m.e); } break;
      case 'boom': this.onBoom(m); break;
      case 'kill': this.onKill(m); break;
      case 'ereload': if (this.phase === 'level') G.Views.enemyReload(m); break;
      case 'clear':
        G.Audio.extract();
        G.HUD.toast('ORDER RESTORED', 'Press Y to vote to leave', 3.5);
        break;
      case 'treat': if (m.tg === G.Net.myId && this.phase === 'level') G.Me.treated(m.part, m.mt, this.nameOf(m.by)); break;
      case 'revive': {
        if (m.tg === G.Net.myId) G.Me.revived(m.hp);
        const by = this.nameOf(m.by), tg = this.nameOf(m.tg);
        G.HUD.feed(`<b>${G.U.esc(by)}</b> revived <b>${G.U.esc(tg)}</b>`);
        break;
      }
      case 'chat': {
        const r = m.id ? this.roster[m.id] : null;
        if (r) G.HUD.chat(r.name, r.color, m.m); else G.HUD.chat(null, 0, m.m);
        if (this.phase === 'shop' || this.phase === 'lobby') this.lobbyChat(r ? r.name + ': ' + m.m : m.m);
        G.Audio.chat();
        break;
      }
      case 'ping': if (this.phase === 'level') G.Views.addPing(m.id, m.p); break;
      case 'ffhit': { // a teammate's rounds in you (or, seen from outside, in someone else)
        if (this.phase !== 'level') break;
        const def = G.Gunsmith.fromCode(m.w), f = new THREE.Vector3(m.f[0], m.f[1], m.f[2]);
        if (m.tg === G.Net.myId && def) { G.Me.takeHits(m.hz, def, f, this.nameOf(m.by)); G.HUD.toast('', `Friendly fire from ${G.U.esc(this.nameOf(m.by))}`, 1.6); }
        break;
      }
      case 'left': G.Views.removePlayer(m.id); break;
      case 'door': {
        const d = this.map && this.map.doors[m.i];
        if (!d || this.phase !== 'level') break;
        d.open = !!m.o;
        this.map.doorVer = (this.map.doorVer || 0) + 1; // echo paths change
        const dd = G.R.camera.position.distanceTo(new THREE.Vector3(d.x, 1.2, d.z));
        if (m.k) {
          G.Audio.kick(dd);
          const piv = this.map.doorMeshes && this.map.doorMeshes[m.i];
          if (piv) { piv.userData.ang = 0.75; piv.userData.rate = 16; } // slammed: most of the swing happens at once
        } else {
          const piv = this.map.doorMeshes && this.map.doorMeshes[m.i];
          if (piv) piv.userData.rate = d.open ? 2.6 : 5; // pushed open gently, pulled shut a bit quicker
        }
        if (!m.k) G.Audio.sampleAt(d.open ? 'door_open' : 'door_close', new THREE.Vector3(d.x, 1.1, d.z), 0.6, 1); // from the door
        break;
      }
      case 'order': if (m.id !== G.Net.myId) G.Audio.order(this.playerPos(m.id)); break;
      case 'shout': {
        if (m.id !== G.Net.myId) G.Audio.shout(this.playerPos(m.id));
        if (m.n > 0) G.HUD.feed(`<b>${G.U.esc(this.nameOf(m.id))}</b>: ${m.n} complying`);
        break;
      }
      case 'evid': if (this.phase === 'level') G.Views.addEvidence(m.i, m.wpn, m.x, m.z); break;
      case 'evtake': G.Views.removeEvidence(m.i); break;
      case 'evsec': {
        G.Views.secureEvidence(m.i); // weapon goes into an evidence envelope
        const w = G.WEAPONS[m.wpn];
        G.HUD.feed(`<b>${G.U.esc(this.nameOf(m.by))}</b> secured evidence: ${w ? w.name : 'weapon'}`);
        if (m.by === G.Net.myId) {
          const cr = m.cr;
          G.Me.credits += cr;
          G.HUD.feed(`<span class="cr">+¢${cr}</span>`);
          G.Audio.pickup();
        }
        break;
      }
      case 'cuffed': {
        const def = G.ENEMIES[m.ty];
        const ev = G.Views.enemies.get(m.e);
        if (m.body) {
          if (ev) { ev.bodySecured = true; ev.rig.zip(!m.civ); }
          G.HUD.feed(`<b>${G.U.esc(this.nameOf(m.by))}</b> ${m.civ ? 'reported a civilian casualty' : 'secured a body'}`);
          if (m.by === G.Net.myId && m.cr > 0) {
            const cr = m.cr;
            G.Me.credits += cr;
            G.HUD.feed(`<span class="cr">+¢${cr}</span>`);
            G.Audio.pickup();
          }
          break;
        }
        if (ev) { ev.rig.zip(true); ev.arrested = true; } // living arrests are zip-tied too
        G.HUD.feed(`<b>${G.U.esc(this.nameOf(m.by))}</b> ${m.civ ? 'secured a civilian' : 'arrested ' + (def ? def.name : 'a suspect')}`);
        if (m.by === G.Net.myId) {
          const cr = m.cr;
          G.Me.credits += cr;
          if (!m.civ) G.Me.stats.arrests = (G.Me.stats.arrests || 0) + 1;
          G.HUD.feed(`<span class="cr">+¢${cr}</span>`);
          G.Audio.pickup();
        }
        break;
      }
      case 'refund':
        G.Me.credits += m.amt;
        if (this.phase === 'shop') G.Shop.render();
        break;
    }
  },
  playerPos(id) {
    const pv = G.Views.players.get(id);
    return pv ? pv.pos.clone().setY(1.6) : null;
  },
  nameOf(id) { return id === G.Net.myId ? this.myName : this.roster[id] ? this.roster[id].name : '???'; },
  readyNote(r) {
    G.Audio.tone(660, 0.08, 'sine', 0.09); G.Audio.tone(990, 0.12, 'sine', 0.09, undefined, 0.09); // (a rising two-note chime)
    G.HUD.chat(null, 0, `${r.name} is ready`);
    this.lobbyChat(`${r.name} is ready`);
  },
  lobbyChat(text) {
    const el = this.phase === 'lobby' ? this.$('lobbyMsg') : this.$('vendorQuip');
    if (this.phase === 'lobby') el.textContent = text;
  },

  onBoom(m) {
    if (this.phase !== 'level') return;
    const p = new THREE.Vector3(m.p[0], m.p[1], m.p[2]);
    if (m.id !== G.Net.myId) { G.R.explosion(p, m.r); G.Audio.boom(G.R.camera.position.distanceTo(p)); }
    const Me = G.Me;
    if (!Me.pos || Me.down || Me.dead) return;
    const cy = Me.pos.y + 1.0, d = Math.hypot(Me.pos.x - p.x, cy - p.y, Me.pos.z - p.z);
    if (d < m.r && G.Level.los(this.map, p.x, p.y + 0.2, p.z, Me.pos.x, cy, Me.pos.z)) {
      Me.takeDamage(m.d * (1 - (d / m.r) * 0.6) * (m.en ? 1 : 0.4), p); // friendly blasts do 40%
    }
  },
  onKill(m) {
    if (this.phase !== 'level') return;
    G.Views.kill(m);
    const Me = G.Me, def = G.ENEMIES[m.ty];
    const killer = this.nameOf(m.by);
    const kc = m.by === G.Net.myId ? '#ffd24a' : this.roster[m.by] ? G.U.hex(this.roster[m.by].color) : '#fff';
    G.HUD.feed(`<b style="color:${kc}">${G.U.esc(killer)}</b> ${m.h ? '<span class="hs">⌖</span>' : '✕'} ${def ? def.name : 'hostile'}`);
    if (m.why) {
      // a civilian, or someone who had already surrendered: that costs whoever pulled the trigger
      G.HUD.feed(`<span class="bad">${m.why === 'civ' ? 'CIVILIAN KILLED' : 'UNAUTHORISED FORCE'}</span>`);
      if (m.by === G.Net.myId) {
        Me.credits = Math.max(0, Me.credits + m.cr);
        G.HUD.feed(`<span class="bad">-¢${-m.cr}</span>`);
        G.HUD.toast(m.why === 'civ' ? 'CIVILIAN KILLED' : 'UNAUTHORISED USE OF FORCE', `-¢${-m.cr}`, 2.5);
        G.Audio.deny();
      }
      return;
    }
    if (m.by === G.Net.myId) {
      const cr = m.cr;
      Me.credits += cr;
      Me.stats.kills++;
      if (m.h) Me.stats.hs++;
      G.HUD.feed(`<span class="cr">+¢${cr}</span>`);
    }
  },

  // ------------------------------------------------------------- phases
  enterLobby() {
    this.toggleInv(false);
    this.phase = 'lobby';
    if (document.pointerLockElement) document.exitPointerLock();
    G.Views.clearLevel();
    if (!this.map) this.menuBackdrop();
    this.screen('lobby');
    this.renderLobby();
  },
  renderLobby() {
    this.$('codeBlock').classList.toggle('hidden', !G.Net.code);
    this.$('lobbyCode').textContent = G.Net.code || '';
    let html = '';
    for (const [id, p] of Object.entries(this.roster)) {
      html += `<div class="lp">${G.Callsigns.html(p.animal)}<span style="color:${G.U.hex(p.color)}">${G.U.esc(p.name)}</span>${p.host ? ' <small>HOST</small>' : ''}${id === G.Net.myId ? ' <small>YOU</small>' : ''}</div>`;
    }
    this.$('lobbyPlayers').innerHTML = html;
    this.$('btnStart').classList.toggle('hidden', !G.Net.isHost);
    this.$('btnNewCode').classList.toggle('hidden', !G.Net.isHost || G.Net.solo); // (the host's: a fresh code)
    if (!G.Net.isHost) this.$('lobbyMsg').textContent = 'Waiting for the host to deploy...';
    else if (G.Net.solo) this.$('lobbyMsg').textContent = 'Solo run. Enemy count and health scale with squad size.';
    else this.$('lobbyMsg').textContent = 'Share the code. Friends can also join between levels.';
  },
  // the guns this level's suspects could be carrying (its gear tier and one either side)
  enemyGuns(level) {
    const t = G.gearTier(level), out = new Set();
    for (const pools of Object.values(G.ENEMY_GEAR.weapons)) for (let i = Math.max(1, t - 1); i <= Math.min(4, t + 1); i++) pools[i - 1].forEach((w) => out.add(w));
    return [...out];
  },
  // what's in the level's weapon case: { code, mag, reserve } or null when it's empty
  setCase(c) {
    this.wcase = c && c[0] ? { code: c[0], mag: c[1], reserve: c[2], am: c[4], kit: c[5] || null } : null;
    this.caseOpen = !!(c && c[3]);
    G.Views.syncCase();
  },
  // ------------------------------------------------------------- first aid cabinets
  // each cabinet's grid here (3x2, medical gear only), kept as the host has it: you move things in and out of
  // it in the field inventory, and the inventory tells the host what changed (G.InvUI)
  cabGrid(i) {
    this.cabGrids = this.cabGrids || [];
    if (!this.cabGrids[i]) { this.cabGrids[i] = G.Gear.grid(3, 2, ['med'], 'Cabinet'); this.cabGrids[i].cab = i; this.cabGridSet(i, this.cabs && this.cabs[i]); }
    return this.cabGrids[i];
  },
  cabLay(items) { return items.map((e) => e.join(':')).sort().join('|'); },
  cabGridSet(i, c) {
    const g = this.cabGrids && this.cabGrids[i];
    if (!g || !c) return;
    g.ver = c[2] || 0;
    const lay = this.cabLay(c[1]);
    if (lay === g.lay) return; // as you left it
    g.items = c[1].map(([mt, n, x, y, r]) => ({ it: G.Gear.medItem(mt, n), x, y, r }));
    g.lay = lay;
    g.counts = G.Server.cabCounts ? G.Server.cabCounts(c[1]) : null;
  },
  // ------------------------------------------------------------- the team locker
  // the squad's shared locker at the quartermaster's (G.Server.teamEdit), kept as the host has it. Its items
  // carry a tid (the host's name for them); you move things in and out in the stash, and teamSync tells the
  // host what changed. base: the tids the host has; gone: those you've taken out (and not had back yet);
  // sent: what you've put in that the host hasn't answered yet.
  teamGrid() {
    if (!this.tGrid) Object.assign((this.tGrid = G.Gear.grid(G.Server.TEAM_W, G.Server.TEAM_H, null, 'Team locker')), { locker: true, team: true, ver: 0, lay: '', base: new Set(), gone: new Set(), sent: new Set() });
    return this.tGrid;
  },
  teamLay(items) { return items.map((e) => e.slice(0, 4).join(':')).sort().join('|'); },
  teamSet(m) {
    const g = this.teamGrid(), me = G.Me;
    if (!this.teamBusy) this.teamSync(); // (anything you've moved that the host hasn't heard about yet goes first)
    g.ver = m.ver;
    g.base = new Set(m.items.map((e) => e[0]));
    for (const tid of g.gone) if (!g.base.has(tid)) g.gone.delete(tid);
    for (const tid of g.sent) if (g.base.has(tid)) g.sent.delete(tid);
    const lay = this.teamLay(m.items);
    if (lay !== g.lay) { g.items = m.items.map(([tid, x, y, r, pk]) => ({ it: Object.assign(G.Gear.unpack(pk), { tid }), x, y, r })); g.lay = lay; }
    if (m.by === G.Net.myId) {
      // taken by someone else first: it was never yours; and what didn't fit comes back to your locker
      for (const tid of m.deny || []) G.InvUI.lose(tid);
      for (const pk of m.ret || []) G.Gear.place([me.locker, ...G.Gear.body(me)], G.Gear.unpack(pk));
      if ((m.deny || []).length) G.HUD.toast('', 'Someone took that from the team locker first', 1.8);
      if ((m.ret || []).length) G.HUD.toast('', 'The team locker filled up: it went back to your locker', 1.8);
    }
    if (this.phase === 'shop') G.InvUI.refresh();
  },
  // after a change in the stash: how you left the team locker, to the host
  teamSync() {
    const g = this.tGrid;
    if (!g || this.phase !== 'shop') return;
    const keep = [], put = [], here = new Set();
    for (const p of g.items) {
      const r = p.r ? 1 : 0;
      const tid = p.it.tid;
      if (tid && (g.base.has(tid) || g.sent.has(tid)) && !g.gone.has(tid) && !here.has(tid)) { keep.push([tid, p.x, p.y, r]); here.add(tid); }
      else { p.it.tid = `${G.Net.myId}.${(this.tidN = (this.tidN || 0) + 1)}`; g.sent.add(p.it.tid); here.add(p.it.tid); put.push([p.it.tid, p.x, p.y, r, G.Gear.pack(p.it)]); }
    }
    const lay = this.teamLay([...keep, ...put]);
    if (lay === g.lay) return;
    const take = [...g.base].filter((tid) => !here.has(tid) && !g.gone.has(tid));
    for (const tid of take) g.gone.add(tid);
    g.lay = lay; // (before sending: the host's own answer comes straight back)
    this.teamBusy = true;
    try { G.Net.toHost({ t: 'teamEdit', ver: g.ver, take, keep: keep.filter((e) => g.base.has(e[0])), put }); } finally { this.teamBusy = false; }
  },
  // ------------------------------------------------------------- the route map
  // the host's route: { seed, act, path, votes }, with the act's map rebuilt from its seed
  setRoute(r) {
    if (!r) return;
    if (!this.routeMap || this.routeMap.seed !== r.seed || this.routeMap.act !== r.act) this.routeMap = G.Route.gen(r.seed, r.act);
    this.routeSt = { path: r.path || [], votes: r.votes || {} };
  },
  enterRoute(level) {
    this.toggleInv(false);
    this.phase = 'route';
    this.level = level;
    if (document.pointerLockElement) document.exitPointerLock();
    this.$('clickToPlay').classList.add('hidden');
    G.Views.clearLevel();
    if (!this.map) this.menuBackdrop();
    this.screen('route');
    this.renderRoute();
  },
  renderRoute() {
    const rm = this.routeMap, st = this.routeSt;
    if (!rm || !st) return;
    const opts = G.Route.options(rm, st.path[st.path.length - 1]), colors = {};
    for (const [id, p] of Object.entries(this.roster || {})) colors[id] = p.color;
    const mine = st.votes[G.Net.myId];
    const box = this.$('routeMap'), first = !box.firstChild;
    box.innerHTML = G.Route.svg(rm, { path: st.path, opts, votes: st.votes, colors, mine });
    // the map is wider than the screen: bring where you are (and what's next) into view, and let the wheel scroll it
    const at = box.querySelector('.rn.here') || box.querySelector('.rn.opt');
    if (at && (first || !box.dataset.col || +box.dataset.col !== st.path.length)) {
      box.dataset.col = st.path.length;
      const r = at.getBoundingClientRect(), b = box.getBoundingClientRect();
      box.scrollLeft += r.left + r.width / 2 - (b.left + b.width * 0.35);
    }
    if (!box.dataset.wheel) { box.dataset.wheel = 1; box.addEventListener('wheel', (e) => { if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) { box.scrollLeft += e.deltaY; e.preventDefault(); } }, { passive: false }); }
    const boss = opts.length === 1 && rm.nodes.get(opts[0]).boss;
    this.$('routeTitle').innerHTML = `Act ${rm.act} <span>— level ${this.level}${boss ? ' <b class="red">(BOSS)</b>' : ''}</span>`;
    const ids = Object.keys(this.roster || {}), voted = ids.filter((id) => st.votes[id] != null).length;
    this.$('routeMsg').innerHTML = mine == null ? (boss ? 'The Kingpin is waiting. Click the node to go in.' : !st.path.length ? `The way in: ${G.U.esc(G.THEMES[rm.nodes.get(opts[0]).th].name)}. Click it to deploy; the routes split after it.` : 'Pick where to deploy next: click one of the lit nodes. Each path decides the environments ahead.')
      : ids.length > 1 ? `Voted. Waiting for the squad (${voted}/${ids.length}); most votes wins, ties are a coin toss.` : 'Deploying...';
  },
  pickRoute(n) {
    if (this.phase !== 'route' || !this.routeMap || !G.Route.options(this.routeMap, this.routeSt.path[this.routeSt.path.length - 1]).includes(n)) return;
    G.Audio.click();
    G.Net.toHost({ t: 'pick', n });
  },
  enterLevel(level, seed, th) {
    this.phase = 'level';
    if (G.Me.navRearm) G.Me.navRearm(); // (the mouse's side buttons: see Me.navTrap)
    this.level = level;
    this.extract = { active: false, votes: 0, need: 0, civDead: 0, voted: false };
    this.enemiesLeft = 0;
    this.map = G.Level.generate(seed, level, th);
    G.Views.warmed = false; // compile the new level's shaders once it's populated (G.R.warmup)
    this.cabGrids = [];
    G.Loot.clear();
    G.R.setLevel(this.map);
    G.Views.clearLevel();
    G.HUD.buildMinimap(this.map);
    const team = [...G.Views.players.values()].map((p) => p.st && p.st.w && G.Gunsmith.fromCode(p.st.w)).filter(Boolean).map((d) => d.soundKey);
    G.GunAudio.prewarm([...Object.values(G.Me.weapons).map((w) => w.def.soundKey), ...this.enemyGuns(level), ...team], this.map);
    // spread the squad out in the spawn room
    const ids = Object.keys(this.roster).sort();
    const i = Math.max(0, ids.indexOf(G.Net.myId));
    const sp = this.map.spawn;
    G.Me.spawn(sp.x + ((i % 3) - 1) * 1.3, sp.z + (Math.floor(i / 3) - 0.5) * 1.3);
    this.screen(null);
    G.HUD.show(true);
    G.HUD.toast(`LEVEL ${level}`, this.map.theme.name + (G.Route.isBoss(level) ? ' — <b class="red">THE WARDEN AWAITS</b>' : ''), 3.5);
    if (G.Route.isBoss(level)) G.Audio.alarm();
    if (!this.locked) this.$('clickToPlay').classList.remove('hidden');
  },
  enterShop(level, seed, report) {
    this.toggleInv(false);
    this.phase = 'shop';
    G.Shop.report = report || null;
    if (document.pointerLockElement) document.exitPointerLock();
    this.$('clickToPlay').classList.add('hidden');
    if (G.Me.pos) {
      const clean = report && report.civKilled === 0 && report.unauth === 0;
      const bonus = Math.round((250 + 75 * level + (clean ? 200 : 0) + (report && report.allRescued ? 150 + 50 * level : 0)));
      G.Me.credits += bonus;
      this.lastBonus = bonus;
    }
    G.Views.clearLevel();
    G.Me.dead = false; G.Me.down = false;
    G.Shop.open(level, seed);
    this.screen('shop');
    if (this.lastBonus) G.HUD.chat(null, 0, `Mission bonus: +¢${this.lastBonus}`);
  },
  enterGameover(m) {
    this.toggleInv(false);
    this.phase = 'gameover';
    if (document.pointerLockElement) document.exitPointerLock();
    this.$('clickToPlay').classList.add('hidden');
    this.screen('gameover');
    this.$('goSub').textContent = `Your squad fell on level ${m.level}.`;
    let html = '<table><tr><th>Operator</th><th>Kills</th><th>Headshots</th><th>Damage</th><th>Downs</th><th>Revives</th></tr>';
    for (const [, s] of Object.entries(m.stats || {})) {
      const sx = s.sx || [0, 0, 0, 0, 0];
      html += `<tr><td style="color:${G.U.hex(s.color)}">${G.Callsigns.html(s.animal)}${G.U.esc(s.name)}</td><td>${sx[0]}</td><td>${sx[2]}</td><td>${G.U.fmt(sx[1])}</td><td>${sx[3]}</td><td>${sx[4]}</td></tr>`;
    }
    this.$('goStats').innerHTML = html + '</table>';
    this.$('btnNewRun').classList.toggle('hidden', !G.Net.isHost);
    this.$('goMsg').textContent = G.Net.isHost ? '' : 'Waiting for the host to start a new run...';
  },

  // ------------------------------------------------------------- loop
  serverTick() {
    const now = performance.now();
    const dt = Math.min((now - this.serverLast) / 1000, 0.1);
    this.serverLast = now;
    if (G.Net.isHost) G.Server.update(dt);
  },
  loop() {
    requestAnimationFrame(() => this.loop());
    const now = performance.now();
    const dt = Math.min((now - this.last) / 1000, 0.05);
    this.last = now;
    this.serverTick();
    if (this.phase === 'level') {
      if (this.invOpen) G.InvUI.update(dt);
      if (this.invOpen && (this.invT = (this.invT || 0) + dt) > 0.25) { this.invT = 0; G.InvUI.tick(); this.$('fiScore').innerHTML = G.HUD.scoreboardHTML(); }
      G.Me.update(dt);
      G.GunAudio.updateListener(G.R.camera);
      G.Views.update(dt);
      G.Me.flushHits();
      this.updateZone();
      this.updateDoors(dt);
    } else if (this.map) {
      // menu / shop backdrop camera
      this.backdropT = (this.backdropT || 0) + dt * 0.08;
      const c = G.R.camera, m = this.map, cx = m.spawn.x, cz = m.spawn.z;
      c.position.set(cx + Math.sin(this.backdropT) * 6, 2.2, cz + Math.cos(this.backdropT) * 6);
      c.rotation.set(-0.1, this.backdropT + Math.PI, 0);
      if (c.fov !== 75) { c.fov = 75; c.updateProjectionMatrix(); }
    }
    G.R.update(dt);
    G.HUD.update(dt);
    G.R.render();
  },
  // swing door leaves toward their open/closed state
  updateDoors(dt) {
    const m = this.map;
    if (!m || !m.doorMeshes) return;
    m.doors.forEach((d, i) => {
      const piv = m.doorMeshes[i], u = piv.userData;
      u.ang += ((d.open ? 1 : 0) - u.ang) * Math.min(1, dt * (u.rate || 7));
      piv.rotation.y = u.base + u.ang * Math.PI / 2 * 0.95 * (u.sign || 1);
    });
  },
  updateZone() { /* no exit zone: the squad votes to leave (Y) once order's restored */ },
};

window.addEventListener('load', () => G.Game.init());
