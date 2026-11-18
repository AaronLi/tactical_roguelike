// How much a model grows when the weapon AO (js/gunao.ts) splits it: loads each .glb, runs GunAo.apply on it alone (its own self-
// occlusion, no other parts) and prints the vertices before and after and the time. A mesh that splits a lot has long slivers or big
// fans (.claude/skills/modeling-practices). Needs dist/js (npx tsc -p .).
//   node tools/ao_split.mjs models/parts/handguard/vantage_vx15/vantage_vx15.glb [more.glb ...]
//   (an older version to compare: git show HEAD:<path> > old.glb)
import fs from 'node:fs';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
globalThis.THREE = THREE;
const { GunAo } = await import('../dist/js/gunao.js');
const count = (g) => { let v = 0; g.traverse((o) => { if (o.isMesh) v += o.geometry.attributes.position.count; }); return v; };
const tris = (g) => { let t = 0; g.traverse((o) => { if (o.isMesh) t += (o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count) / 3; }); return t; };
const files = process.argv.slice(2);
if (!files.length) { console.log('usage: node tools/ao_split.mjs <file.glb ...>'); process.exit(1); }
for (const f of files) {
  const buf = fs.readFileSync(f), ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.length);
  const gl = await new Promise((res, rej) => new GLTFLoader().parse(ab, '', res, rej));
  const g = gl.scene; g.updateMatrixWorld(true);
  const a = count(g), ta = tris(g), t = performance.now(); GunAo.apply(g, "ao_split:" + f); const b = count(g), tb = tris(g);
  console.log(`${f.split(/[\\/]/).pop().padEnd(30)} verts ${String(a).padStart(7)} -> ${String(b).padStart(7)} (x${(b / a).toFixed(1)}), triangles ${ta} -> ${tb} (x${(tb / ta).toFixed(2)})  ${Math.round(performance.now() - t)} ms`);
}
