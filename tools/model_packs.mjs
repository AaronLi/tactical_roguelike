// The coupling analysis of the per-part packs (milestone 2): given a platform, sweep its builds (tools/model_sweep.mjs), work out which slots
// shape which other slots' geometry (JOINT packs) and which only move it (ANCHORS: translations, stretches), and produce the index data and the
// in-memory packs. tools/bake_models.mjs writes them out; the same code verifies that assembling every build from them equals the procedural build.
//
// The method (per platform P, per mesh slot ("tag") t):
//   1. Build every sweep build once: its meshes per tag in world space, and its `info` as flat leaves.
//   2. Compare each single swap (slot s -> part q, from each of the 3 base builds) with its base, tag by tag (model_diff.mjs):
//        shape change  -> s is in dep(t): the pack of t is keyed by s's part (a JOINT pack when dep(t) names more than t's own slot);
//        rigid move    -> s only moves t: an ANCHOR mount_<t> on part q (the offset from the reference part's), added at assembly;
//        stretch       -> likewise stretch_<t>, with the pack's stretch region where it was observed.
//      The reference part of each slot is the one in the "loaded B" base (the fullest build): swaps from it give every part's offset.
//   3. Close the model over the sweep: pick each pack's capture build, normalise it (undo the offsets of its capture) and predict every build's
//      geometry from it; wherever that fails (offsets that don't add up, a stretch that isn't one), the slots that differ join dep(t). Repeat.
//   4. The info: the nearest of the 3 base builds' info plus the deltas of the differing slots' parts; the builds this gets wrong are listed (`exact`).
import { sweepOf, defOf, meshesOf, buildKey, randomBuilds } from './model_sweep.mjs';
import { diffUnits, maxDev, TOL, WARP_TOL, aligned } from './model_diff.mjs';

export const R = 2; // the reference base: loaded B
const GEO_TOL = 1e-5;       // metres: a rebuilt unit matches the recipe's within this (rigid moves)
const STRETCH_TOL = 7.5e-5; // metres: ... within this (a stretch; 0.075 mm, under the 0.1 mm of the test's triangle hash)

/** info without the live references (anim) and the viewmodel-only crossbow materials, as plain JSON. */
export function cleanInfo(info) {
  const o = {};
  for (const [k, v] of Object.entries(info)) {
    if (k === 'anim' || k === 'quarrelMats') continue;
    try { o[k] = JSON.parse(JSON.stringify(v, (kk, vv) => (vv && vv.isObject3D ? undefined : vv))); } catch (e) { /* not data */ }
  }
  return o;
}

/** Builds every sweep build of a platform: { sw, memo (key -> B), bases, builds: [B] } with B = { k, build, tags: { tag: [{ mat, node, v }] }, leaves }. */
export function collect(env, Models, id, { extra = 0, seed = 7001 } = {}) {
  const { G, GS, GM } = env, sw = sweepOf(GS, id), memo = new Map();
  const getB = (build) => {
    const k = buildKey(build); let x = memo.get(k); if (x) return x;
    const { group, info } = GM.display(defOf(G, id, build));
    const tags = {};
    for (const m of meshesOf(group, info)) { m.v = Float32Array.from(m.v); (tags[m.tag] = tags[m.tag] || []).push(m); }
    x = { k, build: { ...build }, tags, leaves: Models.infoLeaves(cleanInfo(info)) }; memo.set(k, x); return x;
  };
  const bases = sw.bases.map(getB);
  for (const e of sw.all) e.B = getB(e.build);
  const nSweep = memo.size;
  // random builds beyond the sweep (two or three parts changed at once): the analysis learns the interactions they show
  if (extra) for (const b of randomBuilds(GS, id, sw.bases.map((x) => x), extra, seed, new Set(memo.keys()))) getB(b).extra = true;
  return { id, sw, memo, getB, bases, builds: [...memo.values()], nSweep, GS };
}

const keyStr = (b, dep) => dep.map((s) => b[s] || '').join('|');

/** Applies an offset (rigid [f,u,r] and a stretch of front F over `st`) to a unit's world vertices: returns new units. */
export function moveUnit(unit, rigid, F, st, sign = 1) {
  if (!unit) return unit;
  const [rf, ru, rr] = rigid;
  return unit.map((m) => {
    const v = new Float32Array(m.v.length);
    for (let i = 0; i < v.length; i += 3) {
      let x = m.v[i], y = m.v[i + 1], z = m.v[i + 2];
      if (sign > 0) { const f = -z; z -= F && st ? stretchOf(f, st, F) : 0; x += rr; y += ru; z -= rf; }
      else { x -= rr; y -= ru; z += rf; if (F && st) { const g = -z; z += unstretch(g, st, F); } }
      v[i] = x; v[i + 1] = y; v[i + 2] = z;
    }
    return { mat: m.mat, node: m.node, v };
  });
}
const stretchOf = (f, st, F) => (f <= st.from ? 0 : f >= st.to ? F : (F * (f - st.from)) / (st.to - st.from));
/** The shift to undo (a stretched point's forward position g -> the pack's): the inverse of stretchOf. */
const unstretch = (g, st, F) => {
  if (g <= st.from) return 0; if (g >= st.to + F) return F;
  const L = st.to - st.from, f = st.from + ((g - st.from) * L) / (L + F); return g - f;
};

/** Max deviation between `pred` = moveUnit(norm, ...) computed on the fly and `actual`. */
function devOf(norm, rigid, F, st, actual) {
  if (!norm && !actual) return 0; if (!norm || !actual || !aligned(norm, actual)) return Infinity;
  const [rf, ru, rr] = rigid; let m = 0;
  for (let i = 0; i < norm.length; i++) {
    const a = norm[i].v, b = actual[i].v;
    for (let j = 0; j < a.length; j += 3) {
      const z = a[j + 2], dz = F && st ? stretchOf(-z, st, F) : 0;
      const d = Math.max(Math.abs(a[j] + rr - b[j]), Math.abs(a[j + 1] + ru - b[j + 1]), Math.abs(z - dz - rf - b[j + 2]));
      if (d > m) m = d;
    }
  }
  return m;
}

/**
 * Which slots shape which tags, and the offsets: the closed model of one platform. See the file comment.
 * Two kinds of offset: RIGID (a part moves another slot's unit: delta[t][s][part], measured off the reference build and filled out from the other bases)
 * and STRETCH (a provider slot s, normally the barrel, lengthens a unit, e.g. a handguard or a front sight: the provider's intrinsic front displacement
 * A[s][part], measured on the tag that stretches with gain 1, times each PACK's own gain and region, measured on the pack with a probe build).
 */
export function analyze(C) {
  const { id, sw, bases, builds } = C, Rb = bases[R].build, Rp = (s) => Rb[s] || '';
  const tagsAll = new Set(); for (const B of builds) for (const t of Object.keys(B.tags)) tagsAll.add(t);
  const slotsAll = new Set(); for (const B of builds) for (const s of Object.keys(B.build)) slotsAll.add(s);
  const depShape = {}, depMove = {}, obs = {}, delta = {};
  for (const t of tagsAll) { depShape[t] = new Set(); depMove[t] = new Set(); obs[t] = []; delta[t] = {}; }
  const kinds = {}; // t|s -> { move, warp }
  for (const e of sw.all) {
    if (e.slot == null) continue;
    const base = bases[e.base];
    for (const t of tagsAll) {
      const d = diffUnits(base.tags[t], e.B.tags[t]);
      obs[t].push({ e, d });
      if (d.kind === 'shape') depShape[t].add(e.slot);
      else if (d.kind !== 'same') { depMove[t].add(e.slot); const k = kinds[t + '|' + e.slot] = kinds[t + '|' + e.slot] || {}; k[d.kind] = (k[d.kind] || 0) + 1; }
    }
  }
  // the provider's own stretch, measured on the tag that follows it with gain 1: the one with the most warps off the reference build
  const A = {}, canon = {};
  { const wc = {};
    for (const t of tagsAll) for (const { e, d } of obs[t]) if (d.kind === 'warp' && e.base === R) { const w = (wc[e.slot] = wc[e.slot] || {}); w[t] = (w[t] || 0) + 1; }
    for (const [s, w] of Object.entries(wc)) {
      const t = Object.keys(w).sort((a, b) => w[b] - w[a])[0]; canon[s] = t; const m = (A[s] = new Map([[Rp(s), 0]]));
      for (const { e, d } of obs[t]) if (e.slot === s && e.base === R) m.set(e.part, d.kind === 'warp' ? d.front[0] : 0);
    } }
  const stretchSlot = {};
  for (const t of tagsAll) {
    const cands = {};
    for (const { e, d } of obs[t]) if (d.kind === 'warp') cands[e.slot] = (cands[e.slot] || 0) + 1;
    const ss = Object.keys(cands).sort((a, b) => cands[b] - cands[a]);
    for (const s of ss) if (!A[s] || s !== ss[0]) depShape[t].add(s);
    if (ss.length && A[ss[0]] && !depShape[t].has(ss[0])) stretchSlot[t] = ss[0];
  }
  for (const t of tagsAll) for (const s of depShape[t]) depMove[t].delete(s);
  // rigid offsets: off the reference build, then filled out through the other bases (a unit absent or inert at the reference)
  for (const t of tagsAll) {
    for (const s of depMove[t]) {
      if (s === stretchSlot[t]) continue;
      const m = (delta[t][s] = new Map([[Rp(s), [0, 0, 0]]])), list = obs[t].filter(({ e, d }) => e.slot === s && (d.kind === 'move' || d.kind === 'same'));
      const vec = (d) => (d.kind === 'move' ? d.d : [0, 0, 0]);
      for (const { e, d } of list) if (e.base === R) m.set(e.part, vec(d));
      for (let changed = true; changed;) {
        changed = false;
        for (const { e, d } of list) {
          const p0 = bases[e.base].build[s] || '', v = vec(d), a = m.get(p0), b = m.get(e.part);
          if (a && !b) { m.set(e.part, [a[0] + v[0], a[1] + v[1], a[2] + v[2]]); changed = true; } else if (b && !a) { m.set(p0, [b[0] - v[0], b[1] - v[1], b[2] - v[2]]); changed = true; }
        }
      }
    }
  }
  const rigidOf = (t, b) => {
    const rigid = [0, 0, 0];
    for (const s of depMove[t]) {
      if (s === stretchSlot[t]) continue;
      const p = b[s] || ''; if (p === Rp(s)) continue;
      const d = delta[t][s] && delta[t][s].get(p); if (!d) return { ok: false, slot: s };
      rigid[0] += d[0]; rigid[1] += d[1]; rigid[2] += d[2];
    }
    return { ok: true, rigid };
  };
  const state = {};
  let iter = 0;
  for (; iter < 16; iter++) {
    let changed = false;
    for (const t of tagsAll) {
      const dep = [...depShape[t]].sort(), ss = stretchSlot[t] && !depShape[t].has(stretchSlot[t]) ? stretchSlot[t] : null;
      const mv = [...depMove[t]].filter((s) => s !== ss).concat(ss ? [ss] : []);
      const dev = (b) => mv.filter((s) => (b[s] || '') !== Rp(s)).length;
      const caps = new Map();
      for (const B of builds) { const k = keyStr(B.build, dep), c = caps.get(k); if (!c || dev(B.build) < dev(c.build)) caps.set(k, B); }
      const norms = new Map(); // pack key -> { norm, off: { rigid, F }, st: { from, to } | null, g }
      const add = new Set();
      const Aof = (B) => (ss ? A[ss].get(B.build[ss] || '') : 0);
      for (const [k, c] of caps) {
        const r = rigidOf(t, c.build); if (!r.ok) { add.add(r.slot); norms.set(k, null); continue; }
        let g = 0, st = null;
        const Ac = Aof(c);
        if (ss && c.tags[t]) {
          if (Ac === undefined) { if (process.env.DBG === t) console.error('NOAC', ss, c.build[ss], [...A[ss].keys()].join()); add.add(ss); norms.set(k, null); continue; }
          // probe: the capture with the provider's part with the most different stretch; how does this pack follow it?
          const alts = [...A[ss]].filter(([, a]) => Math.abs(a - Ac) > 1e-3).sort((x, y) => Math.abs(y[1] - Ac) - Math.abs(x[1] - Ac));
          let X = null, aq = 0;
          for (const [q, a] of alts.slice(0, 4)) { const nb = { ...c.build }; if (q) nb[ss] = q; else delete nb[ss]; C.GS.prune(id, nb); if ((nb[ss] || '') === q) { X = C.getB(nb); aq = a; break; } }
          if (X) {
            const d = diffUnits(c.tags[t], X.tags[t]);
            if (d.kind === 'same') g = 0;
            else if (d.kind === 'warp') { g = d.front[0] / (aq - Ac); st = { from: d.from, to: d.to - g * Ac }; }
            else { if (process.env.DBG === t) console.error('PROBE', d.kind, c.k.slice(0,60), 'q', aq); add.add(ss); norms.set(k, null); continue; }
          }
        }
        const F = g * (Ac || 0);
        norms.set(k, { norm: moveUnit(c.tags[t], r.rigid, F, st, -1), off: { rigid: r.rigid, F }, st: g ? st : null, g });
      }
      for (const B of builds) {
        const k = keyStr(B.build, dep), p = norms.get(k), c = caps.get(k);
        let ok = !!p;
        if (ok) {
          const r = rigidOf(t, B.build); if (!r.ok) { add.add(r.slot); continue; }
          const Ab = Aof(B); if (ss && Ab === undefined) { add.add(ss); continue; }
          const F = p.g * (Ab || 0);
          ok = devOf(p.norm, r.rigid, F, p.st, B.tags[t]) <= (F ? STRETCH_TOL : GEO_TOL);
        }
        if (!ok) { if (process.env.DBG && t === process.env.DBG && iter === 0) { const r2 = rigidOf(t, B.build); console.error('MISMATCH', t, B.k.slice(0, 80), 'cap', c.k.slice(0,80), 'p', !!p, p && p.g, p && p.st, r2.ok, p && r2.ok && devOf(p.norm, r2.rigid, p.g * (Aof(B) || 0), p.st, B.tags[t])); }
          const cand = [...new Set([...Object.keys(B.build), ...Object.keys(c.build)])].filter((s) => (B.build[s] || '') !== (c.build[s] || '') && !depShape[t].has(s)), pref = cand.filter((s) => depMove[t].has(s));
          if (pref.length) { for (const s of pref) add.add(s); continue; }
          // which of the slots that differ is to blame? change them one at a time, then two at a time, from the capture
          const step = (slots) => { const nb = { ...c.build }; for (const s of slots) { if (B.build[s]) nb[s] = B.build[s]; else delete nb[s]; } C.GS.prune(id, nb); return C.getB(nb); };
          const good = (X) => {
            const kx = keyStr(X.build, dep), px = norms.get(kx); if (!caps.has(kx)) return true; if (!px) return false;
            const r = rigidOf(t, X.build); if (!r.ok) return false; const Ax = Aof(X); if (ss && Ax === undefined) return false; const F = px.g * (Ax || 0);
            return devOf(px.norm, r.rigid, F, px.st, X.tags[t]) <= (F ? STRETCH_TOL : GEO_TOL);
          };
          const culprits = cand.filter((s) => !good(step([s])));
          if (culprits.length) { for (const s of culprits) add.add(s); continue; }
          let found = false;
          for (let i = 0; i < cand.length; i++) for (let j = i + 1; j < cand.length; j++) if (!good(step([cand[i], cand[j]]))) { add.add(cand[i]); add.add(cand[j]); found = true; }
          if (!found) for (const s of cand) add.add(s);
        }
      }
      for (const s of add) if (s) { depShape[t].add(s); depMove[t].delete(s); changed = true; }
      const sweepKeys = new Set(); for (const B of builds) if (!B.extra) sweepKeys.add(keyStr(B.build, dep));
      state[t] = { dep, caps, norms, sweepKeys, ss };
    }
    if (!changed) break;
  }
  if (iter >= 16) throw new Error(id + ': the coupling analysis did not converge');
  return { C, tagsAll, slotsAll, depShape, depMove, delta, A, canon, state, iter };
}

/** The platform index (the contract's PartsIndex, without file names) and the in-memory packs, from an analysis. */
export function indexOf(A, Models, src) {
  const { C, tagsAll, slotsAll, depShape, depMove, delta, A: Aprov, state } = A, { bases, builds, sw } = C, Rb = bases[R].build;
  const tags = {}, packs = [], stretchTags = [];
  for (const t of [...tagsAll].sort()) {
    const { dep, caps, norms, sweepKeys, ss } = state[t], entries = []; let stretches = false;
    for (const [k, c] of caps) {
      if (!sweepKeys.has(k)) continue; // (a combination only the random builds showed: no pack; the game falls back to the recipe there)
      const unit = c.tags[t], p = norms.get(k);
      const e = { key: k === '' && !dep.length ? [] : k.split('|'), dep, file: null, capture: c, unit: !!unit };
      if (dep.length === 1 && k === '') e.key = [''];
      if (unit) {
        e.stretch = p.st && p.g ? { from: p.st.from, to: p.st.to, gain: p.g } : null; if (e.stretch) stretches = true;
        e.norm = p.norm; e.off = p.off; e.id = packs.length; packs.push({ tag: t, entry: e });
      }
      entries.push(e);
    }
    tags[t] = { dep, packs: entries }; if (ss && stretches) stretchTags.push([t, ss]);
  }
  // anchors: what a part does to the slots it only moves, from the swaps off the reference build
  const anchors = {};
  const put = (s, part, k, v) => { if (v.every((x) => Math.abs(x) < 1e-9)) return; const a = (anchors[Models.slotKey(s, part)] = anchors[Models.slotKey(s, part)] || {}); a[k] = v.map(r6); };
  for (const t of tagsAll) for (const s of depMove[t]) if (s !== state[t].ss) for (const [part, d] of delta[t][s] || []) put(s, part, 'mount_' + t, d);
  for (const [t, s] of stretchTags) for (const [part, a] of Aprov[s]) put(s, part, 'stretch_' + t, [a, 0, 0]);
  // info: the reference builds' leaves and each swap's deltas from its base
  const ixBases = bases.map((B) => ({ build: { ...B.build }, info: B.leaves }));
  const deltas = {};
  for (const e of sw.all) {
    if (e.slot == null) continue;
    const key = Models.slotKey(e.slot, e.part), arr = deltas[key] = deltas[key] || [null, null, null];
    arr[e.base] = Models.leafDelta(bases[e.base].leaves, e.B.leaves);
  }
  const slots = [...slotsAll].sort();
  const ix = { version: Models.PARTS_INDEX_VERSION, platform: C.id, src, slots, tags, anchors, bases: ixBases, deltas, exact: {} };
  // the builds the info sums get wrong
  let exactN = 0;
  for (const B of builds) {
    const plan = Models.planBuild(ix, B.build), got = Models.infoLeaves(plan.info), d = Models.leafDelta(got, B.leaves);
    const real = {}; for (const [k, v] of Object.entries(d)) if (!(typeof v === 'number' && Math.abs(v) < 1e-9)) real[k] = v;
    if (Object.keys(real).length) { ix.exact[Models.buildKeyOf(B.build)] = real; exactN++; }
  }
  ix.totals = { builds: builds.length, packs: packs.length, exact: exactN };
  return { ix, packs };
}
const r6 = (x) => Math.round(x * 1e7) / 1e7;

/**
 * Assembles every build of the platform from the in-memory packs with the game's own planner and compares with the recipe's geometry:
 * { builds, exact (every tag equal to 1e-5 m), stretch (some tag only within the stretch tolerance), bad: [ { key, tag, dev } ] , maxDev, infoBad }.
 */
export function verify(A, ix, packs, Models) {
  const { C } = A, res = { builds: 0, exact: 0, stretch: 0, bad: [], maxDev: 0, infoBad: 0, missing: 0, extra: 0, extraBad: 0 };
  const byEntry = new Map(); for (const p of packs) byEntry.set(p.entry, p);
  for (const B of C.builds) {
    const ex = !!B.extra; if (ex) res.extra++; else res.builds++;
    const plan = Models.planBuild(ix, B.build);
    if (plan.missing) { if (ex) res.extraBad++; else { res.missing++; res.bad.push({ key: B.k, tag: plan.missing, dev: Infinity }); } continue; }
    let worst = 0, stretched = false, bad = false;
    const seen = new Set();
    for (const t of plan.tags) {
      seen.add(t.tag);
      const e = Models.pickPack(ix.tags[t.tag], B.build);
      const pk = e && e.file !== undefined ? byEntry.get(e) : null;
      const norm = pk ? pk.entry.norm : null;
      const dv = devOf(norm, t.rigid, t.stretch, e && e.stretch, B.tags[t.tag]);
      if (t.stretch && e && e.stretch) stretched = true;
      if (dv > (t.stretch ? STRETCH_TOL : GEO_TOL)) { bad = true; if (!ex) res.bad.push({ key: B.k, tag: t.tag, dev: dv }); }
      if (dv < Infinity && dv > worst) worst = dv;
    }
    for (const t of Object.keys(B.tags)) if (!seen.has(t)) { bad = true; if (!ex) res.bad.push({ key: B.k, tag: t, dev: Infinity }); }
    const got = Models.infoLeaves(plan.info); let ib = false;
    for (const k of new Set([...Object.keys(got), ...Object.keys(B.leaves)])) { const x = got[k], y = B.leaves[k]; if (!(typeof x === 'number' && typeof y === 'number' ? Math.abs(x - y) < 1e-9 : JSON.stringify(x) === JSON.stringify(y))) ib = true; }
    if (ib && !ex) res.infoBad++;
    if (ex) { if (bad) res.extraBad++; continue; }
    if (worst > res.maxDev) res.maxDev = worst;
    if (!bad) { if (stretched) res.stretch++; else res.exact++; }
  }
  return res;
}
