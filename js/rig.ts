'use strict';
// Character rig: a jointed skeleton animated procedurally, with hitboxes that ride the bones.
//
//   root (ground, yaw) → body (tips over when downed) → hips → spine → chest → neck → head
//                                                                    chest → shoulders → upper arm → forearm
//                                                             hips → thigh → shin
// Legs use two-bone IK onto procedurally placed feet (no foot sliding, works for strafing and
// backpedalling, and crouching just lowers the hips). Arms use two-bone IK onto the grip and
// support-hand points of the carried gun (G.GunModels), so hands stay on any weapon.
// Upper body handles aim pitch, low-ready, corner leans, recoil, flinches and grenade throws.
// Dead characters go to a Verlet ragdoll (see ragdollInit). Living suspects and civilians are the same ragdoll,
// powered: muscles pull each joint toward the animation, as strong as the person is (see powerStep).
interface Ragdoll { // the Verlet ragdoll a dead (or powered, living) rig carries: particles 0 pelvis ... 15 right foot
  P: THREE.Vector3[]; prev: THREE.Vector3[]; r: number[]; still: number; asleep: boolean; roll: RagRoll | null; on: Uint8Array; sp: Float32Array; rigid: number[][]; topple: THREE.Vector3; min: number[][];
  // (what the solver and the handling add as they go)
  handled?: { t: number } | null; calm?: number; push?: THREE.Vector3 | null; keepPin?: number; drive?: { T: THREE.Vector3[]; Tv: THREE.Vector3[]; [field: string]: any } | null;
  Pold?: THREE.Vector3[]; acc?: number; pinT?: number; Tprev?: THREE.Vector3[]; R?: THREE.Vector3[]; armL?: number;
  near?: any[] | null; // the level's solids around the body (what stops a person), gathered once a step: gather
}
interface RagRoll { t: number; driven?: boolean; [field: string]: any } // a body being rolled onto its front (planRoll)
interface RigArm { sh: THREE.Object3D; up: THREE.Object3D; lo: THREE.Object3D; tie: THREE.Mesh }
// a rider's swing under the trolley (zipSwing): th, how far the feet are swung forward of hanging straight down (rad), its rate, and
// the speed along the line (eased) and the acceleration of that it has been working from
interface ZipSwing { th: number; w: number; v: number; a: number }
interface RigLeg { th: THREE.Object3D; sh: THREE.Object3D }
type RigState = 'alive' | 'down' | 'dead';
interface Rig { // a character's skeleton and its meshes (what create makes, and what update, the hit and the zip tie add as they go)
  hairMesh: THREE.Mesh | null; look: Record<string, any>; pantsM: THREE.Material; seat: THREE.Mesh[] | null; kitParts: THREE.Object3D[]; kitKey: string | null; kit: Record<string, any> | null;
  callsign: { id: string; name: string } | null; root: THREE.Object3D; body: THREE.Object3D; hips: THREE.Object3D; spine: THREE.Object3D; chest: THREE.Object3D; neck: THREE.Object3D; head: THREE.Object3D;
  armL: RigArm; armR: RigArm; legL: RigLeg; legR: RigLeg; gunMount: THREE.Object3D; slingMount: THREE.Object3D; hipMount: THREE.Object3D; slung: boolean; mats: any[]; scale: number; style: string;
  gun: THREE.Object3D | null; gunInfo: Record<string, any> | null; gunKey: string | null; phase: number; vel: THREE.Vector3; lastPos: THREE.Vector3 | null;
  crouchW: number; aimW: number; lean: number; kick: number; flinch: THREE.Vector3; throwT: number; state: string; deadT: number; fallX: number; fallZ: number; downW: number;
  hb: any[] | null; dbg: THREE.Mesh[] | null; rd: Ragdoll;
  // (set by create)
  setGun(code: any, skin?: any): void; update(dt: number, p: any): void; hitboxes(): any[]; recoil(deg?: number): void; hit(dir: any, mv?: number): void; dropGun(): void; goLimp(): void;
  die(dir: any): void; throwNade(str?: number): void; setKit(k: any): void; setCallsign(id: string, name: string): void; holster(on: boolean): void; zip(on: boolean, instant?: boolean): void;
  secure(t: number): void; settle(sec?: number): void; startle(): void; dispose(): void;
  // (what the animation keeps from frame to frame)
  powered?: boolean; limp?: boolean; zipped?: boolean; zipKit?: THREE.Object3D; zipT?: number; zipYaw?: number | null; zipSw?: ZipSwing; proneW?: number; proneS?: number; effPh?: number; effT?: number; braceW?: number; gunAimW?: number; gunKick?: number;
  gunBase?: { p: THREE.Vector3; q: THREE.Quaternion; s: THREE.Vector3 }; gunBaseOf?: THREE.Object3D; gunSupport?: THREE.Vector3 | null; bipodK?: number; hitDir?: THREE.Vector3; xbLoaded?: any;
  blindW?: number; radioW?: number; dazeW?: number; blindT?: number; atakW?: number; atak?: THREE.Group; handNade?: any; throwHand?: boolean; throwStr?: any; dropped?: { g: THREE.Object3D; vy: number; spin: number; floor?: number; [field: string]: any } | null;
  [bone: string]: any; // (a bone looked up by name: js/ballistics.ts boneOf, the hitbox readouts of js/hud.ts and js/highlights.ts; and what js/hud.ts keeps on a rig)
}
const G_Rig = (() => {
  const T = THREE;
  const UP = new T.Vector3(0, 1, 0);
  const _a = new T.Vector3(), _b = new T.Vector3(), _c = new T.Vector3(), _d = new T.Vector3(), _e = new T.Vector3();
  const _q = new T.Quaternion(), _q2 = new T.Quaternion(), _m = new T.Matrix4();

  // limb proportions (metres at scale 1)
  const THIGH = 0.44, SHIN = 0.44, UARM = 0.29, FARM = 0.27;
  const HIP_H = 0.95, CROUCH_H = 0.58;

  let debug = false;
  try { debug = new URLSearchParams(location.search).has('hitboxes'); } catch (e) { /* ignore */ }

  // Rotate a bone (whose length runs down its local -Y) so it points from a to b in world space,
  // with its local X along `side` (keeps limb twist stable).
  function aimBone(bone: THREE.Object3D, a: THREE.Vector3, b: THREE.Vector3, side: THREE.Vector3) {
    const y = _d.subVectors(a, b).normalize();                 // bone's +Y points back toward its parent joint
    const z = _e.crossVectors(side, y).normalize();
    const x = _c.crossVectors(y, z);
    _m.makeBasis(x, y, z);
    _q.setFromRotationMatrix(_m);
    bone.parent!.getWorldQuaternion(_q2).invert();
    bone.quaternion.copy(_q2.multiply(_q));
    bone.updateMatrixWorld(true);
  }
  // Two-bone IK: place upper/lower so the end reaches `target`, bending toward `pole`.
  function ik(upper: THREE.Object3D, lower: THREE.Object3D, l1: number, l2: number, target: THREE.Vector3, pole: THREE.Vector3) {
    const A = upper.getWorldPosition(_a);
    const D = _b.subVectors(target, A);
    const dist = G.U.clamp(D.length(), 0.01, (l1 + l2) * 0.999);
    const dir = D.normalize();
    const cosA = G.U.clamp((l1 * l1 + dist * dist - l2 * l2) / (2 * l1 * dist), -1, 1);
    const sinA = Math.sqrt(1 - cosA * cosA);
    const toPole = new T.Vector3().subVectors(pole, A);
    const bend = toPole.sub(dir.clone().multiplyScalar(toPole.dot(dir))).normalize();
    const elbow = A.clone().addScaledVector(dir, l1 * cosA).addScaledVector(bend, l1 * sinA);
    const end = A.clone().addScaledVector(dir, dist);
    const side = new T.Vector3().crossVectors(dir, bend).normalize();
    aimBone(upper, A, elbow, side);
    aimBone(lower, elbow, end, side);
  }

  function joint(parent: THREE.Object3D, x: number, y: number, z: number) { const j = new T.Group(); j.position.set(x, y, z); parent.add(j); return j; }

  // Clothing palettes. Suspects wear street clothes (a share in balaclavas); civilians wear brighter,
  // everyday clothes with faces and hair showing — telling the two apart is the job.
  const PAL = {
    hoodie: [0x2b2b2d, 0x3c4a5a, 0x5a3a2a, 0x2f4a3a, 0x5e5e60, 0x4a2f48, 0x1f2a3a],
    shirt: [0xd9d9d6, 0x9ec5e8, 0xe8c79e, 0xb84a4a, 0x6aa86a, 0xe0d050, 0xd88fb0, 0x8fa3d8],
    pants: [0x2b3550, 0x3a3a3c, 0x4a4030, 0x3b4a66, 0x6b5b45],
    skin: [0x8a6a52, 0xc89a78, 0x5a3e2c, 0xe0b896, 0xa47458],
    hair: [0x1c1612, 0x3b2a1a, 0x6b4a2a, 0xa08060, 0x2a2a2a],
  };

  // ---------------------------------------------------------------- an officer's kit, as worn
  // k: { helmet, face, carrier, plate, sh (shoulder armour), gr (pelvis armour), cp (pouches on the carrier), belt, lg (leg
  // armour), bp (on the belt), pack, ifak } (gear ids, or flags). Built from boxes in the chest / head / hips / limb frames:
  // x right, y up, -z the front.
  // An officer's own look (the main menu), and what they wear if they haven't picked
  const OFFICER_LOOK: Record<string, string | number> = { top: 'combat', topC: 0x3a4048, pants: 'combat', pantsC: 0x2e3238, eyes: 'shooting', gloves: 'tactical' };
  const LOOKS: Record<string, string[]> = { top: ['combat', 'longsleeve', 'tshirt', 'hoodie'], pants: ['combat', 'cargo', 'jeans'], eyes: ['none', 'glasses', 'shooting', 'goggles'], gloves: ['tactical', 'leather', 'fingerless', 'none'] };
  // a look from anywhere (the network): known options and colours only
  function cleanLook(l: Record<string, any>) {
    const o = Object.assign({}, OFFICER_LOOK);
    if (!l || typeof l !== 'object') return o;
    for (const k of Object.keys(LOOKS)) if (LOOKS[k].includes(l[k])) o[k] = l[k];
    for (const k of ['topC', 'pantsC']) if (Number.isInteger(l[k]) && l[k] >= 0 && l[k] <= 0xffffff) o[k] = l[k];
    return o;
  }
  const KIT_COL = (d: any) => (!d ? 0x2e3236 : /Sable|Paragon/.test(d.brand || '') ? 0x5a5240 : /Kestrel|Vantage/.test(d.brand || '') ? 0x4d5639 : 0x2e3236);
  const kitMat = new Map();
  const KM = (c: number, o?: Record<string, any>) => { const key = c + JSON.stringify(o || {}); if (!kitMat.has(key)) kitMat.set(key, new T.MeshLambertMaterial(Object.assign({ color: c }, o || {}))); return kitMat.get(key); };
  const PACK: Record<string, number[]> = { 'k.sling': [0.22, 0.26, 0.09, 0.12], 'k.assault': [0.3, 0.36, 0.13, 0.14], 'k.ruck': [0.34, 0.5, 0.2, 0.2] };
  // the name patch, high on the back (rig.callsign: { id: their animal, name }): on the backpack if they wear
  // one, else on the carrier, else on the shirt
  function backPatch(rig: Rig, k: any) {
    const cs = rig.callsign;
    if (!cs || !G.Callsigns) return;
    const D = (id: any) => (id && G.Gear && G.Gear.DEFS[id]) || null, cd = D(k && k.carrier), pd = D(k && k.pack);
    let y = 0.22, z = 0.128;
    if (pd) { const [, h, d, py] = PACK[pd.id] || PACK['k.assault']; z = (cd && cd.id !== 'c.recon' ? 0.15 : 0.12) + d + 0.003; y = py + h / 2 - 0.05; }
    else if (cd && cd.thin) z = 0.126;
    else if (cd && cd.id !== 'c.recon') { y = 0.2; z = ((cd.id === 'c.heavy' ? 0.3 : 0.27) + (k.plate ? 0.03 : 0)) / 2 + 0.003; }
    const m = new T.Mesh(new T.PlaneGeometry(0.2, 0.05), new T.MeshLambertMaterial({ map: G.Callsigns.backTex(cs.id, cs.name) }));
    m.position.set(0, y, z);
    rig.chest.add(m); rig.kitParts.push(m);
  }
  // a callsign with "thicc" in it: a fuller seat to the trousers, behind the pelvis and under the belt and the kit at the back
  function setSeat(rig: Rig) {
    const on = !!(rig.callsign && /thicc/i.test(rig.callsign.name));
    if (!!rig.seat === on) return;
    if (rig.seat) { for (const m of rig.seat) { rig.hips.remove(m); m.geometry.dispose(); } rig.seat = null; return; }
    rig.seat = [-1, 1].map((x) => {
      const m = new T.Mesh(new T.SphereGeometry(0.1, 14, 10), rig.pantsM);
      m.position.set(x * 0.068, -0.075, 0.075); m.scale.set(1, 0.9, 1.1); rig.hips.add(m);
      return m;
    });
  }
  function setKit(rig: Rig, k: any) {
    const key = JSON.stringify(k || {}) + (rig.callsign ? '|' + rig.callsign.id + '|' + rig.callsign.name : '');
    if (rig.kitKey === key) return;
    rig.kitKey = key; rig.kit = k;
    for (const m of rig.kitParts as THREE.Mesh[]) { if (m.parent) m.parent.remove(m); if (m.geometry) m.geometry.dispose(); }
    rig.kitParts = [];
    backPatch(rig, k);
    if (!k) return;
    const D = (id: any) => (id && G.Gear && G.Gear.DEFS[id]) || null;
    let part: string | null = null; // (which piece of kit the parts being made are: the hangar shows each on its own)
    const box = (parent: THREE.Object3D, w: number, h: number, d: number, c: number, x: number, y: number, z: number, o?: Record<string, any>) => { const m = new T.Mesh(new T.BoxGeometry(w, h, d), KM(c, o)); m.position.set(x, y, z); m.userData.part = part; parent.add(m); rig.kitParts.push(m); return m; };
    const add = (parent: THREE.Object3D, m: THREE.Object3D, x: number, y: number, z: number) => { m.position.set(x, y, z); m.userData.part = part; parent.add(m); rig.kitParts.push(m); return m; };
    const pouches = (parent: THREE.Object3D, n: number, c: number, x0: number, y0: number, z: number, w = 0.07, h = 0.09) => { for (let i = 0; i < Math.min(n, 8); i++) box(parent, w, h, 0.05, c, x0 + (i % 4) * (w + 0.015), y0 - Math.floor(i / 4) * (h + 0.015), z); };
    const C = rig.chest, Hd = rig.head, Hp = rig.hips;
    // the helmet: its cut and colour by model; rails and a night-vision mount on the modern ones
    const hd = D(k.helmet);
    part = 'helmet';
    if (rig.hairMesh) rig.hairMesh.visible = !hd;
    const putHd = (m: THREE.Object3D) => add(Hd, m, m.position.x, m.position.y, m.position.z);
    if (hd) G.Headgear.helmet(hd.id, KM, putHd); // (its cut, rails, shroud and visor: js/headgear.ts)
    // on the helmet's mount: a mandible round the jaw, or a shield over the face
    const fd = D(k.face);
    part = 'face';
    if (fd && hd) G.Headgear.face(fd.id, hd.id, KM, putHd);
    // the carrier: a soft vest, a slick plate carrier, a chest rig, or a full carrier with its pouches
    const cd = D(k.carrier), cc = KIT_COL(cd);
    part = 'carrier';
    if (cd) {
      if (cd.thin) box(C, 0.4, 0.27, 0.245, cd.col, 0, 0.12, 0);
      else if (cd.id === 'c.recon') { // a chest rig: a panel of pouches across the front, straps over the shoulders
        box(C, 0.36, 0.15, 0.06, cc, 0, 0.03, -0.13);
        for (const x of [-1, 1]) box(C, 0.04, 0.26, 0.24, cc, x * 0.12, 0.17, 0);
        pouches(C, Math.max(2, k.cp || 0), 0x23251f, -0.13, 0.04, -0.17);
      } else {
        const heavy = cd.id === 'c.heavy', depth = (heavy ? 0.3 : 0.27) + (k.plate ? 0.03 : 0);
        box(C, heavy ? 0.44 : 0.4, heavy ? 0.32 : 0.28, depth, cc, 0, 0.12, 0);
        if (k.plate) { part = 'plate'; box(C, 0.26, 0.22, 0.02, cc, 0, 0.14, -depth / 2 - 0.005); part = 'carrier'; } // the plate's outline at the front
        pouches(C, k.cp || 0, 0x23251f, -0.16, 0.06, -depth / 2 - 0.03);
        if (heavy) for (const x of [-1, 1]) box(C, 0.13, 0.07, 0.2, cc, x * 0.22, 0.3, 0); // shoulder armour
        if (heavy) { box(C, 0.3, 0.07, 0.26, cc, 0, 0.32, 0.01); box(Hp, 0.2, 0.16, 0.04, cc, 0, -0.06, -0.12); } // collar, groin plate
      }
    }
    // what's mounted on the carrier and belt, on the limbs they cover: pads and caps round the top of each arm, a panel or a
    // wrap at the hips, panels, wraps and guards down the legs (each where its protection is: js/ballistics.ts covers)
    const tube = (parent: THREE.Object3D, r0: number, r1: number, h: number, c: number, y: number, z = 0) => add(parent, new T.Mesh(new T.CylinderGeometry(r0, r1, h, 12), KM(c)), 0, y, z);
    const sd = D(k.sh);
    part = 'shoulder';
    if (sd) {
      const hard = sd.id === 's.plate', c = KIT_COL(sd);
      for (const arm of [rig.armL, rig.armR]) {
        tube(arm.up, 0.066, 0.064, 0.13, hard ? 0x4a4438 : c, -0.065);
        if (hard) add(arm.sh, new T.Mesh(new T.SphereGeometry(0.08, 10, 8), KM(0x4a4438)), 0, 0.005, 0);
        else box(arm.sh, 0.1, 0.03, 0.1, c, 0, 0.055, 0);
      }
    }
    const gd = D(k.gr);
    part = 'groin';
    if (gd) {
      const c = KIT_COL(gd) === 0x2e3236 ? 0x34383c : KIT_COL(gd);
      if (gd.id === 'g.pelvis') { const w = add(Hp, new T.Mesh(new T.CylinderGeometry(0.17, 0.175, 0.18, 12), KM(c)), 0, -0.02, 0); w.scale.z = 0.72; }
      else box(Hp, 0.2, 0.17, 0.025, c, 0, -0.06, -0.122);
      if (gd.id === 'g.plate') box(Hp, 0.15, 0.13, 0.015, 0x3d4044, 0, -0.06, -0.142);
    }
    const ld = D(k.lg);
    part = 'legs';
    if (ld) {
      const c = KIT_COL(ld) === 0x2e3236 ? 0x34383c : KIT_COL(ld), shin = ld.id === 'l.shin' || ld.id === 'l.full', wrap = ld.id === 'l.wrap' || ld.id === 'l.full';
      for (const leg of [rig.legL, rig.legR]) {
        if (ld.id === 'l.thigh') box(leg.th, 0.13, 0.22, 0.025, c, 0, -0.12, -0.088);
        if (wrap) tube(leg.th, 0.096, 0.074, 0.34, c, -0.18);
        if (shin) { box(leg.sh, 0.085, 0.31, 0.02, 0x4a4f55, 0, -0.21, -0.062); box(leg.sh, 0.1, 0.09, 0.03, 0x4a4f55, 0, -0.01, -0.066); }
      }
    }
    // the belt and what's on it; the IFAK at the back
    const bd = D(k.belt);
    part = 'belt';
    if (bd) {
      box(Hp, 0.35, 0.06, 0.25, bd.id === 'b.war' ? 0x3b3528 : 0x232527, 0, 0.06, 0);
      const n = k.bp || 0;
      for (let i = 0; i < Math.min(n, 6); i++) { const side = i % 2 ? 1 : -1, j = i >> 1; box(Hp, 0.05, 0.08, 0.07, 0x23251f, side * 0.18, 0.04, -0.06 + j * 0.08); }
    }
    part = 'ifak';
    if (k.ifak) box(bd ? Hp : C, 0.12, 0.1, 0.06, 0x7a2420, 0, bd ? 0.04 : -0.02, bd ? 0.14 : 0.13);
    // the backpack, by size
    const pd = D(k.pack);
    part = 'pack';
    if (pd) {
      const [w, h, d, y] = PACK[pd.id] || PACK['k.assault'];
      const back = (cd && cd.id !== 'c.recon' ? 0.15 : 0.12) + d / 2;
      box(C, w, h, d, KIT_COL(pd), 0, y, back);
      box(C, w * 0.8, h * 0.3, 0.04, 0x23251f, 0, y - h * 0.2, back + d / 2 + 0.02); // a pocket
    }
  }
  // A suspect's armour (G.ARMORS ids) as the gear an officer would wear: the same models for the same kit
  function armourKit(vest: string, helmet: string, armored: boolean, face?: any, ex?: any) {
    const V = ({ soft2: ['c.lite', 0, 0], soft: ['c.ghost', 0, 0], steel: ['c.patrol', 1, 2], ceramic: ['c.assault', 1, 3], assault: ['c.heavy', 1, 2] } as Record<string, (string | number)[]>)[vest] || (armored ? ['c.heavy', 1, 2] : null);
    const H = ({ ach: 'h.ach', riflehelm: 'h.rifle', visor: 'h.visor' } as Record<string, string>)[helmet] || (armored ? 'h.rifle' : 0);
    const X = (kind: string) => (ex || []).find((id: string) => G.Gear.DEFS[id] && G.Gear.DEFS[id].kind === kind) || 0;
    return { helmet: H, face: (H && face) || 0, carrier: V ? V[0] : 0, plate: V ? V[1] : 0, sh: X('shoulder'), gr: X('groin'), cp: V ? V[2] : 0, belt: armored ? 'b.battle' : 0, lg: X('legs'), bp: armored ? 2 : 0, pack: 0, ifak: 0 };
  }
  function create(o: any) {
    const s = o.scale || 1, style = o.style || 'tactical';
    let seed = (o.seed || Math.floor(Math.random() * 1e6)) >>> 0;
    const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
    const pick = (a: any[]) => a[Math.floor(rnd() * a.length)];
    const L = (c: number) => new T.MeshLambertMaterial({ color: c });
    // ---- what they're wearing: a look { top, topC, pants, pantsC, eyes, gloves }. Officers bring their own (the
    // main menu); everyone else is dressed for who they are.
    let vestM = null, helmetM = null, headCover = null, hairM = null;
    const skin = L(o.mannequin ? 0xa9afb5 : o.skinColor != null ? o.skinColor : pick(PAL.skin)); // (a mannequin: plain grey, no face, no hair: see G.Hangar)
    const gear = L(0x23251f);
    let look;
    if (style === 'tactical') look = Object.assign({}, OFFICER_LOOK, o.look || {});
    // everyone else, from the same wardrobe, by who they are: enforcers in combat clothes and balaclavas,
    // suspects in hoodies mostly (sometimes a T-shirt or a combat shirt, gloves, shooting glasses), civilians in
    // everyday clothes (some in glasses)
    else if (style === 'armored') look = { top: 'combat', topC: pick([0x2e3136, 0x26282c, 0x3a3d40, 0x4d5639]), pants: 'combat', pantsC: pick([0x26282c, 0x2e3238, 0x3a3a3c]), eyes: rnd() < 0.4 ? 'goggles' : rnd() < 0.5 ? 'shooting' : 'none', gloves: 'tactical' };
    else if (style === 'suspect') {
      const tp = rnd();
      look = { top: tp < 0.55 ? 'hoodie' : tp < 0.75 ? 'tshirt' : tp < 0.9 ? 'longsleeve' : 'combat', topC: pick(PAL.hoodie), pants: pick(['jeans', 'jeans', 'cargo', 'combat']), pantsC: pick(PAL.pants),
        eyes: rnd() < 0.1 ? 'shooting' : rnd() < 0.08 ? 'glasses' : 'none', gloves: rnd() < 0.3 ? 'tactical' : rnd() < 0.15 ? 'fingerless' : rnd() < 0.1 ? 'leather' : 'none' };
    } else {
      const tp = rnd();
      look = { top: tp < 0.5 ? 'tshirt' : tp < 0.85 ? 'longsleeve' : 'hoodie', topC: pick(PAL.shirt), pants: pick(['jeans', 'jeans', 'cargo']), pantsC: pick(PAL.pants), eyes: rnd() < 0.15 ? 'glasses' : 'none', gloves: 'none' };
    }
    const top = L(look.topC), bottom = L(look.pantsC);
    // a combat shirt: a light body (it's worn under armour) with the sleeves in its colour
    const torsoM = look.top === 'combat' ? L(new T.Color(look.topC).lerp(new T.Color(0xb8b0a0), 0.4).getHex()) : top;
    if (style === 'tactical') { if (o.bare) hairM = o.mannequin ? null : L(pick(PAL.hair)); else { vestM = L(0x2a2c28); helmetM = L(0x26282a); } }
    else if (style === 'armored') { if (!o.dressed) { vestM = L(o.boss ? 0x3a2f24 : 0x3b4232); helmetM = L(0x2a2d30); } headCover = L(0x161616); }
    else if (style === 'suspect') { if (rnd() < 0.6) headCover = L(0x151515); else hairM = L(pick(PAL.hair)); }
    else hairM = L(pick(PAL.hair));
    // armour worn over street clothes (o.vest: 'soft', 'soft2' or a plate carrier; o.helmet)
    if (!o.dressed && o.vest && !vestM) vestM = L(o.vest === 'soft2' ? 0x5c5a50 : o.vest === 'soft' ? 0x34373b : 0x3b4232);
    if (!o.dressed && o.helmet && !helmetM) { helmetM = L(0x2a2d30); hairM = null; }
    const gloveM = ({ tactical: L(0x1c1d1f), leather: L(0x5e3e24), fingerless: L(0x1c1d1f) } as Record<string, THREE.MeshLambertMaterial>)[look.gloves] || null;
    const bootM = style === 'civ' ? L(pick([0xeeeeee, 0x3a2a1a, 0x222222])) : L(0x1e1f21);
    const dark = L(0x141414);
    const mats = [top, bottom, skin];
    const tieMat = L(0xe6e6e0); // white zip tie, easy to spot on a body
    const M_ = (geo: THREE.BufferGeometry, m: THREE.Material, x = 0, y = 0, z = 0, parent?: THREE.Object3D) => { const me = new T.Mesh(geo, m); me.position.set(x, y, z); if (parent) parent.add(me); return me; };
    const cyl = (rt: number, rb: number, h: number, m?: any, seg = 12) => new T.CylinderGeometry(rt, rb, h, seg);

    // ---- the body: a tapered chest and waist, sloping shoulders, a rounded head with a face
    const root = new T.Group();
    const body = joint(root, 0, 0, 0);
    body.scale.setScalar(s);
    const hips = joint(body, 0, HIP_H, 0);
    const pelvis = M_(cyl(0.155, 0.14, 0.2), bottom, 0, 0, 0, hips); pelvis.scale.z = 0.7;
    const spine = joint(hips, 0, 0.08, 0);
    const abdomen = M_(cyl(0.145, 0.152, 0.17), torsoM, 0, 0.1, 0, spine); abdomen.scale.z = 0.7;
    const chest = joint(spine, 0, 0.19, 0);
    const torso = M_(cyl(0.2, 0.152, 0.33, 14), torsoM, 0, 0.14, 0, chest); torso.scale.z = 0.62;
    const traps = M_(cyl(0.075, 0.19, 0.07, 14), torsoM, 0, 0.34, 0, chest); traps.scale.z = 0.6; // neck down to the shoulders
    if (vestM) {
      M_(new T.BoxGeometry(0.41, 0.28, 0.28), vestM, 0, 0.12, 0, chest);
      for (const x of [-0.12, 0, 0.12]) M_(new T.BoxGeometry(0.09, 0.09, 0.05), gear, x, 0.05, -0.16, chest);
      if (style === 'armored') for (const x of [-0.22, 0.22]) M_(new T.BoxGeometry(0.13, 0.07, 0.2), vestM, x, 0.3, 0, chest);
    }
    if (look.top === 'hoodie') { const hood = M_(new T.SphereGeometry(0.11, 12, 8), top, 0, 0.31, 0.1, chest); hood.scale.set(1.25, 0.55, 0.75); } // the hood, down
    const neck = joint(chest, 0, 0.3, 0);
    const faceM = headCover || skin;
    M_(cyl(0.048, 0.056, 0.1, 10), faceM, 0, 0.02, 0, neck);
    const head = joint(neck, 0, 0.06, 0);
    // the head: cranium, jaw, nose, ears; the same shape whatever's on it (it sits inside every helmet)
    const cranium = M_(new T.SphereGeometry(0.1, 18, 14), faceM, 0, 0.13, 0, head); cranium.scale.set(0.92, 1.06, 1.0);
    const jaw = M_(new T.SphereGeometry(0.075, 14, 10), faceM, 0, 0.065, -0.018, head); jaw.scale.set(1.0, 0.95, 1.05);
    M_(new T.BoxGeometry(0.022, 0.038, 0.03), faceM, 0, 0.105, -0.1, head); // nose
    for (const x of [-1, 1]) { const ear = M_(new T.SphereGeometry(0.026, 8, 6), faceM, x * 0.091, 0.12, 0.005, head); ear.scale.set(0.45, 1, 0.75); }
    if (headCover) { // balaclava: the eyes show through a slot
      M_(new T.BoxGeometry(0.12, 0.034, 0.012), skin, 0, 0.136, -0.094, head);
      for (const x of [-0.033, 0.033]) M_(new T.BoxGeometry(0.02, 0.012, 0.006), dark, x, 0.136, -0.1, head);
    } else if (!o.mannequin) {
      for (const x of [-0.033, 0.033]) { M_(new T.BoxGeometry(0.022, 0.013, 0.008), dark, x, 0.135, -0.097, head); M_(new T.BoxGeometry(0.03, 0.007, 0.01), hairM || dark, x, 0.152, -0.097, head); } // eyes, brows
      M_(new T.BoxGeometry(0.04, 0.006, 0.006), L(0x5a3a32), 0, 0.055, -0.096, head); // mouth
    }
    let hairMesh = null;
    if (hairM) { hairMesh = M_(new T.SphereGeometry(0.104, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.46), hairM, 0, 0.134, 0.006, head); hairMesh.scale.set(0.94, 1.06, 1.02); }
    // eyewear
    if (look.eyes === 'glasses') {
      const fr = dark, lens = L(0x9ab4c4); lens.transparent = true; lens.opacity = 0.35;
      for (const x of [-0.034, 0.034]) { M_(new T.BoxGeometry(0.034, 0.024, 0.004), lens, x, 0.136, -0.107, head); M_(new T.BoxGeometry(0.036, 0.004, 0.005), fr, x, 0.149, -0.107, head); }
      M_(new T.BoxGeometry(0.018, 0.004, 0.005), fr, 0, 0.142, -0.107, head);
      for (const x of [-1, 1]) M_(new T.BoxGeometry(0.004, 0.004, 0.1), fr, x * 0.088, 0.142, -0.06, head);
    } else if (look.eyes === 'shooting') { // wraparound shooting glasses
      const lens = L(0x1a1d22); lens.transparent = true; lens.opacity = 0.85;
      M_(new T.BoxGeometry(0.13, 0.03, 0.008), lens, 0, 0.137, -0.105, head);
      for (const x of [-1, 1]) M_(new T.BoxGeometry(0.005, 0.012, 0.1), dark, x * 0.088, 0.142, -0.06, head);
    } else if (look.eyes === 'goggles') { // a frame, a tinted lens and a strap round the head
      M_(new T.BoxGeometry(0.14, 0.052, 0.03), L(0x2a2c2e), 0, 0.137, -0.098, head);
      const lens = L(0x5a6a50); lens.transparent = true; lens.opacity = 0.8;
      M_(new T.BoxGeometry(0.12, 0.036, 0.006), lens, 0, 0.137, -0.115, head);
      const strap = M_(new T.TorusGeometry(0.1, 0.007, 4, 28), dark, 0, 0.14, 0.004, head); strap.rotation.x = Math.PI / 2; strap.scale.set(0.95, 1.04, 1);
    }
    if (helmetM) G.Headgear.helmet(style === 'tactical' ? 'h.fast' : 'generic', (c: number, op?: Record<string, any>) => (op ? new T.MeshLambertMaterial(Object.assign({ color: c }, op)) : L(c)), (m: THREE.Object3D) => head.add(m), helmetM.color.getHex()); // (js/headgear.ts)
    if (o.vex) { // Vex, as his portrait has him: a dark hood, a black visor with two orange eyes, a grey respirator, a gold strap
      const hoodM = new T.MeshLambertMaterial({ color: 0x1d1c18, side: T.DoubleSide });
      const hood = M_(new T.SphereGeometry(0.128, 18, 12, 5.58, 4.54, 0, Math.PI * 0.66), hoodM, 0, 0.125, 0.012, head); hood.scale.set(0.98, 1.04, 1.06); // (open at the front)
      const cowl = M_(new T.CylinderGeometry(0.115, 0.215, 0.17, 16, 1, true), hoodM, 0, 0.3, 0.02, chest); cowl.scale.z = 0.8; // (over the shoulders)
      M_(new T.BoxGeometry(0.19, 0.052, 0.05), L(0x101010), 0, 0.137, -0.088, head); // the visor
      const glow = new T.MeshBasicMaterial({ color: 0xff9a2e }), pupil = new T.MeshBasicMaterial({ color: 0xfff3c4 });
      for (const x of [-0.04, 0.04]) {
        const e = M_(new T.CylinderGeometry(0.0185, 0.0185, 0.008, 14), glow, x, 0.137, -0.116, head); e.rotation.x = Math.PI / 2;
        const p = M_(new T.CylinderGeometry(0.0085, 0.0085, 0.009, 10), pupil, x, 0.137, -0.1205, head); p.rotation.x = Math.PI / 2;
      }
      const mask = M_(new T.BoxGeometry(0.125, 0.07, 0.05), L(0x3b3b36), 0, 0.055, -0.083, head); mask.rotation.x = 0.12; // the respirator
      for (const x of [-0.03, 0, 0.03]) { const v = M_(new T.CylinderGeometry(0.0075, 0.0075, 0.006, 8), L(0x1b1b19), x, 0.05, -0.1105, head); v.rotation.x = Math.PI / 2; }
      const strap = M_(new T.BoxGeometry(0.045, 0.34, 0.012), L(0xc9a227), -0.1, 0.12, -0.151, chest); strap.rotation.z = -0.5; // gold, across the chest
    }
    if (style === 'suspect' && !headCover && rnd() < 0.5) { if (hairMesh) hairMesh.scale.y *= 0.9; G.Headgear.cap((c: number, op?: Record<string, any>) => (op ? new T.MeshLambertMaterial(Object.assign({ color: c }, op)) : L(c)), (m: THREE.Object3D) => head.add(m), pick(PAL.hoodie)); } // a baseball cap

    // a leader's radio kit (o.leader): a headset over the head (a band, an ear cup on the left with a boom mic curving to the mouth, a foam cup
    // on the right), and a radio set on the chest harness with its antenna up by the shoulder, a push-to-talk lead to the headset
    if (o.leader) {
      const hs = L(0x1c1d1f), cup = L(0x2c2f33), led = new T.MeshBasicMaterial({ color: 0x57e06b });
      const band = M_(new T.TorusGeometry(0.108, 0.006, 5, 24, Math.PI), hs, 0, 0.14, 0.005, head); band.rotation.z = 0; band.scale.set(1, 1.02, 1.0); band.rotation.y = Math.PI / 2;
      for (const x of [-1, 1]) M_(cyl(0.032, 0.032, 0.026, 12), x < 0 ? cup : hs, x * 0.106, 0.12, 0.005, head).rotation.z = Math.PI / 2;
      const boom = M_(new T.TorusGeometry(0.06, 0.0035, 4, 10, Math.PI * 0.6), hs, -0.09, 0.085, -0.055, head); boom.rotation.set(0, 0.6, -Math.PI / 2 - 0.5);
      M_(new T.SphereGeometry(0.011, 6, 5), cup, -0.045, 0.062, -0.1, head);
      M_(new T.BoxGeometry(0.075, 0.125, 0.04), cup, -0.15, 0.1, -0.175, chest); // the set
      M_(new T.BoxGeometry(0.05, 0.03, 0.006), L(0x4a5a46), -0.15, 0.13, -0.197, chest); // its little screen
      M_(new T.BoxGeometry(0.008, 0.008, 0.005), led, -0.128, 0.083, -0.197, chest); // a pilot light
      M_(cyl(0.005, 0.006, 0.2, 5), hs, -0.17, 0.27, -0.165, chest); // the antenna, up past the collar
      const lead = M_(cyl(0.0035, 0.0035, 0.2, 4), hs, -0.17, 0.2, -0.13, chest); lead.rotation.z = 0.18;
    }

    // ---- arms: tapered, with elbows; sleeves (short for a T-shirt), and hands with fingers and a thumb
    const longSleeves = look.top !== 'tshirt';
    const mkArm = (side: number) => {
      const sh = joint(chest, side * 0.2, 0.26, 0);
      M_(new T.SphereGeometry(0.066, 10, 8), vestM || top, 0, 0, 0, sh);
      const up = joint(sh, 0, 0, 0);
      if (longSleeves) M_(cyl(0.056, 0.047, UARM, 10), top, 0, -UARM / 2, 0, up);
      else { M_(cyl(0.06, 0.056, UARM * 0.45, 10), top, 0, -UARM * 0.22, 0, up); M_(cyl(0.05, 0.045, UARM * 0.7, 10), skin, 0, -UARM * 0.62, 0, up); }
      if (style === 'tactical' && side < 0 && o.animal && G.Callsigns) { // their animal's patch on the shoulder
        const p = new T.Mesh(new T.PlaneGeometry(0.058, 0.058), new T.MeshLambertMaterial({ map: G.Callsigns.armTex(o.animal) }));
        p.position.set(side * 0.06, -0.085, 0); p.rotation.y = side * Math.PI / 2; up.add(p);
      } else if (style === 'tactical' && side < 0 && o.color != null) M_(cyl(0.059, 0.059, 0.03, 12), L(o.color), 0, -0.08, 0, up); // the squad armband
      const lo = joint(up, 0, -UARM, 0);
      M_(new T.SphereGeometry(0.047, 10, 8), longSleeves ? top : skin, 0, 0, 0, lo); // elbow
      M_(cyl(0.046, 0.036, FARM, 10), longSleeves ? top : skin, 0, -FARM / 2, 0, lo);
      const handM = gloveM || skin, fingerM = look.gloves === 'fingerless' ? skin : handM;
      M_(new T.BoxGeometry(0.068, 0.08, 0.035), handM, 0, -FARM - 0.035, 0, lo); // palm
      const fing = M_(new T.BoxGeometry(0.066, 0.045, 0.03), fingerM, 0, -FARM - 0.095, -0.006, lo); fing.rotation.x = 0.25;
      const thumb = M_(new T.BoxGeometry(0.022, 0.045, 0.024), fingerM, side * -0.036, -FARM - 0.045, -0.02, lo); thumb.rotation.z = side * 0.35;
      const tie = new T.Mesh(new T.TorusGeometry(0.04, 0.011, 5, 12), tieMat); tie.rotation.x = Math.PI / 2; tie.position.y = -FARM + 0.025; tie.visible = false; lo.add(tie);
      return { sh, up, lo, tie };
    };
    const armL = mkArm(-1), armR = mkArm(1);
    // ---- legs: tapered thighs and shins, knees; cargo pockets or knee pads; boots (shoes for civilians)
    const mkLeg = (side: number) => {
      const th = joint(hips, side * 0.1, -0.03, 0);
      M_(cyl(0.088, 0.064, THIGH, 12), bottom, 0, -THIGH / 2, 0, th);
      if (look.pants === 'cargo') M_(new T.BoxGeometry(0.035, 0.12, 0.1), bottom, side * 0.08, -THIGH * 0.5, 0, th); // the cargo pocket
      const sh = joint(th, 0, -THIGH, 0);
      M_(new T.SphereGeometry(0.064, 10, 8), bottom, 0, 0, 0, sh); // knee
      if (look.pants === 'combat') M_(new T.BoxGeometry(0.09, 0.1, 0.03), dark, 0, -0.03, -0.06, sh); // knee pad
      M_(cyl(0.061, 0.046, SHIN, 10), bottom, 0, -SHIN / 2, 0, sh);
      if (style !== 'civ') M_(cyl(0.054, 0.058, 0.13, 10), bootM, 0, -SHIN + 0.03, 0, sh); // the boot's upper
      M_(new T.BoxGeometry(0.1, 0.07, 0.25), bootM, 0, -SHIN - 0.01, -0.05, sh);
      return { th, sh };
    };
    const legL = mkLeg(-1), legR = mkLeg(1);

    const gunMount = joint(chest, 0.12, 0.27, -0.16);
    // where a weapon rides when it isn't in the hands: rifles slung across the back, pistols holstered at the hip
    // muzzle up and over one shoulder, diagonally across the back (Y before X so the tilt applies)
    const slingMount = joint(chest, 0.14, -0.22, 0.17); slingMount.rotation.set(Math.PI / 2, 0.6, 0);
    const hipMount = joint(hips, 0.2, 0.02, -0.02); hipMount.rotation.set(-Math.PI / 2, 0, 0);

    const rig = {
      hairMesh, look, pantsM: bottom, seat: null, kitParts: [], kitKey: null, kit: null, callsign: o.animal ? { id: o.animal, name: o.callName || '' } : null,
      root, body, hips, spine, chest, neck, head, armL, armR, legL, legR, gunMount, slingMount, hipMount, slung: false, mats, scale: s, style,
      gun: null, gunInfo: null, gunKey: null,
      phase: rnd() * 10, vel: new T.Vector3(), lastPos: null,
      crouchW: 0, aimW: 0, lean: 0, kick: 0, flinch: new T.Vector3(), throwT: -1,
      state: 'alive', deadT: 0, fallX: 1, fallZ: 0, downW: 0,
      hb: null, dbg: null,
    } as unknown as Rig;
    rig.setGun = (code: any, skin: any) => setGun(rig, code, skin); // (skin: its stickers, js/stickers.ts)
    rig.update = (dt: number, p: any) => update(rig, dt, p);
    rig.hitboxes = () => hitboxes(rig);
    // a shot: the animation's kick, and on a powered body the gun's muzzle rise (deg, from the host's kickOf)
    // and a shove back through the arms and shoulders along the bore
    rig.recoil = (deg: number) => {
      rig.kick = Math.min(1, rig.kick + 0.6);
      if (!deg || !rig.powered || !rig.rd || rig.state === 'dead') return;
      rig.gunKick = (rig.gunKick || 0) + deg * D2R;
      const g = rig.gun, rd = rig.rd;
      if (!g) return;
      const back = new T.Vector3(0, 0, 1).transformDirection(g.matrixWorld), k = Math.min(0.03, deg * 0.0018);
      for (const [i, f] of [[11, 1], [10, 0.8], [9, 0.7], [8, 0.5], [5, 0.45], [4, 0.3], [3, 0.25], [7, 0.15]]) rd.prev[i].addScaledVector(back, -k * f);
    };
    // mv: its momentum, kg m/s (a rifle round's about 4)
    rig.hit = (dir: any, mv = 4) => { // dir: world-space direction the bullet travelled
      const inv = rig.root.quaternion.clone().invert();
      const l = dir.clone().applyQuaternion(inv);
      rig.flinch.set(l.z * 0.35, l.x * 0.35, 1); // a flinch away from it (no colour flash)
      // a powered body takes it physically: the upper body's knocked the way the round went, by its momentum, in the next
      // physics step (everything that lands in one step is one shove: a shell's pellets aren't twenty)
      const rd = rig.rd;
      if (!rig.powered || !rd || rig.state === 'dead') return;
      rig.hitDir = dir.clone().setY(0).normalize();
      rd.push = (rd.push || new T.Vector3()).addScaledVector(dir, mv);
      rd.asleep = false; rd.still = 0;
    };
    // let go of the weapon: it falls and stays on the floor
    rig.dropGun = () => {
      if (!rig.gun) return;
      const g = rig.gun;
      g.getWorldPosition(_a); g.getWorldQuaternion(_q);
      if (g.parent) g.parent.remove(g);
      rig.slung = false;
      if (rig.dropped && rig.dropped.g.parent) rig.dropped.g.parent.remove(rig.dropped.g);
      root.parent && root.parent.add(g);
      g.position.copy(_a); g.quaternion.copy(_q); g.scale.setScalar(s);
      rig.dropped = { g, vy: 1.5, spin: (Math.random() - 0.5) * 6 };
      rig.gun = null; rig.gunInfo = null; rig.gunKey = null;
    };
    // Down for good (alive, bleeding out): limp, the same ragdoll as the dead, carrying on from however the body was
    // moving (its powered ragdoll, if it had one), no muscles pulling it toward a pose to snap back to.
    rig.goLimp = () => {
      if (rig.limp || rig.state === 'dead') return;
      rig.limp = true; rig.deadT = 0;
      if (rig.rd) { rig.rd.drive = null; rig.rd.asleep = false; rig.rd.still = 0; } else ragdollInit(rig, null);
      // they go over the way they were last hit, or forward over their knees
      rig.rd.topple = rig.hitDir ? rig.hitDir.clone() : new T.Vector3(-Math.sin(rig.root.rotation.y), 0, -Math.cos(rig.root.rotation.y));
    };
    rig.die = (dir: any) => {
      if (rig.state === 'dead') return;
      rig.state = 'dead'; rig.deadT = 0;
      ragdollInit(rig, dir);
      if (dir) {
        const l = dir.clone().applyQuaternion(rig.root.quaternion.clone().invert());
        // fall the way the killing shot pushed: +z travel (from the front) -> fall backward
        if (Math.abs(l.x) > Math.abs(l.z)) { rig.fallX = 0; rig.fallZ = -Math.sign(l.x); } else { rig.fallX = Math.sign(l.z) || 1; rig.fallZ = 0; }
      } else { rig.fallX = Math.random() < 0.6 ? 1 : -1; rig.fallZ = 0; }
      rig.dropGun();
    };
    // a throw: an enemy's (the gun still in the other hand), or an officer's from the grenade they're holding
    // (str 0 underhand, 1-2 overhand)
    rig.throwNade = (str?: number) => { rig.throwT = 0; rig.throwHand = str != null; rig.throwStr = str; };
    rig.setKit = (k: any) => setKit(rig, k);
    rig.setCallsign = (id: string, name: string) => { rig.callsign = id ? { id, name: name || '' } : null; setKit(rig, rig.kit); setSeat(rig); };
    setKit(rig, null); // (the back patch, before any kit)
    setSeat(rig);
    // put the weapon away (true) or bring it to the hands (false)
    rig.holster = (on: boolean) => {
      if (!rig.gun || rig.slung === on) return;
      rig.slung = on;
      if (rig.gunBaseOf === rig.gun) gunHome(rig); // (off the hand it was following)
      (on ? (rig.gunInfo && rig.gunInfo.pistol ? rig.hipMount : rig.slingMount) : rig.gunMount).add(rig.gun);
    };
    // zip-tie the wrists (living arrests and secured bodies)
    rig.zip = (on: boolean, instant: boolean) => {
      if (on && !rig.zipped && (rig.state === 'dead' || rig.limp)) rollFaceDown(rig, instant);
      rig.zipped = on; rig.armL.tie.visible = rig.armR.tie.visible = on;
    };
    // An officer securing this body: t is their progress (0..1), or -1 once nobody is. They turn it onto its
    // front over the first 40%, then draw the wrists behind the back; the tie goes on at the end.
    rig.secure = (t: number) => {
      const rd = rig.rd;
      if (!rd || rig.zipped) return;
      if (t < 0) {
        if (!rd.handled) return;
        rd.keepPin = rd.handled.t > 0.9 ? 2 : 0; // finished: hold the wrists until the host confirms the tie
        if (rd.roll && rd.roll.driven) rd.roll = null; // let go part-way: it flops back under gravity
        rd.handled = null; rd.asleep = false; rd.still = 0; rd.calm = 0.6;
        return;
      }
      if (!rd.handled) { rd.handled = { t: 0 }; rd.roll = planRoll(rig); if (rd.roll) rd.roll.driven = true; }
      rd.handled.t = t;
      rd.asleep = false;
      if (rd.roll && rd.roll.driven) {
        rd.roll.t = G.U.smooth(0.03, 0.4, t);
        if (rd.roll.t >= 1) { rd.roll = null; rd.calm = 0.8; rd.still = 0; } // on its front: physics again, wrists next
      }
    };
    // a body that was already lying there when we arrived: let it fall and come to rest at once
    rig.settle = (sec = 3) => {
      for (let t = 0; t < sec; t += STEP) { rig.deadT += STEP; if (rig.rd) ragdollStep(rig, STEP); }
      if (rig.rd) ragdollPose(rig);
    };
    rig.startle = () => { rig.flinch.set(0.7, 0, 1); }; // a jolt backward
    // (its geometry is its own, each piece made for it: thrown away with it, or every body that's ever left the scene
    // stays on the graphics card. The materials are shared between bodies, so they stay.)
    rig.dispose = () => {
      if (rig.dropped && rig.dropped.g.parent) rig.dropped.g.parent.remove(rig.dropped.g);
      if (rig.dbg) rig.dbg.forEach((m: THREE.Object3D) => m.parent && m.parent.remove(m));
      for (const o of [rig.root, rig.dropped && rig.dropped.g]) if (o) o.traverse((c: any) => { if (c.geometry) c.geometry.dispose(); });
    };
    return rig;
  }

  // code: a build code (or a plain weapon id for its factory build)
  function setGun(rig: Rig, code: any, skin: any) {
    const key = code ? code + (skin && skin.length ? '#' + G.Stickers.key(skin) : '') : null;
    if (rig.gunKey === key) return;
    if (rig.gun && rig.gun.parent) rig.gun.parent.remove(rig.gun);
    if (rig.gun) rig.gun.traverse((o: any) => { if (o.userData.sticker) o.geometry.dispose(); }); // (its stickers' own: the model's shared)
    rig.slung = false;
    rig.gunKey = key;
    const def = code ? G.Gunsmith.fromCode(code) : null;
    if (!def) { rig.gun = null; rig.gunInfo = null; return; }
    rig.gun = G.GunModels.world(def, skin);
    rig.gunInfo = rig.gun.userData.info;
    rig.gunMount.add(rig.gun);
  }

  // Prone (an officer lying down to shoot), as the rig draws it: how far the chest is propped up on the elbows (rad),
  // the head lifted, turned and rolled down onto the stock; the gun drawn in toward the middle (chest frame: x across,
  // up off the ground, forward); the feet (body frame: across, along the body, off the ground: the right one drawn up
  // and out, the left straight back), and where the elbows bend toward (rig frame: across, height, ahead: -z)
  const PRONE = { prop: 0.2, neck: 1.05, turn: 0, roll: 0, gunX: 0.07, gunUp: 0.09, gunFwd: 0.22,
    footR: [0.42, 0.42, 0.08], footL: [-0.26, 0.04, 0.04], elbowX: 0.32, elbowY: -0.4, elbowZ: -2.05 };
  // p: { pos (Vector3 ground position), yaw, pitch, crouch, alert, lean, state: 'alive'|'down', moving override }
  // The ATAK: a phone in a rugged case on a fold-down chest mount. A mount plate sits on the front of the carrier; the
  // case is hinged at its bottom edge and lies flat on the chest (screen in) when stowed, folding out and down until the
  // screen faces up at the face. Built in code (a dark case, a bright map screen, a small glow so it reads at a distance).
  // Returns the hinge (rotation.x: 0 stowed, ATAK_OPEN open); the phone is userData.phone, the glow userData.glow.
  const ATAK_OPEN = -1.3;
  function makeAtak(rig: Rig): THREE.Group {
    const W = 0.16, H = 0.08, D = 0.016; // (landscape: the hinge runs along a long edge)
    const mount = new T.Group();
    mount.position.set(0, 0.17, -0.19); // mid-chest, on the front of the carrier
    const plate = new T.Mesh(new T.BoxGeometry(W + 0.02, 0.05, 0.008), new T.MeshLambertMaterial({ color: 0x2b2e2a }));
    plate.position.set(0, -0.015, 0.006);
    const hinge = new T.Group(); // (its x axis is the hinge line, along the phone's bottom edge)
    const knuckle = new T.Mesh(new T.CylinderGeometry(0.007, 0.007, W + 0.012, 8), new T.MeshLambertMaterial({ color: 0x1a1c1e }));
    knuckle.rotation.z = Math.PI / 2;
    const phone = new T.Group(); phone.position.set(0, H / 2 + 0.004, -D / 2); // stowed: upright on the chest, its back outward
    const caseM = new T.MeshLambertMaterial({ color: 0x1d2024 });
    const body = new T.Mesh(new T.BoxGeometry(W, H, D), caseM);
    const bump = new T.Mesh(new T.BoxGeometry(0.012, H + 0.006, D + 0.004), caseM); // the case's bumpers, at either end
    const bump2 = bump.clone(); bump.position.x = W / 2 - 0.006; bump2.position.x = -W / 2 + 0.006;
    // the screen faces +z: into the chest when stowed, up at the face when open
    const scr = new T.Mesh(new T.PlaneGeometry(W - 0.024, H - 0.01), new T.MeshBasicMaterial({ color: 0x66e6c8 }));
    scr.position.z = D / 2 + 0.0005;
    const grid = new T.Mesh(new T.PlaneGeometry(W - 0.04, H - 0.025), new T.MeshBasicMaterial({ color: 0xd8fff2, wireframe: true, transparent: true, opacity: 0.35 }));
    grid.position.z = D / 2 + 0.0012;
    const glow = new T.Mesh(new T.PlaneGeometry(W * 1.35, H * 1.7), new T.MeshBasicMaterial({ color: 0x66e6c8, transparent: true, opacity: 0.3, blending: T.AdditiveBlending, depthWrite: false, side: T.DoubleSide }));
    glow.position.z = D / 2 + 0.02;
    phone.add(body, bump, bump2, scr, grid, glow);
    hinge.add(knuckle, phone); mount.add(plate, hinge);
    hinge.userData.glow = glow; hinge.userData.phone = phone; hinge.userData.mount = mount; hinge.userData.H = H; hinge.userData.W = W;
    rig.chest.add(mount); mount.visible = false;
    return hinge;
  }
  // A rider's swing (rig.zipSw): a pendulum hung from the trolley's handle (about a metre down to where they weigh), pushed back by
  // being speeded up, forward by being slowed, and leant back a little by the speed itself (the wind); v is how fast they're going
  // along the line (m/s). Their own view (js/player.ts) runs the same, from their own motion.
  function zipSwing(sw: ZipSwing, v: number, dt: number) {
    if (!(dt > 0)) return;
    const f = sw.v + (v - sw.v) * Math.min(1, dt * 3); sw.a = (f - sw.v) / dt; sw.v = f; // (their speed as the trolley picks it up: over a third of a second or so, not all at once)
    for (let left = Math.min(dt, 0.25); left > 1e-6; left -= 0.02) {
      const h = Math.min(left, 0.02);
      sw.w += (-9.5 * (sw.th + 0.011 * sw.v) - 1.5 * sw.w - 0.3 * sw.a) * h; sw.th = G.U.clamp(sw.th + sw.w * h, -0.7, 0.7);
    }
  }
  function update(rig: Rig, dt: number, p: any) {
    const U = G.U, s = rig.scale;
    const root = rig.root;
    // velocity in the rig's local frame (for stepping)
    if (!rig.lastPos) rig.lastPos = p.pos.clone();
    const dv = _a.subVectors(p.pos, rig.lastPos!);
    rig.lastPos!.copy(p.pos);
    if (dt > 0) rig.vel.lerp(dv.multiplyScalar(1 / dt), Math.min(1, dt * 10));
    root.position.copy(p.pos);
    // (on a zipline: facing the way they're carried, as they've been moving; lifted straight up onto it, the way they faced)
    if (p.zip) { if (rig.zipYaw == null) rig.zipYaw = p.yaw; if (Math.hypot(rig.vel.x, rig.vel.z) > 1.5) rig.zipYaw = Math.atan2(-rig.vel.x, -rig.vel.z); } else rig.zipYaw = null;
    root.rotation.y = p.climb ? p.climb.yaw : p.zip ? rig.zipYaw : p.yaw; // (on a ladder: facing it, wherever they're looking)
    if (rig.powered && rig.state !== 'dead' && !rig.limp) gunHome(rig); // (before the hands reach for it)
    root.updateMatrixWorld(true);
    // a crossbow: its bolt's on the rail while it's loaded (a reload lays it there at 0.72, cocking the string at 0.3)
    if (rig.gun && rig.gun.userData.xb) {
      const ld = p.loaded == null ? rig.xbLoaded !== false : !!p.loaded, rl = p.reload == null ? -1 : p.reload;
      rig.xbLoaded = ld;
      G.GunRig.setLoaded(rig.gun, ld || rl >= 0.72, ld || rl >= 0.3);
    }


    if (rig.state === 'dead' || rig.limp) { animateDeath(rig, dt); drawDebug(rig); return; }

    const sy = Math.sin(p.yaw), cy = Math.cos(p.yaw);
    const vx = rig.vel.x, vz = rig.vel.z;
    const localRight = vx * cy - vz * sy;          // +x in rig space
    const localFwd = -(vx * sy + vz * cy);         // forward (-z) in rig space
    const speed = p.zip || p.climb ? 0 : Math.hypot(vx, vz) / s; // (carried, not walking)
    const moving = speed > 0.25 ? 1 : speed / 0.25;

    const posed = p.pose === 'handsup' || p.pose === 'cuffed' || p.pose === 'cower' || p.pose === 'takedown';
    // restrained suspects lie face down; during a takedown they're pushed over as it progresses
    const tk = p.pose === 'takedown' ? p.tk || 0 : 0;
    const proneT = p.pose === 'cuffed' ? 1 : p.pose === 'takedown' ? U.smooth(0.05, 0.42, tk) : 0;
    rig.proneW = (rig.proneW || 0) + (proneT - (rig.proneW || 0)) * Math.min(1, dt * (p.pose === 'takedown' ? 14 : 5));
    // prone, to shoot (an officer, p.prone): on their front, propped on the elbows, head up, the gun level in front;
    // the body lies out ahead of the feet, so it's slid back to keep the head over where they're looking from
    rig.proneS = (rig.proneS || 0) + ((p.prone && !posed && p.state !== 'down' ? 1 : 0) - (rig.proneS || 0)) * Math.min(1, dt * 4);
    const lie = Math.max(rig.proneW, rig.proneS);
    if (rig.proneS > 0.001) { root.position.x += Math.sin(p.yaw) * 1.45 * s * rig.proneS; root.position.z += Math.cos(p.yaw) * 1.45 * s * rig.proneS; }
    // a flashbang's dazzle (p.blind: 1 blind and deaf, 2 coming round): dazeW is any of it (the sway, the weapon hanging),
    // blindW only the blind part (hands to the eyes, head down and away); each eased, so it comes on and goes off smoothly
    rig.blindT = (rig.blindT || 0) + dt;
    rig.dazeW = (rig.dazeW || 0) + ((p.blind && !posed ? 1 : 0) - (rig.dazeW || 0)) * Math.min(1, dt * (p.blind ? 7 : 3));
    rig.blindW = (rig.blindW || 0) + ((p.blind === 1 && !posed ? 1 : 0) - (rig.blindW || 0)) * Math.min(1, dt * (p.blind === 1 ? 9 : 3));
    const dz = rig.dazeW, bw = rig.blindW, bt = rig.blindT, ph = rig.phase; // (rig.phase: this one's own start, so two stagger out of step)
    const sway = dz * (0.4 + 0.6 * bw);
    if (dz > 0.002) root.rotation.y += Math.sin(bt * 0.55 + ph) * 0.3 * sway; // (turning on the spot, not facing anyone)
    const crouchTo = p.crouch || posed ? 1 - lie : Math.max(0, Math.min(1, 0.42 * bw + 0.14 * dz)); // (hunched over, knees soft)
    rig.crouchW += (crouchTo - rig.crouchW) * Math.min(1, dt * (crouchTo < rig.crouchW && p.rise || 9)); // (rise: a suspect comes up out of cover slower than they duck)
    rig.downW += ((p.state === 'down' ? 1 : 0) - rig.downW) * Math.min(1, dt * 5);
    rig.aimW += (((p.zip ? p.aim : p.alert) && !posed && !p.blind && !rig.slung ? 1 : 0) - rig.aimW) * Math.min(1, dt * 6); // (on a zipline the gun hangs low in the one hand till they aim or fire)
    rig.lean += ((p.lean || 0) - rig.lean) * Math.min(1, dt * 8);
    rig.kick = Math.max(0, rig.kick - dt * 7);
    rig.flinch.z = Math.max(0, rig.flinch.z - dt * 5);
    if (rig.throwT >= 0) { rig.throwT += dt; if (rig.throwT > 0.9) rig.throwT = -1; }

    // gait: one full cycle = two steps; longer strides when running
    const stride = U.lerp(1.1, 1.8, U.clamp(speed / 6, 0, 1)) * (1 - rig.crouchW * 0.35);
    rig.phase += (speed * dt / stride) * Math.PI * 2;
    const bob = Math.abs(Math.sin(rig.phase)) * 0.035 * moving;

    // body: hips height, lean, downed pose
    const hipH = U.lerp(HIP_H, CROUCH_H, rig.crouchW) - bob + 0.02 * moving;
    rig.body.rotation.set(-Math.PI / 2 * 0.96 * lie, 0, 0); // tips forward about the feet
    rig.body.position.set(0, 0.12 * lie, 0);
    // on a zipline: the whole body swings from the left hand on the trolley's handle (a pendulum, zipSwing), a little more as it
    // speeds up and stops, with a slow small sway of its own, and hangs a hand's width off the line so the arm goes straight up
    if (p.zip) {
      const sw = rig.zipSw || (rig.zipSw = { th: 0, w: 0, v: 0, a: 0 }), L = G.Level, h = L.ZIP_HANG - L.ZIP_BAR;
      rig.zipT = (rig.zipT || 0) + dt;
      zipSwing(sw, -(rig.vel.x * Math.sin(rig.zipYaw!) + rig.vel.z * Math.cos(rig.zipYaw!)), dt); // (along the way they face)
      const th = sw.th + 0.03 * Math.sin(rig.zipT * 1.9 + rig.phase);
      rig.body.rotation.x = th; rig.body.rotation.z = 0.04 * Math.sin(rig.zipT * 1.3 + rig.phase * 2); // (turned about their hand: the feet carry the swing)
      rig.body.position.set(0.09, h * (1 - Math.cos(th)), -h * Math.sin(th));
    } else rig.zipSw = undefined;
    rig.hips.position.set(rig.lean * 0.14, U.lerp(hipH, 0.17, rig.downW), U.lerp(0, 0.06, rig.crouchW));
    rig.hips.rotation.set(0, Math.sin(rig.phase) * 0.12 * moving, 0);
    const fl = rig.flinch.z;
    rig.spine.rotation.set(-localFwd * 0.025 - rig.crouchW * 0.4 + rig.downW * 0.35 + fl * rig.flinch.x * 0.6, -rig.hips.rotation.y, -rig.lean * 0.28 + fl * rig.flinch.y * -0.6);
    const pitch = U.clamp(p.pitch || 0, -1.2, 1.2) * rig.aimW;
    rig.chest.rotation.set(pitch * 0.75 + rig.crouchW * 0.32 - rig.downW * 0.25 + rig.kick * 0.08 + rig.proneS * PRONE.prop, 0, -rig.lean * 0.25); // (prone: up on the elbows, a little)
    rig.neck.rotation.set(pitch * 0.25 - fl * rig.flinch.x * 0.3 - rig.proneW * 0.5 + rig.proneS * PRONE.neck, rig.proneW * 0.9 + rig.proneS * PRONE.turn, rig.lean * 0.3 + rig.proneS * PRONE.roll); // cheek to the floor (cuffed); head up, cheek down on the stock (prone)
    rig.head.rotation.set(0, 0, 0);
    if (dz > 0.002) {
      // staggering: the weight rocking from side to side and back and forth, the torso following it a beat behind
      const sx = Math.sin(bt * 2.1 + ph) + 0.5 * Math.sin(bt * 3.7 + ph * 2);
      rig.hips.position.x += sx * 0.045 * sway; rig.hips.position.z += Math.sin(bt * 1.6 + ph * 3) * 0.03 * sway;
      rig.spine.rotation.z += -sx * 0.1 * sway; rig.spine.rotation.x += (0.12 * bw + 0.03 * Math.sin(bt * 1.3 + ph)) * dz;
      // the head: down and turned away from the light while blind, rolling round slowly and never settling on anything
      rig.neck.rotation.x += 0.4 * bw; rig.neck.rotation.y += 0.22 * bw + 0.3 * Math.sin(bt * 0.8 + ph) * sway;
      rig.head.rotation.y += 0.4 * Math.sin(bt * 1.9 + ph * 2) * sway;
      rig.head.rotation.x += 0.22 * Math.sin(bt * 1.4 + ph * 4) * sway;
      rig.head.rotation.z += 0.12 * Math.sin(bt * 1.1 + ph) * sway;
      // coming round: blinking and shaking the head clear in quick bursts every second or two
      const burst = Math.pow(Math.max(0, Math.sin(bt * 3.3 + ph)), 6), shk = burst * (1 - bw) * dz;
      rig.head.rotation.y += Math.sin(bt * 24) * 0.17 * shk; rig.head.rotation.x += Math.sin(bt * 19 + 1) * 0.07 * shk;
    }

    // gun: shouldered when alert, low-ready otherwise; pistols held out in front
    const gi = rig.gunInfo;
    const pistol = gi && gi.pistol;
    const mount = rig.gunMount;
    if (pistol) mount.position.set(0.02, U.lerp(0.18, 0.27, rig.aimW), U.lerp(-0.32, -0.46, rig.aimW));
    else mount.position.set(0.12, U.lerp(0.2, 0.28, rig.aimW) - (gi ? gi.sy * 0.6 : 0), -0.21 + rig.kick * 0.04); // (well out in front, the support arm bent)
    mount.rotation.set(U.lerp(-0.75, 0, rig.aimW) + rig.kick * 0.12 + rig.proneS * (Math.PI / 2 * 0.96 - PRONE.prop), U.lerp(-0.35, 0, rig.aimW), 0); // (prone: back up level, off the chest lying flat)
    // a bullpup's grip (and so its butt) is well forward of a rifle's: back with it, so the butt's in the shoulder
    const pup = gi && !pistol ? Math.max(0, gi.grip[0] - 0.05) : 0;
    if (pup) { mount.position.z += pup * (1 - rig.proneS); mount.position.y -= pup * rig.proneS; }
    if (rig.proneS > 0.001) { mount.position.x += (PRONE.gunX - mount.position.x) * rig.proneS; mount.position.z += PRONE.gunUp * rig.proneS; mount.position.y += PRONE.gunFwd * rig.proneS; } // (in under the cheek, up off the ground)
    if (p.zip) { // one-handed: the gun out low at the right hip's side, a long one laid over the forearm, up to level as they aim
      const k = 1 - rig.aimW;
      if (!pistol) { mount.position.x += 0.04 * k; mount.position.y -= 0.07 * k; mount.position.z += 0.06 * k; mount.rotation.x += 0.45 * k; mount.rotation.y = 0.12 * k; }
      else { mount.position.y -= 0.05 * k; mount.rotation.x -= 0.2 * k; }
    }
    if (dz > 0.002) { mount.rotation.x -= 0.75 * dz; mount.position.y -= 0.1 * dz; mount.position.z += 0.06 * dz; } // (the weapon lowered, hanging from the hand: it can't be aimed)
    if (rig.throwT >= 0 && !rig.throwHand) mount.rotation.x -= 0.6 * Math.sin(Math.PI * Math.min(1, rig.throwT / 0.9));
    // a reload: the gun canted toward the support hand; inspecting it: rolled over and turned to look along it
    const rl = p.reload != null && p.reload >= 0 ? p.reload : -1, ins = p.inspect != null && p.inspect >= 0 ? p.inspect : -1;
    if (rl >= 0) { const k = Math.sin(Math.PI * Math.min(1, rl)); mount.rotation.z += 0.5 * k; mount.rotation.x += 0.12 * k; mount.position.y -= 0.03 * k; }
    if (p.rack != null && p.rack >= 0) { const k = Math.sin(Math.PI * Math.min(1, p.rack)); mount.rotation.z += 0.3 * k; mount.rotation.x += 0.08 * k; mount.position.z += 0.03 * k; } // (a manual action worked by hand: bolt, pump, lever: the gun canted to the hand on it and drawn back a little)
    if (ins >= 0) { const k = U.smooth(0, 0.15, ins) * (1 - U.smooth(0.85, 1, ins)); mount.rotation.z -= 1.0 * k; mount.rotation.y += 0.55 * k; mount.position.y += 0.05 * k; mount.position.z += 0.06 * k; }
    root.updateMatrixWorld(true);

    // legs: feet planted on a stepping cycle along the travel direction
    const dirLen = Math.hypot(localRight, localFwd) || 1;
    const dX = localRight / dirLen, dZ = -localFwd / dirLen;    // rig-local travel direction (z = back)
    const stepLen = Math.min(stride * 0.27, 0.42) * moving;
    for (const [leg, side] of [[rig.legL, -1], [rig.legR, 1]] as [RigLeg, number][]) {
      const ph = rig.phase + (side > 0 ? Math.PI : 0);
      const swing = Math.sin(ph), lift = Math.max(0, Math.cos(ph)) * 0.13 * moving * (1 - rig.crouchW * 0.5);
      let fx = side * U.lerp(0.11, 0.16, rig.crouchW) + dX * swing * stepLen + rig.lean * 0.05;
      let fz = dZ * swing * stepLen + rig.crouchW * (side > 0 ? 0.42 : -0.32);
      if (rig.downW > 0.5) { fz = -0.75; fx = side * 0.16; }
      let fy = 0.06 + lift;
      if (dz > 0.002) { const w = bt * 2.1 + (side > 0 ? Math.PI : 0); fz += Math.sin(w) * 0.07 * sway; fx += Math.sin(w * 0.5) * 0.03 * sway; fy += Math.max(0, Math.cos(w)) * 0.035 * sway; } // (shuffling, feet barely leaving the floor)
      let legPole = null;
      if (rig.proneS > 0.01) { // prone: legs spread, toes down; the right knee drawn up and out to the side
        const k = rig.proneS, [px, py, pz] = side > 0 ? PRONE.footR : PRONE.footL;
        fx = U.lerp(fx, px, k); fy = U.lerp(fy, py, k); fz = U.lerp(fz, pz, k);
        legPole = rig.body.localToWorld(_d.set(side * 1.2, side > 0 ? 0.9 : 0.6, 0.12)).clone();
      }
      if (p.act && p.act.kind === 'kick' && side > 0) { const k = G.U.kickFoot(p.act.t); fx = 0.1; fy = k.y; fz = k.z; } // right leg kicks
      const target = rig.body.localToWorld(_c.set(fx, fy, fz)).clone();
      const pole = rig.body.localToWorld(_d.set(fx, 0.6, -1.2)).clone();
      if (legPole) pole.lerp(legPole, U.smooth(0.3, 0.9, rig.proneS)); // (the knees turn out once the body's most of the way down, not as it starts)
      ik(leg.th, leg.sh, THIGH * s, SHIN * s, target, pole);
    }

    // arms: hands on the gun's grip and support points; right arm can override to throw
    const shL = rig.armL.up, shHome = shL.userData.home || (shL.userData.home = shL.position.clone());
    shL.position.copy(shHome); // (the left shoulder, unless it's reaching: below)
    if (posed) {
      // hands up / hands behind the back / hands over the head
      for (const [arm, side] of [[rig.armL, -1], [rig.armR, 1]] as [RigArm, number][]) {
        let tgt, pole;
        const behind = p.pose === 'cuffed' || (p.pose === 'takedown' && tk > 0.5);
        if (p.pose === 'takedown' && tk < 0.42) { // shoved forward: hands come down to break the fall
          const up = rig.head.localToWorld(new T.Vector3(side * 0.22, 0.34, -0.04)), out = rig.chest.localToWorld(new T.Vector3(side * 0.3, 0.1, -0.5));
          tgt = up.lerp(out, U.smooth(0.05, 0.35, tk)); pole = rig.chest.localToWorld(new T.Vector3(side * 0.9, 0.2, 0.1));
        } else if (p.pose === 'takedown' && !behind) { // flat on the floor, arms out, waiting to be pulled back
          tgt = rig.chest.localToWorld(new T.Vector3(side * 0.55, 0.1, -0.1)); pole = rig.chest.localToWorld(new T.Vector3(side * 0.9, 0.4, 0.3));
        } else if (behind) { tgt = rig.hips.localToWorld(new T.Vector3(side * 0.04, 0.06, 0.22)); pole = rig.chest.localToWorld(new T.Vector3(side * 0.7, -0.2, 0.2)); }
        else if (p.pose === 'handsup') { tgt = rig.head.localToWorld(new T.Vector3(side * 0.22, 0.34, -0.04)); pole = rig.chest.localToWorld(new T.Vector3(side * 0.9, 0.2, 0.1)); }
        else if (p.pose === 'cower') { tgt = rig.head.localToWorld(new T.Vector3(side * 0.08, 0.24, 0.02)); pole = rig.chest.localToWorld(new T.Vector3(side * 0.6, 0.2, -0.7)); }
        else { tgt = rig.hips.localToWorld(new T.Vector3(side * 0.04, 0.06, 0.22)); pole = rig.chest.localToWorld(new T.Vector3(side * 0.7, -0.2, 0.2)); }
        ik(arm.up, arm.lo, UARM * s, FARM * s, tgt, pole);
      }
    } else if (rig.gun && gi && !rig.slung) {
      // held out in front: a long gun's forend can be past where the left arm reaches; it comes back along itself
      // till the support hand's on it
      if (!gi.pistol && !p.zip) { // (one-handed on a zipline: the left's on the trolley)
        rig.chest.updateMatrixWorld(true);
        const S = rig.gun.localToWorld(_a.set(gi.support[2] - 0.01, gi.support[1], -gi.support[0])), P = rig.armL.up.getWorldPosition(_b);
        const f = _c.set(0, 0, -1).transformDirection(rig.gun.matrixWorld), D = _d.subVectors(S, P), R = (UARM + FARM) * s * 0.98;
        // first the shoulder rolls forward toward it (as reaching does), up to 7 cm; then the gun comes back
        const far = D.length() - R;
        if (far > 0) {
          P.addScaledVector(D, Math.min(0.07 * s, far) / D.length()); shL.position.copy(shL.parent!.worldToLocal(_e.copy(P)));
          D.subVectors(S, P);
        }
        const df = D.dot(f), over = D.lengthSq() - R * R;
        if (over > 0) {
          const back = df - Math.sqrt(Math.max(0, df * df - over));
          if (back > 0) rig.gunMount.position.addScaledVector(_e.set(0, 0, 1).applyQuaternion(rig.gunMount.quaternion), back / s);
        }
      }
      rig.gunMount.updateMatrixWorld(true);
      const grip = rig.gun.localToWorld(new T.Vector3(gi.grip[2], gi.grip[1], -gi.grip[0]));
      const supp = rig.gun.localToWorld(new T.Vector3(gi.support[2] - 0.01, gi.support[1], -gi.support[0]));
      let rTarget = grip;
      if (rig.throwT >= 0) {
        const t = rig.throwT / 0.9;
        const wind = t < 0.45 ? t / 0.45 : 1 - (t - 0.45) / 0.55;
        rTarget = rig.chest.localToWorld(new T.Vector3(0.28, U.lerp(0.3, 0.55, wind), U.lerp(-0.45, 0.25, wind)));
      }
      // the support hand in a reload: to the magazine, down to a pouch on the belt, back up with the new one,
      // seating it; in a magazine check: the magazine out and up in front of the chest
      const well = rig.gun.localToWorld(new T.Vector3(gi.grip[2], gi.grip[1] - 0.07, -(gi.grip[0] + 0.09)));
      let sp = supp;
      if (rl >= 0) {
        const pouch = rig.hips.localToWorld(new T.Vector3(-0.2, 0.06, -0.12)), L2 = (a: THREE.Vector3, b: THREE.Vector3, u: number) => a.clone().lerp(b, U.smooth(0, 1, u));
        sp = rl < 0.15 ? L2(supp, well, rl / 0.15) : rl < 0.35 ? L2(well, pouch, (rl - 0.15) / 0.2) : rl < 0.6 ? L2(pouch, well, (rl - 0.35) / 0.25) : rl < 0.82 ? well : L2(well, supp, (rl - 0.82) / 0.18);
      } else if (p.magChk != null && p.magChk >= 0) sp = well.clone().lerp(rig.chest.localToWorld(new T.Vector3(-0.04, 0.32, -0.4)), U.smooth(0.25, 1, p.magChk));
      // the elbows: out and down beside you standing; prone, planted on the ground ahead of the shoulders
      const elbow = (side: any, stand: any) => { const q = rig.chest.localToWorld(stand); if (rig.proneS! > 0.01) q.lerp(rig.root.localToWorld(new T.Vector3(side * PRONE.elbowX, PRONE.elbowY, PRONE.elbowZ)), rig.proneS!); return q; };
      ik(rig.armR.up, rig.armR.lo, UARM * s, FARM * s, rTarget, elbow(1, new T.Vector3(0.6, -0.2, 0.4)));
      ik(rig.armL.up, rig.armL.lo, UARM * s, FARM * s, sp, elbow(-1, new T.Vector3(-0.6, -0.3, 0.2)));
      // the magazine: in the support hand from when it comes out to when the new one's seated (or while it's
      // checked), otherwise on the gun
      const mg = rig.gun.userData.mag;
      if (mg) {
        const inHand = (rl >= 0.15 && rl < 0.8) || (p.magChk != null && p.magChk >= 0.12);
        if (inHand) {
          const hp = rig.armL.lo.localToWorld(new T.Vector3(0, -FARM - 0.06, -0.01)); // (in the palm)
          mg.position.copy(rig.gun.worldToLocal(hp));
        } else mg.position.copy(rig.gun.userData.magHome);
        mg.visible = !p.nomag || inHand; // (a gun with its magazine out has none on it)
      }
      // the bipod's legs: down when they've put it down (a quarter of a second either way)
      if (rig.gun.userData.bipod) { rig.bipodK = U.clamp((rig.bipodK || 0) + (p.bipod ? 1 : -1) * dt * 4, 0, 1); G.GunRig.bipodPose(rig.gun.userData.bipod, rig.bipodK); }
    } else {
      // unarmed: arms swing opposite the legs
      for (const [arm, side] of [[rig.armL, -1], [rig.armR, 1]] as [RigArm, number][]) {
        arm.up.quaternion.identity(); arm.lo.quaternion.identity();
        arm.up.rotation.set(Math.sin(rig.phase + (side > 0 ? 0 : Math.PI)) * 0.55 * moving, 0, side * 0.1);
        arm.lo.rotation.set(0.25 + 0.35 * moving, 0, 0); // elbows bend forward (the rig faces -z)
      }
    }
    // a grenade in the hand (an officer's: the weapon slung): held in front, drawn back (high overhand, low
    // underhand) with the other arm out ahead, then thrown and followed through
    const handThrow = rig.throwT >= 0 && rig.throwHand;
    if ((p.hold || handThrow) && !posed) {
      const h = p.hold || {}, under = (handThrow ? rig.throwStr : h.str) === 0, C = (x: number, y: number, z: number) => rig.chest.localToWorld(new T.Vector3(x, y, z));
      let rh;
      if (handThrow) {
        const t = Math.min(1, rig.throwT / 0.6), a = under ? [C(0.3, -0.32, 0.22), C(0.2, 0.06, -0.55), C(0.2, -0.18, -0.38)] : [C(0.3, 0.5, 0.16), C(0.22, 0.42, -0.6), C(0.2, 0.02, -0.42)];
        rh = t < 0.35 ? a[0].lerp(a[1], U.smooth(0, 0.35, t)) : a[1].lerp(a[2], U.smooth(0.35, 1, t));
      } else rh = h.cock ? (under ? C(0.3, -0.32, 0.22) : C(0.3, 0.5, 0.16)) : C(0.2, 0.12, -0.34);
      ik(rig.armR.up, rig.armR.lo, UARM * s, FARM * s, rh, C(0.7, -0.2, 0.3));
      const lh = h.cock || handThrow ? C(-0.24, 0.3, -0.46) : C(-0.18, 0.04, -0.3);
      ik(rig.armL.up, rig.armL.lo, UARM * s, FARM * s, lh, C(-0.7, -0.3, 0.2));
    }
    // the grenade itself, in their right hand until it's thrown
    if (p.hold || rig.handNade) {
      if (!rig.handNade) {
        rig.handNade = { frag: new T.Mesh(new T.SphereGeometry(0.04, 10, 8), new T.MeshLambertMaterial({ color: 0x3a4a2a })), flash: new T.Mesh(new T.CylinderGeometry(0.027, 0.027, 0.1, 10), new T.MeshLambertMaterial({ color: 0x7d8388 })) };
        for (const m of Object.values(rig.handNade)) { m.position.set(0, -FARM - 0.07, -0.03); rig.armR.lo.add(m); }
      }
      for (const [k, m] of Object.entries(rig.handNade)) m.visible = !!p.hold && p.hold.kind === k && !handThrow && !posed;
    }
    // looking at the ATAK (a menu is open: p.atak): the left hand pulls the phone down off its chest mount (it folds out on
    // its hinge until the screen faces up at the face); both hands hold its ends, a thumb working the screen; the head tips
    // down to it. The weapon is already slung (the caller holsters it). Eased in and out; the fold follows the left hand.
    rig.atakW = (rig.atakW || 0) + ((p.atak && !posed && !p.act && p.state === 'alive' ? 1 : 0) - (rig.atakW || 0)) * Math.min(1, dt * 5);
    if (rig.atakW > 0.01) {
      if (!rig.atak) rig.atak = makeAtak(rig);
      const k = U.smooth(0, 1, rig.atakW), hg = rig.atak, ph = hg.userData.phone as THREE.Object3D, H = hg.userData.H as number, W = hg.userData.W as number;
      (hg.userData.mount as THREE.Object3D).visible = true;
      hg.rotation.x = ATAK_OPEN * U.smooth(0.15, 0.85, k); // (the hand reaches it first, then folds it out)
      rig.neck.rotation.x -= 0.55 * k; // head down to the screen
      const gl = hg.userData.glow as THREE.Mesh; if (gl) (gl.material as THREE.MeshBasicMaterial).opacity = (0.22 + 0.06 * Math.sin(performance.now() / 400)) * U.smooth(0.5, 1, k);
      rig.chest.updateMatrixWorld(true);
      const tap = Math.max(0, Math.sin(performance.now() / 170)) * 0.008 * k; // (a thumb taps at the map)
      const hand = (arm: RigArm, on: THREE.Vector3, pole: THREE.Vector3, w: number) => {
        const cur = arm.lo.localToWorld(new T.Vector3(0, -FARM, 0));
        ik(arm.up, arm.lo, UARM * s, FARM * s, cur.lerp(on, w), pole);
      };
      // landscape, held by its two ends like a phone (the left pulls it down; the right comes in a beat later, its thumb tapping)
      hand(rig.armL, ph.localToWorld(new T.Vector3(-W / 2 - 0.04, H * 0.45, -0.025)), rig.chest.localToWorld(new T.Vector3(-0.62, -0.25, -0.1)), k);
      hand(rig.armR, ph.localToWorld(new T.Vector3(W / 2 + 0.04, H * 0.45, -0.025 + tap)), rig.chest.localToWorld(new T.Vector3(0.62, -0.25, -0.1)), U.smooth(0.3, 1, k));
    } else if (rig.atak) (rig.atak.userData.mount as THREE.Object3D).visible = false;
    // blinded (p.blind 1): a hand pressed over the eyes, the forearm across the face; with a weapon the other hand keeps it hanging
    // low, with none both hands go to the eyes
    if (bw > 0.01) {
      rig.chest.updateMatrixWorld(true); rig.head.updateMatrixWorld(true);
      const hand = (arm: RigArm, on: THREE.Vector3, pole: THREE.Vector3, w: number) => {
        const cur = arm.lo.localToWorld(new T.Vector3(0, -FARM, 0));
        ik(arm.up, arm.lo, UARM * s, FARM * s, cur.lerp(on, w), pole);
      };
      const k = U.smooth(0, 1, bw), gw = Math.sin(bt * 2.6 + ph);
      hand(rig.armL, rig.head.localToWorld(new T.Vector3(-0.05, 0.13, -0.14)), rig.chest.localToWorld(new T.Vector3(-0.55, 0.1, -0.7)), k);
      if (!(rig.gun && rig.gunInfo && !rig.slung)) hand(rig.armR, rig.head.localToWorld(new T.Vector3(0.05, 0.11 + 0.01 * gw, -0.15)), rig.chest.localToWorld(new T.Vector3(0.55, 0.1, -0.7)), k);
    }
    // on the radio (p.radio): the left hand goes up to the headset's ear cup and stays there (the gun hand keeps the weapon), the head tilted to it
    rig.radioW = (rig.radioW || 0) + ((p.radio && !posed && !p.blind ? 1 : 0) - (rig.radioW || 0)) * Math.min(1, dt * 7);
    if (rig.radioW > 0.01) {
      rig.chest.updateMatrixWorld(true); rig.head.updateMatrixWorld(true);
      const cur = rig.armL.lo.localToWorld(new T.Vector3(0, -FARM, 0)), k = U.smooth(0, 1, rig.radioW);
      ik(rig.armL.up, rig.armL.lo, UARM * s, FARM * s, cur.lerp(rig.head.localToWorld(new T.Vector3(-0.13, 0.11, -0.01)), k), rig.chest.localToWorld(new T.Vector3(-0.8, -0.1, -0.1)));
      rig.head.rotation.z -= 0.12 * k;
    }
    // door actions: one hand reaches for the handle / door edge (players use the right hand with the
    // weapon put away; an enemy with a gun in hand uses his free left hand)
    if (p.act && (p.act.kind === 'open' || p.act.kind === 'close')) {
      const h = p.act.kind === 'open' ? G.U.openHand(p.act.t) : G.U.closeHand(p.act.t);
      const left = p.act.hand === 'L', arm = left ? rig.armL : rig.armR, sx = left ? -1 : 1;
      const tgt = rig.body.localToWorld(new T.Vector3(h.x * sx, h.y, h.z));
      ik(arm.up, arm.lo, UARM * s, FARM * s, tgt, rig.chest.localToWorld(new T.Vector3(sx * 0.7, -0.3, 0.2)));
    }
    // zip-tying: kneel over them, shove them down, then both hands at their wrists
    if (p.act && p.act.kind === 'zip') {
      const t = p.act.t, S = U.smooth, reach = p.act.pull ? 1 : S(0, 0.14, t), spread = t < 0.45 ? 0.12 : 0.06;
      for (const [arm, side] of [[rig.armL, -1], [rig.armR, 1]] as [RigArm, number][]) {
        // on the person (their back, then their wrists) when we know where they are
        const on = p.act.pt ? rig.body.worldToLocal(p.act.pt.clone()).add(new T.Vector3(side * spread, 0.03, 0)) : new T.Vector3(side * 0.08, 0.32, -0.58);
        const local = new T.Vector3(side * 0.25, 0.85, -0.15).lerp(on, reach);
        ik(arm.up, arm.lo, UARM * s, FARM * s, rig.body.localToWorld(local), rig.chest.localToWorld(new T.Vector3(side * 0.7, -0.3, 0.2)));
      }
    }
    // bagging evidence: pick it up off the floor, hold the envelope, set it down
    if (p.act && p.act.kind === 'bag') {
      const { reach, lift, envUp: env, down } = U.bagPhases(p.act.t);
      const rh = new T.Vector3(0.25, 0.8, -0.1).lerp(new T.Vector3(0.12, 0.1, -0.5), reach).lerp(new T.Vector3(0.05, 0.62, -0.42), lift).lerp(new T.Vector3(0.1, 0.1, -0.5), down);
      const lh = new T.Vector3(-0.25, 0.8, -0.1).lerp(new T.Vector3(-0.08, 0.6, -0.4), env).lerp(new T.Vector3(-0.08, 0.1, -0.5), down);
      ik(rig.armR.up, rig.armR.lo, UARM * s, FARM * s, rig.body.localToWorld(rh), rig.chest.localToWorld(new T.Vector3(0.7, -0.3, 0.2)));
      ik(rig.armL.up, rig.armL.lo, UARM * s, FARM * s, rig.body.localToWorld(lh), rig.chest.localToWorld(new T.Vector3(-0.7, -0.3, 0.2)));
    }
    // on a ladder (p.climb: the ladder, a level's crest.ladder): hands and feet on its rungs, where G.Level.ladderGrip has them
    // for how high their feet are; the hips held off it a little and sat down into the lower foot (so it reaches its rung),
    // the knees and elbows out from it
    if (p.climb) {
      const l = p.climb, y = p.pos.y, at = (k: any) => new T.Vector3(...G.Level.ladderGrip(l, y, k));
      rig.hips.position.z += 0.06; rig.hips.position.y -= 0.17; rig.spine.rotation.x -= 0.08;
      root.updateMatrixWorld(true);
      for (const [leg, side, k] of [[rig.legL, -1, 'fL'], [rig.legR, 1, 'fR']] as [RigLeg, number, string][]) ik(leg.th, leg.sh, THIGH * s, SHIN * s, at(k), new T.Vector3(l.x - 0.6, y + 0.7, l.z - side * 0.25));
      for (const [arm, side, k] of [[rig.armL, -1, 'hL'], [rig.armR, 1, 'hR']] as [RigArm, number, string][]) ik(arm.up, arm.lo, UARM * s, FARM * s, at(k), new T.Vector3(l.x + 0.5, y + 1.0, l.z - side * 0.7));
    }
    // on a zipline (p.zip): hanging by the left hand from the handle of a trolley on the line (G.Level.zipKit, the cable ZIP_HANG over
    // their feet), the right hand with the gun (above); the body swings under it (above), the legs together, a little bent, the feet
    // kicked up and trailing the swing
    if (p.zip) {
      const L = G.Level;
      if (!rig.zipKit) { rig.zipKit = L.zipKit(); root.add(rig.zipKit); }
      rig.zipKit.visible = true; rig.zipKit.position.set(0, L.ZIP_HANG, 0);
      root.updateMatrixWorld(true);
      ik(rig.armL.up, rig.armL.lo, UARM * s, FARM * s, root.localToWorld(new T.Vector3(0, L.ZIP_HANG - L.ZIP_BAR, 0)), rig.chest.localToWorld(new T.Vector3(-0.55, 0.15, 0.1)));
      const lag = U.clamp(-(rig.zipSw ? rig.zipSw.th : 0), 0, 0.6); // (the feet trail more the further back the swing)
      for (const [leg, side] of [[rig.legL, -1], [rig.legR, 1]] as [RigLeg, number][]) ik(leg.th, leg.sh, THIGH * s, SHIN * s, rig.body.localToWorld(new T.Vector3(side * 0.07, 0.2 + lag * 0.15, -0.08 - side * 0.02)), rig.body.localToWorld(new T.Vector3(side * 0.1, 0.6, -0.9)));
    } else if (rig.zipKit) { rig.zipKit.visible = false; rig.zipT = 0; }
    if (rig.powered && p.str != null) powerStep(rig, dt, p.str, p.aimAt);
    else if (rig.powered) rig.rd = null!; // (far off: animated only; the body starts again from the pose when near)
    if (rig.dropped) dropGun(rig, dt);
    drawDebug(rig);
  }

  // ---------------------------------------------------------------- the powered body
  // A living body is physically simulated: the ragdoll's particles and joints (below), each pulled toward where
  // the animation has put that joint by "muscles": a spring to the pose and a damper to its motion, as strong
  // as the person is (str 0..1, from the host: what blood loss has left them). Strong, they move as animated
  // but with weight: a hit jolts them, they sway as they stop. Weakening, gravity starts to win: the knees
  // buckle, they sag and stagger, and the legs strain to push back up in efforts that come and go and fade.
  // Below the collapse point they go down (forward, the way a body folds) and can't get up. Dead, the muscles
  // are gone and it's simply the ragdoll.
  // (the host's thresholds: js/server.ts)
  const COLLAPSE = 0.3, TWO_HAND = 0.4;
  const KPI_BRACE = [1, 1, 1, 1, 6, 1, 1, 1, 6, 1, 8, 1, 1, 1, 1, 1]; // left shoulder, elbow, hand
  const _gb = new T.Vector3();
  function sample(rig: Rig) { // the animated pose, at the ragdoll's particles (0 pelvis ... 15 right foot)
    const { hips, chest, neck, head, armL, armR, legL, legR } = rig;
    const w = (o: THREE.Object3D, x = 0, y = 0, z = 0) => o.localToWorld(new T.Vector3(x, y, z));
    return [w(hips), w(legL.th), w(legR.th), w(chest, 0, 0.14, 0), w(armL.up), w(armR.up), w(neck), w(head, 0, 0.1, 0),
      w(armL.lo), w(armR.lo), w(armL.lo, 0, -FARM, 0), w(armR.lo, 0, -FARM, 0), w(legL.sh), w(legR.sh), w(legL.sh, 0, -SHIN, 0), w(legR.sh, 0, -SHIN, 0)];
  }
  const _gm = new T.Matrix4(), _gl = new T.Matrix4(), _gp = new T.Vector3(), _gq = new T.Quaternion(), _gs = new T.Vector3();
  // the gun back in its own place on the mount (where the animation's hands go for it); powerStep then moves it
  // with the simulated hand. Done first thing each frame, or the arms would chase where the hand took it last
  // frame (and the hand, the gun: round and round).
  function gunHome(rig: Rig) {
    const g = rig.gun;
    if (!g) return;
    if (rig.gunBaseOf !== g) { rig.gunBaseOf = g; rig.gunBase = { p: g.position.clone(), q: g.quaternion.clone(), s: g.scale.clone() }; }
    g.position.copy(rig.gunBase!.p); g.quaternion.copy(rig.gunBase!.q); g.scale.copy(rig.gunBase!.s);
  }
  function powerStep(rig: Rig, dt: number, str: number, aimAt: THREE.Vector3 | null) {
    // the gun in their hands goes where the (simulated) right hand goes, not where the chest mount is: its pose
    // and the forearm's as animated, so it can be moved with the forearm afterwards (gun base: its own place on
    // the mount, put back each frame before anything moves it)
    // (it was put back on its mount at the start of the frame, before the arms reached for it: gunHome)
    const g = rig.gun && !rig.slung && rig.gun.parent === rig.gunMount ? rig.gun : null;
    rig.root.updateMatrixWorld(true);
    const loAnim = g ? rig.armR.lo.matrixWorld.clone() : null, gunAnim = g ? g.matrixWorld.clone() : null;
    const Tg = sample(rig);
    // The off hand. With the strength to (str >= TWO_HAND, as on the host: it steadies their aim), it's on
    // the gun's forend where the arms are holding it now. Without, it goes to the floor beside them and props
    // them up, the elbow locked.
    const yaw = rig.root.rotation.y, fx = -Math.sin(yaw), fz = -Math.cos(yaw), rx = Math.cos(yaw), rz = -Math.sin(yaw);
    rig.braceW = (rig.braceW || 0) + ((str < TWO_HAND ? 1 : 0) - (rig.braceW || 0)) * Math.min(1, dt * 4);
    if (rig.braceW > 0.02) {
      // on the floor beside them if it can reach (down there, or folded over), else leaning on the knee
      const P0 = rig.rd && rig.rd.P, sh = P0 ? P0[4] : Tg[4], kn = P0 ? P0[12] : Tg[12], reach = rig.rd && rig.rd.armL ? rig.rd.armL : 0.56 * rig.scale;
      _gb.set(Tg[0].x - rx * 0.3 * rig.scale + fx * 0.12, rig.root.position.y + 0.04, Tg[0].z - rz * 0.3 * rig.scale + fz * 0.12);
      if (_gb.distanceTo(sh) > reach * 0.98) _gb.set(kn.x + fx * 0.03, kn.y + 0.07 * rig.scale, kn.z + fz * 0.03);
      Tg[10].lerp(_gb, rig.braceW);
    }
    else if (g && rig.gunSupport && rig.gunAimW! > 0.05) Tg[10].lerp(rig.gunSupport, rig.gunAimW!);
    let rd = rig.rd;
    if (!rd || rd.P[0].distanceTo(Tg[0]) > 1.2 * rig.scale) { // first time near, or they've jumped (a snap): start at the pose, still
      ragdollInit(rig, null); rd = rig.rd;
      rd.P.forEach((p, i) => p.copy(Tg[i])); rd.prev = Tg.map((p) => p.clone()); rd.Tprev = Tg.map((p) => p.clone());
      rd.rigid = RIGID.map(([a, b]) => [a, b, Tg[a].distanceTo(Tg[b])]); rd.min = MIN.map(([a, b, f]) => [a, b, Tg[a].distanceTo(Tg[b]) * f]);
    }
    if (rig.effPh == null) rig.effPh = Math.random() * 6.3;
    if (rd.armL == null) { const len = (a: number, b: number) => rd.rigid.find((r: number[]) => r[0] === a && r[1] === b)![2]; rd.armL = len(4, 8) + len(8, 10); } // (the left arm, straight)
    rig.effT = (rig.effT || 0) + dt;
    // weak, the legs strain: efforts to stand that come and go (and fade with the strength behind them)
    const m = str >= 0.6 ? str : str * (0.7 + 0.7 * Math.max(0, Math.sin(rig.effT * 2.4 + rig.effPh)));
    const fwd = new T.Vector3(-Math.sin(rig.root.rotation.y), 0, -Math.cos(rig.root.rotation.y));
    // unsteady: the body the muscles are trying to hold drifts about over the feet (a stagger, a sway), more the
    // weaker they are
    const sway = G.U.clamp((0.75 - str) / 0.55, 0, 1);
    if (sway > 0) {
      const t = rig.effT, a = 0.13 * sway * rig.scale, sx = Math.sin(t * 1.3 + rig.effPh) + 0.5 * Math.sin(t * 2.9 + rig.effPh * 2), sz = Math.cos(t * 0.9 + rig.effPh * 3) + 0.5 * Math.sin(t * 2.3);
      for (const [i, k] of [[0, 0.4], [1, 0.4], [2, 0.4], [3, 0.9], [4, 0.9], [5, 0.9], [6, 1], [7, 1.1], [8, 0.9], [9, 0.9], [10, 0.9], [11, 0.9]]) { Tg[i].x += sx * a * k; Tg[i].z += sz * a * k; }
    }
    const steps = stepsFor(rd, dt);
    for (let s = 0; s < steps; s++) {
      const f = (s + 1) / steps;
      rd.drive = {
        T: Tg.map((t, i) => rd.Tprev![i].clone().lerp(t, f)), Tv: Tg.map((t, i) => t.clone().sub(rd.Tprev![i]).multiplyScalar(1 / steps)),
        kp: 0.4 * Math.pow(m, 1.6), kv: Math.min(0.9, 0.9 * Math.pow(m, 1.6)), // spring to the pose, damper to its motion
        trem: str < 0.5 ? (0.5 - str) * 0.006 : 0, // trembling legs
        fall: str < COLLAPSE ? fwd : null, // going down: folding forward over the knees
        // the bracing arm: held straight and firm (it takes little strength to lean on a locked arm)
        kpI: rig.braceW > 0.02 ? KPI_BRACE.map((k) => 1 + (k - 1) * rig.braceW!) : null,
        brace: rig.braceW > 0.3 ? rd.armL * 0.93 : 0,
        self: m < 0.45, // (strong, the muscles keep the limbs apart; weak, they can tangle, so check)
      };
      rd.asleep = false; rd.still = 0;
      ragdollStep(rig, STEP);
    }
    rd.drive = null;
    if (steps) rd.Tprev = Tg;
    ragdollPose(rig);
    // the gun moves with the right forearm: by exactly what the forearm moved from its animated pose (none at
    // full strength; weak, it sags and swings with the hand; down, it hangs from it)
    if (g) {
      _gm.copy(rig.armR.lo.matrixWorld).multiply(_gl.copy(loAnim!).invert()).multiply(gunAnim!); // the gun's world pose now
      _gl.copy(g.parent!.matrixWorld).invert().multiply(_gm).decompose(_gp, _gq, _gs);
      g.position.copy(_gp); g.quaternion.copy(_gq); g.scale.copy(_gs);
      g.updateMatrixWorld(true);
      // Aiming: the arms hold the gun on what they're shooting at, as hard as they still can. Strong, it's
      // dead on; weakening, it's held toward you but sags; down on the floor it's half raised. (Only for a
      // target roughly in front of them: one off to the side, they're still turning to it.)
      let aw = 0;
      if (aimAt) {
        const tx = aimAt.x - rig.root.position.x, tz = aimAt.z - rig.root.position.z, tl = Math.hypot(tx, tz) || 1;
        const facing = G.U.clamp(((tx * -Math.sin(rig.root.rotation.y) + tz * -Math.cos(rig.root.rotation.y)) / tl - 0.5) / 0.3, 0, 1);
        aw = facing;
      }
      const sag = (1 - G.U.clamp(str / 0.6, 0, 1)) * 45 * D2R; // how far off it's left: as much as the arms can't hold
      rig.gunAimW = (rig.gunAimW || 0) + (aw - (rig.gunAimW || 0)) * Math.min(1, dt * 6);
      if (rig.gunAimW > 0.01 && aimAt) {
        const gi = rig.gunInfo, grip = g.localToWorld(_ga.set(gi!.grip[2], gi!.grip[1], -gi!.grip[0]));
        const f = _gf.set(0, 0, -1).transformDirection(g.matrixWorld), want = _gw.subVectors(aimAt, grip).normalize();
        const off = Math.acos(G.U.clamp(f.dot(want), -1, 1)), turn = Math.max(0, off - sag) * rig.gunAimW;
        _gq.setFromUnitVectors(f, want); if (off > 1e-4) _gq.slerp(_gI, 1 - turn / off);
        // turn the gun about the grip: its world pose = T(grip) R T(-grip) pose
        _gm.makeTranslation(-grip.x, -grip.y, -grip.z).premultiply(_gl.makeRotationFromQuaternion(_gq)).premultiply(_gr.makeTranslation(grip.x, grip.y, grip.z)).multiply(g.matrixWorld);
        _gl.copy(g.parent!.matrixWorld).invert().multiply(_gm).decompose(_gp, _gq, _gs);
        g.position.copy(_gp); g.quaternion.copy(_gq); g.scale.copy(_gs);
        g.updateMatrixWorld(true);
      }
      // Held in a hand, the right way up: it can roll at most 25 degrees off level about its bore (a forearm
      // twisting in the simulation doesn't turn it over)
      {
        const gi = rig.gunInfo, grip = g.localToWorld(_ga.set(gi!.grip[2], gi!.grip[1], -gi!.grip[0]));
        const b = _gf.set(0, 0, -1).transformDirection(g.matrixWorld), up = _gw.set(0, 1, 0).transformDirection(g.matrixWorld);
        const lv = _gb.set(0, 1, 0).addScaledVector(b, -b.y);
        if (lv.lengthSq() > 0.01) {
          lv.normalize();
          const roll = Math.atan2(_gc.crossVectors(up, lv).dot(b), up.dot(lv)), lim = 25 * D2R;
          if (Math.abs(roll) > lim) {
            _gq.setFromAxisAngle(b, roll - Math.sign(roll) * lim);
            _gm.makeTranslation(-grip.x, -grip.y, -grip.z).premultiply(_gl.makeRotationFromQuaternion(_gq)).premultiply(_gr.makeTranslation(grip.x, grip.y, grip.z)).multiply(g.matrixWorld);
            _gl.copy(g.parent!.matrixWorld).invert().multiply(_gm).decompose(_gp, _gq, _gs);
            g.position.copy(_gp); g.quaternion.copy(_gq); g.scale.copy(_gs);
            g.updateMatrixWorld(true);
          }
        }
      }
      // the last shots' kick: the muzzle up, about the grip, coming back as fast as the arms can bring it
      if (rig.gunKick! > 1e-4) {
        const gi = rig.gunInfo, grip = g.localToWorld(_ga.set(gi!.grip[2], gi!.grip[1], -gi!.grip[0]));
        const ax = _gf.set(1, 0, 0).transformDirection(g.matrixWorld);
        _gq.setFromAxisAngle(ax, rig.gunKick!);
        _gm.makeTranslation(-grip.x, -grip.y, -grip.z).premultiply(_gl.makeRotationFromQuaternion(_gq)).premultiply(_gr.makeTranslation(grip.x, grip.y, grip.z)).multiply(g.matrixWorld);
        _gl.copy(g.parent!.matrixWorld).invert().multiply(_gm).decompose(_gp, _gq, _gs);
        g.position.copy(_gp); g.quaternion.copy(_gq); g.scale.copy(_gs);
        g.updateMatrixWorld(true);
        rig.gunKick! *= Math.exp(-(str >= TWO_HAND ? 7 : 4) * (0.4 + 0.6 * G.U.clamp(str / 0.6, 0, 1)) * dt); // (as js/server.ts kickBack)
      }
      // and never through the floor (down on the ground, the hand rests on it instead)
      if (str < 0.4) {
        const low = _gbox.setFromObject(g).min.y;
        const fl = rig.root.position.y + 0.01; // (the floor they're on)
        if (low < fl) { _gp.set(0, fl - low, 0); g.parent!.getWorldQuaternion(_gq).invert(); g.position.add(_gp.applyQuaternion(_gq).divideScalar(g.parent!.getWorldScale(_gs).x)); g.updateMatrixWorld(true); }
      }
      // where the support hand should be on it (next frame, the left hand reaches for it there)
      const gi = rig.gunInfo;
      rig.gunSupport = gi && !gi.pistol ? g.localToWorld((rig.gunSupport || new T.Vector3()).set(gi.support[2] - 0.01, gi.support[1], -gi.support[0])) : null;
    } else rig.gunSupport = null;
  }
  const _gbox = new T.Box3(), _gc = new T.Vector3(), _ga = new T.Vector3(), _gf = new T.Vector3(), _gw = new T.Vector3(), _gI = new T.Quaternion(), _gr = new T.Matrix4();

  // ---------------------------------------------------------------- ragdoll
  // On death the skeleton goes limp: Verlet particles at the joints, held together by distance constraints,
  // fall under gravity onto the floor and the level's boxes (walls, doors, furniture), and the bones are
  // posed from the particles every frame. Secured bodies are rolled face down with the wrists behind the back.
  //   0 pelvis 1 hipL 2 hipR 3 chest 4 shL 5 shR 6 neck 7 head 8 elL 9 elR 10 haL 11 haR 12 knL 13 knR 14 ftL 15 ftR
  const RAD = [0.13, 0.08, 0.08, 0.14, 0.07, 0.07, 0.06, 0.12, 0.05, 0.05, 0.05, 0.05, 0.06, 0.06, 0.05, 0.05];
  const RIGID = [[0, 1], [0, 2], [1, 2], [3, 4], [3, 5], [4, 5], [3, 6], [4, 6], [5, 6], [0, 3], [1, 4], [2, 5], [6, 7], [3, 7],
    [4, 8], [8, 10], [5, 9], [9, 11], [1, 12], [12, 14], [2, 13], [13, 15]];
  // [a, b, fraction of rest length they can't get closer than]: stops the spine, neck and limbs folding flat
  const MIN = [[1, 5, 0.85], [2, 4, 0.85], [0, 6, 0.92], [4, 7, 0.9], [5, 7, 0.9], [4, 10, 0.45], [5, 11, 0.45], [1, 14, 0.6], [2, 15, 0.6], [0, 7, 0.9]];
  const GRAV = 9.8;
  // The physics runs on its own clock, whatever the frame rate: everything below is per step of STEP seconds, and a frame takes
  // as many as its time comes to (at most MAX_STEPS, so a stall doesn't pile up), the rest carried over. What's drawn is
  // between the last two steps (ragdollPose), so it's smooth at any rate.
  const STEP = 1 / 60, MAX_STEPS = 4;
  function stepsFor(rd: Ragdoll, dt: number) {
    rd.acc = (rd.acc || 0) + dt;
    const n = Math.min(MAX_STEPS, Math.floor(rd.acc / STEP + 1e-9));
    rd.acc = Math.min(rd.acc - n * STEP, STEP);
    return n;
  }
  // A dead body's going over: the pull on the upper body (m/s²), fading out over this long (s), and the feet take the other way
  // (they're what it pivots on: it's a push against the floor, not a wind)
  const TOPPLE_A = 9, TOPPLE_T = 0.6, TIP_A = 7, TIP_T = 2.5, TIP_STALL = 0.006;
  // What the solver may do to a body with nothing driving it, each step (m): a contact can only push a joint so far (PUSH, a
  // pass), and the corrections can only add so much speed to a joint (V_GAIN) or take it past V_MAX (about what a long fall comes to). A correction's a change in position, and to Verlet that's speed: without these, a joint
  // pushed out of a desk throws the body that's hanging from it.
  const PUSH = 0.015, V_GAIN = 0.03, V_MAX = 0.14, HOP_MAX = 0.16;
  // ...but a joint that's inside a wall, centre and all, is a body that's half through it: that comes out a good deal faster
  // (PUSH_IN a pass; the speed it adds is still capped, above). A wall also holds what slides along it back (WALL_FRIC of the
  // sideways speed lost on each contact), and a body being turned over (roll) is moved out of one outright (ROLL_PUSH).
  const PUSH_IN = 0.06, WALL_FRIC = 0.3, ROLL_PUSH = 1, ROLL_SLIDE = 0.03;
  // Joints aren't free: each has a range, the body has a twist limit, limbs are capsules that can't pass
  // through the torso or each other, and every joint has some friction (relative motion across a bone is
  // damped), so a limb swings and stops rather than spinning loose.
  //   cones: [joint, child, axis (in the torso frame: x right, y up the spine, z out of the back), half-angle]
  const D2R = Math.PI / 180;
  const CONES: any[] = [
    // hips: centred down and 45 deg forward, 70 deg either way (flex to ~115, extend to ~25 behind)
    [1, 12, [-0.15, -Math.cos(45 * D2R), -Math.sin(45 * D2R)], 70], [2, 13, [0.15, -Math.cos(45 * D2R), -Math.sin(45 * D2R)], 70],
    // shoulders: wide, centred down, out and a little forward
    [4, 8, [-0.55, -0.7, -0.3], 105], [5, 9, [0.55, -0.7, -0.3], 105],
  ];
  // capsules [a, b, radius] by name, and the pairs that mustn't overlap ([x, y, ignore near the root of x])
  const CAPS: Record<string, number[]> = { B1: [0, 3, 0.13], B2: [3, 6, 0.11], HD: [7, 7, 0.11], UL: [4, 8, 0.05], UR: [5, 9, 0.05], FL: [8, 10, 0.045], FR: [9, 11, 0.045],
    TL: [1, 12, 0.07], TR: [2, 13, 0.07], SL: [12, 14, 0.055], SR: [13, 15, 0.055] };
  const SELF: (string | number)[][] = [['FL', 'B1'], ['FR', 'B1'], ['FL', 'B2'], ['FR', 'B2'], ['FL', 'FR'], ['FL', 'TL'], ['FL', 'TR'], ['FR', 'TL'], ['FR', 'TR'],
    ['FL', 'UR'], ['FR', 'UL'], ['UL', 'B1', 0.35], ['UR', 'B1', 0.35], ['UL', 'UR', 0.3], ['SL', 'SR'], ['SL', 'TR'], ['SR', 'TL'], ['TL', 'TR', 0.3],
    ['SL', 'B1'], ['SR', 'B1'], ['TL', 'SR'], ['FL', 'SL'], ['FL', 'SR'], ['FR', 'SL'], ['FR', 'SR'], ['FL', 'HD'], ['FR', 'HD'], ['SL', 'HD'], ['SR', 'HD'],
    ['UL', 'TL', 0.3], ['UR', 'TR', 0.3], ['UL', 'TR'], ['UR', 'TL']];
  const _s1 = new T.Vector3(), _s2 = new T.Vector3(), _sr = new T.Vector3(), _c1 = new T.Vector3(), _c2 = new T.Vector3(), _n = new T.Vector3();
  // closest points between segments p1-q1 and p2-q2: [s, t] along each
  function closest(p1: THREE.Vector3, q1: THREE.Vector3, p2: THREE.Vector3, q2: THREE.Vector3) {
    _s1.subVectors(q1, p1); _s2.subVectors(q2, p2); _sr.subVectors(p1, p2);
    const a = _s1.dot(_s1), e = _s2.dot(_s2), f = _s2.dot(_sr), c = _s1.dot(_sr), b = _s1.dot(_s2), den = a * e - b * b;
    if (a < 1e-9 && e < 1e-9) return [0, 0];
    if (a < 1e-9) return [0, G.U.clamp(f / e, 0, 1)];
    if (e < 1e-9) return [G.U.clamp(-c / a, 0, 1), 0];
    let s = den > 1e-9 ? G.U.clamp((b * f - c * e) / den, 0, 1) : 0, t = (b * s + f) / e;
    if (t < 0) { t = 0; s = G.U.clamp(-c / a, 0, 1); } else if (t > 1) { t = 1; s = G.U.clamp((b - c) / a, 0, 1); }
    return [s, t];
  }
  // Push two capsules apart, splitting the correction over each one's ends by where they touch (equal and
  // opposite, so the body as a whole isn't shoved), at most a couple of centimetres a pass.
  function separate(P: THREE.Vector3[], A: number[], B: number[], skip: number | undefined, sc: number) {
    const [s, t] = closest(P[A[0]], P[A[1]], P[B[0]], P[B[1]]);
    if (skip && s < skip) return;
    _c1.copy(P[A[0]]).lerp(P[A[1]], s); _c2.copy(P[B[0]]).lerp(P[B[1]], t);
    _n.subVectors(_c1, _c2);
    const d = _n.length(), pen = (A[2] + B[2]) * sc - d;
    if (pen <= 0 || d < 1e-6) return;
    _n.multiplyScalar(Math.min(pen, 0.02) * 0.5 / d);
    const wa = 1 / ((1 - s) * (1 - s) + s * s), wb = 1 / ((1 - t) * (1 - t) + t * t);
    const mv = (i: number, f: number) => P[i].addScaledVector(_n, f);
    if (A[0] === A[1]) mv(A[0], 1); else { mv(A[0], (1 - s) * wa); mv(A[1], s * wa); }
    if (B[0] === B[1]) mv(B[0], -1); else { mv(B[0], -(1 - t) * wb); mv(B[1], -t * wb); }
  }
  // Keep P[b] within `max` of `axis` as seen from P[a]. The correction is shared: the limb moves toward the
  // range and the joint the other way by as much (so it can't add momentum and send the body skating off),
  // and it's capped per pass (a limb far outside its range comes back over a few steps, not in one jerk).
  const CONE_STEP = 0.025;
  function cone(P: THREE.Vector3[], a: number, b: number, axis: THREE.Vector3, max: number, k = 0.6) {
    _a.subVectors(P[b], P[a]);
    const len = _a.length();
    if (len < 1e-6) return;
    const cos = _a.dot(axis) / len, cmax = Math.cos(max);
    if (cos >= cmax) return;
    _b.copy(_a).addScaledVector(axis, -_a.dot(axis));
    if (_b.lengthSq() < 1e-9) _b.set(axis.y, -axis.x, 0); // straight opposite: pick any side
    _b.normalize().multiplyScalar(Math.sin(max) * len).addScaledVector(axis, cmax * len).add(P[a]);
    _b.sub(P[b]).multiplyScalar(k);
    const l = _b.length();
    if (l > CONE_STEP) _b.multiplyScalar(CONE_STEP / l);
    _b.multiplyScalar(0.5);
    P[b].add(_b); P[a].sub(_b);
  }
  const _ay = new T.Vector3(), _t1 = new T.Vector3(), _t2 = new T.Vector3(), _t3 = new T.Vector3();
  function ragdollInit(rig: Rig, dir: THREE.Vector3 | null) {
    const { root, hips, chest, neck, head, armL, armR, legL, legR } = rig;
    root.updateMatrixWorld(true);
    const w = (o: THREE.Object3D, x = 0, y = 0, z = 0) => o.localToWorld(new T.Vector3(x, y, z));
    const P = [w(hips), w(legL.th), w(legR.th), w(chest, 0, 0.14, 0), w(armL.up), w(armR.up), w(neck), w(head, 0, 0.1, 0),
      w(armL.lo), w(armR.lo), w(armL.lo, 0, -FARM, 0), w(armR.lo, 0, -FARM, 0), w(legL.sh), w(legR.sh), w(legL.sh, 0, -SHIN, 0), w(legR.sh, 0, -SHIN, 0)];
    const s = rig.scale, dt = 1 / 60;
    // initial motion: whatever the body was doing, plus the shot shoving the upper body
    const v = rig.vel.clone().setY(0);
    const push = dir ? dir.clone().setY(0).normalize() : new T.Vector3(Math.random() - 0.5, 0, Math.random() - 0.5).normalize();
    const kick = [1, 0.4, 0.4, 2.2, 2, 2, 2.4, 2.6, 1.6, 1.6, 1.4, 1.4, -0.4, -0.4, -0.6, -0.6];
    const prev = P.map((p, i) => p.clone().sub(v.clone().multiplyScalar(0.6).addScaledVector(push, kick[i] * (0.3 + Math.random() * 0.15)).multiplyScalar(dt)));
    // knees give first: a nudge forward and down so the legs fold instead of toppling like a plank
    const fwd = new T.Vector3(-Math.sin(root.rotation.y), 0, -Math.cos(root.rotation.y));
    for (const k of [12, 13]) { prev[k].addScaledVector(fwd, -0.02); prev[k].y += 0.01; }
    const rest = (a: number, b: number) => P[a].distanceTo(P[b]);
    rig.rd = {
      P, prev, r: RAD.map((r) => r * s), still: 0, asleep: false, roll: null, on: new Uint8Array(P.length), sp: new Float32Array(P.length), // (on: what's resting on something; sp: its speed before the solver)
      rigid: RIGID.map(([a, b]) => [a, b, rest(a, b)]),
      topple: push.clone(), // the way the upper body goes over (the way the shot was travelling)
      min: MIN.map(([a, b, f]) => [a, b, rest(a, b) * f]),
    };
    rig.body.rotation.set(0, 0, 0); rig.body.position.set(0, 0, 0);
    // A body that was against a wall when it went limp (an arm out to it, the gun up, a lean): out of the wall before the first
    // step, not shoved out over the next few (it would take the rest of the body with it)
    const rd0 = rig.rd; gather(rd0);
    if (rd0.near && rd0.near.length) for (let pass = 0; pass < 4; pass++) for (let i = 0; i < P.length; i++) collide(rd0, i, true);
  }
  function relax(P: THREE.Vector3[], a: number, b: number, d: number, onlyMin: boolean) {
    const pa = P[a], pb = P[b];
    _a.subVectors(pb, pa);
    const len = _a.length() || 1e-6;
    if (onlyMin && len >= d) return;
    const k = ((len - d) / len) * 0.5;
    pa.addScaledVector(_a, k); pb.addScaledVector(_a, -k);
  }
  // Contacts are inelastic: pushing a joint out of the floor or a box also cancels its velocity into it, so
  // bodies land with a dead weight instead of springing back up. A joint pushed up off something is resting on it (rd.on).
  // The level's solids around a body, gathered once a step: a body's sixteen joints are each tested six or ten times a step,
  // and every one of those goes through this short list instead of the world's grid.
  function gather(rd: Ragdoll) {
    const map: any = G.Game && G.Game.map;
    if (!map || !map.world) { rd.near = null; return; }
    let x0 = 1e9, y0 = 1e9, z0 = 1e9, x1 = -1e9, y1 = -1e9, z1 = -1e9;
    for (const p of rd.P) { if (p.x < x0) x0 = p.x; if (p.x > x1) x1 = p.x; if (p.y < y0) y0 = p.y; if (p.y > y1) y1 = p.y; if (p.z < z0) z0 = p.z; if (p.z > z1) z1 = p.z; }
    const m = 0.5, list: any[] = rd.near || [];
    list.length = 0;
    G.World.query(map.world, [x0 - m, y0 - m, z0 - m], [x1 + m, y1 + m, z1 + m], (s: any) => { if (s.move) list.push(s); });
    rd.near = list;
  }
  // roll: a body being turned over by hand, out of a wall at once (not PUSH a pass)
  function collide(rd: Ragdoll, i: number, roll = false) {
    const p = rd.P[i], q = rd.prev[i], r = rd.r[i], L = G.Level, map: any = G.Game && G.Game.map;
    if (map && map.world) { // out of whatever solid it's in (the world's: any floor, a step, a sofa), the shallowest way
      if (!rd.near) gather(rd);
      const list = rd.near!, qx = q.x, qz = q.z; // (where it was: which face of a wall it came in by)
      for (let k = 0; k < list.length; k++) {
        const s = list[k];
        if (p.x + r <= s.min[0] || p.x - r >= s.max[0] || p.y + r <= s.min[1] || p.y - r >= s.max[1] || p.z + r <= s.min[2] || p.z - r >= s.max[2]) continue;
        const xl = p.x + r - s.min[0], xh = s.max[0] - (p.x - r), yl = p.y + r - s.min[1], yh = s.max[1] - (p.y - r), zl = p.z + r - s.min[2], zh = s.max[2] - (p.z - r);
        const ox = Math.min(xl, xh), oy = Math.min(yl, yh), oz = Math.min(zl, zh);
        if (ox <= 0 || oy <= 0 || oz <= 0) continue;
        // resting on top of it wins for anything low (bodies can end up across a sofa, or down a flight of stairs)
        if (yh <= yl && (yh < ox && yh < oz || s.max[1] - s.min[1] < 1.4 && yh < 0.5)) { p.y += Math.min(yh, roll ? ROLL_PUSH : PUSH); q.y = Math.max(q.y, p.y); rd.on[i] = 1; }
        else if (oy < ox && oy < oz) { p.y -= Math.min(yl, roll ? ROLL_PUSH : PUSH); q.y = Math.min(q.y, p.y); }
        else {
          // a wall (walls are built in cells, so there are seams along them: the shallowest way out can be along it, into the next cell).
          // It went in by one face, so it comes back out of it: the axis it was clear of before, if only one.
          const ex = qx + r <= s.min[0] || qx - r >= s.max[0], ez = qz + r <= s.min[2] || qz - r >= s.max[2];
          const alongX = ex !== ez ? ex : ox < oz;
          const cap = roll ? ROLL_PUSH : p.x > s.min[0] && p.x < s.max[0] && p.z > s.min[2] && p.z < s.max[2] ? PUSH_IN : PUSH; // (its centre in the wall: faster)
          if (alongX) {
            const left = ex ? qx < s.min[0] : xl < xh;
            p.x += left ? -Math.min(xl, cap) : Math.min(xh, cap); q.x = p.x; q.z += (p.z - q.z) * WALL_FRIC;
          } else {
            const back = ez ? qz < s.min[2] : zl < zh;
            p.z += back ? -Math.min(zl, cap) : Math.min(zh, cap); q.z = p.z; q.x += (p.x - q.x) * WALL_FRIC;
          }
        }
      }
      // rolling ground (js/world.ts terrainAt: its blocks are for rays): up out of it to lie on it as it lies
      const tr = map.world.terrain;
      if (tr) { const g = G.World.terrainUnder(tr, p.x, p.z) + r; if (p.y < g) { p.y = g; if (q.y < g) q.y = g; rd.on[i] = 1; } }
      return;
    }
    if (p.y < r) { p.y = r; if (q.y < r) q.y = r; rd.on[i] = 1; }
    if (!map) return;
    const tx = Math.floor(p.x / L.TS), tz = Math.floor(p.z / L.TS);
    for (let oz = -1; oz <= 1; oz++) for (let ox = -1; ox <= 1; ox++) for (const b of L.boxesAt(map, tx + ox, tz + oz)) {
      if (p.y - r > b.h || p.y + r < b.y0) continue;
      const dx = p.x - b.cx, dz = p.z - b.cz, px = b.hx + r - Math.abs(dx), pz = b.hz + r - Math.abs(dz);
      if (px <= 0 || pz <= 0) continue;
      const up = b.h + r - p.y; // or rest on top of it (bodies can end up across a sofa)
      if (b.h < 1.4 && up < px && up < pz) { p.y += up; q.y = Math.max(q.y, p.y); }
      else if (px < pz) { p.x += Math.sign(dx || 1) * px; q.x = p.x; } else { p.z += Math.sign(dz || 1) * pz; q.z = p.z; }
    }
  }
  // torso frame from the particles: x to the right, y up the spine, z out of the back
  function torsoFrame(P: THREE.Vector3[]) {
    const x = new T.Vector3().subVectors(P[5], P[4]).normalize(), y = new T.Vector3().subVectors(P[6], P[0]).normalize();
    const z = new T.Vector3().crossVectors(x, y).normalize();
    return { x, y: new T.Vector3().crossVectors(z, x), z };
  }
  function ragdollStep(rig: Rig, dt: number) {
    const rd = rig.rd, P = rd.P, prev = rd.prev;
    if (!rd.Pold) rd.Pold = P.map((p) => p.clone()); else rd.Pold.forEach((o: THREE.Vector3, i: number) => o.copy(P[i])); // (where it was: what's drawn is between this and P)
    if (rd.roll) { // rolling the body face down to secure it
      const ro = rd.roll;
      if (!ro.driven) ro.t = Math.min(1, ro.t + dt / 0.5);
      const q = new T.Quaternion().setFromAxisAngle(ro.axis, ro.angle * G.U.smooth(0, 1, ro.t));
      let sink = 0;
      const sh = ro.shift || (ro.shift = new T.Vector3());
      P.forEach((p, i) => { p.copy(ro.base[i]).sub(ro.pivot).applyQuaternion(q).add(ro.pivot).add(sh); sink = Math.max(sink, ro.ground + rd.r[i] - p.y); });
      const up = Math.max(0, sink) + ro.lift * Math.sin(Math.PI * ro.t); // nothing passes through the floor
      P.forEach((p, i) => { p.y += up; });
      // ...nor through a wall: what the turn sweeps into is pushed out of (nothing about it is physical, but it can't be
      // seen to go through), and the whole body slides away from the wall as it goes (sh), a little each step, so it isn't
      // left squashed against it
      gather(rd);
      if (rd.near && rd.near.length) {
        const was = ro.was || (ro.was = P.map(() => new T.Vector3()));
        P.forEach((p, i) => was[i].copy(p));
        for (let pass = 0; pass < 3; pass++) for (let i = 0; i < P.length; i++) collide(rd, i, true);
        let dx = 0, dz = 0;
        P.forEach((p, i) => { const ex = p.x - was[i].x, ez = p.z - was[i].z; if (Math.abs(ex) > Math.abs(dx)) dx = ex; if (Math.abs(ez) > Math.abs(dz)) dz = ez; });
        sh.x += G.U.clamp(dx, -ROLL_SLIDE, ROLL_SLIDE); sh.z += G.U.clamp(dz, -ROLL_SLIDE, ROLL_SLIDE);
      }
      P.forEach((p, i) => { prev[i].copy(p); });
      if (ro.t >= 1 && !ro.driven) { rd.roll = null; rd.asleep = false; rd.still = 0; rd.calm = 0.8; rd.pinT = 0; }
      return;
    }
    if (rd.asleep) return;
    gather(rd);
    const h = dt, h2 = h * h;
    // the shots that landed since the last step: the upper body's knocked the way they went, less the less there is of them.
    // Limp, there's no muscle behind it either, and not much to shove
    if (rd.push) {
      const J = rd.push.length(), f = Math.min(1.5, Math.sqrt(J / 4)) * (rd.drive ? 1 : 0.4);
      if (J > 1e-6) { rd.push.multiplyScalar(1 / J); for (const [i, k] of [[3, 0.055], [4, 0.045], [5, 0.045], [6, 0.05], [7, 0.055], [0, 0.02]]) prev[i].addScaledVector(rd.push, -k * f * (0.8 + Math.random() * 0.4)); }
      rd.push = null;
    }
    // A clean fall: while the spine is still upright, the chest, shoulders and head are pulled over the way
    // the body's going, so it ends up lying down rather than balanced on its knees or sitting up.
    const upright = _a.subVectors(P[6], P[0]).normalize().y;
    if (upright > 0.3 && rig.deadT < TOPPLE_T && rd.topple && !rd.handled && !rig.zipped && !rd.drive && (rd.on[14] || rd.on[15])) {
      const acc = TOPPLE_A * upright * (1 - rig.deadT / TOPPLE_T) * h2;
      for (const i of [3, 4, 5, 6, 7]) P[i].addScaledVector(rd.topple, acc);
      for (const i of [14, 15]) P[i].addScaledVector(rd.topple, -acc * 2.5);
    }
    // Come to a stop sitting up, or propped on its knees: nothing's holding it there, so it goes on over the way it was going.
    // The knees and feet take the other way: it turns it over, and can't drive it anywhere.
    if (upright > 0.45 && !rd.drive && rig.deadT >= TOPPLE_T && rig.deadT < TIP_T && !rd.handled && !rig.zipped && !rd.roll && rd.topple && rd.sp[3] < TIP_STALL && rd.sp[6] < TIP_STALL && (rd.on[0] || rd.on[1] || rd.on[2] || rd.on[12] || rd.on[13])) {
      const acc = TIP_A * h2;
      for (const i of [3, 4, 5, 6, 7]) P[i].addScaledVector(rd.topple, acc);
      for (const i of [12, 13, 14, 15]) P[i].addScaledVector(rd.topple, -acc * 1.25);
    }
    const down = upright < 0.5; // lying, more or less
    for (let i = 0; i < P.length; i++) {
      const p = P[i], q = prev[i];
      let k = rd.calm! > 0 ? 0.85 : rig.deadT > 2.5 ? 0.8 : 0.975; // damping (heavier while settling after being moved, and once it's been down a while)
      if (down && rd.on[i]) k = Math.min(k, 0.88); // down on the floor: it stops, it doesn't bounce about
      const vx = (p.x - q.x) * k, vy = (p.y - q.y) * k, vz = (p.z - q.z) * k;
      q.copy(p);
      p.x += vx; p.y += vy - GRAV * h2; p.z += vz;
    }
    // a living body's muscles (powerStep): toward the animated pose, at its speed
    const D = rd.drive;
    if (D) {
      for (let i = 0; i < P.length; i++) {
        const p = P[i], q = prev[i], t = D.T[i], tv = D.Tv[i], ki = D.kpI ? D.kpI[i] : 1, kp = Math.min(0.5, D.kp * ki), kv = Math.min(0.9, D.kv * ki);
        let vx = p.x - q.x, vy = p.y - q.y, vz = p.z - q.z;
        vx += (tv.x - vx) * kv; vy += (tv.y - vy) * kv; vz += (tv.z - vz) * kv;
        p.x += (t.x - p.x) * kp; p.y += (t.y - p.y) * kp; p.z += (t.z - p.z) * kp;
        q.set(p.x - vx, p.y - vy, p.z - vz);
      }
      if (D.trem) for (const i of [0, 12, 13]) { P[i].x += (Math.random() - 0.5) * D.trem; P[i].z += (Math.random() - 0.5) * D.trem; }
      if (D.fall && _a.subVectors(P[6], P[0]).normalize().y > 0.25) for (const i of [3, 4, 5, 6, 7]) P[i].addScaledVector(D.fall, 3 * h2);
    }
    // joint friction: across each bone, some of the relative motion is lost every step
    for (const [a, b] of rd.rigid) {
      const pa = P[a], pb = P[b], qa = prev[a], qb = prev[b];
      _c.subVectors(pa, qa); _d.subVectors(pb, qb); // this step's motion
      _e.addVectors(_c, _d).multiplyScalar(0.5);
      const f = 0.2; // stiff enough that limbs follow the body down instead of flailing
      qa.copy(pa).sub(_c.lerp(_e, f)); qb.copy(pb).sub(_d.lerp(_e, f));
    }
    for (let i = 0; i < P.length; i++) rd.sp[i] = P[i].distanceTo(prev[i]);
    rd.on.fill(0);
    // secured: wrists pulled together at the small of the back
    let wrist = null;
    if (rd.calm! > 0) rd.calm! -= h;
    rd.pinT = (rd.pinT || 0) + h;
    rd.keepPin = Math.max(0, (rd.keepPin || 0) - h);
    let pin = 0; // wrists drawn together over a moment, not snapped
    if (rig.zipped) pin = 0.5 * Math.min(1, rd.pinT / 0.6);
    else if (rd.handled && !rd.roll) pin = 0.5 * G.U.smooth(0.42, 0.62, rd.handled.t); // pulled behind the back
    else if (rd.keepPin > 0) pin = 0.5; // tie done, waiting for the host to confirm it
    if (pin > 0) { const f = torsoFrame(P); wrist = P[0].clone().addScaledVector(f.z, 0.16 * rig.scale).addScaledVector(f.y, 0.12 * rig.scale); }
    const iters = D ? 4 : 8, self = !D || D.self; // (a strong living body: fewer passes, no tangling to check)
    for (let it = 0; it < iters; it++) {
      for (const [a, b, d] of rd.rigid) relax(P, a, b, d, false);
      for (const [a, b, d] of rd.min) relax(P, a, b, d, true);
      if (D && D.brace) relax(P, 4, 10, D.brace, true); // a locked arm holds the shoulder off the hand on the floor
      // hinges: knees bend forward, elbows bend back
      const f = torsoFrame(P);
      for (const [hp, kn, ft] of [[1, 12, 14], [2, 13, 15]]) {
        const off = _a.subVectors(P[kn], _b.addVectors(P[hp], P[ft]).multiplyScalar(0.5)).dot(f.z);
        if (off > 0) P[kn].addScaledVector(f.z, -off);
      }
      for (const [sh, el, ha] of [[4, 8, 10], [5, 9, 11]]) {
        const off = _a.subVectors(P[el], _b.addVectors(P[sh], P[ha]).multiplyScalar(0.5)).dot(f.z);
        if (off < 0) P[el].addScaledVector(f.z, -off);
      }
      // ball joints within their range (hips, shoulders), in the torso's frame
      for (const [j, c, ax, deg] of CONES) {
        _ay.set(0, 0, 0).addScaledVector(f.x, ax[0]).addScaledVector(f.y, ax[1]).addScaledVector(f.z, ax[2]).normalize();
        cone(P, j, c, _ay, deg * D2R);
      }
      // the spine bends so far (neck on chest 35 deg, head on neck 45 deg)
      _ay.subVectors(P[3], P[0]).normalize(); cone(P, 3, 6, _ay, 35 * D2R);
      _ay.subVectors(P[6], P[3]).normalize(); cone(P, 6, 7, _ay, 45 * D2R);
      // and twists so far: the shoulders turn at most 45 deg on the hips
      {
        const up = f.y;
        _a.subVectors(P[2], P[1]).addScaledVector(up, -_a.dot(up));
        _b.subVectors(P[5], P[4]); _b.addScaledVector(up, -_b.dot(up));
        const la = _a.length(), lb = _b.length();
        if (la > 1e-4 && lb > 1e-4) {
          const tw = Math.atan2(_c.crossVectors(_a, _b).dot(up), _a.dot(_b)), lim = 45 * D2R;
          if (Math.abs(tw) > lim) {
            // turn the shoulders and the hips half the excess each, about the spine
            const ex = (Math.abs(tw) - lim) * Math.sign(tw) * 0.5, mid = _d.addVectors(P[0], P[3]).multiplyScalar(0.5);
            const qs = _q2.setFromAxisAngle(up, -ex);
            for (const i of [4, 5]) P[i].sub(mid).applyQuaternion(qs).add(mid);
            qs.setFromAxisAngle(up, ex);
            for (const i of [1, 2]) P[i].sub(mid).applyQuaternion(qs).add(mid);
          }
        }
      }
      // limbs don't pass through the body or each other
      if (self) for (const [x, y, skip] of SELF) separate(P, CAPS[x], CAPS[y], skip as number, rig.scale);
      if (wrist) for (const [k, sd] of [[10, -1], [11, 1]]) P[k].lerp(_a.copy(wrist).addScaledVector(f.x, sd * 0.035 * rig.scale), pin);
      for (let i = 0; i < P.length; i++) collide(rd, i);
    }
    // a last pass of body-on-body, then the floor, so neither is left the loser
    for (let it = 0; it < 2; it++) { if (self) for (const [x, y, skip] of SELF) separate(P, CAPS[x], CAPS[y], skip as number, rig.scale); for (let i = 0; i < P.length; i++) collide(rd, i); }
    // the solver keeps a body together, it doesn't throw it: how far a joint can go in a step, and what its corrections left
    // in the speed, capped (a joint caught out of place comes back over a few steps, not in one)
    if (!D) for (let i = 0; i < P.length; i++) {
      _a.subVectors(P[i], rd.Pold[i]);
      const m = _a.length();
      if (m > HOP_MAX) P[i].copy(rd.Pold[i]).addScaledVector(_a, HOP_MAX / m);
      _a.subVectors(P[i], prev[i]);
      const l = _a.length(), lim = Math.min(V_MAX, rd.sp[i] + V_GAIN);
      if (l > lim) prev[i].copy(P[i]).addScaledVector(_a, -lim / l);
    }
    // friction against whatever it's lying on; sleep once everything has come to rest
    let moved = 0;
    for (let i = 0; i < P.length; i++) {
      const p = P[i], q = prev[i];
      if (rd.on[i]) { q.x += (p.x - q.x) * 0.5; q.z += (p.z - q.z) * 0.5; } // heavy: drags, doesn't skate
      moved = Math.max(moved, p.distanceToSquared(q));
    }
    rd.still = moved < 4e-6 && (down || rig.deadT > 3) ? rd.still + 1 : 0;
    if (rd.still > 30 || (rig.deadT > (down ? 4.5 : 8) && !(rd.calm! > 0) && !rd.handled && !rd.keepPin && !rig.zipped)) rd.asleep = true; // a body that's been down a while lies still
  }
  function setWorldQ(bone: THREE.Object3D, q: THREE.Quaternion) { bone.parent!.getWorldQuaternion(_q2).invert(); bone.quaternion.copy(_q2.multiply(q)); bone.updateMatrixWorld(true); }
  function frameQ(xv: THREE.Vector3, yv: THREE.Vector3) {
    const x = xv.clone().normalize(), z = new T.Vector3().crossVectors(x, yv).normalize(), y = new T.Vector3().crossVectors(z, x);
    _m.makeBasis(x, y, z); return new T.Quaternion().setFromRotationMatrix(_m);
  }
  function ragdollPose(rig: Rig) {
    const rd = rig.rd, f = (rd.acc || 0) / STEP, { root, body, hips, spine, chest, neck, head } = rig;
    let P = rd.P;
    if (rd.Pold) { P = rd.R || (rd.R = rd.P.map((p) => p.clone())); P.forEach((p, i) => p.copy(rd.Pold![i]).lerp(rd.P[i], f)); } // (between the last two steps)
    root.updateMatrixWorld(true);
    hips.position.copy(body.worldToLocal(P[0].clone()));
    hips.updateMatrixWorld(true);
    const across = new T.Vector3().subVectors(P[2], P[1]);
    setWorldQ(hips, frameQ(across, new T.Vector3().subVectors(P[3], P[0])));
    spine.quaternion.identity();
    const shoulders = new T.Vector3().subVectors(P[5], P[4]);
    setWorldQ(chest, frameQ(shoulders, new T.Vector3().subVectors(P[6], P[3])));
    setWorldQ(neck, frameQ(shoulders, new T.Vector3().subVectors(P[7], P[6])));
    head.quaternion.identity();
    // A limb's roll about its own length: its hinge (knee, elbow) axis comes from the bend when it's bent,
    // turned to agree with the torso's left-right; nearly straight (no bend to go by) it's the torso's; and it
    // can't twist more than 50 deg away from that either way. (Without this a straight limb spins freely.)
    const ref = torsoFrame(P).x, TW = 50 * D2R;
    const sideFor = (dir: THREE.Vector3, bend: THREE.Vector3, w: number) => {
      const r = _t1.copy(ref).addScaledVector(dir, -ref.dot(dir));
      if (r.lengthSq() < 1e-6) r.set(dir.y, -dir.x, 0);
      r.normalize();
      const s = _t2.copy(bend).addScaledVector(dir, -bend.dot(dir));
      if (s.lengthSq() < 1e-8 || w <= 0) return r.clone();
      s.normalize();
      if (s.dot(r) < 0) s.negate();
      s.lerp(r, 1 - w).normalize();
      const ang = Math.atan2(_t3.crossVectors(r, s).dot(dir), r.dot(s));
      if (Math.abs(ang) <= TW) return s.clone();
      return r.clone().applyAxisAngle(dir, Math.sign(ang) * TW);
    };
    const limb = (up: THREE.Object3D, lo: THREE.Object3D, j: number, e: number) => {
      const a = up.getWorldPosition(new T.Vector3());
      const u = new T.Vector3().subVectors(P[j], a), l = new T.Vector3().subVectors(P[e], P[j]);
      const bend = new T.Vector3().crossVectors(u, l), sinB = bend.length() / Math.max(1e-6, u.length() * l.length());
      const w = G.U.smooth(0.08, 0.3, sinB); // how much there is to go on
      aimBone(up, a, P[j], sideFor(u.normalize(), bend, w));
      const lp = lo.getWorldPosition(new T.Vector3()); // where the lower bone actually starts once the upper is placed
      aimBone(lo, lp, P[e], sideFor(l.subVectors(P[e], lp).normalize(), bend, w));
    };
    limb(rig.armL.up, rig.armL.lo, 8, 10); limb(rig.armR.up, rig.armR.lo, 9, 11);
    limb(rig.legL.th, rig.legL.sh, 12, 14); limb(rig.legR.th, rig.legR.sh, 13, 15);
    root.updateMatrixWorld(true);
  }
  function animateDeath(rig: Rig, dt: number) {
    rig.deadT += dt;
    if (!rig.rd) ragdollInit(rig, null);
    for (let n = stepsFor(rig.rd, dt); n > 0; n--) ragdollStep(rig, STEP);
    ragdollPose(rig);
    if (rig.dropped) dropGun(rig, dt);
  }
  // roll a body onto its front to zip-tie it (instant when it was secured before we saw it)
  // the turn that puts a body onto its front, about the line from hips to neck (null if it's already face down)
  function planRoll(rig: Rig) {
    const rd = rig.rd, P = rd.P, f = torsoFrame(P);
    const axis = new T.Vector3().subVectors(P[6], P[0]).setY(0);
    if (axis.lengthSq() < 1e-4) return null;
    axis.normalize();
    const zp = f.z.clone().addScaledVector(axis, -axis.dot(f.z)), up = UP.clone().addScaledVector(axis, -axis.dot(UP));
    const angle = Math.atan2(axis.dot(new T.Vector3().crossVectors(zp, up)), zp.dot(up));
    if (Math.abs(angle) < 0.6) return null; // already face down enough
    return { axis, angle, pivot: P[0].clone(), base: P.map((p) => p.clone()), t: 0, lift: 0.15 * rig.scale, ground: Math.min(...P.map((p, i) => p.y - rd.r[i])) }; // (ground: what it's lying on)
  }
  function rollFaceDown(rig: Rig, instant: boolean) {
    const rd = rig.rd; if (!rd) return;
    const handled = !!rd.handled || rd.keepPin! > 0; // an officer already turned it over and held the wrists
    rd.handled = null; rd.keepPin = 0;
    rd.asleep = false; rd.still = 0; rd.calm = 0.8; rd.pinT = handled ? 1 : 0;
    if (rd.roll && rd.roll.driven) { rd.roll.driven = false; return; } // finish the turn that's under way
    const ro = planRoll(rig);
    if (!ro) return;
    ro.t = instant ? 1 : 0;
    rd.roll = ro;
    if (instant) ragdollStep(rig, 0);
  }
  function dropGun(rig: Rig, dt: number) {
    const d = rig.dropped, g = d!.g, map = G.Game && G.Game.map;
    if (d!.floor == null) d!.floor = (map ? G.Level.groundAt(map, g.position.x, g.position.z, 0.05, g.position.y, 0.05) : 0) + 0.05; // (the floor it falls to: upstairs or down)
    if (g.position.y <= d!.floor) return;
    d!.vy -= 12 * dt;
    g.position.y = Math.max(d!.floor, g.position.y + d!.vy * dt);
    g.rotation.z += d!.spin * dt;
    if (g.position.y <= d!.floor) g.rotation.z = Math.PI / 2;
  }

  // ---------------------------------------------------------------- hitboxes
  // Zones: head, chest (heart, lungs), abdomen (liver, gut, spine), upper arm, forearm, thigh, shin. These capsules
  // are what a round is checked against first; what it does inside is worked out on the body's real shape, organ by
  // organ (js/ballistics.ts).
  function hitboxes(rig: Rig) {
    if (!rig.hb) {
      const mk = (zone: string, r: number, side?: string) => ({ zone, r, side, a: new T.Vector3(), b: new T.Vector3() });
      rig.hb = [mk('head', 0.135), mk('chest', 0.19), mk('abdomen', 0.16), mk('uarm', 0.06, 'L'), mk('farm', 0.055, 'L'), mk('uarm', 0.06, 'R'), mk('farm', 0.055, 'R'),
        mk('thigh', 0.09, 'L'), mk('shin', 0.07, 'L'), mk('thigh', 0.09, 'R'), mk('shin', 0.07, 'R')];
    }
    const s = rig.scale, h = rig.hb;
    const W = (o: THREE.Object3D, x: number, y: number, z: number, out: THREE.Vector3) => o.localToWorld(out.set(x, y, z));
    W(rig.head, 0, 0.1, -0.01, h[0].a); h[0].b.copy(h[0].a);                    // head (sphere)
    W(rig.chest, 0, 0.05, 0, h[1].a); W(rig.chest, 0, 0.135, 0, h[1].b);        // chest (its rounded top stops at the chin)
    W(rig.hips, 0, 0.0, 0, h[2].a); W(rig.spine, 0, 0.16, 0, h[2].b);           // abdomen / pelvis
    let i = 3;
    for (const arm of [rig.armL, rig.armR]) {
      W(arm.up, 0, 0, 0, h[i].a); W(arm.up, 0, -UARM, 0, h[i].b); i++;
      W(arm.lo, 0, 0, 0, h[i].a); W(arm.lo, 0, -FARM - 0.04, 0, h[i].b); i++;
    }
    for (const leg of [rig.legL, rig.legR]) {
      W(leg.th, 0, 0, 0, h[i].a); W(leg.th, 0, -THIGH, 0, h[i].b); i++;
      W(leg.sh, 0, 0, 0, h[i].a); W(leg.sh, 0, -SHIN - 0.03, 0, h[i].b); i++;
    }
    for (const b of h) b.rs = b.r * s;
    return h;
  }
  // Ray vs capsule (segment a-b, radius r); returns distance along the unit ray or -1.
  function rayCapsule(ro: THREE.Vector3, rd: THREE.Vector3, pa: THREE.Vector3, pb: THREE.Vector3, r: number) {
    const bax = pb.x - pa.x, bay = pb.y - pa.y, baz = pb.z - pa.z;
    const oax = ro.x - pa.x, oay = ro.y - pa.y, oaz = ro.z - pa.z;
    const baba = bax * bax + bay * bay + baz * baz;
    const bard = bax * rd.x + bay * rd.y + baz * rd.z;
    const baoa = bax * oax + bay * oay + baz * oaz;
    const rdoa = rd.x * oax + rd.y * oay + rd.z * oaz;
    const oaoa = oax * oax + oay * oay + oaz * oaz;
    if (baba > 1e-9) {
      const a = baba - bard * bard, b = baba * rdoa - baoa * bard, c = baba * oaoa - baoa * baoa - r * r * baba;
      const hh = b * b - a * c;
      if (hh >= 0 && a > 1e-9) {
        const t = (-b - Math.sqrt(hh)) / a, y = baoa + t * bard;
        if (y > 0 && y < baba) return t >= 0 ? t : -1;
      }
    }
    // end caps
    let best = -1;
    for (const p of [pa, pb]) {
      const ox = ro.x - p.x, oy = ro.y - p.y, oz = ro.z - p.z;
      const b = rd.x * ox + rd.y * oy + rd.z * oz, c = ox * ox + oy * oy + oz * oz - r * r, hh = b * b - c;
      if (hh > 0) { const t = -b - Math.sqrt(hh); if (t >= 0 && (best < 0 || t < best)) best = t; }
    }
    return best;
  }
  // Closest distance between the ray's line and the segment pa-pb: how near the round's path comes to the
  // middle of that body part.
  function rayAxisDist(ro: THREE.Vector3, rd: THREE.Vector3, pa: THREE.Vector3, pb: THREE.Vector3) {
    const vx = pb.x - pa.x, vy = pb.y - pa.y, vz = pb.z - pa.z, wx = ro.x - pa.x, wy = ro.y - pa.y, wz = ro.z - pa.z;
    const b = rd.x * vx + rd.y * vy + rd.z * vz, c = vx * vx + vy * vy + vz * vz, d = rd.x * wx + rd.y * wy + rd.z * wz, e = vx * wx + vy * wy + vz * wz;
    const D = c - b * b;
    let tc = c > 1e-9 ? (D > 1e-9 ? (e - b * d) / D : e / c) : 0;
    tc = Math.max(0, Math.min(1, tc));
    const sc = tc * b - d;
    return Math.hypot(wx + sc * rd.x - tc * vx, wy + sc * rd.y - tc * vy, wz + sc * rd.z - tc * vz);
  }
  // Nearest hit on a rig: { t, zone, c } or null. c: 0 when the round goes through the middle of the part,
  // 1 when it only grazes it.
  // up: where it struck, from -1 (bottom of the part) to 1 (top): a helmet only covers the top of the head.
  // A round that goes through an arm carries on into whatever's behind it: `behind` is the next part it hits
  // (an arm held across the chest doesn't stop a round reaching the chest).
  function raycast(rig: any, ro: THREE.Vector3, rd: THREE.Vector3, maxT: number) {
    const hits: { t: number; zone: string; b: any; behind?: any }[] = [];
    for (const b of hitboxes(rig)) {
      const t = rayCapsule(ro, rd, b.a, b.b, b.rs);
      if (t >= 0 && t < maxT) hits.push({ t, zone: b.zone, b });
    }
    if (!hits.length) return null;
    hits.sort((p, q) => p.t - q.t);
    const fin = (h: any) => { h.c = Math.min(1, rayAxisDist(ro, rd, h.b.a, h.b.b) / h.b.rs); h.up = (ro.y + rd.y * h.t - h.b.a.y) / h.b.rs; h.side = h.b.side; delete h.b; return h; };
    const best = hits[0];
    if (best.zone === 'uarm' || best.zone === 'farm') { const nx = hits.find((h) => h.zone !== 'uarm' && h.zone !== 'farm'); if (nx) best.behind = fin(nx); }
    return fin(best);
  }

  // ---------------------------------------------------------------- debug view (?hitboxes or F9)
  const dbgMat: any = { head: new T.MeshBasicMaterial({ color: 0xff3030, wireframe: true }), chest: new T.MeshBasicMaterial({ color: 0xff8030, wireframe: true }), abdomen: new T.MeshBasicMaterial({ color: 0xffd030, wireframe: true }) };
  dbgMat.uarm = dbgMat.farm = new T.MeshBasicMaterial({ color: 0x30ff60, wireframe: true });
  dbgMat.thigh = dbgMat.shin = new T.MeshBasicMaterial({ color: 0x30a0ff, wireframe: true });
  function drawDebug(rig: Rig) {
    if (!debug) { if (rig.dbg) rig.dbg.forEach((m: THREE.Object3D) => (m.visible = false)); return; }
    const h = hitboxes(rig);
    const parent = rig.root.parent;
    if (!parent) return;
    // bones are rigid, so each capsule is built once at its exact radius and length
    if (!rig.dbg) rig.dbg = h.map((b: any) => { const m = new T.Mesh(new T.CapsuleGeometry(b.rs, Math.max(0.001, b.a.distanceTo(b.b)), 3, 8), dbgMat[b.zone]); parent.add(m); return m; });
    h.forEach((b: any, i: any) => {
      const m = rig.dbg![i];
      m.visible = rig.state !== 'dead';
      m.position.addVectors(b.a, b.b).multiplyScalar(0.5);
      if (b.a.distanceToSquared(b.b) > 1e-8) m.quaternion.setFromUnitVectors(UP, _a.subVectors(b.b, b.a).normalize());
    });
  }

  // where an officer's hands are on someone being restrained: between the shoulder blades while they're shoved down,
  // then at the wrists (a body: a hand on the shoulder to turn it over, then at the wrists)
  function zipPoint(rig: Rig, t: number, living: boolean) {
    rig.root.updateMatrixWorld(true);
    const wr = rig.armL.tie.getWorldPosition(new THREE.Vector3()).add(rig.armR.tie.getWorldPosition(new THREE.Vector3())).multiplyScalar(0.5);
    if (!living) return rig.chest.localToWorld(new THREE.Vector3(0, 0.22, 0)).lerp(wr, G.U.smooth(0.38, 0.6, t));
    return rig.chest.localToWorld(new THREE.Vector3(0, 0.16, 0.14)).lerp(wr, G.U.smooth(0.42, 0.56, t));
  }
  // where someone lying (dead, or down for good) is: their ragdoll's hips, wherever it came to rest
  function bodyAt(rig: Rig) { return (rig.hips || rig.root).getWorldPosition(new THREE.Vector3()); }
  return {
    create, zipSwing, raycast, rayCapsule, OFFICER_LOOK, LOOKS, cleanLook, armourKit, zipPoint, bodyAt,
    get debug() { return debug; },
    toggleDebug() { debug = !debug; return debug; },
  };
})();
G.Rig = G_Rig;
interface GameModules { Rig: typeof G_Rig; }
