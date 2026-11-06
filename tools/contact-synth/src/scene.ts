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

import { withPatch, type ParamPatch } from './params.js';
import { render } from './render.js';
import { T0 } from './excitation.js';
import { applyRoom } from './room.js';
import { clamp, dbToGain, makeRng, peak } from './dsp.js';

/**
 * An air column whose length changes over time: a tube closed at one end (by a moving part, e.g. a
 * magazine) and open at the other. Its quarter-wave resonances, (2n−1)·c / 4L, glide as the length
 * changes: a shrinking column rises in pitch (like filling a bottle), a growing one falls. Excited by
 * the turbulence and rubbing of the moving part (band-limited noise following an envelope).
 */
export interface TubeSound {
  kind: 'tube';
  /** Column length at the start and end, cm. */
  fromCm: number;
  toCm: number;
  durationMs: number;
  /** How the length changes: steadily, or speeding up (e.g. a part falling). */
  motion?: 'linear' | 'accelerate';
  /** Resonance sharpness (higher = more whistle-like). */
  q?: number;
}

export interface AirSound {
  kind: 'air';
  /** Band centre, Hz. */
  freq: number;
  /** Band-pass Q (low = breathy whoosh, high = whistle). */
  q: number;
  attackMs: number;
  decayMs: number;
  /** Optional low thump when the projectile leaves (Hz, ms). */
  pop?: { freq: number; ms: number; level: number };
}

export interface ContactSound {
  kind: 'contact';
  patch: ParamPatch;
}

export interface SceneElement {
  /** Label for the cue sheet. */
  what: string;
  /** Outside the scene's enclosure (a handle, a catch the thumb works): heard directly. */
  outside?: boolean;
  /** When the gesture starts, s. */
  at: number;
  gainDb: number;
  sound: ContactSound | AirSound | TubeSound;
}

export interface SceneTrack {
  name: string;
  description: string;
  elements: SceneElement[];
}

export interface Scene {
  id: string;
  title: string;
  /** Enclosure applied to every contact element (unless the element sets its own). */
  housing?: ParamPatch['housing'];
  /** The action is heard through this shell (its receiver or slide): every contact element not marked `outside`. */
  enclosure?: { cutoff: number; leak: number };
  room: number;
  roomSize: number;
  tracks: SceneTrack[];
}

export interface RenderedTrack {
  name: string;
  description: string;
  /** Where this stem starts on the scene timeline, s. */
  start: number;
  samples: Float32Array;
}

export interface RenderedScene {
  sampleRate: number;
  tracks: RenderedTrack[];
  mix: Float32Array;
}

/**
 * Several scenes played one after another as one scene (e.g. a full reload: mag in, charge, mag
 * out). Each part's elements move to its start time, its tracks are kept (named `<label>.<track>`),
 * and its housing goes onto its own contact elements, since the parts may happen in different
 * enclosures (the lower's mag well vs the whole receiver). Room and room size come from the first.
 *
 * Each element is rendered normalised and placed by its gainDb, so levels are only calibrated
 * within a scene; `gainDb` per part sets the balance between scenes (e.g. a magazine going in
 * against the bolt slamming home).
 */
export function chainScenes(id: string, title: string, parts: { label: string; at: number; scene: Scene; gainDb?: number }[]): Scene {
  const tracks: SceneTrack[] = [];
  for (const { label, at, scene, gainDb = 0 } of parts) {
    for (const tr of scene.tracks) {
      tracks.push({
        name: `${label}.${tr.name}`,
        description: tr.description,
        elements: tr.elements.map((el) => {
          let sound = el.sound;
          if (sound.kind === 'contact' && scene.housing) {
            sound = { ...sound, patch: { ...sound.patch, housing: { ...scene.housing, ...sound.patch.housing } } };
          }
          if (sound.kind === 'contact' && scene.enclosure && !el.outside && !sound.patch.out?.enclosure) {
            sound = { ...sound, patch: { ...sound.patch, out: { ...sound.patch.out, enclosure: scene.enclosure } } };
          }
          return { ...el, at: el.at + at, gainDb: el.gainDb + gainDb, sound };
        }),
      });
    }
  }
  return { id, title, room: parts[0].scene.room, roomSize: parts[0].scene.roomSize, tracks };
}

function renderAir(a: AirSound, sr: number, seed: number): Float32Array {
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
    x2 = x1; x1 = x; y2 = y1; y1 = y;
    out[n] = y;
  }
  const pk = peak(out);
  if (pk > 0) for (let n = 0; n < len; n++) out[n] /= pk;
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

function renderTube(tu: TubeSound, sr: number, seed: number): Float32Array {
  const len = Math.max(16, Math.round((tu.durationMs / 1000) * sr));
  const out = new Float32Array(len);
  const rng = makeRng(seed);
  const q = Math.max(1, tu.q ?? 6);
  const modes = 4;
  const st = Array.from({ length: modes }, () => ({ x1: 0, x2: 0, y1: 0, y2: 0 }));
  let co = st.map(() => ({ b0: 0, b2: 0, a1: 0, a2: 0 }));
  for (let n = 0; n < len; n++) {
    const u = n / len;
    if (n % 32 === 0) {
      const p = tu.motion === 'accelerate' ? u * u : u;
      const L = Math.max(0.3, tu.fromCm + (tu.toCm - tu.fromCm) * p) / 100;
      co = st.map((_, k) => {
        const f = Math.min(sr * 0.45, ((2 * k + 1) * 343) / (4 * L));
        const w0 = (2 * Math.PI * f) / sr;
        const al = Math.sin(w0) / (2 * q);
        const a0 = 1 + al;
        return { b0: al / a0, b2: -al / a0, a1: (-2 * Math.cos(w0)) / a0, a2: (1 - al) / a0 };
      });
    }
    // Envelope: in with the motion, out as it stops. The air is stirred by the moving part, so it
    // is as loud as the part is fast: an accelerating part starts nearly silent (speed ∝ u, the
    // turbulent noise rising faster than the speed).
    const speed = tu.motion === 'accelerate' ? 0.05 + 0.95 * Math.pow(u, 1.5) : 1;
    const env = Math.min(1, u / 0.12, (1 - u) / 0.15) * speed;
    const x = (rng() * 2 - 1) * env;
    let y = 0;
    for (let k = 0; k < modes; k++) {
      const c = co[k];
      const s2 = st[k];
      const yk = c.b0 * x + c.b2 * s2.x2 - c.a1 * s2.y1 - c.a2 * s2.y2;
      s2.x2 = s2.x1; s2.x1 = x; s2.y2 = s2.y1; s2.y1 = yk;
      y += yk / (k + 1);
    }
    out[n] = y;
  }
  const pk = peak(out);
  if (pk > 0) for (let n = 0; n < len; n++) out[n] /= pk;
  return out;
}

function renderElement(el: SceneElement, sr: number, seed: number, housing?: ParamPatch['housing'], enclosure?: Scene['enclosure']): { offset: number; samples: Float32Array } {
  if (el.sound.kind === 'air') return { offset: el.at, samples: renderAir(el.sound, sr, seed) };
  if (el.sound.kind === 'tube') return { offset: el.at, samples: renderTube(el.sound, sr, seed) };
  const patch = housing ? { ...el.sound.patch, housing: { ...housing, ...el.sound.patch.housing } } : el.sound.patch;
  const p = withPatch(patch);
  p.out.room = 0;
  if (enclosure && !el.outside && !el.sound.patch.out?.enclosure) p.out.enclosure = enclosure;
  if (!el.sound.patch.out?.seed) p.out.seed = seed;
  const r = render(p, sr);
  // render() starts T0 before the gesture.
  return { offset: el.at - T0, samples: r.samples };
}

/**
 * Render a scene's tracks and their mix. `dry`: no room at all (the scene's own room is left out), so the sound can
 * go through a game's own real-time acoustics. What stays is the object itself, the air spaces inside it included.
 */
export function renderScene(scene: Scene, sr = 48000, seed = 1, opts: { dry?: boolean } = {}): RenderedScene {
  const raw: { track: SceneTrack; start: number; samples: Float32Array }[] = [];
  let k = 0;
  for (const track of scene.tracks.filter((tr) => tr.elements.length > 0)) {
    const parts = track.elements.map((el) => ({ el, ...renderElement(el, sr, seed * 1000 + ++k, scene.housing, scene.enclosure) }));
    const start = Math.min(...parts.map((p) => p.offset));
    const end = Math.max(...parts.map((p) => p.offset + p.samples.length / sr));
    const tail = scene.room > 0 && !opts.dry ? 0.25 + 0.5 * scene.roomSize : 0;
    let buf: Float32Array = new Float32Array(Math.ceil((end - start + tail) * sr));
    for (const p of parts) {
      const g = dbToGain(p.el.gainDb);
      const o = Math.round((p.offset - start) * sr);
      for (let i = 0; i < p.samples.length; i++) if (o + i >= 0 && o + i < buf.length) buf[o + i] += p.samples[i] * g;
    }
    if (!opts.dry) buf = applyRoom(buf, scene.room, scene.roomSize, sr);
    raw.push({ track, start, samples: buf });
  }
  // The mix starts with the first sound; stem start times are relative to it.
  const origin = Math.min(...raw.map((r) => r.start));
  for (const r of raw) r.start -= origin;
  const total = Math.max(...raw.map((r) => Math.round(r.start * sr) + r.samples.length));
  const mix = new Float32Array(total);
  for (const r of raw) {
    const o = Math.round(r.start * sr);
    for (let i = 0; i < r.samples.length; i++) mix[o + i] += r.samples[i];
  }
  // One scale factor for everything: stems keep their balance and sum to the mix.
  const g = 0.89 / Math.max(1e-9, peak(mix));
  for (let i = 0; i < mix.length; i++) mix[i] *= g;
  const tracks = raw.map((r) => {
    for (let i = 0; i < r.samples.length; i++) r.samples[i] *= g;
    return { name: r.track.name, description: r.track.description, start: r.start, samples: r.samples };
  });
  return { sampleRate: sr, tracks, mix };
}
