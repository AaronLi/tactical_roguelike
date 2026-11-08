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
const ix = () => ({ version: M.PARTS_INDEX_VERSION, platform: 'x', src: 'abc', slots: ['barrel', 'grip', 'handguard', 'magnifier', 'optic'],
  tags: {
    barrel: { from: ['barrel'], pieces: { 'barrel=b1': { file: 'barrel/b1.glb', at: [0, 0, 0] }, 'barrel=b2': { file: '_shared/barrel/ab.glb', at: [0.1, 0, 0], nodes: ['part_barrel'] } } },
    handguard: { from: ['handguard'], pieces: { 'handguard=h1': { file: 'handguard/h1.glb', at: [0, 0, 0] } }, show: { a: ['barrel', 'barrel.len'], b: ['handguard', 'hg.len'], gt: 0.05 } },
    optic: { from: ['optic'], pieces: { 'optic=o1': { file: 'optic/o1.glb', at: [0, 0.02, 0] } }, cond: ['magnifier'] },
    'optic@rib': { from: ['optic'], pieces: { 'optic=o1#"r"': { file: 'optic-on-rib/o1.glb', at: [0, 0, 0], rear: 0.1, len: 0.2, len0: 0.2 } }, stretch: true, vary: { by: 'barrel', key: 'rib' } },
    tac: { from: ['handguard'], pieces: { 'handguard=h1': { file: 'tac/h1.glb', at: [0, 0, 0] } }, pair: { axis: 0, h: 'handguard', by: 'barrel', op: 'min' } },
  },
  anchors: { 'barrel=b2': { mount_handguard: [0.05, 0, 0], 'mount_optic?magnifier': [0.01, 0, 0], len_optic: 1, 'len_optic@rib': 0.1, pair_tac: 0.3 }, 'handguard=h1': { pair_tac: 0.2 }, 'barrel=b1': { pair_tac: 0.1 } },
  values: { '': { rib: '"r"', 'barrel.len': '0.3' }, 'barrel=b2': { 'barrel.len': '0.4' }, 'handguard=h1': { 'hg.len': '0.3' } },
  info: {
    sy: { from: ['optic'], own: { '': 0.06, 'optic=o1': 0.07 } },
    'muzzles/0/0': { from: ['barrel'], own: { 'barrel=b1': 0.5, 'barrel=b2': 0.55 }, max: { by: 'grip', v: { g9: 0.6 } } },
    'support/0': { from: ['handguard'], own: { '': 0.1, 'handguard=h1': 0.2 }, off: { handguard: { x: { 'barrel=b2': 0.05 } } } },
    gone: { from: ['barrel'], own: { 'barrel=b1': { del: 1 }, 'barrel=b2': 3 } },
  } });
const expectIx = (label, mut, re) => {
  const o = ix(); mut(o); const r = M.validatePartsIndex(o), all = r.errors.join('\n'), ok = re === null ? r.errors.length === 0 : re.test(all);
  if (!ok) { bad++; console.error(`FAIL index ${label}: expected ${re}, got:\n  ${all || '(nothing)'}`); } else console.log('ok   index ' + label);
};
expectIx('a valid index', () => {}, null);
expectIx('a missing field', (o) => { delete o.anchors; }, /index\.anchors: missing/);
expectIx('an unknown field', (o) => { o.extra = 1; }, /index\.extra: unknown field/);
expectIx('a piece of a slot not in its provider list', (o) => { o.tags.barrel.pieces['grip=g1'] = { file: 'barrel/g1.glb', at: [0, 0, 0] }; }, /grip is not in its from/);
expectIx('a provider slot the index has not', (o) => { o.tags.barrel.from = ['nowhere']; }, /"nowhere" is not one of the index's slots/);
expectIx('a tag that is not a slot', (o) => { o.tags.nowhere = { from: [], pieces: {} }; }, /index\.tags\.nowhere: not a slot/);
expectIx('a piece without its move', (o) => { delete o.tags.barrel.pieces['barrel=b1'].at; }, /at: missing/);
expectIx('the old packs are gone', (o) => { o.tags.barrel.packs = []; }, /packs: unknown field/);
expectIx('the old info tables are gone', (o) => { o.info = [{ dep: [], leaves: [], rows: [] }]; }, /index\.info/);
expectIx('an older index', (o) => { o.version = 2; }, /index\.version is 2/);
// authored sources (a gun modelled in Blender: M.validateAuthored, GUN_MODEL_CONTRACT.authored)
const ANCH = () => ({ mount_optic: [0.01, 0.023, 0], mount_optic_end: [0.18, 0.023, 0], mount_handguard: [0.3, 0, 0], mount_handguard_end: [0.53, 0, 0], mount_barrel: [0.6, 0, 0], mount_muzzle: [0.73, 0, 0], mount_stock: [0, -0.018, 0], mount_grip: [0.066, -0.045, 0], mount_mag: [0.22, -0.043, 0] });
const aGun = (over = {}, kids = [B(), mesh('barrel_2', 'barrel', 'black')], rootOver = {}) => ({ roots: [{ name: 'x', extras: { gun: 'x', info: { ...info(), magAt: [0.22, -0.043], anim: { mag: 'part_mag' }, ...over.info }, anchors: ANCH(), ...rootOver }, mesh: false, uv: false, materials: [], children: [...kids, part('mag', [mesh('mag_3', 'mag')])] }] });
const expectA = (label, desc, re, opts) => {
  const r = M.validateAuthored(desc, 'x', opts), all = [...r.errors, ...r.warnings].join('\n'), ok = re === null ? r.errors.length === 0 : re.test(all);
  if (!ok) { bad++; console.error(`FAIL ${label}: expected ${re}, got:\n  ${all || '(nothing)'}`); } else console.log('ok   ' + label);
};
expectA('authored: a complete source is valid', aGun(), null);
expectA('authored: json-text extras are read (Blender)', (() => { const g = aGun(); const e = g.roots[0].extras; g.roots[0].extras = { gun: 'x', info_json: JSON.stringify(e.info), anchors_json: JSON.stringify(e.anchors) }; return g; })(), null);
{ const g = aGun(); delete g.roots[0].extras.anchors.mount_handguard_end; expectA('authored: a missing anchor is named', g, /anchors\.mount_handguard_end is missing/); }
{ const g = aGun(); delete g.roots[0].extras.anchors; expectA('authored: no anchors at all', g, /root extras\.anchors .* is missing/); }
{ const g = aGun(); g.roots[0].extras.anchors.mount_bogus = [0, 0, 0]; expectA('authored: an unknown anchor', g, /anchors\.mount_bogus: not an anchor/); }
{ const g = aGun(); g.roots[0].extras.anchors.mount_optic = [0.01, 0.023]; expectA('authored: an anchor of the wrong shape', g, /anchors\.mount_optic: expected 3 numbers/); }
{ const g = aGun(); g.roots[0].extras.anchors.mount_handguard = [0.6, 0, 0]; expectA('authored: anchors out of order', g, /mount_handguard \(0\.6\) must be behind mount_handguard_end/); }
{ const g = aGun(); g.roots[0].extras.anchors.mount_mag = [0.3, -0.04, 0]; expectA('authored: mount_mag must be info.magAt', g, /mount_mag .* is not info\.magAt/); }
// the gun's own optic mount (an MP5's claw mount): meshes of slot optic with extras.mount, and its rail
const OM = (extra = {}) => mesh('optic_9', 'optic', 'black', { mount: true, ...extra }), RAIL = { mount_optic_rail: [0.02, 0.04, 0], mount_optic_rail_end: [0.16, 0.04, 0] };
{ const g = aGun({}, [B(), mesh('barrel_2', 'barrel', 'black'), OM()]); Object.assign(g.roots[0].extras.anchors, RAIL); expectA('authored: an optic mount with its rail is valid', g, null); }
expectA('authored: an optic mount needs its rail', aGun({}, [B(), mesh('barrel_2', 'barrel', 'black'), OM()]), /has an optic mount .* but not its rail/);
{ const g = aGun(); Object.assign(g.roots[0].extras.anchors, RAIL); expectA('authored: a mount rail with no mount', g, /the model has none \(no mesh with extras\.mount\)/); }
{ const g = aGun({}, [B(), mesh('barrel_2', 'barrel', 'black'), OM({ slot: 'base' })]); g.roots[0].children[2].name = 'base_9'; Object.assign(g.roots[0].extras.anchors, RAIL); expectA('authored: an optic mount is slot optic', g, /is slot optic, not "base"/); }
{ const g = aGun({}, [B(), mesh('barrel_2', 'barrel', 'black'), OM()]); Object.assign(g.roots[0].extras.anchors, RAIL, { mount_optic_rail_end: [0.16, 0.041, 0] }); expectA('authored: an optic mount rail is level', g, /mount_optic_rail and mount_optic_rail_end differ in height/); }
{ const g = aGun({}, [B(), mesh('barrel_2', 'barrel', 'black'), OM()]); Object.assign(g.roots[0].extras.anchors, { mount_optic_rail: [0.02, 0.02, 0], mount_optic_rail_end: [0.16, 0.02, 0] }); expectA('authored: an optic mount rail is over the receiver', g, /must be above the receiver's top/); }
expectA('authored: a factory slot with no meshes', aGun(), /the platform's default build fits a handguard, but the model has no mesh in slot "handguard"/, { factory: ['barrel', 'handguard'] });
expectA('authored: info is still the contract', aGun({ info: { speling: 1 } }), /info\.speling: unknown field/);
{ const r = M.validateAuthoredConfig({ source: 'authored', sights: { builtin: ['irons'], rail: ['riser'] } }); if (r.some((e) => /not in sights\.builtin/.test(e))) console.log('ok   authored: model.json rail kinds must be builtin'); else { bad++; console.error('FAIL model.json rail check: ' + r); } }
{ const r = M.validateAuthoredConfig({ source: 'recipe' }); if (r.length >= 2) console.log('ok   authored: model.json needs source and sights'); else { bad++; console.error('FAIL model.json: ' + r); } }
// authored PISTOLS (info.pistol): the pistol anchor set (GUN_MODEL_CONTRACT.authored.pistol), not the rifle's
const PA = (over = {}) => ({ mount_barrel: [0.1, 0, 0], mount_mag: [0.22, -0.043, 0], ...over });
const pGun = (anch = PA(), infoOver = {}) => aGun({ info: { pistol: true, muzzles: [[0.3, 0, 0]], ...infoOver } }, undefined, { anchors: anch });
expectA('authored pistol: a complete source needs only mount_barrel and mount_mag', pGun(), null);
{ const a = PA(); delete a.mount_mag; expectA('authored pistol: a missing mount_mag is named', pGun(a), /anchors\.mount_mag is missing/); }
{ const a = PA(); delete a.mount_barrel; expectA('authored pistol: a missing mount_barrel is named', pGun(a), /anchors\.mount_barrel is missing/); }
expectA('authored pistol: the optic cut is a point', pGun(PA({ mount_optic: [0.04, 0.01, 0], mount_optic_end: [0.05, 0.01, 0] })), /a pistol's optic cut is a point/);
expectA('authored pistol: mount_optic_end goes with mount_optic', pGun(PA({ mount_optic: [0.04, 0.01, 0] })), /mount_optic_end is missing/);
expectA('authored pistol: the barrel starts behind the muzzle', pGun(PA({ mount_barrel: [0.35, 0, 0] })), /mount_barrel must be behind the muzzle/);
expectA('authored pistol: a slide needs mount_slide', pGun(PA(), { anim: { slide: 'part_slide', mag: 'part_mag' } }), /anchors\.mount_slide is missing|part_slide/);
expectA('authored pistol: tac and grip anchors are allowed', pGun(PA({ mount_tac: [0.15, -0.06, 0], mount_grip: [0.07, -0.04, 0], mount_stock: [0, -0.02, 0] })), null);
expectA('a rifle still needs its handguard anchors', aGun({}, undefined, { anchors: PA() }), /anchors\.mount_optic is missing/);
// a gun of several barrels and a reload sequence (GUN_MODEL_CONTRACT.multi): info.barrels, barrelGroups, modeDial, hinge (root extras hinge_json), nested part_ nodes, anim aliases
{
  const BAR = () => ({ n: 2, rounds: { standard: { rounds_each: 3, effective_mm: [100, 150, 200] }, rifle: { rounds_each: 2, effective_mm: [150, 200] } }, default: 'standard' }), MZ = [[0.7, 0.01, 0], [0.7, -0.01, 0]];
  const mgun = (over = {}, root = {}, kids = [B(), part('mag', [mesh('mag_3', 'mag'), part('carry', [mesh('mag_4', 'mag')])])]) => ({ roots: [{ name: 'x', extras: { gun: 'x', info: { ...info(), muzzles: MZ, magAt: [0.22, -0.043], anim: { mag: 'part_mag', carry: 'part_carry' }, barrels: BAR(), ...over }, anchors: ANCH(), ...root }, mesh: false, uv: false, materials: [], children: kids }] });
  expectA('multi: a barrel block with its barrels is valid', mgun(), null);
  expectA('multi: json-text hinge is read', mgun({}, { hinge_json: JSON.stringify({ sequence: [{ part: 'part_carry', axis: 'x', rotate_deg: 90 }] }) }), null);
  expectA('multi: anim aliases are read by the node they name', (() => { const g = mgun({ anim: { block: 'part_mag', flap: 'part_carry' } }); return g; })(), null);
  expectA('multi: barrels.n against the muzzles', mgun({ barrels: { ...BAR(), n: 3 } }), /info\.barrels\.n is 3 but info\.muzzles has 2/);
  expectA('multi: one effective length per round', mgun({ barrels: { ...BAR(), rounds: { ...BAR().rounds, standard: { rounds_each: 3, effective_mm: [100, 150] } } } }), /rounds\.standard\.effective_mm has 2 entries, rounds_each is 3/);
  expectA('multi: the other round type counts too', mgun({ barrels: { ...BAR(), rounds: { ...BAR().rounds, rifle: { rounds_each: 4, effective_mm: [150, 200] } } } }), /rounds\.rifle\.effective_mm has 2 entries, rounds_each is 4/);
  expectA('multi: a default that is a round type', mgun({ barrels: { ...BAR(), default: 'sabot' } }), /info\.barrels\.default "sabot" is not one of info\.barrels\.rounds \(standard, rifle\)/);
  expectA('multi: the round types are required', mgun({ barrels: { n: 2, default: 'standard' } }), /info\.barrels\.rounds is missing|info\.barrels\.rounds: at least one round type/);
  expectA('multi: effective lengths must grow', mgun({ barrels: { ...BAR(), rounds: { ...BAR().rounds, standard: { rounds_each: 3, effective_mm: [100, 90, 200] } } } }), /rounds\.standard\.effective_mm must be positive and increase/);
  expectA('multi: a group names real barrels', mgun({ barrelGroups: { top: [0, 5] } }), /info\.barrelGroups\.top: indices into info\.muzzles/);
  expectA('multi: groups need barrels', aGun({ info: { barrelGroups: { top: [0] } } }), /are for a gun with info\.barrels/);
  expectA('multi: a hinge step names a part', mgun({}, { hinge: { sequence: [{ part: 'part_lever', axis: 'x', rotate_deg: 40 }] } }), /sequence\[0\]\.part: "part_lever" is not a part_ node/);
  expectA('multi: a hinge frame names a part', mgun({}, { hinge: { sequence: [{ part: 'carry', move: [0, 0.1, 0], frame: 'part_brk' }] } }), /sequence\[0\]\.frame: "part_brk" is not a part_ node/);
  expectA('multi: a step does something', mgun({}, { hinge: { sequence: [{ part: 'carry' }] } }), /turns \(axis \+ rotate_deg\) or slides \(move\)/);
  expectA('multi: a rotation needs an axis', mgun({}, { hinge: { sequence: [{ part: 'carry', rotate_deg: 40 }] } }), /axis: x, y or z/);
  expectA('multi: nested parts are fine (a barrel block inside a forend)', mgun({ anim: { brk: 'part_brk', mag: 'part_mag', carry: 'part_carry' } }, {}, [B(), part('brk', [part('mag', [mesh('mag_3', 'mag'), part('carry', [mesh('mag_4', 'mag')])])])]), null);
  expectA('multi: carry is a part key', mgun({ anim: { mag: 'part_mag', carry: 'part_carry' } }), null);
}
// authored VARIANTS (models/<id>/<name>.glb: M.validateAuthoredVariant)
const vDesc = (v, name = 'x_barrel_short', kids = [mesh('barrel_1', 'barrel', 'black')]) => ({ roots: [{ name, extras: v === undefined ? {} : { variant: v }, mesh: false, uv: false, materials: [], children: kids }] });
const expectV = (label, desc, re) => {
  const r = M.validateAuthoredVariant(desc, 'x', 'barrel_short'), all = [...r.errors, ...r.warnings].join('\n'), ok = re === null ? r.errors.length === 0 : re.test(all);
  if (!ok) { bad++; console.error(`FAIL ${label}: expected ${re}, got:\n  ${all || '(nothing)'}`); } else console.log('ok   ' + label);
};
const VB = () => ({ gun: 'x', slot: 'barrel', of: 'factory', info: { muzzles: [[0.2, 0, 0]] }, note: 'short' });
expectV('variant: a complete barrel variant is valid', vDesc(VB()), null);
expectV('variant: no variant_json', vDesc(undefined), /variant_json is missing/);
expectV('variant: another gun\'s folder', vDesc({ ...VB(), gun: 'y' }), /variant\.gun is "y", expected "x"/);
expectV('variant: a slot that is not barrel, muzzle or mag', vDesc({ ...VB(), slot: 'grip' }), /variant\.slot is "grip"/);
expectV('variant: a muzzle variant is valid', vDesc({ ...VB(), slot: 'muzzle' }, 'x_barrel_short', [mesh('muzzle_1', 'muzzle', 'black')]), null);
expectV('variant: a muzzle variant needs its muzzles', vDesc({ gun: 'x', slot: 'muzzle', of: 'factory' }, 'x_barrel_short', [mesh('muzzle_1', 'muzzle', 'black')]), /needs variant\.info\.muzzles/);
expectV('variant: a barrel without its muzzle', vDesc({ ...VB(), info: {} }), /needs variant\.info\.muzzles/);
expectV('variant: a magazine without its capacity', vDesc({ gun: 'x', slot: 'mag', of: 'factory' }, 'x_barrel_short', [part('mag', [mesh('mag_1', 'mag', 'black')])]), /needs variant\.cap/);
expectV('variant: an unknown field', vDesc({ ...VB(), extra: 1 }), /variant\.extra: not a field/);
expectV('variant: a mesh of another slot', vDesc(VB(), 'x_barrel_short', [mesh('grip_1', 'grip', 'black')]), /extras\.slot is "grip", expected "barrel"/);
expectV('variant: the root is named <gun>_<name>', vDesc(VB(), 'barrel_short'), /expected "x_barrel_short"/);
expectV('variant: no meshes', vDesc(VB(), 'x_barrel_short', []), /no meshes/);
// the info as leaves, and the planner
const canon = (v) => JSON.stringify(v, (k, x) => (x && typeof x === 'object' && !Array.isArray(x) ? Object.fromEntries(Object.keys(x).sort().map((q) => [q, x[q]])) : x));
const leavesBack = (v) => canon(M.infoFromLeaves(M.infoLeaves(v)));
for (const v of [{ sy: 0.07, muzzles: [[0.5, 0, 0], [0.5, 0, 0.01]], chamberAt: { side: 'top', f: 0.1, y: 0.02, x: 0, w: 0.01 }, handle: null, pistol: true, load: { at: [[0.1, 0.2]], pitch: 0.4 }, anim: {}, empty: [] }]) {
  if (leavesBack(v) === canon(v)) console.log('ok   info leaves round trip'); else { bad++; console.error('FAIL info leaves round trip: ' + leavesBack(v)); }
}
const plan = M.planBuild(ix(), { barrel: 'b2', handguard: 'h1', optic: 'o1', magnifier: 'm1' });
const plan2 = M.planBuild(ix(), { barrel: 'b1', handguard: 'h1', grip: 'g9' });
const tg = (p, t) => p.tags.find((x) => x.tag === t);
// the pieces by provider, the offsets summed (the provider's own slot gives none), the condition offset, the stretch, the pair, the threshold, the info rules
if (plan.approx === null && tg(plan, 'barrel').at[0] === 0.1 && tg(plan, 'handguard').rigid[0] === 0.05 && tg(plan, 'optic').rigid[0] === 0.01 && tg(plan, 'optic').at[1] === 0.02
  && Math.abs(tg(plan, 'optic@rib').scale - 1.5) < 1e-12 && tg(plan, 'optic@rib').rear === 0.1 && tg(plan, 'tac').rigid[0] === 0.2
  && plan.info.sy === 0.07 && plan.info.muzzles[0][0] === 0.55 && plan.info.support[0] === 0.25 && plan.info.gone === 3 && plan.info.anim.barrel === 'part_barrel' && plan.info.mounts.mount_handguard[0] === 0.05)
  console.log('ok   planBuild: pieces by provider, offsets, conditions, stretch, pair, info'); else { bad++; console.error('FAIL planBuild: ' + JSON.stringify(plan)); }
// a threshold hides a piece; a max of one part's value; an absent leaf; the platform's own value with no provider
if (plan2.approx === null && !tg(plan2, 'handguard') && tg(plan2, 'tac').rigid[0] === 0.1 && plan2.info.muzzles[0][0] === 0.6 && !('gone' in plan2.info) && plan2.info.sy === 0.06 && plan2.info.support[0] === 0.2)
  console.log('ok   planBuild: thresholds, maxima, absent leaves, the platform\'s own'); else { bad++; console.error('FAIL planBuild 2: ' + JSON.stringify(plan2)); }
// a part the index has no value for is reported (a bake bug), not guessed
const near = M.planBuild(ix(), { barrel: 'b9', handguard: 'h1' });
if (near.approx) console.log('ok   planBuild reports what the index does not cover'); else { bad++; console.error('FAIL planBuild approx: ' + JSON.stringify(near)); }
process.exit(bad ? 1 : 0);
