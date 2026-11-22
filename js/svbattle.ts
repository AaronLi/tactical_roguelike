'use strict';
// The space battle on the server (docs/space-server.md phase C1): one js/spacesim.ts SimWorld for the zone the squad's boarding mission
// is in, built from data in the server's thread (no meshes): the level the squad's ship is at is the mission ship (her radars, guns and
// return from js/hullshape.ts + js/rcstris.ts hullRcs, as js/space.ts ewStep has them from her drawing), the zone's other ships out
// on their courses (their stand-ins' returns, js/hullshape.ts TrafficShape), the zone's rocks, and the squad's own ship (her radars'
// size and her return from assets/models/ships/space.json, by her turrets' fit). js/spaceserver.ts owns it (begun with the level, made
// again when the level's another zone ship, dropped when the zone's over) and steps it once a server step (js/serverhost.ts step),
// with her crew's state (hostile, gunners, the self-destruct) from its own. It's fed what the crew asks for (the pilot's pose, the
// sensor operator's picks, the helm's torpedoes, chaff) and says what happens (js/spacenet.ts sss, sev).
// Until the pages draw it (the page integration), every page still runs its own battle too: these requests are relayed as before.
import { Radar, RSuite, RTarget, RPlot, RFused, RMode } from './radar.js';
import { SpaceSim, SimWorld, SimTorp, SimTraffic, SimZone } from './spacesim.js';
import { helmOf, helmPack, helmUnpack, HelmIn, HelmEv, hubPlace, boardPlace, boardMove, assaultPlace } from './helm.js';
import { ShipGen } from './shipgen.js';
import { Level } from './level.js';
import { SpaceData as SD } from './spacedata.js';
import { HullShape, TrafficShape } from './hullshape.js';
import { hullRcs, rcsFromB64, rcsOfTris, hullClearPrep, hullClearTris, ClearPrep } from './rcstris.js';
import { SpaceNet, SevE } from './spacenet.js';

// a world, with what the server keeps beside it
// (what the place she's in gives her helm from outside the battle: js/spaceserver.ts battle)
export type HelmCtx = { fleet: any; board: { seed: number; level: number; picked: number[]; done: number[] }; gone: (i: number) => boolean; raid: number[][]; dock: (on: boolean, at?: number[]) => boolean; shipName: string }; // (dock: done as the host does it; whether she's docked after)
export interface SvBat {
  W: SimWorld; k: number; map: LvMap | null; ms: SpMission | null; kind: 'board' | 'assault' | 'hub';
  hm?: ReturnType<typeof helmOf>; siteAt?: (a: number[]) => any; clear?: ClearPrep; out0?: THREE.Vector3; // (her helm in this world, its hull's clearance, the anchor's place in the zone)
  Zi: SimZone | null; // (Zi: with no zone (the hub, a base's orbit), the still frame her flight's stepped through, as the page's level is)
  built: number; // (k: the zone ship whose level it is; built: ms it took to make)
  pre: { P: THREE.Vector3; Q: THREE.Quaternion } | null; // (her pose in the last world's frame: what her radars hold is moved to this one's when the first pose in it comes)
  ev: SevE[]; dm: number; // (the events since the last snapshot; damage she's done the squad's ship)
  marks: Map<number, Record<string, number>>; tAt: Map<number, number>; // (each torpedo's timeline: when it was in her picture, HOSTILE, ...; when it was launched)
  evc: Record<string, number>; ended: Set<number>; // (events by kind, all of them; the torpedoes done with)
  prof: { n: number; ms: number; max: number; at: number; last: { n: number; ms: number; max: number } | null };
  sn: number; // (the server step it was last stepped at: what an event from a request is stamped with)
}
type ShipFit = { rcs: string; max: number; mean: number; size: number; top: number; beam: number; bot: number; box: number[]; tube: number[] };
type Pose = { P: THREE.Vector3; Q: THREE.Quaternion; V: THREE.Vector3; n: number; map: LvMap | null };

export const SvBattle = (() => {
  const T = THREE, MODES: RMode[] = ['round', 'sector', 'off'];
  // the squad's ships' radar tables (tools/bake_space_shapes.mjs): fetched once the thread's up
  let space: { ships: Record<string, { model: string; turrets: number; fits: Record<string, ShipFit> }> } | null = null;
  function load() {
    if (space || typeof fetch !== 'function') return;
    let url: string; try { url = new URL('../../assets/models/ships/space.json', import.meta.url).href; } catch (e) { url = '/assets/models/ships/space.json'; }
    fetch(url).then((r) => (r.ok ? r.json() : Promise.reject(new Error('HTTP ' + r.status)))).then((j) => { space = j; }).catch((e) => console.warn('server battle: no space.json (' + e + '): the squad\'s ship has no radars on the server'));
  }
  // Her own set (radars, transponder): kept, all it holds, while she's the same ship (a new level isn't a new her: js/space.ts ewStep)
  let OWN: { su: RSuite; t: RTarget; def: string; key: string; xpdr: boolean } | null = null;
  let rt = 0; // (the battle's clock, never started again in a session: a new world goes on from it)
  // her helm, the server's (docs/space-server.md C2, C3): the pilot's steps as they come (sin: an input, or her state after a step of
  // her own), flown in order by js/helm.ts on the server's own helm state, one a server step (all but three at once when more wait),
  // starting once 3 are in hand (a little slack against the pages' steps coming in bursts); none waiting, she holds where she is till
  // the next comes. ack: the last step flown
  const FL = { on: false, q: new Map<number, any>(), next: -1, go: false, has: false, ack: -1 };
  // her helm state (kept across worlds: she's the same ship) and its way's memory through the zone; a helm for each world (its geometry)
  const HS: any = { kind: 'board', stage: 'space', map: null, def: SD.SHIPS.kestrel, fleet: null, docked: false, P: new T.Vector3(), Q: new T.Quaternion(), V: new T.Vector3(), Wv: new T.Vector3(), stick: new T.Vector2(),
    auto: null, ftl: null, warp: null, spin: 0, cruise: false, brLock: null, brRound: null, roundBrake: false, brThrust: false, tv: new T.Vector3(), tvP: new T.Vector3(), tvJ: -1, match: null, tgt: 0,
    wps: [], berth: { x: 0, y: 0, z: 0, yaw: 0 }, Dp: new T.Vector3(), Dq: new T.Quaternion(), shake: 0, boxes: [], floorAt: null, state: null };
  const HZ = SpaceSim.zmem();
  let hctx: HelmCtx | null = null;
  const _o0 = new T.Vector3(), _m1 = new T.Matrix4();
  // (a breach site from its key, in a level's grid: js/space.ts siteAt)
  const siteAtOf = (map: LvMap | null) => (a: number[]) => { if (!map) return null; const Wm = map.W, TS = Level.TS, x = a[0] % Wm, z = (a[0] / Wm) | 0, ax = a[2] ? 1 : 0, az = a[1] ? 1 : 0; return { c: a[0], nx: a[1], nz: a[2], x: (x + 0.5) * TS, z: (z + 0.5) * TS, cells: [-1, 0, 1].map((k) => (z + az * k) * Wm + x + ax * k), ang: a[3] || 0, pt: a[4] || 0 } as any; };
  // a world's helm: its place's geometry (sites with the hull's clearance from her triangles, boxes, ground, waypoints) and what its
  // events do on the server (damage to her hull, docking: js/spaceserver.ts dock)
  function helmFor(B: SvBat) {
    if (B.hm) return B.hm;
    const map = B.map, W = B.W, kind = B.kind, def = SD.SHIPS[(hctx && hctx.fleet && hctx.fleet.ship) || 'kestrel'] || SD.SHIPS.kestrel;
    HS.kind = kind; HS.map = map; HS.def = def; HS.fleet = hctx ? hctx.fleet : null; HS.stage = kind === 'assault' ? 'orbit' : 'space';
    let place: { boxes: number[][]; floorAt: any; wps: any[] } = { boxes: [], floorAt: null, wps: [] };
    if (kind === 'board' && map && W.zone) { const bp = boardPlace(map, W.zone.zdef, W.zone.zact, (hctx && hctx.shipName) || 'THE SHIP'); place = bp; B.out0 = bp.out0; }
    else if (kind === 'hub') place = hubPlace(SD.HUB_BERTH, hctx ? hctx.board : { seed: 1, level: 1, picked: [], done: [] }, hctx ? hctx.gone : () => false);
    else if (kind === 'assault') place = assaultPlace(HS.berth, () => HS.stage);
    HS.boxes = place.boxes; HS.floorAt = place.floorAt; HS.wps = place.wps;
    const siteAt = B.siteAt!, clear = new Map<number, boolean>();
    const sites = () => {
      if (!map || !map.sp || !B.clear) return [];
      const raid = (hctx && hctx.raid) || [], W0 = map.W, nearPod = (st: any) => raid.some((q) => Math.hypot(st.c % W0 - q[0] % W0, ((st.c / W0) | 0) - ((q[0] / W0) | 0)) * Level.TS < 8);
      const ok = (st: any) => { const k = st.c * 4 + (st.nx > 0 ? 0 : st.nx < 0 ? 1 : st.nz > 0 ? 2 : 3); let v = clear.get(k); if (v == null) { v = hullClearTris(B.clear!, st, SD.worldBoxes(def, SD.berthAt(def, st))); clear.set(k, v); } return v; };
      return ShipGen.sites(map).concat(((map.sp as any).cuts || []).map(siteAt)).filter((st: any) => !nearPod(st) && ok(st));
    };
    const Z = () => (W.zone ? W.Z : B.Zi);
    const tgtR = (w: any) => { const m = /^t(\d+)$/.exec(w.id); if (m) { const q = W.traffic.find((x) => x.c.k === +m[1]); const b = q && q.shape ? q.shape : null; return b ? Math.hypot(b.long, b.wide, b.tall) / 2 : 60; } if (w.id === 'ship' && map && map.sp) { const h = map.sp.hull; return Math.hypot(h.x1 - h.x0, h.z1 - h.z0) / 2; } return 0; };
    B.hm = helmOf(HS, { sites, siteAt, tgtR, fieldAt: (p) => SpaceSim.fieldAt(Z(), p, new T.Vector3()), zstep: (p, v, dt) => SpaceSim.zstep(Z(), p, v, dt, HZ), zturn: (q) => SpaceSim.zturn(Z(), q),
      rocks: () => W.rocks, rockList: () => W.rockList as any, boom: () => !!(W.crew && W.crew.boom) }, (e: HelmEv) => {
      if (e.k === 'dmg') hurt(e.n);
      else if (e.k === 'auto' && hctx) { if (e.then.k === 'breach') hctx.dock(true, e.then.at); else if (e.then.k === 'land') hctx.dock(true); }
    });
    return B.hm;
  }
  function flyOn(B: SvBat, dt: number) {
    if (!FL.go && FL.q.size >= 3) FL.go = true;
    if (!FL.go) return;
    const W = B.W;
    if (B.hm && B.kind === 'board' && W.zone && B.out0) boardMove(HS.wps, W.zone.zdef, B.out0, SpaceSim.ztOf(W), W.zp, W.zq); // (the zone's ships and the anchor where they are this step)
    for (let k = Math.max(1, FL.q.size - 3); k > 0; k--) { // (one a step; more waiting than the slack of three: caught up at once)
      let e = FL.q.get(FL.next);
      if (!e) { if (!FL.q.size) break; const lo = Math.min(...FL.q.keys()); if (lo < FL.next) break; FL.next = lo; e = FL.q.get(lo); } // (a step never come: on from the next that has)
      FL.q.delete(FL.next);
      if (e.st) { helmUnpack(HS, e.st, HZ, B.siteAt!); FL.has = true; }
      else if (FL.has) {
        const fresh = !B.hm, hm = helmFor(B); if (fresh && B.kind === 'board' && W.zone && B.out0) boardMove(HS.wps, W.zone.zdef, B.out0, SpaceSim.ztOf(W), W.zp, W.zq); // (made once she's known: her berth's in her first state)
        const j = HS.wps.findIndex((w: any) => w.id === e.tg); if (j >= 0) HS.tgt = j; HS.match = e.m == null ? null : String(e.m);
        for (const c of e.c || []) { if (c[0] === 'w') hm.warpGo(); else if (c[0] === 'l') hm.land(); else if (c[0] === 't') HS.spin = 0; else if (c[0] === 'u' && hctx && !hctx.dock(false)) { hm.dock(false); hm.launchAway(); } } // (u: off her berth, if the host lets her go: everyone aboard)
        const I: HelmIn = { h: !!e.i[0], b: e.i[1] | 0, sx: +e.i[2], sy: +e.i[3], rb: Array.isArray(e.rb) ? new T.Vector3(+e.rb[0], +e.rb[1], +e.rb[2]) : null };
        hm.tgtTrack(dt); hm.fly(I, dt);
      }
      FL.ack = FL.next; FL.next++;
    }
    if (FL.has) { W.ship.P.copy(HS.P); W.ship.Q.copy(HS.Q); W.ship.V.copy(HS.V); }
  }
  function flyIn(m: any) {
    if (m.off) { FL.on = false; FL.q.clear(); FL.next = -1; FL.go = false; FL.has = false; return; }
    if (!Array.isArray(m.a) || m.a.length > 64) return;
    for (const e of m.a) {
      const s = e && +e.s; if (!Number.isFinite(s)) continue;
      if (!e.st && !(Array.isArray(e.i) && e.i.length === 4 && e.i.every(Number.isFinite))) continue;
      if (!FL.on) { if (!e.st) continue; FL.on = true; FL.next = s; FL.go = false; FL.has = false; } // (begun from a state)
      if (s >= FL.next) FL.q.set(s, e);
    }
    if (FL.q.size > 600) { FL.q.clear(); FL.on = false; } // (a pilot gone quiet then flooding: begun again from her next state)
  }
  // (what the pilot's page is told every few steps: the last step flown and her whole helm state after it)
  const flyAck = () => (FL.on && FL.has && FL.ack >= 0 ? { s: FL.ack, h: helmPack(HS, HZ) } : null);
  let match: string | null = null; // (what the pilot's matched speed with: her notch lets it through)
  const HP = { v: -1, lost: false, told: false, max: 0 }; // (her hull: hurt, failing)
  let pose: Pose | null = null, poseWas: Pose | null = null; // (the pilot's last word of her pose, and the server step it came at; the last one in another level's frame)
  const fitKey = (fleet: any, def: SpShipDef) => { const fit = ((fleet && fleet.fit && fleet.fit[def.id]) || []).slice(0, def.turrets); return Array.from({ length: def.turrets }, (_, i) => (fit[i] ? (fit[i] === 'rail' ? 'r' : 'g') : '-')).join(''); };
  function ownFor(fleet: any) {
    const def = SD.SHIPS[(fleet && fleet.ship) || 'kestrel'] || SD.SHIPS.kestrel, key = fitKey(fleet, def), sd = space && space.ships[def.id], f = sd && (sd.fits[key] || Object.values(sd.fits)[0]);
    if (!f) return OWN && OWN.def === def.id ? OWN : null;
    if (!OWN || OWN.def !== def.id) {
      const su = Radar.suite('own', f.size, f.top, f.beam, f.bot); Radar.sched(su);
      su.scans.forEach((sc) => { sc.mode = 'off'; }); // (silent till her sensor operator switches them on)
      OWN = { su, t: { sz: f.size, kind: 'ship', id: 'own', p: new T.Vector3(), v: new T.Vector3(), q: new T.Quaternion(), rcs: rcsFromB64(f.rcs) }, def: def.id, key, xpdr: OWN ? OWN.xpdr : false };
    } else if (OWN.key !== key) { OWN.t.rcs = rcsFromB64(f.rcs); OWN.key = key; }
    OWN.t.iff = { c: 'squad', n: def.name || 'squad' }; OWN.t.aff = 'squad'; OWN.su.aff = 'squad';
    return OWN;
  }
  // a zone ship's stand-in (js/hullshape.ts TrafficShape), as a radar target: her return, her size, her box (her stand-in lies along z).
  // (inside 5 km, once the server's made her level (js/spaceserver.ts warm), her real hull's instead: realShape)
  const tshapes = new Map<string, SimTraffic['shape']>();
  function trafficShape(c: any): SimTraffic['shape'] {
    const key = c.kind + ':' + c.seed, had = tshapes.get(key); if (had) return had;
    const sh = TrafficShape.of(c.kind, c.seed), b = sh.bbox, all = sh.bboxAll, empty = !(b.max[0] >= b.min[0]);
    const sz = empty ? [20, 10, 40] : [b.max[0] - b.min[0], b.max[1] - b.min[1], b.max[2] - b.min[2]];
    const out = { rcs: rcsOfTris(sh.exact, sh.flags), sz: Math.max(4, Math.max(all.max[0] - all.min[0], all.max[1] - all.min[1], all.max[2] - all.min[2]) / 2), long: sz[2], wide: sz[0], tall: sz[1], ctr: empty ? new T.Vector3() : new T.Vector3((b.min[0] + b.max[0]) / 2, (b.min[1] + b.max[1]) / 2, (b.min[2] + b.max[2]) / 2), real: false };
    tshapes.set(key, out); return out;
  }
  // a zone ship's real hull (her level's, js/hullshape.ts HullShape), as the page draws her once she's inside 5 km (js/space.ts zoneReal):
  // centred on her hull's middle as the page's holder is; her return, size and box from all of it (her real hull lies along x)
  const rshapes = new Map<string, SimTraffic['shape']>();
  function realShape(map: LvMap, key: string): SimTraffic['shape'] {
    const had = rshapes.get(key); if (had) return had;
    const sh = HullShape.of(map), hb = map.sp!.hull, cx = (hb.x0 + hb.x1) / 2, cz = (hb.z0 + hb.z1) / 2, ex = sh.exact.slice();
    for (let i = 0; i < ex.length; i += 3) { ex[i] -= cx; ex[i + 2] -= cz; }
    const b = sh.bbox, all = sh.bboxAll, empty = !(b.max[0] >= b.min[0]);
    const sz = empty ? [40, 10, 20] : [b.max[0] - b.min[0], b.max[1] - b.min[1], b.max[2] - b.min[2]];
    const out = { rcs: rcsOfTris(ex, sh.flags), sz: Math.max(4, Math.max(all.max[0] - all.min[0], all.max[1] - all.min[1], all.max[2] - all.min[2]) / 2), long: sz[0], wide: sz[2], tall: sz[1], ctr: empty ? new T.Vector3() : new T.Vector3((b.min[0] + b.max[0]) / 2 - cx, (b.min[1] + b.max[1]) / 2, (b.min[2] + b.max[2]) / 2 - cz), real: true };
    if (rshapes.size > 16) rshapes.clear();
    rshapes.set(key, out); return out;
  }
  // (each zone ship inside 5 km whose level the server has made: her real hull swapped in, her radar target and radars made again for it)
  function zoneReal(W: SimWorld, mapOf: (k: number) => LvMap | null) {
    if (!W.zone) return;
    for (const q of W.traffic) {
      if (!q.shape || q.shape.real || !q.t || q.c.k == null || q.c.k === W.zone.zact || q.t.p.distanceTo(W.ship.P) > 5000) continue;
      const m = mapOf(q.c.k); if (!m || !m.sp) continue;
      q.shape = realShape(m, (m.seed || 0) + ':' + ((m as any).level || 0) + ':' + q.c.k); q.t = undefined; q.su = null;
    }
  }
  // whose the level's ship is (js/space.ts missionAff: by her class and the job), and a zone ship's by her kind
  const missionAff = (ms: SpMission | null) => { const w = ms ? SD.wearOf(ms.size as any, ms.obj) : null; return w === 'navy' ? 'navy' : w === 'pirate' ? 'pirate' : 'civ'; };

  // ---------------------------------------------------------------- made, for the level k of zone zms (map: the level's)
  // (kind: a boarding zone (the mission ship, the zone's ships and rocks), a base's orbit or the hub (her and what she puts out: chaff,
  // torpedoes); map: the level's, none at the hub)
  function make(map: LvMap | null, zms: SpMission | null, k: number, ms: SpMission | null, fleet: any, was: SvBat | null, kind: SvBat['kind'] = 'board'): SvBat {
    const t0 = performance.now();
    // (the battle's random numbers from the level's seed, as the page has them: js/space.ts setup)
    Radar.seed(map ? ((map.seed || 1) * 31) + (((map as any).level) || 0) : 7);
    const W = SpaceSim.world(Radar.rngOf('space'));
    W.t = rt; // (the radars' clock goes on from the last world's: what her own set holds is timed by it, js/space.ts EW.rt)
    const own = ownFor(fleet); if (own) Radar.reseed(own.su);
    W.own = own ? own.su : null; W.ownT = own ? own.t : null; W.xpdr = own ? own.xpdr : false;
    const sp = map && map.sp, hb = sp && sp.hull; let clearPrep: ClearPrep | undefined;
    if (kind === 'board' && map && sp && hb && zms) {
      W.zone = { zdef: SD.zone(zms as any), zact: k, wing: !!sp.wing, zC: new T.Vector3((hb.x0 + hb.x1) / 2, 0, (hb.z0 + hb.z1) / 2), zt0: 0, ztAt: 0 };
      W.rockList = SD.rocks(zms as any) as any;
      W.traffic = W.zone.zdef.map((c: any) => ({ c, shape: null }));
      W.trafficShape = trafficShape;
      // the mission ship (the level's): her suite on her hull (its mounts fitted), her return with her guns and radars' kit, her guns
      const sh = HullShape.of(map), h = hullRcs(map, sh);
      W.foe = h.su; Radar.sched(W.foe);
      W.foeT = { sz: h.sz, kind: 'ship', id: 'hull', p: h.c.clone(), v: new T.Vector3(), q: new T.Quaternion(), rcs: h.rcs };
      W.hb = hb;
      W.guns = sh.guns.map((g, i) => ({ k: g.k, x: g.x, y: h.fit.guns[i].y, z: g.z, inv: g.inv, hp: g.hp, cool: g.cool }));
      clearPrep = hullClearPrep(h.tris, h.flags); // (her hull, guns and radars' kit as drawn: what the squad's ship berthed at a site mustn't cut into)
    }
    if (!was || was.kind !== kind) { HP.lost = false; HP.told = false; } // (a hull failing in the last place's done with)
    const B: SvBat = { clear: clearPrep, siteAt: siteAtOf(map), W, k, map, ms, kind, Zi: W.zone ? null : SpaceSim.zone(), built: 0, pre: preOf(was), ev: [], dm: 0, marks: new Map(), tAt: new Map(), evc: {}, ended: new Set(), prof: { n: 0, ms: 0, max: 0, at: 0, last: null }, sn: 0 };
    B.built = performance.now() - t0;
    return B;
  }

  const preOf = (was: SvBat | null) => { const q = !was ? null : pose && pose.map === was.map ? pose : poseWas && poseWas.map === was.map ? poseWas : null; return q ? { P: q.P.clone(), Q: q.Q.clone() } : null; };
  // ---------------------------------------------------------------- a step
  // crew: the mission ship's (js/spaceserver.ts), docked: the squad's ship docked in her breach; zt: the zone's time now (stepped)
  function step(B: SvBat, dt: number, n: number, crew: SimWorld['crew'], docked: boolean, zt: number, mapOf?: (k: number) => LvMap | null, hc?: HelmCtx) {
    if (hc) hctx = hc;
    const t0 = performance.now(), W = B.W;
    B.sn = n;
    // her pose: the pilot's last word of it, run on by its velocity to this step (none yet, as if in the tunnel: nothing's seen)
    const ps = pose && pose.map === B.map ? pose : null;
    if (ps && B.pre && W.own) { const R = ps.Q.clone().multiply(B.pre.Q.clone().invert()), t = ps.P.clone().sub(B.pre.P.clone().applyQuaternion(R)); Radar.rebase(W.own, R, t); B.pre = null; }
    if (ps && !(FL.on && FL.has)) { W.ship.P.copy(ps.P).addScaledVector(ps.V, (n - ps.n) * dt); W.ship.Q.copy(ps.Q); W.ship.V.copy(ps.V); } // (flying her itself: flyOn, after the step)
    W.ship.ftl = !ps; W.ship.docked = docked; if (W.own) W.ship.size = W.own.size;
    if (W.zone) { W.zone.zt0 = zt; W.zone.ztAt = W.t + dt; } // (worldStep's zone time, after its W.t += dt, is zt)
    if (W.own && OWN) { W.xpdr = OWN.xpdr; W.own.hostNames = new Set([hullName(B)]); }
    if (W.foe && W.foeT) { const af = missionAff(B.ms) as any; W.foeT.aff = af; W.foeT.iff = { c: af === 'navy' ? 'navy' : 'civ', n: hullName(B) }; W.foeT.xon = af !== 'pirate'; W.foe.aff = af; }
    W.crew = crew; W.keepTgt = match;
    if (mapOf && n % 30 === 0) zoneReal(W, mapOf);
    // the guns' rounds this step, each gun's from a seed of its own (sent: a client flies the same ones)
    const fired = new Map<number, { s: number; rng: () => number; aim: THREE.Vector3; err: number; c: number }>();
    const fire = (from: THREE.Vector3, aim: THREE.Vector3, H: any, err: number) => {
      const i = W.guns.findIndex((g) => g.x === from.x && g.y === from.y && g.z === from.z); let f = fired.get(i);
      if (!f) { const s = (W.rng() * 4294967296) >>> 0; f = { s, rng: SpaceNet.rng(s), aim: aim.clone(), err, c: 0 }; fired.set(i, f); }
      SpaceSim.fireRound(W.rounds, W.roundsMax, f.rng, from, aim, H, err); f.c++;
    };
    W.out.length = 0;
    SpaceSim.worldStep(W, dt, { kindAff: (c: any) => (c.k === 0 ? missionAff(B.ms) : c.kind === 'navy' || c.kind === 'wing' ? 'navy' : c.kind === 'pirate' ? 'pirate' : 'civ'), fix: (tp) => fixOf(W, tp), fire });
    if (B.Zi) SpaceSim.zoneAt(B.Zi, W.t, _o0, _m1); // (no zone: the still frame, placed each step as the page's level's is: js/space.ts zoneStep)
    if (FL.on) flyOn(B, dt); // (her flight: after the world's step, through this step's zone frame, as the page flies her after its zone's step)
    for (const [i, f] of fired) B.ev.push(SpaceNet.fireOf(n, i, f.aim, f.err, f.s, f.c));
    SpaceNet.sevOf(W.out, n, B.ev);
    for (const e of W.out) { B.evc[e.k] = (B.evc[e.k] || 0) + 1; if (e.k === 'damage') { B.dm += e.dmg; hurt(e.dmg); } if (e.k === 'torpEnd') B.ended.add(e.id); if (e.k === 'torpEnd') mark(B, e.id, e.how === 1 ? 'shot down' : e.how === 2 ? 'hit ' + (e.on || '') : 'spent'); }
    if (fired.size) B.evc.fire = (B.evc.fire || 0) + fired.size;
    watch(B); rt = W.t;
    const took = performance.now() - t0, P = B.prof; P.n++; P.ms += took; if (took > P.max) P.max = took;
    if (t0 - P.at > 1000) { if (P.at) P.last = { n: P.n, ms: P.ms, max: P.max }; P.n = 0; P.ms = 0; P.max = 0; P.at = t0; }
  }
  const hullName = (B: SvBat) => (B.ms && B.ms.name) || 'target';
  // where her sensors have the fix a torpedo was sent at (by name, as the page's: js/space.ts torps)
  const fixOf = (W: SimWorld, tp: SimTorp): RFused | null => (W.own && tp.fus ? W.own.fus.find((q) => q.n === tp.fus) || null : null);

  // each torpedo's timeline in the mission ship's picture (as tools/space_steps/torpedo_defence.mjs has the page's): for the 'sworld' query
  function mark(B: SvBat, id: number, k: string) { const m = B.marks.get(id) || {}; B.marks.set(id, m); if (m[k] == null) m[k] = +(B.W.t - (B.tAt.get(id) ?? B.W.t)).toFixed(2); }
  function watch(B: SvBat) {
    const W = B.W, su = W.foe; if (!su || !W.torps.length) return;
    const S0 = Radar.sched(su);
    for (const tp of W.torps) {
      const id = tp.rt.id, isT = (x: string | null | undefined) => x === id;
      for (const a of su.ass) { const ids = [a.c && a.c.p.id, a.f && a.f.a && a.f.a.p.id, a.f && a.f.b && a.f.b.p.id, a.f && a.f.trk && a.f.trk.tgt]; if (ids.some(isT)) { mark(B, tp.id, 'in picture'); if (a.cls === 'HOSTILE') mark(B, tp.id, 'HOSTILE'); } }
      for (const tr of su.trks) { if (tr.tgt === id && tr.st === 'track') mark(B, tp.id, 'dish locked on'); }
      for (const q of S0.tts) if (q.tgt === id) { mark(B, tp.id, 'ship track holds it'); if (q.est.q >= 0.15) mark(B, tp.id, 'track good for guns (q>=0.15)'); }
      if (W.fc && W.fc.id === id) mark(B, tp.id, 'fire control after it');
      if (W.guns.some((g) => (g.bt || 0) > 0)) mark(B, tp.id, 'first burst');
      if (W.foe && tp.p.distanceTo(W.foe.P) < 1500) mark(B, tp.id, 'inside 1.5 km');
    }
  }

  // ---------------------------------------------------------------- what the crew asks for
  // the pilot's pose (js/space.ts sendPose: [P, Q, V, atmo, hp], in the level's frame), at server step n; map: the level it's in
  function heardPose(a: number[], n: number, map: LvMap | null) {
    if (Number.isFinite(a[12]) && a[12] > 0) HP.max = a[12];
    if (HP.v < 0 && Number.isFinite(a[11])) HP.v = Math.max(0, a[11]); // (her hull as the pilot's page had it when the server's battle began)
    if (pose && pose.map !== map) poseWas = pose;
    pose = { P: new T.Vector3(a[0], a[1], a[2]), Q: new T.Quaternion(a[3], a[4], a[5], a[6]).normalize(), V: new T.Vector3(a[7], a[8], a[9]), n, map };
  }
  // the sensor operator's and helm's requests (as js/space.ts onMsg does them to a page's own set), on the server's set and world
  function request(B: SvBat | null, m: any) {
    const own = OWN && OWN.su, W = B && B.W, a = m.a;
    switch (m.t) {
      case 'ssec': { if (!own) break; const sc = own.scans[a[0] | 0]; if (!sc) break; const mode = MODES[a[1] | 0] || 'round'; sc.mode = mode; sc.sec.on = mode === 'sector'; sc.sec.c = +a[2]; sc.sec.h = +a[3]; if (a.length === 5) sc.notch = !!a[4]; break; }
      case 'sxpdr': if (OWN) OWN.xpdr = !!m.on; if (W) W.xpdr = !!m.on; break;
      case 'srcue': { if (!own) break; if (a[0] < 0) { for (const t of own.trks) Radar.drop(t); break; } Radar.cue(own, { k: a[0] | 0, phi: +a[1], r: +a[2], t: W ? W.t : 0, db: 0, id: '', e: 0 }); break; }
      case 'strk': {
        if (!own) break; const ti = a[0] | 0, tr = own.trks[ti], now = W ? W.t : 0, P = W ? W.ship.P : new T.Vector3();
        if (a[1] === 0 && tr) { if (a[2]) Radar.drop(tr); tr.off = !!a[2]; }
        else if (a[1] === 7 || a[1] === 6) { const p = new T.Vector3(+a[2], +a[3], +a[4]); let b = null as any, bd = 300; for (const q of Radar.sched(own).tts) { const d = q.kf.pos(new T.Vector3()).distanceTo(p); if (d < bd) { bd = d; b = q; } } if (b) { if (a[1] === 7) b.quiet = !!a[5]; else Radar.lose(own, b); } }
        else if (a[1] === 4) Radar.wantRay(own, new T.Vector3(+a[2], +a[3], +a[4]), now);
        else if (a[1] === 3 || a[1] === 5) { // (a track kept, or let go: js/space.ts trkWant)
          const p: RPlot = { k: a[2] | 0, phi: +a[3], r: +a[4], t: now, db: 0, id: '', e: 0 }, at0 = Radar.plotAt(own, p);
          const f = own.fus.find((q) => q.pl.distanceTo(at0) < Math.max(200, 0.04 * q.pl.distanceTo(P))) || null, at = f ? f.pl : at0, S0 = Radar.sched(own);
          const kept = S0.tts.find((q) => q.op && ((!!f && q.bel === f.n) || Radar.ttAt(q, now).distanceTo(at) < Math.max(200, 4 * q.kf.sig() + (f ? 3 * f.kf.sig() : 0))));
          if (kept) Radar.unwant(own, kept); else Radar.want(own, { f, plot: p, pri: 1, op: true }, now);
        }
        break;
      }
      case 'schaff': if (W) W.chaff.push(SpaceSim.chaffNew(a, ++W.chaffN, W.t)); break;
      case 'sfire': if (W && a && a.length >= 9 && W.shots.length < SpaceSim.SHOT.MAX) W.shots.push({ p: new T.Vector3(a[0], a[1], a[2]), v: new T.Vector3(a[3], a[4], a[5]), d: 0, life: Math.min(+a[6], 6000), dmg: Math.min(+a[8], 100) }); break; // (a round from one of her turrets: the server's to hit with)
      case 'smatch': match = m.id || null; break;
      case 'sin': flyIn(m); break;
      case 'sdmg': if (Number.isFinite(+m.d) && +m.d > 0) hurt(Math.min(+m.d, 1000)); break; // (what the pilot's page saw her take itself: the ground, a rock)
      case 'storp': if (W) torpIn(B!, a, m.f); break;
    }
  }
  // a torpedo launched (storp: its place, velocity, attitude, flags; f, the fix it was sent at, [x, y, z, vx, vy, vz]): the server's
  // from the start, flown on its own fix nearest that one (guided, fused and shot at in its world; every page draws it from the snapshots)
  function torpIn(B: SvBat, a: number[], f?: unknown) {
    const W = B.W, id = a[0];
    if (W.torps.some((q) => q.id === id) || B.ended.has(id) || a[12] || !Array.isArray(f) || f.length !== 6 || !f.every(Number.isFinite)) return;
    const p = new T.Vector3(a[1], a[2], a[3]), v = new T.Vector3(a[4], a[5], a[6]), q = new T.Quaternion(a[7], a[8], a[9], a[10]).normalize();
    const tp: SimTorp = { id, p, v, q, ph: a[11] & 3, t: 0, fus: '', est: p.clone(), ev: v.clone(), side: new T.Vector3(), mine: true, lock: '', thr: a[11] & 4 ? 1 : 0, rcs: !!(a[11] & 8), lf: new T.Vector3(),
      rt: { sz: 3, kind: 'torpedo', id: 'torp' + id, p: p.clone(), v: v.clone(), q: q.clone(), rcs: { s: new Float32Array(1), max: 0, mean: 0 }, iso: 1.5, iff: { c: 'squad', n: 'TORP ' + (id % 1000) }, aff: 'squad', only: 'squad' } };
    W.torps.push(tp); B.tAt.set(id, W.t); B.evc.torp = (B.evc.torp || 0) + 1;
    const at = new T.Vector3(f[0], f[1], f[2]), fv = new T.Vector3(f[3], f[4], f[5]), own = W.own;
    const fx = own ? own.fus.reduce((b: RFused | null, x) => (x.pl.distanceTo(at) < Math.max(300, 0.05 * at.distanceTo(W.ship.P)) && (!b || x.pl.distanceTo(at) < b.pl.distanceTo(at)) ? x : b), null) : null;
    tp.fus = fx ? fx.n : ''; tp.est.copy(fx ? fx.pl : at); tp.ev.copy(fx ? fx.v : fv); mark(B, id, 'server flies it (its fix ' + (fx ? fx.n : 'not held') + ')');
  }

  // ---------------------------------------------------------------- out
  // the snapshot due this step (every SSS_EVERY), and the events since the last
  function out(B: SvBat, n: number, zt: number, send: (m: any) => void, fast: (b: ArrayBuffer, ch: number) => void) {
    if (n % SpaceNet.SSS_EVERY) return;
    fast(SpaceNet.sssBin(SpaceNet.sss(B.W, n, B.k, zt, B.dm, HP.v, FL.on && FL.has)), SpaceNet.SSS_CH); // (bytes, unreliable: js/spacenet.ts)
    if (B.ev.length) { send(SpaceNet.encode({ t: 'sev', n, e: B.ev })); B.ev = []; }
  }
  // what the server's world holds (the 'sworld' control query: js/serverhost.ts; tests compare it with the page's picture)
  const suiteSum = (su: RSuite | null) => (su ? { modes: su.scans.map((s) => s.mode), plots: su.scans.map((s) => s.plots.length), cons: su.scans.map((s) => s.cons.length), fus: su.fus.length, bel: (su.bel || []).length,
    ass: su.ass.map((a) => a.n + ':' + a.cls), trks: su.trks.map((t) => t.st + (t.tgt ? ':' + t.tgt : '')), tts: su.sched ? su.sched.tts.map((q) => q.n + (q.tgt ? ':' + q.tgt : '') + ' q' + (+q.est.q).toFixed(2)) : [] } : null);
  function summary(B: SvBat | null) {
    if (!B) return { on: false, own: suiteSum(OWN && OWN.su), pose: pose ? { age: pose.n } : null };
    const W = B.W, foeP = W.foe ? W.foe.P : null;
    return { on: true, k: B.k, t: +W.t.toFixed(2), zt: W.zone ? +SpaceSim.ztOf(W).toFixed(2) : 0, built: +B.built.toFixed(1), ship: { P: W.ship.P.toArray().map((v) => Math.round(v)), docked: W.ship.docked, ftl: W.ship.ftl, d: foeP ? Math.round(foeP.distanceTo(W.ship.P)) : null },
      crew: W.crew, keep: W.keepTgt, own: suiteSum(W.own), foe: suiteSum(W.foe), fc: W.fc, tg: W.tg.map((t) => t.id), traffic: W.traffic.filter((q) => q.su).map((q) => q.c.k), real: W.traffic.filter((q) => q.shape && q.shape.real).map((q) => ({ k: q.c.k, mean: +q.shape!.rcs.mean.toFixed(3), max: +q.shape!.rcs.max.toFixed(3), sz: +q.shape!.sz.toFixed(2) })),
      guns: W.guns.map((g) => ({ k: g.k, hp: g.hp, bt: +(g.bt || 0).toFixed(2), cool: +(g.cool || 0).toFixed(2) })), rounds: W.rounds.length, mis: W.mis.length, chaff: W.chaff.length,
      torps: W.torps.map((tp) => ({ id: tp.id, mine: tp.mine, ph: tp.ph, t: +tp.t.toFixed(2), fus: tp.fus, lock: tp.lock, r: foeP ? Math.round(tp.p.distanceTo(foeP)) : null, e: foeP ? Math.round(tp.est.distanceTo(foeP)) : null, R: Math.round(tp.est.distanceTo(tp.p)), ev: tp.ev.toArray().map((v) => Math.round(v)), v: tp.v.toArray().map((v) => Math.round(v)), fixed: !!fixOf(W, tp), thr: +tp.thr.toFixed(2), dbg: tp.dbg ? Object.fromEntries(Object.entries(tp.dbg).map(([k, v]) => [k, +(+(v as number)).toFixed(3)])) : null })),
      marks: Object.fromEntries(B.marks), evc: B.evc, dm: +B.dm.toFixed(2), hp: HP.v, fly: { on: FL.on, go: FL.go, q: FL.q.size, next: FL.next, ack: FL.ack, P: FL.has ? HS.P.toArray().map((v: number) => +v.toFixed(2)) : null }, prof: B.prof.last };
  }
  function reset() { OWN = null; pose = null; poseWas = null; rt = 0; match = null; flyIn({ off: 1 }); HP.v = -1; HP.lost = false; HP.told = false; }
  // her hull, kept by the server while its battle's on (from the pilot's first pose, then by what hits her); at nothing, lost is set once
  // (js/spaceserver.ts battle: the emergency jump home); a new zone starts from the pilot's word again
  function hurt(d: number) { if (HP.v < 0) return; HP.v = Math.max(0, HP.v - d); if (HP.v <= 0 && !HP.lost) HP.lost = true; }
  function hullReset() { HP.v = -1; HP.lost = false; HP.told = false; }
  // (docked at home: made good; failing at home: patched up to 30%, the drive having nowhere to jump her)
  function repair() { if (HP.max > 0) { HP.v = HP.max; HP.lost = false; HP.told = false; } }
  function patch() { HP.v = HP.max > 0 ? HP.max * 0.3 : 30; HP.lost = false; HP.told = false; return HP.v; }
  const failing = () => { if (HP.lost && !HP.told) { HP.told = true; return true; } return false; }; // (once: kept lost till the battle's over)
  return { load, make, step, heardPose, request, out, summary, reset, hullReset, repair, patch, failing, flyAck, fly: () => ({ on: FL.on, go: FL.go, q: FL.q.size, next: FL.next, ack: FL.ack }), hp: () => HP.v, own: () => OWN, pose: () => pose };
})();
