'use strict';
// Helmets and what goes on and around the head, modelled on the real things (in the head's frame of js/rig.ts: y up
// from the neck joint, the face toward -z, metres):
//   bump helmet       a vented high-cut shell (a FAST bump: rails and a shroud, no armour)
//   high-cut (IIIA)   an Ops-Core FAST-style shell: the sides cut high over the ears for a headset, ARC rails along
//                     the cut, a night-vision shroud on the brow, loop panels, a counterweight pouch at the back
//   full-cut (IIIA)   an ACH/MICH: one smooth shell, a little lower all round, only trimmed at the ears; a front
//                     bracket, no rails
//   rifle-rated       a thicker mid-cut shell, rails and shroud (Team Wendy / Galvion style)
//   with visor        an Altyn-style assault helmet: a deep rounded shell down over the ears and nape, a brow cut
//                     away for the armoured visor that hinges on bolts at each side
// and the face pieces hung on a helmet's rails (a mandible round the jaw; a polycarbonate or laminated face shield),
// night vision on the shroud (a mount, an arm down to the bridge and its tubes in front of the eyes, swung up over the
// brow when it's off: nvg), and a suspect's baseball cap. Every shell is a dome whose lower edge follows a profile round the head (band),
// so the brow, the ear cut-outs and the nape are each where they are on the real helmet.
const G_Headgear = (() => {
  const T = THREE, PI = Math.PI;
  type V3 = [number, number, number];
  type Mat = (c: number, o?: Record<string, any>) => THREE.Material; // (rig.ts's kit materials)
  type Put = (m: THREE.Object3D) => void;
  interface BandOpts { cols?: number; rows?: number; sc?: V3; c?: V3; top?: boolean }
  interface Model { cut: string; r: number; t: number; col: number | null; rails?: boolean; shroud?: boolean; vents?: boolean; loop?: number; weight?: boolean; bracket?: boolean; cover?: boolean; visor?: boolean }
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
  // a smooth bump of width w round azimuth a0 (both sides)
  const notch = (a: number, a0: number, w: number) => Math.exp(-(((Math.abs(a) - a0) / w) ** 2));
  const ease = (a: number) => (1 - Math.cos(a)) / 2; // 0 ahead, 1 behind

  // The cuts: the shell's lower edge (polar angle) all the way round
  const CUT: Record<string, (a: number) => number> = {
    high: (a: number) => PI * (0.47 + 0.13 * ease(a) - 0.12 * notch(a, 1.72, 0.42)), // brow, ears cut high, nape
    mid: (a: number) => PI * (0.5 + 0.13 * ease(a) - 0.045 * notch(a, 1.7, 0.36)),
    full: (a: number) => PI * (0.41 + 0.27 * Math.min(1, ease(a) * 2.6) + 0.02 * ease(a)), // the brow cut away for the visor, then down over the ears
  };
  const MODELS: Record<string, Model> = {
    'h.bump': { cut: 'high', r: 0.121, t: 0.004, col: 0x3a3d40, rails: true, shroud: true, vents: true },
    'h.fast': { cut: 'high', r: 0.124, t: 0.007, col: 0x6a5f46, rails: true, shroud: true, loop: 0x5c5340, weight: true },
    'h.ach': { cut: 'mid', r: 0.125, t: 0.008, col: 0x4a5040, bracket: true, cover: true },
    'h.rifle': { cut: 'mid', r: 0.129, t: 0.012, col: 0x2e3236, rails: true, shroud: true, loop: 0x262a2e, weight: true },
    'h.visor': { cut: 'full', r: 0.131, t: 0.012, col: 0x2a2d30, visor: true },
    generic: { cut: 'mid', r: 0.125, t: 0.008, col: null },
  };

  // A helmet (kit id, or 'generic' in the colour given). mat(colour, opts) makes a material; put(mesh) hangs it on the head.
  function helmet(id: string, mat: Mat, put: Put, col?: number) {
    const M = MODELS[id] || MODELS.generic, cut = CUT[M.cut], c = col != null ? col : M.col != null ? M.col : 0x2a2d30;
    const dark = 0x1c1e20, shell = new T.Mesh(band(M.r, -PI, PI, 0, cut, M.t, { cols: 48, rows: 14 }), mat(c, { side: T.DoubleSide }));
    put(shell);
    if (M.cover) { // a cloth cover's seams and the band round it that holds it on (the "cat eyes" at the back)
      put(new T.Mesh(band(M.r + 0.002, -PI, PI, (a) => cut(a) - 0.09 * PI, (a) => cut(a) - 0.06 * PI, 0.002, { cols: 48, rows: 2 }), mat(0x3a3f33)));
      put(new T.Mesh(band(M.r + 0.0035, PI * 0.82, PI * 1.18, (a) => cut(a) - 0.085 * PI, (a) => cut(a) - 0.065 * PI, 0.0015, { rows: 1, cols: 6 }), mat(0x8a8a70)));
    }
    if (M.rails) for (const s of [-1, 1]) { // ARC rails: along the cut over the ear, a hand's length
      const a0 = s > 0 ? 1.0 : -2.35, a1 = s > 0 ? 2.35 : -1.0;
      put(new T.Mesh(band(M.r + 0.007, a0, a1, (a) => cut(a) - 0.075 * PI, (a) => cut(a) - 0.01 * PI, 0.009, { cols: 14, rows: 3 }), mat(dark)));
    }
    if (M.shroud) { // the night-vision shroud on the brow, and its mount
      put(new T.Mesh(band(M.r + 0.004, -0.32, 0.32, PI * 0.31, (a) => cut(a) - 0.015 * PI, 0.005, { cols: 8, rows: 4 }), mat(dark)));
      const p = at(M.r + 0.012, 0, PI * 0.38), m = new T.Mesh(new T.BoxGeometry(0.03, 0.022, 0.016), mat(0x141516));
      m.position.copy(p); m.rotation.x = -0.35; put(m);
    }
    if (M.bracket) { // an ACH's front bracket: a plate on the brow
      const p = at(M.r + 0.003, 0, PI * 0.4), m = new T.Mesh(new T.BoxGeometry(0.034, 0.03, 0.006), mat(dark));
      m.position.copy(p); m.rotation.x = -0.6; put(m);
    }
    if (M.loop) { // loop panels for patches and lights: the crown, and each side above the rail
      put(new T.Mesh(band(M.r + 0.002, -0.55, 0.55, PI * 0.06, PI * 0.2, 0.002, { cols: 8, rows: 3 }), mat(M.loop)));
      for (const s of [-1, 1]) put(new T.Mesh(band(M.r + 0.002, s > 0 ? 1.3 : -2.2, s > 0 ? 2.2 : -1.3, PI * 0.25, PI * 0.33, 0.002, { cols: 6, rows: 2 }), mat(M.loop)));
    }
    if (M.weight) { const p = at(M.r + 0.014, PI, PI * 0.5), m = new T.Mesh(new T.BoxGeometry(0.075, 0.045, 0.022), mat(0x2b2d28)); m.position.copy(p); m.rotation.x = 0.3; put(m); } // counterweight pouch
    if (M.vents) for (const [a, th] of [[0.5, 0.18], [-0.5, 0.18], [2.4, 0.22], [-2.4, 0.22], [PI, 0.3], [1.4, 0.2], [-1.4, 0.2]]) { // the bump's vents
      const p = at(M.r + 0.0005, a, PI * th), m = new T.Mesh(new T.CircleGeometry(0.011, 10), mat(0x101112));
      m.position.copy(p); m.lookAt(p.clone().sub(new T.Vector3(...C0)).multiplyScalar(2).add(new T.Vector3(...C0))); put(m);
    }
    if (M.visor) { // the armoured visor, down, on its hinge bolts; its frame
      const vr = M.r + 0.022;
      put(new T.Mesh(band(vr, -1.3, 1.3, PI * 0.36, PI * 0.72, 0.01, { cols: 18, rows: 6 }), mat(0x55707e, { transparent: true, opacity: 0.55 })));
      put(new T.Mesh(band(vr + 0.002, -1.32, 1.32, PI * 0.34, PI * 0.39, 0.014, { cols: 18, rows: 1 }), mat(0x23262a)));
      put(new T.Mesh(band(vr + 0.002, -1.32, 1.32, PI * 0.7, PI * 0.73, 0.012, { cols: 18, rows: 1 }), mat(0x23262a)));
      for (const s of [-1, 1]) { const p = at(M.r + 0.012, s * 1.45, PI * 0.42), b = new T.Mesh(new T.CylinderGeometry(0.014, 0.014, 0.018, 12), mat(0x3a3e42)); b.position.copy(p); b.rotation.z = PI / 2; put(b); }
    }
    // the chinstrap: from in front of and behind each ear down under the jaw
    const strap = mat(0x18191a);
    for (const s of [-1, 1]) for (const [z0, ang] of [[-0.035, 0.25], [0.035, -0.3]]) { const m = new T.Mesh(new T.BoxGeometry(0.004, 0.085, 0.008), strap); m.position.set(s * 0.094, 0.078, z0); m.rotation.x = ang; m.rotation.z = s * -0.18; put(m); }
    const chin = new T.Mesh(new T.TorusGeometry(0.06, 0.0035, 4, 16, PI), strap); chin.position.set(0, 0.04, -0.022); chin.rotation.set(PI * 0.45, 0, 0); chin.scale.set(1.45, 1, 1); put(chin);
    return M;
  }
  // A face piece on a helmet's rails: a mandible ('f.mandible') or a face shield ('f.shield', 'f.rifle')
  function face(id: string, helmetId: string, mat: Mat, put: Put) {
    const M = MODELS[helmetId] || MODELS.generic, cut = CUT[M.cut];
    if (id === 'f.mandible') {
      // the guard: a U round the mouth, the chin and the top of the neck, on a smaller dome round the jaw
      const jc: V3 = [0, 0.085, -0.012], js: V3 = [1, 1, 1.05];
      put(new T.Mesh(band(0.098, -1.6, 1.6, PI * 0.5, PI * 0.8, 0.012, { c: jc, sc: js, cols: 20, rows: 5 }), mat(0x50575e, { side: T.DoubleSide })));
      for (let i = 0; i < 4; i++) { const v = new T.Mesh(new T.BoxGeometry(0.01, 0.022, 0.004), mat(0x23262a)); v.position.set(-0.024 + i * 0.016, 0.05, -0.115); put(v); } // vents over the mouth
      for (const s of [-1, 1]) { // the arms up to the rails
        const top = at(M.r + 0.01, s * 1.55, cut(s * 1.55) - 0.03 * PI), bot = new T.Vector3(s * 0.098, 0.07, -0.02), mid = top.clone().add(bot).multiplyScalar(0.5);
        const arm = new T.Mesh(new T.BoxGeometry(0.012, top.distanceTo(bot) + 0.01, 0.022), mat(0x3c4248));
        arm.position.copy(mid); arm.lookAt(top); arm.rotateX(PI / 2); put(arm);
      }
      return;
    }
    // a face shield: a curved sheet from the brow to below the chin, on two arms from the rails
    const rifle = id === 'f.rifle', vr = M.r + 0.028;
    put(new T.Mesh(band(vr, -1.2, 1.2, PI * 0.38, PI * 0.8, rifle ? 0.016 : 0.007, { cols: 18, rows: 8 }), mat(rifle ? 0x3e4e56 : 0x8aaaba, { transparent: true, opacity: rifle ? 0.72 : 0.38 })));
    put(new T.Mesh(band(vr + 0.002, -1.22, 1.22, PI * 0.36, PI * 0.4, 0.012, { cols: 18, rows: 1 }), mat(0x1c1e20))); // its top edge, the hinge bar
    for (const s of [-1, 1]) { const p = at(M.r + 0.012, s * 1.4, PI * 0.42), m = new T.Mesh(new T.BoxGeometry(0.014, 0.03, 0.05), mat(0x1c1e20)); m.position.copy(p); m.rotation.y = s * 0.3; put(m); }
  }
  // Night vision on the helmet's shroud ('n.mono', 'n.bino', 'n.pano', 'n.fuse'): the shroud's mount stays put; what hangs
  // from it (the arm, the bridge and the tubes, an eyecup at the back of each and its objective lens in front) is in a
  // pivot at the hinge, drawn down in front of the eyes. Its rotation.x swings it: 0 down, NV_UP up over the brow, tubes
  // pointing up. A panoramic's outer pair are canted out; a fused set has the thermal core on top of the bridge; the
  // quads' battery pack rides at the back of the helmet as a counterweight. The eyecups glow faintly with the phosphor
  // when they're on (glow: its material, to light or not). Returns { pivot, glow }.
  const NV_UP = 1.95, glowMats: Record<string, THREE.MeshBasicMaterial> = {};
  function nvg(id: string, helmetId: string, mat: Mat, put: Put) {
    const M = MODELS[helmetId] || MODELS.generic, d = G.Gear && G.Gear.DEFS[id], v = d && d.nv, n = v ? v.tubes.length : 2;
    const hinge = at(M.r + 0.018, 0, PI * 0.36), dark = 0x1a1c1e, body = 0x2c3034, rubber = 0x101112;
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
    if (n === 4) { const p = at(M.r + 0.02, PI, PI * 0.52), b = new T.Mesh(new T.BoxGeometry(0.07, 0.04, 0.026), mat(0x24272a)); b.position.copy(p); b.rotation.x = 0.35; put(b); } // the battery pack, at the back
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
  return { band, helmet, face, nvg, NV_UP, cap, MODELS, CUT };
})();
G.Headgear = G_Headgear;
interface GameModules { Headgear: typeof G_Headgear; }
