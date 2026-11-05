/*
 * The generic description of a contact sound.
 *
 * Every sound this synth makes is described the same way, so any combination
 * can be dialled in with sliders:
 *
 *   GESTURE  — how the two bodies touch over time. Three independent layers:
 *              impact (a hit, with bounces), friction (slide / scrape / squeak,
 *              driven by a surface texture read out at the sliding speed) and
 *              snaps (catch-and-release: a latch, detent or button).
 *   BODIES   — the two objects in contact. Each one is a material
 *              (stiffness, density, internal loss) plus a geometry (shape,
 *              size, thickness) plus how it's held. These set its modes:
 *              the frequencies it rings at and how long they last.
 *   ELASTIC  — springy behaviour that isn't plain ringing: a coil spring's
 *              dispersive "boing/zing" and a large slow flex (a ruler or sheet
 *              swinging) that can rattle against its support or bend the pitch.
 *   OUTPUT   — room, length, seed.
 */
export function defaultParams() {
    return {
        impact: { velocity: 1.5, restitution: 0.4, scatter: 0.4, contactRadius: 3, click: 0.25 },
        friction: {
            force: 0, duration: 1, speed: 0.3, profile: 'steady', strokes: 2, roughness: 10, grain: 0.5,
            periodicity: 0, stickSlip: 0, stickPitch: 600, contactWidth: 0.05,
        },
        snap: { count: 0, strength: 0.6, spacing: 150, preload: 80, creak: 0.3, seat: 0.5, seatDelay: 12 },
        bodyA: {
            material: 'steel', stiffness: 200, density: 7850, loss: 0.0004, shape: 'plate', size: 25, thickness: 1.5,
            modes: 32, irregularity: 0.3, damping: 0.1, level: 0,
        },
        bodyB: {
            material: 'steel', stiffness: 200, density: 7850, loss: 0.0004, shape: 'bar', size: 4, thickness: 4,
            modes: 16, irregularity: 0.3, damping: 0.3, level: -6,
        },
        coil: { level: 0, length: 30, dispersion: 0.6, decay: 1.2, brightness: 6000 },
        flex: { amount: 0, freq: 20, decay: 1, rattle: 0, wobble: 0, tone: 0 },
        out: { room: 0.15, roomSize: 0.4, length: 3, seed: 1 },
    };
}
export function cloneParams(p) {
    return JSON.parse(JSON.stringify(p));
}
/** Defaults overlaid with a patch (presets are patches). */
export function withPatch(patch, base = defaultParams()) {
    const p = cloneParams(base);
    for (const [section, values] of Object.entries(patch)) {
        if (values && p[section])
            Object.assign(p[section], values);
    }
    return p;
}
export function getPath(p, path) {
    const [s, k] = path.split('.');
    return p[s][k];
}
export function setPath(p, path, v) {
    const [s, k] = path.split('.');
    p[s][k] = v;
}
//# sourceMappingURL=params.js.map