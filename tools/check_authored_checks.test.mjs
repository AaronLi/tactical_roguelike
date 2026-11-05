// Tests for the authored guns' geometric rules (tools/authored_checks.mjs): a synthetic gun made of boxes passes every rule, and a copy broken for each
// rule fails it with the expected message.   node tools/check_authored_checks.test.mjs
import { authoredChecks, boxMesh, checkMagWell } from './authored_checks.mjs';
let bad = 0, n = 0;
const run = (label, r, re, warn = false) => {
  n++; const msgs = warn ? r.warnings : r.errors, all = msgs.join('\n'), ok = re === null ? r.errors.length === 0 : re.test(all);
  if (!ok) { bad++; console.error(`FAIL ${label}: expected ${re}, got:\n  ${[...r.errors, ...r.warnings].join('\n  ') || '(nothing)'}`); } else console.log('ok   ' + label);
};
// several boxes as ONE mesh (a well's shell, a ring: what a modeller makes as one object)
const merged = (name, slot, boxes, extra = {}) => {
  const ms = boxes.map(([lo, hi]) => boxMesh(name, slot, lo, hi)), pos = [], idx = [];
  for (const m of ms) { const o = pos.length / 3; pos.push(...m.pos); idx.push(...m.idx.map((i) => i + o)); }
  return { name, slot, chain: [], chk: null, ...extra, pos: Float64Array.from(pos), idx };
};
const mag = (name, lo, hi, chk = null) => boxMesh(name, 'mag', lo, hi, { chain: ['mag'], chk });
// The synthetic gun ([forward, up, right] metres). Eye: fSight 0.03 - relief 0.075 = -0.045 forward, sy 0.06 up.
//   the rear aperture: a square ring at forward 0.030-0.033 round the sight line, its hole `hole` metres to each side (3.4 mm: 2.6 degrees from the eye)
//   the front post: 1.5 mm wide at forward 0.43, its tip at sy
//   the receiver over a magazine well (a hollow shell round magAt forward 0.1, its inside 0.07-0.13 forward and 12 mm to each side) and the magazine in it
//   the handguard 0.20-0.43 forward (mount_muzzle 0.46: 30 mm in front of it)
function gun(o = {}) {
  const sy = 0.06, h = o.hole ?? 0.0034, R = 0.008, f0 = 0.030, f1 = 0.033, post = o.post ?? 0.00075, wellR = 0.012;
  const ring = o.notch != null
    ? merged('optic_1', 'optic', [[[f0, sy - R, -R], [f1, sy - h, R]], [[f0, sy - h, -R], [f1, sy + R, -o.notch]], [[f0, sy - h, o.notch], [f1, sy + R, R]]]) // (a notch: open on top)
    : merged('optic_1', 'optic', [[[f0, sy + h, -R], [f1, sy + R, R]], [[f0, sy - R, -R], [f1, sy - h, R]], [[f0, sy - h, -R], [f1, sy + h, -h]], [[f0, sy - h, h], [f1, sy + h, R]]]);
  const meshes = [
    boxMesh('base_1', 'base', [-0.05, -0.02, -0.012], [0.2, 0.02, 0.012]), // (the receiver: a solid over the well)
    merged('base_2', 'base', [[[0.068, -0.06, -0.014], [0.07, -0.02, 0.014]], [[0.13, -0.06, -0.014], [0.132, -0.02, 0.014]], [[0.07, -0.06, wellR], [0.13, -0.02, 0.014]], [[0.07, -0.06, -0.014], [0.13, -0.02, -wellR]]]),
    boxMesh('base_3', 'base', [0.2, -0.008, -0.008], [0.46, 0.008, 0.008]), // (the barrel)
    ring,
    ...(o.noPost ? [] : [boxMesh('optic_2', 'optic', [0.43, 0.03, -post], [0.432, sy, post])]),
    boxMesh('handguard_1', 'handguard', [0.2, -0.02, -0.02], [o.hgEnd ?? 0.43, 0.03, 0.02]),
    mag('mag_1', [0.072, -0.15, -(o.magR ?? 0.011)], [0.128, -0.021, o.magR ?? 0.011]),
    mag('mag_2', [0.075, -0.0225, 0.008], [0.11, o.lipTop ?? -0.0195, 0.011]), mag('mag_3', [0.075, -0.0225, -0.011], [0.11, o.lipTop ?? -0.0195, -0.008]), // (the feed lips)
    mag('mag_4', [0.075, o.caseLo ?? -0.026, -0.0045], [0.11, o.crown ?? -0.018, 0.0045], { role: 'top', i: 0 }),
    ...(o.noTip ? [] : [mag('mag_5', [0.11, o.tipLo ?? -0.025, -0.002], [0.12, o.tipTop ?? -0.019, 0.002], { role: 'top', i: 1 })]),
    ...(o.noHoles ? [] : [mag('mag_6', [0.0715, -0.06, -0.003], [0.072, -0.055, 0], { role: 'hole', i: 0, t: 0.2, side: 1 })]),
    ...(o.noHoles || o.oneSided ? [] : [mag('mag_7', [0.128, -0.06, 0], [0.1285, -0.055, 0.003], { role: 'hole', i: 0, t: 0.2, side: -1 })]),
    ...(o.rounds ? [mag('mag_8', [0.075, -0.034, -0.0045], [0.11, -0.026, 0.0045], { role: 'round', i: 1, t: 0.05 })] : []),
    ...(o.extra || []),
  ];
  const info = { sy, fSight: 0.03, relief: o.relief ?? 0.075, magAt: [0.1, -0.021], ...(o.info || {}) };
  return { id: 'x', cfg: { source: 'authored', sights: { builtin: o.kinds || ['irons'], rail: [] } }, info, anchors: { mount_handguard: [0.2, 0, 0], mount_muzzle: [0.46, 0, 0] }, meshes, parts: { mag: { extras: { part: 'mag', ...(o.noW ? {} : { check: { w: 0.022 } }) } } } };
}
const ctx = (o = {}) => ({ hgMax: 0.24, replaced: {}, ...o });
const T = (label, o, re, c = {}, warn = false) => run(label, authoredChecks(gun(o), ctx(c)), re, warn);

T('the synthetic gun passes every rule', {}, null);
// a. irons
T('irons: a pinhole rear aperture', { hole: 0.0015 }, /the rear aperture \(optic_1, .*\) is 1\.\d+ degrees in radius .* at least 2\.35/);
T('irons: a front post too wide', { post: 0.006 }, /the front post at forward 431\.0 mm is 12\.0 mm wide, 1\.4\d degrees .* at most 1\.2/);
T('irons: something on the sight line', { extra: [boxMesh('base_9', 'base', [0.25, 0.055, -0.005], [0.26, 0.065, 0.005])] }, /the sight line from the eye to the front post's tip .* is crossed by base_9/);
T('irons: something in the sight picture round the tip', { extra: [boxMesh('base_9', 'base', [0.3, 0.0625, -0.02], [0.31, 0.07, 0.02])] }, /base_9 crosses the sight picture 0\.6 degrees round the front post's tip/);
T('irons: no front sight', { noPost: true }, /no front sight found/);
T('irons: a relief inside 0.06-0.09 m with a bigger aperture is fine', { relief: 0.085, hole: 0.0045 }, null);
T('irons: relief 0.12 warns', { relief: 0.12, hole: 0.0065 }, /info\.relief 0\.12 m is outside 0\.06-0\.09 m/, {}, true);
T('irons: a notch wide enough for light either side', { notch: 0.0015, kinds: ['notch'] }, null);
T('irons: a notch no wider than the post', { notch: 0.0001, kinds: ['notch'] }, /the rear notch is 0\.0\d degrees to its sides .* at least 1\.5 times as wide/);
T('irons: a gun whose sights are not irons is not looked through', { hole: 0.0015, kinds: ['riser'] }, null);
// b. the magazine check
T('magcheck: no check.w', { noW: true }, /no extras\.check\.w/);
T('magcheck: no top round tip (i 1)', { noTip: true }, /no mesh with extras\.chk \{ role: "top", i: 1 \}/);
T('magcheck: no holes and no clear rounds', { noHoles: true }, /no witness holes \(chk role "hole"\) and no clear-body rounds/);
T('magcheck: clear-body rounds instead of holes', { noHoles: true, rounds: true }, null);
T('magcheck: a hole on one face only', { oneSided: true }, /witness hole i 0 has 0 meshes on side -1/);
T('magcheck: a drum shows none', { noHoles: true, noW: true, noTip: true }, null, { magKind: 'drum' });
// c. the top round
T('topround: buried in the body', { crown: -0.026, caseLo: -0.032, tipTop: -0.027, tipLo: -0.031 }, /its crown is at -26\.0 mm up, 5\.0 mm under the magazine body's top .* buried/);
T('topround: under the feed lips', { lipTop: -0.0165 }, /its crown \(-18\.0 mm up\) is under the feed lips' top \(-16\.5 mm/);
// d. the handguard
T('handguard: too near mount_muzzle', { hgEnd: 0.45 }, /it ends 10\.0 mm behind mount_muzzle \(460\.0 mm\): it leaves at least 15\.0 mm/);
T('handguard: longer than hgMax', {}, /it is 230\.0 mm long, the platform's hgMax is 220\.0 mm/, { hgMax: 0.22 });
T('handguard: the only one the gun takes is not measured', { hgEnd: 0.45 }, null, { hgMax: 0.22, swap: { handguard: false, muzzle: false } });
T('handguard: the default part longer than hgMax', {}, /default handguard hg\.x is 250\.0 mm long, over the platform's hgMax 240\.0 mm/, { hgPart: { id: 'hg.x', len: 0.25 } });
// e. the magazine in its well
T('magwell: a magazine wider than the well', { magR: 0.0135 }, /the magazine pokes through the magazine well's wall \(base_2, .*\): \d+ points of it outside, the worst 3\.5 mm through base_2 \(mag_1 at forward 72\.0, up -60\.0, right -13\.5 mm\)/); // (its back corner: 1.5 mm out to the side and 2 mm behind the well's back, along the ray from the axis)
{ const g = gun(); const r = { errors: [], warnings: [] }; const w = checkMagWell(g, (m) => r.errors.push(m)); n++; if (!w || !w.walls || w.names.join() !== 'base_2' || r.errors.length) { bad++; console.error('FAIL magwell: the well is found as base_2 (the solid receiver over it is not a wall): ' + JSON.stringify(w)); } else console.log('ok   magwell: the well is found as base_2 (the solid receiver over it is not a wall)'); }
{ const g = gun(); g.meshes = g.meshes.filter((m) => m.name !== 'base_2'); run('magwell: no well (a solid receiver) warns', authoredChecks(g, ctx()), /no magazine well found round info\.magAt/, true); }
T('magwell: a barrel block is not a magazine in a well', { magR: 0.0135, noHoles: true, noW: true, noTip: true, info: { barrels: { n: 1 } } }, null);
// f. the furniture
const fac = [{ slot: 'handguard', id: 'hg.x', name: 'X handguard', shared: true }];
T('furniture: a factory handguard no authored part replaces (a warning)', {}, /the factory handguard is the catalogue's hg\.x "X handguard", and no models\/parts\/handguard\/<id>\/model\.json "replaces" it/, { factory: fac }, true);
run('furniture: one that is replaced is quiet', authoredChecks(gun(), ctx({ factory: fac, replaced: { handguard: new Map([['X handguard', 'handguard/x']]) } })), /^$/, true);
run('furniture: a part only this gun takes is quiet', authoredChecks(gun(), ctx({ factory: [{ ...fac[0], shared: false }] })), /^$/, true);

// waivers (tools/authored_waivers.json): exactly the waived gun + rule turns into a warning carrying its note
{
  const w = (o) => ({ x: o }), broken = { hole: 0.0015, noW: true };
  const r1 = authoredChecks(gun(broken), ctx({ waivers: w({ a: 'open the aperture' }) }));
  run('waiver: a waived rule is a warning with its note', r1, /WAIVED \(tools\/authored_waivers\.json x\.a: open the aperture\): models\/x: the iron sights .*rear aperture/, true);
  run('waiver: another rule of the same gun stays an error', r1, /no extras\.check\.w/);
  n++; if (r1.errors.some((e) => /rear aperture/.test(e))) { bad++; console.error('FAIL waiver: the waived error is not also an error'); } else console.log('ok   waiver: the waived error is not also an error');
  run('waiver: a waiver whose rule passes warns', authoredChecks(gun(), ctx({ waivers: w({ e: 'x' }) })), /the waiver x\.e is no longer needed \(rule e passes\): remove it/, true);
  run('waiver: another gun\'s waiver does not apply', authoredChecks(gun(broken), ctx({ waivers: { y: { a: 'x', b: 'x' } } })), /rear aperture[^]*check\.w|check\.w[^]*rear aperture/);
  run('waiver: a letter that is not a rule', authoredChecks(gun(), ctx({ waivers: w({ f: 'x' }) })), /x\.f is not a rule that can fail/);
}

console.log(bad ? `${bad} of ${n} FAILED` : `all ${n} authored-check tests passed`);
process.exit(bad ? 1 : 0);
