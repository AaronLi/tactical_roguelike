// The acoustic ray tracer in WebAssembly against the JavaScript one (js/acoustics.ts tracer(), wasm/acoustics, docs/wasm.md): levels are generated,
// and from the same points, with the same random numbers (mulberry32: makeRng in js/acousticswasm.ts, the module's own), both make a trace; the
// histograms, the early arrivals, wet and rt60 must agree to 1e-9 (relative). Rooms of indoor, outdoor and multi-floor levels, with the doors shut
// and then all opened (the module's scene is kept between the two; only the doors' state is sent again), and the module's rays sent in pieces
// as the game does. node tools/acoustics_wasm.test.mjs [--verbose]; npm run test:acoustics builds the module first (tools/build_wasm.mjs: needs Rust; without it the module must already be there)
import { moduleOf, runFile } from './vm_game.mjs'; // (first: it starts node again with what the ES modules need)
import { loadLevel, ROOT } from './level_env.mjs';
import fs from 'node:fs'; import path from 'node:path';

const verbose = process.argv.includes('--verbose'), TOL = 1e-9, DIST = path.join(ROOT, 'dist/js/');
const env = await loadLevel(), G = env.G;
await runFile(env.ctx, DIST + 'acoustics.js');
const { Acoustics: Ac } = moduleOf(env.ctx, DIST + 'acoustics.js'), { AcWasm, makeRng } = moduleOf(env.ctx, DIST + 'acousticswasm.js');
const bytes = fs.readFileSync(path.join(ROOT, 'assets/wasm/acoustics.wasm'));
if (!(await AcWasm.load(bytes))) { console.error('FAIL the module did not instantiate: ' + AcWasm.error); process.exit(1); }

const T = (name) => G.THEMES.findIndex((t) => t.name === name);
const cases = [
  ['Warehouse L4', 424242, 4, T('Warehouse'), false], ['Warehouse L2 night', 5, 2, T('Warehouse'), true], ['Apartment L6 (multi-floor)', 7, 6, T('Apartment'), false],
  ['Suburbs L2 (outdoor, houses)', 3, 2, T('Suburbs'), false], ['Suburbs L5 night (basement, upstairs)', 11, 5, T('Suburbs'), true], ['Foundry L4 (catwalks)', 12, 4, T('Foundry'), false],
  ['Sandia Crest L6 (outdoor)', 31, 6, T('Sandia Crest'), false], ['Bunker L8', 2024, 8, T('Bunker'), false], ['Research Lab L9 night', 515, 9, T('Research Lab'), true], ['Festival L4 night', 99, 4, T('Festival'), true],
];
const spread = (a, n) => (a.length <= n ? a : Array.from({ length: n }, (_, i) => a[Math.floor((i * a.length) / n)]));
const rel = (a, b) => { const m = Math.max(Math.abs(a), Math.abs(b)); return m < 1e-300 ? 0 : Math.abs(a - b) / m; };
let worst = { v: 0, what: '' }, nTrace = 0, nFail = 0, nIn = 0, nOut = 0, nFloors = 0, nEarly = 0, nDiffDoors = 0;
const note = (v, what) => { if (v > worst.v) worst = { v, what }; };

function run(map, label, f, p, zi, seed, step) {
  const raw = {}, js = Ac.tracer(map, f, p.x, p.y, p.z, zi, { rng: makeRng(seed), js: true, raw });
  js.rays(Ac.TR.RAYS); const a = js.finish(), A64 = raw.hist, AL64 = raw.histL;
  const rawW = {}, wa = Ac.tracer(map, f, p.x, p.y, p.z, zi, { seed, raw: rawW });
  let done = false; for (let k = 0; !done && k < 600; k++) done = wa.rays(step);
  const b = wa.finish(), B64 = rawW.hist, BL64 = rawW.histL;
  const bad = [];
  if (js.wasm) bad.push('the JavaScript tracer says it used WebAssembly');
  if (!wa.wasm) bad.push('the WebAssembly tracer fell back to JavaScript (' + AcWasm.error + ')');
  if (!done) bad.push('rays never reported done');
  let hd = 0; for (let i = 0; i < A64.length; i++) hd = Math.max(hd, rel(A64[i], B64[i]), rel(AL64[i], BL64[i]));
  let f32 = 0; for (let i = 0; i < a.hist.length; i++) f32 = Math.max(f32, rel(a.hist[i], b.hist[i]), rel(a.histL[i], b.histL[i]));
  if (a.early.length !== b.early.length) bad.push(`early count ${a.early.length} vs ${b.early.length}`);
  let ed = 0; for (let i = 0; i < Math.min(a.early.length, b.early.length); i++) ed = Math.max(ed, rel(a.early[i][0], b.early[i][0]), rel(a.early[i][1], b.early[i][1]));
  const wd = rel(a.wet, b.wet), rd = rel(a.rt60, b.rt60), rld = rel(a.rt60L, b.rt60L), md = rel(a.mfp, b.mfp);
  const mx = Math.max(hd, ed, wd, rd, rld, md); note(mx, label);
  if (hd > TOL) bad.push('hist ' + hd); if (ed > TOL) bad.push('early ' + ed); if (wd > TOL) bad.push('wet ' + wd); if (rd > TOL) bad.push('rt60 ' + rd); if (rld > TOL) bad.push('rt60L ' + rld); if (md > TOL) bad.push('mfp'); if (a.zone !== b.zone) bad.push('zone');
  if (f32 > 1e-6) bad.push('Float32 hist ' + f32);
  nTrace++; nEarly += a.early.length;
  if (bad.length) { nFail++; console.log(`FAIL ${label}: ${bad.join('; ')}`); }
  else if (verbose) console.log(`ok   ${label}: wet ${a.wet.toFixed(4)} rt60 ${a.rt60.toFixed(3)} early ${a.early.length} max rel diff ${mx.toExponential(1)}`);
  return a;
}

let ci = 0;
for (const [name, seed, level, th, night] of cases) {
  const map = G.Level.generate(seed, level, th, night), d = Ac.of(map), fms = map.floors || [map];
  if (fms.length > 1) nFloors++;
  const doors = fms.flatMap((fm) => fm.doors || []);
  for (const dr of doors) { dr.open = false; dr.fallen = false; dr.gone = false; }
  const ind = spread(d.zones.filter((z) => !z.out && z.tiles > 3), 8), out = spread(d.zones.filter((z) => z.out), 3);
  const closed = [];
  for (const state of ['shut', 'open']) {
    if (state === 'open') for (const dr of doors) dr.open = true;
    let k = 0;
    for (const z of [...ind, ...out]) {
      const s0 = Ac.startOf(map, z.id), p = z.out ? { x: (Math.floor(s0.x / 8) + 0.5) * 8, y: (fms[z.f].fy || 0) + 1.6, z: (Math.floor(s0.z / 8) + 0.5) * 8 } : s0;
      const seed2 = (Math.imul(++ci, 0x9E3779B1) ^ 0x5bd1e995) >>> 0, step = [500, 60, 37, 1][k % 4];
      const a = run(map, `${name} / ${z.out ? 'outdoor' : 'room'} zone ${z.id} (floor ${z.f}) doors ${state}`, z.f, p, z.id, seed2, step);
      z.out ? nOut++ : nIn++;
      if (state === 'shut') closed.push(a); else if (doors.length && Math.abs(a.wet - closed[k].wet) > 1e-12) nDiffDoors++;
      k++;
    }
  }
  console.log(`${name}: ${ind.length} rooms, ${out.length} outdoor cells, ${fms.length} floor(s), ${doors.length} doors, both door states`);
}
// (the doors' state really is read at each call: with no doors open and then all open, some room's trace must differ)
if (nDiffDoors === 0) { nFail++; console.log('FAIL opening the doors changed no trace: the doors may not reach the module'); }
// (a module that's given up: the JavaScript tracer, from the start, still makes the trace)
AcWasm.fail('test'); { const map = G.Level.generate(424242, 2, T('Warehouse'), false), z = Ac.of(map).zones.find((q) => !q.out && q.tiles > 3), p = Ac.startOf(map, z.id), j = Ac.tracer(map, z.f, p.x, p.y, p.z, z.id); j.rays(500); const t = j.finish(); if (j.wasm || !(t.wet > 0)) { nFail++; console.log('FAIL the fallback did not make a trace'); } }
console.log(`${nTrace} traces (${nIn} rooms, ${nOut} outdoor cells, ${nFloors} multi-floor levels, ${nEarly} early arrivals), both paths from the same seeds; largest relative difference ${worst.v.toExponential(2)} (${worst.what || 'none'}), tolerance ${TOL}`);
if (nFail) { console.log(`${nFail} FAILED`); process.exit(1); }
console.log('acoustics wasm ok');
