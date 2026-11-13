// Prints a generated ship's deck plans (js/shipgen.ts) as text:
//   node tools/ship_dump.mjs [transport|small|medium|large|capital] [seed] [level] [obj] [other class]
import { loadLevel } from './level_env.mjs';
const { G } = loadLevel();
const size = process.argv[2] || 'small', seed = +(process.argv[3] || 7), level = +(process.argv[4] || 2), other = process.argv[6] || null;
const t0 = performance.now();
const map = G.Level.generate(seed, level, G.SpaceData.TH0, false, { size, obj: process.argv[5] || 'artifact', other, wing: process.argv.includes('--wing') });
const ms = performance.now() - t0, sp = map.sp, TS = G.Level.TS, floors = map.floors || [map];
floors.forEach((fm, f) => {
  const { W, H, t } = fm, ch = new Array(W * H);
  for (let i = 0; i < W * H; i++) ch[i] = t[i] === 5 ? (fm.out[i] ? ' ' : ':') : t[i] === 1 ? '#' : t[i] === 3 ? '+' : t[i] === 2 ? 'o' : t[i] === 4 ? 'x' : t[i] === 7 || t[i] === 6 ? '/' : '.';
  for (const w of map.windows) if ((w.fl || 0) === f && w.cells) for (const c of w.cells) ch[c] = sp.hullWin[w.id] != null ? '=' : '-';
  for (const d of map.doors) if ((d.fl || 0) === f && sp.locks[d.id]) for (const c of d.cells || [d.i]) ch[c] = 'L';
  const put = (p, c) => { if (p && Math.abs(p.y - (fm.fy || 0)) < 1) ch[Math.floor(p.z / TS) * W + Math.floor(p.x / TS)] = c; };
  put(sp.console, 'C'); put(sp.artifact, 'A'); for (const p of sp.pods) put(p, 'P'); for (const p of sp.salvage) put(p, 'S');
  if (f === 0) for (const s of G.ShipGen.sites(map)) { const c = s.c + s.nx + s.nz * W; if (ch[c] === ' ') ch[c] = '~'; }
  map.rooms.forEach((rm, i) => { if ((rm.fl || 0) !== f) return; const s = (sp.roles[i] || '?').slice(0, 3).toUpperCase(); for (let k = 0; k < s.length; k++) { const j = rm.z * W + rm.x + k; if (ch[j] === '.') ch[j] = s[k]; } });
  let z0 = H, z1 = 0; for (let i = 0; i < W * H; i++) if (t[i] !== 5 || !fm.out[i]) { z0 = Math.min(z0, (i / W) | 0); z1 = Math.max(z1, (i / W) | 0); }
  console.log(`--- deck ${f}`);
  for (let z = z0 - 1; z <= z1 + 1; z++) console.log(ch.slice(z * W, (z + 1) * W).join('').replace(/\s+$/, ''));
});
console.log(`${size}${other ? ' + ' + other : ''} seed ${seed}: ${map.W * TS | 0} x ${map.H * TS | 0} m map, ${floors.length} deck(s), hull ${(sp.hull.x1 - sp.hull.x0) | 0} x ${(sp.hull.z1 - sp.hull.z0) | 0} m, ${map.rooms.length} rooms, ${map.doors.length} doors, ${map.windows.length} windows (${Object.keys(sp.hullWin).length} in the hull), ${map.enemySpots.length} spots, ${G.ShipGen.sites(map).length} breach sites (~), stairs ${(map.stairs || []).length}, ${ms | 0} ms`);
console.log('roles:', sp.roles.map((r, i) => r + (sp.hullOf[i] ? '*' : '') + (map.rooms[i].fl ? '^' : '')).join(' '), '| locks:', JSON.stringify(sp.locks), '| cards:', JSON.stringify(sp.cardRooms));
