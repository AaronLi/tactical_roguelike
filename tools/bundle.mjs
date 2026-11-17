// The release bundles (docs/modules-plan.md phase 6): the compiled game (dist/js, what `tsc` writes and what development runs, unbundled, as native
// modules) bundled and minified by esbuild into dist/bundle/: one self-contained file for the page (main.js) and one for each worker (serverworker.js,
// prepworker.js, exportworker.js), and modelbundles.js on its own (a classic, non-deferred script: it must run first, before three.js is fetched). The files
// have the names the unbundled ones have, so a release is the unbundled build with those five files replaced by the bundle's: index.html and the workers' URLs
// are the same in both.
//   npm run bundle                     dist/js (compiled first) -> dist/bundle
//   npm run bundle -- --site <dir>     and then the bundle's files are laid over <dir>/dist/js (<dir> a copy of the site: the workflow's _site)
//   npm run bundle -- --no-minify      readable, for looking at what the bundle is
// What it keeps, on purpose:
//   - three.js (the https URLs of js/threeboot.ts, the supabase client of js/cloud.ts) stays outside, imported from the CDN as it is unbundled;
//   - evaluation order: esbuild runs modules in native ESM's order (depth first, in the order the imports are written), and nothing is tree-shaken
//     (`treeShaking: false`: the files register on G as they load, and main.ts, exportentry.ts, prepentry.ts are lists of side-effect imports);
//   - NO code splitting, one bundle per entry. Shared chunks cut the page's and the workers' common code out of each (the page then loads fewer bytes in all),
//     but a chunk is one unit, and the modules in it run together: tried, the page's G registered its 176 names in another order than the unbundled one
//     (the same names; modules a chunk holds ran before modules of main that the imports put in between). Without splitting, the order is the unbundled one's (checked, the
//     page's and the three workers': Object.keys(G) is identical). The workers' code is therefore in the page's file too and the other way round: the
//     server and prep workers each carry the simulation (about 0.3 MB gzipped), the page does not download them as the page starts, the workers do as they start;
//   - the workers' globals: each worker file sets `window` and `document` and then `import()`s threeboot and its entry. Without splitting, esbuild keeps the
//     game's modules in `__esm` wrappers that run when that import() does (a lazily evaluated import), so nothing of the game runs before the globals are set;
//   - names: nothing reads a function's or class's `.name`, and G's keys are property names, which minifying leaves alone: no `keepNames`.
import { build } from 'esbuild'; import fs from 'node:fs'; import path from 'node:path'; import { fileURLToPath } from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'), argv = process.argv.slice(2);
const minify = !argv.includes('--no-minify'), si = argv.indexOf('--site'), site = si >= 0 ? path.resolve(argv[si + 1] || '') : null;
if (si >= 0 && !argv[si + 1]) { console.error('--site needs a folder'); process.exit(1); }
const SRC = path.join(ROOT, 'dist', 'js'), OUT = path.join(ROOT, 'dist', 'bundle');
const ENTRIES = ['main', 'serverworker', 'prepworker', 'exportworker'];
if (!ENTRIES.every((e) => fs.existsSync(path.join(SRC, e + '.js')))) { console.error('dist/js is not compiled: run npm run compile first'); process.exit(1); }
fs.rmSync(OUT, { recursive: true, force: true });
const common = { absWorkingDir: ROOT, minify, sourcemap: true, sourcesContent: false, target: 'es2022', logLevel: 'warning', legalComments: 'none', external: ['https://*'], treeShaking: false };
const res = await build({ ...common, entryPoints: ENTRIES.map((e) => path.join(SRC, e + '.js')), outdir: OUT, bundle: true, format: 'esm', metafile: true });
// the classic script: its own file, wrapped so its top-level names stay its own (they were, in a script, global lexical names nothing else reads)
await build({ ...common, entryPoints: [path.join(SRC, 'modelbundles.js')], outfile: path.join(OUT, 'modelbundles.js'), bundle: true, format: 'iife' });
fs.writeFileSync(path.join(OUT, 'meta.json'), JSON.stringify(res.metafile));
const files = fs.readdirSync(OUT).filter((f) => f.endsWith('.js')).sort();
let total = 0; for (const f of files) { const n = fs.statSync(path.join(OUT, f)).size; total += n; console.log(f.padEnd(24) + String(n).padStart(10) + ' B'); }
console.log(`${files.length} files, ${total} B in dist/bundle` + (minify ? '' : ' (not minified)'));
if (site) {
  const dest = path.join(site, 'dist', 'js');
  // (laid over dist/js, not in place of it: the rest of the compiled files stay, for ambience.html, a page of its own that imports audio.js and ambience.js, as the page
  // before this did. Nothing the game loads is in them: the five files below have their names)
  fs.mkdirSync(dest, { recursive: true });
  for (const f of fs.readdirSync(OUT)) if (f !== 'meta.json') fs.copyFileSync(path.join(OUT, f), path.join(dest, f));
  console.log('bundle laid over ' + path.relative(process.cwd(), dest));
}
