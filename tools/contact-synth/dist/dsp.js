// Small DSP and math helpers shared by the engine.
export const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
export const lerp = (a, b, t) => a + (b - a) * t;
export const smoothstep = (a, b, x) => {
    const t = clamp((x - a) / (b - a), 0, 1);
    return t * t * (3 - 2 * t);
};
export const dbToGain = (db) => Math.pow(10, db / 20);
/** Deterministic PRNG (mulberry32). */
export function makeRng(seed) {
    let s = (seed >>> 0) || 1;
    return () => {
        s = (s + 0x6d2b79f5) | 0;
        let t = s;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}
/** Integer hash to [-1, 1), used for lattice noise. */
export function hash1(i, seed) {
    let h = Math.imul(i | 0, 0x27d4eb2d) ^ Math.imul(seed | 0, 0x165667b1);
    h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
    h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
    h ^= h >>> 16;
    return (h >>> 0) / 2147483648 - 1;
}
/** Smooth 1-D value noise in [-1, 1]. */
export function valueNoise(x, seed) {
    const i = Math.floor(x);
    const f = x - i;
    const u = f * f * (3 - 2 * f);
    return hash1(i, seed) * (1 - u) + hash1(i + 1, seed) * u;
}
/** One-pole low-pass coefficient for a cutoff in Hz. */
export const onePoleCoef = (fc, sr) => 1 - Math.exp((-2 * Math.PI * fc) / sr);
export function peak(x) {
    let m = 0;
    for (let i = 0; i < x.length; i++) {
        const a = Math.abs(x[i]);
        if (a > m)
            m = a;
    }
    return m;
}
export function rms(x) {
    let s = 0;
    for (let i = 0; i < x.length; i++)
        s += x[i] * x[i];
    return Math.sqrt(s / Math.max(1, x.length));
}
/** In-place first-order high-pass (DC / rumble removal). */
export function highpassInPlace(x, fc, sr) {
    const a = Math.exp((-2 * Math.PI * fc) / sr);
    let xp = 0;
    let yp = 0;
    for (let i = 0; i < x.length; i++) {
        const y = a * (yp + x[i] - xp);
        xp = x[i];
        yp = y;
        x[i] = y;
    }
}
/**
 * Through a shell's walls: two-pole low-pass at `fc` (12 dB an octave), plus `leak` of the original
 * straight through (openings). The low end is kept at its level; the highs drop toward `leak`.
 */
export function enclose(x, fc, leak, sr) {
    const a = 1 - Math.exp((-2 * Math.PI * clamp(fc, 50, sr * 0.45)) / sr);
    const k = clamp(leak, 0, 1);
    let l1 = 0, l2 = 0;
    for (let i = 0; i < x.length; i++) {
        l1 += a * (x[i] - l1);
        l2 += a * (l1 - l2);
        x[i] = (1 - k) * l2 + k * x[i];
    }
}
/** out += src * g */
export function mixInto(out, src, g) {
    if (g === 0)
        return;
    for (let i = 0; i < out.length; i++)
        out[i] += src[i] * g;
}
//# sourceMappingURL=dsp.js.map