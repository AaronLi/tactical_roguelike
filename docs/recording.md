# Recording the officers' play

For teaching the suspects' AI how people play: the host can record every officer's state and actions, one file a level.
`js/recorder.ts` (`G.Recorder`) does it, inside the host's simulation (the server thread: `docs/threads.md`).

## Turning it on

Off unless the page that hosts asks for it:

- `?rec` in the URL (`http://localhost:8080/?rec`, or with the debug start: `?play&rec&mute`), or
- `localStorage.rec = '1'` in the devtools console (stays on for that browser; `localStorage.removeItem('rec')` turns it off).

It's read when a session starts (hosting or solo: `js/serverlink.ts` puts `rec` in the `init` message). **Host only**: the
host sees every officer's state and messages, its own player's and the remote players' alike, so the host's recording has
the whole squad. A player who joins records nothing, whatever their URL says.

## Where it goes

When the level ends the recording goes back to the page (`{k:'rec', name, data}` on the control port), which POSTs it to
`/rec?name=…`. `node serve.js` writes that to `recordings/<name>.json` (git-ignored), and only takes it from this machine
(loopback), since it listens on every interface. Served from somewhere without that endpoint (a static host), the page
downloads the file instead.

The name is `<ISO time>_L<level>_<seed>`, e.g. `2026-11-07T18-07-04-139Z_L1_1876360178.json`.

## The file

```js
{
  v: 1,
  seed, level, theme, night,   // G.Level.generate(seed, level, theme, night) builds the same place
  at: '2026-11-07T18:07:04.139Z', rate: 10,
  officers: [{ id, name, gun }],          // everyone who was there (gun: their weapon's code when first seen)
  map: { W, H, TS, floors },              // the tile grid's size, the tile size (m), how many floors
  frames: [{ t, o: [...], s: [...] }],    // RATE a second
  events: [{ t, by, m }],                 // every message an officer sent, as sent
  end: 'shop' | 'gameover' | 'lobby' | 'route' | 'next' | 'stop',
  dur,                                    // seconds from the first frame to the last
}
```

- `t` is the level's clock (`G.Server.clock`, seconds).
- `o`: each officer's last state, `{id, ...}` with the keys of `js/player.ts` `state()` (see `G.Recorder.KEYS`): `p` [x, y, z],
  `yw`/`pt` look, `cr` crouched, `pr` prone, `ln` lean, `w` gun, `ad` aiming, `sd` steadying, `lr` low ready, `rl` reload
  progress (-1 none), `ld` loaded, `hp`/`mhp`, `ar` armour %, `dn` down, `dd` dead, `hk` held grenade (1 frag, 2 flash, 3 tear
  gas), `act`/`ap` the action under way (its first letter) and its progress, `mv` speed, `sw` weapon away, `mn` in a menu,
  `se` seated, `cl` climbing, `zp` on a zip line, `bp` on a bipod, `tl` weapon lights, `ir` IR illuminator. Their kit,
  wounds and score aren't kept. An officer is missing from the frames until their game's first state arrives.
- `s`: every suspect and civilian: `id`, `type` (`G.ENEMIES` key; civilians also `civ: 1`), `p` [x, y, z], `yaw`, `hp`,
  `state`, `alert`; and when true or nonzero `crouch`, `down`, `leanOut`, `canSee`, `tgt` (the officer they're on).
- `events`: `by` is the officer's id, `m` the message as `G.Server.handle` got it: `shot`, `nade`, `flash`, `useDoor`,
  `kickDoor`, `shout`, `cuff`, `drag`, `hit`, `treat`, `revive`, `secure`, `hole`, `glass`, … Not kept: `st` (in the frames),
  and what's only for drawing (`rfx`, `rpath`, `npath`, `skin`, `skinReq`, `bores`, `eInfo`, `hello`).

A recording starts when the level does and ends when the phase leaves it (the end says why), when another level starts
(`next`), or when the session stops (`stop`). One with no frames isn't saved.

Size: about 0.55 MB a minute solo on a first level with half a dozen suspects and civilians (it grows with the squad and
the head count; it's plain JSON and compresses well).
