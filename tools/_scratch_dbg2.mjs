import { loadGame } from './model_env.mjs';
import { sweepOf, defOf, meshesOf } from './model_sweep.mjs';
import { diffUnits } from './model_diff.mjs';
const G = loadGame(), GS = G.Gunsmith, GM = G.GunModels;
const [id, slot, tag, base0] = process.argv.slice(2); const bi = +(base0 || 2);
const byTag = (ms) => { const o = {}; for (const m of ms) (o[m.tag] = o[m.tag] || []).push(m); return o; };
const { bases, all } = sweepOf(GS, id);
const build = (b) => { const { group, info } = GM.display(defOf(G, id, b)); return byTag(meshesOf(group, info)); };
const bt = build(bases[bi]);
console.log('base', JSON.stringify(bases[bi]));
for (const e of all) if (e.slot === slot && e.base === bi) {
  const t = build(e.build); const a = bt[tag], b = t[tag];
  const d = diffUnits(a, b);
  const sum = (u) => u ? u.map((m) => m.v.length / 9).join(',') : '-';
  console.log(e.part.padEnd(28), d.kind, d.kind === 'warp' ? JSON.stringify({ from: +d.from.toFixed(4), to: +d.to.toFixed(4), front: d.front.map((x) => +x.toFixed(4)) }) : d.kind === 'move' ? d.d.map((x) => +x.toFixed(4)) : '', d.kind === 'shape' ? 'tris ' + sum(a) + ' | ' + sum(b) : '');
}
