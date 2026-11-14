'use strict';
// First-person weapon handling: the arms, reloads, racking and inspecting.
//
// The viewmodel (js/gunmodels.ts, js/viewmodel.ts) is bound to its gun by js/gunrig.ts, which gives each gun its moving parts (magazine, charging handle, side bolt
// handle, slide, pump, bolt, lever, belt cover, break-open barrels, revolver cylinder) and anchor points
// (grip, support hand, magazine well, ports). Every frame G.VMAnim.update() samples the clip that's
// playing for the current state (reloading, racking after the last shell, inspecting) and poses the parts
// and both hands. The arms run from fixed shoulders just off-screen to wherever the hands are, so a hand
// can leave the gun, go to a pouch for a magazine and come back.
/** How a gun is reloaded (js/vmanim.ts kinds). */
type VmReload = 'mag' | 'akimbo' | 'revolver' | 'break' | 'enbloc' | 'bow' | 'shell' | 'belt' | 'hinge' | 'block';
/** Which part of a gun the hand works to rack it. */
type VmAction = 'ar' | 'pistol' | 'bolt' | 'pump' | 'lever' | 'handle';
/** What the hand works: a gun's action, or the cylinder or barrels it opens (an inspection). */
type VmHold = VmAction | 'revolver' | 'break';
/** What the magazine is doing in a pose. */
type VmMagMode = 'in' | 'hand' | 'drop' | 'gone' | 'peek' | 'rise' | 'chk';
/** Something the left hand carries. */
type VmPropKind = 'shell' | 'case' | 'loader' | 'clip' | 'bolt' | 'claw';
/** Where a gun's round shows when it is checked: at the back of the cylinder, the open breech, the ejection port, the top or right of the receiver. */
type VmChamberSide = 'cyl' | 'breech' | 'face' | 'port' | 'top' | 'right';
const G_VMAnim = (() => {
  const T = THREE;
  type V3 = THREE.Vector3;
  type Mats = typeof G.GunMaterials.M;
  type Def = WeaponDef; // a gun's definition (js/data.ts WEAPONS)
  type Pl = typeof G.Me; // the player (js/player.ts)
  // what a gun model says about its moving parts and anchor points (js/gunrig.ts): [forward, up, right] each
  type Info = GunRigInfo;
  type Anchors = GunRigAnchors; // (a hand's anchor points in the gun's space, and where its parts sit at rest: js/gunrig.ts)
  type Rig = GunRig; // (one gun in the hands: its holder, its parts, its anchors, its magazine's check data: js/gunrig.ts)
  interface MagState { mode: VmMagMode; at?: number; d?: number; k?: number; q?: THREE.Quaternion }
  // one frame of a clip: the gun's offset and what each part and hand is doing (null: left alone)
  interface Pose { gun: number[]; L: V3 | null; R: V3 | null; mag: MagState; ch: number; catch?: number | null; handle: number | null; open: number | null; slide: number | null; cyl: number; brk: number; cover: number; pump: number | null; lever: number | null; hinge: number | null; hsteps?: number[] | null; Lon?: HingeHold | null; lock: number; bolt: number[] | null; prop: { kind: VmPropKind; rx?: number; dx?: number; by?: V3; n?: number; seat?: number; up?: number; at?: V3[]; home?: V3 } | null; chk?: number; dropCase?: boolean; fed?: number; pulled?: boolean; Lk?: number; Rk?: number } // (Lk, Rk: how far a hand is on an action's control, for how it holds it: humHold)
  // the support hand during a reload sequence (hingeClip): between a and b (k: 0..1), each a point in the gun's space or ON a part_ node (it moves with it: resolved in apply, once the
  // sequence has posed the parts); lead: how far it presses ahead of that point, down (m); carry: the block (part_mag) goes where the hand takes it
  type HingeRef = V3 | { part: string; at: number[] };
  interface HingeHold { a: HingeRef; b: HingeRef; k: number; lead: number; carry: boolean; grip: HingeRef | null }
  interface Arm { g: THREE.Group; sleeve: THREE.Mesh; glove: THREE.Group; fist?: THREE.Group; hum?: HumArm } // (hum: your body's arm, once its file's in: humArm; till then the sleeve and glove stand in)
  interface ChvHeads { heads: THREE.Group[]; shot: boolean; cyl?: boolean }
  interface ChvPort { g: THREE.Group; round: THREE.Group; face: THREE.Mesh; shot: boolean; real: boolean; bolt: THREE.Mesh | null; win: number; f: number }
  // the arms and props of a viewmodel (its userData.vma)
  interface Vma { def: Def; k: { reload: VmReload; action: VmAction | null }; hs: Rig[]; R: Arm; L: Arm; props: Record<string, THREE.Group>; drop: { idx: number; at: number | undefined; from: V3; t0: number } | null; chv: ChvHeads | ChvPort | null; fw: number; pose?: Pose | null; reloadT?: number; gripQ?: THREE.Quaternion }
  type MagChk = GunRigMagChk;
  const S = (a: number, b: number, t: number) => G.U.smooth(a, b, t);
  const lerpV = (a: V3, b: V3, k: number) => a.clone().lerp(b, k);
  // shoulders (camera space: x right, y up, z back) and the pouch on your left hip, below the view
  const SHOULDER_R = new T.Vector3(0.3, -0.48, 0.28), SHOULDER_L = new T.Vector3(-0.3, -0.52, 0.2);
  const POUCH = new T.Vector3(-0.2, -0.62, -0.12);
  // where the left hand holds a magazine up to look at it (camera space), a little left of centre and low
  const FACE = new T.Vector3(-0.07, -0.15, -0.45);

  // ------------------------------------------------------------------ setup
  function makeArm(M: Mats): Arm {
    const g = new T.Group();
    const sleeve = new T.Mesh(new T.CylinderGeometry(0.03, 0.036, 1, 10), M.fabric());
    const glove = new T.Group();
    glove.add(new T.Mesh(new T.BoxGeometry(0.046, 0.05, 0.085), M.glove()));
    const fingers = new T.Mesh(new T.BoxGeometry(0.042, 0.03, 0.04), M.glove()); fingers.position.set(0, -0.012, -0.05); glove.add(fingers);
    g.add(sleeve, glove);
    return { g, sleeve, glove };
  }
  // The Wolverine grip (js/parts.ts hsl.0): the loading hand a loose fist, a round held in each of the three gaps between its four fingers, bases toward the
  // palm and noses out past the knuckles like claws. CLAW_X: across the glove, the gaps; CLAW_AT: a round's middle, up and along the glove (its -z the fingers' way).
  const CLAW_N = 3, CLAW_X = [-0.0105, 0, 0.0105], CLAW_Y = -0.008, CLAW_Z = -0.069;
  // the fist held up between the pouch and the gun, the knuckles to the eye and the rounds standing up out of them, leaning away a little (the viewmodel's frame: x right, y up, z back)
  const CLAW_UP = (() => { const Z = new T.Vector3(-0.12, -0.8, 0.45).normalize(), X = new T.Vector3(1, 0, 0), Y = new T.Vector3().crossVectors(Z, X).normalize(); X.crossVectors(Y, Z).normalize(); return new T.Quaternion().setFromRotationMatrix(new T.Matrix4().makeBasis(X, Y, Z)); })();
  function makeFist(M: Mats) { // four knuckles curled in, shown in place of the flat fingers while the hand holds the rounds
    const g = new T.Group();
    for (let i = 0; i < 4; i++) { const f = new T.Mesh(new T.BoxGeometry(0.0098, 0.028, 0.026), M.glove()); f.position.set(-0.01575 + i * 0.0105, -0.008, -0.044); g.add(f); }
    g.visible = false;
    return g;
  }
  function prop(kind: VmPropKind, M: Mats, def?: Def) { // things carried in the hand: a shell (or a round: its real size), a fired case, a speed loader, a stripper clip, a bolt
    // (a cartridge, or a shotshell, or the crossbow's bolt, from the baked props: assets/models/props, js/gunmodels.ts; centred on the hand's hold, the nose forward)
    let g = new T.Group();
    if ((kind === 'shell' || kind === 'case') && def) g = G.GunModels.roundProp(def as { id: string }, kind);
    else if (kind === 'loader') { const plat = G.Gunsmith.PLATFORMS[def!.id], n = (plat && plat.spec.chambers) || 6, r = new T.Mesh(new T.CylinderGeometry(0.02, 0.02, 0.012, 14), M.black()); r.rotation.x = Math.PI / 2; g.add(r); for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2; const c = new T.Mesh(new T.CylinderGeometry(0.0045, 0.0045, 0.035, 8), M.brass()); c.rotation.x = Math.PI / 2; c.position.set(Math.cos(a) * 0.012, Math.sin(a) * 0.012, -0.02); g.add(c); } }
    else if (kind === 'clip') { const c = new T.Mesh(new T.BoxGeometry(0.014, 0.03, 0.06), M.brass()); g.add(c); }
    else if (kind === 'bolt') g = G.GunModels.quarrel(true).group; // (the crossbow's own bolt: nock, shaft, vanes and head)
    else if (kind === 'claw' && def) for (let i = 0; i < CLAW_N; i++) g.add(G.GunModels.roundProp(def as { id: string }, 'shell')); // (the Wolverine grip: a round in each gap between the fingers, placed one by one in apply)
    g.visible = false;
    return g;
  }
  // what kind of reload and which handle a weapon has
  function kinds(def: Def): { reload: VmReload; action: VmAction | null } {
    const plat = G.Gunsmith.PLATFORMS[def.id], o: ModelSpec = plat ? plat.spec : {}, arch = plat ? plat.arch : 'rifle';
    let reload: VmReload = 'mag', action: VmAction | null = 'ar';
    if (def.akimbo) reload = 'akimbo';
    else if (arch === 'revolver') reload = 'revolver';
    else if (arch === 'derringer' || o.rcv === 'break' || def.id === 'pocketgl') reload = 'break';
    else if (arch === 'pepperbox') reload = 'block'; // (a falling block, loaded a round at a time: blockRound)
    else if (def.enbloc) reload = 'enbloc';
    else if (def.cls === 'BOW') reload = 'bow';
    else if (def.shell) reload = 'shell';
    else if (o.feed) reload = 'belt';
    if (arch === 'pistol') action = 'pistol';
    else if (o.bolt) action = 'bolt';
    else if (o.pump) action = 'pump';
    else if (o.lever) action = 'lever';
    else if (arch === 'p90') action = 'handle';
    else if (arch !== 'rifle') action = null;
    else if (o.cock || ((o.rcv || 'ar') !== 'ar' && !o.ch)) action = o.rcv === 'break' ? null : 'handle';
    return { reload, action };
  }
  function prepare(root: THREE.Object3D, def: Def) {
    const M = G.GunMaterials.M, u = root.userData;
    const k = kinds(def);
    const hs = u.holders.map(({ holder, info, side }: { holder: THREE.Object3D; info: Info; side: number }) => G.GunRig.bind(holder, info, { def, side })); // (the parts, anchors and magazine-check data off the model: js/gunrig.ts)
    // a manually cycled gun's action is the moving part its model has (part_bolt / part_pump / part_lever); nothing in the weapon data names it
    if (def.manual) { const an = hs[0].an; k.action = an.bolt ? 'bolt' : an.pump ? 'pump' : an.lever ? 'lever' : k.action; }
    if (hs[0].info.hinge) { k.reload = 'hinge'; if (!def.manual) k.action = null; } // (a model with a reload sequence (info.hinge): its moving parts are driven by that and by nothing else, see hingeClip)
    const R = makeArm(M), L = makeArm(M);
    root.add(R.g, L.g);
    const props: Record<string, THREE.Group> = { shell: prop('shell', M, def), case: prop('case', M, def), loader: prop('loader', M, def), clip: prop('clip', M), bolt: prop('bolt', M) };
    if (k.reload === 'block') { props.claw = prop('claw', M, def); L.fist = makeFist(M); L.glove.add(L.fist); } // (a falling block: a Wolverine grip may load it, def.perLoad)
    for (const p of Object.values(props)) hs[0].holder.add(p);
    u.vma = { def, k, hs, R, L, props, drop: null, chv: chamberView(hs[0], def, M), fw: 0 };
    dressArms(root, u.vma);
  }

  // What a chamber check shows: the ejection port open (a dark window on the right of the receiver, or on top of
  // a pistol's slide) with the round in it, if there is one, its case and tip set in just under the edge; on a
  // break-action, the shell heads sitting in the breech (seen whenever the barrels are open).
  // a case head seen from behind: brass; a shotshell's with a ring of its hull's colour round it (its load); a primer
  // in the middle of it, with the firing pin's dent in it once it's been fired
  function head(r: number, th: number, shot: boolean, M: Mats, satin?: boolean) { // (satin: a head turned square to you shows brass, not a mirror of the dark behind you)
    const g = new T.Group(), b = new T.Mesh(new T.CylinderGeometry(shot ? r * 0.8 : r, shot ? r * 0.8 : r, th, 16), satin ? SATIN : M.brass());
    b.rotation.x = Math.PI / 2; b.position.z = shot ? 0.0005 : 0; g.add(b);
    if (shot) { const ring = new T.Mesh(new T.CylinderGeometry(r, r, th, 16), shellMat('buck')); ring.rotation.x = Math.PI / 2; g.add(ring); g.userData.ring = ring; }
    const disc = (rad: number, mat: THREE.Material, z: number) => { const m = new T.Mesh(new T.CylinderGeometry(rad, rad, 0.0002, 12), mat); m.rotation.x = Math.PI / 2; m.position.z = z; g.add(m); return m; };
    const top = th / 2 + (shot ? 0.0005 : 0);
    disc(r * 0.36, PRIMER, top + 0.0001);
    g.userData.dent = disc(r * 0.17, DENT, top + 0.0002);
    // a lick of paint in from the rim, for a round you couldn't otherwise tell from behind (turned as the round is: js/vmanim.ts apply)
    if (!shot) {
      const lick = new T.Group(), m = new T.Mesh(new T.BoxGeometry(r * 0.62, r * 0.44, 0.00022), PRIMER);
      m.position.set(r * 0.7, 0, top + 0.00011);
      lick.add(m); lick.visible = false; g.add(lick); g.userData.lick = lick; g.userData.lickM = m;
    }
    return g;
  }
  function chamberView(h: Rig, def: Def, M: Mats): ChvHeads | ChvPort | null {
    const c = h.info.chamberAt;
    if (!c) return null;
    const grp = ((G.CALIBERS as Record<string, any>)[G.calOf(def)] || { group: 'rifle' }).group, shot = grp === 'shotgun';
    if (c.side === 'cyl') { // a revolver: a case head on the back of the cylinder for each chamber, one per round in it
      if (!h.an.cyl) return null;
      const heads: THREE.Group[] = [];
      for (let i = 0; i < c.n; i++) {
        const a = (i / c.n) * Math.PI * 2, d = head(c.r * 1.15, 0.0016, shot, M);
        d.position.set(Math.sin(a) * c.R, Math.cos(a) * c.R, c.z + 0.0006);
        h.an.cyl.add(d); heads.push(d);
      }
      return { heads, shot, cyl: true };
    }
    if (c.side === 'face') { // a falling block's: the chambers in the barrels' rear face, on the frame (the block drops away from them), a head standing proud of each loaded one
      const z = -c.f;
      if (c.bore) for (const [x, y] of c.heads) for (const [r, mat, dz] of [[c.r * 1.14, M.steel(), 0.0002], [c.r * 0.95, DARK, 0.0004]] as [number, THREE.Material, number][]) { const b = new T.Mesh(new T.CylinderGeometry(r, r, 0.0002, 20), mat); b.rotation.x = Math.PI / 2; b.position.set(x, y, z + dz); h.holder.add(b); }
      const heads = c.heads.map(([x, y]) => { const d = head(c.r * 1.05, 0.003, shot, M, c.bore); d.position.set(x, y, z + 0.0015); h.holder.add(d); return d; });
      return { heads, shot };
    }
    if (c.side === 'breech') {
      if (!h.an.brk) return null;
      // (the chamber's mouth, a ring of bright steel round the hole, seen when there's nothing in it)
      if (c.bore) for (const [x, y] of c.heads) for (const [r, mat, dz] of [[c.r * 1.14, M.steel(), 0.0002], [c.r * 0.95, DARK, 0.0004]] as [number, THREE.Material, number][]) { const b = new T.Mesh(new T.CylinderGeometry(r, r, 0.0002, 20), mat); b.rotation.x = Math.PI / 2; b.position.set(x, y, c.z + dz); h.an.brk.add(b); }
      const heads = c.heads.map(([x, y]) => {
        const d = head(c.r * 1.05, 0.003, shot, M, c.bore);
        d.position.set(x, y, c.z);
        h.an.brk!.add(d);
        return d;
      });
      return { heads, shot };
    }
    const r = shot ? 0.0092 : grp === 'pistol' ? 0.0045 : 0.0048, len = shot ? 0.05 : grp === 'pistol' ? 0.026 : 0.042;
    // (a pistol's slide has a real port cut in it: the round just sits in the barrel under it, always there to see.
    // A rifle's receiver is solid, so the open port's drawn: a dark window on its right side.)
    // (layered out from the receiver: the dark open port, the round, the bolt face over them; a pistol's round sits
    // under the barrel hood, its case head just behind it: seen in the gap a press check opens behind the hood)
    const g = new T.Group(), real = c.side === 'port', top = c.side === 'top', win = len + 0.014, ww = top ? Math.min(c.w, 2 * r + 0.006) : 2 * r + 0.006;
    const plate = real ? null : top ? new T.Mesh(new T.BoxGeometry(ww, 0.0012, win), DARK) : new T.Mesh(new T.BoxGeometry(0.0012, ww, win), DARK);
    if (plate && top) plate.position.set(c.x, c.y + 0.0005, -c.f); else if (plate) plate.position.set(c.x + 0.0005, c.y, -c.f);
    const bolt = real ? null : top ? new T.Mesh(new T.BoxGeometry(ww, 0.0008, win), M.steel()) : new T.Mesh(new T.BoxGeometry(0.0008, ww, win), M.steel());
    if (bolt && top) bolt.position.set(c.x, c.y + 0.0024, -c.f); else if (bolt) bolt.position.set(c.x + 0.0024, c.y, -c.f);
    const round = new T.Group();
    const piece = (rf: number, rr: number, l: number, m: THREE.Material, z: number) => // (front radius, rear radius)
       { const geo = new T.CylinderGeometry(rf, rr, l, 14); geo.rotateX(-Math.PI / 2); /* (its top end to the front) */ const me = new T.Mesh(geo, m); me.position.z = z; round.add(me); return me; };
    let face: THREE.Mesh; // (what shows the load: a shell's hull, a bullet's tip)
    if (shot) { face = piece(r, r, len * 0.75, shellMat('buck'), -len * 0.125); piece(r * 1.04, r * 1.04, len * 0.25, M.brass(), len * 0.375); }
    else { piece(r, r, len * 0.72, M.brass(), len * 0.14); face = piece(0.0012, r * 0.95, len * 0.28, tipMat('ball'), -len * 0.36); }
    if (real) round.position.set(c.x, c.y - r, -(c.f + len / 2)); else if (top) round.position.set(c.x, c.y - r + 0.0018, -c.f); else round.position.set(c.x - r + 0.0018, c.y, -c.f);
    g.add(round); if (plate) g.add(plate); if (bolt) g.add(bolt);
    g.visible = false;
    h.holder.add(g);
    return { g, round, face, shot, real, bolt, win, f: c.f };
  }

  // ------------------------------------------------------------------ clips
  // Each clip is a function of normalised time returning a pose:
  //   gun: [x, y, z, rx, ry, rz] added to the viewmodel; L / R: hand targets in gun space (null = resting);
  //   mag: { mode: 'in' | 'hand' | 'drop' | 'gone', at }; ch / handle / slide: rack amount 0..1;
  //   cyl: revolver cylinder swung out 0..1; brk: barrels opened 0..1; cover: belt cover opened 0..1;
  //   prop: { kind, at } something carried in the left hand.
  const path = (t: number, keys: [number, V3][]) => { // keys: [[t, Vector3], ...] eased between neighbours
    let i = 0;
    while (i < keys.length - 2 && t > keys[i + 1][0]) i++;
    const [t0, a] = keys[i], [t1, b] = keys[i + 1];
    return lerpV(a, b, S(t0, t1, t));
  };
  const off = (p: V3, f = 0, y = 0, x = 0) => p.clone().add(new T.Vector3(x, y, -f));
  // d metres down the magazine's axis from p (up it, d < 0): straight down, or along a raked well (js/gunrig.ts magDn), so the
  // magazine comes out of it and goes back in the way its body points
  const alongMag = (A: Rig['A'], p: V3, d: number) => (A.magDn ? p.clone().addScaledVector(A.magDn, d) : off(p, 0, -d));

  // a bolt-action's bolt: turned up (radians) and drawn back (m) at full lift and pull; how far a pistol's slide,
  // an AR's charging handle, a pump come back
  const BOLT_LIFT = 1.3, BOLT_BACK = 0.12, SLIDE = 0.04, CH = 0.065, PUMP = 0.085;
  // where the bolt handle's knob is with the bolt turned up by lift (0..1) and drawn back by back (0..1)
  // (how far this gun's bolt comes back: info.boltTravel, the Welrod's short stroke; else BOLT_BACK)
  const boltBack = (h: Rig) => h.info.boltTravel || BOLT_BACK;
  const knobAt = (A: Anchors, lift: number, back: number, travel = BOLT_BACK) => new T.Vector3(A.bolt!.x * Math.cos(lift * BOLT_LIFT), A.bolt!.y + A.bolt!.x * Math.sin(lift * BOLT_LIFT), A.bolt!.z + back * travel);
  // how far the bolt face comes back off the chamber at full pull (m)
  const actTravel = (h: Rig, kind: VmHold) => kind === 'pistol' ? SLIDE : kind === 'ar' ? CH : kind === 'handle' ? h.travel : kind === 'bolt' ? boltBack(h) : kind === 'pump' ? PUMP : kind === 'lever' ? 0.05 : 0;
  // which action a gun's hands work: 'pistol' (the slide), 'ar' (the charging handle), 'handle' (a cocking handle),
  // 'bolt', 'pump', 'lever'
  const actKind = (a: Vma, h: Rig) => { const ac = a.k.action; return ac === 'pistol' || ac === 'bolt' || ac === 'pump' || ac === 'lever' ? ac : h.A.ch ? 'ar' : 'handle'; };

  // The action, worked by hand: one pose for every use of it (a rack, a release, a chamber check). pull: 0..1 of
  // its travel (a bolt-action's: the first half turns it up, the second draws it back); on: how far the hand is on
  // its control (0: where it rests, rest; 1: on it, riding it). Poses the part and the hand, and pose.open: how far
  // the bolt face has come back off the chamber (m), uncovering the round in the port (chamberView). grab: another
  // hold on it (a press-check's pinch).
  function actionPose(kind: VmHold, h: Rig, pose: Pose, pull: number, on: number, rest: V3 | null, grab?: V3 | null) {
    const A = h.A, R0 = rest || A.S;
    pose.open = (kind === 'bolt' ? G.U.clamp(pull * 2 - 1, 0, 1) : pull) * actTravel(h, kind);
    if (kind === 'bolt') pose.Rk = on; else if (kind === 'pistol' || kind === 'ar' || kind === 'handle') pose.Lk = on; // (the hand on its control: humHold)
    if (kind === 'pistol' && A.slide) { pose.slide = pull; pose.L = lerpV(R0, off(grab || off(A.slide, -0.02, 0.012), -SLIDE * pull), on); }
    else if (kind === 'ar' && A.ch) { pose.ch = pull; pose.L = lerpV(R0, off(grab || off(A.ch, 0, 0.012), -CH * pull), on); }
    else if (kind === 'handle' && A.H) { pose.handle = pull; pose.L = lerpV(R0, off(grab || A.H, -h.travel * pull), on); }
    else if (kind === 'bolt' && A.bolt) { const lift = G.U.clamp(pull * 2, 0, 1), back = G.U.clamp(pull * 2 - 1, 0, 1); pose.bolt = [lift, back]; pose.R = lerpV(A.G, knobAt(A, lift, back, boltBack(h)), on); }
    else if (kind === 'pump') { pose.pump = pull; pose.L = off(A.S, -PUMP * pull); } // (the left hand rides it)
    else if (kind === 'lever') pose.lever = pull;
  }
  // when, through a rack (or a release), the action's fully back (the case it held thrown) and home again (a round
  // fed): js/player.ts times the rounds to it
  function actEvents(kind: string, action: VmAction | null, manual = false) {
    if (kind === 'release') return { back: 0, home: 0.38 };
    if (manual) return { back: 0.55, home: 0.88 }; // (one cycle for every manual action: bolt, pump, lever)
    return { back: 0.52, home: 0.6 };
  }
  // Racking: the action pulled through and let go (a riding open bolt's left back: cocked). c: 0..1 over it; from:
  // where the left hand starts, if not on the handguard (the magazine it's just seated)
  function rack(c: number, h: Rig, kind: VmAction, pose: Pose, from: V3 | null) {
    const A = h.A, stay = kind === 'handle' && h.open && h.recip;
    let pull: number, on: number;
    if (kind === 'bolt') { pull = S(0.25, 0.6, c) * (1 - S(0.6, 0.85, c)); on = S(0.08, 0.25, c) * (1 - S(0.85, 1, c)); } // (the right hand: up, back, the case flies, forward, down)
    else if (kind === 'pump' || kind === 'lever') { pull = S(0.1, 0.45, c) * (1 - S(0.5, 0.9, c)); on = 1; }
    else { pull = S(0.3, 0.52, c) * (stay ? 1 : 1 - S(0.52, 0.6, c)); on = S(0.05, 0.3, c) * (1 - S(stay ? 0.55 : 0.62, 0.95, c)); }
    actionPose(kind, h, pose, pull, on, c < 0.5 ? from : null);
    if (from && kind === 'bolt') pose.L = path(c, [[0, from], [0.3, A.S], [1, A.S]]); // (the left hand back to the handguard)
    // the gun turned to get at it
    const r = S(0.05, 0.3, c) * (1 - S(0.7, 1, c));
    if (kind === 'pistol') { pose.gun[5] -= 0.35 * r; pose.gun[0] -= 0.05 * r; pose.gun[1] += 0.03 * r; pose.gun[3] += 0.15 * r; }
    else if (kind === 'ar') { pose.gun[3] += 0.35 * r; pose.gun[2] -= 0.1 * r; pose.gun[0] -= 0.04 * r; pose.gun[1] += 0.02 * r; }
    else if (kind === 'handle' && A.H) {
      const side = Math.abs(A.H.x) > 0.005 ? Math.sign(A.H.x) : 0; // (turn the handle side toward you; one on top: tip it up)
      pose.gun[5] += (side > 0 ? 0.45 : side < 0 ? -0.3 : 0) * r; pose.gun[3] += (side ? 0.2 : 0.3) * r; pose.gun[0] -= 0.05 * r; pose.gun[1] += 0.03 * r;
    } else if (kind === 'bolt') { pose.gun[5] += 0.2 * r; pose.gun[3] += 0.05 * r; } // (canted a little, the bolt toward you)
  }
  // Sending the action home from where it locked open: the left thumb on the slide stop (a pistol) or the palm
  // on the bolt catch over the magazine well (a rifle); the slide (or bolt) slams forward and the gun jumps.
  const CATCH_LOCK = 0.14, CATCH_HAND = [-0.012, 0.012, -0.03]; // (the bolt catch's turn about its pin with the bolt held open, radians; where the hand rests on it, from the pin: forward, up, right)
  function release(c: number, h: Rig, kind: VmAction, pose: Pose, from: V3 | null) {
    const A = h.A;
    // (a rifle with a bolt catch of its own, part_catch: the hand takes the catch's upper paddle, where the model has it; any other, over the well)
    const at = kind === 'pistol' ? off(A.G, 0.035, 0.045, -0.02) : A.catchHome ? off(A.catchHome, CATCH_HAND[0], CATCH_HAND[1], CATCH_HAND[2]) : off(A.W || A.WB || A.S, 0.01, 0.045, -0.03);
    pose.L = path(c, [[0, from || A.S], [0.28, at], [0.4, off(at, 0, -0.008)], [0.68, A.S], [1, A.S]]);
    const k = 1 - S(0.34, 0.4, c);
    pose.catch = 1 - S(0.31, 0.37, c); // (the paddle pressed in just ahead of the bolt: it drops, the carrier runs home)
    if (kind === 'pistol') pose.slide = k;
    pose.open = k * actTravel(h, kind);
    const j = c > 0.36 && c < 0.56 ? Math.sin(Math.PI * (c - 0.36) / 0.2) : 0;
    pose.gun[2] += 0.012 * j; pose.gun[3] += 0.03 * j;
    const r = S(0, 0.3, c) * (1 - S(0.7, 1, c)); pose.gun[5] -= 0.25 * r; pose.gun[3] += 0.12 * r; // (turned a little to get at it)
  }

  // The HK slap reload (a gun whose cocking handle locks the bolt open by turning up into a notch, info.handle.lock: the MP5 and MP5SD), the same for everyone who
  // is shown it (js/rig.ts too). t: 0..1 through the whole reload. The left hand takes the handle and draws it back the length of its slot (back 0..1), turns it up
  // into the notch (lock 0..1: the bolt is held open); the magazine change runs from SLAP.mag0 to SLAP.mag1 (js/player.ts times its sounds to them); then the heel
  // of the hand slaps the handle down out of the notch (lock back to 0) and the bolt runs home (back to 0), chambering a round.
  const SLAP = { grab: 0.053, pull: 0.143, lock: 0.196, mag0: 0.208, mag1: 0.774, slap: 0.836, home: 0.87, rest: 0.966 }; // (an MP5 keeping its magazine, 2.65 s: the draw back 0.24 s, the turn into the notch 0.14 s, the change 1.5 s)
  const slapState = (t: number) => ({
    back: S(SLAP.grab, SLAP.pull, t) * (1 - S(SLAP.slap - 0.005, SLAP.home, t)),
    lock: S(SLAP.pull, SLAP.lock, t) * (1 - S(SLAP.slap - 0.02, SLAP.slap + 0.005, t)),
    hand: S(0, SLAP.grab, t) * (1 - S(SLAP.lock, SLAP.mag0 + 0.06, t)) + S(SLAP.mag1 - 0.055, SLAP.mag1 + 0.02, t) * (1 - S(SLAP.home, SLAP.rest, t)), // (how much of the hand is on the handle: straight there from the seated magazine, slapM)
  });
  const isSlap = (def: Def) => { const i = G.Models.infoOf(def); return !!(i && i.handle && i.handle.lock > 0 && !def.akimbo && kinds(def).reload === 'mag'); };
  // the grab point on the handle when it is back (0..1 of its slot) and turned up (0..1 of its lock): the point turned about the tube's axis (its x is 0, its height info.handle.y)
  function slapGrab(h: Rig, back: number, lock: number) {
    const A = h.A, c = h.info.handle!.y, dx = A.H!.x, dy = A.H!.y - c, a = -h.lock * lock;
    return new T.Vector3(dx * Math.cos(a) - dy * Math.sin(a), dy * Math.cos(a) + dx * Math.sin(a) + c, A.H!.z + h.travel * back);
  }
  // the magazine change runs to the moment the new one's pushed home (SEAT: its own clip's fraction there, by how the old one's
  // stowed), just before the hand leaves for the handle; what's left of it (the gun levelled, the hand back to the handguard)
  // plays after the slap, so the hand goes straight from the magazine to the handle with no rest on the handguard between
  const slapSeat = (how: string) => (how === 'retain' || how === 'pouch' ? 0.8 : 0.72); // (just after the magazine's seated: its clip's little lift for it, magClip's "seat it", done, so the gun doesn't drop when the clip goes on after the slap)
  const slapM = (t: number, how: string) => {
    const seat = slapSeat(how), end = SLAP.mag1 - 0.05;
    return t < end ? seat * G.U.clamp((t - SLAP.mag0) / (end - SLAP.mag0), 0, 1) : seat + (1 - seat) * S(SLAP.slap, SLAP.rest, t);
  };
  function slapClip(t: number, h: Rig, how: string) {
    const A = h.A, st = slapState(t), m = slapM(t, how);
    const pose = magClip(m, h, false, how); // (the magazine change alone, between the lock and the slap; its tilt and its hand)
    pose.handle = st.back; pose.lock = st.lock; pose.open = h.travel * st.back; // (the bolt: off the chamber while the handle is back)
    // the left hand: on the handle, wherever it is, while it works it; on the magazine in between
    const onH = slapGrab(h, st.back, st.lock);
    pose.L = lerpV(pose.L || A.S, onH, st.hand); pose.Lk = st.hand;
    // the gun turned to show its left side to the hand on the handle, as for any left-hand handle
    const r = S(0.02, 0.09, t) * (1 - S(0.0, 0.14, m)) * (t < SLAP.mag1 - 0.05 ? 1 : 0) + S(SLAP.mag1 - 0.04, SLAP.mag1, t) * (1 - S(SLAP.home, SLAP.rest, t)); // (the turn to the handle hands over to the magazine's own tilt as it comes in, magTilt, not before it: no sag between)
    pose.gun[5] -= 0.3 * r; pose.gun[3] += 0.2 * r; pose.gun[0] -= 0.04 * r; pose.gun[1] += 0.02 * r;
    if (m > 0.5) tiltPose(pose, (1 - magTilt(m)) * (1 - S(SLAP.slap, SLAP.rest, t))); // (the magazine's tilt held whole from the seat to the slap, as its clip starts to level the gun there: no dip before the slap; both settle after it)
    const j = t > SLAP.slap - 0.01 && t < SLAP.slap + 0.06 ? Math.sin(Math.PI * (t - SLAP.slap + 0.01) / 0.07) : 0; // (the slap lands: the gun jumps)
    pose.gun[2] += 0.014 * j; pose.gun[3] += 0.035 * j;
    return pose;
  }

  // the magazine change's turn of the gun at m through its motions: the well lifted into view, pulled toward the
  // middle, muzzle up, canted right
  const magTilt = (m: number) => S(0.02, 0.14, m) * (1 - S(0.72, 0.9, m));
  function tiltPose(pose: Pose, k: number) { pose.gun[3] += 0.42 * k; pose.gun[5] -= 0.5 * k; pose.gun[1] += 0.05 * k; pose.gun[0] -= 0.07 * k; pose.gun[2] += 0.02 * k; }
  // Box/stick magazine (rifles, SMGs, pistols, P90, minigun box, railgun bank). how: 'retain' (the old magazine goes
  // back in its pouch first), 'pouch' (into the dump pouch, lower down), or 'floor' / anything else (let go of it).
  // seat: run dry, how far through its motions it goes (js/player.ts reloadSeat): it stops as the magazine seats, and
  // the action (its own clip, after) takes the hand from there
  function magClip(t: number, h: Rig, freeDrop: boolean, how: string, seat?: number) {
    const A = h.A, pose = base();
    const m = t * (seat || 1);
    const WB = A.WB || A.S, below = alongMag(A, WB, 0.07), pushed = alongMag(A, WB, -0.012);
    tiltPose(pose, magTilt(m));
    if (m < 1) {
      if (how === 'retain' || how === 'pouch') {
        // old one out, carried down and stowed (the hand pauses in the pouch), a fresh one out, in
        const P = how === 'pouch' ? off(A.P, -0.02, -0.07) : A.P, Pin = off(P, 0, -0.035);
        pose.L = path(m, [[0, A.S], [0.1, WB], [0.18, below], [0.32, P], [0.38, Pin], [0.44, Pin], [0.48, A.P], [0.53, off(A.P, 0, -0.03)], [0.58, A.P], [0.68, below], [0.74, WB], [0.78, pushed], [0.9, A.S], [1, A.S]]);
        pose.mag = m < 0.1 ? { mode: 'in' } : m < 0.38 ? { mode: 'hand' } : m < 0.53 ? { mode: 'gone' } : m < 0.74 ? { mode: 'hand' } : { mode: 'in' };
        if (m > 0.74 && m < 0.8) pose.gun[1] += 0.008 * Math.sin(Math.PI * (m - 0.74) / 0.06); // seat it
      } else if (freeDrop) { // pistols: the magazine falls out when you hit the release
        pose.L = path(m, [[0, A.S], [0.12, off(A.S, -0.02, -0.04)], [0.36, A.P], [0.44, A.P], [0.58, below], [0.66, WB], [0.7, pushed], [0.86, A.S], [1, A.S]]);
        pose.mag = m < 0.06 ? { mode: 'in' } : m < 0.42 ? { mode: 'drop', at: 0.06 } : m < 0.66 ? { mode: 'hand' } : { mode: 'in' };
      } else {
        pose.L = path(m, [[0, A.S], [0.14, WB], [0.22, below], [0.36, A.P], [0.44, A.P], [0.58, below], [0.66, WB], [0.7, pushed], [0.86, A.S], [1, A.S]]);
        pose.mag = m < 0.14 ? { mode: 'in' } : m < 0.24 ? { mode: 'hand' } : m < 0.42 ? { mode: 'drop', at: 0.24 } : m < 0.66 ? { mode: 'hand' } : { mode: 'in' };
      }
      if (how !== 'retain' && how !== 'pouch' && m > 0.66 && m < 0.72) pose.gun[1] += 0.008 * Math.sin(Math.PI * (m - 0.66) / 0.06); // seat it
    }
    return pose;
  }
  // A reload that takes the gun apart, from the model's own sequence (info.hinge: GUN_MODEL_CONTRACT.multi): the steps play in order as the block comes out, a moment with it clear of
  // the gun (away to the pouch, a fresh one back), then back in the other way round. How each step feels is its own data: its share of the time, the shape of its motion out and back
  // (HINGE_EASE), and where the support hand holds the gun while it moves (hand: a point of a part_ node, followed as it moves: apply). The right hand stays on the grip, the gun turned up a
  // little to see into it, and it answers each step's ease (hingeReact: a spring's kick, the dip of a firm pull, the sag of a weight). Nothing in it is a gun: the parts, their pivots,
  // their moves and their feel are the model's.
  type HingeStep = { part: string; axis?: string | null; rotate_deg?: number | null; move?: number[] | null; frame?: string | null; share?: number | null; ease?: string | null; over?: number | null; back?: { share?: number | null; ease?: string | null } | null; hand?: { part: string; at: number[] } | null };
  // v 0..1 through a step's time -> 0..1 of its travel (a spring's goes past 1 and comes back). o: a spring's overshoot. js/glb.ts HINGE_EASES lists them for the contract.
  const HINGE_EASE: Record<string, (v: number, o: number) => number> = {
    smooth: (v) => v * v * (3 - 2 * v),
    linear: (v) => v,
    in: (v) => v * v,
    out: (v) => 1 - (1 - v) * (1 - v),
    // released: out fast (its first 30%, slowing as a spring spends itself) to past the end by o with no speed left, back through the end a little short (a quarter of o), settled: still at the end
    spring: (v, o) => { const a = 0.3; if (v < a) { const w = 1 - v / a; return (1 + o) * (1 - w * w * w); } const w = (v - a) / (1 - a); return 1 + o * Math.cos(1.5 * Math.PI * w) * (1 - w) * (1 - w) * (1 + 2 * w); },
    // a firm pull: it creeps (8% of the way in its first 30%), holds at the detent (to 10% by 52%), then gives, speeding up all the way onto its stop (it lands with speed: hingeReact's thud)
    detent: (v) => { if (v < 0.3) return 0.08 * S(0, 0.3, v); if (v < 0.52) return 0.08 + 0.02 * S(0.3, 0.52, v); const w = (v - 0.52) / 0.48; return 0.1 + 0.9 * w * w * (2 - w); },
    // a weight lifted: slow to get going, eased into place
    heavy: (v) => S(0, 1, Math.pow(v, 1.4)),
    // drawn in: speeding up all the way (cubic) to 85% of the travel at 72% of the time, then a damped stop (exponential, the speed matched where it takes over): no bounce, all but still at the end
    magnet: (v) => { const a = 0.72, x = 0.85; if (v < a) return x * Math.pow(v / a, 3); const k = 3 * x * (1 - a) / (a * (1 - x)), w = (v - a) / (1 - a); return x + (1 - x) * (1 - Math.exp(-k * w)) / (1 - Math.exp(-k)); },
  };
  const hingeEase = (name: string | null | undefined, v: number, o: number) => (HINGE_EASE[name || 'smooth'] || HINGE_EASE.smooth)(G.U.clamp(v, 0, 1), o);
  // the parts of the reload beside the steps, in shares of its time as the steps' (share 1 each by default): the hand to the gun, from one hold to another, the block away and a fresh one
  // fetched, the hand back to the handguard
  const H_LEAD = 0.35, H_GAP = 0.3, H_AWAY = 1.1, H_TAIL = 0.4;
  // The reload's timeline from the sequence: segments in order over t 0..1 (lead, then each step out with a gap before it where the hand changes hold, away, each step back, the tail),
  // each with the hand's hold at its start and end (a step's own hand, or the one before's; the first: the handguard). Cached per sequence.
  interface HingeSeg { kind: 'lead' | 'gap' | 'step' | 'away' | 'tail'; i: number; back: boolean; t0: number; t1: number; from: HingeRef | null; to: HingeRef | null }
  const _htl = new WeakMap<object, HingeSeg[]>();
  function hingeTimeline(seq: HingeStep[]) {
    const c = _htl.get(seq);
    if (c) return c;
    const n = seq.length, hand: (HingeRef | null)[] = [];
    for (let i = 0; i < n; i++) hand.push(seq[i].hand ? { part: seq[i].hand!.part, at: seq[i].hand!.at } : i ? hand[i - 1] : null); // (null: the handguard)
    const same = (a: HingeRef | null, b: HingeRef | null) => a === b || (!!a && !!b && !(a instanceof T.Vector3) && !(b instanceof T.Vector3) && a.part === b.part && a.at.every((x, k) => x === b.at[k]));
    const segs: HingeSeg[] = [];
    let u = 0;
    const add = (kind: HingeSeg['kind'], i: number, back: boolean, w: number, from: HingeRef | null, to: HingeRef | null) => { segs.push({ kind, i, back, t0: u, t1: u + w, from, to }); u += w; };
    add('lead', -1, false, H_LEAD, null, hand[0]);
    for (let i = 0; i < n; i++) { if (i && !same(hand[i - 1], hand[i])) add('gap', i, false, H_GAP, hand[i - 1], hand[i]); add('step', i, false, seq[i].share || 1, hand[i], hand[i]); }
    add('away', -1, false, H_AWAY, hand[n - 1], hand[n - 1]);
    for (let i = n - 1; i >= 0; i--) { if (i < n - 1 && !same(hand[i + 1], hand[i])) add('gap', i, true, H_GAP, hand[i + 1], hand[i]); const b = seq[i].back; add('step', i, true, (b && b.share) || seq[i].share || 1, hand[i], hand[i]); }
    add('tail', -1, true, H_TAIL, hand[0], null);
    for (const s of segs) { s.t0 /= u; s.t1 /= u; }
    _htl.set(seq, segs);
    return segs;
  }
  // each step's travel at t (0..1 of its move; a spring's past 1 for a moment): out in order, all out through the away, back in reverse order
  function hingeSteps(seq: HingeStep[], segs: HingeSeg[], t: number) {
    const p = seq.map(() => 0);
    for (const s of segs) {
      if (s.kind !== 'step' || t < s.t0) continue;
      const st = seq[s.i], v = (t - s.t0) / (s.t1 - s.t0);
      if (!s.back) p[s.i] = v >= 1 ? 1 : hingeEase(st.ease, v, st.over != null ? st.over : 0.06);
      else p[s.i] = v >= 1 ? 0 : 1 - hingeEase(st.back && st.back.ease, v, 0.06);
    }
    return p;
  }
  // the gun's answer to a step's motion (v: 0..1 through it; after: how long since it ended, in its own lengths); lead: how far the hand presses ahead of its hold, down (m)
  function hingeReact(pose: Pose, ease: string | null | undefined, v: number, after: number) {
    let lead = 0;
    if (ease === 'spring' && after <= 0) { // (the block shot forward: the gun kicks back and its muzzle up, at once, and dies away)
      const j = v < 0.08 ? v / 0.08 : Math.exp(-(v - 0.08) * 6);
      pose.gun[2] += 0.012 * j; pose.gun[3] += 0.045 * j;
    } else if (ease === 'detent') { // (pulled down hard against the detent: the gun dips with the effort and comes back as it gives; then the thud of the stop)
      if (after <= 0) { const e = S(0, 0.3, v) * (1 - S(0.52, 0.78, v)); pose.gun[3] -= 0.07 * e; pose.gun[1] -= 0.012 * e; lead = 0.012 * e; }
      else if (after < 0.3) { const d = Math.sin(Math.PI * after / 0.3); pose.gun[1] -= 0.006 * d; pose.gun[3] -= 0.025 * d; }
    } else if (ease === 'heavy' && after <= 0) { // (a weight heaved up: the gun sags under it and recovers as it comes home; the hand pushes up ahead of it)
      const l = Math.sin(Math.PI * v);
      pose.gun[1] -= 0.016 * l; pose.gun[3] -= 0.06 * l; lead = -0.006 * l;
    } else if (ease === 'magnet' && after <= 0) { // (the mass drawn back into the gun pulls it a little forward as it speeds up, let go of softly as it stops)
      const r = v < 0.72 ? (v / 0.72) * (v / 0.72) : 1 - S(0.72, 1, v);
      pose.gun[2] -= 0.004 * r;
    }
    return lead;
  }
  const pl0 = () => G.Me;
  const hingeNode = (h: Rig, k: string) => (h.an as Record<string, THREE.Object3D | undefined>)[k.replace(/^part_/, '')];
  // whether a hold is on the block (the magazine part, or inside it): with no block in the gun, the hand goes to the pouch for one instead
  const onBlock = (h: Rig, r: HingeRef | null) => { if (!r || r instanceof T.Vector3 || !h.an.mag) return false; for (let o: THREE.Object3D | null | undefined = hingeNode(h, r.part); o; o = o.parent) if (o === h.an.mag) return true; return false; };
  function hingeClip(t: number, h: Rig) {
    const A = h.A, pose = base(), seq = (h.info.hinge!.sequence || []) as HingeStep[];
    if (!seq.length) return pose;
    const segs = hingeTimeline(seq), had = !pl0().cur().noMag; // (had: there is a block in the gun to take out)
    pose.hsteps = hingeSteps(seq, segs, t);
    const lead = segs[0].t1, tail = segs[segs.length - 1].t0;
    const tilt = S(0, lead + 0.03, t) * (1 - S(tail - 0.02, 1, t));
    pose.gun[3] += 0.3 * tilt; pose.gun[5] -= 0.22 * tilt; pose.gun[1] += 0.035 * tilt; pose.gun[0] -= 0.05 * tilt;
    // the gun's answer to each step (and to one just ended)
    let press = 0;
    for (const s of segs) if (s.kind === 'step' && t >= s.t0) {
      const st = seq[s.i], d = s.t1 - s.t0, v = (t - s.t0) / d, after = v > 1 ? v - 1 : 0;
      if (after < 0.5) press += hingeReact(pose, s.back ? st.back && st.back.ease : st.ease, Math.min(v, 1), after);
    }
    // the hand: the segment it's in, from its start hold to its end one (with no block in the gun, the holds on it are the pouch)
    const P = off(A.P, 0, 0.02), sg = segs.find((s) => t < s.t1) || segs[segs.length - 1], k = S(sg.t0, sg.t1, t);
    const at = (r: HingeRef | null): HingeRef => (!r ? A.S : !had && onBlock(h, r) ? P : r);
    const grip = onBlock(h, segs.find((s) => s.kind === 'away')!.from) ? segs.find((s) => s.kind === 'away')!.from : null; // (where the block is carried by, out to the pouch and back)
    if (sg.kind === 'away') { // (out to the pouch with the old block, a moment there, back with the new: it goes where the hand takes it)
      const w = (t - sg.t0) / (sg.t1 - sg.t0);
      const a = had ? at(sg.from) : P, b = at(sg.to);
      pose.Lon = w < 0.4 ? { a, b: P, k: S(0, 0.4, w), lead: 0, carry: !!grip && had, grip } : w < 0.6 ? { a: P, b: P, k: 0, lead: 0, carry: false, grip: null } : { a: P, b, k: S(0.6, 1, w), lead: 0, carry: !!grip, grip };
      pose.mag = { mode: (had ? w > 0.33 : true) && w < 0.67 ? 'gone' : 'in' };
    } else {
      pose.Lon = { a: at(sg.from), b: at(sg.to), k, lead: press, carry: false, grip: null };
      pose.mag = { mode: !had && segs.indexOf(sg) < segs.findIndex((s) => s.kind === 'away') ? 'gone' : 'in' }; // (no block to take out: none in the gun until the hand brings one)
    }
    pose.hinge = t;
    return pose;
  }
  // where a hold is, in the gun's space, as the parts stand now (the sequence has posed them: apply)
  function hingeAt(h: Rig, r: HingeRef) {
    if (r instanceof T.Vector3) return r.clone();
    const nd = hingeNode(h, r.part);
    if (!nd) return h.A.S.clone();
    return h.holder.worldToLocal(nd.localToWorld(new T.Vector3(r.at[2] || 0, r.at[1], -r.at[0])));
  }
  // the support hand's target from its hold (after hingePose), and the block carried with it
  function hingeHold(h: Rig, on: HingeHold) {
    h.holder.updateMatrixWorld(true);
    const L = hingeAt(h, on.a).lerp(hingeAt(h, on.b), on.k);
    L.y -= on.lead;
    const blk = h.an.mag;
    if (on.carry && on.grip && blk && blk.parent) { // (the block moved by where the hand has its handle from where the sequence left it)
      const g = hingeAt(h, on.grip), par = blk.parent;
      const d = par.worldToLocal(h.holder.localToWorld(L.clone())).sub(par.worldToLocal(h.holder.localToWorld(g)));
      blk.position.add(d); blk.updateMatrix(); blk.updateMatrixWorld(true);
    }
    return L;
  }
  // The model's sequence posed: each step moves or turns its node from where it rests by its travel (steps: 0..1 each, hingeClip; null: all home). A rotation turns the node about its own
  // pivot (rotate_deg about axis x, y or z); a move slides it [forward, up, right] metres in the frame of the node named by frame (default: its parent's), which has to be worked out as the
  // frame stands as the earlier steps left it.
  const _hv = new T.Vector3(), _hq = new T.Quaternion(), _hq2 = new T.Quaternion();
  function hingePose(h: Rig, steps: number[] | null) {
    const seq = h.info.hinge && (h.info.hinge.sequence as HingeStep[]);
    if (!seq) return;
    const done = new Set<THREE.Object3D>();
    for (const st of seq) { const n = hingeNode(h, st.part); if (n && !done.has(n)) { done.add(n); if (!n.userData.home) n.userData.home = { p: n.position.clone(), r: n.rotation.clone() }; n.position.copy(n.userData.home.p); n.rotation.copy(n.userData.home.r); } }
    seq.forEach((st, i) => {
      const nd = hingeNode(h, st.part);
      if (!nd) return;
      const s = steps ? steps[i] || 0 : 0;
      if (st.rotate_deg != null && st.axis) (nd.rotation as any)[st.axis] += (st.rotate_deg * Math.PI / 180) * s;
      if (st.move) {
        _hv.set(st.move[2] || 0, st.move[1], -st.move[0]).multiplyScalar(s); // (the move in its frame's own axes: x right, y up, z back)
        const fr = st.frame ? hingeNode(h, st.frame) : null;
        if (fr && nd.parent) { // (another node's frame: its turn, then back into the parent's)
          h.holder.updateMatrixWorld(true);
          fr.getWorldQuaternion(_hq); nd.parent.getWorldQuaternion(_hq2).invert();
          _hv.applyQuaternion(_hq).applyQuaternion(_hq2);
        }
        nd.position.add(_hv);
      }
      nd.updateMatrix();
      if (st.rotate_deg != null) nd.updateMatrixWorld(true); // (what's inside it turns with it, for the steps after)
    });
  }
  // Belt-fed: cover up, box out, new box in, lay the belt, cover down (run dry, the charging handle after: its
  // own clip)
  function beltClip(t: number, h: Rig) {
    const A = h.A, pose = base(), WB = A.WB || A.S;
    const top = off(A.port || A.S, 0, 0.03);
    const tilt = S(0.02, 0.12, t) * (1 - S(0.86, 0.96, t));
    pose.gun[5] += 0.3 * tilt; pose.gun[3] += 0.1 * tilt;
    pose.cover = S(0.06, 0.16, t) * (1 - S(0.74, 0.82, t));
    const keys: [number, V3][] = [[0, A.S], [0.08, top], [0.16, off(top, 0, 0.04)], [0.24, WB], [0.3, off(WB, 0, -0.08)], [0.4, A.P], [0.46, A.P], [0.58, off(WB, 0, -0.06)], [0.62, WB], [0.7, top], [0.76, off(top, 0, 0.04)], [0.82, top], [0.9, A.S], [1, A.S]];
    pose.L = path(t, keys);
    pose.mag = t < 0.24 ? { mode: 'in' } : t < 0.3 ? { mode: 'hand' } : t < 0.46 ? { mode: 'drop', at: 0.3 } : t < 0.62 ? { mode: 'hand' } : { mode: 'in' };
    return pose;
  }
  // One round at a time into a tube / internal magazine / drum.
  function shellClip(t: number, h: Rig) {
    const A = h.A, pose = base(), port = A.port || A.S;
    const under = port.y < -0.02, side = port.x > 0.01;
    const tilt = S(0.0, 0.2, t) * (1 - S(0.8, 1, t));
    pose.gun[5] += (under ? 0.45 : side ? -0.4 : 0.1) * tilt; pose.gun[3] += (under ? -0.05 : 0.1) * tilt;
    const into = under ? off(port, 0.01, 0.0) : side ? off(port, 0, 0, 0.02) : off(port, 0, 0.03);
    pose.L = path(t, [[0, A.S], [0.3, A.P], [0.38, A.P], [0.62, into], [0.72, port], [0.8, port], [1, A.S]]);
    if (t > 0.34 && t < 0.72) pose.prop = { kind: 'shell' };
    return pose;
  }
  function revolverClip(t: number, h: Rig) {
    const A = h.A, pose = base(), cyl = A.cyl || A.S;
    const out = S(0.06, 0.16, t) * (1 - S(0.78, 0.86, t));
    pose.cyl = out;
    pose.gun[5] += 0.55 * S(0.02, 0.14, t) * (1 - S(0.84, 0.95, t));
    pose.gun[3] += 0.8 * S(0.16, 0.26, t) * (1 - S(0.3, 0.38, t)) - 0.25 * S(0.38, 0.5, t) * (1 - S(0.8, 0.92, t)); // muzzle up to eject, down to load
    const behind = off(cyl, -0.05, 0, -0.03);
    pose.L = path(t, [[0, A.S], [0.12, off(cyl, 0, -0.02, -0.04)], [0.32, off(cyl, 0, -0.02, -0.04)], [0.46, A.P], [0.52, A.P], [0.64, behind], [0.7, off(behind, 0.02)], [0.76, off(behind, 0.02)], [0.82, off(cyl, 0, -0.01, -0.03)], [0.94, A.S], [1, A.S]]);
    if (t > 0.48 && t < 0.74) pose.prop = { kind: 'loader' };
    return pose;
  }
  // A revolver loaded by hand (js/player.ts): the cylinder out and the empties shaken clear as the first round's reload
  // begins, a round from the pouch into it each time round, and shut at the end. pl.reloadTotal: this round's.
  function revolverRound(t: number, h: Rig, pl: Pl) {
    const A = h.A, cyl = A.cyl || A.S, pose = base();
    if (pl.revClose) {
      pose.cyl = 1 - S(0.15, 0.6, t);
      pose.gun[5] += 0.55 * (1 - S(0.2, 1, t)); pose.gun[3] -= 0.25 * (1 - S(0.2, 1, t));
      pose.L = path(t, [[0, A.P], [0.35, off(cyl, 0, -0.01, -0.03)], [0.6, off(cyl, 0, -0.01, -0.03)], [1, A.S]]);
      return pose;
    }
    let rt = t;
    if (pl.revOpen) {
      const k = G.REV.open / pl.reloadTotal;
      if (t < k) return revolverClip(0.5 * t / k, h);
      rt = (t - k) / (1 - k);
    }
    pose.cyl = 1;
    pose.gun[5] += 0.55; pose.gun[3] -= 0.25;
    const behind = off(cyl, -0.05, 0, -0.03);
    pose.L = path(rt, [[0, A.P], [0.25, A.P], [0.6, behind], [0.76, off(behind, 0.02)], [1, A.P]]);
    if (rt < 0.72) pose.prop = { kind: 'shell' };
    return pose;
  }
  // A falling block loaded a round at a time (js/player.ts: as a revolver by hand, revOpen and revClose). As the first round's reload begins the lever
  // swings down and the block drops with it (pose.brk, js/vmanim.ts apply: info.block), the gun tipped muzzle-down a little and rolled toward you so the
  // chambers face up out of the gap; then each time round a round from the pouch, brought in over the next empty chamber from behind and pushed home along
  // its bore (held by its base: the prop's middle is ahead of the hand), its head showing in the chamber once it's in (pose.fed); the block up at the end.
  function blockRound(t: number, h: Rig, pl: Pl) {
    const A = h.A, pose = base(), tilt = (k: number) => { pose.gun[3] -= 0.2 * k; pose.gun[5] += 0.3 * k; pose.gun[1] += 0.025 * k; pose.gun[0] -= 0.02 * k; };
    if (pl.revClose) {
      pose.brk = 1 - S(0.15, 0.7, t); tilt(1 - S(0.35, 1, t));
      pose.L = path(t, [[0, A.P], [0.55, A.S], [1, A.S]]);
      return pose;
    }
    let rt = t;
    if (pl.revOpen) {
      const k = G.REV.open / pl.reloadTotal;
      if (t < k) { const u = t / k; pose.brk = S(0.1, 0.75, u); tilt(S(0, 0.8, u)); pose.L = path(u, [[0, A.S], [0.55, A.S], [1, A.P]]); return pose; } // (the right hand drops the lever; the left lets go of the forend for the pouch)
      rt = (t - k) / (1 - k);
    }
    pose.brk = 1; tilt(1);
    const B = A.block, w = pl.cur();
    if (!B || !B.at.length) { pose.L = path(rt, [[0, A.P], [0.5, A.S], [1, A.P]]); return pose; }
    if ((w.def.perLoad || 1) > 1) return clawRound(rt, h, pl, pose);
    const c = B.at[Math.min(B.at.length - 1, w.mag || 0)], home = new T.Vector3(c.x, c.y + 0.012, c.z - B.oal / 2 + 0.001 + 0.03), out = off(home, -0.035, 0.022); // (the hand where the round's base is at the chamber's mouth, all but its rim in; and behind and above it)
    pose.L = path(rt, [[0, A.P], [0.28, A.P], [0.56, out], [0.72, home], [0.8, home], [1, A.P]]);
    if (rt > 0.24 && rt < 0.74) pose.prop = { kind: 'shell' };
    if (rt >= 0.72) pose.fed = (w.mag || 0) + 1;
    return pose;
  }
  // The Wolverine grip (def.perLoad, js/player.ts loadCount: pl.loadN rounds this grip, three or fewer): the hand comes up from the pouch with the rounds between
  // its fingers, claws out, holds them up a moment in view, then over the next empty chambers from behind; as it comes down to them the rounds line up each on its
  // own bore (pose.prop.seat: from the fingers' spacing to the chambers'), and one push seats them all. (rt: through this grip; the block already down.)
  function clawRound(rt: number, h: Rig, pl: Pl, pose: Pose) {
    const A = h.A, B = A.block!, w = pl.cur(), m = w.mag || 0, n = Math.max(1, Math.min(CLAW_N, pl.loadN || 1, B.at.length - m));
    const at: V3[] = [], C = new T.Vector3();
    for (let i = 0; i < n; i++) { const c = B.at[Math.min(B.at.length - 1, m + i)]; at.push(new T.Vector3(c.x, c.y, c.z - B.oal / 2 + 0.001)); C.add(c); } // (each round's middle, seated: its rim at the chamber's mouth)
    C.divideScalar(n);
    const home = new T.Vector3(C.x, C.y + 0.012, C.z - B.oal / 2 + 0.001 + 0.03), out = off(home, -0.04, 0.026), show = A.F.clone().lerp(out, 0.12); // (the hand over the chambers' middle; behind and above; up in view between)
    pose.L = path(rt, [[0, A.P], [0.16, A.P], [0.4, show], [0.52, show], [0.68, out], [0.8, home], [0.86, home], [1, A.P]]);
    if (rt > 0.12 && rt < 0.82) pose.prop = { kind: 'claw', n, seat: S(0.54, 0.7, rt), up: S(0.18, 0.38, rt) * (1 - S(0.5, 0.64, rt)), at, home }; // (up: the fist turned to show them)
    if (rt >= 0.8) pose.fed = m + n;
    return pose;
  }
  function breakClip(t: number, h: Rig, n: number, pl: Pl) {
    const A = h.A, pose = base(), port = A.port || A.S;
    pose.brk = S(0.04, 0.16, t) * (1 - S(0.8, 0.9, t));
    pose.gun[3] -= 0.2 * S(0.02, 0.14, t) * (1 - S(0.85, 1, t));
    pose.gun[5] += 0.2 * S(0.02, 0.14, t) * (1 - S(0.85, 1, t));
    if (A.load) {
      // a derringer: the barrels tip up, so their breeches would face down and back; so it's turned upside down first
      // (rolled over in the hand, brought across in front), then opened, the breeches facing up clear of the frame,
      // and each round drops into its bore from above, in line with it (the hand holds it by its base: where the hand
      // is, rotated with it); shut, then turned back
      const roll = S(0.02, 0.16, t) * (1 - S(0.78, 0.94, t));
      pose.brk = S(0.16, 0.28, t) * (1 - S(0.64, 0.76, t));
      pose.gun = [-0.02 * roll, 0.07 * roll, 0, 1.31 * roll, 0, Math.PI * roll]; // (raised, the muzzle tipped up 75°: the barrels, swung over 165°, hang straight down from the hinge, their breeches up)
      const th = A.load.pitch, c = Math.cos(th), s = Math.sin(th), ro = [0.03 * c + 0.012 * s, 0.03 * s - 0.012 * c];
      const by = (p: V3, d: number) => off(p, d * c - ro[0], d * s - ro[1]), [b0, b1] = A.load.at;
      // (one fired: just the one round, into the top barrel, the one that fires first)
      pose.L = path(t, n === 1 ? [[0, A.S], [0.24, A.P], [0.32, A.P], [0.44, by(b0, -0.035)], [0.54, by(b0, 0.028)], [0.62, by(b0, -0.03)], [0.78, A.S], [0.84, off(A.S, 0, 0.03)], [1, A.S]]
        : [[0, A.S], [0.24, A.P], [0.32, A.P], [0.42, by(b0, -0.035)], [0.48, by(b0, 0.028)], [0.53, by(b1, -0.035)], [0.6, by(b1, 0.028)], [0.64, by(b1, -0.03)], [0.78, A.S], [0.84, off(A.S, 0, 0.03)], [1, A.S]]);
      if (t > 0.28 && t < (n === 1 ? 0.54 : 0.6)) pose.prop = { kind: 'shell', rx: t > 0.36 ? th : th * S(0.28, 0.36, t) };
      return pose;
    }
    if (A.breech) {
      // a breech out at the back of the barrel (a Thor's): nothing throws the empty out, so the hand takes it by the rim, draws
      // it back up the line of the barrel and lets it fall. The round, tipped to that line, comes down it into the chamber, the
      // hand following it home (held by the middle: as it's drawn in apply), and it stays there
      const b = A.breech, th = b.pitch, up = new T.Vector3(0.0, -0.012, -0.03).applyAxisAngle(_X, th), fw = new T.Vector3(0, Math.sin(th), -Math.cos(th));
      const look = S(0.04, 0.2, t) * (1 - S(0.76, 0.92, t)); // (turned across you, muzzle to the right, its open breech to the left hand)
      pose.gun = BREECH_CV.map((q) => q * look);
      const SIDE = 0.05, hand = (d: number) => b.at.clone().addScaledVector(fw, d).sub(up).add(new T.Vector3(-SIDE, 0, 0)), out = hand(-b.oal / 2 - 0.035), home = hand(b.oal / 2);
      if (pl && pl.handCase) { // (one to pull: the rest of it later)
        const GRIP = 0.012, onto = (p: V3) => p.clone().add(new T.Vector3(SIDE - GRIP, 0, 0)), rim = onto(hand(-0.012)), drawn = onto(hand(-0.14)), by = fw.clone().multiplyScalar(b.oal / 2 + 0.012), lk = S(0.04, 0.2, t) * (1 - S(0.84, 0.96, t));
        pose.brk = S(0.04, 0.16, t) * (1 - S(0.86, 0.96, t));
        pose.gun = BREECH_CV.map((q) => q * lk);
        pose.L = path(t, [[0, A.S], [0.16, off(rim, -0.03, 0.03)], [0.22, rim], [0.26, rim], [0.38, drawn], [0.46, off(drawn, -0.1, -0.05)], [0.52, A.P], [0.58, A.P], [0.66, out], [0.78, home], [0.83, off(home, -0.05, 0.03)], [0.9, A.S], [0.94, off(A.S, 0, 0.03)], [1, A.S]]);
        if (t > 0.24 && t < 0.43) pose.prop = { kind: 'case', rx: th, dx: GRIP, by };
        else if (t > 0.56 && t < 0.78) pose.prop = { kind: 'shell', rx: th * S(0.58, 0.66, t), dx: SIDE * S(0.58, 0.66, t) };
        pose.dropCase = t >= 0.43; // (it's let go: apply)
        pose.fed = t >= 0.78 ? 1 : 0; pose.pulled = t > 0.28 && t < 0.78; // (the head stays till the case in the hand has come up to the chamber's mouth)
        return pose;
      }
      pose.L = path(t, [[0, A.S], [0.2, A.P], [0.3, A.P], [0.44, out], [0.62, home], [0.68, off(home, -0.05, 0.03)], [0.78, A.S], [0.84, off(A.S, 0, 0.03)], [1, A.S]]);
      if (t > 0.27 && t < 0.62) pose.prop = { kind: 'shell', rx: th * S(0.3, 0.44, t), dx: SIDE * S(0.3, 0.44, t) };
      pose.fed = t >= 0.62 ? 1 : 0; pose.pulled = t > 0.16 && t < 0.62; // (js/vmanim.ts apply: what's in the chamber while it's open)
      return pose;
    }
    pose.L = path(t, [[0, A.S], [0.3, A.P], [0.38, A.P], [0.56, off(port, -0.02, 0.03)], [0.66, off(port, 0.01, 0.0)], [0.78, A.S], [0.84, off(A.S, 0, 0.03)], [1, A.S]]);
    if (t > 0.34 && t < 0.66) pose.prop = { kind: 'shell' };
    return pose;
  }
  function enblocClip(t: number, h: Rig) {
    const A = h.A, pose = base(), port = A.port || A.S;
    pose.gun[5] += 0.25 * S(0.0, 0.15, t) * (1 - S(0.8, 1, t));
    pose.L = path(t, [[0, A.S], [0.25, A.P], [0.32, A.P], [0.48, off(port, 0, 0.06)], [0.56, off(port, 0, 0.01)], [0.6, off(port, 0.05, 0.04)], [0.86, A.S], [1, A.S]]);
    if (t > 0.3 && t < 0.56) pose.prop = { kind: 'clip' };
    if (t > 0.56 && t < 0.62) pose.gun[2] += 0.02 * Math.sin(Math.PI * (t - 0.56) / 0.06); // op rod slams home
    return pose;
  }
  const BOW_COCK = 0.3, BOW_LOAD = 0.72; // (a crossbow reload: when the string's cocked, when the bolt's laid on the rail)
  function bowClip(t: number, h: Rig) {
    const A = h.A, pose = base(), port = A.port || A.S;
    pose.gun[3] += 0.35 * S(0.0, 0.15, t) * (1 - S(0.85, 1, t));
    pose.L = path(t, [[0, A.S], [0.25, A.P], [0.32, A.P], [0.5, off(port, -0.05, 0.03)], [0.7, off(port, 0.12, 0.03)], [0.85, A.S], [1, A.S]]);
    if (t > BOW_COCK && t < BOW_LOAD) pose.prop = { kind: 'bolt' };
    return pose;
  }
  // Show it off: left side, then the top and right, then a chamber check. Holding I holds the chamber check
  // open (t stops at INSPECT_HOLD) and the mouse turns the gun (rot: [yaw, pitch]) to look in from either side.
  const INSPECT_HOLD = 0.69;
  // how far a chamber check opens each action (of its travel): enough to see the round
  const CHECK: Record<string, number> = { pistol: 0.35, ar: 0.6, handle: 0.6, bolt: 0.75, pump: 0.35, lever: 0.4 };
  // the chamber check's pose, on top of the turn (gun [x, y, z, rx, ry, rz]): the port faces your eye
  const RIFLE_CV = [-0.03, 0.01, -0.18, 0.21, 0.95, 1.05], PISTOL_CV = [-0.04, 0.04, -0.1, 0.1, 1.7, 0.25], BREAK_CV = [-0.06, -0.08, -0.08, 0.8, 0.4, 0.2], BREECH_CV = [-0.1, 0, 0.06, 0.2, -0.7, 0.1], BREECH_CHK = [-0.12, -0.02, 0.2, 0.6, 0.1, 0.1], BREECH_CHK_LONG: Record<string, number[]> = { rail: [-0.12, 0.05, 0.03, 0.6, 0.1, 0.1], irons: [-0.12, -0.005, 0.15, 0.6, 0.1, 0.1] }, REV_CV = [-0.085, 0.05, -0.04, -0.12, 0.1, 0], BOLT_CV = [-0.03, -0.01, -0.18, 0.31, 0.55, 0.25]; // (a bolt gun: less cant, its open top toward you) // (a break-action: low, its top tipped up at you, looking down into the breech)
  // (a Thor on its long barrel's held further off than the short gun, and with a sight on its rail, which sits right over the breech and
  // brings the gun nearer your eye, further still and higher: drawn in as far, the breech is under your chin behind it)
  // (quick: held R on a gun with no magazine to pull, js/player.ts rChk: straight from rest into the held check, 0..1,
  // missing out the turn to the left side: the top-and-right turn and the check come in together)
  function inspectClip(t: number, h: Rig, kind: VmHold, rot: number[] | null, pl: Pl, quick: number | null | undefined) {
    const A = h.A, pose = base();
    if (rot) { pose.gun[5] -= rot[0]; pose.gun[3] -= rot[1]; } // (side to side rolls it over, up and down tips the muzzle)
    const a = quick != null ? 0 : S(0.0, 0.18, t) * (1 - S(0.36, 0.5, t)), b = quick != null ? S(0, 0.6, quick) : S(0.4, 0.55, t) * (1 - S(0.8, 0.95, t));
    const rev = kind === 'revolver', tb = rev ? 0 : b; // (a revolver has no port on its right to turn to: held straight, its cylinder swings out to the left)
    pose.gun[4] += 0.95 * a - 0.5 * tb; pose.gun[5] += -0.3 * a + 0.35 * tb; pose.gun[3] += 0.12 * a + 0.32 * tb;
    pose.gun[0] -= 0.02 * a; pose.gun[2] += 0.04 * (a + b); pose.gun[1] += 0.02 * a;
    const c = quick != null ? 0.5 * S(0.2, 1, quick) : G.U.clamp((t - 0.58) / 0.22, 0, 1);
    // for the chamber check: muzzle level, nearer, canted so the port faces you
    const cv = S(0, 0.25, c) * (1 - S(0.75, 1, c));
    pose.chk = kind === 'break' || kind === 'revolver' ? 0 : cv; // (the port open: js/vmanim.ts chamberView)
    // (a pistol: its port's on top of the slide, so tip the muzzle down and look in from above instead)
    const CV = kind === 'pistol' ? PISTOL_CV : kind === 'break' ? (A.breech ? (BREECH_CHK_LONG[A.breech.long] || BREECH_CHK) : BREAK_CV) : kind === 'revolver' ? REV_CV : kind === 'bolt' ? BOLT_CV : RIFLE_CV;
    for (let i = 0; i < 6; i++) pose.gun[i] += CV[i] * cv;
    if (c > 0 && c < 1) {
      // the action worked part way (CHECK: how far: a press check), held there while you look in, then let home
      if (kind === 'handle' ? !!A.H : actTravel(h, kind) > 0) {
        const cocked = kind === 'handle' && h.open && h.recip && G.loaded(pl.cur()) > 0; // (an open bolt with a round to fire's already back)
        const pull = cocked ? 1 : CHECK[kind] * S(0.18, 0.35, c) * (1 - S(0.65, 0.82, c)), on = S(0, 0.2, c) * (1 - S(0.8, 1, c));
        actionPose(kind, h, pose, pull, on, null, kind === 'pistol' && A.slide ? off(A.slide, -0.035, 0.002, -0.024) : null); // (a pistol's pinched at the back of the slide from the left, clear of the port)
      }
      else if (kind === 'break') { pose.brk = S(0.15, 0.4, c) * (1 - S(0.65, 0.85, c)); const low = A.cup || (A.breech ? off(A.S, -0.04, -0.03, 0.0) : off(A.S, -0.02, -0.06, -0.05)); pose.L = path(c, [[0, A.S], [0.25, low], [0.75, low], [1, A.S]]); } // (the left hand down under the barrels, out of the way; a derringer's, its barrels tipping right over, cupped under the frame)
      else if (kind === 'revolver') { pose.cyl = S(0.15, 0.4, c) * (1 - S(0.65, 0.85, c)); const under = off(A.cyl || A.S, 0.05, -0.035, -0.03); pose.L = path(c, [[0, A.S], [0.2, under], [0.8, under], [1, A.S]]); } // (thumb on the cylinder from in front and below: its back is clear to see)
      else if (A.WB) { pose.mag = { mode: 'peek', d: 0.025 * S(0.2, 0.4, c) * (1 - S(0.6, 0.8, c)) }; pose.L = path(c, [[0, A.S], [0.2, A.WB], [0.8, A.WB], [1, A.S]]); }
    }
    return pose;
  }
  // Hold R: the magazine out into the left hand and up in front of you, held upright (as it sits in the gun, its back
  // and witness holes toward you); then the mouse turns
  // it in your hand as far as a wrist goes (mc.yaw: rolled about its length, mc.pitch: tipped toward or away) to
  // see the witness holes down its back or the rounds through a clear one. mc.k: out 0..1, mc.back: going back 0..1.
  function magCheckClip(mc: { k: number; back: number; yaw: number; pitch: number }, h: Rig, Qh: THREE.Quaternion) {
    const A = h.A, pose = base(), WB = A.WB || A.S, below = alongMag(A, WB, 0.07);
    const p = mc.back > 0 ? 1 - mc.back : mc.k;
    const g = S(0.0, 0.45, p);
    pose.gun[0] += 0.07 * g; pose.gun[1] -= 0.06 * g; pose.gun[5] -= 0.45 * g; pose.gun[3] -= 0.08 * g; pose.gun[4] -= 0.15 * g; // the gun down and away to the right
    pose.L = path(p, [[0, A.S], [0.22, WB], [0.4, below], [1, A.F]]);
    if (p < 0.22) { pose.mag = { mode: 'in' }; return pose; }
    // its turn in camera space: upright, tipped as the mouse tips it, then rolled; back into the gun's frame (Qh: the gun's turn).
    // (a raked well's magazine, info.magRake, is stood upright in the hand as it comes up: turned forward by the rake)
    const tip = mc.pitch, k = S(0.4, 1, p), rake = (h.info as { magRake?: number | null }).magRake || 0;
    const qc = new T.Quaternion().setFromEuler(new T.Euler(tip * k, mc.yaw * k, 0, 'XYZ')).multiply(new T.Quaternion().setFromAxisAngle(_X, rake)).multiply(A.magQ);
    pose.mag = { mode: 'chk', q: Qh.clone().invert().multiply(qc).slerp(A.magQ, 1 - S(0.22, 0.5, p)) };
    return pose;
  }
  // whether this gun's magazine can be pulled to check it
  function canMagCheck(vm: THREE.Object3D | null | undefined) {
    const a: Vma | undefined = vm && vm.userData.vma;
    return !!(a && a.k.reload === 'mag' && !a.def.akimbo && a.hs[0].an.mag && a.hs[0].A.WB && !a.hs[0].info.magTop);
  }
  const base = (): Pose => ({ gun: [0, 0, 0, 0, 0, 0], L: null, R: null, mag: { mode: 'in' }, ch: 0, handle: null, open: null, slide: null, cyl: 0, brk: 0, cover: 0, pump: null, lever: null, hinge: null, lock: 0, bolt: null, prop: null });

  const _m = new T.Matrix4(), _inv = new T.Matrix4(), _X = new T.Vector3(1, 0, 0);
  // ------------------------------------------------------------------ per frame
  // pl: the player. Returns the gun offset [x, y, z, rx, ry, rz] to add to the viewmodel pose.
  function sample(pl: Pl, vm: THREE.Object3D) {
    const u = vm.userData, a: Vma = u.vma;
    if (!a) return [0, 0, 0, 0, 0, 0];
    const h = a.hs[0];
    // the pouch, in this gun's space (from last frame's pose: close enough)
    vm.updateMatrix(); h.holder.updateMatrix();
    h.A.P = POUCH.clone().applyMatrix4(_inv.copy(vm.matrix).invert()).applyMatrix4(_m.copy(h.holder.matrix).invert());
    h.A.F = FACE.clone().applyMatrix4(_inv).applyMatrix4(_m);
    let pose = null as Pose | null;
    const { reload, action } = a.k;
    if (pl.reloading && pl.reloadTotal) {
      const t = G.U.clamp(1 - pl.reloadT / pl.reloadTotal, 0, 1);
      if (reload === 'shell') pose = shellClip(t, h);
      else if (reload === 'revolver') pose = pl.revHand(a.def) ? revolverRound(t, h, pl) : revolverClip(t, h);
      else if (reload === 'break') pose = breakClip(t, h, pl.reloadN, pl);
      else if (reload === 'block') pose = blockRound(t, h, pl);
      else if (reload === 'enbloc') pose = enblocClip(t, h);
      else if (reload === 'bow') pose = bowClip(t, h);
      else if (reload === 'belt') pose = beltClip(t, h);
      else if (reload === 'hinge') pose = hingeClip(t, h);
      else if (reload === 'akimbo') { pose = base(); const tilt = S(0.02, 0.15, t) * (1 - S(0.75, 0.92, t)); pose.gun[3] += 0.4 * tilt; pose.gun[1] -= 0.04 * tilt; pose.mag = t < 0.08 ? { mode: 'in' } : t < 0.4 ? { mode: 'drop', at: 0.08 } : t < 0.62 ? { mode: 'gone' } : { mode: 'rise', k: S(0.62, 0.72, t) }; }
      else if (isSlap(a.def)) pose = slapClip(t, h, pl.reloadMode);
      else pose = magClip(t, h, !!(h.info as { pistol?: boolean }).pistol || action === 'pistol', pl.reloadMode, pl.reloadSeat);
    } else if (pl.act) { // the action, worked by hand (js/player.ts workAction): on its own, or straight on from a magazine just seated
      const ac = pl.act, c = G.U.clamp(ac.t, 0, 1), kind = actKind(a, h), from = ac.seat && h.A.WB ? off(h.A.WB, 0, 0.012) : null;
      pose = base();
      if (ac.kind === 'release') release(c, h, kind, pose, from); else rack(c, h, kind, pose, from);
      if (ac.seat) tiltPose(pose, magTilt(ac.seat) * (1 - S(0, 0.45, c))); // (the gun comes back from the magazine change's turn)
    } else if (pl.magChk && canMagCheck(vm)) {
      const Qh = new T.Quaternion(); _m.copy(vm.matrix).multiply(h.holder.matrix).decompose(new T.Vector3(), Qh, new T.Vector3());
      pose = magCheckClip(pl.magChk, h, Qh);
    } else if (pl.inspectT > 0 || pl.rChk) {
      const kind = action === 'pistol' || action === 'bolt' || action === 'pump' || action === 'lever' ? action : reload === 'revolver' || reload === 'break' ? reload : reload === 'block' ? 'break' : h.A.ch ? 'ar' : 'handle'; // (a falling block's check drops the block, as a break-action's opens it)
      pose = inspectClip(pl.rChk ? 0 : 1 - pl.inspectT / pl.inspectDur, h, kind === 'ar' || kind === 'handle' ? actKind(a, h) : kind, pl.inspHold || pl.rChk || pl.inspYaw || pl.inspPitch ? [pl.inspYaw || 0, pl.inspPitch || 0] : null, pl, pl.rChk ? pl.rChk.k : null);
    }
    a.pose = pose;
    a.reloadT = pl.reloading ? 1 - pl.reloadT / (pl.reloadTotal || 1) : -1;
    return pose ? pose.gun : [0, 0, 0, 0, 0, 0];
  }

    // After the viewmodel is posed: parts and hands.
  function apply(pl: Pl, vm: THREE.Object3D, cyc: number) {
    const a: Vma = vm.userData.vma;
    if (!a) return;
    const pose = a.pose, w = pl.cur();
    vm.updateMatrix();
    _inv.copy(vm.matrix).invert();
    a.hs.forEach((h, idx) => {
      const A = h.A, an = h.an;
      h.holder.updateMatrix();
      const res = (p: V3) => p;
      // a crossbow: the bolt's on the rail while there's one loaded (and from when a reload lays it there), the string's
      // back at the latch once it's cocked (a reload cocks it first); shot, the bolt's gone and the string's forward
      if (an.quarrel) {
        const ld = G.loaded(w) > 0, rt = a.reloadT == null ? -1 : a.reloadT;
        an.quarrel.visible = ld || rt >= BOW_LOAD; an.stringCocked!.visible = ld || rt >= BOW_COCK; an.stringSlack!.visible = !an.stringCocked!.visible;
        const am = (w.tube && w.tube.length && w.tube[w.tube.length - 1]) || w.ammo, N = h.info.quarrelMats && h.info.quarrelMats.nock; // (its lit nock, in the load's colour: js/bolts.ts)
        if (N && h.boltAm !== am) { h.boltAm = am; const c = G.Bolts.colour(am); N.color.setHex(c); if (N.emissive) N.emissive.setHex(c); }
      }
      // magazine
      if (an.mag && A.magHome) {
        const mg: MagState = pose ? pose.mag : { mode: 'in' };
        an.mag.visible = mg.mode !== 'gone' && !(w.noMag && mg.mode === 'in' && !pl.reloading); // (a gun with its magazine out has none on it)
        if (mg.mode !== 'chk') an.mag.quaternion.copy(A.magQ);
        if (idx === 0 && !pl.reloading) magFill(a, h.chk, w, pl.magSize(w));
        if (mg.mode === 'in') an.mag.position.copy(A.magHome);
        else if (mg.mode === 'peek') an.mag.position.copy(alongMag(A, A.magHome, mg.d!));
        else if (mg.mode === 'rise') an.mag.position.copy(alongMag(A, A.magHome, 0.15 * (1 - mg.k!)));
        else if (mg.mode === 'hand' && pose!.L) { const hand = res(pose!.L!); an.mag.position.copy(hand).sub(A.WB).add(A.magHome); }
        else if (mg.mode === 'chk' && pose!.L) { // turned in the hand about where the hand holds it
          an.mag.quaternion.copy(mg.q!);
          const rel = mg.q!.clone().multiply(A.magQ.clone().invert());
          an.mag.position.copy(A.magHome).sub(A.WB).applyQuaternion(rel).add(pose!.L!);
        }
        else if (mg.mode === 'drop') {
          if (!a.drop || a.drop.idx !== idx || a.drop.at !== mg.at) a.drop = { idx, at: mg.at, from: an.mag.position.clone(), t0: performance.now() };
          const tt = (performance.now() - a.drop.t0) / 1000;
          an.mag.position.copy(a.drop.from); an.mag.position.y -= 0.5 * 9.8 * tt * tt; an.mag.position.z += 0.05 * tt;
          an.mag.visible = tt < 0.5;
        }
        if (mg.mode !== 'drop' && a.drop && a.drop.idx === idx) a.drop = null;
      }
      // handles and slides
      if (an.ch && A.chHome) an.ch.position.copy(A.chHome).z += (pose ? pose.ch : 0) * CH;
      if (an.catch && A.catchHome) { // the bolt catch: up (its upper arm tipped back) with the bolt held open on an empty magazine, and through a reload from empty until the thumb sends the bolt home
        const held = pose && pose.catch != null ? pose.catch : (pl as unknown as { reloading: boolean; reloadAct: string | null }).reloading && (pl as unknown as { reloadAct: string | null }).reloadAct === 'release' ? 1 : !G.loaded(w) && G.boltHold(a.def) ? 1 : 0;
        an.catch.position.copy(A.catchHome); an.catch.rotation.x = held * CATCH_LOCK;
      }
      if (an.handle && A.handleHome) {
        // at rest: home, or (an open bolt with a round to fire) back; a riding handle jumps with each shot: a closed
        // bolt's back and home, an open bolt's slams home to fire and comes back to be caught
        const loaded = G.loaded(w) > 0, ts = pl.sinceShot == null ? 9 : pl.sinceShot, CYC = 0.08;
        let k = h.open && h.recip && loaded ? 1 : 0;
        if (pose && pose.handle != null) k = pose.handle;
        else if (h.recip && ts < CYC) k = h.open ? (loaded ? Math.min(1, ts / (CYC * 0.5)) : 0) : Math.sin(Math.PI * ts / CYC);
        an.handle.position.copy(A.handleHome).z += k * h.travel;
        if (h.lock) an.handle.rotation.z = -h.lock * (pose ? pose.lock : 0); // (a handle that turns up into a notch: about the tube's axis, the part's origin)
      }
      // a long-recoil barrel (the GM6's): slammed back the whole stroke with the shot, the bolt locked to it; a moment there while
      // the bolt unlocks and is held, then it runs home ahead of the bolt (eased in at the end, as the spring's spent)
      if (an.barrel && A.barrelHome) {
        const ts = pl.sinceShot == null ? 9 : pl.sinceShot, back = 0.025, hold = 0.03, home = 0.15;
        const kb = ts < back ? ts / back : ts < back + hold ? 1 : Math.max(0, 1 - (ts - back - hold) / home);
        an.barrel.position.copy(A.barrelHome).z += kb * kb * (3 - 2 * kb) * (h.info.recoilBarrel || 0);
      }
      if (an.slide && pose && pose.slide != null) an.slide.position.z = pose.slide * SLIDE;
      if (an.cyl && A.cylHome) { const k = pose ? pose.cyl : 0; an.cyl.position.copy(A.cylHome); an.cyl.position.x -= 0.05 * k; an.cyl.position.y -= 0.016 * k; /* (swung clear of the frame) */ }
      if (an.brk && !h.info.hinge && h.info.block && A.brkHome) { an.brk.position.copy(A.brkHome); an.brk.position.y -= (pose ? pose.brk : 0) * h.info.block.drop; } // (a falling block: straight down between the walls)
      else if (an.brk && !h.info.hinge) an.brk.rotation.x = (pose ? pose.brk : 0) * (A.load ? A.load.pitch : A.breech ? A.breech.pitch : -0.55); // (a derringer's hinge is at the top of the barrels' back: they tip up, muzzles first)
      if (an.cover) an.cover.rotation.x = (pose ? pose.cover : 0) * 1.1;
      if (an.bipod) G.GunRig.bipodPose(an.bipod, pl.bipodT || 0); // (down on the ground or a ledge: js/player.ts bipodStep)
      if (an.pump && pose && pose.pump != null && !h.info.hinge) an.pump.position.z = pose.pump * PUMP;
      if (an.lever && !h.info.hinge) an.lever.rotation.x = h.info.block ? (pose ? pose.brk : 0) * h.info.block.lever : (pose && pose.lever != null ? pose.lever : cyc && a.k.action === 'lever' ? cyc : 0) * 0.9; // (a falling block's lever: down with the block)
      if (h.info.hinge) hingePose(h, pose && pose.hsteps ? pose.hsteps : null); // (a model's own reload sequence, js/vmanim.ts hingeClip)
      if (an.bolt && A.boltHome) { const b = (pose && pose.bolt) || [0, 0]; an.bolt.rotation.z = b[0] * BOLT_LIFT; an.bolt.position.z = A.boltHome.z + b[1] * boltBack(h); } // (worked by hand: js/player.ts rack)

      // hands: resting on the gun unless the clip has them somewhere else
      let Rt = pose && pose.R ? res(pose.R) : A.G.clone(), Lt = pose && pose.L ? res(pose.L) : A.S.clone();
      if (pose && pose.Lon && h.info.hinge) Lt = hingeHold(h, pose.Lon); // (a reload sequence's hold: on a part, as the sequence has just posed it)
      // working the action between shots: the left hand riding the pump (a bolt's worked as a rack)
      if (!pose && cyc > 0 && a.k.action === 'pump' && an.pump) Lt = A.S.clone().add(new T.Vector3(0, 0, an.pump.position.z));
      if (a.def.akimbo) { // one gun in each hand
        const arm = h.side > 0 ? a.R : a.L, sh = h.side > 0 ? SHOULDER_R : SHOULDER_L, at = A.G.clone().applyMatrix4(h.holder.matrix);
        if (arm.hum) { humHold(arm, h, at, holdGrip(h.side, 0)); humSolve(arm, h.side > 0 ? 0 : 1); } else place(arm, sh.clone().applyMatrix4(_inv), at);
        return;
      }
      if (idx === 0) {
        if (a.R.hum) humHold(a.R, h, Rt.applyMatrix4(h.holder.matrix), holdGrip(1, pose && pose.Rk || 0)); else place(a.R, SHOULDER_R.clone().applyMatrix4(_inv), Rt.applyMatrix4(h.holder.matrix));
        if (a.L.hum) humHold(a.L, h, Lt.clone().applyMatrix4(h.holder.matrix), holdSupport(h, pose, Lt, !!(h.info as { pistol?: boolean }).pistol || a.k.action === 'pistol')); else place(a.L, SHOULDER_L.clone().applyMatrix4(_inv), Lt.clone().applyMatrix4(h.holder.matrix));
        a.L.sleeve.visible = a.L.glove.visible = !pl.zipRide && !a.L.hum; // (on a zipline the left hand's up on the trolley, out of view)
        if (a.L.hum) for (const m of a.L.hum.meshes) m.visible = !pl.zipRide;
        // looking something over, the hands turn with it: the right with the gun on its grip, the left under
        // the magazine it's holding (eased in and out so nothing snaps)
        const look = !!(pose && (pl.inspectT > 0 || pl.magChk || pl.rChk));
        a.fw += ((look ? 1 : 0) - a.fw) * 0.15;
        const gq = _q2.copy(h.holder.quaternion); // (the gun's turn in the viewmodel, where the arms are)
        // the right hand's hold on the grip, as it sits at rest (relative to the gun, once it's settled back): kept, locked, while it turns
        if ((!pose && a.fw < 0.02) || !a.gripQ) { a.gripQ = (a.gripQ || new T.Quaternion()); a.gripQ.copy(gq).invert().multiply(a.R.glove.quaternion); }
        if (a.fw > 0.01) {
          a.R.glove.quaternion.slerp(_q3.copy(gq).multiply(a.gripQ), a.fw);
          if (pose && pose.mag && pose.mag.mode === 'chk' && an.mag) {
            const mq = _q3.copy(h.holder.quaternion).multiply(an.mag.quaternion);
            a.L.glove.quaternion.slerp(mq.multiply(PALM_Q), a.fw);
            a.L.glove.position.add(_v2.set(0, a.L.hum ? HUM_MAGCHK : -0.024, 0).applyQuaternion(mq));
          }
        }
        // the chamber: the port open during a check, the round in it if there is one
        const chv = a.chv as (ChvHeads & ChvPort) | null;
        if (chv && chv.heads) {
          // a head per case in it, each ringed for its own load: the live rounds, and the empties till they're out. Round a
          // cylinder, the next to fire's the one under the hammer (it turns a chamber a shot) and the empties are the ones
          // behind it; in a break-action, the live ones first
          const n = chv.heads.length, live = Math.max(w.mag || 0, (pose && pose.fed) || 0), spent = w.spent || [], gone = (pl.ejecting || 0) + spent.length, top = chv.cyl ? pl.cylShots % n : 0;
          chv.heads.forEach((d, i) => {
            const j = chv.cyl ? (i - top + n) % n : i, k = chv.cyl ? n - 1 - j : j - live, fired = j >= live && k >= 0 && k < gone; // (k: how many shots ago)
            d.visible = (j < live || fired) && !(pose && pose.pulled);
            d.userData.dent.visible = fired;
            const am = d.visible ? (fired ? pl.ejected && k >= spent.length ? pl.ejected[k - spent.length] : spent[k] || w.ammo : (w.tube && w.tube[chv.cyl ? live - 1 - j : i]) || w.ammo) : null;
            if (am && d.userData.ring) d.userData.ring.material = shellMat(am);
            if (d.userData.lick && am !== d.userData.am) { // (a new round in it: whichever way it went in)
              d.userData.lick.visible = !!am && am !== G.ballFor(G.calOf(a.def));
              if (d.userData.lick.visible) { d.userData.lick.rotation.z = Math.random() * Math.PI * 2; d.userData.lickM.material = lickMat(am!); }
            }
            d.userData.am = am;
          });
        }
        else if (chv) {
          // the bolt face over the port: closed, it's all you see; worked back (pose.open), it uncovers the round. At
          // rest it's back if the gun locked open on its last round, or it's an open bolt that's cocked
          const lockedOpen = !G.loaded(w) && G.boltHold(a.def), hk = actKind(a, h);
          const open = pose && pose.open != null ? pose.open : lockedOpen || (h.open && w.mag > 0) ? actTravel(h, hk) : 0;
          chv.g.visible = chv.real || lockedOpen || !!(pose && (pose.chk! > 0.35 || pose.open! > 0.001));
          if (chv.bolt) { const Lb = chv.win - Math.min(open, chv.win - 0.002); chv.bolt.scale.z = Lb / chv.win; chv.bolt.position.z = -(chv.f - chv.win / 2 + Lb / 2); }
          // (a gun whose chamber is its magazine's top, a Garand's: the next round, unless it's open-bolt)
          const rd = G.chambered(a.def) ? w.chamber : !G.OPEN_BOLT.includes(a.def.id) && w.mag > 0 ? (w.tube && w.tube.length ? w.tube[w.tube.length - 1] : w.ammo) : null;
          chv.round.visible = !!rd;
          if (rd) chv.face.material = chv.shot ? shellMat(rd) : tipMat(rd);
        }
        // something in the left hand
        if (pose && pose.dropCase && pl.handCase && !pl.handOut) { pl.handOut = true; G.Casings.loose(a.def, h.holder.localToWorld(a.props.case.position.clone()), h.holder, pl.handCase); } // (a real case now, falling from where the hand had it)
        if (a.L.fist) { const fist = !!(pose && pose.prop && pose.prop.kind === 'claw'); a.L.fist.visible = fist && !a.L.hum; a.L.glove.children[1].visible = !fist && !a.L.hum; if (fist && a.L.hum) a.L.hum.curl = [1, 1, 1, 1, 0.6]; if (fist && pose!.prop!.up) a.L.glove.quaternion.slerp(CLAW_UP, pose!.prop!.up); } // (the Wolverine grip's fist, in place of the flat fingers (a body's own, curled right in); turned up to show the rounds)
        for (const [kind, obj] of Object.entries(a.props)) {
          obj.visible = !!(pose && pose.prop && pose.prop.kind === kind);
          if (kind === 'claw') { if (obj.visible) clawPose(obj, pose!.prop!, a.L.glove, h.holder, Lt); continue; }
          const rx = (obj.visible && pose!.prop!.rx) || 0; // (tipped up with a derringer's barrels, held by its base)
          obj.rotation.x = rx;
          if (obj.visible) obj.position.copy(Lt).add(new T.Vector3(0.0, -0.012, -0.03).applyAxisAngle(_X, rx)).add(_v2.set(pose!.prop!.dx || 0, 0, 0)); // (dx: held to the side of the hand)
          if (obj.visible && pose!.prop!.by) obj.position.add(pose!.prop!.by); // (by: held by its rim, not its middle)
          if (obj.visible && kind === 'shell' && !obj.userData.cart) {
            const shot = ((G.CALIBERS as Record<string, any>)[G.calOf(a.def)] || {}).group === 'shotgun', [hull, base] = obj.children as THREE.Mesh[], s = shot ? 1 : 0.5;
            hull.material = shot ? shellMat(w.ammo) : G.GunMaterials.M.brass(); hull.scale.set(s, 1, s); base.scale.set(s, 1, s);
          }
        }
        if (a.R.hum) humSolve(a.R, 0);
        if (a.L.hum) humSolve(a.L, 1);
      }
    });
  }
  // the Wolverine grip's rounds: each where it sits between the fingers (in the glove's frame, nose along the fingers), turned and moved as the hand comes over
  // the chambers (seat) to where it goes in, along its own bore, riding the hand till it's seated (at: holder space, the hand at home)
  const _gm = new T.Matrix4(), _hm = new T.Matrix4(), _gq = new T.Quaternion(), _cq = new T.Quaternion(), _rp = new T.Vector3();
  function clawPose(g: THREE.Object3D, pr: NonNullable<Pose['prop']>, glove: THREE.Object3D, holder: THREE.Object3D, Lt: V3) {
    g.position.set(0, 0, 0); g.rotation.set(0, 0, 0);
    _gm.compose(glove.position, glove.quaternion, _v2.set(1, 1, 1)); _hm.copy(holder.matrix).invert(); // (the glove's frame is the viewmodel's, as the holder's parent)
    _cq.copy(holder.quaternion).invert(); _gq.copy(_cq).multiply(glove.quaternion); // (the glove's turn in the holder's frame)
    const n = pr.n || 1, k = pr.seat || 0;
    g.children.forEach((r, i) => {
      r.visible = i < n;
      if (!r.visible) return;
      _rp.set(CLAW_X[i], CLAW_Y, CLAW_Z).applyMatrix4(_gm).applyMatrix4(_hm); // (between the fingers: fewer than three, from the index finger's side)
      const seated = pr.at![i].clone().sub(pr.home!).add(Lt); // (on its bore, as far from it as the hand is from its home)
      r.position.copy(_rp).lerp(seated, k);
      r.quaternion.copy(_gq).slerp(_cq.identity(), k);
    });
  }
  // what a magazine shows: the top round (its tip coloured for the load) if there is one, witness holes showing brass
  // down to where the stack ends, or the rounds through a clear body (the rig's chk: js/gunrig.ts magCheck)
  const DARK = new T.MeshStandardMaterial({ color: 0x0a0b0c, roughness: 0.9 }), SATIN = new T.MeshStandardMaterial({ color: 0xc89a44, roughness: 0.55, metalness: 0.15 });
  const PRIMER = new T.MeshStandardMaterial({ color: 0xc9c2b4, roughness: 0.4, metalness: 0.6 }), DENT = new T.MeshStandardMaterial({ color: 0x26211b, roughness: 0.8 }); // (a primer, and the firing pin's dent in it)
  const NUMS = new Map<number, THREE.Material>(), SHELLS = new Map<string, THREE.Material>(), TIPS = new Map<string, THREE.Material>(), LICKS = new Map<string, THREE.Material>();
  // the colour code (js/icons.ts): a shell's hull for its load, a bullet's tip for its type
  function shellMat(am: string) { if (!SHELLS.has(am)) SHELLS.set(am, new T.MeshStandardMaterial({ color: G.Icons.shellCol(am), roughness: 0.55 })); return SHELLS.get(am)!; }
  function lickMat(am: string) { if (!LICKS.has(am)) LICKS.set(am, new T.MeshStandardMaterial({ color: G.baseAm(am) === 'hp' ? 0xf2efe6 : G.Icons.tipCol(am), roughness: 0.75 })); return LICKS.get(am)!; } // (hollow point's own tan is lost on brass)
  function tipMat(am: string) { if (!TIPS.has(am)) TIPS.set(am, new T.MeshStandardMaterial({ color: G.Icons.tipCol(am), roughness: 0.4, metalness: 0.6 })); return TIPS.get(am)!; }
  function numMat(n: number) { // a count stamped beside a witness hole, white on the polymer
    if (NUMS.has(n)) return NUMS.get(n)!;
    const c = document.createElement('canvas'); c.width = 64; c.height = 48;
    const g = c.getContext('2d')!; g.fillStyle = '#e8e8e8'; g.font = 'bold 44px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(String(n), 32, 26);
    const tex = new T.CanvasTexture(c); tex.anisotropy = 4;
    const m = new T.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false });
    NUMS.set(n, m);
    return m;
  }
  function magFill(a: Vma, chk: MagChk | null, w: PWeapon, cap: number) {
    if (!chk || w.noMag) return;
    const n = w.mag || 0, tube = w.tube || [], top = tube.length ? tube[tube.length - 1] : w.ammo, key = n + '|' + cap + '|' + tube.join(',') + '|' + w.ammo;
    if (chk.key === key) return;
    chk.key = key;
    const shot = ((G.CALIBERS as Record<string, any>)[G.calOf(a.def)] || {}).group === 'shotgun', M = G.GunMaterials.M;
    // the round at depth t down the stack (the top is the last in the tube)
    const at = (t: number) => tube.length ? tube[Math.max(0, tube.length - 1 - Math.min(tube.length - 1, Math.floor(t * cap)))] : w.ammo;
    // the top round: a bullet with its tip coloured for its type, or a shell (hull coloured, no point)
    chk.top[0].visible = n > 0; chk.top[1].visible = n > 0 && !shot;
    chk.top[0].material = shot ? shellMat(top) : M.brass();
    chk.top[1].material = tipMat(top);
    // each hole stamped with the count it stands for (brass in it: at least that many rounds)
    if (chk.labCap !== cap) {
      chk.labCap = cap;
      const step = cap >= 25 ? 5 : cap >= 12 ? 2 : 1; // (stamped in round numbers, like the real thing)
      let last = 0;
      const nOf = new Map<number, number>(); // (holes at the same depth stand for the same count)
      for (const hl of chk.holes) {
        if (!nOf.has(hl.i)) nOf.set(hl.i, last = Math.max(last + step, Math.round(hl.t * cap / step) * step));
        hl.n = nOf.get(hl.i)!;
        if (!hl.lab) { // the count beside its hole, flat on the back face (tilted with it: the mesh's turn) and reading from behind, where you hold it
          hl.lab = new T.Mesh(new T.PlaneGeometry(chk.w * 0.56, 0.0095), null as any);
          hl.lab.quaternion.copy(hl.mesh.quaternion);
          hl.lab.position.copy(hl.mesh.position)
            .addScaledVector(new T.Vector3(1, 0, 0).applyQuaternion(hl.mesh.quaternion), chk.w * 0.43)
            .addScaledVector(new T.Vector3(0, 0, 1).applyQuaternion(hl.mesh.quaternion), 0.0013);
          hl.mesh.parent!.add(hl.lab);
        }
        hl.lab.material = numMat(hl.n);
      }
    }
    // through a hole: the case's side (brass), or a shell's hull; past the end of the stack, the follower's dark
    for (const hl of chk.holes) hl.mesh.material = n >= hl.n ? (shot ? shellMat(at(hl.t)) : M.brass()) : DARK;
    // the stack under the top round: as many of the drawn rounds as there are rounds under it (the drawn ones are the
    // magazine's real pitch, so a full one shows them all), the top ones first: the follower rises as it empties
    const show = cap > 1 ? Math.round(Math.max(0, n - 1) * chk.rounds.length / (cap - 1)) : 0;
    chk.rounds.forEach((r, i) => {
      const on = i < show, am = at(r.t);
      r.mesh.visible = on; r.mesh.material = shot ? shellMat(am) : M.brass();
      if (r.tip) { r.tip.visible = on && !shot; r.tip.material = tipMat(am); }
    });
    // the follower rides under the lowest round (or the top one, or the lips when empty) and the spring fills the space under it, down to the floor
    // plate: extended when the magazine is empty, squeezed to the floor when full. Both ride the magazine's spine, so a curved one's curves.
    if (chk.follower && chk.springs && chk.spine) {
      const sp = chk.spine, tEnd = sp[sp.length - 1][0], half = chk.rounds.length ? chk.rounds[0].t / 2 : 0.03;
      const tf = Math.min(tEnd - 0.01, n > 0 ? (show > 0 ? chk.rounds[show - 1].t : 0) + half : 0);
      poseOnSpine(sp, chk.follower, tf);
      for (const c of chk.springs) poseOnSpine(sp, c, tf + (tEnd - tf) * c.u);
    }
  }
  // the spine ([t, f, y, tilt] samples) at depth t, linearly between the samples
  function spineAt(sp: number[][], t: number) {
    let i = 0;
    while (i < sp.length - 2 && t > sp[i + 1][0]) i++;
    const a = sp[i], b = sp[i + 1], k = b[0] > a[0] ? Math.max(0, Math.min(1, (t - a[0]) / (b[0] - a[0]))) : 0;
    return [a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k, a[3] + (b[3] - a[3]) * k];
  }
  // moves a follower or coil, drawn at depth o.t, to depth t on the spine (its position and tilt follow the magazine)
  function poseOnSpine(sp: number[][], o: { mesh: THREE.Mesh; t: number; px: number; py: number; pz: number; rx: number }, t: number) {
    const A = spineAt(sp, o.t), B = spineAt(sp, t);
    o.mesh.position.set(o.px, o.py + B[1] - A[1], o.pz - (B[0] - A[0]));
    o.mesh.rotation.x = o.rx + B[2] - A[2];
  }
  // ------------------------------------------------------------------ your own arms
  // Each arm is your body's (js/humans.ts, picked as js/game.ts picks it, dressed as js/rig.ts armLook dresses it): the faces of its
  // sleeves, hand and fingers on that side alone, skinned to bones of the arm's own that are set every frame. The hand goes where its
  // frame is (Arm.glove: at the middle of what it holds, the palm toward it (+y), the fingers forward (-z)), the wrist follows from
  // it, and a two-bone IK from the shoulder to the wrist finds the elbow, bent toward its pole (down and out). The body's fingers
  // are modelled straight on the hand's bone: they're curled here, on the arm's own copy of their faces, as far as the hold wants,
  // and the thumb brought round toward the palm. (The model's L is your right: it faces +z, so its -x side turns to your right.)
  const HUM_SH = [new T.Vector3(0.17, -0.2, 0.12), new T.Vector3(-0.16, -0.22, 0.06)]; // (the shoulders, camera space: right, left)
  const HUM_POLE = [new T.Vector3(0.75, -1, 0.3).normalize(), new T.Vector3(-0.45, -1, 0.2).normalize()]; // (where the elbows go, camera space)
  const HUM_MAGCHK = 0.008; // (the left hand's hold on a magazine it's looking over: a little up its body from the floorplate)
  interface HumArm {
    meshes: THREE.SkinnedMesh[]; bones: Record<string, THREE.Bone>; bindW: Record<string, THREE.Matrix4>; s: string; th: number;
    S: V3; E: V3; W: V3; lu: number; lf: number; f: V3; X: V3; Y: V3; Cinv: THREE.Matrix4;
    fing: { geo: THREE.BufferGeometry; cv: Float32Array; nv: Float32Array; fi: Int8Array; ak: number[]; al: number[]; c0: number[]; sl: number[] };
    thumb: { geo: THREE.BufferGeometry; cv: Float32Array; nv: Float32Array; w: Float32Array; b0: number; c0: number } | null;
    curl: number[]; ck: string; r: number; Mh: THREE.Matrix4;
  }
  interface HumHoldT { q: THREE.Quaternion; r: number; curl: number[] } // (a hold: the hand's frame in the gun's space, how far the palm is from the middle of what it holds, its curl: four fingers from the index, and the thumb)
  const _hmats = new Map<string, THREE.Material>();
  const humMat = (c: number, rough: number) => { const k = c + '|' + rough; if (!_hmats.has(k)) _hmats.set(k, new T.MeshStandardMaterial({ color: c, roughness: rough, metalness: 0 })); return _hmats.get(k)!; };
  // the faces of a part all of whose corners keep says so, as a geometry of their own (every attribute, the kept corners only)
  function subset(geo: THREE.BufferGeometry, keep: (i: number) => boolean) {
    const idx = geo.index, n = idx ? idx.count : geo.attributes.position.count, map = new Map<number, number>(), tri: number[] = [];
    for (let t = 0; t + 2 < n; t += 3) {
      const v = idx ? [idx.getX(t), idx.getX(t + 1), idx.getX(t + 2)] : [t, t + 1, t + 2];
      if (!v.every(keep)) continue;
      for (const i of v) { if (!map.has(i)) map.set(i, map.size); tri.push(map.get(i)!); }
    }
    if (!tri.length) return null;
    const out = new T.BufferGeometry();
    for (const [name, at] of Object.entries(geo.attributes)) {
      const src = at as THREE.BufferAttribute, k = src.itemSize, arr = new (src.array.constructor as Float32ArrayConstructor)(map.size * k);
      for (const [o, i] of map) for (let j = 0; j < k; j++) arr[i * k + j] = src.getComponent(o, j);
      out.setAttribute(name, new T.BufferAttribute(arr, k, src.normalized));
    }
    out.setIndex(tri);
    return out;
  }
  // each face split in four (an indexed geometry: the new corners at the edges' middles, normals averaged, the rest of a corner's attributes its first end's), so the
  // fingers, modelled as a few long faces, have corners at their knuckles to bend at
  function split4(geo: THREE.BufferGeometry) {
    const idx = geo.index!, at = geo.attributes, names = Object.keys(at), cols: Record<string, number[]> = {}, mid = new Map<string, number>(), tri: number[] = [];
    let n = at.position.count;
    for (const k of names) { const a = at[k] as THREE.BufferAttribute; cols[k] = Array.from(a.array as ArrayLike<number>); }
    const half = (i: number, j: number) => {
      const key = i < j ? i + ',' + j : j + ',' + i;
      let m = mid.get(key);
      if (m != null) return m;
      m = n++; mid.set(key, m);
      for (const k of names) {
        const c = cols[k], sz = (at[k] as THREE.BufferAttribute).itemSize;
        for (let q = 0; q < sz; q++) c.push(k === 'position' || k === 'normal' ? (c[i * sz + q] + c[j * sz + q]) / 2 : c[i * sz + q]);
        if (k === 'normal') { const o = m * 3, l = Math.hypot(c[o], c[o + 1], c[o + 2]) || 1; c[o] /= l; c[o + 1] /= l; c[o + 2] /= l; }
      }
      return m;
    };
    for (let t = 0; t < idx.count; t += 3) {
      const a = idx.getX(t), b = idx.getX(t + 1), c = idx.getX(t + 2), ab = half(a, b), bc = half(b, c), ca = half(c, a);
      tri.push(a, ab, ca, ab, b, bc, ca, bc, c, ab, bc, ca);
    }
    const out = new T.BufferGeometry();
    for (const k of names) { const a = at[k] as THREE.BufferAttribute; out.setAttribute(k, new T.BufferAttribute(new (a.array.constructor as Float32ArrayConstructor)(cols[k]), a.itemSize, a.normalized)); }
    out.setIndex(tri);
    geo.dispose();
    return out;
  }
  // your arms, on a viewmodel: now if your body's file is in, else when it comes
  function dressArms(root: THREE.Object3D, a: Vma) {
    const lk = G.Rig.armLook({ animal: G.Game.myAnimal, callName: G.Game.myName, seed: 977, look: G.Game.myLook });
    const go = () => { const parts = G.Humans.get(lk.human); if (!parts || root.userData.vma !== a || a.R.hum) return; a.R.hum = humArm(root, a.R, parts, 'L', lk.col); a.L.hum = humArm(root, a.L, parts, 'R', lk.col); };
    if (G.Humans.get(lk.human)) go(); else G.Humans.ensure(lk.human).then(go);
  }
  // one arm: s, the model's side of it ('L': your right)
  function humArm(root: THREE.Object3D, arm: Arm, parts: HumanPart[], s: string, col: Record<string, number>): HumArm | undefined {
    const sx = s === 'L' ? -1 : 1, bones: Record<string, THREE.Bone> = {}, bindW: Record<string, THREE.Matrix4> = {};
    const bone = (n: string) => { if (!bones[n]) { const b = new T.Bone(); b.matrixAutoUpdate = false; root.add(b); bones[n] = b; } return bones[n]; };
    for (const p of parts) p.bones.forEach((n, i) => { if (!bindW[n]) bindW[n] = p.inv[i].clone().invert(); });
    if (!bindW['hand' + s] || !bindW['forearm' + s] || !bindW['upperarm' + s]) return undefined;
    const at = (n: string) => new T.Vector3().setFromMatrixPosition(bindW[n + s]);
    const S = at('upperarm'), E = at('forearm'), W = at('hand');
    // the hand's frame in the file: f along it (the bone's y), Y the way its palm faces (in toward the body), X across it (the thumb's side on the right hand)
    const f = new T.Vector3().setFromMatrixColumn(bindW['hand' + s], 1).normalize(), Y = new T.Vector3(-sx, 0, 0), X = new T.Vector3();
    Y.addScaledVector(f, -Y.dot(f)).normalize(); X.crossVectors(Y, f.clone().negate()).normalize();
    const geos: Record<string, THREE.BufferGeometry> = {}, meshes: THREE.SkinnedMesh[] = [];
    for (const p of parts) {
      if (!['upsleeve', 'sleeve', 'hand', 'finger'].includes(p.mat) || col[p.mat] == null) continue;
      const pos = p.geo.attributes.position;
      let geo = subset(p.geo, (i) => pos.getX(i) * sx > 0.12); // (that side's arm: clear of the chest)
      if (!geo) continue;
      if (p.mat === 'finger') geo = split4(split4(geo)); else if (p.mat === 'hand') geo = split4(geo);
      geos[p.mat] = geo;
      const sk = new T.Skeleton(p.bones.map(bone), p.inv);
      const sm = new T.SkinnedMesh(geo, humMat(col[p.mat], p.mat === 'hand' || p.mat === 'finger' ? (col.hand === col.sleeve ? 0.8 : 0.65) : 0.9));
      sm.frustumCulled = false; sm.bind(sk, new T.Matrix4());
      root.add(sm); meshes.push(sm);
    }
    if (!geos.finger || !geos.hand) { for (const m of meshes) root.remove(m); return undefined; }
    // the fingers: each corner's place along the hand (a), across it (b) and toward the palm (c) from the wrist; which finger it's on, from the index
    const fg = geos.finger, fp = fg.attributes.position, fnm = fg.attributes.normal, n = fp.count;
    const cv = new Float32Array(n * 3), nv = new Float32Array(n * 3), fi = new Int8Array(n), v = new T.Vector3(), nn = new T.Vector3();
    let bmin = Infinity, bmax = -Infinity;
    for (let i = 0; i < n; i++) {
      v.fromBufferAttribute(fp, i).sub(W); nn.fromBufferAttribute(fnm, i);
      cv[i * 3] = v.dot(f); cv[i * 3 + 1] = v.dot(X); cv[i * 3 + 2] = v.dot(Y); nv[i * 3] = nn.dot(f); nv[i * 3 + 1] = nn.dot(X); nv[i * 3 + 2] = nn.dot(Y);
      bmin = Math.min(bmin, cv[i * 3 + 1]); bmax = Math.max(bmax, cv[i * 3 + 1]);
    }
    const th = s === 'L' ? 1 : -1; // (the thumb's side: +X on the right hand)
    // (each finger's line: c against a, fitted, as they're modelled reaching a little toward the palm; its knuckle where it starts, its length along that line)
    const ak = [9, 9, 9, 9], am = [-9, -9, -9, -9], sa = [0, 0, 0, 0], sc = [0, 0, 0, 0], saa = [0, 0, 0, 0], sac = [0, 0, 0, 0], cn = [0, 0, 0, 0];
    for (let i = 0; i < n; i++) {
      const k = Math.min(3, Math.floor(4 * (cv[i * 3 + 1] - bmin) / (bmax - bmin + 1e-6))), j = th > 0 ? 3 - k : k, a0 = cv[i * 3], c0 = cv[i * 3 + 2];
      fi[i] = j; ak[j] = Math.min(ak[j], a0); am[j] = Math.max(am[j], a0); sa[j] += a0; sc[j] += c0; saa[j] += a0 * a0; sac[j] += a0 * c0; cn[j]++;
    }
    const sl = [0, 1, 2, 3].map((j) => { const N = Math.max(1, cn[j]), va = saa[j] / N - (sa[j] / N) ** 2; return va > 1e-9 ? (sac[j] / N - (sa[j] / N) * (sc[j] / N)) / va : 0; });
    const c0 = [0, 1, 2, 3].map((j) => sc[j] / Math.max(1, cn[j]) + sl[j] * (ak[j] - sa[j] / Math.max(1, cn[j]))); // (the line's c at the knuckle)
    const fing = { geo: fg, cv, nv, fi, ak, al: am.map((x, j) => (x - ak[j]) * Math.hypot(1, sl[j])), c0, sl };
    // the palm: its face (c), between the wrist and the knuckles, across the fingers' width; the thumb, the hand's corners out past the index finger
    const hg = geos.hand, hp = hg.attributes.position, hn = hg.attributes.normal, akm = (ak[0] + ak[1] + ak[2] + ak[3]) / 4;
    let cp = -Infinity;
    const edge = th > 0 ? bmax : bmin, tcv = new Float32Array(hp.count * 3), tnv = new Float32Array(hp.count * 3), tw = new Float32Array(hp.count);
    let cmin = Infinity, cmax = -Infinity;
    for (let i = 0; i < hp.count; i++) {
      v.fromBufferAttribute(hp, i).sub(W); nn.fromBufferAttribute(hn, i);
      const a0 = v.dot(f), b0 = v.dot(X), c0 = v.dot(Y);
      tcv[i * 3] = a0; tcv[i * 3 + 1] = b0; tcv[i * 3 + 2] = c0; tnv[i * 3] = nn.dot(f); tnv[i * 3 + 1] = nn.dot(X); tnv[i * 3 + 2] = nn.dot(Y);
      if (a0 > 0.3 * akm && a0 < 0.85 * akm && b0 > bmin && b0 < bmax) { cp = Math.max(cp, c0); cmin = Math.min(cmin, c0); cmax = Math.max(cmax, c0); }
      tw[i] = G.U.clamp(((b0 - edge) * th - 0.002) / 0.012, 0, 1) * G.U.clamp(a0 / 0.02, 0, 1);
    }
    const P0 = W.clone().addScaledVector(f, 0.55 * akm).addScaledVector(X, (bmin + bmax) / 2).addScaledVector(Y, cp);
    const Cinv = new T.Matrix4().makeBasis(X, Y, f.clone().negate()).setPosition(P0).invert();
    for (const m of [arm.sleeve, ...arm.glove.children]) m.visible = false; // (the stand-ins go)
    return { meshes, bones, bindW, s, th, S, E, W, lu: S.distanceTo(E), lf: E.distanceTo(W), f, X, Y, Cinv, fing,
      thumb: { geo: hg, cv: tcv, nv: tnv, w: tw, b0: edge, c0: (cmin + cmax) / 2 }, curl: [0, 0, 0, 0, 0], ck: '', r: 0.015, Mh: new T.Matrix4() };
  }
  // the fingers curled (k 0..1 each: the index, middle, ring and little finger, then the thumb), on the arm's own copy of them
  const CURL = [1.45, 1.7, 1.0]; // (each knuckle's turn at a full curl, radians: the first, the second, the last)
  function humCurl(h: HumArm) {
    const key = h.curl.map((k) => Math.round(k * 40)).join();
    if (key === h.ck) return;
    h.ck = key;
    const F = h.fing, pos = F.geo.attributes.position as THREE.BufferAttribute, nor = F.geo.attributes.normal as THREE.BufferAttribute, p = new T.Vector3();
    const put = (attr: THREE.BufferAttribute, i: number, a: number, b: number, c: number, o: V3 | null) => { p.set(0, 0, 0).addScaledVector(h.f, a).addScaledVector(h.X, b).addScaledVector(h.Y, c); if (o) p.add(o); attr.setXYZ(i, p.x, p.y, p.z); };
    for (let i = 0; i < pos.count; i++) {
      const j = F.fi[i], k = h.curl[j], A = F.ak[j], L = F.al[j], C = F.c0[j], m = F.sl[j], u = Math.hypot(1, m), ua = 1 / u, uc = m / u, a0 = F.cv[i * 3], cc = F.cv[i * 3 + 2];
      let a = a0, c = cc, na = F.nv[i * 3], nc = F.nv[i * 3 + 2];
      const s0 = (a0 - A) * ua + (cc - C) * uc; // (how far along the finger's line)
      for (let q = 0; q < 3; q++) {
        const sj = [0.72, 0.42, 0][q] * L;
        if (s0 <= sj) continue;
        const ja = A + sj * ua, jc = C + sj * uc, t = k * CURL[2 - q], co = Math.cos(t), si = Math.sin(t), da = a - ja, dc = c - jc;
        a = ja + da * co - dc * si; c = jc + da * si + dc * co;
        const n1 = na * co - nc * si; nc = na * si + nc * co; na = n1;
      }
      put(pos, i, a, F.cv[i * 3 + 1], c, h.W); put(nor, i, na, F.nv[i * 3 + 1], nc, null);
    }
    pos.needsUpdate = nor.needsUpdate = true;
    const Th = h.thumb;
    if (!Th) return;
    const tp = Th.geo.attributes.position as THREE.BufferAttribute, tn = Th.geo.attributes.normal as THREE.BufferAttribute, ang = h.curl[4] * 1.1 * h.th;
    for (let i = 0; i < tp.count; i++) {
      const w = Th.w[i]; if (!w) continue;
      const t = ang * w, co = Math.cos(t), si = Math.sin(t), db = Th.cv[i * 3 + 1] - Th.b0, dc = Th.cv[i * 3 + 2] - Th.c0, nb = Th.nv[i * 3 + 1], nc = Th.nv[i * 3 + 2];
      put(tp, i, Th.cv[i * 3], Th.b0 + db * co - dc * si, Th.c0 + db * si + dc * co, h.W); put(tn, i, Th.nv[i * 3], nb * co - nc * si, nb * si + nc * co, null);
    }
    tp.needsUpdate = tn.needsUpdate = true;
  }
  // the hands' holds (frames in the gun's space: makeBasis of x, the palm's way y, the fingers' way -z)
  const qBasis = (y: V3, z: V3) => { const Y = y.clone().normalize(), X = new T.Vector3().crossVectors(Y, z).normalize(), Z = new T.Vector3().crossVectors(X, Y); return new T.Quaternion().setFromRotationMatrix(new T.Matrix4().makeBasis(X, Y, Z)); };
  const RAKE = 0.3; // (a pistol grip's slope, its bottom back: the fingers square to it)
  const Q_GRIP = [qBasis(new T.Vector3(1, 0, 0), new T.Vector3(0, Math.sin(RAKE), Math.cos(RAKE))), qBasis(new T.Vector3(-1, 0, 0), new T.Vector3(0, Math.sin(RAKE), Math.cos(RAKE)))]; // (the left hand's, the right's: the palm on the grip's side, the fingers round its front)
  const Q_BOLT = qBasis(new T.Vector3(-1, -0.9, 0), new T.Vector3(0, 0.3, 1)); // (the right hand on a bolt's knob, from above and right)
  const Q_SUP = qBasis(new T.Vector3(0.35, 1, 0), new T.Vector3(-0.75, 0, 0.65)); // (the support hand under a handguard, the thumb along its left side)
  const Q_PSUP = qBasis(new T.Vector3(1, 0.35, 0), new T.Vector3(0, 0.3, 1)); // (on a pistol, the left hand round the right, its palm on the grip's left side)
  const Q_RACK = qBasis(new T.Vector3(0, -1, 0), new T.Vector3(-1, 0, 0.3)); // (over the top on a slide or a charging handle, the fingers down its right side)
  const Q_FREE = new T.Quaternion(); // (palm up, the fingers forward: carrying something, a magazine by its floorplate)
  function holdGrip(side: number, bolt: number): HumHoldT {
    const q = Q_GRIP[side > 0 ? 1 : 0].clone();
    if (bolt) q.slerp(Q_BOLT, bolt);
    return { q, r: G.U.lerp(0.017, 0.008, bolt), curl: [G.U.lerp(0.15, 0.75, bolt), 0.82, 0.86, 0.9, G.U.lerp(0.7, 0.5, bolt)] };
  }
  function holdSupport(h: Rig, pose: Pose | null | undefined, Lt: V3, pistol: boolean): HumHoldT {
    const on = 1 - S(0.02, 0.09, Lt.distanceTo(h.A.S)), k = (pose && pose.Lk) || 0;
    const q = Q_FREE.clone().slerp(pistol ? Q_PSUP : Q_SUP, on);
    if (k) q.slerp(Q_RACK, k);
    const c = G.U.lerp(0.45, pistol ? 0.75 : 0.55, on) * (1 - k) + 0.75 * k;
    return { q, r: G.U.lerp(0.012, pistol ? 0.016 : 0.022, on) * (1 - k) + 0.01 * k, curl: [c, c + 0.03, c + 0.06, c + 0.1, G.U.lerp(0.4, 0.6, on)] };
  }
  // the hand set at a hold: its frame (Arm.glove: where vmanim's clips and turns can move it on), the palm's reach, the curl
  function humHold(arm: Arm, h: Rig, at: V3, o: HumHoldT) {
    arm.glove.position.copy(at); arm.glove.quaternion.copy(h.holder.quaternion).multiply(o.q);
    arm.hum!.r = o.r; arm.hum!.curl = o.curl.slice();
  }
  // the turn taking (u0, v0) to (u1, v1): each pair an axis and a direction off it (squared up to it)
  const _tb0 = new T.Matrix4(), _tb1 = new T.Matrix4(), _tx = new T.Vector3(), _ty = new T.Vector3(), _tz = new T.Vector3();
  function turnOf(u0: V3, v0: V3, u1: V3, v1: V3, out: THREE.Quaternion) {
    const mk = (u: V3, w: V3, m: THREE.Matrix4) => { _tx.copy(u).normalize(); _ty.copy(w).addScaledVector(_tx, -w.dot(_tx)).normalize(); _tz.crossVectors(_tx, _ty); return m.makeBasis(_tx, _ty, _tz); };
    return out.setFromRotationMatrix(mk(u1, v1, _tb1).multiply(mk(u0, v0, _tb0).transpose()));
  }
  // the arm from where its hand is: the hand's bone on its frame, the wrist from that, the elbow by IK from the shoulder (i: 0 right, 1 left)
  const _hS = new T.Vector3(), _hW = new T.Vector3(), _hE = new T.Vector3(), _hd = new T.Vector3(), _hp = new T.Vector3(), _hT = new T.Matrix4(), _hone = new T.Vector3(1, 1, 1);
  const _hQa = new T.Quaternion(), _hQb = new T.Quaternion(), _ant = new T.Vector3(0, 0, 1), _hMu = new T.Matrix4(), _hMf = new T.Matrix4();
  function humSolve(arm: Arm, i: number) {
    const h = arm.hum!, g = arm.glove, Mh = h.Mh;
    humCurl(h);
    _hp.set(0, 1, 0).applyQuaternion(g.quaternion); // (the palm's way)
    Mh.compose(_hd.copy(g.position).addScaledVector(_hp, -h.r), g.quaternion, _hone).multiply(h.Cinv);
    _hW.copy(h.W).applyMatrix4(Mh);
    _hS.copy(HUM_SH[i]).applyMatrix4(_inv);
    const pole = HUM_POLE[i].clone().transformDirection(_inv);
    // (the shoulder brought forward along the line to the wrist when it's out of reach)
    _hd.subVectors(_hW, _hS);
    let d = _hd.length();
    const reach = h.lu + h.lf - 0.002;
    if (d > reach) { _hS.addScaledVector(_hd, (d - reach) / d); d = reach; }
    _hd.normalize();
    const ca = G.U.clamp((h.lu * h.lu + d * d - h.lf * h.lf) / (2 * h.lu * d), -1, 1), sa = Math.sqrt(1 - ca * ca);
    pole.addScaledVector(_hd, -pole.dot(_hd)).normalize();
    _hE.copy(_hS).addScaledVector(_hd, h.lu * ca).addScaledVector(pole, h.lu * sa);
    // the upper arm: along it, its front (the elbow's inside) toward the forearm; the forearm: along it, turned with the palm (most of the way) and the elbow
    const uF = new T.Vector3().subVectors(h.E, h.S), uV = new T.Vector3().subVectors(_hE, _hS), fF = new T.Vector3().subVectors(h.W, h.E), fV = new T.Vector3().subVectors(_hW, _hE);
    const bend = fV.clone().addScaledVector(uV, -fV.dot(uV) / uV.lengthSq());
    if (bend.lengthSq() < 1e-8) bend.copy(pole).negate();
    turnOf(uF, _ant, uV, bend, _hQa);
    _hMu.makeRotationFromQuaternion(_hQa).setPosition(_hS).multiply(_hT.makeTranslation(-h.S.x, -h.S.y, -h.S.z));
    turnOf(fF, _ant, fV, uV.clone().negate(), _hQa);
    turnOf(fF, h.Y, fV, _hp, _hQb);
    _hQa.slerp(_hQb, 0.7);
    _hMf.makeRotationFromQuaternion(_hQa).setPosition(_hE).multiply(_hT.makeTranslation(-h.E.x, -h.E.y, -h.E.z));
    for (const [n, b] of Object.entries(h.bones)) {
      b.matrix.multiplyMatrices(n === 'hand' + h.s ? Mh : n === 'forearm' + h.s ? _hMf : _hMu, h.bindW[n]);
      b.matrixWorldNeedsUpdate = true;
    }
  }

  // stretch an arm from the shoulder to the hand (both in viewmodel space)
  const _q2 = new T.Quaternion(), _q3 = new T.Quaternion(), _v2 = new T.Vector3();
  const PALM_Q = new T.Quaternion(); // palm under the floorplate, fingers along it
  const _d = new T.Vector3(), _q = new T.Quaternion(), UPV = new T.Vector3(0, 1, 0), RX = new T.Quaternion().setFromAxisAngle(new T.Vector3(1, 0, 0), Math.PI / 2);
  function place(arm: Arm, shoulder: V3, hand: V3) {
    _d.subVectors(shoulder, hand);
    const len = _d.length();
    _d.normalize();
    _q.setFromUnitVectors(UPV, _d);
    arm.sleeve.quaternion.copy(_q);
    arm.sleeve.scale.set(1, Math.max(0.05, len - 0.05), 1);
    arm.sleeve.position.copy(hand).addScaledVector(_d, 0.05 + (len - 0.05) / 2);
    arm.glove.position.copy(hand);
    arm.glove.quaternion.copy(_q).multiply(RX);
  }

  return { prepare, sample, apply, kinds, canMagCheck, actEvents, INSPECT_HOLD, SLAP, slapState, slapM, isSlap, hingeTimeline, hingeSteps, HINGE_EASE };
})();
G.VMAnim = G_VMAnim;

interface GameModules { VMAnim: typeof G_VMAnim; }
