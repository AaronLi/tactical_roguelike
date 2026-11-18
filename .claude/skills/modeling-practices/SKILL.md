---
name: modeling-practices
description: Mesh topology and triangle-budget rules for the game's Blender-built models (guns, parts, furniture, ships) and the tools that check them. Use when building or changing a model in models/ (a build_*.py, *_kit.py, *_parts.py), when a model's triangle count is too high, when it shades with streaks or smears, when the weapon AO splits a part into many triangles, or when asked to check, audit or clean up mesh quality / wireframes.
---

# Modeling practices

The GPU draws only triangles: every quad and n-gon is triangulated at export. What matters is the **shape and number of the
triangles**, not whether the source is quads or tris. Quads are still the nicer source (they edit and slice cleanly), but nothing
downstream needs them.

Why shape matters here: the weapon AO (`js/gunao.ts`) and the light grid store values **per vertex** and interpolate them across each
triangle. A long thin triangle stretches one vertex's value 30 cm down a handguard (the smears we chased), and the AO's adaptive split
(longest edge halved while the occlusion along it isn't what its corners say, or while it's over 4 cm) has to cut it into many pieces.
Thin triangles also shade slower: the GPU shades 2x2 pixel blocks, and every block an edge crosses is shaded once per triangle (Humus,
"Triangulation": a fan gets slower with more sides, a max-area triangulation doesn't).

What the AO costs now (2026-11-18): its output is indexed again (it used to give every triangle three vertices of its own, which was
most of the "vertex explosion": an M4 went 25k -> 134k vertices) and it doesn't cut faces that are uniformly shut in (the inside of a
handguard, a tube in its stock: 41% of an M4's split triangles). So **measure triangles, not vertices**: a clean part grows x1.1-1.2
under the AO, a fanned one x1.5-2.6, a long cylinder crossing a shadow line (a buffer tube entering its stock) up to x10.

## The rules

1. **Spend triangles on what's seen.** At arm's length a gun is a few hundred pixels long: a 1.4 mm two-segment round on every edge,
   or 24 sides on a tube hidden in a stock, is invisible and costs thousands of triangles (the Kestrel stock was 6,502, now 2,154).
   - **Chamfer once, before the small features.** `bevel(o, w, 1, 30)` on the body, *then* cut its slots, pockets and holes, so they
     don't get a bevel round their rim and floor (that was 3/4 of the old stock). One segment, not two: a chamfer, not a round.
   - **Keep the look with a tapered cutter.** A square-walled pocket seen square-on disappears (walls edge-on, floor like the surface
     round it). Cut it with `loft(floor_outline, rim_outline, ...)` (models/blender_kit.py), the walls sloping out ~0.5-0.6 mm at the
     surface: they catch the light as a chamfer did, with no more faces than square walls. See `stock_m4` and `handguard_quad` in
     models/ar_kit.py. **Both outlines must be valid:** scale a `rounded()` outline's corner radius with it (at most ~0.96 of its half
     height); a fixed radius on the smaller outline self-intersects, and the boolean then silently cuts *nothing*, no error.
   - **But keep the body's chamfer.** Dropping it altogether made the AO cost *worse* (a quad rail 6,721 triangles with the AO vs 5,815
     chamfered): the chamfer strips give the AO an edge to stop at. One segment, on the body's own edges.
   - **Hidden things get few sides.** A bore or tube that's inside another part: 16 sides, not 24-28.
2. **Size circles to what they are.** `segs(r)` gives the sides a circle needs to stay within 0.1 mm of round (1.6 mm screw 8, 2.6 mm
   head 12, 6.5 mm boss 18, 16.5 mm bore 28; at least 6, even); `corner_segs(r)` for a `rounded()` corner. Don't write 12, 18, 24, 40 by
   hand. A small screw at arm's length is a few pixels. (Hidden ones fewer still: rule 1.)
3. **No face round a hole: frame it.** A boolean that cuts slots or holes into a flat face leaves one n-gon wrapped round all of them
   (sometimes a "keyhole": its outline passes the same point twice), which exports as a fan of slivers the length of the part. Give each
   hole a small rectangle of its own in its face, a margin (~1.5 mm) out from it:
   - `slice_faces(o, cuts)` cuts only the faces lying in one plane. How many lines depends on the face:
     - **A face about as wide as its holes** (a quad rail's corner faces, a row of vents): **one line across per pitch, midway between
       neighbouring holes, on that face only.** Each hole gets a cell of its own; that's enough. A full frame here (three lines per
       hole) spread vertices into the next faces and made a quad rail's body worse (3,300 triangles vs 1,952). See `handguard_quad`.
     - **A wide face with room round its holes** (an M-LOK tube's sides): lines along the face just outside the holes' sides (over the
       span from the first hole to the last), and lines across that face only, just past each hole's ends and through its middle.
       See `handguard_mlok`.
   - Then `strip_ngons(o, axis, passes=1)`: the plain faces beside a framed one pick up the frame's vertices on their shared edge and
     become long n-gons that fan; this cuts them across at their own vertices. One pass here: repeating it for the faces that cutting
     made n-gons of added 14% to a handguard for nothing.
   - **Strips aren't always cheaper than a fan.** A face whose edge is a comb (a vertex at every slot: a Picatinny rail's flank) costs
     more cut into strips than left to fan (a quad rail 4,060 -> 4,772 baked, 5,815 -> 6,449 with the AO, though its flagged % halved).
     Judge every change by **triangles baked and with the AO**, never by the flagged % alone.
   - **Budget:** a framed hole costs about 36 triangles, about 60 with its cell. Much more than that per hole is a sign of fans.
   - Cut positions exact, not rounded: a cut 0.07 mm off a slot's arc leaves a micro-edge (rule 5).
   - See `handguard_mlok` in models/ar_kit.py.
   **Limits** (tried on the handguard): cuts can bound a hole's fan, not remove it; "pucker" vertices (many triangles at a frame
   corner or a hole's tip) remain. Lines from each arc vertex out to the frame moved the fans into the next band; lines along the face
   at every arc vertex's height made a dense grid (+50% after the AO, open edges). Pucker-free means **building** the panel as cells
   (a rectangle with the hole and a ring of quads to the cell's own vertices, matched to its neighbours'), not a boolean then cuts.
4. **An extruded outline's sides: strips at their own vertices.** A part made by extruding a traced outline (a receiver, a magazine
   well) has big flat sides, one n-gon each, that fan. `slice_at_vertices(o, axis)` cuts each such face across at *its own* vertices
   (merged within 1.5 mm), into trapezoid strips. Run it after the bevel (the bevel's chamfer corners make n-gons of the faces next to
   them); before it as well only if the picture still shows fans (a receiver needed both; the Paragon grip, with no holes, only after). Don't cut the whole part round at every vertex it has anywhere (`slice_across` with all positions): that
   drew lines across faces that line up with nothing (a cramped column on the M4 upper beside its port). Not for faces with many holes
   (a slotted stock: every slot end becomes a line down the whole side): frame those (rule 3) or leave them to `tidy`.
5. **Tidy after booleans and bevels.** `tidy(o)` welds vertices closer than 1 µm, dissolves zero-area faces and triangulates any n-gon
   over 4 sides with Blender's BEAUTY (largest smallest angle) rather than the exporter's fan, which matters most for cylinder caps.
   Before a `bevel` with `use_clamp_overlap`, `tidy(o, 0.1 * mm, False)`: one edge under 0.1 mm clamps the **whole** bevel to zero width
   (the VX15 had 2,843 zero-area faces and no chamfers for that reason). **Don't bevel a plate thinner than about twice the bevel
   width** (a 0.65 mm stipple panel with a 0.4 mm bevel): it clamps to nothing and leaves zero-area faces; `tidy` it and leave it square.
6. **Picatinny rails** (`picatinny()` in models/blender_kit.py) are half of a quad rail's triangles. Use `lean=True` (the six-point
   dovetail) unless the rail is seen up close; its flanks fan from the slot vertices and that's acceptable (rule 3: strips cost more).
   Fewer or shallower slots are the next saving if one is needed.
7. **Long quads are fine where nothing varies along them.** A barrel's, tube's or rail's facets, a 0.5 mm chamfer strip: long and thin
   by nature, a quad split once. A fan across a flat face from one corner is the thing to fix.
8. **Flat-shade flat parts.** `smooth(o, 1)` (every edge sharp) for machined parts, so normals never smear across a slot's chamfer.
9. **Shape first, never by eye.** After a topology change the part's `model.json` (anchors, rails) must come out unchanged and the
   silhouette the same; a look change (a chamfer dropped, a slot's walls sloped) is deliberate and shown.

## Checking

```bash
node tools/mesh_check.mjs models/parts/stock/kestrel_cs4/kestrel_cs4.blend --zoom 1
node tools/mesh_check.mjs models/m4/m4.blend --only base          # one slot (or object names): the receiver alone
```

Writes `reports/mesh/<name>.png` (left, right, top: red < 2 deg and > 1 cm, orange < 5 deg, purple zero-area, light blue keyhole) and
`report.json`; `--all` checks every tracked .blend (about 20 s). The files must be under `models/` (the output is named from that path).
Its pictures are named from the path under models/ (`models/parts/grip/paragon_pg23/...blend` -> `reports/mesh/parts_grip_paragon_pg23.png`,
and `..._zoom.png` with `--zoom f`, `_<slot>` added with `--only`), and each run overwrites them: copy them aside before your first
rebuild if you want a before/after pair. Read the picture, not just
the numbers: chamfer strips and long cylinder facets show orange/red legitimately (a gun's "bad %" is mostly
its barrel and buffer tube); fans from one corner across a face are the thing to fix. The side views draw faces at an angle
foreshortened: for a slanted face, look at it square-on. The pictures can't show depth: pocket floors and the surface round them draw
over each other.

```bash
node tools/ao_split.mjs models/parts/stock/kestrel_cs4/kestrel_cs4.glb old.glb
```

Runs the weapon AO on the part alone and prints vertices and **triangles** before and after (needs `dist/js`: `npx tsc -p .`; Node's
`MODULE_TYPELESS_PACKAGE_JSON` warning is harmless); each file
is reported on its own, so pass the committed version too to compare (`git show HEAD:<path>.glb > old.glb`). It doesn't break the
growth down by mesh: to find *what* splits, count each mesh's triangles before and after `GunAo.apply` (or by face normal) in a small
script. For a whole gun in the game, per part: `G.Models.assemble(def)` then
`G.GunAo.apply(group)` in a page, counting each slot's triangles before and after.

**Look at it lit.** Render the gun with a raking light (from above and ahead, not from beside the camera) and from three-quarters as
well as the side: front-on light flattens shallow detail, and a square pocket seen square-on vanishes. Render to a target whose
texture is `SRGBColorSpace`, or everything comes out dark.

## Rebuilding

Parts come from their builder, never from editing the .blend by hand: the AR furniture `blender -b -P models/ar_parts.py` (it rewrites
every AR part, about a dozen: restore the ones you didn't mean to change with `git checkout --`, or, where the working tree has
uncommitted changes to them you must keep, copy their folders aside before the run and back after; it builds the Vantage handguards and the Kestrel stock from
the same functions the guns use), the AK furniture `models/ak_parts.py`, a gun its `models/<id>/build_<id>.py`. Then `npm run
bake:models` and `node tools/check_authored_golden.mjs`: a shared part changes **other guns'** goldens too (the Vantage handguards are in
the AR-9's and SR-25's builds); update the guns whose change you meant (`--update m4 ar9 sr25`) and check every other gun still matches.

## Reference

- Humus, "Triangulation": http://www.humus.name/index.php?page=News&ID=228 (fan vs max-area, cost of thin triangles)
- Polycount, "long thin triangles": https://polycount.com/discussion/232923/long-thin-triangles
- Polycount threads on hole topology: match segment counts of intersecting shapes; keep the edges round a hole local to it.

## Status (2026-11-18)

Done, triangles as baked -> with the AO:
- the Vantage M-LOK handguards (`handguard_mlok`): VX15 15,602 -> 23,190 (its chamfers back), x1.10 under the AO (was x2.27); 59% -> 14% flagged;
- the M4 receiver (`lower`, `lower_ar15_well`, `upper`: rule 4) and its buffer tube (16 sides: 92 -> 60, 888 -> 583 with the AO);
- the Kestrel CS-4 stock (`stock_m4`: rule 1): 6,502 -> 2,154, with the AO 9,589 -> 4,209;
- the Paragon PG-23 grip (`grip_mod`, by a Sonnet agent from this skill): 2,316 -> 958, with the AO 3,265 -> 1,182; its 2.8 mm
  three-segment round is now a 2.2 mm chamfer and its stipple plates square-edged. Not yet in m4.blend or baked;
- the quad rails (`handguard_quad`, done by a Sonnet agent from this skill): quad_rail_240 5,580 -> 4,060, with the AO 9,609 -> 5,815
  (x1.72 -> x1.43), no keyholes or zero-area faces; the rails' flanks still fan (rule 6). In the M4 and baked.
The whole default M4: about 24.7k baked, 35k with the AO (was 134k vertices). The AR-9 and SR-25 build their own receiver, stock and
handguard from these functions and haven't been rebuilt. Left from the first audit, by what they cost under the AO: the AK's quad rail
(northmark_ak_quad, its own builder), the SCAR's
barrel (156 -> 1,277) and receiver, the AK's stock and barrel (x2.1-2.5), the AK drop-in M-LOK handguard (16 open edges), the P2011
slide.
