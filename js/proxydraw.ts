'use strict';
// Meshes that move or come and go, drawn a call a kind of material, not a call each. The meshes themselves stay where they are, as they
// are (what moves them, hides them, hangs things on them, asks where they are, all works on them as before): only their own drawing is
// off (layer 0, as js/interiorcull.ts hides what it hides). Each time the scene's drawn, once three's brought its matrices up to date
// (the scene's onBeforeRender: js/render.ts), each one's matrix and whether it's showing is copied into the batch that draws it.
// A batch is a BatchedMesh for each kind of material: materials alike in all but their colour are one kind (the batch's material is
// one of them in white, each piece its own colour: setColorAt). A piece whose geometry's made again or changed where it is (a door's
// leaf shot through, js/damage.ts leafMesh; the plating over a hull's rammed side, js/shipmodel.ts cutAt), whose material's swapped or
// whose material's glow changes is let go: drawn as itself again. One whose colour changes takes the new colour.
//   follow(roots, parent)  everything plain and opaque under roots, in batches under parent (the frame they're kept in: under a ship's
//                          own group, her pieces' matrices don't change as she flies). A set; release(set) lets it go
//   doors(map, parent)     the level's doors (map.doorMeshes) and what else of it opens (the case, the boxes, the cabinets: LevelView.keepOf):
//                          each door's pieces of a material merged into one first (a sliding door's eleven boxes, five materials: five),
//                          then followed. Let go with the level (clear)
//   marks(list, scene, mats) a pool of marks (the blood: one geometry, a few materials, each mark's material changed as it's reused): an
//                          InstancedMesh a material, the shown ones written in each frame
//   sync()                 the scene's being drawn (js/render.ts scene.onBeforeRender)
//   clear()                the level's gone: its sets let go (not one followed with keep: your own ship)
// ?noproxy in the URL: all drawn as themselves (for comparing).
export const ProxyDraw = (() => {
  const T = THREE, OFF = typeof location !== 'undefined' && new URLSearchParams(location.search).has('noproxy');
  interface Inst { o: THREE.Mesh; bm: THREE.BatchedMesh; id: number; geo: THREE.BufferGeometry; ver: number; mat: THREE.Material; M: Float32Array; vis: boolean; gone: boolean }
  interface MatW { m: any; r: number; g: number; b: number; e: number; ins: Inst[] }
  interface FSet { parent: THREE.Object3D; inst: Inst[]; bms: THREE.BatchedMesh[]; own: THREE.Material[]; mats: MatW[]; keep: boolean; hidden: boolean }
  interface MarkSet { list: THREE.Mesh[]; geo: THREE.BufferGeometry; by: Map<THREE.Material, THREE.InstancedMesh>; scene: THREE.Scene }
  const sets: FSet[] = [], marks: MarkSet[] = [];
  const inv = new T.Matrix4(), M = new T.Matrix4(), C = new T.Color();

  // shown: it and everything it hangs from, up to the scene, visible
  const shown = (o: THREE.Object3D) => { for (let p: THREE.Object3D | null = o; p; p = p.parent) { if (!p.visible) return false; if ((p as any).isScene) return true; } return false; };
  const plain = (mt: any) => mt && !Array.isArray(mt) && (mt.isMeshStandardMaterial || mt.isMeshBasicMaterial || mt.isMeshLambertMaterial || mt.isMeshPhongMaterial) && !mt.transparent && mt.visible !== false && !mt.hasOwnProperty('onBeforeCompile');
  const sig = (g: THREE.BufferGeometry) => Object.keys(g.attributes).sort().map((n) => n + ':' + g.attributes[n].itemSize).join(',') + (g.index ? '|i' : '|n');
  const flat = (g: THREE.BufferGeometry) => Object.values(g.attributes).every((a: any) => a.array instanceof Float32Array && !a.isInterleavedBufferAttribute && !a.normalized);
  const ver = (g: THREE.BufferGeometry) => (g.attributes.position as THREE.BufferAttribute).version + (g.index ? g.index.version * 7919 : 0);
  // a material's kind: everything that makes it what it is but its colour
  const kinds = new WeakMap<THREE.Material, string>();
  const KEYS = ['type', 'roughness', 'metalness', 'emissiveIntensity', 'side', 'flatShading', 'vertexColors', 'opacity', 'alphaTest', 'depthWrite', 'depthTest', 'polygonOffset', 'polygonOffsetFactor', 'polygonOffsetUnits', 'wireframe', 'fog', 'toneMapped', 'blending', 'envMapIntensity', 'shininess', 'reflectivity', 'dithering'];
  const MAPS = ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'emissiveMap', 'aoMap', 'alphaMap', 'lightMap', 'bumpMap', 'specularMap', 'envMap'];
  const kindOf = (m: any) => {
    let k = kinds.get(m);
    if (k == null) {
      k = KEYS.map((n) => m[n]).join(',') + '|' + MAPS.map((n) => (m[n] ? m[n].uuid : '')).join(',') + '|' + (m.emissive ? m.emissive.getHex() : '') + '|' + JSON.stringify(m.defines || {}) + '|' + (m.normalScale ? m.normalScale.x + ',' + m.normalScale.y : '') + '|' + (m.customProgramCacheKey ? m.customProgramCacheKey() : '');
      kinds.set(m, k);
    }
    return k;
  };

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
  // a door's own pieces of a material, merged (not its leaf, knobs or hinges: they're asked for one by one)
  function mergeDoor(piv: THREE.Object3D) {
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

  // (the batches aren't under parent: in the scene itself, each frame where parent is (its matrixWorld), so nothing that walks a ship's or
  // the level's meshes, to carve them, measure them or cast rays at them, finds them. level: the level's, kept in a room's reflection,
  // js/probes.ts)
  function follow(roots: THREE.Object3D[], parent: THREE.Object3D, keep = false, level = false): FSet | null {
    if (OFF) return null;
    parent.updateMatrixWorld(true); inv.copy(parent.matrixWorld).invert();
    const bins = new Map<string, THREE.Mesh[]>(), seen = new Set<THREE.Object3D>();
    for (const root of roots) root.traverse((c: any) => {
      if (seen.has(c)) return; seen.add(c);
      if (!c.isMesh || c.isInstancedMesh || c.isBatchedMesh || c.isSkinnedMesh || c.isPoints || c.isLine || c.renderOrder || c.morphTargetInfluences || c.userData.proxied || c.hasOwnProperty('onBeforeRender')) return;
      if (!plain(c.material) || !c.geometry.attributes.position || !flat(c.geometry) || c.geometry.attributes.position.count === 0) return; // (a box's six groups are nothing to one material)
      if (c.userData.marks || c.userData.lining) return; // (already shot: drawn as itself)
      const k = kindOf(c.material) + '|' + c.layers.mask + '|' + sig(c.geometry) + '|' + (c.castShadow ? 1 : 0) + (c.frustumCulled ? 1 : 0); let l = bins.get(k); if (!l) bins.set(k, (l = [])); l.push(c);
    });
    const S: FSet = { parent, inst: [], bms: [], own: [], mats: [], keep, hidden: false };
    const mw = new Map<THREE.Material, MatW>();
    for (const l of bins.values()) {
      if (l.length < 2) continue; // (alone of its kind: nothing to save)
      const geos = new Map<THREE.BufferGeometry, number>(); let nv = 0, ni = 0;
      for (const c of l) if (!geos.has(c.geometry)) { geos.set(c.geometry, -1); nv += c.geometry.attributes.position.count; ni += c.geometry.index ? c.geometry.index.count : 0; }
      const src = l[0].material as any, mt = src.clone(); mt.defines = Object.assign({}, src.defines); if (mt.color) mt.color.set(0xffffff); // (a clone loses its defines)
      S.own.push(mt);
      const bm = new T.BatchedMesh(l.length, nv, ni, mt);
      bm.sortObjects = false; bm.perObjectFrustumCulled = l[0].frustumCulled; bm.frustumCulled = l[0].frustumCulled; bm.castShadow = l[0].castShadow; bm.receiveShadow = l[0].receiveShadow;
      bm.layers.mask = l[0].layers.mask | 1; bm.matrixAutoUpdate = false; bm.matrixWorldAutoUpdate = false; bm.matrixWorld.copy(parent.matrixWorld); bm.name = 'follow'; bm.userData.keepMat = true; bm.userData.inLevel = level; // (its material's its own: let go in release)
      for (const c of l) {
        let gid = geos.get(c.geometry)!; if (gid < 0) { gid = bm.addGeometry(c.geometry); geos.set(c.geometry, gid); }
        const id = bm.addInstance(gid); c.updateWorldMatrix(true, false); M.multiplyMatrices(inv, c.matrixWorld); bm.setMatrixAt(id, M);
        const cm = c.material as any; bm.setColorAt(id, cm.color || C.set(0xffffff));
        const vis = shown(c); bm.setVisibleAt(id, vis);
        const d: Inst = { o: c, bm, id, geo: c.geometry, ver: ver(c.geometry), mat: cm, M: new Float32Array(M.elements), vis, gone: false };
        S.inst.push(d);
        let w = mw.get(cm); if (!w) { w = { m: cm, r: cm.color ? cm.color.r : 1, g: cm.color ? cm.color.g : 1, b: cm.color ? cm.color.b : 1, e: cm.emissive ? cm.emissive.getHex() * 1 + cm.emissiveIntensity : 0, ins: [] }; mw.set(cm, w); }
        w.ins.push(d);
        c.layers.disable(0); c.userData.proxied = true;
      }
      bm.computeBoundingBox(); bm.computeBoundingSphere();
      S.bms.push(bm);
    }
    S.mats = [...mw.values()];
    if (!S.inst.length) return null;
    sets.push(S);
    return S;
  }
  const letGo = (d: Inst) => { if (d.gone) return; d.gone = true; d.o.layers.enable(0); d.o.userData.proxied = false; d.bm.setVisibleAt(d.id, false); };

  function doors(map: LvMap, parent: THREE.Object3D, keepRoots: Iterable<THREE.Object3D>) {
    if (OFF) return 0;
    const pivs = ((map as any).doorMeshes || []).filter(Boolean) as THREE.Object3D[];
    for (const piv of pivs) mergeDoor(piv);
    const S = follow([...pivs, ...keepRoots], parent, false, true);
    return S ? S.inst.length : 0;
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

  function syncSet(S: FSet, scene: THREE.Scene) {
    for (const bm of S.bms) { if (bm.parent !== scene) scene.add(bm); bm.matrixWorld.copy(S.parent.matrixWorld); }
    if (!shown(S.parent)) { // (not in the scene, or hidden: its pieces too)
      if (!S.hidden) { S.hidden = true; for (const d of S.inst) if (!d.gone && d.vis) { d.vis = false; d.bm.setVisibleAt(d.id, false); } }
      return;
    }
    S.hidden = false;
    // a material's colour changed: its pieces take it; its glow changed: they're let go (the batch's is the first one's)
    for (const w of S.mats) {
      const m = w.m;
      if (m.emissive && m.emissive.getHex() * 1 + m.emissiveIntensity !== w.e) { for (const d of w.ins) letGo(d); w.e = m.emissive.getHex() * 1 + m.emissiveIntensity; continue; }
      if (m.color && (m.color.r !== w.r || m.color.g !== w.g || m.color.b !== w.b)) { w.r = m.color.r; w.g = m.color.g; w.b = m.color.b; for (const d of w.ins) if (!d.gone) d.bm.setColorAt(d.id, m.color); }
    }
    inv.copy(S.parent.matrixWorld).invert();
    let moved: Set<THREE.BatchedMesh> | null = null;
    for (const d of S.inst) {
      if (d.gone) continue;
      if (d.o.geometry !== d.geo || ver(d.o.geometry) !== d.ver || d.o.material !== d.mat || d.o.renderOrder) { letGo(d); continue; } // (made again or changed: drawn as itself from now on)
      const vis = shown(d.o);
      if (vis !== d.vis) { d.vis = vis; d.bm.setVisibleAt(d.id, vis); }
      if (!vis) continue;
      M.multiplyMatrices(inv, d.o.matrixWorld);
      const e = M.elements, c = d.M; let same = true;
      for (let i = 0; i < 16; i++) if (e[i] !== c[i]) { same = false; break; }
      if (!same) { c.set(e); d.bm.setMatrixAt(d.id, M); (moved || (moved = new Set())).add(d.bm); }
    }
    if (moved) for (const bm of moved) { bm.computeBoundingBox(); bm.computeBoundingSphere(); } // (a door slid or fell: the batch's bounds for the frustum)
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

  // Materials told apart only by colour, in one batch (js/levelview.ts batchStatic): tone(m) its kind if it can be (a colour, and no glow:
  // a lamp's fitting's glow changes, and a glow isn't a piece's own), white(m) the batch's material, watch(m, bm, id) a piece of it (its
  // colour changed, the piece takes it)
  const watched = new Map<THREE.Material, { r: number; g: number; b: number; at: [THREE.BatchedMesh, number][] }>();
  function tone(m: any): string | null {
    if (OFF || !m || !m.color || m.transparent || m.hasOwnProperty('onBeforeCompile') || (m.emissive && m.emissive.getHex() !== 0)) return null;
    return kindOf(m);
  }
  function white(src: any) { const mt = src.clone(); mt.defines = Object.assign({}, src.defines); mt.color.set(0xffffff); return mt; } // (a clone loses its defines)
  function watch(m: any, bm: THREE.BatchedMesh, id: number) { let w = watched.get(m); if (!w) watched.set(m, (w = { r: m.color.r, g: m.color.g, b: m.color.b, at: [] })); w.at.push([bm, id]); }
  function syncWatched() {
    for (const [m, w] of watched as Map<any, any>) if (m.color.r !== w.r || m.color.g !== w.g || m.color.b !== w.b) { w.r = m.color.r; w.g = m.color.g; w.b = m.color.b; for (const [bm, id] of w.at) bm.setColorAt(id, m.color); }
  }

  function sync(scene: THREE.Scene) { for (const S of sets) syncSet(S, scene); syncMarks(); syncWatched(); }

  function release(S: FSet | null) {
    if (!S) return;
    const i = sets.indexOf(S); if (i >= 0) sets.splice(i, 1);
    for (const d of S.inst) if (!d.gone) { d.o.layers.enable(0); d.o.userData.proxied = false; }
    for (const bm of S.bms) { bm.removeFromParent(); bm.dispose(); }
    for (const m of S.own) m.dispose();
  }
  function clear() { watched.clear(); for (const S of [...sets]) if (!S.keep) release(S); for (const s of marks) for (const im of s.by.values()) im.count = 0; }
  return {
    follow, release, doors, marks: markSet, sync, clear, tone, white, watch,
    get stats() { return { sets: sets.length, pieces: sets.reduce((a, S) => a + S.inst.filter((d) => !d.gone).length, 0), batches: sets.reduce((a, S) => a + S.bms.length, 0), marks: marks.map((s) => [...s.by.values()].map((im) => im.count)) }; },
  };
})();
