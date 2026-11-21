'use strict';
import { Models } from './glb.js';
import { Level } from './level.js';
import { ShipGen } from './shipgen.js';
import { SpaceData } from './spacedata.js';
import { U as G_U } from './util.js';
import { GunAo } from './gunao.js';
interface SmGun { k: 'pd' | 'mg' | 'missile'; inv?: boolean; x: number; y: number; z: number; hp: number; obj: THREE.Group; gun: THREE.Group; cool: number }
export const ShipModel = (() => {
  const T = THREE;
  // boxes gathered by material, then merged
  class Kit {
    by = new Map<THREE.Material, number[][]>();
    box(m: THREE.Material, x0: number, y0: number, z0: number, x1: number, y1: number, z1: number) { let a = this.by.get(m); if (!a) this.by.set(m, a = []); a.push([Math.min(x0, x1), Math.min(y0, y1), Math.min(z0, z1), Math.max(x0, x1), Math.max(y0, y1), Math.max(z0, z1)]); }
    build(into: THREE.Object3D) {
      for (const [m, bs] of this.by) {
        const pos = new Float32Array(bs.length * 72), nrm = new Float32Array(bs.length * 72), idx: number[] = [];
        bs.forEach(([x0, y0, z0, x1, y1, z1], b) => {
          const F: [number[], number[][]][] = [[[1, 0, 0], [[x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1]]], [[-1, 0, 0], [[x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0]]], [[0, 1, 0], [[x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0]]],
            [[0, -1, 0], [[x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1]]], [[0, 0, 1], [[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]]], [[0, 0, -1], [[x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0]]]];
          F.forEach(([n, vs], f) => { const o = (b * 6 + f) * 4; vs.forEach((v, k) => { pos.set(v, (o + k) * 3); nrm.set(n, (o + k) * 3); }); idx.push(o, o + 1, o + 2, o, o + 2, o + 3); });
        });
        const g = new T.BufferGeometry(); g.setAttribute('position', new T.BufferAttribute(pos, 3)); g.setAttribute('normal', new T.BufferAttribute(nrm, 3)); g.setIndex(idx);
        const mesh = new T.Mesh(g, m); mesh.frustumCulled = false; into.add(mesh);
      }
      this.by.clear();
    }
  }
  const M = (color: number, o?: Record<string, any>) => new T.MeshStandardMaterial(Object.assign({ color, roughness: 0.7, metalness: 0.25 }, o || {}));
  const lit = (color: number) => new T.MeshBasicMaterial({ color });
  const part = (g: THREE.Object3D, mesh: THREE.Object3D, x: number, y: number, z: number) => { mesh.position.set(x, y, z); g.add(mesh); return mesh; };
  const canvasTex = (w: number, h: number, draw?: (g: CanvasRenderingContext2D, w: number, h: number) => void) => { const c = document.createElement('canvas'); c.width = w; c.height = h; if (draw) draw(c.getContext('2d')!, w, h); const t = new T.CanvasTexture(c); return { cv: c, tex: t }; };

  // ---- A model drawn in a few calls: every plain, opaque, untextured part under g that doesn't move or change on its own (not
  // under anything in keep) merged into one mesh a kind (lit: standard; flat colour: basic), each part's colour, roughness,
  // metalness and glow (emissive) written into its vertices, so parts that only differ in those share the one draw. Its
  // standard mesh's shader reads them there (vPbr, vEmi) where three's reads its material's (after the light grid's patch:
  // js/lightgrid.ts). What can't go in (transparent, textured, a shader of its own, other attributes than position, normal,
  // uv and colour, in keep) is left as it was. The merged meshes are in g's own frame.
  const PBR_ATT = new Set(['position', 'normal', 'uv', 'color']);
  const pbrMats = new Map<string, THREE.Material>(), compactOn = { on: typeof location === 'undefined' || !new URLSearchParams(location.search).has('nocompact') }; // (?nocompact: as built)
  function pbrMat(kind: 'std' | 'basic', side: number, flat: boolean, env: number, fog: boolean) {
    const key = kind + side + +flat + env + +fog; let m = pbrMats.get(key);
    if (m) return m;
    if (kind === 'basic') m = new T.MeshBasicMaterial({ vertexColors: true, side: side as THREE.Side, fog });
    else {
      const sm = new T.MeshStandardMaterial({ vertexColors: true, side: side as THREE.Side, flatShading: flat, fog, roughness: 1, metalness: 1 }); sm.envMapIntensity = env;
      const NL = String.fromCharCode(10);
      sm.onBeforeCompile = (sh, rd) => {
        (T.MeshStandardMaterial.prototype.onBeforeCompile as any).call(sm, sh, rd);
        sh.vertexShader = sh.vertexShader.replace('#include <common>', ['#include <common>', 'attribute vec2 aPbr;', 'attribute vec3 aEmi;', 'varying vec2 vPbr;', 'varying vec3 vEmi;'].join(NL)).replace('#include <begin_vertex>', ['#include <begin_vertex>', 'vPbr = aPbr; vEmi = aEmi;'].join(NL));
        sh.fragmentShader = sh.fragmentShader.replace('#include <common>', ['#include <common>', 'varying vec2 vPbr;', 'varying vec3 vEmi;'].join(NL)).replace('#include <roughnessmap_fragment>', 'float roughnessFactor = vPbr.x;').replace('#include <metalnessmap_fragment>', 'float metalnessFactor = vPbr.y;').replace('vec3 totalEmissiveRadiance = emissive;', 'vec3 totalEmissiveRadiance = vEmi;');
      };
      sm.customProgramCacheKey = () => 'pbr-vertex';
      m = sm;
    }
    m.userData.keepMat = true; // (shared by every model's merged meshes, all session: js/render.ts clearLevel)
    pbrMats.set(key, m); return m;
  }
  function compact(g: THREE.Object3D, keep: Iterable<THREE.Object3D> = []) {
    if (!compactOn.on) return { merged: 0, meshes: 0 }; // (off: as built, for comparing)
    const skip = new Set<THREE.Object3D>(); for (const k of keep) k.traverse((o) => skip.add(o));
    g.updateMatrixWorld(true);
    const inv = new T.Matrix4().copy(g.matrixWorld).invert(), N = new T.Matrix3();
    const noTex = (m: any) => !m.map && !m.alphaMap && !m.lightMap && !m.aoMap && !m.emissiveMap && !m.bumpMap && !m.normalMap && !m.displacementMap && !m.roughnessMap && !m.metalnessMap && !m.envMap && !m.specularMap;
    const bins = new Map<string, { mat: THREE.Material; cast: boolean; recv: boolean; list: { o: THREE.Mesh; M: THREE.Matrix4 }[] }>();
    g.traverse((o: any) => {
      if (!o.isMesh || skip.has(o) || o.isInstancedMesh || o.isBatchedMesh || o.isSkinnedMesh || o.morphTargetInfluences || o.renderOrder || !o.visible || Array.isArray(o.material) || o.hasOwnProperty('onBeforeRender')) return;
      for (let p = o.parent; p && p !== g; p = p.parent) if (!p.visible) return;
      const m = o.material, geo = o.geometry as THREE.BufferGeometry;
      if (m.transparent || m.alphaTest || m.hasOwnProperty('onBeforeCompile') || m.blending !== T.NormalBlending || !m.depthWrite || !m.depthTest || m.wireframe || m.polygonOffset || !noTex(m) || !m.visible || m.userData.own) return;
      if (!(m.isMeshStandardMaterial && !m.isMeshPhysicalMaterial) && !m.isMeshBasicMaterial) return;
      if (!geo.attributes.position || geo.drawRange.count !== Infinity || Object.keys(geo.attributes).some((k) => !PBR_ATT.has(k) || (geo.attributes[k] as any).isInterleavedBufferAttribute)) return;
      const std = !!m.isMeshStandardMaterial, mat = pbrMat(std ? 'std' : 'basic', m.side, std && !!m.flatShading, std ? m.envMapIntensity : 1, m.fog);
      const key = mat.uuid + +o.castShadow + +o.receiveShadow;
      let b = bins.get(key); if (!b) bins.set(key, (b = { mat, cast: o.castShadow, recv: o.receiveShadow, list: [] }));
      b.list.push({ o, M: new T.Matrix4().multiplyMatrices(inv, o.matrixWorld) });
    });
    const gone = new Set<THREE.Mesh>(); let made = 0;
    for (const b of bins.values()) {
      if (b.list.length < 2) continue;
      const std = !!(b.mat as any).isMeshStandardMaterial;
      let n = 0; const flat = b.list.map(({ o, M }) => { const ng = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone(); if (!ng.attributes.normal && std) ng.computeVertexNormals(); n += ng.attributes.position.count; return { o, M, ng }; });
      const pos = new Float32Array(n * 3), nrm = std ? new Float32Array(n * 3) : null, col = new Float32Array(n * 3), pbr = std ? new Float32Array(n * 2) : null, emi = std ? new Float32Array(n * 3) : null;
      const v = new T.Vector3(), c = new T.Color(), e = new T.Color(); let off = 0;
      for (const { o, M, ng } of flat) {
        const m = o.material as any, P = ng.attributes.position, Nn = ng.attributes.normal, C = ng.attributes.color, cnt = P.count, mir = M.determinant() < 0;
        N.getNormalMatrix(M); c.copy(m.color);
        if (std) e.copy(m.emissive).multiplyScalar(m.emissiveIntensity ?? 1);
        for (let i = 0; i < cnt; i++) {
          const j = mir ? (i % 3 === 1 ? i + 1 : i % 3 === 2 ? i - 1 : i) : i, w = off + i; // (mirrored: each triangle wound back the right way round)
          v.fromBufferAttribute(P, j).applyMatrix4(M); pos[w * 3] = v.x; pos[w * 3 + 1] = v.y; pos[w * 3 + 2] = v.z;
          if (nrm && Nn) { v.fromBufferAttribute(Nn, j).applyMatrix3(N).normalize(); nrm[w * 3] = v.x; nrm[w * 3 + 1] = v.y; nrm[w * 3 + 2] = v.z; }
          let r = c.r, gg = c.g, bb = c.b; if (C && m.vertexColors) { r *= C.getX(j); gg *= C.getY(j); bb *= C.getZ(j); }
          col[w * 3] = r; col[w * 3 + 1] = gg; col[w * 3 + 2] = bb;
          if (pbr && emi) { pbr[w * 2] = m.roughness; pbr[w * 2 + 1] = m.metalness; emi[w * 3] = e.r; emi[w * 3 + 1] = e.g; emi[w * 3 + 2] = e.b; }
        }
        off += cnt; ng.dispose(); gone.add(o);
      }
      const out = new T.BufferGeometry(); out.setAttribute('position', new T.BufferAttribute(pos, 3)); out.setAttribute('color', new T.BufferAttribute(col, 3));
      if (nrm) out.setAttribute('normal', new T.BufferAttribute(nrm, 3)); if (pbr) out.setAttribute('aPbr', new T.BufferAttribute(pbr, 2)); if (emi) out.setAttribute('aEmi', new T.BufferAttribute(emi, 3));
      out.computeBoundingSphere(); out.computeBoundingBox();
      const mesh = new T.Mesh(out, b.mat); mesh.castShadow = b.cast; mesh.receiveShadow = b.recv; mesh.matrixAutoUpdate = false; mesh.name = 'compact'; g.add(mesh); made++;
    }
    // and the added light (engines' plumes, glows: additive, not writing depth, so in any order it's the same), alike ones in one mesh
    // with the first one's material: by what they look like and their draw order
    const adds = new Map<string, { o: THREE.Mesh; M: THREE.Matrix4 }[]>();
    g.traverse((o: any) => {
      if (!o.isMesh || skip.has(o) || gone.has(o) || o.isInstancedMesh || o.isBatchedMesh || o.isSkinnedMesh || o.morphTargetInfluences || !o.visible || Array.isArray(o.material) || o.hasOwnProperty('onBeforeRender')) return;
      for (let p = o.parent; p && p !== g; p = p.parent) if (!p.visible) return;
      const m = o.material, geo = o.geometry as THREE.BufferGeometry;
      if (!m.isMeshBasicMaterial || m.blending !== T.AdditiveBlending || m.depthWrite || m.map || m.alphaMap || m.hasOwnProperty('onBeforeCompile') || m.vertexColors || !m.visible) return;
      if (!geo.attributes.position || geo.drawRange.count !== Infinity || Object.keys(geo.attributes).some((k) => !PBR_ATT.has(k) || k === 'color')) return;
      const key = m.color.getHexString() + '|' + m.opacity + '|' + m.side + '|' + m.transparent + '|' + m.depthTest + '|' + m.fog + '|' + o.renderOrder;
      let l = adds.get(key); if (!l) adds.set(key, (l = [])); l.push({ o, M: new T.Matrix4().multiplyMatrices(inv, o.matrixWorld) });
    });
    for (const l of adds.values()) {
      if (l.length < 2) continue;
      const parts = l.map(({ o, M }) => { const ng = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone(); ng.applyMatrix4(M); return ng; });
      let n = 0; for (const q of parts) n += q.attributes.position.count;
      const pos = new Float32Array(n * 3); let off = 0; for (const q of parts) { pos.set(q.attributes.position.array as Float32Array, off * 3); off += q.attributes.position.count; q.dispose(); }
      const out = new T.BufferGeometry(); out.setAttribute('position', new T.BufferAttribute(pos, 3)); out.computeBoundingSphere();
      const mesh = new T.Mesh(out, l[0].o.material); mesh.renderOrder = l[0].o.renderOrder; mesh.matrixAutoUpdate = false; mesh.name = 'compact+'; g.add(mesh); made++;
      for (const { o } of l) gone.add(o);
    }
    // what went in: out of the model (its geometry thrown away unless something left still has it)
    for (const o of gone) o.removeFromParent();
    const used = new Set<THREE.BufferGeometry>(); g.traverse((o: any) => { if (o.geometry) used.add(o.geometry); });
    for (const o of gone) if (!used.has(o.geometry)) o.geometry.dispose();
    return { merged: gone.size, meshes: made };
  }

  // a faceted solid lofted through stations down her length: each a ring of [x, y] at a z (the same count in each), the ends capped
  function loft(st: { z: number; pts: number[][] }[], m: THREE.Material, mirror = false) {
    const pos: number[] = [], sx = mirror ? -1 : 1, v = (k: number, i: number) => [st[k].pts[i][0] * sx, st[k].pts[i][1], st[k].z];
    const tri = (a: number[], b: number[], c: number[]) => pos.push(...a, ...b, ...c);
    const n = st[0].pts.length;
    for (let k = 0; k + 1 < st.length; k++) for (let i = 0; i < n; i++) { const a = v(k, i), b = v(k, (i + 1) % n), c = v(k + 1, (i + 1) % n), d = v(k + 1, i); tri(a, b, c); tri(a, c, d); }
    for (const k of [0, st.length - 1]) for (let i = 1; i + 1 < n; i++) tri(v(k, 0), v(k, i), v(k, i + 1));
    const g = new T.BufferGeometry(); g.setAttribute('position', new T.Float32BufferAttribute(pos, 3)); g.computeVertexNormals();
    const mesh = new T.Mesh(g, m); mesh.frustumCulled = false; return mesh;
  }
  // ---- the squad's ship, in her own frame (x to starboard, y up, -z forward; y 0 the ground she stands on). A breaching
  // craft: a ram prow round the airlock with a toothed collar on its end, armour sloped out under a visor slit and in over
  // it, engine pods swept back on pylons. Her deck inside is js/spacedata.ts boxes: what's drawn there is what stops you.
  const PAINT: Record<string, number[]> = { kestrel: [0x77828e, 0x39424c, 0xff7a1a], atlas: [0x6f7868, 0x3a4136, 0xe8c040], wraith: [0x2c323c, 0x191c22, 0x4ad8ff] };
  // ---- The squad's ship as made in Blender (models/ships/build_ship.py, from her layout; checked and baked by tools/bake_ships.mjs
  // into assets/models/ships/<id>.glb, in the models' bundle). Loaded behind the menu (boot); till it's in, or for a ship that
  // has none, she's drawn by the recipe below (shipRecipe), from the same layout. The file is dressed in the game's own
  // materials, by name (her paint, the lit strips, the glass), and what moves or is fitted is found by its node's name
  // (docs/models.md "The squad's ship").
  const MODELS = new Map<string, THREE.Object3D>();
  function boot() {
    for (const id of Object.keys(SpaceData.SHIPS)) Models.loadFile('assets/models/ships/' + id + '.glb').then((sc: any) => { if (sc) MODELS.set(id, sc); }, () => { /* (none made for her yet: the recipe) */ });
  }
  function ship(d: SpShipDef, fleet: SpFleet): SmShip {
    const src = MODELS.get(d.id), r = src ? fromModel(src, d, fleet) : shipRecipe(d, fleet);
    GunAo.apply(r.group, 'ship:' + d.id + ':' + (src ? 'm' : 'r'), GunAo.SHIP, [r.nose, [r.ramp]]); // (layers 1 and 2: the breach door's leaves and the ramp, js/space.ts doors sets how far each is shut) // (her own occlusion, inside and out: js/gunao.ts)
    return r;
  }
  function fromModel(src: THREE.Object3D, d: SpShipDef, fleet: SpFleet): SmShip {
    const SD = SpaceData, L = SD.layout(d), g = new T.Group();
    const [c0, c1, c2] = PAINT[d.id] || PAINT.kestrel, DS = { side: T.DoubleSide, flatShading: true };
    const glow = lit(0x2a8a5a), hot = lit(c2), thrust = new T.MeshBasicMaterial({ color: 0x66c8ff, transparent: true, opacity: 0.0, side: T.DoubleSide, depthWrite: false, blending: T.AdditiveBlending });
    const mats: Record<string, THREE.Material> = {
      hull: M(c0, Object.assign({ emissive: 0x101316, metalness: 0.45, roughness: 0.55 }, DS)), armor: M(c1, Object.assign({ emissive: 0x08090b, metalness: 0.55, roughness: 0.5 }, DS)), accent: M(c2, { emissive: new T.Color(c2).multiplyScalar(0.35).getHex(), flatShading: true }),
      deck: M(0x2b2f34, { roughness: 0.85, emissive: 0x08090a, flatShading: true }), inner: M(0x5d656e, { emissive: 0x15181b, flatShading: true }), dark: M(0x15171a, { metalness: 0.5, flatShading: true }), seat: M(0x3d444d, { emissive: 0x101216, flatShading: true }),
      glass: new T.MeshStandardMaterial({ color: 0x7fd0ff, transparent: true, opacity: 0.07, roughness: 0.05, metalness: 0.1, depthWrite: false, side: T.DoubleSide, emissive: 0x01070a, envMapIntensity: 0.25 }),
      glow, strip: lit(0xdff2ff), hot,
    };
    const scr = canvasTex(512, 320, (c, cw2, ch) => { c.fillStyle = '#04080c'; c.fillRect(0, 0, cw2, ch); }), nav = canvasTex(320, 200, (c, cw2, ch) => { c.fillStyle = '#04080c'; c.fillRect(0, 0, cw2, ch); });
    const root = src.clone(true), seats: THREE.MeshStandardMaterial[][] = []; g.add(root);
    root.traverse((o: any) => {
      if (!o.isMesh) return;
      const name = String(o.material && o.material.name || '').replace(/\.\d+$/, '');
      o.material = o.name === 'screen_nav' || o.parent?.name === 'screen_nav' ? new T.MeshBasicMaterial({ map: nav.tex }) : o.name === 'screen_sensors' || o.parent?.name === 'screen_sensors' ? new T.MeshBasicMaterial({ map: scr.tex }) : mats[name] || mats.inner;
      // (a seat's own: lit when it's the one looked at, js/space.ts seatLit)
      const sm = /^seat_(\d+)$/.exec(o.name) || /^seat_(\d+)$/.exec(String(o.parent && o.parent.name)); if (sm) { const m = (o.material as THREE.MeshStandardMaterial).clone(); o.material = m; (seats[+sm[1]] = seats[+sm[1]] || []).push(m); }
    });
    const node = (n: string) => root.getObjectByName(n)!;
    // the breaching door's leaves (the game slides them apart: js/space.ts doors), the ramp (turned down to the ground behind her)
    const nose = (['nose_L', 'nose_R'] as const).map((n, i) => { const lf = node(n); lf.userData.s = i ? 1 : -1; return lf as THREE.Group; });
    const ramp = node('ramp') as THREE.Group; ramp.userData.open = Math.acos(-L.FM / (L.CM - L.FM));
    // the drive's glow at each exhaust: a disc and a cone of light aft
    for (const n of ['thrust_L', 'thrust_R']) {
      const e = node(n), disc = new T.Mesh(new T.CircleGeometry(0.5, 10), thrust); disc.position.copy(e.position); g.add(disc);
      const cone = new T.Mesh(new T.ConeGeometry(0.48, 4.2, 10, 1, true), thrust); cone.position.copy(e.position).add(new T.Vector3(0, 0, 2.1)); cone.rotation.x = Math.PI / 2; g.add(cone);
    }
    // a turret on each hardpoint that has a gun (laid from the gunners' seats)
    const fit = fleet.fit[d.id] || [], turrets: SmShip['turrets'] = [];
    for (let i = 0; i < d.turrets; i++) {
      const base = new T.Group(), gun = new T.Group(), muzzle = new T.Object3D(), e = fit[i] ? SD.EQUIP[fit[i]!] : null;
      base.position.copy(node('hp_' + i).position);
      part(base, new T.Mesh(new T.CylinderGeometry(0.36, 0.46, 0.2, 8), mats.armor), 0, 0.1, 0);
      if (e) {
        part(gun, new T.Mesh(new T.BoxGeometry(0.44, 0.3, 0.7), mats.hull), 0, 0.17, 0);
        const long = e.id === 'rail';
        for (const sx of long ? [0] : [-0.11, 0.11]) { const b = part(gun, new T.Mesh(new T.CylinderGeometry(long ? 0.07 : 0.04, long ? 0.07 : 0.04, long ? 2.4 : 1.3, 8), mats.dark), sx, 0.2, long ? -1.4 : -0.9); b.rotation.x = Math.PI / 2; }
        muzzle.position.set(0, 0.2, long ? -2.6 : -1.6); gun.add(muzzle);
        gun.position.y = 0.2; base.add(gun);
      }
      g.add(base); turrets.push({ base, gun, muzzle });
    }
    // her own light, the same wherever she is: the cockpit, the breach deck, the crew deck
    const lights = [[3, 0xbfe0ff], [3.5, 0xdfeaff], [4.5, 0xdfeaff]].map(([k, c], i) => { const l = new T.PointLight(c, k, 7, 1.6); l.position.copy(node('light_' + i).position); g.add(l); return l; });
    return { group: g, nose, ramp, turrets, thrust, glow, screen: scr, nav, lights, seats };
  }
  function shipRecipe(d: SpShipDef, fleet: SpFleet): SmShip {
    const SD = SpaceData, L = SD.layout(d), { fw, tw, sw, hw, zc, zt, zw, zk, zr, z1, FC, FB, FM, CC, CB, CM } = L, W = 0.22, g = new T.Group(), K = new Kit(), X = hw + W, top = CB + 0.2;
    const [c0, c1, c2] = PAINT[d.id] || PAINT.kestrel, DS = { side: T.DoubleSide, flatShading: true };
    const hull = M(c0, Object.assign({ emissive: 0x101316, metalness: 0.45, roughness: 0.55 }, DS)), armor = M(c1, Object.assign({ emissive: 0x08090b, metalness: 0.55, roughness: 0.5 }, DS)), accent = M(c2, { emissive: new T.Color(c2).multiplyScalar(0.35).getHex() });
    const deck = M(0x2b2f34, { roughness: 0.85, emissive: 0x08090a }), inner = M(0x5d656e, { emissive: 0x15181b }), dark = M(0x15171a, { metalness: 0.5 }), seatM = M(0x3d444d, { emissive: 0x101216 });
    const glass = new T.MeshStandardMaterial({ color: 0x7fd0ff, transparent: true, opacity: 0.07, roughness: 0.05, metalness: 0.1, depthWrite: false, side: T.DoubleSide, emissive: 0x01070a, envMapIntensity: 0.25 });
    const glow = lit(0x2a8a5a), strip = lit(0xdff2ff), hot = lit(c2), thrust = new T.MeshBasicMaterial({ color: 0x66c8ff, transparent: true, opacity: 0.0, side: T.DoubleSide, depthWrite: false, blending: T.AdditiveBlending });
    // the cockpit's glass: across its front over a low sill, and down each side for its first three metres
    // (glazed floor to ceiling: across the front, its corners cut back so the view wraps round, down both sides past the sensor station, and the deck
    // ahead of the helm's seat glass too)
    const SILL = FC, HEADER = CC - 0.06, zg0 = zc + 0.77, zg1 = zc + 3.1, zf = zc + 1.08, fc = fw - 0.45;
    // ---- inside: every solid of hers is drawn as it stands (decks and stairs in the deck's grey, walls and roofs lighter), bar
    // the cockpit's glazed walls (below), the doors and the steps off the ramp (their own)
    const glazed = (b: (number | string | undefined)[]) => b[1] === FC && b[4] === CC && b[2] === zc + 0.3;
    for (const b of SD.boxes(d)) {
      if (b[6] || glazed(b) || (b[2] === zc + 0.3 && (b[4] === FC || b[4] === FC + 0.55))) continue; // (and what keeps you off the glass's foot: behind it)
      const flat = b[4] - b[1] <= 0.36 || (b[1] === 0 && b[4] <= FB + 0.01 && b[3] - b[0] < 2 * fw);
      K.box(flat ? deck : inner, b[0], b[1], b[2], b[3], b[4], b[5]);
    }
    // the cockpit's glazing: every pane leans in toward its foot, 0.3 m, the canopy's outline at the header drawn in at the deck; posts at its corners
    const IN = 0.3, crown = [[-fw, zg1], [-fw, zg0], [-fc, zc + 0.33], [fc, zc + 0.33], [fw, zg0], [fw, zg1]], foot = [[-fw + IN, zg1], [-fw + IN, zg0 + 0.12], [-fc + 0.12, zc + 0.33 + IN], [fc - 0.12, zc + 0.33 + IN], [fw - IN, zg0 + 0.12], [fw - IN, zg1]];
    const quad = (a: number[], b: number[], c: number[], d: number[], m: THREE.Material) => { const geo = new T.BufferGeometry(); geo.setAttribute('position', new T.Float32BufferAttribute([...a, ...b, ...c, ...a, ...c, ...d], 3)); geo.computeVertexNormals(); const me = new T.Mesh(geo, m); g.add(me); return me; };
    const post = (a: number[], b: number[]) => { const va = new T.Vector3(a[0], a[1], a[2]), vb = new T.Vector3(b[0], b[1], b[2]), m = new T.Mesh(new T.CylinderGeometry(0.035, 0.035, va.distanceTo(vb), 6), dark); m.position.copy(va).add(vb).multiplyScalar(0.5); m.quaternion.setFromUnitVectors(new T.Vector3(0, 1, 0), vb.clone().sub(va).normalize()); g.add(m); };
    for (let i = 0; i < crown.length - 1; i++) quad([foot[i][0], SILL, foot[i][1]], [foot[i + 1][0], SILL, foot[i + 1][1]], [crown[i + 1][0], HEADER, crown[i + 1][1]], [crown[i][0], HEADER, crown[i][1]], glass);
    for (let i = 1; i < crown.length - 1; i++) post([foot[i][0], SILL, foot[i][1]], [crown[i][0], HEADER, crown[i][1]]);
    for (const i of [0, 5]) post([foot[i][0], SILL, foot[i][1]], [crown[i][0], HEADER, crown[i][1]]);
    K.box(deck, -fw + IN, 0, zf, fw - IN, FC, zg1); K.box(deck, -fw - 0.2, 0, zg1, fw + 0.2, FC, zr); // (the deck: inside the glass's foot where it's glazed)
    part(g, new T.Mesh(new T.BoxGeometry(2 * (fw - IN), 0.03, zf - zc - 0.6), glass), 0, FC - 0.02, (zc + 0.6 + zf) / 2); // (the glass deck ahead of the seat)
    K.box(dark, -fw, HEADER, zc + 0.3, fw, CC, zc + 0.36);
    // (the front's posts and panes: above)
    void fc;
    for (const s of [-1, 1]) {
      const a = s * fw, b = s * (fw + W);
      K.box(inner, a, SILL, zg1, b, CC, zk); K.box(dark, a, HEADER, zg0, b, CC, zg1); // (the wall behind the side glass, its header)
      for (const zm of [zc + 1.9]) post([s * (fw - IN), SILL, zm], [s * fw, HEADER, zm]); // (a post beside the sensor station)
      void a; void b;
    }
    // ---- the cockpit's fittings: the helm's console under the glass (the navigation screen on it), the sensor station's screen
    // on the wall at its right hand (js/space.ts draws the deck plan on it), the seats
    const scr = canvasTex(512, 320, (c, cw2, ch) => { c.fillStyle = '#04080c'; c.fillRect(0, 0, cw2, ch); }), nav = canvasTex(320, 200, (c, cw2, ch) => { c.fillStyle = '#04080c'; c.fillRect(0, 0, cw2, ch); });
    K.box(dark, -0.82, FC, zc + 1.2, -0.74, FC + 0.75, zc + 1.28); // (the navigation screen on an arm at the pilot's left knee, clear of the glass)
    const nf = part(g, new T.Mesh(new T.PlaneGeometry(0.5, 0.32), new T.MeshBasicMaterial({ map: nav.tex })), -0.7, FC + 0.85, zc + 1.2); nf.rotation.set(-0.7, 0.55, 0, 'YXZ');
    const sf = part(g, new T.Mesh(new T.PlaneGeometry(0.62, 0.4), new T.MeshBasicMaterial({ map: scr.tex })), 0.68, FC + 1.25, zc + 2.4); sf.rotation.set(-0.35, -0.75, 0, 'YXZ'); // (the sensor station's, on an arm at its right)
    K.box(dark, 0.78, FC, zc + 2.5, 0.86, FC + 1.0, zc + 2.58);
    for (const st of SD.seats(d)) {
      const F = st.f, c = Math.cos(st.yaw), s = Math.sin(st.yaw), fx = -s, fz = -c; // (the way it faces)
      const sx = st.x - fx * 0.05, sz = st.z - fz * 0.05, h = st.k === 'jump' ? 0.2 : 0.25, up = st.y - F - 0.26;
      if (up > 0.02) K.box(dark, sx - 0.3, F, sz - 0.3, sx + 0.3, F + up, sz + 0.3);
      K.box(seatM, sx - h, F + up + 0.4, sz - h, sx + h, F + up + 0.48, sz + h);
      K.box(seatM, sx - fx * 0.26 - Math.abs(fz) * h - Math.abs(fx) * 0.04, F + up + 0.48, sz - fz * 0.26 - Math.abs(fx) * h - Math.abs(fz) * 0.04, sx - fx * 0.26 + Math.abs(fz) * h + Math.abs(fx) * 0.04, F + up + (st.k === 'jump' ? 1.1 : 1.3), sz - fz * 0.26 + Math.abs(fx) * h + Math.abs(fz) * 0.04);
      if (st.k !== 'jump') K.box(dark, sx - 0.06, F + up, sz - 0.06, sx + 0.06, F + up + 0.4, sz + 0.06);
      if (st.k === 'turret') K.box(hot, sx - 0.2, F + up + 0.75, sz - 0.42, sx + 0.2, F + up + 0.79, sz - 0.3); // (the gunner's sight: the gun's on the roof)
    }
    // ---- the breach deck: lit strips down the tunnel's floor to the door, a hazard line at the low wall, lights overhead
    for (const sx of [-0.55, 0.55]) K.box(hot, sx - 0.03, FB, zc + 0.2, sx + 0.03, FB + 0.01, zt);
    K.box(hot, -L.lw, FB + 1.0, zw - 0.01, L.lw, FB + 1.03, zw + 0.26);
    for (const sx of [-0.4, 0.4]) { K.box(strip, sx - 0.05, CB - 0.02, zc + 0.3, sx + 0.05, CB, zk - 0.3); K.box(strip, sx * 2.6 - 0.05, CM - 0.02, zr + 0.6, sx * 2.6 + 0.05, CM, z1 - 0.5); }
    K.box(strip, -0.3, CC - 0.02, zc + 1.0, 0.3, CC, zc + 3.6);
    // the crew deck: a lit line down each wall over the seats, her colour along the floor's edge
    for (const s of [-1, 1]) { K.box(glow, s * (hw - 0.02), CM - 0.6, zr + 0.6, s * hw, CM - 0.56, z1 - 0.4); K.box(hot, s * (hw - 0.02), FM + 0.06, zr + 0.4, s * hw, FM + 0.09, z1 - 0.4); }
    // ---- outside. The nose: a wedge under the cockpit's glass; the cockpit's sides and the breach deck over it, plated; the
    // tunnel narrower, out to the collar; the crew deck aft, wider and lower, armour sloped down her flanks to a chine
    const O = 0.03;
    // (no chin: the glass deck looks straight down)
    g.add(loft([{ z: zc + 0.32, pts: [[-fw - W, HEADER], [fw + W, HEADER], [fw + W, CC + 0.2], [-fw - W, CC + 0.2]] }, { z: zc + 0.05, pts: [[-fw - W + 0.1, CC], [fw + W - 0.1, CC], [fw + W, CC + 0.2], [-fw - W, CC + 0.2]] }], armor)); // (a brow over the glass)
    for (const s of [-1, 1]) {
      const mir = s < 0, x = fw + W + O;
      K.box(hull, s * x, 0.02, zg1, s * (x + 0.04), CC + 0.2, zr); K.box(hull, s * x, HEADER, zg0, s * (x + 0.04), CC + 0.2, zg1);
      // the breach deck's sides: the tunnel's, then the wider space behind it (its underside overhangs the cockpit)
      K.box(hull, s * (tw + W + O), CC, zc, s * (tw + W + O + 0.04), top, zt); K.box(hull, s * (sw + W + O), CC, zt, s * (sw + W + O + 0.04), top, zk);
      K.box(armor, s * (fw + W), CC, zt, s * (sw + W + O), CC + 0.05, zk);
      K.box(hull, s * (fw + W + O), CC, zk, s * (fw + W + O + 0.04), top, zr);
      // the crew deck's flank, and armour sloped out from the keel to a chine below the seats
      K.box(hull, s * (X + O), FM - 0.2, zr, s * (X + O + 0.04), CM + 0.2, z1 + 0.1);
      g.add(loft([{ z: zr - 0.2, pts: [[fw + W, 0.04], [fw + W + 0.2, 0.04], [X + 0.2, FM - 0.3], [X, FM]] }, { z: zr + 1.6, pts: [[X - 0.4, 0.04], [X + 0.2, 0.04], [X + 0.75, FM - 0.25], [X, FM + 0.1]] }, { z: z1 - 1.0, pts: [[X - 0.4, 0.04], [X + 0.25, 0.04], [X + 0.85, FM - 0.25], [X, FM + 0.1]] }, { z: z1 + 0.6, pts: [[X - 0.4, 0.3], [X, 0.3], [X + 0.4, FM - 0.2], [X, FM]] }], armor, mir));
      K.box(hot, s * (X + 0.8), FM - 0.33, zr + 1.8, s * (X + 0.84), FM - 0.29, z1 - 1.2); // (a line of her colour down the chine)
      // a fairing from the breach deck's shoulders down onto the crew deck's roof
      g.add(loft([{ z: zk - 0.4, pts: [[sw + W, top], [sw + W, CC], [sw + W + 0.05, CC]] }, { z: zr + 2.2, pts: [[fw + W + 0.3, CM + 0.2], [X, CM + 0.2], [X, CM + 0.2]] }], hull, mir));
      // an engine pod on a swept pylon either side aft: a spike at its intake, a ring and a lit throat at the back
      const px = X + 1.6, py = FM + 0.2, pz0 = z1 - 3.4, pz1 = z1 + 1.7, hex = (r: number, cx = px, cy = py) => [0, 1, 2, 3, 4, 5].map((k) => [cx + Math.cos(k * Math.PI / 3 + Math.PI / 6) * r, cy + Math.sin(k * Math.PI / 3 + Math.PI / 6) * r * 1.05]);
      g.add(loft([{ z: pz0 - 2.0, pts: hex(0.06, px - 0.25, py - 0.1) }, { z: pz0, pts: hex(0.62) }, { z: pz1 - 1.2, pts: hex(0.78) }, { z: pz1, pts: hex(0.66) }], armor, mir));
      // the flank pinches out into a wing to the pod: the crew deck's whole side at its root, thin at the pod, swept
      g.add(loft([{ z: zr + 0.4, pts: [[X, FM - 0.1], [X + 0.25, FM + 0.12], [X + 0.32, FM + 0.24], [X + 0.32, FM + 0.32], [X + 0.25, FM + 0.45], [X, CM]] }, { z: pz0 - 0.3, pts: [[X, 0.35], [px - 0.5, py - 0.15], [px, py - 0.08], [px, py + 0.1], [px - 0.5, py + 0.2], [X, CM + 0.1]] }, { z: pz1 - 0.6, pts: [[X, 0.4], [px - 0.5, py - 0.15], [px, py - 0.08], [px, py + 0.1], [px - 0.5, py + 0.2], [X, CM]] }, { z: z1 + 0.35, pts: [[X, 0.7], [px - 0.7, py - 0.1], [px - 0.25, py - 0.05], [px - 0.25, py + 0.06], [px - 0.7, py + 0.12], [X, CM - 0.3]] }], hull, mir));
      const ring = part(g, new T.Mesh(new T.TorusGeometry(0.62, 0.1, 6, 6), accent), s * px, py, pz1 + 0.02); ring.rotation.z = Math.PI / 6;
      part(g, new T.Mesh(new T.CircleGeometry(0.55, 6), thrust), s * px, py, pz1 + 0.05).rotation.z = Math.PI / 6;
      part(g, new T.Mesh(new T.CircleGeometry(0.5, 6), dark), s * px, py, pz1 - 0.02).rotation.z = Math.PI / 6;
      const cone = part(g, new T.Mesh(new T.ConeGeometry(0.5, 4.2, 6, 1, true), thrust), s * px, py, pz1 + 2.15); cone.rotation.x = Math.PI / 2;
      // a canted tail fin off the roof's edge, a running light at its tip
      g.add(loft([{ z: z1 - 2.6, pts: [[X - 0.5, CM + 0.2], [X - 0.3, CM + 0.2], [X - 0.4, CM + 0.28]] }, { z: z1 + 0.6, pts: [[X - 0.5, CM + 0.2], [X - 0.3, CM + 0.2], [X + 0.3, CM + 1.5]] }], armor, mir));
      K.box(s < 0 ? lit(0xff3030) : lit(0x30ff60), s * (X + 0.25), CM + 1.42, z1 + 0.5, s * (X + 0.35), CM + 1.52, z1 + 0.6);
    }
    // the roofs: the breach deck's, a spine down the crew deck's, her belly
    K.box(armor, -tw - W - O, top, zc, tw + W + O, top + 0.06, zt); K.box(armor, -sw - W - O, top, zt, sw + W + O, top + 0.06, zk); K.box(armor, -fw - W - O, top, zk, fw + W + O, top + 0.06, zr);
    K.box(hull, -X - O, CM + 0.2, zr, X + O, CM + 0.25, z1 + 0.1);
    g.add(loft([{ z: zr - 0.1, pts: [[-0.8, CM + 0.25], [0.8, CM + 0.25], [0.5, top + 0.05], [-0.5, top + 0.05]] }, { z: z1 - 1, pts: [[-0.75, CM + 0.25], [0.75, CM + 0.25], [0.45, CM + 0.7], [-0.45, CM + 0.7]] }, { z: z1 + 0.6, pts: [[-0.6, CM + 0.25], [0.6, CM + 0.25], [0.3, CM + 0.45], [-0.3, CM + 0.45]] }], armor));
    K.box(dark, -fw - W, -0.03, zf, fw + W, 0.02, zr); K.box(dark, -X, -0.03, zr, X, 0.02, z1 + 0.1);
    // the collar: an eight-sided ring round the breaching door, lit, the tunnel's mouth plated round inside it
    const cy = FB + (CB - FB) / 2 + 0.08, col = part(g, new T.Mesh(new T.TorusGeometry(1.28, 0.12, 6, 8), accent), 0, cy, zc - 0.1); col.rotation.z = Math.PI / 8; col.scale.set(0.95, 0.92, 1); // (no lower than the breach deck's floor: clear of the windscreen under it)
    const col2 = part(g, new T.Mesh(new T.TorusGeometry(1.12, 0.05, 5, 8), hot), 0, cy, zc - 0.2); col2.rotation.z = Math.PI / 8; col2.scale.set(0.95, 0.92, 1);
    K.build(g);
    // the breaching door: two leaves that part sideways into the tunnel's walls
    const nose = [-1, 1].map((s) => {
      const lf = new T.Group(), hgt = CB - FB;
      const m = new T.Mesh(new T.BoxGeometry(tw, hgt, 0.16), armor); m.position.set(s * tw / 2, FB + hgt / 2, 0); lf.add(m);
      const st2 = new T.Mesh(new T.BoxGeometry(0.06, hgt, 0.18), hot); st2.position.set(s * 0.04, FB + hgt / 2, 0); lf.add(st2);
      lf.position.set(0, 0, zc - W / 2); lf.userData.s = s; g.add(lf); return lf;
    });
    // the ramp: hinged at the crew deck's floor, it comes down to the ground behind her (open: as far as that takes)
    const ramp = new T.Group(); ramp.position.set(0, FM, z1 + W / 2); g.add(ramp);
    const rh = CM - FM, rm = new T.Mesh(new T.BoxGeometry(2 * hw, rh, 0.14), armor); rm.position.set(0, rh / 2, 0); ramp.add(rm);
    for (const ry of [0.5, 1.2, 1.9]) { const rs = new T.Mesh(new T.BoxGeometry(2 * hw - 0.6, 0.06, 0.02), hot); rs.position.set(0, ry, -0.08); ramp.add(rs); }
    ramp.userData.open = Math.acos(-FM / rh);
    // the hardpoints: one on each of her roof's shoulders, aft (port first); a turret on each that has a gun, laid from the cockpit
    const fit = fleet.fit[d.id] || [], turrets: SmShip['turrets'] = [];
    for (let i = 0; i < d.turrets; i++) {
      const base = new T.Group(), gun = new T.Group(), muzzle = new T.Object3D(), e = fit[i] ? SD.EQUIP[fit[i]!] : null;
      base.position.set((i ? 1 : -1) * (hw - 0.7), CM + 0.25, zr + 1.6);
      part(base, new T.Mesh(new T.CylinderGeometry(0.36, 0.46, 0.2, 8), armor), 0, 0.1, 0);
      if (e) {
        part(gun, new T.Mesh(new T.BoxGeometry(0.44, 0.3, 0.7), hull), 0, 0.17, 0);
        const long = e.id === 'rail';
        for (const sx of long ? [0] : [-0.11, 0.11]) { const b = part(gun, new T.Mesh(new T.CylinderGeometry(long ? 0.07 : 0.04, long ? 0.07 : 0.04, long ? 2.4 : 1.3, 8), dark), sx, 0.2, long ? -1.4 : -0.9); b.rotation.x = Math.PI / 2; }
        muzzle.position.set(0, 0.2, long ? -2.6 : -1.6); gun.add(muzzle);
        gun.position.y = 0.2; base.add(gun);
      }
      g.add(base); turrets.push({ base, gun, muzzle });
    }
    // her own light, the same wherever she is: the cockpit, the breach deck, the crew deck
    const lights = [[CC - 0.3, zc + 2.2, 3, 0xbfe0ff], [CB - 0.3, zw, 3.5, 0xdfeaff], [CM - 0.35, (zr + z1) / 2, 4.5, 0xdfeaff]].map(([y, z, k, c]) => { const l = new T.PointLight(c, k, 7, 1.6); l.position.set(0, y, z); g.add(l); return l; });
    return { group: g, nose, ramp, turrets, thrust, glow, screen: scr, nav, lights };
  }

  // ---- the outside of a ship that's boarded, from her deck plan (the level's own walls are her sides: this is what's
  // over and under them, and what each compartment shows of itself)
  function hull(map: LvMap): { group: THREE.Group; guns: SmGun[]; marker: THREE.Object3D; cutAt: (x: number, z: number, nx: number, nz: number) => void; holes: number[][] } {
    const g = new T.Group(), K = new Kit(), TS = Level.TS, { W, H, t } = map, sp = map.sp!, th = map.theme, WH = Level.WALL_H, FH = Level.FLOOR_H, NF = map.floors ? map.floors.length : 1, TOP = (NF - 1) * FH + WH;
    // Whose lines she has (her design language), by what she is: a freighter's (containers, tanks and gantries on a blunt hull), a
    // corporate cutter's (a needle bow, rounded shoulders, fins and nacelles), a pirate's (a toothed ram, scrap plates, spikes and
    // a boom, strapped-on engines, nothing matching) or a navy's (a long wedge bow, sloped armour over her roof and under her keel,
    // a citadel with masts, tail fins). Pirates' plating is dark and rusted whatever she was built as. A cruise liner (a theme with
    // liner set) is white all over, whatever her bulkheads are inside: a raked bow, rounded shoulders, a blue band at her keel with
    // a line of brass over it, a glazed roof over her court, two set-back tiers of superstructure aft of it with a band of lit
    // windows round each, a raked funnel.
    const langOf = (size: SpSize): string => (th.liner && size === 'large' ? 'liner' : size === 'transport' ? (th.name === 'Corporate cutter' ? 'cutter' : 'freighter') : size === 'large' || size === 'capital' ? 'navy' : 'pirate');
    const decor: THREE.Mesh[] = [], washes: THREE.Mesh[] = []; // (what's cut away where she's rammed: cutAt)
    const liner = langOf(sp.size) === 'liner', base = new T.Color(liner ? 0xeef0ee : th.wall as string), r = G_U.rng((map.seed ^ 0x4a11) >>> 0);
    if (langOf(sp.size) === 'pirate') base.multiplyScalar(0.62).lerp(new T.Color(0x5a3222), 0.3);
    const shade = (k: number, o?: Record<string, any>) => M(base.clone().multiplyScalar(k).getHex(), Object.assign({ emissive: base.clone().multiplyScalar(k * (liner ? 0.42 : 0.16)).getHex() }, o || {})); // (a liner's white: it has to read as white out in the dark)
    const plate = shade(liner ? 0.86 : 0.62), dark = liner ? shade(0.74, { metalness: 0.15 }) : shade(0.36, { metalness: 0.5 }), light = shade(liner ? 0.96 : 0.85), trim = M(0xb8862a, { emissive: 0x2a1c06 }), win = lit(0xffe2a8), nav = lit(0xff4030), eng = lit(0x7fd0ff);
    const solid = (x: number, z: number) => x >= 0 && z >= 0 && x < W && z < H && t[z * W + x] !== 5;
    // the belly: under every run of cells that's part of a hull (a row at a time)
    for (let z = 0; z < H; z++) for (let x = 0; x < W;) {
      if (!solid(x, z)) { x++; continue; }
      let x1 = x; while (solid(x1 + 1, z)) x1++;
      K.box(plate, x * TS - 0.02, -1.0, z * TS, (x1 + 1) * TS + 0.02, -0.03, (z + 1) * TS);
      x = x1 + 1;
    }
    // belts of armour along her sides, standing proud of the wall: under her lowest deck, between the windows of one deck
    // and the next, over the top one's (clear of the deck's own height: she can be breached anywhere along it)
    const belt = (x0: number, z0: number, x1: number, z1: number) => {
      K.box(dark, x0, -1.0, z0, x1, -0.02, z1);
      for (let f = 0; f < NF; f++) K.box(dark, x0, f * FH + 2.92, z0, x1, f === NF - 1 ? TOP + 0.5 : (f + 1) * FH + 0.72, z1);
    };
    // Her lights, outside: a line of light along the top of each side and a dim red one along her keel, floodlamps under the
    // upper belt every few metres washing the plating below them, and her navigation lights (red to port, green to starboard,
    // white at her ends and over her back). The wash is drawn, not cast: a lamp's cone of light painted on the wall under it.
    const runL = lit(0x9fd8ff), keelL = lit(0xc0302a), lampL = lit(0xffe9c0), port = lit(0xff3528), stbd = lit(0x30ff60), white = lit(0xffffff);
    const washM = new T.MeshBasicMaterial({ map: canvasTex(64, 64, (c, w, h) => { const gr = c.createRadialGradient(w / 2, 0, 1, w / 2, h * 0.2, h * 0.95); gr.addColorStop(0, 'rgba(255,236,200,1)'); gr.addColorStop(0.35, 'rgba(255,226,180,0.45)'); gr.addColorStop(1, 'rgba(255,220,170,0)'); c.fillStyle = gr; c.fillRect(0, 0, w, h); }).tex,
      transparent: true, blending: T.AdditiveBlending, depthWrite: false, side: T.DoubleSide, opacity: 0.7 });
    const washG = new T.PlaneGeometry(3.4, 2.95);
    // (a side's run: from u0 to u1 along it, its wall's face at f, out the way (ox, oz))
    const sideLights = (alongX: boolean, u0: number, u1: number, f: number, o: number) => {
      const bx = (m: THREE.Material, a0: number, y0: number, d0: number, a1: number, y1: number, d1: number) => (alongX ? K.box(m, a0, y0, Math.min(f + o * d0, f + o * d1), a1, y1, Math.max(f + o * d0, f + o * d1)) : K.box(m, Math.min(f + o * d0, f + o * d1), y0, a0, Math.max(f + o * d0, f + o * d1), y1, a1));
      bx(runL, u0 + 0.2, TOP + 0.36, 0.28, u1 - 0.2, TOP + 0.44, 0.34);
      bx(keelL, u0 + 0.2, -0.72, 0.28, u1 - 0.2, -0.66, 0.34);
      for (let f2 = 0; f2 < NF; f2++) for (let u = u0 + 1.6; u < u1 - 1; u += 5.2) {
        bx(lampL, u - 0.3, f2 * FH + 2.8, 0.02, u + 0.3, f2 * FH + 2.9, 0.26);
        const wm = new T.Mesh(washG, washM); wm.position.set(alongX ? u : f + o * 0.03, f2 * FH + 1.42, alongX ? f + o * 0.03 : u); if (!alongX) wm.rotation.y = Math.PI / 2; wm.renderOrder = 3; g.add(wm); washes.push(wm);
      }
    };
    let bx0 = 1e9, bx1 = -1e9, bz0 = 1e9, bz1 = -1e9;
    for (let z = 0; z < H; z++) for (let x = 0; x < W; x++) if (solid(x, z)) { bx0 = Math.min(bx0, x); bx1 = Math.max(bx1, x + 1); bz0 = Math.min(bz0, z); bz1 = Math.max(bz1, z + 1); }
    if (bx1 > bx0) {
      const cx = (bx0 + bx1) / 2 * TS, cz = (bz0 + bz1) / 2 * TS, nb = (m: THREE.Material, x: number, y: number, z: number, sz = 0.3) => K.box(m, x - sz / 2, y - sz / 2, z - sz / 2, x + sz / 2, y + sz / 2, z + sz / 2);
      // (her length runs whichever way she's longer)
      const longX = bx1 - bx0 >= bz1 - bz0;
      for (const [m, sd] of [[port, -1], [stbd, 1]] as [THREE.Material, number][]) for (const k of [0.2, 0.5, 0.8]) longX ? nb(m, (bx0 + (bx1 - bx0) * k) * TS, TOP + 0.75, sd < 0 ? bz0 * TS - 0.4 : bz1 * TS + 0.4) : nb(m, sd < 0 ? bx0 * TS - 0.4 : bx1 * TS + 0.4, TOP + 0.75, (bz0 + (bz1 - bz0) * k) * TS);
      for (const e of [0, 1]) longX ? nb(white, (e ? bx1 : bx0) * TS + (e ? 0.4 : -0.4), TOP * 0.5, cz, 0.36) : nb(white, cx, TOP * 0.5, (e ? bz1 : bz0) * TS + (e ? 0.4 : -0.4), 0.36);
      nb(white, cx, TOP + 2.3, cz, 0.3); K.box(dark, cx - 0.06, TOP, cz - 0.06, cx + 0.06, TOP + 2.2, cz + 0.06);
    }
    for (let z = 0; z < H; z++) for (const dz of [-1, 1]) for (let x = 0; x < W;) {
      if (!(solid(x, z) && !solid(x, z + dz))) { x++; continue; }
      let x1 = x; while (solid(x1 + 1, z) && !solid(x1 + 1, z + dz)) x1++;
      const zf = dz < 0 ? z * TS : (z + 1) * TS; belt(x * TS - 0.3, zf + (dz < 0 ? -0.3 : 0), (x1 + 1) * TS + 0.3, zf + (dz < 0 ? 0 : 0.3)); sideLights(true, x * TS, (x1 + 1) * TS, zf, dz);
      x = x1 + 1;
    }
    for (let x = 0; x < W; x++) for (const dx of [-1, 1]) for (let z = 0; z < H;) {
      if (!(solid(x, z) && !solid(x + dx, z))) { z++; continue; }
      let z1 = z; while (solid(x, z1 + 1) && !solid(x + dx, z1 + 1)) z1++;
      const xf = dx < 0 ? x * TS : (x + 1) * TS; belt(xf + (dx < 0 ? -0.3 : 0), z * TS, xf + (dx < 0 ? 0 : 0.3), (z1 + 1) * TS); sideLights(false, z * TS, (z1 + 1) * TS, xf, dx);
      z = z1 + 1;
    }
    // what she carries on her hull, by her class (js/spacedata.ts SIZES guns): point-defence guns, miniguns, missile
    // launchers, down her back; a ship that isn't the mission's carries none
    const guns: SmGun[] = [], Y = TOP + 0.3, KEEL = -2.4, bellM = shade(0.3, { metalness: 0.5, side: T.DoubleSide });
    const gunAt = (k: 'pd' | 'mg' | 'missile', x: number, z: number, y: number, inv = false) => {
      const o = new T.Group(), gn = new T.Group(); o.position.set(x, y, z); if (inv) o.rotation.z = Math.PI; // (under her keel: hung upside down)
      if (k === 'pd') {
        part(o, new T.Mesh(new T.CylinderGeometry(0.9, 1.1, 0.7, 12), dark), 0, 0.35, 0);
        part(gn, new T.Mesh(new T.BoxGeometry(1.1, 0.7, 1.4), plate), 0, 0.35, 0);
        for (const sx of [-0.25, 0.25]) part(gn, new T.Mesh(new T.CylinderGeometry(0.08, 0.08, 2.6, 8), dark), sx, 0.4, -1.7).rotation.x = Math.PI / 2;
      } else if (k === 'mg') { // (a six-barrelled rotary gun on a ring mount: the barrel cluster turns while it fires, userData.spin)
        part(o, new T.Mesh(new T.CylinderGeometry(1.5, 1.8, 0.9, 14), dark), 0, 0.45, 0);
        part(gn, new T.Mesh(new T.BoxGeometry(1.8, 1.3, 2.6), plate), 0, 0.6, 0.5);
        part(gn, new T.Mesh(new T.CylinderGeometry(0.75, 0.75, 1.4, 8, 1, true), plate), 1.25, 0.55, 0.6).rotation.x = Math.PI / 2; // (the ammunition drum)
        const spin = new T.Group(); spin.position.set(0, 0.6, -0.9); gn.add(spin); gn.userData.spin = spin;
        for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2; part(spin, new T.Mesh(new T.CylinderGeometry(0.09, 0.09, 4.2, 6), dark), Math.cos(a) * 0.3, Math.sin(a) * 0.3, -2.1).rotation.x = Math.PI / 2; }
        for (const z of [-0.6, -3.6]) part(spin, new T.Mesh(new T.CylinderGeometry(0.46, 0.46, 0.2, 10), dark), 0, 0, z).rotation.x = Math.PI / 2; // (the clamps)
      } else {
        part(o, new T.Mesh(new T.BoxGeometry(3.2, 0.6, 3.2), dark), 0, 0.3, 0);
        const bx = part(gn, new T.Mesh(new T.BoxGeometry(2.6, 1.5, 3.4), plate), 0, 0.9, 0); bx.rotation.x = 0.5;
        for (const sx of [-0.8, 0, 0.8]) for (const sy of [0.5, 1.2]) part(gn, new T.Mesh(new T.CircleGeometry(0.3, 10), nav), sx, sy + 0.95, -1.42).rotation.x = 0.5;
      }
      gn.position.y = k === 'mg' ? 0.9 : 0.7; o.add(gn); g.add(o);
      guns.push({ k, inv, x, y: y + (inv ? -1 : 1) * (k === 'mg' ? 1.5 : 1.1), z, hp: k === 'pd' ? 100 : k === 'mg' ? 220 : 180, obj: o, gun: gn, cool: 1 + r() * 3 });
    };
    {
      const C = SpaceData.gunsOf(sp.size, sp.hall === 'mall'), list: ('pd' | 'mg' | 'missile')[] = [], hm = sp.hull;
      for (let k = 0; k < Math.max(C.pd, C.mg, C.missile); k++) { if (k < C.mg) list.push('mg'); if (k < C.pd) list.push('pd'); if (k < C.missile) list.push('missile'); }
      for (let k = C.pd; k > 0 && list.filter((q) => q === 'pd').length < C.pd; k--) list.push('pd');
      // (her guns every other one on her roof and under her keel, so she can shoot both ways; her launchers on her roof)
      let ng = 0;
      list.forEach((k, n) => {
        const u = (n + 0.5) / list.length, x = hm.x0 + (hm.x1 - hm.x0) * (0.14 + 0.72 * u), z = hm.zc + (n % 2 ? 1 : -1) * 3.4, inv = k !== 'missile' && ng++ % 2 === 1;
        if (!inv) { K.box(dark, x - 2.6, Y, z - 2.6, x + 2.6, Y + 0.8, z + 2.6); gunAt(k, x, z, Y + 0.8); }
        else { K.box(dark, x - 1.2, KEEL + 0.6, z - 1.2, x + 1.2, -0.8, z + 1.2); K.box(dark, x - 2.6, KEEL - 0.8, z - 2.6, x + 2.6, KEEL + 0.6, z + 2.6); gunAt(k, x, z, KEEL - 0.8, true); }
      });
    }
    // each compartment on the roof (her top deck's) and under the keel (her lowest's) as what it is
    map.rooms.forEach((rm, i) => {
      const role = sp.roles[i], x0 = rm.x * TS, z0 = rm.z * TS, x1 = (rm.x + rm.w) * TS, z1 = (rm.z + rm.h) * TS, cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, in1 = Math.min(1.2, (x1 - x0) / 5, (z1 - z0) / 5);
      const f = rm.fl || 0, own = sp.hulls[sp.hullOf[i]] || sp.hull, roof = f === NF - 1 || !own.main, RY = own.main ? Y : WH + 0.3, keel = f === 0;
      if (role === 'bridge') {
        // a command tower: a deck above the bridge with its own windows all round, masts over it
        K.box(light, x0 + 0.6, RY, z0 + 1.2, x1 - 0.6, RY + 2.6, z1 - 1.2); K.box(dark, x0 + 0.3, RY + 2.6, z0 + 0.9, x1 - 0.3, RY + 2.9, z1 - 0.9);
        K.box(win, x0 + 0.55, RY + 1.3, z0 + 1.6, x0 + 0.6, RY + 2.0, z1 - 1.6); K.box(win, x0 + 1.2, RY + 1.3, z0 + 1.15, x1 - 1.2, RY + 2.0, z0 + 1.2); K.box(win, x0 + 1.2, RY + 1.3, z1 - 1.2, x1 - 1.2, RY + 2.0, z1 - 1.15);
        K.box(dark, cx - 0.06, RY + 2.9, cz - 0.06, cx + 0.06, RY + 7.5, cz + 0.06); K.box(dark, cx + 1.2, RY + 2.9, cz + 1.0, cx + 1.26, RY + 5.2, cz + 1.06); K.box(nav, cx - 0.1, RY + 7.5, cz - 0.1, cx + 0.1, RY + 7.7, cz + 0.1);
        // the prow: a ram that tapers forward under the lowest deck's line, a brow over the bridge's windows
        if (langOf(own.size) === 'pirate' && !(sp.wing && own.main)) for (let k = 0; k < 4; k++) K.box(k & 1 ? plate : dark, x0 - 1.5 * (k + 1), -1.0 - 0.25 * k, z0 + 1.2 * (k + 1), x0 - 1.5 * k, 0.7 - 0.2 * k, z1 - 1.2 * (k + 1)); // (a ram: the pirates')
        if (!(sp.wing && own.main)) K.box(dark, x0 - 1.2, f * FH + 2.95, z0, x0, RY + 0.2, z1);
      } else if (role === 'engine') {
        // the engine block, and her nozzles out of the stern: lit (a ship of two decks: as tall as both)
        const top = own.main ? TOP : WH, mid = top / 2 - 0.1;
        if (sp.wing && own.main && cz - own.z0 > cx - own.x0) {
          // (a flying wing's south arm: its engines out of its end, to the south)
          K.box(dark, x0 + 0.5, top + 0.3, z0 + 0.5, x1 - 0.5, top + 1.7, z1 + 0.6); K.box(plate, x0 + 1.5, top + 1.7, z0 + 1.5, x1 - 1.5, top + 2.3, z1 - 0.5); K.box(dark, x0 + 1, -2.2, z0, x1 - 1, -1.0, z1 + 0.6);
          const nN = Math.max(2, Math.round((x1 - x0) / 5));
          for (let k = 0; k < nN; k++) {
            const x = x0 + (k + 0.5) * (x1 - x0) / nN, rad = Math.min(top * 0.47, (x1 - x0) / nN * 0.42);
            part(g, new T.Mesh(new T.CylinderGeometry(rad, rad * 0.62, 3.2, 14, 1, true), bellM), x, mid, z1 + 2.2).rotation.x = -Math.PI / 2;
            part(g, new T.Mesh(new T.CircleGeometry(rad * 0.7, 14), eng), x, mid, z1 + 1.4);
            part(g, new T.Mesh(new T.ConeGeometry(rad * 0.8, rad * 8, 12, 1, true), new T.MeshBasicMaterial({ color: 0x5ab4ff, transparent: true, opacity: 0.28, depthWrite: false, blending: T.AdditiveBlending, side: T.DoubleSide })), x, mid, z1 + 2.6 + rad * 4).rotation.x = Math.PI / 2;
          }
          return;
        }
        K.box(dark, x0 + 0.5, top + 0.3, z0 + 0.5, x1 + 0.6, top + 1.7, z1 - 0.5); K.box(plate, x0 + 1.5, top + 1.7, z0 + 1.5, x1 - 0.5, top + 2.3, z1 - 1.5); K.box(dark, x0, -2.2, z0 + 1, x1 + 0.6, -1.0, z1 - 1);
        const nN = Math.max(2, Math.round((z1 - z0) / (NF > 1 && own.main ? 7 : 5)));
        for (let k = 0; k < nN; k++) {
          const z = z0 + (k + 0.5) * (z1 - z0) / nN, rad = Math.min(top * 0.47, (z1 - z0) / nN * 0.42);
          const bell = part(g, new T.Mesh(new T.CylinderGeometry(rad, rad * 0.62, 3.2, 14, 1, true), bellM), x1 + 2.2, mid, z); bell.rotation.z = Math.PI / 2;
          const disc = part(g, new T.Mesh(new T.CircleGeometry(rad * 0.7, 14), eng), x1 + 1.4, mid, z); disc.rotation.y = Math.PI / 2;
          const plume = part(g, new T.Mesh(new T.ConeGeometry(rad * 0.8, rad * 8, 12, 1, true), new T.MeshBasicMaterial({ color: 0x5ab4ff, transparent: true, opacity: 0.28, depthWrite: false, blending: T.AdditiveBlending, side: T.DoubleSide })), x1 + 2.6 + rad * 4, mid, z); plume.rotation.z = -Math.PI / 2;
        }
      } else if (role === 'reactor' && roof) {
        K.box(dark, x0 + in1, RY, z0 + in1, x1 - in1, RY + 0.9, z1 - in1);
        for (let x = x0 + 1; x < x1 - 0.8; x += 1.1) K.box(light, x, RY + 0.9, z0 + 0.6, x + 0.12, RY + 3.2, z1 - 0.6); // radiator fins
      } else if (role === 'cargo') {
        if (roof) { K.box(plate, x0 + in1, RY, z0 + in1, x1 - in1, RY + 0.35, z1 - in1); K.box(trim, cx - 0.06, RY + 0.35, z0 + in1, cx + 0.06, RY + 0.4, z1 - in1); } // hatch covers
        if (keel) K.box(dark, x0 + 1, -1.9, z0 + 1, x1 - 1, -1.0, z1 - 1);
      } else if (role === 'pods') {
        // the pods' blisters on her side
        const south = cz > own.zc, zf = south ? z1 + TS : z0 - TS, by = f * FH;
        for (let k = 0; k < 3; k++) { const x = x0 + (k + 0.5) * (x1 - x0) / 3; K.box(trim, x - 0.9, by + 2.95, zf + (south ? 0 : -1.3), x + 0.9, by + 3.9, zf + (south ? 1.3 : 0)); }
        if (roof) K.box(plate, x0 + in1, RY, z0 + in1, x1 - in1, RY + 0.3, z1 - in1);
      } else if (role === 'spine') {
        if (roof) { K.box(dark, x0, RY, cz - 0.9, x1, RY + 0.7, cz + 0.9); for (let x = x0 + 3; x < x1 - 2; x += 8) K.box(win, x, RY + 0.7, cz - 0.15, x + 0.6, RY + 0.76, cz + 0.15); } // a ridge down her back, lights along it
      } else {
        if (roof) { const hgt = 0.3 + r() * 0.7; K.box(r() < 0.5 ? plate : light, x0 + in1, RY, z0 + in1, x1 - in1, RY + hgt, z1 - in1); if (r() < 0.4) K.box(dark, cx - 0.7, RY + hgt, cz - 0.7, cx + 0.7, RY + hgt + 0.5, cz + 0.7); }
        if (keel && r() < 0.5) K.box(dark, x0 + 1.2, -1.6, z0 + 1.2, x1 - 1.2, -1.0, z1 - 1.2);
      }
    });
    // ---- her own lines: what stands off the boxes of her compartments: over her roof, under her keel, off her bow and stern, and
    // over her sides' plating too (in short pieces: where she's rammed, what's there is smashed away with the wall: cutAt).
    {
      const DM = (c: number | THREE.Color, k = 1) => { const col = new T.Color(c as any).multiplyScalar(k); return M(col.getHex(), { side: T.DoubleSide, emissive: col.clone().multiplyScalar(0.15).getHex() }); };
      const tris = new Map<THREE.Material, number[]>(), V = (x: number, y: number, z: number) => new T.Vector3(x, y, z);
      const tri = (m: THREE.Material, a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3) => { let q = tris.get(m); if (!q) tris.set(m, q = []); q.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z); };
      const quad = (m: THREE.Material, a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, d: THREE.Vector3) => { tri(m, a, b, c); tri(m, a, c, d); };
      // a solid between two four-cornered faces; a flat shape pushed through a distance; a round (or square) bar between two points
      const hexa = (m: THREE.Material, b: THREE.Vector3[], t: THREE.Vector3[]) => { quad(m, b[0], b[1], b[2], b[3]); quad(m, t[0], t[1], t[2], t[3]); for (let i = 0; i < 4; i++) quad(m, b[i], b[(i + 1) % 4], t[(i + 1) % 4], t[i]); };
      const prism = (m: THREE.Material, poly: THREE.Vector3[], off: THREE.Vector3) => { const q = poly.map((v) => v.clone().add(off)), n = poly.length; for (let i = 1; i + 1 < n; i++) { tri(m, poly[0], poly[i], poly[i + 1]); tri(m, q[0], q[i], q[i + 1]); } for (let i = 0; i < n; i++) quad(m, poly[i], poly[(i + 1) % n], q[(i + 1) % n], q[i]); };
      const bar = (m: THREE.Material, a: THREE.Vector3, b: THREE.Vector3, r0 = 0.09, r1 = r0, n = 4) => {
        const d = b.clone().sub(a).normalize(), u = (Math.abs(d.y) < 0.9 ? V(0, 1, 0) : V(1, 0, 0)).cross(d).normalize(), v = d.clone().cross(u);
        const ring = (c: THREE.Vector3, rd: number) => Array.from({ length: n }, (_, i) => c.clone().addScaledVector(u, Math.cos(i * 2 * Math.PI / n + 0.7854) * rd).addScaledVector(v, Math.sin(i * 2 * Math.PI / n + 0.7854) * rd));
        const A = ring(a, r0), B = ring(b, r1);
        for (let i = 0; i < n; i++) quad(m, A[i], A[(i + 1) % n], B[(i + 1) % n], B[i]);
        for (let i = 1; i + 1 < n; i++) { tri(m, A[0], A[i], A[i + 1]); tri(m, B[0], B[i], B[i + 1]); }
      };
      const dPlate = DM(base, 0.62), dDark = DM(base, 0.36), dLight = DM(base, 0.9), rust = DM(0x5a3222), rust2 = DM(0x2e2623), paint = DM(0xdfe3e4), glowO = lit(0xff7a2a), glowB = lit(0x7fd0ff), red = lit(0xff3528), blue = lit(0x9fd8ff);
      const CONT = [0xb5651d, 0x2d5f8a, 0x4f7a3a, 0x8a8f94, 0x9a2f25, 0xc9a227].map((c) => DM(c, 0.8));
      const ti = (m: number) => Math.max(0, Math.min(W - 1, Math.floor(m / TS))), tj = (m: number) => Math.max(0, Math.min(H - 1, Math.floor(m / TS)));
      sp.hulls.forEach((hm, h) => {
        const lang = hm.main && sp.wing ? 'wing' : langOf(hm.size), top = hm.main ? TOP : WH, RY = top + 0.3, rr = G_U.rng((map.seed ^ (0x51ed + h * 977)) >>> 0), R = (a: number, b: number) => a + rr() * (b - a);
        // her side at a station down her length (the outer face of her wall, +z or -z), her bow's face and her stern's
        const side = (xm: number, sg: number) => { const x = ti(xm); let z = tj(hm.zc); if (!solid(x, z)) return null; while (solid(x, z + sg)) z += sg; return (z + (sg > 0 ? 1 : 0)) * TS; };
        const end = (sg: number) => { let x = ti((hm.x0 + hm.x1) / 2); const z = tj(hm.zc); if (!solid(x, z)) return sg < 0 ? hm.x0 : hm.x1; while (solid(x + sg, z)) x += sg; return (x + (sg > 0 ? 1 : 0)) * TS; };
        const bow = end(-1), stern = end(1), L = stern - bow, zc = hm.zc;
        const pz0 = side(bow + 1.5, -1) ?? zc - 3, pz1 = side(bow + 1.5, 1) ?? zc + 3, pw = pz1 - pz0, pc = (pz0 + pz1) / 2;
        const onRoof = (xm: number, zm: number) => solid(ti(xm), tj(zm));
        const face = [V(bow, -1.0, pz0), V(bow, -1.0, pz1), V(bow, RY, pz1), V(bow, RY, pz0)];
        const nose = (m: THREE.Material, len: number, hw: number, y0: number, y1: number) => hexa(m, face, [V(bow - len, y0, pc - hw), V(bow - len, y0, pc + hw), V(bow - len, y1, pc + hw), V(bow - len, y1, pc - hw)]);
        // (a run of her side, a few metres at a time: each piece where her side is there)
        const along = (x0: number, x1: number, step: number, f: (x: number, len: number, zf: number, sg: number) => void) => { for (let x = x0; x < x1 - 0.5; x += step) for (const sg of [-1, 1]) { const zf = side(x + step / 2, sg); if (zf != null && Math.abs(zf - zc) > 2.5) f(x, Math.min(step, x1 - x), zf, sg); } };
        if (lang === 'wing') {
          // A flying wing: she flies bow corner first. Her two outer sides are her leading edges: a blade down each (a bay in three
          // left clear), the roof's edge sloped back over it; her bow corner is a glazed canopy over the bridge's corner windows,
          // a chin under it and a brow over; a ridge runs back down her middle from it; a fin stands at each arm's tip.
          const X0 = hm.x0, Z0 = hm.z0, X1 = hm.x1, Z1 = hm.z1, bi = map.rooms.findIndex((q, i) => sp.roles[i] === 'bridge' && sp.hullOf[i] === h), br = map.rooms[bi];
          const bx1 = br ? (br.x + br.w + 1) * TS : X0 + 8, bz1 = br ? (br.z + br.h + 1) * TS : Z0 + 6, wm = langOf(hm.size) === 'pirate' ? dDark : dPlate;
          let ni = 0;
          for (let x = bx1 + 0.3; x < X1 - 1; x += TS * 2) { const ln = Math.min(TS * 2, X1 - x); prism(wm, [V(x, RY + 0.2, Z0 - 0.3), V(x, RY + 1.0, Z0 + 2.0), V(x, RY + 0.2, Z0 + 2.0)], V(ln, 0, 0)); if (ni++ % 3 !== 2) prism(wm, [V(x + 0.04, -1.0, Z0), V(x + 0.04, 1.1, Z0 - 1.9), V(x + 0.04, 2.95, Z0)], V(ln - 0.08, 0, 0)); }
          for (let z = bz1 + 0.3; z < Z1 - 1; z += TS * 2) { const ln = Math.min(TS * 2, Z1 - z); prism(wm, [V(X0 - 0.3, RY + 0.2, z), V(X0 + 2.0, RY + 1.0, z), V(X0 + 2.0, RY + 0.2, z)], V(0, 0, ln)); if (ni++ % 3 !== 2) prism(wm, [V(X0, -1.0, z + 0.04), V(X0 - 1.9, 1.1, z + 0.04), V(X0, 2.95, z + 0.04)], V(0, 0, ln - 0.08)); }
          const nn = 3.2, kite = (y: number) => [[V(X0, y, bz1), V(X0 - nn, y, Z0 - nn), V(X0, y, Z0)], [V(X0, y, Z0), V(X0 - nn, y, Z0 - nn), V(bx1, y, Z0)]]; // (an arrowhead round her corner, as its two halves)
          const glassM = new T.MeshStandardMaterial({ color: 0x9fd8ff, transparent: true, opacity: 0.26, roughness: 0.15, metalness: 0.3, emissive: 0x14303c, side: T.DoubleSide, depthWrite: false });
          for (const [m, y, hh] of [[wm, -1.0, 1.55], [glassM, 0.55, 2.3], [dDark, 2.85, RY + 0.25 - 2.85]] as [THREE.Material, number, number][]) for (const half of kite(y)) prism(m, half, V(0, hh, 0));
          for (const [a, b] of [[V(X0 - nn, 0.55, Z0 - nn), V(X0 - nn, 2.85, Z0 - nn)], [V(X0 - nn * 0.5, 0.55, (bz1 + Z0 - nn) / 2), V(X0 - nn * 0.5, 2.85, (bz1 + Z0 - nn) / 2)], [V((bx1 + X0 - nn) / 2, 0.55, Z0 - nn * 0.5), V((bx1 + X0 - nn) / 2, 2.85, Z0 - nn * 0.5)]]) bar(dDark, a, b, 0.09);
          K.box(blue, X0 - nn - 0.12, RY + 0.25, Z0 - nn - 0.12, X0 - nn + 0.12, RY + 0.45, Z0 - nn + 0.12);
          const tk = Math.min(X1 - X0, Z1 - Z0) * 0.45;
          hexa(dDark, [V(X0 + 1.2, RY, Z0 + 2.6), V(X0 + 2.6, RY, Z0 + 1.2), V(X0 + tk + 0.7, RY, Z0 + tk - 0.7), V(X0 + tk - 0.7, RY, Z0 + tk + 0.7)], [V(X0 + 1.8, RY + 1.3, Z0 + 2.2), V(X0 + 2.2, RY + 1.3, Z0 + 1.8), V(X0 + tk + 0.2, RY + 0.5, Z0 + tk - 0.2), V(X0 + tk - 0.2, RY + 0.5, Z0 + tk + 0.2)]);
          prism(dDark, [V(X1 - 6, RY, Z0 + 0.3), V(X1 + 0.4, RY, Z0 + 0.3), V(X1 + 2.6, RY + 4.6, Z0 + 0.3), V(X1 - 0.6, RY + 4.6, Z0 + 0.3)], V(0, 0, 0.28));
          prism(dDark, [V(X0 + 0.3, RY, Z1 - 6), V(X0 + 0.3, RY, Z1 + 0.4), V(X0 + 0.3, RY + 4.6, Z1 + 2.6), V(X0 + 0.3, RY + 4.6, Z1 - 0.6)], V(0.28, 0, 0));
          for (const [x, z] of [[X1 + 1.6, Z0 + 0.3], [X0 + 0.3, Z1 + 1.6]]) K.box(red, x - 0.1, RY + 4.6, z - 0.1, x + 0.18, RY + 4.8, z + 0.18);
        } else if (lang === 'navy') {
          // a long wedge of a bow, its edge a blade; armour sloped in over her roof's edges and a V under her keel
          const len = Math.min(20, pw * 0.8 + 5);
          nose(dDark, len, 0.25, 0.1, top * 0.55);
          hexa(dPlate, [V(bow, RY - 0.9, pz0 - 0.05), V(bow, RY - 0.9, pz1 + 0.05), V(bow, RY + 0.05, pz1 + 0.05), V(bow, RY + 0.05, pz0 - 0.05)], [V(bow - len * 0.96, top * 0.5, pc - 0.28), V(bow - len * 0.96, top * 0.5, pc + 0.28), V(bow - len * 0.96, top * 0.58, pc + 0.28), V(bow - len * 0.96, top * 0.58, pc - 0.28)]);
          along(bow + 0.5, stern - 0.5, 4, (x, ln, zf, sg) => {
            prism(dPlate, [V(x, RY + 0.2, zf + sg * 0.3), V(x, RY + 1.5, zf - sg * 2.4), V(x, RY + 0.2, zf - sg * 2.4)], V(ln, 0, 0));
            prism(dDark, [V(x, -1.0, zf + sg * 0.3), V(x, -2.7, zf - sg * 3.2), V(x, -1.0, zf - sg * 3.2)], V(ln, 0, 0));
          });
          { let ni = 0; along(bow + 0.7, stern - 0.7, TS * 2, (x, ln, zf, sg) => { if ((ni++ >> 1) % 3 === 2) return; const o = zf + sg * 0.02; prism(dPlate, [V(x + 0.04, 2.9, o), V(x + 0.04, 2.05, o + sg * 0.7), V(x + 0.04, 0.85, o + sg * 0.7), V(x + 0.04, 0, o)], V(ln - 0.08, 0, 0)); }); } // (sloped armour over her sides, a gap at every third bay)
          // a ship of two decks: her tall sides broken by a chine standing out between the decks, and armour sloped back in over the upper one
          if (hm.main && NF > 1) for (let f2 = 1; f2 < NF; f2++) {
            const yb = (f2 - 1) * FH + 2.92, yt = f2 * FH + 0.72; let ni = 0;
            along(bow + 0.7, stern - 0.7, TS * 2, (x, ln, zf, sg) => {
              const o = zf + sg * 0.3;
              prism(dDark, [V(x, yb, o), V(x, (yb + yt) / 2 - 0.25, o + sg * 1.0), V(x, (yb + yt) / 2 + 0.25, o + sg * 1.0), V(x, yt, o)], V(ln, 0, 0));
              if ((ni++ >> 1) % 3 === 2) return;
              const o2 = zf + sg * 0.02; prism(dPlate, [V(x + 0.04, f2 * FH + 2.9, o2), V(x + 0.04, f2 * FH + 2.2, o2 + sg * 0.45), V(x + 0.04, f2 * FH + 1.1, o2 + sg * 0.7), V(x + 0.04, yt, o2 + sg * 0.3)], V(ln - 0.08, 0, 0));
            });
          }
          // her citadel amidships: two stepped, sloped blocks, masts with yards and an array over them
          const cx = bow + L * 0.46, cw = Math.min(5, pw * 0.3), cl = Math.max(6, L * 0.1), fr = (y0: number, y1: number, a: number, b: number, c2: number, d: number, m: THREE.Material) => hexa(m, [V(cx - a, y0, zc - b), V(cx + a, y0, zc - b), V(cx + a, y0, zc + b), V(cx - a, y0, zc + b)], [V(cx - c2, y1, zc - d), V(cx + c2, y1, zc - d), V(cx + c2, y1, zc + d), V(cx - c2, y1, zc + d)]);
          fr(RY, RY + 3.4, cl, cw, cl - 1.6, cw - 1.2, dPlate); fr(RY + 3.4, RY + 5.6, cl - 2.2, cw - 1.6, cl - 3.2, cw - 2.3, dLight);
          K.box(win, cx - cl + 1.5, RY + 4.2, zc - cw + 1.55, cx - cl + 1.6, RY + 4.9, zc + cw - 1.55);
          for (const dx of [-1.6, 1.8]) { bar(dDark, V(cx + dx, RY + 5.6, zc), V(cx + dx, RY + 11.5 - Math.abs(dx), zc), 0.12, 0.06); for (const yy of [7.4, 8.8]) bar(dDark, V(cx + dx, RY + yy, zc - 1.6), V(cx + dx, RY + yy, zc + 1.6), 0.05); K.box(blue, cx + dx - 0.1, RY + 11.5 - Math.abs(dx), zc - 0.1, cx + dx + 0.1, RY + 11.7 - Math.abs(dx), zc + 0.1); }
          hexa(dLight, [V(cx + 3.2, RY + 6.2, zc - 2.2), V(cx + 3.2, RY + 6.2, zc + 2.2), V(cx + 3.2, RY + 8.6, zc + 2.2), V(cx + 3.2, RY + 8.6, zc - 2.2)], [V(cx + 3.8, RY + 6.0, zc - 2.2), V(cx + 3.8, RY + 6.0, zc + 2.2), V(cx + 3.8, RY + 8.4, zc + 2.2), V(cx + 3.8, RY + 8.4, zc - 2.2)]);
          // tail fins over her engines, swept back
          for (const sg of [-1, 1]) { const z = zc + sg * Math.min(pw * 0.32, 6); prism(dDark, [V(stern - 9, RY, z), V(stern - 1.5, RY, z), V(stern + 2, RY + 6.5, z), V(stern - 1, RY + 6.5, z)], V(0, 0, 0.3)); K.box(blue, stern + 0.4, RY + 6.5, z, stern + 0.7, RY + 6.7, z + 0.3); }
        } else if (lang === 'cutter') {
          // a needle bow, her roof's and keel's edges rounded off, a swept fin and two slim nacelles at her stern
          nose(paint, pw * 1.1 + 6, 0.12, 1.1, 1.6);
          along(bow + 0.3, stern - 0.3, 4, (x, ln, zf, sg) => {
            prism(paint, [V(x, RY + 0.2, zf + sg * 0.3), V(x, RY + 0.9, zf - sg * 0.5), V(x, RY + 1.15, zf - sg * 2.2), V(x, RY + 0.2, zf - sg * 2.2)], V(ln, 0, 0));
            prism(dLight, [V(x, -1.0, zf + sg * 0.3), V(x, -1.75, zf - sg * 0.7), V(x, -2.0, zf - sg * 2.6), V(x, -1.0, zf - sg * 2.6)], V(ln, 0, 0));
          });
          { let ni = 0; along(bow + 0.5, stern - 0.5, TS * 2, (x, ln, zf, sg) => { if ((ni++ >> 1) % 4 === 3) return; const o = zf + sg * 0.02; prism(paint, [V(x + 0.02, 2.9, o), V(x + 0.02, 2.4, o + sg * 0.42), V(x + 0.02, 0.5, o + sg * 0.42), V(x + 0.02, 0, o)], V(ln - 0.04, 0, 0)); }); } // (a smooth fairing over her sides)
          prism(paint, [V(stern - 10, RY, zc - 0.12), V(stern - 2, RY, zc - 0.12), V(stern + 2.5, RY + 5.5, zc - 0.12), V(stern + 0.4, RY + 5.5, zc - 0.12)], V(0, 0, 0.24));
          for (const sg of [-1, 1]) {
            const zf = side(stern - 5, sg) ?? zc + sg * 4, z = zf + sg * 2.3, y = top + 1.5;
            bar(paint, V(stern - 10, y, z), V(stern - 8, y, z), 0.15, 0.85, 10); bar(paint, V(stern - 8, y, z), V(stern + 1, y, z), 0.85, 0.7, 10); bar(glowB, V(stern + 1, y, z), V(stern + 1.05, y, z), 0.55, 0.55, 10);
            for (const dx of [-7, -2]) bar(dLight, V(stern + dx, RY, zf - sg * 0.6), V(stern + dx, y, z), 0.14);
          }
        } else if (lang === 'liner') {
          // a cruise liner: a raked bow; her roof's edges rounded off; a blue keel and band at her waterline, a line of brass over it
          const navy = DM(0x1c2f4a), brass = DM(0xb8935a), glassM = lit(0xd8b888), CT = Level.CTS, paint = M(0xf4f5f3, { side: T.DoubleSide, emissive: 0x6a6c6a }); // (her own white, brighter than a cutter's paint)
          nose(paint, Math.min(18, pw * 0.6 + 6), 0.5, -0.4, RY * 0.8);
          along(bow + 0.3, stern - 0.3, 4, (x, ln, zf, sg) => {
            prism(paint, [V(x, RY + 0.2, zf + sg * 0.3), V(x, RY + 0.9, zf - sg * 0.5), V(x, RY + 1.15, zf - sg * 2.2), V(x, RY + 0.2, zf - sg * 2.2)], V(ln, 0, 0));
            prism(navy, [V(x, -1.0, zf + sg * 0.34), V(x, -1.75, zf - sg * 0.7), V(x, -2.0, zf - sg * 2.6), V(x, -1.0, zf - sg * 2.6)], V(ln, 0, 0));
            prism(navy, [V(x, -1.0, zf + sg * 0.34), V(x, -0.22, zf + sg * 0.34), V(x, -0.22, zf + sg * 0.3), V(x, -1.0, zf + sg * 0.3)], V(ln, 0, 0));
            prism(brass, [V(x, -0.22, zf + sg * 0.35), V(x, -0.1, zf + sg * 0.35), V(x, -0.1, zf + sg * 0.3), V(x, -0.22, zf + sg * 0.3)], V(ln, 0, 0));
          });
          // over her court: a glazed roof down the middle of its open part, in a white kerb, blue glazing bars across it; the two
          // tiers aft of it from where her mezzanine begins, each set in from the one under it, a band of lit windows round each; the
          // funnel on the upper one, raked, a brass band near its top; a wheelhouse tier over her bridge, forward
          const ci = map.rooms.findIndex((q, i) => !(q.fl) && sp.roles[i] === 'mall' && sp.hullOf[i] === h), court = map.rooms[ci] as any;
          const cx0 = court ? court.x * TS : bow + L * 0.25, mzX = court && court.mz ? court.mz * CT : bow + L * 0.55, hw = Math.max(4, pw * 0.34);
          { const a = cx0 + 3, b = mzX - 2, gw = Math.min(5.5, hw);
            if (b - a > 6) { K.box(light, a - 0.5, RY, zc - gw - 0.5, b + 0.5, RY + 0.55, zc + gw + 0.5); K.box(glassM, a, RY + 0.5, zc - gw, b, RY + 0.62, zc + gw); for (let x = a + 3; x < b - 1; x += 3) K.box(navy, x - 0.08, RY + 0.55, zc - gw, x + 0.08, RY + 0.7, zc + gw); K.box(navy, a, RY + 0.55, zc - 0.1, b, RY + 0.7, zc + 0.1); } }
          const tier = (x0: number, x1: number, y0: number, y1: number, w: number) => { K.box(light, x0, y0, zc - w, x1, y1, zc + w); K.box(navy, x0 - 0.25, y1, zc - w - 0.25, x1 + 0.25, y1 + 0.12, zc + w + 0.25);
            for (const sg of [-1, 1]) K.box(win, x0 + 0.6, y0 + 1.0, zc + sg * w - 0.03, x1 - 0.6, y0 + 1.85, zc + sg * w + 0.03); K.box(win, x0 - 0.03, y0 + 1.0, zc - w + 0.6, x0 + 0.03, y0 + 1.85, zc + w - 0.6); K.box(win, x1 - 0.03, y0 + 1.0, zc - w + 0.6, x1 + 0.03, y0 + 1.85, zc + w - 0.6); };
          const t1a = mzX + 1, t1b = stern - 7;
          if (t1b - t1a > 10) { tier(t1a, t1b, RY, RY + 2.8, hw); tier(t1a + 3, t1b - 5, RY + 2.92, RY + 5.5, hw * 0.68);
            const fx = t1a + (t1b - t1a) * 0.55, fy = RY + 5.62;
            prism(navy, [V(fx, fy, zc - 1.4), V(fx + 5, fy, zc - 1.4), V(fx + 6.6, fy + 5.2, zc - 1.4), V(fx + 2.6, fy + 5.2, zc - 1.4)], V(0, 0, 2.8));
            prism(brass, [V(fx + 2.0, fy + 3.8, zc - 1.45), V(fx + 6.2, fy + 3.8, zc - 1.45), V(fx + 6.42, fy + 4.4, zc - 1.45), V(fx + 2.2, fy + 4.4, zc - 1.45)], V(0, 0, 2.9)); }
          tier(bow + 1.5, Math.min(bow + 9, cx0 - 1), RY, RY + 2.4, Math.max(3, pw * 0.3));
        } else if (lang === 'freighter') {
          // a blunt bow; containers down her back, tanks slung off her roof's edges, gantries over the stacks, a dish aft
          nose(dPlate, 2.8, pw * 0.36, -0.4, top * 0.8);
          along(bow + 0.5, stern - 0.5, TS * 4, (x, ln, zf, sg) => { // (ribs down her sides, and two pipes along them)
            bar(dDark, V(x, -0.02, zf + sg * 0.26), V(x, 2.92, zf + sg * 0.26), 0.11);
            bar(dLight, V(x, 2.45, zf + sg * 0.42), V(x + ln, 2.45, zf + sg * 0.42), 0.13, 0.13, 6); bar(dDark, V(x, 0.45, zf + sg * 0.4), V(x + ln, 0.45, zf + sg * 0.4), 0.1, 0.1, 6);
          });
          along(bow + 0.4, stern - 0.4, 4, (x, ln, zf, sg) => prism(dPlate, [V(x, RY + 0.2, zf + sg * 0.3), V(x, RY + 0.75, zf - sg * 0.9), V(x, RY + 0.2, zf - sg * 0.9)], V(ln, 0, 0)));
          const rows = pw > 15 ? [-4.9, -2.2, 2.2, 4.9] : pw > 9 ? [-2.2, 2.2] : [0];
          for (let x = bow + L * 0.28; x < stern - L * 0.22 - 6; x += 6.3) for (const dz of rows) {
            if (!onRoof(x + 3, zc + dz) || rr() < 0.2) continue;
            const m = CONT[Math.floor(rr() * CONT.length)], two = rr() < 0.35;
            K.box(m, x, RY, zc + dz - 1.2, x + 6, RY + 2.5, zc + dz + 1.2); if (two) K.box(CONT[Math.floor(rr() * CONT.length)], x + 0.05, RY + 2.5, zc + dz - 1.2, x + 6.05, RY + 5, zc + dz + 1.2);
          }
          for (const u of [0.4, 0.66]) for (const sg of [-1, 1]) {
            const x = bow + L * u, zf = side(x, sg); if (zf == null) continue;
            const z = zf + sg * 1.5, y = top + 1.5, ln = Math.min(8, L * 0.16);
            bar(paint, V(x - ln / 2, y, z), V(x + ln / 2, y, z), 1.05, 1.05, 12); bar(paint, V(x - ln / 2 - 0.7, y, z), V(x - ln / 2, y, z), 0.5, 1.05, 12); bar(paint, V(x + ln / 2, y, z), V(x + ln / 2 + 0.7, y, z), 1.05, 0.5, 12);
            for (const dx of [-ln * 0.3, ln * 0.3]) { bar(dDark, V(x + dx, RY, zf - sg * 1.0), V(x + dx, y + 1.2, zf - sg * 1.0), 0.12); bar(dDark, V(x + dx, y + 1.2, zf - sg * 1.0), V(x + dx, y + 1.2, z), 0.12); bar(dDark, V(x + dx, y + 1.2, z), V(x + dx, y + 1.0, z), 0.1); }
          }
          for (const u of [0.36, 0.6]) {
            const x = bow + L * u, a = (side(x, -1) ?? zc - 3) + 0.6, b = (side(x, 1) ?? zc + 3) - 0.6, y = RY + 6.2;
            bar(dDark, V(x, RY, a), V(x, y, a), 0.16); bar(dDark, V(x, RY, b), V(x, y, b), 0.16); bar(dDark, V(x, y, a - 0.8), V(x, y, b + 0.8), 0.2); K.box(trim, x - 0.5, y - 0.9, zc + R(-2, 2) - 0.5, x + 0.5, y - 0.2, zc + 0.5);
          }
          { const x = stern - L * 0.14, y = RY + 2.2; bar(dDark, V(x, RY, zc + 2), V(x, y + 1.5, zc + 2), 0.1); bar(paint, V(x - 0.2, y + 1.5, zc + 2), V(x - 1.0, y + 2.6, zc + 2), 0.15, 1.5, 12); }
        } else {
          // pirates: a jaw of blades over her ram, scrap plate leaning off her roof's edges, spikes, hoops of girder over her back,
          // a boom out to one side and an engine strapped on at the other
          const nT = Math.max(3, Math.round(pw / 2.2));
          for (let k = 0; k < nT; k++) { const z = pz0 + (k + 0.5) * pw / nT, ln = R(3, 7.5); prism(k & 1 ? rust : dDark, [V(bow + 0.3, 0.3, z - 0.12), V(bow + 0.3, 2.7, z - 0.12), V(bow - ln, 1.2 + R(-0.5, 0.6), z - 0.12)], V(0, 0, 0.24)); }
          for (const sg of [-1, 1]) K.box(red, bow - 0.12, top * 0.72, pc + sg * pw * 0.25 - 0.35, bow, top * 0.72 + 0.25, pc + sg * pw * 0.25 + 0.35);
          along(bow + 1, stern - 1, 3.4, (x, ln, zf, sg) => {
            if (rr() < 0.55) { const hh = R(0.9, 2.2), lean = R(0.3, 1.5), a = V(x + 0.2, RY - 0.2, zf + sg * 0.3), b = V(x + 0.2, RY + hh, zf + sg * (0.3 + lean)); prism(rr() < 0.5 ? rust : rust2, [a, b, b.clone().add(V(0, 0, -sg * 0.14)), a.clone().add(V(0, 0, -sg * 0.14))], V(ln * R(0.6, 0.95), 0, 0)); }
            if (rr() < 0.4) bar(rust2, V(x + 1, RY, zf - sg * 0.2), V(x + 1 + R(-1.5, 1.5), RY + R(1.5, 4), zf + sg * R(1.2, 3.6)), 0.1, 0.02);
          });
          along(bow + 0.6, stern - 0.6, TS * 2, (x, ln, zf, sg) => { // (scrap plate bolted over her sides, no two alike)
            if (rr() > 0.5) return;
            const o = zf + sg * 0.02, y0 = R(0, 1.1), y1 = Math.min(2.9, y0 + R(1, 1.8)), t0 = R(0.05, 0.25), t1 = R(0.15, 0.6), x0 = x + R(0, 0.3);
            prism(rr() < 0.4 ? rust : rr() < 0.5 ? rust2 : dDark, [V(x0, y0, o + sg * t0), V(x0, y1, o + sg * t1), V(x0, y1, o + sg * (t1 + 0.08)), V(x0, y0, o + sg * (t0 + 0.08))], V(ln * R(0.7, 1.25), 0, 0));
          });
          for (let x = bow + L * 0.2; x < stern - 3; x += R(5.5, 8.5)) {
            const a = (side(x, -1) ?? zc - 3) - 0.7, b = (side(x, 1) ?? zc + 3) + 0.7, y = RY + R(1.8, 2.8);
            bar(dDark, V(x, RY - 0.4, a), V(x, y, a + 0.6), 0.13); bar(dDark, V(x, RY - 0.4, b), V(x, y, b - 0.6), 0.13); bar(dDark, V(x, y, a + 0.6), V(x, y + R(-0.4, 0.4), b - 0.6), 0.13);
          }
          const sg = rr() < 0.5 ? -1 : 1, xb = bow + L * R(0.35, 0.6), zb = (side(xb, sg) ?? zc + sg * 3), tip = V(xb + R(-2, 3), RY + R(3, 5), zb + sg * R(7, 11));
          bar(dDark, V(xb, RY, zc + sg * 1), tip, 0.2, 0.1); bar(rust2, V(xb + 2.5, RY, zb - sg * 0.5), tip.clone().lerp(V(xb, RY, zc), 0.35), 0.08); bar(rust, tip, tip.clone().add(V(-0.6, 0.9, sg * 0.5)), 0.12, 1.3, 8); K.box(red, tip.x - 0.12, tip.y - 0.4, tip.z - 0.12, tip.x + 0.12, tip.y - 0.16, tip.z + 0.12);
          { const zf = side(stern - 3, -sg) ?? zc - sg * 3, z = zf - sg * 2.2, y = top + 1.3, ln = R(4.5, 7); bar(rust, V(stern - ln, y, z), V(stern + 1.2, y, z), 1.0, 1.15, 8); bar(rust2, V(stern + 1.2, y, z), V(stern + 2.4, y, z), 1.15, 0.8, 8); bar(glowO, V(stern + 2.4, y, z), V(stern + 2.45, y, z), 0.62, 0.62, 8);
            for (const dx of [-ln + 0.8, -0.5]) { bar(dDark, V(stern + dx, RY, zf + sg * 0.8), V(stern + dx, y, z), 0.13); bar(dDark, V(stern + dx + 0.9, RY, zf + sg * 0.3), V(stern + dx, y + 0.5, z), 0.08); } }
        }
      });
      // Streamlining. Where her side steps in or out (an inside corner of her plan) the corner's filled: a fairing from the step's
      // full depth down to nothing along the longer wall, keel to roof, in slices (it's smashed through like the rest: cutAt).
      {
        const fairM = langOf(sp.size) === 'cutter' || langOf(sp.size) === 'liner' ? paint : dPlate;
        for (const f of ShipGen.fairings(W, H, t)) { // (where they are: js/shipgen.ts fairings; no window goes behind one)
          const { cx, cz, short, long } = f, u = V(f.ux, 0, f.uz), v = V(f.vx, 0, f.vz), C0 = V(cx, 0, cz);
          const hm = sp.hulls.find((q) => cx > q.x0 - 2 && cx < q.x1 + 2 && cz > q.z0 - 2 && cz < q.z1 + 2) || sp.hull, y0 = -1.0, y1 = (hm.main ? TOP : WH) + 0.5, n = Math.max(2, Math.ceil(long / (TS * 1.5)));
          for (let k = 0; k < n; k++) {
            const t0 = long * k / n, t1 = long * (k + 1) / n, P = (t: number, out: number, y: number) => C0.clone().addScaledVector(u, t).addScaledVector(v, out * short * (1 - t / long)).setY(y);
            hexa(fairM, [P(t0, 0, y0), P(t1, 0, y0), P(t1, 1, y0), P(t0, 1, y0)], [P(t0, 0, y1), P(t1, 0, y1), P(t1, 1, y1), P(t0, 1, y1)]);
          }
        }
      }
      for (const [m, q] of tris) { const geo = new T.BufferGeometry(); geo.setAttribute('position', new T.Float32BufferAttribute(q, 3)); geo.computeVertexNormals(); const mesh = new T.Mesh(geo, m); mesh.frustumCulled = false; g.add(mesh); decor.push(mesh); }
    }
    K.build(g);
    const mk = new T.Group(); g.add(mk); // (nothing's marked on her: she's breached wherever she's rammed. An empty group, for what's kept of the old mark's handle)
    // she's been rammed there (a site: the middle of its stretch of wall, the way out of her): what stood over that stretch of
    // her side is gone with it (each piece whose middle is in the hole), and the lamp's light that fell there
    const holes: number[][] = []; // (where she's been cut open: what's inside her is seen through them, js/interiorcull.ts)
    const cutAt = (x: number, z: number, nx: number, nz: number) => {
      holes.push([x, z, nx, nz]);
      const inHole = (px: number, py: number, pz: number) => { const out = (px - x) * nx + (pz - z) * nz, al = nx ? pz - z : px - x; return Math.abs(al) < 2.3 && out > -0.5 && out < 2.4 && py > -0.9 && py < 3.5; };
      for (const m of decor) {
        const a = m.geometry.attributes.position as THREE.BufferAttribute, q = a.array as Float32Array; let ch = false;
        for (let i = 0; i < q.length; i += 9) {
          if (!inHole((q[i] + q[i + 3] + q[i + 6]) / 3, (q[i + 1] + q[i + 4] + q[i + 7]) / 3, (q[i + 2] + q[i + 5] + q[i + 8]) / 3)) continue;
          for (const k of [3, 6]) { q[i + k] = q[i]; q[i + k + 1] = q[i + 1]; q[i + k + 2] = q[i + 2]; } ch = true;
        }
        if (ch) a.needsUpdate = true;
      }
      for (const w of washes) { const al = nx ? w.position.z - z : w.position.x - x, out = (w.position.x - x) * nx + (w.position.z - z) * nz; if (Math.abs(al) < 1 + 1.7 && out > -0.5 && out < 2.4 && w.position.y < 3.5) { w.removeFromParent(); const k = washAt.get(w); if (k != null && washAll) { const a = washAll.geometry.attributes.position as THREE.BufferAttribute; for (let i = k; i < k + 6; i++) a.setXYZ(i, 0, -1e4, 0); a.needsUpdate = true; } } } // (taken away, not hidden: what hides the level for a jump shows again all it hid) // (any whose light falls on the hole: 3.4 wide)
    };
    // the lamps' washes in one mesh (added light: in any order it's the same), each one's six corners where cutAt can take it away
    const washAt = new Map<THREE.Mesh, number>(); let washAll: THREE.Mesh | null = null;
    if (compactOn.on && washes.length > 1) {
      g.updateMatrixWorld(true); const inv = new T.Matrix4().copy(g.matrixWorld).invert(), M = new T.Matrix4(), v = new T.Vector3(), ng = washG.toNonIndexed(), P = ng.attributes.position, UV = ng.attributes.uv, n = P.count;
      const pos = new Float32Array(washes.length * n * 3), uv = new Float32Array(washes.length * n * 2);
      washes.forEach((w, k) => { M.multiplyMatrices(inv, w.matrixWorld); for (let i = 0; i < n; i++) { v.fromBufferAttribute(P, i).applyMatrix4(M); pos.set([v.x, v.y, v.z], (k * n + i) * 3); uv.set([UV.getX(i), UV.getY(i)], (k * n + i) * 2); } washAt.set(w, k * n); w.removeFromParent(); });
      const geo = new T.BufferGeometry(); geo.setAttribute('position', new T.BufferAttribute(pos, 3)); geo.setAttribute('uv', new T.BufferAttribute(uv, 2)); geo.computeBoundingSphere();
      washAll = new T.Mesh(geo, washM); washAll.renderOrder = 3; washAll.matrixAutoUpdate = false; g.add(washAll); ng.dispose();
    }
    g.userData.prof = 'zone ship hull'; // (the level's own: js/space.ts setupBoard)
    compact(g, [mk, ...guns.map((q) => q.obj), ...decor, ...washes, ...(washAll ? [washAll] : [])]); // (in a few draws: what's turned, cut or taken away left as it is)
    return { group: g, guns, marker: mk, cutAt, holes };
  }

  // ---- A ship under way out in the zone (js/space.ts traffic): seen passing, not boarded. Built bow to -z, her middle at the
  // origin: a hull by her kind (freighter, cutter, pirate, navy, wing: the same lines as the ships that are boarded, in little),
  // engines alight, navigation lights, a strobe that shows a long way off.
  function traffic(kind: string, seed: number): { group: THREE.Group; len: number } {
    const r = G_U.rng(seed >>> 0), R = (a: number, b: number) => a + r() * (b - a), K = new Kit(), g = new T.Group();
    const pal = ({ freighter: [0x8b8f8e, 0x3a3d42], cutter: [0xdfe3e4, 0x7f8a94], pirate: [0x4a3a32, 0x241c1a], navy: [0x69757f, 0x2c3238], wing: [0x59626c, 0x23272c] } as Record<string, number[]>)[kind] || [0x8b8f8e, 0x3a3d42];
    const E = (c: number, k: number) => new T.Color(c).multiplyScalar(k).getHex(), body = M(pal[0], { emissive: E(pal[0], 0.16) }), dark = M(pal[1], { emissive: E(pal[1], 0.16) }), eng = lit(0x7fd0ff), win = lit(0xffe2a8);
    const L = kind === 'navy' ? R(120, 200) : kind === 'freighter' ? R(70, 130) : kind === 'cutter' ? R(40, 65) : R(45, 85), w = L * R(0.16, 0.22), h = L * R(0.07, 0.095);
    const cone = (m: THREE.Material, rad: number, len: number, z: number, sy: number) => { const c = new T.Mesh(new T.ConeGeometry(rad, len, 4), m); c.rotation.order = 'YXZ'; c.rotation.x = -Math.PI / 2; c.rotation.z = Math.PI / 4; c.scale.set(1, 1, 1); c.position.set(0, 0, z - len / 2); const o = new T.Group(); o.scale.y = sy; o.add(c); g.add(o); };
    const plume = (x: number, y: number, z: number, rad: number) => {
      const d = part(g, new T.Mesh(new T.CircleGeometry(rad, 10), eng), x, y, z + 0.2);
      const p = part(g, new T.Mesh(new T.ConeGeometry(rad * 1.1, rad * 9, 10, 1, true), new T.MeshBasicMaterial({ color: 0x5ab4ff, transparent: true, opacity: 0.3, depthWrite: false, blending: T.AdditiveBlending, side: T.DoubleSide })), x, y, z + rad * 4.5); p.rotation.x = Math.PI / 2; void d;
    };
    let aft = L / 2;
    if (kind === 'wing') {
      // two arms swept back from her bow corner
      const al = L * 0.75, aw = L * 0.2;
      for (const sd of [-1, 1]) {
        const arm = new T.Mesh(new T.BoxGeometry(aw, h, al), body), o = new T.Group(); arm.position.set(0, 0, al / 2); o.rotation.y = sd * Math.PI / 4; o.position.set(0, 0, -L * 0.3); o.add(arm);
        const fin = new T.Mesh(new T.BoxGeometry(0.6, h * 1.6, aw * 0.8), dark); fin.position.set(0, h * 1.1, al - aw * 0.4); o.add(fin); g.add(o);
        plume(sd * (al * 0.7071 + aw * 0.1), 0, -L * 0.3 + al * 0.7071 + aw * 0.5, h * 0.45);
      }
      part(g, new T.Mesh(new T.BoxGeometry(aw * 0.9, h * 0.5, aw * 0.9), new T.MeshStandardMaterial({ color: 0x9fd8ff, emissive: 0x24506a, roughness: 0.2 })), 0, h * 0.1, -L * 0.3).rotation.y = Math.PI / 4;
      aft = L * 0.3;
    } else {
      K.box(body, -w / 2, -h / 2, -L * 0.36, w / 2, h / 2, L / 2); K.box(dark, -w * 0.3, h / 2, L * 0.12, w * 0.3, h * 0.95, L * 0.4); K.box(win, -w * 0.3 - 0.05, h * 0.62, L * 0.14, w * 0.3 + 0.05, h * 0.78, L * 0.2);
      cone(kind === 'pirate' ? dark : body, w * 0.7071, kind === 'navy' ? L * 0.34 : kind === 'cutter' ? L * 0.42 : kind === 'pirate' ? L * 0.18 : L * 0.1, -L * 0.36, h / w);
      for (const sd of [-1, 1]) { K.box(win, sd * w / 2 - 0.06, -h * 0.1, -L * 0.3, sd * w / 2 + 0.06, h * 0.12, L * 0.4); }
      const n = kind === 'navy' ? 3 : 2;
      for (let k = 0; k < n; k++) { const x = (k - (n - 1) / 2) * w * 0.34; K.box(dark, x - w * 0.13, -h * 0.35, L / 2, x + w * 0.13, h * 0.35, L / 2 + h * 0.6); plume(x, 0, L / 2 + h * 0.6, h * 0.3); }
      if (kind === 'freighter') { const C = [0xb5651d, 0x2d5f8a, 0x4f7a3a, 0x9a2f25, 0xc9a227].map((c) => M(c, { emissive: E(c, 0.14) })); for (let z = -L * 0.3; z < L * 0.06; z += h * 1.05) for (const x of [-w * 0.24, w * 0.24]) if (r() < 0.8) K.box(C[Math.floor(r() * C.length)], x - w * 0.2, h / 2, z, x + w * 0.2, h / 2 + h * R(0.45, 0.9), z + h); }
      if (kind === 'navy') { for (const sd of [-1, 1]) K.box(dark, sd * w * 0.3 - 0.4, h / 2, L * 0.34, sd * w * 0.3 + 0.4, h * 1.7, L * 0.5); K.box(dark, -w * 0.18, h * 0.95, L * 0.16, w * 0.18, h * 1.3, L * 0.3); K.box(dark, -0.25, h * 1.3, L * 0.22, 0.25, h * 2.3, L * 0.24); }
      if (kind === 'cutter') K.box(body, -0.3, h / 2, L * 0.3, 0.3, h * 1.8, L * 0.48);
      if (kind === 'pirate') { const rust = M(0x5a3222, { emissive: 0x100806 }); for (let k = 0; k < 6; k++) { const z = R(-L * 0.3, L * 0.4), sd = r() < 0.5 ? -1 : 1; K.box(rust, sd * w / 2, R(-h * 0.4, 0), z, sd * (w / 2 + R(0.6, 2)), R(0.1, h * 0.5), z + R(3, 8)); } K.box(dark, w / 2, h * 0.2, -L * 0.05, w / 2 + L * 0.16, h * 0.32, -L * 0.03); }
    }
    K.build(g);
    // her lights: red to port, green to starboard, a white strobe over her back (js/space.ts blinks it)
    for (const [c, x] of [[0xff3528, -w / 2 - 0.4], [0x30ff60, w / 2 + 0.4]] as number[][]) part(g, new T.Mesh(new T.SphereGeometry(Math.max(0.7, L * 0.008), 6, 5), lit(c)), kind === 'wing' ? x * 2.2 : x, 0, kind === 'wing' ? L * 0.1 : 0);
    const st = part(g, new T.Mesh(new T.SphereGeometry(Math.max(1.2, L * 0.014), 6, 5), lit(0xffffff)), 0, h * 1.6, aft * 0.5); g.userData.strobe = st;
    compact(g, [st]);
    return { group: g, len: L };
  }

  // ---- the asteroid the base is cut into: a rock three kilometres through, a hollow planed into its top for the hangar
  // (flat for 70 m round the level, then walls 90 m high, then the rock's own curve). height(x, z): its surface there.
  function asteroid(Wm: number, Hm: number, seed: number) {
    const R = 1500, r = G_U.rng(seed), cx = Wm / 2, cz = Hm / 2, U = G_U;
    const waves = Array.from({ length: 7 }, () => ({ d: new T.Vector3(r() - 0.5, r() - 0.5, r() - 0.5).normalize(), f: 1.5 + r() * 5, a: 30 + r() * 90, ph: r() * 6 }));
    const lump = (n: THREE.Vector3) => { let h = 0; for (const w of waves) h += Math.sin(n.dot(w.d) * w.f + w.ph) * w.a; return h * 0.5; };
    const height = (x: number, z: number) => {
      const dx = Math.max(0, Math.abs(x - cx) - Wm / 2), dz = Math.max(0, Math.abs(z - cz) - Hm / 2), d = Math.hypot(dx, dz), hx = Math.hypot(x - cx, z - cz);
      const sph = hx < R ? Math.sqrt(R * R - hx * hx) - R : -R, u = U.clamp((d - 70) / 350, 0, 1), k = U.smooth(70, 420, d);
      return -0.35 * (1 - k) + sph * k + Math.sin(u * Math.PI) * 90 + Math.sin(x * 0.021 + 1.3) * Math.cos(z * 0.017) * 14 * U.smooth(90, 300, d);
    };
    const g = new T.Group(), mat = new T.MeshStandardMaterial({ vertexColors: true, roughness: 1, metalness: 0, flatShading: true, emissive: 0x0b0a09 });
    const tint = (col: number[], x: number, z: number) => { const c = 0.2 + 0.08 * Math.sin(x * 0.011 + z * 0.017) + 0.06 * (r() - 0.5); col.push(c * 1.05, c, c * 0.94); };
    // the rock: lumps on a sphere, its top (where the hollow's own ground is laid over it) sunk out of the way
    const geo = new T.IcosahedronGeometry(R, 5), p = geo.attributes.position as THREE.BufferAttribute, v = new T.Vector3(), col: number[] = [];
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i);
      const n = v.clone().normalize(), hx = Math.hypot(v.x, v.z), top = v.y > 0 ? 1 - U.smooth(700, 1250, hx) : 0;
      v.addScaledVector(n, lump(n) * (1 - top));
      p.setXYZ(i, v.x + cx, v.y - R - top * 120, v.z + cz); tint(col, v.x, v.z);
    }
    geo.setAttribute('color', new T.BufferAttribute(new Float32Array(col), 3)); geo.computeVertexNormals();
    const m = new T.Mesh(geo, mat); m.frustumCulled = false; g.add(m);
    // the hollow's ground, finer: a sheet 14 m to a cell
    const GX = 100, GZ = 124, x0 = cx - 720, z0 = cz - 890, cs = 14.4, pos: number[] = [], c2: number[] = [], idx: number[] = [];
    for (let j = 0; j <= GZ; j++) for (let i = 0; i <= GX; i++) { const x = x0 + i * cs, z = z0 + j * cs; pos.push(x, height(x, z), z); tint(c2, x, z); }
    for (let j = 0; j < GZ; j++) for (let i = 0; i < GX; i++) { const a = j * (GX + 1) + i, b = a + 1, c = a + GX + 1, d = c + 1; idx.push(a, c, b, b, c, d); }
    const gg = new T.BufferGeometry(); gg.setAttribute('position', new T.Float32BufferAttribute(pos, 3)); gg.setAttribute('color', new T.Float32BufferAttribute(c2, 3)); gg.setIndex(idx); gg.computeVertexNormals();
    const gm = new T.Mesh(gg, mat); gm.frustumCulled = false; g.add(gm);
    // beacons round the hollow's rim
    const red = lit(0xff5030);
    for (let k = 0; k < 12; k++) { const a = k / 12 * Math.PI * 2, x = cx + Math.cos(a) * (Wm / 2 + 250), z = cz + Math.sin(a) * (Hm / 2 + 250); part(g, new T.Mesh(new T.BoxGeometry(3, 3, 3), red), x, height(x, z) + 6, z); }
    return { group: g, height, R, C: new T.Vector3(cx, -R, cz) };
  }
  // ---- a field of asteroids (js/spacedata.ts rocks): lumpy rocks, a few shapes each drawn as many as there are of it at once
  // (InstancedMesh), each rock its own size and turn. Dark: lit by the system's star alone, their night sides near black.
  const ROCK_SHAPES = 6;
  // (a rock's surface, as a function of the way out from its middle: so every level of detail of it is the same rock, the finer
  // ones only showing more of it. Its big lumps and craters, then ridges and bumps, then small craters (each with its rim) and
  // grit; how far out (h, about 1) and how light the rock is there (c))
  function rockShape(k: number) {
    const r = G_U.rng(0x51ce + k * 977), V = () => new T.Vector3(r() - 0.5, r() - 0.5, r() - 0.5).normalize();
    const waves = Array.from({ length: 7 }, () => ({ d: V(), f: 1.2 + r() * 4.5, a: 0.04 + r() * 0.12, ph: r() * 6 }));
    const pits = Array.from({ length: 5 }, () => ({ d: V(), w: 0.15 + r() * 0.3, a: 0.06 + r() * 0.12 }));
    const fine = Array.from({ length: 30 }, (_, i) => { const f = 7 + Math.pow(r(), 1.5) * 55; return { d: V(), f, a: 0.11 / f * (i % 3 === 0 ? 1.6 : 1), ph: r() * 6, ridge: i % 4 === 0 }; });
    const craters = Array.from({ length: 46 }, () => { const w = 0.012 + Math.pow(r(), 2) * 0.09; return { d: V(), w, a: w * (0.35 + r() * 0.3) }; });
    const flat = new T.Vector3(1 + (r() - 0.5) * 0.5, 0.7 + r() * 0.35, 1 + (r() - 0.5) * 0.4); // (none of them round)
    const tone = 0.24 + r() * 0.1, warm = r() * 0.06;
    const at = (n: THREE.Vector3) => {
      let h = 1, g = 0;
      for (const w of waves) h += Math.sin(n.dot(w.d) * w.f + w.ph) * w.a;
      for (const q of pits) { const c = 1 - n.dot(q.d); if (c < q.w) h -= q.a * (1 - c / q.w) ** 2; } // (big craters: dished in)
      for (const w of fine) { const s = Math.sin(n.dot(w.d) * w.f + w.ph); const v = w.ridge ? (1 - Math.abs(s)) * 2 - 1 : s; h += v * w.a; g += v * w.a; }
      for (const q of craters) { const c = Math.sqrt(Math.max(0, 2 * (1 - n.dot(q.d)))) / q.w; if (c < 1.35) { h += c < 1 ? -q.a * (1 - c * c) + q.a * 0.25 * c ** 6 : q.a * 0.25 * Math.max(0, 1 - (c - 1) / 0.35) ** 2; if (c < 1) g -= q.a * 0.8; } } // (small ones: a bowl, a raised rim)
      return { h, c: tone * (0.9 + 0.12 * Math.sin(n.x * 9 + n.y * 7 + k) + (h - 1) * 0.5 + g * 3) };
    };
    return { at, flat, warm };
  }
  // one level of detail of it: an icosphere (its vertices shared, so it shades smooth) put out to the surface
  function rockGeo(k: number, detail: number) {
    const sh = rockShape(k), src = new T.IcosahedronGeometry(1, detail), sp = src.attributes.position as THREE.BufferAttribute;
    const key = new Map<string, number>(), idx: number[] = [], pos: number[] = [], col: number[] = [], v = new T.Vector3();
    for (let i = 0; i < sp.count; i++) {
      v.fromBufferAttribute(sp, i).normalize(); const kk = Math.round(v.x * 1e5) + ',' + Math.round(v.y * 1e5) + ',' + Math.round(v.z * 1e5);
      let j = key.get(kk);
      if (j === undefined) { j = pos.length / 3; key.set(kk, j); const s = sh.at(v); const p = v.clone().multiplyScalar(s.h).multiply(sh.flat); pos.push(p.x, p.y, p.z); const c = Math.max(0.05, s.c); col.push(c * (1 + sh.warm), c, c * (1 - sh.warm)); }
      idx.push(j);
    }
    src.dispose();
    const geo = new T.BufferGeometry(); geo.setAttribute('position', new T.Float32BufferAttribute(pos, 3)); geo.setAttribute('color', new T.Float32BufferAttribute(col, 3)); geo.setIndex(idx); geo.computeVertexNormals();
    return geo;
  }
  // The levels of detail: the finest for a rock filling much of the view, the coarsest for one a speck. Which one a rock is drawn
  // at goes by how big it looks (its size over its distance from the camera: update, a frame); each shape a mesh a level, each of
  // those drawing however many of its rocks are at that level.
  // (three's detail: each face cut in (detail+1)^2: some 22k, 3.4k, 720, 180, 80 and 20 triangles. At 'at' (radius over distance)
  // a rock is about 1650*at pixels across on a 1080p screen: 500, 100, 20, 8, 4 and 2; smaller than the last: not drawn)
  const ROCK_LOD = [{ detail: 32, at: 0.3 }, { detail: 12, at: 0.06 }, { detail: 5, at: 0.012 }, { detail: 2, at: 0.005 }, { detail: 1, at: 0.0024 }, { detail: 0, at: 0.0012 }];
  const rockGeos = new Map<string, THREE.BufferGeometry>(); // (made once, kept: the same shapes every field)
  // Every shape at every level made ahead, a piece at a time (js/space.ts prep: once a frame, after it's drawn, while there's a
  // millisecond or two to spare): so the first rock come close to doesn't stop the frame making its finest level. ms: how long it may
  // take this time (it stops after the piece that runs past it). true once they're all made.
  function rockPrep(ms: number) {
    const t0 = performance.now();
    for (let k = 0; k < ROCK_SHAPES; k++) for (const lv of ROCK_LOD) {
      const gk = k + ':' + lv.detail; if (rockGeos.has(gk)) continue;
      if (performance.now() - t0 > ms) return false;
      rockGeos.set(gk, rockGeo(k, lv.detail));
    }
    return true;
  }
  function rockMat() {
    const mat = new T.MeshStandardMaterial({ vertexColors: true, roughness: 1, metalness: 0 });
    // (hard-lit: out here there's no sky to fill the night side, so the scene's fill (the hemisphere's) is all but taken out of
    // them, after the light grid's own patch (js/lightgrid.ts): the side away from the star near black, the side toward it bright)
    mat.onBeforeCompile = (sh, rd) => { (T.MeshStandardMaterial.prototype.onBeforeCompile as any).call(mat, sh, rd); sh.fragmentShader = sh.fragmentShader.replace('#include <lights_fragment_end>', ['#if defined( RE_IndirectDiffuse )', ' irradiance *= 0.06;', '#endif', '#include <lights_fragment_end>'].join(String.fromCharCode(10))).replace('if (lgL.a > 0.02) {', 'if (false) {'); }; // (nor the level's light grid: out here its edge would light them)
    mat.customProgramCacheKey = () => 'rock-hardlit';
    mat.envMapIntensity = 0.04; // (nor the scene's environment's light: it would fill them as the sky does)
    return mat;
  }
  function rockField(list: { p: number[]; r: number; s: number }[]) {
    const g = new T.Group(), mat = rockMat();
    const by: { p: number[]; r: number; s: number }[][] = Array.from({ length: ROCK_SHAPES }, () => []); for (const q of list) by[q.s % ROCK_SHAPES].push(q);
    const q4 = new T.Quaternion(), e = new T.Euler(), sc = new T.Vector3(), ps = new T.Vector3();
    const sets = by.map((qs, k) => {
      const ms = qs.map((q) => { const r = G_U.rng(q.s); e.set(r() * 6.28, r() * 6.28, r() * 6.28); q4.setFromEuler(e); sc.setScalar(q.r); return new T.Matrix4().compose(ps.set(q.p[0], q.p[1], q.p[2]), q4, sc); });
      const ims: (THREE.InstancedMesh | null)[] = ROCK_LOD.map(() => null); // (a level's mesh made the first time one of its rocks is wanted at it: the finest only once something's come close)
      const im = (L: number) => { let m = ims[L]; if (!m) { const gk = k + ':' + ROCK_LOD[L].detail; let geo = rockGeos.get(gk); if (!geo) { geo = rockGeo(k, ROCK_LOD[L].detail); rockGeos.set(gk, geo); } m = ims[L] = new T.InstancedMesh(geo, mat, qs.length); m.frustumCulled = false; m.count = 0; g.add(m); } return m; };
      return { qs, ms, ims, im, lv: new Int8Array(qs.length).fill(-2) };
    });
    const cnt = ROCK_LOD.map(() => 0);
    // (cam: the camera's place, in the field's own frame; view: the camera itself, when there is one: a rock out of its view isn't
    // drawn either: its sphere (with room for its bumps, and a few degrees more for the camera turning before the frame's drawn)
    // tested against the view's planes, brought into the field's frame)
    const fr = new T.Frustum(), vm = new T.Matrix4(), sph = new T.Sphere();
    function update(cam: THREE.Vector3, view?: THREE.Camera) {
      if (view) { view.updateMatrixWorld(); g.updateWorldMatrix(true, false); fr.setFromProjectionMatrix(vm.multiplyMatrices(view.projectionMatrix, view.matrixWorldInverse).multiply(g.matrixWorld)); }
      for (const st of sets) {
        if (!st.qs.length) continue; let changed = false;
        for (let i = 0; i < st.qs.length; i++) { const q = st.qs[i], dc = Math.hypot(cam.x - q.p[0], cam.y - q.p[1], cam.z - q.p[2]), d = Math.max(1, dc - q.r * 0.5), look = q.r / d; let L = 0; while (L < ROCK_LOD.length && look < ROCK_LOD[L].at) L++; if (L === ROCK_LOD.length) L = -1; /* (-1: too small to draw) */
          if (L >= 0 && view) { sph.center.set(q.p[0], q.p[1], q.p[2]); sph.radius = q.r * 1.6 + dc * 0.06; if (!fr.intersectsSphere(sph)) L = -1; } /* (-1 too: out of view) */
          if (st.lv[i] !== L) { st.lv[i] = L; changed = true; } }
        if (!changed) continue;
        cnt.fill(0);
        for (let i = 0; i < st.qs.length; i++) { const L = st.lv[i]; if (L >= 0) st.im(L).setMatrixAt(cnt[L]++, st.ms[i]); }
        st.ims.forEach((m, L) => { if (m) { m.count = cnt[L]; m.instanceMatrix.needsUpdate = true; } });
      }
    }
    update(new T.Vector3(1e9, 0, 0));
    g.userData.lod = update; g.userData.prof = 'rocks';
    return g;
  }
  // ---- the system's star (js/spacedata.ts star), seen from here: a disc as wide as it looks (size, its angular radius) and its
  // glow round it, both always as far off (D, round the camera, as the stars are) and drawn over them but under everything else;
  // a protostar in its dust, a white dwarf in the shell it threw off (a ring), a giant's face mottled with its convection.
  function starModel(sd: { stage: string; col: number; size: number; glow: number; neb: number | null; ring: boolean }) {
    const D = 850, g = new T.Group(), c = new T.Color(sd.col), hex = (k: number, a: number) => `rgba(${Math.round(Math.min(1, c.r * k) * 255)},${Math.round(Math.min(1, c.g * k) * 255)},${Math.round(Math.min(1, c.b * k) * 255)},${a})`;
    const sprite = (tex: THREE.Texture, rad: number, order: number, tint: number | THREE.Color = 0xffffff) => { const m = new T.SpriteMaterial({ map: tex, color: tint, transparent: false, blending: T.AdditiveBlending, depthTest: false, depthWrite: false, fog: false }); const s = new T.Sprite(m); const w = 2 * D * Math.tan(rad); s.scale.set(w, w, 1); s.position.set(0, 0, -D); s.renderOrder = order; s.frustumCulled = false; g.add(s); return s; };
    const R = sd.size, r = G_U.rng(Math.round(sd.size * 1e5) ^ sd.col);
    // its glow: bright near its edge, fading out to glow radii
    const glow = canvasTex(256, 256, (x, w, h) => { const gr = x.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2); const k = 1 / sd.glow; gr.addColorStop(0, hex(1, 0.85)); gr.addColorStop(Math.min(0.9, k), hex(1, 0.4)); gr.addColorStop(Math.min(0.95, k * 1.8), hex(0.9, 0.07)); gr.addColorStop(1, hex(0.8, 0)); x.fillStyle = gr; x.fillRect(0, 0, w, h); });
    sprite(glow.tex, Math.min(1.2, R * sd.glow), -8);
    // its face: limb-darkened, a giant's mottled
    const disc = canvasTex(256, 256, (x, w, h) => {
      const gr = x.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2 - 2); gr.addColorStop(0, 'rgba(255,255,250,1)'); gr.addColorStop(0.55, hex(1.15, 1)); gr.addColorStop(0.92, hex(0.85, 1)); gr.addColorStop(1, hex(0.6, 0)); x.fillStyle = gr; x.beginPath(); x.arc(w / 2, h / 2, w / 2 - 2, 0, 7); x.fill();
      if (sd.stage === 'redgiant') { x.globalCompositeOperation = 'source-atop'; for (let i = 0; i < 160; i++) { const a = r() * 6.28, d = Math.sqrt(r()) * (w / 2 - 10); x.fillStyle = r() < 0.5 ? 'rgba(120,30,10,0.1)' : 'rgba(255,200,140,0.08)'; x.beginPath(); x.arc(w / 2 + Math.cos(a) * d, h / 2 + Math.sin(a) * d, 5 + r() * 14, 0, 7); x.fill(); } }
    });
    sprite(disc.tex, Math.max(R, 0.0012), -7, new T.Color(2.6, 2.6, 2.6)); // (over-bright: its face burns out to white, as a star's does)
    if (sd.stage === 'whitedwarf' || sd.stage === 'bluegiant') { // (a point too bright to look at: diffraction spikes)
      const sp = canvasTex(256, 256, (x, w, h) => { for (const [ax, ay] of [[1, 0], [0, 1], [0.7071, 0.7071], [0.7071, -0.7071]]) { const gr = x.createLinearGradient(w / 2 - ax * w / 2, h / 2 - ay * h / 2, w / 2 + ax * w / 2, h / 2 + ay * h / 2); gr.addColorStop(0, hex(1, 0)); gr.addColorStop(0.5, hex(1, ax && ay ? 0.25 : 0.55)); gr.addColorStop(1, hex(1, 0)); x.strokeStyle = gr; x.lineWidth = 2; x.beginPath(); x.moveTo(w / 2 - ax * w / 2, h / 2 - ay * h / 2); x.lineTo(w / 2 + ax * w / 2, h / 2 + ay * h / 2); x.stroke(); } });
      sprite(sp.tex, sd.stage === 'whitedwarf' ? 0.09 : 0.14, -7);
    }
    if (sd.neb != null) { // (a cloud round it: a protostar's dust, irregular; a white dwarf's shell, a ring)
      const nc = new T.Color(sd.neb), rgba = (a: number, k = 1) => `rgba(${Math.round(Math.min(1, nc.r * k) * 255)},${Math.round(Math.min(1, nc.g * k) * 255)},${Math.round(Math.min(1, nc.b * k) * 255)},${a})`;
      const neb = canvasTex(512, 512, (x, w, h) => {
        if (sd.ring) { for (let i = 0; i < 900; i++) { const a = r() * 6.28, d = w * (0.3 + (r() + r() + r()) / 3 * 0.12); x.fillStyle = r() < 0.3 ? `rgba(220,90,150,${0.05 + r() * 0.05})` : rgba(0.04 + r() * 0.06, 1.3); x.beginPath(); x.arc(w / 2 + Math.cos(a) * d, h / 2 + Math.sin(a) * d * 0.82, 6 + r() * 16, 0, 7); x.fill(); } }
        else { for (let i = 0; i < 600; i++) { const a = r() * 6.28, d = Math.pow(r(), 0.7) * w * 0.45; x.fillStyle = rgba(0.03 + r() * 0.05, 0.6 + r() * 0.8); x.beginPath(); x.arc(w / 2 + Math.cos(a) * d, h / 2 + Math.sin(a) * d * 0.7, 10 + r() * 40, 0, 7); x.fill(); } }
      });
      sprite(neb.tex, sd.ring ? 0.16 : 0.42, -9);
    }
    return { group: g, D };
  }
  // ---- an interspatial anchor: a ring to fly to (60 m across), four pylons, a film of light across it
  function anchor(color = 0x66c8ff) {
    const g = new T.Group(), steel = M(0x59626c, { emissive: 0x101316, metalness: 0.5 }), glow = lit(color);
    const ring = new T.Mesh(new T.TorusGeometry(30, 1.6, 8, 40), steel); g.add(ring);
    const inner = new T.Mesh(new T.TorusGeometry(27.5, 0.35, 6, 40), glow); g.add(inner);
    for (let k = 0; k < 4; k++) { const a = k * Math.PI / 2 + Math.PI / 4, b = new T.Mesh(new T.BoxGeometry(5, 12, 7), steel); b.position.set(Math.cos(a) * 31, Math.sin(a) * 31, 0); b.rotation.z = a - Math.PI / 2; g.add(b); const l = new T.Mesh(new T.BoxGeometry(1, 1, 7.4), glow); l.position.set(Math.cos(a) * 36, Math.sin(a) * 36, 0); g.add(l); }
    const film = new T.Mesh(new T.CircleGeometry(27.5, 40), new T.MeshBasicMaterial({ color, transparent: true, opacity: 0.1, side: T.DoubleSide, depthWrite: false, blending: T.AdditiveBlending })); g.add(film);
    g.userData.film = film; g.userData.prof = 'anchor';
    compact(g, [film]);
    return g;
  }
  // ---- a planet, seen from orbit: a sphere of its ground's colour under cloud, a rim of air
  function planet(th: ThemeDef, seed: number, R: number) {
    const r = G_U.rng(seed), cv = canvasTex(512, 256, (c, w, h) => {
      const base = new T.Color(th.floor as string), sky = new T.Color(th.fog as number);
      c.fillStyle = '#' + base.clone().multiplyScalar(0.8).getHexString(); c.fillRect(0, 0, w, h);
      for (let i = 0; i < 260; i++) { const k = 0.5 + r() * 0.9; c.fillStyle = '#' + base.clone().multiplyScalar(k).lerp(sky, r() * 0.25).getHexString(); c.globalAlpha = 0.5; c.beginPath(); c.ellipse(r() * w, r() * h, 8 + r() * 46, 4 + r() * 18, r() * 3, 0, 7); c.fill(); }
      c.globalAlpha = 0.5; c.fillStyle = '#ffffff';
      for (let i = 0; i < 200; i++) { c.globalAlpha = 0.12 + r() * 0.3; c.beginPath(); c.ellipse(r() * w, r() * h, 10 + r() * 60, 3 + r() * 9, 0, 0, 7); c.fill(); }
      c.globalAlpha = 1;
    });
    const g = new T.Group();
    g.add(new T.Mesh(new T.SphereGeometry(R, 64, 40), new T.MeshStandardMaterial({ map: cv.tex, roughness: 1, metalness: 0, emissive: 0x05070a })));
    g.add(new T.Mesh(new T.SphereGeometry(R * 1.018, 48, 30), new T.MeshBasicMaterial({ color: new T.Color(th.fog as number).lerp(new T.Color(0x9fc8ff), 0.5), transparent: true, opacity: 0.16, side: T.BackSide, depthWrite: false, blending: T.AdditiveBlending })));
    return g;
  }
  // ---- the stars (points on a far sphere, kept round the camera) and the tunnel of a jump (streaks rushing past)
  const RUSH = 320; // (the box round her the motes going by are in: js/space.ts smear)
  function stars(seed: number) {
    const r = G_U.rng(seed), n = 2600, pos = new Float32Array(n * 3), col = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const u = r() * 2 - 1, a = r() * Math.PI * 2, s = Math.sqrt(1 - u * u), k = 0.35 + r() * r() * 0.65, w = r();
      pos.set([s * Math.cos(a) * 900, u * 900, s * Math.sin(a) * 900], i * 3); col.set([k * (0.85 + 0.15 * w), k * 0.92, k * (1 - 0.2 * w)], i * 3);
    }
    const g = new T.BufferGeometry(); g.setAttribute('position', new T.BufferAttribute(pos, 3)); g.setAttribute('color', new T.BufferAttribute(col, 3));
    const pts = new T.Points(g, new T.PointsMaterial({ size: 1.6, sizeAttenuation: false, vertexColors: true, fog: false, depthWrite: false, depthTest: false }));
    pts.frustumCulled = false; pts.renderOrder = -10;
    // the drive's smear (warp, jump): each star a line as well, flying out from the point she's flying at (f, in the stars' own
    // frame) and on past her, over and over (each its own way out from there and its own time along it: tm, how far the drive's
    // gone), its tail back the way it came, longer the faster (k); faded in leaving the middle and out going by. Nothing at k 0.
    // All on the graphics card: k, f and tm a frame.
    const lp = new Float32Array(n * 6), lc = new Float32Array(n * 6), le = new Float32Array(n * 2);
    for (let i = 0; i < n; i++) { for (let e = 0; e < 2; e++) { lp.set(pos.subarray(i * 3, i * 3 + 3), (i * 2 + e) * 3); lc.set(col.subarray(i * 3, i * 3 + 3), (i * 2 + e) * 3); le[i * 2 + e] = e; } }
    const lg = new T.BufferGeometry(); lg.setAttribute('position', new T.BufferAttribute(lp, 3)); lg.setAttribute('color', new T.BufferAttribute(lc, 3)); lg.setAttribute('head', new T.BufferAttribute(le, 1));
    const lm = new T.ShaderMaterial({
      uniforms: { f: { value: new T.Vector3(0, 0, -1) }, k: { value: 0 }, tr: { value: new T.Vector3() }, R: { value: RUSH }, tm: { value: 0 }, mk: { value: 0 } }, transparent: false, depthWrite: false, /* (drawn with the opaque things, first: the ship's inside over it) */ depthTest: false, blending: T.AdditiveBlending, vertexColors: true,
      vertexShader: 'attribute float head; uniform vec3 f; uniform float k; uniform float tm; varying vec3 vC; float h(vec3 p) { return fract(sin(dot(p, vec3(12.9898, 78.233, 37.719))) * 43758.5453); } void main() { vec3 d = normalize(position); float s = fract(h(position) + tm * (0.5 + 0.8 * h(position.yzx))); vec3 e = d - f * dot(d, f); float le = length(e); e = le > 1e-4 ? e / le : normalize(cross(f, vec3(0.3, 1.0, 0.2))); float th = mix(0.02, 2.5, s * s), a = head > 0.5 ? th : max(0.0, th - k * (0.12 + 0.8 * s)); vec3 p = f * cos(a) + e * sin(a); float fade = smoothstep(0.06, 0.45, th) * (1.0 - smoothstep(0.82, 1.0, s)); vC = color * mix(0.12, 1.25, head) * fade * min(1.0, k * 5.0); gl_Position = projectionMatrix * modelViewMatrix * vec4(p * 900.0, 1.0); }',
      fragmentShader: 'varying vec3 vC; void main() { gl_FragColor = vec4(vC, 1.0); }',
    });
    const streaks = new T.LineSegments(lg, lm); streaks.frustumCulled = false; streaks.renderOrder = -9; pts.add(streaks); // (always drawn, black at k 0: its shader made with the stars', not the moment a drive starts)
    // and near her, motes going by: in a box 2R across round her (wrapped, so there are always more), each moved back past her by
    // how far she's gone (tr) and drawn as a line back toward where it came from, longer the faster she goes (k); faded in at the
    // box's far edge and out as it goes by, so none of them pops. What the drive's doing, seen going past.
    const nr = 160, rp = new Float32Array(nr * 6), rc = new Float32Array(nr * 6), re = new Float32Array(nr * 2);
    for (let i = 0; i < nr; i++) {
      const x = (r() * 2 - 1) * RUSH, y = (r() * 2 - 1) * RUSH, z = (r() * 2 - 1) * RUSH, k = 0.5 + r() * 0.5, w = r();
      for (let e = 0; e < 2; e++) { rp.set([x, y, z], (i * 2 + e) * 3); rc.set([k * (0.8 + 0.2 * w), k * 0.9, k], (i * 2 + e) * 3); re[i * 2 + e] = e; }
    }
    const rg = new T.BufferGeometry(); rg.setAttribute('position', new T.BufferAttribute(rp, 3)); rg.setAttribute('color', new T.BufferAttribute(rc, 3)); rg.setAttribute('head', new T.BufferAttribute(re, 1));
    const rm = new T.ShaderMaterial({
      uniforms: lm.uniforms, transparent: false, depthWrite: false, depthTest: false, blending: T.AdditiveBlending, vertexColors: true,
      vertexShader: 'attribute float head; uniform vec3 f; uniform vec3 tr; uniform float k; uniform float mk; uniform float R; varying vec3 vC; void main() { vec3 p = mod(position - tr + R, 2.0 * R) - R; float d = length(p); vec3 q = head > 0.5 ? p : p + f * (k * 260.0); float fade = (1.0 - smoothstep(0.5 * R, R, d)) * smoothstep(6.0, 40.0, d); vC = color * mix(0.0, 1.3, head) * fade * clamp(mk * 4.0 - 0.05, 0.0, 1.0); gl_Position = projectionMatrix * modelViewMatrix * vec4(q, 1.0); }',
      fragmentShader: 'varying vec3 vC; void main() { gl_FragColor = vec4(vC, 1.0); }',
    });
    const rush = new T.LineSegments(rg, rm); rush.frustumCulled = false; rush.renderOrder = -9; pts.add(rush);
    pts.userData.streak = lm.uniforms; pts.userData.streaks = streaks;
    return pts;
  }
  function tunnel() {
    const cv = canvasTex(256, 512, (c, w, h) => {
      c.fillStyle = '#000'; c.fillRect(0, 0, w, h);
      for (let i = 0; i < 150; i++) { const x = Math.random() * w, y = Math.random() * h, l = 30 + Math.random() * 220, a = 0.25 + Math.random() * 0.75; const gr = c.createLinearGradient(0, y, 0, y + l); gr.addColorStop(0, 'rgba(160,210,255,0)'); gr.addColorStop(0.5, `rgba(${180 + Math.random() * 75 | 0},${220 + Math.random() * 35 | 0},255,${a})`); gr.addColorStop(1, 'rgba(160,210,255,0)'); c.fillStyle = gr; c.fillRect(x, y, 1 + Math.random() * 2, l); c.fillRect(x, y - h, 1 + Math.random() * 2, l); }
    });
    cv.tex.wrapS = cv.tex.wrapT = T.RepeatWrapping; cv.tex.repeat.set(3, 2);
    const m = new T.Mesh(new T.CylinderGeometry(55, 55, 2400, 28, 1, true), new T.MeshBasicMaterial({ map: cv.tex, side: T.BackSide, transparent: true, depthWrite: false, blending: T.AdditiveBlending, fog: false }));
    m.rotation.x = Math.PI / 2; m.frustumCulled = false; m.renderOrder = -5;
    const g = new T.Group(); g.add(m); g.userData.tex = cv.tex; g.userData.mat = m.material;
    return g;
  }
  return { PAINT, boot, traffic, ship, hull, asteroid, anchor, planet, stars, tunnel, rockField, rockPrep, starModel, compact, compactOn, M, lit, canvasTex, has: (id: string) => MODELS.has(id) };
})();
