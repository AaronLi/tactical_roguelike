# Space step scripts

Steps for tools/space_shot.mjs (a headless Chromium driving the game: `node serve.js` running, then
`node tools/space_shot.mjs "<query>" tools/space_steps/<script>.mjs --port 8151 --gpu`). See docs/space-server.md.

| script | query | what it checks |
|---|---|---|
| torpedo_defence.mjs | `mute&board=small`, env `PD_R=5000` | the mission ship's response to a torpedo: when it's in her picture, HOSTILE, a dish given it, locked, a gun-quality track, first burst, shot down or not (TIMELINE ...; pipe through `python tools/space_steps/parse_torpedo.py` for one line) |
| pacing.mjs, pacing_slow_frames.mjs | `mute&board=small&seed=3` | simulation time against wall time (the second with 120 ms frames forced) |
| smoothness.mjs | `mute&board=small&seed=3` | the drawn world's movement frame to frame at speed (the steps blended) |
| perf.mjs | `mute&board=small`, env `PD_R=5000` | the profiler's sections and a CPU profile through a torpedo attack |
| server_battle.mjs | `mute&board=small&seed=3`, env `PD_R=5000` | the server's battle (js/svbattle.ts, phase C1) and what the page is shown of it: both pictures (contacts, beliefs, assessments, tracks, guns), a torpedo's timeline on each side, the sss / sev messages' rates and sizes, the worker's step cost (G.ServerLink.sworld()) |
| shapes_check.mjs | `mute&board=small&seed=3` (and other boards) | the shapes from data (js/hullshape.ts, js/rcstris.ts, assets/models/ships/space.json) against the live meshes: hull triangles, guns, mounts, radar tables, breach sites, stand-ins, the squad's ship; then the Node check on the same map (also on its own: `node tools/shapes_node_check.mjs`) |
| hull_server.mjs | `mute&board=small&seed=3` | her hull kept by the server (C1): page and server agree, 30 knocked off, then a 1000 knock and the server's emergency jump home |
| turret_server.mjs | `mute&board=small&seed=3` | her turrets' rounds hit on the server: three rounds at a hull gun from 800 m, its hp on server and page |
| zone_real.mjs | `mute&board=small&seed=3` | a zone ship's real hull on the server inside 5 km: her return and size, server against page |
| fly_fp.mjs | `mute&board=small&seed=3` | her flight's fingerprint: a scripted input from a set start, her pose and way at fixed steps (compare two runs, or before and after a change) |
| fly_server.mjs | `mute&board=small&seed=3` | her flight on the server (C2): the server's against the page's, acks, prediction errors, corrections (one forced) |
| breach_fp.mjs | `mute&board=small&seed=3` | the breach flown from a set start 150 m out (W held): pose and modes every 30 steps, the step and berth she docked at; the server's docking and acks after |
| descent_server.mjs | `mute&assault` | down through the cloud on the server: the stage on page and server, acks, corrections, states |
| tboard_server.mjs | `mute&board=small&seed=3` | coming up with zone ship t1 from 450 m: made the level by the server, carried across, the acks after the arrival |
| helm_geo.mjs | `mute&board=small&seed=3`, `mute&fly`, `mute&assault` | js/helm.ts's places as data against the page's: waypoints, boxes, the ground |


The page runs no battle of its own (it draws the server's: docs/space-server.md), so what it shows is checked here and what the
battle does is the Node runner's (tools/space_sim.mjs, `npm run test:space`: a golden, metrics over seeds).
