// The space battle's step profiled in Node (docs/space-server.md, WebAssembly candidates): one of tools/space_sim.mjs's scenarios run
// on this thread (not a worker: node's own profiler sees it), longer than its golden, then the profile summed up by file and function.
//   node --cpu-prof --cpu-prof-dir=<dir> tools/space_profile.mjs pd [secs]     then     node tools/space_profile.mjs --sum <dir>/<file>.cpuprofile
import fs from 'node:fs';
const argv = process.argv.slice(2);
if (argv[0] === '--sum') {
  const p = JSON.parse(fs.readFileSync(argv[1], 'utf8')), byId = new Map(p.nodes.map((n) => [n.id, n])), self = new Map(); let total = 0, idle = 0;
  for (let i = 0; i < p.samples.length; i++) { const n = byId.get(p.samples[i]), dt = p.timeDeltas[i] || 0; total += dt; const cf = n.callFrame; if (cf.functionName === '(idle)') { idle += dt; continue; } const f = (cf.url || '').split(/[\/]/).pop() || '(native)', k = (cf.functionName || '(anon)') + ' ' + f + ':' + (cf.lineNumber + 1); self.set(k, (self.get(k) || 0) + dt); }
  const busy = total - idle, byFile = new Map(); for (const [k, v] of self) { const f = k.split(' ')[1].split(':')[0]; byFile.set(f, (byFile.get(f) || 0) + v); }
  const pct = (v) => (v / busy * 100).toFixed(1) + '%';
  console.log(`sampled ${(total / 1e6).toFixed(2)} s, busy ${(busy / 1e6).toFixed(2)} s`);
  console.log('FILES ' + [...byFile].sort((a, b) => b[1] - a[1]).slice(0, 14).map(([k, v]) => k + ' ' + pct(v)).join(' | '));
  console.log('TOP\n' + [...self].sort((a, b) => b[1] - a[1]).slice(0, 30).map(([k, v]) => '  ' + pct(v).padStart(6) + ' ' + k).join('\n'));
  process.exit(0);
}
const { run, runServer, SCENARIOS } = await import('./space_sim.mjs');
const sc = { ...SCENARIOS.find((s) => s.name === (argv[0] || 'pd')) }; if (argv[1]) sc.secs = +argv[1];
const r = await (sc.server ? runServer : run)(sc, {});
console.log(`${sc.name}: ${r.steps} steps, ${r.simS.toFixed(0)} sim s in ${r.wall.toFixed(2)} s (${(r.simS / r.wall).toFixed(1)}x real time)`);
