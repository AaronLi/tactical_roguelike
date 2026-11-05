// The EXHAUSTIVE check of the packs against the recipe: the single-swap sweep (~9,100 builds) and N random held-out builds. Kept for when you want them;
// the model test proper is the curated edge-case suite (tools/check_model_cases.mjs, npm run test:models). This is the same program with the sweep and the
// held-out set switched on and the cases and golden fingerprints off:
//   node tools/check_models_assembly.mjs [id ...] [--held N] [--seed S] [--tol metres] [--report dir] [--quiet] [--no-sweep]
import { spawnSync } from 'child_process'; import path from 'path'; import { fileURLToPath } from 'url';
const args = process.argv.slice(2), sweep = !args.includes('--no-sweep'), held = args.includes('--held') ? [] : ['--held', '10000'];
const pass = args.filter((a) => a !== '--no-sweep');
const r = spawnSync(process.execPath, [path.join(path.dirname(fileURLToPath(import.meta.url)), 'check_model_cases.mjs'), '--no-cases', '--no-golden', ...(sweep ? ['--sweep'] : []), ...held, ...pass], { stdio: 'inherit' });
process.exit(r.status === null ? 1 : r.status);
