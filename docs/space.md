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
5. **Boarding.** She arrives 1.7 km off. Ram her hull nose-on at 5 m/s or more (no speed is too high), **anywhere there's a clear stretch of it**:
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

## A taken ship (`obj: 'hostage'`)

One mission on every board is a civilian transport that pirates have boarded. Their pods (two or three) are still lodged in her
hull (`js/spaceserver.ts` populate picks the sites, clear of each other and of the marked stretch; `js/space.ts` raidPods draws
them and the shut hatch inside; nobody can breach within eight metres of one). Her people are tied in her biggest compartment
with three pirates over them, the rest are about the ship and their leader is on the bridge (crew). It is done when no pirate is
left standing, and each hostage alive pays a bonus. `?board=transport&obj=hostage&dock` starts one.

Every hull carries lights outside (`js/shipmodel.ts` hull): a line of light along the top of each side, a red one along the keel,
floodlamps under the upper belt with their wash painted on the plating, and navigation lights.

## Her lines (`js/shipmodel.ts` hull)

A ship's outside is her compartments' boxes with her kind's own pieces over them (`docs/hull_languages.png`):
a **freighter** (a transport in the Freighter theme) has a blunt bow, containers down her back, tanks slung off her roof's
edges, gantries, a dish, and ribs and pipes down her sides; a **corporate cutter** a needle bow, rounded shoulders and keel, a
fairing over her sides, a swept fin and two nacelles; **pirates** (corvettes, frigates) a toothed ram, scrap plate on her roof
and sides, spikes, hoops of girder, a boom to one side and an engine strapped on at the other, all dark and rusted; a **navy**
ship (cruisers, capital ships) a long wedge bow, armour sloped over her roof's edges, her sides and under her keel, a citadel
with masts, tail fins, and on two decks a chine between them. Every inside corner of her plan is faired in. What's over her
sides is smashed away where she's rammed (`cutAt`, called from `js/space.ts` cutHere and for the pirates' pods).
`node tools/space_shot.mjs "mute&board=large&hull=2" tools/hull_views.mjs --out <dir> --gpu` looks at one from outside.

## A flying wing (`sp.wing`)

Some corvettes and frigates (three in ten on the board; `?board=small&wing`) fly corner first: two arms swept back from her bow
corner, one east and one south (`js/shipgen.ts` wingSkeleton, wingDeck). Each arm is a spine with compartments on its leading
and its trailing side and an engine room across its end; the bridge is across the corner, glazed down both of its outer walls
(corner windows); the spines meet behind it, and a compartment sits in the crook. Outside (`js/shipmodel.ts`, the 'wing'
language): a blade down each leading edge, a glazed canopy round the corner with a chin under it and a brow over, a ridge down
her middle, a fin at each tip, engines out of both arms' ends. `node tools/ship_dump.mjs small 7 2 artifact --wing` prints one.

## The zone

A mission's space, and the base's, is an open zone a long way round, flown freely. Others are under way in it
(`js/space.ts` zoneTraffic, zoneStep; their models `js/shipmodel.ts` traffic: freighters, cutters, pirates, navy ships, flying
wings): each keeps a course of its own, a loop through a few buoys round the middle, at its own pace, placed by the zone's
clock alone (the host's on a mission: `zt` in the mission's state; the day's at the base) so every screen agrees. The ship
being boarded is under way too, bow first at 12 m/s: the zone slides by her, and by the level and everyone aboard or near her
so the anchor to jump home by, which is a place in the zone, falls astern as the mission goes on.

A mission's zone is vast, with only now and then someone else in it (`js/spacedata.ts` zone: the mission's ship, contact 0, and
four or five others on wide loops; one comes within a few kilometres). Every one of them is a ship of her own class, theme and
seed, on the navigation screen by name. Come up within 450 m of one for two seconds and the squad's ship matches her course:
the host makes her the level (`tboard` in `js/spaceserver.ts`; the zone is then drawn from her, turning when she turns) and the
ship left behind goes on her way as one of the zone's others. Nothing is drawn over this: no wipe, no loading screen. Within
five kilometres a ship of the zone's is already drawn as her own hull (`zoneReal`: her level laid out from her seed, for its
outside only), and when she becomes the level the squad's ship is put where she was by her, heading as she was (`carry`), so
the only thing that changes is that she now has an inside and a crew. She can be boarded like any ship: a breach is an attack whoever
she is (her crew fight, her response squads come, and her guns, silent till then, open up when the squad's ship is off her
again). What's in her holds is salvage, paid at home with the rest. Going back to the mission's ship is the same thing the other
way: what was done aboard her stands (objectives, keycards, holes in her hull, vented compartments), but her crew are at their
posts again unless she was already cleared. Round the base the others are only seen.

Getting her ready ahead (`js/prep.ts`, `js/prepworker.ts`): the slow part of putting a level on screen is its light grid's
sums (`js/lightgrid.ts` compute: a second, for a cruiser). When one of the zone's ships comes within five kilometres her level
is laid out on the page for her hull (`zoneReal`, tens of milliseconds) and a worker thread is asked for her light grid; when
she becomes the level the page takes that layout (`G.Space.takeMap`) and those sums (`G.Prep.take`, `map.lgPre`), so the frame
she's put up in has only her meshes to make: about 0.1 s for a transport and 0.4 s for a cruiser, where it was 0.6 s and 1.4 s.

And her meshes are made ahead too (`zonePrep`, from the game's loop once each frame's drawn), for the nearest of them within
two kilometres, a few milliseconds a frame and nothing of it in the scene: her drawing mesh by mesh (`js/levelview.ts` begin,
step: `build` is the same steps run straight through, and takes over whatever's left of one begun, `map.viewPre`), then all
of it sent to the graphics card and its shaders found for the scene as it will be lit (`js/render.ts` preload: the level
now on screen has its own lights out of the count, and the new one's artifact glow is stood in for). Left three kilometres
behind, it's thrown away. In the frame she becomes the level: her hull is the one she's been seen in (`zoneHulls`), and the
hull of the ship left is kept, holes and all, to be seen from her; no shaders are rebuilt behind a stopped picture (they
were found on the way in); her people are made a few a snapshot (`G.Views.slowFill`); and the rooms' acoustics are measured a
piece four times a second while the squad's ship is flying (`js/acoustics.ts` prewarm). That frame is 60-80 ms, whatever her
size. Come up with faster than she can be got ready, the rest is done in that frame as before.

## What it sounds like (`js/ambience.ts`)

All of it is synthesized as it plays, as the places on the ground are. There is no air outside a hull, so nothing is ever heard
from outside one.

The squad's own ship (`shipVoice`) is made of parts that follow how she's flying, which `G.Space.sound` reports each frame:
her cabin (air, and the 400 Hz of her panels), her reactor (a low beating note), her drive (a rumble and a roar that open up
with her speed, harder while she's gaining or losing way), the cruise drive (a note under the floor and a thin singing over
it), her thrusters (a hiss while she's turned), and the jump (a note that climbs while it spools, a hollow pulsing roar in
transit). One-shots mark the breach, dropping out of a jump, and her clamps. Aboard her you hear all of it; from the hangar
floor or the deck of a ship she's against, less with distance and dulled.

A ship being boarded has a recipe by her kind (`Freighter`: a slow heavy drive, big fans, her frames groaning; `Corporate
cutter`: quiet and smooth; `Navy warship`: dense, 400 Hz everywhere, contactors), and sources in her rooms heard nearer and
further as you move (her drive in the engine room, her reactor, the bridge's consoles, the galley, the medbay). It is silent
while you are shut in your own ship out in space. The base's hangar, being a hall cut in a rock, has no weather: air, a
reactor, contactors, the rock settling.

`tools/space_film.mjs` films a whole flight with its sound (hangar, helm, anchor, jump, run in, breach, aboard), the ship
flown through her own controls by a scripted pilot; the sound is rendered afterwards from how she flew (`renderFlight`),
since a headless page plays none.

## What she's like inside (`docs/ship_interiors.png`)

A ship's compartments were a building's: plaster-and-skirting walls, a tiled floor, wooden beds and desks, cardboard boxes. A
theme with `space` set (the three in `js/spacedata.ts`, each with its own `accent`) is now drawn and fitted as a ship:

- Surfaces (`js/levelview.ts` `_shipTex`, asked for by `js/leveldesc.ts` as `bulkhead:<accent>` and so on). The bulkhead is
  painted for the wall's whole four metres: a kick plate, a lower panel, a rail in her colour, an upper panel, a strip of
  light over the doors' height, then ribbed plating, vents and trunking. The deck is studded plate with a grating in every
  fourth; the overhead is frames and a cable run; a crate is a corrugated container with her colour banded round it.
- Fittings (`js/leveldesc.ts`): lamps are bars of light let into the overhead; every door has a frame proud of the bulkhead
  with a lit bar of her colour over it, and the sliding leaf two set-in panels and her colour along its foot; her passages
  (`shipTrim`) have frames across them every few metres, trunking and a pipe along each side, and a lit strip let into the
  deck along each edge (unlit on a night level). None of the trim stops anyone or anything.
- Furniture (`js/furniture.ts`, the pieces from `R.bunk` to `R.canister` and the compartments' recipes): bunks, watch stations,
  a plot table, a reactor core, drive machinery, a sick-bay bed, bolted mess tables, galley units, cabin work stations, plate
  benches, stores racking, drums on skids, gas bottles. Each has the footprint and solids of the building's piece it stands
  in for, so compartments lay out as before. Lockers and switchgear cabinets are the buildings' own.

The buildings' themes and the hangar are untouched (the level golden's 31 cases and the furniture golden pass unchanged).
