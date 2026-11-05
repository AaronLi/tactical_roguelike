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

import type { Params } from './params.js';
import { deriveBody, t60, type BodyModel } from './body.js';
import { buildExcitation, edgeTau, eventPulse, makeContact, T0 } from './excitation.js';
import { renderBody } from './bank.js';
import { runCoil, runFlex, wobbleTrack } from './elastic.js';
import { applyRoom } from './room.js';
import { clamp, dbToGain, highpassInPlace, makeRng, mixInto, peak } from './dsp.js';

export interface BodyInfo {
  f1: number;
  audibleModes: number;
  lowestHz: number;
  mass: number;
  ringT60: number;
}

export interface RenderInfo {
  a: BodyInfo;
  b: BodyInfo;
  contactMs: number;
  events: number;
  rattles: number;
  durationS: number;
  renderMs: number;
  /** Peak before normalisation (relative loudness between settings). */
  rawPeak: number;
}

export interface RenderResult {
  samples: Float32Array;
  sampleRate: number;
  info: RenderInfo;
}

function bodyInfo(m: BodyModel): BodyInfo {
  let best = 0;
  let bestAmp = -1;
  for (const c of m.components) if (c.amp > bestAmp) { bestAmp = c.amp; best = t60(c.alpha); }
  return { f1: m.f1, audibleModes: m.modeCount, lowestHz: m.lowestHz, mass: m.mass, ringT60: best };
}

/**
 * The sound of the contact itself: a short noise burst per event (plus the friction
 * force). Brightness comes from the contact time: a hard 30 µs touch is a sharp
 * tick, a soft 1 ms one a dull tap.
 */
function contactNoise(events: ReturnType<typeof buildExcitation>['events'], cont: Float32Array, sr: number, N: number, rng: () => number): Float32Array {
  const out = Float32Array.from(cont);
  const burst = (start: number, tau: number, amp: number) => {
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

export function render(p: Params, sampleRate = 48000): RenderResult {
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
  for (const r of flex.rattle) r.edge = baseEdge;
  const events = ex.events.concat(flex.rattle).sort((a, b) => a.t - b.t);
  const pitch = flex.y && p.flex.wobble > 0 ? wobbleTrack(flex.y, p.flex.wobble) : null;

  const seed = p.out.seed;
  const outA = renderBody(A.components, { events, cont: ex.cont, posTrace: ex.posA, contPos: 0.5, which: 'A', pitch, seed: seed * 2 + 1 }, sr, N);
  const outB = renderBody(B.components, { events, cont: ex.cont, posTrace: null, contPos: 0.37, which: 'B', pitch: null, seed: seed * 2 + 2 }, sr, N);

  const mix = new Float32Array(N);
  mixInto(mix, outA, A.gain * dbToGain(p.bodyA.level));
  mixInto(mix, outB, B.gain * dbToGain(p.bodyB.level));
  let ref = peak(mix);
  if (!(ref > 1e-12)) ref = 1;

  // Unweighted contact force: drives the click, the coil and is what a microphone at the contact hears.
  const force = new Float32Array(N);
  force.set(ex.cont);
  for (const ev of events) {
    const { start, data } = eventPulse(ev, sr);
    for (let i = 0; i < data.length; i++) if (start + i < N) force[start + i] += data[i];
  }

  if (p.impact.click > 0) {
    const click = contactNoise(events, ex.cont, sr, N, rng);
    highpassInPlace(click, 400, sr);
    highpassInPlace(click, 400, sr);
    const pk = peak(click);
    if (pk > 0) mixInto(mix, click, (p.impact.click * ref * 0.7) / pk);
  }

  if (p.coil.level > 0) {
    const coil = runCoil(p.coil, force, sr);
    highpassInPlace(coil, 60, sr);
    const pk = peak(coil);
    if (pk > 0) mixInto(mix, coil, (p.coil.level * ref * 1.2) / pk);
  }

  if (flex.y && p.flex.tone > 0) {
    const tone = Float32Array.from(flex.y);
    highpassInPlace(tone, 30, sr);
    const pk = peak(tone);
    if (pk > 0) mixInto(mix, tone, (p.flex.tone * ref * 0.8) / pk);
  }

  highpassInPlace(mix, 20, sr);
  let out = applyRoom(mix, p.out.room, p.out.roomSize, sr);

  // Normalise and trim trailing silence.
  const pk = peak(out);
  if (pk > 0) for (let i = 0; i < N; i++) out[i] *= 0.89 / pk;
  const floor = 0.89 * 3e-4;
  let last = N - 1;
  while (last > 0 && Math.abs(out[last]) < floor) last--;
  const minLen = Math.round((T0 + 0.1) * sr);
  const len = Math.min(N, Math.max(minLen, last + Math.round(0.02 * sr)));
  out = out.slice(0, len);
  const fade = Math.min(len, Math.round(0.03 * sr));
  for (let i = 0; i < fade; i++) out[len - 1 - i] *= i / fade;

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
