// Usage: node scripts/analyze/tonal.mjs <scene-id> [<scene-id> ...]
// For each element of a scene: render alone, then measure the tail (30-300 ms after its onset):
// how "peaky" (tonal) the spectrum is, the energy above 3 kHz, and the decay time.
import { SCENES, renderScene } from '../../dist/index.js';
const sr = 48000;
function fftMag(x) {
  const n = x.length; const re = Float64Array.from(x), im = new Float64Array(n);
  for (let i = 1, j = 0; i < n; i++) { let b = n >> 1; for (; j & b; b >>= 1) j ^= b; j ^= b; if (i < j) { [re[i], re[j]] = [re[j], re[i]]; } }
  for (let len = 2; len <= n; len <<= 1) { const a = -2 * Math.PI / len; for (let i = 0; i < n; i += len) for (let k = 0; k < len / 2; k++) {
    const c = Math.cos(a * k), s = Math.sin(a * k); const p = i + k, q = p + len / 2;
    const xr = re[q] * c - im[q] * s, xi = re[q] * s + im[q] * c; re[q] = re[p] - xr; im[q] = im[p] - xi; re[p] += xr; im[p] += xi; } }
  const m = new Float64Array(n / 2); for (let k = 0; k < n / 2; k++) m[k] = Math.hypot(re[k], im[k]); return m;
}
function analyse(x) {
  let pk = 0; for (const v of x) pk = Math.max(pk, Math.abs(v));
  let on = 0; for (let i = 0; i < x.length; i++) if (Math.abs(x[i]) > 0.1 * pk) { on = i; break; }
  const seg = new Float64Array(8192);
  for (let i = 0; i < 8192; i++) { const n = on + Math.round(0.03 * sr) + i; seg[i] = (n < x.length ? x[n] : 0) * (0.5 - 0.5 * Math.cos(2 * Math.PI * i / 8191)); }
  const m = fftMag(seg);
  // peakiness: fraction of tail energy (200 Hz-16 kHz) in bins that are >12 dB above their local median
  let tot = 0, peaky = 0, hi = 0;
  for (let k = 34; k < 2730; k++) {
    const e = m[k] * m[k]; tot += e; if (k * sr / 8192 > 3000) hi += e;
    const loc = Array.from(m.slice(Math.max(0, k - 40), k + 40)).sort((a, b) => a - b)[40];
    if (m[k] > 4 * loc) peaky += e;
  }
  const rms = (a, b) => { let s = 0; for (let i = a; i < b && i < x.length; i++) s += x[i] * x[i]; return Math.sqrt(s / (b - a)); };
  const e0 = rms(on, on + 480), e1 = rms(on + 4800, on + 9600);
  return { tonal: peaky / tot, hiShare: hi / tot, tailDb: 20 * Math.log10((e1 + 1e-12) / (e0 + 1e-12)) };
}
for (const id of process.argv.slice(2)) {
  const sc = SCENES.find((s) => s.id === id);
  console.log('==', id);
  for (const t of sc.tracks) for (const el of t.elements) {
    const one = { ...sc, room: 0, tracks: [{ name: 'x', description: '', elements: [el] }] };
    const r = renderScene(one, sr);
    const a = analyse(r.mix);
    console.log(`  ${el.what.slice(0, 44).padEnd(44)} tonal ${(a.tonal * 100).toFixed(0).padStart(3)}%  >3k ${(a.hiShare * 100).toFixed(0).padStart(3)}%  level@100-200ms ${a.tailDb.toFixed(0)} dB`);
  }
}
