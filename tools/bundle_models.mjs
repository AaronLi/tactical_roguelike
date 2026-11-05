// Bundles the baked models for the game (docs/models.md "Bundles"): reads the finished tree assets/models/{parts,props} and writes
// assets/models/bundles/<name>.rtb (one per platform: its packs; _shared; _boot: every platform's index and the props) + bundles/index.json.  + bundles/manifest.json (the hashes the game keys its local store by).
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
console.log(`bundled ${m.totals.files} files into ${m.totals.bundles} bundles: ${m.totals.bytes} B, ${m.totals.gz} B gzipped (${Date.now() - t0} ms)`);
