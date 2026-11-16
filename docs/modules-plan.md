# Plan: from the global `G` to ES modules

Status: proposal, nothing started. Written 2026-11-15.

## Goal

Every file states what it uses with `import` and what it offers with `export`. The global object `G` stops being how
files find each other. The simulation side (what the server worker loads) goes first, because it has no drawing or
sound and is the part a Rust core would later replace.

Not in this plan: changing who owns the game's state (the level map, the player, the server's lists). Imports make the
sharing visible; untangling it is a later piece of work (see "After").

## Where things stand

| Fact | Figure |
| --- | --- |
| Source files (`js/*.ts`), all plain scripts | 83 register something on `G` |
| References to `G.Something` | about 4,100 |
| Script tags in `index.html` | 87, order kept by hand |
| Other hand-kept load lists | `SERVER_SCRIPTS` (28 files, `js/serverworker.ts`), the prep worker's list (21, `js/prepworker.ts`), `LEVEL_SCRIPTS` (`tools/level_env.mjs`), `tools/model_env.mjs` |
| Node tools that run the compiled scripts inside a `vm` context | about 13 |
| Types shared between files | global: an `interface LvMap` in one script is visible in all of them |
| three.js | a global `THREE`, put there by `js/threeboot.ts` from the CDN |
| Safety net | `npm run typecheck`, `test:level` (31 golden levels), `test:models` |

Three things make this more than a search-and-replace:

1. **Global types.** The moment a file gains an `import` or `export`, its interfaces stop being global. Every other
   file that names them breaks.
2. **Optional reach across layers.** Simulation files call into the page when it is there
   (`G.Audio && G.Audio.ctx`, `G.Space && G.Space.S.on`). A plain import would drag the audio and the renderer into
   the server worker.
3. **Loaders that assume scripts.** The workers use `importScripts`, and the node tools evaluate files in a `vm`
   context with a fake `document`. Neither can load a file that contains `import`.

One thing is easier than it looks: **cycles**. Two files that call each other only from inside functions work as ES
modules without change. Only uses at load time need a fixed order.

## Phases

Each phase ends with the game working and all three checks passing. Each can be committed and shipped alone.

### 0. Inventory (no behaviour change)

- Write `tools/deps.mjs`: for every file, which `G.X` it uses, split into "while loading" and "inside a function".
  Output: the dependency graph, the load-time order it requires, and every load-time cycle.
- Run a trial typecheck with `"moduleDetection": "force"` and keep the error list. That list is exactly the bare
  cross-file references (types and values that do not go through `G`).
- List every optional cross-layer reference (`G.X &&`, `G.X ?`) from a simulation file to a page-only file.
- Add a browser smoke check to the routine: the debug-start URLs (`?play=...`, `?board=...`, `?hangar`), with the
  server thread on and off.

Done when: the three lists exist and are checked in under `docs/`.

### 1. Shared types get a home

- Move each shared interface into a `declare global { ... }` block in the file that owns it (or into
  `js/types/*.d.ts` where no file clearly owns it). Nothing changes at runtime.
- After this, a file can become a module without breaking the files that name its types.

Done when: the trial typecheck from phase 0 reports no type errors, only value references.

### 2. Loaders accept modules

- Page: change the `defer` script tags to `type="module"`. Order is preserved, so behaviour is the same.
- Workers: start them as module workers (`new Worker(url, { type: 'module' })`) and replace `importScripts` with a
  list of side-effect imports in the same order.
- three.js: add an import map on the page pointing `three` at the pinned CDN build; keep the global `THREE` for now.
- Node tools: replace the `vm` loaders in `tools/level_env.mjs` and `tools/model_env.mjs` with real imports of
  `dist/js`.

No source file has an `import` yet. This phase only proves every loader can take one.

Done when: all loaders are module-based and the load lists still exist but are plain import lists.

### 3. The layering rule and the hooks

- Rule: a simulation file may import only simulation files. A page file may import anything.
- For each optional reach from the simulation to the page (the phase 0 list), replace it with a small hook the page
  fills in: for example `Sim.onSound = ...`, set by the audio code when it loads. The worker simply leaves it unset.
- Enforce the rule in `tools/deps.mjs` and run it in CI.

Done when: no simulation file mentions a page-only module.

### 4. Convert the simulation side, leaves first

Order from the dependency graph, roughly:

`util` → `data`, `spacedata` → `materials`, `medical`, `gear`, `arsenal`, `parts`, `sim` → `world`, `ballistics` →
`leveldesc`, `level` → `furnspec`, `furniture`, `homes`, `residents`, `shipgen` → `scars`, `damage`, `stickers`,
`route`, `shop`, `recorder` → `server`, `spaceserver`, `serverhost`.

For each file:

1. `export const Level = ...`, and keep `G.Level = Level` so unconverted files still work.
2. Replace its own `G.X` uses with imports, by script (`tools/codemod_imports.mjs`), for every `X` already converted.
3. Typecheck, golden tests, smoke check.

Done when: the server worker and the prep worker import their entry file and nothing else, and both hand-kept lists
are deleted.

### 5. Convert the page side

Same steps, in this order: data-like files (`icons`, `callsigns`, `career`, `loadout`), then audio, then models and
rigs, then views and rendering, then `player`, `game`, `space`, and the screens (`hangar`, `shop`, `gunsmith`,
`invui`). `index.html` ends with one script tag.

Done when: no file reads another through `G`.

### 6. Bundle for release

- Add esbuild to `tools/build.mjs`: one bundle for the page, one per worker, minified, with the rarely used screens
  split out and loaded on demand.
- Development stays unbundled (`tsc --watch` and native modules), so there is no new step while editing.
- Update `.github/workflows/pages.yml` to publish the bundles.

Done when: the published site loads a handful of files instead of about 90.

### 7. Retire `G`

- Delete `GameModules` and every `G.X = X` line.
- Keep a debug-only module that builds `window.G` from the exports, loaded by the debug-start code. The console
  helpers and the browser checks depend on it.

Done when: `grep "G\." js/` finds only the debug module.

## Size of each phase

Relative, not measured:

| Phase | Size | Why |
| --- | --- | --- |
| 0 Inventory | small | two scripts and three lists |
| 1 Types | medium | mechanical, but touches most files |
| 2 Loaders | medium | few files, but every tool and both workers must be retested |
| 3 Hooks | medium | the only real design work |
| 4 Simulation | large | 28 files, about a third of the references |
| 5 Page | largest | the rest, including the biggest files |
| 6 Bundle | small | |
| 7 Retire | small | |

## Risks

- **Other work in the same files.** Phases 1, 4 and 5 touch nearly every file. Start from a clean tree (there are
  20 uncommitted files today), do each phase on its own branch, and merge quickly.
- **Load-time order.** A file that uses another while loading must import it; the phase 0 graph finds these, and a
  wrong order fails at startup, not silently.
- **Worker support.** Module workers need Firefox 114 or later and Safari 15 or later. Confirm that is acceptable
  before phase 2.
- **Golden tests cover levels and models only.** Audio, UI and the space layer have no automated check; the smoke
  check is the only guard there.

## After

- Passing state explicitly instead of reading `Game.map` or `Me` from anywhere.
- A Rust core behind the simulation's now-declared interface (light grid first, then the collision world).
