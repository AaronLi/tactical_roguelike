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
  return { zone, zmem, zoneReset, zoneAt, fieldAt, zstep, zturn };
})();
