'use strict';
import { AudioEnv } from './audioenv.js';
import { Audio } from './audio.js';
import { Hangar } from './hangar.js';
import { HUD } from './hud.js';
import { Level } from './level.js';
import { LightGrid } from './lightgrid.js';
import { LevelView } from './levelview.js';
import { Loadout } from './loadout.js';
import { Materials } from './materials.js';
import { Prep } from './prep.js';
import { R as G_R } from './render.js';
import { ShipGen } from './shipgen.js';
import { ShipModel } from './shipmodel.js';
import { SpaceData } from './spacedata.js';
import { SpaceUI } from './spaceui.js';
import { U } from './util.js';
import { Views } from './views.js';
import { World } from './world.js';
import { Career } from './career.js';
import { Net } from './net.js';
import { Game } from './game.js';
import { Prof } from './profiler.js';
import { InteriorCull } from './interiorcull.js';
import { Me } from './player.js';
import { Radar, RSuite, RTarget, RSTrack, RAff, RMode, RPlot, RFused } from './radar.js';
import { RadarView } from './radarview.js';
import { SuiteView } from './suiteview.js';
import { SpaceSim, ZMem, SimShip, SimChaff, FlyIn, FB } from './spacesim.js';
import { SpaceNet, SssMsg, SevMsg } from './spacenet.js';
import { helmOf, helmBerth, trafficR, helmCopy, helmSame, helmDiff, helmPack, helmUnpack, HelmEv, HelmIn, HelmThen, hubPlace, boardPlace, boardMove, assaultPlace } from './helm.js';
// The game in space, on a screen (docs/space.md; the host's side is js/spaceserver.ts, what's drawn js/shipmodel.ts, the
// panels js/spaceui.ts). The squad's ship stands in the level at her BERTH: on the pad in the hangar, nose-on to the hull
// of a ship she's boarding, on the landing pad outside a base. Her deck is solid there (js/spacedata.ts boxes, added to the
// level's world), so walking about her, her seats, rays and sound are the level's own, and stay so while she flies: she
// never moves in the world. Flying, it's everything else that moves: the level's drawing and whatever's out in space are
// turned and shifted by the inverse of her pose (outside()), so from her deck the hangar falls away and the stars wheel.
// Her pose (P, Q) is in the level's own coordinates, as if she had flown off her berth: docked, P and Q are the berth's and
// nothing is moved.
//   Her pilot's game flies her (whoever last took the helm: S.ctl) and tells the host, which tells the rest (spose); they ease
//   to it. Docking, launching and jumping go through the host (sdock, jump).
//   A jump is the change of level: the screens go to the jump's light instead of black (the veil, kind 'ftl'), the place
//   is built behind it, and she comes out of the tunnel when it's ready.
interface SpWp { id: string; name: string; sub: string; p: THREE.Vector3; kind: 'anchor' | 'base' | 'breach' | 'lz' | 'entry'; i?: number; hide?: boolean; unseen?: boolean } // (unseen: a ship her sensors haven't named: not shown, not to be picked (ewMarks))
interface SpMs { def?: { on: number; lead: number; t: number; pods: number; lost: number; civ: number } | null; gn?: number; raid?: number[][]; hold: number; left?: number; zt?: number; hostile?: number; salv?: number[]; cuts?: number[][]; site?: number[] | null; i: number; docked: number; done: number; keys: string[]; cards: number[][]; art: number; artBy: string | null; artAt: number[] | null; hvt: number; hvtId: number | null; arm: number | null; boom: number; vac: number[]; cleared: number; at?: number }
type SpKind = 'hub' | 'board' | 'assault';
export const Space = (() => {
  const T = THREE, SD = SpaceData;
  const S = {
    on: false, kind: 'hub' as SpKind, stage: 'space' as 'space' | 'orbit' | 'atmo', map: null as LvMap | null,
    def: SD.SHIPS.kestrel, fleet: SD.fleet0(), seatsDef: [] as SpSeat[], berth: { x: 0, y: 0, z: 0, yaw: 0 } as { x: number; y: number; z: number; yaw: number; pt?: number }, Dp: new T.Vector3(), Dq: new T.Quaternion(),
    model: null as SmShip | null, solids: [] as { s: any; tag?: string; ship?: boolean; on: boolean; b: number[]; fl?: any; yb?: any; ob?: number[] }[], flights: [] as any[], noseT: 0, rampT: 0,
    hatchOpen: true, hatchT: 1, hatch: null as null | { leaves: THREE.Object3D[]; rail: (sg: number, s: number) => number[]; D: number[]; lamp: THREE.MeshStandardMaterial; tw: number; cam: THREE.PerspectiveCamera; screen: THREE.MeshBasicMaterial; n: number }, // (her inner door: open, how far, its leaves and its button's lamp)
    docked: true, P: new T.Vector3(), Q: new T.Quaternion(), V: new T.Vector3(), Wv: new T.Vector3(), stick: new T.Vector2(),
    roundBrake: false, brRound: null as null | { site: ShSite; face: THREE.Vector3; E: THREE.Vector3; hard: number; map: LvMap; way: THREE.Vector3[]; ra?: THREE.Vector3 },
    brLock: null as null | { site: ShSite; map: LvMap; hard: number; fa?: number; q0?: THREE.Quaternion; T0?: number; rp?: number; ra?: THREE.Vector3 }, // (the breach site the approach is steering her onto: squareUp)
    brThrust: false, // (the approach is flying her on her main engine this frame: squareUp; her own assist stands down: fly)
    zone: null as THREE.Group | null, zoneV: new T.Vector3(), zt0: 0, ztAt: 0, // (zt0: the zone's time the host last sent; ztAt: S.t then: the zone's clock runs on the simulation's time from there)
    traffic: [] as { obj: THREE.Object3D; c: { pts: number[][]; lens: number[]; total: number; speed: number; off: number; k?: number; name?: string }; wp: SpWp | null; ph: number; real?: boolean; bow?: number; pend?: LvMap | null }[],
    look: null as null | { yaw: number; pitch: number; eyeH: number; stowW: number; crouch: boolean; stowed: boolean }, carry: null as null | { k: number; v: THREE.Vector3; yaw: number; Q: THREE.Quaternion; V: THREE.Vector3 },
    zdef: [] as SpContact[], zact: 0, zC: new T.Vector3(), zinfo: null as null | { ms: any; act: number; near: boolean }, tclose: null as null | { k: number; t: number; sent?: boolean; name: string },
    thru: null as null | { to: "orbit" | "atmo"; map: unknown; left: number }, veil: null as null | { t: number }, // (thru: the cloud crossing under way (thruStep); veil: the tunnel's look held over a place not ready to draw yet (ftlStep))
    root: null as THREE.Group | null, plan: null as null | { line: THREE.Line; gates: THREE.LineSegments; end: THREE.LineSegments }, stars: null as THREE.Points | null, tunnel: null as THREE.Group | null, sun: null as THREE.DirectionalLight | null, planet: null as THREE.Object3D | null, star: null as null | ReturnType<typeof SpaceData.star>, starObj: null as THREE.Object3D | null, rockList: [] as { p: number[]; r: number; s: number }[],
    hull: null as ReturnType<typeof ShipModel.hull> | null, wps: [] as SpWp[], tgt: 0, anchors: [] as { i: number; obj: THREE.Object3D; p: THREE.Vector3; p0?: THREE.Vector3 }[],
    ftl: null as null | { st: 'spool' | 'wait' | 'tunnel'; t: number; to: number; T: number; held?: number }, seats: {} as Record<string, number>, ctl: null as string | null,
    hp: 100, hpMax: 100, ms: null as SpMission | null, state: null as SpMs | null, board: { seed: 1, level: 1, picked: [] as number[], done: [] as number[], gone: [] as number[] },
    auto: null as null | { t: number; T: number; P0: THREE.Vector3; Q0: THREE.Quaternion; P1: THREE.Vector3; Q1: THREE.Quaternion; mid: THREE.Vector3 | null; then: HelmThen },
    hidden: null as Map<THREE.Object3D, boolean> | null, net: null as null | { P: THREE.Vector3; Q: THREE.Quaternion; V: THREE.Vector3 }, sendT: 0, hold: 0, holdK: '', keep: null as null | { x: number; y: number; z: number; yaw: number },
    things: [] as { k: string; n?: number; x: number; z: number; y?: number; obj: THREE.Object3D }[], cardObjs: [] as THREE.Object3D[], term: null as null | { x: number; z: number }, t: 0, shake: 0, cruise: false,
    // the warp drive (warpStep): spin, how far it's spun up (0..1) on the target she's facing; warp, the run itself; tv, the
    // target's own velocity (tgtTrack), which she's left matching at the end of it
    spin: 0, warp: null as null | { j: number; u: number; t: number; top: number }, tv: new T.Vector3(), tvP: new T.Vector3(), tvJ: -1, match: null as null | string,
    boxes: [] as number[][], floorAt: null as null | ((x: number, z: number) => number), boomT: -1, uiOpen: false, mis: [] as { id: number; o: THREE.Group | null; p: THREE.Vector3; v: THREE.Vector3; t: number }[], // (p, v: where it is and its heading: the simulation's; o: its drawing, put where p is)
    lostAt: 0, helpAt: 0, lookP: 0, tracers: [] as { m: THREE.Mesh; t: number }[], trkMarks: [] as { p: THREE.Vector3; label: string; col: string; look?: boolean; pick?: boolean; arc?: THREE.Vector3[] }[], rounds: [] as { p: THREE.Vector3; v: THREE.Vector3; d: number; dmg: number; life: number }[], fireT: 0,
  };
  const me = () => Me, on = () => S.on;
  const isCtl = () => S.ctl === Net.myId;
  const mySeat = () => (S.on && me().seat != null ? S.seatsDef[me().seat as number] || null : null);
  const fwd = (q: THREE.Quaternion) => new T.Vector3(0, 0, -1).applyQuaternion(q);
  const yawQ = (yaw: number) => new T.Quaternion().setFromAxisAngle(new T.Vector3(0, 1, 0), yaw);
  // a berth's turn: its yaw, then its tilt nose up (pt) about her own x
  const berthQ = (b: { yaw: number; pt?: number }) => b.pt ? yawQ(b.yaw).multiply(new T.Quaternion().setFromAxisAngle(new T.Vector3(1, 0, 0), b.pt)) : yawQ(b.yaw);
  const aboardAt = (x: number, y: number, z: number) => SD.aboard(S.def, S.berth, x, y, z);
  const aboard = () => S.on && !!me().pos && aboardAt(me().pos.x, me().pos.y, me().pos.z);
  // sealed in: aboard a ship that isn't against anything (nobody outside can see or shoot you: js/player.ts state's se)
  const sealed = () => S.on && !S.docked && aboard();
  const store = () => U.store;

  // ------------------------------------------------------------------ radar (js/radar.ts): her set and the mission ship's, and who's seen whom
  // Every ship carries two scanning radars and two tracking radars. Hers are the sensor station's (sensorStep: its screen, the operator
  // cues a tracker on what they click); the mission ship's are her own (her fire control cues hers on what her scanners paint), and her
  // guns fire only on a track: what a track gives (where the squad's ship will be) is what they aim at (guns).
  const EW = { own: null as RSuite | null, foe: null as RSuite | null, ownT: null as RTarget | null, foeT: null as RTarget | null, modelFor: null as object | null, hullFor: null as object | null, scr: null as THREE.Mesh | null, cu: null as number[] | null, l: false, r: false, plan: false, rt: 0, ownDef: '', pre: null as null | { P: THREE.Vector3; Q: THREE.Quaternion }, chaff: [] as (SimChaff & { pts: THREE.Points | null; seeds: Float32Array })[], // (the simulation's clouds (js/spacesim.ts), and each one's drawing)
    chaffLeft: 0, chaffN: 0, xpdr: false, holo: { c: new T.Vector3(), R: 0.3, rot: new T.Quaternion(), pick: null as any, rAt: 0, moved: false, y0: 0, p0: 0, placed: false, sy: 0, sat: -1, focus: false, gT: 0, gDone: false, mx: 0, my: 0, ml: false, mr: false, dx: 0, dy: 0, hid: [] as HTMLElement[], inputOn: false, fT: -1, fO: -1, auto: false, cur: null as HTMLElement | null, cx: 0, cy: 0, cr: 7, zi: 4 } };
  const NO_RCS = { s: new Float32Array(1), max: 0, mean: 0 }; // (a radar target's return, for the targets the page keeps only to know where they are)
  const HOLO_ZOOM = [500, 1000, 2500, 5000, 10000, 25000, 50000]; // (out to the scanners' reach: js/radar.ts MAP.Rmax)
  // the sensor operator's scan controls: which scanner the keys work (sel: -1 none), the number keys' presses (when each went
  // down, whether a hold's acted), and a sector changed by the keys not yet told to the crew (dirty)
  // the sensor station's number keys past the scanners': 3 the optical tracker's picture (OPTV); dn: when it went down (a tap's one toggle)
  const TRKK = { sel: -1, dn: [-1, -1], held: [false, false] };
  // the optical tracker's picture (3 at the sensor station): what its camera's analysing, drawn from that quarter's camera with its
  // zoom: the scene rendered into a target, read back into a canvas at the side, with the reticle and what it makes of it
  const OPTV = { on: false, cv: null as HTMLCanvasElement | null, rt: null as THREE.WebGLRenderTarget | null, cam: null as THREE.PerspectiveCamera | null, buf: null as Uint8Array | null, img: null as ImageData | null, f: 0,
    // (what the picture shows, eased toward where the tracker points and how far it's zoomed: the view's own way and field, its camera, its clock)
    d: new T.Vector3(0, 0, -1), fov: 0, q: -1, t: -1, key: '', su: null as RSuite | null };
  const DBGV: typeof OPTV = { ...OPTV, d: new T.Vector3(0, 0, -1) }; // (the F8 view's: the same, for whichever ship it shows)
  const SEC = { sel: -1, open: -1, cur: 0, dn: [-1, -1], held: [false, false], lt: 0, dirty: -1, sent: 0, sync: 0, told: [] as string[] }; // (the range at the hologram's edge, scrolled through)
  const _ray = new T.Raycaster();
  // (a glow, a beam or a screen: not her plating, and some reach far beyond her, so they're left out of her size)
  const glowy = (o: any) => { const m = Array.isArray(o.material) ? o.material[0] : o.material; return !!m && (m.transparent || m.isMeshBasicMaterial); };
  // (EW.rt: the radars' own clock. Never started again (the level's clock, S.t, is, at every new level): so what they hold, timed
  // by it, holds through coming up with another ship)
  function ewStep(dt: number) {
    if (!S.model) return; EW.rt += dt;
    if (EW.modelFor !== S.model) { // (her own set and her return, made once her drawing's there)
      const g = S.model.group; g.updateMatrixWorld(true);
      const inv = g.matrixWorld.clone().invert(), box = new T.Box3(); g.traverse((o: any) => { if (o.isMesh && o.geometry && !glowy(o)) { o.geometry.computeBoundingBox(); box.union(o.geometry.boundingBox.clone().applyMatrix4(new T.Matrix4().multiplyMatrices(inv, o.matrixWorld))); } });
      const sz = box.getSize(new T.Vector3()), size = Math.max(4, sz.z / 2);
      const was = EW.own; EW.own = was && EW.ownDef === S.def.id ? was : Radar.suite('own', size, box.max.y, Math.max(box.max.x, -box.min.x), box.min.y); Radar.sched(EW.own); // (her trackers run by the scheduler: js/radar.ts schedule) EW.ownDef = S.def.id; // (her set kept, all it holds, while she's the same ship: a new level's drawing of her isn't a new her)
      // (her search radars as the operator left them, her drawing made again or not (a new level): off at first, she's silent till switched on)
      if (EW.own !== was) EW.own.scans.forEach((sc, k) => { const o = was && was.scans[k]; sc.mode = o ? o.mode : 'off'; if (o) { sc.notch = o.notch; sc.sec.on = o.sec.on; sc.sec.c = o.sec.c; sc.sec.h = o.sec.h; } });
      EW.own.trks.forEach((t, k) => { const o = was && was.trks[k]; t.off = !!(o && o.off); });
      EW.ownT = { sz: size, kind: 'ship', id: 'own', p: new T.Vector3(), v: new T.Vector3(), q: new T.Quaternion(), rcs: NO_RCS }; // (where she is, for F8's truth: her radar return's the server's)
      EW.scr = null; g.traverse((o: any) => { if (!EW.scr && o.isMesh && o.material && o.material.map === S.model!.screen.tex) EW.scr = o; }); { const sm = EW.scr as THREE.Mesh | null; if (sm) (sm.material as THREE.Material).side = T.DoubleSide; } // (its face is the one toward the operator, whichever way the model wound it)
      // (the sensor station's hologram where its screen was, the screen put away: its middle over the screen's, as big as it)
      { const sm = EW.scr as THREE.Mesh | null; if (sm) { sm.geometry.computeBoundingBox(); const bb = sm.geometry.boundingBox!.clone().applyMatrix4(new T.Matrix4().multiplyMatrices(inv, sm.matrixWorld)), sz = bb.getSize(new T.Vector3()); EW.holo.c.copy(bb.getCenter(new T.Vector3())).add(new T.Vector3(0, 0.1, 0)); EW.holo.R = Math.max(0.25, Math.min(0.45, Math.max(sz.x, sz.z) * 0.65)); sm.visible = false; } EW.holo.placed = false; }
      EW.modelFor = S.model; EW.chaffLeft = CHAFF.loads; tubeKit(g, box, size); if (EW.own !== was) TP.left = TORP.loads;
    }
    if (S.hull !== EW.hullFor) { // (the mission ship's, made once her hull's there)
      EW.foe = null; EW.foeT = null; EW.hullFor = S.hull;
      if (S.hull && S.map && S.map.sp) {
        const g = S.hull.group; g.updateMatrixWorld(true);
        const inv = g.matrixWorld.clone().invert(), hb = S.map.sp.hull, box = new T.Box3(); g.traverse((o: any) => { if (o.isMesh && o.geometry && !glowy(o)) { o.geometry.computeBoundingBox(); box.union(o.geometry.boundingBox.clone().applyMatrix4(new T.Matrix4().multiplyMatrices(inv, o.matrixWorld))); } });
        const c = new T.Vector3((hb.x0 + hb.x1) / 2, box.isEmpty() ? 0 : (box.min.y + box.max.y) / 2, (hb.z0 + hb.z1) / 2), h = box.isEmpty() ? 20 : box.max.y - c.y;
        // (her radars' frame: her length runs along x, so her bow's -x and her starboard -z: a quarter turn about her up)
        EW.foe = Radar.suite('hull', (hb.x1 - hb.x0) / 2, h + 0.6, (hb.z1 - hb.z0) / 2 + 0.8, (box.isEmpty() ? -20 : box.min.y - c.y) - 0.6, 8); Radar.sched(EW.foe); EW.foe.P.copy(c); EW.foe.Q.setFromAxisAngle(new T.Vector3(0, 1, 0), Math.PI / 2);
        fitMounts(EW.foe, S.hull, g); radarKit(EW.foe, g);
        EW.foeT = { sz: Math.max((hb.x1 - hb.x0), (hb.z1 - hb.z0)) / 2, kind: 'ship', id: 'hull', p: c.clone(), v: new T.Vector3(), q: new T.Quaternion(), rcs: NO_RCS }; // (where she is, for F8's truth)
      }
    }
    const own = EW.own!, me = EW.ownT!; me.iff = { c: 'squad', n: S.def.name || 'squad' }; me.aff = 'squad'; me.xon = EW.xpdr; own.aff = 'squad'; own.hostNames = new Set([hullName()]);
    if (EW.foeT && EW.foe) { const af = missionAff(); EW.foeT.aff = af; EW.foeT.iff = { c: af === 'navy' ? 'navy' : 'civ', n: hullName() }; EW.foeT.xon = af !== 'pirate'; EW.foe.aff = af; }
    own.P.copy(S.P); own.Q.copy(S.Q); own.V.copy(S.V); me.p.copy(S.P); me.v.copy(S.V); me.q.copy(S.Q);
    // (the server's copy of her scanners kept as the crew set them here, whatever set them (a key, a test): told when they differ, twice a second at most)
    if (isCtl() && S.t - SEC.sync > 0.5) { SEC.sync = S.t; own.scans.forEach((sc, k) => { const a = ssecOf(k, sc), key = a.join(','); if (SEC.told[k] !== key) { SEC.told[k] = key; Net.toHost({ t: 'ssec', a }); } }); }

    if (S.ftl) return; // (jumping between levels: nothing near her)
    rocksStep(dt); own.Vc = ROCKS.v; // (the rocks near her: what she can run into (collide), the field's way)
    chaffStep(dt); // (the clouds, drawn)
    // (her radars, the mission ship's and the zone's ships', and fire control: all the server's (js/svbattle.ts); what's drawn and
    // decided here comes from its pictures: shownOwn, sv)
  }
  // Her radars' hardware on her hull (in her group, whose frame is the level's): each scanner an antenna on a post, turning with its
  // sweep (the 'y' one a long bar on her roof turning about her up; the 'x' one a long bar on a pylon under her keel turning about
  // her beam), each tracker a dish on her flank, pointed along its boresight
  const _mz = new T.Vector3(0, 0, -1);
  // Her mounts set on her plating where it really is (her lines differ ship to ship: a V under a navy keel, a citadel on her roof):
  // a ray down onto her roof or up into her keel at each gun under her and each scanner, and in at her flank at each tracker
  function fitMounts(su: RSuite, h: NonNullable<typeof S.hull>, g: THREE.Object3D) {
    const skip = new Set<THREE.Object3D>(); for (const gn of h.guns) gn.obj.traverse((o) => skip.add(o));
    const solid: THREE.Object3D[] = []; g.traverse((o: any) => { if (o.isMesh && !glowy(o) && !skip.has(o)) solid.push(o); });
    const rc = new T.Raycaster(), hitAt = (from: THREE.Vector3, dir: THREE.Vector3) => { rc.set(from, dir); rc.far = 400; const hs = rc.intersectObjects(solid, false); return hs.length ? hs[0].point : null; };
    for (const gn of h.guns) { // (her guns: the one under her keel hung from the plating there, those on her roof stood on whatever's highest under them)
      if (gn.k === 'missile') continue;
      const p = hitAt(new T.Vector3(gn.x, gn.inv ? -200 : 200, gn.z), new T.Vector3(0, gn.inv ? 1 : -1, 0)); if (!p) continue;
      if (gn.inv) { if (p.y < gn.obj.position.y + 0.3) { gn.obj.position.y = p.y - 0.1; gn.y = gn.obj.position.y - 1.5; } }
      else if (p.y > gn.obj.position.y - 0.3) { gn.obj.position.y = p.y + 0.1; gn.y = gn.obj.position.y + 1.5; }
    }
    for (const sc of su.scans) { // (a scanner's mast stands out of her plating along n: a ray in along it, from out beyond her, finds where)
      const n = sc.n.clone().applyQuaternion(su.Q), foot = sc.at.clone().addScaledVector(sc.n, -sc.mast).applyQuaternion(su.Q).add(su.P);
      const p = hitAt(foot.clone().addScaledVector(n, 200), n.clone().negate()); if (!p) continue;
      sc.at.copy(p.addScaledVector(n, sc.mast).sub(su.P).applyQuaternion(su.Q.clone().invert()));
    }
    for (const tr of su.trks) {
      // (in from just outside her side, not from far off: a boom or a lamp standing off her isn't her flank)
      const out = new T.Vector3(tr.side, 0, 0).applyQuaternion(su.Q), w = tr.at.clone().applyQuaternion(su.Q).add(su.P), p = hitAt(w.clone().addScaledVector(out, 3), out.clone().negate());
      if (p) tr.at.copy(p.addScaledVector(out, 0.2).sub(su.P).applyQuaternion(su.Q.clone().invert()));
    }
  }
  function radarKit(su: RSuite, g: THREE.Object3D) {
    const M = ShipModel.M(0x6a7078, { metalness: 0.5 }), D = ShipModel.M(0x2a2e33, { metalness: 0.6 }), rotors: THREE.Object3D[] = [], dishes: THREE.Object3D[] = [];
    const mount = (at: THREE.Vector3) => { const o = new T.Group(); o.position.copy(at).applyQuaternion(su.Q).add(su.P); o.quaternion.copy(su.Q); g.add(o); return o; };
    for (const sc of su.scans) {
      // (its mast: from her plating out along n to the antenna, a lattice of four legs braced, on a plate)
      const o = mount(sc.at), up = new T.Quaternion().setFromUnitVectors(new T.Vector3(0, 1, 0), sc.n), L = sc.mast, ms = new T.Group(); ms.quaternion.copy(up); ms.position.copy(sc.n).multiplyScalar(-L); o.add(ms);
      for (const [lx, lz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) { const leg = new T.Mesh(new T.CylinderGeometry(0.12, 0.16, L, 6), D); leg.position.set(lx * 0.55 * (1 - 0.0), L / 2, lz * 0.55); ms.add(leg); }
      for (let k = 1; k < 4; k++) { const ring = new T.Mesh(new T.BoxGeometry(1.3, 0.12, 1.3), D); ring.position.y = L * k / 4; ms.add(ring); }
      const plate = new T.Mesh(new T.CylinderGeometry(1.4, 1.6, 0.4, 12), D); plate.position.y = 0.1; ms.add(plate);
      const r = new T.Group(); o.add(r); rotors.push(r);
      // (the aperture's long the way its beam's narrow, the way it sweeps: across for 'y', up and down for 'x', round her for 'z')
      const bar = new T.Mesh(sc.ax === 'y' ? new T.BoxGeometry(7, 1.0, 0.35) : sc.ax === 'x' ? new T.BoxGeometry(1.0, 7, 0.35) : new T.BoxGeometry(7, 0.35, 1.0), M); bar.position.copy(Radar.dirOf(sc.ax, 0, 0)).multiplyScalar(0.4); r.add(bar); // ('z': long across her, facing out from her length)
      const hub = new T.Mesh(new T.BoxGeometry(0.9, 0.9, 0.9), D); r.add(hub);
    }
    for (const tr of su.trks) {
      const o = mount(tr.at), arm = new T.Mesh(new T.BoxGeometry(1.4, 0.7, 0.7), D); arm.position.x = tr.side * 0.5; o.add(arm); const plate = new T.Mesh(new T.BoxGeometry(0.4, 2.2, 2.2), D); plate.position.x = -tr.side * 0.1; o.add(plate);
      const d = new T.Group(); d.position.x = tr.side * 1.3; o.add(d); dishes.push(d);
      const dish = new T.Mesh(new T.CylinderGeometry(1.3, 0.35, 0.6, 16, 1, true), new T.MeshStandardMaterial({ color: 0x8a9098, metalness: 0.4, roughness: 0.5, side: T.DoubleSide })); dish.rotation.x = -Math.PI / 2; dish.position.z = -0.3; d.add(dish);
      const feed = new T.Mesh(new T.CylinderGeometry(0.06, 0.06, 1.4, 5), D); feed.rotation.x = Math.PI / 2; feed.position.z = -0.9; d.add(feed);
      d.quaternion.setFromUnitVectors(_mz, tr.b);
    }
    return { su, rotors, dishes };
  }
  // Chaff: a cloud of foil cut to the radars' wavelength, thrown out of her (V at the helm or the sensor station). In space it
  // keeps her velocity, plus the 22 m/s it's thrown at: it drifts off her slowly. Its return blooms to CHAFF.sig as it spreads
  // (half a second), holds, and fades as it thins. To a scanner it's another peak; to a tracker it's more return in the beam:
  // a tracker on her when it blooms steers to the middle of the two, and as she leaves it, if it's the stronger, its range gate
  // goes with it (js/radar.ts beam). Everyone aboard sees it (schaff).
  const CHAFF = SpaceSim.CHAFF; // (its figures: the simulation's)
  // a cloud thrown (a: its place and velocity): the simulation's cloud (js/spacesim.ts chaffNew), and its drawing: points scattered about it
  function chaffOut(a: number[]) {
    if (a.length < 6) return;
    const c = Object.assign(SpaceSim.chaffNew(a, ++EW.chaffN, EW.rt), { pts: null as THREE.Points | null, seeds: new Float32Array(0) });
    const N = 90, seeds = new Float32Array(N * 3); for (let i = 0; i < N * 3; i++) seeds[i] = (Math.random() + Math.random() + Math.random() - 1.5) / 1.5;
    c.seeds = seeds; EW.chaff.push(c);
    if (!S.root) return;
    const g = new T.BufferGeometry(); g.setAttribute('position', new T.BufferAttribute(new Float32Array(N * 3), 3));
    c.pts = new T.Points(g, new T.PointsMaterial({ color: 0xdfe8f0, size: 2, sizeAttenuation: false, transparent: true, opacity: 0.9, depthWrite: false, blending: T.AdditiveBlending })); c.pts.frustumCulled = false; S.root.add(c.pts);
  }
  function chaffStep(dt: number) {
    for (const c of SpaceSim.chaffStep(S.zone ? ZS : null, EW.chaff, EW.rt, dt) as typeof EW.chaff) if (c.pts) { c.pts.removeFromParent(); c.pts.geometry.dispose(); } // (the simulation's step: js/spacesim.ts)
    for (const c of EW.chaff) { // (the clouds' drawings: the points spread as it blooms, and fading)
      if (!c.pts) continue; const age = EW.rt - c.born, k = SpaceSim.chaffK(age);
      const pa = c.pts.geometry.attributes.position as THREE.BufferAttribute, sp = 1.5 + Math.min(age, 4) * 5;
      for (let j = 0; j < pa.count; j++) pa.setXYZ(j, c.t.p.x + c.seeds[j * 3] * sp + (Math.random() - 0.5) * 0.3, c.t.p.y + c.seeds[j * 3 + 1] * sp, c.t.p.z + c.seeds[j * 3 + 2] * sp);
      pa.needsUpdate = true; (c.pts.material as THREE.PointsMaterial).opacity = 0.25 + 0.7 * k * (0.6 + 0.4 * Math.random());
    }
  }
  // her transponder: on, it answers every interrogation with the squad's ship's name (she's known for what she is); off, she's a
  // contact nobody can name (an unknown: a hostile treats it as a threat as it would her)
  function xpdr(on: boolean) { EW.xpdr = on; HUD.toast('TRANSPONDER', on ? 'On: she answers interrogation' : 'Off: she runs silent', 1.4); Audio.click(); }
  function chaffGo() {
    if (!S.model || S.docked || S.ftl) return;
    if (EW.chaffLeft <= 0) { HUD.toast('CHAFF', 'None left', 1.2); Audio.deny(); return; }
    EW.chaffLeft--;
    // (the server, flying her, throws it from where it has her and tells everyone: js/svbattle.ts flyOn; else this page does)
    if (C2.on) helmCmd(['ch']); else { const a = SpaceSim.chaffThrow(simShip(), SR); chaffOut(a); Net.toHost({ t: 'schaff', a }); }
    HUD.toast('CHAFF', EW.chaffLeft + ' left', 1); Audio.click();
  }
  // the mission ship's transponder: her name, as the mission's ship (the squad's screen marks her; her own fire control knows itself)
  // (the radar debug view's names for what its target ids are (js/radarview.ts truthOf))
  RadarView.dbg.nameOf = (id: string) => {
    if (id === 'own') return 'us';
    if (id === 'hull') return hullName() + ' (mission)';
    let m = /^t(\d+)$/.exec(id); if (m) { const q = S.traffic.find((x) => x.c.k === +m![1]); return (q && q.c.name) || 'ship ' + id; }
    m = /^torp(\d+)$/.exec(id); if (m) { const tp = TP.list.find((x) => String(x.id) === m![1]); return tp ? (tp.mine ? 'our torpedo' : 'their torpedo') : 'torpedo'; }
    m = /^(rock|chaff|missile)(\d*)$/.exec(id); if (m) return m[1] + (m[1] === 'rock' ? ' ' + m[2] : '');
    return id;
  };
  function hullName(): string { const q = S.traffic.find((x) => x.c.k === S.zact), ms = S.ms as any; return (q && q.c.name) || (ms && ms.name) || 'target'; }
  // whose the mission's ship is (by her class and the job: js/spacedata.ts wearOf): a navy's, pirates' (a ship they've taken is
  // theirs now: no answer), or a civilian's
  function missionAff(): RAff { const ms = S.ms as any, w = ms ? SD.wearOf(ms.size, ms.obj) : null; return w === 'navy' ? 'navy' : w === 'pirate' ? 'pirate' : 'civ'; }
  // the zone's other ships, as radar targets: each where she is in the level's frame, how fast she's going, and her return (from
  // her own drawing: the stand-in far off, her real hull once she's drawn as herself)
  // a zone ship's place at the zone's time t: in the zone's frame (trafficLocal: where her drawing goes, as a child of the zone), and
  // maths, not read back from the scene
  type TrfQ = (typeof S.traffic)[0];
  function trafficLocal(q: TrfQ, t: number, p: THREE.Vector3, qt: THREE.Quaternion) {
    const z = SD.zonePos(q.c, t); p.set(z.p[0], z.p[1], z.p[2]);
    if (q.real) qt.copy(yawQ(Math.atan2(z.d[0], z.d[2]) - q.bow!)); else qt.copy(lookQ(_zd.set(z.d[0], z.d[1], z.d[2])));
  }
  // the sensor station: where its operator's looking on its screen (the middle of their view on the screen's face), and a click: a
  // tracker cued on the plot under it (told to everyone aboard: srcue); the other button drops both trackers
  // the sensor station: its hologram (js/radarview.ts holo). Held, the right button turns it (the operator's view held still while
  // it does; a tap of it drops the trackers); the middle of their view points at a track in it, and a click cues a tracker on
  // it (told to everyone aboard: srcue)
  // Into the hologram or out (G held at the sensor station): in, the room blurred behind it (js/render.ts focusBlur), the rest of the
  // screen's UI put away, and the mouse let go (still counted as captured: js/game.ts holoCursor, softLocked) to point at it
  // with its own cursor; out, all of it back and the mouse captured again
  function holoFocus(on: boolean) {
    const H = EW.holo; if (H.focus === on) return; H.focus = on; H.fT = on ? S.t : -1; H.fO = on ? -1 : S.t; if (on) { G_R.focusBlur = true; G_R.focusAmt = 0; } // (out: the blur fades away (fO), not gone at once)
    if (!H.inputOn) { H.inputOn = true;
      window.addEventListener('mousemove', (e) => { if (!H.focus) return; H.mx = e.clientX; H.my = e.clientY; if (H.mr) { H.dx += e.movementX; H.dy += e.movementY; } });
      window.addEventListener('mousedown', (e) => { if (!H.focus) return; if (e.button === 0) H.ml = true; if (e.button === 2) H.mr = true; });
      window.addEventListener('mouseup', (e) => { if (e.button === 0) H.ml = false; if (e.button === 2) H.mr = false; });
      window.addEventListener('wheel', (e) => { if (!H.focus || Math.abs(e.deltaY) < 5) return; H.zi = U.clamp(H.zi + (e.deltaY > 0 ? 1 : -1), 0, HOLO_ZOOM.length - 1); }); // (scrolled: nearer in or further out)
    }
    const cv = G_R.renderer.domElement, hint = document.getElementById('holo-hint');
    if (on) {
      H.mx = innerWidth / 2; H.my = innerHeight / 2; H.ml = H.mr = false; me().mouse.l = me().mouse.r = false;
      H.hid = []; // (everything beside the canvas, at every level from it up to the page's body: the HUD's in with it)
      for (let n: Element = cv; n.parentElement; n = n.parentElement) for (const el of n.parentElement.children) if (el !== n && el !== hint && el.id !== 'holo-cursor' && el.id !== 'holo-scan' && el.id !== 'opt-view' && el.tagName !== 'SCRIPT' && el.tagName !== 'STYLE') H.hid.push(el as HTMLElement);
      if (!document.getElementById('holo-hide-css')) { const st = document.createElement('style'); st.id = 'holo-hide-css'; st.textContent = '.holo-hide { visibility: hidden !important; }'; document.head.appendChild(st); } // (over whatever its own code sets each frame)
      for (const el of H.hid) el.classList.add('holo-hide');
      Game.holoCursor = true; Game.softLocked = true; if (document.pointerLockElement) document.exitPointerLock(); cv.style.cursor = 'none';
      if (!H.cur) { const c = document.createElement('div'); c.id = 'holo-cursor'; Object.assign(c.style, { position: 'fixed', left: '0', top: '0', width: '14px', height: '14px', border: '2px solid rgba(140,230,255,0.95)', borderRadius: '50%', boxShadow: '0 0 6px rgba(80,200,255,0.8)', pointerEvents: 'none', zIndex: '60', display: 'none' }); document.body.appendChild(c); H.cur = c; }
      H.cx = H.mx; H.cy = H.my; H.cr = 7; H.cur.style.display = '';
    } else {
      for (const el of H.hid) el.classList.remove('holo-hide'); H.hid = []; cv.style.cursor = ''; if (H.cur) H.cur.style.display = 'none';
      Game.holoCursor = false; if (Game.softLocked) { Game.softLocked = false; Game.lock(); }
    }
  }
  // a scanner's search set (k its number): a sector (c +- h, her angle) or round (told to everyone aboard: ssec)
  // a search radar's mode (k its number): round, a sector, or off (silent); its sector c +- h (told to everyone aboard: ssec)
  const MODES: RMode[] = ['round', 'sector', 'off'];
  const MODE_NAME: Record<RMode, string> = { round: 'ROUND', sector: 'SECTOR', off: 'OFF' };
  // (and its Doppler notch, on or off, whatever its mode: NOTCH_OPT, the fourth line of its list)
  const NOTCH_OPT = MODES.length, optsOf = (sc: { notch?: boolean }) => [...MODES.map((m) => MODE_NAME[m]), sc.notch ? 'NOTCH: ON' : 'NOTCH: OFF'];
  const ssecOf = (k: number, sc: { mode: RMode; sec: { c: number; h: number }; notch?: boolean }) => [k, MODES.indexOf(sc.mode), Math.round(sc.sec.c * 1000) / 1000, Math.round(sc.sec.h * 1000) / 1000, sc.notch ? 1 : 0];
  function modeSet(k: number, mode: RMode, c: number, h: number, quiet = false, notch?: boolean) {
    const sc = EW.own && EW.own.scans[k]; if (!sc) return;
    sc.mode = mode; sc.sec.on = mode === 'sector'; sc.sec.c = c; sc.sec.h = h; if (notch != null) sc.notch = notch;
    if (!quiet) { Net.toHost({ t: 'ssec', a: ssecOf(k, sc) }); Audio.click(); }
  }
  function notchSet(k: number) { const sc = EW.own && EW.own.scans[k]; if (!sc) return; modeSet(k, sc.mode, sc.sec.c, sc.sec.h, false, !sc.notch); HUD.toast('SCAN ' + sc.tag, 'Doppler notch ' + (sc.notch ? 'on: what closes as the asteroids do is filtered out' : 'off'), 1.6); }
  // The scan keys at the sensor station, 1 and 2 the bearing and roll scanners, each a box in the corner showing its mode:
  //   held, its box opens, a list of its modes; tapped while it's open, the next one's picked; held again, it closes and the
  //   radar's set to the one picked
  //   tapped while it's closed, it's the radar the keys work (tapped again, none): W and S widen and narrow its sector, A and D
  //   turn it (to port and starboard; for the roll scanner, round her the one way and the other), as it searches if it is
  function scanKeys() {
    const dt = Math.min(0.1, Math.max(0, S.t - SEC.lt)); SEC.lt = S.t; if (!EW.own) return;
    // (3: the optical tracker's picture shown, or put away. The radar dishes are the scheduler's; one's switched off or on by
    // clicking its state in the scheduler's box)
    if (K('Digit3')) { if (TRKK.dn[0] < 0) { TRKK.dn[0] = S.t; OPTV.on = !OPTV.on; Audio.click(); } } else TRKK.dn[0] = -1;
    ['Digit1', 'Digit2'].forEach((code, k) => {
      const sc = EW.own!.scans[k]; if (!sc) return;
      if (K(code)) { if (SEC.dn[k] < 0) { SEC.dn[k] = S.t; SEC.held[k] = false; }
        if (!SEC.held[k] && S.t - SEC.dn[k] > 0.4) { SEC.held[k] = true;
          if (SEC.open === k) { if (SEC.cur === NOTCH_OPT) notchSet(k); else modeSet(k, MODES[SEC.cur], sc.sec.c, sc.sec.h); SEC.open = -1; } // (closed: set to what's picked)
          else { SEC.open = k; SEC.cur = MODES.indexOf(sc.mode); Audio.click(); } } } // (opened, on what it's doing)
      else if (SEC.dn[k] >= 0) { if (!SEC.held[k]) { if (SEC.open === k) SEC.cur = (SEC.cur + 1) % (MODES.length + 1); else SEC.sel = SEC.sel === k ? -1 : k; Audio.click(); } SEC.dn[k] = -1; }
    });
    if (SEC.sel >= 0) {
      const P = EW.own.scans[SEC.sel].sec, h0 = P.h, c0 = P.c;
      if (K('KeyW')) P.h = Math.min(Math.PI, P.h + 0.9 * dt); if (K('KeyS')) P.h = Math.max(4 * Math.PI / 180, P.h - 0.9 * dt);
      if (K('KeyD')) P.c = wrapA(P.c + 1.2 * dt); if (K('KeyA')) P.c = wrapA(P.c - 1.2 * dt);
      if (P.h !== h0 || P.c !== c0) SEC.dirty = SEC.sel;
    }
    // (the crew told of a sector the keys have changed: five times a second at most)
    if (SEC.dirty >= 0 && S.t - SEC.sent > 0.2) { const sc = EW.own.scans[SEC.dirty]; Net.toHost({ t: 'ssec', a: ssecOf(SEC.dirty, sc) }); SEC.sent = S.t; SEC.dirty = -1; }
  }
  // A left click on a radar warning's chevron in the hologram: a tracker sent along its bearing (the one picked, or the one that
  // can see that way). A left click on a track with a tracker picked: that one sent on it. Nowhere else: a tracker's sent on
  // something, a track or a radar it can hear, not at an empty place.
  // A left click on the boxes in the corner (js/radarview.ts holo, data-hb): a scanner's box opens its list of modes (and it's the
  // one W A S D work), or closes it; a mode in the list sets it; a tracker's box does nothing (the scheduler sends them, and they
  // can't be switched off)
  function boxClick(x: number, y: number): boolean {
    const own = EW.own; if (!own) return false;
    let hit: HTMLElement | null = null, area = Infinity;
    for (const el of document.querySelectorAll<HTMLElement>('#holo-scan [data-hb]')) { const r = el.getBoundingClientRect(); if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom && r.width * r.height < area) { area = r.width * r.height; hit = el; } }
    if (!hit) return false;
    const a = hit.dataset.hb!, kind = a[0], n = parseInt(a.slice(1), 10);
    // (the track clicked: in the suite as it's shown (the server's picture, its battle on), sent by where it is)
    const shownTts = () => { const v = sv(own); return v && v.sched ? v.sched.tts : Radar.sched(own).tts; };
    if (kind === 'a') { const tt = shownTts().find((q) => q.n === a.slice(1)); if (tt) { const p = tt.kf.pos(new T.Vector3()), qu = !tt.quiet; tt.quiet = qu; Net.toHost({ t: 'strk', a: [-1, 7, +p.x.toFixed(1), +p.y.toFixed(1), +p.z.toFixed(1), qu ? 1 : 0, tt.n] }); HUD.toast('TRACKERS', tt.n + (tt.quiet ? ': listen only (the camera)' : ': active (radar and camera)'), 1.4); Audio.click(); } return true; }
    if (kind === 'x') { const tt = shownTts().find((q) => q.n === a.slice(1)); if (tt) { const p = tt.kf.pos(new T.Vector3()); Net.toHost({ t: 'strk', a: [-1, 6, +p.x.toFixed(1), +p.y.toFixed(1), +p.z.toFixed(1), tt.n] }); HUD.toast('TRACKERS', tt.n + ' dropped', 1.2); Audio.click(); } return true; }
    if (kind === 's') { const sc = own.scans[n]; if (!sc) return true; if (SEC.open === n) SEC.open = -1; else { SEC.open = n; SEC.cur = MODES.indexOf(sc.mode); SEC.sel = n; } Audio.click(); }
    else if (kind === 'o' && parseInt(a.split(':')[1], 10) === NOTCH_OPT) { notchSet(n); SEC.open = -1; }
    else if (kind === 'o') { const i = parseInt(a.split(':')[1], 10), sc = own.scans[n]; if (sc && MODES[i]) { modeSet(n, MODES[i], sc.sec.c, sc.sec.h); SEC.open = -1; SEC.sel = MODES[i] === 'sector' ? n : SEC.sel; } }
    return true;
  }
  // A left click in the hologram, now her trackers are scheduled (js/radar.ts schedule): on a track, it's kept tracked (her operator's
  // pick: looked at a couple of times a second, before anything of her own picture's), or, kept already, let go; on a radar warning's
  // chevron, a search along its bearing. Which dish does it is the scheduler's business. Told to everyone aboard (strk).
  function trkWant(p: RPlot, f: RFused | null, quiet = false) {
    const own = shownOwn()!, S0 = own.sched || Radar.sched(EW.own!), at = f ? f.pl : Radar.plotAt(EW.own!, p); // (what the server's picture holds decides keep or let go; the server does either: the request's sent by the caller)
    // (kept already: the track of its belief, or one where it is now (the track's newest solution, run on to now), either's spread allowed)
    const kept = S0.tts.find((q) => q.op && ((!!f && q.bel === f.n) || Radar.ttAt(q, EW.rt).distanceTo(at) < Math.max(200, 4 * q.kf.sig() + (f ? 3 * f.kf.sig() : 0))));
    if (kept) { if (!quiet) { HUD.toast('TRACKERS', kept.n + ' let go', 1.2); Audio.click(); } return 5; }
    if (!quiet) { HUD.toast('TRACKERS', 'finding it', 1.2); Audio.click(); } return 3;
  }
  function trkSend(): boolean {
    const H = EW.holo, it = H.pick; if (!EW.own || !it) return false;
    if (it.rwr) {
      const d = (it.rwr as THREE.Vector3).clone().applyQuaternion(S.Q).normalize();
      Net.toHost({ t: 'strk', a: [-1, 4, +d.x.toFixed(4), +d.y.toFixed(4), +d.z.toFixed(4)] }); HUD.toast('TRACKERS', 'searching that bearing', 1.2); Audio.click(); return true;
    }
    if (!it.plot) return false; const shown = sv(EW.own)!, p = it.plot as RPlot; // (the pick's in the server's picture: its plot and belief)
    const f = shown.fus.find((q) => (q.a && q.a.p === it.plot) || (q.b && q.b.p === it.plot)) || null;
    const code = trkWant(p, f); Net.toHost({ t: 'strk', a: [-1, code, p.k, p.phi, p.r] }); return true;
  }
  const wrapA = (a: number) => ((a % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
  // a ship's camera picture (js/radar.ts optical): what its quarter's camera sees with its zoom, eased while on one target and cut
  // between targets, rendered into V's target, read back and drawn on cv with the reticle and what it makes of it. For the seat's
  // view (OPTV, her own) and the debug view's (DBGV, whichever ship F8 shows)
  type CamV = typeof OPTV;
  function camDraw(V: CamV, su: RSuite, cv: HTMLCanvasElement, W: number, H: number) {
    const o = su.opt!; if (!V.rt) { V.rt = new T.WebGLRenderTarget(W, H); V.rt.texture.colorSpace = T.SRGBColorSpace; V.cam = new T.PerspectiveCamera(10, W / H, 1, 80000); V.buf = new Uint8Array(W * H * 4); V.img = new ImageData(W, H); }
    // (the view eased onto where the tracker's pointing and its zoom, a fraction of a second behind; a cut whenever it's on something
    // new: another target, the next step of a sweep along an arc, another quarter's camera)
    const dtv = V.t < 0 ? 1 : Math.min(0.25, Math.max(0, S.t - V.t)); V.t = S.t;
    const key = !o.job ? 'idle' : o.job.kind === 'acq' ? 'sweep:' + (o.e ?? 0).toFixed(3) : 'look:' + (o.job.tt ? o.job.tt.n : '') + ':' + o.jobT;
    if (V.q !== o.quad || V.fov <= 0 || V.key !== key) { V.q = o.quad; V.key = key; V.d.copy(o.b); V.fov = o.fov; }
    else { const k = 1 - Math.exp(-dtv * 7); V.d.lerp(o.b, k).normalize(); V.fov = Math.exp(Math.log(V.fov) + (Math.log(o.fov) - Math.log(V.fov)) * k); }
    V.f++;
    const cam = V.cam!, rm = S.root!.matrixWorld, mt = (q: number) => o.mts[q].clone().applyQuaternion(su.Q).add(su.P), at = mt(o.quad), look = at.clone().addScaledVector(V.d, 1000);
    { // (every frame: the picture's read back from the GPU)
      cam.position.copy(at).applyMatrix4(rm); cam.up.set(0, 1, 0).applyQuaternion(su.Q).transformDirection(rm); cam.lookAt(look.applyMatrix4(rm));
      cam.fov = Math.max(0.02, V.fov * 180 / Math.PI * (H / W)); cam.near = Math.max(1, (su.size || 10) * 0.4); cam.updateProjectionMatrix(); cam.updateMatrixWorld();
      // (the rock field's detail and culling are the view's: made for this camera for its picture, and back for the main one after)
      const lod = (c: THREE.Camera) => { if (ROCKS.obj && S.zone) { S.zone.updateWorldMatrix(true, false); ROCKS.obj.userData.lod(S.zone.worldToLocal(c.getWorldPosition(new T.Vector3())), c); } };
      const r = G_R.renderer, prev = r.getRenderTarget(); lod(cam); r.setRenderTarget(V.rt); r.clear(); r.render(G_R.scene, cam); r.readRenderTargetPixels(V.rt!, 0, 0, W, H, V.buf!); r.setRenderTarget(prev); lod(G_R.camera);
      const d = V.img!.data, b = V.buf!; for (let y = 0; y < H; y++) d.set(b.subarray((H - 1 - y) * W * 4, (H - y) * W * 4), y * W * 4); // (its rows bottom up: turned the right way)
    }
    const x = cv.getContext('2d')!; x.putImageData(V.img!, 0, 0);
    // (over it: the reticle where the tracker's pointing, in the eased picture, as big as what it's measured (or expected); what it's on, through which camera, how wide, what it makes of it)
    const tt = o.job && o.job.tt ? o.job.tt : null, c = tt && tt.cls, sz = c && c.conf > 0.5 ? ({ rock: 60, ship: 40, torpedo: 3, missile: 1.5, chaff: 25 } as Record<string, number>)[c.k] || 30 : 30, rp = Math.max(8, Math.min(W * 0.48, o.px >= Radar.OPT.det ? o.px / 2 * (W / Radar.OPT.px) : sz / Math.max(1, o.rng) / (o.fov / W)));
    const tp = mt(o.quad).addScaledVector(o.b, 1000).applyMatrix4(rm).project(cam), cx = (tp.x + 1) / 2 * W, cy = (1 - tp.y) / 2 * H, rq = rp * (o.fov / Math.max(1e-6, V.fov));
    x.strokeStyle = 'rgba(141,255,190,0.8)'; x.lineWidth = 1; x.strokeRect(cx - rq, cy - rq, 2 * rq, 2 * rq); x.beginPath(); for (const [a, b2, c2, d2] of [[0, cy, cx - rq - 6, cy], [cx + rq + 6, cy, W, cy], [cx, 0, cx, cy - rq - 6], [cx, cy + rq + 6, cx, H]]) { x.moveTo(a, b2); x.lineTo(c2, d2); } x.stroke();
    const fs = W < 400 ? 11 : 13; x.font = `500 ${fs}px Oxanium, system-ui, sans-serif`; x.textBaseline = 'top';
    const lines = [o.job && o.job.kind === 'acq' ? `SWEEPING ${(o as any).con ? (o as any).con.c.n : ''}'s arc: where on it is it?` : '', `OPTICAL · ${Radar.QUAD[o.quad]} camera · field ${(V.fov * 180 / Math.PI).toFixed(V.fov < 0.0175 ? 2 : 1)}°`, tt ? `${tt.n} · ${(o.rng / 1000).toFixed(2)} km (its track's)` : 'idle: nothing to look at', !tt ? '' : o.st === 'slew' ? 'turning to it' : o.px < Radar.OPT.det ? 'NO TARGET IN SIGHT (too small at this zoom, or nothing there)' : `${Math.round(o.px)} px across`, c ? `it's a ${c.k}${c.name ? ': ' + c.name : ''} · ${Math.round(c.conf * 100)}% sure` : tt && o.px >= Radar.OPT.det && o.px < Radar.OPT.cls ? 'a dot: too small to tell what it is' : ''];
    lines.filter(Boolean).forEach((l, i) => { x.fillStyle = 'rgba(0,0,0,0.55)'; x.fillRect(3, 3 + i * (fs + 4), x.measureText(l).width + 6, fs + 3); x.fillStyle = '#8dffbe'; x.fillText(l, 6, 4 + i * (fs + 4)); });
  }
  function optView() {
    const seat = mySeat(), o = EW.own && EW.own.opt, show = OPTV.on && !!seat && seat.k === 'sensors' && !!o && !!S.root && !Game.menuOpen();
    if (OPTV.cv) OPTV.cv.style.display = show ? '' : 'none';
    if (show && o) {
      const W = 480, H = 360;
      if (!OPTV.cv) { const c = document.createElement('canvas'); c.width = W; c.height = H; c.id = 'opt-view'; Object.assign(c.style, { position: 'fixed', right: '24px', top: '24px', width: W + 'px', height: H + 'px', border: '1px solid rgba(141,255,190,0.5)', background: '#000', zIndex: '36', pointerEvents: 'none' }); document.body.appendChild(c); OPTV.cv = c; }
      camDraw(OPTV, sv(EW.own!), OPTV.cv!, W, H);
    }
    // (and the debug view's (F8): the camera of the ship whose radars it shows, drawn in its 3D panel)
    const dsu = Radar.show && S.root ? sv(ewList().find((q) => q.id === Radar.sel)) : null;
    if (dsu && dsu.opt && dsu.sched) { if (DBGV.su !== dsu) { DBGV.su = dsu; DBGV.fov = 0; } if (!DBGV.cv) { const c = document.createElement('canvas'); c.width = 320; c.height = 240; DBGV.cv = c; } camDraw(DBGV, dsu, DBGV.cv!, 320, 240); RadarView.dbg.cam = DBGV.cv; }
    else RadarView.dbg.cam = null;
  }
  function sensorStep() {
    const seat = mySeat(), m = me(), H = EW.holo; EW.cu = null;
    if (seat && seat.k === 'sensors' && EW.own && !Game.menuOpen()) scanKeys(); else { SEC.sel = -1; SEC.open = -1; TRKK.sel = -1; }
    if (!seat || seat.k !== 'sensors' || !EW.own || Game.menuOpen()) { EW.l = EW.r = false; H.pick = null; if (H.focus && (!seat || seat.k !== 'sensors')) holoFocus(false); return; }
    // (held G: into the hologram (the room blurred behind it) or back out)
    // (G held: out of the hologram to look round the room; let go, back in)
    if (K('KeyG')) { if (H.focus) holoFocus(false); H.gDone = true; } else if (H.gDone) { H.gDone = false; holoFocus(true); }
    if (H.focus) { // (focused: the mouse's own cursor points at it, the right button held and dragged turns it)
      if (!Game.locked) { holoFocus(false); return; } // (Esc: the pause menu)
      { // (the view eased onto it: the mouse is the cursor's now, not the head's)
        const g = S.model!.group, w = H.c.clone().add(new T.Vector3(0, 0.2, 0)).applyMatrix4(g.matrixWorld), cam = G_R.camera, d = w.sub(cam.getWorldPosition(new T.Vector3())).applyQuaternion(g.getWorldQuaternion(new T.Quaternion()).invert()).normalize();
        const want = Math.asin(U.clamp(d.y, -1, 1)) + 0.08, f = new T.Vector3(0, 0, -1).applyQuaternion(cam.getWorldQuaternion(new T.Quaternion())).applyQuaternion(g.getWorldQuaternion(new T.Quaternion()).invert()), dyaw = Math.atan2(-d.x, -d.z) - Math.atan2(-f.x, -f.z);
        m.pitch += (want - Math.asin(U.clamp(f.y, -1, 1))) * 0.15; m.yaw += Math.atan2(Math.sin(dyaw), Math.cos(dyaw)) * 0.15;
      }
      if (H.mr) { H.rot.premultiply(new T.Quaternion().setFromAxisAngle(new T.Vector3(0, 1, 0), H.dx * 0.008)).premultiply(new T.Quaternion().setFromAxisAngle(new T.Vector3(1, 0, 0), H.dy * 0.008)).normalize(); if (Math.abs(H.dx) + Math.abs(H.dy) > 2) H.moved = true; }
      H.dx = H.dy = 0;
      if (!H.mr && EW.r && !H.moved && S.t - H.rAt < 0.3) { Net.toHost({ t: 'srcue', a: [-1] }); Audio.click(); }
      if (H.mr && !EW.r) { H.rAt = S.t; H.moved = false; }
      _ray.setFromCamera(new T.Vector2(H.mx / innerWidth * 2 - 1, 1 - H.my / innerHeight * 2), G_R.camera); H.pick = RadarView.holoPick(_ray.ray, G_R.camera);
      // (the cursor: a small ring where the mouse is; over a track, it slides onto it and opens into a halo round it)
      if (H.cur) {
        let tx = H.mx, ty = H.my, tr = 7; const w = H.pick && RadarView.holoWorld(H.pick);
        if (w) { const p = w.project(G_R.camera); tx = (p.x + 1) / 2 * innerWidth; ty = (1 - p.y) / 2 * innerHeight; tr = 17; }
        const k = 0.35; H.cx += (tx - H.cx) * k; H.cy += (ty - H.cy) * k; H.cr += (tr - H.cr) * k;
        const st = H.cur.style; st.width = st.height = (2 * H.cr) + 'px'; st.transform = `translate(${H.cx - H.cr - 2}px, ${H.cy - H.cr - 2}px)`;
        st.borderColor = w ? (H.pick.col || '#ffffff') : 'rgba(140,230,255,0.95)'; st.borderWidth = w ? '2.5px' : '2px';
      }
      if (H.ml && !EW.l && !boxClick(H.mx, H.my)) trkSend(); // (only with a tracker picked, 3 or 4: no picking one for you)
      EW.l = H.ml; EW.r = H.mr; return;
    }
    if (!H.placed && S.model && H.sat >= 0 && S.t - H.sat > 0.25) { // (put where its operator has it: centred in front of the seat, just below their eyes; once, the view settled at the seat)
      const g = S.model.group, inv = g.matrixWorld.clone().invert(), gq = g.getWorldQuaternion(new T.Quaternion()).invert(), cam = G_R.camera;
      const eye = cam.getWorldPosition(new T.Vector3()).applyMatrix4(inv), f = new T.Vector3(0, 0, -1).applyQuaternion(cam.getWorldQuaternion(new T.Quaternion())).applyQuaternion(gq); f.y = 0; f.normalize();
      f.applyAxisAngle(new T.Vector3(0, 1, 0), H.sy - m.yaw); // (the way the seat faces, however they've looked round since)
      H.c.copy(eye).addScaledVector(f, H.R + 0.42).add(new T.Vector3(0, -0.3, 0)); H.placed = true;
    }
    if (H.auto && H.placed && S.t - H.sat > 0.3) { H.auto = false; holoFocus(true); } // (sat down: into it)
    if (m.mouse.r) {
      if (!EW.r) { H.rAt = S.t; H.moved = false; H.y0 = m.yaw; H.p0 = m.pitch; }
      const dy = m.yaw - H.y0, dp = m.pitch - H.p0; if (Math.abs(dy) + Math.abs(dp) > 0.003) H.moved = true;
      H.rot.premultiply(new T.Quaternion().setFromAxisAngle(new T.Vector3(0, 1, 0), -dy * 2.5)).premultiply(new T.Quaternion().setFromAxisAngle(new T.Vector3(1, 0, 0), -dp * 2.5)).normalize();
      m.yaw = H.y0; m.pitch = H.p0; // (the view held still)
    } else if (EW.r && !H.moved && S.t - H.rAt < 0.3) { Net.toHost({ t: 'srcue', a: [-1] }); Audio.click(); }
    _ray.setFromCamera(new T.Vector2(0, 0), G_R.camera); H.pick = RadarView.holoPick(_ray.ray, G_R.camera);
    if (m.mouse.l && !EW.l) trkSend();
    EW.l = m.mouse.l; EW.r = m.mouse.r;
  }
  // the debug view's cameras (F8 the second and third time): behind and above her, and off to the side of both ships, looking at their middle
  // the debug view's camera: on another ship's radar, off her quarter and above her, looking at her (her own: as she is)
  function ewCam() {
    if (!Radar.show || Radar.sel === 'own' || !S.root || !S.model) return;
    const su = ewList().find((q) => q.id === Radar.sel); if (!su) return;
    const cam = G_R.camera, P = su.P.clone().applyMatrix4(S.root.matrixWorld), d = Math.max(60, su.size * 5), off = new T.Vector3(1, 0.55, 0.9).normalize().multiplyScalar(d * 1.6).applyQuaternion(su.Q.clone().premultiply(S.root.getWorldQuaternion(new T.Quaternion())));
    cam.position.copy(P).add(off); cam.lookAt(P);
    (cam as THREE.PerspectiveCamera).far = Math.max((cam as THREE.PerspectiveCamera).far, 40000); (cam as THREE.PerspectiveCamera).updateProjectionMatrix(); cam.updateMatrixWorld();
  }
  // the sectors for the hologram: each scanner's searching one, and the one the keys are setting (selected)
  function secView() {
    const own = sv(EW.own); if (!own) return { secs: [] as { k: number; c: number; h: number; on: boolean; sel: boolean }[], boxes: [] as { mode: string; open: boolean; cur: number; opts: string[]; sel: boolean }[], trkSel: -1 };
    const secs: { k: number; c: number; h: number; on: boolean; sel: boolean }[] = [];
    own.scans.forEach((sc, k) => { if (sc.sec.on || SEC.sel === k || (SEC.open === k && MODES[SEC.cur] === 'sector')) secs.push({ k, c: sc.sec.c, h: sc.sec.h, on: sc.sec.on, sel: SEC.sel === k || SEC.open === k }); }); // (searching a sector, or picked, or about to: its sector shown)
    const boxes = own.scans.map((sc, k) => ({ mode: sc.mode, notch: !!sc.notch, open: SEC.open === k, cur: SEC.open === k ? SEC.cur : MODES.indexOf(sc.mode), opts: optsOf(sc), sel: SEC.sel === k }));
    return { secs, boxes, trkSel: TRKK.sel };
  }
  // her warning receiver's picture: each radar on her and the way to it (in her frame), and what it's doing: a tracker locked on
  // her, one sweeping for her, a scanner's beam going over her (a moment ago)
  function rwrNow(): { d: THREE.Vector3; kind: 'lock' | 'trk' | 'scan'; age: number }[] {
    if (!EW.own) return []; const qi = S.Q.clone().invert(), out: { d: THREE.Vector3; kind: 'lock' | 'trk' | 'scan'; age: number }[] = [];
    // (one a ship, the most she's doing: a lock over a tracker sweeping, over a scanner's paint)
    const by = new Map<string, typeof out[0]>(), rank = { lock: 3, trk: 2, scan: 1 } as const;
    const put = (k: string, w: typeof out[0]) => { const ship = k.split(':')[0], h = by.get(ship); if (!h || rank[w.kind] > rank[h.kind] || (w.kind === h.kind && w.age < h.age)) by.set(ship, w); };
    const W0 = SVB.rwr && S.t - SVB.ownAt < 1 ? SVB.rwr : null; // (the server's radars' word of who's on her)
    if (W0) { for (const e of W0.trk) put(e.k, { d: new T.Vector3(e.f[0], e.f[1], e.f[2]).sub(S.P).applyQuaternion(qi), kind: e.lk ? 'lock' : 'trk', age: 0 }); for (const e of W0.scan) put(e.k, { d: new T.Vector3(e.f[0], e.f[1], e.f[2]).sub(S.P).applyQuaternion(qi), kind: 'scan', age: e.a }); out.push(...by.values()); return out.slice(0, 8); }
    out.push(...by.values()); return out.slice(0, 8);
  }
  // the clock started again (a new level): every time the radars stamped is from the old one; what they hold is let go (her
  // search radars keep their modes and sectors), and nobody's radar is on anyone yet
  // come up with another of the zone's ships (the level's her now, the same space): her set's picture moved from the old level's
  // frame to the new one's, by how her own place and heading moved (x' = R (x - P0) + P1, R = Q1 Q0^-1)
  function ewMove() {
    const pre = EW.pre; EW.pre = null; if (!pre || !EW.own) return;
    const R = S.Q.clone().multiply(pre.Q.clone().invert()), t = S.P.clone().sub(pre.P.clone().applyQuaternion(R));
    Radar.rebase(EW.own, R, t);
    for (const tp of TP.list) { tp.p.applyQuaternion(R).add(t); tp.v.applyQuaternion(R); tp.q.premultiply(R); tp.est.applyQuaternion(R).add(t); tp.ev.applyQuaternion(R); tp.side.applyQuaternion(R); } // (torpedoes in flight: the same space)
  }
  function ewTimeReset() {
    Radar.warnClear();
    for (const tp of TP.list.slice()) torpGone(tp, 3); // (a jump: left behind)
    for (const su of [EW.own, EW.foe]) {
      if (!su) continue;
      for (const sc of su.scans) { sc.age.fill(-1e9); sc.plots = []; sc.cons = []; sc.pend = []; sc.col = -1; }
      for (const t of su.trks) Radar.drop(t);
      su.fus = []; su.bel = []; su.fusHist.clear(); su.fusKF.clear(); su.fusSeen.clear(); su.fusIds.clear(); su.ass = []; su.assHold.clear(); su.fusT = -1; su.init = false;
    }
  }
  // The zone's ships the squad's ship is coming up with (within 5 km) or going away from (over 8 km), told to the host (by whoever
  // flies it): their levels made ahead, live, so coming up with one changes nothing that's seen (docs/zone-levels.md)
  const nearSent = new Set<number>(); let nearOf = -2;
  function ewNear() {
    if (S.kind !== 'board' || !S.zinfo || !isCtl() || C2.on) return; // (the server's, while it flies her: js/svbattle.ts near)
    if (nearOf !== S.zinfo.ms.seed) { nearSent.clear(); nearOf = S.zinfo.ms.seed; }
    if (!nearSent.has(S.zact)) { nearSent.add(S.zact); Net.toHost({ t: 'tnear', k: S.zact }); } // (the one she's at: near it, as she's at it)
    for (const q of S.traffic) {
      const k = q.c.k; if (k == null || !q.wp) continue; // (the one she's at too: the host keeps it live as she goes on to another, while she's near it)
      const d = S.P.distanceTo(q.wp.p);
      if (d < 5000 && !nearSent.has(k)) { nearSent.add(k); Net.toHost({ t: 'tnear', k }); }
      else if (d > 8000 && nearSent.has(k)) { nearSent.delete(k); Net.toHost({ t: 'tfar', k }); }
    }
  }
  // What the pilot's shown comes from her sensors, not from knowing: a ship of the zone's is a waypoint only once her radars hold a
  // contact that answers to its name (the mission's ship's place is known from the mission itself); everything else her radars
  // hold in 3D is a track point (trkMarks: where, what it is to her, its colour), one on a waypoint already shown left out
  const TCOL: Record<string, string> = { HOSTILE: '#ff4a3a', SUSPECT: '#ffa040', WATCH: '#ffe070', NEUTRAL: '#a8b8c4', CIV: '#7f9fb0', FRIENDLY: '#70f090' };
  function ewMarks() {
    const su = sv(EW.own), names = new Set<string>(); S.trkMarks = [];
    if (su) for (const sc of su.scans) for (const c of sc.cons) if (c.hits >= 2 && c.iff) names.add(c.iff.n);
    for (const w of S.wps) if (/^t\d+$/.test(w.id) && w.id !== 't0') w.unseen = !names.has(w.name);
    if (S.wps[S.tgt] && S.wps[S.tgt].unseen) { const j = S.wps.findIndex((w) => !w.hide && !w.unseen && w.kind === 'anchor'); if (j >= 0) S.tgt = j; }
    if (!su) return;
    for (const a of su.ass) {
      // (a 3D track where it is; a contact only the bearing scanner holds, at its bearing and range, level with her: its height not known)
      // (a contact only one scanner holds: where it could be, all along its fan at its angle and range (a 'y' contact's height not
      // known, a 'z' one's place fore and aft), a faint line, its middle where the label goes)
      let p: THREE.Vector3 | null = null, arc: THREE.Vector3[] | undefined;
      if (a.f) p = a.f.pl; else if (a.c && a.plot) { const sc = su.scans[a.plot.k], dt = EW.rt - a.c.t, phi = wrapA(a.c.A + a.c.vA * dt + sc.off), r = a.c.r + a.c.vr * dt; arc = []; for (let i = 0; i <= 16; i++) arc.push(Radar.arcAt(sc, phi, r, -sc.fan + 2 * sc.fan * i / 16, new T.Vector3()).applyQuaternion(S.Q).add(S.P)); p = arc[8]; }
      if (!p) continue;
      const flat = !!arc;
      const tsel = !!a.f && (a.f.n === TP.pick || a.f.n === TP.look); // (the fix the pilot's looking at or has picked for a torpedo: shown, on a waypoint or not)
      if (!tsel && !arc && S.wps.some((w) => !w.hide && !w.unseen && w.p.distanceTo(p) < Math.max(300, 0.06 * a.r))) continue;
      const nm = a.iff ? (a.iff.c === 'civ' ? 'CIV ' : a.iff.c === 'navy' ? 'NAVY ' : '') + a.iff.n : '?';
      const fn = a.f ? a.f.n : '', pick = !!fn && fn === TP.pick, look = !!fn && fn === TP.look && !pick;
      S.trkMarks.push({ p: p.clone(), label: `${a.n} ${a.cls} · ${nm}${flat ? (su.scans[a.plot!.k].ax === 'y' ? ' · height ?' : ' · fore-aft ?') : ''}${pick ? ' · TORPEDO TARGET' : look ? ' · click: pick' : ''}`, col: TCOL[a.cls] || '#ffffff', look, pick, arc });
    }
  }
  // every ship's radar the debug view can show (F8 goes through them): hers, the mission ship's, the zone's ships near enough
  function ewList(): RSuite[] {
    if (EW.own) EW.own.name = S.def.name; if (EW.foe) EW.foe.name = hullName();
    return [EW.own, EW.foe, ...SVB.list.map(([id, name]) => { let q = SVB.stubs.get(id); if (!q) { q = Radar.suite(id, 10, 5, 5, -5, 2); SVB.stubs.set(id, q); } q.name = name; return q; })].filter((q): q is RSuite => !!q); // (the zone's ships' with radars on, as the server has them, nearest first: what F8 shows of each is the server's picture of it, sv)
  }
  // A suite as the page draws it: the server's picture of it (js/suiteview.ts, sent by js/spaceserver.ts battle): hers ten times a
  // second to everyone aboard, F8's with its extras to whoever has it open
  const shownOwn = () => sv(EW.own); // (her radars' picture as it's shown: the server's)
  // Her radars' picture comes ten times a second; between pictures it's run on here, a frame at a time, so what's drawn from it moves
  // smoothly instead of in tenth-of-a-second steps: her own place and heading the page's (she's flown here, every frame), each belief
  // carried on by its velocity, and each scanner's beam turned on as the server turns it (Radar.sweep: round, or back and forth across
  // its sector). What's timed in it already runs on by the radars' clock (EW.rt: contacts' bearings, tracks' filters, jobs' progress).
  // A new picture puts it all back to the server's (svBase: as it came, and when), a belief's new place eased in over a sixth of a second
  // from where it was drawn (off: the difference, fading) rather than jumped to: a new measurement moves the server's estimate. At most
  // half a second on: a picture late longer than that holds where it got to.
  type SvBase = { rt: number; pl: THREE.Vector3[]; off: (THREE.Vector3 | null)[]; th: number[]; dir: number[]; at: number };
  const svShown = new Map<string, THREE.Vector3>(); // (each belief where it was last drawn, by name)
  function svBase(su: RSuite) {
    const bel = su.bel || [];
    const off = bel.map((b) => { const w = svShown.get(b.n); if (!w) return null; const d = w.clone().sub(b.pl); return d.length() < 300 ? d : null; }); // (far off: a different thing under the name now, or a fresh fix: jumped to)
    const B: SvBase = { rt: EW.rt, pl: bel.map((b) => b.pl.clone()), off, th: su.scans.map((sc) => sc.th), dir: su.scans.map((sc) => sc.sec.dir), at: -1 };
    (su as any)._fill = B;
    svShown.clear();
  }
  const _svq = new T.Quaternion();
  function svFill(su: RSuite) {
    const B = (su as any)._fill as SvBase | undefined; if (!B || B.at === EW.rt || !SVB.fill) return; B.at = EW.rt;
    const dt = Math.min(0.5, Math.max(0, EW.rt - B.rt));
    su.P.copy(S.P); su.Q.copy(S.Q); su.V.copy(S.V); _svq.copy(su.Q).invert();
    const fade = Math.exp(-dt / 0.06);
    (su.bel || []).forEach((b, i) => { const p0 = B.pl[i]; if (!p0) return; b.pl.copy(p0).addScaledVector(b.v, dt); const o = B.off[i]; if (o) b.pl.addScaledVector(o, fade);
      b.p.copy(b.pl).sub(su.P).applyQuaternion(_svq); b.r = b.pl.distanceTo(su.P); let w = svShown.get(b.n); if (!w) svShown.set(b.n, (w = new T.Vector3())); w.copy(b.pl); });
    su.scans.forEach((sc, k) => { if (B.th[k] == null || sc.mode === 'off') return; sc.th = B.th[k]; sc.sec.dir = B.dir[k]; Radar.sweep(sc, dt); });
  }
  function sv(su: RSuite): RSuite; function sv(su: RSuite | null | undefined): RSuite | null;
  function sv(su: RSuite | null | undefined): RSuite | null {
    if (!su) return null;
    if (Radar.show) { const d = SVD.v.get(su.id); if (d && S.t - (SVD.at.get(su.id) ?? -1e9) < 1.5) return d; } // (F8 open: its own picture of the suite, extras and all)
    if (su === EW.own) { if (SVB.own) svFill(SVB.own); return SVB.own || su; } // (her radars' picture: the server's (svOwn), run on to now (svFill); none come yet, her set as the crew have it, empty)
    return SVD.v.get(su.id) || su;
  }

  // ------------------------------------------------------------------ coming and going
  function leave() {
    InteriorCull.clear();
    holoFocus(false); G_R.focusBlur = false; EW.holo.fO = -1;
    RadarView.update(null, false, [], [], '', 0); RadarView.holo(null, null, new T.Vector3(), 0, new T.Quaternion(), 0, false, null); for (const c of EW.chaff) if (c.pts) c.pts.removeFromParent(); EW.chaff = [];
    if (!S.on && !S.model) return;
    if (S.on && S.kind === 'board' && S.tclose && S.zone && !(S.carry && S.carry.k === S.tclose.k)) { // (the helm's, as it decided: js/helm.ts close; else as she is now)
      const q = S.traffic.find((o) => o.c.k === S.tclose!.k && o.wp);
      if (q) { const z = SD.zonePos(q.c, S.zt0 + (S.t - S.ztAt)), d = new T.Vector3(z.d[0], 0, z.d[2]).applyQuaternion(S.zone.quaternion); S.carry = { k: q.c.k!, v: S.P.clone().sub(q.wp!.p), yaw: Math.atan2(d.x, d.z), Q: S.Q.clone(), V: S.V.clone() }; }
    }
    if (S.on && S.kind === 'board' && S.tclose && S.zone && S.zinfo && S.hull && S.map && S.map.sp && S.hull.group.parent) { // (and her hull's kept as it is, holes and all: she's one of the others now, zoneReal)
      const hb = S.map.sp.hull, holder = new T.Group(), h = S.hull; h.marker.visible = false;
      h.group.removeFromParent(); h.group.position.set(-(hb.x0 + hb.x1) / 2, 0, -(hb.z0 + hb.z1) / 2); holder.add(h.group); h.group.userData.prof = 'zone ship hull';
      if (zoneHullsOf !== S.zinfo.ms.seed) { zoneClear(); zoneHullsOf = S.zinfo.ms.seed; }
      zoneHulls.set(S.zinfo.ms.seed + ':' + S.zact, { holder, h, bow: S.map.sp.wing ? Math.atan2(-1, -1) : Math.atan2(-1, 0), map: null, key: '' });
    }
    if (S.on && me().pos && aboard()) { const p = SD.toShip(S.berth, me().pos.x, me().pos.y, me().pos.z); S.keep = { x: p.x, y: p.y, z: p.z, yaw: me().yaw - S.berth.yaw }; } else S.keep = null;
    // (and how you're looking, crouched and holding your gun, for coming up with another of the zone's ships: nothing of your view
    // changes when she becomes the level, enterLevel)
    { const m = me(); S.look = S.on && S.kind === 'board' && S.tclose && m.pos ? { yaw: m.yaw - S.berth.yaw, pitch: m.pitch, eyeH: m.eyeH, stowW: m.stowW || 0, crouch: m.crouch, stowed: !!m.stowed } : null; }
    unhide();
    for (const o of [S.model && S.model.group, S.root, S.stars, S.tunnel, S.sun, S.starObj]) if (o && o.parent) o.parent.remove(o);
    S.starObj = null; S.star = null; S.rockList = []; ROCKS.near = []; ROCKS.tg.clear(); ROCKS.r.clear(); ROCKS.zt = -1; ROCKS.obj = null; ROCKS.v.set(0, 0, 0); Radar.occ.length = 0;
    litSeat = -1;
    if (S.sun && S.sun.target.parent) S.sun.target.parent.remove(S.sun.target);
    G_R.levelRoot.position.set(0, 0, 0); G_R.levelRoot.quaternion.identity(); G_R.levelRoot.visible = true;
    S.model = null; S.root = null; S.stars = null; S.tunnel = null; S.sun = null; S.hull = null; S.planet = null; S.solids = []; S.wps = []; S.anchors = []; S.things = []; S.cardObjs = [];
    if (hid) { for (const o of hid) o.visible = true; hid = null; } tunUp = null;
    G_R.padTo = G_R.PAD_BASE;
    S.on = false; S.map = null; S.ftl = null; S.thru = null; S.veil = null; S.warp = null; S.spin = 0; S.auto = null; S.net = null; S.boomT = -1; S.tracers = []; S.rounds = []; S.mis = []; myShots.length = 0;
    if (me().seat != null) me().seat = null;
    SpaceUI.show(false);
  }
  // off for good (the menu, the lobby): nothing kept
  function reset() { leave(); if (jumpPre) { viewDrop(jumpPre.map); jumpPre = null; } S.keep = null; S.ms = null; S.state = null; S.seats = {}; S.ctl = null; SpaceUI.closeOps(); veilKind(null); }

  function setup(map: LvMap, kind: SpKind, sp: any) {
    EW.pre = S.on ? { P: S.P.clone(), Q: S.Q.clone() } : null; // (where she was, in the old level's frame: what her radars hold is moved to the new one's (ewMove))
    const keep = S.keep; leave(); S.keep = keep;
    S.on = true; S.kind = kind; S.map = map; S.t = 0; S.stage = 'space';
    // (the battle's random numbers from the level's seed: the same level, the same battle (js/radar.ts RNG); her own suite's stream begun again)
    Radar.seed(((map && map.seed) || 1) * 31 + ((map && map.level) || 0)); SR = Radar.rngOf('space'); if (EW.own) Radar.reseed(EW.own);
    S.fleet = SD.cleanFleet(sp && sp.fleet); S.def = SD.SHIPS[S.fleet.ship]; S.seatsDef = SD.seats(S.def);
    S.hpMax = S.def.hull * (SD.fitted(S.fleet, 'plating') ? 1.5 : 1); if (kind === 'hub' && (!sp || !sp.ship || sp.ship.docked)) S.hp = S.hpMax; S.hp = Math.min(S.hp, S.hpMax);
    S.seats = (sp && sp.seats) || {}; S.ctl = sp && sp.ship ? sp.ship.ctl : null;
    if (sp && sp.board) setBoard(sp.board);
    // her berth
    const d = S.def;
    S.berth = helmBerth(kind, map, d); // (the hub's pad; her breach deck level with the hull's, the rest of her below it; the pad outside a base: js/helm.ts)
    S.Dp.set(S.berth.x, S.berth.y, S.berth.z); S.Dq.copy(berthQ(S.berth));
    // the ship herself, and her deck in the world
    const m = S.model = ShipModel.ship(d, S.fleet); m.group.userData.prof = 'own ship';
    m.group.position.copy(S.Dp); m.group.quaternion.copy(S.Dq); G_R.scene.add(m.group);
    S.solids = []; deck();
    hatchMesh();
    // what's out there
    S.root = new T.Group(); S.root.userData.prof = 'space: other'; G_R.scene.add(S.root);
    S.stars = ShipModel.stars(7); S.stars.userData.prof = 'sky'; G_R.scene.add(S.stars);
    S.tunnel = ShipModel.tunnel(); S.tunnel.visible = false; m.group.add(S.tunnel);
    S.sun = new T.DirectionalLight(0xfff4e0, 0); G_R.scene.add(S.sun, S.sun.target);
    // (the system's star: the base's an ordinary one; a mission's by its seed, the same for the whole of it (js/spacedata.ts star))
    S.star = SD.star(kind === 'hub' ? null : S.zinfo && S.zinfo.ms ? S.zinfo.ms.seed : map.seed); S.sun.color.setHex(S.star.light);
    S.starObj = ShipModel.starModel(S.star).group; G_R.scene.add(S.starObj);
    G_R.padTo = PAD_POINTS; // (as many point lights at the base, on the jump and aboard: nothing's shaders made again on the way, js/render.ts lightPad)
    // (what she was steering for, as a zone's ship (its number) or her anchor: kept across a change of which ship's the level, js/space.ts setupBoard)
    { const w = S.wps[S.tgt]; tgtWas = !w ? null : w.id === 'ship' ? S.zact : w.id === 'out' ? 'out' : /^t\d+$/.test(w.id) ? +w.id.slice(1) : null; }
    S.wps = []; S.anchors = []; S.boxes = []; S.floorAt = null; S.hull = null; S.planet = null; S.things = []; S.cardObjs = []; S.term = null;
    const docked = !sp || !sp.ship || !!sp.ship.docked;
    S.docked = docked; S.noseT = 0; S.rampT = docked && kind !== 'board' ? 1 : 0;
    S.hatchOpen = !(sp && sp.ship && sp.ship.hatch === 0); S.hatchT = S.hatchOpen ? 1 : 0; // (as the host has it: shut by a breach till its button's pressed)
    S.V.set(0, 0, 0); S.Wv.set(0, 0, 0); S.stick.set(0, 0); S.auto = null; S.net = null; S.cruise = false; S.warp = null; S.spin = 0; S.tvJ = -1;
    SpaceSim.zoneReset(ZS); S.zone = new T.Group(); S.zone.userData.prof = 'zone: other'; S.root.add(S.zone); S.zoneV.set(0, 0, 0); S.traffic = []; S.zdef = []; S.zact = 0; S.tclose = null; S.match = null; S.zt0 = (Date.now() / 1000) % 86400; S.ztAt = S.t;
    if (kind === 'hub') setupHub(map, sp); else if (kind === 'board') setupBoard(map); else setupAssault(map);
    // where she is: her helm's arrival (js/helm.ts arrive: on her berth, come up with the ship that's the level now, or out of the jump),
    // the server's the same from the same (told a new place's begun: C2.nl)
    { const zi = S.zinfo, near = kind === 'board' && !!(zi && zi.near), carried = near && !!S.carry && S.carry.k === (zi ? zi.act : -1);
      const ao = { docked, at: kind === 'hub' && sp && sp.ship && !sp.ship.docked ? sp.ship.at : null, near, act: zi ? zi.act : 0 }; HM.arrive(ao);
      if (kind === 'board') { if (carried) ewMove(); else if (!near) ewTimeReset(); } // (her radars' picture moved with her; come in by a jump, nothing out here seen yet)
      C2.nl = ao; SpaceSim.zoneReset(ZS); } // (the host's word of the place, as it set her up here: the server puts her where the same says; the zone's frame begun at her first step, as the server's is)
    syncSolids();
    // the sky: space is black, and reaches a long way
    const cam = G_R.camera; cam.far = 60000; cam.updateProjectionMatrix();
    const fog = G_R.scene.fog as THREE.Fog; fog.near = 1e6; fog.far = 2e6;
    sky();
    // you, aboard where you were (the ship came here with you in it), or aboard anyway if she isn't against anything
    if (S.keep || !docked) {
      const L = SD.layout(d), k = S.keep || { x: 0, y: L.FM, z: L.z1 - 2.2, yaw: 0 }, w = SD.toWorld(S.berth, k.x, k.y + 0.02, k.z); // (where you stood in her, on whichever deck)
      me().pos.set(w.x, w.y, w.z); me().yaw = S.berth.yaw + k.yaw;
    }
    S.keep = null;
    // back in the seat you had (the host still has you in it)
    const mine = S.seats[Net.myId!];
    if (mine != null && S.seatsDef[mine] && (!docked || kind !== 'hub')) sit(mine, true);
    if (kind !== 'hub') G_R.batchLevel(map); // (her static pieces in a call a material, now nothing more's cut from them: js/render.ts)
    if (kind === 'board' && G_R.levelView) { const hl = S.hull as ReturnType<typeof ShipModel.hull> | null; InteriorCull.track(G_R.levelView, map, () => (S.hull ? S.hull.holes : []), hl ? hl.group : null); } // (her inside drawn only where it can be seen, from out here: js/interiorcull.ts)
    SpaceUI.show(true);
    outside();
  }
  function sky() {
    const space = S.kind !== 'assault' || S.stage !== 'atmo', th = S.map!.theme;
    (G_R.scene.background as THREE.Color).setHex(space ? 0x000003 : th.fog);
    if (S.stars) S.stars.visible = space;
    const fog = G_R.scene.fog as THREE.Fog;
    if (space) { fog.near = 1e6; fog.far = 2e6; } else { fog.color.setHex(th.fog); fog.near = 300; fog.far = 5200; }
  }
  // her deck's boxes, where she's berthed (in the world once syncSolids has put them there)
  function deck() {
    const w = S.map && S.map.world;
    if (S.map) Level.setTilt(S.map, S.def, S.berth); // (lying tilted: her own gravity aboard her, js/level.ts)
    S.solids = S.solids.filter((q) => { if (q.tag === undefined && !q.ship) return true; if (q.on && w) World.remove(w, q.s); return false; });
    if (w && w.ramps) w.ramps = w.ramps.filter((st: any) => !S.flights.includes(st));
    // her flights of stairs as a level's are: slopes to walk up (js/world.ts rampAt), their steps theirs
    const B = S.berth, alongX = Math.abs(Math.sin(B.yaw)) > 0.5;
    S.flights = B.pt ? [] : SD.flights(S.def).map((fl) => { // (lying tilted: no slopes, her treads steps to climb)
      if (Math.abs(Math.sin(2 * B.yaw)) > 1e-6) // (lying at an angle: the flight in her own frame, js/world.ts rampAt turns into it)
        return { tag: fl.tag, yb: { x: B.x, z: B.z, c: Math.cos(B.yaw), s: Math.sin(B.yaw) }, axis: 'z', up: fl.zh > fl.zf ? 1 : -1, x0: Math.min(fl.x0, fl.x1), x1: Math.max(fl.x0, fl.x1), z0: Math.min(fl.zf, fl.zh), z1: Math.max(fl.zf, fl.zh), y0: B.y + fl.y0, rise: fl.rise, n: fl.n, f: 0, steps: [] as any[], on: false };
      const a = SD.toWorld(B, fl.x0, 0, fl.zf), c = SD.toWorld(B, fl.x1, 0, fl.zh), foot = alongX ? a.x : a.z, head = alongX ? c.x : c.z;
      return { tag: fl.tag, axis: alongX ? 'x' : 'z', up: head > foot ? 1 : -1, x0: Math.min(a.x, c.x), x1: Math.max(a.x, c.x), z0: Math.min(a.z, c.z), z1: Math.max(a.z, c.z), y0: B.y + fl.y0, rise: fl.rise, n: fl.n, f: 0, steps: [] as any[], on: false };
    });
    for (const q of SD.worldBoxes(S.def, S.berth)) S.solids.push({ s: null, tag: q.tag, ship: true, on: false, fl: S.flights.find((f) => f.tag === q.tag), b: q.b, yb: q.yb, ob: q.ob });
  }
  // ---- breaching her anywhere (js/shipgen.ts sites, cut). The berth goes to the site: nose-on to that stretch of hull.
  const berthAt = (s: { x: number; z: number; nx: number; nz: number; ang?: number; pt?: number }) => SD.berthAt(S.def, s);
  const siteAt = (a: number[]) => { const map = S.map!, W = map.W, TS = Level.TS, x = a[0] % W, z = (a[0] / W) | 0, ax = a[2] ? 1 : 0, az = a[1] ? 1 : 0; return { c: a[0], nx: a[1], nz: a[2], x: (x + 0.5) * TS, z: (z + 0.5) * TS, cells: [-1, 0, 1].map((k) => (z + az * k) * W + x + ax * k), ang: a[3] || 0, pt: a[4] || 0 } as ShSite; }; // (a[3]: an angled breach's, degrees off square; a[4]: nose up)
  // she stands somewhere else now: her deck with her, and you if you're aboard (her pose in the level is what it was)
  function rebase(b: { x: number; y: number; z: number; yaw: number; pt?: number }) {
    const m = me(), was = S.berth, ab = !!m.pos && aboard(), loc = ab ? SD.toShip(was, m.pos.x, m.pos.y, m.pos.z) : null;
    S.berth = b; S.Dp.set(b.x, b.y, b.z); S.Dq.copy(berthQ(b));
    if (S.model) { S.model.group.position.copy(S.Dp); S.model.group.quaternion.copy(S.Dq); }
    deck(); syncSolids();
    if (loc && m.seat == null) { const w = SD.toWorld(b, loc.x, loc.y, loc.z); m.pos.set(w.x, w.y, w.z); m.yaw += b.yaw - was.yaw; }
  }
  // An angled breach's tunnel (js/shipgen.ts tunnelPath: from her collar, curving round to straight in), as torn plating: a floor plate,
  // each side in two buckled panels, a sagging roof and a rib at each joint, more crumpled toward the hull where it took the blow. Its
  // own dice from the site, so it looks the same on every screen.
  function tunnelMesh(s: ShSite) {
    const path = ShipGen.tunnelPath(s), TN = ShipGen.TUN, g = new T.Group(), rnd = U.rng(s.c * 7 + 13);
    const plate = ShipModel.M(0x5d6266, { metalness: 0.7, roughness: 0.45 }), dark = ShipModel.M(0x24272b, { metalness: 0.6, roughness: 0.7 }), hot = ShipModel.M(0x4a2c18, { roughness: 0.85 });
    for (let i = 0; i < path.length - 1; i++) {
      const a = path[i], b = path[i + 1], len = Math.hypot(b.x - a.x, b.z - a.z), seg = new T.Group(), k = 0.15 + 0.5 * (1 - i / (path.length - 1)), j = () => (rnd() - 0.5) * k;
      seg.position.set((a.x + b.x) / 2, 0, (a.z + b.z) / 2); seg.rotation.y = Math.atan2(-(b.x - a.x), -(b.z - a.z));
      const add = (w: number, h: number, d: number, x: number, y: number, z: number, m: THREE.Material, rx = 0, ry = 0, rz = 0) => { const o = new T.Mesh(new T.BoxGeometry(w, h, d), m); o.position.set(x, y, z); o.rotation.set(rx, ry, rz); o.castShadow = true; o.receiveShadow = true; seg.add(o); };
      add(TN.HW * 2 + 0.2, 0.06, len + 0.1, 0, 0.03, 0, dark, j() * 0.1, 0, j() * 0.1); // (the floor plate)
      for (const sd of [-1, 1]) for (let q = 0; q < 2; q++) add(0.05, TN.H / 2 + 0.05, len + 0.12, sd * (TN.HW + 0.05 - Math.abs(j()) * 0.15), TN.H * (q + 0.5) / 2, 0, i === 0 ? hot : plate, j() * 0.4, j() * 0.25, sd * j() * 0.5);
      add(TN.HW * 2 + 0.2, 0.05, len + 0.12, 0, TN.H + 0.03 - Math.abs(j()) * 0.15, 0, plate, j() * 0.3, 0, j() * 0.4); // (the roof, sagging)
      add(TN.HW * 2 + 0.3, 0.12, 0.08, 0, TN.H, len / 2, dark);
      for (const sd of [-1, 1]) add(0.1, TN.H, 0.08, sd * (TN.HW + 0.08), TN.H / 2, len / 2, dark, 0, 0, j() * 0.3);
      g.add(seg);
    }
    return g;
  }
  // the hull cut through at a site, on this screen: the world and the grid (js/shipgen.ts cut), the wall's cubes out of sight
  // there, a lintel over the opening and a torn frame round it
  function cutHere(a: number[]) {
    const map = S.map!, s = siteAt(a); if (!map.sp) return;
    const got = ShipGen.cut(map, s); if (!got) return;
    if (S.hull) S.hull.cutAt(s.x, s.z, s.nx, s.nz); // (what's over her plating there goes with it)
    const TS = Level.TS, L = Level, f0 = map.floors ? map.floors[0] : map, wm = f0.wallMesh as THREE.InstancedMesh | undefined, zero = new T.Matrix4().makeScale(0, 0, 0), W = map.W;
    // every cell it opened: its wall's cube out of sight, and out of the damage's reach (a hit there can't bring it back: js/damage.ts tileOf)
    const dmg = (map as any).dmg;
    if (wm && f0.wallIdx) { for (const c of [...got.cells, ...got.walls]) { const i = f0.wallIdx.get(c); if (i != null) { wm.setMatrixAt(i, zero); if (f0.wallBase) f0.wallBase.set(zero.elements, i * 16); f0.wallIdx.delete(c); } const k = (f0.fl || 0) + ':' + c, tl = dmg && dmg.tiles && dmg.tiles.get(k); if (tl) { tl.group.removeFromParent(); dmg.tiles.delete(k); } } wm.instanceMatrix.needsUpdate = true; }
    // a window it took: its glass, and its frame and sill where the hole is (folded away with what stood there inside)
    for (const id of got.wins) { const pane = map.winMeshes && map.winMeshes[id]; if (pane) pane.removeFromParent(); }
    const hole = [...got.cells, ...got.walls].map((c) => { const x = (c % W) * TS, z = ((c / W) | 0) * TS; return [x - 0.06, 0.05, z - 0.06, x + TS + 0.06, L.DOOR_H + 0.1, z + TS + 0.06]; }); // (a little past its cells: the faces of the walls either side of them, on their edges)
    carve(hole);
    wreck(((map.sp as any).gone || []) as number[][], s);
    const g = new T.Group(), along = s.nz ? 1 : 0, wall = ShipModel.M(new T.Color(map.theme.wall as string).getHex(), { roughness: 0.9 }), torn = ShipModel.M(0x1a1c1f, { metalness: 0.6 }), hot = ShipModel.lit(0xff7a1a);
    const bx = (mt: THREE.Material, u0: number, y0: number, u1: number, y1: number, d0 = -TS / 2, d1 = TS / 2) => { const mm = new T.Mesh(new T.BoxGeometry(along ? u1 - u0 : d1 - d0, y1 - y0, along ? d1 - d0 : u1 - u0), mt); mm.position.set(along ? (u0 + u1) / 2 : (d0 + d1) / 2, (y0 + y1) / 2, along ? (d0 + d1) / 2 : (u0 + u1) / 2); g.add(mm); };
    bx(wall, -1.5 * TS, L.DOOR_H + 0.1, 1.5 * TS, L.WALL_H);
    for (const sd of [-1, 1]) { bx(torn, sd * 1.5 * TS - 0.06, 0, sd * 1.5 * TS + 0.06, L.DOOR_H + 0.1, -TS / 2 - 0.04, TS / 2 + 0.04); bx(hot, sd * 1.5 * TS - 0.02, 0.1, sd * 1.5 * TS + 0.02, L.DOOR_H, -TS / 2 - 0.06, -TS / 2 - 0.04); }
    bx(torn, -1.5 * TS, L.DOOR_H + 0.04, 1.5 * TS, L.DOOR_H + 0.16, -TS / 2 - 0.04, TS / 2 + 0.04);
    g.position.set(s.x, 0, s.z); G_R.levelRoot.add(g);
    if (ShipGen.bent(s)) G_R.levelRoot.add(tunnelMesh(s)); // (an angled breach: the crumpled tunnel she drove in)
    // each bulkhead it broke through: the wall over the gap, a torn edge under it, and its broken end where it stops
    const bk = new T.Group(), bw = ShipModel.M(new T.Color(map.theme.wall as string).getHex(), { roughness: 0.9 });
    for (const c of got.walls) {
      const x = (c % W + 0.5) * TS, z = (((c / W) | 0) + 0.5) * TS, lin = new T.Mesh(new T.BoxGeometry(TS, L.WALL_H - L.DOOR_H - 0.1, TS), bw); lin.position.set(x, (L.WALL_H + L.DOOR_H + 0.1) / 2, z); bk.add(lin);
      const e = new T.Mesh(new T.BoxGeometry(TS + 0.08, 0.12, TS + 0.08), torn); e.position.set(x, L.DOOR_H + 0.1, z); bk.add(e);
      if (!got.walls.includes(c - s.nx - s.nz * W)) { const j = new T.Mesh(new T.BoxGeometry(s.nx ? 0.08 : TS + 0.06, L.DOOR_H + 0.1, s.nz ? 0.08 : TS + 0.06), torn); j.position.set(x - s.nx * TS / 2, (L.DOOR_H + 0.1) / 2, z - s.nz * TS / 2); bk.add(j); }
    }
    if (bk.children.length) G_R.levelRoot.add(bk);
  }
  // ---- The debrief: what the mission was, what it cost (the hostiles killed, put down, taken; the civilians dead, by whose hand,
  // and safe; the squad's own), what it paid (its fee, the bonus, the salvage) and the XP. Told as the squad heads home ('mdone':
  // js/spaceserver.ts home), shown once you're back at the base (js/game.ts enterShop), until you close it.
  // a locked door opened from inside: not locked any more (its light green, off the scanner's locks)
  function unlocked(i: number) {
    const map = S.map, d = map && map.doors[i]; if (!map || !map.sp || !d) return;
    delete map.sp.locks[i];
    for (const q of S.things) if (q.k === 'lock' && Math.abs(q.x - d.x) < 1e-3 && Math.abs(q.z - d.z) < 1e-3) q.obj.userData.lock = '';
  }
  let brief: any = null, tgtWas: number | 'out' | null = null;
  // a mission flown (done or not) is off the board (the host's: js/spaceserver.ts gone); on this screen once its debrief's closed
  let telling: number | null = null;
  const isGone = (i: number) => S.board.gone.includes(i) && telling !== i;
  // your rank and how far into it, with what the mission added: the bar as it was, then filled to where it is now (a rank gained:
  // full, and the new rank's from empty)
  function xpBar(gain: number) {
    const L = Loadout; if (!L) return '';
    const x1 = L.xp(), x0 = Math.max(0, x1 - gain), r1 = L.rank(), r0 = (() => { let r = r1; while (r > 0 && L.rankAt(r) > x0) r--; return r; })();
    const pc = (x: number, r: number) => U.clamp((x - L.rankAt(r)) / (L.rankAt(r + 1) - L.rankAt(r)), 0, 1) * 100, up = r1 > r0;
    return `<div class="db-xp"><div class="db-xph"><b>Rank ${r1}</b>${up ? `<span class="up">Rank up from ${r0}</span>` : ''}<span>${U.fmt(x1)} / ${U.fmt(L.rankAt(r1 + 1))} XP${gain ? ` <em>+${U.fmt(gain)}</em>` : ''}</span></div>
      <div class="db-bar"><i class="was" style="width:${up ? 0 : pc(x0, r1).toFixed(1)}%"></i><i class="now" style="width:${up ? 0 : pc(x0, r1).toFixed(1)}%" data-to="${pc(x1, r1).toFixed(1)}"></i></div></div>`;
  }
  function debrief(m?: any) {
    if (m) { brief = m; if (m.i != null) telling = m.i; }
    if (!brief || !Game.hub) return; // (shown on the way in: enterShop calls again)
    const b = brief; brief = null;
    const E = U.esc, ms = b.ms || {}, c = b.cas || {}, ok = !!b.ok, o = (SD.OBJ as any)[ms.obj] || null, f = (v: number) => U.fmt(Math.round(v || 0));
    const row = (k: string, v: string, cls = '') => `<div class="db-row${cls ? ' ' + cls : ''}"><span>${k}</span><b>${v}</b></div>`;
    const bonusWhy = ms.obj === 'hvt' && b.hvt === 2 ? 'Taken alive' : ms.obj === 'hostage' && b.freed ? `${b.freed} hostage${b.freed === 1 ? '' : 's'} freed` : ms.obj === 'defend' && b.freed ? `${b.freed} passenger${b.freed === 1 ? '' : 's'} unhurt` : 'Bonus';
    const paid = (ok ? (b.pay || 0) + (b.bonus || 0) : 0) + (b.salv || 0);
    const el = document.getElementById('debrief') || Object.assign(document.createElement('div'), { id: 'debrief' });
    el.innerHTML = `<div class="db-card"><div class="db-head ${ok ? 'ok' : 'fail'}"><small>${ok ? 'Mission complete' : 'Mission failed · nothing paid for it'}</small><h2>${E(b.name || ms.name || 'Mission')}</h2><span>${E(ms.where || '')}${o ? ' · ' + E(o.name) : ''}</span></div>
      <p class="db-brief">${E(ms.brief || (o ? o.line : ''))}</p>
      <div class="db-cols"><section><h4>Casualties</h4>${row('Hostiles killed', f(c.killed))}${row('Hostiles incapacitated', f(c.downed))}${row('Hostiles arrested', f(c.arrested))}${row('Squad lost', f(c.squadDead), c.squadDead ? 'bad' : '')}</section>
        <section><h4>Innocents</h4>${row('Civilians killed', f(c.civDead), c.civDead ? 'bad' : 'good')}${c.civDead ? row('… by the squad', f(c.civBySquad), c.civBySquad ? 'bad' : '') : ''}${row(ms.obj === 'hostage' ? 'Hostages alive' : 'Civilians unharmed', f(c.civSafe))}</section>
        <section><h4>Payout</h4>${ok ? row('Fee', '¢' + f(b.pay)) : ''}${ok && b.bonus ? row(E(bonusWhy), '+¢' + f(b.bonus)) : ''}${b.salv ? row('Salvage', '+¢' + f(b.salv)) : ''}${row('Total', '¢' + f(paid), 'total')}${row('XP', ok ? '+' + f(b.xp) : '0', ok ? 'xp' : '')}</section></div>
      ${xpBar(ok ? b.xp || 0 : 0)}
      <button class="btn primary db-go" data-dbgo>Continue</button></div>`;
    if (!el.parentNode) document.body.appendChild(el);
    el.classList.remove('hidden');
    for (const id of ['pause', 'clickToPlay']) { const o = document.getElementById(id); if (o) o.classList.add('hidden'); } // (the debrief's up: not the pause menu, nor the click to play behind it)
    { const bar = el.querySelector<HTMLElement>('.db-bar .now'); if (bar) requestAnimationFrame(() => requestAnimationFrame(() => { bar.style.width = bar.dataset.to + '%'; })); } // (filled up to now, as it's shown)
    Game.unlock();
    const close = () => {
      el.classList.add('hidden'); window.removeEventListener('keydown', key, true);
      if (Game.phase === 'level') { Game.lock(); setTimeout(() => { if (!Game.locked && !Game.menuOpen() && Game.phase === 'level') document.getElementById('clickToPlay')!.classList.remove('hidden'); }, 300); } // (back to the game: the mouse, or the click to have it)
      telling = null; placeAnchors(); SpaceUI.boardDraw(); SpaceUI.opsRender(); // (told: off the board)
    };
    const key = (e: KeyboardEvent) => { if (e.key === 'Enter' || e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); } };
    (el.querySelector('[data-dbgo]') as HTMLElement).onclick = (e) => { e.stopPropagation(); close(); };
    window.addEventListener('keydown', key, true);
  }
  // The hole cut out of what's drawn of her (boxes [x0, y0, z0, x1, y1, z1] in the level's frame): every triangle of the level's
  // drawing (its walls' faces, their trim, a window's frame and sill: merged meshes, not the wall's own cubes, which cutHere
  // hides) that reaches into one is split along the box's faces, and only what's outside it kept, every attribute carried
  // across the split (its position, normal, uv, colour). Her hull's drawing and the squad's ship are not hers to carve.
  function carve(hole: number[][]) {
    if (!hole.length) return;
    const skip = new Set<THREE.Object3D>(); if (S.hull) S.hull.group.traverse((o) => skip.add(o)); if (S.model) S.model.group.traverse((o) => skip.add(o));
    G_R.levelRoot.updateMatrixWorld(true);
    const inv = new T.Matrix4().copy(G_R.levelRoot.matrixWorld).invert(), M = new T.Matrix4(), E = 1e-5;
    type Vx = { p: number[]; a: number[][] };
    const lerp = (u: Vx, v: Vx, t: number): Vx => ({ p: u.p.map((x, i) => x + (v.p[i] - x) * t), a: u.a.map((arr, j) => arr.map((x, i) => x + (v.a[j][i] - x) * t)) });
    // a polygon split by a plane (axis, at val): the part on the out side (side -1: below val; 1: above) and the rest
    const split = (poly: Vx[], ax: number, val: number, side: number): [Vx[] | null, Vx[] | null] => {
      const o: Vx[] = [], r: Vx[] = [], d = (v: Vx) => (v.p[ax] - val) * side;
      for (let i = 0; i < poly.length; i++) {
        const u = poly[i], v = poly[(i + 1) % poly.length], du = d(u), dv = d(v);
        if (du > E) o.push(u); else if (du < -E) r.push(u); else { o.push(u); r.push(u); }
        if ((du > E && dv < -E) || (du < -E && dv > E)) { const m = lerp(u, v, du / (du - dv)); o.push(m); r.push(m); }
      }
      return [o.length >= 3 ? o : null, r.length >= 3 ? r : null];
    };
    G_R.levelRoot.traverse((o: any) => {
      if (!o.isMesh || o.isInstancedMesh || o.isSkinnedMesh || skip.has(o) || !o.geometry.attributes.position) return;
      let g = o.geometry as THREE.BufferGeometry;
      if (!g.boundingBox) g.computeBoundingBox();
      M.multiplyMatrices(inv, o.matrixWorld);
      const bb = g.boundingBox!.clone().applyMatrix4(M), near = hole.filter((b) => bb.max.x > b[0] && bb.min.x < b[3] && bb.max.y > b[1] && bb.min.y < b[4] && bb.max.z > b[2] && bb.min.z < b[5]);
      if (!near.length) return;
      if (g.index) g = g.toNonIndexed(); // (a pane, a box: its own copy, unshared, to cut)
      const names = Object.keys(g.attributes), atts = names.map((n) => g.attributes[n] as THREE.BufferAttribute), out: number[][] = names.map(() => []), pos = g.attributes.position as THREE.BufferAttribute, P = new T.Vector3();
      let changed = false;
      for (let i = 0; i + 2 < pos.count; i += 3) {
        const tri: Vx[] = [0, 1, 2].map((k) => { P.fromBufferAttribute(pos, i + k).applyMatrix4(M); return { p: [P.x, P.y, P.z], a: atts.map((at) => Array.from({ length: at.itemSize }, (_, c) => at.getComponent(i + k, c))) }; });
        let pieces: Vx[][] = [tri];
        for (const b of near) {
          const lo = [b[0], b[1], b[2]], hi = [b[3], b[4], b[5]];
          if (!pieces.some((pc) => [0, 1, 2].every((ax) => Math.max(...pc.map((v) => v.p[ax])) > lo[ax] + E && Math.min(...pc.map((v) => v.p[ax])) < hi[ax] - E))) continue;
          const next: Vx[][] = [];
          for (const pc of pieces) {
            let inside: Vx[] | null = pc;
            for (const [ax, val, side] of [[0, lo[0], -1], [0, hi[0], 1], [2, lo[2], -1], [2, hi[2], 1], [1, lo[1], -1], [1, hi[1], 1]] as [number, number, number][]) {
              const [ou, rest] = split(inside!, ax, val, side);
              if (ou) next.push(ou);
              inside = rest; if (!inside) break;
            }
            if (inside) changed = true; // (what was in the box: gone)
          }
          pieces = next;
        }
        for (const pc of pieces) for (let k = 1; k + 1 < pc.length; k++) for (const v of [pc[0], pc[k], pc[k + 1]]) v.a.forEach((arr, j) => out[j].push(...arr));
      }
      if (!changed) return;
      names.forEach((n, j) => g.setAttribute(n, new T.Float32BufferAttribute(out[j], atts[j].itemSize, atts[j].normalized)));
      g.computeBoundingBox(); g.computeBoundingSphere(); o.geometry = g;
    });
  }
  // What the breach destroyed inside (js/shipgen.ts cut: sp.gone, a box round each piece that's gone): its picture cleared out of
  // the level's drawing (the furniture is merged into a few meshes: each triangle whose middle is in one of the boxes is
  // folded to nothing), and wreckage thrown across the deck from the hole, the way she came in.
  function wreck(boxes: number[][], s: { x: number; z: number; nx: number; nz: number }) {
    const inBox = (x: number, y: number, z: number) => { for (const b of boxes) if (x > b[0] && x < b[3] && y > b[1] && y < b[4] && z > b[2] && z < b[5]) return true; return false; };
    const skip = new Set<THREE.Object3D>(); if (S.hull) S.hull.group.traverse((o) => skip.add(o));
    G_R.levelRoot.updateMatrixWorld(true);
    const inv = new T.Matrix4().copy(G_R.levelRoot.matrixWorld).invert(), M = new T.Matrix4(), v = [new T.Vector3(), new T.Vector3(), new T.Vector3()];
    G_R.levelRoot.traverse((o: any) => {
      if (!o.isMesh || o.isInstancedMesh || o.isSkinnedMesh || skip.has(o) || o.geometry.index || !o.geometry.attributes.position) return;
      const a = o.geometry.attributes.position as THREE.BufferAttribute, q = a.array as Float32Array;
      if (!(q instanceof Float32Array) || q.length < 9) return;
      if (!o.geometry.boundingBox) o.geometry.computeBoundingBox();
      M.multiplyMatrices(inv, o.matrixWorld); // (to the level's own frame, which is the boxes')
      const bb = o.geometry.boundingBox!.clone().applyMatrix4(M); if (!boxes.some((b) => bb.max.x > b[0] && bb.min.x < b[3] && bb.max.y > b[1] && bb.min.y < b[4] && bb.max.z > b[2] && bb.min.z < b[5])) return;
      let ch = false;
      for (let i = 0; i + 8 < q.length; i += 9) {
        for (let k = 0; k < 3; k++) v[k].set(q[i + k * 3], q[i + k * 3 + 1], q[i + k * 3 + 2]).applyMatrix4(M);
        if (Math.max(v[0].distanceTo(v[1]), v[1].distanceTo(v[2]), v[2].distanceTo(v[0])) > 4.5) continue; // (a floor's or a wall's own: not furniture)
        if (!inBox((v[0].x + v[1].x + v[2].x) / 3, (v[0].y + v[1].y + v[2].y) / 3, (v[0].z + v[1].z + v[2].z) / 3)) continue;
        for (const k of [3, 6]) { q[i + k] = q[i]; q[i + k + 1] = q[i + 1]; q[i + k + 2] = q[i + 2]; } ch = true;
      }
      if (ch) a.needsUpdate = true;
    });
    const g = new T.Group(), dark = ShipModel.M(0x2a2d31, { roughness: 0.8, metalness: 0.4 }), pale = ShipModel.M(0x7d858c, { roughness: 0.7, metalness: 0.3 }), r = U.rng(((s.x * 131 + s.z * 17) | 0) >>> 0);
    const TS = Level.TS, ax = s.nz ? 1 : 0, az = s.nx ? 1 : 0, ox = s.x - s.nx * TS / 2, oz = s.z - s.nz * TS / 2; // (the hole's inner face, its middle)
    for (let i = 0; i < 22 + boxes.length * 4; i++) {
      let x: number, z: number;
      if (i < 22 || !boxes.length) { const u = (r() - 0.5) * 3 * TS, d = 0.3 + r() * r() * 5, fan = u * (1 + d * 0.35); x = ox - s.nx * d + ax * fan; z = oz - s.nz * d + az * fan; } // (blown in from the hole, spreading as it goes)
      else { const b = boxes[Math.floor(r() * boxes.length)], along = 0.3 + r() * 1.5; x = b[0] + r() * (b[3] - b[0]) - s.nx * along; z = b[2] + r() * (b[5] - b[2]) - s.nz * along; } // (and what's left of what stood there)
      if (S.map && S.map.t[Math.floor(z / Level.TS) * S.map.W + Math.floor(x / Level.TS)] === 1) continue; // (not through a bulkhead)
      const w = 0.08 + r() * 0.42, m = new T.Mesh(new T.BoxGeometry(w, 0.02 + r() * 0.1, 0.06 + r() * 0.3), r() < 0.55 ? dark : pale);
      m.position.set(x, 0.02 + r() * 0.05, z); m.rotation.set((r() - 0.5) * 0.5, r() * 6.283, (r() - 0.5) * 0.5); g.add(m);
    }
    G_R.levelRoot.add(g);
  }
  // The pirates' pods in a taken ship's hull (the mission's state: raid, as sites): each a blunt rust-dark boarding pod driven in
  // nose first, its collar against her plating and its engines still glowing; inside, where it came through, its hatch shut in
  // a ring of torn plate. (Nothing of hers is cut for it: the pod fills its own hole.)
  function raidPods(list?: number[][]) {
    const map = S.map as (LvMap & { _pods?: Set<string> }) | null; if (!map || !map.sp || S.kind !== 'board' || !list) return;
    const done = map._pods || (map._pods = new Set()), TS = Level.TS, SM = ShipModel;
    for (const a of list) {
      if (done.has(a.join(','))) continue; done.add(a.join(','));
      const s = siteAt(a), g = new T.Group(); if (S.hull) S.hull.cutAt(s.x, s.z, s.nx, s.nz);
      const hullM = SM.M(0x7a4634, { roughness: 0.8, metalness: 0.2, emissive: 0x24120c }), dark = SM.M(0x1c1a19, { roughness: 0.7, metalness: 0.5 }), hot = SM.lit(0xff5a1a), red = SM.lit(0xff2a1a);
      const add = (geo: THREE.BufferGeometry, m: THREE.Material, z: number, y = 0, x = 0) => { const mm = new T.Mesh(geo, m); mm.position.set(x, y, z); g.add(mm); return mm; };
      // (built along +z, out from the hull, its floor level with her deck; then turned to the site's own way out)
      const body = add(new T.CylinderGeometry(1.25, 1.9, 8.5, 8), hullM, 4.6, 1.35); body.rotation.x = Math.PI / 2; body.rotation.y = Math.PI / 8;
      const collar = add(new T.CylinderGeometry(2.15, 2.15, 0.5, 8), dark, 0.3, 1.35); collar.rotation.x = Math.PI / 2; collar.rotation.y = Math.PI / 8;
      for (const k of [0, 1, 2, 3]) { const f = add(new T.BoxGeometry(0.16, 1.5, 3.2), dark, 6.6, 1.35); f.position.x = Math.cos(k * Math.PI / 2 + 0.6) * 1.75; f.position.y += Math.sin(k * Math.PI / 2 + 0.6) * 1.75; f.rotation.z = k * Math.PI / 2 + 0.6 - Math.PI / 2; }
      for (const k of [0, 1, 2]) { const an = k * 2.094, e = add(new T.CylinderGeometry(0.42, 0.5, 0.9, 8), dark, 9.1, 1.35 + Math.sin(an) * 0.62, Math.cos(an) * 0.62); e.rotation.x = Math.PI / 2; const gl = add(new T.CircleGeometry(0.36, 8), hot, 9.57, 1.35 + Math.sin(an) * 0.62, Math.cos(an) * 0.62); void gl; }
      add(new T.BoxGeometry(2.3, 0.5, 0.06), SM.M(0xb8ae98, { roughness: 0.9 }), 3.4, 2.75).rotation.x = -0.12; // (a pale band across her back: whose she is)
      for (const x of [-1, 1]) add(new T.BoxGeometry(0.12, 0.12, 0.12), red, 1.0, 2.9, x * 0.9);
      // inside her: the pod's hatch, shut, set in the wall where it came through
      add(new T.BoxGeometry(2.3, 2.3, 0.08), dark, -TS / 2 - 0.05, 1.2);
      add(new T.BoxGeometry(1.5, 2.0, 0.1), hullM, -TS / 2 - 0.07, 1.05);
      for (const [w, h, x, y] of [[2.5, 0.08, 0, 2.4], [2.5, 0.08, 0, 0.04], [0.08, 2.4, -1.25, 1.2], [0.08, 2.4, 1.25, 1.2]]) add(new T.BoxGeometry(w, h, 0.05), hot, -TS / 2 - 0.045, y, x);
      add(new T.BoxGeometry(0.16, 0.08, 0.06), red, -TS / 2 - 0.13, 2.15);
      g.position.set(s.x + s.nx * TS / 2, 0, s.z + s.nz * TS / 2); g.rotation.y = Math.atan2(s.nx, s.nz);
      G_R.levelRoot.add(g);
    }
  }
  // Where her nose is headed on the hull: the site its line meets (nearest), how far off, and how far the nose is off the
  // line straight into it. null: she isn't pointed at anywhere she could breach.
  // Whether the squad's ship, berthed at a site, stands clear of her hull (js/shipmodel.ts hull: an engine's nozzles, a ram, a bow, the
  // armour under her keel stand out past the wall the grid knows, and the sites are the grid's: js/shipgen.ts sites). Worked out
  // from her drawing on this screen (every screen draws her the same), once a site, for the sites the pilot can be offered.
  let clearFor: { hull: object; def: string; tris: { v: THREE.Vector3[]; b: THREE.Box3 }[]; ok: Map<number, boolean> } | null = null;
  function hullClear(s: ShSite) {
    if (!S.hull) return true;
    if (!clearFor || clearFor.hull !== S.hull || clearFor.def !== S.def.id) {
      G_R.levelRoot.updateMatrixWorld(true); S.hull.group.updateMatrixWorld(true); // (where she's drawn now, whether or not she's been drawn yet)
      const tris: { v: THREE.Vector3[]; b: THREE.Box3 }[] = [], inv = new T.Matrix4().copy(G_R.levelRoot.matrixWorld).invert();
      S.hull.group.traverse((o: any) => {
        if (!o.isMesh || o.material.blending === T.AdditiveBlending) return; // (light's not in the way)
        const M = new T.Matrix4().multiplyMatrices(inv, o.matrixWorld), g = o.geometry, p = g.attributes.position, ix = g.index, n = ix ? ix.count : p.count;
        for (let i = 0; i + 2 < n; i += 3) { const v = [0, 1, 2].map((k) => new T.Vector3().fromBufferAttribute(p, ix ? ix.getX(i + k) : i + k).applyMatrix4(M)); if (v[0].equals(v[1]) && v[1].equals(v[2])) continue; tris.push({ v, b: new T.Box3().setFromPoints(v) }); }
      });
      if (!tris.length) return true; // (not drawn yet: nothing to be in the way, and nothing kept)
      clearFor = { hull: S.hull, def: S.def.id, tris, ok: new Map() };
    }
    const key = s.c * 4 + (s.nx > 0 ? 0 : s.nx < 0 ? 1 : s.nz > 0 ? 2 : 3), had = clearFor.ok.get(key);
    if (had != null) return had;
    // (what's over the hole itself goes with the wall when she's through: js/shipmodel.ts cutAt)
    const inHole = (c: THREE.Vector3) => { const out = (c.x - s.x) * s.nx + (c.z - s.z) * s.nz, al = s.nx ? c.z - s.z : c.x - s.x; return Math.abs(al) < 2.3 && out > -0.5 && out < 2.4 && c.y > -0.9 && c.y < 3.5; };
    const B = new T.Box3(), tri = new T.Triangle(), c = new T.Vector3();
    let ok = true;
    for (const bx of SD.worldBoxes(S.def, berthAt(s))) {
      B.min.set(bx.b[0] + 0.02, bx.b[1] + 0.02, bx.b[2] + 0.02); B.max.set(bx.b[3] - 0.02, bx.b[4] - 0.02, bx.b[5] - 0.02);
      for (const q of clearFor.tris) { if (!q.b.intersectsBox(B)) continue; c.copy(q.v[0]).add(q.v[1]).add(q.v[2]).multiplyScalar(1 / 3); if (inHole(c)) continue; tri.set(q.v[0], q.v[1], q.v[2]); if (B.intersectsTriangle(tri)) { ok = false; break; } }
      if (!ok) break;
    }
    clearFor.ok.set(key, ok);
    return ok;
  }
  // every stretch of her hull she could be breached through: the sites, and the holes already made; not where a pirate pod is, nor
  // where anything stands out over her plating in the way (hullClear)
  function siteList() {
    if (!S.map || !S.map.sp) return [];
    const raid: number[][] = (S.state && S.state.raid) || [], W0 = S.map.W, nearPod = (s: ShSite) => raid.some((q) => Math.hypot(s.c % W0 - q[0] % W0, ((s.c / W0) | 0) - ((q[0] / W0) | 0)) * Level.TS < 8);
    return ShipGen.sites(S.map).concat((S.map.sp.cuts || []).map(siteAt)).filter((s) => !nearPod(s) && hullClear(s));
  }
  const addObj = (o: THREE.Object3D, p?: THREE.Vector3) => { if (p) o.position.copy(p); S.root!.add(o); return o; };

  // -- the hangar: the asteroid round it, the anchors of the missions on the board out in the dark
  function setupHub(map: LvMap, sp: any) {
    const TS = Level.TS, Wm = map.W * TS, Hm = map.H * TS, RZ = Hangar.RZ;
    const rock = ShipModel.asteroid(Wm, Hm, 99); addObj(rock.group);
    const base = new T.Vector3(S.berth.x, 0, S.berth.z);
    S.wps.push({ id: 'base', name: 'HOME', sub: 'Hangar pad', p: base.clone().setY(40), kind: 'base' });
    placeAnchors();
    // the hall and the range's walls north of the pad: not to be flown through. The hollow's ground and walls, and past them the rock.
    S.boxes.push([-6, -5, -20, Wm + 6, 11, RZ + 28.5]);
    S.floorAt = (x, z) => { const hx = Math.hypot(x - rock.C.x, z - rock.C.z); return hx < 700 ? rock.height(x, z) + (Math.abs(x - Wm / 2) < Wm / 2 + 60 && Math.abs(z - Hm / 2) < Hm / 2 + 60 ? 0.4 : 5) : hx < rock.R + 150 ? Math.sqrt(Math.max(0, (rock.R + 150) ** 2 - hx * hx)) - rock.R : -1e9; };
    // the missions terminal by the pad: a console and the board over it
    const tx = 37.5, tz = RZ + 29.3, g = new T.Group(), M = ShipModel.M;
    const post = M(0x3a4047, { emissive: 0x0c0d0f }), body = M(0x59626c, { emissive: 0x111316 });
    const bx = (mt: THREE.Material, x0: number, y0: number, z0: number, x1: number, y1: number, z1: number) => { const mm = new T.Mesh(new T.BoxGeometry(x1 - x0, y1 - y0, z1 - z0), mt); mm.position.set((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2); g.add(mm); };
    bx(body, -0.6, 0, -0.25, 0.6, 1.0, 0.25); bx(post, -1.9, 0, -0.08, -1.75, 3.4, 0.08); bx(post, 1.75, 0, -0.08, 1.9, 3.4, 0.08); bx(post, -1.9, 1.7, -0.06, 1.9, 3.4, 0);
    const scr = new T.Mesh(new T.PlaneGeometry(3.5, 1.6), new T.MeshBasicMaterial({ map: SpaceUI.boardTex() })); scr.position.set(0, 2.55, 0.01); g.add(scr);
    const face = new T.Mesh(new T.PlaneGeometry(1.0, 0.5), ShipModel.lit(0x1c6a88)); face.position.set(0, 1.02, 0.1); face.rotation.x = -1.1; g.add(face);
    g.position.set(tx, 0, tz); G_R.levelRoot.add(g);
    S.term = { x: tx, z: tz + 0.9 };
    S.solids.push({ s: null, on: false, b: [tx - 0.6, 0, tz - 0.25, tx + 0.6, 1.0, tz + 0.25] }, { s: null, on: false, b: [tx - 1.9, 0, tz - 0.08, tx - 1.75, 3.4, tz + 0.08] }, { s: null, on: false, b: [tx + 1.75, 0, tz - 0.08, tx + 1.9, 3.4, tz + 0.08] });
  }
  function placeAnchors() {
    if (S.kind !== 'hub' || !S.root) return;
    for (const a of S.anchors) S.root.remove(a.obj);
    S.anchors = []; S.wps = S.wps.filter((w) => w.kind !== 'anchor');
    const offers = SD.offers(S.board.seed, S.board.level), base = new T.Vector3(S.berth.x, 0, S.berth.z);
    for (const i of S.board.picked) {
      const ms = offers[i]; if (!ms) continue;
      if (isGone(i)) continue;
      const done = S.board.done.includes(i), p = new T.Vector3(...ms.anchor).add(base); p.y = Math.max(p.y, 900);
      const obj = addObj(ShipModel.anchor(done ? 0x55606a : ms.kind === 'assault' ? 0x9cff8a : 0x66c8ff), p); obj.lookAt(base);
      S.anchors.push({ i, obj, p });
      S.wps.push({ id: 'a' + i, name: done ? ms.name + ' · DONE' : ms.name, sub: `Anchor · jump ${ms.ly.toFixed(1)} ly`, p, kind: 'anchor', i, hide: done });
    }
    if (S.tgt >= S.wps.length || (S.wps[S.tgt] && S.wps[S.tgt].hide)) S.tgt = Math.max(0, S.wps.findIndex((w) => w.kind === 'anchor' && !w.hide));
  }
  // -- a ship to board: her hull over the level, the plate to hit, the anchor to leave by
  function setupBoard(map: LvMap) {
    const sp = map.sp!, zk = S.zinfo && S.zinfo.near && zoneHullsOf === S.zinfo.ms.seed ? S.zinfo.ms.seed + ':' + S.zinfo.act : null, kept = zk ? zoneHulls.get(zk) : null;
    if (!zk) zoneClear(); // (jumped in: nothing's kept from before)
    // (her hull: the one she's been seen in from outside, if she has been)
    if (kept) { zoneHulls.delete(zk!); kept.holder.remove(kept.h.group); kept.h.group.position.set(0, 0, 0); kept.h.marker.visible = true; if (kept.map && kept.map !== map) viewDrop(kept.map); }
    const h = S.hull = kept ? kept.h : ShipModel.hull(map); h.group.userData.prof = 'level hull';
    G_R.levelRoot.add(h.group);
    const TS = Level.TS;
    map.rooms.forEach((rm) => { const y = (rm.fl || 0) * Level.FLOOR_H; S.boxes.push([rm.x * TS - 1.2, y - 2.4, rm.z * TS - 1.2, (rm.x + rm.w) * TS + 1.2, y + Level.WALL_H + 1.2, (rm.z + rm.h) * TS + 1.2]); });
    // a ship that isn't the mission's, lying off her: marked, to be boarded or left
    for (const hh of sp.hulls) if (!hh.main) S.wps.push({ id: 'other', name: SD.SIZES[hh.size].name.toUpperCase(), sub: 'Not the mission: board her for salvage, or leave her', p: new T.Vector3((hh.x0 + hh.x1) / 2, 6, (hh.z0 + hh.z1) / 2), kind: 'base' });
    const out = new T.Vector3(), a = ShipModel.anchor(); a.position.set(0, 150, 2600); a.rotation.y = Math.PI;
    S.anchors.push({ i: -1, obj: a, p: out, p0: a.position.clone() });
    // She's under way: the zone goes by her (and by everyone with her) at her own pace, bow first (a flying wing's is her corner).
    // The anchor is a place in the zone, so it falls astern; the others out here hold their own courses.
    S.zone!.add(a); if (S.state && S.state.zt != null) { S.zt0 = S.state.zt; S.ztAt = S.t; } else S.zt0 = 0;
    // the zone's ships (js/spacedata.ts zone): the one this level is isn't drawn out there (she's here); each of the rest is, on
    // her course, and is on the navigation screen: come up within 500 m of one and the squad's ship matches her course (zoneClose)
    const zi = S.zinfo;
    S.zdef = SD.zone(zi ? zi.ms : { seed: map.seed, size: sp.size, th: SD.themeIndex(map.theme), wing: !!sp.wing, name: (S.ms && S.ms.name) || '' }); S.zact = zi ? zi.act : 0;
    S.zC.set((sp.hull.x0 + sp.hull.x1) / 2, 0, (sp.hull.z0 + sp.hull.z1) / 2);
    // the zone's asteroids (js/spacedata.ts rocks): in the zone's frame, so they go by as it does; radar targets and cover (rocksStep)
    S.rockList = SD.rocks(zi ? zi.ms : { seed: map.seed, size: sp.size, th: SD.themeIndex(map.theme), wing: !!sp.wing, name: (S.ms && S.ms.name) || '' });
    ROCKS.obj = S.rockList.length ? ShipModel.rockField(S.rockList) : null; if (ROCKS.obj) S.zone!.add(ROCKS.obj);
    for (const c of S.zdef) {
      if (c.k === S.zact) continue;
      const t = ShipModel.traffic(c.kind, c.seed); S.zone!.add(t.group);
      const wp: SpWp = { id: 't' + c.k, name: c.k === 0 ? c.name + ' · THE MISSION' : c.name, sub: SD.SIZES[c.size].name + (c.wing ? ', a flying wing' : ''), p: new T.Vector3(), kind: 'base' };
      S.wps.push(wp); S.traffic.push({ obj: t.group, c, wp, ph: (c.seed % 30) / 10 });
    }
    zoneStep(); if (zi && zi.near) for (let k = 0; k < S.traffic.length; k++) zoneReal(true); // (come up with her: the rest are made already, kept. Jumped in: a step a frame, in the tunnel)
    S.wps.push({ id: 'ship', name: (((S.zdef[S.zact] && S.zdef[S.zact].name) || (S.ms && S.ms.name)) || 'THE SHIP').toUpperCase(), sub: 'Ram her hull nose-on to board: anywhere along it', p: new T.Vector3(S.zC.x, 2, S.zC.z), kind: 'base' }, { id: 'out', name: 'ANCHOR', sub: 'Jump home', p: out, kind: 'anchor', i: -1 });
    // the target: come out of the jump, the mission's ship (the one marked at the anchor: the level's if she's it, else her out on her
    // course); the level changed to another ship out here, whatever she was steering for still
    const want = zi && zi.near && tgtWas != null ? tgtWas : 0;
    S.tgt = Math.max(0, S.wps.findIndex((w) => w.id === (want === 'out' ? 'out' : want === S.zact ? 'ship' : 't' + want)));
    things(map);
  }
  // what the mission wants aboard her: the artifact on its stand, the self-destruct's console, the pods' hatches, lights over the locked doors
  function things(map: LvMap) {
    const sp = map.sp!, M = ShipModel.M, lit = ShipModel.lit, root = G_R.levelRoot, obj = S.ms ? S.ms.obj : sp.obj;
    const put = (k: string, at: { x: number; z: number; y?: number }, o: THREE.Object3D, n?: number) => { o.position.set(at.x, at.y || 0, at.z); root.add(o); S.things.push({ k, n, x: at.x, z: at.z, y: at.y || 0, obj: o }); };
    if (obj === 'artifact' && sp.artifact) {
      const g = new T.Group(), st = new T.Mesh(new T.CylinderGeometry(0.22, 0.3, 0.8, 10), M(0x2c3036)); st.position.y = 0.4; g.add(st);
      const a = new T.Mesh(new T.OctahedronGeometry(0.2), new T.MeshStandardMaterial({ color: 0x40ffd0, emissive: 0x20c8a0, emissiveIntensity: 2, roughness: 0.2 })); a.position.y = 1.15; g.add(a); g.userData.art = a;
      const l = new T.PointLight(0x40ffd0, 2.5, 6, 1.5); l.position.y = 1.2; g.add(l);
      put('art', sp.artifact, g);
    }
    if (obj === 'destruct' && sp.console) {
      const g = new T.Group(), c = new T.Mesh(new T.BoxGeometry(0.7, 1.05, 0.4), M(0x30343a)); c.position.y = 0.52; g.add(c);
      const s2 = new T.Mesh(new T.BoxGeometry(0.56, 0.3, 0.02), lit(0xff3020)); s2.position.set(0, 1.12, 0); s2.rotation.x = -0.4; g.add(s2); g.userData.scr = s2;
      put('cons', sp.console, g);
    }
    sp.pods.forEach((p, n) => {
      const g = new T.Group(), f = new T.Mesh(new T.TorusGeometry(0.55, 0.07, 6, 18), M(0xb8862a, { emissive: 0x2a1c06 })); f.rotation.x = Math.PI / 2; f.position.y = 0.03; g.add(f);
      const d = new T.Mesh(new T.CircleGeometry(0.5, 18), lit(0x1c7a40)); d.rotation.x = -Math.PI / 2; d.position.y = 0.02; g.add(d);
      put('pod', p, g, n);
    });
    sp.salvage.forEach((p, n) => {
      const g = new T.Group(), c = new T.Mesh(new T.BoxGeometry(0.7, 0.5, 0.5), M(0x4a5a3a, { emissive: 0x0c1008 })); c.position.y = 0.25; g.add(c);
      const l2 = new T.Mesh(new T.BoxGeometry(0.5, 0.04, 0.3), lit(0x9cff8a)); l2.position.y = 0.52; g.add(l2);
      put('salv', p, g, n);
    });
    for (const id of Object.keys(sp.locks)) {
      const d = map.doors[+id], k = sp.locks[+id]; if (!d || k === 'breach') continue;
      const l = new T.Mesh(new T.BoxGeometry(0.3, 0.1, 0.9), lit(0xff3020)); l.position.set(d.x, (d.fy || 0) + Level.DOOR_H + 0.25, d.z); if (d.axis === 'z') l.rotation.y = Math.PI / 2; l.userData.lock = k; root.add(l); S.things.push({ k: 'lock', x: d.x, z: d.z, obj: l });
    }
  }
  // ---- The zone: open space a long way round, and what else is under way in it: every one of them a ship that can be come
  // up with and boarded (there's none that's only to look at: round the base there's nothing). Each of the others keeps a
  // course of its own, a loop through a few points round the middle (never through it), at its own pace; where it is goes by
  // the zone's clock alone (the host's on a mission, the day's at the base), so it's the same on every screen. On a mission
  // the ship being boarded is under way too: the zone slides by her (zoneV), which is to say by the level and all aboard.
  // Where everything in the zone is now. On a mission the level is one of the zone's ships (zact), under way on her own course:
  // the zone is drawn from her (it goes by, and turns when she does), so the others, the anchor and the stars are where they'd be
  // seen from her deck or from the squad's ship keeping her company.
  const _zd = new T.Vector3(), _zq = new T.Quaternion();
  // The zone's frame, and a thing flying free through it (zstep), kept as it is in the zone while the level turns (zturn), the field's
  // velocity at a place (fieldAt): the simulation's (js/spacesim.ts), the zone's placing given it each step (zoneStep)
  const ZS = SpaceSim.zone();
  let ZR: any = null; // (a step flown again: the zone's frame as it was then, js/space.ts c2Ack)
  const zstep = (p: THREE.Vector3, v: THREE.Vector3, dt: number, m?: ZMem) => SpaceSim.zstep(ZR || (S.zone ? ZS : null), p, v, dt, m);
  const zmem = SpaceSim.zmem;
  const zturn = (q: THREE.Quaternion) => SpaceSim.zturn(ZR || (S.zone ? ZS : null), q);
  const fieldAt = (p: THREE.Vector3, out = new T.Vector3()) => (ZR ? SpaceSim.fieldAt(ZR, p, out) : S.zone ? SpaceSim.fieldAt(ZS, p, out) : out.copy(S.zoneV));
  const ZT = { used: 0 };
  function zoneStep() {
    if (!S.zone) return;
    const t = S.zt0 + (S.t - S.ztAt); ZT.used = t; // (the zone's time this step placed it at: tools/space_steps/helm_geo.mjs)
    if (S.kind === 'board' && S.zdef[S.zact]) {
      SpaceSim.zonePlace(S.zdef, S.zact, !!(S.map && S.map.sp && S.map.sp.wing), S.zC, t, S.zone.position, S.zone.quaternion); // (the simulation's: js/spacesim.ts)
    }
    // (the zone's velocity in the level's frame, and its placing then and now: js/spacesim.ts zoneAt)
    S.zone.updateMatrix(); SpaceSim.zoneAt(ZS, t, S.zone.position, S.zone.matrix); S.zoneV.copy(ZS.v);
    for (const q of S.anchors) if (q.p0) q.p.copy(q.p0).applyQuaternion(S.zone.quaternion).add(S.zone.position);
    for (const q of S.traffic) {
      trafficLocal(q, t, q.obj.position, q.obj.quaternion);
      if (q.wp) q.wp.p.copy(q.obj.position).applyQuaternion(S.zone.quaternion).add(S.zone.position);
      const st = q.obj.userData.strobe as THREE.Object3D | undefined; if (st) st.visible = (t + q.ph) % 1.6 < 0.18;
    }
    zoneReal(false);
  }
  // A ship of the zone's that's come within five kilometres is drawn as herself: her own hull (the level she'd be, laid out
  // from her seed: js/level.ts generate, js/shipmodel.ts hull), not the stand-in seen further off. So when the squad's ship
  // comes up with her and she becomes the level, nothing outside changes. One a frame (all: every one in reach, at once).
  /** The level already laid out for one of the zone's ships (for her hull, seen from outside), if it's the one now wanted: it's hers to be the level with (js/game.ts enterLevel). */
  function takeMap(seed: number, level: number, th: number | undefined, night: boolean, gen: any): LvMap | null {
    if (!Prep) return null;
    const key = Prep.keyOf(seed, level, th, night, gen);
    if (jumpPre && jumpPre.key === key && jumpPre.map) { const m = jumpPre.map; jumpPre = null; return m; } // (where the jump's going: made on the way)
    for (const h of zoneHulls.values()) if (h.map && h.key === key) { const m = h.map; h.map = null; return m; }
    return null;
  }
  // (the figures the host will make her level with, should the squad's ship come up with her: js/spaceserver.ts 'tboard', genOf)
  function zoneLevel(c: SpContact) {
    const zi = S.zinfo, zm = zi ? zi.ms : null, main = c.k === 0 && zm ? zm : null, diff = zm && zm.diff ? zm.diff : Game.level;
    return { seed: c.seed, level: main ? diff : Math.max(1, diff - 1), th: c.th, night: main ? !!main.night : false, gen: { size: c.size, obj: main ? main.obj : 'visit', ship: S.fleet.ship, other: main ? main.other : null, wing: !!c.wing } };
  }
  /** a level laid out: on the other thread if there's one (null till it's come: js/prep.ts map), else here and now */
  function layOut(lv: { seed: number; level: number; th: number | undefined; night: boolean; gen: any }): LvMap | null {
    const m = Prep ? Prep.map(lv.seed, lv.level, lv.th, lv.night, lv.gen) : false;
    return m === false ? Level.generate(lv.seed, lv.level, lv.th, lv.night, lv.gen) : m;
  }
  type ZHull = { holder: THREE.Group; h: ReturnType<typeof ShipModel.hull>; bow: number; map: LvMap | null; key: string; up?: ((ms: number) => boolean) | null };
  const viewDrop = (map: LvMap | null) => { // (what was made of her ahead, not wanted after all)
    const p = map && (map as any).viewPre as LvViewPre | null; if (!p) return;
    InteriorCull.untrack(p.root); p.root.removeFromParent(); // (shown on her hull out in the zone, zoneShow)
    p.root.traverse((o: any) => { if (o.geometry) o.geometry.dispose(); if (o.material) for (const m of Array.isArray(o.material) ? o.material : [o.material]) { if (m.map) m.map.dispose(); m.dispose(); } });
    (map as any).viewPre = null;
  };
  const zoneClear = () => { for (const h of zoneHulls.values()) { viewDrop(h.map); h.holder.traverse((o: any) => { if (o.geometry) o.geometry.dispose(); }); } zoneHulls.clear(); };
  const zoneHulls = new Map<string, ZHull>(); let zoneHullsOf = -1; // (the hulls made, kept from one of the zone's ships to the next)
  // how near one of the others must be: to be drawn as herself (and made ready to be the level: zonePrep); for that to be let go
  // (the zone's whole width: there are six of them at most, so what's made of each is kept while the squad's in it); to become
  // the level (zoneClose: once she's ready, or nearer than ZONE_NOW whether or not)
  const PAD_POINTS = 4; // (her own three lamps, and the artifact's glow)
  const ZONE_REAL = 5000, ZONE_DROP = 60000; // (come up with one: js/helm.ts close)
  function zoneReal(all: boolean) {
    if (S.kind !== 'board' || !S.zone) return;
    const zseed = S.zinfo ? S.zinfo.ms.seed : -2;
    if (zoneHullsOf !== zseed) { zoneClear(); zoneHullsOf = zseed; }
    // (nearest first; a step a frame unless all: her layout, her hull, then her hull sent to the graphics card, then she's swapped in)
    const want = S.traffic.filter((q) => !q.real && q.wp && q.c.k != null && S.P.distanceTo(q.wp.p) <= ZONE_REAL).sort((a, b) => S.P.distanceTo(a.wp!.p) - S.P.distanceTo(b.wp!.p));
    for (const q of want) {
      const c = S.zdef[q.c.k!], lv = zoneLevel(c), id = zseed + ':' + c.k;
      // (she may be the level soon: her light's worked out on another thread meanwhile, js/prep.ts)
      if (Prep) Prep.want(lv.seed, lv.level, lv.th, lv.night, lv.gen);
      let hit = zoneHulls.get(id);
      if (!hit) {
        if (!q.pend) {
          const m = all ? Level.generate(lv.seed, lv.level, lv.th, lv.night, lv.gen) : layOut(lv); if (!m) continue; // (on its way from the other thread: the next meanwhile)
          q.pend = m; if (!m.sp) { q.pend = null; q.real = true; continue; } if (!all) return;
        }
        const map = q.pend; q.pend = null;
        const h = ShipModel.hull(map), holder = new T.Group(); h.marker.visible = false;
        h.group.position.set(-(map.sp!.hull.x0 + map.sp!.hull.x1) / 2, 0, -(map.sp!.hull.z0 + map.sp!.hull.z1) / 2); holder.add(h.group);
        hit = { holder, h, bow: map.sp!.wing ? Math.atan2(-1, -1) : Math.atan2(-1, 0), map, key: Prep ? Prep.keyOf(lv.seed, lv.level, lv.th, lv.night, lv.gen) : '', up: all ? null : G_R.preload(holder) };
        zoneHulls.set(id, hit);
        if (!all) return;
      }
      if (hit.up) { const done = hit.up(3); if (done) hit.up = null; if (!all || !done) return; } // (her first drawing: done out of sight, a few milliseconds a frame)
      if (!all && !G_R.progsReady()) return; // (and her shaders made)
      hit.holder.position.copy(q.obj.position); S.zone.remove(q.obj); S.zone.add(hit.holder);
      q.obj = hit.holder; q.real = true; q.bow = hit.bow;
      if (hid) hit.holder.traverse((o: any) => { if ((o.isMesh || o.isPoints || o.isLine || o.isSprite) && o.visible) { o.visible = false; hid!.push(o); } }); // (in the tunnel: out of sight with the rest)
      if (!all) return;
    }
  }
  // The nearest of them within two kilometres may be the level in a moment, and that moment mustn't show: so what the level
  // would be made of in the frame it's entered is made now, a few milliseconds a frame, nothing of it in the scene. In turn:
  // her layout, if there's none (zoneReal's, unless she's been the level before); her drawing, mesh by mesh
  // (js/levelview.ts begin, step); then all of it sent to the graphics card and its shaders found (js/render.ts preload). Her
  // light's being worked out on another thread meanwhile (js/prep.ts). js/game.ts enterLevel takes the lot (takeMap) and has
  // only to put it in the scene. Whatever isn't done by then is finished in that frame, as it all used to be.
  /** a level made ahead, a few milliseconds a frame: its drawing (js/levelview.ts begin, step), then sent to the graphics card (js/render.ts preload). true when it's all done */
  function prepStep(map: LvMap, things: number) {
    const pre = (map as any).viewPre as LvViewPre | null;
    if (!pre) { LevelView.begin(map); return false; }
    if (!pre.done) { LevelView.step(map, 4); return false; }
    if (!pre.up) pre.up = G_R.preload(pre.root, things);
    if (pre.up !== true && (pre.up as (ms: number) => boolean)(3)) pre.up = true;
    // (and the ship's own things, new in the level's frame: her stars, her screens. A material that isn't lit keeps the shader
    // it was first given, which may be from wherever the scene was before space, so the new ones' wouldn't be there to be had)
    if (pre.up === true && !(pre as any).kit) { (pre as any).kit = true; G_R.lightPad(); for (const o of [S.stars, S.model && S.model.group]) if (o) G_R.renderer.compile(o, G_R.camera, G_R.scene); }
    return pre.up === true && G_R.progsReady(); // (and its shaders made, on the driver's threads: or drawing her would wait for them)
  }
  // ---- The jump's way out, made on the way: from the base, the mission at the anchor she's by (or spooling for) is laid out,
  // drawn and sent to the graphics card a frame at a time while she's still flying, so when the host puts the squad there
  // nothing stops (js/game.ts enterLevel takes it: takeMap) and the pod stays as it was the whole way, walked about in.
  let jumpPre: { key: string; map: LvMap | null; d: { seed: number; level: number; th: number; night: boolean; gen: any } } | null = null;
  function jumpDest() {
    if (S.kind !== 'hub' || !S.board) return null; // (home is the base: not made ahead)
    const idx = S.ftl ? S.ftl.to : (nearAnchor() || { i: -1 }).i;
    if (idx < 0 || !S.board.picked.includes(idx) || S.board.gone.includes(idx)) return null;
    const ms = SD.offers(S.board.seed, S.board.level)[idx] as any; if (!ms) return null;
    return { seed: ms.seed, level: ms.diff, th: ms.th, night: !!ms.night, gen: ms.kind === 'board' ? { size: ms.size, obj: ms.obj, ship: S.fleet.ship, other: ms.other || null, wing: !!ms.wing } : null };
  }
  function jumpPrep() {
    if (!S.on || !Prep) return;
    const d = jumpDest();
    if (!d) { if (jumpPre && !S.ftl) { viewDrop(jumpPre.map); jumpPre = null; } return; }
    const key = Prep.keyOf(d.seed, d.level, d.th, d.night, d.gen);
    if (!jumpPre || jumpPre.key !== key) { if (jumpPre) viewDrop(jumpPre.map); jumpPre = { key, map: null, d }; Prep.want(d.seed, d.level, d.th, d.night, d.gen); return; }
    if (!jumpPre.map) { jumpPre.map = layOut(d); return; }
    prepStep(jumpPre.map, d.gen && d.gen.obj === 'artifact' && jumpPre.map.sp && jumpPre.map.sp.artifact ? 1 : 0);
  }
  /** one of the zone's ships ready to be the level: laid out, drawn and sent to the graphics card (or there's no taking what's made: takeMap) */
  function zoneReady(h: ZHull | undefined) { if (!h) return false; if (!h.key && h.map) return true; const p = h.map && (h.map as any).viewPre as LvViewPre | null; return !!(p && p.done && p.up === true && G_R.progsReady()); }
  // Her own drawing, once it's made ahead and on the graphics card (zoneReady), is shown on her hull out in the zone: her walls, her
  // windows and what's behind them, as they'll be when she's the level (js/game.ts enterLevel takes the same drawing: takeMap). Till
  // then her hull alone is seen, from further off.
  function zoneShow() {
    if (!S.zinfo) return;
    for (const [id, h] of zoneHulls) {
      const p = h.map && (h.map as any).viewPre as LvViewPre | null;
      if (!p || p.root.parent || !zoneReady(h) || !id.startsWith(S.zinfo.ms.seed + ':')) continue;
      h.h.group.add(p.root); p.root.userData.prof = 'zone ship interior'; { const hh = h.h; InteriorCull.track(p.root, h.map!, () => hh.holes, hh.group); } // (her drawing's in the level's own frame, as her hull is)
      if (hid) p.root.traverse((o: any) => { if ((o.isMesh || o.isPoints || o.isLine || o.isSprite) && o.visible) { o.visible = false; hid!.push(o); } });
    }
  }
  let rocksMade = false;
  function zonePrep() { // (from the game's loop, once the frame's drawn: the scene lit as it's drawn, which is what the shaders are found for)
    zoneShow();
    if (!rocksMade && S.on) rocksMade = ShipModel.rockPrep(S.ftl || S.warp ? 8 : 2); // (the rocks' shapes at every level, ahead: js/shipmodel.ts rockPrep. More of it in a jump, where a frame's less missed)
    if (!S.on || S.kind !== 'board' || !S.zone || !S.zinfo || S.docked || S.ftl || S.warp || zoneHullsOf !== S.zinfo.ms.seed) return;
    let best: typeof S.traffic[0] | null = null, bd = ZONE_REAL + 1;
    for (const q of S.traffic) {
      if (!q.real || !q.wp || q.c.k == null) continue;
      const d = S.P.distanceTo(q.wp.p), h = zoneHulls.get(S.zinfo.ms.seed + ':' + q.c.k);
      if (!h) continue;
      if (d > ZONE_DROP) { if (h.map && (h.map as any).viewPre) { viewDrop(h.map); h.map = null; } continue; } // (left behind: what was made of her goes)
      if (d < bd && !zoneReady(h)) { bd = d; best = q; }
    }
    const hit = best && zoneHulls.get(S.zinfo.ms.seed + ':' + best.c.k); if (!best || !hit) return;
    const lv = zoneLevel(S.zdef[best.c.k!]);
    if (!hit.map) {
      const m = layOut(lv); if (!m) return;
      hit.map = m; hit.key = Prep ? Prep.keyOf(lv.seed, lv.level, lv.th, lv.night, lv.gen) : '';
      if (Prep) Prep.want(lv.seed, lv.level, lv.th, lv.night, lv.gen);
      return;
    }
    prepStep(hit.map, lv.gen.obj === 'artifact' && hit.map.sp && hit.map.sp.artifact ? 1 : 0); // (the artifact's glow: things)
  }
  // The squad's ship has come up with one of the zone's others (within 500 m, and well nearer her than the one that's the level), and
  // she's ready (zonePrep: so nothing stops), or within 400 m anyway: the host is asked to make her the level (js/spaceserver.ts
  // 'tboard'). Whoever's flying asks.
  // -- a base on a planet: in orbit over it first (the level out of sight), then down through the cloud to its pad
  function setupAssault(map: LvMap) {
    const R = 60000;
    S.planet = addObj(ShipModel.planet(map.theme, map.seed, R), new T.Vector3(S.berth.x, -R - 14000, S.berth.z));
    const out = new T.Vector3(S.berth.x - 900, 3200, S.berth.z + 2800), a = addObj(ShipModel.anchor(0x9cff8a), out);
    S.anchors.push({ i: -1, obj: a, p: out });
    S.wps.push({ id: 'entry', name: 'DESCENT CORRIDOR', sub: 'Fly in to go down through the cloud', p: new T.Vector3(S.berth.x + 1500, -1800, S.berth.z - 6500), kind: 'entry' }, { id: 'lz', name: 'LANDING PAD', sub: 'Set down outside the base', p: new T.Vector3(S.berth.x, 3, S.berth.z), kind: 'lz', hide: true }, { id: 'out', name: 'ANCHOR', sub: 'Jump home', p: out, kind: 'anchor', i: -1 });
    S.tgt = 0;
    // the ground for a few kilometres round the base, for the way down
    const gm = new T.Mesh(new T.CircleGeometry(9000, 48), new T.MeshStandardMaterial({ color: new T.Color(map.theme.floor as string).multiplyScalar(0.55), roughness: 1 })); gm.rotation.x = -Math.PI / 2; gm.position.set(S.berth.x, -0.45, S.berth.z); gm.visible = false; S.root!.add(gm); gm.userData.ground = 1;
    S.floorAt = (x, z) => { const d = Math.hypot(x - S.berth.x, z - S.berth.z); return S.stage === 'atmo' ? S.berth.y + U.clamp((d - 14) * 0.9, 0.02, 16) : -1e9; };
    stage('orbit');
  }
  function stage(st: 'orbit' | 'atmo') {
    S.stage = st;
    const atmo = st === 'atmo';
    G_R.levelRoot.visible = atmo;
    if (S.planet) S.planet.visible = !atmo;
    for (const o of S.root!.children) if (o.userData.ground) o.visible = atmo;
    for (const a of S.anchors) a.obj.visible = !atmo;
    for (const w of S.wps) w.hide = w.kind === 'lz' ? !atmo : atmo;
    S.tgt = S.wps.findIndex((w) => !w.hide && (atmo ? w.kind === 'lz' : S.state && S.state.done ? w.kind === 'anchor' : w.kind === 'entry'));
    sky();
  }
  // down through the cloud (or up out of it): the screen clouds over, the other place is put there, it clears
  function through(to: 'orbit' | 'atmo') {
    if (S.stage === to) return;
    veilKind('cloud'); Game.veil(true);
    S.thru = { to, map: S.map, left: (Game.VEIL_MS + 250) / 1000 }; // (the other place put there once the veil's up: a countdown of the simulation's steps, thruStep)
  }
  function thruStep(dt: number) {
    const th = S.thru; if (!th) return;
    if (th.map !== S.map || !S.on) { S.thru = null; return; }
    if ((th.left -= dt) > 0) return;
    S.thru = null; const to = th.to;
    {
      stage(to);
      if (isCtl() || !S.ctl) {
        if (to === 'atmo') { S.P.set(S.berth.x + 500, 900, S.berth.z + 900); const d = new T.Vector3(-0.42, -0.5, -0.75).normalize(); S.Q.copy(lookQ(d)); S.V.copy(d).multiplyScalar(90); }
        else { const o = S.wps.find((w) => w.id === 'entry')!.p; S.P.copy(o).lerp(S.anchors[0].p, 0.25); const d = S.anchors[0].p.clone().sub(S.P).normalize(); S.Q.copy(lookQ(d)); S.V.copy(d).multiplyScalar(120); }
      }
      S.net = null;
      Game.veilN = Game.VEIL_SMOOTH;
    }
  }
  function lookQ(dir: THREE.Vector3) { const m = new T.Matrix4().lookAt(new T.Vector3(), dir, new T.Vector3(0, 1, 0)); return new T.Quaternion().setFromRotationMatrix(m); }
  // out of a jump here: in the tunnel a few seconds more (the place is built already: this is the last of the trip)

  // ------------------------------------------------------------------ her deck in the world, her doors
  function syncSolids() {
    const w = S.map && S.map.world; if (!w) return;
    const noseOpen = S.docked && S.kind === 'board', rampOpen = S.docked && S.kind !== 'board';
    for (const q of S.solids) {
      const want = q.tag === 'nose' ? !noseOpen : q.tag === 'ramp' ? !rampOpen : q.tag === 'steps' ? rampOpen : q.tag === 'hatch' ? hatchShut() : true;
      if (want && !q.on) { const o = q.fl ? { kind: 'step', stair: q.fl, mat: Materials.SHIP } : { kind: 'prop', mat: Materials.SHIP }; q.s = World.add(w, SD.solidOf(q, o)); q.on = true; if (q.fl) q.fl.steps.push(q.s); }
      else if (!want && q.on) { World.remove(w, q.s); q.on = false; if (q.fl) q.fl.steps = q.fl.steps.filter((s: any) => s !== q.s); }
    }
    Level.tiltHatch(S.map, hatchShut()); // (her inner door in her own frame too, where you're moved while she lies tilted)
    for (const fl of S.flights) { // (a flight's slope there while its steps are)
      const want = fl.steps.length > 0;
      if (want !== fl.on) { fl.on = want; if (want) (w.ramps = w.ramps || []).push(fl); else w.ramps = (w.ramps || []).filter((st: any) => st !== fl); }
    }
  }
  function doors(dt: number) {
    const m = S.model!, noseOpen = S.docked && S.kind === 'board' ? 1 : 0, rampOpen = S.docked && S.kind !== 'board' && !S.auto ? 1 : 0;
    S.noseT += U.clamp(noseOpen - S.noseT, -dt * 1.6, dt * 1.6); S.rampT += U.clamp(rampOpen - S.rampT, -dt * 0.8, dt * 0.8);
    for (const lf of m.nose) lf.position.x = lf.userData.s * 0.86 * S.noseT;
    { const k = LightGrid.U.lgAoK.value as Float32Array; k[1] = 1 - S.noseT; k[2] = 1 - S.rampT; } // (the occlusion the breach door and the ramp make on what's round them: js/gunao.ts)
    S.hatchT += U.clamp((hatchShut() ? 0 : 1) - S.hatchT, -dt * 0.75, dt * 0.75); // (1.3 s along its rails)
    if (S.hatch) {
      const H = S.hatch, e = S.hatchT * S.hatchT * (3 - 2 * S.hatchT);
      for (const o of H.leaves) { // (each panel along its rails: its edges where they've got to, it between them, turned as they lie)
        const u = o.userData, d = H.D[u.sg > 0 ? 0 : 1] * e, A = H.rail(u.sg, u.s0 + d), B2 = H.rail(u.sg, u.s1 + d);
        o.position.set(0, (A[0] + B2[0]) / 2, (A[1] + B2[1]) / 2);
        const dy = B2[0] - A[0], dz = B2[1] - A[1]; o.rotation.x = u.sg > 0 ? Math.atan2(dz, dy) : Math.atan2(-dz, -dy);
      }
      H.lamp.emissive.setHex(hatchShut() ? 0xff2a10 : 0x20ff60); H.lamp.color.copy(H.lamp.emissive);
    }
    m.ramp.rotation.x = S.rampT * (m.ramp.userData.open || Math.PI / 2 + 0.1); // (down to the ground behind her)
  }

  // Her inner door: an octagon in two halves that run apart on rails into the roof and the floor, across the tunnel's far end, just inside her breaching door. Every breach shuts it (the host:
  // js/spaceserver.ts dock), and it stays shut, for everyone, till one of the squad opens it from its button on the left wall
  // at the head of the stairs (F: openHatch); the button's lamp red while it's shut, green once it's open.
  const hatchShut = () => S.kind === 'board' && S.docked && !S.hatchOpen;
  function hatchMesh() {
    const m = S.model!, L = SD.layout(S.def), tw = L.tw, h = L.CB - L.FB, z = L.zc + SD.HATCH_Z + 0.04;
    const dark = ShipModel.M(0x1a1c20, { metalness: 0.5 });
    // an octagon across the tunnel (its corners cut off, as her collar's are), in her own colour, split across the middle into two
    // halves of two panels each, linked as a sectional door's are. Each half runs on rails (rail): straight up from the middle to the
    // roof (the lower half: down to the floor), round a tight bend, and on back over the tunnel flat inside the roof (or the floor), so
    // to open, the panels slide apart along them, each turning flat as it goes round the bend and on into the roof or the floor out of
    // sight. A wide octagon boss on the middle rides on the lower half. The cut-off corners are fixed gussets.
    const accent = ShipModel.M((ShipModel.PAINT[S.def.id] || ShipModel.PAINT.kestrel)[2], { emissive: 0x1a0c02, metalness: 0.35, roughness: 0.55 });
    const yc = L.FB + h / 2, q = h / 4, c = 0.3, b = 0.25, T0 = 0.045, R = 0.12;
    // the rails, in her frame: where along them (s, metres from the middle) is [y, z]. Up (sg 1): straight to 2 cm under the roof, a
    // bend of radius R, then flat 10 cm into the roof; down (-1): straight to the floor, the bend, flat 12 cm into it (room for the boss)
    const V = [h / 2 - 0.02, h / 2], AR = Math.PI / 2 * R;
    const rail = (sg: number, s: number) => {
      const L1 = V[sg > 0 ? 0 : 1], y1 = yc + sg * L1;
      if (s <= L1) return [yc + sg * s, z];
      if (s <= L1 + AR) { const t = (s - L1) / R; return [y1 + sg * R * Math.sin(t), z + R - R * Math.cos(t)]; }
      return [y1 + sg * R, z + R + (s - L1 - AR)];
    };
    const D = [V[0] + AR + 0.03, V[1] + AR + 0.03]; // (how far each half's panels go: the one by the middle all the way round the bend)
    const ext = (pts: number[][], d: number, mat: THREE.Material) => { const g = new T.ExtrudeGeometry(new T.Shape(pts.map(([x, y]) => new T.Vector2(x, y))), { depth: d, bevelEnabled: false }); g.translate(0, 0, -d / 2); const o = new T.Mesh(g, mat); o.castShadow = o.receiveShadow = true; return o; };
    const leaves: THREE.Object3D[] = [];
    if (!feedRT) feedRT = G_R.viewRT(CAM_W, CAM_H, { type: T.HalfFloatType });
    const screen = new T.MeshBasicMaterial({ map: feedRT.texture, color: 0x0b0f12 }); // (dark till it's live: feed)
    const cam = new T.PerspectiveCamera(88, CAM_W / CAM_H, 0.05, 80);
    for (const sg of [1, -1]) { // (1: the upper half; -1: the lower)
      const Y = (y: number) => sg * y;
      // each panel drawn about its own middle, as it stands shut; s0, s1: where its edges are along the rail, shut
      const panel = (pts: number[][], mid: number, s0: number) => { const o = ext(pts.map(([x, y]) => [x, y - mid]), T0, accent); o.userData = { kind: 'panel', sg, s0, s1: s0 + q }; m.group.add(o); leaves.push(o); return o; };
      const outer = panel([[-tw, Y(q)], [tw, Y(q)], [tw, Y(2 * q - c)], [tw - c, Y(2 * q)], [-tw + c, Y(2 * q)], [-tw, Y(2 * q - c)]], Y(1.5 * q), q);
      const lo = new T.Mesh(new T.BoxGeometry(2 * tw, 0.035, T0 + 0.006), dark); lo.position.set(0, Y(-q / 2 + 0.0175), 0); outer.add(lo); // (a dark lip along its edge toward the middle)
      const inner = panel([[-tw, 0], [tw, 0], [tw, Y(q)], [-tw, Y(q)]], Y(0.5 * q), 0);
      const li = new T.Mesh(new T.BoxGeometry(2 * tw, 0.035, T0 + 0.006), dark); li.position.set(0, Y(-q / 2 + 0.0175), 0); inner.add(li);
      if (sg < 0) { // the boss: a wide octagon over the middle, dark, an orange one inset on it, on your side
        const o8 = (w: number, hh: number, k: number) => [[-w + k, -hh], [w - k, -hh], [w, -hh + k], [w, hh - k], [w - k, hh], [-w + k, hh], [-w, hh - k], [-w, -hh + k]];
        const bo = ext(o8(0.6, b, 0.14), 0.04, dark); bo.position.set(0, q / 2, T0 / 2 + 0.02); inner.add(bo);
        const bi = ext(o8(0.5, b - 0.08, 0.1), 0.02, accent); bi.position.set(0, q / 2, T0 / 2 + 0.05); inner.add(bi);
        const sw = 0.48, sc = new T.Mesh(new T.PlaneGeometry(sw, sw * CAM_H / CAM_W), screen); sc.position.set(0, q / 2, T0 / 2 + 0.062); inner.add(sc); // (the camera's picture on the boss, on your side)
        // the camera: in the middle of the door's outer face, just under the seam, looking straight out through her breaching door
        // into whatever's there; it rides with the panel, and it's off once the door's open (feed)
        const housing = new T.Mesh(new T.BoxGeometry(0.12, 0.08, 0.05), dark); housing.position.set(0, q / 2 - 0.06, -T0 / 2 - 0.025); inner.add(housing);
        cam.position.set(0, q / 2 - 0.06, -T0 / 2 - 0.055); inner.add(cam);
      }
    }
    for (const [sx, sy] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) { // the corners' gussets, through the door's whole depth
      const g = ext([[sx * tw, sy * (2 * q - c)], [sx * tw, sy * 2 * q], [sx * (tw - c), sy * 2 * q]], 0.16, accent); g.position.set(0, yc, z); m.group.add(g);
    }
    const B = SD.hatchButton(S.def), lamp = new T.MeshStandardMaterial({ color: 0xff2a10, emissive: 0xff2a10, emissiveIntensity: 1.6 });
    const box = new T.Mesh(new T.BoxGeometry(0.05, 0.18, 0.14), dark); box.position.set(B.x + 0.025, B.y, B.z); m.group.add(box);
    const btn = new T.Mesh(new T.CylinderGeometry(0.035, 0.035, 0.03, 12), lamp); btn.rotation.z = Math.PI / 2; btn.position.set(B.x + 0.06, B.y, B.z); m.group.add(btn); // (facing across the flight)
    // the door camera's picture also on screens on the cover either side of the tunnel's mouth (facing the staging space) and beside the button
    const panel = (x: number, y: number, z: number, w: number, ry: number) => {
      const h = w * CAM_H / CAM_W, bz = new T.Mesh(new T.BoxGeometry(w + 0.05, h + 0.05, 0.025), dark); bz.position.set(x, y, z); bz.rotation.y = ry; m.group.add(bz);
      const sc = new T.Mesh(new T.PlaneGeometry(w, h), screen); sc.position.set(x + Math.sin(ry) * 0.014, y, z + Math.cos(ry) * 0.014); sc.rotation.y = ry; m.group.add(sc); // (just off the bezel's face, the way it faces)
    };
    const cw = Math.min(0.5, L.sw - L.tw - 0.2), cx = (L.tw + L.sw) / 2;
    if (cw > 0.2) for (const s of [-1, 1]) panel(s * cx, L.FB + 1.45, L.zt + 0.013, cw, 0); // (on the cover, its face toward the staging space)
    panel(B.x + 0.013, B.y + 0.3, B.z + 0.45, 0.4, Math.PI / 2); // (on the same wall beside the button, behind it along the flight, facing across it)
    S.hatch = { leaves, rail, D, lamp, tw, cam, screen, n: 0 };
    if (!G_R.feeds.includes(feed)) G_R.feeds.push(feed);
  }
  // The door camera's picture: drawn while she's against a hull with her inner door shut and you're aboard, a frame in three (20 a second, at CAM_W x CAM_H),
  // into feedRT, without the shadows being drawn again for it (they're the frame's own); dark otherwise
  const CAM_W = 320, CAM_H = 200;
  let feedRT: THREE.WebGLRenderTarget | null = null;
  function feed(r: THREE.WebGLRenderer) {
    const H = S.hatch;
    if (!H || !feedRT) return;
    const live = S.on && S.kind === 'board' && S.docked && !S.auto && hatchShut() && aboard(); // (the door open: you can see for yourself)
    H.screen.color.setHex(live ? 0xd8e8f0 : 0x0b0f12);
    if (!live || H.n++ % 3) return;
    const au = r.shadowMap.autoUpdate; r.shadowMap.autoUpdate = false;
    H.cam.updateMatrixWorld(); r.setRenderTarget(feedRT); r.clear(); r.render(G_R.scene, H.cam); r.setRenderTarget(null);
    r.shadowMap.autoUpdate = au;
  }
  // her inner door's sound, from the middle of it: the heavy sliding door's (js/audio.ts slideDoor), as long as it takes on its rails (1.3 s)
  function hatchSound(open: boolean) {
    const m = S.model; if (!m || !S.hatch) return;
    const L = SD.layout(S.def), p = m.group.localToWorld(new THREE.Vector3(0, (L.FB + L.CB) / 2, L.zc + SD.HATCH_Z));
    Audio.slideDoor(p, open, true, 1.3);
  }
  // the button pressed: open for everyone (the host says so to all: 'shatch'), open here straight away
  function openHatch() {
    if (!hatchShut()) return;
    Net.toHost({ t: 'shatch' });
    S.hatchOpen = true; syncSolids(); Audio.click(); hatchSound(true);
  }

  // ------------------------------------------------------------------ what's outside, moved by the inverse of her pose
  const _r = new T.Quaternion(), _p = new T.Vector3();
  function outside() {
    if (!S.on || !S.root) return;
    _r.copy(S.Q).invert().premultiply(S.Dq); // R = Dq * Q^-1
    _p.copy(S.P).applyQuaternion(_r).negate().add(S.Dp);
    if (S.docked && !S.auto) { _r.identity(); _p.set(0, 0, 0); }
    for (const o of [G_R.levelRoot, S.root]) { o.quaternion.copy(_r); o.position.copy(_p); }
    const cam = G_R.camera;
    if (S.stars) { S.stars.position.copy(cam.position); S.stars.quaternion.copy(_r); if (S.zone) S.stars.quaternion.multiply(S.zone.quaternion); } // (the stars are the zone's: they turn when the ship the level is turns)
    if (S.sun) {
      const sd = S.star ? S.star.dir : [0.5, 0.62, 0.6], d = new T.Vector3(sd[0], sd[1], sd[2]).normalize(); if (S.zone) d.applyQuaternion(S.zone.quaternion); d.applyQuaternion(_r); // (the zone's sun, as the stars are the zone's: it stays where it is when the level changes to another of her ships)
      S.sun.position.copy(cam.position).addScaledVector(d, 200); S.sun.target.position.copy(cam.position);
      const want = S.docked && !S.auto ? 0 : S.ftl ? 0.4 : S.star ? S.star.I : 2.4; S.sun.intensity += (want - S.sun.intensity) * 0.08;
      if (ROCKS.obj && S.zone) { S.zone.updateWorldMatrix(true, false); ROCKS.obj.userData.lod(S.zone.worldToLocal(cam.position.clone()), cam); } // (each rock as finely as it looks big)
      if (S.starObj) { S.starObj.position.copy(cam.position); S.starObj.quaternion.setFromUnitVectors(_mz, d); S.starObj.visible = !!S.stars && S.stars.visible && !S.ftl; } // (its disc where its light comes from)
    }
  }
  // Flying, nothing of the level's that isn't in its drawing may show (it would hang beside her where the level was):
  // everything loose in the scene is put out of sight, and the people who aren't aboard; put back when she's against it again.
  function hideStrays() {
    const sc = G_R.scene, keep = new Set<THREE.Object3D>([G_R.camera, G_R.levelRoot, G_R.dynRoot, S.root!, S.model!.group, S.stars!, S.sun!, S.sun!.target, ...(S.starObj ? [S.starObj] : [])]);
    if (!S.hidden) S.hidden = new Map();
    for (const c of sc.children) {
      if (keep.has(c) || (c as any).isLight) continue; // (every light stays: the weapon lights' and muzzle flashes' pools are dark till used, and one light more or less when they came back at the breach had every shader made again)
      if (!S.hidden.has(c)) S.hidden.set(c, c.visible);
      c.visible = false;
    }
    const crew = new Set<THREE.Object3D>();
    for (const pv of Views.players.values()) if (pv.rig && pv.st && aboardAt(pv.st.p[0], pv.st.p[1], pv.st.p[2])) crew.add(pv.rig.root);
    for (const c of G_R.dynRoot.children) {
      if (crew.has(c)) { c.visible = true; continue; }
      if (!S.hidden.has(c)) S.hidden.set(c, c.visible);
      c.visible = false;
    }
  }
  function unhide() {
    if (!S.hidden) return;
    for (const [o, v] of S.hidden) o.visible = v;
    S.hidden = null;
    // (the people hidden with them were only deferred while they were (js/views.ts, parked): posed now, as they're about to be drawn, not
    // a frame later where their rig was last left)
    for (const ev of Views.enemies.values()) if (ev.rig.pend) ev.rig.update(0, ev.rig.pend.p);
  }

  // ------------------------------------------------------------------ seats
  // The seat you're looking at: the one the middle of your view meets first within 2 m (a box round each chair, from its deck to its
  // headrest, a little wider than it), and lit while it is (seatLit)
  function seatLooked() {
    const cam = G_R.camera, o = cam.getWorldPosition(new T.Vector3()), dir = cam.getWorldDirection(new T.Vector3());
    const p = SD.toShip(S.berth, o.x, o.y, o.z), c = Math.cos(S.berth.yaw), s = Math.sin(S.berth.yaw), dx = dir.x * c - dir.z * s, dz = dir.x * s + dir.z * c, dy = dir.y;
    let best = -1, bt = 2.0;
    S.seatsDef.forEach((st, i) => {
      const h = st.k === 'jump' ? 0.3 : 0.34, lo = [st.x - h, st.f, st.z - h], hi = [st.x + h, st.y + 1.15, st.z + h], O = [p.x, p.y, p.z], D = [dx, dy, dz];
      let t0 = 0, t1 = bt;
      for (let a = 0; a < 3; a++) {
        if (Math.abs(D[a]) < 1e-9) { if (O[a] < lo[a] || O[a] > hi[a]) return; continue; }
        let ta = (lo[a] - O[a]) / D[a], tb = (hi[a] - O[a]) / D[a]; if (ta > tb) [ta, tb] = [tb, ta];
        t0 = Math.max(t0, ta); t1 = Math.min(t1, tb); if (t0 > t1) return;
      }
      if (t0 < bt) { bt = t0; best = i; }
    });
    return best;
  }
  let litSeat = -1;
  function seatLit(i: number) {
    const ms = S.model && S.model.seats; if (!ms || i === litSeat) return;
    for (const m of ms[litSeat] || []) m.emissive.setHex(m.userData.e0);
    litSeat = i; for (const m of ms[i] || []) { if (m.userData.e0 == null) m.userData.e0 = m.emissive.getHex(); m.emissive.setHex(0x2c5a78); }
  }
  function seatPos(i: number) {
    const s = S.seatsDef[i] || S.seatsDef[0], w = SD.toWorld(S.berth, s.x, s.y, s.z);
    return { x: w.x, y: w.y, z: w.z, yaw: S.berth.yaw + s.yaw };
  }
  function sit(i: number, quiet?: boolean) {
    const m = me(), p = seatPos(i);
    if (S.seatsDef[i] && S.seatsDef[i].k === 'sensors') { EW.holo.sy = p.yaw; EW.holo.sat = S.t; EW.holo.auto = true; } // (and on sitting, into the hologram: sensorStep) // (where the seat faces, for its hologram: sensorStep)
    m.seat = i; m.pos.set(p.x, p.y, p.z); m.vel.set(0, 0, 0); m.yaw = p.yaw; m.pitch = 0; m.crouch = true; m.stowed = true; m.mouse.l = m.mouse.r = false;
    if (!quiet) { Net.toHost({ t: 'seat', s: i }); Audio.click(); }
    if (S.seatsDef[i].k === 'helm') { S.ctl = Net.myId; S.net = null; S.helpAt = S.t; }
    S.stick.set(0, 0);
  }
  function stand() {
    const m = me(), i = m.seat; if (i == null) return;
    const s = S.seatsDef[i], w = SD.toWorld(S.berth, s.sx, s.f + 0.02, s.sz); // (beside it, on its deck)
    m.seat = null; m.pos.set(w.x, w.y, w.z); m.vel.set(0, 0, 0); m.crouch = false; m.stowed = false;
    Net.toHost({ t: 'seat', s: -1 }); Audio.click();
  }
  // everyone who's on their feet is aboard (nobody's left behind when she goes)
  function crewAboard() {
    const out: string[] = [];
    for (const pv of Views.players.values()) { const st = pv.st; if (pv.id === Net.myId || !st || st.dd) continue; /* (down still counts: only the dead are left) */ if (!aboardAt(st.p[0], st.p[1], st.p[2])) out.push(pv.name); }
    if (!aboard() && !me().dead) out.push('you');
    return out;
  }

  // ------------------------------------------------------------------ flying her
  const K = (c: string) => !!me().keys[c] && !Game.chatOpen && !Game.menuOpen();
  // (the flight keys and the stick this step, as js/spacesim.ts FlyIn)
  const flyIn = (): FlyIn => ({ b: (K('KeyW') ? FB.W : 0) | (K('KeyA') ? FB.A : 0) | (K('KeyS') ? FB.S : 0) | (K('KeyD') ? FB.D : 0) | (K('Space') ? FB.U : 0) | (K('KeyC') ? FB.C : 0) | (K('KeyX') ? FB.X : 0) | (K('KeyQ') ? FB.Q : 0) | (K('KeyE') ? FB.E : 0), sx: S.stick.x, sy: S.stick.y, base: null });
  // (her thrust, m/s²: the main engine's, the others', the brake's (all of them, to the field's way); her top speed off the field's way, m/s)
  const shipZ = zmem(); // (her flight's constants: js/spacesim.ts FLY)
  // the first of her trackers holding a track with a solution (where it is and how fast it goes, as her radar has it: js/radar.ts)
  function radarLock() { const o = shownOwn(); if (!o) return null; let b: RSTrack | null = null; for (const t of Radar.sched(o).tts) if (t.est.q > 0.1 && (!b || (t.op ? 1 : 0) > (b.op ? 1 : 0) || ((t.op ? 1 : 0) === (b.op ? 1 : 0) && t.est.q > b.est.q))) b = t; return b; } // (her best track: her operator's picks first)
  function fly(dt: number) {
    FLYI.ran = false; FLYI.I = null;
    const seat = mySeat(), helm = !!seat && seat.k === 'helm' && isCtl() && !me().dead && !me().down;
    // the mouse: what it's turned your view by since the last frame is the stick's push (it springs back)
    // (the right button held: your head turns instead, to look about the cockpit and out of its glass)
    if (helm && !me().mouse.r) {
      const sy = seatPos(me().seat as number).yaw, dy = U.angDiff(sy, me().yaw), dp = me().pitch - S.lookP;
      me().yaw = sy; me().pitch = S.lookP = 0;
      S.stick.x = U.clamp(S.stick.x + dy * 2.2, -1, 1); S.stick.y = U.clamp(S.stick.y + dp * 2.2, -1, 1);
    } else if (helm) {
      // (looking about, zoomed: the head turns that much slower, so what's looked at stays under the mouse)
      const m = me(); if (!ZM.on) { ZM.on = true; ZM.y = m.yaw; ZM.p = m.pitch; }
      if (ZM.z > 1) { m.yaw = ZM.y + U.angDiff(ZM.y, m.yaw) / ZM.z; m.pitch = ZM.p + (m.pitch - ZM.p) / ZM.z; }
      ZM.y = m.yaw; ZM.p = m.pitch; S.lookP = m.pitch;
    }
    // (the rest is her helm's: js/helm.ts, from this step's input)
    const lk = S.match === 'radar' ? radarLock() : null;
    const I: HelmIn = { h: helm, b: flyIn().b, sx: S.stick.x, sy: S.stick.y, rb: lk ? lk.est.v.clone() : null }; C2.lastI = I;
    const r = HM.step(I, dt); // (with the target's own way followed, and the cloud crossed: js/helm.ts step)
    if (r) { FLYI.ran = true; FLYI.I = r.I; }
  }
  // The plan she's flying, drawn for her pilot: her breaching door's way from where it is to where it meets the hull, as the outline
  // of the door itself every PLAN_GAP metres along it, counted back out from the hull (gates: they stay where they are on her way in,
  // so she flies through them one after another, each gone as she passes it), square to the way she's going there, a faint line down
  // their middle; at the hull the one she'll cut, brighter. The plan
  // as it stands this frame (squareUp): across and up or down, the least-acceleration one (its push falling off evenly to nothing at
  // the hull: y = y0 + v t + a0 (t²/2 - t³/6T)), or none in the last COAST seconds; the older plans drawn as levelling off; forward,
  // at her speed now, speeding up as the time to go was reckoned. Shown only while she's lined up.
  const PLAN_N = 64, PLAN_G = 16, PLAN_GAP = 20;
  // her door's outline round its middle (x across, y up), its corners cut
  const DOOR = (() => { const hw = 0.85, hh = 1.1, k = 0.28; return [[-hw + k, -hh], [hw - k, -hh], [hw, -hh + k], [hw, hh - k], [hw - k, hh], [-hw + k, hh], [-hw, hh - k], [-hw, -hh + k]]; })();
  function planDraw(p: { fx: number; fz: number; nx: number; nz: number; tx: number; tz: number; out: number; side: number; vs: number; dy: number; vy: number; T: number; v0: number; aF: number; vm: number; coast: boolean; a0: number | null; ay0: number | null }) {
    const Tt = p.T, dist = Math.max(0, p.out);
    const along = (t: number) => { if (p.aF <= 0) return p.v0 * t; const t1 = (p.vm - p.v0) / p.aF; return t <= t1 ? p.v0 * t + p.aF * t * t / 2 : p.v0 * t1 + p.aF * t1 * t1 / 2 + p.vm * (t - t1); };
    const ease = (y0: number, v: number, a0: number | null, t: number) => { const s = t / Tt; return a0 == null ? y0 * (1 - 3 * s * s + 2 * s * s * s) + v * Tt * (s - 2 * s * s + s * s * s) : y0 + v * t + a0 * (t * t / 2 - t * t * t / (6 * Tt)); };
    const at = (t: number, last = false) => { const out = last ? 0 : Math.max(0, dist - along(t)), sd = ease(p.side, p.vs, p.coast ? 0 : p.a0, t), up = 1.4 + ease(p.dy, p.vy, p.coast ? 0 : p.ay0, t); return new T.Vector3(p.fx + p.nx * out + p.tx * sd, up, p.fz + p.nz * out + p.tz * sd); };
    const pts: THREE.Vector3[] = []; for (let i = 0; i <= PLAN_N; i++) pts.push(at(Tt * i / PLAN_N, i === PLAN_N));
    routeDraw(pts, new T.Vector3(-p.nx, 0, -p.nz));
  }
  // A way in drawn for her pilot (planDraw's, or the way round to a side she can breach: roundUp): PLAN_N + 1 points of it from her
  // collar to the hull, the way she'll meet the hull there (into it)
  function routeDraw(pts: THREE.Vector3[], into: THREE.Vector3) {
    if (!S.root) return;
    let o = S.plan;
    if (!o || o.line.parent !== S.root) {
      const seg = (n: number) => new T.BufferGeometry().setAttribute('position', new T.BufferAttribute(new Float32Array(n * DOOR.length * 6), 3));
      const line = new T.Line(new T.BufferGeometry().setAttribute('position', new T.BufferAttribute(new Float32Array((PLAN_N + 1) * 3), 3)), new T.LineBasicMaterial({ color: 0x6fe3ff, transparent: true, opacity: 0.3, depthTest: false }));
      const gates = new T.LineSegments(seg(PLAN_G), new T.LineBasicMaterial({ color: 0x6fe3ff, transparent: true, opacity: 0.7, depthTest: false }));
      const end = new T.LineSegments(seg(1), new T.LineBasicMaterial({ color: 0xbff4ff, transparent: true, opacity: 1, depthTest: false }));
      line.renderOrder = gates.renderOrder = end.renderOrder = 999; line.frustumCulled = gates.frustumCulled = end.frustumCulled = false;
      S.root.add(line, gates, end); o = S.plan = { line, gates, end };
    }
    const pos = o.line.geometry.getAttribute('position') as THREE.BufferAttribute;
    for (let i = 0; i <= PLAN_N; i++) { const q = pts[Math.min(i, pts.length - 1)]; pos.setXYZ(i, q.x, q.y, q.z); }
    pos.needsUpdate = true; o.line.geometry.computeBoundingSphere();
    // (a door's outline at a point of it, square to the way it's going there; at the hull, square to the hull's face)
    const f = new T.Vector3(), r = new T.Vector3(), u = new T.Vector3(), W = new T.Vector3(0, 1, 0);
    const door = (ga: THREE.BufferAttribute, n: number, c: THREE.Vector3, dir: THREE.Vector3) => {
      f.copy(dir).normalize(); r.crossVectors(f, W); if (r.lengthSq() < 1e-6) r.set(1, 0, 0); r.normalize(); u.crossVectors(r, f).normalize();
      for (let e = 0; e < DOOR.length; e++) {
        const a = DOOR[e], b = DOOR[(e + 1) % DOOR.length], k = (n * DOOR.length + e) * 2;
        ga.setXYZ(k, c.x + r.x * a[0] + u.x * a[1], c.y + r.y * a[0] + u.y * a[1], c.z + r.z * a[0] + u.z * a[1]);
        ga.setXYZ(k + 1, c.x + r.x * b[0] + u.x * b[1], c.y + r.y * b[0] + u.y * b[1], c.z + r.z * b[0] + u.z * b[1]);
      }
    };
    // (the way back out from the hull, a point at a time (pos, last first), and how far along it each is: a gate every PLAN_GAP metres of
    // it, where it falls between two of them; none past her)
    const gp = o.gates.geometry.getAttribute('position') as THREE.BufferAttribute, P = (i: number) => new T.Vector3(pos.getX(i), pos.getY(i), pos.getZ(i));
    let g = 0, run = 0, want = PLAN_GAP;
    for (let i = PLAN_N; i > 0 && g < PLAN_G; i--) {
      const a = P(i), b = P(i - 1), len = a.distanceTo(b);
      while (g < PLAN_G && run + len >= want && len > 1e-6) { const c = a.clone().lerp(b, (want - run) / len); door(gp, g++, c, a.clone().sub(b)); want += PLAN_GAP; }
      run += len;
    }
    for (; g < PLAN_G; g++) for (let k = 0; k < DOOR.length * 2; k++) gp.setXYZ((g * DOOR.length) * 2 + k, 0, 0, 0); // (none left: folded away to nothing)
    gp.needsUpdate = true; o.gates.geometry.computeBoundingSphere();
    door(o.end.geometry.getAttribute('position') as THREE.BufferAttribute, 0, pts[pts.length - 1], into);
    (o.end.geometry.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true; o.end.geometry.computeBoundingSphere();
    o.line.visible = o.gates.visible = o.end.visible = true;
  }
  // ---- Coming round to a side she can breach. Closing on the ship (her way running into the box round one of her hulls, within ROUND.R)
  // with no stretch she can breach on her course or her nose's line (her bow or her stern, mostly): the one she can get to with least
  // going round and least turning is picked, and she's flown to the line straight out from it, ROUND.OUT off her plating: round the
  // corner of the hull first if the way there would cross it (a corner of the box round each of her hulls, ROUND.MARGIN off her), then
  // onto that line, a point ROUND.LOOK ahead along it chased, so she joins it heading in. Her course turned with up to ROUND.A across
  // it, and held to ROUND.VMAX (braked at up to ROUND.BRAKE, the throttle not hers), or no ship that size could be got round at all.
  // Her nose level, on her way, turned no faster than ROUND.RATE. Once she's on the line, heading in, at her collar's height and far
  // enough out to get up to speed on it (ROUND.IN or more), the breach assist has her, on that site (squareUp). Turning hard, slowing
  // to nothing, standing well off, or getting past the hull's face without lining up lets it go.
  // how far she is from anything big (no cruising close in)
  function clearOf() {
    let dmin = 1e9;
    if (S.kind === 'hub') { const b = new T.Vector3(S.berth.x, -1500, S.berth.z); dmin = S.P.distanceTo(b) - 1500; }
    else if (S.kind === 'board') dmin = S.P.distanceTo(S.Dp);
    else if (S.stage === 'atmo') dmin = 0; else dmin = S.P.y + 4000;
    return dmin;
  }
  /** how far out from a target's middle its hull reaches */
  function tgtR(w: SpWp) {
    const q = S.traffic.find((x) => x.wp && x.wp.id === w.id); // (by its id: her helm's shadow has copies of the waypoints)
    if (q) return trafficR((q.c as any).kind, (q.c as any).seed); // (her stand-in's reach, from its shape: the server's the same, js/helm.ts trafficR)
    if (w.id === 'ship' && S.map && S.map.sp) { const h = S.map.sp.hull; return Math.hypot(h.x1 - h.x0, h.z1 - h.z0) / 2; }
    return 0;
  }
  function damage(n: number, why?: string) {
    if (!isCtl()) return;
    // (the server keeps her hull: what she hit herself is told it (at nothing it jumps her home, or patches her up at home), and her
    // hull's as its snapshots say: svSss)
    if (!C2.on) Net.toHost({ t: 'sdmg', d: Math.round(n * 100) / 100 }); // (the server, flying her, has it from its own step)
    if (why && n > 4) HUD.toast('HULL ' + Math.round(Math.max(0, S.hp - n) / S.hpMax * 100) + '%', why, 1.5);
  }
  // she's against it (or off it) on this screen: her helm's part (js/helm.ts dock), and her inner door, her solids, who's seen
  function dockLocal(on: boolean) {
    if (on && S.kind === 'board') { if (S.hatchOpen) hatchSound(false); S.hatchOpen = false; } // (a breach shuts her inner door: js/spaceserver.ts dock does too)
    HM.dock(on);
    if (on) { S.net = null; unhide(); }
    syncSolids();
  }
  // the pilot's: set down (the pad in the hangar, the pad outside a base), and lift off or back away
  function land() { HM.land(); helmCmd(['l']); }
  function launch() {
    const left = crewAboard();
    if (left.length) { HUD.toast('NOT YET', 'Not aboard: ' + left.join(', '), 2); return; }
    if (C2.on) helmCmd(['u']); else Net.toHost({ t: 'sdock', on: 0 }); // (the server undocks her itself while it flies her: js/svbattle.ts flyOn)
    dockLocal(false);
    HM.launchAway();
  }
  // her helm (js/helm.ts): flown on this page's own S, through the level as it's drawn here (its sites, the zone's frame, the rocks near
  // her), what it does beyond her flight done here (helmEv)
  const HM = helmOf(S, {
    sites: () => siteList(), siteAt: (a) => siteAt(a), tgtR: (w) => tgtR(w as SpWp), fieldAt: (p) => fieldAt(p),
    zstep: (p, v, dt) => zstep(p, v, dt, shipZ), zturn: (q) => zturn(q), rocks: () => ROCKS, rockList: () => S.rockList, boom: () => !!(S.state && S.state.boom), done: () => !!(S.state && S.state.done), zC: () => S.zC, zoneDir: (k: number) => zoneDir(k), ready: (k: number) => !!(S.zinfo && zoneReady(zoneHulls.get(S.zinfo.ms.seed + ':' + k))), zreset: () => { shipZ.v.set(NaN, 0, 0); },
  }, (e) => helmEv(e));
  function helmEv(e: HelmEv) {
    if (C2.replay) return; // (a step flown again: done once already)
    switch (e.k) {
      case 'toast': HUD.toast(e.h, e.b, e.t); break;
      case 'kick': Audio.kick(e.a); break;
      case 'pose': sendPose(true); break;
      case 'plan': planDraw(e.p); break;
      case 'route': routeDraw(e.pts, e.n); break;
      case 'dmg': damage(e.n, e.why); break;
      case 'rebase': rebase(e.b); break;
      case 'through': veilKind('cloud'); Game.veil(true); break; // (the veil down as she goes in: the crossing's her helm's)
      case 'stage': stage(e.to); S.net = null; Game.veilN = Game.VEIL_SMOOTH; break;
      case 'jump': if (!C2.on) Net.toHost({ t: 'jump', to: e.to }); break; // (spooled: the host asked to jump her; the server, flying her, asks it itself)
      case 'ftlOut': ftlOut(); break;
      case 'tboard': if (!C2.on) Net.toHost({ t: 'tboard', k: e.to }); break; // (the server, flying her, boards her itself)
      case 'auto': {
        const t = e.then;
        // (the server, flying her, docks her itself on its own step: js/svbattle.ts helmEv; this page tells it only when it isn't)
        if (t.k === 'breach') { if (!C2.on) Net.toHost({ t: 'sdock', on: 1, site: t.at }); cutHere(t.at); dockLocal(true); }
        else if (t.k === 'land') { if (!C2.on) Net.toHost({ t: 'sdock', on: 1 }); dockLocal(true); if (S.kind === 'hub') { S.hp = S.hpMax; HUD.toast('DOCKED', 'Welcome home', 2); } }
        break;
      }
    }
  }
  const aim = (maxT?: number, reach?: number, dir?: THREE.Vector3) => HM.aim(maxT, reach, dir);
  // (zone ship k's heading, level, in the level's frame: the zone's maths at its time now)
  function zoneDir(k: number) { const c = S.zdef.find((q) => q.k === k); if (!c || !S.zone) return new T.Vector3(0, 0, 1); const z = SD.zonePos(c, S.zt0 + (S.t - S.ztAt)); return new T.Vector3(z.d[0], 0, z.d[2]).applyQuaternion(S.zone.quaternion); }
  const warpGate = () => HM.warpGate(), warpGo = () => HM.warpGo(), tgtTrack = (dt: number) => HM.tgtTrack(dt);
  const dbgBr = (o: any) => HM.dbgBr(o);
  // ------------------------------------------------------------------ the jump
  function nearAnchor() { let best: typeof S.anchors[0] | null = null, bd = 420; for (const a of S.anchors) { if (!a.obj.visible) continue; const d = S.P.distanceTo(a.p); if (d < bd && !(S.kind === 'hub' && S.board.done.includes(a.i))) { bd = d; best = a; } } return best; }
  // the stars smeared into lines by the drive, k how far (0: none); eased, and drawn from her nose in the stars' frame
  let smearK = 0;
  let moteK = 0;
  function smear(dt: number, want: number, motes = 0) {
    smearK += (want - smearK) * Math.min(1, dt * 4); moteK += (motes - moteK) * Math.min(1, dt * 4);
    const st = S.stars; if (!st) return;
    const u = st.userData.streak as { f: { value: THREE.Vector3 }; k: { value: number }; tr: { value: THREE.Vector3 }; R: { value: number } }, line = st.userData.streaks as THREE.Object3D;
    u.k.value = smearK; (u as any).mk.value = moteK; void line;
    u.f.value.copy(fwd(S.Q)); if (S.zone) u.f.value.applyQuaternion(_zq.copy(S.zone.quaternion).invert());
    // (the motes near her go by as fast as the smear's long: kept within one box's width, the shader wraps them)
    const w = 2 * u.R.value, t = u.tr.value.addScaledVector(u.f.value, smearK * 1400 * dt);
    const tm = (st.userData.streak as any).tm; tm.value = (tm.value + smearK * 0.9 * dt) % 1000; // (the far stars along their way out from the middle)
    const pm = st.material as THREE.PointsMaterial; pm.color.setScalar(Math.max(0, 1 - smearK * 2.6)); // (the still ones gone once the drive's going: every star's a streak going by)
    t.set(((t.x % w) + w) % w, ((t.y % w) + w) % w, ((t.z % w) + w) % w);
  }
  let tunUp: { map: LvMap | null; steps: ((ms: number) => boolean)[] } | null = null;
  let hid: THREE.Object3D[] | null = null;
  function unseen(on: boolean) {
    if (!on) { if (hid) { for (const o of hid) o.visible = true; hid = null; } return; }
    if (hid) return;
    hid = [];
    for (const root of [S.root, S.kind !== 'assault' ? G_R.levelRoot : null]) if (root) root.traverse((o: any) => { if ((o.isMesh || o.isPoints || o.isLine || o.isSprite) && o.visible) { o.visible = false; hid!.push(o); } });
  }
  // out of the tunnel: what's seen (the tunnel put away; the view held veiled over a place not ready to draw yet, else the flash)
  function ftlOut() { if (S.tunnel) S.tunnel.visible = false; if (isCtl() || !S.ctl) sendPose(true); if ((tunUp && tunUp.steps.length) || !G_R.progsReady()) S.veil = { t: 0 }; else SpaceUI.flash(); unseen(false); sky(); }
  // (the jump drive's run as it's seen: its flight is her helm's, js/helm.ts ftlStep (the pilot's in her helm's step; the others' here))
  function ftlStep(dt: number, flies: boolean) {
    if (!flies) HM.ftlStep(dt);
    const f = S.ftl;
    if (!f && S.veil) { // (out of the tunnel, the view still veiled while what she sees is made ready: then the flash, and it's there)
      S.veil.t += dt; if (tunUp) while (tunUp.steps.length && tunUp.steps[0](3)) tunUp.steps.shift();
      const ready = (!tunUp || !tunUp.steps.length) && G_R.progsReady();
      if (ready || S.veil.t > 4) { S.veil = null; unseen(false); SpaceUI.flash(); } else { unseen(true); return; }
    }
    if (!f) {
      if (S.tunnel) S.tunnel.visible = false;
      smear(dt, S.warp ? Math.sqrt(U.clamp(S.warp.u / S.warp.top, 0, 1)) * 0.55 : S.spin * 0.015);
      return;
    }
    const tn = S.tunnel!, tex = tn.userData.tex as THREE.Texture, mat = tn.userData.mat as THREE.MeshBasicMaterial;
    tn.visible = false; // (no tube: the stars smear instead)
    { const k = f.st === 'spool' ? 0.35 * (f.t / f.T) ** 2 : f.st === 'wait' ? 0.45 : 0.7 * U.clamp((f.T - f.t) / 0.6, 0, 1); smear(dt, k, k); } // (the jump: motes going by too; the warp, a few kilometres, none)
    if (f.st === 'spool') {
      const u = Math.min(1, f.t / f.T); mat.opacity = u * 0.9; tex.offset.y -= dt * (0.4 + u * 3);
    } else if (f.st === 'wait') { mat.opacity = 0.9; tex.offset.y -= dt * 3.4; }
    else {
      // the tunnel on the way out: the place is there already, out of sight till she drops out of it
      const left = f.T - f.t; mat.opacity = U.clamp(left / 0.5, 0, 1) * 0.95; tex.offset.y -= dt * 3.4;
      // (meanwhile what she'll see when she drops out, sent to the graphics card and its shaders found a few milliseconds a frame:
      // out of sight it's never drawn, so the first frame out would do all of it at once)
      if (!tunUp || tunUp.map !== S.map) tunUp = { map: S.map, steps: [G_R.preload(G_R.levelRoot), ...(S.root ? [G_R.preload(S.root)] : [])] };
      while (tunUp.steps.length && tunUp.steps[0](3)) tunUp.steps.shift();
      // (and she doesn't drop out till it is, its shaders made too, on the driver's threads: the clock's held short of the end, four seconds at most)
      // (she drops out on the trip's own clock; if what she'll see isn't ready to draw yet (its shaders still being made), the view keeps the
      // tunnel's look over it a little longer (S.veil, four seconds at most): the simulation goes on meanwhile)
    }
    // in the tunnel the place is out of sight (its meshes: its lights stay, or every shader would be made again for the change
    // in them when she drops out), the stars aren't: they're what's smeared
    unseen(f.st === 'tunnel' && !!S.ftl);
    if (S.stars) S.stars.visible = S.kind !== 'assault' || S.stage !== 'atmo';
    if (!S.ftl) sky();
  }

  // ------------------------------------------------------------------ the pose, told and heard
  let matchSent = '';
  // ---- her helm on the server (docs/space-server.md C2, C3). While the server's battle's on, the pilot's page sends each step (sin),
  // numbered by its step: the pilot's input (at the helm, the keys, the stick as pushed, her radar lock's way, the target picked and
  // what she's matched with, and the commands given since the last step: warp, set down, the drive spun down), and the server flies
  // her helm from them (js/svbattle.ts, js/helm.ts) and says where it has her after each (fast stream 5: its whole helm state). Each of
  // the page's steps is checked against a shadow of the helm flown from the same state and input: the same to the bit, its input's
  // all that's sent; not (she was moved by something else: a level's change, the jump, a test), her state after it is, and the server
  // takes that. The page flies ahead of the server as before (predicting); when the server's word for a step differs from what the
  // page had, it's taken and the steps since flown again from their inputs, each through its own step's zone frame.
  const FLYI = { ran: false, I: null as FlyIn | null }; // (the helm's free flight this step: js/helm.ts fly)
  type C2E = { s: number; I: HelmIn | null; tg: string | null; m: string | null; c: any[]; Z: any; post: any; free: boolean };
  const C2 = { on: false, hist: [] as C2E[], out: [] as any[], cmd: [] as any[], fixes: 0, acks: 0, err: 0, errMax: 0, states: 0, why: [] as any[], whyS: [] as any[], nl: null as null | { docked: boolean; at: number | null; near: boolean; act: number }, lastI: null as HelmIn | null, replay: false };
  const c2Want = () => S.on && isCtl(); // (docked too: the server undocks her, on the pilot's word)
  // (a command of the pilot's, given between steps: told with the next one)
  const helmCmd = (c: any[]) => { if (C2.on) C2.cmd.push(c); };
  // the shadow the page's own step is checked on: her helm state copied, flown by a helm of its own through the same geometry
  const SH: any = { P: new T.Vector3(), Q: new T.Quaternion(), V: new T.Vector3(), Wv: new T.Vector3(), stick: new T.Vector2(), tv: new T.Vector3(), tvP: new T.Vector3(), Dp: new T.Vector3(), Dq: new T.Quaternion(), berth: { x: 0, y: 0, z: 0, yaw: 0 } };
  const SHZ = zmem();
  const HM2 = helmOf(SH, { sites: () => siteList(), siteAt: (a) => siteAt(a), tgtR: (w) => tgtR(w as SpWp), fieldAt: (p) => fieldAt(p), zstep: (p, v, dt) => zstep(p, v, dt, SHZ), zturn: (q) => zturn(q), rocks: () => ROCKS, rockList: () => S.rockList, boom: () => !!(S.state && S.state.boom), done: () => !!(S.state && S.state.done), zC: () => S.zC, zoneDir: (k: number) => zoneDir(k), ready: (k: number) => !!(S.zinfo && zoneReady(zoneHulls.get(S.zinfo.ms.seed + ':' + k))), zreset: () => { SHZ.v.set(NaN, 0, 0); } }, () => {});
  const shadowOf = (src: any = S, zm = shipZ) => { for (const k of ['kind', 'map', 'def', 'fleet', 'boxes', 'ftl', 'state']) SH[k] = (S as any)[k]; SH.stage = src.stage; SH.wps = S.wps.map((w) => ({ ...w })); SH.floorAt = S.floorAt ? (x: number, z: number) => S.floorAt!(x, z) : null; helmCopy(SH, src, SHZ, zm); };
  // (where the last step left her: anything that's moved her since (a level's change, a rebase, a test) but the pilot's commands makes
  // this step's entry her state)
  const LAST: any = { P: new T.Vector3(), Q: new T.Quaternion(), V: new T.Vector3(), Wv: new T.Vector3(), stick: new T.Vector2(), tv: new T.Vector3(), tvP: new T.Vector3(), Dp: new T.Vector3(), Dq: new T.Quaternion(), berth: { x: 0, y: 0, z: 0, yaw: 0 } };
  const LASTZ = zmem(); let moved = false;
  const wpId = () => (S.wps[S.tgt] ? S.wps[S.tgt].id : null);
  function c2Pre(): boolean {
    if (c2Want()) {
      // (moved since the last step? the last step's end with the pilot's commands since done on it, the target and match as they are now)
      if (C2.on && !C2.nl) { shadowOf(LAST, LASTZ); SH.tgt = S.tgt; SH.match = S.match; for (const c of C2.cmd) { if (c[0] === 'jw') { SH.ftl = { st: 'wait', t: 2.6, to: c[1] | 0, T: 2.6 }; SH.warp = null; SH.spin = 0; SH.auto = null; } else if (c[0] === 'j') SH.ftl = { st: 'spool', t: 0, to: c[1] | 0, T: 2.6 }; else if (c[0] === 'w') HM2.warpGo(); else if (c[0] === 'l') HM2.land(); else if (c[0] === 'u') { HM2.dock(false); HM2.launchAway(); } else if (c[0] === 't') SH.spin = 0; } moved = !helmSame(SH, S); if (moved && C2.whyS.length < 8) C2.whyS.push({ s: SIM.steps, moved: helmDiff(SH, S) }); }
      shadowOf(); return true;
    }
    if (C2.on) { C2.on = false; C2.hist = []; C2.out = []; C2.cmd = []; Net.toHost({ t: 'sin', off: 1 }); }
    return false;
  }
  // (after the page's own step: tgtTrack, fly, zoneClose)
  function c2Post(pre: boolean, h: number) {
    if (!pre) return;
    const s = SIM.steps, I = C2.lastI, c = C2.cmd; C2.cmd = [];
    let free = false;
    if (I && !moved) { HM2.step(I, h); free = helmSame(SH, S); if (!free && C2.whyS.length < 8) C2.whyS.push({ s, step: helmDiff(SH, S) }); }
    moved = false; helmCopy(LAST, S, LASTZ, shipZ);
    const Z = S.zone ? SpaceSim.zoneCopy(ZS) : null, post = helmPack(S, shipZ), tg = wpId();
    C2.on = true;
    C2.hist.push({ s, I, tg, m: S.match, c, Z, post, free }); if (C2.hist.length > 360) C2.hist.splice(0, C2.hist.length - 360);
    const nl = C2.nl ? { nl: C2.nl } : {}; C2.nl = null; // (a new place begun before this step: the server puts her where it says too)
    const rd = S.kind === 'board' && S.zinfo ? S.traffic.map((q) => q.c.k as number).filter((k) => k != null && zoneReady(zoneHulls.get(S.zinfo!.ms.seed + ':' + k))) : [];
    const zt = S.kind === 'board' && S.zone ? { zt: S.zt0 + (S.t - S.ztAt), ...(rd.length ? { rd } : {}) } : {}; // (rd: the zone's ships drawn here as they'd be as the level: her helm may make one the level from further off, js/helm.ts close) // (the zone's clock she was flown on: the server's helm places the zone by it, js/svbattle.ts flyOn)
    if (free && I) C2.out.push({ s, ...nl, ...zt, i: [I.h ? 1 : 0, I.b, I.sx, I.sy], ...(I.rb ? { rb: I.rb.toArray() } : {}), tg, m: S.match, ...(c.length ? { c } : {}) });
    else { C2.states++; C2.out.push({ s, ...nl, st: post, turn: S.def.turn }); }
    if (C2.out.length >= 3) { Net.toHost({ t: 'sin', a: C2.out }); C2.out = []; }
  }
  // the server's word: her helm state after step s
  function c2Ack(s: number, o: any) {
    const i = C2.hist.findIndex((e) => e.s === s); if (i < 0) return;
    const e = C2.hist[i], d3 = (a: number[], b: number[]) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
    const err = d3(e.post.P, o.P), verr = d3(e.post.V, o.V), qerr = 1 - Math.abs(e.post.Q[0] * o.Q[0] + e.post.Q[1] * o.Q[1] + e.post.Q[2] * o.Q[2] + e.post.Q[3] * o.Q[3]);
    const modes = e.post.d !== o.d || !!e.post.au !== !!o.au || !!e.post.w !== !!o.w || !!e.post.bl !== !!o.bl || !!e.post.br !== !!o.br || e.post.tg !== o.tg;
    C2.acks++; C2.err = err; C2.errMax = Math.max(C2.errMax, err);
    const rest = C2.hist.slice(i + 1); C2.hist = rest;
    if (err < 1e-2 && verr < 1e-2 && qerr < 1e-7 && !modes) return; // (within a centimetre and a few hundredths of a degree: the zone's clock as each has it moves what she steers for a little)
    // (taken, and flown on again from the inputs since, each through its own frame (what it does beyond her flight not done again);
    // her own steps (not free) as she had them)
    C2.fixes++; if (C2.why.length < 12) C2.why.push({ s, err: +err.toFixed(3), verr: +verr.toFixed(3), page: { d: e.post.d, au: e.post.au && e.post.au.then, w: !!e.post.w, P: e.post.P.map((x: number) => +x.toFixed(2)), tg: e.post.tg }, server: { d: o.d, au: o.au && o.au.then, w: !!o.w, P: o.P.map((x: number) => +x.toFixed(2)), tg: o.tg } }); // (the first few put right, and why: for the step scripts)
    helmUnpack(S, o, shipZ, siteAt);
    C2.replay = true;
    try {
      for (const q of rest) {
        if (!q.free || !q.I) { helmUnpack(S, q.post, shipZ, siteAt); continue; }
        ZR = q.Z; const j = S.wps.findIndex((w) => w.id === q.tg); if (j >= 0) S.tgt = j; S.match = q.m;
        for (const c of q.c) helmDo(c);
        HM.step(q.I, STEP); q.post = helmPack(S, shipZ);
      }
    } finally { ZR = null; C2.replay = false; }
    helmCopy(LAST, S, LASTZ, shipZ); // (put right: where the last step left her, as far as the next one's check goes)
  }
  // a command as the server does it too (js/svbattle.ts flyOn)
  function helmDo(c: any[]) { if (c[0] === 'tp' || c[0] === 'ch') return; if (c[0] === 'jw') { S.ftl = { st: 'wait', t: 2.6, to: c[1] | 0, T: 2.6 }; S.warp = null; S.spin = 0; S.auto = null; } else if (c[0] === 'j') S.ftl = { st: 'spool', t: 0, to: c[1] | 0, T: 2.6 }; else if (c[0] === 'w') HM.warpGo(); else if (c[0] === 'l') HM.land(); else if (c[0] === 'u') { HM.dock(false); HM.launchAway(); } else if (c[0] === 't') S.spin = 0; }
  Net.onFast((buf, ch) => {
    if (ch !== 5 || !C2.on) return;
    try { const m = JSON.parse(new TextDecoder().decode(buf)); if (m.k === S.zact && Number.isFinite(m.s) && m.h) c2Ack(m.s, m.h); } catch (e) { console.error('space: her helm from the server', e); }
  });
  function sendPose(now?: boolean) {
    S.sendT -= 1; if (!now && S.sendT > 0) return; S.sendT = 4;
    const r3 = (v: number) => Math.round(v * 1000) / 1000;
    // (what she's matched speed with, when it changes: the server's notch lets it through, as hers does above)
    const mt = S.match && S.match !== 'radar' ? (S.match === 'ship' ? 'hull' : S.match) : '';
    if (mt !== matchSent) { matchSent = mt; Net.toHost({ t: 'smatch', id: mt }); }
    Net.toHost({ t: 'spose', a: [r3(S.P.x), r3(S.P.y), r3(S.P.z), r3(S.Q.x), r3(S.Q.y), r3(S.Q.z), r3(S.Q.w), r3(S.V.x), r3(S.V.y), r3(S.V.z), S.stage === 'atmo' ? 1 : 0, Math.round(S.hp), S.hpMax] });
  }
  function heardPose(a: number[]) {
    if (!S.on || isCtl()) return;
    if (S.on && S.t - SVB.spAt < 0.5) return; // (the server's flying her: its snapshots' pose is the one followed, svSss)
    S.net = { P: new T.Vector3(a[0], a[1], a[2]), Q: new T.Quaternion(a[3], a[4], a[5], a[6]), V: new T.Vector3(a[7], a[8], a[9]) };
    if (S.kind === 'assault' && !S.ftl) { const st = a[10] ? 'atmo' : 'orbit'; if (st !== S.stage) { through(st); S.P.copy(S.net.P); S.Q.copy(S.net.Q); } }
    if (Number.isFinite(a[11])) S.hp = a[11];
    if (S.P.distanceTo(S.net.P) > 400) { S.P.copy(S.net.P); S.Q.copy(S.net.Q); }
  }
  function follow(dt: number) {
    const n = S.net; if (!n || S.docked || S.ftl) return;
    n.P.addScaledVector(n.V, dt); S.V.copy(n.V);
    S.P.lerp(n.P, Math.min(1, dt * 8)); S.Q.slerp(n.Q, Math.min(1, dt * 8));
  }

  // ------------------------------------------------------------------ the frame
  // The simulation runs in fixed steps of STEP (1/60 s) whatever the frame rate: each frame adds the time that's really passed (raw,
  // up to 0.25 s: a long stall isn't caught up all at once) to what's owed (acc), and as many whole steps as that covers are run;
  // then the view, once. The same battle at any frame rate. (The rest of the game clamps a slow frame to 50 ms: js/game.ts loop)
  const STEP = 1 / 60;
  let SR: () => number = Math.random; // (the battle's random stream (js/radar.ts rngOf), from the level's seed: set in setup)
  // What's drawn between steps: the steps come at 60 Hz, the frames as fast as the screen; each frame draws her pose, the zone's,
  // its ships', the torpedoes' and the missiles' blended between the last two steps by how far into the next the frame is (one step
  // behind the simulation, smooth at any refresh rate). The true state's put back before the next step (the simulation reads some of
  // these transforms: the zone's ships' radar targets), unless something else (a message between frames) has written it since.
  // A jump of 300 m or more (a rebase onto another ship, docking) isn't blended: it's a cut
  type IpT = [THREE.Vector3, THREE.Quaternion];
  const IP = { prev: new Map<THREE.Object3D, IpT>(), cur: new Map<THREE.Object3D, IpT>(), drawn: new Map<THREE.Object3D, IpT>(), P0: new T.Vector3(), Q0: new T.Quaternion(), P1: new T.Vector3(), Q1: new T.Quaternion(), dP: new T.Vector3(), dQ: new T.Quaternion(), on: false, off: false }; // (off: no blending, for comparing)
  const ipObjs = () => { const a: THREE.Object3D[] = []; if (S.zone) a.push(S.zone); for (const q of S.traffic) if (q.obj) a.push(q.obj); for (const tp of TP.list) a.push(tp.o); for (const m of S.mis) if (m.o) a.push(m.o); return a; };
  function ipSnap(into: Map<THREE.Object3D, IpT>) { into.clear(); for (const o of ipObjs()) into.set(o, [o.position.clone(), o.quaternion.clone()]); }
  function ipRestore() {
    if (!IP.on) return; IP.on = false;
    for (const [o, [p, q]] of IP.cur) { const d = IP.drawn.get(o); if (d && o.position.equals(d[0]) && o.quaternion.equals(d[1])) { o.position.copy(p); o.quaternion.copy(q); } }
    if (S.P.equals(IP.dP) && S.Q.equals(IP.dQ)) { S.P.copy(IP.P1); S.Q.copy(IP.Q1); }
  }
  function ipApply(a: number) {
    IP.on = true; ipSnap(IP.cur); IP.P1.copy(S.P); IP.Q1.copy(S.Q); IP.drawn.clear();
    for (const [o, [p1, q1]] of IP.cur) {
      const pr = IP.prev.get(o);
      if (pr && pr[0].distanceTo(p1) < 300) { o.position.copy(pr[0]).lerp(p1, a); o.quaternion.copy(pr[1]).slerp(q1, a); }
      IP.drawn.set(o, [o.position.clone(), o.quaternion.clone()]);
    }
    if (IP.P0.distanceTo(IP.P1) < 300) { S.P.lerpVectors(IP.P0, IP.P1, a); S.Q.copy(IP.Q0).slerp(IP.Q1, a); }
    IP.dP.copy(S.P); IP.dQ.copy(S.Q);
  }
  const SIM = { acc: 0, steps: 0, hook: null as null | { n: number; f: () => void }, hold: false }; // (hold: a test's: no steps while it's set, the frame still drawn) // (acc: the real time owed, not yet stepped; hook: a test's, called after step n)
  function update(dt: number, raw = dt) {
    ipRestore(); // (the true state back, before anything steps or reads it)
    if (!S.on || !S.model || Game.map !== S.map) return;
    if (S.plan) S.plan.line.visible = S.plan.gates.visible = S.plan.end.visible = false; // (her plan's drawn again below while she's lined up: planDraw)
    const m = me(), h = STEP;
    SIM.acc = SIM.hold ? 0 : Math.min(SIM.acc + Math.min(0.25, Math.max(dt, raw)), 0.25 + STEP);
    let pt = Prof.t(), n = 0;
    while (SIM.acc >= STEP) {
      SIM.acc -= STEP; n++; SIM.steps++;
      ipSnap(IP.prev); IP.P0.copy(S.P); IP.Q0.copy(S.Q); // (the state before this step: the last one's is what the frame blends from)
      S.t += h;
      zoneStep(); pt = Prof.lap('space: zone', pt);
      const flies = isCtl() || (!S.ctl && Object.keys(Game.roster || {}).length < 2), pre = flies ? c2Pre() : (c2Pre(), false); // (not flying her: its steps stopped, js/space.ts c2Pre)
      if (!flies) tgtTrack(h); pt = Prof.lap('space: target', pt);
      if (flies) { fly(h); c2Post(pre, h); } else { if (S.auto) S.auto = null; follow(h); S.stick.multiplyScalar(Math.exp(-h * 2.2)); }
      pt = Prof.lap('space: flight', pt);
      ftlStep(h, flies); if (!flies) thruStep(h); // (the pilot's: her helm's, js/helm.ts step)
      doors(h);
      turrets(h); shots(h); pt = Prof.lap('space: doors, turrets, jump', pt);
      ewStep(h); pt = Prof.lap('space: radar & fire control', pt);
      if (S.hull) { guns(h); missiles(h); } torps(h); rounds(h); pt = Prof.lap('space: guns, missiles, torpedoes, rounds', pt);
      if (S.boomT >= 0) boomStep(h);
      if (SIM.hook && SIM.steps === SIM.hook.n) { const f = SIM.hook.f; SIM.hook = null; f(); } // (a test's snapshot at that step)
      if (!S.on || !S.model || Game.map !== S.map) return; // (gone from space within the step: a jump, the level left)
    }
    dt = n * h; // (the view's easing by the simulation's time this frame: none, a frame faster than the steps)
    if ((isCtl() || (!S.ctl && Object.keys(Game.roster || {}).length < 2)) && !S.docked) sendPose();
    ewMarks(); ewNear(); pt = Prof.lap('space: radar marks', pt);
    if (!IP.off) ipApply(SIM.acc / STEP); // (from here on, the frame's drawn: between the last two steps)
    if (!S.docked || S.auto) hideStrays();
    // the view is your own, from the seat you're in (the helm's through her glass; a turret's from its gun)
    const seat = mySeat(), cam = G_R.camera;
    if (seat && seat.k === 'turret') turretView(seat);
    helmZoom(dt);
    if (S.shake > 0.01) { cam.position.x += (Math.random() - 0.5) * S.shake * 0.25; cam.position.y += (Math.random() - 0.5) * S.shake * 0.25; S.shake *= Math.exp(-dt * 4); }
    cam.updateMatrixWorld();
    pt = Prof.lap('space: view', pt);
    outside(); pt = Prof.lap('space: outside (sky, star, rocks)', pt);
    { const pc = cam as THREE.PerspectiveCamera, hgt = G_R.renderer.domElement.height || 720; InteriorCull.update(cam, hgt / 2 / Math.tan((pc.fov || 70) * Math.PI / 360)); pt = Prof.lap('space: interiors seen', pt); }
    sensorStep(); optView(); // (after the view's placed: where the operator's looking is where the camera is now)
    ewCam(); svDbgAsk();
    { const seat = mySeat(); const H = EW.holo, k = H.fT < 0 ? 1 : Math.min(1, (S.t - H.fT) / 0.6), e = 1 - (1 - k) * (1 - k) * (1 - k); if (H.focus) G_R.focusAmt = e;
      if (!H.focus && H.fO >= 0) { const o = (S.t - H.fO) / 0.3; if (o >= 1 || !seat) { G_R.focusBlur = false; H.fO = -1; } else G_R.focusAmt = 1 - o; } // (out: the blur fading away) // (going in: the world blurring out and the hologram opening, over 0.6 s)
      const lift = H.focus ? 0.2 * e : 0; // (focused: up from below the eyes to just under the middle of the view)
      RadarView.holo(S.model ? S.model.group : null, sv(EW.own), H.c.clone().add(new T.Vector3(0, lift, 0)), H.R, H.rot, EW.rt, !!seat && seat.k === 'sensors', H.pick, H.focus, H.focus ? e : 1, HOLO_ZOOM[H.zi], rwrNow(), secView()); }
    pt = Prof.lap('space: sensors, hologram', pt);
    RadarView.update(S.root, Radar.show, Radar.show ? ewList().map((q) => sv(q)) : [], [EW.ownT, EW.foeT].filter((q): q is RTarget => !!q), 'own', EW.rt, G_R.camera, Radar.sel);
    // her engines, the status strip, the mission's things
    const th = S.docked ? 0 : U.clamp(S.V.length() / S.def.speed, 0.12, 1) * (S.cruise ? 1.3 : 0.75);
    S.model.thrust.opacity += (th - S.model.thrust.opacity) * Math.min(1, dt * 4);
    S.model.glow.color.setHex(S.docked ? 0x2a8a5a : S.ftl ? 0x4060ff : 0xa07020);
    for (const a of S.anchors) { a.obj.rotation.z += dt * 0.15; (a.obj.userData.film.material as THREE.MeshBasicMaterial).opacity = 0.1 + 0.05 * Math.sin(S.t * 2); }
    pt = Prof.lap('space: radar view', pt);
    for (const q of S.things) {
      if (q.k === 'art') { const a = q.obj.userData.art as THREE.Mesh; a.rotation.y += dt * 1.5; a.position.y = 1.15 + Math.sin(S.t * 2) * 0.05; }
      if (q.k === 'lock') (q.obj as THREE.Mesh).material = lockMat(q.obj.userData.lock === '' || !!(S.state && S.state.keys.includes(q.obj.userData.lock)));
    }
    if (m.seat != null && (m.dead || m.down)) stand();
    pt = Prof.lap('space: the rest', pt);
    SpaceUI.update(dt); Prof.lap('space: UI', pt);
  }
  const _lm: Record<string, THREE.Material> = {};
  const lockMat = (open: boolean) => _lm[open ? 'o' : 'c'] || (_lm[open ? 'o' : 'c'] = ShipModel.lit(open ? 0x30ff60 : 0xff3020));

  // ------------------------------------------------------------------ the hardpoints, and a hull's guns
  // A turret seat looks out from its gun on the roof; the mouse lays it, the trigger fires it. Its rounds are light: what
  // they do is told (sfire, for everyone to see; shit, a hull gun's damage).
  function turretView(seat: SpSeat) {
    const tu = S.model!.turrets[seat.n || 0], m = me(), cam = G_R.camera; if (!tu) return;
    const sy = seatPos(m.seat as number).yaw, yaw = m.yaw - S.berth.yaw, pitch = U.clamp(m.pitch, -0.25, 1.3);
    void sy;
    tu.base.rotation.y = yaw; tu.gun.rotation.x = pitch;
    const p = new T.Vector3(0, 0.75, 0.9).applyEuler(new T.Euler(pitch, yaw, 0, 'YXZ')).add(tu.base.position).applyQuaternion(S.Dq).add(S.Dp);
    cam.position.copy(p); cam.quaternion.copy(S.Dq).multiply(new T.Quaternion().setFromEuler(new T.Euler(pitch, yaw, 0, 'YXZ')));
  }
  function turrets(dt: number) {
    const seat = mySeat(); S.fireT -= dt;
    for (let i = S.tracers.length - 1; i >= 0; i--) { const tr = S.tracers[i]; tr.t -= dt; (tr.m.material as THREE.MeshBasicMaterial).opacity = Math.max(0, tr.t / 0.12); if (tr.t <= 0) { tr.m.parent && tr.m.parent.remove(tr.m); S.tracers.splice(i, 1); } }
    if (!seat || seat.k !== 'turret' || S.docked) return;
    const e = SD.EQUIP[(S.fleet.fit[S.def.id] || [])[seat.n || 0] || ''], tu = S.model!.turrets[seat.n || 0];
    if (!e || !tu || !me().mouse.l || S.fireT > 0 || Game.menuOpen()) return;
    S.fireT = e.rof || 0.2;
    // from the muzzle along the gun, in the level's own coordinates (where a hull's guns are)
    const mw = tu.muzzle.getWorldPosition(new T.Vector3()), dw = new T.Vector3(0, 0, -1).applyQuaternion(tu.gun.getWorldQuaternion(new T.Quaternion()));
    const inv = _r.clone().invert(), o = mw.clone().sub(_p).applyQuaternion(inv), d = dw.clone().applyQuaternion(inv);
    // a round from the muzzle at the gun's own speed and her own way (a railgun's slug at 5 km/s, an autocannon's at 1.1): drawn here
    // (shots()), flown and hit with on the server
    const heavy = e.id === 'rail', v = d.clone().multiplyScalar(heavy ? SHOT.rail : SHOT.pd).add(S.V), range = e.range || 1500;
    shot(o, v, range, heavy);
    Net.toHost({ t: 'sfire', a: [o.x, o.y, o.z, v.x, v.y, v.z, range, heavy ? 1 : 0, e.dmg || 5] }); // (the server flies it and says what it hits: js/spacesim.ts shotsStep; the others draw it too)
    Audio.click();
  }
  // The squad's own rounds in flight (her turrets': turrets above), as they're drawn: each moves, a rock stops it, at its range it's
  // spent (what it hits is the server's: js/spacesim.ts shotsStep). A streak a fiftieth of a second long behind it.
  const SHOT = SpaceSim.SHOT;
  const myShots: { p: THREE.Vector3; v: THREE.Vector3; d: number; life: number; heavy: boolean }[] = [];
  let shotLines: THREE.LineSegments | null = null;
  function shot(p: THREE.Vector3, v: THREE.Vector3, life: number, heavy: boolean) { if (myShots.length < SHOT.MAX) myShots.push({ p: p.clone(), v: v.clone(), d: 0, life, heavy }); }
  function shots(dt: number) {
    for (let i = myShots.length - 1; i >= 0; i--) {
      const q = myShots[i], a = q.p.clone(); zstep(q.p, q.v, dt, (q as any).zm || ((q as any).zm = zmem())); q.d += a.distanceTo(q.p);
      let gone = q.d >= q.life;
      if (!gone && ROCKS.near.length && rockOn(a, q.p) < 1) { gone = true; rockFlash(q.p); } // (into a rock)
      if (gone) myShots.splice(i, 1);
    }
    // the streaks: one line each, from where it was a fiftieth of a second ago to where it is
    if (!S.root) return;
    if (!shotLines) {
      const g = new T.BufferGeometry(); g.setAttribute('position', new T.BufferAttribute(new Float32Array(SHOT.MAX * 6), 3)); g.setAttribute('color', new T.BufferAttribute(new Float32Array(SHOT.MAX * 6), 3));
      shotLines = new T.LineSegments(g, new T.LineBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, blending: T.AdditiveBlending })); shotLines.frustumCulled = false;
    }
    if (shotLines.parent !== S.root) S.root.add(shotLines);
    const P = shotLines.geometry.attributes.position as THREE.BufferAttribute, C = shotLines.geometry.attributes.color as THREE.BufferAttribute;
    myShots.forEach((q, i) => { const t = q.p.clone().addScaledVector(q.v, -0.02); P.setXYZ(i * 2, t.x, t.y, t.z); P.setXYZ(i * 2 + 1, q.p.x, q.p.y, q.p.z); const c = q.heavy ? [0.62, 0.85, 1] : [1, 0.82, 0.44]; C.setXYZ(i * 2, c[0] * 0.2, c[1] * 0.2, c[2] * 0.2); C.setXYZ(i * 2 + 1, c[0], c[1], c[2]); });
    P.needsUpdate = true; C.needsUpdate = true; shotLines.geometry.setDrawRange(0, myShots.length * 2);
  }
  function gunHit(i: number, hp: number) {
    const gn = S.hull && S.hull.guns[i]; if (!gn) return;
    const was = gn.hp; gn.hp = Math.max(0, hp);
    if (was > 0 && gn.hp <= 0) { gn.gun.rotation.x = -0.5; gn.gun.visible = false; HUD.feed(`<b>${gn.k === 'pd' ? 'Point defence gun' : gn.k === 'mg' ? 'Minigun' : 'Missile launcher'} destroyed</b>`); }
  }
  // Her weapons, by kind (js/spacedata.ts HULLGUN). Point defence: single shots out to 4 km, blind close in under its own deck.
  // Miniguns: six-barrelled rotary guns firing bursts inside 4 km (both guns' rounds self-destruct at 5 km). Missiles: launched at 6.5 km, they home (missiles()); a turret
  // can shoot one down. They fire only on a track (her tracking radar's, js/radar.ts: without one she doesn't know where to shoot),
  // while there's anyone at her gun control (js/spaceserver.ts gunnersLeft) and she isn't counting down to her self-destruct.
  // Every round is a real one: fired along the aim on the server, it flies, and hits only if it really meets her; each page flies the
  // same rounds from the gun's seed to draw them (rounds(), svSev).
  function guns(dt: number) {
    if (!S.hull || S.docked || S.ftl || (S.state && S.state.boom)) return;
    // (laid and fired by the server's battle (svSss, svSev): only their drawings here)
    for (const gn of S.hull.guns) { // (their drawings: laid as they're aimed, the barrels turning as they're spun)
      const g = gn as any, sp = gn.gun.userData.spin as THREE.Object3D | undefined;
      if (g.yaw != null && gn.k !== 'missile') { gn.obj.rotation.y = g.yaw; gn.gun.rotation.x = g.pitch; }
      if (sp) sp.rotation.z += dt * 30 * Math.min(1, g.rev || 0);
    }
  }
  // a round off one of her guns (in the level's frame): along the aim, spread by the gun and by the track's own error
  // the rounds in flight are drawn as glowing points, all of them one Points (rPts: under S.root, made again with it)
  const RMAX = 4096; let rPts: THREE.Points | null = null;
  function roundPts() {
    if (rPts && rPts.parent === S.root) return rPts;
    if (!rPts) {
      const cv = document.createElement('canvas'); cv.width = cv.height = 32; const x = cv.getContext('2d')!, gr = x.createRadialGradient(16, 16, 0, 16, 16, 16);
      gr.addColorStop(0, 'rgba(255,255,240,1)'); gr.addColorStop(0.2, 'rgba(255,220,150,0.9)'); gr.addColorStop(0.5, 'rgba(255,160,60,0.3)'); gr.addColorStop(1, 'rgba(255,120,40,0)'); x.fillStyle = gr; x.fillRect(0, 0, 32, 32);
      const g = new T.BufferGeometry(); g.setAttribute('position', new T.BufferAttribute(new Float32Array(RMAX * 3), 3)); g.setDrawRange(0, 0);
      rPts = new T.Points(g, new T.PointsMaterial({ map: new T.CanvasTexture(cv), size: 6, sizeAttenuation: false, transparent: true, depthWrite: false, blending: T.AdditiveBlending })); // (6 px however near: a point of light, not a ball)
      rPts.frustumCulled = false;
    }
    rPts.removeFromParent(); if (S.root) S.root.add(rPts); return rPts;
  }
  // the rounds in flight, drawn: each moves; one that's flown its life blows itself apart
  const FLASH = new T.SphereGeometry(1, 8, 6);
  // her as the battle sees her (js/spacesim.ts SimShip)
  const simShip = (): SimShip => ({ P: S.P, Q: S.Q, V: S.V, size: EW.own ? EW.own.size : 5 / 0.6, docked: S.docked, ftl: !!S.ftl });
  function rounds(dt: number) {
    if (!S.rounds.length) { if (rPts) rPts.geometry.setDrawRange(0, 0); return; }
    // (the simulation's step (js/spacesim.ts roundsStep), to draw them: what they hit is the server's)
    const r = SpaceSim.roundsStep(S.zone ? ZS : null, S.rounds, simShip(), ROCKS, S.rockList, dt, null);
    for (const p of r.rock) rockFlash(p);
    if (S.root) for (const p of r.burst) { const f = new T.Mesh(FLASH, new T.MeshBasicMaterial({ color: 0xffb060, transparent: true, opacity: 1, depthWrite: false, blending: T.AdditiveBlending })); f.position.copy(p); f.scale.setScalar(2.5); f.frustumCulled = false; S.root.add(f); S.tracers.push({ m: f, t: 0.12 }); }
    if (S.root) { const pts = roundPts(), pa = pts.geometry.attributes.position as THREE.BufferAttribute; S.rounds.forEach((q, i) => pa.setXYZ(i, q.p.x, q.p.y, q.p.z)); pa.needsUpdate = true; pts.geometry.setDrawRange(0, S.rounds.length); }
  }
  // a missile: a[0] its number, where it left her; a[4] 1: it's been shot down
  function missile(a: number[], quiet = false) {
    const was = S.mis.find((q) => q.id === a[0]);
    if (a[4]) { if (was) { if (was.o) was.o.removeFromParent(); S.mis.splice(S.mis.indexOf(was), 1); HUD.feed('<b>Missile shot down</b>'); } return; }
    if (was) return;
    const m = { id: a[0], o: null as THREE.Group | null, p: new T.Vector3(a[1], a[2], a[3]), v: new T.Vector3(0, 1, 0), t: 0 }; S.mis.push(m);
    if (!quiet) { HUD.toast('MISSILE', 'Turn across it, or have a turret shoot it down', 2.2); Audio.deny(); }
    if (!S.root) return; // (its drawing, where there's a scene to put it in)
    const o = new T.Group(), body = new T.Mesh(new T.ConeGeometry(0.5, 3.4, 8), ShipModel.M(0xd8dde2, { emissive: 0x30343a })); body.rotation.x = -Math.PI / 2; o.add(body);
    const fl = new T.Mesh(new T.ConeGeometry(0.7, 9, 8, 1, true), new T.MeshBasicMaterial({ color: 0xffb060, transparent: true, opacity: 0.7, depthWrite: false, blending: T.AdditiveBlending, side: T.DoubleSide })); fl.rotation.x = Math.PI / 2; fl.position.z = 6; o.add(fl);
    o.position.copy(m.p); o.frustumCulled = false; S.root.add(o); m.o = o;
  }
  // (the server's missiles: flown on between its snapshots, to draw them)
  function missiles(dt: number) {
    const sp = SD.HULLGUN.missile.speed;
    for (const m of S.mis) { m.p.addScaledVector(m.v, sp * (m.t < 1.2 ? 0.45 : 1) * dt); m.t += dt; if (m.o) { m.o.position.copy(m.p); m.o.lookAt(m.p.clone().add(m.v)); } }
  }
  // ------------------------------------------------------------------ the torpedo tube
  // One tube under her keel (tubeKit), TORP.loads a sortie. The pilot looks at a 3D fix of her sensors' (right mouse held: the head
  // turned; the fix nearest the middle of the view is the one looked at, torpSee), a left click picks it, B fires at it (or at the
  // one looked at, none picked). It's a cold launch: pushed out of the tube downward at TORP.eject and coasting clear; then its
  // RCS thrusters (puffs) move it off to the side away from her and turn its nose onto the target; then its main motor lights.
  // It flies on her sensors' picture of the target (the fix it was sent at, as her radars hold it now, js/radar.ts fus: a
  // datalink), dead reckoning when she loses it, till it's within TORP.seek; then on its own radar (seekStep): the strongest
  // return near where it expects the target, which may be chaff. Guidance is proportional navigation, the motor held to
  // TORP.vc of closing speed (it keeps some for turning). It's a radar target like anything out here (no transponder), so a ship's
  // own threat assessment and fire control deal with it as they would anything coming at her: a round that meets it kills it. All of
  // that's the server's (js/spacesim.ts torpStep): the pilot's page says it's launched (storp), and every page draws it from the
  // snapshots.
  const TORP = SpaceSim.TORP; // (its figures: the simulation's)
  type Torp = { zm?: ZMem; id: number; o: THREE.Group; fl: THREE.Mesh; puffs: THREE.Mesh[]; p: THREE.Vector3; v: THREE.Vector3; q: THREE.Quaternion; ph: number; t: number; fus: string; est: THREE.Vector3; ev: THREE.Vector3; side: THREE.Vector3; mine: boolean; sent: number; lock: string; rt: RTarget; thr: number; rcs: boolean; lf: THREE.Vector3 }; // (thr: its motor's push (0..1); rcs: its thrusters firing)
  const TP = { list: [] as Torp[], n: 1, base: 1 + Math.floor(Math.random() * 1e6), left: TORP.loads, look: '', pick: '', l: false, cool: 0, tube: null as null | { at: THREE.Vector3; m: THREE.Object3D } };
  function tubeKit(g: THREE.Object3D, box: THREE.Box3, size: number) {
    if (TP.tube && TP.tube.m.parent === g) return;
    const at = new T.Vector3(0, box.min.y - 0.35, -size * 0.25), o = new T.Group(); o.position.copy(at); g.add(o);
    const D = ShipModel.M(0x2a2e33, { metalness: 0.6 }), M = ShipModel.M(0x6a7078, { metalness: 0.5 });
    const tube = new T.Mesh(new T.CylinderGeometry(0.62, 0.62, 7, 12), M); tube.rotation.x = Math.PI / 2; o.add(tube);
    const mouth = new T.Mesh(new T.CylinderGeometry(0.5, 0.5, 0.2, 12), D); mouth.position.y = -0.55; o.add(mouth); // (its door, under it)
    for (const z of [-2.6, 0, 2.6]) { const band = new T.Mesh(new T.BoxGeometry(1.5, 0.5, 0.3), D); band.position.set(0, 0.3, z); o.add(band); }
    TP.tube = { at, m: o };
  }
  function torpMesh() {
    const o = new T.Group(), M = ShipModel.M(0x5a6068, { metalness: 0.5 }), D = ShipModel.M(0x23272c, { metalness: 0.6 });
    const body = new T.Mesh(new T.CylinderGeometry(0.42, 0.42, 5.2, 10), M); body.rotation.x = Math.PI / 2; o.add(body);
    const nose = new T.Mesh(new T.ConeGeometry(0.42, 1.2, 10), D); nose.rotation.x = -Math.PI / 2; nose.position.z = -3.2; o.add(nose);
    for (let i = 0; i < 4; i++) { const f = new T.Mesh(new T.BoxGeometry(0.06, 0.9, 0.9), D); f.position.set(Math.cos(i * Math.PI / 2) * 0.55, Math.sin(i * Math.PI / 2) * 0.55, 2.3); f.rotation.z = i * Math.PI / 2; o.add(f); }
    const fl = new T.Mesh(new T.ConeGeometry(0.5, 7, 10, 1, true), new T.MeshBasicMaterial({ color: 0x9fd0ff, transparent: true, opacity: 0.8, depthWrite: false, blending: T.AdditiveBlending, side: T.DoubleSide })); fl.rotation.x = -Math.PI / 2; fl.position.z = 6.1; fl.visible = false; o.add(fl);
    const puffs: THREE.Mesh[] = []; for (const [x, y, z] of [[0.5, 0, -2], [-0.5, 0, -2], [0.5, 0, 2], [-0.5, 0, 2], [0, 0.5, -2], [0, -0.5, 2]]) { const pf = new T.Mesh(FLASH, new T.MeshBasicMaterial({ color: 0xeaf4ff, transparent: true, opacity: 0.8, depthWrite: false, blending: T.AdditiveBlending })); pf.position.set(x * 1.3, y * 1.3, z); pf.scale.setScalar(0.25); pf.visible = false; o.add(pf); puffs.push(pf); }
    o.frustumCulled = false; return { o, fl, puffs };
  }
  function torpNew(id: number, p: THREE.Vector3, v: THREE.Vector3, q: THREE.Quaternion, mine: boolean, fus: string, est: THREE.Vector3, ev: THREE.Vector3): Torp {
    const k = torpMesh(); if (S.root) S.root.add(k.o); k.o.position.copy(p); k.o.quaternion.copy(q);
    const tp: Torp = { id, ...k, p: p.clone(), v: v.clone(), q: q.clone(), ph: 0, t: 0, fus, est: est.clone(), ev: ev.clone(), side: new T.Vector3(), mine, sent: -1, lock: '', thr: 0, rcs: false, lf: new T.Vector3(), rt: { sz: 3, kind: 'torpedo', id: 'torp' + id, p: p.clone(), v: v.clone(), q: q.clone(), rcs: { s: new Float32Array(1), max: 0, mean: 0 }, iso: 1.5, iff: { c: 'squad', n: 'TORP ' + (id % 1000) }, aff: 'squad', only: 'squad' } }; // (its own ship's interrogator gets an answer, its datalink's; anyone else's, nothing)
    TP.list.push(tp); return tp;
  }
  // the 3D fixes the pilot can see (her sensors' fused tracks), and the one looked at: nearest the middle of the view, within 7 degrees
  // The pilot's zoom: right mouse held (looking about), the wheel zooms the view in, up to 100 times (each notch a quarter more or
  // less); let go of the right button, it's back to 1
  const ZM = { k: 1, z: 1, on: false, y: 0, p: 0, wheel: false }; // (k: the zoom scrolled to; z: the zoom shown, easing onto it)
  function helmZoom(dt: number) {
    const seat = mySeat(), m = me(), on = !!seat && seat.k === 'helm' && !!m.mouse.r && !Game.menuOpen();
    if (!ZM.wheel) { ZM.wheel = true; window.addEventListener('wheel', (e) => {
      const st = mySeat(); if (!st || st.k !== 'helm' || !me().mouse.r || Game.menuOpen() || Math.abs(e.deltaY) < 5) return;
      e.stopImmediatePropagation(); // (not the weapons' wheel: js/player.ts)
      const k = U.clamp(ZM.k * (e.deltaY < 0 ? 1.25 : 0.8), 1, 100); if (k === ZM.k) return; ZM.k = k < 1.05 ? 1 : k;
      HUD.toast('ZOOM', ZM.k >= 10 ? Math.round(ZM.k) + '×' : ZM.k.toFixed(1) + '×', 0.6);
    }, { capture: true }); }
    if (!on) { ZM.k = 1; ZM.on = false; }
    ZM.z = Math.exp(Math.log(ZM.z) + (Math.log(ZM.k) - Math.log(ZM.z)) * (1 - Math.exp(-dt * 12))); if (Math.abs(ZM.z / ZM.k - 1) < 0.002) ZM.z = ZM.k; // (eased, by ratios: 1x to 2x as quick as 50x to 100x; about 0.25 s)
    if (ZM.z > 1.001) { if (on) Me.updateCamera(1 / 60); /* (the view again from the head as slowed this frame: not a frame late, which at 100x is a shake) */ const cam = G_R.camera as THREE.PerspectiveCamera, f0 = Game.settings.fov * Math.PI / 180; cam.fov = 2 * Math.atan(Math.tan(f0 / 2) / ZM.z) * 180 / Math.PI; cam.updateProjectionMatrix(); }
  }
  function torpSee() {
    TP.look = ''; const seat = mySeat(); if (!seat || seat.k !== 'helm' || !EW.own || !S.model) return;
    const cam = G_R.camera, cp = cam.getWorldPosition(new T.Vector3()), cf = new T.Vector3(0, 0, -1).applyQuaternion(cam.getWorldQuaternion(new T.Quaternion()));
    const q = S.Q.clone().invert().premultiply(S.Dq); let best = Math.cos(7 * Math.PI / 180);
    for (const f of shownOwn()!.fus) { const v = f.pl.clone().sub(S.P).applyQuaternion(q).add(S.Dp).sub(cp).normalize(), c = v.dot(cf); if (c > best) { best = c; TP.look = f.n; } }
  }
  function torpKeys() {
    const seat = mySeat(), m = me(); if (!seat || seat.k !== 'helm' || Game.menuOpen()) { TP.l = false; return; }
    if (m.mouse.l && !TP.l) { if (TP.look && TP.look !== TP.pick) { TP.pick = TP.look; Audio.click(); } else if (TP.pick) { TP.pick = ''; Audio.click(); } }
    TP.l = m.mouse.l;
  }
  function torpFire() {
    const seat = mySeat(); if (!seat || seat.k !== 'helm' || !isCtl() || !EW.own || !TP.tube) return;
    const n = TP.pick || TP.look, f = shownOwn()!.fus.find((q) => q.n === n);
    if (S.docked || S.ftl || S.warp) { HUD.toast('TORPEDO', 'Not while she\'s ' + (S.docked ? 'docked' : 'jumping'), 1.4); Audio.deny(); return; }
    if (!f) { HUD.toast('TORPEDO', 'No target: look at a 3D fix (hold right mouse), click to pick it', 2); Audio.deny(); return; }
    if (TP.left <= 0) { HUD.toast('TORPEDO', 'Tube empty', 1.4); Audio.deny(); return; }
    if (TP.cool > 0) return;
    if (TP.left !== Infinity) TP.left--; TP.cool = 2.5;
    const p = TP.tube.at.clone().applyQuaternion(S.Q).add(S.P), v = S.V.clone().addScaledVector(new T.Vector3(0, -1, 0).applyQuaternion(S.Q), TORP.eject);
    const tp = torpNew(TP.base * 1000 + TP.n++, p, v, S.Q, true, f.n, f.pl, f.v), fx = [...f.pl.toArray(), ...f.v.toArray()].map((x) => Math.round(x * 100) / 100);
    // (the server flies it from the start, on its own fix nearest this one; while it flies her, launched by it from the tube where it has
    // her at the step it's told with, js/svbattle.ts flyOn)
    if (C2.on) helmCmd(['tp', tp.id, ...fx]); else torpSend(tp, fx);
    HUD.toast('TORPEDO', `Away on ${f.n}${TP.left === Infinity ? '' : ' · ' + TP.left + ' left'}`, 1.6); Audio.click();
  }
  // (launched: told the server, with the fix it's sent at, f; the server flies it from there)
  function torpSend(tp: Torp, f: number[]) {
    tp.sent = S.t; const r = (x: number) => Math.round(x * 100) / 100;
    Net.toHost({ f, t: 'storp', a: [tp.id, ...tp.p.toArray().map(r), ...tp.v.toArray().map(r), ...tp.q.toArray().map((x) => Math.round(x * 1e4) / 1e4), tp.ph | (tp.thr > 0.05 ? 4 : 0) | (tp.rcs ? 8 : 0), 0] }); // (its phase, and whether its motor and its thrusters are firing)
  }
  // gone: 1 shot down, 2 hit something (blown), 3 run out
  function torpGone(tp: Torp, how: number) {
    const i = TP.list.indexOf(tp); if (i < 0) return; TP.list.splice(i, 1); tp.o.removeFromParent();
    if (S.root && how !== 3) { const f = new T.Mesh(FLASH, new T.MeshBasicMaterial({ color: how === 2 ? 0xffd090 : 0xffb060, transparent: true, opacity: 1, depthWrite: false, blending: T.AdditiveBlending })); f.position.copy(tp.p); f.scale.setScalar(how === 2 ? 22 : 6); f.frustumCulled = false; S.root.add(f); S.tracers.push({ m: f, t: how === 2 ? 0.5 : 0.2 }); }
    if (how === 1) HUD.feed('<b>Torpedo shot down</b>');
    Audio.boom(Math.max(0, S.P.distanceTo(tp.p) / 60));
  }
  // its own radar: the strongest return near where it expects the target (by its range gate and its cone), chaff and all
  // ------------------------------------------------------------------ the zone's asteroids, near her
  // Each frame: every rock's place in the level's frame (the zone's, moved and turned as it is), and those within ROCK_NEAR of her
  // made radar targets (a return as big as its face: ROCK_SIG of its cross-section, the same every way) and the radars' cover
  // (Radar.occ: a sphere a little inside its lumps); their velocity the zone's going by. Rounds, shots, torpedoes, missiles and
  // she herself are stopped by the near ones (rockOn, collide).
  const ROCKS = Object.assign(SpaceSim.rocks(), { obj: null as THREE.Object3D | null }); // (the simulation's (js/spacesim.ts), and the field's drawing)
  // (the zone's rocks as radar targets and cover, the field's velocity: js/spacesim.ts rocksStep)
  const rocksStep = (dt: number) => SpaceSim.rocksStep(ROCKS, S.rockList, S.zone ? S.zone.position : null, S.zone ? S.zone.quaternion : null, S.P, dt, S.t);
  const rockOn = (a: THREE.Vector3, b: THREE.Vector3) => SpaceSim.rockOn(ROCKS, S.rockList, a, b); // (how far along from a to b the first near rock is met)
  function rockFlash(p: THREE.Vector3) { if (!S.root) return; const f = new T.Mesh(FLASH, new T.MeshBasicMaterial({ color: 0xc8b090, transparent: true, opacity: 1, depthWrite: false, blending: T.AdditiveBlending })); f.position.copy(p); f.scale.setScalar(2); f.frustumCulled = false; S.root.add(f); S.tracers.push({ m: f, t: 0.1 }); }
  function torps(dt: number) {
    TP.cool = Math.max(0, TP.cool - dt); torpSee(); torpKeys();
    for (const tp of TP.list.slice()) {
      if (S.root && tp.o.parent !== S.root) S.root.add(tp.o);
      zstep(tp.p, tp.v, dt, tp.zm || (tp.zm = zmem())); tp.t += dt; // (the server's: carried on between its snapshots)
      tp.o.position.copy(tp.p); tp.o.quaternion.copy(tp.q);
      tp.fl.visible = tp.thr > 0.05; if (tp.fl.visible) tp.fl.scale.set(1, (0.4 + 0.6 * tp.thr) * (0.8 + Math.random() * 0.4), 1);
      tp.puffs.forEach((pf) => { pf.visible = tp.rcs && Math.random() < 0.5; });
    }
  }
  function boomStep(dt: number) {
    S.boomT += dt;
    if (S.hull) { const k = 1 + S.boomT * 0.6; S.hull.group.scale.setScalar(k); }
    if (S.boomT > 0.5) { G_R.levelRoot.visible = false; S.boxes = []; }
  }

  // ------------------------------------------------------------------ F, and the ship's own keys
  const hint = (k: string, what: string) => `<b>${k}</b> ${what}`;
  function holdFor(key: string, held: boolean, dt: number, need: number, done: () => void) {
    if (!held) { if (S.holdK === key) { S.hold = 0; S.holdK = ''; } return -1; }
    if (S.holdK !== key) { S.holdK = key; S.hold = 0; }
    S.hold += dt;
    if (S.hold >= need) { S.hold = -1e9; done(); return -1; }
    return Math.max(0, S.hold / need);
  }
  function interact(m: typeof Me, dt: number, held: boolean, F: boolean): { prompt: string; prog: number; label: string } | null {
    if (!S.on) return null;
    const out = { prompt: '', prog: -1, label: '' };
    if (m.seat != null || !aboard()) seatLit(-1);
    if (!held && !K('KeyG') && !K('KeyL') && !K('KeyJ')) { S.hold = 0; S.holdK = ''; }
    const seat = mySeat();
    if (seat) {
      const lines: string[] = [];
      if (seat.k === 'helm') {
        const ctl = isCtl();
        if (!ctl) lines.push('Taking the helm...');
        else if (S.ftl) lines.push(S.ftl.st === 'tunnel' ? 'In transit' : 'Jump drive spooling');
        else if (S.auto) lines.push('Hold on');
        else if (S.warp) lines.push('At warp: ' + U.esc((S.wps[S.warp.j] || { name: '?' }).name));
        else if (S.docked) {
          const p = holdFor('G', K('KeyG'), dt, 0.8, launch);
          if (p >= 0) { out.prog = p; out.label = S.kind === 'board' ? 'Undocking' : 'Lifting off'; }
          lines.push(hint('Hold G', S.kind === 'board' ? 'to undock' : 'to lift off'));
        } else {
          const a = nearAnchor(), slow = S.V.length() < 80;
          if (a) {
            const to = S.kind === 'hub' ? a.i : -1, name = S.kind === 'hub' ? (SD.offers(S.board.seed, S.board.level)[a.i] || { name: '?' }).name : 'home';
            if (slow) { const p = holdFor('J', K('KeyJ'), dt, 1.2, () => { S.ftl = { st: 'spool', t: 0, to, T: 2.6 }; helmCmd(['j', to]); HUD.toast('JUMP', 'Spooling for ' + name, 2.4); }); if (p >= 0) { out.prog = p; out.label = 'Jump drive'; } lines.push(hint('Hold J', 'to jump to ' + U.esc(name))); }
            else lines.push('Slow down to jump <small>(under 80 m/s)</small>');
          }
          if (S.kind !== 'board' && !(S.kind === 'assault' && S.stage !== 'atmo')) {
            const dd = S.P.distanceTo(S.Dp);
            if (dd < 160 && S.V.length() < 45) { const p = holdFor('L', K('KeyL'), dt, 0.8, land); if (p >= 0) { out.prog = p; out.label = 'Setting down'; } lines.push(hint('Hold L', 'to set down on the pad')); }
          }
          const g = warpGate();
          if (g) lines.push(S.spin >= 1 ? hint('T', 'to warp to ' + U.esc(g.w.name)) : S.spin > 0 ? `Warp drive spinning up · ${Math.round(S.spin * 100)}% <small>(keep her on ${U.esc(g.w.name)})</small>` : `<small>Turn her nose onto ${U.esc(g.w.name)} to spin up the warp drive</small>`);
          if (EW.own && shownOwn()!.fus.length) lines.push(`<small><b>B</b> torpedo${TP.left === Infinity ? '' : ` <small>(${TP.left} left)</small>`}${TP.pick ? ' at ' + U.esc(TP.pick) : ' · hold right mouse to look at a fix, click to pick it'}</small>`);
          if (S.tclose) lines.push(`Matching course with ${U.esc(S.tclose.name)}…`);
          else if (S.match && S.wps[S.tgt]) lines.push(`Speed matched with ${U.esc(S.wps[S.tgt].name)} <small>(H to let go)</small>`);
          if (S.kind === 'board' && !(S.state && S.state.boom)) { const a = aim(300); if (a) lines.push(a.close < 4 ? 'Ram the hull: nose on, 5 m/s or more' : `Ram her: within ${SD.BREACH_ANG}° of square`); }
        }
        if (ctl && !S.docked && !S.ftl && S.t - S.helpAt < 20) lines.push('<small><b>W S A D</b> thrust · <b>Space C</b> up down · <b>Q E</b> roll · <b>X</b> brake · <b>T</b> target · <b>H</b> match its speed · face it to spin up the warp drive and <b>T</b> to warp · <b>right mouse</b> look about</small>');
      } else if (seat.k === 'turret') {
        const e = SD.EQUIP[(S.fleet.fit[S.def.id] || [])[seat.n || 0] || ''];
        lines.push(e ? `${U.esc(e.name)} <small>· the mouse lays it, the trigger fires</small>` : 'Nothing is fitted to this hardpoint');
      } else if (seat.k === 'sensors') lines.push(SD.fitted(S.fleet, 'sensors') ? 'Sensor station' : (SpaceUI.SHIPYARD ? 'No scanner fitted <small>(the shipyard)</small>' : 'No scanner fitted'));
      // out of the seat
      if (held && !m.fLatch) { const p = holdFor('F', true, dt, 0.5, () => { m.fLatch = true; stand(); }); if (p >= 0 && out.prog < 0) { out.prog = p; out.label = 'Getting up'; } }
      lines.push('<small>' + hint('Hold F', 'to get up') + '</small>');
      out.prompt = lines.join('<br>');
      return out;
    }
    if (m.dead || m.down) return null;
    const px = m.pos.x, pz = m.pos.z, near = (x: number, z: number, r: number, y = m.pos.y) => Math.hypot(px - x, pz - z) < r && Math.abs(m.pos.y - y) < 2.2;
    // her inner door's button, at the head of the stairs, while a breach has it shut
    if (hatchShut() && S.def) {
      const B = SD.hatchButton(S.def), L = SD.layout(S.def), w = SD.toWorld(S.berth, B.x + 0.4, L.FB, B.z);
      if (Math.hypot(px - w.x, pz - w.z) < 1.0 && m.pos.y > w.y - 0.75 && m.pos.y < w.y + 0.4) { // (beside it: on the top steps or at their head)
        if (F) { m.fLatch = true; openHatch(); }
        out.prompt = hint('F', 'to open the breach door');
        return out;
      }
    }
    // aboard: the nearest seat
    if (aboard()) {
      const best = seatLooked();
      seatLit(best);
      if (best >= 0) {
        const s = S.seatsDef[best], taken = Object.keys(S.seats).some((id) => id !== Net.myId && S.seats[id] === best && Game.roster[id]);
        const what = s.k === 'helm' ? 'take the helm' : s.k === 'sensors' ? 'sit at the sensor station' : s.k === 'turret' ? 'man the turret' : 'sit down';
        if (taken) { out.prompt = 'Taken'; return out; }
        const p = holdFor('F', held && !m.fLatch, dt, 0.4, () => { m.fLatch = true; sit(best); });
        if (p >= 0) { out.prog = p; out.label = ''; }
        out.prompt = hint('Hold F', 'to ' + what);
        return out;
      }
      if (!S.docked) { out.prompt = ''; return out; } // (nothing else to do in flight)
    }
    // the missions terminal by the pad
    if (S.kind === 'hub' && S.term && near(S.term.x, S.term.z, 1.6)) {
      if (F) { m.fLatch = true; SpaceUI.openOps(); }
      out.prompt = hint('F', SpaceUI.SHIPYARD ? 'missions board and shipyard' : 'missions board');
      return out;
    }
    // a mission's things
    if (S.kind === 'board' && S.state && !S.state.boom) {
      const st = S.state, sp = S.map!.sp!;
      const at = st.artAt ? { x: st.artAt[0], z: st.artAt[1] } : sp.artifact;
      const doIt = (k: string, label: string, text: string, need: number, n?: number) => { const p = holdFor(k + (n || 0), held && !m.fLatch, dt, need, () => { m.fLatch = true; Net.toHost({ t: 'mobj', k, n }); }); if (p >= 0) { out.prog = p; out.label = label; } out.prompt = hint('Hold F', text); return out; };
      if (S.ms && S.ms.obj === 'artifact' && st.art === 0 && at && near(at.x, at.z, 1.9)) return doIt('art', 'Taking it', 'to take the artifact', 0.8);
      if (S.ms && S.ms.obj === 'destruct' && st.arm == null && sp.console && near(sp.console.x, sp.console.z, 1.9, sp.console.y)) return doIt('cons', 'Arming', 'to start the self-destruct', 2.5);
      for (let n = 0; n < sp.pods.length; n++) if (near(sp.pods[n].x, sp.pods[n].z, 1.5, sp.pods[n].y)) return doIt('pod', 'Strapping in', 'to leave in the escape pod', 1.5, n);
      for (let n = 0; n < sp.salvage.length; n++) if (!(st.salv || []).includes(n) && near(sp.salvage[n].x, sp.salvage[n].z, 1.7, sp.salvage[n].y)) return doIt('salv', 'Taking it', 'to take her cargo manifest (salvage)', 1.0, n);
    }
    return null;
  }
  // a key pressed while you're in one of her seats: hers, not your own (js/player.ts keydown asks)
  function key(code: string) {
    const seat = mySeat(); if (!seat) return false;
    if (seat.k === 'sensors' && code === 'KeyM') { EW.plan = !EW.plan; Audio.click(); return true; }
    if ((seat.k === 'sensors' || seat.k === 'helm') && code === 'KeyV') { chaffGo(); return true; } // (chaff: js/space.ts chaffGo)
    if (seat.k === 'sensors' && code === 'KeyI') { xpdr(!EW.xpdr); Net.toHost({ t: 'sxpdr', on: EW.xpdr ? 1 : 0 }); return true; } // (her transponder on or off)
    if (seat.k === 'helm') {
      if (code === 'KeyB') { torpFire(); return true; } // (a torpedo at the fix picked, or looked at: js/space.ts torpFire)
      if (code === 'KeyH') { // (H: matched with her target, or not; Shift H: with what the radar's locked on)
        const w = S.wps[S.tgt], sh = K('ShiftLeft') || K('ShiftRight');
        if (isCtl() && !S.docked && !S.ftl && !S.warp) { if (sh) { if (S.match === 'radar' || radarLock()) { S.match = S.match === 'radar' ? null : 'radar'; Audio.click(); } } else if (w && !w.hide && w.kind !== 'anchor') { S.match = S.match === w.id ? null : w.id; Audio.click(); } }
        return true; } // (her speed matched with her target's, or no longer)
      if (code === 'KeyT') { if (S.warp) return true; if (isCtl() && warpGo()) { helmCmd(['w']); return true; } S.spin = 0; helmCmd(['t']); for (let k = 1; k <= S.wps.length; k++) { const j = (S.tgt + k) % S.wps.length; if (!S.wps[j].hide && !S.wps[j].unseen) { S.tgt = j; break; } } return true; }
    }
    return ['KeyC', 'KeyV', 'KeyX', 'KeyT', 'KeyG', 'KeyQ', 'KeyE', 'KeyR', 'KeyB', 'KeyZ', 'Digit1', 'Digit2', 'Digit3', 'Digit4', 'KeyH', 'KeyN', 'KeyY'].includes(code);
  }

  // ------------------------------------------------------------------ the host's word
  function veilKind(k: string | null | undefined) { const el = document.getElementById('veil'); if (el) { el.classList.toggle('ftl', k === 'ftl'); el.classList.toggle('cloud', k === 'cloud'); } }
  function setBoard(b: any) {
    S.board = { seed: b.seed | 0, level: b.level | 0, picked: (b.picked || []).slice(), done: (b.done || []).slice(), gone: (b.gone || b.done || []).slice() };
    placeAnchors(); SpaceUI.boardDraw(); SpaceUI.opsRender();
  }
  // ------------------------------------------------------------------ the server's battle (docs/space-server.md C1)
  // The host's worker runs the battle wherever she is in space (js/svbattle.ts): her radars and everyone's, fire control, her flight
  // (C2), her hull; a boarding zone's mission ship's weapons are drawn from what it says: her guns (laid, firing, hit) and their rounds
  // (each gun's rounds of a step replayed from its seed: the same rounds the server flies), her missiles, the damage they do
  // (list: the zone's ships' radars the server has on, [id, name], nearest first: F8's to go through; stubs: a suite each, for its picture)
  // (ztSync: the zone's clock kept to the server's; a fingerprint step script holds it still)
  const SVB = { fill: true, ztSync: true, list: [] as [string, string][], stubs: new Map<string, RSuite>(), snap: null as ReturnType<typeof SpaceNet.read> | null, n: -1, at: 0, spAt: -1e9, own: null as RSuite | null, ownAt: -1e9, rwr: null as null | { trk: { k: string; f: number[]; lk: number }[]; scan: { k: string; f: number[]; a: number }[] } };
  // her radars' picture from the server's battle (the fast channel's stream 1: js/spaceserver.ts battle): unpacked into the last one
  // (so what's picked and drawn keeps its identity), its times put on the page's own radar clock as it arrives
  // F8's picture of the suite it's showing, from the server's battle (asked for every couple of seconds while it's open: streams 2, 3)
  const ZQ: Record<number, number> = {}; // (the newest of each deflated stream's pictures taken: js/spacenet.ts zpack's q)
  const SVD = { v: new Map<string, RSuite>(), at: new Map<string, number>(), asked: '', askedAt: -1e9 };
  function svDbgAsk() {
    if (!S.on) return; const on = !!Radar.show, id = on ? Radar.sel : '';
    if (id !== SVD.asked || (on && S.t - SVD.askedAt > 2)) { SVD.asked = id; SVD.askedAt = S.t; Net.toHost({ t: 'sdbgq', on: on ? 1 : 0, id }); }
  }
  Net.onFast((buf, ch) => {
    if ((ch !== 2 && ch !== 3) || !S.on) return;
    SpaceNet.zunpack(buf).then((m) => { if (!S.on || m.k !== S.zact || m.q <= (ZQ[ch] || 0)) return; ZQ[ch] = m.q; // (inflated: js/spacenet.ts zunpack; one come later than a newer let go)
      if (ch === 2 && m.s) { m.s.t = EW.rt; SVD.v.set(m.id, SuiteView.unpack(m.s, SVD.v.get(m.id) || null)); SVD.at.set(m.id, S.t); }
      if (ch === 3 && m.m) { const v = SVD.v.get(m.id); if (v) SuiteView.unpackMaps(m.m, v); }
    }).catch((e) => console.error('space: F8 picture from the server', e));
  });
  // (the core snapshot, as bytes: js/spacenet.ts sssBin)
  Net.onFast((buf, ch) => {
    if (ch !== SpaceNet.SSS_CH || !S.on) return;
    try { const m = SpaceNet.sssUnbin(buf); if (m) svSss(m); } catch (e) { console.error('space: the snapshot from the server', e); }
  });
  Net.onFast((buf, ch) => {
    if (ch !== 1 || !S.on) return;
    SpaceNet.zunpack(buf).then((m) => { if (!S.on || m.k !== S.zact || !m.s || m.q <= (ZQ[1] || 0)) return; ZQ[1] = m.q; m.s.t = EW.rt; SVB.own = SuiteView.unpack(m.s, SVB.own); SVB.ownAt = S.t; svBase(SVB.own); SVB.rwr = m.w || null; SVB.list = Array.isArray(m.l) ? m.l : []; }).catch((e) => console.error('space: the picture of her radars from the server', e));
  });
  // her hull as the server has it (its snapshot's, or its word as the emergency jump begins)
  function hullIs(hp: number) { S.hp = U.clamp(hp, 0, S.hpMax); if (S.hp > 0) S.lostAt = 0; else if (!S.lostAt) { S.lostAt = S.t; HUD.toast('HULL FAILING', 'Emergency jump: the repairs come out of your pay', 3); } }
  function svSss(m: SssMsg) {
    if (!S.on || m.k !== S.zact) return; // (another level's frame: not this one's)
    if (SVB.snap && SVB.snap.k === m.k && m.n <= SVB.n && SVB.n - m.n < 600) return; // (an older one, come late; far older: the server's begun again)
    const r = SpaceNet.read(m); SVB.snap = r; SVB.n = m.n; SVB.at = S.t;
    // her hull, as the server keeps it (the emergency jump at nothing is the server's: js/spaceserver.ts battle)
    if (r.hp >= 0) hullIs(r.hp);
    // (the zone's clock as the server has it, its snapshot's: the zone's ships where the server has them, so her helm here and there steer
    // for the same places; run on here from it between snapshots)
    // (eased onto it, up to 5 ms a snapshot (a tenth faster or slower): the zone's ships don't jump; far off (half a second: a new place, a stall), set to it)
    if (S.kind === 'board' && Number.isFinite(m.zt) && SVB.ztSync) { const zt = S.zt0 + (S.t - S.ztAt), e = m.zt - zt; if (Math.abs(e) > 0.5) { S.zt0 = m.zt; S.ztAt = S.t; } else S.zt0 += U.clamp(e * 0.2, -0.005, 0.005); }
    // her pose as the server flies her (C2): what the rest aboard follow (the pilot's own word of it, relayed, left aside meanwhile)
    if (r.sp && !isCtl()) { const a = r.sp; S.net = { P: new T.Vector3(a[0], a[1], a[2]), Q: new T.Quaternion(a[3], a[4], a[5], a[6]), V: new T.Vector3(a[7], a[8], a[9]) }; SVB.spAt = S.t; if (S.P.distanceTo(S.net.P) > 400) { S.P.copy(S.net.P); S.Q.copy(S.net.Q); } }
    if (S.hull) r.g.forEach((g, i) => { const gn = S.hull!.guns[i] as any; if (!gn) return; if (g.hp !== gn.hp) gunHit(i, g.hp); gn.yaw = g.yaw; gn.pitch = g.pitch; gn.rev = g.rev; gn.bt = g.fire ? 1 : 0; });
    // her missiles: as the server has them (a new one drawn, one gone taken away); flown on between snapshots
    const live = new Set(r.mis.map((q) => q.id));
    for (const m0 of S.mis.slice()) if (!live.has(m0.id)) { if (m0.o) m0.o.removeFromParent(); S.mis.splice(S.mis.indexOf(m0), 1); }
    // the torpedoes: where the server has them (a new one, another's, drawn)
    for (const q of r.tp) { let tp = TP.list.find((x) => x.id === q.id); if (!tp) tp = torpNew(q.id, q.p, q.v, q.q, false, '', q.p, q.v); tp.p.copy(q.p); tp.v.copy(q.v); tp.q.copy(q.q); tp.ph = q.ph; tp.thr = q.thr; tp.rcs = q.rcs; tp.zm = undefined; }
    for (const q of r.mis) { let m0 = S.mis.find((x) => x.id === q.id); if (!m0) { missile([q.id, q.p.x, q.p.y, q.p.z, 0], true); m0 = S.mis.find((x) => x.id === q.id); } if (m0) { m0.p.copy(q.p); m0.v.copy(q.v); m0.t = q.t; } }
  }
  function svSev(m: SevMsg) {
    if (!S.on) return;
    const lag = (n: number) => Math.max(0, ((SVB.n >= 0 ? SVB.n : n) - n) * STEP + (S.t - SVB.at)); // (how long ago the server did it)
    for (const e of m.e) {
      if (e.k === 'dmg') { if (e.w && e.d > 4) HUD.toast('HULL ' + Math.round(Math.max(0, S.hp - e.d) / S.hpMax * 100) + '%', e.w, 1.5); S.shake = Math.max(S.shake, Math.min(0.6, 0.15 + e.h * 0.1)); }
      else if (e.k === 'mis') { HUD.toast('MISSILE', 'Turn across it, or have a turret shoot it down', 2.2); Audio.deny(); }
      else if (e.k === 'misEnd') { const m0 = S.mis.find((x) => x.id === e.id); if (m0) { if (m0.o) m0.o.removeFromParent(); S.mis.splice(S.mis.indexOf(m0), 1); } if (e.hit) { S.shake = 1; SpaceUI.flash(0.35); Audio.boom(20); } }
      else if (e.k === 'gHit') gunHit(e.i, e.hp);
      else if (e.k === 'tEnd') { const tp = TP.list.find((x) => x.id === e.id); if (tp) torpGone(tp, e.how); if (e.how === 2 && e.on) HUD.feed(`<b>Torpedo hit ${U.esc(e.on === 'hull' ? hullName() : e.on.startsWith('rock') ? 'an asteroid' : e.on.startsWith('chaff') ? 'chaff' : e.on.startsWith('missile') ? 'a missile' : 'a ship')}</b>`); }
      else if (e.k === 'fire' && S.hull) { // (a gun's rounds this step: the same ones, flown on to now)
        const gn = S.hull.guns[e.i]; if (!gn) continue;
        const H = (SD.HULLGUN as any)[gn.k], rng = SpaceNet.rng(e.s), from = new T.Vector3(gn.x, gn.y, gn.z), aim = new T.Vector3(e.a[0], e.a[1], e.a[2]), dt = lag(e.n);
        for (let i = 0; i < e.c; i++) { const q = SpaceSim.fireRound(S.rounds, RMAX, rng, from, aim, H, e.e); if (q && dt > 0) { q.p.addScaledVector(q.v, dt); q.d += q.v.length() * dt; } }
      }
    }
  }
  function onMsg(m: any): boolean {
    switch (m.t) {
      case 'sss': svSss(SpaceNet.decode(m) as SssMsg); return true;
      case 'sev': svSev(SpaceNet.decode(m) as SevMsg); return true;
      case 'board': setBoard(m); return true;
      case 'fleet': {
        const was = S.fleet.ship; S.fleet = SD.cleanFleet(m.f);
        if (Net.isHost) store().set('fleet', S.fleet);
        if (m.got && SD.SHIPS[m.got]) HUD.feed(`<b>${U.esc(Game.nameOf(m.by))}</b> bought the ${SD.SHIPS[m.got].name}`);
        // another ship on the pad, or other guns on her: she's drawn again
        if (S.on && S.kind === 'hub' && S.docked && S.map) { const sp = { fleet: S.fleet, seats: was === S.fleet.ship ? S.seats : {}, ship: { docked: 1, ctl: S.ctl }, board: S.board }; setup(S.map, 'hub', sp); }
        SpaceUI.opsRender();
        return true;
      }
      case 'seats': S.seats = m.s || {}; if (m.ctl !== undefined) S.ctl = m.ctl; if (m.no != null && me().seat === m.no) { stand(); HUD.toast('', 'That seat is taken', 1.5); } return true;
      case 'spose': heardPose(m.a); S.ctl = m.by; return true;
      case 'shatch': if (!S.hatchOpen) { S.hatchOpen = true; syncSolids(); hatchSound(true); } if (m.by !== Net.myId) HUD.feed(`<b>${U.esc(Game.nameOf(m.by))}</b> opened the breach door`); return true;
      case 'sdock':
        if (m.no) { if (S.on && !S.docked) { S.auto = null; dockLocal(true); S.P.copy(S.Dp); S.Q.copy(S.Dq); } HUD.toast('NOT YET', 'Not aboard: ' + (m.no as string[]).map((n) => U.esc(String(n))).join(', '), 2); Audio.deny(); return true; } // (the host's word: someone living's still in the hull)
        if (S.on && m.on && m.site && S.kind === 'board') { if (m.by !== Net.myId) rebase(berthAt(siteAt(m.site))); cutHere(m.site); }
        if (S.on && S.kind === 'board' && S.map && S.map.sp) ShipGen.seal(S.map, m.on ? m.site || null : null); // (the holes she isn't against: shut)
        if (S.on && m.by !== Net.myId) { S.auto = null; dockLocal(!!m.on); if (!m.on) { S.P.copy(S.Dp); S.Q.copy(S.Dq); } }
        if (S.on && m.on && S.kind === 'board') { S.shake = 1; HUD.toast('BREACH', 'She\'s through the hull. Go.', 2.2); }
        return true;
      case 'unlock': unlocked(m.i); Audio.click(); return true;
      case 'ms': if (m.zt != null && S.kind === 'board') { S.zt0 = m.zt; S.ztAt = S.t; } S.state = m; raidPods(m.raid); SpaceUI.objDraw(); cards(); if (S.kind === 'assault' && m.done && S.stage === 'atmo') { /* (the way home shows once she's up) */ } return true;
      case 'mdone': {
        if (m.ok === 2) { me().credits += m.pay || 0; Career.looted(m.pay || 0, m.ships || 0); HUD.chat(null, 0, `Salvage: +¢${U.fmt(m.pay || 0)}`); HUD.feed(`<span class="cr">Salvage +¢${U.fmt(m.pay || 0)}</span>`); }
        else if (m.ok) { const xp = Loadout ? Loadout.mission(me(), m.diff || 1) : 0; const n = (m.pay || 0) + (m.bonus || 0); me().credits += n; HUD.chat(null, 0, `Mission complete: +¢${U.fmt(n)}`); Audio.extract(); Career.mission(m, (m.ms && (SD.SIZES as Record<string, { tier: number }>)[m.ms.size]?.tier) || 0, Loadout ? Loadout.rank() : 0); debrief(Object.assign({ xp }, m)); }
        else debrief(Object.assign({ xp: 0 }, m));
        return true;
      }
      case 'locked': HUD.toast('LOCKED', m.k === 'bridge' ? 'It needs the bridge keycard: one of her officers has it' : 'It needs the armoury keycard: one of her crew has it', 2.4); Audio.deny(); return true;
      case 'vent': { const role = S.map && S.map.sp ? S.map.sp.roles[m.r] : null; HUD.feed(`<span class="bad">${(role && ShipGen.NAMES[role]) || 'A compartment'} is open to space</span>`); return true; }
      case 'pod': {
        // out in a pod, and picked up: aboard your own ship
        const L = SD.layout(S.def), w = SD.toWorld(S.berth, 0, L.FM + 0.02, L.z1 - 1.5); me().pos.set(w.x, w.y, w.z); me().vel.set(0, 0, 0); me().yaw = S.berth.yaw;
        SpaceUI.flash(); HUD.toast('ESCAPE POD', 'Picked up by your own ship', 2.5);
        return true;
      }
      case 'sboom': {
        S.boomT = 0; SpaceUI.flash(1.4); S.shake = 1; Audio.boom(30);
        if ((m.lost || []).includes(Net.myId) && !me().dead) me().die('Went up with the ship');
        return true;
      }
      case 'ssec': if (S.on && m.by !== Net.myId && Array.isArray(m.a) && (m.a.length === 4 || m.a.length === 5)) modeSet(m.a[0] | 0, MODES[m.a[1] | 0] || 'round', +m.a[2], +m.a[3], true, m.a.length === 5 ? !!m.a[4] : undefined); return true;
      case 'strk': return true; // (a track kept, let go, made listen only, a bearing searched: the server's, shown in its picture)
      case 'sxpdr': if (S.on && m.by !== Net.myId) xpdr(!!m.on); return true;
      case 'schaff': if (S.on && m.by !== Net.myId && Array.isArray(m.a)) chaffOut(m.a); return true;
      case 'sfire': if (S.on && m.by !== Net.myId && S.root) shot(new T.Vector3(m.a[0], m.a[1], m.a[2]), new T.Vector3(m.a[3], m.a[4], m.a[5]), m.a[6], !!m.a[7]); return true; // (another's round: drawn)
      case 'shit': if (m.i < 0) hullIs(m.hp); return true; // (her hull, the server's word as it jumps her home or patches her up)
    }
    return false;
  }
  // keycards on the floor (they're picked up by walking over them)
  let cardGeo: THREE.BoxGeometry | null = null; const cardMat: Record<string, THREE.Material> = {};
  function cards() {
    for (const o of S.cardObjs) { o.parent && o.parent.remove(o); Views.glow.delete(o); }
    S.cardObjs = [];
    if (!S.state || !S.on || S.kind !== 'board') return;
    for (const [key, x, z, y] of S.state.cards as [string, number, number, number][]) {
      // (no light of its own: one more point light than the ship's padded count, PAD_POINTS, has every lit shader in view made again
      // in that frame, a stop of seconds on some machines; the card glows by its own unlit material. One box and one material per
      // kind, shared: this runs on every mission-state message)
      const geo = cardGeo || (cardGeo = new T.BoxGeometry(0.3, 0.02, 0.2)), mat = cardMat[key] || (cardMat[key] = ShipModel.lit(key === 'bridge' ? 0x40a0ff : 0xffb020));
      const c = new T.Mesh(geo, mat); c.position.set(x, (y || 0) + 0.25, z);
      c.userData.outline = Views.addOutline(c); Views.glow.add(c); // (outlined in yellow, seen through anything but walls, floors and doors: js/views.ts glow)
      G_R.levelRoot.add(c); S.cardObjs.push(c);
    }
    for (const q of S.things) if (q.k === 'art') { q.obj.visible = S.state.art === 0; if (S.state.artAt) q.obj.position.set(S.state.artAt[0], 0, S.state.artAt[1]); }
    for (const q of S.things) if (q.k === 'salv') q.obj.visible = !(S.state.salv || []).includes(q.n as number);
    for (const q of S.things) if (q.k === 'cons') ((q.obj.userData.scr as THREE.Mesh).material as THREE.MeshBasicMaterial).color.setHex(S.state.arm != null ? 0xffd020 : 0xff3020);
  }

  // into a place the host has sent everyone to (js/game.ts enterShop, enterLevel)
  function enterHub(map: LvMap, sp: any) { S.ms = null; S.state = null; setup(map, 'hub', sp || { fleet: store().get('fleet', null) }); SpaceUI.objDraw(); }
  function enterLevel(map: LvMap, sp: any) {
    S.ms = sp.ms; S.state = sp.state; S.zinfo = sp.zone || null;
    setup(map, sp.ms.kind === 'board' ? 'board' : 'assault', sp);
    cards(); SpaceUI.objDraw();
    // (joined late: the holes already in her, and the ship where she's against one)
    if (sp.state && S.kind === 'board') { for (const c of sp.state.cuts || []) cutHere(c); if (sp.state.site) rebase(berthAt(siteAt(sp.state.site))); if (map.sp) ShipGen.seal(map, sp.state.docked ? sp.state.site : null); for (const i of sp.state.unlocked || []) unlocked(i); }
    if (sp.state) raidPods(sp.state.raid);
    if (sp.state && sp.state.docked) dockLocal(true);
    // (come up with another of the zone's ships: the frame she's taken in is drawn as the one before it was, so nothing jumps. The
    // zone where it is now, what's outside placed by her pose as it's been carried across, and you in your seat at her new berth)
    if (S.zinfo && S.zinfo.near && S.on) {
      zoneStep(); outside();
      const m = me(), lk = S.look; S.look = null;
      if (m.pos && lk) { m.yaw = S.berth.yaw + lk.yaw; m.pitch = lk.pitch; m.eyeH = lk.eyeH; m.stowW = lk.stowW; m.crouch = lk.crouch; m.stowed = lk.stowed; }
      if (m.pos) { if (m.seat != null) m.move(0, map); Me.updateCamera(1 / 60); }
    }
  }
  // How she's flying, for her sound (js/ambience.ts shipVoice), each frame: null with no ship here. Aboard her you hear all of
  // her; off her (the hangar's floor, the deck of what she's against) less with distance, and dulled.
  const snd = { v: new T.Vector3(), docked: true, ftl: 0, has: false };
  function sound(dt: number): AmbShipState | null {
    if (!S.on || !S.model || !me().pos) { snd.has = false; return null; }
    const ab = aboard(), d = me().pos.distanceTo(S.Dp), k = ab ? 1 : U.clamp(1 - (d - 5) / 26, 0, 1) * 0.7;
    const sp = S.V.length(), acc = snd.has ? snd.v.sub(S.V).length() / Math.max(dt, 1e-3) : 0, ftl = S.ftl ? (S.ftl.st === 'tunnel' ? 2 : 1) : 0;
    let ev: string | null = null;
    if (snd.has) {
      if (S.docked && !snd.docked) ev = S.kind === 'board' ? 'ram' : 'clamp';
      else if (!S.docked && snd.docked) ev = 'release';
      else if (!ftl && snd.ftl === 2) ev = 'drop';
    }
    snd.v.copy(S.V); snd.docked = S.docked; snd.ftl = ftl; snd.has = true;
    const flying = !S.docked || !!S.auto;
    return { k, muf: ab ? 0 : 0.45 + 0.3 * U.clamp(d / 30, 0, 1), thr: flying ? Math.min(1.3, sp / S.def.speed) : 0, cruise: S.cruise || sp > S.def.speed * 2 ? 1 : S.spin * 0.5, burn: flying ? U.clamp(acc / 45, 0, 1) : 0,
      turn: flying ? U.clamp(S.Wv.length() / Math.max(0.3, S.def.turn) + S.stick.length() * 0.6, 0, 1) : 0, ftl, ftlK: S.ftl && ftl === 1 ? U.clamp(S.ftl.t / Math.max(0.1, S.ftl.T), 0, 1) : 0, ev };
  }
  const dbgPrep = () => [...zoneHulls].map(([k, h]) => { const p = h.map && (h.map as any).viewPre as LvViewPre | null; return k + (h.map ? ' map' : '') + (p ? (p.done ? ' built' : ' building') + (p.up === true ? ' sent' : p.up ? ' sending' : '') : ''); }); // (tools: how far zonePrep has got)
  /** in a jump, aboard: what the screen shows is the pod and the tunnel, not a veil (js/game.ts) */
  const jumping = () => S.on && !!S.ftl && aboard();
  // the host has the squad jumping (its veil, kind 'ftl'), and you're aboard but didn't spool her yourself (a passenger, or the
  // drive jumping her home by itself): you're in it too, waiting on the far end with her pilot, not behind a loading screen.
  // to: where she's going (the mission's number, -1 home), for the way out made on the way (jumpPrep)
  function joinJump(to: number) {
    if (!S.on || S.ftl || !aboard()) return;
    const T = 2.6; S.ftl = { st: 'wait', t: T, to, T }; S.warp = null; S.spin = 0; S.auto = null;
    helmCmd(['jw', to]); // (the host's jump, joined: told the server with the next step, its helm the same)
  }
  // (which level this screen's in: the zone's ship it is, 0 the mission's or anything else's; js/game.ts onMsg)
  const levelK = () => (S.on && S.kind === 'board' ? S.zact : 0);
  return { ztUsed: () => ZT.used, helmGeo: { hubPlace, boardPlace, boardMove, assaultPlace }, dbgRocks: () => ROCKS, dbgLand: () => land(), dbgMissile: (a: number[]) => missile(a), IP, SIM, STEP, C2: () => C2, svb: () => SVB, dbgOpt: () => OPTV, dbgWant: (p: RPlot, f: RFused | null) => trkWant(p, f, true), joinJump, dbgTorp: () => ({ TP, TORP, fire: torpFire, box: boxClick }), dbgShots: () => ({ list: myShots, shot, SHOT }), beltV: () => fieldAt(S.P), dbgZone: () => ZS.frame, dbgZstep: (p: THREE.Vector3, v: THREE.Vector3, dt: number) => zstep(p, v, dt), levelK, ew: () => EW, ewList, sv, dbgSit: (i: number) => sit(i), debrief: () => debrief(), debriefOpen: () => { const d = document.getElementById('debrief'); return !!d && !d.classList.contains('hidden'); }, isGone, sound, dbgClear: (s: ShSite) => hullClear(s), dbgSeat: () => seatLooked(), dbgPrep, prep: () => { jumpPrep(); zonePrep(); }, jumping, dbgJump: () => jumpPre && { key: jumpPre.key, map: !!jumpPre.map, built: !!(jumpPre.map && (jumpPre.map as any).viewPre && (jumpPre.map as any).viewPre.up === true) }, takeMap, S, on, sealed, aboard, seatPos, interact, key, update, enterHub, enterLevel, leave, reset, onMsg, veilKind, isCtl, mySeat, nearAnchor, clearOf, warpGate, crewAboard, aim, dbgBr, dbgDock: () => { if (S.kind === 'board' && S.map && S.map.sp) { const b = S.map.sp.breach, s = ShipGen.sites(S.map).filter((q) => q.nz > 0).sort((p, q) => Math.hypot(p.x - b.x, p.z - b.z) - Math.hypot(q.x - b.x, q.z - b.z))[0]; if (s) { const at = [s.c, s.nx, s.nz]; rebase(berthAt(s)); Net.toHost({ t: 'sdock', on: 1, site: at }); cutHere(at); } } dockLocal(true); }, dbgStage: (s: 'orbit' | 'atmo') => stage(s), dbgLaunch: launch };
})();
AudioEnv.Space = Space; // (what sound asks of it: js/audioenv.ts)
