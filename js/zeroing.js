'use strict';
// The zeroing table (a shop tab; a table in the hangar's workshop): turn each gun's elevation a click at a time and
// see the round's path against the line of sight out to 500 m. The sights sit above the bore, so a round leaves
// below the line, climbs through it (the near zero), peaks, and falls back through it (the far zero). Every gun
// comes zeroed for its class's distance with ball; each click (0.1 mil: a centimetre at 100 m) tips the bore that
// much more (up: it strikes higher). Every load fires from the same tip, so a slower one drops more: pick one here
// to see where it goes. The same sums fly every round (G.flight, G.boreTip, js/player.js fly).
G.ZeroUI = (() => {
  const MAXD = 500, ROWS = [25, 50, 100, 150, 200, 250, 300, 400, 500], MAXC = 150; // (±15 mil)
  const st = { wslot: 'p', am: null };
  const weapon = () => G.Me.weapons[st.wslot] || G.Me.weapons.p || G.Me.weapons.s;
  const loads = (w) => G.AMMO_TYPES[(G.CALIBERS[G.calOf(w.def)] || { group: 'cell' }).group] || [];
  // the path of `am` from this gun with its sights as set (or with `clicks` of elevation instead)
  const path = (w, am, clicks = w.clicks || 0) => G.flight(w.def, am, G.boreTip(Object.assign({}, w, { clicks })), MAXD);
  // where a path crosses the line of sight (metres)
  function crossings(p) {
    const out = [];
    for (let i = 1; i < p.length; i++) if ((p[i - 1].h < 0) !== (p[i].h < 0)) out.push(p[i - 1].d + p[i - 1].h / (p[i - 1].h - p[i].h));
    return out;
  }
  const cm = (h) => `${h > 0 ? '+' : ''}${(h * 100).toFixed(Math.abs(h) < 1 ? 1 : 0)}`;
  const mil = (c) => `${c > 0 ? '+' : c < 0 ? '−' : ''}${Math.abs(c / 10).toFixed(1)} mil`;

  function html() {
    const Me = G.Me, w = weapon();
    if (!w) return '<div class="gs-empty">No weapon to zero.</div>';
    const def = w.def, clicks = w.clicks || 0, std = G.zeroOf(def), ball = G.ballFor(G.calOf(def));
    if (!st.am || !loads(w).includes(st.am)) st.am = w.ammo && loads(w).includes(w.ammo) ? w.ammo : ball;
    const tabs = ['p', 's'].map((k) => { const ww = Me.weapons[k]; return `<button class="tab${st.wslot === k ? ' on' : ''}" data-zw="${k}" ${ww ? '' : 'disabled'}>${k === 'p' ? 'Primary' : 'Sidearm'}: ${ww ? ww.def.name : '—'}</button>`; }).join('');
    if (def.cls === 'RAIL') return `<div class="gs-wrap zr"><div class="gs-tabs">${tabs}</div><div class="zr-note">A railgun's slug flies flat: there's nothing to zero.</div></div>`;
    const am = st.am, p = path(w, am);
    const amBtns = loads(w).map((a) => `<button class="tab${a === am ? ' on' : ''}" data-zam="${a}">${G.AMMO[a].name}</button>`).join('');
    const step = (n, label) => `<button class="tab" data-zc="${n}" ${Math.abs(clicks + n) > MAXC ? 'disabled' : ''}>${label}</button>`;
    const rows = ROWS.map((d) => {
      const q = p[d];
      if (!q) return `<tr class="na"><td>${d} m</td><td colspan="4">spent</td></tr>`;
      const ml = d ? (-q.h / d) * 1000 : 0, moa = ml * 3.438;
      return `<tr><td>${d} m</td><td class="${Math.abs(q.h) < 0.02 ? 'z' : q.h > 0 ? 'hi' : 'lo'}">${cm(q.h)} cm</td><td>${ml >= 0 ? '+' : ''}${ml.toFixed(1)} mil <small>${moa >= 0 ? '+' : ''}${moa.toFixed(1)} MOA</small></td><td>${Math.round(q.v)} m/s</td><td>${q.t.toFixed(2)} s</td></tr>`;
    }).join('');
    const xs = crossings(p), peak = p.reduce((a, q) => (q.h > a.h ? q : a), p[0]), spent = p.length - 1 < MAXD ? p.length - 1 : null;
    return `<div class="gs-wrap zr">
      <div class="gs-tabs">${tabs}</div>
      <div class="zr-row"><span class="zr-l">Load</span><div class="gs-tabs">${amBtns}</div></div>
      <div class="zr-row"><span class="zr-l">Elevation</span><div class="gs-tabs">${step(-10, '−1.0')}${step(-1, '−0.1')}<span class="zr-dial">${mil(clicks)} <small>${clicks > 0 ? '+' : ''}${clicks} click${Math.abs(clicks) === 1 ? '' : 's'} · ${(clicks * 0.3438).toFixed(1)} MOA</small></span>${step(1, '+0.1')}${step(10, '+1.0')}
        ${clicks ? '<button class="tab" data-zc="reset">Reset</button>' : ''}</div></div>
      <div class="zr-note">${def.name}: the sights ${clicks ? `${mil(clicks)} from the standard zero (${std} m with ${G.AMMO[ball].name})` : `at the standard zero, ${std} m with ${G.AMMO[ball].name}`}. ${G.AMMO[am].name} leaves at <b>${Math.round(p[0].v)} m/s</b>;
        it crosses the line of sight at ${xs.length ? xs.map((x) => `<b>${Math.round(x)} m</b>`).join(' and ') : 'no point'}, peaks <b>${cm(peak.h)} cm</b> at ${peak.d} m${spent != null ? `, spent at <b>${spent} m</b>` : ''}.</div>
      <div class="zr-graph"><canvas id="zrCanvas"></canvas></div>
      <table class="zr-table"><tr><th>Range</th><th>Path</th><th>Hold</th><th>Speed</th><th>Time</th></tr>${rows}</table>
      <div class="zr-hint">Each click is 0.1 mil: a centimetre at 100 m, 5 at 500 (+ raises where it strikes). Path: where the round is against the line of sight (+ above). Hold: how far over (+) or under to aim.</div>
    </div>`;
  }
  // the graph: the line of sight, the path (and, faintly, the standard zero's), where it crosses, where it's spent
  function draw() {
    const cv = document.getElementById('zrCanvas'), w = weapon();
    if (!cv || !w) return;
    const r = cv.parentElement.getBoundingClientRect(), dpr = Math.min(2, window.devicePixelRatio || 1);
    cv.width = Math.max(300, r.width) * dpr; cv.height = Math.max(160, r.height) * dpr;
    const g = cv.getContext('2d'), W = cv.width, H = cv.height, L = 52 * dpr, R = 14 * dpr, T = 14 * dpr, B = 28 * dpr;
    const p = path(w, st.am), pz = w.clicks ? path(w, st.am, 0) : null; // (and as it was at the standard zero, faintly)
    let lo = 0, hi = 0;
    for (const q of p.concat(pz || [])) { lo = Math.min(lo, q.h); hi = Math.max(hi, q.h); }
    lo = Math.min(lo, -0.1) * 1.08; hi = Math.max(hi, 0.1) * 1.25;
    const X = (d) => L + (d / MAXD) * (W - L - R), Y = (h) => T + ((hi - h) / (hi - lo)) * (H - T - B);
    g.fillStyle = '#0d1014'; g.fillRect(0, 0, W, H);
    g.font = `${11 * dpr}px monospace`; g.textBaseline = 'middle';
    // grid: every 50 m, and a sensible step in cm
    g.strokeStyle = '#1f262e'; g.lineWidth = 1; g.fillStyle = '#7a8692';
    for (let d = 0; d <= MAXD; d += 50) { g.beginPath(); g.moveTo(X(d), T); g.lineTo(X(d), H - B); g.stroke(); if (d % 100 === 0) { g.textAlign = 'center'; g.fillText(`${d} m`, X(d), H - B / 2); } }
    const span = (hi - lo) * 100, step = [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000].find((s) => span / s <= 8) || 2000;
    g.textAlign = 'right';
    for (let c = Math.ceil(lo * 100 / step) * step; c <= hi * 100; c += step) { const y = Y(c / 100); g.beginPath(); g.moveTo(L, y); g.lineTo(W - R, y); g.stroke(); g.fillText(`${c > 0 ? '+' : ''}${c} cm`, L - 6 * dpr, y); }
    // the line of sight
    g.strokeStyle = '#5a6672'; g.setLineDash([6 * dpr, 4 * dpr]); g.beginPath(); g.moveTo(X(0), Y(0)); g.lineTo(X(MAXD), Y(0)); g.stroke(); g.setLineDash([]);
    const line = (q, col, wd) => { g.strokeStyle = col; g.lineWidth = wd * dpr; g.beginPath(); q.forEach((s, i) => (i ? g.lineTo(X(s.d), Y(s.h)) : g.moveTo(X(s.d), Y(s.h)))); g.stroke(); };
    if (pz) line(pz, 'rgba(255,180,58,0.35)', 1.5);
    line(p, '#ffb43a', 2.2);
    // where it crosses (the zeros), and where it's spent
    g.fillStyle = '#7dff9a'; g.textAlign = 'center';
    crossings(p).forEach((x, i, a) => { const up = i && X(x) - X(a[i - 1]) < 40 * dpr; g.beginPath(); g.arc(X(x), Y(0), 4 * dpr, 0, 7); g.fill(); g.fillText(`${Math.round(x)} m`, X(x), Y(0) + (up ? 14 : -12) * dpr); }); // (two close together: one label under the line)
    if (p.length - 1 < MAXD) { const e = p[p.length - 1]; g.strokeStyle = '#ff6a5a'; g.lineWidth = 2 * dpr; const s = 5 * dpr; g.beginPath(); g.moveTo(X(e.d) - s, Y(e.h) - s); g.lineTo(X(e.d) + s, Y(e.h) + s); g.moveTo(X(e.d) + s, Y(e.h) - s); g.lineTo(X(e.d) - s, Y(e.h) + s); g.stroke(); g.fillStyle = '#ff6a5a'; g.fillText('spent', X(e.d), Y(e.h) + 14 * dpr); }
    g.fillStyle = '#9aa4ae'; g.textAlign = 'right'; g.fillText('bullet elevation vs line of sight', W - R - 6 * dpr, T + 8 * dpr);
  }
  function show(container) {
    container.classList.add('gs-host'); // (the whole panel: G.GunsmithUI.hide takes it off again)
    container.innerHTML = html();
    requestAnimationFrame(draw);
  }
  function refresh() { const el = document.getElementById('shopItems'); if (el) show(el); }
  function onClick(e) {
    const t = e.target, w = weapon();
    const zw = t.closest('[data-zw]'); if (zw && !zw.disabled) { st.wslot = zw.dataset.zw; st.am = null; G.Audio.click(); return refresh(); }
    const za = t.closest('[data-zam]'); if (za) { st.am = za.dataset.zam; G.Audio.click(); return refresh(); }
    const zc = t.closest('[data-zc]');
    if (zc && !zc.disabled && w) {
      w.clicks = zc.dataset.zc === 'reset' ? 0 : Math.max(-MAXC, Math.min(MAXC, (w.clicks || 0) + +zc.dataset.zc));
      if (!w.clicks) delete w.clicks;
      G.Audio.click(); return refresh();
    }
  }
  window.addEventListener('resize', () => { if (document.getElementById('zrCanvas')) draw(); });
  return { show, onClick, refresh, path, state: st };
})();
