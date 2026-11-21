// A ship's inside, not drawn where it can't be seen. Out in space (in the squad's ship, docked or flying, or looking at one of
// the zone's ships) a boarded ship's rooms are sealed in her hull: what of them can be seen is what's seen through her
// openings, her breach and the holes rammed in her (js/shipmodel.ts hull cutAt), her outer windows and a glass roof. Each piece of
// her inside (a mesh, or an instance of one of the level's batches, js/levelview.ts batchStatic) is drawn while the camera's in
// her (in a cell of hers) or while the line from the camera to it passes through one of those openings, near enough to be more than a
// speck; else not. Not drawn is its layer 0 off (no camera, nor a light's shadow camera, has the rest): nothing else about it changes,
// so what walks the scene, hides, moves or hits it works as before. Worked out again when the camera's moved (not when it turns:
// which way it looks is the frustum's business). js/space.ts tracks a ship's inside when it's in the scene, and calls update.
import { Level } from './level.js';

export const InteriorCull = (() => {
  const T = THREE;
  interface Unit { o: THREE.Mesh; bm: THREE.BatchedMesh | null; id: number; c: THREE.Vector3; r: number; vis: boolean; skin: boolean }
  interface Open { p: THREE.Vector3; r: number }
  interface Track { root: THREE.Object3D; map: LvMap; holes: () => number[][]; glass: Open[]; units: Unit[] | null; at: THREE.Vector3; all: boolean | null; on: boolean; nh: number; px: number }
  const tracks = new Map<THREE.Object3D, Track>(), opts = { on: true }; // (off: all drawn, for comparing)

  // her openings in her own frame (the root's): the holes in her (x, z, out-x, out-z), her outer windows, a glass roof
  function openings(t: Track): Open[] {
    const out: Open[] = [], TS = Level.TS, W = t.map.W;
    const b = t.map.sp && t.map.sp.breach; if (b) out.push({ p: new T.Vector3(b.x, 1.75, b.face), r: 2.9 }); // (her breach: where the squad's ship docks, its door into her)
    for (const [x, z, nx, nz] of t.holes()) out.push({ p: new T.Vector3(x + nx * 0.2, 1.75, z + nz * 0.2), r: 2.9 }); // (a hole's 4.6 m along the wall, 3.5 m up)
    for (const fm of [t.map, ...(t.map.floors || [])]) for (const w of fm.windows || []) {
      if (!w.cells || !w.cells.length) continue;
      const out1 = (c: number) => { const x = c % W, z = Math.floor(c / W); return x < 0 || z < 0 || x >= W || z >= t.map.H || t.map.t[c] === 5; }; // (off her: js/shipmodel.ts hull's solid)
      if (!w.ext && !w.cells.some((c) => out1(c + w.nx + w.nz * W) || out1(c - w.nx - w.nz * W))) continue; // (an outer window: the open on one side of it)
      let x = 0, z = 0; for (const c of w.cells) { x += (c % W) + 0.5; z += Math.floor(c / W) + 0.5; }
      x = x / w.cells.length * TS; z = z / w.cells.length * TS;
      out.push({ p: new T.Vector3(x, (fm.fy || w.fy || 0) + 1.6, z), r: w.cells.length * TS * 0.5 + 0.7 });
    }
    out.push(...t.glass);
    for (const g of t.map.glassRoofs || []) { const [x0, z0, x1, z1, top] = g; out.push({ p: new T.Vector3((x0 + x1) / 2, top, (z0 + z1) / 2), r: Math.hypot(x1 - x0, z1 - z0) / 2 + 1 }); }
    return out;
  }
  // her pieces, each with where it is and how big (in her frame), gathered once (after her batches are made)
  function gather(t: Track) {
    const units: Unit[] = [], inv = new T.Matrix4(), M = new T.Matrix4(), s = new T.Sphere();
    t.root.updateMatrixWorld(true); inv.copy(t.root.matrixWorld).invert();
    t.root.traverse((o: any) => {
      if (!o.isMesh || o.isInstancedMesh) return; // (an instanced mesh, her walls, is everywhere: always drawn)
      if (o.isBatchedMesh) {
        const bm = o as THREE.BatchedMesh, n = (bm as any)._instanceInfo ? (bm as any)._instanceInfo.length : 0;
        for (let id = 0; id < n; id++) {
          const info = (bm as any)._instanceInfo[id]; if (!info || !info.active) continue;
          bm.getBoundingSphereAt(bm.getGeometryIdAt(id), s); bm.getMatrixAt(id, M); s.applyMatrix4(M.premultiply(bm.matrixWorld).premultiply(inv));
          units.push({ o, bm, id, c: s.center.clone(), r: s.radius, vis: bm.getVisibleAt(id), skin: false });
        }
        return;
      }
      const g = o.geometry as THREE.BufferGeometry; if (!g.boundingSphere) g.computeBoundingSphere();
      s.copy(g.boundingSphere!).applyMatrix4(M.multiplyMatrices(inv, o.matrixWorld));
      units.push({ o, bm: null, id: -1, c: s.center.clone(), r: s.radius + 0.5, vis: true, skin: false }); // (+0.5: a door swinging, a lid opening)
    });
    t.units = units;
  }
  function show(u: Unit, vis: boolean) {
    if (u.vis === vis) return; u.vis = vis;
    if (u.bm) u.bm.setVisibleAt(u.id, vis);
    else if (vis) u.o.layers.enable(0); else u.o.layers.disable(0);
  }

  // root: her inside (what LevelView made of her map); holes: where she's been cut open (js/shipmodel.ts hull)
  // (hull: her hull's group, in the same frame as her inside: its glass, a bridge's glazing, a liner's roof, is seen through too)
  function track(root: THREE.Object3D, map: LvMap, holes: () => number[][], hull?: THREE.Object3D | null) {
    untrack(root);
    const glass: Open[] = [];
    if (hull) { hull.updateMatrixWorld(true); const inv = new T.Matrix4().copy(hull.matrixWorld).invert(), sp = new T.Sphere(), M = new T.Matrix4();
      hull.traverse((o: any) => { if (!o.isMesh || Array.isArray(o.material) || !o.material.transparent || o.material.blending === T.AdditiveBlending) return; const g = o.geometry; if (!g.boundingSphere) g.computeBoundingSphere(); sp.copy(g.boundingSphere).applyMatrix4(M.multiplyMatrices(inv, o.matrixWorld)); glass.push({ p: sp.center.clone(), r: sp.radius + 0.5 }); }); }
    tracks.set(root, { root, map, holes, glass, units: null, at: new T.Vector3(1e9, 0, 0), all: null, on: true, nh: -1, px: 0 });
  }
  // and she's drawn whole again (she's the level you're aboard, or gone)
  function untrack(root: THREE.Object3D) {
    const t = tracks.get(root); if (!t) return;
    tracks.delete(root);
    if (t.units) for (const u of t.units) if (u.o.parent || u.bm) show(u, true);
  }
  // cam: the camera everything's drawn from; px: pixels a radian (the view's height over its field), for what's only a speck
  const _c = new T.Vector3(), _inv = new T.Matrix4(), _d = new T.Vector3(), _q = new T.Vector3();
  function update(cam: THREE.Camera, px: number) {
    for (const t of tracks.values()) {
      if (!t.root.parent) continue;
      if (!t.units) gather(t);
      t.root.updateWorldMatrix(true, false);
      _c.setFromMatrixPosition(cam.matrixWorld).applyMatrix4(_inv.copy(t.root.matrixWorld).invert());
      const nh = t.holes().length;
      if (_c.distanceToSquared(t.at) < 0.04 && t.all !== null && t.on === opts.on && t.nh === nh && Math.abs(px - t.px) < 0.1 * t.px) continue; // (moved under 20 cm, zoomed under 10%, nothing new cut in her: as it was)
      t.at.copy(_c); t.on = opts.on; t.nh = nh; t.px = px;
      const M = t.map, TS = Level.TS, cx = Math.floor(_c.x / TS), cz = Math.floor(_c.z / TS), NF = M.floors ? M.floors.length : 1;
      const inside = !opts.on || cx >= 0 && cz >= 0 && cx < M.W && cz < M.H && M.t[cz * M.W + cx] !== 5 && _c.y > -1.2 && _c.y < (NF - 1) * Level.FLOOR_H + Level.WALL_H + 0.6; // (in a cell of hers: js/shipmodel.ts hull's solid)
      // (far off but zoomed in on, big on the screen: what's seen of her inside through openings this doesn't know of (her
      // hull's gaps) shows: drawn whole. Near her, the openings are all there is to see in through)
      const R = t.map.W * Level.TS * 0.6, dist = _c.length();
      const big = dist > 300 && R / dist * px > 150;
      if (inside || big) { if (t.all !== true) { for (const u of t.units!) show(u, true); t.all = true; } continue; }
      t.all = false;
      // the openings big enough to see into from here
      const ops = openings(t).filter((o) => o.r / Math.max(1, o.p.distanceTo(_c)) * px > 1.5);
      for (const u of t.units!) {
        let vis = false;
        if (!vis) for (const o of ops) {
          const dp = _q.copy(o.p).sub(_c), dl = dp.length();
          if (o.p.distanceTo(u.c) < o.r + u.r) { vis = true; break; } // (at the opening itself)
          _d.copy(u.c).sub(_c); const L = _d.length(); if (L < dl * 0.5) continue; // (nearer than the opening: not in her)
          _d.divideScalar(L);
          const along = dp.dot(_d); if (along <= 0) continue;
          const off = Math.sqrt(Math.max(0, dl * dl - along * along)); // (how far the opening's middle is off the line to the piece)
          if (off < o.r + u.r * (dl / L) + 0.3) { vis = true; break; } // (the piece, seen from here, overlaps the opening)
        }
        show(u, vis);
      }
    }
  }
  const stats = () => [...tracks.values()].map((t) => ({ opens: openings(t).length, holes: t.holes().length, units: t.units ? t.units.length : 0, shown: t.units ? t.units.filter((u) => u.vis).length : 0, all: t.all }));
  const clear = () => { for (const r of [...tracks.keys()]) untrack(r); };
  return { track, untrack, clear, update, stats, opts, _tracks: tracks, _show: show, _openings: openings };
})();
