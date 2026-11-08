// THE PER-PART MODEL of a platform (docs/models.md "Per-part bake"): what the baker learns from a LINEAR set of builds (every part fitted once from each
// base build, every part of a slot that another part opens fitted once on it), with no combination of parts enumerated, and the rules it is made of.
//
//   PIECES. Every tag (a mesh slot, or slot@anchor for a piece placed by another part: optic@barrel, optic@mount...) is drawn by ONE part, its provider: the
//   first filled slot of the tag's provider list (a dot on a riser before the riser) or, with no list, the platform itself (the base). The piece is that
//   part's shape alone. Where a part truly draws a few shapes, they are VARIANTS, chosen by a property of another part (the barrel's sight rise, the bore a
//   collar clamps round); a piece may be STRETCHED along the bore to a length (a bead's rib, as long as the barrel runs).
//   PLACEMENT. Where a piece sits is the SUM of the offsets the build's parts give it (the provider's own slot gives none): an offset may apply only while
//   another slot is filled (a barrel moves the sight forward only when a magnifier is behind it: `mount_<tag>?<slot>`), and one slot's offsets may be
//   CAPPED by another part (a railmount at the handguard's end, but no further than the barrel's end allows).
//   INFO. Every leaf of `info` is provided by a part (the first filled slot of the leaf's provider list whose part gives it), or the platform; a part's
//   value moves with it: plus the sum of the other parts' offsets for the leaf (solved exactly from the leaf's own values), one leaf may be the max of
//   that and another part's own value (a pistol chassis's muzzle, ahead of a short slide's).
//
// learnPlatform() finds all of it from the builds and says what it could not explain (a bake failure: a recipe that draws one piece from two parts must split
// it with k.at(), or the rule is not one of these). predict*() are the runtime rules (js/glb.ts planBuild does the same from the index).
import { sweepOf, defOf, buildKey, randomBuilds } from './model_sweep.mjs';

/** info without the live references (anim) and the viewmodel-only crossbow materials, as plain JSON. */
export function cleanInfo(info) {
  const o = {};
  for (const [k, v] of Object.entries(info)) {
    if (k === 'anim' || k === 'quarrelMats') continue;
    try { o[k] = JSON.parse(JSON.stringify(v, (kk, vv) => (vv && vv.isObject3D ? undefined : vv))); } catch (e) { /* not data */ }
  }
  return o;
}

export const SHAPE_TOL = 2e-6; // metres: the recipe's own float noise (two units are the same shape when every vertex agrees to this after the move)
export const INFO_TOL = 1e-9;
/** Who owns the pivot of a part_ node (the tag whose piece carries it); the rest belong to the receiver. (as tools/model_emit.mjs PART_OWNER) */
export const PART_OWNER = { mag: 'mag', slide: 'slide', ch: 'charging', magn: 'magnifier', pump: 'pump', brk: 'barrel', barrel: 'barrel', spin: 'barrel', bipod: 'base', stringCocked: 'limbs', stringSlack: 'limbs' };
export const ownerTag = (node) => (node.startsWith('part_') ? PART_OWNER[node.slice(5)] || 'base' : 'base');
const DEL = '\u0000del';
export const isDel = (v) => v === DEL;

/**
 * A built gun as units per tag: { tag: { meshes: [{ mat, node, v (Float64Array, world) }], piv: [[x, y, z] of each part_ node this tag owns and has meshes in, then each
 * group node], pn: [names] } }.
 */
export function unitsOf(group, info) {
  group.updateMatrixWorld(true);
  const animOf = new Map(); for (const [k, v] of Object.entries(info.anim || {})) if (v && v.isObject3D) animOf.set(v, k);
  const out = {}, wpos = (o) => { const e = o.matrixWorld.elements; return [e[12], e[13], e[14]]; };
  group.traverse((o) => {
    if (!o.isMesh) return;
    const tag = (o.userData.slot || 'base') + (o.userData.at ? '@' + o.userData.at : '');
    let node = '', p = o.parent, grp = null, anode = null;
    while (p && p !== group) { const a = animOf.get(p); if (a) { node = 'part_' + a; anode = p; break; } if (!grp) grp = p; p = p.parent; }
    const pos = o.geometry.attributes.position, idx = o.geometry.index, e = o.matrixWorld.elements, n = idx ? idx.count : pos.count, v = new Float64Array(n * 3);
    for (let i = 0; i < n; i++) {
      const j = idx ? idx.getX(i) : i, x = pos.getX(j), y = pos.getY(j), z = pos.getZ(j);
      v[i * 3] = e[0] * x + e[4] * y + e[8] * z + e[12]; v[i * 3 + 1] = e[1] * x + e[5] * y + e[9] * z + e[13]; v[i * 3 + 2] = e[2] * x + e[6] * y + e[10] * z + e[14];
    }
    const m = o.material || {}, u = out[tag] || (out[tag] = { meshes: [], piv: [], pn: [] });
    u.meshes.push({ mat: m.name || ('m_' + (m.color ? m.color.getHexString() : '')), node, v });
    if (node && ownerTag(node) === tag && !u.pn.includes(node)) { u.pn.push(node); u.piv.push(wpos(anode)); }
    if (grp && !u.pn.includes(grp.uuid)) { u.pn.push(grp.uuid); u.piv.push(wpos(grp)); }
  });
  for (const u of Object.values(out)) u.pn = u.pn.map((x) => (/^[0-9a-f-]{36}$/i.test(x) ? 'group' : x)); // (a group's identity is its place in the list)
  return out;
}

/** The text that two units of the same shape share: materials, nodes and sizes. */
export const sigOf = (u) => u.meshes.map((m) => m.mat + ':' + m.node + ':' + m.v.length).join(',') + '|' + u.pn.join(',');
/** The rear (largest z: least forward) of a unit's vertices. */
const rearZ = (u) => { let z = -Infinity; for (const m of u.meshes) for (let i = 2; i < m.v.length; i += 3) if (m.v[i] > z) z = m.v[i]; return z; };
const lenZ = (u) => { let lo = Infinity, hi = -Infinity; for (const m of u.meshes) for (let i = 2; i < m.v.length; i += 3) { if (m.v[i] < lo) lo = m.v[i]; if (m.v[i] > hi) hi = m.v[i]; } return hi - lo; };
/**
 * How unit b is unit a placed: { d: [dx, dy, dz], s } (glTF axes): every vertex of a moved by d, and (s != 1: STRETCHED) its distance forward of a's rear scaled by s about
 * that rear (a's rear lands at its rear + dz). null when b is not a placed (or `stretch`-ed) a.
 */
export function matchOf(a, b, stretch = true, tol = SHAPE_TOL) {
  if (sigOf(a) !== sigOf(b)) return null;
  const za = rearZ(a), zb = rearZ(b);
  let dx = 0, dy = 0, found = false;
  for (const m of a.meshes) if (m.v.length) { found = true; break; }
  if (found) { const i = a.meshes.findIndex((m) => m.v.length); dx = b.meshes[i].v[0] - a.meshes[i].v[0]; dy = b.meshes[i].v[1] - a.meshes[i].v[1]; }
  else if (a.piv.length) { dx = b.piv[0][0] - a.piv[0][0]; dy = b.piv[0][1] - a.piv[0][1]; }
  const tryS = (s, dz) => {
    for (let i = 0; i < a.meshes.length; i++) { const x = a.meshes[i].v, y = b.meshes[i].v; for (let j = 0; j < x.length; j += 3) { if (Math.abs(x[j] + dx - y[j]) > tol || Math.abs(x[j + 1] + dy - y[j + 1]) > tol || Math.abs(za + dz + (x[j + 2] - za) * s - y[j + 2]) > tol) return false; } }
    for (let i = 0; i < a.piv.length; i++) if (Math.abs(a.piv[i][0] + dx - b.piv[i][0]) > tol || Math.abs(a.piv[i][1] + dy - b.piv[i][1]) > tol || Math.abs(za + dz + (a.piv[i][2] - za) * s - b.piv[i][2]) > tol) return false;
    return true;
  };
  if (!isFinite(za)) { const dz = a.piv.length ? b.piv[0][2] - a.piv[0][2] : 0; return tryS(1, dz) ? { d: [dx, dy, dz], s: 1 } : null; }
  if (tryS(1, zb - za)) return { d: [dx, dy, zb - za], s: 1 };
  if (!stretch) return null;
  // (the scale from the first vertex and the one furthest along the bore from it: a negative one when the run is reversed, as a rib on a barrel ending behind it)
  const i0 = a.meshes.findIndex((m) => m.v.length); if (i0 < 0) return null;
  let bi = -1, bj = -1, far = 0;
  for (let i = 0; i < a.meshes.length; i++) for (let j = 2; j < a.meshes[i].v.length; j += 3) { const dz = Math.abs(a.meshes[i].v[j] - a.meshes[i0].v[2]); if (dz > far) { far = dz; bi = i; bj = j; } }
  if (far < 1e-6) return null;
  const s = (b.meshes[bi].v[bj] - b.meshes[i0].v[2]) / (a.meshes[bi].v[bj] - a.meshes[i0].v[2]), c = b.meshes[i0].v[2] - s * (a.meshes[i0].v[2] - za);
  return tryS(s, c - za) ? { d: [dx, dy, c - za], s } : null;
}
const toFur = (d) => [-d[2], d[1], d[0]];

/**
 * The builds the per-part model is learnt from (linear in the parts): the sweep (every part once from each base: tools/model_sweep.mjs), each part that opens slots
 * fitted once on each base, and every part of a slot so opened fitted once (on the first build that opened it), plus `extra` (the edge cases).
 */
export function collectBuilds(env, Models, id, { extra = [], sweepBases = [] } = {}) {
  const { G, GS, GM } = env, sw = sweepOf(GS, id), memo = new Map();
  const getB = (build) => {
    const b = { ...build }; GS.prune(id, b);
    const k = buildKey(b); let x = memo.get(k); if (x) return x;
    const { group, info } = GM.display(defOf(G, id, b));
    x = { k, build: b, tags: unitsOf(group, info), leaves: Models.infoLeaves(cleanInfo(info)) }; memo.set(k, x); return x;
  };
  const bases = sw.bases.map(getB);
  for (const e of sw.list) getB(e.build);
  for (const b of openerBuilds(GS, id, sw.bases)) getB(b);
  for (const b of extra) getB(b);
  // more bases (every slot filled with its LAST part; every optional slot empty): each part is then seen beside other parts too, so what it provides and
  // what only follows the parts around it can be told apart
  for (const b0 of sweepBases) for (const b of sweepFrom(GS, id, b0)) getB(b);
  // a piece no base build has (the front sight of an iron sight when the bases carry a red dot) is seen with the default barrel only: one build that has it
  // becomes a base of its own, and every part of every slot is fitted once from it, so what moves the piece shows (one such base per tag: linear)
  const swept = new Set(sw.bases.map(buildKey));
  for (let round = 0; round < 2; round++) for (const t of [...new Set(C0().flatMap((B) => Object.keys(B.tags)))].sort()) {
    if (bases.some((B) => B.tags[t]) || [...swept].some((k) => memo.get(k) && memo.get(k).tags[t])) continue;
    const src = sw.list.map((e) => memo.get(buildKey(e.build))).find((B) => B && B.tags[t]) || C0().find((B) => B.tags[t]);
    if (!src) continue;
    swept.add(src.k);
    for (const b of sweepFrom(GS, id, src.build)) getB(b);
  }
  // CONTRAST: for each info leaf, the slots whose part alone changes it; each part of one of them seen beside two parts of each other one (a foregrip that
  // gives the support hand and a bipod that leaves it to the barrel look alike next to one barrel)
  // (beside one that gives the leaf another value, where one does: up to a few tries a part, so still one or two builds a part)
  const dep = leafDeps(C0()), pairs = new Map();
  for (const [l, D] of dep) for (const s of D) for (const s2 of D) if (s !== s2) { const k = s + '|' + s2; if (!pairs.has(k)) pairs.set(k, []); pairs.get(k).push(l); }
  const vkey = (B, ls) => ls.map((l) => JSON.stringify(B.leaves[l])).join('|');
  for (const [pr, ls] of pairs) {
    const [s, s2] = pr.split('|'), seen = new Map();
    // (q's builds by the part in s2, among those where only s2 differs: two parts of s2 with different values is enough)
    const rest = (B) => Object.keys({ ...B.build }).filter((x) => x !== s2).sort().map((x) => x + '=' + B.build[x]).join(',');
    for (const B of C0()) { const q = B.build[s]; if (!q) continue; if (!seen.has(q)) seen.set(q, { B, by: new Map() }); const m = seen.get(q).by, k = rest(B); if (!m.has(k)) m.set(k, new Map()); m.get(k).set(B.build[s2] || '', vkey(B, ls)); }
    for (const [q, { B, by }] of seen) {
      if ([...by.values()].some((m) => new Set(m.values()).size > 1)) continue;
      const vals = new Set([...(by.get(rest(B)) || new Map()).values()]);
      const sl = GS.slotsOf(id, B.build).find((x) => x.slot === s2); if (!sl) continue;
      let tries = 0;
      for (const p of [...GS.compatible(sl.mount).filter((x) => GS.fitsSlot(sl, x, id, B.build)).map((x) => x.id), ...(sl.req ? [] : [''])]) {
        if ((B.build[s2] || '') === p) continue;
        const nb = { ...B.build }; if (p) nb[s2] = p; else delete nb[s2];
        const B2 = getB(nb); if (B2.build[s] !== q) continue;
        if (!vals.has(vkey(B2, ls)) || ++tries >= 4) break;
      }
    }
  }
  function C0() { return [...memo.values()]; }
  return { id, sw, memo, getB, bases, all: () => [...memo.values()], GS, G };
}

/** For each info leaf, the slots whose part alone changes it (two builds that differ in that slot only). */
export function leafDeps(builds) {
  const slotsAll = [...new Set(builds.flatMap((B) => Object.keys(B.build)))].sort();
  const leavesAll = [...new Set(builds.flatMap((B) => Object.keys(B.leaves)))].sort();
  const val = (B, l) => (l in B.leaves ? B.leaves[l] : DEL);
  const dep = new Map(leavesAll.map((l) => [l, new Set()]));
  for (const s of slotsAll) {
    const groups = new Map();
    for (const B of builds) { const k = slotsAll.filter((x) => x !== s).map((x) => B.build[x] || '').join('|'); if (!groups.has(k)) groups.set(k, []); groups.get(k).push(B); }
    for (const g of groups.values()) if (g.length > 1) for (const l of leavesAll) if (!dep.get(l).has(s) && g.some((B) => !leafSame(val(B, l), val(g[0], l)))) dep.get(l).add(s);
  }
  return dep;
}

/** Every single swap from one build: each slot set to each part that fits it, and each optional slot emptied (pruned). */
export function sweepFrom(GS, id, base) {
  const out = [];
  for (const s of GS.slotsOf(id, base)) {
    const opts = GS.compatible(s.mount).filter((p) => GS.fitsSlot(s, p, id)).map((p) => p.id);
    if (!s.req) opts.push('');
    for (const pid of opts) { if ((base[s.slot] || '') === pid) continue; const nb = { ...base }; if (pid) nb[s.slot] = pid; else delete nb[s.slot]; GS.prune(id, nb); out.push(nb); }
  }
  return out;
}

/** The parts that open slots (a riser's dot, a handguard's rails, a chassis, an adapter's stock, a barrel's muzzle thread), each fitted once on each base, and each part of a slot so opened fitted once. */
export function openerBuilds(GS, id, bases) {
  const out = [], opened = new Map();
  const fitting = (sl, b) => GS.compatible(sl.mount).filter((p) => GS.fitsSlot(sl, p, id, b)).map((p) => p.id);
  const key = (x) => x.slot + '|' + x.mount; // (a slot by its mount: a derringer's optic slot is a pistol cut on one barrel and a rail on another)
  for (const base of bases) {
    const before = new Set(GS.slotsOf(id, base).map(key));
    for (const sl of GS.slotsOf(id, base)) for (const pid of fitting(sl, base)) {
      const P = GS.PARTS[pid]; if (!P || !(P.provides || P.chassis) || base[sl.slot] === pid) continue;
      const b1 = { ...base, [sl.slot]: pid }; GS.prune(id, b1); if (b1[sl.slot] !== pid) continue;
      out.push(b1);
      for (const s2 of GS.slotsOf(id, b1)) if (!before.has(key(s2)) && !opened.has(key(s2))) opened.set(key(s2), b1);
    }
  }
  // (each slot so opened: every part of it once, on the build that first opened it; what those open in turn (a magnifier behind a sight a barrel's rail
  // carries), the same, until nothing new opens)
  const done = new Set(bases.flatMap((b) => GS.slotsOf(id, b).map(key)));
  for (let queue = [...opened]; queue.length;) {
    const next = [];
    for (const [k2, b1] of queue) {
      if (done.has(k2)) continue; done.add(k2);
      const sl = GS.slotsOf(id, b1).find((x) => key(x) === k2); if (!sl) continue;
      for (const q of [...fitting(sl, b1), ...(sl.req ? [] : [''])]) {
        const b2 = { ...b1 }; if (q) b2[sl.slot] = q; else delete b2[sl.slot]; GS.prune(id, b2); out.push(b2);
        for (const s3 of GS.slotsOf(id, b2)) if (!done.has(key(s3)) && !opened.has(key(s3))) { opened.set(key(s3), b2); next.push([key(s3), b2]); }
      }
    }
    queue = next;
  }
  return out;
}

/**
 * Solves rows `cols` (unknown indices, each with coefficient 1) = `rhs` (k-vectors) by sparse Gauss-Jordan elimination (a consistent system is solved exactly, to the
 * float rounding of the data; unknowns no row fixes are 0): returns the unknowns (k-vectors) and each row's residual.
 */
export function solveRows(rows, n, k) {
  const piv = new Map(); // pivot column -> { a: Map(col -> coef), b: k-vector }, each pivot column in no other pivot row
  const seen = new Set();
  const reduce = (a, b) => { for (let again = true; again;) { again = false; for (const [j, f] of a) { const p = piv.get(j); if (!p) continue; for (const [c, v] of p.a) { const w = (a.get(c) || 0) - f * v; if (Math.abs(w) < 1e-12) a.delete(c); else a.set(c, w); } for (let d = 0; d < k; d++) b[d] -= f * p.b[d]; again = true; break; } } };
  for (const row of rows) {
    const sig = row.cols.slice().sort((x, y) => x - y).join(',') + '|' + row.rhs.map((v) => v.toFixed(12)).join(',');
    if (seen.has(sig)) continue; seen.add(sig);
    const a = new Map(); for (const j of row.cols) a.set(j, (a.get(j) || 0) + 1);
    const b = row.rhs.slice(); reduce(a, b);
    if (!a.size) continue; // (dependent: its residual is checked below)
    let j0 = -1, best = 0; for (const [j, v] of a) if (Math.abs(v) > best + 1e-9 || (Math.abs(v) > best - 1e-9 && j < j0)) { best = Math.abs(v); j0 = j; }
    const f = a.get(j0); for (const [c, v] of a) a.set(c, v / f); for (let d = 0; d < k; d++) b[d] /= f;
    for (const p of piv.values()) { const g = p.a.get(j0); if (!g) continue; for (const [c, v] of a) { const w = (p.a.get(c) || 0) - g * v; if (Math.abs(w) < 1e-12) p.a.delete(c); else p.a.set(c, w); } for (let d = 0; d < k; d++) p.b[d] -= g * b[d]; }
    piv.set(j0, { a, b });
  }
  const x = Array.from({ length: n }, () => new Array(k).fill(0));
  for (const [j, p] of piv) x[j] = p.b.slice(); // (the free unknowns are 0)
  return { x, res: rows.map((row) => { let m = 0; for (let d = 0; d < k; d++) { let s = 0; for (const j of row.cols) s += x[j][d]; m = Math.max(m, Math.abs(s - row.rhs[d])); } return m; }) };
}

/**
 * THE OFFSET MODEL of a value over builds: d(b) = c[q] + sum over slots s != ps of x[s][b[s]] + sum over the condition slots c filled in b of y[c][s][b[s]], and optionally
 * a CAP: on axis `cap.axis` the sum over the slots `cap.of` is replaced by min (or max) of it and cap.v[b[cap.by]]. obs: [{ b, q, ps, d (k-vector) }].
 * fitOffsets tries the plain sum, then condition slots, then a cap; returns { model, resid } (model: { k, c, x, y, cap, ref }), resid <= tol when it explains them all.
 */
export function evalModel(M, b, q, ps) {
  const out = (M.c.get(q) || new Array(M.k).fill(NaN)).slice(), capped = M.cap ? new Set(M.cap.of) : null, inner = new Array(M.k).fill(0);
  for (const [s, mp] of Object.entries(M.x)) {
    if (s === ps) continue; const v = mp.get(b[s] || ''); if (!v) continue;
    for (let d = 0; d < M.k; d++) { if (capped && capped.has(s) && d === M.cap.axis) inner[d] += v[d]; else out[d] += v[d]; }
  }
  for (const [c, bys] of Object.entries(M.y)) { if (!b[c]) continue; for (const [s, mp] of Object.entries(bys)) { if (s === ps) continue; const v = mp.get(b[s] || ''); if (v) for (let d = 0; d < M.k; d++) out[d] += v[d]; } }
  if (M.cap) { const a = M.cap.axis, lim = M.cap.v.get(b[M.cap.by] || ''); out[a] += lim === undefined ? inner[a] : M.cap.op === 'min' ? Math.min(inner[a], lim) : Math.max(inner[a], lim); }
  if (M.pair) { const { axis, h, by, A, B, op } = M.pair, x = A.get(b[h] || ''), y = B.get(b[by] || ''); out[axis] = (M.c.get(q) || [NaN, NaN, NaN])[axis] + (x === undefined ? y : y === undefined ? x : op === 'min' ? Math.min(x, y) : Math.max(x, y)); }
  return out;
}
/**
 * THE PAIR RULE (a min or max of two parts' own values on one axis, the provider's own offset added: a railmount at the handguard's end, but no further than
 * the barrel's end allows). Each part's value is the largest (min: the smallest) value its builds show, which is exact once every part has been seen where it
 * binds (probeExtremes builds that). Other slots must not move the piece on that axis. Returns the model or null.
 */
function fitPair(obs, slots, k, tol, ref, base) {
  for (let axis = 0; axis < k; axis++) for (const h of slots) for (const by of slots) {
    if (h >= by) continue;
    for (const op of ['min', 'max']) {
      // the providers' own offsets on the axis, from builds with the same two parts and another provider
      const c = new Map(), byPair = new Map();
      for (const o of obs) { const key = (o.b[h] || '') + '|' + (o.b[by] || ''); if (!byPair.has(key)) byPair.set(key, []); byPair.get(key).push(o); }
      const qs = [...new Set(obs.map((o) => o.q))]; c.set(qs[0], 0);
      for (let changed = true; changed;) { changed = false; for (const g of byPair.values()) for (const o of g) for (const o2 of g) { if (c.has(o.q) && !c.has(o2.q)) { c.set(o2.q, c.get(o.q) + o2.d[axis] - o.d[axis]); changed = true; } } }
      if (qs.some((q) => !c.has(q))) continue;
      const A = new Map(), B = new Map(), pick = op === 'min' ? Math.max : Math.min;
      for (const o of obs) { const v = o.d[axis] - c.get(o.q), x = o.b[h] || '', y = o.b[by] || ''; A.set(x, A.has(x) ? pick(A.get(x), v) : v); B.set(y, B.has(y) ? pick(B.get(y), v) : v); }
      // (c on the axis is the provider's own offset; the other axes as the plain model has them)
      const M = { ...base, pair: { axis, h, by, A, B, op }, c: new Map(qs.map((q) => { const u = (base.c.get(q) || [0, 0, 0]).slice(); u[axis] = c.get(q); return [q, u]; })) };
      if (residOf(M, obs) <= tol) return M;
    }
  }
  return null;
}
function solveModel(obs, slots, k, conds, ref) {
  const idx = new Map(), key = [], col = (s) => { let j = idx.get(s); if (j === undefined) { j = key.length; idx.set(s, j); key.push(s); } return j; };
  const rows = obs.map((o) => {
    const cols = [col('c\u0001' + o.q)];
    for (const s of slots) if (s !== o.ps && (o.b[s] || '') !== ref[s]) cols.push(col('x\u0001' + s + '\u0001' + (o.b[s] || '')));
    for (const c of conds) if (o.b[c]) for (const s of slots) if (s !== o.ps && s !== c && (o.b[s] || '') !== ref[s]) cols.push(col('y\u0001' + c + '\u0001' + s + '\u0001' + (o.b[s] || '')));
    return { cols, rhs: o.d };
  });
  const { x } = solveRows(rows, key.length, k);
  const M = { k, c: new Map(), x: Object.fromEntries(slots.map((s) => [s, new Map()])), y: Object.fromEntries(conds.map((c) => [c, {}])), cap: null, ref };
  key.forEach((kk, j) => {
    const [kind, a, b, c] = kk.split('\u0001');
    if (kind === 'c') M.c.set(a, x[j]); else if (kind === 'x') { if (x[j].some((v) => Math.abs(v) > 1e-13)) M.x[a].set(b, x[j]); } else if (x[j].some((v) => Math.abs(v) > 1e-13)) { (M.y[a][b] || (M.y[a][b] = new Map())).set(c, x[j]); }
  });
  return M;
}
const residOf = (M, obs) => { let r = 0; for (const o of obs) { const p = evalModel(M, o.b, o.q, o.ps); o.res = Math.max(...p.map((v, d) => Math.abs(v - o.d[d]))); if (!(o.res <= r)) r = isNaN(o.res) ? Infinity : Math.max(r, o.res); } return r; };
export function refOf(obs, slots) {
  const ref = {};
  for (const s of slots) { const n = new Map(); for (const o of obs) if (o.ps !== s) n.set(o.b[s] || '', (n.get(o.b[s] || '') || 0) + 1); ref[s] = n.size ? [...n].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))[0][0] : ''; }
  return ref;
}
export function fitOffsets(obs, slots, k, tol, { conds: fixedConds = null, ref = refOf(obs, slots), cap = true } = {}) {
  if (!obs.length) return { model: { k, c: new Map(), x: {}, y: {}, cap: null, ref }, resid: 0 };
  let M = solveModel(obs, slots, k, fixedConds || [], ref), r = residOf(M, obs);
  if (r <= tol || fixedConds) return { model: M, resid: r };
  // condition slots: an offset that applies only while another slot is filled (the fewest that explain it)
  const optional = slots.filter((s) => obs.some((o) => o.b[s]) && obs.some((o) => !o.b[s]));
  for (const c of optional) { const M2 = solveModel(obs, slots, k, [c], ref), r2 = residOf(M2, obs); if (r2 <= tol) return { model: M2, resid: r2 }; if (r2 < r) { M = M2; r = r2; } }
  if (!cap) { residOf(M, obs); return { model: M, resid: r }; }
  // a cap: on one axis, one slot's offsets (`of`) give way to another part's limit (min or max) where it is lower (higher)
  for (let axis = 0; axis < k; axis++) for (const by of slots) for (const of of slots) {
    if (of === by) continue;
    for (const op of ['min', 'max']) {
      const rest = slots.filter((s) => s !== by);
      let use = obs, Mc = null;
      for (let it = 0; it < 6; it++) { Mc = solveModel(use, rest, k, [], ref); const r0 = residOf(Mc, obs); const bad = obs.filter((o) => o.res > tol); if (!bad.length || r0 === Infinity) break; const next = obs.filter((o) => o.res <= tol); if (next.length === use.length || next.length < obs.length / 3) { use = next; break; } use = next; }
      if (!Mc) continue;
      // the cap's values: from the builds the plain sum does not explain, one per part of `by`
      residOf(Mc, obs);
      const v = new Map(); let ok = true;
      for (const o of obs) {
        if (o.res <= tol) continue;
        const p = evalModel(Mc, o.b, o.q, o.ps), xo = (Mc.x[of].get(o.b[of] || '') || [0, 0, 0])[axis], lim = o.d[axis] - (p[axis] - xo);
        if ([...Array(k).keys()].some((d) => d !== axis && Math.abs(p[d] - o.d[d]) > tol) || (op === 'min' ? !(lim < xo) : !(lim > xo))) { ok = false; break; }
        const key = o.b[by] || '', w = v.get(key); if (w !== undefined && Math.abs(w - lim) > tol) { ok = false; break; } v.set(key, lim);
      }
      if (!ok || !v.size) continue;
      const M3 = { ...Mc, cap: { axis, by, of: [of], op, v } }, r3 = residOf(M3, obs);
      if (r3 <= tol) return { model: M3, resid: r3 };
    }
  }
  const Mp = fitPair(obs, slots, k, tol, ref, M);
  if (Mp) return { model: Mp, resid: residOf(Mp, obs) };
  residOf(M, obs); return { model: M, resid: r };
}

/** A part's own spec values (js/parts.ts modelSpec with only that part, less the platform's own), flattened: what a variant is decided by. */
export function partProps(C, slot, part) {
  const memo = C.props || (C.props = new Map()), k = slot + '=' + part; if (memo.has(k)) return memo.get(k);
  const flat = (v, out = {}, p = '') => { if (v && typeof v === 'object' && !Array.isArray(v)) { for (const [kk, vv] of Object.entries(v)) if (kk !== 'slotOf') flat(vv, out, p ? p + '.' + kk : kk); } else out[p] = JSON.stringify(v === undefined ? null : v); return out; };
  const base = flat(C.GS.modelSpec({ id: C.id, build: {} })), mine = part ? flat(C.GS.modelSpec({ id: C.id, build: { [slot]: part } })) : {};
  const out = {}; for (const kk of new Set([...Object.keys(base), ...Object.keys(mine)])) if (mine[kk] !== base[kk]) out[kk] = part ? mine[kk] ?? 'null' : base[kk];
  memo.set(k, out); return out;
}

/** The build slots a mesh slot's part can be in (an adapter's slots are aliases: a riser's dot is an optic, a stock on an adapter a stock). */
const SLOT_ALIASES = { optic: ['riserdot', 'optic'], stock: ['buttstock2', 'buttstock', 'stock'], tac: ['tac'], tacL: ['tacL'] };
export const providerOf = (order, b) => { for (const s of order) if (b[s]) return s + '=' + b[s]; return ''; };

/** Groups the units of tag t by provider (the first filled slot of `order`) into pieces and variants. */
function piecesOf(builds, t, order) {
  const pieces = new Map(), obs = [];
  for (const B of builds) {
    const u = B.tags[t]; if (!u) continue;
    const q = providerOf(order, B.build), ps = q.split('=')[0];
    let pc = pieces.get(q); if (!pc) pieces.set(q, (pc = []));
    let vi = -1, m = null;
    for (let i = 0; i < pc.length; i++) { m = matchOf(pc[i].u, u); if (m) { vi = i; break; } }
    if (vi < 0) { pc.push({ B, u, len: lenZ(u) }); vi = pc.length - 1; m = { d: [0, 0, 0], s: 1 }; }
    obs.push({ b: B.build, q: q + '#' + vi, pq: q, vi, ps, d: m.d, s: m.s, B });
  }
  const absent = []; for (const B of builds) if (!B.tags[t] && pieces.has(providerOf(order, B.build))) absent.push(B);
  return { pieces, obs, absent, nVar: [...pieces.values()].reduce((a, p) => Math.max(a, p.length), 0) };
}

/**
 * Learns the platform's pieces, placements and info rules from its builds C (adding the builds a rule needs to be pinned down: a variant for each provider, a cap's
 * limit for each part). Returns { tags, problems, slotsAll, builds }.
 */
export function learnPlatform(C) {
  const problems = [];
  let builds = C.all();
  const slotsAll = [...new Set(builds.flatMap((B) => Object.keys(B.build)))].sort();
  const tagsAll = [...new Set(builds.flatMap((B) => Object.keys(B.tags)))].sort();
  const tags = {};
  const base = (b) => C.sw.bases.find((x) => true) || {};
  const learnTag = (t) => {
    const problems = [];
    const [ms, at] = t.split('@');
    const cands = [];
    if (ms === 'base') cands.push([]);
    const al = (SLOT_ALIASES[ms] || [ms]).filter((s) => slotsAll.includes(s)); if (al.length) cands.push(al);
    if (at && slotsAll.includes(at)) cands.push([at]);
    if (!cands.some((c) => !c.length)) cands.push([]); // (the platform itself: one piece every build has, or shows by a threshold)
    for (const s of slotsAll) if (!cands.some((c) => c.length === 1 && c[0] === s)) cands.push([s]);
    if (!cands.some((c) => !c.length)) cands.push([]);
    // (the provider list: one shape per provider, absences explained (a threshold may explain them), then the fewest providers; the base, the mesh slot's own
    // slots and the anchor's slot first, any other slot only if none of those does)
    let best = null;
    const nPri = cands.findIndex((c) => c.length === 1 && !al.includes(c[0]) && c[0] !== at);
    const varyingAll = slotsAll.filter((s) => new Set(builds.map((B) => B.build[s] || '')).size > 1);
    for (let i = 0; i < cands.length; i++) {
      const order = cands[i];
      if (best && best.score < 1e6 && best.nVar === 1 && i >= (nPri > 0 ? nPri : cands.length)) break;
      const P = piecesOf(builds, t, order); let score = P.nVar * 1000 + P.pieces.size;
      if (best && score >= best.score) continue;
      if (P.absent.length && !presenceRule(C, builds, t, order, varyingAll, P.pieces)) score += 1e6 + P.absent.length; // (absences a threshold explains are not held against it)
      if (!best || score < best.score) best = { order, score, ...P };
    }
    let { order } = best;
    // VARIANTS: a provider drawing several shapes: the slot whose part decides it, and the property of that part (its spec value) the shapes go by
    let vary = null;
    if (best.nVar > 1) {
      const multi = [...best.pieces].filter(([, p]) => p.length > 1).map(([q]) => q);
      const deciders = slotsAll.filter((s) => !order.includes(s) && multi.every((q) => { const m = new Map(); return best.obs.filter((o) => o.pq === q).every((o) => { const k = o.b[s] || ''; if (m.has(k) && m.get(k) !== o.vi) return false; m.set(k, o.vi); return true; }); }));
      for (const s of deciders) {
        // the property: a spec value of the deciding part that gives the same shape (for every provider) wherever it is the same
        const parts = [...new Set(builds.map((B) => B.build[s] || ''))], keys = new Set(parts.flatMap((p) => Object.keys(partProps(C, s, p))));
        const labelOf = (p, key) => (p ? partProps(C, s, p)[key] ?? partProps(C, s, '')[key] ?? 'null' : 'none');
        let found = null;
        for (const key of [...keys].sort()) {
          const ok = multi.every((q) => { const m = new Map(); return best.obs.filter((o) => o.pq === q).every((o) => { const l = labelOf(o.b[s] || '', key); if (m.has(l) && m.get(l) !== o.vi) return false; m.set(l, o.vi); return true; }); });
          if (ok && (!found || new Set(parts.map((p) => labelOf(p, key))).size < found.n)) found = { key, n: new Set(parts.map((p) => labelOf(p, key))).size };
        }
        if (found) { vary = { by: s, key: found.key, labelOf: (p) => labelOf(p, found.key) }; break; }
      }
      if (!vary) { problems.push(`tag ${t} (providers ${order.join('>') || 'base'}): ${multi.length} parts draw more than one shape (${multi.slice(0, 3).join(' ')}), decided by ${deciders.join(' or ') || 'no one slot'} and no one property of it`); }
      else {
        // every provider in every variant: one build each (a provider seen with one label only may still draw differently with another)
        const labels = new Map(); for (const B of builds) { const p = B.build[vary.by] || '', l = vary.labelOf(p); if (!labels.has(l)) labels.set(l, B); }
        let added = 0;
        for (const q of best.pieces.keys()) for (const [l, Bl] of labels) {
          if (best.obs.some((o) => o.pq === q && vary.labelOf(o.b[vary.by] || '') === l)) continue;
          const src = best.obs.find((o) => o.pq === q); if (!src) continue;
          const nb = { ...src.b }; if (Bl.build[vary.by]) nb[vary.by] = Bl.build[vary.by]; else delete nb[vary.by];
          const B = C.getB(nb); if (B.build[vary.by] === Bl.build[vary.by] && providerOf(order, B.build) === q) added++;
        }
        if (added) { builds = C.all(); Object.assign(best, piecesOf(builds, t, order)); }
      }
    }
    // the piece of each provider (and variant): its placement is c[piece] + the offsets (glTF axes); a stretched one's length the same way
    const obs = best.obs.map((o) => ({ ...o, q: vary ? o.pq + '#' + vary.labelOf(o.b[vary.by] || '') : o.pq }));
    if (vary) { // (a variant label must name one shape per provider)
      const m = new Map(); for (const o of obs) { const w = m.get(o.q); if (w !== undefined && w !== o.vi) { problems.push(`tag ${t}: variant ${o.q} draws two shapes`); break; } m.set(o.q, o.vi); }
    }
    // the slots that MOVE the piece: two builds that differ in that slot only, the same piece placed apart (only these get offsets: with one build per part,
    // a slot that never moves it would otherwise soak up what another does)
    const movers = moversOf(obs, slotsAll);
    let varying = movers;
    let fit = fitOffsets(obs, varying, 3, SHAPE_TOL);
    // (more slots, one at a time, the one that explains the most first, until the sum explains every build: the fewest slots that do)
    for (let more = true; fit.resid > SHAPE_TOL && more;) {
      more = false; let bestS = null, bestF = null, bestBad = obs.filter((o) => !(o.res <= SHAPE_TOL)).length;
      for (const s of slotsAll) { if (varying.includes(s) || new Set(obs.map((o) => o.b[s] || '')).size < 2) continue; const f2 = fitOffsets(obs, [...varying, s], 3, SHAPE_TOL, { cap: false }), nb = obs.filter((o) => !(o.res <= SHAPE_TOL)).length; if (nb < bestBad) { bestBad = nb; bestS = s; bestF = f2; } }
      if (bestS) { varying = [...varying, bestS]; fit = fitOffsets(obs, varying, 3, SHAPE_TOL); more = true; continue; }
      // (two at once: an offset one part gives only while another is fitted needs both)
      const cand = slotsAll.filter((s) => !varying.includes(s) && new Set(obs.map((o) => o.b[s] || '')).size > 1);
      for (let i = 0; i < cand.length && !more; i++) for (let j = i + 1; j < cand.length && !more; j++) {
        const f2 = fitOffsets(obs, [...varying, cand[i], cand[j]], 3, SHAPE_TOL), nb = obs.filter((o) => !(o.res <= SHAPE_TOL)).length;
        if (nb < bestBad) { varying = [...varying, cand[i], cand[j]]; fit = f2; more = true; }
      }
    }
    residOf(fit.model, obs);
    probeExtremes(C, fit.model, varying, obs); // (the outer loop learns the tag again if that built anything new)
    // a cap's limit, for each part of its slot: the build with that part and the `of` part that reaches furthest (one per part: linear)
    if (fit.model.cap) {
      const { by, of, axis, op } = fit.model.cap; let added = 0;
      const far = [...fit.model.x[of[0]]].sort((a, b) => (op === 'min' ? b[1][axis] - a[1][axis] : a[1][axis] - b[1][axis]))[0];
      for (const p of new Set(obs.map((o) => o.b[by] || ''))) {
        if (fit.model.cap.v.has(p) || !far) continue;
        const src = obs.find((o) => (o.b[by] || '') === p); const nb = { ...src.b, [of[0]]: far[0] }; const B = C.getB(nb); if (B.build[of[0]] === far[0] && B.build[by] === src.b[by]) added++;
      }
      if (added) { builds = C.all(); Object.assign(best, piecesOf(builds, t, order)); const obs2 = best.obs.map((o) => ({ ...o, q: vary ? o.pq + '#' + vary.labelOf(o.b[vary.by] || '') : o.pq })); obs.length = 0; obs.push(...obs2); fit = fitOffsets(obs, varying, 3, SHAPE_TOL); }
    }
    const stretched = obs.some((o) => Math.abs(o.s - 1) > 1e-9);
    let lenFit = null;
    if (stretched) {
      const lobs = obs.map((o) => ({ ...o, d: [best.pieces.get(o.pq)[o.vi].len * o.s] }));
      lenFit = fitOffsets(lobs, varying, 1, SHAPE_TOL, { cap: false });
      if (lenFit.resid > SHAPE_TOL) problems.push(`tag ${t}: its stretch is not a sum of lengths (${(lenFit.resid * 1000).toFixed(3)} mm)`);
    }
    if (fit.resid > SHAPE_TOL) { const w = obs.filter((o) => !(o.res <= SHAPE_TOL)); problems.push(`tag ${t}: placement is not a sum of offsets (${w.length} builds, up to ${(fit.resid * 1000).toFixed(3)} mm; e.g. ${w[0].B.k})`); }
    // presence: a build has the tag iff its provider draws it; else a threshold on two parts' spec values (a piece that shows only while there is room for it)
    let present = null;
    const absent = builds.filter((B) => !B.tags[t] && best.pieces.has(providerOf(order, B.build)));
    if (absent.length) {
      present = presenceRule(C, builds, t, order, slotsAll.filter((s) => new Set(builds.map((B) => B.build[s] || '')).size > 1), best.pieces);
      if (present) pinThreshold(C, present, obs[0].b);
      if (!present) problems.push(`tag ${t}: absent in ${absent.length} builds whose provider draws it, and no threshold explains it (e.g. ${absent[0].k})`);
    }
    if (process.env.DBGTAG === t) { for (const [s, mp] of Object.entries(fit.model.x)) for (const [p, v] of mp) console.log('  x', s, p, toFur(v).map((x) => x.toFixed(5)).join(',')); for (const [q, v] of fit.model.c) if (q.includes(process.env.DBGQ || '#')) console.log('  c', q, toFur(v).map((x) => x.toFixed(5)).join(','), obs.filter((o) => o.q === q).length, 'obs');
      console.log('DBG', t, 'order', order, 'varying', varying.join(' '), 'ref', JSON.stringify(fit.model.ref), 'cap', JSON.stringify(fit.model.cap && { ...fit.model.cap, v: [...fit.model.cap.v] }), 'conds', Object.keys(fit.model.y));
      for (const o of obs.filter((o) => !(o.res <= SHAPE_TOL)).slice(0, 10)) console.log('  BAD', o.q, (o.res * 1000).toFixed(3), toFur(o.d).map((x) => x.toFixed(5)).join(','), o.B.k);
    }
    tags[t] = { order, pieces: best.pieces, obs, model: fit.model, varying, vary, stretched, lenModel: lenFit && lenFit.model, present, problems };
  };
  // (a tag is learnt again when its rules asked for more builds: a variant for each provider, a cap's limit for each part, the extremes, a threshold's neighbours)
  for (let pass = 0; pass < 4; pass++) { const n0 = C.memo.size; for (const t of tagsAll) { builds = C.all(); learnTag(t); } builds = C.all(); if (C.memo.size === n0) break; }
  for (const t of tagsAll) problems.push(...tags[t].problems);
  return { tags, problems, slotsAll, builds: C.all() };
}

/** The slots whose part alone moves a piece (pairs of observations that differ in that slot only, with the same piece), plus the cap and condition slots found later. */
export function moversOf(obs, slotsAll) {
  const out = [];
  for (const s of slotsAll) {
    const groups = new Map();
    for (const o of obs) { const k = o.q + '|' + slotsAll.filter((x) => x !== s).map((x) => o.b[x] || '').join('|'); if (!groups.has(k)) groups.set(k, []); groups.get(k).push(o); }
    let moves = false;
    for (const g of groups.values()) { if (g.length < 2) continue; if (g.some((o) => Math.max(...o.d.map((v, i) => Math.abs(v - g[0].d[i]))) > SHAPE_TOL || Math.abs((o.s || 1) - (g[0].s || 1)) > 1e-9)) { moves = true; break; } }
    if (moves) out.push(s);
  }
  return out;
}

/**
 * EXTREMES: for each pair of slots that move a piece along the bore, the part of each that moves it furthest forward and furthest back, fitted together from one build
 * that has the piece (four builds a pair): a cap that binds only there (a short barrel under a long handguard) shows, and the model is learnt again with them.
 */
function probeExtremes(C, M, varying, obs) {
  // (for every part of one slot, the part of the other that moves the piece furthest forward, and furthest back, among those that fit beside it: one or two
  // builds a part, both ways round)
  const fwd = (s) => {
    if (M.pair && (M.pair.h === s || M.pair.by === s)) return [...(M.pair.h === s ? M.pair.A : M.pair.B)].sort((a, b) => a[1] - b[1]).map(([p]) => p);
    const m = M.x[s]; if (!m) return null; const list = [[M.ref[s] || '', 0], ...[...m].map(([p, v]) => [p, -v[2]])]; if (list.every(([, f]) => Math.abs(f) < 1e-9)) return null; return list.sort((a, b) => a[1] - b[1]).map(([p]) => p);
  };
  const src = obs[0]; if (!src) return;
  const ext = varying.map((s) => [s, fwd(s)]).filter(([, e]) => e);
  const set = (b, s, p) => { if (p) b[s] = p; else delete b[s]; };
  for (const [s1, l1] of ext) for (const [s2, l2] of ext) {
    if (s1 === s2) continue;
    for (const p1 of l1) for (const order of [l2, [...l2].reverse()]) for (const p2 of order) {
      const nb = { ...src.b }; set(nb, s1, p1); set(nb, s2, p2);
      const B = C.getB(nb); if ((B.build[s1] || '') === p1 && (B.build[s2] || '') === p2) break;
    }
  }
}
/** A presence threshold's neighbours: every pair of parts of its two slots whose difference falls between the last absent and the first present one is built, so the threshold is pinned. */
function pinThreshold(C, P, b0) {
  const opts = (s) => { const set = new Set(); for (const B of C.all()) set.add(B.build[s] || ''); return [...set]; };
  const num = (s, p, key) => { const v = p ? partProps(C, s, p)[key] ?? partProps(C, s, '')[key] : partProps(C, s, '')[key]; return v === undefined ? null : JSON.parse(v); };
  for (const pa of opts(P.a[0])) for (const pb of opts(P.b[0])) {
    const d = num(P.a[0], pa, P.a[1]) - num(P.b[0], pb, P.b[1]); if (!(d > P.lo && d < P.hi)) continue;
    const nb = { ...b0 }; for (const [s, p] of [[P.a[0], pa], [P.b[0], pb]]) { if (p) nb[s] = p; else delete nb[s]; }
    C.getB(nb);
  }
}

/** A tag present only while one part's spec value exceeds another's by a margin: { a: [slot, key], b: [slot, key], gt } from the builds, or null. */
function presenceRule(C, builds, t, order, varying, pieces) {
  const rel = builds.filter((B) => pieces.has(providerOf(order, B.build)));
  if (!rel.some((B) => !B.tags[t]) || !rel.some((B) => B.tags[t])) return null;
  // (each slot's numeric spec values per build, once: a column per key, null where a part has none)
  const cols = [];
  for (const s of varying) {
    const parts = rel.map((B) => B.build[s] || ''), keys = new Set(); for (const p of new Set(parts)) for (const k of Object.keys(partProps(C, s, p))) keys.add(k);
    for (const k of keys) {
      const memo = new Map(), num = (p) => { if (memo.has(p)) return memo.get(p); const v = p ? partProps(C, s, p)[k] ?? partProps(C, s, '')[k] : partProps(C, s, '')[k]; const w = v === undefined ? null : JSON.parse(v); const n = typeof w === 'number' ? w : null; memo.set(p, n); return n; };
      const col = parts.map(num); if (col.some((x) => x === null) || new Set(col).size < 2) continue;
      cols.push({ s, k, col });
    }
  }
  const present = rel.map((B) => !!B.tags[t]);
  for (const A of cols) for (const Bc of cols) {
    if (A.s === Bc.s) continue;
    let lo = -Infinity, hi = Infinity;
    for (let i = 0; i < rel.length && lo < hi; i++) { const d = A.col[i] - Bc.col[i]; if (present[i]) { if (d < hi) hi = d; } else if (d > lo) lo = d; }
    if (lo < hi) {
      // the threshold: the recipe's own numbers are round, so the shortest decimal between the last absent and the first present difference
      let gt = (lo + hi) / 2; for (let dp = 1; dp < 9; dp++) { const f = 10 ** dp, c = Math.ceil(lo * f + 1e-9) / f; if (c < hi - 1e-12 && c > lo) { gt = c; break; } }
      return { a: [A.s, A.k], b: [Bc.s, Bc.k], gt, lo, hi };
    }
  }
  return null;
}

/** A tag's offset in a build ([f, u, r] metres) by its model. */
export const tagOffset = (T, b) => { const ps = providerOf(T.order, b).split('=')[0]; const v = evalModel({ ...T.model, c: new Map([['', [0, 0, 0]]]) }, b, '', ps); return toFur(v); };

const leafSame = (x, y) => (typeof x === 'number' && typeof y === 'number' ? Math.abs(x - y) <= INFO_TOL : JSON.stringify(x) === JSON.stringify(y));
/** (the structure is found against the geometry's offsets, which carry the float32 noise of the meshes: the leaf's own offsets are then solved exactly from its values) */
const leafNear = (x, y) => (typeof x === 'number' && typeof y === 'number' ? Math.abs(x - y) <= 3e-6 : JSON.stringify(x) === JSON.stringify(y));

/**
 * Learns how each info leaf is made: { leaves: { leaf: { order, skip (non-providers), follow: { slot: [tag, axis] | null }, model: { slot: offset model }, own: Map(provider -> value),
 * max?: { by, v: Map } } }, problems }.
 */
export function learnInfo(L, C) {
  const { builds, tags, slotsAll } = L, problems = [], out = {};
  const leavesAll = [...new Set(builds.flatMap((B) => Object.keys(B.leaves)))].sort();
  const val = (B, l) => (l in B.leaves ? B.leaves[l] : DEL);
  const dep = leafDeps(builds);
  const rig = new Map(), rigid = (t, B) => { const k = t + '|' + B.k; let r = rig.get(k); if (!r) { r = tagOffset(tags[t], B.build); rig.set(k, r); } return r; };
  const follows = [null, ...Object.keys(tags).flatMap((t) => [0, 1, 2].map((a) => [t, a]))];
  /** Fits one provider order: { ok, follow, own, nonProv, bad, worst }. */
  let allowFree = false, curVary = null; // (a variant rule of the tags (the barrel's sight rise): a provider's own value may go by it too)
  const varyRules = [...new Map(Object.values(tags).filter((T) => T.vary).map((T) => [T.vary.by + '|' + T.vary.key, T.vary])).values()];
  const fit = (l, order, bs = builds) => {
    const r = fit1(l, order, bs, new Set());
    if (!r.ok) return r;
    // (parsimony: a part whose builds the next provider down explains just as well is not a provider: a bipod leaves the support hand to the handguard)
    if (!allowFree) for (const q of [...r.own.keys()]) { // (not with free offsets: they would explain anything)
      if (!q || r.nonProv.has(q)) continue;
      const r2 = fit1(l, order, bs, new Set([...r.nonProv, q]));
      if (r2.ok) Object.assign(r, r2);
    }
    return r;
  };
  const fit1 = (l, order, bs, nonProv0) => {
    const nonProv = new Set(nonProv0), numeric = bs.some((B) => typeof val(B, l) === 'number');
    let follow = {}, own = new Map(), bad = [];
    const top = (B) => { const lab = curVary ? '#' + curVary.labelOf(B.build[curVary.by] || '') : ''; for (const s of order) { const p = B.build[s]; if (p && !nonProv.has(s + '=' + p)) return s + '=' + p + lab; } return lab; };
    for (let pass = 0; pass < 8; pass++) {
      const groups = new Map(); // provider slot -> Map(provider -> builds)
      for (const B of bs) { const q = top(B), s = q.split('=')[0]; if (!groups.has(s)) groups.set(s, new Map()); const g = groups.get(s); if (!g.has(q)) g.set(q, []); g.get(q).push(B); }
      follow = {}; own = new Map(); bad = [];
      let changed = false;
      for (const [s, g] of groups) {
        let best = null;
        for (const f of numeric ? follows : [null]) {
          let okParts = 0; const badParts = [], vals = new Map();
          for (const [q, list] of g) {
            let v0 = null, ok = true;
            for (const B of list) { let v = val(B, l); if (typeof v === 'number' && f) v -= rigid(f[0], B)[f[1]]; if (v0 === null) v0 = { v }; else if (!(f ? leafNear(v0.v, v) : leafSame(v0.v, v))) { ok = false; break; } }
            if (ok) { okParts++; vals.set(q, v0.v); } else badParts.push(q);
          }
          if (!best || okParts > best.okParts) best = { f, okParts, badParts, vals };
          if (!badParts.length) break;
        }
        // (no tag moves it so: its own offsets, the fewest slots whose parts' sum explains the provider's builds (FREE))
        if (allowFree && numeric && best.badParts.length && [...g.values()].every((list) => list.every((B) => typeof val(B, l) === 'number'))) { const fr = freeFit(l, s, g, order); if (fr) best = { f: ['*'], okParts: g.size, badParts: [], vals: fr.vals, free: fr }; }
        follow[s] = best.f; for (const [q, v] of best.vals) own.set(q, v);
        for (const q of best.badParts) { if (q && !nonProv.has(q)) { nonProv.add(q); changed = true; } else bad.push(q); }
      }
      if (!changed) break;
    }
    return { ok: !bad.length, follow, own, nonProv, bad, top };
  };
  /** A provider slot's builds g (provider -> builds) as its own offsets: the fewest slots (greedy) whose parts' offsets, summed, give each build's value exactly. */
  const freeFit = (l, s, g, order = []) => {
    const obs = []; for (const [q, list] of g) for (const B of list) if (typeof val(B, l) === 'number') obs.push({ b: B.build, q, ps: s, d: [val(B, l)], B });
    if (!obs.length) return null;
    const cand = slotsAll.filter((x) => x !== s && !order.includes(x) && new Set(obs.map((o) => o.b[x] || '')).size > 1); // (not a provider's slot: it provides, it is not summed)
    let use = [], r = fitOffsets(obs, use, 1, INFO_TOL, { cap: false });
    for (let more = true; r.resid > INFO_TOL && more;) {
      more = false; let bestS = null, bestN = obs.filter((o) => !(o.res <= INFO_TOL)).length;
      for (const x of cand) { if (use.includes(x)) continue; fitOffsets(obs, [...use, x], 1, INFO_TOL, { cap: false }); const n = obs.filter((o) => !(o.res <= INFO_TOL)).length; if (n < bestN) { bestN = n; bestS = x; } }
      if (bestS) { use = [...use, bestS]; r = fitOffsets(obs, use, 1, INFO_TOL, { cap: false }); more = true; }
    }
    if (r.resid > INFO_TOL) return null;
    const vals = new Map(); for (const [q, v] of r.model.c) vals.set(q, v[0]);
    return { model: r.model, vals };
  };
  const perms = (arr) => (arr.length <= 1 ? [arr] : arr.flatMap((x, i) => perms([...arr.slice(0, i), ...arr.slice(i + 1)]).map((p) => [x, ...p])));
  const subsets = (arr) => arr.reduce((a, x) => a.concat(a.map((s) => [...s, x])), [[]]).sort((a, b) => a.length - b.length);
  const exact = (l, done, bs = builds) => { // the exact offsets of each provider slot's model, solved from the leaf's values (on the follow tag's slots and condition slots)
    done.model = {};
    for (const [s, f] of Object.entries(done.follow)) {
      const list = bs.filter((B) => done.top(B).split('=')[0] === s && typeof val(B, l) === 'number');
      if (!list.length) continue;
      const obs = list.map((B) => ({ b: B.build, q: done.top(B), ps: s, d: [val(B, l)], B }));
      if (!f) { done.model[s] = null; continue; }
      if (f[0] === '*') { const g = new Map(); for (const B of list) { const q = done.top(B); if (!g.has(q)) g.set(q, []); g.get(q).push(B); } const fr = freeFit(l, s, g, done.order); if (!fr) return `provider ${s}: its own offsets are not exact`; done.model[s] = fr.model; for (const [q, v] of fr.model.c) done.own.set(q, v[0]); continue; }
      const T = tags[f[0]], conds = Object.keys(T.model.y);
      let r = fitOffsets(obs, T.varying, 1, INFO_TOL, { conds, ref: T.model.ref });
      if (r.resid > INFO_TOL) r = fitOffsets(obs, T.varying, 1, INFO_TOL, { ref: T.model.ref });
      if (r.resid > INFO_TOL) return `provider ${s} following ${f[0]} is not exact (${r.resid})`;
      done.model[s] = r.model; for (const [q, v] of r.model.c) done.own.set(q, v[0]);
    }
    return null;
  };
  for (const l of leavesAll) {
    const D = [...dep.get(l)].sort();
    let done = null, why = null;
    for (const free of [false, true]) { // (a leaf no tag's offsets explain gets its own, only when nothing else does)
    allowFree = free;
    for (const V of [null, ...varyRules]) {
      curVary = V;
      for (const sub of subsets(D)) {
        if (sub.length > 4) break;
        for (const order of perms(sub)) { const r = fit(l, order); if (r.ok) { done = { order, ...r, vary: V }; why = exact(l, done); if (!why) break; done = null; } }
        if (done) break;
      }
      if (done) break;
    }
    curVary = null;
    // a max: the leaf is the larger of the model's value and one part's own (a pistol chassis's front, ahead of a short slide's muzzle)
    let maxBest = null;
    if (!done && builds.some((B) => typeof val(B, l) === 'number')) for (const m of D) {
      // the parts of m that change the leaf (against the most common value among builds that differ in m only): the model is fitted without them
      const reach = new Set(), others = slotsAll.filter((x) => x !== m), groups = new Map();
      for (const B of builds) { const k = others.map((x) => B.build[x] || '').join('|'); if (!groups.has(k)) groups.set(k, []); groups.get(k).push(B); }
      for (const g of groups.values()) { if (g.length < 2) continue; const n = new Map(); for (const B of g) { const k = JSON.stringify(val(B, l)); n.set(k, (n.get(k) || 0) + 1); } const mode = [...n].sort((a, b) => b[1] - a[1])[0][0]; for (const B of g) if (JSON.stringify(val(B, l)) !== mode) reach.add(B.build[m] || ''); }
      if (process.env.DBGLEAF === l) console.log('MAX', m, 'reach', [...reach]);
      if (!reach.size) continue;
      // (each reaching part's own value: the least value of its builds; the builds where it does not bind (any other value) are the model's too)
      const kOf = new Map(); for (const p of reach) { let lo = Infinity; for (const B of builds) if ((B.build[m] || '') === p && typeof val(B, l) === 'number') lo = Math.min(lo, val(B, l)); kOf.set(p, JSON.stringify(lo)); } // (a max binds at its least value)
      const plain = builds.filter((B) => !reach.has(B.build[m] || '') || JSON.stringify(val(B, l)) !== kOf.get(B.build[m] || '')), rest = D.filter((s) => s !== m);
      for (const sub of subsets(rest)) {
        if (sub.length > 4 || done) break;
        for (const order of perms(sub)) {
          const r = fit(l, order, plain); if (process.env.DBGLEAF === l) console.log('  order', order, r.ok, r.bad.slice(0, 3)); if (!r.ok) continue;
          const cand = { order, ...r }; { const e = exact(l, cand, plain); if (process.env.DBGLEAF === l) console.log('  exact', e); if (e) continue; }
          // the max: every build with a reaching part is max(model, v[part]), the same v for each part
          const v = new Map(); let ok = true;
          const predict = (B) => { const q = cand.top(B), s = q.split('=')[0]; let x = cand.own.get(q); if (typeof x !== 'number') return x; const M = cand.model[s]; return M ? evalModel({ ...M, c: new Map([[q, [x]]]) }, B.build, q, s)[0] : x; };
          for (const B of builds) { if (!reach.has(B.build[m] || '')) continue; const p = predict(B), y = val(B, l); if (typeof p !== 'number' || typeof y !== 'number') { if (process.env.DBGLEAF === l) console.log('   NAN', p, y, B.k); ok = false; break; } if (leafSame(p, y)) continue; if (y < p) { if (process.env.DBGLEAF === l) console.log('   LESS', p, y, B.k); ok = false; break; } const w = v.get(B.build[m]); if (w !== undefined && !leafSame(w, y)) { if (process.env.DBGLEAF === l) console.log('   TWO', w, y, B.k); ok = false; break; } v.set(B.build[m], y); }
          if (ok) for (const B of builds) { const w = v.get(B.build[m] || ''); if (w !== undefined && !leafSame(Math.max(predict(B), w), val(B, l))) { ok = false; break; } }
          if (ok) { cand.max = { by: m, v }; if (!maxBest || v.size < maxBest.max.v.size) maxBest = cand; break; }
        }
        if (maxBest && maxBest.max.by === m) break;
      }
    }
    if (!done && maxBest) done = maxBest; // (the max that the fewest parts need: a chassis, not every barrel)
    if (done) break;
    }
    allowFree = false;
    if (!done) { problems.push(`info ${l}: no provider order of ${D.join(', ') || '(none)'} explains it${why ? ': ' + why : ''}`); continue; }
    out[l] = done;
  }
  return { leaves: out, problems };
}

/** The provider key of tag T in a build (with its variant label), or null when the tag is absent. */
export function pieceKeyOf(C, T, b) {
  const q = providerOf(T.order, b); if (!T.pieces.has(q)) return null;
  if (T.present) { const P = T.present, num = (s, key) => { const v = partProps(C, s, b[s] || '')[key] ?? partProps(C, s, '')[key]; return v === undefined ? null : JSON.parse(v); }; if (!(num(...P.a) - num(...P.b) > P.gt)) return null; }
  return T.vary ? q + '#' + T.vary.labelOf(b[T.vary.by] || '') : q;
}
/** Checks a build against the learnt model (pieces placed by their offsets, info by its rules): [differences]. */
export function verifyBuild(C, L, I, B) {
  const diffs = [];
  for (const [t, T] of Object.entries(L.tags)) {
    const key = pieceKeyOf(C, T, B.build), u = B.tags[t];
    if (key === null) { if (u) diffs.push(`${t}: present, predicted absent`); continue; }
    const cap = T.obs.find((o) => o.q === key);
    if (!cap) { diffs.push(`${t}: no piece for ${key}`); continue; }
    if (!u) { diffs.push(`${t}: absent, predicted ${key}`); continue; }
    const ps = key.split('=')[0], d0 = evalModel(T.model, cap.b, key, ps), d1 = evalModel(T.model, B.build, key, ps), mv = [0, 1, 2].map((k) => d1[k] - d0[k]);
    const m = matchOf(cap.B.tags[t], u);
    if (!m) { diffs.push(`${t}: a different shape from piece ${key}`); continue; }
    let s = 1;
    if (T.stretched) { const l0 = evalModel(T.lenModel, cap.b, key, ps)[0], l1 = evalModel(T.lenModel, B.build, key, ps)[0]; s = l1 / l0; }
    const dm = [m.d[0] - mv[0], m.d[1] - mv[1], m.d[2] - mv[2]];
    if (Math.max(...dm.map(Math.abs)) > SHAPE_TOL * 4 || Math.abs(m.s - s) > 1e-6) diffs.push(`${t}: placed ${(Math.max(...dm.map(Math.abs)) * 1000).toFixed(3)} mm off (stretch ${m.s} vs ${s})`);
  }
  const got = predictLeaves(I, B.build);
  for (const l of new Set([...Object.keys(got), ...Object.keys(B.leaves)])) { const x = got[l], y = B.leaves[l]; if (!(typeof x === 'number' && typeof y === 'number' ? Math.abs(x - y) <= 1e-8 : JSON.stringify(x) === JSON.stringify(y))) diffs.push(`info ${l}: ${JSON.stringify(x)} vs ${JSON.stringify(y)}`); }
  return diffs;
}

/** The info a build gets by the learnt rules (leaves): what js/glb.ts computes from the index. */
export function predictLeaves(I, b) {
  const out = {};
  for (const [l, R] of Object.entries(I.leaves)) {
    const lab = R.vary ? '#' + R.vary.labelOf(b[R.vary.by] || '') : '';
    let q = lab; for (const s of R.order) { const p = b[s]; if (p && !R.nonProv.has(s + '=' + p)) { q = s + '=' + p + lab; break; } }
    const s = q.split('=')[0];
    let v = R.own.get(q);
    if (v === undefined) { out[l] = { missing: q }; continue; }
    if (v === DEL) continue;
    const M = R.model && R.model[s];
    if (M && typeof v === 'number') v = evalModel({ ...M, c: new Map([[q, [v]]]) }, b, q, s)[0];
    if (R.max) { const w = R.max.v.get(b[R.max.by] || ''); if (w !== undefined) v = Math.max(v, w); }
    out[l] = v;
  }
  return out;
}
