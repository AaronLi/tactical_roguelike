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
const ix = () => ({ version: M.PARTS_INDEX_VERSION, platform: 'x', src: 'abc', slots: ['barrel', 'handguard'], tags: { barrel: { dep: ['barrel'], packs: [{ key: ['b1'], file: 'barrel/b1.glb' }, { key: ['b2'], file: '_shared/barrel/ab.glb', at: [0.1, 0, 0], nodes: ['part_barrel'] }] }, handguard: { dep: ['barrel', 'handguard'], packs: [{ key: ['*', 'h1'], file: null }] } },
  anchors: { 'barrel=b2': { mount_muzzle: [0.05, 0, 0] } },
  info: [{ dep: ['barrel'], leaves: ['sy', 'muzzles/0/0'], rows: [{ key: ['b1'], v: [0.07, 0.5] }, { key: ['b2'], v: [0.071, 0.55] }] }, { dep: ['barrel', 'handguard'], leaves: ['support/0', 'gone'], rows: [{ key: ['*', 'h1'], v: [0.2, { del: 1 }] }, { key: ['b2', 'h1'], v: [0.25, 3] }] }] });
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
expectIx('an info row with too few values', (o) => { o.info[0].rows[0].v.pop(); }, /rows\[0\]\.v has 1 values for 2 leaves/);
expectIx('an info row key that does not line up', (o) => { o.info[0].rows[0].key = ['b1', 'h1']; }, /rows\[0\]\.key has 2 parts for 1 dep slots/);
expectIx('the old reference builds are gone', (o) => { o.bases = []; }, /index\.bases: unknown field/);
// authored sources (a gun modelled in Blender: M.validateAuthored, GUN_MODEL_CONTRACT.authored)
const ANCH = () => ({ mount_optic: [0.01, 0.023, 0], mount_optic_end: [0.18, 0.023, 0], mount_handguard: [0.3, 0, 0], mount_handguard_end: [0.53, 0, 0], mount_barrel: [0.6, 0, 0], mount_muzzle: [0.73, 0, 0], mount_stock: [0, -0.018, 0], mount_grip: [0.066, -0.045, 0], mount_mag: [0.22, -0.043, 0] });
const aGun = (over = {}, kids = [B(), mesh('barrel_2', 'barrel', 'black', { role: 'tube' })], rootOver = {}) => ({ roots: [{ name: 'x', extras: { gun: 'x', info: { ...info(), magAt: [0.22, -0.043], anim: { mag: 'part_mag' }, ...over.info }, anchors: ANCH(), seat: { barrelR: 0.007 }, ...rootOver }, mesh: false, uv: false, materials: [], children: [...kids, part('mag', [mesh('mag_3', 'mag')])] }] });
const expectA = (label, desc, re, opts) => {
  const r = M.validateAuthored(desc, 'x', opts), all = [...r.errors, ...r.warnings].join('\n'), ok = re === null ? r.errors.length === 0 : re.test(all);
  if (!ok) { bad++; console.error(`FAIL ${label}: expected ${re}, got:\n  ${all || '(nothing)'}`); } else console.log('ok   ' + label);
};
expectA('authored: a complete source is valid', aGun(), null);
expectA('authored: json-text extras are read (Blender)', (() => { const g = aGun(); const e = g.roots[0].extras; g.roots[0].extras = { gun: 'x', info_json: JSON.stringify(e.info), anchors_json: JSON.stringify(e.anchors), seat_json: JSON.stringify(e.seat) }; return g; })(), null);
{ const g = aGun(); delete g.roots[0].extras.anchors.mount_handguard_end; expectA('authored: a missing anchor is named', g, /anchors\.mount_handguard_end is missing/); }
{ const g = aGun(); delete g.roots[0].extras.anchors; expectA('authored: no anchors at all', g, /root extras\.anchors .* is missing/); }
{ const g = aGun(); g.roots[0].extras.anchors.mount_bogus = [0, 0, 0]; expectA('authored: an unknown anchor', g, /anchors\.mount_bogus: not an anchor/); }
{ const g = aGun(); g.roots[0].extras.anchors.mount_optic = [0.01, 0.023]; expectA('authored: an anchor of the wrong shape', g, /anchors\.mount_optic: expected 3 numbers/); }
{ const g = aGun(); g.roots[0].extras.anchors.mount_handguard = [0.6, 0, 0]; expectA('authored: anchors out of order', g, /mount_handguard \(0\.6\) must be behind mount_handguard_end/); }
{ const g = aGun(); g.roots[0].extras.anchors.mount_mag = [0.3, -0.04, 0]; expectA('authored: mount_mag must be info.magAt', g, /mount_mag .* is not info\.magAt/); }
{ const g = aGun(); delete g.roots[0].extras.seat; expectA('authored: seat is required', g, /extras\.seat .* is missing/); }
expectA('authored: a factory slot with no meshes', aGun(), /the platform's default build fits a handguard, but the model has no mesh in slot "handguard"/, { factory: ['barrel', 'handguard'] });
expectA('authored: no barrel tube', aGun({}, [B(), mesh('barrel_2', 'barrel')]), /0 meshes with extras\.role "tube"/);
expectA('authored: info is still the contract', aGun({ info: { speling: 1 } }), /info\.speling: unknown field/);
{ const r = M.validateAuthoredConfig({ source: 'authored', sights: { builtin: ['irons'], rail: ['riser'] } }); if (r.some((e) => /not in sights\.builtin/.test(e))) console.log('ok   authored: model.json rail kinds must be builtin'); else { bad++; console.error('FAIL model.json rail check: ' + r); } }
{ const r = M.validateAuthoredConfig({ source: 'recipe' }); if (r.length >= 2) console.log('ok   authored: model.json needs source and sights'); else { bad++; console.error('FAIL model.json: ' + r); } }
// the info as leaves, and the planner
const canon = (v) => JSON.stringify(v, (k, x) => (x && typeof x === 'object' && !Array.isArray(x) ? Object.fromEntries(Object.keys(x).sort().map((q) => [q, x[q]])) : x));
const leavesBack = (v) => canon(M.infoFromLeaves(M.infoLeaves(v)));
for (const v of [{ sy: 0.07, muzzles: [[0.5, 0, 0], [0.5, 0, 0.01]], chamberAt: { side: 'top', f: 0.1, y: 0.02, x: 0, w: 0.01 }, handle: null, pistol: true, load: { at: [[0.1, 0.2]], pitch: 0.4 }, anim: {}, empty: [] }]) {
  if (leavesBack(v) === canon(v)) console.log('ok   info leaves round trip'); else { bad++; console.error('FAIL info leaves round trip: ' + leavesBack(v)); }
}
const plan = M.planBuild(ix(), { barrel: 'b2', handguard: 'h1' });
const near = M.planBuild(ix(), { barrel: 'b1', handguard: 'h9' });
const plan2 = M.planBuild(ix(), { barrel: 'b1', handguard: 'h1' });
// exact covers: the most specific row / pack, the shared pack's move, the anchors' mounts, the absent leaf, the part nodes
if (plan.approx === null && plan.info.sy === 0.071 && plan.info.muzzles[0][0] === 0.55 && plan.info.support[0] === 0.25 && plan.info.gone === 3 && plan.tags[0].at[0] === 0.1 && plan.info.mounts.mount_muzzle[0] === 0.05 && plan.info.anim.barrel === 'part_barrel'
  && plan2.approx === null && plan2.info.support[0] === 0.2 && !('gone' in plan2.info) && plan2.tags.length === 2 && plan2.tags[1].entry === null) console.log('ok   planBuild picks packs and the most specific info rows, shared packs, mounts'); else { bad++; console.error('FAIL planBuild: ' + JSON.stringify(plan)); }
// a combination nothing covers is still planned (the nearest pack and row) and says what was not covered exactly
if (near.approx && near.tags.length === 2 && near.info.sy === 0.07) console.log('ok   planBuild falls back to the nearest and reports what no pack covers'); else { bad++; console.error('FAIL planBuild approx: ' + JSON.stringify(near)); }
process.exit(bad ? 1 : 0);
