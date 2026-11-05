// Negative tests for the model bundles (tools/model_bundles.mjs): a tiny fake models folder is bundled, must check clean and bundle byte-identically
// twice, and each way of breaking it must be reported.  node tools/bundle_models.test.mjs
import fs from 'fs'; import os from 'os'; import path from 'path';
import { loadBundles, writeBundles, check, readBundle, pack, gzip } from './model_bundles.mjs';

const B = loadBundles(); let failed = 0, ran = 0;
const ok = (name, cond, extra = '') => { ran++; if (!cond) { failed++; console.error('FAIL ' + name + (extra ? ': ' + extra : '')); } };
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'rtb-'));
const put = (root, rel, data) => { const f = path.join(root, rel); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, data); };
const index = (packs) => JSON.stringify({ version: 2, tags: { barrel: { dep: ['barrel'], packs: packs.map((file) => ({ key: ['*'], file })) } } });
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

// where each path lives
ok('bundleOf platform pack', B.bundleOf('assets/models/parts/m4/barrel/x.glb') === 'm4');
ok('bundleOf index', B.bundleOf('parts/m4/index.json') === '_boot');
ok('bundleOf shared', B.bundleOf('assets/models/parts/_shared/optic/h.glb') === '_shared');
ok('bundleOf props', B.bundleOf('assets/models/props/quarrel.glb') === '_boot');
ok('bundleOf guns / reports are not bundled', B.bundleOf('assets/models/guns/m4.glb') === null && B.bundleOf('assets/models/parts/index.json') === null);

// clean tree: checks clean, is deterministic, round-trips
const r1 = tree(); writeBundles(r1, B);
ok('clean tree checks clean', errsOf(r1).length === 0, errsOf(r1).join(' | '));
const r2 = tree(); writeBundles(r2, B);
const same = ['_boot', '_shared', 'aa', 'bb'].every((n) => fs.readFileSync(path.join(r1, 'bundles', n + '.rtb')).equals(fs.readFileSync(path.join(r2, 'bundles', n + '.rtb'))));
ok('same input, byte-identical bundles', same);
ok('guns/ and the bake reports are not in any bundle', !fs.existsSync(path.join(r1, 'bundles', 'guns.rtb')) && ![...readBundle(path.join(r1, 'bundles', '_boot.rtb'), B).keys()].some((p) => p.startsWith('guns/') || p === 'parts/index.json'));
ok('the reader slices a file out', readBundle(path.join(r1, 'bundles', 'aa.rtb'), B).get('parts/aa/barrel/a.glb').toString() === 'glb-a');
ok('the container is read raw too', (() => { const raw = pack([['x', Buffer.from('hello')], ['y', Buffer.from('w')]]); const f = path.join(r1, 'raw.rtb'); fs.writeFileSync(f, raw); const m = readBundle(f, B); return m.get('x').toString() === 'hello' && m.get('y').toString() === 'w' && gzip(raw)[9] === 255; })());

// negative: each break is reported
{ const r = tree(); writeBundles(r, B); fs.unlinkSync(path.join(r, 'bundles', 'bb.rtb')); const e = errsOf(r); ok('missing bundle', has(e, /bb\.rtb is missing/) && has(e, /\(barrel\/b\.glb\): bundle bb is missing/), e.join(' | ')); }
{ const r = tree(); writeBundles(r, B); put(r, 'parts/aa/barrel/new.glb', Buffer.from('new')); const e = errsOf(r); ok('loose file not in its bundle', has(e, /new\.glb is not in bundle aa/), e.join(' | ')); }
{ const r = tree(); writeBundles(r, B); put(r, 'parts/aa/barrel/a.glb', Buffer.from('changed')); const e = errsOf(r); ok('stale bundle (bytes differ)', has(e, /differs from the loose file/), e.join(' | ')); }
{ const r = tree(); writeBundles(r, B); fs.unlinkSync(path.join(r, 'parts/aa/barrel/a.glb')); const e = errsOf(r); ok('orphan entry (no loose file)', has(e, /orphan: parts\/aa\/barrel\/a\.glb is in bundle aa but not on disk/), e.join(' | ')); }
{ const r = tree(); put(r, 'parts/aa/index.json', index(['barrel/a.glb', 'barrel/c.glb', '_shared/optic/s.glb', '_shared/optic/t.glb', 'barrel/ghost.glb'])); writeBundles(r, B); const e = errsOf(r); ok('index entry that resolves nowhere', has(e, /ghost\.glb is not in bundle aa/), e.join(' | ')); }
{ const r = tree(); put(r, 'parts/aa/barrel/unused.glb', Buffer.from('u')); writeBundles(r, B); const e = errsOf(r); ok('a bundled pack no index names', has(e, /orphan: parts\/aa\/barrel\/unused\.glb in bundle aa is named by no index/), e.join(' | ')); }
{ const r = tree(); writeBundles(r, B); fs.writeFileSync(path.join(r, 'bundles', 'aa.rtb'), Buffer.from('garbage')); const e = errsOf(r); ok('corrupt bundle', has(e, /aa\.rtb does not read/), e.join(' | ')); }
{ const r = tree(); writeBundles(r, B); fs.writeFileSync(path.join(r, 'bundles', 'zz.rtb'), fs.readFileSync(path.join(r, 'bundles', 'aa.rtb'))); const e = errsOf(r); ok('a bundle nothing wants', has(e, /zz\.rtb holds nothing/), e.join(' | ')); }
{ const r = tree(); writeBundles(r, B); fs.unlinkSync(path.join(r, 'bundles', 'index.json')); const e = errsOf(r); ok('missing manifest', has(e, /bundles\/index\.json missing/), e.join(' | ')); }
{ const r = tree(); writeBundles(r, B); fs.unlinkSync(path.join(r, 'parts/_shared/optic/s.glb')); const e = errsOf(r); ok('shared entry with no loose file', has(e, /orphan: parts\/_shared\/optic\/s\.glb is in bundle _shared but not on disk/), e.join(' | ')); }
{ const r = tree(); put(r, 'props/index.json', JSON.stringify({ version: 1, rounds: {}, keys: { '9x19': { file: 'round_missing.glb' } }, quarrel: { file: 'quarrel.glb' } })); writeBundles(r, B); const e = errsOf(r); ok('props index entry that resolves nowhere', has(e, /round_missing\.glb is not in bundle _boot/), e.join(' | ')); }

console.log(failed ? `${failed} of ${ran} bundle tests FAILED` : `bundle tests: ${ran} checks passed`);
process.exit(failed ? 1 : 0);
