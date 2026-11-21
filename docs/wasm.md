# WebAssembly

Two pieces of the game's work have a second implementation in Rust, compiled to WebAssembly, each with its JavaScript kept as the
fallback and the reference, each built the same way (`tools/build_wasm.mjs`, below) and loaded the same way (a leaf module the page
starts, `js/main.ts`; nothing waits for it):

- **The acoustic ray tracer** (`wasm/acoustics`, `js/acousticswasm.ts`): this page's first part.
- **A gun's ambient occlusion** (`wasm/gunao`, `js/gunaowasm.ts`): [the second part](#a-guns-ambient-occlusion).

# The acoustic ray tracer in WebAssembly

The hot loop of the room-measuring ray tracer (`rays(n)` of `tracer()` in `js/acoustics.ts`, what [acoustics.md](acoustics.md)
calls a measured room) has a second implementation in Rust, compiled to WebAssembly. The JavaScript loop stays: it is the
fallback and the reference. The game's behaviour doesn't change except in the tracer's own randomness (500 random rays a room).

## The pieces

| File | What |
| --- | --- |
| `wasm/acoustics/` | The crate: `rust-toolchain.toml` (the compiler, pinned, with the `wasm32-unknown-unknown` target), `Cargo.toml` (no dependencies; release profile `opt-level=3`, `lto`, `panic=abort`, `codegen-units=1`) and `src/lib.rs`, the loop line for line, with its own RNG. Plain `#[no_mangle] extern "C"` exports over linear memory (no wasm-bindgen). |
| `assets/wasm/acoustics.wasm` | The built module: a build output, **not kept in the repo** (`.gitignore`). `npm run build` makes it, and so does CI, which installs the pinned Rust (`.github/workflows/pages.yml`); the site publishes it with the rest of `assets/`. |
| `js/acousticswasm.ts` | A leaf module: fetches and instantiates the module, copies a floor into its memory (a scene), makes traces of it. Also `makeRng(seed)`, the RNG. |
| `js/acoustics.ts` | Flattens a floor (`sceneOf`), and `tracer()` uses WebAssembly when it is ready, the JS loop otherwise. `finish()` (the histograms into an `AcTrace`) is TypeScript for both. |
| `tools/build_wasm.mjs` | `npm run build:wasm`: `cargo build --release --target wasm32-unknown-unknown` in each crate (`wasm/acoustics`, `wasm/gunao`), then the copy to `assets/wasm/<crate>.wasm`. A step of `npm run build`. Without Rust it's skipped with a warning (the game uses the JavaScript fallbacks), except on CI (`CI` set), where it fails. |
| `tools/acoustics_wasm.test.mjs` | `npm run test:acoustics` (in CI, next to `test:models`): builds the module first, then the comparison. |

Needs Rust ([rustup](https://rustup.rs)); `rustup toolchain install` in `wasm/acoustics` installs the pinned compiler and its target (`wasm/gunao` pins the same, so CI's one install covers both). Without it the game still runs, on the JavaScript tracer.

## How it runs

- **Scene** (per map and floor, kept in a `WeakMap` on the zone data): the tiles' drop and window flags, each tile's zone and
  door index, the zone table (`out`, `height`, `ac`, `af`, `acL`, `afL`, `aw`, `awL`, and the per-metre losses `loss`, `lossL`
  that the JS tracer used to work out at each trace), and the room for the doors' state. Copied once. A floor whose door count
  changes is flattened again.
- **Trace** (per measurement): the start point and zone, the catching sphere's R², the outdoor wall's absorption, the seed. `rays(n)`
  sends the next *n* rays, so `dueStep` and `prewarm` spread the work across frames as before. Before each call the doors'
  state (`open || fallen || gone`) is written into the scene (a few bytes), so a door that moves mid-measurement is read as in JS.
  When the last ray has gone the two histograms and the early arrivals are copied back into the same arrays the JS loop fills,
  and the one `finish()` makes the `AcTrace`.
- **Loading**: `js/main.ts` calls `AcWasm.start()`, which fetches `new URL('../../assets/wasm/acoustics.wasm', import.meta.url)`:
  from `dist/js/` unbundled and from the release bundle (`dist/js/main.js`) alike, the game's folder is two levels up. Nothing waits for it.
- **Fallback to the JS loop**: before the module has loaded; in the node tools (nothing calls `start()`, so every tool and test
  that runs the game in a vm stays on the JS tracer); on `ambience.html` and in the workers (same: no `start()`); if the fetch or
  the instantiation fails (a console warning, once); if the module traps while tracing (it is given up, and that measurement
  starts again in JS); and when forced: `?acjs` on the page's URL, or `G.Acoustics.wasm.off = true` in the console.

## Random numbers and the equivalence test

The game's tracer uses `Math.random`; the module seeds **mulberry32** per trace from it. For tests `tracer(..., opt)` takes
`{ rng, seed, js, raw }`: the JS loop then draws from `rng` (`makeRng(seed)` from `js/acousticswasm.ts`, the same function as in
Rust, one 32-bit draw over 2^32, drawn in the same order), the module from `seed`, `js: true` keeps the JS loop, and `raw` gets the
unnormalised Float64 histograms. The default is `Math.random`, so the game is unchanged.

`tools/acoustics_wasm.test.mjs` generates levels (warehouses, an apartment block and the suburbs with several floors, the foundry,
the bunker, the research lab, the Sandia Crest and the festival, which are outdoors), takes up to eight rooms and a few outdoor 8 m cells of each,
and makes each trace in the JS tracer (in the vm, `tools/vm_game.mjs`) and in the module (Node's `WebAssembly`) from the same
seed, with every door shut and then every door open (the scene is reused; only the doors are sent again), the module's rays sent in pieces of
500, 60, 37 or 1. Histograms, early arrivals, `wet`, `rt60`, `rt60L` and `mfp` must agree to 1e-9 relative. The differences
are the last bits of `exp`, `sin` and `cos` (different libms), nothing in which tile a ray goes through.

## Speed

Per full trace (500 rays, `finish()` included, and for the module the copying of the doors' state; the flattened floor is kept, so
that cost comes once per map and floor, a few ms), headless Chromium, the level as the game builds it (`?play=warehouse&level=4&nofoes&mute`,
`?play=suburbs&level=2&nofoes&mute`), median of 25 after warming up:

| Room | JS | WASM |
| --- | --- | --- |
| Warehouse L4, 3484 tiles | 24.9 ms | 12.3 ms |
| Warehouse L4, 260 / 208 / 169 tiles | 15.3 / 19.1 / 14.1 ms | 8.1 / 10.0 / 7.3 ms |
| Warehouse L4, outdoor 8 m cell | 3.5 ms | 1.8 ms |
| Suburbs L2, 400 / 398 / 160 / 126 tiles | 11.0 / 16.1 / 6.0 / 16.4 ms | 5.6 / 8.5 / 3.4 / 9.4 ms |
| Suburbs L2, outdoor 8 m cell | 3.1 ms | 1.7 ms |

About 1.7 to 2.0 times faster in the browser, the same in the release bundle. Not a large factor: V8's JIT does this scalar float loop well
(about 40 % of the loop is `exp`, `sin`, `cos` and `sqrt`), and it is no tuned port (the rays make the same draws and the same arithmetic as the JS
ones, which the equivalence test needs). The difference is in the frame budget: a measurement of a big room that took 25 ms takes 12.

In node the numbers aren't a browser's: the tools run the game in a `vm` context, where the JS loop is far slower (`Math` is looked up on the context's
global) than in a page, 100 to 240 ms a room against the module's 7 to 14 ms; the browser's are the ones to go by.

## Memory

The module's copy of a scene is freed (by a `FinalizationRegistry`) once nothing holds the scene's JS object, a trace's own the same. A trace must really
read the scene object (`sc.sp`, `sc.doorsPtr`): a bare mention is dropped by the release bundle's minifier, and the scene was then freed under a running trace (the module
panicked in the bundled site, not in development). The first version had exactly that.

# A gun's ambient occlusion

`GunAo.apply` (`js/gunao.ts`, whose header has the algorithm) gives every opaque mesh of an assembled gun its per-vertex occlusion
(`aOcc`), and for a gun's full-detail build (`GunAo.GUN`, adaptive) refines the mesh first: triangles split where the occlusion doesn't
follow their corners, then welded. Drawing a gun not drawn before was one frame of 66-190 ms in the hangar, nearly all of it this,
on the first-person model. Two things take it out of that frame: the numeric core in WebAssembly, and the first-person gun worked out
across frames.

## The pieces

| File | What |
| --- | --- |
| `wasm/gunao/` | The crate: `rust-toolchain.toml` (the same pin as `wasm/acoustics`), `Cargo.toml` (no dependencies; the same release profile), `src/lib.rs`: `mark`, `shut`, the trace loop and `refine`'s triangle loop and weld, line for line. Plain `extern "C"` exports over linear memory. |
| `assets/wasm/gunao.wasm` | The built module (about 53 KB): a build output, not kept in the repo, as `acoustics.wasm`. |
| `js/gunaowasm.ts` | A leaf module (`AoWasm`): fetches and instantiates the module; grids in its memory (`grid`, `gridClone`, `gridFree`), `mark`, `tracer` (a mesh's vertices traced a piece at a time) and `refine` (a job: `run(n)` triangles at a time, `end()` the weld and the result). `?aojs` or `G.GunAo.wasm.off = true` keeps the JavaScript. |
| `js/gunao.ts` | Uses the module when it is ready, for every path: the adaptive refine (`refineAllG`), the far levels' plain trace (`compute`, `GUN_FAR`) and the ship's layered one (`layeredWG`, `SHIP`). `GUN_ASYNC` and `refineNow`: the refine spread over frames. |
| `tools/gunao_wasm_check.mjs` | `npm run check:gunao` (a page served by `node serve.js`; the steps file of `tools/space_shot.mjs`): both paths on the same builds, compared. |

## Same numbers, bit for bit

The module does the JavaScript's arithmetic in the JavaScript's order, in f64, and keeps a vertex as f32 where the JavaScript keeps it in a
`Float32Array` (a midpoint, a lerp, a normalised normal and a stored occlusion are rounded to f32 where the JS stores them). Two of
JavaScript's `Math` functions are done as V8 does them, since a last bit can move a ray's step across a cell's edge and so change a split:
`Math.hypot` (the largest magnitude taken out, the squares summed with Kahan's compensation, not a plain root of the sum) and `Math.round`
(halves up, for the weld's keys). The rays' directions are made in JavaScript (`dirsOf`) and copied in, so no `sin`/`cos` of the module's
own enters. `Math.floor`, `ceil`, `sqrt` and the four operations are IEEE in both.

One thing the module does that the JavaScript doesn't: `refine` remembers each vertex's occlusion within a mesh, keyed by the f32 bits of
its position and normal (the only inputs), so a corner shared by several triangles, or the middle of an edge both its triangles split, is
traced once (an M4: 136 000 occlusions asked for, 76 000 traced). It changes nothing in the result.

`tools/gunao_wasm_check.mjs` assembles the same build twice and occludes it with the module off and on (the M4, SCAR, M249, AK, Barrett,
M1911, USP, Desert Eagle, MP5, AUG): `GUN` (refined), `GUN_FAR` (a far level, nothing split) and `GUN_ASYNC` both ways against `GUN` in
JavaScript, the gun moved and turned every few ms while it's worked out; then the ship (the baked Kestrel, `SHIP`, layered: `aOcc`,
`aOccD`, `aOccI`). Every mesh's vertex count, index and attributes are compared. The largest difference is 0 on all of them.

## The gun in the hands: across frames

WebAssembly alone takes an M4 from 148 ms to 60, not under a frame's budget. So `js/gunmodels.ts viewmodel` asks with `GunAo.GUN_ASYNC`
(`GUN` with `async`): when the build's refined meshes aren't kept (`refCache`, the last 6 builds), `refineNow` makes the work a generator
with places to stop (each mesh's marking; every 256 triangles of the module's refine; a mesh at a time in JavaScript) and runs about 6 ms of
it at a time between frames (`setTimeout`, as the ship's occlusion does). The gun is drawn at once, without its darkening (a mesh with no
`aOcc` reads 0: `js/lightgrid.ts`), and takes it when the work is done (an M4: 6-8 frames, about 110 ms), the same numbers as at once:

- the meshes' world positions and their world and normal matrices are taken when it's asked (`collect`, kept in each `M`), not read
  again as the drawn gun moves;
- the geometries it began with are kept, and a mesh whose geometry has changed by the time it's done is left alone;
- another ask for the same build while it's under way waits for it (a second `GUN_ASYNC`, akimbo's other gun) or has it finished there
  and then (any other: the gunsmith's, the hangar's), so nothing works it out twice and nothing sees half of it;
- if the module traps on the way, it's given up (a console warning) and the work starts again in JavaScript from the same snapshot.

`GunAo.busy` is how many builds are under way. The other callers (the gunsmith's and hangar's `display`, the third-person `world` and its
far levels, the ship) stay as they were, at once, only faster.

## Speed

Headless Chrome (`--gpu`), `?mute&hangar`, `GunAo.apply` on a fresh assembly (no cache):

| Build | JS | WASM | of which (WASM) |
| --- | --- | --- | --- |
| M4, `GUN` (21 000 -> 24 102 vertices) | 148 ms | 60 ms | grid + marking 8, refine 48, the rest (attributes in, geometry out) 4 |
| SCAR, `GUN` | 150 ms | 61 ms | |
| AK, `GUN` | 114 ms | 47 ms | |
| M249, `GUN` | 57 ms | 25 ms | |
| Barrett, `GUN` | 55 ms | 24 ms | |
| M1911, `GUN` | 21 ms | 10 ms | |
| M4, `GUN_FAR` (level 2) | 12 ms | 8 ms | |
| Kestrel, `SHIP` layered, at once | 168 ms | 111 ms | |
| Atlas / Wraith (recipe), `SHIP` across frames, till done | 228 / 162 ms | 163 / 120 ms | worst frame the same |

The JavaScript's own split for the M4 (148 ms): collecting the meshes 1, the grid 0.1, marking 11, refine 128 of which the weld 15; the
rest of refine is the rays (`shut`, 136 000 calls). Drawing a newly bought gun in the hangar (Digit1, the worst frame in the 2.5 s after):

| | M4 | SCAR | M249 |
| --- | --- | --- | --- |
| before | 184 ms (`apply` 163) | 192 ms (175) | 80 ms (66) |
| after | 37-40 ms (`apply` 1-2) | 15 ms (1-2) | 17 ms (0-1) |

The M4's remaining 37-40 ms is the first gun drawn in the session, whichever it is, with no occlusion work at all (the same frame with the
build's refine already cached: 34 ms): something else's first time, not this.

A coarse empty-space skip in the rays (blocks of 4 and 8 cells, exact) was tried and was slower (60 -> 85 ms): round a gun a ray is
nearly always within a few cells of something, so the extra lookups cost more than the steps they save.

