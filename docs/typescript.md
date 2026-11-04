# TypeScript

The game is TypeScript: `js/*.ts`, compiled one-to-one to `dist/js/*.js` by `tsc` and loaded by `index.html` with
plain `<script>` tags, in order, as the JavaScript was. The highlights' export worker (`js/exportworker.ts`) loads the
same compiled files with `importScripts`.

| Command | What it does |
| --- | --- |
| `npm run dev` | Compiles, keeps compiling as you save (`tsc --watch`), and serves the game on :8080 (`tools/dev.js`). |
| `npm run build` | Compiles once into `dist/` (git-ignored). |
| `npm run typecheck` | Checks the types without writing anything. CI runs it. |
| `npm run typecheck:strict` | The same with `--strict`: how far the code is from full strictness. |

Type errors never stop the build: the game runs on whatever compiled. The CI (`.github/workflows/pages.yml`)
fails a push only if `npm run typecheck` fails, then publishes the site with `dist/` to GitHub Pages
(Settings → Pages → Source: **GitHub Actions**).

## How the code fits together

The files are **scripts, not modules**: no `import`/`export` (`"moduleDetection": "legacy"` in `tsconfig.json`).
Everything a file makes for the others goes on one global object, `G` (`G.U`, `G.Level`, `G.Server`...), exactly as
before. `js/types/globals.d.ts` declares what all of them share:

- `G` (the `GameNamespace` interface) and `Peer` (PeerJS, from the CDN, untyped);
- browser extras the standard library doesn't know (`webkitAudioContext`, `performance.memory`).

`THREE` (value and types) comes from `@types/three` 0.149.0, the game's r149, as the global `THREE` namespace;
`js/types/three-extra.d.ts` adds the two colour-space constants those types leave out.

Each file declares what it puts on `G` (interfaces merge across scripts):

```ts
const G_Level = { ... };
G.Level = G_Level;
interface GameModules { Level: typeof G_Level; }
```

`GameNamespace extends GameModules` and has no index signature, so a module name nobody declares (a typo) is an
error, and every call from one file into another is checked against the callee's real signature. Fields a module
gains at runtime go in a `NameFields` interface next to it (`typeof G_Me & MeFields`).

Adding a file: create `js/<name>.ts`, add `<script src="dist/js/<name>.js">` to `index.html` in the right order,
and to `js/exportworker.ts`'s list if the highlights' replay needs it.

## Status

`tsconfig.json` has `strict` off but turns on its parts one by one. On: `strictNullChecks`, `noImplicitAny`,
`strictFunctionTypes`, `strictBindCallApply`, `useUnknownInCatchVariables`, `alwaysStrict`, plus `noImplicitReturns`
and `noUnusedLocals`. Off: `noImplicitThis` (the module literals' `this` lacks the fields added at runtime) and
`noFallthroughCasesInSwitch`.

All 53 files pass, with no `@ts-nocheck`, `@ts-ignore` or `@ts-expect-error`. Getting there was type-only: each
step's compiled JavaScript was compared with the step before and came out the same (exceptions, on purpose: the
snapshot key below, `SCAR_SPEC()` losing an argument it never took, and the `const G_Name` binding each module now
has). Where strictNullChecks found a value that really can be null, the code keeps its behaviour (`x!`) and the spot
is listed as a suspected bug to look at, not fixed silently.

Real bugs found so far: a `ReferenceError` waiting in the minimap's drawing (never called; the minimap's gone now),
and the snapshot each officer sends the host carrying `sd` twice (the helicopter seat, then steadying, which won):
the seat is `se` now.

**Left:** `noImplicitThis`; the weapon/part tables (`G.WEAPONS`, `GUN_SPECS`, `PARTS`, `PLATFORMS`) are still
`Record<string, any>`; `npm run typecheck:strict` (full `--strict`) shows what remains.

## The Rust port

The Bevy rewrite (branch `bevy-rewrite`) reads the game's source directly: `src/game/jsrun.rs` includes
`js/<name>.js` with `include_str!`, and `tools/jsenv.js` loads `js/<name>.js` into node for the parity tests. When it
next takes in this branch, those paths need to point at the compiled `dist/js/<name>.js` (after `npm run build`).
