// Negative tests for the model bundle (tools/model_bundles.mjs): a tiny fake models folder is bundled, must check clean and bundle byte-identically
// twice, and each way of breaking it must be reported.  node tools/bundle_models.test.mjs
import fs from 'fs'; import os from 'os'; import path from 'path';
import { loadBundles, writeBundles, check, readBundle, pack, gzip, hashOf } from './model_bundles.mjs';

const B = loadBundles(); let failed = 0, ran = 0;
const ok = (name, cond, extra = '') => { ran++; if (!cond) { failed++; console.error('FAIL ' + name + (extra ? ': ' + extra : '')); } };
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'rtb-'));
const put = (root, rel, data) => { const f = path.join(root, rel); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, data); };
const index = (files) => JSON.stringify({ version: 3, tags: { barrel: { from: ['barrel'], pieces: Object.fromEntries(files.map((file, i) => ['barrel=p' + i, { file, at: [0, 0, 0] }])) } } });
function tree() {
  const r = tmp();
  put(r, 'parts/aa/index.json', index(['barrel/a.glb', 'barrel/c.glb', '_shared/optic/s.glb', '_shared/optic/t.glb'])); put(r, 'parts/aa/barrel/a.glb', Buffer.from('glb-a')); put(r, 'parts/aa/barrel/c.glb', Buffer.from('glb-c'));
  put(r, 'parts/bb/index.json', index(['barrel/b.glb', '_shared/optic/s.glb'])); put(r, 'parts/bb/barrel/b.glb', Buffer.from('glb-bb'));
  put(r, 'parts/_shared/optic/s.glb', Buffer.from('shared')); put(r, 'parts/_shared/optic/t.glb', Buffer.from('shared2'));
  put(r, 'parts/index.json', '{}'); // (a bake report: never bundled)
  put(r, 'props/index.json', JSON.stringify({ version: 1, rounds: {}, keys: { '9x19': { file: 'round_9x19.glb' } }, quarrel: { file: 'quarrel.glb' } }));
  put(r, 'props/round_9x19.glb', Buffer.from('r')); put(r, 'props/quarrel.glb', Buffer.from('q'));
  put(r, 'guns/aa.glb', Buffer.from('whole')); // (not bundled)
  return r;
}
const errsOf = (r) => check(r, B);
const has = (errs, re) => errs.some((e) => re.test(e));
const bf = (r) => path.join(r, 'bundles', 'models.rtb'), mf = (r) => path.join(r, 'bundles', 'manifest.json');

// which paths are bundled
ok('bundleOf platform pack', B.bundleOf('assets/models/parts/m4/barrel/x.glb') === 'models');
ok('bundleOf index', B.bundleOf('parts/m4/index.json') === 'models');
ok('bundleOf shared', B.bundleOf('assets/models/parts/_shared/optic/h.glb') === 'models');
ok('bundleOf props', B.bundleOf('assets/models/props/quarrel.glb') === 'models');
ok('bundleOf guns / reports are not bundled', B.bundleOf('assets/models/guns/m4.glb') === null && B.bundleOf('assets/models/parts/index.json') === null);

// clean tree: checks clean, is deterministic, round-trips
const r1 = tree(); writeBundles(r1, B);
ok('clean tree checks clean', errsOf(r1).length === 0, errsOf(r1).join(' | '));
ok('exactly one bundle file, plus the two manifests', fs.readdirSync(path.join(r1, 'bundles')).sort().join() === 'index.json,manifest.json,models.rtb');
const r2 = tree(); writeBundles(r2, B);
ok('same input, byte-identical bundle and manifest', fs.readFileSync(bf(r1)).equals(fs.readFileSync(bf(r2))) && fs.readFileSync(mf(r1)).equals(fs.readFileSync(mf(r2))));
const all = readBundle(bf(r1), B);
ok('guns/ and the bake reports are not in the bundle', ![...all.keys()].some((p) => p.startsWith('guns/') || p === 'parts/index.json'));
ok('the reader slices a file out', all.get('parts/aa/barrel/a.glb').toString() === 'glb-a' && all.get('parts/_shared/optic/s.glb').toString() === 'shared' && all.get('props/quarrel.glb').toString() === 'q');
ok('the container is read raw too', (() => { const raw = pack([['x', Buffer.from('hello')], ['y', Buffer.from('w')]]); const f = path.join(r1, 'raw.rtb'); fs.writeFileSync(f, raw); const m = readBundle(f, B); return m.get('x').toString() === 'hello' && m.get('y').toString() === 'w' && gzip(raw)[9] === 255; })());
{ const old = tree(); put(old, 'bundles/aa.rtb', 'old per-platform bundle'); writeBundles(old, B); ok('old per-platform bundles are removed when rebundling', !fs.existsSync(path.join(old, 'bundles', 'aa.rtb')) && errsOf(old).length === 0); }

// negative: each break is reported
{ const r = tree(); writeBundles(r, B); fs.unlinkSync(bf(r)); const e = errsOf(r); ok('missing bundle', has(e, /models\.rtb is missing/), e.join(' | ')); }
{ const r = tree(); writeBundles(r, B); put(r, 'parts/aa/barrel/new.glb', Buffer.from('new')); const e = errsOf(r); ok('loose file not in the bundle', has(e, /new\.glb is not in bundle models/), e.join(' | ')); }
{ const r = tree(); writeBundles(r, B); put(r, 'parts/aa/barrel/a.glb', Buffer.from('changed')); const e = errsOf(r); ok('stale bundle (bytes differ)', has(e, /differs from the loose file/), e.join(' | ')); }
{ const r = tree(); writeBundles(r, B); fs.unlinkSync(path.join(r, 'parts/aa/barrel/a.glb')); const e = errsOf(r); ok('orphan entry (no loose file)', has(e, /orphan: parts\/aa\/barrel\/a\.glb is in bundle models but not on disk/), e.join(' | ')); }
{ const r = tree(); put(r, 'parts/aa/index.json', index(['barrel/a.glb', 'barrel/c.glb', '_shared/optic/s.glb', '_shared/optic/t.glb', 'barrel/ghost.glb'])); writeBundles(r, B); const e = errsOf(r); ok('index entry that resolves nowhere', has(e, /ghost\.glb is not in bundle models/), e.join(' | ')); }
{ const r = tree(); put(r, 'parts/aa/barrel/unused.glb', Buffer.from('u')); writeBundles(r, B); const e = errsOf(r); ok('a bundled pack no index names', has(e, /orphan: parts\/aa\/barrel\/unused\.glb in bundle models is named by no index/), e.join(' | ')); }
{ const r = tree(); writeBundles(r, B); fs.writeFileSync(bf(r), Buffer.from('garbage')); const e = errsOf(r); ok('corrupt bundle', has(e, /models\.rtb does not read/), e.join(' | ')); }
{ const r = tree(); writeBundles(r, B); fs.writeFileSync(path.join(r, 'bundles', 'zz.rtb'), fs.readFileSync(bf(r))); const e = errsOf(r); ok('a bundle file nothing wants', has(e, /zz\.rtb holds nothing/), e.join(' | ')); }
{ const r = tree(); writeBundles(r, B); fs.unlinkSync(path.join(r, 'bundles', 'index.json')); const e = errsOf(r); ok('missing index.json', has(e, /bundles\/index\.json missing/), e.join(' | ')); }
{ const r = tree(); writeBundles(r, B); fs.unlinkSync(path.join(r, 'parts/_shared/optic/s.glb')); const e = errsOf(r); ok('shared entry with no loose file', has(e, /orphan: parts\/_shared\/optic\/s\.glb is in bundle models but not on disk/), e.join(' | ')); }
{ const r = tree(); put(r, 'props/index.json', JSON.stringify({ version: 1, rounds: {}, keys: { '9x19': { file: 'round_missing.glb' } }, quarrel: { file: 'quarrel.glb' } })); writeBundles(r, B); const e = errsOf(r); ok('props index entry that resolves nowhere', has(e, /round_missing\.glb is not in bundle models/), e.join(' | ')); }

// the hash manifest the game fetches: { v: FORMAT (3), hash, size }
{ const r = tree(); writeBundles(r, B); const m = JSON.parse(fs.readFileSync(mf(r), 'utf8'));
  ok('manifest: v ' + B.FORMAT + ', a 16-hex hash, the gzipped size', m.v === B.FORMAT && B.FORMAT === 3 && /^[0-9a-f]{16}$/.test(m.hash) && m.size === fs.statSync(bf(r)).size && Object.keys(m).sort().join() === 'hash,size,v', JSON.stringify(m));
  ok('manifest: hash is of the .rtb bytes', m.hash === hashOf(fs.readFileSync(bf(r))));
  const r3 = tree(); put(r3, 'parts/aa/barrel/a.glb', Buffer.from('other')); writeBundles(r3, B); const m3 = JSON.parse(fs.readFileSync(mf(r3), 'utf8'));
  ok('manifest: any changed file gives a new hash', m3.hash !== m.hash); }
{ const r = tree(); writeBundles(r, B); fs.unlinkSync(mf(r)); const e = errsOf(r); ok('missing hash manifest', has(e, /manifest\.json missing/), e.join(' | ')); }
{ const r = tree(); writeBundles(r, B); const m = JSON.parse(fs.readFileSync(mf(r), 'utf8')); m.hash = '0'.repeat(16); fs.writeFileSync(mf(r), JSON.stringify(m)); const e = errsOf(r); ok('stale hash in the manifest', has(e, /wrong hash for models\.rtb/), e.join(' | ')); }
{ const r = tree(); writeBundles(r, B); const m = JSON.parse(fs.readFileSync(mf(r), 'utf8')); m.size += 1; fs.writeFileSync(mf(r), JSON.stringify(m)); const e = errsOf(r); ok('wrong size in the manifest', has(e, /wrong size for models\.rtb/), e.join(' | ')); }
{ const r = tree(); writeBundles(r, B); fs.writeFileSync(mf(r), '{"v":1,"bundles":{"aa":"0123456789abcdef"}}'); const e = errsOf(r); ok('the old per-bundle manifest is malformed now', has(e, /manifest\.json is malformed/), e.join(' | ')); }
{ const r = tree(); writeBundles(r, B); fs.writeFileSync(mf(r), '{"v":3}'); const e = errsOf(r); ok('malformed manifest', has(e, /manifest\.json is malformed/), e.join(' | ')); }
{ const r = tree(); writeBundles(r, B); const m = JSON.parse(fs.readFileSync(mf(r), 'utf8')); m.v = 2; fs.writeFileSync(mf(r), JSON.stringify(m)); const e = errsOf(r); ok('a manifest of the float32 format (v 2) is not this one', has(e, /manifest\.json is malformed/), e.join(' | ')); }

console.log(failed ? `${failed} of ${ran} bundle tests FAILED` : `bundle tests: ${ran} checks passed`);
process.exit(failed ? 1 : 0);
