# The level as data

A level is generated from four figures — **seed, level number, theme, night** — and the generator's output is one plain
object, the **level description**: JSON as it stands, the same on the host's simulation (its thread, `js/serverworker.ts`)
and on every screen. It holds everything that's drawn and everything that's solid. This is the contract the Rust/Bevy port
implements: produce the same description from the same four figures (checked against `tests/level-golden.json`), draw it,
and collide with it.

| Where | What |
| --- | --- |
| `js/level.ts` | The generator: layouts, rooms, the fine grid, doors, windows, lamps, spots, furniture placement (with `js/furniture.ts plan`, `js/homes.ts fill`), stacking floors, the Sandia Crest's ground; and the queries over the map (raycast, flow fields, blast fill...). No three.js. |
| `js/leveldesc.ts` | `G.LevelDesc.describe(map)`: the planned map to the description. Fingerprints (`fingerprint`), procedural surfaces (`proc`). No three.js. |
| `js/world.ts` | `G.World.fromDesc(desc, map)`: the collision world from the description's solids. |
| `js/levelview.ts` | The screen's adapter: three.js meshes from `desc.draw`, the handles the game changes later, the light grid, `mergeStatic`. |
| `tools/check_level_golden.mjs` | The golden (`npm run test:level`). `tools/level_env.mjs` loads the generator in node. |

`G.Level.generate(seed, level, th, night)` returns the generator's map (the game's working structure: typed arrays, maps,
links between records) with `map.desc` on it and `map.world` built from `map.desc.solids`. `G.Level.generateHub(seed, level)`
is the hangar's map (its own fittings are `js/hangar.ts`'s, added to the world after).

## Conventions

- Metres; y up; the map's corner at (0, 0, 0), x east, z south. The fine grid's cells are `TS` (2/3 m) on a side: cell `i` is
  column `i % W`, row `floor(i / W)`, its middle at `((x + 0.5) * TS, (z + 0.5) * TS)`.
- Colours: `0xRRGGBB` numbers or `'#rrggbb'` strings are **sRGB as written**; three.js decodes them to linear (`s2l` in
  `js/leveldesc.ts`). Arrays of three floats (`col`, instance colours) are **already linear**.
- Rotations: `r` is Euler angles in radians, order XYZ (three's `Object3D.rotation`). `q` is a quaternion `[x, y, z, w]`.
  Matrices (`mx`) are 4x4, column-major, 16 numbers each.
- Grids are strings, one character a cell, `'0' + value`: the tile grid `t`, `out`, `grate`.
- Random streams are mulberry32 (`G.U.rng`); `rngAt(seed, k)` is the stream after `k` draws (`seed + k * 0x6d2b79f5`).

## The description

```
{ v: 1, seed, level, theme (its name), night, hub,
  TS, WALL_H, DOOR_H, FLOOR_H,          // 0.667, 4, 2.3, 4.3
  W, H, NF, base,                       // the grid's size; floors; which floor is at ground level
  floors: [{ f, fy, skirt, t, out, grate, units }],
  terrain: { VW, VH, TS, v: [heights at the grid's corners], hole } | null,
  chasm, minY,
  rooms, doors, windows, stairs, rails, railSteel,
  lamps, light,
  spawn, extract, lz, entries, enemySpots, lzSpots, cover, wallSpots,
  props, boxes, crest, fx,
  world: { bounds }, solids,
  draw: { mats, tex, root } }
```

### The grid

`floors[f].t`, a cell each: `0` floor, `1` wall, `2` furniture you take cover behind, `3` a doorway, `4` other furniture or
a fence, `5` no floor (a drop to the floor below, a gorge's air, upstairs outside a house), `7` a flight of stairs.
`out`: `1` open to the sky. `grate`: `1` steel grating (a catwalk), or null. `units`: which apartment a cell is in, plus one
(`0`: none), or null. `fy` is the floor's height, `skirt` how far its walls reach below it (over the slab).
`terrain` (the Sandia Crest): the ground's height at each corner of the grid, `(W + 1) x (H + 1)`; across a cell, the two
triangles 00-10-01 and 10-11-01 (`G.World.terrainAt`); `hole` marks cells of open air.

### Doors and windows

`doors[id]`: `{ id, fl, fy, cells: [two cells], x, z (the opening's middle), axis ('x' or 'z': the way you walk through), w,
mirror (the second leaf of a double door: hinged on the far jamb), kind (null wooden, 'stair' a glass stairwell door,
'fire', 'vault'), open, leaf (the box an open leaf fills: cx, cz, hx, hz, y0, h), pane (a glass door's pane: a window id) }`.

`windows[id]`: `{ id, fl, fy, x, z, len, cells, nx, nz (out of the building), ext (an outside window: a view behind it),
armor (bulletproof: stops rounds, never breaks), cooler, sill, top, broken, door (a glass door's pane: its door), rail (a
railing's glass pane: its rail) }`. Windows, glass doors' panes and railings' panes share one numbering.

A door's or window's state changes in play (opened, shut, shot out, off its hinges); those changes go out as messages naming
the door's or window's id, and every screen and the simulation apply them to the same records: the world's solids for it
(`G.World.door`, `G.World.windowSolids`), the light grid's door layers (`G.LightGrid.setDoor`), and the drawn pivot or pane
the description's handles name (below). A hole cut in a wall names its floor and cell (`js/damage.ts`): the drawn wall is
the instance for that cell in the `walls` node.

### Stairs, rails

`stairs`: `{ f (the floor at its foot), y0, rise, axis, up (-1: climbing toward -axis), x0, x1, z0, z1 }` in metres.
`rails`: railings round the drops, `{ f, y, x0, x1, z0, z1, pane }` (`railSteel`: open steel rails, no glass).

### Light

`lamps`: the light grid's lamps, `{ x, y, z, color, i, d, fl }` (`y` from the level's ground; `color` a tint as written;
`i` intensity, `d` reach: each lights `i * (1 - dist / d) ^ 1.6`). A night level's dark lamps aren't in it (their
fittings are still drawn). `light`: `{ skyI, sky (its colour), floor, wall, ceil (the theme's colours the light bounces
off), night }`. With the grid, the doors and the windows that's all `js/lightgrid.ts build` reads.

### Places

`spawn` `{ x, z }`, `extract` `{ x, z, r }`, `lz` (the helicopter's pad: `{ x, y, z, f }`), `entries` per floor (cells
where a stair arrives), `enemySpots` `[cx, cz, floor]` (cells a suspect can start on), `lzSpots` (the ones in sight of the
pad), `cover` `[x, z, coverX, coverZ, y, floor]`, `wallSpots` `[x, z, y, floor]`, `rooms` `{ fl, type, x, z, w, h, cx, cz,
out, unit }` (cells).

`props`: every piece of furniture, once, in a fixed order (each floor's placed pieces, then what the cells hold besides):
`{ fl, name, x, z, q (quarter turns), v (its variation, 0..1), gy (the ground under it), style, own (1: a resident's) }`.
The furniture a resident's rooms were cleared of (`js/homes.ts clear`) isn't listed at all: it's out of the level, and a
solid's `pr` indexes the list as it is. The shapes are `js/furniture.ts`' (R[name]: its boxes, and the meshes it builds);
each piece's and room's looks draw on a stream seeded by the piece or the room alone (docs/furniture-data.md, "The looks'
random streams"). `boxes`: the weapon case, the attachments box, the
sticker box, the first aid cabinets: `{ x, z, yaw, fy }`. `crest`: the Sandia Crest's roofs, ladders, ziplines, guard rail and
the figures its surroundings are made from. `fx`: what a foundry's machinery throws off (emitters: kind, place, direction).

### Solids

`solids`, in the order the world takes them (a solid's index is its id):
`{ b: [x0, y0, z0, x1, y1, z1], k: kind, ... }` with only what's set: `mv: 0` (doesn't stop people), `ry: 0` (doesn't
stop rays), `hull` (a convex shape's planes `[nx, ny, nz, d]`, inside where `n·p <= d`; `b` is its box), `e` (the map's edge),
`vw` (an outside window's view), `tr` (rolling ground: a block for rays), `bars` (a grating: rounds go between its bars,
`G.Level.onBar`), `ns` (never stepped up onto), `pr` (its piece: `props[pr]`), `dr` (its door's id), `wn` (its window's id),
`gl` (the glass id it is), `st` (its flight: `stairs[st]`), `mat` (`'props:<name>'` / `'parts:<key>'`, `js/materials.ts`).
Kinds: `floor`, `ceil`, `wall`, `prop`, `door`, `lintel`, `leaf`, `glass`, `view`, `step`, `rail`, `grate`.
`world.bounds` is the box the hash covers. Rays, sight and feet are `js/world.ts`.

### What's drawn: `draw`

`mats[i]`: `{ k: 'std' | 'basic' | 'points' | 'line' | 'outside', ...three's material parameters }` — `color`, `roughness`,
`metalness`, `map` (a texture id), `transparent`, `opacity`, `depthWrite`, `side` (0 front, 1 back, 2 both), `emissive`,
`alphaTest`, `flatShading`, `vertexColors`, `fog`, `envMapIntensity`, `blending: 'add'`, `size`, `sizeAttenuation`;
`paint: 1` (a resident's wall colour comes from the light grid's paint texture); `dim` (the colour, once in linear light,
times this: a night festival's dead glass, `0.35`); `outside` is the city seen through an
outside window (`js/furnmesh.ts outsideMaterial(rng(seed), drop)`). One entry where the game makes one material: what
shares one shares an id (the screen merges meshes by material).

`tex[i]`: procedural textures: `lv` `{ kind: floor | wall | rock | plaster | crate, base }` (a tile's noise and lines, the
noise each screen's own), `grate`, `wired`, `glow`, `sign { txt, col }`, `backdrop { seed, at }`, `welcome`, `furn { fn, args,
seed, at }` (`js/furnspec.ts painters(rngAt(seed, at))[fn](...args)`, as `G.FurnMesh.textures` paints them); each with `rep` (its repeat).

`root`: the nodes, **in order** (the order things are drawn in and merged in):

| `t` | Node |
| --- | --- |
| `m` | A mesh: `g` its geometry, `m` its material (or six, one a box face: +x, -x, +y, -y, +z, -z). |
| `g` | A group of `c` (children). `fl`: a floor's group (a building of several floors), at `p` `[0, fy, 0]`. |
| `i` | Instances of one geometry: `n` of them (`cnt` drawn), at `tr` (translations, three a piece) or `mx` (matrices), `col` (linear colours). |
| `p`, `l`, `s` | Points, a line strip, line segments: `pos` (three a point), `col`. |
| `h` | Left to the screen where it falls: `k: 'furniture'` (draw `props` with `tex` for crates), `'fx'` (the machinery's particles), `'zipkit'` (a trolley at `p`, turned `r`). |

Every node may have `p` (position), `r` or `q` (turn), `look` (turned so its +z faces that point, up +y; before it's placed in
anything), `s` (scale), `l1` (on layer 1: what hides the evidence glow), `ro` (draw order; anything with one isn't merged),
`hid` (hidden), `h` (a handle), `hf` (the hangar's map only: part of its fixed shell, baked into
assets/models/scenes/hangar.glb with its fittings, docs/hangar-data.md; a screen with the baked scene leaves it out).

A night festival (`night`) is the small hours with the power off: its bulbs, lanterns, street lamps' heads, stage lamps and LED
strip are dead glass (`std`, the colour `dim` 0.35, roughness 0.25, metalness 0.1), its signs, backdrop, arch and road paint
`std` (lit by the moon), and there are no glows (`p` round the bulbs) and no beams under the stage lamps.

Geometry `g`: `{ k, a: [...], ops }`, `k` one of three's: `box [w, h, d]`, `plane [w, h, ws, hs]`, `cyl [rTop, rBottom, h,
radial = 32, height = 1, open]`, `cone [r, h, radial, height, open]`, `sphere [r, ws = 32, hs = 16, phi0, phiLen, theta0,
thetaLen]`, `circle [r, seg]`, `torus [R, tube, radial, tubular, arc]`, `ico [r, detail]` (each laid out as three lays it
out); `shape` (`pts`: a closed polygon in x, y, triangulated); `tube` (`pts` through a centripetal Catmull-Rom curve, `a:
[segments, r, radial]`); `buf` (`pos`, `nrm`, `uv`, `col`, `idx`); `merge` (`parts`, end to end, non-indexed); `proc` (`fn`:
a procedural surface made from the description alone: `G.LevelDesc.proc`). `ops`, in order: `['rx' | 'ry' | 'rz', angle]`,
`['s', x, y, z]`, `['t', x, y, z]`, `['q', x, y, z, w]`, `['ni']` (to non-indexed). `col` on any geometry: a colour a vertex.

Procedural surfaces (`proc`), each from the description only:

- `terrain`: the ground floor's cells off level at 0 that have a floor, each the two triangles `terrainAt` walks on, normals
  from the heights either side of each corner, a tile's texture coordinates.
- `crest.ground`: a 3 km square of the mountain round the map, 240 x 240 quads (a plane's grid from the north-west corner),
  each vertex at the mountain's height, coloured by its slope and what grows there.
- `crest.cliffs`: the gorge's faces below every edge of ground with the gorge's air beside it, in bands, jittered, lit by
  each facet's slant.

Handles (`h`), what the game changes later: `walls` (the wall instances, `cells` the cell of each: holes and pieces cut out,
`js/damage.ts`), `door:<id>` (the pivot: turned `r[1] + 0.95 * pi/2 * sg * open`), inside it `leaf`, `knob`, `hk` and `hp`
(each hinge's knuckle and leaf), `pane:<window id>`, `case` / `case.lid`, `abox` / `abox.lid` / `abox.lights`, `sbox` /
`sbox.lid` / `sbox.card`, `cab:<n>` / `cab:<n>.door` / `cab:<n>.slot`.

## Checking it

- `npm run test:level`: the golden. Each case's description, part by part (fingerprints: FNV-1a over the canonical JSON,
  keys sorted, numbers rounded to 1e-4; `count`s of what each part lists), its procedural surfaces, that no three.js was
  touched making it, that it survives JSON unchanged, and that the map described again (its world now built from the
  description) gives the same description. `--write` writes it afresh after a change that's meant.
- `await G.ServerLink.digest()` (hosting): the simulation's description against the screen's — `same` is the whole of them
  equal as JSON, `differ` the parts whose fingerprints differ.
