# Plan: from the global `G` to ES modules

Status: phases 0, 1 and 2 done (2026-11-15); phase 3 not started. Written 2026-11-15.

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
| Other hand-kept load lists | `SERVER_SCRIPTS` (28 files, `js/serverworker.ts`), the prep worker's (21, `js/prepworker.ts`), the highlights export worker's (37, `js/exportworker.ts`), `LEVEL_SCRIPTS` (`tools/level_env.mjs`), `tools/model_env.mjs` |
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

**No phase changes behaviour.** Every phase is a refactor: the same levels, AI, ballistics, sound and screens before and
after. A change that would alter behaviour (a fix noticed on the way, a hook that can't reproduce what it replaces
exactly) goes in a commit of its own, outside the phase, and says so.

Each phase ends with the game working and every check passing: the typecheck, `test:level`, `test:models`, the smoke
check (`npm run smoke`) and the determinism check (`npm run test:sim`: the host's simulation run from fixed seeds,
its state compared with a saved fingerprint). Each phase can be committed and shipped alone.

### 0. Inventory (no behaviour change)

- Write `tools/deps.mjs`: for every file, which `G.X` it uses, split into "while loading" and "inside a function".
  Output: the dependency graph, the load-time order it requires, and every load-time cycle.
- Run a trial typecheck with `"moduleDetection": "force"` and keep the error list. That list is exactly the bare
  cross-file references (types and values that do not go through `G`).
- List every optional cross-layer reference (`G.X &&`, `G.X ?`) from a simulation file to a page-only file.
- Add a browser smoke check to the routine: the debug-start URLs (`?play=...`, `?board=...`, `?hangar`), with the
  server thread on and off.

Done when: the three lists exist and are checked in under `docs/`.

#### Phase 0 results

Run again with `npm run deps` (writes [modules-inventory.md](modules-inventory.md) and `modules-inventory.json`) and
`npm run smoke` (the browser smoke check: needs a Chromium, or set `BROWSER`; `-- --list` prints its URLs).

- **Load order is not a problem.** 103 of 5,683 uses of `G` run while a file loads, they form no cycle, and all six
  hand-kept orders already satisfy them. One large cycle of calls (74 files) exists, which ES modules allow.
- **The simulation reaches the page 133 times, never while loading.** 101 are unguarded. Most are in `js/shop.ts`
  (about 80: the shop's sums and its screen are one file), then `damage`, `stickers`, `arsenal`, `ballistics`. Phase 3
  should start by splitting `shop.ts` into its reckonings and its UI.
- **Phase 1's work list:** 124 names, 885 uses, declared at the top of one file and named bare in others. Almost all
  are types (`LvMap` alone has 161). Six are values, and some of those run at load (`G_Sim` in `game.ts` and
  `player.ts`), so the load-order graph does not see them; they need exports in phase 4.
- **THREE:** 43 files use it as a UMD global, which modules may not. Phase 2's import map has to cover this (or
  `allowUmdGlobalAccess` as a stopgap).
- **Smoke check baseline:** all ten cases ready with no errors (run by hand in the app's browser pane, since this
  machine has no Chromium; `tools/smoke.mjs` itself has not yet run in a headless browser).
- **Tooling:** TypeScript 7's package has no compiler API, so `tools/deps.mjs` parses with TypeScript 5.9.3, kept in
  its own folder (`tools/deps/package.json`, installed on first run). As a root dependency its `tsc` replaced the
  project's TypeScript 7 in `node_modules/.bin`, so it must stay out of the root `package.json`.

### 1. Shared types get a home

- Move each shared interface and type alias into `js/types/<owner>.d.ts`, a global declaration file named after the
  file that owns it. (`declare global { ... }` in the owner itself was the first idea, but a script may not contain
  one: it only works once the file is a module.) Nothing changes at runtime.
- After this, a file can become a module without breaking the files that name its types.

Done when: the trial typecheck from phase 0 reports no type errors, only value references.

#### Phase 1 results

- 176 interfaces and type aliases moved, from 36 files into 36 `js/types/*.d.ts` files, each with the comments that
  were attached to it. They were the 118 that other files name, plus 58 that those name in turn.
- Types that named a module's value bare now go through `G` (`typeof G_World.add` is now `typeof G.World.add`: the
  same type). Five places.
- **No runtime change, checked three ways:**
  - the compiled JavaScript of all 89 files, printed without comments, is identical before and after;
  - the determinism check, `test:level` and `test:models` pass;
  - the typecheck passes.
- The trial typecheck (now checking the declaration files too: `skipLibCheck` off) reports no missing types. The
  bare names left are three values, for phase 4: `G_Sim` (11 uses, at load, in `game`, `player`, `server` and
  `views`), `SvNet` (3, in `serverhost`; it is `G.Server.net`) and `G_HANGAR_ROWS` (1, in `spacedata`).
- Found on the way: `LvFxKind`, `HomeMat` and `RigState` are declared and used nowhere. Left as they are.

### 2. Loaders accept modules

- Page: change the `defer` script tags to `type="module"`. Order is preserved, so behaviour is the same.
- Workers (all three: server, prep, highlights export): start them as module workers (`new Worker(url, { type: 'module' })`) and replace `importScripts` with a
  list of side-effect imports in the same order.
- Before that, the three bare cross-file values (`G_Sim`, `SvNet`, `G_HANGAR_ROWS`) go through `G`, since a module's top-level names are no longer shared.
- three.js: the import map moves to phase 4 (nothing imports `three` until a file does); the global `THREE` stays.
- Node tools: **moved to phase 4** (see there).

No source file has an `import` yet. This phase only proves every loader can take one.

Done when: the page and all three workers load modules and the load lists still exist, as literal lists the workers `import()` in turn.

#### Phase 2 results

- **Bare values:** `G_Sim.X` is now `G.Sim.X` (11 uses, `game`, `player`, `server`, `views`), `SvNet.X` in `serverhost` is
  `G.Server.net.X` (the same object: `net: SvNet`), `G_HANGAR_ROWS` in `spacedata` is `G.HANGAR_ROWS` (`data.ts` sets it,
  and loads first). `npm run deps` reports 0 bare names between files.
- **Page:** the 85 `defer` game scripts in `index.html` are `type="module"`, same order; the CDN PeerJS tag stays
  `defer`. `dist/js/modelbundles.js` stays a classic, non-deferred script: it must run first so the model download starts
  before three.js is fetched, and a module would wait for the parse. The page has no inline scripts or `on...=`
  attributes naming a game name. `ambience.html` has no `defer` tags (its classic scripts feed an inline script that runs
  at once), so it is unchanged. The files were already strict (`alwaysStrict`), so module strictness changes nothing.
- **Workers:** all three start with `{ type: 'module' }`, and `importScripts(...)` became `for (const f of LIST) await
  import('./' + f + '.js')`. The lists are literal arrays (`SERVER_SCRIPTS`, and new `PREP_SCRIPTS`, `EXPORT_SCRIPTS`, which
  `tools/deps.mjs` now reads by those names): 28, 21 and 37 files, as before. Module workers need Firefox 114+ and Safari
  15+ (agreed).
- **Fallback checked:** with the server worker made to fail (a missing file in its list; a top-level throw) the page falls
  back to the simulation on the main thread (`G.ServerLink.mode === 'main'`) and the level plays.
- **Checks:** typecheck, `test:level` (31/31), `test:sim` (golden unchanged), `test:models`, `deps` (six orders consistent,
  28/21/37/86 files) pass; the ten smoke URLs all reach `__debugReady` with no errors, and the server ran in its worker
  in the six without `serverthread=0`.
- Found on the way: the prep worker's list had no `damage`, and `js/leveldesc.ts` reads `G.Damage.HINGES`, so every level
  the prep worker built failed with a TypeError (the page then made the level itself). It has been that way since the
  worker was added (d9cdeb4). Fixed in a commit of its own, after this phase: `damage` added to `PREP_SCRIPTS`. This is the
  one behaviour change on the branch: the prep worker now delivers its levels and light grids.

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

Node tools (moved here from phase 2): replace the `vm` loaders in `tools/level_env.mjs`, `tools/model_env.mjs` and
`tools/check_sim_golden.mjs` with real imports of `dist/js`. They evaluate the compiled files in a `vm` context, which
still works while no file has an `import`; it stops working with the first one, so it has to change together with
the first converted file, and with the import map for `three` (node needs `three` resolvable there too).

Done when: the server worker and the prep worker import their entry file and nothing else, and both hand-kept lists
are deleted, and the node tools import `dist/js`.

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
