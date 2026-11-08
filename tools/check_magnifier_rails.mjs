// MAGNIFIERS ON THEIR RAILS: for every gun that takes a magnifier, every reflex sight that opens the magnifier slot on it and every magnifier,
// the sight's own foot and the magnifier's foot must stand on the rail the sight stands on (docs/models.md "Magnifiers on the rail").
//   node tools/check_magnifier_rails.mjs [id ...] [--verbose]     (after tsc: npm run test:models runs it)
// Fast and drawn by nothing: each build is made by the recipe (tools/models/recipes.ts) with its feet log (G.GunRecipes.feet), which records
//   - every rail the recipe builds (S.rail; an authored gun's own optic mount, mount_optic_rail .. mount_optic_rail_end, or its railed receiver top): its
//     forward span and its top;
//   - the reflex sight's foot (red dot riser, holographic base, a riser dot's riser, an authored optic's vertices on the rail top) at its seat (optF, or
//     optFMag with a magnifier on a gun that has one), with the top it stands on;
//   - the magnifier's foot (S.magnifier: fSight - 59 mm .. fSight - 25 mm).
// The rail under the sight is every rail at the sight's top (within 0.5 mm), joined where they touch, the run that holds the sight's seat. A foot
// that hangs off its end by more than TOL (0.05 mm) is reported, front or rear, in mm: up to WARN_MM (3 mm) a warning, more an error, unless the gun
// is in tools/magnifier_rail_waivers.json (a gun that failed when the check came in: its overhangs up to its maxMm print as warnings).
import fs from 'fs'; import path from 'path'; import { fileURLToPath } from 'url';

export const TOL = 0.00005, WARN_MM = 3, TOP_TOL = 0.0005, JOIN = 0.001;
export const WAIVERS_FILE = path.join(path.dirname(fileURLToPath(import.meta.url)), 'magnifier_rail_waivers.json');

/** The rail runs at a height: the rails there, sorted and joined where they overlap or touch (within JOIN). */
export function railRuns(feet, top) {
  const rs = feet.filter((r) => r.kind === 'rail' && Math.abs(r.top - top) < TOP_TOL).map((r) => [r.f0, r.f1]).sort((a, b) => a[0] - b[0]), out = [];
  for (const r of rs) { const l = out[out.length - 1]; if (l && r[0] <= l[1] + JOIN) l[1] = Math.max(l[1], r[1]); else out.push([...r]); }
  return out;
}

/**
 * One build's feet log -> { rail: [f0, f1] | null, sight, magnifier, over: [{ which: 'sight'|'magnifier', side: 'rear'|'front', mm }], problem? }.
 * (The last sight and magnifier logged: the ones fitted; a riser dot over a scope logs the scope's rail and its own foot on top of it.)
 */
export function evaluate(feet) {
  const sight = [...feet].reverse().find((r) => r.kind === 'sight'), mag = [...feet].reverse().find((r) => r.kind === 'magnifier');
  if (!sight || !mag) return { problem: !sight ? 'no reflex sight foot logged' : 'no magnifier foot logged', over: [] };
  const runs = railRuns(feet, sight.top), mid = (sight.f0 + sight.f1) / 2;
  if (!runs.length) return { sight, magnifier: mag, rail: null, over: [], problem: `no rail at the sight's top (${(sight.top * 1000).toFixed(1)} mm)` };
  const dist = (r) => (mid < r[0] ? r[0] - mid : mid > r[1] ? mid - r[1] : 0), rail = runs.reduce((a, r) => (dist(r) < dist(a) ? r : a));
  const over = [];
  for (const [which, f] of [['sight', sight], ['magnifier', mag]]) {
    if (rail[0] - f.f0 > TOL) over.push({ which, side: 'rear', mm: +((rail[0] - f.f0) * 1000).toFixed(1) });
    if (f.f1 - rail[1] > TOL) over.push({ which, side: 'front', mm: +((f.f1 - rail[1]) * 1000).toFixed(1) });
  }
  return { sight, magnifier: mag, rail, over };
}

/** The builds to check on a gun: from its default and its loaded build, each sight that provides the magnifier slot in each optic slot, with each magnifier. */
export function magnifierBuilds(GS, id, loadedBuild, buildKey) {
  const out = new Map();
  for (const base of [GS.defaultBuild(id), loadedBuild(GS, id, 'A')]) for (const s of GS.slotsOf(id, base)) {
    if (s.slot !== 'optic' && s.slot !== 'riserdot') continue;
    for (const p of GS.compatible(s.mount).filter((q) => q.provides && q.provides.magnifier && GS.fitsSlot(s, q, id) && !q.retired && !q.variant)) {
      const b1 = { ...base, [s.slot]: p.id }; delete b1.magnifier; GS.prune(id, b1);
      const ms = GS.slotsOf(id, b1).find((x) => x.slot === 'magnifier');
      if (!ms) continue;
      for (const m of GS.compatible(ms.mount).filter((q) => GS.fitsSlot(ms, q, id))) {
        const b = { ...b1, magnifier: m.id }; GS.prune(id, b);
        if (b.magnifier !== m.id || b[s.slot] !== p.id) continue;
        const k = buildKey(b); if (!out.has(k)) out.set(k, { build: b, sight: p.id, magnifier: m.id });
      }
    }
  }
  return [...out.values()];
}

/** Judges results against the waivers: { errors: [...lines], warnings: [...lines] }. results: [{ id, sight, magnifier, ev }]. */
export function judge(results, waivers) {
  const errors = [], warnings = [], worst = {}, noRail = new Map();
  for (const { id, sight, magnifier, ev } of results) {
    const w = waivers[id], label = `${id}: ${sight} + ${magnifier}`;
    // (no rail under the sight: the recipe seats it straight on the receiver, or on a mount it builds with something other than a rail. There is
    // no rail to hang off, so it is listed once per gun as unchecked, not judged)
    if (ev.problem && !ev.rail && ev.sight) { noRail.set(id, ev.problem); continue; }
    if (ev.problem) { errors.push(`${label}: ${ev.problem}`); continue; }
    for (const o of ev.over) {
      worst[id] = Math.max(worst[id] || 0, o.mm);
      const line = `${label}: the ${o.which}'s foot hangs ${o.mm} mm off the rail's ${o.side} (rail ${(ev.rail[0] * 1000).toFixed(1)} .. ${(ev.rail[1] * 1000).toFixed(1)} mm)`;
      if (o.mm <= WARN_MM) warnings.push(line);
      else if (w && o.mm <= w.maxMm) warnings.push(line + ` [waived to ${w.maxMm} mm: ${w.why}]`);
      else errors.push(line + (w ? ` [over its waiver, ${w.maxMm} mm]` : ''));
    }
  }
  for (const [id, w] of Object.entries(waivers)) if (!id.startsWith('_') && w.maxMm != null && results.some((r) => r.id === id) && (worst[id] || 0) <= WARN_MM) warnings.push(`${id}: its waiver is no longer needed (worst overhang ${worst[id] || 0} mm): remove it from tools/magnifier_rail_waivers.json`);
  const uniq = (a) => [...new Set(a)]; // (the same overhang from the default and the loaded build: once)
  return { errors: uniq(errors), warnings: uniq(warnings), worst, noRail };
}

// ---- the command line
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { loadGame } = await import('./model_env.mjs'), { loadedBuild, buildKey, defOf } = await import('./model_sweep.mjs');
  const t0 = Date.now(), args = process.argv.slice(2), verbose = args.includes('--verbose'), G = loadGame(), GS = G.Gunsmith;
  const ids = args.filter((a) => !a.startsWith('--')), plats = ids.length ? ids : Object.keys(GS.PLATFORMS);
  const waivers = JSON.parse(fs.readFileSync(WAIVERS_FILE, 'utf8')), results = [];
  let n = 0;
  for (const id of plats) for (const { build, sight, magnifier } of magnifierBuilds(GS, id, loadedBuild, buildKey)) {
    const ev = evaluate(G.GunRecipes.feet(defOf(G, id, build)).feet); n++;
    results.push({ id, sight, magnifier, ev });
    if (verbose) console.log(id, sight, magnifier, ev.rail && ev.rail.map((v) => (v * 1000).toFixed(1)).join('..'), 'sight', (ev.sight.f0 * 1000).toFixed(1), (ev.sight.f1 * 1000).toFixed(1), 'magnifier', (ev.magnifier.f0 * 1000).toFixed(1), (ev.magnifier.f1 * 1000).toFixed(1), JSON.stringify(ev.over), ev.problem || '');
  }
  const { errors, warnings, worst, noRail } = judge(results, waivers), guns = new Set(results.map((r) => r.id));
  if (noRail.size) console.log(`unchecked (the recipe builds no rail under the sight: it sits on the receiver or a mount of its own): ${[...noRail.keys()].join(', ')}`);
  // (a waived gun's overhangs one line each only with --verbose: otherwise its count and worst)
  const waived = warnings.filter((l) => l.includes('[waived to'));
  for (const l of verbose ? warnings : warnings.filter((l) => !l.includes('[waived to'))) console.log('warning ' + l);
  if (!verbose && waived.length) console.log(`warning ${waived.length} waived overhangs (--verbose lists them): ${Object.keys(waivers).filter((g) => !g.startsWith('_') && worst[g]).map((g) => `${g} up to ${worst[g]} mm`).join(', ')}`);
  for (const l of errors) console.log('ERROR ' + l);
  const off = Object.entries(worst).sort((a, b) => b[1] - a[1]);
  console.log(`magnifier rails: ${n} builds on ${guns.size} guns (a reflex sight and a magnifier on each), ${off.length} guns with a foot off the rail, ${noRail.size} unchecked${off.length ? ' (worst: ' + off.map(([g, mm]) => `${g} ${mm} mm`).join(', ') + ')' : ''}: ${errors.length} errors, ${warnings.length} warnings (${((Date.now() - t0) / 1000).toFixed(1)} s)`);
  process.exit(errors.length ? 1 : 0);
}
