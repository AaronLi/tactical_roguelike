'use strict';
// A touch screen. Like the controller (js/gamepad.ts) it's not a control scheme of its own: the on-screen buttons are the keys and mouse buttons they stand
// for, sent as those events down the same handlers (js/player.ts bindInput, js/game.ts bindMenu); only the stick and the look drag go in direct (G.Me.padMove,
// G.Me.lookBy). A touch screen has no pointer lock either, so G.Game.softLocked stands in for it (js/game.ts lock).
// Menus are the page's own pointer events, which a finger already sends; what a finger hasn't got is added here, once for every screen: a long press is the
// right click (and shows a title="" text, which nothing else can), two quick taps are a double click, two fingers on the gunsmith or the sidearm web are the wheel.
// Comes on at once on a phone or a tablet, or on a laptop's touch screen the first time it's touched; a real mouse or keyboard puts it away again. ?touch keeps it on.
const G_Touch = (() => {
  const FORCED = new URLSearchParams(location.search).has('touch'), PHONE = FORCED || matchMedia('(hover: none) and (pointer: coarse)').matches;
  const STICK_R = 56, DEAD = 0.14, SLOW_R = 0.5, FAST_R = 0.92, FAST_FW = 0.75, LOOK = 0.0048, HOLD_MS = 350, AIM_TAP_MS = 220, LONG_MS = 500, SLOP = 10, DBL_MS = 320, EDGE = 56, EDGE_SPEED = 14;
  // a key held for as long as the button is (so R's tap, double tap and hold all still work): [code, with shift]
  const KEYS: Record<string, [string, boolean?]> = { reload: ['KeyR'], leanL: ['KeyQ'], leanR: ['KeyE'], inspect: ['KeyI'], pack: ['KeyB'], shout: ['KeyV'], mode: ['KeyX'], prone: ['KeyZ'], nv: ['KeyN'], ir: ['KeyN', true], therm: ['KeyT'], body: ['KeyH'], mute: ['KeyM'], vote: ['KeyY'], lower: ['Space'], bag: ['Tab'], pause: ['Escape'] };
  const LOOK_THROUGH = new Set(['fire', 'fireL', 'aim', 'ping']); // (a finger on one of these turns the view as well: and on Ping, picks on the comms wheel)
  const MAIN: [string, string][] = [['fire', 'Fire'], ['fireL', 'Fire'], ['aim', 'Aim'], ['reload', 'Reload'], ['swap', 'Swap'], ['use', 'Use'], ['crouch', 'Crouch'], ['nade', 'Nade'], ['more', 'More'], ['leanL', 'Lean L'], ['leanR', 'Lean R']];
  const TOP: [string, string][] = [['fs', 'Full'], ['chat', 'Chat'], ['bag', 'Kit'], ['pause', 'Menu']];
  const MORE: [string, string][] = [['ping', 'Ping'], ['shout', 'Shout'], ['steady', 'Steady'], ['lower', 'Lower'], ['prone', 'Prone'], ['mode', 'Mode'], ['inspect', 'Inspect'], ['pack', 'Pack'], ['nv', 'Night'], ['ir', 'IR'], ['therm', 'Therm'], ['body', 'Body'], ['mute', 'Mute'], ['vote', 'Vote']];
  const SUBS: [RegExp, string][] = [
    [/\bPress <b>[FG]<\/b>/g, 'Tap <b>USE</b>'], [/<b>[FG]<\/b>/g, '<b>USE</b>'], [/\bPress Y\b/g, 'Tap <b>VOTE</b> under <b>MORE</b>'], [/\bLMB\b/g, 'FIRE'], [/\bRMB\b/g, 'AIM'], [/\bTab to treat/g, 'KIT to treat'], [/\bTab:/g, 'KIT:'], [/<b>N<\/b> flips/g, '<b>NIGHT</b> flips'],
    [/^[12] · /, 'SWAP · '], [/(^|&nbsp; )B · /, '$1PACK · '], [/\(N\)/g, '(NIGHT)'], [/\(T\)/g, '(THERM)'], [/\(Shift\+N\)/g, '(IR)'],
    [/\bClick to vote/g, 'Tap again to vote'], [/\bdouble-click/gi, 'double-tap'], [/\bright-click/gi, 'long-press'], [/\bscroll to zoom/g, 'pinch to zoom'], [/\bClick\b/g, 'Tap'], [/\bclick\b/g, 'tap'], [/\bR turns what you're holding/g, "a second finger turns what you're holding"], [/\bTab or Esc closes/g, '× closes'],
  ];

  type Finger = { kind: 'stick' | 'look' | 'btn'; t?: string; el?: HTMLElement; x: number; y: number; ox: number; oy: number };
  let on = false, wasPlay = false, uiEl: HTMLElement, moreEl: HTMLElement, stickEl: HTMLElement, knobEl: HTMLElement, closeEl: HTMLElement, tipEl: HTMLElement, turnEl: HTMLElement, turnGone = false;
  const fingers = new Map<number, Finger>(), off: Record<number, () => void> = {}, btn: Record<string, HTMLElement> = {};
  let sx = 0, sy = 0, crouchAt = 0, crouchDone = false, aimWas = false, aimAt = 0, fires = 0;

  const S = () => G.Pad.synth;
  const mouse = (type: 'mousedown' | 'mouseup', n: number) => S().fire(window, new MouseEvent(type, { button: n }));
  const portrait = () => innerHeight > innerWidth;

  function setOn(v: boolean) {
    if (FORCED) v = true;
    if (on === v) return;
    on = v; document.body.classList.toggle('touch-on', v);
    if (G.InvUI && G.Game && G.Game.settings) G.InvUI.scaleUI();
    if (!v) { hideUi(); if (G.Game && G.Game.softLocked && !G.Pad.active()) G.Game.unlock(); } // (no way of playing on: the pause menu, and its Resume takes the mouse)
  }
  function hideUi() { releaseAll(); if (uiEl) { uiEl.classList.add('hidden'); closeEl.classList.add('hidden'); turnEl.classList.add('hidden'); } wasPlay = false; }

  // ------------------------------------------------------------- in a level
  function press(t: string, el: HTMLElement, id: number) {
    const me = G.Me, s = S();
    el.classList.add('held');
    if (KEYS[t]) { const [c, sh] = KEYS[t]; s.key('keydown', c, !!sh); off[id] = () => s.key('keyup', c, !!sh); return; }
    switch (t) {
      case 'fire': case 'fireL': if (fires++ === 0) mouse('mousedown', 0); off[id] = () => { if (--fires === 0) mouse('mouseup', 0); }; break; // (the two are one trigger: it's let go when both are)
      case 'ping': mouse('mousedown', 1); off[id] = () => mouse('mouseup', 1); break;
      // Aim: a tap puts it up (or down again) and it stays so, and a held one's up for as long as it's held. A grenade's is the throw picker: press and let go, as RMB
      case 'aim': aimWas = me.mouse.r; aimAt = performance.now(); if (!aimWas) mouse('mousedown', 2);
        off[id] = () => { if (aimWas || me.held || performance.now() - aimAt >= AIM_TAP_MS) mouse('mouseup', 2); }; break;
      case 'use': { const c = me.out ? 'KeyG' : 'KeyF'; s.key('keydown', c); off[id] = () => s.key('keyup', c); break; }
      case 'crouch': crouchAt = performance.now(); crouchDone = false; off[id] = () => { if (crouchAt && !crouchDone) s.tap('KeyC'); crouchAt = 0; }; break; // (a tap crouches, held it's prone)
      case 'swap': s.wheelStep(); break;
      case 'nade': s.nextGrenade(); break;
      case 'steady': s.key(me.keys.ShiftLeft ? 'keyup' : 'keydown', 'ShiftLeft'); break;
      case 'more': moreEl.classList.toggle('hidden'); G.Audio.click(); break;
    }
  }
  function letGo(id: number, f: Finger) {
    if (f.el) f.el.classList.remove('held');
    const o = off[id]; if (o) { delete off[id]; o(); }
    if (f.kind === 'stick') { sx = sy = 0; stickEl.classList.remove('live'); knobEl.style.transform = ''; if (G.Me) G.Me.padMove = null; }
    fingers.delete(id);
  }
  function releaseAll() {
    for (const [id, f] of [...fingers]) letGo(id, f);
    const me = G.Me;
    if (me && me.mouse && me.mouse.r && on) mouse('mouseup', 2);
    if (me && me.keys && me.keys.ShiftLeft && on) S().key('keyup', 'ShiftLeft');
    if (me) me.padMove = null;
    crouchAt = 0;
  }
  function onDown(e: PointerEvent) {
    e.preventDefault();
    const b = (e.target as HTMLElement).closest<HTMLElement>('[data-t]');
    const f: Finger = { kind: 'look', x: e.clientX, y: e.clientY, ox: e.clientX, oy: e.clientY };
    if (b) { f.kind = 'btn'; f.t = b.dataset.t; f.el = b; fingers.set(e.pointerId, f); press(f.t!, b, e.pointerId); return; }
    if (e.clientX < innerWidth * (portrait() ? 0.5 : 0.42) && ![...fingers.values()].some((g) => g.kind === 'stick')) {
      f.kind = 'stick'; stickEl.classList.add('live'); stickEl.style.left = f.ox + 'px'; stickEl.style.top = f.oy + 'px'; stickEl.style.bottom = 'auto'; knobEl.style.transform = '';
    }
    fingers.set(e.pointerId, f);
  }
  function onMove(e: PointerEvent) {
    const f = fingers.get(e.pointerId);
    if (!f) return;
    const dx = e.clientX - f.x, dy = e.clientY - f.y;
    f.x = e.clientX; f.y = e.clientY;
    if (f.kind === 'stick') {
      let ax = f.x - f.ox, ay = f.y - f.oy, r = Math.hypot(ax, ay);
      if (r > STICK_R) { f.ox = f.x - (ax / r) * STICK_R; f.oy = f.y - (ay / r) * STICK_R; ax = f.x - f.ox; ay = f.y - f.oy; r = STICK_R; stickEl.style.left = f.ox + 'px'; stickEl.style.top = f.oy + 'px'; } // (the stick follows a finger gone past its edge)
      sx = ax / STICK_R; sy = ay / STICK_R;
      knobEl.style.transform = `translate(${ax}px, ${ay}px)`;
    } else if ((f.kind === 'look' || LOOK_THROUGH.has(f.t!)) && (dx || dy)) G.Me.lookBy(dx, dy, LOOK * G.Game.settings.touchSens);
  }
  function onUp(e: PointerEvent) { const f = fingers.get(e.pointerId); if (f) letGo(e.pointerId, f); }

  function update(_dt: number) {
    if (!on) return;
    if (G.Pad.active()) { hideUi(); return; }
    const g = G.Game, level = g.phase === 'level', pauseHid = g.$('pause').classList.contains('hidden');
    if (level && !g.locked && !g.menuOpen() && pauseHid) g.lock(); // (nothing to click: straight in)
    const play = level && g.locked && !g.menuOpen() && pauseHid && !g.$('hud').classList.contains('hidden');
    closeEl.classList.toggle('hidden', !(g.invOpen || g.aboxOpen || (g.shopOpen && g.hub)));
    turnEl.classList.toggle('hidden', !(play && portrait() && !turnGone));
    if (!play) { if (wasPlay) { releaseAll(); moreEl.classList.add('hidden'); uiEl.classList.add('hidden'); } wasPlay = false; return; }
    if (!wasPlay) uiEl.classList.remove('hidden');
    wasPlay = true;
    const me = G.Me;
    if (crouchAt && !crouchDone && performance.now() - crouchAt > HOLD_MS) { crouchDone = true; S().tap('KeyZ'); }
    const r = Math.min(1, Math.hypot(sx, sy));
    // how far it's pushed picks the pace, as the keys do: a little is Shift's creep, most of the way a walk, and all the way forward Space's low-ready run
    if (r > DEAD) { const n = Math.hypot(sx, sy), fw = -sy / n, slow = r < SLOW_R, fast = r >= FAST_R && fw > FAST_FW; me.padMove = { st: sx / n, fw, k: 1, slow, fast }; stickEl.classList.toggle('slow', slow); stickEl.classList.toggle('fast', fast); } else { me.padMove = null; stickEl.classList.remove('slow', 'fast'); }
    // what the buttons show
    btn.aim.classList.toggle('on', !!me.mouse.r); btn.crouch.classList.toggle('on', !!(me.crouch || me.prone)); btn.prone.classList.toggle('on', !!me.prone);
    btn.steady.classList.toggle('on', !!me.keys.ShiftLeft); btn.lower.classList.toggle('on', !!me.lowToggle); btn.more.classList.toggle('on', !moreEl.classList.contains('hidden'));
    btn.use.classList.toggle('ready', !!g.$('prompt').textContent);
    btn.nade.classList.toggle('none', !me.quick.some((q: string | null | undefined) => q && me.quickCount(q as PHeldKind)));
    btn.vote.classList.toggle('ready', !!(g.extract && g.extract.active));
  }

  // ------------------------------------------------------------- what a finger hasn't got
  const at = (x: number, y: number) => document.elementFromPoint(x, y);
  const inUi = (t: EventTarget | null) => t instanceof Element && !!t.closest('#touchUi');
  let lp: { id: number; x: number; y: number; timer: number } | null = null, lastTap: { at: number; x: number; y: number } | null = null, longDone = false;
  function endLong() { if (lp) { clearTimeout(lp.timer); lp = null; } }
  function showTip(text: string, x: number, y: number) {
    tipEl.textContent = text; tipEl.classList.remove('hidden');
    const w = tipEl.offsetWidth, h = tipEl.offsetHeight;
    tipEl.style.left = G.U.clamp(x - w / 2, 8, Math.max(8, innerWidth - w - 8)) + 'px';
    tipEl.style.top = (y - h - 24 > 8 ? y - h - 24 : Math.min(y + 24, Math.max(8, innerHeight - h - 8))) + 'px';
  }
  function longPress() {
    if (!lp) return;
    const { x, y } = lp, t = at(x, y);
    lp = null; lastTap = null; longDone = true;
    if (!t) return;
    if (navigator.vibrate) navigator.vibrate(12);
    G.InvUI.cancelDrag(); // (the press that started it was the start of a drag, as far as the inventory knew)
    t.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: x, clientY: y, button: 2 }));
    if (t.closest('.inv-item')) return; // (the item's menu says it)
    const tt = t.closest<HTMLElement>('[title]');
    if (tt && tt.title) showTip(tt.title, x, y);
  }
  // two fingers on what the wheel zooms
  const PINCH = '.gs-canvas, .web-view';
  const pinch = new Map<number, { x: number; y: number }>();
  let pinchD = 0;
  function pinchMove() {
    const [a, b] = [...pinch.values()], d = Math.hypot(a.x - b.x, a.y - b.y), cx = (a.x + b.x) / 2, cy = (a.y + b.y) / 2;
    if (!pinchD) { pinchD = d; return; }
    const r = Math.log(d / pinchD);
    if (Math.abs(r) < 0.09) return;
    pinchD = d;
    const t = at(cx, cy);
    if (t) t.dispatchEvent(new WheelEvent('wheel', { bubbles: true, cancelable: true, deltaY: r > 0 ? -100 : 100, clientX: cx, clientY: cy }));
  }
  function gestures() {
    window.addEventListener('pointerdown', (e) => {
      if (e.pointerType !== 'touch' || !on || inUi(e.target)) return;
      tipEl.classList.add('hidden');
      if (e.target instanceof Element && e.target.closest(PINCH)) { pinch.set(e.pointerId, { x: e.clientX, y: e.clientY }); if (pinch.size === 2) pinchD = 0; }
      if (lp) { endLong(); return; } // (a second finger: not a long press)
      longDone = false;
      lp = { id: e.pointerId, x: e.clientX, y: e.clientY, timer: window.setTimeout(longPress, LONG_MS) };
    }, true);
    window.addEventListener('pointermove', (e) => {
      const p = pinch.get(e.pointerId);
      if (p) { p.x = e.clientX; p.y = e.clientY; if (pinch.size === 2) pinchMove(); }
      if (lp && e.pointerId === lp.id && Math.hypot(e.clientX - lp.x, e.clientY - lp.y) > SLOP) endLong();
    }, true);
    const up = (e: PointerEvent) => {
      pinch.delete(e.pointerId); if (pinch.size < 2) pinchD = 0;
      if (!lp || e.pointerId !== lp.id) return;
      const { x, y } = lp; endLong();
      if (e.type !== 'pointerup' || e.pointerType !== 'touch') return;
      const now = performance.now();
      if (lastTap && now - lastTap.at < DBL_MS && Math.hypot(x - lastTap.x, y - lastTap.y) < 28) {
        lastTap = null;
        const t = at(x, y);
        if (t) t.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, cancelable: true, clientX: x, clientY: y, detail: 2 }));
      } else lastTap = { at: now, x, y };
    };
    window.addEventListener('pointerup', up, true); window.addEventListener('pointercancel', up, true);
    // (a browser's own long press and double tap, on the phones that have them: one each, the ones above)
    window.addEventListener('contextmenu', (e) => { if (e.isTrusted && on) { e.preventDefault(); e.stopPropagation(); } }, true);
    window.addEventListener('dblclick', (e) => { if (e.isTrusted && on) e.stopPropagation(); }, true);
    window.addEventListener('click', (e) => { if (longDone) { longDone = false; e.stopPropagation(); e.preventDefault(); } }, true); // (a long press isn't a tap as well)
  }

  // an item carried to the top or the bottom of what scrolls: it scrolls
  let edge: { x: number; y: number } | null = null;
  function scroller(t: Element | null) { for (let e = t; e; e = e.parentElement) if (e.scrollHeight > e.clientHeight + 1 && /auto|scroll/.test(getComputedStyle(e).overflowY)) return e; return document.getElementById('fieldInv'); }
  function edgeTick() {
    if (!edge) return;
    const box = scroller(at(edge.x, edge.y));
    if (box) { const r = box.getBoundingClientRect(), top = Math.max(r.top, 0), bot = Math.min(r.bottom, innerHeight); if (edge.y < top + EDGE) box.scrollTop -= EDGE_SPEED; else if (edge.y > bot - EDGE) box.scrollTop += EDGE_SPEED; }
    requestAnimationFrame(edgeTick);
  }

  // ------------------------------------------------------------- the phone's own keyboard
  function keyboard() {
    const vv = window.visualViewport;
    if (vv) { const set = () => document.documentElement.style.setProperty('--kb', Math.max(0, Math.round(innerHeight - vv.height - vv.offsetTop)) + 'px'); vv.addEventListener('resize', set); vv.addEventListener('scroll', set); }
    document.addEventListener('focusin', (e) => {
      if (!on || !(e.target instanceof HTMLInputElement) || !/^(text|search|email|password|url|tel)$/.test(e.target.type)) return;
      const el = e.target; setTimeout(() => { if (document.activeElement === el) el.scrollIntoView({ block: 'center', inline: 'nearest' }); }, 320); // (once the keyboard's up)
    });
    // the chat, closed by the phone's own "done" or a tap elsewhere: there's no Esc to press, and no controls to play on with till it's shut
    const chat = document.getElementById('chatInput') as HTMLInputElement;
    chat.addEventListener('blur', () => { if (on && G.Game.chatOpen) setTimeout(() => { if (G.Game.chatOpen && document.activeElement !== chat) G.Game.closeChat(); }, 120); });
  }

  function init() {
    const b = ([t, n]: [string, string]) => `<button class="tb tb-${t}" data-t="${t}">${n}</button>`;
    uiEl = document.createElement('div'); uiEl.id = 'touchUi'; uiEl.className = 'ui hidden';
    uiEl.innerHTML = `<div id="touchStick"><i></i></div><div class="t-top">${TOP.map(b).join('')}</div>${MAIN.map(b).join('')}<div id="touchMore" class="hidden">${MORE.map(b).join('')}</div>`;
    document.body.appendChild(uiEl);
    moreEl = uiEl.querySelector('#touchMore')!; stickEl = uiEl.querySelector('#touchStick')!; knobEl = stickEl.querySelector('i')!;
    uiEl.querySelectorAll<HTMLElement>('[data-t]').forEach((e) => { btn[e.dataset.t!] = e; });
    uiEl.addEventListener('pointerdown', onDown);
    for (const ev of ['pointerup', 'pointercancel']) window.addEventListener(ev, onUp as EventListener);
    window.addEventListener('pointermove', onMove);
    window.addEventListener('blur', () => { if (on && wasPlay) releaseAll(); });
    // the chat's opened on the click: a phone only brings its keyboard up for a focus inside a real tap
    // Fullscreen, on the click (the browser only allows it inside a real tap); not offered where there's none to be had (iPhones)
    const fsBtns = [btn.fs, ...document.querySelectorAll<HTMLElement>('[data-fs]')];
    const root = document.documentElement as HTMLElement & { webkitRequestFullscreen?: () => void }, d = document as Document & { webkitFullscreenElement?: Element; webkitExitFullscreen?: () => void };
    const can = !!(root.requestFullscreen || root.webkitRequestFullscreen), isFs = () => !!(document.fullscreenElement || d.webkitFullscreenElement);
    const fsLabel = () => { btn.fs.textContent = isFs() ? 'Exit' : 'Full'; document.querySelectorAll<HTMLElement>('[data-fs]').forEach((e) => { e.textContent = isFs() ? 'Exit fullscreen' : 'Fullscreen'; }); };
    const toggleFs = () => {
      if (isFs()) { if (document.exitFullscreen) document.exitFullscreen().catch(() => {}); else if (d.webkitExitFullscreen) d.webkitExitFullscreen(); return; }
      if (root.requestFullscreen) root.requestFullscreen({ navigationUI: 'hide' }).catch(() => G.HUD.toast('', "This browser wouldn't go fullscreen", 2)); else if (root.webkitRequestFullscreen) root.webkitRequestFullscreen();
    };
    for (const e of fsBtns) { if (can) e.addEventListener('click', toggleFs); else e.classList.add('hidden'); }
    for (const ev of ['fullscreenchange', 'webkitfullscreenchange']) document.addEventListener(ev, fsLabel);
    btn.chat.addEventListener('click', () => { S().tap('Enter'); (document.getElementById('chatInput') as HTMLInputElement).focus(); });

    closeEl = document.createElement('button'); closeEl.id = 'touchClose'; closeEl.className = 'ui hidden'; closeEl.textContent = '×'; closeEl.setAttribute('aria-label', 'Close');
    closeEl.addEventListener('click', () => S().tap('Escape'));
    document.body.appendChild(closeEl);
    tipEl = document.createElement('div'); tipEl.id = 'touchTip'; tipEl.className = 'route-tip ui hidden'; document.body.appendChild(tipEl);
    turnEl = document.createElement('button'); turnEl.id = 'touchTurn'; turnEl.className = 'ui hidden'; turnEl.innerHTML = 'Turn your phone sideways for a wider view <b>×</b>';
    turnEl.addEventListener('click', () => { turnGone = true; turnEl.classList.add('hidden'); });
    document.body.appendChild(turnEl);

    gestures(); keyboard();
    window.addEventListener('pointerdown', (e) => {
      if (!e.isTrusted) return;
      if (e.pointerType === 'touch' || e.pointerType === 'pen') setOn(true);
      else if (e.pointerType === 'mouse' && on) setOn(false);
    }, true);
    window.addEventListener('pointermove', (e) => { if (e.isTrusted && on && e.pointerType === 'mouse' && Math.abs(e.movementX) + Math.abs(e.movementY) > 4) setOn(false); }, true);
    window.addEventListener('keydown', (e) => { if (e.isTrusted && on && e.code && !(e.target instanceof HTMLInputElement)) setOn(false); }, true); // (a phone's own keyboard: into a box, or no code at all)
    document.addEventListener('gesturestart', (e) => { if (on) e.preventDefault(); }, { passive: false }); // (Safari's pinch: the page isn't to zoom under the controls)
    setOn(PHONE);
    if (PHONE) G.InvUI.scaleUI();
  }

  return {
    init, update, setOn,
    active: () => on,
    // a key prompt, in the on-screen buttons' names while touch is what's being used
    text(html: string) { for (const [re, to] of SUBS) html = html.replace(re, to); return html; },
    // an item being carried in the inventory, for the scrolling
    dragAt(x: number, y: number) { const was = edge; edge = { x, y }; if (!was) requestAnimationFrame(edgeTick); },
    dragEnd() { edge = null; },
  };
})();
G.Touch = G_Touch;
interface GameModules { Touch: typeof G_Touch; }
