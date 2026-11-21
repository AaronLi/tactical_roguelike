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
export interface RTarget { id: string; p: THREE.Vector3; v: THREE.Vector3; q: THREE.Quaternion; rcs: RcsTable; iso?: number; iff?: RIff | null; aff?: RAff; xon?: boolean; only?: RAff } // (only: its transponder answers only an interrogator of that side's (a torpedo's to its own ship's)) // (iso: a return the same every way, m2: a chaff cloud's, a missile's; iff: what its transponder answers an interrogation with, or nothing)
export type RAff = 'civ' | 'navy' | 'pirate' | 'squad'; // (whose a ship is: a civilian's, a navy's, pirates', the squad's)
export interface RIff { c: 'civ' | 'squad' | 'navy'; n: string } // (the answer: what it says it is, and its name) // (a civilian's, the squad's ship's, the mission's ship's; and the name it gives)
export interface RPlot { k: number; phi: number; r: number; t: number; db: number; id: string; e: number; vr?: number; // (vr: its Doppler: how fast its range is opening (m/s; closing, below 0), measured on the one look)
  q?: THREE.Quaternion; o?: THREE.Vector3; iff?: RIff | null } // (q, o: how she was turned and where she was when it was made)
export type RMode = 'round' | 'sector' | 'off'; // (a search radar's modes: js/space.ts modeSet)
export type RAx = 'y' | 'x' | 'z'; // (the axis a scanner turns about, in her frame: 'y' her up (yaw), 'x' her beam (pitch), 'z' her length (roll))
export interface RContact { n: string; A: number; r: number; vA: number; vr: number; t: number; hits: number; p: RPlot; iff?: RIff | null; trail: { A: number; r: number; t: number }[]; kA: KF1; kr: KF1; sg?: number } // (sg: the largest its returns have said it is, m2 (sigOf): a fade makes a look smaller, never bigger) // (kA, kr: its Kalman filters, on its angle and its range) // (iff: its answer to interrogation (undefined: not asked yet; null: no answer, unknown)) // (a peak followed from sweep to sweep: A its angle on the map, r its range, their rates; p the latest plot of it)
export interface RScan {
  notch?: boolean; // (its Doppler notch: what closes at the clutter's rate (the asteroid field's, RSuite Vc) filtered out, js/space.ts modeSet)
  ax: RAx; th: number; rate: number; bw: number; fan: number; R0: number; plots: RPlot[]; at: THREE.Vector3; n: THREE.Vector3; mast: number; mask: number;
  map: Float32Array; age: Float32Array; off: number; col: number; cons: RContact[]; nid: number; tag: string; pend: { p: RPlot; A: number }[]; mode: RMode; rate0: number; sec: { on: boolean; c: number; h: number; dir: number }; // (mode: what it's doing (round, a sector, off: silent); rate0 its own turning rate; sec: a sector search: back and forth across c +- h (her angle), not round) // (its response map (MAP.na angle columns by MAP.nr range bins, in the noise's units), when each column was written, the map's angle against hers (her turning about its axis since), the last column written; its contacts)
} // (n: the way its mast stands out of her hull, mast how far: it sees past her hull's plane there as far as over the hull's edge, mask (the sine of that angle))
export interface RTrack {
  side: number; at: THREE.Vector3; b: THREE.Vector3; a: THREE.Vector3; st: 'idle' | 'slew' | 'acq' | 'track'; off?: boolean; // (off: switched off by its operator: silent, takes no cue)
  cue: { k: number; ax: RAx; phi: number; r: number; q: THREE.Quaternion; o: THREE.Vector3; con?: RContact | null } | null; spiral?: { t: number; best: number; b: THREE.Vector3; r: number; p: THREE.Vector3; v: THREE.Vector3; t0: number; ray?: boolean; span?: number; dr?: number; bt?: number; bv?: number | null } | null; sw: number; best: { db: number; b: THREE.Vector3; r: number; t?: number; v?: number | null }; ph: number; // (best.b: the way the sweep's peak was, in the level's frame: she may turn while it sweeps)
  tgt: string | null; lockT: number; lost: number; err: number; db: number; rng: number; est: { p: THREE.Vector3 | null; v: THREE.Vector3; q: number; kf?: KF3 | null };
  hand: { p: THREE.Vector3; v: THREE.Vector3; t: number; ray?: boolean; sig?: number } | null; // (sig: how far out its place may be, m (the handing track's own uncertainty): how wide the spiral goes) // (ray: a way to look, not a place (a radar warning's bearing): its range not known) // (handed a track by the other tracker: where its solution has the target, slewed to straight)
  hist?: { t: number; p: THREE.Vector3 }[]; // (where its solution has had her, the last 8 s)
  dop?: number | null; // (its target's Doppler: the range's rate, opening)
  rev?: number; meas?: { p: THREE.Vector3; R: number[] } | null; // (its revolutions done, and the last one's measurement: where it put her, and how unsure)
  // (what the debug view's pipeline shows of it: ring, the return round the last nutation circle; gate, the power across its range
  // gate (10 m bins, the gate's middle in the middle); errs, the last angle errors (along e1, e2, in beam widths); series, its error
  // and solution quality over the last 8 s; sweep, the acquisition sweep's returns along the strip)
  dg?: { ring: Float32Array; gate: Float32Array; errs: number[][]; rerr: number; series: { t: number; err: number; q: number }[]; sweep: { e: number; db: number }[] };
  dE: THREE.Vector3; dA: number; dP: number; w: THREE.Vector3; // (the conical scan's demodulator over the revolution under way, and the boresight's rate)
}
export interface KF1 { x: number; v: number; p11: number; p12: number; p22: number } // (a scalar's Kalman filter at constant velocity: its value, rate, and their covariance)
export interface RFused { kf: KF3; trk?: RTrack | null; n: string; a: RContact | null; b: RContact | null; p: THREE.Vector3; pl: THREE.Vector3; res: number; r: number; iff: RIff | null; ea: number; eb: number; v: THREE.Vector3; hist: { t: number; p: THREE.Vector3 }[] } // (v its velocity (level frame), from hist: where it's been, the last 8 s) // (a contact of each scanner's that are one thing: where, in her frame (p) and the level's (pl); how far apart the two fans' points are there (res); ea, eb how far along each fan)
export interface RAssess { key: string; n: string; f: RFused | null; c: RContact | null; iff: RIff | null; r: number; vc: number; tcpa: number; dcpa: number; score: number; hold: number; cls: 'HOSTILE' | 'SUSPECT' | 'WATCH' | 'NEUTRAL' | 'CIV' | 'FRIENDLY'; plot: RPlot | null; why: string }
export interface RSuite { Vc?: THREE.Vector3; keep?: Set<string>; // (keep: targets her notch lets through: one she's tracking, or matched with)
  wpn?: Map<string, number>; aff?: RAff; hostNames?: Set<string>; fusSeen: Map<string, string>; ass: RAssess[]; assHold: Map<string, number>; fusKF: Map<string, KF3>; fusHist: Map<string, { t: number; p: THREE.Vector3 }[]>; fus: RFused[]; fusIds: Map<string, string>; fusN: number; fusT: number; id: string; name?: string; P: THREE.Vector3; Q: THREE.Quaternion; V: THREE.Vector3; scans: RScan[]; trks: RTrack[]; size: number; Pp: THREE.Vector3; Qp: THREE.Quaternion; init: boolean; dbg?: any } // (Pp, Qp: where she was and how she was turned at the last step)

// (the Kalman filters' 3D one: js/radar.ts Radar, "Kalman filters")
export class KF3 {
  x = new Float64Array(6); P = new Float64Array(36); t = 0; n = 0; qb = 1; // (qb: the process noise's boost while it's manoeuvring)
  constructor(p: THREE.Vector3, v: THREE.Vector3, sp: number, sv: number, t: number) { this.x.set([p.x, p.y, p.z, v.x, v.y, v.z]); for (let i = 0; i < 3; i++) { this.P[i * 6 + i] = sp * sp; this.P[(i + 3) * 6 + i + 3] = sv * sv; } this.t = t; }
  pred(t: number, q: number) {
    const dt = t - this.t; if (dt <= 0) return; this.t = t; const P = this.P, x = this.x;
    for (let i = 0; i < 3; i++) x[i] += x[i + 3] * dt;
    // P = F P F' + Q, F = [I dt I; 0 I]: the blocks (pp, pv, vp, vv) by hand
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) {
      const pp = P[i * 6 + j], pv = P[i * 6 + j + 3], vp = P[(i + 3) * 6 + j], vv = P[(i + 3) * 6 + j + 3];
      P[i * 6 + j] = pp + dt * (pv + vp) + dt * dt * vv; P[i * 6 + j + 3] = pv + dt * vv; P[(i + 3) * 6 + j] = vp + dt * vv;
    }
    q *= this.qb;
    for (let i = 0; i < 3; i++) { P[i * 6 + i] += q * dt * dt * dt / 3; P[i * 6 + i + 3] += q * dt * dt / 2; P[(i + 3) * 6 + i] += q * dt * dt / 2; P[(i + 3) * 6 + i + 3] += q * dt; }
  }
  // the innovation of a position measurement z (uncertainty R, 3 by 3) and its Mahalanobis distance squared
  innov(z: THREE.Vector3, R: number[]) {
    const y = [z.x - this.x[0], z.y - this.x[1], z.z - this.x[2]], S: number[] = []; for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) S.push(this.P[i * 6 + j] + R[i * 3 + j]);
    const Si = inv3(S); let m = 0; for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) m += y[i] * Si[i * 3 + j] * y[j];
    return { y, Si, m };
  }
  upd(z: THREE.Vector3, R: number[]) {
    const { y, Si, m } = this.innov(z, R);
    // (a measurement well outside where it was expected (its normalised innovation over 16: chi-squared, three dimensions, 1 in
    // 1000 of steady ones) says it's manoeuvring: the process noise boosted, so it's followed; back to steady as they agree again)
    this.qb = m > 16 ? Math.min(30, this.qb * 4) : Math.max(1, this.qb * 0.7);
    const P = this.P, K = new Float64Array(18); // (K = P H' S^-1, 6 by 3)
    for (let i = 0; i < 6; i++) for (let j = 0; j < 3; j++) { let a = 0; for (let k = 0; k < 3; k++) a += P[i * 6 + k] * Si[k * 3 + j]; K[i * 3 + j] = a; }
    for (let i = 0; i < 6; i++) for (let j = 0; j < 3; j++) this.x[i] += K[i * 3 + j] * y[j];
    const HP = new Float64Array(18); for (let k = 0; k < 3; k++) for (let j = 0; j < 6; j++) HP[k * 6 + j] = P[k * 6 + j]; // (H P: P's first three rows)
    for (let i = 0; i < 6; i++) for (let j = 0; j < 6; j++) { let a = 0; for (let k = 0; k < 3; k++) a += K[i * 3 + k] * HP[k * 6 + j]; P[i * 6 + j] -= a; }
    this.n++;
  }
  // its frame moved (a new level's: x' = R x + t): its position moved with it, its velocity turned
  move(R: THREE.Quaternion, t: THREE.Vector3) { const p = new THREE.Vector3(this.x[0], this.x[1], this.x[2]).applyQuaternion(R).add(t), v = new THREE.Vector3(this.x[3], this.x[4], this.x[5]).applyQuaternion(R); this.x.set([p.x, p.y, p.z, v.x, v.y, v.z]); }
  pos(out = new THREE.Vector3()) { return out.set(this.x[0], this.x[1], this.x[2]); }
  vel(out = new THREE.Vector3()) { return out.set(this.x[3], this.x[4], this.x[5]); }
  sig() { return Math.sqrt((this.P[0] + this.P[7] + this.P[14]) / 3); } // (its position's spread, one number)
}
function inv3(m: number[]) {
  const [a, b, c, d, e, f, g, h, i] = m, A = e * i - f * h, B = -(d * i - f * g), C = d * h - e * g, det = a * A + b * B + c * C || 1e-12;
  return [A / det, -(b * i - c * h) / det, (b * f - c * e) / det, B / det, (a * i - c * g) / det, -(a * f - c * d) / det, C / det, -(a * h - b * g) / det, (a * e - b * d) / det];
}

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
  // ---------------------------------------------------------------- Kalman filters
  // Every estimate the radars keep is a Kalman filter on a constant-velocity model: what it holds is a value and its rate and how
  // unsure it is of them (their covariance); between measurements it's carried forward (predict: the value moves at its rate, and
  // the uncertainty grows, the more so the more the target could have accelerated: q, the acceleration's variance); a measurement
  // (with its own uncertainty, r) pulls the value toward it by as much as the two uncertainties say it should (update), and how far
  // it is from where it was expected against how unsure that was (the innovation over its covariance, Mahalanobis) says whether a
  // measurement is even this target's (the gate).
  // KF1: one scalar (a contact's angle on a map, or its range). KF3: a position and velocity in 3D (a correlated track, a
  // tracker's firing solution), its covariance in full (6 by 6): a measurement's uncertainty is along the line of sight (range:
  // small) and across it (angle times range: larger), not the same every way.
  const kf1 = (x: number, sx: number, sv: number): KF1 => ({ x, v: 0, p11: sx * sx, p12: 0, p22: sv * sv });
  function kf1Pred(k: KF1, dt: number, q: number) { const { p11, p12, p22 } = k; k.x += k.v * dt; k.p11 = p11 + dt * (2 * p12 + dt * p22) + q * dt * dt * dt / 3; k.p12 = p12 + dt * p22 + q * dt * dt / 2; k.p22 = p22 + q * dt; }
  function kf1Upd(k: KF1, y: number, r: number) { const S = k.p11 + r, K1 = k.p11 / S, K2 = k.p12 / S, { p11, p12, p22 } = k; k.x += K1 * y; k.v += K2 * y; k.p11 = (1 - K1) * p11; k.p12 = (1 - K1) * p12; k.p22 = p22 - K2 * p12; }
  // (where a KF1 would be after dt, and how unsure, without moving it: for the gate)
  const kf1Peek = (k: KF1, dt: number, q: number) => ({ x: k.x + k.v * dt, p: k.p11 + dt * (2 * k.p12 + dt * k.p22) + q * dt * dt * dt / 3, v: k.v, pv: k.p22 + q * dt });
  // its rate measured (a Doppler): y the rate's innovation, r its variance
  function kf1UpdV(k: KF1, y: number, r: number) { const S = k.p22 + r, K1 = k.p12 / S, K2 = k.p22 / S, { p11, p12, p22 } = k; k.x += K1 * y; k.v += K2 * y; k.p11 = p11 - K1 * p12; k.p12 = p12 - K1 * p22; k.p22 = p22 - K2 * p22; }
  // a measurement's uncertainty as a matrix: sr along the line of sight l (a unit vector), sc across it
  function Rlos(l: THREE.Vector3, sr: number, sc: number) { const a = sc * sc, b = sr * sr - a, L = [l.x, l.y, l.z], R: number[] = []; for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) R.push((i === j ? a : 0) + b * L[i] * L[j]); return R; }
  // ---------------------------------------------------------------- the radar equation
  const THR = 13, SIG0 = 10;                // the detection threshold (dB over the noise), and the 10 m2 a radar's R0 is quoted for
  const snrDb = (R0: number, sig: number, R: number) => THR + 10 * Math.log10(Math.max(1e-6, sig) / SIG0) + 40 * Math.log10(R0 / Math.max(1, R));
  const detRange = (R0: number, sig: number) => R0 * Math.pow(Math.max(1e-6, sig) / SIG0, 0.25); // (where it's even odds)
  const gauss = () => { let u = 0, v = 0; while (u === 0) u = Math.random(); while (v === 0) v = Math.random(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(TAU * v); };
  // ---------------------------------------------------------------- the radars
  const SCAN = { rate: TAU / 3, bw: 2 * D2R, fan: 45 * D2R, R0: 7500 }; // (a turn every 3 s; 2 degrees by 90)
  const TRK = { bw: 3 * D2R, sq: 1 * D2R, hz: 6, slew: 75 * D2R, stab: 200 * D2R, acq: 60 * D2R, R0: 9000, gate: 0.06 }; // (conical scan at 6 Hz: slow enough to see in the debug view; stab: how fast the turret can turn to hold its beam still while she turns under it)
  // a scanner's response map: MAP.na columns of angle round its axis (a degree each) by MAP.nr bins of range: 25 m each to R1 (10 km,
  // where a track's range is fine enough to fight with), 100 m each beyond, to Rmax (50 km: a big ship broadside on is seen that far)
  const MAP = { na: 360, nr: 800, dr: 25, R1: 10000, dr2: 100, Rmax: 50000, K: 24, floor: 12 };
  // (a range's place in the bins, continuous, and back; a bin's width there)
  const B1 = MAP.R1 / MAP.dr;
  const binOf = (R: number) => (R < MAP.R1 ? R / MAP.dr : B1 + (R - MAP.R1) / MAP.dr2);
  const rangeOf = (b: number) => (b < B1 ? b * MAP.dr : MAP.R1 + (b - B1) * MAP.dr2);
  const binW = (R: number) => (R < MAP.R1 ? MAP.dr : MAP.dr2); // (K: how far over the noise round it a cell must stand to be a peak (CFAR); floor: below that, not even looked at)
  const mapOf = (tag: string) => ({ map: new Float32Array(MAP.na * MAP.nr), age: new Float32Array(MAP.na).fill(-1e9), off: 0, col: -1, cons: [] as RContact[], nid: 0, tag, pend: [] as { p: RPlot; A: number }[], sec: { on: false, c: 0, h: Math.PI / 4, dir: 1 } });
  const MASK = Math.sin(10 * D2R); // (how far past its own side of her hull a mount can see: over the hull's edge, a little)
  const AG = 4 * Math.LN2 / (TRK.bw * TRK.bw); // (the beam's shape: exp(-AG theta^2), half power at bw/2)
  // a ship's set: scanners on her top amidships, trackers each side; size her half length (where they're mounted, and how far the
  // debug view draws things for her)
  // (size her half length; top, bot how far her roof and keel are over and under her middle; beam her half width; mast how high
  // her scanners' masts stand. Two scanners, each on a mast: the 'y' one over her roof (round her horizon, and down past her
  // sides as far as the mast lets it see over them: under her keel it's blind), the 'z' one off her bow high up, turning about her length (its
  // fan along her length: round her, ahead of her bow; astern of her it's blind, her hull's in the way). A tracker on each flank, each seeing its own side)
  function suite(id: string, size: number, top = size * 0.25, beam = size * 0.3, bot = -top, mast = Math.max(1.5, size * 0.25)): RSuite {
    const over = (m: number, edge: number) => Math.max(MASK, Math.sin(Math.atan2(m, Math.max(0.5, edge)))); // (how far past its plane a mast that high sees over an edge that far off)
    const scans: RScan[] = [
      { ax: 'y', th: 0, mode: 'round', rate0: SCAN.rate, rate: SCAN.rate, bw: SCAN.bw, fan: SCAN.fan, R0: SCAN.R0, plots: [], at: new T.Vector3(0, top + mast, -0.1 * size), n: new T.Vector3(0, 1, 0), mast, mask: over(mast, beam), ...mapOf('A') },
      { ax: 'z', th: Math.PI, mode: 'round', rate0: SCAN.rate * 1.07, rate: SCAN.rate * 1.07, bw: SCAN.bw, fan: SCAN.fan, R0: SCAN.R0, plots: [], at: new T.Vector3(0, top * 0.75, -size - mast), n: new T.Vector3(0, 0, -1), mast, mask: over(mast, Math.max(top, -bot, beam)), ...mapOf('B') },
    ];
    const trks: RTrack[] = [1, -1].map((side) => ({ side, at: new T.Vector3(side * beam, 0, 0), b: new T.Vector3(side, 0, 0), a: new T.Vector3(side, 0, 0), st: 'idle', cue: null, sw: 0, best: { db: -99, b: new T.Vector3(), r: 0 }, ph: 0, tgt: null, lockT: 0, lost: 0, err: 0, db: -99, rng: 0, est: { p: null, v: new T.Vector3(), q: 0 }, hand: null, dE: new T.Vector3(), dA: 0, dP: 0, w: new T.Vector3() }));
    return { id, P: new T.Vector3(), Q: new T.Quaternion(), V: new T.Vector3(), scans, trks, size, Pp: new T.Vector3(), Qp: new T.Quaternion(), init: false, fus: [], fusIds: new Map(), fusN: 0, fusT: -1, fusHist: new Map(), fusKF: new Map(), ass: [], assHold: new Map(), fusSeen: new Map() };
  }
  // a way out of the radar along a fan: ax its turning axis, phi how far round it's turned, e how far along the fan (her own frame)
  // ('y': phi round from her nose to starboard, e up; 'x': phi up from ahead, e to starboard; 'z': phi round her length from her
  // up to starboard (seen from astern), e forward along her length)
  const dirOf = (ax: RAx, phi: number, e: number, out = new T.Vector3()) => ax === 'y' ? out.set(Math.sin(phi) * Math.cos(e), Math.sin(e), -Math.cos(phi) * Math.cos(e)) : ax === 'x' ? out.set(Math.sin(e), Math.sin(phi) * Math.cos(e), -Math.cos(phi) * Math.cos(e)) : out.set(Math.sin(phi) * Math.cos(e), Math.cos(phi) * Math.cos(e), -Math.sin(e));
  const cl1 = (v: number) => Math.max(-1, Math.min(1, v));
  const angOf = (ax: RAx, d: THREE.Vector3) => ax === 'y' ? [azOf(d.x, d.z), Math.asin(cl1(d.y))] : ax === 'x' ? [Math.atan2(d.y, -d.z), Math.asin(cl1(d.x))] : [Math.atan2(d.x, d.y), Math.asin(cl1(-d.z))];
  // a scanner's antenna (or its fan, drawn) turned to phi: its rotation about its axis
  const spin = (ax: RAx, th: number, o: THREE.Object3D) => { if (ax === 'y') o.rotation.set(0, -th, 0); else if (ax === 'x') o.rotation.set(th, 0, 0); else o.rotation.set(0, 0, -th); };
  const _v = new T.Vector3(), _w = new T.Vector3(), _q = new T.Quaternion();
  // where a target is from a mount of hers: the way (her frame), the range, and the target's return toward it
  function look(su: RSuite, at: THREE.Vector3, t: RTarget, dir: THREE.Vector3) {
    const from = _w.copy(at).applyQuaternion(su.Q).add(su.P);
    dir.copy(t.p).sub(from); const R = dir.length(); dir.divideScalar(R || 1);
    const rr = (t.v.x - su.V.x) * dir.x + (t.v.y - su.V.y) * dir.y + (t.v.z - su.V.z) * dir.z; // (its Doppler: the range's rate, opening; her own motion taken out)
    const vc = su.Vc, rc = vc ? (vc.x - su.V.x) * dir.x + (vc.y - su.V.y) * dir.y + (vc.z - su.V.z) * dir.z : -(su.V.x * dir.x + su.V.y * dir.y + su.V.z * dir.z); // (the clutter's that way: what's at rest in the field)
    const u = _v.copy(dir).negate().applyQuaternion(_q.copy(t.q).invert()); // (from her toward the radar, in her frame)
    const sig = t.iso != null ? t.iso : rcsAt(t.rcs, u);
    dir.applyQuaternion(_q.copy(su.Q).invert());
    return { R, sig, rr, rc };
  }
  // What's in the way: big things (asteroids: js/space.ts rocksStep) that hide what's behind them from a radar, each a sphere a
  // little inside the rock's own lumps (p in the level's frame, r, id its own target's id, so it doesn't hide itself). Set a frame.
  const occ: { p: THREE.Vector3; r: number; id: string }[] = [];
  function blocked(from: THREE.Vector3, to: THREE.Vector3, id: string) {
    if (!occ.length) return false;
    const dx = to.x - from.x, dy = to.y - from.y, dz = to.z - from.z, L2 = dx * dx + dy * dy + dz * dz;
    for (const o of occ) {
      if (o.id === id) continue;
      const wx = o.p.x - from.x, wy = o.p.y - from.y, wz = o.p.z - from.z, k = L2 > 0 ? (wx * dx + wy * dy + wz * dz) / L2 : 0;
      if (k <= 0 || k >= 1) continue;
      const ex = wx - dx * k, ey = wy - dy * k, ez = wz - dz * k; if (ex * ex + ey * ey + ez * ez < o.r * o.r) return true;
    }
    return false;
  }
  const _bf = new T.Vector3();
  const wrap = (a: number) => ((a % TAU) + TAU) % TAU;
  function step(su: RSuite, dt: number, targets: RTarget[], now: number) {
    if (!su.init) { su.Pp.copy(su.P); su.Qp.copy(su.Q); su.init = true; }
    for (const tr of su.trks) if (tr.st === 'track') stabilise(su, tr, dt);
    // the scanners: each sweeps its fan round, a column of its map at a time (scanStep)
    su.scans.forEach((sc, k) => scanStep(su, sc, k, dt, targets, now));
    if (now - su.fusT > 0.1) { const dt0 = su.fusT < 0 ? 0.1 : now - su.fusT; su.fusT = now; fuse(su, now); assess(su, dt0); } // (ten times a second)
    for (const tr of su.trks) trackStep(su, tr, dt, targets, now);
    su.Pp.copy(su.P); su.Qp.copy(su.Q);
  }
  // ---------------------------------------------------------------- the scanners' maps
  // Each scanner's beam is a fan, narrow the way it turns (SCAN.bw) and wide along it (SCAN.fan each way). As it turns it fills its
  // map a column at a time: a column is what comes back while the beam's on that degree, every range bin of it: the receiver's
  // noise (an exponential power, mean 1: the noise is the map's unit) and every return in the fan there (the radar equation's
  // signal over the noise, times the beam's gain that far off its middle, the fan's gain that far along it, and the target's
  // fluctuation, a fresh exponential each look: Swerling 2), spread over the range bins it falls between. A return her own hull
  // hides (past the mast's plane by more than mask) isn't there.
  // The map is held still in space about the scanner's axis: her turning about it since (off) is taken out of where each column
  // goes, so what's on it stays where it is while she turns (her pitch and roll for the 'y' map, her yaw and pitch for the 'z' one
  // move things along its fan, which the map doesn't show).
  // Peaks (cfar): a cell that's the biggest within two columns and three bins of it and stands K times over the mean of the cells either side of it
  // in range (cell-averaging CFAR: the noise round it, two guard cells, eight training cells a side): its angle and range from the
  // cells round it (a parabola across the three columns, a power-weighted mean across three bins). Two ships closer together than
  // a beam width and a few range bins make one peak; noise now and then makes one (a false alarm: one in some sweeps).
  // Each peak's a PLOT, and plots are followed from sweep to sweep as CONTACTS (associate): a plot near where a contact is expected
  // (its last place plus its rates) is that contact's; one that isn't starts a new one ('A' and a number on the 'y' map, 'B' on the
  // 'z' map); a contact not seen for two sweeps is dropped.
  // whether a ship's transponder answers this ship's interrogator: a civilian's always; a navy's only a navy's interrogation (its
  // own mode); a pirate's never; the squad's whenever it's switched on
  const answers = (t: RTarget, su: RSuite) => !!t.iff && t.xon !== false && (t.only ? su.aff === t.only : (t.aff === 'civ' || t.aff === 'squad' || (t.aff === 'navy' && su.aff === 'navy')));
  const IFF_R = 12000, DA = TAU / MAP.na, AGS = 4 * Math.LN2 / (SCAN.bw * SCAN.bw), _cd = new T.Vector3(), _ref = new T.Vector3();
  // how long a scanner takes to come back to the same place: a turn; or, searching a sector, there and back across it
  const perOf = (sc: RScan) => (sc.sec.on ? Math.max(0.3, 4 * sc.sec.h / sc.rate) : TAU / sc.rate);
  const wrapPi = (a: number) => { a = (a + Math.PI) % TAU; if (a < 0) a += TAU; return a - Math.PI; };
  function scanStep(su: RSuite, sc: RScan, k: number, dt: number, targets: RTarget[], now: number) {
    // (her turning about its axis since the last step: where its nose (turn 0) was, as she is now)
    angOf(sc.ax, _ref.copy(dirOf(sc.ax, 0, 0, _cd)).applyQuaternion(su.Qp).applyQuaternion(_qi.copy(su.Q).invert())); sc.off = wrap(sc.off + angOf(sc.ax, _ref)[0]);
    // what's out there for it this frame: each target's turn angle, how far along the fan, range and signal (or hidden)
    const seen: { phi: number; e: number; R: number; s: number; id: string; iff: RIff | null; rr: number }[] = [];
    for (const t of targets) {
      if (t.id === su.id) continue;
      const { R, sig, rr, rc } = look(su, sc.at, t, _cd), [phi, e] = angOf(sc.ax, _cd);
      if (sc.notch && Math.abs(rr - rc) < NOTCH && !(su.keep && su.keep.has(t.id))) continue; // (its Doppler notch: closing as the field does, filtered out, whatever it is)
      if (Math.abs(e) > sc.fan || _cd.dot(sc.n) < -sc.mask || R > MAP.Rmax) continue;
      if (blocked(_bf.copy(sc.at).applyQuaternion(su.Q).add(su.P), t.p, t.id)) continue; // (behind a rock: nothing comes back)
      seen.push({ phi, e, R, s: Math.pow(10, (snrDb(sc.R0, sig, R) - 12 * (e / sc.fan) ** 2) / 10), id: t.id, iff: answers(t, su) ? t.iff! : null, rr });
    }
    if (sc.mode === 'off') { // (off: silent; nothing sent, nothing heard, what it held fading out)
      const keep0 = perOf(sc); sc.plots = sc.plots.filter((p) => now - p.t < keep0); sc.cons = sc.cons.filter((c) => now - c.t < Math.max(keep0 * 2.1, 3.5)); sc.pend = []; return;
    }
    const th0 = sc.th, Sx = sc.sec;
    if (!Sx.on) sc.th = wrap(sc.th + sc.rate * dt);
    else { // (a sector: back and forth across it, turning back at each edge; from outside it, in toward it the short way)
      const d = wrapPi(sc.th - Sx.c), st = sc.rate * dt;
      if (Math.abs(d) > Sx.h + st) { Sx.dir = d > 0 ? -1 : 1; sc.th = wrap(sc.th + Sx.dir * st); }
      else { let nd = d + Sx.dir * st; if (nd > Sx.h) { nd = 2 * Sx.h - nd; Sx.dir = -1; } else if (nd < -Sx.h) { nd = -2 * Sx.h - nd; Sx.dir = 1; } sc.th = wrap(Sx.c + nd); }
    }
    const sw = wrapPi(sc.th - th0), sg = sw >= 0 ? 1 : -1, mid = wrap(th0 + sw / 2);
    for (const q of seen) if (Math.abs(wrapPi(q.phi - mid)) <= Math.abs(sw) / 2 + sc.bw) paint(q.id, su, sc, k, now); // (her beam over it this frame: its warning receiver hears it)
    // the columns its middle crossed this frame (in her angle, either way), each written where it goes on the map
    const j0 = Math.floor(th0 / DA), j1 = Math.floor(sc.th / DA), n = ((sg * (j1 - j0)) % MAP.na + MAP.na) % MAP.na;
    for (let s1 = 1; s1 <= n; s1++) {
      const j = ((j0 + sg * s1) % MAP.na + MAP.na) % MAP.na, a = (j + 0.5) * DA, mc = Math.floor(wrap(a - sc.off) / DA) % MAP.na, base = mc * MAP.nr, m = sc.map;
      for (let i = 0; i < MAP.nr; i++) m[base + i] = -Math.log(1 - Math.random());
      for (const q of seen) {
        const d = wrapPi(q.phi - a); if (Math.abs(d) > 3 * sc.bw) continue;
        const pw = q.s * Math.exp(-AGS * d * d) * -Math.log(1 - Math.random()), rb = binOf(q.R) - 0.5, i0 = Math.floor(rb), f = rb - i0;
        if (i0 >= 0 && i0 < MAP.nr) m[base + i0] += pw * (1 - f); if (i0 + 1 >= 0 && i0 + 1 < MAP.nr) m[base + i0 + 1] += pw * f;
      }
      sc.age[mc] = now;
      if (sc.col >= 0) cfar(su, sc, k, (mc - 2 * sg + 2 * MAP.na) % MAP.na, seen, now); // (two columns back the way it's going: both pairs of its neighbours are in now)
      sc.col = mc;
    }
    // (once the oldest peak waiting is 60 degrees behind the beam: all the waiting peaks matched together, so a peak isn't taken by
    // another's contact before that one's own peak is in)
    const beamA = wrap(sc.th - sc.off);
    if (sc.pend.some((q) => { const b = wrap(sg * (beamA - q.A)); return (b > 60 * D2R && b < Math.PI) || (Sx.on && now - q.p.t > 0.3); })) { const ready = sc.pend; sc.pend = []; associate(sc, ready, now); } // (all of them together, those since too)
    const keep = perOf(sc) * 1.05; sc.plots = sc.plots.filter((p) => now - p.t < keep);
    sc.cons = sc.cons.filter((c) => now - c.t < Math.max(keep * 2.1, 3.5)); // (a contact missed twice running is let go; searching a sector, not before 3.5 s)
  }
  function cfar(su: RSuite, sc: RScan, k: number, c: number, seen: { phi: number; R: number; id: string; iff: RIff | null; rr: number }[], now: number) {
    const m = sc.map, NR = MAP.nr, per = perOf(sc), cs = [-2, -1, 1, 2].map((o) => (c + o + MAP.na) % MAP.na), cl = cs[1], cr = cs[2];
    // (a neighbour not written this sweep (from the one before, or outside a sector's edge) isn't compared: only the fresh ones are)
    const fr = (q: number) => now - sc.age[q] <= per * 0.6, fresh = cs.filter(fr); if (!fr(cl) && !fr(cr)) return;
    const b = c * NR, bl = cl * NR, br = cr * NR;
    outer: for (let i = 1; i < NR - 1; i++) {
      const v = m[b + i]; if (v < MAP.floor) continue;
      // (the biggest within two columns and three bins: one ship's return spreads over a few, and makes one peak)
      for (const q of [c, ...fresh]) for (let g = -3; g <= 3; g++) { const ii = i + g; if ((q !== c || g !== 0) && ii >= 0 && ii < NR && m[q * NR + ii] > v) continue outer; }
      let z = 0, nz = 0; for (let g = 3; g <= 10; g++) { if (i - g >= 0) { z += m[b + i - g]; nz++; } if (i + g < NR) { z += m[b + i + g]; nz++; } }
      z = Math.max(0.5, z / Math.max(1, nz)); if (v < MAP.K * z) continue;
      const pl = fr(cl) ? m[bl + i] : m[br + i], pr = fr(cr) ? m[br + i] : m[bl + i], den = pl - 2 * v + pr, dc = den < 0 ? Math.max(-0.5, Math.min(0.5, 0.5 * (pl - pr) / den)) : 0;
      const w0 = m[b + i - 1], w2 = m[b + i + 1], R = rangeOf(((i - 1) * w0 + i * v + (i + 1) * w2) / (w0 + v + w2) + 0.5); // (the peak's middle, between its bins)
      const A = (c + 0.5 + dc) * DA, phi = wrap(A + sc.off), db = 10 * Math.log10(v / z);
      // (which target it really was, if any: for the debug view only, nothing uses it to decide anything)
      let id = '', iff: RIff | null = null, bd = 1e9, vr = gauss() * 400; for (const q of seen) { const dd = Math.abs(wrapPi(q.phi - phi)) / sc.bw + Math.abs(q.R - R) / (binW(R) * 3); if (dd < 2 && dd < bd) { bd = dd; id = q.id; iff = q.iff; vr = q.rr + gauss() * DOP.sd; } } // (its Doppler: what's there's, give or take DOP.sd; a peak of noise alone, anything)
      // (IFF: the interrogator, on the scanner's beam, asks whatever's at that peak; a transponder there answers with its class and
      // name, out to IFF_R. Chaff, a missile, a ship running silent: no answer)
      const p: RPlot = { k, phi, r: R, t: now, db, id, e: 0, vr, q: su.Q.clone(), o: su.P.clone(), iff: R < IFF_R ? iff : null };
      sc.plots.push(p); sc.pend.push({ p, A }); // (matched to its contact once the beam's well past it: associate)
    }
  }
  // (a contact's two Kalman filters: its angle, unsure by a third of the beam width a look, its rate as much as 250 m/s across at
  // that range; its range, unsure by 15 m a look, its rate by 250 m/s; either accelerating up to some 30 m/s/s)
  const SA = SCAN.bw / 3, SR = 15, ACC = 30, ACC3 = 5; // (ACC3: what a 3D track or a firing solution expects of a ship's acceleration, steady; a manoeuvre raises it (KF3 qb))
  // how big a return says its target is (m2, by the radar equation from its strength and range): a lower bound, since where it was
  // in the fan (off its middle, weaker) and its fading aren't known
  const sigOf = (sc: RScan, p: RPlot) => SIG0 * Math.pow(10, (p.db - THR - 40 * Math.log10(sc.R0 / Math.max(1, p.r))) / 10);
  function associate(sc: RScan, batch: { p: RPlot; A: number }[], now: number) {
    // every pairing of a peak with a contact that could be it (inside the contact's gate: its filters' predicted spread and the
    // peak's own, chi-squared on two dimensions, 11.8: 997 in 1000 of its own peaks inside), best first, each peak and each contact once; a peak left over is a new contact
    const per = perOf(sc), minDt = sc.sec.on ? 0.1 : per * 0.5, rA = SA * SA, rr = SR * SR, pairs: { q: typeof batch[0]; c: RContact; m: number }[] = [];
    for (const q of batch) {
      const qA = (ACC / Math.max(50, q.p.r)) ** 2;
      for (const c of sc.cons) {
        const dt = q.p.t - c.t; if (dt < minDt) continue; // (one peak a contact a sweep (a pass, searching a sector))
        const pa = kf1Peek(c.kA, dt, qA), pr = kf1Peek(c.kr, dt, accR(c)), yA = wrapPi(q.A - pa.x), yr = q.p.r - pr.x, yv = (q.p.vr ?? pr.v) - pr.v, m = yA * yA / (pa.p + rA) + yr * yr / (pr.p + rr) + yv * yv / (pr.pv + DOP.sd * DOP.sd);
        if (m < 14.2) pairs.push({ q, c, m }); // (three dimensions now, its Doppler the third: 14.2, 997 in 1000 inside)
      }
    }
    pairs.sort((a, b) => a.m - b.m);
    const usedQ = new Set<typeof batch[0]>(), usedC = new Set<RContact>();
    for (const { q, c } of pairs) {
      if (usedQ.has(q) || usedC.has(c)) continue; usedQ.add(q); usedC.add(c);
      const p = q.p, A = q.A, dt = p.t - c.t, qA = (ACC / Math.max(50, p.r)) ** 2;
      kf1Pred(c.kA, dt, qA); kf1Pred(c.kr, dt, accR(c)); kf1Upd(c.kA, wrapPi(A - c.kA.x), rA); kf1Upd(c.kr, p.r - c.kr.x, rr); if (p.vr != null) kf1UpdV(c.kr, p.vr - c.kr.v, DOP.sd * DOP.sd); c.kA.x = wrap(c.kA.x);
      c.A = c.kA.x; c.r = c.kr.x; c.vA = c.kA.v; c.vr = c.kr.v; c.t = p.t; c.hits++; c.p = p; c.sg = Math.max(c.sg || 0, sigOf(sc, p)); c.iff = p.iff || null; c.trail.push({ A, r: p.r, t: p.t }); if (c.trail.length > 8) c.trail.shift(); // (each sweep's answer: a transponder switched off is unknown from then on)
    }
    // (a peak no contact took that's inside one's gate anyway is that one seen again too soon (a sector's edge, crossed there and
    // back): not a new one)
    const near = (q: typeof batch[0]) => sc.cons.some((c) => { const dt = Math.max(0, q.p.t - c.t), qA = (ACC / Math.max(50, q.p.r)) ** 2, pa = kf1Peek(c.kA, dt, qA), pr = kf1Peek(c.kr, dt, accR(c)), yA = wrapPi(q.A - pa.x), yr = q.p.r - pr.x, yv = (q.p.vr ?? pr.v) - pr.v; return yA * yA / (pa.p + rA) + yr * yr / (pr.p + rr) + yv * yv / (pr.pv + DOP.sd * DOP.sd) < 14.2; });
    for (const q of batch) if (!usedQ.has(q) && !near(q)) { const p = q.p; const kr = kf1(p.r, SR, 400); if (p.vr != null) { kr.v = p.vr; kr.p22 = DOP.sd * DOP.sd; } // (its range rate measured on its first look: its Doppler)
      sc.cons.push({ n: sc.tag + (++sc.nid), A: q.A, r: p.r, vA: 0, vr: kr.v, t: p.t, hits: 1, p, iff: p.iff, trail: [{ A: q.A, r: p.r, t: p.t }], sg: sigOf(sc, p), kA: kf1(q.A, SA, 120 / Math.max(50, p.r)), kr }); /* (a new one's rates unknown: up to some 120 m/s across, 400 along (a torpedo or a missile closing: its second sweep's a kilometre or more nearer), likely) */ }
    void now;
  }
  // ---------------------------------------------------------------- correlation in 3D
  // Each scanner puts a contact on an arc: along its fan, at its range, from its mast ('y': her bearing known, how high not; 'z':
  // the angle round her length known, how far fore or aft not). A contact of each that are the same thing are where their two
  // arcs meet. Every pair (each contact where its rates put it now, in her frame as she is now) whose ranges could agree (the
  // masts are apart) is solved for the nearest points of the two arcs (a grid along both fans, then a finer one round the best),
  // and kept if they come within a gate (4% of the range, 40 m at least): the pairs taken best first, each contact in one. A
  // pair keeps its number (F and a number) while it's the same two contacts.
  const _pa = new T.Vector3(), _pb = new T.Vector3();
  function arcAt(sc: RScan, phi: number, r: number, e: number, out: THREE.Vector3) { return dirOf(sc.ax, phi, e, out).multiplyScalar(r).add(sc.at); }
  // (where the two arcs come nearest. Seen from her middle each arc lies in a plane through it (a scanner's fan at its angle), so
  // they cross along the line the two planes meet in: that gives each fan's angle at once; then a small search round it for the
  // masts being apart. A pair whose first guess is far off is given up on there: it can't come within any gate)
  const _mA = new T.Vector3(), _dA = new T.Vector3(), _mB = new T.Vector3(), _dB = new T.Vector3(), _u = new T.Vector3(), _t1 = new T.Vector3();
  function solve(sa: RScan, pa: number, ra: number, sb: RScan, pb: number, rb: number) {
    dirOf(sa.ax, pa, 0, _mA); _dA.copy(dirOf(sa.ax, pa, 0.01, _t1)).sub(dirOf(sa.ax, pa, -0.01, _u)).normalize();
    dirOf(sb.ax, pb, 0, _mB); _dB.copy(dirOf(sb.ax, pb, 0.01, _t1)).sub(dirOf(sb.ax, pb, -0.01, _u)).normalize();
    _u.crossVectors(_t1.crossVectors(_mA, _dA), _mB.clone().cross(_dB));
    let ea = 0, eb = 0;
    if (_u.lengthSq() > 1e-10) { _u.normalize(); if (_u.dot(_mA) < 0) _u.negate(); ea = Math.atan2(_u.dot(_dA), _u.dot(_mA)); eb = Math.atan2(_u.dot(_dB), _u.dot(_mB)); }
    ea = Math.max(-sa.fan, Math.min(sa.fan, ea)); eb = Math.max(-sb.fan, Math.min(sb.fan, eb));
    let best = { d: arcAt(sa, pa, ra, ea, _pa).distanceTo(arcAt(sb, pb, rb, eb, _pb)), ea, eb };
    if (best.d < 300 + 0.1 * Math.max(ra, rb)) {
      const N = 5; let span = 0.08;
      for (let k = 0; k < 4; k++) {
        const ea0 = best.ea, eb0 = best.eb;
        for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
          const e1 = Math.max(-sa.fan, Math.min(sa.fan, ea0 + span * (i / (N - 1) - 0.5))), e2 = Math.max(-sb.fan, Math.min(sb.fan, eb0 + span * (j / (N - 1) - 0.5)));
          const d = arcAt(sa, pa, ra, e1, _pa).distanceTo(arcAt(sb, pb, rb, e2, _pb)); if (d < best.d) best = { d, ea: e1, eb: e2 };
        }
        span /= 4;
      }
    }
    arcAt(sa, pa, ra, best.ea, _pa); arcAt(sb, pb, rb, best.eb, _pb);
    return { res: best.d, ea: best.ea, eb: best.eb, p: _pa.clone().add(_pb).multiplyScalar(0.5) };
  }
  function fuse(su: RSuite, now: number) {
    const sa = su.scans.find((q) => q.ax === 'y'), sb = su.scans.find((q) => q.ax === 'z'); if (!sa || !sb) { su.fus = []; return; }
    const live = (sc: RScan) => sc.cons.filter((c) => c.hits >= 2 && now - c.t < perOf(sc) * 1.5).map((c) => { const dt = now - c.t; return { c, phi: wrap(c.A + c.vA * dt + sc.off), r: c.r + c.vr * dt }; });
    const A = live(sa), B = live(sb), sep = sa.at.distanceTo(sb.at), pairs: { a: typeof A[0]; b: typeof B[0]; s: ReturnType<typeof solve> }[] = [];
    for (const a of A) for (const b of B) {
      if (Math.abs(a.r - b.r) > sep + 150 + 0.05 * a.r) continue;
      const s0 = solve(sa, a.phi, a.r, sb, b.phi, b.r); if (s0.res < Math.max(40, 0.04 * a.r)) pairs.push({ a, b, s: s0 });
    }
    pairs.sort((p, q) => p.s.res - q.s.res);
    const usedA = new Set<RContact>(), usedB = new Set<RContact>(), out: RFused[] = [];
    for (const pr of pairs) {
      if (usedA.has(pr.a.c) || usedB.has(pr.b.c)) continue; usedA.add(pr.a.c); usedB.add(pr.b.c);
      const key = pr.a.c.n + '|' + pr.b.c.n; let n = su.fusIds.get(key); if (!n) { n = 'F' + (++su.fusN); su.fusIds.set(key, n); }
      // (its Kalman filter: the pair's point a measurement of it, unsure by its range bins along the line of sight and by about a
      // third of a beam width across, and by however far the arcs missed)
      const z = pr.s.p.clone().applyQuaternion(su.Q).add(su.P), l = z.clone().sub(su.P).normalize(), r0 = pr.s.p.length(), sr = SR + pr.s.res, sc0 = r0 * SA + pr.s.res;
      // (updated only when either contact has a new peak: between sweeps the pair's point is the contacts' own predictions, the same
      // information again, not a measurement)
      const seenKey = pr.a.c.p.t + '|' + pr.b.c.p.t, fresh = su.fusSeen.get(n) !== seenKey; su.fusSeen.set(n, seenKey);
      let kf = su.fusKF.get(n); if (!kf) { const rr = [pr.a.c, pr.b.c].map((c) => c.vr), v0 = su.V.clone().addScaledVector(l, rr.length ? rr.reduce((x, y) => x + y, 0) / rr.length : 0); kf = new KF3(z, v0, Math.max(sr, sc0), 150, now); su.fusKF.set(n, kf); } /* (a new one moving as its contacts' ranges are: along the line of sight, as fast as they're closing or opening; across it, not known) */ else { kf.pred(now, ACC3 * ACC3); if (fresh) kf.upd(z, Rlos(l, sr * 1.5, sc0 * 1.5)); }
      const pl = kf.pos(); let hist = su.fusHist.get(n); if (!hist) { hist = []; su.fusHist.set(n, hist); }
      hist.push({ t: now, p: pl.clone() }); while (hist.length && now - hist[0].t > 8) hist.shift();
      out.push({ kf, trk: null, n, a: pr.a.c, b: pr.b.c, p: pl.clone().sub(su.P).applyQuaternion(su.Q.clone().invert()), pl, res: kf.sig(), r: r0, iff: pr.a.c.iff || pr.b.c.iff || null, ea: pr.s.ea, eb: pr.s.eb, v: kf.vel(), hist });
    }
    // the trackers' measurements: each locked one's solution (where it has its target: range from its gate, angle to a fraction
    // of its beam) is joined to the track it falls in (inside 6% of the range, 60 m at least), the two weighted by how sure each
    // is (the tracker's spread: its range times its angle error, and a few metres; the track's: how far its arcs missed, and 2%
    // of its range); one that falls in none is a track of its own, from the tracker alone
    for (const tr of su.trks) {
      if (tr.st !== 'track' || !tr.est.p || tr.est.q < 0.15) continue;
      // (its measurement: where its gate and boresight put the target now, unsure by a few metres in range and by its angle error
      // across: a far better fix than the scanners'. Into the track it falls in (inside its gate: Mahalanobis, three dimensions,
      // 25), as one more update of that track's filter)
      if (!tr.meas) continue; const m = tr.meas.p, R = tr.meas.R, revKey = 'trk' + tr.side + ':' + tr.rev; // (its last revolution's measurement: used once)
      let f = null as RFused | null, bd = 25; for (const q of out) { if (q.trk) continue; const d = q.kf.innov(m, R).m; if (d < bd) { bd = d; f = q; } }
      if (!f) { // (in none: a track of its own, the tracker's alone)
        const key = 'trk' + tr.side; let n = su.fusIds.get(key); if (!n) { n = 'F' + (++su.fusN); su.fusIds.set(key, n); }
        let kf = su.fusKF.get(n); if (!kf) { kf = new KF3(m, tr.est.v, 20, 100, now); su.fusKF.set(n, kf); } else kf.pred(now, ACC3 * ACC3);
        let hist = su.fusHist.get(n); if (!hist) { hist = []; su.fusHist.set(n, hist); }
        f = { kf, n, a: null, b: null, trk: null, p: new T.Vector3(), pl: kf.pos(), res: 0, r: m.distanceTo(su.P), iff: null, ea: 0, eb: 0, v: kf.vel(), hist }; out.push(f);
      }
      if (su.fusSeen.get(f.n + ':trk') !== revKey) { su.fusSeen.set(f.n + ':trk', revKey); f.kf.upd(m, R); } f.trk = tr; f.kf.pos(f.pl); f.kf.vel(f.v); f.res = f.kf.sig(); f.p.copy(f.pl).sub(su.P).applyQuaternion(su.Q.clone().invert());
      const h = f.hist[f.hist.length - 1]; if (h && h.t === now) h.p.copy(f.pl); else { f.hist.push({ t: now, p: f.pl.clone() }); while (now - f.hist[0].t > 8) f.hist.shift(); }
    }
    su.fus = out;
    for (const [k, h] of su.fusHist) if (!h.length || now - h[h.length - 1].t > 3) { su.fusHist.delete(k); su.fusKF.delete(k); su.fusSeen.delete(k); su.fusSeen.delete(k + ':trk'); }
    if (su.fusIds.size > 200) su.fusIds.clear();
  }
  // ---------------------------------------------------------------- hostile or not
  // Each 3D track (and each contact no 3D track has, from its range and range rate alone) is weighed, as the ship looking sees it:
  //   - what its transponder says (to the squad's ship the mission's ship is a known hostile, to the mission's ship the squad's
  //     is; a civilian's answer is nearly enough to be let be; no answer is unknown: some suspicion; another name, a little);
  //   - how fast it's closing (from 10 m/s up, the more the faster),
  //   - how near it is (inside 4 km, the more the nearer),
  //   - whether its course brings it close (its closest approach inside 800 m within 90 s, the more the closer).
  // A score of 0.6 or more is SUSPECT; held for 3 s (the confirmation: a moment's closing or a pass isn't enough) it's HOSTILE,
  // and stays so until it's been under for as long (the hold runs down twice as fast as it runs up). Under: WATCH from 0.35,
  // else NEUTRAL; a civilian's answer under the line, CIV. A ship's fire control cues only on what's HOSTILE.
  const DOP = { sd: 2, gate: 40 };
  const NOTCH = 4; // (a scanner's Doppler notch: either side of the clutter's rate, m/s. The field drifts as one (js/space.ts ROCKS.v): its rocks sit right on it, so it's narrow, and only a ship drifting within 4 m/s of it is lost with them)
  // (a contact's range filter's process noise: what may be a weapon (small, closing fast) may be under a motor's push (a torpedo's
  // 150 m/s2): its closing speed can grow by hundreds of m/s between sweeps; anything else manoeuvres gently)
  const WACC = 200, accR = (c: RContact) => ((c.sg || 0) > 0 && (c.sg || 0) < WPN.sig && -c.vr > WPN.vc ? WACC * WACC : ACC * ACC); // (the Doppler: its error on a look (m/s); a locked tracker's velocity gate, either side of its target's)
  const HOLD = 3;
  const WPN = { sig: 30, vc: 150 }; // (what's taken for a weapon: smaller than 30 m2 and closing faster than 150 m/s)
  // Radar warning: every ship hears a tracking radar that's on her (locked on her, or sweeping across her): from which ship and
  // where (lit: her id to the emitters on her, when last and from where). Being tracked is a sign of hostility (assess).
  const lit = new Map<string, Map<string, { t: number; from: THREE.Vector3; lk: boolean }>>();
  function illum(tgt: string | null, su: RSuite, tr: RTrack, now: number, lk = false) {
    if (!tgt) return; let m = lit.get(tgt); if (!m) { m = new Map(); lit.set(tgt, m); }
    m.set(su.id + ':' + tr.side, { t: now, from: tr.at.clone().applyQuaternion(su.Q).add(su.P), lk }); // (lk: locked on her, not just sweeping over)
  }
  // (and a scanner's beam going over her: a paint, a pulse train a sweep; heard as it passes, from where)
  const painted = new Map<string, Map<string, { t: number; from: THREE.Vector3 }>>();
  function paint(tgt: string, su: RSuite, sc: RScan, k: number, now: number) {
    let m = painted.get(tgt); if (!m) { m = new Map(); painted.set(tgt, m); }
    m.set(su.id + ':s' + k, { t: now, from: sc.at.clone().applyQuaternion(su.Q).add(su.P) });
  }
  const paintsOn = (id: string, now: number, keep = 1.2) => { const m = painted.get(id); return m ? [...m.entries()].filter(([, q]) => now - q.t >= 0 && now - q.t < keep).map(([k, q]) => ({ k, from: q.from, age: now - q.t })) : []; }; // (a stamp from before the clock last started again (a new level) isn't now)
  const litTrk = (id: string, now: number) => { const m = lit.get(id); return m ? [...m.entries()].filter(([, q]) => now - q.t >= 0 && now - q.t < 0.5).map(([k, q]) => ({ k, from: q.from, lk: q.lk })) : []; };
  const litOn = (id: string, now: number) => { const m = lit.get(id); return m ? [...m.entries()].filter(([, q]) => now - q.t >= 0 && now - q.t < 1).map(([k, q]) => ({ k, from: q.from })) : []; };
  function prior(su: RSuite, iff: RIff | null) {
    if (!iff) return { p: 0.3, w: 'no IFF' }; // (a navy's to anyone else, a pirate, the squad running silent, chaff, a missile)
    if (su.hostNames && su.hostNames.has(iff.n)) return { p: 0.7, w: 'known hostile' }; // (the squad's: the mission's ship, if she answers to her name)
    if (iff.c === 'squad') return su.aff === 'squad' ? { p: 0, w: 'own side' } : su.id === 'hull' ? { p: 0.7, w: 'known hostile' } : { p: 0.2, w: 'mercenary' }; // (to the mission's ship, the squad's transponder is her attacker's)
    if (iff.c === 'navy') return su.aff === 'navy' ? { p: 0, w: 'navy: friendly' } : { p: 0.2, w: 'navy' };
    if (iff.c === 'civ') return { p: 0.05, w: 'civilian' };
    return { p: 0.2, w: 'named' };
  }
  function assess(su: RSuite, dt: number) {
    const out: RAssess[] = [], seen = new Set<string>(), inF = new Set<RContact>();
    const now = su.fusT, em = litOn(su.id, now), qi = su.Q.clone().invert(); // (the tracking radars on her now: her warning receiver's)
    // (vc: how fast the range is closing, her own motion and all: how soon it reaches her (fire control's urgency). vo: how fast it's
    // coming at her itself, her own motion taken out: what it's doing, which is what hostility goes by; flying at something that's
    // sitting still makes the range close, and says nothing about it. tcpa, dcpa: its closest approach to where she is, on its own course)
    const add = (key: string, n: string, f: RFused | null, c: RContact | null, iff: RIff | null, r: number, vc: number, vo: number, tcpa: number, dcpa: number, plot: RPlot | null, on: boolean) => {
      // (a weapon: a small return (under WPN.sig, by the largest any look's said it is) closing fast (over WPN.vc): nothing a ship
      // does, so HOSTILE at once, no waiting to be sure)
      const sg = Math.max(0, ...[c, f && f.a, f && f.b].map((q) => (q && q.sg) || 0)), W = su.wpn || (su.wpn = new Map());
      // (once a weapon, still one while it's closing: a 3D track its contacts have let go of (her tracker alone holding it) has no
      // size of its own to go on; it's one if either contact it came of was, or the one its tracker was cued on)
      const was = W.has(key) || (!!f && (!!f.a && W.has('C:' + f.a.n) || !!f.b && W.has('C:' + f.b.n) || W.has('F:' + f.n) || (!!f.trk && !!f.trk.cue && !!f.trk.cue.con && W.has('C:' + f.trk.cue.con.n))));
      const wpn = vo > WPN.vc && ((sg > 0 && sg < WPN.sig) || was); if (wpn) W.set(key, now);
      const pr = prior(su, iff), kin = vo > 10 ? Math.min(1, (vo - 10) / 60) : 0, near = r < 4000 ? 1 - r / 4000 : 0, cpa = tcpa > 0 && tcpa < 90 && dcpa < 800 ? 1 - dcpa / 800 : 0;
      const score = pr.p === 0 ? 0 : Math.min(1, pr.p + 0.35 * kin + 0.25 * near + 0.3 * cpa + (on ? 0.45 : 0));
      let hold = wpn ? HOLD : su.assHold.get(key) ?? Math.max(0, ...[f && f.a, f && f.b].map((q) => (q ? su.assHold.get('C:' + q.n) || 0 : 0))); // (a new 3D track: as long held as its contacts were, alone)
      hold = wpn ? Math.max(hold, HOLD) : score >= 0.6 ? Math.min(HOLD * 2, hold + dt) : Math.max(0, hold - 2 * dt); su.assHold.set(key, hold); seen.add(key);
      const cls = pr.p === 0 ? 'FRIENDLY' : hold >= HOLD ? 'HOSTILE' : score >= 0.6 ? 'SUSPECT' : score >= 0.35 ? 'WATCH' : iff && iff.c === 'civ' ? 'CIV' : 'NEUTRAL';
      const why = [pr.w, wpn ? `WEAPON: ${sg.toFixed(1)} m2 closing fast` : '', on ? 'TRACKING US' : '', kin > 0 ? `coming at us ${Math.round(vo)} m/s` : '', near > 0 ? 'near' : '', cpa > 0 ? `passes ${Math.round(dcpa)} m in ${Math.round(tcpa)} s` : ''].filter(Boolean).join(', ');
      out.push({ key, n, f, c, iff, r, vc, tcpa, dcpa, score, hold, cls, plot, why });
    };
    for (const f of su.fus) {
      if (f.a) inF.add(f.a); if (f.b) inF.add(f.b);
      // (relative to her: where it is and how it's moving, its closest approach if it holds its course)
      const rp = f.pl.clone().sub(su.P), rv = f.v.clone().sub(su.V), r = rp.length(), vc = -rv.dot(rp) / Math.max(1, r), vo = -f.v.dot(rp) / Math.max(1, r);
      const v2 = f.v.lengthSq(), tc = v2 > 1 ? -rp.dot(f.v) / v2 : -1, dc = tc > 0 ? rp.clone().addScaledVector(f.v, tc).length() : r; // (its own course past where she is)
      const on = em.some((e) => e.from.clone().sub(su.P).angleTo(rp) < 4 * D2R && Math.abs(e.from.distanceTo(su.P) - r) < Math.max(150, 0.08 * r)); // (an emitter on her where this track is)
      add('F:' + f.n, f.n, f, null, f.iff || (f.a && f.a.iff) || (f.b && f.b.iff) || null, r, vc, vo, tc, dc, (f.a && f.a.p) || (f.b && f.b.p) || null, on);
    }
    // (one scanner's contact: only its range rate's known; her own speed along the way to it (the middle of its fan: near enough)
    // taken out of it, what's left is its own)
    const own = (sc: RScan, c: RContact) => -(c.vr + dirOf(sc.ax, wrap(c.A + sc.off), 0, _w).applyQuaternion(su.Q).dot(su.V));
    for (const sc of su.scans) for (const c of sc.cons) {
      if ((c.hits < 2 && !((c.sg || 0) > 0 && (c.sg || 0) < WPN.sig && own(sc, c) > WPN.vc)) || inF.has(c) || /* (one look's enough for a weapon: its Doppler says how fast it's closing) */ TAU / sc.rate * 1.5 < 0) continue;
      const on = em.some((e) => { const d = e.from.clone().sub(su.P), R = d.length(); d.applyQuaternion(qi); return Math.abs(wrapPi(angOf(sc.ax, d)[0] - wrap(c.A + sc.off))) < 4 * D2R && Math.abs(R - c.r) < Math.max(150, 0.08 * c.r); });
      add('C:' + c.n, c.n, null, c, c.iff || null, c.r, -c.vr, own(sc, c), -1, c.r, c.p, on); // (one scanner's: no 3D course, its range rate is its closing speed)
    }
    for (const k of [...su.assHold.keys()]) if (!seen.has(k)) su.assHold.delete(k);
    if (su.wpn) for (const [k, t] of [...su.wpn]) if (now - t > 10) su.wpn.delete(k); // (what's been a weapon, kept 10 s from the last it was one)
    su.ass = out.sort((a, b) => b.score - a.score || a.r - b.r);
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
  // A plot says she's somewhere on an arc: along its scanner's fan (e) at its range, from where that scanner was (c.o, c.q: the
  // level's frame). A tracker sweeping it looks at those points from its own mount (on her flank, not on the scanner's mast: close
  // in, the way to each is quite different): the way to the point at e, in her frame now (out), and how far it is (returned: its
  // range gate there)
  const _cp = new T.Vector3();
  function cueDir(su: RSuite, tr: RTrack, c: NonNullable<RTrack['cue']>, e: number, out: THREE.Vector3, now = -1) {
    const k = c.con; // (the contact it was cued on, if any: its filters say where it is now, not where the peak was)
    if (k && now >= 0) { const sc = su.scans[c.k], dt = now - k.t; dirOf(c.ax, wrap(k.A + k.vA * dt + sc.off), e, _cp).applyQuaternion(su.Q).multiplyScalar(k.r + k.vr * dt).add(sc.at.clone().applyQuaternion(su.Q).add(su.P)); }
    else dirOf(c.ax, c.phi, e, _cp).applyQuaternion(c.q).multiplyScalar(c.r).add(c.o);
    out.copy(_cp).sub(_w.copy(tr.at).applyQuaternion(su.Q).add(su.P)); const R = out.length();
    out.divideScalar(R || 1).applyQuaternion(_qi.copy(su.Q).invert()); return R;
  }
  // cue a tracker on a plot: the one whose side it's on, an idle one first
  function cue(su: RSuite, p: RPlot) {
    // (a contact that's part of a 3D track: the tracker that can see it is pointed straight at where the track has it going, and
    // locks there if the return's there (a spiral round it only if it isn't); no sweep along the strip. Only a contact without
    // a 3D fix (one scanner's: a fan, its place along it not known) is swept for)
    const con = su.scans[p.k].cons.find((c) => c.p === p);
    const f = su.fus.find((q) => (q.a && q.a.p === p) || (q.b && q.b.p === p) || (!!con && ((q.a && q.a.n === con.n) || (q.b && q.b.n === con.n))));
    if (f) {
      const tr = su.trks.filter((t) => t.st !== 'track' && !t.off).find((t) => inSide(t, f.pl.clone().sub(t.at.clone().applyQuaternion(su.Q).add(su.P)).normalize().applyQuaternion(su.Q.clone().invert())));
      if (tr) { drop(tr); tr.st = 'slew'; tr.hand = { p: f.pl.clone(), v: f.v.clone(), t: f.kf.t, sig: f.kf.sig() }; dgOf(tr).sweep = []; return tr; }
    }
    const sc = su.scans[p.k], d0 = dirOf(sc.ax, p.phi, 0), want = Math.abs(d0.x) > 0.2 ? (d0.x > 0 ? 1 : -1) : 0; // (a fan's middle well off to one side: that side's tracker; near her middle line, both)
    const ok = su.trks.filter((t) => !t.off && (!want || t.side === want));
    // (a 'y' plot's side is known: its tracker's cued. An 'x' plot's fan runs across her, either side: every tracker not already
    // tracking is cued, each sweeps its own half, and the first to find her keeps it (trackStep drops the others))
    const free = ok.filter((t) => t.st !== 'track'), use = want ? [free.find((t) => t.st === 'idle') || free[0] || ok[0]] : free.length ? free : [ok[0]];
    const pq = (p.q || su.Q).clone(), cueOf = { k: p.k, ax: sc.ax, phi: p.phi, r: p.r, q: pq, o: (p.o || su.P).clone().add(sc.at.clone().applyQuaternion(pq)), con: sc.cons.find((c) => c.p === p) || null };
    for (const tr of use) { if (!tr) continue; tr.hand = null; dgOf(tr).sweep = []; tr.st = 'slew'; tr.cue = cueOf; tr.sw = -sc.fan; tr.best = { db: -99, b: new T.Vector3(), r: p.r }; tr.tgt = null; tr.lockT = 0; tr.lost = 0; tr.est = { p: null, v: new T.Vector3(), q: 0 }; }
    return use[0] || null;
  }
  // one tracker sent by its operator (js/space.ts trkSend): on a plot (as cue, but only it), or along a bearing (cueRay)
  // whether a tracker can see a point (the level's frame): in its half of the sky from its mount
  const canSee = (su: RSuite, tr: RTrack, p: THREE.Vector3) => inSide(tr, p.clone().sub(tr.at.clone().applyQuaternion(su.Q).add(su.P)).normalize().applyQuaternion(su.Q.clone().invert()));
  // one tracker sent along a bearing (a radar warning's: from her, the way d, level frame): a spiral round it, its gate open
  function cueRay(su: RSuite, tr: RTrack, d: THREE.Vector3, now: number) { if (tr.off) return; drop(tr); tr.st = 'slew'; tr.hand = { p: su.P.clone().addScaledVector(d.clone().normalize(), 5000), v: new T.Vector3(), t: now, ray: true }; }
  function cueOne(su: RSuite, tr: RTrack, p: RPlot) {
    if (tr.off) return; const f = su.fus.find((q) => (q.a && q.a.p === p) || (q.b && q.b.p === p));
    if (f && f.kf.n >= 3) { drop(tr); tr.st = 'slew'; tr.hand = { p: f.pl.clone(), v: f.v.clone(), t: f.kf.t, sig: f.kf.sig() }; return; }
    const keep = su.trks.map((t) => t.off); su.trks.forEach((t) => { if (t !== tr) t.off = true; }); cue(su, p); su.trks.forEach((t, i) => { t.off = keep[i]; }); // (the others held back for the moment: only it's sent)
  }
  const drop = (tr: RTrack) => { tr.dop = null; tr.spiral = null; tr.meas = null; tr.hist = []; if (tr.dg) { tr.dg.series = []; tr.dg.errs = []; } tr.hand = null; tr.w.set(0, 0, 0); tr.dE.set(0, 0, 0); tr.dA = 0; tr.dP = 0; tr.st = 'idle'; tr.cue = null; tr.tgt = null; tr.lockT = 0; tr.est = { p: null, v: new T.Vector3(), q: 0 }; tr.db = -99; };
  // the boresight turned toward `to` no faster than the turret can
  function slewTo(tr: RTrack, to: THREE.Vector3, max: number) { const ang = tr.b.angleTo(to); if (ang <= max) tr.b.copy(to); else { const ax = _w.crossVectors(tr.b, to); if (ax.lengthSq() < 1e-12) ax.set(0, 1, 0); tr.b.applyAxisAngle(ax.normalize(), max); } tr.b.normalize(); return ang; }
  const inSide = (tr: RTrack, b: THREE.Vector3) => b.x * tr.side > -MASK; // (a tracker sees its own flank's half of the sky)
  const dgOf = (tr: RTrack) => tr.dg || (tr.dg = { ring: new Float32Array(32), gate: new Float32Array(41), errs: [], rerr: 0, series: [], sweep: [] });
  // What the tracker's beam (axis a) gets back from everything in its range gate: the returns (each one's way from the mount, its
  // signal over the noise at the beam's middle, its range) and their sum through the beam that way (the beam's gain off its axis,
  // exp(-AG theta^2)). It can't tell them apart: the conical scan steers on their sum (to their power-weighted middle), and the
  // range gate follows their power-weighted range. id is the strongest of them (for the debug view only).
  function beam(su: RSuite, tr: RTrack, a: THREE.Vector3, targets: RTarget[], gate: number | null, vgate: { c: number; h: number } | null = null, gw?: number) { // (gw: the range gate's half-width, if not its usual)
    const rs: { d: THREE.Vector3; s: number; R: number; id: string; rr: number }[] = []; let sum = 0, rw = 0, vw = 0, best = 0, id: string | null = null; const d = new T.Vector3();
    const vg = vgate ? vgate : tr.st === 'track' && tr.dop != null && tr.lockT > 0.5 ? { c: tr.dop, h: DOP.gate } : null; // (locked a moment: its velocity gate on what it's locked on, as well as its range gate)
    for (const t of targets) {
      if (t.id === su.id) continue;
      const { R, sig, rr } = look(su, tr.at, t, d);
      if (blocked(_bf.copy(tr.at).applyQuaternion(su.Q).add(su.P), t.p, t.id)) continue;
      if (vg != null && Math.abs(rr - vg.c) > vg.h) continue;
      if (gate != null && Math.abs(R - gate) > (gw != null ? gw : Math.max(150, gate * TRK.gate))) continue;
      const th = a.angleTo(d); if (th > TRK.bw * 2.5) continue;
      const s0 = Math.pow(10, snrDb(TRK.R0, sig, R) / 10), g = s0 * Math.exp(-AG * th * th); rs.push({ d: d.clone(), s: s0, R, id: t.id, rr });
      sum += g; rw += g * R; vw += g * rr; if (g > best) { best = g; id = t.id; }
    }
    return { db: sum > 0 ? 10 * Math.log10(sum) : -99, id, R: sum > 0 ? rw / sum : 0, rr: sum > 0 ? vw / sum + gauss() * DOP.sd : 0, rs };
  }
  // (acquiring with a Doppler to go on: its range gate open, its velocity gate round the rate expected, wide for what may be
  // accelerating (a motor burning): what's at any range in the beam closing at about that rate is it, what isn't (her behind
  // it on the same bearing, a cloud of chaff) isn't)
  const acqGate = (vr: number | null | undefined, age = 0) => (vr == null ? null : { c: vr - WACC * Math.max(0, age) / 2, h: 150 + 0.4 * Math.abs(vr) + WACC * Math.max(0, age) / 2 }); // (age: how old the rate is; something under a motor may be closing up to WACC m/s2 faster by now: the gate widened that way only, its opening side where it was)
  // how far round a handed place to look, as an angle from here: three sigma of where it may be (its own uncertainty, grown by how
  // old it is: 30 m/s of not knowing a second), over the range; a bearing alone (a radar warning), three beams
  function spanOf(h: { t: number; ray?: boolean; sig?: number }, rng: number, now: number) {
    if (h.ray || h.sig == null) return 3 * TRK.bw;
    const s = Math.hypot(h.sig, 30 * Math.max(0, now - h.t)) * 3 + 20;
    return Math.min(3 * TRK.bw, Math.max(0.5 * TRK.bw, Math.atan2(s, Math.max(1, rng))));
  }
  // A track that's lost its return (behind a rock, a ship between, fading): held in MEMORY a while, on its solution. The boresight
  // goes where the solution has her, the range gate and the velocity gate where it has her range and her rate, both opened as the
  // time without her grows; a return back in them, and where the solution says she'd be (its 3D place within three sigma of it), is
  // her, and the track goes on. Anything else in the gates isn't taken: a rock drifting in the notch's way, chaff. Not found in
  // MEM.max seconds, or the solution's grown too unsure to point at (MEM.sig beams off), she's let go.
  const MEM = { max: 6, vgrow: 25, rgrow: 60, sig: 2.5 };
  const TRK_LOCKG = 150; // (a locked tracker's range gate, m either side: it moves on with her Doppler every step, so it stays on her)
  function trackStep(su: RSuite, tr: RTrack, dt: number, targets: RTarget[], now: number) {
    if (tr.st === 'idle') { tr.a.copy(tr.b); return; }
    if (tr.st === 'slew' && tr.hand) { // (a handover: straight onto where the other tracker's solution has her, and tracking)
      const h = tr.hand, mt = tr.at.clone().applyQuaternion(su.Q).add(su.P), pt = h.p.clone().addScaledVector(h.v, now - h.t), to = pt.clone().sub(mt).normalize().applyQuaternion(_qi.copy(su.Q).invert());
      if (now - h.t > 3) { drop(tr); return; } // (not there in 3 s: her solution's gone stale)
      if (slewTo(tr, to, TRK.stab * dt) < 1 * D2R) { tr.st = 'acq'; tr.spiral = { t: 0, best: -99, b: new T.Vector3(), r: pt.distanceTo(mt), p: h.p.clone(), v: h.v.clone(), t0: h.t, ray: h.ray, span: spanOf(h, pt.distanceTo(mt), now) }; tr.hand = null; }
      tr.a.copy(tr.b); return;
    }
    if (tr.st === 'acq' && tr.spiral) {
      // (on where a 3D track has her: a spiral round that point out to three beam widths (an Archimedean one, a beam width a turn),
      // its range gate at the point's range; the strongest return on the way is where she is. A track's place far off can be some
      // way out: further than half a beam, and the beam alone, pointed there, would hear nothing)
      const sp = tr.spiral, mt = tr.at.clone().applyQuaternion(su.Q).add(su.P), pt = sp.p.clone().addScaledVector(sp.v, now - sp.t0), c0 = pt.clone().sub(mt), rng = c0.length(); c0.normalize().applyQuaternion(_qi.copy(su.Q).invert());
      // (out to as far as her place may be off, seen from here (span: the handed track's uncertainty over its range, three sigma,
      // between half a beam and three beams): a far one's a tight spiral, a near one's wide; a beam width a turn, so nothing's missed)
      const span = sp.span || 3 * TRK.bw, turns = Math.max(1, span / TRK.bw);
      sp.t += dt; const T0 = 0.55 * turns, f = Math.min(1, sp.t / T0), ang = f * turns * TAU, rad = f * span;
      const e1 = new T.Vector3(), e2 = new T.Vector3(); (Math.abs(c0.y) < 0.9 ? e1.set(0, 1, 0) : e1.set(1, 0, 0)).cross(c0).normalize(); e2.crossVectors(c0, e1);
      tr.b.copy(c0).addScaledVector(e1, Math.cos(ang) * Math.tan(rad)).addScaledVector(e2, Math.sin(ang) * Math.tan(rad)).normalize(); tr.a.copy(tr.b); tr.rng = rng;
      const evr = sp.ray ? null : sp.v.clone().sub(su.V).dot(pt.clone().sub(mt).normalize()), vgS = acqGate(evr, now - sp.t0);
      if (inSide(tr, tr.b)) { const r = beam(su, tr, tr.b, targets, sp.ray || vgS ? null : rng, vgS); dgOf(tr).sweep.push({ e: rad, db: r.db }); if (r.db > THR) illum(r.id, su, tr, now); if (r.db + gauss() * 1.2 > sp.best) { sp.best = r.db; sp.b.copy(tr.b).applyQuaternion(su.Q); sp.r = r.R || rng; sp.dr = sp.r - rng; sp.bt = now; sp.bv = r.rr; } } // (along a bearing: its gate open, any range)
      if (f >= 1 || (sp.best > THR + 6 && rad < TRK.bw)) { // (done; or strong already, near the middle: no need to go on round)
        if (sp.best > THR) { tr.b.copy(sp.b).applyQuaternion(_qi.copy(su.Q).invert()); tr.st = 'track'; tr.dop = null; tr.rng = sp.bv != null && sp.bt != null ? sp.r + sp.bv * (now - sp.bt) : rng + (sp.dr || 0); tr.lockT = 0; /* (where the best return was, moved on at its Doppler since) */ /* (its gate where the best return was against the track's point, carried on to now: something closing fast isn't where it was a second ago) */ tr.lost = 0; tr.err = 0; tr.w.set(0, 0, 0); tr.dE.set(0, 0, 0); tr.dA = 0; tr.dP = 0; tr.spiral = null; }
        else drop(tr);
      }
      return;
    }
    if (tr.st === 'slew' || tr.st === 'acq') {
      const c = tr.cue!, sc = su.scans[c.k];
      if (tr.st === 'slew') { const to = new T.Vector3(); tr.rng = cueDir(su, tr, c, -sc.fan, to, now); if (slewTo(tr, to, TRK.slew * dt) < 1 * D2R) tr.st = 'acq'; tr.a.copy(tr.b); return; }
      // along the fan, its range gate at the plot's range: the strongest return on the way is where she is
      tr.sw += TRK.acq * dt; const gate = cueDir(su, tr, c, Math.min(tr.sw, sc.fan), tr.b, now); tr.rng = gate; tr.a.copy(tr.b);
      const vgF = acqGate(c.con ? c.con.vr : null, c.con ? now - c.con.t : 0);
      let past = false; // (with a velocity gate nothing else in the fan can be it: a strong peak gone by is her, no need to sweep the rest)
      if (inSide(tr, tr.b)) { const r = beam(su, tr, tr.b, targets, vgF ? null : gate, vgF); dgOf(tr).sweep.push({ e: tr.sw, db: r.db }); if (r.db > THR) illum(r.id, su, tr, now); if (r.db + gauss() * 1.2 > tr.best.db) { tr.best.db = r.db; tr.best.r = vgF && r.R ? r.R : gate; tr.best.t = now; tr.best.v = vgF ? r.rr : null; tr.best.b.copy(tr.b).applyQuaternion(su.Q); } past = !!vgF && tr.best.db > THR + 6 && r.db < tr.best.db - 9; }
      if (tr.sw >= sc.fan || past) {
        if (tr.best.db > THR) { for (const o of su.trks) if (o !== tr && o.cue === c && o.st !== 'track') drop(o); tr.b.copy(tr.best.b).applyQuaternion(_qi.copy(su.Q).invert()); tr.st = 'track'; tr.dop = null; tr.rng = tr.best.v != null && tr.best.t != null ? tr.best.r + tr.best.v * (now - tr.best.t) : gate; tr.lockT = 0; /* (the gate where the cue's contact is now, not where it was when the best return came back) */ tr.lost = 0; tr.w.set(0, 0, 0); tr.dE.set(0, 0, 0); tr.dA = 0; tr.dP = 0; }
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
    const es0 = tr.est, mkf = tr.lost > 0 && es0.kf && es0.kf.n >= 4 ? es0.kf : null; // (in memory: MEM, above)
    if (mkf) {
      mkf.pred(now, ACC3 * ACC3);
      const mt = tr.at.clone().applyQuaternion(su.Q).add(su.P), pp = mkf.pos(new T.Vector3()), los = pp.sub(mt), rngP = los.length(); los.divideScalar(Math.max(1e-6, rngP));
      tr.dop = mkf.vel(new T.Vector3()).sub(su.V).dot(los); tr.rng = rngP; tr.b.copy(los).applyQuaternion(_qi.copy(su.Q).invert()); tr.w.set(0, 0, 0);
    } else tr.b.addScaledVector(tr.w, dt).normalize();
    (Math.abs(tr.b.y) < 0.9 ? e1.set(0, 1, 0) : e1.set(1, 0, 0)).cross(tr.b).normalize(); e2.crossVectors(tr.b, e1);
    const bd = mkf ? beam(su, tr, tr.b, targets, tr.rng, { c: tr.dop!, h: DOP.gate + MEM.vgrow * tr.lost }, Math.max(150, tr.rng * TRK.gate) + MEM.rgrow * tr.lost) : beam(su, tr, tr.b, targets, tr.rng, null, tr.lockT > 1 ? TRK_LOCKG : undefined), dph = TAU * TRK.hz * dt / N; // (locked a second: its gate a pulse's width round where it's following her, not acquisition's 6% of the range: at 50 km the beam's 2.6 km across, and what else is in it isn't let in by range)
    for (let i = 0; i < N; i++) {
      tr.ph = (tr.ph + dph) % TAU; tr.dP += dph;
      uv.copy(e1).multiplyScalar(Math.cos(tr.ph)).addScaledVector(e2, Math.sin(tr.ph));
      tr.a.copy(tr.b).addScaledVector(uv, Math.tan(TRK.sq)).normalize();
      let g = 0; for (const q of bd.rs) { const th = tr.a.angleTo(q.d); g += q.s * Math.exp(-AG * th * th); } // (what comes back with the beam's axis there: all of it)
      tr.dE.addScaledVector(uv, g); tr.dA += g; dgOf(tr).ring[Math.floor(tr.ph / TAU * 32) % 32] = g * (1 + gauss() * 0.15 / Math.sqrt(1 + g));
    }
    tr.db = bd.db;
    // her going round toward the other side (the overlap where both turrets can see): the other tracker, if it's free, is handed
    // the track, so it's held as she crosses from one half of the sky to the other
    const oth = su.trks.find((o) => o !== tr);
    if (oth && oth.st === 'idle' && !oth.off && tr.est.p && tr.est.q > 0.3 && tr.b.x * tr.side < 0.05 && inSide(oth, _w.copy(tr.est.p).sub(_v.copy(oth.at).applyQuaternion(su.Q).add(su.P)).normalize().applyQuaternion(_qi.copy(su.Q).invert()))) { drop(oth); // (only if she's in its half of the sky, from its own mount)
      oth.st = 'slew'; oth.hand = { p: tr.est.p.clone(), v: tr.est.v.clone(), t: now, sig: tr.est.kf ? tr.est.kf.sig() : undefined }; }
    let seen = bd.rs.length > 0 && bd.db >= THR - 4 && inSide(tr, tr.b);
    if (seen && mkf) { // (back from memory only on her: the return's place, along the boresight at its range, within three sigma of the solution's (and the beam's own width across))
      const pm = _w.copy(tr.b).applyQuaternion(su.Q).multiplyScalar(bd.R).add(_v.copy(tr.at).applyQuaternion(su.Q).add(su.P));
      seen = pm.distanceTo(mkf.pos(new T.Vector3())) < 3 * mkf.sig() + 50 + bd.R * Math.tan(TRK.bw * 0.5);
    }
    if (!seen) {
      tr.lost += dt; tr.dE.set(0, 0, 0); tr.dA = 0; tr.dP = 0; // (the conical scan's sums say nothing meanwhile)
      const kf = es0.kf;
      if (!kf || kf.n < 4) { if (tr.lost > 0.5) drop(tr); return; } // (no solution to go on: let go, as ever)
      if (tr.lost > MEM.max || kf.sig() / Math.max(1, tr.rng) > MEM.sig * TRK.bw || !inSide(tr, tr.b)) { drop(tr); return; }
      kf.pred(now, ACC3 * ACC3); es0.p = kf.pos(es0.p || new T.Vector3()); kf.vel(es0.v); es0.q = Math.min(es0.q, 0.5 * (1 - tr.lost / MEM.max)); // (its solution carried on, worth less the longer she's not seen)
      return;
    }
    tr.lost = 0; tr.tgt = bd.id; tr.lockT += dt; illum(bd.id, su, tr, now, true);
    let rev = false, sa = 0;
    if (tr.dP >= TAU && tr.dA > 0) {
      // the error: <G u> / (<G> AG sq) is the target's offset from the boresight (exact while she's well inside the beam; it can't
      // say more than about the squint's worth beyond that), noisier the weaker she is
      const Tc = tr.dP / (TAU * TRK.hz), eps = tr.dE.multiplyScalar(1 / (tr.dA * AG * TRK.sq)), snr = Math.pow(10, bd.db / 10), nz = TRK.bw * 0.6 / Math.sqrt(snr);
      eps.addScaledVector(e1, gauss() * nz).addScaledVector(e2, gauss() * nz);
      eps.addScaledVector(tr.b, -eps.dot(tr.b)); // (in the plane square to the boresight)
      tr.err = tr.err * 0.6 + eps.length() * 0.4;
      { const dg = dgOf(tr); dg.errs.push([eps.dot(e1) / TRK.bw, eps.dot(e2) / TRK.bw]); if (dg.errs.length > 30) dg.errs.shift(); }
      slewTo(tr, tr.b.clone().add(eps).normalize(), TRK.slew * Tc);
      tr.w.multiplyScalar(0.98).addScaledVector(eps, 0.5 / Tc); tr.w.addScaledVector(tr.b, -tr.w.dot(tr.b)); // (an integrator, a little leaky: a steady crossing rate is learnt, and no lag is left behind it)
      if (tr.w.length() > TRK.slew) tr.w.setLength(TRK.slew);
      tr.dE.set(0, 0, 0); tr.dA = 0; tr.dP = 0; tr.rev = (tr.rev || 0) + 1; rev = true;
      sa = Math.max(0.02 * D2R, TRK.bw * 0.5 / Math.sqrt(snr) + 0.3 * tr.err); // (its angle's uncertainty this revolution: the noise's, and what's left of its error)
    }
    // range from the gate (it follows her), and the firing solution: alpha-beta on where that puts her
    { // (the range gate: the power across it, 10 m a bin, each return spread over its pulse's 25 m; and how far its middle's off)
      const dg = dgOf(tr); dg.gate.fill(0);
      for (const q of bd.rs) { const th = tr.b.angleTo(q.d), pw = q.s * Math.exp(-AG * th * th); for (let j = 0; j < dg.gate.length; j++) { const off = q.R - (tr.rng + (j - (dg.gate.length - 1) / 2) * 10); dg.gate[j] += pw * Math.max(0, 1 - Math.abs(off) / 25); } }
      for (let j = 0; j < dg.gate.length; j++) dg.gate[j] += -Math.log(1 - Math.random()); dg.rerr = bd.R - tr.rng;
    }
    tr.dop = tr.dop == null ? bd.rr : tr.dop + (bd.rr - tr.dop) * Math.min(1, dt * 8); // (its Doppler, a little smoothed)
    tr.rng = tr.rng + tr.dop * dt + (bd.R * (1 + gauss() * 0.002) - tr.rng) * Math.min(1, dt * 12); // (the gate moved on at the Doppler's rate, and pulled onto the return: no lag behind something fast)
    // (the firing solution: a Kalman filter on where its gate and boresight put her, once a revolution (a measurement a
    // revolution: within one, the boresight's error is the same error, not a fresh one): unsure by a few metres in range and by
    // that revolution's angle uncertainty across; carried forward every step between)
    const l = tr.b.clone().applyQuaternion(su.Q), p = l.clone().multiplyScalar(tr.rng).add(tr.at.clone().applyQuaternion(su.Q).add(su.P)), es = tr.est;
    if (!es.kf) es.kf = new KF3(p, new T.Vector3(), 10 + tr.rng * TRK.bw / 4, 150, now); else es.kf.pred(now, ACC3 * ACC3);
    if (rev) { const R = Rlos(l, 3 + 0.002 * tr.rng, tr.rng * sa); es.kf.upd(p, R); tr.meas = { p: p.clone(), R }; }
    es.p = es.kf.pos(es.p || new T.Vector3()); es.kf.vel(es.v);
    es.q = Math.min(1, tr.lockT / 1.5) * Math.max(0, 1 - tr.err / (TRK.bw * 0.5)) * (es.kf.n > 6 ? 1 : es.kf.n / 6);
    const h = tr.hist || (tr.hist = []); if (!h.length || now - h[h.length - 1].t > 0.1) { h.push({ t: now, p: es.p!.clone() }); while (now - h[0].t > 8) h.shift(); const se = dgOf(tr).series; se.push({ t: now, err: tr.err, q: es.q }); while (now - se[0].t > 8) se.shift(); }
  }
  // the best track she has on a target: a tracker holding it, and how good its solution is
  function lockOn(su: RSuite | null, id: string) { if (!su) return null; let b: RTrack | null = null; for (const t of su.trks) if (t.st === 'track' && t.tgt === id && (!b || t.est.q > b.est.q)) b = t; return b; } // (the truth: for the debug view)
  // her best track on whatever it's on (what her fire control has: it doesn't know what it is)
  function best(su: RSuite | null) { if (!su) return null; let b: RTrack | null = null; for (const t of su.trks) if (t.st === 'track' && (!b || t.est.q > b.est.q)) b = t; return b; }
  // a target's return from where a radar at `from` (level frame) sees her, and the range it would detect her at
  function rcsToward(t: RTarget, from: THREE.Vector3) { const u = from.clone().sub(t.p).normalize().applyQuaternion(t.q.clone().invert()); return rcsAt(t.rcs, u); }
  const warnClear = () => { lit.clear(); painted.clear(); }; // (a new sortie: nobody's radar on anyone yet)
  // A suite's frame moved under it (the level's changed to another ship out here, the same space: x' = R x + t): everything it holds
  // in the level's frame moved with it, velocities turned (what it holds in her own frame, as it was)
  function rebase(su: RSuite, R: THREE.Quaternion, t: THREE.Vector3) {
    const mv = (v: THREE.Vector3 | null | undefined) => { if (v) v.applyQuaternion(R).add(t); }, tv = (v: THREE.Vector3 | null | undefined) => { if (v) v.applyQuaternion(R); }, tq = (q: THREE.Quaternion | null | undefined) => { if (q) q.premultiply(R); };
    mv(su.P); tq(su.Q); mv(su.Pp); tq(su.Qp); tv(su.V);
    const plots = new Set<RPlot>(); for (const sc of su.scans) { for (const p of sc.plots) plots.add(p); for (const q of sc.pend) plots.add(q.p); for (const c of sc.cons) plots.add(c.p); }
    for (const p of plots) { mv(p.o); tq(p.q); }
    for (const f of su.fus) { mv(f.pl); tv(f.v); } for (const kf of su.fusKF.values()) kf.move(R, t); for (const h of su.fusHist.values()) for (const q of h) mv(q.p);
    for (const tr of su.trks) {
      mv(tr.est.p); tv(tr.est.v); if (tr.est.kf) tr.est.kf.move(R, t); if (tr.hist) for (const q of tr.hist) mv(q.p);
      if (tr.hand) { mv(tr.hand.p); tv(tr.hand.v); } if (tr.spiral) { mv(tr.spiral.p); tv(tr.spiral.v); tq(tr.spiral.b ? null : null); if (tr.spiral.b) tr.spiral.b.applyQuaternion(R); }
      if (tr.cue) { mv(tr.cue.o); tq(tr.cue.q); } if (tr.best) tr.best.b.applyQuaternion(R); tr.meas = null;
    }
    lit.clear(); painted.clear(); // (who's on whom: heard again within a moment)
  }
  return { binOf, rangeOf, occ, blocked, rebase, canSee, cueRay, cueOne, warnClear, perOf, show: 0, sel: 'own', litOn, litTrk, paintsOn, arcAt, AG, spin, rcsOf, rcsAt, rcsToward, suite, step, cue, drop, lockOn, best, MAP, wrapPi, dirOf, angOf, snrDb, detRange, THR, SCAN, TRK, NAZ, NEL, cache };
})();
