// Bakes the game's procedural guns into glTF binaries (.glb): every part's pieces, which the game assembles into any build (and, with --guns, whole default guns for the tools).
//   npm run bake:models              (tsc, then this)         node tools/bake_models.mjs [id ...]   (just those guns)
//   node tools/bake_models.mjs --check                        lists the bakes that are stale against the current code
//   node tools/bake_models.mjs --guns [--parts] [id ...]     also (or only) the whole default guns, assets/models/guns/ (for the tools: the game loads none; default: the pieces only)
//   -j N | --jobs N (or MODEL_BAKE_JOBS=N)   worker threads (default min(cores - 1, 8); -j 1: one process). The output is byte-identical for any N.
//   --verbose (every platform detail line, gltf-transform log lines)   --no-props (skip the props bake that a full run ends with: tools/bake_props.mjs)   --no-humans (skip the human bodies: tools/bake_humans.mjs)   --no-hangar (skip the hangar's scene: tools/bake_hangar.mjs, which needs a Chromium)   --no-bundle (skip the bundling that runs last: tools/bundle_models.mjs)
//
// WHAT IT DOES (--guns). Loads the compiled game (dist/js) in a vm with the node build of three r149, builds every platform's
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
// the whole gun, the pieces and their checks treat it like any other. docs/models.md "Authored models".
//
// PER-PART PIECES (tools/bake_parts.mjs, model_parts.mjs, model_emit.mjs, docs/models.md "Per-part bake"): next to guns/,
//   assets/models/parts/<platform>/index.json            the platform index: who draws each tag (its pieces, one per part), the offsets parts give
//                                                        the others, the few rules beyond the sum (variants, conditions, caps, stretches), the info rules
//   assets/models/parts/<platform>/<tag>/<file>.glb      one piece: one part's meshes of one tag (no combinations of parts)
// js/glb.ts assemble(def) builds any build from the pieces by those rules; guns/<id>.glb (the default build, whole) is for the tools only.
import fs from 'fs'; import path from 'path'; import os from 'os'; import crypto from 'crypto'; import { spawnSync } from 'child_process';
import { ROOT } from './model_env.mjs';
import * as THREE_NS from 'three';
import { bakeParts, staleParts, PARTS_DIR } from './bake_parts.mjs';
import { authoredIds, checkAuthored } from './bake_authored.mjs';
import { authoredPartKeys, checkAuthoredPart } from './authored_parts.mjs';
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
const doGuns = flags.has('--guns'), doParts = !flags.has('--guns') || flags.has('--parts'); // (the whole default guns only when asked: the game assembles every build from the pieces, the default one too)
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
for (const k of authoredPartKeys()) { // (the authored parts: sights etc. made in Blender, checked before anything is baked with them)
  const r = checkAuthoredPart(Models, k); for (const w of r.warnings) console.warn(k + ': warning ' + w);
  if (r.errors.length) { console.error('authored part ' + k + ' is not valid:\n  ' + r.errors.join('\n  ')); process.exit(1); }
}
const platIds = Object.keys(GS.PLATFORMS || {}).filter((id) => G.WEAPONS[id]);
const ids2 = only.length ? only : platIds.length ? platIds : G.WEAPON_LIST.map((w) => w.id);
const pool = await makePool(jobs, { env, verbose });
if (doGuns) fs.mkdirSync(OUT, { recursive: true }); else if (!only.length && !check && doParts) fs.rmSync(OUT, { recursive: true, force: true }); // (a whole bake without them leaves none behind)
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
      prog(p.id, p.secs, `${p.builds} builds (${p.sampled} sampled) ${p.pieces.length} pieces ${p.reps.length} shapes`);
      if (verbose) for (const l of p.logs) console.log(l);
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
    const totals = { platforms: vals.length, pieces: sum('pieces'), anchors: sum('anchors'), files: sum('files'), bytes: sum('bytes'), gz: sum('gz'), sharedFiles: r.shared.files, sharedBytes: r.shared.bytes, sharedGz: r.shared.gz, index: sum('index'), indexGz: sum('indexGz'), builds: sum('builds'), sampled: sum('sampled') };
    fs.writeFileSync(PARTS_DIR + 'index.json', JSON.stringify({ version: 3, src, platforms: plats, totals }, null, 1));
    // the rules each platform's pieces follow beyond the plain sum (variants, condition slots, caps, pairs, stretches, thresholds, info maxima): for docs/models.md and review
    fs.writeFileSync(PARTS_DIR + 'rules.json', JSON.stringify(Object.fromEntries(r.states.map((st) => [st.id, {
      tags: Object.fromEntries(Object.entries(st.ix.tags).filter(([, T]) => T.vary || T.cond || T.stretch || T.show || T.cap || T.pair).map(([t, T]) => [t, Object.fromEntries(['from', 'vary', 'cond', 'stretch', 'show', 'cap', 'pair'].filter((k) => T[k] !== undefined).map((k) => [k, T[k]]))])),
      info: Object.fromEntries(Object.entries(st.ix.info).filter(([, R]) => R.max || R.vary).map(([l, R]) => [l, { from: R.from, ...(R.vary ? { vary: R.vary } : {}), ...(R.max ? { max: R.max.by } : {}) }])),
    }]).filter(([, x]) => Object.keys(x.tags).length || Object.keys(x.info).length)), null, 1));
    const gzAll = totals.gz + totals.sharedGz;
    console.log(`\nbaked pieces for ${vals.length} platforms: ${totals.pieces} pieces, ${totals.anchors} offsets; ${totals.files} platform files (${totals.bytes} B, ${totals.gz} B gzipped) + ${totals.sharedFiles} shared files (${totals.sharedBytes} B, ${totals.sharedGz} B gzipped) = ${gzAll} B gzipped (+ indexes ${totals.index} B, ${totals.indexGz} gzipped); learnt from ${totals.builds} builds, ${totals.sampled} more sampled: every one assembles from them as the recipe builds it`);
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
// ---- the hangar's scene (its fixed parts, from the game's own code in a headless browser: tools/bake_hangar.mjs)
if (!flags.has('--no-hangar') && !fails && !only.length) {
  phase('hangar');
  const r = spawnSync(process.execPath, [path.join(ROOT, 'tools/bake_hangar.mjs')], { stdio: ['ignore', verbose ? 'inherit' : 'ignore', 'inherit'] });
  if (r.status) { fails++; console.error('bake_hangar failed (exit ' + r.status + ')'); }
}
// ---- the human bodies (kept in the repo as made in Blender: checked, and put in the tree. tools/bake_humans.mjs)
if (!flags.has('--no-humans') && !fails && !only.length) {
  phase('humans');
  const r = spawnSync(process.execPath, [path.join(ROOT, 'tools/bake_humans.mjs')], { stdio: ['ignore', verbose ? 'inherit' : 'ignore', 'inherit'] });
  if (r.status) { fails++; console.error('bake_humans failed (exit ' + r.status + ')'); }
}
// ---- the bundles the game loads (tools/bundle_models.mjs: reads the finished tree, deterministic), last
if (!flags.has('--no-bundle') && !fails) {
  phase('bundles');
  const r = spawnSync(process.execPath, [path.join(ROOT, 'tools/bundle_models.mjs')], { stdio: ['ignore', verbose ? 'inherit' : 'ignore', 'inherit'] });
  if (r.status) { fails++; console.error('bundle_models failed (exit ' + r.status + ')'); }
}
phase('done');
const row = (n, t) => `  ${n.padEnd(10)} ${fmt(t)}`;
const label = { guns: 'guns', platforms: 'platforms', sharing: 'sharing', writes: 'pack files', indexes: 'indexes', props: 'props', hangar: 'hangar', humans: 'humans', bundles: 'bundles' };
console.log(`\nbake ${fails ? 'FAILED' : 'done'} on ${jobs} ${jobs === 1 ? 'process' : 'workers'}:\n` + phases.map(([n, t]) => row(label[n] || n, t)).join('\n') + '\n' + row('total', now()));
process.exit(fails ? 1 : 0);
