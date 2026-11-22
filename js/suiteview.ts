'use strict';
// A radar suite (js/radar.ts RSuite) as a page draws it, sent over the wire: what the sensor station (js/radarview.ts holo, its
// boxes: the scheduler's, the queue, the tracks; the console's scope) and the debug view (F8: js/radarview.ts update, pipeline)
// read of it, and nothing they don't. For the battle in the server worker (docs/space-server.md C1): the server packs its suites,
// a page unpacks what it's sent into objects shaped as RSuite is as far as those readers go, and draws them as it draws its own.
//   pack(su, now, { dbg }): the picture, a plain JSON-safe object (no cycles, no class instances): numbers rounded (places 0.1 m,
//     directions and quaternions 1e-4, angles 1e-4 rad, times 1 ms), what refers to what by name or index (an assessment's
//     belief by its name, a contact by its name (the scanner's tag and a number: one name a suite), a plot by its scanner and its
//     place in that scanner's table, a job's track by name, a dish by its index). dbg: F8's extras too (every belief, slabs and all,
//     their trajectories; each contact's trail; each scanner's plots of the last sweep; each dish's trajectory; why each
//     assessment is what it is)
//   unpack(msg, prev): the suite as the readers want it: THREE vectors and quaternions, a small filter (KFV) where they call a
//     filter's methods, references back to objects. prev: the suite this one was unpacked into last time (the same ship): it's
//     updated in place, so the view's state kept on it (su.dbg: F8's meshes) and the plots the hologram's picked stay the same
//     objects while they're the same plots
//   packMaps(su, now): F8's on request: each scanner's map, 360 angle columns by 100 range bins (as the square root of the range:
//     where the views sample it), its dB over the noise a byte (0.25 dB a step), when each column was last written; and the
//     dishes' debug (dg). unpackMaps(msg, su): into an unpacked suite, the map back on the scanner's own bins
// SuiteView.on (?suiteview in the URL, or G.SuiteView.on = true): the page draws its sensor station, hologram and F8 from the round
// trip, unpack(JSON.parse(JSON.stringify(pack(...)))), every frame, not from the suites themselves (js/space.ts sv).
import { Radar, KF3, RSuite, RScan, RTrack, RPlot, RContact, RFused, RSTrack, RJob, ROpt, RIff, RCls } from './radar.js';

// (the filter as the readers use it: its state, its position's covariance (the velocity's not sent: nothing drawn reads it), its
// time and its count)
export class KFV {
  x = new Float64Array(6); P = new Float64Array(36); t = 0; n = 0; qb = 1; fxT?: number;
  pos(out = new THREE.Vector3()) { return out.set(this.x[0], this.x[1], this.x[2]); }
  vel(out = new THREE.Vector3()) { return out.set(this.x[3], this.x[4], this.x[5]); }
  sig() { return Math.sqrt((this.P[0] + this.P[7] + this.P[14]) / 3); }
  clone() { const k = new KFV(); k.x = this.x.slice(); k.P = this.P.slice(); k.t = this.t; k.n = this.n; k.qb = this.qb; k.fxT = this.fxT; return k; }
}

type V3 = number[]; type Q4 = number[];
// (the packed picture: short names, arrays where the order says what's what; times in ms from the message's own (t))
//   ff: the IFF answers, each once ([c, n]); po: the poses plots were made at, each once ([qx, qy, qz, qw, ox, oy, oz])
//   sc[k].co: each contact [its number (after the scanner's tag), A, r, vA, vr, t, hits, iff, and its latest plot: phi, r, db, pose
//     (its time the contact's), (F8: its truth id)]; sc[k].px: other plots something refers to [phi, r, t, db, pose, (id)]; a plot's
//     reference [k, i]: the i-th contact's, or past the contacts, px's; (F8) ps: the last sweep's plots, tr: each contact's trail
//   bel: [n, kind, pl, v, tracker (-1), contact a (0), contact b (0), (F8: shape, trajectory)]; fu: which are placed (su.fus)
//   as: [n (a belief's, else a contact's), a belief's (1) or a contact's (0), r, vc, score, hold, cls (CLS), (its plot, if not its contact's newest)], (F8) why
//   tk: the dishes; sch: tts (her tracks), rq (the searches asked for), plan (each dish's: [a track's name or a request's index, at])
export interface SVMsg {
  v: 2; id: string; nm?: string; t: number; P: V3; Q: Q4; V: V3; aff?: string; hn?: string[]; sz: number;
  ff: string[][]; po: number[][];
  sc: { ax: string; th: number; rt: number; r0rt: number; fan: number; R0: number; at: V3; n: V3; mask: number; mode: string; sec: number[]; no: number; tag: string; off: number;
    co: (number | string)[][]; px: (number | string)[][]; ps?: number[]; tr?: number[][][] }[];
  tk: Record<string, any>[];
  bel: any[][]; fu: number[];
  as: (number | string)[][]; why?: string[];
  sch?: { tts: Record<string, any>[]; rq: Record<string, any>[]; plan: (string | number)[][][] };
  op?: Record<string, any>;
}
const CLS = ['HOSTILE', 'SUSPECT', 'WATCH', 'NEUTRAL', 'CIV', 'FRIENDLY'] as const;

export const SuiteView = (() => {
  const T = THREE;
  const on = { on: false };
  try { on.on = typeof location !== 'undefined' && /[?&]suiteview\b/.test(location.search); } catch { /* (a worker, Node) */ }
  const rd = (x: number, k: number) => Math.round(x * k) / k;
  const v3 = (v: THREE.Vector3, k = 10): V3 => [rd(v.x, k), rd(v.y, k), rd(v.z, k)];
  const q4 = (q: THREE.Quaternion, k = 1e4): Q4 => [rd(q.x, k), rd(q.y, k), rd(q.z, k), rd(q.w, k)];
  const tm = (t: number) => rd(t, 1000);
  const V = (a: V3) => new T.Vector3(a[0], a[1], a[2]);
  const Q = (a: Q4) => new T.Quaternion(a[0], a[1], a[2], a[3]).normalize();
  // (a covariance's shape, its axes as a rotation and its spread along each: what's kept of it; a thin slab's thin way would be
  // lost to rounding its matrix's entries)
  const _m = new T.Matrix4(), _q = new T.Quaternion();
  function shapeOf(axes: THREE.Vector3[], sx: number[]) {
    const a = axes[0].clone(), b = axes[1].clone(), c = new T.Vector3().crossVectors(a, b); // (right-handed: the third axis's sign doesn't matter to an ellipsoid)
    _m.makeBasis(a, b, c); _q.setFromRotationMatrix(_m);
    return [...q4(_q), ...sx.map((s) => +s.toPrecision(4))];
  }
  function axesOf(s: number[]) { const q = Q(s.slice(0, 4)); return { axes: [new T.Vector3(1, 0, 0).applyQuaternion(q), new T.Vector3(0, 1, 0).applyQuaternion(q), new T.Vector3(0, 0, 1).applyQuaternion(q)], sx: s.slice(4, 7) }; }
  const posP = (P: ArrayLike<number>) => [P[0], P[1], P[2], P[6], P[7], P[8], P[12], P[13], P[14]];
  // (a filter: its state, its time and count, its position's covariance as its shape; its velocity's left out, nothing drawn reads it)
  function kfPack(kf: KF3, rt: (t: number) => number) {
    const e = Radar.eig3(posP(kf.P)), o: Record<string, unknown> = { x: [...v3(kf.pos()), ...v3(kf.vel(), 100)], t: rt(kf.t), n: kf.n, P: shapeOf(e.map((q) => q.d), e.map((q) => Math.sqrt(q.l))) };
    if (kf.fxT != null) o.fx = rt(kf.fxT);
    return o;
  }
  function kfUnpack(o: any, at: (t: number) => number): KFV {
    const k = new KFV(); k.x.set(o.x); k.t = at(o.t); k.n = o.n; if (o.fx != null) k.fxT = at(o.fx);
    const { axes, sx } = axesOf(o.P); // (P = R diag(s^2) R')
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) { let a = 0; for (let m = 0; m < 3; m++) a += axes[m].getComponent(i) * axes[m].getComponent(j) * sx[m] * sx[m]; k.P[i * 6 + j] = a; }
    return k;
  }
  const clsP = (c: RCls | undefined, rt: (t: number) => number) => (c ? [c.k, rd(c.conf, 1e3), rt(c.t), ...(c.name ? [c.name] : [])] : 0);
  const clsU = (o: any, at: (t: number) => number): RCls | undefined => (o ? { k: o[0], conf: o[1], t: at(o[2]), ...(o[3] ? { name: o[3] } : {}) } : undefined);
  // (a trajectory, a point every half second and its newest: what's drawn of it)
  function thin(h: { t: number; p: THREE.Vector3 }[], rt: (t: number) => number) { const out: number[][] = []; let last = -1e9; h.forEach((q, i) => { if (q.t - last >= 0.5 || i === h.length - 1) { out.push([rt(q.t), ...v3(q.p)]); last = q.t; } }); return out; }
  const thinU = (a: number[][] | undefined, at: (t: number) => number) => (a || []).map((q) => ({ t: at(q[0]), p: new T.Vector3(q[1], q[2], q[3]) }));
  // ---------------------------------------------------------------- pack
  function pack(su: RSuite, now: number, opts: { dbg?: boolean } = {}): SVMsg {
    const dbg = !!opts.dbg, t0 = tm(now), rt = (t: number) => Math.round((t - t0) * 1000);
    const ff: string[][] = [], ffK = new Map<string, number>();
    const iff = (f: RIff | null | undefined) => { if (!f) return -1; const k = f.c + '|' + f.n; let i = ffK.get(k); if (i == null) { i = ff.length; ff.push([f.c, f.n]); ffK.set(k, i); } return i; };
    const po: number[][] = [], poK = new Map<string, number>();
    const pose = (q: THREE.Quaternion | undefined, o: THREE.Vector3 | undefined) => { if (!q || !o) return -1; const a = [...q4(q, 1e6), ...v3(o, 100)], k = a.join(','); let i = poK.get(k); if (i == null) { i = po.length; po.push(a); poK.set(k, i); } return i; };
    // (a plot's reference: its contact's place if it's a contact's latest, else its place in the scanner's table of the others, past the contacts)
    const plI = su.scans.map((s) => new Map<RPlot, number>(s.cons.map((c, i) => [c.p, i]))), px = su.scans.map(() => [] as (number | string)[][]);
    const plot = (p: RPlot | null | undefined): number[] | null => {
      if (!p) return null; const m = plI[p.k]; if (!m) return null; let i = m.get(p);
      if (i == null) { i = su.scans[p.k].cons.length + px[p.k].length; const a: (number | string)[] = [rd(p.phi, 1e4), Math.round(p.r), rt(p.t), Math.round(p.db), pose(p.q, p.o)]; if (dbg) a.push(p.id || ''); px[p.k].push(a); m.set(p, i); }
      return [p.k, i];
    };
    const sc = su.scans.map((s) => {
      const co = s.cons.map((c) => { const p = c.p, a: (number | string)[] = [+c.n.slice(s.tag.length), rd(c.A, 1e4), Math.round(c.r), rd(c.vA, 1e5), rd(c.vr, 10), rt(c.t), c.hits, iff(c.iff), rd(p.phi, 1e4), Math.round(p.r), Math.round(p.db), pose(p.q, p.o)]; if (dbg) a.push(p.id || ''); return a; });
      return { ax: s.ax, th: rd(s.th, 1e4), rt: rd(s.rate, 1e4), r0rt: rd(s.rate0, 1e4), fan: rd(s.fan, 1e4), R0: Math.round(s.R0), at: v3(s.at, 100), n: v3(s.n, 1e4), mask: rd(s.mask, 1e4), mode: s.mode, sec: [s.sec.on ? 1 : 0, rd(s.sec.c, 1e4), rd(s.sec.h, 1e4)], no: s.notch ? 1 : 0, tag: s.tag, off: rd(s.off, 1e4), co, px: [] as (number | string)[][] } as SVMsg['sc'][0];
    });
    if (dbg) su.scans.forEach((s, k) => { sc[k].ps = s.plots.map((p) => plot(p)![1]); sc[k].tr = s.cons.map((c) => c.trail.map((q) => [rd(q.A, 1e4), Math.round(q.r), rt(q.t)])); });
    // (a job: one of the scheduler's requests by its place in the list (the same object there, on the dish and in the plan), else as itself)
    const S0 = su.sched, reqs = S0 ? S0.reqs : [];
    const ttMini = (tt: RSTrack) => { const o: Record<string, unknown> = { n: tt.n, pri: tt.pri }; if (tt.quiet) o.qu = 1; if (tt.cls) o.cls = clsP(tt.cls, rt); if (tt.szE) o.szE = rd(tt.szE, 10); if (tt.kf) o.kf = kfPack(tt.kf, rt); return o; }; // (the camera's look at a belief as itself: not one of her tracks)
    const job = (j: RJob | null | undefined): number | Record<string, unknown> | null => {
      if (!j) return null; const ri = reqs.indexOf(j); if (ri >= 0) return ri;
      const o: Record<string, unknown> = { k: j.kind, t: rt(j.t), pri: j.pri };
      if (j.tt) o.tt = S0 && S0.tts.includes(j.tt) ? j.tt.n : ttMini(j.tt);
      if (j.plot) o.pl = plot(j.plot); if (j.d) o.d = v3(j.d, 1e4); if (j.at != null) o.at = rt(j.at); if (j.end != null) o.end = rt(j.end); if (j.op) o.op = 1;
      return o;
    };
    const trkI = (tr: RTrack | null | undefined) => (tr ? su.trks.indexOf(tr) : -1);
    const tk = su.trks.map((tr) => {
      if (tr.job) Radar.jobProg(su, tr, now); // (its slew's start, which the progress bar measures from, set as the page's view would)
      const o: Record<string, unknown> = { sd: tr.side, at: v3(tr.at, 100), b: v3(tr.b, 1e4), a: v3(tr.a, 1e4), st: tr.st, rng: rd(tr.rng, 10), db: rd(tr.db, 10), err: rd(tr.err, 1e5), eq: rd(tr.est.q, 1e3), lk: rd(tr.lockT, 100), bdb: rd(tr.best.db, 10) };
      if (tr.kind) o.kd = tr.kind; if (tr.off) o.off = 1; if (tr.tgt) o.tgt = tr.tgt;
      if (tr.est.p) { o.ep = v3(tr.est.p); o.ev = v3(tr.est.v); }
      if (tr.hand) o.hp = v3(tr.hand.p);
      if (tr.cue) { const c = tr.cue; o.cue = { k: c.k, ax: c.ax, phi: rd(c.phi, 1e4), r: rd(c.r, 10), q: q4(c.q), o: v3(c.o), con: c.con ? c.con.n : 0 }; }
      if (tr.job) { o.job = job(tr.job); o.jT = rt(tr.jobT ?? 0); if (tr.jobA != null) o.jA = rd(tr.jobA, 1e5); o.jR = tr.jobRev ?? -1; }
      o.rev = tr.rev || 0; o.dP = rd(tr.dP || 0, 1e4); o.sw = rd(tr.sw, 1e4);
      if (tr.spiral) o.sp = [rd(tr.spiral.t, 1e3), tr.spiral.span != null ? rd(tr.spiral.span, 1e5) : -1];
      if (dbg && tr.hist) o.hi = thin(tr.hist, rt);
      return o;
    });
    // (the placed beliefs (su.fus), what the readers outside F8 go by; F8, every belief, its shape and its trajectory too)
    const fus = new Set(su.fus), bels = dbg ? (su.bel || su.fus) : su.fus;
    const bel = bels.map((b) => { const a: any[] = [b.n, b.kind ?? 2, v3(b.pl), v3(b.v), trkI(b.trk), b.a ? b.a.n : 0, b.b ? b.b.n : 0]; if (dbg) a.push(b.sx && b.axes ? shapeOf(b.axes, b.sx) : 0, thin(b.hist, rt)); return a; });
    const fu = bels.map((b, i) => (fus.has(b) ? i : -1)).filter((i) => i >= 0);
    // (its plot: the one its contact had when it was assessed (ten times a second; a contact's newest may have come since), sent only when that's not its contact's newest)
    const as = su.ass.map((a) => { const r: (number | string)[] = [a.n, a.f ? 1 : 0, rd(a.r, 10), rd(a.vc, 10), rd(a.score, 1e3), rd(a.hold, 100), CLS.indexOf(a.cls)], d = a.f ? (a.f.a && a.f.a.p) || (a.f.b && a.f.b.p) || null : a.c ? a.c.p : null; if (a.plot !== d) r.push(...(plot(a.plot) || [-1, -1])); return r; });
    const msg: SVMsg = { v: 2, id: su.id, t: t0, P: v3(su.P, 100), Q: q4(su.Q, 1e6), V: v3(su.V, 100), sz: rd(su.size, 100), ff, po, sc, tk, bel, fu, as };
    if (su.name) msg.nm = su.name; if (su.aff) msg.aff = su.aff; if (su.hostNames && su.hostNames.size) msg.hn = [...su.hostNames];
    if (dbg) msg.why = su.ass.map((a) => a.why);
    if (S0) msg.sch = {
      tts: S0.tts.map((tt) => { const o: Record<string, unknown> = { n: tt.n, kf: kfPack(tt.kf, rt), pri: tt.pri, t: rt(tt.t), t0: rt(tt.t0), lo: tt.looks, mi: tt.miss, rate: rd(tt.rate, 1e3) };
        if (tt.op) o.op = 1; if (tt.quiet) o.qu = 1; if (tt.bel) o.bel = tt.bel; if (tt.cls) o.cls = clsP(tt.cls, rt); if (tt.szE) o.szE = rd(tt.szE, 10); if (tt.fc != null) o.fc = tt.fc;
        const ti = trkI(tt.trk); if (ti >= 0) o.tk = ti; if (tt.lookT && tt.lookT.length) o.lt = tt.lookT.filter((t) => now - t <= 4.05).map(rt); return o; }),
      rq: S0.reqs.map((j) => { const o: Record<string, unknown> = { k: j.kind, t: rt(j.t), pri: j.pri }; if (j.plot) o.pl = plot(j.plot); if (j.d) o.d = v3(j.d, 1e4); if (j.at != null) o.at = rt(j.at); if (j.op) o.op = 1; const ti = trkI(j.trk); if (ti >= 0) o.tk = ti; return o; }),
      plan: su.trks.map((tr) => (S0.plan.get(tr) || []).map((j) => { const ri = reqs.indexOf(j); return [ri >= 0 ? ri : j.tt ? j.tt.n : -1, rt(j.at ?? now)]; })), // (what the queue reads of it: what each entry is, when it starts)
    };
    const op = su.opt;
    if (op) {
      const o: Record<string, unknown> = { mts: op.mts.map((m) => v3(m, 100)), qd: op.quad, b: v3(op.b, 1e4), fov: +op.fov.toPrecision(4), rng: rd(op.rng, 10), st: op.st, jT: rt(op.jobT), sl: rd(op.slew, 1e3), px: rd(op.px, 10) };
      if (op.off) o.off = 1; if (op.e != null) o.e = rd(op.e, 1e4); if (op.tgt) o.tgt = op.tgt;
      if (op.job) o.job = job(op.job);
      const cc = (op as any).con as { c: RContact; k: number } | undefined; if (cc) o.con = [cc.k, cc.c.n];
      msg.op = o;
    }
    sc.forEach((s, k) => { s.px = px[k]; });
    return msg;
  }
  // ---------------------------------------------------------------- unpack
  type Cache = { pc: Map<string, RPlot>; maps: { map: Float32Array; age: Float32Array }[] };
  function unpack(m: SVMsg, prev?: RSuite | null): RSuite {
    const su = (prev && prev.id === m.id ? prev : {}) as RSuite & { _sv?: Cache };
    const C: Cache = su._sv || (su._sv = { pc: new Map(), maps: [] });
    const at = (r: number) => m.t + r / 1000;
    const ff = (i: number): RIff | null => (i >= 0 ? { c: m.ff[i][0] as RIff['c'], n: m.ff[i][1] } : null);
    su.id = m.id; su.name = m.nm; su.P = V(m.P); su.Q = Q(m.Q); su.V = V(m.V); su.size = m.sz; su.aff = m.aff as RSuite['aff']; su.hostNames = m.hn ? new Set(m.hn) : undefined;
    const qi = su.Q.clone().invert();
    // (the plots: the same object as last time for the same plot (the hologram's pick is held across frames by the plot it's on))
    const pc = new Map<string, RPlot>();
    const mkPlot = (k: number, phi: number, r: number, t: number, db: number, pi: number, id: string) => {
      const key = k + '|' + Math.round(t * 1000) + '|' + phi + '|' + r; let p = C.pc.get(key);
      if (!p) { const ps = pi >= 0 ? m.po[pi] : null; p = { k, phi, r, t, db, id, e: 0 }; if (ps) { p.q = Q(ps.slice(0, 4)); p.o = V(ps.slice(4, 7)); } } else if (id) p.id = id; // (its truth id: F8's alone, sent while it's shown)
      pc.set(key, p); return p;
    };
    const conBy = new Map<string, RContact>();
    const plots: RPlot[][] = [];
    su.scans = m.sc.map((s, k) => {
      const mp = C.maps[k] || (C.maps[k] = { map: new Float32Array(Radar.MAP.na * Radar.MAP.nr), age: new Float32Array(Radar.MAP.na).fill(-1e9) });
      const cons: RContact[] = s.co.map((a, i) => { const t = at(a[5] as number), c = { n: s.tag + a[0], A: a[1] as number, r: a[2] as number, vA: a[3] as number, vr: a[4] as number, t, hits: a[6] as number, iff: ff(a[7] as number), p: mkPlot(k, a[8] as number, a[9] as number, t, a[10] as number, a[11] as number, (a[12] as string) || ''), trail: s.tr ? s.tr[i].map((q) => ({ A: q[0], r: q[1], t: at(q[2]) })) : [] } as unknown as RContact; conBy.set(c.n, c); return c; });
      plots[k] = [...cons.map((c) => c.p), ...s.px.map((a) => mkPlot(k, a[0] as number, a[1] as number, at(a[2] as number), a[3] as number, a[4] as number, (a[5] as string) || ''))];
      return { ax: s.ax, th: s.th, rate: s.rt, rate0: s.r0rt, bw: Radar.SCAN.bw, fan: s.fan, R0: s.R0, at: V(s.at), n: V(s.n), mast: 0, mask: s.mask, mode: s.mode, sec: { on: !!s.sec[0], c: s.sec[1], h: s.sec[2], dir: 1 }, notch: !!s.no, tag: s.tag, off: s.off,
        plots: s.ps ? s.ps.map((i) => plots[k][i]) : [], cons, map: mp.map, age: mp.age, col: -1, nid: 0, pend: [] } as unknown as RScan;
    });
    C.pc = pc;
    const pl = (r: number[] | null | undefined) => (r && r[0] >= 0 ? plots[r[0]][r[1]] || null : null);
    const trks: RTrack[] = m.tk.map((o: any) => ({ side: o.sd, kind: o.kd, at: V(o.at), b: V(o.b), a: V(o.a), st: o.st, off: !!o.off, rng: o.rng, db: o.db, err: o.err, tgt: o.tgt || null, lockT: o.lk, best: { db: o.bdb, b: new T.Vector3(), r: 0 },
      est: { p: o.ep ? V(o.ep) : null, v: o.ev ? V(o.ev) : new T.Vector3(), q: o.eq }, hand: o.hp ? { p: V(o.hp), v: new T.Vector3(), t: 0 } : null,
      cue: o.cue ? { k: o.cue.k, ax: o.cue.ax, phi: o.cue.phi, r: o.cue.r, q: Q(o.cue.q), o: V(o.cue.o), con: o.cue.con ? conBy.get(o.cue.con) || null : null } : null,
      jobT: o.jT != null ? at(o.jT) : undefined, jobA: o.jA, jobRev: o.jR, rev: o.rev, dP: o.dP, sw: o.sw, spiral: o.sp ? { t: o.sp[0], span: o.sp[1] >= 0 ? o.sp[1] : undefined } : null, hist: o.hi ? thinU(o.hi, at) : undefined,
      ph: 0, lost: 0, dE: new T.Vector3(), dA: 0, w: new T.Vector3(), job: null } as unknown as RTrack));
    su.trks = trks;
    const tkOf = (i: number | undefined) => (i != null && i >= 0 ? trks[i] || null : null);
    // (a belief: where it is in her frame and how far, worked out from its place in the level's; its answer, its contacts'; its spread, its shape's)
    su.bel = m.bel.map((o) => {
      const pl0 = V(o[2]), a = o[5] ? conBy.get(o[5]) || null : null, b0 = o[6] ? conBy.get(o[6]) || null : null;
      const b = { n: o[0], kind: o[1], fix: o[1] === 3, pl: pl0, p: pl0.clone().sub(su.P).applyQuaternion(qi), r: pl0.distanceTo(su.P), v: V(o[3]), trk: tkOf(o[4]), a, b: b0, iff: (a && a.iff) || (b0 && b0.iff) || null, hist: thinU(o[8], at), res: 0, ea: 0, eb: 0 } as unknown as RFused;
      if (o[7]) { const s = axesOf(o[7]); b.axes = s.axes; b.sx = s.sx; b.res = Math.sqrt((s.sx[0] ** 2 + s.sx[1] ** 2 + s.sx[2] ** 2) / 3); }
      return b;
    });
    su.fus = m.fu.map((i) => su.bel![i]);
    const belBy = new Map(su.bel.map((b) => [b.n, b]));
    su.ass = m.as.map((a, i) => {
      const n = a[0] as string, f = a[1] ? belBy.get(n) || null : null, c = a[1] ? null : conBy.get(n) || null;
      return { n, key: (f ? 'F:' : 'C:') + n, f, c, iff: f ? f.iff || (f.a && f.a.iff) || (f.b && f.b.iff) || null : c ? c.iff || null : null, r: a[2] as number, vc: a[3] as number, score: a[4] as number, hold: a[5] as number, cls: CLS[a[6] as number], plot: a.length > 7 ? pl([a[7] as number, a[8] as number]) : f ? (f.a && f.a.p) || (f.b && f.b.p) || null : c ? c.p : null, why: m.why ? m.why[i] : '', tcpa: -1, dcpa: 0 };
    });
    // (the scheduler: her tracks, the searches asked for, each dish's plan; the jobs the dishes and the camera are on)
    const ttU = (o: any): RSTrack => ({ n: o.n, kf: o.kf ? kfUnpack(o.kf, at) as unknown as KF3 : (undefined as unknown as KF3), pri: o.pri, t: o.t != null ? at(o.t) : 0, t0: o.t0 != null ? at(o.t0) : 0, looks: o.lo ?? 0, miss: o.mi ?? 0, rate: o.rate ?? 1, op: !!o.op, quiet: !!o.qu, bel: o.bel, cls: clsU(o.cls, at), szE: o.szE, tgt: null, fc: o.fc, trk: tkOf(o.tk), lookT: o.lt ? o.lt.map(at) : undefined, est: { p: new T.Vector3(), v: new T.Vector3(), q: 0 } });
    const tts = m.sch ? m.sch.tts.map(ttU) : [], ttBy = new Map(tts.map((q) => [q.n, q]));
    for (const tt of tts) if (tt.kf) { tt.kf.pos(tt.est.p); tt.kf.vel(tt.est.v); }
    const reqs: RJob[] = m.sch ? m.sch.rq.map((o: any) => ({ kind: o.k, t: at(o.t), pri: o.pri, plot: o.pl ? pl(o.pl) || undefined : undefined, d: o.d ? V(o.d) : undefined, at: o.at != null ? at(o.at) : undefined, op: !!o.op, trk: tkOf(o.tk) })) : [];
    const jobU = (o: any): RJob | null => { if (o == null) return null; if (typeof o === 'number') return reqs[o] || null; return { kind: o.k, t: at(o.t), pri: o.pri, tt: o.tt == null ? undefined : typeof o.tt === 'string' ? ttBy.get(o.tt) : ttU(o.tt), plot: o.pl ? pl(o.pl) || undefined : undefined, d: o.d ? V(o.d) : undefined, at: o.at != null ? at(o.at) : undefined, end: o.end != null ? at(o.end) : undefined, op: !!o.op }; };
    m.tk.forEach((o: any, i) => { const j = jobU(o.job); trks[i].job = j; if (j) j.trk = trks[i]; });
    if (m.sch) {
      const plan = new Map<RTrack, RJob[]>();
      m.sch.plan.forEach((js, i) => { if (!trks[i]) return; plan.set(trks[i], js.map(([r, t]) => { if (typeof r === 'number') { const q = reqs[r]; return q || null; } const tt = ttBy.get(r); return tt ? { kind: 'look' as const, tt, t: tt.t, pri: tt.pri, at: at(t as number) } : null; }).filter((j): j is RJob => !!j)); });
      su.sched = { tts, reqs, n: 0, ep: -1, plan };
    } else su.sched = undefined;
    if (m.op) {
      const o = m.op, op: ROpt = { mts: o.mts.map(V), quad: o.qd, b: V(o.b), fov: o.fov, rng: o.rng, st: o.st, job: jobU(o.job), jobT: at(o.jT), slew: o.sl, px: o.px, off: !!o.off, e: o.e, tgt: o.tgt || null, next: 0, free: 0, seen: 0, n: 0 };
      if (o.con) (op as any).con = { k: o.con[0], c: conBy.get(o.con[1]) || ({ n: o.con[1] } as RContact) };
      su.opt = op;
    } else su.opt = undefined;
    su.init = true; su.fusT = m.t;
    return su;
  }
  // ---------------------------------------------------------------- the maps and the dishes' debug (F8's, on request)
  const NB = 100, MAXR = Radar.MAP.Rmax;
  let binTo: Int16Array | null = null; // (each of the map's own range bins: the packed bin it falls in)
  function bins() { if (!binTo) { const M = Radar.MAP; binTo = new Int16Array(M.nr); for (let b = 0; b < M.nr; b++) binTo[b] = Math.min(NB - 1, Math.floor(Math.sqrt(Math.min(1, Radar.rangeOf(b + 0.5) / MAXR)) * NB)); } return binTo; }
  let mid: Int16Array | null = null; // (each packed bin's middle: the map's own bin there)
  function mids() { if (!mid) { mid = new Int16Array(NB); for (let i = 0; i < NB; i++) mid[i] = Math.min(Radar.MAP.nr - 1, Math.floor(Radar.binOf(((i + 0.5) / NB) ** 2 * MAXR))); } return mid; }
  const b64 = (u: Uint8Array) => { let s = ''; for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode(...u.subarray(i, i + 0x8000)); return btoa(s); };
  const unb64 = (s: string) => { const b = atob(s), u = new Uint8Array(b.length); for (let i = 0; i < b.length; i++) u[i] = b.charCodeAt(i); return u; };
  function packMaps(su: RSuite, now: number) {
    const M = Radar.MAP, B = bins(), MID = mids();
    const sc = su.scans.map((s) => {
      const u = new Uint8Array(M.na * NB), ag = new Uint8Array(M.na), per = Radar.perOf(s);
      // (a packed cell: what's at its middle, as the views sample the map (a point a pixel); or the strongest in it, if anything in it's
      // over the floor the CFAR looks from: a peak isn't lost between the samples, and the noise isn't made brighter by taking its highest)
      const mx = new Float32Array(NB);
      for (let c = 0; c < M.na; c++) {
        const base = c * M.nr, ob = c * NB; mx.fill(0);
        for (let b = 0; b < M.nr; b++) { const v = s.map[base + b], o = B[b]; if (v > mx[o]) mx[o] = v; }
        for (let i = 0; i < NB; i++) { const v = mx[i] >= M.floor ? mx[i] : s.map[base + MID[i]]; u[ob + i] = v > 0 ? Math.max(0, Math.min(255, Math.round((10 * Math.log10(v) + 10) * 4))) : 0; }
        const a = (now - s.age[c]) / per; ag[c] = !(a >= 0) ? 255 : Math.min(255, Math.round(a * 100)); // (how long since the sweep wrote it, in hundredths of a turn; 255: never, or long ago)
      }
      return { m: b64(u), a: b64(ag), per: rd(per, 1e4) };
    });
    const dg = su.trks.map((tr) => { const g = tr.dg; if (!g) return null;
      return { mono: (g.mono || []).map((q) => [rd(q.s, 1e4), rd(q.x, 1e4), rd(q.y, 1e4)]), nz: rd(g.nz || 0, 1e6), gl: rd(g.gl || 0, 1e6), ring: Array.from(g.ring, (x) => +x.toPrecision(4)), gate: Array.from(g.gate, (x) => +x.toPrecision(4)),
        errs: g.errs.map((e) => [rd(e[0], 1e4), rd(e[1], 1e4)]), rerr: rd(g.rerr, 10), series: g.series.map((q) => [tm(q.t), rd(q.err, 1e5), rd(q.q, 1e3)]), sweep: g.sweep.map((q) => [rd(q.e, 1e4), rd(q.db, 10)]) }; });
    return { id: su.id, t: tm(now), sc, dg };
  }
  function unpackMaps(mm: ReturnType<typeof packMaps>, su: RSuite) {
    const M = Radar.MAP, B = bins(), lut = new Float32Array(256); for (let i = 0; i < 256; i++) lut[i] = i ? Math.pow(10, (i / 4 - 10) / 10) : 0;
    mm.sc.forEach((s, k) => {
      const sc = su.scans[k]; if (!sc) return; const u = unb64(s.m), ag = unb64(s.a);
      for (let c = 0; c < M.na; c++) { const base = c * M.nr, ob = c * NB; for (let b = 0; b < M.nr; b++) sc.map[base + b] = lut[u[ob + B[b]]]; sc.age[c] = ag[c] === 255 ? -1e9 : mm.t - ag[c] / 100 * s.per; }
    });
    mm.dg.forEach((g, i) => { const tr = su.trks[i]; if (!tr) return; if (!g) { tr.dg = undefined; return; }
      tr.dg = { mono: g.mono.map((q) => ({ s: q[0], x: q[1], y: q[2] })), nz: g.nz, gl: g.gl, ring: Float32Array.from(g.ring), gate: Float32Array.from(g.gate), errs: g.errs, rerr: g.rerr, series: g.series.map((q) => ({ t: q[0], err: q[1], q: q[2] })), sweep: g.sweep.map((q) => ({ e: q[0], db: q[1] })) }; });
  }
  // the plot of the suite itself an unpacked one stands for (a pick the hologram made, as the server would find it from what a page sends)
  function realPlot(su: RSuite, p: RPlot): RPlot {
    const sc = su.scans[p.k]; if (!sc) return p;
    const same = (q: RPlot) => Math.abs(q.t - p.t) < 2e-3 && Math.abs(q.r - p.r) < 0.6 && Math.abs(q.phi - p.phi) < 2e-4;
    for (const c of sc.cons) if (same(c.p)) return c.p;
    for (const q of sc.plots) if (same(q)) return q;
    return p;
  }
  // (the sizes of what'd be sent: JSON bytes)
  function sizes(su: RSuite, now: number) { const j = (x: unknown) => JSON.stringify(x).length; return { core: j(pack(su, now)), dbg: j(pack(su, now, { dbg: true })), maps: j(packMaps(su, now)), cons: su.scans.reduce((a, s) => a + s.cons.length, 0), bel: (su.bel || []).length, fus: su.fus.length, ass: su.ass.length, tts: su.sched ? su.sched.tts.length : 0 }; }
  return Object.assign(on, { pack, unpack, packMaps, unpackMaps, realPlot, sizes, KFV });
})();
