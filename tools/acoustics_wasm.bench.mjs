// How much faster the acoustic ray tracer is in WebAssembly than in JavaScript (wasm/acoustics, js/acoustics.ts tracer), on the levels the game makes:
// for each case, the same rooms and outdoor cells with the same seeds, each path timed over a whole trace (Ac.TR.RAYS rays, then finish), the doors shut
// and then all open, after a warm-up trace on each path (so the JIT and the module's scene are in). The module's scene is built per level, as the game
// builds it (its first trace there pays for it): reported apart. Prints each case's median ms per trace on each path and the speed-up, then the worst.
//   node tools/acoustics_wasm.bench.mjs [--reps N]     (after tsc and npm run build:wasm)
// The ratio here overstates the gain: the game runs in a vm context in node, where the JavaScript tracer is several times slower than on a page
// (2026-11-17: 17-22x here, 2.4-3.9x in Chrome on the same levels and seeds). Read it for which cases differ, and measure the page for the size.
import { moduleOf, runFile } from './vm_game.mjs'; // (first: it starts node again with what the ES modules need)
import { loadLevel, ROOT } from './level_env.mjs';
import fs from 'node:fs'; import path from 'node:path';

const argv = process.argv.slice(2), REPS = argv.includes('--reps') ? +argv[argv.indexOf('--reps') + 1] : 3, DIST = path.join(ROOT, 'dist/js/');
const env = await loadLevel(), G = env.G;
await runFile(env.ctx, DIST + 'acoustics.js');
const { Acoustics: Ac } = moduleOf(env.ctx, DIST + 'acoustics.js'), { AcWasm, makeRng } = moduleOf(env.ctx, DIST + 'acousticswasm.js');
if (!(await AcWasm.load(fs.readFileSync(path.join(ROOT, 'assets/wasm/acoustics.wasm'))))) { console.error('the module did not instantiate: ' + AcWasm.error); process.exit(1); }
const T = (name) => G.THEMES.findIndex((t) => t.name === name);
const cases = [
  ['Warehouse L4', 424242, 4, T('Warehouse'), false], ['Apartment L6 (multi-floor)', 7, 6, T('Apartment'), false], ['Suburbs L2 (outdoor)', 3, 2, T('Suburbs'), false],
  ['Suburbs L5 night (basement)', 11, 5, T('Suburbs'), true], ['Foundry L4 (catwalks)', 12, 4, T('Foundry'), false], ['Sandia Crest L6 (outdoor)', 31, 6, T('Sandia Crest'), false],
  ['Bunker L8', 2024, 8, T('Bunker'), false], ['Research Lab L9 night', 515, 9, T('Research Lab'), true], ['Festival L4 night', 99, 4, T('Festival'), true],
  ['Convenience Store L1', 21, 1, T('Convenience Store'), false],
].filter((c) => c[3] >= 0);
const spread = (a, n) => (a.length <= n ? a : Array.from({ length: n }, (_, i) => a[Math.floor((i * a.length) / n)]));
const med = (a) => { const s = [...a].sort((x, y) => x - y); return s[s.length >> 1]; };
const now = () => performance.now();
const traceJs = (map, f, p, zi, seed) => { const t = Ac.tracer(map, f, p.x, p.y, p.z, zi, { rng: makeRng(seed), js: true }); t.rays(Ac.TR.RAYS); return t.finish(); };
const traceWa = (map, f, p, zi, seed) => { const t = Ac.tracer(map, f, p.x, p.y, p.z, zi, { seed }); let done = false; for (let k = 0; !done && k < 10000; k++) done = t.rays(500); if (!t.wasm) throw new Error('fell back to JavaScript: ' + AcWasm.error); return t.finish(); };

const rows = [];
let ci = 0;
for (const [name, seed, level, th, night] of cases) {
  const map = G.Level.generate(seed, level, th, night), d = Ac.of(map), fms = map.floors || [map];
  const doors = fms.flatMap((fm) => fm.doors || []);
  const pts = [...spread(d.zones.filter((z) => !z.out && z.tiles > 3), 6), ...spread(d.zones.filter((z) => z.out), 3)].map((z) => {
    const s0 = Ac.startOf(map, z.id);
    return { z, p: z.out ? { x: (Math.floor(s0.x / 8) + 0.5) * 8, y: (fms[z.f].fy || 0) + 1.6, z: (Math.floor(s0.z / 8) + 0.5) * 8 } : s0 };
  });
  // the module's scene for this level: its first trace pays for building it
  const q0 = pts[0], t0 = now(); traceWa(map, q0.z.f, q0.p, q0.z.id, 1); const sceneMs = now() - t0;
  for (const state of ['shut', 'open']) {
    for (const dr of doors) { dr.open = state === 'open'; dr.fallen = false; dr.gone = false; }
    for (const { z, p } of pts) { traceJs(map, z.f, p, z.id, 7); traceWa(map, z.f, p, z.id, 7); } // (warm both)
    const js = [], wa = [];
    for (let r = 0; r < REPS; r++) for (const { z, p } of pts) {
      const s = (Math.imul(++ci, 0x9E3779B1) ^ 0x5bd1e995) >>> 0;
      let t = now(); traceJs(map, z.f, p, z.id, s); js.push(now() - t);
      t = now(); traceWa(map, z.f, p, z.id, s); wa.push(now() - t);
    }
    const nIn = pts.filter((q) => !q.z.out).length, nOut = pts.length - nIn;
    rows.push({ name: `${name}, doors ${state}`, n: `${nIn} rooms + ${nOut} out`, js: med(js), wa: med(wa), jsMax: Math.max(...js), waMax: Math.max(...wa), scene: state === 'shut' ? sceneMs : null });
  }
}
const f = (x, w = 7) => x.toFixed(1).padStart(w);
console.log('case'.padEnd(44) + 'points'.padEnd(18) + '   JS ms   wasm ms  speed-up   JS max  wasm max  scene ms');
for (const r of rows) console.log(r.name.padEnd(44) + r.n.padEnd(18) + f(r.js, 8) + f(r.wa, 10) + (r.js / r.wa).toFixed(2).padStart(9) + 'x' + f(r.jsMax, 9) + f(r.waMax, 10) + (r.scene == null ? '' : f(r.scene, 10)));
const sp = rows.map((r) => r.js / r.wa);
console.log(`speed-up: worst ${Math.min(...sp).toFixed(2)}x, median ${med(sp).toFixed(2)}x, best ${Math.max(...sp).toFixed(2)}x over ${rows.length} cases (median ms per whole trace, ${REPS} reps)`);
