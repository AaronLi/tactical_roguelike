// Renders every preset, checks the output is sane, and prints a summary.
// Usage: npm run build && node test/render-all.mjs [outDir-for-wavs]
import { PRESETS, withPatch, render, encodeWav, defaultParams } from '../dist/index.js';
import { writeFileSync, mkdirSync } from 'node:fs';

const outDir = process.argv[2];
if (outDir) mkdirSync(outDir, { recursive: true });

function centroid(x, sr) {
  // crude spectral centroid via zero-crossing-free method: ratio of derivative RMS to RMS
  let a = 0, d = 0;
  for (let i = 1; i < x.length; i++) { a += x[i] * x[i]; const q = x[i] - x[i - 1]; d += q * q; }
  return (Math.sqrt(d / a) * sr) / (2 * Math.PI);
}

let failed = 0;
for (const pr of PRESETS) {
  const p = withPatch(pr.patch);
  const r = render(p);
  const x = r.samples;
  let bad = false, pk = 0;
  for (const v of x) { if (!Number.isFinite(v)) { bad = true; break; } pk = Math.max(pk, Math.abs(v)); }
  if (bad || pk < 0.5 || pk > 0.95) { failed++; console.log('FAIL', pr.id, { bad, pk }); }
  const i = r.info;
  console.log(
    pr.id.padEnd(20),
    `${i.durationS.toFixed(2)}s`.padStart(6),
    `${i.renderMs.toFixed(0)}ms`.padStart(7),
    `ev=${i.events}`.padEnd(7),
    `rat=${i.rattles}`.padEnd(8),
    `A f1=${i.a.f1.toFixed(0)} modes=${i.a.audibleModes} T60=${i.a.ringT60.toFixed(2)}`.padEnd(34),
    `B f1=${i.b.f1.toFixed(0)} m=${i.b.mass.toFixed(3)}kg`.padEnd(24),
    `tau=${i.contactMs.toFixed(3)}ms`,
    `cent=${centroid(x, r.sampleRate).toFixed(0)}Hz`,
    `raw=${i.rawPeak.toExponential(2)}`,
  );
  if (outDir) writeFileSync(`${outDir}/${pr.id}.wav`, Buffer.from(encodeWav(x, r.sampleRate)));
}

// Layer balance with the default bodies: impact vs. friction vs. snap, raw (pre-normalisation) peaks.
const base = defaultParams();
base.out.room = 0;
const only = (patch) => { const p = structuredClone(base); p.impact.velocity = 0; for (const [k, v] of Object.entries(patch)) Object.assign(p[k], v); return render(p).info.rawPeak; };
console.log('\nlayer balance (raw peak, default bodies):');
console.log('  impact 1.5 m/s   ', only({ impact: { velocity: 1.5 } }).toExponential(2));
console.log('  slide 5N smooth  ', only({ friction: { force: 5, roughness: 3, grain: 0.2 } }).toExponential(2));
console.log('  scrape 10N rough ', only({ friction: { force: 10, roughness: 60, grain: 0.8 } }).toExponential(2));
console.log('  squeak 10N       ', only({ friction: { force: 10, roughness: 2, stickSlip: 0.9 } }).toExponential(2));
console.log('  snap 0.6         ', only({ snap: { count: 1 } }).toExponential(2));
console.log('  creak only       ', only({ snap: { count: 1, strength: 0.6, seat: 0, preload: 300, creak: 1 } }).toExponential(2));
if (failed) { console.log(`${failed} preset(s) failed`); process.exit(1); }
console.log('\nall presets OK');
