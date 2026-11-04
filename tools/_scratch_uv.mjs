import fs from 'fs';
import { loadModels, ROOT } from './model_env.mjs';
const M = loadModels();
const dir = ROOT + '/assets/models/' + (process.argv[2] || 'guns') + '/';
let withUv = 0, withoutUv = 0;
const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(d + e.name + '/') : e.name.endsWith('.glb') ? [d + e.name] : []));
for (const f of walk(dir)) {
  const j = M.glbJson(fs.readFileSync(f));
  for (const me of j.meshes || []) for (const pr of me.primitives) { const mat = j.materials[pr.material]; if (!mat || !['stipple', 'chequer', 'chequerWood'].includes(mat.name)) continue; if (pr.attributes.TEXCOORD_0 != null) withUv++; else withoutUv++; }
}
console.log('bump-material primitives with UV', withUv, 'without', withoutUv);
