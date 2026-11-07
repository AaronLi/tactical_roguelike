# The hangar as data

The hangar (the hub between levels: `js/hangar.ts`) is drawn from a **baked glTF scene** plus what the game adds to it on each visit. This is the contract the Bevy port implements: what the file holds, its node names and anchors, what the code adds at each anchor, and what stays in code as data.

| | |
| --- | --- |
| `assets/models/scenes/hangar.glb` | the scene (in the model bundle, `models.rtb`: what the game loads) |
| `assets/models/scenes/hangar.json` | the same scene as data: the anchors, the lights, the collision, the counts (not bundled: for the tools and the port) |
| `assets/models/scenes/index.json` | `{ version, scenes: { hangar: { file, data, bytes, tris, meshes, nodes, materials, textures, anchors, lights, solids } } }` |
| `tests/hangar-golden.json` | the golden fingerprint of the file (below) |

## Making it

`npm run bake:hangar` (also run by `npm run bake:models`, before the bundling; `--no-hangar` skips it) = `tsc`, then `node tools/bake_hangar.mjs`, then `node tools/bundle_models.mjs`.

`tools/bake_hangar.mjs` serves the repo on a local port, opens the game's own page in a **headless Chromium** (`BROWSER`, or Edge / Chrome / Chromium where they usually are; CI uses the runner's Chrome) and runs there, on the hangar's map (`G.Level.generateHub`):

- `G.Hangar.fixtures(map)` (js/hangar.ts): the hall's fixed parts, drawn by the same code the game had drawn them with, a group per part of the hall, the anchors among them; it calls `G.Range.fixtures` (js/range.ts) and `G.Course.fixtures` (js/course.ts) for the range's and the course's;
- `G.LevelView.build(map, { pool: false, hubFixed: true })`: the shell, of which it keeps the pieces marked `userData.hubFixed` (the level description's `hf` nodes: docs/level-data.md);
- the map's lights, as empties.

It builds that twice, for two seeds and levels, and fails if they differ (the scene must not depend on the visit). Then it makes the scene ready for glTF and exports it with three's `GLTFExporter` (the version in `package.json`): instanced meshes stay instanced (`EXT_mesh_gpu_instancing`, per-instance colour as `_COLOR_0`); a flat-shaded mesh gets its faces' own normals (glTF has no flat shading: the same picture); what glTF can't say about a material goes in its extras (`rt`, below), a node's layers in its extras (`layers`). The signs, screens and floors are canvases, so the bake needs a browser: the pictures are PNGs in the file, drawn with **the baking machine's fonts** (a bake on Linux differs from one on Windows in the pixels of the text, nothing else).

Back in node it is compressed as the gun packs are (`tools/model_emit.mjs`: `dedup`, then meshopt, positions int16 in each mesh's own box with `extras.dq`, normals 10 bits, UVs 12 bits); an instanced mesh keeps float32 positions (the node's transform comes after the instances', so a box's can't go there).

**Sizes** (this bake): `hangar.glb` 1.35 MB (5.2 MB as exported; 71 PNG pictures, 0.65 MB of it); in the bundle it adds ~0.65 MB gzipped. `hangar.json` 0.38 MB. 1,131 nodes, 1,010 meshes, 21,148 triangles (151,476 drawn, with the instances), 174 materials, 81 anchors, 24 lights, 1,199 solids.

## Loading it

`G.Hangar.load()` (js/hangar.ts) parses the file once, as soon as the bundle is in memory (`G.Game.init` starts it; `G.Game.needModels`, which everything that enters the game goes through, waits for it): `G.Models.loadFile` (the meshopt decoder, `G.Models.dequantize` for the positions), then `prep`: every attribute as float32 (what `G.LevelView.batchStatic` batches), the extras put back (`rt`, `layers`), the shell's solid meshes made to cast a weapon light's shadow (as `G.R.setLevel` has a level's), every material marked `keepMat` (shared by every visit: `G.R.clearLevel` throws away a level's own). Measured: ~1.1-1.3 s from the page's start to parsed (the bundle's download and unpack included; the hangar is entered seconds later).

`G.Hangar.enter(map)` clones the parsed scene (`S.root`, at z = RZ), indexes its anchors (`S.anchors`), adds what changes at them (below), then batches the copy with `G.LevelView.batchStatic` as before (a BatchedMesh per material over everything that isn't kept hold of). There is no fallback: without the file the hangar is just what changes (and a console error).

## The file

One scene, one root node:

```
hangar                     translation (0, 0, RZ): the hall's coordinates below (RZ = G.HANGAR_ROWS * 2 = 312 m, how far the hall is from the map's origin; the range is at negative z)
  zones                    the floor's markings, the three signs hung over the hall, the light fittings under the lamps
  workshop                 the six benches (cabinet, top, splashback, drawers, monitor, vice, lamp, pegboard), the zeroing table and its screen, the parts' pedestals and their sign
  outfitters               Timberline Outfitters: the plank floor, the log rails, `rockwork` (instanced, 65 rocks), the waterfall and pond, the pines, `bear`, `canoe`, the sign over the way in, the six stumps
  store                    Vex's counter, booth and shelves, his sign and till, the five pedestals, the pouch shelf and its sign, the vending machine, the crates
  stash                    the console and its two screens, `cage` (its posts and rails), the sign
  nightjar                 Nightjar Optronics: the floor, the light strips, the panels, the glass front and doors, the fascia, the keypad and camera, the brand on the back wall, the four cases, the counter and terminal, the scope's glass cover, the shelves, the poster
  lounge                   the carpet and rug, the wall and its window strip, the sofas, the coffee table and popcorn, the snack bar and fridge
  helipad                  the pad, the READY ROOM sign
  range                    the yard's sign, the firing lines and markings and their distance labels, the boards at the big marks, the pistol range's wall labels, the ranges' signs and posts, the backstops, the lanes' consoles and their buttons' labels, the targets' posts and frames
  course                   the IPSC course's backstop, its two buttons (post, button, label), the frames of its board and screens
  shell                    translation (0, 0, -RZ): the map's coordinates below. The floor, the ceiling (instanced, a tile each), the roof's top (instanced), the lamps' fittings, the roller doors (the wall over each, the drum, the bottom bar, the guides)
    lights                 an empty per lamp of the map, light_<i>
```

The meshes are unnamed (but `rockwork`, `bear`, `canoe`, `cage`, which are groups or the one instanced mesh); their materials are named `std_<rrggbb>[_tex]` or `basic_<rrggbb>[_tex]` (`basic`: unlit, `KHR_materials_unlit`).

**Material extras** (`extras.rt`, on any transparent material and any other that needs one): `tr` 1 transparent; `dw` 0 if it doesn't write depth (a BLEND material in glTF is taken as not writing depth: a transparent one without `dw` does); `op` its opacity; `at` alpha test; `po` [factor, units] polygon offset (the range's floor markings and labels); `an` its picture's anisotropy (4).
**Node extras**: `layers` the three.js layer mask when it isn't 1 (layer 1: what hides the evidence glow: the floor, the ceiling, the roller doors' walls).

### Lights

`shell/lights/light_<i>`: where the map's lamp is (map coordinates, y = its height: the ceiling, 4 m), `extras.light` the map's own record (`x`, `z`, and `kind`, `y`, `color`, `i`, `d`... when they're set; the hangar's are ordinary ceiling lamps: the theme's colour, `G.HANGAR_THEME.light`). They are not lights in the file (no `KHR_lights_punctual`): the game lights the hangar from the map's lights in code (the light grid, `js/lightgrid.ts`, which the hangar's theme doesn't use: it's daylit, `hemi`), and the port lights it as it lights a level.

## The anchors

An anchor is an empty named `a_<kind>` or `a_<kind>_<i>`, its extras `{ anchor: kind, i?, ry?, ... }`; its translation is in the hall's coordinates (its parent, a part of the hall, sits at the hall's origin). A turn about y is in `extras.ry` (read it there: a node's rotation read back as Euler angles may come out as another set of angles). What the code adds there:

| anchor | n | part | extras | what the game adds there (js/hangar.ts unless said) |
| --- | --- | --- | --- | --- |
| `a_bench_<i>` | 6 | workshop | `x1` (the bench's front edge, x) | the monitor's screen (GUNSMITH and whose bench it is: the roster's) at (x + 0.385, 1.26, z), the nameplate at (x1 + 0.012, 0.74, z); the target `bench<i>` (F opens the gunsmith at your own) |
| `a_part_<i>` | 7 | workshop | | a gunsmith's part for sale turning over the pedestal (`disp` at the anchor), its card at (x, 0.5, z + 0.302); target `part<i>` |
| `a_prec_<i>` | 6 | outfitters | `face` (1: the card faces +z), `top` | a precision part on the stump, its card on the face to the aisle; target `prec<i>` |
| `a_vex` | 1 | store | `ry` π | Vex (a rig, idling round that yaw) |
| `a_stand_<i>` | 5 | store | | a piece of gear turning on the pedestal (a plate beside a carrier that comes with one), its sign at (x, 0.5, z + 0.452); target `stand<i>` |
| `a_pouch_<i>` | 5 | store | | the pouch's card on the shelf's face, at (x + 0.16, 1.0, z); target `pouch<i>` |
| `a_vend_<i>` | 1 | store | `id` (`supply`) | the machine's slots behind its glass (the field supplies: medical items, grenades); a target per slot, and `vend-<id>` (its screen opens the list) |
| `a_stash` | 1 | stash | | the crates in the cage (your stash, two high) |
| `a_nj_<i>` | 4 | nightjar | `face`, `top` | a set of night vision on a mannequin's head turning in the case, its card on the case's face; target `nj<i>` |
| `a_njpart` | 1 | nightjar | `top` (the counter's height) | the thermal riflescope under its cover, its card on the counter's front; target `njpart` |
| `a_njrep` | 1 | nightjar | `ry` π/2 | Nightjar's rep (a rig) |
| `a_tv_<i>` | 5 | lounge | `ry`, `w` (the screen's width) | a TV showing the level just played (js/highlights.ts mount: the lounge's big screen, then the range's four), when there is one; target `tv<i>` (F saves the highlights). The sixth, in the helicopter's cabin, hangs from the helicopter |
| `a_heli` | 1 | helipad | | the helicopter (its rotors turning, its strips red to green as the squad gets in); target `heli` (hold F to board) |
| `a_lane_<k>` | 7 | range | `range` (`pistol`, `rifle`), `n` | the lane's screen (its hits, the last one; js/range.ts paintLane) and, on a rifle lane, the six distance buttons (lit for where the IPSC target is); the targets `lane<range><n>`, `ipsc<n>-<d>` |
| `a_paper_<k>` | 3 | range | `d`, `lane` | the paper target in its frame (its holes drawn on it), 1.35 m up at z - 0.025 |
| `a_steel_<k>` | 22 | range | `d`, `size`, `lane` | a steel plate hung there (the anchor's y is the top of its post: it swings about it) |
| `a_course_btn_<i>` | 2 | course | `text` (START, NEW) | the target `course-<text>` (js/course.ts: start a run, lay a new stage) |
| `a_course_board` | 1 | course | `ry` π, `w`, `h` | the course's board (the run, its splits and score), facing the course |
| `a_course_screen_<i>` | 2 | course | `ry` π, `w`, `h` | the spectator screens (render targets: one behind the shooter, one from the far end) |

The rifle lanes' IPSC targets on their carriers and the course's stage (its boxes, barriers and targets, laid from a seed) aren't on anchors: they move (`js/range.ts` place, `js/course.ts` lay), in the hall's coordinates.

## What stays in code (as data)

- **The collision** (`js/hangar.ts` decorate, `js/range.ts` decorate): boxes in the map's coordinates (the hall's + RZ) and, for each rock of the rockwork, its convex hull (`hull`: its faces' planes) with boxes fitted to it for people to bump into. `hangar.json` `solids` has them as the bake found them: `{ min, max, kind, move, ray, nostep?, hull? }` (`move`: it stops people, `ray`: it stops rounds and sight). The golden test runs decorate again and fails if they differ.
- **What you can look at and press F on** (`addTarget`): an id, a kind (`pos`: F opens a shop panel or runs something; `buy`; `heli`), a box in the hall's coordinates, and what F does. Their boxes are the code's (the plan's constants at the top of js/hangar.ts), the anchors above say where each sits.
- **The shell that changes**: the walls (a round takes cubes out of them: js/damage.ts), the windows (they break), the furniture (described as data: docs/furniture-data.md), the lamps' light (`map.lights`, the light grid). The level description marks the baked pieces (`hf`, js/leveldesc.ts); `G.LevelView.build` leaves them out once the scene is loaded; the bake asks for them (`hubFixed`).
- **What's added at the anchors** (above), and anything that moves or changes: the turning stock, the signs that say what it is and what it costs, the people, the helicopter, the screens with names on them, the range's targets and screens, the course, the TVs, the outline round what you're looking at.

## The golden test

`node tools/check_hangar_golden.mjs` (in `npm run test:models`; `--update` rewrites `tests/hangar-golden.json`) reads the file and `hangar.json` and fingerprints, for each part of the hall: its meshes, its triangles (each mesh once, and as drawn with its instances), its instances and its box (to the centimetre); every named node (a hash, and the names that aren't anchors or lights); each anchor (where it is, to the millimetre, and its extras); each light; the solids (a hash of each one's box, flags and planes' count); and a hash of all of it. Pictures are never compared. It also runs the game's decorate on node (js/world.ts, js/range.ts, js/hangar.ts) and fails when `hangar.json`'s collision is not what the code makes now.

The port checks itself against the same numbers: load the file, walk it, count the same things.

## Measured (headless Edge, 1600 x 900, the 8 hangar spots of the screenshot set, the range and the TVs)

| view | draw calls before | after |
| --- | --- | --- |
| store | 553 | 540 |
| stands | 672 | 647 |
| workshop | 95 | 95 |
| nightjar | 259 | 258 |
| lounge | 222 | 220 |
| lounge2 | 73 | 72 |
| stash | 447 | 416 |
| heli | 154 | 154 |
| timberline | 188 | 174 |
| parts | 436 | 422 |
| range: rifle / pistol / course / yard | 333 / 307 / 297 / 672 | 325 / 299 / 289 / 595 |
| TVs: lounge / range | 92 / 736 | 91 / 656 |

Frame times are the display's (6.2 ms median, p95 6.7-7.4 ms) in both. Entering the hangar (`G.Game.enterShop`): ~370-390 ms before, ~290-320 ms after (the fixed parts are no longer drawn, their canvases no longer painted). The pictures are the same but for the walls' and ceiling's speckle, which is random on every visit (`G.LevelView._tex`).
