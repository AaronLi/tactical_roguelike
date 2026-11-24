'use strict';
// Meshes that move or come and go, drawn a call a material, not a call each. The meshes themselves stay where they are, as they
// are (what moves them, hides them, hangs things on them, asks where they are, all works on them as before): only their own drawing
// is off (layer 0, as js/interiorcull.ts hides what it hides). Each time the scene's drawn, once three's brought its matrices up to
// date (the scene's onBeforeRender: js/render.ts), each one's matrix and whether it's showing is copied into the batch that draws it.
//   doors(map, parent)  the level's doors (map.doorMeshes): each door's pieces of a material merged into one (a sliding door's eleven
//                       boxes, five materials: five), then every door's drawn in a BatchedMesh a material under parent (the level's
//                       root). A leaf that's shot through (js/damage.ts leafMesh: its geometry made again with the holes) or anything
//                       else whose geometry's changed is let go: drawn as itself again.
//   marks(list, scene)  a pool of marks (the blood: one geometry, a few materials, each mark's material changed as it's reused): an
//                       InstancedMesh a material, the shown ones written in each frame
//   sync()              the scene's being drawn (js/render.ts scene.onBeforeRender)
//   clear()             the level's gone (the doors' batches go with the level's root)
// ?noproxy in the URL: all drawn as themselves (for comparing).
export const ProxyDraw = (() => {
  const T = THREE, OFF = typeof location !== 'undefined' && new URLSearchParams(location.search).has('noproxy');
  interface DInst { o: THREE.Mesh; bm: THREE.BatchedMesh; id: number; geo: THREE.BufferGeometry; M: Float32Array; vis: boolean; gone: boolean }
  interface MarkSet { list: THREE.Mesh[]; geo: THREE.BufferGeometry; by: Map<THREE.Material, THREE.InstancedMesh>; scene: THREE.Scene }
  let dinst: DInst[] = [], dparent: THREE.Object3D | null = null;
  const marks: MarkSet[] = [];
  const inv = new T.Matrix4(), M = new T.Matrix4();

  // shown: it and everything it hangs from, up to the scene, visible
  const shown = (o: THREE.Object3D) => { for (let p: THREE.Object3D | null = o; p; p = p.parent) { if (!p.visible) return false; if ((p as any).isScene) return true; } return false; };
  const plain = (mt: any) => mt && !Array.isArray(mt) && (mt.isMeshStandardMaterial || mt.isMeshBasicMaterial || mt.isMeshLambertMaterial || mt.isMeshPhongMaterial) && !mt.transparent && mt.visible !== false;
  const sig = (g: THREE.BufferGeometry) => Object.keys(g.attributes).sort().map((n) => n + ':' + g.attributes[n].itemSize).join(',') + (g.index ? '|i' : '|n');
  const flat = (g: THREE.BufferGeometry) => Object.values(g.attributes).every((a: any) => a.array instanceof Float32Array && !a.isInterleavedBufferAttribute && !a.normalized);

  // pieces of one material, one geometry (in their parent's frame): position and normal moved with each piece, the rest as it is
  function merge(ms: THREE.Mesh[]) {
    const names = Object.keys(ms[0].geometry.attributes), idx = !!ms[0].geometry.index;
    let nv = 0, ni = 0;
    for (const m of ms) { nv += m.geometry.attributes.position.count; ni += idx ? m.geometry.index!.count : 0; }
    const out = new T.BufferGeometry(), arr: Record<string, Float32Array> = {};
    for (const n of names) arr[n] = new Float32Array(nv * ms[0].geometry.attributes[n].itemSize);
    const ix = idx ? new Uint32Array(ni) : null, nm = new T.Matrix3(), v = new T.Vector3();
    let vo = 0, io = 0;
    for (const m of ms) {
      const g = m.geometry, c = g.attributes.position.count; m.updateMatrix(); nm.getNormalMatrix(m.matrix);
      for (const n of names) {
        const a = g.attributes[n] as THREE.BufferAttribute, s = a.itemSize, dst = arr[n];
        for (let i = 0; i < c; i++) {
          if (n === 'position') { v.fromBufferAttribute(a, i).applyMatrix4(m.matrix); dst.set([v.x, v.y, v.z], (vo + i) * 3); }
          else if (n === 'normal') { v.fromBufferAttribute(a, i).applyMatrix3(nm).normalize(); dst.set([v.x, v.y, v.z], (vo + i) * 3); }
          else for (let k = 0; k < s; k++) dst[(vo + i) * s + k] = (a.array as Float32Array)[i * s + k];
        }
      }
      if (ix) { const src = g.index!.array; for (let i = 0; i < src.length; i++) ix[io + i] = src[i] + vo; io += src.length; }
      vo += c;
    }
    for (const n of names) out.setAttribute(n, new T.BufferAttribute(arr[n], ms[0].geometry.attributes[n].itemSize));
    if (ix) out.setIndex(new T.BufferAttribute(ix, 1));
    out.computeBoundingBox(); out.computeBoundingSphere();
    return out;
  }

  function doors(map: LvMap, parent: THREE.Object3D) {
    clearDoors();
    if (OFF) return 0;
    const pivs = ((map as any).doorMeshes || []).filter(Boolean) as THREE.Object3D[];
    if (!pivs.length) return 0;
    // each door's own pieces of a material, merged (not its leaf, knobs or hinges: they're asked for one by one)
    for (const piv of pivs) {
      const u = piv.userData, own = new Set<THREE.Object3D>([u.leaf, ...(u.knobs || []), ...((u.hinges || []) as THREE.Object3D[][]).flat()].filter(Boolean));
      const bins = new Map<string, THREE.Mesh[]>();
      for (const c of piv.children as THREE.Mesh[]) {
        if (!c.isMesh || own.has(c) || c.children.length || (c as any).isInstancedMesh || !plain(c.material) || !c.visible || !flat(c.geometry)) continue;
        const k = (c.material as THREE.Material).uuid + '|' + c.layers.mask + '|' + sig(c.geometry); let l = bins.get(k); if (!l) bins.set(k, (l = [])); l.push(c);
      }
      for (const l of bins.values()) {
        if (l.length < 2) continue;
        const m = new T.Mesh(merge(l), l[0].material); m.castShadow = l[0].castShadow; m.receiveShadow = l[0].receiveShadow; m.layers.mask = l[0].layers.mask;
        for (const c of l) { c.removeFromParent(); c.geometry.dispose(); }
        piv.add(m);
      }
    }
    // then every door's pieces in a batch a material
    parent.updateMatrixWorld(true); inv.copy(parent.matrixWorld).invert();
    const bins = new Map<string, THREE.Mesh[]>();
    for (const piv of pivs) piv.traverse((c: any) => {
      if (!c.isMesh || c.isInstancedMesh || c.isBatchedMesh || c.isSkinnedMesh || c.renderOrder || c.morphTargetInfluences || !plain(c.material) || !flat(c.geometry) || c.geometry.attributes.position.count === 0) return;
      if (c.userData.marks || c.userData.lining) return; // (already shot: drawn as itself)
      const k = c.material.uuid + '|' + c.layers.mask + '|' + sig(c.geometry) + '|' + (c.castShadow ? 1 : 0); let l = bins.get(k); if (!l) bins.set(k, (l = [])); l.push(c);
    });
    for (const l of bins.values()) {
      const geos = new Map<THREE.BufferGeometry, number>(); let nv = 0, ni = 0;
      for (const c of l) if (!geos.has(c.geometry)) { geos.set(c.geometry, -1); nv += c.geometry.attributes.position.count; ni += c.geometry.index ? c.geometry.index.count : 0; }
      const bm = new T.BatchedMesh(l.length, nv, ni, l[0].material as THREE.Material);
      bm.sortObjects = false; bm.perObjectFrustumCulled = true; bm.castShadow = l[0].castShadow; bm.receiveShadow = l[0].receiveShadow;
      bm.layers.mask = l[0].layers.mask | 1; bm.matrixAutoUpdate = false; bm.name = 'doors'; bm.userData.keepMat = true; // (its material the doors': thrown away with them)
      for (const c of l) {
        let gid = geos.get(c.geometry)!; if (gid < 0) { gid = bm.addGeometry(c.geometry); geos.set(c.geometry, gid); }
        const id = bm.addInstance(gid); c.updateWorldMatrix(true, false); M.multiplyMatrices(inv, c.matrixWorld); bm.setMatrixAt(id, M);
        const vis = shown(c); bm.setVisibleAt(id, vis);
        dinst.push({ o: c, bm, id, geo: c.geometry, M: new Float32Array(M.elements), vis, gone: false });
        c.layers.disable(0); c.userData.proxied = true;
      }
      bm.computeBoundingBox(); bm.computeBoundingSphere();
      parent.add(bm);
    }
    dparent = parent;
    return dinst.length;
  }

  // the marks: an InstancedMesh for each of their materials (mats: all a mark's ever given), in the scene itself, made now (its shader
  // built with the rest, js/render.ts warmup, not the first time one's shown); each mark's renderOrder the same (list[0]'s)
  function markSet(list: THREE.Mesh[], scene: THREE.Scene, mats: THREE.Material[]) {
    if (OFF || !list.length) return;
    for (const m of list) { m.layers.disable(0); m.userData.proxied = true; }
    const s: MarkSet = { list, geo: list[0].geometry, by: new Map(), scene };
    for (const mt of mats) {
      const im = new T.InstancedMesh(s.geo, mt, list.length); im.count = 0; im.frustumCulled = false; im.renderOrder = list[0].renderOrder;
      im.userData.keepMat = true; im.matrixAutoUpdate = false; im.name = 'marks';
      scene.add(im); s.by.set(mt, im);
    }
    marks.push(s);
  }

  function syncDoors() {
    if (!dinst.length || !dparent) return;
    inv.copy(dparent.matrixWorld).invert();
    const bms = new Set<THREE.BatchedMesh>();
    for (const d of dinst) {
      if (d.gone) continue;
      if (d.o.geometry !== d.geo || d.o.renderOrder) { // (made again: the holes shot in it. Drawn as itself from now on)
        d.gone = true; d.o.layers.enable(0); d.o.userData.proxied = false; d.bm.setVisibleAt(d.id, false); continue;
      }
      const vis = shown(d.o);
      if (vis !== d.vis) { d.vis = vis; d.bm.setVisibleAt(d.id, vis); bms.add(d.bm); }
      if (!vis) continue;
      M.multiplyMatrices(inv, d.o.matrixWorld);
      const e = M.elements, c = d.M; let same = true;
      for (let i = 0; i < 16; i++) if (e[i] !== c[i]) { same = false; break; }
      if (!same) { c.set(e); d.bm.setMatrixAt(d.id, M); bms.add(d.bm); }
    }
    for (const bm of bms) { bm.computeBoundingBox(); bm.computeBoundingSphere(); } // (a door slid or fell: the batch's bounds for the frustum)
  }

  function syncMarks() {
    for (const s of marks) {
      for (const im of s.by.values()) im.count = 0;
      for (const m of s.list) {
        if (!m.visible || !shown(m)) continue;
        const im = s.by.get(m.material as THREE.Material);
        if (!im) { if (!m.layers.isEnabled(0)) m.layers.enable(0); continue; } // (a material it wasn't told of: drawn as itself)
        im.setMatrixAt(im.count++, m.matrixWorld);
      }
      for (const im of s.by.values()) if (im.count) im.instanceMatrix.needsUpdate = true;
    }
  }

  function sync() { syncDoors(); syncMarks(); }

  function clearDoors() {
    for (const d of dinst) if (!d.gone) { d.o.layers.enable(0); d.o.userData.proxied = false; }
    const bms = new Set(dinst.map((d) => d.bm));
    for (const bm of bms) if (bm.parent) { bm.removeFromParent(); bm.dispose(); }
    dinst = []; dparent = null;
  }
  function clear() { clearDoors(); for (const s of marks) for (const im of s.by.values()) im.count = 0; }
  return { doors, marks: markSet, sync, clear, get stats() { return { doors: dinst.filter((d) => !d.gone).length, batches: new Set(dinst.map((d) => d.bm)).size, marks: marks.map((s) => [...s.by.values()].map((im) => im.count)) }; } };
})();
