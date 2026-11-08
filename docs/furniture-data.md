# Furniture as data

Every piece of furniture, a resident's home and the rooms' dressing (floors, rugs, skirting, pictures, clocks) is
described as data before anything is drawn. The description is plain JSON-able objects, with no three.js in it; the page
turns it into meshes, and the Rust/Bevy port builds from the same description. This page is the contract.

| File | Runs | What |
| --- | --- | --- |
| `js/furnspec.ts` | page, server thread, tools | `G.FurnSpec`: the recording kit, `describe(map)` (a level, floor by floor), `piece(name, v, style)` (one piece), `fingerprint()`, the texture painters. |
| `js/furniture.ts` | page, server thread, tools | `G.Furniture`: the pieces (`R`: footprint, solids, `build(k, v, style)`), `plan()` (what goes where), `solids()` and `worldBoxes()` (collision). |
| `js/homes.ts`, `js/residents.ts` | page, server thread, tools | The residents' pieces (more of `R`) and how a home is done over (`fill`). |
| `js/furnmesh.ts` | page (and the highlights' export worker) | `G.FurnMesh`: draws a description (`realise`), the textures painted on canvases, the window view's shader. |

What stays in code, seeded as it was: which pieces go where and how they're turned (`plan`, `G.Homes.fill`), their
sizes and variants (`v`, `style`), what's on a shelf, how a festival's dressed, and each piece's recipe, a function of
`(v, style)` and the looks' random stream that calls the kit. The kit records what the recipe asks for instead of
building it: a piece's description is what its recipe recorded.

## A level: `G.FurnSpec.describe(map, { solids? })`

A building of several floors (`map.floors`) is described floor by floor, as `js/level.ts buildStack` draws it: each floor
map on its own, drawn at its `fy`.

```js
{ v: 1,                      // the format's version (G.FurnSpec.VERSION)
  mats: [FdMat, ...],        // the materials in use, numbered as first used
  tex: [FdTex, ...],         // the textures in use, numbered as first used
  groups: [FdGroup, ...] }   // in drawing order: the pieces, then the rooms
```

### Groups: `{ at, q?, piece?, v?, style?, room?, solids?, prims }`

A group is primitives in one frame. `at` is `[x, y, z]` in metres (the floor's own frame: y up, the map's x and z). With
`q`, the frame is turned `q` quarter-turns about +y (`q * π/2`, right-handed: three's `Quaternion.setFromAxisAngle`) and
then moved to `at`; without it, it is only moved. A piece's frame: its footprint centred on the origin, its back against
the wall at -z, its front at +z, from the floor up.

- `piece`, `v`, `style`: a piece (`G.Furniture.R[piece]`), its own seed (0..1) and style (a resident's colours, a
  container's paint). Pieces come in `map.propList` order, then each resident's hung pieces after their room. The
  furniture a resident's rooms were cleared of isn't in `map.propList` (nor in the level description's `props`): it's gone
  from the level, not hidden.
- `room`: the index in `map.rooms` of the room whose floor, rug, skirting and pictures these are.
- `solids`: with `{ solids: true }` (the golden test), the piece's solids (below).

### Primitives: `{ t, m, s, p, r?, ... }`

`m` is an index into `mats`. `p` is the primitive's centre in its group's frame, and `r` its turn `[rx, ry]` (left out:
none): Euler angles in three's `'YXZ'` order, turned `ry` about y to face, then tilted `rx` about x, no z. Its matrix in
the level is the group's matrix times `T(p) · R(ry, rx)`. Every primitive is drawn with three's geometry for it, so the
Bevy side builds the same vertices (positions, normals, uvs) to match:

| `t` | `s` | other fields | three.js geometry |
| --- | --- | --- | --- |
| `box` | `[w, h, d]` | `lb?` | `BoxGeometry(w, h, d)` |
| `cyl` | `[rTop, rBottom, h]` | `seg` (sides, default 14), `lb?` | `CylinderGeometry(rt, rb, h, seg)`: along y |
| `sph` | `[r]` | | `SphereGeometry(r, 8, 6)` |
| `ico` | `[r]` | | `IcosahedronGeometry(r, 0)`: flat shaded |
| `side` | `[w]` | `pts` (`[[z, y], ...]`), `b` (rounded edges) | a profile along the piece (z) and up (y), extruded across x: `ExtrudeGeometry(Shape(pts), { depth: w - 2b, bevelEnabled: b > 0, bevelThickness: b, bevelSize: b, bevelSegments: 2, curveSegments: 4 })`, moved `-(w - 2b)/2` along its depth, turned `-π/2` about y; `p` is `[x, 0, 0]` |
| `plane` | `[w, h]` | `uv?` (8 numbers: the corners' uv, in three's order) | `PlaneGeometry(w, h)`: in its xy, facing +z (laid flat by `r = [-π/2, ry]`) |
| `grid` | `[w, h]` | `seg` (`[cols, rows]`), `z` (a height for each corner, row by row from +y) | `PlaneGeometry(w, h, cols, rows)` with each corner's z set, normals recomputed: a floor over rolling ground |

`lb`: a label of the stock's atlas (`tex` `'pack'`, 8 x 8 labels) over every face: each uv becomes
`u0 + 0.03/8 + u·0.94/8, v0 + 0.03/8 + v·0.94/8`, with `u0 = (lb % 8)/8`, `v0 = 1 - (floor(lb/8) + 1)/8`.

No primitive casts a shadow (the levels' light is the light grid, `js/lightgrid.ts`); every one is a visual: what stops
people and rounds is the piece's solids.

### Materials: `{ c, r, m, x? }`

By value: `c` the colour (sRGB, `0xRRGGBB`), `r` roughness, `m` metalness, and `x` what else it has, keys in the order the
recipe gave them: `emissive` (sRGB hex), `emissiveIntensity`, `flatShading`, `transparent`, `opacity`, `depthWrite`, and
`map` (an index into `tex`). The page draws all the materials with the same finish (everything but `c`) as one mesh, the
colour in its vertices (linear: three's sRGB to linear), so a level's furniture is a few dozen draw calls; the Bevy side
can do the same. Colours made lighter or darker by a recipe (`k.tint`) are three's: in linear light, rounded back to sRGB.

### Textures: `{ k, a?, s?, rep?, rot? }`

By what paints them: `k` is a painter of `js/furnspec.ts painters` (`wood`, `tile`, `carpet`, `concrete`, `lino`,
`parquet`, `grass`, `dirt`, `flag`, `rug`, `art`) with arguments `a` (its colours), painting with the random stream
from state `s` (mulberry32: `G.FurnSpec.srng(s)` carries on exactly as the stream did); or `'crate'` (the level's crate
texture, `js/level.ts _tex`, which isn't seeded) or `'pack'` (the stock's labels, `packPaint`, its own seed). `rep`:
its repeat over the face (`[u, v]`), `rot`: its turn (radians). Painted textures repeat both ways, anisotropy 4.

## A piece: `G.FurnSpec.piece(name, v, style?, seed = 1)`

A level description with one group, the piece at the origin unturned, its looks drawn on a stream from `seed`, with
its solids.

### Solids: `G.Furniture.solids(R[name], v)`

In the piece's frame, what the simulation collides with (`js/furniture.ts worldBoxes` turns and places them):

- `boxes`: `[x, z, w, d, top, bottom = 0, material?]`: what stops people, and rounds and eyes unless `ray` or `hulls`
  says otherwise. The tallest is the piece's main box. What a box is made of, for a round, is the piece's
  (`js/materials.ts PROPS[name]`).
- `ray`: an open piece's (shelving): what rounds and eyes meet, the same form, its last figure the part's material (a
  name in `js/materials.ts PARTS`: `post`, `deck`, `carton`, `shelf`, `stock`, ...).
- `hulls`: a rock's convex shapes, each a list of triangles (nine numbers to a face), what rounds and eyes meet; its
  boxes then only stop people.

The server's thread loads the same pieces and makes the same solids from them: it never describes or draws the looks.

## The looks' random streams

Every piece and every room draws its looks on a stream of its own (mulberry32, `G.FurnSpec.srng(seed)`), so nothing looks
as it does for what was described before it: a room a resident moves into, or a piece taken out, changes nothing else.
In 32-bit integer arithmetic (`imul`: the low 32 bits of the product; `^` on the 32 bits; the seed taken as unsigned):

- **A piece** (each of `map.propList`, and each piece a resident hangs, `rm.dress.hung`):
  `srng(floor(v · 4294967295) ^ imul(cm(x), 0x9e3779b1) ^ imul(cm(z), 0x85ebca6b))`, where `v` is the piece's own value
  (0..1), `x`, `z` where it stands (metres, the floor's frame) and `cm(a) = floor(a · 100 + 0.5)` (an int32). Where it
  stands is in it because some pieces share a few `v`s (a fence's panels have one of 17: `js/level.ts refine`).
- **A room** (`map.rooms[i]` of a floor map `W` x `H` cells: its floor `fl` (0 if unset), its rectangle `x, z, w, h` in
  cells): `srng(seed ^ salt ^ imul((fl · H + z) · W + x + 1, 0x9e3779b1) ^ imul(w · 65536 + h, 0x85ebca6b))`, with
  `seed` the level's (`map.seed`) and `salt` `0x5eed1e` for a room's own dressing (its floor, rug, skirting, pictures and
  clock) or `0x40e5` for a resident's room (`rm.dress`, a carved room too: its floor and trim; what it hangs are pieces,
  above). A resident's room has only its resident's dressing.
- **The pictures' six paintings** (`art`, painted once a floor, before the rooms): `srng(seed ^ 0x5eed1e)`, nothing else.

A picture or a clock hangs only where three of the room's own cells in a row face a wall, none of them hung on yet, so
what one room hangs never depends on another. So the Bevy port, to describe a level itself, runs the same recipes on
these streams, in any order; to draw one, it can take a description as it is.

## The golden test

`node tools/check_furniture_golden.mjs` (in `npm run test:models`) describes every theme by day and by night, an
apartment block with residents and the hangar, floor by floor, and every kind of piece placed in them on its own, and
compares their fingerprints with `tests/furniture-golden.json`. `--update` rewrites it; `--dump DIR` writes every
description as JSON as well.

A fingerprint (`G.FurnSpec.fingerprint`): counts of groups, primitives (by kind), materials and textures; `hash`, of
`v, mats, tex, groups` (solids left out); `solids`, of each piece's `[piece, at, q, v, solids]`; and per kind of piece
(and `(rooms)`) `[groups, primitives, hash]`, its primitives with their materials and textures written out. A hash is
FNV-1a (32-bit) over the value's canonical text: JSON, keys sorted, no spaces, `undefined` left out, each number written
as the integer nearest 10 000 times it (JS `Math.round`: halves up), `true`/`false` as `1`/`0`.
