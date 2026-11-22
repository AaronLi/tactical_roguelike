'use strict';
// The space battle's simulation, apart from the page (docs/space-server.md): what's worked out here is worked out from data alone
// (no scene, no DOM, no meshes, no network), so it runs the same on the page, in the server worker and in Node. Built up a piece at
// a time (phase A), each piece taken out of js/space.ts and checked against what it did there.
//
// The zone's frame. Everything in the battle is placed in the LEVEL's frame (the ship the mission's on: the level is drawn still,
// the zone goes by it, and turns when she does). A thing flying free (her, a round, a torpedo, chaff) goes straight through the
// ZONE, whatever the level ship's doing: zstep takes it into the zone as the zone was placed last step, moves it on there, and brings
// it back as the zone's placed now. The zone's placing each step is given to zoneAt; fieldAt is the zone's velocity at a place in the
// level's frame (what the field's going by at there: away from the level ship's middle, as she turns, not one speed everywhere).

export interface SimZone {
  frame: { prev: THREE.Matrix4; cur: THREE.Matrix4; inv: THREE.Matrix4; pinv: THREE.Matrix4; turn: THREE.Quaternion; dt: number; ok: boolean }; // (ok: two placings a step apart to go between)
  prev: { p: THREE.Vector3; m: THREE.Matrix4; t: number }; // (its last placing, and the zone's time then)
  v: THREE.Vector3; // (the zone's velocity in the level's frame: its middle's)
}
// (a thing's own record of its velocity in the zone, and the level-frame velocity it was last given from it: it goes on with that,
// and whatever's changed its level velocity since as a push, not a velocity worked back out of the level's each step)
export type ZMem = { vz: THREE.Vector3; v: THREE.Vector3 };
// The zone's rocks: each one's place in the level's frame (p: by its index in list), those within ROCK_NEAR of her (near) radar
// targets (tg) and the radars' cover (Radar.occ); the field's velocity (v), from the zone's placing step to step (zp, zt)
export interface SimRocks { near: number[]; p: THREE.Vector3[]; tg: Map<number, RTarget>; r: Map<string, number>; v: THREE.Vector3; zp: THREE.Vector3; zt: number }
export type RockList = { p: number[]; r: number; s: number }[];
// A round in flight (a hull gun's): where it is, its velocity, how far it's flown, what it does, how far it flies before it destroys
// itself; a missile: where it is, its heading, its age
export interface SimRound { p: THREE.Vector3; v: THREE.Vector3; d: number; dmg: number; life: number; zm?: ZMem }
export interface SimMissile { id: number; p: THREE.Vector3; v: THREE.Vector3; t: number }
// her, as the battle sees her: her place, attitude and velocity (the level's frame), her size (a round's hit radius), whether she's
// docked (nothing hits her) or in the FTL tunnel
// A torpedo (js/space.ts torpFire): where it is, its velocity and attitude, its phase (0 cold launch, 1 RCS turn, 2 on the datalink,
// 3 on its own radar), its age, the fix it was sent at (fus) and where it has the target (est, ev), the side it moves off to, whose it
// is (mine: this side flies it; another's is dead-reckoned), what its seeker's locked on, its motor (thr 0..1) and RCS (rcs), its
// smoothed lateral demand (lf), its radar target (rt)
export interface SimTorp { id: number; p: THREE.Vector3; v: THREE.Vector3; q: THREE.Quaternion; ph: number; t: number; fus: string; est: THREE.Vector3; ev: THREE.Vector3; side: THREE.Vector3; mine: boolean; lock: string; rt: RTarget; thr: number; rcs: boolean; lf: THREE.Vector3; zm?: ZMem; dbg?: any }
// One of the mission ship's hull guns (js/spacedata.ts HULLGUN by kind: 'pd', 'mg', 'missile'): where it's mounted (her frame:
// the level's), whether it hangs under her keel (inv), its health, its cooldown; an mg's burst left (bt), rounds owed (acc), barrels'
// spin (rev); where it's laid (yaw, pitch: for its drawing)
export interface SimGun { k: string; x: number; y: number; z: number; inv?: boolean; hp: number; cool: number; bt?: number; acc?: number; rev?: number; yaw?: number; pitch?: number }
// A cloud of chaff: its radar target (its return blooming and fading: t.iso), when it was thrown (the simulation's time)
export interface SimChaff { t: RTarget; born: number; zm?: ZMem }
export interface SimShip { P: THREE.Vector3; Q: THREE.Quaternion; V: THREE.Vector3; size: number; docked: boolean; ftl: boolean }

import { Radar, RSuite, RTarget, RAssess } from './radar.js';

export const SpaceSim = (() => {
  const T = THREE;
  const zone = (): SimZone => ({ frame: { prev: new T.Matrix4(), cur: new T.Matrix4(), inv: new T.Matrix4(), pinv: new T.Matrix4(), turn: new T.Quaternion(), dt: 0, ok: false }, prev: { p: new T.Vector3(), m: new T.Matrix4(), t: -1 }, v: new T.Vector3() });
  const zmem = (): ZMem => ({ vz: new T.Vector3(), v: new T.Vector3(NaN, 0, 0) });
  // a new zone, or one whose placing has jumped (a new level): nothing's carried across the jump
  function zoneReset(Z: SimZone) { Z.frame.ok = false; Z.prev.t = -1; Z.v.set(0, 0, 0); }
  // the zone placed (its matrix m, its position p) at the zone's time t: its velocity, and the frame between the last placing and this
  // (a jump in the zone's clock, a quarter second or more (put right from the host, a new level) isn't the zone moving: nothing's
  // carried with it)
  const _zd = new T.Vector3(), _zq = new T.Quaternion();
  function zoneAt(Z: SimZone, t: number, p: THREE.Vector3, m: THREE.Matrix4) {
    const P = Z.prev, F = Z.frame;
    if (P.t >= 0 && t > P.t) { const v = _zd.copy(p).sub(P.p).divideScalar(t - P.t); if (v.length() < 400) Z.v.copy(v); }
    P.p.copy(p);
    F.ok = false;
    if (P.t >= 0 && t > P.t && t - P.t < 0.25) { F.prev.copy(P.m); F.cur.copy(m); F.inv.copy(m).invert(); F.pinv.copy(P.m).invert(); F.turn.setFromRotationMatrix(F.cur).multiply(_zq.setFromRotationMatrix(F.prev).invert()); F.dt = t - P.t; F.ok = true; }
    P.m.copy(m); P.t = t;
  }
  const _fa = new T.Vector3(), _zv = new T.Vector3(), _zr = new T.Quaternion();
  function fieldAt(Z: SimZone | null, p: THREE.Vector3, out = new T.Vector3()) {
    if (!Z) return out.set(0, 0, 0);
    if (!Z.frame.ok) return out.copy(Z.v);
    _fa.copy(p).applyMatrix4(Z.frame.inv).applyMatrix4(Z.frame.prev); // (where that point of the zone was a step ago)
    return out.copy(p).sub(_fa).divideScalar(Z.frame.dt);
  }
  function zstep(Z: SimZone | null, p: THREE.Vector3, v: THREE.Vector3, dt: number, m?: ZMem) {
    if (!Z || !Z.frame.ok) { p.addScaledVector(v, dt); if (m) m.v.set(NaN, 0, 0); return; }
    const F = Z.frame;
    _zr.setFromRotationMatrix(F.prev).invert();
    const vz = m && !isNaN(m.v.x) ? _zv.copy(m.vz).add(_fa.copy(v).sub(m.v).applyQuaternion(_zr)) : _zv.copy(v).sub(fieldAt(Z, p)).applyQuaternion(_zr);
    p.applyMatrix4(F.pinv).addScaledVector(vz, dt).applyMatrix4(F.cur);
    if (m) m.vz.copy(vz);
    v.copy(vz.applyQuaternion(_zr.setFromRotationMatrix(F.cur))).add(fieldAt(Z, p, _fa.clone()));
    if (m) m.v.copy(v);
  }
  // an attitude kept as it is in the zone while the level turns under it
  const zturn = (Z: SimZone | null, q: THREE.Quaternion) => { if (Z && Z.frame.ok) q.premultiply(Z.frame.turn); };
  // ---------------------------------------------------------------- the rocks
  // Each step: every rock's place in the level's frame (the zone's, moved and turned as it is), and those within ROCK_NEAR of her made
  // radar targets (a return as big as its face: ROCK_SIG of its cross-section, the same every way) and the radars' cover (Radar.occ)
  const ROCK_NEAR = 14000, ROCK_SIG = 0.25, NO_RCS = { s: new Float32Array(1), max: 0, mean: 0 };
  const rocks = (): SimRocks => ({ near: [], p: [], tg: new Map(), r: new Map(), v: new T.Vector3(), zp: new T.Vector3(), zt: -1 });
  function rocksReset(R: SimRocks) { R.near = []; R.tg.clear(); R.r.clear(); R.zt = -1; R.v.set(0, 0, 0); Radar.occ.length = 0; }
  // (zp, zq: the zone's placing; at: her place; t: the simulation's time)
  function rocksStep(R: SimRocks, list: RockList, zp: THREE.Vector3 | null, zq: THREE.Quaternion | null, at: THREE.Vector3, dt: number, t: number): RTarget[] {
    const out: RTarget[] = []; R.near = []; Radar.occ.length = 0;
    if (!zp || !zq || !list.length) return out;
    // (the zone's velocity in the level's frame: how its middle's moved since the last step)
    if (R.zt >= 0 && dt > 0) { R.v.copy(zp).sub(R.zp).divideScalar(dt); if (R.v.length() > 400) R.v.set(0, 0, 0); } R.zp.copy(zp); R.zt = t;
    list.forEach((q, k) => {
      const p = R.p[k] || (R.p[k] = new T.Vector3()); p.set(q.p[0], q.p[1], q.p[2]).applyQuaternion(zq).add(zp);
      if (p.distanceTo(at) - q.r > ROCK_NEAR) return;
      R.near.push(k);
      let tg = R.tg.get(k); if (!tg) { tg = { sz: q.r, kind: 'rock', id: 'rock' + k, p: new T.Vector3(), v: new T.Vector3(), q: new T.Quaternion(), rcs: NO_RCS, iso: ROCK_SIG * Math.PI * q.r * q.r }; R.tg.set(k, tg); R.r.set(tg.id, q.r); }
      tg.p.copy(p); tg.v.copy(R.v); out.push(tg); Radar.occ.push({ p: tg.p, r: q.r * 0.85, id: tg.id });
    });
    return out;
  }
  // how far along from a to b (0..1) the first near rock is met; 1 if none
  function rockOn(R: SimRocks, list: RockList, a: THREE.Vector3, b: THREE.Vector3) {
    let best = 1; const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z, L2 = dx * dx + dy * dy + dz * dz; if (L2 <= 0) return 1;
    for (const k of R.near) {
      const c = R.p[k], r = list[k].r * 0.9, wx = c.x - a.x, wy = c.y - a.y, wz = c.z - a.z, m = (wx * dx + wy * dy + wz * dz) / L2, e2 = wx * wx + wy * wy + wz * wz - m * m * L2;
      if (e2 >= r * r) continue; const h = Math.sqrt((r * r - e2) / L2), f = m - h; if (f >= 0 && f < best) best = f; else if (f < 0 && m + h > 0) best = 0;
    }
    return best;
  }
  // The other ships' scanners: in a crowded field (AI_NOTCH.on or more rocks inside AI_NOTCH.r of her) both put their Doppler notch on,
  // and take it off once it's thinned out (AI_NOTCH.off or fewer): so in among the rocks a ship that drifts with them is lost to their
  // search, as it is to yours. Looked at once a second. Their trackers have their own velocity gate and keep what they hold
  const AI_NOTCH = { r: 9000, on: 14, off: 7 };
  function aiNotch(R: SimRocks, list: RockList, sus: RSuite[], zp: THREE.Vector3 | null, zq: THREE.Quaternion | null, clock: { t: number }, dt: number) {
    clock.t -= dt; if (clock.t > 0) return; clock.t = 1;
    const p = new T.Vector3();
    for (const su of sus) {
      su.Vc = R.v; let n = 0;
      if (zp && zq && list.length) for (const q of list) { if (p.set(q.p[0], q.p[1], q.p[2]).applyQuaternion(zq).add(zp).distanceTo(su.P) < AI_NOTCH.r) n++; }
      for (const sc of su.scans) { if (!sc.notch && n >= AI_NOTCH.on) sc.notch = true; else if (sc.notch && n <= AI_NOTCH.off) sc.notch = false; }
    }
  }
  // ---------------------------------------------------------------- rounds and missiles
  // a round off a gun (the level's frame): along the aim, spread by the gun and by the track's own error (rng: the battle's stream).
  // Returns the round, or null (rounds: at most max in flight)
  function fireRound(rounds: SimRound[], max: number, rng: () => number, from: THREE.Vector3, aim: THREE.Vector3, H: { speed: number; spread: number; dmg: number; life: number }, err: number) {
    const g = () => Math.sqrt(-2 * Math.log(1 - rng())) * Math.cos(2 * Math.PI * rng());
    const spread = H.spread + err * 0.5, d = aim.clone().normalize(), e1 = new T.Vector3(0, 1, 0).cross(d), e2 = new T.Vector3();
    if (e1.lengthSq() < 1e-6) e1.set(1, 0, 0); e1.normalize(); e2.crossVectors(d, e1);
    d.addScaledVector(e1, g() * spread).addScaledVector(e2, g() * spread).normalize(); // (normal each way square to the aim)
    if (rounds.length >= max) return null;
    const q: SimRound = { p: from.clone(), v: d.multiplyScalar(H.speed), d: 0, dmg: H.dmg, life: H.life * Math.max(0.88, Math.min(1.12, 1 + g() * 0.04)) }; // (its self-destruct a little different round to round: some 200 m either way at 5 km, not a wall)
    rounds.push(q); return q;
  }
  // the rounds in flight a step: each moves (through the zone), and hits her if it passes within her size of her middle this step
  // (both moving); one into a rock is gone; one that's flown its life destroys itself. torp(a, b): whether it met a torpedo on the way
  // (and that torpedo's done). Returns what she took (hits, damage) and where rounds ended (burst: self-destructed; rock: into a rock)
  function roundsStep(Z: SimZone | null, rounds: SimRound[], ship: SimShip, R: SimRocks, list: RockList, dt: number, torp: ((a: THREE.Vector3, b: THREE.Vector3) => boolean) | null) {
    const out = { hits: 0, dmg: 0, burst: [] as THREE.Vector3[], rock: [] as THREE.Vector3[] };
    if (!rounds.length) return out;
    const c1 = ship.P.clone().add(new T.Vector3(0, 1.5, 0)), c0 = c1.clone().addScaledVector(ship.V, -dt), Rh = Math.max(4, ship.size * 0.6);
    const r0 = new T.Vector3(), r1 = new T.Vector3(), seg = new T.Vector3();
    for (let i = rounds.length - 1; i >= 0; i--) {
      const q = rounds[i], step = q.v.length() * dt, qa = torp ? q.p.clone() : null;
      r0.copy(q.p).sub(c0); zstep(Z, q.p, q.v, dt, q.zm || (q.zm = zmem())); q.d += step; r1.copy(q.p).sub(c1);
      if (qa && torp && torp(qa, q.p)) { rounds.splice(i, 1); continue; }
      if (R.near.length && rockOn(R, list, q.p.clone().addScaledVector(q.v, -dt), q.p) < 1) { rounds.splice(i, 1); out.rock.push(q.p); continue; }
      seg.subVectors(r1, r0); const L2 = seg.lengthSq(), t = L2 > 0 ? Math.max(0, Math.min(1, -r0.dot(seg) / L2)) : 0, miss = r0.addScaledVector(seg, t).length();
      const hit = !ship.docked && miss < Rh, gone = hit || q.d >= q.life;
      if (hit) { out.hits++; out.dmg += q.dmg; }
      if (gone) { rounds.splice(i, 1); if (!hit) out.burst.push(q.p); }
    }
    return out;
  }
  // the missiles a step: each turns toward her no faster than it can (a hard turn across its nose leaves it behind), and flies on;
  // returns those that reached her (inside 9 m) and those gone otherwise (spent, into a rock, she's docked or jumped), each taken out
  function missilesStep(mis: SimMissile[], ship: SimShip, R: SimRocks, list: RockList, H: { speed: number; turn: number; life: number }, dt: number) {
    const out = { hit: [] as SimMissile[], gone: [] as SimMissile[] };
    for (let i = mis.length - 1; i >= 0; i--) {
      const m = mis[i], to = ship.P.clone().add(new T.Vector3(0, 1.4, 0)).sub(m.p), d = to.length();
      m.t += dt;
      const want = to.normalize(), ang = m.v.angleTo(want), k = ang > 1e-4 ? Math.min(1, H.turn * dt / ang) : 1;
      m.v.lerp(want, m.t < 1.2 ? k * 0.4 : k).normalize();
      m.p.addScaledVector(m.v, H.speed * (m.t < 1.2 ? 0.45 : 1) * dt);
      const gone = m.t > H.life || ship.docked || ship.ftl || (R.near.length > 0 && rockOn(R, list, m.p.clone().addScaledVector(m.v, -H.speed * dt), m.p) < 1);
      if (d < 9) { mis.splice(i, 1); out.hit.push(m); } else if (gone) { mis.splice(i, 1); out.gone.push(m); }
    }
    return out;
  }
  // ---------------------------------------------------------------- torpedoes
  // One tube under her keel. A cold launch: pushed out of the tube downward at eject and coasting clear (cold); then its RCS thrusters
  // move it off to the side away from her and turn its nose onto the target; then its main motor lights. It flies on her sensors'
  // picture of the target (the fix it was sent at: a datalink), dead reckoning when she loses it, till it's within seek; then on its
  // own radar (seekStep). Proportional navigation (N), the motor (burn, m/s²) along its nose only, the RCS (rcsA) across it
  const TORP = { loads: Infinity, eject: 7, cold: 1.1, rcsA: 7, turn: 1.1, turn2: 1.6, off: 0.6, turnT: 3, offT: 1.3, blast: 15, burn: 150, vc: 700, N: 4, seek: 2000, cone: 0.35, dop: 80, gate: 300, life: 90, r: 3, send: 0.1 };
  // its own radar: the strongest return inside its cone and range gate, closing at about the rate the target's expected to (chaff,
  // falling behind, isn't), not behind a rock
  function seekStep(tp: SimTorp, tg: RTarget[]): RTarget | null {
    const to = tp.est.clone().sub(tp.p), R = to.length(); if (R < 1) return null; to.divideScalar(R);
    let best: RTarget | null = null, bs = 0;
    for (const t of tg) {
      if (t.id === 'own' || t.id.startsWith('torp')) continue;
      const d = t.p.clone().sub(tp.p), r = d.length(); if (r < 1 || Math.abs(r - R) > TORP.gate || d.divideScalar(r).dot(to) < Math.cos(TORP.cone)) continue;
      if (Math.abs(t.v.clone().sub(tp.v).dot(d) - tp.ev.clone().sub(tp.v).dot(to)) > TORP.dop) continue;
      if (Radar.blocked(tp.p, t.p, t.id)) continue;
      const s = (t.iso != null ? t.iso : Radar.rcsToward(t, tp.p)) / (r * r * r * r); if (s > bs) { bs = s; best = t; }
    }
    return best;
  }
  // has it met something (its proximity fuse): a hull by her box (hb: the mission ship's footprint), a ship by her size, anything small
  // within a few metres (rocks by their radius)
  function torpFuse(tp: SimTorp, p0: THREE.Vector3, tg: RTarget[], hb: { x0: number; x1: number; z0: number; z1: number } | null, R: SimRocks): RTarget | null {
    for (const t of tg) {
      if (t.id === 'own' || t.id.startsWith('torp')) continue;
      if (t.id === 'hull' && hb) { const y = t.p.y, x = tp.p.x, z = tp.p.z; if (x > hb.x0 - 4 && x < hb.x1 + 4 && z > hb.z0 - 4 && z < hb.z1 + 4 && Math.abs(tp.p.y - y) < 25) return t; continue; }
      const Rr = t.id.startsWith('trf') ? 30 : t.id.startsWith('rock') ? (R.r.get(t.id) || 30) : 7, seg = tp.p.clone().sub(p0), w = t.p.clone().sub(p0), L2 = seg.lengthSq(), k = L2 > 0 ? Math.max(0, Math.min(1, w.dot(seg) / L2)) : 0;
      if (w.addScaledVector(seg, -k).length() < Rr) return t;
    }
    return null;
  }
  // a torpedo a step. Another side's: on as it goes (put right by its owner's word). This side's: guided (fix: where her sensors have
  // the target it was sent at now, or null), moved, its fuse tried. Returns what it hit, 'spent' (flown its life), or null
  function torpStep(Z: SimZone | null, tp: SimTorp, dt: number, c: { tg: RTarget[]; fix: { pl: THREE.Vector3; v: THREE.Vector3 } | null; shipP: THREE.Vector3; shipQ: THREE.Quaternion; hb: { x0: number; x1: number; z0: number; z1: number } | null; R: SimRocks }): RTarget | 'spent' | null {
    tp.t += dt; const p0 = tp.p.clone();
    if (!tp.mine) { zstep(Z, tp.p, tp.v, dt, tp.zm || (tp.zm = zmem())); return null; }
    if (c.fix) { tp.est.copy(c.fix.pl); tp.ev.copy(c.fix.v); } else tp.est.addScaledVector(tp.ev, dt);
    if (tp.est.distanceTo(tp.p) < TORP.seek && tp.ph >= 2) { const sk = seekStep(tp, c.tg); if (sk) { tp.est.copy(sk.p); tp.ev.copy(sk.v); tp.lock = sk.id; tp.ph = 3; } }
    const rel = tp.est.clone().sub(tp.p), R = rel.length(), u = rel.clone().divideScalar(Math.max(1, R)), vrel = tp.ev.clone().sub(tp.v), vc = -vrel.dot(u);
    const nose = new T.Vector3(0, 0, -1).applyQuaternion(tp.q);
    if (tp.ph === 0 && tp.t > TORP.cold) {
      tp.ph = 1; const sf = new T.Vector3(0, 0, -1).applyQuaternion(c.shipQ); tp.side.copy(u).addScaledVector(sf, -u.dot(sf)); if (tp.side.lengthSq() < 0.01) tp.side.set(1, 0, 0).applyQuaternion(c.shipQ); tp.side.normalize(); // (off to the side of her path, the target's side)
    }
    const acc = new T.Vector3();
    if (tp.ph === 1) {
      acc.copy(tp.side).multiplyScalar(TORP.rcsA); tp.rcs = true; tp.thr = 0;
      const aim = u, ang = nose.angleTo(aim); if (ang > 1e-3) { const k = Math.min(1, TORP.turn * dt / ang); tp.q.slerp(new T.Quaternion().setFromUnitVectors(new T.Vector3(0, 0, -1), nose.clone().lerp(aim, k).normalize()), 1); }
      if ((ang < 0.1 && tp.t > TORP.cold + 1.2 && tp.p.distanceTo(c.shipP) > 35) || tp.t > TORP.cold + 6) tp.ph = 2;
    } else if (tp.ph >= 2) {
      // proportional navigation: across the line of sight, N times the closing speed times its turning rate (smoothed: the fix it's
      // flying on jitters); the motor when it's closing too slowly or the turn's more than the RCS can push, its nose at the angle
      // off the line of sight that gives the turn asked for; otherwise the motor's off, the nose on the target, the RCS across
      const om = rel.clone().cross(vrel).divideScalar(Math.max(1, R * R)), lat = om.clone().cross(u).multiplyScalar(TORP.N * Math.max(vc, 50));
      if (lat.length() > TORP.burn) lat.setLength(TORP.burn);
      tp.lf.lerp(lat, 1 - Math.exp(-dt * (tp.ph === 3 ? 8 : 3))); lat.copy(tp.lf);
      const latN = lat.length(), needLat = latN > TORP.rcsA * (tp.ph === 3 ? 1 : 2), main0 = needLat || vc < TORP.vc;
      const want = main0 ? lat.clone().addScaledVector(u, Math.sqrt(Math.max(0, TORP.burn * TORP.burn - latN * latN))) : lat.clone();
      const main = main0, aim = main ? want.clone().normalize() : u.clone();
      { const lim = tp.ph === 3 ? TORP.offT : TORP.off, off = aim.angleTo(u); if (off > lim) { const ax = u.clone().cross(aim); if (ax.lengthSq() > 1e-8) aim.copy(u).applyAxisAngle(ax.normalize(), lim); } }
      const ang = nose.angleTo(aim);
      if (ang > 1e-4) { const ax = nose.clone().cross(aim); if (ax.lengthSq() < 1e-8) ax.set(1, 0, 0).applyQuaternion(tp.q); tp.q.premultiply(new T.Quaternion().setFromAxisAngle(ax.normalize(), Math.min(ang, (tp.ph === 3 ? TORP.turnT : TORP.turn2) * dt))); }
      const n2 = new T.Vector3(0, 0, -1).applyQuaternion(tp.q), push = main && n2.angleTo(aim) < 0.35 ? Math.max(0, Math.min(TORP.burn, want.dot(n2))) : 0;
      acc.copy(n2).multiplyScalar(push);
      const rest = want.clone().addScaledVector(n2, -push); rest.addScaledVector(n2, -rest.dot(n2)); if (rest.length() > TORP.rcsA) rest.setLength(TORP.rcsA); acc.add(rest);
      tp.thr = push / TORP.burn; tp.rcs = ang > 0.03 || rest.length() > 1.5;
      tp.dbg = { R, vc, om: om.length(), raw: om.clone().cross(u).multiplyScalar(TORP.N * Math.max(vc, 50)).length(), lat: lat.length(), got: acc.clone().addScaledVector(u, -acc.dot(u)).length(), nose: n2.angleTo(u), ph: tp.ph }; // (the debug's: the turn asked for (raw, and smoothed: lat) against what it got across its line of sight)
    }
    tp.v.addScaledVector(acc, dt); zstep(Z, tp.p, tp.v, dt, tp.zm || (tp.zm = zmem()));
    if (tp.ph >= 2) { const hit = torpFuse(tp, p0, c.tg, c.hb, c.R); if (hit) return hit; }
    if (tp.t > TORP.life) return 'spent';
    return null;
  }
  // a round's step a..b meeting a torpedo of this side's (both moving): returns the torpedo it met
  function roundMeetsTorp(torps: SimTorp[], a: THREE.Vector3, b: THREE.Vector3, dt: number): SimTorp | null {
    for (const tp of torps) {
      if (!tp.mine) continue;
      const c1 = tp.p, c0 = tp.p.clone().addScaledVector(tp.v, -dt), r0 = a.clone().sub(c0), seg = b.clone().sub(c1).sub(r0), L2 = seg.lengthSq(), k = L2 > 0 ? Math.max(0, Math.min(1, -r0.dot(seg) / L2)) : 0;
      if (r0.addScaledVector(seg, k).length() < TORP.r) return tp;
    }
    return null;
  }
  const torpTargets = (torps: SimTorp[]) => torps.map((tp) => { tp.rt.v.copy(tp.v); tp.rt.p.copy(tp.p); tp.rt.q.copy(tp.q); return tp.rt; });
  // ---------------------------------------------------------------- the hull guns
  // A step of her guns: on her most urgent track (lk: its solution, its angle error; urgent: reaching her inside 4 s, no pause
  // between bursts), or idle (lk null: the barrels spin down). Point defence: single shots; miniguns: bursts; missile launchers:
  // a launch (launch(gun)). A gun shoots only inside its range and on its own side of her hull (ten degrees past it, the hull's in
  // the way). A weapon coming at her on a collision course (closing faster than any ship flies, hardly moving across her line of
  // sight) is led along the line of sight only (across it the solution's mostly its own noise), and aimed at its point, not above it
  // (her own place and velocity: P, V). fire(from, aim, H, err): a round (fireRound); rng: the battle's stream
  function gunsStep(guns: SimGun[], lk: { est: { p: THREE.Vector3; v: THREE.Vector3 }; err?: number } | null, urgent: boolean, P: THREE.Vector3, V: THREE.Vector3, HG: Record<string, any>, rng: () => number, dt: number, fire: (from: THREE.Vector3, aim: THREE.Vector3, H: any, err: number) => void, launch: (gn: SimGun) => void) {
    if (!lk) { for (const gn of guns) gn.rev = Math.max(0, (gn.rev || 0) - dt); return; }
    const los = lk.est.p.clone().sub(P), lr = los.length(); los.divideScalar(lr || 1);
    const rv = lk.est.v.clone().sub(V), vcl = -rv.dot(los), vlat = rv.clone().addScaledVector(los, vcl).length();
    const head = vcl > 250 && vlat < 0.15 * vcl, vAim = head ? V.clone().addScaledVector(los, -vcl) : lk.est.v;
    const up = new T.Vector3(0, head ? 0 : 1.5, 0);
    for (const gn of guns) {
      if (gn.hp <= 0) continue;
      const H = HG[gn.k], from = new T.Vector3(gn.x, gn.y, gn.z), to = lk.est.p.clone().add(up).sub(from), dist = to.length();
      gn.rev = Math.max(0, (gn.rev || 0) - dt);
      if (dist > H.range) { gn.bt = 0; continue; }
      const up1 = gn.inv ? -1 : 1; // (a gun under her keel hangs upside down: its up is her down)
      if (gn.k !== 'missile' && up1 * to.y / dist < -0.17) { gn.bt = 0; continue; }
      const tof = gn.k === 'missile' ? 0 : dist / H.speed, aim = lk.est.p.clone().addScaledVector(vAim, tof).add(up).sub(from); // (where the track says it'll be when the round gets there)
      if (gn.k !== 'missile') { const ad = aim.length(); gn.yaw = Math.atan2(-aim.x, -aim.z); gn.pitch = Math.asin(Math.max(-0.2, Math.min(1, up1 * aim.y / ad))); }
      if (gn.k === 'mg') {
        if ((gn.bt || 0) > 0) {
          gn.bt! -= dt; gn.rev = 1.5; gn.acc = (gn.acc || 0) + H.rps * dt;
          while (gn.acc >= 1) { gn.acc -= 1; fire(from, aim, H, lk.err || 0); }
          if (gn.bt! <= 0) gn.cool = H.pause[0] + rng() * (H.pause[1] - H.pause[0]);
          continue;
        }
        gn.cool -= dt; if (urgent) gn.cool = Math.min(gn.cool, 0); if (gn.cool <= 0) { gn.bt = H.burst[0] + rng() * (H.burst[1] - H.burst[0]); gn.acc = 0; }
        continue;
      }
      gn.cool -= dt;
      if (gn.cool > 0) continue;
      gn.cool = H.cool[0] + rng() * (H.cool[1] - H.cool[0]);
      if (gn.k === 'missile') { launch(gn); continue; }
      fire(from, aim, H, lk.err || 0);
    }
  }
  // ---------------------------------------------------------------- her fire control (the mission ship's)
  // She doesn't know which contact is what: her radars' threat assessment decides what's hostile. What it holds HOSTILE, painted
  // lately, the most urgent (what reaches her soonest: its range over its closing speed; what isn't closing, after, nearest first)
  // is asked for: a track of it kept by her scheduler, a threat (pri 2: never left waiting, a dish taken off anything else for it)
  // if it reaches her inside FC_URG s, else a hostile she watches (pri 1). A threat that's no longer one goes back to being watched.
  // And she doesn't keep tracking what isn't hostile (a ship's tracking radar on another is taken as hostility): a track of what her
  // assessment no longer holds HOSTILE or SUSPECT (it turned away; it's chaff it was drawn onto) is let go. Unmanned (nobody at her
  // gun control, counting down to blowing herself apart): her trackers dropped and her scheduler emptied.
  // Returns what she's after (for the debug view), or null
  const FC_URG = 12, TTI_FAR = 1e6;
  const tti = (r: number, vc: number) => (vc > 10 ? r / vc : TTI_FAR + r);
  // how soon a track reaches her (her own suite su): its range over its closing speed (not tracking: never; no place yet: its range)
  const trkUrg = (su: RSuite, t: { st?: string; est: { p: THREE.Vector3 | null; v: THREE.Vector3 }; rng?: number }) => { if (t.st !== 'track') return Infinity; if (!t.est.p) return tti(t.rng || 0, 0); const rel = t.est.p.clone().sub(su.P), r = rel.length(); return tti(r, -t.est.v.clone().sub(su.V).dot(rel) / Math.max(1, r)); };
  function fireControl(su: RSuite, manned: boolean, now: number) {
    if (!manned) { for (const t of su.trks) { if (t.st !== 'idle') Radar.drop(t); t.job = null; } const S0 = Radar.sched(su); S0.tts.length = 0; S0.reqs.length = 0; S0.plan.clear(); return null; }
    let bq = null as null | RAssess, bu = Infinity;
    for (const q of su.ass) if (q.cls === 'HOSTILE' && q.plot && now - q.plot.t < 3.5) { const u = tti(q.r, q.vc); if (u < bu) { bu = u; bq = q; } }
    const S0 = Radar.sched(su), on = !!bq && S0.tts.some((q) => q.est.p.distanceTo(bq!.f ? bq!.f.pl : q.est.p) < Math.max(150, 0.05 * bq!.r) && q.looks > 0);
    if (bq) Radar.want(su, { f: bq.f || null, plot: bq.plot || null, pri: bu < FC_URG ? 2 : 1, rate: bu < FC_URG ? 4 : 1.5, fc: bu }, now);
    for (const q of S0.tts) if (q.fc != null && q.pri === 2 && trkUrg(su, q) > FC_URG * 1.5) { q.pri = 1; q.rate = 1.5; }
    for (const q of S0.tts.slice()) {
      if (q.looks < 2) continue; const f = su.fus.find((x) => x.pl.distanceTo(q.est.p) < Math.max(150, 4 * q.kf.sig())), a = f && su.ass.find((x) => x.f === f);
      if (a && a.cls !== 'HOSTILE' && a.cls !== 'SUSPECT') Radar.lose(su, q);
    }
    return bq ? { n: bq.n, r: Math.round(bq.r), vc: Math.round(bq.vc), u: Math.round(bu), id: bq.plot!.id, on } : null;
  }
  // ---------------------------------------------------------------- chaff
  // Thrown up and back from her (thrown: its place and velocity, as chaffThrow gives them), it blooms to sig m² in bloom s, holds, then
  // fades, and is gone at life (its age alone). n: its number (its target's id)
  const CHAFF = { loads: 12, sig: 250, bloom: 0.5, hold: 5, fade: 2.5, life: 10, v: 22 };
  function chaffThrow(ship: SimShip, rng: () => number) {
    const up = new T.Vector3(0, 1, 0).applyQuaternion(ship.Q), back = new T.Vector3(0, 0, 1).applyQuaternion(ship.Q), side = new T.Vector3(rng() - 0.5, 0, 0).applyQuaternion(ship.Q);
    const p = ship.P.clone().addScaledVector(up, 2).addScaledVector(back, 3), v = ship.V.clone().addScaledVector(up.multiplyScalar(0.6).add(back.multiplyScalar(0.8)).add(side).normalize(), CHAFF.v);
    return [p.x, p.y, p.z, v.x, v.y, v.z].map((x) => Math.round(x * 100) / 100);
  }
  function chaffNew(a: number[], n: number, now: number): SimChaff {
    return { t: { sz: 25, kind: 'chaff', id: 'chaff' + n, p: new T.Vector3(a[0], a[1], a[2]), v: new T.Vector3(a[3], a[4], a[5]), q: new T.Quaternion(), rcs: { s: new Float32Array(1), max: 0, mean: 0 }, iso: 0 }, born: now };
  }
  // a step of the clouds: each drifts (through the zone) and blooms or fades; returns those gone (taken out)
  function chaffStep(Z: SimZone | null, list: SimChaff[], now: number, dt: number) {
    const gone: SimChaff[] = [];
    for (let i = list.length - 1; i >= 0; i--) {
      const c = list[i], age = now - c.born;
      if (age > CHAFF.life) { list.splice(i, 1); gone.push(c); continue; }
      zstep(Z, c.t.p, c.t.v, dt, c.zm || (c.zm = zmem()));
      c.t.iso = CHAFF.sig * chaffK(age);
    }
    return gone;
  }
  const chaffK = (age: number) => (1 - Math.exp(-age / CHAFF.bloom)) * (age > CHAFF.hold ? Math.exp(-(age - CHAFF.hold) / CHAFF.fade) : 1); // (how bloomed it is, 0..1)
  return { CHAFF, chaffThrow, chaffNew, chaffStep, chaffK, FC_URG, tti, trkUrg, fireControl, gunsStep, zone, zmem, zoneReset, zoneAt, fieldAt, zstep, zturn, rocks, rocksReset, rocksStep, rockOn, aiNotch, ROCK_NEAR, fireRound, roundsStep, missilesStep, TORP, seekStep, torpFuse, torpStep, roundMeetsTorp, torpTargets };
})();
