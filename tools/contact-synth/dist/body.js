/*
 * A body = material + geometry + mounting → a set of damped modes.
 *
 * Fundamental frequency comes from thin-structure bending theory:
 *   bar   f1 = 1.03 · c · h / L²      (free-free beam, c = sqrt(E/ρ))
 *   plate f1 ≈ 0.6  · c · h / L²      (free plate)
 *   shell f1 ≈ 1.2  · c · h / L²      (can / pot / box: ring modes, stiffened by ends)
 *   block f1 ≈ 0.5  · c / L           (solid chunk: bulk modes, little ring)
 * so thickness raises pitch linearly and size lowers it quadratically.
 * Each shape has its own overtone pattern (bar: sparse and stretched, plate: dense,
 * shell: paired "beating" ring modes, block: few, high).
 *
 * Each mode decays at  α = π·f·η  (internal loss)  + air/radiation loss  + mounting loss.
 */
import { clamp } from './dsp.js';
const BAR_BETA = [4.73004, 7.85320, 10.99561, 14.13717, 17.27876];
/** Every overtone ratio (sorted, first = 1) of a shape up to maxRatio. */
function shapeRatios(shape, aspect, maxRatio) {
    const list = [];
    switch (shape) {
        case 'bar': {
            for (let n = 0; n < 400; n++) {
                const b = n < BAR_BETA.length ? BAR_BETA[n] : ((2 * n + 3) * Math.PI) / 2;
                const r = (b / BAR_BETA[0]) ** 2;
                if (r > maxRatio)
                    break;
                list.push(r);
            }
            break;
        }
        case 'plate': {
            // (m/a)² + (n/b)² grid, a = 1, b = aspect: modal density is constant, so a big thin
            // sheet has a huge number of modes.
            const b2 = aspect * aspect;
            const r0 = 1 + 1 / b2;
            for (let m = 1; m <= 150; m++) {
                if ((m * m) / r0 > maxRatio)
                    break;
                for (let n = 1; n <= 150; n++) {
                    const r = (m * m + (n * n) / b2) / r0;
                    if (r > maxRatio)
                        break;
                    list.push(r);
                }
            }
            break;
        }
        case 'shell': {
            // Ring modes n(n²-1)/sqrt(n²+1) for circumferential order n ≥ 2, plus axial families m.
            const g = (n) => (n * (n * n - 1)) / Math.sqrt(n * n + 1);
            for (let m = 1; m <= 6; m++)
                for (let n = 2; n <= 200; n++) {
                    const r = (g(n) / g(2)) * (1 + (0.45 * (m - 1) * (m - 1)) / Math.sqrt(n));
                    if (r > maxRatio)
                        break;
                    list.push(r);
                }
            break;
        }
        case 'block': {
            const b = 0.75;
            const c = clamp(aspect, 0.1, 1);
            for (let l = 0; l <= 24; l++)
                for (let m = 0; m <= 24; m++)
                    for (let n = 0; n <= 24; n++) {
                        if (l + m + n === 0)
                            continue;
                        const r = Math.sqrt(l * l + (m / b) ** 2 + (n / c) ** 2);
                        if (r <= maxRatio)
                            list.push(r);
                    }
            const r0 = Math.min(...list);
            for (let i = 0; i < list.length; i++)
                list[i] /= r0;
            break;
        }
    }
    list.sort((x, y) => x - y);
    return list;
}
/**
 * Pick which modes to simulate. If the body has more audible modes than the budget,
 * keep the lowest third exactly (they define the pitch) and represent the rest with
 * one mode per logarithmic band, scaled up to stand in for the modes it replaces.
 */
function selectModes(ratios, f1, fmin, fmax, budget, rng) {
    const aud = [];
    for (let i = 0; i < ratios.length; i++) {
        const f = f1 * ratios[i];
        if (f >= fmin && f <= fmax)
            aud.push({ rank: i, ratio: ratios[i] });
    }
    if (aud.length <= budget)
        return aud.map((a) => ({ ...a, weight: 1 }));
    const keep = Math.max(1, Math.floor(budget / 3));
    const out = aud.slice(0, keep).map((a) => ({ ...a, weight: 1 }));
    const rest = aud.slice(keep);
    const bins = budget - keep;
    const lo = Math.log(rest[0].ratio);
    const hi = Math.log(rest[rest.length - 1].ratio) + 1e-9;
    let j = 0;
    for (let b = 0; b < bins; b++) {
        const top = lo + ((hi - lo) * (b + 1)) / bins;
        const inBin = [];
        while (j < rest.length && Math.log(rest[j].ratio) <= top)
            inBin.push(rest[j++]);
        if (inBin.length)
            out.push({ ...inBin[Math.floor(rng() * inBin.length)], weight: Math.sqrt(inBin.length) });
    }
    return out;
}
export function deriveBody(bp, sr, rng) {
    const E = Math.max(1e6, bp.stiffness * 1e9);
    const rho = Math.max(100, bp.density);
    const c = Math.sqrt(E / rho);
    const L = Math.max(0.002, bp.size / 100);
    const h = Math.min(Math.max(0.00002, bp.thickness / 1000), L);
    let f1;
    let volume;
    let area;
    let aspect = 0.77;
    switch (bp.shape) {
        case 'bar': {
            const w = Math.max(h, 0.1 * L);
            f1 = (1.028 * c * h) / (L * L);
            volume = L * w * h;
            area = L * w;
            break;
        }
        case 'plate':
            f1 = (0.6 * c * h) / (L * L);
            volume = 0.75 * L * L * h;
            area = 0.75 * L * L;
            break;
        case 'shell':
            f1 = (1.2 * c * h) / (L * L);
            volume = Math.PI * L * L * h;
            area = Math.PI * L * L;
            break;
        case 'block':
        default:
            f1 = (0.5 * c) / L;
            aspect = h / L;
            volume = 0.75 * L * L * h;
            area = 0.75 * L * L;
            break;
    }
    const mass = rho * volume;
    // Radiation: an object much smaller than the wavelength radiates its low modes poorly.
    const fRad = (0.5 * 343) / (Math.PI * L);
    const radW = (f) => {
        const x = f / fRad;
        return x / Math.sqrt(1 + x * x);
    };
    const budget = clamp(Math.round(bp.modes), 1, 128);
    const irr = clamp(bp.irregularity, 0, 1);
    const nyq = sr * 0.45;
    const fmin = 20;
    const ratios = shapeRatios(bp.shape, aspect, Math.max(1, (nyq * 1.1) / f1));
    const picked = selectModes(ratios, f1, fmin, nyq, budget, rng);
    const modes = [];
    const pushMode = (f, rank, ampScale) => {
        if (f < fmin || f > nyq)
            return;
        const alpha = Math.PI * f * bp.loss + 0.6 + 2.5e-4 * f + bp.damping * bp.damping * 60 + bp.damping * f * 0.004;
        const amp = radW(f) * Math.pow(f1 / f, 0.35) * (0.55 + 0.45 * rng()) * ampScale;
        modes.push({ f, amp, alpha, k: 0.7 * (rank + 1) + 0.3 * rng(), theta: rng() * Math.PI * 2 });
    };
    for (const pm of picked) {
        const detune = pm.rank === 0 ? 0 : irr * 0.07 * (rng() * 2 - 1);
        const f = f1 * pm.ratio * (1 + detune);
        // Shells and irregular bodies split degenerate modes into close pairs → beating.
        const split = bp.shape === 'shell' ? 0.0015 + irr * 0.02 : irr * 0.012;
        if (split > 0.002 && (bp.shape === 'shell' || rng() < irr)) {
            pushMode(f * (1 - split / 2), pm.rank, 0.75 * pm.weight);
            pushMode(f * (1 + split / 2), pm.rank, 0.6 * pm.weight);
        }
        else {
            pushMode(f, pm.rank, pm.weight);
        }
    }
    const gain = Math.sqrt(area) / Math.pow(mass, 0.6);
    return { c, L, h, E, f1, mass, area, gain, modes };
}
/** T60 (s) of a mode given its decay rate. */
export const t60 = (alpha) => 6.91 / alpha;
//# sourceMappingURL=body.js.map