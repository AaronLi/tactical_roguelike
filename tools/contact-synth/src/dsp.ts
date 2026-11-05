// Small DSP and math helpers shared by the engine.

export const clamp = (x: number, a: number, b: number): number => Math.min(b, Math.max(a, x));
export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
export const smoothstep = (a: number, b: number, x: number): number => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};
export const dbToGain = (db: number): number => Math.pow(10, db / 20);

/** Deterministic PRNG (mulberry32). */
export function makeRng(seed: number): () => number {
  let s = (seed >>> 0) || 1;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Integer hash to [-1, 1), used for lattice noise. */
export function hash1(i: number, seed: number): number {
  let h = Math.imul(i | 0, 0x27d4eb2d) ^ Math.imul(seed | 0, 0x165667b1);
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  h ^= h >>> 16;
  return (h >>> 0) / 2147483648 - 1;
}

/** Smooth 1-D value noise in [-1, 1]. */
export function valueNoise(x: number, seed: number): number {
  const i = Math.floor(x);
  const f = x - i;
  const u = f * f * (3 - 2 * f);
  return hash1(i, seed) * (1 - u) + hash1(i + 1, seed) * u;
}

/** One-pole low-pass coefficient for a cutoff in Hz. */
export const onePoleCoef = (fc: number, sr: number): number => 1 - Math.exp((-2 * Math.PI * fc) / sr);

export function peak(x: Float32Array): number {
  let m = 0;
  for (let i = 0; i < x.length; i++) {
    const a = Math.abs(x[i]);
    if (a > m) m = a;
  }
  return m;
}

export function rms(x: Float32Array): number {
  let s = 0;
  for (let i = 0; i < x.length; i++) s += x[i] * x[i];
  return Math.sqrt(s / Math.max(1, x.length));
}

/** In-place first-order high-pass (DC / rumble removal). */
export function highpassInPlace(x: Float32Array, fc: number, sr: number): void {
  const a = Math.exp((-2 * Math.PI * fc) / sr);
  let xp = 0;
  let yp = 0;
  for (let i = 0; i < x.length; i++) {
    const y = a * (yp + x[i] - xp);
    xp = x[i];
    yp = y;
    x[i] = y;
  }
}

/** out += src * g */
export function mixInto(out: Float32Array, src: Float32Array, g: number): void {
  if (g === 0) return;
  for (let i = 0; i < out.length; i++) out[i] += src[i] * g;
}
