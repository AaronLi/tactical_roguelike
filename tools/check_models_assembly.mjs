// Assembles guns from the per-part packs (the real files, the real decoder, js/glb.js assemble()) and checks them against the recipe.
//   node tools/check_models_assembly.mjs [id ...] [--rand N] [--tol metres] [--quiet]        (needs `npm run bake:models` first)
// For every platform: every build of the sweep (the default, two "loaded" builds and every single-part swap from each: ~9,000 builds in all) is
// built twice, by the recipe (js/gunmodels.ts) and by G.Models.assemble(def) from the packs, and compared:
//   exact      the same triangles: an order-independent hash of every triangle's world position to 0.1 mm and its material (as the sweep fingerprints do)
//   tolerance  not hash-equal, but the same meshes (per slot) and no vertex further than --tol (default 0.05 mm = half the hash step: the 14-bit
//              position quantisation of the files)
//   FAIL       anything else (a different shape, a missing slot, a vertex further off): the test fails
// and the `info` (every leaf, 1e-6), the animated part nodes (names and pivots) and the slot of every mesh are compared too.
// Then N random builds per platform (two or three parts changed at once: not in the sweep, with a seed the baker did not learn from) as a held-out
// measure: where the packs cover the build (assemble() returns a model) the same comparison; where they do not, the game builds it from the recipe.
import crypto from 'crypto'; import fs from 'fs'; import path from 'path';
import { loadGameWithModels, loadModels, ROOT } from './model_env.mjs';
import { sweepOf, defOf, meshesOf, randomBuilds, buildKey } from './model_sweep.mjs';
import { cleanInfo } from './model_packs.mjs';
import { matchTriangles } from './model_diff.mjs';

const args = process.argv.slice(2), opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const RAND = +opt('--rand', 30), TOL = +opt('--tol', 5e-5), quiet = args.includes('--quiet');
const ids = args.filter((a, i) => !a.startsWith('--') && !(i > 0 && ['--rand', '--tol'].includes(args[i - 1])));
const G = await loadGameWithModels(), GS = G.Gunsmith, GM = G.GunModels, M = G.Models, Models = loadModels();
const plats = Object.keys(GS.PLATFORMS).filter((id) => !ids.length || ids.includes(id));

const R4 = (x) => Math.round(x * 1e4);
const unitsOf = (ms) => { const o = {}; for (const m of ms) (o[m.tag] = o[m.tag] || []).push(m); return o; };
function triHash(ms) {
  const parts = [];
  for (const m of ms) for (let i = 0; i < m.v.length; i += 9) { const c = [0, 1, 2].map((k) => [R4(m.v[i + k * 3]), R4(m.v[i + k * 3 + 1]), R4(m.v[i + k * 3 + 2])]); let r = 0; for (let k = 1; k < 3; k++) if (c[k].join() < c[r].join()) r = k; parts.push(m.mat + "|" + [c[r], c[(r + 1) % 3], c[(r + 2) % 3]].join(";")); } // (a triangle's corners may start anywhere: the compressed file reorders them, winding kept)
  parts.sort(); return crypto.createHash('md5').update(parts.join(';')).digest('hex');
}
/** The recipe's own model (G.Models.displayBaked is what display() asks first: turned off for the reference). */
function procedural(def) { const f = M.displayBaked; M.displayBaked = () => null; try { return GM.display(def); } finally { M.displayBaked = f; } }

/** Compares an assembled gun with the recipe's: { kind: 'exact' | 'tol' | 'fail', dev, why }. */
function compare(def, asm, proc) {
  const a = meshesOf(asm.group, asm.info), p = meshesOf(proc.group, proc.info);
  // info
  const ia = Models.infoLeaves(cleanInfo(Object.fromEntries(Object.entries(asm.info).filter(([k]) => k !== 'mounts')))), ip = Models.infoLeaves(cleanInfo(proc.info));
  for (const k of new Set([...Object.keys(ia), ...Object.keys(ip)])) { const x = ia[k], y = ip[k]; if (!(typeof x === 'number' && typeof y === 'number' ? Math.abs(x - y) < 1e-6 : JSON.stringify(x) === JSON.stringify(y))) return { kind: 'fail', why: `info ${k}: assembled ${JSON.stringify(x)}, recipe ${JSON.stringify(y)}` }; }
  // the geometry's cached bounds (frustum culling and the gunsmith's framing use them) must belong to the vertices it has now
  let stale = null;
  asm.group.traverse((o) => { if (!stale && o.isMesh && o.geometry.boundingBox) { const b = o.geometry.boundingBox.clone(); o.geometry.boundingBox = null; o.geometry.computeBoundingBox(); if (b.min.distanceTo(o.geometry.boundingBox.min) > 1e-5 || b.max.distanceTo(o.geometry.boundingBox.max) > 1e-5) stale = o.name; } });
  if (stale) return { kind: 'fail', why: 'mesh ' + stale + ' has stale cached bounds' };
  // animated parts: the same keys, the same pivots
  const ka = Object.keys(asm.info.anim).sort(), kp = Object.keys(proc.info.anim).filter((k) => proc.info.anim[k] && proc.info.anim[k].isObject3D).sort();
  if (ka.join() !== kp.join()) return { kind: 'fail', why: `animated parts: assembled ${ka}, recipe ${kp}` };
  asm.group.updateMatrixWorld(true); proc.group.updateMatrixWorld(true);
  for (const k of ka) {
    const x = asm.info.anim[k], y = proc.info.anim[k]; if (x.name !== 'part_' + k) return { kind: 'fail', why: `node ${x.name} for part ${k}` };
    const dx = x.getWorldPosition(new x.position.constructor()), dy = y.getWorldPosition(new y.position.constructor());
    if (dx.distanceTo(dy) > 1e-5) return { kind: 'fail', why: `part_${k} pivot differs by ${dx.distanceTo(dy)}` };
  }
  if (triHash(a) === triHash(p)) return { kind: 'exact', dev: 0 };
  const ua = unitsOf(a), up = unitsOf(p); let dev = 0;
  if (Object.keys(ua).sort().join() !== Object.keys(up).sort().join()) return { kind: 'fail', why: `slots: assembled ${Object.keys(ua)}, recipe ${Object.keys(up)}` };
  for (const t of Object.keys(up)) { const d = matchTriangles(ua[t], up[t], TOL); if (!(d <= TOL)) return { kind: 'fail', dev: d, why: `slot ${t}: the triangles are not the recipe's (within ${TOL * 1000} mm)` }; if (d > dev) dev = d; }
  return { kind: 'tol', dev };
}

const total = { sweep: { n: 0, exact: 0, tol: 0, fail: 0, maxDev: 0 }, rand: { n: 0, uncovered: 0, exact: 0, tol: 0, fail: 0, maxDev: 0 } };
const failures = [];
const t0 = Date.now();
for (const id of plats) {
  const n = await M.preloadPlatform(id);
  if (!M.platformLoaded(id)) { console.error(`FAIL ${id}: no packs (run npm run bake:models)`); failures.push(id + ': no packs'); continue; }
  // (the game computes bounds on the loaded packs as it renders them: an assembled copy must not inherit them)
  for (const t of Object.values(JSON.parse(fs.readFileSync(path.join(ROOT, 'assets/models/parts', id, 'index.json'), 'utf8')).tags)) for (const e of t.packs) if (e.file) (await G.GLB.load('assets/models/parts/' + id + '/' + e.file)).traverse((o) => { if (o.isMesh) { o.geometry.computeBoundingBox(); o.geometry.computeBoundingSphere(); } });
  const { bases, list } = sweepOf(GS, id), mine = { n: 0, exact: 0, tol: 0, fail: 0 };
  for (const e of list) {
    const def = defOf(G, id, e.build), asm = M.assemble(def);
    let r;
    if (!asm) r = { kind: 'fail', why: 'assemble() returned null for a build of the sweep' };
    else r = compare(def, asm, procedural(def));
    total.sweep.n++; mine.n++; total.sweep[r.kind]++; mine[r.kind]++; if (r.dev > total.sweep.maxDev) total.sweep.maxDev = r.dev;
    if (r.kind === 'fail') { failures.push(`${id} ${buildKey(e.build)}: ${r.why}`); if (!quiet) console.error(`  FAIL ${id} ${e.slot || 'base'}=${e.part}: ${r.why}`); }
  }
  const rs = { n: 0, uncovered: 0, exact: 0, tol: 0, fail: 0 };
  if (RAND) for (const b of randomBuilds(GS, id, bases, RAND, 99001, new Set(list.map((e) => buildKey(e.build))))) {
    const def = defOf(G, id, b), asm = M.assemble(def); rs.n++; total.rand.n++;
    if (!asm) { rs.uncovered++; total.rand.uncovered++; continue; }
    const r = compare(def, asm, procedural(def)); rs[r.kind]++; total.rand[r.kind]++; if (r.dev > total.rand.maxDev) total.rand.maxDev = r.dev;
    if (r.kind === 'fail' && !quiet) console.log(`  (held-out) ${id} ${buildKey(b)}: ${r.why}`);
  }
  if (!quiet) console.log(id.padEnd(10), `${n} packs loaded; sweep ${mine.n} builds: ${mine.exact} exact, ${mine.tol} within tolerance, ${mine.fail} FAIL;`, RAND ? `held-out ${rs.n}: ${rs.uncovered} not covered, ${rs.exact} exact, ${rs.tol} tolerance, ${rs.fail} wrong` : '');
}
const s = total.sweep, r = total.rand;
console.log(`\nSWEEP: ${s.n} builds assembled from the packs and compared with the recipe: ${s.exact} exact (same triangles at 0.1 mm), ${s.tol} within tolerance (<= ${TOL * 1000} mm; largest deviation ${(s.maxDev * 1000).toFixed(4)} mm), ${s.fail} FAIL`);
if (RAND) console.log(`HELD-OUT: ${r.n} random multi-part builds: ${r.uncovered} not covered by the packs (built from the recipe), ${r.exact} exact, ${r.tol} within tolerance (largest ${(r.maxDev * 1000).toFixed(4)} mm), ${r.fail} wrong`);
console.log(`${((Date.now() - t0) / 1000).toFixed(0)} s`);
if (failures.length) { console.error(`\n${failures.length} failure(s); first: ${failures[0]}`); process.exit(1); }
