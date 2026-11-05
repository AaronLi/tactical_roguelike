// The coupling analysis of the per-part packs (milestone 2): given a platform, build a set of its builds, work out which slots shape which other
// slots' geometry (JOINT packs) and which only move it (ANCHORS: translations), which slots shape which `info` leaves (INFO TABLES), and produce the
// index data and the in-memory packs. tools/bake_models.mjs writes them out; the same code verifies that assembling every build from them equals the recipe.
//
// The method (per platform P):
//   1. Build every sweep build (tools/model_sweep.mjs) and a set of random builds with 2 to 6 parts changed at once: its meshes per mesh slot (tag) in
//      world space, and its `info` as flat leaves.
//   2. GEOMETRY. For each tag t, compare each single swap (slot s -> part q, from each of the 3 base builds) with its base (model_diff.mjs):
//        shape change  -> s is in dep(t): the pack of t is keyed by s's part (a JOINT pack when dep(t) names more than t's own slot);
//        rigid move    -> s only moves t: an ANCHOR mount_<t> on part q (the offset from the reference part's), added at assembly.
//      Then close the model over every build we have: pick each pack's capture build, normalise it (undo the offsets of its capture) and predict every
//      build's geometry from it; wherever that fails (offsets that do not add up, interactions between two parts changed at once) the slots that
//      differ join dep(t) (blame is found by changing them one at a time, then two) and everything repeats until all builds are reproduced.
//   3. INFO. Each leaf of `info` is a function of the parts in some slots: dep(leaf) = the slots whose swap changed it, closed the same way over every
//      build (two builds with the same parts in dep(leaf) must agree on the leaf; if they do not, the slots that differ are blamed). Leaves with the same
//      dep are one TABLE: rows keyed by the parts in the dep slots, holding the leaves' values. No arithmetic: a leaf that is a min / max / clamp of
//      several parts is simply tabulated over them.
//   4. COVERAGE BY CONSTRUCTION. Every tag's packs and every info table has a row for EVERY valid combination of parts in its dep slots (the product
//      of what each slot can hold, kept where a real build has it), not just the ones the sweep happened to show: cover() builds a build for each
//      combination not yet seen, the analysis runs again (a new build can show a new dependency) and so on to a fixed point.
import { sweepOf, defOf, meshesOf, buildKey, randomBuilds, providerBuilds } from './model_sweep.mjs';
import { diffUnits, TOL, aligned } from './model_diff.mjs';

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

/**
 * The builds of a platform: { sw, memo (key -> B), bases, all() } with B = { k, build, tags: { tag: [{ mat, node, v }] }, leaves }.
 * `learn` random builds (2 to 6 parts changed at once) are added beyond the sweep: the analysis learns the interactions they show.
 * Builds are added as the analysis needs them (getB): all() is every build built so far.
 */
export function collect(env, Models, id, { learn = 0, seed = 7001, extra = [] } = {}) {
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
  for (const b of providerBuilds(GS, id, sw.bases, seed + 17, new Set(memo.keys()))) getB(b);
  for (const b of extra) getB(b); // (the edge cases and regressions, tools/model_cases.mjs: the analysis learns from them and they are verified with the rest)
  if (learn) for (const b of randomBuilds(GS, id, sw.bases, learn, seed, new Set(memo.keys()), 2, 6)) getB(b);
  return { id, sw, memo, getB, bases, all: () => [...memo.values()], nSweep, GS, Models, noBuild: new Set() };
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
export function devOf(norm, rigid, actual) {
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
 * Which slots shape which tags, and the offsets: the closed model of one platform's geometry. See the file comment.
 * One kind of offset: RIGID (a part moves another slot's unit: delta[t][s][part], measured off the reference build and filled out from the other bases).
 */
export function analyze(C) {
  const { id, sw, bases } = C, builds = C.all(), Rb = bases[R].build, Rp = (s) => Rb[s] || '';
  const tagsAll = new Set(); for (const B of builds) for (const t of Object.keys(B.tags)) tagsAll.add(t);
  const slotsAll = new Set(); for (const B of builds) for (const s of Object.keys(B.build)) slotsAll.add(s);
  const depShape = {}, depMove = {}, obs = {}, delta = {};
  for (const t of tagsAll) { depShape[t] = new Set(); depMove[t] = new Set(); obs[t] = []; delta[t] = {}; }
  for (const e of sw.all) {
    if (e.slot == null) continue;
    const base = bases[e.base], casc = cascadeOf(e, base);
    for (const t of tagsAll) {
      if (casc.has(t)) continue; // (the slot of this tag was changed by pruning, not by the swap: its own part is why it differs)
      const d = diffUnits(base.tags[t], e.B.tags[t]);
      obs[t].push({ e, d });
      if (d.kind === 'shape') depShape[t].add(e.slot);
      else if (d.kind !== 'same') depMove[t].add(e.slot);
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
  const state = {}, droppedEn = new Set(), pendingEn = new Set();
  let iter = 0;
  for (; iter < 24; iter++) {
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
          // A slot that only ENABLES the tag's own slot (a pistol chassis opens the foregrip slot: no foregrip can be set without it) is not blamed the first time: the
          // tag is keyed by its own slot's part alone, which holds wherever that part can be fitted at all. (If the closure fails again with it, it stays blamed.)
          const own = t.includes('@') && slotsAll.has(t.split('@')[1]) ? t.split('@')[1] : t.split('@')[0];
          const dropEnablers = (set) => {
            if (set.length < 2 || !set.includes(own) || !(C.GS.PLATFORMS[id] && C.GS.PLATFORMS[id].arch === 'pistol')) return set; // (pistols only so far: on the rifles it broke the ppsh's tacL, whose rail does depend on the handguard that opens it)
            const full = step(set);
            return set.filter((s) => {
              if (s === own || droppedEn.has(t + '|' + s)) return true;
              const without = step(set.filter((x) => x !== s));
              const enabler = (without.build[own] || '') !== (B.build[own] || '') && (full.build[own] || '') === (B.build[own] || '');
              if (enabler) pendingEn.add(t + '|' + s);
              return !enabler;
            });
          };
          const culprits = cand.filter((s) => !good(step([s])));
          if (process.env.DBGDEP === t) console.log('BLAME', t, 'cand', cand.join(), 'culprits', culprits.join(), JSON.stringify(B.build));
          if (culprits.length) { for (const s of dropEnablers(culprits)) add.add(s); continue; }
          for (const s of dropEnablers(shrink(cand, (slots) => !good(step(slots))) || cand)) add.add(s);
        }
      }
      for (const k2 of pendingEn) droppedEn.add(k2); pendingEn.clear();
      for (const s of add) if (s) { depShape[t].add(s); depMove[t].delete(s); changed = true; }
      state[t] = { dep, caps, norms };
    }
    if (!changed) break;
  }
  if (iter >= 24) throw new Error(id + ': the coupling analysis did not converge');
  return { C, tagsAll, slotsAll, depShape, depMove, delta, state, iter };
}

/** Whether a leaf has the same value in two builds (numbers within a nanometre: the recipe's own float noise; a leaf one build has and the other has not differs). */
const leafSame = (A, B, k) => {
  const ha = k in A.leaves, hb = k in B.leaves; if (ha !== hb) return false;
  const x = A.leaves[k], y = B.leaves[k];
  return typeof x === 'number' && typeof y === 'number' ? Math.abs(x - y) <= 1e-9 : JSON.stringify(x) === JSON.stringify(y);
};

/**
 * The smallest set of the slots `cand` that, changed from one build toward another, still changes what `differs(slots)` looks at (delta debugging: all of them
 * change it; drop each in turn that the change survives without). null when changing all of them does not change it.
 */
function shrink(cand, differs) {
  if (!differs(cand)) return null;
  let set = [...cand];
  for (const s of cand) { if (set.length === 1) break; const t = set.filter((x) => x !== s); if (differs(t)) set = t; }
  return set;
}

/**
 * The info leaves' dependencies: which slots shape which leaf, closed over every build (see the file comment, 3). Returns { clusters: [{ dep, leaves }], leavesAll, depOf }.
 * Leaves with the same dep are one cluster (one table).
 */
export function analyzeInfo(C) {
  const { id, sw, bases, GS } = C;
  const leavesAll = new Set(); for (const B of C.all()) for (const k of Object.keys(B.leaves)) leavesAll.add(k);
  const dep = new Map([...leavesAll].map((k) => [k, new Set()]));
  for (const e of sw.all) {
    if (e.slot == null) continue;
    const base = bases[e.base]; // (what a swap pruned besides its own slot is not blamed: the closure below finds a leaf that really depends on it)
    for (const k of leavesAll) if (!leafSame(base, e.B, k)) dep.get(k).add(e.slot);
  }
  /** The slots to blame when two builds with the same parts in `D` disagree on leaf k: the smallest set that, changed from one build toward the other, changes the leaf. */
  const blame = (X, Y, D, k) => {
    const cand = [...new Set([...Object.keys(X.build), ...Object.keys(Y.build)])].filter((s) => (X.build[s] || '') !== (Y.build[s] || '') && !D.includes(s));
    if (cand.length <= 1) return cand;
    const step = (from, to, slots) => { const nb = { ...from.build }; for (const s of slots) { if (to.build[s]) nb[s] = to.build[s]; else delete nb[s]; } GS.prune(id, nb); return C.getB(nb); };
    let best = null;
    for (const [from, to] of [[X, Y], [Y, X]]) { const r = shrink(cand, (slots) => !leafSame(step(from, to, slots), from, k)); if (r && (!best || r.length < best.length)) best = r; }
    if (process.env.DEBUG_LEAF === k) console.log('blame', k, 'D=', D.join('+'), '->', (best || cand).join('+'), '\n  X', JSON.stringify(X.build), X.leaves[k], '\n  Y', JSON.stringify(Y.build), Y.leaves[k]);
    return best || cand;
  };
  let iter = 0;
  for (; iter < 40; iter++) {
    let changed = false;
    const builds = C.all();
    for (const k of leavesAll) {
      const D = [...dep.get(k)].sort(), seen = new Map();
      for (const B of builds) {
        const key = keyStr(B.build, D), s = seen.get(key);
        if (!s) { seen.set(key, B); continue; }
        if (leafSame(s, B, k)) continue;
        for (const c of blame(s, B, D, k)) if (!dep.get(k).has(c)) { dep.get(k).add(c); changed = true; }
        break;
      }
    }
    if (!changed) break;
  }
  if (iter >= 40) throw new Error(id + ': the info analysis did not converge');
  const groups = new Map();
  for (const k of [...leavesAll].sort()) { const d = [...dep.get(k)].sort(), g = d.join('|'); if (!groups.has(g)) groups.set(g, { dep: d, leaves: [] }); groups.get(g).leaves.push(k); }
  return { clusters: [...groups.values()], leavesAll, depOf: dep };
}

/** A text that changes when the analysis learns a new dependency (a tag's dep slots, the slots that only move it, the info tables' dep slots and leaves). */
export const depSig = (A, I) => JSON.stringify([Object.entries(A.state).map(([t, s]) => t + ':' + s.dep), Object.entries(A.depMove).map(([t, s]) => t + ':' + [...s].sort()), I.clusters.map((c) => c.dep.join('+') + ':' + c.leaves.join(','))]);

/**
 * `n` more random builds (2 to 10 parts changed at once, from the bases and from a spread of the builds so far, so that parts that open slots are on them), a
 * different seed each time: the analysis is run over them to see whether it already predicts them. Returns the number added.
 */
export function addRandom(C, n, seed) {
  const starts = [...C.sw.bases]; { let i = 0; for (const B of C.all()) if (!(i++ % Math.max(1, Math.floor(C.memo.size / 80)))) starts.push(B.build); }
  let added = 0;
  for (const b of randomBuilds(C.GS, C.id, starts, n, seed, new Set(C.memo.keys()), 2, 10)) { C.getB(b); added++; }
  return added;
}

/** What each build slot can hold on this platform: every part that fits it in any build seen (and '' where the slot is optional). { slot: [part ids] } */
export function optionsOf(C) {
  const { id, GS } = C, opts = {}, done = new Set();
  const lists = [...C.all().map((B) => B.build)];
  for (const b of lists) {
    for (const sl of GS.slotsOf(id, b)) {
      const k = sl.slot + '|' + sl.mount + '|' + (b.barrel || '');
      const set = opts[sl.slot] || (opts[sl.slot] = new Set());
      if (!sl.req) set.add('');
      if (done.has(k)) continue; done.add(k);
      for (const p of GS.compatible(sl.mount)) if (GS.fitsSlot(sl, p, id, b)) set.add(p.id);
    }
  }
  return Object.fromEntries(Object.entries(opts).map(([s, set]) => [s, [...set].sort()]));
}

/**
 * COVERAGE. Every tag's packs and every info table needs a row for each valid combination of the parts in its dep slots. For each combination not
 * shown by a build yet, build one (starting from a base or a random build, set the parts, prune; it counts when every part stayed) and add it: returns the number of
 * builds added. `stats` collects the combination counts per target. Combinations no build can hold (a handguard that fits no barrel here...) are never found, and not needed.
 */
export function cover(C, A, I, stats = {}) {
  const { id, GS } = C, opts = optionsOf(C);
  const targets = [...Object.entries(A.state).map(([t, st]) => ({ name: 'tag ' + t, dep: st.dep })), ...I.clusters.map((c, i) => ({ name: 'info ' + c.dep.join('+') || 'info', dep: c.dep }))];
  const found = targets.map(() => new Set());
  const mark = (B) => targets.forEach((tg, i) => found[i].add(keyStr(B.build, tg.dep)));
  for (const B of C.all()) mark(B);
  const starts = [...C.bases.map((B) => B.build)];
  { let n = 0; for (const B of C.all()) if (!(n++ % Math.max(1, Math.floor(C.memo.size / 60)))) starts.push(B.build); } // (a spread of the builds so far: parts that only fit next to other parts)
  let added = 0;
  const attempt = (dep, parts) => {
    // (the starts that already agree with the most of the parts, and the bases)
    const ranked = starts.map((st, i) => [i < C.bases.length ? 99 : dep.reduce((a, s, j) => a + ((st[s] || '') === parts[j] ? 1 : 0), 0), st]).sort((a, b) => b[0] - a[0]).slice(0, 12);
    for (const [, st] of ranked) {
      const nb = { ...st };
      dep.forEach((s, i) => { if (parts[i]) nb[s] = parts[i]; else delete nb[s]; });
      GS.prune(id, nb);
      if (dep.every((s, i) => (nb[s] || '') === parts[i])) return nb;
    }
    return null;
  };
  targets.forEach((tg, ti) => {
    const lists = tg.dep.map((s) => opts[s] || ['']), total = lists.reduce((a, l) => a * l.length, 1);
    stats[tg.name] = Math.max(stats[tg.name] || 0, total);
    if (total > 400000) throw new Error(`${id}: ${tg.name} depends on ${tg.dep.join(', ')}: ${total} combinations`);
    const idx = tg.dep.map(() => 0);
    for (let n = 0; n < total; n++) {
      const parts = idx.map((j, i) => lists[i][j]), key = parts.join('|');
      if (!found[ti].has(key)) {
        const ck = tg.dep.join('+') + '#' + key, nb = C.noBuild.has(ck) ? null : attempt(tg.dep, parts);
        if (nb) { const B = C.getB(nb); if (!B.cover) { B.cover = true; added++; } mark(B); } else { found[ti].add(key); C.noBuild.add(ck); } // (not a combination any build holds)
      }
      for (let i = idx.length - 1; i >= 0; i--) { if (++idx[i] < lists[i].length) break; idx[i] = 0; }
    }
  });
  return added;
}

/** The platform index (the contract's PartsIndex, without file names) and the in-memory packs, from an analysis. */
export function indexOf(A, I, Models, src) {
  const { C, tagsAll, slotsAll, depShape, depMove, delta, state } = A, builds = C.all();
  const tags = {}, packs = [];
  for (const t of [...tagsAll].sort()) {
    const { dep, caps, norms } = state[t], entries = [];
    for (const [k, c] of caps) {
      const unit = c.tags[t], p = norms.get(k);
      const e = { key: k === '' && !dep.length ? [] : k.split('|'), dep, file: null, capture: c, unit: !!unit };
      if (dep.length === 1 && k === '') e.key = [''];
      if (unit) {
        e.norm = p.norm; e.off = p.off; e.id = packs.length; packs.push({ tag: t, entry: e });
        e.nodes = [...new Set(unit.map((m) => m.node).filter((n) => n.startsWith('part_')))].sort(); // (the animated parts the pack holds meshes of)
      }
      entries.push(e);
    }
    tags[t] = { dep, packs: entries };
  }
  // anchors: what a part does to the slots it only moves, from the swaps off the reference build
  const anchors = {};
  const put = (s, part, k, v) => { if (v.every((x) => Math.abs(x) < 1e-9)) return; const a = (anchors[Models.slotKey(s, part)] = anchors[Models.slotKey(s, part)] || {}); a[k] = v.map(r6); };
  for (const t of tagsAll) for (const s of depMove[t]) for (const [part, d] of delta[t][s] || []) put(s, part, 'mount_' + t, d);
  // info: one table per cluster of leaves with the same dep slots; a row for every combination of parts a build showed
  const info = I.clusters.map((c) => {
    const rows = new Map();
    for (const B of builds) { const k = keyStr(B.build, c.dep); if (!rows.has(k)) rows.set(k, { key: c.dep.length ? k.split('|') : [], v: c.leaves.map((l) => (l in B.leaves ? B.leaves[l] : { del: 1 })) }); }
    return { dep: c.dep, leaves: c.leaves, rows: [...rows.values()] };
  });
  const slots = [...slotsAll].sort();
  const ix = { version: Models.PARTS_INDEX_VERSION, platform: C.id, src, slots, tags, anchors, info };
  ix.totals = { builds: builds.length, packs: packs.length, infoRows: info.reduce((a, t) => a + t.rows.length, 0) };
  return { ix, packs };
}
const r6 = (x) => Math.round(x * 1e7) / 1e7;

/**
 * Assembles every build of the platform from the in-memory packs with the game's own planner and compares with the recipe's geometry and info:
 * { builds, exact (every tag equal to 1e-5 m), bad: [ { key, tag, dev } ], maxDev, infoBad: [ { key, leaf } ], approx }.
 */
export function verify(A, ix, packs, Models) {
  const { C } = A, res = { builds: 0, exact: 0, bad: [], maxDev: 0, infoBad: [], approx: 0 };
  const byEntry = new Map(); for (const p of packs) byEntry.set(p.entry, p);
  for (const B of C.all()) {
    res.builds++;
    const plan = Models.planBuild(ix, B.build);
    if (plan.approx) { res.approx++; res.bad.push({ key: B.k, tag: plan.approx, dev: Infinity }); continue; }
    let worst = 0, bad = false;
    const seen = new Set();
    for (const t of plan.tags) {
      seen.add(t.tag);
      const e = Models.pickPack(ix.tags[t.tag], B.build);
      const pk = e && e.file !== undefined ? byEntry.get(e) : null;
      const norm = pk ? pk.entry.norm : null;
      const dv = devOf(norm, t.rigid, B.tags[t.tag]);
      if (dv > GEO_TOL) { bad = true; res.bad.push({ key: B.k, tag: t.tag, dev: dv, pick: e && e.key, dep: ix.tags[t.tag].dep, hasNorm: !!norm, hasUnit: !!B.tags[t.tag] }); }
      if (dv < Infinity && dv > worst) worst = dv;
    }
    for (const t of Object.keys(B.tags)) if (!seen.has(t)) { bad = true; res.bad.push({ key: B.k, tag: t, dev: Infinity }); }
    const got = Models.infoLeaves(cleanInfo(Object.fromEntries(Object.entries(plan.info).filter(([k]) => k !== 'mounts')))); // (anim and mounts come from the packs and anchors)
    for (const k of new Set([...Object.keys(got), ...Object.keys(B.leaves)])) { const x = got[k], y = B.leaves[k]; if (!(typeof x === 'number' && typeof y === 'number' ? Math.abs(x - y) <= 2e-9 : JSON.stringify(x) === JSON.stringify(y))) res.infoBad.push({ key: B.k, leaf: k }); }
    if (worst > res.maxDev) res.maxDev = worst;
    if (!bad) res.exact++;
  }
  return res;
}
