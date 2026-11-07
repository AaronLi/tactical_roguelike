// Usage: node scripts/footstep-reel.mjs <out.wav> [--room]
// A listening reel of the footstep synth: a boot walking over every floor, then every gait on concrete, every sole
// on tile, and kit. Each part at its level (SoleSpec/FloorSpec/GaitSpec.levelDb), with a gap between. Dry unless --room.
import { writeFileSync } from 'node:fs';
import { walkScene, renderScene, encodeWav, SOLES, FLOORS, GAITS } from '../dist/index.js';
const sr = 48000, file = process.argv[2] ?? 'footsteps-reel.wav', dry = !process.argv.includes('--room');
const parts = [
  ...Object.keys(FLOORS).map((floor) => ({ sole: 'boot', floor, gait: 'walk' })),
  ...['creep', 'crouch', 'walk', 'run'].map((gait) => ({ sole: 'boot', floor: 'concrete', gait })),
  ...Object.keys(SOLES).map((sole) => ({ sole, floor: 'tile', gait: 'walk' })),
  { sole: 'boot', floor: 'concrete', gait: 'walk', kit: 'heavy', massKg: 105 },
  { sole: 'boot', floor: 'wood', gait: 'run', kit: 'heavy', massKg: 105 },
  { sole: 'sneaker', floor: 'gravel', gait: 'run' },
];
const loud = (d) => { const W = 0.05 * sr; let s = 0, b = 0; for (let i = 0; i < d.length; i++) { s += d[i] * d[i]; if (i >= W) s -= d[i - W] * d[i - W]; b = Math.max(b, s); } return Math.sqrt(b / W); };
const segs = [];
for (const p of parts) {
  const r = renderScene(walkScene(p, 5), sr, 1, { dry });
  const k = Math.pow(10, (SOLES[p.sole].levelDb + FLOORS[p.floor].levelDb + GAITS[p.gait].levelDb + (p.kit ? 2 : 0)) / 20) / loud(r.mix);
  segs.push({ p, d: r.mix, k });
  console.log(`${(segs.reduce((a, s) => a + s.d.length / sr + 0.7, 0) - r.mix.length / sr - 0.7).toFixed(1).padStart(5)}s  ${p.sole} ${p.gait} on ${p.floor}${p.kit ? ' with ' + p.kit + ' kit' : ''}`);
}
const top = Math.max(...segs.map((s) => s.k * s.d.reduce((m, v) => Math.max(m, Math.abs(v)), 0)));
const gap = Math.round(0.7 * sr), total = segs.reduce((a, s) => a + s.d.length + gap, 0), mix = new Float32Array(total);
let o = 0;
for (const s of segs) { const k = (s.k * 0.95) / top; for (let i = 0; i < s.d.length; i++) mix[o + i] = s.d[i] * k; o += s.d.length + gap; }
writeFileSync(file, Buffer.from(encodeWav(mix, sr)));
console.log('wrote', file, (total / sr).toFixed(1) + 's');
