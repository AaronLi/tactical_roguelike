'use strict';
// What the radars (js/radar.ts) are doing, drawn:
//   - the Electronic Warfare debug view (F8, js/space.ts): every ship's two scanning fans sweeping round her (a fading trail behind
//     each), the plots each has made (an arc at the plot's range along the fan: the angle it can't give), each tracking radar's beam
//     (a cone, the nutation of its conical scan shown; grey idle, amber slewing and sweeping the fan, red tracking) with the circle its
//     beam axis runs round; and round the squad's own ship the range a hostile scanner would detect her at, every way she could be
//     seen from (her radar cross-section, js/radar.ts rcsOf: a well-turned ship's envelope is small toward the radar), with the way
//     to that radar marked. A panel of figures beside it.
//   - the sensor station's screen (scope): the 'y' scanner's picture from above (her nose up), the 'x' scanner's from the side
//     (ahead to the right, up up), the plots fading as the sweep comes round again; the trackers' state under them; a cursor where
//     the operator is looking (js/space.ts sensorLook), and the plot it's on ringed: clicking cues a tracker on it.
import { Radar, RSuite, RTarget, RPlot } from './radar.js';

export const RadarView = (() => {
  const T = THREE, D2R = Math.PI / 180, TAU = Math.PI * 2;
  const COL = { own: 0x40e0ff, foe: 0xff5040, idle: 0x8090a0, acq: 0xffc040, track: 0xff3030 };
  const add = (m: THREE.Material) => Object.assign(m, { transparent: true, depthWrite: false, blending: T.AdditiveBlending, side: T.DoubleSide });
  // a scanner's fan at its turn 0, from the radar out to L: upright (ax 'y': in her y-z plane, toward -z) or lying (ax 'x': x-z)
  function fanGeo(ax: 'y' | 'x', fan: number, L: number) {
    const N = 24, pos: number[] = [];
    for (let i = 0; i < N; i++) {
      const e0 = -fan + 2 * fan * i / N, e1 = -fan + 2 * fan * (i + 1) / N, p0 = Radar.dirOf(ax, 0, e0).multiplyScalar(L), p1 = Radar.dirOf(ax, 0, e1).multiplyScalar(L);
      pos.push(0, 0, 0, p0.x, p0.y, p0.z, p1.x, p1.y, p1.z);
    }
    const g = new T.BufferGeometry(); g.setAttribute('position', new T.Float32BufferAttribute(pos, 3)); return g;
  }
  function cone() { const g = new T.ConeGeometry(Math.tan(Radar.TRK.bw / 2), 1, 20, 1, true); g.translate(0, -0.5, 0); g.rotateX(Math.PI / 2); return g; }
  function ring() { const pts: number[] = []; for (let i = 0; i <= 32; i++) { const a = i / 32 * TAU; pts.push(Math.cos(a), Math.sin(a), 0); } const g = new T.BufferGeometry(); g.setAttribute('position', new T.Float32BufferAttribute(pts, 3)); return g; }
  const MAXP = 96, SEG = 12;
  function make(su: RSuite, own: boolean) {
    const g = new T.Group(), c = own ? COL.own : COL.foe;
    const fans = su.scans.map((sc) => {
      const piv = new T.Group(); piv.position.copy(sc.at); g.add(piv);
      const ms = [0, 1, 2, 3, 4].map((i) => { const m = new T.Mesh(fanGeo(sc.ax, sc.fan, sc.R0), add(new T.MeshBasicMaterial({ color: c, opacity: i ? 0.07 / i : 0.22 }))); m.frustumCulled = false; piv.add(m); return m; });
      return { piv, ms };
    });
    const trks = su.trks.map(() => {
      const cn = new T.Mesh(cone(), add(new T.MeshBasicMaterial({ color: COL.idle, opacity: 0.28 }))); cn.frustumCulled = false; g.add(cn);
      const bl = new T.Line(new T.BufferGeometry().setFromPoints([new T.Vector3(), new T.Vector3(0, 0, -1)]), new T.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.6 })); bl.frustumCulled = false; g.add(bl);
      const rg = new T.Line(ring(), new T.LineBasicMaterial({ color: COL.track, transparent: true, opacity: 0.8 })); rg.frustumCulled = false; g.add(rg);
      return { cn, bl, rg };
    });
    const ag = new T.BufferGeometry(); ag.setAttribute('position', new T.BufferAttribute(new Float32Array(MAXP * SEG * 6), 3)); ag.setAttribute('color', new T.BufferAttribute(new Float32Array(MAXP * SEG * 6), 3));
    const arcs = new T.LineSegments(ag, new T.LineBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, blending: T.AdditiveBlending })); arcs.frustumCulled = false; g.add(arcs);
    return { g, fans, trks, arcs };
  }
  // the detection envelope round her (her frame): every way she could be seen from, as far as a scanner of R0 detects her that way
  // (Radar.detRange), drawn at K of the real distance
  const ENV_K = 0.005;
  function envelope(t: RTarget, R0: number) {
    const g = new T.SphereGeometry(1, 48, 24), p = g.attributes.position as THREE.BufferAttribute, u = new T.Vector3();
    for (let i = 0; i < p.count; i++) { u.fromBufferAttribute(p, i).normalize(); u.multiplyScalar(Radar.detRange(R0, Radar.rcsAt(t.rcs, u)) * ENV_K); p.setXYZ(i, u.x, u.y, u.z); }
    g.computeVertexNormals(); return g;
  }
  let root: THREE.Group | null = null, panel: HTMLElement | null = null, env: { m: THREE.LineSegments; line: THREE.Line; t: RTarget | null; key: object | null } | null = null;
  const Z = new T.Vector3(0, 0, -1);
  // the debug view, in the level's frame (parent: js/space.ts S.root), for the suites and targets as they are now
  function update(parent: THREE.Object3D | null, on: number | boolean, suites: RSuite[], targets: RTarget[], ownId: string, now: number) {
    if (!on || !parent) { if (root) root.visible = false; if (panel) panel.style.display = 'none'; return; }
    if (!root || root.parent !== parent) { if (root && root.parent) root.parent.remove(root); root = new T.Group(); parent.add(root); }
    root.visible = true;
    const lines: string[] = [];
    for (const su of suites) {
      const own = su.id === ownId;
      if (!su.dbg || su.dbg.g.parent !== root) { su.dbg = make(su, own); root.add(su.dbg.g); }
      const D = su.dbg; D.g.position.copy(su.P); D.g.quaternion.copy(su.Q);
      su.scans.forEach((sc, k) => D.fans[k].ms.forEach((m: THREE.Mesh, i: number) => { const th = sc.th - i * 4 * D2R; if (sc.ax === 'y') m.rotation.set(0, -th, 0); else m.rotation.set(th, 0, 0); }));
      su.trks.forEach((tr, k) => {
        const o = D.trks[k], len = tr.st === 'track' ? tr.rng : tr.st === 'idle' ? 0 : tr.cue ? tr.cue.r : 0;
        o.cn.visible = len > 0; o.rg.visible = tr.st === 'track';
        (o.cn.material as THREE.MeshBasicMaterial).color.setHex(tr.st === 'track' ? COL.track : tr.st === 'idle' ? COL.idle : COL.acq);
        o.cn.position.copy(tr.at); o.cn.quaternion.setFromUnitVectors(Z, tr.a); o.cn.scale.setScalar(Math.max(1, len));
        o.bl.position.copy(tr.at); o.bl.quaternion.setFromUnitVectors(Z, tr.b); o.bl.scale.setScalar(Math.max(60, len));
        if (tr.st === 'track') { o.rg.position.copy(tr.b).multiplyScalar(len).add(tr.at); o.rg.quaternion.setFromUnitVectors(new T.Vector3(0, 0, 1), tr.b); o.rg.scale.setScalar(len * Math.tan(Radar.TRK.sq)); }
        const nm = `${su.id} ${tr.side > 0 ? 'stbd' : 'port'}`;
        lines.push(`${nm}: <b>${tr.st}</b>${tr.st === 'track' ? ` ${(tr.rng / 1000).toFixed(2)} km · ${tr.db.toFixed(0)} dB · err ${(tr.err / D2R).toFixed(2)}° · q ${tr.est.q.toFixed(2)} · ${tr.lockT.toFixed(1)} s` : tr.st === 'acq' ? ` sweeping the fan, best ${tr.best.db.toFixed(0)} dB` : ''}`);
      });
      // the plots: an arc each along its fan at its range, fading as the sweep comes round
      const pa = D.arcs.geometry.attributes.position as THREE.BufferAttribute, ca = D.arcs.geometry.attributes.color as THREE.BufferAttribute, c = new T.Color(own ? COL.own : COL.foe), v = new T.Vector3(); let n = 0;
      for (const sc of su.scans) for (const p of sc.plots) {
        if (n >= MAXP * SEG * 2) break;
        const f = Math.max(0, 1 - (now - p.t) * sc.rate / TAU);
        for (let i = 0; i < SEG; i++) for (const j of [i, i + 1]) { Radar.dirOf(sc.ax, p.phi, -sc.fan + 2 * sc.fan * j / SEG, v).multiplyScalar(p.r).add(sc.at); pa.setXYZ(n, v.x, v.y, v.z); ca.setXYZ(n, c.r * f, c.g * f, c.b * f); n++; }
      }
      D.arcs.geometry.setDrawRange(0, n); pa.needsUpdate = ca.needsUpdate = true;
    }
    // her envelope, toward the nearest hostile scanner
    const me = targets.find((t) => t.id === ownId), foe = suites.find((s) => s.id !== ownId);
    if (me) {
      if (!env || env.t !== me || env.key !== me.rcs) { if (env) { root.remove(env.m); root.remove(env.line); } const R0 = Radar.SCAN.R0; env = { m: new T.LineSegments(new T.WireframeGeometry(envelope(me, R0)), new T.LineBasicMaterial({ color: 0x80ff90, transparent: true, opacity: 0.35 })), line: new T.Line(new T.BufferGeometry().setFromPoints([new T.Vector3(), new T.Vector3(0, 0, -1)]), new T.LineBasicMaterial({ color: 0xffff60 })), t: me, key: me.rcs }; env.m.frustumCulled = env.line.frustumCulled = false; root.add(env.m, env.line); }
      env.m.position.copy(me.p); env.m.quaternion.copy(me.q); env.m.visible = on !== 1; // (from your own seat it would be all round you)
      lines.unshift(`<b>${ownId}</b> RCS: ${me.rcs.mean.toFixed(1)} m² on average, ${me.rcs.max.toFixed(0)} m² at most · envelope drawn at 1:${Math.round(1 / ENV_K)}`);
      if (foe) {
        const from = foe.scans[0].at.clone().applyQuaternion(foe.Q).add(foe.P), sig = Radar.rcsToward(me, from), R = me.p.distanceTo(from), det = Radar.detRange(Radar.SCAN.R0, sig);
        env.line.visible = true; env.line.position.copy(me.p); env.line.quaternion.setFromUnitVectors(Z, from.clone().sub(me.p).normalize()); env.line.scale.setScalar(det * ENV_K);
        const seen = foe.scans.some((sc) => sc.plots.some((p) => p.id === ownId)), locked = !!Radar.lockOn(foe, ownId);
        lines.unshift(`toward <b>${foe.id}</b>'s scanner: ${sig.toFixed(1)} m² → detected inside ${(det / 1000).toFixed(2)} km · you're at ${(R / 1000).toFixed(2)} km · ${locked ? '<b style="color:#ff6050">LOCKED</b>' : seen ? '<b style="color:#ffc040">PAINTED</b>' : 'unseen'}`);
      } else env.line.visible = false;
    }
    if (!panel) { panel = document.createElement('div'); panel.id = 'ew-dbg'; Object.assign(panel.style, { position: 'fixed', left: '12px', top: '64px', zIndex: '40', font: '12px ui-monospace, Consolas, monospace', color: '#cfe8f5', background: 'rgba(4,10,16,0.72)', padding: '8px 10px', borderRadius: '4px', pointerEvents: 'none', maxWidth: '46vw', lineHeight: '1.45' }); document.body.appendChild(panel); }
    panel.style.display = ''; panel.innerHTML = '<b style="color:#40e0ff">ELECTRONIC WARFARE (F8)</b><br>' + lines.join('<br>');
  }
  // ---------------------------------------------------------------- the sensor station's screen
  const RMAX = 10000;
  // where things are on it (W x H): the two scopes' middles and radius
  const lay = (W: number, H: number) => { const R = Math.min(W * 0.24, H * 0.36); return { R, c: [[W * 0.26, H * 0.42], [W * 0.74, H * 0.42]] }; };
  // a plot's place on its scope
  function plotXY(su: RSuite, p: RPlot, W: number, H: number) {
    const L = lay(W, H), sc = su.scans[p.k], [cx, cy] = L.c[p.k], r = Math.min(1, p.r / RMAX) * L.R;
    return sc.ax === 'y' ? [cx + Math.sin(p.phi) * r, cy - Math.cos(p.phi) * r] : [cx + Math.cos(p.phi) * r, cy - Math.sin(p.phi) * r];
  }
  // the plot under the cursor (cu: x, y on the screen), if one's within 14 px
  function pick(su: RSuite, cu: number[] | null, W: number, H: number, now: number): RPlot | null {
    if (!cu) return null; let best: RPlot | null = null, bd = 14 * W / 512;
    for (const sc of su.scans) for (const p of sc.plots) { if ((now - p.t) * sc.rate > TAU) continue; const [x, y] = plotXY(su, p, W, H), d = Math.hypot(x - cu[0], y - cu[1]); if (d < bd) { bd = d; best = p; } }
    return best;
  }
  function scope(cv: HTMLCanvasElement, su: RSuite, cu: number[] | null, now: number, live: boolean) {
    const c = cv.getContext('2d')!, W = cv.width, H = cv.height, L = lay(W, H), k = W / 512;
    c.fillStyle = '#03080b'; c.fillRect(0, 0, W, H); c.lineWidth = 1 * k; c.font = `${11 * k}px ui-monospace, Consolas, monospace`; c.textBaseline = 'middle';
    su.scans.forEach((sc, i) => {
      const [cx, cy] = L.c[i];
      c.strokeStyle = '#163846'; for (const f of [1, 0.75, 0.5, 0.25]) { c.beginPath(); c.arc(cx, cy, L.R * f, 0, TAU); c.stroke(); }
      c.beginPath(); c.moveTo(cx - L.R, cy); c.lineTo(cx + L.R, cy); c.moveTo(cx, cy - L.R); c.lineTo(cx, cy + L.R); c.stroke();
      // the sweep and its afterglow
      const sw = (a: number) => sc.ax === 'y' ? [cx + Math.sin(a) * L.R, cy - Math.cos(a) * L.R] : [cx + Math.cos(a) * L.R, cy - Math.sin(a) * L.R];
      for (let j = 12; j >= 0; j--) { const [x, y] = sw(sc.th - j * 3 * D2R); c.strokeStyle = `rgba(80,220,255,${j ? 0.05 + 0.02 * (12 - j) / 12 : 0.85})`; c.beginPath(); c.moveTo(cx, cy); c.lineTo(x, y); c.stroke(); }
      for (const p of sc.plots) {
        const f = Math.max(0, 1 - (now - p.t) * sc.rate / TAU); if (f <= 0) continue;
        const [x, y] = plotXY(su, p, W, H); c.fillStyle = `rgba(140,255,170,${f})`; c.beginPath(); c.arc(x, y, (2 + Math.max(0, Math.min(3, (p.db - Radar.THR) / 6))) * k, 0, TAU); c.fill();
      }
      // the trackers' boresights on it: a tick at the scope's edge, and a box where a track has her
      su.trks.forEach((tr) => {
        if (tr.st === 'idle') return;
        const [a] = Radar.angOf(sc.ax, tr.b), [x, y] = sw(a), col = tr.st === 'track' ? '#ff4030' : '#ffc040';
        c.strokeStyle = col; c.beginPath(); c.moveTo(cx + (x - cx) * 0.9, cy + (y - cy) * 0.9); c.lineTo(x, y); c.stroke();
        if (tr.st === 'track') { const r = Math.min(1, tr.rng / RMAX) * L.R, px = cx + (x - cx) / L.R * r, py = cy + (y - cy) / L.R * r; c.strokeRect(px - 5 * k, py - 5 * k, 10 * k, 10 * k); }
      });
      c.fillStyle = '#5fa8c4'; c.fillText(sc.ax === 'y' ? 'SCAN A  bearing · nose up' : 'SCAN B  elevation · ahead →', cx - L.R, cy - L.R - 9 * k);
      c.fillText('10 km', cx + 3 * k, cy - L.R + 7 * k);
    });
    // the trackers
    su.trks.forEach((tr, i) => {
      const x = 10 * k + i * W / 2, y = H - 30 * k, col = tr.st === 'track' ? '#ff6050' : tr.st === 'idle' ? '#5f7f8f' : '#ffc040';
      c.fillStyle = col; c.fillText(`TRK ${tr.side > 0 ? 'STBD' : 'PORT'}  ${tr.st === 'track' ? 'LOCK' : tr.st === 'acq' ? 'SWEEP' : tr.st === 'slew' ? 'SLEW' : 'IDLE'}`, x, y);
      c.fillStyle = '#9fc2d4'; if (tr.st === 'track') c.fillText(`${(tr.rng / 1000).toFixed(2)} km  err ${(tr.err / D2R).toFixed(1)}°  sol ${Math.round(tr.est.q * 100)}%`, x, y + 15 * k);
    });
    if (!live) { c.fillStyle = '#3d6a80'; c.fillText('look at the screen: click a contact to track it', 10 * k, 12 * k); }
    // the cursor, and the plot under it
    if (cu) {
      const p = pick(su, cu, W, H, now);
      if (p) { const [x, y] = plotXY(su, p, W, H); c.strokeStyle = '#ffffff'; c.beginPath(); c.arc(x, y, 8 * k, 0, TAU); c.stroke(); c.fillStyle = '#ffffff'; c.fillText(`${(p.r / 1000).toFixed(2)} km  ${Math.round(p.db)} dB  click: track`, Math.min(x + 12 * k, W - 170 * k), y); }
      c.strokeStyle = 'rgba(255,255,255,0.85)'; c.beginPath(); c.moveTo(cu[0] - 9 * k, cu[1]); c.lineTo(cu[0] - 3 * k, cu[1]); c.moveTo(cu[0] + 3 * k, cu[1]); c.lineTo(cu[0] + 9 * k, cu[1]); c.moveTo(cu[0], cu[1] - 9 * k); c.lineTo(cu[0], cu[1] - 3 * k); c.moveTo(cu[0], cu[1] + 3 * k); c.lineTo(cu[0], cu[1] + 9 * k); c.stroke();
    }
  }
  return { update, scope, pick };
})();
