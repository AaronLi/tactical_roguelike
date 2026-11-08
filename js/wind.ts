'use strict';
// The wind on this screen (docs/level-data.md "Wind"). The host's simulation owns it (js/server.ts windTick: js/sim.ts windAt,
// from the level's seed and the theme's mean speed, on the level's clock) and every half second tells everyone ('wind': w
// [x, z, x1, z1], m/s: now, and half a second on). Here that's eased into: from what this screen shows when a message comes
// to where the host says it'll be next, over the half second till the next one, so it never steps, and every screen (the
// host's own too: it hears its simulation the same way) shows the same wind within a message. What uses it:
//  - your rounds, out in the open (js/player.ts stepRound: js/sim.ts windStep, windy), and the arc the squad's told they took
//    (predictEnd), suspects' rounds flown on the host's screen too;
//  - the ballistic computer's point-of-impact marker (js/viewmodel.ts calcStep);
//  - the flags (flagpoles: js/furniture.ts R.flagpole, placed with the level): cloth hoisted at the top of each pole,
//    streaming downwind, standing out further and fluttering faster the stronger it blows, limp in a calm. One material
//    for all of them, its vertices waved in the shader (no bones, nothing per flag a frame but its turn).
const G_Wind = (() => {
  const T = THREE;
  let from = { x: 0, z: 0 }, to = { x: 0, z: 0 }, t0 = 0, have = false;
  let flags: THREE.Object3D[] = [], mat: THREE.MeshLambertMaterial | null = null, tex: THREE.Texture | null = null, ph = 0, stand = 0.25;
  const uni = { uStand: { value: 0.25 }, uPh: { value: 0 }, uAmp: { value: 0.02 }, uW: { value: 1.5 } };
  const W = {
    mean: 0, // the level's mean wind (m/s; 0: none, nothing here does anything)
    // the wind now, { x, z } m/s (where it's blowing to): eased between what the host said
    vec() {
      if (!have) return { x: 0, z: 0 };
      const u = G.U.clamp((performance.now() - t0) / (G.Sim.WIND.SEND * 1000), 0, 1);
      return { x: from.x + (to.x - from.x) * u, z: from.z + (to.z - from.z) * u };
    },
    // the wind at a point, or null where it doesn't reach (indoors, under a roof: js/sim.ts windy) or there's none
    at(map: LvMap | null | undefined, p: { x: number; y: number; z: number }) {
      if (!this.mean || !have || !map || !G.Sim.windy(map, p.x, p.y, p.z)) return null;
      return this.vec();
    },
    // the host's word ('wind', js/game.ts): the first of a level's taken as it is, the rest eased into
    msg(w: number[]) {
      if (!Array.isArray(w) || w.length < 4 || !w.every(Number.isFinite)) return;
      from = have ? this.vec() : { x: w[0], z: w[1] };
      to = { x: w[2], z: w[3] }; t0 = performance.now(); have = true;
    },
    // A new level (js/render.ts setLevel): calm till the host says otherwise, and its flags. Returns them, to go in the level.
    level(map: LvMap) {
      have = false; from = { x: 0, z: 0 }; to = { x: 0, z: 0 };
      this.mean = map.theme && map.theme.wind > 0 ? +map.theme.wind : 0;
      flags = [];
      const g = new T.Group(); g.name = 'flags';
      const R = G.Furniture.R.flagpole;
      for (const p of map.propList || []) if (p.name === 'flagpole') {
        const F = R.flag, f = new T.Group();
        f.position.set(p.x, (p.gy || 0) + 0.3 + F.pole - F.top, p.z); // (the pole's top: on its footing's 0.3, js/furniture.ts)
        const m = new T.Mesh(cloth(F.w, F.h), material()); m.frustumCulled = false; // (its vertices move: its bounds don't hold)
        f.add(m); g.add(f); flags.push(f);
      }
      return g;
    },
    // a frame on: the flags turned downwind, how far they stand out and how fast they flutter
    update(dt: number) {
      if (!flags.length) return;
      const v = this.vec(), s = Math.hypot(v.x, v.z), x = G.U.clamp(s / 9, 0, 1), want = 0.22 + 1.36 * x * x * (3 - 2 * x); // (from hanging, 0.22 rad off the pole, to straight out at 9 m/s)
      stand += (want - stand) * (1 - Math.exp(-dt / 0.6)); // (cloth has weight: it takes a moment to rise and fall)
      ph += dt * (1.5 + 1.7 * s);
      uni.uStand.value = stand; uni.uPh.value = ph; uni.uAmp.value = 0.02 + 0.09 * Math.min(1, s / 8);
      if (s > 0.05) { const yaw = Math.atan2(-v.z, v.x); for (const f of flags) f.rotation.y = yaw; } // (its fly end to +x: three turns +x toward -z for +yaw)
    },
  };
  // the cloth: w along its fly (x, 0 at the hoist), h down (y, 0 at its top edge), cells to bend
  function cloth(w: number, h: number) {
    const geo = new T.PlaneGeometry(w, h, 14, 6);
    geo.translate(w / 2, -h / 2, 0);
    return geo;
  }
  // One material for every flag: New Mexico's, the red Zia on gold (painted once), its vertices moved in the shader: the cloth
  // turned out from the pole by uStand (0 straight down, pi/2 straight out), a wave down its length from the hoist (bigger
  // toward the fly end, uAmp), uPh how far the wave's run (each flag's own phase from where it stands).
  function material() {
    if (mat) return mat;
    tex = flagTexture();
    uni.uW.value = G.Furniture.R.flagpole.flag.w;
    mat = new T.MeshLambertMaterial({ map: tex, side: T.DoubleSide });
    mat.onBeforeCompile = (sh: any) => {
      Object.assign(sh.uniforms, uni);
      sh.vertexShader = 'uniform float uStand, uPh, uAmp, uW;\n' + sh.vertexShader.replace('#include <begin_vertex>', `
        float fu = position.x, fk = fu / uW, fph = modelMatrix[3].x * 0.37 + modelMatrix[3].z * 0.23;
        float sa = sin(uStand), ca = cos(uStand);
        vec3 transformed = vec3(fu * sa, position.y - fu * ca, 0.0);
        float wave = sin(fu * 3.4 - uPh + fph) * uAmp * (0.25 + fk) + sin(fu * 7.1 - uPh * 1.7 + fph * 2.0) * uAmp * 0.3 * fk;
        transformed.z += wave;
        transformed.y += sin(fu * 2.3 - uPh * 0.8 + fph) * uAmp * 0.4 * fk * sa;`);
    };
    return mat;
  }
  function flagTexture() {
    const c = document.createElement('canvas'); c.width = 192; c.height = 128;
    const x = c.getContext('2d')!;
    x.fillStyle = '#f2c400'; x.fillRect(0, 0, 192, 128);
    x.fillStyle = '#b8171c'; x.strokeStyle = '#b8171c';
    const cx = 96, cy = 64, r = 15;
    x.beginPath(); x.arc(cx, cy, r, 0, Math.PI * 2); x.fill();
    for (let k = 0; k < 4; k++) { // four groups of four rays, the inner two longer
      const a = k * Math.PI / 2;
      for (let i = 0; i < 4; i++) {
        const off = (i - 1.5) * 6.5, len = i === 1 || i === 2 ? 30 : 24;
        const ux = Math.cos(a), uy = Math.sin(a), px = -uy * off, py = ux * off;
        x.beginPath(); x.lineWidth = 3.6; x.moveTo(cx + ux * (r + 4) + px, cy + uy * (r + 4) + py); x.lineTo(cx + ux * (r + 4 + len) + px, cy + uy * (r + 4 + len) + py); x.stroke();
      }
    }
    const t = new T.CanvasTexture(c); t.colorSpace = T.SRGBColorSpace; t.anisotropy = 4;
    return t;
  }
  return W;
})();
G.Wind = G_Wind;
interface GameModules { Wind: typeof G_Wind; }
