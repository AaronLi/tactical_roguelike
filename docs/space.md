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

1. **The base.** The ship stands on the pad. The terminal by it (F) lists six missions: take up to three. Its shipyard tab
   (buying ships, fitting hardpoints and bays) is switched off for now (`SHIPYARD` in js/spaceui.ts; its page is kept).
2. **Aboard.** Walk up the ramp. Seats: the helm (port, forward), the sensor station beside it, a seat under each hardpoint,
   jump seats. Hold F at one to sit, hold F to get up.
3. **Lift off.** At the helm, hold G. Nobody on their feet may be left outside. Flight is first person, from the seat,
   through the glazed airlock and the windscreens:
   - the mouse turns her (right button held: look about instead), W S thrust, A D sideways, Space C up and down, Q E roll,
     X brake, T the next waypoint;
   - the warp drive (`js/space.ts` warpStep): with a target picked (T) and her nose on it (within 3 degrees; inside 10 the
     drive eases her the rest of the way on), it spins up by itself (3.5 s, 2.5 s with the tuned drive) and holds while she's
     kept on it; turning off it spins it down. Spun up, T warps her: flung at the target at up to ten times her old cruise
     speed (11 km/s for the Kestrel) and brought down again to come out 300 m off its hull, going as it goes (a passing ship
     then has its course matched and is the level: zoneClose). Not in atmosphere, nor for a target within 2 km or so;
   - a ring where her nose points and a green ring where she's actually going; every waypoint marked on the view with its
     distance (m, km, Mm, light-seconds: `G.SpaceData.dist`); the navigation screen on the helm's console and on the glass.
4. **The anchor.** Each mission taken has an interspatial anchor 7 to 13 km out. In the ring, under 80 m/s, hold J: the
   drive spools and the stars smear; the level she's going to was laid out (on another thread: `js/prep.ts`), drawn and sent
   to the graphics card while she was still flying, so nothing covers the screen and the pod's walked about in the whole
   way. In the tunnel what's outside is out of sight while the rest of it is sent; she comes out after 4.5 s, or up to 4 s
   more if its shaders aren't all made yet (the driver's own threads: drawing with one that isn't would stop the frame).
   While in space the scene always has four point lights (dark ones made up: `G.R.padTo`, `lightPad`), since one light more
   or less would have every shader made again at the swap.
5. **Boarding.** She arrives 1.7 km off. Ram her hull nose-on at 5 m/s or more (no speed is too high), **anywhere there's a clear stretch of it**:
   port, starboard or the stern quarters. Nothing marks a place for it, and nothing inside stops it: the furniture within a
   couple of metres of the hole is destroyed (`js/shipgen.ts` cut; wreckage across the deck, `js/space.ts` wreck). The navigation screen
   becomes the approach to wherever the nose is pointed: offset, range, closing speed. The hull is cut through there and her
   breaching door opens, but her inner door, at the tunnel's far end just inside it, shuts with every breach: it stays shut,
   for the whole squad, till someone presses its button on the left wall at the top of the stairs (F; its lamp goes from red
   to green). A camera on its far side shows what's out there on screens on the cover either side of the tunnel's mouth
   and beside the button. Then it's the CQB game. Hold G at the helm to undock: the compartment she backs out of
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
| corvette | about 40 x 20 m | the same, larger. 4 guards, one breach response squad | 1 minigun |
| frigate | about 65 x 28 m | adds an armoury, barracks, a sick bay, a magazine, escape pods; the bridge is locked. One security squad | 3 miniguns |
| cruiser | about 100 x 36 m; eight in ten **two decks** with a hall the height of both (below) | adds a galley, a brig, a reactor, a vault; deeper sides split in two. Two security squads, two response squads | 5 miniguns, 1 missile launcher |
| capital ship | about 128 x 36 m, **two decks** | the bridge and cabins on the upper deck, a forward magazine under it, the reactor over the engine room, two stairwells. Four security squads, three response squads, 10 crew | 8 miniguns, 2 missile launchers |

What the board offers goes by how far the squad has got: transports and corvettes first, capital ships from the fifth rank.

- **Her complement** (`G.SpaceSv.crew`, by `G.SpaceData.SIZES`): those who don't fight; light guards posted singly; security
  squads of four, armed and armoured, their chief with the first; breach response squads of three, lighter, who come to
  where the hull is breached (the comms jammer stops them being called).
- **Her weapons** (`HULLGUN`, js/space.ts guns): her point defence is miniguns (six-barrelled rotary guns: bursts of 2.5 to 4 s at 3,000 rounds a minute inside 1 km, 1.5 mrad of their own inaccuracy, the barrels
  spinning while they fire); missiles (6.5 km: they home, a hard turn across the nose shakes one, a turret can shoot one
  down, 24 a hit). Guns fire only on a radar lock, leading where the track has her going. Every round is a real one
  (`rounds`): fired at 1,000 to 1,100 m/s, it flies, and hits only if it really passes within her size. A round that has
  flown 2 km blows itself apart. Her miniguns alternate between her roof and under her keel (the keel ones hang upside down). Each fires only into its own side of her hull, at most 10° past it. All of her weapons can be destroyed from a turret seat.
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
3 km, and who's aboard inside 900 m), ablative plating, a tuned warp drive, a comms jammer (the breach is heard 14 m off,
not 45). The host's fleet is kept in its browser (`fleet`).

## Radar (`js/radar.ts`, `js/radarview.ts`)

A ship knows where another ship is only from what her radars tell her. Every ship carries the same set:

- **Two scanning radars.** These are mechanically steered pulse radars with a fan beam 2° wide and ±45° along the fan,
  each making one turn every 3 s. Scanner A turns about her up axis and gives bearing. Scanner B turns about her
  athwartships axis and gives elevation. A plot is (scanner, angle of the turn, range). Where along the fan the echo came
  from is unknown.
- **Two tracking radars,** port and starboard, each covering its own half of the sky. Each is a turret with a 3° pencil
  beam. A cue on a plot works in three steps:
  - The turret slews to the plot.
  - It sweeps along the fan's long axis inside a range gate and takes the peak (`acq`).
  - It tracks by conical scan. The beam is squinted 1° and nutates at 6 Hz. The echo's modulation over each turn gives
    the pointing error, which is corrected once per turn and rate-aided.

  The track's alpha-beta filter gives the firing solution (`est.p`, `est.v`, `q`).

  A tracker knows its own ship's motion. Each step, before it looks, the turret undoes her rotation since the last step and
  keeps the beam on the point at the gated range as she moves (`stabilise`, up to `TRK.stab`, 200°/s). The conical scan only
  has to follow the target's own motion. When the target crosses toward the other half of the sky, a free tracker on that
  side is handed the track: it slews straight to where the solution has her and tracks. Tested by spinning her under a lock:
  - at 30°/s the lock holds;
  - at 60°/s the lock holds and is handed across;
  - at 90°/s and faster it's lost.
- **What a scanner sees is a map** (`scanStep`). As its beam turns it fills a map of response, a column per degree of its turn
  by 25 m range bins out to 10 km. Each column holds the receiver's noise plus every return in the fan there: the radar
  equation's signal, the beam's gain off its middle, the fan's gain along it, and a fresh fluctuation each look. The map is
  held still in space about the scanner's axis while the ship turns. Peaks are found by cell-averaging CFAR (`cfar`): a cell
  biggest within two columns and three bins, standing 24 times over the noise either side of it in range. Each is refined to
  a centroid and becomes a plot. Two ships closer than a beam width and a few bins make one peak; noise rarely makes one.
  Plots are followed from sweep to sweep as numbered contacts (`associate`: the peaks waiting are matched together once the
  oldest is 60° behind the beam, every peak-contact pair inside the contact's Kalman gate best first, each once; A on the bearing map, B on the roll map), and a
  tracker is cued on a contact's latest plot. The sensor screen draws the maps as PPIs, range as its square root, with the
  contacts boxed; the F8 panel shows each ship's maps as angle by range.
- **IFF.** Each peak's interrogated (out to 12 km) and a transponder there answers with its class and name, by whose it is
  (`answers`; js/space.ts missionAff, kindAff): a civilian's (freighters, cutters, liners) always; a navy's (warships, flying
  wings) only a navy's interrogation; pirates' (and a ship they've taken) never; the squad's only while its transponder's on
  (I at the sensor station; off by default: she runs silent). So to the squad, a navy or pirate mission ship is an unknown;
  it's known for the target only if it answers to the mission's name. Chaff and missiles don't answer. On the sensor screen the
  mission ship's contact is red (TGT and her name), civilians grey-blue, unknowns amber. A hostile's fire control cues on the
  nearest contact that doesn't answer as a civilian, and moves to a much nearer one when it appears.
- **What has a return:** the squad's ship, the mission ship, the zone's ships in view (each from its own drawing), chaff,
  and missiles in flight (0.5 m²). Not yet: stations, anchors, the planet, rounds.
- **A tracker gets everything in its beam and range gate** (`beam`): the conical scan steers to their power-weighted middle,
  and the gate follows their power-weighted range.
- **Chaff** (V at the helm or the sensor station, 12 loads; `chaffGo`). A cloud keeps the ship's velocity plus 22 m/s. Its
  return blooms to 250 m² in about half a second, holds for 5 s and fades. It's a peak on the scanners' maps and more return
  in a tracker's beam. Tested on the frigate's lock at 670 m, launching while pulling away at 60 m/s: her tracker went to
  the cloud and her estimate drifted off at the ship's speed, and her guns stopped hitting.
- **Where they're mounted.** Each ship has two scanners, each on a mast. The 'y' scanner stands over her roof: it sees round her
  horizon, and below her deck only as far as its mast lets it see over her sides, so it's blind under her keel. The 'z' scanner
  stands off her bow and turns about her length (roll), its fan lying along her length: a plot is the angle round her and the
  range. It sees all round her ahead of her bow, and is blind astern of her where her hull is in the way.
  How far past its mast's plane each can see is the angle over the hull's edge from the mast's top (`mask`). Her two trackers
  are on her flanks, each seeing its own half of the sky and 10° past it. A cue on a plot near her middle line (a 'z' plot
  over or under her, a 'y' plot ahead or astern) can't tell which side the target is on, so both free trackers sweep their own halves of the fan and the first to find the target keeps it. The mission
  ship's mounts are set on her plating by raycasting her hull (`fitMounts`). Her hardware is drawn and moves with the radars
  (`radarKit`): lattice masts, antennas turning with their sweeps, and each tracker's dish pointing along its boresight.
- **Targets** are the mission ship and every ship of the zone that's shown, each with a return from her own drawing (the
  stand-in far off, her own hull near).

Detection follows the radar equation: SNR ∝ σ/R⁴, so range ∝ σ^¼. A ship's radar cross-section σ comes from her hull's own
triangles. Each facet gives a specular flash toward its normal and a little diffuse return. The result is tabulated by
aspect, every 5°, and cached per hull. Turning her nose toward a scanner shrinks her return, and so the range at which
she's painted. The Kestrel is about 12 m² at 30° off the nose (painted at 6 km) and about 400 m² broadside (15 km).

- **The mission ship's fire control** cues a tracker on the newest plot of the squad's ship. Her guns and missiles fire
  only while a tracker holds a lock (`q ≥ 0.15`). They aim at the predicted point, and a hit is judged against where the
  squad's ship really is, so a poor track misses.
- **The sensor station's hologram** (js/radarview.ts holo) takes the place of its screen: a sphere's worth of space (its shell
  not drawn) centred in front of the seat just below the operator's eyes (placed when someone first sits there).
  - **What's in it.** Her ship at the middle (a cone, her nose its point, a fin on her back: how it's turned reads off her).
    Every track her radars hold round her where it is (its true way from her, its distance as the square root, 10 km at
    the edge): a 3D track solid and coloured by her assessment (hostile red, suspect orange, watch yellow, neutral grey,
    civilian grey-blue, friendly green); a contact only one scanner holds drawn as the arc it could be on (its fan at its
    range, where her hull doesn't hide it). Her scanners' fans sweeping out from the middle (cyan bearing, magenta roll).
    Each tracker's beam a line from the middle along its axis as it is that instant (the conical scan's circling shows), out
    to its range gate (a ring), amber acquiring and red tracking; while it slews and sweeps, the strip it's searching dashed.
  - **Radar warning:** each ship's radar on her, at the edge the way it is (her warning receiver hears its direction, not
    its range), one marker a ship for the most it's doing: a tracker locked on her a pulsing red chevron with a dashed line
    in to her and LOCK; a tracker sweeping for her amber, TRK; a scanner's beam going over her a brief amber ping, SRCH,
    fading over a second (js/radar.ts litTrk, paintsOn).
  - **Sector search** (js/space.ts scanKeys, secSet; js/radar.ts scanStep `sec`): **1** and **2** are the bearing and roll
    scanners. Held, a scanner goes between turning round and searching its sector (back and forth across it, turning at its
    edges); tapped, it's the one the keys work (tapped again, none). **W**/**S** widen and narrow its sector, **A**/**D** turn it
    (port and starboard; for the roll scanner, round her one way and the other), as it searches if it is. In the corner, each
    search radar's mode (ROUND, or SECTOR with its width and direction) and which the keys work. In the hologram, its search
    cone: the space its fan sweeps across its sector (a patch at the edge and the fans at its sides), brighter for the one the
    keys work, fainter while it's still going round (a preview to set before switching). Everyone aboard gets it (`ssec`,
    five times a second at most while it's set). A sector's revisit is there and back across it (`perOf`), so what's in it is
    seen often (the frigate at 2 km in a 37 degree sector: two looks a second against one in 3 s); a peak at its edge is
    compared only with the fresh columns beside it, and one seen again at once (its edge crossed there and back) is taken
    for the same contact.
  - **Range:** rings in her plane at a quarter, half and all of the range shown, each named; the wheel zooms the range at the
    edge through 0.5, 1, 2.5, 5 and 10 km (anything further sits at the edge).
  - **Sitting down goes straight into it** (`holoFocus`): the world blurs out by degrees (js/render.ts focusBlur, focusAmt)
    and the hologram rises out of the console and opens (0.6 s) to just under the middle of the view, the view eased onto
    it. The rest of the screen's UI is put away, and the mouse is let go (still counted as captured: js/game.ts holoCursor,
    softLocked) to work its own cursor: a small ring where the mouse is, which slides onto a track under it and opens into a
    halo round it in the track's colour, the track named over it. A left click cues a tracker on it (`srcue` to everyone
    aboard); dragging with the right button turns the hologram; a tap of the right button drops the trackers.
  - **Out:** getting up (hold F), or Esc (the pause menu); holding **G** steps out to look round the room (the hologram
    stays, below the eyes; the middle of the view points at a track, the right button held turns it) and back in. The deck
    plan the deck scanner gives is behind **M**.
- **F8** shows a ship's radars, each tap the next ship's: the squad's (from where you are), the mission ship's, then the
  zone's ships within 12 km, nearest first (each has its own radars there: scanners, trackers and a transponder, but a
  civilian has no fire control), then off. It replaced the echo view, still at `?echoes`. On another ship's radars, the camera
  is off her quarter looking at her. Across the top of the screen is her radars' pipeline, a row per scanner, four stages:
  1. **Raw return:** her map as the sweep left it, in dB over the noise.
  2. **Filter:** each cell over the noise round it in range (CA-CFAR's ratio), orange over the threshold, this sweep's peaks
     ringed.
  3. **Track:** the plots of the last eight sweeps, each contact's joined; hollow while it's been seen once.
  **Kalman filters** (`KF1`, `KF3`, constant velocity, up to some 30 m/s² of acceleration): a contact's angle and range each
  have one (its sweep-to-sweep gate is the filter's: chi-squared, 16), each 3D track has one in full 3D, and each tracker's
  firing solution has one. A measurement's uncertainty is along the line of sight (range bins: small) and across it (angle
  times range: larger). A locked tracker's measurement is one more update of the 3D track it falls in (its gate: 25), so the
  scanners' pair and the tracker are fused into one track; one in no track makes a track of its own. A cue on a contact in a
  3D track whose filter has settled points a tracker straight at where the track has it going, without the sweep along the
  strip: so a crossing target is locked (the sweep took long enough for it to leave the strip).
  Against the truth: the mission ship's track on the squad's ship at 650 m with her tracker fused in, within 4 m (it was
  about 120 m from the scanners alone); far ships settle to tens of metres, their velocities to 10 to 20 m/s.
  4. **Correlate 3D** (`fuse`, ten times a second): a 'y' contact is on an arc (its bearing and range known, how high not) and
     a 'z' contact on another (its angle round her and range known, how far fore or aft not). Each pair whose ranges could
     agree is solved for where their arcs come nearest; a pair within 4% of the range (40 m at least) is one thing, a
     numbered 3D track (F), best pairs first. Drawn in
     3D round her, turning slowly: the arcs (cyan A, magenta B), the tracks with their paths and 10 s ahead dashed, and each
     tracker's solution with its path (red). Against the truth in a pass at 70 m/s: velocities within 10 to 30 m/s, positions
     within 2 to 4% of the range at 7 km but 15 to 20% at 700 m (the contacts are up to a sweep old). Each tracker's solution's
     path and 10 s ahead are also drawn in the world.
  Each tracker has a row of its own: its raw return (tracking: the return round its nutation circle, bulging toward the
  target, and the power across its range gate; acquiring: its sweep along the strip), its discriminator (the angle errors a
  revolution each, in beam widths; the range gate's error; S/N), its error and solution quality over 8 s, and what it's on
  (the 3D track, its IFF answer, range, closing speed, solution).
  5. **Assess** (`assess`): hostile or not, every track she holds, as she sees it. Its score is its transponder's answer
     (to the squad's ship the mission ship is a known hostile, 0.7, and to the mission ship the squad's is; no answer 0.3;
     another name 0.2; a civilian 0.05), plus how fast it's closing (from 10 m/s), how near it is (inside 4 km), whether its
     course passes inside 800 m within 90 s, and whether it's tracking her (her radar warning receiver hears a tracking radar
     on her, and from where: +0.45). From 0.6 it's SUSPECT; held for 3 s, HOSTILE; under, WATCH (from 0.35), NEUTRAL or CIV.
     Her fire control cues only on what's HOSTILE, and lets a lock go (after 2 s) when what it's on is no longer HOSTILE or
     SUSPECT: a tracking radar on a ship is taken as hostility, so she keeps hers off what isn't. Tested: the squad's ship
     silent and still at 2.5 km is WATCH and left alone; running in at 90 m/s it's SUSPECT at once and HOSTILE 3 s later; its
     own tracker locked on her makes it SUSPECT, then HOSTILE, and she locks it back.

  The squad's ship is drawn in blues (cyan fans, teal acquiring, blue tracking) and every other ship in reds (red fans, amber
  acquiring, red tracking). Another ship's tracker gets a marker on the screen at its turret (ACQ, TRK, or a pulsing TRK
  LOCK when it's on you): a beam pointed at you is only a point from where you sit.
  It shows the scanners' fans with trails (none of a fan drawn where her own hull hides it), each tracker's cone, boresight and nutation ring, the plots, the squad ship's
  detection envelope against the mission ship's scanner, and a panel with her RCS toward it, the range she'd be painted at
  and whether she's painted or locked.

Not yet: stealth fittings, infrared and optical sensors, jamming, and the radar in co-op. Each client runs its own radars
with its own noise, so plots can differ between screens.

## Checking it

- `node tools/ship_dump.mjs <small|medium|large> <seed> [level] [obj]`: a generated deck plan as text.
- `node tools/ship_halls.mjs [seeds] [--hall=bay|grove|works|mall]`: how much of each cruiser's hall can be seen from one place in it.
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
hull (`js/spaceserver.ts` populate picks the sites, clear of each other and of where the squad's ship comes out of the jump lying off; `js/space.ts` raidPods draws
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

## A cruiser's halls (`sp.hall`)

Eight cruisers in ten have **two decks** and a compartment or two the height of both (`js/shipgen.ts` HALLS, halls; which, if any,
goes by her seed alone, `G.SpaceData.hallOf`, so every machine lays her out the same without being told). The rest are as they
were, one deck. A hall is open from the lower deck's floor to the upper deck's roof. On the upper deck a **gallery** runs round it
against the walls, a tile (2 m) wide, a steel rail along its edge (open between its rails: seen and shot through, as a foundry's
catwalks; a liner's court has glass balustrades instead), looking down on the floor; a flight or two inside the hall climbs to it, and both decks have doors into it.

| Hall | Where | What's in it |
| --- | --- | --- |
| hangar bay (`bay`) | right across her amidships, about 30 x 32 m. The spine runs into it at each end, and crosses it on the upper deck as a bridge of grating | containers, pallet racking, forklifts, stacked crates and drums |
| arboretum (`grove`) | down her port side amidships, about 30 x 12 m | a fountain, tanks, sheds, raised beds with fruit trees, hedges, junipers and boulders, benches |
| promenade court (`mall`) | a **cruise liner's** (her spine is cut to fit it: a compartment's length forward of it and one aft, a hull of 94 to 98 m): right across her, hull to hull, 41 to 49 m long and 33 m across. A **cross passage** 3 m wide runs right across her against its forward wall (the end away from its mezzanine), on both decks: the spine runs into it, and the compartments forward of it open onto it. **No gallery round it**: a **mezzanine** across its after third (12 to 14 m deep, a lounge and a bar's tables), all of it open to the roof forward of that. The spine crosses the open part on the upper deck as a bridge to the mezzanine (the only way aft from her bridge and forward cabins on that deck), and a pair of **grand flights**, 4 m wide each, climb to the mezzanine's edge either side of it. **Side doors**: on the lower deck a door from the cross passage into the court to port and to starboard, halfway out to her sides, besides the spine's in the middle; and through its after wall a door either side of the spine's into the compartment beyond (locked where that's an armoury or a vault) | pale marble underfoot, a colonnade of slim square columns clad in black stone with a brass inlay down each face (`gcolumn`: furniture, not bulkhead), pendants of three rings of light over the open part, glass balustrades. A fountain in the middle of the open part with benches and palms round it, a brass sculpture forward of it; boutique islands under canopies (`pavilion`), display cases, free-standing screens of walnut slats, a cafe's tables, sofas and armchairs, a piano, palms in black planters: about one thing to every five tiles of floor. No frames on its floor, but standing **floor to roof** in its open part: two piers four metres square, one to port and one to starboard, and a fin of wall six metres long across from each |
| machinery halls (`works`) | one to starboard aft, next the engine room, a smaller one to port forward, about 20 x 12 m each | reactor cores, presses and mills, screens of panels, coolant tanks, turbines |

So that nowhere on a hall's floor sees all of it: columns stand under the gallery's edge (up through both decks), **frames** (lengths
of bulkhead two or three tiles long) stand free on the floor, turn and turn about, one half across the spine's line at each end of
a hangar bay, and most of what's stowed there is taller than a head (`js/furniture.ts` shipHalls; nothing is put down that would
shut any of the floor off, and the tile under the gallery is kept clear all round). `node tools/ship_halls.mjs` measures it: from
every place on each hall's floor, the share of that floor in sight. Over 32 halls it's at most 71%, and about 25 to 35% on average
(a liner's court: at most 47% over eight).
Her ordinary stairwells are moved clear of the halls (one or two, toward her ends), her lower deck is her working one (armoury,
vault, magazines, brig), and her people live on the upper (quarters, mess, galley). High-bay lamps hang under the hall's roof
and light the gallery too. On the terminal a cruiser with a hall says so, and the objective's panel aboard names it.
A cruiser with a promenade court is a **cruise liner** all through: she takes a theme of her own (`G.SpaceData.LINER`, never drawn
by lot; `js/level.ts` gives it to her whatever she was offered as), modern: her bulkheads walnut slats over a lit plinth, a brass
inlay, smooth stone above with a cove of warm light; her decks charcoal carpet; her ceilings dark with a slot of light across
each panel (`js/levelview.ts` _shipTex: lbulkhead, ldeck, loverhead); her light warm and low.
Outside (`js/shipmodel.ts`, the 'liner' language) she is white: a raked bow, rounded shoulders, a blue keel and band at her waterline
with a line of brass over it, a glazed roof over the open part of her court, two set-back tiers of superstructure aft of it with a
band of lit windows round each, a raked blue funnel, a wheelhouse tier over her bridge. She still carries a cruiser's guns.
`?board=large&seed=11` is a hangar bay, `&seed=6` an arboretum, `&seed=1` machinery halls, `&seed=9` a liner's court, `&seed=3` none;
`node tools/ship_dump.mjs large 7 2 artifact --hall=bay` prints one of any seed (`--hall=` for none).

## A liner's shelter, and holding her (`obj: 'defend'`)

On a cruise liner's upper deck the compartment aft of her court to port is her **shelter** (`meta.shelter`, role `shelter`): one
door, through the court's after wall at the back of the mezzanine; none onto the spine. Benches round its walls.

On every screen she is a **luxury cruiser** (the theme's name, the board, the objective's panel; `G.SpaceData.className`), and she
has **no guns on her hull** (`gunsOf`: none drawn, none manned, "unarmed" in the panel) and no gun control, magazines, barracks
or brig inside (`js/shipgen.ts` PROGRAM liner: a security office and armoury, a purser's vault, sick bay, galley, mess, cabins,
baggage under her bridge).

A liner is a **high-security ship**: her own people are a civilian ship's (security guards and officers, not a navy's), with two
more guards and a security squad more than a cruiser's (34 armed aboard one, in the simulation), and boarding her is an attack
like any other: her cameras, her alarm, her response teams. Only on the one job below is she expecting the squad.

A liner on the board is one of three jobs, a third each by her seed (`G.SpaceData.offers`): the job she'd have been anyway
(an artifact or a wanted officer, against all of that); **retake her** (`hostage`: pirates hold her, her people tied in her court);
or **hold her** (`defend`, `js/spaceserver.ts` defendTick):

- **There's been a fight already.** Ten of her security and eight pirates lie dead about her from the start (not in the shelter;
  nobody's kill in the debrief): why only a handful of her people are left.

- **She's expecting the squad.** Boarding her is no attack: no alarm, no drill, her hull guns hold their fire, nobody carries a
  keycard. Her passengers and hands (her class's civilians and four more) are in the shelter from the start.
- **Her security** (four, one more for each officer past the first; rifles), each with a rank and a name of their own (a Security
  Lead, Security Officers, a Senior Security Officer; family names from `G.SpaceData.STAFF`: what they're called wherever a
  title shows, named in the radio call when the squad comes aboard, and in the feed when one of them shoots a pirate or is shot:
  `bn`, who did it when it wasn't an officer), wait in her court, on the squad's side (`ally`,
  `js/server.ts` foesOf): the squad is no target of theirs, a shout doesn't order them about, they aren't counted among the
  hostiles left. They fight the pirates where they stand. Alone they hold the court for about two and a half minutes.
- **Her court, its mezzanine and her shelter are armoured**: no breach site opens into the court or within a cell of it along her
  side (`G.ShipGen.sites`: the squad's ship and the pirates' pods both come through her forward and after compartments or her
  cross passage; 85 to 102 sites a liner), and none of the three ever loses its air (`vent`).
- From when the squad is aboard there are **20 seconds** before anything comes (`G.SpaceData.DEFEND.lead`: counted down in the
  panel, to get to her court in). Then, for three minutes (180 s, 5 pods, the first 2 s in, then every 39 s or so), a pirate pod comes through her hull on her lower deck, clear of the squad's ship and of the pods already in her. Its
  boarders (three, one more for every three levels of the mission's danger and for each officer past the first) come out inside her
  and make for the shelter, fighting whoever they meet. From her hull to the shelter's door is about forty seconds unopposed.
- Pirates shoot her passengers as they'd shoot anyone not their own (Sides, below). One shot down is a casualty, living or not:
  what counts is how many are still on their feet.
- When the time is up and the last pirate aboard is dead, down or tied, she's held: the fee, and 120 for each of her people unhurt.
  If the last of them is shot down first the job has failed.
- The objective's panel counts the time down and shows the pods come, the pirates aboard and the passengers unhurt.

`?board=large&seed=9&obj=defend&dock` starts one aboard. `node tools/defend_sim.mjs [passive|win] [seed]` runs one in node (the
simulation alone): passive, the officer stands where he came aboard and the pirates reach the shelter; win, every boarder dies
twelve seconds after he comes aboard and she's held.

## Sides (`js/server.ts` facOf, npcFoes)

A ship's people are of a side, by how they're dressed (`wear`): **pirates**, a **navy's**, a **civilian ship's** armed hands, and
the **unarmed** (passengers, crew who don't fight).

| | fights |
| --- | --- |
| pirates | a navy's people, a civilian ship's armed hands, and the unarmed (not those tied: hostages are worth more alive) |
| a navy's people, a civilian ship's armed hands | pirates. Never each other, never the unarmed |
| the unarmed | nobody. They **run** from a pirate in sight within 12 m (`civFlee`: away from the pirates, a few seconds, then hide or cower where they've got to; again when one comes in sight again), leaving wherever they were sheltering |

Everyone armed still fights the squad, and a building's suspects are of no side: nothing there has changed. It only comes into it
when pirates are aboard with someone they'd fight (so every other level runs exactly as before): then each of them has the other
side's people within 45 m to pick a target from as well as the squad, by the same eyes and the same rules (nearest in sight first,
the unarmed after anyone with a gun as near), takes cover from them and shoots at them as at an officer. A shot at one of another
side is settled by the host: each round lands with the chance its aim gives it if the way from the muzzle is clear, and takes
near half of a person's life (a pistol's a third, a pellet a seventh). They fight where they meet: nobody goes hunting another
side through the ship. Checked in the simulation: eight pirates put in a navy cruiser's busiest compartment left five of hers
down and one dead for one of theirs in the first quarter of a minute, and nobody picked a target on their own side.

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
seed, on the navigation screen by name. Come up within 500 m of one, a fifth nearer her than the ship that's the level, once she's ready (every one within 5 km is laid out, drawn and sent to the graphics card in the background, nearest first, and kept while the squad's in the zone: zoneReal, zonePrep; her layout's made on another thread, js/prep.ts), or within 400 m whether or not, and the squad's ship matches her course:
the host makes her the level (`tboard` in `js/spaceserver.ts`; the zone is then drawn from her, turning when she turns) and the
ship left behind goes on her way as one of the zone's others. Nothing is drawn over this: no wipe, no loading screen. Within
five kilometres a ship of the zone's is already drawn as her own hull (`zoneReal`: her level laid out from her seed, for its
outside only), and when she becomes the level the squad's ship is put where she was by her, heading as she was (`carry`), so
the only thing that changes is that she now has an inside and a crew. She can be boarded like any ship: a breach is an attack whoever
she is (her crew fight, her response squads come, and her guns, silent till then, open up when the squad's ship is off her
again). What's in her holds is salvage, paid at home with the rest. Going back to the mission's ship is the same thing the other
way: what was done aboard her stands (objectives, keycards, holes in her hull, vented compartments), but her crew are at their
posts again unless she was already cleared. There are no ships that are only to look at: round the base there is none.

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
with her speed, harder while she's gaining or losing way), the warp drive (spinning up and at warp: a note under the floor and a thin singing over
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
