// Prints a generated ship's deck plan (js/shipgen.ts) as text: node tools/ship_dump.mjs [size] [seed] [level]
import { loadLevel } from './level_env.mjs';
const { G } = loadLevel();
const size = process.argv[2] || 'small', seed = +(process.argv[3] || 7), level = +(process.argv[4] || 2);
const t0 = performance.now();
const map = G.Level.generate(seed, level, G.SpaceData.TH0, false, { size, obj: process.argv[5] || 'artifact' });
const ms = performance.now() - t0, { W, H, t } = map, sp = map.sp, TS = G.Level.TS;
const ch = new Array(W * H);
for (let i = 0; i < W * H; i++) ch[i] = t[i] === 5 ? ' ' : t[i] === 1 ? '#' : t[i] === 3 ? '+' : t[i] === 2 ? 'o' : t[i] === 4 ? 'x' : '.';
for (const w of map.windows) for (const c of w.cells) ch[c] = sp.hullWin[w.id] != null ? '=' : '-';
for (const d of map.doors) if (sp.locks[d.id]) for (const c of d.cells || [d.i]) ch[c] = sp.locks[d.id] === 'breach' ? 'B' : 'L';
const put = (p, c) => { if (p) ch[Math.floor(p.z / TS) * W + Math.floor(p.x / TS)] = c; };
put(sp.console, 'C'); put(sp.artifact, 'A'); for (const p of sp.pods) put(p, 'P');
map.rooms.forEach((rm, i) => { const s = (sp.roles[i] || '?').slice(0, 3).toUpperCase(); for (let k = 0; k < s.length; k++) { const j = rm.z * W + rm.x + k; if (ch[j] === '.') ch[j] = s[k]; } });
let z0 = H, z1 = 0; for (let i = 0; i < W * H; i++) if (t[i] !== 5) { z0 = Math.min(z0, (i / W) | 0); z1 = Math.max(z1, (i / W) | 0); }
for (let z = z0; z <= z1 + 2; z++) console.log(ch.slice(z * W, (z + 1) * W).join('').replace(/\s+$/, ''));
console.log(`${size} seed ${seed}: ${W * TS | 0} x ${H * TS | 0} m map, hull ${(sp.hull.x1 - sp.hull.x0) | 0} x ${(sp.hull.z1 - sp.hull.z0) | 0} m, ${map.rooms.length} rooms, ${map.doors.length} doors, ${map.windows.length} windows (${Object.keys(sp.hullWin).length} in the hull), ${map.enemySpots.length} spots, case ${map.case ? 'yes' : 'no'}, ${ms | 0} ms`);
console.log('roles:', sp.roles.join(' '), '| locks:', JSON.stringify(sp.locks), '| cards:', JSON.stringify(sp.cardRooms), '| breach', JSON.stringify(sp.breach));
