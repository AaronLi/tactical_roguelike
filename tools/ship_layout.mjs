// The squad's ships' layouts as the game has them (js/spacedata.ts layout, seats, boxes), written out for the Blender build
// (models/ships/build_ship.py reads them, so the model's decks, stairs, glass and doors are where the game's solids are) and
// for the bake's check of the model against them (tools/bake_ships.mjs). Nothing here is made up: it's the compiled game's.
//   node tools/ship_layout.mjs            write models/ships/<id>.layout.json for every ship
//   node tools/ship_layout.mjs --print    print them instead
import fs from 'node:fs'; import path from 'node:path'; import vm from 'node:vm'; import { fileURLToPath } from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'), DIST = path.join(ROOT, 'dist/js/'), OUT = path.join(ROOT, 'models/ships');

/** js/spacedata.ts, compiled, in a vm with what it leans on (js/util.ts, js/data.ts) */
export function shipData() {
  if (!fs.existsSync(DIST + 'spacedata.js')) throw new Error('dist/js/spacedata.js missing: run tsc first');
  const ctx = { console, Math, JSON, Set, Map, Object, Array, Number, String, Boolean, Float32Array, Uint8Array, Uint32Array, Int32Array, Infinity, NaN, isFinite, parseInt, parseFloat, Error, Date, Symbol, Promise,
    document: { addEventListener() {}, getElementById: () => null, querySelector: () => null, createElement: () => ({ getContext: () => null, style: {} }) }, location: { search: '' }, navigator: { userAgent: 'node' }, addEventListener() {}, localStorage: null, setTimeout, clearTimeout };
  ctx.window = ctx; ctx.self = ctx; ctx.globalThis = ctx; ctx.G = {};
  vm.createContext(ctx);
  for (const f of ['util', 'data', 'spacedata']) vm.runInContext(fs.readFileSync(DIST + f + '.js', 'utf8'), ctx, { filename: f + '.js' });
  const SD = ctx.G.SpaceData;
  const out = {};
  for (const [id, d] of Object.entries(SD.SHIPS)) out[id] = { id, def: { hw: d.hw, z0: d.z0, z1: d.z1, nose: d.nose, turrets: d.turrets, jump: d.jump }, layout: SD.layout(d), seats: SD.seats(d), boxes: SD.boxes(d), floor: SD.FLOOR };
  return JSON.parse(JSON.stringify(out)); // (plain objects, out of the vm)
}

if (import.meta.url === 'file://' + process.argv[1].replace(/\\/g, '/') || process.argv[1].endsWith('ship_layout.mjs')) {
  const all = shipData();
  if (process.argv.includes('--print')) console.log(JSON.stringify(all, null, 1));
  else { fs.mkdirSync(OUT, { recursive: true }); for (const [id, s] of Object.entries(all)) fs.writeFileSync(path.join(OUT, id + '.layout.json'), JSON.stringify(s, null, 1) + '\n'); console.log('ship layouts: ' + Object.keys(all).join(', ') + ' -> models/ships/'); }
}
