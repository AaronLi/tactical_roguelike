'use strict';
import { ReplayEnv } from './replayenv.js';
import { Prof } from './profiler.js';
import { Audio } from './audio.js';
import { Ballistics } from './ballistics.js';
import { Bolts } from './bolts.js';
import { Callsigns } from './callsigns.js';
import { Damage } from './damage.js';
import { AMMO, ballFor, calOf, CLASS_SND, dragOf, ENEMIES, roundSpec, roundSpeed, shotK, shotSoundKey, SUPPRESSOR, volleyVol, WEAPONS } from './data.js';
import { Footsteps } from './footsteps.js';
import { Glare } from './glare.js';
import { GunAudio } from './gunaudio.js';
import { GunSounds } from './gunsounds.js';
import { GunModels } from './gunmodels.js';
import { Handling } from './handling.js';
import { Level } from './level.js';
import { LevelView } from './levelview.js';
import { Gunsmith } from './parts.js';
import { Rig as G_Rig } from './rig.js';
import { Sim } from './sim.js';
import { Stickers } from './stickers.js';
import { Hooks, U } from './util.js';
import { World } from './world.js';
import { Casings } from './casings.js';
import { Highlights } from './highlights.js';
import { HUD } from './hud.js';
import { R } from './render.js';
import { Net } from './net.js';
import { Game } from './game.js';
import { Me } from './player.js';
import { InvUI } from './invui.js';
const WP = new THREE.Vector3(), WD = new THREE.Vector3(); // (a wound's place and direction: woundStreams)
interface VwEvidence { mesh: THREE.Object3D; wpn: string; x: number; y: number; z: number; secured?: boolean; [k: string]: any }
interface VwNade extends VwNadeMotion { fuse: number; own: boolean; enemy: boolean; mesh: THREE.Mesh<THREE.BufferGeometry, THREE.MeshLambertMaterial>; kind: VwNadeKind; nid?: number; from?: string; flyT?: number; stuck?: { rig?: Rig; bone?: THREE.Object3D | null; l?: THREE.Vector3; me?: THREE.Vector3 } | null } // (nid, from: a sticky's, so where it held can be told: 'stk')
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
type VwNadeKind = 'frag' | 'flash' | 'tb' | 'sticky'; // (sticky: holds to what it hits first: stickStep)
interface VwAboxView extends VwLid { key: string | null; lights: THREE.Group }
interface VwSboxView extends VwLid { name: string | null; card: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial> }
// (whether a body at p is in the camera's view: the view's frustum worked out once a frame)
const _pf = { f: new THREE.Frustum(), m: new THREE.Matrix4(), at: -1, s: new THREE.Sphere(new THREE.Vector3(), 1.4) };
function inView(p: { x: number; y: number; z: number }) {
  const cam = R.camera, fr = R.renderer ? R.renderer.info.render.frame : 0;
  if (_pf.at !== fr) { _pf.at = fr; cam.updateMatrixWorld(); _pf.f.setFromProjectionMatrix(_pf.m.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse)); }
  _pf.s.center.set(p.x, p.y + 0.9, p.z); return _pf.f.intersectsSphere(_pf.s);
}
export const Views = {
  players: new Map<string, VwPlayer>(),
  enemies: new Map<number, VwEnemy>(),
  nades: [] as VwNade[],
  pings: [] as { x: number; z: number; t: number }[],
  shieldDrops: [] as THREE.Object3D[], // (shields let go of, lying where they fell: dropShield)
  evidence: new Map<number, VwEvidence>(), // id -> { mesh, wpn, x, z }
  // what's outlined in yellow (addOutline) and on show while it's in the scene: keycards on a ship's floor (js/space.ts cards).
  // While anything here is, the frame has the outline's two passes (R.render hasGlow); weapons on the floor aren't outlined
  glow: new Set<THREE.Object3D>(),
  laserBeep: 0,
  // made as it goes: the shaders compiled for the level (js/game.ts), the occlusion test's scratch vector and filter, your own body when you're dead,
  // the rounds in flight, the pings by player, the evidence outline's and the halo's materials (and their shared resolution, and smoothed geometry),
  // the evidence envelope's, the suspects' light housing, the drip timer
  warmed: undefined as boolean | undefined,
  _invWarm: null as unknown, // (the level the Tab screen was last drawn ahead for: applySnap)
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

  removeRig(rig: Rig) { R.dynRoot.remove(rig.root); rig.dispose(); },
  // Could any of them be in view from the camera: a look at their middle, head, feet and both sides (where the body is
  // drawn: the hips, wherever a fall's taken them), stopped only by walls, floors and ceilings. A look that starts in
  // one (the camera pressed to a wall) starts again past it.
  inSight(rig: Rig, at: THREE.Vector3) {
    const map = Game.map, w = map && map.world, c = R.camera.position;
    if (!w) return true;
    const hp = rig.hips.getWorldPosition(this._sp || (this._sp = new THREE.Vector3())), y = at.y;
    if (Math.hypot(hp.x - c.x, hp.z - c.z) < 2.5) return true;
    const skip = this._occ || (this._occ = (s: { kind: string }) => s.kind !== 'wall' && s.kind !== 'floor' && s.kind !== 'ceil' && s.kind !== 'lintel');
    const sx = -(hp.z - c.z), sz = hp.x - c.x, sl = Math.hypot(sx, sz) || 1; // (across the view)
    for (const [a, h] of [[0, 0.9], [0, 1.6], [0, 0.15], [-0.45, 1.0], [0.45, 1.0], [-0.45, 1.5], [0.45, 1.5]]) {
      const tx = hp.x + (sx / sl) * a, ty = y + h, tz = hp.z + (sz / sl) * a;
      let dx = tx - c.x, dy = ty - c.y, dz = tz - c.z;
      const d = Math.hypot(dx, dy, dz); dx /= d; dy /= d; dz /= d;
      let r = World.raycast(w, c.x, c.y, c.z, dx, dy, dz, d, { skip });
      if (r.t < 0.3) r = World.raycast(w, c.x + dx * 0.3, c.y + dy * 0.3, c.z + dz * 0.3, dx, dy, dz, d - 0.3, { skip }), r.t += 0.3;
      if (r.t >= d - 0.05) return true;
    }
    return Damage.seenThrough(map as unknown as Parameters<typeof Damage.seenThrough>[0], c, hp); // (or down a hole shot through the wall)
  },
  // an officer's body: dressed as they picked, kit from their state (st.kt)
  newPlayerRig(info: { color: number; animal: string; name: string; look: any }, id: string) {
    const rig = G_Rig.create({ style: 'tactical', color: info.color, animal: info.animal, callName: info.name, seed: id.length * 977, bare: true, look: info.look });
    rig.root.visible = false;
    R.dynRoot.add(rig.root);
    return rig;
  },
  // Your own body when you die: you don't have one in first person, so one is made, dressed as you are, and falls where you
  // were (what a teammate sees on their screen; now you see it too, from the camera on theirs)
  spawnSelfBody() {
    this.clearSelfBody();
    const me = Me, g = Game, wasDown = !!me.down;
    const rig = this.newPlayerRig({ color: g.myColor, animal: g.myAnimal, name: g.myName, look: g.myLook }, Net.myId || 'me');
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
    Casings.clear();
    Bolts.clear();
    if (this.pings2) { for (const q of this.pings2.values()) { R.dynRoot.remove(q.s); q.s.material.map!.dispose(); q.s.material.dispose(); } this.pings2.clear(); }
    for (const ev of this.enemies.values()) this.removeRig(ev.rig);
    this.enemies.clear();
    for (const n of this.nades) R.dynRoot.remove(n.mesh);
    this.nades = [];
    this.pings = [];
    for (const v of this.evidence.values()) R.dynRoot.remove(v.mesh);
    this.evidence.clear();
    for (const g of this.shieldDrops) g.removeFromParent();
    this.shieldDrops = [];
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
      if (id === Net.myId) continue;
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

  slowFill: false, // (a level come up with from outside, with no veil: its people are made a few a snapshot, not all in one frame. js/game.ts enterLevel)
  applySnap(m: any) {
    const fillT = performance.now();
    if (this._invWarm !== Game.map) { this._invWarm = Game.map; setTimeout(() => InvUI.warm(), 30); } // (the Tab screen's pictures, once a level however it came up: InvUI.warm)
    if (!this.warmed) { this.warmed = true; Game.veilSay('Compiling shaders'); setTimeout(() => R.warmup(() => GunSounds.hold((t) => Game.veilSay(t)).then(() => { Game.veilN = Game.VEIL_SMOOTH; Game.veilWait = 0; })), 60); } // (compile everything once the level's full, then a few frames drawn and the veil lifts: js/game.ts veil. The wait: time to draw that line first)
    const seen = new Set<number>();
    for (const [id, type, x, z, yaw, hp, aim, alert, crouch, lean, armed, scode, surp, door, kit, fl, str, y = 0, wd, fc = 0, rd = 0] of m.e) {
      seen.add(id);
      let ev = this.enemies.get(id);
      if (!ev) {
        if (!(ENEMIES as Record<string, any>)[type]) continue;
        if (this.slowFill && performance.now() - fillT > 4) continue;
        // the type, with this suspect's kit (weapon | vest | helmet | face | tac | what's mounted) laid over it
        const def = Object.create((ENEMIES as Record<string, any>)[type]);
        if (kit) { const [wpn, vest, helmet, face, tac, ex, , shield, wear] = kit.split('|'); def.wpn = wpn; if (wear) def.wear = wear; /* (their own side's clothes: a pirate boarding a liner isn't in her security's) */ def.vest = vest; def.helmet = helmet; def.face = face || 0; def.tac = +tac || 0; def.ex = ex ? ex.split(',') : []; def.shield = shield || null; }
        const rig = G_Rig.create(Object.assign({ style: def.style, scale: def.scale, boss: !!def.boss, leader: !!def.leader, seed: id * 7919 + 13, dressed: true }, def.wear ? { wear: def.wear } : null));
        rig.powered = true; // a physically simulated body, held up by its muscles (js/rig.ts powerStep)
        if (!def.civ) rig.setKit(G_Rig.armourKit(def.vest, def.helmet, def.style === 'armored', def.face, def.ex)); // their armour, as an officer's would look
        if (def.wpn && armed) { rig.setGun(def.wpn); rig.holster(armed === 1); this.tacOnGun(rig, def.tac); }
        if (def.shield && armed && !(scode >= 1 && scode <= 3) && !(fl & 8)) rig.setShield(def.shield); // (a handheld shield, js/data.ts SHIELDS)
        R.dynRoot.add(rig.root);
        ev = { id, type, def, rig, tac: def.tac || 0, pos: new THREE.Vector3(x, y, z), tgt: new THREE.Vector3(x, y, z), yaw, tgtYaw: yaw, hp, alive: true, deadT: 0, lean: 0 };
        this.enemies.set(id, ev);
      }
      // what they're called aboard her (js/server.ts titleOf: by whose ship it is and where they stand in her), as it changes
      if (kit && typeof kit === 'string') { const t = kit.split('|')[6]; if (t && ev.def.name !== t) ev.def.name = t; }
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
      if (ev.rig.shield && (!armed || (scode >= 1 && scode <= 3) || (fl & 8))) this.dropShield(ev); // (given up, cowering, down: it's let go)
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
      if (id === Net.myId) continue;
      const pv = this.players.get(id);
      if (!pv) continue;
      if (st.w && st.w !== (pv.st && pv.st.w)) GunSounds.acquireCode(st.w); // (another gun in their hands: its report ready before the first shot)
      pv.st = st;
      if (pv.first) { pv.pos.set(st.p[0], st.p[1], st.p[2]); pv.yaw = st.yw; pv.first = false; }
      if (st.kt) pv.rig.setKit(st.kt); // their helmet, carrier, belt, pack... as they're wearing them
    }
    Game.extract.active = !!m.x[0];
    Game.extract.votes = m.x[1] || 0; Game.extract.need = m.x[2] || 0; Game.extract.civDead = m.x[3] || 0;
    Game.extract.voted = (m.x[4] || []).includes(Net.myId);
    Game.unitsCleared = m.x[5] || 0;
    Game.enemiesLeft = m.n;
    Game.civsLeft = m.c || 0;
    Game.bodiesLeft = m.b || 0;
    Game.weaponsLeft = m.w || 0;
  },
  // world position of the closest living player (including you)
  nearestPlayer(p: THREE.Vector3) {
    let best: THREE.Vector3 | null = null, bd = 1e9;
    if (Me.pos && !Me.dead && !Me.down) { bd = Me.pos.distanceTo(p); best = Me.pos; }
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
      const killer = m.by && m.by !== Net.myId && this.players.get(m.by) ? this.players.get(m.by)!.pos : this.nearestPlayer(ev.pos);
      if (killer) dir = ev.pos.clone().sub(killer).setY(0).normalize();
    }
    ev.rig.die(dir);
    this.discardDrop(ev.rig);
    this.dropShield(ev);
    R.impact(new THREE.Vector3(ev.pos.x, 1.2 * ev.def.scale, ev.pos.z), null, 'blood');
  },

  dropShield(ev: VwEnemy) { const g = ev.rig.dropShield(); if (g) { R.dynRoot.add(g); this.shieldDrops.push(g); } },
  // evidence is drawn from the host's record; the rig's own falling gun is discarded so there's one copy
  addEvidence(i: number, wpn: string, x: number, z: number, y = 0) {
    if (this.evidence.has(i)) return;
    const mesh = GunModels.world(wpn);
    mesh.position.set(x, y + 0.05, z);
    mesh.rotation.set(0, Math.random() * Math.PI * 2, Math.PI / 2); // lying on its side
    R.dynRoot.add(mesh);
    this.evidence.set(i, { mesh, wpn, x, y, z });
  },
  // Outline: the gun's silhouette marks the stencil, then three shells pushed out along the surface normals
  // by a fixed number of pixels draw only outside it: a bright line fading out in two softer bands. Each band
  // draws a pixel once (it marks the stencil as it goes), so overlapping triangles don't stack up.
  // (blue: the halo on what F would take: Views.setHalo)
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
    if (mesh.userData.pending) GunModels.whenReady(mesh, () => { const n = shells.length; this.outlineInto(mesh, shells, blue); for (let i = n; i < shells.length; i++) shells[i].visible = blue ? this._haloOn === mesh : this._haloOn !== mesh; });
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
    const map = Game.map, cvs: VwCabView[] | null = map && map.cabViews, cabs = Game.cabs || [];
    if (!cvs) return;
    const COL: Record<string, number> = { bandage: 0xe8e2d0, pills: 0xe8c040, tourniquet: 0x2a2a2a, gauze: 0x4a7ab0, seal: 0xb03a3a, splint: 0xd27b4b, bloodbag: 0x7a0d12 };
    cvs.forEach((cv, i) => {
      const c = cabs[i], items = c ? c[1] : [];
      if (c && c[0] && cv.key === null) cv.open = 1; // joined with it already open
      cv.key = JSON.stringify(c || null);
      cv.slots.forEach((s, k) => { s.visible = k < items.length; if (s.visible) s.material.color.setHex(COL[items[k][0]] || 0xffffff); });
    });
  },
  // The weapon case's lid (what's in it is Loot's)
  syncCase() {
    const map = Game.map, cv: VwLid | null = map && map.caseView;
    if (!cv || cv.synced) return;
    cv.synced = true;
    if (Game.caseOpen) cv.open = 1; // joined with it already open
  },
  // a body that died before we joined: lay it out where it fell
  addBody(id: number, type: string, x: number, z: number, yaw: number, secured: number, y = 0, nm: string | null = null, wear: string | null = null) {
    if (this.enemies.has(id)) return;
    const def0 = (ENEMIES as Record<string, any>)[type];
    if (!def0) return;
    const def = Object.create(def0); // (their own: what they were called aboard her, nm, js/server.ts titleOf)
    if (nm) def.name = nm;
    if (wear) def.wear = wear;
    const rig = G_Rig.create(Object.assign({ style: def.style, scale: def.scale, boss: !!def.boss, leader: !!def.leader, seed: id * 7919 + 13, dressed: true }, wear ? { wear } : null)); // (dressed as their side was: a pirate's body aboard a liner isn't in her security's clothes)
    if (!def.civ) rig.setKit(G_Rig.armourKit(def.vest, def.helmet, def.style === 'armored'));
    R.dynRoot.add(rig.root);
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
    R.dynRoot.remove(v.mesh);
    v.mesh = this.envelopeMesh();
    v.mesh.position.set(v.x, (v.y || 0) + 0.008, v.z);
    v.mesh.rotation.y = Math.random() * Math.PI * 2;
    R.dynRoot.add(v.mesh);
    v.secured = true;
  },
  removeEvidence(i: number) {
    const v = this.evidence.get(i);
    if (!v) return;
    R.dynRoot.remove(v.mesh);
    this.evidence.delete(i);
  },
  // where an officer's hands are on someone being restrained: between the shoulder blades while they're
  // shoved down, then at the wrists (shared by first person, teammates' rigs and the camera)
  zipPoint(ev: VwEnemy, t: number, living: boolean) { return G_Rig.zipPoint(ev.rig, t, living); },
  discardDrop(rig: Rig) { if (rig.dropped) { if (rig.dropped.g.parent) rig.dropped.g.parent.remove(rig.dropped.g); rig.dropped = null; } },
  // A window breaking: the pane goes, a burst of glass falls both sides of it, and it's heard. at, dir: where
  // the round went through (optional)
  // A pane that's taken a round short of breaking: fractured right across from where it was hit (js/damage.ts crack), still up
  // (each of the first Level.CRACKS rounds fractures it; the next one brings it down: js/player.ts roundPane)
  crackGlass(id: number, at: THREE.Vector3, dir?: THREE.Vector3) {
    const map = Game.map, w = map && map.windows && map.windows[id];
    if (!w || w.broken || w.armor || (w.cracked || 0) >= Level.crackCap(w)) return;
    w.cracked = (w.cracked || 0) + 1; map.cracked = true;
    if (Highlights) Highlights.crack(id, at);
    Damage.crack(map.winMeshes && map.winMeshes[id] as THREE.Mesh, at);
    R.particles(at, 8, 0xd8eef5, 1.2, 0.8, 9, 0.7, dir ? [dir.x, 0, dir.z] : null);
    Audio.glass(Math.hypot(w.x - R.camera.position.x, w.z - R.camera.position.z) + 10); // (from the camera: on a helmet cam, what they hear)
  },
  breakGlass(id: number, at?: THREE.Vector3, dir?: THREE.Vector3) {
    const map = Game.map, w = map && map.windows && map.windows[id];
    if (!w || w.broken || w.armor) return; // (bulletproof glass doesn't break)
    w.broken = true;
    if (Highlights) Highlights.glass(id);
    World.windowSolids(map.world, map, w);
    const pane = map.winMeshes && map.winMeshes[id];
    if (pane) pane.visible = false;
    const Y = w.fy || 0, lo = w.door ? 0.25 : w.rail ? 0.1 : w.sill != null ? w.sill : Level.SILL, hi = w.door ? Level.DOOR_H - 0.1 : w.rail ? Level.RAIL_H - 0.05 : w.top != null ? w.top : Level.TOP; // (a glass door: its pane, nearly floor to top rail; a railing's: under its handrail)
    const ax = w.door ? (w.door.axis === 'x' ? 0 : 1) : (w.nz ? 1 : 0), az = w.door ? (w.door.axis === 'x' ? 1 : 0) : (w.nx ? 1 : 0); // (along the glass)
    for (let k = 0; k < 4; k++) {
      const q = new THREE.Vector3(w.x + ax * (Math.random() - 0.5) * w.len, Y + lo + Math.random() * (hi - lo), w.z + az * (Math.random() - 0.5) * w.len);
      R.particles(q, 14, 0xd8eef5, 1.6, 1.2, 9, 0.7, dir ? [dir.x * 1.5, 0, dir.z * 1.5] : null);
    }
    Audio.glass(Math.hypot(w.x - R.camera.position.x, w.z - R.camera.position.z));
  },
  // A weapon light and/or laser from `from` along dir: the light shines, the laser lands on the first wall or
  // person in its way (a person as a rough column: standing up to 1.8 m, 0.25 m round). skip: whose it is.
  // (selfEv: a suspect's own: their body doesn't stop their laser.) Anyone else's light can dazzle you: js/glare.ts.
  tacBeam(from: THREE.Vector3, dir: THREE.Vector3, fl: number, skip: string | null, drawFrom?: THREE.Vector3 | null, selfEv?: VwEnemy) {
    const map = Game.map;
    if (!map) return;
    const src = drawFrom || from; // (where the light and the beam visibly come from)
    if (fl & 1) { R.tacLight(src, dir, fl & 8 ? 1.6 : 1, skip != null, skip == null && !!map.night); // (your own beam in the air: only in the dark of a night level)
      if (skip != null) Glare.add(skip, src, dir, fl & 8 ? 1.6 : 1); }
    if (!(fl & 2)) return;
    let t = Level.raycast(map, from.x, from.y, from.z, dir.x, dir.y, dir.z, 60, { glass: true }).t;
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
    if (skip != null) body(Me.pos, Me.crouch ? 1.2 : 1.8);
    const end = from.clone().addScaledVector(dir, t - 0.01);
    R.tacLaser(src, end, !!(fl & 4));
    if (Highlights) Highlights.laser(selfEv ? skip : skip == null ? null : 'p' + skip, end, !!(fl & 4)); // (where it landed: the replays show it)
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
    if (ev.pos.distanceTo(R.camera.position) > 25) return;
    const A = Audio, dur = Math.min(5, +m.dur || 2) * 1000;
    if (!(m.n > 0)) { ev.reloadAt = performance.now(); ev.reloadDur = dur; } // (a magazine change: their hands show it, js/rig.ts)
    // from their hands, wherever they are when each part of it happens (heard from that side, muffled through walls)
    const at = () => new THREE.Vector3(ev.pos.x, ev.pos.y + 1.15 * (ev.crouch ? 0.7 : 1) * ev.def.scale, ev.pos.z); // (above their feet, on whatever floor they're on)
    // (their gun's own sounds, js/handling.ts, where it has them; else the recordings)
    const H = Handling, wd = WEAPONS[ev.def.wpn];
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
    Net.toHost({ t: 'bores', a });
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
    R.muzzleFlashAt(f);
    const me = R.camera.position;
    const wdef = WEAPONS[m.w] || WEAPONS[(ENEMIES as Record<string, any>)[m.ty].wpn];
    // what you see of their round (a machine gunner's belt has a tracer every fourth): what it does is the host's, flown there
    // (js/player.ts enemyRound), its marks and wounds told to you as they happen
    const ev0 = this.enemies.get(m.e), tr = wdef.cls === 'LMG' && ev0 && ((ev0.shots = (ev0.shots || 0) + 1) % 4 === 1);
    if (Highlights) Highlights.shot('e' + m.e, f, to, wdef.code || m.w, undefined!, undefined!, m.sid);
    this.visRound(f, to, wdef, tr ? 'tracer' : ballFor(calOf(wdef)), () => {});
    Casings.fired(wdef, false, f, to);
    if (!GunAudio.play(wdef.id, f, 'e' + m.e, 1, to)) Audio.shot((CLASS_SND as Record<string, any>)[wdef.cls] || CLASS_SND.AR, me.distanceTo(f));
    Audio.flyby(f, to, wdef, ballFor(calOf(wdef)));
    this.pings.push({ x: m.f[0], z: m.f[2], t: 2.5 });
    const ev = this.enemies.get(m.e);
    if (ev) ev.rig.recoil(Sim.kickOf(ev.str, wdef)); // (the same kick the host gave it)
  },
  // The marks a round left (js/ballistics.ts mark: [x, y, z, normal, what it looks like, e(ntry) x (exit) r(icochet)]), on your
  // screen: skip the first (the arrival drew it). A ricochet's next leg shows as a streak.
  roundFx(list: any[][], skip?: boolean) {
    let last: any[] | null = null;
    (list || []).forEach((f, i) => {
      const p = new THREE.Vector3(f[0], f[1], f[2]);
      if (!(skip && i === 0)) R.impactOn(p, f.slice(3, 6), null, f[6], f.length > 8 ? { m: f[12], k: f[7], dir: f.slice(8, 11), J: f[11], stop: !!f[13], cal: f[14], cut: f[15] || 0 } : undefined);
      if (last && last[7] === 'r') R.tracer(new THREE.Vector3(last[0], last[1], last[2]), p, 0xffd080, 0.05);
      if (f[7] === 'r' && Audio.ricochet) Audio.ricochet(p);
      last = f;
    });
  },
  enemyThrow(id: number) { const ev = this.enemies.get(id); if (ev && ev.alive) ev.rig.throwNade(); },
  remoteShot(m: any) {
    const f = new THREE.Vector3(m.f[0], m.f[1], m.f[2]), to = new THREE.Vector3(m.to[0], m.to[1], m.to[2]);
    const def = Gunsmith.fromCode(m.w);
    if (!def) return;
    const pv = this.players.get(m.id), more = !!m.vi; // (more: a volley's round after its first, which brought the kick, the flash and the report for all of them: js/player.ts shoot)
    if (pv && !more) pv.rig.recoil();
    if (Highlights) Highlights.shot('p' + m.id, f, to, m.w, m.am, m.tos, m.sid);
    Audio.flyby(f, to, def, m.am || ballFor(calOf(def))); // a teammate's round going past you
    // their round flies to where it was headed (the walls it'll meet, as the shooter worked it out)
    const am = m.am || ballFor(calOf(def)), fromP = f.clone(), toP = to.clone();
    this.visRound(f, to, def, am, () => {
      if (def.cls === 'RAIL') R.tracer(fromP, toP, def.tracer || 0x55ddff, 0.06);
    });
    if (more) return;
    if (!m.sil) R.muzzleFlashAt(f, def.tracer || 0xffb060);
    if (!def.caseless && !def.volley) Casings.fired(def, false, f, to, m.am); // (a volley gun's empties stay in its chambers)
    const d = R.camera.position.distanceTo(f);
    if (def.cls === 'RAIL') Audio.rail(d);
    else if (def.cls === 'BOW') Audio.bow(d);
    else if (!GunAudio.play(m.bm && def.barrels ? shotSoundKey(roundSpec(def, m.rl), m.bm, am) : Gunsmith.roundSoundKey(def, am), f, 'p' + m.id, m.bm && def.barrels ? Math.pow(shotK(def, m.bm), 2) : def.volley ? volleyVol(def, m.vn || def.volley) : 1, to)) Audio.shot(m.sil ? SUPPRESSOR.snd : def.snd, d);
  },

  // ---------------------------------------------------------------- other people's rounds
  // A round someone else fired, as you see it: from f straight to `to` at its speed (roundSpeed, slowing with
  // drag), drawn like your own (R.bullet); arrive: what happens when it gets there.
  visRound(f: THREE.Vector3, to: THREE.Vector3, def: any, am: string, arrive: () => void) {
    const len = f.distanceTo(to);
    if (len < 0.05) { arrive(); return; }
    const rail = def.cls === 'RAIL';
    (this.vRounds = this.vRounds || []).push({ f: f.clone(), dir: to.clone().sub(f).divideScalar(len), len, d: 0, def, am, arrive,
      v: rail ? 3000 : Math.max(40, roundSpeed(def, am) || 400), drag: rail ? 1e9 : dragOf(def, am), tracer: !!((AMMO as Record<string, any>)[am] && (AMMO as Record<string, any>)[am].tracer) });
  },
  stepRounds(dt: number) {
    const rs = this.vRounds;
    if (!rs || !rs.length) return;
    dt = Math.min(dt, 0.05);
    for (let i = rs.length - 1; i >= 0; i--) {
      const b = rs[i], step = b.v * dt;
      b.d = Math.min(b.len, b.d + step);
      b.v *= Math.exp(-step / b.drag);
      R.bullet(b.f.clone().addScaledVector(b.dir, b.d), b.dir, b.d, b.def, b.tracer, b.v, b.am);
      if (b.d >= b.len || b.v < 30) { rs.splice(i, 1); b.arrive(); }
    }
  },
  // kind: 'frag', or 'flash' (a flashbang: a grey can)
  // ---------------------------------------------------------------- a thrown grenade's flight
  // Gravity, bounces off walls, floors and ceilings (some of its speed lost each time, a floor taking more), then
  // rolling along the floor, slowed by friction, till it stops. n: { pos, vel } (and n.onGround, set here). The
  // same steps for everyone's grenades and for the throw you're lining up (predictNade), so where the arc says it
  // ends up is where it does.
  NADE_R: Sim.NADE_R, NADE_G: Sim.NADE_G, // (js/sim.ts: the flight itself, the same for the host's simulation)
  nadeStep(n: VwNadeMotion, dt: number, map: LvMap | null) { Sim.nadeStep(n, dt, map); },
  // Where a throw goes: its path, stepped as a grenade flies (nadeStep) for as long as the fuse burns. Returns
  // the points along it (Vector3s) and where it goes off (the last).
  predictNade(p: THREE.Vector3, v: THREE.Vector3, fuse: number, map: LvMap | null) { return Sim.predictNade(p, v, fuse, map); },
  // A thermobaric grenade's body: an olive can with an orange band round its middle and a grey fuze on top (std: a lit
  // material, for the hand in front of you)
  tbMesh(r: number, h: number, std = false) {
    const T = THREE, M = (c: number, o: Record<string, any> = {}) => std ? new T.MeshStandardMaterial(Object.assign({ color: c, roughness: 0.65 }, o)) : new T.MeshLambertMaterial(Object.assign({ color: c }, o));
    const body = new T.Mesh(new T.CylinderGeometry(r, r, h, 12), M(0x4c5634, std ? {} : { emissive: 0x220000 }));
    const band = new T.Mesh(new T.CylinderGeometry(r * 1.03, r * 1.03, h * 0.16, 12), M(0xc8641e)); band.position.y = h * 0.12; body.add(band);
    const fuze = new T.Mesh(new T.CylinderGeometry(r * 0.38, r * 0.45, h * 0.24, 8), M(0x8a8f94)); fuze.position.y = h * 0.6; body.add(fuze);
    return body;
  },
  // A sticky grenade's body: a squat steel can in a tan adhesive sock, its fuze on top
  stickyMesh(r: number, std = false) {
    const T = THREE, M = (c: number, o: Record<string, any> = {}) => std ? new T.MeshStandardMaterial(Object.assign({ color: c, roughness: 0.9 }, o)) : new T.MeshLambertMaterial(Object.assign({ color: c }, o));
    const body = new T.Mesh(new T.SphereGeometry(r, 12, 8), M(0x9a8558, std ? {} : { emissive: 0x220000 })); body.scale.set(1, 0.82, 1);
    const fuze = new T.Mesh(new T.CylinderGeometry(r * 0.32, r * 0.4, r * 0.7, 8), M(0x8a8f94)); fuze.position.y = r * 0.95; body.add(fuze);
    return body;
  },
  addNade(p: THREE.Vector3, v: THREE.Vector3, fuse: number, own: boolean, enemy: boolean, kind: VwNadeKind = 'frag', nid?: number, from?: string) {
    const flash = kind === 'flash';
    const mesh = kind === 'sticky' ? this.stickyMesh(0.055) as THREE.Mesh<THREE.BufferGeometry, THREE.MeshLambertMaterial> : kind === 'tb' ? this.tbMesh(0.045, 0.15) as THREE.Mesh<THREE.BufferGeometry, THREE.MeshLambertMaterial> : new THREE.Mesh(flash ? new THREE.CylinderGeometry(0.035, 0.035, 0.13, 10) : new THREE.SphereGeometry(0.08, 8, 6), new THREE.MeshLambertMaterial({ color: flash ? 0x7d8388 : 0x3a4a2a, emissive: 0x220000 }));
    mesh.position.copy(p);
    R.dynRoot.add(mesh);
    this.nades.push({ pos: new THREE.Vector3().copy(p), vel: new THREE.Vector3().copy(v), fuse: kind === 'sticky' ? Me.STICKY.FUSE : fuse, own, enemy, mesh, kind, nid, from, flyT: 0, stuck: null });
  },
  // A sticky in the air: on till it meets something, and there it holds (its fuse burning from then: the update). The thrower's screen
  // decides what it hit, people too (whoever's nearer along the way than the wall: the nearest of their bones it holds to, as a bolt
  // does), and tells the squad ('stk'); everyone else's copy flies against the walls alone till that word comes.
  stickStep(n: VwNade, dt: number, map: LvMap | null) {
    const a = n.pos.clone(), v0 = n.vel.clone(), s = Sim.stickFly(n, dt, map), b = s ? s.at : n.pos, seg = b.clone().sub(a), len = seg.length();
    if (n.own && len > 1e-4) { // (a person in the way first?)
      const d = seg.clone().divideScalar(len); let best: { rig: Rig; t: number; e?: number; pl?: string } | null = null;
      for (const ev of this.enemies.values()) { if (!ev.alive || !ev.rig || ev.pos.distanceTo(a) > len + 2) continue; const h = G_Rig.raycast(ev.rig, a, d, len); if (h && (!best || h.t < best.t)) best = { rig: ev.rig, t: h.t, e: ev.id }; }
      for (const [id, pv] of this.players) { if (id === Net.myId || pv.dead || !pv.rig || !pv.rig.root.visible || pv.pos.distanceTo(a) > len + 2) continue; const h = G_Rig.raycast(pv.rig, a, d, len); if (h && (!best || h.t < best.t)) best = { rig: pv.rig, t: h.t, pl: id }; }
      if (best) {
        const at = a.clone().addScaledVector(d, best.t);
        n.pos.copy(at); n.vel.set(0, 0, 0);
        const bn = this.nearestBone(best.rig, at);
        if (Highlights) Highlights.stick('p' + Net.myId, at, n.flyT || 0);
        if (bn) { const l = bn.o.worldToLocal(at.clone()); n.stuck = { rig: best.rig, bone: bn.o, l }; Net.toHost({ t: 'stk', nid: n.nid, e: best.e, pl: best.pl, b: bn.name, l: l.toArray().map((x) => Math.round(x * 1000) / 1000) }); }
        else { n.stuck = {}; Net.toHost({ t: 'stk', nid: n.nid, at: at.toArray().map((x) => Math.round(x * 1000) / 1000) }); }
        if (Audio.click) Audio.click();
        return;
      }
    }
    if (!s) return;
    if (n.own && Highlights) Highlights.stick('p' + Net.myId, s.at, (n.flyT || 0) + s.t); // (the replays: where it held)
    n.pos.copy(s.at).addScaledVector(new THREE.Vector3(...(s.n as [number, number, number])), 0.035); n.vel.set(0, 0, 0); n.stuck = {}; // (held to its face, its middle a hand's width off it)
    n.mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), new THREE.Vector3(...(s.n as [number, number, number])).negate()); // (its sock to the surface)
    if (n.own) Net.toHost({ t: 'stk', nid: n.nid, at: n.pos.toArray().map((x) => Math.round(x * 1000) / 1000) });
    void v0;
  },
  // the bone of a body nearest a point on it (the bones a bolt rides: js/ballistics.ts segs), with its name
  nearestBone(rig: Rig, at: THREE.Vector3) {
    const B = Ballistics, seen = new Set<string>(); let best: { o: THREE.Object3D; name: string } | null = null, bd = 1e9;
    for (const s of B.segs()) { if (seen.has(s.bone)) continue; seen.add(s.bone); const o = B.boneOf(rig, s.bone); if (!o) continue; o.updateWorldMatrix(true, false); const d = o.getWorldPosition(new THREE.Vector3()).distanceTo(at); if (d < bd) { bd = d; best = { o, name: s.bone }; } }
    return best;
  },
  // the thrower's word on where their sticky held (js/game.ts 'stk'): this screen's copy of it put there
  stuckAt(m: any) {
    const n = this.nades.find((q) => q.kind === 'sticky' && q.nid === m.nid && q.from === m.id); if (!n) return;
    n.vel.set(0, 0, 0);
    if (Highlights) Highlights.stick('p' + m.id, Array.isArray(m.at) ? new THREE.Vector3(m.at[0], m.at[1], m.at[2]) : n.pos.clone(), n.flyT || 0); // (the replays: where it held, as they told it)
    if (Array.isArray(m.at)) { n.pos.set(m.at[0], m.at[1], m.at[2]); n.stuck = {}; return; }
    if (m.pl === Net.myId && Me.pos) { // (on you: it goes where you go)
      const at = n.pos;
      n.stuck = { me: new THREE.Vector3(U.clamp(at.x - Me.pos.x, -0.3, 0.3), U.clamp(at.y - Me.pos.y, 0.3, 1.6), U.clamp(at.z - Me.pos.z, -0.3, 0.3)) }; return;
    }
    const rig = m.e != null ? this.enemies.get(m.e)?.rig : m.pl ? this.players.get(m.pl)?.rig : null, bone = rig && Array.isArray(m.l) ? Ballistics.boneOf(rig, m.b) : null;
    if (rig && bone) { n.stuck = { rig, bone, l: new THREE.Vector3(m.l[0], m.l[1], m.l[2]) }; } else n.stuck = {};
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
    const cam = R.camera.position, cand: [number, VwEnemy][] = [];
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
      const hpf = U.clamp(ev.hp / 100, 0, 1), loss = 1 - hpf; // (their health stands for blood: wounds drain it)
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
          R.bloodJet(_p, _d.x * s + (Math.random() - 0.5) * j, _d.y * s + (art ? 0.2 * flow : 0) + (Math.random() - 0.5) * j * 0.6, _d.z * s + (Math.random() - 0.5) * j, art ? 0x8c0a0a : 0x6e0808);
        }
      }
      // down for good (alive or not): a pool grows under the body, from where it lies
      if (!ev.wpool && (ev.down || !ev.alive)) {
        ev.wpool = true;
        const b = G_Rig.bodyAt(ev.rig);
        if (ev.alive) R.bloodPool(ev, b.x, b.z, wnd.some((w) => w & 16) ? 1.2 : 0.8, 45, b.y - 0.2);
      }
    }
  },
  // An officer losing blood: drops where they stand or walk (more, the heavier the bleeding), and a pool
  // under them when they're down or dead. who: the owner key, pos: their feet, bl: 0 none, 1 light, 2 heavy.
  officerBlood(who: { _drip?: number; [k: string]: any }, pos: THREE.Vector3, bl: number, down: boolean, dt: number) {
    if (!bl) return;
    const k = who === Me ? (this._myDrip = (this._myDrip || 0) - dt) : (who._drip = (who._drip || 0) - dt);
    if (down) R.bloodPool(who, pos.x, pos.z, bl > 1 ? 1.0 : 0.5, bl > 1 ? 30 : 60, pos.y);
    else if (k <= 0) {
      const next = bl > 1 ? 0.12 + Math.random() * 0.12 : 0.6 + Math.random() * 0.6;
      if (who === Me) this._myDrip = next; else who._drip = next;
      R.particles(new THREE.Vector3(pos.x + (Math.random() - 0.5) * 0.35, 0.9, pos.z + (Math.random() - 0.5) * 0.35), 1, 0x7a0808, 0.2, 0.8, 9, 0.1, null, true);
    }
  },
  // ---------------------------------------------------------------- pings
  // A teammate's ping (or yours): a marker in their colour with their name at the spot (nothing about what's
  // there), seen through walls,
  // the same size on screen however far off, gone after a few seconds. One per player: a new one replaces it.
  PING_T: 6,
  addPing(id: string, p: number[]) {
    const me = id === Net.myId, r = Game.roster && Game.roster[id], name = me ? Game.myName : r ? r.name : '?', color = me ? Game.myColor : r ? r.color : 0xffffff, animal = me ? Game.myAnimal : r ? r.animal : null;
    this.pings2 = this.pings2 || new Map();
    const old = this.pings2.get(id);
    if (old) { R.dynRoot.remove(old.s); old.s.material.map!.dispose(); old.s.material.dispose(); }
    const c = document.createElement('canvas'); c.width = 400; c.height = 160;
    const g = c.getContext('2d')!, col = U.hex(color);
    g.font = 'bold 30px Consolas, monospace'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.lineWidth = 6; g.strokeStyle = 'rgba(0,0,0,0.85)';
    const label = name;
    while (g.measureText(label).width > 380 && parseInt(g.font, 10) > 16) g.font = `bold ${parseInt(g.font.split(' ')[1], 10) - 2}px Consolas, monospace`; // (a long name: smaller)
    const tw = g.measureText(label).width, ax = animal ? 22 : 0; // (their animal before their name)
    g.strokeText(label, 200 + ax, 30); g.fillStyle = col; g.fillText(label, 200 + ax, 30);
    if (animal) { g.save(); g.translate(200 + ax - tw / 2 - 48, 8); g.beginPath(); g.arc(22, 22, 23, 0, Math.PI * 2); g.fillStyle = 'rgba(0,0,0,0.6)'; g.fill(); Callsigns.draw(g, animal, 44, color); g.restore(); }
    // the marker: a diamond pointing down at the spot
    g.beginPath(); g.moveTo(200, 150); g.lineTo(176, 100); g.lineTo(200, 62); g.lineTo(224, 100); g.closePath();
    g.lineWidth = 5; g.strokeStyle = 'rgba(0,0,0,0.85)'; g.stroke(); g.fillStyle = col; g.fill();
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), depthTest: false, transparent: true }));
    s.center.set(0.5, 0.06); s.renderOrder = 20;
    s.position.set(p[0], p[1], p[2]);
    R.dynRoot.add(s);
    this.pings2.set(id, { s, t: this.PING_T });
    Audio.tone && Audio.tone(880, 0.08, 'sine', 0.08); // (a soft blip)
  },
  updatePings(dt: number) {
    if (!this.pings2) return;
    const cam = R.camera.position;
    for (const [id, q] of this.pings2) {
      q.t -= dt;
      if (q.t <= 0) { R.dynRoot.remove(q.s); q.s.material.map!.dispose(); q.s.material.dispose(); this.pings2.delete(id); continue; }
      const d = q.s.position.distanceTo(cam), sc = Math.max(0.9, d * 0.085); // (about the same size on screen at any range)
      q.s.scale.set(sc * 1.56, sc * 0.625, 1);
      q.s.material.opacity = Math.min(1, q.t / 1.2);
    }
  },
  update(dt: number) {
    Casings.update(dt);
    Bolts.update();
    this.updatePings(dt);
    this.stepRounds(dt);
    if (Game.map && R.camera) { // the lights follow you (and, aiming, what you're aiming at)
      let focus = null;
      if (Me.adsT > 0.5 && Game.map.theme.layout === 'festival') {
        const c = R.camera, f = new THREE.Vector3(0, 0, -1).applyQuaternion(c.quaternion), h = Level.raycast(Game.map, c.position.x, c.position.y, c.position.z, f.x, f.y, f.z, 120);
        focus = c.position.clone().addScaledVector(f, h.t);
      }
      LevelView.updateLights(Game.map, R.camera.position, false, focus);
    }
    // officers bleeding: you, and your teammates from what their bodies report
    if (Game.phase === 'level' && Me.body && Me.pos) {
      const parts = Object.values(Me.body.parts), bl = parts.some((q) => q.heavy) ? 2 : parts.some((q) => q.light) ? 1 : 0;
      this.officerBlood(Me, Me.pos, bl, Me.down || Me.dead, dt);
      for (const pv of this.players.values()) {
        if (!pv.st || !pv.st.bd || !pv.pos) continue;
        const b = pv.st.bd.p || [], bl2 = b.some((q: number[]) => q[1] & 2) ? 2 : b.some((q: number[]) => q[1] & 1) ? 1 : 0;
        this.officerBlood(pv, pv.pos, bl2, pv.st.dn || pv.st.dd, dt);
      }
    }
    const map = Game.map, L = Level;
    // enemies
    for (const ev of [...this.enemies.values()]) {
      if (ev.alive) {
        ev.pos.lerp(ev.tgt, Math.min(1, dt * 12));
        // (the host keeps them out of the walls; the way between two of its snapshots can cut a corner, or a snap can carry it
        // through a thin wall: slid back out as the host does it, so what's drawn is never inside one)
        if (map && map.world && ev.pos.distanceToSquared(ev.tgt) > 1e-6) L.resolve(map, ev.pos, 0.38 * ev.def.scale, ev.pos.y, World.STEP, true);
        ev.yaw += U.angDiff(ev.yaw, ev.tgtYaw) * Math.min(1, dt * 12);
      } else {
        ev.deadT += dt;
        // the dead: once the body's down, a pool spreads from under the chest
        if (ev.deadT > 1.5 && ev.rig.rd && !ev.pooled) { ev.pooled = true; const P = ev.rig.rd.P; R.bloodPool(ev, (P[0].x + P[3].x) / 2, (P[0].z + P[3].z) / 2, 1.1 + Math.random() * 0.4, 30, Math.min(P[0].y, P[3].y) - 0.2); }
      }
      // aim pitch toward whoever they're engaging
      let pitch = 0;
      const aimed = ev.aim === Net.myId ? Me.pos : ev.aim && this.players.get(ev.aim) ? this.players.get(ev.aim)!.pos : null;
      const tgt = aimed || (ev.alert ? this.nearestPlayer(ev.pos) : null);
      if (tgt) pitch = Math.atan2(tgt.y + 1.2 - (ev.pos.y + 1.4 * ev.def.scale), Math.max(1, Math.hypot(tgt.x - ev.pos.x, tgt.z - ev.pos.z))); // (from their own height: upstairs, level)
      ev.recPitch = pitch; // (for the highlights: js/highlights.ts)
      let pose: VwPose | null = ev.scode === 1 ? 'handsup' : ev.scode === 2 ? 'cuffed' : ev.scode === 3 ? 'cower' : null;
      // being taken down and zip-tied by an officer (me or a teammate)
      let tk = -1;
      const ma = Me.action;
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
        const lm = Game.map; if (lm && lm.world) Level.resolve(lm, at, 0.22 * (ev.def.scale || 1), at.y, World.STEP, true);
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
      // Hidden whole (js/space.ts hideStrays: she's flying, and they're aboard what she's left): not looked for, no body's physics, posed
      // once, with the time since (at most a tenth of a second of it: their bodies are stepped as for a few frames deferred), the frame they're shown again or anything asks where they are (js/rig.ts catchUp)
      const parked = !ev.rig.root.visible;
      const near = !parked && (ev.pos.distanceToSquared(R.camera.position) < 40 * 40 || (ev.engagedT && performance.now() - ev.engagedT < 8000));
      if (ev.down && ev.alive) ev.rig.goLimp(); // (down for good: a limp body, bleeding out)
      // (what they're aiming at: a weakened or downed suspect points the gun at it from the hand, js/rig.ts)
      const aimAt = tgt && ev.armed === 2 && ev.alert && !ev.surp && !ev.reloading && !pose && !ev.down ? new THREE.Vector3(tgt.x, tgt.y + 1.2, tgt.z) : null;
      const rlP = ev.reloadAt && ev.reloading ? (performance.now() - ev.reloadAt) / ev.reloadDur : -1; // (how far into a magazine change)
      ev.aimP = aimed ? aimAt : null; // (who they're on: where their light and laser go)
      // (whether they can be seen this frame, before they're posed: past the fog or behind a wall they aren't drawn, below)
      // Past the fog (it's the background's colour out there: nothing to see) they aren't drawn, each one's forty-odd
      // pieces a draw call. The body, not the root: the root's what a shot checks for (js/player.ts), and it still hits.
      // Nor behind a wall, floor or ceiling (furniture, doors, glass, rails and stairs don't count: you might see them
      // round, over or through it).
      const fog = R.scene.fog, cam = R.camera;
      if (!parked) { // (behind a wall: aboard a liner too, which has no fog (noFog): before, nobody was hidden there behind anything, her shelter's crowd drawn through her decks)
        let far = true;
        if (fog) {
          const e = cam.matrixWorld.elements, depth = -((at.x - e[12]) * e[8] + (at.y - e[13]) * e[9] + (at.z - e[14]) * e[10]); // (along the view, as the fog's reckoned)
          // (through a magnified scope the fog's stretched in its picture, js/render.ts scopeReach: they're drawn out to there)
          const pip = R.vm && R.vm.visible && R.vm.userData.pip, sk = pip && (R.pipLive || 0) > 0.35 ? R.scopeReach(pip.mag).k : 1;
          far = depth < (fog as THREE.Fog).far * sk + 2.5;
        }
        ev.rig.body.visible = far && this.inSight(ev.rig, at);
      }
      // Someone who can't be seen (not drawn, or out of the view) is posed every fourth frame, with the time since: their body caught up
      // the moment it's seen again, or anything asks where it is (a shot, a hit test: js/rig.ts catchUp). Not one shot at lately (their
      // fall's being watched: near, above).
      const rt0 = Prof.t();
      const rp = { feet: ev.alive && !ev.down ? (ev.feet ||= Footsteps.feetOf(ev.def, ev.id, ev.armed === 2, ev.rig.shoe)) : undefined, pos: at, yaw: ev.yaw, pitch, crouch: ev.crouch || (ev.str != null && ev.str < 0.4), rise: 3.5, alert: !!ev.alert && ev.armed === 2 && !ev.surp && !ev.reloading, shieldUp: !!ev.alert && ev.alive && !ev.down && !ev.surp, lean: ev.leanS, pose, radio: ev.radio && ev.alive && !ev.down, blind: ev.alive && !ev.down && ev.scode !== 1 && ev.scode !== 2 && !ev.arrested ? ev.fc || 0 : 0, tk, act, str: near ? (ev.str == null ? 1 : ev.str) : null, aimAt,
        reload: rlP >= 0 && rlP < 1 ? rlP : -1 };
      const unseen = (!parked && !ev.rig.body.visible) || !inView(at), watched = !!(ev.engagedT && performance.now() - ev.engagedT < 8000);
      if (parked) { ev.rig.defer(dt, rp); if (ev.rig.pend!.dt > 0.1) ev.rig.pend!.dt = 0.1; }
      else if (unseen && !watched && ((ev.rigSkip = (ev.rigSkip || 0) + 1) & 3)) ev.rig.defer(dt, rp); else { ev.rigSkip = 0; ev.rig.update(dt, rp); }
      if (rt0) { const ms = performance.now() - rt0; Prof.add('rigs: people', ms); if (!inView(ev.pos)) Prof.add('rigs: people off screen', ms); } // (js/profiler.ts)
      // bleeding: drips falling from them as they go; down for good, from the body where it lies (its ragdoll's hips,
      // not where they last stood)
      if (ev.alive && ev.bleed && !(ev.wnd && ev.wnd.length) && (ev.dripT = (ev.dripT || 0) - dt) <= 0) {
        ev.dripT = 0.25 + Math.random() * 0.35;
        const lying = ev.rig.limp, b = lying ? G_Rig.bodyAt(ev.rig) : ev.pos;
        R.particles(new THREE.Vector3(b.x + (Math.random() - 0.5) * (lying ? 0.2 : 0.3), lying ? b.y + 0.05 : (ev.crouch ? 0.6 : 0.9) * ev.def.scale, b.z + (Math.random() - 0.5) * (lying ? 0.2 : 0.3)), 2, 0x7a0808, 0.3, lying ? 0.3 : 0.7, 9, 0.2, null, true);
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
        if (!pv.dead) { pv.dead = true; pv.rig.holster(false); pv.rig.die(null); R.impact(new THREE.Vector3(pv.pos.x, pv.pos.y + 1.2, pv.pos.z), null, 'blood'); }
        pv.rig.update(dt, { pos: pv.pos, yaw: pv.yaw, pitch: 0, crouch: false, alert: false, lean: 0, state: 'dead' });
        continue;
      }
      if (pv.dead) this.resetPlayerRig(pv);
      pv.rig.root.visible = true;
      pv.pos.lerp(new THREE.Vector3(st.p[0], st.p[1], st.p[2]), Math.min(1, dt * 14));
      pv.yaw += U.angDiff(pv.yaw, st.yw) * Math.min(1, dt * 14);
      pv.pitch += (st.pt - pv.pitch) * Math.min(1, dt * 14);
      pv.rig.setGun(st.w, Stickers.of(st.sk)); // their build code: the same parts on their gun (and its stickers, by their hash: js/stickers.ts)
      pv.rig.holster(!!st.sw, true); // hands busy: weapon away (by hand, not in a jump)
      const act: VwAct | null = st.act && !st.dn && !st.dd ? { kind: ({ o: 'open', c: 'close', k: 'kick', z: 'zip', b: 'bag' } as Record<string, VwActKind>)[st.act], t: st.ap || 0, hand: 'R' } : null;
      if (act && act.kind === 'zip') { const tv = this.enemies.get(st.zt); if (tv) act.pt = this.zipPoint(tv, act.t, tv.alive && !tv.down); act.pull = !!st.pl; }
      // their restraining / bagging sounds, as they reach each step
      if (act && pv.lastAct === st.act) Audio.foley(act.kind, pv.lastAp || 0, act.t, pv.pos.distanceTo(R.camera.position));
      pv.lastAct = st.act; pv.lastAp = act ? act.t : 0;
      if (st.ra != null && st.ra >= 0 && !(pv.lastRa >= 0) && !st.sw) { const rdef = Gunsmith.fromCode(st.w), rp = pv.pos.clone().setY(pv.pos.y + 1.3); (rdef && Handling.play(rdef, Handling.rackClip(rdef, rdef.manual ? Me.MANUAL_T : 0.45), { land: Handling.LAND.rack, vol: 0.7, pos: rp })) || Audio.sampleAt('rack_slide', rp, 0.7, rdef && rdef.manual ? Me.MANUAL_PITCH : 1); } // (their bolt / pump / lever worked: heard from where they stand)
      pv.lastRa = st.ra == null ? -1 : st.ra;
      const kneel = (st.act === 'z' && (st.ap || 0) > 0.3) || st.act === 'b';
      const hold = st.hk ? { kind: st.hk === 2 ? 'flash' : st.hk === 3 ? 'tb' : st.hk === 4 ? 'sticky' : 'frag', cock: !!st.hc, str: st.hs == null ? 2 : st.hs } : null; // (a grenade in their hand)
      const rt1 = Prof.t();
      pv.rig.update(dt, { feet: st.dn || st.dd ? undefined : { sole: 'boot', kit: 'heavy', careful: !!st.sd, low: !!st.lr }, pos: pv.pos, yaw: pv.yaw, pitch: pv.pitch, crouch: (!!st.cr || kneel) && !st.dn, prone: !!st.pr, bipod: !!st.bp, climb: st.cl ? Level.ladderAt(Game.map, pv.pos.x, pv.pos.z) : null, zip: !!st.zp, aim: !!st.ad, alert: !st.lr && !st.sw, atak: !!st.mn, lean: st.ln || 0, state: st.dn ? 'down' : 'alive', act,
        hold, rack: st.ra == null ? -1 : st.ra, reload: st.rl == null ? -1 : st.rl, loaded: st.ld == null ? null : !!st.ld, nomag: !!st.nm, inspect: st.in == null ? -1 : st.in, magChk: st.mc == null ? -1 : st.mc });
      if (rt1) { const ms = performance.now() - rt1; Prof.add('rigs: players', ms); if (!inView(pv.pos)) Prof.add('rigs: players off screen', ms); }
      if (pv.tag) pv.tag.position.y = st.dn ? 0.8 : st.cr ? 1.7 : 2.15;
    }

    // marksman lasers
    R.beginLasers();
    let aimedAtMe = false;
    for (const ev of this.enemies.values()) {
      if (!ev.alive || !ev.aim || !ev.rig.gun || ev.rig.slung) continue;
      const a = ev.rig.head.localToWorld(new THREE.Vector3(0, 0.08, -0.12));
      let b;
      if (ev.aim === Net.myId) { b = R.camera.position.clone(); b.y -= 0.25; aimedAtMe = true; }
      else { const pv = this.players.get(ev.aim); if (!pv) continue; b = pv.pos.clone(); b.y += 1.3; }
      if (!(ev.tac & 2)) R.laser(a, b); // (one on their gun shows for itself, below)
    }
    R.endLasers();
    this.laserBeep -= dt;
    if (aimedAtMe && this.laserBeep <= 0) { Audio.laser(); this.laserBeep = 0.25; }
    HUD.sniperWarn(aimedAtMe);

    // weapon lights and lasers: yours (from the gun in your hands, along its bore) and your squad's (flags in
    // their state: 1 light, 2 laser, 4 the laser's green, 8 a bright light)
    R.tacBegin(); Glare.begin();
    const me = Me, mw = Game.phase === 'level' && me.cur ? me.cur() : null, mf = mw && !me.dead ? me.tacFlags(mw) : 0;
    if (mf) {
      // the gun points them, always: along its barrel as you see it (sway, bob, a turn's lag, the kick: the dot goes
      // with it), drawn from the gun in your hands. With the gun up that line runs from your eye (where the rounds
      // start: held steady, the barrel and the bore agree, so the dot is where they go); with the gun off the line
      // (lowered, coming up, mid-reload) from its muzzle.
      let dir = me.boreDir(), from = R.camera.position.clone(), gun = null;
      const vm = R.vm, fl = vm && vm.userData.flash;
      if (fl) {
        R.vmHolder.updateMatrixWorld(true);
        gun = fl.getWorldPosition(new THREE.Vector3());
        const axis = new THREE.Vector3(0, 0, -1).transformDirection(fl.parent.matrixWorld); // (the barrel: -z in its holder)
        const off = THREE.MathUtils.smoothstep(Math.acos(U.clamp(axis.dot(dir), -1, 1)), 0.03, 0.12); // (~2° to 7° off)
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
    if (Game.phase === 'level') for (const ev of this.enemies.values()) {
      if (!ev.tac || !ev.alive || ev.down || ev.scode || !ev.rig.gun || ev.rig.slung || !ev.rig.root.visible) continue;
      const d = ev.pos.distanceToSquared(R.camera.position), f = ev.tac & (ev.alert ? 15 : 9);
      if (f && d < 2500) tac.push([d, ev, f]);
    }
    tac.sort((a, b) => a[0] - b[0]);
    for (const [, ev, f] of tac) {
      const gun = ev.rig.gun!, gi = ev.rig.gunInfo!; gun.updateMatrixWorld(true);
      const from = gun.localToWorld(new THREE.Vector3(gi.muzzles[0][2], gi.muzzles[0][1], -gi.muzzles[0][0])), dir = ev.aimP ? ev.aimP.clone().sub(from).normalize() : new THREE.Vector3(0, 0, -1).transformDirection(gun.matrixWorld);
      this.tacBeam(from, dir, f, 'e' + ev.id, null, ev);
    }
    R.tacEnd(); Glare.end(dt);

    // first aid cabinet doors swinging open
    const cabV: VwCabView[] | null = Game.map && Game.map.cabViews;
    if (cabV) cabV.forEach((cv, i) => {
      const want = Game.cabs && Game.cabs[i] && Game.cabs[i][0] ? 1 : 0;
      if (want && cv.open === 0) { const c = Game.map!.cabinets[i]; Audio.clink(Math.hypot(c.x - R.camera.position.x, c.z - R.camera.position.z)); }
      cv.open = want ? Math.min(1, cv.open + dt / 0.5) : 0;
      cv.door.rotation.y = -1.9 * (1 - Math.pow(1 - cv.open, 3));
    });
    // the sticker box: its sticker on the card (once the host's said which), the lid up and the card gone once it's taken
    const sv: VwSboxView | null = Game.map && Game.map.sboxView;
    if (sv) {
      const sb = Game.sbox, name = sb && sb[0], taken = !!(sb && sb[1]);
      if (!sv.synced) { sv.synced = true; if (taken) sv.open = 1; } // (joined with it opened)
      sv.g.visible = !!name;
      if (name && sv.name !== name) {
        const p = Stickers.pic(name);
        if (p.bm) { sv.name = name; const k = 0.12 / Math.max(p.w, p.h); sv.card.scale.set(p.w * k, p.h * k, 1); sv.card.material.map = Stickers.material(name).map; sv.card.material.needsUpdate = true; }
      }
      sv.card.visible = sv.name === name && !taken;
      if (taken && sv.open === 0) { const b = Game.map!.sbox; Audio.clink(Math.hypot(b.x - R.camera.position.x, b.z - R.camera.position.z)); }
      sv.open = taken ? Math.min(1, sv.open + dt / 0.5) : 0;
      sv.lid.rotation.x = -1.8 * (1 - Math.pow(1 - sv.open, 3));
    }
    // the attachments box lid: up and back on its hinge once it's been opened
    const av: VwAboxView | null = Game.map && Game.map.aboxView;
    if (av) {
      const want = Game.abox && Game.abox[0] ? 1 : 0;
      if (!av.synced) { av.synced = true; if (want) av.open = 1; } // (joined with it already open)
      if (want && av.open === 0) { const ab = Game.map!.abox; Audio.clink(Math.hypot(ab.x - R.camera.position.x, ab.z - R.camera.position.z)); }
      av.open = want ? Math.min(1, av.open + dt / 0.6) : 0;
      av.lid.rotation.x = -1.9 * (1 - Math.pow(1 - av.open, 3));
      // its lights: one for each of the squad, lit in their colour till they've had their pick, then dark
      const ids = Object.keys(Game.roster || {}).sort(), uses = (Game.abox && Game.abox[1]) || {};
      const key = ids.map((id) => `${id}:${(Game.roster[id] || {}).color}:${uses[id] && uses[id][1] ? 1 : 0}`).join('|');
      if (key !== av.key) {
        av.key = key;
        for (const c of av.lights.children as THREE.Mesh<THREE.BufferGeometry, THREE.Material>[]) { c.geometry.dispose(); c.material.dispose(); }
        av.lights.clear();
        const gap = Math.min(0.05, 0.24 / Math.max(1, ids.length));
        ids.forEach((id, i) => {
          const used = uses[id] && uses[id][1], x = (i - (ids.length - 1) / 2) * gap;
          const bezel = new THREE.Mesh(new THREE.BoxGeometry(Math.min(0.04, gap - 0.006), 0.03, 0.004), new THREE.MeshStandardMaterial({ color: 0x0c0c0c, roughness: 0.6 }));
          bezel.position.set(x, 0, 0);
          const lens = new THREE.Mesh(new THREE.BoxGeometry(Math.min(0.032, gap - 0.014), 0.022, 0.004), new THREE.MeshBasicMaterial({ color: used ? 0x1c1c1c : (Game.roster[id] || {}).color || 0x44ff66 }));
          lens.position.set(x, 0, 0.002);
          av.lights.add(bezel, lens);
        });
      }
    }
    // the weapon case lid: latches clack, then it swings up and back against the wall
    const cv: VwLid | null = Game.map && Game.map.caseView;
    if (cv) {
      const want = Game.caseOpen ? 1 : 0;
      if (want && cv.open === 0) { const mc = Game.map!.case; Audio.clink(Math.hypot(mc.x - R.camera.position.x, mc.z - R.camera.position.z)); }
      cv.open = want ? Math.min(1, cv.open + dt / 0.8) : 0;
      cv.lid.rotation.x = -1.78 * (1 - Math.pow(1 - cv.open, 3));
    }

    // the yellow outline (keycards: glow), gently pulsing, while anything that has it is in the scene
    let glowing = false;
    for (const o of this.glow) if (o.parent && o.visible) { glowing = true; break; }
    R.hasGlow = glowing || !!this._haloOn;
    if (this._haloMats) for (const m of this._haloMats.bands) m.uniforms.opacity.value = m.userData.base;
    if (R.hasGlow) this._outRes!.value.set(window.innerWidth, window.innerHeight);
    if (glowing && this._outline) {
      const p = 0.5 + 0.5 * Math.sin(performance.now() / 300);
      for (const m of this._outline.bands) m.uniforms.opacity.value = m.userData.base * (0.7 + 0.3 * p);
    }

    // evidence being bagged: picked up off the floor and slid into an envelope (mine is drawn in first person)
    for (const [i, v] of this.evidence) {
      if (v.secured) continue;
      let t = -1, who: 'me' | VwPlayer | null = null;
      const ma = Me.action;
      if (ma && ma.kind === 'bag' && ma.target === i) { t = ma.t / ma.dur; who = 'me'; }
      for (const pv of this.players.values()) if (pv.st && pv.st.act === 'b' && pv.st.bt === i) { t = pv.st.ap || 0; who = pv; }
      const m = v.mesh;
      m.position.set(v.x, (v.y || 0) + 0.05, v.z); m.scale.setScalar(1); m.visible = true; // (on its own floor)
      if (who === 'me') m.visible = t < 0.22;
      else if (who) {
        const ph = U.bagPhases(t), gone = ph.insert;
        m.position.lerp(who.rig.armR.tie.getWorldPosition(new THREE.Vector3()), ph.lift);
        m.scale.setScalar(Math.max(0.02, 1 - gone));
        m.visible = gone < 0.98;
      }
    }

    // grenades
    for (const n of [...this.nades]) {
      if (n.kind === 'sticky') { // (flying till it holds; then held there, or to whoever it's on, its fuse burning)
        if (!n.stuck) { this.stickStep(n, dt, map); n.flyT = (n.flyT || 0) + dt; if (!n.stuck && n.flyT > Me.STICKY.MAX_FLY) n.stuck = {}; }
        else if (n.stuck.me && Me.pos) n.pos.copy(Me.pos).add(n.stuck.me);
        else if (n.stuck.bone && n.stuck.rig) { if (n.stuck.rig.root.parent) { n.stuck.bone.updateWorldMatrix(true, false); n.pos.copy(n.stuck.l!).applyMatrix4(n.stuck.bone.matrixWorld); } else n.stuck.bone = null; }
        n.mesh.position.copy(n.pos);
        if (!n.stuck) continue;
        n.fuse -= dt;
        n.mesh.material.emissive.setHex(Math.floor(n.fuse * 8) % 2 ? 0xff2200 : 0x220000);
        if (n.fuse > 0) continue;
        R.dynRoot.remove(n.mesh); this.nades.splice(this.nades.indexOf(n), 1);
        if (n.own) Me.explode(n.pos.clone(), Me.blastR(map, n.pos), Me.BLAST.dmg, true, 'sticky');
        continue;
      }
      const p = n.pos, was = p.clone();
      this.nadeStep(n, dt, map);
      // rolling: turned about the axis across its travel, as far as it's rolled
      const dx = p.x - was.x, dz = p.z - was.z, roll = Math.hypot(dx, dz);
      if (roll > 1e-4 && n.onGround) n.mesh.rotateOnWorldAxis(new THREE.Vector3(dz / roll, 0, -dx / roll), roll / this.NADE_R);
      n.mesh.position.copy(p);
      n.fuse -= dt;
      n.mesh.material.emissive.setHex(Math.floor(n.fuse * 8) % 2 ? 0xff2200 : 0x220000);
      if (n.fuse <= 0) {
        if ((n.kind === 'flash' || n.kind === 'tb') && !n.own) { R.dynRoot.remove(n.mesh); this.nades.splice(this.nades.indexOf(n), 1); continue; } // (someone else's: its bang comes from the host)
        R.dynRoot.remove(n.mesh);
        this.nades.splice(this.nades.indexOf(n), 1);
        // (a frag or a thermobaric goes off where it is: at its own middle, NADE_R off whatever it's lying on, so its downward chips meet
        // that floor a hand's breadth out and its blast is a surface burst's: js/player.ts blastR. A flashbang's flash a little above it.)
        if (n.own && n.kind === 'flash') Me.flashBang(p.clone().add(new THREE.Vector3(0, 0.1, 0)));
        else if (n.own && n.kind === 'tb') Me.thermobaric(p.clone());
        else if (n.own) Me.explode(p.clone(), Me.blastR(map, p), Me.BLAST.dmg, true);
        else if (n.enemy && Net.isHost) Net.toHost({ t: 'eboom', p: [p.x, p.y, p.z] }); // (a suspect's: where it went off on the host's screen is where it goes off, js/server.ts enemyBoom)
      }
    }

    // warn about any live grenade nearby (yours hurt too)
    let near = null, nd = 7;
    if (Me.pos && !Me.dead) for (const n of this.nades) { const d = n.pos.distanceTo(Me.pos); if (d < nd) { nd = d; near = n; } }
    HUD.nadeWarn(near);

    for (const pg of this.pings) pg.t -= dt;
    this.pings = this.pings.filter((pg: { t: number }) => pg.t > 0);
  },
};
ReplayEnv.Views = Views; // (what the replay asks of it: js/replayenv.ts)
Hooks.enemyView = (id) => Views.enemies.get(id); // (what your rounds did to a suspect: js/arsenal.ts kill)
