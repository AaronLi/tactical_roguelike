# Plan: from the global `G` to ES modules

Status: phases 0, 1, 2, 3, 4 and 5 done (phase 3: 2026-11-16; phase 4: part a, the node tools, the codemod, the first 11 leaves; part b, 14 more files; part c, `server`, `spaceserver`, `serverhost`, `furnmesh`, `lightgrid`, and the workers' lists deleted: all 2026-11-16); phase 5 (part a: `zip`, `icons`, `cloudconfig`, `career`, `cloud`, `loadout`, and the audio files; part b, the models and rigs; part c, views and rendering; part d, the screens and space; part e, `player`, `game`, `demo`, `debugstart`, `index.html` down to one module tag, the export worker's entry file: all 2026-11-16, phase 5 done); 6 and 7 not started. Written 2026-11-15.

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

#### Phase 3 results

- **The rule, enforced.** The simulation files are the 30 the server worker and the prep worker load (the same set
  `tools/deps.mjs` has used since phase 0). `npm run deps:check` (`node tools/deps.mjs --check --no-tsc`) exits 1 for any
  `G.X` of a page-only module in one of them, guarded or not, and names the file and line; it passes now, and it runs in
  `.github/workflows/pages.yml` right after the typecheck. (Checked by putting a `G.Audio` in `js/scars.ts`: exit 1.)
  The inventory's section 2 is empty: the 133 uses (101 unguarded) are 0.
- **`js/shop.ts` split first**, as planned: `js/shop.ts` (566 lines) is now the reckonings, 133 lines, no page name in it: what
  Vex stocks (`genOffers`, `baseStock`, `scaleStock`), the squad's count (`count`, `inStock`, `stock`), this visit's
  `offers`, `partStock`, `precStock` and `level`, what a piece of kit costs as offered (`gearPrice`) and the wishlist. The
  server's thread loads it, as before, and calls the same two functions. The screen is the new `js/shopui.ts` (445 lines,
  `G.ShopUI`): the tabs, the cards, buying, ready-up, the hangar's menu. Its state (`tab`, `ready`, `loadSel`, `title`,
  `report`, `pend`, `qn`) moved with it; the methods' bodies are the same text, with `this.offers` and the other shared members
  now `G.Shop.offers`. Who owns the state is as it was (the UI still writes `G.Shop.level`, `.stock` and so on): changing
  that is not this plan. The call sites outside the two files (`game`, `gunsmith`, `hangar`, `invui`) say `G.ShopUI.render()`,
  `.buy()`, `.ready` and the rest; what's the stock's (`offers`, `partStock`, `inStock`, `gearPrice`, `wished`...) stays
  `G.Shop`. The new file is a script tag in `index.html` after `shop`; no worker or tool loaded the screen, so no other list
  has it (`shop` is only in `index.html` and `SERVER_SCRIPTS`).
- **The hooks: `G.Hooks`** (made in `js/util.ts`, the first file of every list, empty; typed in `js/types/hooks.d.ts`). One
  central object rather than one per module, because the page file that fills a hook often loads before the simulation file
  that calls it (`audio` loads before `damage`). Each is set by the page file that owns the thing, as it loads, so a worker
  that doesn't load that file leaves it unset. 17 of them:

  | Hook | Called by | Set by | Replaces |
  | --- | --- | --- | --- |
  | `gunStat` | `arsenal` tally (twice, guarded) | `loadout` | `G.Loadout &&` |
  | `toast`, `feed` | `arsenal` tally | `hud` | `G.HUD.toast`, `G.HUD.feed` |
  | `click` | `arsenal` tally | `audio` | `G.Audio.click` (still checked there) |
  | `enemyView` | `arsenal` kill | `views` | `G.Views.enemies.get` |
  | `biteDebris` | `damage` bite | `game` | `G.Game.map`, `G.R.debris` |
  | `doorFallSound`, `doorKick` | `damage` fall, update (guarded) | `audio` | `G.Audio.sampleAt`, `.kick` |
  | `doorDust` | `damage` update | `render` | `G.R.particles` |
  | `modelInfo` | `data` barrelMm (guarded) | `glb` | `G.Models.infoOf` |
  | `makeWeapon` | `gear` unpack (guarded) | `player` | `G.Me.makeWeapon` |
  | `inField` | `gear` all (guarded) | `game` | `G.Game.phase` / `.hub` |
  | `hangarDecorate` | `level` generateHub | `hangar` | `G.Hangar.decorate` |
  | `partLight` | `scars` | `render` | `G.R.partLight` |
  | `myStickers` | `stickers` owned | `player` | `G.Me.stk` |
  | `online`, `toHost` | `stickers` share, of (guarded) | `net` | `G.Net.myId`, `G.Net.toHost` |

  A call that was guarded (`G.Audio && ...`) is guarded by the hook being set (`if (G.Hooks.doorKick) ...`); one that wasn't
  (`G.HUD.toast(...)`) is `G.Hooks.toast!(...)`, which throws in a thread that never set it, as `G.HUD` being undefined did.
  The guards inside the page (`G.Audio.click` existing) moved into the hook, so the same checks run at the same moment. A
  condition that wasn't about the page (`!snap`, `F.t < 8`, `fm.wallMesh`) stays in the simulation, before the call.
- **One function moved instead of hooked:** `Ballistics.self()` (a reference body posed as you, from `G.Me` and `G.Rig`) was
  called only by `js/player.ts`; it is now `selfRig()` in `player.ts`, same text.
- **The hand-kept lists:** nothing to add to them (`util` is first in all six, and nothing new is loaded by the workers). The
  tools that stood in for the hangar changed with the hook: `tools/level_env.mjs` and `tools/check_furniture_golden.mjs` set
  `G.Hooks.hangarDecorate = () => {}` where they had `G.Hangar = { decorate() {} }`, and `loadModels()` in
  `tools/model_env.mjs` (`glb.js` on its own) now loads `util.js` first, since `glb.js` sets a hook.
- **Graph afterwards:** 90 files, 176 names on G (`Hooks`, `ShopUI`), 133 uses while loading (116 before: the 17 hook
  settings, each a use of `util`), still no load-time cycle, the six hand-kept orders still consistent. The one 74-file cycle
  of calls is now 5 cycles, the largest 43 files: the page no longer calls into the simulation's files and back.
- **Checks:** typecheck, `test:level` (31/31), `test:sim` (4/4, golden unchanged), `test:models` (including the hangar and
  furniture goldens), `deps` and `deps:check` pass; the ten smoke URLs reach `__debugReady` with no errors (each in its own
  process). On the page, `G.Hooks` has all 17 hooks set, and every tab of the shop screen (route, stock, kit, gunsmith, zeroing,
  supplies, career) renders in the hangar, `wishNotice`, `services` and `nvField` included (a one-off script, not kept).
- **Not reproduced exactly (none reachable):** with a hook unset, a guarded call is skipped and an unguarded one throws a
  TypeError, as before, but the message differs ("not a function" for "undefined"), and the arguments are evaluated before it
  throws, not after (they have no effects). In `damage`'s `update`, `G.R.particles && F.t < 8` read `G.R` first even when `F.t`
  was 8 or more; the hook is given `F.t` and checks both, so that order stays.
- Found on the way, not touched: in `js/scars.ts` (a puff of dust being placed) the line `m.material.opacity = 0.7; // (unlit: ...)
  m.scale.setScalar(u.k); m.visible = true;` has two statements after the `//`, which makes them part of the comment. The puffs'
  update skips any that aren't `visible`, so it looks as if the dust puffs never show. It was so before this phase (the hook
  changes only the code before the comment); it wants a look and its own commit.

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

#### Phase 4 results (part a)

Run the codemod (`node tools/codemod_imports.mjs js/foo.ts`, usage at the top of the file), then `npm run typecheck`,
`deps:check`, `test:sim`, `test:level`, and the smoke check, for each next file.

- **The node tools** load the compiled game through `tools/vm_game.mjs`: `runScripts(ctx, dir, ['util', 'data', ...])` /
  `runFile(ctx, file)`. A compiled file with an `import`/`export` is run as an ES module (`vm.SourceTextModule`) **inside the
  tool's own vm context**, its imports resolved to the other files of the folder in the same context; one without is a script, as
  before, so the two mix as they do on the page. Every tool keeps the context it always made (its own fake `document`, `THREE`,
  seeded `Math.random`, fake timers, `G = {}`), so a context is a whole game of its own with its own module graph. This is
  deliberately not "import `dist/js` into the tool's own process", which was the first idea: while `G` is still a global, two games in one process
  share it (`loadModels()` next to `loadGame()` in `tools/check_models.mjs`, two "browsers" at once in `tools/cloud.test.mjs`,
  the old and the new build in `tools/check_models_parity.mjs`), and a fresh instance per scenario has to be a fresh global too.
  Importing the helper starts node again with `--experimental-vm-modules --no-warnings` if it isn't set (once; `node tools/x.mjs`
  and every npm script work as they did), so it must be the first import of a tool. The cost: node 22's experimental
  `vm.SourceTextModule` (the workflow's node 22 has it). When `G` is gone (phase 7) a plain `import()` per tool will do and this
  file can go. The loaders became `async` (`loadLevel`, `loadGame`, `loadModels`, `loadGameWithModels`, `shipData`, and `browser()` in
  the cloud test): callers `await` them (13 tools).
  - `tools/check_sim_golden.mjs`: each run (a scenario, and its twin run to prove the check is deterministic) is a new context with
    a new module graph in it, so nothing is shared between runs; `Math.random`, the timers and `performance` are the context's, set
    before anything is loaded. **The fingerprints are identical: `test:sim` 4/4 against the same `tests/sim-golden.json`** (not
    touched, not updated).
  - Also moved: `level_env`, `model_env` (`loadModels`, `loadGame`; an `--old-dist` build of scripts still loads, in the same way),
    `cloud.test` (util.js, a "browser" per call, each a context of its own), `bake_hangar`, `check_hangar_golden`,
    `check_furniture_golden`, `ship_layout`. `tools/model_bundles.mjs` loads `modelbundles.js` alone and it is still a script.
    `tools/deps.mjs` reads `tools/model_env.mjs`'s list from `runScripts(ctx, dist, [`; `LEVEL_SCRIPTS` is still a literal list.
- **three.js: no import map yet.** Nothing imports `three`; the global `THREE` (js/threeboot.ts) stays, and the tools put their own
  on the context. The TypeScript side needed `"allowUmdGlobalAccess": true` in `tsconfig.json` (a module naming the UMD global
  `THREE` is error TS2686: `callsigns` and `sim` do). The loader answers an `import ... from 'three'` with the context's own
  `THREE` (a synthetic module over `ctx.THREE`), untested since nothing does it; the page's import map goes in with the first file that imports it.
- **The codemod, `tools/codemod_imports.mjs`** (TypeScript 5 parser, as `tools/deps.mjs`): converts a file written the way the
  simulation's are (`const G_X = ...; G.X = G_X; interface GameModules {...}` becomes `export const X = ...; G.X = X; declare
  global { interface GameModules {...} }`, every `G_X` in the file renamed; a file with many, `data.ts` ~90, exports them all under
  their G names), and rewrites each `G.X` / `window.G.X` / `typeof G.X` of a converted file's name into the bare name with an
  `import { X } from './file.js'` (aliased `X as G_X` if the file already has an `X`). `G.X = ...` definitions stay (the unconverted
  files still read G). It **leaves as `G.X` a name of a file the hand-kept lists load after this one**, and says so: importing it
  would run that file earlier and could make a cycle, which is where a load-time effect would break (`--force-order` imports anyway).
  It also reports guards that are always true now, assignments of a converted name elsewhere, and a simulation file importing a page one.
  Run it with `--dry` first. `--uses` re-runs the second half (for a converted file, after another has been converted).
- **`tools/deps.mjs`** knows `import`: each is an edge at load (an import runs its target first), checked against the hand-kept
  lists as a load-time need, and **`deps:check` fails for a simulation file importing a page-only file** (tried with an
  `import` of `audio` in `scars`). `G.X = X` still counts as the definition.
- **Converted, 11 files:** `util`, `data`, `spacedata`, `materials`, `medical`, `gear`, `arsenal`, `parts`, `sim`, `shipgen`,
  `callsigns` (`G.U` is `U`, `G.Hooks` is `Hooks`; `data`'s 90 names are `WEAPONS`, `THEMES`...). All stay in every list (a listed converted
  file runs once, in its place: the page's module tags, the workers' `import()`s).
- **Left as `G.X` between converted files, because the lists load them later:** `gear` reads `G.Medical` (`medical` is listed
  after it), `shipgen` and `spacedata` read `G.Materials` (`materials` is listed after both), and `data` reads `G.Gunsmith`
  (a page file, `gunsmith.ts`, `typeof`-guarded, an optional reach that stays). `medical` and `materials` need only `util`, so
  moving them up in the four lists (and `tools/level_env.mjs`) and re-running `--uses` finishes these.
- **Next, in the plan's order:** `world`, `ballistics`, `leveldesc`, `level`, `furnspec`, `furniture`, `homes`, `residents`,
  `scars`, `damage`, `stickers`, `route`, `shop`, `recorder`, then `server`, `spaceserver`, `serverhost`; then delete the
  hand-kept lists (the workers import their entry file; `index.html` stays until phase 5). For each: the codemod, typecheck,
  `test:sim` (still 4/4 against the same golden), `test:level`, `test:models`, `test:cloud`, the smoke check one case per process, and
  `G.ServerLink.mode === 'worker'` plus a prep and an export worker boot (a one-off script over the DevTools protocol, not kept).
  Anything with load-time uses (`inventory`: `G_Sim` in `game`/`player` is now `G.Sim`, `game`/`player`/`server`/`views` are later) needs the import order checked.
- **Checks (after the 11 files):** typecheck, `deps:check`, `test:level` 31/31, `test:sim` 4/4 (golden unchanged), `test:models`
  (all goldens), `test:cloud` 21/21; smoke 10/10 (one case per process); on the page `G.ServerLink.mode === 'worker'` with the
  17 hooks set, and the prep worker built a level and its light grid, the export worker booted, all with the converted files
  (a one-off script). `tools/bake_hangar.mjs` re-baked the scene byte for byte.
- **Not reproduced exactly / noted:** nothing behavioural. `check_models.mjs` now loads the game once for its per-file authored
  checks (it loaded one per file). Stack traces from a tool's game show absolute file names, not `util.js`. The guard notes on
  `G.EXPLOSIVES_OFF && ...` in `data` are the codemod's heuristic (a boolean, not a presence check).

#### Phase 4 results (part b)

- **The lists first.** `medical` and `materials` need only `util`, so they now load right after it in every list (`index.html`,
  `SERVER_SCRIPTS`, `PREP_SCRIPTS`, `EXPORT_SCRIPTS`, `LEVEL_SCRIPTS`, `tools/model_env.mjs`'s game list,
  `tools/check_furniture_golden.mjs`); `gear`, `shipgen` and `spacedata` import them. Later, `world` before `ballistics` and
  `leveldesc` before `level` (both read nothing of the files after them while loading), so `ballistics` and `level` import
  them. `npm run deps`: six orders consistent, no load-time cycle. (`tools/bake_hangar.mjs` takes its order from `index.html`.)
- **Converted, 14 more (25 in all):** `world`, `ballistics`, `leveldesc`, `level`, `furnspec`, `furniture`, `homes`, `scars`,
  `damage`, `stickers`, `route`, `shop`, `recorder`; `residents` is an IIFE with nothing to export, so it is a module only by
  importing `furniture` and `homes`. Then `--uses` was run again on every converted file, for the names that were new.
- **Removed, because a module's unused locals are errors:** the type `LvFxKind` in `level.ts` and `HomeMat` in `homes.ts`
  (both unused, noted in phase 1). No runtime change.
- **Still read through `G` between converted files (the lists put the named file later, or it is the other half of a cycle
  whose members call each other only inside functions):** `level` and `world` (read by `spacedata`, `materials`, `shipgen`, `sim`
  and by each other: `world` reads `G.Level` and `G.LevelDesc`), `damage` (by `leveldesc`, `world`), `scars` (by `damage`),
  `ballistics` (by `arsenal`, `medical`), `parts` (by `data`), `sim` and `stickers` (by `gear`), `homes` and `furniture` (by
  `level`, `furnspec`), plus `data`'s optional `G.Gunsmith`. Importing any of these would run a file earlier, or close an import
  cycle through a file that has a load-time use. They go when the lists are deleted and the order is the import graph's.
- **Stand-ins checked:** none is bypassed. `tools/cloud.test.mjs` loads only `util`, `cloudconfig`, `career` and `cloud`, so its
  `G.THEMES`, `G.Route`, `G.Arsenal`, `G.Callsigns` and `G.Net` are only read by files that still read `G`; `exportworker`'s
  `G.Game`/`G.Net` and the hooks are not names of converted files; `tools/level_env.mjs` (`G.Range`) and the furniture golden (a hook)
  likewise. `route` and `shop`, converted, are not read by `cloud` through an import.
- **Next:** `server`, `spaceserver`, `serverhost`; then delete the lists (the workers import their entry file), and the page side.
- **Checks:** typecheck, `deps:check`, `test:level` 31/31, `test:sim` 4/4 (golden untouched), `test:models`, `test:cloud` 21/21;
  smoke 10/10 (one case per process); on the page `G.ServerLink.mode === 'worker'` with 17 hooks, the prep worker built a level and
  its light grid, the export worker booted (a one-off script, not kept).

#### Phase 4 results (part c)

Phase 4 is done: the workers' lists are gone, the simulation's files import each other, the tools load the entry files.

- **Converted, 5 more (30 in all, and `residents` by its imports):** `server`, `spaceserver`, `serverhost`, and `furnmesh` and
  `lightgrid` (not in the plan's order, but the prep worker loaded them: a module's reads of `G.FurnSpec`, `G.Level` and `G.Homes`
  became imports). The codemod, then `--uses --force-order` on every converted file, since with the lists gone "the lists load it
  later" is no reason to leave a `G.X`.
- **The workers import one file each, and nothing else but three.js.** `js/serverworker.ts` is `import('./threeboot.js').then(() =>
  import('./serverhost.js'))`; `js/prepworker.ts` the same with `./prepentry.js`, a new file of side-effect imports (the prep worker has no
  file of its own to be the entry, as the server has `serverhost`). They are `import()`s, not static imports, because a static import
  runs before the worker has set `window` and `document` (files read them as they load). `SERVER_SCRIPTS` and `PREP_SCRIPTS` are deleted. Each
  entry file names every file its list had, in the list's order (27 in `serverhost.ts`, `serverhost` itself being the 28th; 22 in `prepentry.ts`), so nothing dropped out and
  `residents` (an IIFE with no export, which nothing imports) still runs. `EXPORT_SCRIPTS`, `index.html` and the tools' own lists stay
  lists (they name page files that are not modules yet: phase 5) and are checked the same way.
- **Evaluation order is not the list's any more, on purpose, and is checked.** A module runs when it is first imported (depth first), so
  where `level` imports `homes` and `furniture` the two run before `level`. Observed with a one-off log at the top of every compiled file
  (not kept; the page's and the worker's graph is the same one):

  | | order the server worker (and node's `test:sim`) ran the files in |
  | --- | --- |
  | before (the list) | util medical materials data spacedata shipgen callsigns arsenal parts gear sim world ballistics leveldesc level furnspec furniture homes residents scars damage stickers route shop recorder server spaceserver serverhost |
  | after | util data parts scars damage leveldesc world shipgen furniture homes level materials spacedata sim stickers gear ballistics medical callsigns arsenal furnspec residents route shop recorder spaceserver server serverhost |

  The prep worker's is the same with `furnmesh lightgrid prepentry` after `residents` and without the rest. The forward imports that
  cause it (a file imports one the list had later): `medical` and `arsenal` import `ballistics`; `materials`, `spacedata`, `shipgen` and
  `sim` import `level` (the last three `world` too); `gear` imports `sim` and `stickers`; `world` and `leveldesc` import `damage`, `level`
  and each other; `level` imports `furniture` and `homes`; `furnspec` imports `furniture`; `recorder` imports `server`; `server` imports
  `spaceserver` and `serverhost`. Every one of those uses is inside a function. **Why the new order is safe:**
  - the only things a file reads from another *while loading* are these (besides `util`), and each target runs first (checked by `tools/deps.mjs`,
    which now counts the use of an imported name as a use, not only `G.X`): `ballistics`<-`materials`, `furnmesh`<-`furnspec`,
    `homes`<-`furniture`, `parts`<-`data`, `residents`<-`furniture` and `homes`, `server`<-`sim`, `spacedata`<-`data`,
    `spaceserver`<-`spacedata`. The one import that would have broken a need was `data` importing `parts` (parts reads `data` while
    loading, so `parts` would run first): that was tried, caught by the order check, and put back as `G.Gunsmith`.
  - no file draws a random number while loading (every `Math.random` in the simulation is inside a function), so the stream a run
    starts from is the same; `test:sim` (4/4, the same untouched golden: bit-identical fingerprints) and `test:level` (31/31) agree.
  - no file looks through `G` for what is registered (`Object.keys(G)` and the like: none), so the order files register in does not show.
  - the one file that adds to another's tables as it loads, `residents` (to `furniture`'s `R` and `homes`' `RESIDENTS`), still runs after
    both, and the files that read those tables read them when a level is made.
- **`G.X` reads left between simulation files: one.** `data` reads `G.Gunsmith` (`parts`) in `shotSoundKey`, `chambered`, `revolver`,
  `fblock` and `boltHold` (all but the first already `G.Gunsmith &&`-guarded): `parts` reads `data` while it loads, so `data` cannot import `parts`.
  Between the simulation and the page there is none (the hooks). The workers read `G.ServerHost`, `G.Level` and `G.LightGrid` after
  the entry file has loaded (they cannot import them: see above). `gear`'s `typeof G.Me` is a type of a page file.
- **The tools find the files by the entry file.**
  - `tools/check_sim_golden.mjs` runs `serverhost` (the rest follows its imports) instead of parsing `SERVER_SCRIPTS`.
  - `tools/level_env.mjs`'s `LEVEL_SCRIPTS` is `prepentry`, `scars`, `stickers` (the 22 of before).
  - `tools/ship_layout.mjs` (it loaded `util`, `data`, `spacedata`) needed `THREE` in its context: `spacedata` imports `level`, which
    reaches `damage`, which reads it while loading.
  - `tools/codemod_imports.mjs` no longer reads the worker lists (the simulation's files are `SIMULATION` in `deps.mjs`).
  - `tools/vm_game.mjs` stays: each tool still makes a game of its own, with its own `G`.
- **`tools/deps.mjs`** works the order out instead of reading it. An `import` no longer counts as "needed at load" (that made every
  cycle a load cycle); what counts is a use while loading, of `G.X` or of an imported name (a bare `Level` in a top-level
  statement or in a function called at load). For each loader it runs the module graph (`evalOrder`: depth first, once each, an
  import of only types dropped as `tsc` drops it) from the loader's roots (index.html's tags, `EXPORT_SCRIPTS`, the tools' lists, and
  the workers' entry files, read from their `import()`s), and checks every load-time need against that order, as before. The layering
  check needs the simulation named now that no list does: it is `SIMULATION`, in the file, and the check fails if what the two entry
  files reach is not exactly that (so a page file imported by a simulation file is an error, not a quiet new simulation file; tried
  with `import ... from './audio.js'` in `scars`). The inventory is regenerated: 91 files, six orders consistent, no load-time cycle.
- **Stand-ins re-checked, none bypassed:** `exportworker`'s `G.Game`, `G.Net` and its two hooks (`Hooks` is the one object the files import,
  and `G.Stickers.base` / `G.Models.setRoot` set properties on the objects they hold); `tools/cloud.test.mjs`'s `G.THEMES`, `G.Route`, `G.Net`,
  `G.Arsenal`, `G.Callsigns` (it loads only `util`, `cloudconfig`, `career` and `cloud`, none of which imports); `tools/level_env.mjs`'s
  `G.Range` and hook, `tools/check_furniture_golden.mjs`'s hook (only page files read `G.Range`). `index.html` and `tools/model_env.mjs`
  still load their lists of modules and the page files that are not, in an order the check passes.
- **Checks:** typecheck, `deps:check`, `deps` (six orders consistent), `test:level` 31/31, `test:sim` 4/4 (golden untouched),
  `test:models` (every golden, including the hangar and furniture ones and `bake_ships --check`), `test:cloud` 21/21; smoke 10/10 (one
  case per process). On the page `G.ServerLink.mode === 'worker'` (the server's thread really runs in its worker, 17 hooks set), the prep
  worker built a level and its light grid, the export worker booted (a one-off script, not kept).
- **Not reproduced exactly / noted:** nothing behavioural. The files evaluate in another order (above).  `lightgrid` and `furnmesh` are modules now, so the page's
  `G.LightGrid` and `G.FurnMesh` are the same objects as the exports. Left for phase 5: the page files that still read the simulation
  through `G.X` (`G.Level`, `G.Server`, ... in `game`, `render`, `hud`...), the three lists that are left, and `index.html`.

#### Phase 5 results (part a)

- **Converted, 12 files (42 in all, `callsigns` having been done in phase 4):** `zip`, `icons`, `cloudconfig`, `career`, `cloud`, `loadout`,
  then the audio files `audio`, `gunaudio`, `footsteps`, `acoustics`, `ambience`, `handling`. The codemod, then `--uses --force-order`
  on all of them (the lists no longer decide: `npm run deps` checks the real order). `deps:check` is green with every one of the new
  forward imports (`audio` imports `gunaudio`, `footsteps`, `acoustics` and `level`; `gunaudio` imports `acoustics` and `ambience`; `loadout`
  imports `gear`, `parts` and `audio`; `icons` imports `data`, `gear`, `parts`): each reads the other only inside functions, and the guards
  the codemod listed (`G.Audio && ...`, `G.Acoustics ? ...`, `G.Level ? G.Level.TS : 2`) are always true now and left as they are.
- **Stand-ins, not bypassed.** `tools/cloud.test.mjs` loads only `util`, `cloudconfig`, `career` and `cloud`, and puts `G.THEMES`, `G.Route`,
  `G.Net`, `G.Arsenal`, `G.Callsigns` on after. The codemod's imports in `career` (`THEMES`, `Route`) and `cloud` (`Callsigns`, `Arsenal`,
  `Shop`) would have loaded the real `data`, `route`, `arsenal`, `shop` (and their graph) into those "browsers" and ignored the stand-ins,
  so those reads stay `G.X`, each with a comment (`G.Net` is not read by either). `career` and `cloud` import `util`, `cloudconfig` and each
  other, which the test loads anyway. `test:cloud` is 21/21 with the same meaning.
- **`ambience.html`** loaded `audio.js` and `ambience.js` as classic scripts after `self.G = {}`. They are modules now and import more
  (`level`, which reads `THREE` while loading), so the page loads `threeboot.js` and then runs its inline script as a module that
  imports `Audio` and `Ambience`. Exercised headlessly (a one-off DevTools script, not kept): it builds 14 places and 29 events, Start
  builds the audio graph and plays Apartment, an event and another place play, Stop, no console errors from the modules. Before the
  change the same script also showed `audio.js: Cannot set properties of undefined (setting 'click')` (`G.Hooks` was not there, on that
  page); that error is gone. The script's last step fires an event's button after another place has been picked and gets `InvalidAccessError: cannot connect to
  an AudioNode belonging to a different audio context`, the same before and after (the page's own, not looked into).
- **Left as `G.X`:** the page files that are not converted yet: `G.Game`, `G.Space`, `G.Me`, `G.Casings`, `G.R`, `G.AudioBundle`,
  `G.VMAnim`, `G.GunModels`, `G.HUD`. `js/gunshot-synth.ts` is a window-global IIFE (`window.GunshotSynth`, read by `gunaudio`), not a `G` file; it
  stays as it is, still a module tag in `index.html`.
- **Next:** part b (models and rigs), c (views and rendering), d (player, game, space, the screens, `index.html` down to one tag).

#### Phase 5 results (part b)

- **Converted, 14 files (56 in all):** `prep`, `gunmaterials`, `gunmodels`, `glb`, `gunrig`, `bolts`, `viewmodel`, `vmanim`, `casings`,
  `humandata`, `humans`, `headgear`, `rig`, `shipmodel`; their `index.html` tags are `type="module"` now. The codemod, then
  `--uses --force-order` on all of them. `gunrig` and `rig` export a value named like a global type (`GunRig`, `Rig`): the codemod
  refused, so the constant was renamed by hand (a module's local value shadows only the value, the type is still the global
  interface). `RigState` of `rig.ts` was used nowhere and is removed (a module's unused locals are errors). `modelbundles` is still a
  classic non-deferred script, `glb` still sets `G.Hooks.modelInfo`, and `glb`'s own `G.GLB` (made by it, replaced by the tools) is read through `G`.
- **Left as `G.X`, on purpose (each has a comment in the file):**
  - `gunrig` reads `G.GunModels`: the model tools set `G.GunModels = G.GunRecipes` after loading (`tools/model_env.mjs`), which an import
    of `gunmodels` would bypass (and load the game's facade, `glb` and the viewmodel into the bake).
  - `rig` reads `G.Footsteps`, `vmanim` reads `G.Bolts`, `G.Casings` and `G.Icons`: the export worker does not load them, and the
    guard on `G.Footsteps` is real there (an import chain `vmanim` -> `casings` -> `audio` -> `footsteps` would make the exported
    figures stride by `Footsteps.stride` and call `rigStep`, where they used the plain stride before). They go in part c or d with the worker's list.
  - the page files not converted yet: `G.R`, `G.Game`, `G.Views`, `G.Me`, `G.Space`, `G.Net`... (`bolts`, `casings`, `vmanim`, `rig`).
- **Stand-ins checked:** `tools/model_env.mjs`'s `G.GunModels` (above) and `G.GLB` (it replaces `glb`'s, which is read through `G`) stay
  effective. One change to the tool: `loadModels()` runs `glb` in a bare context, and `glb` now imports `gunmaterials` (which builds
  its materials as it loads), so that context gets `THREE`; its output is the same. `exportworker`'s `G.Game`, `G.Net`, hooks, `G.Models.setRoot`
  are not names these files import (the worker still lists all of them, `modelbundles` included). `deps:check` is green with the `gunmodels` ->
  `glb`/`viewmodel` -> `vmanim` -> `gunrig`/`humans`/`rig` imports (all reads inside functions); `ambience.html` loads none of these.
- **Next:** part c (views and rendering), then d.
- **Checks:** typecheck, `deps:check`, `deps` (orders consistent), `test:level` 31/31, `test:sim` 4/4 (golden untouched), `test:cloud` 21/21,
  `test:models` all green (every golden unchanged, `bundle_models --check`, `bake_humans --check`, `bake_ships --check`, hangar golden hash
  the same), `node tools/bake_hangar.mjs` re-baked with no byte changed; smoke 10/10 (one case per process); on the page
  `G.ServerLink.mode === 'worker'` (17 hooks), the prep worker built a level and its light grid, the export worker booted (a one-off script;
  a bad `go` fails in `exportHere` as before, not in the boot). Not exercised: the gunsmith, inventory and highlights export screens
  beyond what the hangar and level cases load (guns, viewmodels, rigs).

#### Phase 5 results (part c)

- **Converted, 11 files (67 in all):** `levelview`, `glare`, `shotlog`, `render`, `views`, `hud`, `menushow`, `highlights`, `profiler`, `gamepad`, `touch`
  (the codemod, then `--uses --force-order`). `render` exports `R` and had a local `R` (a `const R = G.Rig`
  in its warm-up), renamed `RG` by hand. The hooks stay: `render` sets `Hooks.doorDust` and `partLight`, `views` `enemyView`, `hud` `toast` and `feed`.
  `profiler`, `gamepad` and `touch` register no listener while loading (their `init`s do, called by `game`), so the order and number of registrations are unchanged.
- **The export worker's set did not change:** its 37 evaluated files before and after (the `evalOrder` of `tools/deps.mjs`, compared from the
  inventory json) are the same files; the only difference is that `gunmaterials` now runs just before `render` (which imports it) instead of after it.
  So the codemod's imports were undone, with a comment in the file, for what the worker does not load: `render` reads `G.ShotLog`, `G.HUD`,
  `G.Bolts`, `G.Audio`, `G.Views`, `G.Casings`, `G.Highlights` (several are guards that are real there: `G.ShotLog`, `G.Audio`, `G.Highlights`), and `highlights` reads `G.Audio`,
  `G.GunAudio`, `G.HUD`, `G.Icons`, `G.Shop`, `G.Views`, `G.Zip`. The earlier `rig`/`vmanim` reads stay as they are.
- **A cycle avoided:** `viewmodel` reads `G.R.TONE` while loading, so `render` must run before it; `render` imports neither `viewmodel` nor `gunmodels` nor
  `rig` (each reaches `viewmodel`), so those three are `G.X` reads in `render` (`highlights` imports `render` before `rig` for the same reason).
- **Left as `G.X`:** the unconverted page files (`G.Game`, `G.Me`, `G.Net`, `G.Space`, `G.Hangar`, `G.Loot`, `G.Range`, `G.Course`, `G.InvUI`, `G.ServerLink`) and the lines above.
  `G.X = X` for every file stays.
- **Exercised beyond the smoke cases (one-off scripts, not kept):** the main menu (`G.MenuShow.live` true, no console errors); a warehouse level, a
  recording of it (ticks and a kill fed to `G.Highlights`), `take`, `mount`, `exportPack` (a .zip, 2.4 kB), then `renderPack` of that .zip: the export worker
  booted, ran `exportHere` with the converted `levelview`, `render` and `highlights`, and reported "Rendering 8%" when the 240 s limit ended the run (software GL
  here: the whole video would take much longer). No errors on the page or in the workers. `ambience.html` unchanged (the same `InvalidAccessError` as before, none new).
- **Checks:** typecheck, `deps:check`, `deps` (six orders consistent), `test:level` 31/31, `test:sim` 4/4 (golden untouched), `test:models` all green,
  `test:cloud` 21/21; smoke 10/10 (one case per process); on the page `G.ServerLink.mode === 'worker'`, the prep worker built a level, the export worker booted.
- **Next:** part d (player, game, space, the screens, `index.html` down to one tag, the export worker's list to an entry file).

#### Phase 5 results (part d)

- **Converted, 13 files (80 in all):** `shopui`, `invui`, `gunsmith`, `zeroing`, `loot`, `course`, `range`, `hangar`, `landing`, `spaceui`, `space`, `net`, `serverlink`
  (the codemod, then `--uses --force-order` on them). Then `--uses --force-order` again on the already converted page files that read the new names and are
  neither simulation nor in the export worker: `hud` (`Net`, `Space`), `views` and `shotlog` (`Net`), `casings` (`Loot`, and `R` of `render`, which the codemod added too),
  `profiler`, `gamepad` and `touch`. `index.html` is unchanged (its tags were modules already). `hangar` still sets `Hooks.hangarDecorate`, `net` `online` and `toHost`.
- **`viewmodel` imports `render`.** It reads `G.R.TONE` while loading, and `hangar` now reaches it (by `icons`, `gunmodels`, `glb`) from a tool that loads only
  `hangar`, so nothing ran `render` first. The import is the true need (`render` reaches neither `viewmodel` nor anything that does); in the export worker `render`
  was already listed before it, so its 37 files and their order are unchanged (compared from the inventory json, `orders` of `js/exportworker.ts`).
- **Tools that load `hangar`** now load the screens it imports, which read `document` and `matchMedia` as they load (`touch`, ...): `tools/check_hangar_golden.mjs` gets a
  context whose `document` answers anything, and `tools/bake_hangar.mjs` gets `matchMedia` and a window size. Neither is used by what they run (`decorate`, `fixtures`):
  the golden is `hangar golden OK ... the code's collision matches the bake`, the same hash, and `node tools/bake_hangar.mjs` rewrote `assets/models` with no byte changed.
- **Left as `G.X` (on purpose):**
  - `G.Net` in `career` and `cloud` (the cloud test's stand-in), in `server` and `serverhost` (simulation: a page file may not be imported), in `highlights`, `render`,
    `levelview`, `rig` (export worker); `G.Range`, `G.Loot`, `G.Hangar` in `render`, `levelview`, `highlights`, `rig` (the export worker does not load them, the guards are real there);
    `G.Space` in `acoustics` and `ambience` (`ambience.html` loads them, and not `space`); `G.ServerLink` and `G.Loot` in `server` and `serverhost` (simulation).
  - `G.Me`, `G.Game`, `G.Hangar`, `G.Space`, `G.Landing`, `G.InvUI`, `G.Course`, `G.Range`, `G.Loot` read by `player`, `game`, `demo` and `debugstart` (part e).
  - `G.Me`, `G.Game`: `player` and `game` are not modules yet (the 60-odd reads in these files). `hangar` reads `G.LevelView` twice in comments only.
- **Stand-ins checked, none bypassed:** `tools/level_env.mjs` sets `G.Range = null` and nothing it loads imports `range` or reads it (only `render`, `game`, `player` read `G.Range`,
  and `render` still does through `G`); `exportworker`'s `G.Net = { myId: '' }` is read by files that still read `G.Net`, and none of the 37 imports `net`; `tools/cloud.test.mjs`'s
  `G.Net` likewise (`cloud` and `career` untouched). `serverlink` imports `serverhost`, which `index.html` loads anyway.
- **Exercised beyond the smoke cases** (one-off headless scripts, from `?hangar`, `?fly`, `?board`, `?assault` and the level cases; each run alone, as a second page in one
  process flakes): every shop tab (stock, route, kit = the inventory, gunsmith, zero = zeroing, svc, career) rendered, 13 services; the field inventory opened and
  refreshed; the range entered (29 targets, 7 lanes, `Range.on()` true) and the IPSC course entered, started (state `running`), a shot, regenerated; `landing`
  through `assault` (the `Landing` object there, `Game.phase` level), `spaceui` and `space` through `fly` and `board`. The page throws one error, `WrongDocumentError ... pointer
  lock`, from the script's own `toggleInv` in a headless page, identically on the pre-change commit `930d048` (a worktree, compiled, served on another port). `G.ServerLink.mode`
  is `worker` with 17 hooks, and `main` with `serverthread=0`; the prep worker built a level and its light grid; the export worker booted; `ambience.html` unchanged (the
  same `InvalidAccessError` as before, none new).
- **Next:** part e: `player`, `game`, `demo`, `debugstart`, then `index.html` to one tag and the export worker's list to an entry file.
- **Checks:** typecheck, `deps:check`, `deps` (six orders consistent), `test:level` 31/31, `test:sim` 4/4 (golden untouched), `test:models` all green, `test:cloud` 21/21; smoke 10/10.

#### Phase 5 results (part e)

Phase 5 is done: every page file is an ES module (but `modelbundles` and `gunshot-synth`, see below), `index.html` loads one, and the export worker imports one entry file.

- **Converted, 4 files (84 modules in all):** `player`, `game`, `demo`, `debugstart` (the codemod, then `--uses --force-order`). They keep every `G.X = X` (the console helpers and `?play` and friends read
  `window.G`), `player` its two hooks (`Hooks.makeWeapon`, `Hooks.myStickers`) and `game` its two (`Hooks.inField`, `Hooks.biteDebris`). `--uses --force-order` then, file by file, on the converted page files that
  read `Me` or `Game`: `casings`, `course`, `gamepad`, `glare`, `gunsmith`, `hangar`, `hud`, `invui`, `landing`, `range`, `shopui`, `shotlog`, `space`, `spaceui`, `touch`, `views`, `zeroing`, `loot`, `serverlink`, `profiler`;
  and on `loadout`, `bolts`, `handling` and `icons`, whose reads of `HUD`, `R`, `Views`, `VMAnim` and `GunModels` had been left from earlier parts only because the target was not a module yet (checked: `deps:check` stays green, no tool
  or page that loads them lacks the target). By hand, `rig` imports `LevelView` (left from part c; `levelview` already runs before it in the page and in the worker). `net` had no read of `Game` left to convert (a comment).
  It was not run over `render`, `highlights`, `rig`, `vmanim`, `levelview` (the export worker's `G.Game`, `G.Me`, ... stay stand-ins), `audio`, `acoustics`, `ambience`, `footsteps`, `gunaudio` (`ambience.html`), `career`, `cloud` (the
  cloud test's stand-ins), and not over `gunrig` (the model tools put the recipes at `G.GunModels`), so those keep their deliberate reads (the list is below).
- **`game` does not import `profiler`.** `profiler` wraps `Game.loop` and the `Me` methods as it loads (`install()`), so it must run after both: it imports them (`--uses`), and `game` keeps `G.Prof` (4 reads, a comment says why).
  The codemod had imported it; `deps:check` caught it (`profiler needs game while loading (later)`).
- **What `game` and `player` do at load is the same, in the same order relative to what matters.** `game`'s only top-level effects are `window.addEventListener('load', () => Game.init())` and one `gunicons` listener; `debugstart` adds its
  `load` listener (`?play` ...: `setTimeout(run, 300)`) and `demo` its own. `Game.init` runs on `load`, after every module of the graph has run (module scripts delay it, a single entry module as the many tags did), so the `requestAnimationFrame`
  loop, `Net` and `Audio` start exactly when they did; `game` still evaluates before `demo` and `debugstart` (they import it), so the `load` listeners are registered in the same order. The three `gunicons` listeners (`hangar`, `shopui`, `game`) are
  registered in the same order too. `player` sets its hooks as it loads, as before; no file reads `Hooks.makeWeapon`, `myStickers`, `inField` or `biteDebris` while loading. Observed, not just read (below): the smoke cases, which depend on all of it,
  and the exercised screens.
- **`index.html` ends with one game tag.** After `modelbundles` (a classic, non-deferred script, first: it must start the model download before three.js is fetched) and PeerJS (`defer`, from the CDN) it has
  `<script type="module" src="dist/js/main.js">`. **`js/main.ts`** (new) imports `./threeboot.js` and then every file the tags loaded (85 of them), in the tags' order: side-effect imports, since the files register on `G`, and
  `residents` and `gunshot-synth` export nothing. `gunshot-synth` (an IIFE, it was a `type="module"` tag already) stays as it is. `modelbundles` is not in `main.ts`: the classic tag stays.
- **The page's evaluation order, before and after** (a one-off log appended to every compiled file, the page opened at `?play=warehouse&level=2` in headless Chromium, on the pre-change commit `18647c3` in a worktree and on this one; not kept):

  | | order the files ran in |
  | --- | --- |
  | before (the tags) | modelbundles threeboot util data parts scars damage leveldesc world shipgen furniture homes level materials spacedata sim stickers gear ballistics medical zip callsigns arsenal acoustics ambience gunaudio footsteps audio loadout furnspec residents furnmesh gunshot-synth handling lightgrid levelview gunmaterials render glare icons glb gunrig humandata humans vmanim viewmodel gunmodels headgear rig bolts loot casings highlights route shop recorder spaceserver server serverhost serverlink net views career gunsmith range course hangar zeroing shopui invui touch gamepad prep shipmodel spaceui space hud shotlog player menushow landing cloudconfig cloud game profiler demo debugstart |
  | after (`main.ts`) | modelbundles threeboot util data parts scars damage leveldesc world shipgen furniture homes level materials spacedata sim stickers gear ballistics medical zip callsigns arsenal acoustics ambience gunaudio footsteps audio gunmaterials glb gunrig humandata humans headgear furnspec furnmesh lightgrid levelview rig vmanim render viewmodel gunmodels icons bolts career cloudconfig cloud residents route shop recorder spaceserver server serverhost serverlink net handling loot casings gunsmith highlights hangar zeroing shopui invui touch gamepad landing prep shipmodel spaceui space player range course menushow game glare views shotlog hud loadout gunshot-synth profiler demo debugstart |

  The log of the page is the order `tools/deps.mjs` works out (the inventory's `orders` entry for `js/main.ts`: identical, and the before is the inventory's `index.html` entry of phase 4d), so the check and the page agree.
  **Why it differs:** a file runs when it is first imported, and the files now import `game` and `player` (they read them through `G` before). In the tags' order the first file that reaches `game` is `loadout` (it imports `hud` now, which imports `game`
  and `player`, which import almost everything), so at `loadout`'s place the whole graph under it runs, each file's imports in that file's own order (the codemod writes them alphabetically), and the files after it in `main.ts` find theirs
  done. What moved: `render`, `rig`, `vmanim`, `viewmodel`, `gunmodels`, `icons`, `bolts`, `career`, `cloud`, `net`, `highlights`, `hangar`, `player`, `views`, `hud` and the screens run in `game`'s depth-first order instead of the tags' (`glb`, `gunrig`, `humans`, `furnmesh`,
  `lightgrid`, `levelview` earlier than `render`, as before, but `rig` and `vmanim` now before `render` and `viewmodel`, `loadout` and `glare` late, `residents` after `cloud`), and `game` runs after `menushow`, `glare` after it. `profiler`, `demo` and `debugstart` still run last, in that order.
  **Why it is safe:** (1) everything a file reads while loading, of another file, runs before it: `deps:check` checks it against this order for the page, the three workers, `ambience.html`, the cloud test and the two tools that keep lists (0 problems); the one import the codemod made that
  broke it, `game` -> `profiler`, was caught and undone. (2) The only top-level effects that depend on order are listeners: `load` (`game`, then `debugstart`, then `demo`'s, as in the tags: both import `game`) and `gunicons` (`hangar`, `shopui`, `game`: as in the tags); they do not touch each other. (3) No file draws a random number while loading
  (no top-level `Math.random`), and none looks through `G` for what is registered (no `Object.keys(G)`), so the order files register in does not show. (4) `modelbundles` still runs first and `threeboot` second. Observed: 10/10 smoke cases, the exercised screens, the workers.
- **The export worker has an entry file.** `js/exportentry.ts` (new) imports the 37 files `EXPORT_SCRIPTS` named, in its order (`modelbundles` among them, as a module there, the same IIFE as before); `EXPORT_SCRIPTS` is gone, and
  `js/exportworker.ts` does `import('./threeboot.js').then(async () => { await import('./exportentry.js'); ...stand-ins... })`, as the server and prep workers do. It evaluates **the same 37 files in the same order** (the `orders` entry of
  `docs/modules-inventory.json` for `js/exportworker.ts`, before and after: the same list, plus `exportentry` itself at the end). The stand-ins stay effective: `G.Game`, `G.Net`, `Hooks.inField` and `Hooks.biteDebris`, and the files' `G.Game`
  / `G.Net` reads are untouched. None of the 37 imports `game` or `net` (`deps` would show it in the order).
- **Tools.** `tools/deps.mjs` reads the page's roots from `js/main.ts` (its side-effect imports, plus index.html's classic script) and the export worker's from `exportworker.ts`'s `import()`s, as for the server and prep workers; it also
  checks `ambience.html` (its inline module's imports) and `tools/cloud.test.mjs` (its `SRC`) as loaders now, so the two non-page consumers of page files are held to their load-time needs. `tools/codemod_imports.mjs` takes the order from
  `main.ts` and `exportentry.ts`. `tools/bake_hangar.mjs` took the page's file order from `index.html`'s tags; it takes it from `main.ts`'s imports (the hangar bake rewrote `assets/models` with no byte changed: `test:models`' hangar golden is
  green with the same hash). `tools/level_env.mjs` lists `prepentry` only (its two other names, `scars` and `stickers`, were reached by it already: the inventory's `orders` for the tool is the prep worker's, file for file; `test:level` 31/31).
  `tools/model_env.mjs` keeps its lists: they are not what a page loads but staged subsets with stand-ins between the stages (`G.R` stubbed, `G.GunRecipes`, the authored parts, `G.GunModels = G.GunRecipes`, `G.GLB`), and no file reaches that
  set by its imports; an entry for them would be a file only the tool uses. `tools/check_hangar_golden.mjs`, `bake_hangar.mjs`, `tools/check_furniture_golden.mjs`, `ship_layout.mjs` keep their lists of roots for the same reason.
- **`npm run deps` lists what is left** (section 2b of the inventory, and one line in the summary: 297 cross-file reads through `G` in 71 pairs), each in the first category that fits. Phase 5's "Done when: no file reads another through `G`" is not
  reached literally; what is left is deliberate, and phase 7 has to remove it (the tools and `ambience.html` first, the proposals are under each):
  1. **The export worker (162 reads, 30 pairs): `highlights` (`game` 47, `player` 14, `audio` 10, `views` 7, `net` 4, `hud`, `zip`, `hangar`, `shop`, `icons`, `gunaudio`), `render` (`game`, `shotlog`, `player`, `audio`, `range`, `views`, `casings`, `loot`, `hud`, `bolts`), `rig`
     (`game`, `footsteps`, `views`), `vmanim` (`game`, `icons`, `player`, `bolts`, `casings`), `levelview` (`hangar`).** The replay is drawn by the game's own renderer, which asks the page's objects what it may; the worker does not load them (and sets
     `G.Game`, `G.Net` as stand-ins). Phase 7: a small module, `replayenv.ts` (what the renderer asks of the page: the map, the phase, `me`, a `shotlog`, an `audio` that is silent ...), with the page's files setting it and the worker setting its stand-in through a
     setter (as `Hooks` does for the simulation), so the 37 files import that and nothing else. Or the narrower route: `highlights` is two things (recording, which the page does, and the exporter, which the worker does): split it, and the exporter imports only what it uses.
  2. **`ambience.html` (51 reads, 13 pairs): `audio` (`render` 16, `game` 6, `casings`), `acoustics` (`game`, `space`), `ambience` (`space`, `player`), `footsteps` (`game`, `render`, `player`, `casings`), `gunaudio` (`render`, `game`).** The page loads `audio` and `ambience`
     as modules and nothing of the game's state. Phase 7: the same seam as above in the other direction, an `audioenv.ts` with the few things sound asks of the game (the camera, the map, the phase, whether you are aboard, `me`'s place), set by `game`/`render`, left empty by
     `ambience.html`; these reads are all guarded already.
  3. **The cloud test (25 reads, 10 pairs): `career` (`net`, `game`, `data`'s `THEMES`, `route`), `cloud` (`net`, `game`, `callsigns`, `arsenal`, `shop`, `player`).** `tools/cloud.test.mjs` loads four files and puts the rest at `G.X`. Phase 7: `tools/vm_game.mjs`'s linker answers an
     import with a module the tool gives it (its `ctx` today answers only `three`): the test names `./net.js`, `./route.js`... as stubs, and the files import them. The same takes `G.Range` and a hook out of `tools/level_env.mjs`, and `tools/check_furniture_golden.mjs`'s hook (those are `G.X =` writes now, which no `G` read in the game needs once the stubs are imports).
  4. **`modelbundles` (15 reads: `game` 8, `glb` 6, `audio` 1).** A classic script by design (it starts the download before three.js is fetched, and a module would wait for the parse). Phase 6/7: index.html starts the fetch in a three-line inline script that
     leaves the promise on `window`, and `modelbundles.ts` becomes a module `main.ts` imports and that takes the promise over; then `Bundles` and `AudioBundle` are imports.
  5. **The workers' own files (10 reads): `exportworker` (`Hooks`, `Highlights`, `Models`, `Stickers`), `prepworker` (`LightGrid`, `Level`), `serverworker` (`ServerHost`).** They read what their entry file registered, after the dynamic `import()`. Phase 7: `const { Highlights } = await import('./exportentry.js')`
     with the entry re-exporting what the worker uses (the namespace of a dynamic import is the module's exports), so no `G` is needed.
  6. **Simulation to simulation (9 reads): `data` reads `G.Gunsmith`** (`parts` reads `data` while loading, so `data` cannot import it: phase 4c). Phase 7: move the five functions (`shotSoundKey`, `chambered`, `revolver`, `fblock`, `boltHold`) that look at the gun's build into `parts`, or register them from
     `parts` on a hook, so `data` is a leaf.
  7. **Other (25 reads, 7 pairs), each a cycle at load or a tool:** `career` reads `Cloud` (8; `cloud` imports `career` and reads it while loading, so `career` cannot import `cloud` first; phase 7: `career` emits an event that `cloud` listens to, or `cloud` passes itself in), `game` reads `Prof` (6, above:
     `profiler` wraps `game` as it loads; phase 7: `profiler.install()` called from `main.ts`, so nothing wraps at load), `gunrig` reads `GunModels` (3: the model tools put the recipes there; the linker stubs of 3 cover it), `render` reads `Rig`, `Highlights`,
     `GunModels`, `Viewmodel` (8: `viewmodel` reads `R.TONE` while loading, and `rig`/`highlights`/`gunmodels` reach `viewmodel`; phase 7: move `TONE` and the few constants read at load to a leaf both import, then `render` imports them).
- **Stand-ins re-checked, none bypassed:** `exportworker`'s four (above); `tools/cloud.test.mjs` (21/21: `career` and `cloud` still read `G.Net`, `G.Game`, ...); `tools/level_env.mjs` (`G.Range`, the hook: nothing it loads imports `range`; 31/31); `tools/check_furniture_golden.mjs`'s hook;
  `tools/model_env.mjs` (`G.GLB`, `G.GunModels`, `G.R`: `gunrig`, `glb` untouched). `ambience.html` loads `audio` and `ambience` as before: neither imports `game`, `player`, `render`, `space` or `casings` (`deps` checks it now).
- **Exercised beyond the smoke cases** (one-off scripts from earlier parts, re-run): `exercise_d` on `?hangar` (every shop tab, the field inventory, the range and the IPSC course), `?fly`, `?board`, `?assault`, `?play` and `?play ... serverthread=0`; the highlights check (menu showcase live, a level, a
  recording, `take`/`mount`, `renderPack`: the export worker booted and rendered to 8% when its 240 s limit ended, as in part c); the ambience page (`InvalidAccessError` from `A.master.connect` in a headless page, the same as on the pre-change commit, nothing new). The `?hangar` run throws
  `WrongDocumentError ... pointer lock` from the script's own `toggleInv` in a headless page, identically on `18647c3` (a worktree, compiled, assets linked). One thing that looks different and is not: the exercise's "range on" after 2.5 s was `true` or `false` from run to run on both commits (a frame that takes seconds in
  software GL decides whether `Range.update` has seen the new position yet), so it is a timing of the headless page, not a change.
- **Checks:** typecheck, `deps:check` (eight orders consistent, 0 simulation uses of the page), `test:level` 31/31, `test:sim` 4/4 (golden untouched), `test:cloud` 21/21, `test:models` all green (the bake and the hangar golden included), smoke 10/10 (one case per process); on the page `G.ServerLink.mode === 'worker'` with
  17 hooks, `main` with `serverthread=0`; the prep worker built a level and its light grid; the export worker booted.
- **Not reproduced exactly:** the page's evaluation order (above), nothing else. No behaviour change found. Found on the way and left alone: nothing.
- **Next:** phase 6 (bundling), then phase 7 (the proposals above).

### 5. Convert the page side

Same steps, in this order: data-like files (`icons`, `callsigns`, `career`, `loadout`), then audio, then models and
rigs, then views and rendering, then `player`, `game`, `space`, and the screens (`hangar`, `shop`, `gunsmith`,
`invui`). `index.html` ends with one script tag.

Done when: no file reads another through `G`. (Reached as far as the stand-ins, the export worker, `ambience.html` and the classic `modelbundles` allow: the rest is listed in the phase 5 results (part e) and by `npm run deps`, and is phase 7's.)

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
