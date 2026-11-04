import { loadGameWithModels } from './model_env.mjs';
import { defOf, meshesOf } from './model_sweep.mjs';
const G = await loadGameWithModels(), GS = G.Gunsmith, GM = G.GunModels, M = G.Models;
const [id, tag] = process.argv.slice(2);
await M.preloadPlatform(id);
const def = defOf(G, id, GS.defaultBuild(id));
const asm = M.assemble(def);
const f = M.displayBaked; M.displayBaked = () => null; const proc = GM.display(def); M.displayBaked = f;
const a = meshesOf(asm.group, asm.info).filter((m) => m.tag === tag), p = meshesOf(proc.group, proc.info).filter((m) => m.tag === tag);
console.log('assembled', a.length, 'procedural', p.length);
const sig = (m) => `${m.node}|${m.mat}|${m.v.length / 9}`;
const n = Math.max(a.length, p.length);
let shown = 0;
for (let i = 0; i < n && shown < 12; i++) {
  const x = a[i], y = p[i];
  const same = x && y && sig(x) === sig(y);
  let dev = 0; if (same) for (let j = 0; j < x.v.length; j++) dev = Math.max(dev, Math.abs(x.v[j] - y.v[j]));
  if (!same || dev > 1e-4) { console.log(i, x ? sig(x) : '-', '|', y ? sig(y) : '-', dev); shown++; }
}
