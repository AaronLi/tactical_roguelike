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
  // a contact as its IFF answer has it: hostile red, a civilian grey-blue, its own side green, another name white, no answer amber
  // (as the ship looking (su) has it: a name she knows as hostile, or the squad's transponder to the mission's ship, is hostile;
  // her own side's (the squad's own, or a navy's to a navy) friendly; a civilian's; another name; no answer)
  const kind = (c: RContact, su?: RSuite) => { const f = c.iff; if (!f) return '?'; if (su && su.hostNames && su.hostNames.has(f.n)) return 'tgt'; if (f.c === 'squad') return !su || su.aff === 'squad' ? 'own' : su.id === 'hull' ? 'tgt' : 'named'; if (f.c === 'navy') return su && su.aff === 'navy' ? 'own' : 'named'; return f.c === 'civ' ? 'civ' : 'named'; };
  const iffCol = (c: RContact, su?: RSuite) => ({ '?': '255,200,90', civ: '140,170,190', tgt: '255,90,70', own: '110,240,140', named: '225,228,236' } as Record<string, string>)[kind(c, su)];
  const iffTxt = (c: RContact, su?: RSuite) => { const k0 = kind(c, su); return k0 === '?' ? c.n + ' ?' : c.n + ' ' + (k0 === 'tgt' ? (su && su.id === 'hull' ? 'HOSTILE ' : 'TGT ') : k0 === 'civ' ? 'CIV ' : c.iff!.c === 'navy' ? 'NAVY ' : '') + c.iff!.n; };
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
        const [px, py] = plotXY(su, ct.p, W, H), fresh = Math.max(0.35, 1 - (now - ct.t) * sc.rate / TAU), col = iffCol(ct, su);
        c.strokeStyle = `rgba(${col},${fresh})`; c.strokeRect(px - 4 * k, py - 4 * k, 8 * k, 8 * k); c.fillStyle = `rgba(${col},${fresh})`; c.fillText(ct.iff && ct.iff.c === 'civ' ? ct.n : iffTxt(ct, su), px + 6 * k, py - 6 * k);
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
      if (p) { const [x, y] = plotXY(su, p, W, H), ct = conOf(su, p); c.strokeStyle = '#ffffff'; c.beginPath(); c.arc(x, y, 9 * k, 0, TAU); c.stroke(); c.fillStyle = '#ffffff'; c.fillText(`${ct ? iffTxt(ct, su) + '  ' : ''}${(p.r / 1000).toFixed(2)} km  ${Math.round(p.db)} dB  click: track`, Math.min(x + 12 * k, W - 230 * k), y + 12 * k); }
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
    const M = Radar.MAP, K = 5, gap = 10, CW = Math.max(600, Math.min(1700, Math.floor(width))), cw = Math.floor((CW - gap * (K - 1)) / 7.2), cw3 = Math.floor(cw * 1.8), cw5 = Math.floor(cw * 1.4), ch = 108, top = 16, rh = ch + 16, tch = 78, trh = tch + 16, CH = top + su.scans.length * rh + su.trks.length * trh;
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
    ['1 RAW RETURN · dB over noise', '2 FILTER · CFAR ratio, peaks', '3 TRACK · peaks across sweeps', '4 CORRELATE 3D · both scanners', '5 ASSESS · hostile or not'].forEach((t, k) => { c.fillStyle = '#7fd4ee'; c.fillText(t, X(k), 2); if (k < K - 1) { c.fillStyle = '#3a6f84'; c.fillText('→', X(k + 1) - gap + 1, top + 4); } });
    su.scans.forEach((sc, row) => {
      const y0 = top + row * rh + 14, per = TAU / sc.rate, lbl = sc.tag + (sc.ax === 'y' ? ' bearing (nose mid)' : ' roll (up mid)');
      c.fillStyle = '#9fd0e4'; c.fillText(lbl, X(0) + 2, y0 - 13);
      for (let k = 0; k < K; k++) { if (k >= 3) continue; c.strokeStyle = '#1b3a48'; c.strokeRect(X(k) + 0.5, y0 + 0.5, cw - 1, ch - 1); for (const r of [625, 2500, 5625]) { c.beginPath(); c.moveTo(X(k), y0 + yOf(r)); c.lineTo(X(k) + cw, y0 + yOf(r)); c.stroke(); } }
      // the sweep's place on 1 and 2
      for (const k of [0, 1]) { const sx = X(k) + xOf(sc.th); c.strokeStyle = 'rgba(120,230,255,0.75)'; c.beginPath(); c.moveTo(sx, y0); c.lineTo(sx, y0 + ch); c.stroke(); }
      // 2: this sweep's peaks
      for (const p of sc.plots) { if (now - p.t > per) continue; const x = X(1) + xOf(phiNow(su, p)), y = y0 + yOf(p.r); c.strokeStyle = '#ffffff'; c.beginPath(); c.arc(x, y, 4, 0, TAU); c.stroke(); }
      // 3: each contact's plots sweep after sweep, joined
      for (const ct of sc.cons) {
        const col = ct.hits >= 2 ? iffCol(ct, su) : '150,160,170', pts = ct.trail.map((q) => [X(2) + xOf(q.A + sc.off), y0 + yOf(q.r), q.t] as const);
        c.strokeStyle = `rgba(${col},0.7)`; c.beginPath(); pts.forEach(([x, y], i) => { if (i && Math.abs(x - pts[i - 1][0]) < cw / 2) c.lineTo(x, y); else c.moveTo(x, y); }); c.stroke();
        pts.forEach(([x, y, t], i) => { const a = Math.max(0.25, 1 - (now - t) / (per * 8)); c.fillStyle = `rgba(${col},${a})`; c.beginPath(); c.arc(x, y, i === pts.length - 1 ? 3 : 2, 0, TAU); if (ct.hits >= 2) c.fill(); else { c.strokeStyle = `rgba(${col},${a})`; c.stroke(); } });
        if (ct.hits >= 2) { const [x, y] = pts[pts.length - 1]; c.fillStyle = `rgb(${col})`; c.fillText(ct.n + ' ×' + ct.hits, x + 5, y - 5); }
      }
    });
    // the trackers' rows: each its own pipeline
    su.trks.forEach((tr, i) => trackRow(c, su, tr, now, top + su.scans.length * rh + i * trh + 14, tch, X, cw, cw5));
    assessTable(c, su, X(4), top + 14, cw5, su.scans.length * rh - 16);
    corr3d(c, su, now, X(3), top + 14, cw3, CH - top - 16);
    return pipeCv;
  }
  // A tracker's row of the pipeline:
  //   1 RAW: tracking, the return round its last nutation circle (a ring: further out where it came back stronger, so the side the
  //     target's on bulges) and the power across its range gate (10 m bins; the gate's middle the line, its early and late
  //     halves either side); acquiring, the sweep's returns along the strip, the strongest marked
  //   2 DISCRIMINATE: the angle errors the demodulator found, a revolution each (in beam widths; the last one biggest), the range
  //     gate's error, and its signal over the noise
  //   3 TRACK: its error and its solution's quality over the last 8 s
  //   (4 is the 3D stage, where its solution joins the track it's on)
  //   5 IDENTIFY: the track it's on, what that track answers, its range, closing speed and quality
  function trackRow(c: CanvasRenderingContext2D, su: RSuite, tr: RSuite['trks'][0], now: number, y0: number, h: number, X: (k: number) => number, cw: number, cw5: number) {
    const dg = tr.dg, nm = `TRK ${tr.side > 0 ? 'STBD' : 'PORT'} · ${tr.st === 'track' ? 'LOCK' : tr.st === 'acq' ? 'SWEEP' : tr.st === 'slew' ? 'SLEW' : 'IDLE'}`;
    c.fillStyle = tr.st === 'track' ? '#ff8070' : tr.st === 'idle' ? '#6f8f9f' : '#ffc060'; c.fillText(nm, X(0) + 2, y0 - 13);
    for (const k of [0, 1, 2, 4]) { c.strokeStyle = '#1b3a48'; c.strokeRect(X(k) + 0.5, y0 + 0.5, (k === 4 ? cw5 : cw) - 1, h - 1); }
    if (!dg || tr.st === 'idle') return;
    if (tr.st === 'acq' || tr.st === 'slew') { // (the sweep along the strip)
      const sw = dg.sweep, fan = Radar.SCAN.fan; c.strokeStyle = '#ffc060'; c.beginPath();
      sw.forEach((q, i) => { const x = X(0) + (q.e / fan * 0.5 + 0.5) * cw, y = y0 + h - 4 - Math.max(0, Math.min(1, q.db / 60)) * (h - 10); if (i) c.lineTo(x, y); else c.moveTo(x, y); }); c.stroke();
      if (tr.best.db > -99) { const b = sw.reduce((a, q) => (q.db > a.db ? q : a), sw[0] || { e: 0, db: 0 }); const x = X(0) + (b.e / fan * 0.5 + 0.5) * cw; c.strokeStyle = '#ffffff'; c.beginPath(); c.moveTo(x, y0); c.lineTo(x, y0 + h); c.stroke(); }
      c.fillStyle = '#ffc060'; c.fillText('sweeping the strip: return along it', X(0) + 4, y0 + 3);
      return;
    }
    // 1: the nutation ring and the range gate
    const rcx = X(0) + h / 2 + 4, rcy = y0 + h / 2, r0 = h * 0.22, mx = Math.max(1e-6, ...Array.from(dg.ring)), mn = Math.min(...Array.from(dg.ring));
    c.strokeStyle = '#1f4a5c'; c.beginPath(); c.arc(rcx, rcy, r0, 0, TAU); c.stroke();
    c.strokeStyle = '#ff8070'; c.beginPath(); for (let i = 0; i <= 32; i++) { const a = (i % 32 + 0.5) / 32 * TAU, k = (dg.ring[i % 32] - mn) / Math.max(1e-6, mx - mn), r = r0 + k * h * 0.22; const x = rcx + Math.cos(a) * r, y = rcy - Math.sin(a) * r; if (i) c.lineTo(x, y); else c.moveTo(x, y); } c.stroke();
    const gx = X(0) + h + 10, gw = cw - h - 14, GT = dg.gate, gmx = Math.max(...Array.from(GT));
    for (let j = 0; j < GT.length; j++) { const v = 10 * Math.log10(Math.max(1, GT[j])) / Math.max(1, 10 * Math.log10(gmx)), bh = v * (h - 14), x = gx + j / GT.length * gw; c.fillStyle = Math.abs(j - 20) <= 2 ? '#ff8070' : '#3d7f96'; c.fillRect(x, y0 + h - 4 - bh, gw / GT.length - 1, bh); }
    c.strokeStyle = '#ffffff'; c.beginPath(); c.moveTo(gx + 20.5 / GT.length * gw, y0 + 2); c.lineTo(gx + 20.5 / GT.length * gw, y0 + h - 2); c.stroke();
    c.fillStyle = '#8fb3c4'; c.fillText('conical scan', rcx - r0 - 2, y0 + 2); c.fillText('range gate ±200 m', gx, y0 + 2);
    // 2: the angle errors and the range error
    const ex = X(1) + h / 2 + 4, ey = y0 + h / 2, es = h * 0.4;
    c.strokeStyle = '#1f4a5c'; c.strokeRect(ex - es, ey - es, 2 * es, 2 * es); c.beginPath(); c.moveTo(ex - es, ey); c.lineTo(ex + es, ey); c.moveTo(ex, ey - es); c.lineTo(ex, ey + es); c.stroke();
    dg.errs.forEach((e, i) => { const a = (i + 1) / dg.errs.length; c.fillStyle = `rgba(255,128,112,${a})`; c.beginPath(); c.arc(ex + Math.max(-1, Math.min(1, e[0] * 2)) * es, ey - Math.max(-1, Math.min(1, e[1] * 2)) * es, i === dg.errs.length - 1 ? 3 : 1.6, 0, TAU); c.fill(); });
    c.fillStyle = '#cfe8f5'; const tx = X(1) + h + 10;
    c.fillText(`angle err ${(tr.err / D2R).toFixed(2)}°`, tx, y0 + 6); c.fillText(`(±½ beam: box)`, tx, y0 + 20); c.fillText(`range err ${dg.rerr >= 0 ? '+' : ''}${dg.rerr.toFixed(1)} m`, tx, y0 + 36); c.fillText(`S/N ${tr.db.toFixed(0)} dB`, tx, y0 + 52);
    // 3: error and quality over time
    const se = dg.series; if (se.length > 1) {
      const t0 = now - 8, xs = (t: number) => X(2) + (t - t0) / 8 * cw;
      c.strokeStyle = '#ffb060'; c.beginPath(); se.forEach((q, i) => { const y = y0 + h - 4 - Math.min(1, q.err / D2R / 1.5) * (h - 10); if (i) c.lineTo(xs(q.t), y); else c.moveTo(xs(q.t), y); }); c.stroke();
      c.strokeStyle = '#70f090'; c.beginPath(); se.forEach((q, i) => { const y = y0 + h - 4 - q.q * (h - 10); if (i) c.lineTo(xs(q.t), y); else c.moveTo(xs(q.t), y); }); c.stroke();
      c.fillStyle = '#ffb060'; c.fillText('error (to 1.5°)', X(2) + 4, y0 + 3); c.fillStyle = '#70f090'; c.fillText('solution quality', X(2) + 4, y0 + 16);
    }
    // 5: what it's on
    const f = su.fus.find((q) => q.trk === tr), los = tr.est.p ? tr.est.p.clone().sub(su.P).normalize() : null, close = los ? -tr.est.v.dot(los) : 0;
    const iff = f && (f.iff || (f.a && f.a.iff) || (f.b && f.b.iff)), lab = f ? `on ${f.n}${f.a || f.b ? ' (' + [f.a && f.a.n, f.b && f.b.n].filter(Boolean).join('+') + ')' : ' (its own)'}` : 'on a track of its own';
    c.fillStyle = '#ff8070'; c.fillText(lab, X(4) + 4, y0 + 6);
    c.fillStyle = iff ? `rgb(${iffCol({ iff } as RContact, su)})` : '#ffc860'; c.fillText(iff ? (iff.c === 'civ' ? 'CIV ' : '') + iff.n : 'no IFF answer', X(4) + 4, y0 + 20);
    c.fillStyle = '#cfe8f5'; c.fillText(`${(tr.rng / 1000).toFixed(2)} km · closing ${close >= 0 ? '+' : ''}${Math.round(close)} m/s`, X(4) + 4, y0 + 36); c.fillText(`solution ${Math.round(tr.est.q * 100)}%${tr.tgt ? ' [' + tr.tgt + ']' : ''}`, X(4) + 4, y0 + 52);
  }
  // Stage 5: hostile or not (js/radar.ts assess): every track she holds, worst first: what it is to her, its range, how fast it's
  // closing, where its course passes her, the score (a bar, the line at 0.6) and the confirmation's progress (the bar under it,
  // full at 3 s), and why
  const CLS: Record<string, string> = { HOSTILE: '#ff4a3a', SUSPECT: '#ffa040', WATCH: '#ffe070', NEUTRAL: '#a8b8c4', CIV: '#7f9fb0', FRIENDLY: '#70f090' };
  function assessTable(c: CanvasRenderingContext2D, su: RSuite, x0: number, y0: number, w: number, h: number) {
    c.strokeStyle = '#1b3a48'; c.strokeRect(x0 + 0.5, y0 + 0.5, w - 1, h - 1);
    const rowH = 28, n = Math.min(su.ass.length, Math.floor((h - 4) / rowH)), tracked = new Set(su.trks.filter((t) => t.st === 'track').map((t) => su.fus.find((f) => f.trk === t)).filter(Boolean));
    for (let i = 0; i < n; i++) {
      const a = su.ass[i], y = y0 + 3 + i * rowH, col = CLS[a.cls];
      const nm = a.iff ? (a.iff.c === 'civ' ? 'CIV ' : '') + a.iff.n : 'no IFF';
      c.fillStyle = col; c.fillText(`${a.n} ${a.cls}`, x0 + 4, y); c.fillStyle = '#cfe8f5'; c.fillText(nm, x0 + 4 + c.measureText(`${a.n} ${a.cls}  `).width, y);
      if (a.f && tracked.has(a.f)) { c.fillStyle = '#ff6050'; c.fillText('TRK', x0 + w - 28, y); }
      const bw = 70, bx = x0 + w - bw - 34; c.fillStyle = '#16303c'; c.fillRect(bx, y + 1, bw, 6); c.fillStyle = col; c.fillRect(bx, y + 1, bw * a.score, 6); c.fillStyle = '#ffffff'; c.fillRect(bx + bw * 0.6, y, 1, 8);
      c.fillStyle = '#16303c'; c.fillRect(bx, y + 9, bw, 3); c.fillStyle = '#ff8070'; c.fillRect(bx, y + 9, bw * Math.min(1, a.hold / 3), 3);
      c.fillStyle = '#8fb3c4'; c.fillText(`${(a.r / 1000).toFixed(2)} km ${a.vc >= 0 ? '+' : ''}${Math.round(a.vc)} m/s · ${a.why}`.slice(0, Math.floor(w / 6.4)), x0 + 4, y + 13);
    }
    if (!su.ass.length) { c.fillStyle = '#5f8fa4'; c.fillText('nothing held', x0 + 4, y0 + 4); }
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
      const col = f.iff ? iffCol({ iff: f.iff } as RContact, su) : '255,200,90', [x, y] = pr(f.p), [bx, by] = pr(new T.Vector3(f.p.x, 0, f.p.z));
      // its trajectory: where it's been (solid, fading) and where its velocity takes it in the next 10 s (dashed)
      c.strokeStyle = `rgba(${col},0.75)`; line(f.hist.map((q) => toHer(q.p)));
      if (f.v.lengthSq() > 1) { const fut: THREE.Vector3[] = []; for (let i = 0; i <= 10; i++) fut.push(toHer(f.pl.clone().addScaledVector(f.v, i))); c.setLineDash([4, 3]); line(fut); c.setLineDash([]); }
      c.strokeStyle = `rgba(${col},0.5)`; c.setLineDash([2, 3]); c.beginPath(); c.moveTo(x, y); c.lineTo(bx, by); c.stroke(); c.setLineDash([]);
      c.fillStyle = `rgb(${col})`; c.beginPath(); c.arc(x, y, 4, 0, TAU); c.fill();
      c.fillText(`${f.n} ${[f.a && f.a.n, f.b && f.b.n, f.trk && 'TRK ' + (f.trk.side > 0 ? 'S' : 'P')].filter(Boolean).join('+')} ±${Math.round(f.res)} m${f.v.lengthSq() > 1 ? ' · ' + Math.round(f.v.length()) + ' m/s' : ''}`, x + 6, y - 6);
    }
    // the trackers' solutions: where each has had its target, and where it has it going (red)
    for (const tr of su.trks) {
      if (tr.st !== 'track' || !tr.est.p || !tr.hist) continue;
      c.strokeStyle = 'rgba(255,80,60,0.85)'; line(tr.hist.map((q) => toHer(q.p))); const fut: THREE.Vector3[] = []; for (let i = 0; i <= 10; i++) fut.push(toHer(tr.est.p.clone().addScaledVector(tr.est.v, i)));
      c.setLineDash([4, 3]); line(fut); c.setLineDash([]); const [tx, ty] = pr(toHer(tr.est.p)); c.strokeRect(tx - 5, ty - 5, 10, 10);
    }
    c.fillStyle = '#5f8fa4'; c.fillText(`${su.fus.length} correlated · cyan: A arcs · magenta: B arcs · dashed: the next 10 s`, x0 + 4, y0 + h - 14);
  }
  // ---------------------------------------------------------------- the sensor station's hologram
  // A hologram over the console in place of its screen (a sphere's worth of space, the shell itself not drawn): her own ship at
  // its middle (a cone, her nose its point, a fin on her back), what her
  // radars hold round her where it is (its way from her, true; its distance as its square root, 10 km at the shell): a 3D track
  // solid and coloured as her assessment has it (hostile red, suspect orange, watch yellow, neutral grey, civilian grey-blue,
  // friendly green), a contact only one scanner holds faint (it's somewhere on its fan: drawn at the fan's middle); her
  // scanners' fans sweeping out from the middle (cyan the bearing scanner's, magenta the roll scanner's), and each tracker's
  // beam a line from the middle along its boresight (amber slewing or sweeping, red tracking). The operator turns it (rot) and
  // points at a track with the middle of their view (holoPick).
  type HoloItem = { pos: THREE.Vector3; plot: RPlot | null; label: string; col: string };
  let holoG: { focus: boolean | null; arcs: THREE.Line[]; strips: THREE.Line[]; ends: THREE.Mesh[]; g: THREE.Group; inner: THREE.Group; fans: THREE.Mesh[]; beams: THREE.Line[]; dots: THREE.Mesh[]; sel: THREE.Mesh; label: THREE.Sprite; lcv: HTMLCanvasElement; ltex: THREE.CanvasTexture; ltext: string; items: HoloItem[]; R: number; hint: HTMLElement } | null = null;
  const HCOL: Record<string, number> = { HOSTILE: 0xff4a3a, SUSPECT: 0xffa040, WATCH: 0xffe070, NEUTRAL: 0xa8b8c4, CIV: 0x7f9fb0, FRIENDLY: 0x70f090 };
  function holoMake(parent: THREE.Object3D, R: number) {
    const g = new T.Group(), inner = new T.Group(); g.add(inner); parent.add(g);
    const glow = (c: number, o: number) => new T.MeshBasicMaterial({ color: c, transparent: true, opacity: o, depthWrite: false, blending: T.AdditiveBlending, side: T.DoubleSide });
    for (const f of [0.25, 0.5]) { const ring = new T.Mesh(new T.RingGeometry(R * f - 0.002, R * f + 0.002, 48), glow(0x40c8ff, 0.25)); ring.rotation.x = -Math.PI / 2; inner.add(ring); } // (her plane: 625 m and 2.5 km)
    // (her: a cone, her nose its point, and a fin on her back: which way's up on her, so how the sphere's turned reads off her)
    const ship = new T.Mesh(new T.ConeGeometry(R * 0.045, R * 0.16, 12), glow(0x60e0ff, 0.9)); ship.rotation.x = -Math.PI / 2; inner.add(ship);
    const fin = new T.Mesh(new T.BufferGeometry().setFromPoints([new T.Vector3(0, 0, R * 0.07), new T.Vector3(0, R * 0.07, R * 0.07), new T.Vector3(0, 0, -R * 0.02)]), glow(0x60e0ff, 0.8)); inner.add(fin);
    const fans = [0, 1].map((i) => { const m = new T.Mesh(fanGeo(), glow(i ? 0xe070ff : 0x50d8ff, 0.16)); inner.add(m); return m; });
    const beams = [0, 1].map(() => { const l = new T.Line(new T.BufferGeometry().setFromPoints([new T.Vector3(), new T.Vector3(0, 0, -1)]), new T.LineBasicMaterial({ color: 0xff4030, transparent: true, opacity: 0.9, depthWrite: false })); inner.add(l); return l; });
    const strips = [0, 1].map(() => { const l = new T.Line(new T.BufferGeometry().setAttribute('position', new T.BufferAttribute(new Float32Array(25 * 3), 3)), new T.LineDashedMaterial({ color: 0xffb040, dashSize: R * 0.03, gapSize: R * 0.02, transparent: true, opacity: 0.8, depthWrite: false })); inner.add(l); return l; });
    const ends = [0, 1].map(() => { const m = new T.Mesh(new T.RingGeometry(R * 0.02, R * 0.03, 16), glow(0xff4030, 0.9)); inner.add(m); return m; }); // (where a tracker's range gate is along its beam)
    const sel = new T.Mesh(new T.RingGeometry(R * 0.045, R * 0.055, 24), glow(0xffffff, 0.9)); inner.add(sel);
    const lcv = document.createElement('canvas'); lcv.width = 512; lcv.height = 96; const ltex = new T.CanvasTexture(lcv);
    const label = new T.Sprite(new T.SpriteMaterial({ map: ltex, transparent: true, depthWrite: false, depthTest: false })); label.scale.set(R * 1.7, R * 0.32, 1); label.renderOrder = 20; inner.add(label);
    const hint = document.createElement('div'); Object.assign(hint.style, { position: 'fixed', left: '50%', bottom: '8%', transform: 'translateX(-50%)', font: '12px ui-monospace, Consolas, monospace', color: '#9fe4ff', textShadow: '0 0 4px #000', pointerEvents: 'none', display: 'none', zIndex: '35' }); hint.textContent = 'hold right mouse: turn the sphere · aim at a track, left click: track it · tap right: drop the trackers'; document.body.appendChild(hint);
    holoG = { focus: null, arcs: [], strips, ends, g, inner, fans, beams, dots: [], sel, label, lcv, ltex, ltext: '', items: [], R, hint };
  }
  // the hologram as her radars have it now: parent her drawing's group, c its middle there, rot how the operator's turned it,
  // seated whether its operator's at it (the hint), pick the item they're pointing at
  function holo(parent: THREE.Object3D | null, su: RSuite | null, c: THREE.Vector3, R: number, rot: THREE.Quaternion, now: number, seated: boolean, pick: HoloItem | null, focus = false) {
    if (!parent || !su) { if (holoG) { holoG.g.removeFromParent(); holoG.hint.style.display = 'none'; } return; }
    if (!holoG || holoG.R !== R) { if (holoG) { holoG.g.removeFromParent(); holoG.hint.remove(); } holoMake(parent, R); }
    const H = holoG!; if (H.g.parent !== parent) parent.add(H.g);
    H.g.position.copy(c); H.inner.quaternion.copy(rot); H.hint.style.display = seated ? '' : 'none';
    // (focused: all of it on layer 6 alone, drawn sharp over the blurred frame (js/render.ts focusBlur); else on the scene's own)
    if (H.focus !== focus) { H.focus = focus; H.hint.textContent = (focus ? 'hold G: back to the room · ' : 'hold G: focus on it · ') + 'hold right mouse: turn it · aim at a track, left click: track it · tap right: drop the trackers'; }
    H.g.traverse((o) => o.layers.set(focus ? 6 : 0));
    const at = (p: THREE.Vector3, out = new T.Vector3()) => { const L = p.length(); return out.copy(p).multiplyScalar(L > 0 ? Math.sqrt(Math.min(1, L / RMAX)) * R / L : 0); };
    // the fans: as wide as the shell, sweeping (none of a fan where her hull hides it)
    su.scans.forEach((sc, i) => { if (!H.fans[i]) return; fanFill(H.fans[i], { ...sc, R0: R, at: new T.Vector3() } as RScan, sc.th); });
    const camQ = new T.Quaternion(); H.inner.updateWorldMatrix(true, false); H.inner.getWorldQuaternion(camQ); const faceCam = camQ.invert().multiply(G_cam.quaternion);
    su.trks.forEach((tr, i) => {
      const l = H.beams[i], st = H.strips[i], en = H.ends[i]; if (!l) return;
      const on = tr.st !== 'idle', len = on && tr.rng > 0 ? Math.sqrt(Math.min(1, tr.rng / RMAX)) * R : R;
      // (its beam: along its axis as it is this instant, the conical scan's circling and all, out to its range gate)
      l.visible = on; l.quaternion.setFromUnitVectors(Z, tr.st === 'track' ? tr.a : tr.b); l.scale.setScalar(len); (l.material as THREE.LineBasicMaterial).color.setHex(tr.st === 'track' ? 0xff4030 : 0xffb040);
      en.visible = on && tr.rng > 0; en.position.copy(tr.st === 'track' ? tr.a : tr.b).multiplyScalar(len); en.quaternion.copy(faceCam); (en.material as THREE.MeshBasicMaterial).color.setHex(tr.st === 'track' ? 0xff4030 : 0xffb040);
      // (sweeping: the strip it's searching along, the arc its cue's on)
      st.visible = (tr.st === 'slew' || tr.st === 'acq') && !!tr.cue;
      if (st.visible) { const c = tr.cue!, sc = su.scans[c.k], pa = st.geometry.attributes.position as THREE.BufferAttribute, qn = su.Q.clone().invert(), v = new T.Vector3();
        for (let j = 0; j <= 24; j++) { Radar.dirOf(c.ax, c.phi, -sc.fan + 2 * sc.fan * j / 24, v).applyQuaternion(c.q).multiplyScalar(c.r).add(c.o).sub(su.P).applyQuaternion(qn); at(v, v); pa.setXYZ(j, v.x, v.y, v.z); }
        pa.needsUpdate = true; st.computeLineDistances(); }
    });
    // the tracks: each 3D track at its place; each contact no 3D track has, faint at its fan's middle
    const items: HoloItem[] = []; for (const l of H.arcs) l.visible = false;
    for (const a of su.ass) {
      let pos: THREE.Vector3 | null = null;
      let arc: THREE.Vector3[] | null = null;
      if (a.f) pos = a.f.p.clone(); else if (a.c && a.plot) {
        // (one scanner's: it's somewhere on its arc, the fan at its range (where her hull doesn't hide it): the arc drawn, its middle the point to aim at)
        const sc = su.scans[a.plot.k], ph = phiNow(su, a.plot); pos = Radar.dirOf(sc.ax, ph, 0).multiplyScalar(a.plot.r).add(sc.at); arc = [];
        for (let j = 0; j <= 16; j++) { const e = -sc.fan + 2 * sc.fan * j / 16, d = Radar.dirOf(sc.ax, ph, e); if (d.dot(sc.n) < -sc.mask) continue; arc.push(at(d.multiplyScalar(a.plot.r).add(sc.at))); }
      }
      if (!pos) continue;
      if (arc && arc.length > 1) { const k = H.arcs.findIndex((q) => !q.visible); const l = k >= 0 ? H.arcs[k] : (() => { const n = new T.Line(new T.BufferGeometry().setAttribute('position', new T.BufferAttribute(new Float32Array(17 * 3), 3)), new T.LineBasicMaterial({ transparent: true, opacity: 0.55, depthWrite: false, blending: T.AdditiveBlending })); H.inner.add(n); H.arcs.push(n); return n; })();
        const pa = l.geometry.attributes.position as THREE.BufferAttribute; arc.forEach((q, j) => pa.setXYZ(j, q.x, q.y, q.z)); pa.needsUpdate = true; l.geometry.setDrawRange(0, arc.length); l.visible = true; (l.material as THREE.LineBasicMaterial).color.setHex(HCOL[a.cls] || 0xffffff); }
      const nm = a.iff ? (a.iff.c === 'civ' ? 'CIV ' : a.iff.c === 'navy' ? 'NAVY ' : '') + a.iff.n : 'no IFF';
      items.push({ pos: at(pos), plot: a.plot, label: `${a.n} ${a.cls} · ${nm} · ${(a.r / 1000).toFixed(2)} km ${a.vc >= 0 ? '+' : ''}${Math.round(a.vc)} m/s`, col: '#' + (HCOL[a.cls] || 0xffffff).toString(16).padStart(6, '0') });
      const m = H.dots[items.length - 1] || (() => { const d = new T.Mesh(new T.SphereGeometry(R * 0.032, 10, 8), new T.MeshBasicMaterial({ color: 0xffffff, transparent: true, depthWrite: false, blending: T.AdditiveBlending })); H.inner.add(d); H.dots.push(d); return d; })();
      m.visible = true; m.position.copy(items[items.length - 1].pos); (m.material as THREE.MeshBasicMaterial).color.setHex(HCOL[a.cls] || 0xffffff); (m.material as THREE.MeshBasicMaterial).opacity = a.f ? 0.95 : 0.4; m.scale.setScalar(a.f ? 1 : 0.7);
    }
    for (let i = items.length; i < H.dots.length; i++) H.dots[i].visible = false;
    H.items = items;
    // the one pointed at: ringed (facing the viewer), and named
    const p = pick && items.find((q) => q.plot === pick.plot && q.label.split(' ')[0] === pick.label.split(' ')[0]);
    H.sel.visible = H.label.visible = !!p;
    if (p) {
      H.sel.position.copy(p.pos); const camQ = new T.Quaternion(); (parent as any).updateWorldMatrix?.(true, false); H.inner.getWorldQuaternion(camQ); H.sel.quaternion.copy(camQ.invert().multiply(G_cam.quaternion)); H.sel.scale.setScalar(1 + 0.15 * Math.sin(now * 8));
      H.label.position.copy(p.pos).add(new T.Vector3(0, R * 0.12, 0).applyQuaternion(rot.clone().invert()));
      if (H.ltext !== p.label + p.col) { H.ltext = p.label + p.col; const x = H.lcv.getContext('2d')!; x.clearRect(0, 0, 512, 96); x.font = '600 30px ui-monospace, Consolas, monospace'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.lineWidth = 6; x.strokeStyle = 'rgba(0,0,0,0.8)'; x.strokeText(p.label, 256, 48, 500); x.fillStyle = p.col; x.fillText(p.label, 256, 48, 500); H.ltex.needsUpdate = true; }
    }
  }
  const G_cam = { quaternion: new T.Quaternion() };
  // what the operator's pointing at: the item nearest the ray from the middle of their view (within 4 degrees of it)
  function holoPick(ray: THREE.Ray, cam: THREE.Camera): HoloItem | null {
    if (!holoG || !holoG.g.parent) return null; G_cam.quaternion.copy(cam.quaternion);
    let best: HoloItem | null = null, bd = 4 * D2R; const w = new T.Vector3();
    holoG.inner.updateWorldMatrix(true, false);
    for (const it of holoG.items) { w.copy(it.pos).applyMatrix4(holoG.inner.matrixWorld).sub(ray.origin); const a = w.angleTo(ray.direction); if (a < bd) { bd = a; best = it; } }
    return best;
  }
  return { update, scope, pick, holo, holoPick };
})();
