'use strict';
// The route map. Each act is ten deployments, left to right: nine columns of choices, then the boss. A
// node is an environment (one of G.THEMES); paths split and rejoin on the way and never cross. Picking the
// next node picks where you fight next. Generated from a seed, so every peer draws the same map; the host
// keeps where the squad is (route.path) and the votes.
const G_Route = (() => {
  const COLS = 10, ROWS = 7, WALKS = 4;
  // which column a level is in, and which act; the last level of each act is the boss
  interface RNode { id: number; c: number; r: number; th: number; next: number[]; prev: number[]; boss: boolean; stronghold: boolean; night: boolean }
  interface RMap { seed: number; act: number; cols: RNode[][]; nodes: Map<number, RNode> }
  interface RState { path: number[]; opts: number[]; votes?: Record<string, number>; colors?: Record<string, number>; mine?: number }
  const STRONGHOLD = 1 / 7; // the share of levels that are strongholds
  const NIGHT = 0.23; // and of those that can be, the share that are night levels (the lights out: js/level.ts nightify): about one level in five, all told
  // what clearing a stronghold pays on top of the usual (credits)
  const strongholdPay = (level: number) => 300 + 60 * level;
  const colOf = (level: number) => (level - 1) % COLS;
  const actOf = (level: number) => Math.floor((level - 1) / COLS) + 1;
  const isBoss = (level: number) => level % COLS === 0;

  // { seed, act, cols: [[node]], nodes: Map id -> node }; node { id, c, r, th, next: [ids], boss }
  function gen(seed: number, act: number): RMap {
    const r = G.U.rng(seed ^ (act * 0x9e3779b1)), nodes = new Map<number, RNode>(), edges: number[][] = [];
    const id = (c: number, row: number) => c * 10 + row;
    const node = (c: number, row: number): RNode => {
      const k = id(c, row);
      if (!nodes.has(k)) nodes.set(k, { id: k, c, r: row, th: 0, next: [], prev: [], boss: c === COLS - 1, stronghold: false, night: false });
      return nodes.get(k)!;
    };
    // would a link (c, a) -> (c + 1, b) cross one already drawn?
    const crosses = (c: number, a: number, b: number) => edges.some(([c2, a2, b2]) => c2 === c && ((a2 < a && b2 > b) || (a2 > a && b2 < b)));
    // one way in (the middle of the first column), fanning out to several rows, wandering on (now and then
    // meeting another path), and all of them coming together at the boss in the middle of the last
    const mid = (ROWS - 1) / 2, start = node(0, mid);
    // where each path goes first: one high, one low, the rest anywhere, all different
    const firsts = [Math.floor(r() * mid), mid + 1 + Math.floor(r() * mid)];
    const rest = G.U.shuffle(r, [...Array(ROWS).keys()].filter((x) => !firsts.includes(x)));
    while (firsts.length < WALKS) firsts.push(rest.pop()!);
    for (const first of firsts) {
      edges.push([0, start.r, first]);
      node(1, first);
      let row = first;
      for (let c = 1; c < COLS - 2; c++) {
        const opts = [-1, 0, 1].map((d) => row + d).filter((b) => b >= 0 && b < ROWS && !crosses(c, row, b));
        G.U.shuffle(r, opts);
        const nb = opts.length ? opts[0] : row;
        if (!edges.some((e) => e[0] === c && e[1] === row && e[2] === nb)) edges.push([c, row, nb]);
        node(c + 1, nb);
        row = nb;
      }
    }
    // every last-column node leads to the boss
    const boss = node(COLS - 1, mid);
    for (const n of nodes.values()) if (n.c === COLS - 2) edges.push([COLS - 2, n.r, boss.r]);
    for (const [c, a, b] of edges) { const f = nodes.get(id(c, a))!, t = nodes.get(id(c + 1, b))!; if (!f.next.includes(t.id)) { f.next.push(t.id); t.prev.push(f.id); } }
    // environments: no two in a row along a link where it can be helped, and each column a mix. (The starter, the
    // convenience store, is the first act's way in and nowhere else: the rest are drawn from the others, each from its
    // theme's `from`, the first level it can come up at: the Sandia Crest's after the third.)
    const all = G.THEMES.map((T, i) => i).filter((i) => !G.THEMES[i].starter), starter = G.THEMES.findIndex((T) => T.starter);
    const order = [...nodes.values()].sort((a, b) => a.c - b.c || a.r - b.r);
    for (const n of order) {
      const level = (act - 1) * COLS + n.c + 1, pool = all.filter((i) => !(G.THEMES[i].from! > level)), nT = pool.length;
      const avoid = new Set(n.prev.map((p) => nodes.get(p)!.th));
      for (const o of order) if (o.c === n.c && o !== n && o.r < n.r) avoid.add(o.th);
      let k0 = Math.floor(r() * nT);
      for (let k = 0; k < nT && avoid.has(pool[k0]); k++) k0 = (k0 + 1) % nT;
      n.th = n === start && act === 1 && starter >= 0 ? starter : pool[k0]; // the first act starts at the convenience store
    }
    // strongholds: about one level in seven is a suspects' stronghold (no civilians, a bigger crowd of suspects, better pay).
    // Never the first level, the convenience store or a boss. Drawn from a generator of its own, so the map's shape and
    // environments are as they'd be without them.
    const rs = G.U.rng(seed ^ (act * 0x2545f491) ^ 0x57c0);
    for (const n of order) if (rs() < STRONGHOLD && !n.boss && !(act === 1 && n.c === 0) && !G.THEMES[n.th].starter) n.stronghold = true;
    // night levels: about one in five, never the first act's way in (the corner store),
    // nor a place that's outdoors at night already (the festival: th.night) or a mountain top at sundown (the Crest). From
    // a generator of their own too, so nothing else on the map changes.
    const rn = G.U.rng(seed ^ (act * 0x6c8e9cf5) ^ 0x4e17);
    for (const n of order) { const T = G.THEMES[n.th]; if (rn() < NIGHT && !(act === 1 && n.c === 0) && !T.starter && !T.night && !T.rock) n.night = true; }
    const cols = [];
    for (let c = 0; c < COLS; c++) cols.push(order.filter((n) => n.c === c));
    return { seed, act, cols, nodes };
  }
  // where the squad can go next: from the node they're on, or the act's way in at its start
  function options(route: RMap, at: number | null | undefined) {
    if (at == null || !route.nodes.has(at)) return route.cols[0].map((n) => n.id);
    return route.nodes.get(at)!.next.slice();
  }

  // ------------------------------------------------------------------ the map screen
  const ICON: Record<string, string> = { // a glyph per environment
    Apartment: 'M-6 6V-2L0-7 6-2V6Z M-2 6V1H2V6', Warehouse: 'M-7 6V-3L0-7 7-3V6Z M-4 6V0H4V6 M-4 3H4',
    Bunker: 'M-7 5Q0-9 7 5Z M-3 5V1H3V5', Suburbs: 'M-7 6V0L-3.5-4 0 0V6Z M1 6V-2L4-5 7-2V6',
    'Research Lab': 'M-2-7H2 M-1-7V-2L-6 6H6L1-2V-7', Foundry: 'M-7 6V-1L-3-4V-1L1-4V-1L5-4V6Z M4-4V-8H6V-3',
    'Cold Storage': 'M0-7V7 M-6-3.5L6 3.5 M-6 3.5L6-3.5', 'Convenience Store': 'M-7 6V-2H7V6Z M-7-2L-5-6H5L7-2 M-4 6V1H0V6 M2 1H5V4H2Z',
    'Sandia Crest': 'M-7 6L-3-5 0 1 3-7 7 6Z M-4.5-1.5L-3-0.5-1.5-1.5',
  };
  // wider than the screen: the map scrolls sideways (js/game.ts keeps where you are in view)
  const STEP = 150, PADX = 80, PADY = 56, W = 2 * PADX + (COLS - 1) * STEP, H = 600;
  const pos = (n: RNode) => [PADX + n.c * STEP, PADY + n.r * (H - 2 * PADY) / (ROWS - 1)];
  // the map as SVG. st: { path: [ids visited this act], opts: [ids], votes: { playerId: nodeId }, colors: { playerId: color }, mine }
  function svg(route: RMap, st: RState) {
    const esc = G.U.esc, visited = new Set(st.path), last = st.path[st.path.length - 1];
    let lines = '', dots = '';
    for (const n of route.nodes.values()) {
      const [x1, y1] = pos(n);
      for (const t of n.next) {
        const m = route.nodes.get(t)!, [x2, y2] = pos(m);
        const walked = visited.has(n.id) && visited.has(m.id) && st.path.indexOf(m.id) === st.path.indexOf(n.id) + 1;
        const open = n.id === last && st.opts.includes(m.id);
        lines += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" class="rl${walked ? ' walked' : open ? ' open' : ''}"/>`;
      }
    }
    for (const n of route.nodes.values()) {
      const [x, y] = pos(n), th = G.THEMES[n.th], opt = st.opts.includes(n.id), here = n.id === last;
      const cls = `rn${opt ? ' opt' : ''}${visited.has(n.id) ? ' done' : ''}${here ? ' here' : ''}${n.boss ? ' boss' : ''}${st.mine === n.id ? ' mine' : ''}`;
      const rad = n.boss ? 30 : 21;
      dots += `<g class="${cls}" data-node="${n.id}" transform="translate(${x},${y})"><title>${esc(th.name)}${n.boss ? ' (boss)' : ''}${n.stronghold ? ` - STRONGHOLD: no civilians, about half as many suspects again, +¢${strongholdPay((route.act - 1) * COLS + n.c + 1)} for clearing it` : ''}${n.night ? ' - NIGHT: the lights are out but for the emergency lights; suspects can hardly see you in the dark, unless your weapon light gives you away' : ''}</title>`;
      dots += `<circle r="${rad}" style="--fill:${th.wall};--edge:${th.floor}"/>`;
      dots += n.boss ? `<path d="M-9 6H9 M-9 3L-10-7-4-2 0-9 4-2 10-7 9 3Z" class="ri" transform="scale(1.4)"/>`
        : `<path d="${ICON[th.name] || 'M-5-5H5V5H-5Z'}" class="ri" transform="scale(1.55)"/>`;
      // a stronghold wears a small red alert badge at its top right, with an exclamation mark
      if (n.stronghold) dots += `<g class="rsh" transform="translate(${rad * 0.72},${-rad * 0.72})"><circle r="8"/><path d="M0-4.5V1 M0 3.6V3.7"/></g>`;
      // a night level wears a crescent moon at its top left
      if (n.night) dots += `<g class="rnt" transform="translate(${-rad * 0.72},${-rad * 0.72})"><circle r="8"/><path d="M1.6-4.6A5 5 0 1 0 1.6 4.6 4 4 0 1 1 1.6-4.6Z"/></g>`;
      dots += n.boss ? `<text y="${rad + 15}" class="rt">THE KINGPIN</text><text y="${rad + 28}" class="rt sub">${esc(th.name)}</text>` : `<text y="${rad + 15}" class="rt">${esc(th.name)}</text>`;
      // who's voted for it
      const vs = Object.entries(st.votes || {}).filter(([, v]) => v === n.id);
      vs.forEach(([pid], i) => { dots += `<circle class="rv" r="5" cx="${-((vs.length - 1) * 6) + i * 12}" cy="${-rad - 9}" fill="${G.U.hex((st.colors || {})[pid] || 0xffffff)}"/>`; });
      dots += '</g>';
    }
    let cols = '';
    for (let c = 0; c < COLS; c++) cols += `<text x="${PADX + c * STEP}" y="18" class="rc">${c === COLS - 1 ? 'BOSS' : 'LEVEL ' + ((route.act - 1) * COLS + c + 1)}</text>`;
    return `<svg viewBox="0 0 ${W} ${H + 10}" class="route-svg">${cols}${lines}${dots}</svg>`;
  }
  return { COLS, strongholdPay, gen, options, colOf, actOf, isBoss, svg };
})();
G.Route = G_Route;

interface GameModules { Route: typeof G_Route; }
