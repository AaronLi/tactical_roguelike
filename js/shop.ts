'use strict';
// Vex the quartermaster's side that is reckoning, not screen (the screen is js/shopui.ts): what he stocks this visit (genOffers, from
// the level and the seed, so the whole squad sees the same shelves), the squad's shared count of it (baseStock, scaleStock: the host's
// js/server.ts takes it from here), what each piece of kit sells for, and the wishlist. Nothing here touches the page, so the server's
// thread loads it.
const G_Shop = {
  offers: null as ShopOffers | null,
  // (what it gets as the shop opens: this visit's level, stock and the gunsmith's parts, js/shopui.ts open)
  level: undefined as unknown as number,
  stock: undefined as unknown as ShopStock,
  partStock: undefined as unknown as ReturnType<typeof G.Gunsmith.rollStock>,
  precStock: undefined as unknown as ReturnType<typeof G.Gunsmith.rollPrecision>,

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
  // the starred parts on the shelves right now (the gunsmith's and Timberline's showcase), by name
  wishInStock(): string[] {
    const ids = new Set<string>([...(this.partStock || []), ...(this.precStock || [])] as string[]);
    return [...ids].filter((id) => this.wished(id) && this.inStock('part:' + id) && G.Gunsmith.PARTS[id]).map((id) => G.Gunsmith.PARTS[id].name);
  },
  count(key: string) { return (this.stock && this.stock[key]) || 0; },
  inStock(key: string) { return this.count(key) > 0; },

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
  // a piece of kit's price as offered: a carrier's includes the plate fitted in it
  gearPrice(id: string) {
    const pl = this.offers && this.offers.plates && this.offers.plates[id], fc = this.offers && this.offers.faces && this.offers.faces[id];
    return G.Gear.DEFS[id].price + (pl ? G.Gear.DEFS[pl].price : 0) + (fc ? G.Gear.DEFS[fc].price : 0);
  },
};
G.Shop = G_Shop;
interface GameModules { Shop: typeof G_Shop; }
