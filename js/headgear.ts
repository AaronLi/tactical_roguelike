'use strict';
// What's built for the head here (in the head's frame of js/rig.ts: y up from the neck joint, the face toward -z, metres): night
// vision on a helmet's mount (an arm down to the bridge and its tubes in front of the eyes, swung up over the brow when it's off:
// nvg) and a suspect's baseball cap. The helmets and the face pieces are each body's own, made on its head in Blender
// (models/characters/kit_head.py); MODELS is each helmet's colour and cut.
const G_Headgear = (() => {
  const T = THREE, PI = Math.PI;
  type V3 = [number, number, number];
  type Mat = (c: number, o?: Record<string, any>) => THREE.Material; // (rig.ts's kit materials)
  type Put = (m: THREE.Object3D) => void;
  interface BandOpts { cols?: number; rows?: number; sc?: V3; c?: V3; top?: boolean }
  interface Model { cut: string; col: number }
  const C0: V3 = [0, 0.137, 0]; // the dome's centre (the cranium's is 0.13)
  const SC: V3 = [1, 1.02, 1.1]; // a little longer front to back than it is wide, as heads are

  // A band of a dome: azimuth a from a0 to a1 (0: straight ahead, +: the wearer's left... -x is their right), polar
  // angle from th0(a) to th1(a) (0: the crown, PI/2: level with the centre), radius r, t thick (an inner face and
  // edges), scaled by SC and set at c.
  function band(r: number, a0: number, a1: number, th0: number | ((a: number) => number), th1: number | ((a: number) => number), t = 0.006, o: BandOpts = {}) {
    const J = o.cols || 36, N = o.rows || 12, sc = o.sc || SC, c = o.c || C0;
    const f0 = typeof th0 === 'function' ? th0 : () => th0, f1 = typeof th1 === 'function' ? th1 : () => th1;
    const pos: number[] = [], idx: number[] = [];
    const P = (rr: number, a: number, th: number) => [c[0] + rr * Math.sin(th) * Math.sin(a) * sc[0], c[1] + rr * Math.cos(th) * sc[1], c[2] - rr * Math.sin(th) * Math.cos(a) * sc[2]];
    const grid = (rr: number) => { const base = pos.length / 3; for (let j = 0; j <= J; j++) { const a = a0 + (a1 - a0) * j / J, t0 = f0(a), t1 = f1(a); for (let i = 0; i <= N; i++) pos.push(...P(rr, a, t0 + (t1 - t0) * i / N)); } return base; };
    const o1 = grid(r), i1 = t > 0 ? grid(r - t) : -1, V = (b: number, j: number, i: number) => b + j * (N + 1) + i;
    for (let j = 0; j < J; j++) for (let i = 0; i < N; i++) {
      idx.push(V(o1, j, i), V(o1, j + 1, i), V(o1, j, i + 1), V(o1, j + 1, i), V(o1, j + 1, i + 1), V(o1, j, i + 1));
      if (i1 >= 0) idx.push(V(i1, j, i), V(i1, j, i + 1), V(i1, j + 1, i), V(i1, j + 1, i), V(i1, j, i + 1), V(i1, j + 1, i + 1));
    }
    if (i1 >= 0) { // the edges: the rim (and the start and end, for a band that doesn't go all the way round)
      const quad = (a: number, b: number, c2: number, d: number) => idx.push(a, b, c2, b, d, c2);
      for (let j = 0; j < J; j++) { quad(V(o1, j, N), V(o1, j + 1, N), V(i1, j, N), V(i1, j + 1, N)); if (o.top) quad(V(i1, j, 0), V(i1, j + 1, 0), V(o1, j, 0), V(o1, j + 1, 0)); }
      if (a1 - a0 < 2 * PI - 1e-3) for (let i = 0; i < N; i++) { quad(V(i1, 0, i), V(i1, 0, i + 1), V(o1, 0, i), V(o1, 0, i + 1)); quad(V(o1, J, i), V(o1, J, i + 1), V(i1, J, i), V(i1, J, i + 1)); }
    }
    const g = new T.BufferGeometry();
    g.setAttribute('position', new T.Float32BufferAttribute(pos, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    return g;
  }
  // where a point on the dome is (for hanging things off it)
  const at = (r: number, a: number, th: number) => new T.Vector3(C0[0] + r * Math.sin(th) * Math.sin(a) * SC[0], C0[1] + r * Math.cos(th) * SC[1], C0[2] - r * Math.sin(th) * Math.cos(a) * SC[2]);
  const MODELS: Record<string, Model> = {
    'h.bump': { cut: 'high', col: 0x3a3d40 },
    'h.fast': { cut: 'high', col: 0x6a5f46 },
    'h.ach': { cut: 'mid', col: 0x4a5040 },
    'h.rifle': { cut: 'mid', col: 0x2e3236 },
  };
  const R0 = 0.125; // (the dome a mount's put on, without the body's own: where night vision hinges)

  // Night vision on the helmet's shroud ('n.mono', 'n.bino', 'n.pano', 'n.fuse'): the shroud's mount stays put; what hangs
  // from it (the arm, the bridge and the tubes, an eyecup at the back of each and its objective lens in front) is in a
  // pivot at the hinge, drawn down in front of the eyes. Its rotation.x swings it: 0 down, NV_UP up over the brow, tubes
  // pointing up. A panoramic's outer pair are canted out; a fused set has the thermal core on top of the bridge; the
  // quads' battery pack rides at the back of the helmet as a counterweight. The eyecups glow faintly with the phosphor
  // when they're on (glow: its material, to light or not). Returns { pivot, glow }.
  const NV_UP = 1.95, glowMats: Record<string, THREE.MeshBasicMaterial> = {};
  function nvg(id: string, helmetId: string, mat: Mat, put: Put, hingeAt?: THREE.Vector3 | null) {
    const d = G.Gear && G.Gear.DEFS[id], v = d && d.nv, n = v ? v.tubes.length : 2;
    const hinge = hingeAt || at(R0 + 0.018, 0, PI * 0.36), dark = 0x1a1c1e, body = 0x2c3034, rubber = 0x101112;
    const mount = new T.Mesh(new T.BoxGeometry(0.036, 0.03, 0.022), mat(dark)); mount.position.copy(hinge); mount.rotation.x = -0.4; put(mount);
    const pivot = new T.Group(); pivot.position.copy(hinge); put(pivot);
    const add = (m: THREE.Mesh, x: number, y: number, z: number) => { m.position.set(x, y, z); pivot.add(m); return m; };
    // (in the pivot's frame: the eyes are about 6 cm below the hinge, the eyepieces just in front of them)
    const eyeY = 0.136 - hinge.y, eyeZ = -0.13 - hinge.z;
    const arm = add(new T.Mesh(new T.BoxGeometry(0.022, Math.abs(eyeY) + 0.01, 0.014), mat(body)), 0, eyeY / 2 + 0.008, -0.012); arm.rotation.x = -0.12;
    const bw = n === 1 ? 0.03 : n === 2 ? 0.084 : 0.142;
    add(new T.Mesh(new T.BoxGeometry(bw, 0.026, 0.05), mat(body)), n === 1 ? -0.016 : 0, eyeY + 0.02, eyeZ - 0.035); // the bridge
    const key = (v ? (v.phos[0] > 0.6 ? 'w' : 'g') : 'g'), glow = glowMats[key] || (glowMats[key] = new T.MeshBasicMaterial({ color: key === 'w' ? 0x9fb8ff : 0x3aff7a }));
    const tube = (x: number, cant: number, r: number, len: number) => {
      const g = new T.Group(); g.position.set(x, eyeY, eyeZ); g.rotation.y = cant; pivot.add(g);
      const cyl = (rr: number, l: number, c: number, z: number, glowing?: boolean) => { const m = new T.Mesh(new T.CylinderGeometry(rr, rr, l, 14), glowing ? glow : mat(c)); m.rotation.x = PI / 2; m.position.z = z; g.add(m); return m; };
      cyl(r, len, body, -len / 2 - 0.006);
      cyl(r * 1.12, 0.012, rubber, -0.004); // the eyecup
      cyl(r * 1.08, 0.014, dark, -len - 0.008); // the objective's ring
      cyl(r * 0.8, 0.002, 0x05080a, -len - 0.016); // its lens
      return cyl(r * 0.62, 0.0015, 0, 0.0035, true); // the eyepiece, lit
    };
    const lit: THREE.Mesh[] = [];
    if (n === 1) lit.push(tube(-0.032, 0, 0.016, 0.1)); // (over the right eye: -x is the wearer's right)
    else if (n === 2) for (const s of [-1, 1]) lit.push(tube(s * 0.032, 0, 0.017, 0.105));
    else for (const [x, c] of [[-0.058, 0.36], [-0.022, 0], [0.022, 0], [0.058, -0.36]]) lit.push(tube(x, c, 0.0135, 0.088));
    if (v && v.thermal) { add(new T.Mesh(new T.BoxGeometry(0.044, 0.026, 0.05), mat(0x3a3428)), 0, eyeY + 0.042, eyeZ - 0.05); add(new T.Mesh(new T.CylinderGeometry(0.011, 0.011, 0.004, 12), mat(0x2a1a08)), 0, eyeY + 0.042, eyeZ - 0.077).rotation.x = PI / 2; } // the thermal core and its window
    if (n === 4) { const p = at(R0 + 0.02, PI, PI * 0.52), b = new T.Mesh(new T.BoxGeometry(0.07, 0.04, 0.026), mat(0x24272a)); b.position.copy(p); b.rotation.x = 0.35; put(b); } // the battery pack, at the back
    return { pivot, lit };
  }
  // a baseball cap: a six-panel crown and a curved peak
  function cap(mat: Mat, put: Put, col: number) {
    const cr = band(0.106, -PI, PI, 0, PI * 0.5, 0.003, { c: [0, 0.158, 0.004], sc: [1, 0.85, 1.08], cols: 30, rows: 8 });
    put(new T.Mesh(cr, mat(col, { side: T.DoubleSide })));
    const btn = new T.Mesh(new T.SphereGeometry(0.008, 8, 6), mat(col)); btn.position.set(0, 0.248, 0.004); put(btn); // the button on top
    // the peak: a flat ring sector out over the brow (a ring in x-y, laid down so its middle points ahead), curved down a touch
    const peak = new T.Mesh(new T.RingGeometry(0.1, 0.19, 18, 1, PI / 2 - PI * 0.26, PI * 0.52), mat(col, { side: T.DoubleSide }));
    peak.rotation.x = -PI / 2 - 0.2; peak.position.set(0, 0.16, 0.0); peak.scale.set(0.85, 1, 1); put(peak);
  }
  return { band, nvg, NV_UP, cap, MODELS };
})();
G.Headgear = G_Headgear;
interface GameModules { Headgear: typeof G_Headgear; }
