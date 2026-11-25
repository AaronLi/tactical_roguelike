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
// The console's object G (js/debugglobals.ts builds window.G from the files' exports; nothing in the game reads it) is built here for the tools: after each
// runFile, every file the context has loaded as a module that the debug module names gets its exports put on ctx.G (the names the debug module imports from
// that file: dist/js/debugglobals.js, in the folder of the file, is read for them; no such file, no G: an older build puts its own), once per file, so a
// tool's later write to ctx.G.X (a stand-in, a tool's own name) is not undone by the next runFile. The two bundles (js/modelbundles.ts, a classic script)
// are on ctx.RTBundles, and G.Bundles / G.AudioBundle come from there. Tools made before G was retired read ctx.G.X as the files had registered it.
// An import of `three` (nothing has one yet: the page's three.js is a global, js/threeboot.ts) is answered with the context's own
// THREE, the copy the tool put there (ctx.THREE), so it would be the same object the global one is.
import vm from 'node:vm'; import fs from 'node:fs'; import path from 'node:path'; import { spawnSync } from 'node:child_process';

if (!vm.SourceTextModule) {
  if (process.env.BP_VM_MODULES_REEXEC) { console.error('tools/vm_game.mjs: this node has no vm.SourceTextModule even with --experimental-vm-modules (node 22 or later)'); process.exit(1); }
  const r = spawnSync(process.execPath, ['--experimental-vm-modules', '--no-warnings', ...process.execArgv, ...process.argv.slice(1)], { stdio: 'inherit', env: { ...process.env, BP_VM_MODULES_REEXEC: '1' } });
  process.exit(r.status ?? 1);
}
// The re-started tool has the flag: its marker goes, so a node it starts (tools/bake_models.mjs runs tools/bake_props.mjs) can re-start itself in turn
delete process.env.BP_VM_MODULES_REEXEC;

const caches = new WeakMap(); // context -> Map(absolute path -> module)
// A context's globals as module-locals (runFile's locals: a list of names): each module it loads gets 'const Math = globalThis.Math, ...;'
// put before its first line (on that line: its line numbers stay as they are). A global read in a vm context goes through the context's
// interceptor, some 20 to 30 times slower than a local's; in a hot loop (the radars' noise: Math.imul, Math.log per cell) it's most of
// the time. Opt-in: a module that assigned one of them as a global would no longer see the change (none of the game's do).
const preludes = new WeakMap(); // context -> the text put before each module's source
const isModule = (src) => /^\s*(import\s*[\w{*'"]|export\s)/m.test(src);

async function load(ctx, file, cache) {
  file = path.resolve(file);
  if (cache.has(file)) return cache.get(file);
  const src = (preludes.get(ctx) || '') + fs.readFileSync(file, 'utf8');
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

const gNames = new Map(); // folder -> Map(file name -> the names the debug module imports from it) | null
function namesOf(dir) {
  if (gNames.has(dir)) return gNames.get(dir);
  const f = path.join(dir, 'debugglobals.js'); let map = null;
  if (fs.existsSync(f)) {
    map = new Map();
    for (const m of fs.readFileSync(f, 'utf8').matchAll(/^import \{([^}]*)\} from '\.\/([\w-]+)\.js';/gm)) if (m[2] !== 'bundlesenv') map.set(m[2], m[1].split(',').map((x) => x.trim()).filter(Boolean));
  }
  gNames.set(dir, map);
  return map;
}
const filled = new WeakMap(); // context -> Set(what has been put on its G)
function syncG(ctx) {
  let done = filled.get(ctx); if (!done) filled.set(ctx, done = new Set());
  const put = (k, v) => { if (!ctx.G) ctx.G = {}; ctx.G[k] = v; };
  const cache = caches.get(ctx);
  if (cache) for (const [file, m] of cache) {
    if (!path.isAbsolute(file) || done.has(file) || m.status !== 'evaluated') continue;
    const names = namesOf(path.dirname(file)), want = names && names.get(path.basename(file, '.js'));
    if (!want) continue;
    done.add(file);
    for (const k of want) if (k in m.namespace) put(k, m.namespace[k]);
  }
  if (ctx.RTBundles && !done.has('RTBundles')) { done.add('RTBundles'); put('Bundles', ctx.RTBundles.Bundles); put('AudioBundle', ctx.RTBundles.AudioBundle); }
}

/** Runs one compiled file in the context: as an ES module (its imports from the same folder, in the same context) if it is one, else as a script. */
export async function runFile(ctx, file, { stubs, locals } = {}) {
  if (locals && !preludes.has(ctx)) preludes.set(ctx, 'const ' + locals.map((k) => k + ' = globalThis.' + k).join(', ') + ';');
  const src = fs.readFileSync(file, 'utf8');
  if (!isModule(src)) { vm.runInContext(src, ctx, { filename: path.basename(file) }); syncG(ctx); return; }
  let cache = caches.get(ctx); if (!cache) caches.set(ctx, cache = new Map());
  const m = await load(ctx, file, cache);
  if (m.status === 'unlinked') await m.link(linkerFor(ctx, cache, stubs));
  if (m.status === 'linked') await m.evaluate();
  else if (m.status === 'errored') throw m.error;
  syncG(ctx);
}

/** The exports (the namespace) of a file that runFile / runScripts has loaded as a module in this context: `(await moduleOf(ctx, DIST + 'util.js')).Hooks`. */
export function moduleOf(ctx, file) {
  const cache = caches.get(ctx), m = cache && cache.get(path.resolve(file));
  if (!m) throw new Error(`tools/vm_game.mjs moduleOf: ${file} is not loaded in this context (a module the context has run, directly or through an import)`);
  return m.namespace;
}

/** Each dist/<name>.js in order (a missing one stops the tool: tsc first). */
export async function runScripts(ctx, dir, names, { what = 'npm run compile', stubs, locals } = {}) {
  for (const f of names) {
    const file = path.join(dir, f + '.js');
    if (!fs.existsSync(file)) { console.error(`${path.relative(process.cwd(), file)} missing: run tsc first (${what})`); process.exit(1); }
    await runFile(ctx, file, { stubs, locals });
  }
}
