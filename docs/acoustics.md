# Acoustics and ambience

What the game's sound does in a place, and the knobs for tuning it. Three files:

| File | What it does |
| --- | --- |
| `js/acoustics.ts` | The level's acoustic map: zones and portals, built once a level. `listen()` and `hear()`. |
| `js/ambience.ts` | Each place's background sound, synthesized live, heard through the map. |
| `js/gunaudio.ts` | Gunshots (rendered by `js/gunshot-synth.ts`), heard through the map, with traced wall echoes. |
| `js/footsteps.ts` | Footsteps (baked by the contact synth), heard through the map like gunshots. |

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

The ambience plays in its own audio context (`G.Audio.ambCtx`), so its own render thread: its loops and its room reverb are
steady work that shares nothing with the shots, handling and footsteps (which share the rooms' measured reverbs in the
game's context). Volume, mute, the loading screen's hush, the listener and the watchdog act on both.

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

**Distance** (`G.Audio.far`): a shot, its echoes and everything placed fall off gently near (^0.6 against 2 m: a fight
across a room keeps its punch) and from 15 m as sound does in the open, 6 dB a doubling, with no floor (250 m: ~35 dB
under 2 m). Out of doors the reverberation round the source (what reflects off what's near it) falls off the same way;
indoors a room's fills it, as loud anywhere in it.

## Handling sounds (`js/handling.ts`, `js/audio.ts` `route`)

The guns' handling sounds are the contact synth's (`tools/contact-synth`), baked dry by `npm run build` (`tools/bake_audio.mjs`: git-ignored, like the models; only when the synth has changed; both banks then packed into one gzipped bundle the game downloads once and keeps, `assets/audio/bundles/audio.rtb`, read through `G.AudioBundle` as the models are through `G.Bundles`) into
`assets/audio/handling/<family>/` with a manifest of each clip's anchor (the moment the game's cue lines up with). A gun's
family is how its action and magazine work (AR-15, KV-47, MP5, G19, SR-25, blowback SMG, bullpup; a manual action's bolt
or pump; rounds by hand; and from `scenes/no-family.ts` a revolver's cylinder, a break-action's hinge, a belt-fed's feed
cover and belt, an M1's clip); a gun with none (the crossbow) keeps the recorded foley. A revolver, break-action or
belt-fed reload plays its parts on its animation's own moments (`Handling.cues`: the crane on its stop, the rounds
seating, the latch; the cover up, the box off and on, the cover slammed) instead of a magazine out and in. A rack or release starts its clip early by its anchor
so the rear stop or the slam lands on the animation's; the reload's cues keep the timing tuned with the recordings.

Everything handled (the bank, the recorded foley, doors, spent cases, dropped magazines) goes through `route`, the same
way to your ears as a gunshot's: your own hands straight to you with your room's measured response round you; anything
placed from where `hear()` says it reaches you, its own room's response heard the same way, and a sound from another room
filling yours. The send into a room is the sound's level scaled to 1 m (the responses are measured against the direct
sound at 1 m): your own gun's ~0.4 m off, so its room sits ~8 dB further down than a shot's from a metre. A dropped
magazine plays that gun's simulated drop (by how full it was, landing a random way) from its first contact on a hard
floor, and its later bounces are in that; on carpet or grass it's the case pings, soft.

## Footsteps (`js/footsteps.ts`)

Every step anyone takes is a clip from the contact synth's footstep model (`tools/contact-synth/src/scenes/footsteps.ts`
baked by its `scripts/footstep-bank.mjs` into `assets/audio/footsteps/` when `npm run build` runs `tools/bake_audio.mjs`): the sole
(boots, sneakers, dress shoes), the floor under the foot, the gait (creep, crouch, walk, run), four takes of each, and
the kit's rattle (light, heavy) laid over the step apart. The clips carry their level: a carpet step is 12 dB under
concrete, a run 8 dB over a walk, a creep 14 dB under. `manifest.json` gives each clip's anchor (where the foot
strikes); a step starts there.

- **When:** another's step lands when their rig puts a foot down (`js/rig.ts`: the gait's phase, where the foot's
  lift runs out), so it's in time with what you see; yours each time your view's bob comes down (`self`). Everyone walks at a
  real cadence for their speed (`cadence`: ~2.1 steps a second at the game's 1.9 m/s walk, ~2.65 running), the legs, the
  bob and the steps alike.
  Not on a ladder or a zipline, prone, down or dead, or standing still.
- **Who:** each a walker baked apart (`footstep-bank.mjs` BAKE: a sole and a weight): you and the other officers, and
  the armoured, in boots with armour and heavy kit (~105 kg); suspects in boots (~80 kg), light kit when armed; civilians
  in the shoes their model wears (`js/rig.ts` shoe: white trainers as sneakers, brown as leather dress shoes with a hard
  heel, black as everyday rubber-soled shoes; ~70-75 kg) (`feetOf`). A heavier walker's step is heavier and louder.
- **Gait:** crouched; creeping when steadied or under 1 m/s; running with the weapon lowered or over 2.5 m/s; walking
  otherwise (`gaitOf`).
- **Floor:** `G.Casings.surface` (a room's floor, a home's, out of doors) mapped to the synth's (`FLOOR`): concrete,
  pave and flagstones, tile, vinyl, hardwood and parquet (and a home's bare floor), carpet, dirt and soil, grass.
  The synth also has gravel, dry leaves and a steel deck, for floors the game doesn't mark yet.
- **Heard:** by `hear()` (as loud and as dull as the way to you lets it, from the opening it comes in by), falling
  6 dB per doubling of distance past 1.5 m, not played past 30 m, and sent into the walker's room's measured response
  (`G.GunAudio.roomVerb`) at half the level. Yours from under you, at `SELF` (0.45), and into the room you're in
  (`listenerVerb`) as your own gun's handling is. `GAIN` (2) is the overall trim.
  At most 24 at once.

## Tuning

- `ambience.html`: every place's recipe, indoors to outdoors by hand, each one-shot on demand.
- `G.Acoustics.describe(G.Game.map)` in a level: the zones (area, height, α, RT60) and portals.
- `tools/walkthrough.js`: a walk through a level recorded frame by frame, its soundtrack rendered offline along the
  same walk (the ambience, and with `shots`, gunshots: yours, and another gun's from a room off the route). Each door
  stays shut till the walk comes within 3 m of it, in the picture and the sound (`doors: 'open'` for all open).
- Audio alone renders about 70× faster than real time (`G.Ambience.render`, `renderWalk`).
