'use strict';
// Your loadout for a run in space (js/game.ts sidearmPick draws it, before the base): a primary, a sidearm, a helmet and body armour, each
// taken from a tree of its own, as the sidearm always has been (js/arsenal.ts, the sidearm's tree, is its own and stays as it was).
// Every tree starts from the piece in its middle and runs out along paths; each piece on it is earned either by rank (XP, from the
// missions you complete: the harder the mission, the more) or by a challenge done with the piece before it (so many kills of a kind
// with that gun, so many rounds stopped by that armour, so many missions flown in it). What's earned stays yours, kept on this machine
// (G.U.store 'loadout') between runs, whatever squad you're in.
//   rank: 0 to start; the Micro Uzi, the primary tree's middle, comes at rank 1 (your first mission does it).
interface LoNode { id: string; from?: string; path?: string; ring: number; a?: number; r?: number; rank?: number; stat?: string; n?: number; what?: string; how?: string; kit?: { helmet?: string; face?: string; carrier?: string; plate?: string } }
interface LoTree { slot: 'p' | 'h' | 'a'; title: string; mid: string; NODES: LoNode[]; PATHS: Record<string, { name: string; a: number }> }
const G_Loadout = (() => {
  const RINGS = [0, 440, 660, 880, 1100, 1320];
  // ---- the trees. A node's id is the gun's (the primary tree) or the pieces it is, joined by '+' (a helmet and its face piece; a
  // carrier and its plate). rank: earned at that rank; stat/n: earned by doing n of that with the piece it's reached from.
  const TREES: Record<string, LoTree> = {
    p: {
      slot: 'p', title: 'Primary', mid: 'uzi',
      PATHS: { smg: { name: 'Submachine guns', a: -90 }, rifle: { name: 'Rifles', a: 30 }, breach: { name: 'Breaching', a: 150 } },
      NODES: [
        { id: 'uzi', ring: 0, rank: 1 },
        { id: 'mp5', from: 'uzi', path: 'smg', ring: 1, rank: 2 },
        { id: 'mpx', from: 'mp5', path: 'smg', ring: 2, stat: 'tap', n: 20, what: 'double-tap kills', how: 'Two hits on them inside half a second, and they go down.' },
        { id: 'mp5sd', from: 'mp5', path: 'smg', ring: 2, a: -122, r: 660, stat: 'sur', n: 15, what: 'kills on unaware suspects', how: 'Down a suspect before they react. If they have seen you or heard gunfire, it does not count.' },
        { id: 'vector', from: 'mpx', path: 'smg', ring: 3, rank: 6 },
        { id: 'p90', from: 'mpx', path: 'smg', ring: 3, a: -62, r: 880, stat: 'armed', n: 15, what: 'kills on armoured suspects', how: 'A vest or a helmet: put enough rounds where it isn\'t.' },
        { id: 'aks74u', from: 'uzi', path: 'rifle', ring: 1, rank: 3 },
        { id: 'ak', from: 'aks74u', path: 'rifle', ring: 2, stat: 'kills', n: 25, what: 'kills', how: 'Twenty-five down with the Krinkov.' },
        { id: 'm4', from: 'aks74u', path: 'rifle', ring: 2, a: 58, r: 660, rank: 4 },
        { id: 'hk416', from: 'm4', path: 'rifle', ring: 3, a: 58, r: 880, stat: 'hs', n: 20, what: 'headshot kills', how: 'Put it where it counts.' },
        { id: 'sr25', from: 'hk416', path: 'rifle', ring: 4, a: 58, r: 1100, stat: 'far', n: 15, what: 'kills past 20 m', how: 'Reach out with it.' },
        { id: 'ak74', from: 'ak', path: 'rifle', ring: 3, rank: 5 },
        { id: 'an94', from: 'ak74', path: 'rifle', ring: 4, stat: 'hsfar', n: 15, what: 'headshot kills past 10 m', how: 'A headshot, from across the room or further.' },
        { id: 'scar', from: 'ak74', path: 'rifle', ring: 4, a: 8, r: 1100, rank: 8 },
        { id: 'dbl', from: 'uzi', path: 'breach', ring: 1, rank: 2 },
        { id: 'benelli', from: 'dbl', path: 'breach', ring: 2, stat: 'close', n: 15, what: 'kills within 5 m', how: "Get close enough that it can't go wrong." },
        { id: 'saiga', from: 'benelli', path: 'breach', ring: 3, rank: 5 },
        { id: 'aa12', from: 'saiga', path: 'breach', ring: 4, stat: 'multi', n: 10, what: 'double kills', how: 'Two suspects down inside three seconds.' },
        { id: 'rpk', from: 'benelli', path: 'breach', ring: 3, a: 176, r: 880, rank: 6 },
        { id: 'm249', from: 'rpk', path: 'breach', ring: 4, a: 176, r: 1100, stat: 'multi', n: 15, what: 'double kills', how: 'Two down inside three seconds, and keep the belt running.' },
      ],
    },
    h: {
      slot: 'h', title: 'Helmet', mid: 'h.bump',
      PATHS: { light: { name: 'High cut', a: -90 }, cover: { name: 'Coverage', a: 30 } },
      NODES: [
        { id: 'h.bump', ring: 0, rank: 0, kit: { helmet: 'h.bump' } },
        { id: 'h.fast', from: 'h.bump', path: 'light', ring: 1, rank: 1, kit: { helmet: 'h.fast' } },
        { id: 'h.fast+f.mandible', from: 'h.fast', path: 'light', ring: 2, stat: 'missions', n: 3, what: 'missions completed in it', how: 'Bring it home from three missions.', kit: { helmet: 'h.fast', face: 'f.mandible' } },
        { id: 'h.ach', from: 'h.bump', path: 'cover', ring: 1, rank: 3, kit: { helmet: 'h.ach' } },
        { id: 'h.rifle', from: 'h.ach', path: 'cover', ring: 2, stat: 'stop', n: 10, what: 'rounds stopped by it', how: 'Let it take ten rounds meant for your head.', kit: { helmet: 'h.rifle' } },
        { id: 'h.ach+f.shield', from: 'h.ach', path: 'cover', ring: 2, a: 62, r: 660, stat: 'missions', n: 5, what: 'missions completed in it', how: 'Bring it home from five missions.', kit: { helmet: 'h.ach', face: 'f.shield' } },
        { id: 'h.rifle+f.rifle', from: 'h.rifle', path: 'cover', ring: 3, rank: 8, kit: { helmet: 'h.rifle', face: 'f.rifle' } },
      ],
    },
    a: {
      slot: 'a', title: 'Body armour', mid: 'c.lite',
      PATHS: { soft: { name: 'Concealable', a: -90 }, plates: { name: 'Plate carriers', a: 30 }, light: { name: 'Light and fast', a: 150 } },
      NODES: [
        { id: 'c.lite', ring: 0, rank: 0, kit: { carrier: 'c.lite' } },
        { id: 'c.ghost', from: 'c.lite', path: 'soft', ring: 1, rank: 1, kit: { carrier: 'c.ghost' } },
        { id: 'c.slick+p.soft', from: 'c.ghost', path: 'soft', ring: 2, stat: 'missions', n: 3, what: 'missions completed in it', how: 'Bring it home from three missions.', kit: { carrier: 'c.slick', plate: 'p.soft' } },
        { id: 'c.slick+p.steel', from: 'c.lite', path: 'plates', ring: 1, rank: 2, kit: { carrier: 'c.slick', plate: 'p.steel' } },
        { id: 'c.patrol+p.pe', from: 'c.slick+p.steel', path: 'plates', ring: 2, stat: 'stop', n: 15, what: 'rounds stopped by it', how: 'Let it take fifteen rounds.', kit: { carrier: 'c.patrol', plate: 'p.pe' } },
        { id: 'c.assault+p.ceramic', from: 'c.patrol+p.pe', path: 'plates', ring: 3, rank: 5, kit: { carrier: 'c.assault', plate: 'p.ceramic' } },
        { id: 'c.heavy+p.ceramic2', from: 'c.assault+p.ceramic', path: 'plates', ring: 4, stat: 'stop', n: 25, what: 'rounds stopped by it', how: 'Twenty-five rounds that would have killed you.', kit: { carrier: 'c.heavy', plate: 'p.ceramic2' } },
        { id: 'c.recon', from: 'c.lite', path: 'light', ring: 1, rank: 2, kit: { carrier: 'c.recon' } },
        { id: 'c.patrol+p.steel', from: 'c.recon', path: 'light', ring: 2, stat: 'missions', n: 4, what: 'missions completed in it', how: 'Bring it home from four missions.', kit: { carrier: 'c.patrol', plate: 'p.steel' } },
      ],
    },
  };
  const BY: Record<string, Map<string, LoNode>> = {}; for (const k of Object.keys(TREES)) BY[k] = new Map(TREES[k].NODES.map((q) => [q.id, q]));
  // ---- XP and rank. A mission completed is 150 XP and 100 more for each step of its threat; the ranks come further apart as they go
  // (rank r at 250 r(r+1)/2: 250, 750, 1500, 2500...)
  const xpOf = (diff: number) => 150 + 100 * Math.max(1, diff | 0);
  const rankAt = (r: number) => (250 * r * (r + 1)) / 2;
  let save: any = null;
  const data = () => { if (!save) { const s = G.U.store.get('loadout', null); save = s && typeof s === 'object' ? s : {}; save.xp = Math.max(0, +save.xp || 0); save.n = save.n || {}; save.got = save.got || []; save.sel = save.sel || {}; } return save; };
  const keep = () => G.U.store.set('loadout', data());
  const xp = () => data().xp;
  const rank = () => { let r = 0; while (xp() >= rankAt(r + 1)) r++; return r; };
  // ---- what's yours: a rank node at its rank (with the one before it yours), a challenge node once it's done
  const node = (slot: string, id: string) => BY[slot] && BY[slot].get(id);
  function open(slot: string, id: string): boolean {
    const q = node(slot, id); if (!q) return false;
    if (q.from && !open(slot, q.from)) return false;
    if (q.rank != null) return rank() >= q.rank;
    return data().got.includes(slot + ':' + id);
  }
  const count = (slot: string, id: string, stat: string) => (data().n[slot + ':' + id] && data().n[slot + ':' + id][stat]) || 0;
  const left = (slot: string, q: LoNode) => Math.min(q.n || 0, count(slot, q.from!, q.stat!));
  const name = (slot: string, id: string) => {
    if (slot === 'p') return G.WEAPONS[id] ? G.WEAPONS[id].name : id;
    const k = node(slot, id)?.kit || {}, D = G.Gear.DEFS;
    return [k.helmet || k.carrier, k.face || k.plate].filter(Boolean).map((g) => (D[g!] ? D[g!].name : g)).join(' + ');
  };
  // what it takes, said: 'Rank 3', or the challenge
  const need = (slot: string, q: LoNode) => (q.rank != null ? `Rank ${q.rank}` : `${left(slot, q)}/${q.n} ${q.what} with the ${name(slot, q.from!)}`);
  const polar = (deg: number, r: number) => { const a = (deg * Math.PI) / 180; return [Math.cos(a) * r, Math.sin(a) * r]; };
  const at = (slot: string, q: LoNode) => (q.a != null ? polar(q.a, q.r!) : q.ring ? polar(TREES[slot].PATHS[q.path!].a, RINGS[q.ring]) : [0, 0]);
  const along = (slot: string, path: string, r: number) => polar(TREES[slot].PATHS[path].a, r);
  // ---- a challenge's count, one more (stat, of the piece id in that tree), and whatever that's earned
  function tally(slot: string, id: string, stat: string) {
    if (!open(slot, id)) return;
    const d = data(), k = slot + ':' + id, ns = d.n[k] || (d.n[k] = {});
    ns[stat] = (ns[stat] || 0) + 1;
    for (const q of TREES[slot].NODES) {
      if (q.from !== id || q.stat !== stat || d.got.includes(slot + ':' + q.id)) continue;
      if (ns[stat] >= q.n!) { d.got.push(slot + ':' + q.id); G.HUD.toast('NEW ' + TREES[slot].title.toUpperCase(), `${name(slot, q.id)}: yours from your next run`, 3.5); if (G.Audio.click) G.Audio.click(); }
      else G.HUD.feed(`<span class="cr">${G.U.esc(name(slot, id))}: ${ns[stat]}/${q.n} ${G.U.esc(q.what!)}</span>`);
    }
    keep();
  }
  // the node of each tree that's what you have on now (your primary's gun; the helmet and face piece, the carrier and plate you're wearing)
  function worn(me: any) {
    const k = me.kit || {}, h = k.helmet, c = k.carrier;
    return { p: me.weapons && me.weapons.p ? me.weapons.p.def.id : null, h: h ? h.gid + (h.face ? '+' + h.face.gid : '') : null, a: c ? c.gid + (c.plate ? '+' + c.plate.gid : '') : null } as Record<string, string | null>;
  }
  // a kill with a gun (js/arsenal.ts kill passes its stats on): the primary tree's
  const gunStat = (id: string, stat: string) => { if (node('p', id)) tally('p', id, stat); };
  // your armour stopped a round (js/player.ts): the helmet's if it was the helmet's, the body armour's otherwise
  function stopped(me: any, keys: string[]) {
    const w = worn(me);
    if (keys.some((k) => k === 'helmet' || k === 'face') && w.h) tally('h', w.h, 'stop');
    if (keys.some((k) => k !== 'helmet' && k !== 'face') && w.a) tally('a', w.a, 'stop');
  }
  // a mission completed (js/space.ts 'mdone'): its XP, and a mission flown for what you've got on
  function mission(me: any, diff: number) {
    const was = rank(), d = data(), g = xpOf(diff);
    d.xp += g; keep();
    G.HUD.feed(`<span class="cr">+${g} XP</span>`);
    if (rank() > was) G.HUD.toast('RANK ' + rank(), 'New loadout pieces may be open: see them before your next run', 4.5);
    const w = worn(me);
    for (const s of ['p', 'h', 'a']) if (w[s]) tally(s, w[s]!, 'missions');
  }
  // ---- the loadout itself: what's picked for each slot (kept, so the next run starts with it), and putting it on you
  const sel = (slot: string): string | null => { const d = data().sel, id = slot in d ? d[slot] : TREES[slot].mid; return id && open(slot, id) ? id : null; }; // (never set: the tree's middle, once it's yours; set empty: empty)
  const pick = (slot: string, id: string | null) => { if (id && !open(slot, id)) return; data().sel[slot] = id; keep(); };
  function apply(me: any) {
    const P = sel('p'), H = sel('h'), A = sel('a'), Gr = G.Gear;
    if (H) { const k = node('h', H)!.kit!, it = Gr.gearItem(k.helmet!); if (k.face) it.face = Gr.gearItem(k.face); me.kit.helmet = it; }
    if (A) { const k = node('a', A)!.kit!, it = Gr.gearItem(k.carrier!); if (k.plate) it.plate = Gr.gearItem(k.plate); me.kit.carrier = it; }
    if (P) { // (after the armour: its spare loads go on what you're wearing now)
      const w = me.makeWeapon(P); me.weapons.p = w;
      for (let i = 0; i < 3; i++) { const it = Gr.ammoItem(w.def, Gr.ammoFor(w.def).kind === 'mag' ? null : 12); if (!Gr.stow(me, it)) break; } // (three spare loads, wherever they fit)
    }
  }
  function reload() { save = null; }
  return { TREES, RINGS, BY, xpOf, rankAt, xp, rank, open, count, left, name, need, at, along, tally, gunStat, stopped, mission, worn, sel, pick, apply, reload };
})();
G.Loadout = G_Loadout;
interface GameModules { Loadout: typeof G_Loadout }
