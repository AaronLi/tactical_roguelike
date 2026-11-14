// The human bodies the game loads (assets/models/humans/<id>.glb, js/humans.ts): copies of the models kept in the repo
// (models/characters/human/variants/<id>.glb, made in Blender by models/characters/build_variants.py). Nothing here needs
// Blender: it's wanted only to change the bodies.   node tools/bake_humans.mjs
import fs from 'node:fs'; import path from 'node:path'; import { fileURLToPath } from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'), SRC = path.join(ROOT, 'models/characters/human/variants'), OUT = path.join(ROOT, 'assets/models/humans');
const ids = JSON.parse(fs.readFileSync(path.join(SRC, 'index.json'), 'utf8')).map((v) => v.id || v), missing = ids.filter((id) => !fs.existsSync(path.join(SRC, id + '.glb')));
if (missing.length) { console.error('bake_humans: no model for ' + missing.join(', ') + ' in models/characters/human/variants (build_variants.py makes them)'); process.exit(1); }
fs.mkdirSync(OUT, { recursive: true });
for (const id of ids) fs.copyFileSync(path.join(SRC, id + '.glb'), path.join(OUT, id + '.glb'));
console.log('humans: ' + ids.length + ' bodies in assets/models/humans');
