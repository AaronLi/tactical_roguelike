// Negative tests for the model validator (js/glb.ts): each broken model must produce the expected message.  node tools/check_models.test.mjs
// (npm run test:models runs the contract self-test first; this one checks the validator really catches what the contract forbids.)
import { loadModels } from './model_env.mjs';
const M = loadModels();
const mesh = (name, slot, mat = 'black', extra = {}) => ({ name, extras: { slot, ...extra }, mesh: true, uv: false, materials: [mat], children: [] });
const info = () => ({ sy: 0.07, fSight: 0.02, relief: 0.1, muzzles: [[0.5, 0, 0]], grip: [0.05, -0.07, 0], support: [0.2, -0.03, 0], anim: {} });
const gun = (children, over = {}, rootExtras = {}) => ({ roots: [{ name: 'x', extras: { gun: 'x', info: { ...info(), ...over }, ...rootExtras }, mesh: false, uv: false, materials: [], children }] });
const part = (key, kids = [], extras = {}) => ({ name: 'part_' + key, extras: { part: key, ...extras }, mesh: false, uv: false, materials: [], children: kids });
let bad = 0;
const expect = (label, desc, re) => {
  const r = M.validate(desc, 'x'), all = [...r.errors, ...r.warnings].join('\n');
  const ok = re === null ? r.errors.length === 0 : re.test(all);
  if (!ok) { bad++; console.error(`FAIL ${label}: expected ${re}, got:\n  ${all || '(nothing)'}`); } else console.log('ok   ' + label);
};
const disp = (extra) => ({ ...mesh('display_ammo', 'barrel', 'screen', extra), uv: true });
const B = () => mesh('base_1', 'base');
expect('minimal gun is valid', gun([B()]), null);
expect('no base mesh', gun([mesh('grip_1', 'grip')]), /no mesh in slot "base"/);
expect('unknown material', gun([mesh('base_1', 'base', 'foo')]), /material 'foo' is not in the catalogue/);
expect('anonymous material ok', gun([mesh('base_1', 'base', 'm_a0b1c2')]), null);
expect('bad slot', gun([mesh('base_1', 'bogus')]), /slot "bogus"/);
expect('mesh name must match slot', gun([B(), mesh('zzz', 'grip')]), /must be named "grip_<n>"/);
expect('magAt without part_mag', gun([B()], { magAt: [0.1, -0.04] }), /no node part_mag but info\.magAt/);
expect('part_mag without magAt', gun([B(), part('mag', [mesh('mag_2', 'mag')])], { anim: { mag: 'part_mag' } }), /part_mag exists but info\.magAt is missing/);
expect('part not listed in anim', gun([B(), part('bolt', [mesh('base_3', 'base')])]), /info\.anim\.bolt does not list it/);
expect('anim lists a missing node', gun([B()], { anim: { bolt: 'part_bolt' } }), /no node part_bolt/);
expect('missing muzzles', gun([B()], { muzzles: undefined }), /info\.muzzles: missing/);
expect('empty muzzles', gun([B()], { muzzles: [] }), /at least 1 entry/);
expect('two muzzles ok', gun([B()], { muzzles: [[0.5, 0, -0.01], [0.5, 0, 0.01]] }), null);
expect('wrong vec', gun([B()], { grip: [1, 2] }), /info\.grip: expected 3 numbers/);
expect('unknown info field', gun([B()], { speling: 1 }), /info\.speling: unknown field/);
expect('display without uvs', gun([B(), { ...disp({ display: { width: 128, height: 32 } }), uv: false }]), /display "display_ammo": has no UVs/);
expect('display without size', gun([B(), disp({})]), /extras\.display must be \{ width, height \}/);
expect('display ok (any material name)', gun([B(), disp({ display: { width: 128, height: 32 } })]), null);
const barrel = (anchors) => gun([B(), part('barrel', [mesh('barrel_2', 'barrel')], { anchors })], { anim: { barrel: 'part_barrel' } });
expect('part anchors ok (muzzles list + mount)', barrel({ muzzles: [[0.4, 0, -0.01], [0.4, 0, 0.01]], mount_muzzle: [0.4, 0, 0] }), null);
expect('anchor of an unknown kind', barrel({ bogus: [0, 0, 0] }), /not an anchor a part can provide/);
expect('mount of an unknown slot', barrel({ mount_nowhere: [0, 0, 0] }), /"nowhere" is not a slot/);
expect('anchor with a bad shape', barrel({ muzzles: [[1, 2]] }), /muzzles\[0\]: expected 3 numbers/);
expect('two roots', { roots: [gun([]).roots[0], gun([]).roots[0]] }, /2 root nodes/);
expect('there is no stretch anchor (a part is modelled at its own size)', barrel({ stretch_handguard: [0.05, 0, 0] }), /not an anchor a part can provide/);
expect('the slots a loaded build needs are known', gun([B(), mesh('tac_2', 'tac'), mesh('tacL_3', 'tacL'), mesh('magnifier_4', 'magnifier'), mesh('railmount_5', 'railmount')]), null);

// ---- per-part packs
const expectPack = (label, desc, re, tag = 'barrel') => {
  const r = M.validatePack(desc, tag), all = [...r.errors, ...r.warnings].join('\n');
  const ok = re === null ? r.errors.length === 0 : re.test(all);
  if (!ok) { bad++; console.error(`FAIL pack ${label}: expected ${re}, got:\n  ${all || '(nothing)'}`); } else console.log('ok   pack ' + label);
};
const packRoot = (children, extras = {}) => ({ roots: [{ name: 'x.barrel.1', extras: { pack: { platform: 'x', tag: 'barrel', key: { barrel: 'b1' } }, ...extras }, mesh: false, uv: false, materials: [], children }] });
const bm = (name = 'barrel_1', slot = 'barrel', mat = 'black') => mesh(name, slot, mat);
const pnode = (name, kids, extras = {}) => ({ name, extras, mesh: false, uv: false, materials: [], children: kids });
expectPack('minimal pack is valid', packRoot([bm()]), null);
expectPack('two roots', { roots: [packRoot([]).roots[0], packRoot([]).roots[0]] }, /2 root nodes/);
expectPack('no extras.pack', { roots: [{ ...packRoot([bm()]).roots[0], extras: {} }] }, /extras\.pack is missing/);
expectPack('a mesh of another slot', packRoot([bm('grip_1', 'grip')]), /a pack of "barrel" holds only that slot's meshes/);
expectPack('a pack has no info', packRoot([bm()], { info: {} }), /a pack has no extras\.info/);
expectPack('part node with owner and parent', packRoot([pnode('part_brk', [bm()], { part: 'brk', owner: false, parent: 'part_x' })]), null);
expectPack('unknown part node', packRoot([pnode('part_zzz', [bm()], { part: 'zzz' })]), /not a known part/);
expectPack('node that is neither part_ nor group_', packRoot([pnode('hinge', [bm()])]), /must be part_<key> or group_<name>/);
expectPack('a mesh inside a node of another slot', packRoot([pnode('group_barrel_1', [bm('grip_1', 'grip')])]), /expected "barrel"/);
expectPack('owner must be a boolean', packRoot([pnode('group_barrel_1', [bm()], { owner: 'yes' })]), /extras\.owner must be true\/false/);
expectPack('anchors do not belong in a pack', packRoot([pnode('group_barrel_1', [bm()], { anchors: {} })]), /a pack carries no extras\.anchors/);
expectPack('unknown material', packRoot([bm('barrel_1', 'barrel', 'foo')]), /material 'foo' is not in the catalogue/);
// the platform index
const ix = () => ({ version: 1, platform: 'x', src: 'abc', slots: ['barrel', 'handguard'], tags: { barrel: { dep: ['barrel'], packs: [{ key: ['b1'], file: 'barrel/b1.glb' }] }, handguard: { dep: ['barrel', 'handguard'], packs: [{ key: ['*', 'h1'], file: null }] } },
  anchors: { 'barrel=b2': { mount_muzzle: [0.05, 0, 0] } }, bases: [0, 1, 2].map(() => ({ build: { barrel: 'b1' }, info: { sy: 0.07 } })), deltas: { 'barrel=b2': [{ sy: 0.001 }, null, null] }, exact: {} });
const expectIx = (label, mut, re) => {
  const o = ix(); mut(o); const r = M.validatePartsIndex(o), all = r.errors.join('\n'), ok = re === null ? r.errors.length === 0 : re.test(all);
  if (!ok) { bad++; console.error(`FAIL index ${label}: expected ${re}, got:\n  ${all || '(nothing)'}`); } else console.log('ok   index ' + label);
};
expectIx('a valid index', () => {}, null);
expectIx('a missing field', (o) => { delete o.anchors; }, /index\.anchors: missing/);
expectIx('an unknown field', (o) => { o.extra = 1; }, /index\.extra: unknown field/);
expectIx('a key that does not line up with dep', (o) => { o.tags.barrel.packs[0].key = ['b1', 'h1']; }, /key has 2 parts for 1 dep slots/);
expectIx('a tag that is not a slot', (o) => { o.tags.nowhere = { dep: [], packs: [] }; }, /index\.tags\.nowhere: not a slot/);
expectIx('a stretch (there is none: a part is modelled at its own size)', (o) => { o.tags.handguard.packs[0].stretch = { from: 0.1, to: 0.3, gain: 1 }; }, /stretch: unknown field/);
expectIx('an anchor with two numbers', (o) => { o.anchors['barrel=b2'].mount_muzzle = [1, 2]; }, /expected 3 numbers/);
expectIx('three reference builds', (o) => { o.bases.pop(); }, /expected the three reference builds/);
// the info as leaves, and the planner
const canon = (v) => JSON.stringify(v, (k, x) => (x && typeof x === 'object' && !Array.isArray(x) ? Object.fromEntries(Object.keys(x).sort().map((q) => [q, x[q]])) : x));
const leavesBack = (v) => canon(M.infoFromLeaves(M.infoLeaves(v)));
for (const v of [{ sy: 0.07, muzzles: [[0.5, 0, 0], [0.5, 0, 0.01]], chamberAt: { side: 'top', f: 0.1, y: 0.02, x: 0, w: 0.01 }, handle: null, pistol: true, load: { at: [[0.1, 0.2]], pitch: 0.4 }, anim: {}, empty: [] }]) {
  if (leavesBack(v) === canon(v)) console.log('ok   info leaves round trip'); else { bad++; console.error('FAIL info leaves round trip: ' + leavesBack(v)); }
}
const plan = M.planBuild(ix(), { barrel: 'b2', handguard: 'h1' });
const wantMiss = M.planBuild(ix(), { barrel: 'b1', handguard: 'h9' }).missing;
const plan2 = M.planBuild(ix(), { barrel: 'b1', handguard: 'h1' });
if (/^barrel/.test(plan.missing || '') && Math.abs(plan.info.sy - 0.071) < 1e-12 && plan2.missing === null && plan2.tags.length === 2 && plan2.tags[1].entry === null) console.log('ok   planBuild picks packs, applies the info deltas, reports what no pack covers'); else { bad++; console.error('FAIL planBuild: ' + JSON.stringify(plan)); }
if (/handguard/.test(wantMiss || '')) console.log('ok   planBuild names the tag no pack covers'); else { bad++; console.error('FAIL planBuild missing: ' + wantMiss); }
process.exit(bad ? 1 : 0);
