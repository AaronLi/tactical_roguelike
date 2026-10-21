'use strict';
// The hangar: where the squad spends the time between levels. A real place on the same map machinery as a level
// (G.Level.generateHub: walls, floor, lights, collision, rays), dressed by hand here:
//   the workshop (west): a bench for each officer, with a computer that opens the gunsmith, and a rack of the
//     gunsmith's parts for sale;
//   the store (middle): Vex at his counter (his till opens the whole stock), the kit for sale on pedestals,
//     a shelf of pouches, and two vending machines (ammunition; medical gear and grenades);
//   the warehouse (east): a robotic crane over the stash, and a console that opens your stash and loadout;
//   the helipad (out the front): hold F on the helicopter to climb in and ready up; hold F again to get out.
// Everything for sale can be bought by looking at it (F); the till, the bench computers, the console and the
// machines' screens open the same shop panels (js/shop.js) a menu would. Nothing here is on the host: the hangar
// is the same on every machine, bought stock is a matter for each player, and where everyone stands is what
// they already tell the host.
G.Hangar = (() => {
  const T = THREE;
  // ------------------------------------------------------------------------ the plan (metres)
  // Everything below is in the hall's own coordinates (its north wall at z 0..2, the range beyond it at negative z). The
  // map has the range's rows first: RZ is how far the hall sits from the map's origin. The scene hangs from a group set
  // RZ in (so meshes just use the hall's), and what's in the world (solids, targets, where you stand) adds it.
  const RZ = G.HANGAR_ROWS * 2;
  const HELI = { x: 26, z: 36.2, floor: 0.55, seats: 6 };
  const BENCH = (i) => ({ x: 2.1, x1: 3.25, z: 4 + i * 4 });
  const COUNTER = { x0: 22, x1: 28, z0: 4, z1: 5, h: 1.05 }, VEX = { x: 25, z: 2.9 };
  const STAND = { z: 12.5, xs: [22, 25, 28], top: 0.95 };
  const POUCH = { x0: 17.2, x1: 18.0, z0: 8.7, step: 1.12, n: 5 };
  const ZERO = { x0: 6.3, x1: 8.1, z0: 13.1, z1: 14.9, h: 0.9 }; // the zeroing table, in the middle of the workshop floor
  const PARTS = { x0: 12.9, z: 3.5, step: 1.3, n: 6, top: 0.9 }; // the gunsmith's parts, on pedestals along the north wall (east of the range's garage door)
  const VEND = [{ id: 'ammo', title: 'AMMUNITION', x: 35.0, z: 10.0, cols: 2, rows: 3, tab: 'svc' }, { id: 'supply', title: 'FIELD SUPPLIES', x: 35.0, z: 12.2, cols: 3, rows: 3, tab: 'svc' }];
  const CONSOLE = { x0: 38.2, x1: 39.1, z0: 12.6, z1: 15.4 };
  const STACK = { x: 44.5, z: 14 };
  const REACH = 3.2, HELI_REACH = 4.2, HOLD = 1.1;

  const S = { root: null, map: null, targets: [], items: [], stands: [], rigs: [], crane: null, heli: null, vend: [], hover: null, hold: 0, hl: null, t: 0, vexQuip: 0, key: '' };

  // ------------------------------------------------------------------------ the solids (every machine's map has them)
  function decorate(map) {
    const w = map.world, add = (x0, y0, z0, x1, y1, z1, o) => G.World.add(w, G.World.box(x0, y0, z0 + RZ, x1, y1, z1 + RZ, Object.assign({ kind: 'prop' }, o || {})));
    for (let i = 0; i < 6; i++) { const b = BENCH(i); add(b.x, 0, b.z - 1.1, b.x1, 0.9, b.z + 1.1); }
    for (let i = 0; i < PARTS.n; i++) { const x = PARTS.x0 + i * PARTS.step; add(x - 0.36, 0, PARTS.z - 0.34, x + 0.36, 1.5, PARTS.z + 0.34); } // (a parts pedestal, and the air its part turns in)
    add(ZERO.x0, 0, ZERO.z0, ZERO.x1, ZERO.h + 0.05, ZERO.z1); // (the zeroing table)
    add(COUNTER.x0, 0, COUNTER.z0, COUNTER.x1, COUNTER.h, COUNTER.z1);
    add(COUNTER.x0 - 0.1, 0, 2, COUNTER.x0 + 0.1, 2.2, COUNTER.z1); add(COUNTER.x1 - 0.1, 0, 2, COUNTER.x1 + 0.1, 2.2, COUNTER.z1);
    add(COUNTER.x0, 0, 2, COUNTER.x1, 2.2, 2.45);
    if (G.Range) G.Range.decorate(map, add);
    for (const x of STAND.xs) add(x - 0.5, 0, STAND.z - 0.45, x + 0.5, 2.0, STAND.z + 0.45); // (a pedestal, and the air its piece hangs in)
    add(POUCH.x0, 0, POUCH.z0 - 0.2, POUCH.x1, 1.9, POUCH.z0 + POUCH.n * POUCH.step);
    for (const v of VEND) add(v.x, 0, v.z - 0.55, v.x + 1.1, 1.95, v.z + 0.55);
    add(CONSOLE.x0, 0, CONSOLE.z0, CONSOLE.x1, 1.2, CONSOLE.z1);
    add(STACK.x - 1.2, 0, STACK.z - 1.2, STACK.x + 1.2, 1.7, STACK.z + 1.2);
    for (const [x, z] of [[38.2, 7], [49.6, 7], [38.2, 21], [49.6, 21]]) add(x - 0.2, 0, z - 0.2, x + 0.2, 3.5, z + 0.2); // (the crane's rail posts)
    add(49.0, 0, 3, 50, 2.4, 11); add(49.0, 0, 17, 50, 2.4, 25); // (racking against the east wall)
    // the helicopter: the cabin and nose, and the tail boom (above head height at its end, but there's no walking through it)
    add(HELI.x - 3.4, 0, HELI.z - 1.35, HELI.x + 2.4, 2.8, HELI.z + 1.35);
    add(HELI.x + 2.4, 1.5, HELI.z - 0.3, HELI.x + 8.0, 2.5, HELI.z + 0.3);
  }

  // ------------------------------------------------------------------------ drawing helpers
  const mats = {};
  const M = (c, o) => { const k = c + JSON.stringify(o || {}); return mats[k] || (mats[k] = new T.MeshStandardMaterial(Object.assign({ color: c, roughness: 0.75, metalness: 0.15 }, o || {}))); };
  const box = (parent, x0, y0, z0, x1, y1, z1, mat) => {
    const m = new T.Mesh(new T.BoxGeometry(x1 - x0, y1 - y0, z1 - z0), mat);
    m.position.set((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2); parent.add(m); return m;
  };
  const cyl = (parent, r, h, mat, x, y, z, seg = 14) => { const m = new T.Mesh(new T.CylinderGeometry(r, r, h, seg), mat); m.position.set(x, y, z); parent.add(m); return m; };
  function canvasTex(w, h, draw) {
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    draw(c.getContext('2d'), w, h);
    const t = new T.CanvasTexture(c); t.anisotropy = 4; return t;
  }
  const fit = (g, text, max) => { let s = 1; while (s < 60 && g.measureText(text).width > max) { s++; g.font = g.font.replace(/\d+px/, (n) => (parseInt(n) - 1) + 'px'); } };
  // a sign: lines of text on a coloured board (a line starting with ! is a warning, in orange). The name and the price
  // are as big as fit; the lines under them share one size, the smallest any of them needs.
  function signMat(lines, w, h, bg, fg, sub) {
    return new T.MeshBasicMaterial({ map: canvasTex(w, h, (g) => {
      g.fillStyle = bg; g.fillRect(0, 0, w, h); g.strokeStyle = fg; g.lineWidth = 3; g.strokeRect(4, 4, w - 8, h - 8);
      g.textAlign = 'center'; g.textBaseline = 'middle';
      const n = lines.length, lh = h / n, text = (l) => (l[0] === '!' ? l.slice(1) : l);
      const ys = n === 1 ? [0.5] : n === 2 ? [0.33, 0.72] : lines.map((_, i) => (i + 0.5) / n);
      const want = n === 1 ? [0.5 * h] : n === 2 ? [0.42 * h, 0.28 * h] : lines.map((_, i) => (i < 2 ? 0.6 : 0.44) * lh);
      const size = (t, px, bold) => { g.font = `${bold ? 'bold ' : ''}${Math.round(px)}px sans-serif`; const m = g.measureText(t).width; return m > w - 24 ? Math.max(8, Math.floor(px * (w - 24) / m)) : Math.round(px); };
      const detail = lines.length > 2 ? Math.min(...lines.slice(2).map((l) => size(text(l), want[2], false))) : 0;
      lines.forEach((l, i) => {
        const warn = l[0] === '!', px = i >= 2 ? detail : size(text(l), want[i], i === 0);
        g.font = `${i === 0 ? 'bold ' : ''}${px}px sans-serif`; g.fillStyle = warn ? '#ff9a5a' : i && sub ? sub : fg;
        g.fillText(text(l), w / 2, h * ys[i]);
      });
    }) });
  }
  // a screen: a title, and a few lines
  function screenMat(title, lines, w = 256, h = 160, color = '#7fe0ff') {
    return new T.MeshBasicMaterial({ map: canvasTex(w, h, (g) => {
      g.fillStyle = '#05121a'; g.fillRect(0, 0, w, h);
      g.fillStyle = 'rgba(80,200,255,0.06)'; for (let y = 0; y < h; y += 4) g.fillRect(0, y, w, 1);
      g.fillStyle = color; g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = `bold ${Math.round(h * 0.2)}px monospace`; fit(g, title, w - 20); g.fillText(title, w / 2, h * 0.28);
      g.font = `${Math.round(h * 0.12)}px monospace`; g.fillStyle = '#a8e8ff';
      lines.forEach((ln, i) => g.fillText(ln, w / 2, h * (0.55 + i * 0.17)));
    }) });
  }
  const texCache = new Map();
  function iconMat(url) {
    if (!texCache.has(url)) { const t = new T.TextureLoader().load(url); t.anisotropy = 4; const m = new T.MeshBasicMaterial({ map: t, transparent: true }); m.userData.keep = true; texCache.set(url, m); }
    return texCache.get(url);
  }
  // take everything out of a group, signs' textures and all (the shared icon materials stay)
  function clear(g) {
    while (g.children.length) {
      const c = g.children[0]; g.remove(c);
      c.traverse((o) => { if (o.geometry) o.geometry.dispose(); const m = o.material; if (m && !m.userData.keep) { if (m.map) m.map.dispose(); m.dispose(); } });
    }
  }
  const money = (n) => '¢' + G.U.fmt(n);

  // a product on display: a card with the item's icon, `s` metres per cell of it, and a tag under it
  function product(parent, item, x, y, z, yaw, tag, s = 0.13, tagMat = null) {
    const [cw, ch] = G.Gear.size(item), w = Math.max(0.22, cw * s), h = Math.max(0.22, ch * s), g = new T.Group();
    g.position.set(x, y, z); g.rotation.y = yaw;
    const back = new T.Mesh(new T.BoxGeometry(w + 0.04, h + 0.04, 0.03), M(0x1b1e22)); back.position.z = 0; g.add(back);
    const ic = new T.Mesh(new T.PlaneGeometry(w, h), iconMat(G.Icons.of(item, cw, ch, false))); ic.position.z = 0.0165; g.add(ic);
    parent.add(g);
    if (tag) { const t = new T.Mesh(new T.PlaneGeometry(0.46, 0.17), tag); t.position.set(0, -h / 2 - 0.14, 0.02); g.add(t); }
    return g;
  }
  const tagMat = (name, price, extra) => signMat([name, price + (extra ? ' · ' + extra : '')], 288, 96, '#101418', '#ffd24a', '#ffffff');

  // ------------------------------------------------------------------------ what's for sale: one row per thing
  // A thing for sale or to use: its box (what you look at), what it says, and what F does.
  function addTarget(t) { t.box = [t.box[0], t.box[1], t.box[2] + RZ, t.box[3], t.box[4], t.box[5] + RZ]; S.targets.push(t); return t; } // (boxes are said in the hall's coordinates, kept in the world's)
  const gearOf = (id) => G.Gear.DEFS[id];
  // what a piece of gear fits on that isn't part of the sale (a plate goes in a carrier, a face guard on a helmet)
  const needs = (d) => (d.kind === 'plate' ? 'carrier not included' : d.kind === 'face' ? 'helmet not included' : null);
  // The piece on show, on its own. The same models the squad wears (js/rig.js setKit makes them in the frames of a body):
  // built on a body that's thrown away, each part lifted out by what it is (helmet, face guard, carrier, belt, pack) and
  // set down where it hung. A plate isn't part of a carrier's model: it's drawn here, to stand beside it.
  const PLATE_COL = { 'p.soft': 0x5a6a78, 'p.steel': 0x3d4044, 'p.pe': 0xcfd2d6, 'p.ceramic': 0xb8a888, 'p.ceramic2': 0xd6cdb4 };
  function plateMesh(id, k = 1) {
    const g = new T.Group(), c = PLATE_COL[id] || 0x4a4f55;
    box(g, -0.14 * k, 0, -0.012 * k, 0.14 * k, 0.36 * k, 0.012 * k, M(c, { roughness: 0.5, metalness: 0.4 }));
    box(g, -0.115 * k, 0.02 * k, 0.012 * k, 0.115 * k, 0.34 * k, 0.017 * k, M(c, { roughness: 0.9 })); // (its face: a raised panel)
    return g;
  }
  const SHOW = { carrier: ['carrier'], helmet: ['helmet', 'face'], face: ['face'], belt: ['belt'], pack: ['pack'] }, SCALE = { carrier: 1.45, helmet: 1.9, face: 2.1, belt: 1.7, pack: 1.5 };
  function showPiece(id) {
    const d = gearOf(id), O = G.Shop.offers || {}, np = (d.pouches || []).length, root = new T.Group();
    if (d.kind === 'plate') { const p = plateMesh(id, 2.3); p.position.y = STAND.top + 0.14; p.rotation.x = -0.14; root.add(p); return { root, spin: null }; }
    const kit = d.kind === 'carrier' ? { carrier: id, plate: 0, cp: np } : d.kind === 'helmet' ? { helmet: id, face: O.faces && O.faces[id] || 0 }
      : d.kind === 'face' ? { helmet: 'h.fast', face: id } : d.kind === 'belt' ? { belt: id, bp: np } : { pack: id };
    const rig = G.Rig.create({ style: 'tactical', bare: true, mannequin: true, look: { top: 'tshirt', topC: 0xb4bac0, pants: 'jeans', pantsC: 0x9aa1a8, eyes: 'none', gloves: 'none' }, seed: 5 });
    rig.setKit(kit); rig.root.updateMatrixWorld(true);
    const g = new T.Group();
    for (const m of rig.kitParts) {
      if (!SHOW[d.kind].includes(m.userData.part)) continue;
      const c = new T.Mesh(m.geometry, m.material); m.updateWorldMatrix(true, false); m.matrixWorld.decompose(c.position, c.quaternion, c.scale); g.add(c);
    }
    // a plate that comes with a carrier stands beside it, in the same turning group (so they turn together)
    const pl = d.kind === 'carrier' && O.plates && O.plates[id];
    if (pl) {
      const b0 = new T.Box3().setFromObject(g), p = plateMesh(pl, 1);
      p.rotation.set(-0.12, Math.PI + 0.35, 0); // (its face to the front, leaning a little)
      p.position.set(b0.max.x + 0.2, b0.min.y, (b0.min.z + b0.max.z) / 2);
      g.add(p);
    }
    const bb = new T.Box3().setFromObject(g), ctr = bb.getCenter(new T.Vector3());
    g.position.set(-ctr.x, -bb.min.y, -ctr.z);
    const pivot = new T.Group(); pivot.add(g); pivot.scale.setScalar(SCALE[d.kind] || 1.5); pivot.position.y = STAND.top + 0.12; pivot.rotation.y = Math.PI; // (worn, its front's -z: turned to face the aisle)
    root.add(pivot);
    return { root, spin: pivot };
  }
  // A gunsmith's part on show, on its own: built on a gun it fits (in a slot it takes there), all but the part left
  // out. If it can't be (a receiver kit, a dot that sits on a riser), its card instead.
  function partPiece(id) {
    const GS = G.Gunsmith, p = GS.PARTS[id], root = new T.Group();
    let g = null;
    for (const gid of GS.fits(p.mount)) {
      const b = GS.defaultBuild(gid), sl = GS.slotFor(gid, b, p);
      if (!sl) continue;
      b[sl.slot] = id; GS.prune(gid, b);
      if (b[sl.slot] !== id) continue;
      const { group } = G.GunModels.display(GS.compile(gid, b)), keep = [];
      group.updateMatrixWorld(true);
      group.traverse((o) => { if (o.isMesh && o.userData.slot === sl.slot) keep.push(o); });
      if (keep.length) {
        g = new T.Group();
        for (const m of keep) { const c = new T.Mesh(m.geometry, m.material); m.matrixWorld.decompose(c.position, c.quaternion, c.scale); m.material.userData.keep = true; g.add(c); } // (the guns' own materials: shared, kept)
      }
      group.traverse((o) => { if (o.isMesh && !keep.includes(o)) o.geometry.dispose(); });
      if (g) break;
    }
    if (!g) { product(root, G.Gear.partItem(id), 0, PARTS.top + 0.24, 0, 0, null, 0.1); return { root, spin: null }; }
    const bb = new T.Box3().setFromObject(g), ctr = bb.getCenter(new T.Vector3()), sz = bb.getSize(new T.Vector3());
    g.position.copy(ctr).negate();
    const k = Math.min(4.5, 0.5 / Math.max(sz.x, sz.y, sz.z, 0.02)), pivot = new T.Group();
    pivot.add(g); pivot.scale.setScalar(k); pivot.position.y = PARTS.top + 0.08 + Math.max(sz.y, sz.x, sz.z) * k / 2;
    pivot.rotation.x = 0; pivot.rotation.y = Math.PI / 2; // (side on to the aisle to start)
    root.add(pivot);
    return { root, spin: pivot };
  }
  // what's on the sign: the name, the price, and everything that comes with it (or doesn't)
  function signFor(id, sold) {
    const d = gearOf(id), Sh = G.Shop, O = Sh.offers, L = [d.name, sold ? 'SOLD' : money(Sh.gearPrice(id))];
    if (sold) return L;
    const pl = O.plates && O.plates[id] && gearOf(O.plates[id]), fc = O.faces && O.faces[id] && gearOf(O.faces[id]);
    if (d.kind === 'carrier') {
      if (d.molle) L.push('comes with: ' + Sh.issued(d));
      if (pl) L.push('plate included: ' + pl.name); else if (d.plate) L.push('!plate pocket: plate not included');
    } else if (d.kind === 'helmet') {
      if (fc) L.push('face guard included: ' + fc.name); else if (d.face) L.push('!face guard not included');
    } else if (d.kind === 'belt') L.push('comes with: ' + Sh.issued(d));
    else if (d.kind === 'pack') { const [w, h] = d.grids[0]; L.push(`holds ${w}×${h}`); }
    else if (d.kind === 'plate') L.push('!carrier not included');
    else if (d.kind === 'face') L.push('!helmet not included');
    return L;
  }

  // ------------------------------------------------------------------------ building the scene
  function enter(map) {
    leave();
    S.map = map; S.root = new T.Group(); S.targets = []; S.items = []; S.stands = []; S.rigs = []; S.vend = []; S.t = 0; S.hold = 0; S.vexQuip = 3; S.key = ''; S.rosterKey = rosterKey();
    S.root.position.z = RZ;
    G.R.levelRoot.add(S.root);
    zones(); workshop(); store(); warehouse(); helicopter(); if (G.Range) G.Range.build(S.root, S, { box, M, signMat, canvasTex, addTarget }); outline();
    refresh(true);
  }
  function leave() {
    if (G.Range) G.Range.leave();
    if (S.root && S.root.parent) S.root.parent.remove(S.root);
    S.root = null; S.map = null; S.targets = []; S.items = []; S.rigs = []; S.crane = null; S.heli = null; S.hover = null;
  }
  const rosterKey = () => Object.keys(G.Game.roster || {}).sort().join(',');

  // floor markings and the signs hung over each part of the hall
  function zones() {
    const r = S.root;
    const stripe = (x0, z0, x1, z1, c) => { const m = new T.Mesh(new T.PlaneGeometry(x1 - x0, z1 - z0), new T.MeshBasicMaterial({ color: c })); m.rotation.x = -Math.PI / 2; m.position.set((x0 + x1) / 2, 0.012, (z0 + z1) / 2); r.add(m); };
    for (const x of [16, 36]) for (let z = 3; z < 26; z += 1.2) stripe(x - 0.06, z, x + 0.06, z + 0.6, 0xe8c030); // (dashed yellow between the three parts)
    for (let x = 18; x < 34; x += 1.2) stripe(x, 26.7, x + 0.6, 26.86, 0x303438);
    const hang = (text, sub, x, z, color) => {
      const m = new T.Mesh(new T.PlaneGeometry(4.2, 0.95), signMat([text, sub], 512, 128, '#0f1215', color, '#cfd6dc'));
      m.position.set(x, 3.15, z); r.add(m);
      const b = m.clone(); b.rotation.y = Math.PI; b.position.z = z - 0.02; r.add(b);
      for (const dx of [-1.9, 1.9]) box(r, x + dx - 0.015, 3.5, z - 0.01, x + dx + 0.015, 4, z + 0.01, M(0x30343a));
    };
    hang('WORKSHOP', 'a bench for each of you', 9, 7.5, '#ffb43a');
    hang('STORE', 'look at it, press F', 26, 8.2, '#58b8ff');
    hang('WAREHOUSE', 'stash and loadout', 44, 8.5, '#ff7a4a');
    // light fittings over the hall (the real lights are in the map: these are what they hang from)
    for (const L of S.map.lights || []) { if (L.porch || L.kind) continue; box(r, L.x - 0.45, 3.82, L.z - RZ - 0.12, L.x + 0.45, 3.96, L.z - RZ + 0.12, new T.MeshBasicMaterial({ color: 0xfff6e0 })); }
  }

  // ---- the workshop: six benches, a computer on each, and the gunsmith's parts on the wall
  function workshop() {
    const r = S.root, ids = Object.keys(G.Game.roster || {}).sort();
    for (let i = 0; i < 6; i++) {
      const b = BENCH(i), owner = ids[i] ? G.Game.roster[ids[i]] : null, mine = ids[i] === G.Net.myId;
      box(r, b.x, 0, b.z - 1.1, b.x1, 0.84, b.z + 1.1, M(0x4a4f55));                  // the cabinet
      box(r, b.x - 0.02, 0.84, b.z - 1.15, b.x1 + 0.1, 0.9, b.z + 1.15, M(0x9a7a50, { roughness: 0.6 })); // the top
      box(r, b.x, 0.9, b.z - 1.1, b.x + 0.1, 1.45, b.z + 1.1, M(0x3b3f44));           // the splashback
      for (const dz of [-0.7, 0, 0.7]) box(r, b.x + 0.12, 0.2, b.z + dz - 0.3, b.x1 + 0.01, 0.78, b.z + dz + 0.3, M(0x363a3f)); // drawers
      // the computer: a monitor on the top, turned to whoever stands at the bench
      box(r, b.x + 0.2, 0.9, b.z - 0.12, b.x + 0.5, 0.98, b.z + 0.12, M(0x25282c));
      box(r, b.x + 0.34, 0.98, b.z - 0.03, b.x + 0.4, 1.12, b.z + 0.03, M(0x25282c));
      box(r, b.x + 0.3, 1.1, b.z - 0.34, b.x + 0.38, 1.42, b.z + 0.34, M(0x16181a));
      const scr = new T.Mesh(new T.PlaneGeometry(0.62, 0.3), screenMat('GUNSMITH', [owner ? owner.name.toUpperCase() : 'FREE BENCH', mine ? 'F: work on your guns' : owner ? 'their bench' : ''], 256, 124));
      scr.rotation.y = Math.PI / 2; scr.position.set(b.x + 0.385, 1.26, b.z); r.add(scr);
      // a vice, a lamp and a few parts about
      box(r, b.x + 0.65, 0.9, b.z + 0.55, b.x + 0.95, 1.0, b.z + 0.85, M(0x6b7076, { metalness: 0.6 }));
      box(r, b.x + 0.7, 1.0, b.z + 0.62, b.x + 0.9, 1.08, b.z + 0.78, M(0x6b7076, { metalness: 0.6 }));
      box(r, b.x + 0.5, 0.9, b.z - 0.85, b.x + 1.0, 0.94, b.z - 0.45, M(0x2a3a2a));
      const lamp = new T.Mesh(new T.ConeGeometry(0.1, 0.12, 12, 1, true), M(0xcfa030, { side: T.DoubleSide })); lamp.position.set(b.x + 0.45, 1.72, b.z + 0.9); lamp.rotation.z = Math.PI; r.add(lamp);
      box(r, b.x + 0.44, 0.95, b.z + 0.89, b.x + 0.46, 1.65, b.z + 0.91, M(0x303438));
      // the nameplate on the front edge
      const np = new T.Mesh(new T.PlaneGeometry(0.7, 0.16), signMat([owner ? owner.name : 'free bench'], 256, 64, mine ? '#17331f' : '#16181c', mine ? '#7dff9a' : '#c8d0d8'));
      np.rotation.y = Math.PI / 2; np.position.set(b.x1 + 0.012, 0.74, b.z); r.add(np);
      // a pegboard of tools above it
      box(r, 2.02, 1.5, b.z - 1.0, 2.1, 2.5, b.z + 1.0, M(0x5a4a38));
      for (let k = 0; k < 6; k++) box(r, 2.1, 1.7 + (k % 3) * 0.25, b.z - 0.8 + k * 0.3, 2.14, 1.9 + (k % 3) * 0.25, b.z - 0.76 + k * 0.3, M(k % 2 ? 0x9aa0a6 : 0xb04a2a));
      addTarget({ id: 'bench' + i, kind: 'pos', box: [b.x, 0.9, b.z - 0.55, b.x1, 1.5, b.z + 0.55], label: owner ? (mine ? 'your bench' : owner.name + "'s bench") : 'a free bench', who: ids[i], tab: 'gunsmith', title: 'the gunsmith', mine });
    }
    // the zeroing table: a shooting bench with a rest on it and a screen drawing a round's path against the line of sight
    {
      const Z = ZERO, cx = (Z.x0 + Z.x1) / 2, cz = (Z.z0 + Z.z1) / 2;
      box(r, Z.x0, Z.h - 0.06, Z.z0, Z.x1, Z.h, Z.z1, M(0x6a5a44, { roughness: 0.6 }));
      for (const [x, z] of [[Z.x0 + 0.08, Z.z0 + 0.08], [Z.x1 - 0.08, Z.z0 + 0.08], [Z.x0 + 0.08, Z.z1 - 0.08], [Z.x1 - 0.08, Z.z1 - 0.08]]) box(r, x - 0.04, 0, z - 0.04, x + 0.04, Z.h - 0.06, z + 0.04, M(0x3b3f44));
      box(r, cx - 0.12, Z.h, Z.z1 - 0.55, cx + 0.12, Z.h + 0.12, Z.z1 - 0.25, M(0x6b6a4a, { roughness: 1 })); // (a sandbag rest)
      box(r, cx - 0.1, Z.h, Z.z0 + 0.25, cx + 0.1, Z.h + 0.1, Z.z0 + 0.5, M(0x6b6a4a, { roughness: 1 }));
      box(r, Z.x0 + 0.15, Z.h, cz - 0.05, Z.x0 + 0.3, Z.h + 0.35, cz + 0.05, M(0x25282c)); // (the screen's stand)
      const scr = new T.Mesh(new T.PlaneGeometry(0.9, 0.5), new T.MeshBasicMaterial({ map: canvasTex(360, 200, (g) => {
        g.fillStyle = '#05121a'; g.fillRect(0, 0, 360, 200);
        g.fillStyle = '#ffb43a'; g.font = 'bold 22px monospace'; g.textAlign = 'center'; g.fillText('ZEROING', 180, 28);
        g.strokeStyle = '#3a5060'; g.setLineDash([6, 4]); g.beginPath(); g.moveTo(20, 110); g.lineTo(340, 110); g.stroke(); g.setLineDash([]);
        g.strokeStyle = '#ffb43a'; g.lineWidth = 3; g.beginPath();
        for (let x = 0; x <= 320; x += 4) { const d = x / 320, y = 128 - 70 * d * 1.9 + 120 * d * d * 1.9; x ? g.lineTo(20 + x, y) : g.moveTo(20, y); }
        g.stroke(); g.fillStyle = '#a8e8ff'; g.font = '15px monospace'; g.fillText('F: zero your sights', 180, 182);
      }) }));
      scr.position.set(Z.x0 + 0.24, Z.h + 0.55, cz); scr.rotation.y = Math.PI / 2; r.add(scr);
      const back = new T.Mesh(new T.BoxGeometry(0.03, 0.54, 0.94), M(0x16181a)); back.position.set(Z.x0 + 0.22, Z.h + 0.55, cz); r.add(back);
      addTarget({ id: 'zero', kind: 'pos', box: [Z.x0, Z.h, Z.z0, Z.x1, Z.h + 0.9, Z.z1], label: 'the zeroing table', tab: 'zero', title: 'the zeroing table' });
    }
    // the gunsmith's parts this visit: a pedestal for each, the part turning on top, its sign on the front (the name
    // over them on the wall behind)
    const ps = new T.Mesh(new T.PlaneGeometry(2.6, 0.5), signMat(['GUNSMITH PARTS', 'bought into your stash'], 512, 100, '#101418', '#ffb43a', '#cfd6dc'));
    ps.position.set(PARTS.x0 + (PARTS.n - 1) * PARTS.step / 2, 2.6, 2.02); r.add(ps);
    S.partStands = [];
    for (let i = 0; i < PARTS.n; i++) {
      const x = PARTS.x0 + i * PARTS.step, z = PARTS.z, top = PARTS.top;
      box(r, x - 0.48, 0, z - 0.46, x + 0.48, 0.08, z + 0.46, M(0x30353b));
      box(r, x - 0.46, 0.08, z - 0.44, x + 0.46, 0.092, z + 0.44, M(0xe8c030, { emissive: 0x302400 }));
      box(r, x - 0.32, 0.08, z - 0.3, x + 0.32, top - 0.03, z + 0.3, M(0x3a3f45, { roughness: 0.5 }));
      box(r, x - 0.35, top - 0.03, z - 0.33, x + 0.35, top, z + 0.33, M(0xe8c030, { emissive: 0x302400 }));
      const sign = new T.Mesh(new T.PlaneGeometry(0.6, 0.4), new T.MeshBasicMaterial({ color: 0x000000 })); sign.position.set(x, 0.5, z + 0.302); r.add(sign);
      const disp = new T.Group(); disp.position.set(x, 0, z); r.add(disp);
      const tg = addTarget({ id: 'part' + i, kind: 'buy', box: [x - 0.4, 0.1, z - 0.36, x + 0.4, 1.6, z + 0.36], what: 'part', key: null, sign, disp, spin: null });
      S.partStands.push(tg); S.items.push(tg);
    }
  }

  // ---- the store: Vex, the pedestals, the pouch shelf, the machines
  function store() {
    const r = S.root;
    // the counter and the booth
    box(r, COUNTER.x0, 0, COUNTER.z0, COUNTER.x1, COUNTER.h - 0.06, COUNTER.z1, M(0x3c4046));
    box(r, COUNTER.x0 - 0.05, COUNTER.h - 0.06, COUNTER.z0 - 0.05, COUNTER.x1 + 0.05, COUNTER.h, COUNTER.z1 + 0.05, M(0x8a6b45, { roughness: 0.55 }));
    box(r, COUNTER.x0 - 0.1, 0, 2, COUNTER.x0 + 0.1, 2.2, COUNTER.z1, M(0x2e3236)); box(r, COUNTER.x1 - 0.1, 0, 2, COUNTER.x1 + 0.1, 2.2, COUNTER.z1, M(0x2e3236));
    box(r, COUNTER.x0, 0, 2, COUNTER.x1, 2.2, 2.45, M(0x2a2d31));
    for (let k = 0; k < 4; k++) { box(r, COUNTER.x0 + 0.1, 0.5 + k * 0.5, 2.45, COUNTER.x1 - 0.1, 0.53 + k * 0.5, 2.9, M(0x5a5f66)); for (let j = 0; j < 9; j++) box(r, COUNTER.x0 + 0.25 + j * 0.62, 0.53 + k * 0.5, 2.5, COUNTER.x0 + 0.65 + j * 0.62, 0.7 + k * 0.5 + (j % 3) * 0.05, 2.8, M([0x4a5639, 0x7a2e2a, 0x3a4048, 0x8a6a3a][(j + k) % 4])); } // shelves of stock behind him
    const sign = new T.Mesh(new T.PlaneGeometry(2.8, 0.7), signMat(['VEX', 'quartermaster · no weapons, no refunds'], 512, 128, '#14171a', '#ff9a2e', '#d0d6dc')); sign.position.set(25, 2.7, 2.48); r.add(sign);
    // the till
    box(r, 24.2, COUNTER.h, 4.1, 25.8, COUNTER.h + 0.06, 4.7, M(0x2a2d31));
    box(r, 24.85, COUNTER.h + 0.06, 4.3, 25.15, COUNTER.h + 0.2, 4.5, M(0x2a2d31));
    const till = new T.Mesh(new T.PlaneGeometry(0.8, 0.3), screenMat('VEX // STOCK', ['F: everything in stock', 'gear · parts · pouches · ammo'], 288, 108, '#ffb43a'));
    till.position.set(25, COUNTER.h + 0.3, 4.37); till.rotation.x = -0.3; r.add(till);
    addTarget({ id: 'vex', kind: 'pos', box: [COUNTER.x0, 0.0, 2.2, COUNTER.x1, 2.1, 5.0], label: 'Vex', tab: 'stock', title: 'Vex: the whole stock' });
    // Vex himself
    const vex = G.Rig.create({ style: 'tactical', bare: true, vex: true, skinColor: 0x8a6e55, look: { top: 'hoodie', topC: 0x2b2a24, pants: 'cargo', pantsC: 0x23221c, eyes: 'none', gloves: 'leather' }, seed: 77, scale: 1.04 });
    vex.setKit({ carrier: 'c.recon', cp: 3, belt: 'b.battle', bp: 2, ifak: 1 });
    vex.root.position.set(VEX.x, 0, VEX.z); r.add(vex.root); S.rigs.push({ rig: vex, x: VEX.x, z: VEX.z, yaw: Math.PI, vex: true });

    // pedestals: one for each of the three pieces of gear for sale, the piece turning slowly on top, its sign on the front
    S.stands = [];
    STAND.xs.forEach((x, i) => {
      box(r, x - 0.8, 0, STAND.z - 0.8, x + 0.8, 0.1, STAND.z + 0.8, M(0x30353b));
      box(r, x - 0.78, 0.1, STAND.z - 0.78, x + 0.78, 0.115, STAND.z + 0.78, M(0xe8c030, { emissive: 0x302400 }));
      box(r, x - 0.5, 0.1, STAND.z - 0.45, x + 0.5, STAND.top - 0.04, STAND.z + 0.45, M(0x3a3f45, { roughness: 0.5 }));
      box(r, x - 0.54, STAND.top - 0.04, STAND.z - 0.49, x + 0.54, STAND.top, STAND.z + 0.49, M(0xe8c030, { emissive: 0x302400 }));
      const sign = new T.Mesh(new T.PlaneGeometry(0.94, 0.5), new T.MeshBasicMaterial({ color: 0x000000 })); sign.position.set(x, 0.5, STAND.z + 0.452); r.add(sign);
      const disp = new T.Group(); disp.position.set(x, 0, STAND.z); r.add(disp);
      const tg = addTarget({ id: 'stand' + i, kind: 'buy', box: [x - 0.55, 0.1, STAND.z - 0.5, x + 0.55, 2.1, STAND.z + 0.5], what: 'gear', key: null, sign, disp, spin: null, idx: i });
      S.stands.push(tg); S.items.push(tg);
    });
    // the pouch shelf (a unit with a row of cards at eye height on its east face)
    box(r, POUCH.x0, 0, POUCH.z0 - 0.2, POUCH.x1, 1.9, POUCH.z0 + POUCH.n * POUCH.step, M(0x3b4046));
    for (const y of [0.45, 0.95, 1.45]) box(r, POUCH.x1, y, POUCH.z0 - 0.2, POUCH.x1 + 0.26, y + 0.04, POUCH.z0 + POUCH.n * POUCH.step, M(0x6a7076));
    const psign = new T.Mesh(new T.PlaneGeometry(1.5, 0.4), signMat(['POUCHES', 'MOLLE · one at a time'], 384, 100, '#101418', '#58b8ff', '#cfd6dc')); psign.position.set(POUCH.x1 + 0.012, 2.05, POUCH.z0 + 2.4); psign.rotation.y = Math.PI / 2; r.add(psign);
    S.pouchSlots = [];
    for (let i = 0; i < POUCH.n; i++) {
      const z = POUCH.z0 + i * POUCH.step + 0.5, slot = new T.Group(); slot.position.set(0, 0, z); r.add(slot); S.pouchSlots.push(slot);
      const tg = addTarget({ id: 'pouch' + i, kind: 'buy', box: [POUCH.x1 - 0.1, 0.5, z - 0.5, POUCH.x1 + 0.45, 1.7, z + 0.5], slot, what: 'pouch', key: null });
      S.items.push(tg);
    }
    // the machines
    VEND.forEach((v) => machine(v));
    // a few crates and a barrel or two to make it a place
    for (const [x, z] of [[18.6, 18.5], [19.8, 18.7], [33.2, 19]]) box(r, x - 0.4, 0, z - 0.4, x + 0.4, 0.8, z + 0.4, M(0x8a6a3a, { roughness: 0.9 }));
  }
  // a vending machine: a cabinet with a screen across the top and a window of slots
  function machine(v) {
    const r = S.root, x1 = v.x + 1.1;
    box(r, v.x, 0, v.z - 0.55, x1, 1.95, v.z + 0.55, M(0x2d3237));
    box(r, v.x - 0.02, 1.6, v.z - 0.55, v.x + 0.02, 1.95, v.z + 0.55, M(0x15181b));
    const ttl = new T.Mesh(new T.PlaneGeometry(1.0, 0.3), screenMat(v.title, ['F: the full list'], 256, 76, v.id === 'ammo' ? '#ffd24a' : '#7dff9a'));
    ttl.rotation.y = -Math.PI / 2; ttl.position.set(v.x - 0.025, 1.78, v.z); r.add(ttl);
    const glass = new T.Mesh(new T.PlaneGeometry(0.98, 1.36), new T.MeshBasicMaterial({ color: 0x0b1620, transparent: true, opacity: 0.55 })); glass.rotation.y = -Math.PI / 2; glass.position.set(v.x - 0.02, 0.88, v.z); r.add(glass);
    box(r, v.x - 0.04, 0.12, v.z - 0.5, v.x + 0.02, 0.26, v.z + 0.5, M(0x0e0f10)); // the delivery flap
    const g = new T.Group(); r.add(g);
    const m = { v, group: g, key: '', slots: [] };
    S.vend.push(m);
    addTarget({ id: 'vend-' + v.id, kind: 'pos', box: [v.x - 0.5, 1.55, v.z - 0.55, v.x + 0.3, 2.0, v.z + 0.55], label: v.title.toLowerCase() + ' machine', tab: v.tab, title: v.title.toLowerCase() });
  }

  // ---- the warehouse: the crane over the stash, a console, racking
  function warehouse() {
    const r = S.root;
    // racking and stock against the east wall
    for (const [z0, z1] of [[3, 11], [17, 25]]) {
      for (const y of [0.35, 1.05, 1.75]) box(r, 49.0, y, z0, 50, y + 0.05, z1, M(0x4a6a8a));
      for (let z = z0; z <= z1; z += 2) box(r, 49.0, 0, z - 0.03, 49.05, 2.4, z + 0.03, M(0xd8602a));
      for (let k = 0; k < 6; k++) for (const y of [0.4, 1.1, 1.8]) box(r, 49.1, y, z0 + 0.3 + k * 1.25, 49.9, y + 0.5, z0 + 1.2 + k * 1.25, M([0x8a6a3a, 0x6f8a52, 0x7c8a96, 0x8a6a3a][(k + (y > 1 ? 1 : 0)) % 4], { roughness: 0.9 }));
    }
    // the console: two screens on a desk-high pedestal, turned to the store
    box(r, CONSOLE.x0, 0, CONSOLE.z0, CONSOLE.x1, 0.95, CONSOLE.z1, M(0x363b41));
    box(r, CONSOLE.x0 - 0.02, 0.95, CONSOLE.z0 - 0.05, CONSOLE.x1, 1.0, CONSOLE.z1 + 0.05, M(0x1c1f22));
    for (const [z, a, b] of [[13.55, 'STASH', 'your lockers'], [14.45, 'LOADOUT', 'what you carry']]) {
      box(r, CONSOLE.x0 + 0.05, 1.0, z - 0.4, CONSOLE.x0 + 0.13, 1.5, z + 0.4, M(0x16181a));
      const s = new T.Mesh(new T.PlaneGeometry(0.76, 0.46), screenMat(a, [b, 'F: open'], 256, 152, '#ff9a5a')); s.rotation.y = -Math.PI / 2; s.position.set(CONSOLE.x0 + 0.045, 1.25, z); r.add(s);
    }
    addTarget({ id: 'console', kind: 'pos', box: [CONSOLE.x0 - 0.1, 0.9, CONSOLE.z0, CONSOLE.x1, 1.6, CONSOLE.z1], label: 'the warehouse console', tab: 'kit', title: 'your stash and loadout', crane: true });
    // the stash: crates stacked in a cage the crane works over
    const stack = new T.Group(); stack.position.set(STACK.x, 0, STACK.z); r.add(stack);
    const crateCols = [0x8a6a3a, 0x6f8a52, 0x5a6a7a, 0x9a5a3a];
    for (let i = 0; i < 4; i++) for (let k = 0; k < 2; k++) box(stack, (i % 2 ? 0.02 : -1.12), k * 0.8, (i < 2 ? -1.12 : 0.02), (i % 2 ? 1.12 : -0.02), k * 0.8 + 0.78, (i < 2 ? -0.02 : 1.12), M(crateCols[(i + k) % 4], { roughness: 0.9 }));
    for (const [dx, dz] of [[-1.3, -1.3], [1.3, -1.3], [-1.3, 1.3], [1.3, 1.3]]) box(stack, dx - 0.04, 0, dz - 0.04, dx + 0.04, 1.75, dz + 0.04, M(0xf0c030)); // the cage's corner posts
    const sg = new T.Mesh(new T.PlaneGeometry(1.8, 0.4), signMat(['STASH', 'the crane keeps it'], 384, 96, '#101418', '#ff9a5a', '#cfd6dc')); sg.position.set(STACK.x, 2.05, STACK.z - 1.36); r.add(sg);
    // the loadout bay: a pallet where the crane sets down what you've asked for
    box(r, STACK.x - 1.2, 0, 19.0, STACK.x + 1.2, 0.14, 21.0, M(0x9a7a4a));
    // the crane: a bridge between two rails, a trolley on the bridge, a hoist with a grab
    const rail = M(0xf0c030), steel = M(0x6e7479, { metalness: 0.6 });
    box(r, 38.0, 3.5, 6.9, 38.4, 3.7, 21.1, rail); box(r, 49.4, 3.5, 6.9, 49.8, 3.7, 21.1, rail);
    const bridge = new T.Group(); r.add(bridge);
    box(bridge, -5.8, 3.62, -0.25, 5.8, 3.88, 0.25, rail);
    box(bridge, -5.9, 3.5, -0.4, -5.7, 3.9, 0.4, steel); box(bridge, 5.7, 3.5, -0.4, 5.9, 3.9, 0.4, steel);
    const trolley = new T.Group(); bridge.add(trolley);
    box(trolley, -0.4, 3.35, -0.45, 0.4, 3.62, 0.45, steel);
    const cable = new T.Mesh(new T.BoxGeometry(0.04, 1, 0.04), M(0x202326)); cable.geometry.translate(0, -0.5, 0); cable.position.y = 3.35; trolley.add(cable);
    const grab = new T.Group(); trolley.add(grab);
    box(grab, -0.35, 0.0, -0.35, 0.35, 0.2, 0.35, M(0xd8602a));
    for (const sd of [-1, 1]) { box(grab, sd * 0.4 - 0.03, -0.42, -0.3, sd * 0.4 + 0.03, 0.0, 0.3, steel); box(grab, sd * 0.32, -0.44, -0.3, sd * 0.4, -0.38, 0.3, steel); }
    const carried = new T.Mesh(new T.BoxGeometry(0.76, 0.78, 0.76), M(0x8a6a3a, { roughness: 0.9 })); carried.position.y = -0.43 - 0.39; carried.visible = false; grab.add(carried);
    S.crane = { bridge, trolley, grab, cable, carried, cx: STACK.x, cz: STACK.z, gy: 2.9, state: 'idle', t: 0, queue: 0 };
  }

  // ---- the helicopter
  function helicopter() {
    const r = S.root, h = new T.Group(), P = HELI;
    h.position.set(P.x, 0, P.z); r.add(h);
    const body = M(0x56684f, { roughness: 0.55, metalness: 0.25, emissive: 0x141a12 }), dark = M(0x23272b), inside = M(0x6b7279, { emissive: 0x2a3036 }), glass = new T.MeshStandardMaterial({ color: 0x78a8c8, transparent: true, opacity: 0.4, roughness: 0.1, metalness: 0.3 });
    // helipad: a painted H on the paving
    const pad = new T.Mesh(new T.PlaneGeometry(13, 11), new T.MeshBasicMaterial({ map: canvasTex(256, 220, (g, w, hh) => { g.fillStyle = '#34383d'; g.fillRect(0, 0, w, hh); g.strokeStyle = '#e8c030'; g.lineWidth = 6; g.strokeRect(10, 10, w - 20, hh - 20); g.fillStyle = '#e8c030'; g.fillRect(w / 2 - 38, hh / 2 - 50, 14, 100); g.fillRect(w / 2 + 24, hh / 2 - 50, 14, 100); g.fillRect(w / 2 - 38, hh / 2 - 7, 76, 14); }) }));
    pad.rotation.x = -Math.PI / 2; pad.position.set(P.x + 0.4, 0.014, P.z); r.add(pad);
    // cabin: the floor, the roof, the back (south), the bulkheads; the north side is open (a door's length), with
    // a bench along the south wall facing out of it
    box(h, -3.2, P.floor - 0.1, -1.3, 2.4, P.floor, 1.3, inside);
    box(h, -2.4, 2.45, -1.3, 2.4, 2.65, 1.3, inside);
    box(h, -2.4, P.floor, 1.2, 2.4, 2.45, 1.32, body);
    box(h, 2.28, P.floor, -1.3, 2.4, 2.45, 1.3, body);
    box(h, -2.4, P.floor, -1.32, -1.5, 2.45, -1.2, body); box(h, 2.0, P.floor, -1.32, 2.4, 2.45, -1.2, body); // the door posts
    box(h, -2.5, P.floor, -1.3, -2.4, 2.45, 1.3, body);
    // the nose: a cockpit, tapering, with a windscreen
    const nose = new T.Mesh(new T.BoxGeometry(1.0, 1.5, 2.2), body); nose.position.set(-2.95, 1.3, 0); r.add(nose); nose.position.set(P.x - 2.95, 1.3, P.z);
    const wind = new T.Mesh(new T.BoxGeometry(0.06, 1.0, 1.8), glass); wind.position.set(P.x - 3.45, 1.45, P.z); r.add(wind);
    box(h, -3.25, 0.58, -0.95, -2.4, 0.8, 0.95, body);
    // tail boom and fin
    box(h, 2.4, 1.7, -0.22, 8.0, 2.3, 0.22, body);
    box(h, 7.4, 1.7, -0.04, 8.1, 3.1, 0.04, body);
    // skids
    for (const z of [-1.0, 1.0]) { box(h, -2.9, 0.08, z - 0.05, 2.6, 0.16, z + 0.05, dark); for (const x of [-1.8, 1.4]) box(h, x - 0.04, 0.16, z - 0.04, x + 0.04, P.floor - 0.1, z + 0.04, dark); }
    // the main rotor: a mast, a hub, four blades
    box(h, -0.1, 2.65, -0.1, 0.1, 3.3, 0.1, dark);
    const rotor = new T.Group(); rotor.position.set(0, 3.3, 0); h.add(rotor);
    for (let b = 0; b < 4; b++) { const arm = new T.Group(); arm.rotation.y = b * Math.PI / 2; const bl = new T.Mesh(new T.BoxGeometry(5.3, 0.04, 0.26), dark); bl.position.x = 2.75; arm.add(bl); rotor.add(arm); }
    const hub = new T.Mesh(new T.CylinderGeometry(0.18, 0.18, 0.16, 12), dark); rotor.add(hub);
    const tail = new T.Group(); tail.position.set(8.0, 2.4, 0.12); h.add(tail);
    for (let b = 0; b < 2; b++) { const bl = new T.Mesh(new T.BoxGeometry(0.05, 1.1, 0.14), dark); bl.rotation.x = b * Math.PI / 2; tail.add(bl); }
    // the bench and its six seats along the south wall, facing the open side
    box(h, -1.6, P.floor, 0.55, 1.75, P.floor + 0.42, 1.18, M(0x3a3e43, { emissive: 0x15171a }));
    box(h, -1.6, P.floor + 0.42, 1.12, 1.75, P.floor + 1.3, 1.2, M(0x3a3e43, { emissive: 0x15171a }));
    for (let i = 0; i < P.seats; i++) { const x = -1.3 + i * 0.5; box(h, x - 0.2, P.floor + 0.42, 0.6, x + 0.2, P.floor + 0.48, 1.1, M(0x6a7076, { emissive: 0x202328 })); }
    for (let i = 0; i < P.seats; i++) { const x = -1.3 + i * 0.5; box(h, x - 0.2, P.floor + 0.55, 1.05, x + 0.2, P.floor + 1.0, 1.12, M(0x6a7076, { emissive: 0x202328 })); } // seat backs
    const hs = new T.Mesh(new T.PlaneGeometry(2.4, 0.5), signMat(['READY ROOM', 'hold F to board'], 384, 80, '#101418', '#7dff9a', '#cfd6dc')); hs.rotation.y = Math.PI; hs.position.set(P.x - 0.2, 2.98, P.z - 1.36); r.add(hs);
    S.heli = { group: h, rotor, tail, speed: 3, spin: 0 };
    addTarget({ id: 'heli', kind: 'heli', box: [P.x - 3.5, 0.2, P.z - 1.4, P.x + 2.5, 2.9, P.z + 1.4], label: 'the helicopter' });
  }
  const seatPos = (i) => ({ x: HELI.x - 1.3 + i * 0.5, y: HELI.floor, z: RZ + HELI.z + 0.85, yaw: 0 });
  const exitPos = (i) => ({ x: HELI.x - 1.3 + i * 0.5, y: 0, z: RZ + HELI.z - 2.6 });

  // the outline shown round what you're looking at
  function outline() {
    const hl = new T.LineSegments(new T.EdgesGeometry(new T.BoxGeometry(1, 1, 1)), new T.LineBasicMaterial({ color: 0xffd24a, depthTest: false, transparent: true, opacity: 0.9 }));
    hl.renderOrder = 10; hl.visible = false; S.root.add(hl); S.hl = hl;
  }

  // ------------------------------------------------------------------------ what's on display, from the shop's stock
  // Called when the stock changes (and once on entering): puts each thing for sale in its place, taking away what's sold.
  function refresh(force) {
    if (!S.root || !G.Shop.offers) return;
    const Sh = G.Shop, O = Sh.offers;
    if (S.rosterKey !== rosterKey()) { enter(S.map); return; } // (someone joined or left: the benches are theirs)
    // only when something's changed (each change draws new signs)
    const parts0 = [...(Sh.partStock || [])], key = JSON.stringify([O.gear, [...Sh.gearSold], parts0, O.pouches.map((o) => Sh.left['pouch:' + o.id]), [...Sh.ammoSold]]);
    if (!force && key === S.key) { vending(false); return; }
    S.key = key;
    // the pedestals: the three pieces of gear
    S.stands.forEach((tg, i) => {
      const id = O.gear[i];
      tg.key = id || null;
      tg.sold = !id || Sh.gearSold.has(id);
      clear(tg.disp); tg.spin = null;
      if (id && !tg.sold) { const sh = showPiece(id); tg.disp.add(sh.root); tg.spin = sh.spin; }
      const lines = id ? signFor(id, tg.sold) : ['—'], n = lines.length, SH = Math.min(0.78, 0.3 + 0.17 * n); // (as tall as its lines need)
      if (tg.sign.material.map) tg.sign.material.map.dispose(); tg.sign.material.dispose();
      tg.sign.material = signMat(lines, 512, Math.round(512 * SH / 0.94), '#101418', tg.sold ? '#ff6a5a' : '#ffd24a', '#ffffff');
      tg.sign.scale.set(1, SH / 0.5, 1);
      tg.sign.position.y = 0.1 + (STAND.top - 0.14) / 2;
    });
    // the parts pedestals
    (S.partStands || []).forEach((tg, i) => {
      const id = parts0[i], p = id && G.Gunsmith.PARTS[id];
      tg.key = id || null; tg.sold = !p;
      clear(tg.disp); tg.spin = null;
      if (p) { const sh = partPiece(id); tg.disp.add(sh.root); tg.spin = sh.spin; }
      const n = p ? G.Gunsmith.fitsPart(p).length : 0;
      const lines = p ? [p.name, money(p.price), `${G.Gunsmith.SLOT_LABEL[p.slot]}${n ? ' · fits ' + n + (n > 1 ? ' weapons' : ' weapon') : ''}`] : ['—'];
      const SH = Math.min(0.62, 0.22 + 0.12 * lines.length);
      if (tg.sign.material.map) tg.sign.material.map.dispose(); tg.sign.material.dispose();
      tg.sign.material = signMat(lines, 384, Math.round(384 * SH / 0.6), '#101418', '#ffd24a', '#ffffff');
      tg.sign.scale.set(1, SH / 0.4, 1);
      tg.sign.position.y = 0.08 + (PARTS.top - 0.11) / 2;
    });
    // the pouch shelf
    S.pouchSlots.forEach((slot, i) => {
      clear(slot);
      const tg = S.items.find((q) => q.id === 'pouch' + i), o = O.pouches[i], P = o && G.Gear.POUCHES[o.id];
      tg.key = o ? o.id : null; tg.sold = !o || !(Sh.left['pouch:' + o.id] > 0);
      if (!P) return;
      const it = G.Gear.pouchItem(o.id), left = Sh.left['pouch:' + o.id] || 0;
      product(slot, it, POUCH.x1 + 0.16, 1.0, 0, Math.PI / 2, signMat([P.name, left ? money(P.price) + ' · ' + left + ' left' : 'SOLD'], 400, 100, '#101418', left ? '#ffd24a' : '#ff6a5a', '#ffffff'), 0.16);
    });
    vending(force);
    // the gear and magazines Vex lists in his stock, that don't have a place on a shelf, are at his till
  }

  // the vending machines' contents: ammunition (the special loads, and ball for every caliber you carry a gun in), and
  // field supplies (medical items, flashbangs and frags)
  function vendList(id) {
    const Sh = G.Shop, Gr = G.Gear, out = [], sv = Sh.services();
    if (id === 'ammo') {
      for (const o of Sh.offers.ammo) { const A = G.AMMO[o.am], C = G.CALIBERS[o.cal], it = Gr.boxItem(o.cal, o.am, o.n); out.push({ k: 'ammo', key: o.cal, item: it, name: `${C.name} ${A.name} ×${o.n}`, price: Gr.price(it), sold: Sh.ammoSold.has(o.cal) }); }
      for (const s of sv) if (s.id.startsWith('ball.')) { const cal = s.id.slice(5), C = G.CALIBERS[cal], am = G.ballFor(cal); out.push({ k: 'svc', key: s.id, item: Gr.boxItem(cal, am, C.box), name: s.name, price: s.price, sold: false }); }
    } else {
      for (const s of sv) {
        if (s.id.startsWith('med.')) out.push({ k: 'svc', key: s.id, item: Gr.medItem(s.id.slice(4)), name: s.name, price: s.price, sold: false });
        else if (s.id === 'flash') out.push({ k: 'svc', key: s.id, item: Gr.flashItem(), name: s.name, price: s.price, sold: false });
        else if (s.id === 'nade') out.push({ k: 'svc', key: s.id, item: Gr.fragItem(), name: s.name, price: s.price, sold: false });
      }
    }
    return out;
  }
  function vending(force) {
    for (const m of S.vend) {
      const list = vendList(m.v.id), key = list.map((q) => q.k + q.key + (q.sold ? 's' : '')).join('|');
      if (!force && key === m.key) continue;
      m.key = key;
      clear(m.group);
      S.targets = S.targets.filter((t) => t.vendOf !== m);
      S.items = S.items.filter((t) => t.vendOf !== m);
      const { v } = m, cols = v.cols, rows = v.rows, cw = 0.9 / cols, ch = 1.3 / rows;
      list.slice(0, cols * rows).forEach((q, i) => {
        const c = i % cols, rw = Math.floor(i / cols), z = v.z - 0.45 + cw * (c + 0.5), y = 1.5 - ch * (rw + 0.5) + 0.05;
        const it = q.item, [iw, ih] = G.Gear.size(it), s = Math.min(cw * 0.7 / iw, ch * 0.55 / ih, 0.12);
        const g = new T.Group(); g.position.set(v.x - 0.06, y, z); g.rotation.y = -Math.PI / 2;
        if (!q.sold) {
          const ic = new T.Mesh(new T.PlaneGeometry(iw * s, ih * s), iconMat(G.Icons.of(it, iw, ih, false))); ic.position.z = 0.0; g.add(ic);
        }
        const tag = new T.Mesh(new T.PlaneGeometry(cw * 0.92, 0.1), signMat([q.sold ? 'SOLD' : money(q.price)], 160, 44, '#05121a', q.sold ? '#ff6a5a' : '#7dff9a')); tag.position.set(0, -ch * 0.42, 0.001); g.add(tag);
        m.group.add(g);
        const tg = addTarget({ id: `v-${v.id}-${i}`, kind: 'buy', box: [v.x - 0.3, y - ch / 2, z - cw / 2, v.x + 0.1, y + ch / 2, z + cw / 2], what: q.k, key: q.key, vendOf: m, name: q.name, price: q.price, sold: q.sold, item: it });
        S.items.push(tg);
      });
    }
  }

  // ------------------------------------------------------------------------ every frame
  function update(dt) {
    if (!S.root) return;
    S.t += dt;
    const me = G.Me;
    // the kit on show, turning
    for (const tg of S.stands) if (tg.spin) tg.spin.rotation.y += dt * 0.5;
    for (const tg of S.partStands || []) if (tg.spin) tg.spin.rotation.y += dt * 0.6;
    // Vex, standing about
    for (const o of S.rigs) {
      const idle = o.vex ? { yaw: o.yaw + Math.sin(S.t * 0.35) * 0.18 } : { yaw: o.yaw };
      o.rig.update(dt, { pos: new T.Vector3(o.x, o.y || 0, o.z), yaw: idle.yaw, pitch: 0, crouch: false, alert: false, lean: 0, state: 'alive' });
    }
    // the helicopter's rotor: slow at rest, faster the more of the squad are in their seats
    const H = S.heli;
    if (H) {
      const ids = Object.keys(G.Game.roster || {}), ready = ids.filter((id) => G.Game.roster[id].ready).length;
      const target = ids.length && ready === ids.length ? 38 : 2 + 14 * (ids.length ? ready / ids.length : 0);
      H.spin += (target - H.spin) * Math.min(1, dt * 0.8);
      H.rotor.rotation.y += H.spin * dt; H.tail.rotation.z += H.spin * 1.6 * dt;
      H.rotor.rotation.x = Math.sin(S.t * 0.7) * 0.004 * (1 + H.spin * 0.05);
    }
    craneStep(dt);
    if (G.Range) G.Range.update(dt);
    // a word from Vex now and then, when you're in the store
    if (me.pos && me.pos.x > 16 && me.pos.x < 36 && me.pos.z - RZ < 26 && me.pos.z - RZ > 0 && (S.vexQuip -= dt) <= 0) { S.vexQuip = 40 + Math.random() * 30; if (!G.Game.shopOpen && Math.hypot(me.pos.x - VEX.x, me.pos.z - RZ - VEX.z) < 9) G.HUD.toast('VEX', G.VENDOR_QUIPS.hello[Math.floor(Math.random() * G.VENDOR_QUIPS.hello.length)], 2.4); }
  }
  // the crane: drifts about the stash; when sent, picks a crate off the stack and sets it on the loadout pallet (and back)
  function craneStep(dt) {
    const c = S.crane;
    if (!c) return;
    const go = (tx, tz, sp) => { const dx = tx - c.cx, dz = tz - c.cz, d = Math.hypot(dx, dz); if (d < 0.02) return true; const k = Math.min(d, sp * dt); c.cx += dx / d * k; c.cz += dz / d * k; return false; };
    const hoist = (to, sp) => { const d = to - c.gy; c.gy += Math.sign(d) * Math.min(Math.abs(d), sp * dt); return Math.abs(to - c.gy) < 0.01; };
    c.t += dt;
    const BAY_Z = 20.0;
    if (c.state === 'idle') {
      if (c.queue > 0) { c.queue--; c.state = 'toStack'; }
      else { go(STACK.x + Math.sin(c.t * 0.21) * 3.2, 14 + Math.sin(c.t * 0.15 + 1) * 4, 0.6); hoist(2.9, 0.5); }
    } else if (c.state === 'toStack') { if (go(STACK.x, STACK.z, 3.2) && hoist(2.9, 1.5)) c.state = 'down'; }
    else if (c.state === 'down') { if (hoist(2.45, 1.2)) { c.state = 'lift'; c.carried.visible = true; } }          // (onto the top crate)
    else if (c.state === 'lift') { if (hoist(2.95, 1.2)) c.state = 'toBay'; }
    else if (c.state === 'toBay') { if (go(STACK.x, BAY_Z, 3.2)) c.state = 'set'; }
    else if (c.state === 'set') { if (hoist(1.45, 1.2)) { c.carried.visible = false; c.state = 'rise'; } }          // (down to the pallet, let go)
    else if (c.state === 'rise') { if (hoist(2.9, 1.5)) c.state = 'return'; }
    else if (c.state === 'return') { if (go(STACK.x, STACK.z, 3.2)) c.state = 'idle'; }
    c.bridge.position.set(43.9, 0, c.cz); c.trolley.position.x = c.cx - 43.9;
    c.grab.position.y = c.gy; c.cable.scale.y = Math.max(0.05, 3.35 - (c.gy + 0.2));
  }

  // ------------------------------------------------------------------------ looking and pressing F
  const _o = new T.Vector3(), _d = new T.Vector3();
  function slab(b, o, d) {
    let t0 = 0, t1 = 1e9;
    for (let a = 0; a < 3; a++) {
      const lo = b[a], hi = b[a + 3], oo = a === 0 ? o.x : a === 1 ? o.y : o.z, dd = a === 0 ? d.x : a === 1 ? d.y : d.z;
      if (Math.abs(dd) < 1e-9) { if (oo < lo || oo > hi) return -1; continue; }
      let a1 = (lo - oo) / dd, a2 = (hi - oo) / dd; if (a1 > a2) { const q = a1; a1 = a2; a2 = q; }
      t0 = Math.max(t0, a1); t1 = Math.min(t1, a2);
      if (t0 > t1) return -1;
    }
    return t0;
  }
  // what's under the crosshair, in reach
  function aim() {
    const cam = G.R.camera;
    _o.copy(cam.position); _d.set(0, 0, -1).applyQuaternion(cam.quaternion);
    let best = null, bt = 1e9;
    for (const t of S.targets) {
      const reach = t.kind === 'heli' ? HELI_REACH : REACH, d = slab(t.box, _o, _d);
      if (d >= 0 && d < reach && d < bt) { bt = d; best = t; }
    }
    return best;
  }
  const afford = (price) => G.Me.credits >= price;
  // what a thing says when you look at it, and what F does
  function describe(t) {
    const Sh = G.Shop;
    if (t.kind === 'heli') return { html: '' };
    if (t.kind === 'pos') {
      if (t.id.startsWith('bench') && !t.mine) return { html: `${G.U.esc(t.label)} <small>(you work at your own)</small>` };
      if (t.run) return { html: `Press <b>F</b> to ${G.U.esc(t.runText || 'use ' + t.label)}`, act: t.run };
      return { html: `Press <b>F</b> to use ${G.U.esc(t.label)} <small>· ${G.U.esc(t.title)}</small>`, act: () => open(t) };
    }
    // something for sale
    let name, price, sold = !!t.sold, extra = '', buy = null;
    if (t.what === 'gear') { if (!t.key) return { html: '' }; const d = gearOf(t.key); name = d.name; price = Sh.gearPrice(t.key); sold = Sh.gearSold.has(t.key); extra = d.plate && Sh.offers.plates[t.key] ? ' (plate fitted)' : needs(d) ? ` <small>(${needs(d)})</small>` : ''; buy = ['gear', t.key]; }
    else if (t.what === 'part') { if (!t.key) return { html: '' }; const p = G.Gunsmith.PARTS[t.key]; name = p.name; price = p.price; sold = !Sh.partStock.has(t.key); extra = ' <small>(to your stash)</small>'; buy = ['part', t.key]; }
    else if (t.what === 'pouch') { if (!t.key) return { html: '' }; const P = G.Gear.POUCHES[t.key]; name = P.name; price = P.price; sold = !(Sh.left['pouch:' + t.key] > 0); buy = ['pouch', t.key]; }
    else if (t.what === 'ammo') { name = t.name; price = t.price; sold = Sh.ammoSold.has(t.key); buy = ['ammo', t.key]; }
    else if (t.what === 'svc') { const s = Sh.services().find((q) => q.id === t.key); if (!s) return { html: '' }; name = s.name; price = s.price; sold = !!s.disabled; extra = s.disabled ? ' <small>(no room, or nothing to do)</small>' : ''; buy = ['svc', t.key]; }
    if (!buy) return { html: '' };
    if (sold) return { html: `<b>${G.U.esc(name)}</b> <small>sold out${t.what === 'gear' ? '' : extra}</small>` };
    return { html: `Press <b>F</b> to buy <b>${G.U.esc(name)}</b>${extra} — <b${afford(price) ? '' : ' style="color:#ff6a5a"'}>${money(price)}</b>`, act: () => purchase(buy[0], buy[1], name) };
  }
  function purchase(kind, key, name) {
    const Me = G.Me, before = Me.credits;
    G.Shop.buy(kind, key);
    if (Me.credits < before) G.HUD.toast('', `Bought ${G.U.esc(name)} <small>−${money(before - Me.credits)}</small>`, 1.4);
    refresh();
  }
  function open(t) {
    if (t.crane && S.crane) S.crane.queue = Math.min(2, S.crane.queue + 1);
    G.Game.openShop(t.tab, t.title);
  }
  // seated: which seat is mine (the same on every machine: by position in the sorted roster)
  function mySeat() { const ids = Object.keys(G.Game.roster || {}).sort(); return Math.max(0, Math.min(HELI.seats - 1, ids.indexOf(G.Net.myId))); }
  // F, from the player's interact(): returns { prompt, prog, label }; walking up to a thing and pressing F
  function interact(me, dt, held, edge) {
    const out = { prompt: '', prog: -1, label: '' };
    if (G.Game.shopOpen) return out;
    // seated in the helicopter: hold F to get out
    if (me.seat != null) {
      out.prompt = 'Hold <b>F</b> to leave your seat <small>(you\'re ready: the helicopter goes when everyone is)</small>';
      if (held && !me.fLatch) { S.hold += dt; out.prog = S.hold / HOLD; out.label = 'Getting out'; if (S.hold >= HOLD) { S.hold = 0; me.fLatch = true; unseat(me); } } else S.hold = 0;
      return out;
    }
    const t = aim();
    S.hover = t;
    if (!t) { S.hold = 0; return out; }
    if (t.kind === 'heli') {
      out.prompt = 'Hold <b>F</b> to climb in and ready up';
      if (held && !me.fLatch) { S.hold += dt; out.prog = S.hold / HOLD; out.label = 'Climbing in'; if (S.hold >= HOLD) { S.hold = 0; me.fLatch = true; seat(me); } } else S.hold = 0;
      return out;
    }
    S.hold = 0;
    const d = describe(t);
    out.prompt = d.html;
    if (edge && d.act) { me.fLatch = true; d.act(); }
    return out;
  }
  function seat(me) {
    const i = mySeat(), p = seatPos(i);
    me.seat = i; me.pos.set(p.x, p.y, p.z); me.vel.set(0, 0, 0); me.yaw = p.yaw; me.pitch = 0; me.crouch = true; me.stowed = true; me.mouse.l = me.mouse.r = false;
    G.Shop.setReady(true);
    G.Audio.click();
  }
  function unseat(me) {
    const p = exitPos(me.seat);
    me.seat = null; me.pos.set(p.x, p.y, p.z); me.vel.set(0, 0, 0); me.crouch = false; me.stowed = false; me.yaw = Math.PI;
    G.Shop.setReady(false);
    G.Audio.click();
  }
  // the highlight round what you're looking at (called once a frame from the player's camera update)
  function mark() {
    const hl = S.hl;
    if (!hl) return;
    const t = G.Game.shopOpen || (G.Me && G.Me.seat != null) ? null : S.hover;
    if (!t || t.kind === 'heli' || (t.kind === 'buy' && !describe(t).act)) { hl.visible = false; return; }
    const b = t.box;
    hl.visible = true; hl.position.set((b[0] + b[3]) / 2, (b[1] + b[4]) / 2, (b[2] + b[5]) / 2 - RZ); hl.scale.set(b[3] - b[0], b[4] - b[1], b[5] - b[2]);
  }
  // where you stand when you come in: on the pad, in front of the opening
  function spawnAt(i) { const x = 26 + (i % 3 - 1) * 1.6, z = RZ + 30.4 + Math.floor(i / 3) * 1.4; return { x, z }; }

  return { decorate, enter, leave, update, refresh, aim, interact, mark, seatPos, exitPos, spawnAt, S, HELI, HOLD, RZ };
})();
