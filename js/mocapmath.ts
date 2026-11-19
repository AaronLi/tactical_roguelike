'use strict';
// The reckoning behind the reload mocap page (mocap.html, js/mocap.ts): nothing here draws, reads a camera or knows three.js, so node can
// check it (tools/mocap.test.mjs). Points are plain [x, y, z] in metres, in the CAMERA's space as three.js has it: x right, y up, z toward
// the viewer (the camera looks down -z), unless a function says otherwise.
//
//   solveT(world, img, tanH, tanV, w?)  where a tracked body or hand is: the landmark model gives its points twice, in metres about its own centre
//                                       (`world`: the right shape and size, no place) and on the picture (`img`: u, v 0..1 from the top left); the one
//                                       translation that puts the first onto the second through a pinhole camera is three unknowns in two linear
//                                       equations per point. That is the monocular depth: a hand's apparent size against its real one.
//   oneEuro / pointFilter               the 1-euro filter (Casiez et al. 2012): steady when the hand is still, quick when it moves
//   zoneRatio(p, zone, depthK)          how far a hand is into a zone (a capsule): < 1 inside. Along the camera's ray the distance counts for
//                                       depthK of itself: depth is the one thing a single camera guesses, so a zone is deeper than it is wide
//   curl(hand) / grabber()              how closed a hand is from its 21 points (0 flat .. 1 a fist), and whether that is a grab (closed past `on`, until open past `off`)
//   tracker()                           which zone the hand is in from frame to frame: held against flicker (in at 1, out at `exit`, a change kept
//                                       only once it has lasted `hold` seconds)
//   takes()                             a reload cut out of the stream by itself: from the hand leaving its home zone (the forend) to its return
//   visitsOf / compare                  a take's beats (which zone, in and out, as times and as fractions of the whole), and two takes' side by side
//   simplify / keysOf                   the hand's path boiled down to keys in the form js/vmanim.ts writes its clips: [fraction, anchor + offset]
export interface McZone { id: string; a: number[]; b: number[]; r: number }
export interface McVisit { zone: string; t0: number; t1: number; f0: number; f1: number; g0: number | null; g1: number | null } // (g0, g1: when the hand first closed there and when it last opened there, from the take's start; null: it did not)
export interface McSample { t: number; zone: string | null; p?: number[] | null; g?: boolean } // (g: the hand is closed)
export interface McTake { t0: number; t1: number; dur: number; visits: McVisit[]; samples: McSample[] }
export interface McKey { f: number; t: number; p: number[]; near: string | null; off: number[] | null }

export const MocapMath = (() => {
  const sub = (a: number[], b: number[]) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  const add = (a: number[], b: number[]) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
  const mul = (a: number[], k: number) => [a[0] * k, a[1] * k, a[2] * k];
  const dot = (a: number[], b: number[]) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const cross = (a: number[], b: number[]) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const len = (a: number[]) => Math.hypot(a[0], a[1], a[2]);
  const norm = (a: number[]) => { const l = len(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
  const lerp = (a: number[], b: number[], k: number) => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];

  /**
   * The translation that lays `world` (points about the model's own centre, camera axes, metres) onto `img` (u right, v DOWN, 0..1) for a camera whose
   * half-angles have the tangents tanH, tanV. A point p = world + t is seen at x/-z = a, y/-z = b (a = (2u - 1) tanH, b = (1 - 2v) tanV), so
   * tx + a tz = -(X + a Z) and ty + b tz = -(Y + b Z): least squares over the points, each weighed by w (its visibility). Null with fewer than
   * three points to go by, or a solution behind the camera.
   */
  function solveT(world: number[][], img: number[][], tanH: number, tanV: number, w?: number[] | null): number[] | null {
    // the normal equations of [1 0 a; 0 1 b] t = r: a 3 x 3 symmetric system
    let n = 0, s = 0, sa = 0, sb = 0, saa = 0, r1 = 0, r2 = 0, r3 = 0;
    for (let i = 0; i < world.length; i++) {
      const k = w ? w[i] : 1, W = world[i], I = img[i];
      if (!(k > 0) || !W || !I) continue;
      const a = (2 * I[0] - 1) * tanH, b = (1 - 2 * I[1]) * tanV, ra = -(W[0] + a * W[2]), rb = -(W[1] + b * W[2]);
      n++; s += k; sa += k * a; sb += k * b; saa += k * (a * a + b * b);
      r1 += k * ra; r2 += k * rb; r3 += k * (a * ra + b * rb);
    }
    if (n < 3) return null;
    // [s 0 sa; 0 s sb; sa sb saa] [tx ty tz] = [r1 r2 r3]
    const den = saa - (sa * sa + sb * sb) / s;
    if (!(Math.abs(den) > 1e-9)) return null;
    const tz = (r3 - (sa * r1 + sb * r2) / s) / den;
    if (!(tz < -0.05)) return null; // (in front of the camera, and not on its glass)
    return [(r1 - sa * tz) / s, (r2 - sb * tz) / s, tz];
  }
  /** Where a camera-space point lands on the picture: [u, v] (v down), the inverse of what solveT reads. */
  const project = (p: number[], tanH: number, tanV: number) => [(p[0] / -p[2] / tanH + 1) / 2, (1 - p[1] / -p[2] / tanV) / 2];

  // ---------------------------------------------------------------- smoothing
  /** One number's 1-euro filter: a low-pass whose cutoff rises with the speed (minCutoff Hz at rest, + beta per unit/s). */
  function oneEuro(minCutoff = 1.5, beta = 4, dCutoff = 1) {
    let x0: number | null = null, dx0 = 0, t0 = 0;
    const alpha = (cut: number, dt: number) => { const tau = 1 / (2 * Math.PI * cut); return 1 / (1 + tau / dt); };
    return {
      reset() { x0 = null; dx0 = 0; },
      filter(x: number, t: number) {
        if (x0 === null || !(t > t0)) { x0 = x; t0 = t; return x; }
        const dt = t - t0, dx = (x - x0) / dt, ad = alpha(dCutoff, dt);
        dx0 += ad * (dx - dx0);
        const a = alpha(minCutoff + beta * Math.abs(dx0), dt);
        x0 += a * (x - x0); t0 = t;
        return x0;
      },
    };
  }
  /** A set of points filtered together (a hand's 21, a body's 33): filter(points, t) -> the smoothed points. A gap longer than `gap` s starts afresh. */
  function pointFilter(minCutoff = 1.5, beta = 4, gap = 0.4) {
    let fs: ReturnType<typeof oneEuro>[] = [], last = -1e9;
    return {
      reset() { fs = []; },
      filter(pts: number[][], t: number) {
        if (t - last > gap || fs.length !== pts.length * 3) fs = Array.from({ length: pts.length * 3 }, () => oneEuro(minCutoff, beta));
        last = t;
        return pts.map((p, i) => [fs[i * 3].filter(p[0], t), fs[i * 3 + 1].filter(p[1], t), fs[i * 3 + 2].filter(p[2], t)]);
      },
    };
  }

  // ---------------------------------------------------------------- the hand: open or closed
  /**
   * How closed a hand is, from its 21 points (any space: only their shape is read): each finger's tip-to-knuckle distance over the finger's length along
   * its bones (1 straight, about 0.3 in a fist), averaged over the four fingers and stretched to 0 (flat) .. 1 (a fist). The thumb is left out: it closes
   * across the palm, and round a magazine it may not close at all.
   */
  function curl(h: number[][]): number {
    let sum = 0;
    for (const m of [5, 9, 13, 17]) {
      const along = len(sub(h[m + 1], h[m])) + len(sub(h[m + 2], h[m + 1])) + len(sub(h[m + 3], h[m + 2]));
      sum += along > 1e-9 ? len(sub(h[m + 3], h[m])) / along : 1;
    }
    return Math.min(1, Math.max(0, (1 - sum / 4) / 0.62));
  }
  /** A grab from a curl, frame to frame: closed past `on`, held until open past `off`. step(curl | null) -> closed; a hand not seen keeps what it had. */
  function grabber(on = 0.55, off = 0.38) {
    let held = false;
    return { get held() { return held; }, reset() { held = false; }, step(c: number | null) { if (c !== null) held = held ? c > off : c >= on; return held; } };
  }

  // ---------------------------------------------------------------- zones
  /** The point of the segment a-b nearest p. */
  function nearestOn(p: number[], a: number[], b: number[]) {
    const ab = sub(b, a), l2 = dot(ab, ab);
    const k = l2 > 1e-12 ? Math.min(1, Math.max(0, dot(sub(p, a), ab) / l2)) : 0;
    return add(a, mul(ab, k));
  }
  /**
   * How far p is from the zone's core (the segment a-b), with the part of that distance that lies along the camera's ray to p counted for depthK
   * of itself (1: a true distance; 0.5: the zone reaches twice as far toward and away from the camera as across the picture).
   */
  function zoneDist(p: number[], z: { a: number[]; b: number[] }, depthK = 1) {
    const d = sub(p, nearestOn(p, z.a, z.b));
    if (depthK === 1) return len(d);
    const ray = norm(p), along = dot(d, ray), across = sub(d, mul(ray, along));
    return Math.hypot(len(across), along * depthK);
  }
  /** zoneDist over the zone's radius: under 1, the hand is in it. */
  const zoneRatio = (p: number[], z: McZone, depthK = 1) => zoneDist(p, z, depthK) / z.r;

  /**
   * Which zone a hand is in, frame to frame. step(t, ratios) takes each zone's ratio (zoneRatio; null: the hand is not seen) and answers the zone
   * (or null: between zones). The hand stays in its zone until it is `exit` radii out, unless another zone has it properly (inside, and nearer by
   * `margin`); a change counts once it has lasted `hold` s, and a hand lost for less than `lost` s is where it was.
   */
  function tracker(o: { exit?: number; margin?: number; hold?: number; lost?: number } = {}) {
    const exit = o.exit ?? 1.3, margin = o.margin ?? 0.15, hold = o.hold ?? 0.06, lost = o.lost ?? 0.3;
    let cur: string | null = null, cand: string | null = null, candT = 0, outT: number | null = null, seenT = -1e9;
    return {
      get zone() { return cur; },
      reset() { cur = cand = outT = null; seenT = -1e9; },
      step(t: number, ratios: Record<string, number> | null): string | null {
        if (!ratios) { if (t - seenT > lost) cur = cand = outT = null; return cur; }
        seenT = t;
        let best: string | null = null, br = Infinity;
        for (const id in ratios) if (ratios[id] < br) { br = ratios[id]; best = id; }
        // out of its zone for `hold`: between zones (whatever it is nearing: a zone left is left, not kept until the next takes it)
        if (cur !== null) {
          const rc = ratios[cur];
          if (rc === undefined || rc >= exit) { if (outT === null) outT = t; if (t - outT >= hold) { cur = null; outT = null; } } else outT = null;
        }
        // into another: inside it and, while one still holds the hand, properly nearer
        const rc = cur !== null ? ratios[cur] : undefined;
        const into = best !== null && best !== cur && br < 1 && (rc === undefined || br < rc - margin) ? best : null;
        if (into === null) cand = null;
        else { if (cand !== into) { cand = into; candT = t; } if (t - candT >= hold) { cur = into; cand = null; outT = null; } }
        return cur;
      },
    };
  }

  // ---------------------------------------------------------------- takes
  /**
   * A stream of { t, zone } cut into takes. A take starts when the hand leaves `home` having rested there `rest` s, and ends when it is back there for
   * `settle` s (its end: the moment it came back). One that went nowhere (no other zone) or ran past `max` s is dropped.
   * step(sample) -> null, or { kind: 'start', t } | { kind: 'end', take } | { kind: 'cancel' }. Its samples run from `pre` s before the start.
   */
  function takes(o: { home: string; rest?: number; settle?: number; max?: number; pre?: number }) {
    const rest = o.rest ?? 0.25, settle = o.settle ?? 0.3, max = o.max ?? 15, pre = o.pre ?? 0.25;
    let homeSince: number | null = null, active = false, t0 = 0, backAt: number | null = null, buf: McSample[] = [], ring: McSample[] = [];
    return {
      get active() { return active; },
      get t0() { return t0; },
      reset() { homeSince = null; active = false; backAt = null; buf = []; ring = []; },
      step(s: McSample): null | { kind: 'start'; t: number } | { kind: 'end'; take: McTake } | { kind: 'cancel' } {
        if (!active) {
          ring.push(s); while (ring.length && s.t - ring[0].t > pre) ring.shift();
          if (s.zone === o.home) { if (homeSince === null) homeSince = s.t; return null; }
          const rested = homeSince !== null && s.t - homeSince >= rest;
          homeSince = null;
          if (!rested) return null;
          active = true; t0 = s.t; backAt = null; buf = ring.slice(); ring = [];
          return { kind: 'start', t: t0 };
        }
        buf.push(s);
        if (s.zone === o.home) {
          if (backAt === null) backAt = s.t;
          if (s.t - backAt >= settle) {
            active = false; homeSince = backAt;
            const take = cut(buf.filter((q) => q.t <= backAt!), t0, backAt, o.home);
            buf = [];
            return take.visits.length ? { kind: 'end', take } : { kind: 'cancel' };
          }
        } else backAt = null;
        if (s.t - t0 > max) { active = false; buf = []; homeSince = null; return { kind: 'cancel' }; }
        return null;
      },
    };
  }
  /** The visits in a run of samples between t0 and t1: each stretch of minDwell s or more in one zone (not `home`, not between zones), as times from t0 and fractions of t1 - t0. */
  function visitsOf(samples: McSample[], t0: number, t1: number, home?: string | null, minDwell = 0.1): McVisit[] {
    const out: McVisit[] = [], dur = Math.max(1e-6, t1 - t0);
    let cur: McVisit | null = null;
    // (a zone crossed in under minDwell s is on the way, not a stop: the magazine's, between the charging handle and the handguard)
    const shut = (t: number) => { if (cur) { cur.t1 = t - t0; cur.f1 = cur.t1 / dur; if (cur.t1 - cur.t0 >= minDwell) out.push(cur); cur = null; } };
    let held: boolean | undefined; // (the hand closed, as of the sample before)
    for (const s of samples) {
      if (s.t < t0 || s.t > t1) { held = s.g; continue; }
      const z = s.zone && s.zone !== home ? s.zone : null;
      if (cur && cur.zone !== z) shut(s.t);
      if (!cur && z) cur = { zone: z, t0: s.t - t0, t1: 0, f0: (s.t - t0) / dur, f1: 0, g0: null, g1: null };
      // the hand closing in the zone (the first time) and opening in it (the last): either may come first (a magazine stowed, then a fresh one taken)
      if (cur && s.g !== undefined) { if (s.g && held === false && cur.g0 === null) cur.g0 = s.t - t0; if (!s.g && held === true) cur.g1 = s.t - t0; }
      held = s.g;
    }
    shut(t1);
    return out;
  }
  /** A take from samples: its span, its visits, the samples themselves. */
  function cut(samples: McSample[], t0: number, t1: number, home?: string | null): McTake {
    return { t0, t1, dur: t1 - t0, visits: visitsOf(samples, t0, t1, home), samples };
  }
  /**
   * Two takes' visits side by side: each of `ref`'s matched to the next of `mine` in the same zone (in order), what is left of `mine` after.
   * Rows: { zone, mine, ref } with either side null.
   */
  function compare(mine: McVisit[], ref: McVisit[]) {
    const rows: { zone: string; mine: McVisit | null; ref: McVisit | null }[] = [];
    let i = 0;
    for (const r of ref) {
      let j = i;
      while (j < mine.length && mine[j].zone !== r.zone) j++;
      if (j < mine.length) { for (; i < j; i++) rows.push({ zone: mine[i].zone, mine: mine[i], ref: null }); rows.push({ zone: r.zone, mine: mine[i++], ref: r }); }
      else rows.push({ zone: r.zone, mine: null, ref: r });
    }
    for (; i < mine.length; i++) rows.push({ zone: mine[i].zone, mine: mine[i], ref: null });
    return rows;
  }

  // ---------------------------------------------------------------- the path as keys
  /** Ramer-Douglas-Peucker on a timed path: the indices of the samples that keep every other within eps metres of the line between its kept neighbours. */
  function simplify(pts: number[][], eps: number): number[] {
    if (pts.length < 3) return pts.map((_, i) => i);
    const keep = new Uint8Array(pts.length); keep[0] = keep[pts.length - 1] = 1;
    const stack: [number, number][] = [[0, pts.length - 1]];
    while (stack.length) {
      const [i0, i1] = stack.pop()!;
      let worst = -1, wd = eps;
      for (let i = i0 + 1; i < i1; i++) { const d = len(sub(pts[i], nearestOn(pts[i], pts[i0], pts[i1]))); if (d > wd) { wd = d; worst = i; } }
      if (worst >= 0) { keep[worst] = 1; stack.push([i0, worst], [worst, i1]); }
    }
    const out: number[] = [];
    for (let i = 0; i < pts.length; i++) if (keep[i]) out.push(i);
    return out;
  }
  /**
   * A take's hand path (samples with p, in the GUN's space: x right, y up, z back) as keys: the corners of the path (simplify, eps m), each at its fraction of
   * the take, named by the anchor it is nearest when one is within `reach` m, with what is left over as js/vmanim.ts `off` takes it: [forward, up, right].
   */
  function keysOf(samples: McSample[], t0: number, t1: number, anchors: Record<string, number[]>, eps = 0.025, reach = 0.15): McKey[] {
    const s = samples.filter((q) => q.p && q.t >= t0 && q.t <= t1), dur = Math.max(1e-6, t1 - t0);
    return simplify(s.map((q) => q.p!), eps).map((i) => {
      const p = s[i].p!;
      let near: string | null = null, nd = reach;
      for (const k in anchors) { const d = len(sub(p, anchors[k])); if (d < nd) { nd = d; near = k; } }
      const o = near ? sub(p, anchors[near]) : null;
      return { f: (s[i].t - t0) / dur, t: s[i].t - t0, p, near, off: o ? [-o[2], o[1], o[0]] : null };
    });
  }
  /** The keys written out the way a clip's path is in js/vmanim.ts: `[0.14, WB], [0.22, off(WB, 0, -0.07)], ...` (offsets under `tol` m dropped). */
  function keysText(keys: McKey[], tol = 0.015) {
    const n = (x: number) => String(+x.toFixed(2));
    return keys.map((k) => {
      let at: string;
      if (k.near && k.off) {
        const o = k.off.map((x) => (Math.abs(x) < tol ? 0 : x));
        at = o.some((x) => x) ? `off(${k.near}, ${n(o[0])}, ${n(o[1])}${o[2] ? ', ' + n(o[2]) : ''})` : k.near;
      } else at = `new T.Vector3(${n(k.p[0])}, ${n(k.p[1])}, ${n(k.p[2])})`;
      return `[${n(k.f)}, ${at}]`;
    }).join(', ');
  }

  return { sub, add, mul, dot, cross, len, norm, lerp, solveT, project, oneEuro, pointFilter, nearestOn, zoneDist, zoneRatio, curl, grabber, tracker, takes, visitsOf, cut, compare, simplify, keysOf, keysText };
})();
