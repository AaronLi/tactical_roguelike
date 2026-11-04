import { loadGame } from './model_env.mjs';
import { sweepOf, defOf, meshesOf } from './model_sweep.mjs';
const G = loadGame(), GS = G.Gunsmith, GM = G.GunModels;
const only = process.argv.slice(2);
const flat = (v, out = [], pre = '') => { if (v == null) { out.push([pre, null]); return out; } if (typeof v === 'number') out.push([pre, v]); else if (Array.isArray(v)) v.forEach((x, i) => flat(x, out, pre + '[' + i + ']')); else if (typeof v === 'object') for (const k of Object.keys(v).sort()) flat(v[k], out, pre + '.' + k); else out.push([pre, v]); return out; };
const infoOf = (id, build) => { const { group, info } = GM.display(defOf(G, id, build)); const o = {}; for (const [k, v] of Object.entries(info)) { if (k === 'anim') { for (const [a, n] of Object.entries(v)) if (n && n.isObject3D) { group.updateMatrixWorld(true); o['anim.' + a] = [n.position.x, n.position.y, n.position.z]; } else o['anim.' + a] = 'x'; continue; } if (k === 'quarrelMats') continue; try { o[k] = JSON.parse(JSON.stringify(v, (kk, vv) => vv && vv.isObject3D ? undefined : vv)); } catch (e) {} } return Object.fromEntries(flat(o)); };
const eq = (a, b) => (typeof a === 'number' && typeof b === 'number' ? Math.abs(a - b) < 1e-7 : a === b);
const agg = {}; const nonadd = {}; let total = 0, bad = 0;
for (const id of Object.keys(GS.PLATFORMS).filter((i) => !only.length || only.includes(i))) {
  const { bases, list } = sweepOf(GS, id);
  const bi = bases.map((b) => infoOf(id, b));
  const delta = {}; // slot -> part -> {field: delta} from base 0
  const rows = list.map((e) => ({ e, i: infoOf(id, e.build) }));
  for (const r of rows) {
    if (r.e.slot == null) continue;
    const b = bi[r.e.base], sk = r.e.slot;
    const keys = new Set([...Object.keys(b), ...Object.keys(r.i)]);
    const d = {};
    for (const k of keys) { const x = b[k], y = r.i[k]; if (eq(x, y)) continue; const kk = k.replace(/\[\d+\]/g, '[]').replace(/\.(side|style)$/, ''); d[k] = typeof x === 'number' && typeof y === 'number' ? y - x : [x, y]; const kk2 = k.replace(/^./, ''); const top = kk2.startsWith('anim.') ? kk2.split(/[[]/)[0] : kk2.split(/[.[]/)[0]; const a = (agg[top + ' <- ' + sk.replace(/\d+$/, '')] = agg[top + ' <- ' + sk.replace(/\d+$/, '')] || { n: 0, plats: new Set() }); a.n++; a.plats.add(id); }
    r.d = d;
  }
}
for (const [k, a] of Object.entries(agg).sort()) console.log(k.padEnd(34), a.n, a.plats.size, 'plats');
