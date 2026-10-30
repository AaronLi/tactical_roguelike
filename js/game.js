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
    G.Stickers.load(); // (which stickers there are: js/stickers.js)
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
    // a highlights recording (a .zip the hangar's TVs saved) made into a video, here (js/highlights.js renderPack)
    this.$('btnRender').onclick = () => this.$('hlFile').click();
    this.$('hlFile').onchange = (e) => { const f = e.target.files && e.target.files[0]; e.target.value = ''; if (f) this.renderHighlights(f); };
    this.$('btnRenderStop').onclick = () => G.Highlights.cancelRender();
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
    this.$('btnProf').onclick = () => { G.Prof.save(); this.$('profLine').textContent = 'Saved: ' + G.Prof.line(); };
    this.$('btnNewRun').onclick = () => { if (G.Net.isHost) G.Server.toLobby(); };
    this.$('btnMenu').onclick = () => this.toMenu();
    this.$('clickToPlay').onclick = () => this.lock();
    G.R.renderer.domElement.addEventListener('click', () => { if (this.phase === 'level' && !this.locked) this.lock(); });

    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === G.R.renderer.domElement;
      if (this.phase !== 'level') return;
      if (this.locked) { this.$('pause').classList.add('hidden'); this.$('clickToPlay').classList.add('hidden'); }
      else if (!this.chatOpen && !this.invOpen && !this.shopOpen && !this.aboxOpen) { this.$('pause').classList.remove('hidden'); this.$('pauseCode').textContent = G.Net.code ? 'Room code: ' + G.Net.code : ''; if (G.Prof) this.$('profLine').textContent = G.Prof.line(); }
    });

    window.addEventListener('keydown', (e) => {
      if (this.phase !== 'level') return;
      // in the hangar: Esc puts a shop panel away, and Tab is your stash and loadout (the panel's Kit tab), not the field kit
      if (this.hub) {
        if (e.code === 'Escape' && this.shopOpen) { this.closeShop(); return; }
        if (e.code === 'Tab') { e.preventDefault(); if (!this.chatOpen && !e.repeat) { if (this.shopOpen) this.closeShop(); else if (G.Me.seat == null) this.openShop('kit', 'your stash and loadout'); } return; }
      }
      if (e.code === 'Tab') { e.preventDefault(); if (!this.chatOpen && !e.repeat && !(G.Me.out && !this.invOpen)) this.toggleInv(!this.invOpen); return; } // (out cold: nothing to do but wait)
      if (e.code === 'Escape' && this.invOpen) { this.toggleInv(false); return; }
      if (e.code === 'Escape' && this.aboxOpen) { this.aboxHide(); return; }
      if (e.code === 'KeyY' && !this.chatOpen && !e.repeat && !this.hub) this.vote();
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
  // A shop panel (the same ones a menu would show: the stock, the gunsmith, your stash and loadout, supplies), opened
  // from a point of sale in the hangar. The world carries on behind it; you stand where you are.
  openShop(tab, title) {
    if (!this.hub || this.shopOpen) return;
    this.shopOpen = true;
    G.Me.keys = {}; G.Me.mouse.l = G.Me.mouse.r = false;
    G.Shop.tab = tab || 'stock'; G.Shop.title = title || null;
    this.$('pause').classList.add('hidden'); this.$('clickToPlay').classList.add('hidden');
    if (document.pointerLockElement) document.exitPointerLock();
    this.screen('shop');
    G.Shop.render();
    G.HUD.setPrompt('');
  },
  closeShop() {
    if (!this.shopOpen) return;
    this.shopOpen = false;
    G.GunsmithUI.hide(); G.InvUI.hide();
    this.screen(null);
    G.HUD.show(true);
    G.Hangar.refresh();
    this.lock();
    setTimeout(() => { if (!this.locked && !this.shopOpen && this.phase === 'level') this.$('clickToPlay').classList.remove('hidden'); }, 300);
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
  async renderHighlights(file) {
    const msg = this.$('hlMsg'), btn = this.$('btnRender'), stop = this.$('btnRenderStop'), bar = this.$('hlBar'), prog = bar.parentElement;
    btn.disabled = true; stop.classList.remove('hidden'); prog.classList.remove('hidden'); bar.style.width = '0%'; msg.classList.remove('bad');
    try {
      await G.Highlights.renderPack(file, (t, p) => { msg.textContent = t; if (p != null) bar.style.width = Math.round(p * 100) + '%'; });
    } catch (e) {
      const why = (e && e.message) || String(e);
      msg.textContent = why === 'cancelled' ? 'Cancelled' : 'The video couldn\'t be made: ' + why; msg.classList.toggle('bad', why !== 'cancelled');
      if (why !== 'cancelled') console.warn('highlights: rendering failed', e);
    }
    btn.disabled = false; stop.classList.add('hidden'); prog.classList.add('hidden');
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
    this.leaveHub();
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
        G.Stickers.joined(m.skins); // (the stickers on the squad's guns: js/stickers.js)
        this.roster = m.roster;
        if (this.roster[G.Net.myId]) this.setAnimal(this.roster[G.Net.myId].animal);
        G.Views.syncRoster(this.roster);
        if (m.route) this.setRoute(m.route);
        if (m.phase === 'route') this.enterRoute(m.level, m.route);
        else if (m.phase === 'level') {
          this.enterLevel(m.level, m.seed, m.th);
          if (m.doors) m.doors.forEach((o, i) => { const d = this.map.doors[i]; if (d && d.open !== !!o) { d.open = !!o; G.World.door(this.map.world, this.map, d); } });
          if (m.holes) for (const h of m.holes) G.Damage.apply(this.map, h); // (what's been shot out of the place)
          if (m.fallen) for (const [i, ang, dir, seed] of m.fallen) G.Damage.fall(this.map, this.map.doors[i], ang, dir, seed, true);
          if (m.evidence) m.evidence.forEach(([i, wpn, x, z, sec, y]) => { G.Views.addEvidence(i, wpn, x, z, y); if (sec) G.Views.secureEvidence(i); });
          if (m.bodies) m.bodies.forEach(([id, type, x, z, yaw, sec, y]) => G.Views.addBody(id, type, x, z, yaw, sec, y));
          this.setCase(m.wcase); this.abox = m.abox || null; this.sbox = m.sbox || null;
          this.cabs = m.cabs || []; G.Views.syncCabs();
          G.Loot.clear(); for (const a of m.loot || []) G.Loot.add(...a);
          for (const id of m.glass || []) G.Views.breakGlass(id); // windows already broken when we joined
          for (const [id, p] of m.cracked || []) G.Views.crackGlass(id, new THREE.Vector3(...p));
        } else if (m.phase === 'shop') this.enterShop(m.level, m.shopSeed, null, m.stock);
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
        if (this.hub) { G.Shop.render(); G.Hangar.refresh(); }
        if (this.phase === 'route') this.renderRoute();
        break;
      }
      case 'arms': this.arms = m.a || {}; if (this.phase === 'route') { this.sidearmPick(); this.renderRoute(); } break;
      case 'rvotes': if (this.routeSt) { this.routeSt.votes = m.v || {}; if (this.phase === 'route') this.renderRoute(); } break;
      case 'newrun':
        this.tGrid = null; this.arms = {}; this.armSel = null;
        G.Me.newRun();
            break;
      case 'phase':
        if (m.route) this.setRoute(m.route);
        if (m.phase === 'route') this.enterRoute(m.level, m.route);
        else if (m.phase === 'level') { this.aboxHide(); this.enterLevel(m.level, m.seed, m.th); this.setCase(m.wcase); this.abox = m.abox || null; this.sbox = m.sbox || null; this.cabs = m.cabs || []; G.Views.syncCabs(); }
        else if (m.phase === 'shop') this.enterShop(m.level, m.shopSeed, m.report, m.stock);
        else if (m.phase === 'gameover') this.enterGameover(m);
        else if (m.phase === 'lobby') this.enterLobby();
        break;
      case 'snap': if (this.phase === 'level') G.Views.applySnap(m); break;
      case 'rfx': if (this.phase === 'level') G.Views.roundFx(m.a); break;
      case 'hole': if (this.phase === 'level') for (const h of m.a || []) G.Damage.apply(this.map, h); break;
      case 'dpart': if (this.phase === 'level' && this.map.doors[m.i]) G.Damage.partGone(this.map, this.map.doors[m.i], m.pt); break;
      case 'dfall': { // (shot off its hinges)
        const d = this.map && this.phase === 'level' ? this.map.doors[m.i] : null;
        if (!d) break;
        if (G.Highlights) G.Highlights.door(m.i, 1, 0, m.f);
        G.Damage.fall(this.map, d, ...m.f);
        break;
      }
      case 'rpath': for (const [i, path] of m.ps || []) { const s = G.Highlights && G.Highlights.roundPath(m.k, m.sid, i, path), def = s && (G.WEAPONS[s.code] || G.Gunsmith.fromCode(s.code)); if (G.ShotLog) G.ShotLog.keep(path, { holder: G.ShotLog.remote(m.k, m.sid), name: def ? def.name : '' }); } break;
      case 'skin': G.Stickers.learn(m.h, m.l); break; // (a gun's stickers, by their hash: js/stickers.js)
      // a first aid cabinet opened, emptied a bit, or put back into
      // things lying about: put down, picked up, and what you picked up
      case 'loot': if (this.phase === 'level') for (const a of m.a || []) G.Loot.add(...a); break;
      case 'lootRm': G.Loot.remove(m.id); break;
      case 'glass': if (this.phase === 'level') for (const id of m.ids || []) G.Views.breakGlass(id); break;
      case 'crack': if (this.phase === 'level') G.Views.crackGlass(m.id, new THREE.Vector3(...m.p)); break;
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
      // the sticker box opened: the sticker's whoever's opened it (yours: into your collection, js/stickers.js)
      case 'sbox': {
        const had = this.sbox && this.sbox[1];
        this.sbox = m.s || null;
        const [name, by] = this.sbox || [];
        if (!name || !by || had) break;
        const nice = G.U.esc(name.replace(/\.[a-z0-9]+$/i, '').replace(/[-_]+/g, ' '));
        if (by === G.Net.myId) { G.Stickers.give(name); G.Audio.pickup(); G.HUD.toast('STICKER', `<img class="stk-toast" src="${G.Stickers.url(name)}"> Found a sticker: <b>${nice}</b> <small>(stick it on a gun in the gunsmith)</small>`, 3.5); }
        else G.HUD.feed(`<b>${G.U.esc(this.nameOf(by))}</b> found a sticker: ${nice}`);
        break;
      }
      case 'abox': {
        this.abox = m.a;
        if (m.opened === G.Net.myId) this.aboxShow(true); // (opened it: its wheels spin)
        if (m.by && m.got) {
          if (m.by === G.Net.myId) { this.aboxHide(); G.Me.takeAttachment(m.got, m.fit); }
          else { const pt = G.Gunsmith.PARTS[m.got]; if (pt) G.HUD.feed(`<b>${G.U.esc(this.nameOf(m.by))}</b> took the ${G.U.esc(pt.name)} from the attachments box`); }
        }
        break;
      }
      case 'wcase':
        this.setCase(m.c);
        if (m.opened === G.Net.myId) this.caseShow(true); // (opened it: its wheel spins)
        else if (this.aboxOpen && this.caseUI && this.caseUI.on) this.caseRender();
        if (m.by === G.Net.myId && m.got) G.Me.takeFromCase(m.got);
        else if (m.by) { const d = m.got && G.Gunsmith.fromCode(m.got[0]); if (d) G.HUD.feed(`<b>${G.U.esc(this.nameOf(m.by))}</b> took the ${d.name} from the weapon case`); }
        break;
      case 'eshot': if (this.phase === 'level') G.Views.enemyShot(m); break;
      case 'shot': if (this.phase === 'level' && m.id !== G.Net.myId) G.Views.remoteShot(m); break;
      case 'nade': if (this.phase === 'level' && m.id !== G.Net.myId) { G.Views.addNade(new THREE.Vector3(...m.p), new THREE.Vector3(...m.v), m.fuse, false, !!m.en, m.k || 'frag'); const tp = !m.en && G.Views.players.get(m.id); if (tp) tp.rig.throwNade(m.s == null ? 2 : m.s); /* (their arm throws it) */ if (m.en) G.Views.enemyThrow(m.e); } break;
      case 'boom': this.onBoom(m); break;
      case 'course': if (G.Course) G.Course.setCourse(m.seed); break;
      case 'crun': if (G.Course && m.s) G.Course.remoteRun(Object.assign({}, m.s, { who: m.by || m.s.who })); break;
      case 'flash': this.onFlash(m); break;
      case 'kill': this.onKill(m); break;
      case 'incap': this.onIncap(m); break; // (a suspect down for good: counted as one incapacitated)
      case 'edown': if (G.Highlights) G.Highlights.suspectDown(m); break; // (a suspect down for good: js/highlights.js)
      case 'saved': if (G.Highlights) G.Highlights.saved(m); break; // (an officer's armour stopped rounds: js/highlights.js)
      case 'stock': G.Shop.setStock(m.s); break; // (the store's shared stock: js/shop.js)
      case 'took': G.Shop.took(m.q, m.ok); break;
      case 'ereload': if (this.phase === 'level') G.Views.enemyReload(m); break;
      case 'clear':
        G.Audio.extract();
        G.HUD.toast('ORDER RESTORED', 'Press Y to vote to leave', 3.5);
        break;
      case 'treat': if (m.tg === G.Net.myId && this.phase === 'level') G.Me.treated(m.part, m.mt, this.nameOf(m.by), m.by, !!m.th); break;
      case 'applying': if (this.phase === 'level') G.Me.beingTreated(m.by, this.nameOf(m.by), m.part, m.mt, m.dur, !!m.off); break;
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
        const f = new THREE.Vector3(m.f[0], m.f[1], m.f[2]);
        if (m.e && G.Highlights) G.Highlights.hitBy(m.tg, m.e);
        if (m.tg === G.Net.myId) { G.Me.applyWounds(m, f, !m.e); if (!m.e) G.HUD.toast('', 'Friendly fire', 1.6); } // (you're told it was friendly, not whose)
        else if (m.by !== G.Net.myId && m.at) G.R.impact(new THREE.Vector3(...m.at), null, 'blood');
        break;
      }
      case 'left': G.Views.removePlayer(m.id); break;
      case 'door': {
        const d = this.map && this.map.doors[m.i];
        if (!d || this.phase !== 'level') break;
        d.open = !!m.o;
        if (G.Highlights) G.Highlights.door(m.i, m.o, m.k);
        G.World.door(this.map.world, this.map, d);
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
      case 'evid': if (this.phase === 'level') G.Views.addEvidence(m.i, m.wpn, m.x, m.z, m.y); break;
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
        if (G.Highlights && !m.civ) G.Highlights.arrest(m); // (a clip for the highlights: nobody got hurt)
        // (one cuffed where they lay, down: already counted, incapacitated; securing them pays like securing a body)
        G.HUD.feed(`<b>${G.U.esc(this.nameOf(m.by))}</b> ${m.civ ? 'secured a civilian' : (m.dn ? 'secured ' : 'arrested ') + (def ? def.name : 'a suspect')}`);
        if (m.by === G.Net.myId) {
          const cr = m.cr;
          G.Me.credits += cr;
          if (!m.civ && !m.dn) G.Me.stats.arrests = (G.Me.stats.arrests || 0) + 1;
          G.HUD.feed(`<span class="cr">+¢${cr}</span>`);
          G.Audio.pickup();
        }
        break;
      }
      case 'refund':
        G.Me.credits += m.amt;
        if (this.hub) G.Shop.render();
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
  // A flashbang went off (the host's word: everyone hears and sees it). On you: blinded by how close it was, and
  // how squarely you were looking at it (with it out of sight, not at all); deafened by how close, wall or no wall.
  onFlash(m) {
    if (this.phase !== 'level' || !Array.isArray(m.p)) return;
    const p = new THREE.Vector3(m.p[0], m.p[1], m.p[2]), cam = G.R.camera, eye = cam.position, d = eye.distanceTo(p);
    G.R.flashAt(p);
    G.Audio.flashbang(d);
    const Me = G.Me;
    if (!Me.pos || Me.dead) return;
    const seen = G.Level.los(this.map, p.x, p.y, p.z, eye.x, eye.y, eye.z);
    const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(cam.quaternion), to = p.clone().sub(eye).normalize(), look = fwd.dot(to);
    const near = G.U.clamp(1 - d / 16, 0, 1), blind = seen ? near * (look > 0.5 ? 1 : look > 0 ? 0.65 : 0.3) : 0;
    const deaf = G.U.clamp(1 - d / 22, 0, 1) * (seen ? 1 : 0.6);
    if (blind > 0.03) G.HUD.flash(blind);
    if (deaf > 0.03) G.Audio.deafen(deaf);
  },
  onKill(m) {
    if (this.phase !== 'level') return;
    G.Views.kill(m);
    if (G.Highlights) G.Highlights.kill(m);
    if (m.inc) { // (down already: counted then, js/server.js incapacitate)
      const def = G.ENEMIES[m.ty];
      if (m.bo) G.HUD.feed(`<span class="dim">${def ? def.name : 'Suspect'} bled out</span>`);
      return;
    }
    this.credit(m);
  },
  // A suspect incapacitated (down for good): counted now, the same as a kill
  onIncap(m) {
    if (this.phase !== 'level') return;
    if (G.Highlights) G.Highlights.incap(m);
    this.credit(m);
  },
  // the feed and, for whoever did it, the credits and their tally: a kill, or a suspect incapacitated
  credit(m) {
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
      if (G.Arsenal) G.Arsenal.kill(m);
      G.HUD.feed(`<span class="cr">+¢${cr}</span>`);
    }
  },

  // ------------------------------------------------------------- phases
  enterLobby() {
    this.toggleInv(false);
    this.leaveHub();
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
    this.wcase = c && c[0] ? { code: c[0], mag: c[1], reserve: c[2], am: c[4], kit: c[5] || null, sk: c[6] || null } : null; // (sk: the stickers on a gun put in it)
    this.caseOpen = !!(c && c[3]);
    G.Views.syncCase();
  },
  // ------------------------------------------------------------- the attachments box
  // One use each (this.abox: [open, { player id: [their three part ids, the one they took] }]): your three, as three
  // wheels. The first time you look, each spins through attachments for the weapon in your hands till you stop it,
  // slows and lands on what the host rolled (the result's the host's: stopping only shows it); looking again, they've
  // landed. A landed one can be fitted straight to the weapon in your hands (if it goes on it as it's built) or carried:
  // one of your three.
  aboxMine() { return this.abox && this.abox[1] && this.abox[1][G.Net.myId] || null; },
  aboxShow(spin) {
    const mine = this.aboxMine();
    if (this.phase !== 'level' || !mine) return;
    const key = mine[0].join(','), ui = this.aboxUI && this.aboxUI.key === key ? this.aboxUI : null;
    this.aboxUI = ui || { key, wheels: mine[0].map(() => ({ landed: !spin, stop: null, off: 0, strip: null })) };
    if (spin && !ui) {
      const w = G.Me.cur(), GS = G.Gunsmith, pool = (w ? GS.attachOptions(w.def.id, w.def.build) : []).map((p) => p.id);
      for (const pid of mine[0]) if (!pool.includes(pid)) pool.push(pid);
      while (pool.length < 6) pool.push(GS.LIST[(Math.random() * GS.LIST.length) | 0].id); // (something to spin through)
      const live = pool.filter((pid) => GS.PARTS[pid] && !GS.PARTS[pid].retired), R = this.REEL;
      // each reel: M faces (shuffled), three times over, so it can scroll down a full turn and still have faces to stop on
      for (const wh of this.aboxUI.wheels) {
        const one = []; for (let i = 0; i < R.M; i++) one.push(live[(Math.random() * live.length) | 0]);
        wh.strip = one.concat(one, one); wh.off = Math.random() * R.M * R.H;
      }
    }
    this.aboxOpen = true;
    G.Me.keys = {}; G.Me.mouse.l = G.Me.mouse.r = false;
    this.$('pause').classList.add('hidden'); this.$('clickToPlay').classList.add('hidden');
    if (document.pointerLockElement) document.exitPointerLock();
    const el = this.$('aboxPick');
    el.classList.remove('hidden');
    if (!el.dataset.bound) { el.dataset.bound = 1; el.addEventListener('click', (e) => this.aboxClick(e)); el.addEventListener('mouseover', (e) => this.aboxHover(e)); }
    this.aboxRender();
    cancelAnimationFrame(this.aboxRaf); this.aboxT = 0;
    if (this.aboxUI.wheels.some((wh) => !wh.landed)) this.aboxRaf = requestAnimationFrame((t) => this.aboxSpin(t));
    if (spin) G.Audio.click();
  },
  // a reel: faces H px tall, M to a turn, scrolling down at V px/s, the window WH tall (the faces either side peek in);
  // a stop eases out over the next few faces, starting at the reel's own speed
  REEL: { H: 132, M: 10, V: 1100, WH: 176 },
  aboxHide() {
    cancelAnimationFrame(this.aboxRaf); cancelAnimationFrame(this.caseRaf);
    if (!this.aboxOpen) return;
    this.aboxOpen = false;
    if (this.caseUI) this.caseUI.on = false;
    this.$('aboxPick').classList.add('hidden'); this.$('casePick').classList.add('hidden');
    if (this.phase !== 'level' || this.invOpen) return;
    this.lock();
    setTimeout(() => { if (!this.locked && !this.invOpen && !this.aboxOpen && this.phase === 'level') this.$('clickToPlay').classList.remove('hidden'); }, 300);
  },
  // a part's face in a wheel: its picture, its name, the slot it goes in
  aboxFace(pid) {
    const GS = G.Gunsmith, p = GS.PARTS[pid], it = G.Gear.partItem(pid), [cw, ch] = G.Gear.size(it);
    this.aboxIcons = this.aboxIcons || {};
    const img = this.aboxIcons[pid] || (this.aboxIcons[pid] = G.Icons.of(it, cw, ch, false));
    return `<img src="${img}" alt=""><b>${G.U.esc(p ? p.name : pid)}</b><small>${G.U.esc(p ? GS.SLOT_LABEL[p.slot] || p.slot : '')}</small>`;
  },
  // which slot of the weapon in your hands a part goes straight into (as it's built), or null
  aboxSlot(pid) {
    const GS = G.Gunsmith, p = GS.PARTS[pid], w = G.Me.cur();
    return p && w ? GS.slotsOf(w.def.id, w.def.build).find((sl) => GS.fitsSlot(sl, p, w.def.id)) || null : null;
  },
  aboxRender() {
    const el = this.$('aboxPick'), mine = this.aboxMine(), ui = this.aboxUI;
    if (!el || !mine || !ui) return;
    const w = G.Me.cur(), taken = mine[1], spinning = ui.wheels.some((wh) => !wh.landed);
    const card = (pid, i) => {
      const wh = ui.wheels[i], p = G.Gunsmith.PARTS[pid], landed = wh.landed;
      const sl = landed && this.aboxSlot(pid);
      const acts = taken ? (taken === pid ? '<small>Taken</small>' : '')
        : !landed ? `<button class="btn primary" data-stop="${i}" ${wh.stop ? 'disabled' : ''}>${wh.stop ? 'Stopping...' : 'Stop'}</button>`
          : `${sl ? `<button class="btn primary" data-fit="${i}">Fit to your ${G.U.esc(w.def.name)}</button>` : ''}<button class="btn" data-take="${i}">Put in your inventory</button>`;
      const R = this.REEL, win = landed || !wh.strip ? `<div class="abox-win">${this.aboxFace(pid)}</div>`
        : `<div class="abox-reel" style="height:${R.WH}px"><div class="abox-strip">${wh.strip.map((q) => `<div class="abox-face" style="height:${R.H}px">${this.aboxFace(q)}</div>`).join('')}</div></div>`;
      return `<div class="arm${landed ? '' : ' spinning'}${taken === pid ? ' taken' : taken ? ' gone' : ''}" data-wheel="${i}">${win}
        <em>${landed && p ? G.U.esc(p.desc || '') : ''}</em><div class="abox-acts">${acts}</div></div>`;
    };
    const how = 'Take <b>one</b> of the three: fitted to the weapon in your hands, or into your inventory. Fitting it puts whatever it replaces in your inventory (on the floor if there\'s no room).';
    el.innerHTML = `<div class="arm-box"><h2>Attachments box</h2><p>${taken ? 'You\'ve had your pick.' : spinning ? 'Stop each wheel. ' + how : how}</p>
      <div class="arms">${mine[0].map(card).join('')}</div><div class="abox-stats">${this.aboxStatsFor(ui.hover)}</div><button class="btn abox-close" data-close>Close <small>(Esc)</small></button></div>`;
    this.aboxPlace();
  },
  // over a pick that's landed: what fitting it would do to the weapon in your hands (the gunsmith's stats, as they'd be)
  aboxHover(e) {
    const card = e.target.closest('[data-wheel]'), mine = this.aboxMine(), ui = this.aboxUI;
    if (!card || !mine || !ui) return;
    const i = +card.dataset.wheel, pid = ui.wheels[i] && ui.wheels[i].landed ? mine[0][i] : null;
    if (!pid || pid === ui.hover) return;
    ui.hover = pid;
    const box = this.$('aboxPick').querySelector('.abox-stats'); if (box) box.innerHTML = this.aboxStatsFor(pid); // (the box is drawn afresh as its wheels land: not a kept element)
  },
  aboxStatsFor(pid) {
    const GS = G.Gunsmith, p = pid && GS.PARTS[pid], w = G.Me.cur();
    if (!p || !w) return '<p class="abox-hint">Hover over a pick to see what it does to your gun.</p>';
    const fx = G.GunsmithUI.partEffects(p), sl = this.aboxSlot(pid), name = G.U.esc(w.def.name);
    if (!sl) return `<h4>${G.U.esc(p.name)}</h4><div class="gs-pe">${fx || ''}</div><p class="abox-hint">Doesn't fit your ${name} as it's built: it goes in your inventory.</p>`;
    const build = Object.assign({}, w.def.build), off = build[sl.slot];
    build[sl.slot] = pid; GS.prune(w.def.id, build);
    if (GS.convert(w.def.id, build)) return `<h4>${G.U.esc(p.name)}</h4><p class="abox-hint">Fitted, it makes your ${name} into another gun.</p>`;
    const after = GS.compile(w.def.id, build), was = off && GS.PARTS[off];
    return `<h4>Fitted to your ${name}${was ? ` <small>in place of the ${G.U.esc(was.name)}</small>` : ''}</h4><div class="gs-pe">${fx || ''}</div><div class="gs-stats">${G.GunsmithUI.statsHtml(w.def, after)}</div>`;
  },
  // where each spinning reel's strip is: off (0..M*H while it spins) scrolls it down; the face centred in the window
  // is the one at 2M - off/H (in the middle copy)
  aboxPlace() {
    const R = this.REEL, el = this.$('aboxPick'), ui = this.aboxUI;
    ui.wheels.forEach((wh, i) => {
      const st = !wh.landed && el.querySelector(`[data-wheel="${i}"] .abox-strip`);
      if (st) st.style.transform = `translateY(${(wh.off - 2 * R.M * R.H + (R.WH - R.H) / 2).toFixed(1)}px)`;
    });
  },
  // the reels, each frame: a spinning one scrolls down (wrapping a turn), a stopping one eases out onto its face, then
  // lands (a click as it settles)
  aboxSpin(t) {
    const ui = this.aboxUI, R = this.REEL;
    if (!ui || !this.aboxOpen) return;
    const dt = this.aboxT ? Math.min(0.05, (t - this.aboxT) / 1000) : 0;
    this.aboxT = t;
    let changed = false;
    for (const wh of ui.wheels) {
      if (wh.landed) continue;
      if (wh.stop) {
        const s = wh.stop, u = Math.min(1, (t - s.t0) / s.T);
        wh.off = s.o0 + (s.o1 - s.o0) * (1 - Math.pow(1 - u, 3));
        if (u >= 1) { wh.landed = true; wh.stop = null; changed = true; G.Audio.click(); }
      } else wh.off = (wh.off + R.V * dt) % (R.M * R.H);
    }
    if (changed) this.aboxRender(); else this.aboxPlace();
    if (ui.wheels.some((wh) => !wh.landed)) this.aboxRaf = requestAnimationFrame((tt) => this.aboxSpin(tt));
  },
  aboxClick(e) {
    const t = e.target.closest('button');
    if (!t || t.disabled) return;
    const mine = this.aboxMine(), ui = this.aboxUI;
    if (t.dataset.close != null) return this.aboxHide();
    if (!mine) return;
    if (t.dataset.stop != null) {
      const i = +t.dataset.stop, wh = ui.wheels[i], R = this.REEL;
      if (wh.landed || wh.stop) return;
      // the face it lands on: far enough down the reel that easing out from full speed reaches it (an ease-out cubic
      // starts at 3x its average speed), and what the host rolled goes on that face
      const c = 2 * R.M - wh.off / R.H, k = Math.floor(c - (R.V * 1.2 / 3) / R.H), dist = (c - k) * R.H;
      wh.strip[k] = mine[0][i];
      wh.stop = { t0: performance.now(), o0: wh.off, o1: wh.off + dist, T: (3 * dist / R.V) * 1000 };
      G.Audio.click();
      return this.aboxRender();
    }
    const i = t.dataset.fit != null ? +t.dataset.fit : t.dataset.take != null ? +t.dataset.take : -1;
    if (i < 0 || mine[1] || !mine[0][i]) return;
    const fit = t.dataset.fit != null && !!this.aboxSlot(mine[0][i]);
    G.Net.toHost({ t: 'takeAbox', i, fit });
    for (const b of this.$('aboxPick').querySelectorAll('[data-fit],[data-take]')) b.disabled = true;
  },
  // ------------------------------------------------------------- the weapon case
  // One weapon, one wheel, wider than the attachment box's: the first time you look in it (whoever opened it) it spins through what could have been in
  // there till you stop it, and lands on what's really in it (the host's, as ever: stopping only shows it). Looking again, it's landed. Take it or leave it.
  // Its lid stays down on your screen till then (js/views.js), so the gun in it doesn't give the wheel away.
  caseSeen() { return !this.wcase || !!(this.caseUI && this.caseUI.lv === this.level && this.caseUI.wh.landed); },
  caseShow(spin) {
    if (this.phase !== 'level') return;
    let ui = this.caseUI && this.caseUI.lv === this.level ? this.caseUI : null;
    if (!ui) {
      ui = this.caseUI = { lv: this.level, wh: { landed: !this.wcase, stop: null, off: 0, strip: null } };
      if (!ui.wh.landed) {
        const pool = G.WEAPON_LIST.filter((w) => G.obtainable(w)).map((w) => G.Gunsmith.defaultCode(w.id)), R = this.REEL, one = [];
        for (let i = 0; i < R.M; i++) one.push(pool[(Math.random() * pool.length) | 0]);
        ui.wh.strip = one.concat(one, one); ui.wh.off = Math.random() * R.M * R.H;
      }
    }
    ui.on = true; this.aboxOpen = true;
    G.Me.keys = {}; G.Me.mouse.l = G.Me.mouse.r = false;
    this.$('pause').classList.add('hidden'); this.$('clickToPlay').classList.add('hidden');
    if (document.pointerLockElement) document.exitPointerLock();
    const el = this.$('casePick');
    el.classList.remove('hidden');
    if (!el.dataset.bound) { el.dataset.bound = 1; el.addEventListener('click', (e) => this.caseClick(e)); }
    this.caseRender();
    cancelAnimationFrame(this.caseRaf); this.caseT = 0;
    if (!ui.wh.landed) this.caseRaf = requestAnimationFrame((t) => this.caseSpin(t));
    if (spin) G.Audio.click();
  },
  caseFace(code) {
    const def = G.Gunsmith.fromCode(code);
    if (!def) return '<b>—</b>';
    const it = G.Gear.gunItem({ def }), [cw, ch] = G.Gear.size(it);
    return `<img src="${G.Icons.of(it, cw, ch, false)}" alt=""><b style="color:${G.TIER_COLORS[def.tier]}">${G.U.esc(def.name)}</b><small>${G.U.esc(G.calOf(def) || def.cls || '')}</small>`;
  },
  caseRender() {
    const el = this.$('casePick'), ui = this.caseUI, wc = this.wcase, R = this.REEL;
    if (!el || !ui) return;
    const wh = ui.wh, def = wc && G.Gunsmith.fromCode(wc.code), mine = def && G.Me.weapons[def.slot], stow = mine && G.Me.packRoom(G.Gear.gunItem(mine));
    const win = wh.landed || !wh.strip ? `<div class="abox-win">${wc ? this.caseFace(wc.code) : '<b>Empty</b>'}</div>`
      : `<div class="abox-reel" style="height:${R.WH}px"><div class="abox-strip">${wh.strip.map((q) => `<div class="abox-face" style="height:${R.H}px">${this.caseFace(q)}</div>`).join('')}</div></div>`;
    const take = !mine ? `Take the ${G.U.esc(def ? def.name : '')}` : stow ? `Take it <small>(your ${G.U.esc(mine.def.name)} goes in your backpack)</small>` : `Swap your ${G.U.esc(mine.def.name)} for it`;
    const acts = !wh.landed ? `<button class="btn primary" data-stop ${wh.stop ? 'disabled' : ''}>${wh.stop ? 'Stopping...' : 'Stop'}</button>` : wc ? `<button class="btn primary" data-take>${take}</button>` : '';
    const stats = wh.landed && def ? `<div class="abox-stats"><h4>${mine ? `Against your ${G.U.esc(mine.def.name)}` : G.U.esc(def.name)}</h4><div class="gs-stats">${G.GunsmithUI.statsHtml(mine ? mine.def : def, def)}</div></div>` : '';
    el.innerHTML = `<div class="arm-box"><h2>Weapon case</h2><p>${!wh.landed ? 'Stop the wheel to see what\'s in it.' : wc ? 'One weapon, for whoever takes it.' : 'Nothing left in it.'}</p>
      <div class="arms"><div class="arm${wh.landed ? '' : ' spinning'}" data-wheel="0">${win}<div class="abox-acts">${acts}</div></div></div>${stats}<button class="btn abox-close" data-close>Close <small>(Esc)</small></button></div>`;
    this.casePlace();
  },
  casePlace() {
    const R = this.REEL, wh = this.caseUI.wh, st = !wh.landed && this.$('casePick').querySelector('.abox-strip');
    if (st) st.style.transform = `translateY(${(wh.off - 2 * R.M * R.H + (R.WH - R.H) / 2).toFixed(1)}px)`;
  },
  caseSpin(t) {
    const ui = this.caseUI, R = this.REEL;
    if (!ui || !ui.on) return;
    const dt = this.caseT ? Math.min(0.05, (t - this.caseT) / 1000) : 0, wh = ui.wh;
    this.caseT = t;
    if (wh.stop) {
      const s = wh.stop, u = Math.min(1, (t - s.t0) / s.T);
      wh.off = s.o0 + (s.o1 - s.o0) * (1 - Math.pow(1 - u, 3));
      if (u >= 1) { wh.landed = true; wh.stop = null; G.Audio.click(); return this.caseRender(); }
    } else wh.off = (wh.off + R.V * dt) % (R.M * R.H);
    this.casePlace();
    this.caseRaf = requestAnimationFrame((tt) => this.caseSpin(tt));
  },
  caseClick(e) {
    const t = e.target.closest('button'), ui = this.caseUI;
    if (!t || t.disabled || !ui) return;
    if (t.dataset.close != null) return this.aboxHide();
    if (t.dataset.stop != null) { // (as the attachment box's: far enough down the reel to ease out onto it, and what's in the case goes on that face)
      const wh = ui.wh, R = this.REEL;
      if (wh.landed || wh.stop) return;
      const c = 2 * R.M - wh.off / R.H, k = Math.floor(c - (R.V * 1.2 / 3) / R.H), dist = (c - k) * R.H;
      if (!this.wcase) { wh.landed = true; return this.caseRender(); }
      wh.strip[k] = this.wcase.code;
      wh.stop = { t0: performance.now(), o0: wh.off, o1: wh.off + dist, T: (3 * dist / R.V) * 1000 };
      G.Audio.click();
      return this.caseRender();
    }
    if (t.dataset.take != null) { this.aboxHide(); G.Me.caseTake(); }
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
    if (this.hub) G.InvUI.refresh();
  },
  // after a change in the stash: how you left the team locker, to the host
  teamSync() {
    const g = this.tGrid;
    if (!g || !this.hub) return;
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
    this.closeShop();
    this.hub = false; // (the hangar stays up behind the map: G.Hangar.leave when the level replaces it)
    this.phase = 'route';
    this.level = level;
    if (document.pointerLockElement) document.exitPointerLock();
    this.$('clickToPlay').classList.add('hidden');
    G.Views.clearLevel();
    if (!this.map) this.menuBackdrop();
    this.screen('route');
    this.renderRoute();
    this.sidearmPick();
  },
  // Before the first level of a run: which sidearm you start with, from what you've earned of the tree (js/arsenal.js). Your own choice (the squad's
  // aren't waited on); the route's yours to vote on once you've made it. A web, the P9 in the middle, to move about on: drag it, scroll to zoom, and a
  // gun you click on comes to the middle. A strand fills as you get on with what it asks.
  sidearmPick() {
    const el = this.$('sidearmPick'), arms = this.arms || {}, roster = this.roster || {}, A = G.Arsenal;
    if (G.Me.sidearmChosen) { el.classList.add('hidden'); return; }
    if (!this.armLook) { this.armLook = this.armSel = 'p9'; this.armView = { x: 0, y: 0, z: 0.7 }; }
    // who's taken it (the squad's own picks: told by the host)
    const takers = (id) => Object.entries(arms).filter(([pid, a]) => a === id && roster[pid]).map(([pid]) => `<i style="color:${G.U.hex(roster[pid].color)}">${G.Callsigns.html(roster[pid].animal)}${G.U.esc(roster[pid].name)}</i>`);
    const others = Object.keys(roster).filter((pid) => pid !== G.Net.myId), waiting = others.filter((pid) => !arms[pid]).length;
    const pic = (id) => { const it = G.Gear.gunItem(G.Me.makeWeapon(id)), [cw, ch] = G.Gear.size(it); return G.Icons.of(it, cw, ch, false); };
    // the web: a ring for each step out, spokes between, and the paths on it
    const W = 1200, spokes = [...Array(6)].map((_, i) => ((-90 + i * 60) * Math.PI) / 180), spot = (a, r) => [Math.cos(a) * r, Math.sin(a) * r], rings = A.RINGS.slice(1);
    const web = rings.map((r) => `<polygon points="${spokes.map((a) => spot(a, r).map((v) => v.toFixed(1)).join()).join(' ')}"/>`).join('') + spokes.map((a) => { const [x, y] = spot(a, rings[rings.length - 1]); return `<line x1="0" y1="0" x2="${x.toFixed(1)}" y2="${y.toFixed(1)}"/>`; }).join('');
    const strands = A.NODES.filter((q) => q.from).map((q) => {
      const [x0, y0] = A.at(A.BY.get(q.from)), [x1, y1] = A.at(q), got = A.open(q.id), f = got ? 1 : A.open(q.from) ? A.left(q) / q.n : 0;
      return `<line class="strand" x1="${x0}" y1="${y0}" x2="${x1}" y2="${y1}"/>${f > 0 ? `<line class="strand on" x1="${x0}" y1="${y0}" x2="${(x0 + (x1 - x0) * f).toFixed(1)}" y2="${(y0 + (y1 - y0) * f).toFixed(1)}"/>` : ''}`;
    }).join('');
    const nodes = A.NODES.map((q) => {
      const [x, y] = A.at(q), st = A.open(q.id) ? 'got' : A.open(q.from) ? 'next' : 'far', tip = st === 'next' ? `<small>${A.left(q)}/${q.n} ${G.U.esc(q.what)}</small>` : st === 'far' ? '<small>Locked</small>' : '';
      return `<button class="web-node ${st}${this.armLook === q.id ? ' look' : ''}${this.armSel === q.id ? ' sel' : ''}" data-arm="${q.id}" style="left:${x.toFixed(1)}px;top:${y.toFixed(1)}px"><img src="${pic(q.id)}" alt="" draggable="false"><b>${G.U.esc(A.name(q.id))}</b>${tip}</button>`;
    }).join('');
    const paths = Object.entries(A.PATHS).map(([k, p]) => { const [x, y] = A.along(k, A.RINGS[p.len] + 165); return `<span class="web-path" style="left:${x.toFixed(1)}px;top:${y.toFixed(1)}px">${p.name}</span>`; }).join('');
    // what you're looking at: the gun, and what it takes
    const id = this.armLook, q = A.BY.get(id), d = G.WEAPONS[id], cal = G.CALIBERS[G.calOf(d)], got = A.open(id), modes = (d.modes || [d.mode]).map((m) => G.MODE_NAME[m]).join(' / ');
    const nextOn = A.NODES.filter((c) => c.from === id && !A.open(c.id)).map((c) => `<li><b>${G.U.esc(A.name(c.id))}</b> <span>${A.left(c)}/${c.n}</span> ${G.U.esc(c.what)}<small>${G.U.esc(c.how)} At most ${c.most} a level.</small></li>`).join('');
    const ask = got ? '' : A.open(q.from) ? `<div class="web-ask"><b>${A.left(q)}/${q.n} ${G.U.esc(q.what)}</b> with the ${G.U.esc(A.name(q.from))}<small>${G.U.esc(q.how)} At most ${q.most} a level.</small></div>` : `<div class="web-ask far"><b>Locked</b> Earn the ${G.U.esc(A.name(q.from))} first.</div>`;
    const was = el.querySelector('.web-world');
    el.innerHTML = `<div class="web-full"><div class="web-view"><div class="web-world"><svg viewBox="${-W} ${-W} ${W * 2} ${W * 2}" style="left:${-W}px;top:${-W}px;width:${W * 2}px;height:${W * 2}px" aria-hidden="true"><g class="web-lines">${web}</g>${strands}</svg>${paths}${nodes}</div>
        <div class="web-head"><h2>Your sidearm</h2><p>Drag to move · scroll to zoom · click a gun</p></div><button class="btn web-home" data-armhome>Back to the P9</button></div>
      <aside class="web-side"><img src="${pic(id)}" alt=""><h3>${G.U.esc(d.name)}</h3><div class="arm-stats"><span>${cal ? cal.name : ''}</span><span>${d.mag} round${d.mag === 1 ? '' : 's'}</span><span>${modes}</span><span>${G.U.fmt(Math.round(G.Ballistics.energy(d)))} J · ${d.rpm} rpm</span></div><em>${G.U.esc(d.desc)}</em>${ask}
        ${nextOn ? `<h4>With this gun</h4><ul class="web-next">${nextOn}</ul>` : ''}${others.length && got ? `<span class="arm-who">${takers(id).join('') || '<small>no one yet</small>'}</span>` : ''}
        <div class="web-foot"><p>Your own equipment, not a squad vote, and what you earn here stays yours. It starts loaded with tracers, two spare loads in your pocket.</p>${others.length ? `<p class="arm-note">${waiting ? `${waiting} of the squad still choosing.` : 'The squad have all chosen.'}</p>` : ''}
        <button class="btn primary arm-ok" data-armok ${got ? '' : 'disabled'}>${got ? `Take the ${G.U.esc(d.name)}` : 'Not yet yours'}</button></div></aside></div>`;
    el.classList.remove('hidden');
    const place = () => { const v = this.armView, w = el.querySelector('.web-world'); if (w) w.style.transform = `translate(${v.x.toFixed(1)}px, ${v.y.toFixed(1)}px) scale(${v.z.toFixed(3)})`; };
    this.armPlace = place;
    // (where it was, then across to where it's going: the map's built afresh each time)
    if (this.armFrom) { const w = el.querySelector('.web-world'); w.style.transform = this.armFrom; this.armFrom = null; requestAnimationFrame(() => { w.classList.add('glide'); place(); }); } else place();
    if (was) was.remove();
    if (!el.dataset.bound) {
      el.dataset.bound = 1;
      let drag = null, moved = false;
      const go = (x, y) => { const v = this.armView, w = el.querySelector('.web-world'); this.armFrom = w ? w.style.transform : null; v.x = x * v.z; v.y = y * v.z; };
      el.addEventListener('pointerdown', (e) => {
        if (e.button !== 0 || !e.target.closest('.web-view') || e.target.closest('.web-home')) return;
        drag = { x: e.clientX, y: e.clientY, vx: this.armView.x, vy: this.armView.y }; moved = false;
        const w = el.querySelector('.web-world'); if (w) w.classList.remove('glide');
      });
      window.addEventListener('pointermove', (e) => {
        if (!drag) return;
        const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
        if (Math.hypot(dx, dy) > 5) moved = true;
        if (moved) { const v = this.armView, R = 1050 * v.z; v.x = G.U.clamp(drag.vx + dx, -R, R); v.y = G.U.clamp(drag.vy + dy, -R, R); this.armPlace(); }
      });
      window.addEventListener('pointerup', () => { drag = null; });
      el.addEventListener('wheel', (e) => {
        const view = e.target.closest('.web-view');
        if (!view) return;
        e.preventDefault();
        const v = this.armView, r = view.getBoundingClientRect(), z = G.U.clamp(v.z * Math.exp(-e.deltaY * 0.0012), 0.4, 1.5), k = z / v.z, cx = e.clientX - r.left - r.width / 2, cy = e.clientY - r.top - r.height / 2; // (about the cursor: what's under it stays there)
        v.x = cx - (cx - v.x) * k; v.y = cy - (cy - v.y) * k; v.z = z;
        const w = el.querySelector('.web-world'); if (w) w.classList.remove('glide');
        this.armPlace();
      }, { passive: false });
      el.addEventListener('click', (e) => {
        const dragged = moved; moved = false;
        if (G.Me.sidearmChosen) return;
        const b = e.target.closest('[data-arm]'), ok = e.target.closest('[data-armok]');
        if (e.target.closest('[data-armhome]')) { go(0, 0); G.Audio.click(); return this.sidearmPick(); }
        if (b) {
          if (dragged) return; // (it was a drag that started on it)
          this.armLook = b.dataset.arm; if (G.Arsenal.open(this.armLook)) this.armSel = this.armLook;
          const [x, y] = G.Arsenal.at(G.Arsenal.BY.get(this.armLook)); go(-x, -y);
          G.Audio.click(); return this.sidearmPick(); // (chosen, not yet taken)
        }
        if (!ok || ok.disabled || !G.Arsenal.open(this.armLook)) return;
        const id = this.armLook;
        G.Me.setSidearm(id); G.Audio.click();
        G.Net.toHost({ t: 'arm', id }); // (so the squad sees it)
        G.HUD.toast('', `Sidearm: ${G.WEAPONS[id].name}`, 1.4);
        this.armSel = this.armLook = null; this.sidearmPick(); this.renderRoute();
      });
    }
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
    const arms = this.arms || {}, roster = this.roster || {};
    if (this.level === 1 && ids.length > 1 && G.Me.sidearmChosen) this.$('routeMsg').innerHTML += `<div class="arm-squad">Sidearms (each your own): ${ids.map((id) => `<i style="color:${G.U.hex(roster[id].color)}">${G.U.esc(roster[id].name)}</i> ${arms[id] ? G.U.esc(G.WEAPONS[arms[id]].name) : '<small>choosing…</small>'}`).join(' · ')}</div>`;
  },
  pickRoute(n) {
    if (!G.Me.sidearmChosen) return; // (pick your sidearm first)
    if (this.phase !== 'route' || !this.routeMap || !G.Route.options(this.routeMap, this.routeSt.path[this.routeSt.path.length - 1]).includes(n)) return;
    G.Audio.click();
    G.Net.toHost({ t: 'pick', n });
  },
  enterLevel(level, seed, th) {
    if (G.Arsenal) G.Arsenal.level(`${seed}:${level}`);
    this.caseUI = null; // (a new run's level 1 has a new case, whatever the last one's number was)
    this.leaveHub();
    this.phase = 'level';
    this.level = level;
    this.extract = { active: false, votes: 0, need: 0, civDead: 0, voted: false };
    this.enemiesLeft = 0;
    this.map = G.Level.generate(seed, level, th);
    if (G.Prof) G.Prof.reset(); // (the worst frames and totals: this level's)
    if (G.Highlights) { G.Highlights.drop(); G.Highlights.reset(); } // (last level's replays go; this one's start recording)
    G.Views.warmed = false; // compile the new level's shaders once it's populated (G.R.warmup)
    this.cabGrids = [];
    G.Loot.clear();
    G.R.setLevel(this.map);
    G.Views.clearLevel();
    G.HUD.buildMinimap(this.map);
    const team = [...G.Views.players.values()].map((p) => p.st && p.st.w && G.Gunsmith.fromCode(p.st.w)).filter(Boolean).map((d) => d.soundKey);
    G.GunAudio.prewarm([...Object.values(G.Me.weapons).flatMap((w) => [w.def.soundKey, G.Gunsmith.roundSoundKey(w.def, w.chamber || w.ammo)]), ...this.enemyGuns(level), ...team], this.map);
    // spread the squad out in the spawn room
    const ids = Object.keys(this.roster).sort();
    const i = Math.max(0, ids.indexOf(G.Net.myId));
    const sp = this.map.spawn, w = this.map.world;
    // each officer a clear spot of their own, nearest the spawn first (never on the stairs or in a wall)
    const clear = (x, z) => { let ok = true; G.World.query(w, [x - 0.4, 0.05, z - 0.4], [x + 0.4, 1.8, z + 0.4], (s) => { if (s.move) ok = false; }); return ok; };
    const spots = [[0, 0]];
    for (let r = 1; r <= 3; r++) for (let k = 0; k < 8 * r; k++) { const a = (k / (8 * r)) * Math.PI * 2; spots.push([Math.cos(a) * r * 0.9, Math.sin(a) * r * 0.9]); }
    const free = w ? spots.filter(([dx, dz]) => clear(sp.x + dx, sp.z + dz)) : spots;
    const [ox, oz] = free[i] || free[0] || [0, 0];
    G.Me.spawn(sp.x + ox, sp.z + oz);
    this.screen(null);
    G.HUD.show(true);
    G.HUD.toast(`LEVEL ${level}`, this.map.theme.name + (G.Route.isBoss(level) ? ' — <b class="red">THE WARDEN AWAITS</b>' : ''), 3.5);
    if (G.Route.isBoss(level)) G.Audio.alarm();
    if (!this.locked) this.$('clickToPlay').classList.remove('hidden');
  },
  // Between levels: the hangar (js/hangar.js). To the game it's a level with nothing in it but the shop, so you walk
  // about it, the squad is there, and rays, steps and sound are all the ordinary ones; the host just doesn't send
  // enemies. this.hub marks it (the phase is still 'level' here).
  enterShop(level, seed, report, stock) {
    this.toggleInv(false);
    this.closeShop();
    this.hub = true; this.shopOpen = false;
    this.phase = 'level';
    if (G.Me.navRearm) G.Me.navRearm();
    G.Shop.report = report || null;
    if (G.Me.pos) {
      const clean = report && report.civKilled === 0 && report.unauth === 0;
      const bonus = Math.round((250 + 75 * level + (clean ? 200 : 0) + (report && report.allRescued ? 150 + 50 * level : 0)));
      G.Me.credits += bonus;
      this.lastBonus = bonus;
    }
    this.level = level;
    this.extract = { active: false, votes: 0, need: 0, civDead: 0, voted: false };
    this.enemiesLeft = 0; this.civsLeft = 0; this.bodiesLeft = 0; this.weaponsLeft = 0; this.unitsCleared = 0;
    // the level just played stays, out of sight, for the highlights on the hangar's TVs (js/highlights.js)
    if (G.Highlights && this.map && !this.map.hub) G.Highlights.take(this.map, G.R.detachLevel());
    this.map = G.Level.generateHub(seed, level);
    G.Loot.clear();
    G.R.setLevel(this.map);
    G.Views.clearLevel();
    G.Me.dead = false; G.Me.down = false;
    G.Shop.open(level, seed, stock); // (his stock this visit: the whole squad's, shared)
    G.Hangar.enter(this.map);
    G.HUD.buildMinimap(this.map);
    // each officer a spot of their own on the pad, in front of the opening
    const i = Math.max(0, Object.keys(this.roster).sort().indexOf(G.Net.myId)), sp = G.Hangar.spawnAt(i);
    G.Me.spawn(sp.x, sp.z);
    G.Me.yaw = 0; // (facing the hall)
    this.screen(null);
    G.HUD.show(true);
    G.HUD.toast('THE HANGAR', `Level ${level} cleared · look at what you want and press <b>F</b>`, 4);
    if (this.lastBonus) G.HUD.chat(null, 0, `Mission bonus: +¢${this.lastBonus}`);
    if (!this.locked) this.$('clickToPlay').classList.remove('hidden');
  },
  // out of the hangar for good (a level, the lobby, the menu)
  leaveHub() {
    this.closeShop();
    this.hub = false;
    G.Hangar.leave();
  },
  enterGameover(m) {
    this.toggleInv(false);
    this.closeShop();
    this.hub = false;
    this.phase = 'gameover';
    if (document.pointerLockElement) document.exitPointerLock();
    this.$('clickToPlay').classList.add('hidden');
    this.screen('gameover');
    this.$('goSub').textContent = `Your squad fell on level ${m.level}.`;
    let html = '<table><tr><th>Operator</th><th>Incapacitated</th><th>Headshots</th><th>Damage</th><th>Downs</th><th>Revives</th></tr>';
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
      if (G.Highlights && !this.hub) G.Highlights.tick(dt); // (recording the level, for the hangar's TVs)
      G.GunAudio.updateListener(G.R.camera);
      if (this.hub) { G.Hangar.update(dt); G.Hangar.mark(); }
      G.Views.update(dt);
      if (G.Me.dead) G.Me.spectate(dt); // (after the rigs are posed: the helmet camera's on a head as it is this frame)
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
      if (u.fallen) { G.LightGrid.setDoor(i, 1); return; } // (off its hinges: js/damage.js has it)
      u.ang += ((d.open ? 1 : 0) - u.ang) * Math.min(1, dt * (u.rate || 7));
      piv.rotation.y = u.base + u.ang * Math.PI / 2 * 0.95 * (u.sign || 1);
      const k = Math.min(1, u.ang * 2.5); // (the lamps' light past it: all in by the time it's well ajar)
      G.LightGrid.setDoor(i, k < 0.01 ? 0 : k > 0.99 ? 1 : k);
    });
    G.LightGrid.flush();
    G.Damage.update(m, dt);
  },
  updateZone() { /* no exit zone: the squad votes to leave (Y) once order's restored */ },
};

window.addEventListener('load', () => G.Game.init());
