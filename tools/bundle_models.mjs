// Bundles the baked models for the game (docs/models.md "Bundles"): reads the finished tree assets/models/{parts,props,scenes} and writes
// assets/models/bundles/models.rtb (ONE container: every pack, platform index and prop) + bundles/index.json (for the tools) + bundles/manifest.json ({ v, hash, size }: what the game fetches to learn whether its local copy is current).
// The last step of `npm run bake:models`; independent of how the tree was baked (it only reads files), deterministic (same files -> same bytes).
//   node tools/bundle_models.mjs           write the bundles
//   node tools/bundle_models.mjs --check   check them against the loose files and the indexes (npm run test:models does); exit 1 on a problem
import { MODELS, loadBundles, writeBundles, check } from './model_bundles.mjs';

const B = loadBundles();
if (process.argv.includes('--check')) {
  const errs = check(MODELS, B);
  for (const e of errs.slice(0, 40)) console.error('BUNDLES: ' + e);
  if (errs.length > 40) console.error(`BUNDLES: ... and ${errs.length - 40} more`);
  console.log(errs.length ? `${errs.length} bundle problems` : 'bundles OK (every index entry resolves; no orphans; the files match the loose tree)');
  process.exit(errs.length ? 1 : 0);
}
const t0 = Date.now(), m = writeBundles(MODELS, B, console.log);
console.log(`bundled ${m.files} files into one bundle: ${m.bytes} B, ${m.gz} B gzipped, hash ${m.hash} (${Date.now() - t0} ms)`);
