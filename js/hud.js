'use strict';
// In-game heads-up display (DOM overlay + minimap canvas).
G.HUD = {
  el: {},
  cache: {},
  vigT: 0,
  toastT: 0,
  dirs: [],

  init() {
    for (const n of document.querySelectorAll('#hud [id]')) this.el[n.id] = n;
    this.mm = this.el.minimap.getContext('2d');
  },
  set(id, html) {
    if (this.cache[id] === html) return;
    this.cache[id] = html;
    this.el[id].innerHTML = html;
  },
  show(v) { document.getElementById('hud').classList.toggle('hidden', !v); },

  buildMinimap(map) {
    const c = document.createElement('canvas');
    const px = 2 * G.Level.TS; // pixels per tile (2 per metre)
    c.width = map.W * px; c.height = map.H * px;
    const g = c.getContext('2d');
    g.fillStyle = 'rgba(0,0,0,0)'; g.fillRect(0, 0, c.width, c.height);
    for (let z = 0; z < map.H; z++) for (let x = 0; x < map.W; x++) {
      const v = map.t[z * map.W + x];
      if (v === 1) continue;
      g.fillStyle = v === 2 || v === 4 ? 'rgba(150,130,90,0.85)' : 'rgba(190,200,210,0.32)';
      g.fillRect(x * px, z * px, px, px);
    }
    this.mmImg = c;
  },

  damage(from, amt) {
    this.vigT = Math.min(1, this.vigT + amt / 40);
    if (!from) return;
    const d = document.createElement('div');
    d.className = 'dmgdir';
    this.el.dmgDirs.appendChild(d);
    this.dirs.push({ el: d, from: from.clone ? from.clone() : from, t: 1.2 });
  },
  toast(title, sub, dur = 2.5) {
    this.el.toast.innerHTML = (title ? `<div class="tt">${title}</div>` : '') + (sub ? `<div class="ts">${sub}</div>` : '');
    this.el.toast.style.opacity = 1;
    this.toastT = dur;
  },
  feed(html) {
    const d = document.createElement('div');
    d.innerHTML = html;
    this.el.killfeed.prepend(d);
    setTimeout(() => d.classList.add('fade'), 4000);
    setTimeout(() => d.remove(), 5000);
    while (this.el.killfeed.children.length > 6) this.el.killfeed.lastChild.remove();
  },
  chat(name, color, text) {
    const d = document.createElement('div');
    d.innerHTML = name ? `<b style="color:${G.U.hex(color)}">${G.U.esc(name)}:</b> ${G.U.esc(text)}` : `<i>${G.U.esc(text)}</i>`;
    this.el.chatLog.appendChild(d);
    setTimeout(() => d.classList.add('fade'), 9000);
    setTimeout(() => d.remove(), 10000);
    while (this.el.chatLog.children.length > 8) this.el.chatLog.firstChild.remove();
  },
  setPrompt(html) { this.set('prompt', html); },
  setProgress(f, label) {
    const show = f >= 0;
    this.el.progress.classList.toggle('hidden', !show);
    if (show) { this.el.progressBar.style.width = Math.min(100, f * 100) + '%'; this.set('progressText', label); }
  },
  // blinded by a flashbang (k 0..1): the screen white, held a moment, then fading back over a few seconds
  flash(k) {
    this.flashK = Math.max(this.flashK || 0, k);
    this.flashHold = Math.max(this.flashHold || 0, 0.4 + 1.8 * k);
  },
  // Your face shield catching a round: where it struck, on your view through it, and it stays that way (list: [x, y, what it did: 0
  // stopped, 1 through, 2 glanced], in the head's frame: js/ballistics.js). Kept on the shield, so it goes where the shield goes.
  maskHit(list) {
    const k = G.Me.kit, it = k && k.helmet && (k.helmet.face || k.helmet);
    if (!it) return;
    const cr = it.cracks || (it.cracks = []);
    for (const [x, y, st] of list) cr.push([G.U.clamp(0.5 + x / 0.1 * 0.4, 0.06, 0.94), G.U.clamp(0.5 - (y - 0.05) / 0.1 * 0.4, 0.06, 0.94), st, (Math.random() * 1e9) | 0]);
    if (cr.length > 14) cr.splice(0, cr.length - 14);
    this.maskPop = 1;
  },
  // what's on the shield you're wearing, drawn when it changes
  maskDraw(dt) {
    const k = G.Me.kit, it = k && k.helmet && (k.helmet.face || k.helmet), cr = (it && it.cracks) || [], cv = this.el.maskFx, W = window.innerWidth, H = window.innerHeight, key = `${cr.length}|${cr.length ? cr[cr.length - 1][3] : 0}|${W}x${H}`;
    if (this.maskPop > 0) { this.maskPop = Math.max(0, this.maskPop - dt * 3.5); cv.style.filter = `brightness(${(1 + this.maskPop * 1.6).toFixed(2)})`; } else if (cv.style.filter) cv.style.filter = '';
    cv.classList.toggle('hidden', !cr.length || G.Me.dead); // (not while you're watching someone else)
    if (key === this.maskKey) return;
    this.maskKey = key;
    cv.width = W; cv.height = H;
    const g = cv.getContext('2d'), R0 = Math.min(W, H);
    for (const [u, v, st, seed] of cr) {
      let s = seed; const rnd = () => { s = (Math.imul(s, 1597334677) + 12345) | 0; return ((s ^ (s >>> 15)) >>> 0) / 4294967296; };
      const x = u * W, y = v * H, big = st === 1 ? 0.42 : st === 2 ? 0.2 : 0.3, n = st === 2 ? 7 : 12 + Math.floor(rnd() * 5), rays = [];
      g.lineCap = 'round';
      for (let i = 0; i < n; i++) {
        let a = (st === 2 ? 0.7 : 1) * (i / n * Math.PI * 2 + rnd() * 0.4) + (st === 2 ? rnd() : 0), q = R0 * 0.012, px = x + Math.cos(a) * q, py = y + Math.sin(a) * q; const end = R0 * big * (0.35 + rnd() * 0.65), pts = [[px, py]];
        while (q < end) { const d = R0 * (0.014 + rnd() * 0.03); q += d; a += (rnd() - 0.5) * 0.5; px += Math.cos(a) * d; py += Math.sin(a) * d; pts.push([px, py]); }
        rays.push(pts);
      }
      const stroke = (col, w) => { g.strokeStyle = col; g.lineWidth = w; for (const pts of rays) { g.beginPath(); pts.forEach((p, i) => g[i ? 'lineTo' : 'moveTo'](p[0], p[1])); g.stroke(); } };
      stroke('rgba(0,0,0,0.3)', 3); stroke('rgba(228,240,246,0.72)', 1.4);
      // (the web between the rays, and the pulverised patch where it struck)
      g.strokeStyle = 'rgba(226,238,244,0.38)'; g.lineWidth = 1;
      for (let ring = 1; ring <= (st === 2 ? 1 : 3); ring++) { g.beginPath(); rays.forEach((pts, i) => { const p = pts[Math.min(pts.length - 1, ring * 2)]; g[i ? 'lineTo' : 'moveTo'](p[0], p[1]); }); g.closePath(); g.stroke(); }
      const r = R0 * (st === 1 ? 0.03 : st === 2 ? 0.012 : 0.038), gr = g.createRadialGradient(x, y, 0, x, y, r);
      if (st === 1) { gr.addColorStop(0, 'rgba(4,4,6,0.95)'); gr.addColorStop(0.6, 'rgba(4,4,6,0.9)'); gr.addColorStop(0.72, 'rgba(235,242,246,0.85)'); gr.addColorStop(1, 'rgba(235,242,246,0)'); } else { gr.addColorStop(0, 'rgba(244,248,250,0.92)'); gr.addColorStop(0.55, 'rgba(226,236,242,0.6)'); gr.addColorStop(1, 'rgba(226,236,242,0)'); }
      g.fillStyle = gr; g.beginPath(); g.arc(x, y, r, 0, 7); g.fill();
    }
  },
  nadeWarn(n) {
    const el = this.el.nadeWarn;
    el.classList.toggle('hidden', !n);
    if (!n) return;
    const Me = G.Me, ang = Math.atan2(-(n.pos.x - Me.pos.x), -(n.pos.z - Me.pos.z));
    el.firstChild.style.transform = `rotate(${-G.U.angDiff(Me.yaw, ang)}rad)`;
  },
  sniperWarn(on) { this.el.vignette.classList.toggle('sniper', on); },

  // ---------------------------------------------------------------- F9: the hitboxes, and who you're looking at
  // While the hitboxes are shown, everything about whoever's under the crosshair (a suspect, a civilian, a body, a
  // teammate), up to the first wall: what the line from your eye crosses in them (the segments, front to back, and the
  // organs in each, js/ballistics.js probe), their condition (the host's whole record of a suspect: every wound, organ,
  // bleed, their strength and nerve; a client has what the host sends), their armour and what they're carrying.
  // the organs, by region, as the readout lists them (an arm's or a leg's are both sides': the host keeps them by organ)
  HB_ORGANS: [['Head', ['brain', 'brainstem']], ['Neck', ['spineC', 'trachea', 'carotidL', 'carotidR']], ['Chest', ['heart', 'aorta', 'lungL', 'lungR', 'spineT']],
    ['Abdomen', ['liver', 'stomach', 'spleen', 'bowel', 'kidneyL', 'kidneyR']], ['Pelvis', ['pelvisL', 'pelvisR', 'iliacL', 'iliacR']],
    ['Arms', ['humerusL', 'humerusR', 'forearmL', 'forearmR', 'brachialL', 'brachialR']], ['Legs', ['femurL', 'femurR', 'femoralL', 'femoralR', 'tibiaL', 'tibiaR']]],
  debugTarget(dt) {
    const el = this.el.hbInfo, on = G.Rig.debug;
    el.classList.toggle('hidden', !on);
    if (!on) { if (this.xrOn) this.xray(null); return; }
    if ((this.hbT = (this.hbT || 0) - dt) > 0) return;
    this.hbT = 0.1;
    const cam = G.R.camera, o = cam.position.clone(), d = new THREE.Vector3(0, 0, -1).applyQuaternion(cam.quaternion), map = G.Game.map;
    const wall = map ? G.Level.raycast(map, o.x, o.y, o.z, d.x, d.y, d.z, 300) : null, maxT = wall && wall.t != null ? wall.t + 0.05 : 300;
    let best = null;
    const test = (who, kind) => { if (!who.rig || !who.rig.root.visible) return; const h = G.Rig.raycast(who.rig, o, d, maxT); if (h && (!best || h.t < best.h.t)) best = { who, kind, h }; };
    for (const ev of G.Views.enemies.values()) test(ev, 'e');
    for (const pv of G.Views.players.values()) if (pv.st) test(pv, 'p');
    const esc = G.U.esc, B = G.Ballistics, pct = (v) => Math.round(v * 100) + '%';
    const SEG = { cranium: 'Skull', jaw: 'Jaw', neck: 'Neck', chest: 'Chest', abdomen: 'Abdomen', pelvis: 'Pelvis', uarm: 'Upper arm', farm: 'Forearm', thigh: 'Thigh', shin: 'Shin' };
    const sideOf = (s) => (s === 'L' ? ' (L)' : s === 'R' ? ' (R)' : '');
    // sticky: looking away (or at nothing), it stays on the last one you looked at, still live, with the line through
    // them as it was when you last had them in your sights (while they're still in the level)
    const L = this.hbLast, still = L && (L.kind === 'e' ? G.Views.enemies.get(L.who.id) === L.who : G.Views.players.get(L.id) === L.who && L.who.st);
    if (!best && !still) { this.hbLast = null; this.xray(null, true); this.set('hbInfo', `<h4>Nothing in line <small>${wall && wall.t != null ? `wall at ${wall.t.toFixed(1)} m` : ''}</small></h4>`.replace('<h4>', this.trailLegend() + '<h4>')); return; }
    let who, kind, line, hit, dist;
    if (best) {
      ({ who, kind } = best); const h = best.h;
      // the line through them, from just in front
      const back = Math.max(0, h.t - 0.6), pr = B.probe(who.rig, o.clone().addScaledVector(d, back), d, 3);
      line = pr ? pr.path.map((p) => `<div class="hb-line"><b>${SEG[p.seg] || p.seg}${sideOf(p.side)}</b> ${p.organs.length ? p.organs.map((id) => esc(B.ORG[id].label)).join(' → ') : '<span class="hb-k">flesh</span>'}</div>`).join('') : '<div class="hb-k">only the hitbox: the body itself is missed</div>';
      hit = `hitbox: ${h.zone}${sideOf(h.side)}${kind === 'e' ? ` · ${h.c < 0.4 ? 'centre' : h.c < 0.8 ? 'off-centre' : 'edge'}` : ''}`;
      dist = h.t;
      let id = null; if (kind === 'p') for (const [k, v] of G.Views.players) if (v === who) id = k;
      this.hbLast = { who, kind, id, line, hit };
    } else {
      ({ who, kind } = L); line = `<div class="hb-old">${L.line}</div>`; hit = `last in line · ${L.hit}`;
      const at = kind === 'e' && (!who.alive || who.down) ? G.Rig.bodyAt(who.rig) : who.pos;
      dist = Math.hypot(at.x - o.x, at.z - o.z);
    }
    const out = [], tag = best ? '' : ' · <span class="hb-k">(last seen)</span>';
    if (kind === 'e') {
      const ev = who, def = ev.def, SV = G.Server, bd = SV && SV.bodies && SV.bodies.get(ev.id), e = (SV && SV.enemies && SV.enemies.get(ev.id)) || (bd && bd.rec), dead = !ev.alive;
      const st = e ? e.state : ['normal', 'surrendered', 'cuffed', 'cowering'][ev.scode || 0];
      out.push(`<h4>${esc(def.name)} <small>#${ev.id} · ${dist.toFixed(1)} m · ${dead ? '<span class="bad">dead</span>' : ev.down ? '<span class="bad">down</span>' : esc(st || 'normal')}${e ? '' : ' · (as the host sends it)'}${tag}</small></h4>`);
      out.push(`<div class="hb-k">${hit}</div>${line}`);
      // condition
      const c = [];
      let orgHtml = '';
      if (e) {
        const rate = dead ? 0 : ((e.bleedH || 0) + (e.bleedL || 0)) * G.Server.BLEED_K, left = rate > 0 ? Math.max(0, e.hp) / rate : null;
        c.push(`<div class="hb-row"><span>Health ${Math.max(0, Math.round(e.hp))}/${Math.round(e.maxHp)} (${pct(Math.max(0, e.hp) / e.maxHp)})</span><span>Strength ${dead ? '—' : pct(e.str == null ? 1 : e.str)}</span></div>`);
        if (rate > 0) c.push(`<div class="bad">Bleeding ${(rate / e.maxHp * 100).toFixed(1)}%/s${e.bleedH ? ' (heavy)' : ''}${e.bleedL ? ` (light, clots in ${Math.max(0, 30 - (e.clotT || 0)).toFixed(0)} s)` : ''} · gone in ${left.toFixed(1)} s</div>`);
        const f = [e.cardiac && 'heart wrecked', e.out && 'unconscious', e.spine && 'spine: paralysed', e.lung && 'collapsed lung', ...Object.keys(e.broke || {}).map((k) => `broken ${k.endsWith('L') ? 'left' : 'right'} ${k.startsWith('arm') ? 'arm' : 'leg'}`), e.collapsed && 'collapsed', e.down && 'down for good'].filter(Boolean);
        if (f.length) c.push(`<div class="warn">${f.join(' · ')}</div>`);
        // every organ, by region, and how much of it's gone (none: intact)
        const org = Object.entries(e.organs || {}), O = e.organs || {};
        orgHtml = (`<div class="hb-sec hb-org">${this.HB_ORGANS.map(([reg, ids]) => `<div class="hb-reg">${reg}</div>${ids.map((id) => { const v = O[id] || 0; return `<div class="hb-row"><span>${esc(B.ORG[id].label)}</span><span class="${v >= 100 ? 'bad' : v > 0 ? 'warn' : 'ok'}">${v >= 100 ? 'destroyed' : v > 0 ? v + '%' : 'intact'}</span></div>`; }).join('')}`).join('')}</div>`);
        if (!rate && !f.length && !org.length && e.hp >= e.maxHp) c.push('<div class="ok">Unhurt</div>');
        if (!def.civ) c.push(`<div class="hb-k">nerve ${pct(Math.max(0, e.morale || 0))}${e.broken ? ' (broken)' : ''} · ${e.alert ? 'alert' : 'unaware'}${e.canSee ? ', sees a target' : ''}${e.surprisedT > 0 ? ', surprised' : ''}${e.suppressT > 0 ? ', suppressed' : ''}${def.comply != null ? ` · complies ${pct(def.comply)}` : ''}</div>`);
      } else {
        c.push(`<div class="hb-row"><span>Health ${ev.alive ? ev.hp || 0 : 0}%</span><span>Strength ${pct(ev.str == null ? 1 : ev.str)}</span></div>`);
        const f = [ev.bleed && 'bleeding', ev.limp && 'broken leg', ev.down && 'down for good'].filter(Boolean);
        c.push(`<div class="${f.length ? 'warn' : 'ok'}">${f.length ? f.join(' · ') : 'no wounds known'}</div><div class="hb-k">${ev.alert ? 'alert' : 'unaware'}</div>`);
      }
      out.push(`<div class="hb-sec">${c.join('')}</div>`);
      // armour and weapon
      if (!def.civ) {
        const arm = B.suspectArmour(ev).filter((a) => a.def.prot.length).map((a) => `${esc(a.def.name)} <span class="${a.cond < 0.5 ? 'bad' : a.cond < 1 ? 'warn' : 'ok'}">${pct(a.cond)}</span>`);
        const W = def.wpn && G.WEAPONS[def.wpn];
        const how = e ? ` · ${e.armed ? (e.drawn ? 'drawn' : 'holstered') : 'disarmed'}${e.armed && e.mag != null ? ` · ${e.mag}/${e.magMax} loaded` : ''}${e.reloadT > 0 ? ' · reloading' : ''}` : ev.armed ? (ev.armed === 2 ? ' · drawn' : ' · holstered') : ' · disarmed';
        out.push(`<div class="hb-sec"><div><span class="hb-k">Armour</span> ${arm.length ? arm.join(' · ') : 'none'}</div>${W ? `<div><span class="hb-k">Weapon</span> ${esc(W.name)}${how}</div>` : ''}</div>`);
      }
      out.push(orgHtml);
    } else {
      // a teammate: their body as they send it (every part, every organ)
      const pv = who, st = pv.st, b = st.bd ? G.Med.decode(st.bd) : null;
      out.push(`<h4>${esc(pv.name || 'Officer')} <small>${dist.toFixed(1)} m · ${st.dd ? '<span class="bad">dead</span>' : st.uc ? '<span class="bad">unconscious</span>' : st.dn ? '<span class="bad">down</span>' : 'up'}${tag}</small></h4>`);
      out.push(`<div class="hb-k">${hit}</div>${line}`);
      if (b) {
        const rows = G.Med.PARTS.map(([k, n]) => { const p = b.parts[k], w = G.Med.describe(p), f = p.hp / p.max; return `<div class="hb-row"><span>${esc(n)}</span><span class="${f <= 0 ? 'bad' : w.length || f < 1 ? 'warn' : 'ok'}">${pct(Math.max(0, f))}${w.length ? ' · ' + esc(w.join(', ')) : ''}</span></div>`; });
        out.push(`<div class="hb-sec"><div class="hb-row"><span>Blood ${Math.round(b.blood)}%</span><span>${b.pk ? 'painkillers' : ''}${st.dn && st.bl > 0 ? ` · bleeds out in ${st.bl} s` : ''}</span></div>${rows.join('')}</div>`);
      }
    }
    // every shot that's hit them: what it was going at each stage (its trail, ghost and markers in the world: js/shotlog.js)
    const shots = G.ShotLog.of(kind === 'e' ? 'e' + who.id : 'p' + (this.hbLast || {}).id);
    if (shots.length) out.splice(2, 0, `<div class="hb-sec"><span class="hb-k">Shots that hit them: ${shots.length}</span>${shots.slice(-5).reverse().map((h) => `<div class="hb-shot"><b>#${h.n}</b> ${esc(h.name)} <span class="hb-k">· ${h.range} m · ${G.U.fmt(h.J)} J</span><br>${[`muzzle ${h.muzzle}`, `in ${h.vIn}`, h.post != null ? `past armour ${h.post}` : null, h.out != null ? `out ${h.out}` : null].filter(Boolean).join(' › ')}${h.stop ? ` <span class="warn">stopped: ${esc(h.stop)}</span>` : ''}${h.frags ? ` <span class="hb-k">· ${h.frags}</span>` : ''}</div>`).join('')}</div>`);
    if (this.hbPath) out.push(`<div class="hb-sec"><span class="hb-k">Last round through them</span><div class="hb-path">${this.hbPath.map((q) => `${esc(q.m)} <b>${q.v}</b>`).join(' › ')}</div></div>`);
    this.set('hbInfo', this.trailLegend() + out.join(''));
    this.xray(who, true);
  },

  // the trails' colours (js/render.js trailColour): the speed a colour stands for
  trailLegend() {
    if (!this._tl) {
      const c = new THREE.Color(), stops = [];
      for (let i = 0; i <= 8; i++) stops.push(`#${G.R.trailColour(G.R.TRAIL_VMAX * i / 8, c).getHexString()} ${i * 12.5}%`);
      this._tl = `<div class="hb-legend"><span class="hb-k">Trail speed</span><i style="background:linear-gradient(90deg,${stops.join(',')})"></i><div class="hb-row hb-k"><span>0</span><span>${Math.round(G.R.TRAIL_VMAX / 3)} m/s</span><span>${G.R.TRAIL_VMAX}+ m/s (Mach 2)</span></div></div>`;
    }
    return this._tl;
  },
  // ---------------------------------------------------------------- F9's x-ray (as the killcam's: js/highlights.js)
  // Everyone in clear view within XR_RANGE shows their organs through their body (js/ballistics.js segs: each organ's
  // shape, in its bone), coloured by what's been done to it: red destroyed, amber hurt, bone white or green intact (a
  // client knows a suspect's only as intact: the host keeps the record). The one the readout's on (the target) is
  // turned to glass, its organs bright; the others' are fainter. Off (F9 again): bodies as they were, organs gone.
  XR_RANGE: 30,
  xray(target, on) {
    const rigs = [];
    if (on) {
      for (const ev of G.Views.enemies.values()) if (ev.rig) rigs.push([ev.rig, ev, 'e']);
      for (const pv of G.Views.players.values()) if (pv.rig && pv.st) rigs.push([pv.rig, pv, 'p']);
    }
    const cam = G.R.camera.position, map = G.Game.map, keep = new Set();
    for (const [rig, who, kind] of rigs) {
      if (!rig.root.visible) continue;
      const at = rig.hips ? rig.hips.getWorldPosition(new THREE.Vector3()) : rig.root.position.clone(), d = at.distanceTo(cam), me = who === target;
      if (!me) { // (others: only in clear view, close enough)
        if (d > this.XR_RANGE) continue;
        const u = at.clone().sub(cam).normalize(), w = map ? G.Level.raycast(map, cam.x, cam.y, cam.z, u.x, u.y, u.z, d) : null;
        if (w && w.t < d - 0.4) continue;
      }
      keep.add(rig);
      if (!rig.xr) rig.xr = this.xrayOrgans(rig);
      const O = this.organState(who, kind);
      for (const o of rig.xr) {
        const v = O[o.id] || 0, col = v >= 100 ? 0xff2a2a : v > 0 ? 0xffb02a : G.Ballistics.ORG[o.id].bone ? 0xe8e2c8 : 0x6fd08c;
        o.mesh.visible = true; o.mesh.material.color.setHex(col);
        o.mesh.material.opacity = v > 0 ? (me ? 0.95 : 0.7) : me ? 0.4 : 0.18;
        o.mesh.renderOrder = v > 0 ? 31 : 30;
      }
      this.glass(rig, me);
    }
    // everyone else: back as they were
    for (const rig of this.xrRigs || []) if (!keep.has(rig)) { for (const o of rig.xr || []) o.mesh.visible = false; this.glass(rig, false); }
    this.xrRigs = keep; this.xrOn = !!on;
  },
  // the organ meshes in a rig's bones (hidden till shown), each its own material (its colour changes)
  xrayOrgans(rig) {
    const B = G.Ballistics, out = [];
    const bone = (n) => (n.startsWith('up') || n.startsWith('lo') ? (n.endsWith('L') ? rig.armL : rig.armR)[n.slice(0, 2)] : n.startsWith('th') || n.startsWith('sh') ? (n.endsWith('L') ? rig.legL : rig.legR)[n.slice(0, 2)] : rig[n]);
    const sph = this.xrSph || (this.xrSph = new THREE.SphereGeometry(1, 14, 10)), cyl = this.xrCyl || (this.xrCyl = new THREE.CylinderGeometry(1, 1, 1, 8));
    for (const sg of B.segs()) {
      const b = bone(sg.bone); if (!b) continue;
      for (const [id, sh] of sg.organs || []) {
        const m = new THREE.MeshBasicMaterial({ transparent: true, depthTest: false, depthWrite: false });
        let mesh;
        if (sh[0] === 'ell') { mesh = new THREE.Mesh(sph, m); mesh.scale.set(...sh[2]); mesh.position.set(...sh[1]); }
        else {
          const a = new THREE.Vector3(...sh[1]), c = new THREE.Vector3(...sh[2]);
          mesh = new THREE.Mesh(cyl, m); mesh.scale.set(sh[3], Math.max(0.001, a.distanceTo(c)), sh[3]); mesh.position.copy(a).add(c).multiplyScalar(0.5);
          mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), c.clone().sub(a).normalize());
        }
        mesh.userData.xr = true; mesh.visible = false; mesh.frustumCulled = false;
        b.add(mesh); out.push({ id, mesh });
      }
    }
    return out;
  },
  // what's been done to each organ (id -> % of it gone): the host's record of a suspect (or of the body they left), a
  // teammate's body as they send it (by part: the worst of each organ)
  organState(who, kind) {
    if (kind === 'e') { const SV = G.Server, bd = SV && SV.bodies && SV.bodies.get(who.id), e = (SV && SV.enemies && SV.enemies.get(who.id)) || (bd && bd.rec); return (e && e.organs) || {}; }
    const b = who.st && who.st.bd ? G.Med.decode(who.st.bd) : null, O = {};
    if (b) for (const p of Object.values(b.parts)) for (const [id, f] of Object.entries(p.org || {})) O[id] = Math.max(O[id] || 0, Math.round(f * 100));
    return O;
  },
  // a body turned to glass (as the killcam's), or back
  glass(rig, on) {
    rig.root.traverse((o) => {
      if (!o.isMesh || o.userData.xr) return;
      if (on && !o.userData.mat0) {
        o.userData.mat0 = o.material;
        const ms = (Array.isArray(o.material) ? o.material : [o.material]).map((m) => { const g = m.clone(); g.transparent = true; g.opacity = 0.28; g.depthWrite = false; return g; });
        o.material = Array.isArray(o.material) ? ms : ms[0];
      } else if (!on && o.userData.mat0) {
        for (const m of Array.isArray(o.material) ? o.material : [o.material]) m.dispose();
        o.material = o.userData.mat0; delete o.userData.mat0;
      }
    });
  },

  update(dt) {
    const Me = G.Me, Gm = G.Game;
    if (Gm.phase !== 'level' || !Me.pos) return;
    const w = Me.cur(), def = w.def, maxHp = Me.maxHp(), chest = G.Gear.piece(Me, 'chest');
    this.debugTarget(dt);

    // vitals: blood, and the body at a glance (each part shaded by its health, red when it's bleeding)
    const b = Me.body, blood = b ? b.blood : 100;
    this.el.hpFill.style.width = Math.max(0, blood) + '%';
    this.el.hpFill.classList.toggle('low', blood < 40);
    this.set('hpText', Math.ceil(Math.max(0, blood)) + '%' + (b && b.pk > 0 ? ' <small>PK</small>' : ''));
    if (b && (this.bodyT = (this.bodyT || 0) - dt) <= 0) {
      this.bodyT = 0.2;
      this.set('bodyMini', G.Med.figure(b, { cls: 'mini', glow: Me.treatingParts() }) + (G.Med.bleeding(b) ? '<span class="bm-tag">BLEEDING · Tab to treat</span>' : ''));
    }
    // the condition of what's over your chest (plate, or soft armour); the helmet's after it
    const cd = G.Gear.defOf(chest), hd = G.Gear.defOf(Me.kit.helmet);
    this.el.armorFill.style.width = cd && cd.dur ? Me.vestCond() * 100 + '%' : '0%';
    this.set('armorText', (cd && cd.dur ? Math.round(Me.vestCond() * 100) + '%' : '—') + (hd && hd.dur ? ` <small>HELM ${Math.round(Me.helmCond() * 100)}%</small>` : ''));
    // the quick slots (3, 4, 5): what's on each and how many you carry
    this.set('items', Me.quick.map((kind, i) => { const n = Me.quickCount(kind); return `<span class="qs${n ? '' : ' none'}" title="Key ${i + 3}: ${G.U.esc(Me.quickName(kind))} (drag a grenade onto its box in the inventory to change it)"><b>${i + 3}</b> ${G.U.esc(Me.quickName(kind))}${kind ? ' ' + n : ''}</span>`; }).join(''));
    this.maskDraw(dt);
    // a flashbang's white-out
    if (this.flashK > 0) {
      if (this.flashHold > 0) this.flashHold -= dt; else this.flashK = Math.max(0, this.flashK - dt * 0.35);
      this.el.flashFx.style.opacity = Math.min(1, this.flashK * 1.15).toFixed(3);
    } else if (this.el.flashFx.style.opacity !== '0') this.el.flashFx.style.opacity = '0';

    // a grenade in your hand: what it is, how many, and the throw (right click changes it)
    if (Me.held) {
      const h = Me.held;
      this.set('weapName', `${Me.quickName(h.kind)} <small title="Right click changes it">${Me.THROWS[h.str][0].toUpperCase()} THROW</small>${h.cock ? ' <em>pin out: let go to throw</em>' : ''}`);
      this.set('ammoMag', ''); this.set('ammoRes', ` <small>${Me.quickCount(h.kind)} left</small>`);
      this.set('weapAlt', `LMB hold, release to throw · RMB ${Me.THROWS.map((t, i) => (i === h.str ? `<b>${t[0]}</b>` : t[0])).join(' / ')}`);
    }
    // ammo (a weapon in your hands)
    if (!Me.held) {
    const modes = def.modes || [def.mode], fm = Me.fireMode ? Me.fireMode(w) : modes[0];
    this.set('weapName', `<span style="color:${G.TIER_COLORS[def.tier]}">${def.name}</span> <small${modes.length > 1 ? ' title="X switches"' : ''}>${G.MODE_NAME[fm] || ''}</small>${w.sup ? ' <small>SUPP</small>' : ''}${def.missing && def.missing.length ? ' <em class="broken">WON\'T FIRE</em>' : ''}${Me.reloading ? ` <em>${{ pouch: 'dump reload (pouch)', floor: 'dump reload' }[Me.reloadMode] || 'reloading'}</em>` : ''}`);
    // No counts, no gauges: check the magazine (hold R) or the chamber (hold I) to know what's in it
    const hasCh = G.chambered(def), Gr = G.Gear, af = Gr.ammoFor(def), top = w.tube && w.tube.length ? w.tube[w.tube.length - 1] : w.ammo;
    this.set('ammoMag', af.kind === 'mag' && w.noMag ? '<span class="nomag">NO MAG</span>' : '');
    const am = G.AMMO[hasCh && w.chamber ? w.chamber : top]; // (the next round to fire)
    // the magazines (or boxes of rounds) you carry for it with something in them: one small white icon each, no count
    const spare = Gr.feeds(Me, def).length, isMag = af.kind === 'mag';
    const sk = isMag ? G.Icons.styleFor(def, def.build && def.build.mag) : 'box', [iw, ih] = !isMag || sk === 'box' ? [16, 13] : sk === 'drum' ? [16, 16] : sk === 'p90' ? [22, 9] : [9, sk === 'pistol' ? 16 : 20];
    const icon = G.Icons.gauge(sk === 'tube' ? 'box' : sk, 1, 1, iw, ih), shown = Math.min(spare, 12);
    this.set('ammoRes', ` <span class="spare" title="${isMag ? 'Loaded magazines' : 'Boxes of rounds'} on you">${Array.from({ length: shown }, () => `<img src="${icon}" style="width:${iw}px;height:${ih}px">`).join('')}${spare > shown ? '<i>+</i>' : ''}${spare ? '' : '<i class="none">none</i>'}</span>` + (am ? ` <small class="amtag">${am.tag}</small>` : ''));
    const other = Me.weapons[Me.slot === 'p' ? 's' : 'p'];
    const packed = G.Gear.packGuns(Me).map(([it]) => it.w.def.name);
    this.set('weapAlt', (other ? `${Me.slot === 'p' ? '2' : '1'} · ${other.def.name}` : '') + (packed.length ? `${other ? ' &nbsp; ' : ''}B · ${packed.join(', ')}` : ''));
    }
    this.set('credits', '¢ ' + G.U.fmt(Me.credits));
    this.set('levelInfo', Gm.hub ? `HANGAR <span>· level ${Gm.level} cleared</span>` : `LEVEL ${Gm.level} <span>· ${Gm.map.theme.name}</span>`);

    // objectives: order (required), the civilians (optional), then the vote to leave. No counts: how many
    // suspects, civilians, bodies or weapons there are is for you to find out.
    const X = Gm.extract;
    const o1 = X.active ? '<b class="go">✔ Bring Order to Chaos</b>' : '<b>Bring Order to Chaos</b>';
    // (the civilians are only marked done once order's restored: before that a tick would say there's nobody left to find)
    const o2 = X.civDead ? '<span class="bad">✘ Rescue All of the Civilians</span>'
      : X.active && !(Gm.civsLeft > 0) ? '<b class="go">✔ Rescue All of the Civilians</b>'
      : 'Rescue All of the Civilians <span style="opacity:0.6">(optional)</span>';
    let obj = o1;
    // an apartment block: each apartment cleared in turn
    const nu = Gm.map.units;
    if (nu) obj += `<br>${(Gm.unitsCleared || 0) >= nu ? '<b class="go">✔ Clear every apartment</b>' : 'Clear every apartment'}`; // (no count: how many there are is for you to find)
    obj += `<br>${o2}`;
    // (green only once every other objective's done, order restored, apartments cleared, civilians rescued, and
    // nothing's left lying about: every body secured, every dropped weapon bagged)
    const V = G.Views, bodies = [...V.enemies.values()].filter((ev) => !ev.alive), drops = [...V.evidence.values()];
    const pending = bodies.some((ev) => !ev.bodySecured) || drops.some((v) => !v.secured);
    const othersDone = X.active && (!nu || (Gm.unitsCleared || 0) >= nu) && !X.civDead && !(Gm.civsLeft > 0);
    obj += othersDone && !pending ? '<br><b class="go">✔ Also pays: securing bodies and bagging dropped weapons</b>' : '<br><span style="opacity:0.65">Also pays: securing bodies and bagging dropped weapons</span>';
    if (X.active) obj += `<br><b class="go">Press Y to vote to leave</b> — ${X.votes}/${X.need}${X.voted ? ' <span style="opacity:0.7">(you voted)</span>' : ''}`;
    if (Gm.hub) {
      const ids = Object.keys(Gm.roster || {}), ready = ids.filter((id) => Gm.roster[id].ready).length;
      obj = `<b>Kit up, then hold <b>F</b> on the helicopter</b><br><span style="opacity:0.75">Tab: your stash and loadout · ${ready}/${ids.length} ready</span>`;
    }
    this.set('objective', obj);

    // crosshair
    const cam = G.R.camera;
    let spread = G.U.lerp(def.spread, def.ads, Me.adsT);
    spread *= Me.steadiness();
    if (Me.crouch) spread *= 0.75;
    spread *= 1 + Math.min((Me.hspeed || 0) / Me.SPEED.walk, 1.4) * 0.8 * (1 - Me.adsT * 0.6);
    if (!Me.onGround) spread *= 1.8;
    const k = (window.innerHeight / 2) / Math.tan((cam.fov * Math.PI) / 360);
    const gap = Math.max(3, Math.tan(((spread + (def.choke || 0)) * Math.PI) / 180) * k); // a shotgun: plus its pattern
    const ch = this.el.crosshair, ao = Me.aimScreen || { y: 0, p: 0 };
    ch.style.setProperty('--gap', gap + 'px');
    // centred on the gun's real aim point (recoil and sway move it; your view doesn't)
    ch.style.transform = `translate(${(-Math.tan(ao.y) * k).toFixed(1)}px, ${(-Math.tan(ao.p) * k).toFixed(1)}px)`;
    const hideCh = (Me.adsT > 0.6 && def.cls !== 'SG') || Me.dead || Me.lowReady;
    ch.style.opacity = hideCh ? 0 : 1;

    // timers
    this.vigT = Math.max(0, this.vigT - dt * 0.8);
    const lowHp = !Me.dead && (Me.hp < maxHp * 0.3 || (Me.body && G.Med.downable(Me.body))) ? 0.35 : 0; // (low on blood: one more hit and you're down)
    this.el.vignette.style.opacity = Math.max(this.vigT, lowHp, Me.down ? 0.6 : 0);
    this.el.vignette.classList.toggle('out', !!Me.out);
    if (this.toastT > 0) { this.toastT -= dt; if (this.toastT <= 0) this.el.toast.style.opacity = 0; }

    // damage direction arcs
    for (const d of this.dirs) {
      d.t -= dt;
      const ang = Math.atan2(-(d.from.x - Me.pos.x), -(d.from.z - Me.pos.z));
      const rel = G.U.angDiff(Me.yaw, ang);
      d.el.style.transform = `translate(-50%,-50%) rotate(${-rel}rad)`;
      d.el.style.opacity = Math.min(1, d.t);
      if (d.t <= 0) d.el.remove();
    }
    this.dirs = this.dirs.filter((d) => d.t > 0);

    // a teammate putting something on you: who, what, where, and how far along
    {
      const tr = Me.treating && !Me.dead ? [...Me.treating.values()].filter((q) => (performance.now() - q.t0) / 1000 < q.dur + 1.5) : [];
      if (Me.treating) for (const [k, q] of Me.treating) if ((performance.now() - q.t0) / 1000 >= q.dur + 1.5) Me.treating.delete(k); // (the message that ends it never came)
      this.set('treatFx', tr.map((q) => `<div class="tfx"><b>${G.U.esc(q.name)}</b> is applying ${G.U.esc(G.Med.ITEMS[q.mt].name.toLowerCase())} to your <b>${G.Med.NAME[q.part].toLowerCase()}</b><i><u style="width:${Math.round(G.U.clamp((performance.now() - q.t0) / 1000 / q.dur, 0, 1) * 100)}%"></u></i></div>`).join(''));
      this.el.treatFx.classList.toggle('hidden', !tr.length);
    }
    // downed / dead overlays
    this.el.downed.classList.toggle('hidden', !Me.down);
    this.el.downed.classList.toggle('out', !!Me.out); // (unconscious: the screen all but black)
    if (Me.down) {
      const bl = Math.round(Me.body.blood);
      this.set('downTitle', Me.out ? 'UNCONSCIOUS' : 'YOU ARE DOWN');
      this.set('bleed', `${Me.bleed == null ? 'Stable' : `Bleeding out: ${Math.ceil(Me.bleed)}s`} · blood ${bl}%`);
      this.set('downHint', Me.out ? `Out cold. A teammate's blood bags bring you round (over ${G.Med.UNCON}% blood); stop the bleeding first, or it carries on.`
        : `Your sidearm still works. A teammate can get you up with a revive${bl <= G.Med.DOWNABLE ? `, but under ${G.Med.DOWNABLE + 1}% blood the next hit puts you down again: blood bags help` : ''}.`);
    }
    this.el.deadMsg.classList.toggle('hidden', !Me.dead);

    // boss bar
    let boss = null;
    for (const ev of G.Views.enemies.values()) if (ev.alive && ev.def.boss) boss = ev;
    this.el.bossBar.classList.toggle('hidden', !boss);
    if (boss) this.el.bossFill.style.width = boss.hp + '%';

    this.updateTeam();
    // (no minimap: you find your way by looking)
  },

  updateTeam() {
    let html = '';
    for (const pv of G.Views.players.values()) {
      const st = pv.st;
      let status = '', hpPct = 0, arPct = 0;
      if (st) {
        hpPct = (st.hp / st.mhp) * 100; arPct = st.amx ? (st.ar / st.amx) * 100 : 0;
        if (st.dd) status = '<span class="kia">KIA</span>';
        else if (st.dn) status = `<span class="dn">${st.uc ? 'OUT' : 'DOWN'} ${st.bl < 0 ? 'stable' : st.bl + 's'}</span>`;
      } else status = '<span class="dim">…</span>';
      html += `<div class="tm"><div class="tn" style="color:${G.U.hex(pv.color)}">${G.Callsigns.html(pv.animal)}${G.U.esc(pv.name)} ${status}</div>
        <div class="tb"><div class="ta" style="width:${arPct}%"></div></div><div class="tb"><div class="th" style="width:${hpPct}%"></div></div></div>`;
    }
    this.set('team', html);
  },

  drawMinimap() {
    const g = this.mm, Me = G.Me, map = G.Game.map;
    if (!this.mmImg || !map) return;
    const S = 2; // pixels per metre (4px per 2m tile)
    const cx = 100, cy = 100;
    g.clearRect(0, 0, 200, 200);
    g.save();
    g.beginPath(); g.arc(cx, cy, 98, 0, Math.PI * 2); g.clip();
    g.fillStyle = 'rgba(8,10,12,0.75)'; g.fillRect(0, 0, 200, 200);
    g.translate(cx, cy);
    const camYaw = Me.dead && Me.spectating && Me.spectating.st ? Me.spectating.st.yw : Me.yaw;
    const cp = Me.dead && Me.spectating ? Me.spectating.pos : Me.pos;
    g.rotate(camYaw);
    g.translate(-cp.x * S, -cp.z * S);
    g.drawImage(this.mmImg, 0, 0);
    // doors: solid when shut, gap when open
    for (const d of map.doors) {
      g.strokeStyle = d.open ? 'rgba(200,160,90,0.35)' : '#d69a3a';
      g.lineWidth = 2;
      g.beginPath();
      if (d.axis === 'x') { g.moveTo(d.x * S, (d.z - 1) * S); g.lineTo(d.x * S, (d.z + 1) * S); }
      else { g.moveTo((d.x - 1) * S, d.z * S); g.lineTo((d.x + 1) * S, d.z * S); }
      g.stroke();
    }
    // evidence
    g.fillStyle = '#ffe680';
    for (const v of G.Views.evidence.values()) { if (v.secured) continue; g.save(); g.translate(v.x * S, v.z * S); g.rotate(Math.PI / 4); g.fillRect(-2, -2, 4, 4); g.restore(); }
    // unsecured bodies
    g.strokeStyle = '#b8b8b8'; g.lineWidth = 1.5;
    for (const ev of G.Views.enemies.values()) { if (ev.alive || ev.bodySecured) continue; const x = ev.pos.x * S, z = ev.pos.z * S; g.beginPath(); g.moveTo(x - 3, z - 3); g.lineTo(x + 3, z + 3); g.moveTo(x + 3, z - 3); g.lineTo(x - 3, z + 3); g.stroke(); }
    // first aid cabinets with something left in them: a small red cross
    if (map.cabinets && G.Game.cabs) map.cabinets.forEach((c, i) => {
      const cab = G.Game.cabs[i];
      if (!cab || (cab[0] && !cab[1].length)) return;
      g.fillStyle = '#e04040'; g.fillRect(c.x * S - 3, c.z * S - 1, 6, 2); g.fillRect(c.x * S - 1, c.z * S - 3, 2, 6);
    });
    // the weapon case
    if (map.case && !G.Game.caseOpen) { g.fillStyle = '#4fa3ff'; g.fillRect(map.case.x * S - 3, map.case.z * S - 2, 6, 4); }
    if (map.sbox && G.Game.sbox && G.Game.sbox[0] && !G.Game.sbox[1]) { g.fillStyle = '#ff4fa0'; g.fillRect(map.sbox.x * S - 2, map.sbox.z * S - 2, 4, 4); } // (the sticker box, till someone's opened it)
    if (map.abox && G.Game.abox && !(G.Game.aboxMine() || [])[1]) { g.fillStyle = '#e0a020'; g.fillRect(map.abox.x * S - 2, map.abox.z * S - 2, 4, 4); } // (the attachments box, till you've had your pick)
    // enemies: recent gunfire pings
    for (const pg of G.Views.pings) {
      g.fillStyle = `rgba(255,70,50,${Math.min(1, pg.t / 1.5) * 0.8})`;
      g.beginPath(); g.arc(pg.x * S, pg.z * S, 3.5, 0, Math.PI * 2); g.fill();
    }
    // teammates
    for (const pv of G.Views.players.values()) {
      if (!pv.st || pv.st.dd) continue;
      g.fillStyle = G.U.hex(pv.color);
      g.beginPath(); g.arc(pv.pos.x * S, pv.pos.z * S, 4, 0, Math.PI * 2); g.fill();
      if (pv.st.dn) { g.strokeStyle = '#ff3030'; g.lineWidth = 2; g.beginPath(); g.arc(pv.pos.x * S, pv.pos.z * S, 7 + Math.sin(t * 8) * 2, 0, Math.PI * 2); g.stroke(); }
    }
    g.restore();
    // me
    g.fillStyle = '#fff';
    g.beginPath(); g.moveTo(cx, cy - 7); g.lineTo(cx + 5, cy + 5); g.lineTo(cx, cy + 2); g.lineTo(cx - 5, cy + 5); g.closePath(); g.fill();
    g.strokeStyle = 'rgba(255,255,255,0.25)'; g.lineWidth = 2;
    g.beginPath(); g.arc(cx, cy, 98, 0, Math.PI * 2); g.stroke();
  },

  scoreboard(show) {
    const el = this.el.scoreboard;
    el.classList.toggle('hidden', !show);
    if (show) el.innerHTML = this.scoreboardHTML();
  },
  scoreboardHTML() {
    const rows = [];
    const me = G.Me.state();
    rows.push({ name: G.Game.myName, color: G.Game.myColor, animal: G.Game.myAnimal, st: me });
    for (const pv of G.Views.players.values()) rows.push({ name: pv.name, color: pv.color, animal: pv.animal, st: pv.st });
    let html = '<table><tr><th>Operator</th><th>Incap.</th><th>HS</th><th>Damage</th><th>Downs</th><th>Revives</th><th>Credits</th></tr>';
    for (const r of rows) {
      const sx = (r.st && r.st.sx) || [0, 0, 0, 0, 0];
      html += `<tr><td style="color:${G.U.hex(r.color)}">${G.Callsigns.html(r.animal)}${G.U.esc(r.name)}</td><td>${sx[0]}</td><td>${sx[2]}</td><td>${G.U.fmt(sx[1])}</td><td>${sx[3]}</td><td>${sx[4]}</td><td>${r.st ? G.U.fmt(r.st.cred) : '—'}</td></tr>`;
    }
    html += '</table>';
    if (G.Net.code) html += `<div class="sb-perks">Room code: <b>${G.Net.code}</b></div>`;
    return html;
  },
};
