'use strict';
// Debug start: open the game with a URL that goes straight to where you want to look, past the menu, the route map, the
// sidearm picker and the helicopter. For testing by hand, and for tools driving the game (the browser checks agents run).
//   ?play                 a solo level (the first route option); with a value, that kind of place: ?play=warehouse
//                         (a theme's name, or part of it, or its index in G.THEMES: js/data.ts)
//   ?level=N              the level number (harder suspects, more of them: as the run would have it at N)
//   ?gun=<weapon id>      your primary, its factory build; ?parts=slot:partId,slot:partId changes parts on it
//                         (?gun=m4&parts=optic:op.bc.0,tacL:tac.bc.0)
//   ?side=<weapon id>     your sidearm (the P9 otherwise)
//   ?gear=<id>,<id>       gear put on you (js/gear.ts ids): worn, or fitted to what it goes on (a helmet, a carrier, a belt: one's
//                         put on if you've none, and whatever's in the way taken off): ?gear=n.pano for the panoramic night vision
//                         on a high-cut helmet; ?nvg flips night vision down to start with
//   ?leader               a leader in the level for sure (one is at random from level 2: js/server.ts spawnEnemies)
//   ?nofoes               nobody in the level; ?stronghold makes it one (js/route.ts); ?night makes it a night level
//                         (the lights out: js/level.ts nightify)
//   ?hangar               the hangar between levels instead of a level (the shop, the gunsmith, the range)
//   ?tick                 stepped by a timer, not animation frames: it keeps running in a window that isn't shown (scripts, agents)
// It plays as if the mouse were captured (no click-to-play screen). When it's there, window.__debugReady is true and
// G.DebugStart.ready resolves: scripts wait on that. Add ?mute to keep it quiet.
const G_DebugStart = (() => {
  const q = new URLSearchParams(location.search);
  const sleep = (s: number) => new Promise<void>((r) => setTimeout(r, s * 1000));
  const until = async (f: () => unknown, max = 60) => { const t0 = performance.now(); while (!f() && performance.now() - t0 < max * 1000) await sleep(0.1); return !!f(); };
  // ?tick: the game stepped by a timer instead of animation frames (a browser hands a page no frames while its window isn't
  // shown: a hidden pane, a tab driven by a script, and the game would stand still). Set before the game's loop first asks for one.
  if (q.has('tick')) {
    const ch = new MessageChannel(); let cbs: FrameRequestCallback[] = [];
    ch.port1.onmessage = () => { const c = cbs, t = performance.now(); cbs = []; for (const f of c) f(t); };
    window.requestAnimationFrame = (f: FrameRequestCallback) => { cbs.push(f); setTimeout(() => ch.port2.postMessage(0), 16); return 1; };
  }
  let done: () => void = () => {};
  const ready = new Promise<void>((r) => { done = r; });
  const say = (m: string) => console.log('[debug start] ' + m);

  function themeOf(v: string | null): number | null {
    if (v == null || v === '') return null;
    if (/^\d+$/.test(v)) return +v;
    const k = v.toLowerCase(), i = (G.THEMES as { name: string }[]).findIndex((t) => t.name.toLowerCase().includes(k));
    if (i < 0) say(`no place called "${v}": ${(G.THEMES as { name: string }[]).map((t) => t.name).join(', ')}`);
    return i < 0 ? null : i;
  }
  // the build: the gun's factory build with ?parts changed on it
  function buildOf(id: string) {
    const b: Record<string, string> = Object.assign({}, G.Gunsmith.defaultBuild(id));
    for (const kv of (q.get('parts') || '').split(',').filter(Boolean)) {
      const [slot, pid] = kv.split(':');
      if (!slot) continue;
      if (!pid || pid === 'none') delete b[slot]; else b[slot] = pid;
    }
    return b;
  }
  function arm() {
    const side = q.get('side'), gun = q.get('gun'), Me = G.Me;
    if (side && G.WEAPONS[side]) Me.setSidearm(side);
    Me.sidearmChosen = true; // (no picker)
    if (gun) {
      if (!G.WEAPONS[gun]) { say(`no weapon "${gun}"`); return; }
      const w = Me.makeWeapon(gun, buildOf(gun) as any);
      Me.weapons[w.def.slot] = w;
      say(`${w.def.name}: ${JSON.stringify(w.def.build || {})}`);
    }
    for (const id of (q.get('gear') || '').split(',').filter(Boolean)) {
      const Gr = G.Gear, d = Gr.DEFS[id];
      if (!d) { say(`no gear "${id}"`); continue; }
      const it = Gr.gearItem(id), on = Gr.MOUNTS[d.kind];
      if (on) {
        if (!Me.kit[on]) Me.kit[on] = Gr.gearItem(on === 'helmet' ? 'h.fast' : on === 'carrier' ? 'c.patrol' : 'b.battle');
        const h = Me.kit[on], c = Gr.clash(h, d.kind, it);
        if (c) h[c.k] = null;
        h[d.kind] = it;
      } else Me.kit[d.kind] = it;
      if (d.kind === 'nvg' && q.has('nvg')) it.dn = true;
      say(`wearing ${d.name}`);
    }
  }
  // In the level at once, playable without a click (a script driving the page has no mouse to capture): taken as captured till
  // someone really clicks. Then the first click captures the mouse (and isn't a shot), and from then on it's the real state
  // (Esc lets it go and pauses, as ever).
  function captured() {
    const g = G.Game, cv = G.R.renderer.domElement;
    let real = false;
    Object.defineProperty(g, 'locked', { get: () => (real ? document.pointerLockElement === cv : true), set: () => {}, configurable: true });
    document.addEventListener('pointerlockchange', () => { if (document.pointerLockElement === cv) real = true; });
    window.addEventListener('mousedown', (e) => {
      if (g.phase !== 'level' || document.pointerLockElement === cv || (e.target !== cv && e.target !== document.body)) return;
      if (real) return; // (once captured for real, the game's own click-to-play does it)
      e.stopImmediatePropagation(); e.preventDefault(); g.lock();
    }, true);
    for (const id of ['pause', 'clickToPlay']) { const e = g.$(id); if (e) e.classList.add('hidden'); }
  }

  async function run() {
    const th = themeOf(q.get('play')), lvl = q.has('level') ? Math.max(1, +q.get('level')! || 1) : null;
    G.Game.solo(); await sleep(0.8);
    // (the host's simulation is in its own thread, js/serverlink.ts: what's wanted of it is asked, as the lobby and the menus ask)
    if (q.has('hangar')) {
      G.Net.toHost({ t: 'startRun' });
      await until(() => G.Game.phase === 'route');
      arm();
      G.Net.toHost({ t: 'toShop' });
      await until(() => G.Game.hub && G.Me.pos);
    } else {
      // the level the route would build: its place and number set as it starts (js/server.ts startLevel: dbg)
      G.Net.toHost({ t: 'startRun', dbg: { th: th == null ? undefined : th, lvl: lvl == null ? undefined : lvl, leader: q.has('leader'), stronghold: q.has('stronghold'), night: q.has('night') } });
      await until(() => G.Game.phase === 'route' && G.Game.routeMap);
      arm();
      const g0 = G.Game;
      g0.pickRoute(G.Route.options(g0.routeMap!, g0.routeSt!.path[g0.routeSt!.path.length - 1])[0]);
      await until(() => G.Game.phase === 'level' && G.Me.pos && G.Game.map);
      if (q.get('gun') || q.get('gear')) arm(); // (the level's kit is dealt as it starts: the gun and gear again on top of it)
      // out of the helicopter: the flight skipped, then out of the seat (js/landing.ts interact: F held long enough)
      const L = G.Landing;
      // (until out: a slow level, shaders still compiling, may take a while to touch down, and the seat can't be left before it has)
      if (L && G.Me.seat != null) {
        const t0 = performance.now();
        while (G.Me.seat != null && performance.now() - t0 < 15000) { (G.Me as any).fLatch = false; L.interact(G.Me, 10, true); await sleep(0.3); }
        if (G.Me.seat != null) say('still in the helicopter after 15 s');
      }
      await until(() => !G.Game.$('veil').classList.contains('on'), 15); // (and the loading screen gone)
      if (q.has('nofoes')) { G.Net.toHost({ t: 'noFoes' }); await until(() => ![...G.Views.enemies.values()].some((e) => e.alive), 5); }
    }
    captured();
    (window as any).__debugReady = true;
    say(`ready: ${G.Game.hub ? 'the hangar' : `level ${G.Game.level}, ${(G.Game.map && G.Game.map.theme && G.Game.map.theme.name) || '?'}`}`);
    done();
  }
  if (q.has('play') || q.has('hangar')) window.addEventListener('load', () => setTimeout(() => { run().catch((e) => console.error('[debug start]', e)); }, 300));
  return { run, ready };
})();
G.DebugStart = G_DebugStart;

interface GameModules { DebugStart: typeof G_DebugStart; }
