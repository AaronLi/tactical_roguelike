# Several ships live in one zone

Today the zone is one level at a time. The mission ship, or whichever ship the squad's ship comes up with, is the level, and
everything else in the zone is space-side only:
- traffic models and hull shells (js/space.ts `zoneHulls`);
- radar (js/radar.ts);
- guns.

When the squad's ship comes within 500 m of another ship (`zoneClose`, `'tboard'`), the host saves the level being left (the
`SvKeep` interior record), starts the new one (`Server.startLevel`), and every client re-enters (`Game.enterLevel`).

The goal is that, after a jump into a zone, ships are **dormant** (outside only) until the squad's ship approaches. They are
then **active** (interior generated, crew simulated) alongside each other, with no level replaced and nothing reloaded. A
ship goes dormant again (its interior saved) once nobody is aboard and the squad's ship is well away.

## What there is to build on

- **Saving an interior:** `SvKeep` and `restore` (js/spaceserver.ts) already save and rebuild an interior: crew, bodies, loot,
  doors, glass, holes, cuts.
- **Preparing maps ahead:** maps are deterministic from `(seed, level, th, night, gen)`. The prep worker (`Prep`) and
  `zoneReal`/`zonePrep` already make other ships' maps, hulls and interior views ahead of time.
- **Space-side state per ship:** radar suites, transponders, guns and traffic are already per ship, and the radar picture
  survives a level change (`ewMove`, the radar clock).

## What stands in the way

- `Server` (js/server.ts) holds the level as about 30 flat fields (`map`, `enemies`, `flow`, `loot`, `bodies`, `holes`, ...),
  and `SpaceSv` holds the mission (`st.M`) and the zone's active ship (`Z.active`).
- No message carries a level id. Ids (doors, windows, rooms, loot) are indices into one map.
- The client has one level: `Game.map`, `G_R.levelRoot`, the light grid, GpuAo.
- The squad's ship's own interior is placed in the level's world at its berth (`shipSolids`). Whoever is aboard it is in
  that level.

## The plan

1. **Level contexts on the server (no behaviour change).**
   - Gather the per-level fields of `Server` and `SpaceSv` into a context record (`LvCtx`).
   - `Server.ctxSave()` / `ctxLoad(c)` swap a context in and out.
   - `Server.ctxs` holds them by zone ship (k).
   - The tick still steps only the current context.
   - Check: a level saved and loaded is unchanged (digest), and play goes on as before.
2. **Step every active context.**
   - The tick swaps each active context in, steps it (`SpaceSv.tick`, flow, `think`, its objectives), and swaps back.
   - Messages sent while a context is in carry its key (`L`).
   - Each player has the level they're in (`p.lv`). A context's snapshots and events go only to its players.
   - Space-side news (the zone, guns, missiles) goes to everyone.
3. **Activation and dormancy.**
   - The host activates a zone ship as the squad's ship comes within 5 km. It generates the map, or restores it from
     `Z.kept` with `restore`, as an active context.
   - It deactivates a ship once nobody's in it and the squad's ship is over 8 km off: its context is saved (`keepOf`) back
     to `Z.kept` and dropped.
   - At most three contexts are active. The furthest without anyone aboard goes first.
4. **Moving between levels without a restart** (in place of `'tboard'`'s `startLevel`).
   - The squad's ship belongs to one context, the one it's at.
   - Coming up with another active ship moves the squad's ship (its solids, its berth) into that ship's context.
   - The players aboard the squad's ship move with it: their `p.lv` changes and their clients re-enter the new level from
     the live context (a `phase` built from it, no veil).
   - Players aboard a hull stay in that hull's context, simulated, while the squad's ship is away.
5. **The client.**
   - It keeps one interior, the level its player is in. Other active ships stay hull shells (`zoneHulls`), their interiors
     not drawn unless a prebuilt view is wanted.
   - Re-entering from a live context uses the prebuilt map and view (`takeMap`, `viewPre`) so the switch shows nothing.
   - Messages tagged with another level are ignored, except space-side ones.
6. **Space-side.**
   - A dormant ship's guns and fire control run space-side as now.
   - An active ship's gunners come from its context (gunners left, self-destruct, whether it's been breached).
7. **Checks (headless).**
   - Two ships active, a boarder in one while the pilot flies to the other.
   - The first ship's crew keeps acting.
   - The pilot returns, and the boarder and the crew are where they were.
   - A ship left far behind goes dormant, and on return it's restored (bodies, doors, holes).

## Where it's got to

- **Step 1** (level contexts): done. A second level made and stepped beside the first, and the first unchanged.
- **Step 2** (stepping every context; tags, audiences): done.
  - Each level's own players only while it's stepped. A player's messages are handled with their level loaded.
  - `L` tags, and a screen leaves another level's.
  - Nothing is sent from a level nobody's aboard.
- **Step 4** (moving between levels), the first part: done.
  - Coming up with another ship (`'tboard'`) keeps the ship being left live if anyone's inside its hull: their `lv` stays
    it, and it's stepped beside the new one.
  - Otherwise it's put away (`putAway`, as before).
  - Coming back to a live ship loads it as it is now: no regeneration, its clock and crew carried on, and a `phase` built
    from it to those coming in (`phaseMsg`, `toLevel`).
  - A live level nobody's in any more is put away.
  - Checked headlessly with a stand-in left aboard the mission ship.
- **Step 3** (activation ahead): done.
  - Whoever flies the squad's ship tells the host which zone ships it's within 5 km of, the one it's at too (`'tnear'`),
    and which it's gone over 8 km from (`'tfar'`): js/space.ts `ewNear`.
  - Coming within 5 km, the ship's level is made ahead, live (`warm`). It's made quietly: nobody told, no player's state
    touched (`Server.quiet`), the same way the switch makes one (`bringUp`). At most two are made ahead.
  - Coming up with it, the switch just loads it.
  - The ship being left stays live while the squad's ship is near it. Over 8 km off, with nobody aboard, it's put away.
  - Checked: going to MV Halcyon and back, no level was made at either switch.
- **Still to do:**
  - Showing the squad's ship to those left in another level (its pose is in the frame of the level it's at, `spose`, so
    they don't get it now).
  - The `L` tag on the run's messages that someone in another level ought to have.

## Order and size

Step 1 is mechanical and safe. Steps 2 and 4 are the core: messaging and audiences, and moving the squad's ship between
contexts. Step 3 is the policy around them. Step 5 is mostly re-using what's there. Each step is committed on its own and
checked headlessly before the next.
