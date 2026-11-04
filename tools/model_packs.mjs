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

/** Which slots shape which tags, and the offsets: the closed model of one platform. See the file comment. */
export function analyze(C) {
  const { id, sw, bases, builds } = C, Rb = bases[R].build, Rp = (s) => Rb[s] || '';
  const tagsAll = new Set(); for (const B of builds) for (const t of Object.keys(B.tags)) tagsAll.add(t);
  const slotsAll = new Set(); for (const B of builds) for (const s of Object.keys(B.build)) slotsAll.add(s);
  const depShape = {}, depMove = {}, obs = {}, delta = {};
  for (const t of tagsAll) { depShape[t] = new Set(); depMove[t] = new Set(); obs[t] = []; delta[t] = {}; }
  for (const e of sw.all) {
    if (e.slot == null) continue;
    const base = bases[e.base];
    for (const t of tagsAll) {
      const d = diffUnits(base.tags[t], e.B.tags[t]);
      if (d.kind === 'same') { if (e.base === R) (delta[t][e.slot] = delta[t][e.slot] || {})[e.part] = { kind: 'move', d: [0, 0, 0] }; continue; }
      obs[t].push({ e, d });
      if (d.kind === 'shape') depShape[t].add(e.slot); else { depMove[t].add(e.slot); if (e.base === R) (delta[t][e.slot] = delta[t][e.slot] || {})[e.part] = d; }
    }
  }
  for (const t of tagsAll) for (const s of depShape[t]) depMove[t].delete(s);
  const offsetOf = (t, b) => {
    const rigid = [0, 0, 0]; let F = 0;
    for (const s of depMove[t]) {
      const p = b[s] || ''; if (p === Rp(s)) continue;
      const d = delta[t][s] && delta[t][s][p]; if (!d) return { ok: false, slot: s };
      if (d.kind === 'move') { rigid[0] += d.d[0]; rigid[1] += d.d[1]; rigid[2] += d.d[2]; } else F += d.front[0];
    }
    return { ok: true, rigid, F };
  };
  const state = {};
  let iter = 0;
  for (; iter < 16; iter++) {
    let changed = false;
    for (const t of tagsAll) {
      const dep = [...depShape[t]].sort(), dm = [...depMove[t]];
      // stretch regions, by pack key: from the warps observed against a base's pack
      const region = new Map();
      for (const { e, d } of obs[t]) if (d.kind === 'warp' && depMove[t].has(e.slot)) region.set(keyStr(bases[e.base].build, dep), { from: d.from, to: d.to });
      const dev = (b) => dm.filter((s) => (b[s] || '') !== Rp(s)).length;
      const caps = new Map();
      for (const B of builds) { const k = keyStr(B.build, dep), c = caps.get(k); if (!c || dev(B.build) < dev(c.build)) caps.set(k, B); }
      const norms = new Map(); // pack key -> { norm unit, off, st }
      const add = new Set();
      for (const [k, c] of caps) {
        const off = offsetOf(t, c.build), st = region.get(k) || null;
        if (!off.ok) { add.add(off.slot); norms.set(k, null); continue; }
        if (off.F && !st) { for (const s of dm) if ((c.build[s] || '') !== Rp(s) && delta[t][s] && delta[t][s][c.build[s] || ''] && delta[t][s][c.build[s] || ''].kind === 'warp') add.add(s); norms.set(k, null); continue; }
        norms.set(k, { norm: moveUnit(c.tags[t], off.rigid, off.F, st, -1), off, st });
      }
      for (const B of builds) {
        const k = keyStr(B.build, dep), p = norms.get(k), c = caps.get(k);
        let ok = !!p;
        if (ok) {
          const off = offsetOf(t, B.build);
          if (!off.ok) { add.add(off.slot); continue; }
          if (off.F && !p.st) ok = false;
          else ok = devOf(p.norm, off.rigid, off.F, p.st, B.tags[t]) <= (off.F ? STRETCH_TOL : GEO_TOL);
        }
        if (!ok) {
          const cand = [...new Set([...Object.keys(B.build), ...Object.keys(c.build)])].filter((s) => (B.build[s] || '') !== (c.build[s] || '') && !depShape[t].has(s)), pref = cand.filter((s) => depMove[t].has(s));
          if (pref.length) { for (const s of pref) add.add(s); continue; }
          // which of the slots that differ is to blame? change them one at a time, then two at a time, from the capture
          const step = (slots) => { const nb = { ...c.build }; for (const s of slots) { if (B.build[s]) nb[s] = B.build[s]; else delete nb[s]; } C.GS.prune(id, nb); return C.getB(nb); };
          const good = (X) => { const kx = keyStr(X.build, dep), px = norms.get(kx); if (!caps.has(kx)) return true; if (!px) return false; const o = offsetOf(t, X.build); return o.ok && !(o.F && !px.st) && devOf(px.norm, o.rigid, o.F, px.st, X.tags[t]) <= (o.F ? STRETCH_TOL : GEO_TOL); };
          const culprits = cand.filter((s) => !good(step([s])));
          if (culprits.length) { for (const s of culprits) add.add(s); continue; }
          let found = false;
          for (let i = 0; i < cand.length; i++) for (let j = i + 1; j < cand.length; j++) if (!good(step([cand[i], cand[j]]))) { add.add(cand[i]); add.add(cand[j]); found = true; }
          if (!found) for (const s of cand) add.add(s);
        }
      }
      for (const s of add) if (s) { depShape[t].add(s); depMove[t].delete(s); changed = true; }
      const sweepKeys = new Set(); for (const B of builds) if (!B.extra) sweepKeys.add(keyStr(B.build, dep));
      state[t] = { dep, caps, norms, region, sweepKeys };
    }
    if (!changed) break;
  }
  if (iter >= 16) throw new Error(id + ': the coupling analysis did not converge');
  return { C, tagsAll, slotsAll, depShape, depMove, delta, state, iter };
}

/** The platform index (the contract's PartsIndex, without file names) and the in-memory packs, from an analysis. */
export function indexOf(A, Models, src) {
  const { C, tagsAll, slotsAll, depShape, depMove, delta, state } = A, { bases, builds, sw } = C, Rb = bases[R].build;
  const tags = {}, packs = [];
  for (const t of [...tagsAll].sort()) {
    const { dep, caps, norms, region, sweepKeys } = state[t], entries = [];
    for (const [k, c] of caps) {
      if (!sweepKeys.has(k)) continue; // (a combination only the random builds showed: no pack; the game falls back to the recipe there)
      const unit = c.tags[t], p = norms.get(k);
      const e = { key: k === '' && !dep.length ? [] : k.split('|'), dep, file: null, capture: c, unit: !!unit };
      if (dep.length === 1 && k === '') e.key = [''];
      if (unit) {
        const st = region.get(k), anyStretch = [...depMove[t]].some((s) => Object.values(delta[t][s] || {}).some((d) => d.kind === 'warp'));
        e.stretch = st && anyStretch ? { from: st.from, to: st.to, gain: 1 } : null;
        e.norm = p.norm; e.off = p.off; e.id = packs.length; packs.push({ tag: t, entry: e });
      }
      entries.push(e);
    }
    tags[t] = { dep, packs: entries };
  }
  // anchors: what a part does to the slots it only moves, from the swaps off the reference build
  const anchors = {};
  for (const t of tagsAll) for (const s of depMove[t]) for (const [part, d] of Object.entries(delta[t][s] || {})) {
    const a = (anchors[Models.slotKey(s, part)] = anchors[Models.slotKey(s, part)] || {});
    if (d.kind === 'move') a['mount_' + t] = d.d.map(r6); else a['stretch_' + t] = d.front.map(r6);
  }
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
