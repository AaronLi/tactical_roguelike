// The shape providers (js/hullshape.ts, js/rcstris.ts; assets/models/ships/space.json from tools/bake_space_shapes.mjs) against
// what the live page works out from its meshes (docs/space-server.md phase B): the mission ship's triangles, box, guns, radar
// table (Radar.rcsOf on her drawing, as the page once made it), radar mounts (EW.foe), hull guns' fitted heights, hullClear at every
// site (Space.dbgClear); the zone's stand-ins (their meshes, rcsOf on each); the squad's ship (space.json, her box, the torpedo tube,
// the turrets). (The page keeps none of these tables now: the server's battle has them from the data, js/svbattle.ts.)
//   node tools/space_shot.mjs "mute&board=small&seed=3" tools/space_steps/shapes_check.mjs --port 8151
// Prints MATCH / DIFF lines, then the map's line for tools/shapes_node_check.mjs (--map ...) and the shape fingerprint (FP) it
// should print the same.
import { shapeFp, trafficFp } from './shapes_fp.mjs';
import { spawnSync } from 'node:child_process'; import path from 'node:path'; import { fileURLToPath } from 'node:url';
export default async ({ ev, sleep, log }) => {
  for (let i = 0; i < 40 && !(await ev('!!(G.Space.ew().foeT && G.Space.S.hull)')); i++) await sleep(500);
  await sleep(1500);
  const pre = `
    const H = await import('/dist/js/hullshape.js'), RT = await import('/dist/js/rcstris.js'), Sp = G.Space, S = Sp.S, EW = Sp.ew(), SD = G.SpaceData, T = THREE, L = [];
    const shapeFp = ${shapeFp.toString()}, trafficFp = ${trafficFp.toString()};
    const X = { HullShape: H.HullShape, TrafficShape: H.TrafficShape, rcs: RT, ShipGen: G.ShipGen, SpaceData: SD };
    const glowy = (o) => { const m = Array.isArray(o.material) ? o.material[0] : o.material; return !!m && (m.transparent || m.isMeshBasicMaterial); };
    const say = (ok, m) => L.push((ok ? 'MATCH ' : 'DIFF  ') + m);
    function meshTris(g, skip) {
      g.updateMatrixWorld(true); const inv = g.matrixWorld.clone().invert(), out = [], v = new T.Vector3();
      g.traverse((o) => {
        if (!o.isMesh || (skip && skip(o))) return; const m = Array.isArray(o.material) ? o.material[0] : o.material, M = new T.Matrix4().multiplyMatrices(inv, o.matrixWorld);
        const fl = (m.isMeshBasicMaterial ? 1 : 0) | (m.transparent ? 2 : 0) | (m.blending === T.AdditiveBlending ? 4 : 0) | (m.side === T.DoubleSide ? 8 : 0);
        const p = o.geometry.attributes.position, ix = o.geometry.index, n = ix ? ix.count : p.count;
        for (let i = 0; i + 2 < n; i += 3) { const t = []; for (let k = 0; k < 3; k++) { v.fromBufferAttribute(p, ix ? ix.getX(i + k) : i + k).applyMatrix4(M); t.push(Math.fround(v.x), Math.fround(v.y), Math.fround(v.z)); } out.push({ t, fl }); }
      });
      return out;
    }
    function same(name, mesh, tris, flags) {
      const key = (t) => t.map((x) => (Math.round(x * 1e4) / 1e4 || 0).toFixed(4)).join(',');
      const A = new Map(); for (const q of mesh) { const k = key(q.t) + '|' + (q.fl & 15); A.set(k, (A.get(k) || 0) + 1); }
      let miss = 0, ex = 0;
      for (let t = 0; t < flags.length; t++) { const k = key(Array.from(tris.subarray(t * 9, t * 9 + 9), Math.fround)) + '|' + (flags[t] & 15), c = A.get(k); if (c) A.set(k, c - 1); else ex++; }
      for (const c of A.values()) miss += c;
      say(mesh.length === flags.length && !miss && !ex, name + ': ' + mesh.length + ' mesh triangles, ' + flags.length + " shape's" + (miss || ex ? '; ' + miss + " of the mesh's not in the shape, " + ex + " of the shape's not in the mesh" : ' (the same, corners to 1e-4, winding, material class)'));
    }
    const rdiff = (a, b) => { let m = 0, mr = 0; for (let i = 0; i < a.length; i++) { const d = Math.abs(a[i] - b[i]); m = Math.max(m, d); mr = Math.max(mr, d / Math.max(1e-9, Math.abs(a[i]))); } return { abs: m, rel: mr }; };
    const bx = (b) => [b.min.x, b.min.y, b.min.z, b.max.x, b.max.y, b.max.z].map((v) => v.toFixed(5)).join(','), sb = (b) => [...b.min, ...b.max].map((v) => v.toFixed(5)).join(',');
    const meshBox = (g, skip) => { g.updateMatrixWorld(true); const inv = g.matrixWorld.clone().invert(), box = new T.Box3(); g.traverse((o) => { if (o.isMesh && o.geometry && !glowy(o) && !(skip && skip(o))) { o.geometry.computeBoundingBox(); box.union(o.geometry.boundingBox.clone().applyMatrix4(new T.Matrix4().multiplyMatrices(inv, o.matrixWorld))); } }); return box; };
`;
  // (the mission ship first, as soon as her radars are made: her guns turn later, and her group with them)
  const A = await ev(`(async () => { ${pre}
    // ---- the mission ship
    const map = S.map, sh = H.HullShape.of(map), fresh = G.ShipModel.hull(map);
    L.push('MISSION ' + map.sp.size + (map.sp.wing ? ' wing' : '') + ', ' + map.theme.name + ', seed ' + map.seed);
    same('hull, as ShipModel.hull(map) builds it', meshTris(fresh.group), sh.tris, sh.flags);
    { const mb = meshBox(fresh.group); say(bx(mb) === sb(sh.bbox), 'her box (ewStep\\'s): mesh ' + bx(mb) + ' shape ' + sb(sh.bbox)); }
    const gs = (a) => a.map((q) => [q.k, !!q.inv, q.x, q.y, q.z, q.hp, q.cool].join(':')).join(' ');
    say(gs(fresh.guns) === gs(sh.guns), 'guns (' + sh.guns.length + '): kind, under/over, x y z, hp, cooldown: ' + gs(sh.guns).slice(0, 300));
    { fresh.group.updateMatrixWorld(true); const r0 = G.Radar.rcsOf('shapechk:' + Math.random(), fresh.group, fresh.group.matrixWorld.clone().invert()), s0 = RT.rcsOfTris(sh.exact, sh.flags), d = rdiff(r0.s, s0.s);
      say(d.rel < 1e-4, 'rcs, her meshes as built (no fit, no kit): worst abs ' + d.abs.toExponential(2) + ' rel ' + d.rel.toExponential(2) + ' (max ' + r0.max.toPrecision(8) + ' / ' + s0.max.toPrecision(8) + ')'); }
    const ch = RT.hullRcs(map, sh);
    { const su = EW.foe, ds = []; su.scans.forEach((s, i) => ds.push(s.at.distanceTo(ch.su.scans[i].at))); su.trks.forEach((s, i) => ds.push(s.at.distanceTo(ch.su.trks[i].at)));
      say(Math.max(...ds) < 1e-6, 'radar mounts (EW.foe scans, trackers) after fitMounts: ' + ds.map((v) => v.toExponential(1)).join(' ') + ' m off');
      say(Math.abs(su.size - ch.su.size) < 1e-9 && su.P.distanceTo(ch.su.P) < 1e-9 && Math.abs(su.Q.angleTo(ch.su.Q)) < 1e-9, 'suite: size ' + su.size + ' / ' + ch.su.size + ', P ' + su.P.toArray().map((v) => v.toFixed(5)) + ' / ' + ch.su.P.toArray().map((v) => v.toFixed(5)));
      const gd = S.hull.guns.map((q, i) => Math.max(Math.abs(q.obj.position.y - ch.fit.guns[i].oy), Math.abs(q.y - ch.fit.guns[i].y)));
      say(!gd.length || Math.max(...gd) < 1e-6, 'hull guns fitted (mount y, gun y): ' + (gd.map((v) => v.toExponential(1)).join(' ') || 'none') + ' m off'); }
    { const fx = EW.foeT.sz, c = EW.foeT.p; say(Math.abs(fx - ch.sz) < 1e-9 && c.distanceTo(ch.c) < 1e-9, 'EW.foeT sz ' + fx + ' / ' + ch.sz + ', p ' + c.toArray().map((v) => v.toFixed(5)) + ' / ' + ch.c.toArray().map((v) => v.toFixed(5))); }
    same("her group live (fitted guns, the radars' kit)", meshTris(S.hull.group), ch.tris, ch.flags);
    { const hg = S.hull.group; hg.updateMatrixWorld(true); const live = G.Radar.rcsOf('shapechk:' + Math.random(), hg, hg.matrixWorld.clone().invert()); EW.foeT.rcs = live; const d = rdiff(live.s, ch.rcs.s); say(d.rel < 1e-4, 'EW.foeT.rcs vs hullRcs: worst abs ' + d.abs.toExponential(2) + ' rel ' + d.rel.toExponential(2) + ', max ' + EW.foeT.rcs.max.toPrecision(8) + ' / ' + ch.rcs.max.toPrecision(8) + ', mean ' + EW.foeT.rcs.mean.toPrecision(8) + ' / ' + ch.rcs.mean.toPrecision(8)); }
    { const sites = G.ShipGen.sites(map), live = sites.map((s) => (Sp.dbgClear(s) ? '1' : '0')).join(''), fp = shapeFp(X, map, S.def);
      say(live === fp.clearKit || live === fp.clear, 'hullClear at ' + sites.length + ' sites: live ' + live + (live === fp.clearKit ? ' = the shape with the kit' : live === fp.clear ? ' = the shape without the kit' : ' / shape (kit) ' + fp.clearKit + ' / (no kit) ' + fp.clear));
      // (the map again, from the arguments a node run would take: so tools/shapes_node_check.mjs --map makes the same one)
      const Gm = G.Game, st = G.SpaceSv && G.SpaceSv.st, ms = st && st.M && st.M.ms, gen = ms ? G.SpaceSv.genOf(ms) : { size: map.sp.size, obj: 'artifact', ship: S.def.id, other: null, wing: !!map.sp.wing };
      const args = [map.seed, Gm.level, SD.themeIndex(map.theme), map.night ? 1 : 0, gen.size, gen.obj, gen.ship, gen.other || '', gen.wing ? 1 : 0];
      const m2 = G.Level.generate(args[0], args[1], args[2], !!args[3], { size: args[4], obj: args[5], ship: args[6], other: args[7] || null, wing: !!args[8] });
      const sameMap = m2.W === map.W && m2.H === map.H && m2.t.every((v, i) => v === map.t[i]) && m2.rooms.length === map.rooms.length;
      L.push((sameMap ? 'MAP ' : 'MAP? (regenerated map differs) ') + args.join(','));
      L.push('FP ' + JSON.stringify(fp)); }
    fresh.group.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
    return L.join('\\n');
  })()`, 180000);
  log(A);
  // (out of the jump: the zone's ships drawn)
  for (let i = 0; i < 120 && !(await ev('!G.Space.S.ftl && G.Space.S.traffic.length > 0')); i++) await sleep(500);
  await sleep(1000);
  const B = await ev(`(async () => { ${pre}
    // ---- the zone's stand-ins
    let nT = 0;
    for (const q of S.traffic) {
      if (q.real || !q.obj) continue; nT++;
      const ts = H.TrafficShape.of(q.c.kind, q.c.seed), o = q.obj;
      same('stand-in ' + q.c.kind + ' ' + q.c.seed, meshTris(o), ts.tris, ts.flags);
      o.updateMatrixWorld(true); const t = { rcs: G.Radar.rcsOf('shapechk:' + Math.random(), o, o.matrixWorld.clone().invert()), sz: Math.max(4, Math.max(...new T.Box3().setFromObject(o).getSize(new T.Vector3()).toArray()) / 2) }; // (her table from her drawing, as the page once made it)
      if (t) { const d = rdiff(t.rcs.s, RT.rcsOfTris(ts.exact, ts.flags).s), w = new T.Box3().setFromObject(o).getSize(new T.Vector3()), la = ts.bboxAll, ls = [la.max[0] - la.min[0], la.max[1] - la.min[1], la.max[2] - la.min[2]];
        say(d.rel < 1e-4, '  its table (rcsOf on her drawing): worst abs ' + d.abs.toExponential(2) + ' rel ' + d.rel.toExponential(2));
        if (d.rel >= 1e-4) { // (the same stand-in made now, in no frame but its own: rcsOf's toLocal times its matrix is the identity there, not a rotation and its inverse)
          const fr = G.ShipModel.traffic(q.c.kind, q.c.seed).group; fr.updateMatrixWorld(true); const d2 = rdiff(G.Radar.rcsOf('shapechk:' + Math.random(), fr, fr.matrixWorld.clone().invert()).s, RT.rcsOfTris(ts.exact, ts.flags).s);
          L.push('  NOTE the same stand-in made now, at the origin, unturned: rcsOf vs the shape worst rel ' + d2.rel.toExponential(2) + ' (the live one is read through her place in the zone, a rotation and its inverse: their rounding moves normals that lie on a bin edge)'); }
        L.push('  NOTE its sz ' + t.sz.toFixed(3) + ' is from Box3.setFromObject (the world\\'s axes: ' + w.toArray().map((v) => v.toFixed(2)) + '); the shape\\'s own box ' + ls.map((v) => v.toFixed(2)) + ' gives ' + Math.max(4, Math.max(...ls) / 2).toFixed(3)); }
      else L.push('  (not a radar target now)');
      const tb = meshBox(o); say(bx(tb) === sb(ts.bbox), '  its box (not glows): mesh ' + bx(tb) + ' shape ' + sb(ts.bbox));
      if (nT === 1) L.push('  TFP ' + JSON.stringify(trafficFp(X, q.c.kind, q.c.seed)));
    }
    if (!nT) L.push('(no stand-ins drawn)');
    // ---- the squad's ship: space.json against her drawing
    const js = await (await fetch('/assets/models/ships/space.json', { cache: 'no-cache' })).json(), sd = js.ships[S.def.id];
    const fit = (S.fleet.fit[S.def.id] || []).slice(0, S.def.turrets), key = Array.from({ length: S.def.turrets }, (_, i) => (fit[i] ? (fit[i] === 'rail' ? 'r' : 'g') : '-')).join(''), f = sd && sd.fits[key];
    L.push('SQUAD ' + S.def.id + ' (' + (G.ShipModel.has(S.def.id) ? 'glb' : 'recipe') + ', space.json says ' + (sd && sd.model) + '), fit ' + JSON.stringify(fit) + ' -> ' + key);
    if (f) {
      const r = RT.rcsFromB64(f.rcs);
      { // (her drawing made now, as ShipModel.ship makes it, against space.json; and with her ramp down, as she was in the hangar)
        const fr = G.ShipModel.ship(S.def, S.fleet), fg = fr.group; fg.updateMatrixWorld(true);
        const q = G.Radar.rcsOf('shapechk:' + Math.random(), fg, fg.matrixWorld.clone().invert()), d2 = rdiff(q.s, r.s); say(d2.rel < 1e-4, '  rcs (ShipModel.ship now, as built, vs space.json): worst abs ' + d2.abs.toExponential(2) + ' rel ' + d2.rel.toExponential(2));
        fr.ramp.rotation.x = fr.ramp.userData.open || Math.PI / 2 + 0.1; fg.updateMatrixWorld(true);
        const q2 = G.Radar.rcsOf('shapechk:' + Math.random(), fg, fg.matrixWorld.clone().invert()), d3 = rdiff(r.s, q2.s);
        L.push('  NOTE space.json against her drawing with the ramp down (rampT 1): worst rel ' + d3.rel.toExponential(2));
        fg.traverse((o) => { if (o.geometry) o.geometry.dispose(); }); }
      const g = S.model.group, tube = Sp.dbgTorp().TP.tube, skip = new Set(); if (tube) tube.m.traverse((o) => skip.add(o));
      const mb = meshBox(g, (o) => skip.has(o)), want = f.box.map((v) => v.toFixed(5)).join(',');
      say(bx(mb) === want, '  her box: mesh ' + bx(mb) + ' space.json ' + want);
      const su = EW.own; say(Math.abs(su.size - f.size) < 1e-6, '  size ' + su.size + ' / ' + f.size + '; scanner A at ' + su.scans[0].at.toArray().map((v) => v.toFixed(4)) + ' (top ' + f.top.toFixed(4) + ' + mast)');
      say(!!tube && tube.at.toArray().every((v, i) => Math.abs(v - f.tube[i]) < 1e-9), '  torpedo tube: ' + (tube ? tube.at.toArray().map((v) => v.toFixed(5)) : 'none') + ' / ' + f.tube.map((v) => v.toFixed(5)));
      S.model.turrets.forEach((tu, i) => { const b = tu.base.position.toArray(), w = sd.turrets[i], mz = fit[i] ? w.muzzle[fit[i] === 'rail' ? 'r' : 'g'] : null;
        say(b.every((v, k) => Math.abs(v - w.base[k]) < 1e-9) && (!mz || (tu.muzzle.position.toArray().every((v, k) => Math.abs(v - mz[k]) < 1e-9) && Math.abs(tu.gun.position.y - w.gunY) < 1e-9)), '  turret ' + i + ': base ' + b.map((v) => v.toFixed(4)) + ' / ' + w.base.map((v) => v.toFixed(4)) + (mz ? ', muzzle ' + tu.muzzle.position.toArray() + ' / ' + mz : ', no gun')); });
    } else L.push('DIFF  no space.json entry for ' + S.def.id + ' ' + key);
    return L.join('\\n');
  })()`, 180000);
  log(B);
  // ---- the same map and stand-in in node (tools/shapes_node_check.mjs): its fingerprints against the page's
  const mapL = A.split('\n').find((l) => l.startsWith('MAP ')), fpL = A.split('\n').find((l) => l.startsWith('FP ')), tfpL = B.split('\n').find((l) => l.includes('TFP '));
  if (!mapL) { log("NODE  (no MAP line: the page's map could not be made again from its arguments)"); return; }
  const tf = tfpL ? JSON.parse(tfpL.trim().slice(4)) : null, root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
  const r = spawnSync(process.execPath, [path.join(root, 'tools/shapes_node_check.mjs'), '--map', mapL.slice(4), ...(tf ? ['--traffic', tf.kind + ',' + tf.seed] : [])], { cwd: root, encoding: 'utf8' });
  const nfp = (r.stdout || '').split('\n').filter((l) => l.trim().startsWith('FP ')).map((l) => l.trim());
  const nodeMap = nfp.find((l) => l.includes('"clear"')), nodeT = nfp.find((l) => l.includes('"kind"'));
  log((nodeMap === fpL ? 'MATCH ' : 'DIFF  ') + 'node (tools/shapes_node_check.mjs --map ' + mapL.slice(4) + "): the hull's fingerprint" + (nodeMap === fpL ? ' the same' : ': ' + nodeMap));
  if (tf) { const okT = !!nodeT && nodeT.slice(3) === tfpL.trim().slice(4); log((okT ? 'MATCH ' : 'DIFF  ') + "node: the stand-in's fingerprint" + (okT ? ' the same' : ': ' + nodeT)); }
  log('node check: ' + ((r.stdout || '').trim().split('\n').pop() || r.stderr));
};
