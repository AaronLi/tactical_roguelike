// The model bundle (docs/models.md "Bundles"): packing the baked tree assets/models/{parts,props,scenes} into the ONE container file the game loads
// (assets/models/bundles/models.rtb), reading it back, and checking it. The container format, and which paths are bundled, are the game's own
// (js/modelbundles.ts, loaded here from dist/js): this file only writes what that reader reads, so the two cannot drift apart unnoticed.
// Pure functions over a models folder: tools/bundle_models.mjs is the command, tools/bundle_models.test.mjs the negative tests.
import fs from 'fs'; import vm from 'vm'; import path from 'path'; import zlib from 'zlib'; import crypto from 'crypto';
import { ROOT, DIST } from './model_env.mjs';

export const MODELS = path.join(ROOT, 'assets/models');

/** js/modelbundles.ts on its own: { bundleOf, parse, NAME, EXT, ... } (the very code the game runs). */
export function loadBundles() {
  const f = DIST + 'modelbundles.js';
  if (!fs.existsSync(f)) { console.error('dist/js/modelbundles.js missing: run tsc first (npm run bake:models / test:models do)'); process.exit(1); }
  const ctx = { console, JSON, Object, Array, Number, String, Map, Set, Error, Promise, Uint8Array, DataView, TextDecoder, setTimeout, G: {}, fetch: () => Promise.reject(new Error('no fetch')) };
  vm.createContext(ctx); vm.runInContext(fs.readFileSync(f, 'utf8'), ctx, { filename: 'modelbundles.js' });
  return ctx.G.Bundles;
}

const cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
/** Every file under parts/, props/ and scenes/ of the models folder that belongs in the bundle, as paths relative to it ('/'-separated), in byte order. */
export function listLoose(models, B) {
  const out = [];
  const walk = (dir, rel) => { for (const d of fs.readdirSync(dir, { withFileTypes: true })) { const r = rel + d.name; if (d.isDirectory()) walk(path.join(dir, d.name), r + '/'); else if (B.bundleOf(r)) out.push(r); } };
  for (const top of ['parts', 'props', 'scenes']) if (fs.existsSync(path.join(models, top))) walk(path.join(models, top), top + '/');
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

/** The content hash the game keys its local store by: sha256 of the .rtb bytes (the gzipped file as served), first 16 hex digits. */
export const hashOf = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex').slice(0, 16);

/** Writes assets/models/bundles/models.rtb (every loose file), bundles/index.json (for the tools) and bundles/manifest.json (what the game fetches); removes any other bundle file. Returns the index. */
export function writeBundles(models, B, log = () => {}) {
  const dir = path.join(models, 'bundles'); fs.mkdirSync(dir, { recursive: true });
  const paths = listLoose(models, B), raw = pack(paths.map((p) => [p, fs.readFileSync(path.join(models, p))])), z = gzip(raw);
  fs.writeFileSync(path.join(dir, B.NAME + B.EXT), z);
  log(`  ${B.NAME}${B.EXT}: ${paths.length} files, ${raw.length} B, ${z.length} B gzipped`);
  for (const f of fs.readdirSync(dir)) if (f.endsWith(B.EXT) && f !== B.NAME + B.EXT) fs.unlinkSync(path.join(dir, f)); // (the old per-platform bundles)
  const hash = hashOf(z), index = { version: B.FORMAT, name: B.NAME + B.EXT, files: paths.length, bytes: raw.length, gz: z.length, sha1: crypto.createHash('sha1').update(z).digest('hex'), hash };
  fs.writeFileSync(path.join(dir, 'index.json'), JSON.stringify(index, null, 1) + '\n');
  fs.writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify({ v: B.FORMAT, hash, size: z.length }) + '\n'); // (what the game fetches at boot: js/modelbundles.ts)
  return index;
}

/** Reads a bundle file back: Map(path -> Buffer) through the game's own reader. */
export function readBundle(file, B) {
  let buf = fs.readFileSync(file); if (buf[0] === 0x1f && buf[1] === 0x8b) buf = zlib.gunzipSync(buf);
  const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.length), { files } = B.parse(ab), out = new Map();
  for (const [p, [a, b]] of files) out.set(p, buf.subarray(a, b));
  return out;
}

/**
 * The bundle against the loose tree and the indexes. Errors (strings):
 *   - a loose file that belongs to the bundle but is not in it, or is in it with different bytes; an entry with no loose file (an orphan);
 *   - the bundle file missing or unreadable, another bundle file lying about; the manifests out of step with the file (bundles/manifest.json: v, hash, size);
 *   - an index entry (every pack of every platform index, the props) that does not resolve in the bundle; a bundled pack no index names.
 */
export function check(models, B) {
  const errs = [], dir = path.join(models, 'bundles'), paths = listLoose(models, B), file = path.join(dir, B.NAME + B.EXT);
  if (!paths.length) return ['no baked parts or props under ' + models];
  let ix = null; try { ix = JSON.parse(fs.readFileSync(path.join(dir, 'index.json'), 'utf8')); } catch { errs.push('bundles/index.json missing or unreadable: run npm run bake:models (or node tools/bundle_models.mjs)'); }
  let gm = null; try { gm = JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8')); } catch { errs.push('bundles/manifest.json missing or unreadable: run node tools/bundle_models.mjs'); }
  if (gm && (gm.v !== B.FORMAT || typeof gm.hash !== 'string' || !/^[0-9a-f]{16}$/.test(gm.hash) || !(gm.size > 0))) { errs.push(`bundles/manifest.json is malformed (want { v: ${B.FORMAT}, hash, size })`); gm = null; }
  for (const f of fs.existsSync(dir) ? fs.readdirSync(dir) : []) if (f.endsWith(B.EXT) && f !== B.NAME + B.EXT) errs.push(`bundle ${f} holds nothing the game loads (only ${B.NAME}${B.EXT} is wanted)`);
  if (!fs.existsSync(file)) { errs.push(`bundle ${B.NAME}${B.EXT} is missing (${paths.length} files belong in it)`); return errs; }
  let files; try { files = readBundle(file, B); } catch (e) { errs.push(`bundle ${B.NAME}${B.EXT} does not read: ${e.message}`); return errs; }
  const bytes = fs.readFileSync(file), sha = crypto.createHash('sha1').update(bytes).digest('hex');
  if (ix && (ix.sha1 !== sha || ix.files !== files.size)) errs.push(`bundles/index.json does not describe ${B.NAME}${B.EXT}`);
  if (gm && gm.hash !== hashOf(bytes)) errs.push(`bundles/manifest.json has the wrong hash for ${B.NAME}${B.EXT} (rebundle)`);
  if (gm && gm.size !== bytes.length) errs.push(`bundles/manifest.json has the wrong size for ${B.NAME}${B.EXT} (rebundle)`);
  for (const p of paths) {
    const e = files.get(p);
    if (!e) errs.push(`${p} is not in bundle ${B.NAME}`);
    else if (!e.equals(fs.readFileSync(path.join(models, p)))) errs.push(`${p} differs from the loose file (the bundle is stale: rebundle)`);
  }
  const want = new Set(paths);
  for (const p of files.keys()) if (!want.has(p)) errs.push(`orphan: ${p} is in bundle ${B.NAME} but not on disk (or does not belong to it)`);
  // every index entry resolves in the bundle, and every bundled pack is named by some index
  const named = new Set(), resolve = (p, why) => { named.add(p); if (!B.bundleOf(p)) errs.push(`${why}: ${p} belongs to no bundle`); else if (!files.has(p)) errs.push(`${why}: ${p} is not in bundle ${B.NAME}`); };
  for (const p of files.keys()) {
    if (p.startsWith('parts/') && p.endsWith('/index.json')) {
      const id = p.split('/')[1]; let px; try { px = JSON.parse(files.get(p).toString('utf8')); } catch { errs.push(`${p} is not JSON`); continue; }
      for (const t of Object.values(px.tags || {})) for (const e of Object.values(t.pieces || {})) if (e && e.file) resolve('parts/' + (e.file.startsWith('_shared/') ? '' : id + '/') + e.file, `${p} (${e.file})`);
    }
  }
  const pi = files.get('props/index.json');
  if (!pi) errs.push('props/index.json is not in the bundle');
  else { const px = JSON.parse(pi.toString('utf8')); named.add('props/index.json'); resolve('props/' + px.quarrel.file, 'props/index.json quarrel'); for (const [k, e] of Object.entries(px.keys)) resolve('props/' + e.file, `props/index.json ${k}`); }
  // the scenes (the hangar: tools/bake_hangar.mjs): scenes/index.json (beside the bundle, not in it) names each scene's glTF
  const sf = path.join(models, 'scenes/index.json');
  if (fs.existsSync(sf)) { let sx = null; try { sx = JSON.parse(fs.readFileSync(sf, 'utf8')); } catch { errs.push('scenes/index.json is not JSON'); } if (sx) for (const [k, e] of Object.entries(sx.scenes || {})) if (e.file) resolve('scenes/' + e.file, `scenes/index.json ${k}`); }
  for (const p of files.keys()) if (!named.has(p) && !p.endsWith('/index.json')) errs.push(`orphan: ${p} in bundle ${B.NAME} is named by no index`);
  return errs;
}
