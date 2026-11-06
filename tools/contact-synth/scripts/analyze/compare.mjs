// Usage: node scripts/analyze/compare.mjs <scene-a> <scene-b> [<scene-a> <scene-b> ...]
// How close two scenes are (e.g. a first attempt from measurements against the hand-tuned one): their lengths,
// when the loudest moment comes, brightness (spectral centroid, share above 3 kHz), and the RMS difference of their
// third-octave spectra (dB; under ~3 dB is close, 3-6 noticeably different, over 6 a different sound). Dry.
import { SCENES, renderScene } from '../../dist/index.js';
const sr = 48000;
const bands = []; for (let f = 100; f < 16000; f *= Math.pow(2, 1 / 3)) bands.push(f);
function fft(re, im) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) { let bit = n >> 1; for (; j & bit; bit >>= 1) j ^= bit; j ^= bit; if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; } }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len;
    for (let i = 0; i < n; i += len) for (let k = 0; k < len / 2; k++) {
      const c = Math.cos(ang * k), s = Math.sin(ang * k), p = i + k, q = p + len / 2;
      const xr = re[q] * c - im[q] * s, xi = re[q] * s + im[q] * c;
      re[q] = re[p] - xr; im[q] = im[p] - xi; re[p] += xr; im[p] += xi;
    }
  }
}
function analyse(id) {
  const x = renderScene(SCENES.find((s) => s.id === id), sr, 1, { dry: true }).mix;
  let pk = 0, pi = 0; for (let i = 0; i < x.length; i++) if (Math.abs(x[i]) > pk) { pk = Math.abs(x[i]); pi = i; }
  let on = 0; for (let i = 0; i < x.length; i++) if (Math.abs(x[i]) > pk * 0.03) { on = i; break; }
  const N = 2048, spec = new Float64Array(N / 2), re = new Float64Array(N), im = new Float64Array(N);
  for (let o = 0; o + N <= x.length; o += N / 2) {
    for (let i = 0; i < N; i++) { re[i] = (0.5 - 0.5 * Math.cos(2 * Math.PI * i / N)) * x[o + i]; im[i] = 0; }
    fft(re, im);
    for (let k = 1; k < N / 2; k++) spec[k] += re[k] * re[k] + im[k] * im[k];
  }
  let num = 0, den = 0, hi = 0; for (let k = 1; k < N / 2; k++) { const f = k * sr / N; num += f * spec[k]; den += spec[k]; if (f > 3000) hi += spec[k]; }
  const b = bands.map((f) => { let e = 0; for (let k = 1; k < N / 2; k++) { const fk = k * sr / N; if (fk >= f / Math.pow(2, 1 / 6) && fk < f * Math.pow(2, 1 / 6)) e += spec[k]; } return 10 * Math.log10(e / den + 1e-12); });
  return { len: x.length / sr, peakAt: (pi - on) / sr, centroid: num / den, hi: hi / den, b };
}
const a = process.argv.slice(2);
for (let i = 0; i + 1 < a.length; i += 2) {
  const p = analyse(a[i]), q = analyse(a[i + 1]);
  const d = Math.sqrt(p.b.reduce((s, v, j) => s + (v - q.b[j]) ** 2, 0) / p.b.length);
  const row = (n, r) => `  ${n.padEnd(30)} ${r.len.toFixed(2)} s, loudest ${(r.peakAt * 1000).toFixed(0).padStart(4)} ms in, centroid ${r.centroid.toFixed(0).padStart(5)} Hz, >3k ${(r.hi * 100).toFixed(0).padStart(2)}%`;
  console.log(row(a[i], p)); console.log(row(a[i + 1], q)); console.log(`  spectral difference ${d.toFixed(1)} dB`);
  if (process.env.BANDS) console.log("  band  " + bands.map((f, j) => `${f < 1000 ? f.toFixed(0) : (f / 1000).toFixed(1) + "k"}:${(q.b[j] - p.b[j]).toFixed(0)}`).join(" "));
  console.log("");
}
