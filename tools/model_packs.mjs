// The coupling analysis of the per-part packs (milestone 2): given a platform, sweep its builds (tools/model_sweep.mjs), work out which slots
// shape which other slots' geometry (JOINT packs) and which only move it (ANCHORS: translations), and produce the index data and the
// in-memory packs. tools/bake_models.mjs writes them out; the same code verifies that assembling every build from them equals the procedural build.
//
// The method (per platform P, per mesh slot ("tag") t):
//   1. Build every sweep build once: its meshes per tag in world space, and its `info` as flat leaves.
//   2. Compare each single swap (slot s -> part q, from each of the 3 base builds) with its base, tag by tag (model_diff.mjs):
//        shape change  -> s is in dep(t): the pack of t is keyed by s's part (a JOINT pack when dep(t) names more than t's own slot);
//        rigid move    -> s only moves t: an ANCHOR mount_<t> on part q (the offset from the reference part's), added at assembly.
//      (Nothing stretches: a part is modelled at its own size, so a slot that follows another's length, a handguard or a bead rib on its barrel, is
//      keyed by that part: a different shape.)
//      The reference part of each slot is the one in the "loaded B" base (the fullest build): swaps from it give every part's offset.
//   3. Close the model over the sweep: pick each pack's capture build, normalise it (undo the offsets of its capture) and predict every build's
//      geometry from it; wherever that fails (offsets that don't add up), the slots that differ join dep(t). Repeat.
//   4. The info: the nearest of the 3 base builds' info plus the deltas of the differing slots' parts; the builds this gets wrong are listed (`exact`).
import { sweepOf, defOf, meshesOf, buildKey, randomBuilds } from './model_sweep.mjs';
import { diffUnits, maxDev, TOL, aligned } from './model_diff.mjs';

export const R = 2; // the reference base: loaded B
const GEO_TOL = 1e-5;       // metres: a rebuilt unit matches the recipe's within this (rigid moves)

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

/** The slots a swap changed besides its own: what pruning did to the build (a shorter barrel takes a handguard that no longer fits off, a part off its slot takes what hung on it). */
export function cascadeOf(e, base) {
  const out = new Set();
  for (const s of new Set([...Object.keys(e.build), ...Object.keys(base.build)])) if (s !== e.slot && (e.build[s] || '') !== (base.build[s] || '')) out.add(s);
  return out;
}

/** Applies a rigid offset [f,u,r] to a unit's world vertices (sign -1: undoes it): returns new units. */
export function moveUnit(unit, rigid, sign = 1) {
  if (!unit) return unit;
  const [rf, ru, rr] = rigid;
  return unit.map((m) => {
    const v = new Float32Array(m.v.length);
    for (let i = 0; i < v.length; i += 3) {
      if (sign > 0) { v[i] = m.v[i] + rr; v[i + 1] = m.v[i + 1] + ru; v[i + 2] = m.v[i + 2] - rf; }
      else { v[i] = m.v[i] - rr; v[i + 1] = m.v[i + 1] - ru; v[i + 2] = m.v[i + 2] + rf; }
    }
    return { mat: m.mat, node: m.node, v };
  });
}

/** Max deviation between `pred` = moveUnit(norm, ...) computed on the fly and `actual`. */
function devOf(norm, rigid, actual) {
  if (!norm && !actual) return 0; if (!norm || !actual || !aligned(norm, actual)) return Infinity;
  const [rf, ru, rr] = rigid; let m = 0;
  for (let i = 0; i < norm.length; i++) {
    const a = norm[i].v, b = actual[i].v;
    for (let j = 0; j < a.length; j += 3) {
      const d = Math.max(Math.abs(a[j] + rr - b[j]), Math.abs(a[j + 1] + ru - b[j + 1]), Math.abs(a[j + 2] - rf - b[j + 2]));
      if (d > m) m = d;
    }
  }
  return m;
}

/**
 * Which slots shape which tags, and the offsets: the closed model of one platform. See the file comment.
 * One kind of offset: RIGID (a part moves another slot's unit: delta[t][s][part], measured off the reference build and filled out from the other bases).
 */
export function analyze(C) {
  const { id, sw, bases, builds } = C, Rb = bases[R].build, Rp = (s) => Rb[s] || '';
  const tagsAll = new Set(); for (const B of builds) for (const t of Object.keys(B.tags)) tagsAll.add(t);
  const slotsAll = new Set(); for (const B of builds) for (const s of Object.keys(B.build)) slotsAll.add(s);
  const depShape = {}, depMove = {}, obs = {}, delta = {};
  for (const t of tagsAll) { depShape[t] = new Set(); depMove[t] = new Set(); obs[t] = []; delta[t] = {}; }
  const kinds = {}; // t|s -> { move }
  for (const e of sw.all) {
    if (e.slot == null) continue;
    const base = bases[e.base], casc = cascadeOf(e, base);
    for (const t of tagsAll) {
      if (casc.has(t)) continue; // (the slot of this tag was changed by pruning, not by the swap: its own part is why it differs)
      const d = diffUnits(base.tags[t], e.B.tags[t]);
      obs[t].push({ e, d });
      if (d.kind === 'shape') depShape[t].add(e.slot);
      else if (d.kind !== 'same') { depMove[t].add(e.slot); const k = kinds[t + '|' + e.slot] = kinds[t + '|' + e.slot] || {}; k[d.kind] = (k[d.kind] || 0) + 1; }
    }
  }
  for (const t of tagsAll) for (const s of depShape[t]) depMove[t].delete(s);
  // rigid offsets: off the reference build, then filled out through the other bases (a unit absent or inert at the reference)
  for (const t of tagsAll) {
    for (const s of depMove[t]) {
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
      const dep = [...depShape[t]].sort(), mv = [...depMove[t]];
      const dev = (b) => mv.filter((s) => (b[s] || '') !== Rp(s)).length;
      const caps = new Map();
      for (const B of builds) { const k = keyStr(B.build, dep), c = caps.get(k); if (!c || dev(B.build) < dev(c.build)) caps.set(k, B); }
      const norms = new Map(); // pack key -> { norm, off: { rigid } }
      const add = new Set();
      for (const [k, c] of caps) {
        const r = rigidOf(t, c.build); if (!r.ok) { add.add(r.slot); norms.set(k, null); continue; }
        norms.set(k, { norm: moveUnit(c.tags[t], r.rigid, -1), off: { rigid: r.rigid } });
      }
      for (const B of builds) {
        const k = keyStr(B.build, dep), p = norms.get(k), c = caps.get(k);
        let ok = !!p;
        if (ok) {
          const r = rigidOf(t, B.build); if (!r.ok) { add.add(r.slot); continue; }
          ok = devOf(p.norm, r.rigid, B.tags[t]) <= GEO_TOL;
        }
        if (!ok) {
          const cand = [...new Set([...Object.keys(B.build), ...Object.keys(c.build)])].filter((s) => (B.build[s] || '') !== (c.build[s] || '') && !depShape[t].has(s)), pref = cand.filter((s) => depMove[t].has(s));
          if (pref.length) { for (const s of pref) add.add(s); continue; }
          // which of the slots that differ is to blame? change them one at a time, then two at a time, from the capture
          const step = (slots) => { const nb = { ...c.build }; for (const s of slots) { if (B.build[s]) nb[s] = B.build[s]; else delete nb[s]; } C.GS.prune(id, nb); return C.getB(nb); };
          const good = (X) => {
            const kx = keyStr(X.build, dep), px = norms.get(kx); if (!caps.has(kx)) return true; if (!px) return false;
            const r = rigidOf(t, X.build); if (!r.ok) return false;
            return devOf(px.norm, r.rigid, X.tags[t]) <= GEO_TOL;
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
      state[t] = { dep, caps, norms, sweepKeys };
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
    const { dep, caps, norms, sweepKeys } = state[t], entries = [];
    for (const [k, c] of caps) {
      if (!sweepKeys.has(k)) continue; // (a combination only the random builds showed: no pack; the game falls back to the recipe there)
      const unit = c.tags[t], p = norms.get(k);
      const e = { key: k === '' && !dep.length ? [] : k.split('|'), dep, file: null, capture: c, unit: !!unit };
      if (dep.length === 1 && k === '') e.key = [''];
      if (unit) {
        e.norm = p.norm; e.off = p.off; e.id = packs.length; packs.push({ tag: t, entry: e });
      }
      entries.push(e);
    }
    tags[t] = { dep, packs: entries };
  }
  // anchors: what a part does to the slots it only moves, from the swaps off the reference build
  const anchors = {};
  const put = (s, part, k, v) => { if (v.every((x) => Math.abs(x) < 1e-9)) return; const a = (anchors[Models.slotKey(s, part)] = anchors[Models.slotKey(s, part)] || {}); a[k] = v.map(r6); };
  for (const t of tagsAll) for (const s of depMove[t]) for (const [part, d] of delta[t][s] || []) put(s, part, 'mount_' + t, d);
  // info: the reference builds' leaves and each swap's deltas from its base
  const ixBases = bases.map((B) => ({ build: { ...B.build }, info: B.leaves }));
  const deltas = {};
  const single = new Map(); // base|slot|part -> the swap
  for (const e of sw.all) if (e.slot != null) single.set(e.base + '|' + e.slot + '|' + (e.part || ''), e);
  for (const e of sw.all) {
    if (e.slot == null) continue;
    const key = Models.slotKey(e.slot, e.part), arr = deltas[key] = deltas[key] || [null, null, null];
    const d = Models.leafDelta(bases[e.base].leaves, e.B.leaves);
    // what pruning did besides (a barrel swap that took a handguard off, and put another on) is those slots' own swaps' deltas, which the planner adds: not this one's too
    for (const c of cascadeOf(e, bases[e.base])) {
      const e2 = single.get(e.base + '|' + c + '|' + (e.build[c] || '')); if (!e2) continue;
      for (const [k, v] of Object.entries(Models.leafDelta(bases[e.base].leaves, e2.B.leaves))) {
        if (typeof v === 'number' && (typeof d[k] === 'number' || !(k in d))) { const n = (d[k] || 0) - v; if (Math.abs(n) < 1e-12) delete d[k]; else d[k] = n; }
        else if (k in d && JSON.stringify(v) === JSON.stringify(d[k])) delete d[k];
      }
    }
    arr[e.base] = d;
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
 * { builds, exact (every tag equal to 1e-5 m), bad: [ { key, tag, dev } ] , maxDev, infoBad }.
 */
export function verify(A, ix, packs, Models) {
  const { C } = A, res = { builds: 0, exact: 0, bad: [], maxDev: 0, infoBad: 0, missing: 0, extra: 0, extraBad: 0 };
  const byEntry = new Map(); for (const p of packs) byEntry.set(p.entry, p);
  for (const B of C.builds) {
    const ex = !!B.extra; if (ex) res.extra++; else res.builds++;
    const plan = Models.planBuild(ix, B.build);
    if (plan.missing) { if (ex) res.extraBad++; else { res.missing++; res.bad.push({ key: B.k, tag: plan.missing, dev: Infinity }); } continue; }
    let worst = 0, bad = false;
    const seen = new Set();
    for (const t of plan.tags) {
      seen.add(t.tag);
      const e = Models.pickPack(ix.tags[t.tag], B.build);
      const pk = e && e.file !== undefined ? byEntry.get(e) : null;
      const norm = pk ? pk.entry.norm : null;
      const dv = devOf(norm, t.rigid, B.tags[t.tag]);
      if (dv > GEO_TOL) { bad = true; if (!ex) res.bad.push({ key: B.k, tag: t.tag, dev: dv }); }
      if (dv < Infinity && dv > worst) worst = dv;
    }
    for (const t of Object.keys(B.tags)) if (!seen.has(t)) { bad = true; if (!ex) res.bad.push({ key: B.k, tag: t, dev: Infinity }); }
    const got = Models.infoLeaves(plan.info); let ib = false;
    for (const k of new Set([...Object.keys(got), ...Object.keys(B.leaves)])) { const x = got[k], y = B.leaves[k]; if (!(typeof x === 'number' && typeof y === 'number' ? Math.abs(x - y) < 1e-9 : JSON.stringify(x) === JSON.stringify(y))) ib = true; }
    if (ib && !ex) res.infoBad++;
    if (ex) { if (bad) res.extraBad++; continue; }
    if (worst > res.maxDev) res.maxDev = worst;
    if (!bad) res.exact++;
  }
  return res;
}
