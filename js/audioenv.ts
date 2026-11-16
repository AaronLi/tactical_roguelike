'use strict';
// What sound asks of the game: the renderer (the camera), the game (the level's map, the phase), the squad's ship (js/space.ts), the player (where
// they are) and the casings (what a surface is). The files that are those set their field as they load (js/render.ts, game.ts, space.ts,
// player.ts, casings.ts), and the sound files (audio, acoustics, ambience, footsteps, gunaudio) read them here. ambience.html loads the sound
// files and none of those, so there every field stays null, and the reads, which are guarded, find nothing: as they did through G.R, G.Game ...
// (This file imports the others only for their types: nothing of them runs.)
import type { Casings } from './casings.js';
import type { Game } from './game.js';
import type { Me } from './player.js';
import type { R } from './render.js';
import type { Space } from './space.js';
export const AudioEnv: { R: typeof R | null; Game: typeof Game | null; Space: typeof Space | null; Me: typeof Me | null; Casings: typeof Casings | null } = { R: null, Game: null, Space: null, Me: null, Casings: null };
