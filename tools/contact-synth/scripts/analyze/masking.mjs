// Usage: [W=96] node scripts/analyze/masking.mjs <scene-id> '<element what>' ['<element what>' ...]
// Each named element on its own stem: energy over its first 10 ms vs the rest of the mix in
// the same window (dB). Above ~0 dB the event dominates that moment; below ~-6 it's masked.
import { SCENES, renderScene } from '../../dist/index.js';
const [id, ...names] = process.argv.slice(2);
const W = +(process.env.W || 480); // window, samples at 48 kHz (96 = 2 ms)
const sc = SCENES.find((s) => s.id === id); const sr = 48000;
const tracks = [], rest = [];
for (const t of sc.tracks) for (const e of t.elements) (names.includes(e.what) ? tracks.push({ name: e.what + '@' + e.at.toFixed(3), description: '', elements: [e] }) : rest.push(e));
tracks.push({ name: 'REST', description: '', elements: rest });
const r = renderScene({ ...sc, tracks }, sr);
const restT = r.tracks.find((t) => t.name === 'REST');
const at = (t, i) => { const o = i - Math.round(t.start * sr); return o >= 0 && o < t.samples.length ? t.samples[o] : 0; };
for (const t of r.tracks) {
  if (t.name === 'REST') continue;
  let pk = 0, pi = 0; for (let o = 0; o < t.samples.length; o++) if (Math.abs(t.samples[o]) > pk) { pk = Math.abs(t.samples[o]); pi = o; }
  let on = 0; for (let o = 0; o < t.samples.length; o++) if (Math.abs(t.samples[o]) > 0.1 * pk) { on = o; break; }
  const g0 = on + Math.round(t.start * sr);
  let e = 0, er = 0; for (let i = g0; i < g0 + W; i++) { e += at(t, i) ** 2; er += at(restT, i) ** 2; }
  console.log(t.name.padEnd(48), 'at', (g0 / sr).toFixed(3), `s  energy vs rest (${(W / 48).toFixed(0)} ms):`, (10 * Math.log10(e / (er + 1e-15))).toFixed(1), 'dB');
}
