'use strict';
// The sidearm tree: what you can start a run with. Everyone starts with the P9 in the middle, and three paths run out from it, each a way of
// fighting: full auto (volume of fire), heavy calibre (one round doing the work) and the modern classics (being where they aren't looking,
// and hitting what you aim at). Each gun on a path is earned by doing what that path's about with the gun before it, and it's yours for
// good: kept on this machine (G.U.store), between runs, whatever squad you're in. js/game.js sidearmPick draws it.
// A kill's what it was as your rounds did it: js/player.js hitEnemy keeps what they did to someone on them (ev.mine) and the host's word
// that they're down (js/game.js credit) brings it here. Only a gun you've earned counts: one that turned up in a case has its own path to come.
// Each asks for more than a level has suspects (8 to 13, the act's last aside), so every gun takes several levels of play.
G.Arsenal = (() => {
  // id, what it's reached from, which path, how far out (a: a branch off its path: its own angle and r, its distance out); and what it takes: stat, how many, of what
  // pro: mastering it, with it: what it takes, and the named build that earns you, to start with if you like (parts: on top of its own)
  const NODES = [
    { id: 'p9', ring: 0, pro: { name: 'Patrolman', stat: 'kills', n: 30, what: 'kills', parts: { tac: 'ptac.2', grip: 'gr.pistol.2' } } },
    { id: 'tx22', from: 'p9', path: 'auto', ring: 1, stat: 'tap', n: 15, what: 'double-tap kills', how: 'Two hits on them inside half a second, and they go down.',
      pro: { name: 'Hornet', stat: 'burst', n: 30, what: 'five-hit bursts', parts: { barrel: 'tx22.br.match', muzzle: 'mz.r22.comp', optic: 'op.pso.1' } } },
    { id: 'b92', from: 'tx22', path: 'auto', ring: 2, stat: 'burst', n: 15, what: 'five-hit bursts', how: "Five hits on one suspect inside a second, once a suspect. They needn't go down.",
      pro: { name: 'Tre Colpi', stat: 'trio', n: 25, what: 'burst kills', parts: { slide: 'b92.sl.comp', tac: 'ptac.1', grip: 'gr.pistol.0' } } },
    { id: 'g18', from: 'b92', path: 'auto', ring: 3, stat: 'trio', n: 15, what: 'burst kills', how: 'Three hits on them inside 0.35 s, and they go down.',
      pro: { name: 'Buzzsaw', stat: 'multi', n: 20, what: 'double kills', parts: { slide: 'g18.sl.comp', tac: 'ptac.1', stock: 'stk.pistol.0' } } },
    { id: 'mac10', from: 'g18', path: 'auto', ring: 4, stat: 'multi', n: 10, what: 'double kills', how: 'Two suspects down inside three seconds.',
      pro: { name: 'Street Sweeper', stat: 'kills', n: 50, what: 'kills', parts: { muzzle: 'mz.r45.can', stock: 'stk.smg.0', optic: 'op.pic.1' } } },
    { id: 'derringer', from: 'p9', path: 'heavy', ring: 1, stat: 'close', n: 15, what: 'kills within 5 m', how: "Get close enough that it can't go wrong.",
      pro: { name: 'Last Word', stat: 'close', n: 30, what: 'kills within 5 m', parts: { barrel: 'derringer.br.long', grip: 'gr.derringer.rubber' } } },
    { id: 'rev', from: 'derringer', path: 'heavy', ring: 2, stat: 'one', n: 16, what: 'one-round kills', how: "One round fired at them, and they're done.",
      pro: { name: 'Peacemaker', stat: 'one', n: 30, what: 'one-round kills', parts: { barrel: 'rev.br.long', loader: 'ld.0', optic: 'op.pso.0' } } },
    { id: 'judge', from: 'rev', path: 'heavy', ring: 3, a: 60, r: 600, stat: 'close', n: 15, what: 'kills within 5 m', how: 'In the room with them, where a cylinder of buckshot starts to look like the better idea.',
      pro: { name: 'Hanging Judge', stat: 'multi', n: 20, what: 'double kills', parts: { barrel: 'judge.br.long', loader: 'ld.1', optic: 'op.pso.5' } } },
    { id: 'deagle', from: 'rev', path: 'heavy', ring: 3, stat: 'armed', n: 15, what: 'kills on armoured suspects', how: "A vest or a helmet: it doesn't save them. Pick your spot, or hit them hard enough.",
      pro: { name: 'Sledgehammer', stat: 'armed', n: 25, what: 'kills on armoured suspects', parts: { slide: 'deagle.sl.comp', optic: 'op.pso.2', grip: 'gr.pistol.2' } } },
    { id: 'thor', from: 'deagle', path: 'heavy', ring: 4, stat: 'wall', n: 15, what: 'wall-bang kills', how: 'Through a wall, a door or whatever they thought was cover.',
      pro: { name: 'Mjolnir', stat: 'wall', n: 25, what: 'wall-bang kills', parts: { barrel: 'thor.br.long', optic: 'op.pic.1', grip: 'gr.ak.1' } } },
    { id: 'ppk', from: 'p9', path: 'modern', ring: 1, stat: 'sur', n: 15, what: 'kills on unaware suspects', how: 'Down a suspect before they react. If they have seen you or heard gunfire, it does not count.',
      pro: { name: 'Diplomat', stat: 'sur', n: 30, what: 'kills on unaware suspects', parts: { barrel: 'ppk.br.thr', muzzle: 'mz.rp.can', grip: 'gr.pistol.1' } } },
    { id: 'm1911', from: 'ppk', path: 'modern', ring: 2, stat: 'hs', n: 15, what: 'headshot kills', how: 'Put it where it counts.',
      pro: { name: 'Old Faithful', stat: 'hs', n: 30, what: 'headshot kills', parts: { barrel: 'm1911.br.match', optic: 'op.pso.0', grip: 'gr.pistol.1' } } },
    { id: 'usp', from: 'm1911', path: 'modern', ring: 3, stat: 'hsfar', n: 15, what: 'headshot kills past 10 m', how: 'A headshot, from further off than a pistol wants to be.',
      pro: { name: 'Whisper', stat: 'sur', n: 30, what: 'kills on unaware suspects', parts: { barrel: 'usp.br.thr', muzzle: 'mz.rp.can', tac: 'ptac.3' } } },
    { id: 'fiveseven', from: 'usp', path: 'modern', ring: 4, stat: 'far', n: 15, what: 'kills past 20 m', how: "A pistol, at a rifle's distance.",
      pro: { name: 'Long Reach', stat: 'far', n: 30, what: 'kills past 20 m', parts: { slide: 'fiveseven.sl.long', optic: 'op.pso.4', tac: 'ptac.1' } } },
  ];
  const PATHS = { auto: { name: 'Full auto', a: -90, len: 4 }, heavy: { name: 'Heavy calibre', a: 30, len: 4 }, modern: { name: 'Modern classics', a: 150, len: 4 } };
  const RINGS = [0, 250, 470, 690, 910], BY = new Map(NODES.map((q) => [q.id, q])), TAP = 500, BURST = 5, BURST_MS = 1000, TRIO_MS = 350, MULTI = 3000, CLOSE = 5, MID = 10, FAR = 20;
  let save = null;
  const data = () => { if (!save) { const s = G.U.store.get('arsenal', null); save = s && s.got && s.n ? s : { got: [], n: {} }; save.pro = save.pro || {}; save.on = save.on || {}; } return save; };
  const keep = () => G.U.store.set('arsenal', data());
  const has = (id) => BY.has(id);
  // pro: earned it? set to start with it? and the build itself
  const proGot = (id) => !!data().pro[id];
  const proOn = (id) => proGot(id) && !!data().on[id];
  const proSet = (id, on) => { if (proGot(id)) { data().on[id] = !!on; keep(); } };
  function build(id) { const q = BY.get(id), b = Object.assign(G.Gunsmith.defaultBuild(id), q && q.pro ? q.pro.parts : {}); G.Gunsmith.prune(id, b); return b; }
  const partNames = (id) => Object.values(BY.get(id).pro.parts).map((p) => G.Gunsmith.PARTS[p].name);
  const open = (id) => id === 'p9' || (has(id) && data().got.includes(id));
  const count = (id, stat) => (data().n[id] && data().n[id][stat]) || 0;
  const name = (id) => (G.WEAPONS[id] ? G.WEAPONS[id].name : id);
  // where it goes on the map: [x, y] from the P9, in pixels at full size
  const polar = (deg, r) => { const a = (deg * Math.PI) / 180; return [Math.cos(a) * r, Math.sin(a) * r]; };
  const along = (path, r) => polar(PATHS[path].a, r);
  const at = (q) => (q.a != null ? polar(q.a, q.r) : q.ring ? along(q.path, RINGS[q.ring]) : [0, 0]);
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
    const me = BY.get(id);
    if (me && me.pro && me.pro.stat === stat && !d.pro[id]) {
      if (ns[stat] >= me.pro.n) {
        d.pro[id] = 1;
        G.HUD.toast('PRO BUILD', `${name(id)} ${me.pro.name}: yours to start with`, 3.5);
      } else if (!NODES.some((q) => q.from === id && q.stat === stat && !open(q.id))) G.HUD.feed(`<span class="cr">${G.U.esc(me.pro.name)}: ${ns[stat]}/${me.pro.n} ${G.U.esc(me.pro.what)}</span>`);
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
    tally(id, 'kills');
    if (within(2, TAP)) tally(id, 'tap');
    if (within(3, TRIO_MS)) tally(id, 'trio');
    if (lastKill.has(id) && now - lastKill.get(id) <= MULTI) { tally(id, 'multi'); lastKill.delete(id); } else lastKill.set(id, now); // (a pair's a pair: the next is the first of another)
    if (k.d <= CLOSE) tally(id, 'close');
    if (k.d >= FAR) tally(id, 'far');
    if (k.shots.size === 1) tally(id, 'one');
    if (G.Ballistics.suspectArmour(ev).some((a) => a.def.prot.length)) tally(id, 'armed'); // (no pistol goes through a vest: this is what a heavy one does about it)
    if (k.wall) tally(id, 'wall');
    if (m.h) tally(id, 'hs');
    if (m.h && k.d >= MID) tally(id, 'hsfar');
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
  return { NODES, PATHS, RINGS, BY, along, has, proGot, proOn, proSet, build, partNames, open, count, name, at, left, tally, hit, kill, get all() { return data(); } };
})();
