// Everything the game needs that isn't kept in the repo, from a fresh clone or after any change: `npm run build`.
//   1. the TypeScript compiled (js/*.ts -> dist/js, tools/models/*.ts -> dist/tools)
//   2. the stickers (tools/bake_stickers.mjs) and the synthesized audio (tools/bake_audio.mjs: only what's changed)
//   3. the models (tools/bake_models.mjs: the guns' pieces, the props, the hangar's scene, the human bodies) and their bundle
// Needs node and what npm install brings, nothing else: no Blender, no browser.
//   npm run build                    all of it (the models take a minute or two the first time, and whenever what the guns are made from
//                                    has changed; otherwise a few seconds. -- --force bakes them regardless)
//   npm run build -- --no-models     1 and 2 only: what a change to the game's code needs (npm run compile is step 1 alone)
//   npm run build -- -j 4            worker threads for the audio and the models; anything else is handed to the models' bake
import { spawnSync } from 'node:child_process'; import path from 'node:path'; import { fileURLToPath } from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'), argv = process.argv.slice(2);
const noModels = argv.includes('--no-models'), rest = argv.filter((a) => a !== '--no-models');
const ji = rest.findIndex((a) => a === '-j' || a === '--jobs'), jobs = ji >= 0 ? rest.slice(ji, ji + 2) : [];
const t0 = Date.now(), times = [];
function step(name, cmd, args, shell = false) {
  const t = Date.now(); console.log('\n== ' + name);
  const r = spawnSync(cmd, args, { cwd: ROOT, stdio: 'inherit', shell });
  if (r.status !== 0) { console.error('\nbuild FAILED at: ' + name + (r.error ? ' (' + r.error.message + ')' : '')); process.exit(r.status || 1); }
  times.push([name, Date.now() - t]);
}
const node = (name, file, args = []) => step(name, process.execPath, [path.join(ROOT, 'tools', file), ...args]);
step('compile the game', 'npx tsc -p .', [], true);
step('compile the tools', 'npx tsc -p tsconfig.tools.json', [], true);
node('stickers', 'bake_stickers.mjs');
node('audio', 'bake_audio.mjs', jobs);
if (!noModels) node('models', 'bake_models.mjs', rest);
console.log('\nbuild done in ' + ((Date.now() - t0) / 1000).toFixed(1) + ' s' + (noModels ? ' (without the models)' : '') + ': ' + times.map(([n, t]) => n + ' ' + (t / 1000).toFixed(1) + ' s').join(', '));
