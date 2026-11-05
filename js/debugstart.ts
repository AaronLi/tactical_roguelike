'use strict';
// Debug start: open the game with a URL that goes straight to where you want to look, past the menu, the route map, the
// sidearm picker and the helicopter. For testing by hand, and for tools driving the game (the browser checks agents run).
//   ?play                 a solo level (the first route option); with a value, that kind of place: ?play=warehouse
//                         (a theme's name, or part of it, or its index in G.THEMES: js/data.ts)
//   ?level=N              the level number (harder suspects, more of them: as the run would have it at N)
//   ?gun=<weapon id>      your primary, its factory build; ?parts=slot:partId,slot:partId changes parts on it
//                         (?gun=m4&parts=optic:op.bc.0,tacL:tac.bc.0)
//   ?side=<weapon id>     your sidearm (the P9 otherwise)
//   ?nofoes               nobody in the level; ?stronghold makes it one (js/route.ts)
//   ?hangar               the hangar between levels instead of a level (the shop, the gunsmith, the range)
// It plays as if the mouse were captured (no click-to-play screen). When it's there, window.__debugReady is true and
// G.DebugStart.ready resolves: scripts wait on that. Add ?mute to keep it quiet.
const G_DebugStart = (() => {
  const q = new URLSearchParams(location.search);
  const sleep = (s: number) => new Promise<void>((r) => setTimeout(r, s * 1000));
  const until = async (f: () => unknown, max = 60) => { const t0 = performance.now(); while (!f() && performance.now() - t0 < max * 1000) await sleep(0.1); return !!f(); };
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
  }
  function captured() {
    const g = G.Game;
    Object.defineProperty(g, 'locked', { get: () => true, set: () => {}, configurable: true });
    for (const id of ['pause', 'clickToPlay']) { const e = g.$(id); if (e) e.classList.add('hidden'); }
  }

  async function run() {
    const th = themeOf(q.get('play')), lvl = q.has('level') ? Math.max(1, +q.get('level')! || 1) : null;
    G.Game.solo(); await sleep(0.8);
    const SV = G.Server;
    if (q.has('hangar')) {
      SV.startRun();
      await until(() => G.Game.phase === 'route');
      arm();
      SV.overBlack(() => SV.toShop());
      await until(() => G.Game.hub && G.Me.pos);
    } else {
      // the level the route would build: its place and number set as it starts (js/server.ts startLevel)
      const start = SV.startLevel;
      SV.startLevel = function (this: typeof SV) {
        SV.startLevel = start;
        if (th != null) this.theme = th;
        if (lvl != null) this.level = lvl;
        if (q.has('stronghold') && this.routeMap && this.route) { const n = this.routeMap.nodes.get(this.route.path[this.route.path.length - 1]); if (n) n.stronghold = true; }
        return start.call(this);
      };
      SV.startRun();
      await until(() => G.Game.phase === 'route' && G.Game.routeMap);
      arm();
      const g0 = G.Game;
      g0.pickRoute(G.Route.options(g0.routeMap!, g0.routeSt!.path[g0.routeSt!.path.length - 1])[0]);
      await until(() => G.Game.phase === 'level' && G.Me.pos && G.Game.map);
      if (q.get('gun')) arm(); // (the level's kit is dealt as it starts: the gun again on top of it)
      // out of the helicopter: the flight skipped, then out of the seat (js/landing.ts interact: F held long enough)
      const L = G.Landing;
      if (L && G.Me.seat != null) {
        for (let i = 0; i < 2 && G.Me.seat != null; i++) { (G.Me as any).fLatch = false; L.interact(G.Me, 10, true); await sleep(0.2); }
      }
      if (q.has('nofoes')) SV.enemies.clear();
    }
    captured();
    (window as any).__debugReady = true;
    say(`ready: ${G.Game.hub ? 'the hangar' : `level ${SV.level}, ${(G.THEMES as { name: string }[])[SV.theme as number]?.name || '?'}`}`);
    done();
  }
  if (q.has('play') || q.has('hangar')) window.addEventListener('load', () => setTimeout(() => { run().catch((e) => console.error('[debug start]', e)); }, 300));
  return { run, ready };
})();
G.DebugStart = G_DebugStart;

interface GameModules { DebugStart: typeof G_DebugStart; }
