'use strict';
// A demo reel: open the game with ?demo and it plays itself. A solo level with nobody else in it, and the main
// weapon archetypes one after another: drawn, fired (and cycled), a partial reload, run dry, a reload from
// empty (the action after it), the magazine checked and a chamber check held. Captions say what's showing.
G.Demo = (() => {
  // the archetypes: [weapon, what it is, how it fires]
  const REEL = [
    ['m4', 'AR-15 carbine: charging handle, bolt catch', 'auto'],
    ['ak', 'AK: side charging handle, racked from empty', 'auto'],
    ['mp5', 'MP5: HK cocking tube', 'auto'],
    ['aug', 'AUG: bullpup, handle riding the bolt', 'semi'],
    ['g19', 'Glock 19: pistol slide, slide stop', 'semi'],
    ['thompson', 'Thompson: open bolt, knob on top', 'auto'],
    ['r700', 'R700: bolt-action, worked by hand', 'bolt'],
    ['pump', '870: pump shotgun, shell by shell', 'semi'],
    ['m249', 'M249: belt-fed', 'auto'],
    ['rev', 'Revolver: swing-out cylinder', 'semi'],
    ['dbl', 'Double barrel: break-action', 'semi'],
  ];
  // timed on the game's own clock, and stepped from inside its frames (G.Me.update, hooked in run()): each wait
  // ends on the frame its time comes, so a slow or throttled tab slows the reel with it rather than skipping
  let clock = 0;
  const waiters = [];
  const wait = (s) => new Promise((r) => waiters.push({ t: clock + s, r }));
  const until = async (f, max = 15) => { const t0 = clock; while (!f() && clock - t0 < max) await wait(0); };
  function tick(dt) {
    clock += dt;
    for (let i = waiters.length - 1; i >= 0; i--) if (waiters[i].t <= clock) { waiters[i].r(); waiters.splice(i, 1); }
  }
  // (before the level, while there are no frames to step it: real time)
  const sleep = (s) => new Promise((r) => setTimeout(r, s * 1000));
  const untilReal = async (f) => { while (!f()) await sleep(0.1); };
  let cap = null, pocket = null;
  function caption(title, step) {
    if (!cap) {
      cap = document.createElement('div');
      cap.style.cssText = 'position:fixed;left:50%;top:7%;transform:translateX(-50%);z-index:50;text-align:center;font:600 22px system-ui,sans-serif;color:#fff;text-shadow:0 2px 6px #000;pointer-events:none';
      document.body.appendChild(cap);
    }
    cap.innerHTML = `${title}<div style="font-size:16px;font-weight:500;opacity:.85;margin-top:4px">${step}</div>`;
  }
  const me = () => G.Me;
  // the trigger: held (or let go)
  function trigger(on) { const m = me(); m.mouse.l = on; if (on) m.pressBuf = 0.15; }
  async function tap(n, gap) { for (let i = 0; i < n; i++) { trigger(true); await wait(0.06); trigger(false); await wait(gap); } }
  async function fire(how, n = 3) {
    if (how === 'auto') { trigger(true); await wait(0.55); trigger(false); await wait(0.4); }
    else if (how === 'bolt') for (let i = 0; i < 2; i++) { trigger(true); await wait(0.7); trigger(false); /* (letting go works the bolt) */ await wait(1.3); }
    else await tap(n, 0.35);
  }
  // rounds for it: the gun's magazines (or a box of its shells) in a big pocket of its own
  function stock(w) {
    const m = me();
    if (!pocket) { pocket = { id: 99999, w: 14, h: 14, accept: null, label: 'Demo', items: [] }; m.pockets.unshift(pocket); }
    pocket.items.length = 0;
    for (let i = 0; i < 3; i++) G.Gear.stow(m, G.Gear.ammoItem(w.def), [pocket]);
  }
  async function reload() { const m = me(); m.startReload(); await wait(0.1); await until(() => !m.reloading && !m.act); await wait(0.4); }
  async function show([id, title, how]) {
    const m = me();
    m.weapons.p = m.makeWeapon(id); m.slot = null; m.swap('p');
    const w = m.weapons.p;
    if ((w.def.modes || [w.def.mode]).includes('auto')) w.fm = 'auto';
    stock(w);
    caption(title, 'Drawn'); await wait(1.0);
    caption(title, how === 'bolt' ? 'Fired (hold the trigger to stay on target, let go to work the bolt)' : 'Fired'); await fire(how);
    caption(title, 'Partial reload: no action needed'); await reload();
    caption(title, 'Run dry'); w.mag = Math.min(w.mag, 1); w.tube = (w.tube || []).slice(-w.mag); await fire(how === 'auto' ? 'semi' : how, 3); await wait(0.3);
    caption(title, G.VMAnim.kinds(w.def).action ? 'Reload from empty, then the action' : 'Reload from empty'); await reload();
    if (G.VMAnim.canMagCheck(G.R.vm)) { caption(title, 'Magazine check (hold R)'); m.keys.KeyR = true; m.rHeldAt = performance.now() - 1000; await wait(2.0); m.keys.KeyR = false; m.rHeldAt = 0; await until(() => !m.magChk); await wait(0.3); }
    caption(title, 'Inspect, chamber check held (hold I)'); m.keys.KeyI = true; m.inspect(); await wait(m.inspectDur * 0.7 + 1.6); m.keys.KeyI = false; await until(() => !(m.inspectT > 0)); await wait(0.5);
  }
  // stand where there's the longest clear line of sight on the ground floor (open floor the level knows of), and
  // face down it, so the rounds fly a way before they hit
  function face() {
    const m = me(), map = G.Game.map, wd = map.world;
    const ray = (x, z, yaw, y) => G.World.raycast(wd, x, y, z, -Math.sin(yaw), 0, -Math.cos(yaw), 60).t;
    const spots = [[m.pos.x, m.pos.z], ...(map.enemySpots || []).filter((p) => !p[2])];
    let best = -1, at = null;
    for (const [x, z] of spots) for (let i = 0; i < 32; i++) {
      const yaw = (i / 32) * Math.PI * 2, t = Math.min(ray(x, z, yaw, 1.6), ray(x, z, yaw, 0.9)); // (clear at the eye and the chest: not up a stair)
      if (t > best) { best = t; at = [x, z, yaw]; }
    }
    m.pos.x = at[0]; m.pos.z = at[1]; m.yaw = at[2]; m.pitch = -0.02;
    if (m.vel) m.vel.set(0, 0, 0);
    return best;
  }
  async function run() {
    const up = G.Me.update; G.Me.update = function (dt) { const r = up.call(this, dt); tick(dt); return r; };
    G.Game.solo(); await sleep(0.8);
    G.Server.startRun();
    await untilReal(() => G.Game.phase === 'route' && G.Game.routeMap);
    const g0 = G.Game; g0.pickRoute(G.Route.options(g0.routeMap, g0.routeSt.path[g0.routeSt.path.length - 1])[0]);
    await untilReal(() => G.Game.phase === 'level' && G.Me.kit);
    await wait(1.0);
    // nobody else in it, and the game playing as if the mouse were captured
    G.Server.enemies.clear();
    const g = G.Game; let lk = true; Object.defineProperty(g, 'locked', { get: () => lk, set: () => {}, configurable: true });
    for (const el of ['pause', 'clickToPlay']) { const e = g.$(el); if (e) e.classList.add('hidden'); }
    face();
    for (;;) for (const r of REEL) { G.Server.enemies.clear(); await show(r); }
  }
  if (new URLSearchParams(location.search).has('demo')) window.addEventListener('load', () => setTimeout(run, 300));
  return { REEL, run };
})();
