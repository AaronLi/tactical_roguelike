'use strict';
// The gunsmith (a tab in the between-level shop): rebuild your weapons part by part on a 3D model.
// Drag to orbit, scroll to zoom, hover to see what a piece is, click it (or a slot in the list) to pick
// that slot. Hovering a part in the list previews it on the gun with its stat changes; clicking fits
// it (buying it first if it isn't in your stash). Parts taken off go to your stash.
// Stickers (its Stickers tab): pick one you own, click the gun where it goes (it shows there, faint), size it, turn it,
// mirror it, and stick it on: it's on that gun for good (js/stickers.js).

G.GunsmithUI = (() => {
  const T = THREE, GS = G.Gunsmith;
  let renderer = null, scene, camera, model = null, modelKey = '', canvas, raf = 0, active = false;
  const view = { yaw: Math.PI / 2 - 0.3, pitch: 0.15, dist: 1.4, center: new T.Vector3(), auto: true }; // right side, muzzle to the right
  const st = { wslot: 'p', slot: null, hoverPart: null, hoverSlot: null,
    // the sticker tool: on, the one picked, its size (m), turn (rad) and mirroring, where it's been put (not stuck yet:
    // { p, n } in the gun's frame) or where the pointer is on the gun (hover), and the faint one to redraw
    stk: false, stkPick: null, stkK: 0.035, stkR: 0, stkF: 0, stkAt: null, stkHover: null, stkDirty: false };
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
      if (st.stk && !drag) { stkHoverAt(e); return; }
      if (drag) {
        const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
        drag.moved += Math.abs(dx) + Math.abs(dy); drag.x = e.clientX; drag.y = e.clientY;
        view.yaw -= dx * 0.008; view.pitch = G.U.clamp(view.pitch + dy * 0.006, -1.2, 1.2);
      } else hover(e);
    });
    canvas.addEventListener('pointerup', (e) => {
      if (drag && drag.moved < 4 && st.stk) stkPlace(e);
      else if (drag && drag.moved < 4) { const s = pick(e); if (s) { st.slot = s; G.Audio.click(); refresh(); } }
      drag = null;
    });
    canvas.addEventListener('pointerleave', () => { if (st.hoverSlot) { st.hoverSlot = null; paint(); label(null); } });
    canvas.addEventListener('wheel', (e) => { e.preventDefault(); if (st.stk && st.stkPick && (e.shiftKey || e.ctrlKey || e.altKey)) return stkWheel(e); view.dist = G.U.clamp(view.dist * (1 + Math.sign(e.deltaY) * 0.1), 0.3, 4); }, { passive: false });
  }

  // ------------------------------------------------------------------ model
  function weapon() { const Me = G.Me; return Me.weapons[st.wslot] || Me.weapons.s || Me.weapons.p; }
  // (skin: the stickers shown on it, the gun's own by default)
  function setModel(def, skin = (weapon() || {}).stickers) {
    const key = def.code + '#' + G.Stickers.key(skin);
    if (model && modelKey === key) return;
    if (model) { scene.remove(model); model.traverse((o) => { if (o.isMesh) { o.geometry.dispose(); if (!o.userData.sticker) o.material.dispose(); } }); } // (a sticker's material is the picture's, shared)
    const { group } = G.GunModels.display(def);
    // own materials, so a part can glow when picked
    group.traverse((o) => { if (o.isMesh) o.material = o.material.clone(); });
    G.Stickers.decorate(group, skin);
    model = group; modelKey = key; st.stkDirty = true;
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
        case 'tac': case 'tacL': { // (beside a clamp-on rail mount, or the handguard's side rail)
          const rm = by.railmount && !by.railmount.isEmpty() ? by.railmount : null, R = s.slot === 'tac';
          p = rm ? new T.Vector3(R ? rm.max.x + 0.012 : rm.min.x - 0.012, (rm.min.y + rm.max.y) / 2, (rm.min.z + rm.max.z) / 2)
            : hg ? new T.Vector3(R ? hg.max.x : hg.min.x, (hg.min.y + hg.max.y) / 2, hg.min.z + (hg.max.z - hg.min.z) * 0.25) : new T.Vector3(R ? box.max.x : box.min.x, c.y, front(0.35));
          break;
        }
        case 'railmount': p = new T.Vector3(c.x, bore.y, hg ? hg.min.z - 0.03 : by.barrel ? by.barrel.max.z - 0.05 : front(0.3)); break;
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
    host.style.display = st.stk ? 'none' : ''; // (the sticker tool: no slots to pick)
    const w = weapon(), slots = w ? GS.visibleSlots(w.def.id, w.def.build) : [];
    const shop = slots.map((s) => (buyable(s.slot) ? 1 : 0)).join(''), key = modelKey + '|' + slots.map((s) => s.slot).join(',') + '|' + shop;
    if (host.dataset.key !== key) {
      host.dataset.key = key;
      host.innerHTML = slots.filter((s) => anchors[s.slot]).map((s) => { const b = buyable(s.slot); return `<button class="gs-dot${w.def.build[s.slot] ? '' : ' empty'}${b ? ' shop' : ''}" data-gdot="${s.slot}" title="${GS.slotLabel(s)}${b ? ' · parts for it in the store' : ''}">${b ? '<i>!</i>' : ''}</button>`; }).join('');
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
      if (!o.isMesh || o.userData.sticker || !o.material.emissive) return;
      const s = o.userData.slot;
      const on = s === st.hoverSlot ? 0x1c6aa0 : s === st.slot && s !== 'base' ? 0x0c3a5c : 0; // cool blue, so it never reads as brass
      o.material.emissive.setHex(on);
    });
  }
  function hit(e) {
    if (!model) return null;
    const r = canvas.getBoundingClientRect();
    ray.setFromCamera(new T.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), camera);
    const h = ray.intersectObject(model, true).find((q) => !q.object.userData.sticker);
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
    const sl = s && GS.visibleSlots(w.def.id, w.def.build).find((q) => q.slot === s);
    el.innerHTML = s ? `<b>${sl ? GS.slotLabel(sl) : GS.SLOT_LABEL[s]}</b> ${p ? G.U.esc(p.name) : 'empty'}` : '';
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
    if (st.stkDirty) { st.stkDirty = false; G.Stickers.ghost(model, stkTry()); }
    renderer.render(scene, camera);
    placeDots();
  }

  // ------------------------------------------------------------------ stats
  const pct = (v) => `${v > 0 ? '+' : ''}${Math.round(v)}%`;
  // [label, value(def), better: 1 higher / -1 lower / 0 n/a, format, bar range]
  const ROWS = [
    ['Ergonomics', (d) => d.ergo, 1, (v) => Math.round(v), [0, 100]],
    ['Recoil', (d) => d.recoil, -1, (v) => v.toFixed(2) + '°', [0, 6]],
    ['Accuracy', (d) => d.ads * 120, -1, (v) => (v < 10 ? v.toFixed(1) : Math.round(v)) + ' MOA', [0, 20]], // (aimed: the group the gun itself makes)
    ['Hip spread', (d) => d.spread, -1, (v) => v.toFixed(1) + '°', [0, 8]],
    ['Aim sway', (d) => G.aimSway(d).score * 100, -1, (v) => Math.round(v) + '%', [0, 400]], // (an M4's 100%: a stock to your shoulder steadies it most)
    ['Energy', (d) => (d.explosive ? d.explosive.dmg : G.Ballistics.energy(d)), 1, (v) => G.U.fmt(Math.round(v)) + ' J', [0, 4000]], // (its round's at 10 m, with ball: js/ballistics.js)
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
      const diff = b - a, good = better === 0 || Math.abs(diff) < 1e-6 || fmt(a) === fmt(b) ? '' : (diff > 0) === (better > 0) ? 'up' : 'down';
      const w = G.U.clamp((b - lo) / (hi - lo), 0, 1) * 100;
      h += `<div class="gs-stat ${good}"><span>${name}</span><div><i style="width:${w}%"></i></div><b>${fmt(b)}${good ? ` <em>${diff > 0 ? '▲' : '▼'} ${fmt(Math.abs(diff))}</em>` : ''}</b></div>`;
    }
    const c0 = G.CALIBERS[G.calOf(cur)], c1 = G.CALIBERS[G.calOf(prev || cur)];
    if (c1) h += `<div class="gs-stat${c0 !== c1 ? ' up' : ''}"><span>Caliber</span><div></div><b>${c1.name}${prev && prev.id !== cur.id ? ` <em>${G.U.esc(prev.name)}</em>` : ''}</b></div>`;
    h += `<div class="gs-stat"><span>Report</span><div></div><b>${(prev || cur).sup ? 'Suppressed' : (prev || cur).device === 'none' ? 'Bare muzzle' : (prev || cur).device}</b></div>`;
    // each load through this build's barrel: how fast it leaves, and the energy it leaves with (all its pellets)
    const d = prev || cur, cal = G.calOf(d), grp = G.CALIBERS[cal] && G.AMMO_TYPES[G.CALIBERS[cal].group];
    if (grp && G.MUZZLE_V[cal] && !d.explosive && d.cls !== 'RAIL') {
      h += `<div class="gs-loads"><span>Load</span><span>Muzzle</span><span>Energy</span>`;
      for (const am of grp) {
        const v = G.roundSpeed(d, am), v0 = G.roundSpeed(cur, am), e = G.Ballistics.energy(d, am, 0), ch = Math.round(v) - Math.round(v0);
        const cls = ch ? (ch > 0 ? ' class="up"' : ' class="down"') : '';
        h += `<span>${G.AMMO[am].name}</span><b${cls}>${Math.round(v)} m/s${ch ? ` <em>${ch > 0 ? '+' : ''}${ch}</em>` : ''}</b><b${cls}>${G.U.fmt(Math.round(e))} J</b>`;
      }
      h += '</div>';
    }
    return h;
  }
  // the stat card's: what the part you're hovering would change (with a receiver kit, the gun it makes), then the stats
  function sideStats(cur, prev, pid) {
    const p = pid && GS.PARTS[pid];
    const head = prev ? `<div class="gs-change"><div class="gs-ch-h">${p ? `Fitting ${G.U.esc(p.name)}` : 'With this part'}</div><div class="gs-pe">${prev.id !== cur.id ? `<span class="g">Makes it a ${G.U.esc(prev.name)}</span>` : ''}${deltaHtml(cur, prev)}</div></div>` : '';
    return head + statsHtml(cur, prev);
  }
  // just what a change would change, old to new (good green, bad red)
  function deltaHtml(cur, prev) {
    const out = [];
    for (const [name, f, better, fmt] of ROWS) {
      const a = f(cur), b = f(prev);
      if (Math.abs(b - a) < 1e-6 || fmt(a) === fmt(b)) continue;
      out.push(`<span class="${better === 0 ? '' : (b > a) === (better > 0) ? 'g' : 'b'}">${name} ${fmt(a)} → ${fmt(b)}</span>`);
    }
    const c0 = G.CALIBERS[G.calOf(cur)], c1 = G.CALIBERS[G.calOf(prev)];
    if (c1 && c0 !== c1) out.push(`<span class="g">${c0 ? c0.name + ' → ' : ''}${c1.name}</span>`);
    if (!!cur.sup !== !!prev.sup) out.push(`<span class="${prev.sup ? 'g' : 'b'}">${prev.sup ? 'Suppressed' : 'Unsuppressed'}</span>`);
    const v0 = G.roundSpeed(cur), v1 = G.roundSpeed(prev);
    if (v0 && v1 && Math.round(v0) !== Math.round(v1)) out.push(`<span class="${v1 > v0 ? 'g' : 'b'}">Muzzle ${Math.round(v0)} → ${Math.round(v1)} m/s</span>`);
    return out.length ? out.join('') : '<span>No change to the numbers</span>';
  }
  function partEffects(p) {
    const s = p.st || {}, out = [];
    const add = (txt, good) => out.push(`<span class="${good ? 'g' : 'b'}">${txt}</span>`);
    if (s.ergo) add(`Ergo ${s.ergo > 0 ? '+' : ''}${s.ergo}`, s.ergo > 0);
    if (s.recoil) add(`Recoil ${pct(s.recoil)}`, s.recoil < 0);
    if (s.acc) add(`Spread ${pct(s.acc)}`, s.acc < 0);
    if (s.hip) add(`Hip ${pct(s.hip)}`, s.hip < 0);
    // (a barrel's: from its length against the factory one's, as it flies: js/data.js roundSpeed)
    const gb = p.set && p.set.barrelIn != null && p.plat && (G.GUN_SPECS[p.plat] || {}).barrel, vel = gb ? Math.round((Math.pow(p.set.barrelIn / gb, 0.2) - 1) * 100) : s.vel;
    if (p.set && (p.set.ported || (p.set.sup && p.slot === 'barrel' && (G.WEAPONS[p.plat] || {}).integral))) add('Subsonic (ported)', false); // (an integral barrel: it leaves under 310 m/s whatever its length)
    else if (vel) add(`Velocity ${pct(vel)}`, vel > 0);
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
    if (p.chassis) out.push(`<span>Its own ${Object.keys(p.chassis).map((k) => GS.SLOT_LABEL[k]).join(', ')}</span>`);
    return out.join(' ');
  }

  // what a part fits: its interface, how many weapons take it, and which of yours
  function fitsLine(p, exceptId) {
    const ids = GS.fitsPart(p), mine = Object.values(G.Me.weapons).filter((w) => w && w.def.id !== exceptId && ids.includes(w.def.id));
    return `<em class="gs-fit">${G.U.esc(GS.ifaceName(p.mount))}${ids.length > 1 ? ` · fits ${ids.length} weapons` : ''}${mine.length ? ` · also your ${mine.map((w) => w.def.name).join(', ')}` : ''}</em>`;
  }

  // ------------------------------------------------------------------ build changes
  const stash = () => G.Me.stash || (G.Me.stash = {});
  const toStash = (pid) => { const s = stash(); s[pid] = (s[pid] || 0) + 1; };
  const fromStash = (pid) => { const s = stash(); if (!s[pid]) return false; if (--s[pid] <= 0) delete s[pid]; return true; };
  // for sale: what he has in stock, and always the right core part for a gun that's missing one or has one
  // that doesn't fit (its own barrel, after a receiver swap)
  const forSale = (p) => (!p.factory && G.Shop.partStock && G.Shop.partStock.has(p.id) && G.Shop.inStock('part:' + p.id)) || needed(p);
  const needed = (p) => { const w = weapon(), d = w && w.def; return !!d && GS.PLATFORMS[d.id].defaults[p.slot] === p.id && d.missing.includes(p.slot); };
  // does the store have a part for this slot of the gun you're working on (one that fits it, and isn't the one on it)?
  // Its dot on the model and its row in the list get a "!".
  function buyable(slot) {
    const w = weapon(), s = w && GS.visibleSlots(w.def.id, w.def.build).find((q) => q.slot === slot);
    return !!s && GS.compatible(s.mount).some((p) => p.id !== w.def.build[slot] && forSale(p));
  }
  function apply(w, build) {
    G.Me.refit(w, build);
    if (G.GunAudio.available()) G.GunAudio.buildDry(w.def.soundKey);
  }
  function install(slot, pid) {
    const w = weapon(), build = Object.assign({}, w.def.build), p = GS.PARTS[pid];
    if (!p || build[slot] === pid || G.Shop.ready) return;
    if (!fromStash(pid)) {
      if (!forSale(p) || !G.Shop.afford(GS.buyPrice(p))) return;
      // from his stock (the squad's: the host's count, js/shop.js take), unless it's the core part the gun needs
      if (!needed(p)) { G.Shop.take('part:' + pid, () => { if (weapon() !== w || !G.Shop.spend(GS.buyPrice(p))) return false; toStash(pid); install(slot, pid); }); return; }
      if (!G.Shop.spend(GS.buyPrice(p))) return;
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
  // the gun's stock grip in another finish: it's the same grip, so it costs nothing and goes on as it is
  function reskin(pid) {
    const w = weapon(), build = Object.assign({}, w.def.build);
    if (!GS.skins(w.def.id).some((p) => p.id === pid) || !GS.plainGrip(GS.PARTS[build.grip] || {}) || G.Shop.ready) return;
    build.grip = pid;
    apply(w, build); G.Audio.click();
    G.Shop.render();
  }
  function sell(pid) {
    const p = GS.PARTS[pid];
    if (!p || G.Shop.ready || !fromStash(pid)) return;
    G.Me.credits += GS.sellPrice(p);
    G.Audio.buy();
    G.Shop.render();
  }

  // ------------------------------------------------------------------ stickers (js/stickers.js)
  const SK = () => G.Stickers;
  const stkName = (n) => n.replace(/\.[a-z0-9]+$/i, '').replace(/[-_]+/g, ' ');
  // where on the gun the pointer is: a point on its surface and the way that surface faces, in the gun's frame
  function surfaceAt(e) {
    if (!model) return null;
    const r = canvas.getBoundingClientRect();
    ray.setFromCamera(new T.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), camera);
    const h = ray.intersectObject(model, true).find((q) => !q.object.userData.sticker && q.face && !(q.object.material && q.object.material.transparent));
    if (!h) return null;
    model.updateMatrixWorld(true);
    const inv = model.matrixWorld.clone().invert(), n = h.face.normal.clone().applyMatrix3(new T.Matrix3().getNormalMatrix(h.object.matrixWorld)).normalize();
    if (n.dot(ray.ray.direction) > 0) n.negate(); // (the inside of a part: the side you're looking at)
    const p = h.point.clone().applyMatrix4(inv); n.transformDirection(inv);
    return { p: [p.x, p.y, p.z], n: [n.x, n.y, n.z] };
  }
  // the sticker as it'd go on: where it's been put, or under the pointer
  function stkTry() {
    const at = st.stk && st.stkPick && (st.stkAt || st.stkHover);
    return at ? { s: st.stkPick, p: at.p, n: at.n, r: st.stkR, k: st.stkK, f: st.stkF } : null;
  }
  function stkHoverAt(e) {
    if (!st.stkPick || st.stkAt) return;
    const at = surfaceAt(e);
    if (!at && !st.stkHover) return;
    st.stkHover = at; st.stkDirty = true;
  }
  function stkPlace(e) {
    const w = weapon();
    if (!st.stkPick || !w || (w.stickers || []).length >= SK().MAX) return;
    const at = surfaceAt(e);
    if (!at) return;
    st.stkAt = at; st.stkDirty = true; G.Audio.click();
    stkPanel();
  }
  // Shift + scroll: its size; Ctrl (or Alt) + scroll: its turn
  function stkWheel(e) {
    const d = Math.sign(e.deltaY);
    if (e.shiftKey) st.stkK = G.U.clamp(st.stkK * (1 - d * 0.08), SK().MIN_K, SK().MAX_K);
    else st.stkR = Math.atan2(Math.sin(st.stkR - d * Math.PI / 12), Math.cos(st.stkR - d * Math.PI / 12));
    st.stkDirty = true; stkControls();
  }
  // the sliders (their read-outs) as the numbers are now
  function stkControls() {
    const box = document.querySelector('.stk-ctl');
    if (!box) return;
    const sz = box.querySelector('[data-gstksize]'), rt = box.querySelector('[data-gstkrot]');
    if (sz) { sz.value = st.stkK; sz.nextElementSibling.textContent = (st.stkK * 100).toFixed(1) + ' cm'; }
    if (rt) { rt.value = Math.round(st.stkR * 180 / Math.PI); rt.nextElementSibling.textContent = Math.round(st.stkR * 180 / Math.PI) + '°'; }
  }
  function stkInput(e) {
    const t = e.target;
    if (t.matches('[data-gstksize]')) st.stkK = G.U.clamp(+t.value, SK().MIN_K, SK().MAX_K);
    else if (t.matches('[data-gstkrot]')) st.stkR = +t.value * Math.PI / 180;
    else if (t.matches('[data-gstkflip]')) st.stkF = t.checked ? 1 : 0;
    else return;
    st.stkDirty = true; stkControls();
  }
  // on, for good: one of yours used up
  function stickOn() {
    const w = weapon(), s = stkTry();
    if (!w || !s || !st.stkAt || G.Shop.ready || (w.stickers || []).length >= SK().MAX || !SK().use(s.s)) return;
    w.stickers = SK().clean([...(w.stickers || []), s]);
    st.stkAt = null; st.stkHover = null;
    if (!SK().owned()[st.stkPick]) st.stkPick = null; // (that was the last of them)
    G.Audio.pickup();
    G.HUD.toast('', `Stuck it on your ${w.def.name}`, 1.6);
    refresh();
  }
  function stkPanel() { const el = document.querySelector('.gs-stk'); if (el) el.innerHTML = stkHtml(weapon()); }
  function stkHtml(w) {
    const S = SK(), own = S.owned(), names = Object.keys(own).sort(), on = (w.stickers || []).length, full = on >= S.MAX, esc = G.U.esc;
    const cards = names.map((n) => `<button class="stk-card${st.stkPick === n ? ' on' : ''}" data-gstkpick="${esc(n)}" title="${esc(stkName(n))}"><img src="${S.url(n)}" alt="" draggable="false"><b>×${own[n]}</b></button>`).join('');
    const deg = Math.round(st.stkR * 180 / Math.PI);
    return `<div class="gs-sub">Stickers <small>${on} of ${S.MAX} on your ${esc(w.def.name)}</small></div>
      ${names.length ? `<div class="stk-grid">${cards}</div>` : '<p class="stk-none">You haven\'t found any stickers yet. About one level in ten has a sticker box in it: open it first and the sticker\'s yours.</p>'}
      <div class="stk-ctl${st.stkPick ? '' : ' off'}">
        <label>Size <input type="range" data-gstksize min="${S.MIN_K}" max="${S.MAX_K}" step="0.001" value="${st.stkK}"><span>${(st.stkK * 100).toFixed(1)} cm</span></label>
        <label>Turn <input type="range" data-gstkrot min="-180" max="180" step="1" value="${deg}"><span>${deg}°</span></label>
        <label class="stk-flip"><input type="checkbox" data-gstkflip ${st.stkF ? 'checked' : ''}> Mirror</label>
      </div>
      <div class="stk-act">${st.stkAt ? `<button class="btn small buy" data-gstkapply ${G.Shop.ready ? 'disabled' : ''}>Stick it on <small>(for good)</small></button> <button class="btn small" data-gstkmove>Move it</button>`
        : `<span>${full ? 'This gun has all the stickers it can take.' : st.stkPick ? 'Click the gun where it goes.' : names.length ? 'Pick a sticker, then click the gun where it goes.' : ''}</span>`}</div>
      <p class="stk-hint">Shift + scroll: size · Ctrl + scroll: turn · a sticker's on its gun for good, wherever the gun goes</p>`;
  }

  // ------------------------------------------------------------------ html
  function html() {
    const Me = G.Me, w = weapon();
    if (!w) return '<div class="gs-empty">No weapon to work on.</div>';
    const def = w.def, build = def.build, slots = GS.visibleSlots(def.id, build);
    if (!st.slot || !slots.some((s) => s.slot === st.slot)) st.slot = slots[0] && slots[0].slot;
    const preview = st.hoverPart ? previewDef(def, st.slot, st.hoverPart) : null;
    const nStk = Object.values(G.Stickers.owned()).reduce((a, n) => a + n, 0);
    const tabs = ['p', 's'].map((k) => { const ww = Me.weapons[k]; return `<button class="tab${st.wslot === k ? ' on' : ''}" data-gw="${k}" ${ww ? '' : 'disabled'}>${k === 'p' ? 'Primary' : 'Sidearm'}: ${ww ? ww.def.name : '—'}</button>`; }).join('')
      + `<button class="tab gs-stk-tab${st.stk ? ' on' : ''}" data-gstk>Stickers${nStk ? ` <small>×${nStk}</small>` : ''}</button>`;
    let slotRows = '';
    for (const s of slots) {
      const p = build[s.slot] && GS.PARTS[build[s.slot]];
      const bad = p && p.mount !== s.mount;
      slotRows += `<div class="gs-slot${s.slot === st.slot ? ' on' : ''}${s.parent ? ' sub' : ''}${bad || (!p && s.req) ? ' misfit' : ''}" data-gslot="${s.slot}"><span>${GS.slotLabel(s)}${s.req ? '' : ' <small>opt.</small>'}${buyable(s.slot) ? ' <i class="gs-bang" title="Parts for it in the store">!</i>' : ''}</span><b>${p ? G.U.esc(p.name) : '<em>empty</em>'}<i>${bad ? `doesn't fit the ${G.U.esc(GS.ifaceName(s.mount))}: it won't fire` : G.U.esc(GS.ifaceName(s.mount))}</i></b></div>`;
    }
    // parts that fit the picked slot: fitted, in your stash, for sale, then the rest (out of stock / later)
    const cur = slots.find((s) => s.slot === st.slot);
    let list = '';
    if (cur) {
      // (of the plain grips, just the one on it, or the gun's own: the rest are finishes of it, in the picker on that row)
      const fitted = GS.PARTS[build[cur.slot]], skins = cur.slot === 'grip' ? GS.skins(def.id) : [], skinned = skins.includes(fitted);
      const plainOut = (p) => (skinned ? GS.plainGrip(p) : GS.plainHere(p, def.id));
      const parts = GS.compatible(cur.mount).filter((p) => (!p.factory || p.plat === def.id || (Me.stash || {})[p.id] || build[cur.slot] === p.id) && !(p.not || []).includes(def.id) && (!plainOut(p) || (Me.stash || {})[p.id] || build[cur.slot] === p.id));
      const rank = (p) => (build[cur.slot] === p.id ? 0 : (Me.stash || {})[p.id] ? 1 : forSale(p) ? 2 : 3);
      parts.sort((a, b) => rank(a) - rank(b) || a.price - b.price);
      for (const p of parts) {
        const r = rank(p), n = (Me.stash || {})[p.id] || 0, factoryHere = p.factory && p.plat === def.id;
        let action;
        if (r === 0) action = cur.req ? '<span class="tag">Fitted</span>' : `<button class="btn small" data-gremove="${cur.slot}">Remove</button>`;
        if (r === 0 && skinned && skins.length > 1) action = `<select class="gs-skin" data-gskin ${G.Shop.ready ? 'disabled' : ''}>${skins.map((q) => `<option value="${q.id}"${q === p ? ' selected' : ''}>${G.U.esc(q.name)}</option>`).join('')}</select>`;
        else if (r === 1) action = `<button class="btn small buy" data-ginstall="${p.id}">Fit (stash ×${n})</button> <button class="btn small" data-gsell="${p.id}">Sell ¢${G.U.fmt(GS.sellPrice(p))}</button>`;
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
        <div class="gs-left"><div class="gs-view"><div id="gsHover" class="gs-hover"></div><div id="gsDots" class="gs-dots"></div><div class="gs-hint">${st.stk ? 'Drag to turn · scroll to zoom · click the gun to put the sticker there' : 'Drag to turn · scroll to zoom · click a part or a dot'}</div></div>
        ${st.stk ? `<div class="gs-list gs-stk">${stkHtml(w)}</div>` : `<div class="gs-list"><div class="gs-sub">${cur ? GS.slotLabel(cur) + (cur.req ? '' : ' (optional)') : ''}</div>${list}</div>`}</div>
        <div class="gs-side"><div class="gs-title">${def.name}${def.modified ? ' <small>CUSTOM</small>' : ''}${def.missing.length ? ' <small class="broken">WON\'T FIRE</small>' : ''}</div>
          <div class="gs-slots">${slotRows}</div>
          <div class="gs-stats">${sideStats(def, preview, st.hoverPart)}</div></div>
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
    if (!container.dataset.gsInput) { container.dataset.gsInput = 1; container.addEventListener('input', (e) => { if (container.classList.contains('gs-host')) stkInput(e); }); } // (the sticker tool's sliders)
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
    const gw = t.closest('[data-gw]'); if (gw && !gw.disabled) { st.wslot = gw.dataset.gw; st.slot = null; st.hoverPart = null; st.hoverSlot = null; st.stkAt = null; st.stkHover = null; view.auto = !st.stk; G.Audio.click(); return refresh(); }
    // the sticker tool: on and off, a sticker picked, stuck on, or put somewhere else
    if (t.closest('[data-gstk]')) { st.stk = !st.stk; st.stkAt = null; st.stkHover = null; st.hoverPart = null; st.hoverSlot = null; st.stkDirty = true; if (st.stk) view.auto = false; G.Audio.click(); return refresh(); }
    const sp = t.closest('[data-gstkpick]'); if (sp) { st.stkPick = st.stkPick === sp.dataset.gstkpick ? null : sp.dataset.gstkpick; st.stkDirty = true; G.Audio.click(); return stkPanel(); }
    if (t.closest('[data-gstkapply]')) return stickOn();
    if (t.closest('[data-gstkmove]')) { st.stkAt = null; st.stkDirty = true; G.Audio.click(); return stkPanel(); }
    const gs = t.closest('[data-gslot]'); if (gs) { st.slot = gs.dataset.gslot; st.hoverPart = null; G.Audio.click(); return refresh(); }
    const gd = t.closest('[data-gdot]'); if (gd) { st.slot = gd.dataset.gdot; st.hoverPart = null; G.Audio.click(); return refresh(); }
    const gi = t.closest('[data-ginstall]'); if (gi && !gi.disabled) return install(st.slot, gi.dataset.ginstall);
    const gr = t.closest('[data-gremove]'); if (gr) return remove(gr.dataset.gremove);
    const gl = t.closest('[data-gsell]'); if (gl) return sell(gl.dataset.gsell);
  }
  function onChange(e) { if (e.target.dataset.gskin != null) reskin(e.target.value); }
  // hovering a part previews it on the gun (model and stats)
  function onHover(e) {
    const w = weapon();
    if (!w || st.stk) return; // (the sticker tool: nothing to preview)
    const dot = e.target.closest('[data-gdot]');
    if (dot || st.dotHover) { const s = dot ? dot.dataset.gdot : null; if (s !== st.hoverSlot) { st.hoverSlot = s; paint(); label(s); } st.dotHover = !!dot; if (dot) return; }
    const row = e.target.closest('[data-gpart]');
    let pid = row ? row.dataset.gpart : null;
    if (pid === w.def.build[st.slot]) pid = null; // that's what's fitted already
    if (pid === st.hoverPart) return;
    st.hoverPart = pid;
    const prev = pid ? previewDef(w.def, st.slot, pid) : null;
    const statsEl = document.querySelector('.gs-stats');
    if (statsEl) statsEl.innerHTML = sideStats(w.def, prev, pid); // (what it'd change, at the top of the stat card)
    setModel(prev || w.def);
    st.hoverSlot = pid ? st.slot : null;
    paint();
  }
  function hide() { active = false; cancelAnimationFrame(raf); const el = document.getElementById('shopItems'); if (el) el.classList.remove('gs-host'); }

  return { show, hide, onClick, onChange, onHover, refresh, state: st, partEffects, statsHtml, deltaHtml, fitsLine, _setModel: (d) => setModel(d), _view: view, _canvas: () => canvas, _model: () => model };
})();
