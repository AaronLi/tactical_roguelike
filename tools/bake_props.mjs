// Bakes the props the first-person animation holds in the hand: the cartridges (the rounds a magazine check, a reload and a chamber check show) and the
// crossbow's bolt (the quarrel), as glTF binaries the game loads like the guns (js/gunmodels.ts). Run by `npm run bake:props` (and by `npm run bake:models`).
//   assets/models/props/round_<caliber>x<case>.glb   one cartridge: nodes `body`, `rim`, `bullet` (a straight-walled or bottlenecked case drawn from the
//                                                    gun's caliber and case length), or, for the .50 BMG, `case` and `bullet` drawn to the real profile
//   assets/models/props/round_shotshell.glb          a shotshell: `hull`, `base` (the game paints the hull in the load's colour)
//   assets/models/props/quarrel.glb                  the crossbow bolt, centred on its middle, nose to -z: `nock`, `shaft`, `vanes`, `head`
//   assets/models/props/index.json                   { version, rounds: { <gun id>: <key> }, keys: { <key>: { file, dims, shape? } }, quarrel: { file } }
//                                                    dims: what the game needs to know about the round (roundDims: head, case length, bullet length and diameter,
//                                                    shell, pistol), shape: the .50 BMG's real outline (oal, case and bullet profiles); both from tools/models/recipes.ts.
// The geometry is bake-time code (here and tools/models/recipes.ts quarrel()); the game reads the files, compressed like the packs (meshopt, int16 positions).
import fs from 'fs'; import path from 'path';
import * as T from 'three';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';
import { ROOT, loadGame } from './model_env.mjs';
import { makeIO, compression } from './model_emit.mjs';

globalThis.FileReader = class { // (GLTFExporter wants a browser's FileReader on a Blob)
  readAsArrayBuffer(b) { b.arrayBuffer().then((r) => { this.result = r; this.onloadend && this.onloadend(); }); }
  readAsDataURL(b) { b.arrayBuffer().then((r) => { this.result = 'data:' + b.type + ';base64,' + Buffer.from(r).toString('base64'); this.onloadend && this.onloadend(); }); }
};
const G = loadGame(), R = G.GunRecipes, OUT = path.join(ROOT, 'assets/models/props/'), io = await makeIO();
fs.mkdirSync(OUT, { recursive: true });

// a material named for the exporter: the catalogue's by key (the game puts its own back by name), else m_<hex>
const named = (m, name) => { const c = m.clone(); c.name = name || 'm_' + m.color.getHexString(); c.bumpMap = null; return c; };
const BRASS = () => named(G.GunMaterials.M.brass(), 'brass');
const STEEL = () => new T.MeshStandardMaterial({ color: 0x8a8f96, roughness: 0.55, metalness: 0.3 });
const COPPER = () => new T.MeshStandardMaterial({ color: 0xb4764a, roughness: 0.4, metalness: 0.6 });
const anon = (m) => named(m);

/** A cartridge from roundDims (js/vmanim.ts used to draw it): the case (its rim at the back), the bullet out of its mouth, centred on the hand's hold, nose to -z. */
function cartridge(rd) {
  const g = new T.Group();
  const ex = rd.pistol || rd.bd >= 0.01 ? rd.bd * 1.1 : rd.bl, oal = rd.cs + ex;
  const add = (name, geo, m, z) => { const c = new T.Mesh(geo, m); c.name = name; c.rotation.x = Math.PI / 2; c.position.z = z; g.add(c); };
  const body = rd.pistol ? rd.head / 2 : rd.head * 0.42, rim = rd.pistol ? body + 0.0007 : rd.head / 2; // (a straight case: its head is its body, a rim proud of it)
  add('body', new T.CylinderGeometry(body, body, rd.cs, 12), BRASS(), oal / 2 - rd.cs / 2);
  add('rim', new T.CylinderGeometry(rim, rim, 0.0015, 12), BRASS(), oal / 2 - 0.00075);
  add('bullet', new T.CylinderGeometry(rd.bd / 2, rd.bd * 0.22, ex, 10), anon(STEEL()), -oal / 2 + ex / 2);
  return g;
}
/** A cartridge to its real profile (roundShape): [radius, distance from the base] up the case and the bullet, centred on its middle. */
function realCartridge(rs) {
  const g = new T.Group();
  const turn = (name, pts, m) => { const geo = new T.LatheGeometry(pts.map(([r, y]) => new T.Vector2(r, y)), 20); geo.rotateX(-Math.PI / 2); geo.translate(0, 0, rs.oal / 2); const me = new T.Mesh(geo, m); me.name = name; g.add(me); };
  turn('case', rs.case, BRASS()); turn('bullet', rs.bullet, anon(COPPER()));
  return g;
}
/** A shotshell: the hull and its brass base (the game paints the hull for its load). */
function shotshell() {
  const g = new T.Group();
  const hull = new T.Mesh(new T.CylinderGeometry(0.0095, 0.0095, 0.06, 10), anon(new T.MeshStandardMaterial({ color: 0xa82a20, roughness: 0.6 }))); hull.name = 'hull'; hull.rotation.x = Math.PI / 2; g.add(hull);
  const base = new T.Mesh(new T.CylinderGeometry(0.0098, 0.0098, 0.014, 10), BRASS()); base.name = 'base'; base.rotation.x = Math.PI / 2; base.position.z = 0.024; g.add(base);
  return g;
}

const write = async (file, group) => {
  const sc = new T.Scene(); for (const c of [...group.children]) sc.add(c); // (a scene: its children are the file's top-level nodes, the props' parts)
  const raw = await new GLTFExporter().parseAsync(sc, { binary: true, onlyVisible: false });
  const doc = await io.readBinary(new Uint8Array(raw));
  await doc.transform(...compression()); // (compressed as the packs are, tools/model_emit.mjs: nothing welded or merged, the nodes as they were drawn)
  const buf = Buffer.from(await io.writeBinary(doc));
  fs.writeFileSync(OUT + file, buf);
  return buf.length;
};

const index = { version: 1, rounds: {}, keys: {}, quarrel: { file: 'quarrel.glb' } };
let bytes = 0; const written = new Set();
for (const id of Object.keys(G.GUN_SPECS)) {
  const def = { id }, dims = R.roundDims(def);
  if (!dims) continue;
  const spec = G.GUN_SPECS[id], shape = R.roundShape(def);
  const key = `${spec.caliber}x${spec.caseLength}${dims.shell ? 's' : ''}`;
  index.rounds[id] = key;
  if (index.keys[key]) continue;
  const file = dims.shell ? 'round_shotshell.glb' : `round_${key}.glb`;
  index.keys[key] = { file, dims, ...(shape ? { shape: { oal: shape.oal } } : {}) };
  if (!written.has(file)) { written.add(file); bytes += await write(file, dims.shell ? shotshell() : shape ? realCartridge(shape) : cartridge(dims)); } // (every shotshell is the one file)
}
{ // the quarrel: centred on its middle (the hand's hold)
  const q = R.quarrel(true).group;
  q.traverse((o) => { if (o.isMesh) { const m = o.material.clone(); m.name = 'm_' + m.color.getHexString(); o.material = m; } });
  const out = new T.Group();
  const names = ['nock', 'shaft', 'vanes', 'head'];
  q.children.forEach((c, i) => { c.name = names[i] || 'part' + i; out.add(c.clone()); });
  bytes += await write('quarrel.glb', out);
}
// the .50's real outline travels in the index whole (the profiles are the lathe's points: a few dozen numbers)
for (const id of Object.keys(index.rounds)) { const s = R.roundShape({ id }); if (s) index.keys[index.rounds[id]].shape = s; }
fs.writeFileSync(OUT + 'index.json', JSON.stringify(index));
// a prop no longer made (a caliber renamed or gone) goes: the bundle takes every file here (tools/bundle_models.mjs --check fails on an orphan)
for (const f of fs.readdirSync(OUT)) if (f.endsWith('.glb') && f !== 'quarrel.glb' && !written.has(f)) { fs.unlinkSync(OUT + f); console.log('props: removed ' + f + ' (no longer made)'); }
console.log(`props: ${Object.keys(index.keys).length} rounds for ${Object.keys(index.rounds).length} guns, the quarrel: ${bytes} B in ${fs.readdirSync(OUT).length - 1} files (${OUT})`);
