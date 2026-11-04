// Bakes the per-part packs: assets/models/parts/<platform>/index.json + <tag>/<file>.glb (docs/models.md, js/glb.ts GUN_MODEL_CONTRACT.packs).
// Called by tools/bake_models.mjs (`npm run bake:models`); `node tools/bake_models.mjs --parts [ids]` for just this part.
import fs from 'fs'; import path from 'path'; import zlib from 'zlib';
import { ROOT } from './model_env.mjs';
import { collect, analyze, indexOf, verify } from './model_packs.mjs';
import { makeEmitter, packFileName } from './model_emit.mjs';

export const PARTS_DIR = path.join(ROOT, 'assets/models/parts/');
/** Random builds (beyond the sweep) the analysis learns interactions from: more means fewer wrong guesses and more packs. */
export const LEARN_BUILDS = 240;

/** The platforms whose packs are older than the recipe sources: returns their ids. */
export function staleParts(ids, src) {
  const stale = [];
  for (const id of ids) {
    const f = PARTS_DIR + id + '/index.json';
    if (!fs.existsSync(f) || JSON.parse(fs.readFileSync(f, 'utf8')).src !== src) stale.push(id);
  }
  return stale;
}

/**
 * Where a tag's packs for every part seen in one dep slot (the rest of the key the same) are the very same file, that slot does not shape the pack:
 * the entries become one with "*" in its place. (So an optic that sits the same on every barrel is one entry, and a combination the sweep never saw
 * is covered too.) Returns the new pack list (entries are replaced in place in ix.tags).
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
        for (const e of list) { const k = e.key.map((v, j) => (j === i ? '#' : v)).join('|') + '|' + (e.file || '') + '|' + JSON.stringify(e.stretch || null); if (!buckets.has(k)) buckets.set(k, []); buckets.get(k).push(e); }
        const byOther = new Map();
        for (const e of list) { const k = e.key.map((v, j) => (j === i ? '#' : v)).join('|'); byOther.set(k, (byOther.get(k) || 0) + 1); }
        const next = [];
        for (const [k, es] of buckets) {
          const other = es[0].key.map((v, j) => (j === i ? '#' : v)).join('|');
          // collapsible: more than one entry, none already "*" in this slot, and they are ALL the entries with this rest-of-key
          if (es.length > 1 && es.length === byOther.get(other) && es.every((e) => e.key[i] !== '*')) { const m = { ...es[0], key: es[0].key.map((v, j) => (j === i ? '*' : v)) }; if (norm.has(es[0])) norm.set(m, norm.get(es[0])); next.push(m); again = true; }
          else next.push(...es);
        }
        list = next;
      }
    }
    ti.packs = list; out.push(...list);
  }
  return out.filter((e) => norm.has(e)).map((e) => ({ tag: norm.get(e).tag, entry: Object.assign(norm.get(e).entry === e ? e : e, {}) }));
}

/** Bakes the packs of these platforms. Returns { fails, totals }. */
export async function bakeParts(env, Models, ids, src, log = console.log) {
  const em = await makeEmitter({ G: env.G, GM: env.GM, Models });
  fs.mkdirSync(PARTS_DIR, { recursive: true });
  const summary = {}; let fails = 0;
  for (const id of ids) {
    const t0 = Date.now();
    try {
      const C = collect(env, Models, id, { extra: LEARN_BUILDS }), A = analyze(C), { ix, packs } = indexOf(A, Models, src), res = verify(A, ix, packs, Models);
      if (res.bad.length || res.infoBad) {
        for (const b of res.bad.slice(0, 5)) log(`  ${id}: assembled ${b.tag} differs from the recipe by ${b.dev} m in ${b.key}`);
        throw new Error(`${id}: ${res.bad.length} builds of the sweep do not assemble from the packs, ${res.infoBad} have the wrong info`);
      }
      const dir = PARTS_DIR + id + '/'; fs.rmSync(dir, { recursive: true, force: true }); fs.mkdirSync(dir, { recursive: true });
      const byHash = new Map(), used = new Set(); let files = 0, bytes = 0, gz = 0, n = 0;
      for (const { tag, entry } of packs) {
        const name = `${id}.${tag}.${++n}`, { root, hash, tris } = em.buildPack({ id, tag, entry, name }), hk = tag + '|' + hash;
        let f = byHash.get(hk);
        if (!f) {
          let file = packFileName(tag, entry.key), k = 1; while (used.has(file)) file = packFileName(tag, entry.key).replace(/\.glb$/, '') + '-' + ++k + '.glb';
          used.add(file);
          const w = await em.write(root, id, tag);
          fs.mkdirSync(path.dirname(dir + file), { recursive: true }); fs.writeFileSync(dir + file, w.buf);
          f = { file, bytes: w.buf.length, gz: w.gz, tris }; byHash.set(hk, f); files++; bytes += f.bytes; gz += f.gz;
        }
        entry.file = f.file; entry.bytes = f.bytes; entry.tris = f.tris;
      }
      // slots that do not shape a pack become wildcards; the sweep must still assemble (else keep the keys as they were)
      const before = JSON.stringify(Object.fromEntries(Object.entries(ix.tags).map(([t, ti]) => [t, ti.packs.length])));
      const saved = Object.fromEntries(Object.entries(ix.tags).map(([t, ti]) => [t, ti.packs]));
      const packs2 = collapse(ix, packs), res2 = verify(A, ix, packs2, Models);
      let collapsed = true;
      if (res2.bad.length || res2.infoBad) { for (const [t, l] of Object.entries(saved)) ix.tags[t].packs = l; collapsed = false; log(`  ${id}: collapsing keys broke ${res2.bad.length} builds; kept the full keys`); }
      // the index as written: only what the contract lists
      const out = { ...ix, tags: Object.fromEntries(Object.entries(ix.tags).map(([t, ti]) => [t, { dep: ti.dep, packs: ti.packs.map((e) => ({ key: e.key, file: e.file, ...(e.stretch ? { stretch: e.stretch } : {}), ...(e.file ? { tris: e.tris, bytes: e.bytes } : {}) })) }])) };
      out.totals = { ...ix.totals, entries: Object.values(ix.tags).reduce((a, t) => a + t.packs.length, 0), files, bytes, gz, sweepBuilds: res.builds, exactBuilds: res.exact, stretchBuilds: res.stretch, maxDevM: res.maxDev };
      const rep = Models.validatePartsIndex(out); if (rep.errors.length) throw new Error(`${id}: index breaks the contract:\n  ` + rep.errors.join('\n  '));
      const text = JSON.stringify(out); fs.writeFileSync(dir + 'index.json', text);
      const ixGz = zlib.gzipSync(text, { level: 9 }).length;
      summary[id] = { ...out.totals, index: text.length, indexGz: ixGz };
      log(id.padEnd(10), String(res.builds).padStart(4), 'builds', String(packs.length).padStart(4), 'packs', String(files).padStart(4), 'files', String(bytes).padStart(8), 'B', String(gz).padStart(8), 'gz  index', String(text.length).padStart(7), '/', String(ixGz).padStart(6), 'gz', `${((Date.now() - t0) / 1000).toFixed(1)}s`);
    } catch (e) { fails++; console.error('FAIL', id, (e && e.stack) || e); }
  }
  return { fails, summary };
}
