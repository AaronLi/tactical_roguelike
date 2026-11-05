// The magazine check of the AUTHORED guns (models/<id>/<id>.glb: part_mag extras.check { w } and its meshes' extras.chk, docs/models.md "Magazine check")
// survives the bake: every source whose magazine carries it must give, from the recipe AND from the baked packs (what the game loads), a magazine whose
// js/gunrig.ts magCheck finds the top round (case and tip) and every witness hole, each hole its own mesh tilted as in the source.
//   node tools/check_authored_magcheck.test.mjs        (after npm run bake:models)
import * as THREE from 'three';
import { loadGameWithModels } from './model_env.mjs';
import { authoredIds, readAuthored } from './bake_authored.mjs';
import { defOf } from './model_sweep.mjs';
const G = await loadGameWithModels(), M = G.Models, GS = G.Gunsmith;
let bad = 0, n = 0;
const run = (label, msgs) => { n++; if (msgs.length) { bad++; console.error(`FAIL ${label}:\n  ${msgs.join('\n  ')}`); } else console.log('ok   ' + label); };
for (const id of authoredIds()) {
  const src = readAuthored(id), key = Object.keys(src.parts || {}).find((k) => src.parts[k].check), tagged = src.meshes.filter((e) => e.chk);
  if (!key && !tagged.length) { console.log(`--   ${id}: its source's magazine has no check data`); continue; }
  const holes = tagged.filter((e) => e.chk.role === 'hole'), def = defOf(G, id, GS.defaultBuild(id));
  const check = (what, { group, info }) => {
    const a = info && info.anim && info.anim[key], out = [], mag = a && a.isObject3D ? a : group && group.getObjectByName(typeof a === 'string' ? a : 'part_' + key); // (the recipe's: the node itself; the packs': its name)
    if (!mag) return [`no part_${key} node`];
    const c = G.GunRig.magCheck(mag);
    if (!c) return [`magCheck found nothing on part_${key} (check ${JSON.stringify(mag.userData.check || null)}, ${(() => { let k = 0; mag.traverse((o) => { if (o.isMesh && o.userData.chk) k++; }); return k; })()} tagged meshes)`];
    if (Math.abs(c.w - src.parts[key].check.w) > 1e-6) out.push(`w is ${c.w}, the source's ${src.parts[key].check.w}`);
    if (!c.top[0] || !c.top[1]) out.push('no top round (case and tip)');
    if (c.holes.length !== holes.length) out.push(`${c.holes.length} witness holes, the source has ${holes.length}`);
    for (const e of holes) { // (each its own mesh, at its node's tilt)
      const h = c.holes.find((q) => q.i === e.chk.i && q.side === (e.chk.side === -1 ? -1 : 1));
      if (!h) { out.push(`hole i ${e.chk.i} side ${e.chk.side} is missing`); continue; }
      const q = new THREE.Quaternion(); for (let o = h.mesh; o && o !== group; o = o.parent) q.premultiply(o.quaternion); const d = Math.abs(q.x * e.xf.q[0] + q.y * e.xf.q[1] + q.z * e.xf.q[2] + q.w * e.xf.q[3]);
      if (1 - d > 1e-5) out.push(`hole i ${e.chk.i} side ${e.chk.side} is not tilted as in the source (${what})`);
    }
    return out;
  };
  run(`${id}: the recipe's magazine carries the check`, check('recipe', G.GunRecipes.display(def)));
  await M.preloadPlatform(id);
  const asm = M.assemble(def);
  run(`${id}: the baked magazine (the packs) carries the check`, asm ? check('packs', asm) : ['assemble() gave nothing']);
}
console.log(bad ? `${bad} of ${n} FAILED` : `${n} magazine-check checks ok`);
process.exit(bad ? 1 : 0);
