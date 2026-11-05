/*
 * Body sound from scratch: filtered noise, gated by decaying envelopes.
 *
 * Each component of a body (see body.ts) is rendered two ways and summed:
 *
 *  1. Struck: its own white-noise source through a band-pass at the component's
 *     centre and bandwidth, multiplied by an envelope. Every contact event kicks
 *     the envelope up by an amount set by the event's momentum, its contact time
 *     (short contacts reach high bands, long ones don't), and a random weight
 *     for where it hit, so no two hits colour the bands the same way. The
 *     envelope then decays at the component's damping rate.
 *
 *  2. Rubbed: the friction force (itself a noise-like texture signal) through a
 *     band-pass of the same shape. This is the classic source → body-filter
 *     path: the scrape is coloured by the body it's scraping.
 *
 * Narrow (tonal) components give a pitched but slightly unsteady ring; wide
 * ones give the noisy "clank / wash" that dense-mode objects actually make.
 */
import { clamp } from './dsp.js';
const BLOCK = 32;
/** Scales the rubbed path against the struck path. */
const FRICTION_GAIN = 1100;
/** Spectrum of a contact pulse lasting tau: flat, then falling 12 dB/octave above ~1/tau. */
export const contactSpectrum = (f, tau) => {
    const x = 1.2 * f * tau;
    return 1 / Math.sqrt(1 + x * x * x * x);
};
function bandpass(f, bw, sr) {
    const w0 = (2 * Math.PI * clamp(f, 10, sr * 0.49)) / sr;
    const Q = clamp(f / Math.max(0.05, bw), 0.3, 20000);
    const al = Math.sin(w0) / (2 * Q);
    const a0 = 1 + al;
    return { b0: al / a0, b2: -al / a0, a1: (-2 * Math.cos(w0)) / a0, a2: (1 - al) / a0 };
}
export function renderBody(comps, input, sr, N) {
    const out = new Float32Array(N);
    const { cont, posTrace, pitch, events } = input;
    let firstCont = -1;
    let lastCont = -1;
    for (let i = 0; i < N; i++)
        if (cont[i] !== 0) {
            firstCont = i;
            break;
        }
    for (let i = N - 1; i >= 0; i--)
        if (cont[i] !== 0) {
            lastCont = i;
            break;
        }
    const evSamples = events.map((e) => Math.round(e.t * sr));
    // Deterministic per-run noise.
    let s = (input.seed * 2654435761) >>> 0 || 1;
    const noise = () => {
        // xorshift32, sum of three uniforms → roughly Gaussian with unit variance
        let acc = 0;
        for (let i = 0; i < 3; i++) {
            s ^= s << 13;
            s >>>= 0;
            s ^= s >>> 17;
            s ^= s << 5;
            s >>>= 0;
            acc += s / 4294967296;
        }
        return (acc - 1.5) * 2;
    };
    for (let ci = 0; ci < comps.length; ci++) {
        const c = comps[ci];
        // Per-event kick for this component.
        const kicks = new Float32Array(events.length);
        let anyKick = false;
        for (let e = 0; e < events.length; e++) {
            const ev = events[e];
            const pos = input.which === 'A' ? ev.posA : ev.posB;
            const spatial = c.tonal
                ? Math.abs(Math.sin(Math.PI * c.k * pos + c.theta))
                : 0.35 + 0.65 * Math.abs(Math.sin(Math.PI * c.k * pos + c.theta + e * 2.399));
            kicks[e] = ev.J * contactSpectrum(c.f, ev.tau) * spatial * c.amp;
            if (kicks[e] > 0)
                anyKick = true;
        }
        const r = Math.exp(-c.alpha / sr);
        // Unit-variance noise through a 0 dB-peak band-pass has RMS sqrt(π·bw/sr): undo that.
        const noiseNorm = 1 / Math.sqrt((Math.PI * Math.max(0.05, c.bw)) / sr);
        // A narrow resonance builds up more from continuous rubbing (gain ~ sqrt(Q)).
        const fricGain = FRICTION_GAIN * c.amp * clamp(Math.sqrt(c.f / c.bw / 8), 1, 40);
        let bq = bandpass(c.f, c.bw, sr);
        // Range to process.
        const lastEv = anyKick ? Math.max(...evSamples) : -1;
        const startEv = anyKick ? Math.min(...evSamples) : N;
        const evEnd = anyKick ? Math.min(N, lastEv + Math.ceil((11.5 / c.alpha) * sr)) : -1;
        const fricTail = Math.ceil((6 / (Math.PI * Math.max(0.05, c.bw))) * sr);
        const fricEnd = lastCont >= 0 ? Math.min(N, lastCont + fricTail) : -1;
        const start = Math.max(0, Math.min(startEv, firstCont >= 0 ? firstCont : N));
        const end = Math.max(evEnd, fricEnd);
        if (end <= start)
            continue;
        let env = 0;
        let nx1 = 0, nx2 = 0, ny1 = 0, ny2 = 0; // noise filter state
        let fx1 = 0, fx2 = 0, fy1 = 0, fy2 = 0; // friction filter state
        // Start the noise filter in its steady state (a narrow band-pass would otherwise take
        // ~1/bw seconds to build up and the ring would fade in).
        {
            const w0 = (2 * Math.PI * c.f) / sr;
            const A = Math.SQRT2 * Math.sqrt((Math.PI * Math.max(0.05, c.bw)) / sr) * (0.75 + 0.5 * ((s >>> 8) / 16777216));
            const ph = ((s & 0xffff) / 65536) * Math.PI * 2;
            ny1 = A * Math.cos(ph);
            ny2 = A * Math.cos(ph - w0);
            noise();
        }
        let nextEv = 0;
        while (nextEv < events.length && evSamples[nextEv] < start)
            nextEv++;
        let wf = Math.sin(Math.PI * c.k * input.contPos + c.theta);
        for (let b = start; b < end; b += BLOCK) {
            if (pitch)
                bq = bandpass(c.f * pitch[b], c.bw, sr);
            if (posTrace)
                wf = Math.sin(Math.PI * c.k * posTrace[b] + c.theta);
            const blockEnd = Math.min(end, b + BLOCK);
            const doFric = lastCont >= 0 && b <= fricEnd && b + BLOCK >= firstCont;
            for (let n = b; n < blockEnd; n++) {
                while (nextEv < events.length && evSamples[nextEv] === n)
                    env += kicks[nextEv++];
                let y = 0;
                if (env > 1e-12) {
                    const x = noise();
                    const ny = bq.b0 * x + bq.b2 * nx2 - bq.a1 * ny1 - bq.a2 * ny2;
                    nx2 = nx1;
                    nx1 = x;
                    ny2 = ny1;
                    ny1 = ny;
                    y += ny * noiseNorm * env;
                    env *= r;
                }
                if (doFric) {
                    const x = cont[n] * wf;
                    const fy = bq.b0 * x + bq.b2 * fx2 - bq.a1 * fy1 - bq.a2 * fy2;
                    fx2 = fx1;
                    fx1 = x;
                    fy2 = fy1;
                    fy1 = fy;
                    y += fy * fricGain;
                }
                out[n] += y;
            }
        }
    }
    return out;
}
//# sourceMappingURL=bank.js.map