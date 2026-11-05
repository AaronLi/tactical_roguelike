// Golden fingerprints of the AUTHORED guns' builds (models/<id>/model.json): the single-swap sweep plus edge cases (default, loaded, bare, shortest and
// longest barrel). Each build is built by the generic seating on the model's anchors (tools/models/recipes.ts rcv 'authored') and fingerprinted by its
// geometry (0.01 mm) and its info; a change to the model, the anchors, the seating or the shared parts that moves any build fails here.
//   node tools/check_authored_golden.mjs [id ...]            compares with tests/model-golden-<id>.json
//   node tools/check_authored_golden.mjs --update [id ...]   rewrites it (review the diff: it is the change in what the gun looks like)
// (The general golden file and --update-golden flow of the other models tests, tests/model-golden.json, covers the recipe guns; this one is the authored guns'.)
import fs from 'fs'; import path from 'path'; import crypto from 'crypto';
import { ROOT, loadGame } from './model_env.mjs';
import { sweepOf, loadedBuild, defOf, meshesOf, buildKey } from './model_sweep.mjs';
import { authoredIds } from './bake_authored.mjs';

const args = process.argv.slice(2), update = args.includes('--update'), ids = args.filter((a) => !a.startsWith('--')), G = loadGame(), GS = G.Gunsmith;
const sha = (s) => crypto.createHash('sha1').update(s).digest('hex').slice(0, 16);
const leaves = (v, p, out) => { if (v && v.isObject3D) return out; if (Array.isArray(v)) v.forEach((x, i) => leaves(x, p + '[' + i + ']', out)); else if (v && typeof v === 'object') for (const k of Object.keys(v).sort()) leaves(v[k], p + '.' + k, out); else out.push(p + '=' + (typeof v === 'number' ? Math.round(v * 1e5) / 1e5 : v)); return out; };

/** The builds an authored gun is held to: the sweep (default, loaded A/B, every single swap) and the edge cases, by label. */
export function buildsOf(id) {
  const out = new Map(), add = (label, b) => { GS.prune(id, b); const k = buildKey(b); if (!out.has(k)) out.set(k, { label, build: b }); };
  const def = GS.defaultBuild(id), sw = sweepOf(GS, id);
  add('default', { ...def }); add('loaded A', loadedBuild(GS, id, 'A')); add('loaded B', loadedBuild(GS, id, 'B'));
  { const b = {}; for (const s of GS.slotsOf(id, def)) if (s.req) b[s.slot] = def[s.slot]; add('bare (required slots only)', b); }
  const bs = GS.slotsOf(id, def).find((s) => s.slot === 'barrel');
  if (bs) { const bl = GS.compatible(bs.mount).filter((p) => GS.fitsSlot(bs, p, id)).sort((a, b) => (a.len || 0) - (b.len || 0)); add('shortest barrel ' + bl[0].id, { ...def, barrel: bl[0].id }); add('longest barrel ' + bl[bl.length - 1].id, { ...def, barrel: bl[bl.length - 1].id }); }
  for (const e of sw.list) add(e.slot ? `${e.slot}=${e.part || '(none)'}` + (e.base ? ' from loaded ' + 'AB'[e.base - 1] : '') : 'base ' + e.base, e.build);
  return [...out.values()];
}
export function fingerprint(id, build) {
  const { group, info } = G.GunRecipes.display(defOf(G, id, build));
  const h = crypto.createHash('sha1');
  for (const m of meshesOf(group, info)) { h.update(m.tag + '|' + m.node + '|' + m.mat + '|'); h.update(Array.from(m.v, (x) => Math.round(x * 1e5)).join(',')); }
  return { geometry: h.digest('hex').slice(0, 16), info: sha(leaves(info, '', []).join(';')) };
}

let bad = 0;
for (const id of ids.length ? ids : authoredIds()) {
  const file = path.join(ROOT, 'tests', `model-golden-${id}.json`), now = {};
  for (const { label, build } of buildsOf(id)) { const f = fingerprint(id, build); now[buildKey(build)] = { label, ...f }; }
  if (update) { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, JSON.stringify({ gun: id, note: 'node tools/check_authored_golden.mjs --update ' + id, builds: now }, null, 1) + '\n'); console.log(`wrote tests/model-golden-${id}.json: ${Object.keys(now).length} builds`); continue; }
  if (!fs.existsSync(file)) { console.error(`tests/model-golden-${id}.json is missing: run node tools/check_authored_golden.mjs --update ${id}`); bad++; continue; }
  const gold = JSON.parse(fs.readFileSync(file, 'utf8')).builds; let diff = 0;
  for (const [k, v] of Object.entries(now)) { const g = gold[k]; if (!g) { console.error(`${id}: build not in the golden file: ${v.label} (${k})`); diff++; } else if (g.geometry !== v.geometry || g.info !== v.info) { console.error(`${id}: ${v.label} changed (${g.geometry !== v.geometry ? 'geometry' : ''}${g.geometry !== v.geometry && g.info !== v.info ? ' and ' : ''}${g.info !== v.info ? 'info' : ''}) ${k}`); diff++; } }
  for (const k of Object.keys(gold)) if (!now[k]) { console.error(`${id}: golden build no longer exists: ${gold[k].label} (${k})`); diff++; }
  console.log(diff ? `${id}: ${diff} build(s) differ from the golden file` : `${id}: ${Object.keys(now).length} builds match the golden fingerprints`); bad += diff;
}
process.exit(bad ? 1 : 0);
