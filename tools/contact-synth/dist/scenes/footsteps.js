/*
 * Footsteps, built from measurements: who is walking (their mass), what's on their feet (the sole), how they
 * move (the gait) and what they walk on (the floor), plus what they carry (the kit that rattles with each step).
 *
 * One step, in the order it happens (walking; a run lands further forward and skips the heel):
 *
 *   heel rim catches     the hard rim of the heel touches first: a small mass, a small radius, the crisp part
 *   heel takes the weight  the heel plants: the foot and shank stopping (~4.5% of body mass), through the heel's
 *                        rubber and the floor's give. Long, soft contact: the thump, mostly below 500 Hz.
 *   heel scuffs          it's still moving forward when it lands (~0.3-1 m/s): a short slide on the floor
 *   forefoot slaps down  the foot rolls flat: the ball and toes land, softer than the heel
 *   sole rolls           the weight runs along the sole: a faint rub (a squeak, a gum sole on a smooth floor)
 *   toe pushes off       at the end of the stance the toes push and scrape away
 *
 * The floor's own part: a wooden floor's boards and the space under them boom and sometimes creak as the weight
 * comes on; a steel deck rings; what lies loose on it (grit on concrete, gravel, grass, leaves) is crushed and
 * scattered under the heel and the forefoot.
 *
 * The kit: what's slung on the walker lags the body and catches up when the heel stops it (25-60 ms after the
 * strike): magazines knocking in their pouches, a sling swivel, plates shifting in a carrier, the fabric rubbing.
 * It's its own track, and the bank bakes it apart, so a game can lay it over any floor.
 *
 * Gait numbers are typical adult figures (cadence, stance, heel velocities: Winter, "Biomechanics and Motor
 * Control of Human Gait"; Perry, "Gait Analysis"). Floor materials are handbook values; the rest is tuned by ear.
 */
import { makeRng } from '../dsp.js';
import { mat } from '../presets.js';
import { hit, rub } from './firearms.js';
// --------------------------------------------------------------------------------------------- the tables
const custom = (stiffness, density, loss) => ({ material: 'custom', stiffness, density, loss });
const block = (m, cm, mm, damping, modes = 0, level = 0) => ({ ...m, shape: 'block', size: cm, thickness: mm, modes, irregularity: 0.9, damping, level });
const sheet = (m, shape, cm, mm, damping, modes, level = 0) => ({ ...m, shape, size: cm, thickness: mm, modes, irregularity: 0.7, damping, level });
export const SOLES = {
    boot: { id: 'boot', label: 'Combat boot (lugged rubber)', heel: { stiffness: 0.04, loss: 0.15, lengthCm: 8, mm: 30 }, rim: 0.35, tread: { roughness: 30, grain: 6, periodicity: 0.5 }, grip: 0.5, levelDb: 0 },
    sneaker: { id: 'sneaker', label: 'Sneaker (foam, gum rubber)', heel: { stiffness: 0.008, loss: 0.3, lengthCm: 8, mm: 35 }, rim: 0, tread: { roughness: 6, grain: 2, periodicity: 0.3 }, grip: 1, levelDb: -4 },
    dress: { id: 'dress', label: 'Dress shoe (stacked leather heel)', heel: { stiffness: 0.5, loss: 0.05, lengthCm: 6, mm: 25 }, rim: 1, tread: { roughness: 3, grain: 1, periodicity: 0 }, grip: 0.1, levelDb: 2 },
    barefoot: { id: 'barefoot', label: 'Bare foot', heel: { stiffness: 0.002, loss: 0.4, lengthCm: 7, mm: 15 }, rim: 0, tread: { roughness: 8, grain: 0.5, periodicity: 0 }, grip: 0.7, levelDb: -10 },
};
const CONCRETE = custom(30, 2400, 0.02);
const SOIL = custom(0.05, 1600, 0.3);
export const FLOORS = {
    // a slab on the ground: no ring at all, a gritty face
    concrete: { id: 'concrete', label: 'Concrete slab', body: block(CONCRETE, 50, 100, 0.9, 0, -4), texture: { roughness: 40, grain: 0.8, periodicity: 0, contactWidth: 0.3 }, smooth: 0.3, loose: { kind: 'grit', amount: 0.3 }, levelDb: 0 },
    // paving slabs and asphalt outside: rougher, a little grit, a slab that rocks
    pave: { id: 'pave', label: 'Paving / asphalt', body: block(custom(8, 2350, 0.08), 45, 60, 0.85, 1, -4), texture: { roughness: 150, grain: 3, periodicity: 0, contactWidth: 0.4 }, smooth: 0.1, loose: { kind: 'grit', amount: 0.6 }, levelDb: 0 },
    // ceramic tile bedded on mortar: hard and glassy, a short high tick, smooth enough for a sneaker to squeak
    tile: { id: 'tile', label: 'Ceramic tile on mortar', body: sheet(custom(60, 2300, 0.004), 'plate', 30, 9, 0.92, 1, -2), texture: { roughness: 2, grain: 0.3, periodicity: 0, contactWidth: 0.1 }, smooth: 1, levelDb: 1 },
    // vinyl / linoleum over a slab: a dead floor with a slightly tacky face
    lino: { id: 'lino', label: 'Vinyl / linoleum', body: block(custom(0.6, 1400, 0.25), 50, 80, 0.9, 0, -4), texture: { roughness: 3, grain: 0.4, periodicity: 0, contactWidth: 0.15 }, smooth: 0.9, levelDb: -4 },
    // hardwood boards on joists: the boards ring low, the space under them booms, and they creak
    wood: { id: 'wood', label: 'Hardwood boards on joists', body: sheet(mat('wood'), 'plate', 50, 20, 0.5, 6, 0), under: { size: 45, cavity: 0.5, material: 'wood', thickness: 20 }, texture: { roughness: 5, grain: 1.2, periodicity: 0.3, contactWidth: 0.15 }, smooth: 0.7, creak: 0.3, levelDb: 1 },
    // a steel deck or stair tread (a catwalk, a fire escape, a truck bed): it rings
    metal: { id: 'metal', label: 'Steel deck plate', body: sheet(mat('steel'), 'plate', 50, 4, 0.35, 12, 0), under: { size: 40, cavity: 0.35, material: 'steel', thickness: 4 }, texture: { roughness: 25, grain: 4, periodicity: 0.7, contactWidth: 0.2 }, smooth: 0.4, levelDb: 5 },
    // carpet on underlay: the floor gives, all thud and fibre
    carpet: { id: 'carpet', label: 'Carpet on underlay', body: block(custom(0.003, 300, 0.45), 50, 20, 0.95, 0, -2), texture: { roughness: 60, grain: 0.3, periodicity: 0, contactWidth: 0.6 }, smooth: 0, levelDb: -12 },
    // packed earth: gives a little, a little grit
    dirt: { id: 'dirt', label: 'Packed dirt', body: block(SOIL, 50, 100, 0.95, 0, -2), texture: { roughness: 200, grain: 1.5, periodicity: 0, contactWidth: 0.4 }, smooth: 0, loose: { kind: 'grit', amount: 0.8 }, levelDb: -6 },
    // grass over soil: the blades brush and crush
    grass: { id: 'grass', label: 'Grass over soil', body: block(custom(0.02, 1400, 0.35), 50, 100, 0.95, 0, -4), texture: { roughness: 120, grain: 2, periodicity: 0, contactWidth: 0.8 }, smooth: 0, loose: { kind: 'grass', amount: 1 }, levelDb: -8 },
    // dry leaves on soil: crackle
    leaves: { id: 'leaves', label: 'Dry leaves on soil', body: block(SOIL, 50, 100, 0.95, 0, -4), texture: { roughness: 120, grain: 2, periodicity: 0, contactWidth: 0.6 }, smooth: 0, loose: { kind: 'leaves', amount: 1 }, levelDb: -2 },
    // loose gravel: the stones grind and scatter
    gravel: { id: 'gravel', label: 'Loose gravel', body: block(custom(0.2, 1800, 0.25), 50, 100, 0.95, 0, -6), texture: { roughness: 300, grain: 8, periodicity: 0, contactWidth: 0.5 }, smooth: 0, loose: { kind: 'gravel', amount: 1 }, levelDb: 2 },
};
export const GAITS = {
    // steadied, weapon up: slow, rolled down flat and placed
    creep: { id: 'creep', label: 'Creeping (placed steps)', cadence: 70, stance: 1.0, heelV: 0.15, slideV: 0.1, heelToFlat: 0.16, strike: 'flat', push: 0.2, bounce: 0.15, levelDb: -14 },
    // a crouched walk: knees bent, landing flat, the kit swinging low
    crouch: { id: 'crouch', label: 'Crouched walk', cadence: 85, stance: 0.8, heelV: 0.22, slideV: 0.2, heelToFlat: 0.1, strike: 'flat', push: 0.35, bounce: 0.3, levelDb: -8 },
    // an ordinary walk
    walk: { id: 'walk', label: 'Walking', cadence: 110, stance: 0.62, heelV: 0.45, slideV: 0.5, heelToFlat: 0.085, strike: 'heel', push: 0.6, bounce: 0.55, levelDb: 0 },
    // weapon lowered, moving fast: a jog / run, landing midfoot-to-fore
    run: { id: 'run', label: 'Running', cadence: 165, stance: 0.26, heelV: 1.1, slideV: 0.9, heelToFlat: 0.025, strike: 'fore', push: 1, bounce: 1, levelDb: 8 },
};
// ---------------------------------------------------------------------------------------------- one step
const pick = (table, k, what) => {
    if (typeof k !== 'string')
        return k;
    const v = table[k];
    if (!v)
        throw new Error(`no ${what} "${k}"`);
    return v;
};
/** What follows from the measurements, for one step. */
export function deriveStep(s) {
    const sole = pick(SOLES, s.sole, 'sole'), floor = pick(FLOORS, s.floor, 'floor'), gait = pick(GAITS, s.gait, 'gait');
    const mass = s.massKg ?? 80;
    // the foot and shank, stopped at the strike (~4.5% of the body); the heel's rubber the volume it's in
    const heelMass = 0.045 * mass * (gait.strike === 'fore' ? 0.8 : 1);
    const vol = 0.75 * (sole.heel.lengthCm / 100) ** 2 * (sole.heel.mm / 1000);
    const heel = { ...custom(sole.heel.stiffness, heelMass / vol, sole.heel.loss), shape: 'block', size: sole.heel.lengthCm, thickness: sole.heel.mm, modes: 0, irregularity: 0.8, damping: 0.9, level: -6 };
    // the rim: a hard edge, the first gram or hundred of the heel
    const rim = { ...custom(Math.max(sole.heel.stiffness * 2, 0.03), 1200, sole.heel.loss * 0.6), shape: 'block', size: 3, thickness: 8, modes: 0, irregularity: 0.8, damping: 0.8, level: -6 };
    const fore = { ...heel, ...custom(sole.heel.stiffness * 0.7, (heelMass * 0.6) / vol, sole.heel.loss * 1.2), size: 10, thickness: sole.heel.mm * 0.6 };
    // The tread, for the slides: a scuff is the sole's skin dragging its micro-contacts, not the leg's weight stopping,
    // so it's a light body (20 g of rubber), and rubber shaken at kHz rates is tens of times stiffer than under the slow
    // weight of a step (its dynamic modulus): what lets a sole hiss and squeak rather than only thud.
    const tvol = 0.75 * 0.06 ** 2 * 0.005;
    const tread = { ...custom(Math.max(0.5, sole.heel.stiffness * 60), 0.02 / tvol, sole.heel.loss), shape: 'block', size: 6, thickness: 5, modes: 0, irregularity: 0.8, damping: 0.8, level: -6 };
    // a grippy sole on a smooth floor sticks and lets go: the squeak
    const squeak = sole.grip * floor.smooth;
    return { sole, floor, gait, mass, heel, rim, fore, tread, squeak, interval: 60 / gait.cadence };
}
/** The kit's rattlers: what knocks, against what, how hard at full bounce, and its level. */
const POLY = custom(2.4, 1140, 0.05);
const CORDURA = custom(0.05, 1150, 0.4);
const KIT = {
    light: [
        { what: 'sling swivel knocks its loop', A: sheet(mat('steel'), 'bar', 3, 3, 0.4, 2), B: sheet(mat('steel'), 'bar', 4, 3, 0.5, 1), v: 0.5, gainDb: -14, radius: 1, click: 0.8, sharp: 0.8 },
        { what: 'magazines knock in their pouches', A: sheet(POLY, 'shell', 18, 2, 0.6, 2), B: sheet(POLY, 'shell', 18, 2, 0.6, 2), v: 0.35, gainDb: -10, radius: 3, click: 0.5, sharp: 0.5 },
    ],
    heavy: [
        { what: 'magazines knock in their pouches', A: sheet(mat('aluminum'), 'shell', 18, 0.9, 0.7, 3), B: sheet(POLY, 'shell', 18, 2, 0.6, 2), v: 0.45, gainDb: -8, radius: 3, click: 0.55, sharp: 0.6 },
        { what: 'plates shift in the carrier', A: block(custom(300, 3900, 0.01), 30, 20, 0.85, 1), B: block(CORDURA, 30, 5, 0.9), v: 0.25, gainDb: -6, radius: 15, click: 0.3, sharp: 0.2 },
        { what: 'sling swivel knocks its loop', A: sheet(mat('steel'), 'bar', 3, 3, 0.4, 2), B: sheet(mat('steel'), 'bar', 4, 3, 0.5, 1), v: 0.55, gainDb: -12, radius: 1, click: 0.8, sharp: 0.8 },
        { what: 'buckle taps the carrier', A: sheet(POLY, 'plate', 4, 3, 0.5, 1), B: block(CORDURA, 20, 5, 0.9), v: 0.5, gainDb: -16, radius: 2, click: 0.7, sharp: 0.7 },
    ],
};
/**
 * The kit's part of one step (the strike at 0): each rattler catching up with the body, and the fabric rubbing.
 * `bounce`: the gait's (0..1); `seed`: the variation.
 */
export function kitElements(kit, bounce, seed = 1) {
    if (kit === 'none')
        return [];
    const rng = makeRng(seed * 7919 + 13), j = (a) => 1 + a * (rng() * 2 - 1);
    const els = [];
    const quiet = 20 * Math.log10(Math.max(0.05, bounce));
    for (const r of KIT[kit]) {
        // it lags the body and catches up as the heel stops it, then (thrown back) knocks again, softer
        const t = (0.025 + 0.035 * rng()) * (1.4 - 0.4 * bounce);
        els.push(hit(r.what, t, r.gainDb + quiet * 0.8, r.v * (0.3 + 0.7 * bounce) * j(0.2), r.A, r.B, { scatter: 0.6, radius: r.radius, click: r.click, sharp: r.sharp }));
        if (bounce > 0.4 && rng() < bounce)
            els.push(hit(r.what + ' again', t + 0.05 + 0.04 * rng(), r.gainDb + quiet - 8, r.v * 0.5 * bounce * j(0.2), r.A, r.B, { scatter: 0.7, radius: r.radius, click: r.click, sharp: r.sharp }));
    }
    // the fabric: trousers and carrier rubbing as the leg swings through
    els.push(rub('fabric brushes as the leg swings', 0.02, (kit === 'heavy' ? -14 : -18) + quiet * 0.5, { force: 2 + 4 * bounce, duration: 0.12 + 0.1 * (1 - bounce), speed: 0.4 + 0.8 * bounce, profile: 'swell', roughness: 40, grain: 0.4, periodicity: 0.1, contactWidth: 0.5 }, block(CORDURA, 30, 1, 0.95), block(CORDURA, 30, 1, 0.95)));
    return els;
}
/** What lies loose on the floor, crushed at `t` (the heel or the forefoot coming down) with `k` of the weight. */
function looseElements(floor, t, k, gait, rng) {
    const L = floor.loose;
    if (!L)
        return [];
    const els = [];
    const stone = (cm) => block(CONCRETE, cm, cm * 10 * 0.7, 0.6, 1);
    if (L.kind === 'grit' || L.kind === 'gravel') {
        // grit: a few grains pinched and skittering; gravel: stones pressed into each other and grinding, then settling
        const n = Math.round((L.kind === 'gravel' ? 14 : 4) * L.amount * k * (0.7 + 0.6 * rng()));
        const spread = L.kind === 'gravel' ? 0.06 + 0.04 * (1 - gait.heelV) : 0.025;
        for (let i = 0; i < n; i++) {
            const u = Math.pow(rng(), 1.6); // most at once, a few after
            const cm = L.kind === 'gravel' ? 1 + 1.5 * rng() : 0.15 + 0.2 * rng();
            els.push(hit(L.kind === 'gravel' ? 'stones crunch underfoot' : 'grit pinched under the sole', t + u * spread, (L.kind === 'gravel' ? -12 : -20) - 8 * u + 4 * (rng() - 0.5), (0.3 + 0.6 * rng()) * (0.5 + gait.heelV), stone(cm), stone(L.kind === 'gravel' ? 2 : 3), { scatter: 0.9, radius: 0.5 + rng(), click: 0.8, sharp: 0.9 }));
        }
        if (L.kind === 'gravel')
            els.push(rub('gravel grinds as the weight comes on', t, -10, { force: 30 * k, duration: 0.08 + 0.05 * (1 - gait.heelV), speed: 0.15 + 0.2 * gait.slideV, profile: 'decelerate', roughness: 300, grain: 10, periodicity: 0, contactWidth: 1, stickSlip: 0.2, stickPitch: 120 }, stone(2), stone(3)));
    }
    else {
        // grass: blades bent and crushed (a brush, then a soft tearing); leaves: dry sheets cracking and sliding
        const leaf = sheet(custom(3, 600, L.kind === 'leaves' ? 0.04 : 0.15), 'plate', 8, L.kind === 'leaves' ? 0.25 : 0.4, 0.6, 2);
        const ground = block(SOIL, 40, 50, 0.95);
        els.push(rub(L.kind === 'leaves' ? 'leaves crushed underfoot' : 'grass crushed underfoot', t - 0.01, L.kind === 'leaves' ? -8 : -6, { force: 6 * k + 2, duration: 0.07 + 0.06 * (1 - gait.heelV), speed: 0.3 + 0.5 * gait.slideV, profile: 'decelerate', roughness: L.kind === 'leaves' ? 80 : 50, grain: 0.6, periodicity: 0, contactWidth: 0.05, stickSlip: L.kind === 'leaves' ? 0.4 : 0.1, stickPitch: 2500 }, leaf, ground));
        const n = Math.round((L.kind === 'leaves' ? 10 : 4) * L.amount * k * (0.7 + 0.6 * rng()));
        for (let i = 0; i < n; i++) {
            const u = Math.pow(rng(), 1.3);
            els.push(hit(L.kind === 'leaves' ? 'a dry leaf cracks' : 'a stem snaps', t + u * 0.07, (L.kind === 'leaves' ? -12 : -20) - 6 * u, 0.3 + 0.5 * rng(), leaf, leaf, { scatter: 0.9, radius: 0.3, click: 0.9, sharp: 0.95 }));
        }
    }
    return els;
}
/**
 * One step. The heel's strike (or, running, the forefoot's) is at 0 and named 'foot strikes' (`STRIKE`), the
 * anchor a game lines the step up with. Tracks: the foot, the floor's own part, the kit.
 */
export const STRIKE = 'foot strikes';
export function stepScene(s) {
    const d = deriveStep(s), { sole, floor, gait } = d;
    const seed = (s.seed ?? 1) * 2 + (s.foot === 'L' ? 1 : 0);
    const rng = makeRng(seed * 104729 + 7), j = (a) => 1 + a * (rng() * 2 - 1);
    const v = gait.heelV * j(0.15), slide = gait.slideV * j(0.25), flat = gait.heelToFlat * j(0.15);
    const side = s.foot === 'L' ? -0.6 : 0; // (one foot a touch softer than the other)
    const F = floor.body;
    const foot = [], fl = [];
    // A sliding sole reads the floor's fine texture (the micro-asperities its rubber drags over, a few tenths of a mm
    // apart: the hiss of a scuff, 2-6 kHz at a walk), on top of its coarse grain; its lugs add their pitch.
    const tex = { ...floor.texture, roughness: Math.max(floor.texture.roughness ?? 10, sole.tread.roughness * 0.5), grain: (floor.texture.grain ?? 1) * 0.15, contactWidth: (floor.texture.contactWidth ?? 0.2) * 0.12, periodicity: Math.max(floor.texture.periodicity ?? 0, sole.tread.periodicity * 0.5) * 0.5 };
    const squeak = d.squeak > 0.35 ? { stickSlip: Math.min(1, d.squeak * 1.1), stickPitch: 1200 + 1300 * rng() } : { stickSlip: 0.05 };
    if (gait.strike === 'fore') {
        // running: the forefoot lands first, hard, then the heel just kisses down
        foot.push(hit(STRIKE, 0, side, v, d.fore, F, { scatter: 0.3, radius: 25, click: 0.25 + 0.3 * sole.rim, sharp: 0.3 + 0.5 * sole.rim }));
        foot.push(rub('sole skids as it lands', 0.002, -10, { force: 25, duration: 0.03 * j(0.2), speed: slide, profile: 'decelerate', ...tex, ...squeak }, d.tread, F));
        foot.push(hit('heel kisses down', flat, -12 + side, v * 0.3, d.heel, F, { scatter: 0.3, radius: 30, click: 0.2, sharp: 0.3 * sole.rim }));
    }
    else {
        const heelDb = gait.strike === 'flat' ? -4 : 0;
        if (sole.rim > 0)
            foot.push(hit('heel rim catches the floor', -0.003, heelDb - 14 + 12 * sole.rim + side, v * 1.3, d.rim, F, { scatter: 0.2, radius: 4, click: 0.3 + 0.4 * sole.rim, sharp: 0.4 + 0.5 * sole.rim }));
        foot.push(hit(STRIKE, 0, heelDb + side, v, d.heel, F, { scatter: 0.3, radius: 30, click: 0.2 + 0.2 * sole.rim, sharp: 0.3 * sole.rim }));
        foot.push(rub('heel scuffs as it lands', 0.001, -14 + 6 * Math.min(1, slide), { force: 20 * v + 4, duration: (0.02 + 0.03 * slide) * j(0.2), speed: slide, profile: 'decelerate', ...tex, ...squeak }, d.tread, F));
        // the forefoot: louder when it's set down flat (creeping lands the whole foot together)
        foot.push(hit('forefoot slaps down', flat, (gait.strike === 'flat' ? -3 : -6) + side, v * (gait.strike === 'flat' ? 0.9 : 0.6) * j(0.15), d.fore, F, { scatter: 0.4, radius: 35, click: 0.15, sharp: 0.2 * sole.rim }));
    }
    // the weight rolls along the sole, then the toes push off and scrape away
    foot.push(rub('sole rolls under the weight', flat + 0.01, -24 + 8 * Math.max(0, d.squeak - 0.4), { force: 10, duration: Math.max(0.05, gait.stance * 0.45), speed: 0.05, profile: 'swell', ...tex, ...squeak }, d.tread, F));
    const off = gait.stance * j(0.06);
    foot.push(rub('toes push off and scrape away', off - 0.05, -18 + 8 * gait.push + (d.squeak > 0.5 ? 4 : 0), { force: 8 + 20 * gait.push, duration: 0.05 + 0.03 * gait.push, speed: 0.2 + 0.6 * gait.push, profile: 'accelerate', ...tex, ...squeak }, d.tread, F));
    // the floor's own part
    if (floor.creak && rng() < floor.creak) {
        // a board shifting on its nail as the weight comes on: slow stick-slip, wood on wood
        const board = sheet(mat('wood'), 'bar', 40, 20, 0.5, 3);
        fl.push(rub('a board creaks on its nail', flat + 0.02 + 0.08 * rng(), -14 + 4 * rng(), { force: 60, duration: 0.12 + 0.15 * rng(), speed: 0.02, profile: 'swell', roughness: 8, grain: 0.5, periodicity: 0.2, contactWidth: 0.1, stickSlip: 0.95, stickPitch: 120 + 200 * rng() }, board, { ...mat('steel'), shape: 'bar', size: 6, thickness: 3, modes: 1, irregularity: 0.6, damping: 0.6, level: -6 }));
    }
    fl.push(...looseElements(floor, 0, gait.strike === 'fore' ? 1 : 0.8, gait, rng));
    if (gait.strike !== 'fore')
        fl.push(...looseElements(floor, flat, 0.6, gait, rng));
    const tracks = [
        { name: 'foot', description: `${sole.label}: the strike, the roll and the push off.`, elements: foot },
        { name: 'floor', description: `${floor.label}: what the floor adds of its own.`, elements: fl },
        { name: 'kit', description: 'What the walker carries, catching up with each step.', elements: kitElements(s.kit ?? 'none', gait.bounce, seed) },
    ];
    const u = floor.under;
    return {
        id: `step-${sole.id}-${floor.id}-${gait.id}${s.kit && s.kit !== 'none' ? '-' + s.kit : ''}`,
        title: `Footstep: ${sole.label}, ${gait.label.toLowerCase()}, on ${floor.label.toLowerCase()}`,
        room: 0.12, roomSize: 0.5,
        housing: u ? { amount: 0.45, cavity: u.cavity, ...mat(u.material), shape: 'plate', size: u.size, thickness: u.thickness, modes: 4, irregularity: 0.8, damping: 0.6, level: 0, cavities: [{ length: u.size, width: u.size * 0.8, depth: 20, q: u.material === 'steel' ? 6 : 3, level: 1 }] } : undefined,
        tracks: tracks.filter((t) => t.elements.length),
    };
}
/** Several steps, left and right, on the gait's cadence: a walk to audition. */
export function walkScene(s, steps = 6) {
    const d = deriveStep(s);
    const tracks = [];
    let id = '', title = '', housing;
    for (let i = 0; i < steps; i++) {
        const sc = stepScene({ ...s, foot: i % 2 ? 'L' : 'R', seed: i + 1 });
        const at = i * d.interval * (1 + 0.04 * Math.sin(i * 2.3)); // (nobody walks to a metronome)
        for (const t of sc.tracks) {
            let tr = tracks.find((x) => x.name === t.name);
            if (!tr)
                tracks.push((tr = { name: t.name, description: t.description, elements: [] }));
            tr.elements.push(...t.elements.map((e) => ({ ...e, at: e.at + at })));
        }
        id = sc.id.replace(/^step-/, 'walk-');
        title = sc.title.replace('Footstep', 'Footsteps');
        housing = sc.housing;
    }
    return { id, title, room: 0.12, roomSize: 0.5, housing, tracks };
}
/** The scenes the tool lists: a boot walking on every floor, every gait on concrete, every sole on tile, kit. */
export const FOOTSTEP_SCENES = [
    ...Object.keys(FLOORS).map((f) => walkScene({ sole: 'boot', floor: f, gait: 'walk' })),
    ...['creep', 'crouch', 'run'].map((g) => walkScene({ sole: 'boot', floor: 'concrete', gait: g })),
    ...['sneaker', 'dress', 'barefoot'].map((so) => walkScene({ sole: so, floor: 'tile', gait: 'walk' })),
    walkScene({ sole: 'boot', floor: 'concrete', gait: 'walk', kit: 'heavy', massKg: 105 }),
    walkScene({ sole: 'boot', floor: 'wood', gait: 'run', kit: 'heavy', massKg: 105 }),
];
//# sourceMappingURL=footsteps.js.map