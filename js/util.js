'use strict';
window.G = window.G || {};

// Colour, physically: every colour written down (a hex, a canvas, a picture) is sRGB, as a screen shows it; it's
// turned linear before it's lit (light adds up in linear: twice the lamps, twice the light), and back to sRGB on its
// way to the screen. (three's legacy mode lit the sRGB numbers as they were: a saturated colour went fluorescent
// under a bright lamp, and the falloff into shadow was a cliff.) So: colours convert as they're set, canvas and
// loaded textures are marked sRGB (decoded as they're sampled; the light grid's and render targets' data stay
// linear), and every renderer writes sRGB.
if (window.THREE) {
  THREE.ColorManagement.legacyMode = false;
  const CT = THREE.CanvasTexture;
  THREE.CanvasTexture = class extends CT { constructor(...a) { super(...a); this.encoding = THREE.sRGBEncoding; } };
  const load = THREE.TextureLoader.prototype.load;
  THREE.TextureLoader.prototype.load = function (...a) { const t = load.apply(this, a); t.encoding = THREE.sRGBEncoding; return t; };
  const WR = THREE.WebGLRenderer;
  THREE.WebGLRenderer = function (...a) { const r = new WR(...a); r.outputEncoding = THREE.sRGBEncoding; return r; };
  THREE.WebGLRenderer.prototype = WR.prototype;
}

G.U = {
  // mulberry32 — small deterministic PRNG so every peer generates the same level from a seed
  rng(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  },
  clamp: (v, a, b) => (v < a ? a : v > b ? b : v),
  lerp: (a, b, t) => a + (b - a) * t,
  ri: (r, a, b) => a + Math.floor(r() * (b - a + 1)),
  rf: (a, b) => a + Math.random() * (b - a),
  pick: (r, arr) => arr[Math.floor(r() * arr.length)],
  shuffle(r, arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(r() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  },
  angDiff(a, b) {
    let d = b - a;
    while (d > Math.PI) d -= 2 * Math.PI;
    while (d < -Math.PI) d += 2 * Math.PI;
    return d;
  },
  code(n) {
    const c = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let s = '';
    for (let i = 0; i < n; i++) s += c[Math.floor(Math.random() * c.length)];
    return s;
  },
  fmt: (n) => Math.round(n).toLocaleString(),
  esc: (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])),
  // Door-action timelines, t = 0..1 through the action. Positions are in a body frame: x right, y up,
  // z back (forward is -z), metres. Used by the first-person limbs and the third-person rig alike.
  smooth: (a, b, t) => { t = Math.min(1, Math.max(0, (t - a) / (b - a))); return t * t * (3 - 2 * t); },
  // hand on the handle: reach, turn the handle, push the door away
  openHand(t) {
    const S = G.U.smooth, reach = S(0, 0.35, t), push = S(0.5, 1, t);
    return { x: 0.26 - 0.08 * reach - 0.06 * push, y: 0.98, z: -0.15 - 0.4 * reach - 0.28 * push, twist: S(0.35, 0.5, t) * (1 - push * 0.6) };
  },
  // hand on the door's edge: reach for it, then pull it shut
  closeHand(t) {
    const S = G.U.smooth, reach = S(0, 0.45, t), pull = S(0.45, 1, t);
    return { x: 0.26 + 0.06 * reach - 0.04 * pull, y: 1.0, z: -0.15 - 0.55 * reach + 0.42 * pull, twist: 0 };
  },
  // front kick: chamber the knee, drive the heel through, recover
  kickFoot(t) {
    const S = G.U.smooth, ch = S(0, 0.35, t), th = S(0.35, 0.58, t), back = S(0.72, 1, t);
    return { y: 0.06 + (0.42 * ch + 0.08 * th) * (1 - back), z: (0.06 * ch - 0.82 * th) * (1 - back), thrust: th * (1 - back) };
  },
  // bagging evidence: reach for it, lift it, envelope up, slide it in, seal, then set it down unhurried
  bagPhases(t) {
    const S = G.U.smooth;
    return { reach: S(0.03, 0.2, t), lift: S(0.22, 0.38, t), envUp: S(0.3, 0.42, t), insert: S(0.44, 0.6, t), seal: S(0.6, 0.7, t), down: S(0.72, 0.95, t) };
  },
  hex: (n) => '#' + (n >>> 0).toString(16).padStart(6, '0'),
  store: {
    get(k, d) { try { const v = localStorage.getItem('bp_' + k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem('bp_' + k, JSON.stringify(v)); } catch (e) { /* storage unavailable */ } },
  },
};
