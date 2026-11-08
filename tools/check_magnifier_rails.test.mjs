// Tests of tools/check_magnifier_rails.mjs: the judging on made-up feet (a foot off the rail's rear or front, within the warning band, over it,
// waived, no rail), and on the recipe: the MP5's feet all on its claw mount's rail, and a sight moved back off it caught.
//   node tools/check_magnifier_rails.test.mjs        (npm run test:models runs it)
import { evaluate, judge, railRuns, magnifierBuilds } from './check_magnifier_rails.mjs';
import { loadGame } from './model_env.mjs';
import { loadedBuild, buildKey, defOf } from './model_sweep.mjs';

let bad = 0, n = 0;
const ok = (name, cond, more = '') => { n++; if (!cond) { bad++; console.log('FAIL ' + name + (more ? ': ' + more : '')); } };
const rail = (f0, f1, top = 0.05) => ({ kind: 'rail', f0, f1, top }), sight = (f0, f1, top = 0.05) => ({ kind: 'sight', f0, f1, top }), mag = (f0, f1) => ({ kind: 'magnifier', f0, f1, top: 0.03 });
const run = (feet, waivers = {}) => judge([{ id: 'gun', sight: 'dot', magnifier: 'mgn', ev: evaluate(feet) }], waivers);

// on the rail: nothing
{ const r = run([rail(0.1, 0.24), sight(0.16, 0.22), mag(0.1, 0.134)]); ok('both feet on the rail', !r.errors.length && !r.warnings.length, JSON.stringify(r)); }
// the magnifier 5 mm off the rear: an error, naming the gun, the magnifier, the side and the mm
{ const r = run([rail(0.1, 0.24), sight(0.16, 0.22), mag(0.095, 0.129)]); ok('a magnifier 5 mm off the rear is an error', r.errors.length === 1 && /magnifier's foot hangs 5 mm off the rail's rear/.test(r.errors[0]), JSON.stringify(r)); }
// the sight 4 mm off the front: an error
{ const r = run([rail(0.1, 0.24), sight(0.184, 0.244), mag(0.12, 0.154)]); ok('a sight 4 mm off the front is an error', r.errors.length === 1 && /sight's foot hangs 4 mm off the rail's front/.test(r.errors[0]), JSON.stringify(r)); }
// 2 mm off: a warning only
{ const r = run([rail(0.1, 0.24), sight(0.16, 0.22), mag(0.098, 0.132)]); ok('2 mm off is a warning', !r.errors.length && r.warnings.length === 1, JSON.stringify(r)); }
// waived: up to its maxMm a warning, over it an error
{ const feet = [rail(0.1, 0.24), sight(0.16, 0.22), mag(0.09, 0.124)];
  ok('a waived overhang is a warning', run(feet, { gun: { maxMm: 12, why: 'x' } }).errors.length === 0);
  ok('an overhang over its waiver is an error', run(feet, { gun: { maxMm: 8, why: 'x' } }).errors.length === 1); }
// a waiver no longer needed warns
{ const r = run([rail(0.1, 0.24), sight(0.16, 0.22), mag(0.1, 0.134)], { gun: { maxMm: 10, why: 'x' } }); ok('a waiver no longer needed warns', r.warnings.some((w) => /no longer needed/.test(w)), JSON.stringify(r)); }
// rails at the sight's height are joined where they touch; one at another height is not the sight's
{ ok('touching rails are one run', JSON.stringify(railRuns([rail(0.1, 0.15), rail(0.1505, 0.24), rail(0, 0.3, 0.02)], 0.05)) === JSON.stringify([[0.1, 0.24]]));
  const r = run([rail(0, 0.3, 0.02), rail(0.12, 0.24), sight(0.16, 0.22), mag(0.1, 0.134)]); ok('a rail at another height does not count', r.errors.length === 1, JSON.stringify(r)); }
// no rail under the sight: unchecked, listed by gun
{ const r = run([sight(0.16, 0.22), mag(0.1, 0.134)]); ok('no rail is listed as unchecked', !r.errors.length && r.noRail.has('gun'), JSON.stringify(r)); }
// no magnifier logged at all: an error (the recipe did not draw what the build has)
{ const r = run([rail(0.1, 0.24), sight(0.16, 0.22)]); ok('no magnifier foot is an error', r.errors.length === 1); }

// the recipe: the MP5's every reflex sight and magnifier on its claw mount's rail; with optFMag moved back 3 cm the magnifier is caught
{
  const G = loadGame(), GS = G.Gunsmith, bs = magnifierBuilds(GS, 'mp5', loadedBuild, buildKey);
  ok('the MP5 has magnifier builds', bs.length >= 8, String(bs.length));
  const res = bs.map((b) => ({ id: 'mp5', sight: b.sight, magnifier: b.magnifier, ev: evaluate(G.GunRecipes.feet(defOf(G, 'mp5', b.build)).feet) }));
  ok('the MP5: every foot on the rail', res.every((r) => r.ev.rail && !r.ev.over.length && !r.ev.problem), JSON.stringify(res.filter((r) => r.ev.over.length || r.ev.problem).slice(0, 2)));
  const spec = GS.PLATFORMS.mp5.spec, was = spec.optFMag;
  try { spec.optFMag = was - 0.03; const e = evaluate(G.GunRecipes.feet(defOf(G, 'mp5', bs[0].build)).feet); ok('the MP5 with its sight 3 cm back: the magnifier off the rear', e.over.some((o) => o.which === 'magnifier' && o.side === 'rear' && o.mm > 3), JSON.stringify(e.over)); }
  finally { spec.optFMag = was; }
}

console.log(bad ? `${bad} of ${n} magnifier-rail tests FAILED` : `all ${n} magnifier-rail tests passed`);
process.exit(bad ? 1 : 0);
