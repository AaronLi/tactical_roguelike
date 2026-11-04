import { loadGame } from './model_env.mjs';
import { sweepOf, defOf, meshesOf, buildKey } from './model_sweep.mjs';
const G = loadGame(), GS = G.Gunsmith, GM = G.GunModels;
const [id, slot, part] = process.argv.slice(2);
const { bases, list: sw } = sweepOf(GS, id);
const show = (e) => { const { group, info } = GM.display(defOf(G, id, e.build)); const ms = meshesOf(group, info); const t = {}; for (const m of ms) { const k = m.tag + '@' + m.node; t[k] = (t[k] || 0) + m.v.length / 9; } return t; };
for (const e of sw) if (e.slot === slot && e.part === part) {
  console.log('swap', e.base, buildKey(e.build)); console.log(' base', buildKey(bases[e.base]));
  console.log(' base tags', JSON.stringify(show({build: bases[e.base]}))); console.log(' swap tags', JSON.stringify(show(e)));
}
