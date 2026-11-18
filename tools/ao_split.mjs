// How much a model grows when the weapon AO (js/gunao.ts) splits it: loads each .glb, runs GunAo.apply on it alone (its own self-
// occlusion, no other parts) and prints the vertices and triangles before and after and the time. A mesh that splits a lot has long
// slivers, big fans or long strips (.claude/skills/modeling-practices). Needs dist/js (npx tsc -p .).
//   node tools/ao_split.mjs models/parts/handguard/vantage_vx15/vantage_vx15.glb [more.glb ...]
//   --far          with GunAo.GUN_FAR (a far level of detail: no splitting) instead of GunAo.GUN
//   --meshes [N]   also each mesh's triangles before and after (its name, longest side in mm), the N that grow most (default 12)
//   (an older version to compare: git show HEAD:<path> > old.glb; each file is reported on its own)
import fs from 'node:fs';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
globalThis.THREE = THREE;
const { GunAo } = await import('../dist/js/gunao.js');
const args = process.argv.slice(2), mi = args.indexOf('--meshes');
let perMesh = 0;
if (mi >= 0) { const n = +args[mi + 1]; perMesh = Number.isFinite(n) && n > 0 ? n : 12; args.splice(mi, Number.isFinite(n) && n > 0 ? 2 : 1); }
const far = args.indexOf('--far'); if (far >= 0) args.splice(far, 1);   // (--far: GunAo.GUN_FAR, a far level of detail's: occlusion at the vertices it has, nothing split)
const triOf = (geo) => (geo.index ? geo.index.count : geo.attributes.position.count) / 3;
const meshes = (g) => { const m = []; g.traverse((o) => { if (o.isMesh) m.push(o); }); return m; };
const files = args;
if (!files.length) { console.log('usage: node tools/ao_split.mjs <file.glb ...> [--meshes [N]]'); process.exit(1); }
for (const f of files) {
  const buf = fs.readFileSync(f), ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.length);
  const gl = await new Promise((res, rej) => new GLTFLoader().parse(ab, '', res, rej));
  const g = gl.scene; g.updateMatrixWorld(true);
  const ms = meshes(g), before = new Map(ms.map((o) => [o, [o.geometry.attributes.position.count, triOf(o.geometry)]]));
  const size = new Map(ms.map((o) => [o, Math.round(new THREE.Box3().setFromObject(o).getSize(new THREE.Vector3()).toArray().reduce((p, x) => Math.max(p, x), 0) * 1000)]));
  const t = performance.now(); GunAo.apply(g, 'ao_split:' + f, far >= 0 ? GunAo.GUN_FAR : GunAo.GUN); const ms2 = Math.round(performance.now() - t);
  let a = 0, b = 0, ta = 0, tb = 0; const rows = [];
  for (const o of ms) { const [v0, t0] = before.get(o), v1 = o.geometry.attributes.position.count, t1 = triOf(o.geometry); a += v0; b += v1; ta += t0; tb += t1; rows.push([o.name, size.get(o), t0, t1]); }
  console.log(`${f.split(/[\\/]/).pop().padEnd(30)} verts ${String(a).padStart(7)} -> ${String(b).padStart(7)} (x${(b / a).toFixed(1)}), triangles ${ta} -> ${tb} (x${(tb / ta).toFixed(2)})  ${ms2} ms`);
  if (perMesh) for (const [nm, mm, t0, t1] of rows.sort((p, q) => (q[3] - q[2]) - (p[3] - p[2])).slice(0, perMesh))
    console.log(`    ${String(nm).padEnd(22)} ${String(mm).padStart(4)} mm  ${String(t0).padStart(6)} -> ${String(t1).padStart(6)}  (x${(t1 / t0).toFixed(1)})`);
}
