import fs from 'fs';
import { loadGame } from './model_env.mjs';
import { sweepOf, defOf, meshesOf } from './model_sweep.mjs';
const G = loadGame(), GS = G.Gunsmith, GM = G.GunModels;
const only = process.argv.slice(2);
const R = (x) => Math.round(x * 1e4);
const byTag = (ms) => { const o = {}; for (const m of ms) (o[m.tag] = o[m.tag] || []).push(m); return o; };
// canonical vertex list of a tag: triangles sorted
const tris = (ms) => { const t = []; for (const m of ms) for (let i = 0; i < m.v.length; i += 9) { const a = []; for (let k = 0; k < 9; k++) a.push(R(m.v[i + k])); t.push(m.mat + '|' + a.join(',')); } return t.sort(); };
const cls = (a, b) => {
  if (!a && !b) return 'same'; if (!a) return 'new'; if (!b) return 'gone';
  const ta = tris(a), tb = tris(b);
  if (ta.length === tb.length && ta.every((x, i) => x === tb[i])) return 'same';
  // translation? compare per-mesh-ordered vertices
  const va = a.flatMap((m) => [...m.v]), vb = b.flatMap((m) => [...m.v]);
  if (va.length !== vb.length) return 'shape';
  const d = [vb[0] - va[0], vb[1] - va[1], vb[2] - va[2]];
  for (let i = 0; i < va.length; i += 3) for (let k = 0; k < 3; k++) if (Math.abs(vb[i + k] - va[i + k] - d[k]) > 2e-4) return 'shape';
  return 'move';
};
const agg = {}; let nb = 0; const t0 = Date.now();
const plats = Object.keys(GS.PLATFORMS).filter((id) => !only.length || only.includes(id));
for (const id of plats) {
  const { bases, list: sw } = sweepOf(GS, id); const baseTags = bases.map((b) => { const { group, info } = GM.display(defOf(G, id, b)); return byTag(meshesOf(group, info)); });
  const built = sw.map((e) => { try { const { group, info } = GM.display(defOf(G, id, e.build)); return { e, tags: byTag(meshesOf(group, info)) }; } catch (err) { return { e, err: err.message }; } });
  nb += built.length;
  for (const x of built) {
    if (x.err) { console.log('ERR', id, x.e.slot, x.e.part, x.err.slice(0, 80)); continue; }
    if (x.e.slot == null) continue;
    const base = { tags: baseTags[x.e.base] };
    const sk = x.e.slot.replace(/\d+$/, '');
    for (const t of new Set([...Object.keys(base.tags), ...Object.keys(x.tags)])) {
      const c = cls(base.tags[t], x.tags[t]); if (c === 'same') continue;
      const k = sk + '->' + t + (t === sk ? '' : ''); const a = (agg[k] = agg[k] || { move: 0, shape: 0, new: 0, gone: 0, plats: new Set(), ex: [] });
      a[c]++; a.plats.add(id); if (a.ex.length < 3 && !a.ex.some((s) => s.startsWith(id + ':'))) a.ex.push(id + ':' + x.e.part);
    }
  }
}
console.log('builds', nb, 'ms', Date.now() - t0);
for (const [k, a] of Object.entries(agg).sort()) { const [s, t] = k.split('->'); console.log(k.padEnd(24), 'mv', a.move, 'sh', a.shape, 'new', a.new, 'gone', a.gone, 'plats', a.plats.size, a.ex.join(' ')); }
