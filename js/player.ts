'use strict';
// where a door stops being a kick and starts being a push: aim below this (m) to kick, above to open
const KICK_H = 1.3;
type PBuild = Record<string, string>;
// what a shot's rounds share (the friendly fire to send, together, and where they end); the rest is set as it goes
interface PShot { sid: number; ff: Map<any, any>; to?: THREE.Vector3; tos: THREE.Vector3[] | null; ghosts?: Map<string, ShotGhost>; n?: number; paths?: any[]; [k: string]: any }
// a round in flight (Me.fly): its state, and what the stepping adds as it goes
// the fire selector's positions, a reload's way of dealing with the old magazine, the action worked by hand, the throwable in your hand,
// what a timed F action is (it drives the animation), the zipline's and the ladder's phases, and how a hit leaves you
type PReloadMode = 'retain' | 'pouch' | 'floor' | 'plain';
type PActKind = 'rack' | 'release';
type PHeldKind = 'frag' | 'flash' | 'tb'; // (tb: a thermobaric grenade)
type PActionKind = 'order' | 'zip' | 'bag' | 'open' | 'kick' | 'close' | 'case';
type PZipPhase = 'up' | 'ride' | 'down';
type PLadderPhase = 'on' | 'climb' | 'off';
type PFate = 'down' | 'out' | 'dead';
type PXZ = { x: number; z: number };
type PYP = { y: number; p: number };
// a weapon as carried (Me.makeWeapon): what's in it; the rest (a light, a laser, its stickers...) comes with the build
interface PWeapon { def: WeaponDef; sup: boolean; mag: number; ammo: string; fm: FireMode; tube: string[]; chamber: string | null; spent?: string[]; spentCh?: string | null; noMag?: boolean; magI?: number; light?: boolean; laser?: boolean; stickers?: any; [k: string]: any }
interface PStats { kills: number; dmg: number; hs: number; downs: number; revives: number; arrests: number }
// recoil's aim offset and its momentum; a head hit's throw (and how quickly the neck brings it back)
interface PRecoil { y: number; p: number; vy: number; vp: number }
interface PHeadKick { y: number; p: number; r: number; vy: number; vp: number; vr: number; w: number }
interface PRecoilModel { up: number; side: number; rec: number; capUp: number; capSide: number; sway: number; erratic: number }
// a timed action (F): its progress, what it does when it's done, and what happens part-way through (events, each once)
interface PActionEvent { at: number; fn: () => void; done?: boolean }
interface PPull { t: number; dur: number; me: THREE.Vector3; dx: number; dz: number; to: PXZ; fx: number; fz: number }
interface PAction {
  label: string; dur: number; t: number; onDone: (() => void) | null | undefined; kind: PActionKind | null; events: PActionEvent[]; key?: string; free?: boolean;
  target?: number; living?: boolean; civBody?: boolean; approach?: PXZ | null; spot?: PXZ | null; face?: PXZ; stuck?: number; start?: THREE.Vector3; pull?: PPull | null; qFloor?: THREE.Quaternion;
}
// the action worked by hand (rack / release), the magazine pulled to look at, the chamber check, the comms wheel, a viewer, a zipline, a ladder
interface PAct { kind: PActKind; seat: number | null; t: number; dur: number; back: number; home: number; b?: boolean; h?: boolean; s?: boolean } // (s: its sound's started: js/handling.ts, ahead of the stop it lines up with)
interface PMagChk { k: number; back: number; yaw: number; pitch: number; rel?: boolean; seated?: boolean }
interface PRChk { k: number; rel: boolean }
interface PWheelItem { id: string; label: string; sub: string; off?: boolean; act: () => void }
interface PWheel { x: number; y: number; sel: number; items: PWheelItem[] }
interface PViewer { v: any; was: boolean; yaw: number; pitch: number }
interface PZip { l: any; ph: PZipPhase; t: number; s: number; from: THREE.Vector3; was: boolean; L?: number; sw: { th: number; w: number; v: number; a: number } }
interface PClimb { l: any; up: boolean; ph: PLadderPhase; t: number; from: THREE.Vector3; was: boolean; y: number }
// a throwable in your hand (keys 3, 4, 5): its kind, whether the pin's out, the strength picked, and the throw's timers
interface PHeld { kind: PHeldKind; cock: boolean; str: number; readyT: number; throwT: number; lastL: boolean; lastR: boolean; queued?: boolean; cook?: number } // (cook: the spoon's gone, the fuse burning in your hand: what's left of it)
// a thermobaric's burst, worked out from where it went off (js/player.ts tbModel)
interface PTbModel { map: LvMap; p: THREE.Vector3; fill: ReturnType<typeof G_Level.blastFill>; cloud: number; space: number; closed: boolean; conf: number; qs: number; rc: number; idx: Int32Array; outFrac: number; areaCloud: number; areaSpace: number; V: number }
interface PTreat { name: string; part: string; mt: string; t0: number; dur: number }
// what's owed the host for one suspect this frame: plain damage, wounds (as a share of a life), a headshot, a kill, armour got through, the wounds' detail
interface PHitQ { d: number; f: number; h: boolean; k: boolean; ap?: boolean; w?: any[]; gr?: number; tb?: number[] } // (gr: a frag grenade's, its seed: js/highlights.ts)
// your own limbs in the viewmodel pass (fpLimbs)
interface PLimbs { arm: THREE.Group; leg: THREE.Group; armL: THREE.Group; tie: THREE.Mesh; held: THREE.Group; env: THREE.Group; nade: { frag: THREE.Mesh; flash: THREE.Mesh; tb: THREE.Mesh } }
type PTrack = { t: number; v: number; bone: string }[] & { frags?: any[] };
interface PRound { p: THREE.Vector3; v: THREE.Vector3; def: WeaponDef; am: string; drag: number; hit: Set<any>; shot: PShot; path: { p: number[][]; ev: any[]; hit: any[] }; enemy?: number; [k: string]: any }
// The local player: input, movement, weapons, damage, revive/down state.
const G_Me = {
  keys: {} as Record<string, boolean>,
  // CQB pace (m/s): normal walk; weapon lowered (Space) to move quicker; steadied (Shift) to creep and
  // hold the gun still; crouch-walk
  SPEED: { walk: 1.9, low: 3.0, steady: 1.4, crouch: 1.3, prone: 0.55 },
  PRONE_T: 0.8, // getting down onto your front, or back up (s): no shooting meanwhile
  LEAN: 0.38, // metres the head moves sideways at full lean
  mouse: { l: false, r: false },
  padMove: null as { st: number; fw: number; k: number; slow?: boolean; fast?: boolean } | null, // (the left stick, this frame: js/gamepad.ts; slow and fast: a touch stick's creep and low-ready run, js/touch.ts)
  pos: null as unknown as THREE.Vector3,
  vel: null as unknown as THREE.Vector3,
  yaw: 0,
  pitch: 0,

  // ------------------------------------------------------------- what a run and a spawn set (undefined till they do)
  credits: undefined as unknown as number,
  stk: undefined as any, // (the stickers you've found)
  weapons: undefined as unknown as Record<string, GWeapon>, // (cur() is the one in your hands, as a PWeapon)
  stash: undefined as any, // (G.Gear.stashProxy: weapon parts owned but not fitted)
  stats: undefined as unknown as PStats,
  rounds: undefined as unknown as PRound[],
  sidearmChosen: undefined as unknown as boolean,
  kit: undefined as any, pockets: undefined as any, locker: undefined as any, // (js/gear.ts)
  body: undefined as unknown as MedBody,
  hp: undefined as unknown as number,
  bleed: undefined as unknown as number | null, // (seconds left when down, or null: stable)
  dead: undefined as unknown as boolean, down: undefined as unknown as boolean, out: undefined as unknown as boolean,
  deathCause: undefined as unknown as string,
  spectating: undefined as unknown as VwPlayer | null,
  treating: undefined as unknown as Map<number, PTreat>,
  // stance and movement
  crouch: undefined as unknown as boolean, prone: undefined as unknown as boolean, stanceT: undefined as unknown as number,
  lean: undefined as unknown as number, onGround: undefined as unknown as boolean, hspeed: undefined as unknown as number, eyeH: undefined as unknown as number,
  lowReady: undefined as unknown as boolean, lowToggle: undefined as unknown as boolean, steadying: undefined as unknown as boolean,
  seat: undefined as unknown as number | null, zipRide: undefined as unknown as PZip | null, climb: undefined as unknown as PClimb | null, viewer: undefined as unknown as PViewer | null,
  zipHold: undefined as unknown as number, ladderHold: undefined as unknown as number, zipW: undefined as unknown as number,
  // the weapon in hand
  slot: undefined as unknown as string,
  reloading: undefined as unknown as boolean, reloadT: undefined as unknown as number, reloadTotal: undefined as unknown as number, reloadMode: undefined as unknown as PReloadMode,
  reloadSeat: undefined as unknown as number, reloadPackK: undefined as unknown as number, reloadN: undefined as unknown as number, reloadEv: undefined as unknown as number, hCues: null as { at: number; name: string; done: boolean }[] | null, loadN: undefined as unknown as number,
  reloadEmpty: undefined as unknown as boolean, reloadAct: undefined as unknown as PActKind | null, slap: undefined as unknown as boolean,
  byHand: undefined as unknown as boolean, revOpen: undefined as unknown as boolean, revClose: undefined as unknown as boolean,
  magDropped: undefined as any, dumpDest: undefined as unknown as GGrid | null, dumped: undefined as unknown as GItem | null,
  handCase: undefined as any, handOut: undefined as unknown as boolean, ejected: undefined as unknown as string[] | undefined, ejecting: undefined as unknown as number, ejectT: undefined as unknown as number,
  adsT: undefined as unknown as number, ads: undefined as unknown as boolean,
  fireCd: undefined as unknown as number, swapT: undefined as unknown as number, swapMax: undefined as unknown as number, raiseT: undefined as unknown as number, raiseMax: undefined as unknown as number,
  flashBarrels: null as number[] | null, lastShot: null as any, shotLog: [] as any[], // (a gun of several barrels: the barrel, its effective length and the rounds left in each, per round fired: for tuning and tests)
  burstQ: undefined as unknown as number, hyperQ: undefined as unknown as number, cylShots: undefined as unknown as number, cycleMax: undefined as unknown as number,
  spin: undefined as unknown as number, flashIdx: undefined as unknown as number, flashT: undefined as unknown as number, kick: undefined as unknown as number,
  sinceShot: undefined as unknown as number, sinceHurt: undefined as unknown as number, sinceFire: undefined as unknown as number,
  lastTrigger: undefined as unknown as boolean, pressBuf: undefined as unknown as number, rHeldAt: undefined as unknown as number, fLatch: undefined as unknown as boolean, fEdge: undefined as unknown as boolean,
  pairHeld: undefined as unknown as WeaponDef | null, pairAim: undefined as unknown as [number, number] | null,
  stowed: undefined as unknown as boolean, stowW: undefined as unknown as number,
  act: undefined as unknown as PAct | null, magChk: undefined as unknown as PMagChk | null, rChk: undefined as unknown as PRChk | null,
  action: undefined as unknown as PAction | null, held: undefined as unknown as PHeld | null, throwStr: undefined as unknown as number | undefined,
  inspectT: undefined as unknown as number, inspectDur: undefined as unknown as number, inspHold: undefined as unknown as boolean, inspYaw: undefined as unknown as number, inspPitch: undefined as unknown as number,
  // recoil, sway and the camera
  rc: undefined as unknown as PRecoil, hk: undefined as unknown as PHeadKick, flinch: undefined as unknown as PYP, swayOff: undefined as unknown as PYP, aimScreen: undefined as unknown as PYP,
  shove: undefined as unknown as number, shoveV: undefined as unknown as number, swayT: undefined as unknown as number, walkAmp: undefined as unknown as number,
  zipVm: undefined as unknown as number, swayX: undefined as unknown as number, swayY: undefined as unknown as number, bobT: undefined as unknown as number, shakeT: undefined as unknown as number,
  bipodT: undefined as unknown as number, bipodOn: undefined as unknown as boolean,
  // loose carry: where the arms point (they trail the head at the hip unless Shift brings the gun up), and how loose they are now
  armYaw: undefined as unknown as number, armPitch: undefined as unknown as number, looseT: 0,
  // timers and the rest of what a frame leaves
  healLeft: undefined as unknown as number, reviveT: undefined as unknown as number, stateT: undefined as unknown as number, specIdx: undefined as unknown as number,
  noAmmoT: undefined as unknown as number | undefined, dryT: undefined as unknown as number | undefined, shoutT: undefined as unknown as number | undefined,
  sayAt: undefined as unknown as number | undefined, pingAt: undefined as unknown as number | undefined, lastR: undefined as unknown as number | undefined, midAt: undefined as unknown as number,
  sidN: undefined as unknown as number | undefined, burstId: undefined as unknown as number | undefined, packIdx: undefined as unknown as number | undefined,
  hitQ: undefined as unknown as Map<number, PHitQ>, wheel: undefined as unknown as PWheel | null,
  navRearm: undefined as (() => void) | undefined,
  // caches (made the first time they're wanted)
  _quick: undefined as (PHeldKind | null)[] | undefined, _rm: undefined as WeakMap<WeaponDef, PRecoilModel> | undefined,
  _climbArms: undefined as { g: THREE.Group; arms: { s: THREE.Mesh; h: THREE.Mesh }[] } | undefined, _zipKit: undefined as THREE.Object3D | undefined,
  _specQ: undefined as THREE.Quaternion | null | undefined, _look: undefined as THREE.Vector3 | undefined, _lookW: undefined as unknown as number,
  _lyaw: undefined as number | undefined, _lpitch: undefined as number | undefined, _dtCam: undefined as unknown as number,
  _hp: undefined as number[] | null | undefined, _hpL: undefined as number[] | null | undefined, _limbs: undefined as PLimbs | undefined,

  // ------------------------------------------------------------- run state
  newRun() {
    this.credits = 500;
    this.stk = {}; // (the stickers you've found: yours for the run, js/stickers.ts)
    G.Gear.starter(this); // kit, pockets and locker (js/gear.ts)
    this.weapons = {}; this.setSidearm('p9'); // just a sidearm: the first primary comes from the shop (G.Game's picker: what you've earned of js/arsenal.ts)
    this.sidearmChosen = false;
    this.stash = G.Gear.stashProxy(this); // weapon parts owned but not fitted: items, read as { partId: count }
    this.stats = { kills: 0, dmg: 0, hs: 0, downs: 0, revives: 0 } as PStats;
  },
  // the sidearm you start a run with (js/arsenal.ts), loaded with tracers (or its own load: Arsenal.startAm, the USP's +P), and two spare loads of them in the small
  // pockets (in place of the last one's)
  setSidearm(id: string, build?: PBuild) {
    const w = this.makeWeapon(id, build), am = G.Arsenal.has(id) ? G.Arsenal.startAm(id) : G.ammoOk(G.calOf(w.def), 'tracer');
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
  magSize(x: WeaponDef | { def: WeaponDef; rl?: string | null }) { return G.capOf(x); }, // (a weapon, or a def: a gun of several barrels holds what the round type in its block lets it, js/data.ts G.capOf)
  reserveMax(def: WeaponDef) { return def.reserve; },
  // a weapon as built: def is the compiled build (stats changed by its parts), see js/parts.ts
  makeWeapon(id: string, build?: PBuild): PWeapon {
    const w = G.Sim.makeWeapon(id, build); // (js/sim.ts: the gun as built, loaded)
    // reserve: the rounds in the magazines and boxes you carry for it
    Object.defineProperty(w, 'reserve', { get: () => (G.Me.kit ? G.Gear.rounds(G.Me, w.def) : 0) });
    return w;
  },
  // something you picked up, from the host: onto you (no room after all: put back down, where it lay)
  lootGot(packed: any, x: number, z: number, at: number) {
    const Gr = G.Gear, it = Gr.unpack(packed), name = G.Loot.name(packed);
    let ok = false;
    if (it.k === 'gun') { // into your hands; the one you had there into your backpack if there's room, or down where this one lay
      const slot = it.w.def.slot, old = this.weapons[slot], stow = old && this.packRoom(Gr.gunItem(old));
      if (stow) Gr.place(this.kit.pack.grids, Gr.gunItem(old));
      else if (old) G.Net.toHost({ t: 'drop', item: Gr.pack(Gr.gunItem(old)), x, z, at });
      this.weapons[slot] = it.w as PWeapon;
      return this.inHand(slot, `${name}${!old ? '' : stow ? ` — your ${old.def.name} is in your backpack` : ` — your ${old.def.name} is left in its place`}`);
    }
    if (Gr.isGear(it) && !Gr.MOUNTS[it.k] && !this.kit[it.k]) { this.kit[it.k] = it; ok = true; } // worn, if that's free
    else if (Gr.MOUNTS[it.k] && Gr.mountFree(this, it.k)) { Gr.mountOn(this, it.k)[it.k] = it; ok = true; } // fitted, likewise
    else if (it.k === 'pouch') ok = !!Gr.place(Gr.molles(this), it) || Gr.stow(this, it); // a pouch: straight onto your MOLLE if there's room
    else ok = Gr.stow(this, it);
    if (ok) { G.HUD.toast('', `Picked up: ${name}`, 1.4); G.Audio.pickup(); if (G.InvUI.field) G.InvUI.render(); }
    else { G.HUD.toast('', `No room on you for the ${name}`, 1.6); G.Net.toHost({ t: 'drop', item: packed, x, z, at }); }
  },
  // put something down at your feet (from the inventory): it's the host's to hand out now
  dropItem(it: GItem) {
    const a = this.yaw + (Math.random() - 0.5) * 0.8, d = 0.45 + Math.random() * 0.25;
    G.Net.toHost({ t: 'drop', item: G.Gear.pack(it), x: this.pos.x - Math.sin(a) * d, z: this.pos.z - Math.cos(a) * d });
    G.Audio.click();
  },
  // the host's answer to a cabinet edit: what you took that someone else had already (it comes off you again),
  // and what you put in that didn't fit after all (it comes back)
  cabSettle(deny: Record<string, number> | null, ret: any) {
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
  takeAttachment(pid: string, fit: boolean) {
    const GS = G.Gunsmith, Gr = G.Gear, p = GS.PARTS[pid], w = this.cur();
    if (!p) return;
    const keep = (q: string) => { const it = Gr.partItem(q); if (Gr.stow(this, it)) return true; this.dropItem(it); return false; };
    const sl = fit && w && GS.slotsOf(w.def.id, w.def.build).find((s: any) => GS.fitsSlot(s, p, w.def.id, w.def.build));
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
  // a different gun in that slot now: it's the one in your hands, drawn
  inHand(slot: string, msg: string) {
    const w = this.weapons[slot];
    this.slot = slot; this.reloading = false; this.inspectT = 0; this.burstQ = 0;
    G.R.setViewmodel(w.def);
    this.raiseT = this.raiseMax = this.drawTime();
    if (G.GunAudio.available()) { G.GunAudio.buildDry(w.def.soundKey); G.GunAudio.buildDry(G.Gunsmith.roundSoundKey(w.def, w.chamber || w.ammo)); if (w.def.barrels) for (const k of Object.keys(w.def.barrels.rounds)) { const sd = G.roundSpec(w.def, k); for (const mm of G.barrelMm(w.def, k)) G.GunAudio.buildDry(G.shotSoundKey(sd, mm, w.ammo)); } } // (a gun of several barrels: a report for each effective length)
    G.Audio.pickup();
    G.HUD.toast('', msg, 2);
  },
  // is there room in your backpack for a gun (with another one taken out of it first)?
  packRoom(gunIt: GItem, out?: GItem | null) {
    const pack = this.kit.pack;
    if (!pack) return false;
    const where = out && G.Gear.packGuns(this).find(([it]) => it === out);
    const p = where && where[1].items.find((q: GCell) => q.it === out);
    if (where) G.Gear.removeFrom(where[1], out);
    const ok = pack.grids.some((g: GGrid) => G.Gear.findSpot(g, gunIt));
    if (where) G.Gear.put(where[1], out, p!.x, p!.y, p!.r);
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
      this.weapons[slot] = it.w as PWeapon;
      this.inHand(slot, `${it.w.def.name} out of your backpack${cur ? ', your ' + cur.def.name + ' in' : ''}`);
    }, 'case');
    (this.action as PAction | null)!.key = 'KeyB';
  },
  // refit a weapon after the gunsmith changed its build (ammo carried over, mag clamped to the new size)
  refit(w: GWeapon, build: PBuild) {
    const conv = G.Gunsmith.convert(w.def.id, build);
    if (conv) return this.convert(w, conv);
    const def = G.Gunsmith.compile(w.def.id, build);
    w.def = def; w.sup = def.sup;
    if (this.cur && this.cur() === w && G.R && G.R.vm && G.Game.phase === 'level') G.R.setViewmodel(def); // a different magazine in it, say
    w.mag = Math.min(w.mag, this.magSize(w));
    G.Gear.refitMags(this, def);
    if (w.tube) w.tube.length = Math.min(w.tube.length, w.mag);
  },
  // Another gun's receiver kit went in: it's that gun now (G.Gunsmith.convert). The parts that came off go to
  // your locker (the old gun's own barrel and such go with its kit); what was loaded stays only if the new gun
  // takes the same rounds from the same magazines, otherwise the magazine comes out with its rounds (or the
  // loose rounds go back in boxes).
  convert(w: GWeapon, { id, build, off }: { id: string; build: PBuild; off: string[] }) {
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
    if (keep) { w.mag = Math.min(w.mag, this.magSize(w)); if (w.tube) w.tube.length = Math.min(w.tube.length, w.mag); }
    if (!G.chambered(def)) { if (w.chamber) { w.tube.push(w.chamber); w.mag++; } w.chamber = null; } // (no chamber of its own: into the magazine)
    if (this.cur && this.cur() === w && G.R && G.R.vm && G.Game.phase === 'level') G.R.setViewmodel(def);
    const misfit = (def.misfit || []).map((s: string) => GS.PARTS[def.build[s]].name);
    if (G.HUD) G.HUD.toast('', `Your ${old.name} is now a ${def.name}${keep ? '' : a0.kind === 'mag' && a1.kind === 'mag' ? ', its magazine out' : ''}${misfit.length ? `. It won't fire until you replace: ${misfit.join(', ')}` : ''}`, 3.5);
  },
  cur(): PWeapon { return this.weapons[this.slot] as PWeapon; },
  // The sight as it's set now: its power (a variable scope's step, or a magnifier in or out), whether you're
  // looking through a magnified picture, and the aiming sensitivity / view tightening (zoom).
  sight(w: GWeapon) {
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
  wheelItems(): PWheelItem[] {
    const w = this.cur(), d = w && w.def, on = (k: string) => (w && w[k] ? 'on' : 'off');
    const L = d && d.magLevels, mi = w && L ? this.sight(w).i : 0;
    return [
      { id: 'light', label: 'Light', sub: d && d.light ? on('light') : 'none fitted', off: !(d && d.light), act: () => this.toggleTac('light') },
      { id: 'laser', label: 'Laser', sub: d && d.laser ? on('laser') : 'none fitted', off: !(d && d.laser), act: () => this.toggleTac('laser') },
      { id: 'mag', label: 'Magnifier', sub: d && d.magnifier ? (mi ? 'in' : 'out') : 'none fitted', off: !(d && d.magnifier), act: () => { w.magI = mi ? 0 : L.length - 1; G.Audio.click(); G.HUD.toast('', mi ? 'Magnifier out: 1×' : `Magnifier in: ${L[L.length - 1]}×`, 0.7); } },
      { id: 'hurt', label: 'Injuries', sub: 'report them', act: () => this.say(this.injuryReport()) },
      { id: 'ammo', label: 'Ammo', sub: 'report it', act: () => this.say(this.ammoReport()) },
      { id: 'hold', label: 'Hold', sub: 'hold position', act: () => this.say('Holding here.') },
      { id: 'clear', label: 'Clear', sub: 'room clear', act: () => this.say('Clear!') },
      { id: 'contact', label: 'Contact', sub: 'and ping it', act: () => { (this as { ping(strong: boolean): void }).ping(true); this.say('Contact! Where I\'ve marked.'); } },
      { id: 'nvg', label: 'Night vision', sub: this.nvItem() ? (this.nvItem()!.dn ? 'down (N)' : 'up (N)') : 'none on', off: !this.nvItem(), act: () => this.nvFlip() },
      ...(d && d.reticle === 'thermal' ? [{ id: 'thpal', label: 'Thermal', sub: ['white-hot', 'black-hot', 'ironbow'][w.thPal || 0] + ' (T)', act: () => this.thermalPalette() }] : []),
      { id: 'ir', label: 'IR illuminator', sub: this.nvItem() ? (this.irOn ? 'on' : 'off') + ' (Shift+N)' : 'no goggles', off: !this.nvItem(), act: () => this.irToggle() },
    ];
  },
  wheelOpen() {
    if (this.wheel || this.dead || G.Game.phase !== 'level') return;
    this.wheel = { x: 0, y: 0, sel: -1, items: this.wheelItems() };
    let el = document.getElementById('commWheel');
    if (!el) { el = document.createElement('div'); el.id = 'commWheel'; document.body.appendChild(el); }
    const N = this.wheel.items.length;
    el.innerHTML = this.wheel.items.map((it: { off?: boolean; label: string; sub: string }, i: number) => { const a = (i / N) * Math.PI * 2 - Math.PI / 2; return `<div class="cw-it${it.off ? ' off' : ''}" style="left:calc(50% + ${(Math.cos(a) * 118).toFixed(1)}px);top:calc(50% + ${(Math.sin(a) * 118).toFixed(1)}px)"><b>${it.label}</b><small>${G.Pad.text(it.sub)}</small></div>`; }).join('') + '<i class="cw-ptr"></i>';
    el.classList.add('on');
    G.Audio.click();
  },
  wheelMove(dx: number, dy: number) {
    const W = this.wheel!, el = document.getElementById('commWheel')!;
    W.x += dx; W.y += dy;
    const r = Math.hypot(W.x, W.y);
    if (r > 90) { W.x *= 90 / r; W.y *= 90 / r; }
    const N = W.items.length, a = Math.atan2(W.y, W.x) + Math.PI / 2;
    const sel = r > 28 ? ((Math.round(a / (Math.PI * 2 / N)) % N) + N) % N : -1;
    if (sel !== W.sel) { W.sel = sel; el.querySelectorAll('.cw-it').forEach((e, i) => e.classList.toggle('sel', i === sel)); if (sel >= 0) G.Audio.click(); }
    const p = el.querySelector<HTMLElement>('.cw-ptr'); if (p) p.style.transform = `translate(${W.x.toFixed(1)}px, ${W.y.toFixed(1)}px)`;
  },
  wheelClose(pick?: boolean) {
    const W = this.wheel, el = document.getElementById('commWheel');
    this.wheel = null;
    if (el) el.classList.remove('on');
    const it = W && pick && W.sel >= 0 ? W.items[W.sel] : null;
    if (!it) return;
    if (it.off) { G.HUD.toast('', it.id === 'nvg' || it.id === 'ir' ? 'No night vision on your helmet' : `No ${it.label.toLowerCase()} on the ${this.cur().def.name}`, 1); G.Audio.deny(); return; }
    it.act();
  },
  // a call to the squad (the chat, under your name)
  say(m: string) {
    const now = performance.now();
    if (now - (this.sayAt || 0) < 700) return;
    this.sayAt = now;
    G.Net.toHost({ t: 'chat', m });
  },
  // what you're hit with, as you'd call it: each hurt part and what's wrong with it, and how much blood you've lost
  injuryReport() {
    const b = this.body;
    if (!b) return 'I\'m good.';
    const parts = Object.entries(b.parts).map(([k, p]) => [G.Med.NAME[k].toLowerCase(), G.Med.describe(p).filter((s) => s !== 'tourniquet on'), p] as [string, string[], any]).filter(([, d, p]) => d.length || p.hp < p.max * 0.9);
    const blood = Math.round(b.blood);
    if (!parts.length) return blood < 95 ? `Not hit, but I've lost blood: ${blood}%.` : 'I\'m not hit. Good to go.';
    const bleeding = parts.some(([, d]) => d.some((s) => /bleeding/.test(s)));
    return `I'm hit: ${parts.map(([n, d]) => `${n}${d.length ? ' (' + d.join(', ') + ')' : ' (hurt)'}`).join('; ')}. Blood ${blood}%.${bleeding ? ' Bleeding.' : ''}`;
  },
  // what you've got for the gun in your hands: in it, and in your magazines and boxes
  ammoReport() {
    const w = this.cur();
    if (!w || w.def.cls === 'BOW' && !w.def.cal) return 'Need ammo.';
    const inGun = w.mag + (w.chamber ? 1 : 0), spare = G.Gear.rounds(this, w.def), cap = this.magSize(w), mags = cap ? spare / cap : 0;
    return spare + inGun === 0 ? 'I\'m out! Need ammo.' : mags < 1.5 ? `Low on ammo: ${inGun} in the gun, ${spare} spare.` : `Ammo's fine: ${inGun} in the gun, ${spare} spare (about ${Math.floor(mags)} reloads).`;
  },

  // switch the gun's light or laser (it remembers: each gun has its own switches)
  toggleTac(kind: 'light' | 'laser') {
    const w = this.cur();
    if (!w || this.dead) return;
    if (kind === 'light' ? !w.def.light : !w.def.laser) { G.HUD.toast('', `No ${kind} on the ${w.def.name}`, 1); G.Audio.deny(); return; }
    w[kind] = !w[kind];
    G.Audio.click();
    G.HUD.toast('', `${kind === 'light' ? 'Light' : 'Laser'} ${w[kind] ? 'on' : 'off'}`, 0.7);
  },
  // How much muzzle flash a shot from this gun makes, against a bare muzzle's 1 (sent with the shot: on a night level it's how far
  // it gives you away, and how well they can shoot back at it: js/server.ts NIGHT): a brake or a compensator throws it out to the
  // sides (1.2), a flash hider all but kills it (0.3), a suppressor more so (0.1), a subsonic suppressed round or a bow none
  flashOf(w: GWeapon) {
    const d = w.def;
    if (d.cls === 'BOW') return 0;
    if (w.sup) return d.quiet ? 0 : 0.1;
    return d.device === 'flash' ? 0.3 : d.device === 'brake' || d.device === 'comp' ? 1.2 : 1;
  },
  // what's lit on this gun (as sent to the squad): 1 light, 2 laser, 4 green laser, 8 bright light
  tacFlags(w: GWeapon) {
    if (!w || this.stowed) return 0;
    const d = w.def;
    return (w.light && d.light ? 1 | (d.light > 1.2 ? 8 : 0) : 0) | (w.laser && d.laser ? 2 | (d.laser === 'g' ? 4 : 0) : 0);
  },
  // How far it is to what's under the crosshair of the scope you're looking through (a ballistic computer's readout: js/viewmodel.ts), along the scope's own axis: the level or a suspect, whichever's nearer;
  // null for nothing in reach (sky, or past 1500 m) or while you're not looking through it
  scopeRange(): number | null {
    const sc = G.R.scopeCam;
    if (!sc || (G.R.pipLive || 0) < 0.5) return null;
    return this.rangeAlong(sc);
  },
  // What a rail ballistic computer's laser reads (the readout on its back, display_range: js/viewmodel.ts paintRange): through a scope, along the scope's axis (scopeRange);
  // otherwise along the view's centre line, what's under the crosshair. null for nothing in reach.
  aimRange(): number | null {
    const sc = G.R.scopeCam;
    return sc && (G.R.pipLive || 0) >= 0.5 ? this.rangeAlong(sc) : this.rangeAlong(G.R.camera);
  },
  // How far it is from a camera along its centre line to the level or a suspect, whichever's nearer; null for nothing within 1500 m (the sky)
  rangeAlong(cam: THREE.Object3D): number | null {
    const map = G.Game.map;
    if (!cam || !map) return null;
    const MAX = 1500, o = new THREE.Vector3(), q = new THREE.Quaternion();
    cam.getWorldPosition(o); cam.getWorldQuaternion(q);
    const f = new THREE.Vector3(0, 0, -1).applyQuaternion(q);
    let t = G.Level.raycast(map, o.x, o.y, o.z, f.x, f.y, f.z, MAX).t;
    const rc = new THREE.Raycaster(o.clone(), f.clone(), 0, t);
    for (const ev of G.Views.enemies.values()) {
      if (!ev.alive || !ev.rig || !ev.rig.root.visible) continue;
      const sc2 = ev.def.scale, cx = ev.pos.x - o.x, cy = ev.pos.y + sc2 - o.y, cz = ev.pos.z - o.z, along = cx * f.x + cy * f.y + cz * f.z;
      if (along < 0 || along > t + 1.5 || Math.hypot(cx - f.x * along, cy - f.y * along, cz - f.z * along) > 1.4 * sc2) continue; // (nowhere near the line)
      const hit = rc.intersectObject(ev.rig.root, true)[0];
      if (hit && hit.distance < t) t = hit.distance;
    }
    return t < MAX - 0.5 ? t : null;
  },
  // A ping: the spot you're looking at (on a wall, the floor, someone) marked for the whole squad, in your colour
  // with your name, and nothing about what's there (G.Views.addPing). Not too often.
  ping() {
    const now = performance.now();
    if (now - (this.pingAt || 0) < 400) return;
    this.pingAt = now;
    const cam = G.R.camera, o = cam.position, f = new THREE.Vector3(0, 0, -1).applyQuaternion(cam.quaternion);
    const h = G.Level.raycast(G.Game.map!, o.x, o.y, o.z, f.x, f.y, f.z, 200);
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
    const isGameKey = (c: string) => ['Tab', 'Space', 'KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyQ', 'KeyE'].includes(c);
    window.addEventListener('keydown', (e) => {
      if (G.Game.chatOpen || G.Game.phase !== 'level') return;
      if (isGameKey(e.code)) e.preventDefault();
      if (e.repeat) return;
      this.keys[e.code] = true;
      if (G.Space.key(e.code)) return; // (in a seat of the squad's ship: the key is hers)
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
        case 'KeyN': if (e.shiftKey) this.irToggle(); else this.nvFlip(); break;
        case 'KeyT': this.thermalPalette(); break;
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
      if (!G.Game.locked || G.Game.menuOpen() || (e.isTrusted && G.Game.softLocked)) return;
      if (e.button === 0) { this.mouse.l = true; this.pressBuf = 0.15; if (this.dead) this.specIdx++; }
      if (e.button === 2) this.mouse.r = true;
      if (e.button === 1) { // the middle button: a tap pings, held it opens the comms wheel (wheelOpen)
        e.preventDefault();
        const at = (this.midAt = performance.now());
        setTimeout(() => { if (this.midAt === at) this.wheelOpen(); }, this.WHEEL_HOLD * 1000);
      }
    });
    window.addEventListener('mouseup', (e) => {
      if (e.isTrusted && G.Game.softLocked) return; // (the one a browser sends after any tap: it isn't this button letting go)
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
      if (!G.Game.locked || G.Game.phase !== 'level' || Math.abs(e.deltaY) <= 5 || (e.isTrusted && G.Game.softLocked)) return;
      const w = this.cur(), L = w && w.def.magLevels;
      if (L && this.ads && this.adsT > 0.5) {
        const i = this.sight(w).i, n = G.U.clamp(i + (e.deltaY < 0 ? 1 : -1), 0, L.length - 1);
        if (n !== i) { w.magI = n; G.Audio.click(); G.HUD.toast('', w.def.magnifier ? (n ? `Magnifier in: ${L[n]}×` : 'Magnifier out: 1×') : `${L[n]}×`, 0.7); }
        return;
      }
      this.swap(this.slot === 'p' ? 's' : 'p');
    });
    document.addEventListener('mousemove', (e) => { if (!(e.isTrusted && G.Game.softLocked)) this.lookBy(e.movementX, e.movementY, 0.0022 * G.Game.settings.sens); });
  },
  // the mouse, or the right stick (js/gamepad.ts), moved by dx, dy; sens: how far a unit of that turns the view, in radians
  lookBy(dx: number, dy: number, sens: number) {
    if (!G.Game.locked || this.dead || this.out) return; // (out cold: no looking round)
    if (this.wheel) { this.wheelMove(dx, dy); return; } // (the comms wheel open: the mouse picks on it)
    const z = this.viewer ? 1 / this.VIEWER.MAG : G.U.lerp(1, this.sight(this.cur()).zoom, this.adsT || 0); // (a viewer's magnification slows the view as much)
    const s = sens * z;
    // a magazine in your hand, or the gun held open for a chamber check: the mouse turns that, not your view
    const mc = this.magChk;
    if (mc && !mc.rel && mc.k > 0.6) { mc.yaw = G.U.clamp(mc.yaw + dx * s * 1.6, -1.4, 1.4); mc.pitch = G.U.clamp(mc.pitch + dy * s * 1.6, -0.8, 1.4); return; }
    if (this.inspHold || (this.rChk && !this.rChk.rel && this.rChk.k > 0.6)) { this.inspYaw = G.U.clamp((this.inspYaw || 0) + dx * s * 1.4, -1.5, 1.5); this.inspPitch = G.U.clamp((this.inspPitch || 0) + dy * s, -0.6, 0.6); return; } // (inspYaw: the roll)
    this.yaw -= dx * s;
    this.pitch = G.U.clamp(this.pitch - dy * s, -1.5, 1.5);
  },

  // ------------------------------------------------------------- lifecycle
  spawn(x: number, z: number) {
    this.pos = new THREE.Vector3(x, 0, z);
    this.vel = new THREE.Vector3();
    this.yaw = 0; this.pitch = 0;
    this.body = G.Med.newBody(); // injuries part by part (js/medical.ts); hp is the overall, for the team display
    this.hp = this.maxHp();
    this.down = false; this.out = false; this.dead = false; // (out: unconscious, as well as down)
    this.rounds = [];
    this.crouch = false; this.prone = false; this.stanceT = 0; this.onGround = true; this.seat = null; this.zipRide = null; this.climb = null; this.viewer = null; this.viewerMask(false); this.treating = new Map();
    this.eyeH = 1.62;
    this.fireCd = 0; this.swapT = 0; this.reloading = false; this.reloadT = 0; this.burstQ = 0;
    this.adsT = 0; this.ads = false; this.kick = 0; this.flashT = 0;
    this.rc = { y: 0, p: 0, vy: 0, vp: 0 }; // recoil: aim offset (rad, yaw left / pitch up) and its momentum
    this.shove = 0; this.shoveV = 0; // and the gun driven back into the shoulder (m) and how fast
    this.hk = { y: 0, p: 0, r: 0, vy: 0, vp: 0, vr: 0, w: 15 }; // a head hit: how far your head's been thrown (rad: yaw left, pitch up, roll), how fast, and how fast it comes back
    this.flinch = { y: 0, p: 0 }; this.swayOff = { y: 0, p: 0 }; this.swayT = Math.random() * 20; this.walkAmp = 0;
    this.sinceHurt = 99; this.sinceFire = 99; this.healLeft = 0;
    this.reviveT = 0; this.bobT = 0;
    this.stateT = 0; this.specIdx = 0; this.pressBuf = 0; this.lastTrigger = false;
    this.lowToggle = false; this.stowed = false; this.action = null; this.held = null; this.stowW = 0; this.raiseMax = 0.3; this.shakeT = 0;
    this.spin = 0; this.hyperQ = 0; this.cylShots = 0; this.cycleMax = 0; this.flashIdx = 0;
    this.hitQ = new Map();
    if (this.slot === 's' && this.weapons.p) this.slot = 'p';
    if (!this.weapons[this.slot]) this.slot = Object.keys(this.weapons)[0];
    G.R.setViewmodel(this.cur().def);
    // face away from the nearest wall
    const m = G.Game.map!;
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

  update(dt: number) {
    const map = G.Game.map!;
    if (!map || !this.pos) return;
    this.stepRounds(dt);
    this.stepFrags(dt);
    G.R.fisheye = 0; // (spectating turns it on: js/player.ts spectate)
    G.R.nv = null; // (night vision: nvStep, while you're up and about)
    if (this.dead) { if (G.R.vm) G.R.vm.visible = false; this.sendState(dt); return; } // (no gun of yours in the view of someone else's helmet; the camera's placed once their rigs are posed: G.Game.loop, spectate)

    this.sinceHurt += dt; this.sinceFire += dt;
    this.pressBuf = Math.max(0, this.pressBuf - dt);
    

    // bleeding (down: slowly, and nothing clots: you're dead when it's all gone, unless someone stops it). Very low,
    // you black out; blood bags from a teammate bring you round (still down: they get you up)
    const fate = G.Med.tick(this.body, dt, this.down);
    this.hp = G.Med.overall(this.body);
    if (fate === 'dead') return this.die(this.down ? this.downCause() : 'Bled out');
    if (fate === 'out' && !this.out) this.goDown(true);
    else if (this.out && fate !== 'out') { this.out = false; G.HUD.toast('', 'You come round: a teammate can get you up', 2.4); }
    this.bleed = this.down ? G.Med.bleedOut(this.body) : null; // (seconds left, or null: stable)
    // unconscious, you can give up: hold G (GIVE_UP s) and you're killed in action at once, spectating, rather than waiting it out
    this.giveUp = this.out && this.keys.KeyG && !G.Game.chatOpen ? (this.giveUp || 0) + dt : 0;
    if (this.giveUp >= this.GIVE_UP) { this.giveUp = 0; return this.die('Gave up, unconscious and bleeding'); }

    this.move(dt, map);
    G.Footsteps.self(dt); // (your own footsteps: js/footsteps.ts)
    // the gun in your hands is the one in view (moved out of its slot in the Tab screen, rebuilt, swapped, a sticker put on: whatever changed it)
    const cw = this.cur();
    if (cw ? !G.R.vm || G.R.vm.userData.key !== G.R.vmKey(cw.def, cw.stickers) : G.R.vm) G.R.setViewmodel(cw ? cw.def : null);
    this.weaponUpdate(dt);
    this.interact(dt);
    this.updateCamera(dt);
    this.nvStep(dt);
    this.sendState(dt);
    this.fEdge = false;
  },
  // ------------------------------------------------------------- night vision
  // On the helmet's shroud (js/gear.ts 'nvg'): N (or the comms wheel) flips it down in front of your eyes or up over the
  // brow, a third of a second either way; whether it's down is kept on the item (dn: saved with your kit). Down, the
  // view's drawn through it (js/render.ts nvPass); others see it on your helmet, down or up (kitLook: js/rig.ts).
  // Shift+N (or the wheel) switches the goggles' IR illuminator: a cone of infrared from the head, light only night vision
  // sees (js/lightgrid.ts lgNv), for a room with no light at all to amplify. Anyone else with goggles sees it glaring at
  // them (its source, from inside its cone), as a weapon light gives you away; the suspects have none, so not to them.
  NV_FLIP: 0.32,
  nvK: 0,
  irOn: false,
  // T (or the wheel): a thermal sight's palette, white-hot, black-hot, ironbow, round again
  thermalPalette() {
    const w = this.cur();
    if (!w || w.def.reticle !== 'thermal') return;
    w.thPal = ((w.thPal || 0) + 1) % 3;
    G.Audio.click(); G.HUD.toast('', ['White-hot', 'Black-hot', 'Ironbow'][w.thPal], 0.8);
  },
  irToggle() {
    if (!this.nvItem()) { G.HUD.toast('', 'No night vision on your helmet', 1.2); G.Audio.deny(); return; }
    this.irOn = !this.irOn;
    G.Audio.click(); G.HUD.toast('', this.irOn ? 'IR illuminator on: anyone with night vision sees it' : 'IR illuminator off', 1.4);
  },
  nvItem(): GItem | null { const h = this.kit && this.kit.helmet; return (h && h.nvg) || null; },
  nvFlip() {
    const n = this.nvItem();
    if (!n) { G.HUD.toast('', this.kit && this.kit.helmet ? 'No night vision on your helmet' : 'No helmet, no night vision', 1.2); G.Audio.deny(); return; }
    if (this.dead || this.out) return;
    n.dn = !n.dn;
    G.Audio.nvFlip(!!n.dn);
  },
  nvStep(dt: number) {
    const n = this.nvItem(), want = n && n.dn && !this.out && !this.dead ? 1 : 0;
    this.nvK += G.U.clamp(want - this.nvK, -dt / this.NV_FLIP, dt / this.NV_FLIP);
    const d = n ? G.Gear.defOf(n) : null;
    G.R.nv = d && d.nv && this.nvK > 0 ? { spec: d.nv, k: this.nvK, fov: G.Game.settings.fov, ir: this.irOn } : null;
    // others' illuminators, seen through the goggles: their source glaring from their head, the brighter the more it's pointed at you
    if (G.R.nv && G.R.nv.k > 0.9 && G.Views && G.Game.map) {
      const cam = G.R.camera.position;
      for (const pv of G.Views.players.values()) {
        const st = pv.st;
        if (!st || !st.ir || st.dd || !pv.rig || !pv.rig.root.visible) continue;
        const p = pv.rig.head.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(0, 0.08, 0));
        const to = cam.clone().sub(p), d = to.length(), fw = new THREE.Vector3(-Math.sin(st.yw), 0, -Math.cos(st.yw)), face = fw.dot(to.normalize());
        if (d < 40 && G.Level.los(G.Game.map, p.x, p.y, p.z, cam.x, cam.y, cam.z)) G.R.flare(p, 0xffffff, 0.04, face > 0.85 ? 1 : face > 0.5 ? 0.6 : 0.2, face > 0.85 ? 7 : 4);
      }
    }
  },

  move(dt: number, map: LvMap) {
    // belted into a seat in the helicopter (the hangar's, or the one that's brought you in): nowhere to go, the view turned
    // no further than a head turns
    if (this.seat != null) {
      const sp = (G.Space.on() ? G.Space : G.Game.hub ? G.Hangar : G.Landing).seatPos(this.seat); // (a seat of the squad's ship: js/space.ts)
      this.pos.set(sp.x, sp.y, sp.z); this.vel.set(0, 0, 0); this.onGround = true; this.hspeed = 0;
      this.crouch = true; this.stowed = true; this.lowToggle = false;
      this.yaw = sp.yaw + G.U.clamp(G.U.angDiff(sp.yaw, this.yaw), -1.9, 1.9);
      this.pitch = G.U.clamp(this.pitch, -0.7, 0.6);
      this.eyeH += (1.12 - this.eyeH) * Math.min(1, dt * 12);
      return;
    }
    if (this.zipRide) { this.zipStep(dt); return; } // (on a zipline: carried, not walking)
    if (this.climb) { this.climbStep(dt); return; } // (on the ladder, likewise)
    if (this.viewer) { // (at a viewer: standing still, till you walk off)
      const k = this.keys;
      if (k.KeyW || k.KeyA || k.KeyS || k.KeyD || this.padMove || this.down || this.dead) this.viewerOff();
      else { this.vel.set(0, 0, 0); this.hspeed = 0; return; }
    }
    const k = this.keys, blocked = this.down || G.Game.chatOpen || !G.Game.locked || !!(this.action && (this.action.kind === 'zip' || this.action.kind === 'bag'));
    let fw = blocked ? 0 : (k.KeyW ? 1 : 0) - (k.KeyS ? 1 : 0);
    let st = blocked ? 0 : (k.KeyD ? 1 : 0) - (k.KeyA ? 1 : 0);
    const pm = blocked ? null : this.padMove; // (a stick pushed part of the way: part of the speed, below)
    if (pm) { fw += pm.fw; st += pm.st; }
    // Space: weapon to low ready, move quicker, can't shoot. Shift: creep with the weapon steadied.
    const wasLow = this.lowReady;
    if (this.mouse.l || this.mouse.r || this.down || this.stowed) this.lowToggle = false; // firing or aiming brings the weapon up
    this.lowReady = !blocked && (!!this.lowToggle || !!(pm && pm.fast && !this.mouse.l && !this.mouse.r && !this.down && !this.stowed));
    this.steadying = !blocked && !this.lowReady && !!(k.ShiftLeft || k.ShiftRight || (pm && pm.slow));
    if (wasLow && !this.lowReady) this.raiseT = this.raiseMax = 0.5; // bringing the gun back up
    this.stanceT = Math.max(0, (this.stanceT || 0) - dt);
    let speed = this.lowReady ? this.SPEED.low : this.steadying ? this.SPEED.steady : this.SPEED.walk;
    if (this.prone) speed = this.stanceT > 0 ? 0 : this.SPEED.prone; // (a crawl; nothing while getting down or up)
    else if (this.crouch) speed = Math.min(speed, this.SPEED.crouch) * (this.lowReady ? 1.3 : this.steadying ? 0.75 : 1);
    speed *= this.speedMult();
    if (pm) speed *= pm.k;
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
    const prevY = this.pos.y, STEP = G.World.STEP, was = this.onGround, x0 = this.pos.x, z0 = this.pos.z;
    this.pos.x += this.vel.x * dt;
    this.pos.z += this.vel.z * dt;
    G.Level.resolve(map, this.pos, 0.35, prevY, STEP, true); // (anything a step high or less: walked up onto, not into; stairs as slopes)
    this.pos.y += this.vel.y * dt;
    // (shoulder a fractured pane and it comes down)
    if (map.cracked && this.vel.x * this.vel.x + this.vel.z * this.vel.z > 0.5) {
      const sp = Math.hypot(this.vel.x, this.vel.z), ux = this.vel.x / sp, uz = this.vel.z / sp, h = G.Level.raycast(map, this.pos.x, this.pos.y + 1.1, this.pos.z, ux, 0, uz, 0.8); // (past the sill you're stopped by: a pane's set back in its wall)
      if (h.pane != null && map.windows[h.pane] && map.windows[h.pane].cracked) this.roundPane(h.pane, new THREE.Vector3(this.pos.x + ux * h.t, this.pos.y + 1.1, this.pos.z + uz * h.t), new THREE.Vector3(ux, 0, uz), true);
    }
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
    // how fast you're really going: what the walls let you move, not what your legs are pushing for (into a wall: nothing,
    // so no stride, no bob, no steps; along one, the slide). The push itself stays in vel (a cracked pane shouldered, above).
    this.hspeed = dt > 0 ? Math.min(Math.hypot(this.vel.x, this.vel.z), Math.hypot(this.pos.x - x0, this.pos.z - z0) / dt) : 0;
    if (this.onGround && this.hspeed > 0.5) this.bobT += dt * Math.PI * G.Footsteps.cadence(this.hspeed, this.crouch ? 1 : 0); // (a dip of the view each step, on the steps' cadence: js/footsteps.ts)
  },
  // A coin-op viewer (the Sandia Crest's overlook: crest.scopes, js/furniture.ts): press F at one to put your eyes to it, a
  // MAG-power view out over the gorge, turned no further than YAW either side of where it points, UP and DOWN; the weapon away.
  // F again, or a step, and you're off it. REACH: how close you have to be; EYE: the eyepieces' height; AHEAD: how far in front
  // of the viewer's middle the view starts (just past its lenses, so its own head isn't in the way)
  VIEWER: { MAG: 15, REACH: 1.3, EYE: 1.36, AHEAD: 0.24, YAW: 1.2, UP: 0.25, DOWN: 0.45 },
  viewerNear(map: LvMap) {
    const sc = map && map.crest && map.crest.scopes;
    return (sc && sc.find((v: any) => Math.hypot(v.x - this.pos.x, v.z - this.pos.z) < this.VIEWER.REACH && Math.abs(this.pos.y - (v.y || 0)) < 0.5)) || null; // (y: the ground it stands on)
  },
  viewerOn(v: any) { this.viewer = { v, was: !!this.stowed, yaw: this.yaw, pitch: this.pitch }; this.yaw = v.yaw; this.pitch = 0; this.stowed = true; this.lowToggle = false; this.mouse.r = false; G.Audio.click(); },
  viewerOff() { const w = this.viewer; if (!w) return; this.viewer = null; this.viewerMask(false); if (G.R.vmRoot) G.R.vmRoot.visible = true; this.stowed = w.was; this.yaw = w.v.yaw + G.U.clamp(G.U.angDiff(w.v.yaw, this.yaw), -this.VIEWER.YAW, this.VIEWER.YAW); G.Audio.click(); },
  // the binoculars' two round fields, soft at their edges, the rest black (an overlay over the view, while you're at one)
  viewerMask(on: boolean) {
    let el = document.getElementById('viewerMask');
    if (!el && !on) return;
    if (!el) {
      el = document.createElement('div'); el.id = 'viewerMask';
      el.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:4;display:none';
      el.innerHTML = '<svg width="100%" height="100%"><defs><radialGradient id="vmEdge"><stop offset="0.86" stop-color="#000"/><stop offset="1" stop-color="#fff"/></radialGradient>'
        + '<mask id="vmHole"><rect width="100%" height="100%" fill="#fff"/><circle cx="39%" cy="50%" r="30%" fill="url(#vmEdge)"/><circle cx="61%" cy="50%" r="30%" fill="url(#vmEdge)"/></mask></defs>'
        + '<rect width="100%" height="100%" fill="#050505" mask="url(#vmHole)"/></svg>'
        + `<div style="position:absolute;left:50%;bottom:6%;transform:translateX(-50%);font:12px monospace;letter-spacing:2px;color:#9a9a9a">VIEWER · ${this.VIEWER.MAG}× · F TO STEP BACK</div>`;
      document.body.appendChild(el);
    }
    el.style.display = on ? 'block' : 'none';
  },
  // A zipline (the Sandia Crest's: js/level.ts crest.lines): lifted onto its bar (UP s), carried along under the cable, slowest
  // at the ends and fastest down the middle of it (V0 + V1 m/s), and let down onto the far side (DOWN s), hanging HANG m under
  // it. You hang by the left hand from the trolley's handle and the weapon stays in the right: you can look round and fire it, one-
  // handed (ONE_HAND, below: it's much harder to hold on target, and a magnified scope can't be used). The host takes where you
  // are as it does any time.
  // ONE_HAND: SPREAD, how much wider the rounds go (and the crosshair); KICK, how much harder each shot throws the gun; SWAY, how
  // much the aim wanders; GRIP, how much weaker the pull of the muzzle back down to the line (1 = as when standing)
  ZIP: { UP: 0.7, DOWN: 0.5, HANG: G.Level.ZIP_HANG, V0: 7, V1: 17, REACH: 1.6, HOLD: 0.4, ONE_HAND: { SPREAD: 2.2, KICK: 1.5, SWAY: 2.2, GRIP: 0.7 } }, // (HANG: hanging by the handle, js/level.ts zipKit)
  zipNear(map: LvMap) {
    const ls = map && map.crest && map.crest.lines;
    return (ls && ls.find((l: any) => Math.hypot(l.on[0] - this.pos.x, l.on[1] - this.pos.z) < this.ZIP.REACH && Math.abs(this.pos.y - l.gy[0]) < 0.5)) || null; // (gy: the ground each end's on)
  },
  zipStep(dt: number) {
    const z = this.zipRide!, l = z.l, Z = this.ZIP, under = (s: number) => { const p = G.Level.zipPoint(l, s); return new THREE.Vector3(p[0], p[1] - Z.HANG, p[2]); };
    z.t += dt;
    const was = this.pos.clone();
    let p;
    if (z.ph === 'up') { p = z.from.clone().lerp(under(0), G.U.smooth(0, 1, z.t / Z.UP)); if (z.t >= Z.UP) { z.ph = 'ride'; z.t = 0; } }
    else if (z.ph === 'ride') {
      const L = z.L || (z.L = Math.hypot(l.b[0] - l.a[0], l.b[2] - l.a[2]));
      z.s = Math.min(1, z.s + (Z.V0 + Z.V1 * Math.sin(Math.PI * z.s)) * dt / L);
      p = under(z.s);
      if (z.s >= 1) { z.ph = 'down'; z.t = 0; }
    } else {
      p = under(1).lerp(new THREE.Vector3(l.off[0], l.gy[1], l.off[1]), G.U.smooth(0, 1, z.t / Z.DOWN));
      if (z.t >= Z.DOWN) this.zipRide = null;
    }
    this.pos.copy(p); this.vel.set(0, 0, 0); this.onGround = true; this.hspeed = 0; this.crouch = false; this.prone = false;
    this.stowed = z.was; this.lowToggle = false; // (the weapon stays in hand)
    const dx = l.b[0] - l.a[0], dz = l.b[2] - l.a[2], n = Math.hypot(dx, dz) || 1;
    G.Rig.zipSwing(z.sw, ((this.pos.x - was.x) * dx + (this.pos.z - was.z) * dz) / n / Math.max(dt, 1e-3), dt); // (the swing of your own body, for the view: the same as others see)
    this.eyeH += (1.62 - this.eyeH) * Math.min(1, dt * 12);
  },
  // The ladders up the Crest House and the viewing building (crest.ladders: js/level.ts crestLadder): hold F at one's foot to
  // climb onto the roof, or at its head on the roof to climb down (over a parapet: lifted over it, l.over). Onto it (ON s), carried up or down it (CLIMB m/s), off it onto the roof or the ground (OFF
  // s); the weapon's away till you're off, and you can look round. REACH: how close to an end you have to be.
  LADDER: { CLIMB: 1.3, ON: 0.35, OFF: 0.45, REACH: 1.1, HOLD: 0.3, OUT: 0.42 },
  ladderNear(map: LvMap) {
    const R = this.LADDER.REACH;
    for (const l of (map && map.crest && map.crest.ladders) || []) { // (y0: the ground at its foot)
      if (Math.abs(this.pos.y - (l.y0 || 0)) < 0.5 && Math.hypot(l.foot[0] - this.pos.x, l.foot[1] - this.pos.z) < R) return { l, up: true };
      if (Math.abs(this.pos.y - l.top) < 0.5 && Math.hypot(l.head[0] - this.pos.x, l.head[1] - this.pos.z) < R) return { l, up: false };
    }
    return null;
  },
  climbStep(dt: number) {
    const c = this.climb!, l = c.l, C = this.LADDER, on = (y: number) => new THREE.Vector3(l.x + C.OUT, y, l.z); // (on it: just out from the wall)
    const y0 = l.y0 || 0, over = (u: number) => (l.over || 0) * Math.sin(Math.PI * u); // (over a parapet: lifted over it between the ladder and the roof)
    c.t += dt;
    let p;
    if (c.ph === 'on') { const u = G.U.smooth(0, 1, c.t / C.ON); p = c.from.clone().lerp(on(c.from.y), u); if (!c.up) p.y += over(u); if (c.t >= C.ON) { c.ph = 'climb'; c.t = 0; c.y = c.from.y; } }
    else if (c.ph === 'climb') {
      const to = c.up ? l.top : y0;
      c.y += (c.up ? 1 : -1) * C.CLIMB * dt;
      if (c.up ? c.y >= to : c.y <= to) { c.y = to; c.ph = 'off'; c.t = 0; }
      p = on(c.y);
    } else {
      const end = c.up ? new THREE.Vector3(l.head[0], l.top, l.head[1]) : new THREE.Vector3(l.foot[0], y0, l.foot[1]), u = G.U.smooth(0, 1, c.t / C.OFF);
      p = on(c.up ? l.top : y0).lerp(end, u);
      if (c.up) p.y += over(u);
      if (c.t >= C.OFF) this.climb = null;
    }
    this.pos.copy(p); this.vel.set(0, 0, 0); this.onGround = true; this.hspeed = 0; this.crouch = false; this.prone = false;
    this.stowed = this.climb ? true : c.was; this.lowToggle = false;
    this.eyeH += (1.62 - this.eyeH) * Math.min(1, dt * 12);
  },
  // Your own arms while your hands are on something (the gun's away): a sleeved forearm and a glove each, in the world, from
  // in front of your shoulder to where the hand is. On the ladder, where G.Level.ladderGrip has it on a rung (each one holding
  // as you rise past it, then reaching up two); on a zipline there are no arms to draw (the left hand's up on the trolley's
  // handle, out of view, the right has the gun) but the trolley itself, on the cable over your head (G.LevelView.zipKit). Everyone
  // else sees the whole of you (js/rig.ts).
  holdArms(cam: THREE.Camera) {
    let A = this._climbArms;
    const z = this.zipRide;
    if (this._zipKit) this._zipKit.visible = !!z;
    if (!this.climb && !z) { if (A) A.g.visible = false; return; }
    if (z) { // (the trolley, over your head: the cable ZIP_HANG over your feet)
      if (A) A.g.visible = false;
      const k = this._zipKit || (this._zipKit = G.LevelView.zipKit());
      if (!k.parent) G.R.scene.add(k);
      k.visible = true; k.position.set(this.pos.x, this.pos.y + G.Level.ZIP_HANG, this.pos.z); k.rotation.y = Math.atan2(z.l.b[0] - z.l.a[0], z.l.b[2] - z.l.a[2]);
      return;
    }
    const T = THREE, L = G.Level;
    const hands = ['hL', 'hR'].map((k) => new T.Vector3(...L.ladderGrip(this.climb!.l, this.pos.y, k)));
    if (!A) {
      const sleeve = new T.MeshStandardMaterial({ color: 0x3a3f36, roughness: 0.9 }), glove = new T.MeshStandardMaterial({ color: 0x1e1f1c, roughness: 0.8 }), g = new T.Group(), arms = [];
      for (let i = 0; i < 2; i++) { const s = new T.Mesh(new T.CylinderGeometry(0.042, 0.048, 1, 10), sleeve), h = new T.Mesh(new T.BoxGeometry(0.1, 0.11, 0.05), glove); g.add(s, h); arms.push({ s, h }); }
      G.R.scene.add(g);
      A = this._climbArms = { g, arms };
    }
    A.g.visible = true;
    cam.updateMatrixWorld();
    const up = new T.Vector3(0, 1, 0);
    [-1, 1].forEach((side, i) => {
      const { s, h } = A.arms[i], hand = hands[i];
      const sh = new T.Vector3(side * 0.2, -0.32, 0.05).applyMatrix4(cam.matrixWorld), dir = hand.clone().sub(sh), len = Math.min(0.34, dir.length() * 0.6);
      dir.normalize();
      const from = hand.clone().addScaledVector(dir, -len);
      s.position.copy(from).add(hand).multiplyScalar(0.5); s.scale.set(1, len, 1); s.quaternion.setFromUnitVectors(up, dir);
      h.position.copy(hand).addScaledVector(dir, 0.03); h.quaternion.copy(s.quaternion);
    });
  },
  // Spread/recoil multiplier from steadiness: holding Shift tightens it; hanging from a zipline by one hand loosens it a lot.
  steadiness() { return (this.steadying ? 0.65 : 1) * (this.zipRide ? this.ZIP.ONE_HAND.SPREAD : 1); }, // (on a zipline: one-handed)

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
  recoilModel(def: WeaponDef) {
    this._rm = this._rm || new WeakMap();
    let m: PRecoilModel | undefined = this._rm.get(def);
    if (m) return m;
    const deg = Math.PI / 180, cls = def.cls, onehand = cls === 'PST' || cls === 'MP';
    const up = def.recoil * 2.3 * deg;
    const sideK = ({ PST: 0.8, MP: 0.9, SMG: 0.75, SG: 0.7, LMG: 0.8, SNP: 0.4, DMR: 0.55, BR: 0.7, RAIL: 0.4, BOW: 0.4, GL: 0.55 } as Partial<Record<WeaponClass, number>>)[cls] || 0.65;
    const aim = G.aimSway(def);
    m = {
      up, side: up * sideK,
      rec: G.U.clamp((def.handling || 1) * (onehand ? 1.15 : 1), 0.55, 1.6), // spring strength: how fast it comes back
      capUp: up * 6 + 0.03, capSide: Math.max(0.025, up * sideK * 6),
      sway: aim.sway, erratic: aim.erratic, // breathing, and the faster twitch that makes a pistol wander: with a stock or without (G.aimSway)
    };
    this._rm.set(def, m);
    return m;
  },
  // how badly injuries throw your aim (0..1): pain, a punctured lung, blood loss (js/medical.ts)
  lowHealth() { return this.down ? 1 : this.body ? G.Med.aimPenalty(this.body) : 0; },
  recoilStep(dt: number, def: WeaponDef) {
    const R = this.RECOIL, rc = this.rc, m = this.recoilModel(def);
    // bleeding out saps the strength to muscle the muzzle back down
    const g = m.rec * (1 - 0.8 * this.lowHealth()) * (this.zipRide ? this.ZIP.ONE_HAND.GRIP : 1), kd = R.KD * Math.sqrt(g);
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
    const hk = this.hk, c = hk.w * hk.w, d = hk.w; // (your neck bringing it back, a little past and settling)
    hk.vy += (-c * hk.y - d * hk.vy) * dt; hk.vp += (-c * hk.p - d * hk.vp) * dt; hk.vr += (-c * hk.r - d * hk.vr) * dt;
    hk.y = G.U.clamp(hk.y + hk.vy * dt, -0.6, 0.6); hk.p = G.U.clamp(hk.p + hk.vp * dt, -0.6, 0.6); hk.r = G.U.clamp(hk.r + hk.vr * dt, -0.6, 0.6);
  },
  // Rounds to your head (js/ballistics.ts outcome: [where from the neck x y z, its way x y z, momentum left there]) throw it, as a blow does: about your neck, so
  // the forehead tips it back, the side rolls it away and a cheek turns it. What's on your head is more for the blow to move and for your neck to bring back, so it
  // goes a little less far and takes longer about it; what hangs out in front (a face shield) tips it further. Only your head goes: the gun's still where you were
  // aiming (update: it's in with the recoil's punch).
  // (K: the kick for a bare head. INERTIA: what a kg on your head adds to moving it. W: how fast a bare head comes back. NOSE: the tip for each kg m out in front.)
  HEAD_KICK: { K: 7, INERTIA: 0.3, W: 15, NOSE: 1.5 },
  headHit(hd: number[][]) {
    const H = this.HEAD_KICK, load = G.Gear.headLoad(this), I = 1 + load.kg * H.INERTIA, hk = this.hk, inv = new THREE.Quaternion().setFromEuler(new THREE.Euler(this.pitch, this.yaw, 0, 'YXZ')).invert(), k = H.K / I;
    hk.w = H.W / Math.sqrt(I);
    for (const [x, y, z, ux, uy, uz, mv] of hd) {
      const r = new THREE.Vector3(x, y, z).applyQuaternion(inv), p = new THREE.Vector3(ux, uy, uz).applyQuaternion(inv).multiplyScalar(mv), t = r.cross(p); // (in your view: x right, y up, z back; so t.x's pitch up, t.y yaw left, t.z roll)
      hk.vp += t.x * k * (1 + load.nose * H.NOSE); hk.vy += t.y * k; hk.vr += t.z * k;
    }
  },
  // how far the gun can come back toward you (m): aiming, its sight's eye relief short of your eye; from the hip, more
  shoveRoom() {
    const u = G.R && G.R.vm && G.R.vm.userData, give = Math.max(0.006, ((u && u.info && u.info.relief) || 0.3) - 0.04);
    return G.U.lerp(this.RECOIL.SHOVE.HIP, give, this.adsT || 0);
  },
  // lone: a pair's first round, whose second never came: its own kick, as it was held
  recoilKick(def: WeaponDef, lone?: boolean) {
    const R = this.RECOIL, rc = this.rc, m = this.recoilModel(def);
    // A hyper-burst pair (AN-94) leaves before the recoil reaches you: the first round's kick waits for the second, so the
    // second leaves on the same line, and then you take the two as one. The rounds after them kick for themselves.
    const hyper = !lone && this.fireMode && this.fireMode(this.cur()) === 'hyper';
    if (hyper && this.hyperQ > 1) { this.pairHeld = def; return; }
    const paired = hyper && this.hyperQ === 1 && this.pairHeld;
    this.pairHeld = null;
    const kind = paired ? def.hyperKick || 1 : hyper ? def.autoKick || 1 : 1;
    const k = this.steadiness() * (this.prone ? 0.6 : this.crouch ? 0.8 : 1) * (this.adsT > 0.5 ? 0.85 : 1) * G.U.lerp(1, this.BIPOD.KICK, this.bipodT || 0) * kind * (this.zipRide ? this.ZIP.ONE_HAND.KICK / this.ZIP.ONE_HAND.SPREAD : 1); // (prone: the ground takes it; a bipod, more of it; one-handed on a zipline: steadiness has the spread's share, this the rest to make it KICK)
    // (a gun with a pull kicks the same way every time, so you can hold against it: a little to the right, a steady climb)
    const up0 = m.up * (def.pull ? 0.95 + Math.random() * 0.1 : 0.85 + Math.random() * 0.3) * k, dir = def.pull || Math.random() < 0.5 ? -1 : 1;
    // driven back near the limit: what's left of the kick comes out sideways and up
    const S = R.SHOVE, c = G.U.smooth(0.55, 1, this.shove / this.shoveRoom());
    const side = dir * (m.side * (def.pull ? def.pull * (0.9 + Math.random() * 0.2) : 0.9 + Math.random() * 0.8) * k + up0 * S.SIDE * c); // never fires flat
    const up = up0 * (1 + S.UP * c);
    this.shoveV += S.J * (0.35 + def.recoil * 0.06) * k * (1 - 0.6 * c);
    rc.y += side * R.POS; rc.vy += side * R.VEL;
    rc.p += up * R.POS; rc.vp += up * R.VEL;
    // and some of it for keeps: the view itself climbs and drifts (pull down to hold it on target)
    this.pitch = Math.min(1.45, this.pitch + up * R.VIEW.p);
    this.yaw += side * R.VIEW.y;
  },
  // A bipod (the Kodiak, or one the gun's built with: js/gunmodels.ts bipodLeg) goes down when you're lying behind it, or
  // crouched or standing with something in front to stand it on (a counter crouched; a sill, a wall's top or a tall crate
  // standing): a top from 35 cm under the gun to 10 cm over it (you come up onto it), 30 to 80 cm out, nothing in the way over it. Held still and not aimed steeply. bipodT: how far down it is (the legs: js/vmanim.ts; what it
  // does to the sway and kick: swayStep, recoilKick). BIPOD: what's left of the sway and the twitch, and of the kick.
  BIPOD: { SWAY: 0.12, ERRATIC: 0.1, KICK: 0.55, RATE: 4 },
  bipodStep(dt: number) {
    const a = G.R.vm && G.R.vm.userData.vma, has = !!(a && a.hs[0].an.bipod);
    let on = false;
    if (has && !this.stowed && !this.held && this.onGround && (this.hspeed || 0) < 0.4 && Math.abs(this.pitch) < 0.35) {
      if (this.prone && this.stanceT <= 0) on = true;
      else if (!this.prone && !this.climb && !this.zipRide && this.seat == null && G.Game.map && G.Game.map.world) {
        const w = G.Game.map.world, dx = -Math.sin(this.yaw), dz = -Math.cos(this.yaw), y = this.pos.y + this.eyeH - 0.1 + 0.15; // (just over the gun)
        if (G.World.raycast(w, this.pos.x, y, this.pos.z, dx, 0, dz, 1).t >= 1) {
          for (const d of [0.35, 0.55, 0.75]) { const t = G.World.raycast(w, this.pos.x + dx * d, y, this.pos.z + dz * d, 0, -1, 0, 0.5).t; if (t >= 0.05 && t < 0.5) { on = true; break; } }
        }
      }
    }
    if (on && !this.bipodOn && (this.bipodT || 0) < 0.1) G.Audio.click();
    this.bipodOn = on;
    this.bipodT = G.U.clamp((this.bipodT || 0) + (on ? 1 : -1) * dt * this.BIPOD.RATE, 0, 1);
  },
  // Breathing (two slow frequencies), the erratic twitch, walking and the low-health tremor. Looser from the
  // hip, tighter crouched or holding your breath (Shift); on a bipod, hardly any.
  swayStep(dt: number, def: WeaponDef) {
    this.armStep(dt);
    const m = this.recoilModel(def), a = this.adsT || 0, low = this.lowHealth();
    this.swayT += dt;
    this.walkAmp += ((this.onGround ? Math.min((this.hspeed || 0) / this.SPEED.walk, 1.4) : 0) - this.walkAmp) * Math.min(1, dt * 4);
    const t = this.swayT, atro = 1 + low * 1.4, hold = this.steadying ? 0.4 : 1, lying = this.prone && this.stanceT <= 0;
    // prone, the gun rests on your elbows and the ground: the least sway there is (breathing barely moves it)
    const bp = this.bipodT || 0, amp = m.sway * G.U.lerp(1.6, 1, a) * (lying ? 0.25 : this.crouch ? 0.75 : 1) * hold * atro * G.U.lerp(1, this.BIPOD.SWAY, bp) * (this.zipRide ? this.ZIP.ONE_HAND.SWAY : 1);
    const er = m.erratic * atro * hold * (lying ? 0.3 : 1) * G.U.lerp(1, this.BIPOD.ERRATIC, bp) * (this.zipRide ? this.ZIP.ONE_HAND.SWAY : 1), wa = this.walkAmp * (1 - a * 0.5);
    const tremor = (s: number) => low * (0.004 * Math.sin(t * 11.3 + s) + 0.0035 * Math.sin(t * 17.7 + s * 2) + 0.003 * Math.sin(t * 24.9 + s * 3));
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
  // LOOSE CARRY: at the hip without Shift, the head turns first and the arms (and the gun in them)
  // catch up a moment later, as if the body follows the eyes; Shift (steadying) or aiming brings the gun up into
  // the view as it always was. The arms follow on a soft spring and never trail by more than ARM_LAG_MAX.
  // (lowered, low ready: looser still — the gun hangs from the arms, so the head gets further ahead and they're slower to follow)
  ARM_FOLLOW: { loose: 6.5, low: 3.2, held: 40 }, // (per second: how fast the arms catch up loose, lowered, and held up)
  ARM_LAG_MAX: { y: 0.5, p: 0.15 }, // (rad: ~28 degrees side to side, ~9 up and down)
  ARM_LAG_MAX_LOW: { y: 0.9, p: 0.25 }, // (rad, lowered: ~52 and ~14 degrees)
  ARM_PITCH_FOLLOW: 2, // (up and down the arms keep up this many times faster than side to side: a nod shouldn't swing the gun)
  lowT: 0,
  armStep(dt: number) {
    const free = !this.steadying && !this.ads && (this.adsT || 0) < 0.05 && !this.stowed && !this.held && !this.down && !this.dead;
    const loose = free, low = free && !!this.lowReady;
    this.looseT += ((loose ? 1 : 0) - this.looseT) * Math.min(1, dt * 6);
    this.lowT += ((low ? 1 : 0) - this.lowT) * Math.min(1, dt * 4);
    if (this.armYaw == null || this.armPitch == null) { this.armYaw = this.yaw; this.armPitch = this.pitch; }
    const follow = G.U.lerp(this.ARM_FOLLOW.held, G.U.lerp(this.ARM_FOLLOW.loose, this.ARM_FOLLOW.low, this.lowT), this.looseT);
    const k = Math.min(1, dt * follow);
    this.armYaw += G.U.angDiff(this.armYaw, this.yaw) * k;
    this.armPitch += (this.pitch - this.armPitch) * Math.min(1, k * this.ARM_PITCH_FOLLOW);
    const M = { y: G.U.lerp(this.ARM_LAG_MAX.y, this.ARM_LAG_MAX_LOW.y, this.lowT), p: G.U.lerp(this.ARM_LAG_MAX.p, this.ARM_LAG_MAX_LOW.p, this.lowT) };
    const ly = G.U.angDiff(this.yaw, this.armYaw), lp = this.armPitch - this.pitch; // (how far behind they are)
    if (Math.abs(ly) > M.y) this.armYaw = this.yaw + Math.sign(ly) * M.y;
    if (Math.abs(lp) > M.p) this.armPitch = this.pitch + Math.sign(lp) * M.p;
  },
  // how far the arms trail the head (rad, in the aim offset's terms: the gun turns that much from where you look)
  armLag() {
    if (this.armYaw == null || this.armPitch == null) return { y: 0, p: 0 };
    return { y: G.U.angDiff(this.yaw, this.armYaw), p: this.pitch - this.armPitch };
  },
  // the gun's total offset from where you're looking (rad): recoil + sway + flinch + lag behind fast turns
  aimOffset() {
    const sc = 1 - (this.adsT || 0) * 0.75;
    const lag = this.armLag(); // (the arms trailing the head: rounds go where the gun points)
    return {
      y: this.rc.y + this.swayOff.y + this.flinch.y - (this.swayX || 0) * 0.25 * sc + lag.y, // (a little drag behind a fast turn, not much)
      p: this.rc.p + this.swayOff.p + this.flinch.p + (this.swayY || 0) * 0.25 * sc + lag.p,
    };
  },

  // ------------------------------------------------------------- weapons
  swap(slot: string) {
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
    if (this.held) { this.cookHeld(); return; }
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
  // a slap reload does the handle's work as well as the magazine's: longer for each way of stowing the old magazine (an MP5's 2.0 s: 2.65, 2.25 and 2.15 s)
  SLAP_K: { retain: 1.325, pouch: 1.125, floor: 1.075, plain: 1.125 },
  startReload() {
    const w = this.cur(), mag = this.magSize(w);
    if (this.zipRide) { if (!this.noAmmoT || this.noAmmoT < performance.now()) { G.HUD.toast('', "Can't reload hanging from the zipline", 1.2); this.noAmmoT = performance.now() + 1500; } return; } // (the left hand's on the trolley)
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
    this.byHand = !!w.def.handReload && w.mag > 0; // (a speed loader with rounds still in the cylinder: by hand, a round at a time)
    this.reloadAct = this.reloadEmpty && isMag && !w.def.enbloc && !w.def.akimbo && G.VMAnim.kinds(w.def).action ? (G.boltHold(w.def) ? 'release' : 'rack') : null; // (a revolver has nothing to work)
    this.slap = isMag && G.VMAnim.isSlap(w.def); // (an MP5: the handle drawn back and turned up into its notch, the magazine changed, the handle slapped down: js/vmanim.ts slapClip. It chambers the next round itself, so no action after)
    if (this.slap) this.reloadAct = null;
    this.reloadTimes(w.def);
    this.loadN = this.loadCount(w, mag);
    this.revOpen = this.revHand(w.def); this.revClose = false; // (a revolver by hand: the cylinder comes out first)
    if (this.revOpen) { this.reloadTotal += G.REV.open; this.reloadT = this.reloadTotal; }
    this.reloadEv = 0;
    // a breech with nothing to throw the empty out (a Thor's): it's pulled by hand (js/vmanim.ts breakClip), and falls when it's let go
    const info = G.R.vm && G.R.vm.userData.info;
    this.handCase = info && info.breech && w.spent && w.spent.length ? w.spent[0] : null; this.handOut = false;
    if (!this.handCase) G.Casings.emptied(w.def, w.def.volley ? (w.spent || []).length : mag - w.mag, w.spent); // a revolver or break-action: the empties fall out (each hull its load's colour; a volley gun's: what it fired, however many were in it)
    this.ejected = w.spent; this.ejecting = (w.spent || []).length; this.ejectT = this.handCase ? this.reloadTotal * 0.3 : 0.25; w.spent = []; // (still in it till they do: js/vmanim.ts)
    this.hCues = !this.slap && !this.loose(w.def) ? G.Handling.cues(w.def) : null; // (a cylinder, a hinge, a feed cover: on the animation's own moments, below)
    if (this.revOpen) G.Handling.open(w.def);
    if (!this.slap && !this.hCues && !this.loose(w.def)) G.Handling.play(w.def, w.mag > 0 ? 'mag-out' : 'mag-out-empty', { land: G.Handling.LAND.magOut }) || G.Audio.sample('pull_magazine'); // (a slap reload's own sounds come as it goes: slapSounds; a round-by-round one's with each round (and a cylinder's or a block's opening); else the gun's own, js/handling.ts, else the recording)
  },
  reloadTime(def: WeaponDef) { return this.byHand && def.handReload ? def.handReload : def.reload; },
  // how many rounds the next step of a loose reload puts in: one, or with a loader several (a tube's push, the Hailstorm's Wolverine grip: three), fewer when
  // fewer are empty or fewer are carried (of the type it takes: G.Gear takeRounds). js/vmanim.ts shows that many in the hand.
  loadCount(w: PWeapon, mag: number) {
    const per = w.def.perLoad || 1;
    if (per <= 1) return 1;
    const fs = G.Gear.feeds(this, w.def), first = fs.find((f) => f.it.am === w.ammo) ? w.ammo : fs.length ? fs[0].it.am : null;
    const have = fs.filter((f) => f.it.am === first).reduce((a, f) => a + f.it.n, 0);
    return Math.max(1, Math.min(per, mag - w.mag, have));
  },
  // loaded a round (or a push of shells) at a time, this reload: a shell-fed gun, or a revolver topped up by hand
  loose(def: WeaponDef) { return def.shell || (!!this.byHand && G.revolver(def)); },
  // a revolver loaded a round at a time: it stays open till it's shut, which takes a moment (a falling block likewise: the block stays down till it's shut, js/data.ts G.fblock)
  revHand(def: WeaponDef) { return (G.revolver(def) || G.fblock(def)) && this.loose(def); },
  revShut(def: WeaponDef) { this.revClose = true; this.reloadT = this.reloadTotal = G.REV.close; G.Handling.shut(def); },
  ACT_T: { release: 0.4, rack: 0.6 },
  // how far through its motions a magazine change goes before the action, from empty: it stops as the magazine
  // seats and the hand goes straight on to the catch or the handle (no trip back to the handguard first)
  SEAT: { retain: 0.78, pouch: 0.78, floor: 0.7, plain: 0.7 },
  // the reload's length: the magazine change (how depends on where the old one goes; run dry, up to its seating:
  // reloadSeat). The action after it is its own (workAction).
  reloadTimes(def: WeaponDef, done = 0) {
    const seat = this.reloadAct && G.VMAnim.kinds(def).reload === 'mag' ? this.SEAT[this.reloadMode] || 0.7 : 1;
    this.reloadSeat = seat;
    this.reloadTotal = this.reloadTime(def) * (this.slap ? this.SLAP_K : this.RELOAD_K)[this.reloadMode] * this.reloadPackK * seat;
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
  // look the weapon over: turn it, check the chamber (animated by js/vmanim.ts)
  // the fire selector: on to its next position (a click), or nothing to switch to
  selectFire() {
    const w = this.cur(), modes = w && (w.def.modes || [w.def.mode]);
    if (!w || this.down || this.dead) return;
    if (modes.length < 2) { G.HUD.toast('', `The ${w.def.name} has no selector: ${G.MODE_NAME[modes[0]].toLowerCase()} only`, 1.4); G.Audio.deny(); return; }
    w.fm = modes[(modes.indexOf(this.fireMode(w)) + 1) % modes.length];
    this.burstQ = 0; this.hyperQ = 0; this.pairAim = null;
    G.Audio.click();
    G.HUD.toast('', G.MODE_NAME[w.fm], 0.9);
  },
  fireMode(w: PWeapon): FireMode { const modes = w.def.modes || [w.def.mode]; return modes.includes(w.fm) ? w.fm : modes[0]; },
  inspect() {
    if (this.reloading || this.act || this.magChk || this.rChk || this.stowed || this.swapT > 0 || this.adsT > 0.2 || this.down || this.inspectT > 0 || this.zipRide) return;
    this.inspYaw = this.inspPitch = 0;
    this.inspectDur = this.cur().def.slot === 's' ? 2.0 : 2.6;
    this.inspectT = this.inspectDur;
  },

  weaponUpdate(dt: number) {
    const w = this.cur(), def = w.def, mag = this.magSize(w);
    this.fireCd = Math.max(-0.05, this.fireCd - dt); // (a little below zero: what's left of a frame carries into the next shot)
    this.sinceShot = (this.sinceShot || 0) + dt;
    this.swapT = Math.max(0, this.swapT - dt);
    this.flashT = Math.max(0, this.flashT - dt);
    this.kick = Math.max(0, this.kick - dt * 8);
    this.recoilStep(dt, def);
    this.bipodStep(dt);
    this.swayStep(dt, def);

    this.raiseT = Math.max(0, (this.raiseT || 0) - dt);
    if (this.held) this.heldStep(dt);
    this.ads = this.mouse.r && !this.held && !this.magChk && !this.lowReady && !this.stowed && !(this.stanceT > 0) && this.raiseT <= 0 && this.swapT <= 0 && !(this.reloading && (!this.loose(def) || this.revHand(def))) && G.Game.locked && !def.akimbo && !(this.zipRide && this.sight(w).scoped); // (no looking down a magnified scope one-handed on a zipline)
    this.adsT += ((this.ads ? 1 : 0) - this.adsT) * Math.min(1, dt * 9 * (this.cur().def.handling || 1)); // ergonomics: aim speed

    // inspecting stops the moment you do anything with the gun; racking after the last shell takes a beat
    if (this.inspectT > 0 && (this.ads || this.mouse.l || this.reloading || this.stowed || this.lowReady)) this.inspectT = 0;
    this.inspectT = Math.max(0, (this.inspectT || 0) - dt);
    // holding I holds the chamber check open (the mouse turns the gun, see bindInput); letting go finishes it
    const IH = G.VMAnim.INSPECT_HOLD;
    this.inspHold = this.inspectT > 0 && !!this.keys.KeyI && 1 - this.inspectT / this.inspectDur >= IH;
    if (this.inspHold) this.inspectT = this.inspectDur * (1 - IH);
    else if ((this.inspYaw || this.inspPitch) && !(this.rChk && !this.rChk.rel)) { const k = Math.min(1, dt * 6); this.inspYaw -= this.inspYaw * k; this.inspPitch -= this.inspPitch * k; if (Math.abs(this.inspYaw) + Math.abs(this.inspPitch) < 1e-3) this.inspYaw = this.inspPitch = 0; }
    // holding R: the magazine check (js/vmanim.ts magCheckClip). Out, look, and back in when you let go (or do anything else).
    if (this.rHeldAt && performance.now() - this.rHeldAt > 260) {
      this.rHeldAt = 0;
      if (!this.reloading && !w.noMag && G.VMAnim.canMagCheck(G.R.vm)) { this.magChk = { k: 0, back: 0, yaw: 0, pitch: 0 }; this.inspectT = 0; G.Handling.play(w.def, w.mag > 0 ? 'mag-out' : 'mag-out-empty', { land: 0, vol: 0.35 }) || G.Audio.sample('pull_magazine', 0.35, 1.2); } // (the catch pressed and the magazine drawn: its own sound, quieter than a change)
      else if (!this.reloading && !this.act) { this.rChk = { k: 0, rel: false }; this.inspectT = 0; this.inspYaw = this.inspPitch = 0; G.Handling.play(w.def, 'pull', { land: G.Handling.LAND.rack, vol: 0.35 }); } // (the action eased back to see the round: the pull alone, quietly; nothing where the gun has none)
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
        if (mc.back >= 0.78 && !mc.seated) { mc.seated = true; G.Handling.play(def, 'mag-in', { land: G.Handling.LAND.magIn, vol: 0.35 }) || G.Audio.sample('insert_magazine', 0.35, 1.2) || G.Audio.click(); }
        if (mc.back >= 1) this.magChk = null;
      }
      this.fireCd = Math.max(this.fireCd, 0.12); // (no magazine in it)
    }
    // the action being worked (js/vmanim.ts rack / release): the case it held thrown as it comes back, a round fed
    // as it goes home
    const ac = this.act;
    if (ac) {
      ac.t += dt / ac.dur;
      this.fireCd = Math.max(this.fireCd, (1 - ac.t) * ac.dur);
      const pistol = def.cls === 'PST' || def.cls === 'MP';
      // its sound (js/handling.ts: the gun's own), started ahead of the stop it lines up with by as much as leads up to
      // it in the clip: a rack's rear stop, a release's slam home. Else the recording, at the stop.
      if (!ac.s) {
        const rack = ac.kind === 'rack', nm = rack ? G.Handling.rackClip(def, ac.dur) : G.Handling.lead(def, 'release') != null ? 'release' : 'home';
        const stop = rack ? ac.back : ac.home, ld = G.Handling.lead(def, nm);
        if (ld != null && ac.t >= stop - ld / ac.dur) { ac.s = true; G.Handling.play(def, nm, { land: Math.max(0, (stop - ac.t) * ac.dur), vol: rack ? 0.8 : 0.9 }); }
      }
      if (!ac.b && ac.t >= ac.back) { ac.b = true; if (w.spentCh) this.ejectSpent(w, 0); if (ac.kind === 'rack' && !ac.s) { ac.s = true; G.Audio.sample(pistol && !def.manual ? 'drop_slide' : 'rack_slide', 0.8, def.manual ? this.MANUAL_PITCH : 1); } }
      if (!ac.h && ac.t >= ac.home) { ac.h = true; this.feed(w); if (ac.kind === 'release' && !ac.s) { ac.s = true; G.Audio.sample('drop_slide', 0.9, pistol ? 1 : 0.85); } }
      if (ac.t >= 1) this.act = null;
    }
    if (this.ejecting && (this.ejectT -= dt) <= 0) this.ejecting = 0;
    if (this.reloading) {
      this.reloadT -= dt;
      if (!this.loose(def) && this.reloadTotal) {
        const k = 1 - this.reloadT / this.reloadTotal, pistol = def.cls === 'PST' || def.cls === 'MP';
        // the old magazine leaves your hand onto the floor (as the viewmodel lets go of it)
        if (this.slap) this.slapSounds(w, k);
        const km = k * (this.reloadSeat || 1); // (through the magazine change's motions)
        if (this.slap) { /* (its own: slapSounds) */ } else if (this.reloadMode === 'floor' && !this.magDropped && !w.noMag && km > (def.barrels ? 0.47 : pistol ? 0.06 : 0.2)) this.magDropped = G.Casings.dropMag(def, w.mag / Math.max(1, def.mag)) || true;
        if (this.hCues) { // (each part as far ahead of its moment as its clip leads it: secs to go = (at - km) of the change's motions)
          const R = this.reloadTotal / (this.reloadSeat || 1);
          for (const c of this.hCues) { const ld = c.done ? null : G.Handling.lead(def, c.name); if (ld != null && (c.at - km) * R <= ld) { c.done = true; G.Handling.play(def, c.name, { land: Math.max(0, (c.at - km) * R) }); } }
          this.reloadEv = 1;
        }
        if (this.slap) { /* (its own: slapSounds) */ } else if (this.reloadEv === 0 && km > (def.barrels ? 0.8 : this.reloadMode === 'retain' || this.reloadMode === 'pouch' ? 0.76 : 0.68)) { this.reloadEv = 1; G.Handling.play(def, 'mag-in', { land: G.Handling.LAND.magIn }) || G.Audio.sample('insert_magazine'); }
      }
      if (this.reloadT <= 0) {
        if (this.revClose) { this.revClose = false; this.reloading = false; } // (shut: ready)
        else if (this.loose(def)) {
          // one shell, or with a speed loader several at a push
          this.revOpen = false;
          const got = w.mag < mag ? G.Gear.takeRounds(this, def, Math.min(def.perLoad || 1, mag - w.mag), w.ammo) : [];
          if (got.length) { G.Gear.chamberIn(w, got); G.Handling.roundIn(def, { vol: 0.5 }) || G.Audio.sample('insert_magazine', 0.5, 1.6) || G.Audio.shell(); }
          if (w.mag < mag && w.reserve > 0) { this.reloadT = this.reloadTime(def); this.reloadTotal = this.reloadT; this.loadN = this.loadCount(w, mag); }
          else if (this.revHand(def)) this.revShut(def);
          else { this.reloading = false; if (this.reloadEmpty) this.rack(w); else this.feed(w); }
        } else {
          // a fresh magazine in (the old one goes back in its pouch), or loose rounds into a break-action
          if (this.reloadMode === 'pouch' || this.reloadMode === 'floor') {
            this.dumped = null;
            const went = G.Gear.dumpMag(this, w, mag, this.dumpDest as GGrid);
            // the magazine on the floor is that one (it can be picked up again)
            if (went === 'floor') { const c = this.magDropped && this.magDropped !== true ? this.magDropped : G.Casings.dropMag(def, w.mag / Math.max(1, def.mag)); if (c && this.dumped) c.item = this.dumped; }
          } else if (G.Gear.ammoFor(def).kind === 'mag') G.Gear.swapMag(this, w, mag);
          else G.Gear.chamberIn(w, G.Gear.takeRounds(this, def, mag - w.mag, w.ammo));
          this.reloading = false; // (a gun of several barrels: the new block's own counts are in G.Gear loadIn, or spread evenly: js/data.ts G.barrelsOf)
          if (this.reloadAct) this.workAction(w, this.reloadAct, this.reloadSeat < 1 ? this.reloadSeat : null); // run dry: then the action, straight on
          else this.feed(w);
          if (!G.Audio.samples.insert_magazine) G.Audio.click();
        }
      }
    }

    const trigger = this.mouse.l && G.Game.locked && !G.Game.menuOpen();
    const pressed = trigger && !this.lastTrigger;
    this.lastTrigger = trigger;
    // miniguns spin up before they fire and wind down when you let go
    if (def.spinUp) {
      const spinning = trigger && !this.lowReady && this.swapT <= 0;
      if (spinning && this.spin === 0) G.Audio.spinUp(def.spinUp);
      this.spin = spinning ? Math.min(1, this.spin + dt / def.spinUp) : Math.max(0, this.spin - dt / (def.spinUp * 1.5));
    }
    if (this.pairHeld && (this.hyperQ !== 1 || this.sinceShot > 0.25)) { const d = this.pairHeld; this.pairHeld = null; this.hyperQ = 0; this.recoilKick(d, true); } // (the pair's second round never came: the first's kick lands anyway)
    if (this.out || this.stanceT > 0 || this.swapT > 0 || this.lowReady || this.stowed || this.held || this.raiseT > 0 || (G.Game.hub && !G.Range.on())) { this.burstQ = 0; return; } // (the hangar's no place for it: the range is)
    // a manual action (def.manual): the shot's case stays in till the action is worked, which happens as you let go of the trigger (hold
    // it to stay on the sight and watch where it went)
    if (w.spentCh && !trigger && this.fireCd <= 0 && !this.act && !this.reloading) { this.rack(w); return; }
    const mode = this.fireMode(w); // where the selector is
    if (mode === 'burst' && this.pressBuf > 0 && this.burstQ === 0 && this.fireCd <= 0) { this.burstQ = def.burst || 3; this.pressBuf = 0; this.burstId = (this.burstId || 0) + 1; }
    if (mode === 'hyper' && pressed) this.hyperQ = def.hyper;
    if (mode === 'hyper' && !trigger && this.hyperQ !== 1) this.hyperQ = 0; // (a pair once begun finishes: it's too quick to let go of)
    const mi = G.MODE_INFO[mode]; // (a gun of several barrels: its modes, js/data.ts)
    const want = mode === 'hyper' && this.hyperQ === 1 ? true : mi ? (mi.auto ? trigger : this.pressBuf > 0) : mode === 'auto' || mode === 'hyper' ? trigger && (!def.spinUp || this.spin >= 1) : mode === 'semi' ? this.pressBuf > 0 : this.burstQ > 0;
    if (!want || this.fireCd > 0) return;
    if (def.missing && def.missing.length) { // a core part off: the trigger does nothing
      if (pressed || this.pressBuf > 0) {
        G.Audio.dry();
        const mis = def.misfit || [], none = def.missing.filter((s: string) => !mis.includes(s));
        G.HUD.toast('', `It won't fire: ${[...none.map((s: string) => 'no ' + G.Gunsmith.SLOT_LABEL[s].toLowerCase()), ...mis.map((s: string) => `the ${G.Gunsmith.PARTS[def.build[s]].name} doesn't fit the ${def.name}`)].join(', ')}`, 1.6);
      }
      this.burstQ = 0; this.pressBuf = 0;
      return;
    }
    const ch = G.chambered(def);
    if (ch && !w.chamber && (w.mag > 0 || w.spentCh) && (!this.reloading || def.shell) && (pressed || this.pressBuf > 0)) { this.reloading = false; this.rack(w); this.burstQ = 0; this.pressBuf = 0; return; } // click: tap, rack (shells: stop loading and rack)
    if (ch ? !w.chamber : w.mag <= 0) {
      if (pressed || mode !== 'auto' || !this.dryT || this.dryT < performance.now()) { G.Audio.dry(); this.dryT = performance.now() + 300; }
      this.burstQ = 0; this.hyperQ = 0; this.pressBuf = 0; // just the click: reloading is up to you (R)
      return;
    }
    if (this.reloading) {
      if (this.revHand(def)) { if (!this.revClose) { this.revShut(def); this.pressBuf = G.REV.close + 0.05; } return; } // (the cylinder shut first, on what's in it: the shot goes as it does)
      if (this.loose(def)) this.reloading = false; else return;
    }
    const bolt = ch && !!def.manual, round = w.chamber;
    this.shoot(w, def.barrels ? G.pickBarrels(w, mode) : null); // (a volley gun: every loaded barrel, shoot)
    if (bolt) { w.chamber = null; w.spentCh = round || w.ammo; } // (the case stays in: js/player.ts rack)
    else if (ch) { w.chamber = null; (this as { feed(w: GWeapon, quiet: boolean): boolean }).feed(w, true); } else if (!def.barrels && !def.volley) w.mag--; // (the action strips the next round into the chamber; a gun of several barrels counts its rounds as each leaves: shoot)
    // AN-94 style hyper-burst: the first rounds of each pull leave at a much higher rate. The wait after this
    // round is set by the next one: still part of the pair (hyper rate), or the gun's own cyclic rate after it.
    if (this.hyperQ > 0) this.hyperQ--;
    const rate = mode === 'hyper' && this.hyperQ > 0 ? def.hyperRpm : mode === 'burst' && def.burstRpm ? def.burstRpm : mi && mi.rpm ? mi.rpm : def.rpm;
    // high rates aren't rounded up to whole frames: within a string of shots, what's left of the last frame
    // carries over (the first shot of a pull starts the clock fresh)
    this.fireCd = (this.sinceShot > 60 / rate + 0.034 ? 0 : Math.max(this.fireCd, -0.034)) + 60 / rate;
    this.sinceShot = 0;
    if (bolt) this.fireCd = Math.max(0.25, this.fireCd - this.MANUAL_T); // (the rest of the gun's rate is the bolt, worked by hand)
    this.cycleMax = this.fireCd;
    this.cylShots++; // (the cylinder turns one chamber: js/player.ts moving parts)
    if (def.enbloc && w.mag === 0) { // the clip flies out with the last round's case ("ping"): it goes back in your kit, empty
      G.Audio.ping();
      const clip = G.Gear.ammoItem(w.def, 0, w.ammo, w.def.build && w.def.build.mag);
      if (!G.Gear.stow(this, clip)) this.dropItem(clip); // (no room on you: at your feet)
      w.tube = []; w.noMag = true; // (the gun stands open for the next one)
    }
    this.pressBuf = 0;
    if (mode === 'burst') { this.burstQ--; if (this.burstQ <= 0 || !G.loaded(w)) { this.burstQ = 0; this.fireCd += 0.24; } }
  },
  // What a slap reload (js/vmanim.ts slapClip) sounds like as it goes, at k through it: the handle drawn back, its click into the notch, the old magazine out (and, dumped on
  // the floor, falling), the new one in, then the slap that frees the bolt: a sharp crack over the bolt going home.
  slapSounds(w: GWeapon, k: number) {
    const S = G.VMAnim.SLAP, km = G.VMAnim.slapM(k, this.reloadMode), def = w.def, // (how far the magazine change is: js/vmanim.ts slapM)
      keep = this.reloadMode === 'retain' || this.reloadMode === 'pouch';
    if (this.reloadEv === 0 && k > (S.grab + S.pull) / 2) { this.reloadEv = 1; G.Handling.play(def, 'pull', { land: G.Handling.LAND.rack }) || G.Audio.sample('rack_slide', 0.7, 1.2); }
    if (this.reloadEv === 1 && k > S.lock) { this.reloadEv = 2; } // (the handle turned up into its notch: the pull's sound carries it)
    if (this.reloadEv === 2 && km > 0.1) { this.reloadEv = 3; G.Handling.play(def, w.mag > 0 ? 'mag-out' : 'mag-out-empty', { land: G.Handling.LAND.magOut }) || G.Audio.sample('pull_magazine'); }
    if (this.reloadMode === 'floor' && !this.magDropped && !w.noMag && km > 0.2) this.magDropped = G.Casings.dropMag(def, w.mag / Math.max(1, def.mag)) || true;
    if (this.reloadEv === 3 && km > (keep ? 0.76 : 0.68)) { this.reloadEv = 4; G.Handling.play(def, 'mag-in', { land: G.Handling.LAND.magIn }) || G.Audio.sample('insert_magazine'); }
    if (this.reloadEv === 4 && k > S.slap) { this.reloadEv = 5; G.Audio.sample('drop_bolt', 1, 1.3); G.Handling.play(def, 'home', { land: G.Handling.LAND.home }) || G.Audio.sample('drop_slide', 0.7, 1.4); } // (the hand's slap, and the bolt going home)
  },
  // the next round from the magazine (or tube) into an empty chamber
  feed(w: GWeapon) {
    if (!G.chambered(w.def) || w.chamber || w.mag <= 0) return false;
    w.chamber = w.tube && w.tube.length ? w.tube.pop()! : w.ammo;
    w.mag--;
    if (G.GunAudio.available()) G.GunAudio.buildDry(G.Gunsmith.roundSoundKey(w.def, w.chamber)); // (its report ready for the shot: a no-op once it is)
    return true;
  },
  // working the action by hand: a round from the magazine into the chamber (a moment, both hands; a bolt gun's
  // bolt, the right hand, throwing the case it last fired if that's still in there)
  MANUAL_T: 0.6, MANUAL_PITCH: 0.8, // (every manual action takes the same time to cycle and sounds alike; the model's moving part only decides how it looks)
  rack(w: GWeapon) {
    if (!(G.chambered(w.def) && !w.chamber && w.mag > 0) && !w.spentCh) return;
    this.workAction(w, 'rack');
  },
  // The action worked by hand, its own animation (js/vmanim.ts): kind 'rack' (pulled through and let go) or
  // 'release' (locked open: the catch hit). After a magazine change run dry it follows on from the seating (seat:
  // how far through its motions that went); a partial reload has none. The rounds move as the action does (above).
  workAction(w: GWeapon, kind: PActKind, seat: number | null = null) {
    const ev = G.VMAnim.actEvents(kind, G.VMAnim.kinds(w.def).action, !!w.def.manual);
    const dur = kind === 'release' ? this.ACT_T.release : w.def.manual ? this.MANUAL_T : seat ? this.ACT_T.rack : 0.45;
    this.act = { kind, seat, t: 0, dur, back: ev.back, home: ev.home };
    this.fireCd = Math.max(this.fireCd, dur);
  },
  // the fired case out of the port (at: how long from now)
  ejectSpent(w: GWeapon, at: number) { G.Casings.fired(w.def, true, null, null, w.spentCh, at); w.spentCh = null; },

  // One pull of the trigger. barrels: a gun of several barrels (def.barrels) fires those (indices into its muzzles, G.pickBarrels): a round from each, each as its barrel's
  // effective length makes it (G.shotDef) from its own muzzle, a report each (stacking), the recoil of all of them at once.
  // A volley gun (def.volley: the Hailstorm) fires every loaded barrel at one pull, each round from its own barrel on its own path: the barrels' muzzles off the
  // bore line (info.muzzles), bored to meet at def.volleyZ metres, each straying on its own by def.volleySpread degrees round the one aim the whole volley shares;
  // one report for all of them, as loud as the rounds in it make it (G.volleyVol). Its empties stay in the chambers till the block drops (w.spent).
  shoot(w: PWeapon, barrels: number[] | null = null) {
    const vol = !!w.def.volley && !barrels;
    if (vol) barrels = Array.from({ length: Math.max(1, Math.min(w.mag, w.def.volley)) }, (_, i) => i);
    const nv = vol ? barrels!.length : 0;
    let vAim: number[] | null = null; // (the volley's one aim error, for every barrel in it)
    const multi = !!(barrels && barrels.length), list: number[] = multi ? barrels! : [-1];
    const mInfo = multi ? G.Models.infoOf(w.def) : null, mz = mInfo && mInfo.muzzles && mInfo.muzzles.length ? mInfo.muzzles as number[][] : null;
    const cx = mz ? mz.reduce((a, m) => a + m[2], 0) / mz.length : 0, cy = mz ? mz.reduce((a, m) => a + m[1], 0) / mz.length : 0;
    const cam = G.R.camera;
    this.sinceFire = 0; this.flashBarrels = multi ? list : null;
    // the round leaves along the gun's bore: your aim plus the gun's offset (recoil, sway), not the camera
    const off = this.aimOffset();
    const aq = new THREE.Quaternion().setFromEuler(new THREE.Euler(this.pitch + off.p, this.yaw + off.y, cam.rotation.z, 'YXZ'));
    const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(aq);
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(aq);
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(aq);
    const origin = cam.position.clone();
    let def0: WeaponDef = w.def, round0 = '', firstShot: any = null;
    list.forEach((bi, n) => {
      // the round being fired, and the gun as that round sees it (G.roundDef: hollow points, AP, slugs...)
      const round = multi ? (w.tube && w.tube.length ? w.tube.pop()! : w.ammo) : G.chambered(w.def) && w.chamber ? w.chamber : w.tube && w.tube.length ? w.tube.pop()! : w.ammo; // (the chambered one, if it has a chamber)
      if (!G.chambered(w.def) && (!multi || vol)) { w.spent = w.spent || []; w.spent.unshift(round); w.spent.length = Math.min(w.spent.length, Math.max(8, w.def.volley || 0)); } // (the empties a revolver or break-action keeps till it's opened)
      if (vol) w.mag--;
      const sd = multi && !vol ? G.shotDef(w.def, w, bi) : null; // (a gun of several barrels: the gun as this barrel's round type and length make it; then as the load sees it)
      let def = G.roundDef(sd ? sd.def : w.def, round), eff = 0;
      if (sd) { eff = sd.eff; G.barrelsOf(w)![bi]--; w.mag--; this.lastShot = { barrel: bi, mm: Math.round(eff), k: Math.round(sd.k * 1000) / 1000, rl: G.roundOf(w.def, w.rl)!.rl, am: round, left: w.bl!.slice(), mag: w.mag }; this.shotLog.push(this.lastShot); if (this.shotLog.length > 60) this.shotLog.shift(); } // (the barrel's rounds: js/data.ts G.barrelsOf)
      if (n === 0) { def0 = def; round0 = round; }
      let side = 1;
      if (def.akimbo) { this.flashIdx = this.flashIdx ? 0 : 1; side = this.flashIdx ? 1 : -1; }
      else if ((G.Gunsmith.PLATFORMS[w.def.id] || {}).arch === 'derringer') this.flashIdx = w.tube && w.tube.length ? 0 : 1; // (the top barrel first, then the bottom)
      const muzzle = origin.clone().addScaledVector(fwd, 0.7).addScaledVector(right, (def.akimbo ? 0.13 * side : 0.17) * (1 - this.adsT)).addScaledVector(up, -0.12 * (1 - this.adsT) - 0.05);
      if (mz && bi >= 0) muzzle.addScaledVector(right, (mz[bi][2] - cx) * (1 - this.adsT * 0.5)).addScaledVector(up, (mz[bi][1] - cy) * (1 - this.adsT * 0.5)); // (this barrel's own: the block's six bores)

      let spread = G.U.lerp(def.spreadNoLaser && !w.laser ? def.spreadNoLaser : def.spread, def.ads, this.adsT); // (a laser helps only while it's on)
      spread *= this.steadiness();
      if (this.prone) spread *= 0.5; else if (this.crouch) spread *= 0.75;
      spread *= 1 + Math.min(this.hspeed / this.SPEED.walk, 1.4) * 0.8 * (1 - this.adsT * 0.6);
      if (!this.onGround) spread *= 1.8;
      const sr = (spread * Math.PI) / 180;

      // where the gun actually points this shot (one error for the whole shot), then for a shotgun the pattern
      // around it: the choke's cone, denser in the middle (roughly normal, clipped at 1.6x)
      // (a hyper pair's second round: the same error as the first's, near enough: the gun hasn't moved)
      const pair2 = this.hyperQ === 1 && this.pairAim && this.fireMode(w) === 'hyper';
      const a0 = pair2 ? this.pairAim![0] : vAim ? vAim[0] : Math.random() * Math.PI * 2, r0 = pair2 ? this.pairAim![1] : vAim ? vAim[1] : Math.sqrt(Math.random()) * Math.tan(sr);
      this.pairAim = this.hyperQ === 2 ? [a0, r0] : null;
      if (vol && !vAim) vAim = [a0, r0];
      const aim = fwd.clone().addScaledVector(right, Math.cos(a0) * r0).addScaledVector(up, Math.sin(a0) * r0).normalize();
      // (a volley's barrel: it leaves from its own bore, offset from the line of sight as the bore is from the block's middle, turned in to meet the
      // others at volleyZ, and strays a little on its own: roughly normal, clipped at 2x)
      let from = origin;
      if (vol && mz && bi >= 0) {
        const dx = mz[bi][2] - cx, dy = mz[bi][1] - cy, z = w.def.volleyZ || 10, vs = Math.tan(((w.def.volleySpread || 0) * Math.PI) / 180);
        const a = Math.random() * Math.PI * 2, rr = vs * Math.min(2, Math.sqrt(-2 * Math.log(1 - Math.random())));
        from = origin.clone().addScaledVector(right, dx).addScaledVector(up, dy);
        aim.addScaledVector(right, -dx / z + Math.cos(a) * rr).addScaledVector(up, -dy / z + Math.sin(a) * rr).normalize();
      }
      const pr = Math.tan(((def.choke || 0) * Math.PI) / 180);
      // each round (or pellet) leaves as a projectile (fly); the squad is told where it's headed, as far as the
      // walls go (to draw it and hear it go by)
      const shot: any = { sid: (this.sidN = (this.sidN || 0) + 1), bst: this.fireMode(w) === 'burst' ? this.burstId : 0, ff: new Map(), w: w.def.code, am: round, f: [origin.x, origin.y, origin.z].map((v) => Math.round(v * 100) / 100), tos: def.pellets > 1 ? [] : null }; // (tos: each pellet's end, for the highlights)
      for (let i = 0; i < def.pellets; i++) {
        let dir = aim;
        if (def.pellets > 1 && pr > 0) {
          const a = Math.random() * Math.PI * 2, rr = pr * Math.min(1.6, Math.sqrt(-2 * Math.log(1 - Math.random())) * 0.6);
          dir = aim.clone().addScaledVector(right, Math.cos(a) * rr).addScaledVector(up, Math.sin(a) * rr).normalize();
        }
        this.fly(from, dir, muzzle, def, round, i === 0 || def.pellets <= 10, shot, w.sup, G.boreTip(w));
      }
      const firstEnd = shot.to;

      if (def.cls === 'RAIL') G.Audio.rail();
      else if (def.cls === 'BOW') G.Audio.bow();
      else if (vol && n > 0) { /* (one report for the whole volley: the first round's) */ }
      else if (!G.GunAudio.play(multi && !vol ? G.shotSoundKey(def, eff, round) : G.Gunsmith.roundSoundKey(def, round), null, undefined, vol ? G.volleyVol(w.def, nv) : multi ? Math.pow(G.shotK(w.def, eff), 2) : 1)) G.Audio.shot(w.sup ? G.SUPPRESSOR.snd : def.snd); // (the report of the round fired, not just the gun's)
      if (!w.sup && def.cls !== 'BOW' && !(vol && n > 0)) { // (a volley: one flash, the barrels' together)
        this.flashT = 0.05;
        G.R.vmMuzzle.intensity = Math.PI * 3;
        G.R.muzzleFlashAt(muzzle, def.tracer || 0xffb060);
      }
      if (!multi && !w.def.caseless && !w.def.manual) G.Casings.fired(def, true, null, null, round); // the spent case, out of the port (a bolt gun's when the bolt's worked; a caseless round has none)

      const r2 = (v: number) => Math.round(v * 100) / 100;
      // (a shotgun's: every pellet's end, so the squad's highlights show the pattern)
      const tos = shot.tos ? shot.tos.slice(0, 24).map((p: THREE.Vector3) => [r2(p.x), r2(p.y), r2(p.z)]) : undefined;
      if (G.Highlights) G.Highlights.shot('p' + G.Net.myId, muzzle, firstEnd, def.code, round, tos, shot.sid);
      G.Net.toHost({ t: 'shot', f: [r2(muzzle.x), r2(muzzle.y), r2(muzzle.z)], to: [r2(firstEnd.x), r2(firstEnd.y), r2(firstEnd.z)], tos, sid: shot.sid, w: def.code, am: round, sil: def.cls === 'BOW' ? 2 : w.sup ? (def.quiet ? 2 : 1) : 0, fl: this.flashOf(w), bm: multi && !vol ? Math.round(eff) : undefined, rl: multi && !vol ? G.roundOf(w.def, w.rl)!.rl : undefined,
        vi: vol ? n : undefined, vn: vol && n === 0 ? nv : undefined }); // (a volley's rounds: which one this is, and how many went (the first's): js/views.ts remoteShot plays one report)
      if (n === 0) firstShot = shot;
    });
    void firstShot;
    if (G.Game.hub && G.Range.on()) G.Course.shot(); // (on the clock in the IPSC course: a split)
    // the kick only throws the muzzle for the next shot: this one already left where you were aiming (a pull of several barrels kicks as one)
    const kd = multi && list.length > 1 ? Object.assign(Object.create(def0), { recoil: def0.recoil * Math.pow(list.length, 0.8) }) : def0;
    this.recoilKick(kd);
    this.kick = Math.min(1, this.kick + 0.35 + kd.recoil * 0.06);
    void round0;
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
  fly(origin: THREE.Vector3, dir: THREE.Vector3, muzzle: THREE.Vector3, def: WeaponDef, am: string, show: boolean, shot: PShot, sup: boolean, tip: number | null = null) {
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
      n: 0, dist: 0, t: 0, off: muzzle.clone().sub(start), muzzle: muzzle.clone(), show, tracer, shot, hit: new Set(), proj: G.Ballistics.projectile(def, am), // (proj: the round itself, js/ballistics.ts)
      i: this.roundIndex(shot), path: this.newPath(start, v0),
      trail: G.Rig.debug ? G.R.trailStart(shot, start, v0) : null }); // (F9: its path drawn as it flies, coloured by its speed, js/render.ts trails)
  },
  // A suspect's round (the host's, from js/server.ts fire): as any other, flown here where the shooter's run. It goes by
  // suspects and civilians, and what it does to an officer is worked out here, as your rounds' are.
  enemyRound(id: number, from: THREE.Vector3, dir: THREE.Vector3, def: WeaponDef, am: string, shot: PShot) {
    const drag = G.dragOf(def, am), v0 = Math.max(40, G.roundSpeed(def, am) || 400);
    (this.rounds = this.rounds || []).push({ p: from.clone(), v: dir.clone().multiplyScalar(v0), def, am, drag, drag0: drag, grav: G.GRAVITY, n: 0, dist: 0, t: 0, off: new THREE.Vector3(), muzzle: from.clone(), show: false, tracer: false, shot, hit: new Set(), proj: G.Ballistics.projectile(def, am), enemy: id, i: this.roundIndex(shot), path: this.newPath(from, v0),
      trail: G.Rig.debug ? G.R.trailStart(shot, from, v0) : null });
  },
  // A suspect's shot as the host's simulation sends it to the host's own screen ('eround', js/server.ts fire): every pellet's
  // direction from the one muzzle, all of the one shot (its friendly-fire hits and paths sent together). Flown here, on the
  // host's machine, against everyone's bodies as they stand on it, as they were when the simulation ran in this thread.
  enemyRounds(m: { e: number; wp: string; am: string; sid: number; f: number[]; ds: number[][] }) {
    const wdef = G.WEAPONS[m.wp] || G.WEAPONS.p9, fv = new THREE.Vector3(m.f[0], m.f[1], m.f[2]), r2 = (v: number) => Math.round(v * 100) / 100;
    const shot = { sid: m.sid, ff: new Map(), w: wdef.code || m.wp, am: m.am, f: m.f.map(r2), tos: null, enemy: m.e } as unknown as PShot;
    for (const d of m.ds) this.enemyRound(m.e, fv, new THREE.Vector3(d[0], d[1], d[2]), wdef, m.am, shot);
  },
  // A round's path, for the replays (js/highlights.ts roundPath): p, the points it passed ([x, y, z, speed]: everything it met,
  // and every so often in the air); ev, what it did to things ([point, e(ntry) x (exit) r(icochet), what it looks like, the
  // surface's normal, what it was]); hit, who it went into ([point, their key, its speed, its state then, its direction,
  // whether it came out, what it did in their armour: js/ballistics.ts armourLog, how far in it got and what it was in last]).
  roundIndex(shot: PShot) { shot.n = (shot.n || 0) + 1; return shot.n - 1; },
  newPath(p: THREE.Vector3, v: number) { return { p: [[+p.x.toFixed(2), +p.y.toFixed(2), +p.z.toFixed(2), Math.round(v)]], ev: [], hit: [] }; },
  pathPt(b: PRound, p: THREE.Vector3, v: number) {
    const P = b.path.p, q = [+p.x.toFixed(2), +p.y.toFixed(2), +p.z.toFixed(2), Math.round(v)], l = P[P.length - 1];
    if (l[0] === q[0] && l[1] === q[1] && l[2] === q[2]) { l[3] = q[3]; return P.length - 1; } // (the same spot: not a leg of its own)
    P.push(q);
    return P.length - 1;
  },
  // it's finished: its path to the replays, here and on the squad's machines
  roundDone(b: PRound) {
    const key = b.enemy ? 'e' + b.enemy : 'p' + G.Net.myId, sh = b.shot;
    if (G.Highlights) G.Highlights.roundPath(key, sh.sid, b.i, b.path);
    (sh.paths = sh.paths || []).push([b.i, b.path]);
    if (G.ShotLog) G.ShotLog.keep(b.path, { holder: sh, name: `${b.def.name}${G.AMMO[b.am] ? ' ' + G.AMMO[b.am].name : ''}` }); // (F9: what it did, kept)
  },
  // where a round would end up if nobody's in the way: its arc, stepped against the walls only (what the squad
  // is told, to draw it going there)
  predictEnd(p0: THREE.Vector3, v0: THREE.Vector3, drag: number, grav: number) { return G.Sim.predictEnd(p0, v0, drag, grav, G.Game.map!); }, // (js/sim.ts, on the level you are in)
  // every round in flight, one frame on (and the friendly fire they did, sent)
  stepRounds(dt: number) {
    const rs = this.rounds;
    if (!rs || !rs.length) return;
    dt = Math.min(dt, 0.05);
    const shots = new Set<any>();
    for (let i = rs.length - 1; i >= 0; i--) {
      const b = rs[i];
      shots.add(b.shot);
      if (!G.Game.map || this.stepRound(b, dt)) { this.roundDone(b); rs.splice(i, 1); }
    }
    for (const sh of shots) {
      if (sh.ff.size) { for (const [tg, q] of sh.ff) G.Net.toHost(Object.assign({ t: 'ff', tg, f: sh.f, e: sh.enemy }, q)); sh.ff.clear(); } // (what they did to a teammate)
      if (sh.fx && sh.fx.length) G.Net.toHost({ t: 'rfx', a: sh.fx.splice(0, 32) }); // (the marks it left, for the squad)
      if (sh.holes && sh.holes.length) G.Net.toHost({ t: 'hole', a: sh.holes.splice(0, 32) }); // (and what it took out of the walls)
      if (sh.paths && sh.paths.length) G.Net.toHost({ t: 'rpath', sid: sh.sid, e: sh.enemy, ps: sh.paths.splice(0) }); // (and where it went, for their replays)
    }
  },
  // one round, one frame: true when it's done (stopped in something, spent, out of range)
  stepRound(b: PRound, dt: number) {
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
    if (b.trail && !(end && end.body)) G.R.trailAdd(b.trail, head, !!end, end ? end.v! : b.v.length()); // (stopped in someone: its track through them ends the trail)
    // the streak you see: from the muzzle side, closing onto the true path over the first 12 m
    if (b.show || b.tracer) {
      const came = b.dist + (end ? end.t : len), near = Math.max(0, 1 - came / 12);
      G.R.bullet(head.clone().addScaledVector(b.off, near), way, came - (b.came0 || 0), b.def, b.tracer, sp, b.am);
    }
    if (end) {
      this.pathPt(b, end.p, end.v!);
      if (b.def.cls === 'RAIL') G.R.tracer(b.muzzle, end.p, b.def.tracer || 0x55ddff, 0.06); // (a railgun leaves its line hanging)
      return true;
    }
    b.dist += len; b.p.copy(head); b.turned = false;
    { const q = b.path.p[b.path.p.length - 1]; if (Math.hypot(head.x - q[0], head.y - q[1], head.z - q[2]) > 12) this.pathPt(b, head, b.v.length()); } // (its arc)
    return b.t > G.ROUND_LIFE.t || b.dist > G.ROUND_LIFE.dist || b.v.length() < G.ROUND_LIFE.v || b.p.y < ((G.Game.map && G.Game.map.minY) || 0) - 2; // (through the lowest floor: a basement's is below ground)
  },
  // A round's step from a along dir for len metres, a leg at a time: everyone in its way and the first solid (nearest
  // first). A body is worked out physically (js/ballistics.ts through: their armour, then the track through them, organ by
  // organ), and a solid from what it's built of (crossSolid: js/materials.ts); either can stop it, turn it (a ricochet)
  // or let it through, slower, off line and changed (b.proj, the round as it now is: its drag goes with it), and it goes
  // on from there with what's left of the step. Returns where it stopped ({ p, t }), or null if it flies on (b.at, if it
  // was turned: where it's got to, and b.v what it's doing now).
  roundSegment(b: PRound, a: THREE.Vector3, dir: THREE.Vector3, len: number): { p: THREE.Vector3; t: number; body?: boolean; v?: number } | null {
    const map = G.Game.map!, L = G.Level, def = b.def, B = G.Ballistics;
    if (def.explosive && !b.enemy) {
      const wall = L.raycast(map, a.x, a.y, a.z, dir.x, dir.y, dir.z, len, { glass: true }), hitWall = wall.t < len - 1e-4, wallT = Math.min(wall.t, len), hits = this.roundHits(b, a, dir, wallT), t = hits.length ? hits[0].t : hitWall ? wallT : null;
      if (t == null) { this.roundGlass(a, dir, wall, len); return null; }
      const p = a.clone().addScaledVector(dir, Math.max(0, t - 0.15));
      this.explode(p, def.explosive.r, def.explosive.dmg, false);
      return { p, t };
    }
    const o = a.clone(), v0 = b.v.length();
    let d = dir.clone(), rest = len, v = v0, done = 0, turned = false;
    const on = (t: number) => { o.addScaledVector(d, t); rest -= t; done += t; }; // (along this leg)
    const turn = (nd: THREE.Vector3, nv: number) => { d = nd; v = nv; turned = true; b.events = (b.events || 0) + 1; };
    const stopped = (p: THREE.Vector3, t: number, body: boolean, vs: number) => ({ p, t, body, v: vs });
    legs: for (let leg = 0; leg < 12 && rest > 1e-4 && v > G.ROUND_LIFE.v; leg++) {
      const wall = L.raycast(map, o.x, o.y, o.z, d.x, d.y, d.z, rest, { bars: true }), hitWall = !!wall.solid && wall.t < rest - 1e-4, wallT = Math.min(wall.t, rest);
      const look = hitWall ? wallT : rest + 0.8; // (a body that straddles the end of this step: all of it, now)
      for (const h of this.roundHits(b, o, d, wallT)) {
        const tr = [] as PTrack, ev = h.ev, mate = h.mate; // (F9: the track through them, a step at a time, for the trail, and its fragments)
        // Whoever fired it decides what it did, on what they can see: the body as it stands on this screen, and what it's wearing
        const rig = ev ? ev.rig : mate ? mate.rig : h.rig as Rig, armour = ev ? B.suspectArmour(ev) : mate ? B.stateArmour(mate.st) : B.kitArmour(this), arrived = B.snap(b.proj);
        const r = B.through(rig, o, d, v, b.proj, armour, look, tr);
        if (!r || r.entryT == null) continue; // (inside the hitbox, outside the body: a near miss)
        b.hit.add(ev || mate || this);
        const hp = o.clone().addScaledVector(d, r.entryT);
        b.path.hit.push([this.pathPt(b, hp, v), ev ? 'e' + ev.id : 'p' + (mate ? mate.id : G.Net.myId), Math.round(v), arrived, +d.x.toFixed(4), +d.y.toFixed(4), +d.z.toFixed(4), r.exitV ? 1 : 0, B.armourLog(r), [+(r.exitT - r.entryT).toFixed(3), r.log!.length ? r.log![r.log!.length - 1].m : ''], this.pathFrags(o, d, tr)]);
        const hk = b.path.hit[b.path.hit.length - 1][1];
        if (!h.self && G.ShotLog) G.ShotLog.pose(b.shot, hk, rig); // (F9: them as they stood)
        if (b.trail) { (b.trail.keys = b.trail.keys || new Set()).add(hk); this.trailTrack(b, o, d, r, v, tr, h.self ? null : rig); G.HUD.hbPath = (r.log as { m: string; v: string | number }[]).concat({ m: r.exitV ? 'out' : 'stopped', v: Math.round(r.exitV) }); } // (F9: what it went through)
        if (ev) {
          B.wearOut(armour);
          this.hitEnemy(ev, r, b);
          ev.engagedT = performance.now(); // (yours to watch: its body's physics wherever it is, js/views.ts)
          ev.rig.hit(d, b.proj.m * v);
          ev.selfHit = true;
          ev.lastHitDir = d.clone().setY(0).normalize();
        } else {
          const out = B.outcome(r, armour);
          if (h.self) {
            if (b.enemy && G.Highlights) G.Highlights.hitBy(G.Net.myId!, b.enemy);
            this.applyWounds(out, o.clone(), !b.enemy);
          } else { // (theirs to take, as it was here: told to them at the end of the frame)
            const q = b.shot.ff.get(mate!.id) || { ws: [], rang: 0, stopped: 0, wear: {}, at: hp.toArray().map((x: number) => Math.round(x * 100) / 100) };
            q.ws.push(...out.ws); q.rang |= out.rang; q.stopped += out.stopped; if (out.fc) q.fc = (q.fc || []).concat(out.fc); if (out.hd) q.hd = (q.hd || []).concat(out.hd);
            for (const [k, j] of Object.entries(out.wear)) q.wear[k] = (q.wear[k] || 0) + j;
            b.shot.ff.set(mate!.id, q);
            mate!.rig.hit(d, b.proj.m * v);
          }
        }
        if (r.hits.some((x: any) => x.armour.some((q: any) => !q.through))) { G.R.impact(hp, null, 'armor'); if (G.Audio.armorHit) G.Audio.armorHit(); }
        if (r.hits.some((x: any) => x.E > 1)) {
          G.R.impact(hp, null, 'blood');
          // out the far side onto a wall close behind them
          if (r.exitV) { const back = L.raycast(map, hp.x, hp.y, hp.z, d.x, d.y, d.z, 1.6); if (back.n && back.t < 1.6) G.R.bloodWall(hp.clone().addScaledVector(d, back.t), back.n, 0.25 + 0.25 * (1 - back.t / 1.6)); }
        }
        b.proj = r.p;
        if (r.ric) { // off their armour (or round their skull) and away
          on(r.ric.t);
          turn(B.deflect(d, r.ric, r.ric.n), r.ric.v);
          o.addScaledVector(d, 0.02);
          this.roundMark(b, o, r.ric.n, 'metal', 'r', v, null, 'armour', { m: '' });
          continue legs;
        }
        if (!r.exitV) { if (ev && b.def.cls === 'BOW') this.boltIn(ev, r, o, d, b.am); return stopped(o.clone().addScaledVector(d, r.entryT), done + r.entryT, true, 0); }
        on(r.exitT);
        this.pathPt(b, o, r.exitV);
        turn(B.deflect(d, { dev: r.dev, bend: 0 }, null), r.exitV);
        continue legs;
      }
      if (!hitWall) { on(rest); break; }
      // the solid it's met: a target if it's that, and then what it's made of
      const s = wall.solid, at = o.clone().addScaledVector(d, wall.t), vIn = v, r = B.crossSolid(map, b.proj, v, wall, o, d), Jin = 0.5 * b.proj.m * vIn * vIn;
      const cut = G.Damage.hit(map as unknown as Parameters<typeof G.Damage.hit>[0], s, at, d, wall.n, r, o, Jin, b.proj.d * 1000); // (what it takes out of a wall or a door)
      if (s.door && !r.ric) { const pt = G.Damage.partAt(s.door, at.toArray()); if (pt != null) G.Net.toHost({ t: 'dhit', i: s.door.id, pt, J: Math.round(Jin), dir: [+d.x.toFixed(2), +d.z.toFixed(2)] }); } // (its handle, a hinge: the host keeps the score)
      if (s.target) G.Range.hit(s, at, d, b.proj.m * vIn);
      const pane0 = wall.pane != null && !(s.win && s.win.armor) && !r.ric; // (glass shows what it took across the whole pane: no mark on it)
      if (wall.pane != null && !(s.win && s.win.armor)) this.roundPane(wall.pane, at, d);
      if (!wall.view) this.roundMark(b, at, wall.n, r.fx, r.ric ? 'r' : 'e', vIn, s, r.name, { m: s.bars ? '' : r.mat, dir: d, stop: !r.ric && !r.v, cut: cut ? cut.r : pane0 ? 1 : 0, depth: r.depth });
      else { this.pathPt(b, at, vIn); if (b.trail) G.R.trailAdd(b.trail, at, true, vIn); }
      if (r.ric) {
        on(wall.t);
        o.addScaledVector(new THREE.Vector3(...wall.n), 0.004);
        turn(B.deflect(d, r, wall.n), r.v);
        if (G.Audio.ricochet) G.Audio.ricochet(at);
        continue;
      }
      if (cut && G.Damage.apply(map as unknown as Parameters<typeof G.Damage.apply>[0], cut.rec)) (b.shot.holes = b.shot.holes || []).push(cut.rec);
      if (!r.v) { if (b.def.cls === 'BOW' && !s.door && !wall.view && G.Bolts.holds(r.fx)) this.boltStuck(at.clone().addScaledVector(d, Math.min(r.depth || 0, 0.08)), d, b.am); return stopped(at, done + wall.t, false, vIn); } // (v: how fast it struck)
      if (wall.pane == null && !wall.view) b.walled = true; // (through something a person could hide behind)
      const n0 = wall.n;
      on(r.t);
      if (!wall.view) this.roundMark(b, o, r.nOut, r.fxOut, 'x', r.v, null, r.nameOut, { m: s.bars ? '' : r.matOut, dir: d, cut: cut ? cut.rOut : pane0 ? 1 : 0 });
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
  // A bolt that didn't come out stays in them, where it stopped, on the bone it's in: unless it's met a hard plate, which
  // it breaks or skates off, or it's gone in so far there's nothing left to see
  boltIn(ev: VwEnemy, r: any, o: THREE.Vector3, d: THREE.Vector3, am: string) {
    const armourStop = r.stopped && (r.log || []).filter((q: any) => q.k).pop(), B = G.Ballistics, depth = (r.exitT || 0) - r.entryT;
    if (r.glance || (armourStop && !(G.Materials.MAT as Record<string, any>)[armourStop.k].soft) || depth > G.Bolts.LEN - 0.08) return;
    const seg = B.segs().find((s: any) => s.id === (r.hits[r.hits.length - 1] || {}).seg) || B.segs().find((s: any) => s.id === 'chest'), bone = seg && B.boneOf(ev.rig, seg.bone);
    if (!bone) return;
    const l = G.Bolts.onBone(ev.rig, bone, o.clone().addScaledVector(d, r.stopped ? r.entryT + 0.02 : r.exitT), d, am);
    G.Net.toHost({ t: 'bstk', e: ev.id, b: seg.bone, l, am });
  },
  // into a wall, a target, a beam
  boltStuck(at: THREE.Vector3, d: THREE.Vector3, am: string) {
    G.Bolts.inWorld(at, d, am);
    G.Net.toHost({ t: 'bstk', at: at.toArray().map((x: number) => Math.round(x * 1000) / 1000), u: d.toArray().map((x: number) => Math.round(x * 1000) / 1000), am });
  },
  // who's on the line from a along dir, out to t, nearest first
  roundHits(b: PRound, a: THREE.Vector3, dir: THREE.Vector3, wallT: number) {
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
  // how: { m (what it's made of: '' nothing to damage), dir (the way it was going), stop (it stopped in it) }
  roundMark(b: PRound, p: THREE.Vector3, n: number[], fx: ImpactFx, kind: string, v: number, s: any, name: string, how: any = {}) {
    const o = { m: how.m, fx, k: kind, n, dir: how.dir, J: 0.5 * b.proj.m * v * v, stop: !!how.stop, cal: b.proj.d * 1000, cut: how.cut || 0 };
    b.path.ev.push([this.pathPt(b, p, v), kind, fx, n[0], n[1], n[2], name || '', how.m, Math.round(o.J), o.stop ? 1 : 0, +(how.depth || 0).toFixed(3), +o.cal.toFixed(1)]);
    G.R.impactOn(p, n, s, fx, o);
    if (b.trail) G.R.trailAdd(b.trail, p, true, v);
    (b.shot.fx = b.shot.fx || []).push(G.Ballistics.mark(p, n, fx, kind, o));
  },
  // a pane a round went through breaks (here at once, and for everyone through the host)
  // The first round fractures it, and it stays up; the next one, or a blast (all), or someone walking into it, brings it down.
  roundPane(id: number, at: THREE.Vector3, dir: THREE.Vector3, all?: boolean) {
    const win = G.Game.map!.windows[id];
    if (!win || win.broken) return;
    if (!win.cracked && !all) { G.Views.crackGlass(id, at, dir); G.Net.toHost({ t: 'crack', id, p: [+at.x.toFixed(3), +at.y.toFixed(3), +at.z.toFixed(3)] }); return; }
    G.Views.breakGlass(id, at, dir);
    G.Net.toHost({ t: 'glass', ids: [id] });
  },
  // the fragments of a round in someone, for its path: [x0, y0, z0, x1, y1, z1 (where it broke off, where it ended), speed there, speed out of them (0: stopped in them), grams, a splinter of bone?]
  pathFrags(a: THREE.Vector3, dir: THREE.Vector3, tr: PTrack) {
    return (tr.frags || []).map((f: any) => {
      const q = a.clone().addScaledVector(dir, f.t), e = q.clone().addScaledVector(f.dir, f.len);
      return [q.x, q.y, q.z, e.x, e.y, e.z].map((x) => +x.toFixed(3)).concat(Math.round(f.v0), Math.round(f.v), +(f.m * 1000).toFixed(2), f.sp ? 1 : 0);
    });
  },
  // F9: a round's track through someone on its trail: in at the speed it arrived (marked), each step inside at its speed
  // as it slowed (js/ballistics.ts through, traced), and where it stopped, if it did (marked)
  // (and the same track kept on them: their bones carry it as they move and fall, js/render.ts woundTrack)
  trailTrack(b: PRound, a: THREE.Vector3, dir: THREE.Vector3, r: any, vIn: number, tr: PTrack, rig: Rig | null) {
    const at = (t: number) => a.clone().addScaledVector(dir, t), pts = [];
    G.R.trailAdd(b.trail, at(r.entryT), true, vIn);
    if (tr.length) pts.push({ p: at(r.entryT), v: vIn, bone: tr[0].bone, mark: true });
    for (const s of tr) { G.R.trailAdd(b.trail, at(s.t), false, s.v); pts.push({ p: at(s.t), v: s.v, bone: s.bone }); }
    if (!r.exitV && tr.length) { G.R.trailAdd(b.trail, at(tr[tr.length - 1].t), true, 0); pts.push({ p: at(tr[tr.length - 1].t), v: 0, bone: tr[tr.length - 1].bone, mark: true }); }
    if (rig && pts.length > 1) G.R.woundTrack(rig, pts);
  },
  // the windows a blast round went through on the way break
  roundGlass(a: THREE.Vector3, dir: THREE.Vector3, wall: any, upTo: number) {
    for (const [id, gt] of wall.glass || []) if (gt < upTo) this.roundPane(id, a.clone().addScaledVector(dir, gt), dir, true);
  },
  // A round's wounds on a suspect, from its track through them (js/ballistics.ts): each part's damage (a share of a
  // standard person's life) and what it did there (bleeding, a broken bone, a collapsed lung, the organs it went
  // through), for the host to apply (js/server.ts applyHit, injure). A round through the brain, brainstem or the
  // spine in the neck is the end of them.
  hitEnemy(ev: VwEnemy, r: any, b: PRound) {
    let f = 0, kill = false, head = false, ap = false;
    this.hitQ = this.hitQ || new Map();
    const q: PHitQ = this.hitQ.get(ev.id) || { d: 0, f: 0, h: false, k: false };
    for (const h of r.hits) {
      const w = G.Ballistics.effects(h);
      if (w.dmg < 0.05 && !w.effects.length) continue;
      f += w.dmg / 100;
      if (w.effects.includes('dead')) kill = true;
      if (h.seg === 'cranium' || h.seg === 'jaw' || h.seg === 'neck') head = true;
      if (h.armour.some((a: any) => a.through)) ap = true; // (through their armour, and it still did harm: for the highlights)
      (q.w = q.w || []).push([w.part, w.effects.join(','), w.side || '', w.organs.map(([id, d, hp]) => `${id}:${Math.round(Math.min(1, d / hp) * 100)}`).join(',')]);
    }
    q.f += f; q.h = q.h || head; q.k = q.k || kill; q.ap = q.ap || ap;
    this.hitQ.set(ev.id, q);
    if (b && f > 0 && G.Arsenal) G.Arsenal.hit(ev, b);
  },
  // d: plain damage (blasts); f: wounds, as a share of a standard person's life; k: a killing headshot
  queueHit(eid: number, dmg: number, head: boolean, f = 0, kill = false) {
    const q = this.hitQ.get(eid) || { d: 0, f: 0, h: false, k: false };
    q.d += dmg; q.f += f; q.h = q.h || head; q.k = q.k || kill;
    this.hitQ.set(eid, q);
  },
  flushHits() {
    if (!this.hitQ || !this.hitQ.size) return;
    for (const [e, q] of this.hitQ) {
      G.Net.toHost({ t: 'hit', e, d: Math.round(q.d), f: Math.round(q.f * 1000) / 1000, k: q.k ? 1 : 0, h: q.h, ap: q.ap ? 1 : undefined, w: q.w ? q.w.slice(0, 12) : undefined, gr: q.gr || undefined, tb: q.tb || undefined });
      this.stats.dmg += q.d + q.f * 100 + (q.k ? 100 : 0);
    }
    this.hitQ.clear();
  },

  explode(p: THREE.Vector3, r: number, dmg: number, isNade?: boolean) {
    G.R.explosion(p, r);
    G.Audio.boom(G.R.camera.position.distanceTo(p));
    const map = G.Game.map!;
    // The burst's seed goes out with the boom (a number, not 800 positions): every screen flies the same chips off the same
    // walls from it (fragBurst), so the pocks and the clean shadows behind cover are the same for everyone. What the chips
    // do to bodies, and what the walls' own dice do to a chip after its first strike, is each screen's own. (It names the
    // grenade too: the hits its blast and chips do carry it, gr, so a kill of them is the grenade's in the highlights.)
    const seed = isNade ? ((Math.random() * 4294967295) >>> 0) + 1 : 0; // (never 0: that's no seed)
    for (const ev of G.Views.enemies.values()) {
      if (!ev.alive) continue;
      const cy = (ev.pos.y || 0) + 1.0 * ev.def.scale; // (their middle, on whatever floor they stand on)
      const d = Math.hypot(ev.pos.x - p.x, cy - p.y, ev.pos.z - p.z);
      if (d > r + 0.4 * ev.def.scale) continue;
      if (!G.Level.los(map, p.x, p.y + 0.2, p.z, ev.pos.x, cy, ev.pos.z)) continue;
      this.queueHit(ev.id, dmg * (1 - Math.min(1, d / r) * 0.6), false);
      if (seed) this.hitQ.get(ev.id)!.gr = seed;
      ev.selfHit = true;
    }
    const r2 = (v: number) => Math.round(v * 100) / 100;
    if (isNade && G.Highlights) G.Highlights.boom('p' + G.Net.myId, p, seed); // (the replays: when and where, as it goes off here)
    if (isNade) this.fragBurst(p, undefined, seed);
    G.Net.toHost({ t: 'boom', p: [r2(p.x), r2(p.y), r2(p.z)], r: r2(r), d: Math.round(dmg), fr: isNade ? 1 : undefined, s: isNade ? seed : undefined });
  },

  // ---------------------------------------------------------------- fragmentation
  // A frag grenade (an M26 / M61 / L2 sort: a thin sheet body lined with a notched steel wire coil) comes apart into about FRAG.N
  // chips, thrown out over the whole sphere: short square bits of the coil, about 130 mg each and much of a size (the notches decide
  // where it breaks), at about 1,150 m/s (some 86 J apiece). That's 3.7 to a square metre at 5 m and 0.9 at 10 m. Each is a round of
  // its own (js/ballistics.ts: a ragged flake of mild steel that mass, tumbling: fragOne): it slows in the air by its own drag, goes into
  // whoever is in its way through their armour and body (through), through walls and cover by what they are made of
  // (crossSolid), or stops in them. So how many reach someone is how much of the sphere they fill (a body at 3 m
  // fills about 1/200th of it: about six chips), and the lethal radius, about five metres, is where that is enough to wound a few times
  // over; further out they go on thinning (and slowing) as a hazard; walls and a table in the way stop most.
  // Spread over frames: the work is a ray per chip (a wall and a body test), so a burst is queued and worked off by
  // a time budget a frame (FRAG.BUDGET_MS, at least FRAG.MIN_PER_FRAME chips): a few frames at most. A chip that has
  // flown is flown at once (at a kilometre a second the air time is nothing). A body takes at most FRAG.CAP of them
  // through the full wound sums (the rest pass it by) so a crowd of chips on one man costs no more than that.
  BLAST: G_Sim.BLAST, // (the burst's own push of air, close in: the chips are the rest. js/sim.ts)
  // A burst lying on something hard pushes its whole blast into the half above it, and it carries further (js/sim.ts blastR)
  blastR(map: LvMap | null, p: THREE.Vector3) { return G.Sim.blastR(map, p); },
  FRAG: { N: 1200, V0: 1150, VMIN: 70, RANGE: 70, CAP: 28, BUDGET_MS: 3, MIN_PER_FRAME: 40, M_MED: 0.00013, M_SD: 0.25, CD: 1.0, FLAKE: 1.5, SHOW: 26, PUFFS: 14, BLOOD: 24 },
  fragQ: null as null | any[],
  fragLogs: [] as any[],
  // p: where it went off. enemy: a suspect's (id): it is you it is meant for, and no one else it hurts here. seed: the
  // burst's (the same on every screen: the chips' directions, masses and speeds all come from it). marksOnly: someone
  // else's grenade, flown only against the walls, to leave the same pocks (no bodies, no streaks, no wounds)
  fragBurst(p: THREE.Vector3, enemy?: number, seed?: number, marksOnly?: boolean) {
    const F = this.FRAG, n = F.N, dir = new Float32Array(n * 3), m = new Float32Array(n), v = new Float32Array(n);
    const rnd = seed ? G.U.rng(seed) : Math.random;
    this.scorchAt(p, rnd);
    const crater = this.craterAt(p, seed); // (its own dice, not rnd's: the chips fly as they always have from the seed)
    // Where they go: anywhere over the whole sphere, each chip its own random direction (no lattice: with nothing evening
    // them out they bunch and leave gaps by chance, as a burst casing's do)
    const norm = () => Math.sqrt(-2 * Math.log(1 - rnd())) * Math.cos(Math.PI * 2 * rnd());
    const u = new THREE.Vector3();
    for (let i = 0; i < n; i++) {
      const c = 2 * rnd() - 1, r = Math.sqrt(1 - c * c), a = rnd() * 6.283; // (uniform over the sphere: the height uniform, the angle round uniform)
      u.set(Math.cos(a) * r, c, Math.sin(a) * r);
      dir[i * 3] = u.x; dir[i * 3 + 1] = u.y; dir[i * 3 + 2] = u.z;
      m[i] = G.U.clamp(F.M_MED * Math.exp(F.M_SD * norm()), F.M_MED * 0.4, F.M_MED * 2.5); // (the coil's notches make them much of a size)
      v[i] = F.V0 * (0.85 + 0.3 * rnd()) * Math.pow(F.M_MED / m[i], 0.12);
    }
    const pos = marksOnly ? null : new Float32Array(n * 6), geo = new THREE.BufferGeometry();
    let line: THREE.LineSegments | null = null;
    if (pos) {
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      line = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color: 0xffd9a0, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false }));
      line.frustumCulled = false; G.R.dynRoot.add(line);
    }
    const q = { p: p.clone(), crater, enemy, seed: seed || 0, marksOnly: !!marksOnly, n, i: 0, dir, m, v, pos, line, geo, shot: { sid: 0, ff: new Map(), f: 0, enemy: enemy || undefined } as any, per: new Map<string, any>(),
      ms: 0, maxMs: 0, frames: 0, walls: 0, mats: {} as Record<string, number[]>, escaped: 0, puffs: 0, blood: 0, fade: -1 };
    (this.fragQ = this.fragQ || []).push(q);
  },
  stepFrags(dt: number) {
    const Q = this.fragQ;
    if (!Q || !Q.length) return;
    const F = this.FRAG, q = Q[0];
    if (q.i < q.n) {
      const t0 = performance.now();
      let k = 0;
      while (q.i < q.n && (k < F.MIN_PER_FRAME || performance.now() - t0 < F.BUDGET_MS)) { this.fragOne(q, q.i++); k++; }
      const ms = performance.now() - t0;
      q.ms += ms; q.maxMs = Math.max(q.maxMs, ms); q.frames++;
      if (q.line) q.geo.attributes.position.needsUpdate = true;
      G.R.fragMarkFlush(); // (this frame's pocks go up to the GPU in one go)
      if (q.i >= q.n) this.fragDone(q);
    } else {
      q.fade -= dt;
      if (q.line) (q.line.material as THREE.LineBasicMaterial).opacity = Math.max(0, q.fade / 0.25) * 0.9;
      if (q.fade <= 0) { if (q.line) { G.R.dynRoot.remove(q.line); q.geo.dispose(); (q.line.material as THREE.Material).dispose(); } Q.shift(); }
    }
  },
  fragDone(q: any) {
    q.fade = 0.25;
    for (const [tg, f] of q.shot.ff) G.Net.toHost(Object.assign({ t: 'ff', tg, f: 0, e: q.shot.enemy }, f)); // (what they did to a teammate)
    q.shot.ff.clear();
    if (q.paths && G.ShotLog) G.ShotLog.keepAll(q.paths, { holder: q.shot, name: q.enemy ? "Suspect's frag grenade" : 'Frag grenade', burst: true }); // (F9: its fragments that hit someone, as one shot)
    // and for the replays, here and on the squad's machines (yours only: a suspect's is flown here for you alone): those same paths, their
    // points and who they went into, less what only F9 reads (what the armour did, the track through them), 48 at most
    if (q.paths && !q.enemy && q.seed && G.Highlights) {
      const ps = q.paths.slice(0, 48).map((b: ShotPath) => ({ p: b.p, hit: b.hit.map((h: any[]) => [h[0], h[1], h[2], 0, h[4], h[5], h[6], h[7]]) }));
      G.Highlights.fragPaths(q.seed, ps as ShotPath[]);
      G.Net.toHost({ t: 'npath', s: q.seed, ps });
    }
    q.paths = null;
    const per: Record<string, any> = {};
    for (const [k, v] of q.per) per[k] = v;
    this.fragLogs.push({ at: q.p.toArray().map((x: number) => +x.toFixed(2)), n: q.n, frames: q.frames, ms: +q.ms.toFixed(2), maxFrameMs: +q.maxMs.toFixed(2), walls: q.walls, mats: q.mats, escaped: q.escaped, per });
    if (this.fragLogs.length > 20) this.fragLogs.shift();
  },
  // one chip, flown from the burst to wherever it ends
  fragOne(q: any, i: number) {
    const F = this.FRAG, B = G.Ballistics, L = G.Level, map = G.Game.map!, m = q.m[i];
    // A chip of the coil is a short square bit of wire, not a ball: tumbling, it shows the air and whatever it strikes about one and a
    // half times the area of a cube of its steel (a 130 mg chip: about 3.5 mm across), so it slows by a factor e in about 22 m (some
    // 55 J left at 5 m, 35 J at 10 m) and goes into things like a small blunt object (js/ballistics.ts vLimit: the wider, the harder)
    const A = F.FLAKE * Math.pow(m / 7850, 2 / 3), dia = Math.sqrt(4 * A / Math.PI);
    const d = new THREE.Vector3(q.dir[i * 3], q.dir[i * 3 + 1], q.dir[i * 3 + 2]), o = q.p.clone();
    const proj: any = { m, d: dia, len: m / (7850 * A), core: 'mild', nose: 'ball', flat: true, d0: dia, m0: m, ang: 0 };
    const drag0 = (2 * m) / (F.CD * 1.2 * A); // (metres to lose a factor e of its speed in the air)
    let drag = drag0, v = q.v[i], rest = F.RANGE, hitSomething = false;
    const b: any = { hit: new Set(), enemy: q.enemy, events: 1 };
    const pb: any = { path: this.newPath(o, v) }, pt = (p: THREE.Vector3, vv: number) => this.pathPt(pb, p, vv); // (F9: its path, kept if it hits someone: fragDone)
    const wallEv = (k: string, n: number[], name: string) => pb.path.ev.push([pt(o, v), k, 0, n[0], n[1], n[2], name || '', '', Math.round(0.5 * proj.m * v * v), 0, 0, +(proj.d * 1000).toFixed(1)]);
    const end = () => { pt(o, v > F.VMIN ? v : 0); if (pb.path.hit.length) (q.paths = q.paths || []).push(pb.path); this.fragShow(q, i, o); };
    const adv = (t: number) => { o.addScaledVector(d, t); rest -= t; v *= Math.exp(-t / drag); };
    const key = (h: any) => (h.ev ? 'e' + h.ev.id : h.mate ? 'p' + h.mate.id : 'me');
    legs: for (let leg = 0; leg < 10 && rest > 1e-3 && v > F.VMIN; leg++) {
      const wall = L.raycast(map, o.x, o.y, o.z, d.x, d.y, d.z, rest, { bars: true }), hitWall = !!wall.solid && wall.t < rest - 1e-4, wallT = Math.min(wall.t, rest);
      if (!q.marksOnly) for (const h of this.roundHits(b, o, d, wallT)) {
        const k = key(h), rec = q.per.get(k) || { tests: 0, hits: 0, stopped: 0, through: 0, armourStopped: 0, capped: 0 };
        q.per.set(k, rec);
        if (rec.tests >= F.CAP) { rec.capped++; continue; } // (a body's full: the rest of the burst passes it by)
        rec.tests++;
        const vh = v * Math.exp(-h.t / drag), ev = h.ev, mate = h.mate;
        const rig = ev ? ev.rig : mate ? mate.rig : h.rig, armour = ev ? B.suspectArmour(ev) : mate ? B.stateArmour(mate.st) : B.kitArmour(this);
        const tr = [] as PTrack, arrived = B.snap(proj); // (F9: the track through them, for its fragments)
        const r = B.through(rig, o, d, vh, proj, armour, Math.min(wallT + 0.8, h.t + 2.5), tr);
        if (!r || r.entryT == null) continue;
        b.hit.add(ev || mate || this); rec.hits++; hitSomething = true;
        const hp = o.clone().addScaledVector(d, r.entryT), hk = k === 'me' ? 'p' + G.Net.myId : k;
        pb.path.hit.push([pt(hp, vh), hk, Math.round(vh), arrived, +d.x.toFixed(4), +d.y.toFixed(4), +d.z.toFixed(4), r.exitV ? 1 : 0, B.armourLog(r), [+(r.exitT - r.entryT).toFixed(3), r.log && r.log.length ? r.log[r.log.length - 1].m : ''], this.pathFrags(o, d, tr)]);
        if (!h.self && G.ShotLog) G.ShotLog.pose(q.shot, hk, rig as Rig); // (F9: them as they stood)
        if (ev) {
          B.wearOut(armour);
          this.hitEnemy(ev, r, null as any); // (not a gun's: no weapon path counts it)
          if (q.seed) this.hitQ.get(ev.id)!.gr = q.seed; // (the grenade's: its kill is the grenade's, in the highlights)
          if (rec.hits <= 6) ev.rig.hit(d, proj.m * vh);
          ev.selfHit = true; ev.engagedT = performance.now(); ev.lastHitDir = d.clone().setY(0).normalize();
        } else {
          const out = B.outcome(r, armour);
          if (h.self) this.applyWounds(out, q.p.clone(), !q.enemy);
          else {
            const ff = q.shot.ff.get(mate!.id) || { ws: [], rang: 0, stopped: 0, wear: {}, at: hp.toArray().map((x: number) => Math.round(x * 100) / 100) };
            ff.ws.push(...out.ws); ff.rang |= out.rang; ff.stopped += out.stopped; if (out.fc) ff.fc = (ff.fc || []).concat(out.fc); if (out.hd) ff.hd = (ff.hd || []).concat(out.hd);
            for (const [kk, j] of Object.entries(out.wear)) ff.wear[kk] = (ff.wear[kk] || 0) + (j as number);
            q.shot.ff.set(mate!.id, ff);
            if (rec.hits <= 6) mate!.rig.hit(d, proj.m * vh);
          }
        }
        if (r.hits.some((x: any) => x.armour.some((a: any) => !a.through))) rec.armourStopped++;
        if (q.blood < F.BLOOD && r.hits.some((x: any) => x.E > 1)) { q.blood++; G.R.impact(hp, null, 'blood'); }
        proj.m = r.p ? r.p.m : proj.m;
        if (!r.exitV) { rec.stopped++; adv(r.entryT); v = 0; end(); return; }
        rec.through++;
        adv(r.exitT); v = r.exitV; pt(o, v);
        d.copy(B.deflect(d, { dev: r.dev, bend: 0 }, null));
        drag = B.flightDrag(proj, drag0);
        continue legs;
      }
      if (!hitWall) { adv(rest); break; }
      adv(wall.t);
      q.walls++;
      const vIn = v, r = B.crossSolid(map, proj, v, wall, o, d);
      // its pock on the face it struck (whether it stopped, went through or glanced off), turned to face the way it came; none
      // in the crater under the burst, which stands for them all (craterAt)
      const C = q.crater;
      if (!(C && Math.abs(wall.n[1]) > 0.7 && Math.abs(o.y - C.y) < 0.12 && Math.hypot(o.x - C.x, o.z - C.z) < C.r)) { const f = d.x * wall.n[0] + d.y * wall.n[1] + d.z * wall.n[2] > 0 ? -1 : 1; G.R.fragMark(o, [wall.n[0] * f, wall.n[1] * f, wall.n[2] * f], r.fx, G.U.clamp(Math.sqrt(vIn / 600), 0.5, 1.3) * (r.ric ? 0.6 : 1), (i * 0.6180339) % 1, (i * 0.7548777) % 1); }
      wallEv(r.ric ? 'r' : 'e', wall.n, r.name);
      { const mm = q.mats[r.name || "?"] = q.mats[r.name || "?"] || [0, 0, 0]; if (r.ric) mm[2]++; else if (!r.v) mm[0]++; else mm[1]++; } // (what the walls did: stopped, let through, glanced)
      if (q.puffs < F.PUFFS && !hitSomething && Math.random() < 0.05) { q.puffs++; G.R.particles(o.clone(), 3, 0xb4aa98, 2.5, 0.35, 2, 0.5); }
      if (r.ric) { o.addScaledVector(new THREE.Vector3(...wall.n), 0.004); d.copy(B.deflect(d, r, wall.n)); v = r.v; continue; }
      if (!r.v) { v = 0; end(); return; }
      adv(r.t); v = r.v; pb.path.ev.push([pt(o, v), 'x']); d.copy(B.deflect(d, r, wall.n)); o.addScaledVector(d, 0.004);
    }
    if (v > F.VMIN) q.escaped++;
    end();
  },
  // The soot where a grenade went off, on the floor (or table) under it: faint if it went off in the air, none if high. The
  // same on every screen: it is worked out from the burst's point and seed alone. (Flashbangs leave none: they are all
  // light and noise.)
  // A frag that went off on (or just over) the floor blows a shallow pit in it, and its downward chips (about half of them, at a
  // hand's breadth up: most within half a metre) tear up the ground round that: one crater (js/render.ts crater) in place of
  // hundreds of pocks heaped on top of each other. Its size: CRATER.R across the torn-up patch, less the higher it went off;
  // none over CRATER.H. Its dice are the seed's own (every screen the same crater), apart from the chips'.
  CRATER: { R: 0.5, H: 0.3 },
  craterAt(p: THREE.Vector3, seed?: number) {
    const map = G.Game.map; if (!map) return null;
    const g = G.Level.groundAt(map, p.x, p.z, 0.01, p.y + 0.05), h = p.y - g;
    if (h > this.CRATER.H || h < -0.05) return null;
    const rnd = seed ? G.U.rng(((seed ^ 0x5bd1e995) >>> 0) || 1) : Math.random, r = this.CRATER.R * (1 - 0.45 * Math.max(0, h) / this.CRATER.H) * (0.9 + 0.2 * rnd());
    G.R.crater(p.x, g, p.z, r * 2.1, rnd() * 6.283);
    return { x: p.x, y: g, z: p.z, r };
  },
  scorchAt(p: THREE.Vector3, rnd: () => number) {
    const map = G.Game.map; if (!map) return;
    const g = G.Level.groundAt(map, p.x, p.z, 0.01, p.y + 0.05), h = p.y - g, d = 0.6 + 0.9 * rnd(), rot = rnd() * 6.283;
    if (h > 0.6 || h < -0.5) return;
    G.R.scorch(p.x, g, p.z, d, 0.9 * (h < 0.25 ? 1 : 1 - (h - 0.25) / 0.35 * 0.65), rot);
  },
  // a chip's streak, from the burst to where it ended (the first FRAG.SHOW metres of it)
  fragShow(q: any, i: number, end: THREE.Vector3) {
    if (!q.pos) return;
    const a = q.p, dx = end.x - a.x, dy = end.y - a.y, dz = end.z - a.z, len = Math.hypot(dx, dy, dz) || 1, k = Math.min(1, this.FRAG.SHOW / len), P = q.pos;
    P[i * 6] = a.x; P[i * 6 + 1] = a.y; P[i * 6 + 2] = a.z; P[i * 6 + 3] = a.x + dx * k; P[i * 6 + 4] = a.y + dy * k; P[i * 6 + 5] = a.z + dz * k;
  },

  // ---------------------------------------------------------------- the thermobaric grenade
  // An enhanced-blast (thermobaric) charge: a small burster that throws its fuel out as a cloud (aluminium and an oxidiser-poor
  // explosive, mostly), which then lights. It burns as a fireball that fills the space the cloud reached, and the burning goes on
  // for a good part of a second (the afterburn, as the aluminium finds air), so the pressure it makes lasts many times longer
  // than a frag's crack: a long, pushing wave that goes round corners and bounces about a closed room, and that's what kills,
  // in the lungs and the gut (primary blast injury), along with the burns from the fireball itself. In a closed room nearly all
  // of that energy stays in: the pressure builds up over the whole room (quasi-static: its energy over the room's volume) and
  // holds. In the open the cloud thins and rises, burns less of its fuel, and there's nothing to hold the pressure in: a far
  // smaller fireball and a short shove. Almost no fragments (a thin casing). Here:
  //   the cloud: from where it went off, cell by cell through the room as gas spreads (G.Level.blastFill: walls and shut doors
  //   stop it, open doorways let it through), CLOUD cells of floor at most (a room of about 50 m²), fewer the more of it is open
  //   to the sky. Inside it: BURN and BLAST (a share of a life each), the blast by how confined it is (conf).
  //   the space: the same fill carried on to SPACE cells (the room and what's open onto it), its volume at a real room's height
  //   (ROOM_H), what the burn puts in it as pressure (E: the energy that ends up as heat in the air, 0.4 of it as pressure in
  //   a diatomic gas): qs kPa, held for a long time. Outside the cloud but in that space: hurt by qs past QS0, and dazed.
  //   through a wall or a shut door: a thump, no harm: dazed a little, close by.
  // The same everywhere from where it went off (the map and its doors), so every machine draws the same fireball and the F9
  // view shows the volume it filled.
  TB: G_Sim.TB, // (the reckoning: js/sim.ts tbModel, tbDose)
  tbModel(map: LvMap, p: THREE.Vector3): PTbModel { return G.Sim.tbModel(map, p); },
  // what a thermobaric's burst does to someone at (x, y, z): burn and blast (shares of a life), daze (0..1), and where they were
  tbDose(M: PTbModel, x: number, y: number, z: number) { return G.Sim.tbDose(M, x, y, z); },
  // Yours went off: what it does to the suspects here (as a frag's chips do: told to the host as their hits, gr its seed, so a
  // kill of them is the grenade's in the highlights), drawn, heard, and the host told (it dazes those it didn't kill, js/server.ts,
  // and tells the squad: everyone draws the same fireball from it, and takes what it does to them: js/game.ts onBoom)
  thermobaric(p: THREE.Vector3) {
    const map = G.Game.map!, M = this.tbModel(map, p), seed = ((Math.random() * 4294967295) >>> 0) + 1;
    G.R.fireball(M);
    G.Audio.thermobaric(G.R.camera.position.distanceTo(p));
    const log: any[] = [];
    this.hitQ = this.hitQ || new Map();
    for (const ev of G.Views.enemies.values()) {
      if (!ev.alive) continue;
      const q = this.tbDose(M, ev.pos.x, (ev.pos.y || 0) + 1.0, ev.pos.z), f = q.burn + q.blast;
      log.push({ id: ev.id, p: [ev.pos.x, ev.pos.y || 0, ev.pos.z], at: q.at, d: +q.d.toFixed(1), burn: +q.burn.toFixed(2), blast: +q.blast.toFixed(2), daze: +q.daze.toFixed(2) });
      if (f < 0.01) continue;
      this.queueHit(ev.id, 0, false, f);
      const h = this.hitQ.get(ev.id)!; h.gr = seed;
      h.tb = [+(q.burn.toFixed(2)), +(q.blast.toFixed(2))]; // (what the fireball did, burns and blast, each a share of a life: the host keeps it on them for F9, js/hud.ts)
      if (q.blast > 0.3) (h.w = h.w || []).push(['thorax', 'lung', '', `lungL:${Math.round(Math.min(1, q.blast) * 80)},lungR:${Math.round(Math.min(1, q.blast) * 80)}`]); // (blast lung: the air sacs torn)
      ev.selfHit = true;
    }
    this.tbLogs.push({ at: p.toArray().map((x) => +x.toFixed(2)), cloud: M.cloud, space: M.space, closed: M.closed, conf: +M.conf.toFixed(2), qs: +M.qs.toFixed(1), m2: +M.areaCloud.toFixed(1), who: log });
    if (this.tbLogs.length > 10) this.tbLogs.shift();
    if (G.ShotLog) G.ShotLog.keepFill(M, log, 'Thermobaric');
    if (G.Highlights) G.Highlights.boom('p' + G.Net.myId, p, seed, 'tb');
    const r2 = (v: number) => Math.round(v * 100) / 100;
    G.Net.toHost({ t: 'boom', p: [r2(p.x), r2(p.y), r2(p.z)], r: r2(Math.max(3, M.rc)), d: 0, tb: 1, s: seed });
  },
  tbLogs: [] as any[],
  // someone's thermobaric went off where you are (js/game.ts onBoom): the fireball's burns, the blast in your chest, the daze
  // (the room swims, your ears ring). friendly: an officer's (40%, as a frag's blast is to you)
  tbOnMe(M: PTbModel, friendly: boolean) {
    if (!this.pos || this.down || this.dead) return;
    const q = this.tbDose(M, this.pos.x, this.pos.y + 1.0, this.pos.z), k = friendly ? 0.4 : 1;
    if (q.daze > 0.03) { G.Audio.deafen(Math.min(1, q.daze)); this.shakeT = Math.max(this.shakeT || 0, 0.3 + 0.6 * q.daze); }
    if (q.at === 'cloud') G.HUD.flash(0.6);
    const burn = q.burn * 100 * k, blast = q.blast * 100 * k;
    if (burn + blast < 1) return;
    let fate = null;
    // the blast: the chest and the gut most (the air in them); the burns: wherever skin shows, the head and arms most
    for (const [part, b, u] of [['thorax', 0.45, 0.15], ['stomach', 0.25, 0.1], ['head', 0.05, 0.3], ['armL', 0.05, 0.15], ['armR', 0.05, 0.15], ['legL', 0.075, 0.075], ['legR', 0.075, 0.075]] as [string, number, number][]) {
      fate = this.worse(fate, G.Med.hit(this.body, part, blast * b + burn * u, false, 0, true)); // (no wound to bleed from: through 0)
    }
    if (q.blast * k > 0.3) this.body.parts.thorax.lung = true;
    if (fate === 'dead') { this.killed(M.p, q.at === 'cloud' ? 'Caught in the fireball' : 'Killed by the blast'); return; }
    this.hurt(burn + blast, M.p, fate);
  },
  // a flashbang of yours went off: the host works out who it blinds (and tells everyone, you too)
  flashBang(p: THREE.Vector3) {
    const r2 = (v: number) => Math.round(v * 100) / 100;
    G.Net.toHost({ t: 'flash', p: [r2(p.x), r2(p.y), r2(p.z)] });
  },
  // ------------------------------------------------------------- quick slots: 3, 4 and 5
  // Each holds a kind of throwable: 'frag', 'flash' or 'tb' (or nothing). The key throws one from your kit. Bound by
  // dragging a grenade onto the slot's box in the inventory (G.InvUI); kept between sessions.
  QUICK_DEFAULT: ['frag', 'flash', 'tb'] as (PHeldKind | null)[],
  get quick(): any[] { // (the slots' kinds, PHeldKind | null; wider for the HUD's and the inventory's callbacks)
    if (!this._quick) { const q = G.U.store.get('quick', null); this._quick = Array.isArray(q) && q.length === 3 ? q.slice() : this.QUICK_DEFAULT.slice(); }
    return this._quick;
  },
  setQuick(i: number, kind: PHeldKind | null) {
    const q = this.quick, was = kind ? q.indexOf(kind) : -1;
    if (was >= 0 && was !== i) q[was] = q[i]; // (it was on another key: they swap)
    q[i] = kind || null;
    G.U.store.set('quick', q);
    G.HUD.toast('', kind ? `${this.quickName(kind)} on key ${i + 3}` : `Key ${i + 3} cleared`, 1.2);
  },
  // the kind of quick-slot gear an item is (null: not one)
  // the kind of quick-slot gear an item is: a throwable (null: not one; medical gear isn't)
  quickKind(it: GItem | null) { return it && (it.k === 'frag' || it.k === 'flash' || it.k === 'tb') ? it.k : null; },
  quickName(kind: string | null) { return kind === 'frag' ? 'Frag' : kind === 'flash' ? 'Flashbang' : kind === 'tb' ? 'Thermobaric' : '—'; },
  // how many of that kind you carry
  quickCount(kind: string | null) { return this.kit && kind ? G.Gear.count(this, kind) : 0; },
  // ------------------------------------------------------------- gear in hand (keys 3, 4, 5)
  // The key brings that grenade into your hand (the weapon goes down; the key again, or 1 / 2, brings it back).
  // Left click pulls the pin and draws back, letting go throws it; right click picks the throw: underhand (a lob
  // that rolls on along the floor), weak, or strong. While it's in your hand, its arc shows where it'll go off.
  // Drawn back, R lets the spoon fly: the fuse is burning in your hand from then (cooking it), the arc shortens with
  // it, and let go late it bursts in the air over them or just as it lands, with no time to get away from it (js/server.ts
  // dodge); hold it too long and it goes off where you stand. Put away while it's cooking, it's dropped at your feet.
  // Out of them, the weapon comes back up. held: { kind, cock, str, readyT (bringing it up), throwT (the throw), cook }.
  THROWS: [['Underhand', 6.5, 2.4], ['Weak', 10, 3], ['Strong', 15.5, 3.2]] as [string, number, number][],
  equip(i: number) {
    const kind = this.quick[i];
    if (this.dead || this.down || this.action || G.Game.hub || this.seat != null) return; // (no throwing in the hangar)
    if (!kind) { G.HUD.toast('', `Nothing on key ${i + 3}: drag a grenade onto its box in the inventory`, 1.6); return; }
    if (this.held && this.held.kind === kind) { if (this.held.throwT < 0 && !this.held.cock) this.unequip(); return; }
    if (!this.quickCount(kind)) { G.HUD.toast('', kind === 'flash' ? 'No flashbangs' : kind === 'tb' ? 'No thermobarics' : 'No grenades', 1.2); G.Audio.deny(); return; }
    this.held = { kind, cock: false, str: this.throwStr == null ? 2 : this.throwStr, readyT: 0.35, throwT: -1, lastL: true, lastR: true };
    this.reloading = false; this.burstQ = 0; this.inspectT = 0; this.magChk = null; this.rChk = null; this.rHeldAt = 0; this.lowToggle = false;
    G.Audio.click();
  },
  unequip() {
    if (!this.held) return;
    if (this.held.cook != null && this.held.throwT < 0) this.throwHeld(true); // (live in your hand: it can't go back in the pouch)
    this.held = null;
    this.raiseT = this.raiseMax = this.drawTime(); // (the weapon comes back up)
  },
  // the fuses: a flashbang's short (an M84's 1-2.3 s), a frag's and a thermobaric's a little longer (cook them to cut that)
  fuseOf(kind: PHeldKind) { return kind === 'flash' ? 1.5 : kind === 'tb' ? this.TB.FUSE : 2.2; },
  // what's left of the fuse of the one in your hand (all of it, till the spoon's gone)
  fuseLeft(h: PHeld) { return h.cook != null ? Math.max(0.02, h.cook) : this.fuseOf(h.kind); },
  // R, drawn back: the spoon goes, and the fuse with it
  cookHeld() {
    const h = this.held;
    if (!h || !h.cock || h.cook != null || h.throwT >= 0) return;
    h.cook = this.fuseOf(h.kind);
    G.Audio.spoon();
  },
  // where a throw of this strength leaves your hand, and how fast (underhand: from the hip, a lob)
  throwLaunch(str: number) {
    const cam = G.R.camera, fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(cam.quaternion), [, sp, up] = this.THROWS[str];
    const from = cam.position.clone(), p = from.clone().addScaledVector(fwd, 0.45);
    if (str === 0) p.y -= 0.65;
    // (never from inside a wall you're standing against)
    const d = p.clone().sub(from), len = d.length(), h = G.Level.raycast(G.Game.map!, from.x, from.y, from.z, d.x / len, d.y / len, d.z / len, len);
    if (h.t < len) p.copy(from).addScaledVector(d, Math.max(0, h.t - 0.12) / len);
    const v = fwd.multiplyScalar(sp).add(new THREE.Vector3(this.vel.x * 0.5, up, this.vel.z * 0.5));
    return { p, v };
  },
  heldStep(dt: number) {
    const h = this.held!, ok = G.Game.locked && !G.Game.chatOpen, l = this.mouse.l && ok, r = this.mouse.r && ok;
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
    if (h.cook != null) { h.cook -= dt; if (h.cook <= 0) { h.cock = false; this.throwHeld(true); return; } } // (held too long: it goes off in your hand)
    if (h.cock && (!l || this.down)) { h.cock = false; this.throwHeld(this.down); } // let go: thrown (gone down: it falls from your hand)
    if (!h.cock && !this.down) { const { p, v } = this.throwLaunch(h.str); G.R.throwArc(G.Views.predictNade(p, v, this.fuseLeft(h), G.Game.map), false); }
    else if (h.cock) { const { p, v } = this.throwLaunch(h.str); G.R.throwArc(G.Views.predictNade(p, v, this.fuseLeft(h), G.Game.map), true); }
  },
  // drop: not thrown but let fall where you stand (a cooked one put away, held too long, or you went down with it)
  throwHeld(drop = false) {
    const h = this.held!, kind = h.kind, fuse = this.fuseLeft(h);
    h.cook = undefined;
    if (!G.Gear.take(this, kind)) { this.unequip(); return; }
    const { p, v } = drop ? { p: this.pos.clone().add(new THREE.Vector3(0, 0.9, 0)), v: new THREE.Vector3(this.vel.x * 0.3, -0.5, this.vel.z * 0.3) } : this.throwLaunch(h.str);
    G.Views.addNade(p, v, fuse, true, false, kind);
    if (G.Highlights) G.Highlights.nade('p' + G.Net.myId, p, v, fuse, kind); // (its flight, for the replays)
    h.throwT = 0;
    const r2 = (x: number) => Math.round(x * 100) / 100;
    G.Net.toHost({ t: 'nade', p: [p.x, p.y, p.z].map(r2), v: [v.x, v.y, v.z].map(r2), fuse, k: kind, s: h.str });
  },
  shout() {
    if (this.dead || (this.shoutT || 0) > performance.now()) return;
    this.shoutT = performance.now() + 1500;
    G.Audio.shout(null!);
    G.HUD.toast('', G.U.pick(Math.random, ['POLICE! SHOW ME YOUR HANDS!', 'POLICE! DROP THE WEAPON!', 'GET ON THE GROUND! NOW!', 'POLICE! HANDS WHERE I CAN SEE THEM!']), 1.4);
    G.Net.toHost({ t: 'shout' });
  },
  // H: there's no medkit to slap on; your body and your medical gear are in the Tab screen
  useMed() { if (!this.dead && !this.out) G.Game.toggleInv(true); },
  // A teammate has started putting something on you (or stopped, or finished): who, what, which part, how long. The
  // HUD says so while it lasts, with the part lit on your body.
  beingTreated(by: number, name: string, part: string, mt: string, dur: number, off: boolean) {
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
  takeMed(mt: string) {
    for (const g of G.Gear.body(this)) for (const p of g.items) if (p.it.k === 'med' && p.it.mt === mt) {
      if ((p.it.n || 1) > 1) p.it.n--; else G.Gear.removeFrom(g, p.it);
      return true;
    }
    return false;
  },
  treatingParts() { return this.treating && this.treating.size ? [...this.treating.values()].map((q) => q.part) : null; },
  // a teammate treated you (they used their item; it lands here)
  // theirs: it's your own item they used (it comes off you here); nothing of it left, or no longer needed: it isn't used
  treated(part: string, mt: string, by: string, byId: number, theirs: boolean) {
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
  startAction(label: string, dur: number, onDone: (() => void) | null | undefined, kind: PActionKind | null = null, events: PActionEvent[] = []) { if (this.held && !this.held.cock) this.held = null; this.action = { label, dur, t: 0, onDone, kind, events }; },
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
  aimedPerson(ok: (ev: VwEnemy) => boolean, reach = 2.2) {
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
  // your eye against its box on the wall (js/level.ts cabViews: 0.44 x 0.52 m, 0.15 deep, its middle 1.32 m up, a couple
  // of centimetres' grace round it), or -1.
  aimedCabinet(map: LvMap, reach = 1.7) {
    const { o, d } = this.aimRay(), HW = 0.24, HH = 0.28, HD = 0.11, Y = 1.32;
    let best = -1, bt = reach;
    map.cabinets.forEach((c: any, i: number) => {
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
  offAim(x: number, y: number, z: number) { const { o, d } = this.aimRay(), to = new THREE.Vector3(x - o.x, y - o.y, z - o.z).normalize(); return Math.acos(G.U.clamp(to.dot(d), -1, 1)); },
  // the dropped weapon under the crosshair, within reach
  aimedEvidence(reach = 2.2) {
    const { o, d } = this.aimRay();
    let best = null, bd = reach;
    for (const [i, v] of G.Views.evidence) {
      if (v.secured || !v.mesh.visible) continue;
      const t = G.Loot.rayHit(o, d, v.mesh, v.box || (v.box = G.Loot.boxOf(v.mesh)), bd);
      if (t < bd) { bd = t; best = i; }
    }
    return best;
  },
  // the closed door under the crosshair, and how high on it you're looking
  aimedDoor(map: LvMap) {
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
  interact(dt: number) {
    let prompt = '', prog = -1, label = '', busy = false, halo = null; // (halo: the thing lying about that F would take)
    const map = G.Game.map!, held = this.keys.KeyF && !G.Game.chatOpen;
    if (!held) this.fLatch = false;
    const F = held && !this.fLatch;
    // the squad's ship and a mission's things (js/space.ts): her seats, the helm, the missions terminal, the artifact...
    { const so = G.Space.interact(this, dt, !!held, !!F); if (so) { G.HUD.setPrompt(so.prompt); G.HUD.setProgress(so.prog, so.label); return; } }
    // the hangar: look at what's for sale or what to use (js/hangar.ts)
    if (G.Game.hub) {
      const o = G.Hangar.interact(this, dt, held, F);
      G.HUD.setPrompt(o.prompt); G.HUD.setProgress(o.prog, o.label);
      return;
    }
    // in the helicopter that's brought you in (js/landing.ts)
    if (this.seat != null) {
      const o = G.Landing.interact(this, dt, held);
      G.HUD.setPrompt(o.prompt); G.HUD.setProgress(o.prog, o.label);
      return;
    }
    // on a zipline, hands on the bar till the far side; at the foot of one, hold F to clip on (zipStep)
    if (this.zipRide || this.climb) { G.HUD.setPrompt(''); G.HUD.setProgress(-1, ''); return; }
    // at a viewer (or by one): F to look, F to step back
    if (this.viewer) { G.HUD.setPrompt(''); G.HUD.setProgress(-1, ''); if (F) { this.fLatch = true; this.viewerOff(); } return; }
    const vw = !this.action && !this.down && !this.dead && !this.reloading && this.viewerNear(map);
    if (vw) {
      G.HUD.setPrompt('Press <b>F</b> to look through the viewer'); G.HUD.setProgress(-1, '');
      if (F) { this.fLatch = true; this.viewerOn(vw); }
      return;
    }
    const zl = !this.action && !this.down && !this.dead && this.zipNear(map);
    if (zl) {
      this.zipHold = F ? (this.zipHold || 0) + dt : 0;
      G.HUD.setPrompt('Hold <b>F</b> to ride the zipline across the gorge');
      G.HUD.setProgress(this.zipHold > 0 ? this.zipHold / this.ZIP.HOLD : -1, this.zipHold > 0 ? 'Clipping on' : '');
      if (this.zipHold >= this.ZIP.HOLD) { this.zipHold = 0; this.fLatch = true; this.zipRide = { l: zl, ph: 'up', t: 0, s: 0, from: this.pos.clone(), was: !!this.stowed, sw: { th: 0, w: 0, v: 0, a: 0 } }; G.Audio.click(); }
      return;
    }
    // at the foot of a roof's ladder, or at its head on the roof: hold F to climb (climbStep)
    const ld = !this.action && !this.down && !this.dead && this.ladderNear(map);
    if (ld) {
      this.ladderHold = F ? (this.ladderHold || 0) + dt : 0;
      G.HUD.setPrompt(ld.up ? 'Hold <b>F</b> to climb the ladder to the roof' : 'Hold <b>F</b> to climb down the ladder');
      G.HUD.setProgress(this.ladderHold > 0 ? this.ladderHold / this.LADDER.HOLD : -1, this.ladderHold > 0 ? 'Climbing on' : '');
      if (this.ladderHold >= this.LADDER.HOLD) { this.ladderHold = 0; this.fLatch = true; this.climb = { l: ld.l, up: ld.up, ph: 'on', t: 0, from: this.pos.clone(), was: !!this.stowed } as PClimb; G.Audio.click(); }
      return;
    }

    if (this.action) {
      // a timed action in progress: weapon away until it's done
      const a = this.action;
      const committed = !a.onDone && a.events.length && a.events.every((ev: any) => ev.done);
      const tgt = a.kind === 'zip' ? G.Views.enemies.get(a.target!) : null;
      const evd = a.kind === 'bag' ? G.Views.evidence.get(a.target!) : null;
      const lost = (a.kind === 'zip' && (!tgt || (a.living && !tgt.alive) || Math.hypot(tgt.pos.x - this.pos.x, tgt.pos.z - this.pos.z) > 2.8)) ||
        (a.kind === 'bag' && (!evd || evd.secured));
      const kept = a.free || (a.key ? this.keys[a.key] && !G.Game.chatOpen : held); // most are F; a backpack swap is B; one from a menu just runs
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
        this.pos.x = a.start!.x + (a.spot.x - a.start!.x) * k; this.pos.z = a.start!.z + (a.spot.z - a.start!.z) * k;
        G.Level.resolve(map, this.pos, 0.35, this.pos.y);
      }
      if (this.action && !a.approach && !a.pull) {
        const was = a.t / a.dur;
        a.t += dt; busy = a.kind !== 'order'; prog = a.t / a.dur; label = a.label;
        if (!a.civBody) G.Audio.foley(a.kind!, was, prog, 0, a.living);
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
      let cuffTgt = tgt ? null : this.aimedPerson((ev: VwEnemy) => (ev.alive ? ev.scode === 1 || ev.down || ev.fc === 1 || (ev.def.civ && ev.scode === 3) : !ev.bodySecured && ev.deadT > 1));
      const evAim = tgt ? null : this.aimedEvidence();
      if (cuffTgt && evAim !== null) {
        const v = G.Views.evidence.get(evAim)!, c = new THREE.Vector3();
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
          (this.action as PAction | null)!.target = id;
          G.Audio.order(null!);
        } else if (F && behind) {
          const id = ev.id;
          const wr = G.Views.zipPoint(ev, 0, !lying); // a body (or someone down): kneel by its shoulder, where the ragdoll lies (not where they dropped)
          const at = lying ? [Math.round(wr.x * 100) / 100, Math.round(wr.z * 100) / 100] : undefined; // (and tell the host where that is)
          this.startAction(ev.alive ? 'Zip-tying' : ev.def.civ ? 'Reporting' : 'Zip-tying', !lying ? 2.2 : ev.def.civ && !ev.alive ? 1.6 : 2.6, () => G.Net.toHost({ t: 'cuff', e: id, at }), 'zip');
          Object.assign(this.action!, { target: id, living: !lying, civBody: !ev.alive && !!ev.def.civ, // a casualty is reported, not tied
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
        const w = G.WEAPONS[G.Views.evidence.get(evTgt)!.wpn];
        prompt = 'Hold <b>F</b> to bag evidence' + (w ? ' (' + G.U.esc(w.name) + ')' : '');
        halo = G.Views.evidence.get(evTgt)!.mesh;
        if (F) {
          const i = evTgt, ev = G.Views.evidence.get(i)!;
          this.startAction('Bagging evidence', 2.3, () => G.Net.toHost({ t: 'secure', i }), 'bag');
          // kneel down just short of it, on the side you came from
          Object.assign(this.action!, { target: i, approach: this.standOff(ev.x, ev.z, 0.75), face: { x: ev.x, z: ev.z } });
          busy = true;
        }
      }

      // something lying about, under your crosshair (dropped from someone's inventory, or in the weapon case): before
      // the door behind it. Or a magazine you dropped
      const free = !tgt && !cuffTgt && evTgt === null, ray = (free && this.aimRay()) as { o: THREE.Vector3; d: THREE.Vector3 };
      const lt = free ? G.Loot.aimed(ray.o, ray.d) : null, dm = free && !lt ? G.Casings.aimedMag(ray.o, ray.d) : null;

      // doors: look at the door above its middle to open it quietly, lower to kick it (the line is at 1.3 m
      // of a 2.3 m door: a little above the middle, about where a boot lands on a kick); open doors close
      if (free && !lt && !dm) {
        const aimed = this.aimedDoor(map);
        if (aimed) {
          const vault = G.Level.sturdy(aimed.d), kick = aimed.y < KICK_H && !vault, id = aimed.d.id;
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

      if (lt) {
        halo = lt.mesh;
        const gun = lt.item.k === 'gun' && lt.item.w && G.WEAPONS[lt.item.w.id], mine = gun && this.weapons[gun.slot], n = G.Loot.name(lt.item);
        prompt = !mine ? `Hold <b>F</b> to pick up the ${n}` : this.packRoom(G.Gear.gunItem(mine)) ? `Hold <b>F</b> to take the ${n} <small>(your ${mine.def.name} goes in your backpack)</small>` : `Hold <b>F</b> to swap your ${mine.def.name} for the ${n}`;
        if (F) { const id = lt.id; this.startAction('Picking up', 0.5, () => G.Net.toHost({ t: 'take', id }), 'case'); busy = true; }
      }
      // (if there's somewhere on you for it)
      if (dm) {
        halo = dm.mesh;
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
      if (!tgt && !cuffTgt && !prompt && ab && abs && Math.hypot(ab.x - this.pos.x, ab.z - this.pos.z) < 1.4 && Math.abs(this.pos.y - (ab.fy || 0)) < 1.5) { // (it's on the ground floor: not from the floor above or a basement)
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
      if (!tgt && !cuffTgt && !prompt && sb && sbs && sbs[0] && Math.hypot(sb.x - this.pos.x, sb.z - this.pos.z) < 1.5 && Math.abs(this.pos.y - (sb.fy || 0)) < 1.5) {
        const fx = -Math.sin(this.yaw), fz = -Math.cos(this.yaw), dx = sb.x - this.pos.x, dz = sb.z - this.pos.z, dl = Math.hypot(dx, dz) || 1;
        if ((fx * dx + fz * dz) / dl > 0.6) {
          if (sbs[1]) prompt = 'The sticker box is empty';
          else {
            prompt = 'Hold <b>F</b> to open the sticker box';
            if (F) { this.startAction('Opening the sticker box', 0.6, () => G.Net.toHost({ t: 'openSbox' }), 'case'); busy = true; }
          }
        }
      }
      // the level's weapon case: open it, and what's inside is there to be picked up (js/server.ts casePut)
      const mc = map.case;
      if (!tgt && !cuffTgt && !prompt && mc && !G.Game.caseOpen && Math.hypot(mc.x - this.pos.x, mc.z - this.pos.z) < 1.6 && Math.abs(this.pos.y - (mc.fy || 0)) < 1.5) { // (fy: the ground it's on, where that rolls)
        prompt = 'Hold <b>F</b> to open the weapon case';
        if (F) { this.startAction('Opening the case', 1.0, () => G.Net.toHost({ t: 'openCase' }), 'case'); busy = true; }
      }
    }

    // hands busy: the weapon goes away; when they're free again it takes a moment to draw
    if (busy && !this.stowed) { this.stowed = true; this.reloading = false; this.burstQ = 0; this.lowToggle = false; }
    else if (!busy && this.stowed) { this.stowed = false; this.raiseT = this.raiseMax = this.drawTime(); }
    G.HUD.setPrompt(this.action ? '' : prompt);
    G.HUD.setProgress(prog, label);
    G.Views.setHalo(this.action ? null : halo);
  },

  // ------------------------------------------------------------- damage
  // Rounds that hit you, as the enemy's are rolled by the host: [zone, central] per round (or pellet). The
  // same wounds as you deal: an unarmoured head (or a face below the helmet's brim) is a kill; elsewhere your
  // armour stops its share and wears.
  // A round's wounds on you, whole, as whoever fired it worked them out (js/ballistics.ts outcome: a teammate's or a suspect's
  // through the host, your own off a ricochet here): the wounds on your body, the wear on what you're wearing. from:
  // where it came from; friendly: it wasn't a suspect's (you aren't told whose).
  applyWounds(o: any, from: any, friendly?: boolean) {
    if (o.fc) G.HUD.maskHit(o.fc); // (what your face shield caught, on your view of it)
    if (o.ws && o.ws.length && G.R.particles) G.R.particles(new THREE.Vector3(this.pos.x, 1.2, this.pos.z), 4 + 2 * o.ws.length, 0x8a0a0a, 1.5, 1.2, 9, 0.6, null, true); // some of it lands at your feet
    if (this.down || this.dead || G.Game.phase !== 'level' || !from) return;
    const B = G.Ballistics, armour = B.kitArmour(this);
    let f = 0, killed: false | string = false, fate = null;
    for (const [part, dmg, effects, organs, seg] of o.ws || []) {
      if (effects.includes('dead')) killed = seg === 'jaw' ? 'Shot in the face' : seg === 'neck' ? 'Shot through the neck' : 'Shot in the head';
      f += dmg;
      fate = this.worse(fate, G.Med.wound(this.body, part, dmg, effects, organs));
    }
    for (const a of armour) if (o.wear && o.wear[a.key]) a.wear = o.wear[a.key];
    B.wearOut(armour);
    if (o.rang) G.Audio.armorHit();
    if (Array.isArray(o.hd)) this.headHit(o.hd);
    if (killed) { this.killed(from, friendly ? 'Friendly fire' : killed); return; }
    if (fate === 'dead') { this.killed(from, friendly ? 'Friendly fire' : this.body.parts.head.hp <= 0 ? 'A head wound' : 'Bled out where they fell'); return; }
    if (o.stopped && !friendly) G.Net.toHost({ t: 'saved', n: o.stopped }); // (your armour stopped them: js/highlights.ts saved)
    this.hurt(f, from, fate);
  },
  // a round to the head you weren't wearing a helmet for: no bleeding out, no revive
  killed(from: any, how?: any) {
    G.HUD.damage(from, 100);
    G.Audio.hurt();
    this.stats.downs++;
    if (!this.dead) G.Career.ev('down'); // (a down, as the scoreboard counts it; and a death, in die)
    this.die(how || 'Killed outright');
  },
  // Blasts and other plain damage. Body armour takes some of the fragments.
  takeDamage(d: number, from: any) {
    if (this.down || this.dead || G.Game.phase !== 'level' || !(d > 0)) return;
    // what's on your torso against a fragment (a ragged 0.3 g steel chip at ~900 m/s, js/ballistics.ts): stopped, the
    // torso's share of them stays in the armour
    const B = G.Ballistics, frag = { m: 0.0003, d: 0.004, len: 0.004, core: 'mild', nose: 'ball' };
    let st = 0;
    const ka = B.kitArmour(this);
    for (const a of ka) for (const pr of a.def.prot) if (pr.at === 'torso' || pr.at === 'plate') { const r = B.stack(Object.assign({}, frag), 900, pr.layers, a.cond, 1); if (!r.through) { st = Math.max(st, pr.at === 'torso' ? 0.85 : 0.5); a.wear = (a.wear || 0) + r.absorbed * 4; } }
    if (st > 0) { B.wearOut(ka); G.Audio.armorHit(); }
    // fragments: spread over the body, the legs and lower body most
    const total = d * (1 - st * 0.4);
    let fate = null;
    for (const [part, share] of [['legL', 0.25], ['legR', 0.25], ['stomach', 0.2], ['thorax', 0.15], ['armL', 0.075], ['armR', 0.075]] as [string, number][]) {
      fate = this.worse(fate, G.Med.hit(this.body, part, total * share, false, 1, false));
    }
    if (fate === 'dead') { this.killed(from, 'Killed by the blast'); return; }
    this.hurt(total, from, fate);
  },
  // Prone (Z): down onto your front, or back up (to a crouch). It takes a moment either way (no shooting meanwhile);
  // lying there you crawl, can't lean, and hold the gun as still as it gets.
  setProne(on: boolean) {
    if (on === !!this.prone || this.down || this.dead || this.seat != null || this.action) return;
    this.prone = on; this.crouch = !on; this.stanceT = this.PRONE_T;
    this.lowToggle = false; this.burstQ = 0;
    G.Audio.foley && G.Audio.foley('prone', 0, 1, 0);
  },
  // the worse of two fates from G.Med.hit (null, 'down', 'out', 'dead')
  worse(a: PFate | null, b: PFate | null) { const R: (PFate | null)[] = [null, 'down', 'out', 'dead']; return R.indexOf(b) > R.indexOf(a) ? b : a; },
  // the effect of being hit (the injuries are already on the body): flinch, the HUD, going down (fate: 'down', or
  // 'out' for blacking out)
  hurt(d: number, from: any, fate?: PFate | null) {
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
    G.Career.ev('down'); // (your career: js/career.ts)
    this.reloading = false;
    this.action = null; // (whatever your hands were doing, zip-tying, bagging, at a door: let go, so the squad doesn't see you still reaching)
    if (this.slot !== 's' && this.weapons.s) { this.slot = 's'; G.R.setViewmodel(this.cur().def); }
    G.Audio.down();
    G.Net.toHost({ t: 'chat', m: '[is down and needs a revive!]' });
    if (G.Game.invOpen) G.Game.toggleInv(false);
  },
  revived(hp: number) {
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
  GIVE_UP: 2,
  giveUp: 0,
  die(how?: any) {
    G.Views.spawnSelfBody(); // (before anything else changes: as you were, then down)
    if (!this.dead) G.Career.ev('death'); // (your career: js/career.ts)
    this.down = false; this.out = false;
    this.dead = true;
    this.hp = 0;
    this.action = null; // (killed outright mid-action: let go of it, as going down does)
    this.deathCause = how || 'Bled out';
    G.R.setViewmodel(null);
    G.HUD.toast('KIA', this.deathCause, 3);
  },
  spectate(dt: number) {
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
    // distortion (js/render.ts); a little narrower for the crop.
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
  updateCamera(dt: number) {
    this._dtCam = dt;
    const cam = G.R.camera;
    // at a viewer: your eyes at its eyepieces, the view narrowed to its power, the gun out of sight
    this.viewerMask(!!this.viewer);
    if (G.R.vmRoot) G.R.vmRoot.visible = !this.viewer && !this.climb; // (on a ladder your hands are on it, holdArms; on a zipline only the left is, up out of view)
    if (this.viewer) {
      const v = this.viewer.v, V = this.VIEWER;
      this.yaw = v.yaw + G.U.clamp(G.U.angDiff(v.yaw, this.yaw), -V.YAW, V.YAW); this.pitch = G.U.clamp(this.pitch, -V.DOWN, V.UP);
      cam.position.set(v.x - Math.sin(v.yaw) * V.AHEAD, (this.pos.y || 0) + V.EYE, v.z - Math.cos(v.yaw) * V.AHEAD);
      cam.rotation.set(this.pitch, this.yaw, 0);
      const fov = G.Game.settings.fov / V.MAG;
      if (Math.abs(cam.fov - fov) > 0.01) { cam.fov = fov; cam.updateProjectionMatrix(); }
      G.R.pipLive = 0;
      return;
    }
    // lean: Q left, E right. Never lean the head into a wall.
    const want = this.down || this.dead || this.lowReady || this.prone || this.zipRide || G.Game.chatOpen || !G.Game.locked ? 0 : (this.keys.KeyE ? 1 : 0) - (this.keys.KeyQ ? 1 : 0);
    const sideX = Math.cos(this.yaw), sideZ = -Math.sin(this.yaw), eye = this.pos.y + this.eyeH;
    let room = 1;
    if (want) {
      const t = G.Level.raycast(G.Game.map!, this.pos.x, eye, this.pos.z, sideX * want, 0, sideZ * want, this.LEAN + 0.4).t;
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
    const R = this.RECOIL, punch = this.rc.p * R.PUNCH + this.hk.p, punchY = this.rc.y * R.PUNCH_Y + this.hk.y;
    cam.rotation.x += punch;
    cam.rotation.y += punchY;
    cam.rotation.z += this.hk.r - this.rc.y * R.ROLL;
    // magnified optics are picture-in-picture: the view itself only tightens a little, like any other sight
    const sg = this.sight(this.cur());
    const fov = G.Game.settings.fov * G.U.lerp(1, sg.scoped ? 0.8 : sg.zoom, this.adsT);
    if (Math.abs(cam.fov - fov) > 0.05) { cam.fov = fov; cam.updateProjectionMatrix(); }
    this.holdArms(cam);

    const vm = G.R.vm;
    if (!vm) return;
    const u = vm.userData, a = this.adsT;
    G.R.pipLive = sg.scoped ? a : 0; // how far the scope picture is faded in (js/render.ts)
    if (u.pip) { u.pip.mag = sg.mag; if (u.pip.sync) u.pip.sync(this.cur(), () => this.scopeRange()); } // (at the power it's set to; a range-finding reticle's marks follow the round and the zero)
    const bobAmt = (1 - a * 0.85) * Math.min((this.hspeed || 0) / this.SPEED.walk, 1.5);
    let x = G.U.lerp(u.hip.x, u.ads.x, a) + Math.sin(this.bobT) * 0.012 * bobAmt;
    let y = G.U.lerp(u.hip.y, u.ads.y, a) - Math.abs(Math.cos(this.bobT)) * 0.012 * bobAmt;
    // the gun turns so its bore points at the real aim point (relative to the punched view) and shoves back
    const off = this.aimOffset();
    this.aimScreen = { y: off.y - punchY, p: off.p - punch }; // for the crosshair
    // (the shove back into your shoulder, recoilStep; from the hip the muzzle climbing tips it back a little more)
    let z = G.U.lerp(u.hip.z, u.ads.z, a) + this.shove + Math.max(0, this.rc.p) * 0.35 * (1 - a);
    let rx = off.p - punch, ry = off.y - punchY, rz = -this.rc.y * 0.3;
    if (this.lowReady) { ry = 0.35 + this.armLag().y; rx -= 0.6; x -= 0.04; y -= 0.07; } // muzzle down (still trailing the head)
    this.stowW = (this.stowW || 0) + ((this.stowed || this.held ? 1 : 0) - (this.stowW || 0)) * Math.min(1, dt * 9); // (a grenade in hand: the weapon down too)
    y -= this.stowW * 0.55; rx -= this.stowW * 1.1; // weapon put away while the hands are busy
    if (this.raiseT > 0) { const k = this.raiseT / (this.raiseMax || 0.3); rx -= k * 1.0; y -= k * 0.3; }
    // reloads, racking and inspecting (js/vmanim.ts)
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
    // on a zipline: the gun held out in the right hand alone, lower and canted a little, and swinging with you under the trolley
    this.zipVm = (this.zipVm || 0) + ((this.zipRide ? 1 : 0) - (this.zipVm || 0)) * Math.min(1, dt * 8);
    if (this.zipVm > 0.001) {
      const zv = this.zipVm * (1 - a * 0.6), th = this.zipRide ? this.zipRide.sw.th : 0;
      y -= 0.045 * zv; x += 0.03 * zv + th * 0.1 * zv; rz -= (0.16 + th * 0.5) * zv; rx -= (0.05 + th * 0.3) * zv;
      cam.rotation.z += th * 0.08 * this.zipVm; // (and your view rolls with it, a little)
    }
    { // (the trailing arms swing about the eye, so the whole gun comes round, not just its nose)
      const lag = this.armLag();
      if (lag.y || lag.p) { const v = new THREE.Vector3(x, y, z).applyEuler(new THREE.Euler(lag.p, lag.y, 0, 'YXZ')); x = v.x; y = v.y; z = v.z; }
    }
    const lp = Math.min(1, dt * 18);
    vm.position.x += (x - vm.position.x) * lp;
    vm.position.y += (y - vm.position.y) * lp;
    vm.position.z += (z - vm.position.z) * lp;
    vm.rotation.x += (rx - vm.rotation.x) * lp;
    vm.rotation.y += (ry - vm.rotation.y) * lp * 0.6;
    vm.rotation.z += (rz - vm.rotation.z) * lp * 0.6;
    u.flashes.forEach((fl: any, i: number) => {
      fl.visible = this.flashT > 0 && (this.flashBarrels ? this.flashBarrels.includes(i) : u.flashes.length < 2 || i === this.flashIdx); // (a gun of several barrels: a flash from each that fired)
      if (fl.visible) { fl.rotation.z = Math.random() * 6; fl.scale.setScalar(0.8 + Math.random() * 0.6); }
    });
    // moving parts: slides cycle (and lock back on empty), pumps and bolts work between shots,
    // revolver cylinders index, minigun barrels spin
    const an = u.anim, w = this.cur();
    const cyc = !w.def.manual && this.cycleMax > 0.2 && this.fireCd > 0 ? Math.sin(Math.PI * Math.min(1, (1 - this.fireCd / this.cycleMax) * 1.25)) : 0;
    if (an.slide) an.slide.position.z = Math.min(0.035, this.kick * 0.04 + (!G.loaded(w) ? 0.035 : 0)); // (locked back: nothing left, chamber included)
    if (u.info.modeDial) { // (the fire-mode dial: the model's own part, or the marker the viewmodel puts on it, turned to the selected mode)
      const md = u.info.modeDial, node = an.dial || u.dial, i = Math.max(0, md.modes.indexOf(this.fireMode(w)));
      if (node) { const ax = an.dial ? new THREE.Vector3(md.axis[2], md.axis[1], -md.axis[0]).normalize() : node.userData.axis; node.quaternion.setFromAxisAngle(ax, (i * md.stepDeg * Math.PI) / 180); }
    }
    if (an.pump && !u.info.hinge) an.pump.position.z = cyc * 0.085; // (a gun with a reload sequence moves it only there)
    if (u.displays && u.displays.ammo && w.def.barrels) G.Viewmodel.paintAmmo(u.displays.ammo, G.barrelsOf(w)!, G.perOf(w)); // (the rounds left in each barrel)
    if (u.displays && (u.displays.range || u.displays.range_l)) { // (a rail ballistic computer's readout on its back: the laser's range, five times a second, repainted when it changes)
      const now = performance.now();
      if (now - (u.rangeAt || 0) >= 200) {
        u.rangeAt = now;
        const text = G.Viewmodel.rangeText(this.aimRange());
        for (const k of ['range', 'range_l']) if (u.displays[k]) G.Viewmodel.paintRange(u.displays[k], text);
      }
    }
    if (an.cyl) an.cyl.rotation.z += (this.cylShots * (Math.PI * 2) / u.info.chamberAt.n - an.cyl.rotation.z) * Math.min(1, dt * 18);
    if (an.spin) an.spin.rotation.z += dt * this.spin * 55;
    if (an.magn) an.magn.rotation.z += ((sg.scoped ? 0 : u.info.magnOut != null ? u.info.magnOut : -2.8) - an.magn.rotation.z) * Math.min(1, dt * 14); // a magnifier flips in or out (to the angle its model gives: info.magnOut, an authored one's)
    G.VMAnim.apply(this, vm, cyc); // hands and the parts they work
    this.animateLimbs(cam);
  },

  // First-person hand and boot for door actions, drawn in the viewmodel pass (camera space: forward -z).
  // Built once from the same parts as the viewmodel arms.
  fpLimbs() {
    if (this._limbs) return this._limbs;
    const T = THREE, M = G.GunMaterials.M;
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
    // a grenade in the hand (keys 3, 4, 5): a frag, a flashbang's can, or a thermobaric's fatter olive can
    const nade = { frag: new T.Mesh(new T.SphereGeometry(0.038, 12, 8), new T.MeshStandardMaterial({ color: 0x3a4a2a, roughness: 0.7 })), flash: new T.Mesh(new T.CylinderGeometry(0.026, 0.026, 0.1, 12), new T.MeshStandardMaterial({ color: 0x7d8388, roughness: 0.5, metalness: 0.4 })), tb: G.Views.tbMesh(0.032, 0.115, true) };
    for (const m of Object.values(nade)) { m.position.set(0, 0.035, -0.075); m.visible = false; arm.add(m); }
    arm.visible = leg.visible = armL.visible = tie.visible = held.visible = env.visible = false;
    G.R.vmRoot.add(arm, leg, armL, tie, held, env);
    return (this._limbs = { arm, leg, armL, tie, held, env, nade });
  },
  // Before laying someone face down: is there room in front of them? Their body will reach ~1.85 m from the
  // knees. If a wall or furniture is in the way, drag them back (toward you) far enough, and step back with them.
  planPull(a: any, ev: VwEnemy) {
    const L = G.Level, map = G.Game.map!, s = ev.def.scale || 1, need = 1.85 * s;
    const fx = -Math.sin(ev.yaw), fz = -Math.cos(ev.yaw);
    const solid = (x: number, z: number, r = 0.12) => {
      const tx = Math.floor(x / L.TS), tz = Math.floor(z / L.TS);
      for (let oz = -1; oz <= 1; oz++) for (let ox = -1; ox <= 1; ox++) if (L.boxesAt(map, tx + ox, tz + oz).some((b: any) => b.y0 < 0.5 && b.h > 0.15 && Math.abs(x - b.cx) < b.hx + r && Math.abs(z - b.cz) < b.hz + r)) return true;
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
  standOff(x: number, z: number, dist: number) {
    const dx = this.pos.x - x, dz = this.pos.z - z, d = Math.hypot(dx, dz) || 1;
    return d <= dist + 0.05 ? null : { x: x + (dx / d) * dist, z: z + (dz / d) * dist };
  },
  lookTarget(ac: any) {
    if (!ac || ac.approach || ac.kind === 'order') return null;
    const t = ac.t / ac.dur;
    if (ac.kind === 'zip') { const ev = G.Views.enemies.get(ac.target); return ev ? { p: G.Views.zipPoint(ev, t, ac.living), w: 1 } : null; }
    if (ac.kind === 'bag') { const v = G.Views.evidence.get(ac.target); return v ? { p: new THREE.Vector3(v.x, (v.y || 0) + 0.05, v.z), w: 1 - 0.7 * G.U.bagPhases(t).lift * (1 - G.U.bagPhases(t).down) } : null; }
    return null;
  },
  // a grenade in your hand: brought up, held, drawn back (high for an overhand throw, low for underhand),
  // thrown and followed through. Eased toward each pose so it moves like an arm. Returns whether it drew.
  animateHeld(L: any, dt: number) {
    const h = this.held;
    for (const [k, m] of Object.entries(L.nade)) m.visible = !!h && h.kind === k && h.throwT < 0;
    if (!h) { this._hp = null; return false; }
    const under = h.str === 0, P = (x: number, y: number, z: number, rx: number, rz = 0) => [x, y, z, rx, rz];
    let want, wantL = null;
    if (h.throwT >= 0) { const t = h.throwT / 0.5; want = t < 0.35 ? (under ? P(0.14, -0.22, -0.62, -0.2) : P(0.12, -0.08, -0.68, -0.5)) : P(0.22, -0.5, -0.38, -0.4); }
    else if (h.readyT > 0) want = P(0.3, -0.7, -0.3, -0.6);
    else if (h.cock) { want = under ? P(0.26, -0.48, -0.16, -0.9) : P(0.33, -0.02, -0.1, 0.5, -0.2); wantL = P(-0.2, -0.14, -0.55, -0.2); }
    else want = P(0.2, -0.24, -0.42, -0.25);
    if (!this._hp) this._hp = P(0.3, -0.7, -0.3, -0.6);
    const k = Math.min(1, (dt || 0.016) * (h.throwT >= 0 ? 22 : 12));
    this._hp = this._hp.map((v: number, i: number) => v + (want[i] - v) * k);
    const [x, y, z, rx, rz] = this._hp;
    L.arm.visible = true; L.arm.position.set(x, y, z); L.arm.rotation.set(rx, 0.1, rz);
    if (wantL) { this._hpL = (this._hpL || wantL).map((v: number, i: number) => v + (wantL[i] - v) * k); L.armL.visible = true; L.armL.position.set(...this._hpL.slice(0, 3)); L.armL.rotation.set(this._hpL[3], -0.1, 0); }
    else this._hpL = null;
    return true;
  },
  animateLimbs(cam: THREE.Camera) {
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
    const path = (keys: number[][]) => { // keys: [[t, x, y, z, rx, rz], ...] - eased between neighbours
      let k = 0;
      while (k < keys.length - 2 && t > keys[k + 1][0]) k++;
      const A = keys[k], B = keys[k + 1], u = S(A[0], B[0], t);
      return A.slice(1).map((v: number, n: number) => v + (B[n + 1] - v) * u);
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
    const hand = (arm: any, pos: THREE.Vector3, sd: number) => {
      arm.position.copy(pos);
      const dir = new THREE.Vector3(sd * 0.22, -0.38, 0.12).sub(pos).negate().normalize();
      arm.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, -1), dir);
    };
    const rest = (sd: number) => new THREE.Vector3(sd * 0.24, -0.55, -0.15);
    if (kind === 'zip') {
      // hands stay on the person: between the shoulder blades as they're shoved down, then at the wrists
      const ev = G.Views.enemies.get(a!.target!);
      if (ev) {
        cam.updateMatrixWorld();
        const u = t;
        const c = cam.worldToLocal(G.Views.zipPoint(ev, u, a!.living!));
        c.multiplyScalar(1 - 0.06 / Math.max(0.1, c.length())); // gloves sit on the surface, not inside it
        const reach = a!.pull ? 1 : S(0, 0.14, t), cinch = S(0.82, 0.9, u) * (1 - S(0.92, 1, u)); // hands on their back while dragging them
        const spread = u < 0.45 ? 0.12 : 0.055 + cinch * 0.05;
        for (const [arm, sd] of [[L.arm, 1], [L.armL, -1]] as [THREE.Group, number][]) hand(arm, rest(sd).lerp(c.clone().add(new THREE.Vector3(sd * spread, 0, 0)), reach), sd);
        if (u > (a!.living ? 0.5 : 0.62) && !a!.civBody) {
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
      const v = G.Views.evidence.get(a!.target!);
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
        if (!a!.qFloor) a!.qFloor = cam.quaternion.clone().invert().multiply(v!.mesh.quaternion);
        const qHold = new THREE.Quaternion().setFromEuler(new THREE.Euler(0.15, Math.PI / 2 + 0.5, 0.1));
        L.held.position.copy(floor).lerp(H, lift).lerp(E, insert);
        L.held.quaternion.copy(a!.qFloor!).slerp(qHold, lift);
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


  sendState(dt: number) {
    this.stateT -= dt;
    if (this.stateT > 0) return;
    this.stateT = 0.05;
    G.Net.toHost({ t: 'st', s: this.state() });
  },
  // what you're wearing, as others see it (js/rig.ts setKit)
  kitLook() {
    const k = this.kit || {}, g = (it: GItem | null) => (it ? it.gid : 0), n = (it: GItem | null) => (it && it.molle ? it.molle.items.length : 0);
    return { helmet: g(k.helmet), face: k.helmet && k.helmet.face ? k.helmet.face.gid : 0, nv: k.helmet && k.helmet.nvg ? k.helmet.nvg.gid : 0, nd: k.helmet && k.helmet.nvg && k.helmet.nvg.dn ? 1 : 0, carrier: g(k.carrier), plate: k.carrier && k.carrier.plate ? 1 : 0, sh: k.carrier && k.carrier.shoulder ? k.carrier.shoulder.gid : 0, gr: k.carrier && k.carrier.groin ? k.carrier.groin.gid : 0, cp: n(k.carrier), belt: g(k.belt), lg: k.belt && k.belt.legs ? k.belt.legs.gid : 0, bp: n(k.belt), pack: g(k.pack), ifak: k.ifak ? 1 : 0 };
  },
  menuLook(): boolean { const pz = document.getElementById('pause'); return G.Game.phase === 'level' && !this.dead && !this.down && (G.Game.menuOpen() || !!(pz && !pz.classList.contains('hidden'))); }, // (a screen is up: others see the ATAK)
  state() {
    const r2 = (v: number) => Math.round(v * 100) / 100;
    return {
      p: [r2(this.pos.x), r2(this.pos.y), r2(this.pos.z)], yw: r2(this.yaw), pt: r2(this.pitch),
      hp: Math.ceil(this.hp), mhp: this.maxHp(), ar: Math.round(this.vestCond() * 100), amx: G.Gear.piece(this, 'chest') ? 100 : 0,
      pr: this.prone ? 1 : 0, bp: this.bipodT > 0.5 ? 1 : 0, cl: this.climb ? 1 : 0, zp: this.zipRide ? 1 : 0, se: this.seat != null || G.Space.sealed() ? 1 : 0, dn: this.down ? 1 : 0, uc: this.out ? 1 : 0, dd: this.dead ? 1 : 0, bl: this.down ? (this.bleed == null ? -1 : Math.ceil(this.bleed)) : 0, bd: this.body ? G.Med.encode(this.body) : null,
      w: this.cur().def.code, ac: G.Ballistics.armourState(this), sk: G.Stickers.share(this.cur().stickers) || undefined, tl: this.tacFlags(this.cur()), cr: this.crouch || this.down || this.prone ? 1 : 0, ln: r2(this.lean || 0), lr: this.lowReady ? 1 : 0, ad: this.zipRide && (this.ads || this.sinceShot < 0.9) ? 1 : 0, sd: this.steadying ? 1 : 0, sw: this.stowed || this.held || this.menuLook() ? 1 : 0, mn: this.menuLook() ? 1 : 0,
      hk: this.held ? (this.held.kind === 'flash' ? 2 : this.held.kind === 'tb' ? 3 : 1) : 0, hc: this.held && this.held.cock ? 1 : 0, hs: this.held ? this.held.str : 0,
      ra: this.act && this.cur().def.manual ? r2(Math.min(1, this.act.t)) : -1, ld: G.loaded(this.cur()) > 0 ? 1 : 0, nm: this.cur().noMag ? 1 : 0, rl: this.reloading && this.reloadTotal ? r2(G.U.clamp(1 - this.reloadT / this.reloadTotal, 0, 1)) : -1, in: this.inspectT > 0 && this.inspectDur ? r2(1 - this.inspectT / this.inspectDur) : this.rChk ? r2(0.58 + (G.VMAnim.INSPECT_HOLD - 0.58) * this.rChk.k) : -1,
      mc: this.magChk ? r2(this.magChk.back > 0 ? Math.max(0, 1 - this.magChk.back) : this.magChk.k) : -1,
      act: this.action && this.action.kind ? this.action.kind[0] : 0, ap: this.action ? r2(Math.min(1, this.action.t / this.action.dur)) : 0, zt: this.action && this.action.kind === 'zip' ? this.action.target : -1, bt: this.action && this.action.kind === 'bag' ? this.action.target : -1, pl: this.action && this.action.pull ? 1 : 0, mv: r2(this.hspeed || 0),
      cred: Math.round(this.credits), sx: [this.stats.kills, Math.round(this.stats.dmg), this.stats.hs, this.stats.downs, this.stats.revives],
      kt: this.kitLook(), md: this.medCounts(), ir: this.irOn && this.nvK > 0.9 ? 1 : 0, // (its IR illuminator lit: others' goggles see it)
    };
  },
};
G.Me = G_Me;

interface GameModules { Me: typeof G_Me; }
