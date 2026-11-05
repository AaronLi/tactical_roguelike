// Negative tests for authored parts (models/parts/<slot>/<id>/, js/glb.ts GUN_MODEL_CONTRACT.authoredParts, tools/authored_parts.mjs): each broken part must produce
// the expected message, and the real parts must pass.   node tools/check_authored_parts.test.mjs
import fs from 'fs'; import path from 'path';
import { loadModels, ROOT } from './model_env.mjs';
import { authoredPartKeys, checkAuthoredPart, checkGeometry, boundsOf, readAuthoredPart, entryOf, partsTsWithBlock, PARTS_TS } from './authored_parts.mjs';
const M = loadModels(); let bad = 0, n = 0;
const run = (label, msgs, re) => {
  n++; const all = msgs.join('\n'), ok = re === null ? msgs.length === 0 : re.test(all);
  if (!ok) { bad++; console.error(`FAIL ${label}: expected ${re}, got:\n  ${all || '(nothing)'}`); } else console.log('ok   ' + label);
};
const cfg0 = () => JSON.parse(fs.readFileSync(path.join(ROOT, 'models/parts/optic/falcon/model.json'), 'utf8'));
const conf = (label, mut, re) => { const c = cfg0(); mut(c); run('part config: ' + label, M.validateAuthoredPartConfig(c, 'falcon'), re); };
// the real parts
for (const k of authoredPartKeys()) { const r = checkAuthoredPart(M, k); run(`part ${k} is valid`, r.errors, null); }
conf('the Falcon is valid', () => {}, null);
conf('a gun is not a part', (c) => { c.kind = 'gun'; }, /"kind" is "gun"/);
conf('an unknown slot', (c) => { c.slot = 'barrel'; }, /"slot" is "barrel", expected one of optic/);
conf('a wrong frame', (c) => { c.frame = 'muzzle'; }, /"frame" is "muzzle", expected "rail-top"/);
conf('an unknown field', (c) => { c.speling = 1; }, /unknown field "speling"/);
conf('no optic data', (c) => { delete c.optic; }, /"optic" is missing/);
conf('sy in the wrong units (mm)', (c) => { c.optic.sy = 28.5; }, /optic\.sy: 28\.5 is out of range/);
conf('no window and no lens', (c) => { delete c.optic.reflex; delete c.optic.magnifier; }, /needs a reflex window or a pip lens/);
conf('the window is off the line of sight', (c) => { c.optic.reflex.y = 0.034; }, /optic\.reflex\.y \(0\.034\) is not optic\.sy \(0\.0285\): .*reticle will not line up/);
conf('a bad reticle kind', (c) => { c.optic.reflex.kind = 'laser'; }, /optic\.reflex\.kind: "laser"/);
conf('a magnifier with no window', (c) => { c.optic.pip = { f: 0, y: 0.0285, r: 0.012 }; delete c.optic.reflex; c.part.scoped = true; c.part.reticle = 'cross'; c.part.px = 4; }, /optic\.magnifier is true but there is no reflex window/);
conf('a pip lens needs the scope data', (c) => { delete c.optic.reflex; c.optic.magnifier = false; c.optic.pip = { f: 0, y: 0.0285, r: 0.012 }; }, /part\.scoped must be true for a sight with a pip lens/);
conf('a scope data on a reflex sight', (c) => { c.part.px = 4; }, /part\.px is for a magnified sight/);
conf('a mount nothing provides', (c) => { c.part.mount = 'br:556'; }, /part\.mount: "br:556" must be one of op:pic/);
conf('a zoom outside 0.2-1', (c) => { c.part.zoom = 1.4; }, /part\.zoom: expected the ADS FOV multiplier/);
conf('a stat that is not a number', (c) => { c.part.st = { ergo: 'a lot' }; }, /part\.st: expected an object of stat deltas/);
conf('an unknown part field', (c) => { c.part.colour = 'red'; }, /part: unknown field "colour"/);
conf('a folder name that is not an id', (c) => { run('', [], null); n--; const r = M.validateAuthoredPartConfig(c, 'Bad-Name'); if (!/folder name "Bad-Name"/.test(r.join())) { bad++; console.error('FAIL part config: a folder name that is not an id'); } else console.log('ok   part config: a folder name that is not an id'); }, null);
// the node tree
const mesh = (name, slot = 'optic', mat = 'black', extra = {}, uv = false) => ({ name, extras: { slot, ...extra }, mesh: true, uv, materials: [mat], children: [] });
const tree = (kids, name = 'falcon', extras = {}) => ({ roots: [{ name, extras, mesh: false, uv: false, materials: [], children: kids }] });
const T = (label, desc, re) => run('part tree: ' + label, (({ errors, warnings }) => [...errors, ...warnings])(M.validateAuthoredPart(desc, 'falcon')), re);
T('minimal part is valid', tree([mesh('optic_1')]), null);
T('two roots', { roots: [tree([mesh('optic_1')]).roots[0], tree([mesh('optic_1')]).roots[0]] }, /2 root nodes/);
T('the root is named for the folder', tree([mesh('optic_1')], 'reddot'), /root node is named "reddot", expected "falcon"/);
T('a mesh in another slot', tree([mesh('optic_1'), mesh('barrel_2', 'barrel')]), /extras\.slot is "barrel", expected "optic"/);
T('a mesh name that is not <slot>_<n>', tree([mesh('lens')]), /must be named "optic_<n>"/);
T('an unknown material', tree([mesh('optic_1', 'optic', 'chrome')]), /material 'chrome' is not in the catalogue/);
T('a part_ node', tree([mesh('optic_1'), { name: 'part_ch', extras: { part: 'ch' }, mesh: false, uv: false, materials: [], children: [] }]), /flat meshes under the root/);
T('sight data on the root', tree([mesh('optic_1')], 'falcon', { info: {} }), /no extras\.info or extras\.anchors/);
T('no meshes', tree([]), /the part has no meshes/);
T('a display without UVs', tree([mesh('optic_1'), mesh('display_ret', 'optic', 'dot', { display: { width: 64, height: 64 } })]), /display "display_ret": has no UVs/);
T('a display with UVs is valid', tree([mesh('optic_1'), mesh('display_ret', 'optic', 'dot', { display: { width: 64, height: 64 } }, true)]), null);
// the geometry (the file's bounds against the config)
const falcon = readAuthoredPart('optic/falcon'), B0 = () => { const b = boundsOf(falcon.meshes); return { min: b.min.slice(), max: b.max.slice() }; };
const G = (label, mut, re, cmut) => { const b = B0(), c = cfg0(); mut(b); if (cmut) cmut(c); run('part geometry: ' + label, checkGeometry('optic', c, b), re); };
G('the Falcon is valid', () => {}, null);
G('geometry under the rail', (b) => { b.min[1] = -0.012; }, /reaches 12\.0 mm below the origin/);
G('a part floating above the rail', (b) => { b.min[1] = 0.01; }, /lowest vertex is 10\.0 mm above the origin/);
G('wrong units (millimetres)', (b) => { b.min[2] = -60; b.max[2] = 12; }, /outside -120\.0 mm to 120\.0 mm/);
G('off the rail centre', (b) => { b.min[0] += 0.02; b.max[0] += 0.02; }, /not centred on the rail/);
G('too wide', (b) => { b.min[0] = -0.06; b.max[0] = 0.06; }, /half-width 60\.0 mm is over 40\.0 mm/);
G('too tall', (b) => { b.max[1] = 0.2; }, /height 200\.0 mm is over 150\.0 mm/);
G('the window above the model', () => {}, /the reflex window .* is outside the model's height/, (c) => { c.optic.reflex.y = 0.07; c.optic.sy = 0.07; });
G('the window wider than the model', () => {}, /the reflex window is 120\.0 mm wide, wider than the model/, (c) => { c.optic.reflex.w = 0.12; });
G('the window outside the model forward', () => {}, /the reflex window is at forward 200\.0 mm, outside the model/, (c) => { c.optic.reflex.f = 0.2; });
G('fSight forward of the window', () => {}, /fSight is the rear\/eye side/, (c) => { c.optic.fSight = 0.02; });
// the catalogue entry and the generated block
const entry = entryOf('optic/falcon', cfg0());
run('the catalogue id is derived', entry.id === 'op.auth.falcon' && entry.model.apart === 'optic/falcon' && entry.model.optic === 'authored' && entry.model.ret === 'dot' && entry.magnifier === true ? [] : ['entry ' + JSON.stringify(entry)], null);
{ const t = fs.readFileSync(PARTS_TS, 'utf8').replace(/\r\n/g, '\n'); run('js/parts.ts carries the generated block', t === partsTsWithBlock(t) ? [] : ['the block differs from the model.json files'], null); }
console.log(bad ? `${bad} of ${n} FAILED` : `${n} authored-part checks ok`);
process.exit(bad ? 1 : 0);
