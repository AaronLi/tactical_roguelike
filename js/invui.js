'use strict';
// The Kit tab at the quartermaster's: your equipment, the grids you carry and your locker. Drag items between
// grids (R turns the one you're holding), onto an equipment slot to wear it, or onto the sell box. Double-click
// moves an item between your body and the locker. Your two weapons sit in slots too: drag one into a backpack
// big enough for it (or the locker) to stow it, and a stowed one onto its slot to carry it.
// Carriers and belts show their MOLLE panel with each pouch where it's mounted, contents and all; "Edit
// pouches" turns the panels into grids of pouches you can move, add (from the locker) and take off.
// Containers you aren't wearing (a pouch, a backpack, a carrier or belt in the locker or a pack) open with a
// double-click or the right-click menu into a panel under the locker, to see and move what's inside. The
// right-click menu also moves an item to or from the locker, and sells it.
// Guns open too: a panel of the gun's part slots and its magazine. The parts fitted and the magazine in it are
// items there: drag a part off (to your locker, a pouch, the sell box) or another onto its slot to fit it,
// take the magazine out or drop one in. Right-click has the item's own actions: unload or load a magazine
// or gun, load magazines from a box, fit a part to a gun.
// In a level (Tab), the same screen shows what you carry and your health: rearrange it, swap guns with your
// pack, load and unload magazines. The locker, selling and changing parts wait for the quartermaster.
// In the field, handling ammo takes the time it really does (a job queue, a round at a time, shown at the
// top): thumbing rounds into a magazine, unloading, magazines in and out, shells into a tube. Closing the
// screen (or Cancel) stops it where it is.
G.InvUI = (() => {
  // cell size, px: from the window (40 px at 1080p up to 72 on a big 4K screen); everything else in the
  // inventory scales with it (--ik, css/style.css)
  let C = 34;
  function scaleUI() {
    C = Math.round(Math.min(72, Math.max(40, Math.min(window.innerHeight / 24, window.innerWidth / 34)))); // (the tighter of height and width)
    document.documentElement.style.setProperty('--ik', (C / 34).toFixed(3));
  }
  const GG = () => G.Gear;
  let root = null, drag = null, editMolle = false, menu = null, field = false;
  let patient = null; // a teammate you're treating (their player id), or null: yourself
  let ptPart = null, lastDropAt = 0; // the part of a body you've picked to treat (highlighted); when something was last dropped on one
  let cab = null; // the first aid cabinet you're looking in (its index), or null
  const locked = () => !field && G.Shop.ready;
  // ---------------------------------------------------------------- field jobs (timed ammo handling)
  // a job: { label, per (s per step), t, step(me) -> 'more' | 'done', prog() -> text, end(me) }
  let jobs = [];
  const PER = { round: 0.7, pistol: 0.55, belt: 0.25, shell: 0.6, out: 0.25, magIn: 1.2, magOut: 0.9 };
  function queue(j) {
    j.t = 0;
    jobs.push(j);
    if (jobs.length === 1) G.Audio.click();
    paintJob();
  }
  const where = (me, it) => locate(me, it.uid);
  const dropItem = (me, it) => { const s = where(me, it); if (s && s.g) GG().removeFrom(s.g, it); };
  // the boxes of a caliber (of one type if given) you can reach, fullest first... or emptiest for unloading into
  function boxes(me, cal, am) { const o = []; GG().each(grids(me), (b) => { if (b.k === 'ammo' && b.key === cal && (!am || b.am === am)) o.push(b); }); return o; }
  // somewhere for rounds coming out: a box of that type with room, or a new (empty) one on you
  function outBox(me, cal, am) {
    const b = boxes(me, cal, am).find((q) => q.n < q.cap);
    if (b) return b;
    const nb = GG().boxItem(cal, am, 0);
    return GG().stow(me, nb) ? nb : null;
  }
  // Counts: in the stash and the shop, between levels, you can count your rounds; in the field you can't (a
  // magazine's fill shows in its picture; check it with R held).
  const counted = () => G.Game.phase !== 'level';
  // how far a job's got (no counts: a bar)
  const bar = (f) => `<i class="jobbar"><b style="width:${Math.round(G.U.clamp(f || 0, 0, 1) * 100)}%"></b></i>`;
  const magPer = (mag) => { const def = G.WEAPONS[mag.wid]; return G.beltFed(def) ? PER.belt : def.cls === 'PST' || def.cls === 'MP' ? PER.pistol : PER.round; };
  // rounds into a magazine, one at a time: from `box`, or from any box of its caliber (same type first)
  function loadJob(mag, box, w) {
    const name = GG().magName(mag);
    return { label: `Loading the ${name}`, per: magPer(mag), prog: () => bar(mag.n / mag.cap),
      step(me) {
        if (mag.n >= mag.cap || !where(me, mag) && !w) return 'done';
        const cal = G.calOf(G.WEAPONS[mag.wid]);
        const b = box ? (box.n > 0 && where(me, box) ? box : null) : boxes(me, cal, null).sort((a, c) => (c.am === mag.am) - (a.am === mag.am))[0];
        if (!b) return 'done';
        mag.r.push(b.am); b.n--; // on top of whatever's in it
        if (w) { w.mag = mag.n; w.ammo = mag.am; } // (it's the magazine in that gun: the same stack)
        if (b.n <= 0) dropItem(me, b);
        G.Audio.click();
        return mag.n >= mag.cap ? 'done' : 'more';
      } };
  }
  // rounds out of a magazine (or a loose-fed gun) into a box
  function unloadJob(name, cal, get, take, w) {
    let box = null;
    let n0 = 0;
    return { label: `Unloading the ${name}`, per: PER.out, prog: () => bar((n0 = Math.max(n0, get())) ? get() / n0 : 0),
      step(me) {
        if (get() <= 0) return 'done';
        const am = take(true);
        if (!box || box.am !== am || box.n >= box.cap || !where(me, box)) box = outBox(me, cal, am);
        if (!box) { G.HUD.toast('', 'No room on you for the loose rounds', 1.5); return 'done'; }
        take(false); box.n++;
        G.Audio.click();
        return get() > 0 ? 'more' : 'done';
      },
      end(me) { if (box && box.n <= 0) dropItem(me, box); } };
  }
  // shells into a tube (or a break-action), one at a time
  function gunLoadJob(w, box) {
    return { label: `Loading the ${w.def.name}`, per: PER.shell, prog: () => bar(w.mag / G.Me.magSize(w.def)),
      step(me) {
        const cap = me.magSize(w.def);
        if (w.mag >= cap) return 'done';
        const b = box ? (box.n > 0 && where(me, box) ? box : null) : boxes(me, G.calOf(w.def), w.mag ? w.ammo : null)[0];
        if (!b) return 'done';
        w.mag++; b.n--; w.ammo = b.am; w.tube.push(b.am);
        if (b.n <= 0) dropItem(me, b);
        G.Audio.shell ? G.Audio.shell() : G.Audio.click();
        return w.mag >= cap ? 'done' : 'more';
      } };
  }
  // one-step jobs: a magazine into a gun, or out of it (to a spot, or anywhere on you)
  function magInJob(mag, gunIt) {
    return { label: `Magazine into the ${gunIt.w.def.name}`, per: PER.magIn, prog: () => '',
      step(me) { const s = where(me, mag); if (s) intoGun(me, s, gunIt); return 'done'; } };
  }
  function magOutJob(w, to) {
    return { label: `Magazine out of the ${w.def.name}`, per: PER.magOut, prog: () => '',
      step(me) {
        const m = magItem(w);
        if (!m) return 'done';
        if (to && GG().fits(to.g, m, to.x, to.y, to.rot)) { detach(me, { gunMag: w }); GG().put(to.g, m, to.x, to.y, to.rot); }
        else if (GG().roomFor(me, m)) { detach(me, { gunMag: w }); GG().stow(me, m); }
        else G.HUD.toast('', 'No room on you for the magazine', 1.5);
        G.Audio.click();
        return 'done';
      } };
  }
  // a medical item onto a part (yours or the patient's): checked, then it takes the item's time
  function treatOn(me, src, part) {
    const it = src.it, I = G.Med.ITEMS[it.mt], b = bodyOf(me);
    if (!I || !b) return G.Audio.deny();
    const why = G.Med.cantTreat(b, part, it.mt);
    if (why) { G.HUD.toast('', why, 1.6); return G.Audio.deny(); }
    const who = patient, pv = patientView();
    queue({ label: `${I.name} on ${who != null && pv ? pv.name + "'s" : 'your'} ${G.Med.NAME[part].toLowerCase()}`, per: I.time, prog: () => '',
      step(me2) {
        const s = where(me2, it);
        if (!s) return 'done';
        if (who == null) { if (!G.Med.treat(me2.body, part, it.mt)) return 'done'; }
        else {
          const p = G.Views.players.get(who);
          if (!p || p.st.dd || Math.hypot(p.pos.x - me2.pos.x, p.pos.z - me2.pos.z) > 2.6) { G.HUD.toast('', 'Too far away', 1.4); return 'done'; }
          G.Net.toHost({ t: 'treat', tg: who, part, mt: it.mt });
        }
        if ((it.n || 1) > 1) it.n--; else detach(me2, s); // one off the stack
        G.Audio.heal();
        return 'done';
      } });
  }
  function reviveJob() {
    const who = patient, pv = patientView();
    if (!pv || !pv.st.dn) return;
    const why = G.Med.cantRevive(bodyOf(G.Me));
    if (why) { G.HUD.toast('', why, 2); return G.Audio.deny(); }
    queue({ label: `Reviving ${pv.name}`, per: 4, prog: () => '',
      step(me) {
        const p = G.Views.players.get(who);
        if (!p || !p.st.dn || p.st.dd || Math.hypot(p.pos.x - me.pos.x, p.pos.z - me.pos.z) > 2.6) return 'done';
        const why = G.Med.cantRevive(bodyOf(me));
        if (why) { G.HUD.toast('', why, 2); return 'done'; } // they've bled down past it meanwhile
        G.Net.toHost({ t: 'revive', tg: who, hp: 30 });
        me.stats.revives++;
        return 'done';
      } });
  }
  function cancelJobs() { const me = G.Me; for (const j of jobs) if (j.end) j.end(me); jobs = []; paintJob(); }
  function jobHTML() {
    if (!jobs.length) return '';
    const j = jobs[0], k = Math.min(1, j.t / j.per);
    return `<div class="job-row"><b>${G.U.esc(j.label)}</b> <span>${j.prog()}</span>${jobs.length > 1 ? ` <i>+${jobs.length - 1} queued</i>` : ''}<button class="btn tiny" data-jobcancel>Cancel</button></div>
      <div class="job-bar"><i style="width:${Math.round(k * 100)}%"></i></div>`;
  }
  function paintJob() { const el = root && document.getElementById('invJob'); if (el) el.innerHTML = jobHTML(); }
  // advance the job at the front (called every frame while the field screen is open)
  function update(dt) {
    // the teammate you're treating has moved out of reach (or died, or gone): what you were doing for them stops
    // and their panel closes
    if (field && patient != null) {
      const pv = patientView(), me = G.Me;
      if (!pv || !pv.st || pv.st.dd || Math.hypot(pv.pos.x - me.pos.x, pv.pos.z - me.pos.z) > 2.6) {
        const name = pv ? pv.name : 'They';
        cancelJobs(); closeMenu(); patient = null; ptPart = null;
        G.Game.toggleInv(false);
        G.HUD.toast('', `${G.U.esc(name)} ${pv && pv.st && pv.st.dd ? 'is gone' : 'moved out of reach'}`, 1.4);
        return;
      }
    }
    // walked away from the cabinet: it closes
    if (field && cab != null) {
      const c = G.Game.map && G.Game.map.cabinets && G.Game.map.cabinets[cab];
      if (!c || Math.hypot(c.x - G.Me.pos.x, c.z - G.Me.pos.z) > 2.2) { cab = null; if (!drag) render(); }
    }
    if (!field || !jobs.length) return;
    const j = jobs[0], me = G.Me;
    j.t += dt;
    let stepped = false;
    while (jobs[0] === j && j.t >= j.per) {
      j.t -= j.per; stepped = true;
      if (j.step(me) !== 'more') { if (j.end) j.end(me); jobs.shift(); }
    }
    if (stepped && !drag && !menu) rerender(); else paintJob(); // (not under an open menu or a drag)
  }
  // after a change: redraw (the shop, or the field screen), and if the gun in your hands changed, show it
  function rerender() {
    if (!field) return G.Shop.render();
    render();
    const w = G.Me.cur();
    if (w && G.R.vm && G.R.vm.userData.code !== w.def.code) { G.R.setViewmodel(w.def); G.R.vm && (G.R.vm.userData.code = w.def.code); }
  }
  let opened = []; // uids of the open containers, newest first
  const COLORS = { mag: '#3d4a33', ammo: '#4a4130', med: '#5a2a2a', frag: '#3a4237', carrier: '#2f3a44', plate: '#3c3f46', helmet: '#33393f', face: '#30363c', belt: '#3b3528', pack: '#3a3a2c', gun: '#262b30', pouch: '#353a2e', part: '#2c3136' };
  const GS = () => G.Gunsmith;
  const SLOTS = [['wp', 'Primary weapon'], ['ws', 'Sidearm'], ['helmet', 'Helmet'], ['face', 'Face shield / mandible'], ['carrier', 'Body armour / rig'], ['plate', 'Plate'], ['belt', 'Belt'], ['ifak', 'IFAK'], ['pack', 'Backpack']];
  const GEAR_SLOTS = ['helmet', 'face', 'carrier', 'plate', 'belt', 'ifak', 'pack'];
  const WSLOT = { wp: 'p', ws: 's' };
  const ACCEPT = { mag: 'magazines', ammo: 'ammo', frag: 'grenade', med: 'medkit' };

  // ---------------------------------------------------------------- where things are
  function slotItem(me, s) {
    if (WSLOT[s]) { const w = me.weapons[WSLOT[s]]; return w ? GG().gunItem(w) : null; }
    if (s === 'face') return me.kit.helmet ? me.kit.helmet.face || null : null; // on the helmet's mount
    return s === 'plate' ? (me.kit.carrier ? me.kit.carrier.plate : null) : me.kit[s];
  }
  // a container's grids: a pouch's or pack's own, or a carrier's or belt's MOLLE and the pouches on it
  const isContainer = (it) => !!(it.grids || it.molle);
  // open-able: a container that isn't on you already (worn, or a pouch on what you wear)
  const canOpen = (me, src) => (src.it.k === 'gun' && !src.gunPart) || (isContainer(src.it) && !src.slot && !GG().molles(me).includes(src.g));
  // the part items fitted to a gun (one per slot, kept so they keep their uid), and the magazine in it
  const fittedItems = new WeakMap(), magItems = new WeakMap();
  function fittedItem(w, slot, pid) {
    let m = fittedItems.get(w);
    if (!m) fittedItems.set(w, (m = {}));
    if (!m[slot] || m[slot].pid !== pid) m[slot] = GG().partItem(pid);
    return m[slot];
  }
  const isMagGun = (w) => GG().ammoFor(w.def).kind === 'mag';
  function magItem(w) {
    if (!isMagGun(w) || w.noMag) return null;
    let it = magItems.get(w);
    if (!it) magItems.set(w, (it = GG().ammoItem(w.def, 0, w.ammo)));
    it.r = w.tube; it.cap = G.Me.magSize(w.def); it.vid = w.def.build && w.def.build.mag; it.wid = it.key = w.def.id; // (a gun can change what it is: a conversion) // the gun's rounds (and magazine) are this one's
    return it;
  }
  // the guns whose panels are open
  function openGuns(me, gs) { return opened.map((uid) => findIn(me, gs, uid)).filter((it) => it && it.k === 'gun').map((it) => it.w); }
  const innerGrids = (it) => (it.molle ? [it.molle, ...GG().mounted(it)] : it.grids || []);
  // every grid you can reach in the Kit tab: what you carry, the locker, and inside any open container
  function grids(me) {
    const out = GG().all(me), seen = new Set();
    if (field && cab != null) out.push(G.Game.cabGrid(cab));
    if (!field && G.Game.phase === 'shop') out.push(G.Game.teamGrid());
    for (let more = true; more;) {
      more = false;
      for (const uid of opened) {
        if (seen.has(uid)) continue;
        const it = findIn(me, out, uid);
        if (it) { seen.add(uid); out.push(...innerGrids(it)); more = true; }
      }
    }
    return out;
  }
  function findIn(me, gs, uid) {
    for (const s of [...GEAR_SLOTS, 'wp', 'ws']) { const it = slotItem(me, s); if (it && it.uid === uid) return it; }
    for (const g of gs) for (const p of g.items) if (p.it.uid === uid) return p.it;
    return null;
  }
  function locate(me, uid) {
    for (const s of [...GEAR_SLOTS, 'wp', 'ws']) { const it = slotItem(me, s); if (it && it.uid === uid) return { it, slot: s }; }
    const gs = grids(me);
    for (const g of gs) for (const p of g.items) if (p.it.uid === uid) return { it: p.it, g, p };
    for (const w of openGuns(me, gs)) {
      const m = magItems.get(w);
      if (m && m.uid === uid && !w.noMag) return { it: magItem(w), gunMag: w };
      for (const [slot, it] of Object.entries(fittedItems.get(w) || {})) if (it.uid === uid && w.def.build[slot] === it.pid) return { it, gunPart: { w, slot } };
    }
    return null;
  }
  // a part off a gun: the parts that hung off it come off too (to your locker)
  function setBuild(me, w, build) {
    for (const r of GS().prune(w.def.id, build)) me.stash[r] = (me.stash[r] || 0) + 1;
    me.refit(w, build);
    if (G.GunAudio.available()) G.GunAudio.buildDry(w.def.soundKey);
  }
  // why it can't come off (a required part), or null
  function cantDetach() { return null; }
  // taking a core part off: say so (it won't fire until one's back on)
  function warnCore(src) {
    if (!src.gunPart) return;
    const { w, slot } = src.gunPart, sl = GS().slotsOf(w.def.id, w.def.build).find((s) => s.slot === slot);
    if (sl && sl.req) G.HUD.toast('', `The ${w.def.name} won't fire without a ${GS().SLOT_LABEL[slot].toLowerCase()}`, 2);
  }
  const gridById = (me, id) => grids(me).find((g) => g.id === id);
  function detach(me, src) {
    warnCore(src);
    if (src.g) GG().removeFrom(src.g, src.it);
    else if (src.gunPart) { const { w, slot } = src.gunPart, b = Object.assign({}, w.def.build); delete b[slot]; setBuild(me, w, b); }
    else if (src.gunMag) { const w = src.gunMag; w.mag = 0; w.noMag = true; if (w.tube) w.tube = []; magItems.delete(w); }
    else if (src.slot === 'plate') me.kit.carrier.plate = null;
    else if (src.slot === 'face') me.kit.helmet.face = null;
    else if (WSLOT[src.slot]) { delete me.weapons[WSLOT[src.slot]]; if (!me.weapons[me.slot]) me.slot = Object.keys(me.weapons)[0]; }
    else me.kit[src.slot] = null;
  }
  // the last gun in your hands can't be stowed (you go in with something)
  const lastGun = (me, src) => WSLOT[src.slot] && Object.keys(me.weapons).length <= 1;
  // can an item go in that equipment slot?
  function slotOK(me, s, it) {
    if (s === 'plate') return it.k === 'plate' && me.kit.carrier && GG().defOf(me.kit.carrier).plate;
    if (s === 'face') return it.k === 'face' && me.kit.helmet && GG().defOf(me.kit.helmet).face;
    if (WSLOT[s]) return it.k === 'gun' && it.w.def.slot === WSLOT[s];
    return it.k === s;
  }
  const hasContents = (it) => (it.grids && it.grids.some((g) => g.items.length)) || !!it.plate || !!it.face || !!(it.molle && it.molle.items.some((p) => hasContents(p.it)));

  // ---------------------------------------------------------------- drawing
  // rot: the item is shown turned (its icon is turned with it)
  function itemHTML(it, w, h, extra = '', rot = false) {
    const Gr = GG(), d = Gr.defOf(it), n = (a, b) => (counted() ? ` <b>${a}</b>/${b}` : ''); // (counts: only out of the field)
    let sub = '';
    if (it.k === 'mag') sub = it.am && it.n && G.AMMO[it.am] ? `<i class="am am-${it.am}">${G.AMMO[it.am].tag}</i>${Gr.mixed(it) ? '<i class="am mix">+MIX</i>' : ''}${n(it.n, it.cap)}` : it.n ? '' : `<i class="am">EMPTY</i>${n(0, it.cap)}`; // (how full it is: the picture shows; in the stash, the count too)
    else if (it.k === 'ammo') sub = it.am && it.n && G.AMMO[it.am] ? `<i class="am am-${it.am}">${G.AMMO[it.am].tag}</i>${Gr.mixed(it) ? '<i class="am mix">+MIX</i>' : ''}${n(it.n, it.cap)}` : it.n ? '' : '<i class="am">EMPTY</i>'; // (how full: the rounds on top; in the stash, the count too)
    else if (it.k === 'med' && GG().medStack(it) > 1) sub = `<b>${it.n || 1}</b>/${GG().medStack(it)}`; // a stack: how many of how many fit
    else if (it.k === 'gun') { // (in the field no counts: check the magazine, or the chamber)
      const nxt = it.w.chamber || (it.w.mag > 0 ? (it.w.tube && it.w.tube.length ? it.w.tube[it.w.tube.length - 1] : it.w.ammo) : null);
      sub = it.w.def.missing && it.w.def.missing.length ? '<i class="broken">won\'t fire</i>' : it.w.noMag && isMagGun(it.w) ? 'no mag' : nxt && G.AMMO[nxt] ? `<i class="am am-${nxt}">${G.AMMO[nxt].tag}</i>` : '<i class="am">EMPTY</i>';
      if (!(it.w.def.missing && it.w.def.missing.length) && !(it.w.noMag && isMagGun(it.w))) sub += n(`${it.w.mag}${it.w.chamber ? '+1' : ''}`, G.Me.magSize(it.w.def));
    }
    else if (d && d.dur) sub = `${Math.round(Gr.cond(it) * 100)}%`;
    else if (it.k === 'part') { const p = GS().PARTS[it.pid]; sub = p && p.factory ? 'factory' : ''; }
    const P = it.k === 'part' ? GS().PARTS[it.pid] : null;
    const title = d ? `${d.brand} ${d.name}\n${d.desc}` : P ? `${P.brand} ${P.name}\n${GS().SLOT_LABEL[P.slot]} · ${GS().ifaceName(P.mount)}` : Gr.label(it);
    return `<div class="inv-item k-${it.k}" data-uid="${it.uid}" style="width:${w * C - 3}px;height:${h * C - 3}px;background:${COLORS[it.k] || '#333'} url(${G.Icons.of(it, w, h, rot)}) center/contain no-repeat;${extra}" title="${G.U.esc(title)}">
      <span class="inv-name">${G.U.esc(d ? d.name : Gr.label(it))}</span><span class="inv-sub">${sub}</span></div>`;
  }
  // a grid only medical gear goes in (a med pouch, the IFAK): edged in red
  const medOnly = (g) => !!(g.accept && g.accept.length && g.accept.every((k) => k === 'med'));
  function gridHTML(g, label) {
    const acc = g.accept ? g.accept.map((k) => ACCEPT[k]).filter((v, i, a) => a.indexOf(v) === i).join(' / ') : '';
    let html = `<div class="inv-gwrap">${label ? `<small>${label}${acc ? ` <i>${acc}</i>` : ''}</small>` : ''}<div class="inv-grid${medOnly(g) ? ' med' : ''}" data-grid="${g.id}" style="width:${g.w * C}px;height:${g.h * C}px;background-size:${C}px ${C}px">`;
    for (const p of g.items) { const [w, h] = GG().size(p.it, p.r, g); html += itemHTML(p.it, w, h, `position:absolute;left:${p.x * C + 1}px;top:${p.y * C + 1}px`, !!p.r); }
    return html + '</div></div>';
  }
  // A carrier's or belt's MOLLE: each mounted pouch drawn where it sits, as the grid you drop things in; in
  // edit mode, the panel itself as a grid of pouches
  function molleHTML(gear, close) {
    const Gr = GG(), d = Gr.defOf(gear), m = gear.molle;
    const head = `<h4>${G.U.esc(d.name)} <small>MOLLE ${m.w}×${m.h}</small> <button class="btn tiny molle-btn${editMolle ? ' on' : ''}" data-molle>${editMolle ? 'Done' : 'Edit pouches'}</button>${close ? closeBtn(gear) : ''}</h4>`;
    if (editMolle) return `<div class="inv-sec">${head}<div class="inv-row">${gridHTML(m)}</div></div>`;
    // (a pouch can hold more than the MOLLE it hangs from, so they're laid out side by side, left to right
    // along the panel, each the size of what it holds)
    let html = `<div class="molle molle-flow">`;
    for (const p of [...m.items].sort((a, b) => a.x - b.x || a.y - b.y)) {
      const P = Gr.POUCHES[p.it.pid];
      for (const g of p.it.grids) { // (a pouch with separate pockets: each its own little grid)
        html += `<div class="inv-grid pouch${P.dump ? ' dump' : ''}${medOnly(g) ? ' med' : ''}${p.it.grids.length > 1 ? ' pocket' : ''}" data-grid="${g.id}" title="${G.U.esc(P.name)}" style="position:relative;width:${g.w * C}px;height:${g.h * C}px;background-size:${C}px ${C}px">`;
        for (const q of g.items) { const [w, h] = Gr.size(q.it, q.r); html += itemHTML(q.it, w, h, `position:absolute;left:${q.x * C + 1}px;top:${q.y * C + 1}px`, !!q.r); }
        html += '</div>';
      }
    }
    if (!m.items.length) html += '<em class="molle-empty">No pouches mounted</em>';
    return `<div class="inv-sec">${head}${html}</div></div>`;
  }
  const closeBtn = (it) => `<button class="btn tiny inv-x" data-close="${it.uid}" title="Close">×</button>`;
  // the open containers, under the locker
  function gunHTML(me, gunIt) {
    const Gr = GG(), w = gunIt.w, def = w.def, slots = GS().visibleSlots(def.id, def.build);
    let rows = slots.map((s) => {
      const pid = def.build[s.slot], it = pid ? fittedItem(w, s.slot, pid) : null, [iw, ih] = it ? Gr.partSize(pid) : [1, 1];
      const bad = it && GS().PARTS[pid].mount !== s.mount;
      return `<div class="gun-slot${(!it || bad) && s.req ? ' missing' : ''}" data-wslot="${gunIt.uid}|${s.slot}"><small>${GS().SLOT_LABEL[s.slot]}${s.req ? '' : ' <i>optional</i>'}${bad ? ' <i class="broken">doesn\'t fit: it won\'t fire</i>' : ''}</small>${it ? itemHTML(it, iw, ih, 'position:relative') : s.req ? '<em>missing: it won\'t fire</em>' : '<em>empty</em>'}</div>`;
    }).join('');
    const mi = magItem(w), a = mi ? (([w0, h0]) => ({ w: w0, h: h0 }))(Gr.size(mi)) : null;
    rows += isMagGun(w)
      ? `<div class="gun-slot mag" data-wmag="${gunIt.uid}"><small>Magazine in it</small>${mi ? itemHTML(mi, a.w, a.h, 'position:relative') : '<em>none: drop one here</em>'}</div>`
      : `<div class="gun-slot mag" data-wmag="${gunIt.uid}"><small>Loaded</small>${(() => { const cap = me.magSize(def), pw = Math.max(1, Math.min(4, Math.ceil(cap / 3))); return `<img class="tubepic" src="${G.Icons.of({ k: 'tube', key: G.calOf(def), n: w.mag, cap, am: w.ammo }, pw, 1, false)}" style="width:${pw * 30}px;height:30px">`; })()}<em>${w.mag ? (counted() ? `${w.mag} / ${me.magSize(def)} rounds` : '') : 'empty: drop a box here'}</em></div>`;
    if (G.chambered(def)) rows += `<div class="gun-slot mag"><small>Chamber</small><em>${w.chamber ? `<i class="am am-${w.chamber}">${G.AMMO[w.chamber] ? G.AMMO[w.chamber].tag : ''}</i> a round in it` : 'empty: racks on the next pull of the trigger, or R'}</em></div>`;
    const [gw, gh] = Gr.gunSize(def);
    return `<div class="inv-open gun"><div class="inv-sec"><h4>${G.U.esc(def.name)}${def.modified ? ' <small>CUSTOM</small>' : ''}${def.missing && def.missing.length ? ' <small class="broken">WON\'T FIRE</small>' : ''}${closeBtn(gunIt)}</h4>
      <div class="gun-pic" style="background-image:url(${G.Icons.of(gunIt, gw, gh, false)})"></div><div class="gun-slots">${rows}</div></div></div>`;
  }
  function openedHTML(me) {
    const Gr = GG();
    return opened.map((uid) => {
      const src = locate(me, uid);
      if (!src) return '';
      const it = src.it;
      if (it.k === 'gun') return gunHTML(me, it);
      if (it.molle) return `<div class="inv-open">${molleHTML(it, true)}</div>`;
      const P = it.k === 'pouch' ? Gr.POUCHES[it.pid] : null, d = Gr.defOf(it);
      return `<div class="inv-open"><div class="inv-sec"><h4>${G.U.esc(d ? d.name : Gr.label(it))}${closeBtn(it)}</h4><div class="inv-row">${it.grids.map((g) => gridHTML(g, `${g.w}×${g.h}${P && P.dump ? ' <i>dump</i>' : ''}`)).join('')}</div></div></div>`;
    }).join('');
  }
  function slotHTML(me, s, name) {
    const it = slotItem(me, s);
    if (s === 'face' && !(me.kit.helmet && GG().defOf(me.kit.helmet).face)) return `<div class="inv-slot off"><small>${name}</small><em>${me.kit.helmet ? 'no mount on this helmet' : '—'}</em></div>`;
    if (s === 'plate' && !(me.kit.carrier && GG().defOf(me.kit.carrier).plate)) return `<div class="inv-slot off"><small>${name}</small><em>${me.kit.carrier ? 'no plate pocket' : '—'}</em></div>`;
    // shown at its own proportions (a plate is 2x3, a helmet 2x2), scaled down to fit 3 cells
    let [w, h] = s === 'wp' ? [4, 1.5] : s === 'ws' ? [3, 1] : it ? GG().size(it) : [3, 1];
    if (!WSLOT[s]) { const k = Math.min(1, 3 / w, 3 / h); w *= k; h *= k; }
    return `<div class="inv-slot${WSLOT[s] ? ' wslot' : ''}" data-slot="${s}"><small>${name}</small>${it ? itemHTML(it, w, h, 'position:relative') : '<em>empty</em>'}</div>`;
  }
  // your health and the condition of what protects you
  // The body you're treating: yours, or the teammate's you're checking (from what they last sent)
  function patientView() { return patient != null ? G.Views.players.get(patient) : null; }
  function bodyOf(me) {
    if (patient == null) return me.body;
    const pv = patientView();
    return pv && pv.st && pv.st.bd ? G.Med.decode(pv.st.bd) : null;
  }
  // the body: each part a drop target for medical items, with its health and what's wrong with it
  function bodyHTML(b) {
    const part = (k) => {
      const p = b.parts[k], f = Math.max(0, p.hp / p.max), col = p.hp <= 0 ? '#5a2020' : f > 0.6 ? '#4f7a44' : f > 0.3 ? '#8a7030' : '#8a3a30';
      const chips = [p.heavy ? '<i class="c heavy">BLEED++</i>' : '', p.light ? '<i class="c light">BLEED</i>' : '', p.frac ? '<i class="c frac">FRACTURE</i>' : '',
        p.lung ? '<i class="c organ">LUNG</i>' : '', p.gut ? '<i class="c organ">GUT</i>' : '', p.tq ? '<i class="c tq">TQ</i>' : ''].join('');
      return `<div class="bp bp-${k}${p.heavy || p.light ? ' bleeding' : ''}${ptPart === k ? ' sel' : ''}" data-body="${k}" title="${G.U.esc(G.Med.NAME[k])}: ${Math.ceil(Math.max(0, p.hp))}/${p.max}${G.Med.describe(p).length ? ' · ' + G.Med.describe(p).join(', ') : ''}">
        <b>${G.Med.NAME[k]}</b><div class="bp-bar"><i style="width:${Math.round(f * 100)}%;background:${col}"></i></div><small>${Math.ceil(Math.max(0, p.hp))}/${p.max}</small><div class="bp-chips">${chips}</div></div>`;
    };
    const bl = Math.round(b.blood), bcol = bl > 70 ? '#7fc06a' : bl > 40 ? '#e0b040' : '#e06060';
    // the figure (drop on the part itself), and beside it each part's numbers and what's wrong (drop there too)
    return `<div class="body-wrap">${G.Med.figure(b, { cls: 'big' })}<div class="body-list">${['head', 'thorax', 'stomach', 'armL', 'armR', 'legL', 'legR'].map(part).join('')}</div></div>
      <div class="hl-hp"><span class="hl-k">BLOOD</span><div class="hl-bar"><i style="width:${bl}%;background:${bcol}"></i></div><b>${bl}%</b></div>
      ${b.pk > 0 ? `<div class="hl-status pk">Painkillers: ${patient == null ? Math.ceil(b.pk) + ' s left' : 'on'}</div>` : ''}`;
  }
  // Click a part of a body (yours, or a teammate's you're checking): a dropdown of the medical items you carry
  // that would treat what's wrong with it, one entry per kind; pick one and it's used (one off your stack).
  function medMenu(part, x, y) {
    const me = G.Me, b = bodyOf(me);
    if (!b || !b.parts[part]) return;
    closeMenu();
    const seen = new Set(), opts = [];
    for (const g of GG().body(me)) for (const p of g.items) {
      const mt = p.it.k === 'med' && p.it.mt;
      if (!mt || seen.has(mt)) continue;
      seen.add(mt);
      if (!G.Med.cantTreat(b, part, mt)) opts.push(mt);
    }
    const wrong = G.Med.describe(b.parts[part]);
    menu = document.createElement('div');
    menu.className = 'inv-menu med-menu';
    menu.innerHTML = `<b>${G.Med.NAME[part]}${wrong.length ? ` <small>${wrong.join(', ')}</small>` : ''}</b>`
      + (opts.length ? opts.map((mt) => `<button data-mt="${mt}">${G.U.esc(G.Med.ITEMS[mt].name)}</button>`).join('') : `<i class="none">${wrong.length ? 'Nothing you carry treats this' : 'Nothing wrong with it'}</i>`);
    Object.assign(menu.style, { left: Math.min(x, innerWidth - 200) + 'px', top: Math.min(y, innerHeight - 40 - opts.length * 26) + 'px' });
    menu.addEventListener('click', (ev) => {
      const bt = ev.target.closest('[data-mt]');
      if (!bt) return;
      closeMenu();
      const it = GG().body(me).flatMap((g) => g.items).map((p) => p.it).find((q) => q.k === 'med' && q.mt === bt.dataset.mt), src = it && where(me, it);
      if (src) treatOn(me, src, part); else G.Audio.deny();
      rerender();
    });
    document.body.appendChild(menu);
    setTimeout(() => window.addEventListener('pointerdown', outside, true));
  }
  function healthHTML(me) {
    const Gr = GG();
    if (patient != null) {
      const pv = patientView(), b = bodyOf(me);
      if (!pv || !b || pv.st.dd) { patient = null; return healthHTML(me); }
      const far = Math.hypot(pv.pos.x - me.pos.x, pv.pos.z - me.pos.z) > 2.6;
      return `<div class="pt-head"><b>${G.U.esc(pv.name)}</b>${pv.st.dn ? ` <i class="c heavy">DOWN · ${pv.st.bl < 0 ? 'stable' : pv.st.bl + ' s to bleed out'}</i>` : ''}${far ? ' <i class="c">too far</i>' : ''}
        ${pv.st.dn ? `<button class="btn tiny" data-revive ${far ? 'disabled' : ''}>Revive (4 s)</button>` : ''}<button class="btn tiny" data-self>Back to me</button></div>
        ${bodyHTML(b)}<p class="inv-hint">Click a part of ${G.U.esc(pv.name)}'s body to treat it with what you carry.</p>`;
    }
    const piece = (name, it) => { const d = Gr.defOf(it); if (!d) return ''; const c = d.dur ? Math.round(Gr.cond(it) * 100) : null; return `<div class="hl-row"><span>${name}</span><b>${G.U.esc(d.name)}</b><i>${c == null ? '' : c + '%'}</i></div>`; };
    const status = me.dead ? `Dead: ${G.U.esc(me.deathCause || 'killed')}` : me.down ? (me.bleed == null ? 'Down, stable: needs blood to get up' : `Down: ${Math.ceil(me.bleed)} s until you bleed out`) : G.Med.bleeding(me.body) ? 'Bleeding' : me.hp < 50 ? 'Badly hurt' : me.hp < 90 ? 'Hurt' : 'OK';
    return `<div class="hl-status ${G.Med.bleeding(me.body) ? 'bad' : ''}">${status}</div>${bodyHTML(me.body)}
      <p class="inv-hint">Click a part to treat it with what you carry, or drag a medical item onto it (it takes a few seconds).</p>
      ${piece('Helmet', me.kit.helmet)}${me.kit.helmet && me.kit.helmet.face ? piece('Face', me.kit.helmet.face) : ''}${piece('Armour', me.kit.carrier)}${me.kit.carrier ? piece('Plate', me.kit.carrier.plate) : ''}`;
  }
  function stats(me) {
    const Gr = GG(), zone = (z) => { const pc = Gr.piece(me, z), d = Gr.defOf(pc), st = d && d.stop[z]; return st ? `${Math.round(st[0] * 100)} / ${Math.round(st[1] * 100)}%` : '—'; };
    return `<div class="inv-stats"><div><span>Head</span><b>${zone('head')}</b></div><div><span>Face</span><b>${zone('face')}</b></div><div><span>Chest</span><b>${zone('chest')}</b></div>
      <div><span>Stomach</span><b>${zone('abdomen')}</b></div><div><span>Speed</span><b>${Math.round(Gr.speed(me) * 100)}%</b></div><small>Stops handgun / rifle rounds, new</small></div>`;
  }
  // the cabinet's contents as you've left them, to the host: what you took out, what you put in, the layout
  function cabSync() {
    if (!field || cab == null) return;
    const g = G.Game.cabGrid(cab), items = g.items.map((p) => [p.it.mt, p.it.n || 1, p.x, p.y, p.r ? 1 : 0]);
    const lay = G.Game.cabLay(items);
    if (lay === g.lay) return;
    const now = {}, was = g.counts || {}, take = {}, put = {};
    for (const [mt, n] of items) now[mt] = (now[mt] || 0) + n;
    for (const mt of new Set([...Object.keys(now), ...Object.keys(was)])) { const d = (now[mt] || 0) - (was[mt] || 0); if (d > 0) put[mt] = d; else if (d < 0) take[mt] = -d; }
    G.Net.toHost({ t: 'cabEdit', i: cab, ver: g.ver, take, put, lay: items });
    g.lay = lay; g.counts = now;
  }
  function render() {
    if (!root) return;
    scaleUI();
    const me = G.Me, k = me.kit;
    cabSync();
    if (!field) G.Game.teamSync();
    closeMenu();
    // gone, sold, or now worn (on you, or a pouch mounted on what you wear): closed
    opened = opened.filter((uid) => { const s = locate(me, uid); return s && (s.it.k === 'gun' || (!s.slot && !GG().molles(me).includes(s.g))); });
    let body = `<div class="inv-sec"><h4>Pockets</h4><div class="inv-row">${me.pockets.map((g) => gridHTML(g)).join('')}</div></div>`;
    if (k.carrier && k.carrier.molle) body += molleHTML(k.carrier);
    if (k.belt && k.belt.molle) body += molleHTML(k.belt);
    if (k.ifak) body += `<div class="inv-sec"><h4>IFAK <small>medical gear only</small></h4><div class="inv-row">${k.ifak.grids.map((g) => gridHTML(g)).join('')}</div></div>`;
    if (k.pack) body += `<div class="inv-sec"><h4>${G.U.esc(GG().defOf(k.pack).name)}</h4><div class="inv-row">${k.pack.grids.map((g) => gridHTML(g, `${g.w}×${g.h} <i>anything, guns too</i>`)).join('')}</div></div>`;
    // checking on a teammate: their health and nothing else (no inventory, theirs or yours). Treat a part by
    // clicking it and picking from what you carry that would help (healthHTML).
    if (field && patient != null && patientView()) {
      root.innerHTML = `<div class="inv field patient">
        <div class="inv-col"><div id="invJob" class="inv-job">${jobHTML()}</div><h4 class="hd">Checking</h4><div id="invHealth">${healthHTML(me)}</div></div></div>`;
      return;
    }
    if (field) {
      root.innerHTML = `<div class="inv field">
        <div class="inv-col eq"><h4>Equipment</h4>${SLOTS.map(([s, n]) => slotHTML(me, s, n)).join('')}${stats(me)}<div class="inv-sell inv-drop" data-drop>Drop here to put it on the ground</div></div>
        <div class="inv-col"><div id="invJob" class="inv-job">${jobHTML()}</div><h4 class="hd">On you</h4>${body}<p class="inv-hint">Drag to move · R turns what you're holding · double-click opens a pouch, pack or gun · right-click to load or unload (it takes time: a round at a time) · Tab or Esc closes and stops what you're doing</p></div>
        <div class="inv-col">${cab != null ? `<h4 class="hd">First aid cabinet <small>(medical gear only · the squad shares it)</small></h4><div class="inv-row">${gridHTML(G.Game.cabGrid(cab))}</div>` : ''}<h4 class="hd">${patient != null ? 'Treating' : 'Body'}</h4><div id="invHealth">${healthHTML(me)}</div>${openedHTML(me)}</div></div>`;
      return;
    }
    root.innerHTML = `<div class="inv">
      <div class="inv-col eq"><h4>Equipment</h4>${SLOTS.map(([s, n]) => slotHTML(me, s, n)).join('')}${stats(me)}
        <div class="inv-sell" data-sell>Drop here to sell for half</div></div>
      <div class="inv-col"><h4 class="hd">On you</h4>${body}<p class="inv-hint">Drag to move · R turns what you're holding · double-click opens a pouch, pack or rig (anything else goes to or from the locker) · right-click for more · drop a box of rounds on a magazine to load it · Edit pouches to move, add or take off MOLLE pouches · stow a gun in a big enough backpack and swap to it in the field with B</p></div>
      <div class="inv-col"><h4 class="hd">Locker <small>(stays here between levels)</small></h4>${gridHTML(me.locker)}
        <h4 class="hd">Team locker <small>(the whole squad shares it)</small></h4>${gridHTML(G.Game.teamGrid())}${openedHTML(me)}</div></div>`;
  }

  // ---------------------------------------------------------------- moving things
  function equip(me, s, it, src) {
    const old = slotItem(me, s);
    detach(me, src);
    if (old) {
      // the old one goes where the new one was, or anywhere in the locker
      if (src.g && GG().fits(src.g, old, src.p.x, src.p.y, src.p.r)) GG().put(src.g, old, src.p.x, src.p.y, src.p.r);
      else if (field || !GG().place([me.locker], old)) { // no room: undo
        if (src.g) GG().put(src.g, it, src.p.x, src.p.y, src.p.r); else setSlot(me, src.slot, it);
        return G.HUD.toast('', field ? 'Nowhere on you for the one it replaces' : 'No room in your locker', 1.5), false;
      }
    }
    setSlot(me, s, it);
    return true;
  }
  function setSlot(me, s, it) {
    if (WSLOT[s]) { me.weapons[WSLOT[s]] = it.w; if (!me.weapons[me.slot]) me.slot = WSLOT[s]; }
    else if (s === 'plate') me.kit.carrier.plate = it; else if (s === 'face') me.kit.helmet.face = it; else me.kit[s] = it;
  }
  function drop(e) {
    const me = G.Me, d = drag;
    if (!d) return;
    drag = null;
    d.ghost.remove();
    window.removeEventListener('pointermove', onMove); window.removeEventListener('pointerup', drop); window.removeEventListener('keydown', onKey);
    const t = document.elementFromPoint(e.clientX, e.clientY);
    if (!t) return render();
    const src = locate(me, d.it.uid);
    if (!src) return render();
    const gEl = t.closest('.inv-grid'), sEl = t.closest('[data-slot]'), sell = t.closest('[data-sell]'), onItem = t.closest('.inv-item');
    if (field && t.closest('[data-drop]')) { dropIt(me, src); return rerender(); }
    // a box dropped on a magazine loads it
    const target = onItem && locate(me, +onItem.dataset.uid);
    if (target && target.it !== d.it && d.it.k === 'med' && target.it.k === 'med' && d.it.mt === target.it.mt && GG().medStack(d.it) > 1) {
      if (!GG().mergeMed(d.it, target.it)) { G.HUD.toast('', 'That stack is full', 1.2); G.Audio.deny(); return rerender(); }
      if ((d.it.n || 0) <= 0) detach(me, src);
      G.Audio.click();
      return rerender();
    }
    if (target && target.it !== d.it && d.it.k === 'ammo' && target.it.k === 'ammo') {
      if (d.it.key !== target.it.key || d.it.am !== target.it.am) { G.HUD.toast('', 'Different rounds: they don\'t go in the same box', 1.4); G.Audio.deny(); return rerender(); }
      const n = GG().mergeBox(d.it, target.it);
      if (!n) { G.HUD.toast('', 'That box is full', 1.2); G.Audio.deny(); return rerender(); }
      if (d.it.n <= 0) detach(me, src);
      G.Audio.click();
      return rerender();
    }
    const bodyEl = t.closest('[data-body]');
    if (bodyEl) { lastDropAt = performance.now(); if (field && d.it.k === 'med') treatOn(me, src, bodyEl.dataset.body); else G.Audio.deny(); return rerender(); }
    const wsEl = t.closest('[data-wslot]'), wmEl = t.closest('[data-wmag]');
    if (wsEl && field) { G.HUD.toast('', 'Parts are changed at the quartermaster\'s', 1.5); G.Audio.deny(); return rerender(); }
    if (wsEl && !(onItem && +onItem.dataset.uid === d.it.uid)) { fitPart(me, src, wsEl.dataset.wslot); return rerender(); }
    if (field && (wmEl || (target && target.it.k === 'gun')) && !(target && target.it.k === 'mag' && d.it.k === 'ammo')) {
      const gunIt = target && target.it.k === 'gun' ? target.it : findIn(me, grids(me), +wmEl.dataset.wmag), w = gunIt && gunIt.w;
      if (w && d.it.k === 'mag' && isMagGun(w) && G.magFits(d.it.wid, w.def.id) && src.gunMag !== w) { queue(magInJob(d.it, gunIt)); return rerender(); }
      if (w && d.it.k === 'ammo' && !isMagGun(w) && d.it.key === G.calOf(w.def)) { queue(gunLoadJob(w, d.it)); return rerender(); }
    }
    if (wmEl && !(target && target.it.k === 'mag' && d.it.k === 'ammo')) { intoGun(me, src, findIn(me, grids(me), +wmEl.dataset.wmag)); return rerender(); }
    if (target && target.it !== d.it && d.it.k === 'ammo' && target.it.k === 'gun' && !isMagGun(target.it.w)) { intoGun(me, src, target.it); return rerender(); }
    if (target && d.it.k === 'part' && target.it.k === 'gun' && field) { G.HUD.toast('', 'Parts are changed at the quartermaster\'s', 1.5); G.Audio.deny(); return rerender(); }
    if (target && d.it.k === 'part' && target.it.k === 'gun' && !src.gunPart) {
      const w = target.it.w, p = GS().PARTS[d.it.pid], sl = p && GS().slotsOf(w.def.id, w.def.build).find((s) => GS().fitsSlot(s, p));
      if (sl) fitPart(me, src, `${target.it.uid}|${sl.slot}`); else { G.HUD.toast('', `It doesn't fit the ${w.def.name}`, 1.5); G.Audio.deny(); }
      return rerender();
    }
    if (target && d.it.k === 'mag' && target.it.k === 'gun') {
      if (isMagGun(target.it.w) && G.magFits(d.it.wid, target.it.w.def.id)) intoGun(me, src, target.it); // (any magazine of its pattern)
      else { G.HUD.toast('', `That magazine doesn't fit the ${target.it.w.def.name}`, 1.5); G.Audio.deny(); }
      return rerender();
    }
    if (field && target && target.it !== d.it && d.it.k === 'ammo' && target.it.k === 'mag') {
      if (G.calOf(G.WEAPONS[target.it.wid]) !== d.it.key) { G.Audio.deny(); return rerender(); }
      queue(loadJob(target.it, d.it, target.gunMag)); return rerender();
    }
    if (target && target.it !== d.it && d.it.k === 'ammo' && target.it.k === 'mag') {
      const n = GG().loadMag(me, target.it, d.it);
      if (target.gunMag) { target.gunMag.mag = target.it.n; target.gunMag.ammo = target.it.am; } // the magazine in a gun
      if (n) { G.Audio.click(); G.HUD.toast('', `Loaded ${n} into the magazine`, 1.2); } else G.Audio.deny();
      return rerender();
    }
    if (gEl) {
      const g = gridById(me, +gEl.dataset.grid), r = gEl.getBoundingClientRect();
      const x = Math.floor((e.clientX - r.left) / C) - d.gx, y = Math.floor((e.clientY - r.top) / C) - d.gy;
      // a carrier can't go into its own pouches
      const own = d.it.grids && d.it.grids.includes(g);
      if (lastGun(me, src)) { G.HUD.toast('', 'Keep at least one weapon in hand', 1.5); G.Audio.deny(); }
      else if (cantDetach(src)) { G.HUD.toast('', cantDetach(src), 2); G.Audio.deny(); }
      else if (field && src.gunMag && g && GG().fits(g, d.it, x, y, d.rot, d.it)) queue(magOutJob(src.gunMag, { g, x, y, rot: d.rot }));
      else if (g && !own && !innerGrids(d.it).includes(g) && GG().fits(g, d.it, x, y, d.rot, d.it)) { detach(me, src); GG().put(g, d.it, x, y, d.rot); G.Audio.click(); }
      else G.Audio.deny();
    } else if (sEl) {
      const s = sEl.dataset.slot;
      if (slotOK(me, s, d.it) && !(src.slot === s)) { if (equip(me, s, d.it, src)) G.Audio.buy(); } else G.Audio.deny();
    } else if (sell) sellIt(me, src);
    rerender();
  }
  // a part dropped on a gun's slot: fitted (what was there goes to your locker)
  function fitPart(me, src, key) {
    const [uid, slot] = key.split('|'), gun = findIn(me, grids(me), +uid), it = src.it;
    if (!gun || it.k !== 'part') return G.Audio.deny();
    const w = gun.w, p = GS().PARTS[it.pid], sl = GS().visibleSlots(w.def.id, w.def.build).find((s) => s.slot === slot);
    if (!p || !sl || p.mount !== sl.mount) return G.HUD.toast('', `It doesn't fit there (${GS().ifaceName(p ? p.mount : '')})`, 1.5), G.Audio.deny();
    if (src.gunPart && src.gunPart.w === w && src.gunPart.slot === slot) return;
    if (src.gunPart) { const o = src.gunPart, b = Object.assign({}, o.w.def.build); delete b[o.slot]; setBuild(me, o.w, b); } // off the other gun, quietly
    else detach(me, src);
    const b = Object.assign({}, w.def.build), old = b[slot];
    b[slot] = it.pid;
    setBuild(me, w, b);
    if (old) me.stash[old] = (me.stash[old] || 0) + 1;
    G.Audio.pickup();
  }
  // a magazine into a gun (the one in it comes out to where that one was), or a box's rounds into a loose-fed gun
  function intoGun(me, src, gun) {
    const it = src.it, w = gun && gun.w;
    if (!w) return G.Audio.deny();
    if (!isMagGun(w)) {
      if (it.k !== 'ammo' || it.key !== G.calOf(w.def)) return G.Audio.deny();
      const t = Math.min(me.magSize(w.def) - w.mag, it.n);
      if (!t) return G.Audio.deny();
      w.mag += t; it.n -= t; w.ammo = it.am;
      for (let i = 0; i < t; i++) w.tube.push(it.am);
      if (it.n <= 0) detach(me, src);
      return G.Audio.click();
    }
    if (it.k !== 'mag' || !G.magFits(it.wid, w.def.id) || src.gunMag === w) return G.Audio.deny();
    const old = magItem(w), at = src.p ? [src.g, src.p.x, src.p.y, src.p.r] : null;
    detach(me, src);
    if (old) { magItems.delete(w); if (at && GG().fits(at[0], old, at[1], at[2], at[3])) GG().put(...at.slice(0, 1), old, ...at.slice(1)); else GG().stow(me, old); }
    GG().loadIn(me, w, it); w.noMag = false;
    magItems.set(w, it);
    G.Audio.sample('insert_magazine', 0.5) || G.Audio.click();
  }
  // put it on the ground at your feet (in the field): anything but a part on a gun, and not your last gun
  function dropIt(me, src) {
    if (src.gunPart) return G.HUD.toast('', 'Parts come off at the quartermaster\'s', 1.5), G.Audio.deny();
    if (lastGun(me, src)) return G.HUD.toast('', 'Keep at least one weapon in hand', 1.5), G.Audio.deny();
    const it = src.gunMag ? magItem(src.gunMag) : src.it;
    detach(me, src);
    me.dropItem(it);
  }
  function sellIt(me, src) {
    if (hasContents(src.it)) return G.HUD.toast('', 'Empty it first (double-click to open it)', 1.5), G.Audio.deny();
    if (cantDetach(src)) return G.HUD.toast('', cantDetach(src), 2), G.Audio.deny();
    if (lastGun(me, src)) return G.HUD.toast('', 'Keep at least one weapon in hand', 1.5), G.Audio.deny();
    detach(me, src); me.credits += Math.floor(GG().price(src.it) * 0.5); G.Audio.buy();
    if (src.it.k === 'gun') G.Gunsmith.strip(src.it.w.def, me.stash); // its aftermarket parts stay with you
  }
  function onMove(e) {
    if (!drag) return;
    drag.ghost.style.left = e.clientX - drag.gx * C - C / 2 + 'px';
    drag.ghost.style.top = e.clientY - drag.gy * C - C / 2 + 'px';
  }
  function sizeGhost() { const [w, h] = GG().size(drag.it, drag.rot); drag.ghost.style.width = w * C - 3 + 'px'; drag.ghost.style.height = h * C - 3 + 'px'; }
  function onKey(e) { if (drag && e.code === 'KeyR') { drag.rot ^= 1; [drag.gx, drag.gy] = [drag.gy, drag.gx]; sizeGhost(); } }
  function onDown(e) {
    const el = e.target.closest('.inv-item');
    if (!el || e.button !== 0 || locked()) return;
    const me = G.Me, src = locate(me, +el.dataset.uid);
    if (!src) return;
    e.preventDefault();
    if (field && src.gunPart) return G.HUD.toast('', 'Parts are changed at the quartermaster\'s', 1.5);
    const r = el.getBoundingClientRect();
    const rot = src.p ? src.p.r : 0;
    drag = { it: src.it, rot, gx: Math.max(0, Math.floor((e.clientX - r.left) / C)), gy: Math.max(0, Math.floor((e.clientY - r.top) / C)), ghost: el.cloneNode(true) };
    if (src.slot) { drag.gx = 0; drag.gy = 0; }
    Object.assign(drag.ghost.style, { position: 'fixed', pointerEvents: 'none', zIndex: 50, opacity: 0.85 });
    document.body.appendChild(drag.ghost);
    sizeGhost(); onMove(e);
    window.addEventListener('pointermove', onMove); window.addEventListener('pointerup', drop); window.addEventListener('keydown', onKey);
  }
  // open a container (one you're wearing is already shown under "On you")
  function open(me, src) {
    if (src.it.k !== 'gun' && (src.slot || GG().molles(me).includes(src.g))) return G.HUD.toast('', 'You are wearing it: its contents are under On you', 1.5);
    opened = [src.it.uid, ...opened.filter((u) => u !== src.it.uid)].slice(0, 4);
    G.Audio.click();
    rerender();
  }
  // double-click: open a container, or move it between your body and the locker
  function onDbl(e) {
    const el = e.target.closest('.inv-item');
    if (!el || locked()) return;
    const me = G.Me, src = locate(me, +el.dataset.uid);
    if (!src) return;
    if (canOpen(me, src)) return open(me, src);
    if (!field) quickMove(me, src);
  }
  // what the quick move would do, for the menu
  function quickLabel(me, src) {
    if (src.g !== me.locker && !(src.g && src.g.team)) return lastGun(me, src) ? null : 'Send to locker';
    const it = src.it;
    if (GG().isGear(it)) return it.k === 'plate' ? 'Fit in carrier' : it.k === 'face' ? 'Fit to helmet' : 'Wear';
    if (it.k === 'gun') return me.weapons[it.w.def.slot] ? null : 'Carry';
    if (it.k === 'pouch') return 'Mount on MOLLE';
    return 'Take with you';
  }
  function quickMove(me, src) {
    const inLocker = src.g === me.locker || !!(src.g && src.g.team);
    let ok = false;
    if (src.gunPart || src.gunMag) {
      if (cantDetach(src)) G.HUD.toast('', cantDetach(src), 2);
      else if (GG().findSpot(me.locker, src.it)) { detach(me, src); ok = GG().stow(me, src.it, [me.locker]); }
      else G.HUD.toast('', 'No room in your locker', 1.5);
    } else if (inLocker) {
      if (GG().isGear(src.it)) { const s = src.it.k === 'plate' ? 'plate' : src.it.k; ok = slotOK(me, s, src.it) && equip(me, s, src.it, src); }
      else if (src.it.k === 'gun' && !me.weapons[src.it.w.def.slot]) ok = equip(me, src.it.w.def.slot === 'p' ? 'wp' : 'ws', src.it, src);
      else if (src.it.k === 'pouch') { detach(me, src); ok = !!GG().place(GG().molles(me), src.it); if (!ok) GG().put(src.g, src.it, src.p.x, src.p.y, src.p.r); }
      else { detach(me, src); ok = !!GG().place(GG().body(me), src.it); if (!ok) GG().put(src.g, src.it, src.p.x, src.p.y, src.p.r); }
    } else if (lastGun(me, src)) G.HUD.toast('', 'Keep at least one weapon in hand', 1.5);
    else {
      detach(me, src);
      ok = !!GG().place([me.locker], src.it);
      if (!ok) { if (src.g) GG().put(src.g, src.it, src.p.x, src.p.y, src.p.r); else setSlot(me, src.slot, src.it); }
    }
    G.Audio[ok ? 'click' : 'deny']();
    rerender();
  }

  // ---------------------------------------------------------------- right-click menu
  function closeMenu() {
    if (!menu) return;
    const med = menu.classList.contains('med-menu');
    menu.remove(); menu = null; window.removeEventListener('pointerdown', outside, true);
    if (med) { ptPart = null; const el = root && document.getElementById('invHealth'); if (el) el.innerHTML = healthHTML(G.Me); } // (the part's no longer picked)
  }
  function outside(e) { if (menu && !menu.contains(e.target)) closeMenu(); }
  // what you can do with this item, as [action, label, arg]
  function itemActs(me, src) {
    const Gr = GG(), it = src.it, out = [], boxes = (cal) => { let n = 0; Gr.each(Gr.all(me), (b) => { if (b.k === 'ammo' && b.key === cal) n += b.n; }); return n; };
    if (it.k === 'gun') {
      const w = it.w, cal = G.calOf(w.def);
      if (isMagGun(w)) {
        if (!w.noMag) out.push(['magout', 'Remove magazine']);
        else { const m = bestMag(me, w); if (m) out.push(['magin', `Load a magazine${counted() ? ` (${m.n}/${m.cap})` : ''}`]); }
      } else {
        if (G.loaded(w)) out.push(['unloadgun', `Unload${w.chamber ? ' (the chambered one last)' : ''}`]);
        if (w.mag < me.magSize(w.def) && boxes(cal)) out.push(['loadgun', 'Load from your boxes']);
      }
    }
    if (it.k === 'mag') {
      if (it.n) out.push(['unloadmag', 'Unload']);
      if (it.n < it.cap && boxes(G.calOf(G.WEAPONS[it.wid]))) out.push(['loadmag', 'Load from your boxes']);
      if (!src.gunMag) Gr.guns(me).forEach((w, i) => { if (isMagGun(w) && G.magFits(it.wid, w.def.id) && w !== (src.gunMag || null)) out.push(['magto', `Put in your ${w.def.name}${w.noMag ? '' : ' (swap)'}`, i]); });
    }
    if (it.k === 'ammo') {
      let others = 0; Gr.each(grids(me), (b) => { if (b !== it && b.k === 'ammo' && b.key === it.key && b.am === it.am) others++; });
      if (others && (it.n < it.cap || others > 1)) out.push(['combine', `Combine with your other ${G.AMMO[it.am] ? G.AMMO[it.am].tag + ' ' : ''}boxes (${others})`]);
    }
    if (it.k === 'ammo' && it.n) {
      let any = false;
      Gr.each(Gr.all(me), (m) => { if (m.k === 'mag' && m.n < m.cap && G.calOf(G.WEAPONS[m.wid]) === it.key) any = true; });
      if (any) out.push(['fillfrom', 'Load magazines from it']);
    }
    if (it.k === 'med' && field) {
      const b = bodyOf(me), I = G.Med.ITEMS[it.mt];
      if (b && I) for (const [k] of G.Med.PARTS) if (!G.Med.cantTreat(b, k, it.mt) && (I.fixes !== 'pain' || k === 'head')) out.push(['treat', `${I.fixes === 'pain' ? 'Take' : 'Use on ' + (patient != null ? 'their' : 'your') + ' ' + G.Med.NAME[k].toLowerCase()}`, k]);
    }
    if (it.k === 'part' && !src.gunPart && !field) {
      const p = GS().PARTS[it.pid];
      Gr.guns(me).forEach((w, i) => { const sl = GS().slotsOf(w.def.id, w.def.build).find((s) => GS().fitsSlot(s, p)); if (sl && w.def.build[sl.slot] !== it.pid) out.push(['fit', `Fit to your ${w.def.name}${w.def.build[sl.slot] ? ' (swap)' : ''}`, i]); });
    }
    return out;
  }
  // the fullest magazine you have for a gun, anywhere you can reach
  function bestMag(me, w) { let best = null; GG().each(grids(me), (m) => { if (m.k === 'mag' && G.magFits(m.wid, w.def.id) && (!best || m.n > best.n)) best = m; }); return best; }
  // in the field there's no locker to overflow into: a box needs room on you
  function roomForRounds(me, cal, g) {
    if (!field) return true;
    const probe = GG().boxItem(cal, 'ball', 1);
    if ((g && GG().findSpot(g, probe)) || GG().roomFor(me, probe)) return true;
    G.HUD.toast('', 'No room on you for the loose rounds', 1.5);
    return false;
  }
  const toast = (n, what) => G.HUD.toast('', n ? `${what} ${n}` : 'Nothing to do', 1.2);
  // the same, in the field: as jobs
  const fieldAct = {
    treat: (me, src, part) => treatOn(me, src, part),
    magout: (me, src) => queue(magOutJob(src.it.w)),
    magin: (me, src) => { const m = bestMag(me, src.it.w); if (m) queue(magInJob(m, src.it)); },
    magto: (me, src, i) => { const w = GG().guns(me)[+i]; if (w) queue(magInJob(src.it, GG().gunItem(w))); },
    unloadgun: (me, src) => { const w = src.it.w; queue(unloadJob(w.def.name, G.calOf(w.def), () => G.loaded(w), (peek) => {
      if (!w.mag && w.chamber) { const t = w.chamber; if (!peek) w.chamber = null; return t; } // (the magazine's empty: clear the chamber)
      const t = w.tube && w.tube.length ? w.tube[w.tube.length - 1] : w.ammo; if (!peek) { w.mag--; if (w.tube) w.tube.pop(); } return t; })); },
    loadgun: (me, src) => queue(gunLoadJob(src.it.w, null)),
    unloadmag: (me, src) => { const m = src.it, w = src.gunMag; queue(unloadJob(GG().magName(m), G.calOf(G.WEAPONS[m.wid]), () => m.n, (peek) => { const t = m.am; if (!peek) { m.r.pop(); if (w) w.mag = m.n; } return t; })); },
    loadmag: (me, src) => queue(loadJob(src.it, null, src.gunMag)),
    fillfrom: (me, src) => { GG().each(grids(me), (m) => { if (m.k === 'mag' && m.n < m.cap && G.calOf(G.WEAPONS[m.wid]) === src.it.key) queue(loadJob(m, src.it)); }); },
  };
  const doAct = {
    combine: (me, src) => { const n = GG().combine(grids(me), src.it.key, src.it.am); toast(n, 'Combined:'); G.Audio.click(); },
    magout: (me, src) => { const m = magItem(src.it.w); if (field && !GG().roomFor(me, m)) return G.HUD.toast('', 'No room on you for the magazine', 1.5); detach(me, { gunMag: src.it.w }); GG().stow(me, m); G.Audio.click(); },
    magin: (me, src) => { const m = bestMag(me, src.it.w); if (m) intoGun(me, locate(me, m.uid), src.it); },
    magto: (me, src, i) => { const w = GG().guns(me)[+i]; if (w) intoGun(me, src, GG().gunItem(w)); },
    unloadgun: (me, src) => { if (!roomForRounds(me, G.calOf(src.it.w.def))) return; toast(GG().unloadGun(me, src.it.w), 'Rounds out:'); G.Audio.click(); },
    loadgun: (me, src) => { toast(GG().fillGun(me, src.it.w), 'Rounds in:'); G.Audio.click(); },
    unloadmag: (me, src) => { if (!roomForRounds(me, G.calOf(G.WEAPONS[src.it.wid]), src.g)) return; const n = GG().unloadMag(me, src.it, src.g ? [src.g] : null); if (src.gunMag) src.gunMag.mag = 0; toast(n, 'Rounds out:'); G.Audio.click(); },
    loadmag: (me, src) => { const n = GG().fillMag(me, src.it); if (src.gunMag) { src.gunMag.mag = src.it.n; src.gunMag.ammo = src.it.am; } toast(n, 'Rounds in:'); G.Audio.click(); },
    fillfrom: (me, src) => { const n = GG().fillFrom(me, src.it); if (src.it.n <= 0 && src.g) GG().removeFrom(src.g, src.it); toast(n, 'Loaded'); G.Audio.click(); },
    fit: (me, src, i) => {
      const w = GG().guns(me)[+i], p = GS().PARTS[src.it.pid];
      const sl = w && GS().slotsOf(w.def.id, w.def.build).find((s) => GS().fitsSlot(s, p));
      if (sl) fitPart(me, src, `${GG().gunItem(w).uid}|${sl.slot}`);
    },
  };
  function onMenu(e) {
    const el = e.target.closest('.inv-item');
    if (!el) return;
    e.preventDefault();
    closeMenu();
    if (locked()) return;
    const me = G.Me, src = locate(me, +el.dataset.uid);
    if (!src) return;
    const Gr = GG(), acts = [];
    if (canOpen(me, src)) acts.push(['open', src.it.k === 'gun' ? 'Open (parts, magazine)' : 'Open']);
    acts.push(...itemActs(me, src));
    const q = field ? null : quickLabel(me, src);
    if (q && !(src.gunPart && cantDetach(src))) acts.push(['move', src.gunPart ? 'Take off (to locker)' : src.gunMag ? 'Take out (to locker)' : q]);
    if (field && !src.gunPart) acts.push(['drop', 'Drop on the ground']);
    const price = Math.floor(Gr.price(src.it) * 0.5);
    if (!field && price > 0 && !hasContents(src.it) && !lastGun(me, src) && !cantDetach(src)) acts.push(['sell', `Sell for ¢${G.U.fmt(price)}`]);
    if (!acts.length) return;
    menu = document.createElement('div');
    menu.className = 'inv-menu';
    menu.innerHTML = `<b>${G.U.esc(Gr.defOf(src.it) ? Gr.defOf(src.it).name : Gr.label(src.it))}</b>` + acts.map(([a, n, arg]) => `<button data-act="${a}"${arg != null ? ` data-arg="${arg}"` : ''}>${n}</button>`).join('');
    Object.assign(menu.style, { left: Math.min(e.clientX, innerWidth - 180) + 'px', top: Math.min(e.clientY, innerHeight - 30 - acts.length * 26) + 'px' });
    menu.addEventListener('click', (ev) => {
      const b = ev.target.closest('[data-act]');
      if (!b) return;
      const now = locate(me, src.it.uid);
      closeMenu();
      if (!now) return;
      if (b.dataset.act === 'open') open(me, now);
      else if (b.dataset.act === 'drop') { dropIt(me, now); rerender(); }
      else if (b.dataset.act === 'move') quickMove(me, now);
      else if (field && fieldAct[b.dataset.act]) { fieldAct[b.dataset.act](me, now, b.dataset.arg); rerender(); }
      else if (doAct[b.dataset.act]) { doAct[b.dataset.act](me, now, b.dataset.arg); rerender(); }
      else { sellIt(me, now); rerender(); }
    });
    document.body.appendChild(menu);
    setTimeout(() => window.addEventListener('pointerdown', outside, true));
  }

  return {
    show(el, opts) { field = !!(opts && opts.field); patient = opts && opts.patient != null ? opts.patient : null; ptPart = null; cab = opts && opts.cab != null ? opts.cab : null; root = el; el.classList.add('inv-host'); if (!el.dataset.invBound) { el.dataset.invBound = 1; el.addEventListener('pointerdown', (e) => root && onDown(e)); el.addEventListener('dblclick', (e) => root && onDbl(e)); el.addEventListener('contextmenu', (e) => root && onMenu(e));
        el.addEventListener('click', (e) => {
          if (!root) return;
          if (e.target.closest('[data-molle]')) { editMolle = !editMolle; G.Audio.click(); render(); }
          if (e.target.closest('[data-jobcancel]')) { cancelJobs(); G.Audio.click(); return; }
          if (e.target.closest('[data-revive]')) { reviveJob(); return; }
          if (e.target.closest('[data-self]')) { patient = null; ptPart = null; G.Audio.click(); render(); return; }
          const bp = e.target.closest('[data-body]');
          if (bp && field && performance.now() - lastDropAt > 250) { // (not the click that ends a drag onto it)
            ptPart = bp.dataset.body; G.Audio.click();
            const el = document.getElementById('invHealth'); if (el) el.innerHTML = healthHTML(G.Me);
            medMenu(ptPart, e.clientX, e.clientY);
            return;
          }
          const x = e.target.closest('[data-close]');
          if (x) { opened = opened.filter((u) => u !== +x.dataset.close); G.Audio.click(); render(); }
        }); } render(); },
    // the stash redrawn (the team locker changed under you), unless you're mid-drag
    refresh() { if (root && !field && !drag) rerender(); },
    // something you took from the team locker that someone else had taken first: gone from wherever you put it
    lose(tid) {
      const me = G.Me, seen = [];
      const walk = (gs) => { for (const g of gs) for (const p of g.items) { if (p.it.tid === tid) seen.push({ it: p.it, g }); walk(innerGrids(p.it)); } };
      walk([...GG().all(me), me.locker]);
      for (const s of [...GEAR_SLOTS, 'wp', 'ws']) { const it = slotItem(me, s); if (it && it.tid === tid) seen.push({ it, slot: s }); }
      const f = seen[0];
      if (f) { if (f.slot && WSLOT[f.slot] && Object.keys(me.weapons).length <= 1) return; detach(me, f); }
    },
    hide() { cancelJobs(); if (root) cabSync(); cab = null; patient = null; closeMenu(); if (drag) { drag.ghost.remove(); drag = null; } if (root) root.classList.remove('inv-host'); root = null; field = false; },
    // the health panel only (kept fresh while the field screen is open, without disturbing a drag)
    update,
    get busy() { return jobs.length > 0; },
    tick() { const el = field && root && document.getElementById('invHealth'); if (el) el.innerHTML = healthHTML(G.Me); },
    get field() { return field; },
    get cab() { return cab; },
    scaleUI,
    render,
  };
})();
