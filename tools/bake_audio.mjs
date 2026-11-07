// Bakes the game's synthesized audio banks (git-ignored, like the baked models): the guns' handling sounds
// (assets/audio/handling) and the footsteps (assets/audio/footsteps), from the contact synth (tools/contact-synth).
// Run by `npm run build`; `npm run bake:audio` alone. The synth is compiled first, then a bank is baked again only when
// what it's baked from has changed: a hash of the synth's sources, its bank scripts and its package.json, kept in the
// bank as .inputs (--force bakes regardless). Banks render on worker threads: -j N (default the cores less one).
// Needs ffmpeg on the PATH (the clips are Ogg Vorbis).
// Then both banks are packed into ONE bundle, as the models are (tools/model_bundles.mjs's container): assets/audio/bundles/audio.rtb,
// gzipped (it halves it: every clip carries the same Vorbis setup header), and bundles/manifest.json ({ v, hash, size }: what the
// game fetches to learn whether its stored copy is current: js/modelbundles.ts G.AudioBundle). Packed again whenever a bank's baked
// or the bundle's missing.
import { readFileSync, readdirSync, statSync, existsSync, writeFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { pack, gzip, hashOf } from './model_bundles.mjs';

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
let baked = false;

for (const b of BANKS) {
  const out = join(root, b.out), stamp = join(out, '.inputs');
  if (!force && existsSync(join(out, 'manifest.json')) && existsSync(stamp) && readFileSync(stamp, 'utf8').trim() === inputs) { console.log(`${b.name}: up to date`); continue; }
  const t0 = Date.now();
  console.log(`${b.name}: baking into ${b.out}`);
  execFileSync(process.execPath, [join(synth, b.script), out, ...jobs], { stdio: 'inherit' });
  writeFileSync(stamp, inputs + '\n'); baked = true;
  console.log(`${b.name}: ${((Date.now() - t0) / 1000).toFixed(0)} s`);
}

// the bundle: every file of both banks (their manifests and clips), as paths below assets/audio/, in byte order
const audio = join(root, 'assets/audio'), bdir = join(audio, 'bundles'), FORMAT = 1;
if (baked || !existsSync(join(bdir, 'audio.rtb')) || !existsSync(join(bdir, 'manifest.json'))) {
  const list = BANKS.flatMap((b) => files(join(root, b.out))).map((f) => relative(audio, f).split(String.fromCharCode(92)).join('/')).filter((p) => !p.endsWith('/.inputs')).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  const raw = pack(list.map((p) => [p, readFileSync(join(audio, p))])), z = gzip(raw), h = hashOf(z);
  mkdirSync(bdir, { recursive: true });
  writeFileSync(join(bdir, 'audio.rtb'), z);
  writeFileSync(join(bdir, 'manifest.json'), JSON.stringify({ v: FORMAT, hash: h, size: z.length }) + '\n');
  console.log(`audio bundle: ${list.length} files, ${(raw.length / 1048576).toFixed(2)} MB, ${(z.length / 1048576).toFixed(2)} MB gzipped, hash ${h}`);
} else console.log('audio bundle: up to date');
