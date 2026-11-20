'use strict';
// What the radars (js/radar.ts) are doing, drawn:
//   - the Electronic Warfare debug view (F8, js/space.ts): every ship's two scanning fans sweeping round her (a fading trail behind
//     each), the plots each has made (an arc at the plot's range along the fan: the angle it can't give), each tracking radar's beam
//     (a cone, the nutation of its conical scan shown, and a glow at its mount; the squad's ship in blues, every other in reds: js/radarview.ts PAL) with the circle its
//     beam axis runs round; and round the squad's own ship the range a hostile scanner would detect her at, every way she could be
//     seen from (her radar cross-section, js/radar.ts rcsOf: a well-turned ship's envelope is small toward the radar), with the way
//     to that radar marked. A panel of figures beside it.
//   - the sensor station's screen (scope): the 'y' scanner's picture from above (her nose up), the 'z' scanner's from astern
//     (round her length, her up at the top), the plots fading as the sweep comes round again; the trackers' state under them; a cursor where
//     the operator is looking (js/space.ts sensorLook), and the plot it's on ringed: clicking cues a tracker on it.
import { Radar, RSuite, RTarget, RPlot, RScan, RContact } from './radar.js';

export const RadarView = (() => {
  const T = THREE, D2R = Math.PI / 180, TAU = Math.PI * 2;
  // each ship's colours: the squad's ship in blues (her fans cyan, her trackers teal while they acquire and blue once they track),
  // every other ship in reds (fans red, trackers amber acquiring and red tracking)
  const PAL = { own: { fan: 0x40e0ff, idle: 0x5a7890, acq: 0x60ffd0, track: 0x3090ff, ring: 0x90d8ff }, foe: { fan: 0xff5040, idle: 0x907070, acq: 0xffa030, track: 0xff2020, ring: 0xff8070 } };
  const COL = { own: PAL.own.fan, foe: PAL.foe.fan };
  // a glow at a tracker's mount (the same size on screen however far: a beam pointed at you is otherwise a point)
  let glowTex: THREE.Texture | null = null;
  function glow(c: number) {
    if (!glowTex) { const cv = document.createElement('canvas'); cv.width = cv.height = 64; const x = cv.getContext('2d')!, g = x.createRadialGradient(32, 32, 0, 32, 32, 32); g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.25, 'rgba(255,255,255,0.6)'); g.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = g; x.fillRect(0, 0, 64, 64); glowTex = new T.CanvasTexture(cv); }
    const sp = new T.Sprite(new T.SpriteMaterial({ map: glowTex, color: c, transparent: true, depthWrite: false, depthTest: false, blending: T.AdditiveBlending, sizeAttenuation: false }));
    sp.scale.setScalar(0.035); sp.frustumCulled = false; sp.renderOrder = 10; return sp;
  }
  const add = (m: THREE.Material) => Object.assign(m, { transparent: true, depthWrite: false, blending: T.AdditiveBlending, side: T.DoubleSide });
  // a scanner's fan, from the radar out to its R0, drawn turned to th: a triangle a step along it, and none where her own hull's
  // in the way (past its mast's plane by more than it sees over her edge: RScan mask), so the fan never cuts through her
  const NF = 24;
  function fanGeo() { const g = new T.BufferGeometry(); g.setAttribute('position', new T.BufferAttribute(new Float32Array(NF * 9), 3)); return g; }
  const _f0 = new T.Vector3(), _f1 = new T.Vector3(), _fm = new T.Vector3();
  function fanFill(m: THREE.Mesh, sc: RScan, th: number) {
    const pa = m.geometry.attributes.position as THREE.BufferAttribute, L = sc.R0;
    for (let i = 0; i < NF; i++) {
      const e0 = -sc.fan + 2 * sc.fan * i / NF, e1 = -sc.fan + 2 * sc.fan * (i + 1) / NF;
      Radar.dirOf(sc.ax, th, e0, _f0); Radar.dirOf(sc.ax, th, e1, _f1); _fm.addVectors(_f0, _f1).normalize();
      const k = i * 3;
      if (_fm.dot(sc.n) < -sc.mask) { pa.setXYZ(k, 0, 0, 0); pa.setXYZ(k + 1, 0, 0, 0); pa.setXYZ(k + 2, 0, 0, 0); continue; }
      pa.setXYZ(k, 0, 0, 0); pa.setXYZ(k + 1, _f0.x * L, _f0.y * L, _f0.z * L); pa.setXYZ(k + 2, _f1.x * L, _f1.y * L, _f1.z * L);
    }
    pa.needsUpdate = true;
  }
  function cone() { const g = new T.ConeGeometry(Math.tan(Radar.TRK.bw / 2), 1, 20, 1, true); g.translate(0, -0.5, 0); g.rotateX(Math.PI / 2); return g; }
  function ring() { const pts: number[] = []; for (let i = 0; i <= 32; i++) { const a = i / 32 * TAU; pts.push(Math.cos(a), Math.sin(a), 0); } const g = new T.BufferGeometry(); g.setAttribute('position', new T.Float32BufferAttribute(pts, 3)); return g; }
  const MAXP = 96, SEG = 12;
  function make(su: RSuite, own: boolean) {
    const g = new T.Group(), P = own ? PAL.own : PAL.foe, c = P.fan;
    const fans = su.scans.map((sc) => {
      const piv = new T.Group(); piv.position.copy(sc.at); g.add(piv);
      const ms = [0, 1, 2, 3, 4].map((i) => { const m = new T.Mesh(fanGeo(), add(new T.MeshBasicMaterial({ color: c, opacity: i ? 0.025 / i : 0.08 }))); m.frustumCulled = false; piv.add(m); return m; });
      return { piv, ms };
    });
    const trks = su.trks.map(() => {
      const cn = new T.Mesh(cone(), add(new T.MeshBasicMaterial({ color: P.idle, opacity: 0.1 }))); cn.frustumCulled = false; g.add(cn);
      const bl = new T.Line(new T.BufferGeometry().setFromPoints([new T.Vector3(), new T.Vector3(0, 0, -1)]), new T.LineBasicMaterial({ color: P.ring, transparent: true, opacity: 0.7 })); bl.frustumCulled = false; g.add(bl);
      const rg = new T.Line(ring(), new T.LineBasicMaterial({ color: P.ring, transparent: true, opacity: 0.8 })); rg.frustumCulled = false; g.add(rg);
      const gl = glow(P.track); g.add(gl);
      return { cn, bl, rg, gl };
    });
    const ag = new T.BufferGeometry(); ag.setAttribute('position', new T.BufferAttribute(new Float32Array(MAXP * SEG * 6), 3)); ag.setAttribute('color', new T.BufferAttribute(new Float32Array(MAXP * SEG * 6), 3));
    const arcs = new T.LineSegments(ag, new T.LineBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, blending: T.AdditiveBlending })); arcs.frustumCulled = false; g.add(arcs);
    // (each tracker's solution's trajectory, in the level's frame: put in the view's root, not her group)
    const traj = su.trks.map(() => { const past = new T.Line(new T.BufferGeometry().setAttribute('position', new T.BufferAttribute(new Float32Array(90 * 3), 3)), new T.LineBasicMaterial({ color: P.track, transparent: true, opacity: 0.85 })), fut = new T.Line(new T.BufferGeometry().setAttribute('position', new T.BufferAttribute(new Float32Array(11 * 3), 3)), new T.LineDashedMaterial({ color: P.track, dashSize: 12, gapSize: 8, transparent: true, opacity: 0.85 })); past.frustumCulled = fut.frustumCulled = false; return { past, fut }; });
    return { g, fans, trks, arcs, P, traj };
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
  const marks: HTMLElement[] = []; let nmk = 0;
  function mark(i: number) {
    while (marks.length <= i) { const el = document.createElement('div'); Object.assign(el.style, { position: 'fixed', zIndex: '39', width: '30px', height: '30px', marginLeft: '-17px', marginTop: '-17px', border: '2px solid', borderRadius: '50%', pointerEvents: 'none', display: 'none' }); const lb = document.createElement('span'); Object.assign(lb.style, { position: 'absolute', left: '36px', top: '6px', font: '700 12px ui-monospace, Consolas, monospace', whiteSpace: 'nowrap', textShadow: '0 0 3px #000' }); el.appendChild(lb); document.body.appendChild(el); marks.push(el); }
    return marks[i];
  }
  // the debug view, in the level's frame (parent: js/space.ts S.root), for the suites and targets as they are now
  function update(parent: THREE.Object3D | null, on: number | boolean, suites: RSuite[], targets: RTarget[], ownId: string, now: number, cam?: THREE.Camera, sel = ownId) {
    for (const m of marks) m.style.display = 'none';
    if (!on || !parent) { if (root) root.visible = false; if (panel) panel.style.display = 'none'; return; }
    nmk = 0;
    if (!root || root.parent !== parent) { if (root && root.parent) root.parent.remove(root); root = new T.Group(); parent.add(root); }
    root.visible = true;
    const lines: string[] = [], selSu = suites.find((q) => q.id === sel) || suites[0];
    for (const g0 of [...root.children]) if (g0.userData.su && !suites.includes(g0.userData.su)) root.remove(g0); // (a ship's gone out of reach)
    for (const su of suites) {
      const own = su.id === ownId, mine = su === selSu;
      if (!su.dbg || su.dbg.g.parent !== root) { su.dbg = make(su, own); su.dbg.g.userData.su = su; for (const tj of su.dbg.traj) tj.past.userData.su = tj.fut.userData.su = su; root.add(su.dbg.g); }
      const D = su.dbg; D.g.position.copy(su.P); D.g.quaternion.copy(su.Q);
      // (her fans and beams drawn for the ship whose radars are shown, and the squad's own; the rest only their trackers' markers)
      D.g.visible = mine || own;
      if (!D.g.visible) { for (const tj of D.traj) tj.past.visible = tj.fut.visible = false; for (const [k, tr] of su.trks.entries()) { void k; if (cam && tr.st !== 'idle') trackMark(tr, D, cam, ownId, now); } continue; }
      su.scans.forEach((sc, k) => { D.fans[k].piv.position.copy(sc.at); D.fans[k].ms.forEach((m: THREE.Mesh, i: number) => fanFill(m, sc, sc.th - i * 4 * D2R)); });
      su.trks.forEach((tr, k) => {
        const o = D.trks[k], len = tr.st === 'idle' ? 0 : tr.hand ? tr.hand.p.distanceTo(su.P) : tr.rng; // (acquiring: its range gate where it's looking)
        o.cn.visible = len > 0; o.rg.visible = tr.st === 'track';
        const hue = tr.st === 'track' ? D.P.track : tr.st === 'idle' ? D.P.idle : D.P.acq;
        (o.cn.material as THREE.MeshBasicMaterial).color.setHex(hue); (o.cn.material as THREE.MeshBasicMaterial).opacity = tr.st === 'track' ? 0.16 : 0.1;
        o.gl.visible = tr.st !== 'idle'; o.gl.position.copy(tr.at); (o.gl.material as THREE.SpriteMaterial).color.setHex(hue); o.gl.scale.setScalar(tr.st === 'track' ? 0.03 + 0.012 * Math.sin(now * 12) : 0.025);
        o.cn.position.copy(tr.at); o.cn.quaternion.setFromUnitVectors(Z, tr.a); o.cn.scale.setScalar(Math.max(1, len));
        o.bl.position.copy(tr.at); o.bl.quaternion.setFromUnitVectors(Z, tr.b); o.bl.scale.setScalar(Math.max(60, len));
        if (tr.st === 'track') { o.rg.position.copy(tr.b).multiplyScalar(len).add(tr.at); o.rg.quaternion.setFromUnitVectors(new T.Vector3(0, 0, 1), tr.b); o.rg.scale.setScalar(len * Math.tan(Radar.TRK.sq)); }
        const nm = `${su.id} ${tr.side > 0 ? 'stbd' : 'port'}`;
        if (!own && cam && tr.st !== 'idle') trackMark(tr, D, cam, ownId, now);
        // its solution's trajectory in space: where it's had its target (solid) and where it has it going, 10 s (dashed)
        const tj = D.traj[k]; if (tj.past.parent !== root) root!.add(tj.past, tj.fut);
        const showT = tr.st === 'track' && !!tr.est.p && !!tr.hist && tr.hist.length > 1; tj.past.visible = tj.fut.visible = showT;
        if (showT) {
          const pa = tj.past.geometry.attributes.position as THREE.BufferAttribute, h = tr.hist!.slice(-90); h.forEach((q, i) => pa.setXYZ(i, q.p.x, q.p.y, q.p.z)); pa.needsUpdate = true; tj.past.geometry.setDrawRange(0, h.length);
          const fa = tj.fut.geometry.attributes.position as THREE.BufferAttribute; for (let i = 0; i <= 10; i++) { const p = tr.est.p!.clone().addScaledVector(tr.est.v, i); fa.setXYZ(i, p.x, p.y, p.z); } fa.needsUpdate = true; tj.fut.computeLineDistances();
        }
        if (mine) lines.push(`${nm}: <b>${tr.st}</b>${tr.st === 'track' ? ` ${(tr.rng / 1000).toFixed(2)} km · ${tr.db.toFixed(0)} dB · err ${(tr.err / D2R).toFixed(2)}° · q ${tr.est.q.toFixed(2)} · ${tr.lockT.toFixed(1)} s` : tr.st === 'acq' ? ` sweeping the fan, best ${tr.best.db.toFixed(0)} dB` : ''}`);
      });
      // the plots: an arc each along its fan at its range, fading as the sweep comes round
      if (!mine) { D.arcs.geometry.setDrawRange(0, 0); continue; }
      const pa = D.arcs.geometry.attributes.position as THREE.BufferAttribute, ca = D.arcs.geometry.attributes.color as THREE.BufferAttribute, c = new T.Color(own ? COL.own : COL.foe), v = new T.Vector3(); let n = 0;
      for (const sc of su.scans) for (const p of sc.plots) {
        if (n >= MAXP * SEG * 2) break;
        const f = Math.max(0, 1 - (now - p.t) * sc.rate / TAU);
        const pq = p.q || su.Q, po = p.o || su.P; qi.copy(su.Q).invert(); // (where it was, in space: drawn in her frame as she is now)
        for (let i = 0; i < SEG; i++) if (Radar.dirOf(sc.ax, p.phi, -sc.fan + 2 * sc.fan * (i + 0.5) / SEG, _fm).dot(sc.n) >= -sc.mask) for (const j of [i, i + 1]) { /* (not where her hull hides it) */ Radar.dirOf(sc.ax, p.phi, -sc.fan + 2 * sc.fan * j / SEG, v).multiplyScalar(p.r).add(sc.at).applyQuaternion(pq).add(po).sub(su.P).applyQuaternion(qi); pa.setXYZ(n, v.x, v.y, v.z); ca.setXYZ(n, c.r * f, c.g * f, c.b * f); n++; }
      }
      D.arcs.geometry.setDrawRange(0, n); pa.needsUpdate = ca.needsUpdate = true;
    }
    // her envelope, toward the nearest hostile scanner
    const me = targets.find((t) => t.id === ownId), foe = suites.find((s) => s.id === 'hull');
    if (me) {
      if (!env || env.t !== me || env.key !== me.rcs) { if (env) { root.remove(env.m); root.remove(env.line); } const R0 = Radar.SCAN.R0; env = { m: new T.LineSegments(new T.WireframeGeometry(envelope(me, R0)), new T.LineBasicMaterial({ color: 0x80ff90, transparent: true, opacity: 0.35 })), line: new T.Line(new T.BufferGeometry().setFromPoints([new T.Vector3(), new T.Vector3(0, 0, -1)]), new T.LineBasicMaterial({ color: 0xffff60 })), t: me, key: me.rcs }; env.m.frustumCulled = env.line.frustumCulled = false; root.add(env.m, env.line); }
      env.m.position.copy(me.p); env.m.quaternion.copy(me.q); env.m.visible = sel !== ownId; // (from your own seat it would be all round you)
      lines.unshift(`<b>${ownId}</b> RCS: ${me.rcs.mean.toFixed(1)} m² on average, ${me.rcs.max.toFixed(0)} m² at most · envelope drawn at 1:${Math.round(1 / ENV_K)}`);
      if (foe) {
        const from = foe.scans[0].at.clone().applyQuaternion(foe.Q).add(foe.P), sig = Radar.rcsToward(me, from), R = me.p.distanceTo(from), det = Radar.detRange(Radar.SCAN.R0, sig);
        env.line.visible = true; env.line.position.copy(me.p); env.line.quaternion.setFromUnitVectors(Z, from.clone().sub(me.p).normalize()); env.line.scale.setScalar(det * ENV_K);
        const seen = foe.scans.some((sc) => sc.plots.some((p) => p.id === ownId)), locked = !!Radar.lockOn(foe, ownId);
        lines.unshift(`toward <b>${foe.id}</b>'s scanner: ${sig.toFixed(1)} m² → detected inside ${(det / 1000).toFixed(2)} km · you're at ${(R / 1000).toFixed(2)} km · ${locked ? '<b style="color:#ff6050">LOCKED</b>' : seen ? '<b style="color:#ffc040">PAINTED</b>' : 'unseen'}`);
      } else env.line.visible = false;
    }
    if (!panel) { panel = document.createElement('div'); panel.id = 'ew-dbg'; Object.assign(panel.style, { position: 'fixed', left: '2vw', top: '56px', zIndex: '40', font: '12px ui-monospace, Consolas, monospace', color: '#cfe8f5', background: 'rgba(4,10,16,0.8)', padding: '6px 10px', borderRadius: '4px', pointerEvents: 'none', width: '96vw', boxSizing: 'border-box', lineHeight: '1.4' }); document.body.appendChild(panel); }
    const head = selSu ? `<b style="color:#40e0ff">ELECTRONIC WARFARE (F8: next ship)</b> · <b>${selSu.id === ownId ? 'your ship' : selSu.name || selSu.id}</b>${selSu.id === 'hull' ? ' · fire control: tracks the nearest contact that doesn\'t answer as a civilian' : selSu.id === ownId ? '' : ' · civilian: no fire control'} · <span style="color:#40e0ff">■ yours</span> <span style="color:#ff5040">■ theirs</span>` : '';
    panel.style.display = ''; panel.innerHTML = head + '<br>' + lines.join('<br>');
    if (selSu) panel.appendChild(pipeline(selSu, now, panel.clientWidth - 20)); // (her radars' picture, stage by stage)
  }
  // ---------------------------------------------------------------- the sensor station's screen
  const RMAX = 10000;
  // where things are on it (W x H): the two scopes' middles and radius. Range goes out as its square root (10 km at the edge, 2.5 km
  // half way, 625 m a quarter): close in is where things happen
  const lay = (W: number, H: number) => { const R = Math.min(W * 0.24, H * 0.36); return { R, c: [[W * 0.26, H * 0.42], [W * 0.74, H * 0.42]] }; };
  const rOut = (r: number, R: number) => Math.sqrt(Math.min(1, Math.max(0, r) / RMAX)) * R;
  // a plot's turn angle as she's turned now (the middle of its fan, made when she was turned p.q, in her frame now), so what she's
  // painted stays where it is in space while she turns
  const qi = new T.Quaternion(), _d = new T.Vector3();
  function phiNow(su: RSuite, p: RPlot) { if (!p.q) return p.phi; const ax = su.scans[p.k].ax; Radar.dirOf(ax, p.phi, 0, _d).applyQuaternion(p.q).applyQuaternion(qi.copy(su.Q).invert()); return Radar.angOf(ax, _d)[0]; }
  const sOf = (ax: string) => (ax === 'y' ? 0 : 1);
  function polar(cx: number, cy: number, ax: string, a: number, r: number) { return ax !== 'x' ? [cx + Math.sin(a) * r, cy - Math.cos(a) * r] : [cx + Math.cos(a) * r, cy - Math.sin(a) * r]; }
  function plotXY(su: RSuite, p: RPlot, W: number, H: number) { const L = lay(W, H), sc = su.scans[p.k], [cx, cy] = L.c[sOf(sc.ax)]; return polar(cx, cy, sc.ax, phiNow(su, p), rOut(p.r, L.R)); }
  // the contacts on a scanner's map that are worth showing: seen at least twice, or just now
  const shown = (sc: RScan, now: number) => sc.cons.filter((c) => c.hits >= 2 || now - c.t < 0.5);
  // the contact under the cursor (cu: x, y on the screen), if one's within 14 px: its latest plot (what a tracker's cued on)
  function pick(su: RSuite, cu: number[] | null, W: number, H: number, now: number): RPlot | null {
    if (!cu) return null; let best: RPlot | null = null, bd = 14 * W / 512;
    for (const sc of su.scans) for (const c of shown(sc, now)) { const [x, y] = plotXY(su, c.p, W, H), d = Math.hypot(x - cu[0], y - cu[1]); if (d < bd) { bd = d; best = c.p; } }
    return best;
  }
  const conOf = (su: RSuite, p: RPlot) => su.scans[p.k].cons.find((c) => c.p === p);
  // a contact as its IFF answer has it: the mission's ship red, a civilian grey-blue, the squad's own ship green, no answer amber
  // (as the ship looking has it (who: her id): to the squad's ship the mission's ship is its target; to the mission's ship the
  // squad's is the hostile; to a civilian anything that isn't a civilian is just a name)
  const kind = (c: RContact, who: string) => (!c.iff ? '?' : c.iff.c === 'civ' ? 'civ' : who === 'own' ? (c.iff.c === 'tgt' ? 'tgt' : 'own') : who === 'hull' ? (c.iff.c === 'squad' ? 'tgt' : 'own') : 'named');
  const iffCol = (c: RContact, who = 'own') => ({ '?': '255,200,90', civ: '140,170,190', tgt: '255,90,70', own: '110,240,140', named: '225,228,236' } as Record<string, string>)[kind(c, who)];
  const iffTxt = (c: RContact, who = 'own') => { const k0 = kind(c, who); return k0 === '?' ? c.n + ' ?' : c.n + ' ' + (k0 === 'tgt' ? (who === 'hull' ? 'HOSTILE ' : 'TGT ') : k0 === 'civ' ? 'CIV ' : '') + c.iff!.n; };
  // The map drawn: each pixel of a scope is an angle and a range (worked out once a layout: lut), looked up on the map where that
  // angle is now (the map's held still about its axis: off), its brightness the power there in dB over the noise, dimmer the longer
  // since the sweep wrote it (a PPI's afterglow)
  let lutFor = '', lut: { i: Int32Array; a: Float32Array; rb: Int32Array; s: Uint8Array } | null = null, img: ImageData | null = null;
  function makeLut(W: number, H: number) {
    const L = lay(W, H), idx: number[] = [], an: number[] = [], rb: number[] = [], sc: number[] = [];
    for (let s = 0; s < 2; s++) {
      const [cx, cy] = L.c[s];
      for (let y = Math.floor(cy - L.R); y <= Math.ceil(cy + L.R); y++) for (let x = Math.floor(cx - L.R); x <= Math.ceil(cx + L.R); x++) {
        if (x < 0 || y < 0 || x >= W || y >= H) continue;
        const dx = x + 0.5 - cx, dy = y + 0.5 - cy, d = Math.hypot(dx, dy); if (d > L.R) continue;
        const r = (d / L.R) ** 2 * RMAX; idx.push(y * W + x); an.push(Math.atan2(dx, -dy)); rb.push(Math.min(Radar.MAP.nr - 1, Math.floor(r / Radar.MAP.dr))); sc.push(s);
      }
    }
    lut = { i: Int32Array.from(idx), a: Float32Array.from(an), rb: Int32Array.from(rb), s: Uint8Array.from(sc) }; lutFor = W + 'x' + H;
  }
  function scope(cv: HTMLCanvasElement, su: RSuite, cu: number[] | null, now: number, live: boolean) {
    const c = cv.getContext('2d')!, W = cv.width, H = cv.height, L = lay(W, H), k = W / 512, M = Radar.MAP;
    if (lutFor !== W + 'x' + H || !lut) makeLut(W, H);
    if (!img || img.width !== W || img.height !== H) { img = c.createImageData(W, H); const d0 = img.data; for (let q = 0; q < d0.length; q += 4) { d0[q] = 3; d0[q + 1] = 8; d0[q + 2] = 11; d0[q + 3] = 255; } }
    const d = img.data, U = lut!, byS = [0, 1].map((s0) => su.scans.find((q) => sOf(q.ax) === s0) || null), TAUa = TAU / M.na;
    for (let n = 0; n < U.i.length; n++) {
      const sc = byS[U.s[n]], o = U.i[n] * 4; if (!sc) { d[o] = 3; d[o + 1] = 8; d[o + 2] = 11; continue; }
      let A = (U.a[n] - sc.off) % TAU; if (A < 0) A += TAU; const col = Math.floor(A / TAUa) % M.na, v = sc.map[col * M.nr + U.rb[n]];
      const age = (now - sc.age[col]) * sc.rate / TAU, f = age > 1 ? 0 : 0.3 + 0.7 * (1 - age), db = 10 * Math.log10(Math.max(1e-3, v)), b = Math.max(0, Math.min(1, (db - 2) / 22)) * f;
      d[o] = 4 + 120 * b * b; d[o + 1] = 10 + 245 * b; d[o + 2] = 14 + 140 * b * b;
    }
    c.putImageData(img, 0, 0);
    c.lineWidth = 1 * k; c.font = `${11 * k}px ui-monospace, Consolas, monospace`; c.textBaseline = 'middle';
    su.scans.forEach((sc) => {
      const [cx, cy] = L.c[sOf(sc.ax)];
      c.strokeStyle = 'rgba(40,110,140,0.55)'; for (const r of [625, 2500, 5625, 10000]) { c.beginPath(); c.arc(cx, cy, rOut(r, L.R), 0, TAU); c.stroke(); }
      c.beginPath(); c.moveTo(cx - L.R, cy); c.lineTo(cx + L.R, cy); c.moveTo(cx, cy - L.R); c.lineTo(cx, cy + L.R); c.stroke();
      const [x, y] = polar(cx, cy, sc.ax, sc.th, L.R); c.strokeStyle = 'rgba(120,230,255,0.8)'; c.beginPath(); c.moveTo(cx, cy); c.lineTo(x, y); c.stroke();
      // its contacts: a box and its number on each peak it's following
      for (const ct of shown(sc, now)) {
        const [px, py] = plotXY(su, ct.p, W, H), fresh = Math.max(0.35, 1 - (now - ct.t) * sc.rate / TAU), col = iffCol(ct);
        c.strokeStyle = `rgba(${col},${fresh})`; c.strokeRect(px - 4 * k, py - 4 * k, 8 * k, 8 * k); c.fillStyle = `rgba(${col},${fresh})`; c.fillText(ct.iff && ct.iff.c === 'civ' ? ct.n : iffTxt(ct), px + 6 * k, py - 6 * k);
      }
      // the trackers' boresights on it: a tick at the scope's edge, and a box where a track has her
      su.trks.forEach((tr) => {
        if (tr.st === 'idle') return;
        const [a] = Radar.angOf(sc.ax, tr.b), [tx, ty] = polar(cx, cy, sc.ax, a, L.R), col = tr.st === 'track' ? '#ff4030' : '#ffc040';
        c.strokeStyle = col; c.beginPath(); c.moveTo(cx + (tx - cx) * 0.9, cy + (ty - cy) * 0.9); c.lineTo(tx, ty); c.stroke();
        if (tr.st === 'track') { const [px, py] = polar(cx, cy, sc.ax, a, rOut(tr.rng, L.R)); c.strokeRect(px - 6 * k, py - 6 * k, 12 * k, 12 * k); }
      });
      c.fillStyle = '#5fa8c4'; c.fillText(sc.ax === 'y' ? 'SCAN A  bearing · nose up' : sc.ax === 'z' ? 'SCAN B  roll · from astern, up ↑' : 'SCAN B  elevation · ahead →', cx - L.R, cy - L.R - 9 * k);
      c.fillStyle = '#3d7a90'; c.fillText('10', cx + 2 * k, cy - L.R + 6 * k); c.fillText('2.5', cx + 2 * k, cy - rOut(2500, L.R) + 6 * k);
    });
    // the trackers
    su.trks.forEach((tr, i) => {
      const x = 10 * k + i * W / 2, y = H - 30 * k, col = tr.st === 'track' ? '#ff6050' : tr.st === 'idle' ? '#5f7f8f' : '#ffc040';
      c.fillStyle = col; c.fillText(`TRK ${tr.side > 0 ? 'STBD' : 'PORT'}  ${tr.st === 'track' ? 'LOCK' : tr.st === 'acq' ? 'SWEEP' : tr.st === 'slew' ? 'SLEW' : 'IDLE'}`, x, y);
      c.fillStyle = '#9fc2d4'; if (tr.st === 'track') c.fillText(`${(tr.rng / 1000).toFixed(2)} km  err ${(tr.err / D2R).toFixed(1)}°  sol ${Math.round(tr.est.q * 100)}%`, x, y + 15 * k);
    });
    if (!live) { c.fillStyle = '#3d6a80'; c.fillText('look at the screen: click a contact to track it', 10 * k, 12 * k); }
    // the cursor, and the contact under it
    if (cu) {
      const p = pick(su, cu, W, H, now);
      if (p) { const [x, y] = plotXY(su, p, W, H), ct = conOf(su, p); c.strokeStyle = '#ffffff'; c.beginPath(); c.arc(x, y, 9 * k, 0, TAU); c.stroke(); c.fillStyle = '#ffffff'; c.fillText(`${ct ? iffTxt(ct) + '  ' : ''}${(p.r / 1000).toFixed(2)} km  ${Math.round(p.db)} dB  click: track`, Math.min(x + 12 * k, W - 230 * k), y + 12 * k); }
      c.strokeStyle = 'rgba(255,255,255,0.85)'; c.beginPath(); c.moveTo(cu[0] - 9 * k, cu[1]); c.lineTo(cu[0] - 3 * k, cu[1]); c.moveTo(cu[0] + 3 * k, cu[1]); c.lineTo(cu[0] + 9 * k, cu[1]); c.moveTo(cu[0], cu[1] - 9 * k); c.lineTo(cu[0], cu[1] - 3 * k); c.moveTo(cu[0], cu[1] + 3 * k); c.lineTo(cu[0], cu[1] + 9 * k); c.stroke();
    }
  }
  // another ship's tracker on her: a marker on the screen where its turret is (a beam pointed at you is a point, seen from you)
  function trackMark(tr: RSuite['trks'][0], D: any, cam: THREE.Camera, ownId: string, now: number) {
    const w = tr.at.clone().applyMatrix4(D.g.matrixWorld).project(cam);
    if (w.z >= 1 || Math.abs(w.x) > 1.2 || Math.abs(w.y) > 1.2) return;
    const el = mark(nmk++), lk = tr.st === 'track' && tr.tgt === ownId;
    el.style.display = ''; el.style.left = ((w.x + 1) / 2 * innerWidth) + 'px'; el.style.top = ((1 - w.y) / 2 * innerHeight) + 'px';
    el.style.color = lk ? '#ff3030' : '#ffa030'; el.style.borderColor = el.style.color; el.style.opacity = lk ? String(0.65 + 0.35 * Math.sin(now * 12)) : '0.9';
    el.firstChild!.textContent = lk ? 'TRK LOCK' : tr.st === 'track' ? 'TRK' : 'ACQ';
  }
  // The debug view's pipeline (F8): a ship's radars' picture, stage by stage across the screen, a row a scanner. Every cell's angle
  // across (her nose, or her up, in the middle: as she's turned now) and range down (its square root, 10 km at the bottom):
  //   1 RAW: the map as the sweep left it, its power in dB over the noise
  //   2 FILTER: each cell over the mean of the noise round it in range (CA-CFAR's ratio); orange where that's over the threshold,
  //     and the peaks found (the plots) ringed
  //   3 TRACK: the plots of the last sweeps, each contact's joined up (a point seen sweep after sweep is a contact; one seen once is
  //     a tentative one, hollow)
  //   4 IDENTIFY: each contact with its IFF answer, range and range rate; the ones her trackers are on marked
  // Redrawn ten times a second.
  let pipeCv: HTMLCanvasElement | null = null, pipeImg: ImageData | null = null, pipeAt = -1, pipeFor = '';
  function pipeline(su: RSuite, now: number, width: number) {
    const M = Radar.MAP, K = 5, gap = 10, CW = Math.max(600, Math.min(1700, Math.floor(width))), cw = Math.floor((CW - gap * (K - 1)) / 5.8), cw3 = Math.floor(cw * 1.8), ch = 128, top = 16, rh = ch + 16, CH = top + su.scans.length * rh;
    if (!pipeCv) { pipeCv = document.createElement('canvas'); pipeCv.style.display = 'block'; pipeCv.style.marginTop = '4px'; }
    if (pipeCv.width !== CW || pipeCv.height !== CH) { pipeCv.width = CW; pipeCv.height = CH; pipeImg = null; pipeAt = -1; }
    if (now - pipeAt < 0.1 && pipeFor === su.id) return pipeCv;
    pipeAt = now; pipeFor = su.id;
    const c = pipeCv.getContext('2d')!; if (!pipeImg) pipeImg = c.createImageData(CW, CH);
    const d = pipeImg.data; for (let q = 0; q < d.length; q += 4) { d[q] = 4; d[q + 1] = 9; d[q + 2] = 13; d[q + 3] = 230; }
    const DA = TAU / M.na, rbOf = new Int32Array(ch); for (let y = 0; y < ch; y++) rbOf[y] = Math.min(M.nr - 1, Math.floor(((y + 0.5) / ch) ** 2 * RMAX / M.dr));
    const px = (x0: number, y0: number, x: number, y: number, r: number, g: number, b: number) => { const o = ((y0 + y) * CW + x0 + x) * 4; d[o] = r; d[o + 1] = g; d[o + 2] = b; };
    su.scans.forEach((sc, row) => {
      const y0 = top + row * rh + 14, per = TAU / sc.rate;
      for (let x = 0; x < cw; x++) {
        let A = ((x + 0.5) / cw - 0.5) * TAU - sc.off; A = ((A % TAU) + TAU) % TAU; const col = Math.floor(A / DA) % M.na, base = col * M.nr;
        const age = (now - sc.age[col]) / per, f = age > 1 ? 0.25 : 0.45 + 0.55 * (1 - age);
        for (let y = 0; y < ch; y++) {
          const rb = rbOf[y], v = sc.map[base + rb], db = 10 * Math.log10(Math.max(1e-3, v));
          const b1 = Math.max(0, Math.min(1, (db - 1) / 24)) * f; px(0, y0, x, y, 10 + 150 * b1 * b1, 16 + 239 * b1, 22 + 120 * b1 * b1);
          let z = 0, nz = 0; for (let g = 3; g <= 10; g++) { if (rb - g >= 0) { z += sc.map[base + rb - g]; nz++; } if (rb + g < M.nr) { z += sc.map[base + rb + g]; nz++; } }
          const ratio = v / Math.max(0.5, z / Math.max(1, nz)), rdb = 10 * Math.log10(Math.max(1e-3, ratio)), over = ratio >= M.K && v >= M.floor;
          const b2 = Math.max(0, Math.min(1, rdb / 16)) * f;
          if (over) px(cw + gap, y0, x, y, 255, 150 + 60 * b2, 40); else px(cw + gap, y0, x, y, 8 + 50 * b2, 14 + 90 * b2, 24 + 120 * b2);
        }
      }
    });
    c.putImageData(pipeImg, 0, 0);
    const X = (k: number) => k <= 3 ? k * (cw + gap) : 3 * (cw + gap) + cw3 + gap, xOf = (ph: number) => (Radar.wrapPi(ph) / TAU + 0.5) * cw, yOf = (r: number) => Math.sqrt(Math.min(1, Math.max(0, r) / RMAX)) * ch;
    c.font = '11px ui-monospace, Consolas, monospace'; c.textBaseline = 'top';
    ['1 RAW RETURN · dB over noise', '2 FILTER · CFAR ratio, peaks', '3 TRACK · peaks across sweeps', '4 CORRELATE 3D · both scanners', '5 IDENTIFY · IFF · range · rate'].forEach((t, k) => { c.fillStyle = '#7fd4ee'; c.fillText(t, X(k), 2); if (k < K - 1) { c.fillStyle = '#3a6f84'; c.fillText('→', X(k + 1) - gap + 1, top + 4); } });
    su.scans.forEach((sc, row) => {
      const y0 = top + row * rh + 14, per = TAU / sc.rate, lbl = sc.tag + (sc.ax === 'y' ? ' bearing (nose mid)' : ' roll (up mid)');
      c.fillStyle = '#9fd0e4'; c.fillText(lbl, X(0) + 2, y0 - 13);
      for (let k = 0; k < K; k++) { if (k === 3) continue; c.strokeStyle = '#1b3a48'; c.strokeRect(X(k) + 0.5, y0 + 0.5, cw - 1, ch - 1); for (const r of [625, 2500, 5625]) { c.beginPath(); c.moveTo(X(k), y0 + yOf(r)); c.lineTo(X(k) + cw, y0 + yOf(r)); c.stroke(); } }
      // the sweep's place on 1 and 2
      for (const k of [0, 1]) { const sx = X(k) + xOf(sc.th); c.strokeStyle = 'rgba(120,230,255,0.75)'; c.beginPath(); c.moveTo(sx, y0); c.lineTo(sx, y0 + ch); c.stroke(); }
      // 2: this sweep's peaks
      for (const p of sc.plots) { if (now - p.t > per) continue; const x = X(1) + xOf(phiNow(su, p)), y = y0 + yOf(p.r); c.strokeStyle = '#ffffff'; c.beginPath(); c.arc(x, y, 4, 0, TAU); c.stroke(); }
      // 3: each contact's plots sweep after sweep, joined
      for (const ct of sc.cons) {
        const col = ct.hits >= 2 ? iffCol(ct, su.id) : '150,160,170', pts = ct.trail.map((q) => [X(2) + xOf(q.A + sc.off), y0 + yOf(q.r), q.t] as const);
        c.strokeStyle = `rgba(${col},0.7)`; c.beginPath(); pts.forEach(([x, y], i) => { if (i && Math.abs(x - pts[i - 1][0]) < cw / 2) c.lineTo(x, y); else c.moveTo(x, y); }); c.stroke();
        pts.forEach(([x, y, t], i) => { const a = Math.max(0.25, 1 - (now - t) / (per * 8)); c.fillStyle = `rgba(${col},${a})`; c.beginPath(); c.arc(x, y, i === pts.length - 1 ? 3 : 2, 0, TAU); if (ct.hits >= 2) c.fill(); else { c.strokeStyle = `rgba(${col},${a})`; c.stroke(); } });
        if (ct.hits >= 2) { const [x, y] = pts[pts.length - 1]; c.fillStyle = `rgb(${col})`; c.fillText(ct.n + ' ×' + ct.hits, x + 5, y - 5); }
      }
      // 4: the contacts held, named, and what's tracked
      const trk = su.trks.filter((t) => t.st === 'track').map((t) => ({ ph: Radar.angOf(sc.ax, t.b)[0], r: t.rng })), used: number[][] = [];
      for (const ct of shown(sc, now)) {
        const ph = phiNow(su, ct.p), x = X(4) + xOf(ph), y = y0 + yOf(ct.p.r), col = iffCol(ct, su.id), on = trk.some((t) => Math.abs(Radar.wrapPi(t.ph - ph)) < 4 * D2R && Math.abs(t.r - ct.p.r) < 200);
        c.fillStyle = `rgb(${col})`; c.beginPath(); c.arc(x, y, 3.5, 0, TAU); c.fill(); if (on) { c.strokeStyle = '#ff4030'; c.strokeRect(x - 6, y - 6, 12, 12); }
        const ign = su.id === 'hull' && ct.iff && ct.iff.c === 'civ';
        const fz = su.fus.find((q) => q.a === ct || q.b === ct), l1 = iffTxt(ct, su.id) + (fz ? ' → ' + fz.n : '') + (on ? '  TRK' : ign ? '  (let be)' : ''), l2 = `${(ct.p.r / 1000).toFixed(2)} km ${ct.vr >= 0 ? '+' : ''}${Math.round(ct.vr)} m/s` + (ct.p.id ? ` [${ct.p.id}]` : '');
        const lw = Math.max(c.measureText(l1).width, c.measureText(l2).width), tx = Math.min(x + 6, X(4) + cw - 6 - lw); let ty = y - 11;
        const hit = (t0: number) => used.some(([ux, uy, uw]) => tx < ux + uw && ux < tx + lw && Math.abs(uy - t0) < 24);
        for (let k2 = 1; hit(ty) && k2 < 12; k2++) { const dn = y - 11 + 24 * Math.ceil(k2 / 2) * (k2 % 2 ? 1 : -1); if (dn >= y0 && dn <= y0 + ch - 24) ty = dn; } // (not over another's label: the nearest free place above or below, inside its cell)
        used.push([tx, ty, lw]); if (ty !== y - 11) { c.strokeStyle = `rgba(${col},0.5)`; c.beginPath(); c.moveTo(x, y); c.lineTo(tx, ty + 6); c.stroke(); }
        c.fillStyle = `rgb(${col})`; c.fillText(l1, tx, ty); c.fillStyle = '#8fb3c4'; c.fillText(l2, tx, ty + 12);
      }
    });
    corr3d(c, su, now, X(3), top + 14, cw3, su.scans.length * rh - 16);
    return pipeCv;
  }
  // Stage 4: the two scanners' contacts in 3D, round her (her frame, turning slowly so it reads as 3D; range out as its square
  // root): each 'y' contact's arc (cyan: up and down its fan at its range and bearing), each 'z' contact's (magenta: fore and aft
  // along its fan, at its range and angle round her), and where a pair of them meet, the correlated point (F), its height off her
  // plane drawn down to it, and how far the arcs missed each other there
  function corr3d(c: CanvasRenderingContext2D, su: RSuite, now: number, x0: number, y0: number, w: number, h: number) {
    c.strokeStyle = '#1b3a48'; c.strokeRect(x0 + 0.5, y0 + 0.5, w - 1, h - 1);
    const cx = x0 + w / 2, cy = y0 + h * 0.55, R = Math.min(w, h) * 0.46, yaw = now * 0.25, tilt = 0.45, cyw = Math.cos(yaw), syw = Math.sin(yaw), ct = Math.cos(tilt), st = Math.sin(tilt);
    const pr = (p: THREE.Vector3) => { const L = p.length(), k = L > 0 ? Math.sqrt(Math.min(1, L / RMAX)) * R / L : 0, x = p.x * k, y = p.y * k, z = p.z * k, x1 = x * cyw - z * syw, z1 = x * syw + z * cyw; return [cx + x1, cy - (y * ct - z1 * st)]; };
    const line = (pts: THREE.Vector3[]) => { c.beginPath(); pts.forEach((p, i) => { const [x, y] = pr(p); if (i) c.lineTo(x, y); else c.moveTo(x, y); }); c.stroke(); };
    // her plane's range rings, and her (her nose a line)
    c.strokeStyle = 'rgba(40,100,125,0.6)'; for (const r of [625, 2500, 10000]) { const ring: THREE.Vector3[] = []; for (let i = 0; i <= 48; i++) { const a = i / 48 * TAU; ring.push(new T.Vector3(Math.sin(a) * r, 0, -Math.cos(a) * r)); } line(ring); }
    c.strokeStyle = '#40e0ff'; line([new T.Vector3(0, 0, 400), new T.Vector3(0, 0, -900)]); c.fillStyle = '#40e0ff'; const [nx, ny] = pr(new T.Vector3(0, 0, -900)); c.fillText('nose', nx + 3, ny - 5);
    const v = new T.Vector3();
    for (const sc of su.scans) {
      const col = sc.ax === 'y' ? 'rgba(90,220,255,0.55)' : 'rgba(230,110,255,0.55)';
      for (const ctc of sc.cons) {
        if (ctc.hits < 2 || now - ctc.t > TAU / sc.rate * 1.5) continue;
        const dt = now - ctc.t, phi = ctc.A + ctc.vA * dt + sc.off, r = ctc.r + ctc.vr * dt, pts: THREE.Vector3[] = [];
        for (let i = 0; i <= 16; i++) pts.push(Radar.arcAt(sc, phi, r, -sc.fan + 2 * sc.fan * i / 16, v).clone());
        c.strokeStyle = col; line(pts); const [ex, ey] = pr(pts[16]); c.fillStyle = col; c.fillText(ctc.n, ex + 2, ey - 5);
      }
    }
    const qn = su.Q.clone().invert(), toHer = (pl: THREE.Vector3) => pl.clone().sub(su.P).applyQuaternion(qn); // (the level's frame to hers as she is now)
    for (const f of su.fus) {
      const col = f.iff ? iffCol({ iff: f.iff } as RContact, su.id) : '255,200,90', [x, y] = pr(f.p), [bx, by] = pr(new T.Vector3(f.p.x, 0, f.p.z));
      // its trajectory: where it's been (solid, fading) and where its velocity takes it in the next 10 s (dashed)
      c.strokeStyle = `rgba(${col},0.75)`; line(f.hist.map((q) => toHer(q.p)));
      if (f.v.lengthSq() > 1) { const fut: THREE.Vector3[] = []; for (let i = 0; i <= 10; i++) fut.push(toHer(f.pl.clone().addScaledVector(f.v, i))); c.setLineDash([4, 3]); line(fut); c.setLineDash([]); }
      c.strokeStyle = `rgba(${col},0.5)`; c.setLineDash([2, 3]); c.beginPath(); c.moveTo(x, y); c.lineTo(bx, by); c.stroke(); c.setLineDash([]);
      c.fillStyle = `rgb(${col})`; c.beginPath(); c.arc(x, y, 4, 0, TAU); c.fill();
      c.fillText(`${f.n} ${f.a.n}+${f.b.n} ±${Math.round(f.res)} m${f.v.lengthSq() > 1 ? ' · ' + Math.round(f.v.length()) + ' m/s' : ''}`, x + 6, y - 6);
    }
    // the trackers' solutions: where each has had its target, and where it has it going (red)
    for (const tr of su.trks) {
      if (tr.st !== 'track' || !tr.est.p || !tr.hist) continue;
      c.strokeStyle = 'rgba(255,80,60,0.85)'; line(tr.hist.map((q) => toHer(q.p))); const fut: THREE.Vector3[] = []; for (let i = 0; i <= 10; i++) fut.push(toHer(tr.est.p.clone().addScaledVector(tr.est.v, i)));
      c.setLineDash([4, 3]); line(fut); c.setLineDash([]); const [tx, ty] = pr(toHer(tr.est.p)); c.strokeRect(tx - 5, ty - 5, 10, 10);
    }
    c.fillStyle = '#5f8fa4'; c.fillText(`${su.fus.length} correlated · cyan: A arcs · magenta: B arcs · dashed: the next 10 s`, x0 + 4, y0 + h - 14);
  }
  return { update, scope, pick };
})();
