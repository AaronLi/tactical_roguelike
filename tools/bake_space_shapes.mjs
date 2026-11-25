// The squad's ships' shapes for the space battle, as data (docs/space-server.md phase B): what js/space.ts ewStep and tubeKit and
// the turrets work out from her drawn model, worked out here once from the same model, into assets/models/ships/space.json.
// Her model is built as the page builds it: js/shipmodel.ts ShipModel.ship (the Blender model, assets/models/ships/<id>.glb, where
// there is one, else her recipe), GunAo.apply's splitting of her long edges included (js/gunao.ts SHIP: it changes her triangles,
// not her surface), in node on node's three. Per ship, per turret fit (her hardpoints each empty '-', a rail 'r', or any other gun
// 'g': all that changes what's drawn; key: one letter a hardpoint, js/space.ts would look up SpaceData.fitted(...)'s):
//   rcs   Radar.rcsOf's table, base64 of the 72 x 37 Float32s (little-endian; js/rcstris.ts rcsFromB64)
//   box   her box round what isn't a glow ([min x, y, z, max x, y, z], her frame), size (max(4, its depth / 2)), top, beam, bot (Radar.suite's)
//   tube  where tubeKit puts the torpedo tube [x, y, z]
// and per ship: turrets [{ base: [x, y, z] (hp_<i>'s node, or the recipe's), gunY (the gun on its base), muzzle: { g: [...], r: [...] } (the
// muzzle in the gun's frame, by kind) }].
//   node tools/bake_space_shapes.mjs           write assets/models/ships/space.json
//   node tools/bake_space_shapes.mjs --check   exit 1 if what's there isn't what this makes
// Run `npx tsc -p .` first.
import { runFile, moduleOf } from './vm_game.mjs'; // (first: it starts node again with what the ES modules need)
import fs from 'node:fs'; import path from 'node:path';
import { loadLevel, ROOT } from './level_env.mjs';
const DIST = path.join(ROOT, 'dist/js/'), OUT = path.join(ROOT, 'assets/models/ships/space.json');
const { GLTFLoader } = await import('three/examples/jsm/loaders/GLTFLoader.js');

export async function shipShapes() {
  const { G, ctx } = await loadLevel(); const T = ctx.THREE;
  Object.assign(ctx, { requestAnimationFrame: (f) => setTimeout(f, 0), requestIdleCallback: (f) => setTimeout(f, 0) });
  const loader = new GLTFLoader();
  const loadFile = (url) => { const f = path.join(ROOT, url); if (!fs.existsSync(f)) return Promise.reject(new Error('none')); const b = fs.readFileSync(f); return new Promise((res, rej) => loader.parse(b.buffer.slice(b.byteOffset, b.byteOffset + b.length), '', (g) => res(g.scene), rej)); };
  await runFile(ctx, DIST + 'radar.js');
  await runFile(ctx, DIST + 'gunao.js', { stubs: { './gunaowasm.js': { AoWasm: { ready: false, fail() {}, init() {} } } } });
  await runFile(ctx, DIST + 'shipmodel.js', { stubs: { './glb.js': { Models: { loadFile } } } });
  const ShipModel = moduleOf(ctx, DIST + 'shipmodel.js').ShipModel, Radar = moduleOf(ctx, DIST + 'radar.js').Radar, SD = G.SpaceData;
  ShipModel.boot(); for (let i = 0; i < 50 && Object.keys(SD.SHIPS).some((id) => fs.existsSync(path.join(ROOT, 'assets/models/ships', id + '.glb')) && !ShipModel.has(id)); i++) await new Promise((r) => setTimeout(r, 20));
  const glowy = (o) => { const m = Array.isArray(o.material) ? o.material[0] : o.material; return !!m && (m.transparent || m.isMeshBasicMaterial); };
  const b64 = (s) => Buffer.from(s.buffer, s.byteOffset, s.byteLength).toString('base64');
  const turretIds = Object.values(SD.EQUIP).filter((e) => e.slot === 'turret').map((e) => e.id), gunId = turretIds.find((q) => q !== 'rail') || null, railId = turretIds.includes('rail') ? 'rail' : null;
  const out = { version: 1, key: "a letter a hardpoint: '-' empty, 'r' a rail, 'g' any other gun", ships: {} };
  for (const d of Object.values(SD.SHIPS)) {
    const kinds = ['-', ...(gunId ? ['g'] : []), ...(railId ? ['r'] : [])], keys = [''];
    for (let i = 0; i < d.turrets; i++) { const nk = []; for (const k of keys) for (const c of kinds) nk.push(k + c); keys.splice(0, keys.length, ...nk); }
    const ship = { model: ShipModel.has(d.id) ? 'glb' : 'recipe', turrets: [], fits: {} };
    for (const key of keys) {
      const fit = [...key].map((c) => (c === 'g' ? gunId : c === 'r' ? railId : null)), fleet = { owned: [d.id], ship: d.id, fit: { [d.id]: fit } };
      const m = ShipModel.ship(d, fleet), g = m.group; g.updateMatrixWorld(true);
      // (js/space.ts ewStep's, as it is)
      const inv = g.matrixWorld.clone().invert(), box = new T.Box3(); g.traverse((o) => { if (o.isMesh && o.geometry && !glowy(o)) { o.geometry.computeBoundingBox(); box.union(o.geometry.boundingBox.clone().applyMatrix4(new T.Matrix4().multiplyMatrices(inv, o.matrixWorld))); } });
      const sz = box.getSize(new T.Vector3()), size = Math.max(4, sz.z / 2), rcs = Radar.rcsOf('bake:' + d.id + ':' + key, g, inv);
      let tris = 0; g.traverse((o) => { if (o.isMesh) tris += (o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count) / 3; });
      ship.fits[key] = { rcs: b64(rcs.s), max: rcs.max, mean: rcs.mean, tris, box: [box.min.x, box.min.y, box.min.z, box.max.x, box.max.y, box.max.z], size, top: box.max.y, beam: Math.max(box.max.x, -box.min.x), bot: box.min.y, tube: [0, box.min.y - 0.35, -size * 0.25] };
      if (!ship.turrets.length) ship.turrets = m.turrets.map((tu) => ({ base: tu.base.position.toArray(), gunY: 0.2, muzzle: { g: [0, 0.2, -1.6], r: [0, 0.2, -2.6] } }));
      // (and the muzzles as drawn, where there's a gun: the same as the table above says)
      m.turrets.forEach((tu, i) => { if (fit[i]) { const want = fit[i] === 'rail' ? [0, 0.2, -2.6] : [0, 0.2, -1.6], got = tu.muzzle.position.toArray(); if (got.some((v, k) => Math.abs(v - want[k]) > 1e-9) || Math.abs(tu.gun.position.y - 0.2) > 1e-9) throw new Error(`${d.id} ${key}: turret ${i}'s muzzle is at ${got}, not ${want}: js/shipmodel.ts changed`); } });
    }
    out.ships[d.id] = ship;
  }
  return out;
}

if (import.meta.url === `file:///${process.argv[1].replace(/\\/g, '/').replace(/^\//, '')}` || process.argv[1].endsWith('bake_space_shapes.mjs')) {
  const data = await shipShapes(), text = JSON.stringify(data) + '\n';
  if (process.argv.includes('--check')) {
    const had = fs.existsSync(OUT) ? fs.readFileSync(OUT, 'utf8') : null;
    if (had !== text) { console.error('assets/models/ships/space.json is not what the ships make now (node tools/bake_space_shapes.mjs)'); process.exit(1); }
    console.log('space.json OK'); process.exit(0);
  }
  fs.writeFileSync(OUT, text);
  console.log('space.json: ' + Object.entries(data.ships).map(([id, s]) => `${id} (${s.model}) ${Object.keys(s.fits).length} fits, ${Object.values(s.fits)[0].tris} triangles`).join(', ') + `, ${(text.length / 1024).toFixed(0)} KB`);
  process.exit(0);
}
