// Bakes the per-part pieces: assets/models/parts/<platform>/index.json + <tag>/<file>.glb, and the pieces that are the same shape on several platforms (or at
// several places) once in assets/models/parts/_shared/<tag>/<hash>.glb (docs/models.md "Per-part bake", js/glb.ts GUN_MODEL_CONTRACT.packs).
// Called by tools/bake_models.mjs (`npm run bake:models`); `node tools/bake_models.mjs --parts [ids]` for just this part.
//
// Per platform (platformJob): a LINEAR set of builds (tools/model_parts.mjs collectBuilds: every part fitted once from each base, and what a rule needs to be
// pinned down), the rules learnt from them (learnPlatform, learnInfo: who draws each piece, the offsets parts give it, the variants, the info), the index made
// of them, and the CHECKS: every one of those builds and a random sample of others the platform's rules were not learnt from are planned by the game's own
// planner (js/glb.ts planBuild) from the index and compared, vertex for vertex and leaf for leaf, with the recipe (the bake fails otherwise). Nothing is
// enumerated over combinations of parts. After all platforms (writeAll): the pieces that are the same shape up to a move are one file.
import fs from 'fs'; import path from 'path'; import zlib from 'zlib'; import crypto from 'crypto';
import { ROOT } from './model_env.mjs';
import { collectBuilds, learnPlatform, learnInfo, evalModel, providerOf, partProps, isDel, matchOf, unitsOf, cleanInfo } from './model_parts.mjs';
import { packFileName, canonOf, sameCanon } from './model_emit.mjs';
import { generate, regressionsOf } from './model_cases.mjs';
import { randomBuilds, defOf } from './model_sweep.mjs';

export const PARTS_DIR = path.join(ROOT, 'assets/models/parts/');
export const SHARED = '_shared/';
/** Random builds per platform checked in the bake beyond the ones the rules were learnt from (a few hundred over all the platforms). */
export const SAMPLE = +(process.env.MODELS_SAMPLE || 5);

/** The platforms whose pieces are older than the recipe sources: returns their ids. */
export function staleParts(ids, src) {
  const stale = [];
  for (const id of ids) {
    const f = PARTS_DIR + id + '/index.json';
    if (!fs.existsSync(f) || JSON.parse(fs.readFileSync(f, 'utf8')).src !== src) stale.push(id);
  }
  return stale;
}

const toFur = (v) => [-v[2], v[1], v[0]];
const r9 = (x) => Math.round(x * 1e9) / 1e9;
/** A model axis (glTF x, y, z) as the index's [forward, up, right] axis, and the sign a value takes there. */
const furAxis = (a) => (a === 2 ? [0, -1] : a === 1 ? [1, 1] : [2, 1]);

/** The platform index (without files) of the learnt rules: { ix, pieces: [{ tag, key, obs, Pcap (f, u, r), stretch }] }. */
export function indexOf(C, L, I, Models, src) {
  const ix = { version: Models.PARTS_INDEX_VERSION, platform: C.id, src, slots: L.slotsAll, tags: {}, anchors: {}, values: {}, info: {} };
  const A = (s, p) => (ix.anchors[s + '=' + p] = ix.anchors[s + '=' + p] || {});
  const valueKeys = new Map(); // slot -> Set of spec keys the rules read
  const need = (s, k) => { if (!valueKeys.has(s)) valueKeys.set(s, new Set()); valueKeys.get(s).add(k); };
  const pieces = [];
  for (const [t, T] of Object.entries(L.tags)) {
    const M = T.model, out = { from: T.order, pieces: {} };
    if (T.vary) { out.vary = { by: T.vary.by, key: T.vary.key }; need(T.vary.by, T.vary.key); }
    const conds = Object.keys(M.y); if (conds.length) out.cond = conds;
    if (T.stretched) out.stretch = true;
    if (T.present) { out.show = { a: T.present.a, b: T.present.b, gt: T.present.gt }; need(...T.present.a); need(...T.present.b); }
    for (const [s, mp] of Object.entries(M.x)) for (const [p, v] of mp) A(s, p)['mount_' + t] = toFur(v).map(r9); // (a capped slot's too: the planner sums them apart on the cap's axis)
    for (const [c, bys] of Object.entries(M.y)) for (const [s, mp] of Object.entries(bys)) for (const [p, v] of mp) A(s, p)['mount_' + t + '?' + c] = toFur(v).map(r9);
    if (M.cap) { const [fa, sg] = furAxis(M.cap.axis); out.cap = { axis: fa, by: M.cap.by, of: M.cap.of, op: sg < 0 ? (M.cap.op === 'min' ? 'max' : 'min') : M.cap.op }; for (const [p, v] of M.cap.v) A(M.cap.by, p)['cap_' + t] = r9(v * sg); }
    if (M.pair) { const [fa, sg] = furAxis(M.pair.axis); out.pair = { axis: fa, h: M.pair.h, by: M.pair.by, op: sg < 0 ? (M.pair.op === 'min' ? 'max' : 'min') : M.pair.op }; for (const [p, v] of M.pair.A) A(M.pair.h, p)['pair_' + t] = r9(v * sg); for (const [p, v] of M.pair.B) A(M.pair.by, p)['pair_' + t] = r9(v * sg); }
    if (T.stretched) for (const [s, mp] of Object.entries(T.lenModel.x)) for (const [p, v] of mp) A(s, p)['len_' + t] = r9(v[0]);
    // the pieces: one per provider (and variant), captured in the first build that has it
    const zero = (q) => ({ ...M, c: new Map([[q, [0, 0, 0]]]) });
    for (const key of [...new Set(T.obs.map((o) => o.q))].sort()) {
      const cap = T.obs.find((o) => o.q === key), ps = key.split('#')[0].split('=')[0];
      const Pcap = toFur(evalModel(zero(key), cap.b, key, ps));
      const pc = { tag: t, key, obs: cap, Pcap };
      if (T.stretched) { const u = cap.B.tags[t]; let zmax = -Infinity, zmin = Infinity; for (const m of u.meshes) for (let i = 2; i < m.v.length; i += 3) { zmax = Math.max(zmax, m.v[i]); zmin = Math.min(zmin, m.v[i]); } pc.stretch = { rear: -zmax, len: zmax - zmin, len0: (T.lenModel.c.get(key) || [0])[0] }; }
      pieces.push(pc);
      out.pieces[key] = null; // (filled by writeAll / localIndex)
    }
    ix.tags[t] = out;
  }
  // the spec values the variants and thresholds go by: every part of those slots seen, and the platform's own
  ix.values[''] = {};
  for (const [s, keys] of valueKeys) {
    const parts = new Set(L.builds.map((B) => B.build[s] || '').filter(Boolean));
    for (const k of keys) { const b = partProps(C, s, '')[k]; if (b !== undefined) ix.values[''][k] = b; for (const p of parts) { const v = partProps(C, s, p)[k]; if (v !== undefined) (ix.values[s + '=' + p] = ix.values[s + '=' + p] || {})[k] = v; } }
  }
  // the info rules
  for (const [l, R] of Object.entries(I.leaves)) {
    const o = { from: R.order, own: {} };
    if (R.nonProv.size) o.skip = [...R.nonProv].sort();
    for (const [q, v] of R.own) o.own[q] = isDel(v) ? { del: 1 } : v;
    if (R.vary) { o.vary = { by: R.vary.by, key: R.vary.key }; need(R.vary.by, R.vary.key); for (const p of new Set(L.builds.map((B) => B.build[R.vary.by] || '').filter(Boolean))) { const v = partProps(C, R.vary.by, p)[R.vary.key]; if (v !== undefined) (ix.values[R.vary.by + '=' + p] = ix.values[R.vary.by + '=' + p] || {})[R.vary.key] = v; } const b = partProps(C, R.vary.by, '')[R.vary.key]; if (b !== undefined) ix.values[''][R.vary.key] = b; }
    for (const [s, Mx] of Object.entries(R.model || {})) {
      if (!Mx) continue;
      const x = {}; for (const [s2, mp] of Object.entries(Mx.x)) for (const [p, v] of mp) x[s2 + '=' + p] = v[0];
      const y = {}; for (const [c, bys] of Object.entries(Mx.y)) { const yc = {}; for (const [s2, mp] of Object.entries(bys)) for (const [p, v] of mp) yc[s2 + '=' + p] = v[0]; if (Object.keys(yc).length) y[c] = yc; }
      if (Object.keys(x).length || Object.keys(y).length) (o.off = o.off || {})[s.startsWith('#') ? '' : s] = Object.keys(y).length ? { x, y } : { x };
    }
    if (R.max) o.max = { by: R.max.by, v: Object.fromEntries(R.max.v) };
    ix.info[l] = o;
  }
  return { ix, pieces };
}

/** The index with the pieces in the capture builds' own frame (no files): what the bake checks the rules with before anything is written. */
function localIndex(ix, pieces) {
  const out = JSON.parse(JSON.stringify(ix));
  for (const p of pieces) out.tags[p.tag].pieces[p.key] = { file: '(capture)', at: p.Pcap.map((x) => -x), ...(p.stretch ? { rear: p.stretch.rear, len: p.stretch.len, len0: p.stretch.len0 } : {}) };
  return out;
}

/**
 * THE CHECK: a build planned from the index by the game's planner (Models.planBuild) against the recipe's own: each tag's piece (its capture's unit) moved and
 * stretched as planned must be the build's unit vertex for vertex, and every info leaf the same. Returns the differences.
 */
export function checkBuild(Models, ix, pieces, B) {
  const diffs = [], plan = Models.planBuild(ix, B.build), byKey = new Map(pieces.map((p) => [p.tag + '|' + p.key, p])), seen = new Set();
  if (plan.approx) diffs.push('not covered: ' + plan.approx);
  for (const t of plan.tags) {
    seen.add(t.tag);
    const key = Object.entries(ix.tags[t.tag].pieces).find(([, e]) => e === t.entry)[0], p = byKey.get(t.tag + '|' + key), u = B.tags[t.tag];
    if (!u) { diffs.push(`${t.tag}: planned (${key}), not in the recipe's`); continue; }
    const cu = p.obs.B.tags[t.tag], d = [t.rigid[0] + t.at[0], t.rigid[1] + t.at[1], t.rigid[2] + t.at[2]], s = t.scale === undefined ? 1 : t.scale, zr = t.rear === undefined ? 0 : -t.rear;
    if (cu.meshes.length !== u.meshes.length) { diffs.push(`${t.tag}: ${u.meshes.length} meshes, the piece ${cu.meshes.length}`); continue; }
    let worst = 0;
    for (let i = 0; i < cu.meshes.length; i++) {
      const a = cu.meshes[i].v, b = u.meshes[i].v; if (a.length !== b.length || cu.meshes[i].mat !== u.meshes[i].mat) { worst = Infinity; break; }
      for (let j = 0; j < a.length; j += 3) { const z = zr + (a[j + 2] - zr) * s; worst = Math.max(worst, Math.abs(a[j] + d[2] - b[j]), Math.abs(a[j + 1] + d[1] - b[j + 1]), Math.abs(z - d[0] - b[j + 2])); }
    }
    for (let i = 0; i < cu.piv.length && i < u.piv.length; i++) worst = Math.max(worst, Math.abs(cu.piv[i][0] + d[2] - u.piv[i][0]), Math.abs(cu.piv[i][1] + d[1] - u.piv[i][1]), Math.abs(cu.piv[i][2] - d[0] - u.piv[i][2]));
    if (!(worst <= 1e-5)) diffs.push(`${t.tag}: ${worst === Infinity ? 'another shape' : (worst * 1000).toFixed(4) + ' mm off'} (piece ${key})`);
  }
  for (const t of Object.keys(B.tags)) if (!seen.has(t)) diffs.push(`${t}: in the recipe's, not planned`);
  const got = Models.infoLeaves(cleanInfo(Object.fromEntries(Object.entries(plan.info).filter(([k]) => k !== 'mounts'))));
  for (const k of new Set([...Object.keys(got), ...Object.keys(B.leaves)])) { const x = got[k], y = B.leaves[k]; if (!(typeof x === 'number' && typeof y === 'number' ? Math.abs(x - y) <= 1e-8 : JSON.stringify(x) === JSON.stringify(y))) diffs.push(`info ${k}: planned ${JSON.stringify(x)}, recipe ${JSON.stringify(y)}`); }
  return diffs;
}

/** The shared registry of a bake: the shapes of every piece, for finding the ones that are the same up to a move. */
function makeRegistry() { return { bySig: new Map(), reps: [], n: 0 }; }
function register(reg, canon, scene, tag) {
  let list = reg.bySig.get(canon.sig);
  if (!list) reg.bySig.set(canon.sig, (list = []));
  for (const r of list) if (sameCanon(r.canon, canon)) return r;
  const r = { id: ++reg.n, canon, scene, tag, users: [] }; list.push(r); reg.reps.push(r); return r;
}

/**
 * One platform's job (tools/bake_worker.mjs, in whichever thread): its builds, rules, index and checks, and its pieces' scenes (kept in `keep` for the write jobs).
 * Returns plain data the driver merges with the other platforms'.
 */
export async function platformJob(env, Models, em, id, src, keep) {
  const t0 = Date.now(), logs = [];
  const cases = generate(env.G, id), regs = regressionsOf(env.G, [id]).cases.map((c) => c.build);
  const tm = [Date.now()];
  const C = collectBuilds(env, Models, id, { extra: [...cases.map((c) => c.build), ...regs], sweepBases: cases.filter((c) => /\b(loaded-last|bare)\b/.test(c.why)).map((c) => c.build) });
  tm.push(Date.now()); const L = learnPlatform(C); tm.push(Date.now()); const I = learnInfo(L, C); tm.push(Date.now()); const problems = [...L.problems, ...I.problems];
  if (problems.length) throw new Error(`${id}: the per-part rules do not explain the recipe:\n  ` + problems.slice(0, 12).join('\n  '));
  const learnt = C.memo.size;
  const { ix, pieces } = indexOf(C, L, I, Models, src);
  // the checks: every build the rules were learnt from, and a random sample of others, planned from the index by the game's planner
  tm.push(Date.now()); const lix = localIndex(ix, pieces), bad = [];
  for (const B of C.all()) { const d = checkBuild(Models, lix, pieces, B); if (d.length) bad.push(B.k + ': ' + d.slice(0, 3).join('; ')); }
  const seen = new Set(C.memo.keys()); let sampled = 0;
  for (const b of randomBuilds(env.GS, id, C.sw.bases, SAMPLE, 31337, seen, 2, 6)) { sampled++; const B = C.getB(b); const d = checkBuild(Models, lix, pieces, B); if (d.length) bad.push('SAMPLE ' + B.k + ': ' + d.slice(0, 3).join('; ')); }
  if (bad.length) throw new Error(`${id}: ${bad.length} builds do not assemble from the pieces as the recipe builds them:\n  ` + bad.slice(0, 8).join('\n  '));
  // the pieces' scenes (a capture build's meshes of the tag, as in that build), registered by shape for the sharing
  tm.push(Date.now()); const reg = makeRegistry(); let n = 0;
  for (const p of pieces) {
    const ps = p.key.split('#')[0].split('='), entry = { capture: p.obs.B, off: { rigid: [0, 0, 0] }, dep: ps[0] ? [ps[0]] : [], key: ps[0] ? [ps[1]] : [] };
    const { root, tris } = em.buildPack({ id, tag: p.tag, entry, name: `${id}.${p.tag}.${++n}` }), canon = canonOf(root);
    p.rep = reg.reps.indexOf(register(reg, canon, root, p.tag)); p.tris = tris; p.min = canon.min;
    p.nodes = [...new Set(p.obs.B.tags[p.tag].meshes.map((m) => m.node).filter((x) => x.startsWith('part_')))].sort();
  }
  keep.set(id, reg.reps.map((r) => r.scene));
  logs.push(`${id.padEnd(10)} ${String(learnt).padStart(5)} builds ${String(sampled).padStart(2)} sampled ${String(pieces.length).padStart(4)} pieces ${String(reg.reps.length).padStart(4)} shapes ${((Date.now() - t0) / 1000).toFixed(1)}s (builds ${(tm[1] - tm[0]) / 1000}, pieces ${(tm[2] - tm[1]) / 1000}, info ${(tm[3] - tm[2]) / 1000}, index ${(tm[4] - tm[3]) / 1000}, checks ${(tm[5] - tm[4]) / 1000}, scenes ${(Date.now() - tm[5]) / 1000} s)`);
  return {
    id, ix, pieces: pieces.map((p) => ({ tag: p.tag, key: p.key, Pcap: p.Pcap, stretch: p.stretch, rep: p.rep, tris: p.tris, min: p.min, nodes: p.nodes })),
    reps: reg.reps.map((r) => ({ tag: r.tag, canon: r.canon })), builds: C.memo.size, learnt, sampled, logs,
    stats: { tags: Object.keys(ix.tags).length, pieces: pieces.length, anchors: Object.values(ix.anchors).reduce((a, x) => a + Object.keys(x).length, 0), leaves: Object.keys(ix.info).length },
  };
}

/** Merges the platforms' piece shapes (in platform order) into one registry; each piece gets its registry entry. */
function mergeStates(states) {
  const reg = makeRegistry();
  for (const st of states) {
    const reps = st.reps.map((r, i) => register(reg, r.canon, { owner: st.id, local: i }, r.tag));
    for (const p of st.pieces) { p.rep = reps[p.rep]; p.rep.users.push({ id: st.id, p }); }
  }
  return reg;
}

/**
 * Writes every piece file and index of the platforms baked: pieces that are the same up to a move are one file. Names and places are decided here, in order (so
 * they are the same however many workers write); the files are written by `write(job)` (a worker holding the scene) concurrently.
 */
export async function writeAll(Models, states, reg, partial, log, write, progress = () => {}) {
  if (!partial) fs.rmSync(PARTS_DIR, { recursive: true, force: true });
  fs.mkdirSync(PARTS_DIR, { recursive: true });
  const written = new Map(), sharedNames = new Set(), jobs = [];
  let files = 0, sharedFiles = 0, done = 0;
  const sha = (s) => crypto.createHash('sha1').update(s).digest('hex').slice(0, 16);
  const usedLocal = new Map();
  const platOf = (id) => { if (!usedLocal.has(id)) { usedLocal.set(id, new Set()); fs.rmSync(PARTS_DIR + id, { recursive: true, force: true }); fs.mkdirSync(PARTS_DIR + id, { recursive: true }); } return usedLocal.get(id); };
  for (const st of states) platOf(st.id);
  const byPlat = {}; for (const st of states) byPlat[st.id] = { files: 0, bytes: 0, gz: 0 };
  const job = (w, j) => { jobs.push(write({ ...j, platform: j.rep.scene.owner, local: j.rep.scene.local }).then((r) => { w.bytes = r.bytes; w.gz = r.gz; progress(jobs.length, ++done); })); };
  /** A shape's file: shared when it is used at more than one place (platform or position), else a file of the platform. */
  const fileOf = (rep, st, p) => {
    let w = written.get(rep); if (w) return w;
    const places = new Set(rep.users.map((u) => u.id + '@' + u.p.min.map((x) => Math.round(x * 1e5)).join(',')));
    if (places.size <= 1) {
      const used = platOf(st.id), base = packFileName(rep.tag, [p.key.replace(/#/g, '@')]);
      let file = base, k = 1; while (used.has(file)) file = base.replace(/\.glb$/, '') + '-' + ++k + '.glb';
      used.add(file); w = { file, owner: st.id }; written.set(rep, w); files++;
      job(w, { rep, shared: false, tag: rep.tag, id: st.id, path: PARTS_DIR + st.id + '/' + file });
      return w;
    }
    const m = rep.canon.min;
    const h = sha(rep.canon.sig + '|' + rep.canon.meshes.map((mm) => { let s = 0; for (let i = 0; i < mm.v.length; i += 97) s = (s * 31 + Math.round((mm.v[i] - m[i % 3]) * 1e5)) | 0; return s; }).join(','));
    let file = SHARED + rep.tag.replace('@', '-on-') + '/' + h + '.glb', k = 1; while (sharedNames.has(file)) file = SHARED + rep.tag.replace('@', '-on-') + '/' + h + '-' + ++k + '.glb';
    sharedNames.add(file); w = { file, shared: true }; written.set(rep, w); sharedFiles++;
    job(w, { rep, shared: true, tag: rep.tag, id: '_shared', min: m, name: `_shared.${rep.tag}.${rep.id}`, path: PARTS_DIR + file });
    return w;
  };
  for (const st of states) for (const p of st.pieces) p.__w = fileOf(p.rep, st, p);
  progress(jobs.length, 0);
  await Promise.all(jobs);
  const sharedTotals = { bytes: 0, gz: 0 };
  for (const w of written.values()) { if (w.shared) { sharedTotals.bytes += w.bytes; sharedTotals.gz += w.gz; } else { const b = byPlat[w.owner]; b.files++; b.bytes += w.bytes; b.gz += w.gz; } }
  const summary = {};
  for (const st of states) {
    const { id, ix } = st;
    for (const p of st.pieces) {
      const w = p.__w; delete p.__w;
      // at: from the file's geometry to the piece with no part offsetting it: a shared file is stored from its bounding box's corner (min, glTF axes), a platform's
      // file as in its capture build; either way the capture's own offsets come off
      const corner = w.shared ? [-p.min[2], p.min[1], p.min[0]] : [0, 0, 0];
      const e = { file: w.file, at: [0, 1, 2].map((k) => r9(corner[k] - p.Pcap[k])), ...(p.nodes.length ? { nodes: p.nodes } : {}), tris: p.tris, bytes: w.bytes };
      if (p.stretch) Object.assign(e, { rear: r9(p.stretch.rear - corner[0]), len: r9(p.stretch.len), len0: r9(p.stretch.len0) });
      ix.tags[p.tag].pieces[p.key] = e;
    }
    const out = { ...ix, totals: { tags: st.stats.tags, pieces: st.stats.pieces, anchors: st.stats.anchors, leaves: st.stats.leaves, builds: st.builds, sampled: st.sampled } };
    const rep = Models.validatePartsIndex(out); if (rep.errors.length) throw new Error(`${id}: index breaks the contract:\n  ` + rep.errors.slice(0, 8).join('\n  '));
    const text = JSON.stringify(out); fs.writeFileSync(PARTS_DIR + id + '/index.json', text);
    summary[id] = { ...out.totals, index: text.length, indexGz: zlib.gzipSync(text, { level: 9 }).length, ...byPlat[id] };
  }
  return { summary, shared: { files: sharedFiles, ...sharedTotals }, files };
}

/**
 * Bakes the pieces of these platforms on a pool (tools/bake_pool.mjs). `order`: the ids slowest first; the results are merged in `ids` order whatever order they
 * finish in. Returns { fails, summary, shared, states }.
 */
export async function bakeParts(Models, pool, ids, { order = ids, log = console.log, partial = false, onPlatform = () => {}, onWrite = () => {}, phase = () => {} } = {}) {
  const results = new Map(), owner = new Map(); let fails = 0;
  phase('platforms');
  await Promise.all(order.map((id) => {
    const job = { type: 'platform', id };
    return pool.submit(job).then((r) => { results.set(id, r); owner.set(id, pool.ran(job)); onPlatform(r); }, (e) => { fails++; console.error('FAIL', id, (e && e.stack) || e); });
  }));
  if (fails) return { fails, summary: {}, shared: {}, states: [] };
  const states = ids.map((id) => results.get(id));
  phase('sharing');
  const reg = mergeStates(states);
  phase('writes');
  const w = await writeAll(Models, states, reg, partial, log, (j) => pool.submit({ type: 'write', ...j, rep: undefined }, { worker: owner.get(j.platform) }), onWrite);
  phase('indexes');
  return { fails: 0, summary: w.summary, shared: w.shared, states };
}
