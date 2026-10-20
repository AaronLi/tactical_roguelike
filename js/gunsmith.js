'use strict';
// The gunsmith (a tab in the between-level shop): rebuild your weapons part by part on a 3D model.
// Drag to orbit, scroll to zoom, hover to see what a piece is, click it (or a slot in the list) to pick
// that slot. Hovering a part in the list previews it on the gun with its stat changes; clicking fits
// it (buying it first if it isn't in your stash). Parts taken off go to your stash.
G.GunsmithUI = (() => {
  const T = THREE, GS = G.Gunsmith;
  let renderer = null, scene, camera, model = null, modelKey = '', canvas, raf = 0, active = false;
  const view = { yaw: Math.PI / 2 - 0.3, pitch: 0.15, dist: 1.4, center: new T.Vector3(), auto: true }; // right side, muzzle to the right
  const st = { wslot: 'p', slot: null, hoverPart: null, hoverSlot: null };
  const ray = new T.Raycaster();

  function init() {
    canvas = document.createElement('canvas');
    canvas.className = 'gs-canvas';
    renderer = new T.WebGLRenderer({ canvas, antialias: true, alpha: true, preserveDrawingBuffer: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    scene = new T.Scene();
    scene.environment = G.R._envMap(renderer);
    scene.add(new T.HemisphereLight(0xe8eef5, 0x2a2622, 1.0));
    const key = new T.DirectionalLight(0xffffff, 1.3); key.position.set(1, 2, 1.5); scene.add(key);
    const fill = new T.DirectionalLight(0xffffff, 0.6); fill.position.set(-1, 0.6, 1.5); scene.add(fill);
    const rim = new T.DirectionalLight(0x9fc0ff, 0.5); rim.position.set(-1.5, 0.5, -1); scene.add(rim);
    camera = new T.PerspectiveCamera(30, 1, 0.01, 20);
    let drag = null;
    canvas.addEventListener('pointerdown', (e) => { drag = { x: e.clientX, y: e.clientY, moved: 0 }; canvas.setPointerCapture(e.pointerId); view.auto = false; });
    canvas.addEventListener('pointermove', (e) => {
      if (drag) {
        const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
        drag.moved += Math.abs(dx) + Math.abs(dy); drag.x = e.clientX; drag.y = e.clientY;
        view.yaw -= dx * 0.008; view.pitch = G.U.clamp(view.pitch + dy * 0.006, -1.2, 1.2);
      } else hover(e);
    });
    canvas.addEventListener('pointerup', (e) => {
      if (drag && drag.moved < 4) { const s = pick(e); if (s) { st.slot = s; G.Audio.click(); refresh(); } }
      drag = null;
    });
    canvas.addEventListener('pointerleave', () => { if (st.hoverSlot) { st.hoverSlot = null; paint(); label(null); } });
    canvas.addEventListener('wheel', (e) => { e.preventDefault(); view.dist = G.U.clamp(view.dist * (1 + Math.sign(e.deltaY) * 0.1), 0.3, 4); }, { passive: false });
  }

  // ------------------------------------------------------------------ model
  function weapon() { const Me = G.Me; return Me.weapons[st.wslot] || Me.weapons.s || Me.weapons.p; }
  function setModel(def) {
    if (model && modelKey === def.code) return;
    if (model) { scene.remove(model); model.traverse((o) => { if (o.isMesh) { o.geometry.dispose(); o.material.dispose(); } }); }
    const { group } = G.GunModels.display(def);
    // own materials, so a part can glow when picked
    group.traverse((o) => { if (o.isMesh) o.material = o.material.clone(); });
    model = group; modelKey = def.code;
    scene.add(model);
    const box = new T.Box3().setFromObject(model), size = box.getSize(new T.Vector3());
    box.getCenter(view.center);
    if (!view.fitted || view.fitted !== def.id) { view.dist = Math.max(0.3, Math.max(size.x, size.y, size.z) * 1.45); view.fitted = def.id; }
    anchors = anchorsOf(def, box);
    paint();
  }
  // Where each editable slot is on the model (a dot goes there): the middle of that slot's part, or, for an
  // empty optional slot, where its part would go (the muzzle at the front of the barrel, a sight on top, a
  // foregrip under the front of the handguard...). The gun's bore runs along -Z, up is +Y, right is +X.
  let anchors = {};
  function anchorsOf(def, box) {
    const by = {};
    model.traverse((o) => { if (o.isMesh && o.userData.slot) (by[o.userData.slot] || (by[o.userData.slot] = new T.Box3())).expandByObject(o); });
    const c = box.getCenter(new T.Vector3()), sz = box.getSize(new T.Vector3()), mid = (s) => by[s] && !by[s].isEmpty() ? by[s].getCenter(new T.Vector3()) : null;
    const bore = mid('barrel') || c, hg = by.handguard && !by.handguard.isEmpty() ? by.handguard : null, front = (k) => box.min.z + sz.z * k;
    const out = {};
    for (const s of GS.visibleSlots(def.id, def.build)) {
      let p = mid(s.slot);
      // a barrel inside a handguard: its dot on the stretch that shows, in front of the handguard
      if (s.slot === 'barrel' && p && hg && by.barrel.min.z < hg.min.z - 0.02) p.z = (by.barrel.min.z + hg.min.z) / 2;
      if (!p) switch (s.slot) {
        case 'muzzle': p = new T.Vector3(c.x, bore.y, by.barrel ? by.barrel.min.z : box.min.z); break;
        case 'optic': p = new T.Vector3(c.x, box.max.y, c.z); break;
        case 'magnifier': { const o = mid('optic') || new T.Vector3(c.x, box.max.y, c.z); p = new T.Vector3(o.x, o.y, o.z + 0.08); break; }
        case 'fg': p = hg ? new T.Vector3(c.x, hg.min.y, hg.min.z + (hg.max.z - hg.min.z) * 0.4) : new T.Vector3(c.x, box.min.y + sz.y * 0.3, front(0.3)); break;
        case 'tac': p = hg ? new T.Vector3(hg.max.x, (hg.min.y + hg.max.y) / 2, hg.min.z + (hg.max.z - hg.min.z) * 0.25) : new T.Vector3(box.max.x, c.y, front(0.35)); break;
        case 'stock': p = new T.Vector3(c.x, c.y, box.max.z); break;
        case 'loader': p = new T.Vector3(box.min.x, c.y, c.z); break;
        case 'receiver': p = mid('base') || c; break;
        default: p = c.clone();
      }
      out[s.slot] = p;
    }
    return out;
  }
  // the dots: placed over the model every frame (they follow it as it turns)
  const _dp = new T.Vector3();
  function placeDots() {
    const host = document.getElementById('gsDots');
    if (!host || !model) return;
    const w = weapon(), slots = w ? GS.visibleSlots(w.def.id, w.def.build) : [];
    if (host.dataset.key !== modelKey + '|' + slots.map((s) => s.slot).join(',')) {
      host.dataset.key = modelKey + '|' + slots.map((s) => s.slot).join(',');
      host.innerHTML = slots.filter((s) => anchors[s.slot]).map((s) => `<button class="gs-dot${w.def.build[s.slot] ? '' : ' empty'}" data-gdot="${s.slot}" title="${GS.SLOT_LABEL[s.slot]}"></button>`).join('');
    }
    const r = host.getBoundingClientRect();
    model.updateMatrixWorld(true);
    for (const el of host.children) {
      const a = anchors[el.dataset.gdot];
      if (!a) { el.style.display = 'none'; continue; }
      _dp.copy(a).applyMatrix4(model.matrixWorld).project(camera);
      el.style.display = _dp.z > 1 ? 'none' : '';
      el.style.left = ((_dp.x + 1) / 2 * r.width) + 'px'; el.style.top = ((1 - _dp.y) / 2 * r.height) + 'px';
      el.classList.toggle('on', el.dataset.gdot === st.slot);
      el.classList.toggle('hov', el.dataset.gdot === st.hoverSlot);
    }
  }
  function paint() {
    if (!model) return;
    model.traverse((o) => {
      if (!o.isMesh || !o.material.emissive) return;
      const s = o.userData.slot;
      const on = s === st.hoverSlot ? 0x1c6aa0 : s === st.slot && s !== 'base' ? 0x0c3a5c : 0; // cool blue, so it never reads as brass
      o.material.emissive.setHex(on);
    });
  }
  function hit(e) {
    if (!model) return null;
    const r = canvas.getBoundingClientRect();
    ray.setFromCamera(new T.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), camera);
    const h = ray.intersectObject(model, true)[0];
    return h ? h.object.userData.slot : null;
  }
  function pick(e) { const s = hit(e); return s && s !== 'base' && GS.visibleSlots(weapon().def.id, weapon().def.build).some((x) => x.slot === s) ? s : null; }
  function hover(e) {
    const s = pick(e);
    if (s !== st.hoverSlot) { st.hoverSlot = s; paint(); label(s); }
  }
  function label(s) {
    const el = document.getElementById('gsHover');
    if (!el) return;
    const w = weapon(), pid = s && w.def.build[s], p = pid && GS.PARTS[pid];
    el.innerHTML = s ? `<b>${GS.SLOT_LABEL[s]}</b> ${p ? G.U.esc(p.name) : 'empty'}` : '';
  }
  function loop() {
    if (!active) return;
    raf = requestAnimationFrame(loop);
    const host = canvas.parentElement;
    if (!host || document.getElementById('shop').classList.contains('hidden')) { active = false; return; }
    const w = host.clientWidth, h = host.clientHeight;
    if (canvas.width !== Math.floor(w * renderer.getPixelRatio()) || canvas.height !== Math.floor(h * renderer.getPixelRatio())) { renderer.setSize(w, h, false); camera.aspect = w / Math.max(1, h); camera.updateProjectionMatrix(); }
    if (view.auto) view.yaw = Math.PI / 2 - 0.3 + Math.sin(performance.now() / 3000) * 0.5; // a slow sway around the side view
    const c = view.center, d = view.dist;
    camera.position.set(c.x + Math.sin(view.yaw) * Math.cos(view.pitch) * d, c.y + Math.sin(view.pitch) * d, c.z + Math.cos(view.yaw) * Math.cos(view.pitch) * d);
    camera.lookAt(c);
    renderer.render(scene, camera);
    placeDots();
  }

  // ------------------------------------------------------------------ stats
  const pct = (v) => `${v > 0 ? '+' : ''}${Math.round(v)}%`;
  // [label, value(def), better: 1 higher / -1 lower / 0 n/a, format, bar range]
  const ROWS = [
    ['Ergonomics', (d) => d.ergo, 1, (v) => Math.round(v), [0, 100]],
    ['Recoil', (d) => d.recoil, -1, (v) => v.toFixed(2) + '°', [0, 6]],
    ['Aimed spread', (d) => d.ads, -1, (v) => v.toFixed(2) + '°', [0, 5]],
    ['Hip spread', (d) => d.spread, -1, (v) => v.toFixed(1) + '°', [0, 8]],
    ['Damage', (d) => (d.explosive ? d.explosive.dmg : d.dmg * d.pellets), 1, (v) => Math.round(v), [0, 300]],
    ['Range', (d) => d.range, 1, (v) => Math.round(v) + ' m', [0, 150]],
    ['Fire rate', (d) => d.rpm, 1, (v) => Math.round(v) + ' rpm', [0, 2000]],
    ['Capacity', (d) => d.mag, 1, (v) => Math.round(v), [0, 200]],
    ['Reload', (d) => d.reload, -1, (v) => v.toFixed(2) + ' s', [0, 6]],
    ['Weight', (d) => d.weight, -1, (v) => v.toFixed(2) + ' kg', [0, 12]],
    ['Mobility', (d) => d.speed * 100, 1, (v) => Math.round(v) + '%', [60, 110]],
    ['Sight', (d) => (d.magLevels ? d.magLevels[d.magLevels.length - 1] : d.magnif || 1), 0, (v) => v + '×', [1, 8]],
  ];
  function statsHtml(cur, prev) {
    let h = '';
    for (const [name, f, better, fmt, [lo, hi]] of ROWS) {
      const a = f(cur), b = prev ? f(prev) : a;
      const diff = b - a, good = better === 0 || Math.abs(diff) < 1e-6 ? '' : (diff > 0) === (better > 0) ? 'up' : 'down';
      const w = G.U.clamp((b - lo) / (hi - lo), 0, 1) * 100;
      h += `<div class="gs-stat ${good}"><span>${name}</span><div><i style="width:${w}%"></i></div><b>${fmt(b)}${good ? ` <em>${diff > 0 ? '▲' : '▼'}</em>` : ''}</b></div>`;
    }
    const c0 = G.CALIBERS[G.calOf(cur)], c1 = G.CALIBERS[G.calOf(prev || cur)];
    if (c1) h += `<div class="gs-stat${c0 !== c1 ? ' up' : ''}"><span>Caliber</span><div></div><b>${c1.name}${prev && prev.id !== cur.id ? ` <em>${G.U.esc(prev.name)}</em>` : ''}</b></div>`;
    h += `<div class="gs-stat"><span>Report</span><div></div><b>${(prev || cur).sup ? 'Suppressed' : (prev || cur).device === 'none' ? 'Bare muzzle' : (prev || cur).device}</b></div>`;
    return h;
  }
  function partEffects(p) {
    const s = p.st || {}, out = [];
    const add = (txt, good) => out.push(`<span class="${good ? 'g' : 'b'}">${txt}</span>`);
    if (s.ergo) add(`Ergo ${s.ergo > 0 ? '+' : ''}${s.ergo}`, s.ergo > 0);
    if (s.recoil) add(`Recoil ${pct(s.recoil)}`, s.recoil < 0);
    if (s.acc) add(`Spread ${pct(s.acc)}`, s.acc < 0);
    if (s.hip) add(`Hip ${pct(s.hip)}`, s.hip < 0);
    if (s.vel) add(`Velocity ${pct(s.vel)}`, s.vel > 0);
    if (s.rpm) add(`Rate ${pct(s.rpm)}`, s.rpm > 0);
    if (s.spin) add(`Spin-up ${pct(s.spin)}`, s.spin < 0);
    if (s.reload) add(`Reload ${pct(s.reload)}`, s.reload < 0);
    if (s.weight) add(`${s.weight > 0 ? '+' : ''}${s.weight.toFixed(2)} kg`, s.weight < 0);
    if (p.becomes) out.push(`<span class="g">Becomes the ${G.U.esc(G.WEAPONS[p.becomes].name)} (${G.CALIBERS[G.calOf(G.WEAPONS[p.becomes])].name})</span>`);
    if (p.set && p.set.perLoad) out.push(`<span>${p.set.perLoad} shells a push</span>`);
    if (p.set && p.set.cap) out.push(`<span>${p.set.cap} rds</span>`);
    if (p.set && p.set.levels) out.push(`<span>${p.set.levels[0]}–${p.set.levels[p.set.levels.length - 1]}×</span>`);
    else if (p.set && p.set.magnif) out.push(`<span>${p.set.magnif}×</span>`);
    if (p.set && p.set.magnifier) out.push(`<span>1× / ${p.set.magnifier}×</span>`);
    if (p.set && p.set.light) out.push('<span>Light</span>');
    if (p.set && p.set.laser) out.push(`<span>${p.set.laser === 'g' ? 'Green' : 'Red'} laser</span>`);
    if (p.set && p.set.sup) out.push('<span class="g">Suppressed</span>');
    if (p.provides) out.push(`<span>+ ${Object.keys(p.provides).map((k) => GS.SLOT_LABEL[k]).join(', ')}</span>`);
    return out.join(' ');
  }

  // what a part fits: its interface, how many weapons take it, and which of yours
  function fitsLine(p, exceptId) {
    const ids = GS.fits(p.mount), mine = Object.values(G.Me.weapons).filter((w) => w && w.def.id !== exceptId && ids.includes(w.def.id));
    return `<em class="gs-fit">${G.U.esc(GS.ifaceName(p.mount))}${ids.length > 1 ? ` · fits ${ids.length} weapons` : ''}${mine.length ? ` · also your ${mine.map((w) => w.def.name).join(', ')}` : ''}</em>`;
  }

  // ------------------------------------------------------------------ build changes
  const stash = () => G.Me.stash || (G.Me.stash = {});
  const toStash = (pid) => { const s = stash(); s[pid] = (s[pid] || 0) + 1; };
  const fromStash = (pid) => { const s = stash(); if (!s[pid]) return false; if (--s[pid] <= 0) delete s[pid]; return true; };
  // for sale: what he has in stock, and always the right core part for a gun that's missing one or has one
  // that doesn't fit (its own barrel, after a receiver swap)
  const forSale = (p) => (!p.factory && G.Shop.partStock && G.Shop.partStock.has(p.id)) || needed(p);
  const needed = (p) => { const w = weapon(), d = w && w.def; return !!d && GS.PLATFORMS[d.id].defaults[p.slot] === p.id && d.missing.includes(p.slot); };
  function apply(w, build) {
    G.Me.refit(w, build);
    if (G.GunAudio.available()) G.GunAudio.buildDry(w.def.soundKey);
  }
  function install(slot, pid) {
    const w = weapon(), build = Object.assign({}, w.def.build), p = GS.PARTS[pid];
    if (!p || build[slot] === pid || G.Shop.ready) return;
    if (!fromStash(pid)) {
      if (!forSale(p) || !G.Shop.spend(GS.buyPrice(p))) return;
      if (G.Shop.partStock) G.Shop.partStock.delete(pid); // one of each in stock
    } else G.Audio.pickup();
    if (build[slot]) toStash(build[slot]);
    build[slot] = pid;
    for (const r of GS.prune(w.def.id, build)) toStash(r);
    apply(w, build);
    st.hoverPart = null;
    G.Shop.render();
  }
  function remove(slot) {
    const w = weapon(), build = Object.assign({}, w.def.build);
    const sl = GS.slotsOf(w.def.id, build).find((s) => s.slot === slot);
    if (!sl || sl.req || !build[slot] || G.Shop.ready) return;
    toStash(build[slot]); delete build[slot];
    for (const r of GS.prune(w.def.id, build)) toStash(r);
    apply(w, build); G.Audio.click();
    G.Shop.render();
  }
  function sell(pid) {
    const p = GS.PARTS[pid];
    if (!p || p.factory || G.Shop.ready || !fromStash(pid)) return;
    G.Me.credits += Math.floor(p.price * 0.5);
    G.Audio.buy();
    G.Shop.render();
  }

  // ------------------------------------------------------------------ html
  function html() {
    const Me = G.Me, w = weapon();
    if (!w) return '<div class="gs-empty">No weapon to work on.</div>';
    const def = w.def, build = def.build, slots = GS.visibleSlots(def.id, build);
    if (!st.slot || !slots.some((s) => s.slot === st.slot)) st.slot = slots[0] && slots[0].slot;
    const preview = st.hoverPart ? previewDef(def, st.slot, st.hoverPart) : null;
    const tabs = ['p', 's'].map((k) => { const ww = Me.weapons[k]; return `<button class="tab${st.wslot === k ? ' on' : ''}" data-gw="${k}" ${ww ? '' : 'disabled'}>${k === 'p' ? 'Primary' : 'Sidearm'}: ${ww ? ww.def.name : '—'}</button>`; }).join('');
    let slotRows = '';
    for (const s of slots) {
      const p = build[s.slot] && GS.PARTS[build[s.slot]];
      const bad = p && p.mount !== s.mount;
      slotRows += `<div class="gs-slot${s.slot === st.slot ? ' on' : ''}${s.parent ? ' sub' : ''}${bad || (!p && s.req) ? ' misfit' : ''}" data-gslot="${s.slot}"><span>${GS.SLOT_LABEL[s.slot]}${s.req ? '' : ' <small>opt.</small>'}</span><b>${p ? G.U.esc(p.name) : '<em>empty</em>'}<i>${bad ? `doesn't fit the ${G.U.esc(GS.ifaceName(s.mount))}: it won't fire` : G.U.esc(GS.ifaceName(s.mount))}</i></b></div>`;
    }
    // parts that fit the picked slot: fitted, in your stash, for sale, then the rest (out of stock / later)
    const cur = slots.find((s) => s.slot === st.slot);
    let list = '';
    if (cur) {
      const parts = GS.compatible(cur.mount).filter((p) => !p.factory || p.plat === def.id || (Me.stash || {})[p.id] || build[cur.slot] === p.id);
      const rank = (p) => (build[cur.slot] === p.id ? 0 : (Me.stash || {})[p.id] ? 1 : forSale(p) ? 2 : 3);
      parts.sort((a, b) => rank(a) - rank(b) || a.price - b.price);
      for (const p of parts) {
        const r = rank(p), n = (Me.stash || {})[p.id] || 0, factoryHere = p.factory && p.plat === def.id;
        let action;
        if (r === 0) action = cur.req ? '<span class="tag">Fitted</span>' : `<button class="btn small" data-gremove="${cur.slot}">Remove</button>`;
        else if (r === 1) action = `<button class="btn small buy" data-ginstall="${p.id}">Fit (stash ×${n})</button>${p.factory ? '' : ` <button class="btn small" data-gsell="${p.id}">Sell ¢${G.U.fmt(Math.floor(p.price * 0.5))}</button>`}`;
        else if (r === 2) action = `<button class="btn small buy" data-ginstall="${p.id}" ${Me.credits < GS.buyPrice(p) ? 'disabled' : ''}>¢${G.U.fmt(GS.buyPrice(p))}</button>`;
        else action = `<span class="tag">${factoryHere ? 'Comes with the gun' : p.tier > Math.min(3, 1 + Math.floor((G.Shop.level || 1) / 2)) ? 'Available later' : 'Out of stock'}</span>`;
        list += `<div class="gs-part${r === 0 ? ' fitted' : ''}${r === 3 ? ' na' : ''}" data-gpart="${p.id}">
          <div class="gs-pn"><small>${G.U.esc(p.brand)}</small>${G.U.esc(p.name)}${fitsLine(p, def.id)}</div>
          <div class="gs-pe">${partEffects(p) || '<span>—</span>'}</div>
          <div class="gs-pa">${action}</div></div>`;
      }
    }
    return `<div class="gs-wrap">
      <div class="gs-tabs">${tabs}</div>
      <div class="gs-main">
        <div class="gs-left"><div class="gs-view"><div id="gsHover" class="gs-hover"></div><div id="gsDots" class="gs-dots"></div><div class="gs-hint">Drag to turn · scroll to zoom · click a part or a dot</div></div>
        <div class="gs-list"><div class="gs-sub">${cur ? GS.SLOT_LABEL[cur.slot] + (cur.req ? '' : ' (optional)') : ''}</div>${list}</div></div>
        <div class="gs-side"><div class="gs-title">${def.name}${def.modified ? ' <small>CUSTOM</small>' : ''}${def.missing.length ? ' <small class="broken">WON\'T FIRE</small>' : ''}</div>
          <div class="gs-slots">${slotRows}</div>
          <div class="gs-stats">${statsHtml(def, preview)}</div></div>
      </div>
    </div>`;
  }
  function previewDef(def, slot, pid) {
    const b = Object.assign({}, def.build, { [slot]: pid });
    GS.prune(def.id, b);
    const conv = GS.convert(def.id, b); // a receiver kit: the gun it would become
    return conv ? GS.compile(conv.id, conv.build) : GS.compile(def.id, b);
  }

  // ------------------------------------------------------------------ mount into the shop
  function show(container) {
    if (!renderer) init();
    container.classList.add('gs-host');
    container.innerHTML = html();
    const w = weapon();
    if (w) {
      container.querySelector('.gs-view').prepend(canvas);
      setModel(st.hoverPart ? previewDef(w.def, st.slot, st.hoverPart) : w.def);
      paint();
    }
    if (!active) { active = true; loop(); }
  }
  function refresh() { const el = document.getElementById('shopItems'); if (el && el.classList.contains('gs-host')) show(el); }
  function onClick(e) {
    const t = e.target;
    const gw = t.closest('[data-gw]'); if (gw && !gw.disabled) { st.wslot = gw.dataset.gw; st.slot = null; st.hoverPart = null; st.hoverSlot = null; view.auto = true; G.Audio.click(); return refresh(); }
    const gs = t.closest('[data-gslot]'); if (gs) { st.slot = gs.dataset.gslot; st.hoverPart = null; G.Audio.click(); return refresh(); }
    const gd = t.closest('[data-gdot]'); if (gd) { st.slot = gd.dataset.gdot; st.hoverPart = null; G.Audio.click(); return refresh(); }
    const gi = t.closest('[data-ginstall]'); if (gi && !gi.disabled) return install(st.slot, gi.dataset.ginstall);
    const gr = t.closest('[data-gremove]'); if (gr) return remove(gr.dataset.gremove);
    const gl = t.closest('[data-gsell]'); if (gl) return sell(gl.dataset.gsell);
  }
  // hovering a part previews it on the gun (model and stats)
  function onHover(e) {
    const w = weapon();
    if (!w) return;
    const dot = e.target.closest('[data-gdot]');
    if (dot || st.dotHover) { const s = dot ? dot.dataset.gdot : null; if (s !== st.hoverSlot) { st.hoverSlot = s; paint(); label(s); } st.dotHover = !!dot; if (dot) return; }
    const row = e.target.closest('[data-gpart]');
    let pid = row ? row.dataset.gpart : null;
    if (pid === w.def.build[st.slot]) pid = null; // that's what's fitted already
    if (pid === st.hoverPart) return;
    st.hoverPart = pid;
    const prev = pid ? previewDef(w.def, st.slot, pid) : null;
    const statsEl = document.querySelector('.gs-stats');
    if (statsEl) statsEl.innerHTML = statsHtml(w.def, prev);
    setModel(prev || w.def);
    st.hoverSlot = pid ? st.slot : null;
    paint();
  }
  function hide() { active = false; cancelAnimationFrame(raf); const el = document.getElementById('shopItems'); if (el) el.classList.remove('gs-host'); }

  return { show, hide, onClick, onHover, refresh, state: st, partEffects, fitsLine, _setModel: (d) => setModel(d), _view: view, _canvas: () => canvas };
})();
