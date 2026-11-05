/*
 * render(params) → mono samples. Pure function, no DOM: it runs the same in a
 * browser, a worker or Node, so a game can call it to bake sounds.
 *
 *   gesture ──► contact events + friction force
 *                 │            │
 *                 │            └─► flex swing ──► rattle events, pitch wobble, tone
 *                 ▼
 *   body A modes + body B modes + coil-spring waveguide + contact click
 *                 ▼
 *              room ──► normalise ──► trim
 */

import type { Params } from './params.js';
import { deriveBody, t60, type BodyModel } from './body.js';
import { buildExcitation, eventPulse, makeContact, T0 } from './excitation.js';
import { runModes } from './modal.js';
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
  const lowest = m.modes.length ? Math.min(...m.modes.map((x) => x.f)) : 0;
  let best = 0;
  let bestAmp = -1;
  for (const md of m.modes) if (md.amp > bestAmp) { bestAmp = md.amp; best = t60(md.alpha); }
  return { f1: m.f1, audibleModes: m.modes.length, lowestHz: lowest, mass: m.mass, ringT60: best };
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
  const events = ex.events.concat(flex.rattle).sort((a, b) => a.t - b.t);
  const pitch = flex.y && p.flex.wobble > 0 ? wobbleTrack(flex.y, p.flex.wobble) : null;

  const outA = runModes(A.modes, { events, cont: ex.cont, posTrace: ex.posA, contPos: 0.5, which: 'A', pitch }, sr, N);
  const outB = runModes(B.modes, { events, cont: ex.cont, posTrace: null, contPos: 0.37, which: 'B', pitch: null }, sr, N);

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
    const click = Float32Array.from(force);
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
