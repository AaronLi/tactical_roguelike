// A small Schroeder/Freeverb-style room so dry contact sounds can sit in a space.
import { clamp } from './dsp.js';
export function applyRoom(dry, amount, size, sr) {
    const a = clamp(amount, 0, 1);
    if (a <= 0)
        return dry;
    const s = clamp(size, 0, 1);
    const scale = (sr / 44100) * (0.35 + 0.9 * s);
    const combDelays = [1116, 1188, 1277, 1356, 1422, 1491].map((d) => Math.max(8, Math.round(d * scale)));
    const apDelays = [556, 441, 341].map((d) => Math.max(4, Math.round(d * scale)));
    const fb = 0.7 + 0.26 * s;
    const damp = 0.35;
    const N = dry.length;
    const wet = new Float32Array(N);
    for (const D of combDelays) {
        const buf = new Float32Array(D);
        let idx = 0;
        let lp = 0;
        for (let n = 0; n < N; n++) {
            const y = buf[idx];
            lp = y * (1 - damp) + lp * damp;
            buf[idx] = dry[n] * 0.015 + lp * fb;
            idx = (idx + 1) % D;
            wet[n] += y;
        }
    }
    for (const D of apDelays) {
        const buf = new Float32Array(D);
        let idx = 0;
        for (let n = 0; n < N; n++) {
            const b = buf[idx];
            const x = wet[n];
            buf[idx] = x + b * 0.5;
            wet[n] = b - x * 0.5;
            idx = (idx + 1) % D;
        }
    }
    const out = new Float32Array(N);
    const dryG = 1 - 0.35 * a;
    const wetG = 1.6 * a;
    for (let n = 0; n < N; n++)
        out[n] = dry[n] * dryG + wet[n] * wetG;
    return out;
}
//# sourceMappingURL=room.js.map