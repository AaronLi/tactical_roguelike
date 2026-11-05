// Render a scene's tracks as WAV stems plus the full mix and a cue sheet.
// Usage: npm run build && node scripts/render-scene.mjs <scene-id> <out-dir> [seed]
import { SCENES, renderScene, encodeWav } from '../dist/index.js';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const [id, outDir = `out/${id}`, seedArg = '1'] = process.argv.slice(2);
const scene = SCENES.find((s) => s.id === id);
if (!scene) {
  console.error(`Unknown scene "${id}". Available: ${SCENES.map((s) => s.id).join(', ')}`);
  process.exit(1);
}
mkdirSync(outDir, { recursive: true });
const r = renderScene(scene, 48000, Number(seedArg));
const cues = [];
r.tracks.forEach((t, i) => {
  const file = `${String(i + 1).padStart(2, '0')}-${t.name}.wav`;
  writeFileSync(join(outDir, file), Buffer.from(encodeWav(t.samples, r.sampleRate)));
  cues.push({ file, track: t.name, start: +t.start.toFixed(4), duration: +(t.samples.length / r.sampleRate).toFixed(4), description: t.description });
});
const mixFile = `00-${scene.id}-full.wav`;
writeFileSync(join(outDir, mixFile), Buffer.from(encodeWav(r.mix, r.sampleRate)));
writeFileSync(join(outDir, 'cues.json'), JSON.stringify({ scene: scene.title, sampleRate: r.sampleRate, mix: mixFile, tracks: cues }, null, 2));
for (const c of cues) console.log(`${c.start.toFixed(3)}s  ${c.file.padEnd(28)} ${c.duration.toFixed(3)}s`);
console.log(`mix: ${mixFile} (${(r.mix.length / r.sampleRate).toFixed(2)}s)`);
