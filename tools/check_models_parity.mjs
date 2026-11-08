// PARITY with an earlier bake: every build assembled by THIS runtime from THIS bake against the same build assembled by an older runtime from its own bake
// (the per-part bake's proof against the per-combination packs it replaced: docs/models.md "Per-part bake"). Both are assembled the way the game does
// (G.Models.assemble through the bundle), and compared slot by slot (the triangles, within --tol, default 0.05 mm), leaf by leaf (every info leaf but mounts,
// numbers to 1e-9) and by the animated parts' pivots.
//   node tools/check_models_parity.mjs --old-dist <its dist/js/> --old-root <a folder holding its assets/models> [ids ...] [--held N] [--learn N] [--seed S] [--tol m] [--no-sweep] [--no-cases]
// The builds: the sweep (the default, the loaded builds and every single swap from each), the edge cases and regressions (tests/), and N random ones.
import { loadGameWithModels, loadModels } from './model_env.mjs';
import { sweepOf, defOf, randomBuilds, buildKey, meshesOf } from './model_sweep.mjs';
import { generateAll, regressionsOf } from './model_cases.mjs';
import { matchTriangles } from './model_diff.mjs';
import { cleanInfo } from './model_parts.mjs';

const args = process.argv.slice(2), opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const OLD_DIST = opt('--old-dist'), OLD_ROOT = opt('--old-root'), HELD = +opt('--held', 0), SEED = +opt('--seed', 99001), TOL = +opt('--tol', 5e-5), LEARN = +opt('--learn', 0);
const SWEEP = !args.includes('--no-sweep'), CASES = !args.includes('--no-cases');
const ids = args.filter((a, i) => !a.startsWith('--') && !(i > 0 && ['--old-dist', '--old-root', '--held', '--seed', '--tol', '--learn'].includes(args[i - 1])));
if (!OLD_DIST || !OLD_ROOT) { console.error('usage: node tools/check_models_parity.mjs --old-dist <dir> --old-root <dir> [ids ...]'); process.exit(2); }
const t0 = Date.now();
const N = await loadGameWithModels(), O = await loadGameWithModels({ dist: OLD_DIST.replace(/\/?$/, '/'), root: OLD_ROOT }), Models = loadModels(), GS = N.Gunsmith;
const plats = Object.keys(GS.PLATFORMS).filter((id) => N.WEAPONS[id] && (!ids.length || ids.includes(id)));
/** An order-free numeric hash of a slot's triangles (each corner to 0.1 mm, its corners in order, with the material): the same triangles, the same hash. */
const fastHash = (ms) => {
  let a = 0, b = 0, n = 0; const R = (x) => Math.round(x * 1e4);
  for (const m of ms) { let hm = 0; for (let i = 0; i < m.mat.length; i++) hm = (hm * 31 + m.mat.charCodeAt(i)) | 0;
    for (let i = 0; i < m.v.length; i += 9) {
      const c = [0, 1, 2].map((k) => [R(m.v[i + k * 3]), R(m.v[i + k * 3 + 1]), R(m.v[i + k * 3 + 2])]).sort((x, y) => x[0] - y[0] || x[1] - y[1] || x[2] - y[2]);
      let h1 = hm, h2 = hm ^ 0x5bd1e995; for (const p of c) for (const x of p) { h1 = Math.imul(h1 ^ x, 0x9e3779b1); h2 = Math.imul(h2 + x, 0x85ebca6b) ^ (h2 >>> 13); }
      a = (a + (h1 >>> 0)) % 4294967291; b = (b + (h2 >>> 0)) % 4294967279; n++;
    } }
  return a + ':' + b + ':' + n;
};
const units = (asm) => { const o = {}; for (const m of meshesOf(asm.group, asm.info)) { const t = m.tag.split('@')[0]; (o[t] = o[t] || []).push(m); } return o; };
const leaves = (info) => Models.infoLeaves(cleanInfo(Object.fromEntries(Object.entries(info).filter(([k]) => k !== 'mounts'))));
const tot = { n: 0, same: 0, tol: 0, wrong: 0, uncovered: 0, maxDev: 0, maxInfo: 0 }, wrong = [];
function compare(id, b, label) {
  const def = defOf(N, id, b), a = N.Models.assemble(def), o = O.Models.assemble({ ...def });
  tot.n++;
  if (!a || a.approx || !o || o.approx) { tot.uncovered++; wrong.push(`${id} [${label}] not assembled: new ${a ? a.approx || 'ok' : 'null'}, old ${o ? o.approx || 'ok' : 'null'}`); return; }
  const diffs = []; let dev = 0, exact = true;
  const ua = units(a), uo = units(o);
  for (const t of new Set([...Object.keys(ua), ...Object.keys(uo)])) {
    if (!ua[t] || !uo[t]) { diffs.push(`slot ${t}: ${ua[t] ? 'only new' : 'only old'}`); continue; }
    if (fastHash(ua[t]) === fastHash(uo[t])) continue; // (else the triangles may still be the same, sorted otherwise or within the tolerance: matched one by one)
    exact = false; const d = matchTriangles(ua[t], uo[t], TOL); if (!(d <= TOL)) diffs.push(`slot ${t}: the triangles differ`); else dev = Math.max(dev, d);
  }
  const la = leaves(a.info), lo = leaves(o.info);
  for (const k of new Set([...Object.keys(la), ...Object.keys(lo)])) { const x = la[k], y = lo[k]; if (typeof x === 'number' && typeof y === 'number') { const e = Math.abs(x - y); if (e > tot.maxInfo) tot.maxInfo = e; if (e > 1e-9) diffs.push(`info ${k}: new ${x}, old ${y}`); } else if (JSON.stringify(x) !== JSON.stringify(y)) diffs.push(`info ${k}: new ${JSON.stringify(x)}, old ${JSON.stringify(y)}`); }
  const ka = Object.keys(a.info.anim).sort().join(), ko = Object.keys(o.info.anim).sort().join(); if (ka !== ko) diffs.push(`animated parts: new ${ka}, old ${ko}`);
  a.group.updateMatrixWorld(true); o.group.updateMatrixWorld(true);
  for (const k of Object.keys(a.info.anim)) { const x = a.info.anim[k], y = o.info.anim[k]; if (!y) continue; const p = x.getWorldPosition(new x.position.constructor()), q = y.getWorldPosition(new y.position.constructor()); if (p.distanceTo(q) > 1e-5) diffs.push(`pivot part_${k}: ${(p.distanceTo(q) * 1000).toFixed(3)} mm apart`); }
  if (diffs.length) { tot.wrong++; wrong.push(`${id} [${label}] ${buildKey(b)}: ${diffs.slice(0, 4).join('; ')}`); return; }
  if (dev > tot.maxDev) tot.maxDev = dev; if (exact) tot.same++; else tot.tol++;
}
const cases = CASES ? generateAll(N, ids.length ? ids : null) : [], regs = CASES ? regressionsOf(N, ids.length ? ids : null).cases : [];
for (const id of plats) {
  await N.Models.preloadPlatform(id); await O.Models.preloadPlatform(id);
  const n0 = tot.n;
  for (const c of cases.filter((c) => c.platform === id)) compare(id, c.build, c.why);
  for (const c of regs.filter((c) => c.platform === id)) compare(id, c.build, 'regression ' + c.why);
  const { bases, list } = sweepOf(GS, id);
  if (SWEEP) for (const e of list) compare(id, e.build, `${e.slot || 'base'}=${e.part}`);
  if (HELD) for (const b of randomBuilds(GS, id, bases, Math.ceil(HELD / plats.length), SEED, new Set(list.map((e) => buildKey(e.build))), 3, 6)) compare(id, b, 'held-out');
  if (LEARN) for (const b of randomBuilds(GS, id, bases, LEARN, 7001, new Set(list.map((e) => buildKey(e.build))), 2, 6)) compare(id, b, 'random (the old learning set)'); // (--learn 600: the random builds the per-combination bake learnt from, 2 to 6 parts changed, seed 7001)
  console.log(`${id.padEnd(10)} ${tot.n - n0} builds`);
}
console.log(`\nPARITY: ${tot.n} builds assembled by the new runtime from the new bake and by the old from the old: ${tot.same} the same triangles, ${tot.tol} within ${TOL * 1000} mm (largest ${(tot.maxDev * 1000).toFixed(4)} mm), ${tot.wrong} DIFFERENT, ${tot.uncovered} not assembled; info leaves agree to ${tot.maxInfo.toExponential(2)} m`);
for (const w of wrong.slice(0, 40)) console.error('  ' + w);
console.log(`${((Date.now() - t0) / 1000).toFixed(0)} s`);
process.exit(tot.wrong + tot.uncovered ? 1 : 0);
