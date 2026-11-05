// Builds an authored optic's .glb from its shapes.json, in node with three (no Blender needed):
//   node tools/build_authored_optic.mjs falcon          -> models/parts/optic/falcon/falcon.glb
// The model's frame, naming and materials are the contract's "Authored parts" (docs/models.md): origin = the top of the rail at the optic's mount point,
// meshes "optic_<n>" with extras.slot "optic" and a catalogue material name, one root node named after the part. The Blender equivalent is
// models/parts/optic/falcon/build_falcon.py (same shapes.json): a modelling session starts from either.
import fs from 'fs'; import path from 'path'; import { fileURLToPath } from 'url';
import * as THREE from 'three';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';
globalThis.FileReader = class {
  readAsArrayBuffer(b) { b.arrayBuffer().then((r) => { this.result = r; this.onloadend && this.onloadend(); }); }
  readAsDataURL(b) { b.arrayBuffer().then((r) => { this.result = 'data:' + b.type + ';base64,' + Buffer.from(r).toString('base64'); this.onloadend && this.onloadend(); }); }
};
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const id = process.argv[2]; if (!id) { console.error('usage: node tools/build_authored_optic.mjs <id>'); process.exit(2); }
const dir = path.join(ROOT, 'models/parts/optic', id), spec = JSON.parse(fs.readFileSync(path.join(dir, 'shapes.json'), 'utf8'));
const root = new THREE.Group(); root.name = id; const mats = new Map();
const mat = (n) => { if (!mats.has(n)) mats.set(n, Object.assign(new THREE.MeshStandardMaterial({ color: n === 'reflexLens' ? 0x8a94d8 : 0x111111, roughness: 0.6 }), { name: n })); return mats.get(n); };
spec.shapes.forEach((s, i) => {
  let geo;
  if (s.box) geo = new THREE.BoxGeometry(...s.box);
  else { geo = new THREE.CylinderGeometry(s.cyl.r, s.cyl.r, s.cyl.len, 16); if (s.cyl.axis === 'x') geo.rotateZ(Math.PI / 2); else if (s.cyl.axis === 'z') geo.rotateX(Math.PI / 2); }
  geo.deleteAttribute('uv');
  const m = new THREE.Mesh(geo, mat(s.mat)); m.name = 'optic_' + (i + 1); m.userData.slot = 'optic';
  m.position.set(s.at[2], s.at[1], -s.at[0]); root.add(m);
});
const buf = await new GLTFExporter().parseAsync(root, { binary: true });
fs.writeFileSync(path.join(dir, id + '.glb'), Buffer.from(buf));
console.log(`models/parts/optic/${id}/${id}.glb: ${spec.shapes.length} meshes, ${buf.byteLength} bytes`);
