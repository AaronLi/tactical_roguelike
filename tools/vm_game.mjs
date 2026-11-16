// The compiled game (dist/js) in a node vm context, for the tools that run it without a browser (tools/level_env.mjs, model_env.mjs,
// check_sim_golden.mjs, cloud.test.mjs, bake_hangar.mjs ...). docs/modules-plan.md phase 4.
//
// A file that has an `import` or an `export` is an ES module, which `vm.runInContext` can't run; this loads it as one, in the context
// you give it (vm.SourceTextModule), with its imports resolved inside that same context: so each context is a whole game of its own,
// the way each `vm.createContext` was before the first file became a module (a fresh simulation per scenario in
// tools/check_sim_golden.mjs, a "browser" per call in tools/cloud.test.mjs, a game with its own globals and a seeded Math.random).
// A file with neither is a plain script and runs as before, so the two kinds mix, as they do on the page.
//   await runScripts(ctx, DIST, ['util', 'data', ...])      each dist/js/<name>.js, in order, as the page's script tags do
//   await runFile(ctx, '/abs/path/file.js')                  one
//
// vm.SourceTextModule is behind node's --experimental-vm-modules. Importing this file starts the tool again with the flag (and
// --no-warnings, so the "experimental" notice doesn't print) if it isn't there, so `node tools/x.mjs` and every npm script work as
// they did: import this file FIRST in a tool (its imports run before the rest of the tool does).
//
// A tool can answer chosen imports itself, with a stub module (the stand-ins it used to put on the global G after loading): `{ stubs: { './net.js': { Net: {...} } } }`
// on runFile / runScripts. An import whose specifier is a key is answered with a module that exports the stub's names, whatever the importing file and
// whether or not the real file is somewhere in the context; a value that is a function is called with the context first (when a stub needs something the
// tool only has by then: `() => ({ GunModels: ctx.G.GunRecipes })`). A stub names every export the importers need: one it lacks is a link error.
// An import of `three` (nothing has one yet: the page's three.js is a global, js/threeboot.ts) is answered with the context's own
// THREE, the copy the tool put there (ctx.THREE), so it would be the same object the global one is.
import vm from 'node:vm'; import fs from 'node:fs'; import path from 'node:path'; import { spawnSync } from 'node:child_process';

if (!vm.SourceTextModule) {
  if (process.env.BP_VM_MODULES_REEXEC) { console.error('tools/vm_game.mjs: this node has no vm.SourceTextModule even with --experimental-vm-modules (node 22 or later)'); process.exit(1); }
  const r = spawnSync(process.execPath, ['--experimental-vm-modules', '--no-warnings', ...process.execArgv, ...process.argv.slice(1)], { stdio: 'inherit', env: { ...process.env, BP_VM_MODULES_REEXEC: '1' } });
  process.exit(r.status ?? 1);
}

const caches = new WeakMap(); // context -> Map(absolute path -> module)
const isModule = (src) => /^\s*(import\s*[\w{*'"]|export\s)/m.test(src);

async function load(ctx, file, cache) {
  file = path.resolve(file);
  if (cache.has(file)) return cache.get(file);
  const src = fs.readFileSync(file, 'utf8');
  const m = new vm.SourceTextModule(src, { context: ctx, identifier: file });
  cache.set(file, m);
  return m;
}

function linkerFor(ctx, cache, stubs) {
  const linker = async (specifier, ref) => {
    if (stubs && Object.prototype.hasOwnProperty.call(stubs, specifier)) {
      const key = 'stub:' + specifier;
      if (cache.has(key)) return cache.get(key);
      const ex = typeof stubs[specifier] === 'function' ? stubs[specifier](ctx) : stubs[specifier], names = Object.keys(ex);
      const m = new vm.SyntheticModule(names, function () { for (const k of names) this.setExport(k, ex[k]); }, { context: ctx, identifier: key });
      cache.set(key, m);
      return m;
    }
    if (specifier === 'three') {
      if (cache.has('three')) return cache.get('three');
      const T = ctx.THREE, names = Object.keys(T), m = new vm.SyntheticModule(names, function () { for (const k of names) this.setExport(k, T[k]); }, { context: ctx, identifier: 'three' });
      cache.set('three', m);
      return m;
    }
    if (!/^\.\.?\//.test(specifier)) throw new Error(`${ref.identifier}: cannot import '${specifier}' (the tools' loader answers relative paths and three)`);
    return load(ctx, path.resolve(path.dirname(ref.identifier), specifier), cache);
  };
  return linker;
}

/** Runs one compiled file in the context: as an ES module (its imports from the same folder, in the same context) if it is one, else as a script. */
export async function runFile(ctx, file, { stubs } = {}) {
  const src = fs.readFileSync(file, 'utf8');
  if (!isModule(src)) { vm.runInContext(src, ctx, { filename: path.basename(file) }); return; }
  let cache = caches.get(ctx); if (!cache) caches.set(ctx, cache = new Map());
  const m = await load(ctx, file, cache);
  if (m.status === 'unlinked') await m.link(linkerFor(ctx, cache, stubs));
  if (m.status === 'linked') await m.evaluate();
  else if (m.status === 'errored') throw m.error;
}

/** The exports (the namespace) of a file that runFile / runScripts has loaded as a module in this context: `(await moduleOf(ctx, DIST + 'util.js')).Hooks`. */
export function moduleOf(ctx, file) {
  const cache = caches.get(ctx), m = cache && cache.get(path.resolve(file));
  if (!m) throw new Error(`tools/vm_game.mjs moduleOf: ${file} is not loaded in this context (a module the context has run, directly or through an import)`);
  return m.namespace;
}

/** Each dist/<name>.js in order (a missing one stops the tool: tsc first). */
export async function runScripts(ctx, dir, names, { what = 'npm run compile', stubs } = {}) {
  for (const f of names) {
    const file = path.join(dir, f + '.js');
    if (!fs.existsSync(file)) { console.error(`${path.relative(process.cwd(), file)} missing: run tsc first (${what})`); process.exit(1); }
    await runFile(ctx, file, { stubs });
  }
}
