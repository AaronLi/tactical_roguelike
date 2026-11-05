/*
 * The GESTURE: turn impact / friction / snap parameters into the force that
 * flows between the two bodies.
 *
 * Two outputs:
 *  - discrete events (hits, bounces, snaps, seats): each is a momentum impulse J
 *    delivered over a Hertzian contact time τ, at some spot on each body. Each
 *    event can strike a different spot, so each excites the modes differently.
 *  - a continuous friction force (slide / scrape / squeak / creak), plus a trace of
 *    where on body A the contact is, since sliding moves the contact point.
 *
 * Contact time (Hertz):  τ = 2.87 · (m² / (R · E*² · v))^(1/5)
 * Hard metal-on-metal hits last ~20-60 µs (bright), plastic ~200-500 µs (dull),
 * rubber several ms. The spectrum of the force pulse rolls off above ~1/τ.
 */
import { clamp, hash1, smoothstep, valueNoise } from './dsp.js';
const NU2 = 0.09; // Poisson's ratio² (≈0.3²)
export const T0 = 0.03; // pre-roll before the gesture starts, s
// Gains that put the three gesture layers in the same ballpark at their default settings.
const K_TEXTURE = 6e-8;
const K_HISS = 1e-8;
const K_STICK = 7.5e-6;
const K_CREAK = 2.5e-7;
const K_SNAP = 0.02;
export function makeContact(A, B, contactRadiusMm) {
    const Estar = 1 / ((1 - NU2) / A.E + (1 - NU2) / B.E);
    const mEff = (A.mass * B.mass) / (A.mass + B.mass);
    const R = Math.max(0.0001, contactRadiusMm / 1000);
    const tauAt = (v) => {
        const vv = Math.max(0.01, v);
        const tau = 2.87 * Math.pow((mEff * mEff) / (R * Estar * Estar * vv), 0.2);
        return clamp(tau, 5e-6, 0.02);
    };
    return { Estar, mEff, tauAt };
}
function speedShape(profile, u, strokes) {
    switch (profile) {
        case 'steady':
            return smoothstep(0, 0.08, u) * (1 - smoothstep(0.9, 1, u));
        case 'accelerate':
            return 0.08 + 0.92 * u * u;
        case 'decelerate':
            return (1 - u) * (1 - u) * 0.95 + 0.05;
        case 'swell':
            return Math.sin(Math.PI * u);
        case 'backforth':
            // Signed: the contact reverses direction each stroke and reads the texture backwards.
            return Math.sin(Math.PI * Math.max(1, Math.round(strokes)) * u);
    }
}
export function buildExcitation(p, A, contact, sr, N, rng) {
    const events = [];
    const cont = new Float32Array(N);
    const posA = new Float32Array(N);
    const endT = N / sr - 0.05;
    const basePosA = 0.15 + 0.7 * rng();
    const basePosB = 0.15 + 0.7 * rng();
    const nearby = (base, spread) => clamp(base + spread * (rng() * 2 - 1), 0.02, 0.98);
    posA.fill(basePosA);
    // ---------- Impact + bounces ----------
    const im = p.impact;
    if (im.velocity > 0.001) {
        const e = clamp(im.restitution, 0, 0.95);
        const sc = clamp(im.scatter, 0, 1);
        let v = im.velocity;
        let t = T0;
        for (let k = 0; k < 60 && t < endT; k++) {
            const J = contact.mEff * v * (1 + e);
            events.push({
                t, J, tau: contact.tauAt(v), kind: k === 0 ? 'impact' : 'bounce',
                posA: nearby(basePosA, 0.05 + 0.45 * sc * (k > 0 ? 1 : 0)), posB: nearby(basePosB, 0.5 * sc), flex: 1,
            });
            // A tumbling object lands on one end and then the other: a quick secondary hit.
            if (sc > 0 && rng() < sc * 0.7) {
                const dt = 0.003 + 0.022 * rng();
                const vv = v * (0.3 + 0.6 * rng());
                events.push({
                    t: t + dt, J: contact.mEff * vv * (1 + e), tau: contact.tauAt(vv), kind: 'clatter',
                    posA: nearby(basePosA, 0.5), posB: rng(), flex: 0.6,
                });
            }
            const vOut = v * e * (1 + sc * 0.5 * (rng() - 0.5));
            const flight = (2 * vOut) / 9.81;
            if (vOut < 0.02 || flight < 0.0025)
                break;
            t += flight * (1 + sc * 0.6 * (rng() - 0.5));
            v = vOut;
        }
    }
    // ---------- Friction: slide / scrape / squeak ----------
    const fr = p.friction;
    const lowpassCeil = clamp(0.6 / contact.tauAt(0.5), 400, sr * 0.45);
    if (fr.force > 0.001 && fr.duration > 0.01) {
        const n0 = Math.round(T0 * sr);
        const len = Math.min(N - n0, Math.round(fr.duration * sr));
        const depth = Math.max(0, fr.roughness) * 1e-6; // m
        const grain = Math.max(0.005, fr.grain) * 1e-3; // m
        const P = clamp(fr.periodicity, 0, 1);
        const ss = clamp(fr.stickSlip, 0, 1);
        const seed = Math.floor(rng() * 1e9);
        const width = Math.max(0.001, fr.contactWidth) * 1e-3;
        const speed = Math.max(0.001, fr.speed);
        const fadeIn = Math.min(0.02 * sr, len / 4);
        const fadeOut = Math.min(0.03 * sr, len / 4);
        const octaves = 6;
        let norm = 0;
        for (let o = 0; o < octaves; o++)
            norm += Math.pow(0.55, o);
        const texture = (x) => {
            const u = x / grain;
            let h = 0;
            if (P < 1) {
                let s = 0;
                for (let o = 0; o < octaves; o++)
                    s += Math.pow(0.55, o) * valueNoise(u * Math.pow(2, o), seed + o * 7919);
                h += (1 - P) * (s / norm);
            }
            if (P > 0) {
                const i = Math.floor(u);
                const f = u - i;
                const amp = 1 + (1 - P) * 0.6 * hash1(i, seed + 3) + 0.15 * hash1(i, seed + 5);
                const ridge = f < 0.8 ? f / 0.8 : (1 - f) / 0.2; // slow climb, sudden drop: a click per ridge
                h += P * ridge * amp;
            }
            return h * depth;
        };
        let x = 0;
        let hPrev = texture(0);
        let lp1 = 0;
        let lp2 = 0;
        let ssPhase = 0;
        let ssThr = 1;
        for (let i = 0; i < len; i++) {
            const n = n0 + i;
            const u = i / len;
            const v = speed * speedShape(fr.profile, u, fr.strokes);
            const av = Math.abs(v);
            const env = Math.min(1, i / fadeIn, (len - i) / fadeOut);
            const Fn = fr.force * env;
            x += v / sr;
            const hNow = texture(x);
            const dhdt = (hNow - hPrev) * sr;
            hPrev = hNow;
            let f = K_TEXTURE * Fn * (dhdt / 0.001);
            f += K_HISS * Fn * Math.sqrt(av) * Math.sqrt(1 + fr.roughness) * (rng() * 2 - 1);
            // Stick-slip: force builds while stuck, drops when it slips. Its rate follows speed.
            if (ss > 0 && av > 1e-4) {
                ssPhase += (fr.stickPitch * Math.sqrt(av / speed)) / sr;
                if (ssPhase >= ssThr) {
                    ssPhase -= ssThr;
                    ssThr = 1 + (1 - ss) * 0.9 * (rng() - 0.3);
                }
                f += K_STICK * ss * Fn * (ssPhase / ssThr - 0.5) * (0.5 + 0.5 * ss);
            }
            // Texture finer than the micro-contacts averages out; soft materials can't follow fast detail.
            const fc = clamp((3 * av) / width, 150, lowpassCeil);
            const a = 1 - Math.exp((-2 * Math.PI * fc) / sr);
            lp1 += a * (f - lp1);
            lp2 += a * (lp1 - lp2);
            cont[n] += lp2;
            posA[n] = basePosA + x / A.L;
        }
        for (let n = n0 + len; n < N; n++)
            posA[n] = posA[Math.max(0, n0 + len - 1)];
    }
    // ---------- Snaps: load (creak) → release (click) → seat ----------
    const sn = p.snap;
    const count = Math.round(sn.count);
    if (count > 0) {
        const pre = Math.max(0, sn.preload) / 1000;
        const strength = clamp(sn.strength, 0, 1);
        for (let k = 0; k < count; k++) {
            const tSnap = T0 + pre + k * Math.max(0.005, sn.spacing / 1000);
            if (tSnap > endT)
                break;
            const J = K_SNAP * strength * (0.8 + 0.4 * rng());
            // Stored elastic energy releases faster than an ordinary collision: a sharper pulse.
            events.push({ t: tSnap, J, tau: contact.tauAt(1.5) * 0.35, kind: 'snap', posA: nearby(basePosA, 0.1), posB: nearby(basePosB, 0.1), flex: 3 });
            if (sn.seat > 0) {
                const ts = tSnap + Math.max(0.5, sn.seatDelay) / 1000;
                events.push({ t: ts, J: J * clamp(sn.seat, 0, 1) * 0.8, tau: contact.tauAt(0.5), kind: 'seat', posA: nearby(basePosA, 0.3), posB: nearby(basePosB, 0.3), flex: 1 });
            }
            // Creak: slow, irregular stick-slip that speeds up and grows as the part is loaded.
            if (sn.creak > 0 && pre > 0.002) {
                const nA = Math.max(0, Math.round((tSnap - pre) * sr));
                const nB = Math.min(N, Math.round(tSnap * sr));
                let ph = 0;
                let thr = 1;
                let l1 = 0;
                let l2 = 0;
                const a = 1 - Math.exp((-2 * Math.PI * Math.min(lowpassCeil, 9000)) / sr);
                for (let n = nA; n < nB; n++) {
                    const u = (n - nA) / Math.max(1, nB - nA);
                    ph += (25 + 220 * u * u) / sr;
                    if (ph >= thr) {
                        ph -= thr;
                        thr = 0.6 + 0.8 * rng();
                    }
                    const f = K_CREAK * sn.creak * strength * (0.2 + 0.8 * u) * (ph / thr - 0.5);
                    l1 += a * (f - l1);
                    l2 += a * (l1 - l2);
                    cont[n] += l2;
                }
            }
        }
    }
    // Micro-contacts: a real collision is rarely one clean touch. Edges, burrs and the
    // body's own vibration make it touch again within a few ms ("clack", not "ping").
    const chatter = [];
    const sc = clamp(p.impact.scatter, 0, 1);
    for (const ev of events) {
        if (ev.kind === 'snap')
            continue;
        const n = Math.floor(rng() * (1.5 + 3.5 * sc) + 0.6);
        let t = ev.t;
        let J = ev.J;
        for (let k = 0; k < n; k++) {
            t += 0.0002 + 0.0035 * rng() * (0.3 + sc);
            J *= 0.2 + 0.4 * rng();
            chatter.push({ t, J, tau: ev.tau * (0.6 + 0.8 * rng()), posA: nearby(ev.posA, 0.2), posB: nearby(ev.posB, 0.2), kind: 'chatter', flex: 0 });
        }
    }
    events.push(...chatter);
    events.sort((a, b) => a.t - b.t);
    return { events, cont, posA };
}
/** Discrete force pulse for an event: a half-sine of width τ whose samples sum to J. */
export function eventPulse(ev, sr) {
    const w = Math.max(1, Math.round(ev.tau * sr));
    const data = new Float32Array(w);
    let s = 0;
    for (let i = 0; i < w; i++) {
        data[i] = Math.sin((Math.PI * (i + 0.5)) / w);
        s += data[i];
    }
    for (let i = 0; i < w; i++)
        data[i] *= ev.J / s;
    return { start: Math.round(ev.t * sr), data };
}
//# sourceMappingURL=excitation.js.map