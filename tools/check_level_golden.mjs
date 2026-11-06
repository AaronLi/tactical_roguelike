// The level golden: fingerprints of the level description (js/leveldesc.ts, docs/level-data.md) for a fixed set of
// (seed, level, theme, night) cases, every theme day and night, the multi-floor buildings, the festival, the Sandia Crest, the
// hangar's map, in tests/level-golden.json. What the Rust port checks its own generator against.
//   node tools/check_level_golden.mjs           check (exit 1 on a difference: which case, which parts)
//   node tools/check_level_golden.mjs --write   write the golden afresh (after a change to the levels that's meant)
// Each case is also checked for: no three.js used generating it, its description surviving JSON as it is, describing the
// map again (its world now the one built from the description: G.World.fromDesc) giving the same description, and its
// procedural surfaces (k 'proc') made from the description alone.
import fs from 'fs'; import path from 'path';
import { loadLevel, pure, ROOT } from './level_env.mjs';

const FILE = path.join(ROOT, 'tests/level-golden.json'), write = process.argv.includes('--write'), quiet = process.argv.includes('--quiet');
const env = loadLevel(), G = env.G, used = pure(env), D = G.LevelDesc;
const T = (name) => G.THEMES.findIndex((t) => t.name === name);
const cases = [];
for (let th = 0; th < G.THEMES.length; th++) for (const night of [false, true]) cases.push({ key: `${G.THEMES[th].name} ${night ? 'night' : 'day'}`, seed: 424242, level: 3, th, night });
cases.push({ key: 'Apartment (multi-floor, lofts) L6', seed: 7, level: 6, th: T('Apartment'), night: false });
cases.push({ key: 'Suburbs (basement, upstairs) L5 night', seed: 11, level: 5, th: T('Suburbs'), night: true });
cases.push({ key: 'Foundry (catwalks) L4', seed: 12, level: 4, th: T('Foundry'), night: false });
cases.push({ key: 'Festival seed 99 night', seed: 99, level: 4, th: T('Festival'), night: true });
cases.push({ key: 'Sandia Crest seed 31 L6', seed: 31, level: 6, th: T('Sandia Crest'), night: false });
cases.push({ key: 'Sandia Crest seed 31 L6 night', seed: 31, level: 6, th: T('Sandia Crest'), night: true });
// (a stronghold is a route node's: more suspects, no civilians, js/server.ts. The place is generated from the same four
// figures as any level's, so these are the levels strongholds are played on)
cases.push({ key: 'stronghold: Bunker L8', seed: 2024, level: 8, th: T('Bunker'), night: false });
cases.push({ key: 'stronghold: Research Lab L9 night', seed: 515, level: 9, th: T('Research Lab'), night: true });
cases.push({ key: 'stronghold: Warehouse L7', seed: 8080, level: 7, th: T('Warehouse'), night: false });
cases.push({ key: 'hangar', seed: 1, level: 1, hub: true });
cases.push({ key: 'hangar L5', seed: 99, level: 5, hub: true });

const old = fs.existsSync(FILE) ? JSON.parse(fs.readFileSync(FILE, 'utf8')) : { cases: {} };
const out = { note: 'Fingerprints of the level description (docs/level-data.md): node tools/check_level_golden.mjs [--write]. hash: FNV-1a of the canonical JSON (keys sorted, numbers to 1e-4) of each part; count: how many of what it lists.', cases: {} };
let bad = 0;
const t0 = performance.now();
for (const c of cases) {
  const ta = performance.now();
  let map;
  try { map = c.hub ? G.Level.generateHub(c.seed, c.level) : G.Level.generate(c.seed, c.level, c.th, c.night); }
  catch (e) { console.log(`FAIL ${c.key}: ${e.message}`); bad++; continue; }
  const d = map.desc, fp = D.fingerprint(d), problems = [];
  if (JSON.stringify(JSON.parse(JSON.stringify(d))) !== JSON.stringify(d)) problems.push("doesn't survive JSON");
  const again = D.describe(map);
  if (D.canon(again) !== D.canon(d)) problems.push('describing it again (its world built from the description) gives another description: ' + D.PARTS.filter((k) => D.fingerprint(again).parts[k] !== fp.parts[k]).join(', '));
  const proc = {};
  const walk = (ns) => { for (const n of ns) { if (n.g && n.g.k === 'proc') { const g = D.proc(JSON.parse(JSON.stringify(d)), n.g); proc[n.g.fn] = { hash: D.hash(D.canon(g)), verts: (g.pos || []).length / 3 }; } if (n.c) walk(n.c); } };
  walk(d.draw.root);
  const rec = { args: c.hub ? { hub: true, seed: c.seed, level: c.level } : { seed: c.seed, level: c.level, theme: G.THEMES[c.th].name, th: c.th, night: c.night }, hash: fp.hash, parts: fp.parts, count: fp.count, proc, bytes: JSON.stringify(d).length };
  out.cases[c.key] = rec;
  const was = old.cases[c.key];
  if (!write) {
    if (!was) problems.push('not in the golden');
    else {
      const diff = Object.keys(rec.parts).filter((k) => was.parts[k] !== rec.parts[k]);
      for (const [fn, q] of Object.entries(proc)) if (!was.proc || !was.proc[fn] || was.proc[fn].hash !== q.hash) diff.push('proc ' + fn);
      if (diff.length) problems.push('differs from the golden: ' + diff.join(', '));
    }
  }
  if (problems.length) { bad++; console.log(`FAIL ${c.key}: ${problems.join('; ')}`); }
  else if (!quiet) console.log(`ok   ${c.key.padEnd(38)} ${fp.hash} ${String(fp.count.solids).padStart(6)} solids ${String(fp.count.nodes).padStart(5)} nodes ${(rec.bytes / 1e6).toFixed(2)} MB ${Math.round(performance.now() - ta)} ms`);
}
if (used.size) { bad++; console.log('FAIL three.js was used generating a level: THREE.' + [...used].join(', THREE.')); }
if (write) { fs.writeFileSync(FILE, JSON.stringify(out, null, 1) + '\n'); console.log(`wrote ${path.relative(ROOT, FILE)}: ${cases.length} cases`); }
console.log(`level golden: ${cases.length - bad}/${cases.length} cases ok (${Math.round(performance.now() - t0)} ms)`);
process.exit(bad && !write ? 1 : 0);
