'use strict';
// Radar: how ships find each other in space (docs/space.md "Radar"). Every ship carries the same set:
//   - two SCANNING radars, mechanically steered pulse radars: a fan beam narrow one way and wide the other, swept round and round.
//     'y' turns about her own up axis (the fan stands upright: it gives a contact's bearing and range, not its height); 'x' turns
//     about her own beam (athwartships) axis (the fan lies across her: it gives the angle up or down from ahead, not which side).
//     Each pass over a target is one look: a pulse train whose return is weighed against the noise (the radar equation, below), and a
//     detection is a PLOT: the angle the fan was at and the range, never the angle along the fan.
//   - two TRACKING radars, pencil beams on turrets, one each side. Cued by a plot, a tracker slews to the plot's fan, sweeps along it
//     (the angle the scanner couldn't give) with its range gate at the plot's range, and stops on the strongest return; then it
//     TRACKS it by CONICAL SCAN: the beam nutates in a small circle round its boresight, and the return, stronger on the side the
//     target is, says which way and how far off the boresight it is (demodulated over the circle); the servo drives the boresight
//     onto it. A target out of the beam, or out of its side's half of the sky, is lost. A track gives a firing solution: where she
//     is and how fast she's going (an alpha-beta filter on the measured positions), and how good that is.
// What a ship sends back (RCS, radar cross-section) depends on how she's turned to the radar: computed from her own drawing (rcsOf):
// every face's area, binned by the way it faces; a face square to the radar sends back a strong specular return, one angled away
// almost none. So a ship nose-on with an angled bow is seen at a fraction of the range her flank is.
// The radar equation: the signal over the noise goes as sigma / R^4, so the range she's detected at goes as sigma^(1/4): a radar
// detects a 10 m2 target at R0 (its own figure) with the detection threshold's signal; a hundredth of that at a third of the range.
// Everything here is in the level's frame (the ship the mission's on is the level: js/space.ts), a ship's own frame being her
// group's (forward -z, up +y, starboard +x).
export interface RcsTable { s: Float32Array; max: number; mean: number }
export interface RTarget { id: string; p: THREE.Vector3; v: THREE.Vector3; q: THREE.Quaternion; rcs: RcsTable }
export interface RPlot { k: number; phi: number; r: number; t: number; db: number; id: string; e: number; q?: THREE.Quaternion } // (q: how she was turned when it was made)
export interface RScan { ax: 'y' | 'x'; th: number; rate: number; bw: number; fan: number; R0: number; plots: RPlot[]; at: THREE.Vector3 }
export interface RTrack {
  side: number; at: THREE.Vector3; b: THREE.Vector3; a: THREE.Vector3; st: 'idle' | 'slew' | 'acq' | 'track';
  cue: { k: number; ax: 'y' | 'x'; phi: number; r: number; q: THREE.Quaternion } | null; sw: number; best: { db: number; b: THREE.Vector3 }; ph: number;
  tgt: string | null; lockT: number; lost: number; err: number; db: number; rng: number; est: { p: THREE.Vector3 | null; v: THREE.Vector3; q: number };
  hand: { p: THREE.Vector3; v: THREE.Vector3; t: number } | null; // (handed a track by the other tracker: where its solution has the target, slewed to straight)
  dE: THREE.Vector3; dA: number; dP: number; w: THREE.Vector3; // (the conical scan's demodulator over the revolution under way, and the boresight's rate)
}
export interface RSuite { id: string; P: THREE.Vector3; Q: THREE.Quaternion; V: THREE.Vector3; scans: RScan[]; trks: RTrack[]; size: number; Pp: THREE.Vector3; Qp: THREE.Quaternion; init: boolean; dbg?: any } // (Pp, Qp: where she was and how she was turned at the last step)

export const Radar = (() => {
  const T = THREE, D2R = Math.PI / 180, TAU = Math.PI * 2;
  // ---------------------------------------------------------------- what a ship sends back
  const NAZ = 72, NEL = 37;                 // the table: 5 degrees a step round her (azimuth, from her nose to starboard) and up (elevation)
  const KS = 3, KP = 40, KD = 0.05;         // a face's return: KS a^2-ish specular (cos^KP: a lobe some 10 degrees across) and KD diffuse
  const cache = new Map<string, RcsTable>();
  const azOf = (x: number, z: number) => Math.atan2(x, -z);
  // her table, made once a drawing (key): every triangle's area into a grid of the ways faces point (64 x 32), and then, for each
  // way a radar can see her from, the sum over that grid (occlusion isn't counted: her far side faces away and sends nothing)
  function rcsOf(key: string, root: THREE.Object3D, toLocal: THREE.Matrix4): RcsTable {
    const had = cache.get(key); if (had) return had;
    const HA = 64, HE = 32, area = new Float32Array(HA * HE), nx = new Float32Array(HA * HE), ny = new Float32Array(HA * HE), nz = new Float32Array(HA * HE);
    const m = new T.Matrix4(), a = new T.Vector3(), b = new T.Vector3(), c = new T.Vector3(), n = new T.Vector3();
    root.updateMatrixWorld(true);
    root.traverse((o: any) => {
      if (!o.isMesh || !o.geometry || !o.geometry.attributes.position) return;
      const mat = Array.isArray(o.material) ? o.material[0] : o.material;
      if (mat && (mat.transparent || mat.isMeshBasicMaterial)) return; // (glows, films, screens, flames: not plating)
      m.multiplyMatrices(toLocal, o.matrixWorld);
      const pos = o.geometry.attributes.position, idx = o.geometry.index, nt = (idx ? idx.count : pos.count) / 3;
      for (let t = 0; t < nt; t++) {
        const i0 = idx ? idx.getX(t * 3) : t * 3, i1 = idx ? idx.getX(t * 3 + 1) : t * 3 + 1, i2 = idx ? idx.getX(t * 3 + 2) : t * 3 + 2;
        a.fromBufferAttribute(pos, i0).applyMatrix4(m); b.fromBufferAttribute(pos, i1).applyMatrix4(m); c.fromBufferAttribute(pos, i2).applyMatrix4(m);
        n.subVectors(b, a).cross(c.sub(a)); const A = n.length() / 2; if (A < 1e-6) continue; n.multiplyScalar(0.5 / A);
        const ia = Math.min(HA - 1, Math.floor(((azOf(n.x, n.z) / TAU) + 1) % 1 * HA)), ie = Math.min(HE - 1, Math.floor((Math.asin(Math.max(-1, Math.min(1, n.y))) / Math.PI + 0.5) * HE)), k = ie * HA + ia;
        area[k] += A; nx[k] += A * n.x; ny[k] += A * n.y; nz[k] += A * n.z;
      }
    });
    const bins: number[][] = [];
    for (let k = 0; k < HA * HE; k++) if (area[k] > 0) { const l = Math.hypot(nx[k], ny[k], nz[k]) || 1; bins.push([area[k], nx[k] / l, ny[k] / l, nz[k] / l]); }
    const s = new Float32Array(NAZ * NEL); let max = 0, sum = 0;
    for (let j = 0; j < NEL; j++) {
      const el = (j / (NEL - 1) - 0.5) * Math.PI, ce = Math.cos(el), uy = Math.sin(el);
      for (let i = 0; i < NAZ; i++) {
        const az = i / NAZ * TAU, ux = Math.sin(az) * ce, uz = -Math.cos(az) * ce;
        let sig = 0;
        for (const q of bins) { const d = q[1] * ux + q[2] * uy + q[3] * uz; if (d > 0) sig += q[0] * (KS * Math.pow(d, KP) + KD * d); }
        s[j * NAZ + i] = sig; if (sig > max) max = sig; sum += sig * ce;
      }
    }
    let wsum = 0; for (let j = 0; j < NEL; j++) wsum += Math.cos((j / (NEL - 1) - 0.5) * Math.PI) * NAZ;
    const r = { s, max, mean: sum / wsum }; cache.set(key, r); return r;
  }
  // her return seen from u (a unit vector in her own frame, from her toward the radar), between the table's steps
  function rcsAt(r: RcsTable, u: THREE.Vector3) {
    const fi = ((azOf(u.x, u.z) / TAU) + 1) % 1 * NAZ, fj = (Math.asin(Math.max(-1, Math.min(1, u.y))) / Math.PI + 0.5) * (NEL - 1);
    const i0 = Math.floor(fi) % NAZ, i1 = (i0 + 1) % NAZ, j0 = Math.min(NEL - 2, Math.floor(fj)), di = fi - Math.floor(fi), dj = fj - j0, s = r.s;
    return (s[j0 * NAZ + i0] * (1 - di) + s[j0 * NAZ + i1] * di) * (1 - dj) + (s[(j0 + 1) * NAZ + i0] * (1 - di) + s[(j0 + 1) * NAZ + i1] * di) * dj;
  }
  // ---------------------------------------------------------------- the radar equation
  const THR = 13, SIG0 = 10;                // the detection threshold (dB over the noise), and the 10 m2 a radar's R0 is quoted for
  const snrDb = (R0: number, sig: number, R: number) => THR + 10 * Math.log10(Math.max(1e-6, sig) / SIG0) + 40 * Math.log10(R0 / Math.max(1, R));
  const pd = (db: number) => 1 / (1 + Math.exp(-(db - THR) / 1.6)); // (the chance a look at that signal is a detection)
  const detRange = (R0: number, sig: number) => R0 * Math.pow(Math.max(1e-6, sig) / SIG0, 0.25); // (where it's even odds)
  const gauss = () => { let u = 0, v = 0; while (u === 0) u = Math.random(); while (v === 0) v = Math.random(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(TAU * v); };
  // ---------------------------------------------------------------- the radars
  const SCAN = { rate: TAU / 3, bw: 2 * D2R, fan: 45 * D2R, R0: 6000 }; // (a turn every 3 s; 2 degrees by 90)
  const TRK = { bw: 3 * D2R, sq: 1 * D2R, hz: 6, slew: 75 * D2R, stab: 200 * D2R, acq: 60 * D2R, R0: 9000, gate: 0.06 }; // (conical scan at 6 Hz: slow enough to see in the debug view; stab: how fast the turret can turn to hold its beam still while she turns under it)
  const AG = 4 * Math.LN2 / (TRK.bw * TRK.bw); // (the beam's shape: exp(-AG theta^2), half power at bw/2)
  // a ship's set: scanners on her top amidships, trackers each side; size her half length (where they're mounted, and how far the
  // debug view draws things for her)
  function suite(id: string, size: number, top = size * 0.25, beam = size * 0.3): RSuite {
    const scans: RScan[] = (['y', 'x'] as const).map((ax, i) => ({ ax, th: i * Math.PI, rate: SCAN.rate * (ax === 'x' ? 1.07 : 1), bw: SCAN.bw, fan: SCAN.fan, R0: SCAN.R0, plots: [], at: new T.Vector3(0, top, ax === 'y' ? -size * 0.1 : size * 0.1) }));
    const trks: RTrack[] = [1, -1].map((side) => ({ side, at: new T.Vector3(side * beam, top * 0.8, 0), b: new T.Vector3(side, 0, 0), a: new T.Vector3(side, 0, 0), st: 'idle', cue: null, sw: 0, best: { db: -99, b: new T.Vector3() }, ph: 0, tgt: null, lockT: 0, lost: 0, err: 0, db: -99, rng: 0, est: { p: null, v: new T.Vector3(), q: 0 }, hand: null, dE: new T.Vector3(), dA: 0, dP: 0, w: new T.Vector3() }));
    return { id, P: new T.Vector3(), Q: new T.Quaternion(), V: new T.Vector3(), scans, trks, size, Pp: new T.Vector3(), Qp: new T.Quaternion(), init: false };
  }
  // a way out of the radar along a fan: ax its turning axis, phi how far round it's turned, e how far along the fan (her own frame)
  const dirOf = (ax: 'y' | 'x', phi: number, e: number, out = new T.Vector3()) => ax === 'y' ? out.set(Math.sin(phi) * Math.cos(e), Math.sin(e), -Math.cos(phi) * Math.cos(e)) : out.set(Math.sin(e), Math.sin(phi) * Math.cos(e), -Math.cos(phi) * Math.cos(e));
  const angOf = (ax: 'y' | 'x', d: THREE.Vector3) => ax === 'y' ? [azOf(d.x, d.z), Math.asin(Math.max(-1, Math.min(1, d.y)))] : [Math.atan2(d.y, -d.z), Math.asin(Math.max(-1, Math.min(1, d.x)))];
  const _v = new T.Vector3(), _w = new T.Vector3(), _q = new T.Quaternion();
  // where a target is from a mount of hers: the way (her frame), the range, and the target's return toward it
  function look(su: RSuite, at: THREE.Vector3, t: RTarget, dir: THREE.Vector3) {
    const from = _w.copy(at).applyQuaternion(su.Q).add(su.P);
    dir.copy(t.p).sub(from); const R = dir.length(); dir.divideScalar(R || 1);
    const u = _v.copy(dir).negate().applyQuaternion(_q.copy(t.q).invert()); // (from her toward the radar, in her frame)
    const sig = rcsAt(t.rcs, u);
    dir.applyQuaternion(_q.copy(su.Q).invert());
    return { R, sig };
  }
  const wrap = (a: number) => ((a % TAU) + TAU) % TAU;
  function step(su: RSuite, dt: number, targets: RTarget[], now: number) {
    const d = new T.Vector3();
    if (!su.init) { su.Pp.copy(su.P); su.Qp.copy(su.Q); su.init = true; }
    for (const tr of su.trks) if (tr.st === 'track') stabilise(su, tr, dt);
    // the scanners: each target the fan swept over this frame is looked at once
    su.scans.forEach((sc, k) => {
      const th0 = sc.th, sweep = sc.rate * dt; sc.th = wrap(sc.th + sweep);
      for (const t of targets) {
        if (t.id === su.id) continue;
        const { R, sig } = look(su, sc.at, t, d), [phi, e] = angOf(sc.ax, d);
        if (Math.abs(e) > sc.fan || wrap(phi - th0 + sc.bw / 2) > sweep + sc.bw) continue;
        const db = snrDb(sc.R0, sig, R) - 12 * (e / sc.fan) ** 2 + gauss() * 1.5; // (the fan's gain falls off toward its ends)
        if (Math.random() < pd(db)) sc.plots.push({ k, phi: wrap(phi + gauss() * sc.bw / 4), r: R * (1 + gauss() * 0.004), t: now, db, id: t.id, e, q: su.Q.clone() });
      }
      const keep = TAU / sc.rate * 1.05; sc.plots = sc.plots.filter((p) => now - p.t < keep);
    });
    for (const tr of su.trks) trackStep(su, tr, dt, targets, now);
    su.Pp.copy(su.P); su.Qp.copy(su.Q);
  }
  // A tracker knows how its own ship moves (her gyros and her navigation): before it looks, its boresight is turned to undo her
  // rotation since the last step (held still in space, not in her frame), and to stay on the point it was on (at the range in its
  // gate) as she moves. The target's own motion is the conical scan's to find (and its rate aiding's): what's left is only that. The turret turns no faster than TRK.stab to do it: a turn faster than that still
  // drags the beam off.
  const _dq = new T.Quaternion(), _qi = new T.Quaternion();
  function stabilise(su: RSuite, tr: RTrack, dt: number) {
    _qi.copy(su.Q).invert(); _dq.multiplyQuaternions(_qi, su.Qp); // (her frame of the last step to her frame now)
    void dt;
    const bw = tr.b.clone().applyQuaternion(su.Qp);
    if (tr.rng > 1) { // (the point the beam's on, at the range in its gate, seen from where her mount is now)
      const m0 = tr.at.clone().applyQuaternion(su.Qp).add(su.Pp), m1 = tr.at.clone().applyQuaternion(su.Q).add(su.P);
      bw.copy(m0.addScaledVector(bw, tr.rng).sub(m1)).normalize();
    }
    slewTo(tr, bw.applyQuaternion(_qi).normalize(), TRK.stab * dt);
    tr.w.applyQuaternion(_dq); tr.dE.applyQuaternion(_dq); // (the rate and the half-summed error, kept in her frame as it is now)
  }
  // a cued direction (her frame when the plot was made, q) in her frame now
  const cueDir = (su: RSuite, c: NonNullable<RTrack['cue']>, e: number, out: THREE.Vector3) => dirOf(c.ax, c.phi, e, out).applyQuaternion(c.q).applyQuaternion(_qi.copy(su.Q).invert());
  // cue a tracker on a plot: the one whose side it's on, an idle one first
  function cue(su: RSuite, p: RPlot) {
    const sc = su.scans[p.k], d0 = dirOf(sc.ax, p.phi, 0), want = sc.ax === 'y' ? (d0.x >= 0 ? 1 : -1) : 0;
    const ok = su.trks.filter((t) => !want || t.side === want);
    const tr = ok.find((t) => t.st === 'idle') || ok.find((t) => t.st !== 'track') || ok[0]; if (!tr) return null;
    tr.hand = null; tr.st = 'slew'; tr.cue = { k: p.k, ax: sc.ax, phi: p.phi, r: p.r, q: (p.q || su.Q).clone() }; tr.sw = -sc.fan; tr.best = { db: -99, b: new T.Vector3() }; tr.tgt = null; tr.lockT = 0; tr.lost = 0; tr.est = { p: null, v: new T.Vector3(), q: 0 };
    return tr;
  }
  const drop = (tr: RTrack) => { tr.hand = null; tr.w.set(0, 0, 0); tr.dE.set(0, 0, 0); tr.dA = 0; tr.dP = 0; tr.st = 'idle'; tr.cue = null; tr.tgt = null; tr.lockT = 0; tr.est = { p: null, v: new T.Vector3(), q: 0 }; tr.db = -99; };
  // the boresight turned toward `to` no faster than the turret can
  function slewTo(tr: RTrack, to: THREE.Vector3, max: number) { const ang = tr.b.angleTo(to); if (ang <= max) tr.b.copy(to); else { const ax = _w.crossVectors(tr.b, to); if (ax.lengthSq() < 1e-12) ax.set(0, 1, 0); tr.b.applyAxisAngle(ax.normalize(), max); } tr.b.normalize(); return ang; }
  const inSide = (tr: RTrack, b: THREE.Vector3) => b.x * tr.side > -0.15;
  // what the tracker's beam (axis a) gets back from the targets in its range gate: the strongest, its signal and which it is
  function beamDb(su: RSuite, tr: RTrack, a: THREE.Vector3, targets: RTarget[], gate: number | null) {
    let best = -99, id: string | null = null, R0 = 0, dir: THREE.Vector3 | null = null; const d = new T.Vector3();
    for (const t of targets) {
      if (t.id === su.id) continue;
      const { R, sig } = look(su, tr.at, t, d);
      if (gate != null && Math.abs(R - gate) > Math.max(150, gate * TRK.gate)) continue;
      const th = a.angleTo(d); if (th > TRK.bw * 2.5) continue;
      const db = snrDb(TRK.R0, sig, R) - 10 * Math.log10(Math.E) * AG * th * th;
      if (db > best) { best = db; id = t.id; R0 = R; dir = d.clone(); }
    }
    return { db: best, id, R: R0, dir };
  }
  function trackStep(su: RSuite, tr: RTrack, dt: number, targets: RTarget[], now: number) {
    if (tr.st === 'idle') { tr.a.copy(tr.b); return; }
    if (tr.st === 'slew' && tr.hand) { // (a handover: straight onto where the other tracker's solution has her, and tracking)
      const h = tr.hand, mt = tr.at.clone().applyQuaternion(su.Q).add(su.P), pt = h.p.clone().addScaledVector(h.v, now - h.t), to = pt.clone().sub(mt).normalize().applyQuaternion(_qi.copy(su.Q).invert());
      if (now - h.t > 3) { drop(tr); return; } // (not there in 3 s: her solution's gone stale)
      if (slewTo(tr, to, TRK.stab * dt) < 1 * D2R) { tr.st = 'track'; tr.rng = pt.distanceTo(mt); tr.lockT = 0; tr.lost = 0; tr.err = 0; tr.w.set(0, 0, 0); tr.dE.set(0, 0, 0); tr.dA = 0; tr.dP = 0; tr.hand = null; }
      tr.a.copy(tr.b); return;
    }
    if (tr.st === 'slew' || tr.st === 'acq') {
      const c = tr.cue!, sc = su.scans[c.k];
      if (tr.st === 'slew') { if (slewTo(tr, cueDir(su, c, -sc.fan, new T.Vector3()), TRK.slew * dt) < 1 * D2R) tr.st = 'acq'; tr.a.copy(tr.b); return; }
      // along the fan, its range gate at the plot's range: the strongest return on the way is where she is
      tr.sw += TRK.acq * dt; cueDir(su, c, Math.min(tr.sw, sc.fan), tr.b); tr.a.copy(tr.b);
      if (inSide(tr, tr.b)) { const r = beamDb(su, tr, tr.b, targets, c.r); if (r.db + gauss() * 1.2 > tr.best.db) { tr.best.db = r.db; tr.best.b.copy(tr.b); } }
      if (tr.sw >= sc.fan) {
        if (tr.best.db > THR) { tr.b.copy(tr.best.b); tr.st = 'track'; tr.rng = c.r; tr.lockT = 0; tr.lost = 0; tr.w.set(0, 0, 0); tr.dE.set(0, 0, 0); tr.dA = 0; tr.dP = 0; }
        else drop(tr);
      }
      return;
    }
    // tracking: conical scan. The beam axis runs round the boresight at the squint angle (sampled eight times a frame); the return
    // at each point of the circle is summed against the way the axis is off (the demodulator, over one whole revolution: a part
    // of one says nothing); at the end of each revolution the sum says which way and how far the target is off the boresight, and
    // the servo puts the boresight there. Between corrections the boresight keeps turning at the rate the last ones found (rate
    // aiding: a crossing target isn't left behind between looks)
    const e1 = new T.Vector3(), e2 = new T.Vector3(), uv = new T.Vector3(), N = 8;
    tr.b.addScaledVector(tr.w, dt).normalize();
    (Math.abs(tr.b.y) < 0.9 ? e1.set(0, 1, 0) : e1.set(1, 0, 0)).cross(tr.b).normalize(); e2.crossVectors(tr.b, e1);
    const bd = beamDb(su, tr, tr.b, targets, tr.rng), dph = TAU * TRK.hz * dt / N;
    for (let i = 0; i < N; i++) {
      tr.ph = (tr.ph + dph) % TAU; tr.dP += dph;
      uv.copy(e1).multiplyScalar(Math.cos(tr.ph)).addScaledVector(e2, Math.sin(tr.ph));
      tr.a.copy(tr.b).addScaledVector(uv, Math.tan(TRK.sq)).normalize();
      if (!bd.dir) continue;
      const th = tr.a.angleTo(bd.dir), g = Math.exp(-AG * th * th); tr.dE.addScaledVector(uv, g); tr.dA += g;
    }
    tr.db = bd.db;
    // her going round toward the other side (the overlap where both turrets can see): the other tracker, if it's free, is handed
    // the track, so it's held as she crosses from one half of the sky to the other
    const oth = su.trks.find((o) => o !== tr);
    if (oth && oth.st === 'idle' && tr.est.p && tr.est.q > 0.3 && tr.b.x * tr.side < 0.05) { drop(oth); oth.st = 'slew'; oth.hand = { p: tr.est.p.clone(), v: tr.est.v.clone(), t: now }; }
    if (!bd.dir || bd.db < THR - 4 || !inSide(tr, tr.b)) { tr.lost += dt; if (tr.lost > 0.5) drop(tr); return; }
    tr.lost = 0; tr.tgt = bd.id; tr.lockT += dt;
    if (tr.dP >= TAU && tr.dA > 0) {
      // the error: <G u> / (<G> AG sq) is the target's offset from the boresight (exact while she's well inside the beam; it can't
      // say more than about the squint's worth beyond that), noisier the weaker she is
      const Tc = tr.dP / (TAU * TRK.hz), eps = tr.dE.multiplyScalar(1 / (tr.dA * AG * TRK.sq)), snr = Math.pow(10, bd.db / 10), nz = TRK.bw * 0.6 / Math.sqrt(snr);
      eps.addScaledVector(e1, gauss() * nz).addScaledVector(e2, gauss() * nz);
      eps.addScaledVector(tr.b, -eps.dot(tr.b)); // (in the plane square to the boresight)
      tr.err = tr.err * 0.6 + eps.length() * 0.4;
      slewTo(tr, tr.b.clone().add(eps).normalize(), TRK.slew * Tc);
      tr.w.multiplyScalar(0.98).addScaledVector(eps, 0.5 / Tc); // (an integrator, a little leaky: a steady crossing rate is learnt, and no lag is left behind it) tr.w.addScaledVector(tr.b, -tr.w.dot(tr.b));
      if (tr.w.length() > TRK.slew) tr.w.setLength(TRK.slew);
      tr.dE.set(0, 0, 0); tr.dA = 0; tr.dP = 0;
    }
    // range from the gate (it follows her), and the firing solution: alpha-beta on where that puts her
    tr.rng = tr.rng + (bd.R * (1 + gauss() * 0.002) - tr.rng) * Math.min(1, dt * 12);
    const p = tr.b.clone().applyQuaternion(su.Q).multiplyScalar(tr.rng).add(tr.at.clone().applyQuaternion(su.Q).add(su.P)), es = tr.est;
    if (!es.p) es.p = p; else { const pr = es.p.clone().addScaledVector(es.v, dt), r = p.sub(pr); es.p = pr.addScaledVector(r, 0.35); es.v.addScaledVector(r, 0.08 / Math.max(dt, 1e-3)); }
    es.q = Math.min(1, tr.lockT / 1.5) * Math.max(0, 1 - tr.err / (TRK.bw * 0.5));
  }
  // the best track she has on a target: a tracker holding it, and how good its solution is
  function lockOn(su: RSuite | null, id: string) { if (!su) return null; let b: RTrack | null = null; for (const t of su.trks) if (t.st === 'track' && t.tgt === id && (!b || t.est.q > b.est.q)) b = t; return b; }
  // a target's return from where a radar at `from` (level frame) sees her, and the range it would detect her at
  function rcsToward(t: RTarget, from: THREE.Vector3) { const u = from.clone().sub(t.p).normalize().applyQuaternion(t.q.clone().invert()); return rcsAt(t.rcs, u); }
  return { show: 0, rcsOf, rcsAt, rcsToward, suite, step, cue, drop, lockOn, dirOf, angOf, snrDb, detRange, THR, SCAN, TRK, NAZ, NEL, cache };
})();
