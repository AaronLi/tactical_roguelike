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
import { mat } from '../presets.js';
// ---------- element helpers ----------
function hit(what, at, gainDb, velocity, A, B, opts = {}, extra = {}) {
    return {
        what, at, gainDb,
        sound: { kind: 'contact', patch: {
                impact: { velocity, restitution: 0, scatter: opts.scatter ?? 0.4, contactRadius: opts.radius ?? 3, click: opts.click ?? 0.6, sharpness: opts.sharp ?? 0.9 },
                bodyA: A, bodyB: B, out: { length: 0.8 }, ...extra,
            } },
    };
}
function rub(what, at, gainDb, friction, A, B, extra = {}) {
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
function snap(what, at, gainDb, s, A, B, extra = {}) {
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
const steelBlock = (cm, mm) => ({ ...mat('steel'), shape: 'block', size: cm, thickness: mm, modes: 1, irregularity: 0.7, damping: 0.65, level: 0 });
const steelBar = (cm, mm, damping = 0.65) => ({ ...mat('steel'), shape: 'bar', size: cm, thickness: mm, modes: 0, irregularity: 0.7, damping, level: 0 });
const alu = (shape, cm, mm, damping = 0.65) => ({ ...mat('aluminum'), shape, size: cm, thickness: mm, modes: 0, irregularity: 0.7, damping, level: 0 });
const springWire = (cm, mm) => ({ ...mat('springsteel'), shape: 'bar', size: cm, thickness: mm, modes: 2, irregularity: 0.6, damping: 0.55, level: 0 });
// Shotgun
const sgBolt = steelBlock(7, 25);
const sgBoltSlide = steelBar(6, 6);
const sgReceiverRail = { ...steelBar(20, 4, 0.75), modes: 0 }; // part of the receiver
const sgActionBars = steelBar(25, 2.5);
const sgForend = { ...mat('nylon'), shape: 'shell', size: 22, thickness: 4, modes: 12, irregularity: 0.6, damping: 0.6, level: 0 }; // gripped
const sgMagTube = { ...mat('steel'), shape: 'shell', size: 45, thickness: 1.2, modes: 0, irregularity: 0.6, damping: 0.75, level: 0 }; // fore-end hand damps it
const sgCarrier = steelBar(7, 2);
const sgShellStop = springWire(3, 1.5);
const sgActionLock = steelBar(3, 2.5);
const hull = { ...mat('hdpe'), shape: 'shell', size: 7, thickness: 0.8, modes: 8, irregularity: 0.4, damping: 0.2, level: -4 };
const brassHead = { ...mat('brass'), shape: 'block', size: 2.2, thickness: 8, modes: 0, irregularity: 0.5, damping: 0.5, level: 0 };
const sgChamber = { ...mat('steel'), shape: 'shell', size: 9, thickness: 4, modes: 2, irregularity: 0.6, damping: 0.7, level: 0 };
// AR-15
const arCarrier = steelBlock(18, 22); // bolt carrier group, ~300 g
const arBolt = steelBlock(6, 10);
const arBarrelExt = steelBlock(3, 20);
const arUpper = { ...alu('shell', 25, 3, 0.7), modes: 0 }; // receiver: thick, bolted to everything, no free ring
const arChargingHandle = alu('bar', 18, 5, 0.4);
const arChLatch = steelBar(2.5, 2);
const arBufferTube = { ...alu('shell', 18, 2.5, 0.5), modes: 1 }; // the buffer tube's own short ring is part of the AR's sound
const arBufferSpring = springWire(25, 1.4);
const arBuffer = steelBlock(6, 18); // buffer with sliding weights
const arCase = { ...mat('brass'), shape: 'shell', size: 4.5, thickness: 0.4, modes: 1, irregularity: 0.5, damping: 0.6, level: 0 }; // held by the magazine / chamber
const arFeedLips = steelBar(4, 0.8, 0.4);
const arChamber = { ...mat('steel'), shape: 'shell', size: 5, thickness: 4, modes: 2, irregularity: 0.6, damping: 0.7, level: 0 };
const arBoltCatch = steelBar(4, 3);
const arExtractor = steelBar(2, 3);
const arNextRound = { ...arCase, level: -2 };
// ---------- pump-action shotgun ----------
const PULL = 0.0;
const PULL_END = 0.16;
const PUSH = 0.32;
const PUSH_END = 0.44;
export const PUMP_SHOTGUN = {
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
                hit('bolt hits rear of receiver', PULL_END, 0, 2.0, sgBolt, sgReceiverRail, { scatter: 0.5, radius: 3, click: 0.7 }, { flex: { amount: 0.3, freq: 60, decay: 0.08, rattle: 0.5, wobble: 0, tone: 0 } }),
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
                hit('front stop', PUSH_END, 0, 2.2, sgActionBars, sgReceiverRail, { scatter: 0.5, radius: 3, click: 0.7 }, { flex: { amount: 0.3, freq: 60, decay: 0.08, rattle: 0.5, wobble: 0, tone: 0 } }),
                snap('action lock snaps into its notch', PUSH_END + 0.004, -11, { strength: 0.6, preload: 0, seat: 0.3 }, sgActionLock, sgActionBars),
            ],
        },
    ],
};
// ---------- AR-15 ----------
// Receiver housing: 7075 aluminium upper and lower, barrel and buffer tube hung off them.
const AR_HOUSING = { amount: 0.5, cavity: 0.15, ...mat('aluminum'), shape: 'shell', size: 30, thickness: 3, modes: 0, irregularity: 0.8, damping: 0.7 };
/** The carrier running home under the buffer spring, starting at t (round in the magazine). */
function arForward(t, withChargingHandle) {
    const els = [
        // Buffer spring decompressing: the classic AR "sproing", echoing in the buffer tube.
        hit('buffer spring drives the carrier', t, -6, 3, arBufferSpring, arBufferTube, { scatter: 0.2, radius: 1, click: 0.3, sharp: 0.7 }, { coil: { level: 0.6, length: 14, dispersion: 0.45, decay: 0.35, brightness: 3500 } }),
        rub('carrier rails in the upper', t + 0.002, -12, { force: 8, duration: 0.05, speed: 4, profile: 'accelerate', roughness: 10, grain: 0.4 }, arCarrier, arUpper),
        hit('buffer weights shift', t + 0.004, -16, 1.2, steelBlock(1.5, 12), arBuffer, { scatter: 0.9, radius: 2 }),
        // Bolt strips the top round over the steel feed lips.
        rub('case dragged over the feed lips', t + 0.02, -14, { force: 6, duration: 0.02, speed: 3, roughness: 15, grain: 0.3 }, arCase, arFeedLips),
        hit('next round pops up', t + 0.03, -16, 0.8, arNextRound, arFeedLips, { scatter: 0.3, radius: 2 }),
        rub('round into the chamber', t + 0.04, -15, { force: 5, duration: 0.015, speed: 3, profile: 'decelerate', roughness: 6, grain: 0.3 }, arCase, arChamber),
        // Bolt face hits the barrel extension, cam pin rotates the bolt, lugs lock: the "chunk".
        hit('bolt slams into the barrel extension', t + 0.055, 0, 4.5, arCarrier, arBarrelExt, { scatter: 0.6, radius: 4, click: 0.7 }, { flex: { amount: 0.25, freq: 90, decay: 0.06, rattle: 0.4, wobble: 0, tone: 0 } }),
        hit('bolt rotates and locks', t + 0.058, -6, 1.5, arBolt, arBarrelExt, { scatter: 0.4, radius: 1.5 }),
        snap('extractor snaps over the rim', t + 0.056, -12, { strength: 0.6, preload: 0, seat: 0.2 }, arExtractor, arCase),
    ];
    if (withChargingHandle) {
        els.push(snap('charging handle latch catches', t + 0.06, -9, { strength: 0.7, preload: 0, seat: 0.4, seatDelay: 2 }, arChLatch, arUpper));
    }
    return els;
}
const CH_BACK = 0.0;
const CH_END = 0.2;
const LET_GO = 0.45;
export const AR15_CHARGE = {
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
            name: 'unlock',
            description: 'Carrier moves back; the cam pin rotates the bolt out of the barrel extension.',
            elements: [hit('bolt unlocks', CH_BACK + 0.01, -7, 1.0, arBolt, arBarrelExt, { scatter: 0.4, radius: 1.5 })],
        },
        {
            name: 'pull-back',
            description: 'Charging handle and carrier sliding back through the upper.',
            elements: [
                rub('charging handle in its channel', CH_BACK, -12, { force: 5, duration: CH_END - CH_BACK, speed: 0.7, roughness: 8, grain: 0.3, stickSlip: 0.1, stickPitch: 220 }, arChargingHandle, arUpper),
                rub('carrier on the upper rails', CH_BACK + 0.01, -12, { force: 6, duration: CH_END - CH_BACK - 0.01, speed: 0.7, roughness: 12, grain: 0.4 }, arCarrier, arUpper),
            ],
        },
        {
            name: 'buffer-spring-compress',
            description: 'Buffer spring compressing in the buffer tube: coils scraping the tube walls, the spring twanging.',
            elements: [
                rub('coils scraping the buffer tube', CH_BACK + 0.02, -9, { force: 3, duration: CH_END - CH_BACK - 0.02, speed: 0.7, roughness: 120, grain: 4, periodicity: 0.85 }, arBufferSpring, arBufferTube, { coil: { level: 0.55, length: 14, dispersion: 0.45, decay: 0.25, brightness: 3500 }, flex: { amount: 0.4, freq: 110, decay: 0.15, rattle: 0.3, wobble: 0.1, tone: 0.15 } }),
                hit('buffer weights shift', CH_BACK + 0.03, -16, 0.6, steelBlock(1.5, 12), arBuffer, { scatter: 0.9, radius: 2 }),
            ],
        },
        {
            name: 'rear-stop',
            description: 'Charging handle reaches the end of its travel.',
            elements: [hit('handle bottoms out', CH_END, -6, 1.0, arChargingHandle, arUpper, { scatter: 0.4, radius: 3 })],
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
export const AR15_BOLT_RELEASE = {
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
export const FIREARM_SCENES = [PUMP_SHOTGUN, AR15_CHARGE, AR15_BOLT_RELEASE];
//# sourceMappingURL=firearms.js.map