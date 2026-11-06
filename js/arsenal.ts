'use strict';
// The sidearm tree: what you can start a run with. Everyone starts with the P9 in the middle, and three paths run out from it, each a way of
// fighting: full auto (volume of fire), heavy calibre (one round doing the work) and the modern classics (being where they aren't looking,
// and hitting what you aim at). Each gun on a path is earned by doing what that path's about with the gun before it, and it's yours for
// good: kept on this machine (G.U.store), between runs, whatever squad you're in. js/game.ts sidearmPick draws it.
// A kill's what it was as your rounds did it: js/player.ts hitEnemy keeps what they did to someone on them (ev.mine) and the host's word
// that they're down (js/game.ts credit) brings it here. Only a gun you've earned counts: one that turned up in a case has its own path to come.
// Each asks for more than a level has suspects (8 to 13, the act's last aside), so every gun takes several levels of play.
const G_Arsenal = (() => {
  // id, what it's reached from, which path, how far out (a: a branch off its path: its own angle and r, its distance out); and what it takes: stat, how many, of what
  // pro: mastering it, with it: what it takes, and the named build that earns you, to start with if you like (parts: on top of its own)
  interface ProBuild { name: string; stat: string; n: number; what: string; parts: Record<string, string>; }
  interface ArsenalNode { id: string; from?: string; path?: string; ring: number; stat?: string; n?: number; what?: string; how?: string; a?: number; r?: number; pro?: ProBuild; }
  const NODES: ArsenalNode[] = [
    { id: 'p9', ring: 0, pro: { name: 'Patrolman', stat: 'kills', n: 30, what: 'kills', parts: { tac: 'ptac.2', grip: 'gr.pistol.2' } } },
    { id: 'tx22', from: 'p9', path: 'auto', ring: 1, stat: 'tap', n: 15, what: 'double-tap kills', how: 'Two hits on them inside half a second, and they go down.',
      pro: { name: 'Hornet', stat: 'burst', n: 30, what: 'five-hit bursts', parts: { barrel: 'tx22.br.match', muzzle: 'mz.r22.comp', optic: 'op.pso.1' } } },
    { id: 'b92', from: 'tx22', path: 'auto', ring: 2, stat: 'burst', n: 15, what: 'five-hit bursts', how: "Five hits on one suspect inside a second, once a suspect. They needn't go down.",
      pro: { name: 'Tre Colpi', stat: 'trio', n: 25, what: 'burst kills', parts: { slide: 'b92.sl.comp', tac: 'ptac.1', grip: 'gr.pistol.0' } } },
    { id: 'g18', from: 'b92', path: 'auto', ring: 3, stat: 'trio', n: 15, what: 'burst kills', how: 'Two or more rounds of one burst hit them, and they go down.',
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
      pro: { name: 'Diplomat', stat: 'sur', n: 30, what: 'kills on unaware suspects', parts: { barrel: 'pbr.7.65x17.thr', muzzle: 'mz.rp.can', grip: 'gr.pistol.1' } } },
    { id: 'welrod', from: 'ppk', path: 'modern', ring: 2, a: 124, r: 470, stat: 'holster', n: 15, what: 'kills on suspects with their weapon holstered', how: 'Down a suspect with the PPK while their weapon is still holstered or slung. Once it is in their hands, it does not count.',
      pro: { name: 'Night Work', stat: 'sur', n: 30, what: 'kills on unaware suspects', parts: { mag: 'welrod.mag.ext' } } },
    { id: 'maxim9', from: 'welrod', path: 'modern', ring: 3, a: 124, r: 690, stat: 'hsback', n: 15, what: 'kills to the back of the head', how: 'Come up behind a suspect and put the Welrod to the back of their head. A shot from the front or the side does not count.',
      pro: { name: 'Quiet Room', stat: 'one', n: 30, what: 'one-round kills', parts: { barrel: 'maxim9.br.short', optic: 'op.pso.2', tac: 'ptac.1' } } },
    { id: 'm1911', from: 'ppk', path: 'modern', ring: 2, stat: 'hs', n: 15, what: 'headshot kills', how: 'Put it where it counts.',
      pro: { name: 'Old Faithful', stat: 'hs', n: 30, what: 'headshot kills', parts: { barrel: 'pbr.11.43x23.match', optic: 'op.pso.0', grip: 'gr.pistol.1' } } },
    { id: 'usp', from: 'm1911', path: 'modern', ring: 3, stat: 'hsfar', n: 15, what: 'headshot kills past 10 m', how: 'A headshot, from further off than a pistol wants to be.',
      pro: { name: 'Whisper', stat: 'sur', n: 30, what: 'kills on unaware suspects', parts: { barrel: 'pbr.11.43x23.thr', muzzle: 'mz.rp.can', tac: 'ptac.3' } } },
    { id: 'fiveseven', from: 'usp', path: 'modern', ring: 4, stat: 'far', n: 15, what: 'kills past 20 m', how: "A pistol, at a rifle's distance.",
      pro: { name: 'Long Reach', stat: 'far', n: 30, what: 'kills past 20 m', parts: { slide: 'fiveseven.sl.long', optic: 'op.pso.4', tac: 'ptac.1' } } },
  ];
  const PATHS: Record<string, { name: string; a: number; len: number }> = { auto: { name: 'Full auto', a: -90, len: 4 }, heavy: { name: 'Heavy calibre', a: 30, len: 4 }, modern: { name: 'Modern classics', a: 150, len: 4 } };
  const RINGS = [0, 250, 470, 690, 910], BY = new Map(NODES.map((q) => [q.id, q])), TAP = 500, BURST = 5, BURST_MS = 1000, MULTI = 3000, CLOSE = 5, MID = 10, FAR = 20;
  let save: any = null;
  const data = () => { if (!save) { const s = G.U.store.get('arsenal', null); save = s && s.got && s.n ? s : { got: [], n: {} }; save.pro = save.pro || {}; save.on = save.on || {}; } return save; };
  const keep = () => G.U.store.set('arsenal', data());
  const has = (id: string) => BY.has(id);
  // pro: earned it? set to start with it? and the build itself
  const proGot = (id: string) => !!data().pro[id];
  const proOn = (id: string) => proGot(id) && !!data().on[id];
  const proSet = (id: string, on: any) => { if (proGot(id)) { data().on[id] = !!on; keep(); } };
  function build(id: string) { const q = BY.get(id), b = Object.assign(G.Gunsmith.defaultBuild(id), q && q.pro ? q.pro.parts : {}); G.Gunsmith.prune(id, b); return b; }
  const partNames = (id: string) => Object.values(BY.get(id)!.pro!.parts).map((p) => G.Gunsmith.PARTS[p].name);
  const open = (id: string) => id === 'p9' || (has(id) && data().got.includes(id));
  const count = (id: string, stat: string) => (data().n[id] && data().n[id][stat]) || 0;
  const name = (id: string) => (G.WEAPONS[id] ? G.WEAPONS[id].name : id);
  // where it goes on the map: [x, y] from the P9, in pixels at full size
  const polar = (deg: number, r: number) => { const a = (deg * Math.PI) / 180; return [Math.cos(a) * r, Math.sin(a) * r]; };
  const along = (path: string, r: number) => polar(PATHS[path].a, r);
  const at = (q: ArsenalNode | undefined) => (q!.a != null ? polar(q!.a, q!.r!) : q!.ring ? along(q!.path!, RINGS[q!.ring]) : [0, 0]);
  // what's next from a gun: how far along each it's got
  const left = (q: ArsenalNode) => Math.min(q.n!, count(q.from!, q.stat!));
  // one more of something, with that gun: what it's for, and whatever that's earned
  function tally(id: string, stat: string) {
    if (!open(id)) return;
    const d = data(), ns = d.n[id] || (d.n[id] = {});
    ns[stat] = (ns[stat] || 0) + 1;
    for (const q of NODES) {
      if (q.from !== id || q.stat !== stat || open(q.id)) continue;
      if (ns[stat] >= q.n!) {
        d.got.push(q.id);
        G.HUD.toast('NEW SIDEARM', `${name(q.id)}: yours from your next run`, 3.5);
        if (G.Audio.click) G.Audio.click();
      } else G.HUD.feed(`<span class="cr">${G.U.esc(name(id))}: ${ns[stat]}/${q.n} ${G.U.esc(q.what!)}</span>`);
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
  // a burst kill: the one who went down was hit by two or more rounds of the same pull of a burst selector (js/player.ts shot.bst).
  // Not a window on the clock: the killing round is often the first or second of the three, the host's word of it comes back before the rest
  // have landed, and a pistol burst at point blank is over in 0.1 s. So it's asked at the kill, and again by each round of that burst after.
  function trio(id: string, k: any) {
    if (k.trio || !k.bst || k.bn < 2 || !k.done) return;
    k.trio = true; tally(id, 'trio');
  }
  // a kill of yours (m: the host's word of it; not a civilian or someone who'd given up: js/game.ts credit)
  let lastKill = new Map();
  function kill(m: any) {
    const ev = G.Views.enemies.get(m.e), k = ev && ev.mine;
    if (!k || k.done) return;
    k.done = true;
    if (m.gr) return; // (the grenade did it, frag or thermobaric: m.gr its seed, js/server.ts. Not the gun that hit them before)
    const id = k.wid, ts = k.ts, n = ts.length, now = performance.now();
    const within = (hits: number, ms: number) => n >= hits && ts[n - 1] - ts[n - hits] <= ms;
    tally(id, 'kills');
    if (within(2, TAP)) tally(id, 'tap');
    trio(id, k);
    if (lastKill.has(id) && now - lastKill.get(id) <= MULTI) { tally(id, 'multi'); lastKill.delete(id); } else lastKill.set(id, now); // (a pair's a pair: the next is the first of another)
    if (k.d <= CLOSE) tally(id, 'close');
    if (k.d >= FAR) tally(id, 'far');
    if (k.shots.size === 1) tally(id, 'one');
    if (G.Ballistics.suspectArmour(ev).some((a) => a.def.prot.length)) tally(id, 'armed'); // (no pistol goes through a vest: this is what a heavy one does about it)
    if (k.wall) tally(id, 'wall');
    if (m.h) tally(id, 'hs');
    if (m.h && k.d >= MID) tally(id, 'hsfar');
    if (m.h && k.back) tally(id, 'hsback');
    if (k.holster) tally(id, 'holster');
    if (m.sur) tally(id, 'sur');
  }
  // what a round of yours did to someone, for that
  function hit(ev: any, b: any) {
    let k = ev.mine;
    if (!k || k.wid !== b.def.id) k = ev.mine = { wid: b.def.id, ts: [], shots: new Set(), wall: false, d: 0, bst: 0, bn: 0, trio: false };
    const f = b.shot.f, p = ev.rig && ev.rig.root.position;
    if (b.shot.bst && b.shot.bst === k.bst) k.bn++; else { k.bst = b.shot.bst || 0; k.bn = k.bst ? 1 : 0; } // (the rounds of this pull that have hit them)
    k.ts.push(performance.now()); k.shots.add(b.shot.sid); k.wall = !!b.walled;
    if (!k.burst && k.ts.length >= BURST && k.ts[k.ts.length - 1] - k.ts[k.ts.length - BURST] <= BURST_MS) { k.burst = true; tally(k.wid, 'burst'); } // (the hits are the thing: down or not)
    trio(k.wid, k); // (a round of the burst that put them down, landing after the word of it)
    k.d = p && f ? Math.hypot(p.x - f[0], p.z - f[2]) : 0;
    // from behind: the shooter on the far side of the line through their shoulders (facing -sin/-cos of their yaw), well round the back
    k.holster = ev.armed === 1; // (their weapon away, holstered or slung, when the round hit: js/views.ts)
    k.back = !!(p && f && k.d > 0 && (-Math.sin(ev.yaw || 0) * (f[0] - p.x) + -Math.cos(ev.yaw || 0) * (f[2] - p.z)) / k.d < -0.25);
  }
  return { NODES, PATHS, RINGS, BY, along, has, proGot, proOn, proSet, build, partNames, open, count, name, at, left, tally, hit, kill, get all() { return data(); } };
})();
G.Arsenal = G_Arsenal;

interface GameModules { Arsenal: typeof G_Arsenal; }
