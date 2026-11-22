# The space battle on the server

Where the space battle runs, and the plan to move it. Written 2026-11-21 at 60da28b5.

## Now

Every player's page runs the whole battle itself, in js/space.ts `update` (fixed 1/60 s steps from an accumulator): the zone,
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

### C2: the pilot's inputs, predicted

The pilot's page sends inputs; it predicts her flight with the same step, and replays its inputs from the server's state when a
snapshot arrives. Discrete events (the breach, landing, launch, warp, FTL) are the server's. Others aboard draw her interpolated a
little behind.

### E (maybe): the battle in the zone's frame

Inertial: no frame turning, no rebasing when the squad boards another zone ship.

## Bandwidth (rough, binary)

`sss` 7-10 KB/s a client; the HUD's picture 5 KB/s; events under 2 KB/s; `ssen` 15-40 KB/s to the sensor operator; inputs 1 KB/s up.
The host's upload with three others aboard: 50-100 KB/s.

## Performance (2026-11-21, a 5 km torpedo attack, headless with the GPU, the page at ~97 fps)

Per frame: rendering the scene 2.3 ms, the space HUD 0.46 ms, rigs 0.36 ms, radar and fire control 0.25 ms, the hologram and sensor
station 0.17 ms, the rest of space ~0.2 ms. CPU profile of the page's thread: browser internals and three.js ~79%,
js/spaceui.ts 7% (its `update`, 6%, the most expensive single function of the game's own), js/radar.ts 5.8% (`scanStep` 1.6%,
`dirOf` 1.2%, `blocked` 0.7%), js/space.ts 2.6%.

The battle's simulation is ~0.3-0.5 ms a step, most of it radar: in the worker that's off the page's frame, and in Node one battle
should step 30-50 times faster than real time before any optimisation.

## WebAssembly candidates

Watched as the battle module is extracted (keep its hot data in flat arrays):

1. The scanners' map and its CFAR (`scanStep`, `cfar`): flat arrays, tight loops; experiment/radar-wasm moved them and measured a
   step 0.48 -> 0.26 ms. Its mulberry32 and `Radar.seed` API shape and its record-and-replay parity harness
   (tools/radar_parity_steps.mjs, 4e67887e) are reusable; its fusion-pairing loop is obsolete (the belief model replaced it).
2. Occlusion (`blocked`): ray tests against the rocks, growing with rocks times targets.
3. Beam geometry (`dirOf`, `angOf`): better folded into its callers than a call of its own.

The case is strongest in the worker and in Node (several suites, many battles at once), not the page.
