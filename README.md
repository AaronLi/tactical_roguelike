# Breach Protocol

Peer-to-peer co-op roguelike tactical FPS that runs in the browser. Three.js for rendering,
WebRTC (via PeerJS) for networking. No build step, no install.

## Running it

```bash
node serve.js
```

Then open http://localhost:8080. (Any static file server works, e.g. `python -m http.server 8080`.)

**Weapon demo reel:** http://localhost:8080/?demo plays itself (`js/demo.js`). It starts a solo level with
nobody else in it, stands you at the longest clear line of sight on the ground floor, and loops through the main
weapon archetypes:
- **Rifles and SMGs:** AR-15, AK, MP5, AUG, Thompson.
- **The rest:** Glock, R700, pump shotgun, M249, revolver, double barrel.

Each one is drawn, fired (and cycled), reloaded with rounds left, run dry, reloaded from empty (the action after
it), its magazine checked and a chamber check held. A caption says what's showing.

## Playing on your local network

`node serve.js` listens on every network interface and prints the address others can use, for example
`on your network: http://10.0.0.238:8080`. Everyone on your network opens that address, then you Host
and they Join with the room code as usual.

- **Firewall:** if others can't load the page, allow Node.js through the Windows firewall for the kind of
  network you're on (Windows asks the first time Node listens; "Public" if your network is set to Public).
- **Internet:** joining still needs internet access: PeerJS's public broker introduces the browsers to each
  other, then game traffic goes directly between them on your network.
- **Settings:** `PORT` and `HOST` can be set in the environment (`PORT=8081 node serve.js`).

## Playing with friends over the internet

Every player needs to load the game page, and the host shares a 5-letter room code.

1. Put the folder somewhere your friends can reach. The easiest free options are GitHub Pages,
   Netlify Drop (drag the folder onto app.netlify.com/drop) or itch.io (upload as an HTML game).
   It's all static files, so any of these work. Friends can also run `node serve.js` on their own copy.
2. Host: click **Host Game**. A room code appears in the lobby.
3. Friends: type the code and click **Join**. They connect straight to you, peer-to-peer.
4. Host clicks **Deploy**. Friends can also drop in between levels or mid-level.

The PeerJS public broker (0.peerjs.com) is only used to introduce peers. Game traffic goes
directly between browsers, and PeerJS's TURN relay is the fallback for strict NATs.
The host runs the authoritative simulation (enemy AI, damage, objectives), so the host should
keep their tab open. It keeps ticking in the background, but slower.
**LAN games.** **Find LAN games** on the main menu lists the games hosted behind the same router as you (name,
squad size, what they're doing, code): click one to join. No server of our own: everyone on a network shares
a public address, which WebRTC's public STUN server reports; a host takes one of a few beacon ids on the PeerJS
broker derived from it, and the search knocks on each. It still goes through the PeerJS broker like every
connection (so it needs the internet), and it finds games behind the same router, which is what a LAN party
is. The game itself is a static page: `serve.js` is only a convenience, and any static host will do (not
`file://`, where the browser blocks the sound files).
**Reconnecting.** A host keeps its room code through a refresh (in that tab), so the squad can get back in:
anyone who loses the host keeps trying that code for a minute and rejoins as soon as it's hosting again. The
join box remembers the last code you joined. In the lobby the host can take a **New code** (anyone already
there is dropped and needs the new one). Your name stays the same through a refresh too.
When a teammate readies up (in the lobby, or by getting into the helicopter in the hangar), everyone else hears a two-note chime and sees
"<name> is ready" in the chat.
**Friendly fire is on.** Your rounds hit teammates in the way as they would anyone (armour and all; a
shotgun's pellets each count). The one hit is told it was friendly fire ("Friendly fire", and a death from it
says the same), but not whose: the shooter's name isn't shown.

## How a run works

- Close-quarters scale: levels are compact buildings (about 38 m across at level 1, never more than 60 m) of
  small 6-12 m rooms that often share a wall and connect straight through a doorway. Movement is deliberate:
  walk 1.9 m/s, 3 m/s with the weapon lowered (Space toggles it; firing or aiming raises it), 1.4 m/s steadied
  (Shift), crouch-walk 1.3 m/s, a crawl prone (Z) 0.55 m/s,
  slower again while aiming, and your kit has weight. There's no jumping, and every level is walkable without it.
  Lean around corners with Q/E; enemies see and shoot at your leaned head.
- Each level is procedurally generated from a seed: rooms, corridors, doors (single and double), windows and
  a weapon case (every level has one).
  Closed doors block movement, sight and bullets. An open door's leaf, standing out into the room beside its
  hinge, still hides whoever is behind it and stops rounds, though you can walk past it. Suspects and civilians
  open doors as they move, which you can hear.
- **Blind fire.** A suspect who loses sight of you (round a corner, behind a door) sometimes keeps firing at
  where you were for about a second. Those rounds hit at about a seventh of the usual rate, and only if you're
  still standing there in the open.
- **Walking fire up.** Suspects open on centre mass. 0.3–0.5 s into a string of fire their aim climbs to your
  head over half a second, until by about a second in, roughly 40% of their hits are head or face. A pause of
  over a second, or switching target, starts them over from the body. A leaning officer already shows mostly
  head and shoulder.
- **Suspects' bodies are physically simulated** (`js/rig.js` `powerStep`). A living suspect or civilian is
  the same ragdoll their body becomes when they die: particles at the joints, held together by the bones and
  joint limits, colliding with the floor and furniture. Muscles pull each joint toward the walking, aiming or
  surrendering animation, and they're as strong as the person is: their strength, from the host, is what
  blood loss (their health) and broken legs leave them, full above 70% health and falling steadily to nothing
  at 15%.
  - **Strong:** they move as animated but with weight: a hit knocks the upper body the way the round went,
    and they sway coming to a stop.
  - **Weakening:** gravity starts to win. They sag and stagger, the knees buckle, and the legs strain to push
    back up in efforts that come and go and fade. The host slows them (from strength 0.6 down).
  - **The off hand:** with the strength for it (0.4 and up, about 37% health) it's on the gun's forend.
    Below that they can't hold the gun up two-handed: they shoot one-handed (worse aim, more kick) and the off
    hand props them up, on the floor beside them if it can reach, or leaning on the knee, the elbow locked.
  - **Collapse:** below strength 0.3 (about 31% health), a spine or a stopped heart, they're down for good: the
    gun falls from their hand (evidence, as when they give up) and the body goes limp, the same ragdoll as the dead
    but still alive, bleeding out. No aiming or shooting, no turning or moving, no giving up, and no pose for the
    body to snap back to. You cuff them where they lie as you would a body (turned onto the front, wrists behind),
    which stops the bleeding.
  - **Dead:** the muscles are gone.
  - Only suspects within 40 m of you are simulated; farther off they're animated.
- **Their gun is in their hand.** It goes with the simulated right hand, held the right way up (it can't roll
  more than 25° off level), and while they're aiming the arms hold it on their target as hard as they still
  can: dead on at full strength, 8° off at half. Their rounds leave that gun's
  muzzle as you see it, and a miss from a gun pointing well off the line flies where the barrel points.
- **They fire when the gun's on you, and it kicks.** Each shot kicks the muzzle up by the weapon's recoil
  (about 5° for an AK, 3° for an M4, 12° or more for a shotgun; half again one-handed and weak) and shoves the
  arms and shoulders back along the bore; the arms bring it back down, fast with two hands and strength,
  slowly without. They fire again once they're facing you and the kick has settled (on the host's screen,
  where that suspect's simulated gun actually points has to agree), or snap a shot off after 0.8 s, worse aimed
  the more the gun's still jumping. So recoil sets their pace: at full strength an AK's burst goes out about
  0.11–0.17 s a round; weakened and one-handed, the same gun manages a round every 0.6 s.
- **The weaker they are, the more readily they give up.** Weakness adds to the chance they surrender when
  shouted at (up to half again), and it overrides what normally keeps them fighting:
  armed friends nearby, and having already been shooting at you. A lone gunman, gun up, who's been shooting:
  about 1.5% at full strength, about 50% at strength 0.3; with two armed friends in sight, about 0.1% and 24%.
- **Hits and near misses rattle them.** Being hit gives a shock that takes up to half their accuracy and
  fades over about two seconds; it also throws off the shot they were about to take and starts their aim over
  from the body. Rounds passing or striking near them build suppression (more the closer: a round past the
  ear counts far more than one a couple of metres off), which takes up to 60% of their accuracy and wears off
  over a few seconds; a close burst pins them at 40%. Blood loss wears their aim down too, to 60% near the end.
- **Suspects reload.** Each carries their gun's real magazine, sometimes part-used. When it runs dry they
  reload, taking the gun's reload time; pump and lever guns load shell by shell and fire again from a
  part-loaded tube if you're in sight. With nobody in sight and the magazine half spent, they top up. They
  duck in cover and lower the gun while reloading. That's your window, and you can hear the magazine change
  within about 25 m.
- **Blood stays where it lands** (`js/render.js` `bloodDrop`, `bloodWall`, `bloodPool`).
  - **Drops:** every drop from a hit, a wound or a drip falls and leaves a mark where it comes down: on the
    floor, or on a table or counter if that's where it lands. Fast ones smear.
  - **Spatter:** a round through someone onto a wall just behind them leaves spatter on the wall.
  - **Trails:** bleeding suspects and officers (you and your teammates) leave a trail of drops as they move,
    thicker for heavy bleeding.
  - **Pools:** the dead, and downed officers who are bleeding, get a pool that spreads out under them over
    half a minute.
  - Marks last the level: 400 drops and splashes, oldest replaced first, and 24 pools.
- **Suspects get hurt.** The host records where each of your rounds landed (part, side, through the middle,
  how much got past armour):
  - **Bleeding:** a heavy bleed takes a standard suspect in under two minutes (about 100 s from full health), and light bleeds clot after about
    30 s. (Everyone, suspects and officers, bleeds at half the wounds' rates: `BLEED_K`.) Bleeding drains health and nerve, so a bleeding suspect is likelier to give up. Blood drips from them
    as they move.
  - **Bones and lungs:** a broken leg makes them limp (two, crawling pace), a broken arm ruins their aim, and
    a punctured lung slows them and spoils their aim.
  - **Incapacitated:** a suspect counts as incapacitated the moment they go down for good, the same as a kill.
    Whoever last shot them gets the credit and the tally, judged by what the suspect was doing when shot. Lethal
    force pays least, and an unauthorised one costs.
    - **Killed outright:** they count as incapacitated when they die.
    - **Down, then dead:** if a downed suspect bleeds out or is finished off, they aren't counted again.
      A bleed-out is kept in the level report ("3 incapacitated (1 bled out)"), and the host also records it
      against the officer who put them down (`report.bleedBy`) for later use.
    - **Cuffed while down:** that stops the bleeding and pays like securing a body (the carrier's share). It's
      not counted as an arrest.
    - **Bleeding out on their feet:** a suspect who never went down is credited to whoever shot them,
      judged the same way.
- **Thin walls** (`js/level.js`: `refine`). Levels are planned on a 2 m grid (rooms, corridors, doors,
  furniture), then refined to a 0.67 m grid that everything plays on.
  - **Walls between spaces:** a wall between two rooms, or between a house and its garden, is one 0.67 m cell
    thick instead of a whole 2 m tile. Where walls meet at a corner or a T, they meet as thin walls, and rooms
    take the space the walls gave up.
  - **Solid mass:** walls with solid mass behind them (the outside of the building, the rock around a bunker
    corridor) keep their bulk, so corridors stay 2 m wide.
  - **Doors:** a door is a 1.33 m opening with a single leaf; double and French doors are two leaves side by
    side (2.67 m).
  - **Fences and furniture:** garden fences are single panels. Furniture planned against a wall moves out to
    the wall's new face, and blocks the fine cells it covers.
- **Furnished rooms.** Every room has a purpose: living room, kitchen, bedroom, dining room, office, or in the
  industrial themes a storage room or break room. It's furnished to match: sofas, TV stands, bookshelves,
  kitchen counters and islands, fridges, dining sets, beds, dressers, wardrobes, desks with chairs, filing
  cabinets, shelving racks and crates. Plants, lamps and bins fill the corners. Rooms also get wood, tile or
  carpet floors, rugs, framed pictures, clocks, night windows with blinds and baseboards. Furniture blocks movement and bullets, piece by
  piece (a desk and its chair are separate). Waist-high solid pieces (sofas, counters, dressers, crates) are cover
  that suspects use. Doorways are always left clear and every room stays reachable.
- **Dark.** Rooms are lit by their ceiling lamps, and corridors are dim. **Every lamp lights its
  surroundings** (`js/lightgrid.js`): when a level is built, each lamp's light is worked out over the floor plan
  tile by tile, stopped by walls, falling off as a point light's does, with where it comes from, into a texture
  (a layer per floor) that every lit material reads. One texture lookup a pixel, however many lamps: the
  festival's 115 lamps all light, nothing switches on and off as you move, and the far end of a corridor is as
  lit as the near. (Real three.js point lights cost every lit pixel a pass each and recompile every shader when
  their number changes: measured on the festival, 12 put 40% on a frame, 48 160%, 96 320%. The old pool of 12
  that followed you is gone; the grid draws a frame 20-27% faster than it did.) Muzzle flashes, weapon lights
  and blasts are still real lights.
  - **Colour is handled physically** (`js/util.js`): every colour written down (a hex, a canvas, a loaded picture)
    is sRGB, decoded to linear before it's lit, lit in linear (light adds up as light does), and encoded back to sRGB
    on the way to the screen (three's colour management, `outputEncoding` sRGB on every renderer). Before, three's
    legacy mode lit the sRGB numbers as they were: a saturated colour under a bright lamp went fluorescent, and the
    falloff into shadow was a cliff. Lamp colours are tints of white picked by eye, so they're taken as written
    (decoded, a warm white's blue drops by a third and every room goes amber); the hemisphere fill is squared, so
    where no lamp reaches is as dark as it was. Custom shaders end in `linearToOutputTexel`; the window backdrop
    works in its pictures' sRGB and converts at the end; particle colours are converted as they're emitted.
  - **Over-bright light is rolled off, not clipped** (`G.R.TONE`, a custom tone mapping in `js/render.js`, on linear
    light): the shoulder of Khronos' PBR Neutral. Under about 76% of full nothing changes; above, the whole colour is
    eased toward full together, keeping its hue, and toward white by how far it was pushed, as film does (not its
    toe: taking the same off every channel near black saturates the dark, and most of a level is dark). The death
    camera's fisheye pass, a scope's picture and the hangar's TVs render the scene to a target and apply the same
    curve themselves. The festival's lamps
    were also turned down (strings 0.5, street lamps 0.85, the stage's 1.3): they're many and overlapping, and the
    light under them was 2.5× a room lamp's at the median, 5× in the brightest tenth; now it's about a room lamp's.
  - **Doors shut the light in.** The grid is worked out with every opaque door shut (a glass stairwell door lets it
    through), and each door keeps a layer of its own: the light that gets past it once it's open, and its doorway
    lit. As a door swings its layer blends in by how far open it is (all of it by the time it's well ajar) and
    back out as it shuts: only the tiles it reaches change, so the shader's still the one lookup. A room's light
    spills into the hall when you open its door, and a dark room stays dark until someone does. (Light through
    two shut doors in a row doesn't count: each door's layer is what that door alone lets by.)
  - **Light bounces, twice, in the room's colour.** Lamps light what they can see; the light that comes back off
    the floor, walls and ceiling is worked out too: spread over the open floor round it, stopped by walls and shut
    doors as the light was (glass passes it on), tinted by the theme's floor, walls and ceiling (half their hue, so
    a beige hall doesn't go yellow) and scaled by how pale they are (about 0.45 a bounce in a pale room, 0.3 in a
    foundry, never over 0.5), then spread and bounced again, so it reaches round corners and down corridors.
    Out under the sky most of it goes up and away (30% stays). Corners a lamp can't see aren't black, and
    ceilings (which no lamp hanging from them lights) show.
  - **The sky is baked too, and the flat fill's mostly gone.** The theme's night-sky fill used to light every
    surface evenly, indoors and out. Now it falls on what's open to the sky (and, at 60%, through an outside
    window onto the room behind it), and bounces in through doorways and windows like lamplight; lamplight goes
    through windows as well. The flat hemisphere fill left everywhere is a quarter of what it was (the hangar,
    daylit, keeps all of it), and the ambient light is off. Each door's layer is now what opening it changes:
    everything round it bounced with the doorway open, less the same with it shut, so an open front door lets the
    street's sky in and a lit room's glow reaches the dark room next door. Against before, at the median tile: a
    pale level (apartment, store) is 7-20% brighter, a dark one (foundry, bunker) 10-20% darker, and the darkest
    corners are lit by bounce instead of flat fill. Building the grid takes 50-300 ms (`G.LightGrid.opts`:
    `bounce`, `bounces`, `sky`, `fill`).
- Themes: Apartment, Warehouse, Bunker, Suburbs, Research Lab, Foundry, Cold Storage, Festival (the route map picks
  which), and the Convenience Store, the first deployment of every run and nowhere else. **Every level starts outside
  the target** (`js/level.js`), and you breach in:
  - **The convenience store** (`layout: 'mart'`, `layMart`): small and crowded, 20 x 26 m with its lot (from photos of
    real ones: tall shelving packed close, narrow aisles, a wall of cooler doors, the till behind its glass). You
    start on the fenced lot out front (an ice chest against the wall); a double door between shop windows into the
    shop floor, about 10.5 x 9.5 m: three aisles of two-sided shelving (1.6 m: you just see over it standing), 1.5 m
    apart, an endcap of soda cases at the front of each, full-height shelving down the west wall, an ATM by the till,
    a way round the back by the coolers and along the front; flat panel lights. Stock is faced up along every shelf
    (boxes, bottles, cans, bags) over price strips, each in printed packaging: a label from an atlas of 64 (a
    colour, a band or a mark, lines of type, a printed edge, in print's colours, not pure ones) over every face, on
    matte card and paper (tins and bottles a little glossier), the stock under a shelf in its shadow; the endcaps'
    cases and the cigarette wall too (`packaging()`, `k.boxL`/`k.cylL` in `js/furniture.js`). The shop and the booth are laid on the fine grid (`block` on a
    piece: what it stands on is blocked, cell by cell), which is what makes the aisles narrower than a tile. Behind the shop, the walk-in freezer and the stockroom (a door between them, a
    door from the shop up into the stockroom); the freezer's front wall is the coolers, glass doors from near the
    floor onto the shop (they break like any window). The cashier's booth is behind a wall of wired, bulletproof
    glass from counter height (steel wire in it, a heavy steel frame): it stops rounds and never breaks, but you see
    through it, and so do they. One door through it; the till and a counter along the inside of the glass, the
    cigarette wall behind; more of the glass onto the street. Suspects who see you through it hold their fire (no round
    gets through) and come round for you instead; they don't throw grenades at it either. A suspect starts in every
    room (the booth, the stockroom and the freezer too) before the rest are spread round. Its
    weapon case, attachments box and first aid cabinet are always there, all three in the stockroom (`starter` in
    `G.THEMES`). Glass between rooms is the layout's (`glass`: runs of coarse wall, each with its own sill and top;
    `armor` for bulletproof, `cooler` for a cooler's doors), placed by `placeWindows`.
  - **The foundry** (`layout: 'foundry'`, `layFoundry`): a steel works of two storeys, 68 x 56 m with its car park.
    - **The melt shop** (west) and **the processing hall** (east) are the building's full height (8.3 m). In the
      melt shop: two electric arc furnaces (electrodes down through the roof from arms on a mast, the slag door
      glowing), a ladle of molten steel in front of each, a row of ingot moulds, scrap buckets, electrical cabinets.
      In the processing hall: two lines of roller conveyors through rolling mills, hot saws, a forging press and
      quench tanks, a way through the middle of each; billets and coils waiting.
    - **Catwalks** run round both halls upstairs and across them (a bridge over the ladles, a spine between the
      furnaces, a walkway between the lines), with a steel stair up to them in each hall. Their floor is **steel
      grating** (`grate` on the layout, carried to the fine grid by `refine`): it holds you up, but rounds and sight
      go straight through it, from above and from below. Steel railings (a top rail, a knee rail, a toe board, no
      glass: the layout's `rail: 'steel'`) wherever they're over the drop; hanger rods up to the roof.
    - **Between the halls**, the switchgear room and the locker room downstairs (a door from each into both
      halls); over them, the **control room** (desks with screens under the windows) and an observation office,
      glass down both sides onto the halls and doors out onto both halls' catwalks.
    - **The office wing** (south-west): a stairwell (its door into the melt shop), the kitchenette, the men's and
      women's toilets (stalls, basins and a mirror), reception (the front doors onto the car park) and two offices.
      Upstairs, two observation offices looking into the melt shop through glass (doors out onto its catwalk), the
      manager's office and the meeting room.
    - **The loading bay** (south-east), full height: raw stock on pallets (billets, ingots, coils), two forklifts,
      pallet racking; a roller door up into the processing hall, two out onto the car park and a door between.
    - You start in the car park, in front of either the offices or the loading bay.
    - Particles (`buildFx`): sparks off the furnaces' slag doors and the hot saws, embers rising off the molten
      steel (now and then a spatter of bright drops), smoke over them, steam off the mills and quench tanks. A
      piece of machinery names what it throws off and the light it gives (`fx`, `glow` in `js/furniture.js`); the
      halls' high-bay lamps and that glow light the catwalks above too (`up`, copied up by `stack`).
  - **Rooms and corridors** (Bunker, Research Lab, Cold Storage). You start on a fenced, paved lot
    in front of the building, among bins, pallets and crates. A double door under a lamp leads in. The
    Bunker's is a **vault door**: thick steel with a locking wheel. It's too heavy to kick: you haul it open
    (hold F, 2.4 s), both leaves together. Bunker walls show no windows outside.
  - **Apartment.** An apartment block of two floors. On each, a lit hallway runs the length of the block with
    apartments either side, and a stairwell at each end of it: the flight up its outer side, a walkway down
    its inner side to the hall door, and upstairs a glass-railed landing round the drop. The stairwell doors
    are glass in a steel frame, a push bar across the middle on the side it swings away from and a pull handle
    on the other. You and the suspects see through them (as through a window) and rounds go through them,
    shattering the glass for everyone; the frame still stops you until it's opened. You come in at the
    foot of the west stairs. From about 7 apartments at level 1 up to about 14.
    - **Units:** each apartment is its own home of a few rooms, with one front door onto the hallway.
    - **Lofts:** about a third of the ground-floor homes are lofts. The living room goes up both floors,
      with a stair up its wall to an open upper floor over the rest of the home (bedrooms or a study), railed
      where it looks down into the living room. A loft's upper floor has no door of its own: you go up
      through the loft. Upstairs, the rest are single-floor apartments.
    - **Fighting on two floors:** suspects start on both floors and use the stairs, the hallway stairwells
      and a loft's own, to come up after you or fall back. They can see and shoot up or down through a
      stairwell's drop or over a loft's railing, as you can.
    - **How many people:** double any other level's, for the two floors: suspects ×2 (cap 64 instead of 32)
      and civilians ×2 (cap 16 instead of 8). That's 10 suspects and 4 civilians on level 1, 32 and 12 by level 8.
      A loft's upper level counts too: spawn spots are kept where the AI can walk to them, and that includes
      a loft's upper rooms, which are reached only by the loft's own stair (they were missed at first).
    - **Clearing them:** suspects are spread so every apartment has someone in it where numbers allow. The
      objective "Clear every apartment" is ticked once they all are, with no running count. An apartment
      counts once an officer has been inside it and no free, armed suspect is left in it, so an empty one
      still has to be checked.
  - **Warehouse.** You start on the loading dock outside, among pallets and crates, fenced at the sides.
    Two roller doors (rolled up: wide openings under the shutter drum, with guide rails either side) and a door
    between them lead onto the warehouse floor: rows
    of pallet racking taller than you (cartons, drums, shrink-wrapped stacks), with aisles between the rows
    and cross-aisles through them. Along the back wall is a row of offices and a break room, with doors onto
    the floor and sometimes between them.
  - **Suburbs.** Two detached family homes side by side on a street, the houses of interest, each with a
    basement, a ground floor and an upstairs (18-22 m across, 12-14 m deep).
    - **The street** runs the whole width of the map, a road with its pavements. You start at its west end,
      behind a police roadblock: two patrol cars staggered across the road with a gap between them. The
      neighbour's house on the corner stands between the spawn and the houses, so no window in either house
      can see where you start. More patrol cars are parked at the kerb in front of the houses (cover for the
      approach) and across the far end. Patrol cars are black and white with their light bars lit.
    - **The houses** sit behind front lawns. A stair hall runs front to back down each house's west side: the
      front door opens into it, the flight down to the basement goes down one lane of it and the flight up the
      other, railed where the floor is open over them, and a door leads from the hall into the rooms on every
      floor. The rooms beside it are laid out for each floor on its own: living room, kitchen and dining room on
      the ground floor, bedrooms and a study upstairs, storage and a den in the basement. Suspects are spread
      over every floor: a room indoors on each floor, basements and upstairs included, gets one before any
      room gets a second (the yards and alleys after). It's a big level, and it's held by more of them: 1.8
      times the usual suspects (9 at level 1 alone, 3 to a floor), 1.6 times the civilians.
    - A narrow alley runs between the houses, and a path down the east side, from the lawns to the back
      gardens: other ways round. Each house has a side door onto one of them.
    - Behind each house is its garden (a lawn with hedges, a shed, a barbecue and a patio set). Back doors,
      or French doors, lead out into it. A 1.9 m close-boarded fence divides the two gardens, with a gap near
      the houses.
    - Street, lawns, alley and gardens are open to the night sky. Upstairs, everything outside the houses is
      open air: windows on both storeys look out over it, and the roof is over the top storey only. The
      basement has none.
    - **The roofs:** each house wears a whole gable roof (tiled slopes from a ridge along its length down to
      eaves past the walls, a gable at each end, fascia boards), over every part of it with the sky above
      (the top storey, and any lower part nothing's built on).
    - The fences are too tall to see over and stop movement.
  - **Festival.** A music festival at night on the edge of a town, about 125 × 108 m, all of it open to the sky
    and fenced with event fencing (steel mesh panels, dark scrim, the odd sponsor's banner). The fog's pushed far
    back and the moon's up: a lot of open ground and long sight lines. More suspects (×1.5) and civilians (×2)
    than elsewhere.
    - **The car park** along the south, where you come in: two rows of parked cars (cover) in painted bays,
      aisles between, tall street lamps. The festival's gate (under the WELCOME arch, ticket booths either side
      inside) and the street into the town square open off it.
    - **The town square** to the west, behind the festival fence with a side gate through. Shops down the west
      side and along the north (cafes, stores, bars: counters, shelves, tables), each with a lit sign over its
      door onto the square and windows onto it. In the middle a fountain with benches round it, cafe tables out
      front, plane trees down the fence side, street lamps, lanterns strung across.
    - **The food court:** rows of food and merchandise stalls facing each other across lanes, a way through every
      few stalls, service alleys behind. Most are 4 m wide (room behind the counter for two). Each stall has a counter across the front (cover), side panels, a
      striped awning and a lit sign; it's open at the back. Some civilians are hiding behind the counters,
      crouched and peeking. The other stalls were left as people ran: a stool on its side, dropped cups, a bag.
    - **The stage** at the far end: decking at cover height, PA stacks at the front corners, a lighting truss
      with coloured lamps throwing beams, and a backdrop lit up. In front of it are rows of folding chairs
      (low cover, aisles down the middle and sides) and the sound desk under its canopy. You can see
      clear across them.
    - **The toilet block** on one side: a washroom each side of a dividing wall, each with sinks and two
      cubicles behind their own doors, and picnic tables behind it.
    - **Lights:** lights are strung everywhere on poles. There are bulbs over the seats and the gate, and paper
      lanterns over the first lane, each with a glow, and every one of them lights the ground and the stalls
      round it. There are more civilians about than elsewhere.
    - **Night:** outdoors in the dark, suspects can't pick you out past 35 m (the lights, the stalls, the size of it) unless your light or laser is on,
      while a scope still finds them across the field.
    - Built in `js/level.js` (`layFestival`, `buildFestival`) and `js/furniture.js` (the pieces and `plan`'s
      `festival()`).
- **Clear the level** by arresting (zip-tying) or killing every suspect.
  - **Arresting:** get behind them first. A
    surrendered suspect watches you approach but holds still once you're close, so walk round, or from the front
    hold F to order them to turn around (your weapon stays on them; they shuffle round on their knees to face
    away from you, then stay put). Hold F from up to
    about 2 m away: if you're not in position you're walked in behind them first (bagging and bodies do the same).
    If there isn't room in front of them to lie down (a wall or furniture), you first grab them and drag them
    back far enough. Then you
    shove them face-down, following them to the floor with your hands on their back, then kneel over their legs,
    pull their wrists behind them and cinch the tie (about 2 s). You hear the scuffle, the body hitting the floor
    and the ratchet of the tie, and so do teammates nearby.
    Let go early and they're left on the floor untied. Restrained suspects stay prone.
    A body, or a suspect down for good, is tied where their ragdoll lies, not where they dropped: whether it's in
    reach goes by the ragdoll's hips, wherever it came to rest, and you kneel by its shoulder and tie its wrists
    (the host accepts that spot if it's within 4 m of where it has them).

  There are two objectives:
  - **Bring Order to Chaos** (required): every suspect arrested or neutralised (down and bleeding out counts: they never get up again, and the area they're in counts as cleared).
  - **Rescue All of the Civilians** (optional): restrain every civilian the same way, alive. It fails if
    any civilian dies. Completing it pays ¢150 + ¢50 a level on top of the mission bonus.

  Securing bodies (suspects' hands zip-tied behind the back, dead civilians reported) and bagging dropped
  weapons into evidence envelopes pay too. All of it can still be done after order is restored.

  There's no exit zone. Once order is restored, press **Y** to vote to leave (Y again takes it back). The
  level ends when every officer still alive has voted, downed ones included; solo, that's you. The HUD
  shows the objectives (✔ done, ✘ failed) and the vote count, but never how many suspects, civilians,
  bodies, weapons or apartments there are: that's for you to find out. The civilians objective is only
  ticked once order's restored, so it can't tell you there's nobody left to find. The "Also pays" line
  (securing bodies, bagging dropped weapons) turns green with a tick only once every other objective is
  complete (order restored, every apartment cleared, all the civilians rescued) and nothing's left lying about:
  every body secured and every dropped weapon bagged. With a civilian lost it stays grey.
- **Windows are real** (`js/level.js` `placeWindows`):
  - **The opening:** a gap two cells wide in a wall, with a sill to 0.95 m, a pane of glass up to 2.25 m and a
    frame. You can't climb through: to movement and pathing it's still wall.
  - **Seeing and shooting through:** you see through it, and your rounds go through it and shatter the
    glass, for everyone, with a crash of glass. So do suspects' rounds, and a grenade takes out the windows
    round it.
  - **Suspects:** they can see you through intact glass, but only 40% as well, and their rounds through it
    are aimed worse, until it's broken.
  - **Indoors to outdoors:** between a house and its garden or the street, and between the warehouse and its
    dock, there's real ground on the other side, and people out there.
  - **Outer walls:** a window there looks out at a night street drawn by a shader (the ground, trees, a fence,
    streetlamps, a city skyline under the stars, with parallax). In an apartment block you're high up: a lit
    tower block across the road, its lower floors below you, the city above. Rounds through these stop in the
    wall behind.
  - **Upstairs:** a window has one id across the whole building, and its glass carries that id, so a round
    through a second-floor window shatters that window. (Each floor numbers its own windows from 0 while it's
    planned; the glass used to keep that number, so a shot at an upstairs window broke a ground-floor one.)
  - **Placement:** windows aren't put behind a first aid cabinet or the weapon case. Bunkers and the hangar
    have none.
- **Hands busy, weapon away.** Every interaction (restraining, securing, bagging, doors, ammo, reviving)
  puts your weapon away while you do it, and it takes about a second to draw a primary afterwards (0.65 s for a
  sidearm). Cover each other.
- **Doors: open or kick.** Aim at a closed door within 1.9 m: above 1.3 m (a little over the middle of the
  2.3 m door) to open it quietly (heard within a few metres), lower to kick it in. A kick slams the door open, alerts everyone in earshot and
  startles any unaware suspect right behind it, so it's a loud dynamic entry with a stun. Open doors close. Both are animated in first and third person: you see your glove turn the handle and push, or your boot come up and drive the door in, and teammates and suspects visibly do the same.
- **Secure evidence.** Every weapon a suspect drops, whether he surrendered or was killed, lies on the floor.
  Until it's bagged it has a pulsing yellow outline, a fixed number of pixels wide
  at any distance, that shows through furniture and people but not through walls or floors. Hold F to bag it for cash (about 2.3 s). You kneel, pick it up, slide it into an
  evidence envelope, seal it and set it down, with the paper and tape sounds. A secured weapon also can't be grabbed back by a
  suspect faking his surrender.
- **The money is in police work, not killing:**

  | Action | Pays |
  | --- | --- |
  | Arrest | 2.5x the suspect's value, plus half his weapon's evidence value |
  | Zip-tie a suspect's body | half his weapon's evidence value |
  | Restrain a civilian | ¢200 + ¢40 per level |
  | Bag a weapon | the other half of its evidence value |
  | Kill | a quarter of the suspect's value |

  A weapon's evidence value is ¢60 + 4% of its shop price + ¢10 per level, split between bagging the weapon
  and securing the suspect who carried it (alive or dead). For example, a gunman on level 3 is worth ¢319
  arrested with his weapon bagged, ¢149 killed with his body and weapon both secured, and ¢19 for the kill alone.
- **Shout (V)**: "Police! Show me your hands!" Suspects only ever surrender when shouted at, and it's never
  guaranteed:
  - Caught off guard with the weapon still holstered, they usually give up.
  - With the gun already up, and especially if they're feeling brave, they rarely do.
  - Shotgunners, enforcers and the Kingpin almost never do.
  - Wounds, suppression, being outnumbered, being broken and repeated shouts all help.
  - **Braver together:** each armed friend nearby who can see them cuts the odds (to about a third with one,
    under a tenth with two, almost nothing with three). Friends around also make them slower to break and run.
  - **Past talking:** a suspect who's been shooting at you in the last 30 s almost never gives up, unless
    they're breaking or badly hurt.
  - Some surrenders are fake: left alone, that suspect goes back for a weapon. One who does is emboldened:
    their nerve is back at full and they're nearly impossible to talk down again.
  - Shouting tells everyone nearby that police are inside.
- **Stealth and surprise.** Unaware suspects carry pistols holstered and rifles slung; drawing takes about
  0.5-1 s (lookouts and enforcers stay ready).
  - Your footsteps carry about 9 m with the weapon lowered (Space), 5 m walking and 2 m steadied (Shift),
    less crouched. Opening a door is heard nearby.
  - Sound travels through the building, not through walls. It spreads along rooms, corridors and open
    doorways, and a shut door counts as 10 m of extra distance. A gunshot next door still carries, but
    footsteps, shouts and enemies calling to each other don't get through a shut door.
  - A suspect who hears you gets suspicious: he draws, faces the noise and spots you faster, then holsters
    again if things stay quiet.
  - Reach one quietly and he's startled when he sees you: he freezes for about 2 s and can't shoot. A shout
    then is your best chance of an arrest.

  | Shout at... | Pistol suspect | Gunman | Shotgunner |
  | --- | --- | --- | --- |
  | Startled (quiet approach) | ~90% | ~70% | ~50% |
  | Gun out (heard you coming) | ~30% | ~10% | ~0% |
  | Mid-gunfight | ~25% | ~13% | 0% |
- **Arrest (hold F)** a surrendered suspect from behind for far more than a kill pays (see the table above).
- **Telling them apart is the job.** Movement alone won't tell you who's who:
  - **Civilians** wander until there's gunfire or a breach. Then many run to cover out of sight of it,
    crouch behind furniture or stand round a wall edge, and every few seconds pop up or lean out to look,
    sometimes moving to another spot. Others bolt or freeze. A hiding civilian gives up when an officer is
    right on top of them, or when shouted at.
  - **Suspects** potter about their area the same way until they're alerted. One who only hears you (not
    sees you) will often hide and peek exactly like a civilian, with the gun still holstered or slung, and
    draws the moment it sees an officer. Look at hands, clothes and what's on their back, or shout and see
    who complies.
- **Civilians** pay out when restrained (hold F);
  killing one costs the shooter. Killing a suspect who has surrendered or been cuffed is unauthorised force
  and is penalised too.
- The hangar shows an after-action report (arrests, kills, civilians secured, casualties) when you arrive. A
  clean operation, with no civilian deaths and no unauthorised force, pays a bonus.
- **First aid cabinets.** About a third of levels have a white cabinet with a red cross on an indoor wall,
  and some have two.
  - **Using one:** look at it (the crosshair on the cabinet itself, within arm's reach, nothing in between: not
    from behind its wall) and hold F to open it. Your inventory opens with the cabinet's 3×2 grid where the locker would
    be at the quartermaster's. Move medical gear in and out of it like any other container: drag it, stack it,
    or treat yourself straight from it. It closes if you walk away.
  - **Contents:** one to three items, mostly bandages, painkillers and tourniquets, sometimes gauze, a chest
    seal, a splint or a blood bag.
  - **Co-op:** the squad shares it. The host keeps the real contents. If two of you grab the same thing at
    once, the second gets "someone got there first" and it comes off them again; anything put in that no longer
    fits comes back.
- **Weapons come from the field.** You start with a sidearm of your choosing, two spare loads for it, an IFAK, and second-hand
  protection: a bump helmet and a Ghost concealable vest, both at half condition. Every level has a weapon case,
  a hard case lying against a wall somewhere away from the spawn.
  - **Your sidearm:** after Deploy, before the first level's picked on the route map, each of you picks the pistol
    you go in with (click one to choose it, then Confirm): your own equipment, not a squad vote (any number of you can take the same one; the menu says so,
    and shows under each gun who in the squad took it and how many are still choosing; the route map lists everyone's
    once you've picked, and the route's yours to vote on then): the **Taurus TX22** (.22 LR,
    16 rounds, made fully automatic: 1,050 rounds a minute, hardly any kick, small holes, threaded from the
    factory; it looks like one: a steep bevel down the front of the slide and deep slanted serrations at both
    ends, a dust cover out to the muzzle with rail slots under it, a squared trigger guard, a hard-raked grip
    with stippled panels and a flared base; its magazines: an 11-round compact, a 24-round extended, a 40-round drum,
    and translucent 16- and 24-rounders that show the rounds left), the **P9** (9 mm, 15 rounds, semi) or the **derringer** (two shots of .44 Magnum). It comes loaded with
    tracers, with two spare loads in your small pockets (two magazines, or for the derringer two boxes of 12).
  - **What's inside:** a weapon in its standard build, fully loaded. It's a long gun three times in four,
    picked by rarity. Each tier has a share of the odds, split evenly between its weapons, and deeper
    levels shift the odds toward rarer tiers. Legendaries only appear from level 3. Every weapon can turn up,
    the starter P9 too (tier 0, a sidearm now and then, rarer the deeper you go), except the grenade
    launchers, which are switched off for now (`G.EXPLOSIVES_OFF` in `js/data.js`: no case, shop or kit
    hands one out). The table is for long guns:

    | Level | Common | Uncommon | Rare | Legendary |
    | --- | --- | --- | --- | --- |
    | 1 | 61% | 29% | 10% | — |
    | 3 | 46% | 32% | 17% | 4% |
    | 6 | 31% | 33% | 27% | 9% |
  - **Opening:** hold F at the case to open it. The latches clack, the lid swings up against the wall and the
    weapon lies in the foam for everyone to see. It's opened once for the whole squad.
  - **Swapping:** with the case open, hold F to swap your weapon of that kind for it. Your gun goes into the case in
    its standard build, keeping the ammo it had, and your aftermarket parts come off into your stash. If
    you have no primary, you just take it and the case is left empty.
  - **Co-op:** one case for the whole squad. After someone swaps, the next player can take the weapon they
    left.
- **The attachments box** (`map.abox`, most levels: `G.Level.ABOX_CHANCE`): a small black hard case with a yellow band,
  on the floor against a wall in a room away from the spawn (yellow on your minimap till you've had your pick).
  - **One use each:** a light on its front for each of the squad, in their colour, lit till they've had their pick.
  - **Your turn:** hold F at it. The host rolls your three: attachments for the weapon in your hands as it's built
    (`G.Gunsmith.attachOptions`: a slot it has now, not what's in it already; no magazines, factory parts or
    conversion kits), lower tiers likelier; if it takes fewer than three (or your hands are empty), the rest are
    attachments for anything. The lid stays up once anyone's opened it.
  - **The reels:** the first time, your three are slot-machine reels spinning down through attachments for your
    weapon; Stop on each eases it out onto what the host rolled (stopping only shows it: the roll's the host's).
    Look in again and they've landed.
  - **Taking one:** one of your three. Fit it straight to the weapon in your hands (what it replaces, and anything
    that no longer has a place on the gun, goes into your inventory, or onto the floor if there's no room) or put it
    in your inventory (on the floor if there's no room). Your light goes dark.
  - **What it does:** hover over a pick and the panel under them shows the weapon in your hands with it fitted, the
    gunsmith's stats with what changes marked (and what it'd replace), each load's muzzle velocity and energy too.
- **The sticker box** (`map.sbox`, one level in ten: `G.Level.SBOX_CHANCE`): a little hot-pink display box on the
  floor against a wall in a room indoors (pink on your minimap till it's opened), one sticker lying in it under a
  clear lid. The host picks which, from the stickers it has. Hold F at it, facing it: the sticker goes into your
  collection (the first to open it gets it; the squad sees who) and the lid stays up.
- **Stickers** (`js/stickers.js`, `G.Stickers`): the pictures in `assets/stickers/` (PNG, WebP, JPEG, GIF or AVIF).
  The game reads the folder's listing (`serve.js` lists a folder; so do most static servers), or `index.json` in it
  (a list of the file names) where the host doesn't list folders (GitHub Pages: add one). What you find is yours for
  the run.
  - **Sticking one on:** the gunsmith's Stickers tab. Pick one of yours, click the gun where it goes (a faint copy
    follows the pointer, then stays where you clicked), size it (1.2 to 7 cm; Shift + scroll), turn it (Ctrl +
    scroll), mirror it, and Stick it on: it's on that gun for good, one of yours used up. Twelve to a gun.
  - **How it's drawn:** a decal laid on the gun's own surfaces as a real sticker is: flat where you put it, and past
    an edge or round a curve the surface beyond is unfolded into the sticker's plane, so it folds over a corner and
    carries on down the far side without stretching. Each piece is a child of the part it's on, so it rides on a
    slide or a magazine. The same on your viewmodel, in the
    gunsmith, on your body as the squad sees it, on the gun on the floor or in the weapon case, and in the replays.
  - **On the gun:** `w.stickers` ({ file, point, normal, turn, size, mirrored } in the gun's model space), kept
    when it's dropped, picked up, stashed or swapped at the weapon case. The squad: a gun's list is sent to the host
    once (`skin`), kept there and passed on (to anyone joining later too), then only its hash goes in your state
    (`st.sk`); anyone who hasn't the list asks for it.
- Between levels you shop with Vex the quartermaster, in the hangar (below). He doesn't sell weapons. Each
  visit he has three pieces of gear, of different kinds (carrier or rig, plate, helmet, face shield, belt,
  backpack), picked by rarity, and four weapon parts, plus supplies. A plate carrier comes with a plate fitted, rolled by rarity (soft
  inserts and steel common, multi-hit ceramic rare) and included in its price. Stock is randomised (the whole squad
  sees the same) with better gear deeper in the run. The stock is the squad's, shared, with as many of each thing
  as there are of you: one of each piece of kit, part and special load per player, and five random pouch types and
  empty magazines for five random guns (up to the level's tier, not just yours), 1–3 of each per player, the special
  loads three standard magazines' worth in two different calibers. Whoever buys one first gets it; once they're all
  gone it's sold out until the next visit (the host keeps the count: buying asks it for one, you pay once it's yours,
  and it goes back on the shelf if you can't). About half the magazines are the gun's standard
  magazine and the rest a variant (compact, extended, drum, belt box). Supplies no longer sells
  magazines; ammo for your calibers is always there, by the box, in any load: a dropdown on the box's card picks it
  (ball, hollow point, AP, tracer, subsonic; buck, slug, birdshot, flechette), each priced by what it does (`G.AMMO`
  `k`: birdshot 0.7× ball, tracer 1.3×, subsonic 1.6×, a slug 1.7×, hollow points 1.8×, AP 2.4×, flechettes
  2.6×), with what the load is under it.
- **The hangar** (`js/hangar.js`) is where the squad spends the time between levels: a real place you walk
  about, on the same map machinery as a level (`G.Level.generateHub`: walls, lights, collision, rays, sound).
  The squad is there together; the host sends no enemies, and you can't fire or throw in it. It's a 48 × 25 m
  hall (a 16 m opening in its front wall) with a 48 × 12 m helipad outside it, open to the sky.
  - **Buying:** look at what you want and press F: a price tag shows what it costs, and what you look at is
    outlined. Or use a point of sale (look at it, press F) to open the shop panel for it, the same panels as
    before: Vex's till (the whole stock), a workbench computer (the gunsmith), the warehouse console (your stash
    and loadout) or a vending machine's screen (supplies). Esc or "Back to the hangar" puts a panel away. Tab opens your stash and loadout from
    anywhere in the hangar.
  - **The workshop** (west): a bench for each officer (their name on the front; the computer on your own opens
    the gunsmith), the zeroing table in the middle of the floor (a shooting bench with sandbag rests and a
    screen: F to zero your sights), and six pedestals along the north wall with the gunsmith's parts for sale (bought into your
    stash): each part shown on its own and turning slowly, its sign on the front (name, price, the slot it goes in
    and how many weapons it fits). What the guns already come with seldom turns up: a part is weighted down by the
    share of the weapons it fits that ship with it (the A2 birdcage, the stock red dot, the standard grip), so most
    of the stock is upgrades that change how a gun performs.
  - **The store** (middle): Vex behind his counter (his till is the full stock; he looks like his portrait: dark hood, a black visor with two orange eyes, a grey respirator, a gold strap across the chest), three pedestals with the
    gear for sale, each piece shown on its own and turning slowly (a helmet with its face guard on it, a
    carrier with the plate that comes with it standing beside it and turning with it, a plate or a face guard by itself). The sign
    on the front says what comes with it (a carrier's or belt's pouches, a fitted plate or face guard) and, in
    orange, what doesn't (a plate with no carrier, a face guard with no helmet, an empty plate pocket). A
    bought piece leaves its pedestal, a shelf of pouches, and two vending machines:
    **ammunition** (the special loads, and a box of any load for every caliber you carry a gun in) and **field supplies**
    (medical items, flashbangs, frags).
  - **The warehouse** (east, at the back): a robotic crane over the stash, which fetches a crate down to a pallet
    when you use the console beside it. The console opens your stash and loadout.
  - **The lounge** (east, at the front by the hangar door, walled off from the warehouse): two rows of sofas on a
    rug facing a big screen on the east wall, which shows the highlights of the level just played; a coffee table
    with popcorn and a snack bar.
  - **The helicopter** (on the pad): hold F on it to climb in and ready up (you sit in your own seat, the
    same one for everyone: by place in the squad, with a view out of the open side); hold F again to get out
    and take your readiness back. When everyone's in it the rotor spins up and, after three seconds, it takes
    off for the route map; anyone getting out stops it.
  - **The shooting range** (`js/range.js`) is through the garage door in the hall's north wall (where the
    gunsmith's parts wall used to be; that wall slid east, toward Vex). Off the yard, from the left: the IPSC course,
    a pistol range (three lanes, paper at 5, 7 and 10 m and steel at 12 and 15 m) and a rifle range to the east (four lanes, 300 m
    deep, steel at 25, 50, 75 and 100 m off to either side), each lane marked in metres on the floor. Every rifle
    lane has an **IPSC target** on a carrier down its middle: six buttons on the lane's console (aim, F) send it to
    10, 25, 50, 100, 200 or 300 m, a fresh target each time. Hits score by zone (A, B on the head, C, D; a round
    past its edge is a miss), and the console's screen, and a spotting view on your screen while you stand at that
    lane's line, show the target with every hit on it, the last one ringed. Guns work here and nowhere else in the hangar:
    every round, magazine and box you use is put back as it was when you walk out (`snapshot`/`restore`). So the
    rest of your kit is **frozen** in there: nothing can be moved, dropped, sold or used from the Tab screen until
    you're back in the hall (otherwise the restore would hand back what you'd moved out).
    - **The IPSC course** (`js/course.js`), on the left: a random stage in a 10 x 28 m strip. Three shooting boxes
      one behind the other, barriers beside them and knee-high walls between with a gap to go through, and eight
      to twelve targets downrange: IPSC cardboard (two hits each, the best two count), up to two white no-shoots
      beside them, and steel poppers that fall when hit. **NEW** (a button in the yard by the entrance) lays a new
      stage, only while nobody is in the course; the stage comes from a seed the whole squad shares. **START** (a
      button in the first box): standby, a random pause, the beep, and the clock runs. Every shot you fire is a split
      and every hit is scored where it lands; the run ends when every target's done, or when you walk out. A shot
      before the beep stops the run. The **board** on the hall's wall over the yard shows the run as it happens:
      each target's hits, every shot's time and split, then the time, the points (A 5, C 3, D 1, steel 5; each miss
      and each no-shoot hit -10) and the hit factor (points / seconds). Whoever is shooting sends it to the others.
      Either side of it, two **spectator screens** switch on while anyone's in the course: one behind the shooter,
      one from the far end looking back at them.
    Rounds
    hit targets (`G.Range.hit` from `roundSegment`): paper takes holes, steel swings and rings (a beat later, for
    the distance), and each lane's console counts its hits (F resets its targets). There is no friendly fire in
    the hangar, and your shots are heard by the others. The map has the range's 156 rows first (`G.HANGAR_ROWS`), so the
    hall sits 312 m along (the camera sees 420 m in the hangar, 280 elsewhere): `js/hangar.js` keeps to the hall's own coordinates and adds `RZ` where it meets the world.
  - **Under it** it's an ordinary level with a flag (`G.Game.hub`; the phase is still `'level'`, which is why
    movement, other players, collision and sound all work). The host's phase stays `'shop'` and only carries
    the squad about (`G.Server.updateHub`) and times the helicopter. What's on the shelves is the same
    stock `js/shop.js` always had, drawn from it (`G.Hangar.refresh`), and a purchase is `G.Shop.buy`.
- **Shared magazines.** Guns built round the same magazine take each other's (`G.MAG_FAMILY` in `data.js`,
  the magazines in `parts.js` `MAG_FAMS`):

  | Pattern | Guns | Magazines |
  |---|---|---|
  | STANAG 5.56 | M4, HK416, F2 Bullpup, TX-9 Tavor, SCAR-L, M27 IAR, SIG MCX, G36, Steyr AUG | 20, 30, 40, 100-round drum |
  | QBZ 5.8x42 | QBZ-95, QBZ-192 | 20, 30, 45, 75-round drum |
  | MP5 9mm | MP5, MP5SD | 15, 30, 40, 50-round drum |
  | AK 7.62x39 | KV-47, Galil ACE, RPK | 20, 30, 40, 75-round drum |
  | AK 5.45x39 | AK-74M, AKS-74U, AN-94 | 20, 30, 45, 60 |
  | Glock 9mm | P9, G18, G19, AR-9, AUG 9mm | 15, 17, 33, 50-round drum |
  | M14 7.62 | M14, Mk14 EBR | 10, 20, 30, 50-round drum |
  | Saiga 12-gauge | Saiga-12, Vepr-12 | 5, 8, 12, 20-round drum |

  A magazine from one goes in any of the others: reloading, dragging it onto the gun, and the shop's
  "Fits your …" all count the whole pattern. The G36 and AUG are their NATO versions (HK's STANAG well, Steyr's NATO
  stock), so every 5.56 rifle shares one magazine; their own magazines are retired (`NATO_LATE` in `parts.js`). The SCAR-H,
  FAL and SR-25 keep their own. An LMG that takes rifle magazines (the RPK) uses them like a rifle; the belt-fed ones
  (`G.beltFed`) use boxes. There are no perks: your kit is what keeps you alive.
- **Conversion kits** (`parts.js` `RCV`). Some guns are one core (a lower, a frame, an action) with a
  different kit in it. Fit another kit of the same group in the gunsmith, or drag one onto the gun's
  Receiver group slot in the field, and the gun becomes that gun:

  | Core | Guns |
  |---|---|
  | AR-15 lower receiver | M4 ↔ AR-9 (9mm, Glock magazines) |
  | AK receiver and trunnion | KV-47 ↔ AK-74M ↔ RPK |
  | AUG stock group | Steyr AUG ↔ AUG 9mm (Glock magazines) |
  | MP5 lower | MP5 ↔ MP5SD |
  | Glock-pattern frame | P9 ↔ G18 (select fire) |
  | M14 action | M14 ↔ Mk14 EBR (chassis) |

  Only the receiver group changes: every other part stays exactly as it was. Optics, stocks and grips carry on.
  But a core part made for the old gun (the M4's 5.56 barrel on an AR-9 receiver, a P9 slide on a G18 frame)
  doesn't fit, and the gun won't fire until the right one is in. The gunsmith always sells the right core part
  for a gun that needs one. Fitting it takes off whatever hung on the old one that doesn't fit the new one
  (a 5.56 suppressor on a 9mm barrel), to your locker, with the old barrel and the old receiver group, so you
  can convert back. If the new gun takes different rounds or magazines, the magazine comes out with its rounds.
  The converted guns are guns in their own right: they're sold, carried by suspects, and found in weapon
  cases. A convertible gun rolled for a weapon case comes built on one of its alternate receiver
  groups 35% of the time (an M4 as an AR-9, an AK as an RPK), fitted and working. The gunsmith stocks receiver groups now and then.
- **Shotgun loaders.** The tube shotguns (870, KSG, Slug Gun, Benelli M4) take a side saddle (each shell a
  little faster), a twin-shell carrier, or a quad speed loader (four shells a push). A full tube on the Benelli
  takes 3.6 s bare, 2.9 s with the saddle, 2.6 s with the carrier and 1.9 s with the quad loader.
- **Pistol stocks.** The P9, G18, G19, Auto-9 and TX22 have a stock lug: a folding stock or a brace cuts recoil by
  14–22% at some cost to handling, or the Vantage SMG stock mount (a block on the lug) takes any SMG stock. The
  stock is drawn in first person too (its tube and rails along the bottom of the view; not its pad, which would fill
  the screen aiming), as well as on the gun in the gunsmith and in other players' hands. An SMG stock on a handgun's
  mount (that one, the chassis's, the derringer's lug grip) is a brace a stock on an SMG isn't: on top of the stock's
  own figures, recoil −25 and ergonomics −8 (a slot's `brace`, js/parts.js; an empty one costs nothing).
- **Pistol carbine chassis** (the Ironvale PCC-1, a grip-slot part for every single pistol, not the akimbo pair): the
  pistol drops into a polymer chassis in place of its grip, its frame rail and stock lug shut inside. Its own slots
  replace them (a part's `chassis`: its slots, taking over the gun's of the same name or added): a full-length rail
  over the slide for a rifle's sight (a magnifier behind a red dot: the sight goes forward, the magnifier's mount on
  the rail; with nothing on it, folding irons at its ends), a rail each side of the shroud ahead of the slide (a
  light, a laser) and one under it (a foregrip: where your other hand goes), and an SMG stock mount at the back. The
  slide still runs inside it, a window over the ejection port on the right. A P9 in one with a fixed SMG stock, a
  2× prism, a foregrip and a light: recoil 1.44° to 0.44°, aim sway 202% to 93%, 0.75 kg to 2 kg.
- If you go down you can still shoot your sidearm; unconscious (15% blood or less) you can do nothing, and the
  screen's all but black. Down, you keep bleeding, a sixteenth as fast as standing
  but nothing clots any more: a heavy bleed at 15% blood gives about four minutes, a light one several more, and when
  the blood's gone you're KIA until the next level, watching through a camera on the right side of a teammate's helmet, up
  by the crown, tilted a little in and down so you see their arms, hands and weapon. It's a wide, fisheye-ish
  lens: the field of view is 20% wider than yours and the edges curve in (a barrel distortion drawn by a small
  render-to-texture pass in `js/render.js`, only while spectating). It follows where they look;
  click to switch to another; your own gun isn't drawn in it. **Your body stays where you fell**, a ragdoll
  with its kit on, for everyone to see, you included (you have no body in first person, so one is made when you
  die, dressed as you are, `G.Views.spawnSelfBody`); you're a whole officer again next level. A teammate holds **F** to check you, or clicks your health bar in the squad list under their own
  body in the Tab screen (within reach), and treats you from there, with their own medical gear or with yours: click a part and the menu lists what they carry
  and what you carry (everyone's counts are in their state), and your item comes off you when it lands. When
  more than one person's gear is on offer, each entry shows its item's icon, its owner's emblem and name
  ("Seal", or "you") and how many they have. If you used it first, or it's no longer needed, it isn't used. **While they work on you, your screen says so:** a green panel under the crosshair
  for each teammate treating you ("Seal is applying chest seal to your thorax") with a bar for how far along
  they are, and that part lit on your body figure (the HUD's, and the one in your Tab screen). It's there from
  the moment they start until they finish or stop (the host only tells the one it's being done to). Clicking
  the blood bar (yours or theirs) offers blood bags. Stopping every bleed **stabilises** you (the clock stops:
  the HUD says Stable). Down but conscious, a revive gets you up; unconscious, they need to get your blood back
  over 15% with blood bags first, and you come round (still down). Get the bleeding stopped before that, or it
  carries on, and with your blood still at 40% or less the next hit puts you straight back down. If the whole
  squad is down, the run ends.
- **Injuries** (`js/medical.js`). There's no health bar and no medkit; your body is seven parts with their
  own health: head 35, thorax 85, stomach 70, each arm 60, each leg 65.
  - **Hits:** a hit takes health from the part it lands on, and can leave an injury there:
    - bleeding, light or heavy
    - a fracture (arms and legs)
    - a punctured lung (thorax)
    - a gut wound (stomach)

    A round through the middle of a part is likelier to do damage than a graze, and armour that stops part
    of a round also cuts the odds. Grenade fragments spread over the legs and lower body.
  - **Blood is what puts you down.** Every hit costs blood at once (about half a point per point of damage
    to the torso, a third to a limb; none to the head), and then for as long as it bleeds:
    - over 40%: you're up, however hurt
    - 40% or less: the next hit, anywhere, puts you down
    - 15% or less: unconscious
    - none: dead (a single wound never empties you by itself: at worst it knocks you out at 1%, and the
      bleeding finishes it unless someone stops it)
  - **A part at zero only stops working:** a wrecked arm throws your aim, a wrecked leg slows you, a wrecked
    chest leaves you short of breath (aim and pace, like a punctured lung), a wrecked stomach slows you. The
    head is the exception: the head at zero is death.

    Whatever kills you shows on the body (an unprotected head shot leaves the head destroyed and
    bleeding), and the KIA message says what it was: shot in the head or face, killed by the blast,
    died of your chest wound, or bled out.
  - **Bleeding** drains blood (light 0.35%/s, heavy 2.2%/s per wound, a gut wound slowly). Below 70%
    your aim suffers, below 50% your pace.
  - **Clotting:** a light bleed stops on its own after 30–60 s, costing about 10–20% blood, and a fresh wound
    on that part starts it over. A bandage stops it at once. Heavy bleeds never stop without a tourniquet or
    gauze.
  - **Effects:** pain throws your aim (sway and recoil): fractures (an arm most), badly hurt or destroyed
    parts, heavy bleeding. A punctured lung and blood loss hurt your aim and pace however much painkiller
    you've taken. A broken leg slows you to 72%, a destroyed one to 60%.
  - **Treatment:** each item fixes one injury on one part, and takes time:

    | Item | Fixes | Where | Time |
    | --- | --- | --- | --- |
    | Bandage | light bleeding | anywhere | 3 s |
    | Tourniquet | heavy bleeding | arm or leg | 3 s |
    | Hemostatic gauze | heavy bleeding (or light, as a bandage) | anywhere, the torso too | 5 s |
    | Chest seal | punctured lung | thorax | 4 s |
    | Splint (1×2) | fracture | arm or leg | 6 s |
    | Painkillers | pain's effect on aim, for 2 minutes | — | 2 s |
    | Blood bag (1×2) | blood loss: +40% blood | anywhere | 8 s |

    A gut wound can't be fixed in the field, and nothing restores a part's health there: you go into the
    next fight as hurt as you are.
  - **Treating yourself:** open Tab. Your body is on the right; click a part for a dropdown of the medical items
    you carry that would treat what's wrong with it (it says so when nothing would), or drag the item onto the part, or right-click
    the item to see what it can treat. The wrong item for a wound (a bandage on heavy bleeding) is refused
    and says what's needed.
  - **Treating a teammate:** put your crosshair on them (within 2 m, 2.4 m for a downed one) and hold **F**.
    The screen shows their health and nothing else: no inventory, theirs or yours. Click a part of their body
    and pick from the medical items you carry that would help it (one comes off your stack). Stay within 2.6 m: if they move out of reach, whatever you were doing for them stops (nothing's used) and their panel closes. You can
    revive a downed one there (4 s), once they're stable (no bleeding anywhere) and their blood is over 50%:
    a revive brings the thorax back to 20, but it can't stop bleeding or make blood. A blood bag on
    yourself while your blood runs low keeps you from blacking out (at 15% you go down).
  - **The HUD** shows your blood and a small body figure: each part shaded by its health, glowing red
    while it bleeds, outlined if it's broken. Everything heals at the quartermaster's between levels.
  - **The IFAK:** you start with one in its own equipment slot (on the hip, so you have it without a carrier).
    It's 2×3, takes only medical gear, and comes with one each of bandage, tourniquet, gauze, chest seal and
    splint (no painkillers). Its contents count as on you and are treated from like any pocket. Supplies
    sells all six items.
  - **Stacking:** bandages and painkiller doses stack 4 to a slot, tourniquets and gauze 3. Drag one onto another to combine;
    buying tops up the stacks you have first; treating uses one off the stack.
- Every 10th level has a boss, **The Kingpin**, who calls in reinforcements.
- **The route map** (`js/route.js`). A run is a series of acts of ten levels (nine, then the boss), each with its
  own map running left to right. The map is wider than the screen: it scrolls sideways (the mouse wheel
  works too) and opens on where the squad is. Before every level the squad votes on where to go next, and the most votes wins (a tie is a
  coin toss).
  - **Shape:** an act starts at a single way in (the first act at the convenience store), fans out into four routes
    that wander and sometimes cross paths, and they all come back together at the Kingpin.
  - **Environments:** each node is an environment (apartment, warehouse, bunker, suburbs, research lab,
    foundry, cold storage), so the route you take picks the places you'll fight in.
  - **Sync:** the map is generated from a seed, so every peer draws the same one. The host keeps the squad's
    position and the votes, and players who join late get both.
- Difficulty scales with level and with squad size.

## Content

- **53 primaries**: assault and battle rifles, SMGs, shotguns, LMGs, DMRs, bolt-action and anti-materiel snipers,
  a grenade launcher (switched off for now), a railgun and a crossbow
- **18 sidearms**: pistols, machine pistols (a full-auto Taurus TX22 in .22 LR among them), revolvers (including a .410 shotgun revolver), a derringer,
  a sawed-off, a pocket grenade launcher (switched off for now) and akimbo Berettas
- Weapons differ in how they work, not just in stats:
  - **AN-94 hyper-burst**: the first two rounds of each trigger pull fire at 1800 rpm.
  - **M1 Garand**: en-bloc clip that only reloads when empty, and pings when it ejects: the empty clip goes back
    in your kit (on the floor if there's no room), the gun stands open, and the next reload pushes a full one in.
  - **Minigun**: has to spin up before it fires. Held by a side handle on the left (no carry handle over the top,
    so its iron sights, or any optic, sit low on the rail), with a side rail on the right for a light or laser.
  - **Shell by shell**: lever-action, Mosin, pump shotguns, the KSG and the Benelli load one round at a time
    (a speed loader pushes in two or four).
  - **Conversions**: some guns turn into others with a kit (an M4 into a 9mm AR-9, an AK into an RPK).
    See "Conversion kits" above.
  - **Slugs**: a slug shotgun that reaches out to range.
  - **Recoil** kicks hard. Each shot throws the muzzle up and to one side; a soft spring brings most of it
    back, so sustained fire stacks up and climbs. Part of every kick also moves your actual view and stays
    there, so you pull down to hold a target. A 10-round burst climbs about 15° on an AK, 10° on an M4 and
    5° on an MP5; a bolt-action round kicks about 11°.
    Most of the kick shows as your view punching up and to the side (80% of the climb, 70% of the side
    kick, with a touch of roll); the gun itself turns only a little on screen. Rounds go where the bore
    points. There's **no crosshair**: you aim with the sights, or by where the gun's pointing at the hip.
  - **Where the kick comes from:** the round and the gun's weight, not a number per gun. A shot pushes back
    with the bullet's momentum plus the powder gas behind it (about 1.75× the bullet's speed); a heavier gun
    moves less for the same push. The climb goes as push^1.35 / weight^0.7, ×1.3 for a handgun (it pivots on
    your wrist), scaled so a 2.9 kg M4 kicks 1.1° a shot. On top of that, design: a stock that drops below the
    bore (AKs, old wooden stocks) climbs 25% more, a manual action (bolt, pump, lever, break-open, revolver)
    40% more (nothing in it softens the kick), and a few guns are built against it (the Vector's bolt goes
    down, the G36, the M82's recoiling barrel, the harness-braced minigun). Every gun has its real weight now
    (an M249 7.5 kg, a PKM 7.5, an M60 10.5, an RPK 4.8, a P9 0.75, a TX22 0.6). So an M249 kicks 0.62° to
    the M4's 1.1, a PKM 1.5 to a SCAR-H's 2.3 and an AK's 1.7 on the same class of round. Your build counts:
    its own weight (a 0.5 kg suppressor takes about 8% off before its own effect), its barrel (a longer one
    pushes the round faster, so it kicks a little more), and the load (subsonic is a fraction of ball's kick
    from a rifle; a slug pushes harder than buckshot). The gunsmith's Weight and Recoil show the result.
  - **The shove back:** each shot also drives the gun back toward you, and you push it forward again, harder
    and harder as it nears the room there is (aiming, the sight's eye relief short of your eye: 2 cm behind a
    4× combat scope; from the hip, 12 cm). It never comes near in ordinary fire (a 30-round AK burst through a
    4× scope uses a fifth of it), but if it ever does, the kick that can't go back goes into the climb and
    out to the side instead: a long burst can't put your eye in the scope's tube.
  - **Shotgun beads:** the bead guns (the 870, the double barrel, the sawed-off) have a rib from the
    receiver to the muzzle, level with the top of the receiver, with a brass bead on its end. Aiming, you
    look along the receiver and rib with the bead on the target. A side-by-side's forend sits under the
    barrels.
  - **Accuracy:** aimed, a gun puts its rounds in a cone as wide as the real gun groups, in MOA, with service
    ammunition: an AWM 0.5, an R700 0.75, an SR-25 1, an HK416 or SCAR-L 2, an M4 3, an AK-74 3.5, an AKM 5, an
    M249 5, an MP5 3, a Micro Uzi 9, a Glock 10, a 1911 or USP 8, a .357 6, a smoothbore slug 5. The gunsmith shows
    each build's figure (barrels and the like move it). That's the gun alone, as if clamped in a vise: on top of it
    comes what you add holding it (breathing sway, moving, recoil, a flinch when hit), and from the hip a wider
    cone of its own.
  - **Aim sway and stocks** (`G.aimSway`): a stock to your shoulder is what steadies a gun. A build is `braced` when
    it has a real stock fitted (a folded or deleted stock, or a bare buffer tube, isn't one; a long gun without a
    stock slot has its stock built in; a handgun has none). A handgun on a stock (the derringer on its stock-lug
    grip with an SMG stock) sways about as little as a carbine; a rifle or SMG with its stock taken off is held out
    in the hands like a pistol, heavier, and wanders worse than one (about three times an M4's). The gunsmith shows
    it as Aim sway (an M4 100%, a pistol about 200%, a stockless rifle about 290%).
  - **Shotgun patterns:** a shot has one aim error, the same as any gun (wide from the hip, tight aimed
    down the bead), and the pellets spread around that point in the gun's own pattern, denser in the
    middle. With buckshot, 90% of pellets land within about 25 cm at 10 m from the double barrel, 32 cm from
    the pumps and semi-autos, 75 cm from the sawed-off, and 88 cm from the Judge (.410 out of a rifled
    barrel). Birdshot opens the pattern by half again, flechettes tighten it by 30%, and a slug has no
    pattern and twice the range. Buckshot ranges are 15–18 m for the long guns.
  - **Integral suppressors**: the MP5SD and VSS fire subsonic and quiet.
  - **Crossbow**: nearly silent; enemies only hear it from 2 m.
  - **Akimbo**: two guns that alternate shots and can't aim down sights.
- **Kit** (`js/gear.js`): named products from brands, like the weapon parts. Suspects wear the same kinds of
  protection.
  - **Carriers and vests** give soft armour where they cover. Most have a pocket for a plate and a MOLLE
    panel for pouches. The chest rig has no armour at all, and it and the assaulter carrier have the most
    MOLLE.
  - **Plates** go in a carrier's plate pocket and cover the chest. They're what stops rifle rounds.
  - **Helmets** cover the top of the head. The visor model covers the face too.
  - **Face shields and mandibles.** The high-cut, full-cut and rifle-rated helmets have a mount for one. It
    goes in its own equipment slot ("Face shield / mandible") under the helmet, and comes off with the helmet
    if you take that off.
    - **Mandible guard:** handgun-rated, guards the jaw. It's in the way of about two face hits in five.
    - **IIIA face shield:** covers the whole face (nine in ten face hits). Stops handgun rounds, not rifles.
    - **Rifle face shield:** whole face, turns some rifle rounds. Heavier.
    - **Where to get them:** they turn up in the quartermaster's gear rotation. A helmet with a mount is
      sometimes offered with one already fitted (about a third, by rarity: mostly mandibles), with its price
      included.
    - **Suspects wear them too**, deeper in a run: on a full-cut or rifle-rated helmet (a visor has its own), by
      gear tier, a mandible / IIIA shield / rifle shield at 6/2/0% at tier 2, 16/10/2% at tier 3, 20/18/8% at
      tier 4 (none at tier 1); the Enforcer always, from tier 3 (a mandible, then a IIIA shield). It's on their
      helmet as it is on yours and in the way of your rounds the same (`ENEMY_GEAR.face`, js/data.js; sent with
      their kit, the fourth field).
    - Without one, a face hit on an open-faced helmet is still a kill.
  - **Bodies.** Everyone has the same build:
    - a rounded head with a jaw, nose, ears, eyes, brows and mouth; hair as a cap, hidden under a helmet (the
      head's the same shape either way, and fits inside every helmet)
    - a chest tapering to the waist, sloped shoulders, tapered arms and legs with elbows and knees
    - hands with fingers and a thumb; boots, or shoes for civilians
  - **Your look** (the main menu, under Appearance, with a turning preview):
    - top: combat shirt, long-sleeve, T-shirt (bare forearms) or hoodie, in a colour of your choice
    - pants: combat (knee pads), cargo (side pockets) or jeans, in a colour of your choice
    - eyewear: none, glasses, shooting glasses or goggles
    - gloves: tactical, leather, fingerless or none

    Teammates see it. **Your squad animal** (snake, seal, frog, cat, raccoon or hyrax, picked in the main menu) is
    your callsign: its emblem is a patch on your left shoulder, and a name patch high on your back (on your
    backpack if you wear one) has the emblem and your name. There are no nameplates over anyone's head. One of each
    animal to a squad: if yours is taken when you join, the host gives you the first one free. Each animal has its
    colour, which marks your name in the team list, the scoreboard, chat and pings. Your own arms in
    first person match your sleeves and gloves. Suspects and civilians are dressed for who they are: hoodies,
    balaclavas and the odd cap; T-shirts, jeans and glasses.
  - **You look like what you wear.** Teammates see each officer's actual kit (`js/rig.js` `setKit`), and it
    updates as you change gear or drop it:
    - **Helmet:** its cut and colour. The modern ones have side rails and a night-vision mount.
    - **On the helmet:** a mandible (arms down from the helmet's sides into a guard curving round over the
      mouth, chin and top of the neck), or a tinted shield over the face (darker and thicker for
      the rifle-rated one).
    - **Body:** a soft vest, a slick plate carrier, a chest rig, or a full carrier. With a plate in, the
      outline shows at the front. Each mounted pouch shows. Assault and heavy carriers add shoulder armour,
      and the heavy one a collar and groin plate.
    - **Belt, pack, IFAK:** the belt and its pouches; a sling, assault or ruck pack sized to match; the IFAK
      at the back.
    - Wearing nothing, an officer is in their team-colour shirt, bareheaded.
  - **Belts** have MOLLE too. The duty belt has one row (pistol pouches, medkit or grenade only); the
    battle and war belts have two (rifle pouches fit).
  - **MOLLE and pouches:** a panel is columns × rows of webbing (slick 3×2, patrol and heavy 6×2, recon and
    war belt 7×2, assaulter 8×2, battle belt 6×2, duty belt 4×1). Pouches mount on it, taking their own
    footprint, and inside each one is a grid of the same size:

    | Pouch | On MOLLE | Holds (and stowed size) |
    | --- | --- | --- |
    | Pistol mag | 1×1 | two 1×1 pockets: a pistol magazine, speedloader or box of shells in each |
    | Rifle mag | 1×1 | 1×2: a rifle magazine (two pouches stack in one column of a 2-row panel) |
    | Double rifle mag | 2×2 | 2×2: two rifle magazines |
    | Triple mag shingle | 3×2 | 3×2: three rifle magazines, or an LMG box |
    | Dump | 2×2 | 2×2: anything; where a dump reload puts the old magazine |
    | Grenade | 1×1 | 1×1: a frag |
    | Med | 1×1 | 2×2: medical gear only, a splint and a few more |

    In the Kit tab each mounted pouch is shown at the size of what it holds, side by side in MOLLE order;
    Edit pouches shows the panel itself, where each takes its MOLLE size.

    Gear comes with only a pouch or two as issued (the shop card lists them): slick carrier 1 rifle;
    patrol 2 rifle; recon rig 2 rifle; assaulter a double rifle and a grenade; heavy 2 rifle and an IFAK;
    duty belt 1 pistol; battle belt 1 rifle and an IFAK; war belt its dump pouch. Fill the rest yourself.
    The vendor's Stock page has four random pouch types each visit, 1–3 of each (the big ones turn up
    less often), for ¢30–120. A pouch you buy goes straight onto free MOLLE if there's room, else to your
    locker. In the Kit tab, each panel shows
    its pouches where they're mounted, holding their contents. **Edit pouches** turns the panels into
    grids of pouches that you can drag around, mount from the locker or take off. A pouch keeps its contents
    when you take it off.
  - **Containers:** double-click a pouch, backpack, carrier or belt that you aren't wearing (in the locker
    or a pack) to open it. It opens in a panel under the locker, where you can drag things in and out, and
    you can open containers inside open containers. Up to four panels stay open; × closes one. A container
    closes by itself once you wear it or mount it.
  - **Right-click** any item for a menu:
    - Open (containers)
    - the quick move: Send to locker, Wear, Fit in carrier, Carry, Mount on MOLLE or Take with you
    - Sell for half (not while it has anything in it)

    Double-click on anything that isn't a container still does the quick move.
  - **Opening a gun:** double-click or right-click it (in your hands or stowed) to open a panel showing
    its part slots and the magazine in it, each as an item.
    - **Parts:** drag a fitted part off to your locker, a pouch or the sell box. Drop a part on a slot to
      fit it, and whatever was there goes to your locker. Parts that hung off a removed part come off too
      (a muzzle device with its barrel). You can also drop a part straight onto a gun anywhere (in your
      hands, the locker, a pack) and it goes on the slot it fits.
    - **Core parts** (barrel, handguard, pistol grip and the like) can come off too. The gun then won't
      fire: the trigger just clicks and says what's missing. The panel marks the empty slot in red and the
      HUD and inventory say "won't fire" until you put one back.
    - **Magazine:** drag it out, or drop one in (the old one goes where the new one was). You can also
      drag a magazine from anywhere straight onto the gun itself. A gun with no
      magazine in it is empty until you put one in or reload. Loose-fed guns show their rounds instead:
      drop a box on them to load.
  - **Weapon parts are items.** Parts you own but haven't fitted sit in your locker, or anywhere you put
    them. A 3×1 barrel, a 2×1 stock, handguard or suppressor, a 1×1 sight or grip, and so on. The Gunsmith
    tab still fits from them ("Fit (stash ×N)") and puts parts it takes off back in the locker. The locker
    grows two rows if it ever overflows.
  - **Right-click actions** besides open, move and sell:
    - **Magazines:** Unload (into a box of that type), Load from your boxes, Put in your gun
    - **Boxes:** Load magazines from it
    - **Guns:** Remove magazine, Load a magazine; Unload or Load for loose-fed guns
    - **Parts:** Fit to your gun (or swap)
  - **Backpacks** are one big grid that takes anything, guns included. A gun is an item the size of the gun:
    a pistol is 2×1, a compact SMG 3×2, a Thompson or PPSh 4×2, a carbine, rifle or shotgun 5×2, and a
    sniper rifle, LMG or long battle rifle 6×2. Guns only go in a backpack or the locker.

  | Kind | Products (brand) | Made of (where), and what it stops head-on new (worked out: js/ballistics.js) |
  | --- | --- | --- |
  | Vest / carrier | Ghost concealable vest (Northmark), PC-1 slick carrier (Kestrel), Patrol carrier (Ironvale), Recon chest rig (Vantage), Assaulter carrier (Paragon), Heavy assault armour (Sable Ridge) | Soft aramid round the chest and stomach, 6–8 mm: 8 mm stops 9 mm, .45 ACP, .44 Magnum and buckshot, not 5.7x28 or any rifle (6 mm not the .44). The heavy armour adds 5 mm steel side plates (stops 7.62x39 and 7.62x51, not 5.56) and aramid over the groin, shoulders and thighs. The slick carrier and chest rig have none |
  | Plate (front and back of the chest, 25 x 32 cm) | IIIA soft insert (12 mm aramid), AR550 steel (6.35 mm), UHMWPE (20 mm), ceramic (9 mm on 6 mm PE), multi-hit ceramic (9.5 on 8) | Soft insert: handguns and 5.7x28. Steel: 7.62x39, 5.56 and 7.62x51 ball, not armour-piercing. UHMWPE: 7.62x39 and 7.62x51, not 5.56. Ceramic: armour-piercing 5.56 and 7.62x39, .338 Lapua; not .50 BMG |
  | Helmet (the skull above its brim: a high cut clears the ears, a full cut covers them) | Bump (3 mm ABS), high-cut IIIA (8 mm aramid), full-cut IIIA (9 mm), rifle-rated (18 mm PE), visor (18 mm PE + 10 mm polycarbonate visor) | Bump: nothing. IIIA: handguns to .44 Magnum. Rifle-rated: 7.62x39 and 7.62x51, not 5.56. Visor: 9 mm, .45 and buckshot to the face |
  | Face (on a helmet's mount) | Mandible guard (Kestrel: the jaw), IIIA face shield (Ironvale), rifle face shield (Meridian: 14 mm polycarbonate on 10 mm PE) | Polycarbonate 10 mm: 9 mm, .45 and buckshot. The rifle shield: 7.62x51 too, not 7.62x39 or 5.56 |
  | Belt | Duty (Graywater), battle (Kestrel), war belt with dump pouch (Paragon) | — |
  | Backpack | Sling pack 4×3 (Graywater: pistols, compact SMGs), 3-day assault pack 5×3 (Kestrel: up to rifles and shotguns), large rucksack 6×5 (Sable Ridge: any gun, 3% slower) | — |

  - **Rounds against armour** are worked out physically (`js/ballistics.js`, `G.Ballistics`). Each layer has a
    ballistic limit for each round, de Marre's, from its thickness and the round's diameter and mass, met by the
    round's speed when it arrives times how well its core works on that material. Fabric catches soft lead pistol
    rounds and lets narrow hard ones through; hard plate flattens lead and breaks mild steel, and a hardened steel
    or tungsten core gets through it. At an angle a layer is thicker along the path, and a hard face can glance a
    round off. A round that gets through comes out slower, and through a hard plate, flattened and tumbling. A
    plate's back face does it too: a round through you can stop in your back plate. The shop's cards and the Kit
    tab's armour readout show what each piece stops, from the same sums (`rating`).
  - **Wear:** armour wears by the energy it soaks up (each material its own: steel takes the most, ceramic cracks
    soonest), and a worn layer is thinner.
  - **Blunt trauma:** a stopped round still bruises, by the share of its energy the material passes on (soft
    armour most).
  - **Weight:** heavy kit slows you down (steel plates and heavy armour most).
- **Inventory** (Tarkov-style, the Kit tab at the quartermaster's):
  - **Grids:** your pockets are two 1×2 (a rifle magazine each) and two 1×1. The pouches on your carrier's and belt's MOLLE are small
    grids, most limited to magazines, a grenade or a medkit; dump pouches take anything. A pouch can hold more
    than the MOLLE it takes: med pouches are 2×2 on one slot, rifle pouches 1×2 on one, dump pouches 2×2 on a 2×1 strip.
  - **Item sizes:** a rifle or SMG magazine is 1×2, a pistol magazine, speedloader, en-bloc clip or box of
    shells is 1×1, an LMG belt box is 2×2, and medkits and grenades are 1×1. Items turn (1×2 to 2×1).
  - **Icons:** every item has a picture, drawn in code (`js/icons.js`). Magazines look like their gun's
    (curved, AK banana, straight pistol, drum, P90 top magazine, ammo can, speedloader, en-bloc clip) and
    show a round on top when loaded. Ammo boxes show the caliber with a stripe in the ammo type's colour.
    Gear is drawn by kind and tint. Guns are their own 3D model as built, rendered side-on. Icons turn
    with the item, and shop cards show them too.
  - **Weapons:** the Kit tab has Primary and Sidearm slots. Drag a gun into a backpack (or the locker) to
    stow it, keeping its build and loaded magazine, and drag a stowed one onto its slot to carry it. You
    always keep at least one gun in hand. Double-clicking a stowed gun in the locker carries it if that slot
    is free. A gun dropped on the sell box sells for a quarter of its price, and its aftermarket parts go to
    your stash. Ammo, magazines and Load Magazines cover stowed guns too.
  - **In the field:** hold **B** to swap the gun in your hands of that kind for the next one in your
    backpack (2.2 s; your old one goes in its place). Release B to cancel. At the weapon case, if your pack
    has room, your old gun goes in your backpack instead of the case. The HUD lists what's in your pack.
  - **In a level, Tab** opens the same Kit screen for what you carry. Your body (see Injuries) replaces
    the locker, and the scoreboard sits on top. The level
    keeps going and you stand still while it's open.
    - You can rearrange pockets, pouches and pack, swap a gun with one in your pack, open pouches and
      guns, take magazines out and put them in, and load or unload magazines and boxes.
    - **Dropping and picking up:** anything you carry can be put on the ground. Right-click it and choose
      "Drop on the ground", or drag it onto the drop box under your equipment.
      - **Any item:** a magazine, a bandage, a pouch, a backpack or rig with everything in it, a plate, or a
        gun with its build and rounds.
      - **Exceptions:** parts on a gun come off only at the quartermaster's, and your last gun stays in hand.
      - **On the floor:** a gun lies on its side; anything else is a small box with its icon on top. Hold
        **F** near it to pick it up. Gear you're not wearing goes back on, a gun goes into its hand slot if
        that's free, a pouch straight onto your MOLLE if there's room on it, and everything else into your
        pockets, pouches or pack.
      - **No room:** the item stays on the floor.
      - **Co-op:** the host keeps track of what's lying about, so teammates see it and can take it, and the
        first to reach it gets it. Items last until the end of the level (up to 80, the oldest go first).
    - The locker, selling and changing parts wait for the quartermaster. Unloading needs room on you for
      the loose rounds.
    - **Ammo takes real time in the field.** A strip above "On you" shows the current job with a progress
      bar, how many more are queued, and Cancel. Times:
      - thumbing rounds into a magazine: 0.7 s per rifle round, 0.55 s per pistol round, 0.25 s per round
        when linking a belt
      - shells into a tube or break-action: 0.6 s each
      - unloading: 0.25 s per round, back into a box of that type (topping up a part-used one first)
      - a magazine into a gun: 1.2 s; out of it: 0.9 s

      Rounds move one at a time, so stopping keeps what's done. Closing the screen stops whatever you were
      doing. At the quartermaster's it's all instant.
  - **Reloads** (magazine guns):
    - **R** is a retention reload. The old magazine comes out, goes back in its pouch on your chest, and
      then a fresh one comes out. It takes 1.35× the gun's reload time and you keep every round.
    - **Double-tap R** is a dump reload. With a dump pouch that has room, the old magazine goes in there
      (1.0×). Without one, it's dropped on the floor (0.82×). Dropped magazines fall and clatter physically
      (client-side) and stay on the floor until the level ends. Walk up to one and hold **F** (0.6 s) to
      pick it back up, with whatever rounds were left in it, if there's room on you. Leave it behind and
      it's gone.
    - A reload reaches for the fullest magazine in your pouches and pockets. Only if there's none there
      does it dig one out of your backpack, which takes 1.8× as long.
    - Tube-fed guns, break-actions and en-bloc clips reload as before.
  - **Ammo is what you carry:** the HUD's reserve count is the rounds in the magazines and boxes you have
    for that gun, and the HUD shows the type of round that's next.
    - A reload puts the fullest magazine in and the one that was in goes back in its pouch, so you can run
      out with partly empty magazines still on you.
    - Round-by-round guns (pump guns, the lever action, the Mosin, the M32) load from boxes.
  - **Ammo types** (`G.AMMO`, `G.CALIBERS` in `js/data.js`): loose rounds come in boxes by caliber (24 of
    them, from 9×19 to .50 BMG), and a box holds one type of round. Any gun of that caliber takes them;
    magazines still belong to one gun.

    | Type | What it does |
    | --- | --- |
    | FMJ ball | The standard round |
    | Hollow point | Opens to 1.37× its width once it's in flesh fast enough (pistol 260 m/s, rifle 480, or 70% of its own muzzle speed if that's lower): a wide track, its energy all spent inside, rarely out the far side; its soft nose flattens on armour. Its open nose drags more (20% shorter drag length): an M4's keeps 594 m/s at 300 m to ball's 642, and drops 33 cm to 29 |
    | Armour-piercing | A hardened steel (pistol) or tungsten carbide (rifle) core: goes through plate that flattens lead, and through people, late to tumble (a narrower track). A lighter, hard-cored bullet: leaves 8% faster (an M4: 952 m/s to ball's 881), so it drops less (19 cm at 300 m to ball's 29) and kicks a touch less |
    | Tracer | Burns red all the way out: a bright core with a glow, from a couple of metres past the muzzle to where it lands. Your starting P9 and its two spare magazines are loaded with them |
    | Subsonic | A heavier bullet under the speed of sound: less energy, shorter range; through a suppressor it's heard no further than a crossbow |
    | Buckshot | The standard shotgun load |
    | Slug | One 28 g soft lead slug that opens up: accurate, a huge wound, stopped by most armour |
    | Birdshot | A cloud of 0.2 g pellets that stop within centimetres: painful, rarely lethal past a few metres; armour shrugs them off |
    | Flechette | Hardened steel darts in a tight pattern: narrow and hard enough to get through soft armour; thin tracks |

    - **Magazines:** a magazine holds one type at a time. Drop a box on a magazine in the Kit tab to load it;
      if it held a different type, those rounds come out into a box of their own first. The free Load
      Magazines supply action tops up every magazine you own, and your guns, from your boxes (same type first).
    - **Boxes of rounds** hold twice what you buy at a time: a 5.56 box takes 60, 9 mm 100, 12-gauge 24.
      Purchases are still one standard box (30, 50, 12). Boxes of the same caliber and type stack:
      - drag one onto another to pour it in (what doesn't fit stays put)
      - right-click "Combine" merges all your part-used boxes of that kind into as few as hold them
      - rounds you buy, unload or are handed top up the boxes you already have before a new box is made
    - **Tube-fed guns** keep the order you loaded them in: the last shell in is the next one fired, so you can
      put two slugs on top of the buckshot.
    - **Buying:** the quartermaster always sells ball (or buckshot) for every caliber you own a gun in, by the
      box, and empty magazines. Each visit he also has special loads, three
      standard magazines' worth each (the middle magazine size of the guns that take it).
  - **Flashbangs** (¢150): a 1.5 s fuse, and they hurt nobody. Anyone with an eye on one when it goes off
    (in sight of it, within about 14 m) is blinded: suspects for 1.5 to 6 s, more the closer and the more
    squarely they were facing it. Blinded, a suspect can't see you, stands frozen and loses nerve, and is far
    easier to talk down (shout while they're dazed); civilians panic. On you (and your teammates: they work on
    the squad too): the screen goes white and fades back over a few seconds, half as bad facing away and not
    at all round a wall, and your ears ring with everything muffled for a while. It's heard 30 m off through
    the building.
  - **Throwing:** a grenade's key (3, 4, 5) brings it into your hand. While it's there its arc shows, dotted, to a
    ring where it'll go off (the throw it'll be, from the same flight steps as the real thing, so it's right).
    Hold left click to pull the pin (brighter), let go to throw. Right click picks the throw: underhand (a lob
    from the hip, about 7 m, rolling on along the floor), weak (about 13 m) or strong (about 21 m). Grenades
    bounce off walls, floors and ceilings, losing speed each time, then roll till friction stops them. You keep
    the next one in hand while you have more; out of them, the weapon comes back up.
  - **Your squad's hands:** teammates see you reload (the gun canted, the magazine out in the support hand, down to
    a pouch and back up with the new one, seated), inspect the gun (turned over to look along it), check the
    magazine (out of the gun and up in front of you), hold a grenade, draw it back (high overhand, low
    underhand) and throw it. Suspects changing magazines show it the same way. (The magazine shows on the 52 guns
    that take a detachable one; shotguns, revolvers, bolt-actions and the like load loose rounds.)
  - **Grenades and medical items** are items too: medical items are used
    on the body in the Tab screen (H opens it).
  - **Locker:** everything else waits in your locker, a 9×7 grid that stays at the quartermaster's between
    levels.
  - **Team locker:** under your locker, a 7×5 grid the whole squad shares for the run. Put things in for each
    other and take what you need; everyone sees changes at once. The host keeps the real one: if two of you grab
    the same thing at once, whoever the host hears first gets it (the other gets a message, and it's gone from
    their side), and anything put in after it filled up comes back to your locker.
  - **Controls:** drag items between grids, press R to turn the one you're holding, and drop gear on an
    equipment slot to wear it (a plate goes in the carrier's plate slot). Double-click moves an item between
    you and the locker. Drop anything on the sell box for half its price.
  - **Carriers keep their contents:** swapping carriers moves the old one, pouches and plate included, into
    your locker.
  - **Weapon case:** a found gun comes loaded with two full spare magazines (or two loads of rounds in
    boxes for a loose-fed gun), all of one ammo type. The type is rolled by rarity: in a rifle or pistol
    caliber, about 53% ball, 15% hollow point, 15% tracer, 10% subsonic and 5% AP; in a shotgun, about
    55% buckshot, 22% slug, 17% birdshot and 6% flechette. The spares go wherever they fit on you, and any
    that don't are dropped at your feet to pick up. A gun you swap into the case takes its magazines and
    its ammo type with it.
- Supplies:
  - **Ammo resupply** refills your guns and every magazine and box you own. There are no ammo caches in
    levels, so this is how you restock.
  - **Spare magazines or boxes** for each of your guns.
  - **Medical items** (all six, see Injuries), **frag grenades and flashbangs.**

  Anything you buy needs room: it goes into a pouch or pocket that takes it, otherwise into your locker. Suppressors are muzzle parts from the gunsmith:
  enemies only hear suppressed shots from about 6 m instead of 28 m, so you can thin out a room before it wakes up.
- **Fire selectors (X).** Most select-fire guns come set to semi, with full auto a click away. The HUD shows
  where the selector is.
  - **No semi:** cheap open-bolt guns and belt-fed machine guns are full auto only: the MAC-10, Micro Uzi,
    AA-12, M249, PKM, M60 and the minigun.
  - **Bursts:** the BR-3 has semi and a three-round burst at 1600 rpm, just short of the AN-94's hyper burst; the Auto-9 semi and burst; the AN-94 semi and its fast
    two-round "hyper" burst. The pair leaves before the recoil reaches you, so together they kick a little
    less than two rounds would. Then it settles to its own 600 rpm. Overall the AN-94 handles like a 5.56 rifle,
    about 15% livelier.
  - Semi-only guns (pistols, shotguns, rifles with no auto) are unchanged. The shop's RATE line lists each
    gun's modes.
- **Gunsmith** (a shop tab, Tarkov-style). Every weapon is a platform, its receiver and trigger group, with
  slots for parts. Depending on the gun these are:
  - barrel, muzzle device, handguard, rail mount, foregrip, tactical (a light or laser on the right side rail, and
    another on the left), sight, charging handle, pistol grip, stock,
    magazine, magazine tube or forend;
  - on pistols, a slide and a threaded or match barrel;
  - for the specials, a minigun drive motor, railgun capacitor bank or crossbow limbs.

  Parts come from fictional makers (Kestrel Arms, Vantage Tactical, Wraithworks, Strix Optics, Meridian
  Precision and others), about 600 in all, and every slot has several to choose from.
  - **Compatibility:** every slot is an interface standard, and a part fits any slot of its interface. The
    gunsmith shows the interface under each slot, and each part lists what it fits.

    | Interface | Takes | Fits |
    | --- | --- | --- |
    | Picatinny top rail | red dots, holos, prisms, scopes | 46 weapons |
    | Underside rail (M-LOK / Picatinny) | foregrips | 26 weapons (only with a railed handguard) |
    | Side rail (right and left) | lasers and weapon lights, one each side | 53 weapons (built into the F2000, Tavor, AUGs, P90 and MP7; otherwise a railed handguard or pump forend, or a clamp-on rail mount) |
    | Clamp-on rail mount | barrel clamps with a side rail on the right, or both sides | 9 weapons: the long guns with no railed part to fit (integrally suppressed and jacketed guns, the PKM, the machine pistols) |
    | AR-15 grip mount | pistol grips | 20 weapons |
    | Other stock mounts | stocks | AR-15 buffer tube, AK trunnion, rifle stock, SMG, precision and machine-gun mounts |
    | Muzzle threads | flash hiders, brakes, compensators, suppressors | 5.56, 7.62, AK, 9mm, .45, PDW, .50, pistol, .22, 12ga chokes |
    | .22 ½-28 (the TX22, threaded from the factory) | its own rimfire devices (a thread protector, a flash hider, a compensator, a compact and a long rimfire can), and every 9 mm and 5.56 ½-28 device (the same thread, built for far more pressure) | the TX22; its rimfire devices fit nothing else (a rimfire can isn't rated for a centrefire round) |

    A thread only exists on a threaded barrel. Barrels, magazines, slides and magazine tubes are made for
    one weapon.
  - **Standard parts are real products:** a gun's standard attachments are catalogue products shared with
    every gun of the same interface. The M4's stock is the same Kestrel CS-4 any AR-15 can use. Each
    weapon is calibrated so its standard build keeps its stats, and changing a part moves them from there.
  - **Missing parts:** handguards and pistol grips can't be left off. Running without a stock is allowed,
    but costs a lot of recoil.
  - **Stats:** parts change ergonomics (the gun's ergonomics number is its class's base plus its parts; what
    counts in play is the parts' total change: each point is about 1% on aim-down-sights speed, draw speed and how
    fast the muzzle comes back after a shot, limited to 0.55–1.45×), recoil, aimed and hip spread, muzzle velocity
    (damage and range), weight (movement speed), tube capacity, and sight magnification.
  - **Magazines aren't parts.** Compact, extended, drum and belt-box variants are magazine items (bought
    with the magazines on the Stock page), each with its own capacity, size and handling. Whichever one is
    in the gun is its magazine: reload with a drum and the gun holds a drum's worth and reloads like one
    until you swap back. Only a conversion from an internal magazine to a detachable box (the bolt guns)
    is a gunsmith part.
  - **Sound:** barrel length and the muzzle device feed the gunshot synth, so a short barrel or a brake
    sounds different.
  - **Using it:** the 3D view orbits and zooms. Hover a piece to see what it is, or click it to pick its
    slot. Hover a part in the list to preview it on the gun with its stat changes (at the top of the stat card, what it changes, old to new, as the attachments box shows; below it each stat marks its change and by how much), and click to fit it. A slot
    the gunsmith has a part for in stock (one that fits it, not the one on it) shows a red "!", on its dot on the
    model and on its row in the list.
  - **Stash:** fitting buys the part if it isn't in your stash. Parts you take off go to your stash, and
    stash parts sell back for half. Swapping a weapon at a case strips its aftermarket parts into your stash.
  - **Stock:** the gunsmith has three random parts for sale each visit, the same for the whole squad. They
    show in the Stock tab, marked with which of your guns they fit, and in the Gunsmith. Parts that fit many
    weapons turn up more often, and better parts appear deeper in the run. Buying one takes it out of
    stock.
  - Your build shows on your character for the rest of the squad.
- Opponents are what a police tactical team actually faces:
  - Armed suspects (handguns), gunmen (SMGs, then rifles), shotgunners and lookouts (hunting rifles, then
    scoped ones, which telegraph with a laser), in street clothes and balaclavas.
  - Enforcers (belt-fed guns, always armoured), the only ones who throw grenades.
  - The Kingpin boss every 10th level, in assault armour.
  - **Their kit progresses at its own pace with the level**, the way the squad's does (`G.ENEMY_GEAR` in
    `js/data.js`). Each suspect rolls a gear tier around the level's, sometimes one lower or higher:

    | Levels | Tier | Typical kit |
    | --- | --- | --- |
    | 1–2 | 1 | Cheap handguns, derringers, sawn-offs, street SMGs. Almost no armour. |
    | 3–4 | 2 | AKs, MP5s, pump guns, hunting rifles; a quarter in soft vests, the odd helmet. |
    | 5–7 | 3 | Carbines and semi-auto shotguns; most armoured, some in plates, a third in helmets. |
    | 8+ | 4 | Modern rifles, AA-12s, DMRs; plates common, half in helmets. |

    Suspects wearing armour show it, with a vest over their clothes and a helmet.
  - They have human health and wear the same armour you do, so pick your shot: the face, the stomach below
    the plates, the limbs, or a heavier round.
  - Rounds passing close by suppress them: they shoot worse and duck into cover.
  - Their aim falls off with distance: a little worse than it was up close, much worse at range. At their
    weapon's range they hit about a sixth as often as point-blank.
  - They act out of fear, not bravado. Once alerted, most dig in where they are and watch the doorway instead
    of hunting you down. Only shotgunners and enforcers push forward, and only while their nerve holds.
  - Morale drains when they're hit, pinned by near misses, shouted at, or watching a friend go down.
    Nobody breaks in the middle of a gunfight, while they can see you and shots are being traded. Fear only
    tells once the fight lulls. Broken suspects run and hide and fight back if cornered; they still only surrender when shouted at.
    Enforcers are steadier, and the Kingpin never breaks.
- Enemies use cover. They path to furniture between themselves and you, crouch, and stand up for a moment to shoot,
  so watch for the visor glint and catch them as they rise. They also hold wall corners and doorways,
  leaning out sideways to fire. From level 2 they also throw grenades at players hiding
  behind cover or where they last saw you. A GRENADE warning points at any live grenade nearby.

## Characters, hitboxes and gun models

- **Rig** (`js/rig.js`): every character is a jointed skeleton animated procedurally.
  - Legs use two-bone IK onto stepping feet, so there's no foot sliding, and strafing and backpedalling step correctly.
  - Arms use IK onto the carried gun's grip and support points.
  - It covers low-ready versus shouldered aim, crouch (a kneel), corner leans, recoil, hit flinches,
    grenade throws and a downed sit-up pose. Death is a ragdoll: Verlet particles at the joints, held by distance
    constraints with knee and elbow hinges, fall under gravity and collide with the floor, walls, doors and furniture
    (a body can end up draped over a sofa). Joints have real ranges:
    - hips: about 115° forward, 25° back
    - shoulders: a wide 105° cone
    - neck: 35° on the chest; head: 45° on the neck
    - spine twist: at most 45°
    - knees and elbows bend only one way

    Limbs are capsules that can't pass through the torso, the head or each other. Every joint has friction, and a
    limb can't roll about its own length more than 50° from how the torso holds it, so nothing spins loose.
    Falls are tuned to be clean: the knees give, the upper body is pulled over the way the killing shot was
    travelling until the spine is down, and joints on the floor stop dead rather than bouncing. The gun drops,
    and a body lies at rest in about 3 s (by 4.5 s at the latest, once it's down). Zip-tying a body (hold F, about 2.6 s) is hands-on: you take it by the shoulder and turn
    it onto its front, draw the wrists together behind its back, then tie them. Teammates see the body move with it.
- **Hitboxes** ride the animated bones: head, chest, abdomen, upper arms, forearms, thighs and shins.
  The zones are head, chest, abdomen, upper arm, forearm, thigh and shin.
- **Rounds are simulated through everything they meet** (`js/ballistics.js`, `js/materials.js`). A round is stepped a
  frame at a time as a changing thing (mass, diameter, length, yaw), and everything it hits is made of something.
  - **Materials** (`G.Materials.MAT`): armour, steel, cast iron, aluminium, concrete, block, brick, sanitaryware,
    hardwood, softwood, plywood, particle board, plasterboard, cardboard, packed paper, upholstery, foams, stock, plastic,
    earth, sand, water, glass, laminated glass. Each has a ballistic-limit constant (the speed to get through t mm is
    K·t^0.7·d^0.75/√m, the same de Marre law as armour, fitted to known results: 9 mm stopped by about 3 mm of mild steel and
    85 mm of pine, a brick stopping 5.56 and 7.62x39 and passing 7.62x51 slowly), a density and a strength.
  - **Constructions:** a solid in the world is a box, and a wall's box is 67 cm thick, so each has a construction: the
    skin on each face, what's between them, and the framing. A partition is plasterboard either side of a void with a stud
    every 40 cm (hit one and it's 89 mm of pine); apartments have brick outside, warehouses block inside and sheet steel
    outside, a bunker's walls are concrete all through, cold storage is steel-skinned foam. Every piece of furniture has its
    own (a fridge is thin steel and foam, a bookshelf mostly paper, a car thin steel with an engine in it). A wall
    much thicker than a partition is a mass of building and stops anything. See `PROPS` and `WALLS`.
  - **Through:** each layer takes speed (√(v² - v_limit²)), more at an angle, and what it took is the energy left in it.
    The round comes out off line, by more the more speed it lost, a hard core turning toward the surface's normal and a
    soft one away.
  - **Deformation:** the pressure on its nose is half ρv² plus the material's strength. Past what its core can stand it
    flows: wider and shorter (volume kept), by how far past and how much material it had to shove aside. Far past, it sheds
    jacket and nose. A fragmenting round comes apart, a hard core shatters on a harder face, and a hollow point's nose
    plugs in plasterboard or wood, so it doesn't open afterwards. That round goes on as it now is: a bigger frontal area
    against the next thing, more drag in the air, and into a body already tumbling (it can't expand a second time).
  - **Ricochet:** past about 40° off the normal, if its speed into the surface couldn't take it a calibre in, it glances,
    losing a share of its speed along the surface and most of its speed into it, flattened and tumbling. So a 9 mm skips
    off concrete at a shallower-than-30° angle where a rifle round digs in, and almost anything skips off steel. It happens
    on armour and on the curve of the skull too. It goes on from there with what it has left, into whoever's in the way,
    and that can be you. You hear it go.
  - **Suspects' rounds** are rounds: the host flies them as yours are, and they go by other suspects and civilians. What's
    rolled is only how well they're aimed: their hit chance sets the spread of their aim at the target, and whether that
    hits you is what's there: how much of you shows (crouched or prone you're a smaller target, no modifier), what's in
    the way, what the round does.
  - **Whoever fires a round decides what it did**, on what's on their screen: the bodies as they stand there and what those
    bodies are wearing (each officer's state carries their armour pieces and condition, `st.ac`). Your rounds on suspects,
    your rounds on a teammate and a suspect's on an officer (the host being its shooter) all work the same way: the
    finished wounds go to whoever was hit, who takes them as they are (`applyWounds`), wear on their armour included.
    So what you saw land is what landed.
  - **The squad** sees the holes, exits and ricochets of a round as they happened (`rfx`).
- **Armour and bodies are layers** (`js/materials.js` TISSUE, ARMOUR; `js/ballistics.js` through), met in order and each worked out
  as itself. Armour as worn: the carrier's cover, the strike face, the backer, a steel plate's spall liner, the trauma pad;
  the other way round leaving through a back plate. A stopped round's back-face energy is damped by each layer behind
  what stopped it. A body: skin (about 10 J for a 9 mm to break through, why a spent round stops under it on the way out),
  fat, muscle, each part its own thicknesses; the ribcage (ribs about every 3 cm with muscle between, the breastbone, the
  shoulder blades); the skull as outer table, diploë and inner table; organs in their own tissues; bones a cortical shell
  round cancellous bone or marrow. A bone deforms a round, turns it, tips it over, and shatters: its splinters tear
  tracks of their own. With the hitboxes on (F9) the readout lists the last round's path through its target, layer by
  layer, with its speed into each.
- **The highlights replay rounds as they really flew** (`js/highlights.js`): each round's path is kept (`js/player.js` newPath: every
  point, its speed, what it went through or off, who it went into, and the state it reached them in) and shared with the squad,
  suspects' rounds and every shotgun pellet too (`rpath`). Tracers and the bullet cam follow it round ricochets, the holes,
  exits and ricochet flashes appear as it gets to them, only those it really hit bleed, windows break when they
  did, and the x-ray re-runs the actual round as it arrived, listing what it went through, walls and armour and tissue,
  layer by layer. All of it goes in the recording .zip; older recordings still play, with straight lines.
- **F9 keeps every shot that hit someone** (`js/shotlog.js`): for the level (the last 32), whether or not the hitboxes were on when it
  was fired, the round's whole trail stays, coloured by speed, with a ghost of whoever it hit as they stood when it struck. Look at
  someone and the trails of the shots that hit them light up with markers in the world: the speed at the muzzle, where it fell
  through each Mach number (from 3 to 0.5, and how far out), what it went through or off, its entry speed and energy, its speed past
  their armour and the energy that cost, its exit speed or where it stopped and in what. The readout lists the same for each shot.
- **Rounds damage what they hit, by what it is** (`js/scars.js`): a mark and what's thrown out, from the material, whether the round went
  in, came out, skidded or stopped, which way it was going and how much energy it had. Metal dimples toward the hole, dragged along
  the round's line, and comes out of the far side in petals bent the way it was going; a round it stops leaves a dent with lead in it, and
  a ricochet a bright gouge. Concrete, block and brick crater and crack and throw chips and dust, spalling wider out of the back than the
  front. Wood takes a ragged hole and blows out in splinters; particle board crumbles; plasterboard takes a neat hole in and a torn,
  paper-edged blowout out, and hangs in the air as dust. Tile, cast iron, glass and plastic star and crack; paper, cloth, foam and wool
  tear and shed what drifts; earth craters, water splashes, leaves fall. Chips land on the floor and lie there a while. Marks stay on
  doors as they swing, every player sees the same damage, and the replays show it too.
- **A face shield shows what it caught** (`js/hud.js` maskHit): where a round strikes a shield or mandible guard shows on your view through
  it: a star of cracks and a pulverised patch where it stopped one, a hole and a wide web where one came through, a short crack where one
  skipped off. They stay on that shield, wherever it goes, and don't show once you're dead.
- **Better-equipped suspects carry lights and lasers** (`G.ENEMY_GEAR.tac`): by the same gear tier as their weapons and armour, none to speak of
  at first, about three in four lights and over half lasers at the top; an Enforcer always has the light from the second tier, the Kingpin both.
  The light's on with the gun out, the laser once they're alert, both on whoever they're aiming at, and they use the same lights, beams and
  dots as the squad's.
- **Lights dazzle** (`js/glare.js`): looking into anyone's weapon light, a suspect's or your squad's, blooms round the lamp with streaks across
  your view, washing out the picture when it's bad. It takes a light pointing near you, you looking near it, and nothing in between, and it's
  worse the closer and brighter it is. It comes on quickly and goes slowly: look away and it fades over a few seconds, leaving a greenish after-image.
- **Wallbangs and ricochets are highlights** (`js/highlights.js`): a kill whose round went through something (not a pane of glass)
  or off something on its way there is called out from its recorded path. It gets the bullet cam, round every turn the round
  took, then a wall cam from the far side of the hole or a ricochet cam out in front of the surface, the round's line left hanging in
  the air, each thing it met tagged where it happened (how fast in and out, the energy it cost, the angle it skipped at), and whoever it's
  going for lit through the walls until it gets there. A kill like that keeps its own segment even inside a kill streak.
- **The armour cam** (`js/highlights.js`, `acPlan`): after a kill through armour, an officer going down through it, or a plate saving
  an officer, the replay shows that round's way through the armour as a cross-section. Their ghost first, with where it struck; then the
  layers cut in half in the order it met them (cover, plate, liner, pad, soft armour, then skin, fat, muscle, bone...), the round
  running through the cut, slowing as it did and changing shape as it did. Ceramic cones and cracks, plies part, the back face bulges by the
  joules that got through, and what it never reached stays untouched. Beside it a table of each layer's speed in and out, and a bar of
  where its energy went. It's all what the round recorded when it was fired (`G.Ballistics.armourLog`, on its path: the layers, its
  speed and shape after each, how far into the last one it got), so it's in the .zip and plays the same for everyone.
- **Damage is the energy a round leaves** (`js/ballistics.js` effects): what it deposited in a part, plus what reached the
  body through armour as blunt trauma, as a share of what a person can take (`PERSON_J`, 1600 J). Nothing else: no
  multipliers, no curve. Square on an unarmoured torso that's about 10% for a .22, 20% for 9 mm, 29% for a hollow point,
  70% for 5.56 or 7.62x39, 100% for 7.62x51, and 12% a pellet for 00 buck. A limb counts for only so much (`PART_J`), the rest
  going into tissue already wrecked. What a track does to an organ on the way (below) is on top of that. Armour wears by
  the joules it soaks, and a steel target on the range swings by the round's momentum.
- **Wounds are simulated** (`js/ballistics.js`), not multiplied: the damage and health model from tactical_game
  (its 3D anatomy and wound tracks, `src/preview3d.ts`), refitted to these bodies and made physical.
  - **The body is the rig's own shape:** each part a tapered elliptical cylinder or an ellipsoid in its bone's
    frame, the same sizes as the meshes (the chest 40 cm across and 25 deep, the head its cranium and jaw), with the
    organs inside where they are in a person. The skull holds the brain and brainstem; the neck the cervical spine,
    both carotid arteries and the airway; the chest the heart, lungs, aorta, thoracic spine and the top of the
    liver; below that the liver, stomach, spleen, kidneys, bowel, lumbar spine and abdominal aorta; the pelvis its
    bones and iliac arteries. Each limb has its long bone or bones, and the upper arm and thigh their arteries.
    Every organ there are two of is its own, one a side (left and right carotid, kidney, iliac artery, half of the
    pelvis, and each limb's bones and artery): a wound to one isn't a wound to the other, in an officer's body and in
    a suspect's record alike, and a suspect's broken bones are kept by limb. A broken half of the pelvis takes the
    leg on its side.
  - **A round's track through you:** the round is a physical thing (mass, diameter, length, core, nose) at the
    speed it arrives (it flies with drag). It passes your armour first, layer by layer, then the body, a few
    millimetres at a time. In tissue it slows by drag (dv/dx = -ρ·Cd·A/2m · v) and by the tissue's strength (a
    steady 0.4 MPa on its face, less in lung, more in bone), which is what stops slow rounds, nose-first and then,
    for a rifle round past its yaw depth (12 cm for 5.56, 26 for 7.62x39), tumbling side-on. Skin is tougher: each
    time a round crosses it, in and out, it costs what 5 cm of tissue would, the chest's wall (ribs, breastbone)
    3 cm of bone more, and a round with under 70 m/s left at the far side stays under the skin. Calibrated against
    bare ballistic gelatin: .22 LR about 33 cm, 9 mm FMJ 65 and hollow point 35, .45 FMJ 65, a 00 buck pellet 30,
    5.56 about 35, 7.62x39 55, 7.62x51 50. So full-metal-jacket pistol and rifle rounds go through a torso, a .22
    about half the time front on, buckshot and hollow points mostly don't. A hollow point opens out (to 1.37×, at
    70% of its own muzzle speed at most, so a slow .45 opens too), a .22's soft lead flattens (1.3×), a tumbling 5.56 or 7.62x51 round over its fragmentation speed (760 / 790 m/s)
    breaks up into fragments that tear their own tracks, and bone tips a round over. Lung is light, bone dense.
    Along the track it crushes what it passes through (its area times the distance) and gives up energy,
    stretching the tissue round it to a radius set by the energy per centimetre: that tears brain, liver,
    spleen and kidneys and barely bothers lung or muscle. Tissue gives about 2.5 cm of stretch; beyond that (a cavity of radius r: within
    r - 2.5 cm of the track) an organ that doesn't stretch well (brain, brainstem, heart, liver, spleen, kidneys, the
    big arteries) is torn apart, without the round touching it: a rifle-class deposit (about 100 J/cm: 600 m/s and up,
    or a big magnum). A handgun's cavity (2-3 cm) tears nothing; a 5.56's (5 cm) about 3 cm round the track, a
    7.62x51's (8 cm) 6 cm, but only once the round's yawed, past its first 12-17 cm (front on, the heart's in that
    neck; side on, or deeper, it's in the cavity). A liver, spleen or kidney torn apart bleeds out in seconds. It comes out the far side at whatever speed it has left,
    into whoever's behind (an arm held across the chest doesn't stop a round reaching the chest).
  - **What the organs do:**
    - the brain: dead (a graze only knocks you out); the brainstem or the spine in the neck: any round that touches
      it, dead on the spot;
    - the heart: any round through it wrecks it: down at once, dead a second or two later (one that only passes
      close, its cavity stretching it, bleeds it out in seconds);
    - the aorta or an iliac artery: bleeding out in seconds;
    - a lung or the airway: a punctured lung;
    - liver, spleen or kidney: heavy bleeding (packing gauze stops it);
    - stomach or bowel: a gut wound;
    - the spine lower down: a suspect's down for good; an officer just takes the damage and bleeding (no paralysis);
    - a long bone or the pelvis: a fracture;
    - an arm's or thigh's artery: heavy bleeding (a tourniquet stops it).

    A part's own damage and the blood it costs come from the energy given up in it and the volume crushed, a
    shot's wounds (all its pellets together) on a curve that grows slower than they do (1.225·f^0.65 of a person):
    unarmoured torso hits front on, a .22 takes about a quarter of a person (5 to kill), 9 mm 0.38 (3), a 9 mm or
    .45 hollow point about half (2-3), 5.56 and 7.62x39 0.75 (2), 7.62x51 all of them (1), a 00 buck blast at
    close range all of them, before any bleeding. Your wounds use the same curve. The
    Tab screen's body figure lists the organs each part has had hit (grazed, badly hurt, destroyed).
  - **Both ways:** it works the same on suspects (worked out on the shooter's machine, the injuries applied by the
    host: a spine or a stopped heart puts them down for good) and on you (the host says which part an enemy round
    hit; your machine traces it from the shooter through a body posed as yours, through your own kit).
  - **Toughness:** wounds don't scale with enemy health, so a person is as easy to kill on level 10 as on
    level 1. Only the tougher types (the Enforcer, about 1.5×, and the Kingpin, about 6×) take more.
  - **Explosions:** they still do plain damage; your torso armour stops its share of the fragments (each a ragged
    0.3 g chip at about 900 m/s, through the same layer sums).

  One round at 10 m into an unarmoured body, through the middle of the part (averaged over a dozen tracks with
  `js/ballistics.js`): the points of a 100-point person it costs at once, and what it usually leaves (in brackets:
  sometimes). Bleeding then does the rest: heavy bleeding takes a person in under a minute, massive in seconds.

  | Round | Head | Chest | Abdomen | Thigh | Upper arm |
  | --- | --- | --- | --- | --- | --- |
  | 9 mm ball | 18, dead | 12, lung (heart or aorta: massive) | 16, gut, bleeding | 15, bleeding (fracture) | 10, bleeding |
  | 9 mm hollow point | 29, dead | 30, lung, heavy (massive) | 29, gut, heavy | 27, heavy (fracture) | 22, heavy |
  | .45 ACP ball | 20, dead | 15, lung, heavy | 16, heavy (gut) | 15, heavy | 11, bleeding |
  | 00 buck, one pellet of nine | 12, dead | 10, bleeding (lung) | 10, bleeding (gut) | 10, bleeding | 7, bleeding |
  | 5.56 ball | 52, dead | 47, lung, massive | 46, gut, heavy, massive | 47, heavy (fracture) | 33, bleeding (fracture) |
  | 7.62x39 ball | 73, dead | 29, lung (massive) | 48, gut, heavy (spine) | 61, heavy, fracture | 45, heavy (fracture) |
  | 7.62x51 ball | 103, dead | 72, lung (heavy, massive) | 66, gut, heavy | 64, heavy (fracture) | 55, bleeding (fracture) |
  | .30-06 bolt gun | 109, dead | 84, lung (massive) | 84, gut, heavy, massive | 81, heavy (fracture) | 54, bleeding (fracture) |

  The 7.62x39 round's chest figure is low because it runs nose-first through a chest (it doesn't tumble until about
  26 cm in) and leaves with most of its energy. The 5.56 round tumbles at 12 cm and, fast enough, breaks up.
  Press **F9**, or add `?hitboxes` to the URL, to draw them.
  With them shown, a panel on the left reads out whoever is under the crosshair, up to the first wall: what the line
  from your eye crosses in them (each body segment, front to back, and the organs in it in order, `G.Ballistics.probe`),
  their condition (on the host, a suspect's whole record: health, strength, every bleed with its rate and how long
  they have, fractures, a collapsed lung, spine, heart; nerve, awareness, state; and every organ by region, intact,
  how much of it is gone, or destroyed), their
  armour with its condition, and their weapon and what's loaded. A teammate shows every body part and organ as they
  send it. A client sees what the host sends of a suspect (health, strength, bleeding, a broken leg).
  The x-ray, as the killcam's: everyone in clear view within 30 m shows their organs through their body, coloured by
  what's been done to them (red destroyed, amber hurt, bone white or green intact; a client sees a suspect's as intact,
  the host keeps the record), and whoever the readout's on is turned to glass, their organs bright.
  The readout is sticky: look away (or at nothing) and it stays on the last person you looked at, marked "last seen",
  still live (their condition as it changes, the distance to them now), with the line through them dimmed as it was
  when you last had them in your sights, until you look at someone else or they leave the level.
  Each round you fire with them shown leaves its path as it actually flew (a point a frame in the air: drag, gravity;
  inside a body a point every 4 mm of its track, as it slows; drawn over everything, so it shows inside a body), with a
  dot where it went into someone and where it stopped. It's coloured by its speed there, one scale for every gun: Mach
  2 (686 m/s) and over red, down through the rainbow to violet at a stop (`G.R.trailColour`, the scale at the top of
  the panel), so a rifle round shifts through the spectrum within a chest, and a pistol round starts green-yellow. The
  last shot's (every pellet of it) stays until you fire again; older ones dim and fade out over the 3 s after a newer
  shot takes over (`TRAIL_FADE`).
  The stretch of it inside someone is also kept on them for the rest of the level (`G.R.woundTrack`): a line on each
  bone it crossed, in that bone's frame, coloured the same, with its entry and stop dots, so it turns, falls and ragdolls
  with them. Shown whenever the hitboxes are.
- **Gun models** (`js/gunmodels.js`) are built from parametric parts at real-world scale: receivers, stocks,
  curved, straight and drum mags, handguards, muzzle devices, rails, optics, foregrips and lasers. Each
  weapon's build (`js/parts.js`) patches its receiver's model spec part by part. The same build makes the
  first-person viewmodel, with moving parts (pump forends, bolts, slides that lock back on empty, revolver
  cylinders, minigun barrels), and the merged third-person model that characters carry. Each recipe reports
  its sight height, so aiming down sights lines the optic up with screen centre.
- **Sights.**
  - **Iron sights follow the real sight pictures.** In every family the top of the front post is exactly on the
    sight line, which is where the round goes.

    | Family | Rear | Front | Used on |
    | --- | --- | --- | --- |
    | Aperture | The big "ghost ring" aperture between protective ears | A square post between taller wings, its tip centred in the ring | AR/M4, folding sights, FAL, Garand, M249, Uzi, MAC |
    | Ring and post | A drum aperture between wings | A post inside a ring hood: circle in circle, post tip in the middle | MP5 |
    | Notch and hood | A U-notch on a tangent leaf partway down the gun | A round post under a hood open at the top; post top level with the notch top | AK family, SVD, PKM, PPSh, Mosin |
    | Semi-buckhorn | A blade with curved wings and a small V | A gold bead sitting in the V | Lever action |
    | Pistol | A U-notch with a white outline | A white-dot blade ("ball in a cup"); night sights use three green tritium dots | Pistols (the sights ride on the slide) |
    | Revolver | A notch cut into the topstrap | A ramp with a red insert | Revolvers |
    | Bead | None | A brass bead | Shotguns |
  - **Red dots and holographic sights are collimated.** The reticle is a glowing plane a few metres down the
    sight's axis, so it sits at infinity like the real thing. It points where the gun points, drifts in the
    window as the gun sways, and is clipped by the window edge. It shows only through the glass: the window
    marks the stencil buffer and the reticle draws only there, so a hand or the housing in front hides it.
  - **The reticles:** red dots show an LED dot with a hot core and halo (green on the green dots). Holographic
    sights show a grainy 68 MOA ring and dot; the circle-dot sights a clean 65 MOA ring round a dot. They sit
    about 10 cm from the eye when aiming.
  - **Reflex sights:** tube dots in three sizes (micro, 30 mm, 34 mm), a green dot, a circle-dot, two
    and two holographic sights. Pistols take an open dot, a green dot, a circle-dot or an enclosed dot (glass at
    both ends) in their optic cut.
  - **Adapters** take a slot and give you one of their own: the pistol optic riser goes on a rifle's rail and
    lifts any pistol red dot to rifle height ("Sight (on the riser)"); a buffer tube adapter (AK, SMG or
    machine gun) is a bare AR-15 buffer tube that takes any AR stock ("Stock (on the adapter)"). On its own an
    adapter is as good as nothing in that slot.
  - **Magnified optics are picture-in-picture.** Prisms, combat scopes, LPVOs and rifle scopes show the world
    on their ocular lens, rendered from the lens along the scope's axis. The field of view is the lens's
    apparent size divided by the magnification. Prisms come in 1×, 1.5×, 2× and 3×; the combat scope is 4×.
  - **Variable power:** scroll while aiming to step the power: the LPVO 1/2/4/6×, the hunting scope 3/4/6/9×,
    the long-range scope 5/8/12/18/25×. Aiming sensitivity follows the power.
  - **Magnifiers** (2×, 3×, 5×) go on the rail behind a red dot or holographic sight.
    Scroll up while aiming and it flips in on its hinge (you see the dot, magnified); scroll down and it swings
    out and down beside the receiver, back to 1×.
  - **The rest of the view** only tightens slightly, so the gun and the room stay visible around the scope.
  - **Scope reticles and eyebox:** each scope draws its own reticle (duplex crosshair, illuminated chevron or
    circle-dot). A dark crescent creeps in when your eye isn't on the scope's axis, such as while you're
    still bringing it up.
- **Weapon lights and lasers** (a side rail, either side, or a pistol's frame rail). A light on one side and a
  laser on the other gives you both; a second laser doesn't steady your hip fire any further. Each is switched on the comms wheel
  (hold the middle mouse button). A light is a real spotlight from the gun that your squad sees
  too, and shone into a suspect's face from up to 15 m (22 m for the high-output one) it ruins their aim: they
  hit about half as often while it's in their eyes. A laser puts a red or green dot where the bore points (on a
  wall or on someone), and only tightens your hip fire while it's on. The PQ-15 module and the pistol combo
  unit have both. Both go where the gun goes: lowered (Space), coming up, mid-reload, the beam and the dot follow
  its barrel down, not your view. The gunsmith has one in stock most visits.
- **Default sights.** Every weapon leaves the factory with iron sights (folding sights on a rail, or its own fixed
  sights). Sniper rifles and the railgun are the exception: they come scoped. Optics come from the gunsmith.
- **Proportions are checked against the real weapons.** Each default build's overall length, measured from the
  built model, is within about 6% of the published length of the gun it's based on (stock extended; sources
  are the weapons' Wikipedia spec boxes). The model barrel length is the part that shows forward of the
  receiver, since the chamber end sits inside it. It's visual only: ballistics come from the barrel length in
  `G.GUN_SPECS`. Larger gaps are deliberate: the G18 carries an add-on compensator, and revolvers and the
  derringer run up to 9% short.
- **Traced from references.** Some guns' outlines are traced from a side photo or drawing rather than built from
  generic parts, the pixels mapped to metres at a known scale. **The KRISS Vector** (`rcv: 'vector'` in
  `rifle()`, `vecTrace`) is traced from a right-side photo of a Gen II (Wikimedia Commons, "Kriss-Vector-CRB.jpg",
  Waltherppx, CC BY-SA 4.0) at 0.87 mm a pixel, checked against KRISS USA's figures (5.5" barrel, 658.6 / 706.1 mm
  overall with the stock collapsed / extended; the stockless SDP is 406 mm). Its Super V action drives the bolt
  down into the lower instead of straight back, so the bore sits low and in line with the hand. The lower follows
  from that: a raked grip, an enclosed trigger opening raked forward, the deep V body, and in front of it the
  magazine well. The well is a leg raked back, its front edge serrated, and the Glock-pattern magazine goes in at
  its foot along the same rake. On top is a full-length rail with flip-up sights at its two ends (folded flat
  when there's an optic), with the ejection port over the well. The front of the upper has a rail underneath and
  short rails each side: its factory forend (`'vector'`) is railed, so it takes a foregrip, a light and a laser.
  Most of the barrel is inside the upper (`bIn`), and the stock tube sits level with the top of the receiver.
  The folding charging handle is at the front left. **The Steyr AUG** (`rcv: 'aug'`, `augTrace`) is traced from a
  side photo of an AUG A1 / StG 77 (Wikimedia Commons, "Steyr AUG 5,56 mm.JPG", MoserB, public domain) at 0.57 mm
  a pixel: 790 mm overall with its 508 mm barrel, Steyr's figures. It's one moulded shell from the butt to the
  nose under the barrel lock, with the magazine well behind the grip and a clear magazine raked a little forward.
  The trigger guard is a bar from the nose to the foot of the grip, enclosing the whole hand. On top is the
  aluminium receiver housing with the bolt carrier's rods showing, the barrel lock at its front, and the folding
  foregrip hinged under that. Its factory sight is the integral 1.5x optic in the carrying handle (`augscope`, a
  black ring reticle). Fit any other sight and the handle gives way to the A3 M2's rail system: a flat-top receiver
  with no hump, its Picatinny rail running the length of it from the barrel lock back over the front of the shell
  (25 slots, about 26 cm), short side rails on the barrel lock for a light and a laser, and the square folding
  charging handle. Its width is the Austrian army's figure for the StG 77, 85 mm across everything (the charging
  handle and sling swivels stand proud). The shell is about 70 mm with flat flanks up to a crease just above the bore,
  then a roof: its top sides lean in to a top a little under half as wide, which keeps it slender from above. The grip is
  slim (about 40 mm front to back) and raked back, the hand opening running down under its slanted front edge, and
  the receiver housing is 48 mm. Sights sit well forward on the M2 rail (`optF: 0.42`, about over the magazine well) so
  a red dot and a magnifier behind it both stay on the rail; being a bullpup, the eye is set by the cheek weld on the
  stock (`cheek: 0.19` m from the butt), not by the sight's eye relief, so aiming down sights doesn't pull the gun
  back into your face. The AUG 9 mm uses the same receiver with a pistol-magazine well. **The P90** is traced from FN's side view.
  **The QBZ-95** (`rcv: 'qbz95'`, `qbzTrace`) is traced from a right-side photo (Wikimedia Commons, "QBZ95 automatic
  rifle mod noBG.png") at 0.574 mm a pixel, 760 mm overall: the one-piece shell from the butt to the front cap, the
  carrying handle's loop with the rear aperture and the cocking knob in its opening, the raked grip and the trigger
  guard's bar to the front grip, the ribs under the nose, the ejection port over the magazine. Its sights stay on
  whatever's fitted; another sight goes on a rail along the top of the handle, very high over the bore as on the
  real one. **The QBZ-192** (`rcv: 'qbz192'`) is built by eye from photos: a tall flat-sided upper railed its whole
  length, the rail carried on over a deep squared handguard (`hg: 'qbz'`), the lower's flared well, the charging
  handle at the front right, a folding telescoping stock (`stock: 'qbz'`). **The SIG MCX and MPX** (`rcv: 'mcx'`,
  `'mpx'`): AR-shaped, no buffer tube (the stock hinges on the back of the upper; the MPX keeps its tube stock), the
  magazine well flaring at its foot (much deeper on the MPX). The upper's top rail is one piece running on forward of
  the receiver (`railExt`: 0.11 m on the MCX, 0.06 on the MPX, from SIG's handguards, cut down at the back to take it)
  over the back of the handguard. Their handguards are their own (`hg: 'sig'`, on the
  `hg:mcx` and `hg:mpx` interfaces): the upper's rail runs on flush along a flat top, so no AR handguard fits.
  The MCX's variants are parts: a 5.5" barrel, short handguard and strut stock make a Rattler; 11.5" (factory) a
  Virtus SBR; the 16" barrel, the lightened FDE handguard and the padded stock a Spear LT; the KeyMod handguard a
  Gen 1. The QBZ-192 takes the same folding stocks (`stk:fold`, a hinge), and a 14.5" barrel makes it a QBZ-191.
  **The FN SCAR** (`rcv: 'scar'`, `scarTrace`) is traced from a right-side photo of a SCAR-L (Wikimedia Commons, "FN
  SCAR-L noBG.png") at 0.59 mm a pixel: the one long upper from the hinge to the gas block with its top rail, a short
  rail each side of the front and one under it, the polymer lower (grip mount, trigger guard and magazine well in one),
  and its folding stock with the raised comb (`stock: 'scar'`). The rails are the upper's, so the SCARs have no
  handguard slot: a foregrip goes on the rail under the front (`fgAt`), lights and lasers on the side rails.
  **The G36** (`rcv: 'g36'`, `g36Trace`) is traced from a right-side photo (Wikimedia Commons, "Gewehr G36 weiss.jpg")
  at 0.945 mm a pixel: the polymer receiver, the trigger group pinned under it with the magazine well raked back at
  its foot, the carrying handle's loop from the back of the receiver out over the handguard with the charging handle
  under it and a rail along its top (the export handle: a sight sits very high over the bore, as on the real one),
  the deep vented handguard (`hg: 'g36'`, its own `hg:g36` interface) with the bayonet lug's sleeve ahead of it,
  and the skeleton folding stock (`stock: 'g36'`). The G36K is parts: the 12.5" barrel and the short handguard.
  **The derringer** (`derTrace`) is traced from a photo of an American Derringer Model 1 (Wikimedia Commons,
  "American Corp. Derringer M1.jpg") at 0.167 mm a pixel: the stainless frame with its spur trigger and hammer, the
  bird's-head grip, the two-barrel block hinged on the frame's ears at the top of its back, tipping up muzzles first
  to load. It's chambered in .44 Magnum (the Model 1 is). It builds up as a kit: its own grips (`gr:derringer`: the
  factory rosewood, a rubber wrap, and a squared stock-lug grip that takes any SMG stock), barrels to a carbine's 16"
  and a rifle's 20" (the other hand goes out under them; a railed forend clamped round them takes a foregrip
  and a light or laser each side, and a rail along the rib that takes rifle sights), and a 3" pair with an optic cut
  in the rib for the pistol sights. The sights tip open with the barrels. Two integrally suppressed pairs
  (Wraithworks): a compact 7" pair, one oval can round both barrels, and a 16" carbine pair (the can over the front,
  the railed forend behind it). Both barrels are ported inside the can (`set.ported`), so the .44 leaves subsonic
  (310 m/s, as the MP5SD's 9 mm does) with the integral suppressor's sound; the can tips open with them. (The
  clamp-on sight mount it had for a while, `rm.derringer`, is retired.)

  | Model | Ours (mm) | Real (mm) | Model | Ours (mm) | Real (mm) |
  | --- | --- | --- | --- | --- | --- |
  | M4 | 857 | 838 | MP5 | 712 | 680 |
  | HK416 (14.5") | 902 | 900 | MP5SD | 782 | 805 |
  | AK-47 | 906 | 880 | Micro Uzi | 460 | 460 |
  | FAMAS | 779 | 757 | Vector | 732 | 706 |
  | G36 | 1009 | 999 | MP7 | 637 | 638 |
  | SCAR-H | 987 | 965 | P90 | 477 | 505 |
  | Tavor | 739 | 720 | Thompson | 882 | 860 |
  | AUG | 804 | 790 | PPSh-41 | 857 | 843 |
  | Galil ACE | 955 | 927 | Remington 870 | 982 | 978 |
  | AN-94 | 975 | 943 | Saiga-12 | 1120 | 1145 |
  | FAL | 1117 | 1090 | AA-12 | 987 | 966 |
  | Mk 14 | 932 | 889 | KSG | 684 | 680 |
  | M1 Garand | 1112 | 1100 | M249 | 1077 | 1035 |
  | SVD | 1217 | 1225 | PKM | 1217 | 1203 |
  | VSS | 912 | 894 | M60 | 1172 | 1105 |
  | Remington 700 | 1164 | 1124 | Glock 17 | 208 | 202 |
  | Mosin 91/30 | 1222 | 1232 | M1911 | 218 | 216 |
  | AWM | 1255 | 1230 | USP .45 | 204 | 200 |
  | Barrett M82 | 1470 | 1448 | Desert Eagle | 274 | 273 |

## Weapon handling

- **Rounds are projectiles** (`js/player.js` `fly`). Every round and pellet leaves at its caliber's muzzle
  velocity (`G.MUZZLE_V`, adjusted for barrel length and load: subsonic rounds stay under 310 m/s), slows with
  drag and falls with gravity. It's stepped a frame at a time against the walls, windows and everyone's
  hitboxes as they stand that frame, so a running target can step out of a slow pistol round's way at range.
  What it does to whoever it reaches is worked out from what it is and how fast it's still going (see Wounds).
  - **Zeroing:** sights are zeroed (`G.zeroOf`): handguns, SMGs and shotguns at 25 m, carbines and machine
    guns at 50, marksman and sniper rifles at 100, the grenade launchers at 40. The sights sit above the bore
    (`G.sightH`: 2 cm on a pistol, 6.5 on a rifle), so a round starts that far under your eye and climbs to
    meet it: a carbine zeroed at 50 m is back on at about 200, and a round hits low on something very close
    (or clips the top of cover your eye line just clears). Drag lengths come from real retained velocities.
    Checked against real drop tables:

    | Weapon (zero) | 100 m | 200 m | 300 m | 400 m |
    | --- | --- | --- | --- | --- |
    | M4, 5.56 (50 m) | +3 cm | −3 cm | −29 cm | −78 cm |
    | AK, 7.62×39 (50 m) | +1 cm | −15 cm | −59 cm | −139 cm |
    | R700, 7.62×51 (100 m) | 0 | −10 cm | −39 cm | −91 cm |
    | AWM, .338 (100 m) | 0 | −6 cm | −27 cm | −64 cm |
    | P9, 9 mm (25 m) | −24 cm | −143 cm | | |
    | Pump, slug (zeroed with buckshot at 25 m) | −7 cm | −91 cm | | |
    | VSS, subsonic 9×39 (100 m) | 0 (+12 at 50) | −118 cm | | |

    A 40 mm grenade (76 m/s) arcs visibly, and a crossbow bolt is half a metre low at 50 m. A round's spent
    after 4 s in the air, 550 m, or below 30 m/s.
  - **The zeroing table** (in the workshop, or the shop's Zeroing tab; `js/zeroing.js`): turn a gun's
    elevation a click at a time. A click is 0.1 mil (a centimetre at 100 m, 5 at 500), up to 15 mil either
    way, from the standard zero above (`w.clicks`, `G.boreTip`): up raises where it strikes. A graph draws the
    round's path against the line of sight out to 500 m (the standard zero's path faintly behind it), marks
    where it crosses the line (the near and far zeros) and where it's spent, and a table gives the path, the
    hold (mil and MOA), the speed and the time of flight at 25 to 500 m. Pick a load to see where it goes:
    every load fires from the same bore angle, so a slower one drops more (subsonic in an M4 zeroed with
    ball is 48 cm low at 100 m). The bore angle for the standard zero is solved from the same drag and
    gravity the rounds fly with (`G.zeroSlope`, `G.flight`), so the graph is where they go: it matches the
    game's own frame-by-frame flight to a fraction of a millimetre.
  - **What you see:** an ordinary round is a faint short streak; a tracer is a white-hot core with a red
    glow (a cheap stand-in for bloom: a soft ribbon always turned to face you, and a glowing point at its
    head). Your own rounds start from your gun and close onto your line of sight over the first 12 m.
    Teammates' and enemies' rounds fly too: an enemy hit lands on you when the round arrives, not when it's
    fired. A machine gunner's belt has a tracer every fourth round.

- **No round counts in the field, and no ammo gauge.** To know what's in the gun you check it: hold R for the
  magazine, hold I for the chamber. The HUD keeps only a small white icon for each magazine you carry for it
  with something in it (a box for each box of rounds, for a loose-fed gun), no number, the type of the next round,
  and a "NO MAG" warning. In the field the inventory doesn't count either.
  Between levels, in the stash and the shop, it does: every magazine, box and gun shows its count (a gun's
  as 30+1/30), and so does your loadout.
  Magazines in the inventory are drawn in colour, as full as they are (rounds from the feed lips down to the
  follower and spring), with their ammo type and no count; "EMPTY" when there's nothing in one.
- **Chambers** (`G.chambered`, `js/data.js`). A closed-bolt gun holds a round in its chamber as well as its
  magazine or tube; a chamber check shows it (brass in the open port, or nothing). It fires the chambered
  round and the action feeds the next, so a full M4 fires 31. A reload with a round chambered keeps it (30+1);
  run dry, the reload ends by sending a round home (29+1).
- **The action is its own animation, apart from the reload** (`Me.workAction`, `js/vmanim.js actionPose`). A
  reload is only the magazine change (or the shells, the belt); run dry, the action follows it, and a partial
  reload has none. The rounds move with the action: the case it held is thrown as it comes back, and a round is
  fed as it goes home. One pose of each action (slide, charging handle, cocking handle, bolt, pump, lever) at
  any pull serves every use of it: a rack, a release, the chamber check.
  - **Bolt hold-open** (`G.boltHold`): every pistol with a slide, the AR-15 family, the SCARs, G36, AUG,
    Tavor, FAL, M14/Mk14, SR-25, Barrett, MPX, MCX, QBZ-192, MP7, Vector, Skorpion and SVD lock open on their last round. From
    empty, the magazine change and then a thumb on the bolt catch (or the slide stop), 0.4 s: the slide (or
    bolt) slams forward on a round.
  - **Without one** (the AK family, MP5, open-bolt guns, the belt-feds, bolt-actions): from empty, the magazine
    change and then the action racked by hand, 0.6 s (a bolt-action's, 0.7 s).
  - **No pause between them:** from empty, the magazine change stops as the magazine seats and the hand goes
    straight on to the catch or the handle (`Me.SEAT`), rather than back to the handguard first. So an empty
    reload is the seating plus the action, a little quicker than a tactical one that keeps its chambered round.
  - **Not empty:** just the magazine change. Pull a magazine and the chambered round is still
  there for one more shot; put one in by hand and the chamber's empty: the first pull of the trigger, or R,
  racks a round in. A pump's tube holds 6 with one more chambered. The round in the chamber keeps its own
  type, so after loading AP the old round fires first. Unloading takes the chambered round out last.
  Open-bolt guns (Uzi, MAC-10, PPSh, Thompson, AA-12, the belt-fed guns, the minigun) have nothing waiting in
  the chamber, and neither do guns whose chambers are their magazine (revolvers, break actions, the Garand's
  clip, launchers, the crossbow, the railgun).
- **Bolt-actions are worked by hand** (R700, Mosin, AWM; `Me.boltGun`). A shot leaves its case in the chamber
  until you work the bolt, which you do by letting go of the trigger (hold it to stay on the sight and watch
  the hit) or clicking. That's the same rack as a dry chamber: the right hand on the knob, up, back (the case
  flies), forward, down, 0.7 s. The time between shots is the same as before.

`js/vmanim.js` animates the first-person weapon.

- **Arms:** both run from fixed shoulders to wherever the hands need to be, so a hand can leave the gun,
  fetch a magazine from the pouch on your hip and come back.
- **Moving parts** on the gun models: magazine, cocking handle, pistol slide, pump, bolt, lever, belt-feed
  cover, break-open barrels and revolver cylinder.
- **Every cocking handle is where the real one is** (`js/gunmodels.js cockHandle`, the platform's `cock` in
  `js/parts.js`):
  - **AR-15 T-handle** at the back of the upper: M4, HK416, M27, SR-25, MPX, AR-9 (and the Mk14, built on an
    AR upper here).
  - **Right-side knob:** the AK family, Galil, SVD, VSS, Saiga, Vepr and RPK; the op rods of the Garand and M14;
    the Benelli's and PPSh's bolt handles; the belt-feds; the Barrett's big one.
  - **Left side, forward:** the SCARs (a knob), the AUG and Tavor; folding levers on the FAL, Vector and AA-12.
  - **Others:**
    - the HK tube over the handguard, front left (MP5, MP5SD), whose tab slides along a tube that stays put;
    - a T at the rear of the top (G36, MP7);
    - a knob on top (Uzi, MAC-10, Thompson, and the FAMAS under its carry handle);
    - a knob on each side (Skorpion, and the P90's low at the front).
  - **Moving with the bolt:** a handle fixed to the bolt carrier jumps back and home with every shot (AK,
    SCAR, AUG, op rods, PKM...). On an open-bolt gun (Thompson, MAC-10, PPSh, PKM) it sits back, cocked, while
    there's a round to fire, and goes forward with the last one. Racking leaves it back.
  - **The hand takes the handle**, not a point near it, and stays on it through the pull. The right hand
    follows the bolt knob through its lift and draw.
- **Reloads by action type:**
  - **Magazine:** the gun lifts and cants so you see the well. You strip the mag, drop it, fetch a new one,
    seat it and slap it home. Pistol magazines fall free when you hit the release.
  - **Empty reloads are followed by the action:** the bolt catch or slide stop, or a rack of the charging
    handle, cocking handle, slide or bolt.
  - **Shell by shell:** tube shotguns, the lever gun, the Mosin and the M32 roll the port toward you and
    load one round at a time, then rack once at the end if they were empty.
  - **Revolver:** swing the cylinder out, muzzle up to eject, then the speed loader in and flick it shut.
  - **Break-open:** the double and sawed-off open, take shells and close. The derringer is turned upside down in
    the hand first, then its barrels swing open 165° over the hinge (hanging straight down, their breeches up), a
    round (its real size: the case, the rim, the bullet) drops into each empty bore from above, and it's shut and turned back. It fires the top barrel first, so with
    one shot gone it takes just the one round, into the top, in about four-fifths of the time.
  - **Belt-fed:** open the cover, swap the box, lay the belt, close it (from empty, the charging handle after:
    pushed home on an M249 or M60, left back on a PKM).
  - **Others:** a Garand en-bloc clip, a crossbow bolt laid on the rail, and akimbo magazines both dropping
    at once.
- **Between shots:** your left hand rides the pump (a bolt-action's bolt is worked as a rack, above).
- **Inspect (I):** show the left side, then the top and right, then a chamber check: the gun's own action
  worked part way and held there (`CHECK`: a pistol's slide a third back, a charging or cocking handle 60%, a
  bolt turned up and half back, the pump or lever cracked), or the cylinder swung, the barrels broken, or a
  glance at the magazine. Any action cancels it.
- **The chamber, seen through the port** (`chamberView`): closed, all the port shows is the bolt (on a pistol,
  the barrel hood, which stays put as the slide moves). Work the action and the bolt face comes back with it,
  uncovering the round in the chamber, or an empty chamber; a pistol's press check opens a gap behind the hood
  where the case shows. A gun locked open on its last round shows the bolt back and the chamber empty, and a
  cocked open-bolt gun's chamber is empty with the bolt back.
  - **Hold I** and it stops at the chamber check and stays there, turned so you can see into the action:
    - a rifle canted with its port toward you, your hand holding the handle back: the bolt face back and the
      round, if there is one, in the open port on the right. A bolt gun's bolt up and half back, your hand on
      the knob, its open top toward you.
    - a pistol side-on with the slide eased back: its slide has a real ejection port, the case behind the hood.
    - a break-action low, barrels dropped, the shell heads in the breech; a revolver's cylinder swung out, a
      brass case head on its back for each round in it.
    - whatever's chambered is what you see.
- **Every round shows its load**, the same everywhere (`js/icons.js` `shellCol` / `tipCol`): a shotgun shell's
  hull is colour-coded (buckshot red, slug yellow, birdshot green, flechette blue) and a bullet's tip shows its
  type (ball copper, hollow point lead, AP black, tracer red, subsonic olive). That's each round as it really is
  in the gun: the chambered one, the top of the magazine, each round down a clear magazine and behind each
  witness hole (a shotgun magazine's holes show the hulls), each shell head in a break-action's breech or a
  revolver's cylinder (ringed in its hull's colour), the shell in your hand as you load, and the spent hulls on
  the floor.
    While it's held the mouse turns the gun (not your view): side to side rolls it, up and down tips the muzzle. Let go
    and it closes up.
- **Magazine check (hold R):** a tap still reloads (on release). Held, the magazine comes out into your left
  hand and up in front of you, held upright as it sits in the gun, its back and witness holes toward you. The
  mouse then turns it in your hand, as far as a wrist goes: roll it about its length, tip it toward you to
  look down on the top round (its tip coloured for the load) or away. Opaque
  magazines have a column of witness holes down the back, each stamped with the count it stands for
  (5 / 10 / 15 / 20 / 25 on a 30-rounder); brass in a hole means at least that many. Clear magazines
  show the rounds themselves, one drawn for each it holds and only as many as are in it, the top ones staying as
  the follower rises. Each is its real cartridge from the gun's caliber (a rifle round's bottlenecked case and
  bullet, a pistol round's straight case, a shell), its base against the back wall, double-stacked in a zig-zag
  half a round apart (a single column of shells in a shotgun's). The G36 and AUG come with them. A translucent
  magazine is also sold for every gun with its own box magazine, and for the STANAG, MP5, both AK and Glock
  families: the same capacity, a little lighter (on a pistol, Glock-pattern ones too, down into the extension of
  a long one). A drum shows its top round in the feed tower; a clear one (the G36's and AUG's) shows the rest
  wound round inside it, ring by ring round the hub, emptying from the tower. Let go of R, or fire, aim or move off, and it goes back in.
- **Handling:**
  - The gun lags behind fast mouse movement and leans into strafes, much less while aiming.
  - Swapping weapons draws in an arc from low right.

## Audio

- **Spent cases** (`js/casings.js`) are simulated on each player's own machine.
  - **When cases come out:**
    - Semi and full autos throw a case out of the ejection port as they fire: flicked right and up,
      tumbling, carried along with the shooter's movement.
    - Pump, lever and bolt guns throw it a beat after the shot, when the action is worked.
    - Revolvers and break-actions dump their empties when you open them to reload.
    - Launchers, the crossbow and the railgun don't eject anything.
  - **Physics:** cases fall under gravity and bounce off floors, furniture tops, walls and props, then come to
    rest on their side. They stay on the floor; the oldest are recycled after about 180.
  - **Whose cases:** your own come from your first-person gun's port. Other players' and suspects' cases
    come from beside their muzzle.
  - **Sound:** each real impact makes its own sound, placed in 3D where it landed (HRTF, like the other
    sounds in the world: left and right, in front and behind, above and below), quieter with distance, and
    muffled if there's a wall between you and it. The synthesized casing sound that used to be baked into
    every gunshot is off.
    - Brass rings in a few inharmonic modes, at a pitch set by the case's length: about 4.2 kHz for a 9 mm
      case, 2.6 kHz for 5.56, 1.3 kHz for .50 BMG.
    - Steel rings lower and shorter, aluminium higher and deader.
    - Shotgun hulls make a hollow plastic tock with a click from the brass head.
    - The surface matters: tile and concrete let a case ring, wood shortens it, and carpet and grass
      leave little more than a tap. Harder impacts are louder, so each bounce is quieter than the last.
- **Rounds going past and landing** (`js/audio.js`):
  - **Cracks are for supersonic rounds only.** A round that passes within 5 m of you cracks only if it's
    still faster than sound (343 m/s) where it passes. Its speed comes from:
    - its caliber's real muzzle velocity, scaled by the build's barrel length (a fifth power of the length: a 25%
      longer barrel is about 4.6% faster), times whatever else in the build adds velocity without changing the
      barrel (a suppressor, a long slide: `velK`). A part card's Velocity % is that real change (a barrel's worked
      out from its length), and so is the build's damage and reach. The gunsmith's stats list each load's muzzle
      velocity and energy through the build, and the zeroing table flies the same numbers.
    - its load: subsonic loads and the integrally suppressed MP5SD and VSS stay under 310 m/s; slugs leave
      at about 440
    - how far it has flown: buckshot pellets shed speed fast, pistol rounds moderately, rifle rounds slowly

    The crack is a hard snap, louder the closer it passes and panned to its side. It's louder for bigger and
    faster rounds, and faint for a barely-supersonic 9 mm. The heavy rounds (.50 BMG, .338) also thump.
    Examples: rifles always crack; 9 mm faintly; buckshot close up but not past about 20 m; a slug at range.
  - **Zips:** a round going by slower than sound gives a quick falling zip of air instead. That covers
    .45 ACP, .32, 9×39, subsonic loads (suppressed or not), the MP5SD and VSS, and buckshot past about 20 m.
    Bolts and 40 mm grenades are silent going past.
  - **Impacts:** a round landing within 15 m of you (anyone's, yours too) is heard as what it hit: a
    wall's smack and grit, the thunk of a door or furniture, a hard floor, the dull thud of grass, earth
    or carpet, a wet hit on a body, or a ring off armour.

Gunshots come from the physics-based gunshot synthesizer from `tactical_game/synth`, copied
into `js/gunshot-synth.js` (since extended with suppressors, below). Each weapon has interior-ballistics inputs in `G.GUN_SPECS` (`js/data.js`):
barrel length, caliber, chamber pressure, powder grain, bullet weight, action type, muzzle device and case.
`js/gunaudio.js` (a port of tactical_game's `gunAudio.ts` + `acoustics.ts`) ray-casts the room
around each shooter to choose a reverb environment. It renders and caches one buffer per weapon and room
type in the background when a level loads, then plays shots with 3D HRTF panning, distance falloff, air
absorption, and muffling through walls. Each build has a sound key (`weapon:barrelInches:muzzleDevice`), so
barrel length and muzzle device (suppressor, brake, compensator, flash hider) change how it sounds. Reload foley uses the recorded samples from tactical_game (`assets/audio`).

**Suppressors** have their own parameters in the synth (`GunshotSynth.SUPPRESSORS`), and a suppressed
build's sound key names its can (`weapon:barrelInches:suppressor:can`). The cans are full-length, compact,
long (pistol), shotgun, integral and extended integral. What they do comes from published measurements
(NIOSH/Murphy et al. 2018, *Int J Audiol*; the AR-15 suppressor studies; *Proceedings of Meetings on
Acoustics* 2019):
- **The blast drops 17–24 dB at the shooter's ear** for typical guns (3–32 dB across rifles, cans and
  loads). How much depends on the can's volume against the gas reaching the muzzle (muzzle energy ×
  the residual pressure fraction). On the same can, a .308 loses about 3 dB of suppression against a
  5.56, and a compact can loses more; a 9 mm through a pistol can gains some. Measured in game against
  the open gun: M4 with a full can −22 dB peak, with a compact −13, .308 −16, 9 mm SMG −19, MP5SD −24
  (against the MP5), pump shotgun with its can −11.
- **The baffles break up the shock front**, so what's left rises more slowly, is darker (a bigger can is
  darker still), and lasts longer: the can blows down for tens of ms. A ported integral barrel starts
  bleeding gas sooner.
- **The ballistic crack and the action aren't suppressed.** Supersonic rounds still crack downrange, and
  the bolt clatter comes forward (only subsonic ammunition removes the crack).
- **Back pressure:** the can holds gas in the bore, so it spits out of the action as it opens. That's a
  hiss at the shooter's face and a harder bolt, most on direct-gas and blowback guns.
- **The can rings faintly:** its column of hot gas (an open–closed pipe) and the steel tube.
- **First-round pop:** a can that has sat for 8 s fills back up with air. The oxygen burns with the next
  shot's gas, so that shot is about 4 dB louder (tracked per shooter, at playback).

The level drop is in the render itself. Every shot is "recorded" through an overloaded mic (a hard clipper,
then auto-gain), set for an open shot's ~160 dB. A suppressed shot goes into it as much quieter as its can
makes it, and the mic's drive drops by 45% of that (`SUP_DRIVE`): it clips far less, so it keeps its own shape
(a soft onset, then the can blowing down over tens of ms) instead of being pumped into the open shot's loud
plateau. Measured against the open gun: an integral can about 19 dB down, a full-length rifle can about 14,
a compact can about 10. (The drive used to drop by all of it and the output by a quarter more, on top of the
blast's own cut: an integral can ended 35-40 dB down, a whisper even in your own hands.) The crack and the bolt stay at their own level, so
next to the quieted blast they come forward.
The railgun and explosions still use the simple procedural sounds.

On top of the baked room reverb, echoes are **ray-traced through the level** for every shot:
- 48 rays leave the gun and bounce off walls up to twice. Every bounce point that can see the listener is an
  echo path.
- The extra path length sets the delay (343 m/s). Distance, the theme's wall hardness and how mirror-like the
  bounce is set the level, and the echo is played from that wall.
- Only reflections later than 20 ms are added, since earlier ones already fuse into the room reverb.
- Small rooms give tight 20-40 ms slaps; long corridors give distinct slap-back off the far end; big rooms
  spread out to 100 ms or more.
- Closed doors block rays. A shot fired round a corner is heard from the doorway it reaches you through, and
  less muffled than one going through a wall.
- Results are cached per shooter and listener position (about 0.7 ms to compute, free when cached). Under
  heavy fire only the two strongest echoes play.
- Press **F8** (or add `?echoes`) to draw the paths. They're clearest on other people's shots, since your own
  run straight out from the camera.

## Controls

| Key | Action |
| --- | --- |
| WASD | Move |
| Space (toggle) | Lower weapon to low ready and move a little faster (firing or aiming brings it back up) |
| Shift (hold) | Walk slowly with the weapon steadied (tighter spread, less recoil) |
| Q / E (hold) | Lean left / right |
| C | Toggle crouch (more accurate, and you hide behind furniture) |
| Z | Go prone, or get up (to a crouch). It takes 0.8 s either way, no shooting meanwhile. Lying down you crawl, can't lean, and hold the gun steadiest of all: a quarter of the standing sway, 60% of the recoil, half the spread. Suspects see less of you and hit you less often |
| LMB / RMB | Fire / aim down sights |
| R | Reload (retention: the old magazine goes back in its pouch) |
| R (hold) | Magazine check: out into your hand; the mouse turns it to read the witness holes or see the rounds. A gun with no magazine to pull (a revolver, a shotgun's tube, a break-action, the derringer) goes straight into the chamber check a held inspect ends on (the cylinder out, the barrels broken open, the action pulled back), turned by the mouse, and back when you let go |
| R R (double tap) | Dump reload: the old magazine goes into your dump pouch, or onto the floor without one |
| 1, 2, mouse wheel | Switch weapon (the wheel while aiming steps a variable scope or flips a magnifier) |
| Middle click | Ping: a marker on the spot you're looking at, with your animal and your name in its colour, that the whole squad sees through walls for 6 s (it says nothing about what's there) |
| Hold middle button | The comms wheel: eight slices round the crosshair, the mouse moves a pointer onto one, let go to pick it (in the middle: nothing). Your gun's light, laser, a magnifier flipped in or out (greyed when it has none), and calls to the squad in the chat: your injuries (each hurt part and what's wrong with it, your blood), your ammo (in the gun, spare, about how many reloads), contact (with a ping where you're looking), clear, holding. (The mouse's side buttons no longer do anything: a browser's back and forward can't be reliably kept off them.) |
| I (hold) | Inspect your weapon; held, the chamber check stays open; mouse side to side rolls the gun, up and down pitches it |
| H | Open your body and kit (as Tab) |
| 3 / 4 / 5 | Bring the grenade on that key into your hand (frag on 3 and flashbang on 4 to start; the weapon goes down). Hold LMB to pull the pin and draw back, release to throw; RMB picks underhand, weak or strong. The key again, or 1 / 2, puts it away. Drag a frag or flashbang onto a key's box under Equipment in the inventory to put that kind on it; × clears it. Medical gear doesn't go on them |
| B (hold) | Swap the gun in your hands with the next one in your backpack |
| V | Shout compliance ("Police! Show me your hands!") |
| X | Fire selector: semi / auto (or burst), on guns that have one |
| F (hold) | Doors (aim at the door above 1.3 m, a little over its middle, to open it, lower to kick it; face an open door to close it; reach 1.9 m), bag evidence (aim at the weapon), swap with the weapon case, arrest, zip-tie or report (aim at the person or body; whichever of a body and its dropped weapon is nearer the centre of your view), check or treat a teammate (put the crosshair on them). Every interaction is a hold: let go and it's abandoned. Any of these puts your weapon away; drawing it again takes about 1 s (0.65 s for a sidearm). |
| M | Mute / unmute (also `?mute` in the URL) |
| F8 | Show / hide gunshot echo paths |
| F9 | Show / hide hitboxes (with the readout of whoever you're looking at, your rounds' paths, and every shot that's hit someone: ghosts, trails, speed markers) |
| Tab | Inventory, health and scoreboard (Tab or Esc closes) |
| Y | Vote to leave, once order is restored (again to take it back) |
| Enter / Esc | Chat / pause |

## Interface

- **No minimap and no crosshair.** You find your way and aim by looking.
- **The inventory and shop scale with your window:** cell size and text grow with the window, from about
  40 px cells at 1080p to 72 px on a big 4K screen, taking whichever of height or width is tighter. The
  columns wrap (the locker drops below) when they don't fit side by side.
- **No stall on first use:** shaders are compiled the first time something's drawn, which caused a spike on
  the first shot of a session (the casing, tracer, bullet hole and blood all drawn for the first time) and
  again for the first explosion or the first suspect to come into view. Once each level is built and
  populated, everything is compiled up front (`G.R.warmup`, about 70 ms during loading).

## Adding content

Two checklists cover what a new piece of content touches and how to check it:

- [docs/weapon-checklist.md](docs/weapon-checklist.md): new weapons. Covers stats, sound specs, calibers,
  the platform and its attachments, the model, sight checks at ADS, reload foley, magazines, enemy use and the
  shop.
- [docs/level-checklist.md](docs/level-checklist.md): new environments and layouts. Covers the theme, the
  layout, the approach from outside, reachability, furniture and decoration, see-through pieces, lighting,
  surfaces and echo, spawns, doors and objectives.

## Level geometry (in progress: 3D levels)

Levels are moving from a 2D tile grid to real 3D shapes. Every solid thing in a level (floor, ceilings,
walls, furniture, fences, doors, windows) is a 3D solid in `G.World` (`js/world.js`), indexed in a 3D spatial
hash, and every ray (rounds, sight, the AI's line of sight), collision and ground query is answered from those
solids at any height. Doors and windows are dynamic: their solids change as they open, close and break.

- **Done:** the solid store and its queries, the converter from planned levels (`G.World.fromTileMap`), and
  every ray, sight, collision and ground query in the game switched to it. On all eight level types it
  matches the old tile queries on over 99.5% of random rays. The differences are old bugs: an open door
  leaf that stuck out of its tile hid the wall behind it, rays slipped over a zero-thickness roof edge, and
  you snagged on the seams between wall tiles. It's 1.5 to 3 times faster.
- **Buildings of several floors** (`G.Level.stack`): each floor is planned as a storey (`plan`), then they're
  stacked 4.3 m apart into one world. A flight of stairs is about 20 real steps, each a solid block, so
  rounds and sight stop on them, and bodies, grenades and anything dropped land on the treads. Walking, though,
  you and the suspects take a flight as a smooth slope through its steps (`G.World.rampAt`), so you rise and
  fall steadily instead of juddering from tread to tread; its side still stops you (you can't step onto it
  half way up), as does its high end from underneath. A drop is a hole in the floor above a flight or a
  double-height room, with railings round it: a steel handrail over glass. The railing stops you walking off
  the drop; its glass is a pane like a window's, seen and shot through and shot out (shards and the sound
  of it, for everyone), the handrail left standing. You and the suspects step up anything 32 cm high or less
  (`G.World.STEP`), and are stopped by the ceiling over you wherever you are. Grenades bounce off floors, steps and ceilings at any height; bodies, dropped weapons,
  blood and evidence land on the floor they fall on.
- **Navigation across floors:** the AI's flow fields span every floor. A flight's cells connect only along
  it and to the floor at its foot, and its head connects to the floor above (`G.Level.nav`, `flowStep`). On
  the stairs you count as on the floor at its foot until you step off the top (`G.Level.floorAt`).
- **Sound across floors:** what suspects hear (shots, doors, footsteps, blasts, breaking glass) travels through
  the building on every floor: up and down the stairs, straight through a drop (a stairwell, a loft's living
  room), and through a floor heavily muffled (15 m more), so a shot overhead is heard but footsteps aren't.
  Gunshot echoes and room tone are traced on the floor the shot is on, and impacts and casings sound like the
  surface of the floor they land on.
- **Lights:** the 12 real lights go to the lamps on your own floor first; they cast no shadows, so a lamp
  downstairs would otherwise light the floor above through its slab.
- **Still on grids:** the generators plan each floor on a grid.
- **Next:** meshes built from the solids, and more buildings that go up (a warehouse mezzanine, balconies).
- **Below ground:** a level's floors can start under ground level (`lay.base`: the ground floor's index); the
  suburbs' basements are floor 0, at -4.3 m.

## Code layout

- **The profiler** (`js/profiler.js`, `G.Prof`) is always on. It times the game's main pieces of work (the loop's
  steps, `Me.update` and its parts, `Views.update`, the host's server tick and enemy AI, pathfinding, the world's
  ray casts and collision queries, `R.render`, the HUD, the network handlers by message kind), adds each one up per
  frame, and keeps the last 3600 frames in typed arrays set aside at load (about 1.5 MB, the same after an hour as
  after a minute), with the renderer's draw calls, triangles, geometries, textures and shader programs, the JS heap
  (Chrome), rounds in flight and enemies. It also keeps the 40 worst frames of the level with their breakdowns, a
  histogram of frame times, and totals per network message kind (the first 64 kinds). Esc shows a one-line summary
  of the last stretch and a **Save performance profile** button: a JSON file with the context (map size, solids,
  lights, props, players, settings), the summary per piece of work (average, p50/p95/p99, worst, calls a frame),
  the worst frames, the histogram, network handling, and every frame in the ring. "frame" is one animation frame
  to the next (what you feel: GPU and browser included); "cpu" is the game's loop; the pieces are inclusive.
- **Draw calls** are what a frame costs most (Firefox above all). The level's static meshes (window walls and frames,
  roofs, lamp fittings, lintels, steps, rails, the festival's dressing) are baked into one mesh per material and 24 m
  stretch (`G.Level.mergeStatic`); what moves, breaks or is see-through is left alone. Furniture carries its colour
  in its vertices, so it's one material per finish, not per colour. Suspects' bodies (forty-odd pieces each) aren't
  drawn past the fog or behind walls, floors and ceilings (`G.Views.inSight`: a few rays from the camera; furniture,
  doors, glass, rails and stairs never hide one); their roots stay visible, so shots still find them. A body taken
  out of the scene frees its geometry (`rig.dispose`). The two blast lights are shared by the six fireballs: every
  light in the scene costs every lit pixel, lit or not.

- **After-action highlights** (`js/highlights.js`, `G.Highlights`): while you play, a level is recorded at 10 Hz
  (everyone's position, facing, pose, shots, doors) in a bounded ring (each machine records its own; the edit's choices,
  ads, sponsors, x-ray or breakdown, camera angles, clip tiebreaks, are drawn from the level's seed, so the host and
  every client cut the same broadcast), with each officer's rounds by gun and load,
  the gun each kill was made with, and the guns and kit everyone had in each clip (so a replay shows what they
  carried then). Kills, arrests (a suspect cuffed alive and on their feet), officers downed and fouls (a civilian or a surrendered
  suspect killed) are cut into clips, and saves: an officer's armour stopping rounds while they stay up (the hit
  officer's machine works out its own wounds and tells the host, which tells everyone; rounds within 3 s of each other
  are one save, how many it stopped counted; going down within 4 s takes it back), MERIDIAN ARMOR's "STOPS WHAT YOUR
  FEELINGS CAN'T" save of the night, "STOPPED COLD!", "NOT TODAY!". A suspect down for good is a kill there and then, cut as they went down: the
  round that put them down if one hit them in the last 4 s, else the bleed-out camera (down from the blood loss).
  A suspect who bleeds to death on their feet gets the bleed-out camera too. Whatever comes after (dying, finished
  off, cuffed where they lie) makes no clip and isn't counted again. Clips have the 5 s before (a breach kill: from 1.5 s before the door went in, so its
  replay opens on the kick, then shows it again through the kicker's eyes, BREACH CAM: the door at half speed, real time on to the kill, and slow again for the killing round) and 3 s
  after, scored (headshots, breach kills within 5 s
  of kicking a door, taken by surprise, would have surrendered if told to ("TAP-OUT DENIED!"), long shots (25 m or
  more), through the armour (the round that did it went through their vest or helmet: "STRAIGHT THROUGH THE
  ARMOUR!", REDLINE FIREARMS' "WHAT VEST?" round of the night), spray-downs: six or more rounds back to back, each
  within 0.16 s of the last, ending on the kill;
  bleed-outs, which the host flags with how long after the last round they came; one within 3 s of it, or through
  the heart, counts as the round's kill, its clip on the round). A bleed-out has no killing round
  to follow: it's them going down, from across the room and through their own eyes, a heart monitor's trace beating
  weaker down to a thready pulse (they're down, not dead), BLED OUT stamped over it and how many seconds after the last round they went down (its sponsor: "SHOULD'VE
  PACKED AN IFAK"); it doesn't count toward a streak. An officer's kills each within 6 s of the last become a kill
  sequence: one clip of the whole run (live, then at half speed over their shoulder or from their helmet), the
  camera turning to whoever's next, a counter lighting a pip a kill and "DOUBLE KILL!", "TRIPLE KILL!"... at each;
  the kills in it aren't shown on their own. An arrest is the feel-good segment: SUNSET ACRES' "EVERYBODY GOES HOME"
  MOMENT in pink and lilac, then the arrest live and in slow motion from the cuff cam (low beside them, watching the
  officer's hands go to the wrists): the whole takedown as it happened (the shove down, the officer kneeling over
  them, the tie going on and their gun as it was: the recording keeps how far through the zip-tie each was), hearts
  drifting up, CUFFED, NOT STUFFED!, PEACE · LOVE · DUE PROCESS, the presenters melting and the crowd going "awww";
  the standings count it (CUFFS). When their hands went up more than a few seconds before the cuffs went on, the
  segment opens with the surrender: the five seconds before it live (whoever was near, and every officer), HANDS UP!
  and DON'T MOVE! as they comply, then a pink sweep, MOMENTS LATER... and how many seconds of compliance, into the
  arrest (each suspect's latest surrender is kept for it: `handsUp`). Back in the hangar, the level's own meshes are kept out of sight and the clips are
  replayed in them on the lounge's big screen and TVs on the range's walls, like a sports broadcast: an opening
  lineup, each clip from a wide camera (a fixed one in the room, picked from 40 places for having both of them in
  the picture, most of each body in clear sight (knees to head and either side of the chest, so racking's gaps don't
  count) at five moments through the clip, side-on to the line between them, as far back as they're apart, the lens
  widened to fit them if it must), then the shooter's helmet, gun or over-the-shoulder camera in super slow-mo, then
  the other side's. A shotgun's shot keeps every pellet (where each was headed, sent with the shot so the squad's
  recordings have them; a suspect's, spread round the one end the host sends by the gun's choke), and each is drawn.
  A round's recorded end is where the walls stop it, worked out as it's fired, so a hit is found by where its path
  passes through someone (the line up their middle), and the killing one (a shotgun's: the pellet nearest their
  middle) is cut short there. In the slow-motion angles each round is a bullet you can see, flying at its real speed
  downrange (the game's own, G.roundSpeed: its time of flight, speed and gravity drop worked out over the distance)
  with a trail, and the victim falls when the killing one gets there; replayed bodies fall onto the replayed level's
  floors. Each clip keeps every door's state from when its footage begins (the doors as they were then, the door
  events since undone), so a door opened before it (or shut after it) shows as it was; the doors snap to that at
  each angle's start and follow the clip's own openings and kicks, and the replayed level's door solids go with
  them. A long shot's slow-motion angle is the bullet cam: behind the muzzle, then riding just behind the round in
  extreme slow motion (the flight stretched to 3 s), then held back along its line watching them go down, with its
  distance, speed and time on screen and a trajectory analysis (powered by SABLE RIDGE BALLISTICS): drop against at
  least 10 cm and speed from zero, so the scales are honest, and its time of flight, drop and energy on arrival.
  Blood in the replays is worked out as they play (the recording keeps where rounds went, not what they hit): a
  round whose path goes through someone in the replay bleeds there, as it reaches them. There's a puff of mist
  back out of the entry wound and, through and through, a spray out of the far side carried on with the round.
  The drops fall in clip time and land as marks on the floor, with spatter on a wall close behind. A pool spreads
  under anyone who dies or goes down. All of it is cleared at each angle's start.
  After a suspect's kill, either an x-ray breakdown (the organs and what the rounds did to them, and each round that
  hit them run through the body again, traced (js/ballistics.js through: taken into their frame as they were when it
  hit, the body posed as they were then, crouched, hands up or cowering, against their armour) and shown going in at
  them as they were (the body moves through the sequence as they did in the replay, stepping, turning, crouching,
  and is where they were for each round as that round goes in, the clip's time between rounds taken at the pace that
  keeps that; each round's track stays where it went, and the camera frames it all; after the last, they go down as
  the replay has them, falling the way it pushed them, the camera following them down) and shown going in one after
  another: its line in, the crushed channel growing behind it, the temporary cavity flaring round it and settling,
  fragments, where it tumbled or opened up, and its way out or where it came to rest or the armour that stopped it,
  each with a line on the read-out; a shotgun's pellets all go in together, one line for the shot: how many hit
  them, how many went through) or, about half the time, the slow-motion angle is the X-ray cam instead: close on the
  suspect, their body turned to glass, the round's flight stretched to nearly 2 s so it's seen going in (on through
  the body), each wounded organ flaring as it reaches it and sliding into a read-out, then 1.5 s of them falling,
  the camera fixed where it started and turning to follow the wounded organs down (their middle, not their hips).
  The close cameras keep out of walls and bodies (pulled back toward the head, nudged clear, and anything still in
  the lens left undrawn for that frame; the helmet cam leaves out its wearer's head, and a suspect's, once they're
  hit, follows their head as they fall, eased and kept off the floor). The Gear Room, before the standings, takes
  each officer's main gun (the one they fired most) onto a turntable: its build (the parts that aren't factory),
  caliber, load, rate and weight, rounds fired, kills, rounds a kill, headshots, their other guns and their kit, and
  the pundits' verdicts stamped on it (SURGICAL, SPRAY & PRAY, HEADHUNTER, QUIET PROFESSIONAL, ALL BARK...).
  Sponsored segments, ads every few clips (mostly for what Vex has in this visit: its icon, price, a line, and how
  many are left, live, so something bought while it's on shows SOLD OUT; now and then a fake one), final standings,
  a ticker, lower thirds and two game-show presenters who cheer, gasp, laugh and cry. The big screen is on the
  lounge's east wall (4.4 m across, facing its sofas); the TVs are around the range's yard (behind the rifle line,
  its east wall, by the course), clear of the IPSC course's board and screens, each tipped forward on its wall
  (hinged at the bottom, its top held out on a strut) to face the eyes of someone standing about one and a third of
  its widths out. Press F at one to save the highlights as a recording: a .zip (`breach-protocol-level-N-highlights.zip`,
  a few hundred kB) of everything the broadcast is made from: the level's seed (it's built again from it), the clips
  (everyone's every move at 10 Hz, the rounds, the doors), the stats, the running order as the TVs cut it (with its
  adverts' pictures) and the stickers on the officers' guns (their pictures too), as JSON (`highlights.json`: Maps,
  Sets and shared objects kept as such, `toJSON` / `fromJSON`). Nothing is rendered in the hangar, so the game keeps
  its memory. **Render highlights video** on the main menu takes one and makes the video (WebM, 960×540, 30 frames
  a second, with the audience): every frame rendered off screen in a worker as fast as the machine goes
  (js/exportworker.js: the game's own code loaded there, the level built again from its seed, its own renderer on an
  OffscreenCanvas, each frame encoded straight from it with WebCodecs, VP8 at 2.5 Mbit/s), the sounds coming back as
  events and mixed on the page in an OfflineAudioContext (Web Audio isn't in workers), encoded as Opus, then put into a
  WebM in the worker by a small muxer (the video never comes to the page), and saved: about 30 s for a 50 s broadcast.
  It needs WebCodecs and OffscreenCanvas (a recent Chrome, Edge or Firefox); a progress bar shows how far it's got,
  and Cancel stops it. A recording from a newer version of the game is refused. You hear one
  only where you'd stand to watch it: in front of it, full to about one and a half of its widths and nothing past
  three, not edge-on, nothing in between. There it's a studio audience, kept quiet and short for now (everything at
  about a third, recordings faded out after a second or so): a stadium's murmur on a loop, recorded cheers and
  laughter, an impressed "OOOH!" (rising) for headshots, long shots and a third kill in a row, a warm "awww" for
  arrests (the sad "aww", for fouls and officers down, is an "ohhh" pitched down and sliding), with synthesised
  stingers (ding, horn, boing, sad trombone, jingle), and the replays' gunfire: each round's report the game's own
  synthesised gunshot for that gun and load (its dry render, js/gunaudio.js), kept quiet, through the TV's speaker
  (a low-pass), slower and deeper in slow motion, quieter suppressed; in a video too. The replay renders at 640×360,
  20 times a second.

| File | Purpose |
| --- | --- |
| `js/data.js` | All weapons, armour, enemies and their kit, wounds and themes. Tune the game here. |
| `js/callsigns.js` | Squad animals: the emblems, and the shoulder and back name patches |
| `js/level.js` | Level generator (layouts planned on grids), BFS flow fields; its ray and collision queries hand over to `js/world.js` |
| `js/world.js` | The level as 3D solids in a 3D spatial hash: raycasts (through glass), sight lines, standing collision, ground and ceiling heights; doors and windows as dynamic solids |
| `js/furniture.js` | Room types, furniture layout and collision boxes, furniture/decor meshes |
| `js/server.js` | Host-only authority: phases, enemy AI, damage, objectives and the vote to leave |
| `js/net.js` | PeerJS star-topology transport (the host is also its own client) |
| `js/player.js` | Local player: movement, gunplay, recoil, damage, revive |
| `js/views.js` | Rendering of remote players, enemies and grenades from snapshots |
| `js/render.js` | Three.js scene, effects, viewmodel render pass |
| `js/rig.js` | Character skeleton, procedural animation, bone hitboxes |
| `js/parts.js` | Weapon platforms, parts catalogue, builds and how they change stats |
| `js/gunmodels.js` | Procedural gun models built from parts (first person, third person, gunsmith) |
| `js/gunsmith.js` | The gunsmith: 3D weapon view, part fitting and the sticker tool |
| `js/stickers.js` | Stickers: which there are, your collection, decals on guns, the squad's lists by hash |
| `js/zip.js` | Writing and reading .zip files (the highlights' recordings) |
| `js/hud.js`, `js/shop.js` | UI; the shop's stock and its buying |
| `js/hangar.js` | The hangar between levels: workshop, store, warehouse, lounge, helicopter, and looking-to-buy |
| `js/profiler.js` | The profiler: frame timings by piece of work, saved from the pause menu |
| `js/scars.js` | What a round does to a surface, by its material: the marks, what stands proud of them, and the chips and dust thrown out |
| `js/glare.js` | Being dazzled by someone's weapon light |
| `js/shotlog.js` | F9's record of the shots that hit someone: ghosts of them, the trails, and speed markers in the world |
| `js/highlights.js` | Recording a level and replaying its highlights on the hangar's TVs, as a sports broadcast; saving it as a .zip and rendering the video from one |
| `js/exportworker.js` | The highlights video made off the main thread: the game's code in a worker, rendering and encoding there |
| `js/ballistics.js` | Terminal ballistics: the rounds as they change, penetration, deformation and ricochet in any material, armour layers, the body's anatomy (fitted to the rigs) and wound tracks |
| `js/materials.js` | What everything's made of: every material's numbers, and each solid's construction |
| `js/range.js` | The shooting range behind the hangar: lanes, targets, and giving your ammunition back |
| `js/gear.js` | Carriers, plates, helmets, belts; the grid inventory, ammo items and protection |
| `js/casings.js` | Ejected cases: client-side physics, rendering, and their impact sounds |
| `js/invui.js` | The Kit tab: equipment slots, pouches, locker, drag and drop |
| `js/icons.js` | Item icons drawn on a canvas and cached (magazines, ammo, gear, medical items, grenades) |
| `js/medical.js` | Officers' injuries: body parts, bleeding, fractures, organs, blood, treatment |
| `js/game.js` | Menus, message dispatch, main loop |

## Audio credits

The highlights' crowd (`assets/audio/crowd_*.ogg`) is cut from recordings on Wikimedia Commons, trimmed, made mono
and level-matched:

| File | From | By | Licence |
| --- | --- | --- | --- |
| `crowd_bed`, `crowd_roar` | "WWS FootballAustriavs.Sweden.ogg" (Ernst Happel Stadium, Vienna) | Work With Sounds / Torsten Nilsson | CC BY 4.0 |
| `crowd_cheer_big` | "Arrowhead Stadium crowd noise.wav" | Kj1595 | CC BY-SA 4.0 |
| `crowd_cheer` | "Clapping hurray.ogg" | starlite | Public domain |
| `crowd_ooh` | "Ohhh ahhh.ogg" | starlite | Public domain |
| `crowd_laugh`, `crowd_laugh_long` | "72842 lonemonk approx-800-laugh-1.wav", "72844 lonemonk approx-800-laughter-and-clapter-1.wav" (freesound.org) | lonemonk | CC BY 3.0 |
| `crowd_wow` | "Group Ooh Aah" (freesound.org, sound 870652) | CHallSmith | CC0 |
| `crowd_awww` | "aww.wav" (freesound.org, sound 124996) | phmiller42 | CC0 |
