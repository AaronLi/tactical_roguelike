---
name: rework-gun
description: Rebuild a gun's 3D model from photo references, check every attachment still fits, and log it. Use when asked to rework, revise, refine or trace a weapon model, to pick the next guns to rework, or to refresh the gun contact sheet. Args: gun ids (e.g. `/rework-gun m14 m249`), or `next 4` to take the next guns off the rework log.
---

# Rework a gun model

Models are rebuilt from real photographs, not from generic parts. The aim: laid over its reference photo, the
rendered model coincides with it. Gameplay stats never change here, only the look.

## 1. Pick the guns

- Given ids: use those. Given `next N`: the order is in `docs/gun-reworks.md`: every gun in `G.WEAPON_LIST` not in its log
  first (by tier, then name), then the oldest logged rework. Say which you took.
- One gun: do it here, on the current branch. Several: section 6.
- The contact sheet (section 7) shows the state of all of them.

## 2. References

- Look, don't remember. View photos in the built-in browser only (`mcp__Claude_Browser__*`); never download them. Commons
  thumbnails are CORS-enabled: from a localhost page, fetch
  `https://commons.wikimedia.org/w/api.php?action=query&format=json&origin=*&generator=search&gsrnamespace=6&gsrsearch=...&prop=imageinfo&iiprop=url|size&iiurlwidth=1920`,
  then load the thumbnail with `crossOrigin='anonymous'` into a canvas. IMFDB, makers and auction houses are good too, but
  usually block CORS (draw them uncrossed; just don't read the pixels back).
- First find out what the gun actually is. Check the name against the spec in `js/data.ts` and `js/parts.ts`: the game's
  "Thor" turned out to be the EAA Thor, not the first .50 BMG pistol a search finds, and the user had to correct it. The
  variant must suit what the game does with it: the F1 look on an F2 that takes STANAG magazines was wrong, so it became a
  G2. If the name is ambiguous, ask.
- Take a level, side-on, studio shot. Angled photos and wide lenses ruin the scale: compare heights as well as lengths
  against the real figures, and look at several photos before settling. A photo can show a non-standard part (a short
  magazine): cross-check anything that decides a proportion against a second reference.
- Scale from the real overall length. Note the source file and its licence.
- Makers' product pages often have the best references: level studio side shots on white or transparent, both sides (FN's
  SCAR 16S/17S NRCH pages). Check a photo's angle before trusting it: a visible butt face or rail top means it's taken from
  behind or above; compare the scale from two measures (the rail's slot pitch, the overall length): 2% apart is a slight angle.
  A gun with no good side-on photo of its own (the SCAR-H, at first) is fitted by eye: say so.

## 3. Build it in Blender

A reworked gun is authored in Blender and baked straight from its .glb (docs/models.md "Authored models (Blender)": read it,
with "Authored parts", "Authored furniture" and "Per-part bake and assembly", before starting). The procedural recipes in
`tools/models/recipes.ts` are what's being replaced; only touch them to remove a gun's dead branch once nothing uses it.

**Running Blender.** `"C:/Program Files/Blender Foundation/Blender 5.2/blender.exe" -b -P models/<id>/build_<id>.py` builds
headless (run it in the background: it can take minutes). With Blender open and its MCP add-on connected
(`mcp__Blender__*`), `exec(open(r'<repo>/models/<id>/build_<id>.py').read(), {'GUN_DIR': r'<repo>/models/<id>'})` in
`execute_blender_code` rebuilds into the open scene, and `render_viewport_to_path` / `get_screenshot_of_area_as_image` let
you look at it; never edit the scene by hand: the script is the source, and every run rebuilds the model's collection from
nothing.

**The files.** `models/<id>/build_<id>.py` (the source; it writes the rest), `<id>.glb`, `<id>.blend`, `model.json`
(`{ "source": "authored", "sights": { "builtin": [...], "rail": [...] } }`). A family shares one builder,
`models/<family>_kit.py`, each gun's build script setting `CFG` and exec'ing it (the AR guns `ar_kit.py`, the AK family
`ak_kit.py`, the MP5s `mp5_kit.py`: copy their shape). Every script starts with `models/blender_kit.py` (`kit_collection`,
`kit_mat`, the catalogue colours and helpers). Put the reference photo's source and licence at the top of the script, and any
traced data beside it (the FAL's `trace.json`).

**The frame and the tree.** Blender X = the gun's right, Y = forward, Z = up, metres; the exporter turns it into the game's
(x right, y up, -z forward). A rifle's origin is the back of the receiver on the bore line. Under the root empty (named after
the gun, custom props `gun`, `info_json`, `anchors_json`): meshes with a custom prop `slot` (`base` for the receiver, then the
factory `stock`, `grip`, `handguard`, `barrel`, `muzzle`, `optic` = its own irons) and ONE catalogue material each, by name
(`kit_mat`: black, polymer, steel, rubber...; `m_rrggbb` for a one-off); moving parts are `part_<key>` empties (prop `part`,
the pivot at the node's origin): `part_mag` (with its magazine check), `part_handle`, a bolt, a bipod. The anchors go in
`anchors_json`: `mount_optic`/`_end`, `mount_handguard`/`_end`, `mount_barrel`, `mount_muzzle`, `mount_stock`, `mount_grip`,
`mount_mag` (+ `mount_tac`, `mount_optic_rail` when it has them); the info (`sy`, `fSight`, `relief`, `muzzles`, `grip`,
`support`, `magAt`, `handle`, `port`, `chamberAt`...) in `info_json`. The model holds the factory gun only: everything else the
catalogue offers is seated from those anchors at its own size.

**Fitting it to the photo.** Trace outlines off the photo in pixels (zoom in, read coordinates off a grid over each crop, as
below), convert with one scale from the real overall length and one origin, and build each part from its own outline at its
own thickness (receiver, guard with its window, trigger, grip, panels, controls). Separate parts whose catalogue entries
differ: what another barrel brings (a gas block, a front sight) is the barrel's slot; what stays is `base`. Then check the
overlay in the game (section 4), not just in Blender.

**Shading and edges.** Long flat faces made of n-gons or thin triangles with smoothed normals show diagonal streaks. End the
build with a pass over every mesh: hard edges at about 30 degrees and Blender's Weighted Normal modifier (area-weighted, keep
sharp), applied before export. Give every body a small bevel (0.5-1 mm, 1-2 segments): machined and moulded edges catch a line
of light, and without it the gun reads as boxes. Keep the triangle count under about twice what it was.

**Model what the photo shows, on both sides.** The outline is the easy part: a gun that matches the photo's outline within a few
pixels can still be missing most of its detail. Go region by region (stock, receiver, lower, forend, front) on the photo of each
side and list what is there: the ejection port (open, the bolt in it), the deflector, latches, pins and screws, the selector with
its markings, the magazine and bolt releases (raised housings, not flat squares), sling points and slots, seams between parts,
moulded panels, markings, a butt pad's ribs, a grip's texture. Read which side each control is on from the photos, never from
memory (the SCAR NRCH's charging handle was put on the left from an instruction; FN's photos show it on the right).

**Wiring it in.** The platform's spec in `js/parts.ts` says `rcv: 'authored', authored: '<id>'` and agrees with the anchors
(`L` = `mount_handguard`, `hgMax`, `mag` = `mount_mag`): the baker fails naming any disagreement. Factory furniture whose
mount other guns share becomes an authored furniture part (`models/parts/<slot>/<id>/`, replace-only, built by a
`models/<family>_parts.py` like `ak_parts.py`); a STANAG gun takes `ar_kit.py`'s `mag_stanag` (as the F2 does) so the family's
other magazines seat at `mount_mag`.

**The loop.** Edit the script, rebuild in Blender, then:
- `npm run check:models -- models/<id>/<id>.glb` (the contract, the spec, and the model checks listed in section 4);
- `npm run bake:models -- --parts <id>` (the game loads the bake, not the .glb: a stale bake shows the old model);
- `node tools/check_authored_golden.mjs --update <id>` once it's right (only that gun's fingerprints), then
  `npm run test:models` and `npm run typecheck`;
- `git checkout -- tools/contact-synth/dist` if a build left line-ending churn there; never commit it.

Recipe guns (no `models/<id>/`): `tools/models/recipes.ts` `rifle()` with a bespoke `rcv` and a `*Trace` helper (the AUG, G36,
F2 before it was authored), pistols in `pistol()`; leave them for Blender rather than tracing a new recipe.

- Zoom in. Draw a pixel grid over a crop and read coordinates off it, region by region (three or four crops a gun). A
  transparent-background photo's alpha channel gives the silhouette directly.
- Screen pixels aren't image pixels: work out the scale of each crop before reading it.
- Controls go on the side the photo shows; a right-side photo (muzzle to the right) means +x.
- Never change shared behaviour for other guns: check everything that switches on `rcv`, and `kinds()` in `js/vmanim.ts`.
- Keep the anchors working: `muzzles`, `grip`, `support`, `magAt`, `cheek`, `chamberAt`, `cylAt`, the handle's animation.
- Match the code around it: naming, terse comments, British spelling. Files are mostly CRLF; keep each file's endings.
- Edit by Python scripts with exact-match replacement written to the scratchpad (bash heredocs mangle backslashes). Escapes in
  Python strings bite too: `\b` in a non-raw string is a backspace byte (a regex's word boundary that silently never matches),
  `\n` a newline in the middle of a JavaScript string. Use raw strings, and grep or hexdump what you wrote.

## 4. Test

At `http://localhost:<port>/?mute` (or straight into a level with the gun: `?play&mute&gun=<id>&parts=slot:id,...`, js/debugstart.ts), in a new tab of your own:

```js
const mem = {}; G.U.store = { get: (k, d) => (k in mem ? mem[k] : d), set: (k, v) => { mem[k] = v; } };
```

- **Overlay.** `G.GunModels.display(G.Me.makeWeapon(id, build).def)` gives `{ group, info }`. Render it with your own
  WebGLRenderer and an OrthographicCamera at the trace's scale, semi-transparent over the photo, and correct the trace until they
  coincide. From the gun's left, forward is screen left. Remember a trace's `by` when centring the camera. Read the overlay
  zoomed in: a stray 9 mm offset once came from the harness, not the model.
- **Compare with the photo, by numbers and by detail.** Render the model side-on (orthographic, the photo's scale and origin) into
  an image the photo's size, on white, so the two are in one frame, then compare them in a page on the local server (a render on
  localhost can't be read from another site's page; Commons' and FN's images can be read cross-origin from it, with
  `crossOrigin = 'anonymous'`). Three views, each showing different faults:
  - **Silhouettes:** a mask from each (the photo's alpha or not-white; the render's not-white). Colour photo-only red, model-only
    blue, both grey. Report the overlap (intersection over union) and the worst 40 px bands along the gun by mismatch, split into
    photo-only (missing from the model) and model-only (extra). A band of red on one edge and blue on the other is a part shifted;
    red all round is a part too small. Seen this way: a magazine foot 12 mm short, a front sight behind the photo's, a grip 6 mm
    back, a stock drawn more extended.
  - **Edges:** Sobel edges of each image's brightness (thresholds around 60 for the photo, 40 for the flat-shaded render). Photo-only
    edges red, model-only cyan, coinciding white: features inside the outline that are missing (red with no cyan), misplaced (red
    and cyan side by side) or invented (cyan alone).
  - **Side by side:** the same crops of the photo above the render, region by region, at 2x. The plainest way to list what the model
    lacks; send these to the user when they review.
  Do it for each side and each gun of a family that has its own photo. Show the crops through a canvas scaled to the pane (the
  browser pane is narrow: a full-size image is cut off, and its screenshot is scaled).
- **Alone,** from left, right, top, rear and three-quarter.
- **Every attachment.** Loop `G.Gunsmith.attachOptions(id, base)`, plus each option that only appears with a threaded barrel:
  apply with `G.Gunsmith.prune`, then `display`, `world` and `viewmodel` must not throw, `sy`/`fSight`/`relief` must be finite,
  and the part's meshes (`userData.slot`) must touch the gun.
- **Look at them too.** The automatic test passed things that were wrong. These all got through it:
  - a compensator a thin sliver, sized from a rounded nose
  - magazines that didn't match a chassis's grip
  - a shaped grip drawn on top of the traced one, instead of replacing it
  - grip options that no longer changed anything, because the panels had a fixed material
  - a shared magazine far too long or the wrong shape for this gun (fit it with `magFit`)
  - a rail mount that didn't tip open with a break-action's barrel
  - a rear sight floating behind the frame
  Compare slides, barrels, muzzles, optics, lights, grips, stocks, chassis and every magazine, close up.
- **First person,** in a real level (`btnSolo`, `btnStart`, `G.Server.startLevel()`): hands, hip, sights centred in ADS
  (`Object.defineProperty(G.Me, 'ads', { get: () => true, set() {} })`).
- **Reload.** `G.Me.setSidearm(id)` issues spare magazines; a bare `makeWeapon` has none and the reload silently won't start.
  Check `G.Me.reloading` is true. The test pane's frame rate is very low, so set `G.Me.reloadT` to sample exact frames, and
  confirm the magazine actually refills. Compare with a similar gun before calling something a fault: every bullpup throws its
  stock across the view.
- **Other guns** sharing what you touched still build.
- **A Blender-authored gun** (`models/<id>/`) must pass `npm run check:models -- models/<id>/<id>.glb`, whose model checks
  (`tools/authored_checks.mjs`, docs/models.md "Model checks") need from the model:
  - a. irons: the front post's tip at `sy` on the bore plane, no wider than 1.2 degrees from the eye (`fSight - relief`); a rear
    aperture at least ~2.4 degrees in radius from the eye (a notch 1.5x the post's width); nothing else on the sight line or
    0.6 degrees round the tip between the rear and front sights; `relief` 0.06-0.09 m for aperture irons on a long gun.
  - b. magazine check: `part_mag` `extras.check.w`; `chk` top meshes `i: 0` (case) and `i: 1` (tip); witness holes (`role
    "hole"`, the same `i` and `t` on side 1 and side -1, each its own mesh) or clear-body rounds (`role "round"`). Drums, belts
    and barrel blocks need none.
  - c. top round: its crown no more than 3 mm under the magazine body's top, and not under the feed lips' top.
  - d. handguard: slot `handguard` ends 15 mm or more behind `mount_muzzle` and is no longer than the platform's `hgMax`.
  - e. magazine well: modelled as a hollow shell round `magAt`, and the magazine stays inside it (0.5 mm).
  - f. furniture (warning): each factory stock, grip, handguard and muzzle has a `models/parts/<slot>/<id>/` whose `replaces`
    names its catalogue part.
  - `tools/authored_waivers.json` waives the failures the older guns had when the checks came in (printed as WAIVED warnings).
    When you fix one, remove that gun's rule from it (the check warns "no longer needed" until you do); never add a new gun there.

Browser traps: pass your tabId on every call and check `location.href` first, because a call without one lands on whatever tab is in front, which has put agents' scripts on the user's port. A tab that isn't in front stops ticking: the game loop freezes, so `adsT` stays 0 and reloads never end, and `tabs_select` is what fixes it. Some levels are blackouts: a black first-person view may be the level, so raise the AmbientLight's intensity in the test before suspecting the gun. `G.R.render()` called directly gives a frame even so. Don't leave `M.reloading` forced off and read the magazine: wait for it to finish.

Browser quirks: screenshots go stale, so wait about 2 s and hover somewhere new first. `javascript_tool` times out at 45 s, so
run long loops in the background and poll a `window` variable. To get images out, POST them to a throwaway Node server in the
scratchpad; never trigger a download.

## 5. Finish a gun

- README: an entry in "Traced from references", in the same style, naming the photo. Fix any statement it makes stale,
  such as the model-lengths table.
- `docs/gun-reworks.md`: a row for the gun.
- Delete temporary files; `.claude/dev` must not be committed. Add only your own paths, never `git add -A`.
- Commit titled `<Gun>: ...`. Don't push.
- Report plainly what you verified, what you only eyeballed, and what doesn't match the reference.

## 6. Several guns at once

Parallel agents editing one checkout overwrite each other, so:

1. Wait for anything already editing the same files to commit.
2. One agent a gun (or a family that shares a kit), `model: "sonnet"` unless told otherwise, `isolation: "worktree"`, `run_in_background`, each told to follow
   this skill. Run two at a time, starting the next as each finishes: five at once hit the usage limit twice. A worktree can start on an old commit: have the agent check `.claude/skills/rework-gun` and `models/blender_kit.py` are there. Start a few at a time: a large batch can hit the usage limit mid-run. An agent stopped that way loses
   uncommitted work unless it committed as it went, so tell agents to commit early; continue it with `SendMessage`.
3. Each serves its own worktree on its own port, starting at 8091: `PORT=8091 node serve.js`, run in the background from the
   worktree, stopped when done. It never touches 8080, nor any tab it didn't open: the user may be playing there.
4. To limit conflicts, each keeps its work in its own `models/<id>/` (a family in one agent: its kit is shared), and adds to shared lists on a line of its own.
   Agents leave `docs/gun-reworks.md` to the orchestrator.
5. Review each result yourself before relaying it: rerender it, and close-check whatever the agent says it couldn't see.
   Reports overstate: "sits sensibly" has been wrong.
6. Merge the branches one at a time into the working branch, resolve conflicts (`node --check` every file before committing: keeping both sides of a conflict can drop a shared closing line), run the attachment sweep across all the merged
   guns, add the log rows, and delete the worktrees.

## 7. The contact sheet

A private Artifact: every gun rendered side-on in the order of section 1, the next 25 numbered, each with a 20 cm bar, on mid-grey
so black guns show. Primaries at 400 px/m, sidearms at 1000 px/m. Current one:
https://claude.ai/artifact/Q23BKK6FDdnLdSaxZjZim1 (read it first, then republish to the same URL to keep the link). Refresh it
after a batch: at minimum, the guns that changed.
