'use strict';
// The sidearm tree: what you can start a run with. Everyone starts with the P9 in the middle, and three paths run out from it, each a way of
// fighting: full auto (volume of fire), heavy calibre (one round doing the work) and the modern classics (being where they aren't looking,
// and hitting what you aim at). Each gun on a path is earned by doing what that path's about with the gun before it, and it's yours for
// good: kept on this machine (G.U.store), between runs, whatever squad you're in. js/game.js sidearmPick draws it.
// A kill's what it was as your rounds did it: js/player.js hitEnemy keeps what they did to someone on them (ev.mine) and the host's word
// that they're down (js/game.js credit) brings it here. Only a gun you've earned counts: one that turned up in a case has its own path to come.
// Each asks for more than a level has suspects (8 to 13, the act's last aside), so every gun takes several levels of play.
G.Arsenal = (() => {
  // id, what it's reached from, which path, how far out; and what it takes: stat, how many, of what
  const NODES = [
    { id: 'p9', ring: 0 },
    { id: 'tx22', from: 'p9', path: 'auto', ring: 1, stat: 'tap', n: 15, what: 'double-tap kills', how: 'Two hits on them inside half a second, and they go down.' },
    { id: 'g18', from: 'tx22', path: 'auto', ring: 2, stat: 'burst', n: 15, what: 'five-hit bursts', how: 'Five hits on one suspect inside a second, once a suspect. They needn\'t go down.' },
    { id: 'mac10', from: 'g18', path: 'auto', ring: 3, stat: 'multi', n: 10, what: 'double kills', how: 'Two suspects down inside three seconds.' },
    { id: 'derringer', from: 'p9', path: 'heavy', ring: 1, stat: 'close', n: 15, what: 'kills within 5 m', how: 'Get close enough that it can\'t go wrong.' },
    { id: 'rev', from: 'derringer', path: 'heavy', ring: 2, stat: 'one', n: 16, what: 'one-round kills', how: 'One round fired at them, and they\'re done.' },
    { id: 'deagle', from: 'rev', path: 'heavy', ring: 3, stat: 'armed', n: 15, what: 'kills on armoured suspects', how: "A vest or a helmet: it doesn't save them. Pick your spot, or hit them hard enough." },
    { id: 'thor', from: 'deagle', path: 'heavy', ring: 4, stat: 'wall', n: 15, what: 'wall-bang kills', how: 'Through a wall, a door or whatever they thought was cover.' },
    { id: 'm1911', from: 'p9', path: 'modern', ring: 1, stat: 'hs', n: 15, what: 'headshot kills', how: 'Put it where it counts.' },
    { id: 'usp', from: 'm1911', path: 'modern', ring: 2, stat: 'sur', n: 15, what: 'kills on unaware suspects', how: 'Down a suspect before they react. If they have seen you or heard gunfire, it does not count.' },
    { id: 'fiveseven', from: 'usp', path: 'modern', ring: 3, stat: 'far', n: 15, what: 'kills past 20 m', how: 'A pistol, at a rifle\'s distance.' },
  ];
  const PATHS = { auto: { name: 'Full auto', a: -90, len: 3 }, heavy: { name: 'Heavy calibre', a: 30, len: 4 }, modern: { name: 'Modern classics', a: 150, len: 3 } };
  const RINGS = [0, 250, 470, 690, 910], BY = new Map(NODES.map((q) => [q.id, q])), TAP = 500, BURST = 5, BURST_MS = 1000, MULTI = 3000, CLOSE = 5, FAR = 20;
  let save = null;
  const data = () => { if (!save) { const s = G.U.store.get('arsenal', null); save = s && s.got && s.n ? s : { got: [], n: {} }; } return save; };
  const keep = () => G.U.store.set('arsenal', data());
  const has = (id) => BY.has(id);
  const open = (id) => id === 'p9' || (has(id) && data().got.includes(id));
  const count = (id, stat) => (data().n[id] && data().n[id][stat]) || 0;
  const name = (id) => (G.WEAPONS[id] ? G.WEAPONS[id].name : id);
  // where it goes on the map: [x, y] from the P9, in pixels at full size
  const along = (path, r) => { const a = (PATHS[path].a * Math.PI) / 180; return [Math.cos(a) * r, Math.sin(a) * r]; };
  const at = (q) => (q.ring ? along(q.path, RINGS[q.ring]) : [0, 0]);
  // what's next from a gun: how far along each it's got
  const left = (q) => Math.min(q.n, count(q.from, q.stat));
  // one more of something, with that gun: what it's for, and whatever that's earned
  function tally(id, stat) {
    if (!open(id)) return;
    const d = data(), ns = d.n[id] || (d.n[id] = {});
    ns[stat] = (ns[stat] || 0) + 1;
    for (const q of NODES) {
      if (q.from !== id || q.stat !== stat || open(q.id)) continue;
      if (ns[stat] >= q.n) {
        d.got.push(q.id);
        G.HUD.toast('NEW SIDEARM', `${name(q.id)}: yours from your next run`, 3.5);
        if (G.Audio.click) G.Audio.click();
      } else G.HUD.feed(`<span class="cr">${G.U.esc(name(id))}: ${ns[stat]}/${q.n} ${G.U.esc(q.what)}</span>`);
    }
    keep();
  }
  // a kill of yours (m: the host's word of it; not a civilian or someone who'd given up: js/game.js credit)
  let lastKill = new Map();
  function kill(m) {
    const ev = G.Views.enemies.get(m.e), k = ev && ev.mine;
    if (!k || k.done) return;
    k.done = true;
    const id = k.wid, ts = k.ts, n = ts.length, now = performance.now();
    const within = (hits, ms) => n >= hits && ts[n - 1] - ts[n - hits] <= ms;
    if (within(2, TAP)) tally(id, 'tap');
    if (lastKill.has(id) && now - lastKill.get(id) <= MULTI) { tally(id, 'multi'); lastKill.delete(id); } else lastKill.set(id, now); // (a pair's a pair: the next is the first of another)
    if (k.d <= CLOSE) tally(id, 'close');
    if (k.d >= FAR) tally(id, 'far');
    if (k.shots.size === 1) tally(id, 'one');
    if (G.Ballistics.suspectArmour(ev).some((a) => a.def.prot.length)) tally(id, 'armed'); // (no pistol goes through a vest: this is what a heavy one does about it)
    if (k.wall) tally(id, 'wall');
    if (m.h) tally(id, 'hs');
    if (m.sur) tally(id, 'sur');
  }
  // what a round of yours did to someone, for that
  function hit(ev, b) {
    let k = ev.mine;
    if (!k || k.wid !== b.def.id) k = ev.mine = { wid: b.def.id, ts: [], shots: new Set(), wall: false, d: 0 };
    const f = b.shot.f, p = ev.rig && ev.rig.root.position;
    k.ts.push(performance.now()); k.shots.add(b.shot.sid); k.wall = !!b.walled;
    if (!k.burst && k.ts.length >= BURST && k.ts[k.ts.length - 1] - k.ts[k.ts.length - BURST] <= BURST_MS) { k.burst = true; tally(k.wid, 'burst'); } // (the hits are the thing: down or not)
    k.d = p && f ? Math.hypot(p.x - f[0], p.z - f[2]) : 0;
  }
  return { NODES, PATHS, RINGS, BY, along, has, open, count, name, at, left, tally, hit, kill, get all() { return data(); } };
})();
