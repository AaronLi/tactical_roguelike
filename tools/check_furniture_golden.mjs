// Golden fingerprints of the furniture as data (js/furnspec.ts; docs/furniture-data.md): for a set of levels (every theme, day and
// night, an apartment block with residents in it, the hangar), each level's furniture and rooms' dressing as described, and every
// kind of piece placed on them described on its own (with its solids), fingerprinted: how many groups, primitives, materials and
// textures, a hash of the whole (looks; solids apart), and one per kind of piece (so a change shows as the pieces it changed).
// A change to what a piece is made of, the plan, the looks' random stream or the format fails here. The Bevy port checks itself
// against the same file.
//   node tools/check_furniture_golden.mjs              compares with tests/furniture-golden.json
//   node tools/check_furniture_golden.mjs --update     rewrites it (review the diff: it's the change in what the levels look like)
//   node tools/check_furniture_golden.mjs --dump DIR   also writes each level's description (and the pieces') as JSON into DIR
// (Needs the compiled game: npm run test:models compiles it first.)
import fs from 'fs'; import vm from 'vm'; import path from 'path';
import * as THREE_NS from 'three';
import { ROOT, DIST } from './model_env.mjs';

const args = process.argv.slice(2), update = args.includes('--update'), dumpAt = args.includes('--dump') ? args[args.indexOf('--dump') + 1] : null;
const GOLDEN = path.join(ROOT, 'tests/furniture-golden.json');
// The simulation's side of the game (what js/serverworker.ts loads to generate a level, its description: js/leveldesc.ts, and js/furnspec.ts), on node's three
const FILES = ['util', 'data', 'callsigns', 'arsenal', 'parts', 'gear', 'medical', 'sim', 'materials', 'ballistics', 'level', 'leveldesc', 'world', 'furnspec', 'furniture', 'homes', 'residents', 'scars', 'damage', 'stickers'];
function loadLevelGame() {
  const ctx = { console, Math, JSON, Set, Map, WeakMap, Object, Array, Number, String, Boolean, Uint8Array, Uint8ClampedArray, Int8Array, Int16Array, Int32Array, Uint16Array, Uint32Array, Float32Array, Float64Array, Infinity, NaN, isFinite, parseInt, parseFloat, Error, Symbol, Date, Proxy, Reflect, TextEncoder, performance, location: { search: '' }, URLSearchParams, THREE: { ...THREE_NS } };
  ctx.window = ctx; ctx.self = ctx; ctx.G = { Hangar: { decorate() {} } }; // (the hangar's solids: js/hangar.ts, page-side; nothing it does is furniture)
  vm.createContext(ctx);
  for (const f of FILES) {
    const file = DIST + f + '.js';
    if (!fs.existsSync(file)) { console.error(`${path.relative(ROOT, file)} missing: run tsc first (npm run test:models does)`); process.exit(1); }
    vm.runInContext(fs.readFileSync(file, 'utf8'), ctx, { filename: f + '.js' });
  }
  return ctx.G;
}
const G = loadLevelGame(), FS = G.FurnSpec;
// The levels: every theme by day and by night (the theme's own place in the run: level th + 1), an apartment block where several
// homes have residents (js/homes.ts), and the hangar
const CASES = [];
G.THEMES.forEach((th, i) => { for (const night of [false, true]) CASES.push({ key: `${String(i).padStart(2, '0')}-${th.layout || th.name.toLowerCase().replace(/\s+/g, '-')}-${night ? 'night' : 'day'}`, seed: 9001 + i * 101, level: i + 1, th: i, night }); });
CASES.push({ key: 'apartment-residents', seed: 1, level: 1, th: 0, night: false });
CASES.push({ key: 'hangar', seed: 5150, level: 1, hub: true });

const out = { note: 'node tools/check_furniture_golden.mjs --update (docs/furniture-data.md)', version: FS.VERSION, levels: {}, pieces: {} };
const firstOf = new Map(); // (each kind of piece as first placed: its v and style, for the pieces' own fingerprints)
if (dumpAt) fs.mkdirSync(dumpAt, { recursive: true });
const t0 = Date.now();
for (const c of CASES) {
  const map = c.hub ? G.Level.generateHub(c.seed, c.level) : G.Level.generate(c.seed, c.level, c.th, c.night);
  // (a building of several floors is drawn floor by floor, js/level.ts buildStack: so it's described)
  (map.floors || [map]).forEach((m, i) => {
    const key = c.key + (map.floors ? '/floor-' + i : ''), d = FS.describe(m, { solids: true });
    out.levels[key] = Object.assign({ seed: c.seed, level: c.level, theme: c.hub ? 'hangar' : c.th, night: !!c.night }, map.floors ? { floor: i } : {}, FS.fingerprint(d));
    for (const g of d.groups) if (g.piece && !firstOf.has(g.piece)) firstOf.set(g.piece, { v: g.v, style: g.style });
    if (dumpAt) fs.writeFileSync(path.join(dumpAt, key.replace('/', '.') + '.json'), JSON.stringify(d));
  });
}
for (const name of [...firstOf.keys()].sort()) {
  const { v, style } = firstOf.get(name), d = FS.piece(name, v, style, 1);
  out.pieces[name] = Object.assign({ v, style }, FS.fingerprint(d));
  delete out.pieces[name].pieces;
  if (dumpAt) fs.writeFileSync(path.join(dumpAt, 'piece-' + name + '.json'), JSON.stringify(d));
}
const secs = ((Date.now() - t0) / 1000).toFixed(1);
if (update || !fs.existsSync(GOLDEN)) {
  fs.writeFileSync(GOLDEN, JSON.stringify(out, null, 1) + '\n');
  console.log(`furniture golden: wrote ${path.relative(ROOT, GOLDEN)} (${CASES.length} levels, ${firstOf.size} pieces, ${secs} s)`);
  process.exit(0);
}
// compare: what differs, level by level and piece by piece
const gold = JSON.parse(fs.readFileSync(GOLDEN, 'utf8')), bad = [];
const cmp = (where, a, b) => {
  if (!a) { bad.push(`${where}: not in the golden file`); return; }
  if (!b) { bad.push(`${where}: in the golden file, not described`); return; }
  for (const k of ['groups', 'prims', 'mats', 'tex', 'hash', 'solids']) if (JSON.stringify(a[k]) !== JSON.stringify(b[k])) bad.push(`${where}: ${k} ${JSON.stringify(a[k])} -> ${JSON.stringify(b[k])}`);
  if (a.pieces) for (const n of new Set([...Object.keys(a.pieces), ...Object.keys(b.pieces || {})])) if (JSON.stringify(a.pieces[n]) !== JSON.stringify((b.pieces || {})[n])) bad.push(`${where}: ${n} ${JSON.stringify(a.pieces[n])} -> ${JSON.stringify((b.pieces || {})[n])}`);
};
if (gold.version !== out.version) bad.push(`format version ${gold.version} -> ${out.version}`);
for (const k of new Set([...Object.keys(gold.levels), ...Object.keys(out.levels)])) cmp('level ' + k, gold.levels[k], out.levels[k]);
for (const k of new Set([...Object.keys(gold.pieces), ...Object.keys(out.pieces)])) cmp('piece ' + k, gold.pieces[k], out.pieces[k]);
if (bad.length) {
  console.error(`furniture golden: ${bad.length} differences from ${path.relative(ROOT, GOLDEN)}:`);
  for (const s of bad.slice(0, 60)) console.error('  ' + s);
  if (bad.length > 60) console.error(`  ... and ${bad.length - 60} more`);
  console.error('(if the change is meant: node tools/check_furniture_golden.mjs --update, and review the diff)');
  process.exit(1);
}
console.log(`furniture golden: ${CASES.length} levels and ${firstOf.size} pieces as in ${path.relative(ROOT, GOLDEN)} (${secs} s)`);
