'use strict';
// Vex the quartermaster: between-level shop. A small rotating stock (a carrier or rig, two plates, a helmet, a
// belt and three weapon parts), seeded so the whole squad sees the same shelves. What you buy goes on you if
// there's a slot or pouch for it, otherwise into your locker; the Kit tab (js/invui.ts) is where you sort it.
// The stock is the squad's, shared: each thing he lists, as many of it as there are of you (baseStock), counted by
// the host (js/server.ts take/give). Buying asks the host for one first (take); you pay once it's yours, and if you
// can't (no room by then, say) it goes back on the shelf. Guns and the machines' supplies don't run out.
// a box of special rounds on the shelf: caliber, load, how many
interface ShopAmmo { cal: string; am: string; n: number; }
type ShopStock = Record<string, number>;
// this visit's shelves (genOffers): gear ids, weapon ids by slot, special ammo, pouches and magazines, and the plate / face shield each carrier / helmet comes with
interface ShopOffers { p: string[]; s: string[]; gear: string[]; ammo: ShopAmmo[]; pouches: { id: string; n: number }[]; mags: { id: string; n: number }[]; plates?: Record<string, string>; faces?: Record<string, string>; nvg?: string[]; njParts?: string[]; }
// a purchase waiting on the host's say-so (take / took)
interface ShopPending { key: string; buy: () => boolean | void; }
// the level's report (js/game.ts shop)
interface ShopReport { arrests?: number; incap?: number; bleedouts?: number; rescued?: number; evidence?: number; bodies?: number; civKilled?: number; unauth?: number; allRescued?: boolean; stronghold?: boolean; }
// a thing on the Supplies tab (services())
interface ShopService { id: string; name: string; desc: string; price: number; disabled: boolean; apply: () => unknown; sel?: string; }
const G_Shop = {
  tab: 'stock',
  offers: null as ShopOffers | null,
  ready: false,
  // (what it gets as it runs: this visit's level, stock and the gunsmith's parts; the screen's title and the level's report, js/game.ts)
  level: undefined as unknown as number,
  stock: undefined as unknown as ShopStock,
  partStock: undefined as unknown as ReturnType<typeof G.Gunsmith.rollStock>,
  precStock: undefined as unknown as ReturnType<typeof G.Gunsmith.rollPrecision>,
  loadSel: undefined as unknown as Record<string, string>,
  title: undefined as unknown as string | null,
  report: undefined as unknown as ShopReport | null,
  pend: undefined as unknown as Map<number, ShopPending>,
  qn: undefined as unknown as number,

  open(level: number, seed: number, stock?: ShopStock | null) {
    this.level = level;
    this.ready = false;
    this.genOffers(level, seed);
    this.partStock = G.Gunsmith.rollStock(level, seed); // the gunsmith's parts this visit (same for the whole squad)
    this.precStock = G.Gunsmith.rollPrecision(level, seed); // and the precision showcase's (js/hangar.ts)
    // the shared stock: the host's count when it's come, until then what it starts at (the same reckoning the host's)
    this.stock = stock || G.Shop.scaleStock(this.baseStock(level, seed), Object.keys(G.Game.roster || {}).length || 1);
    this.pend = new Map(); this.qn = 0;
    document.getElementById('vendorArt')!.innerHTML = this.portrait();
    this.quip('hello');
    this.render();
  },

  // What he has of each thing he lists this visit, for one of you: a piece of kit, a handful of a special load and a
  // gun part one each, pouches and magazines a few. Keys: gear:<id>, ammo:<caliber>, pouch:<id>, mag:<gun|mag>, part:<id>
  baseStock(level: number, seed: number) {
    const t = Object.create(G.Shop); t.genOffers(level, seed);
    const O = t.offers, s: ShopStock = {};
    for (const id of O.gear) s['gear:' + id] = 1;
    for (const id of O.nvg || []) s['gear:' + id] = 1; // (Nightjar's night vision: js/hangar.ts NJ)
    for (const id of O.njParts || []) s['part:' + id] = 1; // (and their thermal sight)
    for (const o of O.ammo) s['ammo:' + o.cal] = 1;
    for (const o of O.pouches) s['pouch:' + o.id] = o.n;
    for (const o of O.mags) s['mag:' + o.id] = o.n;
    for (const id of G.Gunsmith.rollStock(level, seed)) s['part:' + id] = 1;
    for (const id of G.Gunsmith.rollPrecision(level, seed)) s['part:' + id] = 1; // (the precision showcase's)
    return s;
  },
  scaleStock(s: ShopStock, n: number) { const o: ShopStock = {}; for (const k in s) o[k] = s[k] * Math.max(1, n); return o; },
  // The parts you've starred (from the gunsmith's lists or here): kept with the rest of what's saved in the browser, so a
  // reload keeps them. A bought part stays starred (you may want a second, or a spare) until you unstar it.
  wishSet: null as Set<string> | null,
  wishes() {
    if (!this.wishSet) { const v = G.U.store.get('wishlist', []); this.wishSet = new Set(Array.isArray(v) ? v.filter((x: unknown) => typeof x === 'string') : []); }
    return this.wishSet;
  },
  wished(id: string) { return this.wishes().has(id); },
  toggleWish(id: string) {
    const w = this.wishes();
    if (!w.delete(id)) w.add(id);
    G.U.store.set('wishlist', [...w]);
    return w.has(id);
  },
  // the star on a part: lit when it's on the wishlist
  star(id: string) { const on = this.wished(id); return `<button class="wish${on ? ' on' : ''}" data-wish="${id}" title="${on ? 'On your wishlist (click to remove)' : 'Add to your wishlist (you are told when it is in the store)'}">${on ? '★' : '☆'}</button>`; },
  // the starred parts on the shelves right now (the gunsmith's and Timberline's showcase), by name
  wishInStock(): string[] {
    const ids = new Set<string>([...(this.partStock || []), ...(this.precStock || [])] as string[]);
    return [...ids].filter((id) => this.wished(id) && this.inStock('part:' + id) && G.Gunsmith.PARTS[id]).map((id) => G.Gunsmith.PARTS[id].name);
  },
  // told when a visit's stock has starred parts in it (the hangar's welcome, js/game.ts)
  wishNotice() {
    const n = this.wishInStock();
    if (n.length) G.HUD.toast('★ ON YOUR WISHLIST, IN STOCK', G.U.esc(n.slice(0, 4).join(', ')) + (n.length > 4 ? ` and ${n.length - 4} more` : ''), 6);
  },
  count(key: string) { return (this.stock && this.stock[key]) || 0; },
  inStock(key: string) { return this.count(key) > 0; },
  // the host's count, whenever it changes (someone bought something, or put it back)
  setStock(s: ShopStock | null | undefined) { this.stock = s || {}; if (this.offers) this.render(); },
  // One off the shelf for you: asked of the host; then (it's yours) buy() does the rest, and if that can't (false)
  // it goes back. Sold out by the time it got there: no.
  take(key: string, buy: () => boolean | void) {
    const q = ++this.qn;
    this.pend.set(q, { key, buy });
    G.Net.toHost({ t: 'stake', k: key, q });
  },
  took(q: number, ok: boolean) {
    const p = this.pend.get(q);
    if (!p) return;
    this.pend.delete(q);
    if (!ok) { G.Audio.deny(); G.HUD.toast('', 'Sold out: someone got there first', 1.5); this.render(); return; }
    if (p.buy() === false) G.Net.toHost({ t: 'sgive', k: p.key });
    this.render();
  },
  // enough credits for it (and a word from Vex if not), before asking for it
  afford(price: number) { if (G.Me.credits >= price) return true; G.Audio.deny(); this.quip('broke'); return false; },

  genOffers(level: number, seed: number) {
    const r = G.U.rng(seed), maxTier = Math.min(4, 1 + Math.ceil(level / 2));
    const pickW = <T extends { tier: number; price: number }>(list: T[], n: number): T[] => {
      const pool = list.filter((x) => x.tier >= 1 && x.tier <= maxTier);
      const out: T[] = [];
      while (out.length < n && pool.length) {
        const ws = pool.map((x) => (x.tier === maxTier ? 0.7 : 1) * (x.tier >= 3 ? 0.8 : 1));
        let roll = r() * ws.reduce((a, b) => a + b, 0), i = 0;
        while (roll > ws[i]) { roll -= ws[i]; i++; }
        out.push(pool.splice(Math.min(i, pool.length - 1), 1)[0]);
      }
      return out.sort((a, b) => a.price - b.price);
    };
    const weapons = G.WEAPON_LIST.filter((w) => G.obtainable(w) && !w.caseOnly);
    this.offers = {
      p: pickW(weapons.filter((w) => w.slot === 'p'), 3).map((w) => w.id),
      s: pickW(weapons.filter((w) => w.slot === 's'), 2).map((w) => w.id),
      // kit: five pieces, of different kinds (carrier, plate, helmet, shoulders, pelvis, legs, belt, pack), by rarity
      gear: (() => {
        const all = G.Gear.LIST.filter((d) => ['carrier', 'plate', 'helmet', 'face', 'shoulder', 'groin', 'legs', 'belt', 'pack'].includes(d.kind));
        const out: GDef[] = [];
        for (let i = 0; i < 5; i++) { const d = pickW(all.filter((x) => !out.some((o) => o.kind === x.kind)), 1)[0]; if (d) out.push(d); }
        return out.sort((x, y) => x.price - y.price).map((d) => d.id);
      })(),
      // three standard magazines' worth of something other than ball, for two random calibers
      ammo: [],
      // five kinds of pouch, a few of each (big ones are rarer)
      pouches: (() => {
        const pool = Object.keys(G.Gear.POUCHES), out: { id: string; n: number }[] = [];
        while (out.length < 5 && pool.length) {
          const ws = pool.map((pid) => (G.Gear.POUCHES[pid].w * G.Gear.POUCHES[pid].h >= 4 ? 0.6 : 1));
          let roll = r() * ws.reduce((a, b) => a + b, 0), i = 0;
          while (roll > ws[i] && i < ws.length - 1) { roll -= ws[i]; i++; }
          out.push({ id: pool.splice(i, 1)[0], n: 1 + Math.floor(r() * 3) });
        }
        return out;
      })(),
      // empty magazines for seven guns (any guns, not just yours), a few of each
      // (about half are the gun's standard magazine; the rest a compact, extended, drum... variant)
      mags: pickW(weapons.filter((w) => G.Gear.ammoFor(w).kind === 'mag'), 7).map((w) => {
        const vs = G.Gunsmith.LIST.filter((p) => p.variant && !p.factory && !p.retired && (p.plat === w.id || (p.fam && p.fam === G.MAG_FAMILY[w.id])) && p.tier <= maxTier && p.id !== G.Gunsmith.defaultBuild(w.id).mag);
        const vid = vs.length && r() < 0.5 ? vs[Math.floor(r() * vs.length)].id : G.Gunsmith.defaultBuild(w.id).mag;
        return { id: vid ? w.id + '|' + vid : w.id, n: 1 + Math.floor(r() * 3) };
      }),
    };
    // a carrier with a plate pocket comes with a plate in it, by rarity (soft inserts and steel are common,
    // multi-hit ceramic rare; nothing above what this level's stock could have)
    this.offers.plates = {};
    for (const id of this.offers.gear) {
      const d = G.Gear.DEFS[id];
      if (d.kind !== 'carrier' || !d.plate) continue;
      const odds = G.Gear.LIST.filter((p) => p.kind === 'plate' && p.tier <= maxTier).map((p): [any, number] => [p, ({ 1: 55, 2: 30, 3: 12, 4: 3 })[p.tier] || 1]);
      let x = r() * odds.reduce((s, [, w]) => s + w, 0), pick = odds[0][0];
      for (const [p, w] of odds) { x -= w; if (x <= 0) { pick = p; break; } }
      this.offers.plates[id] = pick.id;
    }
    // a helmet with a mount: about a third come with a mandible or face shield on it, by rarity
    this.offers.faces = {};
    for (const id of this.offers.gear) {
      const d = G.Gear.DEFS[id];
      if (d.kind !== 'helmet' || !d.face || r() >= 0.35) continue;
      const odds = G.Gear.LIST.filter((p) => p.kind === 'face' && p.tier <= maxTier).map((p): [any, number] => [p, ({ 1: 60, 2: 30, 3: 10 })[p.tier] || 1]);
      if (!odds.length) continue;
      let x = r() * odds.reduce((s, [, w]) => s + w, 0), pick = odds[0][0];
      for (const [p, w] of odds) { x -= w; if (x <= 0) { pick = p; break; } }
      this.offers.faces[id] = pick.id;
    }
    // Nightjar's counter (js/hangar.ts NJ): their night vision. Each model that's out by now (its tier, as the rest of the
    // kit's, and lv: the level it's first stocked at), the monocular every visit, the dearer ones most visits.
    // (Rolled last, so the rest of the stock is what it was before there was a Nightjar.)
    this.offers.nvg = G.Gear.LIST.filter((d) => d.kind === 'nvg' && d.tier <= maxTier && level >= (d.lv || 0)).filter((d) => r() < (d.tier <= 2 ? 1 : 0.75)).map((d) => d.id);
    // and the parts only they sell (the thermal riflescope: js/parts.ts seller 'nj'), most visits once it's out
    this.offers.njParts = G.Gunsmith.LIST.filter((p) => p.seller === 'nj' && p.tier <= maxTier).filter(() => r() < 0.8).map((p) => p.id);
  },

  quip(kind: string) {
    const list = G.VENDOR_QUIPS[kind], text = list[Math.floor(Math.random() * list.length)];
    document.getElementById('vendorQuip')!.textContent = '"' + text + '"';
    if (G.Game.hub && kind !== 'hello' && kind !== 'ready') G.HUD.toast('VEX', text, 2);
  },

  // (in the range nothing is bought: your kit there is put back as it was when you leave, js/range.ts, so what you bought would
  // vanish with the money spent on it)
  spend(price: number) {
    if (G.Game.hub && G.Range && G.Range.on()) { G.Audio.deny(); G.HUD.toast('THE RANGE', "Nothing's for sale in here: shop once you're back in the hangar", 2); return false; }
    if (G.Me.credits < price) { G.Audio.deny(); this.quip('broke'); return false; }
    G.Me.credits -= price;
    G.Audio.buy();
    this.quip('buy');
    return true;
  },
  tradeIn(slot: string) { const w = G.Me.weapons[slot]; return w ? Math.floor(w.def.price * 0.25) : 0; },

  buy(kind: string, id: string) {
    const Me = G.Me;
    if (this.ready) return;
    if (kind === 'weapon') {
      const def = G.WEAPONS[id], slot = def.slot;
      if (Me.weapons[slot] && Me.weapons[slot].def.id === id) return;
      if (!this.spend(Math.max(0, def.price - this.tradeIn(slot)))) return;
      const old = Me.weapons[slot];
      if (old) G.Gunsmith.strip(old.def, Me.stash); // aftermarket parts come off and go to your stash
      Me.weapons[slot] = Me.makeWeapon(id);
      if (G.GunAudio.available()) G.GunAudio.buildDry(Me.weapons[slot].def.soundKey);
    } else if (kind === 'gear') {
      const d = G.Gear.DEFS[id], it = G.Gear.gearItem(id), pl = this.offers!.plates && this.offers!.plates[id];
      if (pl) it.plate = G.Gear.gearItem(pl); // fitted with its plate
      const fc = this.offers!.faces && this.offers!.faces[id];
      if (fc) it.face = G.Gear.gearItem(fc); // and a helmet with its face shield
      if (!this.inStock('gear:' + id)) { G.Audio.deny(); return; }
      // straight on if the slot's free, else into the locker
      const free = () => (G.Gear.MOUNTS[d.kind] ? G.Gear.mountFree(Me, d.kind, it) : !Me.kit[d.kind]);
      const fits = () => free() || G.Gear.findSpot(Me.locker, it);
      if (!fits()) { G.HUD.toast('', 'No room in your locker', 1.5); G.Audio.deny(); return; }
      if (!this.afford(this.gearPrice(id))) return;
      this.take('gear:' + id, () => {
        if (!fits() || !this.spend(this.gearPrice(id))) return false;
        if (free()) { if (G.Gear.MOUNTS[d.kind]) G.Gear.mountOn(Me, d.kind)[d.kind] = it; else Me.kit[d.kind] = it; } else G.Gear.place([Me.locker], it);
        if (d.kind === 'nvg') { // (where it went, and why)
          const h = G.Gear.mountOn(Me, 'nvg');
          G.HUD.toast('NIGHTJAR', G.U.esc(d.name) + ': ' + (h && h.nvg === it ? 'on your helmet. <b>N</b> flips it down' : !h ? 'in your locker (no helmet with a shroud on)' : h.nvg ? 'in your locker (your helmet has night vision on it)' : 'in your locker (a full face shield is in the way: swap it for a mandible)'), 3);
        }
        return undefined;
      });
      return;
    } else if (kind === 'ammo') {
      const o = this.offers!.ammo.find((q: ShopAmmo) => q.cal === id), it = (o && G.Gear.boxItem(o.cal, o.am, o.n)) as GItem;
      if (!o || !this.inStock('ammo:' + o.cal) || !this.room(it)) { G.Audio.deny(); return; }
      if (!this.afford(G.Gear.price(it))) return;
      this.take('ammo:' + o.cal, () => { if (!this.room(it) || !this.spend(G.Gear.price(it))) return false; this.stow(it); return undefined; });
      return;
    } else if (kind === 'pouch') {
      // straight onto your rig or belt if there's room, else your locker
      const it = G.Gear.pouchItem(id), P = G.Gear.POUCHES[id];
      if (!P || !this.inStock('pouch:' + id)) { G.Audio.deny(); return; }
      if (!this.room(it)) { G.HUD.toast('', 'No room for it', 1.5); G.Audio.deny(); return; }
      if (!this.afford(P.price)) return;
      this.take('pouch:' + id, () => {
        if (!this.room(it) || !this.spend(P.price)) return false;
        const on = G.Gear.place(G.Gear.molles(Me), it);
        if (!on) G.Gear.place([Me.locker], it);
        G.HUD.toast('', on ? `${P.name} mounted on your MOLLE` : `${P.name} is in your locker`, 1.5);
        return undefined;
      });
      return;
    } else if (kind === 'mag') {
      const [wid, vid] = id.split('|'), def = G.WEAPONS[wid], it = def && G.Gear.ammoItem(def, 0, null as any, vid);
      if (!def || !this.inStock('mag:' + id)) { G.Audio.deny(); return; }
      if (!this.room(it)) { G.HUD.toast('', 'No room for it', 1.5); G.Audio.deny(); return; }
      if (!this.afford(G.Gear.price(it))) return;
      this.take('mag:' + id, () => { if (!this.room(it) || !this.spend(G.Gear.price(it))) return false; this.stow(it); return undefined; });
      return;
    } else if (kind === 'part') {
      const p = G.Gunsmith.PARTS[id];
      if (!p || !this.inStock('part:' + id)) { G.Audio.deny(); return; }
      if (!this.afford(p.price)) return;
      this.take('part:' + id, () => { if (!this.spend(p.price)) return false; Me.stash[id] = (Me.stash[id] || 0) + 1; return undefined; });
      return;
    } else if (kind === 'svc') {
      const s = this.services().find((x: ShopService) => x.id === id);
      if (!s || s.disabled) return;
      if (!this.spend(s.price)) return;
      s.apply();
    }
    this.render();
  },

  // An item bought from supplies: on you if a pouch or pocket takes it, otherwise into the locker.
  stow(it: GItem) {
    const Gr = G.Gear, Me = G.Me;
    Gr.absorb(it, [...Gr.body(Me), Me.locker]); // rounds top up the boxes you have first
    if ((it.k === 'ammo' || it.k === 'med') && it.n <= 0) return true;
    return !!(Gr.place(Gr.body(Me), it) || Gr.place([Me.locker], it));
  },
  room(it: GItem) { const Gr = G.Gear; return Gr.all(G.Me).some((g) => Gr.findSpot(g, it)); },
  services() {
    const Me = G.Me, Gr = G.Gear, out = [];
    // load magazines from the loose rounds you own: free, it's just your time. Which ones: the setting (Settings & controls)
    const kitOnly = !!G.Game.settings.loadKit, { empty, loose } = Gr.loadNeed(Me, kitOnly);
    out.push({ id: 'load', name: 'Load Magazines', desc: `${kitOnly ? 'Top up the magazines for your equipped guns, then those on your kit, and the equipped guns' : 'Top up every magazine you own (and your guns)'} from your loose rounds, same type first. ${loose} loose rounds, ${empty} empty places. <small>(${kitOnly ? 'Equipped and carried only' : 'Everything'}: change it in Settings &amp; controls.)</small>`, price: 0, disabled: !empty || !loose,
      apply: () => Gr.loadAll(Me, kitOnly) });
    // a box of any load for every caliber you own a gun in: the load picked on the card (loadSel), each priced by what
    // it does (G.AMMO k: birdshot under buck, ball, tracer, subsonic, a slug, hollow points, AP, flechettes)
    const cals = [...new Set<string>(Gr.guns(Me).flatMap((w) => G.calsOf(w.def)))];
    this.loadSel = this.loadSel || {};
    for (const cal of cals) {
      const C = G.CALIBERS[cal], types = G.ammoTypes(cal), am = types.includes(this.loadSel[cal]) ? this.loadSel[cal] : types[0], it = Gr.boxItem(cal, am, C.box);
      const gdef = Gr.guns(Me).map((w) => w.def).filter((d) => G.calsOf(d).includes(cal)).map((d) => G.asCal(d, cal))[0], notes = gdef ? G.Ballistics.loadNotes(gdef, am).join(' · ') : '';
      const sel = types.length > 1 ? `<select class="load-sel" data-cal="${cal}">${types.map((t) => `<option value="${t}"${t === am ? ' selected' : ''}>${G.AMMO[t].name} · ¢${G.U.fmt(Gr.price(Gr.boxItem(cal, t, C.box)))}</option>`).join('')}</select>` : '';
      out.push({ id: 'box.' + cal, name: `${C.name} ×${C.box}`, sel, desc: `A box of ${C.box} ${G.AMMO[am].name} (${Gr.size(it).join('×')}). ${G.AMMO[am].desc}${notes ? `<div class="gs-pe">${notes}</div>` : ''}`, price: Gr.price(it), disabled: !this.room(it), apply: () => this.stow(Gr.boxItem(cal, am, C.box)) });
    }
    // (no armour repair: worn armour stays worn, replace it)
    // field medical gear (js/medical.ts): each treats one injury on one part
    for (const [mt, I] of Object.entries<any>(G.Med.ITEMS)) {
      let have = 0; Gr.each(Gr.all(Me), (it) => { if (it.k === 'med' && it.mt === mt) have += it.n || 1; });
      out.push({ id: 'med.' + mt, name: I.name, desc: `${I.desc} ${I.time} s to apply. ${I.size.join('×')}${I.stack ? `, ${I.stack} to a stack` : ''}. You have ${have}.`, price: I.price, disabled: !this.room(Gr.medItem(mt)), apply: () => this.stow(Gr.medItem(mt)) });
    }
    out.push({ id: 'flash', name: 'Flashbang', desc: `Blinds whoever's looking when it goes off, and in a room the glare off the walls and the bang stun everyone in it for a few seconds (1.5 s fuse), hurts nobody: go in at once and they're yours to cuff or talk down. Key ${G.Me.quick.indexOf('flash') >= 0 ? G.Me.quick.indexOf('flash') + 3 : '3, 4 or 5'}. 1×1. You carry ${G.Gear.count(Me, 'flash')}.`, price: 150, disabled: !this.room(Gr.flashItem()), apply: () => this.stow(Gr.flashItem()) });
    const key = (k: string) => G.Me.quick.indexOf(k) >= 0 ? G.Me.quick.indexOf(k) + 3 : '3, 4 or 5';
    out.push({ id: 'nade', name: 'Frag Grenade', desc: `Steel chips over the whole sphere: deadly a few metres out in the open, stopped by walls and cover, and the blast dazes whoever's left in a small room. Pull the pin (left click), R to let the spoon go and cook it, let go to throw. Key ${key('frag')}. 1×1. You carry ${Me.nades}.`, price: 200, disabled: !this.room(Gr.fragItem()), apply: () => this.stow(Gr.fragItem()) });
    out.push({ id: 'tb', name: 'Thermobaric Grenade', desc: `Throws out a cloud of fuel and lights it: a fireball that fills the room it lands in (out through an open door, not a shut one) and a long blast wave that's deadly in a closed room, far weaker in the open or a room with its windows out. Burns and blast, no fragments. ${G.Me.TB.FUSE} s fuse. Key ${key('tb')}. 1×1. You carry ${G.Gear.count(Me, 'tb')}.`, price: 450, disabled: !this.room(Gr.tbItem()), apply: () => this.stow(Gr.tbItem()) });
    return out;
  },

  setReady(v: boolean) {
    this.ready = v;
    G.Net.toHost({ t: 'ready', r: v });
    if (v) this.quip('ready');
    this.render();
  },

  bar(label: string, v: number, txt: string) {
    return `<div class="sbar"><span>${label}</span><div><i style="width:${Math.round(G.U.clamp(v, 0.03, 1) * 100)}%"></i></div><b>${txt}</b></div>`;
  },
  weaponCard(def: WeaponDef) {
    const Me = G.Me, cur = Me.weapons[def.slot], owned = cur && cur.def.id === def.id;
    const price = Math.max(0, def.price - this.tradeIn(def.slot));
    const rpm = def.mode === 'burst' ? (def.burst / ((def.burst * 60) / (def.burstRpm || def.rpm) + 0.24)) * 60 : def.rpm;
    // (what it hits with is physical, js/ballistics.ts: the energy of its round at 10 m with ball)
    const J = G.Ballistics.energy(def), jTxt = def.explosive ? `${def.explosive.dmg} blast` : def.pellets > 1 ? `${G.U.fmt(Math.round(J / def.pellets))} J ×${def.pellets}` : `${G.U.fmt(Math.round(J))} J`;
    const P = !def.explosive && G.Ballistics.projectile(def, G.ballFor(G.calOf(def)));
    return `<div class="card${owned ? ' owned' : ''}">
      <div class="ch"><span class="cn">${def.name}</span><span class="tier" style="color:${G.TIER_COLORS[def.tier]}">${G.TIER_NAMES[def.tier]} ${def.cls}</span></div>
      <div class="cd">${def.desc}</div>
      ${this.bar('ENERGY', def.explosive ? 1 : Math.log10(Math.max(10, J)) / 4, jTxt)}
      ${this.bar('RATE', def.rpm / 1200, def.rpm + ' ' + (def.modes || [def.mode]).map((m: string) => m === 'hyper' ? 'hyper' : m).join('/'))}
      ${this.bar('ACC', 1 - def.ads * 120 / 20, `${+(def.ads * 120).toFixed(1)} MOA`)}
      ${this.bar('RANGE', def.range / 100, def.range + 'm')}
      ${this.bar('MOBIL', (def.speed - 0.65) / 0.45, Math.round(def.speed * 100) + '%')}
      <div class="cfoot"><span>Mag ${Me.magSize(def)}${P ? ` · ${Math.round(P.m * 10000) / 10} g ${({ lead: 'lead', mild: 'steel-cored', hard: 'hard-cored', wc: 'tungsten-cored' } as Record<string, string>)[P.core] || ''} · ${G.U.fmt(Math.round(J * rpm / 60))} J/s` : ''}</span>
      ${owned ? '<button class="btn small" disabled>Equipped</button>' : `<button class="btn small buy" data-k="weapon" data-id="${def.id}" ${Me.credits < price ? 'disabled' : ''}>¢${G.U.fmt(price)}</button>`}</div>
      ${!owned && cur ? `<div class="trade">Trades in your ${cur.def.name} (¢${this.tradeIn(def.slot)})</div>` : ''}
    </div>`;
  },
  // a weapon part from the gunsmith: bought into your stash, fitted in the Gunsmith tab
  partCard(p: Part | null | undefined) {
    if (!p) return '';
    const Me = G.Me, GS = G.Gunsmith, ids = GS.fitsPart(p);
    const yours = ['p', 's'].map((k) => Me.weapons[k]).filter(Boolean)
      .map((w) => `<span class="${ids.includes(w.def.id) ? 'fit-y' : 'fit-n'}">${ids.includes(w.def.id) ? '✓' : '✗'} ${w.def.name}</span>`).join(' ');
    return `<div class="card part${this.wished(p.id) ? ' wished' : ''}">
      <div class="ch"><span class="cn">${this.star(p.id)}${G.U.esc(p.name)}</span><span class="tier">${GS.SLOT_LABEL[p.slot]}</span></div>
      <div class="cd"><small class="brand">${G.U.esc(p.brand)}</small> ${G.U.esc(p.desc || '')}</div>
      <div class="gs-pe">${G.GunsmithUI.partEffects(p, (['p', 's'].map((k) => Me.weapons[k]).filter(Boolean).find((w) => ids.includes(w.def.id)) || { def: { id: null } }).def.id) || ''}</div>
      <div class="fits">Fits: ${G.U.esc(GS.ifaceName(p.mount))} (${ids.length} weapon${ids.length === 1 ? '' : 's'})<br>${yours}</div>
      <div class="cfoot"><span>${(Me.stash || {})[p.id] ? `In stash ×${Me.stash[p.id]}` : 'Goes to your stash'}${this.count('part:' + p.id) > 1 ? ` · ${this.count('part:' + p.id)} in stock` : ''}</span>
      <button class="btn small buy" data-k="part" data-id="${p.id}" ${!this.inStock('part:' + p.id) || Me.credits < p.price ? 'disabled' : ''}>${this.inStock('part:' + p.id) ? '¢' + G.U.fmt(p.price) : 'Sold'}</button></div>
    </div>`;
  },
  // a MOLLE pouch: always in stock
  pouchCard(pid: string) {
    const Me = G.Me, P = G.Gear.POUCHES[pid], it = G.Gear.pouchItem(pid), left = this.count('pouch:' + pid);
    const free = G.Gear.molles(Me).some((g) => G.Gear.findSpot(g, it));
    return `<div class="card pouch">
      <div class="ch"><img class="ci" src="${G.Icons.of(it, P.w, P.h, false)}"><span class="cn">${G.U.esc(P.name)}</span><span class="tier">HOLDS ${P.w}×${P.h} · ${P.mw || P.w}×${P.mh || P.h} MOLLE</span></div>
      <div class="cd"><small class="brand">${G.U.esc(P.brand)}</small> ${G.U.esc(P.desc)}</div>
      <div class="fits">${free ? 'Mounts on your MOLLE' : Me.kit.carrier || Me.kit.belt ? 'No MOLLE room: goes to your locker' : 'Goes to your locker'}</div>
      <div class="cfoot"><span>${left ? left + ' in stock' : 'Sold out'}</span><button class="btn small buy" data-k="pouch" data-id="${pid}" ${!left || Me.credits < P.price ? 'disabled' : ''}>${left ? '¢' + G.U.fmt(P.price) : 'Sold'}</button></div>
    </div>`;
  },
  // empty magazines for a gun
  magCard(key: string) {
    const [wid, vid] = key.split('|'), Me = G.Me, def = G.WEAPONS[wid], a = G.Gear.ammoFor(def), it = G.Gear.ammoItem(def, 0, null as any, vid), price = G.Gear.price(it), left = this.count('mag:' + key);
    const takers = G.Gear.guns(Me).filter((w) => G.magFits(wid, w.def.id)).map((w) => w.def.name), [sw, sh] = G.Gear.size(it), p = G.Gunsmith.PARTS[vid];
    const family = G.magFam(wid) !== wid ? G.WEAPON_LIST.filter((w) => G.magFits(wid, w.id)).map((w) => w.name) : null;
    const fx = p && !p.factory ? G.GunsmithUI.partEffects(p) : 'The standard magazine.';
    return `<div class="card pouch">
      <div class="ch"><img class="ci" src="${G.Icons.of(it, sw, sh, false)}"><span class="cn">${G.U.esc(G.Gear.magName(it))}</span><span class="tier">${a.label} ${sw}×${sh}</span></div>
      <div class="cd">Empty, holds ${it.cap} ${G.CALIBERS[G.calOf(def)].name}. Whichever magazine is in the gun sets its capacity and reload. Load it from a box.</div>
      <div class="gs-pe">${fx}</div>
      <div class="fits">${family ? 'Fits the ' + family.join(', ') + ' · ' : ''}${takers.length ? 'Fits your ' + takers.join(', ') : '<span class="fit-n">None of your guns take it</span>'}</div>
      <div class="cfoot"><span>${left ? left + ' in stock' : 'Sold out'}</span><button class="btn small buy" data-k="mag" data-id="${key}" ${!left || Me.credits < price ? 'disabled' : ''}>${left ? '¢' + G.U.fmt(price) : 'Sold'}</button></div>
    </div>`;
  },
  // the special load in stock this visit
  ammoCard(o: ShopAmmo) {
    const Me = G.Me, A = G.AMMO[o.am], C = G.CALIBERS[o.cal], it = G.Gear.boxItem(o.cal, o.am, o.n), price = G.Gear.price(it);
    const guns = G.Gear.guns(Me).filter((w) => G.calsOf(w.def).includes(o.cal)).map((w) => w.def.name);
    const gdef = Object.values(G.WEAPONS).filter((d) => G.calsOf(d).includes(o.cal)).map((d) => G.asCal(d, o.cal))[0];
    const fx = [...(gdef ? G.Ballistics.loadNotes(gdef, o.am) : []), A.rangeK ? `range ×${A.rangeK}` : '', A.quiet ? 'near-silent suppressed' : '', A.tracer ? 'visible tracer' : '', A.slug ? 'single slug' : '', A.pelletsK ? `pellets ×${A.pelletsK}` : ''].filter(Boolean).join(' · ');
    return `<div class="card ammo">
      <div class="ch"><img class="ci" src="${G.Icons.of(it, ...(G.Gear.size(it) as [number, number]))}"><span class="cn">${C.name} ${A.name}</span><span class="tier">AMMO ×${o.n}</span></div>
      <div class="cd">${G.U.esc(A.desc)}</div>
      <div class="gs-pe">${fx}</div>
      <div class="fits">${guns.length ? 'Fits your ' + guns.join(', ') : '<span class="fit-n">None of your guns take ' + C.name + '</span>'}</div>
      <div class="cfoot"><span>${!this.inStock('ammo:' + o.cal) ? 'Sold out' : this.count('ammo:' + o.cal) > 1 ? this.count('ammo:' + o.cal) + ' handfuls left' : 'A handful, while it lasts'}</span><button class="btn small buy" data-k="ammo" data-id="${o.cal}" ${!this.inStock('ammo:' + o.cal) || Me.credits < price ? 'disabled' : ''}>¢${G.U.fmt(price)}</button></div>
    </div>`;
  },
  // a carrier, rig, plate, helmet or belt from the quartermaster
  // the pouches gear comes with, counted: "3 rifle mag, grenade, IFAK"
  issued(d: GDef) {
    const n: Record<string, number> = {};
    for (const [pid] of d.pouches || []) n[pid] = (n[pid] || 0) + 1;
    const out = Object.entries(n).map(([pid, c]) => (c > 1 ? c + ' × ' : '') + G.Gear.POUCHES[pid].name.replace(/ pouch$/, '').replace(/^[A-Z][a-z]/, (c: string) => c.toLowerCase()));
    return out.length ? out.join(', ') : 'no pouches';
  },
  // which of your guns a backpack would take
  packFits(d: GDef) {
    const [w, h] = d.grids[0], ok = (s: number[]) => (s[0] <= w && s[1] <= h) || (s[1] <= w && s[0] <= h);
    const kinds = [['pistols', 'p9'], ['compact SMGs', 'mp5'], ['rifles and shotguns', 'm4'], ['sniper rifles and LMGs', 'r700']].filter(([, id]) => ok(G.Gear.gunSize(G.WEAPONS[id]))).map(([n]) => n);
    return kinds.length ? 'takes ' + kinds.join(', ') : 'no guns';
  },
  // what a set of night vision shows: its tubes and field, its phosphor
  nvField(d: GDef) {
    const v = d.nv as NvSpec, n = v.tubes.length, w = Math.round(Math.max(...v.tubes.map((t) => t[0] + t[2])) - Math.min(...v.tubes.map((t) => t[0] - t[2]))), h = Math.round(v.tubes[0][2] * 2);
    return `${n === 1 ? 'one tube, one eye' : n === 2 ? 'two tubes, both eyes' : 'four tubes, panoramic'} · ${w === h ? w + '°' : w + '° × ' + h + '°'} · ${v.phos[0] > 0.6 ? 'white' : 'green'} phosphor${v.thermal ? ' · thermal fusion' : ''}`;
  },
  // a piece of kit's price as offered: a carrier's includes the plate fitted in it
  gearPrice(id: string) {
    const pl = this.offers && this.offers.plates && this.offers.plates[id], fc = this.offers && this.offers.faces && this.offers.faces[id];
    return G.Gear.DEFS[id].price + (pl ? G.Gear.DEFS[pl].price : 0) + (fc ? G.Gear.DEFS[fc].price : 0);
  },
  gearCard(d: GDef) {
    const sold = !this.inStock('gear:' + d.id), pl = this.offers && this.offers.plates && G.Gear.DEFS[this.offers.plates[d.id]], price = this.gearPrice(d.id);
    const Me = G.Me;
    const KN: Record<string, string> = { carrier: d.dur ? (d.plate ? 'PLATE CARRIER' : 'SOFT VEST') : 'CHEST RIG', plate: 'PLATE', helmet: 'HELMET', nvg: 'NIGHT VISION', face: d.cover < 0.9 ? 'MANDIBLE' : 'FACE SHIELD', shoulder: 'SHOULDER ARMOUR', groin: 'PELVIS ARMOUR', legs: 'LEG ARMOUR', belt: 'BELT', pack: 'BACKPACK' };
    const fc = this.offers && this.offers.faces && G.Gear.DEFS[this.offers.faces[d.id]];
    const cardIt = G.Gear.gearItem(d.id); if (fc) cardIt.face = G.Gear.gearItem(fc.id); // (its icon shows what's fitted)
    const B = G.Ballistics, L = B.mainLayers(d, pl), rt = L && B.rating(L);
    const ACC: Record<string, string> = { mag: 'mag', frag: 'grenade', med: 'medkit' };
    const pouches = (d.grids || []).map(([w, h, acc]: [number, number, string[]?]) => `${w}×${h}${acc ? ' ' + ACC[acc[0]] : ''}`);
    let body = '';
    // what it's made of, and what that stops head-on (worked out, js/ballistics.ts rating; a carrier with its plate: the plate's)
    if (L) body += `<div class="arm-rate"><small>${G.U.esc(B.layersText(L))}</small><div><b>Stops</b> ${rt.stops.length ? rt.stops.join(', ') : 'nothing'}</div><div class="fit-n"><b>Not</b> ${rt.fails.slice(0, 5).join(', ')}${rt.fails.length > 5 ? '…' : ''}</div></div>`;
    if (d.dur) body += this.bar('DURAB', d.dur / 9, d.dur + ' pts');
    body += this.bar('MOBIL', (d.speed - 0.85) / 0.15, Math.round(d.speed * 1000) / 10 + '%');
    const foot = [d.prot && d.prot.length ? 'Covers ' + [...new Set(d.prot.map((p: { at: string }) => B.AT_NAME[p.at] || p.at))].join(', ') : '', d.plate ? (pl ? `Fitted with <b style="color:${G.TIER_COLORS[pl.tier]}">${G.U.esc(pl.name)}</b> (${G.TIER_NAMES[pl.tier]}, ¢${G.U.fmt(pl.price)} of the price)` : 'Plate pocket') : '', pouches.length ? 'Holds ' + pouches.join(', ') + ': ' + this.packFits(d) : '', d.molle ? `MOLLE ${d.molle[0]}×${d.molle[1]}, issued with ${this.issued(d)}` : '',
      d.kind === 'helmet' && d.face ? (fc ? `Fitted with <b style="color:${G.TIER_COLORS[fc.tier]}">${G.U.esc(fc.name)}</b> (${G.TIER_NAMES[fc.tier]}, ¢${G.U.fmt(fc.price)} of the price)` : 'Mount for a face shield or mandible') : '',
      d.kind === 'face' ? `Fits helmets with a mount · in the way of ${Math.round((d.cover || 1) * 100)}% of face hits · <b>helmet not included</b>` : '',
      d.kind === 'nvg' ? `${this.nvField(d)} · fits a helmet's shroud, not with a full face shield · <b>helmet not included</b>` : '',
      d.kind === 'helmet' && d.nvg ? 'Shroud for night vision' : '',
      d.kind === 'plate' ? '<b>Carrier not included</b>: it goes in a plate carrier\'s pocket' : '',
      d.kind === 'shoulder' || d.kind === 'groin' ? '<b>Carrier not included</b>: it fits a plate carrier\'s mounts' : '', d.kind === 'legs' ? '<b>Belt not included</b>: it hangs from a battle belt or war belt' : '',
      d.kind === 'carrier' && (d.shoulder || d.groin) ? 'Mounts for shoulder and pelvis armour' : '', d.kind === 'belt' && d.legs ? 'Hangers for leg armour' : ''].filter(Boolean).join(' · ');
    return `<div class="card gear">
      <div class="ch"><img class="ci" src="${G.Icons.of(cardIt, ...(G.Gear.size(cardIt) as [number, number]))}"><span class="cn">${G.U.esc(d.name)}</span><span class="tier" style="color:${G.TIER_COLORS[d.tier]}">${G.TIER_NAMES[d.tier]} ${KN[d.kind]}</span></div>
      <div class="cd"><small class="brand">${G.U.esc(d.brand)}</small> ${G.U.esc(d.desc)}</div>
      ${body}
      <div class="fits">${foot}</div>
      <div class="cfoot"><span>${sold ? 'Sold out' : 'Only one in stock'}</span><button class="btn small buy" data-k="gear" data-id="${d.id}" ${sold || Me.credits < price ? 'disabled' : ''}>${sold ? 'Sold' : '¢' + G.U.fmt(price)}</button></div>
    </div>`;
  },

  render() {
    if (G.InvUI.scaleUI) G.InvUI.scaleUI(); // (the shop's sizes scale with the window too: --ik)
    if (!this.offers) return;
    const Me = G.Me;
    document.getElementById('shopCredits')!.textContent = '¢ ' + G.U.fmt(Me.credits);
    const rp = this.report;
    const rep = rp ? `<div class="report">${rp.arrests} arrested · ${rp.incap || 0} incapacitated${rp.bleedouts ? ` (${rp.bleedouts} bled out)` : ''} · ${rp.rescued} civilians secured · ${rp.evidence || 0} weapons bagged · ${rp.bodies || 0} bodies secured` +
      (rp.civKilled ? ` · <b class="red">${rp.civKilled} civilian casualties</b>` : '') + (rp.unauth ? ` · <b class="red">${rp.unauth} unauthorised kills</b>` : '') +
      (!rp.civKilled && !rp.unauth ? ' · <b class="go">clean op +¢200</b>' : '') + (rp.stronghold ? ` · <b class="go">stronghold cleared +¢${G.Route.strongholdPay(this.level)}</b>` : '') + (rp.allRescued ? ` · <b class="go">every civilian rescued +¢${150 + 50 * this.level}</b>` : '') + '</div>' : '';
    document.getElementById('shopTitle')!.innerHTML = `Level ${this.level} cleared <span>— next up: level ${this.level + 1}${G.Route.isBoss(this.level + 1) ? ' <b class="red">(BOSS)</b>' : ''}</span>${rep}`;
    const tabs = [['stock', 'Stock'], ['kit', 'Kit'], ['gunsmith', 'Gunsmith'], ['zero', 'Zeroing'], ['svc', 'Supplies']];
    document.getElementById('shopTabs')!.innerHTML = tabs.map(([k, n]) => `<button class="tab${this.tab === k ? ' on' : ''}" data-tab="${k}">${n}</button>`).join('');
    let html = '';
    const O = this.offers;
    if (this.tab === 'stock') html = O.ammo.map((o: ShopAmmo) => this.ammoCard(o)).join('') + O.gear.map((id: string) => this.gearCard(G.Gear.DEFS[id])).join('') +
      [...(this.partStock || [])].sort((a, b) => +this.wished(b as string) - +this.wished(a as string)).map((id) => this.partCard(G.Gunsmith.PARTS[id as string])).join('') +
      ((O.nvg || []).length || (O.njParts || []).length ? `<h3 class="shop-sub">Nightjar Optronics · night vision and thermal</h3>` + (O.nvg || []).map((id: string) => this.gearCard(G.Gear.DEFS[id])).join('') + (O.njParts || []).map((id: string) => this.partCard(G.Gunsmith.PARTS[id])).join('') : '') +
      `<h3 class="shop-sub">Pouches and magazines</h3>` + O.pouches.map((o: { id: string }) => this.pouchCard(o.id)).join('') + O.mags.map((o: { id: string }) => this.magCard(o.id)).join('');
    else if (this.tab === 'svc') html = this.services().map((s: ShopService) => `<div class="card">
        <div class="ch"><span class="cn">${s.name}</span></div>${s.sel || ''}<div class="cd">${s.desc}</div>
        <div class="cfoot"><span></span><button class="btn small buy" data-k="svc" data-id="${s.id}" ${s.disabled || Me.credits < s.price ? 'disabled' : ''}>${s.disabled ? '—' : '¢' + G.U.fmt(s.price)}</button></div></div>`).join('');
    const items = document.getElementById('shopItems')!;
    if (this.tab === 'gunsmith') { G.InvUI.hide(); G.GunsmithUI.show(items); }
    else if (this.tab === 'kit') { G.GunsmithUI.hide(); G.InvUI.show(items); }
    else if (this.tab === 'zero') { G.GunsmithUI.hide(); G.InvUI.hide(); G.ZeroUI.show(items); }
    else { G.GunsmithUI.hide(); G.InvUI.hide(); items.innerHTML = html; }
    items.classList.toggle('locked', this.ready);

    const kitName = (it: GItem | null | undefined) => (it ? G.U.esc(G.Gear.defOf(it)!.name) : '—');
    const wline = (w: GWeapon) => `<div class="lo"><span style="color:${G.TIER_COLORS[w.def.tier]}">${w.def.name}${w.def.modified ? ' <small>CUSTOM</small>' : ''}${w.sup ? ' <small>SUPP</small>' : ''}</span><small>${w.mag}${w.chamber ? '+1' : ''}/${Me.magSize(w)}</small></div>`; // (between levels: the count)
    document.getElementById('shopLoadout')!.innerHTML =
      (Me.weapons.p ? wline(Me.weapons.p) : '<div class="lo"><span>No primary</span></div>') + (Me.weapons.s ? wline(Me.weapons.s) : '<div class="lo"><span>No sidearm</span></div>') +
      G.Gear.packGuns(Me).map(([it]) => wline(it.w).replace('<div class="lo">', '<div class="lo"><small>PACK</small> ')).join('') +
      `<div class="lo"><span>${kitName(Me.kit.carrier)}${Me.kit.carrier && Me.kit.carrier.plate ? ' + ' + kitName(Me.kit.carrier.plate) : ''}</span><small>${Me.kit.carrier ? Math.round(Me.vestCond() * 100) + '%' : ''}</small></div>` +
      `<div class="lo"><span>${kitName(Me.kit.helmet)}</span><small>${Me.kit.helmet ? Math.round(Me.helmCond() * 100) + '%' : ''}</small></div>` +
      `<div class="lo"><span>Frags ${Me.nades} · Medical items ${Me.meds}</span></div>`;
    let roster = '';
    for (const [id, p] of Object.entries(G.Game.roster)) {
      roster += `<div class="lo"><span style="color:${G.U.hex(p.color)}">${G.Callsigns.html(p.animal)}${G.U.esc(p.name)}${id === G.Net.myId ? ' (you)' : ''}</span><small class="${p.ready ? 'rdy' : ''}">${p.ready ? 'READY' : 'shopping'}</small></div>`;
    }
    document.getElementById('shopRoster')!.innerHTML = roster;
    const rb = document.getElementById('btnReady')!;
    if (G.Game.hub) { rb.textContent = 'Back to the hangar'; rb.classList.add('primary'); } // (readying up is the helicopter's)
    else { rb.textContent = this.ready ? 'Not ready' : 'Ready up'; rb.classList.toggle('primary', !this.ready); }
    if (G.Game.hub && G.Hangar.S.root) G.Hangar.refresh(); // (what's on the shelves follows what's in stock)
  },

  bind() {
    document.getElementById('shopTabs')!.addEventListener('click', (e) => {
      const t = (e.target as Element).closest<HTMLElement>('[data-tab]');
      if (t) { this.tab = t.dataset.tab!; G.Audio.click(); this.render(); }
    });
    const items = document.getElementById('shopItems')!;
    items.addEventListener('click', (e) => {
      if (this.tab === 'gunsmith') return G.GunsmithUI.onClick(e);
      if (this.tab === 'zero') return G.ZeroUI.onClick(e);
      const wb = (e.target as Element).closest<HTMLElement>('[data-wish]');
      if (wb) { this.toggleWish(wb.dataset.wish!); G.Audio.click(); this.render(); return; }
      const b = (e.target as Element).closest<HTMLButtonElement>('.buy');
      if (b && !b.disabled) this.buy(b.dataset.k!, b.dataset.id!);
    });
    items.addEventListener('mouseover', (e) => { if (this.tab === 'gunsmith') G.GunsmithUI.onHover(e); });
    items.addEventListener('change', (e) => { if (this.tab === 'gunsmith') G.GunsmithUI.onChange(e); });
    items.addEventListener('change', (e) => { const s = (e.target as Element).closest<HTMLSelectElement>('.load-sel'); if (s) { this.loadSel[s.dataset.cal!] = s.value; G.Audio.click(); this.render(); } }); // (the load a box on Supplies is of)
    document.getElementById('btnReady')!.addEventListener('click', () => (G.Game.hub ? G.Game.closeShop() : this.setReady(!this.ready)));
  },

  portrait() {
    return `<svg viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg">
      <defs><radialGradient id="vg" cx="50%" cy="40%" r="60%"><stop offset="0" stop-color="#3a3226"/><stop offset="1" stop-color="#121010"/></radialGradient></defs>
      <rect width="200" height="200" fill="url(#vg)"/>
      <path d="M30 200 C35 150 60 130 100 128 C140 130 165 150 170 200 Z" fill="#2b2a24"/>
      <path d="M60 200 L75 150 L100 160 L125 150 L140 200 Z" fill="#4a4433"/>
      <rect x="92" y="150" width="16" height="50" fill="#6b5a32"/>
      <path d="M52 95 C50 45 150 45 148 95 L150 130 C130 145 70 145 50 130 Z" fill="#1d1c18"/>
      <ellipse cx="100" cy="98" rx="38" ry="40" fill="#8a6e55"/>
      <path d="M58 92 C60 60 140 60 142 92 L142 82 C138 50 62 50 58 82 Z" fill="#1d1c18"/>
      <rect x="62" y="84" width="76" height="22" rx="10" fill="#1a1a1a"/>
      <circle cx="82" cy="95" r="10" fill="#ff9a2e"/><circle cx="118" cy="95" r="10" fill="#ff9a2e"/>
      <circle cx="82" cy="95" r="5" fill="#fff3c4"/><circle cx="118" cy="95" r="5" fill="#fff3c4"/>
      <path d="M78 118 Q100 128 122 118 L120 136 Q100 144 80 136 Z" fill="#3b3b36"/>
      <circle cx="90" cy="128" r="3" fill="#222"/><circle cx="100" cy="130" r="3" fill="#222"/><circle cx="110" cy="128" r="3" fill="#222"/>
      <path d="M60 160 L80 150" stroke="#c9a227" stroke-width="5"/>
    </svg>`;
  },
};
G.Shop = G_Shop;
window.addEventListener('gunicons', () => { const el = document.getElementById('shop'); if (el && !el.classList.contains('hidden') && G_Shop.offers) G_Shop.render(); }); // (a gun's picture came in after the screen was drawn: js/icons.ts)
interface GameModules { Shop: typeof G_Shop; }
