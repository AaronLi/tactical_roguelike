# Plan: from the global `G` to ES modules

Status: phases 0, 1, 2, 3 and 4 done (phase 3: 2026-11-16; phase 4: part a, the node tools, the codemod, the first 11 leaves; part b, 14 more files; part c, `server`, `spaceserver`, `serverhost`, `furnmesh`, `lightgrid`, and the workers' lists deleted: all 2026-11-16); phase 5 under way (part a: `zip`, `icons`, `cloudconfig`, `career`, `cloud`, `loadout`, and the audio files, 2026-11-16); 6 and 7 not started. Written 2026-11-15.

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
