'use strict';
// Glue: menus, lobby, phase transitions, message dispatch, pointer lock, main loop.
// a DOM event whose target is known to be an element of type T (the handlers below are bound on a container, and read what was clicked)
type GmEvt<T extends Element = HTMLElement> = Event & { target: T };
// the attachments box's wheels (one per part on offer): a strip of faces scrolling, a stop easing out onto one, then landed
interface GmWheel { landed: boolean; stop: { t0: number; o0: number; o1: number; T: number } | null; off: number; strip: string[] | null }
interface GmAboxUI { key: string; wheels: GmWheel[]; hover?: string }
// a first aid cabinet as the host sends it: [open, [[item, count, x, y, rotated]...], version]
type GmCabItem = [string, number, number, number, number];
type GmCab = [number, GmCabItem[], number?];
// a team locker item: [tid, x, y, rotated, packed item]
type GmTeamItem = [string, number, number, number, string];
// the host's route: its seed and act (the map is rebuilt from them), the path taken, and each player's vote
interface GmRoute { seed: number; act: number; path?: number[]; votes?: Record<string, number> }
// the mission report the shop shows (more fields than these; only these are read here)
interface GmReport { civKilled: number; unauth: number; allRescued?: boolean; stronghold?: boolean; [k: string]: any }
// where the game is: the menu, the lobby, the route map, a level (the hangar between levels is a 'level' too: this.hub), the game-over table. ('shop' is
// only ever the host's word for the hangar phase: this.phase is never set to it)
type GmPhase = 'menu' | 'lobby' | 'route' | 'level' | 'shop' | 'gameover';
// the full-screen panels this.screen shows one of (index.html)
type GmScreen = 'menu' | 'lobby' | 'shop' | 'route' | 'gameover' | 'pause' | 'career';
// the sliders in the menu, and the keys they keep in storage
type GmSetting = 'sens' | 'padSens' | 'touchSens' | 'fov' | 'vol' | 'loadKit';
// what the host tells the clients (js/server.ts), by t: onMsg dispatches on it
type GmMsgKind = 'eround' | 'eInfo' | 'welcome' | 'roster' | 'arms' | 'rvotes' | 'newrun' | 'veil' | 'phase' | 'snap' | 'rfx' | 'bstk' | 'hole' | 'dpart' | 'dfall' | 'rpath' | 'npath' | 'skin' | 'loot' | 'lootRm' | 'glass' | 'crack' | 'lootGot' | 'team' | 'cab' | 'sbox' | 'abox' | 'wcase' | 'eshot' | 'shot' | 'nade' | 'boom' | 'course' | 'crun' | 'flash' | 'kill' | 'incap' | 'edown' | 'saved' | 'stock' | 'took' | 'ereload' | 'clear' | 'treat' | 'applying' | 'revive' | 'chat' | 'ping' | 'ffhit' | 'left' | 'door' | 'order' | 'shout' | 'radio' | 'evid' | 'evtake' | 'evsec' | 'cuffed' | 'refund';
// the map as js/damage.ts takes it (its own cut-down shape of a level's)
type GmDmgMap = Parameters<typeof G.Damage.apply>[0];
// the turning figure of you in the menu (lookPreview)
interface GmPreview { r: THREE.WebGLRenderer; sc: THREE.Scene; cam: THREE.PerspectiveCamera; rig: Rig | null; yaw: number }
// the attachments box as the host sends it: [open, { player id: [their three part ids, the one they took] }]
type GmAbox = [number, Record<string, [string[], (string | null)?]>];
// the sticker box: [the sticker (a file name), who took it (0: no one yet)]
type GmSbox = [string, string | 0];
// where the sidearm web is panned and zoomed to
interface GmArmView { x: number; y: number; z: number }
const G_Game = {
  phase: 'menu' as GmPhase,
  map: null as LvMap | null,
  level: 0,
  roster: {} as Record<string, any>,
  extract: { active: false, votes: 0, need: 0, civDead: 0, voted: false }, // order restored; the vote to leave
  enemiesLeft: 0,
  chatOpen: false,
  locked: false,
  softLocked: false, // (playing on a controller or a touch screen, with no pointer lock to be had: counts as locked; js/gamepad.ts, js/touch.ts)
  runStarted: false,
  // the rest of what it keeps, made as it goes (init and the methods below): all here, so its whole shape is in one place. Those marked (init)
  // are always set before anything reads them.
  settings: undefined as unknown as Record<GmSetting, number>, // (init)
  myName: undefined as unknown as string, // (init: your callsign's name, its animal and colour, and what you wear)
  myAnimal: undefined as unknown as string,
  prefAnimals: [] as string[], // (your callsign preference: every animal, ranked: init)
  myColor: undefined as unknown as number,
  myLook: undefined as unknown as ReturnType<typeof G.Rig.cleanLook>,
  last: undefined as unknown as number, // (init: the clock of the last frame)
  veilT: undefined as ReturnType<typeof setTimeout> | undefined,
  veilWait: 0,
  veilN: undefined as unknown as number, // (frames to draw before the veil lifts: set by veil, and by js/views.ts applySnap)
  veilLine: undefined as string | null | undefined,
  _lp: undefined as GmPreview | undefined,
  hub: undefined as unknown as boolean, // (in the hangar)
  shopOpen: undefined as unknown as boolean,
  invOpen: undefined as unknown as boolean,
  aboxOpen: undefined as unknown as boolean,
  caseOpen: undefined as unknown as boolean,
  civsLeft: undefined as unknown as number, // (what the host's snapshots say is left: js/views.ts applySnap)
  unitsCleared: undefined as unknown as number,
  bodiesLeft: undefined as unknown as number,
  weaponsLeft: undefined as unknown as number,
  lastBonus: undefined as number | undefined,
  backdropT: undefined as number | undefined,
  backdropMap: null as LvMap | null, // (the menus' turning level: menuBackdrop)
  invT: undefined as number | undefined,
  abox: undefined as GmAbox | null | undefined,
  sbox: undefined as GmSbox | null | undefined,
  cabs: undefined as GmCab[] | undefined,
  arms: undefined as Record<string, string> | undefined, // (each player's sidearm pick)
  armSel: undefined as string | null | undefined,
  armLook: undefined as string | null | undefined,
  routeWait: 0,
  armModels: undefined as Promise<unknown> | 'ready' | undefined, // (the sidearm web's guns, stock and pro, loading before it opens: sidearmPick)
  armView: undefined as unknown as GmArmView,
  armPlace: undefined as unknown as () => void,
  armFrom: undefined as string | null | undefined,
  aboxUI: undefined as GmAboxUI | undefined,
  aboxRaf: undefined as unknown as number,
  aboxT: undefined as unknown as number,
  aboxIcons: undefined as Record<string, string> | undefined,
  cabGrids: undefined as GGrid[] | undefined,
  tGrid: undefined as GGrid | null | undefined,
  teamBusy: undefined as boolean | undefined,
  tidN: undefined as number | undefined,
  routeMap: undefined as ReturnType<typeof G.Route.gen> | undefined,
  routeSt: undefined as { path: number[]; votes: Record<string, number> } | undefined,

  init() {
    G.ServerLink.boot(); // (the host's simulation's thread, loading now so it's there when you host: js/serverlink.ts)
    G.Stickers.load().then((names) => G.ServerLink.stickers(names)); // (which stickers there are: js/stickers.ts; the sticker box hands out one of them)
    G.GunModels.boot(); // (every platform's model index and the props; the packs themselves as they are needed: js/gunmodels.ts)
    G.Hangar.load(); // (the hangar's baked scene, parsed as soon as the bundle's in: js/hangar.ts; what enters the game waits for it, needModels)
    this.settings = { sens: G.U.store.get('sens', 1), padSens: G.U.store.get('padSens', 1), touchSens: G.U.store.get('touchSens', 1), fov: G.U.store.get('fov', 80), vol: G.U.store.get('vol', 0.6), loadKit: G.U.store.get('loadKit', 1) }; // (loadKit: the hangar's Load Magazines tops up the equipped guns' and the kit's magazines only (1), or everything (0))
    this.myName = G.U.store.get('name', 'Operator' + Math.floor(Math.random() * 90 + 10));
    G.U.store.set('name', this.myName, true); // (kept: the same name after a refresh, so the squad knows who's back. auto: a made-up one doesn't outweigh an account's, js/cloud.ts)
    // your callsign: an animal (its emblem and colour mark you out to the squad; js/callsigns.ts). prefAnimals is your preference, every
    // animal ranked, asked of the host in that order (one of each to a squad); myAnimal is the one you have this session
    this.prefAnimals = this.animalPrefs(true);
    this.myAnimal = this.prefAnimals[0];
    this.myColor = G.Callsigns.of(this.myAnimal).color;
    this.myLook = G.Rig.cleanLook(G.U.store.get('look', null)); // top, pants, eyewear, gloves (the menu)
    G.R.init();
    G.HUD.init();
    G.Me.bindInput();
    G.Pad.init();
    G.Touch.init();
    G.Shop.bind();
    G.Audio.vol = this.settings.vol;
    G.Audio.muted = new URLSearchParams(location.search).has('mute') || G.U.store.get('muted', false);
    this.bindMenu();
    G.Cloud.boot(); // (the cloud saves, if they're set up: js/cloud.ts; and the career's record here, js/career.ts)
    // hosting: the remote players' messages to the simulation's thread, and their comings and goings (js/serverlink.ts); everyone's
    // game (the host's own too) hears the host's word in onMsg
    G.Net.onServer = (m, from) => G.ServerLink.fromPeer(m, from);
    G.Net.onClient = (m) => this.onMsg(m);
    G.Net.onPeerJoin = (id) => G.ServerLink.join(id);
    G.Net.onPeerLeave = (id) => G.ServerLink.leave(id);
    // lost the host (they refreshed, or dropped): back to the menu, trying the same code again for a minute, so
    // as soon as they're hosting again you're back in
    G.Net.onHostLost = () => { const code = G.Net.code; this.toMenu('Lost connection to the host. Reconnecting...'); this.rejoin(code, Date.now() + 60000); };
    this.menuBackdropSoon(); // (the menu is already on the page: it is painted and answers clicks before the backdrop is built)
    this.last = performance.now();
    requestAnimationFrame(() => this.loop()); // (the host's simulation ticks on its own, in its thread: js/serverhost.ts)
  },

  // ------------------------------------------------------------- menu UI
  $<T extends HTMLElement = HTMLElement>(id: string) { return document.getElementById(id) as T; },
  screen(id: GmScreen | null) {
    for (const s of ['menu', 'lobby', 'shop', 'route', 'gameover', 'pause', 'career']) this.$(s).classList.toggle('hidden', s !== id);
    G.HUD.show(this.phase === 'level');
  },
  // The loading veil: a change of scene goes behind a black panel, wobbled down the screen on a slant (css/style.css #veil). A
  // level's built, and its shaders compiled, in one go on the main thread, and the picture stands still while that's
  // done. So the host sends the panel across first (js/server.ts overBlack) and does it there, and the panel wipes on off
  // the bottom once the new place has drawn a few frames (js/views.ts applySnap).
  VEIL_MS: G_Sim.VEIL_MS, VEIL_OUT: 650, VEIL_SMOOTH: 6, // (VEIL_MS: the wipe on, css/style.css veilIn 0.8 s, and a frame: the work waits until it's all the way down, or it freezes the wipe halfway)
  veil(on: boolean, instant?: boolean) {
    const el = this.$('veil'), was = el.classList.contains('on');
    if (!on && !was && !instant) return; // (not up, or already on its way off)
    clearTimeout(this.veilT); this.veilN = 0;
    if (on) this.veilT = setTimeout(() => this.veil(false), 15000); // (whatever goes wrong, never left in the dark)
    if (on && was) return; // (it's up, and may still be settling: leave it)
    if (!on && was) this.veilSay(null); // (done: the line turns away as it goes)
    el.classList.toggle('now', !!instant);
    el.classList.toggle('on', !!on);
    G.Audio.hush(!!on); // (no sound while it's up: js/audio.ts hush)
    el.classList.toggle('out', !on && was && !instant);
    if (on) { this.$('veilStatus').textContent = ''; this.veilSay('Building the map'); }
    else if (el.classList.contains('out')) this.veilT = setTimeout(() => el.classList.remove('out'), this.VEIL_OUT + 50); // (back above the screen for next time)
  },
  // The line under it: what's being done now, the last one turning down out of sight. It can only change between the
  // long steps: they don't let the page draw. (Called while it's down, it does nothing. No text: the last one goes, and nothing comes.)
  veilSay(text: string | null) {
    const box = this.$('veilStatus');
    if (!this.$('veil').classList.contains('on') || this.veilLine === text && box.lastElementChild) return;
    this.veilLine = text;
    for (const q of box.querySelectorAll('span:not(.gone)')) { q.classList.add('gone'); setTimeout(() => q.remove(), 170); }
    if (!text) return;
    const n = document.createElement('span'); n.textContent = text; box.appendChild(n);
  },
  // ------------------------------------------------------------- your look (top, pants, eyewear, gloves)
  // the menu's options, a preview of you, and your own arms in first person
  bindLook() {
    this.bindLookBox();
    const save = () => { G.U.store.set('look', this.myLook); this.lookPreview(); this.applyLook(); };
    this.$('lookBox').addEventListener('change', ((e: GmEvt<HTMLSelectElement>) => { const k = e.target.dataset.look; if (k) { this.myLook[k] = e.target.value; save(); } }) as EventListener);
    this.$('lookBox').addEventListener('click', ((e: GmEvt) => {
      const b = e.target.closest<HTMLElement>('[data-lookc]'); if (!b) return;
      this.myLook[b.dataset.lookc!] = +b.dataset.c!;
      b.parentElement!.querySelectorAll('.sw').forEach((x) => x.classList.toggle('on', x === b));
      save();
    }) as EventListener);
  },
  // the look's options, as they're set now (and the figure, and your arms)
  bindLookBox() {
    const L = this.myLook, O = G.Rig.LOOKS as Record<string, string[]>, NAMES: Record<string, string> = { combat: 'Combat', longsleeve: 'Long-sleeve', tshirt: 'T-shirt', hoodie: 'Hoodie', cargo: 'Cargo', jeans: 'Jeans', none: 'None', glasses: 'Glasses', shooting: 'Shooting glasses', goggles: 'Goggles', tactical: 'Tactical', leather: 'Leather', fingerless: 'Fingerless' };
    const TOPC = [0x3a4048, 0x4d5639, 0x5a5240, 0x26282c, 0x2e3a52, 0x6a6e70, 0x7a2e2a, 0xb8b0a0], PANTC = [0x2e3238, 0x4d5639, 0x5a5240, 0x1f2226, 0x2b3550, 0x6b5b45, 0x3a3a3c];
    const sel = (k: string, label: string) => `<label>${label}<select data-look="${k}">${O[k].map((v) => `<option value="${v}"${L[k] === v ? ' selected' : ''}>${NAMES[v] || v}</option>`).join('')}</select></label>`;
    const sw = (k: string, cols: number[]) => `<div class="color-row look-row">${cols.map((c) => `<button class="sw${L[k] === c ? ' on' : ''}" data-lookc="${k}" data-c="${c}" style="background:${G.U.hex(c)}"></button>`).join('')}</div>`;
    // (the figure's canvas is kept: its renderer draws on it)
    const box = this.$('lookBox'), cv = box.querySelector('#lookPreview');
    box.innerHTML = `<div class="look-grid"><div>${sel('top', 'Top')}${sw('topC', TOPC)}${sel('pants', 'Pants')}${sw('pantsC', PANTC)}${sel('eyes', 'Eyewear')}${sel('gloves', 'Gloves')}</div><canvas id="lookPreview" width="150" height="230"></canvas></div>`;
    if (cv) box.querySelector('#lookPreview')!.replaceWith(cv);
    this.lookPreview();
    this.applyLook();
  },
  // a small turning figure of you, dressed as picked
  lookPreview() {
    const cv = this.$<HTMLCanvasElement>('lookPreview');
    if (!cv) return;
    if (!this._lp) {
      const r = new THREE.WebGLRenderer({ canvas: cv, antialias: true, alpha: true });
      r.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
      const sc = new THREE.Scene(), cam = new THREE.PerspectiveCamera(30, cv.width / cv.height, 0.1, 20);
      cam.position.set(0, 1.1, 3.0); cam.lookAt(0, 0.92, 0);
      sc.add(new THREE.HemisphereLight(0xffffff, 0x404048, Math.PI * 1.1)); const dl = new THREE.DirectionalLight(0xffffff, Math.PI * 0.8); dl.position.set(1, 2, 2); sc.add(dl);
      this._lp = { r, sc, cam, rig: null, yaw: 0.5 };
      const spin = () => {
        if (!this._lp) return;
        const lp = this._lp;
        if (lp.rig && !document.getElementById('menu')!.classList.contains('hidden')) {
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
  // (in the menu, your 1st preference; in a game, the host's pick for this session)
  setAnimal(id: string) {
    if (!G.Callsigns.valid(id)) return;
    if (id !== this.myAnimal) {
      this.myAnimal = id; this.myColor = G.Callsigns.of(id).color;
      if (this._lp && this._lp.rig) this.lookPreview(); // (the officer in the menu, in the new patches)
    }
    this.animalNote();
  },
  // the note under the menu's animals (and in the lobby): the host gave you another one this session, yours being taken
  animalNote() {
    const el = document.getElementById('animalNote');
    const P = this.prefAnimals, rank = P.indexOf(this.myAnimal), N = (id: string) => G.Callsigns.of(id).name;
    const txt = this.phase === 'menu' || rank === 0 ? '' : rank > 0 ? `The ${N(P[0])} was taken: you're the ${N(this.myAnimal)} this session, your ${this.ordinal(rank + 1)} choice.`
      : `The ${N(P[0])} was taken: the host gave you the ${N(this.myAnimal)} this session.`; // (an older host, which knows only your 1st)
    if (el) el.textContent = txt;
    const lb = document.getElementById('lobbyAnimal'); if (lb) lb.textContent = txt;
  },
  ordinal(n: number) { const s = ['th', 'st', 'nd', 'rd'], v = n % 100; return n + (s[(v - 20) % 10] || s[v] || s[0]); },
  // a small GUEST mark beside a player playing as a cloud saves guest (the roster's anon: js/server.ts hello, js/cloud.ts)
  guestMark(id: string | null | undefined) {
    const r = id ? this.roster && this.roster[id] : null;
    return r && r.anon ? ' <small class="guest-mark" title="Playing as a guest: their progress isn\'t saved to an email">GUEST</small>' : '';
  },
  // what's kept changed under the game (the cloud saves merged an account's in: js/cloud.ts): read again, the menu's controls with it
  applyStored(keys: string[]) {
    const S = G.U.store, has = (k: string) => keys.includes(k);
    for (const k of ['sens', 'padSens', 'touchSens', 'fov', 'vol', 'loadKit'] as GmSetting[]) if (has(k)) {
      const v = +S.get(k, this.settings[k]); if (!isFinite(v)) continue;
      this.settings[k] = v;
      for (const id of [k, k + '2']) { const el = this.$<HTMLInputElement>(id); if (el) el.value = String(v); }
      const lab = this.$(k + 'Val'); if (lab) lab.textContent = k === 'sens' || k === 'padSens' || k === 'touchSens' ? v.toFixed(2) : k === 'fov' ? v + '°' : k === 'vol' ? Math.round(v * 100) + '%' : lab.textContent;
      if (k === 'vol') G.Audio.setVolume(v);
    }
    if (has('muted') && !new URLSearchParams(location.search).has('mute')) { const m = !!S.get('muted', false); G.Audio.setMuted(m); this.$<HTMLInputElement>('mute').checked = m; }
    if (has('name')) { const n = String(S.get('name', this.myName) || '').trim().slice(0, 16); if (n) { this.myName = n; this.$<HTMLInputElement>('nameInput').value = n; if (this._lp && this._lp.rig) this._lp.rig.setCallsign(this.myAnimal, n); } }
    if (has('animals')) { this.prefAnimals = this.animalPrefs(false); if (this.phase === 'menu') this.setAnimal(this.prefAnimals[0]); this.animalPicks(); }
    if (has('look')) { this.myLook = G.Rig.cleanLook(S.get('look', null)); this.bindLookBox(); }
    if (has('turn')) { const t = S.get('turn', {}) || {}; this.$<HTMLInputElement>('turnUrl').value = t.url || ''; this.$<HTMLInputElement>('turnUser').value = t.user || ''; this.$<HTMLInputElement>('turnPass').value = t.pass || ''; }
  },
  // Your callsign preference, as kept ('animals': every animal, ranked, no repeats), made whole: from the single 'animal' (and its
  // 'animal2' second choice) an older version kept, or a top-three list, the missing ones appended in their usual order (a new player's
  // 1st made up at random). init: what's made up is kept (not a choice: it doesn't outweigh an account's), the old keys dropped.
  animalPrefs(init: boolean): string[] {
    const S = G.U.store, CS = G.Callsigns, ids = CS.LIST.map((a) => a.id), kept = S.get('animals', null);
    const src: unknown[] = Array.isArray(kept) ? kept : [S.get('animal', null), S.get('animal2', null)];
    const out: string[] = [];
    for (const a of src) if (typeof a === 'string' && CS.valid(a) && !out.includes(a)) out.push(a);
    if (!out.length) out.push(ids[Math.floor(Math.random() * ids.length)]);
    for (const id of ids) if (!out.includes(id)) out.push(id);
    if (init && JSON.stringify(out) !== JSON.stringify(kept)) { S.put('animals', out); S.put('animal', undefined); S.put('animal2', undefined); }
    return out;
  },
  // The menu's callsign list: every animal in one row, in your order, each with its rank. Ranked by dragging (bindAnimalRank), by the
  // keyboard, or a click that puts one first. The host gives you the highest-ranked one that's free.
  get animalOrder() { return this.prefAnimals; },
  animalPicks() {
    this.$('colorRow').innerHTML = this.prefAnimals.map((id, i) => {
      const a = G.Callsigns.of(id);
      return `<button class="sw animal rank-chip on${i === 0 ? ' first' : ''}" data-a="${id}" data-i="${i}" role="listitem" aria-label="${G.U.esc(a.name)}: ${this.ordinal(i + 1)} choice"
        title="${G.U.esc(a.name)}: drag to rank, click for 1st, arrow keys to move"><i class="rk">${i + 1}</i>${G.Callsigns.html(id)}<span style="color:${G.U.hex(a.color)}">${G.U.esc(a.name)}</span></button>`;
    }).join('');
  },
  // a new order: kept and synced as 'animals' (js/cloud.ts), the 1st your animal in the menu; said aloud for a screen reader (where the
  // one moved landed), and focus kept on it
  rankAnimals(order: string[], moved?: string, focus = false) {
    if (JSON.stringify(order) !== JSON.stringify(this.prefAnimals)) {
      this.prefAnimals = order;
      G.U.store.set('animals', order);
      if (this.phase === 'menu') this.setAnimal(order[0]);
    }
    this.animalPicks();
    if (!moved) return;
    const i = order.indexOf(moved), live = document.getElementById('animalLive');
    if (live) live.textContent = `${G.Callsigns.of(moved).name}: ${this.ordinal(i + 1)} choice`;
    if (focus) { const b = this.$('colorRow').querySelector<HTMLElement>(`[data-a="${moved}"]`); if (b) b.focus(); }
  },
  // Dragging (pointer events: mouse and touch alike): a ghost of the chip follows the pointer, a marker shows where it lands; a press
  // that doesn't move puts the chip first. Left / Right (Alt or not) move the focused chip a place, Home / End to the front or back.
  bindAnimalRank(row: HTMLElement) {
    let d: { id: string; pid: number; x0: number; y0: number; drag: boolean; ghost: HTMLElement | null; at: number; dx: number; dy: number } | null = null;
    const chips = () => [...row.querySelectorAll<HTMLElement>('.rank-chip')];
    // where it would land: before the first other chip the pointer is ahead of (reading order, rows wrapping), else at the end
    const landing = (x: number, y: number) => {
      const others = chips().filter((c) => c.dataset.a !== d!.id);
      for (let k = 0; k < others.length; k++) { const r = others[k].getBoundingClientRect(); if (y < r.top || (y <= r.bottom && x < r.left + r.width / 2)) return k; }
      return others.length;
    };
    const mark = (k: number) => {
      const others = chips().filter((c) => c.dataset.a !== d!.id);
      others.forEach((c, j) => { c.classList.toggle('ins-before', j === k); c.classList.toggle('ins-after', k === others.length && j === others.length - 1); });
    };
    const end = (drop: boolean) => {
      if (!d) return;
      const cur = d; d = null;
      if (cur.ghost) cur.ghost.remove();
      row.classList.remove('ranking');
      if (!cur.drag) { if (drop) { const o = this.animalOrder.filter((id) => id !== cur.id); this.rankAnimals([cur.id, ...o], cur.id); G.Audio.click && G.Audio.click(); } return; }
      if (!drop) { this.animalPicks(); return; }
      const o = this.animalOrder.filter((id) => id !== cur.id); o.splice(cur.at, 0, cur.id);
      this.rankAnimals(o, cur.id);
    };
    row.addEventListener('pointerdown', (e: PointerEvent) => {
      const b = (e.target as HTMLElement).closest<HTMLElement>('.rank-chip');
      if (!b || e.button !== 0 || d) return;
      const r = b.getBoundingClientRect();
      d = { id: b.dataset.a!, pid: e.pointerId, x0: e.clientX, y0: e.clientY, drag: false, ghost: null, at: 0, dx: e.clientX - r.left, dy: e.clientY - r.top };
      try { row.setPointerCapture(e.pointerId); } catch (err) { /* (a synthetic pointer) */ }
      e.preventDefault();
    });
    row.addEventListener('pointermove', (e: PointerEvent) => {
      if (!d || e.pointerId !== d.pid) return;
      if (!d.drag) {
        if (Math.hypot(e.clientX - d.x0, e.clientY - d.y0) < 6) return;
        const b = row.querySelector<HTMLElement>(`[data-a="${d.id}"]`); if (!b) return;
        d.drag = true; row.classList.add('ranking'); b.classList.add('dragging');
        const g = b.cloneNode(true) as HTMLElement; g.classList.add('rank-ghost'); g.classList.remove('dragging'); g.removeAttribute('data-a');
        g.style.width = b.offsetWidth + 'px'; document.body.appendChild(g); d.ghost = g;
      }
      d.ghost!.style.left = e.clientX - d.dx + 'px'; d.ghost!.style.top = e.clientY - d.dy + 'px';
      d.at = landing(e.clientX, e.clientY); mark(d.at);
    });
    row.addEventListener('pointerup', (e: PointerEvent) => { if (d && e.pointerId === d.pid) end(true); });
    row.addEventListener('pointercancel', () => end(false));
    row.addEventListener('lostpointercapture', () => { if (d && d.drag) end(true); });
    row.addEventListener('click', (e) => { if ((e as MouseEvent).detail === 0) { const b = (e.target as HTMLElement).closest<HTMLElement>('.rank-chip'); if (b) { const o = this.animalOrder.filter((id) => id !== b.dataset.a); this.rankAnimals([b.dataset.a!, ...o], b.dataset.a, true); } } }); // (Enter or Space on a chip: to 1st)
    row.addEventListener('keydown', (e: KeyboardEvent) => {
      const b = (e.target as HTMLElement).closest<HTMLElement>('.rank-chip'); if (!b) return;
      const id = b.dataset.a!, o = this.animalOrder.slice(), i = o.indexOf(id);
      const to = e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? i - 1 : e.key === 'ArrowRight' || e.key === 'ArrowDown' ? i + 1 : e.key === 'Home' ? 0 : e.key === 'End' ? o.length - 1 : -2;
      if (to === -2) return;
      e.preventDefault();
      if (to < 0 || to >= o.length || to === i) return;
      o.splice(i, 1); o.splice(to, 0, id);
      this.rankAnimals(o, id, true);
    });
  },
  // your own arms in first person: sleeves in your top's colour (bare forearms in a T-shirt), your gloves
  applyLook() {
    const L = this.myLook, M = G.GunMaterials && G.GunMaterials.M;
    if (!M) return;
    const SKIN = 0xc89a78;
    M.fabric().color.setHex(L.top === 'tshirt' ? SKIN : L.topC);
    M.glove().color.setHex(({ tactical: 0x1b1c1e, leather: 0x5e3e24, fingerless: 0x1b1c1e } as Record<string, number>)[L.gloves] || SKIN);
  },
  routeHover: (() => {}) as (el: HTMLElement, view?: boolean) => void, // (a route map's hover cards on an element: bindMenu)
  bindMenu() {
    this.bindLook();
    // hovering a node on the route map: its card (js/route.ts tip), beside the pointer, kept on screen
    const tipEl = document.createElement('div'); tipEl.id = 'routeTip'; tipEl.className = 'route-tip ui hidden'; document.body.appendChild(tipEl);
    let tipOn: number | null = null, tipHeld: number | null = null; // (tipHeld: the node a finger tapped, whose card stays up)
    const tipAt = (x: number, y: number) => {
      const w = tipEl.offsetWidth, h = tipEl.offsetHeight, W = window.innerWidth, H = window.innerHeight;
      let tx = x + 18, ty = y + 18;
      if (tx + w > W - 8) tx = x - w - 18;
      if (ty + h > H - 8) ty = y - h - 18;
      tipEl.style.left = Math.max(8, tx) + 'px'; tipEl.style.top = Math.max(8, ty) + 'px';
    };
    // (on the route screen's map, and on the hangar's Tab menu's view of it: js/shop.ts routeHtml)
    this.routeHover = (el: HTMLElement, view = false) => {
    el.addEventListener('pointermove', ((e: PointerEvent) => {
      if (e.pointerType === 'touch') return;
      const g = (e.target as HTMLElement).closest<HTMLElement>('[data-node]');
      if (!g || !this.routeMap || !this.routeSt) { tipEl.classList.add('hidden'); tipOn = null; return; }
      const id = +g.dataset.node!;
      if (id !== tipOn) { tipOn = id; tipEl.innerHTML = G.Route.tip(this.routeMap, id, Object.assign(this.routeTipSt(), { view })); }
      tipEl.classList.remove('hidden');
      tipAt(e.clientX, e.clientY);
    }) as EventListener);
    el.addEventListener('pointerleave', ((e: PointerEvent) => { if (e.pointerType === 'touch') return; tipEl.classList.add('hidden'); tipOn = null; }) as EventListener);
    // a finger has no hovering: the first tap on a node is its card, the second is the click (off the map: the card goes)
    el.addEventListener('click', ((e: MouseEvent) => {
      if (!G.Touch.active()) return;
      const g = (e.target as HTMLElement).closest<HTMLElement>('[data-node]'), id = g ? +g.dataset.node! : null;
      if (id == null || !this.routeMap || !this.routeSt || id === tipHeld) { tipEl.classList.add('hidden'); tipOn = tipHeld = null; return; }
      e.stopPropagation();
      tipOn = tipHeld = id;
      tipEl.innerHTML = G.Pad.text(G.Route.tip(this.routeMap, id, Object.assign(this.routeTipSt(), { view })));
      tipEl.classList.remove('hidden');
      const r = g!.getBoundingClientRect(); tipAt(r.left + r.width / 2, r.top + r.height / 2);
    }) as EventListener, true);
    };
    this.routeHover(this.$('routeMap'));
    this.$('routeMap').addEventListener('click', ((e: GmEvt) => { const g = e.target.closest<HTMLElement>('[data-node]'); if (g) this.pickRoute(+g.dataset.node!); }) as EventListener);
    const name = this.$<HTMLInputElement>('nameInput');
    name.value = this.myName;
    name.addEventListener('input', () => { this.myName = name.value.trim().slice(0, 16) || 'Operator'; G.U.store.set('name', this.myName); if (this._lp && this._lp.rig) this._lp.rig.setCallsign(this.myAnimal, this.myName); });
    const row = this.$('colorRow');
    // your career (js/career.ts), from the menu
    this.$('btnCareer').onclick = () => { this.$('careerBody').innerHTML = G.Career.html(); this.screen('career'); };
    this.$('btnCareerBack').onclick = () => this.screen('menu');
    this.animalPicks();
    this.bindAnimalRank(row);

    const bindRange = (ids: string[], key: GmSetting, fmt: (v: number) => string, apply?: (v: number) => void) => {
      ids.forEach((id) => {
        const el = this.$<HTMLInputElement>(id);
        el.value = this.settings[key] as unknown as string;
        el.addEventListener('input', () => {
          this.settings[key] = +el.value; G.U.store.set(key, +el.value);
          ids.forEach((o) => { if (o !== id) this.$<HTMLInputElement>(o).value = el.value; });
          if (this.$(key + 'Val')) this.$(key + 'Val').textContent = fmt(+el.value);
          if (apply) apply(+el.value);
        });
      });
      if (this.$(key + 'Val')) this.$(key + 'Val').textContent = fmt(this.settings[key]);
    };
    bindRange(['sens', 'sens2'], 'sens', (v) => v.toFixed(2));
    bindRange(['padSens', 'padSens2'], 'padSens', (v) => v.toFixed(2));
    bindRange(['touchSens', 'touchSens2'], 'touchSens', (v) => v.toFixed(2));
    bindRange(['fov', 'fov2'], 'fov', (v) => v + '°');
    bindRange(['vol', 'vol2'], 'vol', (v) => Math.round(v * 100) + '%', (v) => G.Audio.setVolume(v));

    const loadKit = this.$<HTMLSelectElement>('loadKit');
    loadKit.value = String(this.settings.loadKit);
    loadKit.addEventListener('change', () => { this.settings.loadKit = +loadKit.value; G.U.store.set('loadKit', +loadKit.value); if (G.Shop.tab === 'svc') G.Shop.render(); });

    const mute = this.$<HTMLInputElement>('mute');
    mute.checked = G.Audio.muted;
    mute.addEventListener('change', () => this.setMuted(mute.checked));
    this.modelStatus();
    this.$('btnHost').onclick = () => this.needModels(() => this.host());
    this.$('btnSolo').onclick = () => this.needModels(() => this.solo());
    this.$('btnJoin').onclick = () => this.needModels(() => this.join());
    this.$('joinCode').addEventListener('keydown', (e: KeyboardEvent) => { if (e.key === 'Enter') this.needModels(() => this.join()); });
    this.$<HTMLInputElement>('joinCode').value = G.U.store.get('lastCode', ''); // (the last game you joined)
    this.$('btnLan').onclick = () => this.lanScan();
    // a highlights recording (a .zip the hangar's TVs saved) made into a video, here (js/highlights.ts renderPack)
    this.$('btnRender').onclick = () => this.$('hlFile').click();
    this.$('hlFile').onchange = ((e: GmEvt<HTMLInputElement>) => { const f = e.target.files && e.target.files[0]; e.target.value = ''; if (f) this.needModels(() => this.renderHighlights(f)); }) as EventListener;
    this.$('btnRenderStop').onclick = () => G.Highlights.cancelRender();
    // your own relay server, if you have one (used for every connection from now on: js/net.ts opts)
    { const t = G.U.store.get('turn', {}) || {}, save = () => G.U.store.set('turn', { url: this.$<HTMLInputElement>('turnUrl').value.trim(), user: this.$<HTMLInputElement>('turnUser').value.trim(), pass: this.$<HTMLInputElement>('turnPass').value });
      this.$<HTMLInputElement>('turnUrl').value = t.url || ''; this.$<HTMLInputElement>('turnUser').value = t.user || ''; this.$<HTMLInputElement>('turnPass').value = t.pass || '';
      for (const id of ['turnUrl', 'turnUser', 'turnPass']) this.$(id).addEventListener('change', save); }
    // what a host's LAN beacon tells whoever's looking
    G.Net.lanInfo = () => ({ name: this.myName, players: Object.keys(this.roster || {}).length || 1, phase: this.phase });
    this.$('btnStart').onclick = () => { if (G.Net.isHost) { G.Net.toHost({ t: 'finit', f: G.U.store.get('fleet', null) }); G.Net.toHost({ t: 'startRun' }); } }; // (finit: the squad's ships, as this host kept them: js/space.ts)
    this.$('btnLeave').onclick = () => this.toMenu();
    this.$('btnNewCode').onclick = () => this.newCode();
    this.$('btnCopy').onclick = () => { navigator.clipboard && navigator.clipboard.writeText(G.Net.code || ''); this.$('btnCopy').textContent = 'Copied'; setTimeout(() => (this.$('btnCopy').textContent = 'Copy'), 1200); };
    this.$('btnResume').onclick = () => this.lock();
    this.$('btnQuit').onclick = () => this.toMenu();
    this.$('btnProf').onclick = () => { G.Prof.save(); this.$('profLine').textContent = 'Saved: ' + G.Prof.line(); };
    this.$('btnNewRun').onclick = () => { if (G.Net.isHost) G.Net.toHost({ t: 'toLobby' }); };
    this.$('btnMenu').onclick = () => this.toMenu();
    this.$('clickToPlay').onclick = () => this.lock();
    G.R.renderer.domElement.addEventListener('click', () => { if (this.phase === 'level' && (!this.locked || this.softLocked)) this.lock(); });

    document.addEventListener('pointerlockchange', () => this.lockChanged());

    window.addEventListener('keydown', (e) => {
      if (this.phase !== 'level') return;
      if (e.code === 'Escape' && this.softLocked && !this.menuOpen()) { this.unlock(); return; } // (no pointer lock for the browser's own Esc to let go)
      // in the hangar: Esc puts a shop panel away, and Tab is your stash and loadout (the panel's Kit tab), not the field kit
      if (this.hub) {
        if (e.code === 'Escape' && this.shopOpen) { this.closeShop(); return; }
        if (e.code === 'Tab') { e.preventDefault(); if (!this.chatOpen && !e.repeat) { if (this.shopOpen) this.closeShop(); else if (G.Me.seat == null) this.openShop('kit', 'your stash and loadout'); } return; }
      }
      if (e.code === 'Tab') { e.preventDefault(); if (!this.chatOpen && !e.repeat && !(G.Me.out && !this.invOpen)) this.toggleInv(!this.invOpen); return; } // (out cold: nothing to do but wait)
      if (e.code === 'Escape' && this.invOpen) { this.toggleInv(false); return; }
      if (e.code === 'Escape' && this.aboxOpen) { this.aboxHide(); return; }
      if (e.code === 'KeyY' && !this.chatOpen && !e.repeat && !this.hub) this.vote();
      if (e.code === 'Enter' || e.key === 'Enter') { // (a phone's own keyboard has a key but no code)
        const inp = this.$<HTMLInputElement>('chatInput');
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
  openShop(tab?: string, title?: string) {
    if (!this.hub || this.shopOpen) return;
    if (G.Range && G.Range.on()) { G.HUD.toast('THE RANGE', "Your kit stays as it is in here: shop and sort it out once you're back in the hangar", 2); return; } // (js/range.ts puts it back as it was when you leave)
    this.shopOpen = true;
    G.Me.keys = {}; G.Me.mouse.l = G.Me.mouse.r = false;
    G.Shop.tab = tab || 'stock'; G.Shop.title = title || null;
    this.$('pause').classList.add('hidden'); this.$('clickToPlay').classList.add('hidden');
    this.unlock();
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
  setMuted(m: boolean) {
    G.Audio.setMuted(m);
    G.U.store.set('muted', m);
    this.$<HTMLInputElement>('mute').checked = m;
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
  // a panel that takes the mouse is open: the field kit (Tab), the hangar's shop, the chat, the attachments box (no firing)
  menuOpen(): boolean { return !!(this.invOpen || this.shopOpen || this.chatOpen || this.aboxOpen || G.Space.S.uiOpen); },
  toggleInv(open: boolean, opts?: { patient?: string; cab?: number }) {
    if (!!open === !!this.invOpen) return;
    this.invOpen = !!open;
    this.$('fieldInv').classList.toggle('hidden', !open);
    if (open) {
      G.Me.keys = {}; G.Me.mouse.l = G.Me.mouse.r = false;
      this.$('fiScore').innerHTML = G.HUD.scoreboardHTML();
      G.InvUI.show(this.$('fiBody'), { field: true, patient: opts && opts.patient, cab: opts && opts.cab });
      this.$('pause').classList.add('hidden'); this.$('clickToPlay').classList.add('hidden');
      this.unlock();
    } else {
      G.InvUI.hide();
      if (this.phase !== 'level') return;
      this.lock();
      // if the browser wouldn't take the mouse back from a key press, a click will
      setTimeout(() => { if (!this.locked && !this.invOpen && this.phase === 'level') this.$('clickToPlay').classList.remove('hidden'); }, 300);
    }
  },
  // the mouse captured or let go (or the controller's stand-in for that): into the game, or the pause menu
  lockChanged() {
    const real = document.pointerLockElement === G.R.renderer.domElement;
    if (real) this.softLocked = false;
    this.locked = real || this.softLocked;
    // a lock asked for a moment ago (closing a menu, a click) can land after another menu has opened (Tab, Tab):
    // a menu keeps the mouse, so let it straight go again
    if (this.locked && this.menuOpen()) { this.unlock(); return; }
    if (this.phase !== 'level') return;
    if (this.locked) { this.$('pause').classList.add('hidden'); this.$('clickToPlay').classList.add('hidden'); }
    else if (!this.menuOpen()) { this.$('pause').classList.remove('hidden'); this.$('pauseCode').textContent = G.Net.code ? 'Room code: ' + G.Net.code : ''; if (G.Prof) this.$('profLine').textContent = G.Prof.line(); }
  },
  unlock() {
    if (this.softLocked) { this.softLocked = false; this.lockChanged(); }
    if (document.pointerLockElement) document.exitPointerLock();
  },
  lock() {
    G.Audio.init();
    if (G.Pad.active() || G.Touch.active()) { if (!this.locked) { this.softLocked = true; this.lockChanged(); } return; }
    const c = G.R.renderer.domElement;
    try {
      const p = c.requestPointerLock({ unadjustedMovement: true });
      if (p && p.catch) p.catch(() => { try { c.requestPointerLock(); } catch (e) { /* ignore */ } });
    } catch (e) { try { c.requestPointerLock(); } catch (e2) { /* ignore */ } }
  },
  // The game's models are ONE bundle that downloads from the moment the page loads (js/modelbundles.ts), beside the menu. The menu is usable at once; what
  // enters the game (host, solo, join, the highlights video) waits for the models, and goes on by itself when they are in. A failed download (after its own
  // retries) says so, with a Retry button: there is no partial play.
  waitingModels: null as null | (() => void),
  modelStatus() {
    const box = this.$('modelLoad'), txt = this.$('modelTxt'), bar = this.$('modelBar'), retry = this.$('modelRetry');
    const mb = (n: number) => (n / 1048576).toFixed(1);
    const upd = (s: ReturnType<typeof G.Bundles.state>) => {
      box.classList.toggle('bad', s.phase === 'failed'); retry.classList.toggle('hidden', s.phase !== 'failed');
      if (s.phase === 'ready') {
        txt.textContent = 'Models ready'; (bar as HTMLElement).style.width = '100%'; (bar.parentElement as HTMLElement).classList.add('hidden'); box.classList.add('ok');
        setTimeout(() => box.classList.add('gone'), 2500);
        const go = this.waitingModels; this.waitingModels = null;
        if (go) { this.msg('menuMsg', ''); go(); }
      } else if (s.phase === 'failed') {
        txt.textContent = "Could not download the game's models (" + (s.error || 'network error') + '). Check your connection and retry.';
        if (this.waitingModels) { this.waitingModels = null; this.msg('menuMsg', 'The models did not download: press Retry.', true); }
      } else {
        const pct = s.total ? Math.min(100, Math.round((s.loaded / s.total) * 100)) : 0;
        (bar as HTMLElement).style.width = pct + '%'; (bar.parentElement as HTMLElement).classList.remove('hidden');
        txt.textContent = 'Downloading models ' + (s.total ? mb(s.loaded) + ' / ' + mb(s.total) + ' MB' : '...');
      }
    };
    G.Bundles.onChange(upd); upd(G.Bundles.state());
    retry.onclick = () => { G.Bundles.start(); upd(G.Bundles.state()); };
  },
  /** Runs fn now if the models are in; otherwise when they arrive (the menu says so meanwhile). */
  needModels(fn0: () => void) {
    const s = G.Bundles.state(), fn = () => { G.Hangar.load().then(() => fn0()); }; // (and the hangar's scene parsed: a few hundred ms after the bundle; js/hangar.ts)
    if (s.phase === 'ready') { fn(); return; }
    this.waitingModels = fn; this.msg('menuMsg', 'Waiting for the models to finish downloading...');
    if (s.phase === 'failed' || s.phase === 'idle') G.Bundles.start();
  },
  msg(id: string, text: string, err?: boolean) { const el = this.$(id); el.textContent = text; el.classList.toggle('err', !!err); },

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
    const code = this.$<HTMLInputElement>('joinCode').value.trim().toUpperCase();
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
  // Look for games hosted on this network (js/net.ts lanScan) and list them: click one to join it
  lanScan() {
    const list = this.$('lanList'), btn = this.$<HTMLButtonElement>('btnLan');
    btn.disabled = true; btn.textContent = 'Looking...'; list.innerHTML = '';
    G.Net.lanScan().then((games) => {
      btn.disabled = false; btn.textContent = 'Find LAN games';
      if (games == null) { list.innerHTML = '<small class="dim">Could not tell which network you are on (offline, or WebRTC blocked).</small>'; return; }
      if (!games.length) { list.innerHTML = '<small class="dim">No games hosted on your network.</small>'; return; }
      const PH: Record<string, string> = { lobby: 'in the lobby', route: 'picking a route', level: 'mid-level', shop: 'in the shop' };
      list.innerHTML = games.map((g) => `<button class="btn small lan-game" data-code="${G.U.esc(g.code)}"><b>${G.U.esc(g.name)}</b> · ${g.players} in squad${PH[g.phase] ? ' · ' + PH[g.phase] : ''} <span class="dim">${G.U.esc(g.code)}</span></button>`).join('');
      list.querySelectorAll<HTMLElement>('[data-code]').forEach((b: HTMLElement) => (b.onclick = () => { this.$<HTMLInputElement>('joinCode').value = b.dataset.code!; this.join(); }));
    });
  },
  rejoin(code: string | null, until: number) {
    if (!code || this.phase !== 'menu' || G.Net.peer || Date.now() > until) { if (this.phase === 'menu' && !G.Net.peer && code) this.msg('menuMsg', 'Lost connection to the host.', true); return; }
    this.$<HTMLInputElement>('joinCode').value = code;
    G.Net.join(code, (err) => {
      if (!err) { this.afterConnect(); return; }
      G.Net.leave();
      if (this.phase === 'menu') { this.msg('menuMsg', 'Lost connection to the host. Reconnecting...'); setTimeout(() => this.rejoin(code, until), 3000); }
    });
  },
  async renderHighlights(file: File) {
    const msg = this.$('hlMsg'), btn = this.$<HTMLButtonElement>('btnRender'), stop = this.$('btnRenderStop'), bar = this.$('hlBar'), prog = bar.parentElement!;
    btn.disabled = true; stop.classList.remove('hidden'); prog.classList.remove('hidden'); bar.style.width = '0%'; msg.classList.remove('bad');
    try {
      await G.Highlights.renderPack(file, (t, p) => { msg.textContent = t; if (p != null) bar.style.width = Math.round(p * 100) + '%'; });
    } catch (e: any) {
      const why = (e && e.message) || String(e);
      msg.textContent = why === 'cancelled' ? 'Cancelled' : 'The video couldn\'t be made: ' + why; msg.classList.toggle('bad', why !== 'cancelled');
      if (why !== 'cancelled') console.warn('highlights: rendering failed', e);
    }
    btn.disabled = false; stop.classList.add('hidden'); prog.classList.add('hidden');
  },
  setBusy(b: boolean) { ['btnHost', 'btnSolo', 'btnJoin'].forEach((id) => (this.$<HTMLButtonElement>(id).disabled = b)); },
  afterConnect() {
    this.msg('menuMsg', '');
    if (G.Net.isHost) G.ServerLink.start(G.Net.myId!); // (a session of the simulation, as everyone starts hosting it)
    if (G.Net.isHost && !G.Net.solo) G.Net.startBeacon(); // (findable from the same network)
    G.Me.newRun();
    this.runStarted = false;
    // (anon: you're a cloud saves guest, for the GUEST mark: js/server.ts hello)
    // (prefs: every animal, your order, walked by the host; animal, the first, for a host before them)
    G.Net.toHost({ t: 'hello', name: this.myName, animal: this.prefAnimals[0], prefs: this.prefAnimals.slice(), look: this.myLook, ...(G.Cloud.guest() ? { anon: 1 } : {}) });
  },
  toMenu(reason?: string) {
    if (G.Career.run) G.Career.runEnd('left'); // (a run you walked out of, or lost the host in)
    G.Net.leave();
    G.ServerLink.stop();
    G.Views.clearAll();
    G.Space.reset();
    this.leaveHub();
    G.R.clearLevel();
    G.R.setViewmodel(null);
    this.map = null;
    this.phase = 'menu';
    this.setAnimal(this.prefAnimals[0]); // (back to yours: the host's pick was for that session)
    this.unlock();
    this.veil(false, true);
    this.screen('menu');
    this.menuBackdrop();
    this.msg('menuMsg', reason || '', !!reason);
  },
  // a slowly rotating level behind the main menu
  // At page start it is built after the first paint, in two tasks (the level's plan, then its meshes and light grid: ~40 and ~230 ms), so the page answers
  // in between instead of freezing for the ~300 ms both took inside init(); a host / solo / join that gets in first simply wins.
  menuBackdropSoon() {
    // It also lets the models in first (they are what the game needs; the backdrop is decoration): it waits for the bundle to be in memory, 1.2 s at most, because
    // unpacking it is a few small tasks that would otherwise queue behind the backdrop's one long one.
    let started = false;
    const go = () => {
      if (started) return; started = true;
      setTimeout(() => {
        if (this.map) return;
        const map = G.Level.generate(1234, 3);
        setTimeout(() => { if (this.map) return; this.map = this.backdropMap = map; G.R.setLevel(map); this.backdropT = 0; }, 0);
      }, 0);
    };
    requestAnimationFrame(() => {
      if (G.Bundles.state().phase !== 'loading') return go();
      G.Bundles.onChange((s) => { if (s.phase !== 'loading') go(); });
      setTimeout(go, 1200);
    });
  },
  // What's behind the menus before a run's first level: the main menu's guns (js/menushow.ts) on the menu, in the lobby and on
  // the first route (the hangar's behind a later one), not the slowly turning level. That level is only drawn when the guns
  // aren't up yet (their models still coming), so its shaders aren't compiled on the spot the first time a menu shows it.
  showcaseBehind() {
    const p = this.phase;
    return !!G.MenuShow && (p === 'menu' || p === 'lobby' || (p === 'route' && (!this.map || this.map === this.backdropMap)));
  },
  menuBackdrop() {
    this.map = this.backdropMap = G.Level.generate(1234, 3);
    G.R.setLevel(this.map);
    this.backdropT = 0;
  },

  // ------------------------------------------------------------- messages
  onMsg(m: any) { // (m: straight off the wire, so as dynamic as the host's word: its kind is checked, below)
    switch (m.t as GmMsgKind) {
      case 'welcome':
        G.Stickers.joined(m.skins); // (the stickers on the squad's guns: js/stickers.ts)
        this.roster = m.roster;
        if (this.roster[G.Net.myId!]) this.setAnimal(this.roster[G.Net.myId!].animal);
        G.Views.syncRoster(this.roster);
        if (m.route) this.setRoute(m.route);
        if ((m.phase === 'route' || m.phase === 'level' || m.phase === 'shop') && !G.Career.run) G.Career.runStart(m.level || 1); // (joined a run already going: yours from here)
        G.Career.squad(Object.keys(this.roster).length);
        if (m.phase === 'route') (this.enterRoute as (level: number, route?: unknown) => void)(m.level, m.route);
        else if (m.phase === 'level') {
          this.enterLevel(m.level, m.seed, m.th, !!m.night, m.wc, m.sp);
          if (m.doors) m.doors.forEach((o: number, i: number) => { const d = this.map!.doors[i]; if (d && d.open !== !!o) { d.open = !!o; G.World.door(this.map!.world, this.map!, d); } });
          if (m.holes) for (const h of m.holes) G.Damage.apply(this.map as unknown as GmDmgMap, h); // (what's been shot out of the place)
          if (m.fallen) for (const [i, ang, dir, seed] of m.fallen) G.Damage.fall(this.map as unknown as GmDmgMap, this.map!.doors[i] as any, ang, dir, seed, true);
          if (m.evidence) m.evidence.forEach(([i, wpn, x, z, sec, y]: [number, string, number, number, number, number]) => { G.Views.addEvidence(i, wpn, x, z, y); if (sec) G.Views.secureEvidence(i); });
          if (m.bodies) m.bodies.forEach(([id, type, x, z, yaw, sec, y]: [number, string, number, number, number, number, number]) => G.Views.addBody(id, type, x, z, yaw, sec, y));
          this.setCase(m.wcase); this.abox = m.abox || null; this.sbox = m.sbox || null;
          this.cabs = m.cabs || []; G.Views.syncCabs();
          G.Loot.clear(); for (const a of m.loot || []) G.Loot.add(...(a as [any, any, any, any, any, any, any]));
          for (const id of m.glass || []) G.Views.breakGlass(id); // windows already broken when we joined
          for (const [id, p] of m.cracked || []) G.Views.crackGlass(id, new THREE.Vector3(...p));
        } else if (m.phase === 'shop') this.enterShop(m.level, m.shopSeed, null, m.stock, m.sp);
        else this.enterLobby();
        break;
      case 'roster': {
        // someone else just readied up: a chime and a line saying so
        const prev = this.roster || {};
        this.roster = m.roster;
        if (this.roster[G.Net.myId!]) this.setAnimal(this.roster[G.Net.myId!].animal); // (yours was taken: the host's pick)
        for (const [id, r] of Object.entries(this.roster)) if (id !== G.Net.myId && r.ready && prev[id] && !prev[id].ready) this.readyNote(r);
        G.Views.syncRoster(this.roster);
        G.Career.squad(Object.keys(this.roster).length);
        if (this.phase === 'lobby') this.renderLobby();
        if (this.hub) { G.Shop.render(); G.Hangar.refresh(); }
        if (this.phase === 'route') this.renderRoute();
        break;
      }
      case 'arms': this.arms = m.a || {}; if (this.phase === 'route') { this.sidearmPick(); this.renderRoute(); } break;
      case 'rvotes': if (this.routeSt) { this.routeSt.votes = m.v || {}; if (this.phase === 'route') this.renderRoute(); } break;
      case 'newrun':
        G.Career.runStart(); // (your career's record of it: js/career.ts)
        this.tGrid = null; this.arms = {}; this.armSel = null;
        G.Me.newRun();
            break;
      case 'veil': G.Space.veilKind(m.k); this.veil(true); break; // (k 'ftl': a jump's light, not the black panel: js/spaceui.ts)
      case 'phase':
        if (m.route) this.setRoute(m.route);
        if (m.phase === 'route') (this.enterRoute as (level: number, route?: unknown) => void)(m.level, m.route);
        else if (m.phase === 'level') { this.aboxHide(); this.enterLevel(m.level, m.seed, m.th, !!m.night, m.wc, m.sp); this.setCase(m.wcase); this.abox = m.abox || null; this.sbox = m.sbox || null; this.cabs = m.cabs || []; G.Views.syncCabs(); }
        else if (m.phase === 'shop') this.enterShop(m.level, m.shopSeed, m.report, m.stock, m.sp);
        else if (m.phase === 'gameover') this.enterGameover(m);
        else if (m.phase === 'lobby') this.enterLobby();
        break;
      case 'snap': if (this.phase === 'level') G.Views.applySnap(m); break;
      case 'rfx': if (this.phase === 'level') G.Views.roundFx(m.a); break;
      case 'bstk': if (this.phase === 'level') G.Bolts.fromNet(m); break;
      case 'hole': if (this.phase === 'level') for (const h of m.a || []) G.Damage.apply(this.map as unknown as GmDmgMap, h); break;
      case 'dpart': if (this.phase === 'level' && this.map!.doors[m.i]) G.Damage.partGone(this.map as unknown as GmDmgMap, this.map!.doors[m.i] as any, m.pt); break;
      case 'dfall': { // (shot off its hinges)
        const d = this.map && this.phase === 'level' ? this.map.doors[m.i] : null;
        if (!d) break;
        if (G.Highlights) G.Highlights.door(m.i, 1 as unknown as boolean, 0 as unknown as boolean, m.f);
        G.Damage.fall(this.map as unknown as GmDmgMap, d as any, ...(m.f as [any, any, any, any]));
        break;
      }
      case 'rpath': for (const [i, path] of m.ps || []) { const s = G.Highlights && G.Highlights.roundPath(m.k, m.sid, i, path), def = s && (G.WEAPONS[s.code] || G.Gunsmith.fromCode(s.code)); if (G.ShotLog) G.ShotLog.keep(path, { holder: G.ShotLog.remote(m.k, m.sid), name: def ? def.name : '' }); } break;
      case 'npath': if (G.Highlights) G.Highlights.fragPaths(m.s, m.ps); break; // (a squadmate's grenade: its chips that hit someone, for the replays)
      case 'skin': G.Stickers.learn(m.h, m.l); break; // (a gun's stickers, by their hash: js/stickers.ts)
      // a first aid cabinet opened, emptied a bit, or put back into
      // things lying about: put down, picked up, and what you picked up
      case 'loot': if (this.phase === 'level') for (const a of m.a || []) G.Loot.add(...(a as [any, any, any, any, any, any, any])); break;
      case 'lootRm': G.Loot.remove(m.id); break;
      case 'glass': if (this.phase === 'level') for (const id of m.ids || []) G.Views.breakGlass(id); break;
      case 'crack': if (this.phase === 'level') G.Views.crackGlass(m.id, new THREE.Vector3(...m.p)); break;
      case 'lootGot': G.Me.lootGot(m.item, m.x, m.z, m.at); break;
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
      // the sticker box opened: the sticker's whoever's opened it (yours: into your collection, js/stickers.ts)
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
          else { const pt = G.Gunsmith.PARTS[m.got]; if (pt) G.HUD.feed(`<b>${G.U.esc(this.nameOf(m.by))}</b> took the ${G.U.esc(pt.name!)} from the attachments box`); }
        }
        break;
      }
      case 'wcase':
        this.setCase(m.c);
        break;
      case 'eshot': if (this.phase === 'level') G.Views.enemyShot(m); break;
      case 'eround': if (this.phase === 'level' && G.Net.isHost) G.Me.enemyRounds(m); break; // (the host's: a suspect's rounds, flown here)
      case 'eInfo': G.HUD.eInfoGot(m); break; // (the host's: the F9 readout's look at a suspect)
      case 'shot': if (this.phase === 'level' && m.id !== G.Net.myId) G.Views.remoteShot(m); break;
      case 'nade': if (this.phase === 'level' && m.id !== G.Net.myId) { G.Views.addNade(new THREE.Vector3(...m.p), new THREE.Vector3(...m.v), m.fuse, false, !!m.en, m.k || 'frag'); if (G.Highlights) G.Highlights.nade(m.en ? 'e' + m.e : 'p' + m.id, new THREE.Vector3(...m.p), new THREE.Vector3(...m.v), m.fuse, m.k || 'frag'); const tp = !m.en && G.Views.players.get(m.id); if (tp) tp.rig.throwNade(m.s == null ? 2 : m.s); /* (their arm throws it) */ if (m.en) G.Views.enemyThrow(m.e); } break;
      case 'boom': this.onBoom(m); break;
      case 'course': if (G.Course) G.Course.setCourse(m.seed); break;
      case 'crun': if (G.Course && m.s) G.Course.remoteRun(Object.assign({}, m.s, { who: m.by || m.s.who })); break;
      case 'flash': this.onFlash(m); break;
      case 'kill': this.onKill(m); break;
      case 'incap': this.onIncap(m); break; // (a suspect down for good: counted as one incapacitated)
      case 'edown': if (G.Highlights) G.Highlights.suspectDown(m); break; // (a suspect down for good: js/highlights.ts)
      case 'saved': if (G.Highlights) G.Highlights.saved(m); break; // (an officer's armour stopped rounds: js/highlights.ts)
      case 'stock': G.Shop.setStock(m.s); break; // (the store's shared stock: js/shop.ts)
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
        if (m.by === G.Net.myId && m.tg !== G.Net.myId) G.Career.ev('revive');
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
        G.World.door(this.map!.world, this.map!, d);
        this.map!.doorVer = (this.map!.doorVer || 0) + 1; // echo paths change
        const dd = G.R.camera.position.distanceTo(new THREE.Vector3(d.x, 1.2, d.z));
        if (m.k) {
          G.Audio.kick(dd);
          const piv = this.map!.doorMeshes && this.map!.doorMeshes[m.i];
          if (piv) { piv.userData.ang = 0.75; piv.userData.rate = 16; } // slammed: most of the swing happens at once
        } else {
          const piv = this.map!.doorMeshes && this.map!.doorMeshes[m.i];
          if (piv) piv.userData.rate = d.open ? 2.6 : 5; // pushed open gently, pulled shut a bit quicker
        }
        if (!m.k) G.Audio.sampleAt(d.open ? 'door_open' : 'door_close', new THREE.Vector3(d.x, (d.fy || 0) + 1.1, d.z), 0.6, 1); // from the door (at its handle, on its own floor)
        break;
      }
      case 'order': if (m.id !== G.Net.myId) G.Audio.order(this.playerPos(m.id)!); break;
      case 'radio': { const ev = G.Views.enemies.get(m.e); G.Audio.radio(ev ? ev.pos : null); break; }
      case 'shout': {
        if (m.id !== G.Net.myId) G.Audio.shout(this.playerPos(m.id)!);
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
          G.Career.ev('evidence', cr);
          G.HUD.feed(`<span class="cr">+¢${cr}</span>`);
          G.Audio.pickup();
        }
        break;
      }
      case 'cuffed': {
        const def = (G.ENEMIES as Record<string, any>)[m.ty];
        const ev = G.Views.enemies.get(m.e);
        if (m.body) {
          if (ev) { ev.bodySecured = true; ev.rig.zip(!m.civ); }
          G.HUD.feed(`<b>${G.U.esc(this.nameOf(m.by))}</b> ${m.civ ? 'reported a civilian casualty' : 'secured a body'}`);
          if (m.by === G.Net.myId && m.cr > 0) {
            const cr = m.cr;
            G.Me.credits += cr;
            G.Career.ev('body', cr);
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
          G.Career.ev(m.civ ? 'rescue' : m.dn ? 'body' : 'arrest', cr); // (one secured where they lay was counted when they went down)
          G.HUD.feed(`<span class="cr">+¢${cr}</span>`);
          G.Audio.pickup();
        }
        break;
      }
      case 'refund':
        G.Me.credits += m.amt;
        if (this.hub) G.Shop.render();
        break;
      default: G.Space.onMsg(m); // (the missions board, the ship, a mission's own things: js/space.ts)
    }
  },
  playerPos(id: string) {
    const pv = G.Views.players.get(id);
    return pv ? pv.pos.clone().setY(1.6) : null;
  },
  nameOf(id: string): string { return id === G.Net.myId ? this.myName : this.roster[id] ? this.roster[id].name : '???'; },
  readyNote(r: { name: string }) {
    G.Audio.tone(660, 0.08, 'sine', 0.09); G.Audio.tone(990, 0.12, 'sine', 0.09, undefined, 0.09); // (a rising two-note chime)
    G.HUD.chat(null, 0, `${r.name} is ready`);
    this.lobbyChat(`${r.name} is ready`);
  },
  lobbyChat(text: string) {
    const el = this.phase === 'lobby' ? this.$('lobbyMsg') : this.$('vendorQuip');
    if (this.phase === 'lobby') el.textContent = text;
  },

  onBoom(m: any) {
    if (this.phase !== 'level') return;
    const p = new THREE.Vector3(m.p[0], m.p[1], m.p[2]);
    if (m.tb) { // a thermobaric: the same fireball on every screen, from where it went off (the thrower's drew its own as it went)
      const Me = G.Me, M = Me.tbModel(this.map!, p);
      if (m.id !== G.Net.myId) { G.R.fireball(M); G.Audio.thermobaric(G.R.camera.position.distanceTo(p)); if (G.ShotLog) G.ShotLog.keepFill(M, null, m.en ? "Suspect's thermobaric" : 'Thermobaric'); }
      if (m.s && G.Highlights) G.Highlights.boom(m.en ? null : 'p' + m.id, p, m.s, 'tb');
      Me.tbOnMe(M, !m.en);
      return;
    }
    if (m.id !== G.Net.myId) { G.R.explosion(p, m.r); G.Audio.boom(G.R.camera.position.distanceTo(p)); }
    if (m.fr && m.s && G.Highlights) G.Highlights.boom(m.en ? null : 'p' + m.id, p, m.s); // (a frag's burst, for the replays: yours is kept as it went off)
    const Me = G.Me;
    if (m.fr && m.id !== G.Net.myId && Me.pos && Math.hypot(Me.pos.x - p.x, Me.pos.z - p.z) < Me.FRAG.RANGE) {
      // A frag grenade: a suspect's, its chips flown here for you alone (if you're up); anyone else's (a teammate's: its
      // wounds are theirs to work out), flown against the walls only, from its seed, to leave the same pocks and scorch.
      if (m.en && !Me.down && !Me.dead) Me.fragBurst(p, 1, m.s); else Me.fragBurst(p, undefined, m.s, true);
    }
    if (!Me.pos || Me.down || Me.dead) return;
    const cy = Me.pos.y + 1.0, d = Math.hypot(Me.pos.x - p.x, cy - p.y, Me.pos.z - p.z);
    if (d < m.r && G.Level.los(this.map!, p.x, p.y + 0.2, p.z, Me.pos.x, cy, Me.pos.z)) {
      Me.takeDamage(m.d * (1 - (d / m.r) * 0.6) * (m.en ? 1 : 0.4), p); // friendly blasts do 40%
    }
  },
  // A flashbang went off (the host's word: everyone hears and sees it). On you: blinded by how close it was, and
  // how squarely you were looking at it (with it out of sight, not at all); deafened by how close, wall or no wall.
  onFlash(m: any) {
    if (this.phase !== 'level' || !Array.isArray(m.p)) return;
    const p = new THREE.Vector3(m.p[0], m.p[1], m.p[2]), cam = G.R.camera, eye = cam.position, d = eye.distanceTo(p);
    G.R.flashAt(p);
    G.Audio.flashbang(d);
    if (G.Highlights) G.Highlights.flash(m); // (for the replays of the kills of those it blinds)
    const Me = G.Me;
    if (!Me.pos || (Me.dead && !Me.spectating)) return; // (dead, on someone's helmet cam: it's them it blinds and deafens, as you see and hear it)
    const seen = G.Level.los(this.map!, p.x, p.y, p.z, eye.x, eye.y, eye.z);
    const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(cam.quaternion), to = p.clone().sub(eye).normalize(), look = fwd.dot(to);
    const near = G.U.clamp(1 - d / 16, 0, 1), blind = seen ? near * (look > 0.5 ? 1 : look > 0 ? 0.65 : 0.3) : 0;
    const deaf = G.U.clamp(1 - d / 22, 0, 1) * (seen ? 1 : 0.6);
    if (blind > 0.03) G.HUD.flash(blind);
    if (deaf > 0.03) G.Audio.deafen(deaf);
    // through night vision: the tubes whited out by the glare, the room's if not the flash itself (js/render.ts flashOver)
    G.R.flashOver(G.U.clamp(1.25 - d / 24, 0, 1) * (seen ? (look > 0 ? 1 : 0.7) : 0.45));
  },
  onKill(m: any) {
    if (this.phase !== 'level') return;
    G.Views.kill(m);
    if (G.Highlights) G.Highlights.kill(m);
    if (m.inc) { // (down already: counted then, js/server.ts incapacitate)
      const def = (G.ENEMIES as Record<string, any>)[m.ty];
      if (m.bo || m.cz) G.HUD.feed(`<span class="dim">${def ? def.name : 'Suspect'} ${m.cz === 'burns' ? 'died of burns' : m.cz === 'blast' ? 'died of blast lung' : 'bled out'}</span>`);
      return;
    }
    this.credit(m, 'kill');
  },
  // A suspect incapacitated (down for good): counted now, the same as a kill
  onIncap(m: any) {
    if (this.phase !== 'level') return;
    if (G.Highlights) G.Highlights.incap(m);
    this.credit(m, 'incap');
  },
  // the feed and, for whoever did it, the credits and their tally: a kill, or a suspect incapacitated
  credit(m: any, kind: 'kill' | 'incap' = 'kill') {
    const Me = G.Me, def = (G.ENEMIES as Record<string, any>)[m.ty];
    const killer = this.nameOf(m.by);
    const kc = m.by === G.Net.myId ? '#ffd24a' : this.roster[m.by] ? G.U.hex(this.roster[m.by].color) : '#fff';
    G.HUD.feed(`<b style="color:${kc}">${G.U.esc(killer)}</b> ${m.h ? '<span class="hs">⌖</span>' : '✕'} ${def ? def.name : 'hostile'}`);
    if (m.why) {
      // a civilian, or someone who had already surrendered: that costs whoever pulled the trigger
      G.HUD.feed(`<span class="bad">${m.why === 'civ' ? 'CIVILIAN KILLED' : 'UNAUTHORISED FORCE'}</span>`);
      if (m.by === G.Net.myId) {
        Me.credits = Math.max(0, Me.credits + m.cr);
        G.Career.ev(m.why === 'civ' ? 'civ' : 'unauth', m.cr);
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
      G.Career.ev(kind, cr, !!m.h); // (your career: js/career.ts)
      G.HUD.feed(`<span class="cr">+¢${cr}</span>`);
    }
  },

  // ------------------------------------------------------------- phases
  enterLobby() {
    this.toggleInv(false);
    G.Space.reset();
    this.leaveHub();
    this.phase = 'lobby';
    this.unlock();
    G.Views.clearLevel();
    if (!this.map && !(G.MenuShow && G.MenuShow.live)) this.menuBackdrop(); // (the menu's guns go on behind the lobby too: showcaseBehind; the level's only built for it if they're not up yet)
    this.screen('lobby');
    this.renderLobby();
  },
  renderLobby() {
    this.$('codeBlock').classList.toggle('hidden', !G.Net.code);
    this.$('lobbyCode').textContent = G.Net.code || '';
    let html = '';
    for (const [id, p] of Object.entries(this.roster)) {
      html += `<div class="lp">${G.Callsigns.html(p.animal)}<span style="color:${G.U.hex(p.color)}">${G.U.esc(p.name)}</span>${this.guestMark(id)}${p.host ? ' <small>HOST</small>' : ''}${id === G.Net.myId ? ' <small>YOU</small>' : ''}</div>`;
    }
    this.$('lobbyPlayers').innerHTML = html;
    this.animalNote();
    this.$('btnStart').classList.toggle('hidden', !G.Net.isHost);
    this.$('btnNewCode').classList.toggle('hidden', !G.Net.isHost || G.Net.solo); // (the host's: a fresh code)
    if (!G.Net.isHost) this.$('lobbyMsg').textContent = 'Waiting for the host to deploy...';
    else if (G.Net.solo) this.$('lobbyMsg').textContent = 'Solo run. Enemy count and health scale with squad size.';
    else this.$('lobbyMsg').textContent = 'Share the code. Friends can also join between levels.';
  },
  // the guns this level's suspects could be carrying (its gear tier and one either side)
  enemyGuns(level: number) {
    const t = G.gearTier(level), out = new Set<string>();
    for (const pools of Object.values(G.ENEMY_GEAR.weapons)) for (let i = Math.max(1, t - 1); i <= Math.min(4, t + 1); i++) pools[i - 1].forEach((w) => out.add(w));
    return [...out];
  },
  // whether the level's weapon case has been opened
  setCase(open: boolean) {
    this.caseOpen = !!open;
    G.Views.syncCase();
  },
  // ------------------------------------------------------------- the attachments box
  // One use each (this.abox: [open, { player id: [their three part ids, the one they took] }]): your three, as three
  // wheels. The first time you look, each spins through attachments for the weapon in your hands till you stop it,
  // slows and lands on what the host rolled (the result's the host's: stopping only shows it); looking again, they've
  // landed. A landed one can be fitted straight to the weapon in your hands (if it goes on it as it's built) or carried:
  // one of your three.
  aboxMine() { return this.abox && this.abox[1] && this.abox[1][G.Net.myId!] || null; },
  aboxShow(spin: boolean) {
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
      for (const wh of this.aboxUI.wheels as GmWheel[]) {
        const one: string[] = []; for (let i = 0; i < R.M; i++) one.push(live[(Math.random() * live.length) | 0]);
        wh.strip = one.concat(one, one); wh.off = Math.random() * R.M * R.H;
      }
    }
    this.aboxOpen = true;
    G.Me.keys = {}; G.Me.mouse.l = G.Me.mouse.r = false;
    this.$('pause').classList.add('hidden'); this.$('clickToPlay').classList.add('hidden');
    this.unlock();
    const el = this.$('aboxPick');
    el.classList.remove('hidden');
    if (!el.dataset.bound) { el.dataset.bound = 1 as unknown as string; el.addEventListener('click', ((e: GmEvt) => this.aboxClick(e)) as EventListener); el.addEventListener('mouseover', ((e: GmEvt) => this.aboxHover(e)) as EventListener); }
    this.aboxRender();
    cancelAnimationFrame(this.aboxRaf); this.aboxT = 0;
    if (this.aboxUI.wheels.some((wh: GmWheel) => !wh.landed)) this.aboxRaf = requestAnimationFrame((t) => this.aboxSpin(t));
    if (spin) G.Audio.click();
  },
  // a reel: faces H px tall, M to a turn, scrolling down at V px/s, the window WH tall (the faces either side peek in);
  // a stop eases out over the next few faces, starting at the reel's own speed
  REEL: { H: 132, M: 10, V: 1100, WH: 176 },
  aboxHide() {
    cancelAnimationFrame(this.aboxRaf);
    if (!this.aboxOpen) return;
    this.aboxOpen = false;
    this.$('aboxPick').classList.add('hidden');
    if (this.phase !== 'level' || this.invOpen) return;
    this.lock();
    setTimeout(() => { if (!this.locked && !this.invOpen && !this.aboxOpen && this.phase === 'level') this.$('clickToPlay').classList.remove('hidden'); }, 300);
  },
  // a part's face in a wheel: its picture, its name, the slot it goes in
  aboxFace(pid: string) {
    const GS = G.Gunsmith, p = GS.PARTS[pid], it = G.Gear.partItem(pid), [cw, ch] = G.Gear.size(it);
    this.aboxIcons = this.aboxIcons || {};
    const img = this.aboxIcons[pid] || (this.aboxIcons[pid] = G.Icons.of(it, cw, ch, false));
    return `<img src="${img}" alt=""><b>${G.U.esc(p ? p.name! : pid)}</b><small>${G.U.esc(p ? GS.SLOT_LABEL[p.slot] || p.slot : '')}</small>`;
  },
  // which slot of the weapon in your hands a part goes straight into (as it's built), or null
  aboxSlot(pid: string) {
    const GS = G.Gunsmith, p = GS.PARTS[pid], w = G.Me.cur();
    return p && w ? GS.slotsOf(w.def.id, w.def.build).find((sl: ReturnType<typeof GS.slotsOf>[number]) => GS.fitsSlot(sl, p, w.def.id, w.def.build)) || null : null;
  },
  aboxRender() {
    const el = this.$('aboxPick'), mine = this.aboxMine(), ui: GmAboxUI | undefined = this.aboxUI;
    if (!el || !mine || !ui) return;
    const w = G.Me.cur(), taken = mine[1], spinning = ui.wheels.some((wh) => !wh.landed);
    const card = (pid: string, i: number) => {
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
  aboxHover(e: GmEvt) {
    const card = e.target.closest<HTMLElement>('[data-wheel]'), mine = this.aboxMine(), ui: GmAboxUI | undefined = this.aboxUI;
    if (!card || !mine || !ui) return;
    const i = +card.dataset.wheel!, pid = ui.wheels[i] && ui.wheels[i].landed ? mine[0][i] : null;
    if (!pid || pid === ui.hover) return;
    ui.hover = pid;
    const box = this.$('aboxPick').querySelector('.abox-stats'); if (box) box.innerHTML = this.aboxStatsFor(pid); // (the box is drawn afresh as its wheels land: not a kept element)
  },
  aboxStatsFor(pid: string | undefined) {
    const GS = G.Gunsmith, p = pid && GS.PARTS[pid], w = G.Me.cur();
    if (!p || !w) return '<p class="abox-hint">Hover over a pick to see what it does to your gun.</p>';
    const fx = G.GunsmithUI.partEffects(p, w.def.id), sl = this.aboxSlot(pid), name = G.U.esc(w.def.name);
    if (!sl) return `<h4>${G.U.esc(p.name!)}</h4><div class="gs-pe">${fx || ''}</div><p class="abox-hint">Doesn't fit your ${name} as it's built: it goes in your inventory.</p>`;
    const build = Object.assign({}, w.def.build), off = build[sl.slot];
    build[sl.slot] = pid; GS.prune(w.def.id, build);
    if (GS.convert(w.def.id, build)) return `<h4>${G.U.esc(p.name!)}</h4><p class="abox-hint">Fitted, it makes your ${name} into another gun.</p>`;
    const after = GS.compile(w.def.id, build), was = off && GS.PARTS[off];
    return `<h4>Fitted to your ${name}${was ? ` <small>in place of the ${G.U.esc(was.name)}</small>` : ''}</h4><div class="gs-pe">${fx || ''}</div><div class="gs-stats">${G.GunsmithUI.statsHtml(w.def, after)}</div>`;
  },
  // where each spinning reel's strip is: off (0..M*H while it spins) scrolls it down; the face centred in the window
  // is the one at 2M - off/H (in the middle copy)
  aboxPlace() {
    const R = this.REEL, el = this.$('aboxPick'), ui: GmAboxUI = this.aboxUI!;
    ui.wheels.forEach((wh, i) => {
      const st = !wh.landed && el.querySelector<HTMLElement>(`[data-wheel="${i}"] .abox-strip`);
      if (st) st.style.transform = `translateY(${(wh.off - 2 * R.M * R.H + (R.WH - R.H) / 2).toFixed(1)}px)`;
    });
  },
  // the reels, each frame: a spinning one scrolls down (wrapping a turn), a stopping one eases out onto its face, then
  // lands (a click as it settles)
  aboxSpin(t: number) {
    const ui: GmAboxUI | undefined = this.aboxUI, R = this.REEL;
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
  aboxClick(e: GmEvt) {
    const t = e.target.closest<HTMLButtonElement>('button');
    if (!t || t.disabled) return;
    const mine = this.aboxMine(), ui: GmAboxUI = this.aboxUI!;
    if (t.dataset.close != null) return this.aboxHide();
    if (!mine) return;
    if (t.dataset.stop != null) {
      const i = +t.dataset.stop, wh = ui.wheels[i], R = this.REEL;
      if (wh.landed || wh.stop) return;
      // the face it lands on: far enough down the reel that easing out from full speed reaches it (an ease-out cubic
      // starts at 3x its average speed), and what the host rolled goes on that face
      const c = 2 * R.M - wh.off / R.H, k = Math.floor(c - (R.V * 1.2 / 3) / R.H), dist = (c - k) * R.H;
      wh.strip![k] = mine[0][i];
      wh.stop = { t0: performance.now(), o0: wh.off, o1: wh.off + dist, T: (3 * dist / R.V) * 1000 };
      G.Audio.click();
      return this.aboxRender();
    }
    const i = t.dataset.fit != null ? +t.dataset.fit : t.dataset.take != null ? +t.dataset.take : -1;
    if (i < 0 || mine[1] || !mine[0][i]) return;
    const fit = t.dataset.fit != null && !!this.aboxSlot(mine[0][i]);
    G.Net.toHost({ t: 'takeAbox', i, fit });
    for (const b of this.$('aboxPick').querySelectorAll<HTMLButtonElement>('[data-fit],[data-take]')) b.disabled = true;
  },
  // ------------------------------------------------------------- first aid cabinets
  // each cabinet's grid here (3x2, medical gear only), kept as the host has it: you move things in and out of
  // it in the field inventory, and the inventory tells the host what changed (G.InvUI)
  cabGrid(i: number) {
    this.cabGrids = this.cabGrids || [];
    if (!this.cabGrids[i]) { this.cabGrids[i] = G.Gear.grid(3, 2, ['med'], 'Cabinet'); this.cabGrids[i].cab = i; this.cabGridSet(i, this.cabs && this.cabs[i]); }
    return this.cabGrids[i];
  },
  cabLay(items: (string | number)[][]) { return items.map((e) => e.join(':')).sort().join('|'); },
  cabGridSet(i: number, c: GmCab | undefined) {
    const g = this.cabGrids && this.cabGrids[i];
    if (!g || !c) return;
    g.ver = c[2] || 0;
    const lay = this.cabLay(c[1]);
    if (lay === g.lay) return; // as you left it
    g.items = c[1].map(([mt, n, x, y, r]) => ({ it: G.Gear.medItem(mt, n), x, y, r }));
    g.lay = lay;
    g.counts = G.Sim.cabCounts(c[1] as any);
  },
  // ------------------------------------------------------------- the team locker
  // the squad's shared locker at the quartermaster's (js/server.ts teamEdit), kept as the host has it. Its items
  // carry a tid (the host's name for them); you move things in and out in the stash, and teamSync tells the
  // host what changed. base: the tids the host has; gone: those you've taken out (and not had back yet);
  // sent: what you've put in that the host hasn't answered yet.
  teamGrid() {
    if (!this.tGrid) Object.assign((this.tGrid = G.Gear.grid(G.Sim.TEAM_W, G.Sim.TEAM_H, null, 'Team locker')), { locker: true, team: true, ver: 0, lay: '', base: new Set(), gone: new Set(), sent: new Set() });
    return this.tGrid;
  },
  teamLay(items: (string | number)[][]) { return items.map((e) => e.slice(0, 4).join(':')).sort().join('|'); },
  teamSet(m: any) {
    const g = this.teamGrid(), me = G.Me;
    if (!this.teamBusy) this.teamSync(); // (anything you've moved that the host hasn't heard about yet goes first)
    g.ver = m.ver;
    g.base = new Set(m.items.map((e: GmTeamItem) => e[0]));
    for (const tid of g.gone) if (!g.base.has(tid)) g.gone.delete(tid);
    for (const tid of g.sent) if (g.base.has(tid)) g.sent.delete(tid);
    const lay = this.teamLay(m.items);
    if (lay !== g.lay) { g.items = m.items.map(([tid, x, y, r, pk]: GmTeamItem) => ({ it: Object.assign(G.Gear.unpack(pk), { tid }), x, y, r })); g.lay = lay; }
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
      else { p.it.tid = `${G.Net.myId}.${(this.tidN = (this.tidN || 0) + 1)}` as unknown as number; g.sent.add(p.it.tid); here.add(p.it.tid); put.push([p.it.tid, p.x, p.y, r, G.Gear.pack(p.it)]); }
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
  // is the level being played (or just cleared) a stronghold: the route node the squad is on
  stronghold() {
    const st = this.routeSt, at = st && st.path[st.path.length - 1], n = this.routeMap && at != null ? this.routeMap.nodes.get(at) : null;
    return !!(n && n.stronghold);
  },
  setRoute(r: GmRoute | null) {
    if (!r) return;
    if (!this.routeMap || this.routeMap.seed !== r.seed || this.routeMap.act !== r.act) this.routeMap = G.Route.gen(r.seed, r.act);
    this.routeSt = { path: r.path || [], votes: r.votes || {} };
  },
  // The models of every gun on the sidearm web, stock and pro builds (models parse on first show: js/glb.ts), counted on the loading veil's line.
  armLoad(): Promise<unknown> {
    if (this.armModels === 'ready') return Promise.resolve();
    if (this.armModels) return this.armModels;
    const A = G.Arsenal, defs: any[] = [];
    for (const q of A.NODES) { defs.push(G.Me.makeWeapon(q.id).def); if (q.pro) defs.push(G.Me.makeWeapon(q.id, A.build(q.id)).def); }
    let n = 0; const say = () => this.veilSay(`Loading the arsenal ${n} / ${defs.length}`); say();
    const each = (d: any) => G.Models.ensure(d, 0).catch(() => false).then(() => { n++; say(); });
    return (this.armModels = Promise.all(defs.map(each)).then(() => { this.armModels = 'ready'; }));
  },
  enterRoute(level: number) {
    // the sidearm web comes up with every picture drawn: the screen goes behind the loading veil FIRST (all the way down, so nothing of the map shows),
    // the arsenal loads there, and the route and the web are built behind it as it wipes off
    if (this.armModels !== 'ready' && !G.Me.sidearmChosen) {
      const veil = this.$('veil'), up = veil.classList.contains('on') && !veil.classList.contains('out');
      if (!up) this.veil(true);
      const at = this.routeWait = (this.routeWait || 0) + 1;
      Promise.all([this.armLoad(), new Promise((r) => setTimeout(r, up ? 0 : this.VEIL_MS + 30))]).then(() => { if (this.routeWait === at) this.enterRoute(level); });
      return;
    }
    // the veil (if it's up) lifts once the route and the web below have drawn a few smooth frames (the game loop: veilN), not while they're being built
    if (this.$('veil').classList.contains('on')) { this.veilN = this.VEIL_SMOOTH; this.veilWait = 0; } else this.veil(false);
    this.toggleInv(false);
    this.closeShop();
    this.hub = false; // (the hangar stays up behind the map: G.Hangar.leave when the level replaces it)
    this.phase = 'route';
    this.level = level;
    this.unlock();
    this.$('clickToPlay').classList.add('hidden');
    G.Views.clearLevel();
    if (!this.map && !(G.MenuShow && G.MenuShow.live)) this.menuBackdrop();
    this.screen('route');
    this.renderRoute();
    this.sidearmPick();
  },
  // Before the first level of a run: which sidearm you start with, from what you've earned of the tree (js/arsenal.ts). Your own choice (the squad's
  // aren't waited on); the route's yours to vote on once you've made it. A web, the P9 in the middle, to move about on: drag it, scroll to zoom, and a
  // gun you click on comes to the middle. A strand fills as you get on with what it asks.
  sidearmPick() {
    const el = this.$('sidearmPick'), arms = this.arms || {}, roster = this.roster || {}, A = G.Arsenal;
    if (G.Me.sidearmChosen) { el.classList.add('hidden'); return; }
    // First the models of every gun on the web, stock and pro builds (models parse on first show: js/glb.ts), behind a loading screen, so the web opens
    // with every picture drawn; anything still missing after that shows a spinner until it comes in ('gunicons')
    if (this.armModels !== 'ready') { el.classList.add('hidden'); this.armLoad().then(() => { if (this.phase === 'route') this.sidearmPick(); }); return; }
    if (!this.armLook) { this.armLook = this.armSel = 'p9'; this.armView = { x: 0, y: 0, z: 0.7 }; }
    // who's taken it (the squad's own picks: told by the host)
    const takers = (id: string) => Object.entries(arms).filter(([pid, a]) => a === id && roster[pid]).map(([pid]) => `<i style="color:${G.U.hex(roster[pid].color)}">${G.Callsigns.html(roster[pid].animal)}${G.U.esc(roster[pid].name)}</i>`);
    const others = Object.keys(roster).filter((pid) => pid !== G.Net.myId), waiting = others.filter((pid) => !arms[pid]).length;
    const pic = (id: string) => { const it = G.Gear.gunItem(G.Me.makeWeapon(id, A.proOn(id) ? A.build(id) : undefined)), [cw, ch] = G.Gear.size(it); const url = G.Icons.of(it, cw, ch, false); return G.Icons.pending() ? '' : url; };
    // the web: a ring for each step out, spokes between, and the paths on it
    const W = 1500, spokes = [...Array(6)].map((_, i) => ((-90 + i * 60) * Math.PI) / 180), spot = (a: number, r: number) => [Math.cos(a) * r, Math.sin(a) * r], rings = A.RINGS.slice(1);
    const web = rings.map((r) => `<polygon points="${spokes.map((a) => spot(a, r).map((v) => v.toFixed(1)).join()).join(' ')}"/>`).join('') + spokes.map((a) => { const [x, y] = spot(a, rings[rings.length - 1]); return `<line x1="0" y1="0" x2="${x.toFixed(1)}" y2="${y.toFixed(1)}"/>`; }).join('');
    const strands = A.NODES.filter((q) => q.from).map((q) => {
      const [x0, y0] = A.at(A.BY.get(q.from!)!), [x1, y1] = A.at(q), got = A.open(q.id), f = got ? 1 : A.open(q.from!) ? A.left(q) / q.n! : 0;
      return `<line class="strand" x1="${x0}" y1="${y0}" x2="${x1}" y2="${y1}"/>${f > 0 ? `<line class="strand on" x1="${x0}" y1="${y0}" x2="${(x0 + (x1 - x0) * f).toFixed(1)}" y2="${(y0 + (y1 - y0) * f).toFixed(1)}"/>` : ''}`;
    }).join('');
    const nodes = A.NODES.map((q) => {
      const [x, y] = A.at(q), st = A.open(q.id) ? 'got' : A.open(q.from!) ? 'next' : 'far', tip = st === 'next' ? `<small>${A.left(q)}/${q.n} ${G.U.esc(q.what!)}</small>` : st === 'far' ? '<small>Locked</small>' : A.proGot(q.id) ? `<small>${A.proOn(q.id) ? 'Pro: ' : 'Pro earned: '}${G.U.esc(q.pro!.name)}</small>` : '';
      return `<button class="web-node ${st}${this.armLook === q.id ? ' look' : ''}${this.armSel === q.id ? ' sel' : ''}" data-arm="${q.id}" style="left:${x.toFixed(1)}px;top:${y.toFixed(1)}px">${((src) => src ? `<img src="${src}" alt="" draggable="false">` : '<span class="icon-wait"><span class="spin"></span></span>')(pic(q.id))}<b>${G.U.esc(A.name(q.id))}</b>${tip}</button>`;
    }).join('');
    // each path's name in a box over the middle of its first strand (the first ring is wide enough apart for them to sit clear of the nodes)
    const paths = Object.entries(A.PATHS).map(([k, p]) => { const [x, y] = A.along(k, A.RINGS[1] / 2); return `<span class="web-path" style="left:${x.toFixed(1)}px;top:${y.toFixed(1)}px">${p.name}</span>`; }).join('');
    // what you're looking at: the gun, and what it takes
    const id = this.armLook, q = A.BY.get(id)!, d = G.WEAPONS[id], cal = G.CALIBERS[G.calOf(d)], got = A.open(id), modes = (d.modes || [d.mode]).map((m: string) => G.MODE_NAME[m]).join(' / ');
    const nextOn = A.NODES.filter((c) => c.from === id && !A.open(c.id)).map((c) => `<li><b>${G.U.esc(A.name(c.id))}</b> <span>${A.left(c)}/${c.n}</span> ${G.U.esc(c.what!)}<small>${G.U.esc(c.how!)}</small></li>`).join('');
    const ask = got ? '' : A.open(q.from!) ? `<div class="web-ask"><b>${A.left(q)}/${q.n} ${G.U.esc(q.what!)}</b> with the ${G.U.esc(A.name(q.from!))}<small>${G.U.esc(q.how!)}</small></div>` : `<div class="web-ask far"><b>Locked</b> Earn the ${G.U.esc(A.name(q.from!))} first.</div>`;
    // its pro build: what it takes, or the choice of starting with it
    const P = q.pro!, parts = A.partNames(id).map((n) => `<li>${G.U.esc(n!)}</li>`).join('');
    const pro = !got ? '' : `<h4>Pro build</h4><div class="web-pro${A.proGot(id) ? ' got' : ''}" tabindex="0" title=""><b>${G.U.esc(P.name)}</b><ul>${parts}</ul>${A.proGot(id) ? `<label><input type="checkbox" data-armpro ${A.proOn(id) ? 'checked' : ''}> Start in pro mode</label>` : `<span>${Math.min(P.n, A.count(id, P.stat))}/${P.n}</span> ${G.U.esc(P.what)} with this gun`}</div>`;
    const was = el.querySelector('.web-world');
    el.innerHTML = `<div class="web-full"><div class="web-view"><div class="web-world"><svg viewBox="${-W} ${-W} ${W * 2} ${W * 2}" style="left:${-W}px;top:${-W}px;width:${W * 2}px;height:${W * 2}px" aria-hidden="true"><g class="web-lines">${web}</g>${strands}</svg>${paths}${nodes}</div>
        <div class="web-head"><h2>Your sidearm</h2><p>${G.Pad.text('Drag to move · scroll to zoom · click a gun')}</p></div><button class="btn web-home" data-armhome>Back to the P9</button></div>
      <aside class="web-side"><img src="${pic(id)}" alt=""><h3>${G.U.esc(d.name)}</h3><div class="arm-stats"><span>${cal ? cal.name : ''}</span><span>${d.mag} round${d.mag === 1 ? '' : 's'}</span><span>${modes}</span><span>${G.U.fmt(Math.round(G.Ballistics.energy(d)))} J · ${d.rpm} rpm</span></div><em>${G.U.esc(d.desc)}</em>${ask}
        ${nextOn ? `<h4>With this gun</h4><ul class="web-next">${nextOn}</ul>` : ''}${pro}${others.length && got ? `<span class="arm-who">${takers(id).join('') || '<small>no one yet</small>'}</span>` : ''}
        <div class="web-foot"><p>Your own equipment, not a squad vote, and what you earn here stays yours. It starts loaded with ${((am: string) => am === 'tracer' ? 'tracers' : G.AMMO[am] && am !== G.ballFor(G.calOf(d)) ? G.AMMO[am].name + ' rounds' : 'buckshot')(A.startAm(id))}, two spare loads in your pocket.</p>${others.length ? `<p class="arm-note">${waiting ? `${waiting} of the squad still choosing.` : 'The squad have all chosen.'}</p>` : ''}
        <button class="btn primary arm-ok" data-armok ${got ? '' : 'disabled'}>${got ? `Take ${/^the /i.test(d.name) ? '' : 'the '}${G.U.esc(d.name)}${A.proOn(id) ? ` ${G.U.esc(P.name)}` : ''}` : 'Not yet yours'}</button></div></aside><div class="web-preview hidden"></div></div>`;
    el.classList.remove('hidden');
    const place = () => { const v = this.armView, w = el.querySelector<HTMLElement>('.web-world'); if (w) w.style.transform = `translate(${v.x.toFixed(1)}px, ${v.y.toFixed(1)}px) scale(${v.z.toFixed(3)})`; };
    this.armPlace = place;
    // (where it was, then across to where it's going: the map's built afresh each time)
    if (this.armFrom) { const w = el.querySelector<HTMLElement>('.web-world')!; w.style.transform = this.armFrom; this.armFrom = null; requestAnimationFrame(() => { w.classList.add('glide'); place(); }); } else place();
    if (was) was.remove();
    if (!el.dataset.bound) {
      el.dataset.bound = 1 as unknown as string;
      let drag: { x: number; y: number; vx: number; vy: number } | null = null, moved = false;
      // over the pro build: what it'd be, beside it, against the gun as it comes
      const preview = (on: boolean) => {
        const box = el.querySelector('.web-preview');
        if (!box) return;
        if (!on) { box.classList.add('hidden'); return; }
        const A = G.Arsenal, id = this.armLook!, q = A.BY.get(id)!, w = G.Me.makeWeapon(id, A.build(id)), it = G.Gear.gunItem(w), [cw, ch] = G.Gear.size(it);
        box.innerHTML = `<img src="${G.Icons.of(it, cw, ch, false)}" alt=""><h3>${G.U.esc(A.name(id))} <b>${G.U.esc(q.pro!.name)}</b></h3><ul>${A.partNames(id).map((n) => `<li>${G.U.esc(n!)}</li>`).join('')}</ul><h4>Against the stock gun</h4><div class="gs-stats">${G.GunsmithUI.statsHtml(G.Me.makeWeapon(id).def, w.def)}</div>`;
        box.classList.remove('hidden');
      };
      for (const [ev, on] of [['pointerover', true], ['pointerout', false], ['focusin', true], ['focusout', false]] as [string, boolean][]) el.addEventListener(ev, ((e: GmEvt) => { if (e.target.closest && e.target.closest('.web-pro')) preview(on); }) as EventListener);
      const go = (x: number, y: number) => { const v = this.armView, w = el.querySelector<HTMLElement>('.web-world'); this.armFrom = w ? w.style.transform : null; v.x = x * v.z; v.y = y * v.z; };
      el.addEventListener('pointerdown', ((e: GmEvt & PointerEvent) => {
        if (e.button !== 0 || !e.isPrimary || !e.target.closest('.web-view') || e.target.closest('.web-home')) return;
        drag = { x: e.clientX, y: e.clientY, vx: this.armView.x, vy: this.armView.y }; moved = false;
        const w = el.querySelector('.web-world'); if (w) w.classList.remove('glide');
      }) as EventListener);
      window.addEventListener('pointermove', (e) => {
        if (!drag || !e.isPrimary) return;
        const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
        if (Math.hypot(dx, dy) > 5) moved = true;
        if (moved) { const v = this.armView, R = 1050 * v.z; v.x = G.U.clamp(drag.vx + dx, -R, R); v.y = G.U.clamp(drag.vy + dy, -R, R); this.armPlace(); }
      });
      window.addEventListener('pointerup', () => { drag = null; });
      el.addEventListener('wheel', ((e: GmEvt & WheelEvent) => {
        const view = e.target.closest('.web-view');
        if (!view) return;
        e.preventDefault();
        const v = this.armView, r = view.getBoundingClientRect(), z = G.U.clamp(v.z * Math.exp(-e.deltaY * 0.0012), 0.4, 1.5), k = z / v.z, cx = e.clientX - r.left - r.width / 2, cy = e.clientY - r.top - r.height / 2; // (about the cursor: what's under it stays there)
        v.x = cx - (cx - v.x) * k; v.y = cy - (cy - v.y) * k; v.z = z;
        const w = el.querySelector('.web-world'); if (w) w.classList.remove('glide');
        this.armPlace();
      }) as EventListener, { passive: false });
      el.addEventListener('click', ((e: GmEvt) => {
        const dragged = moved; moved = false;
        if (G.Me.sidearmChosen) return;
        const b = e.target.closest<HTMLElement>('[data-arm]'), ok = e.target.closest<HTMLButtonElement>('[data-armok]');
        const tick = e.target.closest<HTMLInputElement>('[data-armpro]');
        if (tick) { G.Arsenal.proSet(this.armLook!, tick.checked); G.Audio.click(); return this.sidearmPick(); }
        if (e.target.closest('[data-armhome]')) { go(0, 0); G.Audio.click(); return this.sidearmPick(); }
        if (b) {
          if (dragged) return; // (it was a drag that started on it)
          this.armLook = b.dataset.arm!; if (G.Arsenal.open(this.armLook)) this.armSel = this.armLook;
          const [x, y] = G.Arsenal.at(G.Arsenal.BY.get(this.armLook)); go(-x, -y);
          G.Audio.click(); return this.sidearmPick(); // (chosen, not yet taken)
        }
        if (!ok || ok.disabled || !G.Arsenal.open(this.armLook!)) return;
        const id = this.armLook!;
        G.Me.setSidearm(id, G.Arsenal.proOn(id) ? G.Arsenal.build(id) : undefined); G.Audio.click();
        G.Net.toHost({ t: 'arm', id }); // (so the squad sees it)
        G.HUD.toast('', `Sidearm: ${G.WEAPONS[id].name}`, 1.4);
        this.armSel = this.armLook = null; this.sidearmPick(); this.renderRoute();
      }) as EventListener);
    }
  },
  // the route's state as the map draws it (js/route.ts svg, tip)
  routeTipSt() {
    const st = this.routeSt!, rm = this.routeMap!;
    return { path: st.path, opts: G.Route.options(rm, st.path[st.path.length - 1]), votes: st.votes, mine: st.votes[G.Net.myId!] };
  },
  renderRoute() {
    const rm = this.routeMap, st = this.routeSt;
    if (!rm || !st) return;
    const opts = G.Route.options(rm, st.path[st.path.length - 1]), colors: Record<string, number> = {};
    for (const [id, p] of Object.entries(this.roster || {})) colors[id] = p.color;
    const mine = st.votes[G.Net.myId!];
    const box = this.$('routeMap'), first = !box.firstChild;
    box.innerHTML = G.Route.svg(rm, { path: st.path, opts, votes: st.votes, colors, mine });
    const tip = document.getElementById('routeTip'); if (tip) tip.classList.add('hidden'); // (the map redrawn: its card goes until the pointer moves)
    // the map is wider than the screen: bring where you are (and what's next) into view, and let the wheel scroll it
    const at = box.querySelector('.rn.here') || box.querySelector('.rn.opt');
    if (at && (first || !box.dataset.col || +box.dataset.col !== st.path.length)) {
      box.dataset.col = st.path.length as unknown as string;
      const r = at.getBoundingClientRect(), b = box.getBoundingClientRect();
      box.scrollLeft += r.left + r.width / 2 - (b.left + b.width * 0.35);
    }
    if (!box.dataset.wheel) { box.dataset.wheel = 1 as unknown as string; box.addEventListener('wheel', (e: WheelEvent) => { if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) { box.scrollLeft += e.deltaY; e.preventDefault(); } }, { passive: false }); }
    const boss = opts.length === 1 && rm.nodes.get(opts[0])!.boss;
    this.$('routeTitle').innerHTML = `Act ${rm.act} <span>— level ${this.level}${boss ? ' <b class="red">(BOSS)</b>' : ''}</span>`;
    const ids = Object.keys(this.roster || {}), voted = ids.filter((id) => st.votes[id] != null).length;
    this.$('routeMsg').innerHTML = mine == null ? G.Pad.text(boss ? 'The Kingpin is waiting. Click the node to go in.' : !st.path.length ? `The way in: ${G.U.esc(G.THEMES[rm.nodes.get(opts[0])!.th].name)}. Click it to deploy; the routes split after it.` : 'Pick where to deploy next: click one of the lit nodes. Each path decides the environments ahead.')
      : ids.length > 1 ? `Voted. Waiting for the squad (${voted}/${ids.length}); most votes wins, ties are a coin toss.` : 'Deploying...';
    if (opts.some((o) => rm.nodes.get(o)!.stronghold)) this.$('routeMsg').innerHTML += `<div class="arm-squad"><b class="red">! Stronghold</b> (red badge): no civilians, about half as many suspects again, +¢${G.Route.strongholdPay(this.level)} for clearing it.</div>`;
    if (opts.some((o) => rm.nodes.get(o)!.night)) this.$('routeMsg').innerHTML += `<div class="arm-squad"><b>☾ Night</b> (moon badge): the lights are out bar the emergency lights. Suspects can hardly see you in the dark, unless you show a light; you'll want yours.</div>`;
    const arms = this.arms || {}, roster = this.roster || {};
    if (this.level === 1 && ids.length > 1 && G.Me.sidearmChosen) this.$('routeMsg').innerHTML += `<div class="arm-squad">Sidearms (each your own): ${ids.map((id) => `<i style="color:${G.U.hex(roster[id].color)}">${G.U.esc(roster[id].name)}</i> ${arms[id] ? G.U.esc(G.WEAPONS[arms[id]].name) : '<small>choosing…</small>'}`).join(' · ')}</div>`;
  },
  pickRoute(n: number) {
    if (!G.Me.sidearmChosen) return; // (pick your sidearm first)
    if (this.phase !== 'route' || !this.routeMap || !G.Route.options(this.routeMap, this.routeSt!.path[this.routeSt!.path.length - 1]).includes(n)) return;
    G.Audio.click();
    G.Net.toHost({ t: 'pick', n });
  },
  // sp: a mission's level (js/spaceserver.ts levelMsg): what it's generated for, the mission, the ship. Then there's no helicopter:
  // you're aboard the squad's ship as she comes out of the jump (js/space.ts).
  enterLevel(level: number, seed: number, th?: number, night = false, wc?: string | null, sp?: any) {
    this.veil(true, true); // (already black, unless you've just joined)
    G.Space.leave(); if (!sp) G.Space.S.keep = null;
    this.leaveHub();
    this.phase = 'level';
    this.level = level;
    this.extract = { active: false, votes: 0, need: 0, civDead: 0, voted: false };
    this.enemiesLeft = 0;
    this.map = G.Level.generate(seed, level, th, night, sp ? sp.gen : null);
    G.Career.levelStart(level, th, night, this.stronghold()); // (your run's log: js/career.ts)
    G.ServerHost.born(this.map); // (as it was built: the host's simulation built it too, G.ServerLink.digest)
    if (G.Prof) G.Prof.reset(); // (the worst frames and totals: this level's)
    if (G.Highlights) { G.Highlights.drop(); G.Highlights.reset(); } // (last level's replays go; this one's start recording)
    G.Views.warmed = false; // compile the new level's shaders once it's populated (G.R.warmup)
    this.cabGrids = [];
    G.Loot.clear();
    G.R.setLevel(this.map);
    G.Views.clearLevel();
    const teamDefs = [...G.Views.players.values()].map((p) => p.st && p.st.w && G.Gunsmith.fromCode(p.st.w)).filter(Boolean), team = teamDefs.map((d) => d.soundKey);
    // the guns the level will show, fetched now: the squad's kits, the level's enemy weapon pool (every pack of each platform), the weapon case's gun and the loot (as it lands)
    const caseGun = typeof wc === 'string' ? G.Gunsmith.fromCode(wc) : null; // (the host says what's in the case: 'wc')
    G.GunModels.preload([...Object.values(G.Me.weapons).map((w) => w.def), ...teamDefs, ...(caseGun ? [caseGun] : [])], this.enemyGuns(level), false); // (the models are all in memory: this only schedules their parsing)
    G.Handling.prewarm([...Object.values(G.Me.weapons).map((w) => w.def), ...this.enemyGuns(level).map((id) => G.WEAPONS[id])]); // (the guns' handling sounds: js/handling.ts)
    G.GunAudio.prewarm([...Object.values(G.Me.weapons).flatMap((w) => [w.def.soundKey, G.Gunsmith.roundSoundKey(w.def, w.chamber || w.ammo), ...(w.def.barrels ? Object.keys(w.def.barrels.rounds).flatMap((k) => G.barrelMm(w.def, k).map((mm: number) => G.shotSoundKey(G.roundSpec(w.def, k), mm, w.ammo))) : [])]), ...this.enemyGuns(level), ...team], this.map);
    // everyone in a seat of their own in the helicopter, on the pad (the same on every machine: by the sorted roster)
    const i = Math.max(0, Object.keys(this.roster).sort().indexOf(G.Net.myId!));
    if (sp) { G.Me.spawn(this.map.spawn.x, this.map.spawn.z); G.Space.enterLevel(this.map, sp); }
    else { G.Landing.enter(this.map); G.Me.spawn(this.map.spawn.x, this.map.spawn.z); G.Landing.board(G.Me, Math.min(i, G.Hangar.HELI.seats - 1)); }
    this.screen(null);
    G.HUD.show(true);
    if (sp) G.HUD.toast(G.U.esc(sp.ms.name), G.U.esc(sp.ms.where) + ' · ' + G.SpaceData.OBJ[sp.ms.obj as SpObj].name, 4.5);
    else G.HUD.toast(`LEVEL ${level}`, this.map.theme.name + (G.Route.isBoss(level) ? ' — <b class="red">THE WARDEN AWAITS</b>' : ''), 3.5);
    if (!sp && G.Route.isBoss(level)) G.Audio.alarm();
    if (!this.locked) this.$('clickToPlay').classList.remove('hidden');
    this.veilSay('Placing everyone');
  },
  // Between levels: the hangar (js/hangar.ts). To the game it's a level with nothing in it but the shop, so you walk
  // about it, the squad is there, and rays, steps and sound are all the ordinary ones; the host just doesn't send
  // enemies. this.hub marks it (the phase is still 'level' here).
  enterShop(level: number, seed: number, report: GmReport | null, stock: any, spc?: any) { // (spc: the game in space, js/spaceserver.ts shopMsg: the board, the fleet, where the ship is)
    this.veil(true, true);
    G.Space.leave();
    this.toggleInv(false);
    this.closeShop();
    this.hub = true; this.shopOpen = false;
    this.phase = 'level';
    if (G.Me.navRearm) G.Me.navRearm();
    G.Shop.report = report || null;
    let paid = 0;
    this.lastBonus = 0;
    if (G.Me.pos && !G.SpaceData.ON) { // (in space a mission's fee is what's paid, when it's done: js/space.ts mdone)
      const clean = report && report.civKilled === 0 && report.unauth === 0;
      const bonus = Math.round((250 + 75 * level + (clean ? 200 : 0) + (report && report.allRescued ? 150 + 50 * level : 0) + (report && report.stronghold ? G.Route.strongholdPay(level) : 0)));
      G.Me.credits += bonus;
      this.lastBonus = bonus; paid = bonus;
    }
    if (report) G.Career.levelEnd(report, paid); // (extracted: the level's report, into your run's log)
    this.level = level;
    this.extract = { active: false, votes: 0, need: 0, civDead: 0, voted: false };
    this.enemiesLeft = 0; this.civsLeft = 0; this.bodiesLeft = 0; this.weaponsLeft = 0; this.unitsCleared = 0;
    // the level just played stays, out of sight, for the highlights on the hangar's TVs (js/highlights.ts)
    if (G.Highlights && this.map && !this.map.hub) G.Highlights.take(this.map, G.R.detachLevel());
    this.map = G.Level.generateHub(seed, level);
    G.Views.warmed = false; // (compiled under the veil too, and what lifts it)
    G.Loot.clear();
    G.R.setLevel(this.map);
    G.Views.clearLevel();
    G.Me.dead = false; G.Me.down = false;
    G.Shop.open(level, seed, stock); // (his stock this visit: the whole squad's, shared)
    G.Hangar.enter(this.map);
    // each officer a spot of their own on the pad, in front of the opening
    const i = Math.max(0, Object.keys(this.roster).sort().indexOf(G.Net.myId!)), sp = G.Hangar.spawnAt(i);
    G.Me.spawn(sp.x, sp.z);
    G.Me.yaw = 0; // (facing the hall)
    if (G.SpaceData.ON) G.Space.enterHub(this.map, spc); // (the squad's ship on the pad, or out by an anchor with you aboard; the rock round the base)
    this.screen(null);
    G.HUD.show(true);
    if (G.SpaceData.ON) { if (!spc || !spc.ship || spc.ship.docked) G.HUD.toast('THE BASE', 'The missions board is by the pad · your ship is on it', 4); }
    else G.HUD.toast('THE HANGAR', `Level ${level} cleared · look at what you want and press <b>F</b>`, 4);
    G.Shop.wishNotice(); // (starred parts in this visit's stock)
    if (this.lastBonus) G.HUD.chat(null, 0, `Mission bonus: +¢${this.lastBonus}`);
    if (!this.locked) this.$('clickToPlay').classList.remove('hidden');
    this.veilSay('Placing everyone');
  },
  // out of the hangar for good (a level, the lobby, the menu)
  leaveHub() {
    this.closeShop();
    this.hub = false;
    G.Hangar.leave();
  },
  enterGameover(m: any) {
    this.veil(false);
    this.toggleInv(false);
    this.closeShop();
    this.hub = false;
    this.phase = 'gameover';
    this.unlock();
    this.$('clickToPlay').classList.add('hidden');
    this.screen('gameover');
    this.$('goSub').textContent = `Your squad fell on level ${m.level}.`;
    G.Career.runEnd('wiped');
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
  loop() {
    requestAnimationFrame(() => this.loop());
    const now = performance.now();
    const raw = now - this.last, dt = Math.min(raw / 1000, 0.05);
    this.last = now;
    G.Pad.update(dt); // (before anything reads the controls this frame)
    G.Touch.update(dt);
    G.Ambience.update(dt, this.phase === 'level' ? this.map : null, G.R.camera); // the place's own sound (js/ambience.ts), for where you are in it
    if (this.phase === 'level') {
      if (G.Net.isHost && !this.hub) G.Views.boresOut(); // (the suspects' guns as they were last drawn, to the simulation: before anything moves this frame)
      if (this.invOpen) G.InvUI.update(dt);
      if (this.invOpen && (this.invT = (this.invT || 0) + dt) > 0.25) { this.invT = 0; G.InvUI.tick(); this.$('fiScore').innerHTML = G.HUD.scoreboardHTML(); }
      G.Me.update(dt);
      if (G.Highlights && !this.hub) G.Highlights.tick(dt); // (recording the level, for the hangar's TVs)
      if (this.hub) { G.Hangar.update(dt); G.Hangar.mark(); }
      G.Views.update(dt);
      if (!this.hub) G.Landing.update(dt); // (after everyone's posed: in the air it moves the camera, and hides who's riding with you)
      G.Space.update(dt); // (the squad's ship: flown, and what's outside her moved: js/space.ts)
      if (G.Me.dead) G.Me.spectate(dt); // (after the rigs are posed: the helmet camera's on a head as it is this frame)
      G.GunAudio.updateListener(G.R.camera); // (after that: dead, you hear from where the camera is, not where you fell)
      G.Me.flushHits();
      this.updateZone();
      this.updateDoors(dt);
    } else if (this.showcaseBehind() && G.MenuShow.update(dt)) {
      // the main menu, the lobby and a run's first route: the guns one after another (js/menushow.ts), drawn below instead of the level
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
    if (this.showcaseBehind() && G.MenuShow.live) G.MenuShow.render(G.R.renderer); else if (!G.R.warmStep()) G.R.render(); // (the shaders being built under the veil: nothing drawn till they are, js/render.ts warmup)
    // the veil lifts once the new place has drawn veilN SMOOTH frames in a row (the first ones after a build upload textures and collect garbage: lifting
    // on those makes the wipe stutter off), or after 90 frames whatever they took (a slow machine still gets in)
    if (this.veilN > 0) {
      this.veilWait = (this.veilWait || 0) + 1;
      if (raw < 34) this.veilN--; else this.veilN = Math.max(this.veilN, this.VEIL_SMOOTH);
      if (this.veilN === 0 || this.veilWait >= 90) { this.veilN = 0; this.veilWait = 0; this.veil(false); }
    }
  },
  // swing door leaves toward their open/closed state
  updateDoors(dt: number) {
    const m = this.map;
    if (!m || !m.doorMeshes) return;
    m.doors.forEach((d: LvDoor, i: number) => {
      const piv = m.doorMeshes[i], u = piv.userData;
      if (u.fallen) { G.LightGrid.setDoor(i, 1); return; } // (off its hinges: js/damage.ts has it)
      u.ang += ((d.open ? 1 : 0) - u.ang) * Math.min(1, dt * (u.rate || 7));
      if (u.slide) { const k = u.ang * u.w * 0.97; piv.position.x = u.px - Math.cos(u.base) * k; piv.position.z = u.pz + Math.sin(u.base) * k; } // (a ship's door: along the wall, into it)
      else piv.rotation.y = u.base + u.ang * Math.PI / 2 * 0.95 * (u.sign || 1);
      const k = Math.min(1, u.ang * 2.5); // (the lamps' light past it: all in by the time it's well ajar)
      G.LightGrid.setDoor(i, k < 0.01 ? 0 : k > 0.99 ? 1 : k);
    });
    G.LightGrid.flush();
    G.Damage.update(m as unknown as GmDmgMap, dt);
  },
  updateZone() { /* no exit zone: the squad votes to leave (Y) once order's restored */ },
};
G.Game = G_Game;
interface GameModules { Game: typeof G_Game; }

window.addEventListener('load', () => G.Game.init());
// a gun's picture came in after the sidearm web was drawn (js/icons.ts): draw it again
window.addEventListener('gunicons', () => { const el = G.Game.$('sidearmPick'); if (el && !el.classList.contains('hidden') && !G.Me.sidearmChosen) G.Game.sidearmPick(); });
