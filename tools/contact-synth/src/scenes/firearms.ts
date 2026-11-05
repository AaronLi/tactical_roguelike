/*
 * Firearm manual-of-arms mechanics: a generic pump-action shotgun racked, an
 * AR-15 charged (charging handle back, let go) and an AR-15 bolt release (bolt
 * locked back, catch pressed).
 *
 * Every element is a contact between two real parts (steel bolt on steel
 * barrel extension, aluminium charging handle in the aluminium upper, brass case
 * over steel feed lips, coil spring in its tube...). Each scene plays through a
 * housing that stands for the receiver everything is mounted in. Springs that
 * matter acoustically (buffer spring, magazine spring, shell stop, latches) use
 * the coil layer or snaps. Levels are a sound-design balance.
 *
 * A firearm is an assembly: parts are pinned, greased, spring-loaded against each
 * other and held in hands, so none of them rings freely. Joint and contact
 * losses in built-up steel structures are orders of magnitude above solid
 * steel's own loss. So parts here are heavily damped: small parts have no pitched
 * partials at all (they're heard as part of the clack), heavy blocks and springs
 * keep one or two, and the receiver housing has none (its modes overlap
 * into dense noise). Free-ringing steel would sound like chimes or crystals,
 * not a gun.
 */

import type { Scene, SceneElement } from '../scene.js';
import type { BodyParams, FrictionParams, ParamPatch, SnapParams } from '../params.js';
import { mat } from '../presets.js';

type Body = Partial<BodyParams>;
type Extra = Omit<ParamPatch, 'impact' | 'friction' | 'snap' | 'bodyA' | 'bodyB'>;

// ---------- element helpers ----------
function hit(what: string, at: number, gainDb: number, velocity: number, A: Body, B: Body, opts: { scatter?: number; radius?: number; click?: number; sharp?: number } = {}, extra: Extra = {}): SceneElement {
  return {
    what, at, gainDb,
    sound: { kind: 'contact', patch: {
      impact: { velocity, restitution: 0, scatter: opts.scatter ?? 0.4, contactRadius: opts.radius ?? 3, click: opts.click ?? 0.6, sharpness: opts.sharp ?? 0.9 },
      bodyA: A, bodyB: B, out: { length: 0.8 }, ...extra,
    } },
  };
}
function rub(what: string, at: number, gainDb: number, friction: Partial<FrictionParams>, A: Body, B: Body, extra: Extra = {}): SceneElement {
  return {
    what, at, gainDb,
    sound: { kind: 'contact', patch: {
      impact: { velocity: 0, sharpness: 0.8, click: 0.4 },
      friction: { profile: 'swell', periodicity: 0.1, stickSlip: 0, contactWidth: 0.05, ...friction }, // greased: no stick-slip unless asked
      bodyA: A, bodyB: B, out: { length: 0.8 }, ...extra,
    } },
  };
}
/** A spring-loaded part letting go. `at` is when the finger/part starts loading it; the snap is `preload` ms later. */
function snap(what: string, at: number, gainDb: number, s: Partial<SnapParams>, A: Body, B: Body, extra: Extra = {}): SceneElement {
  return {
    what, at, gainDb,
    sound: { kind: 'contact', patch: {
      impact: { velocity: 0, sharpness: 0.95, click: 0.7 },
      snap: { count: 1, strength: 0.7, preload: 0, creak: 0, seat: 0.4, seatDelay: 2, ...s },
      bodyA: A, bodyB: B, out: { length: 0.6 }, ...extra,
    } },
  };
}

// ---------- parts ----------
const steelBlock = (cm: number, mm: number): Body => ({ ...mat('steel'), shape: 'block', size: cm, thickness: mm, modes: 1, irregularity: 0.7, damping: 0.65, level: 0 });
const steelBar = (cm: number, mm: number, damping = 0.65): Body => ({ ...mat('steel'), shape: 'bar', size: cm, thickness: mm, modes: 0, irregularity: 0.7, damping, level: 0 });
const alu = (shape: BodyParams['shape'], cm: number, mm: number, damping = 0.65): Body => ({ ...mat('aluminum'), shape, size: cm, thickness: mm, modes: 0, irregularity: 0.7, damping, level: 0 });
const springWire = (cm: number, mm: number): Body => ({ ...mat('springsteel'), shape: 'bar', size: cm, thickness: mm, modes: 2, irregularity: 0.6, damping: 0.55, level: 0 });

// Shotgun
const sgBolt = steelBlock(7, 25);
const sgBoltSlide = steelBar(6, 6);
const sgReceiverRail: Body = { ...steelBar(20, 4, 0.75), modes: 0 }; // part of the receiver
const sgActionBars = steelBar(25, 2.5);
const sgForend: Body = { ...mat('nylon'), shape: 'shell', size: 22, thickness: 4, modes: 12, irregularity: 0.6, damping: 0.6, level: 0 }; // gripped
const sgMagTube: Body = { ...mat('steel'), shape: 'shell', size: 45, thickness: 1.2, modes: 0, irregularity: 0.6, damping: 0.75, level: 0 }; // fore-end hand damps it
const sgCarrier = steelBar(7, 2);
const sgShellStop = springWire(3, 1.5);
const sgActionLock = steelBar(3, 2.5);
const hull: Body = { ...mat('hdpe'), shape: 'shell', size: 7, thickness: 0.8, modes: 8, irregularity: 0.4, damping: 0.2, level: -4 };
const brassHead: Body = { ...mat('brass'), shape: 'block', size: 2.2, thickness: 8, modes: 0, irregularity: 0.5, damping: 0.5, level: 0 };
const sgChamber: Body = { ...mat('steel'), shape: 'shell', size: 9, thickness: 4, modes: 2, irregularity: 0.6, damping: 0.7, level: 0 };

// AR-15
// The bolt carrier is a hollow steel tube (~18 cm, ~3.5 mm wall, gas key on top); the bolt is
// a separate solid part (~6 cm) riding inside it, turned by the cam pin in the carrier's cam
// track. They move and hit separately: that's what gives the AR its two-part "ch-chunk".
const arCarrier: Body = { ...mat('steel'), shape: 'shell', size: 18, thickness: 3.5, modes: 2, irregularity: 0.6, damping: 0.5, level: 0 };
const arBolt: Body = { ...mat('steel'), shape: 'bar', size: 6, thickness: 15, modes: 1, irregularity: 0.5, damping: 0.5, level: 0 };
const arCamPin = steelBar(1.5, 5);
const arBarrelExt = steelBlock(3, 20);
const arUpper: Body = { ...alu('shell', 25, 3, 0.7), modes: 0 }; // receiver: thick, bolted to everything, no free ring
const arChargingHandle = alu('bar', 18, 5, 0.7); // in the hand
const arChLatch = steelBar(2.5, 2);
const arBufferTube: Body = { ...alu('shell', 18, 2.5, 0.5), modes: 1 }; // the buffer tube's own short ring is part of the AR's sound
const arBufferSpring = springWire(25, 1.4);
const arBuffer = steelBlock(6, 18); // buffer with sliding weights
const arCase: Body = { ...mat('brass'), shape: 'shell', size: 4.5, thickness: 0.4, modes: 1, irregularity: 0.5, damping: 0.6, level: 0 }; // held by the magazine / chamber
const arFeedLips = steelBar(4, 0.8, 0.4);
const arChamber: Body = { ...mat('steel'), shape: 'shell', size: 5, thickness: 4, modes: 2, irregularity: 0.6, damping: 0.7, level: 0 };
const arBoltCatch = steelBar(4, 3);
// Fire control group in the lower: the hammer (spring-loaded, under the carrier) and the
// trigger, whose front hook is the sear that catches the hammer's notch.
const arHammer = steelBar(4, 6);
const arTriggerSear = steelBar(3, 5);
const arExtractor = steelBar(2, 3);
const arNextRound: Body = { ...arCase, level: -2 };

// ---------- pump-action shotgun ----------
const PULL = 0.0;
const PULL_END = 0.16;
const PUSH = 0.32;
const PUSH_END = 0.44;

export const PUMP_SHOTGUN: Scene = {
  id: 'pump-shotgun',
  title: 'Pump-action shotgun: rack (back and forward)',
  room: 0.04,
  roomSize: 0.35,
  // Steel receiver (with barrel and magazine tube hung off it), held at shoulder.
  housing: { amount: 0.5, cavity: 0.15, ...mat('steel'), shape: 'shell', size: 24, thickness: 4, modes: 0, irregularity: 0.8, damping: 0.75 },
  tracks: [
    {
      name: 'action-release',
      description: 'Action lock lets go of the action bars (trigger-guard release or recoil).',
      elements: [snap('action lock trips', PULL - 0.03, -12, { strength: 0.5, preload: 25, seat: 0.3 }, sgActionLock, sgActionBars)],
    },
    {
      name: 'unlock',
      description: 'Bolt slide cams the locking block down out of the barrel extension.',
      elements: [hit('locking block drops', PULL + 0.012, -6, 1.2, sgBoltSlide, sgBolt, { scatter: 0.5, radius: 2 })],
    },
    {
      name: 'pull-slide',
      description: 'Rearward stroke: fore-end on the magazine tube, action bars and bolt along the receiver rails.',
      elements: [
        rub('fore-end along the mag tube', PULL, -13, { force: 6, duration: PULL_END - PULL, speed: 1.0, roughness: 4, grain: 0.3, contactWidth: 0.1 }, sgForend, sgMagTube),
        rub('action bars in the receiver channels', PULL + 0.01, -12, { force: 5, duration: PULL_END - PULL - 0.01, speed: 1.0, roughness: 18, grain: 0.5, periodicity: 0.15 }, sgActionBars, sgReceiverRail),
        rub('bolt riding the rails', PULL + 0.015, -14, { force: 4, duration: PULL_END - PULL - 0.015, speed: 1.0, roughness: 12, grain: 0.4 }, sgBolt, sgReceiverRail),
      ],
    },
    {
      name: 'extract-eject',
      description: 'Extractor pulls the empty hull out; it hits the ejector and is kicked out of the port.',
      elements: [
        rub('hull dragged out of the chamber', PULL + 0.02, -18, { force: 3, duration: 0.06, speed: 1.0, profile: 'accelerate', roughness: 6, grain: 0.3, contactWidth: 0.3 }, hull, sgChamber),
        hit('brass head strikes the ejector', PULL + 0.095, -9, 2.0, brassHead, steelBar(3, 3), { scatter: 0.3, radius: 1.5 }),
      ],
    },
    {
      name: 'carrier-feed',
      description: 'Carrier tips up; shell stop releases the next shell, which the magazine spring drives back onto the carrier.',
      elements: [
        hit('carrier tips up', PULL + 0.115, -10, 1.0, sgCarrier, sgReceiverRail, { scatter: 0.4 }),
        snap('shell stop releases', PULL + 0.12, -14, { strength: 0.5, preload: 0, seat: 0.2 }, sgShellStop, sgMagTube),
        hit('next shell lands on the carrier', PULL + 0.13, -9, 1.5, brassHead, sgCarrier, { scatter: 0.5, radius: 4 }),
      ],
    },
    {
      name: 'rear-stop',
      description: 'Bolt and action bars bottom out at the rear of the receiver: the first "chk".',
      elements: [
        hit('bolt hits rear of receiver', PULL_END, 0, 2.0, sgBolt, sgReceiverRail, { scatter: 0.5, radius: 3, click: 0.7 },
          { flex: { amount: 0.3, freq: 60, decay: 0.08, rattle: 0.5, wobble: 0, tone: 0 } }),
      ],
    },
    {
      name: 'push-slide',
      description: 'Forward stroke: fore-end, action bars and bolt run forward; carrier drops.',
      elements: [
        rub('fore-end along the mag tube', PUSH, -13, { force: 6, duration: PUSH_END - PUSH, speed: 1.1, roughness: 4, grain: 0.3, contactWidth: 0.1 }, sgForend, sgMagTube),
        rub('action bars in the receiver channels', PUSH + 0.005, -12, { force: 5, duration: PUSH_END - PUSH - 0.005, speed: 1.1, roughness: 18, grain: 0.5, periodicity: 0.15 }, sgActionBars, sgReceiverRail),
        hit('carrier drops', PUSH + 0.03, -12, 0.8, sgCarrier, sgReceiverRail, { scatter: 0.4 }),
      ],
    },
    {
      name: 'chamber',
      description: 'Bolt pushes the shell off the carrier and into the chamber.',
      elements: [
        rub('hull sliding into the chamber', PUSH + 0.05, -16, { force: 3, duration: 0.05, speed: 1.0, profile: 'decelerate', roughness: 6, grain: 0.3, contactWidth: 0.3 }, hull, sgChamber),
        hit('brass head seats', PUSH + 0.1, -12, 0.8, brassHead, sgChamber, { radius: 5 }),
      ],
    },
    {
      name: 'lock-up',
      description: 'Locking block cams up into the barrel extension, fore-end hits its front stop: the second "chk", then the action lock clicks in.',
      elements: [
        hit('locking block cams up', PUSH_END - 0.008, -5, 1.5, sgBoltSlide, sgBolt, { scatter: 0.5, radius: 2 }),
        hit('front stop', PUSH_END, 0, 2.2, sgActionBars, sgReceiverRail, { scatter: 0.5, radius: 3, click: 0.7 },
          { flex: { amount: 0.3, freq: 60, decay: 0.08, rattle: 0.5, wobble: 0, tone: 0 } }),
        snap('action lock snaps into its notch', PUSH_END + 0.004, -11, { strength: 0.6, preload: 0, seat: 0.3 }, sgActionLock, sgActionBars),
      ],
    },
  ],
};

// ---------- AR-15 ----------
// Receiver housing: 7075 aluminium upper and lower, barrel and buffer tube hung off them.
// The carrier slides inside the upper's long bore, which continues into the buffer tube: a
// narrow air space (~2.6 cm) that gives the pipe-like hollow "shk" of the slides.
const AR_HOUSING: Scene['housing'] = { amount: 0.55, cavity: 0.5, cavityWidth: 2.6, ...mat('aluminum'), shape: 'shell', size: 30, thickness: 3, modes: 0, irregularity: 0.8, damping: 0.6 };

/** The carrier running home under the buffer spring, starting at t (round in the magazine). */
function arForward(t: number, withChargingHandle: boolean): SceneElement[] {
  const els: SceneElement[] = [
    // Buffer spring decompressing: the classic AR "sproing", echoing in the buffer tube.
    // The buffer spring is inside the buffer tube, behind the receiver, inside the stock:
    // heard only as a faint, muffled sproing under the carrier.
    hit('buffer spring drives the carrier', t, -18, 3, arBufferSpring, arBufferTube, { scatter: 0.2, radius: 1, click: 0.1, sharp: 0.5 },
      { coil: { level: 0.3, length: 14, dispersion: 0.4, decay: 0.2, brightness: 1800 } }),
    // What you actually hear: the steel carrier grinding along the aluminium upper.
    rub('carrier rails in the upper', t + 0.002, -8, { force: 6, duration: 0.05, speed: 4, profile: 'accelerate', roughness: 3, grain: 0.15, periodicity: 0, contactWidth: 0.08 }, arCarrier, arUpper),
    hit('buffer weights shift', t + 0.004, -20, 1.2, steelBlock(1.5, 12), arBuffer, { scatter: 0.9, radius: 2 }),
    // Bolt strips the top round over the steel feed lips.
    rub('case dragged over the feed lips', t + 0.02, -14, { force: 6, duration: 0.02, speed: 3, roughness: 15, grain: 0.3 }, arCase, arFeedLips),
    hit('next round pops up', t + 0.03, -16, 0.8, arNextRound, arFeedLips, { scatter: 0.3, radius: 2 }),
    rub('round into the chamber', t + 0.04, -15, { force: 5, duration: 0.015, speed: 3, profile: 'decelerate', roughness: 6, grain: 0.3 }, arCase, arChamber),
    // Lock-up in two parts. The bolt (out front of the carrier) hits the barrel extension
    // first: a sharp, light hit. The carrier keeps going for its 9.5 mm of cam travel, the
    // cam pin turns the bolt into its lugs, and then the heavy hollow carrier lands on the
    // bolt: the "chunk", about 2.5 ms later.
    hit('bolt face hits the barrel extension', t + 0.055, -4, 4.5, arBolt, arBarrelExt, { scatter: 0.3, radius: 3, click: 0.7 }),
    rub('cam pin turns the bolt', t + 0.054, -12, { force: 10, duration: 0.011, speed: 1.2, profile: 'decelerate', roughness: 10, grain: 0.2, contactWidth: 0.02 }, arCamPin, arCarrier),
    hit('bolt lugs rotate home', t + 0.057, -9, 1.5, arBolt, arBarrelExt, { scatter: 0.3, radius: 1.5 }),
    hit('carrier slams onto the bolt', t + 0.0578, 0, 3.8, arCarrier, arBolt, { scatter: 0.5, radius: 5, click: 0.8 },
      { flex: { amount: 0.25, freq: 90, decay: 0.06, rattle: 0.4, wobble: 0, tone: 0 } }),
    snap('extractor snaps over the rim', t + 0.056, -12, { strength: 0.6, preload: 0, seat: 0.2 }, arExtractor, arCase),
  ];
  if (withChargingHandle) {
    els.push(snap('charging handle latch catches', t + 0.06, -9, { strength: 0.7, preload: 0, seat: 0.4, seatDelay: 2 }, arChLatch, arUpper));
  }
  return els;
}

const CH_BACK = 0.0;
// The pull, laid out by travel. The hand's speed follows a swell (accelerate, then brake),
// so position along the 90 mm stroke is x(t) = 45 mm · (1 − cos(π t / T)). Each part comes in
// and out at its own point of travel, at the speed the stroke has there.
const PULL_MM = 90;
const PULL_T = 0.16;
const CH_END = CH_BACK + PULL_T;
const LET_GO = 0.45;
const tAt = (mm: number): number => CH_BACK + (PULL_T * Math.acos(1 - (2 * Math.min(mm, PULL_MM)) / PULL_MM)) / Math.PI;

const SLIDE_BED_DB = 10;

/** A rubbing contact that exists only between two points of the pull's travel. */
function travelRub(what: string, mm0: number, mm1: number, gainDb: number, f: Partial<FrictionParams>, A: Body, B: Body, extra: Extra = {}): SceneElement {
  const at = tAt(mm0);
  const duration = Math.max(0.012, tAt(mm1) - at);
  const speed = ((mm1 - mm0) / 1000 / duration) * 1.2;
  const mid = (mm0 + mm1) / 2;
  const profile = mid < 25 ? 'accelerate' : mid > 65 ? 'decelerate' : 'steady';
  // Every element is normalised to the same peak before its gain; a continuous slide at the
  // same gain as a click carries far more energy and would bury it. Slides sit 10 dB down so
  // the events at each point of travel read on top of them.
  return rub(what, at, gainDb - SLIDE_BED_DB, { duration, speed, profile, ...f }, A, B, extra);
}

// Oiled contact textures, each pair its own: anodised aluminium, phosphated steel, brass.
const OIL_ALU = { roughness: 3, grain: 0.2, periodicity: 0, contactWidth: 0.08 };
const OIL_STEEL = { roughness: 3, grain: 0.12, periodicity: 0, contactWidth: 0.06 };
const OIL_TUBE = { roughness: 2, grain: 0.3, periodicity: 0, contactWidth: 0.1 };
const gasKey = steelBar(3, 6);
// Ejection-port dust cover: a thin spring-loaded steel flap that snaps open and slaps the upper.
const arDustCover: Body = { ...mat('steel'), shape: 'plate', size: 9, thickness: 0.8, modes: 2, irregularity: 0.6, damping: 0.35, level: 0 };

export const AR15_CHARGE: Scene = {
  id: 'ar15-charge',
  title: 'AR-15: charging handle pulled back and released',
  room: 0.04,
  roomSize: 0.35,
  housing: AR_HOUSING,
  tracks: [
    {
      name: 'latch-unlatch',
      description: 'Finger squeezes the charging-handle latch out of its notch in the upper.',
      elements: [snap('latch pivots out', CH_BACK - 0.04, -10, { strength: 0.5, preload: 35, seat: 0.2 }, arChLatch, arUpper)],
    },
    {
      name: 'gas-key-pickup',
      description: '0-2 mm: the charging handle takes up its free play and catches the carrier\'s gas key.',
      elements: [hit('handle catches the gas key', tAt(2), -9, 0.5, gasKey, arChargingHandle, { scatter: 0.3, radius: 2 })],
    },
    {
      name: 'dust-cover',
      description: '~4 mm: the carrier trips the ejection-port dust cover, which springs open and slaps the side of the upper.',
      elements: [
        hit('dust cover snaps open', tAt(4) + 0.006, -5, 2.5, arDustCover, arUpper, { scatter: 0.4, radius: 6, click: 0.7 },
          { flex: { amount: 0.3, freq: 70, decay: 0.05, rattle: 0.5, wobble: 0, tone: 0 }, coil: { level: 0.15, length: 2, dispersion: 0.3, decay: 0.04, brightness: 5000 } }),
      ],
    },
    {
      name: 'unlock',
      description: '2-11.5 mm: the carrier moves alone through its cam travel, the cam pin turns the bolt out of its lugs (~10 mm), then the carrier catches the bolt and drags it along (11.5 mm).',
      elements: [
        travelRub('cam pin turns the bolt', 2, 11.5, -12, { force: 8, roughness: 10, grain: 0.2, contactWidth: 0.02 }, arCamPin, arCarrier),
        hit('bolt lugs rotate free', tAt(10), -10, 0.6, arBolt, arBarrelExt, { scatter: 0.3, radius: 1.5 }),
        hit('carrier picks up the bolt', tAt(11.5), -6, 0.9, arCarrier, arBolt, { scatter: 0.4, radius: 3, click: 0.7 }),
      ],
    },
    {
      name: 'pull-back',
      description: 'The slides, each over its own stretch of travel: charging handle in its channel (0-90 mm), gas key in the handle slot (2-90), carrier on the upper rails (2-40), carrier tail entering and running in the buffer tube (40-90), bolt tail in the carrier bore (11.5-90). Oiled, so light and slick.',
      elements: [
        travelRub('charging handle in its channel', 0, 90, -11, { force: 4, ...OIL_ALU }, arChargingHandle, arUpper),
        travelRub('gas key riding in the handle slot', 2, 90, -15, { force: 3, ...OIL_STEEL }, gasKey, arChargingHandle),
        travelRub('carrier on the upper rails', 2, 40, -9, { force: 6, ...OIL_STEEL }, arCarrier, arUpper),
        hit('carrier tail enters the buffer tube', tAt(40), -16, 0.5, arCarrier, arBufferTube, { scatter: 0.3, radius: 4 }),
        travelRub('carrier tail running in the buffer tube', 40, 90, -11, { force: 4, ...OIL_TUBE }, arCarrier, arBufferTube),
        travelRub('bolt tail riding in the carrier bore', 11.5, 90, -20, { force: 2, ...OIL_STEEL }, arBolt, arCarrier),
      ],
    },
    {
      name: 'hammer-cock',
      description: '35-60 mm: with the hammer down, the carrier rides it down against its spring; at 60 mm the trigger sear snaps into the hammer notch; the carrier then rides over the cocked hammer. (Leave this track out if the hammer was already cocked.)',
      elements: [
        travelRub('carrier pushes the hammer down', 35, 60, -12, { force: 12, roughness: 4, grain: 0.15, contactWidth: 0.05 }, arHammer, arCarrier,
          { coil: { level: 0.15, length: 3, dispersion: 0.3, decay: 0.05, brightness: 4000 } }),
        snap('trigger sear catches the hammer', tAt(60), -3, { strength: 0.9, preload: 0, seat: 0.5, seatDelay: 1.5 }, arTriggerSear, arHammer),
        travelRub('carrier riding over the cocked hammer', 60, 90, -20, { force: 3, ...OIL_STEEL }, arHammer, arCarrier),
      ],
    },
    {
      name: 'magazine',
      description: '45-72 mm: the bolt rides over the top round in the magazine; once it clears, the magazine spring pops the round up against the feed lips.',
      elements: [
        travelRub('bolt riding over the top round', 45, 72, -16, { force: 5, roughness: 2, grain: 0.2, contactWidth: 0.05 }, arCase, arBolt),
        hit('round pops up against the feed lips', tAt(72) + 0.002, -11, 0.8, arNextRound, arFeedLips, { scatter: 0.3, radius: 2 }),
      ],
    },
    {
      name: 'buffer-spring-compress',
      description: 'Buffer spring compressing inside the buffer tube (inside the stock) for the whole stroke: a faint, muffled scrape and sproing. The buffer weights lag at the start and settle at the stop.',
      elements: [
        travelRub('coils scraping the buffer tube', 2, 90, -22, { force: 3, roughness: 12, grain: 0.5, periodicity: 0.1, contactWidth: 0.2 }, arBufferSpring, arBufferTube,
          { coil: { level: 0.2, length: 14, dispersion: 0.4, decay: 0.15, brightness: 1800 } }),
        hit('buffer weights lag', tAt(3), -22, 0.6, steelBlock(1.5, 12), arBuffer, { scatter: 0.9, radius: 2 }),
        hit('buffer weights settle', CH_END + 0.004, -20, 0.8, steelBlock(1.5, 12), arBuffer, { scatter: 0.9, radius: 2 }),
      ],
    },
    {
      name: 'rear-stop',
      description: '90 mm: the charging handle bottoms out; the bolt shifts inside the carrier.',
      elements: [
        hit('handle bottoms out', CH_END, -6, 1.0, arChargingHandle, arUpper, { scatter: 0.4, radius: 3 }),
        hit('bolt shifts in the carrier', CH_END + 0.003, -14, 0.5, arBolt, arCarrier, { scatter: 0.4, radius: 2 }),
      ],
    },
    {
      name: 'release-forward',
      description: 'Let go: buffer spring slams the carrier home, stripping and chambering a round, and the bolt locks up. The charging handle rides home and latches.',
      elements: arForward(LET_GO, true),
    },
  ],
};

const PRESS = 0.0;
const CATCH_DROPS = 0.07;

export const AR15_BOLT_RELEASE: Scene = {
  id: 'ar15-bolt-release',
  title: 'AR-15: bolt catch pressed, bolt slams home',
  room: 0.04,
  roomSize: 0.35,
  housing: AR_HOUSING,
  tracks: [
    {
      name: 'bolt-catch',
      description: 'Thumb presses the bolt-catch paddle; the catch drops off the bolt face.',
      elements: [
        snap('catch pivots down off the bolt', PRESS, -6, { strength: 0.8, preload: (CATCH_DROPS - PRESS) * 1000, creak: 0.1, seat: 0.5, seatDelay: 3 }, arBoltCatch, arBolt),
      ],
    },
    {
      name: 'release-forward',
      description: 'Buffer spring slams the carrier home, stripping and chambering a round; the bolt locks up.',
      elements: arForward(CATCH_DROPS + 0.001, false),
    },
    {
      name: 'catch-reset',
      description: 'The bolt catch springs back up once the carrier is past.',
      elements: [snap('catch spring resets', CATCH_DROPS + 0.02, -16, { strength: 0.4, preload: 0, seat: 0.2 }, arBoltCatch, arUpper)],
    },
  ],
};

export const FIREARM_SCENES: Scene[] = [PUMP_SHOTGUN, AR15_CHARGE, AR15_BOLT_RELEASE];
