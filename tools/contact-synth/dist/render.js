/*
 * render(params) → mono samples. Pure function, no DOM: it runs the same in a
 * browser, a worker or Node, so a game can call it to bake sounds.
 *
 *   gesture ──► contact events + friction force
 *                 │            │
 *                 │            └─► flex swing ──► rattle events, pitch wobble, tone
 *                 ▼
 *   body A + body B (noise bands gated by decaying envelopes) + coil + contact noise
 *                 ▼
 *              room ──► normalise ──► trim
 */
import { deriveBody, t60 } from './body.js';
import { buildExcitation, edgeTau, eventPulse, makeContact, T0 } from './excitation.js';
import { renderBody } from './bank.js';
import { runCoil, runFlex, wobbleTrack } from './elastic.js';
import { applyRoom } from './room.js';
import { clamp, dbToGain, highpassInPlace, makeRng, mixInto, peak } from './dsp.js';
function bodyInfo(m) {
    let best = 0;
    let bestAmp = -1;
    for (const c of m.components)
        if (c.amp > bestAmp) {
            bestAmp = c.amp;
            best = t60(c.alpha);
        }
    return { f1: m.f1, audibleModes: m.modeCount, lowestHz: m.lowestHz, mass: m.mass, ringT60: best };
}
/**
 * The sound of the contact itself: a short noise burst per event (plus the friction
 * force). Brightness comes from the contact time: a hard 30 µs touch is a sharp
 * tick, a soft 1 ms one a dull tap.
 */
function contactNoise(events, cont, sr, N, rng) {
    const out = Float32Array.from(cont);
    const burst = (start, tau, amp) => {
        const decay = Math.max(0.00004, tau * 1.5);
        const len = Math.min(N - start, Math.ceil(decay * 6 * sr) + 2);
        const fc = clamp(0.45 / tau, 300, sr * 0.45);
        const a = 1 - Math.exp((-2 * Math.PI * fc) / sr);
        let l1 = 0;
        let l2 = 0;
        for (let i = 0; i < len; i++) {
            const x = (rng() * 2 - 1) * Math.exp(-i / (decay * sr));
            l1 += a * (x - l1);
            l2 += a * (l1 - l2);
            out[start + i] += l2 * amp;
        }
    };
    for (const ev of events) {
        const start = Math.round(ev.t * sr);
        const edge = ev.edge ?? 0;
        burst(start, ev.tau, ((1 - edge) * ev.J) / Math.sqrt(ev.tau));
        // The edge crack: very short, so it carries the bright "tick" of a hard contact.
        if (edge > 0) {
            const te = edgeTau(ev.tau);
            burst(start, te, (edge * ev.J) / Math.sqrt(te));
        }
    }
    return out;
}
/**
 * The housing: every contact reaches the enclosure through its mounts and joints,
 * which pass the push but smear the sharpest detail (contact times stretched), and
 * hit it at scattered spots. Its walls then drive the air box inside: a few
 * resonances from the box's dimensions (L × 0.45L × 0.2L), leaky because the walls
 * are thin and full of gaps.
 */
function renderHousing(p, events, cont, mix, ref, sr, N) {
    const hp = p.housing;
    const rng = makeRng(p.out.seed * 7 + 3);
    const H = deriveBody(hp, sr, rng);
    const hEvents = events.map((e) => ({ ...e, tau: e.tau * 2.5 + 0.0001, posB: rng(), edge: (e.edge ?? 0) * 0.4 }));
    const walls = renderBody(H.components, { events: hEvents, cont, posTrace: null, contPos: 0.3, which: 'B', pitch: null, seed: p.out.seed * 2 + 9 }, sr, N);
    const wpk = peak(walls);
    if (!(wpk > 0))
        return;
    const amount = clamp(hp.amount, 0, 1);
    mixInto(mix, walls, (amount * ref * 1.1) / wpk);
    if (hp.cavity > 0) {
        const L = clamp(hp.size, 0.2, 50) / 100;
        const cw = (hp.cavityWidth ?? 0) / 100;
        const dims = cw > 0 ? [L, Math.min(cw, L), Math.min(cw, L) * 0.85] : [L, 0.45 * L, 0.2 * L];
        const freqs = [];
        for (let l = 0; l <= 10; l++)
            for (let m = 0; m <= 2; m++)
                for (let n = 0; n <= 1; n++) {
                    if (l + m + n === 0)
                        continue;
                    const f = (343 / 2) * Math.sqrt((l / dims[0]) ** 2 + (m / dims[1]) ** 2 + (n / dims[2]) ** 2);
                    if (f < sr * 0.4)
                        freqs.push(f);
                }
        freqs.sort((a, b) => a - b);
        const air = new Float32Array(N);
        for (const f of freqs.slice(0, 8)) {
            const w0 = (2 * Math.PI * f) / sr;
            const al = Math.sin(w0) / (2 * 9);
            const a0 = 1 + al;
            const b0 = al / a0, b2 = -al / a0, a1 = (-2 * Math.cos(w0)) / a0, a2 = (1 - al) / a0;
            let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
            const g = Math.pow(freqs[0] / f, 0.5);
            for (let i = 0; i < N; i++) {
                const x = walls[i];
                const y = b0 * x + b2 * x2 - a1 * y1 - a2 * y2;
                x2 = x1;
                x1 = x;
                y2 = y1;
                y1 = y;
                air[i] += y * g;
            }
        }
        const apk = peak(air);
        if (apk > 0)
            mixInto(mix, air, (clamp(hp.cavity, 0, 1) * amount * ref * 0.9) / apk);
    }
}
export function render(p, sampleRate = 48000) {
    const t0 = typeof performance !== 'undefined' ? performance.now() : Date.now();
    const sr = sampleRate;
    const N = Math.max(256, Math.round(clamp(p.out.length, 0.1, 12) * sr));
    const rng = makeRng(p.out.seed);
    const A = deriveBody(p.bodyA, sr, rng);
    const B = deriveBody(p.bodyB, sr, rng);
    const contact = makeContact(A, B, p.impact.contactRadius);
    const ex = buildExcitation(p, A, contact, sr, N, rng);
    const flex = runFlex(p.flex, ex.events, contact, sr, N, rng);
    const baseEdge = ex.events.find((e) => e.kind !== 'snap' && e.kind !== 'tooth')?.edge ?? ex.events[0]?.edge ?? 0;
    for (const r of flex.rattle)
        r.edge = baseEdge;
    const events = ex.events.concat(flex.rattle).sort((a, b) => a.t - b.t);
    const pitch = flex.y && p.flex.wobble > 0 ? wobbleTrack(flex.y, p.flex.wobble) : null;
    const seed = p.out.seed;
    const outA = renderBody(A.components, { events, cont: ex.cont, posTrace: ex.posA, contPos: 0.5, which: 'A', pitch, seed: seed * 2 + 1 }, sr, N);
    const outB = renderBody(B.components, { events, cont: ex.cont, posTrace: null, contPos: 0.37, which: 'B', pitch: null, seed: seed * 2 + 2 }, sr, N);
    const mix = new Float32Array(N);
    mixInto(mix, outA, A.gain * dbToGain(p.bodyA.level));
    mixInto(mix, outB, B.gain * dbToGain(p.bodyB.level));
    let ref = peak(mix);
    if (!(ref > 1e-12))
        ref = 1;
    // Unweighted contact force: drives the click, the coil and is what a microphone at the contact hears.
    const force = new Float32Array(N);
    force.set(ex.cont);
    for (const ev of events) {
        const { start, data } = eventPulse(ev, sr);
        for (let i = 0; i < data.length; i++)
            if (start + i < N)
                force[start + i] += data[i];
    }
    if (p.impact.click > 0) {
        const click = contactNoise(events, ex.cont, sr, N, rng);
        // A light part radiates its contact as a thin tick; a heavy one (a 300 g bolt carrier)
        // stopping short also pushes air at low frequencies: the weight of the "chunk".
        const clickHp = clamp(400 * Math.pow(0.02 / Math.max(1e-4, contact.mEff), 0.3), 90, 400);
        highpassInPlace(click, clickHp, sr);
        highpassInPlace(click, clickHp, sr);
        const pk = peak(click);
        if (pk > 0)
            mixInto(mix, click, (p.impact.click * ref * 0.7) / pk);
    }
    if (p.coil.level > 0) {
        const coil = runCoil(p.coil, force, sr);
        highpassInPlace(coil, 60, sr);
        const pk = peak(coil);
        if (pk > 0)
            mixInto(mix, coil, (p.coil.level * ref * 1.2) / pk);
    }
    if (flex.y && p.flex.tone > 0) {
        const tone = Float32Array.from(flex.y);
        highpassInPlace(tone, 30, sr);
        const pk = peak(tone);
        if (pk > 0)
            mixInto(mix, tone, (p.flex.tone * ref * 0.8) / pk);
    }
    if (p.housing && p.housing.amount > 0)
        renderHousing(p, events, ex.cont, mix, ref, sr, N);
    highpassInPlace(mix, 20, sr);
    let out = applyRoom(mix, p.out.room, p.out.roomSize, sr);
    // Normalise and trim trailing silence.
    const pk = peak(out);
    if (pk > 0)
        for (let i = 0; i < N; i++)
            out[i] *= 0.89 / pk;
    const floor = 0.89 * 3e-4;
    let last = N - 1;
    while (last > 0 && Math.abs(out[last]) < floor)
        last--;
    const minLen = Math.round((T0 + 0.1) * sr);
    const len = Math.min(N, Math.max(minLen, last + Math.round(0.02 * sr)));
    out = out.slice(0, len);
    const fade = Math.min(len, Math.round(0.03 * sr));
    for (let i = 0; i < fade; i++)
        out[len - 1 - i] *= i / fade;
    const t1 = typeof performance !== 'undefined' ? performance.now() : Date.now();
    return {
        samples: out,
        sampleRate: sr,
        info: {
            a: bodyInfo(A),
            b: bodyInfo(B),
            contactMs: contact.tauAt(Math.max(0.05, p.impact.velocity)) * 1000,
            events: events.length,
            rattles: flex.rattle.length,
            durationS: len / sr,
            renderMs: t1 - t0,
            rawPeak: pk,
        },
    };
}
//# sourceMappingURL=render.js.map