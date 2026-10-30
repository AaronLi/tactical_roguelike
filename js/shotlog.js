// Breach Protocol: F9's record of the shots that hit someone (js/player.js roundDone, and the squad's through the host).
// A round's path is kept whether F9's on or not (js/player.js newPath), so this works for a shot fired before you pressed it:
// each one that hit someone leaves, for the level (the last MAX of them), a ghost of whoever it hit as they stood when it
// struck, the whole of its trail, coloured by speed as the trails are (js/render.js trailColour), and markers on it: its speed
// at the muzzle, where it crossed each Mach number, what it went through or off, how fast it went in, how fast it was past
// their armour, how fast it came out or where it stopped. The markers are for whoever's under the crosshair (js/hud.js
// debugTarget: hbLast), or the last shot if nobody is: the rest of the shots are their ghosts and trails, dimmed.
G.ShotLog = (() => {
  const T = THREE, MAX = 32, MACHS = [3, 2.5, 2, 1.5, 1, 0.5], RANGE = 90, LH = 15; // (RANGE: markers further than this aren't labelled)
  let recs = [], count = new Map(), far = new Map(), shown = false, cv = null, g = null;
  const css = (v) => '#' + G.R.trailColour(v, new T.Color()).getHexString(), mach = (v) => (v / G.SOUND_SPEED).toFixed(2);
  const rigOf = (key) => { const v = key[0] === 'e' ? G.Views.enemies.get(+key.slice(1)) : G.Views.players.get(key.slice(1)); return v && v.rig; };

  // who it hit, as they stand now: a copy of their meshes where they are this moment (the geometry's theirs: nothing of it to free).
  // (Out of your sight their body's hidden, js/views.js: someone shot through a wall is, and still has to show.)
  function ghostOf(rig) {
    const grp = new T.Group(), mat = new T.MeshBasicMaterial({ color: 0x66ccff, transparent: true, opacity: 0.1, depthTest: false, depthWrite: false, blending: T.AdditiveBlending });
    const shownBody = rig.body.visible; rig.body.visible = true;
    rig.root.updateMatrixWorld(true);
    rig.root.traverseVisible((o) => {
      if (!o.isMesh || !o.geometry || o.material.depthTest === false) return; // (their x-ray's organs, the dots of a wound track)
      const m = new T.Mesh(o.geometry, mat); m.matrixAutoUpdate = false; m.matrix.copy(o.matrixWorld); m.renderOrder = 996; m.frustumCulled = false; grp.add(m);
    });
    rig.body.visible = shownBody;
    grp.visible = !!G.Rig.debug; grp.mat = mat; grp.uses = 0;
    G.R.scene.add(grp);
    return grp;
  }
  // holder: what a shot's ghosts are kept on, one for each person whatever number of its pellets hit them
  function pose(holder, key, rig) {
    const m = holder.ghosts || (holder.ghosts = new Map());
    if (!m.has(key) && rig && rig.root.visible) m.set(key, ghostOf(rig));
  }
  // a shot of the squad's, told to us when it's done (js/game.js rpath): its ghosts are as they stand as it gets here
  const remote = (k, sid) => { const key = k + ':' + sid; if (!far.has(key)) far.set(key, {}); return far.get(key); };

  // A round's finished path: its trail, its markers. Between two points in the air it's lost speed by the metre (drag: js/player.js
  // stepRound), so its speed along that stretch is a geometric curve, and that's where it's found to have crossed a Mach
  // number. Through a solid or a body there's no such thing: the speed in and out are told instead.
  function keep(path, info) {
    if (!path || !path.hit.length) return;
    const P = path.p.map((a) => ({ p: new T.Vector3(a[0], a[1], a[2]), v: a[3] })), xs = [0], A = G.SOUND_SPEED, inside = new Set(), labels = [], verts = [];
    for (let i = 1; i < P.length; i++) xs.push(xs[i - 1] + P[i].p.distanceTo(P[i - 1].p));
    for (const e of path.ev) if (e[1] === 'e') { const x = path.ev.find((q) => q[1] === 'x' && q[0] > e[0]); if (x) for (let k = e[0]; k < x[0]; k++) inside.add(k); }
    for (const h of path.hit) if (h[7]) inside.add(h[0]);
    const add = (p, v) => verts.push({ p, v }), mark = (p, t, c, pri) => labels.push({ p, t, c, pri });
    mark(P[0].p, `Muzzle ${P[0].v} m/s · M${mach(P[0].v)}`, css(P[0].v), 3);
    add(P[0].p, P[0].v);
    const after = new Map(); // (the speed it was going past their armour, by the point it went in)
    const hits = hitRows(path, P, xs, after, mark, info);
    for (let i = 0; i + 1 < P.length; i++) {
      const a = P[i], b = P[i + 1], len = b.p.distanceTo(a.p), air = !inside.has(i) && !(len < 0.5 && b.v < a.v * 0.9) && b.v > 0 && a.v > 0;
      if (after.has(i)) add(a.p, after.get(i));
      if (air) {
        const n = Math.min(16, Math.ceil(len / 2));
        for (let k = 1; k < n; k++) { const u = k / n; add(a.p.clone().lerp(b.p, u), a.v * Math.pow(b.v / a.v, u)); }
        for (const m of MACHS) {
          const th = m * A;
          if (a.v > th && b.v <= th) { const u = Math.log(th / a.v) / Math.log(b.v / a.v), p = a.p.clone().lerp(b.p, u); mark(p, `Mach ${m} · ${Math.round(xs[i] + len * u)} m`, css(th), 2); }
        }
      }
      add(b.p, b.v);
    }
    // what it went through and off
    for (const e of path.ev) {
      if (e[1] === 'x') continue;
      const q = P[e[0]], nx = path.ev.find((z) => z[1] === 'x' && z[0] > e[0]), out = e[1] === 'r' ? P[e[0] + 1] : nx ? P[nx[0]] : null;
      mark(q.p, `${e[1] === 'r' ? 'Off' : 'Into'} ${e[6] || 'it'} ${q.v}${out ? ' → ' + out.v : ''} m/s`, css(q.v), 2);
    }
    // the stretch into someone it stopped in
    const end = path.hit[path.hit.length - 1];
    if (!end[7] && end[9] && end[9][0] > 0) { const q = P[end[0]].p.clone().add(new T.Vector3(end[4], end[5], end[6]).multiplyScalar(end[9][0])); add(q, 0); mark(q, `Stopped in ${end[9][1]} · ${Math.round(end[9][0] * 100)} cm in`, css(0), 4); }
    const pos = new Float32Array(verts.length * 3), col = new Float32Array(verts.length * 3), c = new T.Color();
    verts.forEach((q, i) => { pos.set([q.p.x, q.p.y, q.p.z], i * 3); G.R.trailColour(q.v, c); col.set([c.r, c.g, c.b], i * 3); });
    const geo = new T.BufferGeometry(); geo.setAttribute('position', new T.BufferAttribute(pos, 3)); geo.setAttribute('color', new T.BufferAttribute(col, 3));
    const mat = new T.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.4, depthTest: false, depthWrite: false }), line = new T.Line(geo, mat);
    line.frustumCulled = false; line.renderOrder = 998; line.visible = !!G.Rig.debug; G.R.scene.add(line);
    const ghosts = [], m = info.holder.ghosts;
    for (const h of hits) { if (!m || !m.has(h.key)) pose(info.holder, h.key, rigOf(h.key)); const gh = info.holder.ghosts && info.holder.ghosts.get(h.key); if (gh) { if (!ghosts.includes(gh)) { ghosts.push(gh); gh.uses++; } } }
    recs.push({ keys: new Set(hits.map((h) => h.key)), hits, line, labels: labels.sort((a, b) => b.pri - a.pri), ghosts });
    while (recs.length > MAX) drop(recs.shift());
  }
  // a hit's markers (in, past the armour, out) and its row in the readout
  function hitRows(path, P, xs, after, mark, info) {
    return path.hit.map((h) => {
      const q = P[h[0]], v = h[2], key = h[1], n = (count.get(key) || 0) + 1, kg = h[3] ? h[3][0] : 0, a = h[8], rows = a ? a.r.filter((r) => !r.un) : [], row = { key, n, name: info.name, range: Math.round(xs[h[0]]), muzzle: P[0].v, vIn: v, J: Math.round(0.5 * kg * v * v) };
      count.set(key, n);
      mark(q.p, `Entry ${v} m/s · M${mach(v)} · ${G.U.fmt(row.J)} J`, css(v), 5);
      if (a) { // (what armour was hit before the body, and what it left)
        const front = rows.slice(0, rows.findIndex((r) => !r.k) < 0 ? rows.length : rows.findIndex((r) => !r.k)), last = front[front.length - 1];
        if (a.e === 'armour') { row.stop = `${last ? G.Materials.MAT[last.k].name : 'armour'}, ${a.b} J to the body`; mark(q.p, `Stopped by ${row.stop}`, '#9fe8ff', 5); } else if (a.e === 'glance') { row.stop = 'glanced off their armour'; mark(q.p, 'Glanced off their armour', '#9fe8ff', 5); } else if (last) {
          row.post = last.o; after.set(h[0], last.o);
          mark(q.p, `Past armour ${last.o} m/s · ${Math.round((1 - (last.o * last.o) / (v * v)) * 100)}% of its energy gone`, css(last.o), 5);
        }
      }
      if (h[7]) { const out = P[h[0] + 1]; if (out) { row.out = out.v; mark(out.p, `Exit ${out.v} m/s · M${mach(out.v)}`, css(out.v), 5); } } else if (!row.stop) row.stop = h[9] ? `${h[9][1]}, ${Math.round(h[9][0] * 100)} cm in` : 'in them';
      return row;
    });
  }
  function drop(r) {
    r.line.removeFromParent(); r.line.geometry.dispose(); r.line.material.dispose();
    for (const gh of r.ghosts) if (--gh.uses <= 0) { gh.removeFromParent(); gh.mat.dispose(); }
  }
  function clear() { for (const r of recs) drop(r); recs = []; count = new Map(); far = new Map(); }
  // the shots that hit someone, oldest first (js/hud.js debugTarget's readout)
  const of = (key) => recs.flatMap((r) => r.hits.filter((h) => h.key === key));

  // Each frame the hitboxes are shown: what's lit, and the markers, laid out so they don't sit on each other: a dot on the trail
  // where it happened, its label beside it, or up the line from it if that's taken. The most important and the latest
  // shot's first: a label with nowhere to go is left out (the readout has the numbers).
  function frame() {
    const on = !!G.Rig.debug;
    if (!cv) { cv = document.getElementById('hbMarks'); if (!cv) return; g = cv.getContext('2d'); }
    if (!on || !recs.length) {
      if (shown) { for (const r of recs) { r.line.visible = false; for (const gh of r.ghosts) gh.visible = false; } cv.classList.add('hidden'); shown = false; }
      return;
    }
    if (!shown) { cv.classList.remove('hidden'); shown = true; }
    const dpr = window.devicePixelRatio || 1, W = window.innerWidth, H = window.innerHeight;
    if (cv.width !== Math.round(W * dpr) || cv.height !== Math.round(H * dpr)) { cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); }
    g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, W, H);
    const L = G.HUD.hbLast, fk = L ? (L.kind === 'e' ? 'e' + L.who.id : 'p' + L.id) : null, mine = fk ? recs.filter((r) => r.keys.has(fk)) : [], focus = new Set(mine.length ? mine : [recs[recs.length - 1]]), cam = G.R.camera, v = new T.Vector3();
    for (const r of recs) {
      const f = focus.has(r); r.line.visible = true; r.line.material.opacity = f ? 1 : 0.3;
      for (const gh of r.ghosts) { gh.visible = true; gh.mat.opacity = f ? 0.34 : 0.1; }
    }
    const el = document.getElementById('hbInfo'), panel = el && !el.classList.contains('hidden') ? el.getBoundingClientRect() : null, boxes = panel ? [[panel.left, panel.top, panel.right, panel.bottom]] : [];
    const free = (a) => !boxes.some((b) => a[0] < b[2] && a[2] > b[0] && a[1] < b[3] && a[3] > b[1]);
    g.font = '600 11px ui-monospace, Consolas, monospace'; g.textBaseline = 'middle';
    const list = [...focus].reverse().flatMap((r, i) => r.labels.map((l) => ({ l, rank: l.pri * 2 - i }))).sort((a, b) => b.rank - a.rank), seen = new Set();
    for (const { l } of list) {
      v.copy(l.p).project(cam);
      if (v.z > 1 || Math.abs(v.x) > 1 || Math.abs(v.y) > 1 || l.p.distanceTo(cam.position) > RANGE) continue;
      const x = (v.x + 1) / 2 * W, y = (1 - v.y) / 2 * H, id = l.t + '@' + Math.round(x / 6) + ',' + Math.round(y / 6);
      if (seen.has(id)) continue; // (the same thing, from the same spot: rounds fired from where you stood)
      seen.add(id);
      g.fillStyle = l.c; g.strokeStyle = '#000'; g.lineWidth = 1; g.beginPath(); g.arc(x, y, 3.5, 0, 7); g.fill(); g.stroke();
      const w = g.measureText(l.t).width + 10;
      let at = null;
      for (let k = 0; k < 14 && !at; k++) {
        const left = k >= 7, n = left ? k - 7 : k, bx = left ? x - w - 16 : x + 16, by = y - 22 - n * (LH + 3) + (n > 3 ? 2 * (n - 3) * (LH + 3) + 18 : 0), a = [bx, by, bx + w, by + LH];
        if (a[0] > 0 && a[2] < W && a[1] > 0 && a[3] < H && free(a)) at = a;
      }
      if (!at) continue;
      boxes.push(at);
      g.strokeStyle = 'rgba(255,255,255,0.45)'; g.beginPath(); g.moveTo(x, y); g.lineTo(at[0] < x ? at[2] : at[0], at[1] + LH / 2); g.stroke();
      g.fillStyle = 'rgba(6,8,10,0.86)'; g.fillRect(at[0], at[1], w, LH); g.fillStyle = l.c; g.fillRect(at[0], at[1], 2, LH);
      g.fillStyle = '#fff'; g.fillText(l.t, at[0] + 6, at[1] + LH / 2 + 0.5);
    }
  }
  return { pose, remote, keep, clear, of, frame };
})();
