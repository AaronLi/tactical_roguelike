'use strict';
// What the replay asks of the page: the highlights (the recording, and the export that draws it), the renderer, the rigs, the viewmodel's animation
// and the level's view reach for the game's state (the game, the player, the net), for the page's screens (the views, the HUD, the hangar, the shop,
// the range, the zip writer, the icons) and for sound, loot and casings (audio, footsteps, gun audio, bolts, casings, loot, the shot log). The
// page's files set their field as they load (next to their `G.X = X`; `Shop` is set by js/shopui.ts, as js/shop.ts is the server thread's too), and the readers (js/highlights.ts, render.ts, rig.ts, vmanim.ts,
// levelview.ts) read them here. The export worker (js/exportworker.ts) loads the readers and none of those, so there every field stays null,
// except `Game` and `Net`, which it sets to its two stand-ins; the reads, which are guarded or reached only on the page, find what they found
// through G.Game, G.Audio ... (nothing, or the stand-in). (This file imports the others only for their types: nothing of them runs, so the
// export worker's modules stay as they were.)
import type { Audio } from './audio.js';
import type { Bolts } from './bolts.js';
import type { Casings } from './casings.js';
import type { Footsteps } from './footsteps.js';
import type { Game } from './game.js';
import type { GunAudio } from './gunaudio.js';
import type { Hangar } from './hangar.js';
import type { HUD } from './hud.js';
import type { Icons } from './icons.js';
import type { Loot } from './loot.js';
import type { Me } from './player.js';
import type { Net } from './net.js';
import type { Range } from './range.js';
import type { Shop } from './shop.js';
import type { ShotLog } from './shotlog.js';
import type { Views } from './views.js';
import type { Zip } from './zip.js';
export const ReplayEnv: {
  Game: typeof Game | null; Me: typeof Me | null; Net: typeof Net | null; Audio: typeof Audio | null; Views: typeof Views | null; ShotLog: typeof ShotLog | null;
  Footsteps: typeof Footsteps | null; Icons: typeof Icons | null; HUD: typeof HUD | null; Zip: typeof Zip | null; Hangar: typeof Hangar | null;
  Range: typeof Range | null; Casings: typeof Casings | null; Loot: typeof Loot | null; Shop: typeof Shop | null; GunAudio: typeof GunAudio | null;
  Bolts: typeof Bolts | null;
} = { Game: null, Me: null, Net: null, Audio: null, Views: null, ShotLog: null, Footsteps: null, Icons: null, HUD: null, Zip: null, Hangar: null,
  Range: null, Casings: null, Loot: null, Shop: null, GunAudio: null, Bolts: null };
