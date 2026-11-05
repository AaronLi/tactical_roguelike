/*
 * Nerf N-Strike Recon CS-6: one full priming and firing cycle, plus a dry fire.
 *
 * How the blaster works (from the manual and teardown/repair guides):
 *  - It's a direct-plunger springer. The cocking slide on top drags the plunger
 *    rod and head back through the plunger tube, compressing the main spring
 *    (steel) around the rod.
 *  - At the back of the stroke a spring-loaded plastic catch (the sear) rides up
 *    over the lip of the plunger rod and snaps down behind it. The bolt sled is
 *    open, so the clip's follower pushes the next dart up into the breech.
 *  - Pushing the slide forward drives the bolt, which pushes the dart onto the
 *    barrel post. The trigger only works once the slide is fully forward
 *    (there's a trigger lock linked to the cocking mechanism).
 *  - The dart blocker is the air restrictor in the barrel post: a spring valve
 *    that stays shut unless a dart is seated on the post. With a dart, it is
 *    pushed open and the air drives the dart out. Without one, it stays shut and
 *    the trapped air cushions the plunger (a dry fire is softer and "puffier").
 *  - Pulling the trigger pulls the catch off the rod. The spring slams the
 *    plunger forward: O-ring hissing along the tube, air rushing through the
 *    restrictor into the dart, then the plunger head hitting the front of the
 *    tube. The whole hollow ABS shell rings with it, and the spring buzzes.
 *
 * From teardown photos (iFixit Recon CS-6 shell / main spring / plunger guides):
 * the body is two thin, ribbed, translucent clamshell halves (~33 cm long), mostly
 * empty boxes ahead of and below the mechanism plus a hollow grip. The orange
 * plunger assembly rides along molded rails in the top half; behind it a big
 * open-coil steel spring (~10 coils, ~3 cm across) compresses against the rear
 * wall. Small springs sit at the trigger, the catch and the front latch. Every
 * part is mounted in that shell, so every contact rings it (the scene housing).
 *
 * Parts driven by springs or hands don't bounce like a dropped object, so
 * impacts here use restitution 0 and rely on micro-contacts for the re-hits.
 *
 * Levels are a sound-design balance (dB per element); the bodies, materials and
 * motions come from the parts.
 */
import { mat } from '../presets.js';
// Parts
const slide = { ...mat('abs'), shape: 'bar', size: 12, thickness: 3, modes: 12, irregularity: 0.4, damping: 0.5, level: 0 };
// The orange plunger tube / bolt assembly that the slide drags along the rails.
const assembly = { ...mat('abs'), shape: 'shell', size: 18, thickness: 2, modes: 16, irregularity: 0.6, damping: 0.2, level: 0 };
// A molded rib / rail in the shell half.
const rib = { ...mat('abs'), shape: 'bar', size: 5, thickness: 2, modes: 8, irregularity: 0.5, damping: 0.3, level: 0 };
const tube = { ...mat('abs'), shape: 'shell', size: 12, thickness: 2, modes: 24, irregularity: 0.4, damping: 0.25, level: 0 };
const plunger = { ...mat('pom'), shape: 'block', size: 3.5, thickness: 25, modes: 8, irregularity: 0.3, damping: 0.2, level: 0 };
const catchPart = { ...mat('pom'), shape: 'bar', size: 2.2, thickness: 2.5, modes: 8, irregularity: 0.2, damping: 0.1, level: 0 };
const poppet = { ...mat('pom'), shape: 'bar', size: 0.8, thickness: 1.5, modes: 4, irregularity: 0.2, damping: 0.2, level: 0 };
const barrel = { ...mat('abs'), shape: 'shell', size: 5, thickness: 1.5, modes: 16, irregularity: 0.3, damping: 0.3, level: 0 };
// Main spring wire: ~1 mm music wire, open coils ~3 cm across.
const springWire = { ...mat('springsteel'), shape: 'bar', size: 9, thickness: 1, modes: 12, irregularity: 0.4, damping: 0.5, level: 0 };
const dart = { ...mat('rubber'), shape: 'block', size: 7, thickness: 13, modes: 4, irregularity: 0, damping: 1, level: -20 };
const clip = { ...mat('abs'), shape: 'shell', size: 9, thickness: 1.5, modes: 16, irregularity: 0.4, damping: 0.3, level: 0 };
const trigger = { ...mat('abs'), shape: 'bar', size: 4, thickness: 4, modes: 8, irregularity: 0.3, damping: 0.4, level: 0 };
const oring = { ...mat('rubber'), shape: 'block', size: 2.5, thickness: 3, modes: 4, irregularity: 0, damping: 1, level: -20 };
// Hard ABS / POM parts: strong edge crack on every contact.
const off = { velocity: 0, sharpness: 0.85, click: 0.5 };
// Timeline (s)
const BACK = 0.0; // slide starts back
const BACK_END = 0.2; // slide reaches the rear
const FWD = 0.45; // slide starts forward
const FWD_END = 0.6; // slide hits the front
const PULL = 1.0; // finger starts squeezing
const BREAK = 1.11; // sear lets go
export const RECON_CS6 = {
    id: 'recon-cs6',
    title: 'Nerf Recon CS-6: prime and fire',
    room: 0.08,
    roomSize: 0.25,
    // The clamshell: thin ribbed ABS, ~33 cm, mostly hollow, held in two hands.
    housing: {
        amount: 0.75, cavity: 0.65, ...mat('abs'), shape: 'shell', size: 33, thickness: 2,
        modes: 16, irregularity: 0.8, damping: 0.3,
    },
    tracks: [
        {
            name: 'slide-back',
            description: 'Cocking slide pulled back along its rails, ending on the rear stop.',
            elements: [
                {
                    what: 'cover rubbing on the shell', at: BACK, gainDb: -14,
                    sound: { kind: 'contact', patch: {
                            impact: off,
                            friction: { force: 4, duration: BACK_END - BACK, speed: 0.6, profile: 'swell', roughness: 6, grain: 0.4, periodicity: 0.15, stickSlip: 0.1, stickPitch: 180, contactWidth: 0.1 },
                            bodyA: slide, bodyB: rib, out: { length: 0.6 },
                        } },
                },
                {
                    what: 'plunger assembly ticking over the rail ribs', at: BACK + 0.01, gainDb: -9,
                    sound: { kind: 'contact', patch: {
                            impact: off,
                            friction: { force: 6, duration: BACK_END - BACK - 0.01, speed: 0.6, profile: 'swell', roughness: 70, grain: 9, periodicity: 0.8, stickSlip: 0.15, stickPitch: 140, contactWidth: 0.08 },
                            bodyA: assembly, bodyB: rib, out: { length: 0.6 },
                        } },
                },
                {
                    what: 'slide hits rear stop, loose cover rattles', at: BACK_END, gainDb: -6,
                    sound: { kind: 'contact', patch: {
                            impact: { velocity: 0.8, restitution: 0, scatter: 0.5, contactRadius: 4, click: 0.5, sharpness: 0.85 },
                            bodyA: assembly, bodyB: rib,
                            flex: { amount: 0.35, freq: 55, decay: 0.08, rattle: 0.6, wobble: 0, tone: 0 },
                            out: { length: 0.5 },
                        } },
                },
            ],
        },
        {
            name: 'spring-compress',
            description: 'Main spring compressing: steel coils grinding along the plastic plunger rod, with a little coil twang.',
            elements: [
                {
                    what: 'coils ticking along the orange tube as they bunch up', at: BACK + 0.01, gainDb: -8,
                    sound: { kind: 'contact', patch: {
                            impact: { velocity: 0, sharpness: 0.7, click: 0.4 },
                            friction: { force: 3, duration: BACK_END - BACK - 0.01, speed: 0.45, profile: 'swell', roughness: 150, grain: 4, periodicity: 0.9, stickSlip: 0.05, contactWidth: 0.03 },
                            bodyA: springWire, bodyB: assembly,
                            coil: { level: 0.8, length: 8, dispersion: 0.5, decay: 0.3, brightness: 7000 },
                            // Surge: the coils oscillate along the spring and clash into each other.
                            flex: { amount: 0.5, freq: 130, decay: 0.25, rattle: 0.35, wobble: 0.2, tone: 0.3 },
                            out: { length: 0.8 },
                        } },
                },
                {
                    what: 'spring end seats against the rear wall', at: BACK_END - 0.005, gainDb: -14,
                    sound: { kind: 'contact', patch: {
                            impact: { velocity: 0.5, restitution: 0, scatter: 0.4, contactRadius: 1, click: 0.4, sharpness: 0.7 },
                            bodyA: springWire, bodyB: rib,
                            coil: { level: 0.5, length: 8, dispersion: 0.5, decay: 0.2, brightness: 7000 },
                            out: { length: 0.5 },
                        } },
                },
            ],
        },
        {
            name: 'ar-close',
            description: 'Dart blocker: the bolt pulls the dart off the barrel post and the air-restrictor valve springs shut.',
            elements: [
                {
                    what: 'dart pulled off the post', at: BACK + 0.03, gainDb: -27,
                    sound: { kind: 'contact', patch: {
                            impact: off,
                            friction: { force: 1, duration: 0.05, speed: 0.3, profile: 'decelerate', roughness: 30, grain: 0.5, periodicity: 0, contactWidth: 1 },
                            bodyA: dart, bodyB: barrel, out: { length: 0.3 },
                        } },
                },
                {
                    what: 'valve snaps shut', at: BACK + 0.075, gainDb: -22,
                    sound: { kind: 'contact', patch: {
                            impact: off,
                            snap: { count: 1, strength: 0.3, preload: 0, creak: 0, seat: 0 },
                            bodyA: poppet, bodyB: barrel,
                            coil: { level: 0.25, length: 1.2, dispersion: 0.4, decay: 0.03, brightness: 9000 },
                            out: { length: 0.3 },
                        } },
                },
            ],
        },
        {
            name: 'sear-engage',
            description: 'Plastic catch riding up over the plunger rod lip and snapping down behind it.',
            elements: [
                {
                    what: 'catch rides over and drops', at: BACK_END - 0.03, gainDb: -5,
                    sound: { kind: 'contact', patch: {
                            impact: off,
                            snap: { count: 1, strength: 0.7, preload: 30, creak: 0.25, seat: 0.6, seatDelay: 2.5 },
                            bodyA: catchPart, bodyB: rib,
                            coil: { level: 0.15, length: 1.5, dispersion: 0.4, decay: 0.04, brightness: 9000 },
                            flex: { amount: 0.3, freq: 320, decay: 0.03, rattle: 0, wobble: 0, tone: 0.05 },
                            out: { length: 0.4 },
                        } },
                },
            ],
        },
        {
            name: 'clip-feed',
            description: 'Clip follower pushes the next dart up into the open breech.',
            elements: [
                {
                    what: 'dart lifted against the feed lips', at: BACK_END + 0.015, gainDb: -22,
                    sound: { kind: 'contact', patch: {
                            impact: { velocity: 0.4, restitution: 0.1, scatter: 0.2, contactRadius: 6, click: 0.2, sharpness: 0.85 },
                            bodyA: dart, bodyB: clip, out: { length: 0.3 },
                        } },
                },
                {
                    what: 'follower tick', at: BACK_END + 0.02, gainDb: -25,
                    sound: { kind: 'contact', patch: {
                            impact: { velocity: 0.3, restitution: 0.2, scatter: 0.1, contactRadius: 2, click: 0.3, sharpness: 0.85 },
                            bodyA: { ...mat('abs'), shape: 'bar', size: 3, thickness: 1.5, modes: 6, irregularity: 0.2, damping: 0.3, level: 0 },
                            bodyB: clip, out: { length: 0.3 },
                        } },
                },
            ],
        },
        {
            name: 'slide-forward',
            description: 'Slide pushed forward: rails, the bolt seating the dart on the barrel post, the front stop, and the trigger lock letting go.',
            elements: [
                {
                    what: 'cover rubbing on the shell', at: FWD, gainDb: -15,
                    sound: { kind: 'contact', patch: {
                            impact: off,
                            friction: { force: 4, duration: FWD_END - FWD, speed: 0.7, profile: 'swell', roughness: 6, grain: 0.4, periodicity: 0.15, stickSlip: 0.1, stickPitch: 200, contactWidth: 0.1 },
                            bodyA: slide, bodyB: rib, out: { length: 0.6 },
                        } },
                },
                {
                    what: 'bolt sled ticking over the rail ribs', at: FWD + 0.01, gainDb: -11,
                    sound: { kind: 'contact', patch: {
                            impact: off,
                            friction: { force: 5, duration: FWD_END - FWD - 0.01, speed: 0.7, profile: 'swell', roughness: 60, grain: 9, periodicity: 0.8, stickSlip: 0.1, stickPitch: 160, contactWidth: 0.08 },
                            bodyA: assembly, bodyB: rib, out: { length: 0.6 },
                        } },
                },
                {
                    what: 'dart pushed onto the post', at: FWD + 0.07, gainDb: -22,
                    sound: { kind: 'contact', patch: {
                            impact: off,
                            friction: { force: 2, duration: 0.07, speed: 0.4, profile: 'decelerate', roughness: 40, grain: 0.6, periodicity: 0, stickSlip: 0.2, stickPitch: 120, contactWidth: 1.5 },
                            bodyA: dart, bodyB: barrel, out: { length: 0.3 },
                        } },
                },
                {
                    what: 'slide hits front stop, loose cover rattles', at: FWD_END, gainDb: -4,
                    sound: { kind: 'contact', patch: {
                            impact: { velocity: 0.9, restitution: 0, scatter: 0.5, contactRadius: 4, click: 0.5, sharpness: 0.85 },
                            bodyA: assembly, bodyB: rib,
                            flex: { amount: 0.35, freq: 55, decay: 0.08, rattle: 0.6, wobble: 0, tone: 0 },
                            out: { length: 0.5 },
                        } },
                },
                {
                    what: 'trigger lock releases', at: FWD_END + 0.004, gainDb: -20,
                    sound: { kind: 'contact', patch: {
                            impact: off,
                            snap: { count: 1, strength: 0.3, preload: 0, creak: 0, seat: 0.3, seatDelay: 2 },
                            bodyA: { ...catchPart, size: 1.5 }, bodyB: rib, out: { length: 0.3 },
                        } },
                },
            ],
        },
        {
            name: 'ar-open',
            description: 'Dart blocker: the seated dart pushes the air-restrictor valve open.',
            elements: [
                {
                    what: 'valve pushed open', at: FWD + 0.125, gainDb: -24,
                    sound: { kind: 'contact', patch: {
                            impact: off,
                            snap: { count: 1, strength: 0.2, preload: 15, creak: 0.1, seat: 0 },
                            bodyA: poppet, bodyB: barrel,
                            coil: { level: 0.2, length: 1.2, dispersion: 0.4, decay: 0.03, brightness: 9000 },
                            out: { length: 0.3 },
                        } },
                },
            ],
        },
        {
            name: 'trigger-pull',
            description: 'Finger squeezes the trigger: pivot creak as it takes up slack against the catch.',
            elements: [
                {
                    what: 'trigger travel', at: PULL, gainDb: -20,
                    sound: { kind: 'contact', patch: {
                            impact: off,
                            friction: { force: 1.5, duration: BREAK - PULL, speed: 0.05, profile: 'steady', roughness: 3, grain: 0.3, periodicity: 0, stickSlip: 0.4, stickPitch: 70, contactWidth: 0.1 },
                            snap: { count: 1, strength: 0.12, preload: 60, creak: 0.3, seat: 0 },
                            bodyA: trigger, bodyB: rib, out: { length: 0.4 },
                        } },
                },
            ],
        },
        {
            name: 'sear-release',
            description: 'The catch is pulled off the plunger rod and flicks back against its stop.',
            elements: [
                {
                    what: 'catch lets go', at: BREAK, gainDb: -4,
                    sound: { kind: 'contact', patch: {
                            impact: off,
                            snap: { count: 1, strength: 1, preload: 0, creak: 0, seat: 0.4, seatDelay: 4 },
                            bodyA: catchPart, bodyB: rib,
                            coil: { level: 0.2, length: 1.5, dispersion: 0.4, decay: 0.05, brightness: 9000 },
                            out: { length: 0.4 },
                        } },
                },
            ],
        },
        {
            name: 'plunger-launch',
            description: 'Main spring decompressing, O-ring hissing along the tube, air rushing through the open valve and the dart leaving.',
            elements: [
                {
                    what: 'main spring decompresses', at: BREAK + 0.001, gainDb: -10,
                    sound: { kind: 'contact', patch: {
                            impact: { velocity: 2, restitution: 0, scatter: 0, contactRadius: 1, click: 0.1, sharpness: 0.85 },
                            bodyA: springWire, bodyB: tube,
                            coil: { level: 1, length: 7, dispersion: 0.65, decay: 0.12, brightness: 6000 },
                            out: { length: 0.5 },
                        } },
                },
                {
                    what: 'O-ring along the tube', at: BREAK + 0.002, gainDb: -14,
                    sound: { kind: 'contact', patch: {
                            impact: off,
                            friction: { force: 6, duration: 0.016, speed: 4, profile: 'accelerate', roughness: 4, grain: 0.3, periodicity: 0, contactWidth: 0.4 },
                            bodyA: oring, bodyB: tube, out: { length: 0.3 },
                        } },
                },
                { what: 'air through the restrictor', at: BREAK + 0.008, gainDb: -6, sound: { kind: 'air', freq: 1800, q: 1.2, attackMs: 1, decayMs: 14 } },
                { what: 'dart leaves the barrel', at: BREAK + 0.018, gainDb: -12, sound: { kind: 'air', freq: 3200, q: 0.8, attackMs: 0.5, decayMs: 6, pop: { freq: 220, ms: 4, level: 1.5 } } },
            ],
        },
        {
            name: 'plunger-impact',
            description: 'Plunger head slams into the front of the tube; the hollow shell rings and the spring buzzes.',
            elements: [
                {
                    what: 'plunger head hits tube end', at: BREAK + 0.016, gainDb: 0,
                    sound: { kind: 'contact', patch: {
                            impact: { velocity: 4, restitution: 0, scatter: 0.6, contactRadius: 15, click: 0.5, sharpness: 0.85 },
                            bodyA: plunger, bodyB: tube,
                            coil: { level: 0.35, length: 7, dispersion: 0.6, decay: 0.2, brightness: 5000 },
                            flex: { amount: 0.25, freq: 75, decay: 0.12, rattle: 0.4, wobble: 0, tone: 0 },
                            out: { length: 0.8 },
                        } },
                },
            ],
        },
    ],
};
/**
 * Dry fire (no dart): the air restrictor stays shut, the trapped air cushions
 * the plunger, and the only air escaping is a short leak hiss.
 */
export const RECON_CS6_DRY = {
    id: 'recon-cs6-dry',
    title: 'Nerf Recon CS-6: dry fire (no dart)',
    room: 0.08,
    roomSize: 0.25,
    tracks: [
        RECON_CS6.tracks.find((t) => t.name === 'sear-release'),
        {
            name: 'plunger-launch-dry',
            description: 'Spring decompressing and O-ring travel, with the valve shut: a squeezed air leak instead of a launch.',
            elements: [
                RECON_CS6.tracks.find((t) => t.name === 'plunger-launch').elements[0],
                RECON_CS6.tracks.find((t) => t.name === 'plunger-launch').elements[1],
                { what: 'air leaking past the closed valve', at: BREAK + 0.008, gainDb: -16, sound: { kind: 'air', freq: 3400, q: 3, attackMs: 3, decayMs: 35 } },
            ],
        },
        {
            name: 'plunger-impact-dry',
            description: 'Plunger cushioned by trapped air: a softer, duller thud.',
            elements: [
                {
                    what: 'cushioned plunger stop', at: BREAK + 0.03, gainDb: -4,
                    sound: { kind: 'contact', patch: {
                            impact: { velocity: 1.4, restitution: 0, scatter: 0.2, contactRadius: 30, click: 0.2, sharpness: 0.85 },
                            bodyA: plunger, bodyB: tube,
                            coil: { level: 0.25, length: 7, dispersion: 0.6, decay: 0.15, brightness: 4000 },
                            out: { length: 0.6 },
                        } },
                },
            ],
        },
    ],
};
export const SCENES = [RECON_CS6, RECON_CS6_DRY];
//# sourceMappingURL=recon-cs6.js.map