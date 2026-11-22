'use strict';
// The base's asteroid's surface as a function, nothing drawn (docs/space-server.md phase B): js/shipmodel.ts asteroid(Wm, Hm,
// seed).height, which doesn't depend on the seed (the seed only lumps the rock's far side and tints it). Wm, Hm: the level's size
// in metres; the hollow is flat for 70 m round it, then walls 90 m high, then the rock's own curve (radius 1500 m).
// Keep in step with js/shipmodel.ts asteroid: tools/shapes_node_check.mjs compares them.
import { U as G_U } from './util.js';

export const ASTEROID_R = 1500;
/** the surface's height at (x, z), the level's frame */
export function asteroidHeight(Wm: number, Hm: number, x: number, z: number) {
  const R = ASTEROID_R, cx = Wm / 2, cz = Hm / 2, U = G_U;
  const dx = Math.max(0, Math.abs(x - cx) - Wm / 2), dz = Math.max(0, Math.abs(z - cz) - Hm / 2), d = Math.hypot(dx, dz), hx = Math.hypot(x - cx, z - cz);
  const sph = hx < R ? Math.sqrt(R * R - hx * hx) - R : -R, u = U.clamp((d - 70) / 350, 0, 1), k = U.smooth(70, 420, d);
  return -0.35 * (1 - k) + sph * k + Math.sin(u * Math.PI) * 90 + Math.sin(x * 0.021 + 1.3) * Math.cos(z * 0.017) * 14 * U.smooth(90, 300, d);
}
/** the same, as asteroid(...).height is: a function of (x, z) for one level's size */
export const asteroidHeightFn = (Wm: number, Hm: number) => (x: number, z: number) => asteroidHeight(Wm, Hm, x, z);
