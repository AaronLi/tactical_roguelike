import { loadGameWithModels } from './model_env.mjs';
import { defOf, meshesOf, sweepOf } from './model_sweep.mjs';
import { matchTriangles } from './model_diff.mjs';
const G = await loadGameWithModels(), GS = G.Gunsmith, GM = G.GunModels, M = G.Models;
const [id] = process.argv.slice(2);
await M.preloadPlatform(id);
const { list } = sweepOf(GS, id);
const by = (ms) => { const o = {}; for (const m of ms) (o[m.tag] = o[m.tag] || []).push(m); return o; };
let shown = 0;
for (const e of list) {
  const def = defOf(G, id, e.build), asm = M.assemble(def);
  const f = M.displayBaked; M.displayBaked = () => null; const proc = GM.display(def); M.displayBaked = f;
  const A = by(meshesOf(asm.group, asm.info)), P = by(meshesOf(proc.group, proc.info));
  for (const t of Object.keys(P)) { const d = matchTriangles(A[t], P[t], 1e-3); if (d > 0 && shown < 25) { shown++; console.log(e.slot, e.part, t, d); } }
}
