/*
 * A rigid box dropped into a space bounded by flat surfaces (a floor, optionally walls), simulated,
 * so that every contact it makes can be turned into a sound: when it lands, on which part of the
 * box, against which surface, how hard, and where it slides.
 *
 * The box (e.g. a magazine) has its long axis along body x (+x = top end, -x = bottom end),
 * width along y and thickness along z. Its 8 corners touch the surfaces through a stiff
 * spring-damper (a penalty contact, ~0.5 ms long, damped to the surface's restitution) with
 * Coulomb friction, so landings, bounces, tips, rocking and slides all come out of the motion. A
 * flat landing is 4 corners touching within a millisecond; an edge, 2; a corner, 1.
 *
 * Optionally the box carries loose contents on a spring along its long axis (a magazine's stack of
 * rounds, or its bare follower): driven by the box's own acceleration, they compress the spring,
 * bounce back into the top stop, or bottom it out, and those internal knocks are reported too.
 */

export type Vec3 = [number, number, number];
export type Quat = [number, number, number, number]; // w, x, y, z (body -> world)

export interface BoxContents {
  /** kg */
  mass: number;
  /** Centre of the contents along body x when resting against the top stop, m. */
  x: number;
  /** Length of the contents along x (for inertia), m. */
  length: number;
  /** Spring rate pushing the contents toward +x, N/m, and its force at the top stop, N. */
  springRate: number;
  preload: number;
  /** How far the contents can move toward -x before the spring is solid, m. */
  travel: number;
  /** Viscous loss of the contents moving (rubbing the walls), N·s/m. */
  damping: number;
}

/**
 * A surface the box can hit: either a plane (the space is where n·x > d), or a solid axis-aligned
 * block (`block`: a low wall, a kerb) that pushes a corner out through whichever of its faces is
 * nearest, so its top, sides and ends all work.
 */
export interface Surface {
  name: string;
  /** Unit normal pointing into the space (plane). */
  normal?: Vec3;
  d?: number;
  block?: { min: Vec3; max: Vec3 };
  restitution: number;
  friction: number;
  /** Contact stiffness per corner, N/m. */
  stiffness: number;
}

export interface BoxDrop {
  /** Length (x), width (y), thickness (z), m. */
  dims: Vec3;
  /** Mass of the box itself, kg. */
  mass: number;
  contents?: BoxContents;
  surfaces: Surface[];
  /** Initial pose and motion of the box centre. */
  position: Vec3;
  orientation: Quat;
  velocity: Vec3;
  /** Angular velocity, world frame, rad/s. */
  spin: Vec3;
  /** Simulated time, s. */
  duration: number;
  dt?: number;
  /** Record the pose this many times a second (for drawing). 0 = off. */
  traceRate?: number;
}

/** Which part of the box a contact is on. */
export type BoxPart =
  | 'bottom-end' | 'top-end'            // a whole end face (floorplate / feed lips)
  | 'bottom-end-edge' | 'top-end-edge'  // one edge of an end
  | 'bottom-corner' | 'top-corner'
  | 'broad-side'                         // a whole broad (x-y) face
  | 'narrow-side'                        // a whole narrow (x-z) face
  | 'long-edge';                         // an edge running along the length

export interface BoxContact {
  /** Start time, s. */
  t: number;
  surface: string;
  part: BoxPart;
  /** Corner indices that touched (bit 0: +x, bit 1: +y, bit 2: +z). */
  corners: number[];
  /** Where it touched (mean of the corners at touchdown), world, m. */
  point: Vec3;
  /** Approach speed of the fastest corner, m/s. */
  speed: number;
  /** Normal impulse over the contact, N·s. */
  impulse: number;
  /** Sliding speed along the surface at touchdown, m/s. */
  slip: number;
}

export interface BoxSlide {
  t: number;
  duration: number;
  surface: string;
  /** Mean sliding speed and normal force while sliding. */
  speed: number;
  force: number;
  part: BoxPart;
}

export interface InternalKnock {
  t: number;
  /** 'top': the contents hit the top stop; 'bottom': the spring went solid. */
  end: 'top' | 'bottom';
  /** Relative speed, m/s. */
  speed: number;
}

export interface SpringLaunch {
  /** The contents leave the top stop and ride the spring. */
  t: number;
  speed: number;
}

export interface PoseSample {
  t: number;
  /** Box centre (not the centre of mass), world. */
  position: Vec3;
  orientation: Quat;
  /** Contents' displacement from the top stop toward -x, m. */
  contents: number;
}

export interface BoxDropResult {
  contacts: BoxContact[];
  slides: BoxSlide[];
  knocks: InternalKnock[];
  launches: SpringLaunch[];
  trace: PoseSample[];
  /** When it came to rest (or the end of the simulation), s. */
  restT: number;
}

const G = 9.81;

function qmul(a: Quat, b: Quat): Quat {
  return [
    a[0] * b[0] - a[1] * b[1] - a[2] * b[2] - a[3] * b[3],
    a[0] * b[1] + a[1] * b[0] + a[2] * b[3] - a[3] * b[2],
    a[0] * b[2] - a[1] * b[3] + a[2] * b[0] + a[3] * b[1],
    a[0] * b[3] + a[1] * b[2] - a[2] * b[1] + a[3] * b[0],
  ];
}
function qnorm(q: Quat): Quat {
  const n = Math.hypot(q[0], q[1], q[2], q[3]);
  return [q[0] / n, q[1] / n, q[2] / n, q[3] / n];
}
/** Rotation matrix (row-major) of a unit quaternion. */
export function quatMatrix(q: Quat): number[] {
  const [w, x, y, z] = q;
  return [
    1 - 2 * (y * y + z * z), 2 * (x * y - w * z), 2 * (x * z + w * y),
    2 * (x * y + w * z), 1 - 2 * (x * x + z * z), 2 * (y * z - w * x),
    2 * (x * z - w * y), 2 * (y * z + w * x), 1 - 2 * (x * x + y * y),
  ];
}
const mv = (m: number[], v: Vec3): Vec3 => [
  m[0] * v[0] + m[1] * v[1] + m[2] * v[2],
  m[3] * v[0] + m[4] * v[1] + m[5] * v[2],
  m[6] * v[0] + m[7] * v[1] + m[8] * v[2],
];
const mtv = (m: number[], v: Vec3): Vec3 => [
  m[0] * v[0] + m[3] * v[1] + m[6] * v[2],
  m[1] * v[0] + m[4] * v[1] + m[7] * v[2],
  m[2] * v[0] + m[5] * v[1] + m[8] * v[2],
];
const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

/** Quaternion for a rotation of `angle` rad about `axis`. */
export function axisAngle(axis: Vec3, angle: number): Quat {
  const n = Math.hypot(...axis);
  const s = Math.sin(angle / 2) / n;
  return [Math.cos(angle / 2), axis[0] * s, axis[1] * s, axis[2] * s];
}
export const quatMul = qmul;

/** A floor at z = 0 and, optionally, four walls round a square of side `size` centred on the origin. */
export function boxSurfaces(floor: Omit<Surface, 'name' | 'normal' | 'd' | 'block'>, size?: number, wallHeight = 0.1, wallThickness = 0.04, wall = floor): Surface[] {
  const s: Surface[] = [{ name: 'floor', normal: [0, 0, 1], d: 0, ...floor }];
  if (size) {
    const h = size / 2, t = wallThickness, z = wallHeight;
    s.push({ name: 'wall +x', block: { min: [h, -h - t, 0], max: [h + t, h + t, z] }, ...wall });
    s.push({ name: 'wall -x', block: { min: [-h - t, -h - t, 0], max: [-h, h + t, z] }, ...wall });
    s.push({ name: 'wall +y', block: { min: [-h, h, 0], max: [h, h + t, z] }, ...wall });
    s.push({ name: 'wall -y', block: { min: [-h, -h - t, 0], max: [h, -h, z] }, ...wall });
  }
  return s;
}

/** Penetration of a point into a surface: the gap (negative inside) and the outward normal. */
function probe(sf: Surface, p: Vec3): { gap: number; normal: Vec3 } {
  if (sf.block) {
    const { min, max } = sf.block;
    if (p[0] <= min[0] || p[0] >= max[0] || p[1] <= min[1] || p[1] >= max[1] || p[2] <= min[2] || p[2] >= max[2]) return { gap: 1, normal: [0, 0, 1] };
    const pens: [number, Vec3][] = [
      [p[0] - min[0], [-1, 0, 0]], [max[0] - p[0], [1, 0, 0]],
      [p[1] - min[1], [0, -1, 0]], [max[1] - p[1], [0, 1, 0]],
      [max[2] - p[2], [0, 0, 1]],
    ];
    let best = pens[0];
    for (const pe of pens) if (pe[0] < best[0]) best = pe;
    return { gap: -best[0], normal: best[1] };
  }
  const n = sf.normal ?? [0, 0, 1];
  return { gap: n[0] * p[0] + n[1] * p[1] + n[2] * p[2] - (sf.d ?? 0), normal: n };
}

/** Which part of the box a set of corners describes. */
export function classify(corners: number[]): BoxPart {
  const sx = corners.map((c) => c & 1), sy = corners.map((c) => (c >> 1) & 1), sz = corners.map((c) => (c >> 2) & 1);
  const same = (a: number[]) => a.every((v) => v === a[0]);
  const top = sx[0] === 1;
  if (corners.length === 1) return top ? 'top-corner' : 'bottom-corner';
  if (same(sx)) return corners.length >= 3 ? (top ? 'top-end' : 'bottom-end') : (top ? 'top-end-edge' : 'bottom-end-edge');
  if (corners.length === 2) return 'long-edge';
  if (same(sz)) return 'broad-side';
  if (same(sy)) return 'narrow-side';
  return 'long-edge';
}

export function simulateBoxDrop(spec: BoxDrop): BoxDropResult {
  const [L, W, T] = spec.dims;
  const dt = spec.dt ?? 1e-5;
  const c = spec.contents;
  const mShell = spec.mass;
  const mC = c?.mass ?? 0;
  const m = mShell + mC;
  // Centre of mass along x (the contents sit off-centre), and the inertia about it (box as a
  // solid block, contents as a block of their own length).
  const comX = c ? (mC * c.x) / m : 0;
  const Ib: Vec3 = [
    (mShell * (W * W + T * T)) / 12 + (c ? (mC * (W * W + T * T)) / 12 : 0),
    (mShell * (L * L + T * T)) / 12 + mShell * comX * comX + (c ? (mC * (c.length ** 2 + T * T)) / 12 + mC * (c.x - comX) ** 2 : 0),
    (mShell * (L * L + W * W)) / 12 + mShell * comX * comX + (c ? (mC * (c.length ** 2 + W * W)) / 12 + mC * (c.x - comX) ** 2 : 0),
  ];
  const corners: Vec3[] = [];
  for (let i = 0; i < 8; i++) corners.push([((i & 1) ? 0.5 : -0.5) * L - comX, ((i >> 1) & 1 ? 0.5 : -0.5) * W, ((i >> 2) & 1 ? 0.5 : -0.5) * T]);

  const surf = spec.surfaces.map((s) => {
    const e = Math.min(0.95, Math.max(0.02, s.restitution));
    const zeta = -Math.log(e) / Math.sqrt(Math.PI ** 2 + Math.log(e) ** 2);
    return { ...s, cDamp: 2 * zeta * Math.sqrt(s.stiffness * m) };
  });
  const S = surf.length;

  // State: the given position is the box centre; move it to the centre of mass.
  let q = qnorm(spec.orientation);
  let R = quatMatrix(q);
  const comOff = mv(R, [comX, 0, 0]);
  const X: Vec3 = [spec.position[0] + comOff[0], spec.position[1] + comOff[1], spec.position[2] + comOff[2]];
  const V: Vec3 = [...spec.velocity];
  const Wv: Vec3 = [...spec.spin];
  // Contents: s = displacement toward -x from the top stop.
  let s = 0, sv = 0;

  const contacts: BoxContact[] = [];
  const slides: BoxSlide[] = [];
  const knocks: InternalKnock[] = [];
  const launches: SpringLaunch[] = [];
  const trace: PoseSample[] = [];
  const inContact: boolean[][] = surf.map(() => new Array(8).fill(false));
  const open: ((BoxContact & { end: number; n: number }) | null)[] = surf.map(() => null);
  const slide: ({ t: number; last: number; sp: number; f: number; n: number; corners: Set<number> } | null)[] = surf.map(() => null);
  const closeSlide = (k: number) => {
    const sl = slide[k];
    if (sl && sl.last - sl.t > 0.008) slides.push({ t: sl.t, duration: sl.last - sl.t, surface: surf[k].name, speed: sl.sp / sl.n, force: sl.f / sl.n, part: classify([...sl.corners]) });
    slide[k] = null;
  };
  let restSince = -1, restT = spec.duration;
  const steps = Math.round(spec.duration / dt);
  const traceEvery = spec.traceRate ? Math.max(1, Math.round(1 / (spec.traceRate * dt))) : 0;

  for (let step = 0; step < steps; step++) {
    const t = step * dt;
    R = quatMatrix(q);
    if (traceEvery && step % traceEvery === 0) {
      const off = mv(R, [comX, 0, 0]);
      trace.push({ t, position: [X[0] - off[0], X[1] - off[1], X[2] - off[2]], orientation: q, contents: s });
    }
    const F: Vec3 = [0, 0, -m * G];
    const Tq: Vec3 = [0, 0, 0];
    let touching = false;
    const rs = corners.map((p) => mv(R, p));
    const vs = rs.map((r) => { const wr = cross(Wv, r); return [V[0] + wr[0], V[1] + wr[1], V[2] + wr[2]] as Vec3; });
    for (let k = 0; k < S; k++) {
      const sf = surf[k];
      let slipSum = 0, slipN = 0, fSum = 0;
      const sliding: number[] = [];
      for (let i = 0; i < 8; i++) {
        const r = rs[i], vel = vs[i];
        const pos: Vec3 = [X[0] + r[0], X[1] + r[1], X[2] + r[2]];
        const pr = probe(sf, pos);
        const gap = pr.gap, nrm = pr.normal;
        if (gap >= 0) { inContact[k][i] = false; continue; }
        touching = true;
        const vn = dot(nrm, vel);
        if (!inContact[k][i]) {
          inContact[k][i] = true;
          if (vn < -0.04) {
            const vt: Vec3 = [vel[0] - vn * nrm[0], vel[1] - vn * nrm[1], vel[2] - vn * nrm[2]];
            const o = open[k];
            if (o && t - o.t < 0.0015) {
              if (!o.corners.includes(i)) {
                o.corners.push(i);
                o.point = o.point.map((v, j) => (v * o.n + pos[j]) / (o.n + 1)) as Vec3; o.n++;
              }
              o.speed = Math.max(o.speed, -vn);
            } else {
              if (o) contacts.push(o);
              open[k] = { t, surface: sf.name, part: 'bottom-corner', corners: [i], point: pos, n: 1, speed: -vn, impulse: 0, slip: Math.hypot(...vt), end: t + 0.003 };
            }
          }
        }
        const fn = Math.max(0, -sf.stiffness * gap - sf.cDamp * vn);
        const vt: Vec3 = [vel[0] - vn * nrm[0], vel[1] - vn * nrm[1], vel[2] - vn * nrm[2]];
        const vtm = Math.hypot(...vt);
        const ft = vtm > 1e-6 ? (sf.friction * fn) / Math.max(vtm, 0.01) : 0;
        const f: Vec3 = [fn * nrm[0] - ft * vt[0], fn * nrm[1] - ft * vt[1], fn * nrm[2] - ft * vt[2]];
        F[0] += f[0]; F[1] += f[1]; F[2] += f[2];
        const tq = cross(r, f);
        Tq[0] += tq[0]; Tq[1] += tq[1]; Tq[2] += tq[2];
        const o = open[k];
        if (o && o.corners.includes(i) && t < o.end) o.impulse += fn * dt;
        if (fn > 0.05 && vtm > 0.05) { slipSum += vtm; slipN++; fSum += fn; sliding.push(i); }
      }
      const o = open[k];
      if (o && t >= o.end) { contacts.push(o); open[k] = null; }
      // Slides: sustained sliding contact, gaps under 5 ms merged.
      if (slipN > 0) {
        const sl = slide[k];
        if (sl && t - sl.last < 0.005) {
          sl.last = t; sl.sp += slipSum / slipN; sl.f += fSum; sl.n++;
          for (const i of sliding) sl.corners.add(i);
        } else {
          closeSlide(k);
          slide[k] = { t, last: t, sp: slipSum / slipN, f: fSum, n: 1, corners: new Set(sliding) };
        }
      }
    }

    // Linear and angular motion (semi-implicit Euler; Euler's equations in the body frame).
    V[0] += (F[0] / m) * dt; V[1] += (F[1] / m) * dt; V[2] += (F[2] / m) * dt;
    const Lb = mtv(R, Tq);
    const wb = mtv(R, Wv);
    const Iw: Vec3 = [Ib[0] * wb[0], Ib[1] * wb[1], Ib[2] * wb[2]];
    const gyro = cross(wb, Iw);
    const dwb: Vec3 = [(Lb[0] - gyro[0]) / Ib[0], (Lb[1] - gyro[1]) / Ib[1], (Lb[2] - gyro[2]) / Ib[2]];
    const dw = mv(R, dwb);
    Wv[0] += dw[0] * dt; Wv[1] += dw[1] * dt; Wv[2] += dw[2] * dt;
    // A little rolling loss while touching, so rocking dies out.
    if (touching) { const d = 1 - 2 * dt; Wv[0] *= d; Wv[1] *= d; Wv[2] *= d; }
    X[0] += V[0] * dt; X[1] += V[1] * dt; X[2] += V[2] * dt;
    const dq = qmul([0, Wv[0] * dt * 0.5, Wv[1] * dt * 0.5, Wv[2] * dt * 0.5], q);
    q = qnorm([q[0] + dq[0], q[1] + dq[1], q[2] + dq[2], q[3] + dq[3]]);

    // Contents on their spring, driven by the box's acceleration along its axis.
    if (c) {
      const xw = mv(R, [1, 0, 0]);
      const aBody: Vec3 = [F[0] / m, F[1] / m, F[2] / m + G]; // acceleration from contact forces
      // Felt along +x in the box frame: gravity minus the box's acceleration.
      const felt = -G * xw[2] - dot(aBody, xw);
      // Force on the contents toward +x: the spring (and the contents rubbing the walls), plus the
      // top stop pushing back (toward -x) when they press into it, or the solid spring when they
      // bottom it out. The stops are stiff and lossy.
      const kStop = 4e5, cStop = 2 * 0.3 * Math.sqrt(kStop * mC);
      let fc = c.preload + c.springRate * Math.max(0, s) + c.damping * sv;
      if (s < 0) fc += -kStop * -s + cStop * sv;
      if (s > c.travel) fc += kStop * (s - c.travel) + cStop * sv;
      const sPrev = s, svPrev = sv;
      sv += -(felt + fc / mC) * dt;
      s += sv * dt;
      if (sPrev <= 0 && s > 0 && sv > 0.05) launches.push({ t, speed: sv });
      if (sPrev > 0 && s <= 0 && svPrev < -0.05) knocks.push({ t, end: 'top', speed: -svPrev });
      if (sPrev < c.travel && s >= c.travel && svPrev > 0.05) knocks.push({ t, end: 'bottom', speed: svPrev });
    }

    // At rest: barely moving while touching, for 60 ms.
    const still = Math.hypot(...V) < 0.01 && Math.hypot(...Wv) < 0.08 && touching;
    if (still) { if (restSince < 0) restSince = t; if (t - restSince > 0.06) { restT = restSince; break; } } else restSince = -1;
  }
  for (let k = 0; k < S; k++) { const o = open[k]; if (o) contacts.push(o); closeSlide(k); }
  contacts.sort((a, b) => a.t - b.t);
  for (const ct of contacts) { ct.part = classify(ct.corners); delete (ct as Partial<{ end: number; n: number }>).end; delete (ct as Partial<{ end: number; n: number }>).n; }
  slides.sort((a, b) => a.t - b.t);
  return { contacts, slides, knocks, launches, trace, restT };
}
