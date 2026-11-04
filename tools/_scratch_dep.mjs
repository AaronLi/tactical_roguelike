// exploration: per-tag dependency sets and pack counts, per platform
import { loadGame } from './model_env.mjs';
import { sweepOf, defOf, meshesOf, buildKey } from './model_sweep.mjs';
import { diffUnits } from './model_diff.mjs';
const G = loadGame(), GS = G.Gunsmith, GM = G.GunModels;
const only = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const byTag = (ms) => { const o = {}; for (const m of ms) { m.v = Float32Array.from(m.v); (o[m.tag] = o[m.tag] || []).push(m); } return o; };
const tot = { packs: 0, builds: 0, bad: 0 }; const summary = [];
for (const id of Object.keys(GS.PLATFORMS).filter((i) => !only.length || only.includes(i))) {
  const sw = sweepOf(GS, id); const R = 2;
  const memo = new Map(); const getB = (build) => { const k = buildKey(build); let x = memo.get(k); if (!x) { const { group, info } = GM.display(defOf(G, id, build)); x = { k, build, tags: byTag(meshesOf(group, info)) }; memo.set(k, x); } return x; };
  const bases = sw.bases.map(getB); for (const e of sw.all) e.B = getB(e.build);
  const tagsAll = new Set(); for (const B of memo.values()) for (const t of Object.keys(B.tags)) tagsAll.add(t);
  const depShape = {}, depMove = {}, delta = {}; // delta[t][slot][part] = d
  for (const t of tagsAll) { depShape[t] = new Set(); depMove[t] = new Set(); delta[t] = {}; }
  for (const e of sw.all) { if (e.slot == null) continue; const base = bases[e.base];
    for (const t of tagsAll) { const d = diffUnits(base.tags[t], e.B.tags[t]); if (d.kind === 'same') continue; if (d.kind === 'shape') depShape[t].add(e.slot); else { depMove[t].add(e.slot); if (e.base === R) ((delta[t][e.slot] = delta[t][e.slot] || {})[e.part] = d); } } }
  for (const t of tagsAll) for (const s of depShape[t]) depMove[t].delete(s);
  const own = (s) => s;
  // closure
  const order = [...memo.values()]; let iter = 0, mism = 0;
  const keyOf = (b, dep) => [...dep].sort().map((s) => b[s] || '').join('|');
  const rBuild = bases[R].build;
  for (; iter < 8; iter++) {
    mism = 0; let changed = false;
    for (const t of tagsAll) {
      const caps = new Map(); // key -> B (capture), preferring builds with the fewest move deviations
      const dm = [...depMove[t]];
      const dev = (b) => dm.filter((s) => (b[s] || '') !== (rBuild[s] || '')).length;
      for (const B of order) { const k = keyOf(B.build, depShape[t]); const c = caps.get(k); if (!c || dev(B.build) < dev(c.build)) caps.set(k, B); }
      const add = new Set();
      for (const B of order) {
        const c = caps.get(keyOf(B.build, depShape[t]));
        // predicted offset from the capture's: for each move slot, delta(B[s]) - delta(c[s]); compare with the actual diff
        const a = c.tags[t], b = B.tags[t];
        const d = diffUnits(a, b);
        let ok = d.kind === 'same';
        if (!ok && (d.kind === 'move' || d.kind === 'warp')) {
          // expected displacement
          let exp = [0, 0, 0]; let fine = true;
          for (const s of dm) { const pb = B.build[s] || '', pc = c.build[s] || ''; if (pb === pc) continue; const db = pb === (rBuild[s] || '') ? [0, 0, 0] : delta[t][s] && delta[t][s][pb] && (delta[t][s][pb].kind === 'move' ? delta[t][s][pb].d : delta[t][s][pb].front); const dc = pc === (rBuild[s] || '') ? [0, 0, 0] : delta[t][s] && delta[t][s][pc] && (delta[t][s][pc].kind === 'move' ? delta[t][s][pc].d : delta[t][s][pc].front); if (!db || !dc) { fine = false; break; } for (let i = 0; i < 3; i++) exp[i] += db[i] - dc[i]; }
          const got = d.kind === 'move' ? d.d : d.front;
          ok = fine && exp.every((x, i) => Math.abs(x - got[i]) < 3e-5);
        }
        if (!ok) { mism++; for (const s of new Set([...Object.keys(B.build), ...Object.keys(c.build)])) if ((B.build[s] || '') !== (c.build[s] || '') && !depShape[t].has(s)) add.add(s); }
        else if (d.kind === 'same' && false) {}
      }
      if (add.size) { for (const s of add) { depShape[t].add(s); depMove[t].delete(s); } changed = true; }
    }
    if (!changed) break;
  }
  let packs = 0; const per = {};
  for (const t of tagsAll) { const ks = new Set(); for (const B of order) if (B.tags[t]) ks.add(keyOf(B.build, depShape[t])); per[t] = ks.size; packs += ks.size; }
  tot.packs += packs; tot.builds += order.length; tot.bad += mism;
  summary.push({ id, builds: order.length, packs, iter, mism, dep: Object.fromEntries([...tagsAll].filter((t) => depShape[t].size > 1).map((t) => [t, [...depShape[t]].join('+') + ' (' + per[t] + ')'])) });
}
for (const s of summary) console.log(s.id.padEnd(10), 'builds', s.builds, 'packs', s.packs, 'iter', s.iter, 'mism', s.mism, JSON.stringify(s.dep));
console.log(JSON.stringify(tot));
