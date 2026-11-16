'use strict';
// The tone roll-off's shader code, on its own so that js/viewmodel.ts (which builds a shader from it as it loads) and js/render.ts (which
// imports the viewmodel's side of the game) can both have it without one waiting on the other. It is the shoulder of Khronos' PBR Neutral, on
// linear light: a channel's peak over the knee (0.76) eased toward 1, the colour scaled with it, and toward white by how much was taken off
// (desaturation 0.15). (Not its toe: taking the same off every channel near black saturates the dark, and most of a level is dark: a dim
// brown wall went orange.) It is R.TONE, too (js/render.ts), which the page's other shaders read.
export const TONE = 'vec3 bpTone( vec3 c ) { float m = max( c.r, max( c.g, c.b ) ); const float k = 0.76, d = 0.24; if ( m < k ) return c; float f = 1.0 - d * d / ( m + d - k ); c *= f / m; return mix( c, vec3( f ), 1.0 - 1.0 / ( 0.15 * ( m - f ) + 1.0 ) ); }';
