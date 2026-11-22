// The shape providers (js/hullshape.ts, js/rcstris.ts, js/asteroidshape.ts: docs/space-server.md phase B) in node, against the
// mesh code they stand in for, run in node too: js/shipmodel.ts hull / traffic / asteroid (its real meshes, on node's three), and
// js/radar.ts rcsOf on them; fitMounts, radarKit and hullClear as js/space.ts has them (copied below: space.ts doesn't load in
// node), on those meshes. Then the shape fingerprints (tools/space_steps/shapes_fp.mjs) that tools/space_steps/shapes_check.mjs
// prints from the page, for the same maps, to be compared line for line.
//   node tools/shapes_node_check.mjs                       the built-in cases
//   node tools/shapes_node_check.mjs --map 3,1,1000,0,small,artifact,kestrel,,0   one map: seed,level,th,night,size,obj,ship,other,wing
//   node tools/shapes_node_check.mjs --traffic freighter,506952114                one stand-in: kind,seed
//                                                          (shapes_check.mjs prints this for the page's map)
// Exit 1 if a shape differs from its mesh. Run `npx tsc -p .` first.
import { runFile, moduleOf } from './vm_game.mjs'; // (first: it starts node again with what the ES modules need)
import path from 'node:path';
import { loadLevel, ROOT } from './level_env.mjs';
import { shapeFp, trafficFp } from './space_steps/shapes_fp.mjs';
const DIST = path.join(ROOT, 'dist/js/');
const { G, ctx } = await loadLevel();
const T = ctx.THREE;
await runFile(ctx, DIST + 'radar.js');
await runFile(ctx, DIST + 'shipmodel.js', { stubs: { './glb.js': { Models: { loadFile: () => Promise.reject(new Error('none')) } }, './gunao.js': { GunAo: { apply() {}, SHIP: {} } } } });
for (const f of ['hullshape', 'rcstris', 'asteroidshape']) await runFile(ctx, DIST + f + '.js');
const ShipModel = moduleOf(ctx, DIST + 'shipmodel.js').ShipModel, Radar = moduleOf(ctx, DIST + 'radar.js').Radar;
const HS = moduleOf(ctx, DIST + 'hullshape.js'), RT = moduleOf(ctx, DIST + 'rcstris.js'), AS = moduleOf(ctx, DIST + 'asteroidshape.js');
const SD = G.SpaceData, X = { HullShape: HS.HullShape, TrafficShape: HS.TrafficShape, rcs: RT, ShipGen: G.ShipGen, SpaceData: SD };
const argv = process.argv.slice(2);
let bad = 0; const fail = (m) => { bad++; console.log('  DIFF ' + m); };

// ---- the mesh side, as js/space.ts does it
const glowy = (o) => { const m = Array.isArray(o.material) ? o.material[0] : o.material; return !!m && (m.transparent || m.isMeshBasicMaterial); };
function meshBox(g) { // (ewStep's box)
  g.updateMatrixWorld(true); const inv = g.matrixWorld.clone().invert(), box = new T.Box3();
  g.traverse((o) => { if (o.isMesh && o.geometry && !glowy(o)) { o.geometry.computeBoundingBox(); box.union(o.geometry.boundingBox.clone().applyMatrix4(new T.Matrix4().multiplyMatrices(inv, o.matrixWorld))); } });
  return box;
}
function fitMounts(su, h, g) { // (js/space.ts fitMounts, as it is)
  const skip = new Set(); for (const gn of h.guns) gn.obj.traverse((o) => skip.add(o));
  const solid = []; g.traverse((o) => { if (o.isMesh && !glowy(o) && !skip.has(o)) solid.push(o); });
  const rc = new T.Raycaster(), hitAt = (from, dir) => { rc.set(from, dir); rc.far = 400; const hs = rc.intersectObjects(solid, false); return hs.length ? hs[0].point : null; };
  for (const gn of h.guns) {
    if (gn.k === 'missile') continue;
    const p = hitAt(new T.Vector3(gn.x, gn.inv ? -200 : 200, gn.z), new T.Vector3(0, gn.inv ? 1 : -1, 0)); if (!p) continue;
    if (gn.inv) { if (p.y < gn.obj.position.y + 0.3) { gn.obj.position.y = p.y - 0.1; gn.y = gn.obj.position.y - 1.5; } }
    else if (p.y > gn.obj.position.y - 0.3) { gn.obj.position.y = p.y + 0.1; gn.y = gn.obj.position.y + 1.5; }
  }
  for (const sc of su.scans) {
    const n = sc.n.clone().applyQuaternion(su.Q), foot = sc.at.clone().addScaledVector(sc.n, -sc.mast).applyQuaternion(su.Q).add(su.P);
    const p = hitAt(foot.clone().addScaledVector(n, 200), n.clone().negate()); if (!p) continue;
    sc.at.copy(p.addScaledVector(n, sc.mast).sub(su.P).applyQuaternion(su.Q.clone().invert()));
  }
  for (const tr of su.trks) {
    const out = new T.Vector3(tr.side, 0, 0).applyQuaternion(su.Q), w = tr.at.clone().applyQuaternion(su.Q).add(su.P), p = hitAt(w.clone().addScaledVector(out, 3), out.clone().negate());
    if (p) tr.at.copy(p.addScaledVector(out, 0.2).sub(su.P).applyQuaternion(su.Q.clone().invert()));
  }
}
const _mz = new T.Vector3(0, 0, -1);
function radarKit(su, g) { // (js/space.ts radarKit, as it is)
  const M = ShipModel.M(0x6a7078, { metalness: 0.5 }), D = ShipModel.M(0x2a2e33, { metalness: 0.6 });
  const mount = (at) => { const o = new T.Group(); o.position.copy(at).applyQuaternion(su.Q).add(su.P); o.quaternion.copy(su.Q); g.add(o); return o; };
  for (const sc of su.scans) {
    const o = mount(sc.at), up = new T.Quaternion().setFromUnitVectors(new T.Vector3(0, 1, 0), sc.n), L = sc.mast, ms = new T.Group(); ms.quaternion.copy(up); ms.position.copy(sc.n).multiplyScalar(-L); o.add(ms);
    for (const [lx, lz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) { const leg = new T.Mesh(new T.CylinderGeometry(0.12, 0.16, L, 6), D); leg.position.set(lx * 0.55 * (1 - 0.0), L / 2, lz * 0.55); ms.add(leg); }
    for (let k = 1; k < 4; k++) { const ring = new T.Mesh(new T.BoxGeometry(1.3, 0.12, 1.3), D); ring.position.y = L * k / 4; ms.add(ring); }
    const plate = new T.Mesh(new T.CylinderGeometry(1.4, 1.6, 0.4, 12), D); plate.position.y = 0.1; ms.add(plate);
    const r = new T.Group(); o.add(r);
    const bar = new T.Mesh(sc.ax === 'y' ? new T.BoxGeometry(7, 1.0, 0.35) : sc.ax === 'x' ? new T.BoxGeometry(1.0, 7, 0.35) : new T.BoxGeometry(7, 0.35, 1.0), M); bar.position.copy(Radar.dirOf(sc.ax, 0, 0)).multiplyScalar(0.4); r.add(bar);
    r.add(new T.Mesh(new T.BoxGeometry(0.9, 0.9, 0.9), D));
  }
  for (const tr of su.trks) {
    const o = mount(tr.at), arm = new T.Mesh(new T.BoxGeometry(1.4, 0.7, 0.7), D); arm.position.x = tr.side * 0.5; o.add(arm); const plate = new T.Mesh(new T.BoxGeometry(0.4, 2.2, 2.2), D); plate.position.x = -tr.side * 0.1; o.add(plate);
    const d = new T.Group(); d.position.x = tr.side * 1.3; o.add(d);
    const dish = new T.Mesh(new T.CylinderGeometry(1.3, 0.35, 0.6, 16, 1, true), new T.MeshStandardMaterial({ color: 0x8a9098, metalness: 0.4, roughness: 0.5, side: T.DoubleSide })); dish.rotation.x = -Math.PI / 2; dish.position.z = -0.3; d.add(dish);
    const feed = new T.Mesh(new T.CylinderGeometry(0.06, 0.06, 1.4, 5), D); feed.rotation.x = Math.PI / 2; feed.position.z = -0.9; d.add(feed);
    d.quaternion.setFromUnitVectors(_mz, tr.b);
  }
}
function hullClear(g, s, def) { // (js/space.ts hullClear, as it is; her group's frame for the level's)
  g.updateMatrixWorld(true); const tris = [], inv = new T.Matrix4().copy(g.matrixWorld).invert();
  g.traverse((o) => {
    if (!o.isMesh || o.material.blending === T.AdditiveBlending) return;
    const M = new T.Matrix4().multiplyMatrices(inv, o.matrixWorld), gg = o.geometry, p = gg.attributes.position, ix = gg.index, n = ix ? ix.count : p.count;
    for (let i = 0; i + 2 < n; i += 3) { const v = [0, 1, 2].map((k) => new T.Vector3().fromBufferAttribute(p, ix ? ix.getX(i + k) : i + k).applyMatrix4(M)); if (v[0].equals(v[1]) && v[1].equals(v[2])) continue; tris.push({ v, b: new T.Box3().setFromPoints(v) }); }
  });
  if (!tris.length) return true;
  const inHole = (c) => { const out = (c.x - s.x) * s.nx + (c.z - s.z) * s.nz, al = s.nx ? c.z - s.z : c.x - s.x; return Math.abs(al) < 2.3 && out > -0.5 && out < 2.4 && c.y > -0.9 && c.y < 3.5; };
  const B = new T.Box3(), tri = new T.Triangle(), c = new T.Vector3();
  for (const bx of SD.worldBoxes(def, SD.berthAt(def, s))) {
    B.min.set(bx.b[0] + 0.02, bx.b[1] + 0.02, bx.b[2] + 0.02); B.max.set(bx.b[3] - 0.02, bx.b[4] - 0.02, bx.b[5] - 0.02);
    for (const q of tris) { if (!q.b.intersectsBox(B)) continue; c.copy(q.v[0]).add(q.v[1]).add(q.v[2]).multiplyScalar(1 / 3); if (inHole(c)) continue; tri.set(q.v[0], q.v[1], q.v[2]); if (B.intersectsTriangle(tri)) return false; }
  }
  return true;
}
// every mesh triangle of a group, in its frame, with the flags a shape gives it (by its material)
function meshTris(g) {
  g.updateMatrixWorld(true); const inv = g.matrixWorld.clone().invert(), out = [], v = new T.Vector3();
  g.traverse((o) => {
    if (!o.isMesh) return; const m = Array.isArray(o.material) ? o.material[0] : o.material, M = new T.Matrix4().multiplyMatrices(inv, o.matrixWorld);
    const fl = (m.isMeshBasicMaterial ? 1 : 0) | (m.transparent ? 2 : 0) | (m.blending === T.AdditiveBlending ? 4 : 0) | (m.side === T.DoubleSide ? 8 : 0);
    const p = o.geometry.attributes.position, ix = o.geometry.index, n = ix ? ix.count : p.count;
    for (let i = 0; i + 2 < n; i += 3) { const t = []; for (let k = 0; k < 3; k++) { v.fromBufferAttribute(p, ix ? ix.getX(i + k) : i + k).applyMatrix4(M); t.push(Math.fround(v.x), Math.fround(v.y), Math.fround(v.z)); } out.push({ t, fl }); }
  });
  return out;
}
// the two triangle lists as multisets (corners to 1e-4, in order, so a triangle wound the other way is another triangle), and the flags each has
function sameTris(name, mesh, sh) {
  const key = (t) => t.map((x) => (Math.round(x * 1e4) / 1e4 || 0).toFixed(4)).join(',');
  const A = new Map(); for (const q of mesh) { const k = key(q.t) + '|' + (q.fl & 15); A.set(k, (A.get(k) || 0) + 1); }
  let miss = 0, ex = 0, maxd = 0; const ex1 = [];
  for (let t = 0; t < sh.flags.length; t++) { const tt = Array.from(sh.tris.subarray(t * 9, t * 9 + 9), Math.fround), k = key(tt) + '|' + (sh.flags[t] & 15), c = A.get(k); if (c) A.set(k, c - 1); else { ex++; if (ex1.length < 3) ex1.push(k); } }
  for (const c of A.values()) miss += c;
  if (mesh.length !== sh.flags.length || miss || ex) fail(`${name}: ${mesh.length} mesh triangles, ${sh.flags.length} shape's; ${miss} of the mesh's not in the shape, ${ex} of the shape's not in the mesh (e.g. ${ex1.join(' ; ')})`);
  else console.log(`  ${name}: the same ${mesh.length} triangles (corners to 1e-4, winding and material class)`);
  void maxd;
}
const rcsDiff = (a, b) => { let m = 0, mr = 0; for (let i = 0; i < a.s.length; i++) { const d = Math.abs(a.s[i] - b.s[i]); m = Math.max(m, d); mr = Math.max(mr, d / Math.max(1e-9, Math.abs(a.s[i]))); } return { abs: m, rel: mr }; };
const boxStr = (b) => [b.min.x, b.min.y, b.min.z, b.max.x, b.max.y, b.max.z].map((v) => v.toFixed(5)).join(',');
const shBox = (b) => [...b.min, ...b.max].map((v) => v.toFixed(5)).join(',');

function checkMap(args) {
  const [seed, level, th, night, size, obj, ship, other, wing] = args;
  const map = G.Level.generate(seed, level, th, !!night, { size, obj, ship, other: other || null, wing: !!wing }), def = SD.SHIPS[ship] || SD.SHIPS.kestrel;
  console.log(`MAP ${[seed, level, th, night ? 1 : 0, size, obj, ship, other || '', wing ? 1 : 0].join(',')}: ${map.sp.size}${map.sp.wing ? ' wing' : ''}, theme ${map.theme.name}, ${map.W}x${map.H}`);
  const h = ShipModel.hull(map), g = h.group, sh = HS.HullShape.of(map);
  sameTris('hull', meshTris(g), sh);
  const mb = meshBox(g); if (boxStr(mb) !== shBox(sh.bbox)) fail(`bbox: mesh ${boxStr(mb)} shape ${shBox(sh.bbox)}`); else console.log('  bbox the same: ' + boxStr(mb));
  const gs = (a) => a.map((q) => [q.k, q.inv, q.x, q.y, q.z, q.hp, q.cool].join(':')).join(' ');
  if (gs(h.guns) !== gs(sh.guns)) fail(`guns: mesh ${gs(h.guns)}\n        shape ${gs(sh.guns)}`); else console.log(`  guns the same (${h.guns.length}: kind, under or over, x y z, hp, cooldown from the stream)`);
  // the bare table: rcsOf on her meshes as built, rcsOfTris on the shape
  g.updateMatrixWorld(true);
  const r0 = Radar.rcsOf('chk:' + Math.random(), g, g.matrixWorld.clone().invert()), s0 = RT.rcsOfTris(sh.exact, sh.flags), d0 = rcsDiff(r0, s0);
  console.log(`  rcs bare: max ${r0.max.toPrecision(7)} vs ${s0.max.toPrecision(7)}, worst abs ${d0.abs.toExponential(2)} rel ${d0.rel.toExponential(2)}`); if (d0.rel > 1e-4) fail('rcs bare rel ' + d0.rel);
  // ewStep's chain: the suite, fitMounts, radarKit, rcsOf (mesh) / hullRcs (shape)
  const hb = map.sp.hull, c = new T.Vector3((hb.x0 + hb.x1) / 2, (mb.min.y + mb.max.y) / 2, (hb.z0 + hb.z1) / 2), hh = mb.max.y - c.y;
  const su = Radar.suite('hull', (hb.x1 - hb.x0) / 2, hh + 0.6, (hb.z1 - hb.z0) / 2 + 0.8, mb.min.y - c.y - 0.6, 8); su.P.copy(c); su.Q.setFromAxisAngle(new T.Vector3(0, 1, 0), Math.PI / 2);
  fitMounts(su, h, g);
  const ch = RT.hullRcs(map, sh), v3 = (a, b) => a.distanceTo(b);
  let wm = 0; su.scans.forEach((s, i) => { wm = Math.max(wm, v3(s.at, ch.su.scans[i].at)); if (process.env.DBG && v3(s.at, ch.su.scans[i].at)) console.log('   scan', i, s.at.toArray(), ch.su.scans[i].at.toArray()); }); su.trks.forEach((s, i) => { wm = Math.max(wm, v3(s.at, ch.su.trks[i].at)); if (process.env.DBG && v3(s.at, ch.su.trks[i].at)) console.log('   trk', i, s.at.toArray(), ch.su.trks[i].at.toArray()); });
  let wg = 0; h.guns.forEach((q, i) => { wg = Math.max(wg, Math.abs(q.obj.position.y - ch.fit.guns[i].oy), Math.abs(q.y - ch.fit.guns[i].y)); });
  console.log(`  fitMounts: radar mounts within ${wm.toExponential(2)} m, guns within ${wg.toExponential(2)} m`); if (wm > 1e-4 || wg > 1e-4) fail('fitMounts');
  // hullClear before the kit (the guns fitted)
  const sites = G.ShipGen.sites(map), fitted = RT.withGuns(sh, ch.fit), PA = RT.hullClearPrep(fitted, sh.flags);
  const cm = sites.map((s) => (hullClear(g, s, def) ? '1' : '0')).join(''), cs = sites.map((s) => (RT.hullClearTris(PA, s, SD.worldBoxes(def, SD.berthAt(def, s))) ? '1' : '0')).join('');
  if (cm !== cs) fail(`hullClear (no kit): mesh ${cm} shape ${cs}`); else console.log(`  hullClear (guns fitted, no kit) the same for all ${sites.length} sites: ${cm}`);
  radarKit(su, g);
  sameTris('hull + guns fitted + radar kit', meshTris(g), { tris: ch.tris, flags: ch.flags });
  const r1 = Radar.rcsOf('chk:' + Math.random(), g, g.matrixWorld.clone().invert()), d1 = rcsDiff(r1, ch.rcs);
  console.log(`  rcs (ewStep's: guns fitted, kit on): max ${r1.max.toPrecision(7)} vs ${ch.rcs.max.toPrecision(7)}, mean ${r1.mean.toPrecision(7)} vs ${ch.rcs.mean.toPrecision(7)}, worst abs ${d1.abs.toExponential(2)} rel ${d1.rel.toExponential(2)}`); if (d1.rel > 1e-4) fail('rcs chain rel ' + d1.rel);
  const PB = RT.hullClearPrep(ch.tris, ch.flags), cm2 = sites.map((s) => (hullClear(g, s, def) ? '1' : '0')).join(''), cs2 = sites.map((s) => (RT.hullClearTris(PB, s, SD.worldBoxes(def, SD.berthAt(def, s))) ? '1' : '0')).join('');
  if (cm2 !== cs2) fail(`hullClear (kit on): mesh ${cm2} shape ${cs2}`); else console.log(`  hullClear (kit on) the same for all ${sites.length} sites: ${cm2}`);
  console.log('  FP ' + JSON.stringify(shapeFp(X, map, def)));
}
function checkTraffic(kind, seed) {
  const t = ShipModel.traffic(kind, seed), sh = HS.TrafficShape.of(kind, seed), g = t.group;
  console.log(`TRAFFIC ${kind} ${seed}: len ${t.len.toFixed(4)}`);
  if (t.len !== sh.len) fail(`len ${t.len} vs ${sh.len}`);
  sameTris(kind, meshTris(g), sh);
  const mb = meshBox(g); if (boxStr(mb) !== shBox(sh.bbox)) fail(`bbox: mesh ${boxStr(mb)} shape ${shBox(sh.bbox)}`);
  g.updateMatrixWorld(true); const all = new T.Box3().setFromObject(g); if (boxStr(all) !== shBox(sh.bboxAll)) fail(`setFromObject box: mesh ${boxStr(all)} shape ${shBox(sh.bboxAll)}`);
  const r0 = Radar.rcsOf('chk:' + Math.random(), g, g.matrixWorld.clone().invert()), s0 = RT.rcsOfTris(sh.exact, sh.flags), d0 = rcsDiff(r0, s0);
  console.log(`  boxes the same; rcs worst abs ${d0.abs.toExponential(2)} rel ${d0.rel.toExponential(2)}`); if (d0.rel > 1e-4) fail('traffic rcs rel ' + d0.rel);
  console.log('  FP ' + JSON.stringify(trafficFp(X, kind, seed)));
}
function checkAsteroid(Wm, Hm) {
  const a = ShipModel.asteroid(Wm, Hm, 7); let w = 0, n = 0;
  for (let x = -2000; x <= 2000 + Wm; x += 37.3) for (let z = -2000; z <= 2000 + Hm; z += 41.7) { w = Math.max(w, Math.abs(a.height(x, z) - AS.asteroidHeight(Wm, Hm, x, z))); n++; }
  console.log(`ASTEROID ${Wm}x${Hm}: ${n} points, worst ${w}`); if (w !== 0) fail('asteroid height');
}

const mi = argv.indexOf('--map');
const ti = argv.indexOf('--traffic');
if (ti >= 0) { const p = argv[ti + 1].split(','); checkTraffic(p[0], +p[1]); }
if (mi >= 0) { const p = argv[mi + 1].split(','); checkMap([+p[0], +p[1], +p[2], +p[3], p[4], p[5], p[6], p[7] || null, +p[8]]); }
else if (ti < 0) {
  const TH0 = 1000;
  for (const a of [[3, 1, TH0, 0, 'small', 'artifact', 'kestrel', null, 0], [7, 2, TH0 + 2, 0, 'medium', 'artifact', 'kestrel', null, 0], [11, 3, TH0 + 2, 0, 'large', 'hvt', 'atlas', null, 0], [5, 3, TH0 + 2, 0, 'capital', 'artifact', 'kestrel', null, 0],
    [4, 1, TH0, 0, 'transport', 'artifact', 'kestrel', null, 0], [9, 1, TH0 + 1, 0, 'transport', 'artifact', 'wraith', null, 0], [13, 2, TH0 + 3, 0, 'large', 'artifact', 'kestrel', null, 0], [21, 2, TH0, 0, 'medium', 'artifact', 'kestrel', null, 1], [17, 2, TH0, 0, 'small', 'artifact', 'kestrel', 'transport', 0]]) checkMap(a);
  for (const [k, s] of [['freighter', 101], ['cutter', 202], ['pirate', 303], ['navy', 404], ['wing', 505], ['freighter', 77777]]) checkTraffic(k, s);
  checkAsteroid(120, 160); checkAsteroid(64, 64);
}
console.log(bad ? `${bad} differences` : 'all shapes match their meshes');
process.exit(bad ? 1 : 0);
