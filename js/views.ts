'use strict';
const WP = new THREE.Vector3(), WD = new THREE.Vector3(); // (a wound's place and direction: woundStreams)
// Client-side representations of networked things: remote players, enemies, grenades.
// Characters are G.Rig skeletons; their hitboxes ride the animated bones (see js/rig.ts).
// A remote officer, as drawn here: their rig, and the latest state the host sent (st: short keys, see js/server.ts snap)
interface VwPlayer { id: string; name: string; color: number; animal: string; look: any; rig: Rig; tag: THREE.Object3D | null; st: any; pos: THREE.Vector3; yaw: number; pitch: number; first: boolean; dead?: boolean; deadAt?: number | null; lastAct?: string; lastAp?: number; [k: string]: any }
// A suspect or civilian: the rig, where the host says it is (tgt) and where it's drawn (pos, eased towards it). The rest
// (flags from the snapshot, timers for the reload, the prone shift...) are set as they happen.
interface VwEnemy {
  id: number; type: string; def: any; rig: Rig; feet?: FsFeet; tac: number; pos: THREE.Vector3; tgt: THREE.Vector3; yaw: number; tgtYaw: number; hp: number; alive: boolean; deadT: number; lean: number;
  // set as it goes: from the snapshots (bleed, limp, reloading, down: its flags), by the kill and the cuffing, and by the frame's own bookkeeping
  scode?: number; radio?: boolean; str?: number; bleed?: boolean; limp?: boolean; reloading?: boolean; down?: boolean; surp?: boolean; doorOn?: boolean; doorT?: number; arrested?: boolean; bodySecured?: boolean;
  pooled?: boolean; wnd?: number[] | null; wacc?: number[]; ph?: number; wpool?: boolean; leanS?: number; dripT?: number; proneKey?: string; proneShift?: THREE.Vector3 | null; recPitch?: number; recTk?: number;
  [k: string]: any;
}
interface VwEvidence { mesh: THREE.Object3D; wpn: string; x: number; y: number; z: number; secured?: boolean; [k: string]: any }
// a grenade in flight (the position and velocity are all nadeStep needs)
interface VwNadeMotion { pos: THREE.Vector3; vel: THREE.Vector3; onGround?: boolean }
interface VwNade extends VwNadeMotion { fuse: number; own: boolean; enemy: boolean; mesh: THREE.Mesh<THREE.BufferGeometry, THREE.MeshLambertMaterial>; kind: VwNadeKind }
// the animated bits of a level (js/level.ts builds them): a first aid cabinet, and the lids of the weapon case, attachments box and sticker box
interface VwCabView { key: string | null; open: number; slots: THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>[]; door: THREE.Object3D }
interface VwLid { synced: boolean; open: number; lid: THREE.Object3D; g: THREE.Object3D }
// a round in flight that someone else fired (visRound, stepRounds)
interface VwRound { f: THREE.Vector3; dir: THREE.Vector3; len: number; d: number; def: any; am: string; arrive: () => void; v: number; drag: number; tracer: boolean }
// the evidence outline's (or the halo's) materials: the stencil-marking silhouette, then the bands pushed out round it
interface VwOutline { silhouette: THREE.MeshBasicMaterial; bands: THREE.ShaderMaterial[]; res: { value: THREE.Vector2 } }
// what a suspect does with their body for a moment, and how a posed one is held (rig.update)
type VwPose = 'handsup' | 'cuffed' | 'cower' | 'takedown';
type VwActKind = 'open' | 'close' | 'kick' | 'zip' | 'bag';
// an officer's action as drawn: how far along it is (0..1), the hand that opens a door, where the hands are on someone being tied (zip), whether they pull
interface VwAct { kind: VwActKind; t: number; hand: 'L' | 'R'; pt?: THREE.Vector3; pull?: boolean }
// a grenade: 'frag' (a sphere), 'flash' (a grey can) or 'tb' (a thermobaric: a fatter olive can)
type VwNadeKind = 'frag' | 'flash' | 'tb';
interface VwAboxView extends VwLid { key: string | null; lights: THREE.Group }
interface VwSboxView extends VwLid { name: string | null; card: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial> }
const G_Views = {
  players: new Map<string, VwPlayer>(),
  enemies: new Map<number, VwEnemy>(),
  nades: [] as VwNade[],
  pings: [] as { x: number; z: number; t: number }[],
  evidence: new Map<number, VwEvidence>(), // id -> { mesh, wpn, x, z }
  laserBeep: 0,
  // made as it goes: the shaders compiled for the level (js/game.ts), the occlusion test's scratch vector and filter, your own body when you're dead,
  // the rounds in flight, the pings by player, the evidence outline's and the halo's materials (and their shared resolution, and smoothed geometry),
  // the evidence envelope's, the suspects' light housing, the drip timer
  warmed: undefined as boolean | undefined,
  _sp: undefined as THREE.Vector3 | undefined,
  _occ: undefined as ((s: { kind: string }) => boolean) | undefined,
  selfBody: undefined as { rig: Rig; pos: THREE.Vector3; yaw: number } | null | undefined,
  vRounds: undefined as VwRound[] | undefined,
  pings2: undefined as Map<string, { s: THREE.Sprite; t: number }> | undefined,
  _outline: undefined as VwOutline | undefined,
  _haloMats: undefined as VwOutline | undefined,
  _outRes: undefined as { value: THREE.Vector2 } | undefined,
  _smooth: undefined as WeakMap<THREE.BufferGeometry, THREE.BufferGeometry> | undefined,
  _haloOn: undefined as THREE.Object3D | null | undefined,
  _envMat: undefined as THREE.MeshLambertMaterial | undefined,
  _envGeo: undefined as THREE.BoxGeometry | undefined,
  tacGeo: undefined as THREE.BufferGeometry | undefined,
  tacMat: undefined as THREE.MeshLambertMaterial | undefined,
  _myDrip: undefined as number | undefined,

  removeRig(rig: Rig) { G.R.dynRoot.remove(rig.root); rig.dispose(); },
  // Could any of them be in view from the camera: a look at their middle, head, feet and both sides (where the body is
  // drawn: the hips, wherever a fall's taken them), stopped only by walls, floors and ceilings. A look that starts in
  // one (the camera pressed to a wall) starts again past it.
  inSight(rig: Rig, at: THREE.Vector3) {
    const map = G.Game.map, w = map && map.world, c = G.R.camera.position;
    if (!w) return true;
    const hp = rig.hips.getWorldPosition(this._sp || (this._sp = new THREE.Vector3())), y = at.y;
    if (Math.hypot(hp.x - c.x, hp.z - c.z) < 2.5) return true;
    const skip = this._occ || (this._occ = (s: { kind: string }) => s.kind !== 'wall' && s.kind !== 'floor' && s.kind !== 'ceil' && s.kind !== 'lintel');
    const sx = -(hp.z - c.z), sz = hp.x - c.x, sl = Math.hypot(sx, sz) || 1; // (across the view)
    for (const [a, h] of [[0, 0.9], [0, 1.6], [0, 0.15], [-0.45, 1.0], [0.45, 1.0], [-0.45, 1.5], [0.45, 1.5]]) {
      const tx = hp.x + (sx / sl) * a, ty = y + h, tz = hp.z + (sz / sl) * a;
      let dx = tx - c.x, dy = ty - c.y, dz = tz - c.z;
      const d = Math.hypot(dx, dy, dz); dx /= d; dy /= d; dz /= d;
      let r = G.World.raycast(w, c.x, c.y, c.z, dx, dy, dz, d, { skip });
      if (r.t < 0.3) r = G.World.raycast(w, c.x + dx * 0.3, c.y + dy * 0.3, c.z + dz * 0.3, dx, dy, dz, d - 0.3, { skip }), r.t += 0.3;
      if (r.t >= d - 0.05) return true;
    }
    return G.Damage.seenThrough(map as unknown as Parameters<typeof G.Damage.seenThrough>[0], c, hp); // (or down a hole shot through the wall)
  },
  // an officer's body: dressed as they picked, kit from their state (st.kt)
  newPlayerRig(info: { color: number; animal: string; name: string; look: any }, id: string) {
    const rig = G.Rig.create({ style: 'tactical', color: info.color, animal: info.animal, callName: info.name, seed: id.length * 977, bare: true, look: info.look });
    rig.root.visible = false;
    G.R.dynRoot.add(rig.root);
    return rig;
  },
  // Your own body when you die: you don't have one in first person, so one is made, dressed as you are, and falls where you
  // were (what a teammate sees on their screen; now you see it too, from the camera on theirs)
  spawnSelfBody() {
    this.clearSelfBody();
    const me = G.Me, g = G.Game, wasDown = !!me.down;
    const rig = this.newPlayerRig({ color: g.myColor, animal: g.myAnimal, name: g.myName, look: g.myLook }, G.Net.myId || 'me');
    rig.setKit(me.kitLook());
    rig.setGun(me.cur().def.code, me.cur().stickers);
    rig.root.visible = true;
    const pos = me.pos.clone(), p = { pos, yaw: me.yaw, pitch: me.pitch, crouch: wasDown || !!me.crouch, alert: false, lean: 0, state: wasDown ? 'down' : 'alive' };
    for (let i = 0; i < 6; i++) rig.update(0.016, p); // (in the pose you were in, then down)
    rig.die(null);
    this.selfBody = { rig, pos, yaw: me.yaw };
  },
  clearSelfBody() { if (this.selfBody) { this.removeRig(this.selfBody.rig); this.selfBody = null; } },
  // a dead officer's body is a ragdoll where they fell (they come back whole next level)
  resetPlayerRig(pv: VwPlayer) {
    this.removeRig(pv.rig);
    pv.rig = this.newPlayerRig(pv, pv.id);
    pv.dead = false; pv.first = true; pv.deadAt = null;
  },
  clearLevel() {
    this.vRounds = [];
    G.Casings.clear();
    G.Bolts.clear();
    if (this.pings2) { for (const q of this.pings2.values()) { G.R.dynRoot.remove(q.s); q.s.material.map!.dispose(); q.s.material.dispose(); } this.pings2.clear(); }
    for (const ev of this.enemies.values()) this.removeRig(ev.rig);
    this.enemies.clear();
    for (const n of this.nades) G.R.dynRoot.remove(n.mesh);
    this.nades = [];
    this.pings = [];
    for (const v of this.evidence.values()) G.R.dynRoot.remove(v.mesh);
    this.evidence.clear();
    for (const pv of this.players.values()) { if (pv.dead) this.resetPlayerRig(pv); pv.st = null; pv.rig.root.visible = false; }
    this.clearSelfBody();
  },
  clearAll() {
    this.clearLevel();
    for (const pv of this.players.values()) this.removeRig(pv.rig);
    this.players.clear();
  },

  syncRoster(roster: Record<string, any>) {
    for (const [id, info] of Object.entries(roster)) {
      if (id === G.Net.myId) continue;
      let pv: VwPlayer | null | undefined = this.players.get(id);
      if (pv && (pv.color !== info.color || pv.animal !== info.animal)) { this.removeRig(pv.rig); this.players.delete(id); pv = null; }
      if (!pv) {
        const rig = this.newPlayerRig(info, id); // (dressed as they picked, kit from st.kt)
        const tag = null; // (no nameplates over teammates' heads: you know them by their patches and kit)
        pv = { id, name: info.name, color: info.color, animal: info.animal, look: info.look, rig, tag, st: null, pos: new THREE.Vector3(), yaw: 0, pitch: 0, first: true };
        this.players.set(id, pv);
      }
      if (pv.name !== info.name) pv.rig.setCallsign(info.animal, info.name);
      pv.name = info.name;
    }
    for (const id of [...this.players.keys()]) if (!roster[id]) this.removePlayer(id);
  },
  removePlayer(id: string) {
    const pv = this.players.get(id);
    if (!pv) return;
    this.removeRig(pv.rig);
    this.players.delete(id);
  },

  applySnap(m: any) {
    if (!this.warmed) { this.warmed = true; G.Game.veilSay('Compiling shaders'); setTimeout(() => G.R.warmup(() => { G.Game.veilN = G.Game.VEIL_SMOOTH; G.Game.veilWait = 0; }), 60); } // (compile everything once the level's full, then a few frames drawn and the veil lifts: js/game.ts veil. The wait: time to draw that line first)
    const seen = new Set<number>();
    for (const [id, type, x, z, yaw, hp, aim, alert, crouch, lean, armed, scode, surp, door, kit, fl, str, y = 0, wd, fc = 0, rd = 0] of m.e) {
      seen.add(id);
      let ev = this.enemies.get(id);
      if (!ev) {
        if (!(G.ENEMIES as Record<string, any>)[type]) continue;
        // the type, with this suspect's kit (weapon | vest | helmet | face | tac | what's mounted) laid over it
        const def = Object.create((G.ENEMIES as Record<string, any>)[type]);
        if (kit) { const [wpn, vest, helmet, face, tac, ex] = kit.split('|'); def.wpn = wpn; def.vest = vest; def.helmet = helmet; def.face = face || 0; def.tac = +tac || 0; def.ex = ex ? ex.split(',') : []; }
        const rig = G.Rig.create({ style: def.style, scale: def.scale, boss: !!def.boss, leader: !!def.leader, seed: id * 7919 + 13, dressed: true });
        rig.powered = true; // a physically simulated body, held up by its muscles (js/rig.ts powerStep)
        if (!def.civ) rig.setKit(G.Rig.armourKit(def.vest, def.helmet, def.style === 'armored', def.face, def.ex)); // their armour, as an officer's would look
        if (def.wpn && armed) { rig.setGun(def.wpn); rig.holster(armed === 1); this.tacOnGun(rig, def.tac); }
        G.R.dynRoot.add(rig.root);
        ev = { id, type, def, rig, tac: def.tac || 0, pos: new THREE.Vector3(x, y, z), tgt: new THREE.Vector3(x, y, z), yaw, tgtYaw: yaw, hp, alive: true, deadT: 0, lean: 0 };
        this.enemies.set(id, ev);
      }
      if (!ev.alive) continue;
      // health dropped from someone else's shot: flinch away from the nearest player
      if (hp < ev.hp && !ev.selfHit) {
        const src = this.nearestPlayer(ev.pos);
        if (src) ev.rig.hit(ev.pos.clone().sub(src).setY(0).normalize());
      }
      ev.selfHit = false;
      ev.tgt.set(x, y, z); ev.tgtYaw = yaw; ev.hp = hp; ev.aim = aim; ev.alert = alert; ev.crouch = !!crouch; ev.lean = lean || 0;
      ev.radio = !!rd; ev.scode = scode || 0; ev.fc = fc || 0; // (fc: a flashbang's: 1 blinded and deaf, 2 coming round)
      ev.bleed = !!(fl & 1); ev.limp = !!(fl & 2); ev.reloading = !!(fl & 4); ev.down = !!(fl & 8); // wounds, reloads, down for good: from the host
      ev.wnd = Array.isArray(wd) ? wd : null; // the moderate-or-worse wounds (js/views.ts woundStreams); none once treated
      ev.str = str == null ? 1 : str / 100; // what blood loss leaves them to stand with (js/rig.ts powered body)
      // weapon in hand follows the host: dropped on surrender, drawn again by a fake surrender
      if (!armed && ev.rig.gun) { ev.rig.dropGun(); this.discardDrop(ev.rig); }
      else if (armed && !ev.rig.gun && ev.def.wpn) ev.rig.setGun(ev.def.wpn);
      ev.armed = armed;
      if (ev.rig.gun) ev.rig.holster(armed === 1); // 1 = holstered/slung, 2 = in hand
      if (surp && !ev.surp) ev.rig.startle();
      ev.surp = !!surp;
      if (door && !ev.doorOn) ev.doorT = 0; // started opening a door
      ev.doorOn = !!door;
    }
    for (const ev of this.enemies.values()) if (ev.alive && !seen.has(ev.id)) this.kill({ e: ev.id });
    for (const [id, st] of Object.entries(m.p)) {
      if (id === G.Net.myId) continue;
      const pv = this.players.get(id);
      if (!pv) continue;
      pv.st = st;
      if (pv.first) { pv.pos.set(st.p[0], st.p[1], st.p[2]); pv.yaw = st.yw; pv.first = false; }
      if (st.kt) pv.rig.setKit(st.kt); // their helmet, carrier, belt, pack... as they're wearing them
    }
    G.Game.extract.active = !!m.x[0];
    G.Game.extract.votes = m.x[1] || 0; G.Game.extract.need = m.x[2] || 0; G.Game.extract.civDead = m.x[3] || 0;
    G.Game.extract.voted = (m.x[4] || []).includes(G.Net.myId);
    G.Game.unitsCleared = m.x[5] || 0;
    G.Game.enemiesLeft = m.n;
    G.Game.civsLeft = m.c || 0;
    G.Game.bodiesLeft = m.b || 0;
    G.Game.weaponsLeft = m.w || 0;
  },
  // world position of the closest living player (including you)
  nearestPlayer(p: THREE.Vector3) {
    let best: THREE.Vector3 | null = null, bd = 1e9;
    if (G.Me.pos && !G.Me.dead && !G.Me.down) { bd = G.Me.pos.distanceTo(p); best = G.Me.pos; }
    for (const pv of this.players.values()) {
      if (!pv.st || pv.st.dd || pv.st.dn) continue;
      const d = pv.pos.distanceTo(p);
      if (d < bd) { bd = d; best = pv.pos; }
    }
    return best;
  },

  kill(m: any) {
    const ev = this.enemies.get(m.e);
    if (!ev || !ev.alive) return;
    ev.alive = false; ev.deadT = 0; ev.wnd = m.bo ? null : Array.isArray(m.wd) ? m.wd : ev.wnd; // (the wounds go on a while after: woundStreams)
    let dir = ev.lastHitDir;
    if (!dir) {
      const killer = m.by && m.by !== G.Net.myId && this.players.get(m.by) ? this.players.get(m.by)!.pos : this.nearestPlayer(ev.pos);
      if (killer) dir = ev.pos.clone().sub(killer).setY(0).normalize();
    }
    ev.rig.die(dir);
    this.discardDrop(ev.rig);
    G.R.impact(new THREE.Vector3(ev.pos.x, 1.2 * ev.def.scale, ev.pos.z), null, 'blood');
  },

  // evidence is drawn from the host's record; the rig's own falling gun is discarded so there's one copy
  addEvidence(i: number, wpn: string, x: number, z: number, y = 0) {
    if (this.evidence.has(i)) return;
    const mesh = G.GunModels.world(wpn);
    mesh.position.set(x, y + 0.05, z);
    mesh.rotation.set(0, Math.random() * Math.PI * 2, Math.PI / 2); // lying on its side
    // a glowing yellow outline until it's bagged, seen through anything but walls and floors (G.R.render)
    mesh.userData.outline = this.addOutline(mesh);
    G.R.dynRoot.add(mesh);
    this.evidence.set(i, { mesh, wpn, x, y, z });
  },
  // Outline: the gun's silhouette marks the stencil, then three shells pushed out along the surface normals
  // by a fixed number of pixels draw only outside it: a bright line fading out in two softer bands. Each band
  // draws a pixel once (it marks the stencil as it goes), so overlapping triangles don't stack up.
  // (blue: the halo on what F would take: G.Views.setHalo)
  outlineMats(blue?: boolean) {
    const key = blue ? '_haloMats' : '_outline';
    if (this[key]) return this[key];
    const vs = `uniform float px; uniform vec2 res;
      void main() {
        vec4 clip = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        vec2 d = (projectionMatrix * vec4(normalize(normalMatrix * normal), 0.0)).xy;
        float l = length(d);
        if (l > 1e-5) clip.xy += d / l * px * clip.w * 2.0 / res;
        gl_Position = clip;
      }`;
    const fs = 'uniform vec3 color; uniform float opacity; void main() { gl_FragColor = linearToOutputTexel(vec4(color, opacity)); }';
    const res = this._outRes || (this._outRes = { value: new THREE.Vector2(window.innerWidth, window.innerHeight) });
    const silhouette = new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false, fog: false,
      stencilWrite: true, stencilRef: 4, stencilFunc: THREE.AlwaysStencilFunc, stencilZPass: THREE.ReplaceStencilOp });
    // ref 3, 2, 1: each band draws where the stencil is still below its ref, then raises it
    const bands = [[3, 2.2, 1], [2, 5, 0.42], [1, 9, 0.16]].map(([ref, px, op], i) => {
      const m = new THREE.ShaderMaterial({ vertexShader: vs, fragmentShader: fs, transparent: true, depthWrite: false,
        uniforms: { px: { value: px }, res, color: { value: new THREE.Color(blue ? 0x3a9dff : 0xffc830) }, opacity: { value: op } },
        stencilWrite: true, stencilRef: ref, stencilFunc: THREE.GreaterStencilFunc, stencilZPass: THREE.ReplaceStencilOp });
      m.userData.base = op;
      m.userData.order = i + 1;
      return m;
    });
    return (this[key] = { silhouette, bands, res });
  },
  // the world model's merged meshes have flat (per-face) normals; the outline needs them averaged per corner
  // so the pushed-out shells stay closed
  smoothGeo(geo: THREE.BufferGeometry) {
    this._smooth = this._smooth || new WeakMap();
    let out = this._smooth.get(geo);
    if (out) return out;
    const pos = geo.attributes.position as THREE.BufferAttribute, nor = geo.attributes.normal as THREE.BufferAttribute, sum = new Map<string, number[]>(), keys: string[] = [];
    for (let i = 0; i < pos.count; i++) {
      const k = `${Math.round(pos.getX(i) * 1e4)},${Math.round(pos.getY(i) * 1e4)},${Math.round(pos.getZ(i) * 1e4)}`;
      keys.push(k);
      const s = sum.get(k) || [0, 0, 0];
      s[0] += nor.getX(i); s[1] += nor.getY(i); s[2] += nor.getZ(i);
      sum.set(k, s);
    }
    const n = new Float32Array(pos.count * 3);
    keys.forEach((k, i) => { const s = sum.get(k)!, l = Math.hypot(s[0], s[1], s[2]) || 1; n[i * 3] = s[0] / l; n[i * 3 + 1] = s[1] / l; n[i * 3 + 2] = s[2] / l; });
    out = new THREE.BufferGeometry();
    out.setAttribute('position', pos);
    out.setAttribute('normal', new THREE.BufferAttribute(n, 3));
    if (geo.index) out.setIndex(geo.index);
    out.boundingSphere = geo.boundingSphere;
    this._smooth.set(geo, out);
    return out;
  },
  addOutline(mesh: THREE.Object3D, blue?: boolean) {
    const shells: THREE.Mesh[] = [];
    // (a gun whose packs are not in yet has no meshes to outline: they are when they come in, into the same list, shown or not as the halo is: js/gunmodels.ts)
    if (mesh.userData.pending) G.GunModels.whenReady(mesh, () => { const n = shells.length; this.outlineInto(mesh, shells, blue); for (let i = n; i < shells.length; i++) shells[i].visible = blue ? this._haloOn === mesh : this._haloOn !== mesh; });
    else this.outlineInto(mesh, shells, blue);
    return shells;
  },
  outlineInto(mesh: THREE.Object3D, shells: THREE.Mesh[], blue?: boolean) {
    const O = this.outlineMats(blue), parts: THREE.Mesh[] = [];
    // (every mesh in it, each outlined where it sits: a gun's, its magazine's, which is a group of its own: js/gunmodels.ts world)
    mesh.traverse((o) => { if ((o as THREE.Mesh).geometry && !o.layers.isEnabled(2)) parts.push(o as THREE.Mesh); });
    for (const part of parts) {
      const sil = new THREE.Mesh(part.geometry, O.silhouette);
      sil.layers.set(2); sil.frustumCulled = false;
      part.add(sil); shells.push(sil);
      const sg = this.smoothGeo(part.geometry);
      for (const m of O.bands) {
        const b = new THREE.Mesh(sg, m);
        b.layers.set(2); b.renderOrder = m.userData.order; b.frustumCulled = false;
        part.add(b); shells.push(b);
      }
    }
  },
  // A blue halo round what you'd take if you held F (obj: its mesh; null, nothing), in place of evidence's yellow while it's on
  setHalo(obj: THREE.Object3D | null) {
    const was = this._haloOn || null;
    if (obj === was) return;
    const show = (o: THREE.Object3D, on: boolean) => {
      for (const s of o.userData.halo) s.visible = on;
      for (const s of o.userData.outline || []) s.visible = !on;
    };
    if (was) show(was, false);
    if (obj) { if (!obj.userData.halo) obj.userData.halo = this.addOutline(obj, true); show(obj, true); }
    this._haloOn = obj;
  },
  // First aid cabinets: what's on the shelves (a box per stack, in its item's colour), and the door
  syncCabs() {
    const map = G.Game.map, cvs: VwCabView[] | null = map && map.cabViews, cabs = G.Game.cabs || [];
    if (!cvs) return;
    const COL: Record<string, number> = { bandage: 0xe8e2d0, pills: 0xe8c040, tourniquet: 0x2a2a2a, gauze: 0x4a7ab0, seal: 0xb03a3a, splint: 0xd27b4b, bloodbag: 0x7a0d12 };
    cvs.forEach((cv, i) => {
      const c = cabs[i], items = c ? c[1] : [];
      if (c && c[0] && cv.key === null) cv.open = 1; // joined with it already open
      cv.key = JSON.stringify(c || null);
      cv.slots.forEach((s, k) => { s.visible = k < items.length; if (s.visible) s.material.color.setHex(COL[items[k][0]] || 0xffffff); });
    });
  },
  // The weapon case's lid (what's in it is G.Loot's)
  syncCase() {
    const map = G.Game.map, cv: VwLid | null = map && map.caseView;
    if (!cv || cv.synced) return;
    cv.synced = true;
    if (G.Game.caseOpen) cv.open = 1; // joined with it already open
  },
  // a body that died before we joined: lay it out where it fell
  addBody(id: number, type: string, x: number, z: number, yaw: number, secured: number, y = 0) {
    if (this.enemies.has(id)) return;
    const def = (G.ENEMIES as Record<string, any>)[type];
    if (!def) return;
    const rig = G.Rig.create({ style: def.style, scale: def.scale, boss: !!def.boss, leader: !!def.leader, seed: id * 7919 + 13, dressed: true });
    if (!def.civ) rig.setKit(G.Rig.armourKit(def.vest, def.helmet, def.style === 'armored'));
    G.R.dynRoot.add(rig.root);
    const ev = { id, type, def, rig, pos: new THREE.Vector3(x, y, z), tgt: new THREE.Vector3(x, y, z), yaw, tgtYaw: yaw, hp: 0, alive: false, deadT: 0, lean: 0 } as VwEnemy;
    rig.root.position.set(x, y, z); rig.root.rotation.y = yaw;
    rig.die(null);
    rig.settle(3);
    if (secured) { ev.bodySecured = true; rig.zip(!def.civ, true); rig.settle(2); }
    this.enemies.set(id, ev);
  },
  // sealed evidence envelope left where the weapon was, so it's clear what's been bagged
  envelopeMesh() {
    if (!this._envMat) {
      const c = document.createElement('canvas'); c.width = 128; c.height = 176;
      const g = c.getContext('2d')!;
      g.fillStyle = '#c9a86a'; g.fillRect(0, 0, 128, 176);
      g.fillStyle = '#b3262a'; g.fillRect(0, 10, 128, 30);
      g.fillStyle = '#fff'; g.font = 'bold 22px Arial'; g.textAlign = 'center'; g.fillText('EVIDENCE', 64, 33);
      g.strokeStyle = 'rgba(40,30,20,0.6)'; g.lineWidth = 2;
      for (let y = 60; y < 150; y += 18) { g.beginPath(); g.moveTo(12, y); g.lineTo(116, y); g.stroke(); }
      g.fillStyle = '#222'; for (let x = 20; x < 108; x += 5) g.fillRect(x, 156, x % 3 ? 2 : 3, 12);
      this._envMat = new THREE.MeshLambertMaterial({ map: new THREE.CanvasTexture(c) });
      this._envGeo = new THREE.BoxGeometry(0.24, 0.012, 0.33);
    }
    return new THREE.Mesh(this._envGeo, this._envMat);
  },
  secureEvidence(i: number) {
    const v = this.evidence.get(i);
    if (!v || v.secured) return;
    G.R.dynRoot.remove(v.mesh);
    v.mesh = this.envelopeMesh();
    v.mesh.position.set(v.x, (v.y || 0) + 0.008, v.z);
    v.mesh.rotation.y = Math.random() * Math.PI * 2;
    G.R.dynRoot.add(v.mesh);
    v.secured = true;
  },
  removeEvidence(i: number) {
    const v = this.evidence.get(i);
    if (!v) return;
    G.R.dynRoot.remove(v.mesh);
    this.evidence.delete(i);
  },
  // where an officer's hands are on someone being restrained: between the shoulder blades while they're
  // shoved down, then at the wrists (shared by first person, teammates' rigs and the camera)
  zipPoint(ev: VwEnemy, t: number, living: boolean) { return G.Rig.zipPoint(ev.rig, t, living); },
  discardDrop(rig: Rig) { if (rig.dropped) { if (rig.dropped.g.parent) rig.dropped.g.parent.remove(rig.dropped.g); rig.dropped = null; } },
  // A window breaking: the pane goes, a burst of glass falls both sides of it, and it's heard. at, dir: where
  // the round went through (optional)
  // A pane that's taken its first round: fractured right across from where it was hit (js/damage.ts crack), still up
  crackGlass(id: number, at: THREE.Vector3, dir?: THREE.Vector3) {
    const map = G.Game.map, w = map && map.windows && map.windows[id];
    if (!w || w.broken || w.armor || w.cracked) return;
    w.cracked = true; map.cracked = true;
    if (G.Highlights) G.Highlights.crack(id, at);
    G.Damage.crack(map.winMeshes && map.winMeshes[id] as THREE.Mesh, at);
    G.R.particles(at, 8, 0xd8eef5, 1.2, 0.8, 9, 0.7, dir ? [dir.x, 0, dir.z] : null);
    G.Audio.glass(Math.hypot(w.x - G.R.camera.position.x, w.z - G.R.camera.position.z) + 10); // (from the camera: on a helmet cam, what they hear)
  },
  breakGlass(id: number, at?: THREE.Vector3, dir?: THREE.Vector3) {
    const map = G.Game.map, w = map && map.windows && map.windows[id];
    if (!w || w.broken || w.armor) return; // (bulletproof glass doesn't break)
    w.broken = true;
    if (G.Highlights) G.Highlights.glass(id);
    G.World.windowSolids(map.world, map, w);
    const pane = map.winMeshes && map.winMeshes[id];
    if (pane) pane.visible = false;
    const Y = w.fy || 0, lo = w.door ? 0.25 : w.rail ? 0.1 : w.sill != null ? w.sill : G.Level.SILL, hi = w.door ? G.Level.DOOR_H - 0.1 : w.rail ? G.Level.RAIL_H - 0.05 : w.top != null ? w.top : G.Level.TOP; // (a glass door: its pane, nearly floor to top rail; a railing's: under its handrail)
    const ax = w.door ? (w.door.axis === 'x' ? 0 : 1) : (w.nz ? 1 : 0), az = w.door ? (w.door.axis === 'x' ? 1 : 0) : (w.nx ? 1 : 0); // (along the glass)
    for (let k = 0; k < 4; k++) {
      const q = new THREE.Vector3(w.x + ax * (Math.random() - 0.5) * w.len, Y + lo + Math.random() * (hi - lo), w.z + az * (Math.random() - 0.5) * w.len);
      G.R.particles(q, 14, 0xd8eef5, 1.6, 1.2, 9, 0.7, dir ? [dir.x * 1.5, 0, dir.z * 1.5] : null);
    }
    G.Audio.glass(Math.hypot(w.x - G.R.camera.position.x, w.z - G.R.camera.position.z));
  },
  // A weapon light and/or laser from `from` along dir: the light shines, the laser lands on the first wall or
  // person in its way (a person as a rough column: standing up to 1.8 m, 0.25 m round). skip: whose it is.
  // (selfEv: a suspect's own: their body doesn't stop their laser.) Anyone else's light can dazzle you: js/glare.ts.
  tacBeam(from: THREE.Vector3, dir: THREE.Vector3, fl: number, skip: string | null, drawFrom?: THREE.Vector3 | null, selfEv?: VwEnemy) {
    const map = G.Game.map;
    if (!map) return;
    const src = drawFrom || from; // (where the light and the beam visibly come from)
    if (fl & 1) { G.R.tacLight(src, dir, fl & 8 ? 1.6 : 1, skip != null, skip == null && !!map.night); // (your own beam in the air: only in the dark of a night level)
      if (skip != null) G.Glare.add(skip, src, dir, fl & 8 ? 1.6 : 1); }
    if (!(fl & 2)) return;
    let t = G.Level.raycast(map, from.x, from.y, from.z, dir.x, dir.y, dir.z, 60, { glass: true }).t;
    const hz = Math.hypot(dir.x, dir.z) || 1e-6;
    const body = (p: THREE.Vector3, h: number) => {
      const ox = p.x - from.x, oz = p.z - from.z, along = (ox * dir.x + oz * dir.z) / hz; // (along the ground)
      if (along <= 0) return;
      const tt = along / hz, sx = from.x + dir.x * tt - p.x, sz = from.z + dir.z * tt - p.z;
      if (Math.hypot(sx, sz) > 0.25 || tt >= t) return;
      const y = from.y + dir.y * tt;
      if (y > p.y && y < p.y + h) t = tt;
    };
    for (const ev of this.enemies.values()) if (ev.alive && ev !== selfEv) body(ev.pos, ev.crouch ? 1.2 : 1.8);
    for (const [id, pv] of this.players) if (id !== skip && pv.st && !pv.st.dd) body(pv.pos, pv.st.cr ? 1.2 : 1.8);
    if (skip != null) body(G.Me.pos, G.Me.crouch ? 1.2 : 1.8);
    const end = from.clone().addScaledVector(dir, t - 0.01);
    G.R.tacLaser(src, end, !!(fl & 4));
    if (G.Highlights) G.Highlights.laser(selfEv ? skip : skip == null ? null : 'p' + skip, end, !!(fl & 4)); // (where it landed: the replays show it)
  },
  // the light or laser on a suspect's gun, to see: a little black housing under the barrel
  tacOnGun(rig: Rig, tac: number) {
    const gi = rig.gunInfo, m = gi && gi.muzzles && gi.muzzles[0];
    if (!tac || !rig.gun || !m) return;
    const box = new THREE.Mesh(this.tacGeo || (this.tacGeo = new THREE.CylinderGeometry(0.014, 0.016, 0.08, 8).rotateX(Math.PI / 2)), this.tacMat || (this.tacMat = new THREE.MeshLambertMaterial({ color: 0x17181a })));
    box.position.set(m[2], m[1] - 0.032, -m[0] * 0.72); rig.gun.add(box);
  },
  // a suspect reloading: the magazine out and in (or shells going in one by one), heard if you're close
  enemyReload(m: any) {
    const ev = this.enemies.get(m.e);
    if (!ev || !ev.alive) return;
    if (ev.pos.distanceTo(G.R.camera.position) > 25) return;
    const A = G.Audio, dur = Math.min(5, +m.dur || 2) * 1000;
    if (!(m.n > 0)) { ev.reloadAt = performance.now(); ev.reloadDur = dur; } // (a magazine change: their hands show it, js/rig.ts)
    // from their hands, wherever they are when each part of it happens (heard from that side, muffled through walls)
    const at = () => new THREE.Vector3(ev.pos.x, ev.pos.y + 1.15 * (ev.crouch ? 0.7 : 1) * ev.def.scale, ev.pos.z); // (above their feet, on whatever floor they're on)
    // (their gun's own sounds, js/handling.ts, where it has them; else the recordings)
    const H = G.Handling, wd = G.WEAPONS[ev.def.wpn];
    if (m.n > 0) { for (let i = 0; i < Math.min(8, m.n); i++) setTimeout(() => { if (ev.alive && ev.reloading !== false) (wd && H.roundIn(wd, { vol: 0.45, pos: at() })) || A.sampleAt('insert_magazine', at(), 0.45, 1.6) || A.shell(); }, i * dur + dur * 0.7); return; }
    H.play(wd, 'mag-out', { land: H.LAND.magOut, vol: 0.6, pos: at() }) || A.sampleAt('pull_magazine', at(), 0.6, 1);
    setTimeout(() => { if (ev.alive) H.play(wd, 'mag-in', { land: H.LAND.magIn, vol: 0.6, pos: at() }) || A.sampleAt('insert_magazine', at(), 0.6, 1); }, dur * 0.6);
    setTimeout(() => { if (ev.alive) (wd && H.play(wd, H.rackClip(wd, 0.45), { land: H.LAND.rack, vol: 0.5, pos: at() })) || A.sampleAt('rack_slide', at(), 0.5, 1); }, dur * 0.88);
  },
  // The host's: each suspect's gun as it was last drawn here, where their bodies are simulated (js/rig.ts powerStep), for the
  // simulation to know whether it's on its target before they fire (js/server.ts onTarget): [id, muzzle x, y, z, bore x, y, z, ...]
  _bv: new THREE.Vector3(),
  boresOut() {
    if (!this.enemies.size) return;
    const a: number[] = [], v = this._bv;
    for (const ev of this.enemies.values()) {
      const rig = ev.rig, gi = rig && rig.gunInfo;
      if (!rig || !rig.rd || !rig.gun || !gi || rig.slung || !gi.muzzles || !gi.muzzles[0]) continue;
      const m = rig.gun.localToWorld(v.set(gi.muzzles[0][2], gi.muzzles[0][1], -gi.muzzles[0][0]));
      a.push(ev.id, m.x, m.y, m.z);
      const b = v.set(0, 0, -1).transformDirection(rig.gun.matrixWorld);
      a.push(b.x, b.y, b.z);
    }
    G.Net.toHost({ t: 'bores', a });
  },
  enemyShot(m: any) {
    let to = new THREE.Vector3(m.to[0], m.to[1], m.to[2]);
    let f = new THREE.Vector3(m.f[0], m.f[1], m.f[2]);
    // the round leaves the barrel of the gun in their hands, as you see it (the host's own muzzle point is a
    // stand-in: it doesn't know how their body is lying)
    const sh = this.enemies.get(m.e), gi = sh && sh.rig.gun && sh.rig.gunInfo;
    if (gi && gi.muzzles && gi.muzzles[0]) {
      sh!.rig.gun!.updateMatrixWorld(true);
      f = sh!.rig.gun!.localToWorld(new THREE.Vector3(gi.muzzles[0][2], gi.muzzles[0][1], -gi.muzzles[0][0]));
    }
    G.R.muzzleFlashAt(f);
    const me = G.R.camera.position;
    const wdef = G.WEAPONS[m.w] || G.WEAPONS[(G.ENEMIES as Record<string, any>)[m.ty].wpn];
    // what you see of their round (a machine gunner's belt has a tracer every fourth): what it does is the host's, flown there
    // (js/player.ts enemyRound), its marks and wounds told to you as they happen
    const ev0 = this.enemies.get(m.e), tr = wdef.cls === 'LMG' && ev0 && ((ev0.shots = (ev0.shots || 0) + 1) % 4 === 1);
    if (G.Highlights) G.Highlights.shot('e' + m.e, f, to, wdef.code || m.w, undefined!, undefined!, m.sid);
    this.visRound(f, to, wdef, tr ? 'tracer' : G.ballFor(G.calOf(wdef)), () => {});
    G.Casings.fired(wdef, false, f, to);
    if (!G.GunAudio.play(wdef.id, f, 'e' + m.e, 1, to)) G.Audio.shot((G.CLASS_SND as Record<string, any>)[wdef.cls] || G.CLASS_SND.AR, me.distanceTo(f));
    G.Audio.flyby(f, to, wdef, G.ballFor(G.calOf(wdef)));
    this.pings.push({ x: m.f[0], z: m.f[2], t: 2.5 });
    const ev = this.enemies.get(m.e);
    if (ev) ev.rig.recoil(G.Sim.kickOf(ev.str, wdef)); // (the same kick the host gave it)
  },
  // The marks a round left (js/ballistics.ts mark: [x, y, z, normal, what it looks like, e(ntry) x (exit) r(icochet)]), on your
  // screen: skip the first (the arrival drew it). A ricochet's next leg shows as a streak.
  roundFx(list: any[][], skip?: boolean) {
    let last: any[] | null = null;
    (list || []).forEach((f, i) => {
      const p = new THREE.Vector3(f[0], f[1], f[2]);
      if (!(skip && i === 0)) G.R.impactOn(p, f.slice(3, 6), null, f[6], f.length > 8 ? { m: f[12], k: f[7], dir: f.slice(8, 11), J: f[11], stop: !!f[13], cal: f[14], cut: f[15] || 0 } : undefined);
      if (last && last[7] === 'r') G.R.tracer(new THREE.Vector3(last[0], last[1], last[2]), p, 0xffd080, 0.05);
      if (f[7] === 'r' && G.Audio.ricochet) G.Audio.ricochet(p);
      last = f;
    });
  },
  enemyThrow(id: number) { const ev = this.enemies.get(id); if (ev && ev.alive) ev.rig.throwNade(); },
  remoteShot(m: any) {
    const f = new THREE.Vector3(m.f[0], m.f[1], m.f[2]), to = new THREE.Vector3(m.to[0], m.to[1], m.to[2]);
    const def = G.Gunsmith.fromCode(m.w);
    if (!def) return;
    const pv = this.players.get(m.id), more = !!m.vi; // (more: a volley's round after its first, which brought the kick, the flash and the report for all of them: js/player.ts shoot)
    if (pv && !more) pv.rig.recoil();
    if (G.Highlights) G.Highlights.shot('p' + m.id, f, to, m.w, m.am, m.tos, m.sid);
    G.Audio.flyby(f, to, def, m.am || G.ballFor(G.calOf(def))); // a teammate's round going past you
    // their round flies to where it was headed (the walls it'll meet, as the shooter worked it out)
    const am = m.am || G.ballFor(G.calOf(def)), fromP = f.clone(), toP = to.clone();
    this.visRound(f, to, def, am, () => {
      if (def.cls === 'RAIL') G.R.tracer(fromP, toP, def.tracer || 0x55ddff, 0.06);
    });
    if (more) return;
    if (!m.sil) G.R.muzzleFlashAt(f, def.tracer || 0xffb060);
    if (!def.caseless && !def.volley) G.Casings.fired(def, false, f, to, m.am); // (a volley gun's empties stay in its chambers)
    const d = G.R.camera.position.distanceTo(f);
    if (def.cls === 'RAIL') G.Audio.rail(d);
    else if (def.cls === 'BOW') G.Audio.bow(d);
    else if (!G.GunAudio.play(m.bm && def.barrels ? G.shotSoundKey(G.roundSpec(def, m.rl), m.bm, am) : G.Gunsmith.roundSoundKey(def, am), f, 'p' + m.id, m.bm && def.barrels ? Math.pow(G.shotK(def, m.bm), 2) : def.volley ? G.volleyVol(def, m.vn || def.volley) : 1, to)) G.Audio.shot(m.sil ? G.SUPPRESSOR.snd : def.snd, d);
  },

  // ---------------------------------------------------------------- other people's rounds
  // A round someone else fired, as you see it: from f straight to `to` at its speed (G.roundSpeed, slowing with
  // drag), drawn like your own (G.R.bullet); arrive: what happens when it gets there.
  visRound(f: THREE.Vector3, to: THREE.Vector3, def: any, am: string, arrive: () => void) {
    const len = f.distanceTo(to);
    if (len < 0.05) { arrive(); return; }
    const rail = def.cls === 'RAIL';
    (this.vRounds = this.vRounds || []).push({ f: f.clone(), dir: to.clone().sub(f).divideScalar(len), len, d: 0, def, am, arrive,
      v: rail ? 3000 : Math.max(40, G.roundSpeed(def, am) || 400), drag: rail ? 1e9 : G.dragOf(def, am), tracer: !!((G.AMMO as Record<string, any>)[am] && (G.AMMO as Record<string, any>)[am].tracer) });
  },
  stepRounds(dt: number) {
    const rs = this.vRounds;
    if (!rs || !rs.length) return;
    dt = Math.min(dt, 0.05);
    for (let i = rs.length - 1; i >= 0; i--) {
      const b = rs[i], step = b.v * dt;
      b.d = Math.min(b.len, b.d + step);
      b.v *= Math.exp(-step / b.drag);
      G.R.bullet(b.f.clone().addScaledVector(b.dir, b.d), b.dir, b.d, b.def, b.tracer, b.v, b.am);
      if (b.d >= b.len || b.v < 30) { rs.splice(i, 1); b.arrive(); }
    }
  },
  // kind: 'frag', or 'flash' (a flashbang: a grey can)
  // ---------------------------------------------------------------- a thrown grenade's flight
  // Gravity, bounces off walls, floors and ceilings (some of its speed lost each time, a floor taking more), then
  // rolling along the floor, slowed by friction, till it stops. n: { pos, vel } (and n.onGround, set here). The
  // same steps for everyone's grenades and for the throw you're lining up (predictNade), so where the arc says it
  // ends up is where it does.
  NADE_R: G_Sim.NADE_R, NADE_G: G_Sim.NADE_G, // (js/sim.ts: the flight itself, the same for the host's simulation)
  nadeStep(n: VwNadeMotion, dt: number, map: LvMap | null) { G.Sim.nadeStep(n, dt, map); },
  // Where a throw goes: its path, stepped as a grenade flies (nadeStep) for as long as the fuse burns. Returns
  // the points along it (Vector3s) and where it goes off (the last).
  predictNade(p: THREE.Vector3, v: THREE.Vector3, fuse: number, map: LvMap | null) { return G.Sim.predictNade(p, v, fuse, map); },
  // A thermobaric grenade's body: an olive can with an orange band round its middle and a grey fuze on top (std: a lit
  // material, for the hand in front of you)
  tbMesh(r: number, h: number, std = false) {
    const T = THREE, M = (c: number, o: Record<string, any> = {}) => std ? new T.MeshStandardMaterial(Object.assign({ color: c, roughness: 0.65 }, o)) : new T.MeshLambertMaterial(Object.assign({ color: c }, o));
    const body = new T.Mesh(new T.CylinderGeometry(r, r, h, 12), M(0x4c5634, std ? {} : { emissive: 0x220000 }));
    const band = new T.Mesh(new T.CylinderGeometry(r * 1.03, r * 1.03, h * 0.16, 12), M(0xc8641e)); band.position.y = h * 0.12; body.add(band);
    const fuze = new T.Mesh(new T.CylinderGeometry(r * 0.38, r * 0.45, h * 0.24, 8), M(0x8a8f94)); fuze.position.y = h * 0.6; body.add(fuze);
    return body;
  },
  addNade(p: THREE.Vector3, v: THREE.Vector3, fuse: number, own: boolean, enemy: boolean, kind: VwNadeKind = 'frag') {
    const flash = kind === 'flash';
    const mesh = kind === 'tb' ? this.tbMesh(0.045, 0.15) as THREE.Mesh<THREE.BufferGeometry, THREE.MeshLambertMaterial> : new THREE.Mesh(flash ? new THREE.CylinderGeometry(0.035, 0.035, 0.13, 10) : new THREE.SphereGeometry(0.08, 8, 6), new THREE.MeshLambertMaterial({ color: flash ? 0x7d8388 : 0x3a4a2a, emissive: 0x220000 }));
    mesh.position.copy(p);
    G.R.dynRoot.add(mesh);
    this.nades.push({ pos: new THREE.Vector3().copy(p), vel: new THREE.Vector3().copy(v), fuse, own, enemy, mesh, kind });
  },

  // ---------------------------------------------------------------- wound streams
  // A suspect with a moderate or worse bleed (the host sends the wounds: js/server.ts injure) has a stream of blood from each
  // wound, riding the bone it's on (so it follows them walking, falling, lying). It pulses with the heart: a beat is a sharp
  // rise and a slower fall, with a small bump after it; the rate climbs with stress and blood loss, and the flow weakens as
  // blood runs low. An artery spurts (almost nothing between beats, a jet at each), a vein flows (a steady stream that swells
  // a little). Dead, the heart has stopped: what's left of the pressure runs out in seconds (a massive wound) or a quarter
  // minute. Fine drops, a hundred or so a second from a spurting artery (blood: now and then one leaves a drop on the floor where it lands, js/render.ts bloodJet), the nearest
  // WOUND_CAP wounded bodies only, fewer with distance.
  WOUND_CAP: 10,
  // [bone, local position (x mirrored by side), local direction] by the part's index (js/medical.ts PARTS)
  woundSpot(rig: Rig, w: number, k: number, out: THREE.Vector3, dir: THREE.Vector3) {
    const part = w & 7, sg = k & 1 ? 1 : -1; // (which side of the body: alternating)
    let bone: THREE.Object3D, x = 0, y = 0, z = 0, dx = 0, dy = 0, dz = 0;
    switch (part) {
      case 0: bone = rig.head; x = sg * 0.08; y = 0.05; z = -0.06; dx = sg; dy = 0.2; dz = -0.6; break;
      case 1: bone = rig.chest; x = sg * 0.11; y = 0.1; z = -0.13; dx = sg * 0.5; dy = 0.15; dz = -1; break;
      case 2: bone = rig.spine; x = sg * 0.09; y = 0.1; z = -0.11; dx = sg * 0.5; dy = 0.1; dz = -1; break;
      case 3: case 4: { const s = part === 3 ? -1 : 1; bone = (s < 0 ? rig.armL : rig.armR).up; x = s * 0.05; y = -0.14; z = -0.03; dx = s; dy = 0; dz = -0.4; break; }
      default: { const s = part === 5 ? -1 : 1; bone = (s < 0 ? rig.legL : rig.legR).th; x = s * 0.02; y = -0.2; z = -0.07; dx = s * 0.3; dy = 0; dz = -1; break; }
    }
    bone.updateWorldMatrix(true, false);
    out.set(x, y, z).applyMatrix4(bone.matrixWorld);
    const e = bone.matrixWorld.elements; // (the direction, turned by the bone: no scale to speak of)
    dir.set(dx * e[0] + dy * e[4] + dz * e[8], dx * e[1] + dy * e[5] + dz * e[9], dx * e[2] + dy * e[6] + dz * e[10]).normalize();
  },
  // The heartbeat's pressure at a phase (0..1 through a beat): 1 at the peak of the beat, falling away, a small second bump
  pulseAt(f: number) { return Math.max(f < 0.08 ? f / 0.08 : Math.exp(-(f - 0.08) * 7), 0.2 * Math.exp(-(((f - 0.4) / 0.06) ** 2))); },
  woundStreams(dt: number) {
    const cam = G.R.camera.position, cand: [number, VwEnemy][] = [];
    for (const ev of this.enemies.values()) {
      if (!ev.wnd || !ev.wnd.length || !ev.rig.body.visible) continue;
      const d2 = ev.pos.distanceToSquared(cam);
      if (d2 < 36 * 36) cand.push([d2, ev]);
    }
    if (!cand.length) return;
    cand.sort((a, b) => a[0] - b[0]);
    const _p = WP, _d = WD;
    for (let c = 0; c < Math.min(cand.length, this.WOUND_CAP); c++) {
      const [d2, ev] = cand[c], wnd = ev.wnd!;
      const dist = Math.sqrt(d2), lod = dist < 12 ? 1 : dist < 24 ? 0.5 : 0.25;
      const hpf = G.U.clamp(ev.hp / 100, 0, 1), loss = 1 - hpf; // (their health stands for blood: wounds drain it)
      // the heart: a resting rate, up with stress (they know they're hunted) and with what's been lost; down for good, slower and weaker
      const bpm = (68 + (ev.alert ? 30 : 0) + 85 * loss * loss + (ev.hp < 15 ? -30 * (1 - ev.hp / 15) : 0)) * (ev.down ? 0.8 : 1);
      let vol = 0.2 + 0.8 * Math.pow(hpf, 0.6), beat = 1; // (volume: less blood, less to bleed; beat: how hard the pulse is)
      if (!ev.alive) { // (the heart's stopped: the pressure runs out)
        const massive = wnd.some((w) => w & 16), tau = massive ? 2.5 : 12;
        vol *= Math.exp(-ev.deadT / tau); beat = 0;
      } else ev.ph = ((ev.ph || ev.id * 0.37) + dt * bpm / 60) % 1;
      if (vol < 0.03) continue;
      const pulse = this.pulseAt(ev.ph || 0), acc = ev.wacc || (ev.wacc = []);
      for (let k = 0; k < wnd.length; k++) {
        const w = wnd[k], art = !!(w & 8);
        // (an artery: almost nothing between beats; a vein: a steady run that swells a little with each)
        const flow = (art ? 0.04 + 0.96 * pulse * beat : 0.62 + 0.38 * pulse * beat) * vol;
        acc[k] = (acc[k] || 0) + dt * (art ? 110 : 45) * flow * lod * (w & 16 ? 1.5 : 1); // (fine drops, many: js/render.ts bloodJet)
        if (acc[k] < 1) continue;
        this.woundSpot(ev.rig, w, k, _p, _d);
        const n = Math.min(12, acc[k] | 0); acc[k] -= n;
        for (let i = 0; i < n; i++) {
          const jet = art ? 0.5 + 1.1 * flow : 0.06 + 0.22 * flow, s = jet * (0.85 + Math.random() * 0.3), j = art ? 0.05 : 0.1; // (slow: blood wells and spurts, it doesn't spray)
          G.R.bloodJet(_p, _d.x * s + (Math.random() - 0.5) * j, _d.y * s + (art ? 0.2 * flow : 0) + (Math.random() - 0.5) * j * 0.6, _d.z * s + (Math.random() - 0.5) * j, art ? 0x8c0a0a : 0x6e0808);
        }
      }
      // down for good (alive or not): a pool grows under the body, from where it lies
      if (!ev.wpool && (ev.down || !ev.alive)) {
        ev.wpool = true;
        const b = G.Rig.bodyAt(ev.rig);
        if (ev.alive) G.R.bloodPool(ev, b.x, b.z, wnd.some((w) => w & 16) ? 1.2 : 0.8, 45, b.y - 0.2);
      }
    }
  },
  // An officer losing blood: drops where they stand or walk (more, the heavier the bleeding), and a pool
  // under them when they're down or dead. who: the owner key, pos: their feet, bl: 0 none, 1 light, 2 heavy.
  officerBlood(who: { _drip?: number; [k: string]: any }, pos: THREE.Vector3, bl: number, down: boolean, dt: number) {
    if (!bl) return;
    const k = who === G.Me ? (this._myDrip = (this._myDrip || 0) - dt) : (who._drip = (who._drip || 0) - dt);
    if (down) G.R.bloodPool(who, pos.x, pos.z, bl > 1 ? 1.0 : 0.5, bl > 1 ? 30 : 60, pos.y);
    else if (k <= 0) {
      const next = bl > 1 ? 0.12 + Math.random() * 0.12 : 0.6 + Math.random() * 0.6;
      if (who === G.Me) this._myDrip = next; else who._drip = next;
      G.R.particles(new THREE.Vector3(pos.x + (Math.random() - 0.5) * 0.35, 0.9, pos.z + (Math.random() - 0.5) * 0.35), 1, 0x7a0808, 0.2, 0.8, 9, 0.1, null, true);
    }
  },
  // ---------------------------------------------------------------- pings
  // A teammate's ping (or yours): a marker in their colour with their name at the spot (nothing about what's
  // there), seen through walls,
  // the same size on screen however far off, gone after a few seconds. One per player: a new one replaces it.
  PING_T: 6,
  addPing(id: string, p: number[]) {
    const me = id === G.Net.myId, r = G.Game.roster && G.Game.roster[id], name = me ? G.Game.myName : r ? r.name : '?', color = me ? G.Game.myColor : r ? r.color : 0xffffff, animal = me ? G.Game.myAnimal : r ? r.animal : null;
    this.pings2 = this.pings2 || new Map();
    const old = this.pings2.get(id);
    if (old) { G.R.dynRoot.remove(old.s); old.s.material.map!.dispose(); old.s.material.dispose(); }
    const c = document.createElement('canvas'); c.width = 400; c.height = 160;
    const g = c.getContext('2d')!, col = G.U.hex(color);
    g.font = 'bold 30px Consolas, monospace'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.lineWidth = 6; g.strokeStyle = 'rgba(0,0,0,0.85)';
    const label = name;
    while (g.measureText(label).width > 380 && parseInt(g.font, 10) > 16) g.font = `bold ${parseInt(g.font.split(' ')[1], 10) - 2}px Consolas, monospace`; // (a long name: smaller)
    const tw = g.measureText(label).width, ax = animal ? 22 : 0; // (their animal before their name)
    g.strokeText(label, 200 + ax, 30); g.fillStyle = col; g.fillText(label, 200 + ax, 30);
    if (animal) { g.save(); g.translate(200 + ax - tw / 2 - 48, 8); g.beginPath(); g.arc(22, 22, 23, 0, Math.PI * 2); g.fillStyle = 'rgba(0,0,0,0.6)'; g.fill(); G.Callsigns.draw(g, animal, 44, color); g.restore(); }
    // the marker: a diamond pointing down at the spot
    g.beginPath(); g.moveTo(200, 150); g.lineTo(176, 100); g.lineTo(200, 62); g.lineTo(224, 100); g.closePath();
    g.lineWidth = 5; g.strokeStyle = 'rgba(0,0,0,0.85)'; g.stroke(); g.fillStyle = col; g.fill();
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), depthTest: false, transparent: true }));
    s.center.set(0.5, 0.06); s.renderOrder = 20;
    s.position.set(p[0], p[1], p[2]);
    G.R.dynRoot.add(s);
    this.pings2.set(id, { s, t: this.PING_T });
    G.Audio.tone && G.Audio.tone(880, 0.08, 'sine', 0.08); // (a soft blip)
  },
  updatePings(dt: number) {
    if (!this.pings2) return;
    const cam = G.R.camera.position;
    for (const [id, q] of this.pings2) {
      q.t -= dt;
      if (q.t <= 0) { G.R.dynRoot.remove(q.s); q.s.material.map!.dispose(); q.s.material.dispose(); this.pings2.delete(id); continue; }
      const d = q.s.position.distanceTo(cam), sc = Math.max(0.9, d * 0.085); // (about the same size on screen at any range)
      q.s.scale.set(sc * 1.56, sc * 0.625, 1);
      q.s.material.opacity = Math.min(1, q.t / 1.2);
    }
  },
  update(dt: number) {
    G.Casings.update(dt);
    G.Bolts.update();
    this.updatePings(dt);
    this.stepRounds(dt);
    if (G.Game.map && G.R.camera) { // the lights follow you (and, aiming, what you're aiming at)
      let focus = null;
      if (G.Me.adsT > 0.5 && G.Game.map.theme.layout === 'festival') {
        const c = G.R.camera, f = new THREE.Vector3(0, 0, -1).applyQuaternion(c.quaternion), h = G.Level.raycast(G.Game.map, c.position.x, c.position.y, c.position.z, f.x, f.y, f.z, 120);
        focus = c.position.clone().addScaledVector(f, h.t);
      }
      G.Level.updateLights(G.Game.map, G.R.camera.position, false, focus);
    }
    // officers bleeding: you, and your teammates from what their bodies report
    if (G.Game.phase === 'level' && G.Me.body && G.Me.pos) {
      const parts = Object.values(G.Me.body.parts), bl = parts.some((q) => q.heavy) ? 2 : parts.some((q) => q.light) ? 1 : 0;
      this.officerBlood(G.Me, G.Me.pos, bl, G.Me.down || G.Me.dead, dt);
      for (const pv of this.players.values()) {
        if (!pv.st || !pv.st.bd || !pv.pos) continue;
        const b = pv.st.bd.p || [], bl2 = b.some((q: number[]) => q[1] & 2) ? 2 : b.some((q: number[]) => q[1] & 1) ? 1 : 0;
        this.officerBlood(pv, pv.pos, bl2, pv.st.dn || pv.st.dd, dt);
      }
    }
    const map = G.Game.map, L = G.Level;
    // enemies
    for (const ev of [...this.enemies.values()]) {
      if (ev.alive) {
        ev.pos.lerp(ev.tgt, Math.min(1, dt * 12));
        // (the host keeps them out of the walls; the way between two of its snapshots can cut a corner, or a snap can carry it
        // through a thin wall: slid back out as the host does it, so what's drawn is never inside one)
        if (map && map.world && ev.pos.distanceToSquared(ev.tgt) > 1e-6) L.resolve(map, ev.pos, 0.38 * ev.def.scale, ev.pos.y, G.World.STEP, true);
        ev.yaw += G.U.angDiff(ev.yaw, ev.tgtYaw) * Math.min(1, dt * 12);
      } else {
        ev.deadT += dt;
        // the dead: once the body's down, a pool spreads from under the chest
        if (ev.deadT > 1.5 && ev.rig.rd && !ev.pooled) { ev.pooled = true; const P = ev.rig.rd.P; G.R.bloodPool(ev, (P[0].x + P[3].x) / 2, (P[0].z + P[3].z) / 2, 1.1 + Math.random() * 0.4, 30, Math.min(P[0].y, P[3].y) - 0.2); }
      }
      // aim pitch toward whoever they're engaging
      let pitch = 0;
      const aimed = ev.aim === G.Net.myId ? G.Me.pos : ev.aim && this.players.get(ev.aim) ? this.players.get(ev.aim)!.pos : null;
      const tgt = aimed || (ev.alert ? this.nearestPlayer(ev.pos) : null);
      if (tgt) pitch = Math.atan2(tgt.y + 1.2 - (ev.pos.y + 1.4 * ev.def.scale), Math.max(1, Math.hypot(tgt.x - ev.pos.x, tgt.z - ev.pos.z))); // (from their own height: upstairs, level)
      ev.recPitch = pitch; // (for the highlights: js/highlights.ts)
      let pose: VwPose | null = ev.scode === 1 ? 'handsup' : ev.scode === 2 ? 'cuffed' : ev.scode === 3 ? 'cower' : null;
      // being taken down and zip-tied by an officer (me or a teammate)
      let tk = -1;
      const ma = G.Me.action;
      if (ma && ma.kind === 'zip' && ma.target === ev.id) tk = ma.t / ma.dur;
      for (const pv of this.players.values()) if (pv.st && pv.st.act === 'z' && pv.st.zt === ev.id) tk = pv.st.ap || 0;
      ev.recTk = tk; // (for the highlights: js/highlights.ts)
      const tied = ev.scode === 2 || ev.arrested;
      // (dead, or down for good: limp, turned over and the wrists put behind the back as a body is)
      const limp = !ev.alive || ev.down;
      if (limp && !ev.bodySecured && (!ev.def.civ || ev.alive)) ev.rig.secure(tk); // turned over and wrists behind the back
      if (ev.alive && !limp && !tied && tk >= 0) { pose = 'takedown'; ev.rig.zip(tk > 0.8); }
      else if (ev.alive && ev.rig.zipped !== tied) ev.rig.zip(tied as boolean); // let go before the tie was done (or tied, limp)
      if (ev.arrested && ev.scode !== 2) pose = 'cuffed'; // the arrest message can beat the next snapshot
      let act: VwAct | null = null;
      if (ev.alive && ev.doorT != null && ev.doorT < 0.6) { ev.doorT += dt; act = { kind: 'open', t: Math.min(1, ev.doorT / 0.5), hand: ev.rig.gun && !ev.rig.slung ? 'L' : 'R' }; }
      // Lying prone (restrained, or being taken down), a body stretches about 1.85 m ahead of the feet: with a
      // wall closer than that, it's drawn slid back from it (as far as the room behind allows) instead of
      // lying through it.
      let at = ev.pos;
      // Leaning out round a corner, the body really is out at the lean point (where the host shoots from: 0.55 m
      // to the side), not tilting from behind the edge (eased in and out with the lean itself)
      const leanTo = ev.alive ? ev.lean : 0;
      ev.leanS = (ev.leanS || 0) + (leanTo - (ev.leanS || 0)) * Math.min(1, dt * (Math.abs(leanTo) > Math.abs(ev.leanS || 0) ? 3.5 : 7)); // (out slowly, the Server's PEEK.UP; back quickly)
      if (Math.abs(ev.leanS) > 0.01) {
        at = ev.pos.clone().add(new THREE.Vector3(Math.cos(ev.yaw), 0, -Math.sin(ev.yaw)).multiplyScalar(ev.leanS * 0.45 * (ev.def.scale || 1)));
        // (the lean point is checked for sight, not for room: by a wall's corner the body would be drawn into it, so it leans only as far as the wall allows)
        const lm = G.Game.map; if (lm && lm.world) G.Level.resolve(lm, at, 0.22 * (ev.def.scale || 1), at.y, G.World.STEP, true);
      }
      if (ev.alive && (pose === 'cuffed' || pose === 'takedown')) {
        const key = `${ev.pos.x.toFixed(2)},${ev.pos.z.toFixed(2)},${ev.yaw.toFixed(2)}`;
        if (ev.proneKey !== key) {
          ev.proneKey = key;
          const fx = -Math.sin(ev.yaw), fz = -Math.cos(ev.yaw), need = 1.85 * ev.def.scale;
          const ahead = L.raycast(map!, ev.pos.x, 0.3, ev.pos.z, fx, 0, fz, need + 0.2).t, behind = L.raycast(map!, ev.pos.x, 0.3, ev.pos.z, -fx, 0, -fz, need).t;
          const back = Math.max(0, Math.min(need + 0.15 - ahead, behind - 0.3));
          ev.proneShift = back > 0.01 ? new THREE.Vector3(-fx * back, 0, -fz * back) : null;
        }
        if (ev.proneShift) at = ev.pos.clone().add(ev.proneShift);
      }
      // (the body's physics only near you: farther off they're animated, which no one can tell apart; but one you've
      // hit in the last 8 s is yours to watch wherever it is, so a long shot's hits rock it and it falls from where they
      // left it: the recording of its fall, js/highlights.ts, is yours)
      const near = ev.pos.distanceToSquared(G.R.camera.position) < 40 * 40 || (ev.engagedT && performance.now() - ev.engagedT < 8000);
      if (ev.down && ev.alive) ev.rig.goLimp(); // (down for good: a limp body, bleeding out)
      // (what they're aiming at: a weakened or downed suspect points the gun at it from the hand, js/rig.ts)
      const aimAt = tgt && ev.armed === 2 && ev.alert && !ev.surp && !ev.reloading && !pose && !ev.down ? new THREE.Vector3(tgt.x, tgt.y + 1.2, tgt.z) : null;
      const rlP = ev.reloadAt && ev.reloading ? (performance.now() - ev.reloadAt) / ev.reloadDur : -1; // (how far into a magazine change)
      ev.aimP = aimed ? aimAt : null; // (who they're on: where their light and laser go)
      ev.rig.update(dt, { feet: ev.alive && !ev.down ? (ev.feet ||= G.Footsteps.feetOf(ev.def, ev.id, ev.armed === 2, ev.rig.shoe)) : undefined, pos: at, yaw: ev.yaw, pitch, crouch: ev.crouch || (ev.str != null && ev.str < 0.4), rise: 3.5, alert: !!ev.alert && ev.armed === 2 && !ev.surp && !ev.reloading, lean: ev.leanS, pose, radio: ev.radio && ev.alive && !ev.down, blind: ev.alive && !ev.down && ev.scode !== 1 && ev.scode !== 2 && !ev.arrested ? ev.fc || 0 : 0, tk, act, str: near ? (ev.str == null ? 1 : ev.str) : null, aimAt,
        reload: rlP >= 0 && rlP < 1 ? rlP : -1 });
      // past the fog (it's the background's colour out there: nothing to see) they aren't drawn, each one's forty-odd
      // pieces a draw call. The body, not the root: the root's what a shot checks for (js/player.ts), and it still hits.
      // Nor behind a wall, floor or ceiling (furniture, doors, glass, rails and stairs don't count: you might see them
      // round, over or through it).
      const fog = G.R.scene.fog, cam = G.R.camera;
      if (fog) {
        const e = cam.matrixWorld.elements, depth = -((at.x - e[12]) * e[8] + (at.y - e[13]) * e[9] + (at.z - e[14]) * e[10]); // (along the view, as the fog's reckoned)
        // (through a magnified scope the fog's stretched in its picture, js/render.ts scopeReach: they're drawn out to there)
        const pip = G.R.vm && G.R.vm.visible && G.R.vm.userData.pip, sk = pip && (G.R.pipLive || 0) > 0.35 ? G.R.scopeReach(pip.mag).k : 1;
        ev.rig.body.visible = depth < (fog as THREE.Fog).far * sk + 2.5 && this.inSight(ev.rig, at);
      }
      // bleeding: drips falling from them as they go; down for good, from the body where it lies (its ragdoll's hips,
      // not where they last stood)
      if (ev.alive && ev.bleed && !(ev.wnd && ev.wnd.length) && (ev.dripT = (ev.dripT || 0) - dt) <= 0) {
        ev.dripT = 0.25 + Math.random() * 0.35;
        const lying = ev.rig.limp, b = lying ? G.Rig.bodyAt(ev.rig) : ev.pos;
        G.R.particles(new THREE.Vector3(b.x + (Math.random() - 0.5) * (lying ? 0.2 : 0.3), lying ? b.y + 0.05 : (ev.crouch ? 0.6 : 0.9) * ev.def.scale, b.z + (Math.random() - 0.5) * (lying ? 0.2 : 0.3)), 2, 0x7a0808, 0.3, lying ? 0.3 : 0.7, 9, 0.2, null, true);
      }
    }

    this.woundStreams(dt);
    // your own body, if you're dead: a ragdoll where you fell
    if (this.selfBody) { const sb = this.selfBody; sb.rig.update(dt, { pos: sb.pos, yaw: sb.yaw, pitch: 0, crouch: false, alert: false, lean: 0, state: 'dead' }); }
    // remote players
    for (const pv of this.players.values()) {
      if (!pv.st) { pv.rig.root.visible = false; continue; }
      const st = pv.st;
      // dead: a ragdoll where they fell, staying there; alive again (a new level): a whole body
      if (st.dd) {
        pv.rig.root.visible = true;
        if (!pv.dead) { pv.dead = true; pv.rig.holster(false); pv.rig.die(null); G.R.impact(new THREE.Vector3(pv.pos.x, pv.pos.y + 1.2, pv.pos.z), null, 'blood'); }
        pv.rig.update(dt, { pos: pv.pos, yaw: pv.yaw, pitch: 0, crouch: false, alert: false, lean: 0, state: 'dead' });
        continue;
      }
      if (pv.dead) this.resetPlayerRig(pv);
      pv.rig.root.visible = true;
      pv.pos.lerp(new THREE.Vector3(st.p[0], st.p[1], st.p[2]), Math.min(1, dt * 14));
      pv.yaw += G.U.angDiff(pv.yaw, st.yw) * Math.min(1, dt * 14);
      pv.pitch += (st.pt - pv.pitch) * Math.min(1, dt * 14);
      pv.rig.setGun(st.w, G.Stickers.of(st.sk)); // their build code: the same parts on their gun (and its stickers, by their hash: js/stickers.ts)
      pv.rig.holster(!!st.sw, true); // hands busy: weapon away (by hand, not in a jump)
      const act: VwAct | null = st.act && !st.dn && !st.dd ? { kind: ({ o: 'open', c: 'close', k: 'kick', z: 'zip', b: 'bag' } as Record<string, VwActKind>)[st.act], t: st.ap || 0, hand: 'R' } : null;
      if (act && act.kind === 'zip') { const tv = this.enemies.get(st.zt); if (tv) act.pt = this.zipPoint(tv, act.t, tv.alive && !tv.down); act.pull = !!st.pl; }
      // their restraining / bagging sounds, as they reach each step
      if (act && pv.lastAct === st.act) G.Audio.foley(act.kind, pv.lastAp || 0, act.t, pv.pos.distanceTo(G.R.camera.position));
      pv.lastAct = st.act; pv.lastAp = act ? act.t : 0;
      if (st.ra != null && st.ra >= 0 && !(pv.lastRa >= 0) && !st.sw) { const rdef = G.Gunsmith.fromCode(st.w), rp = pv.pos.clone().setY(pv.pos.y + 1.3); (rdef && G.Handling.play(rdef, G.Handling.rackClip(rdef, rdef.manual ? G.Me.MANUAL_T : 0.45), { land: G.Handling.LAND.rack, vol: 0.7, pos: rp })) || G.Audio.sampleAt('rack_slide', rp, 0.7, rdef && rdef.manual ? G.Me.MANUAL_PITCH : 1); } // (their bolt / pump / lever worked: heard from where they stand)
      pv.lastRa = st.ra == null ? -1 : st.ra;
      const kneel = (st.act === 'z' && (st.ap || 0) > 0.3) || st.act === 'b';
      const hold = st.hk ? { kind: st.hk === 2 ? 'flash' : st.hk === 3 ? 'tb' : 'frag', cock: !!st.hc, str: st.hs == null ? 2 : st.hs } : null; // (a grenade in their hand)
      pv.rig.update(dt, { feet: st.dn || st.dd ? undefined : { sole: 'boot', kit: 'heavy', careful: !!st.sd, low: !!st.lr }, pos: pv.pos, yaw: pv.yaw, pitch: pv.pitch, crouch: (!!st.cr || kneel) && !st.dn, prone: !!st.pr, bipod: !!st.bp, climb: st.cl ? G.Level.ladderAt(G.Game.map, pv.pos.x, pv.pos.z) : null, zip: !!st.zp, aim: !!st.ad, alert: !st.lr && !st.sw, atak: !!st.mn, lean: st.ln || 0, state: st.dn ? 'down' : 'alive', act,
        hold, rack: st.ra == null ? -1 : st.ra, reload: st.rl == null ? -1 : st.rl, loaded: st.ld == null ? null : !!st.ld, nomag: !!st.nm, inspect: st.in == null ? -1 : st.in, magChk: st.mc == null ? -1 : st.mc });
      if (pv.tag) pv.tag.position.y = st.dn ? 0.8 : st.cr ? 1.7 : 2.15;
    }

    // marksman lasers
    G.R.beginLasers();
    let aimedAtMe = false;
    for (const ev of this.enemies.values()) {
      if (!ev.alive || !ev.aim || !ev.rig.gun || ev.rig.slung) continue;
      const a = ev.rig.head.localToWorld(new THREE.Vector3(0, 0.08, -0.12));
      let b;
      if (ev.aim === G.Net.myId) { b = G.R.camera.position.clone(); b.y -= 0.25; aimedAtMe = true; }
      else { const pv = this.players.get(ev.aim); if (!pv) continue; b = pv.pos.clone(); b.y += 1.3; }
      if (!(ev.tac & 2)) G.R.laser(a, b); // (one on their gun shows for itself, below)
    }
    G.R.endLasers();
    this.laserBeep -= dt;
    if (aimedAtMe && this.laserBeep <= 0) { G.Audio.laser(); this.laserBeep = 0.25; }
    G.HUD.sniperWarn(aimedAtMe);

    // weapon lights and lasers: yours (from the gun in your hands, along its bore) and your squad's (flags in
    // their state: 1 light, 2 laser, 4 the laser's green, 8 a bright light)
    G.R.tacBegin(); G.Glare.begin();
    const me = G.Me, mw = G.Game.phase === 'level' && me.cur ? me.cur() : null, mf = mw && !me.dead ? me.tacFlags(mw) : 0;
    if (mf) {
      // the gun points them, always: along its barrel as you see it (sway, bob, a turn's lag, the kick: the dot goes
      // with it), drawn from the gun in your hands. With the gun up that line runs from your eye (where the rounds
      // start: held steady, the barrel and the bore agree, so the dot is where they go); with the gun off the line
      // (lowered, coming up, mid-reload) from its muzzle.
      let dir = me.boreDir(), from = G.R.camera.position.clone(), gun = null;
      const vm = G.R.vm, fl = vm && vm.userData.flash;
      if (fl) {
        G.R.vmHolder.updateMatrixWorld(true);
        gun = fl.getWorldPosition(new THREE.Vector3());
        const axis = new THREE.Vector3(0, 0, -1).transformDirection(fl.parent.matrixWorld); // (the barrel: -z in its holder)
        const off = THREE.MathUtils.smoothstep(Math.acos(G.U.clamp(axis.dot(dir), -1, 1)), 0.03, 0.12); // (~2° to 7° off)
        dir = axis; if (off > 0) from.lerp(gun, off);
      }
      this.tacBeam(from, dir, mf, null, gun);
    }
    for (const [id, pv] of this.players) {
      const st = pv.st;
      if (!st || !st.tl || st.dd || st.sw || !pv.rig.root.visible) continue;
      const cp = Math.cos(pv.pitch);
      let dir = new THREE.Vector3(-Math.sin(pv.yaw) * cp, Math.sin(pv.pitch), -Math.cos(pv.yaw) * cp);
      if (st.lr && pv.rig.gun) { pv.rig.gun.updateMatrixWorld(true); dir = new THREE.Vector3(0, 0, -1).transformDirection(pv.rig.gun.matrixWorld); } // (lowered: where the gun points)
      const gi = pv.rig.gunInfo, from = pv.rig.gun && gi ? pv.rig.gun.localToWorld(new THREE.Vector3(gi.muzzles[0][2], gi.muzzles[0][1], -gi.muzzles[0][0])) : pv.pos.clone().add(new THREE.Vector3(0, 1.4, 0)).addScaledVector(dir, 0.5);
      this.tacBeam(from, dir, st.tl, id);
    }
    // and suspects': the light's on with the gun out, the laser once they're alert; the nearest get what's left of the pool
    const tac: [number, VwEnemy, number][] = [];
    if (G.Game.phase === 'level') for (const ev of this.enemies.values()) {
      if (!ev.tac || !ev.alive || ev.down || ev.scode || !ev.rig.gun || ev.rig.slung) continue;
      const d = ev.pos.distanceToSquared(G.R.camera.position), f = ev.tac & (ev.alert ? 15 : 9);
      if (f && d < 2500) tac.push([d, ev, f]);
    }
    tac.sort((a, b) => a[0] - b[0]);
    for (const [, ev, f] of tac) {
      const gun = ev.rig.gun!, gi = ev.rig.gunInfo!; gun.updateMatrixWorld(true);
      const from = gun.localToWorld(new THREE.Vector3(gi.muzzles[0][2], gi.muzzles[0][1], -gi.muzzles[0][0])), dir = ev.aimP ? ev.aimP.clone().sub(from).normalize() : new THREE.Vector3(0, 0, -1).transformDirection(gun.matrixWorld);
      this.tacBeam(from, dir, f, 'e' + ev.id, null, ev);
    }
    G.R.tacEnd(); G.Glare.end(dt);

    // first aid cabinet doors swinging open
    const cabV: VwCabView[] | null = G.Game.map && G.Game.map.cabViews;
    if (cabV) cabV.forEach((cv, i) => {
      const want = G.Game.cabs && G.Game.cabs[i] && G.Game.cabs[i][0] ? 1 : 0;
      if (want && cv.open === 0) { const c = G.Game.map!.cabinets[i]; G.Audio.clink(Math.hypot(c.x - G.R.camera.position.x, c.z - G.R.camera.position.z)); }
      cv.open = want ? Math.min(1, cv.open + dt / 0.5) : 0;
      cv.door.rotation.y = -1.9 * (1 - Math.pow(1 - cv.open, 3));
    });
    // the sticker box: its sticker on the card (once the host's said which), the lid up and the card gone once it's taken
    const sv: VwSboxView | null = G.Game.map && G.Game.map.sboxView;
    if (sv) {
      const sb = G.Game.sbox, name = sb && sb[0], taken = !!(sb && sb[1]);
      if (!sv.synced) { sv.synced = true; if (taken) sv.open = 1; } // (joined with it opened)
      sv.g.visible = !!name;
      if (name && sv.name !== name) {
        const p = G.Stickers.pic(name);
        if (p.bm) { sv.name = name; const k = 0.12 / Math.max(p.w, p.h); sv.card.scale.set(p.w * k, p.h * k, 1); sv.card.material.map = G.Stickers.material(name).map; sv.card.material.needsUpdate = true; }
      }
      sv.card.visible = sv.name === name && !taken;
      if (taken && sv.open === 0) { const b = G.Game.map!.sbox; G.Audio.clink(Math.hypot(b.x - G.R.camera.position.x, b.z - G.R.camera.position.z)); }
      sv.open = taken ? Math.min(1, sv.open + dt / 0.5) : 0;
      sv.lid.rotation.x = -1.8 * (1 - Math.pow(1 - sv.open, 3));
    }
    // the attachments box lid: up and back on its hinge once it's been opened
    const av: VwAboxView | null = G.Game.map && G.Game.map.aboxView;
    if (av) {
      const want = G.Game.abox && G.Game.abox[0] ? 1 : 0;
      if (!av.synced) { av.synced = true; if (want) av.open = 1; } // (joined with it already open)
      if (want && av.open === 0) { const ab = G.Game.map!.abox; G.Audio.clink(Math.hypot(ab.x - G.R.camera.position.x, ab.z - G.R.camera.position.z)); }
      av.open = want ? Math.min(1, av.open + dt / 0.6) : 0;
      av.lid.rotation.x = -1.9 * (1 - Math.pow(1 - av.open, 3));
      // its lights: one for each of the squad, lit in their colour till they've had their pick, then dark
      const ids = Object.keys(G.Game.roster || {}).sort(), uses = (G.Game.abox && G.Game.abox[1]) || {};
      const key = ids.map((id) => `${id}:${(G.Game.roster[id] || {}).color}:${uses[id] && uses[id][1] ? 1 : 0}`).join('|');
      if (key !== av.key) {
        av.key = key;
        for (const c of av.lights.children as THREE.Mesh<THREE.BufferGeometry, THREE.Material>[]) { c.geometry.dispose(); c.material.dispose(); }
        av.lights.clear();
        const gap = Math.min(0.05, 0.24 / Math.max(1, ids.length));
        ids.forEach((id, i) => {
          const used = uses[id] && uses[id][1], x = (i - (ids.length - 1) / 2) * gap;
          const bezel = new THREE.Mesh(new THREE.BoxGeometry(Math.min(0.04, gap - 0.006), 0.03, 0.004), new THREE.MeshStandardMaterial({ color: 0x0c0c0c, roughness: 0.6 }));
          bezel.position.set(x, 0, 0);
          const lens = new THREE.Mesh(new THREE.BoxGeometry(Math.min(0.032, gap - 0.014), 0.022, 0.004), new THREE.MeshBasicMaterial({ color: used ? 0x1c1c1c : (G.Game.roster[id] || {}).color || 0x44ff66 }));
          lens.position.set(x, 0, 0.002);
          av.lights.add(bezel, lens);
        });
      }
    }
    // the weapon case lid: latches clack, then it swings up and back against the wall
    const cv: VwLid | null = G.Game.map && G.Game.map.caseView;
    if (cv) {
      const want = G.Game.caseOpen ? 1 : 0;
      if (want && cv.open === 0) { const mc = G.Game.map!.case; G.Audio.clink(Math.hypot(mc.x - G.R.camera.position.x, mc.z - G.R.camera.position.z)); }
      cv.open = want ? Math.min(1, cv.open + dt / 0.8) : 0;
      cv.lid.rotation.x = -1.78 * (1 - Math.pow(1 - cv.open, 3));
    }

    // evidence outline: on while any weapon is still to be bagged, gently pulsing
    let glowing = false;
    for (const v of this.evidence.values()) if (!v.secured && v.mesh.visible) { glowing = true; break; }
    G.R.hasGlow = glowing || !!this._haloOn;
    if (this._haloMats) for (const m of this._haloMats.bands) m.uniforms.opacity.value = m.userData.base;
    if (G.R.hasGlow) this._outRes!.value.set(window.innerWidth, window.innerHeight);
    if (glowing && this._outline) {
      const p = 0.5 + 0.5 * Math.sin(performance.now() / 300);
      for (const m of this._outline.bands) m.uniforms.opacity.value = m.userData.base * (0.7 + 0.3 * p);
    }

    // evidence being bagged: picked up off the floor and slid into an envelope (mine is drawn in first person)
    for (const [i, v] of this.evidence) {
      if (v.secured) continue;
      let t = -1, who: 'me' | VwPlayer | null = null;
      const ma = G.Me.action;
      if (ma && ma.kind === 'bag' && ma.target === i) { t = ma.t / ma.dur; who = 'me'; }
      for (const pv of this.players.values()) if (pv.st && pv.st.act === 'b' && pv.st.bt === i) { t = pv.st.ap || 0; who = pv; }
      const m = v.mesh;
      m.position.set(v.x, (v.y || 0) + 0.05, v.z); m.scale.setScalar(1); m.visible = true; // (on its own floor)
      if (who === 'me') m.visible = t < 0.22;
      else if (who) {
        const ph = G.U.bagPhases(t), gone = ph.insert;
        m.position.lerp(who.rig.armR.tie.getWorldPosition(new THREE.Vector3()), ph.lift);
        m.scale.setScalar(Math.max(0.02, 1 - gone));
        m.visible = gone < 0.98;
      }
    }

    // grenades
    for (const n of [...this.nades]) {
      const p = n.pos, was = p.clone();
      this.nadeStep(n, dt, map);
      // rolling: turned about the axis across its travel, as far as it's rolled
      const dx = p.x - was.x, dz = p.z - was.z, roll = Math.hypot(dx, dz);
      if (roll > 1e-4 && n.onGround) n.mesh.rotateOnWorldAxis(new THREE.Vector3(dz / roll, 0, -dx / roll), roll / this.NADE_R);
      n.mesh.position.copy(p);
      n.fuse -= dt;
      n.mesh.material.emissive.setHex(Math.floor(n.fuse * 8) % 2 ? 0xff2200 : 0x220000);
      if (n.fuse <= 0) {
        if ((n.kind === 'flash' || n.kind === 'tb') && !n.own) { G.R.dynRoot.remove(n.mesh); this.nades.splice(this.nades.indexOf(n), 1); continue; } // (someone else's: its bang comes from the host)
        G.R.dynRoot.remove(n.mesh);
        this.nades.splice(this.nades.indexOf(n), 1);
        // (a frag or a thermobaric goes off where it is: at its own middle, NADE_R off whatever it's lying on, so its downward chips meet
        // that floor a hand's breadth out and its blast is a surface burst's: js/player.ts blastR. A flashbang's flash a little above it.)
        if (n.own && n.kind === 'flash') G.Me.flashBang(p.clone().add(new THREE.Vector3(0, 0.1, 0)));
        else if (n.own && n.kind === 'tb') G.Me.thermobaric(p.clone());
        else if (n.own) G.Me.explode(p.clone(), G.Me.blastR(map, p), G.Me.BLAST.dmg, true);
        else if (n.enemy && G.Net.isHost) G.Net.toHost({ t: 'eboom', p: [p.x, p.y, p.z] }); // (a suspect's: where it went off on the host's screen is where it goes off, js/server.ts enemyBoom)
      }
    }

    // warn about any live grenade nearby (yours hurt too)
    let near = null, nd = 7;
    if (G.Me.pos && !G.Me.dead) for (const n of this.nades) { const d = n.pos.distanceTo(G.Me.pos); if (d < nd) { nd = d; near = n; } }
    G.HUD.nadeWarn(near);

    for (const pg of this.pings) pg.t -= dt;
    this.pings = this.pings.filter((pg: { t: number }) => pg.t > 0);
  },
};
G.Views = G_Views;
interface GameModules { Views: typeof G_Views; }
