# The space battle on the server

Where the space battle runs, and the plan to move it. Written 2026-11-21 at 60da28b5.

## Before (2026-11-21, at 60da28b5)

Every player's page ran the whole battle itself (what follows is how it was; it's all on the server now: Where it goes, C1, C2), in js/space.ts `update` (fixed 1/60 s steps from an accumulator): the zone,
flight, the radar suites (her own `EW.own`, the mission ship's `EW.foe`, the zone's ships' `EW.tsu`), fire control, the hull guns,
rounds, missiles, torpedoes, chaff. The page whose `isCtl()` is true is authoritative for damage, missile launches, a round killing
a torpedo, and her flight; it tells the others (`sfire`, `shit`, `smis`, `storp`, `strk`, ...). The radar's noise is `Math.random`,
so every page's picture is its own: the sensor operator's tracks are not the pilot's, and the hull guns on each page aim from that
page's own track of her. The server worker (js/serverhost.ts, js/server.ts, js/spaceserver.ts) runs the people, the AI, and the
space side's state (crew, hostility, gunners, countdowns, the zone's clock), at fixed 1/60 s steps.

What ties the battle to the page:

- radar returns computed from drawn meshes (`Radar.rcsOf`), the zone's ships' poses read from scene matrices, rocks through the zone
  group, gun mounts by raycasting the hull model (`fitMounts`), breach sites from the hull's triangles (`hullClear`);
- missiles' state kept in their meshes, chaff alive while its points are in the scene, the battle not stepping without `S.root`
  and `S.model`;
- input read inside the simulation (`K()`, the mouse in `fly`, the turrets), HUD, sound and network calls inside it;
- the GPU's timing deciding outcomes: a zone ship's stand-in or real hull (`zoneReal`, by frame budget) changes her radar return;
  the FTL tunnel holds its clock while shaders compile.

## Where it goes

One authoritative battle per session, in the host's server worker, as a page-free module (js/spacesim.ts): ships, rocks and
traffic as data, shapes baked or computed from the same definitions the drawing uses, a fixed 1/60 s step, seeded random streams.
Pages are clients: they send controls and requests (the pilot's stick and keys, the gunners' aim and trigger, the sensor
operator's picks), and draw what the server sends (snapshots, events, the sensor station's picture to its operator, F8's on
request). The same module loads in Node with no browser for headless tests: the server's step in a tight loop, as fast as the
CPU allows, repeatable from a seed.

## Phases

Each phase leaves the game playable and verified. Order: 0, A, B, D, C1, C2 (then E, maybe).

### 0: groundwork, still on the page

1. Bugs (done at the start of phase 0):
   - `ms` set the zone clock's base in milliseconds (`S.ztAt = performance.now()`) against a clock in simulation seconds;
   - `strk` was relayed only up to 5 numbers: the listen-only toggle (6) never reached the rest of the crew;
   - the zone's clock (`Z.zt`) advanced once per live level context per step, not once per step (`Server.stepN`).
2. Interpolation: the simulation steps at 60 Hz; what's drawn is blended between the last two steps by how far into the next the
   frame is, so movement is smooth at any refresh rate (one step, 16.7 ms, behind). Her pose (the whole outside view), the zone's,
   the traffic's, torpedoes, missiles, rounds, chaff.
3. Seeded random streams for the battle (mulberry32, as `U.rng`): one per radar suite, the guns, chaff, torpedo ids, a separate one
   for the debug view's display noise. View jitter stays on `Math.random`; the ground simulation's stream is untouched.
4. Outcomes decoupled from the view: a zone ship real or a stand-in by distance (5 km), not frame budget; chaff dies by age; the
   FTL run ends on its own clock (the tunnel and the veil wait for shaders, the simulation doesn't); `through`'s `setTimeout` a
   step countdown; the hub's zone time from the board, not `Date.now`.
5. A golden: a step script fingerprinting every simulated second (her pose and hp; each suite's contacts, beliefs, assessments;
   trackers; torpedoes, missiles, rounds; hull guns; events), `tests/space-golden.json`. Two runs identical; slow and fast frames
   identical. The torpedo, point-defence and tracking step scripts committed beside it (tools/).

### A: a pure SpaceSim, still run on the page

js/spacesim.ts: a `World` (ship, zone, traffic, rocks, suites, rounds, shots, missiles, torpedoes, chaff, hull guns, FTL, warp,
autopilot, step counter, random streams, an outbox of events), `step(W, inputs)`, `cmd(W, c)`, and an `env` of shapes the page
supplies from today's mesh code (so nothing changes yet). js/space.ts becomes the view: builds `env`, samples input, steps,
drains the outbox (HUD, sound, network as today, `isCtl` as the world's authority), and mirrors the state onto meshes. In steps,
each matched against the golden: entities as data (A1); the zone as maths, `zoneAt(t)`, traffic from `SD.zonePos` (A2); radar and
fire control, the radar module's globals (`occ`, `lit`, `painted`, its cache) into the world (A3); flight without input reads,
the breach assists returning plan data (A4); the sensor station's and helm's commands (A5).

### B: shapes as data

The squad's ships' radar tables, sizes, tube and turret mounts baked (tools/bake_ships.mjs, `space.json`); the mission hull's
geometry split from its dressing (js/hullshape.ts: the same triangles `ShipModel.hull` builds, from the map), with `rcsOfTris`,
`fitMounts` and `hullClear` on them; the zone's ships' stand-ins as shapes; the asteroid's height into spacedata. Checked against
the live meshes' values; the golden re-baselined once.

### D: Node runner

tools/space_sim.mjs: the simulation's files in Node with node's three as THREE (the pattern of tools/check_sim_golden.mjs and
tools/vm_game.mjs), a world from a scenario, scripted pilot / sensor operator / helm / gunner, fixed steps as fast as possible.
A golden of its own, and metrics over many seeds (time to a first track, torpedoes shot down, damage taken). `npm run test:space`.
Its fingerprint must match the browser's for the same scenario: the proof the page no longer feeds outcomes.

Status (2026-11-21): tools/space_sim.mjs runs it (scenarios `pd`, `approach`; `--metrics N` the point-defence table), golden
tests/space-golden-node.json, `npm run test:space`. About 30-37 sim s per wall s for one battle on one thread (a run a worker
thread: its own three and vm), ~110x over 12 threads. Not yet compared against the page's fingerprint for the same scenario.

### C1: in the worker, the server authoritative for combat

The world in SpaceSv (one per zone, and the hub's), stepped once per server step (not once per level context). Its events go to
SpaceSv directly (a breach to `dock`, hull failure to `jump`, a zone ship boarded to the `tboard` path, near ships to `warm`).
Pages draw snapshots and events; the pilot's page still flies her and sends her pose stamped with its step (the server extrapolates
it for hit tests). Messages: `sss` (the core snapshot, 20 Hz, all), `sev` (events, reliable), `ssen` (the sensor station's
picture, 10 Hz, its operator only), `sdbg` (F8's, on request), `sin` (inputs). A second, unreliable binary channel for
the snapshots (built: `ServerHost.fast` / `SvNet.fast`, `Net.onFast`, js/netfast.ts, js/snapcodec.ts; docs/threads.md, "The fast
channel"); the JSON one for events and requests. Rounds aren't streamed: a burst's seed, and every side flies the same rounds.

Server side done (2026-11-21, js/svbattle.ts, js/spacenet.ts): SpaceSv makes the world with a board zone's level (again on tboard or
a level come back to; dropped with the zone) and js/serverhost.ts steps it once a step after every level's. The pilot's `spose`, and
`strk` `ssec` `srcue` `sxpdr` `schaff` `shit` `storp` act on it as well as being relayed. A torpedo is made from the first `storp`
and flown as its owner reports it until it comes onto its datalink, when the server takes it over on its own fix nearest its nose (an
`f: [x, y, z, vx, vy, vz]` on the first `storp`, the fix it was sent at, makes it the server's from launch). Out: `sss` every 3 steps,
`sev` with it (a gun's rounds a step as `fire`: gun, aim, error, seed, count, flown by `fireRound` on `SpaceNet.rng(seed)`; rounds'
ends not sent). `G.ServerLink.sworld()` sums the server's world up; tools/space_steps/server_battle.mjs sets it beside the page's.
Then the pages stopped running it (2026-11-21, f3cfce7d on; 2026-11-22 everywhere in space, the page's own battle and its
`?pagebattle` switch deleted): the server makes a world wherever she is in space (a boarding zone's, with the mission ship, the zone's
ships and rocks; a base's orbit; the hub, where it has no level of its own: her and what she puts out), and no page steps any radar
or fire control, flies a torpedo or a missile, or decides a hit; the HUD, the hologram, the sensor station, the helm's targeting, her warning receiver
and F8 draw the server's pictures (fast streams 1-3). The server keeps her hull (from the pilot's first pose; `sdmg` for what she hits
herself; at nothing it jumps her home itself), flies her turrets' rounds and decides their hits (`sfire` with its damage:
js/spacesim.ts shotsStep), takes what she's matched speed with into its notch (`smatch`), swaps a zone ship's real hull in inside 5 km
once it's made her level (js/svbattle.ts realShape, from js/spaceserver.ts warm), and sends `sss` as bytes on fast stream 4
(js/spacenet.ts sssBin). Step scripts: hull_server, turret_server, zone_real, torpedo_defence, server_battle (tools/space_steps/).
Still the page's: discrete flight events (the breach, landing, launch, warp, FTL) and the atmosphere stage of an assault (her pose
from the pilot's page, as before C2); collisions (told the server: `sdmg`, and her state after them).

### C2: the pilot's inputs, predicted

The pilot's page sends inputs; it predicts her flight with the same step, and replays its inputs from the server's state when a
snapshot arrives. Discrete events (the breach, landing, launch, warp, FTL) are the server's. Others aboard draw her interpolated a
little behind.

Status (2026-11-21, f071ba39, 70dcc5ac, 043bbea7): her free flight is js/spacesim.ts flyStep (flyTurn, flyPush, from a step's FlyIn).
While the server's battle's on, the pilot's page sends each step (`sin`): its input if the step was flown free (checked against flyStep
from her state before it, bit for bit), else her state after it (the breach assist, the warp gate's pull, a collision, a rebase: the
page's still, and the server takes them). The server flies the inputs in order after its world's step (a jitter buffer of three) and
tells the pilot where it has her (fast stream 5); the pilot's page replays from the server's word when it differs, each step through
its own recorded zone frame. The others aboard follow the server's pose (in `sss`). tools/space_steps/fly_server.mjs: every ack
exactly the page's prediction; a falsified one corrected and replayed to the same place. Not yet: the breach, landing and the rest
decided on the server (the pilot's page still says them); a second player's page checked.

### C3: the whole helm on the server (asked for 2026-11-22: the pilot's page sends inputs, nothing it decides)

Everything the pilot's page still decides about her flight moves into one page-free module, js/helm.ts: her flight in every mode
(free, the breach assist and being brought round (squareUp, roundUp, aim), warp (warpGate, spinUp, warpAim, warpStep), the autopilot
(auto, autoStep: docking, landing, launching), the FTL run's flight, the assault's atmosphere stage (righting, the descent, landing on
the pad), collisions (collide: the level's boxes, the floor, the rocks near her), and the events (the breach: where, at what angle;
landing; the way up). It works on a helm state (her pose, way, turn rate, stick, and the modes' state: brLock, brRound, auto, warp,
spin, cruise, stage, docked, match) and the level's geometry given as data (its map: breach sites, boxes, the hull; the berth and its
poses; anchors; waypoints; the floor), and says what happens as events (no HUD, sound or network inside it). The server runs it as
the authority (js/svbattle.ts, its geometry from the level map it has; the hub's layout made data for it), and its events do what the
page's did (dock, the cut, the jump, the stage change); the pilot's page runs the same step to predict, sends its inputs (keys, the
stick's push, and commands: warp, land, launch, dock, the H match), and is put right from the server's whole helm state. The plan
drawings (planDraw, routeDraw) are drawn from the helm state on the page.

Steps, each checked by fly_fp.mjs (unchanged), fly_server.mjs (every ack exact) and a step script of its own:
1. js/helm.ts: the state and geometry types; the flight functions moved as they are (the page's S passed in as the state, its
   side effects as an outbox), the page calling them. fly_fp identical.
2. Collisions and the breach / landing events into it, as events; the page acting on its own events as now.
3. The breach assist and the round-up into it (their plans as data for the drawings).
4. Warp, the autopilot, docking, launching, landing, the FTL run's flight, the atmosphere stage.
5. The input stream: keys, the stick's push and commands; the helm state packed for the ack; the page predicting the whole step and
   replaying on a correction. No state entries left (every step's input is all the server needs).
6. The server: the helm per world from its level's geometry (the hub's from data), its events acting on SpaceSv (sdock, the cut, the
   jump, stage changes) and told to everyone; the pilot's page no longer sends sdock/jump/stage for her flight.

Status (2026-11-22, f47ee60d .. d5a826b7): done. The server runs js/helm.ts on its own helm state (js/svbattle.ts flyOn, helmFor),
each world's geometry built from data (hubPlace, boardPlace + boardMove, assaultPlace, helmBerth; breach sites cleared against the
hull's triangles), and its helm's events act on the host: the breach and setting down dock her (js/spaceserver.ts dock), off her berth
undocks her (if everyone's aboard), the jump is asked (jump), another zone ship is made the level (tboardTo), the zone's ships near her
are made ahead (warm), what she runs into hurts her hull. The pilot's page sends its steps: the input (at the helm, keys, the stick
as pushed, her radar lock's way as shown) and what only it knows: the target picked and the match, the commands given between steps
(warp, set down, off her berth, the drive spooled, the host's jump joined, the drive spun down), the zone's time it flew the step on
(the server's helm places the zone by it), the zone ships it has drawn ready, and the host's word of a new place it set her up from
(the server puts her where js/helm.ts arrive says for the same). Each step's checked on a shadow of the helm and against where the
last left her; a state is sent only when something else moved her (a test). The server's word is her whole helm state; the page
predicts and replays. Step scripts: fly_server, breach_fp, descent_server, tboard_server, helm_geo, fly_fp (tools/space_steps/).
Left on the page: drawing all of it (the plan, the veil, the tunnel, the stage's look), the mouse's push on the stick, and the zone
ships' readiness (what's drawn). Not checked yet: setting down on a base's pad from the air, a pilot taking the helm mid-flight.

### E: the battle in the zone's frame

Inertial: no frame turning, no rebasing when the squad boards another zone ship.

Status (2026-11-22): done on the server. js/spacesim.ts worldStep runs in the zone's frame: what flies (rounds, torpedoes, missiles,
chaff, her turrets' rounds) flies straight; the rocks and the zone's ships are where the zone has them; the mission ship's suite and
return are carried through the zone by her level's placing each step (foeL), her guns laid in the level's frame (her up is the
level's) and what they fire brought into the zone, a torpedo's fuse tested against her hull's footprint in the level's frame. W.L
(SimFrame) turns places, velocities (the zone's own way taken out or put back) and attitudes between the two. Her helm stays in the
level's frame (the breach's geometry is the level's): her pose goes into the battle each step through worldStep's ship hook. What
crosses the wire stays in the level's frame: the snapshot, the events, her radar picture and F8's (js/suiteview.ts pack's xf), the
warning receiver's bearings; and what comes in from the pages (a turret's round, chaff, a torpedo and the fix it's sent at) is
brought into the zone. Boarding another zone ship moves nothing of her radars' (Radar.rebase gone from the server). The Node runner's
pilot flies in the level's frame through the same hook. Point defence over 20 seeds: 16 shot down (15 before), HOSTILE 6.87 s
(6.87), a gun-quality track 8.90 s (8.92), the first round 9.11 s (10.79: her guns laid on a physical track); the approach scenario
95.4 damage (84.8).

## Bandwidth (rough, binary)

`sss` 7-10 KB/s a client; the HUD's picture 5 KB/s; events under 2 KB/s; `ssen` 15-40 KB/s to the sensor operator; inputs 1 KB/s up.
The host's upload with three others aboard: 50-100 KB/s.

## Before and after the migration (2026-11-22, 60da28b5 against a6ced288)

The same torpedo attack (tools/space_steps/compare_pd.mjs: 5 km off the mission ship, her scanners on, a torpedo at her first 3D fix,
F8 open on the mission ship), six runs of each, headless with the GPU:

|                          | before (the page's battle) | after (the server's) |
|--------------------------|----------------------------|----------------------|
| shot down                | 6 / 6                      | 4 / 6                |
| HOSTILE after launch     | 6.81 s                     | 6.58 s               |
| torpedo's end            | 12.12 s                    | 11.97 s              |
| frames a second          | 83.2                       | 80.0                 |
| frame (avg, p95)         | 15.4, 17.5 ms              | 16.4, 18.9 ms        |
| page CPU a frame         | 10.8 ms                    | 11.3 ms              |
| page's radar & fire ctl  | 0.30 ms                    | none                 |

Over twenty seeds in Node (tools/space_sim.mjs --metrics 20, the same battle as the server's): before E 15 shot down, HOSTILE 6.87 s,
gun track 8.92 s, first round 10.79 s; after E 16, 6.87, 8.90, 9.11 (her guns laid on a physical track). The frame's the same within
the runs' spread (the scene's rendering, 5.8 against 6.3 ms, is most of the difference: the GPU's): the page gave up its radars
(radar.js 6.5% of its busy time to 1.9%, what's left the drawing's dirOf) and took on the helm's prediction (its shadow, 0.03 ms a
step). The ground game's simulation is untouched: tools/check_sim_golden.mjs fails the same way on both (its golden's stale).

## Performance (2026-11-22, a6ced288)

Profiles through the attack (tools/space_steps/profile_both.mjs, F8 shut): the page's thread 66% busy (three.js and the browser
~69% of that, js/spaceui.ts update 8.5%, rig.js 4.6%, space.js 3.7%, radar.js 1.9%), frames 12.2 ms avg (11.9 before); the server
worker 6% busy (1% before: it ran only the people and the AI), its battle 0.84 ms a step on average, 1.8 ms at most (the whole worker
step 1.1 ms). Of the worker's busy time the radars are 62.7%: scanStep 18.5%, blocked 9.3%, stepIn 3.0%, cfar 2.5%, the noise's
mulberry32 (mul32, rnd) 3.1%, angOf / dirOf 3.4%, the scheduler and fusion (plan, schedule, fuse) ~4%; packing the pictures (zpack,
SuiteView.pack) ~4%. In Node (tools/space_profile.mjs, the approach scenario 90 s: 28.6x real time on one thread): radar.js 71.7%
(scanStep 25.1%, blocked 12.8%, cfar 4.1%, look 2.9%, stepIn 2.2%, eig3 1.6%, angOf 1.6%), spacesim.js 9.6% (rockOn 5.0%: rounds
against the rocks), three's vector maths 9.3%.

Bandwidth (tools/space_steps/wire_sizes.mjs, flying with her scanners on): her radar picture 11 KB/s to everyone (deflated; 88 as
JSON), the snapshot 2.4 KB/s, the pilot's acks 6.3 KB/s, the pilot's steps 4.3 KB/s up; F8's, while it's open, 12 + 132 KB/s.

Compression (2026-11-23; tools/space_steps/snap_wire.mjs: a joined player aboard a boarding mission). The reliable connection is deflated
each way, every message against the last 32 KB sent on it as its dictionary (js/net.ts zSend, zIn; fflate from jsDelivr, preloaded with the page; each side says it can with {t:'zhi'}): host to player 4.2-5.7 KB/s of JSON sent as 0.7-1.2, player to host 13.5-15
as 0.25. The ground snapshot (was {t:'snap'} JSON on the reliable connection to everyone, 59 KB/s) goes to each remote player on the
fast channel, stream 6, as what's changed since the last one they've said they have (js/snapdelta.ts; js/server.ts sendSnap, 'sack';
js/game.ts puts it back): 4-8 KB/s, every one put back exactly the JSON the host's own page had (152/152), and with a fifth of the fast
channel's packets lost still exact (115/115; a lost one only means the next is against an older base). A joined player's download
all told: ~80 KB/s -> ~16-18 KB/s (radar picture 6-7, the space snapshot 2.5, the ground snapshot 4-8, the rest ~1).

## WebAssembly candidates

From the profiles above (the worker's and Node's: that's where the battle runs now; the page draws):

1. The scanners' map and CFAR (scanStep, stepIn, cfar, look, with their noise: mul32 / rnd): ~30% of the battle's step in both
   profiles. Flat arrays and tight loops; experiment/radar-wasm moved them and measured a step 0.48 -> 0.26 ms. Its mulberry32 and
   Radar.seed API shape and its record-and-replay parity harness (tools/radar_parity_steps.mjs, 4e67887e) are reusable.
2. Occlusion (blocked; rockOn for rounds, the same test): 13-18%, growing with rocks times targets; a grid of the rocks near her
   would cut it before any WebAssembly.
3. Beam geometry (dirOf, angOf, azOf): 3-5%, best folded into its callers (1) rather than a call of its own.
4. three's vector maths in the hot loops (applyQuaternion, length, copy: ~9% in Node): goes with whichever of 1-2 moves.

The case is strongest in the worker and Node (several suites, many battles at once); the page no longer steps any of it.
