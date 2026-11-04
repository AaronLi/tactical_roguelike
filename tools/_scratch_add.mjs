import { loadGame } from './model_env.mjs';
import { sweepOf, defOf } from './model_sweep.mjs';
const G = loadGame(), GS = G.Gunsmith, GM = G.GunModels;
const only = process.argv.slice(2).filter((a) => !a.startsWith('--')); const RI = +(process.env.RI || 2);
const flat = (v, out = [], pre = '') => { if (v == null) { out.push([pre, null]); return out; } if (typeof v === 'number') out.push([pre, v]); else if (Array.isArray(v)) { out.push([pre + '#', v.length]); v.forEach((x, i) => flat(x, out, pre + '[' + i + ']')); } else if (typeof v === 'object') for (const k of Object.keys(v).sort()) flat(v[k], out, pre + '.' + k); else out.push([pre, v]); return out; };
const infoOf = (id, build) => { const { group, info } = GM.display(defOf(G, id, build)); group.updateMatrixWorld(true); const o = {}; for (const [k, v] of Object.entries(info)) { if (k === 'anim') { for (const [a, n] of Object.entries(v)) if (n && n.isObject3D) o['anim.' + a] = [n.position.x, n.position.y, n.position.z]; else o['anim.' + a] = 'x'; continue; } if (k === 'quarrelMats') continue; try { o[k] = JSON.parse(JSON.stringify(v, (kk, vv) => vv && vv.isObject3D ? undefined : vv)); } catch (e) {} } return Object.fromEntries(flat(o)); };
const eq = (a, b) => (typeof a === 'number' && typeof b === 'number' ? Math.abs(a - b) < 1e-6 : a === b);
const S = { builds: 0, exact: 0, mismatch: 0, unknown: 0 }; const bad = {};
for (const id of Object.keys(GS.PLATFORMS).filter((i) => !only.length || only.includes(i))) {
  const { bases, all: list } = sweepOf(GS, id);
  const R = bases[RI], Ri = infoOf(id, R);
  const rows = list.map((e) => ({ e, i: infoOf(id, e.build) }));
  const delta = {}; // slot|part -> {leaf: delta | ['set', v]}
  for (const r of rows) {
    if (r.e.slot == null || r.e.base !== RI) continue;
    const d = {}; for (const k of new Set([...Object.keys(Ri), ...Object.keys(r.i)])) { const x = Ri[k], y = r.i[k]; if (eq(x, y)) continue; d[k] = typeof x === 'number' && typeof y === 'number' ? y - x : ['set', y]; }
    delta[r.e.slot + '|' + r.e.part] = d;
  }
  for (const r of rows) {
    S.builds++;
    const diffs = Object.keys(r.e.build).concat(Object.keys(R)).filter((s, i, a) => a.indexOf(s) === i).filter((s) => (r.e.build[s] || '') !== (R[s] || ''));
    const pred = { ...Ri }; let unk = false;
    for (const s of diffs) { const d = delta[s + '|' + (r.e.build[s] || '')]; if (!d) { unk = true; break; } for (const [k, v] of Object.entries(d)) { if (Array.isArray(v)) pred[k] = v[1]; else pred[k] = (typeof pred[k] === 'number' ? pred[k] : 0) + v; } }
    if (unk) { S.unknown++; (bad.unk = bad.unk || []).length < 6 && bad.unk.push(id + ' ' + diffs.join(',')); continue; }
    const wrong = []; for (const k of new Set([...Object.keys(pred), ...Object.keys(r.i)])) if (!eq(pred[k], r.i[k])) wrong.push(k);
    if (wrong.length) { S.mismatch++; const kk = id; (bad[kk] = bad[kk] || []).length < 3 && bad[kk].push(diffs.join(',') + ' => ' + wrong.slice(0, 5).join(' ')); } else S.exact++;
  }
}
console.log(JSON.stringify(S)); for (const [k, v] of Object.entries(bad)) console.log(k, JSON.stringify(v));
