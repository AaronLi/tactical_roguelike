'use strict';
// The space battle's word from the server to its clients (docs/space-server.md phase C1): what the server's battle (js/svbattle.ts,
// one js/spacesim.ts SimWorld a zone) says each step, as messages, and back.
//   sss  the core snapshot, every SSS_EVERY steps (20 Hz), to everyone: the step it's of (n), which of the zone's ships' levels its
//        frame is (k: positions are in that level's frame, as everything in the battle is), the zone's time (zt), and what a client
//        draws: missiles, torpedoes, chaff, the mission ship's hull guns (hp, how they're laid, firing), the damage she's done (dm)
//   sev  events (reliable, in order), gathered over the steps since the last snapshot and sent with it, each with its step: damage
//        to the squad's ship, a missile launched or ended, a torpedo ended, a hull gun hit, a gun's rounds fired this step (fire: the gun,
//        its aim, the track's error, a seed and how many: a client flies the same rounds, js/spacesim.ts fireRound on mulberry32(seed),
//        rather than each round being sent). A round's end (a burst, a rock) isn't sent: the client's own copy of it gets there too.
// sss goes as bytes on the fast channel (sssBin / sssUnbin: js/snapcodec.ts; js/netfast.ts, unreliable, the newest wins); sev, as JSON's
// plain arrays on the reliable one (encode / decode, a swappable codec).
import type { SimWorld, SimEvent } from './spacesim.js';
import { SnapWriter, SnapReader } from './snapcodec.js';

export type SssMsg = { t: 'sss'; n: number; k: number; zt: number; mis: number[][]; tp: number[][]; ch: number[][]; g: number[][]; dm: number; hp?: number; sp?: number[] };
export type SevE =
  | { k: 'dmg'; n: number; d: number; h: number; w?: string }
  | { k: 'mis'; n: number; id: number; a: number[] }
  | { k: 'misEnd'; n: number; id: number; hit: 0 | 1 }
  | { k: 'tEnd'; n: number; id: number; how: number; on?: string }
  | { k: 'gHit'; n: number; i: number; hp: number }
  | { k: 'fire'; n: number; i: number; a: number[]; e: number; s: number; c: number };
export type SevMsg = { t: 'sev'; n: number; e: SevE[] };

const r1 = (v: number) => Math.round(v * 10) / 10, r2 = (v: number) => Math.round(v * 100) / 100, r4 = (v: number) => Math.round(v * 1e4) / 1e4;
const v3 = (v: THREE.Vector3, r = r1) => [r(v.x), r(v.y), r(v.z)];

export const SpaceNet = {
  SSS_EVERY: 3, // (steps a snapshot: 60 / 3 = 20 Hz)
  codec: { enc: (m: SssMsg | SevMsg): any => m, dec: (m: any): SssMsg | SevMsg => m },
  // The snapshot of world W at step n (k: the zone ship whose level it's in the frame of; zt: the zone's time; dm: damage she's done).
  // mis [id, x, y, z, vx, vy, vz, age]; tp [id, x, y, z, vx, vy, vz, qx, qy, qz, qw, flags (phase | motor 4 | RCS 8 | the server's 16)];
  // ch [n, x, y, z, vx, vy, vz, age]; g [hp, yaw, pitch, firing (an mg's burst on, 1), barrels' spin]
  // (hp: her hull's, as the server keeps it; left out until it's heard one)
  // (sp: her pose and way [P, Q, V] while the server flies her: docs/space-server.md C2)
  sss(W: SimWorld, n: number, k: number, zt: number, dm: number, hp = -1, flown = false): SssMsg {
    return {
      t: 'sss', n, k, zt: r2(zt), dm: r2(dm), ...(hp >= 0 ? { hp: r2(hp) } : {}), ...(flown ? { sp: [...W.ship.P.toArray(), ...W.ship.Q.toArray(), ...W.ship.V.toArray()] } : {}),
      mis: W.mis.map((m) => [m.id, ...v3(m.p), ...v3(m.v, r4), r2(m.t)]),
      tp: W.torps.map((tp) => [tp.id, ...v3(tp.p), ...v3(tp.v), r4(tp.q.x), r4(tp.q.y), r4(tp.q.z), r4(tp.q.w), tp.ph | (tp.thr > 0.05 ? 4 : 0) | (tp.rcs ? 8 : 0) | (tp.mine ? 16 : 0)]),
      ch: W.chaff.map((c) => [+c.t.id.slice(5), ...v3(c.t.p), ...v3(c.t.v), r2(W.t - c.born)]),
      g: W.guns.map((gn) => [r2(gn.hp), r4(gn.yaw || 0), r4(gn.pitch || 0), (gn.bt || 0) > 0 ? 1 : 0, r2(gn.rev || 0)]),
    };
  },
  // a step's events (W.out) as sev entries; what isn't sent (burst, rockHit: a client's own copy of the round gets there) left out
  sevOf(out: SimEvent[], n: number, into: SevE[]) {
    for (const e of out) {
      if (e.k === 'damage') into.push(e.why ? { k: 'dmg', n, d: r2(e.dmg), h: e.hits, w: e.why } : { k: 'dmg', n, d: r2(e.dmg), h: e.hits });
      else if (e.k === 'missile') into.push({ k: 'mis', n, id: e.m.id, a: [...v3(e.m.p, r2), ...v3(e.m.v, r4)] });
      else if (e.k === 'missileEnd') into.push({ k: 'misEnd', n, id: e.id, hit: e.hit ? 1 : 0 });
      else if (e.k === 'torpEnd') into.push(e.on ? { k: 'tEnd', n, id: e.id, how: e.how, on: e.on } : { k: 'tEnd', n, id: e.id, how: e.how });
      else if (e.k === 'gunHit') into.push({ k: 'gHit', n, i: e.i, hp: r2(e.hp) });
    }
    return into;
  },
  // a gun's rounds this step (i its index, aim the unrounded vector it fired along, err, the rounds' seed and count)
  fireOf(n: number, i: number, aim: THREE.Vector3, err: number, s: number, c: number): SevE { return { k: 'fire', n, i, a: [aim.x, aim.y, aim.z], e: err, s, c }; },
  // sss as bytes (js/snapcodec.ts, format SSS_BIN), for the fast channel's stream SSS_CH (unreliable, the newest wins): the step, the
  // level, the zone's time, damage done, her hull (-1: not known), then each list with its count first; positions and velocities in
  // 32-bit floats (millimetres at 10 km), a torpedo's attitude in 16-bit steps, flags a byte
  SSS_BIN: 2, SSS_CH: 4,
  sssBin(m: SssMsg): ArrayBuffer {
    const w = new SnapWriter(this.SSS_BIN, 64 + m.mis.length * 36 + m.tp.length * 40 + m.ch.length * 36 + m.g.length * 20);
    w.vu(m.n).vu(m.k).f64(m.zt).f32(m.dm).f32(m.hp == null ? -1 : m.hp);
    w.bool(!!m.sp); if (m.sp) for (let j = 0; j < 10; j++) w.f64(m.sp[j]); // (her pose, flown by the server: full doubles, as it has her)
    const f = (a: number[], i: number, k: number) => { for (let j = 0; j < k; j++) w.f32(a[i + j]); };
    w.vu(m.mis.length); for (const a of m.mis) { w.vu(a[0]); f(a, 1, 7); }
    w.vu(m.tp.length); for (const a of m.tp) { w.vu(a[0]); f(a, 1, 6); for (let j = 7; j < 11; j++) w.q(a[j], -1, 1, 16); w.u8(a[11]); }
    w.vu(m.ch.length); for (const a of m.ch) { w.vu(a[0]); f(a, 1, 7); }
    w.vu(m.g.length); for (const a of m.g) { w.f32(a[0]); w.f32(a[1]); w.f32(a[2]); w.u8(a[3]); w.f32(a[4]); }
    return w.done();
  },
  // (null: not a format this reads)
  sssUnbin(buf: ArrayBuffer | ArrayBufferView): SssMsg | null {
    const r = new SnapReader(buf); if (r.version !== this.SSS_BIN) return null;
    const n = r.vu(), k = r.vu(), zt = r.f64(), dm = r.f32(), hp = r.f32(), sp = r.bool() ? Array.from({ length: 10 }, () => r.f64()) : null;
    const f = (a: number[], c: number) => { for (let j = 0; j < c; j++) a.push(r.f32()); return a; };
    const mis: number[][] = []; for (let i = r.vu(); i > 0; i--) mis.push(f([r.vu()], 7));
    const tp: number[][] = []; for (let i = r.vu(); i > 0; i--) { const a = f([r.vu()], 6); for (let j = 0; j < 4; j++) a.push(r.q(-1, 1, 16)); a.push(r.u8()); tp.push(a); }
    const ch: number[][] = []; for (let i = r.vu(); i > 0; i--) ch.push(f([r.vu()], 7));
    const g: number[][] = []; for (let i = r.vu(); i > 0; i--) g.push([r.f32(), r.f32(), r.f32(), r.u8(), r.f32()]);
    return { t: 'sss', n, k, zt, dm, ...(hp >= 0 ? { hp } : {}), ...(sp ? { sp } : {}), mis, tp, ch, g };
  },
  encode(m: SssMsg | SevMsg) { return this.codec.enc(m); },
  decode(m: any) { return this.codec.dec(m); },
  // a snapshot read back into vectors (for a client to draw from)
  read(m: SssMsg) {
    const T = THREE, V = (a: number[], i: number) => new T.Vector3(a[i], a[i + 1], a[i + 2]);
    return {
      n: m.n, k: m.k, zt: m.zt, dm: m.dm, hp: m.hp == null ? -1 : m.hp, sp: m.sp || null,
      mis: m.mis.map((a) => ({ id: a[0], p: V(a, 1), v: V(a, 4), t: a[7] })),
      tp: m.tp.map((a) => ({ id: a[0], p: V(a, 1), v: V(a, 4), q: new T.Quaternion(a[7], a[8], a[9], a[10]).normalize(), ph: a[11] & 3, thr: a[11] & 4 ? 1 : 0, rcs: !!(a[11] & 8), sv: !!(a[11] & 16) })),
      ch: m.ch.map((a) => ({ n: a[0], p: V(a, 1), v: V(a, 4), age: a[7] })),
      g: m.g.map((a) => ({ hp: a[0], yaw: a[1], pitch: a[2], fire: !!a[3], rev: a[4] })),
    };
  },
  // a seeded stream as the server's rounds are spread by (mulberry32, as js/util.ts U.rng)
  rng(seed: number) { let s = seed >>> 0; return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; },
};
