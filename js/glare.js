'use strict';
// Looking into someone's weapon light: anyone's, a suspect's or your squad's. It takes a light pointing near you, that you're
// looking near, with nothing between you, and the closer the worse. The bloom opens round the lamp where you see it, wider and
// whiter the more of it you're taking, washing out the screen when it's bad, with streaks across it. Your eyes take a moment to
// be dazzled and longer to come back: look away and it fades, leaving an after-image where the lamp was, going from
// white through green to nothing. js/views.js adds each light each frame (id: whose), then end() works it out and draws it,
// small, on a canvas blended over the picture.
G.Glare = (() => {
  const T = THREE, RISE = 5, FALL = 1.1, W = 384, H = 216, RANGE = 40;
  const lit = new Map(), now = [], fwd = new T.Vector3(), to = new T.Vector3(), v = new T.Vector3();
  let cv = null, g = null, shown = false, level = 0;
  const sm = (a, b, x) => { const t = G.U.clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
  function begin() { now.length = 0; }
  function add(id, p, dir, k) { now.push({ id, p: p.clone(), dir: dir.clone(), k }); }
  // how much of this light is getting to your eye: pointing at you (well within its beam), you looking toward it (at it most,
  // the edge of your view a little, behind you not at all), how near, nothing in the way
  function taken(q, cam, map) {
    to.copy(q.p).sub(cam.position);
    const d = to.length();
    if (d > RANGE || d < 0.2) return 0;
    to.divideScalar(d);
    const aim = sm(Math.cos(0.45), Math.cos(0.08), -to.dot(q.dir)), look = sm(Math.cos(1.1), Math.cos(0.1), to.dot(fwd));
    if (aim <= 0 || look <= 0) return 0;
    if (map && !G.Level.los(map, cam.position.x, cam.position.y, cam.position.z, q.p.x, q.p.y, q.p.z)) return 0;
    return aim * look * q.k / (1 + (d / 6) * (d / 6));
  }
  function end(dt) {
    const cam = G.R.camera, map = G.Game.map, playing = G.Game.phase === 'level' && !G.Me.dead;
    fwd.set(0, 0, -1).applyQuaternion(cam.quaternion);
    for (const q of now) {
      const t = playing ? taken(q, cam, map) : 0;
      if (t <= 0 && !lit.has(q.id)) continue;
      const e = lit.get(q.id) || { g: 0, peak: 0, x: 0, y: 0 };
      lit.set(q.id, e); e.t = t; e.seen = true;
      if (t > 0.01) { v.copy(q.p).project(cam); e.x = (v.x + 1) / 2; e.y = (1 - v.y) / 2; } // (an after-image stays where it was on your eye)
    }
    level = 0;
    for (const [id, e] of lit) {
      const t = e.seen ? e.t : 0; e.seen = false;
      e.g += (t - e.g) * (1 - Math.exp(-dt * (t > e.g ? RISE : FALL)));
      e.peak = Math.max(e.peak * Math.exp(-dt * 0.5), e.g);
      if (e.g < 0.01 && t <= 0) { lit.delete(id); continue; }
      level += e.g;
    }
    draw();
  }
  function draw() {
    if (!cv) { cv = document.getElementById('glareFx'); if (!cv) return; cv.width = W; cv.height = H; g = cv.getContext('2d'); }
    if (!lit.size) { if (shown) { cv.classList.add('hidden'); shown = false; } return; }
    if (!shown) { cv.classList.remove('hidden'); shown = true; }
    g.globalCompositeOperation = 'source-over'; g.clearRect(0, 0, W, H);
    g.globalCompositeOperation = 'lighter';
    const wash = Math.min(0.6, level * level * 0.5); // (never quite everything: you can always just make out the room)
    if (wash > 0.01) { g.fillStyle = `rgba(255,248,232,${wash})`; g.fillRect(0, 0, W, H); }
    for (const e of lit.values()) {
      const x = e.x * W, y = e.y * H, k = Math.min(1.4, e.g), old = e.peak > 0 ? 1 - Math.min(1, e.g / e.peak) : 0, r = H * (0.08 + 0.85 * k), a = Math.min(0.9, 0.2 + k * 0.8);
      // (white while it's on you; going over to green as it's an after-image)
      const c = `${Math.round(255 - 150 * old)},255,${Math.round(244 - 120 * old)}`, gr = g.createRadialGradient(x, y, 0, x, y, r);
      gr.addColorStop(0, `rgba(${c},${a})`); gr.addColorStop(0.14, `rgba(${c},${a * 0.55})`); gr.addColorStop(0.45, `rgba(${c},${a * 0.13})`); gr.addColorStop(1, `rgba(${c},0)`);
      g.fillStyle = gr; g.beginPath(); g.arc(x, y, r, 0, 7); g.fill();
      // (the streaks of it across your eye)
      for (const [ang, len] of [[0, 1.5], [1.05, 0.7], [-1.05, 0.7]]) {
        g.save(); g.translate(x, y); g.rotate(ang);
        const L = r * len, st = g.createLinearGradient(-L, 0, L, 0); st.addColorStop(0, `rgba(${c},0)`); st.addColorStop(0.5, `rgba(${c},${a * 0.6 * (1 - old)})`); st.addColorStop(1, `rgba(${c},0)`);
        g.fillStyle = st; g.fillRect(-L, -1 - k * 2, L * 2, 2 + k * 4); g.restore();
      }
    }
  }
  return { begin, add, end, get level() { return level; } };
})();
