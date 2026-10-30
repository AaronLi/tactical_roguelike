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
- First find out what the gun actually is. Check the name against the spec in `js/data.js` and `js/parts.js`: the game's
  "Thor" turned out to be the EAA Thor, not the first .50 BMG pistol a search finds, and the user had to correct it. The
  variant must suit what the game does with it: the F1 look on an F2 that takes STANAG magazines was wrong, so it became a
  G2. If the name is ambiguous, ask.
- Take a level, side-on, studio shot. Angled photos and wide lenses ruin the scale: compare heights as well as lengths
  against the real figures, and look at several photos before settling. A photo can show a non-standard part (a short
  magazine): cross-check anything that decides a proportion against a second reference.
- Scale from the real overall length. Note the source file and its licence.

## 3. Trace

Read `js/guntraces.js` (data, in photo pixels: `ref, mm, x0, y0, dir, by, rot, top, bot, port, parts, mag`) and in
`js/gunmodels.js`: `tracer`, `tracedSlide`, `tracedParts`, `tracedSer`, `k.prof`, `k.profs`, `k.loft`, and `rifle()`'s `tr`/`VT`
receivers. Pistols use `look` and a `G.GunTraces` entry; revolvers `tracedRevolver`; long guns `look` with `by: 0` (a rifle's bore
is at y = 0, a pistol's at 0.009), or a bespoke `rcv` with a `*Trace` helper when they need custom geometry (the AUG, QBZ-95,
G36, F2).

- Zoom in. Draw a pixel grid over a crop and read coordinates off it, region by region (three or four crops a gun). A
  transparent-background photo's alpha channel gives the silhouette directly.
- Screen pixels aren't image pixels: work out the scale of each crop before reading it.
- Use separate outlines by thickness: receiver, trigger guard (with its window as a hole), trigger, grip, panels, controls.
- Controls go on the side the photo shows; a right-side photo (muzzle to the right) means +x.
- Never change a shared branch's behaviour for other guns: give the gun its own `rcv` or `look`, and check everything that
  switches on `rcv`: `hw`, `handle`, `kinds()` in `js/vmanim.js`, `bull`, `port`, `chamberAt`, `tacAt`, sights.
- Keep the anchors working: `muzzles`, `grip`, `support`, `magAt`, `cheek`, `chamberAt`, `cylAt`, the handle's animation.
- Match the code around it: naming, terse comments, British spelling. Files are mostly CRLF; keep each file's endings.
- Edit by Python scripts with exact-match replacement written to the scratchpad (bash heredocs mangle backslashes).

## 4. Test

At `http://localhost:<port>/?mute`, in a new tab of your own:

```js
const mem = {}; G.U.store = { get: (k, d) => (k in mem ? mem[k] : d), set: (k, v) => { mem[k] = v; } };
```

- **Overlay.** `G.GunModels.display(G.Me.makeWeapon(id, build).def)` gives `{ group, info }`. Render it with your own
  WebGLRenderer and an OrthographicCamera at the trace's scale, semi-transparent over the photo, and correct the trace until they
  coincide. From the gun's left, forward is screen left. Remember a trace's `by` when centring the camera. Read the overlay
  zoomed in: a stray 9 mm offset once came from the harness, not the model.
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
2. One agent a gun, `model: "sonnet"` unless told otherwise, `isolation: "worktree"`, `run_in_background`, each told to follow
   this skill. Start a few at a time: a large batch can hit the usage limit mid-run. An agent stopped that way loses
   uncommitted work unless it committed as it went, so tell agents to commit early; continue it with `SendMessage`.
3. Each serves its own worktree on its own port, starting at 8091: `PORT=8091 node serve.js`, run in the background from the
   worktree, stopped when done. It never touches 8080, nor any tab it didn't open: the user may be playing there.
4. To limit conflicts, each keeps its data in `js/guntraces.js` where it can, and adds to shared lists on a line of its own.
   Agents leave `docs/gun-reworks.md` to the orchestrator.
5. Review each result yourself before relaying it: rerender it, and close-check whatever the agent says it couldn't see.
   Reports overstate: "sits sensibly" has been wrong.
6. Merge the branches one at a time into the working branch, resolve conflicts, run the attachment sweep across all the merged
   guns, add the log rows, and delete the worktrees.

## 7. The contact sheet

A private Artifact: every gun rendered side-on in the order of section 1, the next 25 numbered, each with a 20 cm bar, on mid-grey
so black guns show. Primaries at 400 px/m, sidearms at 1000 px/m. Current one:
https://claude.ai/artifact/Q23BKK6FDdnLdSaxZjZim1 (read it first, then republish to the same URL to keep the link). Refresh it
after a batch: at minimum, the guns that changed.
