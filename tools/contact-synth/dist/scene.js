/*
 * Scenes: sequence several synthesized sounds into named tracks on one timeline.
 *
 * A mechanism (a blaster cycling, a latch opening) is a series of contact sounds,
 * each with its own pair of bodies. A scene lists them as elements placed in
 * time and grouped into tracks. Each track is rendered as its own stem; every
 * stem is scaled by the same factor, so the stems keep their relative levels
 * and sum exactly to the full mix.
 *
 * Besides contact sounds there is one non-contact source, `air`: a burst of
 * band-passed noise for air pushed out of a plunger tube or barrel, with an
 * optional low "pop" for a projectile leaving the muzzle.
 */
import { withPatch } from './params.js';
import { render } from './render.js';
import { T0 } from './excitation.js';
import { applyRoom } from './room.js';
import { clamp, dbToGain, makeRng, peak } from './dsp.js';
function renderAir(a, sr, seed) {
    const len = Math.ceil(((a.attackMs + a.decayMs * 7) / 1000 + 0.02) * sr);
    const out = new Float32Array(len);
    const rng = makeRng(seed);
    const w0 = (2 * Math.PI * clamp(a.freq, 20, sr * 0.45)) / sr;
    const al = Math.sin(w0) / (2 * Math.max(0.2, a.q));
    const a0 = 1 + al;
    const b0 = al / a0, b2 = -al / a0, a1 = (-2 * Math.cos(w0)) / a0, a2 = (1 - al) / a0;
    let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
    const att = Math.max(0.05, a.attackMs) / 1000 * sr;
    const dec = Math.max(0.1, a.decayMs) / 1000 * sr;
    for (let n = 0; n < len; n++) {
        const env = n < att ? n / att : Math.exp(-(n - att) / dec);
        const x = (rng() * 2 - 1) * env;
        const y = b0 * x + b2 * x2 - a1 * y1 - a2 * y2;
        x2 = x1;
        x1 = x;
        y2 = y1;
        y1 = y;
        out[n] = y;
    }
    const pk = peak(out);
    if (pk > 0)
        for (let n = 0; n < len; n++)
            out[n] /= pk;
    if (a.pop) {
        const pl = Math.round((a.pop.ms / 1000) * sr * 3);
        for (let n = 0; n < pl && n < len; n++) {
            const t = n / sr;
            const env = Math.sin(Math.min(Math.PI, (Math.PI * t * 1000) / a.pop.ms)) * Math.exp(-t * 1000 / (a.pop.ms * 1.5));
            out[n] += a.pop.level * env * Math.sin(2 * Math.PI * a.pop.freq * t);
        }
    }
    return out;
}
function renderElement(el, sr, seed, housing) {
    if (el.sound.kind === 'air')
        return { offset: el.at, samples: renderAir(el.sound, sr, seed) };
    const patch = housing ? { ...el.sound.patch, housing: { ...housing, ...el.sound.patch.housing } } : el.sound.patch;
    const p = withPatch(patch);
    p.out.room = 0;
    if (!el.sound.patch.out?.seed)
        p.out.seed = seed;
    const r = render(p, sr);
    // render() starts T0 before the gesture.
    return { offset: el.at - T0, samples: r.samples };
}
export function renderScene(scene, sr = 48000, seed = 1) {
    const raw = [];
    let k = 0;
    for (const track of scene.tracks) {
        const parts = track.elements.map((el) => ({ el, ...renderElement(el, sr, seed * 1000 + ++k, scene.housing) }));
        const start = Math.min(...parts.map((p) => p.offset));
        const end = Math.max(...parts.map((p) => p.offset + p.samples.length / sr));
        const tail = scene.room > 0 ? 0.25 + 0.5 * scene.roomSize : 0;
        let buf = new Float32Array(Math.ceil((end - start + tail) * sr));
        for (const p of parts) {
            const g = dbToGain(p.el.gainDb);
            const o = Math.round((p.offset - start) * sr);
            for (let i = 0; i < p.samples.length; i++)
                if (o + i >= 0 && o + i < buf.length)
                    buf[o + i] += p.samples[i] * g;
        }
        buf = applyRoom(buf, scene.room, scene.roomSize, sr);
        raw.push({ track, start, samples: buf });
    }
    // The mix starts with the first sound; stem start times are relative to it.
    const origin = Math.min(...raw.map((r) => r.start));
    for (const r of raw)
        r.start -= origin;
    const total = Math.max(...raw.map((r) => Math.round(r.start * sr) + r.samples.length));
    const mix = new Float32Array(total);
    for (const r of raw) {
        const o = Math.round(r.start * sr);
        for (let i = 0; i < r.samples.length; i++)
            mix[o + i] += r.samples[i];
    }
    // One scale factor for everything: stems keep their balance and sum to the mix.
    const g = 0.89 / Math.max(1e-9, peak(mix));
    for (let i = 0; i < mix.length; i++)
        mix[i] *= g;
    const tracks = raw.map((r) => {
        for (let i = 0; i < r.samples.length; i++)
            r.samples[i] *= g;
        return { name: r.track.name, description: r.track.description, start: r.start, samples: r.samples };
    });
    return { sampleRate: sr, tracks, mix };
}
//# sourceMappingURL=scene.js.map