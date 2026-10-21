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
  nadeWarn(n) {
    const el = this.el.nadeWarn;
    el.classList.toggle('hidden', !n);
    if (!n) return;
    const Me = G.Me, ang = Math.atan2(-(n.pos.x - Me.pos.x), -(n.pos.z - Me.pos.z));
    el.firstChild.style.transform = `rotate(${-G.U.angDiff(Me.yaw, ang)}rad)`;
  },
  sniperWarn(on) { this.el.vignette.classList.toggle('sniper', on); },

  update(dt) {
    const Me = G.Me, Gm = G.Game;
    if (Gm.phase !== 'level' || !Me.pos) return;
    const w = Me.cur(), def = w.def, maxHp = Me.maxHp(), chest = G.Gear.piece(Me, 'chest');

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
    const icon = G.Icons.gauge(sk === 'tube' || sk === 'loader' ? 'box' : sk, 1, 1, iw, ih), shown = Math.min(spare, 12);
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
    if (map.case && (G.Game.wcase || !G.Game.caseOpen)) { g.fillStyle = '#4fa3ff'; g.fillRect(map.case.x * S - 3, map.case.z * S - 2, 6, 4); }
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
    let html = '<table><tr><th>Operator</th><th>Kills</th><th>HS</th><th>Damage</th><th>Downs</th><th>Revives</th><th>Credits</th></tr>';
    for (const r of rows) {
      const sx = (r.st && r.st.sx) || [0, 0, 0, 0, 0];
      html += `<tr><td style="color:${G.U.hex(r.color)}">${G.Callsigns.html(r.animal)}${G.U.esc(r.name)}</td><td>${sx[0]}</td><td>${sx[2]}</td><td>${G.U.fmt(sx[1])}</td><td>${sx[3]}</td><td>${sx[4]}</td><td>${r.st ? G.U.fmt(r.st.cred) : '—'}</td></tr>`;
    }
    html += '</table>';
    if (G.Net.code) html += `<div class="sb-perks">Room code: <b>${G.Net.code}</b></div>`;
    return html;
  },
};
