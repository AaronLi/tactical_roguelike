'use strict';
import { ReplayEnv } from './replayenv.js';
import { Audio } from './audio.js';
import { Ballistics } from './ballistics.js';
import { Callsigns } from './callsigns.js';
import { AMMO, ammoTypes, asCal, ballFor, CALIBERS, calOf, calsOf, magFam, magFits, THEMES, TIER_COLORS, TIER_NAMES, VENDOR_QUIPS, WEAPON_LIST, WEAPONS } from './data.js';
import { Gear } from './gear.js';
import { GunAudio } from './gunaudio.js';
import { HUD } from './hud.js';
import { Icons } from './icons.js';
import { Med } from './medical.js';
import { Gunsmith } from './parts.js';
import { Shop } from './shop.js';
import { U } from './util.js';
import { Career } from './career.js';
import { GunsmithUI } from './gunsmith.js';
import { Hangar } from './hangar.js';
import { InvUI } from './invui.js';
import { Net } from './net.js';
import { Range } from './range.js';
import { Route } from './route.js';
import { ZeroUI } from './zeroing.js';
import { Game } from './game.js';
import { Me as G_Me } from './player.js';
// a purchase waiting on the host's say-so (take / took)
interface ShopPending { key: string; buy: () => boolean | void; }
// the level's report (js/game.ts shop)
interface ShopReport { arrests?: number; incap?: number; bleedouts?: number; rescued?: number; evidence?: number; bodies?: number; civKilled?: number; unauth?: number; allRescued?: boolean; stronghold?: boolean; }
// a thing on the Supplies tab (services())
interface ShopService { id: string; name: string; desc: string; price: number; disabled: boolean; apply: () => unknown; sel?: string; }
// Vex's screen: the shop's tabs, its cards, buying and the squad's ready-up. What he stocks and the stock's count are js/shop.ts (G.Shop),
// which the server's thread loads too; this is the page's.
export const ShopUI = {
  tab: 'stock',
  ready: false,
  loadSel: undefined as unknown as Record<string, string>,
  title: undefined as unknown as string | null,
  report: undefined as unknown as ShopReport | null,
  pend: undefined as unknown as Map<number, ShopPending>,
  qn: undefined as unknown as number,

  open(level: number, seed: number, stock?: ShopStock | null) {
    Shop.level = level;
    this.ready = false;
    Shop.genOffers(level, seed);
    Shop.partStock = Gunsmith.rollStock(level, seed); // the gunsmith's parts this visit (same for the whole squad)
    Shop.precStock = Gunsmith.rollPrecision(level, seed); // and the precision showcase's (js/hangar.ts)
    // the shared stock: the host's count when it's come, until then what it starts at (the same reckoning the host's)
    Shop.stock = stock || Shop.scaleStock(Shop.baseStock(level, seed), Object.keys(Game.roster || {}).length || 1);
    this.pend = new Map(); this.qn = 0;
    document.getElementById('vendorArt')!.innerHTML = this.portrait();
    this.quip('hello');
    this.render();
  },

  // the star on a part: lit when it's on the wishlist
  star(id: string) { const on = Shop.wished(id); return `<button class="wish${on ? ' on' : ''}" data-wish="${id}" title="${on ? 'On your wishlist (click to remove)' : 'Add to your wishlist (you are told when it is in the store)'}">${on ? '★' : '☆'}</button>`; },
  // told when a visit's stock has starred parts in it (the hangar's welcome, js/game.ts)
  wishNotice() {
    const n = Shop.wishInStock();
    if (n.length) HUD.toast('★ ON YOUR WISHLIST, IN STOCK', U.esc(n.slice(0, 4).join(', ')) + (n.length > 4 ? ` and ${n.length - 4} more` : ''), 6);
  },
  // the host's count, whenever it changes (someone bought something, or put it back)
  setStock(s: ShopStock | null | undefined) { Shop.stock = s || {}; if (Shop.offers) this.render(); },
  // One off the shelf for you: asked of the host; then (it's yours) buy() does the rest, and if that can't (false)
  // it goes back. Sold out by the time it got there: no.
  take(key: string, buy: () => boolean | void) {
    const q = ++this.qn;
    this.pend.set(q, { key, buy });
    Net.toHost({ t: 'stake', k: key, q });
  },
  took(q: number, ok: boolean) {
    const p = this.pend.get(q);
    if (!p) return;
    this.pend.delete(q);
    if (!ok) { Audio.deny(); HUD.toast('', 'Sold out: someone got there first', 1.5); this.render(); return; }
    if (p.buy() === false) Net.toHost({ t: 'sgive', k: p.key });
    this.render();
  },
  // enough credits for it (and a word from Vex if not), before asking for it
  afford(price: number) { if (G_Me.credits >= price) return true; Audio.deny(); this.quip('broke'); return false; },


  quip(kind: string) {
    const list = VENDOR_QUIPS[kind], text = list[Math.floor(Math.random() * list.length)];
    document.getElementById('vendorQuip')!.textContent = '"' + text + '"';
    if (Game.hub && kind !== 'hello' && kind !== 'ready') HUD.toast('VEX', text, 2);
  },

  // (in the range nothing is bought: your kit there is put back as it was when you leave, js/range.ts, so what you bought would
  // vanish with the money spent on it)
  spend(price: number) {
    if (Game.hub && Range && Range.on()) { Audio.deny(); HUD.toast('THE RANGE', "Nothing's for sale in here: shop once you're back in the hangar", 2); return false; }
    if (G_Me.credits < price) { Audio.deny(); this.quip('broke'); return false; }
    G_Me.credits -= price;
    Audio.buy();
    this.quip('buy');
    return true;
  },
  tradeIn(slot: string) { const w = G_Me.weapons[slot]; return w ? Math.floor(w.def.price * 0.25) : 0; },

  buy(kind: string, id: string) {
    const Me = G_Me;
    if (this.ready) return;
    if (kind === 'weapon') {
      const def = WEAPONS[id], slot = def.slot;
      if (Me.weapons[slot] && Me.weapons[slot].def.id === id) return;
      if (!this.spend(Math.max(0, def.price - this.tradeIn(slot)))) return;
      const old = Me.weapons[slot];
      if (old) Gunsmith.strip(old.def, Me.stash); // aftermarket parts come off and go to your stash
      Me.weapons[slot] = Me.makeWeapon(id);
      if (GunAudio.available()) GunAudio.buildDry(Me.weapons[slot].def.soundKey);
    } else if (kind === 'gear') {
      const d = Gear.DEFS[id], it = Gear.gearItem(id), pl = Shop.offers!.plates && Shop.offers!.plates[id];
      if (pl) it.plate = Gear.gearItem(pl); // fitted with its plate
      const fc = Shop.offers!.faces && Shop.offers!.faces[id];
      if (fc) it.face = Gear.gearItem(fc); // and a helmet with its face shield
      if (!Shop.inStock('gear:' + id)) { Audio.deny(); return; }
      // straight on if the slot's free, else into the locker
      const free = () => (Gear.MOUNTS[d.kind] ? Gear.mountFree(Me, d.kind, it) : !Me.kit[d.kind]);
      const fits = () => free() || Gear.findSpot(Me.locker, it);
      if (!fits()) { HUD.toast('', 'No room in your locker', 1.5); Audio.deny(); return; }
      if (!this.afford(Shop.gearPrice(id))) return;
      this.take('gear:' + id, () => {
        if (!fits() || !this.spend(Shop.gearPrice(id))) return false;
        if (free()) { if (Gear.MOUNTS[d.kind]) Gear.mountOn(Me, d.kind)[d.kind] = it; else Me.kit[d.kind] = it; } else Gear.place([Me.locker], it);
        if (d.kind === 'nvg') { // (where it went, and why)
          const h = Gear.mountOn(Me, 'nvg');
          HUD.toast('NIGHTJAR', U.esc(d.name) + ': ' + (h && h.nvg === it ? 'on your helmet. <b>N</b> flips it down' : !h ? 'in your locker (no helmet with a shroud on)' : h.nvg ? 'in your locker (your helmet has night vision on it)' : 'in your locker (a full face shield is in the way: swap it for a mandible)'), 3);
        }
        return undefined;
      });
      return;
    } else if (kind === 'ammo') {
      const o = Shop.offers!.ammo.find((q: ShopAmmo) => q.cal === id), it = (o && Gear.boxItem(o.cal, o.am, o.n)) as GItem;
      if (!o || !Shop.inStock('ammo:' + o.cal) || !this.room(it)) { Audio.deny(); return; }
      if (!this.afford(Gear.price(it))) return;
      this.take('ammo:' + o.cal, () => { if (!this.room(it) || !this.spend(Gear.price(it))) return false; this.stow(it); return undefined; });
      return;
    } else if (kind === 'pouch') {
      // straight onto your rig or belt if there's room, else your locker
      const it = Gear.pouchItem(id), P = Gear.POUCHES[id];
      if (!P || !Shop.inStock('pouch:' + id)) { Audio.deny(); return; }
      if (!this.room(it)) { HUD.toast('', 'No room for it', 1.5); Audio.deny(); return; }
      if (!this.afford(P.price)) return;
      this.take('pouch:' + id, () => {
        if (!this.room(it) || !this.spend(P.price)) return false;
        const on = Gear.place(Gear.molles(Me), it);
        if (!on) Gear.place([Me.locker], it);
        HUD.toast('', on ? `${P.name} mounted on your MOLLE` : `${P.name} is in your locker`, 1.5);
        return undefined;
      });
      return;
    } else if (kind === 'mag') {
      const [wid, vid] = id.split('|'), def = WEAPONS[wid], it = def && Gear.ammoItem(def, 0, null as any, vid);
      if (!def || !Shop.inStock('mag:' + id)) { Audio.deny(); return; }
      if (!this.room(it)) { HUD.toast('', 'No room for it', 1.5); Audio.deny(); return; }
      if (!this.afford(Gear.price(it))) return;
      this.take('mag:' + id, () => { if (!this.room(it) || !this.spend(Gear.price(it))) return false; this.stow(it); return undefined; });
      return;
    } else if (kind === 'part') {
      const p = Gunsmith.PARTS[id];
      if (!p || !Shop.inStock('part:' + id)) { Audio.deny(); return; }
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
    const Gr = Gear, Me = G_Me;
    Gr.absorb(it, [...Gr.body(Me), Me.locker]); // rounds top up the boxes you have first
    if ((it.k === 'ammo' || it.k === 'med') && it.n <= 0) return true;
    return !!(Gr.place(Gr.body(Me), it) || Gr.place([Me.locker], it));
  },
  room(it: GItem) { const Gr = Gear; return Gr.all(G_Me).some((g) => Gr.findSpot(g, it)); },
  services() {
    const Me = G_Me, Gr = Gear, out = [];
    // load magazines from the loose rounds you own: free, it's just your time. Which ones: the setting (Settings & controls)
    const kitOnly = !!Game.settings.loadKit, { empty, loose } = Gr.loadNeed(Me, kitOnly);
    out.push({ id: 'load', name: 'Load Magazines', desc: `${kitOnly ? 'Top up the magazines for your equipped guns, then those on your kit, and the equipped guns' : 'Top up every magazine you own (and your guns)'} from your loose rounds, same type first. ${loose} loose rounds, ${empty} empty places. <small>(${kitOnly ? 'Equipped and carried only' : 'Everything'}: change it in Settings &amp; controls.)</small>`, price: 0, disabled: !empty || !loose,
      apply: () => Gr.loadAll(Me, kitOnly) });
    // a box of any load for every caliber you own a gun in: the load picked on the card (loadSel), each priced by what
    // it does (G.AMMO k: birdshot under buck, ball, tracer, subsonic, a slug, hollow points, AP, flechettes)
    const cals = [...new Set<string>(Gr.guns(Me).flatMap((w) => calsOf(w.def)))];
    this.loadSel = this.loadSel || {};
    for (const cal of cals) {
      const C = CALIBERS[cal], types = ammoTypes(cal), am = types.includes(this.loadSel[cal]) ? this.loadSel[cal] : types[0], it = Gr.boxItem(cal, am, C.box);
      const gdef = Gr.guns(Me).map((w) => w.def).filter((d) => calsOf(d).includes(cal)).map((d) => asCal(d, cal))[0], notes = gdef ? Ballistics.loadNotes(gdef, am).join(' · ') : '';
      const sel = types.length > 1 ? `<select class="load-sel" data-cal="${cal}">${types.map((t) => `<option value="${t}"${t === am ? ' selected' : ''}>${AMMO[t].name} · ¢${U.fmt(Gr.price(Gr.boxItem(cal, t, C.box)))}</option>`).join('')}</select>` : '';
      out.push({ id: 'box.' + cal, name: `${C.name} ×${C.box}`, sel, desc: `A box of ${C.box} ${AMMO[am].name} (${Gr.size(it).join('×')}). ${AMMO[am].desc}${notes ? `<div class="gs-pe">${notes}</div>` : ''}`, price: Gr.price(it), disabled: !this.room(it), apply: () => this.stow(Gr.boxItem(cal, am, C.box)) });
    }
    // (no armour repair: worn armour stays worn, replace it)
    // field medical gear (js/medical.ts): each treats one injury on one part
    for (const [mt, I] of Object.entries<any>(Med.ITEMS)) {
      let have = 0; Gr.each(Gr.all(Me), (it) => { if (it.k === 'med' && it.mt === mt) have += it.n || 1; });
      out.push({ id: 'med.' + mt, name: I.name, desc: `${I.desc} ${I.time} s to apply. ${I.size.join('×')}${I.stack ? `, ${I.stack} to a stack` : ''}. You have ${have}.`, price: I.price, disabled: !this.room(Gr.medItem(mt)), apply: () => this.stow(Gr.medItem(mt)) });
    }
    out.push({ id: 'flash', name: 'Flashbang', desc: `Blinds whoever's looking when it goes off, and in a room the glare off the walls and the bang stun everyone in it for a few seconds (1.5 s fuse), hurts nobody: go in at once and they're yours to cuff or talk down. Key ${G_Me.quick.indexOf('flash') >= 0 ? G_Me.quick.indexOf('flash') + 3 : '3, 4 or 5'}. 1×1. You carry ${Gear.count(Me, 'flash')}.`, price: 150, disabled: !this.room(Gr.flashItem()), apply: () => this.stow(Gr.flashItem()) });
    const key = (k: string) => G_Me.quick.indexOf(k) >= 0 ? G_Me.quick.indexOf(k) + 3 : '3, 4 or 5';
    out.push({ id: 'nade', name: 'Frag Grenade', desc: `Steel chips over the whole sphere: deadly a few metres out in the open, stopped by walls and cover, and the blast dazes whoever's left in a small room. Pull the pin (left click), R to let the spoon go and cook it, let go to throw. Key ${key('frag')}. 1×1. You carry ${Me.nades}.`, price: 200, disabled: !this.room(Gr.fragItem()), apply: () => this.stow(Gr.fragItem()) });
    out.push({ id: 'sticky', name: 'Sticky Grenade', desc: `Holds to the first thing it hits, a wall, a door or a person, and goes off ${G_Me.STICKY.FUSE} s later (no cooking it: the fuse starts as it sticks). A few heavy cubes of hardened steel rather than a frag's many chips: fewer reach anyone further out, but each goes through soft armour and thin walls (not a rifle plate). Key ${key('sticky')}. 1×1. You carry ${Gear.count(Me, 'sticky')}.`, price: 350, disabled: !this.room(Gr.stickyItem()), apply: () => this.stow(Gr.stickyItem()) });
    out.push({ id: 'tb', name: 'Thermobaric Grenade', desc: `Throws out a cloud of fuel and lights it: a fireball that fills the room it lands in (out through an open door, not a shut one) and a long blast wave that's deadly in a closed room, far weaker in the open or a room with its windows out. Burns and blast, no fragments. ${G_Me.TB.FUSE} s fuse. Key ${key('tb')}. 1×1. You carry ${Gear.count(Me, 'tb')}.`, price: 450, disabled: !this.room(Gr.tbItem()), apply: () => this.stow(Gr.tbItem()) });
    return out;
  },

  setReady(v: boolean) {
    this.ready = v;
    Net.toHost({ t: 'ready', r: v });
    if (v) this.quip('ready');
    this.render();
  },

  bar(label: string, v: number, txt: string) {
    return `<div class="sbar"><span>${label}</span><div><i style="width:${Math.round(U.clamp(v, 0.03, 1) * 100)}%"></i></div><b>${txt}</b></div>`;
  },
  weaponCard(def: WeaponDef) {
    const Me = G_Me, cur = Me.weapons[def.slot], owned = cur && cur.def.id === def.id;
    const price = Math.max(0, def.price - this.tradeIn(def.slot));
    const rpm = def.mode === 'burst' ? (def.burst / ((def.burst * 60) / (def.burstRpm || def.rpm) + 0.24)) * 60 : def.rpm;
    // (what it hits with is physical, js/ballistics.ts: the energy of its round at 10 m with ball)
    const J = Ballistics.energy(def), jTxt = def.explosive ? `${def.explosive.dmg} blast` : def.pellets > 1 ? `${U.fmt(Math.round(J / def.pellets))} J ×${def.pellets}` : `${U.fmt(Math.round(J))} J`;
    const P = !def.explosive && Ballistics.projectile(def, ballFor(calOf(def)));
    return `<div class="card${owned ? ' owned' : ''}">
      <div class="ch"><span class="cn">${def.name}</span><span class="tier" style="color:${TIER_COLORS[def.tier]}">${TIER_NAMES[def.tier]} ${def.cls}</span></div>
      <div class="cd">${def.desc}</div>
      ${this.bar('ENERGY', def.explosive ? 1 : Math.log10(Math.max(10, J)) / 4, jTxt)}
      ${this.bar('RATE', def.rpm / 1200, def.rpm + ' ' + (def.modes || [def.mode]).map((m: string) => m === 'hyper' ? 'hyper' : m).join('/'))}
      ${this.bar('ACC', 1 - def.ads * 120 / 20, `${+(def.ads * 120).toFixed(1)} MOA`)}
      ${this.bar('RANGE', def.range / 100, def.range + 'm')}
      ${this.bar('MOBIL', (def.speed - 0.65) / 0.45, Math.round(def.speed * 100) + '%')}
      <div class="cfoot"><span>Mag ${Me.magSize(def)}${P ? ` · ${Math.round(P.m * 10000) / 10} g ${({ lead: 'lead', mild: 'steel-cored', hard: 'hard-cored', wc: 'tungsten-cored' } as Record<string, string>)[P.core] || ''} · ${U.fmt(Math.round(J * rpm / 60))} J/s` : ''}</span>
      ${owned ? '<button class="btn small" disabled>Equipped</button>' : `<button class="btn small buy" data-k="weapon" data-id="${def.id}" ${Me.credits < price ? 'disabled' : ''}>¢${U.fmt(price)}</button>`}</div>
      ${!owned && cur ? `<div class="trade">Trades in your ${cur.def.name} (¢${this.tradeIn(def.slot)})</div>` : ''}
    </div>`;
  },
  // a weapon part from the gunsmith: bought into your stash, fitted in the Gunsmith tab
  partCard(p: Part | null | undefined) {
    if (!p) return '';
    const Me = G_Me, GS = Gunsmith, ids = GS.fitsPart(p);
    const yours = ['p', 's'].map((k) => Me.weapons[k]).filter(Boolean)
      .map((w) => `<span class="${ids.includes(w.def.id) ? 'fit-y' : 'fit-n'}">${ids.includes(w.def.id) ? '✓' : '✗'} ${w.def.name}</span>`).join(' ');
    return `<div class="card part${Shop.wished(p.id) ? ' wished' : ''}">
      <div class="ch"><span class="cn">${this.star(p.id)}${U.esc(p.name)}</span><span class="tier">${GS.SLOT_LABEL[p.slot]}</span></div>
      <div class="cd"><small class="brand">${U.esc(p.brand)}</small> ${U.esc(p.desc || '')}</div>
      <div class="gs-pe">${GunsmithUI.partEffects(p, (['p', 's'].map((k) => Me.weapons[k]).filter(Boolean).find((w) => ids.includes(w.def.id)) || { def: { id: null } }).def.id) || ''}</div>
      <div class="fits">Fits: ${U.esc(GS.ifaceName(p.mount))} (${ids.length} weapon${ids.length === 1 ? '' : 's'})<br>${yours}</div>
      <div class="cfoot"><span>${(Me.stash || {})[p.id] ? `In stash ×${Me.stash[p.id]}` : 'Goes to your stash'}${Shop.count('part:' + p.id) > 1 ? ` · ${Shop.count('part:' + p.id)} in stock` : ''}</span>
      <button class="btn small buy" data-k="part" data-id="${p.id}" ${!Shop.inStock('part:' + p.id) || Me.credits < p.price ? 'disabled' : ''}>${Shop.inStock('part:' + p.id) ? '¢' + U.fmt(p.price) : 'Sold'}</button></div>
    </div>`;
  },
  // a MOLLE pouch: always in stock
  pouchCard(pid: string) {
    const Me = G_Me, P = Gear.POUCHES[pid], it = Gear.pouchItem(pid), left = Shop.count('pouch:' + pid);
    const free = Gear.molles(Me).some((g) => Gear.findSpot(g, it));
    return `<div class="card pouch">
      <div class="ch"><img class="ci" src="${Icons.of(it, P.w, P.h, false)}"><span class="cn">${U.esc(P.name)}</span><span class="tier">HOLDS ${P.w}×${P.h} · ${P.mw || P.w}×${P.mh || P.h} MOLLE</span></div>
      <div class="cd"><small class="brand">${U.esc(P.brand)}</small> ${U.esc(P.desc)}</div>
      <div class="fits">${free ? 'Mounts on your MOLLE' : Me.kit.carrier || Me.kit.belt ? 'No MOLLE room: goes to your locker' : 'Goes to your locker'}</div>
      <div class="cfoot"><span>${left ? left + ' in stock' : 'Sold out'}</span><button class="btn small buy" data-k="pouch" data-id="${pid}" ${!left || Me.credits < P.price ? 'disabled' : ''}>${left ? '¢' + U.fmt(P.price) : 'Sold'}</button></div>
    </div>`;
  },
  // empty magazines for a gun
  magCard(key: string) {
    const [wid, vid] = key.split('|'), Me = G_Me, def = WEAPONS[wid], a = Gear.ammoFor(def), it = Gear.ammoItem(def, 0, null as any, vid), price = Gear.price(it), left = Shop.count('mag:' + key);
    const takers = Gear.guns(Me).filter((w) => magFits(wid, w.def.id)).map((w) => w.def.name), [sw, sh] = Gear.size(it), p = Gunsmith.PARTS[vid];
    const family = magFam(wid) !== wid ? WEAPON_LIST.filter((w) => magFits(wid, w.id)).map((w) => w.name) : null;
    const fx = p && !p.factory ? GunsmithUI.partEffects(p) : 'The standard magazine.';
    return `<div class="card pouch">
      <div class="ch"><img class="ci" src="${Icons.of(it, sw, sh, false)}"><span class="cn">${U.esc(Gear.magName(it))}</span><span class="tier">${a.label} ${sw}×${sh}</span></div>
      <div class="cd">Empty, holds ${it.cap} ${CALIBERS[calOf(def)].name}. Whichever magazine is in the gun sets its capacity and reload. Load it from a box.</div>
      <div class="gs-pe">${fx}</div>
      <div class="fits">${family ? 'Fits the ' + family.join(', ') + ' · ' : ''}${takers.length ? 'Fits your ' + takers.join(', ') : '<span class="fit-n">None of your guns take it</span>'}</div>
      <div class="cfoot"><span>${left ? left + ' in stock' : 'Sold out'}</span><button class="btn small buy" data-k="mag" data-id="${key}" ${!left || Me.credits < price ? 'disabled' : ''}>${left ? '¢' + U.fmt(price) : 'Sold'}</button></div>
    </div>`;
  },
  // the special load in stock this visit
  ammoCard(o: ShopAmmo) {
    const Me = G_Me, A = AMMO[o.am], C = CALIBERS[o.cal], it = Gear.boxItem(o.cal, o.am, o.n), price = Gear.price(it);
    const guns = Gear.guns(Me).filter((w) => calsOf(w.def).includes(o.cal)).map((w) => w.def.name);
    const gdef = Object.values(WEAPONS).filter((d) => calsOf(d).includes(o.cal)).map((d) => asCal(d, o.cal))[0];
    const fx = [...(gdef ? Ballistics.loadNotes(gdef, o.am) : []), A.rangeK ? `range ×${A.rangeK}` : '', A.quiet ? 'near-silent suppressed' : '', A.tracer ? 'visible tracer' : '', A.slug ? 'single slug' : '', A.pelletsK ? `pellets ×${A.pelletsK}` : ''].filter(Boolean).join(' · ');
    return `<div class="card ammo">
      <div class="ch"><img class="ci" src="${Icons.of(it, ...(Gear.size(it) as [number, number]))}"><span class="cn">${C.name} ${A.name}</span><span class="tier">AMMO ×${o.n}</span></div>
      <div class="cd">${U.esc(A.desc)}</div>
      <div class="gs-pe">${fx}</div>
      <div class="fits">${guns.length ? 'Fits your ' + guns.join(', ') : '<span class="fit-n">None of your guns take ' + C.name + '</span>'}</div>
      <div class="cfoot"><span>${!Shop.inStock('ammo:' + o.cal) ? 'Sold out' : Shop.count('ammo:' + o.cal) > 1 ? Shop.count('ammo:' + o.cal) + ' handfuls left' : 'A handful, while it lasts'}</span><button class="btn small buy" data-k="ammo" data-id="${o.cal}" ${!Shop.inStock('ammo:' + o.cal) || Me.credits < price ? 'disabled' : ''}>¢${U.fmt(price)}</button></div>
    </div>`;
  },
  // a carrier, rig, plate, helmet or belt from the quartermaster
  // the pouches gear comes with, counted: "3 rifle mag, grenade, IFAK"
  issued(d: GDef) {
    const n: Record<string, number> = {};
    for (const [pid] of d.pouches || []) n[pid] = (n[pid] || 0) + 1;
    const out = Object.entries(n).map(([pid, c]) => (c > 1 ? c + ' × ' : '') + Gear.POUCHES[pid].name.replace(/ pouch$/, '').replace(/^[A-Z][a-z]/, (c: string) => c.toLowerCase()));
    return out.length ? out.join(', ') : 'no pouches';
  },
  // which of your guns a backpack would take
  packFits(d: GDef) {
    const [w, h] = d.grids[0], ok = (s: number[]) => (s[0] <= w && s[1] <= h) || (s[1] <= w && s[0] <= h);
    const kinds = [['pistols', 'p9'], ['compact SMGs', 'mp5'], ['rifles and shotguns', 'm4'], ['sniper rifles and LMGs', 'r700']].filter(([, id]) => ok(Gear.gunSize(WEAPONS[id]))).map(([n]) => n);
    return kinds.length ? 'takes ' + kinds.join(', ') : 'no guns';
  },
  // what a set of night vision shows: its tubes and field, its phosphor
  nvField(d: GDef) {
    const v = d.nv as NvSpec, n = v.tubes.length, w = Math.round(Math.max(...v.tubes.map((t) => t[0] + t[2])) - Math.min(...v.tubes.map((t) => t[0] - t[2]))), h = Math.round(v.tubes[0][2] * 2);
    return `${n === 1 ? 'one tube, one eye' : n === 2 ? 'two tubes, both eyes' : 'four tubes, panoramic'} · ${w === h ? w + '°' : w + '° × ' + h + '°'} · ${v.phos[0] > 0.6 ? 'white' : 'green'} phosphor${v.thermal ? ' · thermal fusion' : ''}`;
  },
  gearCard(d: GDef) {
    const sold = !Shop.inStock('gear:' + d.id), pl = Shop.offers && Shop.offers.plates && Gear.DEFS[Shop.offers.plates[d.id]], price = Shop.gearPrice(d.id);
    const Me = G_Me;
    const KN: Record<string, string> = { carrier: d.dur ? (d.plate ? 'PLATE CARRIER' : 'SOFT VEST') : 'CHEST RIG', plate: 'PLATE', helmet: 'HELMET', nvg: 'NIGHT VISION', face: d.cover < 0.9 ? 'MANDIBLE' : 'FACE SHIELD', shoulder: 'SHOULDER ARMOUR', groin: 'PELVIS ARMOUR', legs: 'LEG ARMOUR', belt: 'BELT', pack: 'BACKPACK' };
    const fc = Shop.offers && Shop.offers.faces && Gear.DEFS[Shop.offers.faces[d.id]];
    const cardIt = Gear.gearItem(d.id); if (fc) cardIt.face = Gear.gearItem(fc.id); // (its icon shows what's fitted)
    const B = Ballistics, L = B.mainLayers(d, pl), rt = L && B.rating(L);
    const ACC: Record<string, string> = { mag: 'mag', frag: 'grenade', med: 'medkit' };
    const pouches = (d.grids || []).map(([w, h, acc]: [number, number, string[]?]) => `${w}×${h}${acc ? ' ' + ACC[acc[0]] : ''}`);
    let body = '';
    // what it's made of, and what that stops head-on (worked out, js/ballistics.ts rating; a carrier with its plate: the plate's)
    if (L) body += `<div class="arm-rate"><small>${U.esc(B.layersText(L))}</small><div><b>Stops</b> ${rt.stops.length ? rt.stops.join(', ') : 'nothing'}</div><div class="fit-n"><b>Not</b> ${rt.fails.slice(0, 5).join(', ')}${rt.fails.length > 5 ? '…' : ''}</div></div>`;
    if (d.dur) body += this.bar('DURAB', d.dur / 9, d.dur + ' pts');
    body += this.bar('MOBIL', (d.speed - 0.85) / 0.15, Math.round(d.speed * 1000) / 10 + '%');
    const foot = [d.prot && d.prot.length ? 'Covers ' + [...new Set(d.prot.map((p: { at: string }) => B.AT_NAME[p.at] || p.at))].join(', ') : '', d.plate ? (pl ? `Fitted with <b style="color:${TIER_COLORS[pl.tier]}">${U.esc(pl.name)}</b> (${TIER_NAMES[pl.tier]}, ¢${U.fmt(pl.price)} of the price)` : 'Plate pocket') : '', pouches.length ? 'Holds ' + pouches.join(', ') + ': ' + this.packFits(d) : '', d.molle ? `MOLLE ${d.molle[0]}×${d.molle[1]}, issued with ${this.issued(d)}` : '',
      d.kind === 'helmet' && d.face ? (fc ? `Fitted with <b style="color:${TIER_COLORS[fc.tier]}">${U.esc(fc.name)}</b> (${TIER_NAMES[fc.tier]}, ¢${U.fmt(fc.price)} of the price)` : 'Mount for a face shield or mandible') : '',
      d.kind === 'face' ? `Fits helmets with a mount · in the way of ${Math.round((d.cover || 1) * 100)}% of face hits · <b>helmet not included</b>` : '',
      d.kind === 'nvg' ? `${this.nvField(d)} · fits a helmet's shroud, not with a full face shield · <b>helmet not included</b>` : '',
      d.kind === 'helmet' && d.nvg ? 'Shroud for night vision' : '',
      d.kind === 'plate' ? '<b>Carrier not included</b>: it goes in a plate carrier\'s pocket' : '',
      d.kind === 'shoulder' || d.kind === 'groin' ? '<b>Carrier not included</b>: it fits a plate carrier\'s mounts' : '', d.kind === 'legs' ? '<b>Belt not included</b>: it hangs from a battle belt or war belt' : '',
      d.kind === 'carrier' && (d.shoulder || d.groin) ? 'Mounts for shoulder and pelvis armour' : '', d.kind === 'belt' && d.legs ? 'Hangers for leg armour' : ''].filter(Boolean).join(' · ');
    return `<div class="card gear">
      <div class="ch"><img class="ci" src="${Icons.of(cardIt, ...(Gear.size(cardIt) as [number, number]))}"><span class="cn">${U.esc(d.name)}</span><span class="tier" style="color:${TIER_COLORS[d.tier]}">${TIER_NAMES[d.tier]} ${KN[d.kind]}</span></div>
      <div class="cd"><small class="brand">${U.esc(d.brand)}</small> ${U.esc(d.desc)}</div>
      ${body}
      <div class="fits">${foot}</div>
      <div class="cfoot"><span>${sold ? 'Sold out' : 'Only one in stock'}</span><button class="btn small buy" data-k="gear" data-id="${d.id}" ${sold || Me.credits < price ? 'disabled' : ''}>${sold ? 'Sold' : '¢' + U.fmt(price)}</button></div>
    </div>`;
  },

  // The Route tab: the act's map as the route screen draws it (js/route.ts svg), to look at between levels: where the squad's
  // been, the levels it can go to next, every node's card on hover (strongholds, night, the boss). Picking is the route
  // screen's, once you've boarded the helicopter.
  routeHtml() {
    const g = Game, rm = g.routeMap, st = g.routeSt;
    if (!rm || !st) return '<div class="shop-route-empty dim">No route yet: it is drawn when the run starts.</div>';
    const at = st.path[st.path.length - 1], opts = Route.options(rm, at), colors: Record<string, number> = {};
    for (const [id, p] of Object.entries(g.roster || {})) colors[id] = (p as any).color;
    const next = opts.map((o) => rm.nodes.get(o)!).filter(Boolean);
    const line = next.length === 1 && next[0].boss ? 'Next: <b class="red">the Kingpin</b>' : `Next: one of ${next.length} — ${next.map((n) => U.esc(THEMES[n.th].name) + (n.stronghold ? ' <b class="red">!</b>' : '') + (n.night ? ' ☾' : '')).join(' · ')}`;
    return `<div class="shop-route-head"><b>Act ${rm.act}</b> <span class="dim">level ${Shop.level + 1} next</span><div>${line}</div><small class="dim">Hover a level for its card. You pick on the route map once you've boarded the helicopter.</small></div>
      <div class="shop-route">${Route.svg(rm, { path: st.path, opts, votes: {}, colors, mine: undefined })}</div>`;
  },
  routeWire(items: HTMLElement) {
    const box = items.querySelector<HTMLElement>('.shop-route');
    if (!box) return;
    Game.routeHover(box, true);
    box.addEventListener('wheel', (e: WheelEvent) => { if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) { box.scrollLeft += e.deltaY; e.preventDefault(); } }, { passive: false });
    const here = box.querySelector('.rn.here') || box.querySelector('.rn.opt');
    if (here) { const r = here.getBoundingClientRect(), b = box.getBoundingClientRect(); box.scrollLeft += r.left + r.width / 2 - (b.left + b.width * 0.35); }
  },
  render() {
    if (InvUI.scaleUI) InvUI.scaleUI(); // (the shop's sizes scale with the window too: --ik)
    if (!Shop.offers) return;
    const Me = G_Me;
    document.getElementById('shopCredits')!.textContent = '¢ ' + U.fmt(Me.credits);
    const rp = this.report;
    const rep = rp ? `<div class="report">${rp.arrests} arrested · ${rp.incap || 0} incapacitated${rp.bleedouts ? ` (${rp.bleedouts} bled out)` : ''} · ${rp.rescued} civilians secured · ${rp.evidence || 0} weapons bagged · ${rp.bodies || 0} bodies secured` +
      (rp.civKilled ? ` · <b class="red">${rp.civKilled} civilian casualties</b>` : '') + (rp.unauth ? ` · <b class="red">${rp.unauth} unauthorised kills</b>` : '') +
      (!rp.unauth ? ' · <b class="go">clean op +¢200</b>' : '') + (rp.stronghold ? ` · <b class="go">stronghold cleared +¢${Route.strongholdPay(Shop.level)}</b>` : '') + (rp.allRescued ? ` · <b class="go">every civilian rescued +¢${150 + 50 * Shop.level}</b>` : '') + '</div>' : '';
    document.getElementById('shopTitle')!.innerHTML = `Level ${Shop.level} cleared <span>— next up: level ${Shop.level + 1}${Route.isBoss(Shop.level + 1) ? ' <b class="red">(BOSS)</b>' : ''}</span>${rep}`;
    // (the route map's tab first, as an icon: a folded map)
    const MAP_ICON = '<svg class="tab-ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6.5 9 4l6 2.5L21 4v13.5L15 20l-6-2.5L3 20Z M9 4v13.5 M15 6.5V20"/></svg>';
    const tabs = [['route', MAP_ICON, 'Route map'], ['stock', 'Stock'], ['kit', 'Kit'], ['gunsmith', 'Gunsmith'], ['zero', 'Zeroing'], ['svc', 'Supplies'], ['career', 'Career']];
    document.getElementById('shopTabs')!.innerHTML = tabs.map(([k, n, t]) => `<button class="tab${k === 'route' ? ' tab-icon' : ''}${this.tab === k ? ' on' : ''}" data-tab="${k}"${t ? ` title="${t}" aria-label="${t}"` : ''}>${n}</button>`).join('');
    let html = '';
    const O = Shop.offers;
    if (this.tab === 'stock') {
      // what's for sale, by who sells it (Vex's own; Nightjar's; the pouches and magazines), and anything sold out gathered at the
      // end under its own label: [stock key, card] each
      const card = (k: string, h: string): [string, string] => [k, h], sold: string[] = [];
      const group = (title: string, cards: [string, string][]) => { const live = cards.filter(([k, h]) => !Shop.stock || Shop.inStock(k) || (sold.push(h), false)); /* (before the host's count is in: all as listed) */ return live.length ? `<h3 class="shop-sub">${title}</h3>` + live.map((c) => c[1]).join('') : ''; };
      html = group('Vex&#39;s', [...O.ammo.map((o: ShopAmmo) => card('ammo:' + o.cal, this.ammoCard(o))), ...O.gear.map((id: string) => card('gear:' + id, this.gearCard(Gear.DEFS[id]))),
        ...[...(Shop.partStock || [])].sort((a, b) => +Shop.wished(b as string) - +Shop.wished(a as string)).map((id) => card('part:' + id, this.partCard(Gunsmith.PARTS[id as string])))]) +
        group('Nightjar Optronics · night vision and thermal', [...(O.nvg || []).map((id: string) => card('gear:' + id, this.gearCard(Gear.DEFS[id]))), ...(O.njParts || []).map((id: string) => card('part:' + id, this.partCard(Gunsmith.PARTS[id])))]) +
        group('Pouches and magazines', [...O.pouches.map((o: { id: string }) => card('pouch:' + o.id, this.pouchCard(o.id))), ...O.mags.map((o: { id: string }) => card('mag:' + o.id, this.magCard(o.id)))]);
      if (sold.length) html += `<h3 class="shop-sub">Out of stock</h3>` + sold.join('');
    }
    else if (this.tab === 'route') html = this.routeHtml();
    else if (this.tab === 'career') html = `<div class="shop-career">${Career.html()}</div>`; // (your career: js/career.ts)
    else if (this.tab === 'svc') html = this.services().map((s: ShopService) => `<div class="card">
        <div class="ch"><span class="cn">${s.name}</span></div>${s.sel || ''}<div class="cd">${s.desc}</div>
        <div class="cfoot"><span></span><button class="btn small buy" data-k="svc" data-id="${s.id}" ${s.disabled || Me.credits < s.price ? 'disabled' : ''}>${s.disabled ? '—' : '¢' + U.fmt(s.price)}</button></div></div>`).join('');
    const items = document.getElementById('shopItems')!;
    if (this.tab === 'gunsmith') { InvUI.hide(); GunsmithUI.show(items); }
    else if (this.tab === 'kit') { GunsmithUI.hide(); InvUI.show(items); }
    else if (this.tab === 'zero') { GunsmithUI.hide(); InvUI.hide(); ZeroUI.show(items); }
    else { GunsmithUI.hide(); InvUI.hide(); items.innerHTML = html; if (this.tab === 'route') this.routeWire(items); }
    items.classList.toggle('locked', this.ready);
    items.classList.toggle('route-view', this.tab === 'route'); // (the map fills the pane: css)

    const kitName = (it: GItem | null | undefined) => (it ? U.esc(Gear.defOf(it)!.name) : '—');
    const wline = (w: GWeapon) => `<div class="lo"><span style="color:${TIER_COLORS[w.def.tier]}">${w.def.name}${w.def.modified ? ' <small>CUSTOM</small>' : ''}${w.sup ? ' <small>SUPP</small>' : ''}</span><small>${w.mag}${w.chamber ? '+1' : ''}/${Me.magSize(w)}</small></div>`; // (between levels: the count)
    document.getElementById('shopLoadout')!.innerHTML =
      (Me.weapons.p ? wline(Me.weapons.p) : '<div class="lo"><span>No primary</span></div>') + (Me.weapons.s ? wline(Me.weapons.s) : '<div class="lo"><span>No sidearm</span></div>') +
      Gear.packGuns(Me).map(([it]) => wline(it.w).replace('<div class="lo">', '<div class="lo"><small>PACK</small> ')).join('') +
      `<div class="lo"><span>${kitName(Me.kit.carrier)}${Me.kit.carrier && Me.kit.carrier.plate ? ' + ' + kitName(Me.kit.carrier.plate) : ''}</span><small>${Me.kit.carrier ? Math.round(Me.vestCond() * 100) + '%' : ''}</small></div>` +
      `<div class="lo"><span>${kitName(Me.kit.helmet)}</span><small>${Me.kit.helmet ? Math.round(Me.helmCond() * 100) + '%' : ''}</small></div>` +
      `<div class="lo"><span>Frags ${Me.nades} · Medical items ${Me.meds}</span></div>`;
    let roster = '';
    for (const [id, p] of Object.entries(Game.roster)) {
      roster += `<div class="lo"><span style="color:${U.hex(p.color)}">${Callsigns.html(p.animal)}${U.esc(p.name)}${Game.guestMark(id)}${id === Net.myId ? ' (you)' : ''}</span><small class="${p.ready ? 'rdy' : ''}">${p.ready ? 'READY' : 'shopping'}</small></div>`;
    }
    document.getElementById('shopRoster')!.innerHTML = roster;
    const rb = document.getElementById('btnReady')!;
    if (Game.hub) { rb.textContent = 'Back to the hangar'; rb.classList.add('primary'); } // (readying up is the helicopter's)
    else { rb.textContent = this.ready ? 'Not ready' : 'Ready up'; rb.classList.toggle('primary', !this.ready); }
    if (Game.hub && Hangar.S.root) Hangar.refresh(); // (what's on the shelves follows what's in stock)
  },

  bind() {
    document.getElementById('shopTabs')!.addEventListener('click', (e) => {
      const t = (e.target as Element).closest<HTMLElement>('[data-tab]');
      if (t) { this.tab = t.dataset.tab!; Audio.click(); this.render(); }
    });
    const items = document.getElementById('shopItems')!;
    items.addEventListener('click', (e) => {
      if (this.tab === 'gunsmith') return GunsmithUI.onClick(e);
      if (this.tab === 'zero') return ZeroUI.onClick(e);
      const wb = (e.target as Element).closest<HTMLElement>('[data-wish]');
      if (wb) { Shop.toggleWish(wb.dataset.wish!); Audio.click(); this.render(); return; }
      const b = (e.target as Element).closest<HTMLButtonElement>('.buy');
      if (b && !b.disabled) this.buy(b.dataset.k!, b.dataset.id!);
    });
    items.addEventListener('mouseover', (e) => { if (this.tab === 'gunsmith') GunsmithUI.onHover(e); });
    items.addEventListener('change', (e) => { if (this.tab === 'gunsmith') GunsmithUI.onChange(e); });
    items.addEventListener('change', (e) => { const s = (e.target as Element).closest<HTMLSelectElement>('.load-sel'); if (s) { this.loadSel[s.dataset.cal!] = s.value; Audio.click(); this.render(); } }); // (the load a box on Supplies is of)
    document.getElementById('btnReady')!.addEventListener('click', () => (Game.hub ? Game.closeShop() : this.setReady(!this.ready)));
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
G.ShopUI = ShopUI;
ReplayEnv.Shop = Shop; // (what the replay asks of it: js/replayenv.ts; set here, not in js/shop.ts, which the server's thread loads and replayenv is the page's)
window.addEventListener('gunicons', () => { const el = document.getElementById('shop'); if (el && !el.classList.contains('hidden') && Shop.offers) ShopUI.render(); }); // (a gun's picture came in after the screen was drawn: js/icons.ts)
declare global { interface GameModules { ShopUI: typeof ShopUI; } }