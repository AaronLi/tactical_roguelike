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
