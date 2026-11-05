// Bakes the per-part packs: assets/models/parts/<platform>/index.json + <tag>/<file>.glb, and the packs that are the same on every platform once in
// assets/models/parts/_shared/<tag>/<hash>.glb (docs/models.md, js/glb.ts GUN_MODEL_CONTRACT.packs).
// Called by tools/bake_models.mjs (`npm run bake:models`); `node tools/bake_models.mjs --parts [ids]` for just this part.
//
// Per platform (bakePlatform): build the sweep and random builds, analyse (model_packs.mjs: which slots shape which pack and which info leaf), then COVER: build
// one build for every valid combination of the parts in each pack's and each info table's dep slots and analyse again, until nothing new turns up. Then the
// index and the packs are made and every build of the set is assembled from them in memory and compared with the recipe (the bake fails if one differs).
// After all platforms (writeAll): packs that are the same shape up to a move are one file (shared when they are on more than one platform, or on one
// at several places), files and indexes written.
import fs from 'fs'; import path from 'path'; import zlib from 'zlib'; import crypto from 'crypto';
import { ROOT } from './model_env.mjs';
import { collect, analyze, analyzeInfo, cover, indexOf, verify, depSig, addRandom } from './model_packs.mjs';
import { makeEmitter, packFileName, canonOf, sameCanon } from './model_emit.mjs';

export const PARTS_DIR = path.join(ROOT, 'assets/models/parts/');
export const SHARED = '_shared/';
/** Random builds (beyond the sweep) the analysis learns interactions from, 2 to 6 parts changed at once. */
export const LEARN_BUILDS = +(process.env.MODELS_LEARN || 600);
/** Random builds tried per round once the analysis has settled (two clean rounds in a row end it). */
export const VALIDATE_BUILDS = +(process.env.MODELS_VALIDATE || 700);

/** The platforms whose packs are older than the recipe sources: returns their ids. */
export function staleParts(ids, src) {
  const stale = [];
  for (const id of ids) {
    const f = PARTS_DIR + id + '/index.json';
    if (!fs.existsSync(f) || JSON.parse(fs.readFileSync(f, 'utf8')).src !== src) stale.push(id);
  }
  return stale;
}

/** Whether a new entry with key `key` (replacing the entries `es`) would overlap an entry of `list` that gives another value and is not more specific: the planner would have to choose arbitrarily between them. */
function ambiguous(list, es, key, valueOf) {
  const stars = (k) => k.filter((x) => x === '*').length, v = valueOf(es[0]), s = stars(key);
  return list.some((e) => !es.includes(e) && valueOf(e) !== v && stars(e.key) >= s && e.key.every((x, j) => x === '*' || key[j] === '*' || x === key[j]));
}

/**
 * Where a tag's packs for every part seen in one dep slot (the rest of the key the same) are the very same pack (e.file), that slot does not shape the pack:
 * the entries become one with "*" in its place. (So an optic that sits the same on every barrel is one entry.) Returns the new pack list (entries are
 * replaced in place in ix.tags).
 */
export function collapse(ix, packs) {
  const norm = new Map(packs.map((p) => [p.entry, p]));
  const out = [];
  for (const [tag, ti] of Object.entries(ix.tags)) {
    let list = ti.packs;
    for (let again = true; again;) {
      again = false;
      for (let i = 0; i < ti.dep.length; i++) {
        const buckets = new Map();
        for (const e of list) { const k = e.key.map((v, j) => (j === i ? '#' : v)).join('|') + '|' + (e.file || ''); if (!buckets.has(k)) buckets.set(k, []); buckets.get(k).push(e); }
        const byOther = new Map();
        for (const e of list) { const k = e.key.map((v, j) => (j === i ? '#' : v)).join('|'); byOther.set(k, (byOther.get(k) || 0) + 1); }
        const next = [];
        for (const [k, es] of buckets) {
          const other = es[0].key.map((v, j) => (j === i ? '#' : v)).join('|');
          // collapsible: more than one entry, none already "*" in this slot, and they are ALL the entries with this rest-of-key
          if (es.length > 1 && es.length === byOther.get(other) && es.every((e) => e.key[i] !== '*')) {
            const key = es[0].key.map((v, j) => (j === i ? '*' : v));
            // (not where another entry with another pack covers part of the same builds as well as this one would: they would tie, and the pick between them is arbitrary)
            if (!ambiguous(list, es, key, (e) => e.file || '')) { const m = { ...es[0], key }; if (norm.has(es[0])) norm.set(m, norm.get(es[0])); next.push(m); again = true; continue; }
          }
          next.push(...es);
        }
        list = next;
      }
    }
    ti.packs = list; out.push(...list);
  }
  return out.filter((e) => norm.has(e)).map((e) => ({ tag: norm.get(e).tag, entry: e }));
}

/** The same for an info table's rows: the rows that differ only in one slot's part and give the same values become one with "*" there. */
export function collapseRows(dep, rows) {
  let list = rows;
  for (let again = true; again;) {
    again = false;
    for (let i = 0; i < dep.length; i++) {
      const byRest = new Map();
      for (const r of list) { const k = r.key.map((v, j) => (j === i ? '#' : v)).join('|'); if (!byRest.has(k)) byRest.set(k, []); byRest.get(k).push(r); }
      const next = [];
      for (const es of byRest.values()) {
        if (es.length > 1 && es.every((r) => r.key[i] !== '*') && new Set(es.map((r) => JSON.stringify(r.v))).size === 1) {
          const key = es[0].key.map((v, j) => (j === i ? '*' : v));
          if (!ambiguous(list, es, key, (r) => JSON.stringify(r.v))) { next.push({ key, v: es[0].v }); again = true; continue; }
        }
        next.push(...es);
      }
      list = next;
    }
  }
  return list;
}

/** The shared registry of a bake: the shapes of every pack seen, for finding the ones that are the same up to a move. */
function makeRegistry() { return { bySig: new Map(), reps: [], n: 0 }; }
function register(reg, canon, scene, tag) {
  let list = reg.bySig.get(canon.sig);
  if (!list) reg.bySig.set(canon.sig, (list = []));
  for (const r of list) if (sameCanon(r.canon, canon)) return r;
  const r = { id: ++reg.n, canon, scene, tag, users: [] }; list.push(r); reg.reps.push(r); return r;
}

/** Analyses, covers, indexes and verifies one platform; returns its state for writeAll. */
export async function bakePlatform(env, Models, em, reg, id, src, log) {
  const t0 = Date.now();
  const C = collect(env, Models, id, { learn: LEARN_BUILDS });
  let A, I, rounds = 0, clean = 0, rand = 0; const stats = {};
  // analyse, cover every combination of the dep slots, then try new random builds: if the analysis predicts them (learns no new dependency, needs no new
  // combination) twice running, it is done; any it gets wrong teach it the dependency and the loop goes on
  for (; rounds < 24; rounds++) {
    A = analyze(C); I = analyzeInfo(C);
    const sig = depSig(A, I);
    if (cover(C, A, I, stats)) { clean = 0; continue; }
    addRandom(C, VALIDATE_BUILDS, 5000 + 31 * rounds); rand += VALIDATE_BUILDS;
    const A2 = analyze(C), I2 = analyzeInfo(C);
    if (depSig(A2, I2) === sig) { if (++clean >= 2) { A = A2; I = I2; if (cover(C, A, I, stats)) { clean = 0; continue; } break; } } else clean = 0;
  }
  if (rounds >= 24) throw new Error(`${id}: the analysis did not settle`);
  const { ix, packs } = indexOf(A, I, Models, src);
  // the shapes: one scene per pack from its capture build, registered to find the ones that are the same up to a move
  let n = 0;
  for (const p of packs) {
    const { tag, entry } = p, { root, tris } = em.buildPack({ id, tag, entry, name: `${id}.${tag}.${++n}` }), canon = canonOf(root);
    const rep = register(reg, canon, root, tag);
    entry.rep = rep; entry.tris = tris; entry.min = canon.min;
    entry.file = rep.id + '@' + canon.min.map((x) => Math.round(x * 1e5)).join(','); // (the same shape in the same place: one file, for the collapse; the real names come in writeAll)
  }
  let res = verify(A, ix, packs, Models);
  const fail = (r) => `${id}: ${r.bad.length} builds do not assemble from the packs (first: ${JSON.stringify(r.bad[0])}), ${r.infoBad.length} have the wrong info (first: ${JSON.stringify(r.infoBad[0])})`;
  if (res.bad.length || res.infoBad.length) throw new Error(fail(res));
  // slots that do not shape a pack (or a table) become wildcards; every build must still assemble (else the full keys stay)
  const savedInfo = ix.info.map((t) => t.rows), savedTags = Object.fromEntries(Object.entries(ix.tags).map(([t, ti]) => [t, ti.packs]));
  ix.info.forEach((t) => { t.rows = collapseRows(t.dep, t.rows); });
  let res2 = verify(A, ix, packs, Models);
  if (res2.bad.length || res2.infoBad.length) { ix.info.forEach((t, i) => { t.rows = savedInfo[i]; }); log(`  ${id}: collapsing info rows broke ${res2.infoBad.length} leaves; kept the full keys`); }
  const packs2 = collapse(ix, packs);
  res2 = verify(A, ix, packs2, Models);
  let final = packs2;
  if (res2.bad.length || res2.infoBad.length) { for (const [t, l] of Object.entries(savedTags)) ix.tags[t].packs = l; final = packs; log(`  ${id}: collapsing keys broke ${res2.bad.length} builds (first: ${JSON.stringify(res2.bad[0])}) and ${res2.infoBad.length} leaves; kept the full keys`); }
  for (const e of final) e.entry.rep.users.push({ id, entry: e.entry });
  const joint = Object.entries(ix.tags).filter(([, t]) => t.dep.length > 1).map(([t, ti]) => `${t}(${ti.dep.join('+')}):${ti.packs.length}`);
  log(id.padEnd(10), String(C.memo.size).padStart(6), 'builds', String(C.all().filter((B) => B.cover).length).padStart(6), 'cover', String(rounds + 1), 'rounds', String(final.length).padStart(5), 'packs', String(ix.info.reduce((a, t) => a + t.rows.length, 0)).padStart(5), 'rows', `${((Date.now() - t0) / 1000).toFixed(1)}s`);
  return { id, ix, final, res, stats, builds: C.memo.size, cover: C.all().filter((B) => B.cover).length, rounds: rounds + 1, joint, infoDeps: ix.info.map((t) => `${t.dep.join('+') || '-'}:${t.rows.length}x${t.leaves.length}`) };
}

/** Writes every pack file and index of the platforms baked: packs that are the same up to a move are one file. */
export async function writeAll(em, Models, states, reg, partial, log) {
  if (!partial) fs.rmSync(PARTS_DIR, { recursive: true, force: true });
  fs.mkdirSync(PARTS_DIR, { recursive: true });
  const written = new Map(); // rep -> { file (relative to the platform folder or shared), bytes, gz }
  const sharedNames = new Set();
  let files = 0, sharedFiles = 0;
  const sha = (s) => crypto.createHash('sha1').update(s).digest('hex').slice(0, 16);
  const usedLocal = new Map(); // platform -> Set of file names
  const platOf = (id) => { if (!usedLocal.has(id)) { usedLocal.set(id, new Set()); fs.rmSync(PARTS_DIR + id, { recursive: true, force: true }); fs.mkdirSync(PARTS_DIR + id, { recursive: true }); } return usedLocal.get(id); };
  for (const st of states) platOf(st.id);
  const byPlat = {}; // totals per platform
  for (const st of states) byPlat[st.id] = { files: 0, bytes: 0, gz: 0 };
  /** A rep's file: shared when it is used at more than one place (platform or position), else a file of the platform. */
  const fileOf = async (rep, st, entry) => {
    let w = written.get(rep);
    const places = new Set(rep.users.map((u) => u.id + '@' + u.entry.min.map((x) => Math.round(x * 1e5)).join(',')));
    const shared = places.size > 1;
    if (!shared) {
      if (w) return w;
      const root = rep.scene, used = platOf(st.id);
      let file = packFileName(rep.tag, entry.key), k = 1; while (used.has(file)) file = packFileName(rep.tag, entry.key).replace(/\.glb$/, '') + '-' + ++k + '.glb';
      used.add(file);
      const wr = await em.write(root, st.id, rep.tag);
      fs.mkdirSync(path.dirname(PARTS_DIR + st.id + '/' + file), { recursive: true }); fs.writeFileSync(PARTS_DIR + st.id + '/' + file, wr.buf);
      w = { file, bytes: wr.buf.length, gz: wr.gz, owner: st.id }; written.set(rep, w); files++; byPlat[st.id].files++; byPlat[st.id].bytes += w.bytes; byPlat[st.id].gz += w.gz;
      return w;
    }
    if (w) return w;
    // shared: in its own frame (the corner of its bounding box at the origin), named by its shape
    const root = rep.scene, m = rep.canon.min;
    for (const c of root.children) c.position.set(c.position.x - m[0], c.position.y - m[1], c.position.z - m[2]);
    root.name = `_shared.${rep.tag}.${rep.id}`; root.userData = { pack: { platform: '_shared', tag: rep.tag, key: {} } };
    const h = sha(rep.canon.sig + '|' + rep.canon.meshes.map((mm) => { let s = 0; for (let i = 0; i < mm.v.length; i += 97) s = (s * 31 + Math.round((mm.v[i] - m[i % 3]) * 1e5)) | 0; return s; }).join(','));
    let file = SHARED + rep.tag + '/' + h + '.glb', k = 1; while (sharedNames.has(file)) file = SHARED + rep.tag + '/' + h + '-' + ++k + '.glb';
    sharedNames.add(file);
    const wr = await em.write(root, '_shared', rep.tag);
    fs.mkdirSync(path.dirname(PARTS_DIR + file), { recursive: true }); fs.writeFileSync(PARTS_DIR + file, wr.buf);
    w = { file, bytes: wr.buf.length, gz: wr.gz, shared: true }; written.set(rep, w); sharedFiles++; return w;
  };
  const sharedTotals = { bytes: 0, gz: 0 };
  const summary = {};
  for (const st of states) {
    const { id, ix, final } = st;
    for (const { entry } of final) {
      if (!entry.rep) continue;
      const w = await fileOf(entry.rep, st, entry);
      entry.file = w.file; entry.bytes = w.bytes;
      if (w.shared) entry.at = [-entry.min[2], entry.min[1], entry.min[0]].map((x) => Math.round(x * 1e9) / 1e9); // [forward, up, right] of the corner the stored shape is moved to
      else delete entry.at;
    }
    // pack entries with no meshes keep file null; the index as written: only what the contract lists
    const out = { ...ix, tags: Object.fromEntries(Object.entries(ix.tags).map(([t, ti]) => [t, { dep: ti.dep, packs: ti.packs.map((e) => ({ key: e.key, file: e.file, ...(e.file ? { ...(e.at ? { at: e.at } : {}), ...(e.nodes && e.nodes.length ? { nodes: e.nodes } : {}), tris: e.tris, bytes: e.bytes } : {}) })) }])) };
    out.totals = { ...ix.totals, entries: Object.values(ix.tags).reduce((a, t) => a + t.packs.length, 0), builds: st.builds, coverBuilds: st.cover, maxDevM: st.res.maxDev };
    const rep = Models.validatePartsIndex(out); if (rep.errors.length) throw new Error(`${id}: index breaks the contract:\n  ` + rep.errors.slice(0, 8).join('\n  '));
    const text = JSON.stringify(out); fs.writeFileSync(PARTS_DIR + id + '/index.json', text);
    summary[id] = { ...out.totals, index: text.length, indexGz: zlib.gzipSync(text, { level: 9 }).length, ...byPlat[id] };
  }
  for (const w of written.values()) if (w.shared) { sharedTotals.bytes += w.bytes; sharedTotals.gz += w.gz; }
  return { summary, shared: { files: sharedFiles, ...sharedTotals }, files };
}

/** Bakes the packs of these platforms. Returns { fails, summary, shared, stats }. */
export async function bakeParts(env, Models, ids, src, log = console.log, partial = false) {
  const em = await makeEmitter({ G: env.G, GM: env.GM, Models });
  const reg = makeRegistry(), states = []; let fails = 0;
  for (const id of ids) {
    try { states.push(await bakePlatform(env, Models, em, reg, id, src, log)); }
    catch (e) { fails++; console.error('FAIL', id, (e && e.stack) || e); }
  }
  if (fails) return { fails, summary: {}, shared: {}, states };
  const w = await writeAll(em, Models, states, reg, partial, log);
  return { fails, summary: w.summary, shared: w.shared, states };
}
