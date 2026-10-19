'use strict';
// Item icons for the inventory and the shop: little drawings made on a canvas, cached as images.
// G.Icons.of(item, w, h, rot) -> data URL for an item shown w x h cells (rot: shown turned, so the drawing is
// turned with it). Magazines look like the gun's (curved rifle, straight pistol, drum, belt box, speedloader,
// en-bloc clip), ammo boxes carry their caliber and a stripe in the ammo type's colour, and gear is drawn by
// kind (a soft vest, a plate carrier with its pouches, a chest rig, a plate, a helmet, a belt, a backpack).
// Guns are the weapon's own 3D model (as built, parts and all), rendered side-on once and kept.
G.Icons = (() => {
  const CELL = 64, cache = new Map();
  const TYPE_COL = { ball: '#c9a14a', hp: '#e0604a', ap: '#4a90e0', tracer: '#ff6a2a', subsonic: '#9aa4ac', buck: '#c03a2a', slug: '#e8c050', birdshot: '#8ab040', flechette: '#4a90e0', he: '#c8b040', broadhead: '#8a6a40', railslug: '#40c8e0' };

  function rr(g, x, y, w, h, r) { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }
  function shade(g, x, y, w, h) { const gr = g.createLinearGradient(x, y, x + w, y); gr.addColorStop(0, 'rgba(255,255,255,0.18)'); gr.addColorStop(0.5, 'rgba(255,255,255,0)'); gr.addColorStop(1, 'rgba(0,0,0,0.25)'); g.fillStyle = gr; g.fill(); }
  // a cartridge standing up: case, shoulder, bullet
  function round(g, x, y, w, h, tip = '#b87333', caseCol = '#c9a14a') {
    g.fillStyle = caseCol; g.fillRect(x, y + h * 0.35, w, h * 0.65);
    g.fillStyle = tip; g.beginPath(); g.moveTo(x, y + h * 0.36); g.quadraticCurveTo(x + w / 2, y - h * 0.05, x + w, y + h * 0.36); g.fill();
  }

  // ---------------------------------------------------------------- magazines
  function magStyle(def) {
    const plat = G.Gunsmith.PLATFORMS[def.id], cal = G.calOf(def);
    if (G.beltFed(def)) return 'box';
    if (plat && plat.arch === 'revolver') return 'loader';
    if (def.enbloc) return 'clip';
    if (def.id === 'p90') return 'p90';
    if (def.id === 'thompson' || def.id === 'ppsh') return 'drum';
    if (def.cls === 'PST' || def.cls === 'MP') return 'pistol';
    if (def.cls === 'SMG') return def.id.startsWith('mp5') ? 'curved' : 'straight';
    if (cal === '7.62/39' || cal === '5.6/39' || cal === '7.62/54') return 'banana';
    return def.mag > 20 ? 'curved' : 'straight';
  }
  function drawMag(g, W, H, it) {
    const def = G.WEAPONS[it.wid] || {}, full = it.n > 0, am = TYPE_COL[it.am] || TYPE_COL.ball;
    // the variant's own shape: a drum for a drum, a box for a stick magazine on a drum gun
    const vp = it.vid && G.Gunsmith.PARTS[it.vid], vt = vp && vp.model && vp.model.mag && vp.model.mag.t;
    let st = magStyle(def);
    if (vt === 'drum' && st !== 'box') st = 'drum'; else if (st === 'drum' && vt && vt !== 'drum') st = 'straight';
    const body = def.id === 'ak' ? '#7a3a22' : def.id === 'g36' || def.id === 'aug' ? 'rgba(170,190,185,0.85)' : '#2a2c2e';
    g.lineWidth = 2; g.strokeStyle = 'rgba(0,0,0,0.6)';
    if (st === 'box') { // an ammo can with a belt hanging out
      rr(g, W * 0.12, H * 0.25, W * 0.76, H * 0.6, 6); g.fillStyle = '#4d5639'; g.fill(); shade(g, W * 0.12, H * 0.25, W * 0.76, H * 0.6); g.stroke();
      g.fillStyle = '#3a4229'; g.fillRect(W * 0.3, H * 0.15, W * 0.4, H * 0.12);
      if (full) for (let i = 0; i < 6; i++) round(g, W * 0.18 + i * W * 0.11, H * 0.06, W * 0.07, H * 0.22, '#b87333', am);
      return;
    }
    if (st === 'loader') { // six rounds in a ring
      g.fillStyle = '#1c1c1e'; g.beginPath(); g.arc(W / 2, H / 2, W * 0.36, 0, 7); g.fill();
      for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2; g.fillStyle = full ? am : '#555'; g.beginPath(); g.arc(W / 2 + Math.cos(a) * W * 0.2, H / 2 + Math.sin(a) * W * 0.2, W * 0.08, 0, 7); g.fill(); g.fillStyle = 'rgba(0,0,0,0.4)'; g.beginPath(); g.arc(W / 2 + Math.cos(a) * W * 0.2, H / 2 + Math.sin(a) * W * 0.2, W * 0.03, 0, 7); g.fill(); }
      g.fillStyle = '#8a8f94'; g.beginPath(); g.arc(W / 2, H / 2, W * 0.07, 0, 7); g.fill();
      return;
    }
    if (st === 'clip') { // an en-bloc clip of rounds
      for (let i = 0; i < 4; i++) round(g, W * 0.2 + i * W * 0.15, H * 0.12, W * 0.12, H * 0.62, full ? '#b87333' : '#555', full ? am : '#555');
      g.fillStyle = '#5a5f62'; g.fillRect(W * 0.16, H * 0.68, W * 0.68, H * 0.14);
      return;
    }
    if (st === 'drum') {
      g.fillStyle = '#25282c'; g.beginPath(); g.arc(W / 2, H * 0.55, W * 0.38, 0, 7); g.fill(); g.stroke();
      g.fillStyle = '#3a3e44'; g.beginPath(); g.arc(W / 2, H * 0.55, W * 0.14, 0, 7); g.fill();
      g.fillStyle = '#25282c'; g.fillRect(W * 0.4, H * 0.08, W * 0.2, H * 0.2);
      if (full) round(g, W * 0.43, H * 0.02, W * 0.14, H * 0.12, '#b87333', am);
      return;
    }
    if (st === 'p90') {
      rr(g, W * 0.1, H * 0.3, W * 0.8, H * 0.4, 5); g.fillStyle = 'rgba(160,175,170,0.7)'; g.fill(); g.stroke();
      if (full) for (let i = 0; i < 9; i++) { g.fillStyle = am; g.fillRect(W * 0.14 + i * W * 0.08, H * 0.38, W * 0.05, H * 0.24); }
      return;
    }
    // box magazines: curved (STANAG), banana (AK), straight, slim pistol
    const top = H * 0.12, bot = H * 0.9, mw = st === 'pistol' ? W * 0.32 : W * 0.42, x0 = W / 2 - mw / 2;
    const curve = st === 'banana' ? W * 0.34 : st === 'curved' ? W * 0.14 : 0;
    g.beginPath();
    g.moveTo(x0, top); g.lineTo(x0 + mw, top);
    g.quadraticCurveTo(x0 + mw + curve * 0.4, (top + bot) / 2, x0 + mw + curve, bot);
    g.lineTo(x0 + curve, bot);
    g.quadraticCurveTo(x0 + curve * 0.4, (top + bot) / 2, x0, top);
    g.closePath(); g.fillStyle = body; g.fill(); shade(g, x0, top, mw + curve, bot - top); g.stroke();
    g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(x0 + curve - 2, bot - H * 0.05, mw + 4, H * 0.06); // baseplate
    if (st !== 'pistol') for (let i = 1; i < 4; i++) { g.fillStyle = 'rgba(255,255,255,0.07)'; g.fillRect(x0 + curve * (i / 4) * 0.6 + 3, top + (bot - top) * i / 4, mw - 6, 2); }
    if (full) round(g, W / 2 - mw * 0.25, top - H * 0.09, mw * 0.5, H * 0.12, '#b87333', am);
  }

  // ---------------------------------------------------------------- ammo boxes
  function drawAmmo(g, W, H, it) {
    const C = G.CALIBERS[it.key] || { name: '?', group: 'rifle' }, col = TYPE_COL[it.am] || '#c9a14a';
    if (C.group === 'shotgun') { // shells
      for (let i = 0; i < 3; i++) { const x = W * 0.16 + i * W * 0.24; g.fillStyle = it.am === 'slug' ? '#d8c040' : it.am === 'flechette' ? '#3a6ab0' : '#b02a22'; rr(g, x, H * 0.18, W * 0.18, H * 0.52, 3); g.fill(); g.fillStyle = '#c9a14a'; g.fillRect(x, H * 0.62, W * 0.18, H * 0.16); }
    } else if (C.group === 'grenade') {
      for (let i = 0; i < 2; i++) { const y = H * 0.1 + i * H * 0.45; g.fillStyle = '#c8b040'; rr(g, W * 0.25, y, W * 0.5, H * 0.28, 8); g.fill(); g.fillStyle = '#b0b4b8'; g.fillRect(W * 0.25, y + H * 0.22, W * 0.5, H * 0.1); }
    } else if (C.group === 'bolt') {
      for (let i = 0; i < 3; i++) { const x = W * 0.3 + i * W * 0.18; g.fillStyle = '#6a4a2a'; g.fillRect(x, H * 0.15, 3, H * 0.7); g.fillStyle = '#c0c4c8'; g.beginPath(); g.moveTo(x - 4, H * 0.2); g.lineTo(x + 1.5, H * 0.06); g.lineTo(x + 7, H * 0.2); g.fill(); g.fillStyle = '#d04a3a'; g.fillRect(x - 3, H * 0.78, 9, H * 0.08); }
    } else { // a cardboard box, a stripe in the type's colour, two rounds on top
      rr(g, W * 0.12, H * 0.32, W * 0.76, H * 0.56, 4); g.fillStyle = '#b0915e'; g.fill(); shade(g, W * 0.12, H * 0.32, W * 0.76, H * 0.56);
      g.fillStyle = col; g.fillRect(W * 0.12, H * 0.62, W * 0.76, H * 0.12);
      for (let i = 0; i < 3; i++) round(g, W * 0.3 + i * W * 0.14, H * 0.08, W * 0.1, H * 0.28, it.am === 'ap' ? '#2a2a2a' : it.am === 'tracer' ? '#c03020' : it.am === 'hp' ? '#d8b070' : '#b87333');
    }
    g.fillStyle = '#fff'; g.font = `bold ${Math.round(Math.min(W, H) * 0.17)}px Consolas, monospace`; g.textAlign = 'center';
    g.shadowColor = '#000'; g.shadowBlur = 3;
    g.fillText(C.name.replace(' gauge', 'G').replace('crossbow ', ''), W / 2, H * 0.55);
    g.shadowBlur = 0;
  }

  // ---------------------------------------------------------------- the rest
  // medical items, by type
  function drawMedItem(g, W, H, mt) {
    if (mt === 'tourniquet') { // a black strap and windlass, a red tab
      g.strokeStyle = '#1c1c1e'; g.lineWidth = W * 0.12; g.beginPath(); g.arc(W / 2, H * 0.55, W * 0.26, 0, 7); g.stroke();
      g.fillStyle = '#3a3d40'; g.fillRect(W * 0.2, H * 0.24, W * 0.6, H * 0.1); g.fillStyle = '#d03a2a'; g.fillRect(W * 0.68, H * 0.7, W * 0.18, H * 0.14); return;
    }
    if (mt === 'gauze') { rr(g, W * 0.16, H * 0.2, W * 0.68, H * 0.6, 4); g.fillStyle = '#3d5a3a'; g.fill(); g.fillStyle = '#e8e4da'; g.fillRect(W * 0.26, H * 0.36, W * 0.48, H * 0.28); g.fillStyle = '#c0302a'; g.font = `bold ${Math.round(H * 0.22)}px Consolas, monospace`; g.textAlign = 'center'; g.fillText('H', W / 2, H * 0.58); return; }
    if (mt === 'seal') { rr(g, W * 0.18, H * 0.18, W * 0.64, H * 0.64, 6); g.fillStyle = '#e0dcd2'; g.fill(); g.strokeStyle = '#c0302a'; g.lineWidth = 3; g.beginPath(); g.arc(W / 2, H / 2, W * 0.17, 0, 7); g.stroke(); return; }
    if (mt === 'splint') { rr(g, W * 0.3, H * 0.06, W * 0.4, H * 0.88, 6); g.fillStyle = '#e07a2a'; g.fill(); shade(g, W * 0.3, H * 0.06, W * 0.4, H * 0.88); g.fillStyle = 'rgba(0,0,0,0.25)'; for (let i = 1; i < 6; i++) g.fillRect(W * 0.3, H * (0.06 + i * 0.146), W * 0.4, 2); return; }
    if (mt === 'bloodbag') { // a clear bag of dark red, its label and the line out of the bottom
      rr(g, W * 0.18, H * 0.08, W * 0.64, H * 0.66, 6); g.fillStyle = 'rgba(220,220,225,0.85)'; g.fill();
      rr(g, W * 0.24, H * 0.22, W * 0.52, H * 0.48, 4); g.fillStyle = '#7a0d12'; g.fill(); shade(g, W * 0.24, H * 0.22, W * 0.52, H * 0.48);
      g.fillStyle = '#e8e4da'; g.fillRect(W * 0.32, H * 0.3, W * 0.36, H * 0.1);
      g.fillStyle = '#c8c8cc'; g.fillRect(W * 0.46, H * 0.06, W * 0.08, H * 0.05);
      g.strokeStyle = '#b0b0b8'; g.lineWidth = 2; g.beginPath(); g.moveTo(W * 0.5, H * 0.74); g.quadraticCurveTo(W * 0.5, H * 0.9, W * 0.7, H * 0.94); g.stroke(); return;
    }
    if (mt === 'pills') { rr(g, W * 0.3, H * 0.28, W * 0.4, H * 0.56, 4); g.fillStyle = '#e8e4da'; g.fill(); g.fillStyle = '#4a7ab0'; g.fillRect(W * 0.28, H * 0.16, W * 0.44, H * 0.14); g.fillRect(W * 0.34, H * 0.48, W * 0.32, H * 0.14); return; }
    // a bandage: a white roll
    g.fillStyle = '#e8e4da'; g.beginPath(); g.ellipse(W / 2, H / 2, W * 0.3, H * 0.3, 0, 0, 7); g.fill(); shade(g, W * 0.2, H * 0.2, W * 0.6, H * 0.6);
    g.fillStyle = '#c8c2b4'; g.beginPath(); g.ellipse(W / 2, H / 2, W * 0.1, H * 0.1, 0, 0, 7); g.fill();
    g.fillStyle = '#e8e4da'; g.fillRect(W * 0.5, H * 0.72, W * 0.36, H * 0.08);
  }
  function drawMed(g, W, H) {
    rr(g, W * 0.14, H * 0.2, W * 0.72, H * 0.62, 7); g.fillStyle = '#e8e4da'; g.fill(); shade(g, W * 0.14, H * 0.2, W * 0.72, H * 0.62);
    g.fillStyle = '#c0302a'; g.fillRect(W * 0.43, H * 0.32, W * 0.14, H * 0.38); g.fillRect(W * 0.31, H * 0.44, W * 0.38, H * 0.14);
  }
  function drawFrag(g, W, H) {
    g.fillStyle = '#4a5a32'; g.beginPath(); g.ellipse(W / 2, H * 0.58, W * 0.26, H * 0.3, 0, 0, 7); g.fill(); shade(g, W * 0.24, H * 0.28, W * 0.52, H * 0.6);
    g.fillStyle = '#8a8f94'; g.fillRect(W * 0.42, H * 0.18, W * 0.16, H * 0.14);
    g.strokeStyle = '#8a8f94'; g.lineWidth = 3; g.beginPath(); g.moveTo(W * 0.56, H * 0.22); g.lineTo(W * 0.7, H * 0.5); g.stroke();
    g.beginPath(); g.arc(W * 0.36, H * 0.22, W * 0.07, 0, 7); g.stroke();
  }
  const GEAR_COL = (d) => (d.brand && /Sable|Paragon/.test(d.brand) ? '#5a5240' : /Kestrel|Vantage/.test(d.brand || '') ? '#4d5639' : '#2e3236');
  function drawCarrier(g, W, H, d) {
    const col = d.id === 'c.ghost' ? '#3a3d40' : GEAR_COL(d);
    // vest silhouette: shoulders, neck cut-out, body
    g.beginPath();
    g.moveTo(W * 0.2, H * 0.12); g.lineTo(W * 0.38, H * 0.12); g.quadraticCurveTo(W * 0.5, H * 0.3, W * 0.62, H * 0.12); g.lineTo(W * 0.8, H * 0.12);
    g.lineTo(W * 0.84, H * 0.86); g.lineTo(W * 0.16, H * 0.86); g.closePath();
    g.fillStyle = d.dur ? col : 'rgba(0,0,0,0)'; g.fill(); if (d.dur) shade(g, W * 0.16, H * 0.12, W * 0.68, H * 0.74);
    if (!d.dur) { g.strokeStyle = col; g.lineWidth = 4; g.stroke(); } // a rig: just the straps
    // its MOLLE webbing and the pouches it's issued with, where they're mounted
    if (d.molle) molle(g, d, W * 0.2, H * 0.48, W * 0.6, H * 0.36);
    if (d.plate) { g.strokeStyle = 'rgba(255,255,255,0.15)'; g.lineWidth = 2; rr(g, W * 0.32, H * 0.2, W * 0.36, H * 0.24, 4); g.stroke(); }
  }
  function drawPlate(g, W, H, d) {
    g.beginPath(); g.moveTo(W * 0.22, H * 0.22); g.lineTo(W * 0.36, H * 0.1); g.lineTo(W * 0.64, H * 0.1); g.lineTo(W * 0.78, H * 0.22); g.lineTo(W * 0.78, H * 0.9); g.lineTo(W * 0.22, H * 0.9); g.closePath();
    g.fillStyle = d.id === 'p.steel' ? '#6a6f74' : d.id === 'p.soft' ? '#3a3d40' : d.id === 'p.pe' ? '#c8c8c0' : '#2e3236'; g.fill(); shade(g, W * 0.22, H * 0.1, W * 0.56, H * 0.8);
    g.fillStyle = 'rgba(255,255,255,0.7)'; g.font = `bold ${Math.round(W * 0.13)}px Consolas, monospace`; g.textAlign = 'center';
    const lvl = d.name.match(/\(([^)]+)\)/) || d.name.match(/^(IIIA)/);
    g.fillText(lvl ? lvl[1] : '', W / 2, H * 0.6);
  }
  function drawHelmet(g, W, H, d) {
    g.fillStyle = d.id === 'h.bump' ? '#3a3d40' : d.id === 'h.fast' ? '#5a5240' : '#3d4232';
    g.beginPath(); g.moveTo(W * 0.12, H * 0.72); g.quadraticCurveTo(W * 0.14, H * 0.12, W * 0.55, H * 0.14); g.quadraticCurveTo(W * 0.9, H * 0.18, W * 0.88, H * 0.66); g.lineTo(W * 0.66, H * 0.62); g.lineTo(W * 0.62, H * 0.72); g.closePath(); g.fill(); shade(g, W * 0.12, H * 0.12, W * 0.78, H * 0.6);
    g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(W * 0.22, H * 0.5, W * 0.14, H * 0.1); // rail / ear cut
    if (d.stop && d.stop.face) { g.fillStyle = 'rgba(120,150,170,0.55)'; g.beginPath(); g.moveTo(W * 0.6, H * 0.4); g.lineTo(W * 0.92, H * 0.42); g.lineTo(W * 0.88, H * 0.92); g.lineTo(W * 0.62, H * 0.86); g.closePath(); g.fill(); }
  }
  // a face shield (a tinted polycarbonate shield with its mounting arms) or a mandible (a curved guard
  // round the jaw); on: drawn onto a helmet's icon
  function drawFace(g, W, H, d, on) {
    const ox = on ? W * 0.18 : 0, s = on ? 0.8 : 1, X = (v) => ox + v * W * s, Y = (v) => (on ? H * 0.18 : 0) + v * H * s;
    if (d.cover < 0.9) {
      g.fillStyle = '#5a6168'; g.beginPath(); g.moveTo(X(0.18), Y(0.42)); g.quadraticCurveTo(X(0.2), Y(0.88), X(0.5), Y(0.9)); g.quadraticCurveTo(X(0.8), Y(0.88), X(0.82), Y(0.42));
      g.lineTo(X(0.7), Y(0.46)); g.quadraticCurveTo(X(0.68), Y(0.76), X(0.5), Y(0.76)); g.quadraticCurveTo(X(0.32), Y(0.76), X(0.3), Y(0.46)); g.closePath(); g.fill();
      g.fillStyle = 'rgba(0,0,0,0.4)'; for (let i = 0; i < 4; i++) g.fillRect(X(0.36 + i * 0.08), Y(0.8), W * 0.03 * s, H * 0.04 * s); // vents
      return;
    }
    g.fillStyle = d.id === 'f.rifle' ? 'rgba(90,110,120,0.85)' : 'rgba(130,170,190,0.6)';
    g.beginPath(); g.moveTo(X(0.2), Y(0.2)); g.quadraticCurveTo(X(0.5), Y(0.1), X(0.8), Y(0.2)); g.lineTo(X(0.84), Y(0.72)); g.quadraticCurveTo(X(0.5), Y(0.96), X(0.16), Y(0.72)); g.closePath(); g.fill();
    g.strokeStyle = '#1e2124'; g.lineWidth = 2; g.stroke();
    g.fillStyle = 'rgba(255,255,255,0.25)'; g.fillRect(X(0.3), Y(0.26), W * 0.12 * s, H * 0.3 * s); // glare
    g.fillStyle = '#1e2124'; g.fillRect(X(0.12), Y(0.18), W * 0.08 * s, H * 0.14 * s); g.fillRect(X(0.8), Y(0.18), W * 0.08 * s, H * 0.14 * s); // the arms
  }
  function drawBelt(g, W, H, d) {
    g.fillStyle = '#2a2c2e'; g.fillRect(W * 0.04, H * 0.42, W * 0.92, H * 0.18);
    if (d.molle) molle(g, d, W * 0.08, H * (d.molle[1] > 1 ? 0.18 : 0.3), W * 0.84, H * (d.molle[1] > 1 ? 0.7 : 0.45), GEAR_COL(d));
    g.fillStyle = '#8a8f94'; g.fillRect(W * 0.46, H * 0.4, W * 0.08, H * 0.22);
  }

  // MOLLE rows in a box, with the issued pouches on them
  function molle(g, d, x, y, w, h, col) {
    const [cols, rows] = d.molle, cw = w / cols, ch = h / rows;
    g.fillStyle = 'rgba(160,170,130,0.18)';
    for (let r = 0; r < rows * 3; r++) g.fillRect(x, y + (r + 0.5) * h / (rows * 3), w, 1.5);
    for (const [pid, px, py] of d.pouches || []) {
      const P = G.Gear.POUCHES[pid];
      const mw = P.mw || P.w, mh = P.mh || P.h;
      rr(g, x + px * cw + 1, y + py * ch + 1, mw * cw - 2, mh * ch - 2, 2);
      g.fillStyle = col || 'rgba(0,0,0,0.35)'; g.fill();
      g.fillStyle = 'rgba(0,0,0,0.3)'; g.fillRect(x + px * cw + 1, y + py * ch + 1, mw * cw - 2, Math.min(4, ch * 0.2)); // flap
    }
  }
  // a pouch on its own: the body, a flap, and what it's for
  function drawPouch(g, W, H, it) {
    const P = G.Gear.POUCHES[it.pid], col = P.dump ? '#5a5240' : P.acc && P.acc[0] === 'med' ? '#4a3a32' : '#4d5639';
    if (P.dump) { // a wide bag with a drawstring top
      g.fillStyle = col; g.beginPath(); g.moveTo(W * 0.12, H * 0.22); g.lineTo(W * 0.88, H * 0.22); g.lineTo(W * 0.82, H * 0.9); g.lineTo(W * 0.18, H * 0.9); g.closePath(); g.fill(); shade(g, W * 0.12, H * 0.22, W * 0.76, H * 0.68);
      g.strokeStyle = '#c9b88a'; g.lineWidth = 2; g.beginPath(); g.moveTo(W * 0.14, H * 0.27); g.lineTo(W * 0.86, H * 0.27); g.stroke();
      g.fillStyle = '#8a8f94'; g.fillRect(W * 0.46, H * 0.2, W * 0.08, H * 0.12);
      return;
    }
    const n = P.acc && P.acc[0] === 'mag' ? Math.max(1, P.w) : 1, pw = W * 0.84 / n;
    for (let i = 0; i < n; i++) {
      const x = W * 0.08 + i * pw;
      // the magazine standing up out of it (rifle and pistol mag pouches are open-top)
      if (P.acc && P.acc[0] === 'mag') { g.fillStyle = '#2a2c2e'; g.fillRect(x + pw * 0.25, H * 0.06, pw * 0.5, H * 0.3); }
      rr(g, x + 2, H * 0.22, pw - 4, H * 0.7, 3); g.fillStyle = col; g.fill(); shade(g, x + 2, H * 0.22, pw - 4, H * 0.7);
      g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(x + 2, H * 0.22, pw - 4, H * 0.1);
    }
    if (P.acc && P.acc[0] === 'med') { g.fillStyle = '#c0302a'; g.fillRect(W * 0.44, H * 0.4, W * 0.12, H * 0.36); g.fillRect(W * 0.32, H * 0.52, W * 0.36, H * 0.12); }
    if (P.acc && P.acc[0] === 'frag') { g.fillStyle = '#8a8f94'; g.fillRect(W * 0.42, H * 0.1, W * 0.16, H * 0.14); }
  }
  function drawPack(g, W, H, d) {
    const col = GEAR_COL(d), big = d.grids[0][0] * d.grids[0][1];
    const bw = W * (0.5 + Math.min(0.3, big / 100)), x = W / 2 - bw / 2;
    rr(g, x, H * 0.14, bw, H * 0.78, W * 0.1); g.fillStyle = col; g.fill(); shade(g, x, H * 0.14, bw, H * 0.78);
    g.strokeStyle = 'rgba(0,0,0,0.4)'; g.lineWidth = 2; g.beginPath(); g.moveTo(x + bw * 0.12, H * 0.34); g.lineTo(x + bw * 0.88, H * 0.34); g.stroke(); // lid
    rr(g, x + bw * 0.2, H * 0.55, bw * 0.6, H * 0.28, 4); g.fillStyle = 'rgba(0,0,0,0.22)'; g.fill(); // front pocket
    g.strokeStyle = col; g.lineWidth = 4; g.beginPath(); g.arc(W / 2, H * 0.16, W * 0.12, Math.PI, 0); g.stroke(); // grab handle
    g.fillStyle = '#8a8f94'; g.fillRect(W / 2 - 3, H * 0.3, 6, H * 0.08); // buckle
  }

  // ---------------------------------------------------------------- weapon parts: a side-on shape by what it is
  function drawPart(g, W, H, p) {
    if (!p) return;
    const wood = /wood|walnut|birch/i.test(p.name), col = wood ? '#7a4a28' : p.factory ? '#2a2c2e' : /FDE|tan|desert/i.test(p.name) ? '#8a7650' : '#34383c';
    const fill = (c) => { g.fillStyle = c || col; g.fill(); }, cy = H / 2;
    g.strokeStyle = 'rgba(0,0,0,0.5)'; g.lineWidth = 1.5;
    switch (p.slot) {
      case 'optic': {
        if (p.set && p.set.magnif > 1.5) { // a scope: tube, bells, turret
          rr(g, W * 0.18, cy - H * 0.1, W * 0.64, H * 0.2, 3); fill('#202224');
          rr(g, W * 0.06, cy - H * 0.2, W * 0.18, H * 0.4, 4); fill('#202224'); rr(g, W * 0.72, cy - H * 0.24, W * 0.22, H * 0.48, 4); fill('#202224');
          g.fillRect(W * 0.44, cy - H * 0.3, W * 0.1, H * 0.2);
          g.fillStyle = 'rgba(120,170,220,0.6)'; g.fillRect(W * 0.9, cy - H * 0.18, W * 0.03, H * 0.36);
        } else { // a red dot: a hood over a lens, on a mount
          rr(g, W * 0.2, H * 0.3, W * 0.6, H * 0.4, 6); fill('#202224');
          g.fillStyle = 'rgba(120,170,220,0.55)'; g.beginPath(); g.arc(W * 0.5, H * 0.5, H * 0.13, 0, 7); g.fill();
          g.fillStyle = '#e02a2a'; g.beginPath(); g.arc(W * 0.5, H * 0.5, H * 0.03, 0, 7); g.fill();
          g.fillStyle = '#202224'; g.fillRect(W * 0.28, H * 0.68, W * 0.44, H * 0.12);
        }
        break;
      }
      case 'muzzle':
        if (p.set && p.set.sup) { rr(g, W * 0.06, cy - H * 0.2, W * 0.88, H * 0.4, H * 0.15); fill('#2a2c2e'); shade(g, W * 0.06, cy - H * 0.2, W * 0.88, H * 0.4); }
        else { rr(g, W * 0.2, cy - H * 0.14, W * 0.6, H * 0.28, 3); fill(); g.fillStyle = 'rgba(0,0,0,0.6)'; for (let i = 0; i < 3; i++) g.fillRect(W * (0.36 + i * 0.12), cy - H * 0.1, W * 0.05, H * 0.2); }
        break;
      case 'barrel': case 'limbs':
        rr(g, W * 0.03, cy - H * 0.07, W * 0.94, H * 0.14, 2); fill(p.slot === 'limbs' ? '#3a3d40' : '#2a2c2e'); shade(g, W * 0.03, cy - H * 0.07, W * 0.94, H * 0.14);
        if (p.slot === 'barrel') { g.fillStyle = '#2a2c2e'; g.fillRect(W * 0.02, cy - H * 0.13, W * 0.08, H * 0.26); }
        break;
      case 'handguard': case 'pump': case 'tube': case 'slide':
        rr(g, W * 0.06, cy - H * 0.2, W * 0.88, H * 0.4, 3); fill(); shade(g, W * 0.06, cy - H * 0.2, W * 0.88, H * 0.4);
        if (p.slot === 'handguard') { g.fillStyle = 'rgba(0,0,0,0.45)'; for (let x = W * 0.1; x < W * 0.9; x += W * 0.07) g.fillRect(x, cy - H * 0.2, W * 0.03, H * 0.08); }
        if (p.slot === 'pump') { g.fillStyle = 'rgba(0,0,0,0.35)'; for (let x = W * 0.16; x < W * 0.86; x += W * 0.08) g.fillRect(x, cy - H * 0.2, W * 0.025, H * 0.4); }
        break;
      case 'stock':
        g.beginPath(); g.moveTo(W * 0.92, cy - H * 0.12); g.lineTo(W * 0.3, cy - H * 0.2); g.lineTo(W * 0.08, cy - H * 0.3); g.lineTo(W * 0.08, cy + H * 0.32); g.lineTo(W * 0.3, cy + H * 0.12); g.lineTo(W * 0.92, cy + H * 0.04); g.closePath(); fill(); shade(g, W * 0.08, cy - H * 0.3, W * 0.84, H * 0.62);
        break;
      case 'grip': case 'fg':
        g.beginPath(); g.moveTo(W * 0.3, H * 0.15); g.lineTo(W * 0.66, H * 0.15); g.lineTo(W * (p.slot === 'fg' ? 0.62 : 0.74), H * 0.88); g.lineTo(W * (p.slot === 'fg' ? 0.38 : 0.44), H * 0.88); g.closePath(); fill(); shade(g, W * 0.3, H * 0.15, W * 0.44, H * 0.73);
        break;
      case 'tac':
        rr(g, W * 0.12, H * 0.32, W * 0.64, H * 0.36, 4); fill('#202224');
        g.fillStyle = /laser/i.test(p.name) ? '#e02a2a' : '#f0e8b0'; g.beginPath(); g.arc(W * 0.8, H * 0.5, H * 0.12, 0, 7); g.fill();
        break;
      case 'mag': {
        const x0 = W * 0.3, mw = W * 0.4;
        g.beginPath(); g.moveTo(x0, H * 0.08); g.lineTo(x0 + mw, H * 0.08); g.quadraticCurveTo(x0 + mw + W * 0.06, H * 0.5, x0 + mw + W * 0.12, H * 0.92); g.lineTo(x0 + W * 0.12, H * 0.92); g.quadraticCurveTo(x0 + W * 0.06, H * 0.5, x0, H * 0.08); g.closePath(); fill(); shade(g, x0, H * 0.08, mw, H * 0.84);
        break;
      }
      default: { // charging handle, loader, capacitor, motor: a labelled block
        rr(g, W * 0.15, H * 0.25, W * 0.7, H * 0.5, 5); fill();
        g.fillStyle = 'rgba(255,255,255,0.6)'; g.font = `bold ${Math.round(Math.min(W, H) * 0.24)}px Consolas, monospace`; g.textAlign = 'center';
        g.fillText(p.slot.slice(0, 3).toUpperCase(), W / 2, H * 0.58);
      }
    }
  }

  // ---------------------------------------------------------------- guns: the model, side-on
  let gR = null, gScene = null, gCam = null;
  function gunImage(def, W, H) {
    const T = THREE;
    if (!gR) {
      gR = new T.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
      gScene = new T.Scene();
      gScene.environment = G.R._envMap(gR);
      gScene.add(new T.HemisphereLight(0xe8eef5, 0x2a2622, 0.7));
      const key = new T.DirectionalLight(0xffffff, 0.9); key.position.set(1.5, 2, 0.5); gScene.add(key);
      const fill = new T.DirectionalLight(0xffffff, 0.35); fill.position.set(1, -0.5, -1); gScene.add(fill);
      gCam = new T.OrthographicCamera(-1, 1, 1, -1, 0.01, 20);
    }
    gR.setSize(W, H, false);
    const { group } = G.GunModels.display(def);
    gScene.add(group);
    // looking at its right side, muzzle to the right, fitted to the cell box
    const box = new T.Box3().setFromObject(group), c = box.getCenter(new T.Vector3()), sz = box.getSize(new T.Vector3());
    const aspect = W / H, len = Math.max(sz.z, sz.y * aspect) * 1.08;
    gCam.left = -len / 2; gCam.right = len / 2; gCam.top = len / aspect / 2; gCam.bottom = -len / aspect / 2;
    gCam.position.set(c.x + 5, c.y, c.z); gCam.lookAt(c); gCam.updateProjectionMatrix();
    gR.render(gScene, gCam);
    gScene.remove(group);
    group.traverse((o) => { if (o.isMesh) { o.geometry.dispose(); } });
    return gR.domElement;
  }

  function draw(it, W, H) {
    const c = document.createElement('canvas'); c.width = W; c.height = H;
    const g = c.getContext('2d');
    const d = it.gid ? G.Gear.DEFS[it.gid] : null;
    if (it.k === 'mag') drawMag(g, W, H, it);
    else if (it.k === 'ammo') drawAmmo(g, W, H, it);
    else if (it.k === 'med') drawMedItem(g, W, H, it.mt);
    else if (it.k === 'frag') drawFrag(g, W, H);
    else if (it.k === 'carrier') drawCarrier(g, W, H, d);
    else if (it.k === 'plate') drawPlate(g, W, H, d);
    else if (it.k === 'helmet') { drawHelmet(g, W, H, d); if (it.face) drawFace(g, W, H, G.Gear.defOf(it.face), true); }
    else if (it.k === 'face') drawFace(g, W, H, d);
    else if (it.k === 'belt') drawBelt(g, W, H, d);
    else if (it.k === 'pack') drawPack(g, W, H, d);
    else if (it.k === 'pouch') drawPouch(g, W, H, it);
    else if (it.k === 'ifak') { // a red zip pouch with a white cross
      rr(g, W * 0.12, H * 0.08, W * 0.76, H * 0.84, 6); g.fillStyle = '#7a2420'; g.fill(); shade(g, W * 0.12, H * 0.08, W * 0.76, H * 0.84);
      g.fillStyle = 'rgba(0,0,0,0.3)'; g.fillRect(W * 0.12, H * 0.16, W * 0.76, H * 0.05);
      g.fillStyle = '#e8e4da'; g.fillRect(W * 0.43, H * 0.38, W * 0.14, H * 0.3); g.fillRect(W * 0.32, H * 0.46, W * 0.36, H * 0.12);
    }
    else if (it.k === 'part') drawPart(g, W, H, G.Gunsmith.PARTS[it.pid]);
    else if (it.k === 'gun') { try { g.drawImage(gunImage(it.w.def, W, H), 0, 0); } catch (e) { console.warn(e); } }
    return c;
  }
  // an item drawn in its natural orientation (w x h cells), turned if it's shown turned
  function of(it, w, h, rot) {
    const key = [it.k, it.k === 'gun' ? it.w.def.code : it.wid || it.key || it.gid || it.pid || it.mt || '', it.vid || '', it.am || '', it.n > 0 ? 1 : 0, w, h, rot ? 1 : 0, it.face ? it.face.gid : ''].join('|');
    let url = cache.get(key);
    if (url) return url;
    const nw = rot ? h : w, nh = rot ? w : h, src = draw(it, nw * CELL, nh * CELL);
    let out = src;
    if (rot) { out = document.createElement('canvas'); out.width = h * CELL; out.height = w * CELL; const g = out.getContext('2d'); g.translate(out.width, 0); g.rotate(Math.PI / 2); g.drawImage(src, 0, 0); }
    url = out.toDataURL();
    cache.set(key, url);
    return url;
  }
  return { of };
})();
