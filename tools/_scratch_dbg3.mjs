import { loadGame } from './model_env.mjs';
import { sweepOf, defOf, meshesOf } from './model_sweep.mjs';
const G = loadGame(), GS = G.Gunsmith, GM = G.GunModels;
const [id, slot, part, tag] = process.argv.slice(2);
const byTag = (ms) => { const o = {}; for (const m of ms) (o[m.tag] = o[m.tag] || []).push(m); return o; };
const { bases, all } = sweepOf(GS, id);
const build = (b) => { const { group, info } = GM.display(defOf(G, id, b)); return byTag(meshesOf(group, info)); };
const e = all.find((x) => x.slot === slot && x.part === part && x.base === 2);
const a = build(bases[2])[tag], b = build(e.build)[tag];
let shown = 0; const ch = { x: 0, y: 0, z: 0, n: 0 };
for (let i = 0; i < a.length; i++) for (let j = 0; j < a[i].v.length; j += 3) {
  const dx = b[i].v[j] - a[i].v[j], dy = b[i].v[j + 1] - a[i].v[j + 1], dz = b[i].v[j + 2] - a[i].v[j + 2];
  ch.n++; if (Math.abs(dx) > 2e-6) ch.x++; if (Math.abs(dy) > 2e-6) ch.y++; if (Math.abs(dz) > 2e-6) ch.z++;
  if ((Math.abs(dx) > 2e-6 || Math.abs(dy) > 2e-6) && shown < 8) { shown++; console.log('mesh', i, a[i].mat, 'v', j / 3, 'a', [a[i].v[j], a[i].v[j + 1], a[i].v[j + 2]].map((x) => +x.toFixed(4)), 'd', [dx, dy, dz].map((x) => +x.toFixed(5))); }
}
console.log(ch);
