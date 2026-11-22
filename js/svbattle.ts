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
import { SpaceSim, SimWorld, SimTorp, SimTraffic } from './spacesim.js';
import { SpaceData as SD } from './spacedata.js';
import { HullShape, TrafficShape } from './hullshape.js';
import { hullRcs, rcsFromB64, rcsOfTris } from './rcstris.js';
import { SpaceNet, SevE } from './spacenet.js';

// a world, with what the server keeps beside it
export interface SvBat {
  W: SimWorld; k: number; map: LvMap; ms: SpMission | null; built: number; // (k: the zone ship whose level it is; built: ms it took to make)
  pre: { P: THREE.Vector3; Q: THREE.Quaternion } | null; // (her pose in the last world's frame: what her radars hold is moved to this one's when the first pose in it comes)
  ev: SevE[]; dm: number; // (the events since the last snapshot; damage she's done the squad's ship)
  marks: Map<number, Record<string, number>>; tAt: Map<number, number>; // (each torpedo's timeline: when it was in her picture, HOSTILE, ...; when it was launched)
  evc: Record<string, number>; adopt: Map<number, number>; ended: Set<number>; // (events by kind, all of them; a torpedo still to be taken over: when its report first said phase 2)
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
  const HP = { v: -1, lost: false, told: false }; // (her hull: hurt, failing)
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
  // (The page has her real hull's return inside 5 km, js/space.ts zoneReal; here it's always her stand-in's)
  const tshapes = new Map<string, SimTraffic['shape']>();
  function trafficShape(c: any): SimTraffic['shape'] {
    const key = c.kind + ':' + c.seed, had = tshapes.get(key); if (had) return had;
    const sh = TrafficShape.of(c.kind, c.seed), b = sh.bbox, all = sh.bboxAll, empty = !(b.max[0] >= b.min[0]);
    const sz = empty ? [20, 10, 40] : [b.max[0] - b.min[0], b.max[1] - b.min[1], b.max[2] - b.min[2]];
    const out = { rcs: rcsOfTris(sh.exact, sh.flags), sz: Math.max(4, Math.max(all.max[0] - all.min[0], all.max[1] - all.min[1], all.max[2] - all.min[2]) / 2), long: sz[2], wide: sz[0], tall: sz[1], ctr: empty ? new T.Vector3() : new T.Vector3((b.min[0] + b.max[0]) / 2, (b.min[1] + b.max[1]) / 2, (b.min[2] + b.max[2]) / 2), real: false };
    tshapes.set(key, out); return out;
  }
  // whose the level's ship is (js/space.ts missionAff: by her class and the job), and a zone ship's by her kind
  const missionAff = (ms: SpMission | null) => { const w = ms ? SD.wearOf(ms.size as any, ms.obj) : null; return w === 'navy' ? 'navy' : w === 'pirate' ? 'pirate' : 'civ'; };

  // ---------------------------------------------------------------- made, for the level k of zone zms (map: the level's)
  function make(map: LvMap, zms: SpMission, k: number, ms: SpMission | null, fleet: any, was: SvBat | null): SvBat {
    const t0 = performance.now(), sp = map.sp!, hb = sp.hull;
    // (the battle's random numbers from the level's seed, as the page has them: js/space.ts setup)
    Radar.seed(((map.seed || 1) * 31) + (((map as any).level) || 0));
    const W = SpaceSim.world(Radar.rngOf('space'));
    W.t = rt; // (the radars' clock goes on from the last world's: what her own set holds is timed by it, js/space.ts EW.rt)
    const own = ownFor(fleet); if (own) Radar.reseed(own.su);
    W.own = own ? own.su : null; W.ownT = own ? own.t : null; W.xpdr = own ? own.xpdr : false;
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
    const B: SvBat = { W, k, map, ms, built: 0, pre: preOf(was), ev: [], dm: 0, marks: new Map(), tAt: new Map(), evc: {}, adopt: new Map(), ended: new Set(), prof: { n: 0, ms: 0, max: 0, at: 0, last: null }, sn: 0 };
    B.built = performance.now() - t0;
    return B;
  }

  const preOf = (was: SvBat | null) => { const q = !was ? null : pose && pose.map === was.map ? pose : poseWas && poseWas.map === was.map ? poseWas : null; return q ? { P: q.P.clone(), Q: q.Q.clone() } : null; };
  // ---------------------------------------------------------------- a step
  // crew: the mission ship's (js/spaceserver.ts), docked: the squad's ship docked in her breach; zt: the zone's time now (stepped)
  function step(B: SvBat, dt: number, n: number, crew: SimWorld['crew'], docked: boolean, zt: number) {
    const t0 = performance.now(), W = B.W;
    B.sn = n;
    // her pose: the pilot's last word of it, run on by its velocity to this step (none yet, as if in the tunnel: nothing's seen)
    const ps = pose && pose.map === B.map ? pose : null;
    if (ps && B.pre && W.own) { const R = ps.Q.clone().multiply(B.pre.Q.clone().invert()), t = ps.P.clone().sub(B.pre.P.clone().applyQuaternion(R)); Radar.rebase(W.own, R, t); B.pre = null; }
    if (ps) { W.ship.P.copy(ps.P).addScaledVector(ps.V, (n - ps.n) * dt); W.ship.Q.copy(ps.Q); W.ship.V.copy(ps.V); }
    W.ship.ftl = !ps; W.ship.docked = docked; if (W.own) W.ship.size = W.own.size;
    if (W.zone) { W.zone.zt0 = zt; W.zone.ztAt = W.t + dt; } // (worldStep's zone time, after its W.t += dt, is zt)
    if (W.own && OWN) { W.xpdr = OWN.xpdr; W.own.hostNames = new Set([hullName(B)]); }
    if (W.foe && W.foeT) { const af = missionAff(B.ms) as any; W.foeT.aff = af; W.foeT.iff = { c: af === 'navy' ? 'navy' : 'civ', n: hullName(B) }; W.foeT.xon = af !== 'pirate'; W.foe.aff = af; }
    W.crew = crew;
    // the guns' rounds this step, each gun's from a seed of its own (sent: a client flies the same ones)
    const fired = new Map<number, { s: number; rng: () => number; aim: THREE.Vector3; err: number; c: number }>();
    const fire = (from: THREE.Vector3, aim: THREE.Vector3, H: any, err: number) => {
      const i = W.guns.findIndex((g) => g.x === from.x && g.y === from.y && g.z === from.z); let f = fired.get(i);
      if (!f) { const s = (W.rng() * 4294967296) >>> 0; f = { s, rng: SpaceNet.rng(s), aim: aim.clone(), err, c: 0 }; fired.set(i, f); }
      SpaceSim.fireRound(W.rounds, W.roundsMax, f.rng, from, aim, H, err); f.c++;
    };
    W.out.length = 0;
    SpaceSim.worldStep(W, dt, { kindAff: (c: any) => (c.k === 0 ? missionAff(B.ms) : c.kind === 'navy' || c.kind === 'wing' ? 'navy' : c.kind === 'pirate' ? 'pirate' : 'civ'), fix: (tp) => fixOf(W, tp), fire });
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
      case 'smis': if (W && a && a[4]) { const i = W.mis.findIndex((q) => q.id === a[0]); if (i >= 0) { W.mis.splice(i, 1); B!.ev.push({ k: 'misEnd', n: B!.sn, id: a[0], hit: 0 }); } } break; // (a missile a turret shot down, said by the screen that fired)
      case 'sdmg': if (Number.isFinite(+m.d) && +m.d > 0) hurt(Math.min(+m.d, 1000)); break; // (what the pilot's page saw her take itself: the ground, a rock)
      case 'shit': if (W && m.i >= 0) { const g = W.guns[m.i | 0]; if (g) g.hp = Math.max(0, +m.hp || 0); } break;
      case 'storp': if (W) torpIn(B!, a, m.f); break;
    }
  }
  // A torpedo the helm launched (js/space.ts torpFire; its owner's page reports it each 0.1 s: storp [id, p, v, q, flags, gone]).
  // The server's made on the first report. Sent with its fix (f: [x, y, z, vx, vy, vz], the page integration's), it's the server's to fly
  // from the start, on the server's fix nearest that. Without (today's page), it's flown as its owner reports it, till the report that
  // it's on its datalink (phase 2: its nose has just come onto its target): then on whichever of the server's fixes is nearest its nose,
  // the server's from there on (guided, fused and shot at in the server's world; its owner's reports of it no longer change it).
  function torpIn(B: SvBat, a: number[], f?: unknown) {
    const W = B.W, id = a[0], gone = a[12];
    let tp = W.torps.find((q) => q.id === id) || null;
    if (!tp) {
      if (gone || B.ended.has(id)) return; // (one the server's done with: its owner's page flies its own on a while yet)
      const p = new T.Vector3(a[1], a[2], a[3]), v = new T.Vector3(a[4], a[5], a[6]), q = new T.Quaternion(a[7], a[8], a[9], a[10]).normalize();
      tp = { id, p, v, q, ph: a[11] & 3, t: 0, fus: '', est: p.clone(), ev: v.clone(), side: new T.Vector3(), mine: false, lock: '', thr: a[11] & 4 ? 1 : 0, rcs: !!(a[11] & 8), lf: new T.Vector3(),
        rt: { sz: 3, kind: 'torpedo', id: 'torp' + id, p: p.clone(), v: v.clone(), q: q.clone(), rcs: { s: new Float32Array(1), max: 0, mean: 0 }, iso: 1.5, iff: { c: 'squad', n: 'TORP ' + (id % 1000) }, aff: 'squad', only: 'squad' } };
      W.torps.push(tp); B.tAt.set(id, W.t); B.evc.torp = (B.evc.torp || 0) + 1;
      if (Array.isArray(f) && f.length === 6 && f.every(Number.isFinite)) {
        const at = new T.Vector3(f[0], f[1], f[2]), fv = new T.Vector3(f[3], f[4], f[5]), own = W.own;
        const fx = own ? own.fus.reduce((b: RFused | null, x) => (x.pl.distanceTo(at) < Math.max(300, 0.05 * at.distanceTo(W.ship.P)) && (!b || x.pl.distanceTo(at) < b.pl.distanceTo(at)) ? x : b), null) : null;
        tp.mine = true; tp.fus = fx ? fx.n : ''; tp.est.copy(fx ? fx.pl : at); tp.ev.copy(fx ? fx.v : fv); mark(B, id, 'server flies it (its fix ' + (fx ? fx.n : 'not held') + ')');
        return;
      }
    }
    if (tp.mine) return;
    tp.p.set(a[1], a[2], a[3]); tp.v.set(a[4], a[5], a[6]); tp.q.set(a[7], a[8], a[9], a[10]).normalize(); tp.ph = a[11] & 3; tp.thr = a[11] & 4 ? 1 : 0; tp.rcs = !!(a[11] & 8); tp.zm = undefined;
    if (gone) { W.torps.splice(W.torps.indexOf(tp), 1); mark(B, id, 'gone (its owner said: ' + gone + ')'); return; }
    if (tp.ph >= 2 && W.own) {
      const t1 = B.adopt.get(id) ?? W.t; B.adopt.set(id, t1); if (W.t - t1 > 1.5) return; // (its nose is on its target only as it comes onto its datalink)
      const nose = new T.Vector3(0, 0, -1).applyQuaternion(tp.q); let best: RFused | null = null, ba = 0.2;
      for (const x of W.own.fus) { const ang = nose.angleTo(x.pl.clone().sub(tp.p)); if (ang < ba) { ba = ang; best = x; } }
      if (best) { tp.mine = true; tp.fus = best.n; tp.est.copy(best.pl); tp.ev.copy(best.v); tp.t = W.t - (B.tAt.get(id) ?? W.t); B.adopt.delete(id); mark(B, id, 'server flies it (' + best.n + ', ' + (ba * 180 / Math.PI).toFixed(1) + ' deg off its nose)'); }
    }
  }

  // ---------------------------------------------------------------- out
  // the snapshot due this step (every SSS_EVERY), and the events since the last
  function out(B: SvBat, n: number, zt: number, send: (m: any) => void) {
    if (n % SpaceNet.SSS_EVERY) return;
    send(SpaceNet.encode(SpaceNet.sss(B.W, n, B.k, zt, B.dm, HP.v)));
    if (B.ev.length) { send(SpaceNet.encode({ t: 'sev', n, e: B.ev })); B.ev = []; }
  }
  // what the server's world holds (the 'sworld' control query: js/serverhost.ts; tests compare it with the page's picture)
  const suiteSum = (su: RSuite | null) => (su ? { modes: su.scans.map((s) => s.mode), plots: su.scans.map((s) => s.plots.length), cons: su.scans.map((s) => s.cons.length), fus: su.fus.length, bel: (su.bel || []).length,
    ass: su.ass.map((a) => a.n + ':' + a.cls), trks: su.trks.map((t) => t.st + (t.tgt ? ':' + t.tgt : '')), tts: su.sched ? su.sched.tts.map((q) => q.n + (q.tgt ? ':' + q.tgt : '') + ' q' + (+q.est.q).toFixed(2)) : [] } : null);
  function summary(B: SvBat | null) {
    if (!B) return { on: false, own: suiteSum(OWN && OWN.su), pose: pose ? { age: pose.n } : null };
    const W = B.W, foeP = W.foe ? W.foe.P : null;
    return { on: true, k: B.k, t: +W.t.toFixed(2), zt: W.zone ? +SpaceSim.ztOf(W).toFixed(2) : 0, built: +B.built.toFixed(1), ship: { P: W.ship.P.toArray().map((v) => Math.round(v)), docked: W.ship.docked, ftl: W.ship.ftl, d: foeP ? Math.round(foeP.distanceTo(W.ship.P)) : null },
      crew: W.crew, own: suiteSum(W.own), foe: suiteSum(W.foe), fc: W.fc, tg: W.tg.map((t) => t.id), traffic: W.traffic.filter((q) => q.su).map((q) => q.c.k),
      guns: W.guns.map((g) => ({ k: g.k, hp: g.hp, bt: +(g.bt || 0).toFixed(2), cool: +(g.cool || 0).toFixed(2) })), rounds: W.rounds.length, mis: W.mis.length, chaff: W.chaff.length,
      torps: W.torps.map((tp) => ({ id: tp.id, mine: tp.mine, ph: tp.ph, t: +tp.t.toFixed(2), fus: tp.fus, lock: tp.lock, r: foeP ? Math.round(tp.p.distanceTo(foeP)) : null, e: foeP ? Math.round(tp.est.distanceTo(foeP)) : null, R: Math.round(tp.est.distanceTo(tp.p)), ev: tp.ev.toArray().map((v) => Math.round(v)), v: tp.v.toArray().map((v) => Math.round(v)), fixed: !!fixOf(W, tp), thr: +tp.thr.toFixed(2), dbg: tp.dbg ? Object.fromEntries(Object.entries(tp.dbg).map(([k, v]) => [k, +(+(v as number)).toFixed(3)])) : null })),
      marks: Object.fromEntries(B.marks), evc: B.evc, dm: +B.dm.toFixed(2), hp: HP.v, prof: B.prof.last };
  }
  function reset() { OWN = null; pose = null; poseWas = null; rt = 0; HP.v = -1; HP.lost = false; HP.told = false; }
  // her hull, kept by the server while its battle's on (from the pilot's first pose, then by what hits her); at nothing, lost is set once
  // (js/spaceserver.ts battle: the emergency jump home); a new zone starts from the pilot's word again
  function hurt(d: number) { if (HP.v < 0) return; HP.v = Math.max(0, HP.v - d); if (HP.v <= 0 && !HP.lost) HP.lost = true; }
  function hullReset() { HP.v = -1; HP.lost = false; HP.told = false; }
  const failing = () => { if (HP.lost && !HP.told) { HP.told = true; return true; } return false; }; // (once: kept lost till the battle's over)
  return { load, make, step, heardPose, request, out, summary, reset, hullReset, failing, hp: () => HP.v, own: () => OWN, pose: () => pose };
})();
