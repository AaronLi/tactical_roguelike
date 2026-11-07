// Bakes the stickers (js/stickers.ts) from their originals: assets/original_stickers/*.{png,jpg,jpeg,webp} (the art as drawn, kept
// in the repo) -> assets/stickers/<name>.webp (git-ignored, like the baked models and audio) and assets/stickers/index.json (the list
// the game reads: a static host such as GitHub Pages lists no folders). Each one a quarter of the original's size, nearest-neighbour
// (the art's hard pixel edges kept), as WebP quality 80 with its alpha whole: ~25% under the 256-colour PNGs it replaces.
// Run by `npm run build`; `npm run bake:stickers` alone. Baked again only when an original or this script has changed (a hash kept
// as assets/stickers/.inputs; --force regardless).
import { readFileSync, readdirSync, writeFileSync, mkdirSync, rmSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { join, parse } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url)), SRC = join(root, 'assets/original_stickers'), OUT = join(root, 'assets/stickers');
const SCALE = 0.25, QUALITY = 80;
// (sharp: here through @gltf-transform's install, as the model tools have it)
let sharp;
try { sharp = createRequire(join(root, 'package.json'))('sharp'); } catch { console.error('bake:stickers needs sharp (npm ci installs it)'); process.exit(1); }

const originals = readdirSync(SRC).filter((f) => /\.(png|jpe?g|webp)$/i.test(f)).sort();
const hash = createHash('sha256');
hash.update(readFileSync(fileURLToPath(import.meta.url)));
for (const f of originals) { hash.update(f); hash.update(readFileSync(join(SRC, f))); }
const inputs = hash.digest('hex'), stamp = join(OUT, '.inputs');
if (!process.argv.includes('--force') && existsSync(stamp) && readFileSync(stamp, 'utf8').trim() === inputs && existsSync(join(OUT, 'index.json'))) { console.log('stickers: up to date'); process.exit(0); }

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });
const names = [];
let before = 0, after = 0;
await Promise.all(originals.map(async (f) => {
  const src = sharp(readFileSync(join(SRC, f))), m = await src.metadata();
  const w = Math.max(1, Math.round(m.width * SCALE)), h = Math.max(1, Math.round(m.height * SCALE));
  const webp = await src.resize(w, h, { kernel: 'nearest' }).webp({ quality: QUALITY, alphaQuality: 100, effort: 6 }).toBuffer();
  const name = parse(f).name + '.webp';
  writeFileSync(join(OUT, name), webp);
  names.push(name); before += m.size || 0; after += webp.length;
}));
names.sort();
writeFileSync(join(OUT, 'index.json'), JSON.stringify(names) + '\n');
writeFileSync(stamp, inputs + '\n');
console.log(`stickers: ${names.length} baked into assets/stickers, ${(after / 1024).toFixed(0)} KB as WebP q${QUALITY}`);
