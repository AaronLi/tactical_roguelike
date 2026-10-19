# New level (environment) checklist

A level is an environment (a theme) plus a layout. Everything in it is generated from a seed on every peer,
so anything random in generation must come from the level's rng (`r`, or a `G.U.rng` seeded from
`map.seed`), never `Math.random`. Test muted (`G.Game.setMuted(true)`).

## 1. The theme: `js/data.js` `G.THEMES`

- [ ] **`{ name, layout?, entry?, home, reflect, floor, wall, crate, fog, light, ceil }`:**
  - `home`: 1 is all residential, 0 is all work rooms; in between mixes them (`furniture.js` HOME/WORK)
  - `reflect`: how hard the surfaces ring (gun echoes, `gunaudio.js`)
  - `entry: 'vault'`: the entrance gets a vault door
- [ ] **Route map:** give it an icon path in `js/route.js` `ICON` (a 14 px glyph centred on 0,0). Its
  `wall`/`floor` colours tint its node.
- [ ] The route can now roll it as a node. Check a few `G.Route.gen(seed, act)` maps show it.

## 2. The layout: `js/level.js`

- [ ] **Pick or write a layout:**
  - `layApartments` (hallway + units)
  - `layWarehouse`
  - `layHouses`
  - `layRooms` wrapped in `approach()` (rooms and corridors with an outside lot)
  - A new one returns `{ W, H, t, rooms, doors?, ringDoors?, out?, fences?, spawn, units? }` on the 2 m
    coarse grid:
    - `t`: 1 wall, 0 floor, 4 fence/furniture
    - `out`: open to the sky
    - doors: `[x, z, axis, open, mirror, kind]`
- [ ] **It starts outside the target** (or, like the apartments, at the threshold). The spawn room is outdoor
  (`out: true`, type `street`/`lot`/`dock`) or a landing. There's a real entrance:
  - a door (double, or a special `kind`) under a lamp
  - porch lanterns are added automatically for z-axis doors between outside and inside
- [ ] **Outside areas** are fenced at the map edge (fence tiles + the `fences` list), and `out` is set for
  every outside tile including the fence row.
- [ ] **Every room is reachable** from the spawn, over 40+ seeds and levels 1–6:
  ```js
  for (let s = 1; s <= 40; s++) { const m = G.Level.generate(s * 1013, 1 + (s % 6), TH);
    const f = G.Level.flow(m, [[m.spawnRoom.cx, m.spawnRoom.cz]]);
    for (const rm of m.rooms) if (G.Level.tile(m, rm.cx, rm.cz) === 0 && f[rm.cz * m.W + rm.cx] < 0) console.log('unreachable', s); }
  ```
- [ ] **No generation errors** at any level (sizes grow with level).
- [ ] **Size:** comparable to the others: 40–75 fine cells a side. Not so big the suspects are lost, not so
  small there's no flanking.
- [ ] **Text check:** print the fine grid as text (walls `#`, doors `D`, fences `|`, outside `,`) and check
  the shape:
  - walls thinned to one cell between spaces
  - doors in walls, not floating
  - corridors at least 2 m wide
- [ ] **Units** (if each part must be cleared separately, like the apartments): rooms carry `unit`, and the
  layout returns `units`. Check:
  - `map.unitAt` covers every floor cell of a unit, including its internal doorways
  - it never covers the shared hallway
  - the objective line shows

## 3. Furniture and decoration: `js/furniture.js`

- [ ] **Room types:** every room type the layout uses exists in `ROOMS`:
  - fields: `must`, `wall`, `center`, `small`, `floor` (`wood`/`tile`/`carpet`/`grass`/`pave`/null), `out`
  - `bare: 1` skips furniture (corridors, landings, alleys)
- [ ] **New pieces:** in `R` with `{ w, d, boxes, build(k, v) }`:
  - `boxes`: collision; `[x, z, w, d, h, y0?]` in the piece's frame, back at −z against the wall
  - `cover: 1`: can be hidden behind
  - `small: 1`: corner clutter
- [ ] **Open pieces** (shelving, racking) give `ray(v)`: what stops rounds and sight. You must be able to see
  and shoot through the gaps, and not through the solid parts.
  - Anything random in what's on it comes from a `G.U.rng` seeded by `v`, not `k.rnd`, so the host's ray
    boxes match every peer's meshes.
  - Test with `G.Level.raycast` through the gaps and through the loads.
- [ ] **Placement:**
  - doorways and corridor mouths stay clear
  - the map stays connected (`tryBlock`)
  - nothing blocks the spawn's way in
  - nothing clips through walls (pieces against a wall slide to its thinned face)
- [ ] **Floors:** each room's floor texture covers it, with no z-fighting. Outdoor floors run under the
  fences to the edge.
- [ ] **Walls:**
  - wall art, skirting and windows on indoor walls
  - outside faces show windows (none for a bunker)
  - pitched roofs only on homes (`th.home >= 1`)

## 3b. Windows

- [ ] **Placement:** `placeWindows` gives a reasonable number: indoor/outdoor windows on thin walls between
  inside and outside floor, outside-view windows on outer walls. None by doors, behind tall furniture, or
  behind a cabinet or the weapon case.
- [ ] **Rays through a window:**
  - at eye height, `G.Level.raycast(..., { glass: true })` crosses the pane and carries on
  - without `glass`, it stops at the pane
  - at sill height, it stops at the sill
- [ ] **Breaking:** shooting a window breaks it for everyone, and late joiners see it broken (`welcome.glass`).
  `G.Level.see` gives 0.4 through intact glass and 1 once it's broken.
- [ ] **Look:** through an indoor/outdoor window you see the real outside. Through an outside-view window you
  see the view, and an apartment block looks high up. Pictures and clocks aren't hung over windows.

## 4. Lighting and atmosphere

- [ ] Lamps per room (`map.lights`; racking halls get a grid, hallways a row). Only the 12 nearest the
  spawn are real point lights, so check the far end isn't pitch black where it matters.
- [ ] Outside: lit by the entrance lamp. Check the approach is readable but dark.
- [ ] Fog and light colours suit the theme. Check the skybox/backdrop from outside areas looks right (the
  exterior shader draws ground and streetlamps beyond the walls).
- [ ] Ceilings everywhere indoors, none over `out` tiles. Rounds fired up outside keep going.

## 5. Sound

- [ ] **Surfaces** (`js/casings.js` `surface`): casings and magazines land with the right sound
  (`wood`/`tile`/`concrete`/`grass`/`carpet`). Outdoor floors count as their material.
- [ ] **Echo:** gunshots ring for the theme's `reflect`. Open spaces leak more (`gunaudio.js`
  `acousticsAt`).
- [ ] **Impacts near you:** walls, wood (doors, furniture), metal, soft ground (`G.Audio.impactAt`).
- [ ] **Doors:** opening and kicking are heard by suspects nearby. Special doors make their own noise.

## 6. Gameplay placement: `finish()`, `js/server.js`

- [ ] **Suspects** spawn in rooms away from the spawn (`enemySpots`), spread out, never in the spawn room
  or its approach. With units, every unit gets one first.
- [ ] **Civilians** are placed, and hide or cower sensibly in this layout.
- [ ] **Cover spots** (`map.cover`) exist beside cover furniture; corner spots (`wallSpots`) along walls.
  Suspects use them (watch a firefight).
- [ ] **Weapon case:** about 40% of levels. It lies along a wall away from the spawn, never in a doorway.
- [ ] **First aid cabinets:** about 35%, indoors only, on a wall at chest height, not by a door.
- [ ] **Boss:** on a boss node (every 10th level, `G.Route.isBoss`) the Kingpin spawns sensibly (`map.extract` is the
  farthest room).
- [ ] **Doors:**
  - single and double doors open, close and kick
  - the open leaf blocks sight and rounds beside its hinge
  - special kinds (vault) behave: not kickable, slow to open, both leaves together
- [ ] **Objectives:**
  - Bring Order to Chaos counts down
  - civilians are counted
  - units, if any, count up
  - the vote to leave (Y) appears when order is restored

## 7. Visual pass (in game)

Start one with `G.Server.theme = TH; G.Server.level = 3; G.Server.startLevel()`, after deploying.

- [ ] From the spawn: you can see where to go in. Screenshot the approach.
- [ ] Walk the whole map: no holes in walls, no floating furniture, no z-fighting, doors in their frames,
  lights where rooms are.
- [ ] Shoot through every kind of furniture and racking: hits where solid, passes where open.
- [ ] Ragdolls on stairs, furniture and outside floors settle cleanly. Nothing sinks through or bounces off.

## 8. Wrap up

- [ ] README: the theme and its layout in the level section.
- [ ] Console clean through a full level (enter, fight, secure, vote to leave).
- [ ] Multiplayer: a joining player regenerates the same map from the seed. Doors, the case and cabinets
  sync (`welcome` message).
