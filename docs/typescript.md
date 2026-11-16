# TypeScript

The game is TypeScript: `js/*.ts`, compiled one-to-one to `dist/js/*.js` by `tsc` and loaded by `index.html` as ONE module,
`js/main.ts`, which imports every file of the page (and `js/modelbundles.ts`, the one classic script, first). The files import each other and also
register themselves on `G` for the console and the browser checks (docs/modules-plan.md). Three
workers load some of the same compiled files, as module workers: the host's simulation (`js/serverworker.ts`, the server's own thread: [threads.md](threads.md)) and the
level-preparation worker (`js/prepworker.ts`) and the highlights' export worker (`js/exportworker.ts`).

| Command | What it does |
| --- | --- |
| `npm run dev` | Compiles, keeps compiling as you save (`tsc --watch`), and serves the game on :8080 (`tools/dev.js`). |
| `npm run build` | Everything a fresh clone needs (`tools/build.mjs`): compiles into `dist/`, bakes the stickers and the audio, bakes and bundles the models (a minute or two; `-- --no-models` leaves them out). All git-ignored. Needs node and nothing else: no Blender, no browser. |
| `npm run compile` | Compiles once into `dist/` and nothing else. |
| `npm run bundle` | Compiles, then bundles the game for release into `dist/bundle/` (`tools/bundle.mjs`: esbuild, minified). Development never uses it; see below. |
| `npm run typecheck` | Checks the types without writing anything. CI runs it. |
| `npm run typecheck:strict` | The same with `--strict`: how far the code is from full strictness. |

Type errors never stop the build: the game runs on whatever compiled. The CI (`.github/workflows/pages.yml`)
fails a push only if `npm run typecheck` fails, then publishes the site with `dist/` to GitHub Pages
(Settings → Pages → Source: **GitHub Actions**).

## Development and release load the game differently

- **Development** (`npm run dev`, or `node serve.js` after a build) is unbundled: `index.html` loads `dist/js/main.js`, a native module that imports the ~90
  files `tsc` wrote, and the workers import theirs the same way. Editing needs no step beyond `tsc --watch`.
- **The release** (the published site) loads five files in place of those: `tools/bundle.mjs` runs esbuild over the compiled `dist/js` and writes `main.js`
  (the page), `serverworker.js`, `prepworker.js`, `exportworker.js` (one self-contained bundle each) and `modelbundles.js` (the classic script, on its own),
  minified, with source maps that point back to `js/*.ts`. They have the names of the unbundled files, so the workflow just lays them over those five files of `dist/js` in the
  published copy (the rest of the compiled files stay there, for `ambience.html`, a page of its own that imports `audio.js` and `ambience.js`; the game loads none of them) (`node tools/bundle.mjs --site _site`) and `index.html` and the workers' URLs are the same in both. three.js stays on the CDN (the bundles import it from
  jsDelivr as `js/threeboot.ts` does), nothing is tree-shaken (files register on `G` as they load) and there is no code splitting: each bundle runs the modules in the order the
  unbundled build does (the page's and the workers' `Object.keys(G)` are identical), and each worker's file sets `window` and `document` before its game code runs.
- **To try the release locally:** `npm run bundle`, then make a copy of the site's folder with the five files replaced (`node tools/bundle.mjs --site <dir>` does it in a copy
  you made of the repo's files; symlinks to everything but `dist/` will do), serve it with `SITE_ROOT=<dir> node serve.js`, and run the smoke check against it with
  `node tools/smoke.mjs --site <dir>`.
- A new file needs nothing for the release: it is bundled because an entry file imports it.

## How the code fits together

The files are **scripts, not modules**: no `import`/`export` (`"moduleDetection": "legacy"` in `tsconfig.json`).
Everything a file makes for the others goes on one global object, `G` (`G.U`, `G.Level`, `G.Server`...), exactly as
before. `js/types/globals.d.ts` declares what all of them share:

- `G` (the `GameNamespace` interface) and `Peer` (PeerJS, from the CDN, untyped);
- browser extras the standard library doesn't know (`webkitAudioContext`, `performance.memory`).

`THREE` (value and types) comes from `@types/three` 0.186.0, for the game's three r186.1, as the global `THREE`
namespace (`js/types/three-global.d.ts`: the types no longer declare it themselves). On the page it's put there by the
one module, `js/threeboot.ts` (three's ES module build and its glTF loader, from jsDelivr, pinned), which runs before
the game's scripts: they're all `type="module"` (deferred), and module scripts run in the order they're written. (`dist/js/modelbundles.js` stays a classic script ahead of them, so the model download starts first.)

Each file declares what it puts on `G` (interfaces merge across scripts):

```ts
const G_Level = { ... };
G.Level = G_Level;
interface GameModules { Level: typeof G_Level; }
```

`GameNamespace extends GameModules` and has no index signature, so a module name nobody declares (a typo) is an
error, and every call from one file into another is checked against the callee's real signature. Fields a module
gains at runtime go in a `NameFields` interface next to it (`typeof G_Me & MeFields`).

Adding a file: create `js/<name>.ts`, import it from `js/main.ts` in the right place (a file that reads another while it loads comes after it: `npm run deps:check`),
import it also (if the host's simulation needs it: from `js/serverhost.ts`, the server thread's entry file, and from `js/prepentry.ts` if the level's preparation needs it, and add its name to `SIMULATION` in
`tools/deps.mjs`; nothing that draws there, what both sides reckon goes in `js/sim.ts`), and from `js/exportentry.ts`, the export worker's entry file, if the highlights' replay needs it.

## Status

`tsconfig.json` has `strict` off but turns on its parts one by one. On: `strictNullChecks`, `noImplicitAny`,
`noImplicitThis`, `strictFunctionTypes`, `strictBindCallApply`, `useUnknownInCatchVariables`, `alwaysStrict`, plus
`noImplicitReturns` and `noUnusedLocals`. Off: `noFallthroughCasesInSwitch`.

**Shapes are declared.** A module's fields live in its literal from the start, even those only set later
(`hp: undefined as unknown as number`, `_cache: undefined as Foo | undefined`), so `this` is fully typed. Don't add a
field with `this.foo = ...` without declaring it there. Records passed around (enemies, items, clips, rounds, parts,
rigs...) have interfaces, and string kinds are unions (`ItemKind`, `FireMode`, `NetMsgKind`, `GmMsgKind`,
`EnemyState`, `RoomType`, `MatKey`...): a misspelt kind is a type error. Every script's top-level types are global,
so new type names are specific (prefixed by module: `Hl...`, `Lv...`, `Gm...`).

Every file passes, with no `@ts-nocheck`, `@ts-ignore` or `@ts-expect-error`. Getting there was type-only: each
step's compiled JavaScript was compared with the step before and came out the same (exceptions, on purpose: the
snapshot key below, `SCAR_SPEC()` losing an argument it never took, and the `const G_Name` binding each module now
has). Where strictNullChecks found a value that really can be null, the code keeps its behaviour (`x!`) and the spot
is listed as a suspected bug to look at, not fixed silently.

Real bugs found so far: a `ReferenceError` waiting in the minimap's drawing (never called; the minimap's gone now),
and the snapshot each officer sends the host carrying `sd` twice (the helicopter seat, then steadying, which won):
the seat is `se` now.

**Left:** `G.WEAPONS`/`GUN_SPECS` are still `Record<string, any>` (readers do `(G.WEAPONS[x] || {}).field`); items
aren't a union per kind yet; `npm run typecheck:strict` (full `--strict`) shows what remains.

## The Rust port

The Bevy rewrite (branch `bevy-rewrite`) reads the game's source directly: `src/game/jsrun.rs` includes
`js/<name>.js` with `include_str!`, and `tools/jsenv.js` loads `js/<name>.js` into node for the parity tests. When it
next takes in this branch, those paths need to point at the compiled `dist/js/<name>.js` (after `npm run build`).
