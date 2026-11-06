// THE MODEL TEST (npm run test:models runs it): the curated edge-case builds of every platform (tools/model_cases.mjs, tests/model-builds.json) and the
// hand-kept regressions (tests/model-regressions.json), each assembled from the packs (the real files, js/glb.js assemble()) and compared with the recipe, and
// with the GOLDEN fingerprints (tests/model-golden.json).
//   node tools/check_model_cases.mjs [id ...] [--update-golden] [--quiet] [--report dir] [--tol metres]
//                                    [--sweep]          also the single-swap sweep (~9,100 builds) against the recipe
//                                    [--held N] [--seed S]   also N random held-out builds (3-6 parts changed) against the recipe
//                                    [--no-cases]       only the sweep / held-out set; [--no-golden] skip the golden comparison
//
// Every build is compared in full and EVERY difference is listed (a slot's triangles, each info leaf, the animated parts' pivots), not just the first:
//   exact      the same triangles (an order-independent hash of each triangle's world position to 0.1 mm and its material)
//   tolerance  the same meshes per slot, no vertex further than --tol (default 0.05 mm: float32 positions, a shared part stored once and moved by an offset)
//   WRONG      anything else.   NOT COVERED: assemble() gave nothing, or only an approximate model.   Both fail the test.
// GOLDEN: per case, per slot { tris, hash, box, area } and every info leaf, rounded, from the assembled gun. Once a gun is authored in Blender with no recipe
// to compare with, its cases are checked against the fingerprints approved before. --update-golden rewrites tests/model-golden.json (and the case list,
// tests/model-builds.json): review the diff.
import fs from 'fs'; import path from 'path';
import { loadGameWithModels, loadModels, ROOT } from './model_env.mjs';
import { sweepOf, defOf, randomBuilds, buildKey } from './model_sweep.mjs';
import { makeComparer, compareFingerprints } from './model_compare.mjs';
import { sideBySide } from './model_report.mjs';
import { generateAll, regressionsOf, casesText, committedCases, CASES_FILE, keyOf } from './model_cases.mjs';

export const GOLDEN_FILE = path.join(ROOT, 'tests/model-golden.json');

const args = process.argv.slice(2), opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const HELD = +opt('--held', 0), SEED = +opt('--seed', 99001), TOL = +opt('--tol', 5e-5), quiet = args.includes('--quiet'), REPORT = opt('--report', null);
const SWEEP = args.includes('--sweep'), CASES = !args.includes('--no-cases'), GOLD = !args.includes('--no-golden'), UPDATE = args.includes('--update-golden');
const ids = args.filter((a, i) => !a.startsWith('--') && !(i > 0 && ['--held', '--seed', '--tol', '--report'].includes(args[i - 1])));
const t0 = Date.now();
const G = await loadGameWithModels(), GS = G.Gunsmith, M = G.Models, Models = loadModels();
const { compare, procedural, fingerprint } = makeComparer(G, Models, TOL);
const plats = Object.keys(GS.PLATFORMS).filter((id) => G.WEAPONS[id] && (!ids.length || ids.includes(id)));

const mk = () => ({ n: 0, exact: 0, tol: 0, wrong: 0, uncovered: 0, maxDev: 0, by: {} });
const total = { cases: mk(), regress: mk(), sweep: mk(), held: mk() };
const wrong = [], uncovered = [], goldDiffs = [], problems = [];
const golden = !UPDATE && GOLD && fs.existsSync(GOLDEN_FILE) ? JSON.parse(fs.readFileSync(GOLDEN_FILE, 'utf8')) : null;
const newGolden = {};

/** Assembles one build, compares it with the recipe; returns the kind and (for the golden) the assembled gun's fingerprint. */
function run(id, which, b, label) {
  const T = total[which], def = defOf(G, id, b), asm = M.assemble(def); T.n++;
  if (!asm || asm.approx) { T.uncovered++; uncovered.push({ id, which, label, build: b, why: asm ? 'only an approximate model: ' + asm.approx : 'assemble() returned null' }); if (!quiet) console.error(`  NOT COVERED ${id} [${label}]`); return { kind: 'uncovered' }; }
  const r = compare(def, asm, procedural(def)); T[r.kind]++; if (r.dev > T.maxDev) T.maxDev = r.dev;
  if (r.kind === 'wrong') {
    wrong.push({ id, which, label, build: b, diffs: r.diffs });
    for (const d of r.diffs) { const k = d.kind + ':' + d.what; T.by[k] = (T.by[k] || 0) + 1; }
    if (!quiet) { console.error(`  WRONG ${id} [${label}] ${buildKey(b)}`); for (const d of r.diffs) console.error(`      ${d.kind} ${d.what}: ${d.detail}`); }
  }
  return { kind: r.kind, fp: fingerprint(asm) };
}

// the case list: generated now; the committed file must be what the rules give
let cases = [], reg = { cases: [], stale: [] };
if (CASES) {
  cases = generateAll(G, ids.length ? ids : null).filter((c) => plats.includes(c.platform)); reg = regressionsOf(G, ids.length ? ids : null);
  if (!ids.length) {
    if (UPDATE) { fs.mkdirSync(path.dirname(CASES_FILE), { recursive: true }); fs.writeFileSync(CASES_FILE, casesText(cases) + '\n'); }
    else { const c = committedCases(); if (!c || JSON.stringify(c.cases) !== JSON.stringify(JSON.parse(JSON.stringify(cases)))) problems.push('tests/model-builds.json is not what the rules in tools/model_cases.mjs give now (new gun or part?): run node tools/check_model_cases.mjs --update-golden and review the diff'); }
  }
  for (const s of reg.stale) problems.push('STALE regression: ' + s);
}

let sweepN = 0;
for (const id of plats) {
  const mine = cases.filter((c) => c.platform === id), regs = reg.cases.filter((c) => c.platform === id);
  if (!mine.length && !regs.length && !SWEEP && !HELD) continue;
  await M.preloadPlatform(id);
  if (!M.platformLoaded(id)) { problems.push(`${id}: no packs (run npm run bake:models)`); continue; }
  // (the game computes bounds on the loaded packs as it renders them: an assembled copy must not inherit them)
  const ixf = JSON.parse(fs.readFileSync(path.join(ROOT, 'assets/models/parts', id, 'index.json'), 'utf8'));
  for (const t of Object.values(ixf.tags)) for (const e of t.packs) if (e.file) (await G.GLB.load('assets/models/parts/' + (e.file.startsWith('_shared/') ? '' : id + '/') + e.file)).traverse((o) => { if (o.isMesh) { o.geometry.computeBoundingBox(); o.geometry.computeBoundingSphere(); } });
  const line = { cases: {}, regress: {} };
  for (const [which, list] of [['cases', mine], ['regress', regs]]) for (const c of list) {
    const key = keyOf(c.build), r = run(id, which, c.build, c.why); line[which][r.kind] = (line[which][r.kind] || 0) + 1;
    if (!r.fp) continue;
    (newGolden[id] = newGolden[id] || {})[key] = r.fp;
    if (golden) {
      const g = golden.cases[id] && golden.cases[id][key];
      if (!g) { goldDiffs.push({ id, why: c.why, build: c.build, diffs: [{ kind: 'golden', what: 'missing', detail: 'no golden fingerprint for this case: run --update-golden and review' }] }); if (!quiet) console.error(`  NO GOLDEN ${id} [${c.why}]`); }
      else { const d = compareFingerprints(g, r.fp); if (d.length) { goldDiffs.push({ id, why: c.why, build: c.build, diffs: d }); if (!quiet) { console.error(`  GOLDEN DIFFERS ${id} [${c.why}]`); for (const x of d) console.error(`      ${x.kind} ${x.what}: ${x.detail}`); } } }
    }
  }
  if (SWEEP || HELD) {
    const { bases, list } = sweepOf(GS, id), seen = new Set(list.map((e) => buildKey(e.build)));
    if (SWEEP) for (const e of list) { run(id, 'sweep', e.build, `${e.slot || 'base'}=${e.part}`); sweepN++; }
    const heldPer = Math.ceil(HELD / plats.length);
    if (HELD) for (const b of randomBuilds(GS, id, bases, heldPer, SEED, seen, 3, 6)) run(id, 'held', b, 'held-out');
  }
  if (!quiet) console.log(id.padEnd(10), 'cases', JSON.stringify(line.cases), regs.length ? 'regressions ' + JSON.stringify(line.regress) : '');
}

if (UPDATE) {
  const out = { about: 'Golden fingerprints of the edge-case builds (tests/model-builds.json, tests/model-regressions.json), from the guns assembled from the packs: per slot { tris, hash, box (mm: min xyz, max xyz; x right, y up, z back), area (cm2) } and every info leaf. Rewritten by node tools/check_model_cases.mjs --update-golden: review the diff.', cases: {} };
  for (const id of Object.keys(newGolden)) out.cases[id] = newGolden[id];
  const nl = String.fromCharCode(10), toText = (cs) => ['{', ' "about": ' + JSON.stringify(out.about) + ',', ' "cases": {', Object.entries(cs).map(([id, c]) => "  " + JSON.stringify(id) + ": {" + nl + Object.entries(c).map(([k, fp]) => "   " + JSON.stringify(k) + ": " + JSON.stringify(fp)).join("," + nl) + nl + "  }").join("," + nl), " }", "}", ""].join(nl);
  let all = out.cases;
  if (ids.length) { all = fs.existsSync(GOLDEN_FILE) ? JSON.parse(fs.readFileSync(GOLDEN_FILE, 'utf8')).cases : {}; for (const id of Object.keys(newGolden)) all[id] = newGolden[id]; } // (a subset: merged into the file)
  fs.writeFileSync(GOLDEN_FILE, toText(all));
  console.log(`golden fingerprints written: ${Object.values(newGolden).reduce((a, c) => a + Object.keys(c).length, 0)} cases (${path.relative(ROOT, GOLDEN_FILE)}${ids.length ? ', merged' : ''})`);
} else if (golden && !ids.length) {
  const extra = []; for (const [id, cs] of Object.entries(golden.cases)) for (const k of Object.keys(cs)) if (!(newGolden[id] && newGolden[id][k])) extra.push(id + ' ' + k);
  if (extra.length) problems.push(`${extra.length} golden entries have no case any more (first: ${extra[0]}): run --update-golden`);
}

const line = (name, T) => T.n ? `${name}: ${T.n} builds assembled from the packs and compared with the recipe: ${T.exact} exact, ${T.tol} within tolerance (<= ${TOL * 1000} mm; largest deviation ${(T.maxDev * 1000).toFixed(4)} mm), ${T.wrong} WRONG, ${T.uncovered} NOT COVERED` : null;
console.log('');
for (const [n, k] of [['EDGE CASES', 'cases'], ['REGRESSIONS', 'regress'], ['SWEEP', 'sweep'], [`HELD-OUT (3-6 parts changed, seed ${SEED})`, 'held']]) { const l = line(n, total[k]); if (l) console.log(l); const by = Object.entries(total[k].by).sort((x, y) => y[1] - x[1]); if (by.length) console.log(`  wrong by kind (${k}): ` + by.map(([a, c]) => `${a} x${c}`).join(', ')); }
if (golden) console.log(`GOLDEN: ${goldDiffs.length} cases differ from the approved fingerprints`);
console.log(`${((Date.now() - t0) / 1000).toFixed(0)} s`);
if (REPORT && wrong.length) {
  fs.mkdirSync(REPORT, { recursive: true });
  fs.writeFileSync(path.join(REPORT, 'wrong.json'), JSON.stringify({ wrong, uncovered, goldDiffs }, null, 1));
  let n = 0;
  for (const w of wrong) { if (!w.build || !Object.keys(w.build).length) continue; const def = defOf(G, w.id, w.build); const f = path.join(REPORT, `${String(++n).padStart(3, '0')}_${w.id}.png`); await sideBySide(f, w, M.assemble(def), procedural(def)); }
  console.log(`report: ${wrong.length} wrong, ${uncovered.length} not covered, written to ${REPORT}`);
}
for (const p of problems) console.error('PROBLEM: ' + p);
const bad = wrong.length + uncovered.length + goldDiffs.length + problems.length;
if (bad) { console.error(`\n${wrong.length} wrong, ${uncovered.length} not covered, ${goldDiffs.length} differ from the golden fingerprints, ${problems.length} other problems`); process.exit(1); }
