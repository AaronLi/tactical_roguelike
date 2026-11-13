'use strict';
// The space direction's panels (docs/space.md): the flight display (where she's going, how far in the right units, how
// long), the waypoints marked on the view, the mission's objective, the sensor station's deck plan, the hangar's missions
// board and shipyard, the light of a jump. All of it made here, on the page, the first time it's wanted.
const G_SpaceUI = (() => {
  const SD = G.SpaceData, T = THREE;
  let made = false, nav: HTMLCanvasElement, navT = 0, hud: HTMLElement, top: HTMLElement, helm: HTMLElement, marks: HTMLElement, obj: HTMLElement, ops: HTMLElement, fl: HTMLElement, plan: HTMLCanvasElement, tab = 'missions', planT = 0;
  let board: ReturnType<typeof G.ShipModel.canvasTex> | null = null;
  const CSS = `
#spHud { position: fixed; inset: 0; z-index: 40; pointer-events: none; font: 500 12px var(--ui-font, system-ui, sans-serif); color: #d7e6f2; letter-spacing: 0.5px; }
#spHud.hidden, #spOps.hidden { display: none; }
#spTop { position: absolute; left: 50%; top: 96px; transform: translateX(-50%); padding: 5px 14px; background: rgba(6, 12, 18, 0.55); border: 1px solid rgba(120, 190, 230, 0.28); border-radius: 3px; text-align: center; white-space: nowrap; }
#spTop b { color: #8fd6ff; font-weight: 600; } #spTop .warn { color: #ffb040; }
#spHelm { position: absolute; left: 50%; bottom: 96px; transform: translateX(-50%); display: flex; gap: 22px; padding: 8px 18px; background: rgba(6, 12, 18, 0.6); border: 1px solid rgba(120, 190, 230, 0.3); border-radius: 3px; }
#spHelm div { text-align: center; } #spHelm small { display: block; color: #7f97a8; font-size: 10px; letter-spacing: 2px; } #spHelm span { font: 600 17px var(--ui-font, system-ui, sans-serif); color: #eaf6ff; }
#spHelm .bad span { color: #ff6a50; } #spHelm .cr span { color: #8fd6ff; }
.sp-mark { position: absolute; transform: translate(-50%, -50%); text-align: center; white-space: nowrap; text-shadow: 0 0 4px #000; }
.sp-mark i { display: block; width: 14px; height: 14px; margin: 0 auto 3px; border: 2px solid #8fd6ff; transform: rotate(45deg); box-sizing: border-box; }
.sp-mark.sel i { border-color: #ffd24a; box-shadow: 0 0 8px #ffd24a; } .sp-mark.sel { color: #ffe9a8; }
.sp-mark.off i { border-radius: 50%; transform: none; opacity: 0.8; } .sp-mark small { display: block; color: #9fb4c4; font-size: 10px; }
#spObj { position: absolute; right: 18px; top: 150px; width: 250px; padding: 9px 12px; background: rgba(6, 12, 18, 0.55); border-left: 2px solid #8fd6ff; }
#spObj h4 { margin: 0 0 4px; font: 600 12px var(--ui-font, system-ui, sans-serif); letter-spacing: 2px; color: #8fd6ff; } #spObj p { margin: 3px 0; line-height: 1.35; }
#spObj .ok { color: #7dff9a; } #spObj .bad { color: #ff6a50; } #spObj .tm { font: 600 20px var(--ui-font, system-ui, sans-serif); color: #ffd24a; }
#spNav { position: absolute; left: 18px; bottom: 214px; width: 288px; border: 1px solid rgba(120, 190, 230, 0.35); background: rgba(3, 8, 12, 0.7); }
.sp-bore { position: absolute; width: 26px; height: 26px; margin: -13px 0 0 -13px; border: 1px solid rgba(143, 214, 255, 0.8); border-radius: 50%; } .sp-bore::after { content: ''; position: absolute; left: 11px; top: 11px; width: 2px; height: 2px; background: #8fd6ff; }
.sp-vel { position: absolute; width: 14px; height: 14px; margin: -7px 0 0 -7px; border: 2px solid #7dff9a; border-radius: 50%; box-sizing: border-box; }
#spPlan { position: absolute; left: 50%; top: 50%; transform: translate(-50%, -54%); width: min(72vw, 900px); border: 1px solid rgba(120, 190, 230, 0.4); background: rgba(3, 8, 12, 0.82); }
#spFlash { position: fixed; inset: 0; z-index: 85; pointer-events: none; background: radial-gradient(circle, #fff 0%, #bfe2ff 45%, #4a8ad0 100%); opacity: 0; }
#spFlash.go { animation: spFlash 0.9s ease-out both; } @keyframes spFlash { 0% { opacity: 1; } 100% { opacity: 0; } }
#spOps { position: fixed; inset: 0; z-index: 60; display: flex; align-items: center; justify-content: center; background: rgba(2, 5, 8, 0.72); font: 400 13px var(--ui-font, system-ui, sans-serif); color: #d7e6f2; }
#spOps .box { width: min(1080px, 94vw); max-height: 90vh; overflow: auto; background: #0b1218; border: 1px solid #2c4658; border-radius: 4px; padding: 18px 22px; }
#spOps h2 { margin: 0; font: 600 18px var(--ui-font, system-ui, sans-serif); letter-spacing: 3px; color: #8fd6ff; } #spOps .hd { display: flex; align-items: center; gap: 16px; margin-bottom: 12px; }
#spOps .tabs button, #spOps button.b { background: #13222d; color: #d7e6f2; border: 1px solid #2c4658; border-radius: 3px; padding: 6px 14px; font: 500 12px var(--ui-font, system-ui, sans-serif); letter-spacing: 1px; cursor: pointer; }
#spOps .tabs button.on { background: #1d4258; border-color: #8fd6ff; } #spOps button.b:hover { border-color: #8fd6ff; } #spOps button.b[disabled] { opacity: 0.4; cursor: default; }
#spOps .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(310px, 1fr)); gap: 12px; }
#spOps .card { border: 1px solid #22394a; border-radius: 3px; padding: 11px 13px; background: #0e1820; display: flex; flex-direction: column; gap: 5px; }
#spOps .card.on { border-color: #ffd24a; background: #1a1c12; } #spOps .card.done { opacity: 0.5; }
#spOps .card h3 { margin: 0; font: 600 15px var(--ui-font, system-ui, sans-serif); color: #eaf6ff; } #spOps .card small { color: #8ea4b4; } #spOps .card p { margin: 0; line-height: 1.4; color: #b9cad6; }
#spOps .pay { color: #7dff9a; font-weight: 600; } #spOps .tag { display: inline-block; padding: 1px 7px; border-radius: 2px; background: #1d3444; color: #8fd6ff; font-size: 11px; letter-spacing: 1px; margin-right: 5px; }
#spOps .tag.r { background: #44201d; color: #ff9a8a; } #spOps .row { display: flex; justify-content: space-between; align-items: center; gap: 10px; margin-top: 4px; } #spOps .foot { margin-top: 12px; color: #8ea4b4; display: flex; justify-content: space-between; }
#spOps select { background: #13222d; color: #d7e6f2; border: 1px solid #2c4658; padding: 4px 6px; border-radius: 3px; max-width: 100%; }
#veil.ftl .veil-shape, #veil.cloud .veil-shape { transform: none !important; animation: none !important; opacity: 0; transition: opacity 0.7s ease-in; }
#veil.ftl path, #veil.cloud path { animation: none !important; } #veil.ftl .veil-load, #veil.cloud .veil-load { display: none; }
#veil.ftl .veil-shape { fill: #061426; } #veil.cloud .veil-shape { fill: #c4ccd2; }
#veil.ftl.on .veil-shape, #veil.cloud.on .veil-shape { opacity: 1; } #veil.ftl.out .veil-shape, #veil.cloud.out .veil-shape { opacity: 0; transition: opacity 0.6s ease-out; }
#veil.ftl::before { content: ''; position: absolute; left: 50%; top: 50%; width: 160vmax; height: 160vmax; margin: -80vmax 0 0 -80vmax; opacity: 0; transition: opacity 0.5s;
  background: repeating-conic-gradient(from 0deg, rgba(190, 225, 255, 0) 0deg 2.2deg, rgba(190, 225, 255, 0.85) 2.5deg 2.8deg, rgba(190, 225, 255, 0) 3.2deg 7deg);
  -webkit-mask-image: radial-gradient(circle, transparent 0 5%, #000 40%); mask-image: radial-gradient(circle, transparent 0 5%, #000 40%); animation: spWarp 0.7s linear infinite; z-index: 1; will-change: transform; }
#veil.ftl::after { content: ''; position: absolute; inset: 0; background: radial-gradient(circle, rgba(255, 255, 255, 0.95) 0%, rgba(150, 205, 255, 0.5) 18%, rgba(20, 50, 100, 0) 55%); opacity: 0; transition: opacity 0.5s; z-index: 2; animation: spPulse 1.1s ease-in-out infinite alternate; will-change: transform; }
#veil.ftl.on::before { opacity: 0.9; } #veil.ftl.on::after { opacity: 1; }
#veil.cloud::before { content: ''; position: absolute; inset: -20%; opacity: 0; transition: opacity 0.6s; z-index: 1; will-change: transform; animation: spDrift 5s linear infinite;
  background: radial-gradient(ellipse 30% 22% at 30% 40%, rgba(255, 255, 255, 0.85), transparent), radial-gradient(ellipse 34% 20% at 70% 62%, rgba(255, 255, 255, 0.75), transparent), radial-gradient(ellipse 26% 18% at 52% 22%, rgba(235, 240, 245, 0.8), transparent); }
#veil.cloud.on::before { opacity: 1; }
@keyframes spWarp { from { transform: scale(1) rotate(0deg); } to { transform: scale(2.4) rotate(7deg); } }
@keyframes spPulse { from { transform: scale(0.9); } to { transform: scale(1.25); } }
@keyframes spDrift { from { transform: translate(8%, 6%); } to { transform: translate(-8%, -6%); } }`;
  function make() {
    if (made) return; made = true;
    const st = document.createElement('style'); st.textContent = CSS; document.head.appendChild(st);
    const el = (id: string, cls?: string, parent: HTMLElement = document.body) => { const e = document.createElement('div'); e.id = id; if (cls) e.className = cls; parent.appendChild(e); return e; };
    hud = el('spHud', 'hidden'); top = el('spTop', '', hud); helm = el('spHelm', '', hud); marks = el('spMarks', '', hud); obj = el('spObj', '', hud);
    nav = document.createElement('canvas'); nav.id = 'spNav'; nav.width = 320; nav.height = 200; hud.appendChild(nav);
    plan = document.createElement('canvas'); plan.id = 'spPlan'; plan.width = 900; plan.height = 520; hud.appendChild(plan);
    fl = el('spFlash'); ops = el('spOps', 'hidden');
    ops.addEventListener('click', (e) => click(e.target as HTMLElement));
    ops.addEventListener('change', (e) => { const s = e.target as HTMLSelectElement; if (s.dataset.slot != null) fit(+s.dataset.slot, s.value || null); });
    window.addEventListener('keydown', (e) => { if (G.Space.S.uiOpen && (e.code === 'Escape' || e.code === 'KeyF' || e.code === 'Tab')) { e.preventDefault(); e.stopPropagation(); closeOps(); } }, true);
  }
  const S = () => G.Space.S;
  function show(on: boolean) { make(); hud.classList.toggle('hidden', !on); if (!on) closeOps(); }
  function flash(k = 1) { make(); fl.classList.remove('go'); void fl.offsetWidth; fl.style.animationDuration = 0.9 * k + 's'; fl.classList.add('go'); }

  // ------------------------------------------------------------------ the flight display
  const _v = new T.Vector3(), _q = new T.Quaternion();
  function update(dt: number) {
    const s = S(); if (!s.on || !made) return;
    const seat = G.Space.mySeat(), flying = !s.docked || !!s.auto, aboard = G.Space.aboard(), wp = s.wps[s.tgt] && !s.wps[s.tgt].hide ? s.wps[s.tgt] : null;
    const speed = s.V.length(), dist = wp ? s.P.distanceTo(wp.p) : 0, close = wp && dist > 1 ? -s.V.dot(_v.copy(s.P).sub(wp.p).normalize()) : 0;
    // the line at the top: for everyone aboard while she's under way
    const showTop = aboard && (flying || !!s.ftl);
    top.style.display = showTop ? '' : 'none';
    if (showTop) {
      const f = s.ftl;
      top.innerHTML = f ? (f.st === 'tunnel' ? `<b>IN TRANSIT</b> · dropping out in ${Math.max(0, f.T - f.t).toFixed(0)} s` : `<b>JUMP DRIVE</b> · ${f.st === 'spool' ? 'spooling ' + Math.round(Math.min(1, f.t / f.T) * 100) + '%' : 'engaged'}`)
        : `<b>${s.cruise ? 'CRUISE' : s.kind === 'assault' && s.stage === 'atmo' ? 'IN ATMOSPHERE' : 'UNDER WAY'}</b>` + (wp ? ` · ${G.U.esc(wp.name)} <b>${SD.dist(dist)}</b>${close > 2 ? ' · ETA ' + SD.eta(dist / close) : ''}` : '') + (s.hp < s.hpMax * 0.5 ? ` · <span class="warn">HULL ${Math.round(s.hp / s.hpMax * 100)}%</span>` : '');
    }
    // the helm's own instruments
    const atHelm = !!seat && seat.k === 'helm';
    helm.style.display = atHelm && !s.docked ? '' : 'none';
    if (atHelm && !s.docked) helm.innerHTML = `<div class="${s.cruise ? 'cr' : ''}"><small>SPEED</small><span>${SD.speed(speed)}</span></div><div><small>TARGET</small><span>${wp ? SD.dist(dist) : '—'}</span></div><div><small>ETA</small><span>${wp && close > 2 ? SD.eta(dist / close) : '--:--'}</span></div><div class="${s.hp < s.hpMax * 0.35 ? 'bad' : ''}"><small>HULL</small><span>${Math.round(s.hp / s.hpMax * 100)}%</span></div>`;
    // the waypoints, where they are on the view (at the edge, a round mark, if they're off it)
    const showMarks = (!!seat && seat.k !== 'jump' || aboard) && flying && !s.ftl;
    marks.style.display = showMarks ? '' : 'none';
    if (showMarks) {
      const cam = G.R.camera, W = window.innerWidth, H = window.innerHeight; let html = '';
      _q.copy(s.Q).invert().premultiply(s.Dq);
      s.wps.forEach((w, i) => {
        if (w.hide) return;
        _v.copy(w.p).sub(s.P).applyQuaternion(_q).add(s.Dp);
        const d = s.P.distanceTo(w.p), behind = _v.clone().applyMatrix4(cam.matrixWorldInverse).z > 0; _v.project(cam);
        let x = (_v.x * 0.5 + 0.5) * W, y = (-_v.y * 0.5 + 0.5) * H, off = behind;
        if (behind) { x = W - x; y = H - y; if (Math.hypot(x - W / 2, y - H / 2) < 60) y = H; } // (astern: its mark at the edge it's nearest round to)
        if (off || x < 40 || x > W - 40 || y < 40 || y > H - 60) { const a = Math.atan2(y - H / 2, x - W / 2); x = W / 2 + Math.cos(a) * (W / 2 - 60); y = H / 2 + Math.sin(a) * (H / 2 - 70); off = true; }
        html += `<div class="sp-mark${i === s.tgt ? ' sel' : ''}${off ? ' off' : ''}" style="left:${x.toFixed(0)}px;top:${y.toFixed(0)}px"><i></i>${G.U.esc(w.name)} · ${SD.dist(d)}${i === s.tgt ? `<small>${G.U.esc(w.sub)}</small>` : ''}</div>`;
      });
      // at the helm: where her nose points, and where she's actually going
      if (atHelm) {
        const pr = (v: THREE.Vector3) => { const b = v.clone().applyMatrix4(cam.matrixWorldInverse).z > 0; v.project(cam); return b ? null : [(v.x * 0.5 + 0.5) * W, (-v.y * 0.5 + 0.5) * H]; };
        const eye = cam.position, b = pr(new T.Vector3(0, 0, -4000).applyQuaternion(s.Dq).add(eye));
        if (b) html += `<div class="sp-bore" style="left:${b[0].toFixed(0)}px;top:${b[1].toFixed(0)}px"></div>`;
        if (speed > 3) { const p = pr(s.V.clone().normalize().multiplyScalar(4000).applyQuaternion(_q).add(eye)); if (p) html += `<div class="sp-vel" style="left:${p[0].toFixed(0)}px;top:${p[1].toFixed(0)}px"></div>`; }
      }
      marks.innerHTML = html;
    }
    // the navigation screen: on the helm's console, and on the glass for whoever has the helm
    nav.style.display = atHelm && !s.docked ? '' : 'none';
    navT -= dt;
    if (navT <= 0 && s.model && (atHelm || aboard)) { navT = atHelm ? 0.05 : 0.5; drawNav(nav); const c2 = s.model.nav.cv.getContext('2d')!; c2.drawImage(nav, 0, 0); s.model.nav.tex.needsUpdate = true; }
    // the sensor station's deck plan: on its screen aboard, and large for whoever sits at it
    const atSens = !!seat && seat.k === 'sensors' && SD.fitted(s.fleet, 'sensors') && s.kind === 'board';
    plan.style.display = atSens ? '' : 'none';
    planT -= dt;
    if (planT <= 0) { planT = atSens ? 0.2 : 1; if (s.model) { drawPlan(s.model.screen.cv, false); s.model.screen.tex.needsUpdate = true; } if (atSens) drawPlan(plan, true); }
    objTick();
  }
  // The navigation screen. Left: a scope, her own nose up, everything with a waypoint on it by bearing and (log) range, the
  // one that's the target ringed. Right: the figures. Close to a breach it's the approach instead: the plate dead ahead is
  // the middle of the rings, the dot her nose's offset from the line into it, the bar her closing speed against what a
  // breach wants (5 to 45 m/s).
  function drawNav(cv: HTMLCanvasElement) {
    const s = S(), c = cv.getContext('2d')!, W = cv.width, H = cv.height;
    c.fillStyle = '#04090d'; c.fillRect(0, 0, W, H); c.textBaseline = 'middle'; c.font = '11px sans-serif'; c.lineWidth = 1;
    const cx = 100, cy = 104, R = 82, inv = s.Q.clone().invert();
    const a = s.kind === 'board' && !(s.state && s.state.boom) ? G.Space.aim(260) : null;
    c.strokeStyle = '#1f4a5e';
    if (a) {
      // the approach: to wherever on her hull the nose is pointed
      const range = a.range, dx = a.dx, dy = a.dy, f = new T.Vector3(0, 0, -1).applyQuaternion(s.Q.clone().premultiply(new T.Quaternion().setFromAxisAngle(new T.Vector3(0, 1, 0), -(a.site.nz > 0 ? 0 : a.site.nz < 0 ? Math.PI : a.site.nx > 0 ? Math.PI / 2 : -Math.PI / 2)))), k = R / 8, close = a.close;
      for (const r of [R, R * 0.5, R * 0.2]) { c.beginPath(); c.arc(cx, cy, r, 0, 7); c.stroke(); }
      c.beginPath(); c.moveTo(cx - R, cy); c.lineTo(cx + R, cy); c.moveTo(cx, cy - R); c.lineTo(cx, cy + R); c.stroke();
      const ok = Math.abs(dy) < 1.6 && a.align > 0.8;
      c.fillStyle = ok ? '#7dff9a' : '#ffb020'; c.beginPath(); c.arc(cx + G.U.clamp(-dx * k, -R, R), cy + G.U.clamp(dy * k, -R, R), 6, 0, 7); c.fill();
      c.strokeStyle = '#8fd6ff'; c.beginPath(); const ax = cx + G.U.clamp(f.x * 160, -R, R), ay = cy - G.U.clamp(f.y * 160, -R, R); c.moveTo(ax - 9, ay); c.lineTo(ax + 9, ay); c.moveTo(ax, ay - 9); c.lineTo(ax, ay + 9); c.stroke();
      c.fillStyle = '#8fd6ff'; c.fillText('BREACH APPROACH', 196, 16);
      c.fillStyle = '#d7e6f2'; c.fillText('range  ' + SD.dist(Math.max(0, range)), 196, 44); c.fillText('off line  ' + Math.hypot(dx, dy).toFixed(1) + ' m', 196, 62); c.fillText('closing  ' + close.toFixed(0) + ' m/s', 196, 80);
      c.fillStyle = close < 4 ? '#ffb020' : close > 45 ? '#ff5a40' : '#7dff9a'; c.fillText(close < 4 ? 'TOO SLOW TO BREACH' : close > 45 ? 'TOO FAST' : ok ? 'CLEAR HULL: GO' : 'SQUARE HER UP', 196, 104);
      c.fillStyle = '#12303e'; c.fillRect(196, 122, 110, 8); c.fillStyle = close > 45 ? '#ff5a40' : '#7dff9a'; c.fillRect(196, 122, G.U.clamp(close / 60, 0, 1) * 110, 8); c.fillStyle = '#d7e6f2'; c.fillRect(196 + 110 * 4 / 60, 119, 1, 14); c.fillRect(196 + 110 * 45 / 60, 119, 1, 14);
      c.fillStyle = '#7f97a8'; c.fillText('dot: nose · cross: heading', 196, 150);
      return;
    }
    for (const r of [R, R * 0.66, R * 0.33]) { c.beginPath(); c.arc(cx, cy, r, 0, 7); c.stroke(); }
    c.beginPath(); c.moveTo(cx, cy - R); c.lineTo(cx, cy + R); c.moveTo(cx - R, cy); c.lineTo(cx + R, cy); c.stroke();
    c.fillStyle = '#8fd6ff'; c.beginPath(); c.moveTo(cx, cy - 6); c.lineTo(cx + 4, cy + 5); c.lineTo(cx - 4, cy + 5); c.fill();
    const wp = s.wps[s.tgt] && !s.wps[s.tgt].hide ? s.wps[s.tgt] : null;
    s.wps.forEach((w, i) => {
      if (w.hide) return;
      const v = w.p.clone().sub(s.P).applyQuaternion(inv), d = v.length(), rr = G.U.clamp(Math.log10(Math.max(10, d)) - 1, 0, 3.4) / 3.4 * R, a = Math.atan2(v.x, -v.z);
      const x = cx + Math.sin(a) * rr, y = cy - Math.cos(a) * rr;
      c.fillStyle = i === s.tgt ? '#ffd24a' : '#8fd6ff'; c.fillRect(x - 3, y - 3, 6, 6);
      c.fillStyle = v.y > d * 0.15 ? '#d7e6f2' : v.y < -d * 0.15 ? '#7f97a8' : 'rgba(0,0,0,0)'; c.fillText(v.y > 0 ? '▲' : '▼', x + 5, y);
      if (i === s.tgt) { c.strokeStyle = '#ffd24a'; c.beginPath(); c.arc(x, y, 8, 0, 7); c.stroke(); c.strokeStyle = '#1f4a5e'; }
    });
    c.fillStyle = '#7f97a8'; c.fillText('100 m', cx + 3, cy - R * 0.33 + 7); c.fillText('1 km', cx + 3, cy - R * 0.62 + 7); c.fillText('10 km', cx + 3, cy - R * 0.91 + 7);
    const speed = s.V.length(), dist = wp ? s.P.distanceTo(wp.p) : 0, close = wp && dist > 1 ? -s.V.dot(s.P.clone().sub(wp.p).normalize()) : 0;
    c.fillStyle = '#8fd6ff'; c.fillText('NAV', 196, 16); c.fillStyle = '#ffd24a'; c.fillText(wp ? wp.name.slice(0, 20) : 'no target', 196, 38);
    c.fillStyle = '#d7e6f2'; c.fillText('range  ' + (wp ? SD.dist(dist) : '—'), 196, 60); c.fillText('speed  ' + SD.speed(speed), 196, 78); c.fillText('closing  ' + SD.speed(Math.max(0, close)), 196, 96); c.fillText('ETA  ' + (wp && close > 2 ? SD.eta(dist / close) : '--:--'), 196, 114);
    c.fillStyle = s.cruise ? '#8fd6ff' : '#7f97a8'; c.fillText(s.cruise ? 'CRUISE DRIVE' : G.Space.clearOf() > 420 ? 'cruise available' : 'too close to cruise', 196, 138);
    const na = G.Space.nearAnchor(); if (na) { c.fillStyle = '#7dff9a'; c.fillText('IN THE ANCHOR: jump ready', 196, 160); }
    c.fillStyle = s.hp < s.hpMax * 0.35 ? '#ff5a40' : '#7f97a8'; c.fillText('hull  ' + Math.round(s.hp / s.hpMax * 100) + '%', 196, 182);
  }
  // a boarded ship's deck, as the scanner has it: the compartments named, the doors (locked ones red), the breach; who's
  // aboard her once the squad's ship is within 900 m
  function drawPlan(cv: HTMLCanvasElement, big: boolean) {
    const s = S(), c = cv.getContext('2d')!, W = cv.width, H = cv.height, map = s.map;
    c.fillStyle = '#04090d'; c.fillRect(0, 0, W, H);
    c.font = `${big ? 13 : 12}px sans-serif`; c.textBaseline = 'middle';
    if (!map || !map.sp || s.kind !== 'board' || !SD.fitted(s.fleet, 'sensors')) { c.fillStyle = '#3d6a80'; c.fillText(s.kind === 'board' ? 'NO SCANNER FITTED' : 'SCANNER: NOTHING IN RANGE', 14, H / 2); return; }
    const sp = map.sp, TS = G.Level.TS, range = s.docked ? 0 : s.P.distanceTo(s.Dp), NF = map.floors ? map.floors.length : 1, FH = G.Level.FLOOR_H;
    if (range > 3000) { c.fillStyle = '#3d6a80'; c.fillText('SCANNER: OUT OF RANGE (' + SD.dist(range) + ')', 14, H / 2); return; }
    // every hull in the scan, her decks one under the other (the top deck first)
    let x0 = 1e9, z0 = 1e9, x1 = -1e9, z1 = -1e9; for (const hh of sp.hulls) { x0 = Math.min(x0, hh.x0); z0 = Math.min(z0, hh.z0); x1 = Math.max(x1, hh.x1); z1 = Math.max(z1, hh.z1); }
    const dz = z1 - z0 + 5, k = Math.min((W - 30) / (x1 - x0 + 8), (H - (big ? 60 : 30)) / (dz * NF)), ox = (W - (x1 - x0) * k) / 2 - x0 * k, oz = (big ? 40 : 18) - z0 * k;
    const X = (x: number) => x * k + ox, Z = (z: number, f = 0) => (z + (NF - 1 - f) * dz) * k + oz, fOf = (y: number) => G.U.clamp(Math.floor((y + 0.6) / FH), 0, NF - 1);
    map.rooms.forEach((rm, i) => {
      const role = sp.roles[i], vac = !!(s.state && s.state.vac.includes(i)), f = rm.fl || 0, own = !sp.hullOf[i];
      c.fillStyle = vac ? '#3a1612' : !own ? '#16201a' : role === 'spine' ? '#10222c' : role === 'bridge' ? '#143246' : role === 'stairs' ? '#2a2a14' : '#0f2a36'; c.strokeStyle = vac ? '#ff6a50' : own ? '#3f88a8' : '#4a7a5a'; c.lineWidth = 1;
      c.fillRect(X(rm.x * TS), Z(rm.z * TS, f), rm.w * TS * k, rm.h * TS * k); c.strokeRect(X(rm.x * TS), Z(rm.z * TS, f), rm.w * TS * k, rm.h * TS * k);
      if (big && role && role !== 'spine' && rm.w * TS * k > 44) { c.fillStyle = vac ? '#ff9a8a' : '#9fd0e6'; c.textAlign = 'center'; c.fillText((G.ShipGen.NAMES[role] || role).toUpperCase(), X((rm.x + rm.w / 2) * TS), Z((rm.z + rm.h / 2) * TS, f)); }
    });
    for (const d of map.doors) { const lk = sp.locks[d.id]; c.fillStyle = lk ? (s.state && s.state.keys.includes(lk) ? '#7dff9a' : '#ff5a40') : d.open ? '#4a7f96' : '#c8e6f4'; const w = d.axis === 'x' ? 2 : 1.3 * k, hh = d.axis === 'x' ? 1.3 * k : 2; c.fillRect(X(d.x) - w / 2, Z(d.z, d.fl || 0) - hh / 2, w, hh); }
    c.strokeStyle = '#ffb020'; c.strokeRect(X(sp.breach.x) - 1.4 * k, Z(sp.breach.face) - 2, 2.8 * k, 4);
    c.fillStyle = '#ffb020'; for (const q of sp.cuts) { const x = (q[0] % map.W + 0.5) * TS, z = (((q[0] / map.W) | 0) + 0.5) * TS; c.beginPath(); c.arc(X(x), Z(z), big ? 6 : 4, 0, 7); c.fill(); if (big) { c.textAlign = 'center'; c.fillText('BREACH', X(x), Z(z) + 14); } }
    const dot = (p: { x: number; z: number; y?: number } | null, col: string, t?: string) => { if (!p) return; const f = fOf(p.y || 0); c.fillStyle = col; c.beginPath(); c.arc(X(p.x), Z(p.z, f), big ? 5 : 3, 0, 7); c.fill(); if (big && t) { c.textAlign = 'left'; c.fillText(t, X(p.x) + 8, Z(p.z, f)); } };
    const o = s.ms ? s.ms.obj : null;
    if (o === 'artifact' && s.state && s.state.art === 0) dot(s.state.artAt ? { x: s.state.artAt[0], z: s.state.artAt[1], y: sp.artifact ? sp.artifact.y : 0 } : sp.artifact, '#40ffd0', 'ARTIFACT');
    if (o === 'destruct') dot(sp.console, '#ffd24a', 'SELF-DESTRUCT');
    for (const p of sp.pods) dot(p, '#7dff9a');
    sp.salvage.forEach((p, n) => { if (!(s.state && (s.state.salv || []).includes(n))) dot(p, '#9cff8a', 'SALVAGE'); });
    if (range < 900) for (const e of G.Views.enemies.values()) { if (!e.alive) continue; c.fillStyle = e.def && e.def.civ ? '#8ea4b4' : s.state && s.state.hvtId === e.id ? '#ff40c0' : '#ff5a40'; c.fillRect(X(e.pos.x) - 2, Z(e.pos.z, fOf(e.pos.y)) - 2, 4, 4); }
    for (const pv of G.Views.players.values()) if (pv.st && !G.SpaceData.aboard(s.def, s.berth, pv.st.p[0], pv.st.p[1], pv.st.p[2])) { c.fillStyle = '#7dff9a'; c.fillRect(X(pv.st.p[0]) - 3, Z(pv.st.p[2], fOf(pv.st.p[1])) - 3, 6, 6); }
    if (big && NF > 1) { c.textAlign = 'left'; c.fillStyle = '#7f97a8'; for (let f = 0; f < NF; f++) c.fillText(f === NF - 1 ? 'UPPER DECK' : 'LOWER DECK', 14, Z(z0, f) + 10); }
    if (big) { c.textAlign = 'left'; c.fillStyle = '#8fd6ff'; c.fillText(`DECK SCAN · ${s.ms ? s.ms.name : ''} · ${range < 900 ? 'life signs resolved' : 'close to 900 m for life signs (' + SD.dist(range) + ')'}`, 14, 18); }
  }

  // ------------------------------------------------------------------ the mission's objective
  function objDraw() { make(); objTick(true); }
  let armAt = 0, armLeft = 0, objKey = '';
  function objTick(force?: boolean) {
    const s = S(), ms = s.ms, st = s.state;
    if (!ms || !st || !s.on || s.kind === 'hub') { if (obj.style.display !== 'none') obj.style.display = 'none'; objKey = ''; return; }
    if (st.arm != null && st.arm !== armLeft) { armLeft = st.arm; armAt = performance.now(); }
    const left = st.arm != null ? Math.max(0, st.arm - (performance.now() - armAt) / 1000) : null;
    const O = SD.OBJ[ms.obj], lines: string[] = [], meta = s.map && s.map.sp;
    if (ms.size && ms.kind === 'board') lines.push(`<small>${SD.SIZES[ms.size].name}: ${meta && meta.decks > 1 ? 'two decks, ' : ''}${(() => { const g = SD.SIZES[ms.size!].guns, a = [g.pd ? g.pd + ' point defence' : '', g.cannon ? g.cannon + ' cannon' : '', g.missile ? g.missile + ' missile launcher' + (g.missile > 1 ? 's' : '') : ''].filter(Boolean); return a.length ? a.join(', ') : 'unarmed'; })()}</small>`);
    const needKey = (k: string) => !!meta && Object.values(meta.locks).includes(k) && !st.keys.includes(k);
    if (ms.kind === 'board' && !st.docked && !st.done && !st.boom) lines.push('Ram her hull nose-on to board: the marked stretch, or anywhere clear.');
    if (ms.obj === 'artifact') lines.push(st.art === 1 ? `<span class="ok">${st.artBy === G.Net.myId ? 'You have' : G.U.esc(G.Game.nameOf(st.artBy || '')) + ' has'} the artifact.</span> Get it to the ship and jump home.` : st.art === 2 ? '<span class="bad">The artifact is lost.</span>' : 'Find the artifact' + (meta && meta.roles.includes('vault') ? ' (the vault)' : '') + ' and take it.');
    if (ms.obj === 'hvt') lines.push(st.hvt === 1 ? '<span class="ok">Target dead.</span> Back to the ship and jump home.' : st.hvt === 2 ? '<span class="ok">Target in restraints.</span> Back to the ship and jump home.' : 'Find the target (the bridge): kill or restrain.');
    if (ms.obj === 'destruct') lines.push(st.boom ? '<span class="ok">She\'s gone.</span> Jump home.' : left != null ? `<span class="tm">${Math.floor(left / 60)}:${String(Math.floor(left % 60)).padStart(2, '0')}</span><br>Get off her: your ship, or an escape pod. Then undock.` : 'Reach the bridge and start the self-destruct.');
    if (ms.obj === 'assault') lines.push(st.cleared ? '<span class="ok">Base under control.</span> Back to the ship, up through the cloud and jump home.' : s.docked ? `Bring the base under control: ${G.Game.enemiesLeft || 0} hostile${G.Game.enemiesLeft === 1 ? '' : 's'} left.` : 'Take her down the descent corridor and set down on the pad.');
    if (needKey('bridge') && (ms.obj !== 'artifact' || (meta && meta.roles.includes('vault')))) lines.push('The bridge' + (meta && meta.roles.includes('vault') ? ' and the vault are' : ' is') + ' locked: an officer carries the card.');
    if (needKey('armory')) lines.push('<small>The armoury is locked: a keycard is with the crew.</small>');
    if (st.keys.length) lines.push('<small class="ok">Keycards: ' + st.keys.map((k) => (k === 'bridge' ? 'bridge' : 'armoury')).join(', ') + '</small>');
    if (meta && G.Me.pos && st.vac.includes(G.ShipGen.roomAt(s.map!, G.Me.pos.x, G.Me.pos.z, G.Level.floorAt(s.map!, G.Me.pos.x, G.Me.pos.y, G.Me.pos.z))) && !G.Space.aboard()) lines.push('<span class="bad">VACUUM</span> · your suit is holding');
    const html = `<h4>${G.U.esc(O.name.toUpperCase())}</h4><p><small>${G.U.esc(ms.name)} · ¢${G.U.fmt(ms.pay)}</small></p>` + lines.map((l) => `<p>${l}</p>`).join('');
    if (force || html !== objKey) { objKey = html; obj.innerHTML = html; }
    obj.style.display = '';
  }

  // ------------------------------------------------------------------ the hangar's board (the picture over the terminal)
  function boardTex() { if (!board) board = G.ShipModel.canvasTex(1024, 468); boardDraw(); return board.tex; }
  function boardDraw() {
    if (!board) return;
    const s = S(), c = board.cv.getContext('2d')!, W = board.cv.width, H = board.cv.height, offers = SD.offers(s.board.seed, s.board.level);
    c.fillStyle = '#060c11'; c.fillRect(0, 0, W, H);
    c.fillStyle = '#8fd6ff'; c.font = '600 34px sans-serif'; c.textBaseline = 'top'; c.fillText('MISSIONS', 28, 20);
    c.fillStyle = '#7f97a8'; c.font = '22px sans-serif'; c.fillText(`${s.board.picked.length} of ${SD.PICKS} taken · press F at the terminal`, 240, 28);
    offers.forEach((m, i) => {
      const y = 82 + i * 62, on = s.board.picked.includes(i), done = s.board.done.includes(i);
      c.fillStyle = done ? '#10161a' : on ? '#2a2a14' : '#0e1820'; c.fillRect(20, y, W - 40, 54);
      c.fillStyle = done ? '#55606a' : on ? '#ffd24a' : '#d7e6f2'; c.font = '600 24px sans-serif'; c.fillText((on ? '▶ ' : '') + m.name, 34, y + 6);
      c.font = '18px sans-serif'; c.fillStyle = done ? '#55606a' : '#8ea4b4'; c.fillText(`${SD.OBJ[m.obj].name} · ${m.where}`, 34, y + 32);
      c.textAlign = 'right'; c.fillStyle = done ? '#55606a' : '#7dff9a'; c.font = '600 24px sans-serif'; c.fillText(done ? 'DONE' : '¢' + G.U.fmt(m.pay), W - 34, y + 14); c.textAlign = 'left';
    });
    board.tex.needsUpdate = true;
  }

  // ------------------------------------------------------------------ the terminal: missions and shipyard
  function openOps() {
    make(); const s = S(); if (s.uiOpen) return;
    s.uiOpen = true; G.Me.keys = {}; G.Me.mouse.l = G.Me.mouse.r = false;
    document.getElementById('pause')!.classList.add('hidden'); document.getElementById('clickToPlay')!.classList.add('hidden');
    G.Game.unlock(); ops.classList.remove('hidden'); opsRender(); G.HUD.setPrompt('');
  }
  function closeOps() {
    const s = S(); if (!made || !s.uiOpen) return;
    s.uiOpen = false; ops.classList.add('hidden');
    if (G.Game.phase === 'level') { G.Game.lock(); setTimeout(() => { if (!G.Game.locked && !G.Game.menuOpen() && G.Game.phase === 'level') document.getElementById('clickToPlay')!.classList.remove('hidden'); }, 300); }
  }
  function opsRender() {
    if (!made || !S().uiOpen) return;
    const s = S(), esc = G.U.esc, cr = G.Me.credits || 0;
    let body = '';
    if (tab === 'missions') {
      const offers = SD.offers(s.board.seed, s.board.level), full = s.board.picked.length >= SD.PICKS;
      body = '<div class="grid">' + offers.map((m, i) => {
        const on = s.board.picked.includes(i), done = s.board.done.includes(i), d = Math.hypot(m.anchor[0], Math.max(m.anchor[1], 900), m.anchor[2]);
        return `<div class="card${on ? ' on' : ''}${done ? ' done' : ''}"><div class="row"><h3>${esc(m.name)}</h3><span class="pay">¢${G.U.fmt(m.pay)}</span></div>
          <div><span class="tag${m.kind === 'assault' ? ' r' : ''}">${m.kind === 'assault' ? 'PLANET ASSAULT' : 'BOARDING'}</span><span class="tag">${esc(SD.OBJ[m.obj].name.toUpperCase())}</span><span class="tag">THREAT ${m.diff}</span>${m.night ? '<span class="tag">NIGHT</span>' : ''}</div>
          <small>${esc(m.where)} · anchor ${SD.dist(d)} out · jump ${m.ly.toFixed(1)} ly</small><p>${esc(m.brief)}</p>
          <div class="row"><small>${m.size === 'capital' ? 'Two decks, security squads, cannon and missiles on her hull: the hardest there is.' : m.size === 'large' ? 'Barracks, sick bay, magazines, a vault, a big bridge: a long fight.' : m.size === 'medium' ? 'An armoury and a locked bridge: find the keycards.' : m.size === 'small' ? 'A few compartments off one corridor, one gun on her hull.' : m.size === 'transport' ? 'Civilian: a few guards, no guns on her hull.' : 'Set down on the pad outside.'}</small>
          <button class="b" data-pick="${i}"${done || (!on && full) || !s.docked ? ' disabled' : ''}>${done ? 'DONE' : on ? 'DROP' : 'TAKE'}</button></div></div>`;
      }).join('') + `</div><div class="foot"><span>Take up to ${SD.PICKS}. Each has an anchor out past the rock: fly to it, hold J at the helm to jump. Pay comes when the mission is done and you have jumped home.</span><span>${s.board.picked.length} / ${SD.PICKS}</span></div>`;
    } else {
      const F = s.fleet, d = SD.SHIPS[F.ship], fitNow = F.fit[F.ship] || [];
      body = '<div class="grid">' + Object.values(SD.SHIPS).map((sh) => {
        const own = F.owned.includes(sh.id), use = F.ship === sh.id;
        return `<div class="card${use ? ' on' : ''}"><div class="row"><h3>${esc(sh.name)}</h3><span class="pay">${own ? (use ? 'ON THE PAD' : 'OWNED') : '¢' + G.U.fmt(sh.price)}</span></div>
          <div><span class="tag">${esc(sh.cls.toUpperCase())}</span><span class="tag">${sh.turrets} HARDPOINT${sh.turrets > 1 ? 'S' : ''}</span><span class="tag">${sh.utils} BAY${sh.utils > 1 ? 'S' : ''}</span></div>
          <small>hull ${sh.hull} · ${sh.speed} m/s · cruise ${(sh.cruise / 1000).toFixed(1)} km/s · ${2 + sh.turrets + sh.jump} seats</small><p>${esc(sh.blurb)}</p>
          <div class="row"><span></span>${use ? '' : own ? `<button class="b" data-use="${sh.id}"${s.docked ? '' : ' disabled'}>BRING HER OUT</button>` : `<button class="b" data-buy="${sh.id}"${cr >= sh.price ? '' : ' disabled'}>BUY</button>`}</div></div>`;
      }).join('') + '</div><h2 style="margin:16px 0 8px;font-size:14px">' + esc(d.name.toUpperCase()) + ': HARDPOINTS AND BAYS</h2><div class="grid">';
      for (let i = 0; i < d.turrets + d.utils; i++) {
        const slot = i < d.turrets ? 'turret' : 'util', cur = fitNow[i] || '';
        const opts = Object.values(SD.EQUIP).filter((e) => e.slot === slot && (e.id === cur || slot === 'turret' || !fitNow.includes(e.id)));
        body += `<div class="card"><div class="row"><h3>${slot === 'turret' ? 'Hardpoint ' + (i + 1) : 'Bay ' + (i - d.turrets + 1)}</h3></div>
          <select data-slot="${i}"${s.docked ? '' : ' disabled'}><option value="">— empty —</option>${opts.map((e) => `<option value="${e.id}"${e.id === cur ? ' selected' : ''}${e.id !== cur && cr < e.price ? ' disabled' : ''}>${esc(e.name)}${e.id === cur || !e.price ? '' : ' · ¢' + G.U.fmt(e.price)}</option>`).join('')}</select>
          <p>${cur ? esc(SD.EQUIP[cur].blurb) : 'Nothing fitted.'}</p></div>`;
      }
      body += '</div><div class="foot"><span>What\'s fitted is paid for as it goes on. A hardpoint\'s gun is fired from the turret seat under it; the scanner is read at the sensor station.</span><span></span></div>';
    }
    ops.innerHTML = `<div class="box"><div class="hd"><h2>OPERATIONS</h2><div class="tabs"><button data-tab="missions" class="${tab === 'missions' ? 'on' : ''}">MISSIONS</button> <button data-tab="yard" class="${tab === 'yard' ? 'on' : ''}">SHIPYARD</button></div><span style="flex:1"></span><span class="pay">¢${G.U.fmt(cr)}</span><button class="b" data-close="1">CLOSE</button></div>${body}</div>`;
  }
  function click(t: HTMLElement) {
    const b = t.closest<HTMLElement>('button'); if (!b || (b as HTMLButtonElement).disabled) { if (t === ops) closeOps(); return; }
    const d = b.dataset;
    if (d.close) closeOps();
    else if (d.tab) { tab = d.tab; opsRender(); }
    else if (d.pick != null) { G.Net.toHost({ t: 'mpick', i: +d.pick }); G.Audio.click(); }
    else if (d.buy) { const sh = SD.SHIPS[d.buy]; if (sh && G.Me.credits >= sh.price) { G.Me.credits -= sh.price; G.Net.toHost({ t: 'fbuy', id: sh.id }); G.Audio.buy(); } }
    else if (d.use) { G.Net.toHost({ t: 'fuse', id: d.use }); G.Audio.click(); }
  }
  function fit(slot: number, id: string | null) {
    const e = id ? SD.EQUIP[id] : null;
    if (e && e.price) { if (G.Me.credits < e.price) { opsRender(); return; } G.Me.credits -= e.price; G.Audio.buy(); }
    G.Net.toHost({ t: 'ffit', s: slot, id });
  }
  return { show, update, flash, openOps, closeOps, opsRender, boardTex, boardDraw, objDraw };
})();
G.SpaceUI = G_SpaceUI;
interface GameModules { SpaceUI: typeof G_SpaceUI; }
