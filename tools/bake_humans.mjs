// The human bodies (js/humans.ts): each model kept in the repo (models/characters/human/variants/<id>.glb, made in Blender by
// models/characters/build_variants.py) checked against what the game does with it (docs/models.md "Human bodies"), then put
// in the baked tree (assets/models/humans/<id>.glb) with assets/models/humans/index.json. A phase of `npm run bake:models`,
// before the bundling (tools/bundle_models.mjs packs them with the rest); nothing here needs Blender, which is wanted only
// to change the bodies.
//   node tools/bake_humans.mjs           check and write
//   node tools/bake_humans.mjs --check   check only (the sources, and that the baked tree is their copy): exit 1 on a problem
//   node tools/bake_humans.mjs --source  check the sources alone (what build_variants.py runs when it has made them)
// A body fails, by name, if: it isn't a readable .glb; its skeleton isn't the one js/rig.ts hangs it on (a bone missing, or
// one the rig doesn't know: that would ride the hips); a material isn't one js/rig.ts dresses, or one every body must have
// is missing; a mesh isn't skinned; it has no figures in js/humandata.ts (or those have no body).
import fs from 'node:fs'; import path from 'node:path'; import crypto from 'node:crypto'; import { fileURLToPath } from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'), SRC = path.join(ROOT, 'models/characters/human/variants'), OUT = path.join(ROOT, 'assets/models/humans');
const sourceOnly = process.argv.includes('--source'), checkOnly = sourceOnly || process.argv.includes('--check');
const BONES = ['hips', 'spine', 'chest', 'clavicle.L', 'upperarm.L', 'forearm.L', 'hand.L', 'clavicle.R', 'upperarm.R', 'forearm.R', 'hand.R', 'neck', 'head', 'eye.L', 'eye.R', 'thigh.L', 'shin.L', 'foot.L', 'thigh.R', 'shin.R', 'foot.R',
  ...['thumb', 'index', 'middle', 'ring', 'pinky'].flatMap((f) => [1, 2, 3].flatMap((i) => [f + i + '.L', f + i + '.R']))]; // (the fingers: three bones each, the first off the hand; js/humans.ts keeps their digits)
const MATS = new Set(['shirt', 'trousers', 'boots', 'neck', 'upsleeve', 'sleeve', 'hand', 'finger', 'front', 'lowleg', 'eye', 'iris', 'skin', 'hair', 'lip', 'brow', 'eyeskin', 'stubble']), NEED = ['shirt', 'trousers', 'boots', 'hand', 'skin', 'eye'];
const errs = [], err = (id, m) => errs.push(id + ': ' + m);

/** A .glb's JSON chunk, or null. */
function glbJson(buf) {
  if (buf.length < 20 || buf.toString('latin1', 0, 4) !== 'glTF' || buf.readUInt32LE(16) !== 0x4e4f534a) return null;
  try { return JSON.parse(buf.toString('utf8', 20, 20 + buf.readUInt32LE(12))); } catch { return null; }
}
function inspect(id, buf) {
  const j = glbJson(buf); if (!j) { err(id, 'not a readable .glb'); return null; }
  const skin = (j.skins || [])[0]; if (!skin || j.skins.length !== 1) { err(id, 'wants one skeleton, has ' + (j.skins || []).length); return null; }
  const bones = skin.joints.map((n) => j.nodes[n].name);
  for (const b of BONES) if (!bones.includes(b)) err(id, 'no bone ' + b);
  for (const b of bones) if (!BONES.includes(b)) err(id, 'a bone the rig does not know: ' + b);
  const mats = (j.materials || []).map((m) => String(m.name || '').split('.')[0]);
  for (const m of mats) if (!MATS.has(m)) err(id, 'a material nothing dresses: ' + (m || '(unnamed)'));
  for (const m of NEED) if (!mats.includes(m)) err(id, 'no material ' + m);
  let tris = 0, prims = 0;
  for (const m of j.meshes || []) for (const p of m.primitives) {
    prims++;
    if (p.attributes.JOINTS_0 == null || p.attributes.WEIGHTS_0 == null) err(id, 'mesh ' + m.name + ' is not skinned');
    tris += (p.indices != null ? j.accessors[p.indices].count : j.accessors[p.attributes.POSITION].count) / 3;
  }
  if (!prims) err(id, 'no meshes');
  return { tris: Math.round(tris), prims, mats: mats.length };
}

let ix; try { ix = JSON.parse(fs.readFileSync(path.join(SRC, 'index.json'), 'utf8')); } catch { console.error('bake_humans: models/characters/human/variants/index.json missing or unreadable (models/characters/build_variants.py writes it)'); process.exit(1); }
const ids = ix.map((v) => v.id);
// (what the game knows of each without its file: js/humandata.ts, written with the models)
const data = fs.readFileSync(path.join(ROOT, 'js/humandata.ts'), 'utf8'), known = new Set([...data.matchAll(/["']?\b([mf]\d\d)\b["']?\s*:\s*\{/g)].map((m) => m[1]));
for (const id of ids) if (!known.has(id)) err(id, 'has no figures in js/humandata.ts');
for (const id of known) if (!ids.includes(id)) err(id, 'is in js/humandata.ts but has no model');
const humans = {};
for (const id of ids) {
  const f = path.join(SRC, id + '.glb');
  if (!fs.existsSync(f)) { err(id, 'no model in models/characters/human/variants'); continue; }
  const buf = fs.readFileSync(f), st = inspect(id, buf); if (!st) continue;
  humans[id] = { file: id + '.glb', bytes: buf.length, sha1: crypto.createHash('sha1').update(buf).digest('hex'), ...st };
  if (checkOnly && !sourceOnly) { const o = path.join(OUT, id + '.glb'); if (!fs.existsSync(o)) err(id, 'not baked (npm run bake:humans)'); else if (!fs.readFileSync(o).equals(buf)) err(id, 'the baked file is not the model kept in the repo (npm run bake:humans)'); }
}
if (errs.length) { for (const e of errs) console.error('HUMANS: ' + e); console.error(errs.length + ' problems with the human bodies'); process.exit(1); }
if (checkOnly) { console.log('humans OK (' + ids.length + ' bodies: skeleton, materials, skinning, figures' + (sourceOnly ? '' : '; the baked tree is their copy') + ')'); process.exit(0); }
fs.mkdirSync(OUT, { recursive: true });
for (const f of fs.readdirSync(OUT)) if (f.endsWith('.glb') && !humans[f.slice(0, -4)]) fs.unlinkSync(path.join(OUT, f)); // (a body no longer made)
for (const id of ids) fs.copyFileSync(path.join(SRC, id + '.glb'), path.join(OUT, id + '.glb'));
fs.writeFileSync(path.join(OUT, 'index.json'), JSON.stringify({ version: 1, humans }, null, 1) + '\n');
const sum = (k) => Object.values(humans).reduce((a, h) => a + h[k], 0);
console.log('humans: ' + ids.length + ' bodies, ' + sum('tris') + ' triangles, ' + sum('bytes') + ' B');
