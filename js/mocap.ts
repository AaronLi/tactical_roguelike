'use strict';
import { WEAPONS, boltHold } from './data.js';
import { GunModels } from './gunmodels.js';
import { GunRig as G_GunRig } from './gunrig.js';
import { Gunsmith } from './parts.js';
import { VMAnim } from './vmanim.js';
import { Rig as G_Rig } from './rig.js';
import { Me } from './player.js';
import { MocapMath as MM } from './mocapmath.js';
import type { McSample, McTake, McVisit, McZone } from './mocapmath.js';
// Reload mocap (mocap.html): mime a reload at one ordinary camera and read its timing off against the game's own clip.
//
// The camera's picture goes through two landmark models (MediaPipe's pose and hand landmarkers, from the CDN: nothing is installed), which give the body's
// 33 points and each hand's 21, on the picture and in metres about their own centres. js/mocapmath.ts turns those into places in front of the camera (the
// monocular part: solveT). Over the picture the page then draws, in one three.js scene whose camera is the real one's stand-in:
//   - the game's own model of the chosen gun (GunModels.display: the gunsmith's), in the grip hand, the way that hand is turned, or locked to the chest;
//   - the key points, as zones: on the gun from its model's anchors (GunRig.bind: the handguard, the magazine and its well, the charging handle or bolt
//     handle or slide), on the body from the shoulders and hips (the chest rig, the belt pouch);
//   - the path the game's reload takes the support hand along (VMAnim.reloadPose: the clip itself, sampled), as a ghost;
//   - the game's own character (Rig.create, in a chest rig), laid on the body's points with its hands where yours are and closed as far as yours (Rig.poseAt).
// A second view is the same scene from the character's eyes (the head's points give where they are and which way they face): a point at its middle, and
// a laser down the gun's bore, so where the gun points against where you look reads at a glance.
// The support hand is followed from zone to zone (MM.tracker). A reload is cut out by itself (MM.takes: from the hand leaving the handguard to its return),
// or by hand (Space), and laid beside the game's: each beat's time in and out, and the hand's path boiled down to keys written as js/vmanim.ts writes a
// clip's (`[0.14, WB], [0.36, A.P]`), to copy. A take keeps what the landmark models said, so it plays back, exports and loads again as JSON.
//
// Nothing here is part of the game: index.html never loads this file. `Mocap` is on the window for the console.

/** What the landmark models said about one frame, as the page keeps it (a take's frames): MediaPipe's axes (x right, y DOWN, z away), u v 0..1. */
interface McRaw { t: number; pose: { img: number[][]; world: number[][]; vis: number[] } | null; hands: { img: number[][]; world: number[][]; label: string }[] }
interface McZoneDef extends McZone { label: string; frame: 'gun' | 'body'; color: number }
interface McTakeRec { id: number; name: string; gun: string; aspect: number; take: McTake; raw: McRaw[]; manual: boolean }
interface McRef { how: string; empty: boolean; label: string; take: McTake; act: string | null }

export const Mocap = (() => {
  const T = THREE;
  type V3 = THREE.Vector3;
  const MP = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.2.3';
  const POSE_MODEL = 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_full/float16/1/pose_landmarker_full.task';
  const HAND_MODEL = 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task';
  const $ = (id: string) => document.getElementById(id) as any;
  const arr = (v: V3) => [v.x, v.y, v.z], vec = (a: number[]) => new T.Vector3(a[0], a[1], a[2]);
  const D2R = Math.PI / 180;

  // what the page's controls set
  const S = {
    fov: 62,          // the camera's horizontal field of view, degrees (a laptop's is about 60-70; a phone's main camera 65-75)
    mirror: true,     // drawn as a mirror
    lefty: false,     // the grip hand is the left
    depthK: 0.5,      // how much a distance along the camera's ray counts (MM.zoneDist)
    handScale: 1,     // your hand against the model's idea of one: bigger puts the hands further away (when the hands' depth is their own)
    bodyDepth: true,  // each hand's distance taken from the body's wrist (process: why)
    gripPitch: 18,    // the knuckles' line against the gun's upright, degrees (the grip's rake)
    gripYaw: 0,       // the muzzle trimmed left or right, degrees
    lock: false,      // the gun held where it is against the chest, not by the grip hand
    zoneScale: 1,
    auto: true,       // takes cut by themselves
    how: 'floor', empty: false, // which of the game's reloads is laid beside yours
    showGhost: true, showZones: true, showBody: true,
    character: true,  // the game's character drawn on the body
    opacity: 1,       // of everything drawn over the camera's picture
    laser: true,      // a laser down the bore
    fpFov: 95,        // the first-person view's horizontal field of view, degrees
    fpPitch: 0,       // that view tipped down (+) or up from where the head faces, degrees: a hand at the belt is far below a level gaze
    grabs: true,      // the magazine and the handle go with a hand only when it closes on them (off: when it is in their zone)
  };

  // ---------------------------------------------------------------- the scene
  let renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.PerspectiveCamera, ctx2: CanvasRenderingContext2D;
  let fpCam: THREE.PerspectiveCamera, fpCtx: CanvasRenderingContext2D, grid: THREE.GridHelper, laser: THREE.Mesh | null = null;
  let man: ReturnType<typeof G_Rig.create> | null = null; // the game's character
  const FP_BG = new T.Color(0x2b333b);
  let aspect = 16 / 9, tanH = Math.tan(S.fov / 2 * D2R), tanV = tanH / aspect;
  const gunRoot = new T.Group(), zoneRoot = new T.Group();
  let gun: { id: string; def: any; group: THREE.Group; info: any; rig: GunRig; zones: McZoneDef[]; anchors: Record<string, number[]>; pistol: boolean; action: string | null } | null = null;
  let ghost: THREE.Line | null = null, trail: THREE.Line | null = null;
  const zoneMesh = new Map<string, THREE.Mesh>();

  function initScene() {
    renderer = new T.WebGLRenderer({ canvas: $('gl'), alpha: true, antialias: true });
    renderer.setClearColor(0, 0);
    scene = new T.Scene();
    camera = new T.PerspectiveCamera(40, aspect, 0.05, 30);
    scene.add(new T.HemisphereLight(0xffffff, 0x445566, 2.2));
    const sun = new T.DirectionalLight(0xffffff, 2.4); sun.position.set(0.5, 1, 1); scene.add(sun);
    scene.add(gunRoot, zoneRoot);
    gunRoot.visible = false;
    ctx2 = $('hud').getContext('2d'); fpCtx = $('fp').getContext('2d');
    // the first-person view: the same scene from the head, with a floor to see the turn of the head against (layer 1: its alone)
    fpCam = new T.PerspectiveCamera(60, aspect, 0.07, 60); fpCam.layers.enable(1);
    grid = new T.GridHelper(24, 48, 0x6a7886, 0x46515c); grid.layers.set(1); scene.add(grid);
    // the character: an officer in a chest rig, no gun of its own (the page's is in its hand)
    man = G_Rig.create({ style: 'tactical', bare: true, seed: 977, look: { top: 'combat', topC: 0x7d8a63, pants: 'combat', pantsC: 0x5a5f52, eyes: 'none', gloves: 'tactical' } }); // (light clothes: its arms have to read against a dark room and the view's own dark)
    man!.setKit({ carrier: 'c.recon', cp: 3, belt: 'b.battle', bp: 2 });
    man!.root.visible = false; scene.add(man!.root);
    resize();
    window.addEventListener('resize', resize);
  }
  function setAspect(a: number) { if (a > 0 && Math.abs(a - aspect) > 1e-3) { aspect = a; resize(); } }
  function resize() {
    const stage = $('stage');
    stage.style.aspectRatio = String(aspect); $('fpwrap').style.aspectRatio = String(aspect);
    const w = stage.clientWidth, h = Math.round(w / aspect), dpr = Math.min(2, window.devicePixelRatio || 1);
    renderer.setPixelRatio(dpr); renderer.setSize(w, h, false);
    for (const id of ['hud', 'fp']) { const cv = $(id); cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr); }
    tanH = Math.tan(S.fov / 2 * D2R); tanV = tanH / aspect;
    camera.fov = 2 * Math.atan(tanV) / D2R; camera.aspect = aspect; camera.updateProjectionMatrix();
    fpCam.fov = 2 * Math.atan(Math.tan(S.fpFov / 2 * D2R) / aspect) / D2R; fpCam.aspect = aspect; fpCam.updateProjectionMatrix();
  }

  // ---------------------------------------------------------------- the gun, and its zones
  const ZC = { support: 0x59c36a, mag: 0xf0a63a, action: 0x4fb3ff, rig: 0xd66bd6, belt: 0x9a8cff };
  /** The ids the page offers: every platform the baker has, the magazine-fed first (they have a clip of the game's to lay beside a take). */
  function gunList() {
    const out: { id: string; name: string; mag: boolean }[] = [];
    for (const id of Object.keys(WEAPONS)) {
      if (!Gunsmith.PLATFORMS[id] || WEAPONS[id].akimbo) continue;
      let mag = false;
      try { mag = VMAnim.kinds(Gunsmith.fromCode(Gunsmith.defaultCode(id))).reload === 'mag'; } catch (e) { /* (a platform with no default build: listed, without a clip) */ }
      out.push({ id, name: WEAPONS[id].name || id, mag });
    }
    return out.sort((a, b) => +b.mag - +a.mag);
  }
  async function setGun(id: string) {
    const def = Gunsmith.fromCode(Gunsmith.defaultCode(id));
    if (!def) throw new Error('no such gun: ' + id);
    const d = GunModels.display(def);
    await new Promise<void>((res) => GunModels.whenReady(d.group, () => res()));
    while (gunRoot.children.length) gunRoot.remove(gunRoot.children[0]);
    gunRoot.add(d.group);
    const rig = G_GunRig.bind(d.group, d.info, { def });
    const A = rig.A, anchors: Record<string, number[]> = { 'A.S': arr(A.S) };
    if (A.WB) anchors.WB = arr(A.WB);
    if (A.ch) anchors['A.ch'] = arr(A.ch);
    if (A.H) anchors['A.H'] = arr(A.H);
    if (A.slide) anchors['A.slide'] = arr(A.slide);
    const k = VMAnim.kinds(def);
    gun = { id, def, group: d.group, info: d.info, rig, zones: [], anchors, pistol: !!d.info.pistol, action: k.action };
    magMode = 'in'; pullFrom = null; holding = magGrabbed = false;
    lockM = null;
    // the laser: from the muzzle, down the bore
    const mz = G_GunRig.v((d.info.muzzles || [[0.4, 0, 0]])[0])!, LEN = 40;
    laser = new T.Mesh(new T.CylinderGeometry(0.002, 0.002, LEN, 6).rotateX(Math.PI / 2), new T.MeshBasicMaterial({ color: 0xff2a2a, transparent: true, opacity: 0.85 }));
    laser.position.copy(mz).add(new T.Vector3(0, 0, -LEN / 2)); d.group.add(laser);
    buildZones();
    reference();
    status();
  }
  /**
   * The zones for the gun in hand. The gun's are in its own space (x right, y up, z back: js/gunrig.ts), from its anchors; the body's in the chest's
   * (origin between the shoulders, x to the wearer's right, y up the spine, z out of the back), on the support hand's side.
   */
  function buildZones() {
    if (!gun) return;
    const A = gun.rig.A, k = S.zoneScale * (gun.pistol ? 0.7 : 1), side = S.lefty ? 1 : -1, z: McZoneDef[] = []; // (a pistol's are all within a hand's width of each other: smaller)
    const sphere = (id: string, label: string, frame: 'gun' | 'body', p: number[], r: number, color: number) => z.push({ id, label, frame, a: p, b: p, r: r * k, color });
    sphere('support', gun.pistol ? 'Support grip' : 'Handguard', 'gun', arr(A.S), 0.09, ZC.support);
    if (A.W && A.WB) {
      const dn = A.magDn || new T.Vector3(0, -1, 0);
      z.push({ id: 'mag', label: 'Magazine', frame: 'gun', a: arr(A.W.clone().lerp(A.WB, 0.45)), b: arr(A.WB.clone().addScaledVector(dn, 0.05)), r: 0.08 * k, color: ZC.mag });
    }
    const act: [V3 | null | undefined, string][] = [[A.ch, 'Charging handle'], [A.H, 'Bolt handle'], [A.slide, 'Slide'], [A.bolt, 'Bolt']];
    const at = act.find((q) => q[0]);
    if (at) sphere('action', at[1], 'gun', arr(at[0]!), 0.075, ZC.action);
    // (the shoulders' line runs through the middle of the body: the front of a rig is a hand's depth and the pouches' in front of it, and a palm's joints a little more)
    z.push({ id: 'rig', label: 'Chest rig', frame: 'body', a: [-0.13, -0.3, -0.19], b: [0.13, -0.3, -0.19], r: 0.12 * S.zoneScale, color: ZC.rig });
    z.push({ id: 'belt', label: 'Belt pouch', frame: 'body', a: [0.18 * side, -0.53, -0.09], b: [0.18 * side, -0.53, -0.09], r: 0.1 * S.zoneScale, color: ZC.belt });
    gun.zones = z;
    gun.anchors['A.P'] = MM.lerp(z[z.length - 2].a, z[z.length - 2].b, 0.5 + 0.25 * side); // (filled in the gun's space by reference(): here the chest's, till then)
    // their meshes
    for (const m of zoneMesh.values()) { zoneRoot.remove(m); m.geometry.dispose(); (m.material as THREE.Material).dispose(); }
    zoneMesh.clear();
    for (const q of z) {
      const L = MM.len(MM.sub(q.b, q.a));
      const m = new T.Mesh(L > 1e-4 ? new T.CapsuleGeometry(q.r, L, 6, 16) : new T.SphereGeometry(q.r, 20, 14), new T.MeshBasicMaterial({ color: q.color, transparent: true, opacity: 0.12, depthWrite: false }));
      m.renderOrder = 2; zoneRoot.add(m); zoneMesh.set(q.id, m);
    }
    listZones();
  }

  // ---------------------------------------------------------------- frames of reference
  /** The chest's frame from the body's points (camera space): origin between the shoulders, x to the wearer's right, y up the spine, z out of the back. */
  function torsoM(b: number[][]): THREE.Matrix4 {
    const Ls = vec(b[11]), Rs = vec(b[12]), o = Ls.clone().add(Rs).multiplyScalar(0.5), hip = vec(b[23]).add(vec(b[24])).multiplyScalar(0.5);
    const x = Rs.sub(Ls).normalize(), up = o.clone().sub(hip).normalize(), z = new T.Vector3().crossVectors(x, up).normalize(), y = new T.Vector3().crossVectors(z, x);
    return new T.Matrix4().makeBasis(x, y, z).setPosition(o);
  }
  /**
   * A hand's frame from its 21 points: the palm's centre, the way the palm faces (n, out of it), and the turn that takes the gun's axes onto a hand gripping
   * it (before the grip's own rake): the gun's right is the back of a right hand (the palm of a left), its up the knuckles' line from the little finger to the first.
   */
  function handFrame(p: number[][], right: boolean) {
    const W = p[0], I = p[5], M = p[9], P = p[17];
    const a = MM.norm(MM.sub(M, W)), s = MM.norm(MM.sub(I, P)), n = MM.norm(right ? MM.cross(s, a) : MM.cross(a, s));
    const u = MM.norm(MM.sub(s, MM.mul(n, MM.dot(s, n)))), X = right ? MM.mul(n, -1) : n, Z = MM.cross(X, u);
    const q = new T.Quaternion().setFromRotationMatrix(new T.Matrix4().makeBasis(vec(X), vec(u), vec(Z)));
    return { c: [(W[0] + I[0] + M[0] + P[0]) / 4, (W[1] + I[1] + M[1] + P[1]) / 4, (W[2] + I[2] + M[2] + P[2]) / 4], n, q };
  }
  const READY_YAW = 20;
  const INSET = 0.025; // (the grip's middle, in from the palm's joints)
  const trimQ = () => new T.Quaternion().setFromEuler(new T.Euler(S.gripPitch * D2R, S.gripYaw * D2R, 0, 'XYZ'));
  /** Where the gun is when it is held as the game's ready stance has it, in the chest's frame: what the lock starts from, and what the demo mimes. */
  function readyM(): THREE.Matrix4 {
    const side = S.lefty ? -1 : 1, pistol = !!(gun && gun.pistol);
    // (shouldered, as the game's first person has it: the bore a hand's width under the eye, the stock inboard, the muzzle turned to the support side as the body is bladed)
    const q = new T.Quaternion().setFromEuler(new T.Euler(0, (pistol ? 3 : READY_YAW) * side * D2R, 0, 'YXZ'));
    const grip = pistol ? new T.Vector3(0.03 * side, 0.09, -0.45) : new T.Vector3(-0.02 * side, 0.05, -0.24);
    const held = gun ? gun.rig.A.G.clone() : new T.Vector3(0, -0.09, -0.03);
    return new T.Matrix4().compose(grip.sub(held.applyQuaternion(q)), q, new T.Vector3(1, 1, 1));
  }

  // ---------------------------------------------------------------- one frame's reckoning
  const fBody = MM.pointFilter(1.2, 3), fGrip = MM.pointFilter(1.6, 5), fOff = MM.pointFilter(2.2, 8);
  let track = MM.tracker(), cutter = MM.takes({ home: 'support' });
  // A hand's distance from its apparent size is smooth but biased, by a quarter either way as the hand turns (the hand model's idea of its size goes with its
  // pose); the body model's wrist is noisier but sits right against the chest, which is what a zone on the chest or on a gun held to it needs. So the hand is
  // slid along the camera's ray (its place on the picture kept) by handK, the body's wrist depth over the hand's own, followed with a quarter-second lag: the
  // body says how far, the hand says how it moves. With that off (or no body in the picture) the hands keep their own depth and the body is brought to them (bodyK).
  const handK: Record<string, number | null> = { Left: null, Right: null };
  let bodyK = 1;
  let lockM: THREE.Matrix4 | null = null; // the gun in the chest's frame, as last held (or as locked)
  const gunM = new T.Matrix4(), gunInv = new T.Matrix4(), gunQ = new T.Quaternion();
  let haveGun = false;
  // what the last frame came to: for the drawing, the console and the checks
  const live = {
    t: 0, body: null as number[][] | null, grip: null as number[][] | null, off: null as number[][] | null, palm: null as number[] | null, palmGun: null as number[] | null,
    curlGrip: 0, curlOff: 0, grab: false, head: null as { p: V3; q: THREE.Quaternion } | null, bore: null as number[] | null,
    zone: null as string | null, ratios: null as Record<string, number> | null, zonesCam: [] as (McZone & { label: string; color: number })[], fps: 0,
  };
  let magMode: 'in' | 'hand' | 'gone' = 'in', pullFrom: number | null = null, holding = false, magGrabbed = false;
  const grabs = MM.grabber(), headQ = new T.Quaternion(); let haveHead = false;
  const camPts = (world: number[][], k: number) => world.map((p) => [p[0] * k, -p[1] * k, -p[2] * k]);

  function process(raw: McRaw) {
    const t = raw.t, dt = Math.min(0.2, Math.max(1e-3, t - live.t)); live.fps += (1 / Math.max(1e-3, t - live.t) - live.fps) * 0.1; live.t = t;
    // the body
    let body: number[][] | null = null, bodyRaw: number[][] | null = null;
    if (raw.pose) {
      const w = camPts(raw.pose.world, 1), tr = MM.solveT(w, raw.pose.img, tanH, tanV, raw.pose.vis.map((v) => (v > 0.5 ? v : 0)));
      if (tr) { bodyRaw = w.map((p) => MM.add(p, tr)); body = fBody.filter(bodyRaw.map((p) => MM.mul(p, bodyK)), t); }
    }
    // the hands: each to the side of the body whose wrist it is at (the model's own "Left"/"Right" when there is no body to go by)
    let grip: number[][] | null = null, off: number[][] | null = null;
    const gripSide = S.lefty ? 'Left' : 'Right';
    const seen: { side: string; pts: number[][]; d: number }[] = [];
    for (const h of raw.hands) {
      const w = camPts(h.world, S.handScale), tr = MM.solveT(w, h.img, tanH, tanV);
      if (!tr) continue;
      let side = h.label, d = 0;
      if (raw.pose && raw.pose.vis[15] > 0.3 && raw.pose.vis[16] > 0.3) {
        const dl = Math.hypot((h.img[0][0] - raw.pose.img[15][0]) * aspect, h.img[0][1] - raw.pose.img[15][1]), dr = Math.hypot((h.img[0][0] - raw.pose.img[16][0]) * aspect, h.img[0][1] - raw.pose.img[16][1]);
        side = dl < dr ? 'Left' : 'Right'; d = Math.min(dl, dr);
      }
      seen.push({ side, pts: w.map((p) => MM.add(p, tr)), d });
    }
    if (seen.length === 2 && seen[0].side === seen[1].side) seen[seen[0].d <= seen[1].d ? 1 : 0].side = seen[0].side === 'Left' ? 'Right' : 'Left'; // (both at one wrist: the further is the other's)
    for (const h of seen) {
      const w = bodyRaw && raw.pose!.vis[h.side === 'Left' ? 15 : 16] > 0.5 ? bodyRaw[h.side === 'Left' ? 15 : 16] : null, k = w ? w[2] / h.pts[0][2] : 0;
      if (S.bodyDepth) {
        if (k > 0.4 && k < 2.5) handK[h.side] = handK[h.side] === null ? k : handK[h.side]! + (k - handK[h.side]!) * (1 - Math.exp(-dt / 0.25));
        if (handK[h.side] !== null) h.pts = h.pts.map((p) => MM.mul(p, handK[h.side]!));
      } else if (k > 0.5 && k < 2) bodyK += (1 / k - bodyK) * 0.03;
      if (h.side === gripSide) grip = fGrip.filter(h.pts, t); else off = fOff.filter(h.pts, t);
    }
    if (S.bodyDepth) bodyK = 1;
    live.body = body; live.grip = grip; live.off = off;
    if (grip) live.curlGrip = MM.curl(grip);
    if (off) live.curlOff = MM.curl(off);

    // the gun: in the grip hand, or where it was against the chest
    const chest = body ? torsoM(body) : null;
    if (gun) {
      if (grip && !S.lock) {
        const f = handFrame(grip, !S.lefty), q = f.q.multiply(trimQ());
        if (haveGun) gunQ.slerp(q, 0.5); else gunQ.copy(q);
        const at = vec(MM.add(f.c, MM.mul(f.n, INSET))).sub(gun.rig.A.G.clone().applyQuaternion(gunQ));
        gunM.compose(at, gunQ, new T.Vector3(1, 1, 1)); haveGun = true;
        if (chest) lockM = chest.clone().invert().multiply(gunM);
      } else if (chest) {
        gunM.multiplyMatrices(chest, lockM || (lockM = readyM())); gunQ.setFromRotationMatrix(gunM); haveGun = true;
      }
      gunRoot.visible = haveGun;
      if (haveGun) { gunRoot.matrixAutoUpdate = false; gunRoot.matrix.copy(gunM); gunRoot.matrixWorldNeedsUpdate = true; gunInv.copy(gunM).invert(); }
    }

    // the zones, in the camera's space
    const zc: typeof live.zonesCam = [];
    if (gun) for (const z of gun.zones) {
      const m = z.frame === 'gun' ? (haveGun ? gunM : null) : chest;
      if (!m) continue;
      zc.push({ id: z.id, label: z.label, color: z.color, r: z.r, a: arr(vec(z.a).applyMatrix4(m)), b: arr(vec(z.b).applyMatrix4(m)) });
    }
    live.zonesCam = zc;

    // the support hand: which zone it is in
    const was = track.zone, held = grabs.held;
    live.grab = grabs.step(off ? live.curlOff : null);
    if (off && zc.length) {
      const f = handFrame(off, S.lefty);
      live.palm = f.c; live.palmGun = haveGun ? arr(vec(f.c).applyMatrix4(gunInv)) : null;
      const r: Record<string, number> = {};
      for (const z of zc) r[z.id] = MM.zoneRatio(f.c, z, S.depthK);
      live.ratios = r; live.zone = track.step(t, r);
    } else { live.palm = live.palmGun = null; live.ratios = null; live.zone = track.step(t, null); }
    if (live.zone !== was) zoneChange(was, live.zone);
    if (live.grab !== held) grabChange(live.grab);
    parts();
    head(body, chest);
    character(body, grip, off);

    // takes
    const s: McSample = { t, zone: live.zone, p: live.palmGun, g: live.grab };
    if (manual) manual.samples.push(s);
    else if (S.auto && source !== 'take') {
      const e = cutter.step(s);
      if (e && e.kind === 'end') addTake(e.take, false);
    }
    if (source !== 'take') { ring.push(raw); while (ring.length && t - ring[0].t > 40) ring.shift(); }
  }
  /**
   * The magazine goes with the hand that takes it. With grabs on: out of the gun when the hand closed on it there and leaves closed; let go at the rig or the
   * belt when the hand opens there (stowed), a fresh one when it closes there; seated as a hand holding one comes to the well. With grabs off, by the zones alone:
   * out as the hand leaves it, away at the rig, a fresh one from there, in as the hand comes back.
   */
  function zoneChange(from: string | null, to: string | null) {
    const pouch = (z: string | null) => z === 'rig' || z === 'belt';
    if (!S.grabs) {
      if (from === 'mag' && to !== 'support') magMode = 'hand';
      if (pouch(to)) magMode = 'gone';
      if (pouch(from) && !pouch(to)) magMode = 'hand';
      if (to === 'mag' || to === 'support') magMode = 'in';
      pullFrom = to === 'action' && live.palmGun ? live.palmGun[2] : null;
      return;
    }
    if (from === 'mag') { if (magGrabbed && live.grab && magMode === 'in') { magMode = 'hand'; holding = true; } magGrabbed = false; }
    if (to === 'mag' && holding) { magMode = 'in'; holding = false; }
    if (to === 'support') { magMode = 'in'; holding = false; }
    pullFrom = to === 'action' && live.grab && live.palmGun ? live.palmGun[2] : null; // (a hand that comes to the handle already closed has it)
  }
  function grabChange(closed: boolean) {
    if (!S.grabs) return;
    const z = live.zone;
    if (z === 'mag' && closed && magMode === 'in' && !holding) magGrabbed = true;
    if (z === 'rig' || z === 'belt') { if (!closed && holding) { magMode = 'gone'; holding = false; } else if (closed && !holding) { magMode = 'hand'; holding = true; } }
    if (z === 'action') pullFrom = closed && live.palmGun ? live.palmGun[2] : null;
  }
  /**
   * The head: the eyes' place and the way the face is turned, from the body's points (the ears give its left and right, the eyes ahead of them its front; the
   * eyes sit above the ears' middle, so the line from one to the other is tipped back down by EYE_TILT). With no face to go by (the ears on top of each other), the chest's.
   */
  const EYE_TILT = 13 * D2R;
  function head(b: number[][] | null, chest: THREE.Matrix4 | null) {
    if (!b || !chest) { live.head = haveHead ? live.head : null; return; }
    const eL = vec(b[7]), eR = vec(b[8]), ears = eL.clone().add(eR).multiplyScalar(0.5), eyes = vec(b[2]).add(vec(b[5])).multiplyScalar(0.5);
    const x = eR.clone().sub(eL), f = eyes.clone().sub(ears), q = new T.Quaternion();
    let p = eyes;
    if (x.length() > 0.06 && f.length() > 0.03) {
      x.normalize(); f.addScaledVector(x, -f.dot(x)).normalize();
      const z = f.clone().negate(), y = new T.Vector3().crossVectors(z, x);
      q.setFromRotationMatrix(new T.Matrix4().makeBasis(x, y, z)).multiply(new T.Quaternion().setFromAxisAngle(new T.Vector3(1, 0, 0), -EYE_TILT));
    } else { q.setFromRotationMatrix(chest); p = new T.Vector3(0, 0.2, -0.08).applyMatrix4(chest); }
    if (haveHead) headQ.slerp(q, 0.25); else headQ.copy(q);
    haveHead = true; live.head = { p, q: headQ };
    // the bore against the view: how far right and how far up of the view's middle the gun points, degrees
    if (haveGun) {
      const d = new T.Vector3(0, 0, -1).applyQuaternion(gunQ).applyQuaternion(viewQ().invert());
      live.bore = [Math.atan2(d.x, -d.z) / D2R, Math.atan2(d.y, Math.hypot(d.x, d.z)) / D2R];
    } else live.bore = null;
  }
  const viewQ = () => headQ.clone().multiply(new T.Quaternion().setFromAxisAngle(new T.Vector3(1, 0, 0), -S.fpPitch * D2R));
  /** The character laid on the body: the ragdoll's sixteen points from the camera's thirty-three, its hands on yours (Rig.poseAt). */
  function character(b: number[][] | null, grip: number[][] | null, off: number[][] | null) {
    if (!man) return;
    man.root.visible = !!b && S.character;
    if (!b || !S.character) return;
    const v = (i: number) => vec(b[i]), mid = (i: number, j: number) => v(i).add(v(j)).multiplyScalar(0.5);
    const sh = mid(11, 12), hip = mid(23, 24), up = sh.clone().sub(hip).normalize();
    const P = [hip, v(23), v(24), hip.clone().lerp(sh, 0.8), v(11), v(12), sh.clone().addScaledVector(up, 0.06), mid(7, 8), v(13), v(14), v(15), v(16), v(25), v(26), v(27), v(28)];
    const hand = (pts: number[][] | null, right: boolean, c: number) => {
      if (!pts) return null;
      const f = handFrame(pts, right);
      return { at: vec(f.c), n: vec(f.n), f: vec(MM.norm(MM.sub(pts[9], pts[0]))), curl: c };
    };
    const g = hand(grip, !S.lefty, Math.max(live.curlGrip, haveGun && !S.lock ? 0.7 : 0)), o = hand(off, S.lefty, live.curlOff); // (the grip hand: round the grip while it has the gun)
    G_Rig.poseAt(man, P, sh, S.lefty ? [o, g] : [g, o]);
  }
  function parts() {
    if (!gun) return;
    const { an, A } = gun.rig;
    if (an.mag && A.magHome && A.WB && A.W) {
      an.mag.visible = magMode !== 'gone';
      if (magMode === 'hand' && live.palmGun) an.mag.position.copy(vec(live.palmGun)).sub(A.WB).add(A.magHome); else an.mag.position.copy(A.magHome);
    }
    // the charging handle (or the bolt handle) drawn back as far as the hand has come back since it took it
    const h = an.ch || an.handle, home = an.ch ? A.chHome : A.handleHome;
    if (h && home) h.position.copy(home).setZ(home.z + (pullFrom !== null && live.palmGun ? Math.min(gun.rig.travel || 0.07, Math.max(0, live.palmGun[2] - pullFrom)) : 0));
  }

  // ---------------------------------------------------------------- the game's own reload, as a take
  let ref: McRef | null = null;
  /**
   * The game's clip for this gun (VMAnim.reloadPose, and the action after it when run dry: VMAnim.actPose), sampled 240 times and put through the same
   * zones as a mimed take, so the two are read alike. The pouch the clip reaches for is put where the chest rig is with the gun at the ready.
   */
  function reference() {
    ref = null;
    if (!gun) return;
    const { def, rig } = gun, how = S.how, rd = readyM(), toGun = rd.clone().invert();
    const rz = gun.zones.find((z) => z.id === 'rig')!, side = S.lefty ? 1 : -1;
    const pouch = vec(MM.lerp(rz.a, rz.b, 0.5 + 0.25 * side)).applyMatrix4(toGun);
    rig.A.P = pouch; gun.anchors['A.P'] = arr(pouch);
    const zs: McZone[] = gun.zones.map((z) => (z.frame === 'gun' ? z : { id: z.id, r: z.r, a: arr(vec(z.a).applyMatrix4(toGun)), b: arr(vec(z.b).applyMatrix4(toGun)) }));
    if (VMAnim.kinds(def).reload !== 'mag' || !VMAnim.reloadPose(0, rig, def, how)) { drawGhost(); timeline(); return; }
    const slap = VMAnim.isSlap(def), act = S.empty && !slap && VMAnim.kinds(def).action ? (boltHold(def) ? 'release' : 'rack') : null;
    const K = (slap ? Me.SLAP_K : Me.RELOAD_K) as Record<string, number>, seat = act ? (Me.SEAT as Record<string, number>)[how] || 0.7 : 1;
    let magT = def.reload * K[how] * seat, actT = 0;
    if (act) { actT = Me.actDur(def, act as any, true); magT = Math.max(magT * 0.6, magT - (actT - (Me.ACT_T.was as Record<string, number>)[act])); } // (js/player.ts reloadTimes)
    const tr = MM.tracker({ hold: 0 }), samples: McSample[] = [], N = 240;
    const put = (t: number, L: V3 | null) => { const p = arr(L || rig.A.S), r: Record<string, number> = {}; for (const z of zs) r[z.id] = MM.zoneRatio(p, z, 1); samples.push({ t, zone: tr.step(t, r), p }); };
    for (let i = 0; i <= N; i++) put(i / N * magT, VMAnim.reloadPose(i / N, rig, def, how, act ? seat : undefined)!.L);
    if (act) for (let i = 1; i <= N / 2; i++) { const p = VMAnim.actPose(i / (N / 2), rig, def, act as 'rack' | 'release', true); put(magT + i / (N / 2) * actT, p && p.L); }
    // from the hand leaving the handguard to its return, as a mimed take is cut
    const i0 = samples.findIndex((q) => q.zone !== 'support');
    let i1 = samples.length - 1; while (i1 > 0 && samples[i1].zone === 'support') i1--;
    const t0 = i0 > 0 ? samples[i0].t : 0, t1 = samples[Math.min(samples.length - 1, i1 + 1)].t;
    ref = { how, empty: !!act, act, label: (how === 'floor' ? 'dropped' : how === 'retain' ? 'retained' : 'to the dump pouch') + (act ? ', run dry (+ ' + act + ')' : '') + (slap ? ', slap' : ''), take: MM.cut(samples, t0, t1, 'support') };
    drawGhost(); timeline();
  }
  function line(pts: number[][], color: number, old: THREE.Line | null) {
    if (old) { old.parent && old.parent.remove(old); old.geometry.dispose(); (old.material as THREE.Material).dispose(); }
    if (pts.length < 2 || !gun) return null;
    const l = new T.Line(new T.BufferGeometry().setFromPoints(pts.map(vec)), new T.LineBasicMaterial({ color, transparent: true, opacity: 0.9, depthTest: false }));
    l.renderOrder = 3; gun.group.add(l);
    return l;
  }
  function drawGhost() { ghost = line(ref && S.showGhost ? ref.take.samples.filter((q) => q.t >= ref!.take.t0 && q.t <= ref!.take.t1).map((q) => q.p!) : [], 0xffc04a, ghost); }
  function drawTrail() { const k = shown(); trail = line(k ? k.take.samples.filter((q) => q.p && q.t >= k.take.t0 && q.t <= k.take.t1).map((q) => q.p!) : [], 0x6dff8a, trail); }

  // ---------------------------------------------------------------- takes
  const ring: McRaw[] = [], takeList: McTakeRec[] = [];
  let takeN = 0, sel = -1, manual: { t0: number; samples: McSample[] } | null = null;
  const shown = () => takeList.find((k) => k.id === sel) || null;
  function addTake(take: McTake, byHand: boolean) {
    const raw = ring.filter((r) => r.t >= take.t0 - 0.6 && r.t <= take.t1 + 0.6);
    const rec: McTakeRec = { id: ++takeN, name: 'Take ' + takeN, gun: gun ? gun.id : '', aspect, take, raw, manual: byHand };
    takeList.push(rec); if (takeList.length > 30) takeList.shift();
    sel = rec.id; listTakes(); drawTrail(); timeline();
    return rec;
  }
  /** Space: a take begun and ended by hand (for a reload that does not start and end on the handguard). */
  function toggleManual() {
    if (source === 'take' || source === 'none') return;
    if (!manual) { manual = { t0: live.t, samples: [] }; status(); return; }
    const m = manual; manual = null;
    if (live.t - m.t0 > 0.2) addTake(MM.cut(m.samples, m.t0, live.t, null), true);
    cutter.reset(); status();
  }
  const round = (x: number, n = 4) => +x.toFixed(n);
  function exportTake(rec: McTakeRec) {
    const tk = rec.take, keys = gun ? MM.keysOf(tk.samples, tk.t0, tk.t1, gun.anchors) : [];
    return {
      format: 'breach-protocol reload mocap', version: 1, name: rec.name, gun: rec.gun, aspect: rec.aspect, manual: rec.manual,
      settings: { fov: S.fov, lefty: S.lefty, depthK: S.depthK, handScale: S.handScale, gripPitch: S.gripPitch, gripYaw: S.gripYaw, zoneScale: S.zoneScale },
      duration: round(tk.dur, 3),
      beats: tk.visits.map((v) => ({ zone: v.zone, in: round(v.t0, 3), out: round(v.t1, 3), f0: round(v.f0, 3), f1: round(v.f1, 3), grab: v.g0 === null ? null : round(v.g0, 3), release: v.g1 === null ? null : round(v.g1, 3) })),
      keys: keys.map((k) => ({ f: round(k.f, 3), t: round(k.t, 3), p: k.p.map((x) => round(x)), near: k.near, off: k.off && k.off.map((x) => round(x)) })),
      keysText: MM.keysText(keys),
      // the support hand's palm in the gun's space (x right, y up, z back, metres), from the take's start: [t, x, y, z, zone, closed (1) or open (0)]
      path: tk.samples.filter((q) => q.t >= tk.t0 && q.t <= tk.t1).map((q) => [round(q.t - tk.t0, 3), ...(q.p ? q.p.map((x) => round(x)) : [null, null, null]), q.zone, q.g ? 1 : 0]),
      game: ref ? { reload: ref.label, duration: round(ref.take.dur, 3), beats: ref.take.visits.map((v) => ({ zone: v.zone, in: round(v.t0, 3), out: round(v.t1, 3), f0: round(v.f0, 3), f1: round(v.f1, 3) })) } : null,
      t0: round(tk.t0 - (rec.raw.length ? rec.raw[0].t : tk.t0), 3),
      // what the landmark models said, frame by frame, from 0.6 s before: the take plays back (and is read again, with other settings) from this
      raw: rec.raw.map((r) => ({ t: round(r.t - rec.raw[0].t, 3), pose: r.pose && { img: r.pose.img.map((p) => p.map((x) => round(x))), world: r.pose.world.map((p) => p.map((x) => round(x))), vis: r.pose.vis.map((x) => round(x, 2)) }, hands: r.hands.map((h) => ({ label: h.label, img: h.img.map((p) => p.map((x) => round(x))), world: h.world.map((p) => p.map((x) => round(x))) })) })),
    };
  }
  /** A take's file read back: its frames go through the page again as they came (so today's settings and zones apply), and the take is cut where it was. */
  async function importTake(j: any) {
    if (!j || !Array.isArray(j.raw) || !j.raw.length) throw new Error('not a take file');
    if (j.gun && (!gun || gun.id !== j.gun) && Gunsmith.PLATFORMS[j.gun]) { await setGun(j.gun); $('gun').value = j.gun; }
    const rec: McTakeRec = { id: ++takeN, name: j.name || 'Loaded take', gun: j.gun || '', aspect: j.aspect || 16 / 9, take: MM.cut([], j.t0 || 0, (j.t0 || 0) + (j.duration || 0), null), raw: j.raw, manual: j.manual !== false };
    takeList.push(rec); sel = rec.id; listTakes();
    play(rec);
  }

  // ---------------------------------------------------------------- where the frames come from
  let source: 'none' | 'cam' | 'file' | 'demo' | 'take' = 'none';
  let landmarkers: { pose: any; hands: any } | null = null, loading: Promise<void> | null = null, lastVT = -1, lastRawT = -1e9;
  let playing: { rec: McTakeRec; at: number; i: number; samples: McSample[] } | null = null;
  function resetTracking() { fBody.reset(); fGrip.reset(); fOff.reset(); track = MM.tracker(); cutter = MM.takes({ home: 'support' }); handK.Left = handK.Right = null; grabs.reset(); haveHead = false; holding = magGrabbed = false; haveGun = false; magMode = 'in'; pullFrom = null; manual = null; }
  /** The landmark models, fetched the first time a camera or a video is used: on the GPU where the browser lets them, else the CPU. */
  function loadModels(): Promise<void> {
    return loading || (loading = (async () => {
      say('Loading the pose and hand models (about 20 MB, once)…');
      const url = MP + '/vision_bundle.mjs', v: any = await import(url);
      const files = await v.FilesetResolver.forVisionTasks(MP + '/wasm');
      const make = async (delegate: string) => ({
        pose: await v.PoseLandmarker.createFromOptions(files, { baseOptions: { modelAssetPath: POSE_MODEL, delegate }, runningMode: 'VIDEO', numPoses: 1 }),
        hands: await v.HandLandmarker.createFromOptions(files, { baseOptions: { modelAssetPath: HAND_MODEL, delegate }, runningMode: 'VIDEO', numHands: 2, minHandDetectionConfidence: 0.4, minHandPresenceConfidence: 0.4, minTrackingConfidence: 0.4 }),
      });
      try { landmarkers = await make('GPU'); } catch (e) { console.warn('[mocap] no GPU delegate, using the CPU: ' + e); landmarkers = await make('CPU'); }
      say('');
    })().catch((e) => { loading = null; say('The landmark models did not load (they come from cdn.jsdelivr.net and storage.googleapis.com): ' + (e && e.message || e)); throw e; }));
  }
  const pt = (l: any) => [l.x, l.y, l.z];
  function detect(video: HTMLVideoElement, now: number): McRaw {
    const pr = landmarkers!.pose.detectForVideo(video, now), hr = landmarkers!.hands.detectForVideo(video, now);
    const pose = pr.landmarks && pr.landmarks[0] && pr.worldLandmarks[0] ? { img: pr.landmarks[0].map(pt), world: pr.worldLandmarks[0].map(pt), vis: pr.landmarks[0].map((l: any) => (l.visibility === undefined ? 1 : l.visibility)) } : null;
    const hands = (hr.landmarks || []).map((lm: any, i: number) => ({ img: lm.map(pt), world: hr.worldLandmarks[i].map(pt), label: ((hr.handedness || hr.handednesses)[i][0] || {}).categoryName || 'Right' }));
    return { t: now / 1000, pose, hands };
  }
  function stopSource() {
    const v = $('video') as HTMLVideoElement;
    if (v.srcObject) { for (const tr of (v.srcObject as MediaStream).getTracks()) tr.stop(); v.srcObject = null; }
    v.pause(); v.removeAttribute('src'); v.load();
    source = 'none'; playing = null; resetTracking(); status();
  }
  async function startCamera() {
    stopSource();
    await loadModels();
    const v = $('video') as HTMLVideoElement;
    v.srcObject = await navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30 } }, audio: false });
    await v.play(); setAspect(v.videoWidth / v.videoHeight); source = 'cam'; status();
  }
  async function startFile(file: Blob) {
    stopSource();
    await loadModels();
    const v = $('video') as HTMLVideoElement;
    v.src = URL.createObjectURL(file); v.loop = true; v.muted = true;
    await v.play(); setAspect(v.videoWidth / v.videoHeight); source = 'file'; status();
  }
  function startDemo() { stopSource(); setAspect(16 / 9); source = 'demo'; demoT0 = -1; status(); }
  function play(rec: McTakeRec) {
    stopSource(); setAspect(rec.aspect); sel = rec.id;
    playing = { rec, at: -1, i: 0, samples: [] }; source = 'take'; listTakes(); status();
  }

  // ---------------------------------------------------------------- the demo: a reload mimed by nobody
  // A body, a grip hand and a support hand made up from the gun's own zones, turned into what the landmark models would say of them (points on the picture,
  // points about their centres), so the whole page runs from there on as it does from a camera: the place to see what it does before you stand up.
  let demoT0 = -1;
  /** A right hand closed by `curl` (0 flat .. 1 a fist): wrist at 0, the palm facing +z, the knuckles' line along +x (little finger to first), metres. */
  function template(curl: number) {
    const mcp = [[0.025, 0.09, 0], [0.003, 0.095, 0], [-0.017, 0.088, 0], [-0.035, 0.078, 0]], bone = [0.042, 0.026, 0.021], bend = [80, 100, 70];
    const p: number[][] = [[0, 0, 0], [0.025, 0.02, 0.01], [0.045, 0.045, 0.02], [0.05, 0.068, 0.034], [0.04 + 0.02 * (1 - curl), 0.085, 0.045 - 0.02 * (1 - curl)]];
    for (const m of mcp) {
      p.push(m);
      let at = m, a = 0;
      for (let k = 0; k < 3; k++) { a += bend[k] * curl * D2R; at = [at[0], at[1] + bone[k] * Math.cos(a), at[2] + bone[k] * Math.sin(a)]; p.push(at); }
    }
    return p;
  }
  /** A hand's 21 points with its palm's centre at c and its frame (handFrame's q) turned to q, closed by curl. */
  function fist(right: boolean, c: number[], q: THREE.Quaternion, curl: number) {
    const t0 = template(curl), tp = right ? t0 : t0.map((p) => [-p[0], p[1], p[2]]), f = handFrame(tp, right), r = q.clone().multiply(f.q.invert());
    return tp.map((p) => arr(vec(MM.sub(p, f.c)).applyQuaternion(r).add(vec(c))));
  }
  function elbow(sh: V3, wr: V3, pole: V3) {
    const l1 = 0.29, l2 = 0.27, d = wr.clone().sub(sh), L = Math.min(l1 + l2 - 1e-3, d.length()), dir = d.normalize();
    const a = (l1 * l1 - l2 * l2 + L * L) / (2 * L), h = Math.sqrt(Math.max(0, l1 * l1 - a * a));
    const side = pole.clone().addScaledVector(dir, -pole.dot(dir)).normalize();
    return sh.clone().addScaledVector(dir, a).addScaledVector(side, h);
  }
  const sm = (a: number, b: number, t: number) => { t = Math.min(1, Math.max(0, (t - a) / (b - a))); return t * t * (3 - 2 * t); };
  /** The demo's beats, seconds: the support hand's stops and when it is at each. */
  const DEMO_BEATS: [number, number, string][] = [[0, 1.3, 'support'], [1.75, 2.0, 'mag'], [2.55, 2.95, 'rig'], [3.5, 3.75, 'mag'], [4.2, 4.5, 'action'], [5.0, 6.5, 'support']];
  // and how closed the support hand is, [second, curl]: round the handguard, open on the way, closed on the magazine and out with it, open at the rig (the old one
  // stowed) and closed again (a fresh one), open once it is seated, closed on the handle while it is drawn
  const DEMO_CURL = [[0, 0.45], [1.3, 0.45], [1.6, 0.1], [1.8, 0.1], [1.95, 0.9], [2.6, 0.9], [2.7, 0.1], [2.8, 0.1], [2.9, 0.9], [3.6, 0.9], [3.72, 0.1], [4.15, 0.1], [4.24, 0.9], [4.5, 0.9], [4.62, 0.1], [5, 0.45], [6.5, 0.45]];
  function demoRaw(t: number): McRaw {
    const side = S.lefty ? -1 : 1, T6 = DEMO_BEATS[DEMO_BEATS.length - 1][1], u = t % T6;
    // the chest: turned so the camera sees the support side, swaying a little
    const yaw = (S.lefty ? 50 : -50) * D2R + 0.03 * Math.sin(t * 0.9), o = new T.Vector3(0.05 * side, 0.22 + 0.006 * Math.sin(t * 1.7), -1.9);
    const F = new T.Vector3(Math.sin(yaw), 0, Math.cos(yaw)), X = new T.Vector3().crossVectors(F, new T.Vector3(0, 1, 0)), chest = new T.Matrix4().makeBasis(X, new T.Vector3(0, 1, 0), F.clone().negate()).setPosition(o);
    const at = (x: number, y: number, z: number) => new T.Vector3(x, y, z).applyMatrix4(chest);
    const gm = chest.clone().multiply(readyM()), gq = new T.Quaternion().setFromRotationMatrix(gm);
    const A = gun!.rig.A, inGun = (p: number[]) => vec(p).applyMatrix4(gm);
    // the grip hand: where handFrame would have to find it for the gun to be there
    const hq = gq.clone().multiply(trimQ().invert()), nG = new T.Vector3(S.lefty ? 1 : -1, 0, 0).applyQuaternion(hq);
    const gripH = fist(!S.lefty, arr(inGun(arr(A.G)).addScaledVector(nG, -INSET)), hq, 0.9);
    // the support hand: from stop to stop
    const zone = (id: string) => gun!.zones.find((z) => z.id === id);
    const stop = (id: string): V3 => {
      const z = zone(id) || zone('support')!;
      if (id === 'mag') return inGun(MM.lerp(z.a, z.b, 0.75));
      if (id === 'rig') return at(-0.07 * side, -0.3, -0.19);
      return z.frame === 'gun' ? inGun(z.a) : at(z.a[0], z.a[1], z.a[2]);
    };
    let p = stop('support');
    for (let i = 0; i < DEMO_BEATS.length - 1; i++) {
      const [, e, a] = DEMO_BEATS[i], [s2, , b] = DEMO_BEATS[i + 1];
      if (u >= e) { p = stop(a).lerp(stop(b), sm(e, s2, u)); if (u < s2) p.y -= 0.03 * Math.sin(Math.PI * sm(e, s2, u)); }
    }
    if (u > 4.25 && u < 4.5) p.add(new T.Vector3(0, 0, 0.06 * Math.sin(Math.PI * (u - 4.25) / 0.25)).applyQuaternion(gq)); // (the handle drawn back)
    const offQ = new T.Quaternion().setFromRotationMatrix(chest).multiply(new T.Quaternion().setFromEuler(new T.Euler(0.3, side * 1.2, side * 0.4)));
    let ci = 0; while (ci < DEMO_CURL.length - 2 && u > DEMO_CURL[ci + 1][0]) ci++;
    const offH = fist(S.lefty, arr(p), offQ, DEMO_CURL[ci][1] + (DEMO_CURL[ci + 1][1] - DEMO_CURL[ci][1]) * Math.min(1, Math.max(0, (u - DEMO_CURL[ci][0]) / (DEMO_CURL[ci + 1][0] - DEMO_CURL[ci][0]))));
    // the body's 33: shoulders, elbows, wrists, hips, knees, ankles, the rest at their nearest
    const Ls = at(-0.19, 0, 0), Rs = at(0.19, 0, 0), Lh = at(-0.11, -0.5, 0), Rh = at(0.11, -0.5, 0);
    // the head: turned to look down the gun, a little alive
    const hm = chest.clone().multiply(new T.Matrix4().makeRotationY(((gun!.pistol ? 3 : READY_YAW) * side + 2 * Math.sin(t * 0.6)) * D2R).setPosition(0, 0.2, -0.03));
    const hd = (x: number, y: number, z: number) => new T.Vector3(x, y, z).applyMatrix4(hm), nose = hd(0, -0.015, -0.11);
    const wrR = vec((S.lefty ? offH : gripH)[0]), wrL = vec((S.lefty ? gripH : offH)[0]), down = new T.Vector3(0, -1, 0);
    const B: V3[] = [];
    for (let i = 0; i < 33; i++) B.push(nose);
    B[11] = Ls; B[12] = Rs; B[13] = elbow(Ls, wrL, down.clone().addScaledVector(X, -0.5)); B[14] = elbow(Rs, wrR, down.clone().addScaledVector(X, 0.5)); B[15] = wrL; B[16] = wrR;
    for (const i of [17, 19, 21]) B[i] = wrL; for (const i of [18, 20, 22]) B[i] = wrR;
    B[23] = Lh; B[24] = Rh; B[25] = at(-0.11, -0.95, -0.03); B[26] = at(0.11, -0.95, -0.03); B[27] = at(-0.11, -1.38, 0); B[28] = at(0.11, -1.38, 0);
    for (const i of [29, 31]) B[i] = B[27]; for (const i of [30, 32]) B[i] = B[28];
    for (const i of [1, 2, 3]) B[i] = hd(-0.032, 0.02, -0.085); for (const i of [4, 5, 6]) B[i] = hd(0.032, 0.02, -0.085);
    B[7] = hd(-0.075, 0, 0); B[8] = hd(0.075, 0, 0);
    // as the models would say it
    const say3 = (pts: number[][], c: number[]) => ({ img: pts.map((q) => [...MM.project(q, tanH, tanV), 0]), world: pts.map((q) => [q[0] - c[0], -(q[1] - c[1]), -(q[2] - c[2])]) });
    const mid = (pts: number[][]) => pts.reduce((s, q) => MM.add(s, q), [0, 0, 0]).map((x) => x / pts.length);
    const body = B.map(arr), hip = MM.mul(MM.add(body[23], body[24]), 0.5);
    return {
      t: 0,
      pose: { ...say3(body, hip), vis: body.map((_, i) => (i >= 25 ? 0.3 : 1)) },
      hands: [{ ...say3(gripH, mid(gripH)), label: S.lefty ? 'Left' : 'Right' }, { ...say3(offH, mid(offH)), label: S.lefty ? 'Right' : 'Left' }],
    };
  }

  // ---------------------------------------------------------------- every frame
  function frame(now: number) {
    requestAnimationFrame(frame);
    const t = now / 1000;
    try {
      if (source === 'demo' && gun) {
        if (demoT0 < 0) demoT0 = t;
        if (t - lastRawT >= 1 / 31) { lastRawT = t; const r = demoRaw(t - demoT0); r.t = t; process(r); }
      } else if (source === 'take' && playing) {
        const raw = playing.rec.raw, dur = raw[raw.length - 1].t - raw[0].t + 0.5;
        if (playing.at < 0 || t - playing.at > dur) { playing.at = t; playing.i = 0; playing.samples = []; resetTracking(); }
        while (playing.i < raw.length && raw[playing.i].t - raw[0].t <= t - playing.at) {
          const r = raw[playing.i++]; process({ ...r, t: playing.at + (r.t - raw[0].t) });
          playing.samples.push({ t: r.t, zone: live.zone, p: live.palmGun, g: live.grab });
          if (playing.i === raw.length) recut(playing.rec, playing.samples); // (read again from its frames: the take as today's settings and zones have it)
        }
      } else if ((source === 'cam' || source === 'file') && landmarkers) {
        const v = $('video') as HTMLVideoElement;
        if (v.readyState >= 2 && v.currentTime !== lastVT) { lastVT = v.currentTime; process(detect(v, now)); }
      }
    } catch (e) { console.error(e); say(String(e && (e as Error).message || e)); }
    draw();
  }
  /** A played take's analysis, redone from its frames over the span it was cut at (its times are its frames' clock). */
  function recut(rec: McTakeRec, samples: McSample[]) {
    rec.take = MM.cut(samples, rec.take.t0, rec.take.t1, rec.manual ? null : 'support');
    if (rec.id === sel) { listTakes(); drawTrail(); timeline(); }
  }

  // ---------------------------------------------------------------- drawing
  const POSE_BONES = [[11, 12], [11, 13], [13, 15], [12, 14], [14, 16], [11, 23], [12, 24], [23, 24], [23, 25], [24, 26], [25, 27], [26, 28]];
  const HAND_BONES = [[0, 1], [1, 2], [2, 3], [3, 4], [0, 5], [5, 6], [6, 7], [7, 8], [5, 9], [9, 10], [10, 11], [11, 12], [9, 13], [13, 14], [14, 15], [15, 16], [13, 17], [17, 18], [18, 19], [19, 20], [0, 17]];
  const hex = (c: number) => '#' + c.toString(16).padStart(6, '0');
  function draw() {
    // the zones' meshes, where they are now
    for (const [id, m] of zoneMesh) {
      const z = live.zonesCam.find((q) => q.id === id);
      m.visible = !!z && S.showZones;
      if (!z) continue;
      const a = vec(z.a), b = vec(z.b);
      m.position.copy(a).add(b).multiplyScalar(0.5);
      if (a.distanceToSquared(b) > 1e-8) m.quaternion.setFromUnitVectors(new T.Vector3(0, 1, 0), b.sub(a).normalize());
      (m.material as THREE.MeshBasicMaterial).opacity = live.zone === id ? 0.42 : 0.12;
    }
    $('gl').style.transform = $('video').style.transform = S.mirror ? 'scaleX(-1)' : '';
    $('gl').style.opacity = String(S.opacity);
    if (laser) laser.visible = S.laser;
    firstPerson();
    grid.visible = false;
    renderer.render(scene, camera);
    // the skeleton, the names and the state, on the flat canvas (its own mirror: its text reads the right way)
    const c = ctx2, W = c.canvas.width, H = c.canvas.height, k = W / Math.max(1, $('stage').clientWidth);
    c.clearRect(0, 0, W, H);
    const px = (p: number[]) => { const [u, v] = MM.project(p, tanH, tanV); return [(S.mirror ? 1 - u : u) * W, v * H]; };
    const bones = (pts: number[][], list: number[][], col: string, w: number) => {
      c.strokeStyle = col; c.lineWidth = w * k; c.lineCap = 'round'; c.beginPath();
      for (const [i, j] of list) { const a = px(pts[i]), b = px(pts[j]); c.moveTo(a[0], a[1]); c.lineTo(b[0], b[1]); }
      c.stroke();
    };
    if (S.showBody) {
      if (live.body) bones(live.body, POSE_BONES, 'rgba(120,220,255,0.75)', 3);
      if (live.grip) bones(live.grip, HAND_BONES, 'rgba(255,255,255,0.8)', 2);
      if (live.off) bones(live.off, HAND_BONES, 'rgba(120,255,150,0.95)', 2.5);
    }
    if (live.palm && live.grab) { const p = px(live.palm); c.strokeStyle = '#fff'; c.lineWidth = 3 * k; c.beginPath(); c.arc(p[0], p[1], 13 * k, 0, 7); c.stroke(); }
    if (live.palm) { const p = px(live.palm); c.fillStyle = live.zone ? hex((ZC as Record<string, number>)[live.zone] || 0xffffff) : '#fff'; c.beginPath(); c.arc(p[0], p[1], 6 * k, 0, 7); c.fill(); }
    c.font = `600 ${12 * k}px system-ui, sans-serif`; c.textAlign = 'center'; c.textBaseline = 'middle';
    if (S.showZones) for (const z of live.zonesCam) {
      const p = px(MM.lerp(z.a, z.b, 0.5)), on = live.zone === z.id;
      c.fillStyle = 'rgba(0,0,0,0.55)'; const tw = c.measureText(z.label).width + 10 * k; c.fillRect(p[0] - tw / 2, p[1] - 9 * k, tw, 18 * k);
      c.fillStyle = on ? '#fff' : hex(z.color); c.fillText(z.label, p[0], p[1] + k);
    }
    // the bars beside the zones' names, the readout
    if (gun) for (const z of gun.zones) { const el = $('zr-' + z.id); if (el) { const r = live.ratios ? live.ratios[z.id] : null; el.style.width = (r === null || r === undefined ? 0 : Math.max(0, Math.min(1, 1.6 - r / 1.6)) * 100) + '%'; el.parentNode.parentNode.classList.toggle('on', live.zone === z.id); } }
    $('curl-grip').style.width = live.grip ? live.curlGrip * 100 + '%' : '0'; $('curl-off').style.width = live.off ? live.curlOff * 100 + '%' : '0';
    $('grab').textContent = live.grab && live.off ? 'GRAB' : '';
    const zn = gun && live.zone ? gun.zones.find((z) => z.id === live.zone) : null;
    $('now').textContent = zn ? zn.label + (live.grab ? ' · grab' : '') : live.off ? 'between' : source === 'none' ? '' : 'no support hand';
    $('now').style.color = zn ? hex(zn.color) : '';
    $('rec').textContent = manual ? 'REC ' + (live.t - manual.t0).toFixed(1) + ' s' : cutter.active && source !== 'take' ? 'take… ' + (live.t - cutter.t0).toFixed(1) + ' s' : '';
    if (source === 'take' && playing) playhead = Math.max(0, live.t - playing.at - (shown() ? shown()!.take.t0 - playing.rec.raw[0].t : 0)); else playhead = cutter.active ? live.t - cutter.t0 : manual ? live.t - manual.t0 : -1;
    $('head').style.left = playhead >= 0 && tlScale > 0 ? Math.min(100, playhead / tlScale * 100) + '%' : '-10px';
  }
  let playhead = -1, tlScale = 0;
  /**
   * The first-person view: the scene drawn again from the head (the character's own head left out, the floor in), copied onto the view's flat canvas, then
   * the point at its middle and a ring where the bore points (the laser's far end), with how far off the middle that is.
   */
  function firstPerson() {
    const c = fpCtx, W = c.canvas.width, H = c.canvas.height, k = W / Math.max(1, $('fpwrap').clientWidth);
    const hd = live.head;
    $('fpwrap').classList.toggle('idle', !hd);
    if (!hd) { c.clearRect(0, 0, W, H); return; }
    fpCam.position.copy(hd.p); fpCam.quaternion.copy(viewQ()); fpCam.updateMatrixWorld(true);
    // the floor: under the feet, level with the camera that is looking (it is taken to be held level)
    const b = live.body;
    grid.visible = true; grid.position.set(hd.p.x, b ? Math.min(b[27][1], b[28][1], hd.p.y - 1.45) : hd.p.y - 1.6, hd.p.z);
    const headOn = man ? man.head.visible : false, bg = scene.background;
    if (man) man.head.visible = false;
    scene.background = FP_BG;
    // (a zone the eye is in or at the edge of is a wall across the view: left out of this one)
    const near: THREE.Mesh[] = [];
    for (const z of live.zonesCam) { const m = zoneMesh.get(z.id); if (m && m.visible && MM.zoneDist(arr(hd.p), z, 1) < z.r + 0.06) { m.visible = false; near.push(m); } }
    renderer.render(scene, fpCam);
    for (const m of near) m.visible = true;
    scene.background = bg; if (man) man.head.visible = headOn;
    c.clearRect(0, 0, W, H); c.drawImage(renderer.domElement, 0, 0, W, H);
    // the middle of the view
    c.strokeStyle = 'rgba(0,0,0,0.7)'; c.lineWidth = 3 * k; c.fillStyle = '#fff';
    c.beginPath(); c.arc(W / 2, H / 2, 3.2 * k, 0, 7); c.stroke(); c.fill();
    // where the bore points
    const th = Math.tan(S.fpFov / 2 * D2R), tv = th / aspect;
    let note = 'no gun';
    if (live.bore && haveGun) {
      const [yaw, pitch] = live.bore;
      note = `bore ${Math.abs(yaw).toFixed(1)}° ${yaw >= 0 ? 'right' : 'left'}, ${Math.abs(pitch).toFixed(1)}° ${pitch >= 0 ? 'high' : 'low'}`;
      const d = new T.Vector3(0, 0, -1).applyQuaternion(gunQ).applyQuaternion(viewQ().invert());
      if (d.z < -0.05 && S.laser) {
        const x = (d.x / -d.z / th + 1) / 2 * W, y = (1 - d.y / -d.z / tv) / 2 * H;
        c.strokeStyle = '#ff3b3b'; c.lineWidth = 2 * k; c.beginPath(); c.arc(x, y, 9 * k, 0, 7); c.stroke();
        c.fillStyle = '#ff3b3b'; c.beginPath(); c.arc(x, y, 2 * k, 0, 7); c.fill();
      }
    }
    $('fpinfo').textContent = note;
  }

  // ---------------------------------------------------------------- the panel
  const esc = (s: string) => s.replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' } as Record<string, string>)[ch]);
  function say(msg: string) { $('msg').textContent = msg; $('msg').hidden = !msg; }
  function status() {
    $('src').textContent = source === 'cam' ? 'Camera' : source === 'file' ? 'Video file' : source === 'demo' ? 'Demo (nobody: a made-up reload)' : source === 'take' && playing ? 'Playing ' + playing.rec.name : 'No source';
    $('take').textContent = manual ? 'End take (Space)' : 'Start take (Space)';
    $('stage').classList.toggle('idle', source === 'none');
  }
  function listZones() {
    $('zones').innerHTML = gun ? gun.zones.map((z) => `<div class="zone"><span class="dot" style="background:${hex(z.color)}"></span><span class="zn">${esc(z.label)}</span><span class="bar"><i id="zr-${z.id}" style="background:${hex(z.color)}"></i></span></div>`).join('') : '';
  }
  function listTakes() {
    $('takes').innerHTML = takeList.length ? takeList.slice().reverse().map((k) => `<div class="tk${k.id === sel ? ' sel' : ''}" data-id="${k.id}"><b>${esc(k.name)}</b><span>${esc((WEAPONS[k.gun] || {}).name || k.gun)} · ${k.take.dur.toFixed(2)} s · ${k.take.visits.length} beats</span><button data-act="play">Play</button><button data-act="save">Save</button><button data-act="del" title="Delete this take">✕</button></div>`).join('') : '<p class="dim">None yet. Rest your support hand on the handguard, then mime a reload: the take starts as the hand leaves and ends when it is back.</p>';
  }
  const zLabel = (id: string) => { const z = gun && gun.zones.find((q) => q.id === id); return z ? z.label : id; };
  const zHex = (id: string) => hex((ZC as Record<string, number>)[id] || 0x888888);
  /** The two lanes (yours, the game's) on one scale of seconds, the table of beats, and the keys. */
  function timeline() {
    const k = shown(), mine = k ? k.take : null, game = ref ? ref.take : null;
    tlScale = Math.max(mine ? mine.dur : 0, game ? game.dur : 0, 0.5);
    const lane = (tk: McTake | null, none: string) => (tk ? tk.visits.map((v: McVisit) => `<i style="left:${v.t0 / tlScale * 100}%;width:${Math.max(0.6, (v.t1 - v.t0) / tlScale * 100)}%;background:${zHex(v.zone)}" title="${esc(zLabel(v.zone))} ${v.t0.toFixed(2)}–${v.t1.toFixed(2)} s"><em>${esc(zLabel(v.zone))}</em></i>`).join('') + tk.visits.flatMap((v) => [[v.g0, 'closed'], [v.g1, 'opened']] as [number | null, string][]).filter((q) => q[0] !== null).map((q) => `<s class="${q[1]}" style="left:${q[0]! / tlScale * 100}%" title="hand ${q[1]} ${q[0]!.toFixed(2)} s"></s>`).join('') + `<u style="left:${tk.dur / tlScale * 100}%"></u>` : `<span class="dim">${none}</span>`);
    $('lane-me').innerHTML = lane(mine, 'no take selected');
    $('lane-game').innerHTML = lane(game, gun && VMAnim.kinds(gun.def).reload !== 'mag' ? 'this gun is not reloaded by magazine: the game has no magazine clip to compare' : '—');
    $('ticks').innerHTML = Array.from({ length: Math.floor(tlScale / 0.5) + 1 }, (_, i) => `<b style="left:${i * 0.5 / tlScale * 100}%">${(i * 0.5).toFixed(1)}</b>`).join('');
    $('tl-me').textContent = mine ? `${k!.name} · ${mine.dur.toFixed(2)} s` : 'You';
    $('tl-game').textContent = game ? `Game · ${game.dur.toFixed(2)} s` : 'Game';
    $('ref-label').textContent = ref ? ref.label : '';
    const rows = MM.compare(mine ? mine.visits : [], game ? game.visits : []);
    const cell = (v: McVisit | null) => (v ? `<td>${v.t0.toFixed(2)}–${v.t1.toFixed(2)} s</td><td>${(v.f0 * 100).toFixed(0)}–${(v.f1 * 100).toFixed(0)}%</td>` : '<td class="dim">—</td><td class="dim">—</td>');
    $('beats').innerHTML = rows.length ? rows.map((r) => `<tr><td><span class="dot" style="background:${zHex(r.zone)}"></span>${esc(zLabel(r.zone))}</td>${cell(r.mine)}<td>${r.mine && (r.mine.g0 !== null || r.mine.g1 !== null) ? ([[r.mine.g0, 'closed'], [r.mine.g1, 'opened']] as [number | null, string][]).filter((q) => q[0] !== null).sort((a, b) => a[0]! - b[0]!).map((q) => q[1] + ' ' + q[0]!.toFixed(2)).join(', ') + ' s' : '<span class="dim">—</span>'}</td>${cell(r.ref)}<td>${r.mine && r.ref ? ((r.mine.f0 - r.ref.f0) * 100 >= 0 ? '+' : '') + ((r.mine.f0 - r.ref.f0) * 100).toFixed(0) + ' pts' : ''}</td></tr>`).join('') : '<tr><td colspan="7" class="dim">No beats yet.</td></tr>';
    $('keys').value = mine && gun ? MM.keysText(MM.keysOf(mine.samples, mine.t0, mine.t1, gun.anchors)) : '';
  }
  function download(name: string, data: unknown) {
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([JSON.stringify(data)], { type: 'application/json' })); a.download = name; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }
  function bind() {
    const num = (id: string, key: 'opacity' | 'fpFov' | 'fpPitch' | 'fov' | 'depthK' | 'handScale' | 'gripPitch' | 'gripYaw' | 'zoneScale', then?: () => void) => {
      const el = $(id), out = $(id + '-v');
      const set = () => { S[key] = +el.value; if (out) out.textContent = String(+el.value); if (then) then(); };
      el.value = String(S[key]); el.addEventListener('input', set); if (out) out.textContent = String(S[key]);
    };
    const flag = (id: string, key: 'character' | 'laser' | 'grabs' | 'bodyDepth' | 'mirror' | 'lefty' | 'lock' | 'auto' | 'empty' | 'showGhost' | 'showZones' | 'showBody', then?: () => void) => { const el = $(id); el.checked = S[key]; el.addEventListener('change', () => { S[key] = el.checked; if (then) then(); }); };
    num('fov', 'fov', resize); num('depthK', 'depthK'); num('handScale', 'handScale'); num('gripPitch', 'gripPitch'); num('gripYaw', 'gripYaw');
    num('zoneScale', 'zoneScale', () => { buildZones(); reference(); });
    flag('mirror', 'mirror'); flag('bodyDepth', 'bodyDepth', () => { handK.Left = handK.Right = null; bodyK = 1; }); flag('lock', 'lock'); flag('auto', 'auto', () => cutter.reset()); flag('empty', 'empty', reference);
    flag('lefty', 'lefty', () => { lockM = null; resetTracking(); buildZones(); reference(); });
    num('opacity', 'opacity'); num('fpFov', 'fpFov', resize); num('fpPitch', 'fpPitch'); flag('character', 'character'); flag('laser', 'laser');
    flag('grabs', 'grabs', () => { magMode = 'in'; holding = magGrabbed = false; pullFrom = null; });
    flag('showGhost', 'showGhost', drawGhost); flag('showZones', 'showZones'); flag('showBody', 'showBody');
    $('how').addEventListener('change', () => { S.how = $('how').value; reference(); });
    const guns = gunList();
    $('gun').innerHTML = `<optgroup label="Magazine-fed">${guns.filter((g) => g.mag).map((g) => `<option value="${g.id}">${esc(g.name)}</option>`).join('')}</optgroup><optgroup label="Others (zones only)">${guns.filter((g) => !g.mag).map((g) => `<option value="${g.id}">${esc(g.name)}</option>`).join('')}</optgroup>`;
    $('gun').addEventListener('change', () => { setGun($('gun').value).catch((e) => say(String(e.message || e))); });
    const go = (fn: () => Promise<void> | void) => () => { say(''); Promise.resolve().then(fn).catch((e) => { console.error(e); say(e && e.name === 'NotAllowedError' ? 'The camera was not allowed. Allow it for this page, or use a video file or the demo.' : String(e && e.message || e)); stopSource(); }); };
    $('cam').addEventListener('click', go(startCamera));
    $('demo').addEventListener('click', go(startDemo));
    $('stop').addEventListener('click', go(stopSource));
    $('file').addEventListener('change', go(async () => { const f = $('file').files[0]; $('file').value = ''; if (!f) return; if (/json$/i.test(f.name) || f.type === 'application/json') await importTake(JSON.parse(await f.text())); else await startFile(f); }));
    $('take').addEventListener('click', toggleManual);
    $('relock').addEventListener('click', () => { lockM = readyM(); S.lock = true; $('lock').checked = true; });
    $('copy').addEventListener('click', () => { navigator.clipboard.writeText($('keys').value).then(() => { $('copy').textContent = 'Copied'; setTimeout(() => { $('copy').textContent = 'Copy'; }, 1200); }, () => { $('keys').select(); }); });
    $('takes').addEventListener('click', (e: MouseEvent) => {
      const el = e.target as HTMLElement, row = el.closest('.tk') as HTMLElement | null;
      if (!row) return;
      const rec = takeList.find((k) => k.id === +row.dataset.id!);
      if (!rec) return;
      const act = el.dataset.act;
      if (act === 'play') play(rec);
      else if (act === 'save') download(`reload-${rec.gun}-${rec.name.replace(/\W+/g, '_').toLowerCase()}.json`, exportTake(rec));
      else if (act === 'del') { takeList.splice(takeList.indexOf(rec), 1); if (sel === rec.id) { sel = takeList.length ? takeList[takeList.length - 1].id : -1; if (playing && playing.rec === rec) stopSource(); } listTakes(); drawTrail(); timeline(); }
      else { sel = rec.id; listTakes(); drawTrail(); timeline(); }
    });
    // (Space is the take's key wherever the focus was left: on a box just ticked or a button just pressed it would work that instead)
    window.addEventListener('keyup', (e) => { if (e.code === 'Space' && !(e.target as HTMLElement).matches('textarea')) e.preventDefault(); });
    window.addEventListener('keydown', (e) => {
      if ((e.target as HTMLElement).matches('textarea')) return;
      if (e.code === 'Space') { e.preventDefault(); const f = document.activeElement as HTMLElement | null; if (f && f !== document.body) f.blur(); if (!e.repeat) toggleManual(); return; }
      if ((e.target as HTMLElement).matches('select')) return;
      else if (e.key === 'l' || e.key === 'L') { S.lock = !S.lock; $('lock').checked = S.lock; }
      else if (e.key === 'm' || e.key === 'M') { S.mirror = !S.mirror; $('mirror').checked = S.mirror; }
    });
  }

  async function boot() {
    initScene(); bind(); listTakes(); status();
    say('Loading the gun models…');
    await GunModels.boot();
    const q = new URLSearchParams(location.search), id = q.get('gun') || 'm4';
    await setGun(Gunsmith.PLATFORMS[id] ? id : 'm4'); $('gun').value = gun!.id;
    say('');
    requestAnimationFrame(frame);
    if (q.has('demo')) startDemo();
  }

  return { boot, S, live, setGun, startDemo, startCamera, startFile, stopSource, play, importTake, exportTake, toggleManual, reference, demoRaw, process, DEMO_BEATS, get gun() { return gun; }, get ref() { return ref; }, get takes() { return takeList; }, get source() { return source; }, get bodyK() { return bodyK; }, get magMode() { return magMode; } };
})();
(globalThis as any).Mocap = Mocap;
