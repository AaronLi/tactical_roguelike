'use strict';
import { Gear } from './gear.js';
import { Humans } from './humans.js';
// What's put on the head here (in the head's frame of js/rig.ts: y up from the neck joint, the face toward -z, metres): night
// vision on a helmet's mount (an arm down to the bridge and its tubes in front of the eyes, swung up over the brow when it's off:
// nvg), its parts the shared gear made in Blender (models/characters/build_gear.py). The helmets, the face pieces, the caps and
// the bandanas are each body's own, made on its head (models/characters/kit_head.py); MODELS is each helmet's colour and cut.
export const Headgear = (() => {
  const T = THREE, PI = Math.PI;
  type V3 = [number, number, number];
  type Mat = (c: number, o?: Record<string, any>) => THREE.Material; // (rig.ts's kit materials)
  type Put = (m: THREE.Object3D) => void;
  interface Model { cut: string; col: number }
  const C0: V3 = [0, 0.137, 0]; // the dome's centre (the cranium's is 0.13)
  const SC: V3 = [1, 1.02, 1.1]; // a little longer front to back than it is wide, as heads are

  // where a point on the dome is (for hanging things off it)
  const at = (r: number, a: number, th: number) => new T.Vector3(C0[0] + r * Math.sin(th) * Math.sin(a) * SC[0], C0[1] + r * Math.cos(th) * SC[1], C0[2] - r * Math.sin(th) * Math.cos(a) * SC[2]);
  const MODELS: Record<string, Model> = {
    'h.bump': { cut: 'high', col: 0x3a3d40 },
    'h.fast': { cut: 'high', col: 0x6a5f46 },
    'h.ach': { cut: 'mid', col: 0x4a5040 },
    'h.rifle': { cut: 'mid', col: 0x2e3236 },
  };
  const R0 = 0.125; // (the dome a mount's put on, without the body's own: where night vision hinges)

  // Night vision on the helmet's mount ('n.mono', 'n.bino', 'n.pano', 'n.fuse'): the body's own gear (Humans.gear: made in Blender,
  // models/characters/build_gear.py). The mount stays put; what hangs from it (the arm, the bridge and the tubes, an eyecup at the back
  // of each and its objective lens in front) is in a pivot at the hinge, drawn down in front of the eyes. Its rotation.x swings it:
  // 0 down, NV_UP up over the brow, tubes pointing up. A panoramic's outer pair are canted out; a fused set has the thermal core on
  // top of the bridge; the quads' battery pack rides at the back of the helmet as a counterweight. The eyepieces glow faintly with
  // the phosphor when they're on (lit: to show or not). Returns { pivot, lit }.
  const NV_UP = 1.95, glowMats: Record<string, THREE.MeshBasicMaterial> = {};
  const NVCOL: Record<string, number> = { nvbody: 0x2c3034, nvrubber: 0x101112, nvdark: 0x1a1c1e, nvlens: 0x05080a, nvthermal: 0x3a3428, nvwindow: 0x2a1a08, nvbatt: 0x24272a };
  function nvg(id: string, _helmetId: string, mat: Mat, put: Put, hingeAt?: THREE.Vector3 | null) {
    const d = Gear && Gear.DEFS[id], v = d && d.nv, n = v ? v.tubes.length : 2;
    const hinge = hingeAt || at(R0 + 0.018, 0, PI * 0.36);
    const key = (v ? (v.phos[0] > 0.6 ? 'w' : 'g') : 'g'), glow = glowMats[key] || (glowMats[key] = new T.MeshBasicMaterial({ color: key === 'w' ? 0x9fb8ff : 0x3aff7a }));
    const lit: THREE.Mesh[] = [];
    // a node of the gear, its own: its materials the game's (by name), its geometry the file's (shared: never disposed with a rig)
    const node = (name: string) => {
      const s = Humans.gear(name); if (!s) return null;
      const g = s.clone(true);
      g.traverse((o: any) => { if (!o.isMesh) return; o.userData.shared = true; const nm = String(o.material.name || '').split('.')[0]; if (nm === 'nvlit') { o.material = glow; lit.push(o); } else o.material = mat(NVCOL[nm] ?? 0x2c3034); });
      return g;
    };
    const mount = node('nvg_mount'); if (mount) { mount.position.copy(hinge); mount.rotation.x = -0.4; put(mount); }
    const pivot = new T.Group(); pivot.position.copy(hinge); put(pivot);
    // (in the pivot's frame: the eyes are about 6 cm below the hinge, the eyepieces just in front of them)
    const eyeY = 0.136 - hinge.y, eyeZ = -0.13 - hinge.z;
    const arm = node('nvg_arm'); if (arm) { arm.position.set(0, eyeY / 2 + 0.008, -0.012); arm.scale.y = Math.abs(eyeY) + 0.01; arm.rotation.x = -0.12; pivot.add(arm); }
    const eyes = new T.Group(); eyes.position.set(0, eyeY, eyeZ); pivot.add(eyes);
    const set = n === 1 ? 'mono' : n === 2 ? 'bino' : 'pano';
    for (const nm of ['nvg_' + set, 'nvg_lit_' + set, ...(v && v.thermal ? ['nvg_thermal'] : [])]) { const g = node(nm); if (g) eyes.add(g); }
    if (n === 4) { const b = node('nvg_battery'); if (b) { b.position.copy(at(R0 + 0.02, PI, PI * 0.52)); b.rotation.x = 0.35; put(b); } } // the battery pack, at the back
    return { pivot, lit };
  }
  return { nvg, NV_UP, MODELS };
})();
