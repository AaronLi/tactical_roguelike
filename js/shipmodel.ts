'use strict';
// What the space direction draws that a level doesn't (docs/space.md): the squad's own ship (her deck as js/spacedata.ts
// boxes has it, so what's drawn is what stops you), the outside of a ship that's boarded, made from her deck plan (js/shipgen.ts:
// each compartment shows on the hull as what it is), the asteroid the base is cut into, an interspatial anchor, a planet,
// the stars, the tunnel of a jump. Boxes mostly, merged a material: a ship is one draw call a colour.
interface SmShip { group: THREE.Group; nose: THREE.Group[]; ramp: THREE.Group; turrets: { base: THREE.Group; gun: THREE.Group; muzzle: THREE.Object3D }[]; thrust: THREE.MeshBasicMaterial; glow: THREE.MeshBasicMaterial; screen: { cv: HTMLCanvasElement; tex: THREE.CanvasTexture }; nav: { cv: HTMLCanvasElement; tex: THREE.CanvasTexture }; lights: THREE.PointLight[] }
interface SmGun { k: 'pd' | 'cannon' | 'missile'; x: number; y: number; z: number; hp: number; obj: THREE.Group; gun: THREE.Group; cool: number }
const G_ShipModel = (() => {
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
  function ship(d: SpShipDef, fleet: SpFleet): SmShip {
    const SD = G.SpaceData, F = SD.FLOOR, Tp = F + SD.HEAD, w = d.hw, n = 0.9, zn = d.z0 - d.nose, W = 0.22, g = new T.Group(), K = new Kit(), X = w + W;
    const [c0, c1, c2] = PAINT[d.id] || PAINT.kestrel, DS = { side: T.DoubleSide, flatShading: true };
    const hull = M(c0, Object.assign({ emissive: 0x101316, metalness: 0.45, roughness: 0.55 }, DS)), armor = M(c1, Object.assign({ emissive: 0x08090b, metalness: 0.55, roughness: 0.5 }, DS)), accent = M(c2, { emissive: new T.Color(c2).multiplyScalar(0.35).getHex() });
    const deck = M(0x2b2f34, { roughness: 0.85, emissive: 0x08090a }), inner = M(0x5d656e, { emissive: 0x15181b }), dark = M(0x15171a, { metalness: 0.5 }), seatM = M(0x3d444d, { emissive: 0x101216 });
    const glass = new T.MeshStandardMaterial({ color: 0x7fd0ff, transparent: true, opacity: 0.2, roughness: 0.05, metalness: 0.6, depthWrite: false, side: T.DoubleSide, emissive: 0x06202c });
    const glow = lit(0x2a8a5a), strip = lit(0xdff2ff), hot = lit(c2), thrust = new T.MeshBasicMaterial({ color: 0x66c8ff, transparent: true, opacity: 0.0, side: T.DoubleSide, depthWrite: false, blending: T.AdditiveBlending });
    const SILL = F + 1.22, LIN = F + 1.68; // (the visor slit down each side)
    // ---- inside: the deck, the overhead (light down its middle), the walls under and over the slit, ribs between
    K.box(deck, -X, 0, d.z0, X, F, d.z1 + 0.05); K.box(deck, -n - W, 0, zn, n + W, F, d.z0);
    K.box(inner, -X, Tp, d.z0 + 2.2, X, Tp + 0.2, d.z1 + W);
    // (the airlock is glazed over its sill, roof and all, on hoops: the helm looks down it and out past the collar)
    part(g, new T.Mesh(new T.BoxGeometry(2 * n + 2 * W, 0.04, d.nose), glass), 0, Tp + 0.1, (zn + d.z0) / 2);
    for (let k = 0; k <= 3; k++) { const z = zn + 0.1 + k * (d.nose - 0.2) / 3; K.box(dark, -n - W, Tp, z - 0.06, n + W, Tp + 0.2, z + 0.06); for (const s of [-1, 1]) K.box(dark, s * n, SILL, z - 0.06, s * (n + W), Tp, z + 0.06); }
    K.box(inner, -X, Tp, d.z0 - W, -w + 0.5, Tp + 0.2, d.z0 + 2.2); K.box(inner, w - 0.5, Tp, d.z0 - W, X, Tp + 0.2, d.z0 + 2.2); K.box(inner, -n, Tp, d.z0 - W, n, Tp + 0.2, d.z0 + 0.2);
    for (const sx of [-0.55, 0.55]) K.box(strip, sx - 0.05, Tp - 0.02, d.z0 + 2.6, sx + 0.05, Tp, d.z1 - 0.6);
    for (const s of [-1, 1]) {
      const x0 = s * w, x1 = s * X;
      K.box(inner, x0, F, d.z0, x1, SILL, d.z1); K.box(inner, x0, LIN, d.z0, x1, Tp, d.z1);
      const nb = Math.round((d.z1 - d.z0) / 1.6);
      for (let k = 0; k <= nb; k++) { const z = d.z0 + k * (d.z1 - d.z0) / nb; K.box(dark, x0 - s * 0.07, F, z - 0.07, x1, Tp, z + 0.07); }
      part(g, new T.Mesh(new T.BoxGeometry(0.04, LIN - SILL, d.z1 - d.z0), glass), s * (w + W / 2), (SILL + LIN) / 2, (d.z0 + d.z1) / 2);
      K.box(glow, s * (w - 0.02), LIN + 0.1, d.z0 + 2.4, s * w, LIN + 0.14, d.z1 - 0.4);
      K.box(hot, s * (w - 0.02), F + 0.08, d.z0 + 0.4, s * w, F + 0.11, d.z1 - 0.4);
      // the cockpit's front, either side of the airlock: a windscreen each, raked
      const a = s * n, b = s * X;
      K.box(inner, a, F, d.z0 - W, b, SILL - 0.25, d.z0); K.box(inner, a, LIN + 0.4, d.z0 - W, b, Tp, d.z0); K.box(dark, a, SILL - 0.25, d.z0 - W, a + s * 0.1, LIN + 0.4, d.z0); K.box(dark, b - s * 0.14, SILL - 0.25, d.z0 - W, b, LIN + 0.4, d.z0);
      part(g, new T.Mesh(new T.BoxGeometry(Math.abs(b - a), LIN + 0.65 - SILL, 0.04), glass), (a + b) / 2, (SILL - 0.25 + LIN + 0.4) / 2, d.z0 - W / 2);
      K.box(inner, s * n, F, zn, s * (n + W), SILL, d.z0); // the airlock's side, glass over it
      part(g, new T.Mesh(new T.BoxGeometry(0.04, Tp - SILL, d.nose), glass), s * (n + W / 2), (SILL + Tp) / 2, (zn + d.z0) / 2);
      K.box(inner, x0, F, d.z1, x1, Tp, d.z1 + W); // the ramp's frame
    }
    // the canopy over the helm: a faceted blister of glass on a dark frame
    const cz0 = d.z0 - W, cz1 = d.z0 + 2.3, cw = w - 0.5;
    g.add(loft([{ z: cz0, pts: [[-cw, Tp + 0.02], [cw, Tp + 0.02], [cw * 0.7, Tp + 0.3], [-cw * 0.7, Tp + 0.3]] }, { z: (cz0 + cz1) / 2, pts: [[-cw, Tp + 0.02], [cw, Tp + 0.02], [cw * 0.75, Tp + 0.55], [-cw * 0.75, Tp + 0.55]] }, { z: cz1, pts: [[-cw, Tp + 0.02], [cw, Tp + 0.02], [cw * 0.8, Tp + 0.62], [-cw * 0.8, Tp + 0.62]] }], glass));
    // ---- outside
    for (const s of [-1, 1]) {
      const mir = s < 0, zf = d.z0 + 0.2, zm = d.z0 + 2.4, zt = d.z1 + 0.9;
      // armour sloped out from the keel to a hard chine under the slit, drawn in to the bow
      g.add(loft([{ z: zf, pts: [[X, 0.04], [X + 0.1, 0.04], [X + 0.25, SILL - 0.3], [X, SILL]] }, { z: zm, pts: [[X, 0.04], [X + 0.35, 0.04], [X + 0.95, SILL - 0.32], [X, SILL]] }, { z: zt - 2, pts: [[X, 0.04], [X + 0.4, 0.04], [X + 1.05, SILL - 0.32], [X, SILL]] }, { z: zt, pts: [[X, 0.2], [X + 0.2, 0.2], [X + 0.6, SILL - 0.3], [X, SILL]] }], armor, mir));
      // and drawn in over it to the spine: the tumblehome, starting behind the canopy
      g.add(loft([{ z: zm - 0.3, pts: [[X, LIN], [X + 0.25, LIN + 0.08], [cw, Tp + 0.25], [cw - 0.3, Tp + 0.2], [X, Tp + 0.2]] }, { z: zm + 1.4, pts: [[X, LIN], [X + 0.7, LIN + 0.1], [0.75, Tp + 0.75], [0.6, Tp + 0.2], [X, Tp + 0.2]] }, { z: zt - 1.5, pts: [[X, LIN], [X + 0.75, LIN + 0.1], [0.75, Tp + 0.85], [0.6, Tp + 0.2], [X, Tp + 0.2]] }, { z: zt, pts: [[X, LIN], [X + 0.4, LIN + 0.1], [0.7, Tp + 0.55], [0.6, Tp + 0.2], [X, Tp + 0.2]] }], hull, mir));
      // the cockpit's cheek, under the windscreen
      g.add(loft([{ z: zf, pts: [[X, LIN + 0.45], [X + 0.12, LIN + 0.5], [cw, Tp + 0.05], [X, Tp + 0.2]] }, { z: zm - 0.3, pts: [[X, LIN], [X + 0.25, LIN + 0.08], [cw, Tp + 0.25], [X, Tp + 0.2]] }], hull, mir));
      // the prow: a blade either side of the airlock, running out to the collar, low enough to see over from the helm
      g.add(loft([{ z: d.z0 - W, pts: [[n + W, 0.04], [X + 0.1, 0.04], [X + 0.2, SILL - 0.45], [n + W, SILL - 0.3]] }, { z: zn + 1.0, pts: [[n + W, 0.1], [n + 0.75, 0.1], [n + 0.8, SILL - 0.75], [n + W, SILL - 0.5]] }, { z: zn - 0.25, pts: [[n + W, 0.3], [n + 0.4, 0.3], [n + 0.42, SILL - 0.95], [n + W, SILL - 0.8]] }], armor, mir));
      // the airlock's own armour over that, and a tooth on the collar's shoulder
      for (const [ty, tl] of [[0.55, 1.5], [Tp - 0.25, 1.2]]) g.add(loft([{ z: zn + 0.25, pts: [[n + W, ty - 0.22], [n + 0.6, ty], [n + W, ty + 0.22]] }, { z: zn - tl * 0.55, pts: [[n + W + 0.02, ty - 0.04], [n + 0.36, ty], [n + W + 0.02, ty + 0.04]] }], accent, mir));
      // an engine pod on a swept pylon: a spike at its intake, a ring and a lit throat at the back
      const px = X + 1.75, py = 1.35, pz0 = d.z1 - 3.6, pz1 = d.z1 + 1.9, hex = (r: number, cx = px, cy = py) => [0, 1, 2, 3, 4, 5].map((k) => [cx + Math.cos(k * Math.PI / 3 + Math.PI / 6) * r, cy + Math.sin(k * Math.PI / 3 + Math.PI / 6) * r * 1.05]);
      g.add(loft([{ z: pz0 - 2.2, pts: hex(0.06, px - 0.25, py - 0.1) }, { z: pz0, pts: hex(0.62) }, { z: pz1 - 1.2, pts: hex(0.78) }, { z: pz1, pts: hex(0.66) }], armor, mir));
      g.add(loft([{ z: pz0 + 0.2, pts: [[X + 0.3, py - 0.12], [px, py - 0.1], [px, py + 0.1], [X + 0.3, py + 0.34]] }, { z: pz1 - 1.4, pts: [[X + 0.3, py - 0.12], [px, py - 0.1], [px, py + 0.1], [X + 0.3, py + 0.34]] }], hull, mir));
      g.add(loft([{ z: pz0 + 1.0, pts: [[px + 0.5, py - 0.05], [px + 0.5, py + 0.06], [px + 0.7, py]] }, { z: pz1 + 0.6, pts: [[px + 0.5, py - 0.04], [px + 0.5, py + 0.05], [px + 2.1, py + 0.25]] }], armor, mir)); // a swept winglet
      const ring = part(g, new T.Mesh(new T.TorusGeometry(0.62, 0.1, 6, 6), accent), s * px, py, pz1 + 0.02); ring.rotation.z = Math.PI / 6;
      part(g, new T.Mesh(new T.CircleGeometry(0.55, 6), thrust), s * px, py, pz1 + 0.05).rotation.z = Math.PI / 6;
      part(g, new T.Mesh(new T.CircleGeometry(0.5, 6), dark), s * px, py, pz1 - 0.02).rotation.z = Math.PI / 6;
      const cone = part(g, new T.Mesh(new T.ConeGeometry(0.5, 4.2, 6, 1, true), thrust), s * px, py, pz1 + 2.15); cone.rotation.x = Math.PI / 2;
      // a canted tail fin, a running light at its tip
      g.add(loft([{ z: d.z1 - 2.4, pts: [[0.72, Tp + 0.5], [0.86, Tp + 0.5], [0.8, Tp + 0.56]] }, { z: zt + 0.5, pts: [[0.72, Tp + 0.4], [0.86, Tp + 0.4], [1.5, Tp + 1.7]] }], armor, mir));
      K.box(s < 0 ? lit(0xff3030) : lit(0x30ff60), s * 1.44, Tp + 1.6, zt + 0.42, s * 1.54, Tp + 1.7, zt + 0.52);
      K.box(hot, s * (X + 0.98), SILL - 0.36, zm + 0.2, s * (X + 1.02), SILL - 0.31, zt - 2.2); // a line of her colour down the chine
    }
    // the collar: an eight-sided ring round the breaching door, lit, and the plate under the door's sill
    const col = part(g, new T.Mesh(new T.TorusGeometry(1.62, 0.13, 6, 8), accent), 0, F + SD.HEAD / 2, zn - 0.1); col.rotation.z = Math.PI / 8; col.scale.set(0.82, 1, 1);
    const col2 = part(g, new T.Mesh(new T.TorusGeometry(1.42, 0.05, 5, 8), hot), 0, F + SD.HEAD / 2, zn - 0.2); col2.rotation.z = Math.PI / 8; col2.scale.set(0.82, 1, 1);
    K.box(dark, -n - W, 0.02, zn - W, n + W, F, zn + 0.2);
    // the spine and the keel
    g.add(loft([{ z: d.z0 + 2.3, pts: [[-0.6, Tp + 0.2], [0.6, Tp + 0.2], [0.3, Tp + 0.5], [-0.3, Tp + 0.5]] }, { z: d.z1 - 1, pts: [[-0.75, Tp + 0.2], [0.75, Tp + 0.2], [0.45, Tp + 0.95], [-0.45, Tp + 0.95]] }, { z: d.z1 + 1.1, pts: [[-0.7, Tp + 0.2], [0.7, Tp + 0.2], [0.3, Tp + 0.6], [-0.3, Tp + 0.6]] }], armor));
    part(g, new T.Mesh(new T.SphereGeometry(0.28, 8, 6, 0, Math.PI * 2, 0, Math.PI / 2), dark), 0, Tp + 0.9, d.z1 - 1.6);
    // the cockpit: a console under each windscreen (its screen lit), a seat at each; the sensor station's screen is a picture (js/space.ts draws the deck plan on it)
    const scr = canvasTex(256, 160, (c, cw2, ch) => { c.fillStyle = '#04080c'; c.fillRect(0, 0, cw2, ch); }), nav = canvasTex(320, 200, (c, cw2, ch) => { c.fillStyle = '#04080c'; c.fillRect(0, 0, cw2, ch); });
    for (const s of [-1, 1]) {
      const cx = s * w * 0.48;
      K.box(dark, cx - 0.55, F, d.z0, cx + 0.55, F + 0.7, d.z0 + 0.36);
      const face = part(g, new T.Mesh(new T.PlaneGeometry(0.9, 0.42), new T.MeshBasicMaterial({ map: s < 0 ? nav.tex : scr.tex })), cx, F + 0.82, d.z0 + 0.3); face.rotation.x = -0.75;
    }
    for (const st of SD.seats(d)) {
      const c = Math.cos(st.yaw), s = Math.sin(st.yaw), fx = -s, fz = -c; // (the way it faces)
      const sx = st.x - fx * 0.05, sz = st.z - fz * 0.05, h = st.k === 'jump' ? 0.2 : 0.26;
      const up = st.y - F; if (up > 0) K.box(dark, sx - 0.3, F, sz - 0.3, sx + 0.3, F + up, sz + 0.3);
      K.box(seatM, sx - h, F + up + 0.4, sz - h, sx + h, F + up + 0.48, sz + h);
      K.box(seatM, sx - fx * 0.26 - Math.abs(fz) * h - Math.abs(fx) * 0.04, F + 0.48, sz - fz * 0.26 - Math.abs(fx) * h - Math.abs(fz) * 0.04, sx - fx * 0.26 + Math.abs(fz) * h + Math.abs(fx) * 0.04, F + (st.k === 'jump' ? 1.1 : 1.3), sz - fz * 0.26 + Math.abs(fx) * h + Math.abs(fz) * 0.04);
      if (st.k !== 'jump') K.box(dark, sx - 0.06, F, sz - 0.06, sx + 0.06, F + 0.4, sz + 0.06);
      if (st.k === 'turret') K.box(hot, st.x - 0.3 + fx * 0.3, Tp - 0.04, st.z - 0.3, st.x + 0.3 + fx * 0.3, Tp, st.z + 0.3);
    }
    K.build(g);
    // the breaching door: two leaves that part sideways into the collar
    const nose = [-1, 1].map((s) => { const lf = new T.Group(); const m = new T.Mesh(new T.BoxGeometry(n, SILL - F, 0.16), armor); m.position.set(s * n / 2, (F + SILL) / 2, 0); lf.add(m); const gw = new T.Mesh(new T.BoxGeometry(n, Tp - SILL, 0.05), glass); gw.position.set(s * n / 2, (SILL + Tp) / 2, 0); lf.add(gw); const tb = new T.Mesh(new T.BoxGeometry(n, 0.1, 0.16), armor); tb.position.set(s * n / 2, Tp - 0.05, 0); lf.add(tb); const st2 = new T.Mesh(new T.BoxGeometry(0.06, SD.HEAD, 0.18), hot); st2.position.set(s * 0.04, F + SD.HEAD / 2, 0); lf.add(st2); lf.position.set(0, 0, zn - W / 2); lf.userData.s = s; g.add(lf); return lf; });
    // the ramp: hinged at the deck, it lies down behind her
    const ramp = new T.Group(); ramp.position.set(0, F, d.z1 + W / 2); g.add(ramp);
    const rm = new T.Mesh(new T.BoxGeometry(2 * w, SD.HEAD, 0.14), armor); rm.position.set(0, SD.HEAD / 2, 0); ramp.add(rm);
    for (const ry of [0.5, 1.2, 1.9]) { const rs = new T.Mesh(new T.BoxGeometry(2 * w - 0.6, 0.06, 0.02), hot); rs.position.set(0, ry, -0.08); ramp.add(rs); }
    // a turret on each hardpoint that has a gun: a ring on the spine, the gun's cradle turning on it
    const fit = fleet.fit[d.id] || [], turrets: SmShip['turrets'] = [];
    for (let i = 0; i < d.turrets; i++) {
      const base = new T.Group(), gun = new T.Group(), muzzle = new T.Object3D(), e = fit[i] ? SD.EQUIP[fit[i]!] : null;
      base.position.set(0, Tp + 0.7, d.z0 + 3.6 + i * 2.6);
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
    // her own light: the same wherever she is
    const lights = [d.z0 + 1.2, (d.z0 + d.z1) / 2 + 1, d.z1 - 1.2].map((z, i) => { const l = new T.PointLight(i ? 0xdfeaff : 0xbfe0ff, i ? 4.5 : 3, 7, 1.6); l.position.set(0, Tp - 0.35, z); g.add(l); return l; });
    return { group: g, nose, ramp, turrets, thrust, glow, screen: scr, nav, lights };
  }

  // ---- the outside of a ship that's boarded, from her deck plan (the level's own walls are her sides: this is what's
  // over and under them, and what each compartment shows of itself)
  function hull(map: LvMap): { group: THREE.Group; guns: SmGun[]; marker: THREE.Object3D } {
    const g = new T.Group(), K = new Kit(), TS = G.Level.TS, { W, H, t } = map, sp = map.sp!, th = map.theme, WH = G.Level.WALL_H, FH = G.Level.FLOOR_H, NF = map.floors ? map.floors.length : 1, TOP = (NF - 1) * FH + WH;
    const base = new T.Color(th.wall as string), r = G.U.rng((map.seed ^ 0x4a11) >>> 0);
    const shade = (k: number, o?: Record<string, any>) => M(base.clone().multiplyScalar(k).getHex(), Object.assign({ emissive: base.clone().multiplyScalar(k * 0.1).getHex() }, o || {}));
    const plate = shade(0.62), dark = shade(0.36, { metalness: 0.5 }), light = shade(0.85), trim = M(0xb8862a, { emissive: 0x2a1c06 }), win = lit(0xffe2a8), nav = lit(0xff4030), eng = lit(0x7fd0ff);
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
    for (let z = 0; z < H; z++) for (const dz of [-1, 1]) for (let x = 0; x < W;) {
      if (!(solid(x, z) && !solid(x, z + dz))) { x++; continue; }
      let x1 = x; while (solid(x1 + 1, z) && !solid(x1 + 1, z + dz)) x1++;
      const zf = dz < 0 ? z * TS : (z + 1) * TS; belt(x * TS - 0.3, zf + (dz < 0 ? -0.3 : 0), (x1 + 1) * TS + 0.3, zf + (dz < 0 ? 0 : 0.3));
      x = x1 + 1;
    }
    for (let x = 0; x < W; x++) for (const dx of [-1, 1]) for (let z = 0; z < H;) {
      if (!(solid(x, z) && !solid(x + dx, z))) { z++; continue; }
      let z1 = z; while (solid(x, z1 + 1) && !solid(x + dx, z1 + 1)) z1++;
      const xf = dx < 0 ? x * TS : (x + 1) * TS; belt(xf + (dx < 0 ? -0.3 : 0), z * TS, xf + (dx < 0 ? 0 : 0.3), (z1 + 1) * TS);
      z = z1 + 1;
    }
    // what she carries on her hull, by her class (js/spacedata.ts SIZES guns): point-defence guns, heavy cannon, missile
    // launchers, down her back; a ship that isn't the mission's carries none
    const guns: SmGun[] = [], Y = TOP + 0.3, bellM = shade(0.3, { metalness: 0.5, side: T.DoubleSide });
    const gunAt = (k: 'pd' | 'cannon' | 'missile', x: number, z: number, y: number) => {
      const o = new T.Group(), gn = new T.Group(); o.position.set(x, y, z);
      if (k === 'pd') {
        part(o, new T.Mesh(new T.CylinderGeometry(0.9, 1.1, 0.7, 12), dark), 0, 0.35, 0);
        part(gn, new T.Mesh(new T.BoxGeometry(1.1, 0.7, 1.4), plate), 0, 0.35, 0);
        for (const sx of [-0.25, 0.25]) part(gn, new T.Mesh(new T.CylinderGeometry(0.08, 0.08, 2.6, 8), dark), sx, 0.4, -1.7).rotation.x = Math.PI / 2;
      } else if (k === 'cannon') {
        part(o, new T.Mesh(new T.CylinderGeometry(2.2, 2.6, 1.2, 14), dark), 0, 0.6, 0);
        part(gn, new T.Mesh(new T.BoxGeometry(3.4, 1.6, 4.2), plate), 0, 0.8, 0.3);
        for (const sx of [-0.8, 0.8]) part(gn, new T.Mesh(new T.CylinderGeometry(0.22, 0.26, 7.5, 10), dark), sx, 0.9, -5.2).rotation.x = Math.PI / 2;
      } else {
        part(o, new T.Mesh(new T.BoxGeometry(3.2, 0.6, 3.2), dark), 0, 0.3, 0);
        const bx = part(gn, new T.Mesh(new T.BoxGeometry(2.6, 1.5, 3.4), plate), 0, 0.9, 0); bx.rotation.x = 0.5;
        for (const sx of [-0.8, 0, 0.8]) for (const sy of [0.5, 1.2]) part(gn, new T.Mesh(new T.CircleGeometry(0.3, 10), nav), sx, sy + 0.95, -1.42).rotation.x = 0.5;
      }
      gn.position.y = k === 'cannon' ? 1.2 : 0.7; o.add(gn); g.add(o);
      guns.push({ k, x, y: y + (k === 'cannon' ? 2.1 : 1.1), z, hp: k === 'pd' ? 100 : k === 'cannon' ? 320 : 180, obj: o, gun: gn, cool: 1 + r() * 3 });
    };
    {
      const C = G.SpaceData.SIZES[sp.size].guns, list: ('pd' | 'cannon' | 'missile')[] = [], hm = sp.hull;
      for (let k = 0; k < Math.max(C.pd, C.cannon, C.missile); k++) { if (k < C.cannon) list.push('cannon'); if (k < C.pd) list.push('pd'); if (k < C.missile) list.push('missile'); }
      for (let k = C.pd; k > 0 && list.filter((q) => q === 'pd').length < C.pd; k--) list.push('pd');
      list.forEach((k, n) => { const u = (n + 0.5) / list.length, x = hm.x0 + (hm.x1 - hm.x0) * (0.14 + 0.72 * u), z = hm.zc + (n % 2 ? 1 : -1) * (k === 'cannon' ? 0 : 3.4); K.box(dark, x - 2.6, Y, z - 2.6, x + 2.6, Y + 0.8, z + 2.6); gunAt(k, x, z, Y + 0.8); });
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
        for (let k = 0; k < 4; k++) K.box(k & 1 ? plate : dark, x0 - 1.5 * (k + 1), -1.0 - 0.25 * k, z0 + 1.2 * (k + 1), x0 - 1.5 * k, 0.7 - 0.2 * k, z1 - 1.2 * (k + 1));
        K.box(dark, x0 - 1.2, f * FH + 2.95, z0, x0, RY + 0.2, z1);
      } else if (role === 'engine') {
        // the engine block, and her nozzles out of the stern: lit (a ship of two decks: as tall as both)
        const top = own.main ? TOP : WH, mid = top / 2 - 0.1;
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
    K.build(g);
    // the breach that's suggested: marked for whoever's flying (js/space.ts pulses it)
    const mk = new T.Group(), b = sp.breach, ring = lit(0xffb020);
    for (const [bx, by, bw, bh] of [[-1.5, 0.1, 3, 0.14], [-1.5, 2.9, 3, 0.14], [-1.5, 0.1, 0.14, 2.94], [1.36, 0.1, 0.14, 2.94]]) part(mk, new T.Mesh(new T.BoxGeometry(bw, bh, 0.1), ring), bx + bw / 2, by + bh / 2, 0);
    mk.position.set(b.x, 0, b.face + 0.34); g.add(mk);
    return { group: g, guns, marker: mk };
  }

  // ---- the asteroid the base is cut into: a rock three kilometres through, a hollow planed into its top for the hangar
  // (flat for 70 m round the level, then walls 90 m high, then the rock's own curve). height(x, z): its surface there.
  function asteroid(Wm: number, Hm: number, seed: number) {
    const R = 1500, r = G.U.rng(seed), cx = Wm / 2, cz = Hm / 2, U = G.U;
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
  // ---- an interspatial anchor: a ring to fly to (60 m across), four pylons, a film of light across it
  function anchor(color = 0x66c8ff) {
    const g = new T.Group(), steel = M(0x59626c, { emissive: 0x101316, metalness: 0.5 }), glow = lit(color);
    const ring = new T.Mesh(new T.TorusGeometry(30, 1.6, 8, 40), steel); g.add(ring);
    const inner = new T.Mesh(new T.TorusGeometry(27.5, 0.35, 6, 40), glow); g.add(inner);
    for (let k = 0; k < 4; k++) { const a = k * Math.PI / 2 + Math.PI / 4, b = new T.Mesh(new T.BoxGeometry(5, 12, 7), steel); b.position.set(Math.cos(a) * 31, Math.sin(a) * 31, 0); b.rotation.z = a - Math.PI / 2; g.add(b); const l = new T.Mesh(new T.BoxGeometry(1, 1, 7.4), glow); l.position.set(Math.cos(a) * 36, Math.sin(a) * 36, 0); g.add(l); }
    const film = new T.Mesh(new T.CircleGeometry(27.5, 40), new T.MeshBasicMaterial({ color, transparent: true, opacity: 0.1, side: T.DoubleSide, depthWrite: false, blending: T.AdditiveBlending })); g.add(film);
    g.userData.film = film;
    return g;
  }
  // ---- a planet, seen from orbit: a sphere of its ground's colour under cloud, a rim of air
  function planet(th: ThemeDef, seed: number, R: number) {
    const r = G.U.rng(seed), cv = canvasTex(512, 256, (c, w, h) => {
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
  function stars(seed: number) {
    const r = G.U.rng(seed), n = 2600, pos = new Float32Array(n * 3), col = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const u = r() * 2 - 1, a = r() * Math.PI * 2, s = Math.sqrt(1 - u * u), k = 0.35 + r() * r() * 0.65, w = r();
      pos.set([s * Math.cos(a) * 900, u * 900, s * Math.sin(a) * 900], i * 3); col.set([k * (0.85 + 0.15 * w), k * 0.92, k * (1 - 0.2 * w)], i * 3);
    }
    const g = new T.BufferGeometry(); g.setAttribute('position', new T.BufferAttribute(pos, 3)); g.setAttribute('color', new T.BufferAttribute(col, 3));
    const pts = new T.Points(g, new T.PointsMaterial({ size: 1.6, sizeAttenuation: false, vertexColors: true, fog: false, depthWrite: false, depthTest: false }));
    pts.frustumCulled = false; pts.renderOrder = -10;
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
  return { ship, hull, asteroid, anchor, planet, stars, tunnel, M, lit, canvasTex };
})();
G.ShipModel = G_ShipModel;
interface GameModules { ShipModel: typeof G_ShipModel; }
