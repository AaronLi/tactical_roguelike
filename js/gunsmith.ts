'use strict';
// The gunsmith (a tab in the between-level shop): rebuild your weapons part by part on a 3D model.
// Drag to orbit, scroll to zoom, hover to see what a piece is, click it (or a slot in the list) to pick
// that slot. Hovering a part in the list previews it on the gun with its stat changes; clicking fits
// it (buying it first if it isn't in your stash). Parts taken off go to your stash.
// Stickers (its Stickers tab): pick one you own, click the gun where it goes (it shows there, faint), size it, turn it,
// mirror it, and stick it on: it's on that gun for good (js/stickers.ts).

/** The gunsmith's orbit camera round the gun. */
interface GsView { yaw: number; pitch: number; dist: number; center: THREE.Vector3; auto: boolean; fitted?: string }
/** What the gunsmith screen is showing: the weapon slot (p / s), the slot and part picked or hovered, and the sticker tool's state. */
interface GsState {
  wslot: string; slot: string | null; hoverPart: string | null | undefined; hoverSlot: string | null | undefined; dotHover?: boolean;
  stk: boolean; stkPick: string | null; stkK: number; stkR: number; stkF: number; stkAt: any; stkHover: any; stkDirty: boolean;
}
const G_GunsmithUI = (() => {
  const T = THREE, GS = G.Gunsmith;
  let renderer = null as unknown as THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.PerspectiveCamera, model = null as unknown as THREE.Object3D, modelKey = '', canvas: HTMLCanvasElement, raf = 0, active = false;
  const view: GsView = { yaw: Math.PI / 2 - 0.3, pitch: 0.15, dist: 1.4, center: new T.Vector3(), auto: true }; // right side, muzzle to the right
  const st: GsState = { wslot: 'p', slot: null, hoverPart: null, hoverSlot: null,
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
    let drag: { x: number, y: number, moved: number } | null = null;
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
  function setModel(def: WeaponDef, skin = (weapon() || {} as any).stickers) {
    const key = def.code + '#' + G.Stickers.key(skin);
    if ((model && modelKey === key) || wantKey === key) return;
    wantKey = key;
    const { group } = G.GunModels.display(def);
    // (a build whose packs are not in yet is an empty group that fills in: the old model stays up till it has, and only the last one asked for is shown)
    G.GunModels.whenReady(group, (ok) => { if (wantKey === key && ok) showModel(def, group, key, skin); else if (wantKey !== key) group.traverse((o: any) => { if (o.isMesh) o.geometry.dispose(); }); });
  }
  let wantKey = '';
  function showModel(def: WeaponDef, group: THREE.Object3D, key: string, skin: any) {
    if (model) { scene.remove(model); model.traverse((o: any) => { if (o.isMesh) { o.geometry.dispose(); if (!o.userData.sticker) o.material.dispose(); } }); } // (a sticker's material is the picture's, shared)
    // own materials, so a part can glow when picked
    group.traverse((o: any) => { if (o.isMesh) o.material = o.material.clone(); });
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
  let anchors: Record<string, THREE.Vector3> = {};
  function anchorsOf(def: WeaponDef, box: THREE.Box3) {
    const by: Record<string, THREE.Box3> = {};
    model.traverse((o: any) => { if (o.isMesh && o.userData.slot) (by[o.userData.slot] || (by[o.userData.slot] = new T.Box3())).expandByObject(o); });
    const c = box.getCenter(new T.Vector3()), sz = box.getSize(new T.Vector3()), mid = (s: string) => by[s] && !by[s].isEmpty() ? by[s].getCenter(new T.Vector3()) : null;
    const bore = mid('barrel') || c, hg = by.handguard && !by.handguard.isEmpty() ? by.handguard : null, front = (k: number) => box.min.z + sz.z * k;
    const out: Record<string, THREE.Vector3> = {};
    for (const s of GS.visibleSlots(def.id, def.build)) {
      const kind = GS.kindOf(s.slot), up = (parseInt((s.slot.match(/\d+$/) || [])[0]!, 10) || (kind === 'buttstock' ? 1 : 0));
      let p = mid(kind === 'buttstock' ? 'stock' : s.slot); // (a nest of stocks all draw as the one: each dot a step further back)
      if (p && kind === 'buttstock') p.z += 0.03 * up;
      // a barrel inside a handguard: its dot on the stretch that shows, in front of the handguard
      if (s.slot === 'barrel' && p && hg && by.barrel.min.z < hg.min.z - 0.02) p.z = (by.barrel.min.z + hg.min.z) / 2;
      if (!p) switch (kind) {
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
        case 'stock': case 'buttstock': p = new T.Vector3(c.x, c.y, box.max.z + 0.03 * up); break;
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
    const shop = slots.map((s: Slot) => (buyable(s.slot) ? 1 : 0)).join(''), key = modelKey + '|' + slots.map((s: Slot) => s.slot).join(',') + '|' + shop;
    if (host.dataset.key !== key) {
      host.dataset.key = key;
      host.innerHTML = slots.filter((s: Slot) => anchors[s.slot]).map((s: any) => { const b = buyable(s.slot); return `<button class="gs-dot${w.def.build[s.slot] ? '' : ' empty'}${b ? ' shop' : ''}" data-gdot="${s.slot}" title="${GS.slotLabel(s)}${b ? ' · parts for it in the store' : ''}">${b ? '<i>!</i>' : ''}</button>`; }).join('');
    }
    const r = host.getBoundingClientRect();
    model.updateMatrixWorld(true);
    for (const el of host.children as HTMLCollectionOf<HTMLElement>) {
      const a = anchors[el.dataset.gdot!];
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
    model.traverse((o: any) => {
      if (!o.isMesh || o.userData.sticker || !o.material.emissive) return;
      const s = o.userData.slot;
      const on = s === st.hoverSlot ? 0x1c6aa0 : s === st.slot && s !== 'base' ? 0x0c3a5c : 0; // cool blue, so it never reads as brass
      o.material.emissive.setHex(on);
    });
  }
  function hit(e: MouseEvent) {
    if (!model) return null;
    const r = canvas.getBoundingClientRect();
    ray.setFromCamera(new T.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), camera);
    const h = ray.intersectObject(model, true).find((q) => !q.object.userData.sticker);
    return h ? h.object.userData.slot : null;
  }
  function pick(e: MouseEvent) { const s = hit(e); return s && s !== 'base' && GS.visibleSlots(weapon().def.id, weapon().def.build).some((x: Slot) => x.slot === s) ? s : null; }
  function hover(e: MouseEvent) {
    const s = pick(e);
    if (s !== st.hoverSlot) { st.hoverSlot = s; paint(); label(s); }
  }
  function label(s: string | null | undefined) {
    const el = document.getElementById('gsHover');
    if (!el) return;
    const w = weapon(), pid = s && w.def.build[s], p = pid && GS.PARTS[pid];
    const sl = s && GS.visibleSlots(w.def.id, w.def.build).find((q: Slot) => q.slot === s);
    el.innerHTML = s ? `<b>${sl ? GS.slotLabel(sl) : (GS.SLOT_LABEL as Record<string, string>)[s!]}</b> ${p ? G.U.esc(p.name) : 'empty'}` : '';
  }
  function loop() {
    if (!active) return;
    raf = requestAnimationFrame(loop);
    const host = canvas.parentElement;
    if (!host || document.getElementById('shop')!.classList.contains('hidden')) { active = false; return; }
    const w = host.clientWidth, h = host.clientHeight;
    if (canvas.width !== Math.floor(w * renderer.getPixelRatio()) || canvas.height !== Math.floor(h * renderer.getPixelRatio())) { renderer.setSize(w, h, false); camera.aspect = w / Math.max(1, h); camera.updateProjectionMatrix(); }
    if (view.auto) view.yaw = Math.PI / 2 - 0.3 + Math.sin(performance.now() / 3000) * 0.5; // a slow sway around the side view
    const c = view.center, d = view.dist;
    camera.position.set(c.x + Math.sin(view.yaw) * Math.cos(view.pitch) * d, c.y + Math.sin(view.pitch) * d, c.z + Math.cos(view.yaw) * Math.cos(view.pitch) * d);
    camera.lookAt(c);
    if (st.stkDirty && model) { st.stkDirty = false; G.Stickers.ghost(model, stkTry()); }
    renderer.render(scene, camera);
    placeDots();
  }

  // ------------------------------------------------------------------ stats
  // [label, value(def), better: 1 higher / -1 lower / 0 n/a, format, bar range]
  // name, the stat, which way is better (1 up, -1 down, 0 neither), its format, the bar's range
  const ROWS: [string, (d: any) => number, number, (v: number) => string | number, [number, number]][] = [
    ['Ergonomics', (d) => d.ergo, 1, (v) => Math.round(v), [0, 100]],
    ['Recoil', (d) => d.recoil, -1, (v) => v.toFixed(2) + '°', [0, 6]],
    ['Accuracy', (d) => d.ads * 120, -1, (v) => (v < 10 ? v.toFixed(1) : Math.round(v)) + ' MOA', [0, 20]], // (aimed: the group the gun itself makes)
    ['Hip spread', (d) => d.spread, -1, (v) => v.toFixed(1) + '°', [0, 8]],
    ['Aim sway', (d) => G.aimSway(d).score * 100, -1, (v) => Math.round(v) + '%', [0, 400]], // (an M4's 100%: a stock to your shoulder steadies it most)
    ['Energy', (d) => (d.explosive ? d.explosive.dmg : G.Ballistics.energy(d)), 1, (v) => G.U.fmt(Math.round(v)) + ' J', [0, 4000]], // (its round's at 10 m, with ball: js/ballistics.ts)
    ['Range', (d) => d.range, 1, (v) => Math.round(v) + ' m', [0, 150]],
    ['Fire rate', (d) => d.rpm, 1, (v) => Math.round(v) + ' rpm', [0, 2000]],
    ['Capacity', (d) => d.mag, 1, (v) => Math.round(v), [0, 200]],
    ['Reload', (d) => G.fullReload(d), -1, (v) => v.toFixed(2) + ' s', [0, 6]],
    ['Weight', (d) => d.weight, -1, (v) => v.toFixed(2) + ' kg', [0, 12]],
    ['Mobility', (d) => d.speed * 100, 1, (v) => Math.round(v) + '%', [60, 110]],
    ['Sight', (d) => (d.magLevels ? d.magLevels[d.magLevels.length - 1] : d.magnif || 1), 0, (v) => v + '×', [1, 8]],
  ];
  function statsHtml(cur: any, prev?: any) {
    let h = '';
    for (const [name, f, better, fmt, [lo, hi]] of ROWS) {
      const a = f(cur), b = prev ? f(prev) : a;
      const diff = b - a, good = better === 0 || Math.abs(diff) < 1e-6 || fmt(a) === fmt(b) ? '' : (diff > 0) === (better > 0) ? 'up' : 'down';
      const w = G.U.clamp((b - lo) / (hi - lo), 0, 1) * 100;
      h += `<div class="gs-stat ${good}"><span>${name}</span><div><i style="width:${w}%"></i></div><b>${fmt(b)}${good ? ` <em>${diff > 0 ? '▲' : '▼'} ${fmt(Math.abs(diff))}</em>` : ''}</b></div>`;
    }
    const c0 = (G.CALIBERS as Record<string, CaliberDef>)[G.calOf(cur)], c1 = (G.CALIBERS as Record<string, CaliberDef>)[G.calOf(prev || cur)];
    if (c1) h += `<div class="gs-stat${c0 !== c1 ? ' up' : ''}"><span>Caliber</span><div></div><b>${c1.name}${prev && prev.id !== cur.id ? ` <em>${G.U.esc(prev.name)}</em>` : ''}</b></div>`;
    h += `<div class="gs-stat"><span>Report</span><div></div><b>${(prev || cur).sup ? 'Suppressed' : (prev || cur).device === 'none' ? 'Bare muzzle' : (prev || cur).device}</b></div>`;
    // each load through this build's barrel: how fast it leaves, and the energy it leaves with (all its pellets)
    const d0 = prev || cur, cur0 = cur;
    for (const cal of G.calsOf(d0)) { // (a gun of several barrels: each round type it takes, in its own caliber)
      const d = G.asCal(d0, cal), cur = G.asCal(cur0, cal), grp = (G.CALIBERS as Record<string, CaliberDef>)[cal] && G.ammoTypes(cal);
      if (grp && (G.MUZZLE_V as Record<string, any>)[cal] && !d.explosive && d.cls !== 'RAIL') {
        h += `<div class="gs-loads"><span>${d0.barrels ? (G.CALIBERS as Record<string, CaliberDef>)[cal].name : 'Load'}</span><span>Muzzle</span><span>Energy</span>`;
        for (const am of grp) {
          const v = G.roundSpeed(d, am), v0 = G.roundSpeed(cur, am), e = G.Ballistics.energy(d, am, 0), ch = Math.round(v) - Math.round(v0);
          const cls = ch ? (ch > 0 ? ' class="up"' : ' class="down"') : '';
          h += `<span>${(G.AMMO as Record<string, any>)[am].name}</span><b${cls}>${Math.round(v)} m/s${ch ? ` <em>${ch > 0 ? '+' : ''}${ch}</em>` : ''}</b><b${cls}>${G.U.fmt(Math.round(e))} J</b>`;
        }
        h += '</div>';
      }
    }
    return h;
  }
  // the stat card's: what the part you're hovering would change (with a receiver kit, the gun it makes), then the stats
  function sideStats(cur: any, prev: any, pid?: string | null) {
    const p = pid && GS.PARTS[pid];
    const head = prev ? `<div class="gs-change"><div class="gs-ch-h">${p ? `Fitting ${G.U.esc(p.name)}` : 'With this part'}</div><div class="gs-pe">${prev.id !== cur.id ? `<span class="g">Makes it a ${G.U.esc(prev.name)}</span>` : ''}${deltaHtml(cur, prev)}</div></div>` : '';
    return head + statsHtml(cur, prev);
  }
  // just what a change would change, old to new (good green, bad red)
  function deltaHtml(cur: any, prev: any) {
    const out: string[] = [];
    for (const [name, f, better, fmt] of ROWS) {
      const a = f(cur), b = f(prev);
      if (Math.abs(b - a) < 1e-6 || fmt(a) === fmt(b)) continue;
      out.push(`<span class="${better === 0 ? '' : (b > a) === (better > 0) ? 'g' : 'b'}">${name} ${fmt(a)} → ${fmt(b)}</span>`);
    }
    const c0 = (G.CALIBERS as Record<string, CaliberDef>)[G.calOf(cur)], c1 = (G.CALIBERS as Record<string, CaliberDef>)[G.calOf(prev)];
    if (c1 && c0 !== c1) out.push(`<span class="g">${c0 ? c0.name + ' → ' : ''}${c1.name}</span>`);
    if (!!cur.sup !== !!prev.sup) out.push(`<span class="${prev.sup ? 'g' : 'b'}">${prev.sup ? 'Suppressed' : 'Unsuppressed'}</span>`);
    const v0 = G.roundSpeed(cur), v1 = G.roundSpeed(prev);
    if (v0 && v1 && Math.round(v0) !== Math.round(v1)) out.push(`<span class="${v1 > v0 ? 'g' : 'b'}">Muzzle ${Math.round(v0)} → ${Math.round(v1)} m/s</span>`);
    return out.length ? out.join('') : '<span>No change to the numbers</span>';
  }
  // a part's figures as chips (js/parts.ts G.Gunsmith.partEffects: there so the highlights' video worker, which has no gunsmith screen, can word them too)
  const partEffects = (p: Part, gid?: string | null) => GS.partEffects(p, gid);

  // what a part fits: its interface, how many weapons take it, and which of yours
  function fitsLine(p: Part, exceptId: string) {
    const ids = GS.fitsPart(p), mine = Object.values(G.Me.weapons).filter((w) => w && w.def.id !== exceptId && ids.includes(w.def.id));
    return `<em class="gs-fit">${G.U.esc(GS.ifaceName(p.mount))}${ids.length > 1 ? ` · fits ${ids.length} weapons` : ''}${mine.length ? ` · also your ${mine.map((w) => w.def.name).join(', ')}` : ''}</em>`;
  }

  // ------------------------------------------------------------------ build changes
  const stash = () => G.Me.stash || (G.Me.stash = {});
  const toStash = (pid: string) => { const s = stash(); s[pid] = (s[pid] || 0) + 1; };
  const fromStash = (pid: string) => { const s = stash(); if (!s[pid]) return false; if (--s[pid] <= 0) delete s[pid]; return true; };
  // for sale: what he has in stock, and always the right core part for a gun that's missing one or has one
  // that doesn't fit (its own barrel, after a receiver swap)
  // (Timberline's too: the precision showcase by the hangar door, js/hangar.ts. Its own section in the list.)
  const forSale = (p: Part) => (!p.factory && G.Shop.partStock && G.Shop.partStock.has(p.id) && G.Shop.inStock('part:' + p.id)) || atShowcase(p) || needed(p);
  const atShowcase = (p: Part) => !p.factory && !!G.Shop.precStock && G.Shop.precStock.includes(p.id) && G.Shop.inStock('part:' + p.id);
  const needed = (p: Part) => { const w = weapon(), d = w && w.def; return !!d && GS.PLATFORMS[d.id].defaults[p.slot] === p.id && d.missing.includes(p.slot); };
  // does the store have a part for this slot of the gun you're working on (one that fits it, and isn't the one on it)?
  // Its dot on the model and its row in the list get a "!".
  function buyable(slot: string) {
    const w = weapon(), s = w && GS.visibleSlots(w.def.id, w.def.build).find((q: Slot) => q.slot === slot);
    return !!s && GS.compatible(s.mount).some((p: Part) => p.id !== w.def.build[slot] && !GS.sameFamily(p, GS.PARTS[w.def.build[slot]]) && GS.fitsLen(p, w.def.id, w.def.build) && forSale(p));
  }
  function apply(w: any, build: any) {
    G.Me.refit(w, build);
    if (G.GunAudio.available()) G.GunAudio.buildDry(w.def.soundKey);
  }
  function install(slot: string, pid: string): void {
    const w = weapon(), build = Object.assign({}, w.def.build), p = GS.PARTS[pid];
    if (!p || build[slot] === pid || G.Shop.ready) return;
    if (!fromStash(pid)) {
      if (!forSale(p) || !G.Shop.afford(GS.buyPrice(p))) return;
      // from his stock (the squad's: the host's count, js/shop.ts take), unless it's the core part the gun needs
      if (!needed(p)) { G.Shop.take('part:' + pid, () => { if (weapon() !== w || !G.Shop.spend(GS.buyPrice(p))) return false; toStash(pid); install(slot, pid); return undefined; }); return; }
      if (!G.Shop.spend(GS.buyPrice(p))) return;
    } else G.Audio.pickup();
    if (build[slot]) toStash(build[slot]);
    build[slot] = pid;
    for (const r of GS.prune(w.def.id, build)) toStash(r);
    apply(w, build);
    st.hoverPart = null;
    G.Shop.render();
  }
  function remove(slot: string) {
    const w = weapon(), build = Object.assign({}, w.def.build);
    const sl = GS.slotsOf(w.def.id, build).find((s: Slot) => s.slot === slot);
    if (!sl || sl.req || !build[slot] || G.Shop.ready) return;
    toStash(build[slot]); delete build[slot];
    for (const r of GS.prune(w.def.id, build)) toStash(r);
    apply(w, build); G.Audio.click();
    G.Shop.render();
  }
  // the part on the picked slot in another finish (the gun's stock grip, or a part with a skin family: GS.skinsOf): it's the same part,
  // so it costs nothing and goes on as it is
  function reskin(pid: string) {
    const w = weapon(), build = Object.assign({}, w.def.build), slot = st.slot;
    if (!slot || !build[slot] || !GS.skinsOf(w.def.id, GS.PARTS[build[slot]]).some((p: Part) => p.id === pid) || G.Shop.ready) return;
    build[slot] = pid;
    apply(w, build); G.Audio.click();
    G.Shop.render();
  }
  // one in the stash, in another finish: the item becomes that one (a part's worth is the same in any: nothing's gained)
  function restash(from: string, to: string) {
    const w = weapon(), a = GS.PARTS[from], b = GS.PARTS[to];
    if (!w || !a || !b || a === b || !GS.sameFamily(a, b) || !GS.skinsOf(w.def.id, a).includes(b) || G.Shop.ready || !fromStash(from)) return;
    toStash(to); G.Audio.click();
    G.Shop.render();
  }
  function sell(pid: string) {
    const p = GS.PARTS[pid];
    if (!p || G.Shop.ready || !fromStash(pid)) return;
    G.Me.credits += GS.sellPrice(p);
    G.Audio.buy();
    G.Shop.render();
  }

  // ------------------------------------------------------------------ stickers (js/stickers.ts)
  const SK = () => G.Stickers;
  const stkName = (n: string) => n.replace(/\.[a-z0-9]+$/i, '').replace(/[-_]+/g, ' ');
  // where on the gun the pointer is: a point on its surface and the way that surface faces, in the gun's frame
  function surfaceAt(e: MouseEvent) {
    if (!model) return null;
    const r = canvas.getBoundingClientRect();
    ray.setFromCamera(new T.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), camera);
    const h = ray.intersectObject(model, true).find((q) => !q.object.userData.sticker && q.face && !((q.object as any).material && (q.object as any).material.transparent));
    if (!h) return null;
    model.updateMatrixWorld(true);
    const inv = model.matrixWorld.clone().invert(), n = h.face!.normal.clone().applyMatrix3(new T.Matrix3().getNormalMatrix(h.object.matrixWorld)).normalize();
    if (n.dot(ray.ray.direction) > 0) n.negate(); // (the inside of a part: the side you're looking at)
    const p = h.point.clone().applyMatrix4(inv); n.transformDirection(inv);
    return { p: [p.x, p.y, p.z], n: [n.x, n.y, n.z] };
  }
  // the sticker as it'd go on: where it's been put, or under the pointer
  function stkTry() {
    const at = st.stk && st.stkPick && (st.stkAt || st.stkHover);
    return at ? { s: st.stkPick!, p: at.p, n: at.n, r: st.stkR, k: st.stkK, f: st.stkF } : null;
  }
  function stkHoverAt(e: MouseEvent) {
    if (!st.stkPick || st.stkAt) return;
    const at = surfaceAt(e);
    if (!at && !st.stkHover) return;
    st.stkHover = at; st.stkDirty = true;
  }
  function stkPlace(e: MouseEvent) {
    const w = weapon();
    if (!st.stkPick || !w || (w.stickers || []).length >= SK().MAX) return;
    const at = surfaceAt(e);
    if (!at) return;
    st.stkAt = at; st.stkDirty = true; G.Audio.click();
    stkPanel();
  }
  // Shift + scroll: its size; Ctrl (or Alt) + scroll: its turn
  function stkWheel(e: WheelEvent) {
    const d = Math.sign(e.deltaY);
    if (e.shiftKey) st.stkK = G.U.clamp(st.stkK * (1 - d * 0.08), SK().MIN_K, SK().MAX_K);
    else st.stkR = Math.atan2(Math.sin(st.stkR - d * Math.PI / 12), Math.cos(st.stkR - d * Math.PI / 12));
    st.stkDirty = true; stkControls();
  }
  // the sliders (their read-outs) as the numbers are now
  function stkControls() {
    const box = document.querySelector('.stk-ctl');
    if (!box) return;
    const sz = box.querySelector<HTMLInputElement>('[data-gstksize]'), rt = box.querySelector<HTMLInputElement>('[data-gstkrot]');
    if (sz) { sz.value = st.stkK as unknown as string; sz.nextElementSibling!.textContent = (st.stkK * 100).toFixed(1) + ' cm'; }
    if (rt) { rt.value = String(Math.round(st.stkR * 180 / Math.PI)); rt.nextElementSibling!.textContent = Math.round(st.stkR * 180 / Math.PI) + '°'; }
  }
  function stkInput(e: Event) {
    const t = e.target as HTMLInputElement;
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
    if (!SK().owned()[st.stkPick!]) st.stkPick = null; // (that was the last of them)
    G.Audio.pickup();
    G.HUD.toast('', `Stuck it on your ${w.def.name}`, 1.6);
    refresh();
  }
  function stkPanel() { const el = document.querySelector('.gs-stk'); if (el) el.innerHTML = stkHtml(weapon()); }
  function stkHtml(w: any) {
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
    if (!st.slot || !slots.some((s: Slot) => s.slot === st.slot)) st.slot = slots[0] && slots[0].slot;
    const preview = st.hoverPart ? previewDef(def, st.slot, st.hoverPart) : null;
    const nStk = Object.values(G.Stickers.owned()).reduce((a, n) => a + n, 0);
    const tabs = ['p', 's'].map((k) => { const ww = Me.weapons[k]; return `<button class="tab${st.wslot === k ? ' on' : ''}" data-gw="${k}" ${ww ? '' : 'disabled'}>${k === 'p' ? 'Primary' : 'Sidearm'}: ${ww ? ww.def.name : '—'}</button>`; }).join('')
      + `<button class="tab gs-stk-tab${st.stk ? ' on' : ''}" data-gstk>Stickers${nStk ? ` <small>×${nStk}</small>` : ''}</button>`;
    let slotRows = '';
    for (const s of slots) {
      const p = build[s.slot] && GS.PARTS[build[s.slot]];
      const bad = p && !GS.fitsSlot(s, p, def.id, build);
      slotRows += `<div class="gs-slot${s.slot === st.slot ? ' on' : ''}${s.parent ? ' sub' : ''}${bad || (!p && s.req) ? ' misfit' : ''}" data-gslot="${s.slot}"><span>${GS.slotLabel(s)}${s.req ? '' : ' <small>opt.</small>'}${buyable(s.slot) ? ' <i class="gs-bang" title="Parts for it in the store">!</i>' : ''}</span><b>${p ? G.U.esc(p.name) : s.slot === 'loader' ? '<em>by hand</em>' : '<em>empty</em>'}<i>${bad ? `doesn't fit the ${G.U.esc(GS.ifaceName(s.mount))}: it won't fire` : G.U.esc(GS.ifaceName(s.mount))}</i></b></div>`;
    }
    // parts that fit the picked slot: fitted, in your stash, for sale (his, then Timberline's), then the rest (out of stock / later)
    const cur = slots.find((s: Slot) => s.slot === st.slot);
    let list = '';
    if (cur) {
      // (of the plain grips, just the one on it, or the gun's own: the rest are finishes of it, in the picker on that row)
      // (a part with a skin family: the one on it, or those in the stash, or else the family's own, once: the rest are its finishes)
      const fitted = GS.PARTS[build[cur.slot]], skins = GS.skinsOf(def.id, fitted), skinned = skins.includes(fitted);
      const own = (p: Part) => (Me.stash || {})[p.id] || build[cur.slot] === p.id;
      const famStashed = (p: Part) => !!p.skin && Object.keys(Me.stash || {}).some((q) => GS.PARTS[q] && GS.PARTS[q].skin === p.skin);
      const plainOut = (p: Part) => (cur.slot === 'grip' ? (skinned ? GS.plainGrip(p) : GS.plainHere(p, def.id)) : !!p.skin && (p.alt || GS.sameFamily(fitted, p) || famStashed(p)));
      const parts = GS.compatible(cur.mount).filter((p: Part) => GS.fitsLen(p, def.id, build) && (!p.factory || p.plat === def.id || (Me.stash || {})[p.id] || build[cur.slot] === p.id) && !(p.not || []).includes(def.id) && (!plainOut(p) || own(p)));
      const rank = (p: Part) => (build[cur.slot] === p.id ? 0 : (Me.stash || {})[p.id] ? 1 : atShowcase(p) && !needed(p) ? 3 : forSale(p) ? 2 : 4);
      parts.sort((a: Part, b: Part) => rank(a) - rank(b) || +G.Shop.wished(b.id) - +G.Shop.wished(a.id) || (a.len != null && b.len != null ? a.len - b.len : 0) || a.price - b.price); // (barrels: by length)
      let head = -1;
      for (const p of parts) {
        const r = rank(p), n = (Me.stash || {})[p.id] || 0, factoryHere = p.factory && p.plat === def.id;
        if (r !== head) { // (a label over each group that's for sale or not: Vex's, Timberline's, and what's out of stock)
          if (r === 2) list += '<div class="gs-sub">At Vex&#39;s <small>(his counter and pedestals)</small></div>';
          else if (r === 3) list += '<div class="gs-sub">At Timberline Outfitters <small>(by the hangar door)</small></div>';
          else if (r === 4) list += '<div class="gs-sub">Out of stock</div>';
          head = r;
        }
        let action;
        if (r === 0 && !(skinned && skins.length > 1)) action = cur.req ? '<span class="tag">Fitted</span>' : `<button class="btn small" data-gremove="${cur.slot}">Remove</button>`;
        else if (r === 0) action = `<select class="gs-skin" data-gskin ${G.Shop.ready ? 'disabled' : ''}>${skins.map((q: any) => `<option value="${q.id}"${q === p ? ' selected' : ''}>${G.U.esc(q.skinName || q.name)}</option>`).join('')}</select>`;
        else if (r === 1) action = `<button class="btn small buy" data-ginstall="${p.id}">Fit (stash ×${n})</button> <button class="btn small" data-gsell="${p.id}">Sell ¢${G.U.fmt(GS.sellPrice(p))}</button>${p.skin && GS.skinsOf(def.id, p).length > 1 ? ` <select class="gs-skin" data-gskinstash="${p.id}" ${G.Shop.ready ? 'disabled' : ''}>${GS.skinsOf(def.id, p).map((q: any) => `<option value="${q.id}"${q === p ? ' selected' : ''}>${G.U.esc(q.skinName || q.name)}</option>`).join('')}</select>` : ''}`;
        else if (r === 2 || r === 3) action = `<button class="btn small buy" data-ginstall="${p.id}" ${Me.credits < GS.buyPrice(p) ? 'disabled' : ''}>¢${G.U.fmt(GS.buyPrice(p))}</button>`;
        else action = `<span class="tag">${factoryHere ? 'Comes with the gun' : p.tier > Math.min(3, 1 + Math.floor((G.Shop.level || 1) / 2)) ? 'Available later' : 'Out of stock'}</span>`;
        list += `<div class="gs-part${r === 0 ? ' fitted' : ''}${r === 4 ? ' na' : ''}${G.Shop.wished(p.id) ? ' wished' : ''}" data-gpart="${p.id}">
          <div class="gs-pn">${G.Shop.star(p.id)}<small>${G.U.esc(p.brand)}</small>${G.U.esc(p.name)}${fitsLine(p, def.id)}</div>
          <div class="gs-pe">${partEffects(p, def.id) || '<span>—</span>'}</div>
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
  function previewDef(def: WeaponDef, slot: string, pid: string) {
    const b = Object.assign({}, def.build, { [slot]: pid });
    GS.prune(def.id, b);
    const conv = GS.convert(def.id, b); // a receiver kit: the gun it would become
    return conv ? GS.compile(conv.id, conv.build) : GS.compile(def.id, b);
  }

  // ------------------------------------------------------------------ mount into the shop
  function show(container: HTMLElement) {
    if (!renderer) init();
    container.classList.add('gs-host');
    container.innerHTML = html();
    const w = weapon();
    if (!container.dataset.gsInput) { container.dataset.gsInput = 1 as any; container.addEventListener('input', (e: Event) => { if (container.classList.contains('gs-host')) stkInput(e); }); } // (the sticker tool's sliders)
    if (w) {
      G.GunModels.preload([w.def]); // (every pack of this gun's platform, so a part swap shows at once)
      container.querySelector('.gs-view')!.prepend(canvas);
      setModel(st.hoverPart ? previewDef(w.def, st.slot!, st.hoverPart) : w.def);
      paint();
    }
    if (!active) { active = true; loop(); }
  }
  function refresh() { const el = document.getElementById('shopItems'); if (el && el.classList.contains('gs-host')) show(el); }
  function onClick(e: Event) {
    const t = e.target as any;
    const gw = t.closest('[data-gw]'); if (gw && !gw.disabled) { st.wslot = gw.dataset.gw; st.slot = null; st.hoverPart = null; st.hoverSlot = null; st.stkAt = null; st.stkHover = null; view.auto = !st.stk; G.Audio.click(); return refresh(); }
    // the sticker tool: on and off, a sticker picked, stuck on, or put somewhere else
    if (t.closest('[data-gstk]')) { st.stk = !st.stk; st.stkAt = null; st.stkHover = null; st.hoverPart = null; st.hoverSlot = null; st.stkDirty = true; if (st.stk) view.auto = false; G.Audio.click(); return refresh(); }
    const sp = t.closest('[data-gstkpick]'); if (sp) { st.stkPick = st.stkPick === sp.dataset.gstkpick ? null : sp.dataset.gstkpick; st.stkDirty = true; G.Audio.click(); return stkPanel(); }
    if (t.closest('[data-gstkapply]')) return stickOn();
    if (t.closest('[data-gstkmove]')) { st.stkAt = null; st.stkDirty = true; G.Audio.click(); return stkPanel(); }
    const gs = t.closest('[data-gslot]'); if (gs) { st.slot = gs.dataset.gslot; st.hoverPart = null; G.Audio.click(); return refresh(); }
    const gd = t.closest('[data-gdot]'); if (gd) { st.slot = gd.dataset.gdot; st.hoverPart = null; G.Audio.click(); return refresh(); }
    const gwish = t.closest('[data-wish]'); if (gwish) { G.Shop.toggleWish(gwish.dataset.wish); G.Audio.click(); return refresh(); }
    const gi = t.closest('[data-ginstall]'); if (gi && !gi.disabled) return install(st.slot!, gi.dataset.ginstall);
    const gr = t.closest('[data-gremove]'); if (gr) return remove(gr.dataset.gremove);
    const gl = t.closest('[data-gsell]'); if (gl) return sell(gl.dataset.gsell);
  }
  function onChange(e: Event) {
    const el = e.target as HTMLSelectElement;
    if (el.dataset.gskin != null) reskin(el.value);
    else if (el.dataset.gskinstash) restash(el.dataset.gskinstash, el.value);
  }
  // hovering a part previews it on the gun (model and stats)
  function onHover(e: Event) {
    const w = weapon();
    if (!w || st.stk) return; // (the sticker tool: nothing to preview)
    const dot = (e.target as HTMLElement).closest<HTMLElement>('[data-gdot]');
    if (dot || st.dotHover) { const s = dot ? dot.dataset.gdot : null; if (s !== st.hoverSlot) { st.hoverSlot = s; paint(); label(s); } st.dotHover = !!dot; if (dot) return; }
    const row = (e.target as HTMLElement).closest<HTMLElement>('[data-gpart]');
    let pid = row ? row.dataset.gpart : null;
    if (pid === w.def.build[st.slot!]) pid = null; // that's what's fitted already
    if (pid === st.hoverPart) return;
    st.hoverPart = pid;
    const prev = pid ? previewDef(w.def, st.slot!, pid) : null;
    const statsEl = document.querySelector('.gs-stats');
    if (statsEl) statsEl.innerHTML = sideStats(w.def, prev, pid); // (what it'd change, at the top of the stat card)
    setModel(prev || w.def);
    st.hoverSlot = pid ? st.slot : null;
    paint();
  }
  function hide() { active = false; cancelAnimationFrame(raf); const el = document.getElementById('shopItems'); if (el) el.classList.remove('gs-host'); }

  return { show, hide, onClick, onChange, onHover, refresh, state: st, partEffects, statsHtml, deltaHtml, fitsLine, _setModel: (d: WeaponDef) => setModel(d), _view: view, _canvas: () => canvas, _model: () => model };
})();
G.GunsmithUI = G_GunsmithUI;
interface GameModules { GunsmithUI: typeof G_GunsmithUI; }
