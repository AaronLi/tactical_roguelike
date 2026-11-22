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
import { Radar, RSuite, RTarget, RPlot, RScan, RContact, RFused, RAssess } from './radar.js';

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
      su.scans.forEach((sc, k) => { D.fans[k].piv.position.copy(sc.at); D.fans[k].piv.visible = sc.mode !== 'off'; D.fans[k].ms.forEach((m: THREE.Mesh, i: number) => fanFill(m, sc, sc.th - i * 4 * D2R)); });
      su.trks.forEach((tr, k) => {
        const o = D.trks[k], len = tr.st === 'idle' ? 0 : tr.hand ? tr.hand.p.distanceTo(su.P) : tr.rng; // (acquiring: its range gate where it's looking)
        o.cn.visible = len > 0; o.rg.visible = tr.st === 'track';
        const hue = tr.st === 'track' ? D.P.track : tr.st === 'idle' ? D.P.idle : D.P.acq;
        (o.cn.material as THREE.MeshBasicMaterial).color.setHex(hue); (o.cn.material as THREE.MeshBasicMaterial).opacity = tr.st === 'track' ? 0.16 : 0.1;
        o.gl.visible = tr.st !== 'idle'; o.gl.position.copy(tr.at); (o.gl.material as THREE.SpriteMaterial).color.setHex(hue); o.gl.scale.setScalar(tr.st === 'track' ? 0.03 + 0.012 * Math.sin(now * 12) : 0.025);
        o.cn.position.copy(tr.at); o.cn.quaternion.setFromUnitVectors(Z, tr.a); o.cn.scale.setScalar(Math.max(1, len));
        o.bl.position.copy(tr.at); o.bl.quaternion.setFromUnitVectors(Z, tr.b); o.bl.scale.setScalar(Math.max(60, len));
        if (tr.st === 'track') { o.rg.position.copy(tr.b).multiplyScalar(len).add(tr.at); o.rg.quaternion.setFromUnitVectors(new T.Vector3(0, 0, 1), tr.b); o.rg.scale.setScalar(len * Math.tan(tr.kind === 'conical' ? Radar.TRK.sq : Radar.TRK.bw * 0.5)); }
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
  const RMAX = 50000; // (as far as a scanner's map reaches: js/radar.ts MAP.Rmax)
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
        const r = (d / L.R) ** 2 * RMAX; idx.push(y * W + x); an.push(Math.atan2(dx, -dy)); rb.push(Math.min(Radar.MAP.nr - 1, Math.floor(Radar.binOf(r)))); sc.push(s);
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
      c.strokeStyle = 'rgba(40,110,140,0.55)'; for (const r of [2500, 10000, 25000, 50000]) { c.beginPath(); c.arc(cx, cy, rOut(r, L.R), 0, TAU); c.stroke(); }
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
      c.fillStyle = '#3d7a90'; c.fillText('50', cx + 2 * k, cy - L.R + 6 * k); c.fillText('10', cx + 2 * k, cy - rOut(10000, L.R) + 6 * k); c.fillText('2.5', cx + 2 * k, cy - rOut(2500, L.R) + 6 * k);
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
    const M = Radar.MAP, K = 5, gap = 10, CW = Math.max(600, Math.min(1700, Math.floor(width))), cw = Math.floor((CW - gap * (K - 1)) / 7.2), cw3 = Math.floor(cw * 1.8), cw5 = Math.floor(cw * 1.4), ch = 108, top = 16, rh = ch + 16, tch = 78, trh = tch + 16, och = 90, orh = su.opt && su.sched ? och + 16 : 0, CH = top + su.scans.length * rh + su.trks.length * trh + orh; // (och: the camera's row, when she's one)
    if (!pipeCv) { pipeCv = document.createElement('canvas'); pipeCv.style.display = 'block'; pipeCv.style.marginTop = '4px'; }
    if (pipeCv.width !== CW || pipeCv.height !== CH) { pipeCv.width = CW; pipeCv.height = CH; pipeImg = null; pipeAt = -1; }
    if (now - pipeAt < 0.1 && pipeFor === su.id) return pipeCv;
    pipeAt = now; pipeFor = su.id;
    const c = pipeCv.getContext('2d')!; if (!pipeImg) pipeImg = c.createImageData(CW, CH);
    const d = pipeImg.data; for (let q = 0; q < d.length; q += 4) { d[q] = 4; d[q + 1] = 9; d[q + 2] = 13; d[q + 3] = 230; }
    const DA = TAU / M.na, rbOf = new Int32Array(ch); for (let y = 0; y < ch; y++) rbOf[y] = Math.min(M.nr - 1, Math.floor(Radar.binOf(((y + 0.5) / ch) ** 2 * RMAX))); // (the map's own bins: 25 m to 10 km, 100 m past)
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
    if (orh) camRow(c, su, now, top + su.scans.length * rh + su.trks.length * trh + 14, och, X, cw, cw5);
    assessTable(c, su, X(4), top + 14, cw5, su.scans.length * rh - 16);
    corr3d(c, su, now, X(3), top + 14, cw3, CH - top - 16);
    return pipeCv;
  }
  // A tracker's row of the pipeline:
  //   1 RAW: tracking, its monopulse channels step by step (the sum, and the two differences over it: the target's offset each way)
  //     and the power across its range gate (10 m bins; the gate's middle the line, its early and late
  //     halves either side); acquiring, the sweep's returns along the strip, the strongest marked
  //   2 DISCRIMINATE: the angle errors its readings found, one a reading (50 ms of pulses) (in beam widths; the last one biggest), the range
  //     gate's error, and its signal over the noise
  //   3 TRACK: its error and its solution's quality over the last 8 s
  //   (4 is the 3D stage, where its solution joins the track it's on)
  //   5 IDENTIFY: the track it's on, what that track answers, its range, closing speed and quality
  function trackRow(c: CanvasRenderingContext2D, su: RSuite, tr: RSuite['trks'][0], now: number, y0: number, h: number, X: (k: number) => number, cw: number, cw5: number) {
    const dg = tr.dg, nm = `TRK ${tr.side > 0 ? 'STBD' : 'PORT'} · ${tr.kind === 'conical' ? 'CONICAL SCAN' : 'MONOPULSE'} · ${tr.st === 'track' ? 'LOCK' : tr.st === 'acq' ? 'SWEEP' : tr.st === 'slew' ? 'SLEW' : 'IDLE'}`;
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
    // 1: the monopulse channels, step by step (the last 48): the sum (its signal, white, top half: how strong), and the two differences
    // over it (left less right cyan, top less bottom magenta: the target's offset that way, in beam widths; the band is ±½ beam, where
    // they're in proportion); and the range gate
    const mo = dg.mono || [], mw = h + 4, mx0 = X(0) + 4, myc = y0 + h * 0.68, mk = h * 0.55;
    if (tr.kind === 'conical') { // (conical scan: the return round its last nutation circle: further out where it came back stronger, so the side the target's on bulges)
      const rcx = X(0) + h / 2 + 4, rcy = y0 + h / 2 + 4, r0 = h * 0.2, mx = Math.max(1e-6, ...Array.from(dg.ring)), mn = Math.min(...Array.from(dg.ring));
      c.strokeStyle = '#1f4a5c'; c.beginPath(); c.arc(rcx, rcy, r0, 0, TAU); c.stroke();
      c.strokeStyle = '#ff8070'; c.beginPath(); for (let i = 0; i <= 32; i++) { const a = (i % 32 + 0.5) / 32 * TAU, k = (dg.ring[i % 32] - mn) / Math.max(1e-6, mx - mn), r = r0 + k * h * 0.2; const x = rcx + Math.cos(a) * r, y = rcy - Math.sin(a) * r; if (i) c.lineTo(x, y); else c.moveTo(x, y); } c.stroke();
    } else {
    c.strokeStyle = '#1f4a5c'; c.strokeRect(mx0 + 0.5, y0 + 14.5, mw, h - 18); c.fillStyle = 'rgba(60,120,150,0.18)'; c.fillRect(mx0, myc - 0.5 * mk * 0.5, mw, 0.5 * mk);
    c.strokeStyle = '#1f4a5c'; c.beginPath(); c.moveTo(mx0, myc); c.lineTo(mx0 + mw, myc); c.stroke();
    if (mo.length > 1) {
      const sm = Math.max(1e-9, ...mo.map((q) => q.s)), xs = (i: number) => mx0 + i / 47 * mw;
      c.strokeStyle = 'rgba(255,255,255,0.8)'; c.beginPath(); mo.forEach((q, i) => { const y = y0 + 15 + (1 - q.s / sm) * (h * 0.3); if (i) c.lineTo(xs(i), y); else c.moveTo(xs(i), y); }); c.stroke();
      for (const [k, col] of [['x', '#50d8ff'], ['y', '#e070ff']] as const) { c.strokeStyle = col; c.beginPath(); mo.forEach((q, i) => { const y = myc - Math.max(-1, Math.min(1, q[k] / 0.5)) * mk * 0.5; if (i) c.lineTo(xs(i), y); else c.moveTo(xs(i), y); }); c.stroke(); }
    }
    }
    const gx = X(0) + h + 14, gw = cw - h - 18, GT = dg.gate, gmx = Math.max(...Array.from(GT));
    for (let j = 0; j < GT.length; j++) { const v = 10 * Math.log10(Math.max(1, GT[j])) / Math.max(1, 10 * Math.log10(gmx)), bh = v * (h - 14), x = gx + j / GT.length * gw; c.fillStyle = Math.abs(j - 20) <= 2 ? '#ff8070' : '#3d7f96'; c.fillRect(x, y0 + h - 4 - bh, gw / GT.length - 1, bh); }
    c.strokeStyle = '#ffffff'; c.beginPath(); c.moveTo(gx + 20.5 / GT.length * gw, y0 + 2); c.lineTo(gx + 20.5 / GT.length * gw, y0 + h - 2); c.stroke();
    c.fillStyle = '#8fb3c4'; c.fillText(tr.kind === 'conical' ? 'conical scan' : 'monopulse Σ Δ', mx0, y0 + 2); c.fillText('range gate ±200 m', gx, y0 + 2);
    // 2: the angle errors and the range error
    const ex = X(1) + h / 2 + 4, ey = y0 + h / 2, es = h * 0.4;
    c.strokeStyle = '#1f4a5c'; c.strokeRect(ex - es, ey - es, 2 * es, 2 * es); c.beginPath(); c.moveTo(ex - es, ey); c.lineTo(ex + es, ey); c.moveTo(ex, ey - es); c.lineTo(ex, ey + es); c.stroke();
    dg.errs.forEach((e, i) => { const a = (i + 1) / dg.errs.length; c.fillStyle = `rgba(255,128,112,${a})`; c.beginPath(); c.arc(ex + Math.max(-1, Math.min(1, e[0] * 2)) * es, ey - Math.max(-1, Math.min(1, e[1] * 2)) * es, i === dg.errs.length - 1 ? 3 : 1.6, 0, TAU); c.fill(); });
    c.fillStyle = '#cfe8f5'; const tx = X(1) + h + 10;
    c.fillText(`angle err ${(tr.err / D2R).toFixed(2)}°`, tx, y0 + 6); c.fillText(`noise ${((dg.nz || 0) / D2R).toFixed(3)}° glint ${((dg.gl || 0) / D2R).toFixed(3)}°`, tx, y0 + 20); c.fillText(`range err ${dg.rerr >= 0 ? '+' : ''}${dg.rerr.toFixed(1)} m`, tx, y0 + 36); c.fillText(`S/N ${tr.db.toFixed(0)} dB`, tx, y0 + 52);
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
  // The camera's row (js/radar.ts optical): a sensor with no filtering of its own to show (its reading's simulated straight from what's
  // in the frame), so its stages are:
  //   1 PICTURE: what it sees (js/space.ts camDraw), the reticle where it's pointing
  //   2 POINTING: which quarter's camera, which way it looks (bearing and elevation, her frame), its field and zoom, a pixel's angle
  //   3 ESTIMATE: how big the target is in the picture, its size from that, its range from its size (once it's told what it is), the
  //     track's range against it
  //   5 IDENTIFY: what it's on, and what it's told it is (how sure: a bar), a ship's name
  function camRow(c: CanvasRenderingContext2D, su: RSuite, now: number, y0: number, h: number, X: (k: number) => number, cw: number, cw5: number) {
    const o = su.opt!, j = o.job, tt = j && j.tt ? j.tt : null, G = '#8dffbe', D2 = 180 / Math.PI, L = (i: number) => y0 + 5 + i * 13; // (L: a line's place in a stage's box)
    const st = o.off ? 'OFF' : !j ? 'IDLE' : j.kind === 'acq' ? 'SWEEP' : o.st === 'slew' ? 'TURNING' : o.px < Radar.OPT.det ? 'NOTHING IN SIGHT' : 'LOOK';
    c.fillStyle = G; c.fillText(`OPTICAL · ${Radar.QUAD[o.quad]} camera · ${st}`, X(0) + 2, y0 - 13);
    for (const k of [0, 1, 2, 4]) { c.strokeStyle = '#1b3a48'; c.strokeRect(X(k) + 0.5, y0 + 0.5, (k === 4 ? cw5 : cw) - 1, h - 1); }
    // 1: the picture
    if (dbg.cam) { const iw = Math.min(cw - 4, (h - 4) * 4 / 3), ih = iw * 0.75; c.drawImage(dbg.cam, X(0) + 2, y0 + 2 + (h - 4 - ih) / 2, iw, ih); }
    else { c.fillStyle = '#5f8fa4'; c.fillText('no picture', X(0) + 6, L(0)); }
    // 2: where it's pointing (her frame), how far it's zoomed (a bar: widest left, tightest right, log), a pixel's angle
    const b = o.b.clone().applyQuaternion(su.Q.clone().invert()), az = Math.atan2(b.x, -b.z) * D2, el = Math.asin(Math.max(-1, Math.min(1, b.y))) * D2, zoom = Radar.OPT.fovMax / Math.max(1e-6, o.fov), ifov = o.fov / Radar.OPT.px * 1e6;
    const tx1 = X(1) + 6, sg = (x: number) => (x >= 0 ? '+' : '') + x.toFixed(1); c.fillStyle = '#cfe8f5';
    c.fillText(`brg ${sg(az)}° el ${sg(el)}°`, tx1, L(0));
    c.fillText(`field ${(o.fov * D2).toFixed(o.fov * D2 < 1 ? 2 : 1)}° · zoom ×${zoom.toFixed(1)}`, tx1, L(1));
    c.fillText(`${ifov.toFixed(0)} µrad a pixel`, tx1, L(2));
    const zb = Math.log(zoom) / Math.log(Radar.OPT.fovMax / Radar.OPT.fovMin); c.fillStyle = '#16303c'; c.fillRect(tx1, L(3) + 3, cw - 14, 5); c.fillStyle = G; c.fillRect(tx1, L(3) + 3, (cw - 14) * Math.max(0, Math.min(1, zb)), 5);
    c.fillStyle = '#7f9fb0'; c.fillText('wide', tx1, L(4)); c.fillText('tight', tx1 + cw - 44, L(4));
    if (j && j.kind === 'acq') { const cc = (o as any).con, f = cc ? su.scans[cc.k].fan : 1; c.fillStyle = '#ffc060'; c.fillText(`sweeping ${cc ? cc.c.n : ''}: ${Math.round(((o.e ?? 0) + f) / (2 * f) * 100)}%`, tx1, L(5)); }
    // 3: how big it is in the picture, its size from that, its range (the track's; from its size once it's told what it is)
    const tx2 = X(2) + 6, seen = o.px >= Radar.OPT.det; c.fillStyle = '#cfe8f5'; c.fillText(seen ? `${Math.round(o.px)} px across` : 'nothing in sight', tx2, L(0));
    if (tt) {
      const told = tt.cls && tt.cls.conf > 0.5; c.fillStyle = '#cfe8f5';
      c.fillText(`size ${tt.szE ? '≈ ' + Math.round(2 * tt.szE) + ' m' : 'not measured'}`, tx2, L(1));
      c.fillText(`track: ${(o.rng / 1000).toFixed(2)} km`, tx2, L(2));
      c.fillStyle = told ? G : '#7f9fb0'; c.fillText(told ? 'range from size ±15%' : 'range: not measured', tx2, L(3));
      if (seen) { c.fillStyle = o.px >= Radar.OPT.cls ? G : '#ffc060'; c.fillText(o.px >= Radar.OPT.id ? "a ship's name readable" : o.px >= Radar.OPT.cls ? 'big enough to tell' : 'a dot: where, not what', tx2, L(4)); }
    }
    // 5: what it's on, what it's told it is (how sure: a bar; 60% is what's acted on), how far through the look
    const tx4 = X(4) + 4; c.fillStyle = G;
    c.fillText(!j ? 'idle' : j.kind === 'acq' ? 'placing a contact' : `on ${tt ? tt.n : ''}${tt && tt.quiet ? ' · listen only' : ''}`, tx4, L(0));
    const cl = tt && tt.cls;
    if (cl) { c.fillStyle = '#cfe8f5'; c.fillText(`it's a ${cl.k}${cl.name ? ': ' + cl.name : ''}`, tx4, L(1)); c.fillStyle = '#16303c'; c.fillRect(tx4, L(2) + 3, cw5 - 12, 5); c.fillStyle = cl.conf >= 0.6 ? G : '#ffc060'; c.fillRect(tx4, L(2) + 3, (cw5 - 12) * cl.conf, 5); c.fillStyle = '#7f9fb0'; c.fillText(`${Math.round(cl.conf * 100)}% sure (60%: acted on)`, tx4, L(3)); }
    else if (tt) { c.fillStyle = '#7f9fb0'; c.fillText('not told what it is yet', tx4, L(1)); }
    if (j) { c.fillStyle = '#7f9fb0'; c.fillText(`${Math.round(Radar.optProg(su, now) * 100)}% through the look`, tx4, L(4)); }
  }
  // Stage 5: hostile or not (js/radar.ts assess): every track she holds, worst first: what it is to her, its range, how fast it's
  // closing, where its course passes her, the score (a bar, the line at 0.6) and the confirmation's progress (the bar under it,
  // full at 3 s), and why
  // (the debug view's truth: what a target id is, in words (js/space.ts sets it: the zone's ships by name, a torpedo whose))
  const dbg = { nameOf: (id: string) => id, cam: null as HTMLCanvasElement | null }; // (cam: the shown ship's camera picture (js/space.ts optView))
  // what a row really is (debug only: the ids the radar's peaks carry for this view, nothing decides by them): the things its
  // contacts' latest peaks and its tracker were on. Two different things: a ghost (two contacts' crossing, nothing there); none: noise
  function truthOf(a: RAssess) {
    const ids = [a.c && a.c.p.id, a.f && a.f.a && a.f.a.p.id, a.f && a.f.b && a.f.b.p.id, a.f && a.f.trk && a.f.trk.tgt].filter((x) => x != null) as string[];
    const real = [...new Set(ids.filter(Boolean))];
    if (!real.length) return ids.length ? { t: 'noise', col: '#9a9a9a' } : { t: '?', col: '#9a9a9a' };
    if (real.length > 1) return { t: 'GHOST: ' + real.map(dbg.nameOf).join(' / '), col: '#ff70d0' };
    return { t: dbg.nameOf(real[0]), col: '#8dffbe' };
  }
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
      // (what it really is first, the debug view's alone; then its range, closing speed and why)
      const tr0 = truthOf(a), t0 = '= ' + tr0.t + '  ', tw = c.measureText(t0).width; c.fillStyle = tr0.col; c.fillText(t0, x0 + 4, y + 13);
      c.fillStyle = '#8fb3c4'; c.fillText(`${(a.r / 1000).toFixed(2)} km ${a.vc >= 0 ? '+' : ''}${Math.round(a.vc)} m/s · ${a.why}`.slice(0, Math.max(0, Math.floor((w - tw) / 6.4))), x0 + 4 + tw, y + 13);
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
    c.strokeStyle = 'rgba(40,100,125,0.6)'; for (const r of [2500, 10000, 50000]) { const ring: THREE.Vector3[] = []; for (let i = 0; i <= 48; i++) { const a = i / 48 * TAU; ring.push(new T.Vector3(Math.sin(a) * r, 0, -Math.cos(a) * r)); } line(ring); }
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
    // every belief's shape (js/radar.ts fuse): its covariance's ellipsoid at 2 sigma, its three principal sections; drawn true size
    // where that's big enough to see, else grown (its proportions kept) to 14 px across: grey a slab (one scanner's: thin in range
    // and across its fan, long along it), amber placed by both, green a 3D fix
    const ax2 = [new T.Vector3(), new T.Vector3(), new T.Vector3()];
    for (const b of su.bel || []) {
      if (!b.sx || !b.axes) continue;
      const [x0c, y0c] = pr(b.p), sv: number[][] = [];
      for (let i = 0; i < 3; i++) { ax2[i].copy(b.axes[i]).applyQuaternion(qn).multiplyScalar(2 * b.sx[i]); const L = ax2[i].length(), eps = Math.min(1, 50 / Math.max(1e-6, L)), [x1, y1] = pr(b.p.clone().addScaledVector(ax2[i], eps)); sv.push([(x1 - x0c) / eps, (y1 - y0c) / eps]); }
      let big = Math.max(...sv.map(([x, y]) => Math.hypot(x, y))), k = 1; if (big < 4) k = 4 / Math.max(1e-6, big); else if (big > R * 0.5) k = R * 0.5 / big;
      const col = b.kind === 3 ? '90,255,140' : b.kind === 2 ? '255,200,90' : '170,170,190', al = b.kind === 1 ? 0.35 : 0.8;
      c.strokeStyle = `rgba(${col},${al})`; c.lineWidth = b.kind === 3 ? 1.5 : 1;
      for (const [i, j] of [[0, 1], [0, 2], [1, 2]]) { c.beginPath(); for (let s1 = 0; s1 <= 32; s1++) { const t1 = s1 / 32 * TAU, cs = Math.cos(t1) * k, sn = Math.sin(t1) * k, X = x0c + cs * sv[i][0] + sn * sv[j][0], Y = y0c + cs * sv[i][1] + sn * sv[j][1]; if (s1) c.lineTo(X, Y); else c.moveTo(X, Y); } c.stroke(); }
      c.lineWidth = 1;
    }
    // (and the nearest of them each in a cell of its own along the bottom, at its own scale (its widest axis across the cell), turned
    // as the view is: its shape, whatever its size: a slab a line, placed a flat disc or a bead, a 3D fix a small round ball)
    { const cs = 62, n = Math.max(0, Math.floor((w - 8) / (cs + 4))), byK = [3, 2, 1].map((k) => (su.bel || []).filter((b) => b.kind === k && b.sx && b.axes).sort((a, b) => a.r - b.r)), sel: RFused[] = []; // (the nearest of each kind in turn: fixes, placed, slabs)
      for (let i = 0; sel.length < n && i < 50; i++) for (const L of byK) if (L[i] && sel.length < n) sel.push(L[i]);
      const rot = (v: THREE.Vector3) => { const x1 = v.x * cyw - v.z * syw, z1 = v.x * syw + v.z * cyw; return [x1, -(v.y * ct - z1 * st)]; };
      sel.forEach((b, i) => {
        const bx = x0 + 4 + i * (cs + 4), by = y0 + h - cs - 42, mx = bx + cs / 2, my = by + cs / 2 + 4, col = b.kind === 3 ? '90,255,140' : b.kind === 2 ? '255,200,90' : '170,170,190';
        c.fillStyle = 'rgba(4,14,20,0.85)'; c.fillRect(bx, by, cs, cs + 12); c.strokeStyle = `rgba(${col},0.5)`; c.strokeRect(bx + 0.5, by + 0.5, cs - 1, cs + 11);
        const k = (cs * 0.4) / (2 * b.sx![0]), sv = [0, 1, 2].map((q) => rot(b.axes![q].clone().applyQuaternion(qn).multiplyScalar(2 * b.sx![q] * k)));
        c.strokeStyle = `rgba(${col},0.95)`;
        for (const [ii, jj] of [[0, 1], [0, 2], [1, 2]]) { c.beginPath(); for (let s1 = 0; s1 <= 32; s1++) { const t1 = s1 / 32 * TAU, co = Math.cos(t1), sn = Math.sin(t1), X = mx + co * sv[ii][0] + sn * sv[jj][0], Y = my + co * sv[ii][1] + sn * sv[jj][1]; if (s1) c.lineTo(X, Y); else c.moveTo(X, Y); } c.stroke(); }
        const f = (q: number) => (q < 10 ? q.toFixed(1) : String(Math.round(q)));
        c.fillStyle = `rgb(${col})`; c.fillText(`${b.n} ${b.kind === 3 ? 'FIX' : b.kind === 2 ? 'placed' : 'slab'}`, bx + 3, by + 9); c.fillText(`σ ${f(b.sx![0])}×${f(b.sx![2])} m`, bx + 3, by + cs + 9); // (its widest and its thinnest)
      }); }
    for (const f of su.fus) {
      const col = f.iff ? iffCol({ iff: f.iff } as RContact, su) : '255,200,90', [x, y] = pr(f.p), [bx, by] = pr(new T.Vector3(f.p.x, 0, f.p.z));
      // its trajectory: where it's been (solid, fading) and where its velocity takes it in the next 10 s (dashed)
      c.strokeStyle = `rgba(${col},0.75)`; line(f.hist.map((q) => toHer(q.p)));
      if (f.v.lengthSq() > 1) { const fut: THREE.Vector3[] = []; for (let i = 0; i <= 10; i++) fut.push(toHer(f.pl.clone().addScaledVector(f.v, i))); c.setLineDash([4, 3]); line(fut); c.setLineDash([]); }
      c.strokeStyle = `rgba(${col},0.5)`; c.setLineDash([2, 3]); c.beginPath(); c.moveTo(x, y); c.lineTo(bx, by); c.stroke(); c.setLineDash([]);
      c.fillStyle = `rgb(${col})`; c.beginPath(); c.arc(x, y, f.fix ? 4 : 2.5, 0, TAU); c.fill();
      if (f.fix || f.trk) c.fillText(`${f.n} ${[f.a && f.a.n, f.b && f.b.n, f.trk && 'TRK ' + (f.trk.side > 0 ? 'S' : 'P')].filter(Boolean).join('+')} ±${Math.round(f.res)} m${f.v.lengthSq() > 1 ? ' · ' + Math.round(f.v.length()) + ' m/s' : ''}`, x + 6, y - 6); // (labelled: its 3D fixes, and what a tracker's on; the rest in the cells below)
    }
    // the trackers' solutions: where each has had its target, and where it has it going (red)
    for (const tr of su.trks) {
      if (tr.st !== 'track' || !tr.est.p || !tr.hist) continue;
      c.strokeStyle = 'rgba(255,80,60,0.85)'; line(tr.hist.map((q) => toHer(q.p))); const fut: THREE.Vector3[] = []; for (let i = 0; i <= 10; i++) fut.push(toHer(tr.est.p.clone().addScaledVector(tr.est.v, i)));
      c.setLineDash([4, 3]); line(fut); c.setLineDash([]); const [tx, ty] = pr(toHer(tr.est.p)); c.strokeRect(tx - 5, ty - 5, 10, 10);
    }
    c.fillStyle = '#5f8fa4'; c.fillText(`${su.fus.length} placed (${su.fus.filter((f) => f.fix).length} 3D fixes) of ${(su.bel || []).length} beliefs · cyan: A arcs · magenta: B arcs · grey: slabs · amber: placed · green: 3D fix · dashed: the next 10 s`, x0 + 4, y0 + h - 14);
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
  type HoloItem = { pos: THREE.Vector3; plot: RPlot | null; label: string; col: string; rwr?: THREE.Vector3 }; // (rwr: a radar warning's bearing (her frame), to send a tracker along)
  let holoG: { vels: THREE.Line[]; rwrItems: HoloItem[]; scanUi: HTMLElement; secs: { patch: THREE.Mesh; edges: THREE.Mesh }[]; rwr: { cone: THREE.Mesh; line: THREE.Line; s: THREE.Sprite; cv: HTMLCanvasElement; tex: THREE.CanvasTexture; txt: string }[]; zoom: number; rings: { l: THREE.Line; s: THREE.Sprite; cv: HTMLCanvasElement; tex: THREE.CanvasTexture }[]; focus: boolean | null; arcs: THREE.Line[]; strips: THREE.Line[]; ends: THREE.Mesh[]; g: THREE.Group; inner: THREE.Group; fans: THREE.Mesh[]; beams: THREE.Line[]; dots: THREE.Mesh[]; sel: THREE.Mesh; label: THREE.Sprite; lcv: HTMLCanvasElement; ltex: THREE.CanvasTexture; ltext: string; items: HoloItem[]; R: number; hint: HTMLElement } | null = null;
  // (a track's velocity line: from its dot to where it'll be in VT seconds at its velocity against hers, so what's coming at
  // her points at the middle)
  const VT = 10;
  const HCOL: Record<string, number> = { HOSTILE: 0xff4a3a, SUSPECT: 0xffa040, WATCH: 0xffe070, NEUTRAL: 0xa8b8c4, CIV: 0x7f9fb0, FRIENDLY: 0x70f090 };
  function holoMake(parent: THREE.Object3D, R: number) {
    const g = new T.Group(), inner = new T.Group(); g.add(inner); parent.add(g);
    const glow = (c: number, o: number) => new T.MeshBasicMaterial({ color: c, transparent: true, opacity: o, depthWrite: false, blending: T.AdditiveBlending, side: T.DoubleSide });
    // (range rings in her plane, a quarter, half and all of the range shown (zoom), each named: holo)
    const rings = [0, 1, 2].map(() => {
      const pts: THREE.Vector3[] = []; for (let i = 0; i <= 64; i++) { const a = i / 64 * TAU; pts.push(new T.Vector3(Math.sin(a), 0, -Math.cos(a))); }
      const l = new T.Line(new T.BufferGeometry().setFromPoints(pts), new T.LineBasicMaterial({ color: 0x40c8ff, transparent: true, opacity: 0.35, depthWrite: false, blending: T.AdditiveBlending })); inner.add(l);
      const cv = document.createElement('canvas'); cv.width = 256; cv.height = 64; const tex = new T.CanvasTexture(cv);
      const sp = new T.Sprite(new T.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, depthTest: false })); sp.scale.set(R * 0.5, R * 0.125, 1); sp.renderOrder = 15; inner.add(sp);
      return { l, s: sp, cv, tex };
    });
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
    const hint = document.createElement('div'); hint.id = 'holo-hint'; Object.assign(hint.style, { position: 'fixed', left: '50%', bottom: '8%', transform: 'translateX(-50%)', whiteSpace: 'nowrap', font: '300 13px "Oxanium", var(--ui-font, system-ui, sans-serif)', letterSpacing: '0.6px', color: 'rgba(170,225,250,0.75)', textShadow: '0 0 3px rgba(0,0,0,0.6)', pointerEvents: 'none', display: 'none', zIndex: '35' }); hint.textContent = 'hold right mouse: turn the sphere · 3: the camera view · tap right: drop the trackers'; document.body.appendChild(hint);
    const scanUi = document.createElement('div'); scanUi.id = 'holo-scan'; Object.assign(scanUi.style, { position: 'fixed', left: '24px', top: '24px', font: '300 13px "Oxanium", var(--ui-font, system-ui, sans-serif)', letterSpacing: '0.6px', fontVariantNumeric: 'tabular-nums', color: 'rgba(215,235,245,0.85)', textShadow: '0 0 3px rgba(0,0,0,0.6)', pointerEvents: 'none', display: 'none', zIndex: '35', lineHeight: '1.6' }); document.body.appendChild(scanUi);
    holoG = { vels: [], rwrItems: [], scanUi, secs: [], rwr: [], zoom: 0, rings, focus: null, arcs: [], strips, ends, g, inner, fans, beams, dots: [], sel, label, lcv, ltex, ltext: '', items: [], R, hint };
  }
  // the hologram as her radars have it now: parent her drawing's group, c its middle there, rot how the operator's turned it,
  // seated whether its operator's at it (the hint), pick the item they're pointing at
  // the hologram's type: Oxanium (assets/fonts, SIL OFL). Its canvas labels are drawn again once it's loaded (a canvas drawn before
  // it is has the fallback in it, kept till its text changes)
  let refont = false;
  try { for (const w of [300, 400, 500]) document.fonts.load(`${w} 32px Oxanium`).then(() => { refont = true; }); } catch { /* (no FontFaceSet: the fallback) */ }
  function holo(parent: THREE.Object3D | null, su: RSuite | null, c: THREE.Vector3, R: number, rot: THREE.Quaternion, now: number, seated: boolean, pick: HoloItem | null, focus = false, grow = 1, zoom = RMAX, rwr: { d: THREE.Vector3; kind: 'lock' | 'trk' | 'scan'; age: number }[] = [], sv: { secs: { k: number; c: number; h: number; on: boolean; sel: boolean }[]; boxes: { mode: string; notch?: boolean; open: boolean; cur: number; opts: string[]; sel: boolean }[]; trkSel: number } = { secs: [], boxes: [], trkSel: -1 }) {
    const secs = sv.secs;
    if (!parent || !su) { if (holoG) { holoG.g.removeFromParent(); holoG.hint.style.display = 'none'; holoG.scanUi.style.display = 'none'; } return; }
    if (!holoG || holoG.R !== R) { if (holoG) { holoG.g.removeFromParent(); holoG.hint.remove(); } holoMake(parent, R); }
    const H = holoG!; if (H.g.parent !== parent) parent.add(H.g);
    if (refont) { refont = false; H.zoom = -1; H.ltext = ''; for (const m of H.rwr) if (m) m.txt = ''; }
    H.g.position.copy(c).add(new T.Vector3(0, -0.3 * (1 - grow), 0)); H.g.scale.setScalar(0.12 + 0.88 * grow); H.inner.quaternion.copy(rot); /* (grow: rising up out of the console and opening, as the operator sits) */ H.hint.style.display = seated ? '' : 'none';
    // (focused: all of it on layer 6 alone, drawn sharp over the blurred frame (js/render.ts focusBlur); else on the scene's own)
    if (H.focus !== focus) { H.focus = focus; H.hint.textContent = focus ? '1 / 2  scanner (hold: modes) · click a track: keep it tracked (again: let go) · click a warning: search that way · 3: the camera view · drag right  turn · scroll  zoom · hold G  look up · hold F  get up' : 'hold G: focus on it · hold right mouse: turn it · 3: the camera view · tap right: drop the trackers'; }
    H.g.traverse((o) => o.layers.set(focus ? 6 : 0));
    const at = (p: THREE.Vector3, out = new T.Vector3()) => { const L = p.length(); return out.copy(p).multiplyScalar(L > 0 ? Math.sqrt(Math.min(1, L / zoom)) * R / L : 0); }; // (beyond the range shown: at its edge)
    if (H.zoom !== zoom) { H.zoom = zoom; [0.25, 0.5, 1].forEach((f, i) => { const g0 = H.rings[i], rr = Math.sqrt(f) * R, km = zoom * f / 1000; g0.l.scale.setScalar(rr); g0.s.position.set(rr + R * 0.1, R * [-0.07, 0.07, 0][i], 0); /* (at her starboard side of each, the inner two staggered up and down: not over each other) */
      const x = g0.cv.getContext('2d')!; x.clearRect(0, 0, 256, 64); x.font = '400 34px Oxanium, Barlow, system-ui, sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.lineWidth = 3; x.strokeStyle = 'rgba(0,0,0,0.45)'; const t = km >= 1 ? +km.toFixed(2) + ' km' : Math.round(km * 1000) + ' m'; x.strokeText(t, 128, 32); x.fillStyle = 'rgba(143,220,255,0.8)'; x.fillText(t, 128, 32); g0.tex.needsUpdate = true; }); }
    // the fans: as wide as the shell, sweeping (none of a fan where her hull hides it)
    su.scans.forEach((sc, i) => { if (!H.fans[i]) return; fanFill(H.fans[i], { ...sc, R0: R, at: new T.Vector3() } as RScan, sc.th); });
    const camQ = new T.Quaternion(); H.inner.updateWorldMatrix(true, false); H.inner.getWorldQuaternion(camQ); const faceCam = camQ.invert().multiply(G_cam.quaternion);
    su.trks.forEach((tr, i) => {
      const l = H.beams[i], st = H.strips[i], en = H.ends[i]; if (!l) return;
      const on = tr.st !== 'idle', len = on && tr.rng > 0 ? Math.sqrt(Math.min(1, tr.rng / zoom)) * R : R;
      // (its beam: along its axis as it is this instant, the conical scan's circling and all, out to its range gate)
      const picked = sv.trkSel === i; // (the one picked to be sent: shown, idle or not, bright and pulsing)
      l.visible = (on || picked) && !tr.off; l.quaternion.setFromUnitVectors(Z, tr.st === 'track' ? tr.a : tr.b); l.scale.setScalar(on ? len : R * 0.6); (l.material as THREE.LineBasicMaterial).color.setHex(picked ? 0xffffff : tr.st === 'track' ? 0xff4030 : 0xffb040); (l.material as THREE.LineBasicMaterial).opacity = picked ? 0.7 + 0.3 * Math.sin(now * 6) : 0.9;
      en.visible = on && tr.rng > 0; en.position.copy(tr.st === 'track' ? tr.a : tr.b).multiplyScalar(len); en.quaternion.copy(faceCam); (en.material as THREE.MeshBasicMaterial).color.setHex(tr.st === 'track' ? 0xff4030 : 0xffb040);
      // (sweeping: the strip it's searching along, the arc its cue's on)
      st.visible = (tr.st === 'slew' || tr.st === 'acq') && !!tr.cue;
      if (st.visible) { const c = tr.cue!, sc = su.scans[c.k], pa = st.geometry.attributes.position as THREE.BufferAttribute, qn = su.Q.clone().invert(), v = new T.Vector3();
        for (let j = 0; j <= 24; j++) { Radar.dirOf(c.ax, c.phi, -sc.fan + 2 * sc.fan * j / 24, v).applyQuaternion(c.q).multiplyScalar(c.r).add(c.o).sub(su.P).applyQuaternion(qn); at(v, v); pa.setXYZ(j, v.x, v.y, v.z); }
        pa.needsUpdate = true; st.computeLineDistances(); }
    });
    // the search cones: the space a scanner's fan sweeps across its sector, a patch at the edge and the two fans at its sides from
    // the middle (its colour); brighter for the one the keys are working, fainter while it's still going round (a preview)
    secs.forEach((q, i) => {
      const sc = su.scans[q.k]; if (!sc) return;
      let o = H.secs[i];
      if (!o) { const mk = () => { const m = new T.Mesh(new T.BufferGeometry(), new T.MeshBasicMaterial({ transparent: true, depthWrite: false, blending: T.AdditiveBlending, side: T.DoubleSide })); H.inner.add(m); return m; }; o = H.secs[i] = { patch: mk(), edges: mk() }; }
      const NP = 16, NE = 8, v = new T.Vector3(), pp: number[] = [], ep: number[] = [];
      for (let a = 0; a < NP; a++) for (let b = 0; b < NE; b++) { // (the patch: across the sector by along the fan, two triangles a cell)
        const P = (ia: number, ib: number) => { Radar.dirOf(sc.ax, q.c - q.h + 2 * q.h * ia / NP, -sc.fan + 2 * sc.fan * ib / NE, v).multiplyScalar(R); return [v.x, v.y, v.z]; };
        const p00 = P(a, b), p10 = P(a + 1, b), p01 = P(a, b + 1), p11 = P(a + 1, b + 1); pp.push(...p00, ...p10, ...p11, ...p00, ...p11, ...p01);
      }
      for (const side of [-1, 1]) for (let b = 0; b < NE; b++) { // (the two side fans: from the middle out to the patch's edges)
        const e0 = -sc.fan + 2 * sc.fan * b / NE, e1 = -sc.fan + 2 * sc.fan * (b + 1) / NE; Radar.dirOf(sc.ax, q.c + side * q.h, e0, v).multiplyScalar(R); const a0 = [v.x, v.y, v.z]; Radar.dirOf(sc.ax, q.c + side * q.h, e1, v).multiplyScalar(R); ep.push(0, 0, 0, ...a0, v.x, v.y, v.z);
      }
      for (const [m, arr] of [[o.patch, pp], [o.edges, ep]] as [THREE.Mesh, number[]][]) { // (its buffer made once, filled each frame)
        let at0 = m.geometry.getAttribute('position') as THREE.BufferAttribute | undefined; if (!at0 || at0.array.length !== arr.length) { at0 = new T.BufferAttribute(new Float32Array(arr.length), 3); m.geometry.setAttribute('position', at0); }
        (at0.array as Float32Array).set(arr); at0.needsUpdate = true; m.geometry.computeBoundingSphere(); }
      const col = sc.ax === 'y' ? 0x50d8ff : 0xe070ff, k0 = (q.sel ? 1 : 0.55) * (q.on ? 1 : 0.6);
      for (const [m, a0] of [[o.patch, 0.16], [o.edges, 0.1]] as [THREE.Mesh, number][]) { m.visible = true; (m.material as THREE.MeshBasicMaterial).color.setHex(col); (m.material as THREE.MeshBasicMaterial).opacity = a0 * k0; }
    });
    for (let i = secs.length; i < H.secs.length; i++) { H.secs[i].patch.visible = H.secs[i].edges.visible = false; }
    // each search radar's box, in the corner: its number, name and mode; open (its number held), the list of its modes with the
    // one picked marked (tap its number for the next, hold it to set it and close); the radar the keys work marked
    H.scanUi.style.display = seated ? '' : 'none';
    if (seated) {
      const deg = (a: number) => String(Math.round(((a * 180 / Math.PI) % 360 + 360) % 360)).padStart(3, '0');
      const html = su.scans.map((sc, k) => {
        const b = sv.boxes[k]; if (!b) return ''; const col = sc.ax === 'y' ? '#50d8ff' : '#e070ff', name = b.opts[['round', 'sector', 'off'].indexOf(b.mode)] || b.mode;
        const what = b.mode === 'sector' ? `${name} ${Math.round(sc.sec.h * 360 / Math.PI)}° at ${deg(sc.sec.c)}°` : name;
        let h = `<div data-hb="s${k}" style="display:inline-block;min-width:330px;margin-bottom:6px;padding:3px 9px;border:1px solid ${b.open || b.sel ? col : 'rgba(120,180,210,0.18)'};background:rgba(4,12,18,0.32);border-radius:2px">`
          + `<span style="color:${col}">${k + 1} SCAN ${sc.tag}</span> <span style="color:#7f9fb0">${sc.ax === 'y' ? 'bearing' : 'roll'}</span> <span style="float:right;font-weight:400">${what}${b.notch ? ' <span style="color:#8dffbe">· NOTCH</span>' : ''} ${b.open ? '▴' : '▾'}</span>`;
        if (b.open) h += b.opts.map((o, i) => `<div data-hb="o${k}:${i}" style="padding-left:14px;color:${i === b.cur ? '#ffffff' : '#7f9fb0'}">${i === b.cur ? '▶ ' : '&nbsp;&nbsp;'}${o}</div>`).join('') + `<div style="padding-left:14px;color:#5f8fa4;font-size:12px">click one, or tap ${k + 1}: next · hold ${k + 1}: set</div>`;
        if (b.sel) h += `<div style="color:rgba(255,255,255,0.7);font-size:12px">W S: width · A D: direction</div>`;
        return h + '</div>';
      }).join('<br>') + '<br>' + (() => { // (the tracking radars: one scheduler, a slot a dish, and the one queue it hands them work from)
        // (each dish's slot: its number, what it's on (a bar: its slew, then its dwell) or IDLE / OFF (click the state: off or on). Below,
        // every job planned, in the order they start: each with the dish it's going to (the first that'll be free and can see it, as
        // the plan has it now: replanned every epoch, or at once when a threat comes in), when it starts and how long it takes)
        const PC = ['#9fc2d4', '#ffffff', '#ff6050'], pc = (p: number) => PC[Math.max(0, Math.min(2, p))];
        const slots = [1, 0].map((ti, j) => {
          const tr = su.trks[ti]; if (!tr) return ''; const j0 = tr.job, col = tr.off ? '#5f6f78' : j0 ? pc(Radar.jobPri(j0)) : '#9fc2d4', prog = j0 ? Radar.jobProg(su, tr, now) : 0;
          const what = tr.off ? 'OFF' : j0 ? Radar.jobName(j0) : 'IDLE', how = tr.off ? 'switched off' : j0 ? (tr.st === 'slew' ? 'slewing' : tr.st === 'track' ? 'locked' : tr.st === 'acq' ? 'searching' : '') : 'free';
          return `<div data-hb="t${ti}" style="flex:1 1 0;min-width:150px;padding:3px 7px;border:1px solid ${col}66;border-left:3px solid ${col};background:rgba(4,12,18,0.4)"><div><span style="color:#ffb040">${j + 3} ${tr.side > 0 ? 'STBD' : 'PORT'}</span> <span data-hb="p${ti}" style="float:right;color:${col}">${what}</span></div>`
            + `<div style="height:5px;margin:3px 0;background:rgba(120,180,210,0.15)"><div style="height:5px;width:${(prog * 100).toFixed(1)}%;background:${col}"></div></div><div style="font-size:11px;color:#7f9fb0">${how}</div></div>`;
        }).join('') + (() => { // (and the camera: what it's looking at, through which quarter's camera, how big the target is in its picture)
          const o = su.opt; if (!o) return ''; const j0 = o.job, col = o.off ? '#5f6f78' : j0 ? '#8dffbe' : '#9fc2d4', prog = Radar.optProg(su, now);
          const what = o.off ? 'OFF' : j0 ? (j0.kind === 'acq' ? 'SWEEP ' + ((o as any).con ? (o as any).con.c.n : '') : 'LOOK ' + j0.tt!.n) : 'IDLE', how = o.off ? 'switched off' : !j0 ? 'free' : o.st === 'slew' ? 'turning to it · ' + Radar.QUAD[o.quad] : j0.kind === 'acq' ? 'along its arc · ' + Radar.QUAD[o.quad] : o.px < Radar.OPT.det ? 'nothing in sight · ' + Radar.QUAD[o.quad] : `${Math.round(o.px)} px · ${Radar.QUAD[o.quad]}`;
          return `<div data-hb="c0" style="flex:1 1 0;min-width:150px;padding:3px 7px;border:1px solid ${col}66;border-left:3px solid ${col};background:rgba(4,12,18,0.4)"><div><span style="color:#8dffbe">OPTICAL</span> <span style="float:right;color:${col}">${what}</span></div>`
            + `<div style="height:5px;margin:3px 0;background:rgba(120,180,210,0.15)"><div style="height:5px;width:${(prog * 100).toFixed(1)}%;background:${col}"></div></div><div style="font-size:11px;color:#7f9fb0;white-space:nowrap">${how}</div></div>`;
        })();
        // (the queue: a token for each track she keeps and each search asked for, most wanted first (Radar.urgency: its priority by how
        // overdue its next look is, or how long the search has waited); each says how due it is and the dish on it now or planned next)
        type Tok = { name: string; c0: string; v: number; sub: string; on: string };
        const S0 = su.sched, toks: Tok[] = [], dishOf = (f: (j: import('./radar.js').RJob) => boolean) => { for (const tr of su.trks) if (!tr.off && tr.job && f(tr.job)) return { now: true, d: tr.side > 0 ? 'S' : 'P', at: now }; if (su.opt && su.opt.job && f(su.opt.job)) return { now: true, d: 'O', at: now }; let best: { at: number; d: string } | null = null; if (S0) for (const [tr, pl] of S0.plan) if (!tr.off) for (const j of pl) if (f(j) && (!best || (j.at ?? 0) < best.at)) best = { at: j.at ?? 0, d: tr.side > 0 ? 'S' : 'P' }; return best ? { now: false, d: best.d, at: best.at } : null; };
        if (S0) {
          for (const tt of S0.tts) { const u = Radar.urgency(su, { kind: 'look', tt, t: tt.t, pri: tt.pri }, now), w = dishOf((j) => j.kind === 'look' && j.tt === tt);
            toks.push({ name: `${tt.op ? '★' : tt.pri >= 2 ? '⚠' : ''}${tt.n}${tt.quiet ? ' ◌' : ''}`, c0: pc(tt.pri), v: u.v, sub: `due ${u.due.toFixed(1)}×`, on: !w ? '' : w.now ? `on ${w.d}` : `→${w.d} +${Math.max(0, w.at - now).toFixed(1)}` }); }
          for (const rq of S0.reqs) { const u = Radar.urgency(su, rq, now), w = dishOf((j) => j === rq);
            toks.push({ name: rq.kind === 'acq' ? 'FIND' : 'SEARCH', c0: pc(rq.pri), v: u.v, sub: `${u.due.toFixed(1)} s`, on: !w ? 'waiting' : w.now ? `on ${w.d}` : `→${w.d} +${Math.max(0, w.at - now).toFixed(1)}` }); }
        }
        toks.sort((x, y) => y.v - x.v);
        const chips = toks.map((t) => `<div style="flex:0 0 auto;width:84px;padding:2px 5px;border:1px solid ${t.c0}55;border-left:3px solid ${t.c0};background:${t.on.startsWith('on') ? 'rgba(255,176,64,0.12)' : 'rgba(4,12,18,0.4)'}"><div style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis"><span style="color:${t.c0}">${t.name}</span> <span style="float:right;font-size:11px;color:${t.on.startsWith('on') ? '#ffb040' : '#7f9fb0'}">${t.on}</span></div><div style="font-size:11px;color:#7f9fb0;white-space:nowrap">${t.sub}</div></div>`).join('');
        const waiting = toks.filter((t) => t.on === 'waiting').length;
        return `<div style="display:inline-block;margin-bottom:6px;padding:3px 9px;border:1px solid rgba(120,180,210,0.18);background:rgba(4,12,18,0.32);border-radius:2px;font-weight:400;min-width:420px;max-width:860px">`
          + `<div><span style="color:#ffb040">TRACKER SCHEDULER</span> <span style="font-size:11px;color:#7f9fb0">· click a dish's state: off or on · 3: the camera's picture</span></div>`
          + `<div style="display:flex;gap:6px;margin:3px 0">${slots}</div>`
          + `<div style="font-size:11px;color:#7f9fb0">QUEUE · a token a track and a search, most wanted first · due: how overdue its next look is (1×: as often as it's wanted) · its dish now (on) or planned next (→)${waiting ? ` · <span style="color:#ffb040">${waiting} waiting</span>` : ''}</div>`
          + `<div style="display:flex;flex-wrap:wrap;gap:3px;margin-top:2px;font-size:12px;line-height:1.35">${chips || '<span style="color:#5f8fa4">nothing held</span>'}</div></div>`;
      })() + (() => { // (her tracks, one a row: what the scheduler's keeping; each its shape (its solution's spread, widest and thinnest: a 3D fix
        // or not), how fast it's going against her and closing, when it was last seen, how often it's looked at lately; ✕ drops it)
        const S0 = su.sched; if (!S0 || !S0.tts.length) return '';
        const qn = su.Q.clone().invert(), FX = Radar.FIX;
        const rows = S0.tts.slice().sort((a, b) => b.pri - a.pri || (b.op ? 1 : 0) - (a.op ? 1 : 0) || a.t0 - b.t0).slice(0, 8).map((q) => {
          const P = q.kf.P, e = Radar.eig3([P[0], P[1], P[2], P[6], P[7], P[8], P[12], P[13], P[14]]), sx = e.map((v) => Math.sqrt(v.l)), p = q.kf.pos(new T.Vector3()), r = p.distanceTo(su.P), fix = sx[0] < FX.s + FX.k * r;
          const rv = q.kf.vel(new T.Vector3()).sub(su.V), los = p.clone().sub(su.P).normalize(), vc = -rv.dot(los), f = (x: number) => (x < 10 ? x.toFixed(1) : String(Math.round(x)));
          const ago = q.looks ? now - q.t : -1, c0 = q.pri >= 2 ? '#ff6050' : q.op ? '#ffffff' : '#9fc2d4', side = p.clone().sub(su.P).applyQuaternion(qn).x > 0 ? 'S' : 'P';
          const td = (x: string, w: number, st = '') => `<td style="padding:0 6px 0 0;min-width:${w}px;white-space:nowrap;${st}">${x}</td>`;
          return `<tr>${td(`<span style="color:${c0}">${q.op ? '★' : q.pri >= 2 ? '⚠' : '&nbsp;'} ${q.n}</span>`, 54)}${td(`<span style="color:${fix ? '#5aff8c' : '#ffc85a'}">${fix ? 'FIX' : 'est'}</span> ${f(sx[0])}×${f(sx[2])} m`, 104)}${td(q.cls ? `<span style="color:${q.cls.conf >= 0.6 ? '#8dffbe' : '#7f9fb0'}">${q.cls.name || q.cls.k} ${Math.round(q.cls.conf * 100)}%</span>` : '<span style="color:#5f6f78">?</span>', 96)}${td(`${(r / 1000).toFixed(2)} km ${side}`, 72)}${td(`${Math.round(rv.length())} m/s <span style="color:#7f9fb0">${vc >= 0 ? '+' : ''}${Math.round(vc)}</span>`, 92)}${td(ago < 0 ? '<span style="color:#7f9fb0">not yet</span>' : `<span style="color:${ago > 3 ? '#ffb040' : 'inherit'}">${ago.toFixed(1)} s ago</span>`, 70)}${td(`${Radar.rateOf(q, now).toFixed(1)}/s`, 40, 'color:#7f9fb0')}<td data-hb="a${q.n}" style="padding:0 5px;border:1px solid ${q.quiet ? 'rgba(141,255,190,0.5)' : 'rgba(255,176,64,0.45)'};color:${q.quiet ? '#8dffbe' : '#ffb040'};white-space:nowrap">${q.quiet ? 'LISTEN' : 'ACTIVE'}</td><td style="width:4px"></td><td data-hb="x${q.n}" style="color:#ff8070;padding:0 4px;border:1px solid rgba(255,128,112,0.35)">✕</td></tr>`;
        }).join('');
        return `<br><div style="display:inline-block;padding:3px 9px;border:1px solid rgba(120,180,210,0.18);background:rgba(4,12,18,0.32);border-radius:2px;font-weight:400"><div>TRACKS ${S0.tts.length}${S0.tts.length > 8 ? ' (8 shown)' : ''}${S0.reqs.length ? ' · <span style="color:#ffb040">' + S0.reqs.length + ' waiting</span>' : ''} <span style="font-size:11px;color:#7f9fb0">· shape: spread widest × thinnest · what the camera says it is · speed against us, closing · last seen · looks a second · ACTIVE / LISTEN: radar and camera, or the camera alone (click)</span></div><table style="border-collapse:separate;border-spacing:0 2px;font-size:12px">${rows}</table></div>`;
      })();
      if (H.scanUi.innerHTML !== html) H.scanUi.innerHTML = html;
    }
    // (a radar that's off: its fan not drawn; the one the keys work (or whose box is open) bright and pulsing, the other dim)
    const pickedK = sv.boxes.findIndex((b) => b.sel || b.open);
    su.scans.forEach((sc, i) => { const f = H.fans[i]; if (!f) return; f.visible = sc.mode !== 'off'; (f.material as THREE.MeshBasicMaterial).opacity = pickedK < 0 ? 0.16 : pickedK === i ? 0.3 + 0.1 * Math.sin(now * 5) : 0.06; });
    // radar warning: each radar on her, at the edge the way it is (her warning receiver hears its direction, not its range):
    // a tracker locked on her a pulsing red chevron with a line in to her and LOCK; one sweeping for her amber, TRK; a scanner's
    // beam going over her a brief amber ping, fading
    H.rwrItems = [];
    rwr.forEach((w, i) => {
      H.rwrItems.push({ pos: w.d.clone().normalize().multiplyScalar(R * 1.15), plot: null, label: `RADAR ${w.kind === 'lock' ? 'LOCKED ON US' : w.kind === 'trk' ? 'TRACKING' : 'SEARCHING'} · its bearing: click to send a tracker`, col: w.kind === 'lock' ? '#ff5040' : '#ffb050', rwr: w.d.clone() });
      let m = H.rwr[i];
      if (!m) {
        const cone = new T.Mesh(new T.ConeGeometry(R * 0.06, R * 0.18, 4), new T.MeshBasicMaterial({ color: 0xff3020, transparent: true, depthWrite: false, depthTest: false, blending: T.AdditiveBlending })); cone.renderOrder = 18; H.inner.add(cone);
        const line = new T.Line(new T.BufferGeometry().setFromPoints([new T.Vector3(), new T.Vector3(0, 1, 0)]), new T.LineDashedMaterial({ color: 0xff3020, dashSize: R * 0.04, gapSize: R * 0.03, transparent: true, depthWrite: false })); H.inner.add(line);
        const cv = document.createElement('canvas'); cv.width = 128; cv.height = 48; const tex = new T.CanvasTexture(cv);
        const sp = new T.Sprite(new T.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, depthTest: false })); sp.scale.set(R * 0.38, R * 0.14, 1); sp.renderOrder = 19; H.inner.add(sp);
        m = H.rwr[i] = { cone, line, s: sp, cv, tex, txt: '' };
      }
      const d = w.d.clone().normalize(), edge = d.clone().multiplyScalar(R * 1.15), col = w.kind === 'lock' ? 0xff3020 : 0xffa030;
      const a = w.kind === 'lock' ? 0.65 + 0.35 * Math.sin(now * 14) : w.kind === 'trk' ? 0.85 : Math.max(0, 1 - w.age / 1.2);
      m.cone.visible = m.s.visible = true; m.cone.position.copy(edge); m.cone.quaternion.setFromUnitVectors(new T.Vector3(0, 1, 0), d.clone().negate()); // (its point in toward her)
      (m.cone.material as THREE.MeshBasicMaterial).color.setHex(col); (m.cone.material as THREE.MeshBasicMaterial).opacity = a; m.cone.scale.setScalar(w.kind === 'scan' ? 0.7 + 0.5 * Math.min(1, Math.max(0, w.age / 1.2)) : 1);
      m.line.visible = w.kind !== 'scan'; m.line.scale.setScalar(R * 1.06); m.line.quaternion.setFromUnitVectors(new T.Vector3(0, 1, 0), d); (m.line.material as THREE.LineDashedMaterial).color.setHex(col); (m.line.material as THREE.LineDashedMaterial).opacity = a * 0.8; m.line.computeLineDistances();
      m.s.position.copy(d).multiplyScalar(R * 1.15).add(new T.Vector3(0, R * 0.16, 0)); /* (over its chevron) */ (m.s.material as THREE.SpriteMaterial).opacity = a;
      const txt = w.kind === 'lock' ? 'LOCK' : w.kind === 'trk' ? 'TRK' : 'SRCH';
      if (m.txt !== txt) { m.txt = txt; const x = m.cv.getContext('2d')!; x.clearRect(0, 0, 128, 48); x.font = '500 30px Oxanium, Barlow, system-ui, sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.lineWidth = 3; x.strokeStyle = 'rgba(0,0,0,0.5)'; x.strokeText(txt, 64, 24); x.fillStyle = w.kind === 'lock' ? '#ff5040' : '#ffb050'; x.fillText(txt, 64, 24); m.tex.needsUpdate = true; }
    });
    for (let i = rwr.length; i < H.rwr.length; i++) { const m = H.rwr[i]; m.cone.visible = m.line.visible = m.s.visible = false; }
    // the tracks: each 3D track at its place; each contact no 3D track has, faint at its fan's middle
    const items: HoloItem[] = []; for (const l of H.arcs) l.visible = false; let nv = 0; const qn = su.Q.clone().invert();
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
      // (its velocity against hers, in her frame: a 3D track's whole; one scanner's, only its Doppler's along the line of sight)
      const vr = a.f ? a.f.v.clone().sub(su.V).applyQuaternion(qn) : a.c && a.plot ? pos.clone().sub(su.scans[a.plot.k].at).normalize().multiplyScalar(a.c.vr) : null;
      if (vr && vr.lengthSq() > 1) {
        const l = H.vels[nv] || (() => { const n = new T.Line(new T.BufferGeometry().setAttribute('position', new T.BufferAttribute(new Float32Array(6), 3)), new T.LineBasicMaterial({ transparent: true, depthWrite: false, blending: T.AdditiveBlending })); H.inner.add(n); H.vels.push(n); return n; })(); nv++;
        const e = at(pos.clone().addScaledVector(vr, VT)), pa = l.geometry.attributes.position as THREE.BufferAttribute, s0 = items[items.length - 1].pos;
        pa.setXYZ(0, s0.x, s0.y, s0.z); pa.setXYZ(1, e.x, e.y, e.z); pa.needsUpdate = true; l.geometry.computeBoundingSphere(); l.visible = true; l.layers.set(focus ? 6 : 0);
        (l.material as THREE.LineBasicMaterial).color.setHex(HCOL[a.cls] || 0xffffff); (l.material as THREE.LineBasicMaterial).opacity = a.f ? 0.85 : 0.35;
      }
    }
    for (let i = nv; i < H.vels.length; i++) H.vels[i].visible = false;
    for (let i = items.length; i < H.dots.length; i++) H.dots[i].visible = false;
    // her tracks: a ring round each thing the scheduler keeps, named as its track is (its belief's name: the same as the dot's), on its
    // 3D point if it has one, else where the track's own solution has it (a track found before it has a point: its T name); the
    // operator's white, a threat's red, her own picture's pale. And the camera's line of sight, green, out to what it's looking at
    const X = H as any, xs: { ring: THREE.Mesh; sp: THREE.Sprite; cv: HTMLCanvasElement; tex: THREE.CanvasTexture; txt: string }[] = X.trk || (X.trk = []);
    const mk = () => { const ring = new T.Mesh(new T.RingGeometry(R * 0.042, R * 0.05, 20), new T.MeshBasicMaterial({ color: 0xffffff, transparent: true, depthWrite: false, depthTest: false, side: T.DoubleSide })); ring.renderOrder = 17; H.inner.add(ring);
      const cv = document.createElement('canvas'); cv.width = 320; cv.height = 40; const tex = new T.CanvasTexture(cv), sp = new T.Sprite(new T.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, depthTest: false })); sp.scale.set(R * 1.2, R * 0.15, 1); sp.renderOrder = 19; H.inner.add(sp); return { ring, sp, cv, tex, txt: '' }; };
    let nt = 0;
    if (su.sched) for (const tt of su.sched.tts) {
      const f = tt.bel ? su.fus.find((q) => q.n === tt.bel) : null, ph = f ? f.p.clone() : Radar.ttAt(tt, now).sub(su.P).applyQuaternion(qn), pos = at(ph);
      const m = xs[nt] || (xs[nt] = mk()); nt++; const col = tt.quiet ? 0x8dffbe : tt.pri >= 2 ? 0xff6050 : tt.op ? 0xffffff : 0x9fc2d4; // (listen only: green, the camera's)
      m.ring.visible = m.sp.visible = true; m.ring.position.copy(pos); m.ring.quaternion.copy(faceCam); (m.ring.material as THREE.MeshBasicMaterial).color.setHex(col); (m.ring.material as THREE.MeshBasicMaterial).opacity = 0.9;
      m.sp.position.copy(pos).add(new T.Vector3(R * 0.64, R * 0.06, 0).applyQuaternion(faceCam));
      const txt = `${tt.op ? '★' : tt.pri >= 2 ? '⚠' : ''}${tt.n}${tt.quiet ? ' · listen' : ''}${f ? '' : ' · no 3D point: its own guess'}`; // (no placed belief for it: where its own solution has it)
      if (m.txt !== txt + col) { m.txt = txt + col; const x = m.cv.getContext('2d')!; x.clearRect(0, 0, 320, 40); x.font = '500 22px Oxanium, Barlow, system-ui, sans-serif'; x.textBaseline = 'middle'; x.lineWidth = 3; x.strokeStyle = 'rgba(0,0,0,0.6)'; x.strokeText(txt, 4, 20); x.fillStyle = '#' + col.toString(16).padStart(6, '0'); x.fillText(txt, 4, 20); m.tex.needsUpdate = true; }
    }
    for (let i = nt; i < xs.length; i++) xs[i].ring.visible = xs[i].sp.visible = false;
    { const o = su.opt; let ol: THREE.Line = X.optL; if (!ol) { ol = X.optL = new T.Line(new T.BufferGeometry().setAttribute('position', new T.BufferAttribute(new Float32Array(6), 3)), new T.LineBasicMaterial({ color: 0x5aff8c, transparent: true, opacity: 0.95, depthWrite: false, depthTest: false })); H.inner.add(ol); }
      ol.visible = !!o && !!o.job && o.rng > 0;
      if (ol.visible) { const e = at(o!.b.clone().applyQuaternion(qn).multiplyScalar(o!.rng)), pa = ol.geometry.attributes.position as THREE.BufferAttribute; pa.setXYZ(0, 0, 0, 0); pa.setXYZ(1, e.x, e.y, e.z); pa.needsUpdate = true; ol.geometry.computeBoundingSphere(); ol.renderOrder = 16; } }
    H.items = items;
    // the one pointed at: ringed (facing the viewer), and named
    const p = pick && (pick.rwr ? H.rwrItems.find((q) => q.rwr && q.rwr.angleTo(pick.rwr!) < 0.05) : items.find((q) => q.plot === pick.plot && q.label.split(' ')[0] === pick.label.split(' ')[0]));
    H.sel.visible = !!p && !focus; H.label.visible = !!p;
    if (p) {
      H.sel.position.copy(p.pos); const camQ = new T.Quaternion(); (parent as any).updateWorldMatrix?.(true, false); H.inner.getWorldQuaternion(camQ); H.sel.quaternion.copy(camQ.invert().multiply(G_cam.quaternion)); H.sel.scale.setScalar(1 + 0.15 * Math.sin(now * 8));
      H.label.position.copy(p.pos).add(new T.Vector3(0, R * 0.12, 0).applyQuaternion(rot.clone().invert()));
      if (H.ltext !== p.label + p.col) { H.ltext = p.label + p.col; const x = H.lcv.getContext('2d')!; x.clearRect(0, 0, 512, 96); x.font = '400 32px Oxanium, Barlow, system-ui, sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.lineWidth = 3; x.strokeStyle = 'rgba(0,0,0,0.5)'; x.strokeText(p.label, 256, 48, 500); x.fillStyle = p.col; x.fillText(p.label, 256, 48, 500); H.ltex.needsUpdate = true; }
    }
  }
  const G_cam = { quaternion: new T.Quaternion() };
  // what the operator's pointing at: the item nearest the ray from the middle of their view (within 4 degrees of it)
  function holoPick(ray: THREE.Ray, cam: THREE.Camera): HoloItem | null {
    if (!holoG || !holoG.g.parent) return null; G_cam.quaternion.copy(cam.quaternion);
    let best: HoloItem | null = null, bd = 4 * D2R; const w = new T.Vector3();
    holoG.inner.updateWorldMatrix(true, false);
    for (const it of [...holoG.items, ...holoG.rwrItems]) { w.copy(it.pos).applyMatrix4(holoG.inner.matrixWorld).sub(ray.origin); const a = w.angleTo(ray.direction); if (a < bd) { bd = a; best = it; } }
    return best;
  }
  // where an item of the hologram is in the world (for the operator's cursor's halo round it)
  function holoWorld(it: HoloItem) { if (!holoG) return null; holoG.inner.updateWorldMatrix(true, false); return it.pos.clone().applyMatrix4(holoG.inner.matrixWorld); }
  return { dbg, update, scope, pick, holo, holoPick, holoWorld };
})();
