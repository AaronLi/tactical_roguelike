# Threads: the host's simulation and the screen

The host's simulation (`G.Server`, `js/server.ts`: the lobby and phases, the suspects' and civilians' AI, doors,
arrests, damage, objectives, loot, the shop's stock and the team locker) runs in a thread of its own, a Web Worker. The
page is a player like any other: it draws, plays sound and sends what you do. Hosting or playing solo, your game talks
to the simulation the way a remote player's does, with the same messages; it reads none of the simulation's state.

```
 page (main thread)                                         server thread (worker)
 ------------------                                         ----------------------
 js/game.ts  onMsg  <--- cli port (this session) ---+       js/serverhost.ts
 G.Net.toHost  -------------------------------------+-----> G.Server.handle(m, host id)
                                                            G.Server.update(dt), on its own timer
 js/serverlink.ts  <--- ctl port --------------------------  {k:'bc'|'to'}: for the remote players
 G.Net (PeerJS) relay / relayTo  --> remote players
 remote players --> G.Net.onServer --> ctl {k:'in'} -------> G.Server.handle(m, their id)
```

## The pieces

| File | Where it runs | What it does |
| --- | --- | --- |
| `js/serverworker.ts` | worker | The worker's entry: loads three.js (`js/threeboot.ts`, as the page does) and the simulation's scripts with `importScripts`, then hands its control port to `G.ServerHost`. |
| `js/serverhost.ts` | worker (or page) | `G.ServerHost`: feeds the simulation what comes in on its two ports, ticks it, carries its word out (it wires `SvNet`, the simulation's only way out). |
| `js/serverlink.ts` | page | `G.ServerLink`: starts the worker as the page loads, opens a session when you host (`start`) and closes it (`stop`), sends your game's messages to it (`toServer`), relays the remote players' both ways. |
| `js/sim.ts` | both | `G.Sim`: pure reckonings both sides need (a grenade's flight, a round's arc, a blast's reach and a thermobaric's dose, a weapon as built, an officer's look cleaned, the cabinet and locker grids, the veil's time). They used to live in files that draw; those hand on to it. |

The worker loads `util, data, callsigns, arsenal, parts, gear, medical, sim, materials, ballistics, level, leveldesc, world,
furniture, homes, residents, scars, damage, stickers, route, shop, server, serverhost` (`SERVER_SCRIPTS` in
`js/serverworker.ts`): the data, the rules of guns, gear and medicine, the level as it's generated, collided with and seen
through, the shop's stock reckoning. Nothing that draws or plays loads there (no renderer, rigs, views, viewmodel, HUD,
icons, sound, PeerJS). three.js still loads, because a few of those files reach for it as they load (js/util.ts,
js/damage.ts) and the simulation works holes, blasts and arcs in its vectors; generating a level doesn't touch it. The level
is its description (docs/level-data.md: js/leveldesc.ts), the same object here and on every screen, and the world the
simulation collides with is built from that description's solids alone (G.World.fromDesc).

## Ports and messages

- **cli**, the host's own player's port, one per session: exactly the messages any player sends and gets over the
  network, structured-cloned. (Something that can't be cloned goes as JSON, as the network would send it, with a warning.)
- **ctl**, the control port, for as long as the worker runs. Page to simulation: `{k:'init', id, cli}` (a session, your
  player's id and its port), `{k:'stop'}`, `{k:'in', from, m}` (a remote player's message), `{k:'join'|'leave', id}`,
  `{k:'stickers', names}`, `{k:'digest'}`, `{k:'stat'}`. Back: `{k:'ready'}`, `{k:'on'}`, `{k:'bc', m, x}` (to every remote
  player but `x`), `{k:'to', id, m}`, the answers, and `{k:'prof'}` once a second (the ticks' time).

The wire between a host and the players who join it hasn't changed: an older client can join a host on this code. A few
messages were added, all ignored by a game that doesn't know them; the simulation takes the ones marked *host* only
from the host's own player:

| Message | Way | What |
| --- | --- | --- |
| `startRun` {dbg?} | to the host (*host*) | The lobby's Deploy (and the debug start's, `dbg`: the first level's theme, number, leader, stronghold, night). |
| `toLobby` | to the host (*host*) | The game over table's New Run. |
| `toShop`, `noFoes` | to the host (*host*) | The debug start's `?hangar` and `?nofoes` (and the demo reel's). |
| `eboom` {p} | to the host (*host*) | A suspect's grenade went off on the host's screen, here. |
| `bores` {a} | to the host (*host*) | Each suspect's gun as the host's screen last drew it (muzzle, bore), for whether it's on target before they fire. |
| `eInfo` {id} | both (*host*) | The F9 readout's look at a suspect's full record. |
| `eround` | to the host's player | A suspect's shot: every pellet's direction, to be flown on the host's screen. |
| `wc` on `phase` and `welcome` | to everyone | The weapon case's gun, so the screens have its model ready. |

## What stays on the host's screen

Some of the simulation's work is the host's screen's by nature, and still is: the suspects' rounds are flown there
(`eround`, `js/player.ts enemyRounds`), against everyone's bodies as they stand on it, as they were when the simulation
ran in the page; the suspects' grenades fly there and go off there (`eboom`); the host's screen tells the simulation where
each suspect's gun points (`bores`). Your own rounds, hits, wounds and grenades are worked out on your screen and told to
the host, as every player's are.

## Ticking

The simulation ticks on its own timer, `G.ServerHost.TICK_MS` (1000/60 ms, as fast as the frames used to come), with dt
the time since the last tick, at most 0.1 s, as it always had. It doesn't wait for the page to draw: a hitch on the page,
or a tab in the background (where the page's timers are slowed to once a second or less), no longer slows the level.

## The fallback

If a worker can't be had (no `Worker`, or it won't load: its scripts failing, three.js from the CDN not reachable in 30
s), or with `?serverthread=0` in the URL, the same `G.ServerHost` runs on the page, on ports within the page, ticking on a
page timer (`G.ServerLink.mode` says which: `'worker'` or `'main'`). The page loads `js/server.ts` and `js/serverhost.ts`
for that.

## Checking it

- `await G.ServerLink.digest()` (in the console, hosting): the simulation's level description against yours (docs/level-data.md):
  `same` (the whole of them equal as JSON) and the parts whose fingerprints differ. What your screen adds after (the
  helicopter's solids) is in its world, not in the description.
- `await G.ServerLink.stat()`: the simulation's clock, ticks, phase, level, how many suspects and players it has.
- The profiler's file (`js/profiler.ts`) has `context.serverThread`: where it runs and its last second of ticks. With the
  simulation in its worker, the page's `host:` lines are empty (it isn't on the page).
