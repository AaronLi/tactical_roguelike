import { loadGame } from './model_env.mjs';
import { sweepOf, defOf, meshesOf } from './model_sweep.mjs';
import { diffUnits } from './model_diff.mjs';
const G = loadGame(), GS = G.Gunsmith, GM = G.GunModels;
const only = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const byTag = (ms) => { const o = {}; for (const m of ms) (o[m.tag] = o[m.tag] || []).push(m); return o; };
const agg = {}; const ex = {};
for (const id of Object.keys(GS.PLATFORMS).filter((i) => !only.length || only.includes(i))) {
  const { bases, all } = sweepOf(GS, id);
  const bt = bases.map((b) => { const { group, info } = GM.display(defOf(G, id, b)); return byTag(meshesOf(group, info)); });
  for (const e of all) {
    if (e.slot == null) continue;
    const { group, info } = GM.display(defOf(G, id, e.build)); const t = byTag(meshesOf(group, info));
    const base = bt[e.base], sk = e.slot.replace(/\d+$/, '');
    for (const tag of new Set([...Object.keys(base), ...Object.keys(t)])) {
      const d = diffUnits(base[tag], t[tag]); if (d.kind === 'same') continue;
      if (tag === sk && d.kind === 'shape') continue; // own
      const k = sk + '->' + tag + ' ' + d.kind; agg[k] = (agg[k] || 0) + 1; (ex[k] = ex[k] || new Set()).size < 4 && ex[k].add(id + ':' + e.part);
    }
  }
}
for (const [k, n] of Object.entries(agg).sort()) console.log(k.padEnd(30), n, [...ex[k]].join(' '));
