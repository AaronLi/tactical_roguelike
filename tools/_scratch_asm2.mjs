import { loadGameWithModels } from './model_env.mjs';
import { defOf, meshesOf } from './model_sweep.mjs';
import { matchTriangles } from './model_diff.mjs';
const G = await loadGameWithModels(), GS = G.Gunsmith, GM = G.GunModels, M = G.Models;
const [id] = process.argv.slice(2);
await M.preloadPlatform(id);
const def = defOf(G, id, GS.defaultBuild(id));
const asm = M.assemble(def);
const f = M.displayBaked; M.displayBaked = () => null; const proc = GM.display(def); M.displayBaked = f;
const a = meshesOf(asm.group, asm.info), p = meshesOf(proc.group, proc.info);
const by = (ms) => { const o = {}; for (const m of ms) (o[m.tag] = o[m.tag] || []).push(m); return o; };
const A = by(a), P = by(p);
for (const t of Object.keys(P)) for (const tol of [1e-12, 1e-9, 1e-8, 5e-8, 1e-7, 2e-7, 1e-6]) { const d = matchTriangles(A[t], P[t], tol); if (d <= tol) { console.log(t, 'matches at tol', tol, 'dev', d); break; } }
