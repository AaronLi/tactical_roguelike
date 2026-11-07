// Usage: node scripts/analyze/summary.mjs <regex on scene id>
// One line per matching scene: length, spectral centroid and share above 3 kHz of the whole mix,
// and the strongest narrow peak in the last 40% (how much it rings out at the end).
import { SCENES, renderScene } from '../../dist/index.js';
const sr = 48000; const re = new RegExp(process.argv[2] ?? '.');
const dft = (x, f) => { let r = 0, m = 0; for (let i = 0; i < x.length; i++) { const w = 0.5 - 0.5 * Math.cos(2 * Math.PI * i / x.length); r += x[i] * w * Math.cos(2 * Math.PI * f * i / sr); m += x[i] * w * Math.sin(2 * Math.PI * f * i / sr); } return Math.hypot(r, m); };
for (const sc of SCENES.filter((s) => re.test(s.id))) {
  const x = renderScene(sc, sr).mix;
  const N = 1024; let num = 0, den = 0, hi = 0;
  for (let o = 0; o + N <= x.length; o += N) for (let k = 4; k < N / 2; k++) { const r = dft(x.subarray(o, o + N), k * sr / N); const e = r * r; num += k * sr / N * e; den += e; if (k * sr / N > 3000) hi += e; }
  const tail = x.subarray(Math.round(x.length * 0.6), Math.min(x.length, Math.round(x.length * 0.6) + 9600));
  const sp = []; for (let f = 200; f < 10000; f *= 1.012) sp.push([f, dft(tail, f)]);
  let best = [0, 0]; sp.forEach(([f, m], i) => { const loc = sp.slice(Math.max(0, i - 15), i + 15).reduce((a, b) => a + b[1], 0) / 30; if (m / loc > best[1]) best = [f, m / loc]; });
  console.log(`${sc.id.padEnd(36)} ${(x.length / sr).toFixed(2)} s  centroid ${(num / den).toFixed(0).padStart(5)} Hz  >3k ${(100 * hi / den).toFixed(0).padStart(3)}%  tail peak ${best[0].toFixed(0)} Hz ${best[1].toFixed(1)}x`);
}
