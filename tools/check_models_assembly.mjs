// Assembles guns from the per-part packs (the real files, the real decoder, js/glb.js assemble()) and checks them against the recipe.
//   node tools/check_models_assembly.mjs [id ...] [--held N] [--seed S] [--tol metres] [--report dir] [--quiet] [--no-sweep]   (needs `npm run bake:models` first)
// (a) THE SWEEP: every platform's default, two "loaded" builds and every single-part swap from each (~9,100 builds) is built twice, by the recipe
//     (js/gunmodels.ts) and by G.Models.assemble(def) from the packs, and compared;
// (b) THE HELD-OUT SET: N (default 10,000) random builds across all platforms, 3 to 6 parts changed at once from a random base (magnifiers,
//     riser dots, adapters, pistol slides and grips are slots like any other), with a seed the baker never saw. Not in the sweep, not in the
//     baker's learning set (it uses other seeds).
// Every build is compared in full and EVERY difference is listed (not just the first): a slot's triangles, an info leaf, the animated parts. A build is
//   exact      the same triangles: an order-independent hash of every triangle's world position to 0.1 mm and its material
//   tolerance  not hash-equal, but the same meshes (per slot) and no vertex further than --tol (default 0.05 mm: the files keep positions as float32,
//              a shared part is stored once and moved by an offset)
//   WRONG      anything else (a different shape, a missing slot, a vertex further off, another info leaf, other part pivots)
// and assemble() returning null, or only an approximate model (the packs hold no exact one), is NOT COVERED. Both fail the test. Counts are by kind and
// by slot / info leaf. --report <dir> writes the wrong builds (a JSON list and, for each, a side view assembled | recipe | difference as a PNG).
import crypto from 'crypto'; import fs from 'fs'; import path from 'path';
import { loadGameWithModels, loadModels, ROOT } from './model_env.mjs';
import { sweepOf, defOf, meshesOf, randomBuilds, buildKey } from './model_sweep.mjs';
import { cleanInfo } from './model_packs.mjs';
import { matchTriangles } from './model_diff.mjs';
import { sideBySide } from './model_report.mjs';

const args = process.argv.slice(2), opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const HELD = +opt('--held', 10000), SEED = +opt('--seed', 99001), TOL = +opt('--tol', 5e-5), quiet = args.includes('--quiet'), REPORT = opt('--report', null), SWEEP = !args.includes('--no-sweep');
const ids = args.filter((a, i) => !a.startsWith('--') && !(i > 0 && ['--held', '--seed', '--tol', '--report'].includes(args[i - 1])));
const G = await loadGameWithModels(), GS = G.Gunsmith, GM = G.GunModels, M = G.Models, Models = loadModels();
const plats = Object.keys(GS.PLATFORMS).filter((id) => !ids.length || ids.includes(id));

const R4 = (x) => Math.round(x * 1e4);
const unitsOf = (ms) => { const o = {}; for (const m of ms) { const t = m.tag.split('@')[0]; (o[t] = o[t] || []).push(m); } return o; };
function triHash(ms) {
  const parts = [];
  for (const m of ms) for (let i = 0; i < m.v.length; i += 9) { const c = [0, 1, 2].map((k) => [R4(m.v[i + k * 3]), R4(m.v[i + k * 3 + 1]), R4(m.v[i + k * 3 + 2])]); let r = 0; for (let k = 1; k < 3; k++) if (c[k].join() < c[r].join()) r = k; parts.push(m.mat + "|" + [c[r], c[(r + 1) % 3], c[(r + 2) % 3]].join(";")); } // (a triangle's corners may start anywhere: the compressed file reorders them, winding kept)
  parts.sort(); return crypto.createHash('md5').update(parts.join(';')).digest('hex');
}
/** The recipe's own model (G.Models.displayBaked is what display() asks first: turned off for the reference). */
function procedural(def) { const f = M.displayBaked; M.displayBaked = () => null; try { return GM.display(def); } finally { M.displayBaked = f; } }

/** Compares an assembled gun with the recipe's: { kind: 'exact' | 'tol' | 'wrong', dev, diffs: [{ kind: 'info' | 'slot' | 'tri' | 'anim' | 'pivot' | 'bounds', what, detail }] }. Lists every difference. */
function compare(def, asm, proc) {
  const diffs = [], D = (kind, what, detail) => diffs.push({ kind, what, detail });
  const a = meshesOf(asm.group, asm.info), p = meshesOf(proc.group, proc.info);
  const ia = Models.infoLeaves(cleanInfo(Object.fromEntries(Object.entries(asm.info).filter(([k]) => k !== 'mounts')))), ip = Models.infoLeaves(cleanInfo(proc.info));
  for (const k of new Set([...Object.keys(ia), ...Object.keys(ip)])) { const x = ia[k], y = ip[k]; if (!(typeof x === 'number' && typeof y === 'number' ? Math.abs(x - y) < 1e-6 : JSON.stringify(x) === JSON.stringify(y))) D('info', k, `assembled ${JSON.stringify(x)}, recipe ${JSON.stringify(y)}`); }
  // the geometry's cached bounds (frustum culling and the gunsmith's framing use them) must belong to the vertices it has now
  let stale = null;
  asm.group.traverse((o) => { if (!stale && o.isMesh && o.geometry.boundingBox) { const b = o.geometry.boundingBox.clone(); o.geometry.boundingBox = null; o.geometry.computeBoundingBox(); if (b.min.distanceTo(o.geometry.boundingBox.min) > 1e-5 || b.max.distanceTo(o.geometry.boundingBox.max) > 1e-5) stale = o.name; } });
  if (stale) D('bounds', stale, 'mesh ' + stale + ' has stale cached bounds');
  // animated parts: the same keys, the same pivots
  const ka = Object.keys(asm.info.anim).sort(), kp = Object.keys(proc.info.anim).filter((k) => proc.info.anim[k] && proc.info.anim[k].isObject3D).sort();
  if (ka.join() !== kp.join()) D('anim', 'parts', `animated parts: assembled ${ka}, recipe ${kp}`);
  asm.group.updateMatrixWorld(true); proc.group.updateMatrixWorld(true);
  for (const k of ka) {
    const x = asm.info.anim[k], y = proc.info.anim[k]; if (!y) continue; if (x.name !== 'part_' + k) { D('anim', k, `node ${x.name} for part ${k}`); continue; }
    const dx = x.getWorldPosition(new x.position.constructor()), dy = y.getWorldPosition(new y.position.constructor());
    if (dx.distanceTo(dy) > 1e-5) D('pivot', 'part_' + k, `pivot differs by ${(dx.distanceTo(dy) * 1000).toFixed(2)} mm`);
  }
  const ua = unitsOf(a), up = unitsOf(p); let dev = 0, exact = true;
  for (const t of new Set([...Object.keys(ua), ...Object.keys(up)])) {
    if (!ua[t]) { D('slot', t, `slot ${t} is missing from the assembled gun`); continue; }
    if (!up[t]) { D('slot', t, `slot ${t} is in the assembled gun and not in the recipe's`); continue; }
    if (triHash(ua[t]) === triHash(up[t])) continue;
    exact = false;
    const d = matchTriangles(ua[t], up[t], TOL);
    if (!(d <= TOL)) D('tri', t, `slot ${t}: the triangles are not the recipe's (within ${TOL * 1000} mm)`); else if (d > dev) dev = d;
  }
  if (diffs.length) return { kind: 'wrong', diffs };
  return exact ? { kind: 'exact', dev: 0, diffs } : { kind: 'tol', dev, diffs };
}

const mk = () => ({ n: 0, exact: 0, tol: 0, wrong: 0, uncovered: 0, maxDev: 0, by: {} });
const total = { sweep: mk(), held: mk() };
const wrong = [], uncovered = [];
const t0 = Date.now();
const per = {};
const run = (id, which, b, label) => {
  const T = total[which], def = defOf(G, id, b), asm = M.assemble(def); T.n++;
  if (!asm || asm.approx) { T.uncovered++; uncovered.push({ id, which, build: b, why: asm ? 'only an approximate model: ' + asm.approx : 'assemble() returned null' }); if (!quiet) console.error(`  NOT COVERED ${id} ${label}`); return 'uncovered'; }
  const r = compare(def, asm, procedural(def)); T[r.kind]++; if (r.dev > T.maxDev) T.maxDev = r.dev;
  if (r.kind === 'wrong') {
    wrong.push({ id, which, build: b, diffs: r.diffs });
    for (const d of r.diffs) { const k = d.kind + ':' + d.what; T.by[k] = (T.by[k] || 0) + 1; }
    if (!quiet) console.error(`  WRONG ${id} ${label}: ${r.diffs.map((d) => d.detail).join('; ')}`);
  }
  return r.kind;
};
const heldPer = Math.ceil(HELD / plats.length);
for (const id of plats) {
  await M.preloadPlatform(id);
  if (!M.platformLoaded(id)) { console.error(`FAIL ${id}: no packs (run npm run bake:models)`); wrong.push({ id, which: 'sweep', build: {}, diffs: [{ kind: 'slot', what: '*', detail: 'no packs' }] }); continue; }
  // (the game computes bounds on the loaded packs as it renders them: an assembled copy must not inherit them)
  const ixf = JSON.parse(fs.readFileSync(path.join(ROOT, 'assets/models/parts', id, 'index.json'), 'utf8'));
  for (const t of Object.values(ixf.tags)) for (const e of t.packs) if (e.file) (await G.GLB.load('assets/models/parts/' + (e.file.startsWith('_shared/') ? '' : id + '/') + e.file)).traverse((o) => { if (o.isMesh) { o.geometry.computeBoundingBox(); o.geometry.computeBoundingSphere(); } });
  const { bases, list } = sweepOf(GS, id), seen = new Set(list.map((e) => buildKey(e.build))), mine = { sw: {}, he: {} };
  if (SWEEP) for (const e of list) { const r = run(id, 'sweep', e.build, `${e.slot || 'base'}=${e.part}`); mine.sw[r] = (mine.sw[r] || 0) + 1; }
  for (const b of randomBuilds(GS, id, bases, heldPer, SEED, seen, 3, 6)) { const r = run(id, 'held', b, buildKey(b)); mine.he[r] = (mine.he[r] || 0) + 1; }
  per[id] = mine;
  if (!quiet) console.log(id.padEnd(10), 'sweep', JSON.stringify(mine.sw), 'held-out', JSON.stringify(mine.he));
}
const line = (name, T) => `${name}: ${T.n} builds assembled from the packs and compared with the recipe: ${T.exact} exact, ${T.tol} within tolerance (<= ${TOL * 1000} mm; largest deviation ${(T.maxDev * 1000).toFixed(4)} mm), ${T.wrong} WRONG, ${T.uncovered} NOT COVERED`;
console.log('\n' + line('SWEEP', total.sweep)); console.log(line('HELD-OUT (3-6 parts changed, seed ' + SEED + ')', total.held));
for (const w of ['sweep', 'held']) { const by = Object.entries(total[w].by).sort((x, y) => y[1] - x[1]); if (by.length) console.log(`  wrong by kind (${w}): ` + by.map(([k, n]) => `${k} x${n}`).join(', ')); }
console.log(`${((Date.now() - t0) / 1000).toFixed(0)} s`);
if (REPORT) {
  fs.mkdirSync(REPORT, { recursive: true });
  fs.writeFileSync(path.join(REPORT, 'wrong.json'), JSON.stringify({ wrong, uncovered }, null, 1));
  let n = 0;
  for (const w of wrong) { if (!w.build || !Object.keys(w.build).length) continue; const def = defOf(G, w.id, w.build); const f = path.join(REPORT, `${String(++n).padStart(3, '0')}_${w.id}.png`); await sideBySide(f, w, M.assemble(def), procedural(def)); w.image = f; }
  fs.writeFileSync(path.join(REPORT, 'wrong.json'), JSON.stringify({ wrong, uncovered }, null, 1));
  console.log(`report: ${wrong.length} wrong, ${uncovered.length} not covered, written to ${REPORT}`);
}
const bad = wrong.length + uncovered.length;
if (bad) { console.error(`\n${wrong.length} wrong and ${uncovered.length} not covered; first: ${wrong.length ? wrong[0].id + ' ' + buildKey(wrong[0].build) + ': ' + wrong[0].diffs[0].detail : uncovered[0].id + ' ' + buildKey(uncovered[0].build)}`); process.exit(1); }
