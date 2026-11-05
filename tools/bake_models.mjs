// Bakes the game's procedural guns into glTF binaries (.glb), so the browser can load a model instead of building it.
//   npm run bake:models              (tsc, then this)         node tools/bake_models.mjs [id ...]   (just those guns)
//   node tools/bake_models.mjs --check                        lists the bakes that are stale against the current code
//   node tools/bake_models.mjs --guns | --parts [id ...]      only the whole default guns / only the per-part packs (default: both)
//   -j N | --jobs N (or MODEL_BAKE_JOBS=N)   worker threads (default min(cores - 1, 8); -j 1: one process). The output is byte-identical for any N.
//   --verbose (every platform detail line, gltf-transform log lines)   --no-props (skip the props bake that a full run ends with: tools/bake_props.mjs)
//
// WHAT IT DOES. Loads the compiled game (dist/js) in a vm with the node build of three r149, builds every platform's
// DEFAULT build with G.GunRecipes.display(G.Gunsmith.compile(id, defaultBuild(id))), exports it with three's GLTFExporter,
// then shrinks it with gltf-transform (dedup, weld, prune, quantize, meshopt: never join/flatten, the parts stay separate
// nodes). Output (all git-ignored, regenerate with the script):
//   assets/models/guns/<id>.glb     a whole default gun. Every mesh keeps userData.slot (-> glTF extras.slot) and is named
//                                   <slot>_<n>; each animated sub-group is its own named node `part_<animKey>`; materials
//                                   are named by their G.GunMaterials.M catalogue key (js/glb.ts puts the catalogue's material
//                                   back by name, which restores the shared cache and the stipple/chequer bump maps); the
//                                   root node (named <id>) has extras.info = the build's info with anim refs as node names.
//   assets/models/guns/index.json   { version, three, src, guns: { <id>: { file, code, hash, bytes, gz, meshes, tris } } }
//                                   code = the default build's code (the browser serves the bake only for a gun whose build
//                                   is that), hash = sha1 of the baked triangles (slot, material, positions), src = sha1 of the
//                                   sources the geometry comes from; `--check` rebuilds and compares hashes to find stale bakes.
// (The recipes are bake-time code: tools/models/*.ts, compiled by tsconfig.tools.json to dist/tools; tools/model_env.mjs loads them.)
//
// AUTHORED MODELS (made in Blender: models/<id>/<id>.glb + model.json { source: 'authored' }) are baked from that file, with no recipe of their own:
// tools/bake_authored.mjs checks the source against the contract and the platform's spec (a missing anchor or slot fails the bake here, naming it), reads it
// into G.Authored, and the generic seating of the other parts on its mount anchors (tools/models/recipes.ts rifle(), rcv 'authored') makes every build, so
// the whole gun, the packs and their checks treat it like any other. docs/models.md "Authored models".
//
// PER-PART PACKS (milestone 2; tools/bake_parts.mjs, model_packs.mjs, model_emit.mjs, docs/models.md): next to guns/,
//   assets/models/parts/<platform>/index.json            the platform index: which slots shape which (JOINT packs), the anchors (offsets
//                                                        parts give other slots), the info model, the pack list per slot
//   assets/models/parts/<platform>/<slot>/<file>.glb     one pack: one slot's meshes for a combination of parts, in the gun's frame
// guns/<id>.glb stays the fast path for default builds; js/glb.ts assemble(def) builds any build from the packs.
import fs from 'fs'; import path from 'path'; import os from 'os'; import crypto from 'crypto'; import { spawnSync } from 'child_process';
import { ROOT } from './model_env.mjs';
import * as THREE_NS from 'three';
import { bakeParts, staleParts, PARTS_DIR } from './bake_parts.mjs';
import { authoredIds, checkAuthored } from './bake_authored.mjs';
import { makeEnv, GUNS_DIR } from './bake_worker.mjs';
import { makePool } from './bake_pool.mjs';

const OUT = GUNS_DIR;
// ---- the command line: ids, --check, --guns, --parts, -j N / --jobs N, --verbose, --no-props
const argv = process.argv.slice(2), flags = new Set(), only = []; let jobsArg = null;
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a === '-j' || a === '--jobs') jobsArg = argv[++i];
  else if (/^-j\d+$/.test(a)) jobsArg = a.slice(2);
  else if (a.startsWith('--jobs=')) jobsArg = a.slice(7);
  else if (a.startsWith('-')) flags.add(a);
  else only.push(a);
}
const check = flags.has('--check'), verbose = flags.has('--verbose'), noProps = flags.has('--no-props');
const doGuns = !flags.has('--parts') || flags.has('--guns'), doParts = !flags.has('--guns') || flags.has('--parts');
const jobs = Math.max(1, Math.floor(+(jobsArg || process.env.MODEL_BAKE_JOBS || Math.min((os.availableParallelism ? os.availableParallelism() : os.cpus().length) - 1, 8))) || 1);

// ---- progress: [k/N] <what> <secs>s · elapsed · ETA (from the running mean)
const T0 = Date.now(), now = () => (Date.now() - T0) / 1000;
const fmt = (s) => (s >= 3600 ? `${Math.floor(s / 3600)}h${String(Math.floor(s / 60) % 60).padStart(2, '0')}m` : s >= 60 ? `${Math.floor(s / 60)}m${String(Math.round(s % 60)).padStart(2, '0')}s` : `${s.toFixed(1)}s`);
function progressOf(total, label) {
  const t0 = now(); let k = 0;
  return (what, secs, extra = '') => {
    k++; const el = now() - t0, eta = k < total ? (el / k) * (total - k) : 0;
    console.log(`[${String(k).padStart(String(total).length)}/${total}] ${label} ${what.padEnd(10)} ${secs.toFixed(1).padStart(5)}s${extra ? '  ' + extra : ''}  · ${fmt(el)} elapsed${k < total ? ` · ETA ${fmt(eta)}` : ''}`);
  };
}
const phases = []; let phaseT = now(), phaseName = null;
const phase = (name) => { const t = now(); if (phaseName) phases.push([phaseName, t - phaseT]); phaseName = name; phaseT = t; };

// ---- the environment (the game in a vm, the contract) and the pool of workers that run the jobs
const env = await makeEnv({ verbose }), { G, GS, Models, src } = env;
for (const id of authoredIds()) { // (the authored sources: the contract and the platform's spec first)
  const r = checkAuthored(Models, id, G); for (const w of r.warnings) console.warn(id + ': warning ' + w);
  if (r.errors.length) { console.error('authored source ' + id + ' is not valid:\n  ' + r.errors.join('\n  ')); process.exit(1); }
}
const platIds = Object.keys(GS.PLATFORMS || {}).filter((id) => G.WEAPONS[id]);
const ids2 = only.length ? only : platIds.length ? platIds : G.WEAPON_LIST.map((w) => w.id);
const pool = await makePool(jobs, { env, verbose });
fs.mkdirSync(OUT, { recursive: true });
console.log(`baking ${ids2.length} ${only.length ? 'platforms (' + ids2.join(' ') + ')' : 'platforms'} on ${jobs} ${jobs === 1 ? 'process' : 'worker threads'}${check ? ' (check)' : ''}`);

// ---- how long each platform took last time (slowest first keeps the workers busy to the end); kept outside the repo, per checkout
const timesFile = path.join(os.tmpdir(), 'rt-bake-times-' + crypto.createHash('sha1').update(ROOT).digest('hex').slice(0, 8) + '.json');
let times = {}; try { times = JSON.parse(fs.readFileSync(timesFile, 'utf8')); } catch (e) { /* none yet */ }
const cost = (id) => times[id] || ({ pistol: 60, revolver: 40, derringer: 10 }[(GS.PLATFORMS[id] || {}).arch] || 20);
const slowestFirst = (list) => list.map((id, i) => [id, i]).sort((a, b) => cost(b[0]) - cost(a[0]) || a[1] - b[1]).map((x) => x[0]);

const indexFile = OUT + 'index.json';
const old = fs.existsSync(indexFile) ? JSON.parse(fs.readFileSync(indexFile, 'utf8')) : { guns: {} };
const index = { version: 1, three: THREE_NS.REVISION, src, guns: only.length || check ? { ...old.guns } : {} };
let fails = 0, rawTotal = 0, gzTotal = 0, stale = 0;

// ---- phase 1: the whole default guns
if (doGuns) {
  phase('guns');
  const prog = progressOf(ids2.length, 'glb  '), res = new Map();
  await Promise.all(slowestFirst(ids2).map((id) => pool.submit({ type: 'gun', id, check }).then((r) => {
    res.set(id, r); prog(id, r.secs, r.entry ? `${String(r.entry.meshes).padStart(4)} meshes ${String(r.entry.tris).padStart(7)} tris ${String(r.entry.bytes).padStart(7)} B` : '');
    for (const w of r.warnings || []) console.warn(w);
  }, (e) => { fails++; console.error('FAIL', id, (e && e.stack) || e); })));
  for (const id of ids2) { // (in the order of the list, so the index is the same whichever worker finished first)
    const r = res.get(id); if (!r) continue;
    if (check) { const was = old.guns[id]; if (!was || was.hash !== r.hash) { stale++; console.log('STALE', id); } continue; }
    index.guns[id] = r.entry; rawTotal += r.entry.bytes; gzTotal += r.entry.gz;
  }
}
if (check) {
  let staleP = 0;
  if (doParts) { const sp = staleParts(ids2, src); staleP = sp.length; for (const id of sp) console.log('STALE parts', id); }
  console.log(stale || staleP ? `${stale} stale guns, ${staleP} stale part sets: run npm run bake:models` : 'all baked guns and packs are current');
  await pool.close(); process.exit(stale || staleP || fails ? 1 : 0);
}
if (doGuns) {
  const all = Object.values(index.guns);
  index.totals = { guns: all.length, bytes: all.reduce((a, g) => a + g.bytes, 0), gz: all.reduce((a, g) => a + g.gz, 0) };
  fs.writeFileSync(indexFile, JSON.stringify(index, null, 1));
  console.log(`baked ${all.length} guns (${fails} failed): ${index.totals.bytes} B, ${index.totals.gz} B gzipped (this run: ${rawTotal} / ${gzTotal})`);
}

// ---- phase 2: the per-part packs (platform analysis in the workers; sharing, then the files, then the indexes)
if (doParts) {
  console.log('\nper-part packs:');
  let prog = progressOf(ids2.length, 'packs'), wprog = null, lastW = -1;
  const r = await bakeParts(Models, pool, ids2, {
    order: slowestFirst(ids2), partial: only.length > 0, log: console.log, phase,
    onPlatform: (p) => {
      times[p.id] = p.secs;
      for (const l of p.logs.slice(0, -1)) console.log(l); // (a collapse that kept full keys, ...)
      prog(p.id, p.secs, `${p.builds} builds ${p.cover} cover ${p.rounds} rounds ${p.reps.length} shapes`);
      if (verbose) console.log(p.logs[p.logs.length - 1]);
    },
    onWrite: (total, k) => { // (about every tenth)
      if (!wprog) wprog = { t0: now(), total }; const step = Math.max(1, Math.ceil(total / 10));
      if (k === total || (k % step === 0 && k !== lastW)) { lastW = k; const el = now() - wprog.t0; console.log(`[${k}/${total}] pack files written · ${fmt(el)} elapsed${k < total && k ? ` · ETA ${fmt((el / k) * (total - k))}` : ''}`); }
    },
  });
  fails += r.fails;
  if (!r.fails) {
    const old2 = fs.existsSync(PARTS_DIR + 'index.json') ? JSON.parse(fs.readFileSync(PARTS_DIR + 'index.json', 'utf8')).platforms : {};
    const plats = { ...(only.length ? old2 : {}), ...r.summary };
    const vals = Object.values(plats), sum = (k) => vals.reduce((a, x) => a + (x[k] || 0), 0);
    const totals = { platforms: vals.length, packs: sum('entries'), files: sum('files'), bytes: sum('bytes'), gz: sum('gz'), sharedFiles: r.shared.files, sharedBytes: r.shared.bytes, sharedGz: r.shared.gz, index: sum('index'), indexGz: sum('indexGz'), builds: sum('builds'), coverBuilds: sum('coverBuilds') };
    fs.writeFileSync(PARTS_DIR + 'index.json', JSON.stringify({ version: 2, src, platforms: plats, totals }, null, 1));
    // what each platform's coverage was made of (the joint packs and info tables, with their combination counts): for docs/models.md and review
    fs.writeFileSync(PARTS_DIR + 'coverage.json', JSON.stringify(Object.fromEntries(r.states.map((st) => [st.id, { builds: st.builds, coverBuilds: st.cover, rounds: st.rounds, combinations: st.stats, joint: st.joint, info: st.infoDeps }])), null, 1));
    fs.writeFileSync(PARTS_DIR + 'couplings.json', JSON.stringify(r.couplings, null, 1)); // (slot pairs where one slot's part reshapes another's geometry: tools/model_policy.mjs)
    const gzAll = totals.gz + totals.sharedGz;
    console.log(`\nbaked packs for ${vals.length} platforms: ${totals.packs} index entries; ${totals.files} platform files (${totals.bytes} B, ${totals.gz} B gzipped) + ${totals.sharedFiles} shared files (${totals.sharedBytes} B, ${totals.sharedGz} B gzipped) = ${gzAll} B gzipped (+ indexes ${totals.index} B, ${totals.indexGz} gzipped); ${totals.builds} builds (of which ${totals.coverBuilds} made to cover every combination) assemble from them`);
    if (!only.length) { try { fs.writeFileSync(timesFile, JSON.stringify(times)); } catch (e) { /* the cache is a convenience */ } }
  }
}
await pool.close();

// ---- the props (the cartridges, the quarrel): a separate script, run last
if (!noProps && !fails) {
  phase('props');
  const r = spawnSync(process.execPath, [path.join(ROOT, 'tools/bake_props.mjs')], { stdio: ['ignore', verbose ? 'inherit' : 'ignore', 'inherit'] });
  if (r.status) { fails++; console.error('bake_props failed (exit ' + r.status + ')'); }
}
phase('done');
const row = (n, t) => `  ${n.padEnd(10)} ${fmt(t)}`;
const label = { guns: 'guns', platforms: 'platforms', sharing: 'sharing', writes: 'pack files', indexes: 'indexes', props: 'props' };
console.log(`\nbake ${fails ? 'FAILED' : 'done'} on ${jobs} ${jobs === 1 ? 'process' : 'workers'}:\n` + phases.map(([n, t]) => row(label[n] || n, t)).join('\n') + '\n' + row('total', now()));
process.exit(fails ? 1 : 0);
