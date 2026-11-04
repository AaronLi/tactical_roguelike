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

- `G` (the `GameNamespace` interface), `THREE` and `Peer` (both from the CDN, untyped for now);
- browser extras the standard library doesn't know (`webkitAudioContext`, `performance.memory`).

A file can type what it puts on `G` by extending the interface (interfaces merge across scripts):

```ts
interface GameNamespace { U: typeof U; }
```

Until a module is described there, `G.Anything` is `any` (the interface's index signature), so typing can
proceed one module at a time without breaking the rest.

Adding a file: create `js/<name>.ts`, add `<script src="dist/js/<name>.js">` to `index.html` in the right order,
and to `js/exportworker.ts`'s list if the highlights' replay needs it.

## Status

The `tsconfig.json` has `strict` off for now: the checks still catch calls with the wrong number of arguments,
misspelt properties, wrong types where they're known, and names that don't exist (the first pass found a
`ReferenceError` waiting in the minimap's drawing, never called; the minimap's gone now).

**Checked:** all 53 files, with no `@ts-nocheck`, `@ts-ignore` or `@ts-expect-error` left. Getting there was
type-only: every file's compiled JavaScript was compared with what it compiled to before and came out the same (two
exceptions, on purpose: the snapshot key below, and `SCAR_SPEC()` losing an argument it never took). Most of the work
was of two kinds:

- **A property added to an object after it's made** (TS2339): the object typed where it's made (an interface, a
  `Record<...>` for a dictionary, or `: any` for a grab-bag).
- **A call that leaves off trailing arguments** (TS2554): the parameter marked optional (`col?`) where it's defined.

It found two real bugs: a `ReferenceError` waiting in the minimap's drawing (never called; the minimap's gone now), and the snapshot each
officer sends the host carrying `sd` twice (the helicopter seat, then steadying, which won): the seat is `se` now.

**Next: strict mode.** `npm run typecheck:strict` counts 8,355 errors, three quarters of them parameters with no type
yet (TS7006), then values that may be null (TS18047). Types for `G`'s modules (`GameNamespace`, one module at a time)
and three.js's (`@types/three` for r149) would cut the most.

## The Rust port

The Bevy rewrite (branch `bevy-rewrite`) reads the game's source directly: `src/game/jsrun.rs` includes
`js/<name>.js` with `include_str!`, and `tools/jsenv.js` loads `js/<name>.js` into node for the parity tests. When it
next takes in this branch, those paths need to point at the compiled `dist/js/<name>.js` (after `npm run build`).
