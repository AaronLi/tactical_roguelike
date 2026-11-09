'use strict';
// A controller (the Gamepad API's standard mapping: an Xbox pad, a Steam Deck's own controls), polled once a frame by G.Game.loop. It's not a
// control scheme of its own: in a level its buttons are the keys and mouse buttons they stand for, sent as those events down the same handlers
// (js/player.ts bindInput, js/game.ts bindMenu); in a menu it drives a cursor that presses, drags and right-clicks what's on the screen with
// pointer events, so a shop, the inventory's grids and the gunsmith's canvas all work as they do with a mouse. Only the sticks' fractions go in
// direct (G.Me.padMove, G.Me.lookBy). A button press isn't a user gesture to a browser, so there's no pointer lock to be had from one: G.Game.softLocked
// stands in for it (js/game.ts lock).
type PadBtn = 'A' | 'B' | 'X' | 'Y' | 'LB' | 'RB' | 'LT' | 'RT' | 'VIEW' | 'MENU' | 'L3' | 'R3' | 'UP' | 'DOWN' | 'LEFT' | 'RIGHT';
type PadDir = [number, number];
const G_Pad = (() => {
  const BTNS: PadBtn[] = ['A', 'B', 'X', 'Y', 'LB', 'RB', 'LT', 'RT', 'VIEW', 'MENU', 'L3', 'R3', 'UP', 'DOWN', 'LEFT', 'RIGHT'];
  const DIRS: Partial<Record<PadBtn, PadDir>> = { UP: [0, -1], DOWN: [0, 1], LEFT: [-1, 0], RIGHT: [1, 0] };
  const DEAD_MOVE = 0.05, DEAD_LOOK = 0.05, LOOK_YAW = 3.4, LOOK_PITCH = 2.3, LOOK_UNITS = 700; // (full stick: rad/s, each way. LOOK_UNITS: "pixels"/s, what the comms wheel's picked by)
  const LOOK_CURVE = 2.2, CURSOR = 1150, SCROLL = 1000, HOLD = 0.35, REPEAT0 = 0.36, REPEAT = 0.11;
  // what a button is, in a level (RB held: the second column). A key held for as long as the button is, so R's tap, double tap and hold all still work.
  const KEYS: Partial<Record<PadBtn, string>> = { X: 'KeyR', UP: 'KeyN', DOWN: 'Space', LEFT: 'KeyQ', RIGHT: 'KeyE', R3: 'KeyV', VIEW: 'Tab' };
  const CHORD: Partial<Record<PadBtn, string>> = { A: 'KeyY', B: 'KeyH', X: 'KeyX', Y: 'KeyB', UP: 'KeyN', DOWN: 'KeyT', LEFT: 'KeyI', RIGHT: 'KeyM', VIEW: 'Enter' };
  const MOUSE: Partial<Record<PadBtn, number>> = { RT: 0, LT: 2, LB: 1 };
  const NATIVE = 'button,input,select,textarea,summary,a[href]', ROOTS = ['regOffer', 'aboxPick', 'sidearmPick', 'fieldInv', 'pause', 'career', 'gameover', 'shop', 'lobby', 'route', 'menu'];
  const TEXT = ['text', 'search', 'email', 'password', 'url', 'tel', ''];

  let index: number | null = null, on = false, prev: Partial<Record<PadBtn, boolean>> = {}, cur: Partial<Record<PadBtn, boolean>> = {};
  const heldOff: Partial<Record<PadBtn, () => void>> = {}; // (what lets go of each button that's down, in a level)
  let wasPlay = false, chordUsed = false, rbAt = 0, bAt = 0, bDone = false, steady = false, warned = false;
  let cx = innerWidth / 2, cy = innerHeight / 2, free = false, focus: Element | null = null, root: HTMLElement | null = null, over: Element | null = null, moved = true;
  let press: { target: Element; x: number; y: number } | null = null, lastClick = 0, lastClickOn: Element | null = null, repeatDir: PadDir | null = null, repeatT = 0, scrollAcc = 0, hoverT = 0;
  let cursorEl: HTMLElement, ringEl: HTMLElement, hintEl: HTMLElement, oskEl: HTMLElement, oskShift = false;
  let osk: { input: HTMLInputElement; was: string } | null = null;

  const fire = (t: EventTarget, ev: Event) => { t.dispatchEvent(ev); return ev; };
  // down the page's own path: on the body, so that listeners on the document and the window hear it too
  const key = (type: 'keydown' | 'keyup', code: string, shift = false, t: EventTarget = document.body) => fire(t, new KeyboardEvent(type, { code, key: code === 'Escape' || code === 'Enter' || code === 'Tab' ? code : code.replace(/^Key/, '').toLowerCase(), shiftKey: shift, bubbles: true, cancelable: true }));
  const tap = (code: string, shift = false) => { key('keydown', code, shift); key('keyup', code, shift); };
  const glyph = (b: string) => `<b class="pad-g pad-${b.toLowerCase()}">${b}</b>`;
  const SUBS: [RegExp, string][] = [
    [/<b>[FG]<\/b>/g, glyph('A')], [/\bPress Y\b/g, `Press ${glyph('RB')}+${glyph('A')}`], [/\bLMB\b/g, glyph('RT')], [/\bRMB\b/g, glyph('LT')], [/\bTab:/g, `${glyph('View')}:`],
    [/^[12] · /, `${glyph('Y')} · `], [/(^|&nbsp; )B · /, `$1${glyph('RB')}+${glyph('Y')} · `], [/\(N\)/g, `(${glyph('Up')})`], [/\(T\)/g, `(${glyph('RB')}+${glyph('Down')})`], [/\(Shift\+N\)/g, `(${glyph('RB')}+${glyph('Up')})`],
  ];

  // ------------------------------------------------------------- the controller
  function read(): Gamepad | null {
    const pads = navigator.getGamepads ? [...navigator.getGamepads()] : [];
    let gp = index != null ? pads[index] : null;
    if (gp && !gp.connected) gp = null;
    const std = pads.filter((p): p is Gamepad => !!p && p.connected && p.mapping === 'standard');
    // (a second one: whichever is being used)
    if (!gp || !anyDown(gp)) { const busy = std.find(anyDown); if (busy) gp = busy; }
    if (!gp && std.length) gp = std[0];
    if (!gp && !warned && pads.some((p) => p && p.connected)) { warned = true; G.HUD.toast('', 'That controller has no standard mapping in this browser: it can\'t be used', 3); }
    return gp || null;
  }
  const value = (gp: Gamepad, i: number) => { const b = gp.buttons[i]; return b ? (i === 6 || i === 7 ? (b.value > 0.3 ? 1 : 0) : b.pressed || b.value > 0.5 ? 1 : 0) : 0; };
  const anyDown = (gp: Gamepad) => gp.buttons.some((_, i) => value(gp, i)) || gp.axes.slice(0, 4).some((a) => Math.abs(a) > 0.45);
  // a stick, its deadzone taken off all round and what's left stretched back out to 0..1 (curve: more of the travel for the small movements)
  function stick(gp: Gamepad, i: number, dead: number, curve: number): [number, number, number] {
    const x = gp.axes[i] || 0, y = gp.axes[i + 1] || 0, r = Math.min(1, Math.hypot(x, y));
    if (r <= dead) return [0, 0, 0];
    const k = Math.pow((r - dead) / (1 - dead), curve), n = Math.hypot(x, y);
    return [(x / n) * k, (y / n) * k, k];
  }
  function setOn(v: boolean) {
    if (on === v) return;
    on = v; document.body.classList.toggle('pad-on', v);
    if (!v) { uiOff(); releaseAll(); }
  }
  function unplugged() {
    index = null;
    const was = on, playing = wasPlay;
    releaseAll(); wasPlay = false; setOn(false); closeOsk(false);
    if (!was) return;
    G.HUD.toast('', 'Controller disconnected', 3);
    if (playing && G.Game.softLocked) G.Game.unlock(); // (no way of playing on: the pause menu, and a mouse or the next controller takes it from there)
  }

  function update(dt: number) {
    const gp = read();
    if (!gp) { if (index != null) unplugged(); return; }
    if (index == null) G.HUD.toast('', 'Controller connected', 2);
    index = gp.index;
    if (anyDown(gp)) setOn(true);
    prev = cur; cur = {};
    BTNS.forEach((b, i) => { cur[b] = !!value(gp, i); });
    if (!on) return;
    const g = G.Game, level = g.phase === 'level';
    if (level && !g.locked && !g.menuOpen() && g.$('pause').classList.contains('hidden')) g.lock(); // (nothing to click: straight in)
    const play = level && g.locked && !g.menuOpen() && g.$('pause').classList.contains('hidden') && !osk;
    if (wasPlay && !play) releaseAll();
    if (play !== wasPlay) { wasPlay = play; uiOff(); if (play) return; }
    if (play) gameplay(gp, dt); else menus(gp, dt);
  }

  // ------------------------------------------------------------- in a level
  const hit = (b: PadBtn) => !!cur[b] && !prev[b], lift = (b: PadBtn) => !cur[b] && !!prev[b];
  function holdKey(b: PadBtn, code: string, shift = false) { key('keydown', code, shift); heldOff[b] = () => key('keyup', code, shift); }
  function holdMouse(b: PadBtn, n: number) {
    fire(window, new MouseEvent('mousedown', { button: n }));
    heldOff[b] = () => fire(window, new MouseEvent('mouseup', { button: n }));
  }
  function letGo(b: PadBtn) { const f = heldOff[b]; if (f) { delete heldOff[b]; f(); } }
  function releaseAll() {
    for (const b of BTNS) letGo(b);
    if (steady) { steady = false; key('keyup', 'ShiftLeft'); }
    if (G.Me) G.Me.padMove = null;
    chordUsed = false; rbAt = bAt = 0; bDone = false;
  }
  // Y: the mouse wheel: the other weapon, or aiming through a scope with steps, the next one (round to the lowest again)
  function wheelStep() {
    const me = G.Me, w = me.cur(), L = w && w.def.magLevels;
    const top = L && me.ads && me.adsT > 0.5 && me.sight(w).i >= L.length - 1;
    for (let i = 0; i < (top ? L.length - 1 : 1); i++) fire(window, new WheelEvent('wheel', { deltaY: top ? 100 : -100 }));
  }
  // RB tapped: a grenade into your hand, the next kind each tap, and past the last one back to the gun (the number keys' own path: the same key again puts it away)
  function nextGrenade() {
    const me = G.Me, q = me.quick as (string | null | undefined)[], slots = [0, 1, 2].filter((i) => q[i]);
    if (!slots.length) return tap('Digit3');
    const at = me.held ? slots.findIndex((i) => q[i] === me.held!.kind) : -1;
    tap('Digit' + (slots[at >= 0 && at + 1 >= slots.length ? at : at + 1] + 3));
  }
  function gameplay(gp: Gamepad, dt: number) {
    const now = performance.now(), me = G.Me;
    if (hit('MENU')) { G.Game.unlock(); return; }
    for (const b of BTNS) if (lift(b)) letGo(b);
    if (hit('RB')) { rbAt = now; chordUsed = false; }
    if (lift('RB')) { if (!chordUsed && now - rbAt < HOLD * 1000) nextGrenade(); rbAt = 0; }
    const chord = !!cur.RB;
    for (const b of BTNS) {
      if (!hit(b)) continue;
      if (MOUSE[b] != null) { holdMouse(b, MOUSE[b]!); continue; }
      if (chord && CHORD[b]) { chordUsed = true; holdKey(b, CHORD[b]!, b === 'UP'); continue; }
      if (b === 'A') holdKey(b, me.out ? 'KeyG' : 'KeyF'); // (out cold, there's only the giving up to hold down)
      else if (b === 'Y') wheelStep();
      else if (b === 'L3') { steady = !steady; key(steady ? 'keydown' : 'keyup', 'ShiftLeft'); }
      else if (KEYS[b]) holdKey(b, KEYS[b]!);
    }
    // B: a tap crouches, held it's prone
    if (hit('B') && !chord) { bAt = now; bDone = false; }
    if (bAt && cur.B && !bDone && now - bAt > HOLD * 1000) { bDone = true; tap('KeyZ'); }
    if (lift('B')) { if (bAt && !bDone) tap('KeyC'); bAt = 0; }
    const [mx, my, mk] = stick(gp, 0, DEAD_MOVE, 1);
    me.padMove = mk ? { st: mx, fw: -my, k: Math.max(0.3, mk) } : null;
    const [lx, ly, lk] = stick(gp, 2, DEAD_LOOK, LOOK_CURVE);
    if (lk) me.lookBy(lx * LOOK_UNITS * dt, ly * LOOK_UNITS * dt * (LOOK_PITCH / LOOK_YAW), (LOOK_YAW / LOOK_UNITS) * G.Game.settings.padSens);
  }

  // ------------------------------------------------------------- in a menu
  const shown = (el: Element | null): el is HTMLElement => !!el && el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden';
  function clickable(el: Element) {
    if ((el as HTMLButtonElement).disabled || (el as HTMLInputElement).type === 'hidden') return false;
    return el.matches(NATIVE) || /^(pointer|grab|copy)$/.test(getComputedStyle(el).cursor);
  }
  function findRoot(): HTMLElement | null {
    if (osk) return oskEl;
    const m = document.querySelectorAll<HTMLElement>('.inv-menu');
    if (m.length) return m[m.length - 1];
    if (document.getElementById('veil')!.classList.contains('on')) return null;
    for (const id of ROOTS) { const e = document.getElementById(id); if (shown(e) && !e.classList.contains('hidden')) return e; }
    return null;
  }
  function targets(r: HTMLElement) {
    const out: Element[] = []; let last: Element | null = null;
    for (const el of r.querySelectorAll('*')) {
      if (last && last.contains(el)) continue;
      if (!clickable(el) || !shown(el) || (el.closest('details:not([open])') && !el.closest('summary'))) continue; // (a closed <details>' contents still have boxes)
      const b = el.getBoundingClientRect();
      if (b.width * b.height > innerWidth * innerHeight * 0.3) continue; // (a whole view you drag about: the cursor's for that)
      out.push(el); last = el;
    }
    return out;
  }
  function centre(el: Element): [number, number] { const b = el.getBoundingClientRect(); return [b.left + b.width / 2, b.top + b.height / 2]; }
  function setFocus(el: Element | null, scroll = true) {
    focus = el; free = false;
    if (!el) return;
    if (scroll) el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    [cx, cy] = centre(el); moved = true;
  }
  function firstFocus(r: HTMLElement) {
    const t = targets(r);
    return t.find((e) => e.matches('.primary')) || t[0] || null;
  }
  function nearest(r: HTMLElement) {
    let best: Element | null = null, bd = Infinity;
    for (const e of targets(r)) { const [x, y] = centre(e), d = Math.hypot(x - cx, y - cy); if (d < bd) { bd = d; best = e; } }
    return best;
  }
  function snap([dx, dy]: PadDir) {
    if (!root) return;
    const f = focus && shown(focus) ? focus : null, [ox, oy] = f ? centre(f) : [cx, cy], fr = f ? f.getBoundingClientRect() : null;
    let best: Element | null = null, bs = Infinity;
    for (const e of targets(root)) {
      if (e === f) continue;
      const [x, y] = centre(e), along = (x - ox) * dx + (y - oy) * dy, r = e.getBoundingClientRect();
      // (how far off to the side: nothing if it's in line with this one, so a wide button finds the narrow ones above it, a row at a time)
      const across = dy ? Math.max(0, r.left - (fr ? fr.right : ox), (fr ? fr.left : ox) - r.right) : Math.max(0, r.top - (fr ? fr.bottom : oy), (fr ? fr.top : oy) - r.bottom);
      if (along < 4) continue;
      const s = along + across * 2.5;
      if (s < bs) { bs = s; best = e; }
    }
    if (best) { setFocus(best); G.Audio.click(); } else scrollBy(dy * 160);
  }
  function elementAtCursor() { return document.elementFromPoint(cx, cy); }
  function pointer(type: string, t: Element, buttons: number) {
    const o = { bubbles: !/enter|leave/.test(type), cancelable: true, clientX: cx, clientY: cy, button: 0, buttons };
    fire(t, type.startsWith('pointer') ? new PointerEvent(type, { ...o, pointerId: 1, pointerType: 'mouse', isPrimary: true }) : new MouseEvent(type, o));
  }
  // what the pointer's over, and what it's left, as a mouse would have it: hover cards and previews go by these
  function hover() {
    const t = elementAtCursor();
    if (t !== over) {
      const was = over; over = t;
      if (was && was.isConnected) { pointer('pointerout', was, 0); pointer('mouseout', was, 0); for (let e: Element | null = was; e && !(t && e.contains(t)); e = e.parentElement) { pointer('pointerleave', e, 0); pointer('mouseleave', e, 0); } }
      if (t) { pointer('pointerover', t, 0); pointer('mouseover', t, 0); for (let e: Element | null = t; e && !(was && e.contains(was)); e = e.parentElement) { pointer('pointerenter', e, 0); pointer('mouseenter', e, 0); } }
    }
    const to = press && press.target instanceof HTMLCanvasElement ? press.target : t; // (a canvas keeps the pointer it's captured: js/gunsmith.ts)
    if (to) { pointer('pointermove', to, press ? 1 : 0); pointer('mousemove', to, press ? 1 : 0); }
  }
  function aimed(): Element | null { // (what's under the cursor; one scrolled half out of its box still answers to it)
    const t = elementAtCursor();
    return focus && focus.isConnected && !(t && focus.contains(t)) && !free ? focus : t;
  }
  function pressDown() {
    const t = aimed();
    if (!t) return;
    const c = focus && focus.contains(t) ? focus : t;
    if (c instanceof HTMLSelectElement) return cycle(c, 1);
    if (c instanceof HTMLInputElement && TEXT.includes(c.type)) return openOsk(c);
    if (c instanceof HTMLInputElement && c.type === 'range') return;
    press = { target: t, x: cx, y: cy };
    pointer('pointerdown', t, 1); pointer('mousedown', t, 1);
  }
  function pressUp(cancel = false) {
    if (!press) return;
    const at = press.target, pt = at instanceof HTMLCanvasElement ? at : elementAtCursor() || at;
    press = null;
    pointer('pointerup', pt, 0); pointer('mouseup', pt, 0);
    if (cancel || !(at.isConnected ? at.contains(pt) || pt.contains(at) : true)) return;
    const now = performance.now(), dbl = lastClickOn === at && now - lastClick < 350;
    lastClick = dbl ? 0 : now; lastClickOn = at;
    const o = { bubbles: true, cancelable: true, clientX: cx, clientY: cy, button: 0, detail: dbl ? 2 : 1 };
    if (at.isConnected) fire(at, new MouseEvent('click', o));
    if (dbl && at.isConnected) fire(at, new MouseEvent('dblclick', o));
  }
  function cycle(s: HTMLSelectElement, d: number) {
    const n = s.options.length; if (!n) return;
    s.selectedIndex = (s.selectedIndex + d + n) % n;
    fire(s, new Event('input', { bubbles: true })); fire(s, new Event('change', { bubbles: true })); G.Audio.click();
  }
  function nudge(el: HTMLInputElement, d: number) {
    const was = el.value;
    if (d > 0) el.stepUp(); else el.stepDown();
    if (el.value !== was) { fire(el, new Event('input', { bubbles: true })); fire(el, new Event('change', { bubbles: true })); }
  }
  function scrollBy(dy: number) {
    const t = elementAtCursor(); if (!t) return;
    const ev = fire(t, new WheelEvent('wheel', { bubbles: true, cancelable: true, deltaY: dy, clientX: cx, clientY: cy }));
    if (ev.defaultPrevented) return;
    for (let e: Element | null = t; e; e = e.parentElement) if (e.scrollHeight > e.clientHeight + 1 && /auto|scroll/.test(getComputedStyle(e).overflowY)) { e.scrollTop += dy; return; }
  }
  function direction([dx, dy]: PadDir) {
    const f = focus && !free ? focus : null;
    if (dx && f instanceof HTMLInputElement && f.type === 'range') return nudge(f, dx);
    if (dx && f instanceof HTMLSelectElement) return cycle(f, dx);
    const cell = press ? G.InvUI.dragCell : 0; // (carrying something: a cell at a time, to put it down exactly)
    if (cell) { cx = G.U.clamp(cx + dx * cell, 0, innerWidth - 1); cy = G.U.clamp(cy + dy * cell, 0, innerHeight - 1); free = true; focus = null; moved = true; return; }
    snap([dx, dy]);
  }
  function back() {
    if (osk) { if (osk.input.value) oskKey('back'); else closeOsk(false); return; }
    const g = G.Game, hid = (id: string) => g.$(id).classList.contains('hidden'), r = root && root.id;
    if (root && root.classList.contains('inv-menu')) { pointer('pointerdown', document.body, 1); pointer('pointerup', document.body, 0); return; }
    if (focus) { const d = focus.closest('details'); if (d && d.open) { d.open = false; setFocus(d.querySelector('summary')); return; } }
    if (r === 'pause') g.$('btnResume').click();
    else if (r === 'career') g.$('btnCareerBack').click();
    else if (r === 'lobby') setFocus(g.$('btnLeave')); // (leaving's a press of its own: it costs the room)
    else if (r === 'regOffer' || !hid('fieldInv') || !hid('aboxPick') || (r === 'shop' && g.hub)) tap('Escape');
  }
  function tabs(d: number) {
    const all = [...document.querySelectorAll<HTMLElement>('#shop:not(.hidden) #shopTabs .tab')], i = all.findIndex((t) => t.classList.contains('on'));
    if (all.length && i >= 0) { all[(i + d + all.length) % all.length].click(); G.Audio.click(); }
  }
  function context() {
    const t = aimed(); if (!t) return;
    fire(t, new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: cx, clientY: cy, button: 2 }));
  }
  function menus(gp: Gamepad, dt: number) {
    const g = G.Game;
    if (g.chatOpen && !osk) openOsk(g.$<HTMLInputElement>('chatInput'));
    if (osk && osk.input.id === 'chatInput' && !g.chatOpen) closeOsk(false);
    const r = findRoot();
    if (r !== root) { pressUp(true); root = r; setFocus(r ? firstFocus(r) : null); }
    else if (r && !free && (!focus || !focus.isConnected || !shown(focus)) && (hoverT -= dt) <= 0) { hoverT = 0.15; const f = nearest(r); focus = f; if (f) [cx, cy] = centre(f); moved = true; }

    // the left stick: the cursor, free (for what isn't a button: a place in a grid, a part of a gun)
    const [sx, sy, sk] = stick(gp, 0, DEAD_MOVE, 1.6);
    if (sk) {
      cx = G.U.clamp(cx + sx * CURSOR * dt, 0, innerWidth - 1); cy = G.U.clamp(cy + sy * CURSOR * dt, 0, innerHeight - 1);
      free = true; moved = true;
      let e = elementAtCursor(); while (e && e !== r && !clickable(e)) e = e.parentElement;
      focus = e && e !== r ? e : null;
    } else if (focus && !free && shown(focus)) { const [x, y] = centre(focus); if (Math.abs(x - cx) + Math.abs(y - cy) > 1 && !press) { cx = x; cy = y; moved = true; } }
    // the right stick: the wheel
    const [, wy, wk] = stick(gp, 2, DEAD_LOOK, 1.6);
    scrollAcc += wk ? wy * SCROLL * dt : 0;
    if (Math.abs(scrollAcc) >= 40) { scrollBy(scrollAcc); scrollAcc = 0; }
    if (moved || (hoverT -= dt) <= 0) { moved = false; hoverT = 0.2; hover(); }

    const d: PadDir | null = (Object.keys(DIRS) as PadBtn[]).filter((b) => cur[b]).map((b) => DIRS[b]!)[0] || null;
    if (d) {
      const same = repeatDir && repeatDir[0] === d[0] && repeatDir[1] === d[1];
      if (!same) { repeatDir = d; repeatT = REPEAT0; direction(d); }
      else if ((repeatT -= dt) <= 0) { repeatT = REPEAT; direction(d); }
    } else repeatDir = null;

    if (hit('A')) pressDown();
    if (lift('A')) pressUp();
    if (hit('B')) back();
    if (osk) {
      if (hit('Y')) oskKey(' ');
      if (hit('X')) oskKey('shift');
      if (hit('MENU')) closeOsk(true);
      if (hit('VIEW')) closeOsk(false);
    } else {
      if (hit('X')) context();
      if (hit('Y')) tap('KeyR'); // (R: what's being carried turns: js/invui.ts onKey)
      if (hit('LB')) tabs(-1);
      if (hit('RB')) tabs(1);
      if (hit('VIEW') && g.phase === 'level') tap('Tab');
      if (hit('MENU')) { if (root && root.id === 'pause') g.$('btnResume').click(); else if (g.phase === 'level') tap('Escape'); }
    }
    paint();
  }
  function hintText() {
    const g = (b: string) => glyph(b);
    if (osk) return `${g('A')} type · ${g('B')} delete · ${g('X')} shift · ${g('Y')} space · ${g('Menu')} done · ${g('View')} cancel`;
    const carry = root && (root.id === 'fieldInv' || root.id === 'shop') ? ` · hold ${g('A')} carry · ${g('Y')} turn · ${g('X')} more` : '';
    const sound = G.Audio.ctx && G.Audio.ctx.state === 'suspended' ? ' · <span class="pad-warn">Tap the screen once for sound</span>' : '';
    return `${g('D-pad')} select · ${g('L')} cursor · ${g('R')} scroll · ${g('A')} confirm · ${g('B')} back${root && root.id === 'shop' ? ` · ${g('LB')}${g('RB')} tabs` : ''}${carry}${sound}`;
  }
  function paint() {
    const show = !!root;
    cursorEl.classList.toggle('on', show); hintEl.classList.toggle('on', show); ringEl.classList.toggle('on', show && !!focus);
    if (!show) return;
    cursorEl.style.transform = `translate(${cx}px, ${cy}px)`;
    if (focus) { const b = focus.getBoundingClientRect(); Object.assign(ringEl.style, { left: b.left - 3 + 'px', top: b.top - 3 + 'px', width: b.width + 6 + 'px', height: b.height + 6 + 'px' }); }
    const h = hintText(); if (hintEl.dataset.h !== h) { hintEl.dataset.h = h; hintEl.innerHTML = h; }
  }
  function uiOff() {
    pressUp(true); root = null; focus = null; free = false; over = null; repeatDir = null;
    if (cursorEl) { cursorEl.classList.remove('on'); ringEl.classList.remove('on'); hintEl.classList.remove('on'); }
  }

  // ------------------------------------------------------------- typing, with no keyboard: every text box, the room code and the chat among them
  function oskDraw() {
    if (!osk) return;
    const R = ['1234567890', 'QWERTYUIOP', 'ASDFGHJKL-', 'ZXCVBNM_.@'], up = oskShift;
    const v = osk.input.type === 'password' ? '•'.repeat(osk.input.value.length) : osk.input.value;
    oskEl.innerHTML = `<div class="osk-box ui-panel"><div class="osk-what">${G.U.esc(osk.input.placeholder || 'Enter text')}</div><div class="osk-text">${G.U.esc(v)}<i></i></div>`
      + R.map((r) => `<div class="osk-row">${[...r].map((c) => { const k = up ? c : c.toLowerCase(); return `<button class="btn" data-k="${G.U.esc(k)}">${G.U.esc(k)}</button>`; }).join('')}</div>`).join('')
      + `<div class="osk-row"><button class="btn${up ? ' on' : ''}" data-k="shift">Shift</button><button class="btn osk-wide" data-k=" ">Space</button><button class="btn" data-k="back">Delete</button><button class="btn" data-k="cancel">Cancel</button><button class="btn primary" data-k="done">Done</button></div></div>`;
  }
  function openOsk(input: HTMLInputElement) {
    osk = { input, was: input.value };
    oskShift = input.maxLength === 5; // (a room code: capitals)
    oskEl.classList.remove('hidden');
    oskDraw(); pressUp(true); root = oskEl;
    setFocus(oskEl.querySelector('[data-k="done"]') || null, false);
  }
  function closeOsk(done: boolean) {
    if (!osk) return;
    const { input, was } = osk;
    osk = null; oskEl.classList.add('hidden'); oskEl.innerHTML = ''; focus = null; root = null;
    if (!done && input.value !== was) { input.value = was; fire(input, new Event('input', { bubbles: true })); }
    if (done) fire(input, new Event('change', { bubbles: true }));
    key('keydown', done ? 'Enter' : 'Escape', false, input); key('keyup', done ? 'Enter' : 'Escape', false, input); // (what a keyboard's Enter or Esc does in this box: sends the chat, joins the room)
  }
  function oskKey(k: string) {
    if (!osk) return;
    const inp = osk.input;
    if (k === 'done') return closeOsk(true);
    if (k === 'cancel') return closeOsk(false);
    if (k === 'shift') oskShift = !oskShift;
    else {
      if (k === 'back') inp.value = inp.value.slice(0, -1);
      else if (inp.maxLength < 0 || inp.value.length < inp.maxLength) inp.value += k;
      fire(inp, new Event('input', { bubbles: true }));
    }
    const at = focus instanceof HTMLElement ? focus.dataset.k : null;
    oskDraw();
    if (at != null) { const b = [...oskEl.querySelectorAll<HTMLElement>('[data-k]')].find((e) => (e.dataset.k as string).toLowerCase() === at.toLowerCase()); if (b) setFocus(b, false); }
    G.Audio.click();
  }

  function init() {
    const add = (id: string, cls?: string) => { const e = document.createElement('div'); e.id = id; if (cls) e.className = cls; document.body.appendChild(e); return e; };
    ringEl = add('padRing'); cursorEl = add('padCursor'); hintEl = add('padHints', 'ui'); oskEl = add('padKeys', 'ui hidden');
    oskEl.addEventListener('click', (e) => { const b = (e.target as HTMLElement).closest<HTMLElement>('[data-k]'); if (b) oskKey(b.dataset.k!); });
    // A mouse or a keyboard picks up where the controller left off (real ones only: what's sent from here isn't trusted). The prompts go back to keys, the
    // cursor's gone; and a real press is the gesture a browser wants before it will play sound.
    const mine = (e: Event) => { if (!e.isTrusted) return; if (on) setOn(false); if (G.Audio.ctx && G.Audio.ctx.state === 'suspended') G.Audio.init(); };
    for (const ev of ['keydown', 'mousedown', 'pointerdown', 'touchend']) window.addEventListener(ev, mine, true);
    window.addEventListener('mousemove', (e) => { if (e.isTrusted && on && Math.abs(e.movementX) + Math.abs(e.movementY) > 4) setOn(false); }, true);
  }

  return {
    init, update,
    active: () => on,
    // the events a level's buttons are, and the two that take working out (js/touch.ts sends the same ones)
    synth: { fire, key, tap, wheelStep, nextGrenade },
    // a key prompt, in the controller's buttons while it's the one being used
    text(html: string) { if (G.Touch.active()) return G.Touch.text(html); if (!on) return html; for (const [re, to] of SUBS) html = html.replace(re, to); return html; },
  };
})();
G.Pad = G_Pad;
interface GameModules { Pad: typeof G_Pad; }
