# Acoustics and ambience

What the game's sound does in a place, and the knobs for tuning it. Three files:

| File | What it does |
| --- | --- |
| `js/acoustics.ts` | The level's acoustic map: zones and portals, built once a level. `listen()` and `hear()`. |
| `js/ambience.ts` | Each place's background sound, synthesized live, heard through the map. |
| `js/gunaudio.ts` | Gunshots (rendered by `js/gunshot-synth.ts`), heard through the map, with traced wall echoes. |

## The acoustic map (`js/acoustics.ts`)

**Zones** are the spaces sound fills: each floor's open tiles, split by walls, and indoors split from out of doors. Each has:

- its **height**: the floor's (`G.Level.WALL_H`), two storeys where it's open to the floor above (a drop in that
  floor) or its rooms are built `tall`, 14 m for the hangar's hall; out of doors, no ceiling;
- its **absorption**: its walls', floor's and ceiling's faces as `js/materials.ts` builds them for the place
  (`FACE_ALPHA` by material: plasterboard 0.05, brick 0.03, concrete 0.02, steel sheet 0.05, plywood 0.12...), what
  stands in its rooms by their type (`CONTENT`, per m² of floor: furnished rooms 0.8, kitchens and corridors 0.5,
  works 0.25; `DEFAULT_CONTENT` 0.4 for floor in no room; a shop's stocked shelves count as furnishing), the
  suspended acoustic-tile ceiling over shops, offices and their corridors (`TILED`, α 0.55; not in the works, the
  stores of goods, the bunker or homes), and the air's own (4mV, `AIR_M`);
- its **reverberation time**, Sabine: RT60 = 0.161 V / A, 0.15–3 s. Out of doors: 0.25 s. (The foundry: offices
  0.7 s, corridors 1.0, its halls 3; a flat's rooms 0.5–0.9.)

**Two bands.** Every surface has its absorption twice: mid (`FACE_ALPHA`) and under 250 Hz (`FACE_ALPHA_LOW`). A panel over
an air gap flexes and takes the lows (plasterboard on studs 0.2 under 250 Hz against 0.05 above, plywood 0.25, a
pane 0.25); mass doesn't (concrete 0.01, brick 0.03); what stands in a room takes 0.6 as much of the lows. Each traced
ray carries both bands' energy along the same path, so a room has two decays: a plasterboard room's bass dies with
the rest, a brick building's rings on (the foundry's corridors 0.8 s, their lows 1.3 s).

**Measured rooms** (`roomAt`): each room's reverberation is measured by acoustic ray tracing, not guessed from its
shape. From a point in it, 500 rays bounce round it in 3D (off its walls on the tile grid, its floor and its ceiling at
the zone's height), each surface taking its α, 35% of each bounce scattered, what stands in the room and the air taking
theirs per metre; through open doors and openings they go on into the next room, out of doors up into the sky and off
the map's edge they're gone. A sphere at the start point catches what comes back: the room's energy response, its RT60
(Schroeder's backward integral) and its level against the direct sound at 1 m (`wet`). `impulse()` makes an impulse
response of it (the first 80 ms as the arrivals caught, then noise shaped to the measured decay, dulling as it goes).
Rooms are measured in idle time once a level's up (`prewarm`, a few ms each), out of doors per 8 m cell when needed, and
a room again when its doors open or shut. Gunshots are rendered dry and convolved with the shooter's room's response;
the ambience's room reverb is the room's response too.

**Portals** join zones: doors (open 0.9 of the energy; shut 0.015, nothing above 500 Hz), windows (insulating glass 0.001, under 800 Hz; a cooler's door 0.002, under 700 Hz; bulletproof 0.0002, under
400 Hz; broken 0.8), openings (open air meeting indoors with no wall), and voids (a drop in the floor). `through()`
has their numbers.

`listen(map, x, y, z)`: the strongest path from where you stand to every zone (Dijkstra on −log level). At each portal
the level falls by what the portal lets through and by how big the opening is against how far it then is to you
(a doorway beside you lets in far more than one across the hall); the brightness is the dullest thing on the way;
`via` is the portal it comes in by (where it seems to come from).

`hear(map, src, lis)`: how one sound is heard: in your own zone, straight (dulled a little, 4 kHz, behind what stands
in the room); from another, by `listen()`'s path; with no way round, through the walls only (0.1, 300 Hz).

## Ambience (`js/ambience.ts`)

A place is a recipe (`RECIPES`, by theme name) of loops (`L`: beds, hums, motors, wind, traffic...), one-shots (`E`,
so many a minute) and spots (sources placed in the level: furnaces, freezers, the festival's stage). Each loop and
one-shot goes on the **in** bus or the **out** bus; each bus reaches you two ways: along its path through the
openings (placed at the opening it comes in by, more so the further that opening is) and through the walls (always a
little, dull). Everything goes into the **reverb of the zone you're in** (a generated impulse response per zone,
crossfaded room to room), partly placed at the zone's middle: at one end of a hall it rings from the hall's length.

`G.Ambience.setOnly([...])` picks what plays (loop kinds, `'events'`, or one-shots by name: `'event:car'`); `null`
for everything.

## Gunshots (`js/gunaudio.ts`)

The report is rendered for the shooter's room (its own reverb in it), heard at you by `hear()` (level, brightness, and
from the opening it comes in by), sent into your zone's reverb (more of it from another room), plus up to six traced
wall echoes (`echoTaps`: rays from the gun, two bounces, any bounce that can see you). Out of doors the rays go 200 m
and echoes up to 1.5 s count (the slap back off far buildings and cliffs); over the Sandia Crest's gorge the rays cross
the open air to its far face (0.3–1.3 s). A shot's louder and brighter down its line of fire (`directivity`: +3 dB
ahead, −4 dB and dull behind), judged at where it leaves for you: the callers pass the aim point.

## Tuning

- `ambience.html`: every place's recipe, indoors to outdoors by hand, each one-shot on demand.
- `G.Acoustics.describe(G.Game.map)` in a level: the zones (area, height, α, RT60) and portals.
- `tools/walkthrough.js`: a walk through a level recorded frame by frame, its soundtrack rendered offline along the
  same walk (the ambience, and with `shots`, gunshots: yours, and another gun's from a room off the route). Each door
  stays shut till the walk comes within 3 m of it, in the picture and the sound (`doors: 'open'` for all open).
- Audio alone renders about 70× faster than real time (`G.Ambience.render`, `renderWalk`).
