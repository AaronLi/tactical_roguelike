'use strict';
import { Arsenal } from './arsenal.js';
import { WEAPONS } from './data.js';
import { Hooks, U } from './util.js';
import { Gear } from './gear.js';
import { Gunsmith } from './parts.js';
import { Audio } from './audio.js';
import { HUD } from './hud.js';
// Your loadout for a run in space (js/game.ts sidearmPick draws it, before the base): a sidearm, a helmet and body armour (the primary
// tree's still here, but nothing picks from it: a run starts without one, sel), each
// taken from a tree of its own (the sidearm's is js/arsenal.ts's, as it always was). Every tree starts from the piece in its middle and runs
// out along paths; each piece on it is earned either by rank (XP, from the missions you complete: the harder the mission, the more) or by
// a challenge done with the piece before it (so many kills of a kind with that gun, so many rounds stopped by that armour, so many
// missions flown in it). What's earned stays yours, kept on this machine (G.U.store 'loadout') between runs, whatever squad you're in.
//   rank: 0 to start; the Micro Uzi, the primary tree's middle, comes at rank 1 (your first mission does it).
// Each piece takes up to two attachments (BOXES), earned with it: a gun's parts by challenges with that gun (ATT: each kind of part its
// own, harder as the part's tier goes up); a helmet's face piece and a carrier's plate, shoulder and groin pieces by the missions flown
// in it and the rounds it's stopped (GEAR_ATT). And all of it is costed (points: about one a 400 credits of what it'd cost, a primary its own (pts), a plate one a 200, a sidearm one more
// and an attachment at least one; the issue kit and the bump helmet nothing): what you take into a run can't come to more than BUDGET.
// And two throwables (thr: a frag, a flashbang or a thermobaric each, or nothing), a point apiece.
interface LoNode { pts?: number; id: string; from?: string; path?: string; ring: number; a?: number; r?: number; rank?: number; stat?: string; n?: number; what?: string; how?: string }
interface LoTree { slot: string; title: string; mid: string; NODES: LoNode[]; PATHS: Record<string, { name: string; a: number }> }
interface LoAtt { k: string; id: string; name: string; pts: number; open: boolean; stat: string; what: string; n: number; have: number }
export const Loadout = (() => {
  const RINGS = [0, 440, 660, 880, 1100, 1320], BOXES = 2;
  // ---- the trees. A node's id is the gun's or the piece of gear's. rank: earned at that rank; stat/n: earned by doing n of that with
  // the piece it's reached from.
  const TREES: Record<string, LoTree> = {
    p: {
      slot: 'p', title: 'Primary', mid: 'uzi',
      PATHS: { smg: { name: 'Submachine guns', a: -90 }, rifle: { name: 'Rifles', a: 30 }, breach: { name: 'Breaching', a: 150 } },
      NODES: [
        { id: 'uzi', pts: 2, ring: 0, rank: 1 },
        { id: 'mp5', pts: 3, from: 'uzi', path: 'smg', ring: 1, rank: 2 },
        { id: 'mpx', pts: 4, from: 'mp5', path: 'smg', ring: 2, stat: 'tap', n: 20, what: 'double-tap kills', how: 'Two hits on them inside half a second, and they go down.' },
        { id: 'mp5sd', pts: 4, from: 'mp5', path: 'smg', ring: 2, a: -122, r: 660, stat: 'sur', n: 15, what: 'kills on unaware suspects', how: 'Down a suspect before they react. If they have seen you or heard gunfire, it does not count.' },
        { id: 'p90', pts: 4, from: 'mpx', path: 'smg', ring: 3, stat: 'armed', n: 15, what: 'kills on armoured suspects', how: "A vest or a helmet: put enough rounds where it isn't." },
        { id: 'aks74u', pts: 4, from: 'uzi', path: 'rifle', ring: 1, rank: 3 },
        { id: 'ak', pts: 4, from: 'aks74u', path: 'rifle', ring: 2, stat: 'kills', n: 25, what: 'kills', how: 'Twenty-five down with the Krinkov.' },
        { id: 'm4', pts: 5, from: 'ak', path: 'rifle', ring: 3, rank: 4 },
        { id: 'dbl', pts: 3, from: 'uzi', path: 'breach', ring: 1, rank: 2 },
        { id: 'pump', pts: 4, from: 'dbl', path: 'breach', ring: 2, stat: 'close', n: 15, what: 'kills within 5 m', how: "Get close enough that it can't go wrong." },
      ],
    },
    h: {
      slot: 'h', title: 'Helmet', mid: 'h.bump',
      PATHS: { light: { name: 'High cut', a: -90 }, cover: { name: 'Coverage', a: 30 } },
      NODES: [
        { id: 'h.bump', ring: 0, rank: 0 },
        { id: 'h.fast', from: 'h.bump', path: 'light', ring: 1, rank: 1 },
        { id: 'h.ach', from: 'h.bump', path: 'cover', ring: 1, rank: 3 },
        { id: 'h.rifle', from: 'h.ach', path: 'cover', ring: 2, stat: 'stop', n: 10, what: 'rounds stopped by it', how: 'Let it take ten rounds meant for your head.' },
      ],
    },
    a: {
      slot: 'a', title: 'Body armour', mid: 'c.lite',
      PATHS: { soft: { name: 'Concealable', a: -90 }, plates: { name: 'Plate carriers', a: 30 } },
      NODES: [
        { id: 'c.lite', ring: 0, rank: 0 },
        { id: 'c.ghost', from: 'c.lite', path: 'soft', ring: 1, rank: 1 },
        { id: 'c.wrap', from: 'c.ghost', path: 'soft', ring: 2, rank: 2 },
        { id: 'c.slick', from: 'c.lite', path: 'plates', ring: 1, rank: 2 },
        { id: 'c.patrol', from: 'c.slick', path: 'plates', ring: 2, stat: 'missions', n: 3, what: 'missions completed in it', how: 'Bring it home from three missions.' },
        { id: 'c.assault', from: 'c.patrol', path: 'plates', ring: 3, rank: 5 },
        { id: 'c.heavy', from: 'c.assault', path: 'plates', ring: 4, stat: 'stop', n: 25, what: 'rounds stopped by it', how: 'Twenty-five rounds that would have killed you.' },
      ],
    },
  };
  // the sidearm's tree is the arsenal's (js/arsenal.ts): its guns, its paths, its challenges, what's earned of it
  Object.defineProperty(TREES, 's', { enumerable: true, get: () => ({ slot: 's', title: 'Sidearm', mid: 'p9', PATHS: Arsenal.PATHS, NODES: Arsenal.NODES as LoNode[] }) });
  const BY: Record<string, Map<string, LoNode>> = {};
  const by = (slot: string) => BY[slot] || (BY[slot] = new Map(TREES[slot].NODES.map((q) => [q.id, q])));
  // ---- XP and rank. A mission completed is 150 XP and 100 more for each step of its threat; the ranks come further apart as they go
  // (rank r at 250 r(r+1)/2: 250, 750, 1500, 2500...)
  const xpOf = (diff: number) => 150 + 100 * Math.max(1, diff | 0);
  const rankAt = (r: number) => (250 * r * (r + 1)) / 2;
  let save: any = null;
  const data = () => { if (!save) { const s = U.store.get('loadout', null); save = s && typeof s === 'object' ? s : {}; save.xp = Math.max(0, +save.xp || 0); save.n = save.n || {}; save.got = save.got || []; save.sel = save.sel || {}; save.box = save.box || {}; save.col = save.col || {}; } return save; };
  const keep = () => U.store.set('loadout', data());
  const xp = () => data().xp;
  const rank = () => { let r = 0; while (xp() >= rankAt(r + 1)) r++; return r; };
  // ---- what's yours: a rank node at its rank (with the one before it yours), a challenge node once it's done
  const node = (slot: string, id: string) => by(slot).get(id);
  function open(slot: string, id: string): boolean {
    if (slot === 's') return Arsenal.open(id);
    const q = node(slot, id); if (!q) return false;
    if (q.from && !open(slot, q.from)) return false;
    if (q.rank != null) return rank() >= q.rank;
    return data().got.includes(slot + ':' + id);
  }
  // a count of something done with a piece (the sidearm's: the arsenal's own)
  const count = (slot: string, id: string, stat: string): number => (slot === 's' ? Arsenal.count(id, stat) : (data().n[slot + ':' + id] && data().n[slot + ':' + id][stat]) || 0);
  const left = (slot: string, q: LoNode) => Math.min(q.n || 0, count(slot, q.from!, q.stat!));
  const name = (slot: string, id: string) => (slot === 'p' || slot === 's' ? (WEAPONS[id] ? WEAPONS[id].name : id) : Gear.DEFS[id] ? Gear.DEFS[id].name : id);
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
      if (ns[stat] >= q.n!) { d.got.push(slot + ':' + q.id); HUD.toast('NEW ' + TREES[slot].title.toUpperCase(), `${name(slot, q.id)}: yours from your next run`, 3.5); if (Audio.click) Audio.click(); }
      else HUD.feed(`<span class="cr">${U.esc(name(slot, id))}: ${ns[stat]}/${q.n} ${U.esc(q.what!)}</span>`);
    }
    attNews(slot, id, stat, ns[stat]);
    keep();
  }
  // an attachment just earned with it: said
  function attNews(slot: string, id: string, stat: string, n: number) {
    const got = atts(slot, id).filter((a) => a.stat === stat && a.n === n);
    if (got.length) HUD.toast('NEW ATTACHMENT' + (got.length > 1 ? 'S' : ''), `${got.length > 1 ? got.length + ' parts' : got[0].name}, for the ${name(slot, id)}`, 3.5);
  }
  // the node of each tree that's what you have on now (your primary's gun, your helmet, your carrier)
  function worn(me: any) {
    const k = me.kit || {};
    return { p: me.weapons && me.weapons.p ? me.weapons.p.def.id : null, h: k.helmet ? k.helmet.gid : null, a: k.carrier ? k.carrier.gid : null } as Record<string, string | null>;
  }
  // a kill with a gun (js/arsenal.ts kill passes its stats on): the primary tree's; the sidearm's the arsenal counts itself (its parts said here)
  const gunStat = (id: string, stat: string) => { if (node('p', id)) tally('p', id, stat); else if (Arsenal.has(id) && Arsenal.open(id)) attNews('s', id, stat, Arsenal.count(id, stat)); };
  // your armour stopped a round (js/player.ts): the helmet's if it was the helmet or its face piece, the body armour's otherwise
  function stopped(me: any, keys: string[]) {
    const w = worn(me);
    if (keys.some((k) => k === 'helmet' || k === 'face') && w.h) tally('h', w.h, 'stop');
    if (keys.some((k) => k !== 'helmet' && k !== 'face') && w.a) tally('a', w.a, 'stop');
  }
  // a mission completed (js/space.ts 'mdone'): its XP, and a mission flown for what you've got on
  function mission(me: any, diff: number) {
    const was = rank(), d = data(), g = xpOf(diff);
    d.xp += g; keep();
    HUD.feed(`<span class="cr">+${g} XP</span>`);
    if (rank() > was) HUD.toast('RANK ' + rank(), 'New loadout pieces may be open: see them before your next run', 4.5);
    const w = worn(me);
    for (const s of ['p', 'h', 'a']) if (w[s]) tally(s, w[s]!, 'missions');
    return g;
  }
  // ---- attachments. A gun's: each kind of part by its own challenge with the gun, a part of tier t when the count reaches the t-th of n
  const ATT: Record<string, { stat: string; what: string; n: number[] }> = {
    optic: { stat: 'hs', what: 'headshot kills', n: [3, 10, 20, 35] }, muzzle: { stat: 'kills', what: 'kills', n: [8, 20, 35, 50] },
    barrel: { stat: 'far', what: 'kills past 20 m', n: [3, 8, 15, 25] }, handguard: { stat: 'kills', what: 'kills', n: [5, 15, 30, 45] },
    tac: { stat: 'kills', what: 'kills', n: [4, 12, 25, 40] }, fg: { stat: 'tap', what: 'double-tap kills', n: [3, 8, 15, 25] },
    grip: { stat: 'tap', what: 'double-tap kills', n: [3, 8, 15, 25] }, stock: { stat: 'multi', what: 'double kills', n: [2, 5, 10, 18] },
    charging: { stat: 'kills', what: 'kills', n: [6, 15, 30, 45] }, loader: { stat: 'close', what: 'kills within 5 m', n: [3, 8, 15, 25] },
    railmount: { stat: 'kills', what: 'kills', n: [4, 12, 25, 40] }, slide: { stat: 'kills', what: 'kills', n: [6, 15, 30, 45] },
  };
  // A helmet's face piece; a carrier's plate (if it has a pocket), shoulder and groin pieces (if it takes them): by the missions flown in
  // it and the rounds it's stopped, a piece of tier t at the t-th
  const M = (n: number) => ({ stat: 'missions', what: 'missions completed in it', n }), St = (n: number) => ({ stat: 'stop', what: 'rounds stopped by it', n });
  const GEAR_ATT: Record<string, { stat: string; what: string; n: number }[]> = {
    face: [M(2), St(8), St(20)], plate: [M(1), St(6), St(15), St(30)], shoulder: [M(2), St(10), St(25)], groin: [M(2), St(10), St(25)],
  };
  const isGun = (slot: string) => slot === 'p' || slot === 's';
  const LO_OFF = ['p.ceramic', 'p.ceramic2']; // (not to be had at the start of a run: the ceramic plates)
  // (a plate comes dearer: a point a 200 credits; the rest a point a 400; a primary's set on its node, pts; a sidearm a point on top
  // of its price's, PISTOL_UP; an attachment never less than a point)
  const BUDGET = 10, pts = (price: number, per = 400) => Math.round((price || 0) / per), PLATE_PER = 200, PISTOL_UP = 1;
  const PISTOL_ATT_UP: Record<string, number> = { slide: 1, optic: 1, stock: 2 }; // (a sidearm's slide and sight a point dearer, its stock two: the Derringer's too, though it goes on as a grip)
  // every attachment it could take (of the kind k, or all), each with what it takes and whether it's earned
  function atts(slot: string, id: string, only?: string): LoAtt[] {
    const out: LoAtt[] = [];
    if (isGun(slot)) {
      const GS = Gunsmith, b = GS.defaultBuild(id);
      for (const s of GS.visibleSlots(id, b)) {
        const k = GS.kindOf(s.slot), A = ATT[k]; if (!A || (only && only !== s.slot)) continue;
        for (const p of GS.LIST) {
          if (p.id === b[s.slot] || p.factory || p.retired || p.variant || p.becomes || GS.plainHere(p, id) || !GS.fitsSlot(s, p, id, b)) continue;
          const stat = A.stat, n = A.n[Math.min(3, Math.max(0, (p.tier || 1) - 1))], have = count(slot, id, stat);
          out.push({ k: s.slot, id: p.id, name: p.name, pts: Math.max(1, pts(GS.buyPrice(p))) + (slot === 's' ? PISTOL_ATT_UP[p.id === 'gr.derringer.stock' ? 'stock' : k] || 0 : 0), open: open(slot, id) && have >= n, stat, what: A.what, n, have: Math.min(n, have) });
        }
      }
    } else {
      const d = Gear.DEFS[id], mounts = slot === 'h' ? (d.face ? ['face'] : []) : [d.plate ? 'plate' : '', d.shoulder ? 'shoulder' : '', d.groin ? 'groin' : ''].filter(Boolean);
      for (const k of mounts) {
        if (only && only !== k) continue;
        for (const g of Gear.LIST.filter((x) => x.kind === k && !LO_OFF.includes(x.id))) {
          const q = GEAR_ATT[k][Math.min(GEAR_ATT[k].length - 1, Math.max(0, (g.tier || 1) - 1))], have = count(slot, id, q.stat);
          out.push({ k, id: g.id, name: g.name, pts: Math.max(1, pts(g.price, k === 'plate' ? PLATE_PER : 400)), open: open(slot, id) && have >= q.n, stat: q.stat, what: q.what, n: q.n, have: Math.min(q.n, have) });
        }
      }
    }
    return out.sort((x, y) => (x.k < y.k ? -1 : x.k > y.k ? 1 : x.n - y.n || x.pts - y.pts));
  }
  // what's in its boxes (up to two: [{ k, id }], k the gun's slot or the gear's mount), only what's still earned
  const boxes = (slot: string, id: string): { k: string; id: string }[] => (data().box[slot + ':' + id] || []).filter((b: any) => b && atts(slot, id, b.k).some((a) => a.id === b.id && a.open)).slice(0, BOXES);
  // a gun as it's taken: as it comes, with its boxes' parts (whatever no longer fits dropped)
  function build(slot: string, gun: string, bx = boxes(slot, gun)) {
    const GS = Gunsmith, b = GS.defaultBuild(gun);
    for (const x of bx) b[x.k] = x.id;
    GS.prune(gun, b); return b;
  }
  // the boxes as they'd be with an attachment put in a box (k, id), or the box emptied (null): one of a kind (a second sight replaces
  // the first), two at most. (Not kept: what fit does, and what the attachment view shows on hovering one, earned or not)
  function boxesWith(slot: string, id: string, box: number, att: { k: string; id: string } | null) {
    const cur = boxes(slot, id).slice();
    if (att) { const same = cur.findIndex((b) => b.k === att.k); if (same >= 0) cur.splice(same, 1, att); else if (box < cur.length) cur[box] = att; else if (cur.length < BOXES) cur.push(att); }
    else if (box < cur.length) cur.splice(box, 1);
    return cur;
  }
  function fit(slot: string, id: string, box: number, att: { k: string; id: string } | null) {
    if (att && !atts(slot, id, att.k).some((a) => a.id === att.id && a.open)) return;
    data().box[slot + ':' + id] = boxesWith(slot, id, box, att); keep();
  }
  // ---- points: what it'd cost, about one a 400 credits (the issue kit and the bump helmet nothing; a sidearm one more), its boxes' too
  function cost(slot: string, id: string | null, bx?: { k: string; id: string }[]): number {
    if (!id) return 0;
    const q = slot === 's' ? null : node(slot, id), own = q && q.pts != null ? q.pts : isGun(slot) ? pts(WEAPONS[id].price) + (slot === 's' ? PISTOL_UP : 0) : pts(Gear.DEFS[id].price); // (a primary's its own, pts: about alike across the kinds)
    return own + (bx || boxes(slot, id)).reduce((n, b) => n + (atts(slot, id, b.k).find((a) => a.id === b.id)?.pts || 0), 0);
  }
  // ---- the loadout itself: what's picked for each slot (kept, so the next run starts with it), and putting it on you
  const sel = (slot: string): string | null => { if (slot === 'p') return null; const d = data().sel, id = slot in d ? d[slot] : TREES[slot].mid; return id && open(slot, id) ? id : null; }; // (never set: the tree's middle, once it's yours; set empty: empty. A primary's not taken: no run starts with one, whatever was picked before)
  const pick = (slot: string, id: string | null) => { if (id && !open(slot, id)) return; data().sel[slot] = id; keep(); };
  // ---- two throwables to start with (each its own slot: a frag, a flashbang or a thermobaric, or nothing), a point each
  const THROWS = ['frag', 'flash', 'tb', 'sticky'], THROW_SLOTS = 2, THROW_PTS = 1;
  const THROW_DESC: Record<string, string> = {
    frag: 'Steel chips over the whole sphere: deadly a few metres out in the open, stopped by walls and cover. A 2.2 second fuse you can cook.',
    flash: 'A blinding flash and a bang that deafens: whoever is near and looking is out of it for a while. Hurts nobody. A 1.5 second fuse.',
    tb: 'A cloud of fuel, lit: a fireball that fills the room it lands in (out through an open door, not a shut one). A 2.6 second fuse.',
    sticky: 'Holds to the first thing it hits, a wall, a door or a person, and goes off two seconds later. A few heavy cubes of hardened steel rather than a frag\'s many chips: fewer of them reach anyone, but each goes through soft armour and thin walls (not a rifle plate).',
  };
  const THROW_NAME: Record<string, string> = { frag: 'Frag grenade', flash: 'Flashbang', tb: 'Thermobaric', sticky: 'Sticky grenade' }, THROW_SHORT: Record<string, string> = { frag: 'Frag', flash: 'Flash', tb: 'Thermo', sticky: 'Sticky' }; // (short: as a box in the bar has room for)
  const thr = (i: number): string | null => { const t = data().thr; const k = Array.isArray(t) ? t[i] : null; return THROWS.includes(k) ? k : null; };
  function setThr(i: number, k: string | null) { const d = data(); if (!Array.isArray(d.thr)) d.thr = []; d.thr[i] = k && THROWS.includes(k) ? k : null; keep(); }
  const nextThr = (i: number) => { const k = thr(i), j = k ? THROWS.indexOf(k) + 1 : 0; setThr(i, j < THROWS.length ? THROWS[j] : null); }; // (nothing, then each in turn, then nothing again)
  const throwItem = (k: string) => (k === 'frag' ? Gear.fragItem() : k === 'flash' ? Gear.flashItem() : k === 'sticky' ? Gear.stickyItem() : Gear.tbItem());
  const thrCost = () => { let n = 0; for (let i = 0; i < THROW_SLOTS; i++) if (thr(i)) n += THROW_PTS; return n; };
  const total = () => ['p', 's', 'h', 'a'].reduce((n, s) => n + cost(s, sel(s)), 0) + thrCost();
  // Colours: a helmet (and its face piece) or the armour (the carrier, its pouches and what's mounted on it) in one solid colour of
  // these, kept with the loadout; null: each piece's own (its maker's)
  const COLOURS: [string, number | null][] = [['Issue', null], ['Black', 0x1d1f21], ['Coyote', 0x7a6748], ['Tan', 0x9a8a68], ['Ranger green', 0x3f4a35], ['Olive drab', 0x4f5236], ['Wolf grey', 0x585c5f], ['Navy', 0x242c3a]];
  const col = (slot: string): number | null => { const c = data().col[slot]; return typeof c === 'number' ? c : null; };
  function setCol(slot: string, c: number | null) { if (c == null) delete data().col[slot]; else data().col[slot] = c; keep(); }
  function apply(me: any, sidearmOnly = false) {
    const P = sel('p'), S = sel('s') || 'p9', H = sel('h'), A = sel('a'), Gr = Gear;
    me.setSidearm(S, build('s', S));
    if (sidearmOnly) return;
    const tint = (it: any, c: number | null) => { if (c != null) it.col = c; return it; };
    if (H) { const it = tint(Gr.gearItem(H), col('h')); for (const b of boxes('h', H)) (it as any)[b.k] = tint(Gr.gearItem(b.id), col('h')); me.kit.helmet = it; }
    if (A) { const it = tint(Gr.gearItem(A), col('a')); for (const b of boxes('a', A)) (it as any)[b.k] = tint(Gr.gearItem(b.id), col('a')); me.kit.carrier = it; }
    for (let i = 0; i < THROW_SLOTS; i++) { const k = thr(i); if (!k) continue; const it = throwItem(k); if (!Gr.stow(me, it)) HUD.toast('', `No room for the ${THROW_NAME[k].toLowerCase()}`, 2); } // (the throwables: wherever they fit on you)
    for (let i = 0; i < THROW_SLOTS; i++) { const k = thr(i); if (!k || me.quick.includes(k)) continue; const j = me.quick.findIndex((q: string | null) => !q || !me.quickCount(q)); if (j >= 0) me.setQuick(j, k); } // (each on a key, 3 to 5: in place of one you carry none of)
    if (P) { // (after the armour: its spare loads go on what you're wearing now)
      const w = me.makeWeapon(P, build('p', P)); me.weapons.p = w;
      for (let i = 0; i < 3; i++) { const it = Gr.ammoItem(w.def, Gr.ammoFor(w.def).kind === 'mag' ? null : 12); if (!Gr.stow(me, it)) break; } // (three spare loads, wherever they fit)
    }
  }
  function reload() { save = null; }
  return { THROWS, THROW_SLOTS, THROW_PTS, THROW_NAME, THROW_SHORT, THROW_DESC, throwItem, thr, setThr, nextThr, thrCost, TREES, RINGS, BOXES, by, xpOf, rankAt, xp, rank, open, count, left, name, need, at, along, tally, gunStat, stopped, mission, worn, sel, pick, apply, reload, COLOURS, col, setCol, atts, boxes, boxesWith, fit, build, BUDGET, pts, cost, total };
})();
G.Loadout = Loadout;
Hooks.gunStat = (id, stat) => Loadout.gunStat(id, stat); // (the sidearm tree's kills count here too: js/arsenal.ts tally)
declare global { interface GameModules { Loadout: typeof Loadout } }
