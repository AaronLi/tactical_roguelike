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
import { chainScenes } from '../scene.js';
import { simulateBoxDrop, boxSurfaces, axisAngle, quatMul } from '../rigid.js';
import { makeRng } from '../dsp.js';
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
// The bolt carrier is a hollow steel tube (~18 cm, ~3.5 mm wall, gas key on top); the bolt is
// a separate solid part (~6 cm) riding inside it, turned by the cam pin in the carrier's cam
// track. They move and hit separately: that's what gives the AR its two-part "ch-chunk".
// Modelled as rods (bar shape, thickness ≈ effective section): the synth's 'shell' is a pot
// whose diameter is its size, which made an 18 cm carrier a 2.8 kg pot and gave every slam a
// soft, rubbery contact. As a rod: ~0.3 kg, bright steel ring from ~1.9 kHz.
const arCarrier = { ...mat('steel'), shape: 'bar', size: 18.9, thickness: 12, modes: 3, irregularity: 0.7, damping: 0.5, level: 0 };
// The carrier group as it lands: carrier + buffer pressed behind it (~0.43 kg as a steel rod,
// ~2.7 kHz up). Heavier contact = longer, weightier landing.
const arCarrierGroup = { ...mat('steel'), shape: 'bar', size: 18.9, thickness: 17, modes: 3, irregularity: 0.7, damping: 0.5, level: 0 };
const arBolt = { ...mat('steel'), shape: 'bar', size: 6, thickness: 15, modes: 1, irregularity: 0.5, damping: 0.5, level: 0 };
const arCamPin = steelBar(1.5, 5);
const arBarrelExt = steelBlock(3, 20);
const arUpper = { ...alu('shell', 25, 3, 0.7), modes: 0 }; // receiver: thick, bolted to everything, no free ring
const arChargingHandle = alu('bar', 18, 5, 0.7); // in the hand
const arChLatch = steelBar(2.5, 2);
// Buffer tube (receiver extension): an aluminium tube, ~18 cm, in the stock. As a rod its own
// ring sits at ~2 kHz; the air inside it (18 cm × 2.5 cm bore) resonates at ~950 Hz and up,
// which is the hollow note the buffer spring sings in.
const arBufferTube = { ...mat('aluminum'), shape: 'bar', size: 18, thickness: 15, modes: 2, irregularity: 0.5, damping: 0.45, level: 0 };
/**
 * The carrier and buffer tube as heard through a sliding contact. A rub presses along the part and
 * keeps touching it, and the part runs in rails and a tube with grease in the gap, so it doesn't
 * ring on as a free bar (~1.75 kHz for the carrier, ~2.4 kHz for the tube): rendered on their own,
 * those rubs kept ringing for ~150 ms past the lock-up. Their pitch comes from the impacts.
 */
const carrierSliding = { ...arCarrier, modes: 0, damping: 0.8 };
const bufferTubeSliding = { ...arBufferTube, modes: 0, damping: 0.75 };
const BUFFER_TUBE_HOUSING = { amount: 0.8, cavity: 0.8, cavityWidth: 2.5, ...mat('aluminum'), shape: 'shell', size: 18, thickness: 2.5, modes: 0, irregularity: 0.6, damping: 0.45 };
const arBufferSpring = springWire(25, 1.4);
/**
 * Buffer spring strength relative to a standard carbine spring (~40 N in battery, ~80 N fully
 * back). 2 = a heavy spring: 80 N / 160 N. The forward run is simulated from this and the
 * reciprocating mass below, so stiffer = faster and harder, heavier = slower and harder.
 */
const BUFFER_SPRING = 2.0;
/*
 * Real-world AR-15 (carbine, collapsible stock) numbers this scene is built on:
 *  - carrier travel 3.7" ≈ 94 mm (3.8" fixed stock; ≥3.5" needed to strip a round)
 *  - BCG 11.5-11.6 oz ≈ 329 g; BCG with bolt extended 7 7/16" ≈ 189 mm
 *  - H2 buffer 4.6-4.7 oz ≈ 132 g, carbine buffer ≈ 3.25" long
 *  - carbine spring free length 10.06-11.25"; carbine receiver extension 7.1-7.3" deep. With
 *    the buffer, the spring sits ≈3.6" compressed in battery and ≈7.3" fully back: ~2x force.
 *  - top round's rim ≈ 86 mm behind the bolt face (stripping needs ≥3.5" of travel)
 *  - upper receiver ≈ 7" (≈18 cm); 16" barrel; carbine gas tube ≈ 9.8"
 */
const STROKE_MM = 94;
/** What moves forward together: BCG (329 g) + H2 buffer (132 g) + a third of the spring
 *  (~10 g). The charging handle (~30 g) rides along on a charge. */
const RECIP_MASS = 0.471;
const CH_MASS = 0.03;
function simulateRun(mass, mag = 'loaded') {
    const F_BAT = 40 * BUFFER_SPRING;
    const F_REAR = 80 * BUFFER_SPRING; // ~2x the battery force: 7.3" vs 3.6" of compression
    const xs = [];
    const ts = [];
    const vs = [];
    let x = STROKE_MM; // mm from battery
    let v = 0;
    let tt = 0;
    const dt = 1e-5;
    while (x > 9.5 && tt < 0.5) {
        const fs = F_BAT + (F_REAR - F_BAT) * (x / STROKE_MM);
        let drag = 6;
        if (mag === 'loaded') {
            if (x < 86 && x > 55)
                drag += 25; // stripping the round over the feed lips
            if (x < 45 && x > 3)
                drag += 15; // pushing it into the chamber
        }
        else if (mag === 'empty') {
            if (x < 86 && x > 30)
                drag += 6; // the follower pressing up under the bolt
        }
        v += ((fs - drag) / mass) * dt;
        x -= v * 1000 * dt;
        tt += dt;
        xs.push(x);
        ts.push(tt);
        vs.push(v);
    }
    const look = (arr, xq) => {
        // xs is decreasing
        let lo = 0;
        let hi = xs.length - 1;
        if (xq >= xs[0])
            return arr[0];
        if (xq <= xs[hi])
            return arr[hi];
        while (hi - lo > 1) {
            const mid = (lo + hi) >> 1;
            if (xs[mid] > xq)
                lo = mid;
            else
                hi = mid;
        }
        const f = (xs[lo] - xq) / (xs[lo] - xs[hi]);
        return arr[lo] + (arr[hi] - arr[lo]) * f;
    };
    return { timeAt: (xq) => (xq >= STROKE_MM ? 0 : look(ts, xq)), speedAt: (xq) => look(vs, xq), total: tt, arrive: v };
}
const arBuffer = steelBlock(6, 18); // buffer with sliding weights
// A loaded 5.56 cartridge, not an empty case: a brass case (~6 g) packed nearly full of powder
// (~1.6 g) with a ~4 g copper-jacketed lead bullet crimped in, ~12 g in all. The powder fill and
// the lead core soak up vibration, so it barely rings: a short, solid "tock", with a crisp click
// where its hard brass head and rim meet steel. (As a 4.5 cm x 6 mm brass bar: ~13 g.)
const arCase = { ...mat('brass'), shape: 'bar', size: 4.5, thickness: 6, modes: 1, irregularity: 0.6, damping: 0.8, level: 0 };
// Spring-steel feed lips: with a round pressed up into them by the whole stack they're clamped,
// so their contacts are crisp and dead rather than a free ring.
const arFeedLips = { ...mat('springsteel'), shape: 'bar', size: 4, thickness: 0.8, modes: 1, irregularity: 0.5, damping: 0.75, level: 0 };
const arChamber = { ...mat('steel'), shape: 'shell', size: 5, thickness: 4, modes: 2, irregularity: 0.6, damping: 0.7, level: 0 };
const arBoltCatch = steelBar(4, 3);
// Fire control group in the lower: the hammer (spring-loaded, under the carrier) and the
// trigger, whose front hook is the sear that catches the hammer's notch.
// Hardened tool-steel parts: their engagement is a crisp metallic tick that rings for a few
// milliseconds through the lower receiver, so they keep a couple of short pitched partials.
const arHammer = { ...mat('steel'), shape: 'bar', size: 4, thickness: 6, modes: 2, irregularity: 0.5, damping: 0.3, level: 0 };
const arTriggerSear = { ...mat('steel'), shape: 'bar', size: 3, thickness: 5, modes: 2, irregularity: 0.5, damping: 0.3, level: 0 };
// Lower receiver: aluminium, ~20 cm, magazine well, fire-control pocket, grip: a stiff,
// ribbed body with its own dense ring (from ~300 Hz), separate from the upper.
const arLower = { ...mat('aluminum'), shape: 'plate', size: 20, thickness: 4, modes: 4, irregularity: 0.8, damping: 0.45, level: 0 };
const arHammerSpring = springWire(4, 1.2);
// The receiver's connected air spaces: the upper's bore, the lower's fire-control pocket (open
// at the top into the bore, stiff aluminium walls, so it rings sharper) and the magazine well.
// Every slide in the upper expands into the pocket and the well, too.
const FCG_POCKET = { length: 6, width: 2, depth: 4, q: 16, level: 1 };
const MAG_WELL = { length: 8, width: 2.5, depth: 6, q: 11, level: 0.6 };
// Parts in the lower (trigger group) sound mostly in the fire-control pocket.
const LOWER_HOUSING = {
    amount: 0.85, cavity: 1, ...mat('aluminum'), shape: 'shell', size: 20, thickness: 4, modes: 0, irregularity: 0.8, damping: 0.5,
    cavities: [{ ...FCG_POCKET, level: 1 }, { ...MAG_WELL, level: 0.5 }, { length: 18, width: 2.6, depth: 2.2, q: 9, level: 0.3 }],
};
// The forward-assist pawl is spring-loaded against the serrations on the carrier's right
// side (~2.5 mm pitch): it clicks over them whenever the carrier moves past.
const arFaPawl = steelBar(1.5, 3);
const gasKey = steelBar(3, 6);
/**
 * The charging handle is only loosely coupled to the carrier: its slot fits over the gas key with
 * ~1 mm of play, and it sits in its channel in the upper with a little side play too. When it
 * stops at either end of travel the carrier and gas key carry on a hair and it knocks back and
 * forth in that play a few times, each bounce lighter and sooner (restitution ~0.7), before it
 * settles. Out of the hand it rings a little more than when gripped.
 */
const chLoose = { ...arChargingHandle, damping: 0.5 };
function handleRattle(t0, v0, gainDb, bounces, firstGap = 0.004) {
    const els = [];
    let t = t0, gap = firstGap, v = v0;
    for (let i = 0; i < bounces; i++) {
        t += gap;
        // Alternate: the handle's slot knocks the gas key, then the handle knocks its channel.
        els.push(i % 2 === 0
            ? hit('charging handle rattles on the gas key', t, gainDb - i * 2.5, v, chLoose, gasKey, { scatter: 0.5, radius: 1.5, click: 0.7, sharp: 0.8 })
            : hit('charging handle rattles in its channel', t, gainDb - 2 - i * 2.5, v, chLoose, arUpper, { scatter: 0.6, radius: 2, click: 0.6, sharp: 0.7 }));
        gap *= 0.7;
        v *= 0.7;
    }
    return els;
}
// What finally stops the carrier: the barrel extension, barrel and receiver. A thick steel
// tube (~40 cm, ~6 mm wall) in the handguard: the low, heavy body of the slam.
// Barrel (~16 mm steel rod, 40 cm) with the extension and upper: bends at ~500 Hz and up.
const arBarrel = { ...mat('steel'), shape: 'bar', size: 40, thickness: 16, modes: 3, irregularity: 0.5, damping: 0.7, level: 0 };
// What the lugs actually ring: the barrel nut clamps the barrel to the receiver, so a hit at the
// breech excites the short, stiff breech section (barrel extension, chamber, nut): ~2 kHz and up,
// bright and inharmonic. That's the "clank" of metal locking up, not the whole barrel's bong.
const arBreech = { ...mat('steel'), shape: 'bar', size: 20, thickness: 16, modes: 1, irregularity: 0.8, damping: 0.5, level: 0 };
// The whole rifle (barrel, upper, lower, stock) flexing as one beam: its first bending modes
// (~200 Hz and up) are the weight under a slam. Capped at the synth's 50 cm.
const arRifleBody = { ...mat('aluminum'), shape: 'bar', size: 50, thickness: 10, modes: 3, irregularity: 0.5, damping: 0.8, level: 0 }; // held: highs die fast, the low bend carries
// Copper jacket over a lead core: dense and dead.
const arBullet = { ...mat('copper'), loss: 0.02, shape: 'block', size: 2.3, thickness: 5.7, modes: 0, irregularity: 0.4, damping: 0.8, level: 0 };
const arFeedRamp = steelBar(2, 4);
const arGasTube = { ...mat('stainless'), shape: 'bar', size: 25, thickness: 4.7, modes: 0, irregularity: 0.5, damping: 0.6, level: 0 };
const arExtractor = steelBar(2, 3);
const arNextRound = { ...arCase, level: -2 };
// The magazine: a thin aluminium box (USGI 30-rd: ~18 cm long, ~6 x 2.2 cm, ~0.9 mm walls). Its
// walls ring bright and tinny and its air space resonates: the "mag ping" every feeding event
// sounds through. Seated in the mag well, so lightly damped.
const arMagBody = { ...mat('aluminum'), shape: 'plate', size: 18, thickness: 0.9, modes: 4, irregularity: 0.6, damping: 0.35, level: 0 };
// A loaded magazine: the column of cartridges pressed against the walls damps them hard.
const arMagBodyLoaded = { ...arMagBody, modes: 2, damping: 0.7 };
const arMagSpring = springWire(8, 1);
const MAG_HOUSING = {
    amount: 0.7, cavity: 0.5, ...mat('aluminum'), shape: 'plate', size: 18, thickness: 0.9, modes: 2, irregularity: 0.6, damping: 0.35,
    cavities: [{ length: 18, width: 6, depth: 2.2, q: 8, level: 1 }],
};
// The loaded magazine's walls and air space are damped by the stack inside.
const MAG_HOUSING_LOADED = { ...MAG_HOUSING, amount: 0.5, cavity: 0.25, damping: 0.7 };
const IN_LOADED_MAG = { housing: MAG_HOUSING_LOADED };
const IN_MAG = { housing: MAG_HOUSING };
/**
 * The stack reacting when the bolt makes room: the compressed magazine spring presses the whole
 * column up as one unit, but the top round only rises a millimetre or so before the feed lips
 * (or the bolt above it) catch it. So it's one firm, tight tick, not a rattle: the stack shifts as a
 * unit, the top round is caught crisply with no bounce, the spring gives a short, quiet zing, and
 * the magazine, damped by the rounds inside, barely rings.
 */
function magazineReaction(at, gainDb, topHits, topWhat) {
    return [
        hit('stack shifts up as one', at, gainDb - 7, 0.4, arCase, arNextRound, { scatter: 0.1, radius: 3, click: 0.6, sharp: 0.9 }, IN_LOADED_MAG),
        snap(topWhat, at + 0.0003, gainDb, { strength: 0.75, preload: 0, seat: 0, seatDelay: 1 }, arNextRound, topHits, IN_LOADED_MAG),
        hit('magazine spring takes up the load', at + 0.0002, gainDb - 12, 0.5, arMagSpring, arMagBodyLoaded, { scatter: 0.2, radius: 2, click: 0.2, sharp: 0.6 }, { coil: { level: 0.35, length: 3, dispersion: 0.4, decay: 0.035, brightness: 4500 }, ...IN_LOADED_MAG }),
        hit('magazine body rings', at + 0.0004, gainDb - 10, 0.6, arMagBodyLoaded, arCase, { scatter: 0.3, radius: 3, click: 0.1, sharp: 0.7 }, IN_LOADED_MAG),
    ];
}
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
// The carrier slides inside the upper's long bore, which continues into the buffer tube: a
// narrow air space (~2.6 cm) that gives the pipe-like hollow "shk" of the slides.
const AR_HOUSING = {
    amount: 0.65, cavity: 1, ...mat('aluminum'), shape: 'shell', size: 30, thickness: 3, modes: 0, irregularity: 0.8, damping: 0.6,
    cavities: [{ length: 18, width: 2.6, depth: 2.2, q: 9, level: 0.8 }, FCG_POCKET, MAG_WELL],
};
/** The carrier running home under the buffer spring, starting at t (round in the magazine). */
/** Elements that only exist when a round is fed and chambered. */
const FEED_ONLY = new Set([
    'bolt face catches the case head', 'case dragged over the feed lips', 'stripped case slides off the next case',
    'case rim snaps free of the feed lips', 'stack shifts up as one', 'magazine spring takes up the load',
    'next round snaps up against the bolt', 'magazine body rings',
    'next round rides along the carrier underside', 'bullet nose hits the feed ramp',
    'bullet slides up the feed ramp into the chamber', 'case slides into the chamber',
    'case shoulder seats in the chamber', 'extractor snaps over the rim',
]);
// The empty magazine's follower (plastic).
const arFollower = { ...mat('pom'), shape: 'bar', size: 6, thickness: 3, modes: 2, irregularity: 0.5, damping: 0.4, level: 0 };
function arForward(t, withChargingHandle, mag = 'loaded') {
    // The run is simulated from the reciprocating mass and the spring (see simulateRun): every
    // forward time and speed comes from it.
    const run = simulateRun(RECIP_MASS + (withChargingHandle ? CH_MASS : 0), mag);
    const vArrive = run.arrive;
    // Impact speeds were tuned against a 3.8 m/s landing; scale them to the simulated arrival.
    const V = (v) => (v * vArrive) / 3.8;
    // After-landing spacing (buffer weights, spring jolt...) in the reference run's units, scaled
    // to this run's length.
    const T = (s) => (s * run.total) / 0.055;
    // Lock-up timeline: the bolt face hits at TF, the turn takes ROT, the carrier lands at TL, and
    // everything after the landing keeps its spacing from it.
    const TF = t + run.total;
    const ROT = 0.004;
    const TL = TF + ROT + 0.0004;
    const post = (x) => TL + (T(x) - T(0.0578));
    const fwdAt = (x) => t + run.timeAt(x);
    const vAt = (x) => run.speedAt(x);
    // A contact that exists only between two positions on the way forward (x0 > x1).
    const fwdRub = (what, x0, x1, gainDb, fr, A, B, extra = {}) => {
        const at = fwdAt(x0);
        const duration = Math.max(0.003, fwdAt(x1) - at);
        return rub(what, at, gainDb, { duration, speed: ((x0 - x1) / 1000 / duration) * 1.15, profile: 'accelerate', ...fr }, A, B, extra);
    };
    // Well greased: a wet film smooths the micro-contacts (softer, duller, less grit).
    const OILY = { roughness: 1.5, grain: 0.15, periodicity: 0, contactWidth: 0.15 };
    const els = [
        // The buffer spring unloading: tension let go, coils surging along it inside the buffer
        // tube. It's preloaded, so it never gets near free length: it pushes hard the whole way
        // and its surge pitch (set by stiffness and mass, not length) stays the same.
        hit('buffer spring lets go', t, -3, V(3), arBufferSpring, arBufferTube, { scatter: 0.2, radius: 1, click: 0.4, sharp: 0.8 }, { coil: { level: 0.7, length: 9, dispersion: 0.5, decay: 0.12, brightness: 3000 }, housing: BUFFER_TUBE_HOUSING }),
        fwdRub('buffer spring extending in its tube', STROKE_MM - 1, 0, -11, { force: 3 * BUFFER_SPRING, roughness: 6, grain: 0.6, periodicity: 0, contactWidth: 0.2 }, arBufferSpring, bufferTubeSliding, { coil: { level: 0.6, length: 11, dispersion: 0.5, decay: 0.12, brightness: 2800 }, housing: BUFFER_TUBE_HOUSING }),
        hit('buffer weights shift', fwdAt(STROKE_MM - 2), -20, vAt(STROKE_MM - 2) + 1, steelBlock(1.5, 12), arBuffer, { scatter: 0.9, radius: 2 }),
        // The carrier's tail runs out of the buffer tube, then the carrier runs on the upper's rails.
        fwdRub('carrier tail running out of the buffer tube', STROKE_MM, 40, -4, { force: 4, roughness: 2, grain: 0.3, periodicity: 0, contactWidth: 0.1 }, carrierSliding, bufferTubeSliding),
        hit('carrier tail leaves the buffer tube', fwdAt(40), -14, vAt(40) * 0.15, arCarrier, arBufferTube, { scatter: 0.3, radius: 4 }),
        fwdRub('carrier rails in the upper', 40, 0, -4, { force: 6, ...OILY }, carrierSliding, arUpper),
        // It runs over the cocked hammer until ~35 mm (light: the hammer is held down by the sear).
        fwdRub('carrier running over the cocked hammer', STROKE_MM, 35, -16, { force: 3, ...OILY }, arHammer, carrierSliding, { housing: LOWER_HOUSING }),
        // The serrated stretch passes the spring-loaded forward-assist pawl: a ratchet run that
        // speeds up as the carrier does.
        fwdRub('forward-assist pawl over the serrations', 38, 8, -7, { force: 4, roughness: 200, grain: 2.5, periodicity: 1, contactWidth: 0.02 }, arFaPawl, carrierSliding),
        // Feeding (5.56 cartridge ≈ 57 mm long, rim ≈ 86 mm back): the bolt's lower lug catches the
        // top round's rim (86 mm), drags it over the feed lips, the rim snaps free (~55), the next
        // round snaps up (~52), the nose rides up the feed ramp (~50) and the case slides into the
        // chamber (45 to battery).
        // The steel bolt face catches the cartridge's brass head: a crisp click, solid behind it.
        hit('bolt face catches the case head', fwdAt(86), -2, vAt(86) * 0.5, arCase, arBolt, { scatter: 0.3, radius: 1.5, click: 0.8, sharp: 0.95 }),
        fwdRub('case dragged over the feed lips', 86, 55, -10, { force: 6, roughness: 15, grain: 0.3 }, arCase, arFeedLips, IN_LOADED_MAG),
        // The stripped case slides forward off the case beneath it: brass on brass.
        fwdRub('stripped case slides off the next case', 86, 58, -6, { force: 5, roughness: 4, grain: 0.2, contactWidth: 0.05 }, arCase, arNextRound, IN_LOADED_MAG),
        snap('case rim snaps free of the feed lips', fwdAt(55), -1, { strength: 0.7, preload: 0, seat: 0.3, seatDelay: 1 }, arCase, arFeedLips),
        // The stack jumps: the next round snaps up into the underside of the passing bolt/carrier,
        // then rides along it, held by the feed lips, until the carrier is home.
        ...magazineReaction(fwdAt(52), -2, arCarrier, 'next round snaps up against the bolt'),
        fwdRub('next round rides along the carrier underside', 50, 0, -10, { force: 3, roughness: 3, grain: 0.2, contactWidth: 0.05 }, arNextRound, carrierSliding, IN_LOADED_MAG),
        // Guided into the breech: the nose hits the feed ramp, the bullet slides up it into the
        // chamber (copper on steel), the case body slides along the chamber walls, and the case
        // seats just before the bolt face arrives.
        hit('bullet nose hits the feed ramp', fwdAt(50), -4, vAt(50) * 0.4, arBullet, arFeedRamp, { scatter: 0.3, radius: 1.5, click: 0.6 }),
        fwdRub('bullet slides up the feed ramp into the chamber', 50, 40, -8, { force: 6, roughness: 5, grain: 0.15, contactWidth: 0.03 }, arBullet, arFeedRamp),
        // The bolt drives the loaded round into the steel chamber: brass sliding on steel, rising as
        // it goes deeper, then the shoulder seats with a solid, short tock just as the bolt arrives.
        fwdRub('case slides into the chamber', 45, 3, -2, { force: 8, roughness: 5, grain: 0.15, contactWidth: 0.02 }, arCase, arChamber),
        hit('case shoulder seats in the chamber', TF - 0.0006, 1, vAt(10) * 0.35, arCase, arChamber, { scatter: 0.2, radius: 2, click: 0.8, sharp: 0.95 }),
        // The gas tube enters the carrier key over the last ~20 mm.
        hit('gas tube slides into the carrier key', fwdAt(18), -9, vAt(18) * 0.2, arGasTube, gasKey, { scatter: 0.3, radius: 1.5 }),
        // Lock-up, staged as the mechanism does it (stretched to ~4 ms so the turn is heard as its own
        // rotating-and-sliding sound; at full spring speed it's 1-2 ms):
        //  1. the bolt nose and lugs slide axially in between the extension's lugs,
        //  2. the bolt face hits the barrel extension,
        //  3. the carrier keeps going: its cam track drives the cam pin, turning the bolt ~22.5°, and
        //     the locking lugs slide round across the extension lug faces under load,
        //  4. the lugs bottom at the end of the turn,
        //  5. the carrier lands on the bolt when its cam travel runs out.
        rub('bolt lugs slide into the extension', fwdAt(12), -4, { force: 12, duration: Math.max(0.0022, TF - fwdAt(12)), speed: vAt(11), profile: 'steady', roughness: 8, grain: 0.1, periodicity: 0.2, contactWidth: 0.005 }, arBolt, arBreech, { housing: { amount: 0.3, cavity: 0.25 } }),
        hit('bolt face hits the barrel extension', TF, 0, V(4.5), arBolt, arBreech, { scatter: 0.3, radius: 4, click: 0.8, sharp: 0.8 }, { housing: { amount: 0.3, cavity: 0.25 } }),
        rub('cam pin rides the cam track', TF + 0.0002, -4, { force: 18, duration: ROT, speed: 1.2, profile: 'steady', roughness: 10, grain: 0.1, periodicity: 0.2, contactWidth: 0.02 }, arCamPin, carrierSliding, { housing: { amount: 0.3, cavity: 0.25 } }),
        // The lugs turning across the extension's lug faces: steel on steel under the spring's load,
        // a fine machined texture read out as they slide round (~3.7 mm of arc).
        rub('locking lugs rotate across the extension lugs', TF + 0.0003, 2, { force: 30, duration: ROT, speed: 0.9, profile: 'steady', roughness: 12, grain: 0.05, periodicity: 0.3, contactWidth: 0.015 }, arBolt, arBreech, { housing: { amount: 0.3, cavity: 0.25 } }),
        hit('bolt lugs rotate home', TF + ROT + 0.0002, -3, V(1.5), arBolt, arBreech, { scatter: 0.3, radius: 3, click: 0.8, sharp: 0.8 }, { housing: { amount: 0.3, cavity: 0.25 } }),
        // Grease squeezed out from between the faces as they meet: a short, wet smack.
        { what: 'grease squeezed out of the lug faces', at: TF, gainDb: -12, sound: { kind: 'air', freq: 1800, q: 0.9, attackMs: 0.15, decayMs: 2.5 } },
        { what: 'grease squeezed out as the carrier lands', at: TL, gainDb: -5, sound: { kind: 'air', freq: 1300, q: 0.8, attackMs: 0.15, decayMs: 3.5 } },
        hit('carrier slams onto the bolt', TL, 8, V(3.8), arCarrierGroup, arBarrel, { scatter: 0.5, radius: 6, click: 0.9, sharp: 0.8 }, { housing: { amount: 0.3, cavity: 0.25 } }),
        hit('lugs seat in the barrel extension', post(0.0579), 6, V(3.8), arBarrel, arCarrier, { scatter: 0.3, radius: 4, click: 0.8, sharp: 0.8 }, 
        // The receiver takes this blow too, but the lock-up is metal on metal: keep the receiver's
        // air-space "pop" small so it doesn't turn the clank into a plunger in a tube.
        { housing: { amount: 0.5, cavity: 0.25 } }),
        // ...and the rifle as a whole flexes from it: a hard-edged, low metallic "chunk" (not a sine thump).
        hit('rifle body takes the blow', post(0.058), 5, V(3.8), arRifleBody, arCarrier, { scatter: 0.2, radius: 3, click: 0.3, sharp: 0.85 }),
        // The lower receiver takes the blow through the takedown pins: its own ribbed aluminium ring.
        hit('lower receiver rings', post(0.0582), 2, V(2.2), arLower, arUpper, { scatter: 0.4, radius: 3, click: 0.3, sharp: 0.8 }, { housing: LOWER_HOUSING }),
        // The fire-control group is jolted: hammer and trigger shift on their pins and their
        // springs ting.
        hit('hammer and trigger jolt on their pins', post(0.0584), -3, V(1.0), arHammer, arLower, { scatter: 0.7, radius: 1.5, click: 0.5 }, { coil: { level: 0.5, length: 2, dispersion: 0.35, decay: 0.12, brightness: 6000 }, flex: { amount: 0.3, freq: 180, decay: 0.04, rattle: 0.5, wobble: 0, tone: 0 }, housing: LOWER_HOUSING }),
        // In battery the buffer spring is still well compressed (preload), pressing the buffer
        // against the carrier. Jolted by the stop, it rings tight and damped in its tube: a short,
        // tense zing, not a loose sproing. The buffer's sliding weights slam forward a few ms later.
        hit('buffer spring jolts, still loaded', post(0.0585), -5, V(1.5), arBufferSpring, arBufferTube, { scatter: 0.2, radius: 1, click: 0.05, sharp: 0.4 }, { coil: { level: 0.6, length: 11, dispersion: 0.45, decay: 0.12, brightness: 3000 }, housing: BUFFER_TUBE_HOUSING }),
        // The preloaded spring pins the carrier into battery: only a tiny rebound.
        hit('carrier rebounds and is caught', post(0.0592), -16, V(0.4), arCarrier, arBolt, { scatter: 0.4, radius: 3, click: 0.6 }),
        hit('buffer weights slam forward', post(0.0615), -7, V(1.6), steelBlock(1.5, 12), arBuffer, { scatter: 0.6, radius: 3, click: 0.6 }, { housing: BUFFER_TUBE_HOUSING }),
        snap('extractor snaps over the rim', TF + 0.001, -3, { strength: 0.8, preload: 0, seat: 0.3, seatDelay: 1 }, arExtractor, arCase),
    ];
    if (withChargingHandle) {
        // Let go, the charging handle rides the whole stroke home with the carrier in its channel,
        // the gas key in its slot, and slams into its own front stop.
        els.push(fwdRub('charging handle running home in its channel', STROKE_MM, 0, -6, { force: 3, ...OILY }, arChargingHandle, arUpper));
        els.push(fwdRub('gas key riding in the handle slot', STROKE_MM, 0, -13, { force: 2, ...OILY }, gasKey, arChargingHandle));
        // Let go, the charging handle rides home with the carrier and slams into its own front stop.
        els.push(hit('charging handle slams into its front stop', post(0.0581), 0, V(3.8), arChargingHandle, arUpper, { scatter: 0.4, radius: 3, click: 0.7 }));
        els.push(snap('charging handle latch catches', post(0.06), -9, { strength: 0.7, preload: 0, seat: 0.4, seatDelay: 2 }, arChLatch, arUpper));
        // Free of the hand, it rattles in its play on the gas key and in its channel as it settles.
        els.push(...handleRattle(post(0.0581), V(1.4), -1, 5, 0.008));
    }
    if (mag === 'loaded')
        return els;
    // Without a round to feed: none of the feeding, stack or chambering contacts.
    const kept = els.filter((e) => !FEED_ONLY.has(e.what));
    if (mag === 'empty') {
        // The empty magazine's plastic follower presses up under the bolt as it passes over it.
        kept.push(fwdRub('bolt rides over the empty follower', 86, 30, -10, { force: 4, roughness: 3, grain: 0.3, contactWidth: 0.1 }, arFollower, arBolt, IN_MAG));
    }
    return kept;
}
const CH_BACK = 0.0;
// The pull, laid out by travel. The hand's speed follows a swell (accelerate, then brake),
// so position along the stroke is x(t) = STROKE/2 · (1 − cos(π t / T)). Each part comes in
// and out at its own point of travel, at the speed the stroke has there.
const PULL_MM = STROKE_MM;
const PULL_T = 0.26; // an aggressive yank
// The hand snatches the handle and is still moving fast when it hits the rear stop: position
// x(u) = S·(1 − cos(Kπu)) / (1 − cos(Kπ)), K = 0.75, peaks in speed at 2/3 of the stroke and
// arrives at ~70% of that.
const PULL_K = 0.75;
// Hits driven by the hand's speed soften on a slower pull (impact speed ∝ hand speed; level ∝ √
// is a gentler, more natural-sounding scaling than linear). Spring-driven snaps don't change.
const HAND = Math.sqrt(0.16 / PULL_T);
const CH_END = CH_BACK + PULL_T;
const LET_GO = CH_END + 0.08; // let go ~80 ms after the handle bottoms out
const tAt = (mm) => CH_BACK + (PULL_T * Math.acos(1 - (Math.min(mm, PULL_MM) / PULL_MM) * (1 - Math.cos(PULL_K * Math.PI)))) / (PULL_K * Math.PI);
const SLIDE_BED_DB = 10;
/** A rubbing contact that exists only between two points of the pull's travel. */
function travelRub(what, mm0, mm1, gainDb, f, A, B, extra = {}) {
    const at = tAt(mm0);
    const duration = Math.max(0.012, tAt(mm1) - at);
    const speed = ((mm1 - mm0) / 1000 / duration) * 1.2;
    const mid = (mm0 + mm1) / 2;
    const profile = mid < 30 ? 'accelerate' : 'steady'; // a yank: no easing into the rear stop
    // Every element is normalised to the same peak before its gain; a continuous slide at the
    // same gain as a click carries far more energy and would bury it. Slides sit 10 dB down so
    // the events at each point of travel read on top of them.
    return rub(what, at, gainDb - SLIDE_BED_DB, { duration, speed, profile, ...f }, A, B, extra);
}
// Oiled contact textures, each pair its own: anodised aluminium, phosphated steel, brass.
const OIL_ALU = { roughness: 3, grain: 0.2, periodicity: 0, contactWidth: 0.08 };
const OIL_STEEL = { roughness: 2, grain: 0.12, periodicity: 0, contactWidth: 0.1 }; // greased
const OIL_TUBE = { roughness: 2, grain: 0.3, periodicity: 0, contactWidth: 0.1 };
// Ejection-port dust cover: a thin spring-loaded steel flap that snaps open and slaps the upper.
const arDustCover = { ...mat('steel'), shape: 'plate', size: 9, thickness: 0.8, modes: 2, irregularity: 0.6, damping: 0.35, level: 0 };
const MAG_ID = { loaded: '', empty: '-empty-mag', none: '-no-mag' };
const MAG_TITLE = { loaded: ' (loaded magazine)', empty: ' (empty magazine)', none: ' (no magazine)' };
/** Pull: what the magazine does as the bolt passes over it. */
function pullMagazine(mag) {
    if (mag === 'loaded') {
        return [
            travelRub('bolt riding over the top round', 30, 86, -16, { force: 5, roughness: 2, grain: 0.2, contactWidth: 0.05 }, arCase, arBolt, IN_LOADED_MAG),
            // The bolt clears the rim: the stack jumps up against the feed lips.
            ...magazineReaction(tAt(88) + 0.002, -4, arFeedLips, 'top round snaps up against the feed lips'),
        ];
    }
    if (mag === 'empty') {
        return [
            travelRub('bolt riding over the empty follower', 30, 86, -16, { force: 4, roughness: 3, grain: 0.3, contactWidth: 0.1 }, arFollower, arBolt, IN_MAG),
            // The bolt clears the follower: the magazine spring snaps it up, and its tab lifts the
            // bolt catch, which snaps up into the bolt's path.
            hit('follower pops up', tAt(88) + 0.002, -5, 1.2, arFollower, arMagBody, { scatter: 0.3, radius: 2, click: 0.6 }, { coil: { level: 0.6, length: 4, dispersion: 0.45, decay: 0.08, brightness: 5000 }, ...IN_MAG }),
            hit('empty magazine body rings', tAt(88) + 0.0026, -6, 1.0, arMagBody, arFollower, { scatter: 0.5, radius: 3, click: 0.2, sharp: 0.7 }, IN_MAG),
            snap('bolt catch snaps up', tAt(88) + 0.004, -3, { strength: 0.8, preload: 0, seat: 0.4, seatDelay: 1.5 }, arBoltCatch, arLower, { housing: LOWER_HOUSING }),
        ];
    }
    return [];
}
/** Charge with an empty magazine: let go, and the carrier is caught a few mm forward by the raised
 *  bolt catch (it locks open). The charging handle stays back until the operator pushes it home. */
function caughtOnCatch(t) {
    return [
        hit('buffer spring lets go', t, -3, 3, arBufferSpring, arBufferTube, { scatter: 0.2, radius: 1, click: 0.4, sharp: 0.8 }, { coil: { level: 0.7, length: 9, dispersion: 0.5, decay: 0.12, brightness: 3000 }, housing: BUFFER_TUBE_HOUSING }),
        rub('carrier jumps forward a few mm', t + 0.001, -12, { force: 6, duration: 0.008, speed: 1.2, profile: 'accelerate', roughness: 3, grain: 0.15, contactWidth: 0.08 }, carrierSliding, arUpper),
        hit('bolt face slams into the raised bolt catch', t + 0.009, 4, 1.4, arBolt, arBoltCatch, { scatter: 0.4, radius: 2, click: 0.9, sharp: 0.95 }, { housing: LOWER_HOUSING }),
        hit('carrier group stops on the bolt', t + 0.0094, 0, 1.4, arCarrierGroup, arBolt, { scatter: 0.4, radius: 3, click: 0.7, sharp: 0.9 }),
        hit('buffer spring jolts, still loaded', t + 0.0096, -6, 1.2, arBufferSpring, arBufferTube, { scatter: 0.2, radius: 1, click: 0.05, sharp: 0.4 }, { coil: { level: 0.6, length: 11, dispersion: 0.45, decay: 0.12, brightness: 3000 }, housing: BUFFER_TUBE_HOUSING }),
        hit('buffer weights slam forward', t + 0.012, -8, 1.2, steelBlock(1.5, 12), arBuffer, { scatter: 0.6, radius: 3, click: 0.6 }, { housing: BUFFER_TUBE_HOUSING }),
        // A moment later the operator pushes the charging handle home; it latches.
        rub('operator pushes the charging handle home', t + 0.25, -22, { force: 2, duration: 0.1, speed: 0.8, profile: 'swell', roughness: 2, grain: 0.15, contactWidth: 0.12 }, arChargingHandle, arUpper),
        snap('charging handle latch catches', t + 0.37, -6, { strength: 0.7, preload: 0, seat: 0.4, seatDelay: 2 }, arChLatch, arUpper),
    ];
}
function makeArCharge(mag) {
    return {
        id: 'ar15-charge' + MAG_ID[mag],
        title: 'AR-15: charging handle pulled back and released' + MAG_TITLE[mag],
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
                elements: [hit('handle catches the gas key', tAt(2), -9, 0.5 * HAND, gasKey, arChargingHandle, { scatter: 0.3, radius: 2 })],
            },
            {
                name: 'dust-cover',
                description: '~4 mm: the carrier trips the ejection-port dust cover, which springs open and slaps the side of the upper.',
                elements: [
                    hit('dust cover snaps open', tAt(4) + 0.006, -5, 2.5, arDustCover, arUpper, { scatter: 0.4, radius: 6, click: 0.7 }, { flex: { amount: 0.3, freq: 70, decay: 0.05, rattle: 0.5, wobble: 0, tone: 0 }, coil: { level: 0.15, length: 2, dispersion: 0.3, decay: 0.04, brightness: 5000 } }),
                ],
            },
            {
                name: 'unlock',
                description: '2-11.5 mm: the carrier moves alone through its cam travel, the cam pin turns the bolt out of its lugs (~10 mm), then the carrier catches the bolt and drags it along (11.5 mm).',
                elements: [
                    travelRub('cam pin turns the bolt', 2, 11.5, -12, { force: 8, roughness: 10, grain: 0.2, contactWidth: 0.02 }, arCamPin, carrierSliding),
                    hit('bolt lugs rotate free', tAt(10), -10, 0.6 * HAND, arBolt, arBarrelExt, { scatter: 0.3, radius: 1.5 }),
                    snap('bolt rotation stops on the cam pin', tAt(10.5), -9, { strength: 0.5, preload: 0, seat: 0.2, seatDelay: 1 }, arBolt, arCamPin),
                    hit('carrier picks up the bolt', tAt(11.5), -6, 0.9 * HAND, arCarrier, arBolt, { scatter: 0.4, radius: 3, click: 0.7 }),
                ],
            },
            {
                name: 'pull-back',
                description: 'The slides, each over its own stretch of travel: charging handle in its channel (0-94 mm), gas key in the handle slot (2-94), carrier on the upper rails (2-40), carrier tail entering and running in the buffer tube (40-94), bolt tail in the carrier bore (11.5-94). Oiled, so light and slick.',
                elements: [
                    travelRub('charging handle in its channel', 0, STROKE_MM, -11, { force: 4, ...OIL_ALU }, arChargingHandle, arUpper),
                    travelRub('gas key riding in the handle slot', 2, STROKE_MM, -15, { force: 3, ...OIL_STEEL }, gasKey, arChargingHandle),
                    travelRub('carrier on the upper rails', 2, 40, -9, { force: 6, ...OIL_STEEL }, carrierSliding, arUpper),
                    hit('carrier tail enters the buffer tube', tAt(40), -16, 0.5 * HAND, arCarrier, arBufferTube, { scatter: 0.3, radius: 4 }),
                    travelRub('carrier tail running in the buffer tube', 40, STROKE_MM, -11, { force: 4, ...OIL_TUBE }, carrierSliding, bufferTubeSliding),
                    travelRub('bolt tail riding in the carrier bore', 11.5, STROKE_MM, -20, { force: 2, ...OIL_STEEL }, arBolt, carrierSliding),
                    // The serrated stretch of the carrier passes the spring-loaded forward-assist pawl:
                    // a run of small ratchet clicks. (The slide bed offset doesn't apply to clicks.)
                    travelRub('forward-assist pawl over the serrations', 8, 38, 2, { force: 4, roughness: 200, grain: 2.5, periodicity: 1, contactWidth: 0.02 }, arFaPawl, carrierSliding),
                ],
            },
            {
                name: 'hammer-cock',
                description: '35-60 mm: with the hammer down, the carrier rides it down against its spring; at 60 mm the trigger sear snaps into the hammer notch; the carrier then rides over the cocked hammer. (Leave this track out if the hammer was already cocked.)',
                elements: [
                    hit('carrier meets the hammer', tAt(35), -10, 0.6 * HAND, arCarrier, arHammer, { scatter: 0.3, radius: 2 }),
                    travelRub('carrier pushes the hammer down', 35, 60, -8, { force: 12, roughness: 4, grain: 0.15, contactWidth: 0.05 }, arHammer, carrierSliding, { coil: { level: 0.45, length: 2.5, dispersion: 0.35, decay: 0.08, brightness: 5000 }, housing: LOWER_HOUSING }),
                    // The hammer spring's legs bear on the trigger pin: loading it is a faint wiry tension.
                    travelRub('hammer spring loading', 35, 60, -14, { force: 4, roughness: 3, grain: 0.3, contactWidth: 0.1 }, arHammerSpring, arLower, { coil: { level: 0.5, length: 2, dispersion: 0.4, decay: 0.08, brightness: 6000 }, housing: LOWER_HOUSING }),
                    // Two clicks: the trigger's sear nose snaps into the hammer notch as the hammer is
                    // pushed past it, then the hammer rises back onto the sear once the carrier's tail
                    // stops pressing it down.
                    snap('sear snaps into the hammer notch', tAt(60), 0, { strength: 1, preload: 0, seat: 0.6, seatDelay: 1.2 }, arTriggerSear, arHammer, { coil: { level: 0.3, length: 1.5, dispersion: 0.3, decay: 0.05, brightness: 7000 }, housing: LOWER_HOUSING }),
                    snap('hammer settles onto the sear', tAt(70), -4, { strength: 0.7, preload: 0, seat: 0.3, seatDelay: 1 }, arHammer, arLower, { housing: LOWER_HOUSING }),
                    travelRub('carrier riding over the cocked hammer', 60, STROKE_MM, -20, { force: 3, ...OIL_STEEL }, arHammer, carrierSliding),
                ],
            },
            {
                name: 'magazine',
                description: '30-86 mm: the bolt rides over the top round in the magazine; once it clears the rim (~88 mm), the magazine spring pops the round up against the feed lips.',
                elements: pullMagazine(mag),
            },
            {
                name: 'buffer-spring-compress',
                description: 'Preloaded buffer spring loading further inside the buffer tube (inside the stock): pushing back hard from the start, tension climbing to the rear, singing in the tube. The buffer weights lag at the start and settle at the stop.',
                elements: [
                    // Tension building from an already-preloaded spring: it pushes back hard from the first
                    // millimetre and the force climbs ~1.5x by the rear (louder, more pressure on the coils).
                    // Its surge pitch stays put (a linear spring's surge depends on stiffness and mass, not
                    // length). Smooth: coils slide, they don't tick.
                    travelRub('buffer spring loading (first third)', 2, 32, -7 + 10 * Math.log10(BUFFER_SPRING), { force: 2.7 * BUFFER_SPRING, roughness: 6, grain: 0.6, periodicity: 0, contactWidth: 0.2 }, arBufferSpring, bufferTubeSliding, { coil: { level: 0.5, length: 11, dispersion: 0.5, decay: 0.12, brightness: 2800 }, housing: BUFFER_TUBE_HOUSING }),
                    travelRub('buffer spring loading (second third)', 32, 62, -6.5 + 10 * Math.log10(BUFFER_SPRING), { force: 3.4 * BUFFER_SPRING, roughness: 6, grain: 0.6, periodicity: 0, contactWidth: 0.2 }, arBufferSpring, bufferTubeSliding, { coil: { level: 0.52, length: 11, dispersion: 0.5, decay: 0.12, brightness: 2900 }, housing: BUFFER_TUBE_HOUSING }),
                    travelRub('buffer spring loading (last third)', 62, STROKE_MM, -6 + 10 * Math.log10(BUFFER_SPRING), { force: 4.1 * BUFFER_SPRING, roughness: 6, grain: 0.6, periodicity: 0, contactWidth: 0.2 }, arBufferSpring, bufferTubeSliding, { coil: { level: 0.55, length: 11, dispersion: 0.5, decay: 0.12, brightness: 3000 }, housing: BUFFER_TUBE_HOUSING }),
                    hit('buffer weights lag', tAt(3), -22, 0.6, steelBlock(1.5, 12), arBuffer, { scatter: 0.9, radius: 2 }),
                    hit('buffer weights settle', CH_END + 0.004, -12, 0.8, steelBlock(1.5, 12), arBuffer, { scatter: 0.9, radius: 2 }, { housing: BUFFER_TUBE_HOUSING }),
                ],
            },
            {
                name: 'rear-stop',
                description: 'Full travel (3.7" ≈ 94 mm): the charging handle bottoms out; the bolt shifts inside the carrier.',
                elements: [
                    hit('handle bottoms out', CH_END, -3, 2.0 * HAND, arChargingHandle, arUpper, { scatter: 0.4, radius: 3 }),
                    // Still in the hand, so only a short, damped rattle as the carrier's gas key knocks in the slot.
                    ...handleRattle(CH_END, 0.7 * HAND, -6, 3, 0.006),
                    hit('bolt shifts in the carrier', CH_END + 0.003, -14, 0.5 * HAND, arBolt, arCarrier, { scatter: 0.4, radius: 2 }),
                ],
            },
            {
                name: 'release-forward',
                description: 'Let go: buffer spring slams the carrier home, stripping and chambering a round, and the bolt locks up. The charging handle rides home and latches.',
                elements: mag === 'empty' ? caughtOnCatch(LET_GO) : arForward(LET_GO, true, mag),
            },
        ],
    };
}
export const AR15_CHARGE = makeArCharge('loaded');
export const AR15_CHARGE_EMPTY = makeArCharge('empty');
export const AR15_CHARGE_NO_MAG = makeArCharge('none');
const PRESS = 0.0;
const CATCH_DROPS = 0.07;
function makeArBoltRelease(mag) {
    return {
        id: 'ar15-bolt-release' + MAG_ID[mag],
        title: 'AR-15: bolt catch pressed, bolt slams home' + MAG_TITLE[mag],
        room: 0.04,
        roomSize: 0.35,
        housing: AR_HOUSING,
        tracks: [
            {
                name: 'bolt-catch',
                description: 'Thumb presses the bolt-catch paddle; the catch drops off the bolt face.',
                elements: [
                    // With an empty magazine the follower is pushing the catch up: a firmer, longer press.
                    snap('catch pivots down off the bolt', PRESS, -6, { strength: mag === 'empty' ? 1 : 0.8, preload: (CATCH_DROPS - PRESS) * 1000, creak: mag === 'empty' ? 0.3 : 0.1, seat: 0.5, seatDelay: 3 }, arBoltCatch, arBolt),
                ],
            },
            {
                name: 'release-forward',
                description: mag === 'loaded'
                    ? 'Buffer spring slams the carrier home, stripping and chambering a round; the bolt locks up.'
                    : mag === 'empty'
                        ? 'Buffer spring slams the carrier home over the empty follower; nothing to feed; the bolt locks up.'
                        : 'Buffer spring slams the carrier home with no magazine; nothing to feed; the bolt locks up.',
                elements: arForward(CATCH_DROPS + 0.001, false, mag),
            },
            {
                name: 'catch-reset',
                description: 'The bolt catch springs back up once the carrier is past.',
                elements: [snap('catch spring resets', CATCH_DROPS + 0.02, -16, { strength: 0.4, preload: 0, seat: 0.2 }, arBoltCatch, arUpper)],
            },
        ],
    };
}
export const AR15_BOLT_RELEASE = makeArBoltRelease('loaded');
export const AR15_BOLT_RELEASE_EMPTY = makeArBoltRelease('empty');
export const AR15_BOLT_RELEASE_NO_MAG = makeArBoltRelease('none');
// ---------- AR-15 magazine in / out ----------
// The magazine well is part of the aluminium lower receiver; the mag catch is a spring-loaded
// steel bar through the lower, pushed in by the release button on the right side.
const arMagCatch = { ...mat('steel'), shape: 'bar', size: 2.5, thickness: 3, modes: 1, irregularity: 0.5, damping: 0.45, level: 0 };
const arMagRelease = { ...mat('steel'), shape: 'block', size: 1.5, thickness: 8, modes: 0, irregularity: 0.4, damping: 0.6, level: 0 };
// Billet lower: the mag well is thick, solid, machined aluminium: dense, dull, hard, barely rings.
const arMagWell = { ...mat('aluminum'), shape: 'block', size: 9, thickness: 60, modes: 1, irregularity: 0.4, damping: 0.65, level: 0 };
/**
 * A used magazine's folded sheet-metal shell (~0.9 mm aluminium, a little dented), as it meets the
 * billet well: thin, tinny and free to buzz. The rounds inside only partly damp it.
 */
const magShell = (fill) => ({ ...mat('aluminum'), shape: 'plate', size: 18, thickness: 0.9, modes: 5, irregularity: 0.85, damping: fill === 'loaded' ? 0.4 : 0.25, level: 0 });
/** A knock or rub excites the small side panel it lands on (~6 x 2.2 cm between the folds), not the
 *  whole box: from ~750 Hz up, the tinny range of thin sheet metal. */
// Dense noise bands only (the tinny edge), no clear pitch, and damped: a struck or rubbed
// panel clatters briefly instead of singing like a tuning fork.
const magPanel = (fill) => ({ ...magShell(fill), size: 6, modes: 0, damping: fill === 'loaded' ? 0.65 : 0.55 });
/** Sheet-metal edges ticking off the billet walls: heard directly, barely through the receiver. */
const SHEET_EDGE = { housing: { amount: 0.2, cavity: 0.15 } };
/** The thin sheet buzzing against the billet wall while it moves (loose fit, worn finish). */
const SHEET_BUZZ = { flex: { amount: 0.45, freq: 150, decay: 0.08, rattle: 0.75, wobble: 0, tone: 0 }, housing: { amount: 0.35, cavity: 0.2 } };
/** A brief rattle when the magazine bottoms or drops free: held by the catch (or the hand), it dies fast. */
const SHEET_RATTLE = { flex: { amount: 0.35, freq: 150, decay: 0.025, rattle: 0.6, wobble: 0, tone: 0 }, housing: { amount: 0.35, cavity: 0.2 } };
/**
 * The air inside the magazine. Its body is a sheet-metal box ~16 x 5.8 x 2 cm inside, closed by the
 * floorplate at the bottom and the follower at the top, so it is a small resonator in its own
 * right: its longest dimension gives ~1.07 kHz and its overtones ~2.1 and ~3.2 kHz (c / 2L, closed
 * at both ends), the width ~2.9 kHz. The shell is its wall, so every knock, rub or stop on the
 * magazine sounds in it as well as in the mag well around it.
 *   Empty: only the spring's coils are inside, so the box is hollow and rings for ~10 ms, a can-
 *   like "tonk" under each knock (Q ~22: thin but stiff sheet walls, only small gaps at the floorplate and feed lips).
 *   Loaded: the stack of rounds fills it and leaves only small gaps: a weak, dull trace.
 */
const magAir = (fill) => fill === 'empty'
    ? { length: 16, width: 5.8, depth: 2, q: 22, level: 2 }
    : { length: 16, width: 5.8, depth: 2, q: 5, level: 0.3 };
/** A magazine contact's extras, with the magazine's own air added to the mag well's. */
function withMagAir(extra, fill) {
    const h = extra.housing ?? {};
    return {
        ...extra,
        housing: {
            ...h,
            amount: Math.max(h.amount ?? 0, fill === 'empty' ? 0.6 : 0.3),
            cavity: Math.max(h.cavity ?? 0, fill === 'empty' ? 0.9 : 0.3),
            cavities: [...(LOWER_HOUSING.cavities ?? []), magAir(fill)],
        },
    };
}
/**
 * Wear from years of reloads: the anodising and finish on the well and the magazine's sides are
 * polished smooth where they rub, burrs and sharp edges are rounded off, and the rubbing happens
 * over broad worn patches. The slide is a smooth, dull hiss instead of a scratch (a fine,
 * shallow texture read over a wide contact averages out the highs), and knocks are blunter.
 * The fit is looser for it, so the rattle stays.
 */
const WORN_SLIDE = { roughness: 3, grain: 3, periodicity: 0, contactWidth: 0.2 };
const WORN_KNOCK = { scatter: 0.8, radius: 2.5, click: 0.6, sharp: 0.35 };
function makeArMagIn(fill) {
    const body = magShell(fill);
    const panel = magPanel(fill);
    const own = fill === 'loaded' ? IN_LOADED_MAG : IN_MAG;
    // A loaded 30-rd mag is ~0.5 kg, an empty one ~0.12 kg: it goes in heavier and rings less.
    const v = fill === 'loaded' ? 1 : 0.8;
    const els = [
        hit('magazine top enters the mag well', 0, -8, 0.5 * v, panel, arMagWell, { scatter: 0.4, radius: 3, click: 0.5 }),
        // The well isn't sealed (gaps all round the magazine), so this air column is leaky: a soft,
        // breathy sweep rather than a whistle.
        // The air column between the magazine's top and the open top of the well shrinks as it goes in
        // (~8 cm -> ~1.2 cm): its quarter-wave resonance rises, ~1 kHz -> ~7 kHz, like filling a bottle.
        // The hand accelerates the magazine the whole way up (~0 -> ~1.5 m/s over 8 cm in ~105 ms),
        // so the rise speeds up too.
        { what: 'air column in the mag well shrinks', at: 0.002, gainDb: -13, sound: { kind: 'tube', fromCm: 8, toCm: 1.2, durationMs: 105, motion: 'accelerate', q: 2.5 } },
        { what: 'air squeezed out as it seats', at: 0.107, gainDb: -26, sound: { kind: 'air', freq: 3200, q: 1.4, attackMs: 0.3, decayMs: 4 } },
        rub('magazine slides up the mag well', 0.002, -11, { force: 2.5, duration: 0.105, speed: 0.9, profile: 'accelerate', ...WORN_SLIDE }, panel, arMagWell, withMagAir(SHEET_BUZZ, fill)),
        // The mag's side pushes the spring-loaded catch aside; it rides along the side panel until the hole.
        rub('mag catch rides along the magazine side', 0.06, -12, { force: 6, duration: 0.04, speed: 0.9, profile: 'accelerate', roughness: 1.5, grain: 3, contactWidth: 0.15 }, arMagCatch, panel, { coil: { level: 0.25, length: 2, dispersion: 0.35, decay: 0.05, brightness: 5000 } }),
        // Loose and worn: the sheet-metal shell clatters against the billet walls on the way up. The
        // knocks are spread evenly along the travel, so as the magazine speeds up they come closer
        // together and land harder.
        ...[0.06, 0.16, 0.27, 0.38, 0.5, 0.62, 0.72].map((x, i) => hit('magazine clatters against the well', 0.002 + 0.105 * Math.sqrt(x), -17 + i * 1.2, (0.15 + i * 0.035) * v, panel, arMagWell, WORN_KNOCK, withMagAir(SHEET_EDGE, fill))),
        // The catch: spring-loaded, it has been riding along the magazine's side. When the hole in the
        // side panel lines up, its spring throws it sideways into the hole and its shoulder strikes the
        // sheet metal round the hole: hard steel on a thin aluminium panel, a sharp tinny click, with a
        // trace of its spring. The magazine then stops at the top of its travel and settles back down
        // onto the catch.
        hit('mag catch clicks into the hole in the magazine', 0.101, 6, 1.4, arMagCatch, panel, { scatter: 0.1, radius: 0.6, click: 0.9, sharp: 1 }, withMagAir({ coil: { level: 0.15, length: 1.5, dispersion: 0.3, decay: 0.025, brightness: 7000 }, ...SHEET_EDGE }, fill)),
        // Still accelerating, the magazine slams into its stop at the top of the well: a hard stop.
        // Struck at its top edge, with the hand gripping it and the catch now in its hole, the shell
        // can't ring as a whole: the panel at the stop takes the hit.
        hit('magazine bottoms in the well', 0.109, -5, 1.5 * v, panel, arMagWell, { scatter: 0.3, radius: 3, click: 0.8, sharp: 0.9 }, withMagAir(SHEET_RATTLE, fill)),
        hit('magazine settles back onto the catch', 0.124, -15, 0.3, body, arMagCatch, { scatter: 0.3, radius: 2, click: 0.5 }),
        hit('magazine body rings', 0.1095, fill === 'loaded' ? -17 : -12, 0.6, body, arMagWell, { scatter: 0.3, radius: 3, click: 0.1, sharp: 0.7 }, own),
    ];
    if (fill === 'loaded') {
        // With the bolt closed, the top round presses up against the bolt carrier's underside and the
        // stack gives a little.
        // The round is pinned between the feed lips and the carrier under the magazine spring, and the
        // carrier is held in battery by the buffer spring: a light scuff, too gentle to ring either
        // (as a free bar the carrier would ping at ~1.75 kHz).
        els.push(rub('top round presses against the bolt carrier', 0.103, -14, { force: 6, duration: 0.012, speed: 0.3, profile: 'decelerate', roughness: 3, grain: 0.2, contactWidth: 0.05 }, { ...arNextRound, modes: 0, damping: 0.95 }, { ...carrierSliding, modes: 0, damping: 0.8 }, IN_LOADED_MAG));
        els.push(hit('stack gives against the spring', 0.108, -16, 0.4, arCase, arNextRound, { scatter: 0.1, radius: 3, click: 0.5 }, IN_LOADED_MAG));
    }
    return {
        id: 'ar15-mag-in' + (fill === 'empty' ? '-empty' : ''),
        title: `AR-15: ${fill} magazine inserted, catch locks`,
        room: 0.04,
        roomSize: 0.35,
        housing: LOWER_HOUSING,
        tracks: [
            { name: 'insert', description: 'Magazine enters and slides up the mag well; the catch rides along its side.', elements: els.filter((e) => /enters|slides up|rides along|top round presses|column|knocks|clatters/.test(e.what)) },
            { name: 'catch-locks', description: 'The mag catch clicks into the hole in the magazine; it bottoms in the well.', elements: els.filter((e) => /clicks into|bottoms|body rings$|stack gives|squeezed|settles back/.test(e.what)) },
        ],
    };
}
/** Time for the hand to pull the magazine clear of the well, s. */
const MAG_PULL_T = 0.055;
function makeArMagOut(fill) {
    const body = magShell(fill);
    const panel = magPanel(fill);
    const own = fill === 'loaded' ? IN_LOADED_MAG : IN_MAG;
    const v = fill === 'loaded' ? 1 : 0.8;
    const els = [
        // The finger drives the button and the catch the whole way, so nothing snaps: the button
        // travels with a faint scuff and bottoms softly under the fingertip, and the catch is drawn
        // slowly out of the magazine's slot (a barely-there rub). The first real sound is the drop.
        snap('mag release button pressed in', 0, -26, { strength: 0.2, preload: 60, creak: 0.05, seat: 0.1, seatDelay: 1.5 }, arMagRelease, arLower),
        rub('mag catch pivots out of the magazine', 0.05, -34, { force: 3, duration: 0.012, speed: 0.05, profile: 'decelerate', roughness: 3, grain: 0.2, contactWidth: 0.03 }, arMagCatch, panel),
        // The other hand already grips the magazine and pulls it the moment the catch lets go: it
        // leaves the well in ~55 ms instead of falling for 128 ms (~8 cm at ~53 m/s^2, ~5 g, leaving
        // at ~2.9 m/s). Gripped, the shell is damped and rings less than a free-falling one.
        hit('magazine drops off the catch', 0.064, fill === 'loaded' ? -13 : -16, 0.35, panel, arMagWell, { scatter: 0.6, radius: 2, click: 0.6 }, withMagAir(SHEET_RATTLE, fill)),
        // The air column in the well grows as it's pulled (~1.2 cm -> ~8 cm, speeding up): its
        // resonance falls. As the top clears the well, air rushes in behind it: a quick, low suction
        // whump, stronger for the faster exit. From there it touches nothing.
        { what: 'air column in the mag well grows', at: 0.065, gainDb: -17, sound: { kind: 'tube', fromCm: 1.2, toCm: 8, durationMs: MAG_PULL_T * 1000, motion: 'accelerate', q: 2.5 } },
        { what: 'air rushes in as the magazine clears', at: 0.065 + MAG_PULL_T, gainDb: -16, sound: { kind: 'air', freq: 700, q: 0.7, attackMs: 0.4, decayMs: 6, pop: { freq: 150, ms: 5, level: 1.4 } } },
        rub('magazine slides down out of the mag well', 0.065, -14, { force: 3, duration: MAG_PULL_T, speed: 2.9, profile: 'accelerate', ...WORN_SLIDE }, panel, arMagWell, withMagAir(SHEET_BUZZ, fill)),
        hit('magazine body rings as it drops', 0.0645, fill === 'loaded' ? -19 : -13, 0.6, { ...body, damping: Math.min(1, (body.damping ?? 0) + 0.25) }, arMagWell, { scatter: 0.3, radius: 3, click: 0.1, sharp: 0.7 }, own),
        // Loose in the well as it's pulled: the shell knocks the billet walls, the knocks spread evenly
        // along the travel, so they come faster and harder as it speeds up, and stop once it's out.
        ...[0.08, 0.27, 0.5, 0.75].map((x, i) => hit('magazine clatters against the well', 0.065 + MAG_PULL_T * Math.sqrt(x), -15 + i * 1.5, (0.2 + i * 0.08) * v, panel, arMagWell, WORN_KNOCK, withMagAir(SHEET_EDGE, fill))),
        // The thumb lets go: the button and catch spring back out.
        snap('mag release button springs back', 0.16, -10, { strength: 0.5, preload: 0, seat: 0.3, seatDelay: 1.5 }, arMagRelease, arLower, { coil: { level: 0.25, length: 2, dispersion: 0.35, decay: 0.05, brightness: 5000 } }),
    ];
    if (fill === 'loaded') {
        els.push(hit('rounds shift in the falling magazine', 0.0655, -16, 0.4, arCase, arNextRound, { scatter: 0.3, radius: 3, click: 0.5 }, IN_LOADED_MAG));
    }
    return {
        id: 'ar15-mag-out' + (fill === 'empty' ? '-empty' : ''),
        title: `AR-15: ${fill} magazine released and removed`,
        room: 0.04,
        roomSize: 0.35,
        housing: LOWER_HOUSING,
        tracks: [
            { name: 'release', description: 'Release button pressed; the catch pivots out of the magazine.', elements: els.filter((e) => /button pressed|pivots out/.test(e.what)) },
            { name: 'drop', description: 'The magazine drops off the catch and slides out of the well.', elements: els.filter((e) => /drops|slides down|rings as|lips clear|rounds shift|column|rushes in|knocks|clatters/.test(e.what)) },
            { name: 'button-return', description: 'Thumb lets go; the button and catch spring back.', elements: els.filter((e) => /springs back/.test(e.what)) },
        ],
    };
}
export const AR15_MAG_IN = makeArMagIn('loaded');
export const AR15_MAG_IN_EMPTY = makeArMagIn('empty');
export const AR15_MAG_OUT = makeArMagOut('loaded');
export const AR15_MAG_OUT_EMPTY = makeArMagOut('empty');
/**
 * A full cycle: a loaded magazine goes in, the charging handle is racked and released (chambering
 * the top round), then the magazine comes back out. The gaps are the hand moving between the
 * magazine and the charging handle (~0.7 s) and back to the mag release (~0.8 s).
 */
export const AR15_LOAD_RACK_UNLOAD = chainScenes('ar15-load-rack-unload', 'AR-15: mag in, rack and release, mag out', [
    // Balance: the bolt slamming home is the loudest thing; the magazine seating is ~10 dB under it,
    // the magazine dropping out and its button ~14 dB under.
    { label: 'mag-in', at: 0, scene: AR15_MAG_IN, gainDb: 2 },
    { label: 'charge', at: 0.85, scene: AR15_CHARGE },
    { label: 'mag-out', at: 2.05, scene: AR15_MAG_OUT, gainDb: 6 },
]);
/** Just the magazine: a loaded magazine in, a short pause, and back out. */
export const AR15_MAG_IN_OUT = chainScenes('ar15-mag-in-out', 'AR-15: mag in, mag out', [
    { label: 'mag-in', at: 0, scene: AR15_MAG_IN },
    { label: 'mag-out', at: 0.9, scene: AR15_MAG_OUT, gainDb: 4 },
]);
const DROP_V = 4.85;
const concrete = { ...mat('concrete'), shape: 'block', size: 50, thickness: 100, modes: 0, irregularity: 0.9, damping: 0.9, level: -4 };
// Asphalt: aggregate in bitumen. Softer and far lossier than concrete (the binder is viscoelastic):
// a duller, shorter contact, a rough, gritty slide, and less bounce.
const asphalt = { material: 'custom', stiffness: 4, density: 2350, loss: 0.12, shape: 'block', size: 50, thickness: 80, modes: 0, irregularity: 1, damping: 0.95, level: -6 };
const SURFACE = {
    concrete: { body: concrete, restitution: 0.35, friction: 0.45, stiffness: 3e6, texture: { roughness: 40, grain: 0.8, periodicity: 0, contactWidth: 0.3 } },
    asphalt: { body: asphalt, restitution: 0.25, friction: 0.7, stiffness: 1.5e6, texture: { roughness: 250, grain: 4, periodicity: 0, contactWidth: 0.4 } },
};
// USGI magazines have a stamped steel floorplate.
const magFloorplate = { ...mat('steel'), shape: 'plate', size: 7, thickness: 1, modes: 1, irregularity: 0.5, damping: 0.5, level: 0 };
const magFeedLips = { ...mat('aluminum'), shape: 'plate', size: 4, thickness: 0.9, modes: 0, irregularity: 0.8, damping: 0.5, level: 0 };
function dropParts(n) {
    const f = n / 30;
    const shell = { ...mat('aluminum'), shape: 'plate', size: 18, thickness: 0.9, modes: Math.round(5 - 3 * f), irregularity: 0.85, damping: 0.25 + 0.45 * f, level: 0 };
    const edge = { ...shell, size: 6, modes: 0, damping: Math.min(0.9, shell.damping + 0.25) };
    const airLen = Math.max(1.5, 16 * (1 - f));
    const housing = {
        ...MAG_HOUSING, amount: 0.7 - 0.35 * f, cavity: 0.85 * Math.pow(1 - f, 1.5) + 0.02, damping: 0.35 + 0.4 * f,
        cavities: [{ length: airLen, width: 5.8, depth: 2, q: 22 - 14 * f, level: 1 }],
    };
    // The stack: ~5 mm of magazine per round (double column), a brass and lead block.
    const stack = { ...mat('brass'), shape: 'block', size: Math.max(1.5, n * 0.5), thickness: 10, modes: 0, irregularity: 0.7, damping: 0.85, level: 0 };
    // The whole magazine as it lands, its walls loaded by the rounds.
    const load = (0.12 + 0.012 * n) / 0.12;
    const loaded = { ...shell, density: (shell.density ?? 2700) * load };
    return { f, shell, edge, housing, stack, loaded, inMag: { housing } };
}
/** The magazine and its contents as a rigid body for the simulation. */
export function magDropSpec(o) {
    const n = o.rounds, f = n / 30, L = 0.18;
    const sf = SURFACE[o.surface ?? 'concrete'];
    const rng = makeRng(1000 + (o.seed ?? 1) * 97 + n * 7 + ['bottom', 'top', 'sideways', 'forwards'].indexOf(o.way) * 13);
    const j = (x) => x * (rng() * 2 - 1);
    const stackLen = Math.max(0.01, n * 0.005);
    // USGI spring: ~10 N on an empty follower, rising ~130 N/m as it's compressed by the stack.
    const contents = {
        mass: 0.01 + 0.012 * n, x: L / 2 - stackLen / 2, length: stackLen, springRate: 130, preload: 10 + 130 * n * 0.005,
        travel: Math.max(0.002, 0.16 * (1 - f) * 0.7), damping: 0.5 + 3 * f,
    };
    const h = o.height ?? 1.2;
    let q, spin, half;
    if (o.way === 'bottom') {
        q = quatMul(axisAngle([1, j(1), 0], 0.04 + j(0.02)), axisAngle([0, 1, 0], -Math.PI / 2));
        spin = [j(0.5), 0.5 + j(0.3), 0];
        half = L / 2;
    }
    else if (o.way === 'top') {
        q = quatMul(axisAngle([1, j(1), 0], 0.04 + j(0.02)), axisAngle([0, 1, 0], Math.PI / 2));
        spin = [j(0.5), -0.5 + j(0.3), 0];
        half = L / 2;
    }
    else if (o.way === 'sideways') {
        q = quatMul(axisAngle([0, 0, 1], j(0.4)), axisAngle([1, 0, 0], j(1)));
        spin = [12 + j(3), j(0.6), j(0.6)];
        half = 0.035;
    }
    else {
        q = quatMul(axisAngle([0, 0, 1], j(0.4)), axisAngle([0, 1, 0], -0.3 + j(0.3)));
        spin = [j(0.6), 9 + j(2), j(0.6)];
        half = 0.06;
    }
    const surfaceSpec = { restitution: sf.restitution * (1 - 0.4 * f), friction: sf.friction, stiffness: sf.stiffness };
    return {
        dims: [L, 0.06, 0.022], mass: 0.11, contents, surfaces: boxSurfaces(surfaceSpec, o.box || undefined, 0.18),
        position: [(o.start ?? 0) + j(0.05), j(0.05), h + half], orientation: q, velocity: [(o.toss ?? 0.15) + j(0.05), j(0.08), 0], spin,
        duration: 3, dt: 1e-5, traceRate: 240,
    };
}
/** The sound of a simulated drop: one hit per contact, one rub per slide, plus the contents. */
export function magDropScene(o, sim = simulateBoxDrop(magDropSpec(o))) {
    const n = o.rounds;
    const { f, shell, edge, stack, loaded, inMag } = dropParts(n);
    const sf = SURFACE[o.surface ?? 'concrete'];
    const mTot = 0.12 + 0.012 * n;
    const e = sf.restitution * (1 - 0.4 * f);
    // Levels: every element renders normalised, so each gets its level from its impulse, relative to
    // the magazine landing square at full speed.
    const Jref = mTot * DROP_V * (1 + e);
    const db = (J) => 20 * Math.log10(Math.max(1e-6, J) / Jref);
    const lips = n === 0 ? magFeedLips : { ...magFeedLips, damping: 0.6 };
    const els = [];
    const opt = (radius, sharp = 0.85) => ({ scatter: 0, radius, click: 0.8 - 0.45 * f, sharp: sharp - 0.25 * f });
    const where = (s) => (s === 'floor' ? '' : ` (${s})`);
    // How loose the magazine is: empty is all play; the stack holds the walls still as it fills.
    const loose = f < 0.5 ? { shellBuzz: { amount: 0.4 * (1 - 2 * f), freq: 140, decay: 0.035, rattle: 0.65 * (1 - 2 * f), wobble: 0, tone: 0 } } : null;
    const PART = {
        'bottom-end': { what: 'floorplate lands flat', layer: magFloorplate, radius: 6, trim: 0 },
        'bottom-end-edge': { what: 'edge of the floorplate lands', layer: magFloorplate, radius: 2, trim: 0 },
        'bottom-corner': { what: 'floorplate corner lands', layer: magFloorplate, radius: 1.2, sharp: 0.9, trim: 0 },
        'top-end': { what: 'feed lips land', layer: lips, radius: 2, sharp: 0.95, trim: 0, round: true },
        'top-end-edge': { what: 'edge of the feed lips lands', layer: lips, radius: 1.5, sharp: 0.95, trim: 0, round: true },
        'top-corner': { what: 'top corner lands', layer: lips, radius: 1, sharp: 0.9, trim: 0 },
        'broad-side': { what: 'slaps down flat on its side', radius: 10, sharp: 0.6, trim: 2 },
        'narrow-side': { what: 'lands on its spine', layer: edge, radius: 4, sharp: 0.7, trim: 1 },
        'long-edge': { what: 'folded edge lands', layer: edge, radius: 1.2, sharp: 0.9, trim: 0 },
    };
    for (const ct of sim.contacts) {
        const p = PART[ct.part];
        const g = db(ct.impulse) + p.trim;
        if (g < -45)
            continue;
        const v = Math.max(0.05, ct.speed);
        const o2 = opt(p.radius, p.sharp);
        const what = p.what + where(ct.surface);
        // A lightly loaded magazine's thin shell isn't held still from inside: it buzzes against the
        // follower, the spring and the floorplate's tabs for a moment after each blow.
        els.push(hit(what, ct.t, g, v, loaded, sf.body, o2, loose ? { ...inMag, flex: loose.shellBuzz } : inMag));
        if (p.layer && g > -35)
            els.push(hit(`${what} (the ${p.layer === magFloorplate ? 'floorplate' : p.layer === edge ? 'edge' : 'feed lips'} rings)`, ct.t, g - 7 - 5 * f, v, p.layer, sf.body, o2, inMag));
        if (p.round && n > 0 && g > -35)
            els.push(hit('top round strikes' + where(ct.surface), ct.t + 0.0003, g - 8, v * 0.8, arCase, sf.body, { scatter: 0, radius: 1.5, click: 0.6, sharp: 0.7 }, inMag));
        // Loose things inside ticking against the walls: an empty follower, a light stack's cases.
        if (n === 0 ? g > -32 : g > -22) {
            if (n === 0) {
                // The follower has ~1-2 mm of play each way in the shell and tilts on its spring: knocked
                // off its seat it rattles from wall to wall, each knock lighter and sooner, for ~30 ms.
                let dt = 0.004, kv = 0.35;
                for (let i = 0; i < 6; i++) {
                    els.push(hit('follower rattles in the shell', ct.t + dt, g - 9 - i * 2.2, v * kv, arFollower, i % 2 ? edge : shell, { scatter: 0, radius: 1.5, click: 0.6, sharp: 0.65 }, inMag));
                    dt += 0.0065 * Math.pow(0.82, i);
                    kv *= 0.78;
                }
                // The long, barely compressed spring: its coils slap the walls and buzz.
                els.push(hit('spring coils buzz against the walls', ct.t + 0.001, g - 11, v * 0.4, arMagSpring, shell, { scatter: 0, radius: 1, click: 0.3, sharp: 0.5 }, { ...inMag, flex: { amount: 0.6, freq: 85, decay: 0.07, rattle: 0.85, wobble: 0, tone: 0 }, coil: { level: 0.35, length: 12, dispersion: 0.5, decay: 0.12, brightness: 3500 } }));
            }
            else {
                const ticks = Math.round(4 * (1 - f));
                for (let i = 0; i < ticks; i++)
                    els.push(hit('cases tick against each other', ct.t + 0.005 + i * 0.0045 + (i % 2) * 0.0012, g - 13 - i * 2, v * (0.25 - i * 0.04), arCase, i % 2 ? shell : arCase, { scatter: 0, radius: 1.5, click: 0.5, sharp: 0.55 }, inMag));
            }
        }
    }
    // The contents on the spring.
    const mC = 0.01 + 0.012 * n;
    for (const k of sim.knocks) {
        const g = db(mC * k.speed * 1.5) + 3;
        if (g < -42)
            continue;
        if (k.end === 'top')
            els.push(hit(n === 0 ? 'follower slams back into the feed lips' : 'stack slams back into the feed lips', k.t, g, k.speed, n === 0 ? arFollower : stack, n === 0 ? lips : loaded, { scatter: 0, radius: 2, click: 0.6, sharp: n === 0 ? 0.7 : 0.5 }, inMag));
        else
            els.push(hit('spring goes solid under the stack', k.t, g, k.speed, stack, magFloorplate, { scatter: 0, radius: 3, click: 0.4, sharp: 0.4 }, inMag));
    }
    for (const l of sim.launches) {
        const g = db(mC * l.speed) - 2;
        if (g < -40)
            continue;
        els.push(hit(n === 0 ? 'empty spring boings' : 'spring takes up the stack', l.t, g, l.speed, arMagSpring, shell, { scatter: 0, radius: 1, click: 0.05, sharp: 0.35 }, { coil: { level: 0.55 * (1 - f) + 0.05, length: 6 + 6 * (1 - f), dispersion: 0.5, decay: 0.08 + 0.12 * (1 - f), brightness: 4000 }, ...inMag }));
    }
    for (const sl of sim.slides) {
        if (sl.speed < 0.08)
            continue;
        const body = sl.part === 'broad-side' ? loaded : edge;
        els.push(rub('slides' + where(sl.surface), sl.t, -12 + 20 * Math.log10(Math.min(1.5, sl.speed)), { force: Math.min(10, Math.max(0.5, sl.force)), duration: sl.duration, speed: sl.speed, profile: 'decelerate', ...sf.texture }, body, sf.body, inMag));
    }
    const fillName = n === 0 ? 'empty' : n === 30 ? 'full' : n === 10 ? 'third' : 'two-thirds';
    const fillTitle = n === 0 ? 'empty' : n === 30 ? 'full (30 rounds)' : n === 10 ? '1/3 full (10 rounds)' : '2/3 full (20 rounds)';
    const wayTitle = { bottom: 'lands on its floorplate', top: 'lands on its feed lips', sideways: 'tumbling sideways', forwards: 'tumbling end over end' }[o.way];
    const surf = o.surface ?? 'concrete';
    const inside = (el) => /follower|spring|stack|cases tick/.test(el.what);
    const slideEl = (el) => /^slides/.test(el.what);
    return {
        id: `ar15-mag-drop-${o.box ? surf + '-box-' : surf === 'concrete' ? '' : surf + '-'}${o.way}-${fillName}`,
        title: `AR-15 magazine dropped on ${surf}${o.box ? ' in a walled box' : ''}, ${fillTitle}, ${wayTitle} (simulated)`,
        room: o.box ? 0.08 : 0.12,
        roomSize: 0.45,
        tracks: [
            { name: 'contacts', description: 'Every simulated contact with the floor (and walls).', elements: els.filter((el) => !inside(el) && !slideEl(el)) },
            { name: 'inside', description: 'The follower, spring and rounds reacting inside it.', elements: els.filter(inside) },
            { name: 'slides', description: 'Where it slides along the surface.', elements: els.filter(slideEl) },
        ],
    };
}
export const AR15_MAG_DROPS = ['bottom', 'top', 'sideways', 'forwards'].flatMap((way) => [0, 10, 20, 30].map((rounds) => magDropScene({ rounds, way })));
export const FIREARM_SCENES = [
    PUMP_SHOTGUN,
    AR15_CHARGE, AR15_CHARGE_EMPTY, AR15_CHARGE_NO_MAG,
    AR15_BOLT_RELEASE, AR15_BOLT_RELEASE_EMPTY, AR15_BOLT_RELEASE_NO_MAG,
    AR15_MAG_IN, AR15_MAG_IN_EMPTY, AR15_MAG_OUT, AR15_MAG_OUT_EMPTY, AR15_LOAD_RACK_UNLOAD, AR15_MAG_IN_OUT,
    ...AR15_MAG_DROPS,
];
//# sourceMappingURL=firearms.js.map