// Usage: node scripts/analyze/brightness.mjs <scene-id> [regex on element what]
// For each matching element on its own: spectral centroid and share of energy above 3 kHz over the
// whole element (not just its tail). A scratchy slide reads bright; a worn, smooth one dull.
import { SCENES, renderScene } from '../../dist/index.js';
const sr = 48000; const [id, re] = process.argv.slice(2);
const sc = SCENES.find((s) => s.id === id); const filt = re ? new RegExp(re) : null;
const seen = new Set();
for (const t of sc.tracks) for (const el of t.elements) {
  if ((filt && !filt.test(el.what)) || seen.has(el.what)) continue; seen.add(el.what);
  const x = renderScene({ ...sc, room: 0, tracks: [{ name: 'x', description: '', elements: [el] }] }, sr).mix;
  const N = 1024; let num = 0, den = 0, hi = 0;
  for (let o = 0; o + N <= x.length; o += N / 2) {
    for (let k = 4; k < N / 2; k++) { let r = 0, m = 0; for (let i = 0; i < N; i += 1) { const w = (0.5 - 0.5 * Math.cos(2 * Math.PI * i / N)) * x[o + i]; r += w * Math.cos(2 * Math.PI * k * i / N); m += w * Math.sin(2 * Math.PI * k * i / N); }
      const e = r * r + m * m, f = k * sr / N; num += f * e; den += e; if (f > 3000) hi += e; }
  }
  console.log(`  ${el.what.slice(0, 44).padEnd(44)} centroid ${(num / den).toFixed(0).padStart(5)} Hz  >3k ${(100 * hi / den).toFixed(0).padStart(3)}%`);
}
