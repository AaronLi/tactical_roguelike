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
| `js/serverworker.ts` | worker | The worker's entry: loads three.js (`js/threeboot.ts`, as the page does) and then imports one file, `js/serverhost.ts` (a module worker, `js/serverlink.ts`): the simulation's files are its imports, run in the order the module graph gives, then it hands its control port to `G.ServerHost`. |
| `js/serverhost.ts` | worker (or page) | `G.ServerHost`: feeds the simulation what comes in on its two ports, ticks it, carries its word out (it wires `SvNet`, the simulation's only way out). |
| `js/serverlink.ts` | page | `G.ServerLink`: starts the worker as the page loads, opens a session when you host (`start`) and closes it (`stop`), sends your game's messages to it (`toServer`), relays the remote players' both ways. |
| `js/sim.ts` | both | `G.Sim`: pure reckonings both sides need (a grenade's flight, a round's arc, a blast's reach and a thermobaric's dose, a weapon as built, an officer's look cleaned, the cabinet and locker grids, the veil's time). They used to live in files that draw; those hand on to it. |

The worker loads `util, medical, materials, data, spacedata, shipgen, callsigns, arsenal, parts, gear, sim, world, ballistics, leveldesc, level,
furnspec, furniture, homes, residents, scars, damage, stickers, route, shop, recorder, server, spaceserver, serverhost` (what `js/serverhost.ts`, its entry
file, imports: there is no list of them any more): the data, the rules of guns, gear and medicine, the level as it's generated, collided with and seen
through, the shop's stock reckoning, the recorder. Nothing that draws or plays loads there (no renderer, rigs, views, viewmodel, HUD,
icons, sound, PeerJS); the furniture's solids come from its pieces (`js/furniture.ts solids`), and what the pieces look
like (`js/furnspec.ts`, [furniture-data.md](furniture-data.md)) is only described where it's drawn. three.js still loads, because a
few of those files reach for it as they load (js/util.ts, js/damage.ts) and the simulation works holes, blasts and arcs in its
vectors; generating a level doesn't touch it. The level is its description (docs/level-data.md: js/leveldesc.ts), the same
object here and on every screen, and the world the simulation collides with is built from that description's solids alone
(G.World.fromDesc).

## Ports and messages

- **cli**, the host's own player's port, one per session: exactly the messages any player sends and gets over the
  network, structured-cloned. (Something that can't be cloned goes as JSON, as the network would send it, with a warning.)
- **ctl**, the control port, for as long as the worker runs. Page to simulation: `{k:'init', id, cli}` (a session, your
  player's id and its port), `{k:'stop'}`, `{k:'in', from, m}` (a remote player's message), `{k:'join'|'leave', id}`,
  `{k:'stickers', names}`, `{k:'digest'}`, `{k:'stat'}`. Back: `{k:'ready'}`, `{k:'on'}`, `{k:'bc', m, x}` (to every remote
  player but `x`), `{k:'to', id, m}`, `{k:'fast', to, ch, buf}` (a snapshot, below), the answers, and `{k:'prof'}` once a second
  (the ticks' time).

## The fast channel (snapshots)

For what the simulation streams many times a second and is stale once a newer one is out (the space battle's core snapshot to
everyone, a sensor picture to one player: [space-server.md](space-server.md), C1), there's a second way out beside the messages:
`G.ServerHost.fast(to, buf, ch)` (or `SvNet.fast` in js/server.ts), bytes (an ArrayBuffer, written with `js/snapcodec.ts`'s
SnapWriter) to one player's id or everyone (`to` null), on stream `ch` (0-255, each its own newest). The buffer is transferred to
the page on the ctl port (`{k:'fast'}`); `js/serverlink.ts` hands the host's own player's copy straight to `G.Net.onFast` (no
PeerJS), and `G.Net.fastOut` sends the remote players theirs on their fast channel (`js/netfast.ts`); on every page,
`G.Net.onFast((buf, ch) => ...)` gets them.

The fast channel is a second data channel on each PeerJS connection's own RTCPeerConnection, made on both sides with a fixed id
(`negotiated: true, id: 9, ordered: false, maxRetransmits: 0`): no signalling, the same path as the reliable one, and truly
unreliable. (PeerJS 1.5's own `reliable: false` is only unordered, still retransmitted, and every DataConnection is a separate
RTCPeerConnection.) Messages over 16 KB are cut into pieces (16000 bytes a packet with its 10-byte header) and put together again;
a message is handed on only whole and only if it's newer than the last of its stream (a lost piece loses the message; a newer
message's piece gives up an older one being put together; nothing is sent again). Sending, a message that finds the channel
backed up (256 KB waiting) waits on its own, replaced by its stream's newer ones, until the channel drains. Each side says hello on
the channel until the other answers; until then, or if it never does (an older game), messages go over the reliable JSON
connection as base64 (`{t:'fastb', c, s, b}`, in pieces of 11000 bytes `{..., i, n}`: PeerJS 1.5 refuses a JSON message of 16300
bytes or more, with an error that drops the connection). Tests: `npm run test:snapcodec` (the codec, the reassembly by hand), and
in a browser `node tools/space_shot.mjs "mute" tools/netfast_steps.mjs --port 8162 --nowait --gpu` (tools/netfast_test.html: two
peers in one page, joined directly and through PeerJS; then the game hosting and a second game in an iframe joined to it, the
simulation on the page and in its worker).

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
