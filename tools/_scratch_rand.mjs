import { loadGame, loadModels } from './model_env.mjs';
import { collect, analyze, indexOf, moveUnit } from './model_packs.mjs';
import { maxDev } from './model_diff.mjs';
const G = loadGame(), env = { G, GS: G.Gunsmith, GM: G.GunModels }, Models = loadModels(), GS = G.Gunsmith;
const only = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const N = +(process.env.RAND || 30); let seed = 12345; const rnd = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
const S = { n: 0, missing: 0, ok: 0, geoBad: 0, infoBad: 0 }; const badTags = {}, missTags = {};
for (const id of Object.keys(GS.PLATFORMS).filter((i) => !only.length || only.includes(i))) {
  const C = collect(env, Models, id, { extra: +(process.env.EXTRA || 0) }), A = analyze(C), { ix, packs } = indexOf(A, Models, 'x');
  const byEntry = new Map(); for (const p of packs) byEntry.set(p.entry, p);
  for (let n = 0; n < N; n++) {
    const b = { ...C.bases[Math.floor(rnd() * 3)].build };
    const k = 2 + Math.floor(rnd() * 2);
    for (let j = 0; j < k; j++) {
      const slots = GS.slotsOf(id, b); const s = slots[Math.floor(rnd() * slots.length)];
      const opts = GS.compatible(s.mount).filter((p) => GS.fitsSlot(s, p, id)).map((p) => p.id); if (!s.req) opts.push('');
      const pid = opts[Math.floor(rnd() * opts.length)]; if (pid) b[s.slot] = pid; else delete b[s.slot]; GS.prune(id, b);
    }
    const B = C.getB(b); S.n++;
    const plan = Models.planBuild(ix, b);
    if (plan.missing) { S.missing++; const m = plan.missing.split(' ')[0]; missTags[id + ':' + m] = (missTags[id + ':' + m] || 0) + 1; continue; }
    let bad = false;
    for (const t of plan.tags) { const e = Models.pickPack(ix.tags[t.tag], b), pk = byEntry.get(e); const pred = pk ? moveUnit(pk.entry.norm, t.rigid, t.stretch, e.stretch, 1) : null; const dv = maxDev(pred, B.tags[t.tag]); if (dv > 8e-5) { bad = true; badTags[id + ':' + t.tag] = (badTags[id + ':' + t.tag] || 0) + 1; } }
    for (const t of Object.keys(B.tags)) if (!plan.tags.some((x) => x.tag === t)) bad = true;
    if (bad) S.geoBad++; else S.ok++;
    const got = Models.infoLeaves(plan.info); let ib = false;
    for (const kk of new Set([...Object.keys(got), ...Object.keys(B.leaves)])) { const x = got[kk], y = B.leaves[kk]; if (!(typeof x === 'number' && typeof y === 'number' ? Math.abs(x - y) < 1e-6 : JSON.stringify(x) === JSON.stringify(y))) ib = true; }
    if (ib) S.infoBad++;
  }
}
console.log('RANDOM', JSON.stringify(S));
console.log('geo bad by platform:tag', JSON.stringify(Object.entries(badTags).sort((a, b) => b[1] - a[1]).slice(0, 30)));
console.log('missing by platform:tag', JSON.stringify(Object.entries(missTags).sort((a, b) => b[1] - a[1]).slice(0, 30)));
