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
export interface SimShip { P: THREE.Vector3; Q: THREE.Quaternion; V: THREE.Vector3; size: number; docked: boolean; ftl: boolean }

import { Radar, RSuite, RTarget } from './radar.js';

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
  return { zone, zmem, zoneReset, zoneAt, fieldAt, zstep, zturn, rocks, rocksReset, rocksStep, rockOn, aiNotch, ROCK_NEAR, fireRound, roundsStep, missilesStep };
})();
