// A cruiser's halls two decks high (js/shipgen.ts HALLS): how much of each hall's floor can be seen from one place.
//   node tools/ship_halls.mjs [seeds, default 12] [--hall=bay|grove|works|mall]
// For every hall, from each place someone can stand on its floor (every other cell, at a standing eye's height) and on its
// gallery: the share of the hall's floor in sight (a chest's height over each cell). Prints the most seen from anywhere on
// the floor, the average, and the same from the gallery. The floor's most should stay well short of all of it.
import { loadLevel } from './level_env.mjs';
const { G } = await loadLevel();
const L = G.Level, TS = L.TS, n = +(process.argv[2] || 12) || 12, only = (process.argv.find((q) => q.startsWith('--hall=')) || '').slice(7);
const kinds = only ? [only] : G.SpaceData.HALL_KINDS;
let worst = 0;
for (const kind of kinds) for (let seed = 1; seed <= n; seed++) {
  const map = L.generate(seed * 7919, 3, G.SpaceData.TH0 + 2, false, { size: 'large', obj: 'artifact', hall: kind }), f0 = map.floors[0], f1 = map.floors[1], W = f0.W;
  map.rooms.forEach((rm, i) => {
    if ((rm.fl || 0) !== 0 || !G.ShipGen.HALLS[map.sp.roles[i]]) return;
    const cells = [], up = [];
    for (let z = rm.z; z < rm.z + rm.h; z++) for (let x = rm.x; x < rm.x + rm.w; x++) { const k = z * W + x; if (f0.t[k] === 0 && !f0.props.has(k)) cells.push([x, z]); if (f1.t[k] === 0) up.push([x, z]); }
    const share = (from, y) => {
      let most = 0, sum = 0, cnt = 0;
      for (let a = 0; a < from.length; a += 2) {
        const [x, z] = from[a]; let seen = 0;
        for (const [tx, tz] of cells) if (L.see(map, (x + 0.5) * TS, y, (z + 0.5) * TS, (tx + 0.5) * TS, 1.2, (tz + 0.5) * TS) > 0) seen++;
        const s = seen / cells.length; most = Math.max(most, s); sum += s; cnt++;
      }
      return [most, sum / Math.max(1, cnt)];
    };
    const [fm, fa] = share(cells, 1.6), [gm, ga] = share(up, f1.fy + 1.6);
    worst = Math.max(worst, fm);
    console.log(`${kind.padEnd(5)} seed ${String(seed * 7919).padStart(6)}  ${(rm.w * TS).toFixed(0)} x ${(rm.h * TS).toFixed(0)} m  floor: most ${(fm * 100).toFixed(0)}%, average ${(fa * 100).toFixed(0)}%   gallery: most ${(gm * 100).toFixed(0)}%, average ${(ga * 100).toFixed(0)}%   stairs ${map.stairs.length}, rooms ${map.rooms.length}`);
  });
}
console.log(`the most of any hall's floor seen from one place on it: ${(worst * 100).toFixed(0)}%`);
