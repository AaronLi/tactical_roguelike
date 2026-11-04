import { loadGame } from './model_env.mjs';
import { sweepOf, defOf, meshesOf } from './model_sweep.mjs';
const G = loadGame(), GS = G.Gunsmith, GM = G.GunModels;
const tn = {}; const ex = {}; const keys = {};
for (const id of Object.keys(GS.PLATFORMS)) {
  const { list } = sweepOf(GS, id);
  for (const e of list) {
    const { group, info } = GM.display(defOf(G, id, e.build)); const ms = meshesOf(group, info);
    for (const m of ms) { const k = m.tag + '@' + m.node; tn[k] = (tn[k] || 0) + 1; (ex[k] = ex[k] || new Set()).add(id); }
    for (const k of Object.keys(info)) keys[k] = (keys[k] || 0) + 1;
    for (const k of Object.keys(info.anim || {})) keys['anim.' + k] = (keys['anim.' + k] || 0) + 1;
  }
}
for (const k of Object.keys(tn).sort()) console.log(k.padEnd(24), tn[k], [...ex[k]].length, 'plats');
console.log(JSON.stringify(keys));
