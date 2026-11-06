// Usage: node scripts/analyze/ping.mjs <scene-id> [from-ms] [to-ms]   (times on the mix timeline)
// Find the strongest narrow peak in the mix tail (from T ms), then which element carries it.
import { SCENES, renderScene } from '../../dist/index.js';
const sr = 48000; const [id, T0 = '160', T1 = '500'] = process.argv.slice(2);
const sc = SCENES.find((s) => s.id === id);
const tracks = sc.tracks.flatMap((t) => t.elements.map((e, i) => ({ name: `${e.what}@${e.at.toFixed(4)}`, description: '', elements: [e] })));
const r = renderScene({ ...sc, tracks }, sr);
const seg = (t) => { const out = new Float32Array(Math.round((T1 - T0) / 1000 * sr)); const o = Math.round(t.start * sr), a = Math.round(T0 / 1000 * sr);
  for (let i = 0; i < out.length; i++) { const j = a + i - o; out[i] = j >= 0 && j < t.samples.length ? t.samples[j] : 0; } return out; };
const dft = (x, f) => { let re = 0, im = 0; for (let i = 0; i < x.length; i++) { const w = 0.5 - 0.5 * Math.cos(2 * Math.PI * i / x.length); re += x[i] * w * Math.cos(2 * Math.PI * f * i / sr); im += x[i] * w * Math.sin(2 * Math.PI * f * i / sr); } return Math.hypot(re, im); };
const mix = seg({ start: 0, samples: r.mix });
let best = [];
for (let f = 200; f < 12000; f *= 1.01) best.push([f, dft(mix, f)]);
const sm = best.map(([f, m], i) => [f, m / (best.slice(Math.max(0, i - 15), i + 15).reduce((s, x) => s + x[1], 0) / 30)]);
sm.sort((a, b) => b[1] - a[1]);
const peaks = []; for (const [f, q] of sm) { if (peaks.every((p) => Math.abs(Math.log(p[0] / f)) > 0.05)) peaks.push([f, q]); if (peaks.length >= 4) break; }
for (const [f, q] of peaks) {
  const tot = dft(mix, f);
  console.log(`peak ${f.toFixed(0)} Hz, ${q.toFixed(1)}x local avg, ${(20 * Math.log10(tot)).toFixed(1)} dB`);
  const rows = r.tracks.map((t) => [t.name, dft(seg(t), f)]).sort((a, b) => b[1] - a[1]).slice(0, 3);
  for (const [n, m] of rows) console.log(`    ${(20 * Math.log10(m / tot)).toFixed(1).padStart(6)} dB  ${n}`);
}
