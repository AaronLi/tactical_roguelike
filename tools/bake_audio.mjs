// Bakes the game's synthesized audio banks (git-ignored, like the baked models): the guns' handling sounds
// (assets/audio/handling) and the footsteps (assets/audio/footsteps), from the contact synth (tools/contact-synth).
// Run by `npm run build`; `npm run bake:audio` alone. The synth is compiled first, then a bank is baked again only when
// what it's baked from has changed: a hash of the synth's sources, its bank scripts and its package.json, kept in the
// bank as .inputs (--force bakes regardless). Banks render on worker threads: -j N (default the cores less one).
// Needs ffmpeg on the PATH (the clips are Ogg Vorbis).
import { readFileSync, readdirSync, statSync, existsSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url)), synth = join(root, 'tools/contact-synth');
const argv = process.argv.slice(2), force = argv.includes('--force');
const ji = argv.findIndex((a) => a === '-j' || a === '--jobs'), jobs = ji >= 0 ? ['-j', argv[ji + 1]] : [];
const BANKS = [
  { name: 'handling', script: 'scripts/game-bank.mjs', out: 'assets/audio/handling' },
  { name: 'footsteps', script: 'scripts/footstep-bank.mjs', out: 'assets/audio/footsteps' },
];

try { execFileSync('ffmpeg', ['-version'], { stdio: 'ignore' }); } catch { console.error('bake:audio needs ffmpeg on the PATH'); process.exit(1); }
// the synth's compiled JS (its page runs from it, and the banks import it)
execFileSync(process.execPath, [join(root, 'node_modules/typescript/bin/tsc'), '-p', synth], { stdio: 'inherit' });

const files = (dir) => readdirSync(dir).flatMap((f) => { const p = join(dir, f); return statSync(p).isDirectory() ? files(p) : [p]; });
const hash = createHash('sha256');
for (const f of [...files(join(synth, 'src')), ...files(join(synth, 'scripts')), join(synth, 'package.json')].sort()) {
  hash.update(relative(synth, f).replace(/\\/g, '/')); hash.update(readFileSync(f));
}
const inputs = hash.digest('hex');

for (const b of BANKS) {
  const out = join(root, b.out), stamp = join(out, '.inputs');
  if (!force && existsSync(join(out, 'manifest.json')) && existsSync(stamp) && readFileSync(stamp, 'utf8').trim() === inputs) { console.log(`${b.name}: up to date`); continue; }
  const t0 = Date.now();
  console.log(`${b.name}: baking into ${b.out}`);
  execFileSync(process.execPath, [join(synth, b.script), out, ...jobs], { stdio: 'inherit' });
  writeFileSync(stamp, inputs + '\n');
  console.log(`${b.name}: ${((Date.now() - t0) / 1000).toFixed(0)} s`);
}
