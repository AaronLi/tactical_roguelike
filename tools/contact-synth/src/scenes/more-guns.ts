/*
 * Three more of the game's guns, each a different mechanism from the AR-15:
 *
 *   KV-47 (an AKM): a stamped 1 mm steel receiver with a loose top cover; a long-stroke piston
 *     bolt carrier (~0.45 kg) on bent-sheet rails, its charging handle on the carrier itself, no
 *     buffer and no hold-open; a steel magazine rocked in on a front lug, caught by a paddle.
 *   MP5: roller-delayed. A stamped steel tube receiver; a ~0.36 kg bolt group whose two rollers
 *     cam out into the trunnion as it closes (the "schick"); a non-reciprocating cocking handle
 *     in its own steel tube over the barrel, sprung back home on its own; curved steel magazines
 *     pushed up into a steel well.
 *   G19 (a Glock 19): a polymer frame with four small steel rails; a steel slide with the barrel
 *     (~0.24 kg) that tilts to unlock (Browning); a stamped slide stop; polymer magazines with a
 *     steel liner that drop free.
 *
 * Built the same way as the AR scenes (firearms.ts): every part a body of its own material and
 * size, rubs for sliding, hits for impacts, snaps for spring-loaded catches, and the action's run
 * timed from its mass and spring: x = F t^2 / 2m.
 */

import type { Scene, SceneElement } from '../scene.js';
import { mat } from '../presets.js';
import { hit, rub, snap, steelBar, steelBlock, springWire, arCase, arFollower, SHEET_RATTLE, type Body } from './firearms.js';

type Fill = 'loaded' | 'empty';
/**
 * Well lubricated: an oil film on the rails averages the metal's texture out (smoother, longer-waved, a wider
 * contact) and quietens the slide; at lock-up the oil squeezed out of the closing faces gives a short wet slap,
 * and it cushions the hard edge of the closing a little. (As the AR's greased carrier, firearms.ts.)
 */
const LUBED = { roughness: 1, grain: 0.8, periodicity: 0, contactWidth: 0.25 };
/** How long the hand takes to pull the action to the rear, and how long it holds it there before letting go, s. */
export interface ChargeTiming { pull?: number; hold?: number }

/*
 * Heard through the shell. The action works inside a closed metal part, so what reaches the ear comes through its
 * walls (they pass the low end and stop the highs) plus a little straight out of its openings. The parts that are
 * the shell itself, or sit outside it (the AK's top cover, the MP5's cocking tube, the Glock's slide on the frame),
 * are heard directly.
 *   KV-47: thin stamped walls, a big open ejection port and magazine well: cuts from ~2.2 kHz, the most leak.
 *   MP5: a closed steel tube with a small port: cuts lower, ~1.8 kHz, little leak.
 *   G19: the slide closes over the barrel and the frame round the rest, its rails inside both: ~2 kHz, the
 *   port barely open.
 */
const AK_SHELL = { cutoff: 2200, leak: 0.18 };
const MP5_SHELL = { cutoff: 1800, leak: 0.12 };
const G19_SHELL = { cutoff: 2000, leak: 0.1 };

/** The parts that are the shell or sit outside it: heard directly, not through the walls. */
const OUTSIDE = /top cover|receiver rings|cocking handle|handle (stops|hits|spring)|thumb presses/; // (a Glock's slide runs on rails inside it and the frame: those are heard through it)
function outsideShell(els: SceneElement[]): void { for (const e of els) if (OUTSIDE.test(e.what)) e.outside = true; }

/** Hand pull from rest over `d` m in `T` s (a smooth yank): the time at which it has gone `x`. */
function pullAt(x: number, d: number, T: number): number {
  const u = Math.min(1, Math.max(0, x / d));
  // x/d = 3s^2 - 2s^3: solve for s by bisection
  let lo = 0, hi = 1;
  for (let i = 0; i < 30; i++) { const s = (lo + hi) / 2; if (3 * s * s - 2 * s * s * s < u) lo = s; else hi = s; }
  return ((lo + hi) / 2) * T;
}
/** A spring-driven run home from rest over `d` m: the time at which it has gone `x`, and its speed there. */
function runAt(x: number, m: number, F: number): { t: number; v: number } {
  const t = Math.sqrt((2 * Math.max(0, x) * m) / F);
  return { t, v: (F / m) * t };
}

// ====================================================================================================
// KV-47 (AKM)
// ====================================================================================================
// Stamped 1 mm steel, riveted: rings brighter and longer than a billet aluminium receiver, and the top
// cover (0.8 mm sheet, held only by the recoil spring guide's tab) buzzes on every blow.
const akReceiver: Body = { ...mat('steel'), shape: 'plate', size: 26, thickness: 1, modes: 3, irregularity: 0.8, damping: 0.4, level: 0 };
const akCover: Body = { ...mat('steel'), shape: 'plate', size: 24, thickness: 0.8, modes: 2, irregularity: 0.9, damping: 0.35, level: 0 };
// (as it lands, held home by its spring and wedged by the turning bolt: no free ring at its ~770 Hz bar pitch)
const akCarrier: Body = { ...mat('steel'), shape: 'bar', size: 33, thickness: 16, modes: 1, irregularity: 0.7, damping: 0.7, level: 0 }; // carrier with its piston
const akCarrierSliding: Body = { ...akCarrier, modes: 0, damping: 0.8 };
const akBolt: Body = { ...mat('steel'), shape: 'bar', size: 6.5, thickness: 14, modes: 1, irregularity: 0.5, damping: 0.55, level: 0 };
const akTrunnion = steelBlock(6, 30);
const akRearTrunnion = steelBlock(5, 25);
// Springs on guide rods: the rod damps their coils, so no free pitch of their own (rubs on them rang on).
const onRod = (b: Body): Body => ({ ...b, modes: 0, damping: 0.75 });
const akSpring = onRod(springWire(22, 1.4));
const akHammer = steelBar(5, 8);
const akRound: Body = { ...arCase, size: 5.6, thickness: 7 };
const akMag = (f: Fill): Body => ({ ...mat('steel'), shape: 'plate', size: 22, thickness: 1, modes: f === 'empty' ? 4 : 2, irregularity: 0.8, damping: f === 'empty' ? 0.35 : 0.65, level: 0 });
const akMagLug = steelBlock(1.5, 4);
const akPaddle = steelBar(5, 3);
const AK_HOUSING: Scene['housing'] = { amount: 0.7, cavity: 0.6, ...mat('steel'), shape: 'shell', size: 26, thickness: 1, modes: 0, irregularity: 0.8, damping: 0.45, cavities: [{ length: 24, width: 4.2, depth: 3.6, q: 10, level: 1 }] };
const AK_COVER_RATTLE = { flex: { amount: 0.5, freq: 120, decay: 0.06, rattle: 0.75, wobble: 0, tone: 0 } };
const AK_STROKE = 0.1, AK_M = 0.45, AK_F = 40; // carrier travel, mass, mean spring force

/** The AK charged: the handle on the carrier yanked to the rear and let go; it chambers a round from a loaded magazine (or not). */
function makeAkCharge(fill: Fill | 'none', timing: ChargeTiming = {}): Scene {
  const T = timing.pull ?? 0.17, back = (x: number) => pullAt(x, AK_STROKE, T);
  const LET_GO = T + (timing.hold ?? 0.06);
  const fwd = (xFromRear: number) => LET_GO + runAt(xFromRear, AK_M, AK_F).t;
  const vHome = runAt(AK_STROKE, AK_M, AK_F).v; // ~4.2 m/s
  const TL = fwd(AK_STROKE); // carrier reaches the bolt locking
  const els: SceneElement[] = [
    // pulling: the bolt turns out of the trunnion, the carrier runs back on its bent-sheet rails
    rub('carrier starts back, bolt cam turns', back(0.001), -8, { force: 10, duration: 0.012, speed: 0.6, profile: 'accelerate', roughness: 8, grain: 0.3, contactWidth: 0.05 }, akBolt, akCarrierSliding),
    snap('bolt lugs turn free of the trunnion', back(0.006), -9, { strength: 0.6, preload: 0, seat: 0.2, seatDelay: 1 }, akBolt, akTrunnion),
    rub('carrier on the receiver rails', back(0.004), -9, { force: 6, duration: T - back(0.004), speed: 1.1, profile: 'swell', roughness: 12, grain: 0.6, periodicity: 0, contactWidth: 0.08 }, akCarrierSliding, akReceiver, AK_COVER_RATTLE),
    rub('recoil spring compresses on its guide', back(0.01), -15, { force: 5, duration: T - back(0.01), speed: 1, profile: 'swell', roughness: 4, grain: 0.3, contactWidth: 0.05 }, akSpring, akReceiver, { coil: { level: 0.35, length: 14, dispersion: 0.5, decay: 0.12, brightness: 3500 } }),
    hit('carrier meets the hammer', back(0.025), -12, 0.9, akCarrier, akHammer, { radius: 2, click: 0.6, sharp: 0.8 }),
    rub('carrier pushes the hammer down', back(0.026), -15, { force: 8, duration: back(0.07) - back(0.026), speed: 0.9, profile: 'steady', roughness: 3, grain: 0.2, contactWidth: 0.05 }, akCarrierSliding, akHammer),
    snap('hammer cocks onto the trigger hook', back(0.072), -8, { strength: 0.7, preload: 0, seat: 0.3, seatDelay: 2 }, akHammer, steelBar(3, 5)),
    // going back, the bolt's underside rides over the top round (pressed up against it by the magazine spring)
    // until its face clears the rim, ~75 mm back (a 56 mm cartridge); then the round pops up into the lips
    ...(fill === 'loaded' ? [
      rub('bolt rides over the top round', back(0.004), -14, { force: 5, duration: back(0.075) - back(0.004), speed: 0.9, profile: 'swell', roughness: 3, grain: 0.2, contactWidth: 0.05 }, akBolt, akRound),
      hit('top round pops up into the feed lips', back(0.076), -10, 1.0, akRound, akMag('loaded'), { radius: 2, click: 0.6, sharp: 0.7 }),
    ] : fill === 'empty' ? [
      rub('bolt rides over the empty follower', back(0.004), -16, { force: 4, duration: back(0.075) - back(0.004), speed: 0.9, profile: 'swell', roughness: 3, grain: 0.3, contactWidth: 0.08 }, akBolt, arFollower),
    ] : []),
    hit('carrier slams into the rear trunnion', T, -2, 1.6, akCarrier, akRearTrunnion, { radius: 4, click: 0.8, sharp: 0.85 }, AK_COVER_RATTLE),
    hit('receiver rings', T + 0.0005, -10, 0.9, akReceiver, akCarrier, { radius: 6, click: 0.2, sharp: 0.7 }),
    // let go: the spring drives it home with nothing to slow it but the round it strips
    rub('carrier flies home on the rails', LET_GO, -7, { force: 6, duration: TL - LET_GO, speed: vHome, profile: 'accelerate', roughness: 12, grain: 0.6, periodicity: 0, contactWidth: 0.08 }, akCarrierSliding, akReceiver, AK_COVER_RATTLE),
    rub('recoil spring extends', LET_GO + 0.001, -14, { force: 4, duration: TL - LET_GO, speed: vHome, profile: 'accelerate', roughness: 4, grain: 0.3, contactWidth: 0.05 }, akSpring, akReceiver, { coil: { level: 0.4, length: 14, dispersion: 0.5, decay: 0.15, brightness: 3500 } }),
    rub('carrier runs over the cocked hammer', fwd(0.03), -15, { force: 6, duration: fwd(0.08) - fwd(0.03), speed: vHome * 0.8, profile: 'steady', roughness: 3, grain: 0.2, contactWidth: 0.05 }, akCarrierSliding, akHammer),
  ];
  if (fill === 'loaded') {
    const strip = fwd(0.035);
    els.push(
      hit('bolt face strips the top round', strip, -4, vHome * 0.6, akBolt, akRound, { radius: 2, click: 0.6, sharp: 0.7 }),
      rub('round dragged out of the feed lips', strip + 0.0005, -10, { force: 6, duration: 0.006, speed: vHome * 0.7, profile: 'steady', roughness: 6, grain: 0.3, contactWidth: 0.05 }, akRound, akMag('loaded')),
      hit('next round snaps up into the lips', strip + 0.007, -10, 1.2, akRound, akMag('loaded'), { radius: 2, click: 0.6, sharp: 0.7 }),
      hit('bullet nose glances off the feed ramp', strip + 0.006, -12, 1.5, akRound, akTrunnion, { radius: 1.5, click: 0.6, sharp: 0.8 }),
      rub('round slides into the chamber', strip + 0.008, -10, { force: 4, duration: TL - strip - 0.012, speed: vHome * 0.8, profile: 'steady', roughness: 4, grain: 0.2, contactWidth: 0.05 }, akRound, steelBar(10, 12)),
      hit('case seats in the chamber', TL - 0.003, -6, vHome * 0.6, akRound, steelBar(10, 12), { radius: 3, click: 0.7, sharp: 0.7 }),
      snap('extractor snaps over the rim', TL - 0.002, -8, { strength: 0.7, preload: 0, seat: 0.3, seatDelay: 1 }, steelBar(2, 3), akRound),
    );
  }
  els.push(
    hit('bolt face meets the barrel', TL, -3, vHome, akBolt, akTrunnion, { radius: 4, click: 0.85, sharp: 0.85 }),
    rub('bolt turns into the trunnion', TL + 0.0003, -8, { force: 15, duration: 0.004, speed: 1.2, profile: 'steady', roughness: 8, grain: 0.1, periodicity: 0.2, contactWidth: 0.02 }, akBolt, akTrunnion),
    hit('carrier slams home', TL + 0.0045, 0, vHome * 0.85, akCarrier, akTrunnion, { radius: 6, click: 0.9, sharp: 0.85 }, AK_COVER_RATTLE),
    hit('top cover clatters', TL + 0.005, -7, 1.5, akCover, akReceiver, { scatter: 0.5, radius: 3, click: 0.7, sharp: 0.8 }, SHEET_RATTLE),
    hit('receiver rings', TL + 0.005, -6, 1.2, akReceiver, akTrunnion, { radius: 6, click: 0.2, sharp: 0.7 }),
  );
  if (fill !== 'none') els.push(hit('magazine body rings', TL + 0.006, fill === 'empty' ? -10 : -14, 0.8, akMag(fill === 'empty' ? 'empty' : 'loaded'), akReceiver, { radius: 3, click: 0.2, sharp: 0.6 }));
  outsideShell(els);
  const pull = (e: SceneElement) => e.at < LET_GO - 0.001;
  return {
    id: 'kv47-charge' + (fill === 'loaded' ? '' : fill === 'empty' ? '-empty-mag' : '-no-mag') + (timing.pull ? '-timed' : ''),
    title: `KV-47 (AKM): charging handle racked and let go${fill === 'loaded' ? ', chambering a round' : fill === 'empty' ? ' (empty magazine)' : ' (no magazine)'}`,
    room: 0.04, roomSize: 0.35, housing: AK_HOUSING, enclosure: AK_SHELL,
    tracks: [
      { name: 'pull-back', description: 'Handle yanked back: the bolt turns out, the carrier runs back, the hammer cocks, the carrier hits the rear trunnion.', elements: els.filter(pull) },
      { name: 'release-forward', description: 'Let go: the spring drives the carrier home, stripping and chambering a round, and the bolt turns in.', elements: els.filter((e) => !pull(e)) },
    ],
  };
}

/** The AK magazine rocked out: the paddle pushed forward, the magazine rocked forward off its rear lug and unhooked. */
function makeAkMagOut(fill: Fill): Scene {
  const m = akMag(fill), v = fill === 'loaded' ? 1 : 0.8;
  const els: SceneElement[] = [
    snap('thumb pushes the paddle forward', 0, -12, { strength: 0.4, preload: 50, creak: 0.1, seat: 0, seatDelay: 1 }, akPaddle, akReceiver),
    rub('rear lug slides off the catch', 0.052, -10, { force: 6, duration: 0.012, speed: 0.3, profile: 'steady', roughness: 6, grain: 0.3, contactWidth: 0.04 }, akMagLug, akPaddle),
    rub('magazine rocks forward on its front lug', 0.06, -12, { force: 4, duration: 0.07, speed: 0.4, profile: 'swell', roughness: 8, grain: 0.4, contactWidth: 0.05 }, akMagLug, akTrunnion),
    hit('front lug unhooks from the trunnion', 0.13, -6, 0.8 * v, akMagLug, akTrunnion, { radius: 1.5, click: 0.8, sharp: 0.9 }, AK_COVER_RATTLE),
    hit('magazine body rings', 0.1305, fill === 'empty' ? -8 : -15, 0.6, m, akTrunnion, { radius: 3, click: 0.1, sharp: 0.6 }),
    rub('magazine pulled down clear', 0.135, -16, { force: 2, duration: 0.05, speed: 0.6, profile: 'decelerate', roughness: 8, grain: 0.4, contactWidth: 0.05 }, m, akReceiver),
  ];
  if (fill === 'empty') els.push(hit('follower rattles in the empty magazine', 0.14, -14, 0.4, arFollower, m, { radius: 1.5, click: 0.6, sharp: 0.6 }), hit('follower rattles in the empty magazine', 0.151, -18, 0.25, arFollower, m, { radius: 1.5, click: 0.6, sharp: 0.6 }));
  else els.push(hit('rounds shift in the magazine', 0.1306, -16, 0.5, akRound, akRound, { radius: 2, click: 0.5, sharp: 0.6 }));
  return {
    id: 'kv47-mag-out' + (fill === 'empty' ? '-empty' : ''), title: `KV-47 (AKM): ${fill} magazine rocked out`,
    room: 0.04, roomSize: 0.35, housing: AK_HOUSING,
    tracks: [{ name: 'mag-out', description: 'Paddle pushed, the magazine rocked forward, unhooked and pulled clear.', elements: els }],
  };
}

/** The AK magazine rocked in: the front lug hooked into the trunnion, rocked back until the paddle snaps over the rear lug. */
function makeAkMagIn(fill: Fill): Scene {
  const m = akMag(fill), v = fill === 'loaded' ? 1 : 0.8;
  const els: SceneElement[] = [
    hit('front lug hooks into the trunnion', 0, -4, 1.0 * v, akMagLug, akTrunnion, { radius: 1.5, click: 0.8, sharp: 0.9 }, AK_COVER_RATTLE),
    hit('magazine body rings', 0.0005, fill === 'empty' ? -9 : -16, 0.6, m, akTrunnion, { radius: 3, click: 0.1, sharp: 0.6 }),
    rub('magazine rocks back on its front lug', 0.01, -12, { force: 5, duration: 0.09, speed: 0.4, profile: 'accelerate', roughness: 8, grain: 0.4, contactWidth: 0.05 }, akMagLug, akTrunnion),
    rub('rear lug pushes the paddle aside', 0.075, -11, { force: 8, duration: 0.025, speed: 0.4, profile: 'accelerate', roughness: 4, grain: 0.2, contactWidth: 0.03 }, akMagLug, akPaddle),
    // the classic sound: the paddle's spring snaps it over the rear lug, steel on steel
    snap('paddle snaps over the rear lug', 0.1, -1, { strength: 0.85, preload: 0, seat: 0.4, seatDelay: 2 }, akPaddle, akMagLug, { coil: { level: 0.15, length: 2, dispersion: 0.3, decay: 0.03, brightness: 6000 }, ...AK_COVER_RATTLE }),
    hit('magazine seats against the receiver', 0.102, -9, 0.6 * v, m, akReceiver, { radius: 4, click: 0.6, sharp: 0.7 }),
  ];
  if (fill === 'loaded') els.push(hit('top round presses up against the bolt', 0.101, -15, 0.4, akRound, akBolt, { radius: 2, click: 0.5, sharp: 0.6 }));
  return {
    id: 'kv47-mag-in' + (fill === 'empty' ? '-empty' : ''), title: `KV-47 (AKM): ${fill} magazine rocked in`,
    room: 0.04, roomSize: 0.35, housing: AK_HOUSING,
    tracks: [{ name: 'mag-in', description: 'Front lug hooked, rocked back, the paddle snaps over the rear lug.', elements: els }],
  };
}

// ====================================================================================================
// MP5
// ====================================================================================================
const mp5Receiver: Body = { ...mat('steel'), shape: 'plate', size: 30, thickness: 1.2, modes: 3, irregularity: 0.7, damping: 0.45, level: 0 };
// (locked into the trunnion by its rollers as it lands: no free ring at its ~5.5 kHz bar pitch)
const mp5Bolt: Body = { ...mat('steel'), shape: 'bar', size: 13, thickness: 18, modes: 1, irregularity: 0.6, damping: 0.72, level: 0 };
const mp5BoltSliding: Body = { ...mp5Bolt, modes: 0, damping: 0.8 };
const mp5Roller = steelBar(1.3, 6, 0.5);
const mp5Trunnion = steelBlock(5, 25);
const mp5Tube: Body = { ...mat('steel'), shape: 'bar', size: 22, thickness: 6, modes: 2, irregularity: 0.5, damping: 0.45, level: 0 }; // the cocking tube
const mp5Handle = steelBar(4, 6);
const mp5HandleSpring = springWire(15, 0.9);
const mp5Spring = onRod(springWire(20, 1.3));
const mp5Mag = (f: Fill): Body => ({ ...mat('steel'), shape: 'plate', size: 19, thickness: 0.8, modes: f === 'empty' ? 4 : 2, irregularity: 0.7, damping: f === 'empty' ? 0.35 : 0.65, level: 0 });
const mp5MagCatch = steelBar(2, 4);
const mp5Round: Body = { ...arCase, size: 2.9, thickness: 9 }; // 9 mm
const MP5_HOUSING: Scene['housing'] = { amount: 0.7, cavity: 0.7, cavityWidth: 3.2, ...mat('steel'), shape: 'shell', size: 30, thickness: 1.2, modes: 0, irregularity: 0.7, damping: 0.5 };
const TUBE_AIR = { housing: { amount: 0.6, cavity: 0.8, cavityWidth: 1.6, ...mat('steel'), shape: 'shell' as const, size: 22, thickness: 1, modes: 0, irregularity: 0.5, damping: 0.45 } };
const MP5_STROKE = 0.075, MP5_M = 0.36, MP5_F = 45;

/** The MP5 charged: the cocking handle pulled back in its tube and let go; the bolt runs home and the rollers cam out. */
function makeMp5Charge(fill: Fill | 'none', timing: ChargeTiming = {}): Scene {
  const T = timing.pull ?? 0.15, back = (x: number) => pullAt(x, MP5_STROKE, T);
  const LET_GO = T + (timing.hold ?? 0.06);
  const fwd = (x: number) => LET_GO + runAt(x, MP5_M, MP5_F).t;
  const vHome = runAt(MP5_STROKE, MP5_M, MP5_F).v;
  const TL = fwd(MP5_STROKE);
  const els: SceneElement[] = [
    rub('cocking handle slides back in its tube', back(0.001), -11, { force: 4, duration: T - back(0.001), speed: 0.9, profile: 'swell', ...LUBED }, mp5Handle, mp5Tube, TUBE_AIR),
    rub('handle spring compresses in the tube', back(0.003), -16, { force: 3, duration: T - back(0.003), speed: 0.9, profile: 'swell', roughness: 3, grain: 0.3, contactWidth: 0.05 }, mp5HandleSpring, mp5Tube, { coil: { level: 0.3, length: 9, dispersion: 0.55, decay: 0.1, brightness: 4500 }, ...TUBE_AIR }),
    // the rollers pushed back out of the trunnion's recesses: the bolt unlocks with a short double tick
    snap('rollers cam in out of the trunnion', back(0.004), -8, { strength: 0.6, preload: 0, seat: 0.5, seatDelay: 1.2 }, mp5Roller, mp5Trunnion),
    rub('bolt runs back in the receiver', back(0.005), -12, { force: 5, duration: T - back(0.005), speed: 1, profile: 'swell', ...LUBED }, mp5BoltSliding, mp5Receiver),
    rub('recoil spring compresses', back(0.008), -15, { force: 5, duration: T - back(0.008), speed: 1, profile: 'swell', roughness: 4, grain: 0.3, contactWidth: 0.05 }, mp5Spring, mp5Receiver, { coil: { level: 0.3, length: 12, dispersion: 0.5, decay: 0.12, brightness: 3500 } }),
    snap('hammer cocks', back(0.05), -11, { strength: 0.6, preload: 0, seat: 0.3, seatDelay: 2 }, steelBar(4, 7), steelBar(3, 5)),
    // the bolt rides over the top round until its face clears the rim, ~42 mm back (a 29 mm 9 mm cartridge)
    ...(fill === 'loaded' ? [
      rub('bolt rides over the top round', back(0.003), -14, { force: 4, duration: back(0.042) - back(0.003), speed: 0.8, profile: 'swell', roughness: 3, grain: 0.2, contactWidth: 0.05 }, mp5BoltSliding, mp5Round),
      hit('top round pops up into the feed lips', back(0.043), -11, 0.9, mp5Round, mp5Mag('loaded'), { radius: 1.5, click: 0.6, sharp: 0.7 }),
    ] : fill === 'empty' ? [
      rub('bolt rides over the empty follower', back(0.003), -16, { force: 3, duration: back(0.042) - back(0.003), speed: 0.8, profile: 'swell', roughness: 3, grain: 0.3, contactWidth: 0.08 }, mp5BoltSliding, arFollower),
    ] : []),
    hit('handle stops at the end of its slot', T, -4, 1.3, mp5Handle, mp5Tube, { radius: 2, click: 0.8, sharp: 0.85 }, TUBE_AIR),
    // let go: the bolt flies home; the handle, not tied to it, is sent home by its own spring in the tube
    rub('bolt flies home', LET_GO, -10, { force: 5, duration: TL - LET_GO, speed: vHome, profile: 'accelerate', ...LUBED }, mp5BoltSliding, mp5Receiver),
    rub('cocking handle snaps home in its tube', LET_GO + 0.002, -12, { force: 3, duration: 0.03, speed: 2.5, profile: 'accelerate', ...LUBED }, mp5Handle, mp5Tube, TUBE_AIR),
    hit('handle hits the front of its slot', LET_GO + 0.032, -7, 1.6, mp5Handle, mp5Tube, { radius: 2, click: 0.8, sharp: 0.85 }, { coil: { level: 0.35, length: 9, dispersion: 0.55, decay: 0.12, brightness: 5000 }, ...TUBE_AIR }),
  ];
  if (fill === 'loaded') {
    const strip = fwd(0.03);
    els.push(
      hit('bolt face strips the top round', strip, -5, vHome * 0.6, mp5Bolt, mp5Round, { radius: 1.5, click: 0.6, sharp: 0.7 }),
      rub('round dragged out of the feed lips', strip + 0.0004, -11, { force: 5, duration: 0.004, speed: vHome * 0.7, profile: 'steady', roughness: 6, grain: 0.3, contactWidth: 0.05 }, mp5Round, mp5Mag('loaded')),
      hit('bullet nose glances off the feed ramp', strip + 0.004, -13, 1.3, mp5Round, mp5Trunnion, { radius: 1.5, click: 0.6, sharp: 0.8 }),
      hit('next round snaps up into the lips', strip + 0.006, -12, 1.0, mp5Round, mp5Mag('loaded'), { radius: 1.5, click: 0.6, sharp: 0.7 }),
      rub('round slides into the chamber', strip + 0.005, -11, { force: 3, duration: TL - strip - 0.007, speed: vHome * 0.8, profile: 'steady', roughness: 4, grain: 0.2, contactWidth: 0.05 }, mp5Round, steelBar(8, 10)),
      hit('case seats in the chamber', TL - 0.002, -8, vHome * 0.5, mp5Round, steelBar(8, 10), { radius: 2.5, click: 0.7, sharp: 0.7 }),
      snap('extractor snaps over the rim', TL - 0.001, -9, { strength: 0.7, preload: 0, seat: 0.3, seatDelay: 1 }, steelBar(2, 3), mp5Round),
    );
  }
  els.push(
    hit('bolt head meets the barrel', TL, -3, vHome, mp5Bolt, mp5Trunnion, { radius: 4, click: 0.85, sharp: 0.72 }),
    { what: 'oil squeezed out as the bolt closes', at: TL, gainDb: -12, sound: { kind: 'air', freq: 1500, q: 0.8, attackMs: 0.15, decayMs: 3 } },
    { what: 'oil squeezed from the roller recesses', at: TL + 0.0032, gainDb: -15, sound: { kind: 'air', freq: 1900, q: 0.9, attackMs: 0.15, decayMs: 2.5 } },
    // the MP5's signature: the carrier drives the locking piece in and the rollers snap out into the trunnion
    snap('rollers snap out into the trunnion', TL + 0.0015, 3, { strength: 0.9, preload: 0, seat: 0.6, seatDelay: 0.8 }, mp5Roller, mp5Trunnion),
    hit('bolt carrier lands', TL + 0.003, -2, vHome * 0.7, mp5Bolt, mp5Trunnion, { radius: 5, click: 0.85, sharp: 0.8 }),
    hit('receiver rings', TL + 0.003, -9, 1.0, mp5Receiver, mp5Trunnion, { radius: 6, click: 0.2, sharp: 0.7 }),
  );
  if (fill !== 'none') els.push(hit('magazine body rings', TL + 0.004, fill === 'empty' ? -11 : -16, 0.7, mp5Mag(fill === 'empty' ? 'empty' : 'loaded'), mp5Receiver, { radius: 3, click: 0.2, sharp: 0.6 }));
  outsideShell(els);
  const pull = (e: SceneElement) => e.at < LET_GO - 0.001;
  return {
    id: 'mp5-charge' + (fill === 'loaded' ? '' : fill === 'empty' ? '-empty-mag' : '-no-mag') + (timing.pull ? '-timed' : ''),
    title: `MP5: cocking handle pulled back and let go${fill === 'loaded' ? ', chambering a round' : fill === 'empty' ? ' (empty magazine)' : ' (no magazine)'}`,
    room: 0.04, roomSize: 0.35, housing: MP5_HOUSING, enclosure: MP5_SHELL,
    tracks: [
      { name: 'pull-back', description: 'Handle back in its tube: the rollers cam in, the bolt runs back, the hammer cocks.', elements: els.filter(pull) },
      { name: 'release-forward', description: 'Let go: the bolt runs home and its rollers snap out into the trunnion; the handle springs home in its tube.', elements: els.filter((e) => !pull(e)) },
    ],
  };
}

/** The MP5's curved steel magazine pulled out (paddle pressed) or pushed up until the catch clicks. */
function makeMp5Mag(dir: 'in' | 'out', fill: Fill): Scene {
  const m = mp5Mag(fill), v = fill === 'loaded' ? 1 : 0.8;
  const els: SceneElement[] = dir === 'out' ? [
    snap('paddle pressed', 0, -12, { strength: 0.4, preload: 40, creak: 0.1, seat: 0.1, seatDelay: 1 }, steelBar(4, 3), mp5Receiver),
    snap('catch lets go of the magazine', 0.042, -9, { strength: 0.5, preload: 0, seat: 0, seatDelay: 1 }, mp5MagCatch, m),
    rub('magazine pulled down out of the well', 0.045, -11, { force: 3, duration: 0.06, speed: 1.2, profile: 'accelerate', roughness: 4, grain: 1.2, contactWidth: 0.12 }, m, mp5Receiver),
    hit('magazine body rings', 0.046, fill === 'empty' ? -9 : -15, 0.6, m, mp5Receiver, { radius: 3, click: 0.1, sharp: 0.6 }),
  ] : [
    rub('magazine pushed up the well', 0, -11, { force: 3, duration: 0.07, speed: 0.9, profile: 'accelerate', roughness: 4, grain: 1.2, contactWidth: 0.12 }, m, mp5Receiver),
    rub('catch rides the magazine back', 0.05, -14, { force: 5, duration: 0.02, speed: 0.8, profile: 'accelerate', roughness: 3, grain: 0.3, contactWidth: 0.03 }, mp5MagCatch, m),
    snap('catch clicks into the magazine', 0.07, 0, { strength: 0.8, preload: 0, seat: 0, seatDelay: 1 }, mp5MagCatch, m, { coil: { level: 0.12, length: 1.5, dispersion: 0.3, decay: 0.025, brightness: 7000 } }),
    hit('magazine stops against the receiver', 0.076, -9, 0.9 * v, m, mp5Receiver, { radius: 3, click: 0.7, sharp: 0.7 }),
    hit('magazine body rings', 0.0765, fill === 'empty' ? -9 : -16, 0.6, m, mp5Receiver, { radius: 3, click: 0.1, sharp: 0.6 }),
  ];
  if (fill === 'empty') els.push(hit('follower rattles', dir === 'out' ? 0.06 : 0.08, -16, 0.3, arFollower, m, { radius: 1.5, click: 0.6, sharp: 0.6 }));
  return {
    id: `mp5-mag-${dir}` + (fill === 'empty' ? '-empty' : ''), title: `MP5: ${fill} magazine ${dir === 'out' ? 'pulled out' : 'pushed in'}`,
    room: 0.04, roomSize: 0.35, housing: MP5_HOUSING,
    tracks: [{ name: `mag-${dir}`, description: dir === 'out' ? 'Paddle pressed, the magazine pulled down out of the well.' : 'Pushed up the well until the catch clicks into it.', elements: els }],
  };
}

// ====================================================================================================
// G19 (Glock 19)
// ====================================================================================================
// (home, the spring holds it on the frame and the barrel wedges it: no free ring at its ~2.5 kHz bar pitch)
const g19Slide: Body = { ...mat('steel'), shape: 'bar', size: 17, thickness: 14, modes: 0, irregularity: 0.6, damping: 0.78, level: 0 };
const g19SlideSliding: Body = { ...g19Slide, modes: 0, damping: 0.8 };
const g19Barrel = steelBar(10, 12, 0.55);
// The frame: a resilient polymer that flexes in the hand, not a hard, glassy plastic. Softer than plain nylon in
// the way it meets things (a blunt contact, no edge crack) and far lossier (it deadens a knock at once), and the
// hollow of the grip, open at the bottom and filled by the magazine, barely sounds as a box.
const GLOCK_POLYMER = { ...mat('nylon'), material: 'custom', stiffness: 1.6, loss: 0.09 };
const g19Frame: Body = { ...GLOCK_POLYMER, shape: 'shell', size: 16, thickness: 3, modes: 0, irregularity: 0.7, damping: 0.82, level: 0 };
const g19Rail = steelBar(1.5, 3, 0.6);
const g19LockBlock = steelBlock(2, 8);
const g19Spring = onRod(springWire(8, 1));
const g19SlideStop = steelBar(3, 1.5, 0.5);
const g19Mag = (f: Fill): Body => ({ ...mat('nylon'), shape: 'shell', size: 12, thickness: 2, modes: 0, irregularity: 0.6, damping: f === 'empty' ? 0.45 : 0.7, level: 0 }); // polymer over a steel liner
const g19MagLiner = (f: Fill): Body => ({ ...mat('steel'), shape: 'plate', size: 11, thickness: 0.4, modes: f === 'empty' ? 3 : 1, irregularity: 0.7, damping: f === 'empty' ? 0.45 : 0.7, level: 0 });
const g19MagCatch: Body = { ...mat('nylon'), shape: 'block', size: 1.5, thickness: 5, modes: 0, irregularity: 0.5, damping: 0.5, level: 0 };
const g19Round: Body = { ...arCase, size: 2.9, thickness: 9 };
const G19_HOUSING: Scene['housing'] = { amount: 0.45, cavity: 0.2, ...GLOCK_POLYMER, shape: 'shell', size: 16, thickness: 3, modes: 0, irregularity: 0.7, damping: 0.82, cavities: [{ length: 10, width: 2.4, depth: 3, q: 4, level: 1 }] };
const G19_STROKE = 0.032, G19_M = 0.24, G19_F = 55;

/** The slide run home on its spring from the rear, chambering (or not), and locking up. */
function g19Forward(t0: number, chamber: boolean): SceneElement[] {
  const fwd = (x: number) => t0 + runAt(x, G19_M, G19_F).t;
  const vHome = runAt(G19_STROKE, G19_M, G19_F).v; // ~3.8 m/s
  const TL = fwd(G19_STROKE);
  const els: SceneElement[] = [
    rub('slide runs home on its rails', t0, -11, { force: 6, duration: TL - t0, speed: vHome, profile: 'accelerate', ...LUBED }, g19SlideSliding, g19Rail),
    rub('recoil spring extends', t0 + 0.0005, -16, { force: 3, duration: TL - t0, speed: vHome, profile: 'accelerate', roughness: 3, grain: 0.3, contactWidth: 0.05 }, g19Spring, g19Frame, { coil: { level: 0.3, length: 5, dispersion: 0.5, decay: 0.08, brightness: 5000 } }),
  ];
  if (chamber) {
    const strip = fwd(0.012);
    els.push(
      hit('breech face strips the top round', strip, -5, vHome * 0.6, g19Slide, g19Round, { radius: 1.5, click: 0.6, sharp: 0.7 }),
      rub('round dragged out of the feed lips', strip + 0.0003, -12, { force: 4, duration: 0.003, speed: vHome * 0.7, profile: 'steady', roughness: 6, grain: 0.3, contactWidth: 0.05 }, g19Round, g19MagLiner('loaded')),
      hit('bullet glances up the feed ramp', strip + 0.003, -11, 1.4, g19Round, g19Barrel, { radius: 1.5, click: 0.6, sharp: 0.8 }),
      hit('next round snaps up into the lips', strip + 0.004, -14, 0.8, g19Round, g19MagLiner('loaded'), { radius: 1.5, click: 0.5, sharp: 0.6 }),
      rub('round slides into the chamber', strip + 0.0035, -12, { force: 3, duration: Math.max(0.003, TL - strip - 0.0055), speed: vHome * 0.8, profile: 'steady', roughness: 4, grain: 0.2, contactWidth: 0.05 }, g19Round, g19Barrel),
      hit('case seats in the chamber', TL - 0.0015, -9, vHome * 0.5, g19Round, g19Barrel, { radius: 2.5, click: 0.7, sharp: 0.7 }),
    );
  }
  els.push(
    // the barrel's lug rides up the locking block and its hood locks into the ejection port
    rub('barrel cams up onto the locking block', TL - 0.003, -9, { force: 12, duration: 0.003, speed: 1.2, profile: 'steady', roughness: 6, grain: 0.1, contactWidth: 0.02 }, g19Barrel, g19LockBlock),
    hit('barrel hood locks into the slide', TL, -2, vHome * 0.8, g19Barrel, g19Slide, { radius: 3, click: 0.85, sharp: 0.72 }),
    { what: 'oil squeezed out as the slide locks up', at: TL, gainDb: -9, sound: { kind: 'air', freq: 1600, q: 0.8, attackMs: 0.15, decayMs: 2.8 } },
    hit('slide slams home', TL + 0.0005, 0, vHome, g19Slide, g19Rail, { radius: 4, click: 0.85, sharp: 0.72 }),
    hit('frame takes the blow', TL + 0.001, -8, 1.2, g19Frame, g19Rail, { radius: 8, click: 0.15, sharp: 0.2 }),
  );
  if (chamber) els.push(snap('extractor snaps over the rim', TL - 0.001, -10, { strength: 0.6, preload: 0, seat: 0.3, seatDelay: 1 }, steelBar(2, 3), g19Round));
  return els;
}

/** The Glock racked: the slide pulled back overhand and let go, chambering a round (or not). */
function makeG19Rack(fill: Fill | 'none', timing: ChargeTiming = {}): Scene {
  const T = timing.pull ?? 0.11, back = (x: number) => pullAt(x, G19_STROKE, T), LET_GO = T + (timing.hold ?? 0.045);
  const els: SceneElement[] = [
    rub('slide drawn back on its rails', back(0.0005), -12, { force: 6, duration: T - back(0.0005), speed: 0.5, profile: 'swell', ...LUBED }, g19SlideSliding, g19Rail),
    hit('barrel drops off the locking block', back(0.003), -9, 0.6, g19Barrel, g19LockBlock, { radius: 2, click: 0.7, sharp: 0.8 }),
    snap('striker catches on the trigger bar', back(0.006), -11, { strength: 0.5, preload: 0, seat: 0.2, seatDelay: 1 }, steelBar(3, 4), steelBar(2, 2)),
    // the slide's breech face rides over the top round until it clears the rim, ~30 mm back; then the round pops up
    ...(fill === 'loaded' ? [
      rub('slide rides over the top round', back(0.002), -15, { force: 3, duration: back(0.029) - back(0.002), speed: 0.4, profile: 'swell', roughness: 3, grain: 0.2, contactWidth: 0.05 }, g19SlideSliding, g19Round),
      hit('top round pops up into the feed lips', back(0.0295), -13, 0.7, g19Round, g19MagLiner('loaded'), { radius: 1.5, click: 0.5, sharp: 0.6 }),
    ] : fill === 'empty' ? [
      rub('slide rides over the empty follower', back(0.002), -17, { force: 2, duration: back(0.029) - back(0.002), speed: 0.4, profile: 'swell', roughness: 3, grain: 0.3, contactWidth: 0.08 }, g19SlideSliding, { ...arFollower, ...GLOCK_POLYMER, shape: 'bar', size: 3, thickness: 3, modes: 0, damping: 0.8 }),
    ] : []),
    rub('recoil spring compresses', back(0.002), -17, { force: 3, duration: T - back(0.002), speed: 0.5, profile: 'swell', roughness: 3, grain: 0.3, contactWidth: 0.05 }, g19Spring, g19Frame, { coil: { level: 0.3, length: 5, dispersion: 0.5, decay: 0.08, brightness: 5000 } }),
    hit('slide stops at the rear', T, -6, 0.9, g19Slide, g19Frame, { radius: 5, click: 0.35, sharp: 0.3 }),
    ...g19Forward(LET_GO, fill === 'loaded'),
  ];
  outsideShell(els);
  const pull = (e: SceneElement) => e.at < LET_GO - 0.001;
  return {
    id: 'g19-rack' + (fill === 'loaded' ? '' : fill === 'empty' ? '-empty-mag' : '-no-mag') + (timing.pull ? '-timed' : ''),
    title: `G19: slide racked and let go${fill === 'loaded' ? ', chambering a round' : ''}`,
    room: 0.04, roomSize: 0.35, housing: G19_HOUSING, enclosure: G19_SHELL,
    tracks: [
      { name: 'pull-back', description: 'Slide drawn back: the barrel drops to unlock, the striker catches, the slide stops at the rear.', elements: els.filter(pull) },
      { name: 'release-forward', description: 'Let go: the slide runs home, strips and chambers a round, and the barrel locks up into it.', elements: els.filter((e) => !pull(e)) },
    ],
  };
}

/** Locked open on an empty magazine: the thumb presses the slide stop down and the slide runs home. */
function makeG19SlideRelease(): Scene {
  const els: SceneElement[] = [
    snap('thumb presses the slide stop down', 0, -8, { strength: 0.6, preload: 40, creak: 0.05, seat: 0.2, seatDelay: 1 }, g19SlideStop, g19Slide),
    ...g19Forward(0.041, true),
  ];
  outsideShell(els);
  return {
    id: 'g19-slide-release', title: 'G19: slide stop pressed, the slide runs home and chambers a round',
    room: 0.04, roomSize: 0.35, housing: G19_HOUSING, enclosure: G19_SHELL,
    tracks: [{ name: 'slide-release', description: 'Slide stop pressed down; the slide runs home, chambering a round.', elements: els }],
  };
}

/** The Glock magazine: dropping free out of the grip when the button is pressed, or pushed in until the catch clicks. */
function makeG19Mag(dir: 'in' | 'out', fill: Fill): Scene {
  const m = g19Mag(fill), liner = g19MagLiner(fill), v = fill === 'loaded' ? 1 : 0.8;
  // out: free of the catch it falls ~10 cm out of the grip under gravity (~140 ms), polymer on polymer
  const els: SceneElement[] = dir === 'out' ? [
    snap('magazine button pressed', 0, -10, { strength: 0.45, preload: 30, creak: 0.05, seat: 0.15, seatDelay: 1 }, g19MagCatch, g19Frame),
    snap('catch lets go of the magazine', 0.032, -10, { strength: 0.45, preload: 0, seat: 0, seatDelay: 1 }, g19MagCatch, m),
    rub('magazine drops out of the grip', 0.034, -11, { force: 1.5, duration: 0.14, speed: 1.3, profile: 'accelerate', roughness: 6, grain: 1.5, contactWidth: 0.15 }, m, g19Frame),
    hit('liner ticks the grip as it falls', 0.09, -16, 0.4 * v, liner, g19Frame, { radius: 1.5, click: 0.6, sharp: 0.6 }),
  ] : [
    rub('magazine slides up into the grip', 0, -12, { force: 2, duration: 0.07, speed: 0.9, profile: 'accelerate', roughness: 6, grain: 1.5, contactWidth: 0.15 }, m, g19Frame),
    snap('catch clicks into the magazine', 0.07, 0, { strength: 0.75, preload: 0, seat: 0, seatDelay: 1 }, g19MagCatch, liner, { coil: { level: 0.1, length: 1.2, dispersion: 0.3, decay: 0.02, brightness: 7000 } }),
    hit('baseplate meets the grip', 0.074, -8, 0.8 * v, m, g19Frame, { radius: 3, click: 0.6, sharp: 0.6 }),
  ];
  if (fill === 'loaded' && dir === 'in') els.push(hit('top round presses up against the slide', 0.075, -16, 0.4, g19Round, g19Slide, { radius: 1.5, click: 0.5, sharp: 0.6 }));
  return {
    id: `g19-mag-${dir}` + (fill === 'empty' ? '-empty' : ''), title: `G19: ${fill} magazine ${dir === 'out' ? 'dropped free' : 'pushed in'}`,
    room: 0.04, roomSize: 0.35, housing: G19_HOUSING,
    tracks: [{ name: `mag-${dir}`, description: dir === 'out' ? 'Button pressed; the magazine drops free out of the grip.' : 'Pushed up into the grip until the catch clicks.', elements: els }],
  };
}

export const MORE_GUN_SCENES: Scene[] = [
  makeAkCharge('loaded'), makeAkCharge('empty'), makeAkCharge('none'),
  makeAkMagOut('loaded'), makeAkMagOut('empty'), makeAkMagIn('loaded'), makeAkMagIn('empty'),
  makeMp5Charge('loaded'), makeMp5Charge('empty'), makeMp5Charge('none'),
  makeMp5Mag('out', 'loaded'), makeMp5Mag('out', 'empty'), makeMp5Mag('in', 'loaded'), makeMp5Mag('in', 'empty'),
  makeG19Rack('loaded'), makeG19Rack('empty'), makeG19Rack('none'), makeG19SlideRelease(),
  makeG19Mag('out', 'loaded'), makeG19Mag('out', 'empty'), makeG19Mag('in', 'loaded'), makeG19Mag('in', 'empty'),
];

/** A charge (the action pulled to the rear and let go) with the hand's own timing, e.g. to match an animation. */
export function chargeScene(gun: 'ak' | 'mp5' | 'g19', fill: Fill | 'none', timing: ChargeTiming): Scene {
  return gun === 'ak' ? makeAkCharge(fill, timing) : gun === 'mp5' ? makeMp5Charge(fill, timing) : makeG19Rack(fill, timing);
}
