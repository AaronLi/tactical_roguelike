---
name: modeling-practices
description: Mesh topology and triangle-budget rules for the game's Blender-built models (guns, parts, furniture, ships) and the tools that check them. Use when building or changing a model in models/ (a build_*.py, *_kit.py, *_parts.py), when a model's triangle count is too high, when it shades with streaks or smears, when the weapon AO splits a part into many triangles, or when asked to check, audit or clean up mesh quality / wireframes.
---

# Modeling practices

The GPU draws only triangles: every quad and n-gon is triangulated at export. What matters is the **number and shape of the
triangles**, not whether the source is quads or tris.

Why shape matters here: the weapon AO (`js/gunao.ts`) stores occlusion **per vertex** and interpolates it across each triangle, so a long
thin triangle smears it. To avoid that it splits triangles: it halves any edge **longer than 4 cm** unless the triangle is uniformly
shut in, and any edge along which the occlusion isn't what its corners say (down to 3 mm). So under the AO a part's cost depends on how
many **long strips** it has (each is cut every 4 cm along its length) and how many fans and slivers (cut where they cross a shadow).
Thin triangles also shade slower: the GPU shades 2x2 pixel blocks, and every block an edge crosses is shaded once per triangle.

**Measure triangles, baked and with the AO, never the flagged %** (`tools/ao_split.mjs --meshes`). A change can raise one and lower the
other (strips raised an MP5 receiver 888 -> 1,702 baked and lowered it 4,485 -> 2,977 with the AO): the with-AO figure is what the game
draws. A clean part grows x1.1-1.4 under the AO, a fanned one x1.5-2.6, a long cylinder crossing a shadow line up to x10.

What the rework of every Blender gun found (2026-11-18, eleven agents and parts): **rule 1 was the biggest win almost everywhere**; rules
2 and 6 were the next; rules 3 and 4 helped on some parts and made others worse, so they're tried, measured and dropped if they lose.

## The rules, in the order to try them

1. **Chamfer once, before the small features.** `bevel(o, w, 1, 30)` on the body first, *then* cut its slots, pockets, holes, windows,
   ports and grooves, so they don't get a bevel round their rim and floor. One segment: a chamfer, not a round. This alone took a P2011
   slide 4,934 -> 1,348, a Kestrel stock 6,502 -> 2,154, an MP5 stock 3,296 -> 1,136. Two segments are justified only on a big curved
   part seen up close (a grip's back, a stock's comb), and three almost never.
   - **Keep the look with a tapered cutter.** A square-walled pocket seen square-on disappears. Cut it with `loft(floor_outline,
     rim_outline, ...)` (models/blender_kit.py), the walls sloping out ~0.5-0.6 mm at the surface: they catch the light as a chamfer
     did, at no cost. See `stock_m4`, `handguard_quad`, `handguard_mlok` in models/ar_kit.py, the SCAR's upper in models/scar_kit.py.
   - **Both cutter outlines must be valid:** a `rounded()` outline whose corner radius is more than its half width (the taper shrank it)
     self-intersects, and the exact boolean then returns **an empty mesh, no error**: the whole part vanishes. Scale the radius with the
     outline (at most ~0.96 of its half height). If a part disappears after a cut, look here first.
   - **Keep the body's own chamfer** rather than dropping it: without it a quad rail cost *more* with the AO (6,721 vs 5,815).
   - **Don't bevel a plate thinner than about twice the bevel width** (a 0.65 mm stipple panel, a 0.4 mm bevel): it clamps to nothing.
   - **Merge features that already overlap** into one outline before cutting (the SCAR's three overlapping M-LOK slots became one).
   - **Drop sub-0.5 mm seams and grooves that go all the way round a long part:** each one is a full ring of faces (a Maxim 9's baffle
     seams: ~250 triangles for nothing visible).
   - If the build script wraps `bevel`, `cyl`, `lathe` (the Tempest's does), change the wrapper: one edit applies everywhere.
2. **Size circles to what they are; hide what's hidden.**
   - `segs(r)` gives the sides a circle needs to stay within 0.1 mm of round (1.6 mm screw 8, 6.5 mm boss 18, 16.5 mm bore 28; at
     least 6, even); `corner_segs(r)` for a `rounded()` corner. Don't write 12, 18, 24, 40 by hand.
   - **Hidden things get few sides:** a bore, a tube inside a stock, a barrel under a handguard: 8-16 sides.
   - **Split a long cylinder into its hidden and visible stretches** (the AR's `barrel(..., hide=)` with CFG `barrel_hide`, the AK's
     `barrel_tube()`): few sides where it's inside a handguard, gas block or receiver, `segs(r)` where it shows. The SR-25's barrel went
     2,718 -> 669 with the AO.
   - **Leave out what can't be seen:** a cap whose disc is inside another part (the F2's barrel rings are uncapped bands whose open
     edges lie on the barrel's surface), a length of barrel inside a suppressor can (the MP5SD's).
3. **Long parts: give the AO edges to stop at.** A tube, barrel or suppressor whose side facets are 20-30 cm long is cut by the AO every
   4 cm, one triangle at a time, into a mess of slivers (a Welrod's suppressor 592 -> 2,339). Build it with a ring of edges every
   3.8 cm or less (the Welrod's `along()` profile in models/welrod/build_welrod.py): the AO then leaves it alone (2,339 -> ~770). For
   any long part, the number of long strips (chamfer strips, facets, flanks) is what the AO multiplies: fewer sides and fewer chamfer
   strips cut more than framing does.
4. **Strips at a face's own vertices** (`slice_at_vertices(o, axis)` then `tidy(o)`): for an extruded outline whose big flat sides fan
   (a receiver, a slide with serrations, a grip). It cuts each such face across at *its own* vertices (merged within 1.5 mm). Run it
   after the bevel (the chamfer's corners make n-gons of the faces beside them); before the bevel too only if fans remain. Always
   follow it with `tidy` (it leaves n-gons). **Measure it: it made many parts worse** — a housing ringed with grooves, a face with a
   column of pockets or windows, a rounded slab, a slotted stock, the F2's shell, handle and grip, the Tempest's chassis. Keep it where it
   wins (receivers, the P2011 and Maxim 9 slides, the MP5's receiver), drop it elsewhere. Never cut the whole part round at every vertex
   it has (`slice_across` with all positions): lines across faces that line up with nothing.
5. **Frame holes only where it pays.** A boolean through a flat face leaves one n-gon wrapped round all its holes (sometimes a "keyhole")
   that exports as a long fan. Framing (`slice_faces(o, cuts)`: lines on that face only) gives each hole a cell:
   - **A face about as wide as its holes** (a quad rail's corner faces, a row of vents): one line across per pitch, midway between
     holes, on that face only. See `handguard_quad`.
   - **A wide face with room round its holes** (an M-LOK tube): lines along each side of the row and across past each end; see
     `handguard_mlok`. Then `strip_ngons(o, axis, passes=1)` for the plain faces beside it (`passes=2` where a framed face meets a plain
     one with no chamfer strip between, as on the AR-9's M-LOK neck).
   - **Often a fan is cheaper:** framing lost on the AK quad rail, both AK drop-ins, a P2011's slots, a magazine's windows, and a comb-
     edged face (a Picatinny flank) costs more as strips than as a fan. A framed hole should cost about 36 triangles, 60 with its cell.
   - `slice_faces` and `strip_ngons` pick faces by their **centre**: a long face whose centre is far from the cuts' range is silently
     skipped (the P2011 agent had to select by bounding box). Check the picture after.
   - Cuts can bound a hole's fan, not remove it; pucker-free topology round a hole means building the panel as cells (rectangles with a
     ring of quads to their own vertices), not a boolean then cuts.
6. **Tidy, and keep geometry from touching.** `tidy(o)` welds vertices closer than 1 µm, dissolves zero-area faces and triangulates
   n-gons with BEAUTY instead of the exporter's fan: run it after the booleans of every part (on adoption, if the script has a wrapper).
   - Before a `bevel` with `use_clamp_overlap`, `tidy(o, 0.1 * mm, False)`: one edge under 0.1 mm clamps the **whole** bevel to zero.
   - After cutting grooves into a chamfered body, `tidy(o, 0.15 * mm)` repairs edges shared by four faces.
   - **No tangent cuts:** a bore whose radius equals a face's distance from its axis leaves a zero-width pinch, open and non-manifold
     edges (the AK drop-in M-LOK's 16 open edges). Move one of them or cut the material away.
   - **Simplify traced outlines:** a higher RDP epsilon on a traced profile removes the near-flat wedges and zero-area slivers at
     their root (the FAL's receiver).
7. **Picatinny rails** (`picatinny()`): `lean=True` (the six-point dovetail) saves baked triangles, but judge it with the AO on a long rail
   (on the SCAR's 390 mm rail it cost more with the AO: 1,636 -> 2,085). The flanks fan from the slot vertices; leave them.
8. **Flat-shade flat parts.** `smooth(o, 1)` for machined parts, so normals never smear across a slot's chamfer.
9. **Shape first, never by eye.** Every `model.json` (anchors, rails, info) must come out unchanged and the silhouette the same; a look
   change (a round become a chamfer, a slot's walls sloped, fewer sides) is deliberate, listed, and looked at **lit** (below).

## Checking

```bash
node tools/ao_split.mjs models/p2011/p2011.glb old.glb --meshes 12     # triangles before/after the AO, whole file and the 12 meshes that grow most
node tools/mesh_check.mjs models/parts/stock/kestrel_cs4/kestrel_cs4.blend --zoom 1
node tools/mesh_check.mjs models/m4/m4.blend --only base               # one slot (or object names)
node tools/check_models.mjs models/p2011/p2011.glb                     # the contract; needs npx tsc -p tsconfig.tools.json
```

- **`ao_split`** needs `dist/js` (`npx tsc -p .`); Node's `MODULE_TYPELESS_PACKAGE_JSON` warning is harmless. Each file is reported on its
  own: for a before/after, `git show HEAD:<path>.glb > old.glb` and pass both.
- **`mesh_check`** draws the exported triangulation (red < 2 deg and > 1 cm, orange < 5 deg, purple zero-area, light blue keyhole) to
  `reports/mesh/<path under models/ with _>.png` (`_zoom.png` with `--zoom f`, `_<slot>` with `--only`), overwriting it each run: copy it
  aside first for a before/after pair. It counts **everything in the .blend, variant barrels and magazines included** (the Welrod's
  .blend is 7,662 triangles, its shipped gun 3,210): use `ao_split` on the glb for the real figures. Chamfer strips and cylinder facets
  show red/orange legitimately; side views foreshorten slanted faces; pocket floors draw over the surface round them.
- **`check_models`** on a gun's main glb and on parts. Variant files (`barrel_*.glb`, `mag_*.glb`, a Tempest `muzzle_*.glb`) always fail
  it on their own (no root extras, no base): they're checked through the bake. Mesh names `<slot>_<n>` renumber when meshes are added or
  split; that's fine (the goldens fingerprint by slot).
- **Look at it lit.** Render with a raking light (from above and ahead, not beside the camera) from the side and three-quarters, to a
  target whose texture is `SRGBColorSpace` (or everything comes out dark): front-on light flattens shallow detail and a square pocket
  seen square-on vanishes. A Blender Workbench render of the glb is a quick alternative.

## Rebuilding

Parts come from their builder, never from editing the .blend by hand: a gun its `models/<id>/build_<id>.py`; the AR furniture
`blender -b -P models/ar_parts.py`, the AK furniture `models/ak_parts.py`, the SCAR's `scar_parts.py`, the MP5's `mp5_parts.py`. A
parts builder rewrites every part it makes (about a dozen): `git checkout --` the ones you didn't mean to change, or copy aside and back
any with uncommitted changes you must keep. A kit function is shared: `handguard_mlok` builds the SR-25's and AR-9's handguards *and* the
four Vantage parts. Then `npm run bake:models`, and the goldens: `node tools/check_authored_golden.mjs` (authored guns; a shared part
changes **other guns'** goldens) and `node tools/check_model_cases.mjs` (recipe guns fitted with authored parts, `--update-golden`).
Check every difference is in the slots you meant before updating (`... changed` lines, `GOLDEN DIFFERS` slot lines).

**Agents in a worktree:** link the main checkout's node_modules with PowerShell `New-Item -ItemType Junction -Path node_modules -Target
<main>\node_modules` (Bash's `mklink` and chained or computed commands are refused there; one plain command per call, or a script file);
run `npx tsc -p .` and `npx tsc -p tsconfig.tools.json`; give scratch files a unique prefix (agents share the scratchpad).

## Reference

- Humus, "Triangulation": http://www.humus.name/index.php?page=News&ID=228 (fan vs max-area, cost of thin triangles)
- Polycount, "long thin triangles": https://polycount.com/discussion/232923/long-thin-triangles

## Status (2026-11-18)

Every Blender gun reworked (the M4 and its parts by hand, the rest by Sonnet agents from this skill), triangles baked -> with the AO:
M4 24.2k -> 17.4k, 46.2k -> 24.0k; AK 17.1k -> 15.0k, 30.9k -> ~24.3k; AK-74 20.0k -> 16.0k, 35.0k -> ~25.1k; RPK 18.0k -> 15.9k,
34.8k -> 27.7k; AR-9 24.6k -> 18.2k, 37.5k -> 25.7k; SR-25 34.1k -> 26.5k, 55.7k -> 38.2k; SCAR 23.6k -> 19.7k, 39.2k -> 28.6k;
MP5 22.5k -> 16.0k, 36.9k -> 23.5k; MP5SD 28.1k -> 19.2k, 43.9k -> 27.7k; F2 13.7k -> 9.3k, 24.6k -> 16.1k; FAL 9.2k -> 8.1k,
17.4k -> 14.5k; Maxim 9 5.4k -> 3.0k, 8.0k -> 4.1k; P2011 13.4k -> 5.5k, 17.6k -> 7.9k; Tempest 17.5k -> 15.2k, 36.2k -> 29.9k;
Welrod 3.2k -> 2.9k, 6.7k -> 3.8k. Left: long cylinders still grow x5-10 with the AO wherever rule 3 isn't applied (the Tempest's
barrels, the buffer tubes, the SR-25's rail); a fix in js/gunao.ts (cutting a long strip into even rings rather than triangle by
triangle) would cover them all at once. The FAL's receiver and handguard, the AK dust covers, the F2's receiver and handle still fan.
