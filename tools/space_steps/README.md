# Space step scripts

Steps for tools/space_shot.mjs (a headless Chromium driving the game: `node serve.js` running, then
`node tools/space_shot.mjs "<query>" tools/space_steps/<script>.mjs --port 8151 --gpu`). See docs/space-server.md.

| script | query | what it checks |
|---|---|---|
| torpedo_defence.mjs | `mute&board=small`, env `PD_R=5000` | the mission ship's response to a torpedo: when it's in her picture, HOSTILE, a dish given it, locked, a gun-quality track, first burst, shot down or not (TIMELINE ...; pipe through `python tools/space_steps/parse_torpedo.py` for one line) |
| tracking.mjs | `mute&board=small&seed=3` | four tracks kept by the scheduler: each one's looks a second, misses, quality |
| beliefs.mjs | `mute&board=small&seed=3` | beliefs (slabs, placed, 3D fixes), ghosts, error against the truth, wanted tracks' fixes |
| pacing.mjs, pacing_slow_frames.mjs | `mute&board=small&seed=3` | simulation time against wall time (the second with 120 ms frames forced) |
| smoothness.mjs | `mute&board=small&seed=3` | the drawn world's movement frame to frame at speed (the steps blended) |
| determinism.mjs | `mute&board=small&seed=3` | a fingerprint at a fixed step: two runs to compare |
| perf.mjs | `mute&board=small`, env `PD_R=5000` | the profiler's sections and a CPU profile through a torpedo attack |
| server_battle.mjs | `mute&board=small&seed=3`, env `PD_R=5000` | the server's battle (js/svbattle.ts, phase C1) beside the page's: both pictures (contacts, beliefs, assessments, tracks, fire control, guns), a torpedo's timeline on each side, the sss / sev messages' rates and sizes, the worker's step cost (G.ServerLink.sworld()) |
| shapes_check.mjs | `mute&board=small&seed=3` (and other boards) | the shapes from data (js/hullshape.ts, js/rcstris.ts, assets/models/ships/space.json) against the live meshes: hull triangles, guns, mounts, radar tables, breach sites, stand-ins, the squad's ship; then the Node check on the same map (also on its own: `node tools/shapes_node_check.mjs`) |
| hull_server.mjs | `mute&board=small&seed=3` | her hull kept by the server (C1): page and server agree, 30 knocked off, then a 1000 knock and the server's emergency jump home |
| turret_server.mjs | `mute&board=small&seed=3` | her turrets' rounds hit on the server: three rounds at a hull gun from 800 m, its hp on server and page |
| zone_real.mjs | `mute&board=small&seed=3` | a zone ship's real hull on the server inside 5 km: her return and size, server against page |
| fly_fp.mjs | `mute&board=small&seed=3` | her flight's fingerprint: a scripted input from a set start, her pose and way at fixed steps (compare two runs, or before and after a change) |
| fly_server.mjs | `mute&board=small&seed=3` | her flight on the server (C2): the server's against the page's, acks, prediction errors, corrections (one forced) |
