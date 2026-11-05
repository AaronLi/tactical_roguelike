// The model bundles (docs/models.md "Bundles"): packing the baked tree assets/models/{parts,props} into the container files the game loads
// (assets/models/bundles/*.rtb), reading them back, and checking them. The container format, and which bundle holds which path, are the game's own
// (js/modelbundles.ts, loaded here from dist/js): this file only writes what that reader reads, so the two cannot drift apart unnoticed.
// Pure functions over a models folder: tools/bundle_models.mjs is the command, tools/bundle_models.test.mjs the negative tests.
import fs from 'fs'; import vm from 'vm'; import path from 'path'; import zlib from 'zlib'; import crypto from 'crypto';
import { ROOT, DIST } from './model_env.mjs';

export const MODELS = path.join(ROOT, 'assets/models');

/** js/modelbundles.ts on its own: { bundleOf, parse, ... } (the very code the game runs). */
export function loadBundles() {
  const f = DIST + 'modelbundles.js';
  if (!fs.existsSync(f)) { console.error('dist/js/modelbundles.js missing: run tsc first (npm run bake:models / test:models do)'); process.exit(1); }
  const ctx = { console, JSON, Object, Array, Number, String, Map, Set, Error, Promise, Uint8Array, DataView, TextDecoder, G: {}, fetch: () => Promise.reject(new Error('no fetch')) };
  vm.createContext(ctx); vm.runInContext(fs.readFileSync(f, 'utf8'), ctx, { filename: 'modelbundles.js' });
  return ctx.G.Bundles;
}

const cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
/** Every file under parts/ and props/ of the models folder, as paths relative to it ('/'-separated), in byte order. */
export function listLoose(models, B) {
  const out = [];
  const walk = (dir, rel) => { for (const d of fs.readdirSync(dir, { withFileTypes: true })) { const r = rel + d.name; if (d.isDirectory()) walk(path.join(dir, d.name), r + '/'); else if (B.bundleOf(r)) out.push(r); } };
  for (const top of ['parts', 'props']) if (fs.existsSync(path.join(models, top))) walk(path.join(models, top), top + '/');
  return out.sort(cmp);
}

/** The container: RTB1, u32 tocLength, the table of contents (JSON), padding to 4, the files back to back. `files` = [[path, Buffer]] in the order to store. */
export function pack(files) {
  let off = 0; const toc = files.map(([p, b]) => { const e = [p, off, b.length]; off += b.length; return e; });
  const tocBuf = Buffer.from(JSON.stringify({ files: toc }), 'utf8'), head = Buffer.alloc(8);
  head.write('RTB1', 0, 'latin1'); head.writeUInt32LE(tocBuf.length, 4);
  const pad = Buffer.alloc((4 - ((8 + tocBuf.length) % 4)) % 4);
  return Buffer.concat([head, tocBuf, pad, ...files.map(([, b]) => b)]);
}
/** Gzipped the same on every machine: level 9, and the header's OS byte fixed (zlib puts the platform's there). */
export function gzip(buf) { const z = zlib.gzipSync(buf, { level: 9 }); z[9] = 255; return z; }

/** { name: [paths] } for the loose files (sorted). */
export function groups(models, B) {
  const g = {};
  for (const p of listLoose(models, B)) (g[B.bundleOf(p)] || (g[B.bundleOf(p)] = [])).push(p);
  return Object.fromEntries(Object.keys(g).sort(cmp).map((k) => [k, g[k]]));
}

/** Writes assets/models/bundles/<name>.rtb for every group and bundles/index.json; removes bundle files that are no longer wanted. Returns the manifest. */
export function writeBundles(models, B, log = () => {}) {
  const dir = path.join(models, 'bundles'); fs.mkdirSync(dir, { recursive: true });
  const bundles = {}, g = groups(models, B);
  for (const [name, paths] of Object.entries(g)) {
    const raw = pack(paths.map((p) => [p, fs.readFileSync(path.join(models, p))])), z = gzip(raw);
    fs.writeFileSync(path.join(dir, name + B.EXT), z);
    bundles[name] = { files: paths.length, bytes: raw.length, gz: z.length, sha1: crypto.createHash('sha1').update(z).digest('hex') };
    log(`  ${name}${B.EXT}: ${paths.length} files, ${raw.length} B, ${z.length} B gzipped`);
  }
  for (const f of fs.readdirSync(dir)) if (f.endsWith(B.EXT) && !(f.slice(0, -B.EXT.length) in bundles)) fs.unlinkSync(path.join(dir, f));
  const t = Object.values(bundles), sum = (k) => t.reduce((a, x) => a + x[k], 0);
  const manifest = { version: 1, bundles, totals: { bundles: t.length, files: sum('files'), bytes: sum('bytes'), gz: sum('gz') } };
  fs.writeFileSync(path.join(dir, 'index.json'), JSON.stringify(manifest, null, 1) + '\n');
  return manifest;
}

/** Reads a bundle file back: { files: Map(path -> Buffer) } through the game's own reader. */
export function readBundle(file, B) {
  let buf = fs.readFileSync(file); if (buf[0] === 0x1f && buf[1] === 0x8b) buf = zlib.gunzipSync(buf);
  const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.length), { files } = B.parse(ab), out = new Map();
  for (const [p, [a, b]] of files) out.set(p, buf.subarray(a, b));
  return out;
}

/**
 * The bundles against the loose tree and the indexes. Errors (strings):
 *   - a loose file that belongs to a bundle but is not in it, or is in it with different bytes; an entry with no loose file (an orphan);
 *   - a bundle file missing for a group, or one that no group wants; the manifest out of step with the files;
 *   - an index entry (every pack of every platform index, the props) that does not resolve in its bundle; a bundled pack no index names.
 */
export function check(models, B) {
  const errs = [], dir = path.join(models, 'bundles'), g = groups(models, B);
  if (!Object.keys(g).length) return ['no baked parts or props under ' + models];
  let manifest = null; try { manifest = JSON.parse(fs.readFileSync(path.join(dir, 'index.json'), 'utf8')); } catch { errs.push('bundles/index.json missing or unreadable: run npm run bake:models (or node tools/bundle_models.mjs)'); }
  const have = {};
  for (const name of Object.keys(g)) {
    const f = path.join(dir, name + B.EXT);
    if (!fs.existsSync(f)) { errs.push(`bundle ${name}${B.EXT} is missing (${g[name].length} files belong in it)`); continue; }
    let files; try { files = readBundle(f, B); } catch (e) { errs.push(`bundle ${name}${B.EXT} does not read: ${e.message}`); continue; }
    have[name] = files;
    const sha = crypto.createHash('sha1').update(fs.readFileSync(f)).digest('hex');
    if (manifest && (!manifest.bundles[name] || manifest.bundles[name].sha1 !== sha || manifest.bundles[name].files !== files.size)) errs.push(`bundles/index.json does not describe ${name}${B.EXT}`);
    for (const p of g[name]) {
      const e = files.get(p);
      if (!e) errs.push(`${p} is not in bundle ${name}`);
      else if (!e.equals(fs.readFileSync(path.join(models, p)))) errs.push(`${p} differs from the loose file (bundle ${name} is stale: rebundle)`);
    }
    const want = new Set(g[name]);
    for (const p of files.keys()) if (!want.has(p)) errs.push(`orphan: ${p} is in bundle ${name} but not on disk (or does not belong to it)`);
  }
  for (const f of fs.existsSync(dir) ? fs.readdirSync(dir) : []) if (f.endsWith(B.EXT) && !(f.slice(0, -B.EXT.length) in g)) errs.push(`bundle ${f} holds nothing the tree has`);
  if (manifest) for (const n of Object.keys(manifest.bundles)) if (!(n in g)) errs.push(`bundles/index.json lists ${n}, which has no files`);
  // every index entry resolves in the bundle the game would ask, and every bundled pack is named by some index
  const named = new Set(), resolve = (p, why) => {
    named.add(p); const b = B.bundleOf(p);
    if (!b) errs.push(`${why}: ${p} belongs to no bundle`); else if (!have[b]) errs.push(`${why}: bundle ${b} is missing`); else if (!have[b].has(p)) errs.push(`${why}: ${p} is not in bundle ${b}`);
  };
  const boot = have[B.BOOT];
  if (boot) {
    for (const p of boot.keys()) {
      if (p.startsWith('parts/') && p.endsWith('/index.json')) {
        const id = p.split('/')[1]; let ix; try { ix = JSON.parse(boot.get(p).toString('utf8')); } catch (e) { errs.push(`${p} is not JSON`); continue; }
        for (const t of Object.values(ix.tags || {})) for (const e of t.packs || []) if (e.file) resolve('parts/' + (e.file.startsWith('_shared/') ? '' : id + '/') + e.file, `${p} (${e.file})`);
      }
    }
    const pi = boot.get('props/index.json');
    if (!pi) errs.push('props/index.json is not in the boot bundle');
    else { const ix = JSON.parse(pi.toString('utf8')); named.add('props/index.json'); resolve('props/' + ix.quarrel.file, 'props/index.json quarrel'); for (const [k, e] of Object.entries(ix.keys)) resolve('props/' + e.file, `props/index.json ${k}`); }
  }
  for (const [name, files] of Object.entries(have)) for (const p of files.keys()) if (!named.has(p) && !p.endsWith('/index.json')) errs.push(`orphan: ${p} in bundle ${name} is named by no index`);
  return errs;
}
