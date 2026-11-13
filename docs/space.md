# The game in space

Branch `feature/space-direction`. The hangar is the squad's base, cut into the top of an asteroid. Missions are taken at a
board by the pad, flown to in the squad's own ship, and paid when they're done. `G.SpaceData.ON` (js/spacedata.ts) turns it
off: the game is then the route map and the helicopter, as it was. A debug start's `?play` goes the old way whatever it says.

| File | Where it runs | What it does |
| --- | --- | --- |
| `js/spacedata.ts` | both | The ships, what fits on them, the missions a visit offers (from its seed), the ship themes, distances written in the right units. |
| `js/shipgen.ts` | both | A ship to board as a level's layout (`G.Level.generate`'s fifth figure, `sp`), and `map.sp`: the breach, locks, roles, objective spots, hull windows. |
| `js/spaceserver.ts` | the host's thread | The board, the fleet, seats, the ship's pose passed on, the jump, a mission's own rules. |
| `js/space.ts` | the page | The ship at her berth, flying her, what's outside moved by the inverse of her pose, docking, the jump, F and her keys. |
| `js/shipmodel.ts` | the page | The squad's ship, a boarded ship's hull from her deck plan, the asteroid, anchors, a planet, stars, the jump's tunnel. |
| `js/spaceui.ts` | the page | The flight display, waypoint marks, the navigation screen, the sensor station's deck plan, the objective, the terminal (missions, shipyard). |

## How a sortie goes

1. **The base.** The ship stands on the pad. The terminal by it (F) lists six missions: take up to three. Its second tab is
   the shipyard.
2. **Aboard.** Walk up the ramp. Seats: the helm (port, forward), the sensor station beside it, a seat under each hardpoint,
   jump seats. Hold F at one to sit, hold F to get up.
3. **Lift off.** At the helm, hold G. Nobody on their feet may be left outside. Flight is first person, from the seat,
   through the glazed airlock and the windscreens:
   - the mouse turns her (right button held: look about instead), W S thrust, A D sideways, Space C up and down, Q E roll,
     Shift with W the cruise drive (not within 420 m of anything big), X brake, T the next waypoint;
   - a ring where her nose points and a green ring where she's actually going; every waypoint marked on the view with its
     distance (m, km, Mm, light-seconds: `G.SpaceData.dist`); the navigation screen on the helm's console and on the glass.
4. **The anchor.** Each mission taken has an interspatial anchor 7 to 13 km out. In the ring, under 80 m/s, hold J: the
   drive spools, the screens go to the jump's light (the host's veil, kind `ftl`: CSS only, so it keeps moving while the
   page builds the level), and the ship comes out of the tunnel 4.5 s after the level is ready. A corvette's level built in
   about half a second on the machine this was tested on.
5. **Boarding.** She arrives 1.7 km off. Ram her hull nose-on at 5 to 45 m/s, **anywhere there's a clear stretch of it**:
   port, starboard or the stern quarters (the hold amidships to starboard is marked as a suggestion). The navigation screen
   becomes the approach to wherever the nose is pointed: offset, range, closing speed. The hull is cut through there, her
   breaching door opens, and it's the CQB game from there. Hold G at the helm to undock: the compartment she backs out of
   is open to space. She can go in again somewhere else.
6. **A planet.** She arrives in orbit. Fly into the descent corridor: cloud covers the change, and she comes out above the
   base. Within 160 m of the pad, under 45 m/s, hold L to set down. To leave, lift off and climb past 1500 m.
7. **Home.** Back in the mission's anchor, hold J. The fee is paid to every officer then, if the mission's done. Fly to
   the next anchor, or over the pad and hold L. Set down with missions flown, the board turns over and the squad is that
   much further on (`rank`: what the next missions are pitched at).

## How she flies without moving

The ship never moves in the level's world. Her deck is solid at her **berth** (the pad in the hangar; nose-on to the
breach; the base's landing pad), so walking about her, seats, rays and sound are the level's own while she's under way.
Her pose (P, Q) is where she would be had she flown off the berth; `outside()` turns and shifts the level's drawing and
everything in space by the inverse of it. Docked, nothing is moved. Flying, whatever is loose in the scene and whoever
isn't aboard is hidden (`hideStrays`) and put back when she's against it again.

The pilot's game flies her (`S.ctl`: whoever last took the helm) and sends `spose`; the host passes it on; the others ease
to it. `sdock`, `jump`, `seat`, `mpick` and the shipyard's messages go through the host.

## Ships to board

`G.ShipGen.lay(r, level, sp)`: one deck, bow west. The bridge across the bow (glass the width of its bow wall), a spine
corridor aft to the engine room across the stern, compartments off it to port and starboard with bulkheads between. Open
space round her is tile 5, open to the sky, with `chasm` 300 so nothing is drawn or stood on there.

| Class | Hull | Aboard | On her hull |
| --- | --- | --- | --- |
| civilian transport | about 34 x 18 m | bridge, engine room, a hold, cabins, a mess. 6 crew, 3 light guards | nothing |
| corvette | about 40 x 20 m | the same, larger. 4 guards, one breach response squad | 1 point-defence gun |
| frigate | about 65 x 28 m | adds an armoury, barracks, a sick bay, a magazine, escape pods; the bridge is locked. One security squad | 2 point defence, 1 cannon |
| cruiser | about 100 x 36 m | adds a galley, a brig, a reactor, a vault; deeper sides split in two. Two security squads, two response squads | 3 point defence, 2 cannon, 1 missile launcher |
| capital ship | about 128 x 36 m, **two decks** | the bridge and cabins on the upper deck, a forward magazine under it, the reactor over the engine room, two stairwells. Four security squads, three response squads, 10 crew | 5 point defence, 3 cannon, 2 missile launchers |

What the board offers goes by how far the squad has got: transports and corvettes first, capital ships from the fifth rank.

- **Her complement** (`G.SpaceSv.crew`, by `G.SpaceData.SIZES`): those who don't fight; light guards posted singly; security
  squads of four, armed and armoured, their chief with the first; breach response squads of three, lighter, who come to
  where the hull is breached (the comms jammer stops them being called).
- **Her weapons** (`HULLGUN`, js/space.ts guns): point defence (1.3 km, blind under its own deck within 90 m); cannon (4.5 km,
  10 a hit, poor against anything quick or close in); missiles (6.5 km: they home, a hard turn across the nose shakes
  one, a turret can shoot one down, 24 a hit). All can be destroyed from a turret seat.
- **A second ship** (`sp.other`, four offers in ten except with a capital ship): a transport or corvette lying 44 m off the
  target's port side, nothing to do with the mission. She has her own crew and a cargo manifest in her hold: take it
  (hold F) for salvage money, paid at the jump home whether or not the mission is done.
- **Decks** are stacked as a building's storeys are (js/level.ts stack): the same hull on each, a flight of stairs in each
  stairwell. She's breached on her lowest deck. The sensor station draws each deck.
- **Breach sites** (`G.ShipGen.sites`, `cut`): three cells of hull wall in a row (2 m), floor clear behind the middle of it,
  no window, and open space out from it for the squad's ship (22 m, widening from her collar to her engine pods). A cut
  makes those cells floor and takes the wall's solids out up to a door's height, the same on the host and every screen;
  the ship's berth moves to the site (`rebase`). A frigate has a few dozen sites; the bow is the bridge's glass, so none there.
  Her point-defence guns can't bear on a ship under their deck's edge within 90 m.
- **Doors.** A ship's doors **slide** into the wall (`slide`; a building's still swing): no leaf standing in the room when
  open, no hinges to shoot off, not to be kicked. The armoury, the vault and the bridge are `blast` doors with a lock: a keycard each,
  carried by one of the crew, dropped where they go down or are restrained, picked up by walking over it. The crew don't
  open locked doors. The weapon case and the attachments box are in the armoury where there is one (`lootRoom`).
- **Open to space.** A pane in the hull shot out lets its room's air out. Doors between a room with air and one without
  shut themselves after 2.5 s; one off its hinges lets the next room go too. Crew in there die in about five seconds.
  Officers' suits hold.
- **The spine.** Two wide on a frigate or cruiser: a crate now and then, and a rib at each bulkhead that narrows it to one.
- **Her outside** (`G.ShipModel.hull`): the level's own walls are her sides. Over and under them: armour belts clear of the
  windows, a command tower and a ram prow at the bridge, nozzles and plumes at the engine room, radiator fins on the
  reactor, hatch covers on holds, pod blisters, a point-defence gun over each magazine. The guns fire on the squad's ship
  inside 1300 m; a turret seat's gun can destroy them.

## Missions

| Objective | Done when |
| --- | --- |
| Recover the artifact | someone is carrying it when the ship jumps home (dropped if its carrier dies) |
| High value target | the officer is dead or restrained (restrained pays half as much again) |
| Scuttle her | the self-destruct on the bridge is started (120, 165 or 210 s by size). Whoever is aboard her, or in a ship against her hull, when it runs out goes with her. An escape pod puts you aboard your own ship. |
| Planetary assault | every hostile down or restrained, with the ship on the pad |

Nothing is paid for a kill, an arrest or evidence on a mission (`G.Server.pay`); what a wrong costs still is.

## Ships and fittings

Kestrel (the starter), Atlas (¢9,000: two hardpoints, two bays, more hull), Wraith (¢14,000: fast, thin). Hardpoints take
the PD-20 autocannon or the Lancet railgun; bays take the deck scanner (the sensor station reads a ship's deck plan inside
3 km, and who's aboard inside 900 m), ablative plating, a tuned cruise drive, a comms jammer (the breach is heard 14 m off,
not 45). The host's fleet is kept in its browser (`fleet`).

## Checking it

- `node tools/ship_dump.mjs <small|medium|large> <seed> [level] [obj]`: a generated deck plan as text.
- `node tools/space_shot.mjs "<query>" <steps.mjs> --gpu`: the game in a headless Chromium against a running
  `node serve.js` (`--port`), with screenshots. Queries: `mute&hangar`, `mute&fly`, `mute&board=medium&obj=destruct&dock&nofoes&fuse=25`,
  `mute&assault=warehouse` (js/debugstart.ts).
- `npm run test:level` is unchanged (31/31): ship themes are numbered from 1000 and aren't in `G.THEMES`.

## Not done yet

- **Co-op is untested.** The messages are there (pose relay, seats, late joiners' `welcome`), but only solo was run.
- Controller and touch can't fly the ship (keyboard and mouse only).
- The squad's ship has one deck plan scaled per class; the three differ in size, seats, paint and numbers.
- Rooms are furnished from the existing furniture (beds, lockers, racks, consoles): no ship-specific pieces yet.
- There's no decompression effect on screen or in the sound.
- The human models are still the old ones: `models/characters/face_options.py` renders four face styles and the new
  proportions (`models/characters/options/`) for a direction to be picked first.
- The classic run's hangar has no helicopter while `ON` is true, so the old loop only works for a single `?play` level.
- The career log and highlights don't know about missions (a mission's fee is logged as evidence money).
- The squad's ship has no weapons of her own beyond her turrets; missiles are only drawn on the screens that are told of them.
- Other ships are only met alongside a mission's target, not out in the space round the base.
- A second ship isn't generated beside a capital ship (her upper deck would leave it roofless).

## People

Everyone's body is one of twenty figures (ten men, ten women: `models/characters/human_variants.py`, built by
`models/characters/build_variants.py` into `assets/models/humans/<id>.glb` and `js/humandata.ts`), skinned to the rig's joints
(`js/humans.ts`, `js/rig.ts` attachHuman). A figure's height is a scale of the whole character; its build is the fit of what it
wears (rig.ts fitPart: helmets, carriers, belts, packs, limb armour), of its hit capsules and of the anatomy inside it
(`js/ballistics.ts` segFrame). Aboard a ship the crew dress by her kind (`G.SpaceData.wearOf`): a transport's people in everyday
clothes with security guards, the corvettes' and frigates' as pirates (vests, bandanas, sashes), the cruisers' and capital
ships' as a navy (coveralls, working uniform with a white belt, officers in white with boards and cuff rings).
`node tools/space_shot.mjs "mute&hangar" tools/human_lineup.mjs --out <dir> --gpu [--ids m04,f03] [--sets heavy] [--wear navy]`
stands them in rows to look at.
