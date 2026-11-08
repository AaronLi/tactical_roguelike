// Negative tests for authored parts (models/parts/<slot>/<id>/, js/glb.ts GUN_MODEL_CONTRACT.authoredParts, tools/authored_parts.mjs): each broken part must produce
// the expected message, and the real parts must pass.   node tools/check_authored_parts.test.mjs
import fs from 'fs'; import path from 'path';
import { loadModels, loadGame, ROOT } from './model_env.mjs';
import { authoredPartKeys, checkAuthoredPart, checkGeometry, checkFurniture, checkMagnifier, checkPipClear, boundsOf, readAuthoredPart, entryOf, partsTsWithBlock, PARTS_TS, FINISH } from './authored_parts.mjs';
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
// the pistol optic cut (op:pso) and the replace-only form
conf('a pistol optic cut is a mount', (c) => { c.part.mount = 'op:pso'; }, null);
conf('a relief on a riser out of range', (c) => { c.optic.reliefOnRiser = 1.2; }, /optic\.reliefOnRiser: 1\.2 is out of range/);
const rep = (c) => { delete c.part; c.replaces = ['Halcyon Ember pistol dot']; };
conf('a replace-only part is valid', rep, null);
conf('replaces and part together', (c) => { c.replaces = ['x']; }, /"replaces" and "part" are exclusive/);
conf('replaces nothing', (c) => { rep(c); c.replaces = []; }, /"replaces": expected a non-empty list of catalogue entry names/);
conf('replaces something that is not a name', (c) => { rep(c); c.replaces = [7]; }, /"replaces": expected a non-empty list/);
conf('replaces the same entry twice', (c) => { rep(c); c.replaces = ['a', 'a']; }, /an entry is named twice/);
conf('neither part nor replaces', (c) => { delete c.part; }, /"part" is missing [^]*or "replaces"/);
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
// the pip disk on the eye side of the glass (a prism's picture drawn under its own eye lens shows solid glass)
{ const p1 = readAuthoredPart('optic/meridian_p1'), c = JSON.parse(JSON.stringify(p1.cfg));
  run('pip clear: the P1 as authored is valid', checkPipClear(c, p1.meshes), null);
  c.optic.pip.f += 0.001; run('pip clear: the disk inside the eye lens', checkPipClear(c, p1.meshes), /is not on the eye side of the lens mesh/); }
// FURNITURE (a stock, grip, muzzle device, handguard): its frame, anchors, own data and what it replaces; the origin at the mount (checkFurniture)
const fcfg = (k) => JSON.parse(fs.readFileSync(path.join(ROOT, `models/parts/${k}/model.json`), 'utf8'));
const fconf = (k, label, mut, re) => { const c = fcfg(k); mut(c); run(`${k.split('/')[0]} config: ${label}`, M.validateAuthoredPartConfig(c, k.split('/')[1]), re); };
fconf('stock/kestrel_cs4', 'the Kestrel is valid', () => {}, null);
fconf('stock/kestrel_cs4', 'a missing anchor', (c) => { delete c.anchors.cheek; }, /anchors\.cheek is missing \(a stock has butt, cheek\)/);
fconf('stock/kestrel_cs4', 'an anchor that is not a point', (c) => { c.anchors.butt = [-0.2, null, 0]; }, /anchors\.butt: expected \[forward, up, right\]/);
fconf('stock/kestrel_cs4', 'an anchor of another slot', (c) => { c.anchors.support = [0, 0, 0]; }, /anchors\.support: not an anchor of a stock/);
fconf('stock/kestrel_cs4', 'the optic frame on a stock', (c) => { c.frame = 'rail-top'; }, /"frame" is "rail-top", expected "stock-mount"/);
fconf('stock/kestrel_cs4', 'sight data on a stock', (c) => { c.optic = { sy: 0.02 }; }, /unknown field "optic" \(a stock has no sight data\)/);
fconf('stock/kestrel_cs4', 'no part data', (c) => { delete c.part; }, /"part" is missing: the stock's own data/);
fconf('stock/kestrel_cs4', 'an unknown part field', (c) => { c.part.colour = 'red'; }, /part: unknown field "colour"/);
fconf('stock/kestrel_cs4', 'furniture always replaces', (c) => { delete c.replaces; }, /"replaces": expected a non-empty list .*always replace-only/);
fconf('grip/paragon_pg23', 'the PG-23 is valid', () => {}, null);
fconf('grip/paragon_pg23', 'a match is a valid replace', (c) => { c.replaces.push({ mount: 'gr:ar', model: { gripT: 'ar', gm: 'polymer' } }); }, null);
fconf('grip/paragon_pg23', 'a match with no model', (c) => { c.replaces = [{ mount: 'gr:ar' }]; }, /"replaces": expected a non-empty list/);
fconf('muzzle/ironvale_a2_556', 'the A2 is valid', () => {}, null);
fconf('muzzle/ironvale_a2_556', 'muzzles not a list of points', (c) => { c.anchors.muzzles = [0.05, 0, 0]; }, /anchors\.muzzles: expected \[\[forward, up, right\], \.\.\.\]/);
fconf('muzzle/ironvale_a2_556', 'no thread', (c) => { delete c.part.thread; }, /part\.thread is missing/);
fconf('handguard/quad_rail_240', 'the factory rail is valid', () => {}, null);
fconf('handguard/quad_rail_240', 'a length in millimetres', (c) => { c.part.len = 239.5; }, /part\.len: expected a length in metres/);
fconf('handguard/quad_rail_240', 'a rail off the end', (c) => { c.part.rails.top = [0, 0.3]; }, /part\.rails\.top: \[0,0\.3\] runs off the handguard/);
fconf('handguard/quad_rail_240', 'a rail that is not a side', (c) => { c.part.rails.under = [0, 0.1]; }, /part\.rails\.under: not a side/);
fconf('handguard/quad_rail_240', 'the side rails kind', (c) => { c.part.rails.kind = 'mlok'; }, null);
fconf('handguard/quad_rail_240', 'a side rail kind that is not one', (c) => { c.part.rails.kind = 'keymod'; }, /part\.rails\.kind: "picatinny" or "mlok"/);
{ const S = M.authoredPartSlots; run('the finish materials agree (js/glb.ts and tools/authored_parts.mjs)', Object.keys(S).filter((s) => s !== 'optic' && (S[s].finish || null) !== (FINISH[s] || null)).map((s) => s + ': ' + S[s].finish + ' vs ' + FINISH[s]), null); }
const FB = (k) => { const b = boundsOf(readAuthoredPart(k).meshes); return { min: b.min.slice(), max: b.max.slice() }; };
const FG = (k, label, mut, re, cmut) => { const b = FB(k), c = fcfg(k); mut(b); if (cmut) cmut(c); run(`${k.split('/')[0]} geometry: ${label}`, checkFurniture(k.split('/')[0], c, b), re); };
for (const k of ['stock/kestrel_cs4', 'grip/paragon_pg23', 'muzzle/ironvale_a2_556', 'handguard/quad_rail_240', 'handguard/ironvale_ir12']) FG(k, k.split('/')[1] + ' as authored', () => {}, null);
FG('stock/kestrel_cs4', 'the origin at the butt, not the receiver', (b) => { b.min[2] -= 0.25; b.max[2] -= 0.25; }, /the stock reaches 215\.4 mm forward of the origin/);
FG('stock/kestrel_cs4', 'off the centre line', (b) => { b.min[0] += 0.01; b.max[0] += 0.01; }, /the stock is not centred/);
FG('stock/kestrel_cs4', 'the butt anchor off the stock', () => {}, /anchors\.butt \[-0\.6,-0\.06,0\] is outside the stock/, (c) => { c.anchors.butt = [-0.6, -0.06, 0]; });
FG('grip/paragon_pg23', 'the origin at the grip\'s foot', (b) => { b.min[1] += 0.1; b.max[1] += 0.1; }, /the grip reaches 113\.1 mm above the origin/);
FG('muzzle/ironvale_a2_556', 'the origin at the device\'s front', (b) => { b.min[2] += 0.05; b.max[2] += 0.05; }, /the muzzle device reaches 52\.0 mm back from the origin/);
FG('muzzle/ironvale_a2_556', 'the muzzle anchor short of the front', () => {}, /anchors\.muzzles \[0\.03,0,0\] is not at the device's front/, (c) => { c.anchors.muzzles = [[0.03, 0, 0]]; });
FG('handguard/quad_rail_240', 'the origin at its front', (b) => { b.min[2] += 0.2395; b.max[2] += 0.2395; }, /the handguard starts -239\.5 mm from the origin/);
FG('handguard/quad_rail_240', 'not the length it says', () => {}, /the handguard ends at forward 239\.5 mm, not at part\.len \(300\.0 mm\)/, (c) => { c.part.len = 0.3; });
FG('handguard/ironvale_ir12', 'the support off the handguard', () => {}, /anchors\.support \[0\.4,-0\.03,0\] is off the handguard/, (c) => { c.anchors.support = [0.4, -0.03, 0]; });
// the catalogue: the entries each piece of furniture replaces carry it (js/parts.ts AP_KEY), by name and by match, and nothing else does
{ const Gm = loadGame(), P = Gm.Gunsmith.PARTS, has = (id, k, v) => (P[id] && P[id].model && P[id].model[k] === v ? [] : [`${id}: model.${k} is ${P[id] && P[id].model ? P[id].model[k] : '(no part)'}, expected ${v}`]);
  const byName = (n) => Object.values(P).find((q) => q.name === n).id;
  run('the Kestrel CS-4 (the Mk18\'s, AR-9\'s, Benelli\'s factory stock) has the model', has(byName('Kestrel CS-4 carbine stock'), 'apStock', 'stock/kestrel_cs4'), null);
  run('the IR-12 (the HK416\'s factory rail) has the model', has(Gm.Gunsmith.PLATFORMS.hk416.defaults.handguard, 'apHg', 'handguard/ironvale_ir12'), null);
  run('the Mk18\'s factory 9.4" rail has the model', has(Gm.Gunsmith.PLATFORMS.m4.defaults.handguard, 'apHg', 'handguard/quad_rail_240'), null);
  run('the FDE 9.4" rail has it too, in its finish', Object.values(P).filter((q) => q.slot === 'handguard' && q.model && q.model.hg && q.model.hg.m === 'tan' && q.model.hg.len === 0.24 && q.mount === 'hg:ar').flatMap((q) => has(q.id, 'apHg', 'handguard/quad_rail_240')), null);
  run('the PG-23 (the Mk18\'s default grip) has its model', [...has(byName('Paragon PG-23 ergonomic grip'), 'apGrip', 'grip/paragon_pg23'), ...(Gm.Gunsmith.PLATFORMS.m4.defaults.grip === byName('Paragon PG-23 ergonomic grip') ? [] : ['the Mk18\'s default grip is ' + Gm.Gunsmith.PLATFORMS.m4.defaults.grip])], null);
  run('the standard A2 grip (the other rifles\' default) has the A2 model', has(Gm.Gunsmith.PLATFORMS.hk416.defaults.grip, 'apGrip', 'grip/brightline_a2'), null);
  run('the rubber and OD AR grips (other products) do not', ['Northmark rubber overmold grip', 'Lynx OD skeleton grip'].map(byName).filter((id) => P[id].model.apGrip), null);
  { const GS = Gm.Gunsmith, d = GS.defaultBuild('m4'), old = { ...d, grip: byName('Brightline A2 pistol grip (matches the furniture)') }, back = GS.decode(GS.encode('m4', old)).build;
    run('a Mk18 code with the A2 grip (the old default) still decodes to it', Object.keys(old).filter((k) => back[k] !== old[k]).map((k) => `${k}: ${back[k]} for ${old[k]}`), null); }
  run('the A2 birdcage (the r556 factory muzzle) has the model', has(Gm.Gunsmith.PLATFORMS.hk416.defaults.muzzle, 'apMuzzle', 'muzzle/ironvale_a2_556'), null);
  const spec = Gm.Gunsmith.modelSpec({ id: 'ar9', build: Gm.Gunsmith.defaultBuild('ar9') });
  run('a build\'s spec carries the furniture keys (the AR-9: the Kestrel and the A2 grip)', spec.apStock === 'stock/kestrel_cs4' && spec.apGrip === 'grip/brightline_a2' && spec.apHg == null ? [] : [JSON.stringify({ apStock: spec.apStock, apGrip: spec.apGrip, apHg: spec.apHg })], null); }
// FLIP MAGNIFIERS (models/parts/magnifier: GUN_MODEL_CONTRACT.authoredParts.magnifier): the config, the node tree (one part_magn), the geometry (checkMagnifier), the catalogue
fconf('magnifier/strix_fts3', 'the FTS 3 is valid', () => {}, null);
fconf('magnifier/strix_fts3', 'the optic frame on a magnifier', (c) => { c.frame = 'rail-top'; }, /"frame" is "rail-top", expected "magnifier-mount"/);
fconf('magnifier/strix_fts3', 'a missing anchor', (c) => { delete c.anchors.hinge; }, /anchors\.hinge is missing \(a magnifier has pip, hinge, foot, foot_end\)/);
fconf('magnifier/strix_fts3', 'an anchor of another slot', (c) => { c.anchors.support = [0, 0, 0]; }, /anchors\.support: not an anchor of a magnifier/);
fconf('magnifier/strix_fts3', 'part data instead of magnifier data', (c) => { c.part = { px: 3 }; }, /unknown field "part" \(a magnifier's data is "magnifier"\)/);
fconf('magnifier/strix_fts3', 'no magnifier data', (c) => { delete c.magnifier; }, /"magnifier" is missing/);
fconf('magnifier/strix_fts3', 'a power out of range', (c) => { c.magnifier.px = 30; }, /magnifier\.px: the power, 1\.2 to 10/);
fconf('magnifier/strix_fts3', 'a tube length in millimetres', (c) => { c.magnifier.len = 75; }, /magnifier\.len: the tube's length/);
fconf('magnifier/strix_fts3', 'the pip lens not at the tube\'s rear', (c) => { c.magnifier.pip.f = -0.08; c.anchors.pip[0] = -0.08; }, /magnifier\.pip\.f \(-0\.08\) is not the tube's rear \(-0\.025 - len = -0\.1000\)/);
fconf('magnifier/strix_fts3', 'the pip anchor off the sight line', (c) => { c.anchors.pip = [-0.1, 0.004, 0]; }, /anchors\.pip \[-0\.1,0\.004,0\] is not \[magnifier\.pip\.f, 0, 0\]/);
fconf('magnifier/strix_fts3', 'a flip about another axis', (c) => { c.magnifier.flip.axis = 'x'; }, /magnifier\.flip\.axis: "x", expected "y"/);
fconf('magnifier/strix_fts3', 'a flip of the wrong node', (c) => { c.magnifier.flip.part = 'part_tube'; }, /magnifier\.flip\.part: "part_tube", expected "part_magn"/);
fconf('magnifier/strix_fts3', 'a flip in radians', (c) => { c.magnifier.flip.out_deg = -2.8; }, /magnifier\.flip\.out_deg: the angle it swings out to, 60 to 180 degrees/);
fconf('magnifier/strix_fts3', 'the foot\'s ends swapped', (c) => { [c.anchors.foot, c.anchors.foot_end] = [c.anchors.foot_end, c.anchors.foot]; }, /anchors\.foot \(-0\.025\) must be behind anchors\.foot_end/);
fconf('magnifier/strix_fts3', 'the clamp under the sight', (c) => { c.anchors.foot_end = [0.01, -0.034, 0]; }, /anchors\.foot_end \(0\.01\) reaches under the sight/);
fconf('magnifier/strix_fts3', 'a magnifier always replaces', (c) => { delete c.replaces; }, /"replaces": expected a non-empty list .*always replace-only/);
T('a magnifier\'s part_magn is only for a magnifier', tree([mesh('optic_1'), { name: 'part_magn', extras: { part: 'magn' }, mesh: false, uv: false, materials: [], children: [mesh('optic_2')] }]), /flat meshes under the root/);
{ const MT = (label, kids, re) => run('magnifier tree: ' + label, (({ errors, warnings }) => [...errors, ...warnings])(M.validateAuthoredPart(tree(kids, 'strix_fts3'), 'strix_fts3', 'magnifier')), re);
  const pm = (kids, extras = { part: 'magn' }) => ({ name: 'part_magn', extras, mesh: false, uv: false, materials: [], children: kids });
  MT('a clamp and a part_magn tube are valid', [mesh('magnifier_1', 'magnifier'), pm([mesh('magnifier_2', 'magnifier', 'glass')])], null);
  MT('no part_magn', [mesh('magnifier_1', 'magnifier')], /one part_magn node under its root .* this one has 0/);
  MT('an empty part_magn', [mesh('magnifier_1', 'magnifier'), pm([])], /node "part_magn" has no meshes/);
  MT('another part_ node', [mesh('magnifier_1', 'magnifier'), pm([mesh('magnifier_2', 'magnifier')]), { name: 'part_ch', extras: { part: 'ch' }, mesh: false, uv: false, materials: [], children: [] }], /node "part_ch": an authored part is flat meshes under the root .*but its one part_magn/);
  MT('part_magn with another part key', [mesh('magnifier_1', 'magnifier'), pm([mesh('magnifier_2', 'magnifier')], { part: 'ch' })], /node "part_magn": extras\.part is "ch", expected "magn"/);
  MT('a tube mesh named for another slot', [mesh('magnifier_1', 'magnifier'), pm([mesh('optic_2', 'magnifier')])], /must be named "magnifier_<n>"/); }
{ const mp = readAuthoredPart('magnifier/strix_fts3'), mc = () => JSON.parse(JSON.stringify(mp.cfg));
  const MG = (label, cmut, re, meshMut, nodes) => { const c = mc(); if (cmut) cmut(c); const ms = meshMut ? meshMut(mp.meshes) : mp.meshes; run('magnifier geometry: ' + label, checkMagnifier(c, ms, nodes || mp.nodes), re); };
  for (const k of ['brightline_2x', 'strix_fts3', 'meridian_5x']) { const p = readAuthoredPart('magnifier/' + k); run(`magnifier geometry: ${k} as authored`, checkMagnifier(p.cfg, p.meshes, p.nodes), null); }
  MG('the tube\'s meshes read as part_magn\'s', null, null, (ms) => (ms.some((e) => e.part === 'magn') && ms.some((e) => !e.part) ? ms : []));
  MG('nothing under part_magn', null, /no meshes under part_magn/, (ms) => ms.map((e) => ({ ...e, part: undefined })));
  MG('the node off the hinge', null, /the part_magn node is at .* not at anchors\.hinge/, null, { part_magn: [0.03, -0.02, 0.042] });
  MG('the hinge anchor off the node', (c) => { c.anchors.hinge = [-0.042, -0.01, 0.024]; }, /not at anchors\.hinge \[-0\.042,-0\.01,0\.024\]/);
  MG('the tube\'s rear not at the pip lens', (c) => { c.magnifier.pip.f = -0.09; }, /the tube's rear is at forward -100\.0 mm, not at magnifier\.pip\.f \(-90\.0 mm\)/);
  MG('the foot under the rail top', (c) => { c.anchors.foot[1] = -0.03; c.anchors.foot_end[1] = -0.03; }, /the clamp reaches 4\.0 mm below anchors\.foot/);
  MG('the foot floating over the rail', (c) => { c.anchors.foot[1] = -0.04; c.anchors.foot_end[1] = -0.04; }, /the clamp's lowest vertex is 6\.0 mm above anchors\.foot/);
  MG('the foot\'s span not the anchors\'', (c) => { c.anchors.foot[0] = -0.07; }, /the clamp's foot runs forward -59\.0 mm to -25\.0 mm, not anchors\.foot to foot_end \(-70\.0 mm to -25\.0 mm\)/);
  MG('a flip the wrong way (down through the rail)', (c) => { c.magnifier.flip.out_deg = 160; }, /the tube swings DOWN through the rail/);
  MG('a flip too small to clear the view', (c) => { c.magnifier.flip.out_deg = -10; }, /only .* from the sight line: it still blocks the view/);
  MG('a lens off the sight line', null, /the lens "magnifier_\d+" is centred .* off the sight line/, (ms) => ms.map((e) => (e.mat === 'glass' && e.part ? { ...e, pos: e.pos.map((v, i) => (i % 3 === 1 ? v + 0.003 : v)) } : e)));
  MG('reaching into the sight', null, /it must stay behind the sight/, (ms) => ms.map((e, i) => (i === 0 ? { ...e, pos: e.pos.map((v, j) => (j % 3 === 2 ? v - 0.05 : v)) } : e)));
  const pc = (f) => checkPipClear({ optic: { pip: { f, y: 0, r: mp.cfg.magnifier.pip.r } } }, mp.meshes);
  run('magnifier pip clear: the FTS 3 as authored', pc(mp.cfg.magnifier.pip.f), null);
  run('magnifier pip clear: the disc inside the eyepiece', pc(mp.cfg.magnifier.pip.f + 0.004), /is not on the eye side of the glass mesh/); }
{ const Gm = loadGame(), P = Gm.Gunsmith.PARTS, byName = (n) => Object.values(P).find((q) => q.name === n);
  for (const [n, k] of [['Brightline 2× micro magnifier', 'brightline_2x'], ['Strix FTS 3× flip magnifier', 'strix_fts3'], ['Meridian 5× flip magnifier', 'meridian_5x']]) { const p = byName(n); run(`the ${n} has its model`, p && p.model && p.model.apMagn === 'magnifier/' + k ? [] : [`${n}: model ${JSON.stringify(p && p.model)}`], null); }
  const b = { ...Gm.Gunsmith.defaultBuild('m4'), optic: byName('Strix HX-2 holographic').id, magnifier: byName('Meridian 5× flip magnifier').id }, spec = Gm.Gunsmith.modelSpec({ id: 'm4', build: b });
  run('a build\'s spec carries the magnifier\'s key (the Mk18 with the 5x behind an HX-2)', spec.apMagn === 'magnifier/meridian_5x' && spec.magnifier && spec.magnifier.len === 0.09 ? [] : [JSON.stringify({ apMagn: spec.apMagn, magnifier: spec.magnifier })], null);
  const spec0 = Gm.Gunsmith.modelSpec({ id: 'm4', build: { ...b, magnifier: undefined } });
  run('and none without a magnifier', spec0.apMagn == null ? [] : ['apMagn ' + spec0.apMagn], null); }
// the catalogue entry and the generated block
const entry = entryOf('optic/falcon', cfg0());
run('the catalogue id is derived', entry.id === 'op.auth.falcon' && entry.model.apart === 'optic/falcon' && entry.model.optic === 'authored' && entry.model.ret === 'dot' && entry.magnifier === true ? [] : ['entry ' + JSON.stringify(entry)], null);
{ const t = fs.readFileSync(PARTS_TS, 'utf8').replace(/\r\n/g, '\n'); run('js/parts.ts carries the generated block', t === partsTsWithBlock(t) ? [] : ['the block differs from the model.json files'], null); }
console.log(bad ? `${bad} of ${n} FAILED` : `${n} authored-part checks ok`);
process.exit(bad ? 1 : 0);
