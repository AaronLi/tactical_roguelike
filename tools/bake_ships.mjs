// The squad's ships as made in Blender (models/ships/<id>.glb, by models/ships/build_ship.py from the game's layout of her:
// tools/ship_layout.mjs) checked against what the game does with them (docs/models.md "The squad's ship"), then put in the
// baked tree (assets/models/ships/<id>.glb) with assets/models/ships/index.json. A phase of `npm run bake:models`, before the
// bundling (tools/bundle_models.mjs packs them with the rest); nothing here needs Blender, which is wanted only to change them.
//   node tools/bake_ships.mjs           check and write
//   node tools/bake_ships.mjs --check   check only (the sources, and that the baked tree is their copy): exit 1 on a problem
// A ship fails, by name, if: it isn't a readable .glb; a node the game looks for is missing; one of them isn't where her layout
// (js/spacedata.ts, as the compiled game has it now) puts it, so the model's doors, ramp or guns would be off her solids; a
// material isn't one the game dresses.
import fs from 'node:fs'; import path from 'node:path'; import crypto from 'node:crypto'; import { fileURLToPath } from 'node:url';
import { shipData } from './ship_layout.mjs';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'), SRC = path.join(ROOT, 'models/ships'), OUT = path.join(ROOT, 'assets/models/ships');
const checkOnly = process.argv.includes('--check');
const MATS = new Set(['hull', 'armor', 'accent', 'deck', 'inner', 'dark', 'seat', 'glass', 'glow', 'strip', 'hot', 'screen']);
const NODES = ['body', 'nose_L', 'nose_R', 'ramp', 'screen_nav', 'screen_sensors', 'hp_0', 'hp_1', 'light_0', 'light_1', 'light_2', 'thrust_L', 'thrust_R'];
const errs = [], err = (id, m) => errs.push(id + ': ' + m);

function glbJson(buf) {
  if (buf.length < 20 || buf.toString('latin1', 0, 4) !== 'glTF' || buf.readUInt32LE(16) !== 0x4e4f534a) return null;
  try { return JSON.parse(buf.toString('utf8', 20, 20 + buf.readUInt32LE(12))); } catch { return null; }
}
let data; try { data = shipData(); } catch (e) { console.error('bake_ships: ' + e.message); process.exit(1); }
const ships = {};
for (const f of fs.existsSync(SRC) ? fs.readdirSync(SRC) : []) {
  if (!f.endsWith('.glb')) continue;
  const id = f.slice(0, -4), S = data[id]; if (!S) { err(id, 'no such ship in js/spacedata.ts SHIPS'); continue; }
  const buf = fs.readFileSync(path.join(SRC, f)), j = glbJson(buf); if (!j) { err(id, 'not a readable .glb'); continue; }
  const byName = new Map((j.nodes || []).map((n) => [n.name, n]));
  for (const n of NODES) if (!byName.has(n)) err(id, 'no node ' + n);
  for (const m of j.materials || []) if (!MATS.has(m.name)) err(id, 'a material nothing dresses: ' + (m.name || '(unnamed)'));
  const L = S.layout, W = 0.22, at = (n) => (byName.get(n) && byName.get(n).translation) || [0, 0, 0], near = (n, want, tol = 0.02) => { const t = at(n); if (byName.has(n) && want.some((v, i) => v != null && Math.abs(t[i] - v) > tol)) err(id, `${n} at [${t.map((v) => v.toFixed(2))}], her layout puts it at [${want.map((v) => (v == null ? '-' : v.toFixed(2)))}] (rebuild: blender -b -P models/ships/build_ship.py -- ${id})`); };
  near('nose_L', [0, null, L.zc - W / 2]); near('nose_R', [0, null, L.zc - W / 2]);
  near('ramp', [0, L.FM, L.z1 + W / 2]);
  near('hp_0', [-(L.hw - 0.7), null, L.zr + 1.6]); near('hp_1', [L.hw - 0.7, null, L.zr + 1.6]); // (how high: on her skin, the model's own)
  let tris = 0; for (const m of j.meshes || []) for (const p of m.primitives) tris += (p.indices != null ? j.accessors[p.indices].count : j.accessors[p.attributes.POSITION].count) / 3;
  ships[id] = { file: f, bytes: buf.length, sha1: crypto.createHash('sha1').update(buf).digest('hex'), tris: Math.round(tris) };
  if (checkOnly) { const o = path.join(OUT, f); if (!fs.existsSync(o)) err(id, 'not baked (npm run bake:ships)'); else if (!fs.readFileSync(o).equals(buf)) err(id, 'the baked file is not the model kept in the repo (npm run bake:ships)'); }
}
if (errs.length) { for (const e of errs) console.error('SHIPS: ' + e); console.error(errs.length + ' problems with the ships'); process.exit(1); }
if (checkOnly) { console.log('ships OK (' + Object.keys(ships).join(', ') + ': nodes, layout, materials; the baked tree is their copy)'); process.exit(0); }
fs.mkdirSync(OUT, { recursive: true });
for (const f of fs.readdirSync(OUT)) if (f.endsWith('.glb') && !ships[f.slice(0, -4)]) fs.unlinkSync(path.join(OUT, f));
for (const [id, s] of Object.entries(ships)) fs.copyFileSync(path.join(SRC, s.file), path.join(OUT, s.file));
fs.writeFileSync(path.join(OUT, 'index.json'), JSON.stringify({ version: 1, ships }, null, 1) + '\n');
console.log('ships: ' + Object.entries(ships).map(([id, s]) => `${id} ${s.tris} triangles`).join(', '));
