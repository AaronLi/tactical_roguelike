/*
 * Modal resonator bank. Each mode is a two-pole resonator
 *   y[n] = 2r·cos(ω)·y[n-1] − r²·y[n-2] + sin(ω)·x[n]
 * whose impulse response is a decaying sine. Its input is the contact force
 * weighted by the mode shape at the point of contact: every event has its own
 * contact spot, and a sliding contact moves across body A over time.
 */
import { eventPulse } from './excitation.js';
const BLOCK = 32;
export function runModes(modes, input, sr, N) {
    const out = new Float32Array(N);
    const scratch = new Float32Array(N);
    const pulses = input.events.map((ev) => eventPulse(ev, sr));
    const { cont, posTrace, pitch } = input;
    let lastCont = -1;
    for (let i = N - 1; i >= 0; i--)
        if (cont[i] !== 0) {
            lastCont = i;
            break;
        }
    const hasCont = lastCont >= 0;
    let lastInput = lastCont;
    for (const pl of pulses)
        lastInput = Math.max(lastInput, pl.start + pl.data.length);
    for (const m of modes) {
        // Event pulses, weighted by this mode's shape at each event's spot.
        let first = N;
        for (let e = 0; e < pulses.length; e++) {
            const ev = input.events[e];
            const pos = input.which === 'A' ? ev.posA : ev.posB;
            const w = Math.sin(Math.PI * m.k * pos + m.theta);
            const { start, data } = pulses[e];
            if (start < first)
                first = start;
            for (let i = 0; i < data.length; i++) {
                const n = start + i;
                if (n >= 0 && n < N)
                    scratch[n] += w * data[i];
            }
        }
        const startN = hasCont ? 0 : Math.max(0, first);
        const r = Math.exp(-m.alpha / sr);
        const w0 = (2 * Math.PI * m.f) / sr;
        let c1 = 2 * r * Math.cos(w0);
        const c2 = -r * r;
        let g = Math.sin(w0) * m.amp;
        let y1 = 0;
        let y2 = 0;
        let wf = Math.sin(Math.PI * m.k * input.contPos + m.theta);
        // Stop once the mode has died away (−100 dB) and there's no more input.
        const tail = Math.ceil((11.5 / m.alpha) * sr);
        const stopN = Math.min(N, lastInput + tail);
        for (let b = startN; b < stopN; b += BLOCK) {
            if (pitch) {
                const wm = w0 * pitch[b];
                c1 = 2 * r * Math.cos(wm);
                g = Math.sin(wm) * m.amp;
            }
            if (posTrace)
                wf = Math.sin(Math.PI * m.k * posTrace[b] + m.theta);
            const end = Math.min(stopN, b + BLOCK);
            for (let n = b; n < end; n++) {
                const x = scratch[n] + wf * cont[n];
                const y = c1 * y1 + c2 * y2 + g * x;
                y2 = y1;
                y1 = y;
                out[n] += y;
            }
        }
        scratch.fill(0);
    }
    return out;
}
//# sourceMappingURL=modal.js.map