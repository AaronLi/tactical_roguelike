'use strict';
import { LightGrid } from './lightgrid.js';
// The people's shadows: the lamps are baked into the light grid (js/lightgrid.ts), so nothing that moves shades anything from them. Each
// person near you (the nearest 12 in view range, alive or down) is a few capsules from their joints as they stand this frame: the body
// (the head to the hips), the thighs together (the hips to between the knees), and each shin (the knee to the foot). The level's shader
// shadows what's near a capsule from each lamp that lights it, softly, and darkens a little under and round it (FS_BODY). No pass of its
// own, nothing drawn twice, no texture: a few uniforms.
//   track(rig)          a person, from Rig.create (kept while their root's in the scene; let go once it hasn't been for a while)
//   frame(scene, eye)   each frame, before it's drawn: the capsules
//   before(), after()   the level's scene's drawing (render.ts): lgLevel on for it, off for any other scene (the gun's in your hands)
// ?shadows=0 in the URL turns them off.
export const EntShadows = (() => {
  const T = THREE, MAX = 12, PER = 4, RANGE = 30, OFF = typeof location !== 'undefined' && new URLSearchParams(location.search).get('shadows') === '0';
  const U = LightGrid.U as any, rigs = new Map<any, number>(); // (rig -> frames since it was last seen in the scene)
  const v0 = new T.Vector3(), v1 = new T.Vector3(), v2 = new T.Vector3(), v3 = new T.Vector3(), v4 = new T.Vector3(), v5 = new T.Vector3();
  let n = 0;
  function track(rig: any) { if (rig && rig.root) rigs.set(rig, 0); }
  // in the scene and shown: its root's chain up to the scene, every one visible
  const shown = (o: THREE.Object3D, scene: THREE.Scene) => { for (let p: THREE.Object3D | null = o; p; p = p.parent) { if (!p.visible) return false; if (p === scene) return true; } return false; };
  function frame(scene: THREE.Scene, eye: THREE.Vector3) {
    n = 0;
    if (OFF) { U.lgCapN.value = 0; return; }
    const near: [any, number][] = [];
    for (const [rig, gone] of rigs) {
      if (!shown(rig.root, scene)) { if (gone > 600) rigs.delete(rig); else rigs.set(rig, gone + 1); continue; }
      rigs.set(rig, 0);
      const d = rig.hips.getWorldPosition(v0).distanceTo(eye); if (d < RANGE) near.push([rig, d]);
    }
    near.sort((a, b) => a[1] - b[1]);
    const A = U.lgCapA.value as THREE.Vector4[], B = U.lgCapB.value as THREE.Vector4[];
    const cap = (a: THREE.Vector3, b: THREE.Vector3, r: number) => { A[n].set(a.x, a.y, a.z, r); B[n].set(b.x, b.y, b.z, 0); n++; };
    for (const [rig] of near.slice(0, MAX)) {
      if (n + PER > A.length) break;
      const s = rig.scale || 1, head = rig.head.getWorldPosition(v0), hips = rig.hips.getWorldPosition(v1);
      const kL = rig.legL.sh.getWorldPosition(v2), kR = rig.legR.sh.getWorldPosition(v3);
      const fL = rig.legL.sh.localToWorld(v4.set(0, -0.44, 0)), fR = rig.legR.sh.localToWorld(v5.set(0, -0.44, 0));
      head.addScaledVector(head.clone().sub(hips).normalize(), 0.1 * s); // (to the top of the head)
      cap(head, hips, 0.19 * s);
      cap(hips, kL.clone().add(kR).multiplyScalar(0.5), 0.15 * s);
      cap(kL, fL, 0.07 * s); cap(kR, fR, 0.07 * s);
    }
    U.lgCapN.value = n;
  }
  function before() { U.lgLevel.value = 1; }
  function after() { U.lgLevel.value = 0; }
  return { track, frame, before, after, get count() { return n / PER; }, get tracked() { return rigs.size; } };
})();
