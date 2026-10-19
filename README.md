# Breach Protocol

Peer-to-peer co-op roguelike tactical FPS that runs in the browser. Three.js for rendering,
WebRTC (via PeerJS) for networking. No build step, no install.

## Running it

```bash
node serve.js
```

Then open http://localhost:8080. (Any static file server works, e.g. `python -m http.server 8080`.)

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

## How a run works

- Close-quarters scale: levels are compact buildings (about 38 m across at level 1, never more than 60 m) of
  small 6-12 m rooms that often share a wall and connect straight through a doorway. Movement is deliberate:
  walk 1.9 m/s, 3 m/s with the weapon lowered (Space toggles it; firing or aiming raises it), 1.4 m/s steadied
  (Shift), crouch-walk 1.3 m/s,
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
  - **Collapse:** below strength 0.3 (about 31% health) their legs give out: they go down and can't get up,
    though they can still shoot, badly, from the floor.
  - **Dead:** the muscles are gone.
  - Only suspects within 40 m of you are simulated; farther off they're animated.
- **Their gun is in their hand.** It goes with the simulated right hand, held the right way up (it can't roll
  more than 25° off level), and while they're aiming the arms hold it on their target as hard as they still
  can: dead on at full strength, 8° off at half, about 40° off from the floor. Their rounds leave that gun's
  muzzle as you see it, and a miss from a gun pointing well off the line flies where the barrel points.
- **They fire when the gun's on you, and it kicks.** Each shot kicks the muzzle up by the weapon's recoil
  (about 5° for an AK, 3° for an M4, 12° or more for a shotgun; half again one-handed and weak) and shoves the
  arms and shoulders back along the bore; the arms bring it back down, fast with two hands and strength,
  slowly without. They fire again once they're facing you and the kick has settled (on the host's screen,
  where that suspect's simulated gun actually points has to agree), or snap a shot off after 0.8 s, worse aimed
  the more the gun's still jumping. So recoil sets their pace: at full strength an AK's burst goes out about
  0.11–0.17 s a round; weakened and one-handed, the same gun manages a round every 0.6 s.
- **The weaker they are, the more readily they give up.** Weakness adds to the chance they surrender when
  shouted at (up to half again), collapse adds more, and it overrides what normally keeps them fighting:
  armed friends nearby, and having already been shooting at you. A lone gunman, gun up, who's been shooting:
  about 1.5% at full strength, about 50% at strength 0.3, about 85% collapsed; with two armed friends in
  sight, about 0.1%, 24% and 73%.
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
  - **Bleeding:** a heavy bleed takes a standard suspect in under a minute, and light bleeds clot after about
    30 s. Bleeding drains health and nerve, so a bleeding suspect is likelier to give up. Blood drips from them
    as they move.
  - **Bones and lungs:** a broken leg makes them limp (two, crawling pace), a broken arm ruins their aim, and
    a punctured lung slows them and spoils their aim.
  - **Bleed-outs:** a suspect who bleeds out is credited to whoever shot them, and judged by what they were
    doing when shot. Zip-tying a suspect stops their bleeding.
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
- **Dark.** There's no weapon light. Rooms are lit by their ceiling lamps, and corridors are dim. Every lamp
  gets its glow, and the twelve real lights move with you to the lamps nearest you, so whatever room you're in
  is lit (moving a light is free; adding one would recompile every shader).
- Themes: Apartment, Warehouse, Bunker, Suburbs, Research Lab, Foundry, Cold Storage (the route map picks
  which). **Every level starts outside the target** (`js/level.js`), and you breach in:
  - **Rooms and corridors** (Bunker, Research Lab, Foundry, Cold Storage). You start on a fenced, paved lot
    in front of the building, among bins, pallets and crates. A double door under a lamp leads in. The
    Bunker's is a **vault door**: thick steel with a locking wheel. It's too heavy to kick: you haul it open
    (hold F, 2.4 s), both leaves together. Bunker walls show no windows outside.
  - **Apartment.** An apartment block. You come up the stairs onto a landing at one end of a lit hallway,
    with apartments either side, from 4 at level 1 up to about 10.
    - **Units:** each apartment is its own home of a few rooms, with one front door onto the hallway.
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
  - **Suburbs.** Two detached houses side by side on a street.
    - You start on the street (pavement, bins, a fence across the road). Each house has its own front door
      under a lamp: pick which one to hit first.
    - Each house is split into rooms with doors between them, and windows onto the street.
    - A narrow alley runs between the houses from the street to the back gardens: a third way round.
    - Behind each house is its garden (a lawn with hedges, a shed, a barbecue and a patio set). Back doors,
      or French doors under a porch lantern, lead out into it. A 1.9 m close-boarded fence divides the two
      gardens. It's open where the alley comes out, and sometimes has a second gap.
    - Street, alley and gardens are open to the night sky: no ceiling, and rounds fired upward keep going. The
      houses show eaves and lit, curtained windows from outside.
    - The fences are too tall to see over and stop movement.
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

  There are two objectives:
  - **Bring Order to Chaos** (required): every suspect arrested or neutralised.
  - **Rescue All of the Civilians** (optional): restrain every civilian the same way, alive. It fails if
    any civilian dies. Completing it pays ¢150 + ¢50 a level on top of the mission bonus.

  Securing bodies (suspects' hands zip-tied behind the back, dead civilians reported) and bagging dropped
  weapons into evidence envelopes pay too. All of it can still be done after order is restored.

  There's no exit zone. Once order is restored, press **Y** to vote to leave (Y again takes it back). The
  level ends when every officer still alive has voted, downed ones included; solo, that's you. The HUD
  shows the objectives (✔ done, ✘ failed) and the vote count, but never how many suspects, civilians,
  bodies, weapons or apartments there are: that's for you to find out. The civilians objective is only
  ticked once order's restored, so it can't tell you there's nobody left to find.
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
  - **Placement:** windows aren't put behind a first aid cabinet or the weapon case. Bunkers have none.
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
- The shop shows an after-action report (arrests, kills, civilians secured, casualties). A clean operation,
  with no civilian deaths and no unauthorised force, pays a bonus.
- **First aid cabinets.** About a third of levels have a white cabinet with a red cross on an indoor wall,
  and some have two.
  - **Using one:** hold F to open it. Your inventory opens with the cabinet's 3×2 grid where the locker would
    be at the quartermaster's. Move medical gear in and out of it like any other container: drag it, stack it,
    or treat yourself straight from it. It closes if you walk away.
  - **Contents:** one to three items, mostly bandages, painkillers and tourniquets, sometimes gauze, a chest
    seal, a splint or a blood bag.
  - **Co-op:** the squad shares it. The host keeps the real contents. If two of you grab the same thing at
    once, the second gets "someone got there first" and it comes off them again; anything put in that no longer
    fits comes back.
- **Weapons come from the field.** You start with a P9 pistol, two spare magazines, an IFAK, and second-hand
  protection: a bump helmet and a Ghost concealable vest, both at half condition. Every level has a weapon case,
  a hard case lying against a wall somewhere away from the spawn.
  - **What's inside:** a weapon in its standard build, fully loaded. It's a long gun three times in four,
    picked by rarity. Each tier has a share of the odds, split evenly between its weapons, and deeper
    levels shift the odds toward rarer tiers. Legendaries only appear from level 3.

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
- Between levels you shop with Vex the quartermaster. He doesn't sell weapons. Each visit he has just two
  pieces of gear, of different kinds (carrier or rig, plate, helmet, belt, backpack), picked by rarity, and
  three weapon parts, plus supplies. A plate carrier comes with a plate fitted, rolled by rarity (soft
  inserts and steel common, multi-hit ceramic rare) and included in its price. Stock is randomised (the whole squad
  sees the same) with better gear deeper in the run. He has one of each piece of kit he lists: once you
  buy it, it's sold out until the next visit. He also has four random pouch types and empty magazines for
  four random guns (up to the level's tier, not just yours), 1–3 of each. About half are the gun's standard
  magazine and the rest a variant (compact, extended, drum, belt box). Supplies no longer sells
  magazines; ball ammo for your calibers is always there.
- **Shared magazines.** Guns built round the same magazine take each other's (`G.MAG_FAMILY` in `data.js`,
  the magazines in `parts.js` `MAG_FAMS`):

  | Pattern | Guns | Magazines |
  |---|---|---|
  | STANAG 5.56 | M4, HK416, F2 Bullpup, TX-9 Tavor, SCAR-L, M27 IAR | 20, 30, 40, 100-round drum |
  | MP5 9mm | MP5, MP5SD | 15, 30, 40, 50-round drum |
  | AK 7.62x39 | KV-47, Galil ACE, RPK | 20, 30, 40, 75-round drum |
  | AK 5.45x39 | AK-74M, AKS-74U, AN-94 | 20, 30, 45, 60 |
  | Glock 9mm | P9, G18, G19, AR-9, AUG 9mm | 15, 17, 33, 50-round drum |
  | M14 7.62 | M14, Mk14 EBR | 10, 20, 30, 50-round drum |
  | Saiga 12-gauge | Saiga-12, Vepr-12 | 5, 8, 12, 20-round drum |

  A magazine from one goes in any of the others: reloading, dragging it onto the gun, and the shop's
  "Fits your …" all count the whole pattern. The G36 and AUG keep their own magazines, as do the SCAR-H,
  FAL and SR-25. An LMG that takes rifle magazines (the RPK) uses them like a rifle; the belt-fed ones
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
  cases. A weapon case with a convertible gun in it has a 35% chance of a conversion packed in: the receiver
  group with the barrel (and slide, handguard...) it needs. The gunsmith stocks receiver groups now and then.
- **Shotgun loaders.** The tube shotguns (870, KSG, Slug Gun, Benelli M4) take a side saddle (each shell a
  little faster), a twin-shell carrier, or a quad speed loader (four shells a push). A full tube on the Benelli
  takes 3.6 s bare, 2.9 s with the saddle, 2.6 s with the carrier and 1.9 s with the quad loader.
- **Pistol stocks.** The P9, G18, G19 and Auto-9 have a stock lug: a folding stock, a brace or a carbine stock
  kit cuts recoil by 14–30% at some cost to handling.
- If you go down you can still shoot your sidearm. A teammate has 30 s to reach you: they hold **F** to check
  you, treat you and revive you from their Tab screen. If they don't, you're KIA until the next level. If the
  whole squad is down, the run ends.
- **Injuries** (`js/medical.js`). There's no health bar and no medkit; your body is seven parts with their
  own health: head 35, thorax 85, stomach 70, each arm 60, each leg 65.
  - **Hits:** a hit takes health from the part it lands on, and can leave an injury there:
    - bleeding, light or heavy
    - a fracture (arms and legs)
    - a punctured lung (thorax)
    - a gut wound (stomach)

    A round through the middle of a part is likelier to do damage than a graze, and armour that stops part
    of a round also cuts the odds. Grenade fragments spread over the legs and lower body.
  - **What kills you:**
    - an unarmoured head is a kill, and the head at zero is death
    - the thorax at zero puts you down
    - a destroyed arm, leg or stomach passes further damage on to the thorax

    Whatever kills you shows on the body (an unprotected head shot leaves the head destroyed and
    bleeding), and the KIA message says what it was: shot in the head or face, killed by the blast,
    died of your chest wound, or bled out.
  - **Blood:** bleeding drains it (light 0.35%/s, heavy 2.2%/s per wound, a gut wound slowly). Below 70%
    your aim suffers; at 15% you go down; at 0 you die.
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
    | Hemostatic gauze | heavy bleeding | anywhere, the torso too | 5 s |
    | Chest seal | punctured lung | thorax | 4 s |
    | Splint (1×2) | fracture | arm or leg | 6 s |
    | Painkillers | pain's effect on aim, for 2 minutes | — | 2 s |
    | Blood bag (1×2) | blood loss: +40% blood | anywhere | 8 s |

    A gut wound can't be fixed in the field, and nothing restores a part's health there: you go into the
    next fight as hurt as you are.
  - **Treating yourself:** open Tab. Your body is on the right; drag the item onto the part, or right-click
    the item to see what it can treat. The wrong item for a wound (a bandage on heavy bleeding) is refused
    and says what's needed.
  - **Treating a teammate:** face them and hold **F** (a downed one just needs to be near). Your Tab screen
    opens with their body. Treat them with your own items the same way (you need to stay within 2.6 m), and
    revive a downed one there (4 s). A revive brings the thorax back to 20, but it can't make blood: someone
    downed with under 25% blood needs a blood bag first. Their wounds still need treating. A blood bag on
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
  - **Shape:** an act starts at a single way in (the first act in the apartments), fans out into four routes
    that wander and sometimes cross paths, and they all come back together at the Kingpin.
  - **Environments:** each node is an environment (apartment, warehouse, bunker, suburbs, research lab,
    foundry, cold storage), so the route you take picks the places you'll fight in.
  - **Sync:** the map is generated from a seed, so every peer draws the same one. The host keeps the squad's
    position and the votes, and players who join late get both.
- Difficulty scales with level and with squad size.

## Content

- **53 primaries**: assault and battle rifles, SMGs, shotguns, LMGs, DMRs, bolt-action and anti-materiel snipers,
  a grenade launcher, a railgun and a crossbow
- **17 sidearms**: pistols, machine pistols, revolvers (including a .410 shotgun revolver), a derringer,
  a sawed-off, a pocket grenade launcher and akimbo Berettas
- Weapons differ in how they work, not just in stats:
  - **AN-94 hyper-burst**: the first two rounds of each trigger pull fire at 1800 rpm.
  - **M1 Garand**: en-bloc clip that only reloads when empty, and pings when it ejects.
  - **Minigun**: has to spin up before it fires.
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
  - **Shotgun beads:** the bead guns (the 870, the double barrel, the sawed-off) have a rib from the
    receiver to the muzzle, level with the top of the receiver, with a brass bead on its end. Aiming, you
    look along the receiver and rib with the bead on the target. A side-by-side's forend sits under the
    barrels.
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

    Teammates see it. Your squad colour is the armband on your left arm and your name tag. Your own arms in
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

  | Kind | Products (brand) | Stops handgun / rifle rounds (new) | Durability |
  | --- | --- | --- | --- |
  | Vest / carrier | Ghost concealable vest (Northmark), PC-1 slick carrier (Kestrel), Patrol carrier (Ironvale), Recon chest rig (Vantage), Assaulter carrier (Paragon), Heavy assault armour (Sable Ridge) | Soft armour 85–95% / 10–12%; the heavy armour also covers the stomach at 65% vs rifles, plus shoulders and thighs | 0–9 |
  | Plate | IIIA soft insert (Graywater), AR550 steel (Ironvale), UHMWPE (Meridian), ceramic (Halcyon), multi-hit ceramic (Vantage) | 92% / 12% up to 97% / 94% | 4–8 |
  | Helmet | Bump (Northmark), high-cut IIIA (Kestrel), full-cut IIIA (Ironvale), rifle-rated (Meridian), visor (Sable Ridge) | 30% / 0% up to 95% / 55%, visor 85% / 20% on the face | 2–4 |
  | Face (on a helmet's mount) | Mandible guard (Kestrel), IIIA face shield (Ironvale), rifle face shield (Meridian) | face: 85% / 10% (on 40% of face hits), 88% / 12%, 95% / 50% (on 90%) | 2–3 |
  | Belt | Duty (Graywater), battle (Kestrel), war belt with dump pouch (Paragon) | — | — |
  | Backpack | Sling pack 4×3 (Graywater: pistols, compact SMGs), 3-day assault pack 5×3 (Kestrel: up to rifles and shotguns), large rucksack 6×5 (Sable Ridge: any gun, 3% slower) | — | — |

  - **Rounds:** buckshot counts as a handgun round. Armour-piercing rounds (penetration 2+: the snipers)
    get through twice as well.
  - **Wear:** every hit costs the piece it strikes durability (a rifle round 1, a handgun round 0.5, a
    pellet 0.2), and protection falls to about a third as it's used up.
  - **Bruising:** a stopped round still bruises, for a tenth of the wound.
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
        that's free, and everything else into your pockets, pouches or pack.
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
    | Hollow point | Wounds ×1.3 and stops in the first body; armour stops it more |
    | Armour-piercing | Gets through armour and through bodies; wounds ×0.9 |
    | Tracer | Burns red all the way out |
    | Subsonic | Wounds ×0.85, shorter range; through a suppressor it's heard no further than a crossbow |
    | Buckshot | The standard shotgun load |
    | Slug | One heavy slug: accurate, hits like a rifle round, goes through |
    | Birdshot | A cloud of tiny pellets: painful, rarely lethal, useless on armour |
    | Flechette | Steel darts in a tight pattern that get through soft armour |

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
    - **Buying:** the quartermaster always sells ball (or buckshot) for every caliber you own a gun in, and
      empty magazines. Each visit he also has one random special load, a handful of rounds.
  - **Grenades and medical items** are items too: G throws your first grenade, and medical items are used
    on the body in the Tab screen (H opens it).
  - **Locker:** everything else waits in your locker, a 10×8 grid that stays at the quartermaster's between
    levels.
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
  - **Armour repair** restores every plate, vest and helmet you own.
  - **Medical items** (all six, see Injuries) **and frag grenades.**

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
  - barrel, muzzle device, handguard, foregrip, tactical (laser), sight, charging handle, pistol grip, stock,
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
    | Underside rail (M-LOK / Picatinny) | foregrips and bipods | 26 weapons (only with a railed handguard) |
    | Side rail | lasers and weapon lights | 26 weapons (only with a railed handguard) |
    | AR-15 grip mount | pistol grips | 20 weapons |
    | Other stock mounts | stocks | AR-15 buffer tube, AK trunnion, rifle stock, SMG, precision and machine-gun mounts |
    | Muzzle threads | flash hiders, brakes, compensators, suppressors | 5.56, 7.62, AK, 9mm, .45, PDW, .50, pistol, 12ga chokes |

    A thread only exists on a threaded barrel. Barrels, magazines, slides and magazine tubes are made for
    one weapon.
  - **Standard parts are real products:** a gun's standard attachments are catalogue products shared with
    every gun of the same interface. The M4's stock is the same Kestrel CS-4 any AR-15 can use. Each
    weapon is calibrated so its standard build keeps its stats, and changing a part moves them from there.
  - **Missing parts:** handguards and pistol grips can't be left off. Running without a stock is allowed,
    but costs a lot of recoil.
  - **Stats:** parts change ergonomics (aim and draw speed), recoil, aimed and hip spread, muzzle velocity
    (damage and range), weight (movement speed), tube capacity, and sight magnification.
  - **Magazines aren't parts.** Compact, extended, drum and belt-box variants are magazine items (bought
    with the magazines on the Stock page), each with its own capacity, size and handling. Whichever one is
    in the gun is its magazine: reload with a drum and the gun holds a drum's worth and reloads like one
    until you swap back. Only a conversion from an internal magazine to a detachable box (the bolt guns)
    is a gunsmith part.
  - **Sound:** barrel length and the muzzle device feed the gunshot synth, so a short barrel or a brake
    sounds different.
  - **Using it:** the 3D view orbits and zooms. Hover a piece to see what it is, or click it to pick its
    slot. Hover a part in the list to preview it on the gun with its stat changes, and click to fit it.
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
- **Lethality** (`G.WOUNDS` in `js/data.js`): rounds kill the way real ones do.
  - **Heads:** a round to an unarmoured head always kills. A helmet covers the top of the head, not the face
    below its brim.
  - **Body:** elsewhere a hit takes a share of a person's life. The share depends on the body part, on how
    centrally the round passes through it (heart and lungs, liver and spine, the femoral artery hurt most),
    and on the round: heavier rounds wound more, though not in proportion.
  - **Arms:** a round through an arm held across the body carries on into the chest behind it.
  - **Both ways:** it works the same on you. Enemy rounds that hit you land on a body part (leaning shows
    your head and shoulder, crouching hides your legs, an aimed marksman goes for the head). A round to your
    unarmoured head or face kills you outright: no bleeding out, no revive. Everywhere else, see Injuries.
  - **Body armour and helmets:** they stop handgun rounds better than rifle rounds, and they wear (see the
    kit table above).
  - **Toughness:** wounds don't scale with enemy health, so a person is as easy to kill on level 10 as on
    level 1. Only the tougher types (the Enforcer, about 1.5×, and the Kingpin, about 6×) take more.
  - **Explosions:** they still do plain damage.

  Rounds to kill an unarmoured suspect at close range:

  | Weapon | Head | Chest | Chest (flank) | Abdomen | Thigh | Arm |
  | --- | --- | --- | --- | --- | --- | --- |
  | 9 mm pistol | 1 | 2 | 3 | 2 | 3 | 4–6 |
  | .45 pistol / AK | 1 | 2 | 2 | 2 | 2–3 | 3–5 |
  | 5.56 rifle | 1 | 2 | 3 | 2 | 3 | 3–5 |
  | 7.62 battle rifle | 1 | 2 | 2 | 2 | 2–3 | 3–4 |
  | Marksman rifle (SVD) | 1 | 1 | 2 | 1–2 | 1–2 | 2–3 |
  | Bolt-action sniper | 1 | 1 | 1 | 1–2 | 1–2 | 2–3 |
  Press **F9**, or add `?hitboxes` to the URL, to draw them.
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
    holographic sights, and an open reflex on a riser. Pistols take an open dot, a green dot, a circle-dot or an
    enclosed dot (glass at both ends) in their optic cut.
  - **Magnified optics are picture-in-picture.** Prisms, combat scopes, LPVOs and rifle scopes show the world
    on their ocular lens, rendered from the lens along the scope's axis. The field of view is the lens's
    apparent size divided by the magnification. Prisms come in 1×, 1.5×, 2× and 3×; the combat scope is 4×.
  - **Variable power:** scroll while aiming to step the power: the LPVO 1/2/4/6×, the hunting scope 3/4/6/9×,
    the long-range scope 5/8/12/18/25×. Aiming sensitivity follows the power.
  - **Magnifiers** (2×, 3×, 5×) go on the rail behind a red dot, holographic or riser-mounted reflex sight.
    Scroll up while aiming and it flips in on its hinge (you see the dot, magnified); scroll down and it swings
    out and down beside the receiver, back to 1×.
  - **The rest of the view** only tightens slightly, so the gun and the room stay visible around the scope.
  - **Scope reticles and eyebox:** each scope draws its own reticle (duplex crosshair, illuminated chevron or
    circle-dot). A dark crescent creeps in when your eye isn't on the scope's axis, such as while you're
    still bringing it up.
- **Weapon lights and lasers** (side rail, or a pistol's frame rail). The back side button on your mouse
  switches the light, the forward one the laser. A light is a real spotlight from the gun that your squad sees
  too, and shone into a suspect's face from up to 15 m (22 m for the high-output one) it ruins their aim: they
  hit about half as often while it's in their eyes. A laser puts a red or green dot where the bore points (on a
  wall or on someone), and only tightens your hip fire while it's on. The PQ-15 module and the pistol combo
  unit have both.
- **Default sights.** Every weapon leaves the factory with iron sights (folding sights on a rail, or its own fixed
  sights). Sniper rifles and the railgun are the exception: they come scoped. Optics come from the gunsmith.
- **Proportions are checked against the real weapons.** Each default build's overall length, measured from the
  built model, is within about 6% of the published length of the gun it's based on (stock extended; sources
  are the weapons' Wikipedia spec boxes). The model barrel length is the part that shows forward of the
  receiver, since the chamber end sits inside it. It's visual only: ballistics come from the barrel length in
  `G.GUN_SPECS`. Larger gaps are deliberate: the G18 carries an add-on compensator, and revolvers and the
  derringer run up to 9% short.

  | Model | Ours (mm) | Real (mm) | Model | Ours (mm) | Real (mm) |
  | --- | --- | --- | --- | --- | --- |
  | M4 | 857 | 838 | MP5 | 712 | 680 |
  | HK416 (14.5") | 902 | 900 | MP5SD | 782 | 805 |
  | AK-47 | 906 | 880 | Micro Uzi | 460 | 460 |
  | FAMAS | 779 | 757 | Vector | 652 | 620 |
  | G36 | 985 | 999 | MP7 | 637 | 638 |
  | SCAR-H | 987 | 965 | P90 | 477 | 505 |
  | Tavor | 739 | 720 | Thompson | 882 | 860 |
  | AUG | 799 | 790 | PPSh-41 | 857 | 843 |
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

`js/vmanim.js` animates the first-person weapon.

- **Arms:** both run from fixed shoulders to wherever the hands need to be, so a hand can leave the gun,
  fetch a magazine from the pouch on your hip and come back.
- **Moving parts** on the gun models: magazine, AR charging handle, AK side bolt handle, HK cocking tube,
  bullpup side handle, open-bolt top knob, pistol slide, pump, bolt, lever, belt-feed cover, break-open
  barrels and revolver cylinder.
- **Reloads by action type:**
  - **Magazine:** the gun lifts and cants so you see the well. You strip the mag, drop it, fetch a new one,
    seat it and slap it home. Pistol magazines fall free when you hit the release.
  - **Empty reloads add a rack:** AR charging handle, AK/side handle, HK slap, pistol slide or bolt.
  - **Shell by shell:** tube shotguns, the lever gun, the Mosin and the M32 roll the port toward you and
    load one round at a time, then rack once at the end if they were empty.
  - **Revolver:** swing the cylinder out, muzzle up to eject, then the speed loader in and flick it shut.
  - **Break-open:** the double, sawed-off and derringer open, take shells and close.
  - **Belt-fed:** open the cover, swap the box, lay the belt, close it.
  - **Others:** a Garand en-bloc clip, a crossbow bolt laid on the rail, and akimbo magazines both dropping
    at once.
- **Between shots:** your right hand works the bolt on bolt-actions, and your left rides the pump.
- **Inspect (I):** show the left side, then the top and right, then a chamber check (charging handle or
  bolt handle eased back, a press-check on pistols, or a glance at the magazine). Any action cancels it.
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
  - **Sound:** each real impact makes its own sound, panned to where it is. The synthesized casing sound
    that used to be baked into every gunshot is off.
    - Brass rings in a few inharmonic modes, at a pitch set by the case's length: about 4.2 kHz for a 9 mm
      case, 2.6 kHz for 5.56, 1.3 kHz for .50 BMG.
    - Steel rings lower and shorter, aluminium higher and deader.
    - Shotgun hulls make a hollow plastic tock with a click from the brass head.
    - The surface matters: tile and concrete let a case ring, wood shortens it, and carpet and grass
      leave little more than a tap. Harder impacts are louder, so each bounce is quieter than the last.
- **Rounds going past and landing** (`js/audio.js`):
  - **Cracks are for supersonic rounds only.** A round that passes within 5 m of you cracks only if it's
    still faster than sound (343 m/s) where it passes. Its speed comes from:
    - its caliber's real muzzle velocity, scaled a little by the build's barrel length
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

Gunshots come from the physics-based gunshot synthesizer from `tactical_game/synth`, copied verbatim
into `js/gunshot-synth.js`. Each weapon has interior-ballistics inputs in `G.GUN_SPECS` (`js/data.js`):
barrel length, caliber, chamber pressure, powder grain, bullet weight, action type, muzzle device and case.
`js/gunaudio.js` (a port of tactical_game's `gunAudio.ts` + `acoustics.ts`) ray-casts the room
around each shooter to choose a reverb environment. It renders and caches one buffer per weapon and room
type in the background when a level loads, then plays shots with 3D HRTF panning, distance falloff, air
absorption, and muffling through walls. Each build has a sound key (`weapon:barrelInches:muzzleDevice`), so
barrel length and muzzle device (suppressor, brake, compensator, flash hider) change how it sounds. Reload foley uses the recorded samples from tactical_game (`assets/audio`).
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
| LMB / RMB | Fire / aim down sights |
| R | Reload (retention: the old magazine goes back in its pouch) |
| R R (double tap) | Dump reload: the old magazine goes into your dump pouch, or onto the floor without one |
| 1, 2, mouse wheel | Switch weapon (the wheel while aiming steps a variable scope or flips a magnifier) |
| Mouse back / forward | Weapon light / laser on or off (each gun remembers its own). In a level they don't navigate the browser: the page keeps a back and a forward history entry of its own and turns a side-button navigation into the button press. Outside a level, back works as usual (twice to leave). |
| I | Inspect your weapon |
| G / H | Frag grenade / open your body and kit (as Tab) |
| B (hold) | Swap the gun in your hands with the next one in your backpack |
| V | Shout compliance ("Police! Show me your hands!") |
| X | Fire selector: semi / auto (or burst), on guns that have one |
| F (hold) | Doors (aim at the door above 1.3 m, a little over its middle, to open it, lower to kick it; face an open door to close it; reach 1.9 m), bag evidence (aim at the weapon), swap with the weapon case, arrest, zip-tie or report (aim at the person or body; whichever of a body and its dropped weapon is nearer the centre of your view), check or treat a teammate. Every interaction is a hold: let go and it's abandoned. Any of these puts your weapon away; drawing it again takes about 1 s (0.65 s for a sidearm). |
| M | Mute / unmute (also `?mute` in the URL) |
| F8 | Show / hide gunshot echo paths |
| F9 | Show / hide hitboxes |
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

## Code layout

| File | Purpose |
| --- | --- |
| `js/data.js` | All weapons, armour, enemies and their kit, wounds and themes. Tune the game here. |
| `js/level.js` | Level generator, collision, raycasting, BFS flow fields |
| `js/furniture.js` | Room types, furniture layout and collision boxes, furniture/decor meshes |
| `js/server.js` | Host-only authority: phases, enemy AI, damage, objectives and the vote to leave |
| `js/net.js` | PeerJS star-topology transport (the host is also its own client) |
| `js/player.js` | Local player: movement, gunplay, recoil, damage, revive |
| `js/views.js` | Rendering of remote players, enemies and grenades from snapshots |
| `js/render.js` | Three.js scene, effects, viewmodel render pass |
| `js/rig.js` | Character skeleton, procedural animation, bone hitboxes |
| `js/parts.js` | Weapon platforms, parts catalogue, builds and how they change stats |
| `js/gunmodels.js` | Procedural gun models built from parts (first person, third person, gunsmith) |
| `js/gunsmith.js` | The gunsmith: 3D weapon view and part fitting |
| `js/hud.js`, `js/shop.js` | UI |
| `js/gear.js` | Carriers, plates, helmets, belts; the grid inventory, ammo items and protection |
| `js/casings.js` | Ejected cases: client-side physics, rendering, and their impact sounds |
| `js/invui.js` | The Kit tab: equipment slots, pouches, locker, drag and drop |
| `js/icons.js` | Item icons drawn on a canvas and cached (magazines, ammo, gear, medical items, grenades) |
| `js/medical.js` | Officers' injuries: body parts, bleeding, fractures, organs, blood, treatment |
| `js/game.js` | Menus, message dispatch, main loop |
