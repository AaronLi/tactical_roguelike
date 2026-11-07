/*
 * ELASTIC layers: springy behaviour beyond plain modal ringing.
 *
 * Flex: a large, slow swing (ruler overhanging a desk, a sheet of metal, a latch
 * arm, a door-stop spring). Modelled as one low damped oscillator kicked by the
 * contact events. Its motion can
 *   - slap the support once per cycle (rattle → new contact events),
 *   - bend the body's ring pitch (wobble: tension / effective length changes),
 *   - be heard directly (tone), when it's fast enough to be audible.
 *
 * Coil: waves travelling along a helical spring are strongly dispersive (speed
 * depends on frequency), so a click comes back as a chirp, again and again: the
 * spring "boing / zing / pew". Modelled as an all-pass dispersion chain feeding a
 * lossy delay loop (the spring-reverb waveguide model).
 */
import { clamp, onePoleCoef } from './dsp.js';
export function runFlex(fp, events, contact, sr, N, rng) {
    if (fp.amount <= 0 || events.length === 0)
        return { y: null, rattle: [] };
    const f = clamp(fp.freq, 0.5, 2000);
    const w = (2 * Math.PI * f) / sr;
    const r = Math.exp(-6.91 / (Math.max(0.01, fp.decay) * sr));
    const c1 = 2 * r * Math.cos(w);
    const c2 = -r * r;
    const drive = new Float32Array(N);
    let Jmax = 0;
    for (const ev of events) {
        const n = Math.round(ev.t * sr);
        if (n >= 0 && n < N)
            drive[n] += ev.J * ev.flex;
        Jmax = Math.max(Jmax, ev.J);
    }
    const y = new Float32Array(N);
    let y1 = 0;
    let y2 = 0;
    let m = 0;
    for (let n = 0; n < N; n++) {
        const v = c1 * y1 + c2 * y2 + drive[n] * Math.sin(w);
        y2 = y1;
        y1 = v;
        y[n] = v;
        const a = Math.abs(v);
        if (a > m)
            m = a;
    }
    if (m <= 0)
        return { y: null, rattle: [] };
    const amt = clamp(fp.amount, 0, 1);
    for (let n = 0; n < N; n++)
        y[n] = (y[n] / m) * amt;
    // Rattle: at each downward zero-crossing (max speed) the swinging part slaps its support,
    // as long as the swing is still bigger than a threshold.
    const rattle = [];
    const rt = clamp(fp.rattle, 0, 1);
    if (rt > 0) {
        const thr = (0.06 + 0.7 * (1 - rt)) * amt;
        let env = 0;
        for (let n = 1; n < N; n++) {
            env = Math.max(env, Math.abs(y[n]));
            if (y[n - 1] > 0 && y[n] <= 0) {
                if (env > thr) {
                    const strength = (env - thr * 0.5) / Math.max(1e-6, amt);
                    const J = Jmax * 0.5 * rt * strength;
                    const t = n / sr;
                    rattle.push({ t, J, tau: contact.tauAt(0.3 + 2 * strength) * 1.3, kind: 'rattle', posA: 0.85 + 0.1 * rng(), posB: 0.5 + 0.1 * rng(), flex: 0 });
                    if (rattle.length > 4000)
                        break;
                }
                env = 0;
            }
        }
    }
    return { y, rattle };
}
/** Pitch multiplier track from the swing: 1 ± a few percent. */
export function wobbleTrack(y, wobble) {
    const out = new Float32Array(y.length);
    const depth = 0.08 * clamp(wobble, 0, 1);
    for (let n = 0; n < y.length; n++)
        out[n] = 1 + depth * y[n];
    return out;
}
class Allpass1 {
    a;
    x1 = 0;
    y1 = 0;
    constructor(a) {
        this.a = a;
    }
    tick(x) {
        const y = this.a * x + this.x1 - this.a * this.y1;
        this.x1 = x;
        this.y1 = y;
        return y;
    }
}
export function runCoil(cp, input, sr) {
    const N = input.length;
    const out = new Float32Array(N);
    const disp = clamp(cp.dispersion, 0, 1);
    // Negative coefficient → low frequencies are delayed most → each echo is a falling chirp.
    const a = -(0.15 + 0.73 * disp);
    const preStages = Math.round(6 + 90 * disp);
    const loopStages = Math.round(4 + 16 * disp);
    const pre = [];
    const loop = [];
    for (let i = 0; i < preStages; i++)
        pre.push(new Allpass1(a));
    for (let i = 0; i < loopStages; i++)
        loop.push(new Allpass1(a));
    const loopApDelay = (loopStages * (1 - a)) / (1 + a) * 0.25; // rough mid-band group delay, samples
    const D = Math.max(8, Math.round((clamp(cp.length, 1, 500) / 1000) * sr - loopApDelay));
    const buf = new Float32Array(D);
    let w = 0;
    const T = D / sr;
    const g = Math.pow(10, (-3 * T) / Math.max(0.02, cp.decay));
    const lpA = onePoleCoef(clamp(cp.brightness, 200, sr * 0.45), sr);
    let lp = 0;
    let inLp = 0;
    let dcx = 0;
    let dcy = 0;
    for (let n = 0; n < N; n++) {
        inLp += lpA * (input[n] - inLp);
        let x = inLp;
        for (let i = 0; i < preStages; i++)
            x = pre[i].tick(x);
        let fb = buf[w];
        for (let i = 0; i < loopStages; i++)
            fb = loop[i].tick(fb);
        lp += lpA * (fb - lp);
        const s = x + g * lp;
        // DC block inside the loop keeps it stable.
        const yd = s - dcx + 0.995 * dcy;
        dcx = s;
        dcy = yd;
        buf[w] = yd;
        w = (w + 1) % D;
        out[n] = yd;
    }
    return out;
}
//# sourceMappingURL=elastic.js.map