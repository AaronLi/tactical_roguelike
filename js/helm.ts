'use strict';
// Her helm (docs/space-server.md C3): her flight in every way she flies (free; the breach assist and being brought round onto a site;
// warp; the autopilot's eased moves: the last of a breach, setting down, backing away), what she runs into, and what happens as she
// flies (the breach, the cloud's edge going down or up). Apart from the page: made for a state (the page's S has it all; the server
// keeps one of its own), the level's geometry and frame as the caller has them (G), and what it does that isn't her flight said as
// events (ev: a toast, a kick, the plan to draw, damage, where she now lies, the autopilot's move done, the cloud crossed, her pose to
// tell). The page runs it to fly her (and, with the server's battle, to predict it); the server runs the same to fly her itself.
import { SpaceData as SD } from './spacedata.js';
import { ShipGen } from './shipgen.js';
import { Level } from './level.js';
import { U } from './util.js';
import { SpaceSim, FlyIn, FB } from './spacesim.js';

type SpWp = { id: string; name: string; sub?: string; p: THREE.Vector3; kind: string; i?: number; hide?: boolean };
type ShSite = ReturnType<typeof ShipGen.sites>[number];
// what follows the autopilot's eased move
export type HelmThen = { k: 'none' } | { k: 'breach'; at: number[] } | { k: 'land' };
// the pilot's input for a step: whether anyone's at the helm, the flight keys (js/spacesim.ts FB), the stick as pushed this step, and
// the way her radar lock's going as the pilot's shown it (matched to the radar: Shift H)
export interface HelmIn { h: boolean; b: number; sx: number; sy: number; rb: THREE.Vector3 | null }
export type HelmEv =
  | { k: 'toast'; h: string; b: string; t: number } | { k: 'kick'; a: number } | { k: 'pose' }
  | { k: 'plan'; p: any } | { k: 'route'; pts: THREE.Vector3[]; n: THREE.Vector3 }
  | { k: 'dmg'; n: number; why: string } | { k: 'rebase'; b: { x: number; y: number; z: number; yaw: number; pt?: number } }
  | { k: 'auto'; then: HelmThen } | { k: 'through'; to: 'orbit' | 'atmo' };
// the level's geometry and frame, as the caller has them
export interface HelmG {
  sites: () => ShSite[]; // (every site she could be breached through now: js/space.ts siteList)
  siteAt: (a: number[]) => ShSite;
  tgtR: (w: SpWp) => number;
  fieldAt: (p: THREE.Vector3) => THREE.Vector3;
  zstep: (p: THREE.Vector3, v: THREE.Vector3, dt: number) => void; // (her own way through the zone: its memory the caller's)
  zturn: (q: THREE.Quaternion) => void;
  rocks: () => { near: number[]; p: THREE.Vector3[]; v: THREE.Vector3 };
  rockList: () => { r: number }[];
  boom: () => boolean; // (the mission ship blowing herself apart: no breaching her)
}
export function helmOf(S: any, G: HelmG, ev: (e: HelmEv) => void) {
  const T = THREE;
  const fwd = (q: THREE.Quaternion) => new T.Vector3(0, 0, -1).applyQuaternion(q);
  const yawQ = (yaw: number) => new T.Quaternion().setFromAxisAngle(new T.Vector3(0, 1, 0), yaw);
  const berthQ = (b: { yaw: number; pt?: number }) => b.pt ? yawQ(b.yaw).multiply(new T.Quaternion().setFromAxisAngle(new T.Vector3(1, 0, 0), b.pt)) : yawQ(b.yaw);
  function lookQ(dir: THREE.Vector3) { const m = new T.Matrix4().lookAt(new T.Vector3(), dir, new T.Vector3(0, 1, 0)); return new T.Quaternion().setFromRotationMatrix(m); }
  // (reach: how far to one side of a site her nose line may meet the hull and still be on for it; 3.5 m: the collar takes her onto
  // the nearest, though the line meets a window or a bulkhead's end between sites)
  // (dir: along that line instead of her nose's: her course, js/space.ts squareUp)
  function aim(maxT = 320, reach = 3.5, dir?: THREE.Vector3) {
    if (S.kind !== 'board' || !S.map || !S.map.sp) return null;
    const L = SD.layout(S.def), zn = L.zc - 0.22, N = new T.Vector3(0, L.FB + 1.16, zn).applyQuaternion(S.Q).add(S.P), f = dir ? dir.clone().normalize() : fwd(S.Q), TS = Level.TS; // (the collar's middle: 1.4 over the deck she breaches when she's level with it)
    let best: ShSite | null = null, bo = reach, bt = 0; // (the nearest site the line passes within reach of: the collar pulls her onto it)
    const list = G.sites();
    for (const s of list) {
      const dn = f.x * s.nx + f.z * s.nz; if (dn > -0.34) continue; // (her nose on it within 70 degrees)
      const px = s.x + s.nx * TS / 2, pz = s.z + s.nz * TS / 2, t = ((px - N.x) * s.nx + (pz - N.z) * s.nz) / dn;
      if (t < -1 || t > maxT) continue;
      const off = Math.abs(s.nz ? N.x + f.x * t - px : N.z + f.z * t - pz);
      if (off < bo) { bo = off; best = s; bt = t; }
    }
    if (!best) return null;
    const lat = best.nz ? (N.x - best.x) * -best.nz : (N.z - best.z) * best.nx, range = (N.x - best.x) * best.nx + (N.z - best.z) * best.nz - TS / 2;
    return { site: best, t: bt, range, dx: lat, dy: N.y - 1.4, align: -(f.x * best.nx + f.z * best.nz), close: -(S.V.x * best.nx + S.V.z * best.nz) };
  }
  // A step of her flight, whichever way she's flying (I: the pilot's input this step; I.h false: nobody at the helm)
  function fly(I: HelmIn, dt: number) {
    const d = S.def, helm = I.h, kb = (bit: number) => helm && (I.b & bit) !== 0;
    S.stick.set(I.sx, I.sy); // (the stick as the pilot's pushed it this step, before it springs back)
    S.stick.multiplyScalar(Math.exp(-dt * 2.2));
    if (S.auto) { autoStep(dt); return; }
    if (S.docked || S.ftl) { S.V.set(0, 0, 0); S.Wv.set(0, 0, 0); S.spin = 0; S.warp = null; return; }
    if (S.warp) { warpStep(dt); return; }
    S.cruise = false;
    const want = new T.Vector3();
    let acc = 26;
    // (the pilot's input this step, as data: what the simulation's flight reads, js/spacesim.ts flyTurn / flyPush)
    const FI: FlyIn | null = helm ? { b: I.b, sx: S.stick.x, sy: S.stick.y, base: null } : null;
    if (helm) {
      const sp = S.stage === 'atmo' ? Math.min(d.speed, 110) : d.speed;
      want.set((kb(FB.D) ? 1 : 0) - (kb(FB.A) ? 1 : 0), (kb(FB.U) ? 1 : 0) - (kb(FB.C) ? 1 : 0), (kb(FB.S) ? 1 : 0) - (kb(FB.W) ? 1 : 0));
      want.x *= d.speed * 0.4; want.y *= d.speed * 0.4; want.z *= want.z < 0 ? sp : d.speed * 0.4;
      if (kb(FB.X)) want.set(0, 0, 0);
      acc = kb(FB.X) ? 60 : 30;
    }
    spinUp(dt, helm);
    SpaceSim.flyTurn(S.Q, S.Wv, d.turn, FI, dt);
    // (the breach assist only while her pilot's opening the throttle: let go, and it lets go of her, whatever's coming her way; a ship
    // she's left closing on her, or drifting at one, is no call for it)
    if (helm && S.kind === 'board' && kb(FB.W)) squareUp(dt, kb); else if (S.brLock || S.brRound) { S.brLock = null; S.brRound = null; S.roundBrake = false; }
    // in air she rights herself (no rolling over above a base)
    if (S.stage === 'atmo' && S.kind === 'assault') { const up = new T.Vector3(0, 1, 0).applyQuaternion(S.Q), fix = new T.Quaternion().setFromUnitVectors(up, new T.Vector3(up.x * 0.5, Math.max(0.6, up.y), up.z * 0.5).normalize()); S.Q.premultiply(new T.Quaternion().slerp(fix, Math.min(1, dt * 1.5))).normalize(); }
    want.applyQuaternion(S.Q);
    // (her speed matched with the ship she's locked on (H): her throttle's reckoned from that ship's way, not the level's, so a ship
    // drawing off at near her own top speed can be gained on; and let go, she keeps station on her. Off again with H, or another target)
    const tw = S.wps[S.tgt]; if (S.match && S.match !== 'radar' && (!tw || tw.hide || tw.id !== S.match)) S.match = null;
    const lk = S.match === 'radar' ? I.rb : null; if (S.match === 'radar' && !lk) S.match = null; // (the lock lost: matched to nothing; I.rb: her radar lock's way as the pilot's shown it)
    const base = helm && S.match ? (lk || S.tv) : null;
    if (base) want.add(base);
    if (FI) FI.base = base;
    // How she flies, tied to no one's frame: her thrusters push her (main engine along her nose, the others square to it), and let go she
    // keeps going as she was. X held: she brakes to the field's way (the zone's: the rocks and the stars, stood still among them). H on a
    // target (or Shift H on the radar's lock), with nothing pushed: she's kept matched to it. Never more than FLY.max off the field's way.
    // (The breach assist, while it has her (W held, lined up on a site), flies as it did: its plan's in velocities.)
    const fieldV = G.fieldAt(S.P), assist = helm && (S.brLock || S.brRound) && kb(FB.W) && !kb(FB.A) && !kb(FB.D) && !kb(FB.U) && !kb(FB.C) && !kb(FB.S) && !kb(FB.X);
    if (assist) {
      const dv = want.sub(S.V);
      if (helm && (S.brLock || S.brRound) && !kb(FB.A) && !kb(FB.D) && !kb(FB.U) && !kb(FB.C) && !kb(FB.S) && !kb(FB.X)) { const f = fwd(S.Q), k = S.brRound && S.roundBrake ? 0 : Math.max(0, dv.dot(f)); dv.copy(f).multiplyScalar(k); } // (and the throttle's yours on top of what the approach's engine gives: open it, and she goes in at her top speed) // (lined up on a site: her assist only ever speeds her along her nose, never brakes her, and stands down while the approach has her engine)
      const l = dv.length(), step = acc * dt * ((base ? S.V.clone().sub(base) : S.V).length() > d.speed * 1.2 ? 6 : 1) * (helm && S.brLock && S.brLock.rp != null ? S.brLock.rp : 1); // (handed on from being brought round: her throttle comes in over a second)
      if (l > 1e-4) S.V.addScaledVector(dv, Math.min(1, step / l));
      SpaceSim.flyMax(S.V, fieldV);
    } else SpaceSim.flyPush(S.V, S.Q, FI, fieldV, dt); // (her thrusters, and her top speed against the field)
    if (assist) S.P.addScaledVector(S.V, dt); else { G.zstep(S.P, S.V, dt); G.zturn(S.Q); } // (on the breach assist: in her frame, where the site is)
    collide(dt);
    events();
    return { I: FI }; // (flown free this step (no autopilot, warp, docked), from this: the page's check of its own step, js/space.ts c2Post)
  }
  // Coming in on a stretch of hull she can breach, she's brought onto it on a curve. The site's the one her nose line meets (aim: within
  // 300 m of it, her nose on it within about 70 degrees, closing), and once it's chosen it's held (brLock) while she comes in. She's
  // taken across with as little acceleration across as can do it, to meet the hull at the site itself: the plan worked out afresh every
  // frame for the time she'll take to get there (the minimum-energy one: a = -3 (y + v t) / t², y her distance from the line straight out
  // from the site, v her drift across it, t the time to go, counting her speeding up on the way). She isn't squared up: she may still be
  // drifting across as she hits, and meets the hull at whatever angle that makes (an angled breach, up to SpaceData.BREACH_ANG: events).
  // The last COAST seconds she coasts. Her nose is kept level, her roll taken out, her collar eased to the height of the deck beyond by
  // the same kind of plan, up or down. The plan across is flown by her main engine, not her side thrusters: her nose is turned toward
  // where the plan wants her pushed, up to PHI degrees off straight in, and she thrusts along it, so the push across comes with as much
  // forward (at up to ENG_MAX, and never back: nothing brakes her while she's lined up). What the engine can't give across at that, her
  // side thrusters do, square across her nose; and a plan wanting more across than ENG_HARD gets no forward at all, its time being what
  // it's short of. It's as strong as she's closing (full from 25 m/s), and the pilot's own turning eases it off; turning hard for a
  // moment, or standing off, lets the site go (a new one's taken from her nose line). (FREE false, from the console (dbgBr): the older
  // plan, side thrusters, squared up, on the line and no longer drifting LINE_ON metres out.)
  let NOSE_RATE = 25, LINE_ON = 12, SIDE_MAX = 75, FREE = true, FREE_ON = 0, COAST = 0.35, PHI = 45, ENG_MAX = 60, ENG_HARD = 30, UP_MAX = 30;
  const dbgBr = (o: { on?: number; max?: number; free?: boolean; freeOn?: number; phi?: number; eng?: number }) => { if (o.on != null) LINE_ON = o.on; if (o.max != null) SIDE_MAX = o.max; if (o.free != null) FREE = o.free; if (o.freeOn != null) FREE_ON = o.freeOn; if (o.phi != null) PHI = o.phi; if (o.eng != null) ENG_MAX = o.eng; if ((o as any).hard != null) ENG_HARD = (o as any).hard; if ((o as any).coast != null) COAST = (o as any).coast; return { LINE_ON, SIDE_MAX, FREE, FREE_ON, PHI, ENG_MAX, ENG_HARD }; }; // (dbgBr: for tuning, from the console)
  // (handed on from being brought round: for its first second what the breach assist does to her way is blended in from what bringing
  // her round was doing, so neither her turn nor her push changes all at once)
  function squareUp(dt: number, kb: (bit: number) => boolean) {
    const v0 = S.V.clone(); squareUp0(dt, kb);
    const lk = S.brLock;
    if (lk && lk.rp != null && lk.rp < 1 && lk.ra) { const w = lk.rp * lk.rp * (3 - 2 * lk.rp); S.V.sub(v0).multiplyScalar(w).add(v0).addScaledVector(lk.ra, (1 - w) * dt); }
  }
  function squareUp0(dt: number, kb: (bit: number) => boolean) {
    S.brThrust = false;
    const TS = Level.TS, L = SD.layout(S.def), lk = S.brLock && S.brLock.map === S.map ? S.brLock : null;
    // (the stretch of hull her course already takes her to, if it takes her to one: least to put right, least turning; else the one her nose is on)
    if (!lk && S.brRound && S.brRound.map === S.map) { roundUp(dt); if (!S.brLock) return; } // (being brought round: it hands her to this itself, on its own site, once she's on the line in)
    if (!S.brLock || S.brLock.map !== S.map) { const ok = (a: ReturnType<typeof aim>) => !!a && a.range <= 300 && a.range >= -0.5 && a.align >= 0.34 && a.close > 0, a = (S.V.length() > 5 && [aim(320, 25, S.V)].find(ok)) || [aim(320, 25)].find(ok); if (!a) { roundUp(dt); return; } S.brLock = { site: a.site, map: S.map!, hard: 0, q0: S.Q.clone() }; S.brRound = null; } // (none on her way or her nose's: brought round to one, roundUp)
    const lock = S.brLock!, st = lock.site, nx = st.nx, nz = st.nz, tx = -nz, tz = nx;
    const N = new T.Vector3(0, L.FB + 1.16, L.zc - 0.22).applyQuaternion(S.Q).add(S.P), fx = st.x + nx * TS / 2, fz = st.z + nz * TS / 2;
    const out = (N.x - fx) * nx + (N.z - fz) * nz, side = (N.x - fx) * tx + (N.z - fz) * tz, close = -(S.V.x * nx + S.V.z * nz);
    lock.hard = S.stick.length() > 0.6 ? lock.hard + dt : 0;
    // (handed on from being brought round: the throttle she'd been kept off comes in over a second, not all at once)
    if (lock.rp != null) lock.rp = Math.min(1, lock.rp + dt);
    if (out > 320 || out < -1 || close <= 0 || lock.hard > 0.5) { S.brLock = null; return; } // (standing off, past it, or the pilot's taken her elsewhere)
    const k = U.clamp(close / 25, 0, 1) * (1 - 0.7 * Math.min(1, S.stick.length()));
    if (k <= 0) return;
    // across: the least-acceleration plan for the time she'll take at the speed she's closing (replanned every frame, so what the engine
    // adds forward shortens it as it goes)
    // (the time to go counts her speeding up on the way in: the engine's forward push as it was last frame while the approach has it, or
    // her own throttle, open, to her top speed. Reckoned at her speed now it'd be too long: the plan would push too little early, and
    // have to push back later to take out the drift that built)
    const vs = S.V.x * tx + S.V.z * tz, dist = Math.max(0, out - (FREE ? FREE_ON : LINE_ON)), v0 = Math.max(close, 5);
    const eF = lock.fa && lock.fa > 0.5 ? lock.fa : 0, aF = eF + (kb(FB.W) && v0 < S.def.speed ? 30 * (lock.rp != null ? lock.rp : 1) : 0), vm = eF ? Infinity : S.def.speed; // (the engine's push and the throttle's together)
    let tgo = dist / v0;
    if (aF > 0) { const t1 = (vm - v0) / aF, d1 = v0 * t1 + aF * t1 * t1 / 2; tgo = dist <= d1 ? (-v0 + Math.sqrt(v0 * v0 + 2 * aF * dist)) / aF : t1 + (dist - d1) / vm; }
    // (the last COAST seconds she's left to coast: a miss of a metre over a time that small would take a slam across to put right, and
    // the plan would only chase its own noise)
    const coast = FREE && tgo < COAST;
    tgo = Math.max(0.3, tgo);
    const a = U.clamp(FREE ? (out > FREE_ON && !coast ? -3 * (side + vs * tgo) / (tgo * tgo) : 0) : out > LINE_ON ? -6 * side / (tgo * tgo) - 4 * vs / tgo : -12 * side - 7 * vs, -SIDE_MAX, SIDE_MAX) * k;
    // (her nose first, as it'll be this frame: what pushes her is set against it)
    const vdir = () => (Math.hypot(S.V.x, S.V.z) > 5 ? new T.Vector3(S.V.x, 0, S.V.z).normalize() : new T.Vector3(-nx, 0, -nz));
    const ph = PHI * Math.PI / 180, eng = FREE && out > FREE_ON && !coast && Math.abs(a) > 0.05;
    // (her engine at up to ENG_MAX, its nose PHI off straight in: what it gives across, and with it forward. A plan wanting more across than
    // ENG_HARD gets none of it (no forward: speeding up would take away the time it's short of): her side thrusters do it all, nose on her way)
    const T0 = eng && Math.abs(a) <= ENG_HARD ? Math.min(ENG_MAX, Math.abs(a) / Math.sin(ph)) : 0, ea = Math.sign(a) * T0 * Math.sin(ph), fa = T0 * Math.cos(ph);
    const th = new T.Vector3(-nx * fa + tx * ea, 0, -nz * fa + tz * ea), dir = FREE ? vdir() : T0 > 0 ? th.clone().normalize() : out <= LINE_ON ? new T.Vector3(-nx, 0, -nz) : vdir(); // (her nose on her way, whatever the plan's pushing: turned to the push, it swung back and forth each time the engine came on or went off)
    // (nose up or down with her way, climbing or diving onto the site: no more than BREACH_PITCH, and level with the older plan)
    if (FREE) { const hv = Math.max(5, Math.hypot(S.V.x, S.V.z)), pm = SD.BREACH_PITCH * Math.PI / 180, pa = U.clamp(Math.atan2(S.V.y, hv), -pm, pm); dir.multiplyScalar(Math.cos(pa)).setY(Math.sin(pa)); }
    if (FREE) {
      // (her nose brought round from where it was when she locked on to her way by the hull, a little at a time as she closes (by the time
      // to go), and never faster than NOSE_RATE: turning spread over the whole approach, not swung round at the start)
      // (handed on from being brought round, her nose already on her way: it stays on it, as quick as it was turning)
      if (lock.T0 == null || tgo > lock.T0) lock.T0 = tgo;
      const sP = lock.rp != null ? 1 : U.clamp(1 - tgo / lock.T0, 0, 1), want = (lock.q0 || S.Q).clone().slerp(lookQ(dir), sP * sP * (3 - 2 * sP));
      S.Q.rotateTowards(want, (lock.rp != null ? ROUND.RATE : NOSE_RATE) * Math.PI / 180 * dt * (1 - 0.7 * Math.min(1, S.stick.length()))).normalize();
    } else S.Q.slerp(lookQ(dir), Math.min(1, dt * 30 * (1 - 0.7 * Math.min(1, S.stick.length())))).normalize();
    if (T0 > 0) { S.V.addScaledVector(th, dt); S.brThrust = true; }
    lock.fa = (lock.fa || 0) + ((T0 > 0 ? fa : 0) - (lock.fa || 0)) * Math.min(1, dt * 2); // (for the time to go: eased, so the plan and the push it sets don't chase each other frame to frame)
    const rest = FREE ? (eng ? a - ea : 0) : a;
    if (Math.abs(rest) > 1e-3) { // (her side thrusters, square across her nose as it is, never back along it: as much as gives the plan's push along the hull)
      const f = fwd(S.Q); f.y = 0; f.normalize(); let px = f.z, pz = -f.x; if (px * tx + pz * tz < 0) { px = -px; pz = -pz; }
      const c = px * tx + pz * tz; if (c > 0.3) { S.V.x += px * rest / c * dt; S.V.z += pz * rest / c * dt; } else { S.V.x += tx * rest * dt; S.V.z += tz * rest * dt; }
    }
    // up or down: for her collar to meet its mark (1.4 m over the deck beyond) at the hull. As across, the least-acceleration plan, not
    // levelled off: she may meet it climbing or diving (a breach nose up or down, SpaceData.BREACH_PITCH), so long as the way she'd be going
    // as she hit is within BREACH_PITCH less 5 degrees of level; a plan that would have her steeper squares her up as the older one does
    const dy = N.y - 1.4, vy = S.V.y, ty0 = Math.max(0.3, Math.max(0, out) / Math.max(close, 5));
    const vf = -2 * vy - 3 * dy / tgo, steep = Math.abs(vf) > Math.tan((SD.BREACH_PITCH - 5) * Math.PI / 180) * Math.max(close, 5);
    const ay = U.clamp(FREE && !steep ? (out > FREE_ON && !coast ? -3 * (dy + vy * tgo) / (tgo * tgo) : 0) : out > 1 ? -6 * dy / (ty0 * ty0) - 4 * vy / ty0 : -8 * dy - 6 * vy, -UP_MAX, UP_MAX) * k;
    S.V.y += ay * dt;
    ev({ k: 'plan', p: { fx, fz, nx, nz, tx, tz, out, side, vs, dy, vy, T: tgo, v0, aF, vm, coast, a0: FREE && !coast ? -3 * (side + vs * tgo) / (tgo * tgo) : null, ay0: FREE && !steep && !coast ? -3 * (dy + vy * tgo) / (tgo * tgo) : null } });
  }
  const PLAN_N = 64; // (the round-up's way drawn as so many points: js/space.ts planDraw's too)
  const ROUND = { R: 450, MARGIN: 22, OUT: 280, LOOK: 60, A: 40, RATE: 50, VMAX: 55, BRAKE: 30, IN: 90 };
  type Box2 = { x0: number; x1: number; z0: number; z1: number };
  const inBox = (p: THREE.Vector3, b: Box2) => p.x > b.x0 && p.x < b.x1 && p.z > b.z0 && p.z < b.z1;
  // (where along a-b (0..1) it enters a box, Infinity if it doesn't)
  const segBox = (a: THREE.Vector3, b: THREE.Vector3, bx: Box2) => {
    let t0 = 0, t1 = 1; const d = [b.x - a.x, b.z - a.z], o = [a.x, a.z], lo = [bx.x0, bx.z0], hi = [bx.x1, bx.z1];
    for (let k = 0; k < 2; k++) {
      if (Math.abs(d[k]) < 1e-9) { if (o[k] <= lo[k] || o[k] >= hi[k]) return Infinity; continue; }
      let u = (lo[k] - o[k]) / d[k], w = (hi[k] - o[k]) / d[k]; if (u > w) [u, w] = [w, u];
      t0 = Math.max(t0, u); t1 = Math.min(t1, w); if (t0 >= t1) return Infinity;
    }
    return t0;
  };
  const boxDist = (p: THREE.Vector3, b: Box2) => Math.hypot(Math.max(b.x0 - p.x, 0, p.x - b.x1), Math.max(b.z0 - p.z, 0, p.z - b.z1));
  // the way from a to b round her hulls (hard: the boxes it mustn't cross; corners: just outside them, where it may turn): b alone if
  // nothing's in the way, else by one corner, or two of the same box; a box she's already inside isn't in her way (she's close in)
  function roundRoute(a: THREE.Vector3, b: THREE.Vector3, hard: Box2[], soft: Box2[]) {
    const hb = hard.filter((bx) => !inBox(a, bx)), clear = (p: THREE.Vector3, q: THREE.Vector3) => hb.every((bx) => segBox(p, q, bx) === Infinity);
    if (clear(a, b)) return [b];
    const cs: THREE.Vector3[][] = soft.map((bx) => [[bx.x0, bx.z0], [bx.x1, bx.z0], [bx.x1, bx.z1], [bx.x0, bx.z1]].map(([x, z]) => new T.Vector3(x, b.y, z)));
    let best: THREE.Vector3[] | null = null, bl = Infinity;
    const len = (w: THREE.Vector3[]) => { let l = 0, p = a; for (const q of w) { l += Math.hypot(q.x - p.x, q.z - p.z); p = q; } return l; };
    for (const box of cs) for (let i = 0; i < 4; i++) {
      const c = box[i];
      if (clear(a, c) && clear(c, b)) { const w = [c, b]; if (len(w) < bl) { bl = len(w); best = w; } }
      for (const j of [(i + 1) % 4, (i + 3) % 4]) { const c2 = box[j]; if (clear(a, c) && clear(c, c2) && clear(c2, b)) { const w = [c, c2, b]; if (len(w) < bl) { bl = len(w); best = w; } } }
    }
    return best || [b];
  }
  function roundUp(dt: number) {
    const sp = S.map && S.map.sp; if (!sp) { S.brRound = null; return; }
    const L = SD.layout(S.def), TS = Level.TS, N = new T.Vector3(0, L.FB + 1.16, L.zc - 0.22).applyQuaternion(S.Q).add(S.P), v = S.V.length();
    const hb: Box2[] = sp.hulls && sp.hulls.length ? sp.hulls : [sp.hull], grow = (m: number) => hb.map((h) => ({ x0: h.x0 - m, x1: h.x1 + m, z0: h.z0 - m, z1: h.z1 + m }));
    const hard = grow(ROUND.MARGIN * 0.6), soft = grow(ROUND.MARGIN), near = Math.min(...hard.map((bx) => boxDist(N, bx)));
    let R = S.brRound && S.brRound.map === S.map ? S.brRound : null;
    if (R) { R.hard = S.stick.length() > 0.6 ? R.hard + dt : 0; if (R.hard > 0.5 || v < 3 || near > ROUND.R * 1.3) { S.brRound = null; return; } }
    if (!R) {
      if (v < 5 || near > ROUND.R) return;
      const dir = S.V.clone().setY(0).normalize(), far = N.clone().addScaledVector(dir, ROUND.R);
      if (!hard.some((bx) => segBox(N, far, bx) !== Infinity)) return; // (not flying at her)
      // (a side she can breach already on her way or her nose's, only too far out yet for the breach assist to have her: left to it)
      const ok = (a: ReturnType<typeof aim>) => !!a && a.range >= -0.5 && a.align >= 0.34 && a.close > 0;
      if ([aim(ROUND.R + 20, 25, S.V)].find(ok) || [aim(ROUND.R + 20, 25)].find(ok)) return;
      let pick: { site: ShSite; face: THREE.Vector3; E: THREE.Vector3 } | null = null, bc = Infinity;
      for (const st of G.sites()) {
        // (the point she turns in from: out on the line, and off it to her side by her turning circle's width, so she's still short of the
        // line when the turn in starts and comes out of it on the line, not swung across it)
        const face = new T.Vector3(st.x + st.nx * TS / 2, 1.4, st.z + st.nz * TS / 2), sg = Math.sign((N.x - face.x) * -st.nz + (N.z - face.z) * st.nx) || 1;
        const E = face.clone().add(new T.Vector3(st.nx * ROUND.OUT - st.nz * sg * 2 * ROUND.VMAX * ROUND.VMAX / (0.9 * ROUND.A), 0, st.nz * ROUND.OUT + st.nx * sg * 2 * ROUND.VMAX * ROUND.VMAX / (0.9 * ROUND.A)));
        const way = roundRoute(N, E, hard, soft); let l = 0, p = N; for (const q of way) { l += Math.hypot(q.x - p.x, q.z - p.z); p = q; }
        const d0 = way[0].clone().sub(N).setY(0).normalize(), c = l + ROUND.OUT + dir.angleTo(d0) * 40; // (the way there, and in, and how far round she has to turn at the start)
        if (c < bc) { bc = c; pick = { site: st, face, E }; }
      }
      if (!pick) return;
      R = S.brRound = { ...pick, hard: 0, map: S.map!, way: roundRoute(N, pick.E, hard, soft) }; // (the corners she goes round, in order, and the point out on the line she turns in from: worked out once)
    }
    // where she's making for: the corner she's going round, else a point on the line ahead of where she is along it
    const n = new T.Vector3(R.site.nx, 0, R.site.nz), t = new T.Vector3(-n.z, 0, n.x), out = N.clone().sub(R.face).dot(n), side = N.clone().sub(R.face).dot(t);
    // (a corner reached, or one she can see past to the next (or to the line): on to the next)
    // (a corner reached, or one she can see past to the next: on to the next; the point out on the line reached, or she's well out
    // along the line already: onto the line)
    while (R.way.length > 1 && (Math.hypot(R.way[0].x - N.x, R.way[0].z - N.z) < 25 || roundRoute(N, R.way[1], hard, soft).length === 1)) R.way.shift();
    if (R.way.length === 1 && (Math.hypot(R.way[0].x - N.x, R.way[0].z - N.z) < 40 || (out > ROUND.OUT * 0.7 && Math.abs(side) < ROUND.OUT))) R.way.shift();
    if (!R.way.length && out < ROUND.IN * 0.5) { S.brRound = null; S.roundBrake = false; return; } // (in close without lining up: it's let go)
    const goal = R.way.length ? R.way[0] : R.face.clone().addScaledVector(n, Math.max(20, out - ROUND.LOOK));
    // turned in toward it, near enough the line, and far enough out: the breach assist has her, on this site. Handed on as soon as she's
    // turned in, not once she's on the line: its plan puts right what's left over the whole run in, gently (lined up first by this, then
    // handed on close in, it had a second or two to take out what was left, and slammed her across)
    const Vd = S.V.clone().setY(0).normalize();
    if (!R.way.length && Math.abs(side) < Math.max(12, out * 0.15) && Vd.dot(n.clone().negate()) > Math.cos(20 * Math.PI / 180) && out > ROUND.IN && Math.abs(N.y - 1.4) < 3) {
      S.brLock = { site: R.site, map: S.map!, hard: 0, q0: S.Q.clone(), rp: 0, ra: R.ra }; S.brRound = null; S.roundBrake = false; return;
    }
    // her course turned toward it (across her way, and down to her collar's height at the hull), never braked
    // (onto the line: not a point on it ahead of her, which at her speed she turned past and swung back across, again and again, but a way
    // to head that leans in toward the line by how far off it she is, over a distance her turning circle can follow without overshooting)
    const Vh = S.V.clone().setY(0), vh = Vh.length() || 1, Lk = Math.max(80, 1.2 * vh * vh / ROUND.A);
    let gd = R.way.length ? goal.clone().sub(N).setY(0).normalize() : n.clone().multiplyScalar(-Lk).addScaledVector(t, -side).normalize();
    if (!R.way.length) {
      // (still turned well away from the way in: the turn in starts when a turn begun now, as tight as she can, comes out on the line; till
      // then she holds her heading toward it)
      const ut = Vh.dot(t) / vh, un = Vh.dot(n) / vh; let e = -Math.PI / 2 - Math.atan2(un, ut); e = Math.atan2(Math.sin(e), Math.cos(e));
      if (Math.abs(e) > Math.PI / 3) {
        // (turned the way that comes out nearest the line, not the shorter way round: headed out and drifting off it, that's the long way)
        const r = vh * vh / (0.9 * ROUND.A), sAt = (g: number) => side + g * r * (-un - 1), sg = Math.abs(sAt(1)) < Math.abs(sAt(-1)) ? 1 : -1, sEnd = sAt(sg);
        const early = Math.sign(sEnd) === Math.sign(side) && Math.abs(sEnd) > 10 && ut * side < 0;
        gd = early ? Vh.clone().normalize() : t.clone().multiplyScalar(-sg * un).addScaledVector(n, sg * ut); // (square across her way, to the side she turns)
      }
    }
    const want = gd.clone().multiplyScalar(vh), dv = want.sub(Vh).multiplyScalar(2);
    const along = dv.dot(Vh) / vh; if (along < 0) dv.addScaledVector(Vh, -along / vh);
    if (dv.length() > ROUND.A) dv.setLength(ROUND.A);
    R.ra = (R.ra || new T.Vector3()).lerp(dv, Math.min(1, dt * 5)); // (eased in and out: a turn begun or ended at once is a kick)
    S.V.addScaledVector(R.ra, dt);
    S.roundBrake = true; // (the throttle's not hers till she's lined up: speeding up between turns, she'd go round in ever wider loops)
    if (vh > ROUND.VMAX) S.V.multiplyScalar(Math.max(ROUND.VMAX, vh - ROUND.BRAKE * dt) / vh); // (too fast to get round: down to a speed she can turn at)
    S.V.y += U.clamp(-(N.y - 1.4) * 0.6 - S.V.y * 1.2, -10, 10) * dt; // (her collar to its height at the hull)
    S.Q.rotateTowards(lookQ(S.V.clone().setY(0).normalize()), ROUND.RATE * Math.PI / 180 * dt * (1 - 0.7 * Math.min(1, S.stick.length()))).normalize(); // (level: nothing she does pushes her up or down off her collar's height)
    // the way drawn: from her collar round the corners to the line, along it in to her plating
    const poly = [N.clone(), ...(R.way.length ? R.way : [goal]), R.face.clone()].map((q, i) => (i ? q.clone().setY(1.4) : q));
    const cum = [0]; for (let i = 1; i < poly.length; i++) cum.push(cum[i - 1] + poly[i].distanceTo(poly[i - 1]));
    const tot = cum[cum.length - 1] || 1, pts: THREE.Vector3[] = [];
    for (let i = 0, j = 1; i <= PLAN_N; i++) { const d = tot * i / PLAN_N; while (j < poly.length - 1 && cum[j] < d) j++; const k = (d - cum[j - 1]) / Math.max(1e-6, cum[j] - cum[j - 1]); pts.push(poly[j - 1].clone().lerp(poly[j], U.clamp(k, 0, 1))); }
    ev({ k: 'route', pts, n: n.clone().negate() });
  }
  // ---- The warp drive. T picks what to warp to (the target); with her nose on it (within a few degrees, and it far enough off to
  // be worth it) the drive spins up by itself, and holds while she's kept on it (she's eased the last of the way on: warpAim).
  // Spun up, T launches her: she's flung at it, faster and faster, and brought down again to come out 300 m short of its hull,
  // going as it goes (tv). Turning off it spins the drive down; picking another target starts it again.
  const WARP_OUT = 300, WARP_ACC = 2500, WARP_BRAKE = 500, WARP_EASE = 1.6;
  /** the target's own velocity, from where it was last frame (the zone's ships go by under way) */
  function tgtTrack(dt: number) {
    const w = S.wps[S.tgt];
    if (!w || w.hide || dt <= 0) { S.tvJ = -1; S.tv.set(0, 0, 0); return; }
    if (S.tvJ === S.tgt) { const v = w.p.clone().sub(S.tvP).divideScalar(dt); if (v.length() < 600) S.tv.lerp(v, Math.min(1, dt * 6)); } // (more than that: it was put somewhere else, not moved)
    else S.tv.set(0, 0, 0);
    S.tvP.copy(w.p); S.tvJ = S.tgt;
  }
  // (how far out from a target's middle its hull reaches: the caller's, from its shapes)
  const tgtR = (w: SpWp) => G.tgtR(w);
  /** the target, if she can warp to it from here: where it is, how far, how square she's on it */
  function warpGate() {
    if (S.docked || S.auto || S.ftl || (S.kind === 'assault' && S.stage === 'atmo')) return null;
    const w = S.wps[S.tgt]; if (!w || w.hide) return null;
    const rel = w.p.clone().sub(S.P), d = rel.length(), stop = WARP_OUT + tgtR(w);
    if (d < stop + 500) return null;
    const dir = rel.divideScalar(d);
    return { w, d, dir, stop, face: fwd(S.Q).dot(dir) };
  }
  const COS3 = Math.cos(3 * Math.PI / 180), COS10 = Math.cos(10 * Math.PI / 180);
  function spinUp(dt: number, helm: boolean) {
    const g = helm ? warpGate() : null;
    if (!g) { S.spin = Math.max(0, S.spin - dt * 2); return; }
    if (g.face > COS10 && S.stick.length() < 0.25) warpAim(g.dir, dt * 1.2); // (near enough on: the drive draws her the rest of the way)
    const T0 = SD.fitted(S.fleet, 'drive') ? 2.5 : 3.5;
    if (g.face > COS3) S.spin = Math.min(1, S.spin + dt / T0);
    else if (g.face < COS10) S.spin = Math.max(0, S.spin - dt);
  }
  function warpAim(dir: THREE.Vector3, k: number) {
    const turn = new T.Quaternion().setFromUnitVectors(fwd(S.Q), dir);
    S.Q.premultiply(new T.Quaternion().slerp(turn, Math.min(1, k))).normalize();
  }
  function warpGo() {
    const g = warpGate(); if (!g || S.spin < 1) return false;
    const top = S.def.cruise * 10 * (SD.fitted(S.fleet, 'drive') ? 1.33 : 1);
    S.warp = { j: S.tgt, u: Math.max(0, S.V.clone().sub(S.tv).dot(g.dir)), t: 0, top };
    S.shake = Math.max(S.shake, 0.5); ev({ k: 'kick', a: 1.2 });
    ev({ k: 'toast', h: 'WARP', b: g.w.name, t: 1.6 });
    return true;
  }
  function warpStep(dt: number) {
    const W = S.warp!, w = S.wps[W.j];
    const end = () => { S.warp = null; S.spin = 0; S.cruise = false; S.V.copy(S.tv); S.Wv.set(0, 0, 0); S.shake = Math.max(S.shake, 0.35); ev({ k: 'pose' }); };
    if (!w || w.hide || W.j !== S.tgt) { end(); return; }
    W.t += dt; S.cruise = true; S.Wv.set(0, 0, 0); S.stick.set(0, 0);
    const rel = w.p.clone().sub(S.P), d = rel.length(), dir = rel.divideScalar(Math.max(1e-3, d)), left = d - (WARP_OUT + tgtR(w));
    // (as fast as it'll go, till it's time to come down again: v^2 = 2as from where she's to stop)
    // (coming out is gentler than going in: a steady WARP_BRAKE, and the last hundred metres or so eased off by distance, so she
    // settles in alongside rather than stopping dead)
    const want = Math.min(W.top, Math.sqrt(2 * WARP_BRAKE * Math.max(0, left)), Math.max(0, left) * WARP_EASE);
    W.u = W.u < want ? Math.min(want, W.u + WARP_ACC * dt) : want;
    const go = Math.min(W.u * dt, Math.max(0, left));
    S.P.addScaledVector(S.tv, dt).addScaledVector(dir, go);
    S.V.copy(S.tv).addScaledVector(dir, W.u);
    warpAim(dir, dt * 6);
    if (left - go < 2) end();
  }
  function collide(dt: number) {
    const R = 5.5, P = S.P; let hit = 0, ground = 0; // (hit: how hard she's struck anything, for the shake; ground: the ground, which is what hurts her)
    if (S.floorAt) { const h = S.floorAt(P.x, P.z); if (P.y < h) { hit = ground = Math.max(hit, -S.V.y); P.y = h; if (S.V.y < 0) S.V.y = 0; S.V.multiplyScalar(Math.exp(-dt * 1.5)); } }
    // (lined up on a stretch of hull she can breach, and close: the way in is clear by that site's own measure)
    const ap = S.kind === 'board' ? aim(20) : null, lined = !!ap && ap.align > 0.5 && Math.abs(ap.dy) < 1.6;
    for (const b of lined ? [] : S.boxes) {
      const qx = U.clamp(P.x, b[0], b[3]), qy = U.clamp(P.y + 1.4, b[1], b[4]), qz = U.clamp(P.z, b[2], b[5]);
      const dx = P.x - qx, dy = P.y + 1.4 - qy, dz = P.z - qz, dd = Math.hypot(dx, dy, dz);
      if (dd >= R) continue;
      const n = dd > 1e-3 ? new T.Vector3(dx / dd, dy / dd, dz / dd) : new T.Vector3(0, 1, 0), vn = S.V.dot(n);
      P.addScaledVector(n, R - dd);
      if (vn < 0) { hit = Math.max(hit, -vn); S.V.addScaledVector(n, -vn * 1.3); }
    }
    // (a rock: thrown off it, and it hurts as the ground does)
    const RK = G.rocks(), RL = G.rockList();
    for (const k of RK.near) {
      const c = RK.p[k], rr = RL[k].r * 0.92 + R, dd = P.distanceTo(c); if (dd >= rr) continue;
      const n = dd > 1e-3 ? P.clone().sub(c).divideScalar(dd) : new T.Vector3(0, 1, 0), vn = S.V.clone().sub(RK.v).dot(n);
      P.addScaledVector(n, rr - dd); if (vn < 0) { hit = Math.max(hit, -vn); ground = Math.max(ground, -vn); S.V.addScaledVector(n, -vn * 1.3); }
    }
    // (a ship's hull does her no harm, however she meets it: she's built to ram. She's thrown off it and shaken, no more)
    if (ground > 12) ev({ k: 'dmg', n: (ground - 12) * 1.2, why: S.floorAt ? 'She hit the ground hard' : 'She hit an asteroid' });
    if (hit > 12) S.shake = Math.min(1, hit / 40);
  }
  // what happens as she flies: the breach, the descent, the way up
  function events() {
    if (S.kind === 'board' && S.map && !G.boom()) {
      // her nose into the hull, within 60 degrees of square and fast enough: she's through, wherever that is along it; the collar
      // pulls her square as it seals (the further off she came in, the longer that takes)
      // (no speed is too high for it: the collar takes it. Fast, she covers metres a frame, so the plate's looked for that much further ahead)
      const lead = S.V.length() * 0.05, a = aim(6 + lead), up = new T.Vector3(0, 1, 0).applyQuaternion(S.Q), cosMax = Math.cos(SD.BREACH_ANG * Math.PI / 180), fh = fwd(S.Q), hl = Math.hypot(fh.x, fh.z) || 1;
      const pitchOk = Math.abs(Math.asin(U.clamp(fh.y, -1, 1))) <= (SD.BREACH_PITCH + 2) * Math.PI / 180; // (her heading's square-ness reckoned level, and her nose no steeper than BREACH_PITCH)
      if (a && a.range < 2.6 + lead && a.align / hl > cosMax - 1e-3 && pitchOk && up.y > 0.8 && a.close > 3.5 * a.align && Math.abs(a.dy + S.V.y / Math.max(a.close, 1) * Math.max(0, a.range)) < 1.6) { // (her collar's height as it'll meet the hull, climbing or diving)
        S.shake = 1;
        // (off square: she stays at the angle she hit at, and drives a crumpled tunnel in at it: js/shipgen.ts tunnel)
        const f = fwd(S.Q), yaw0 = a.site.nz > 0 ? 0 : a.site.nz < 0 ? Math.PI : a.site.nx > 0 ? Math.PI / 2 : -Math.PI / 2, ang = Math.round(U.clamp(U.angDiff(yaw0, Math.atan2(-f.x, -f.z)) * 180 / Math.PI, -SD.BREACH_ANG, SD.BREACH_ANG));
        const was = ((S.map.sp && S.map.sp.cuts) || []).find((q: number[]) => q[0] === a.site.c && q[1] === a.site.nx && q[2] === a.site.nz); // (a hole she made before: she lies in it as it was made)
        // (and nose up or down: she stays tilted as she hit, about her collar)
        const pt = Math.round(U.clamp(Math.asin(U.clamp(f.y, -1, 1)) * 180 / Math.PI, -SD.BREACH_PITCH, SD.BREACH_PITCH));
        const at = was ? was.slice() : ShipGen.cutKey({ ...a.site, ang: Math.abs(ang) >= 3 ? ang : 0, pt: Math.abs(pt) >= 3 ? pt : 0 });
        const b = SD.berthAt(S.def, G.siteAt(at)); S.berth = b; S.Dp.set(b.x, b.y, b.z); S.Dq.copy(berthQ(b)); ev({ k: 'rebase', b }); // (she lies where she's breached: her deck and whoever's aboard with her, the page's)
        auto(S.Dp, S.Dq, 0.35, null, { k: 'breach', at });
        ev({ k: 'kick', a: 2 });
      }
    }
    if (S.kind === 'assault') {
      if (S.stage === 'orbit') { const e = (S.wps as SpWp[]).find((w) => w.id === 'entry'); if (e && S.P.distanceTo(e.p) < 700) ev({ k: 'through', to: 'atmo' }); }
      else if (S.P.y > 1500 && S.V.y > 0) ev({ k: 'through', to: 'orbit' });
    }
  }
  // an eased move to a pose (setting down, lifting off, the last of a breach), then what follows
  function auto(P1: THREE.Vector3, Q1: THREE.Quaternion, Tm: number, mid: THREE.Vector3 | null, then: HelmThen) {
    S.auto = { t: 0, T: Tm, P0: S.P.clone(), Q0: S.Q.clone(), P1: P1.clone(), Q1: Q1.clone(), mid, then }; S.V.set(0, 0, 0); S.Wv.set(0, 0, 0);
  }
  function autoStep(dt: number) {
    const a = S.auto!; a.t += dt;
    const u = Math.min(1, a.t / a.T), e = u * u * (3 - 2 * u);
    if (a.mid) { const k = Math.min(1, u * 2), k2 = Math.max(0, u * 2 - 1), e1 = k * k * (3 - 2 * k), e2 = k2 * k2 * (3 - 2 * k2); S.P.copy(a.P0).lerp(a.mid, e1).lerp(a.P1, e2); S.Q.copy(a.Q0).slerp(a.Q1, e1); }
    else { S.P.copy(a.P0).lerp(a.P1, e); S.Q.copy(a.Q0).slerp(a.Q1, e); }
    if (u >= 1) { S.auto = null; ev({ k: 'auto', then: a.then }); } // (what follows it: the caller's)
  }
  // she's against it (or off it): her flight's part (the page's: her inner door, her solids, who's seen)
  function dock(on: boolean) {
    S.brLock = null; S.brRound = null;
    S.docked = on;
    if (on) { S.P.copy(S.Dp); S.Q.copy(S.Dq); S.V.set(0, 0, 0); }
  }
  // the pilot's: set down (the pad in the hangar, the pad outside a base), and lift off or back away (the caller's: who's aboard,
  // telling the host, docking: js/space.ts land, launch)
  function land() {
    const hover = S.Dp.clone().add(new T.Vector3(0, 9, 0));
    auto(S.Dp, S.Dq, 6, hover, { k: 'land' });
  }
  function launchAway() {
    const away = S.kind === 'board' ? S.Dp.clone().add(new T.Vector3(0, 0, 30).applyQuaternion(S.Dq)) : S.Dp.clone().add(new T.Vector3(0, 12, 0)); // (off a hull: straight back along her tail, whichever way she's against it)
    S.P.copy(S.Dp); S.Q.copy(S.Dq);
    auto(away, S.Dq, S.kind === 'board' ? 2.5 : 3.2, null, { k: 'none' });
  }
  return { fly, aim, squareUp, roundUp, warpGate, warpGo, warpAim, spinUp, collide, events, auto, autoStep, dock, land, launchAway, lookQ, tgtTrack, dbgBr, ROUND };
}
