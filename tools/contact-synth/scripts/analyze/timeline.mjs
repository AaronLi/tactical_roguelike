// Usage: node scripts/analyze/timeline.mjs <scene-id> [regex on 'track|what']
// Every element of a scene as its own stem (stems share one gain and timeline): print when each
// actually becomes audible (onset > -40 dB of its own peak) and peaks, sorted, with its level.
import { SCENES, renderScene } from '../../dist/index.js';
const sc = SCENES.find((s) => s.id === process.argv[2]); const sr = 48000;
const filt = process.argv[3] ? new RegExp(process.argv[3]) : null;
const tracks = sc.tracks.flatMap((t) => t.elements.map((e, i) => ({ name: `${t.name}|${e.what}`, description: '', elements: [e] })));
const r = renderScene({ ...sc, tracks }, sr);
let gpk = 0; for (const v of r.mix) gpk = Math.max(gpk, Math.abs(v));
const rows = r.tracks.map((t) => {
  let pk = 0, pi = 0; for (let i = 0; i < t.samples.length; i++) if (Math.abs(t.samples[i]) > pk) { pk = Math.abs(t.samples[i]); pi = i; }
  let on = 0; for (let i = 0; i < t.samples.length; i++) if (Math.abs(t.samples[i]) > pk * 0.01) { on = i; break; }
  return { name: t.name, onset: t.start + on / sr, peak: t.start + pi / sr, db: 20 * Math.log10(pk / gpk) };
}).sort((a, b) => a.onset - b.onset);
for (const x of rows) if (!filt || filt.test(x.name)) console.log(`${(x.onset * 1000).toFixed(1).padStart(7)} ms  peak ${(x.peak * 1000).toFixed(1).padStart(7)} ms  ${x.db.toFixed(0).padStart(4)} dB  ${x.name}`);
