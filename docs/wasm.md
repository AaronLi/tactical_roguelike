# The acoustic ray tracer in WebAssembly

The hot loop of the room-measuring ray tracer (`rays(n)` of `tracer()` in `js/acoustics.ts`, what [acoustics.md](acoustics.md)
calls a measured room) has a second implementation in Rust, compiled to WebAssembly. The JavaScript loop stays: it is the
fallback and the reference. The game's behaviour doesn't change except in the tracer's own randomness (500 random rays a room).

## The pieces

| File | What |
| --- | --- |
| `wasm/acoustics/` | The crate: `Cargo.toml` (no dependencies; release profile `opt-level=3`, `lto`, `panic=abort`, `codegen-units=1`) and `src/lib.rs`, the loop line for line, with its own RNG. Plain `#[no_mangle] extern "C"` exports over linear memory (no wasm-bindgen). |
| `assets/wasm/acoustics.wasm` | The built module, **committed**: neither CI nor the site build has Rust, and `assets/` is published as it is. |
| `js/acousticswasm.ts` | A leaf module: fetches and instantiates the module, copies a floor into its memory (a scene), makes traces of it. Also `makeRng(seed)`, the RNG. |
| `js/acoustics.ts` | Flattens a floor (`sceneOf`), and `tracer()` uses WebAssembly when it is ready, the JS loop otherwise. `finish()` (the histograms into an `AcTrace`) is TypeScript for both. |
| `tools/build_wasm.mjs` | `npm run build:wasm`: `cargo build --release --target wasm32-unknown-unknown` in the crate, then the copy to `assets/wasm/`. Rebuild and commit the `.wasm` whenever `lib.rs` changes. |
| `tools/acoustics_wasm.test.mjs` | `npm run test:acoustics` (in CI, next to `test:models`). |

Needs Rust with the `wasm32-unknown-unknown` target (`rustup target add wasm32-unknown-unknown`), only to rebuild.

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
