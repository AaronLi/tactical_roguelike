'use strict';
// The game in space, on a screen (docs/space.md; the host's side is js/spaceserver.ts, what's drawn js/shipmodel.ts, the
// panels js/spaceui.ts). The squad's ship stands in the level at her BERTH: on the pad in the hangar, nose-on to the hull
// of a ship she's boarding, on the landing pad outside a base. Her deck is solid there (js/spacedata.ts boxes, added to the
// level's world), so walking about her, her seats, rays and sound are the level's own, and stay so while she flies: she
// never moves in the world. Flying, it's everything else that moves: the level's drawing and whatever's out in space are
// turned and shifted by the inverse of her pose (outside()), so from her deck the hangar falls away and the stars wheel.
// Her pose (P, Q) is in the level's own coordinates, as if she had flown off her berth: docked, P and Q are the berth's and
// nothing is moved.
//   Her pilot's game flies her (whoever last took the helm: S.ctl) and tells the host, which tells the rest (spose); they ease
//   to it. Docking, launching and jumping go through the host (sdock, jump).
//   A jump is the change of level: the screens go to the jump's light instead of black (the veil, kind 'ftl'), the place
//   is built behind it, and she comes out of the tunnel when it's ready.
interface SpWp { id: string; name: string; sub: string; p: THREE.Vector3; kind: 'anchor' | 'base' | 'breach' | 'lz' | 'entry'; i?: number; hide?: boolean }
interface SpMs { raid?: number[][]; hold: number; left?: number; zt?: number; hostile?: number; salv?: number[]; cuts?: number[][]; site?: number[] | null; i: number; docked: number; done: number; keys: string[]; cards: number[][]; art: number; artBy: string | null; artAt: number[] | null; hvt: number; hvtId: number | null; arm: number | null; boom: number; vac: number[]; cleared: number; at?: number }
type SpKind = 'hub' | 'board' | 'assault';
const G_Space = (() => {
  const T = THREE, SD = G.SpaceData;
  const S = {
    on: false, kind: 'hub' as SpKind, stage: 'space' as 'space' | 'orbit' | 'atmo', map: null as LvMap | null,
    def: SD.SHIPS.kestrel, fleet: SD.fleet0(), seatsDef: [] as SpSeat[], berth: { x: 0, y: 0, z: 0, yaw: 0 }, Dp: new T.Vector3(), Dq: new T.Quaternion(),
    model: null as SmShip | null, solids: [] as { s: any; tag?: string; ship?: boolean; on: boolean; b: number[] }[], noseT: 0, rampT: 0,
    docked: true, P: new T.Vector3(), Q: new T.Quaternion(), V: new T.Vector3(), Wv: new T.Vector3(), stick: new T.Vector2(),
    zone: null as THREE.Group | null, zoneV: new T.Vector3(), zt0: 0, ztAt: 0, traffic: [] as { obj: THREE.Object3D; c: { pts: number[][]; lens: number[]; total: number; speed: number; off: number; k?: number; name?: string }; wp: SpWp | null; ph: number; real?: boolean; bow?: number; pend?: LvMap | null }[],
    carry: null as null | { k: number; v: THREE.Vector3; yaw: number; Q: THREE.Quaternion; V: THREE.Vector3 },
    zdef: [] as SpContact[], zact: 0, zC: new T.Vector3(), zinfo: null as null | { ms: any; act: number; near: boolean }, tclose: null as null | { k: number; t: number; sent?: boolean; name: string },
    root: null as THREE.Group | null, stars: null as THREE.Points | null, tunnel: null as THREE.Group | null, sun: null as THREE.DirectionalLight | null, planet: null as THREE.Object3D | null,
    hull: null as ReturnType<typeof G.ShipModel.hull> | null, wps: [] as SpWp[], tgt: 0, anchors: [] as { i: number; obj: THREE.Object3D; p: THREE.Vector3; p0?: THREE.Vector3 }[],
    ftl: null as null | { st: 'spool' | 'wait' | 'tunnel'; t: number; to: number; T: number }, seats: {} as Record<string, number>, ctl: null as string | null,
    hp: 100, hpMax: 100, ms: null as SpMission | null, state: null as SpMs | null, board: { seed: 1, level: 1, picked: [] as number[], done: [] as number[] },
    auto: null as null | { t: number; T: number; P0: THREE.Vector3; Q0: THREE.Quaternion; P1: THREE.Vector3; Q1: THREE.Quaternion; mid: THREE.Vector3 | null; then: () => void },
    hidden: null as Map<THREE.Object3D, boolean> | null, net: null as null | { P: THREE.Vector3; Q: THREE.Quaternion; V: THREE.Vector3 }, sendT: 0, hold: 0, holdK: '', keep: null as null | { x: number; y: number; z: number; yaw: number },
    things: [] as { k: string; n?: number; x: number; z: number; y?: number; obj: THREE.Object3D }[], cardObjs: [] as THREE.Object3D[], term: null as null | { x: number; z: number }, t: 0, shake: 0, cruise: false,
    boxes: [] as number[][], floorAt: null as null | ((x: number, z: number) => number), boomT: -1, uiOpen: false, mis: [] as { id: number; o: THREE.Group; v: THREE.Vector3; t: number }[], misN: 1, lostAt: 0, helpAt: 0, lookP: 0, tracers: [] as { m: THREE.Mesh; t: number }[], fireT: 0,
  };
  const me = () => G.Me, on = () => S.on;
  const isCtl = () => S.ctl === G.Net.myId;
  const mySeat = () => (S.on && me().seat != null ? S.seatsDef[me().seat as number] || null : null);
  const fwd = (q: THREE.Quaternion) => new T.Vector3(0, 0, -1).applyQuaternion(q);
  const yawQ = (yaw: number) => new T.Quaternion().setFromAxisAngle(new T.Vector3(0, 1, 0), yaw);
  const aboardAt = (x: number, y: number, z: number) => SD.aboard(S.def, S.berth, x, y, z);
  const aboard = () => S.on && !!me().pos && aboardAt(me().pos.x, me().pos.y, me().pos.z);
  // sealed in: aboard a ship that isn't against anything (nobody outside can see or shoot you: js/player.ts state's se)
  const sealed = () => S.on && !S.docked && aboard();
  const store = () => G.U.store;

  // ------------------------------------------------------------------ coming and going
  function leave() {
    if (!S.on && !S.model) return;
    if (S.on && S.kind === 'board' && S.tclose && S.zone) {
      const q = S.traffic.find((o) => o.c.k === S.tclose!.k && o.wp);
      if (q) { const z = SD.zonePos(q.c, S.zt0 + (performance.now() - S.ztAt) / 1000), d = new T.Vector3(z.d[0], 0, z.d[2]).applyQuaternion(S.zone.quaternion); S.carry = { k: q.c.k!, v: S.P.clone().sub(q.wp!.p), yaw: Math.atan2(d.x, d.z), Q: S.Q.clone(), V: S.V.clone() }; }
    }
    if (S.on && S.kind === 'board' && S.tclose && S.zone && S.zinfo && S.hull && S.map && S.map.sp && S.hull.group.parent) { // (and her hull's kept as it is, holes and all: she's one of the others now, zoneReal)
      const hb = S.map.sp.hull, holder = new T.Group(), h = S.hull; h.marker.visible = false;
      h.group.removeFromParent(); h.group.position.set(-(hb.x0 + hb.x1) / 2, 0, -(hb.z0 + hb.z1) / 2); holder.add(h.group);
      if (zoneHullsOf !== S.zinfo.ms.seed) { zoneClear(); zoneHullsOf = S.zinfo.ms.seed; }
      zoneHulls.set(S.zinfo.ms.seed + ':' + S.zact, { holder, h, bow: S.map.sp.wing ? Math.atan2(-1, -1) : Math.atan2(-1, 0), map: null, key: '' });
    }
    if (S.on && me().pos && aboard()) { const p = SD.toShip(S.berth, me().pos.x, me().pos.y, me().pos.z); S.keep = { x: p.x, y: p.y, z: p.z, yaw: me().yaw - S.berth.yaw }; } else S.keep = null;
    unhide();
    for (const o of [S.model && S.model.group, S.root, S.stars, S.tunnel, S.sun]) if (o && o.parent) o.parent.remove(o);
    if (S.sun && S.sun.target.parent) S.sun.target.parent.remove(S.sun.target);
    G.R.levelRoot.position.set(0, 0, 0); G.R.levelRoot.quaternion.identity(); G.R.levelRoot.visible = true;
    S.model = null; S.root = null; S.stars = null; S.tunnel = null; S.sun = null; S.hull = null; S.planet = null; S.solids = []; S.wps = []; S.anchors = []; S.things = []; S.cardObjs = [];
    S.on = false; S.map = null; S.ftl = null; S.auto = null; S.net = null; S.boomT = -1; S.tracers = []; S.mis = [];
    if (me().seat != null) me().seat = null;
    G.SpaceUI.show(false);
  }
  // off for good (the menu, the lobby): nothing kept
  function reset() { leave(); S.keep = null; S.ms = null; S.state = null; S.seats = {}; S.ctl = null; G.SpaceUI.closeOps(); veilKind(null); }

  function setup(map: LvMap, kind: SpKind, sp: any) {
    const keep = S.keep; leave(); S.keep = keep;
    S.on = true; S.kind = kind; S.map = map; S.t = 0; S.stage = 'space';
    S.fleet = SD.cleanFleet(sp && sp.fleet); S.def = SD.SHIPS[S.fleet.ship]; S.seatsDef = SD.seats(S.def);
    S.hpMax = S.def.hull * (SD.fitted(S.fleet, 'plating') ? 1.5 : 1); if (kind === 'hub' && (!sp || !sp.ship || sp.ship.docked)) S.hp = S.hpMax; S.hp = Math.min(S.hp, S.hpMax);
    S.seats = (sp && sp.seats) || {}; S.ctl = sp && sp.ship ? sp.ship.ctl : null;
    if (sp && sp.board) setBoard(sp.board);
    // her berth
    const d = S.def;
    if (kind === 'hub') S.berth = Object.assign({}, SD.HUB_BERTH);
    else if (kind === 'board') { const b = map.sp!.breach; S.berth = { x: b.x, y: 0, z: b.face + 0.03 - (d.z0 - d.nose - 0.22), yaw: 0 }; }
    else { const lz = map.lz || { x: map.spawn.x, y: 0, z: map.spawn.z }; S.berth = { x: lz.x + 3.2 + Math.max(0, d.z1 - 5) * 0.5, y: lz.y || 0, z: lz.z, yaw: Math.PI / 2 }; }
    S.Dp.set(S.berth.x, S.berth.y, S.berth.z); S.Dq.copy(yawQ(S.berth.yaw));
    // the ship herself, and her deck in the world
    const m = S.model = G.ShipModel.ship(d, S.fleet);
    m.group.position.copy(S.Dp); m.group.quaternion.copy(S.Dq); G.R.scene.add(m.group);
    S.solids = []; deck();
    // what's out there
    S.root = new T.Group(); G.R.scene.add(S.root);
    S.stars = G.ShipModel.stars(7); G.R.scene.add(S.stars);
    S.tunnel = G.ShipModel.tunnel(); S.tunnel.visible = false; m.group.add(S.tunnel);
    S.sun = new T.DirectionalLight(0xfff4e0, 0); G.R.scene.add(S.sun, S.sun.target);
    S.wps = []; S.anchors = []; S.boxes = []; S.floorAt = null; S.hull = null; S.planet = null; S.things = []; S.cardObjs = []; S.term = null;
    const docked = !sp || !sp.ship || !!sp.ship.docked;
    S.docked = docked; S.noseT = 0; S.rampT = docked && kind !== 'board' ? 1 : 0;
    S.V.set(0, 0, 0); S.Wv.set(0, 0, 0); S.stick.set(0, 0); S.auto = null; S.net = null; S.cruise = false;
    S.zone = new T.Group(); S.root.add(S.zone); S.zoneV.set(0, 0, 0); S.traffic = []; S.zdef = []; S.zact = 0; S.tclose = null; S.zt0 = (Date.now() / 1000) % 86400; S.ztAt = performance.now();
    if (kind === 'hub') setupHub(map, sp); else if (kind === 'board') setupBoard(map); else setupAssault(map);
    if (docked) { S.P.copy(S.Dp); S.Q.copy(S.Dq); }
    syncSolids();
    // the sky: space is black, and reaches a long way
    const cam = G.R.camera; cam.far = 60000; cam.updateProjectionMatrix();
    const fog = G.R.scene.fog as THREE.Fog; fog.near = 1e6; fog.far = 2e6;
    sky();
    // you, aboard where you were (the ship came here with you in it), or aboard anyway if she isn't against anything
    if (S.keep || !docked) {
      const k = S.keep || { x: 0, y: SD.FLOOR, z: d.z1 - 2.2, yaw: 0 }, w = SD.toWorld(S.berth, G.U.clamp(k.x, -d.hw + 0.4, d.hw - 0.4), SD.FLOOR, G.U.clamp(k.z, d.z0 + 0.5, d.z1 - 0.5));
      me().pos.set(w.x, w.y, w.z); me().yaw = S.berth.yaw + k.yaw;
    }
    S.keep = null;
    // back in the seat you had (the host still has you in it)
    const mine = S.seats[G.Net.myId!];
    if (mine != null && S.seatsDef[mine] && (!docked || kind !== 'hub')) sit(mine, true);
    G.SpaceUI.show(true);
    outside();
  }
  function sky() {
    const space = S.kind !== 'assault' || S.stage !== 'atmo', th = S.map!.theme;
    (G.R.scene.background as THREE.Color).setHex(space ? 0x000003 : th.fog);
    if (S.stars) S.stars.visible = space;
    const fog = G.R.scene.fog as THREE.Fog;
    if (space) { fog.near = 1e6; fog.far = 2e6; } else { fog.color.setHex(th.fog); fog.near = 300; fog.far = 5200; }
  }
  // her deck's boxes, where she's berthed (in the world once syncSolids has put them there)
  function deck() {
    const w = S.map && S.map.world;
    S.solids = S.solids.filter((q) => { if (q.tag === undefined && !q.ship) return true; if (q.on && w) G.World.remove(w, q.s); return false; });
    for (const b of SD.boxes(S.def)) {
      const a = SD.toWorld(S.berth, b[0], b[1], b[2]), c = SD.toWorld(S.berth, b[3], b[4], b[5]);
      S.solids.push({ s: null, tag: b[6], ship: true, on: false, b: [Math.min(a.x, c.x), Math.min(a.y, c.y), Math.min(a.z, c.z), Math.max(a.x, c.x), Math.max(a.y, c.y), Math.max(a.z, c.z)] });
    }
  }
  // ---- breaching her anywhere (js/shipgen.ts sites, cut). The berth goes to the site: nose-on to that stretch of hull.
  function berthAt(s: { x: number; z: number; nx: number; nz: number }) {
    const TS = G.Level.TS, yaw = s.nz > 0 ? 0 : s.nz < 0 ? Math.PI : s.nx > 0 ? Math.PI / 2 : -Math.PI / 2, zN = S.def.z0 - S.def.nose - 0.22;
    const px = s.x + s.nx * (TS / 2 + 0.03), pz = s.z + s.nz * (TS / 2 + 0.03);
    return { x: px - zN * Math.sin(yaw), y: 0, z: pz - zN * Math.cos(yaw), yaw };
  }
  const siteAt = (a: number[]) => { const map = S.map!, W = map.W, TS = G.Level.TS, x = a[0] % W, z = (a[0] / W) | 0, ax = a[2] ? 1 : 0, az = a[1] ? 1 : 0; return { c: a[0], nx: a[1], nz: a[2], x: (x + 0.5) * TS, z: (z + 0.5) * TS, cells: [-1, 0, 1].map((k) => (z + az * k) * W + x + ax * k) } as ShSite; };
  // she stands somewhere else now: her deck with her, and you if you're aboard (her pose in the level is what it was)
  function rebase(b: { x: number; y: number; z: number; yaw: number }) {
    const m = me(), was = S.berth, ab = !!m.pos && aboard(), loc = ab ? SD.toShip(was, m.pos.x, m.pos.y, m.pos.z) : null;
    S.berth = b; S.Dp.set(b.x, b.y, b.z); S.Dq.copy(yawQ(b.yaw));
    if (S.model) { S.model.group.position.copy(S.Dp); S.model.group.quaternion.copy(S.Dq); }
    deck(); syncSolids();
    if (loc && m.seat == null) { const w = SD.toWorld(b, loc.x, loc.y, loc.z); m.pos.set(w.x, w.y, w.z); m.yaw += b.yaw - was.yaw; }
  }
  // the hull cut through at a site, on this screen: the world and the grid (js/shipgen.ts cut), the wall's cubes out of sight
  // there, a lintel over the opening and a torn frame round it
  function cutHere(a: number[]) {
    const map = S.map!, s = siteAt(a); if (!map.sp || !G.ShipGen.cut(map, s)) return;
    if (S.hull) S.hull.cutAt(s.x, s.z, s.nx, s.nz); // (what's over her plating there goes with it)
    const TS = G.Level.TS, L = G.Level, f0 = map.floors ? map.floors[0] : map, wm = f0.wallMesh as THREE.InstancedMesh | undefined, zero = new T.Matrix4().makeScale(0, 0, 0);
    if (wm && f0.wallIdx) { for (const c of s.cells) { const i = f0.wallIdx.get(c); if (i != null) { wm.setMatrixAt(i, zero); if (f0.wallBase) f0.wallBase.set(zero.elements, i * 16); } } wm.instanceMatrix.needsUpdate = true; }
    const g = new T.Group(), along = s.nz ? 1 : 0, wall = G.ShipModel.M(new T.Color(map.theme.wall as string).getHex(), { roughness: 0.9 }), torn = G.ShipModel.M(0x1a1c1f, { metalness: 0.6 }), hot = G.ShipModel.lit(0xff7a1a);
    const bx = (mt: THREE.Material, u0: number, y0: number, u1: number, y1: number, d0 = -TS / 2, d1 = TS / 2) => { const mm = new T.Mesh(new T.BoxGeometry(along ? u1 - u0 : d1 - d0, y1 - y0, along ? d1 - d0 : u1 - u0), mt); mm.position.set(along ? (u0 + u1) / 2 : (d0 + d1) / 2, (y0 + y1) / 2, along ? (d0 + d1) / 2 : (u0 + u1) / 2); g.add(mm); };
    bx(wall, -1.5 * TS, L.DOOR_H + 0.1, 1.5 * TS, L.WALL_H);
    for (const sd of [-1, 1]) { bx(torn, sd * 1.5 * TS - 0.06, 0, sd * 1.5 * TS + 0.06, L.DOOR_H + 0.1, -TS / 2 - 0.04, TS / 2 + 0.04); bx(hot, sd * 1.5 * TS - 0.02, 0.1, sd * 1.5 * TS + 0.02, L.DOOR_H, -TS / 2 - 0.06, -TS / 2 - 0.04); }
    bx(torn, -1.5 * TS, L.DOOR_H + 0.04, 1.5 * TS, L.DOOR_H + 0.16, -TS / 2 - 0.04, TS / 2 + 0.04);
    g.position.set(s.x, 0, s.z); G.R.levelRoot.add(g);
  }
  // The pirates' pods in a taken ship's hull (the mission's state: raid, as sites): each a blunt rust-dark boarding pod driven in
  // nose first, its collar against her plating and its engines still glowing; inside, where it came through, its hatch shut in
  // a ring of torn plate. (Nothing of hers is cut for it: the pod fills its own hole.)
  function raidPods(list?: number[][]) {
    const map = S.map as (LvMap & { _pods?: Set<string> }) | null; if (!map || !map.sp || S.kind !== 'board' || !list) return;
    const done = map._pods || (map._pods = new Set()), TS = G.Level.TS, SM = G.ShipModel;
    for (const a of list) {
      if (done.has(a.join(','))) continue; done.add(a.join(','));
      const s = siteAt(a), g = new T.Group(); if (S.hull) S.hull.cutAt(s.x, s.z, s.nx, s.nz);
      const hullM = SM.M(0x7a4634, { roughness: 0.8, metalness: 0.2, emissive: 0x24120c }), dark = SM.M(0x1c1a19, { roughness: 0.7, metalness: 0.5 }), hot = SM.lit(0xff5a1a), red = SM.lit(0xff2a1a);
      const add = (geo: THREE.BufferGeometry, m: THREE.Material, z: number, y = 0, x = 0) => { const mm = new T.Mesh(geo, m); mm.position.set(x, y, z); g.add(mm); return mm; };
      // (built along +z, out from the hull, its floor level with her deck; then turned to the site's own way out)
      const body = add(new T.CylinderGeometry(1.25, 1.9, 8.5, 8), hullM, 4.6, 1.35); body.rotation.x = Math.PI / 2; body.rotation.y = Math.PI / 8;
      const collar = add(new T.CylinderGeometry(2.15, 2.15, 0.5, 8), dark, 0.3, 1.35); collar.rotation.x = Math.PI / 2; collar.rotation.y = Math.PI / 8;
      for (const k of [0, 1, 2, 3]) { const f = add(new T.BoxGeometry(0.16, 1.5, 3.2), dark, 6.6, 1.35); f.position.x = Math.cos(k * Math.PI / 2 + 0.6) * 1.75; f.position.y += Math.sin(k * Math.PI / 2 + 0.6) * 1.75; f.rotation.z = k * Math.PI / 2 + 0.6 - Math.PI / 2; }
      for (const k of [0, 1, 2]) { const an = k * 2.094, e = add(new T.CylinderGeometry(0.42, 0.5, 0.9, 8), dark, 9.1, 1.35 + Math.sin(an) * 0.62, Math.cos(an) * 0.62); e.rotation.x = Math.PI / 2; const gl = add(new T.CircleGeometry(0.36, 8), hot, 9.57, 1.35 + Math.sin(an) * 0.62, Math.cos(an) * 0.62); void gl; }
      add(new T.BoxGeometry(2.3, 0.5, 0.06), SM.M(0xb8ae98, { roughness: 0.9 }), 3.4, 2.75).rotation.x = -0.12; // (a pale band across her back: whose she is)
      for (const x of [-1, 1]) add(new T.BoxGeometry(0.12, 0.12, 0.12), red, 1.0, 2.9, x * 0.9);
      // inside her: the pod's hatch, shut, set in the wall where it came through
      add(new T.BoxGeometry(2.3, 2.3, 0.08), dark, -TS / 2 - 0.05, 1.2);
      add(new T.BoxGeometry(1.5, 2.0, 0.1), hullM, -TS / 2 - 0.07, 1.05);
      for (const [w, h, x, y] of [[2.5, 0.08, 0, 2.4], [2.5, 0.08, 0, 0.04], [0.08, 2.4, -1.25, 1.2], [0.08, 2.4, 1.25, 1.2]]) add(new T.BoxGeometry(w, h, 0.05), hot, -TS / 2 - 0.045, y, x);
      add(new T.BoxGeometry(0.16, 0.08, 0.06), red, -TS / 2 - 0.13, 2.15);
      g.position.set(s.x + s.nx * TS / 2, 0, s.z + s.nz * TS / 2); g.rotation.y = Math.atan2(s.nx, s.nz);
      G.R.levelRoot.add(g);
    }
  }
  // Where her nose is headed on the hull: the site its line meets (nearest), how far off, and how far the nose is off the
  // line straight into it. null: she isn't pointed at anywhere she could breach.
  function aim(maxT = 320) {
    if (S.kind !== 'board' || !S.map || !S.map.sp) return null;
    const zn = S.def.z0 - S.def.nose - 0.22, N = new T.Vector3(0, 1.4, zn).applyQuaternion(S.Q).add(S.P), f = fwd(S.Q), TS = G.Level.TS;
    let best: ShSite | null = null, bo = 1.0, bt = 0; // (within a metre of a site's middle: the collar pulls her onto it)
    const raid: number[][] = (S.state && S.state.raid) || [], W0 = S.map.W, nearPod = (s: ShSite) => raid.some((q) => Math.hypot(s.c % W0 - q[0] % W0, ((s.c / W0) | 0) - ((q[0] / W0) | 0)) * G.Level.TS < 8);
    const list = G.ShipGen.sites(S.map).concat((S.map.sp.cuts || []).map(siteAt)).filter((s) => !nearPod(s)); // (and the holes already made; not where a pirate pod is)
    for (const s of list) {
      const dn = f.x * s.nx + f.z * s.nz; if (dn > -0.5) continue;
      const px = s.x + s.nx * TS / 2, pz = s.z + s.nz * TS / 2, t = ((px - N.x) * s.nx + (pz - N.z) * s.nz) / dn;
      if (t < -1 || t > maxT) continue;
      const off = Math.abs(s.nz ? N.x + f.x * t - px : N.z + f.z * t - pz);
      if (off < bo) { bo = off; best = s; bt = t; }
    }
    if (!best) return null;
    const lat = best.nz ? (N.x - best.x) * -best.nz : (N.z - best.z) * best.nx, range = (N.x - best.x) * best.nx + (N.z - best.z) * best.nz - TS / 2;
    return { site: best, t: bt, range, dx: lat, dy: N.y - 1.4, align: -(f.x * best.nx + f.z * best.nz), close: -(S.V.x * best.nx + S.V.z * best.nz) };
  }
  const addObj = (o: THREE.Object3D, p?: THREE.Vector3) => { if (p) o.position.copy(p); S.root!.add(o); return o; };

  // -- the hangar: the asteroid round it, the anchors of the missions on the board out in the dark
  function setupHub(map: LvMap, sp: any) {
    const TS = G.Level.TS, Wm = map.W * TS, Hm = map.H * TS, RZ = G.Hangar.RZ;
    const rock = G.ShipModel.asteroid(Wm, Hm, 99); addObj(rock.group);
    zoneTraffic(4271, new T.Vector3(Wm / 2, 900, Hm / 2), 6500, 5000, 5); // (what's about the base: nothing comes within a few kilometres of the rock)
    const base = new T.Vector3(S.berth.x, 0, S.berth.z);
    S.wps.push({ id: 'base', name: 'HOME', sub: 'Hangar pad', p: base.clone().setY(40), kind: 'base' });
    placeAnchors();
    // the hall and the range's walls north of the pad: not to be flown through. The hollow's ground and walls, and past them the rock.
    S.boxes.push([-6, -5, -20, Wm + 6, 11, RZ + 28.5]);
    S.floorAt = (x, z) => { const hx = Math.hypot(x - rock.C.x, z - rock.C.z); return hx < 700 ? rock.height(x, z) + (Math.abs(x - Wm / 2) < Wm / 2 + 60 && Math.abs(z - Hm / 2) < Hm / 2 + 60 ? 0.4 : 5) : hx < rock.R + 150 ? Math.sqrt(Math.max(0, (rock.R + 150) ** 2 - hx * hx)) - rock.R : -1e9; };
    // the missions terminal by the pad: a console and the board over it
    const tx = 37.5, tz = RZ + 29.3, g = new T.Group(), M = G.ShipModel.M;
    const post = M(0x3a4047, { emissive: 0x0c0d0f }), body = M(0x59626c, { emissive: 0x111316 });
    const bx = (mt: THREE.Material, x0: number, y0: number, z0: number, x1: number, y1: number, z1: number) => { const mm = new T.Mesh(new T.BoxGeometry(x1 - x0, y1 - y0, z1 - z0), mt); mm.position.set((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2); g.add(mm); };
    bx(body, -0.6, 0, -0.25, 0.6, 1.0, 0.25); bx(post, -1.9, 0, -0.08, -1.75, 3.4, 0.08); bx(post, 1.75, 0, -0.08, 1.9, 3.4, 0.08); bx(post, -1.9, 1.7, -0.06, 1.9, 3.4, 0);
    const scr = new T.Mesh(new T.PlaneGeometry(3.5, 1.6), new T.MeshBasicMaterial({ map: G.SpaceUI.boardTex() })); scr.position.set(0, 2.55, 0.01); g.add(scr);
    const face = new T.Mesh(new T.PlaneGeometry(1.0, 0.5), G.ShipModel.lit(0x1c6a88)); face.position.set(0, 1.02, 0.1); face.rotation.x = -1.1; g.add(face);
    g.position.set(tx, 0, tz); G.R.levelRoot.add(g);
    S.term = { x: tx, z: tz + 0.9 };
    S.solids.push({ s: null, on: false, b: [tx - 0.6, 0, tz - 0.25, tx + 0.6, 1.0, tz + 0.25] }, { s: null, on: false, b: [tx - 1.9, 0, tz - 0.08, tx - 1.75, 3.4, tz + 0.08] }, { s: null, on: false, b: [tx + 1.75, 0, tz - 0.08, tx + 1.9, 3.4, tz + 0.08] });
    // home from a mission: out of the tunnel by that mission's anchor, nose to the base
    const at = sp && sp.ship && !sp.ship.docked ? sp.ship.at : null;
    if (at != null && S.anchors.find((a) => a.i === at)) {
      const a = S.anchors.find((q) => q.i === at)!, dir = base.clone().sub(a.p).normalize();
      arriveAt(a.p.clone().addScaledVector(dir, 160), dir);
    } else if (sp && sp.ship && !sp.ship.docked) arriveAt(base.clone().add(new T.Vector3(-300, 260, 500)), new T.Vector3(0.4, -0.3, -0.8).normalize());
  }
  function placeAnchors() {
    if (S.kind !== 'hub' || !S.root) return;
    for (const a of S.anchors) S.root.remove(a.obj);
    S.anchors = []; S.wps = S.wps.filter((w) => w.kind !== 'anchor');
    const offers = SD.offers(S.board.seed, S.board.level), base = new T.Vector3(S.berth.x, 0, S.berth.z);
    for (const i of S.board.picked) {
      const ms = offers[i]; if (!ms) continue;
      const done = S.board.done.includes(i), p = new T.Vector3(...ms.anchor).add(base); p.y = Math.max(p.y, 900);
      const obj = addObj(G.ShipModel.anchor(done ? 0x55606a : ms.kind === 'assault' ? 0x9cff8a : 0x66c8ff), p); obj.lookAt(base);
      S.anchors.push({ i, obj, p });
      S.wps.push({ id: 'a' + i, name: done ? ms.name + ' · DONE' : ms.name, sub: `Anchor · jump ${ms.ly.toFixed(1)} ly`, p, kind: 'anchor', i, hide: done });
    }
    if (S.tgt >= S.wps.length || (S.wps[S.tgt] && S.wps[S.tgt].hide)) S.tgt = Math.max(0, S.wps.findIndex((w) => w.kind === 'anchor' && !w.hide));
  }
  // -- a ship to board: her hull over the level, the plate to hit, the anchor to leave by
  function setupBoard(map: LvMap) {
    const sp = map.sp!, b = sp.breach, zk = S.zinfo && S.zinfo.near && zoneHullsOf === S.zinfo.ms.seed ? S.zinfo.ms.seed + ':' + S.zinfo.act : null, kept = zk ? zoneHulls.get(zk) : null;
    if (!zk) zoneClear(); // (jumped in: nothing's kept from before)
    // (her hull: the one she's been seen in from outside, if she has been)
    if (kept) { zoneHulls.delete(zk!); kept.holder.remove(kept.h.group); kept.h.group.position.set(0, 0, 0); kept.h.marker.visible = true; if (kept.map && kept.map !== map) viewDrop(kept.map); }
    const h = S.hull = kept ? kept.h : G.ShipModel.hull(map);
    G.R.levelRoot.add(h.group);
    const TS = G.Level.TS;
    map.rooms.forEach((rm) => { const y = (rm.fl || 0) * G.Level.FLOOR_H; S.boxes.push([rm.x * TS - 1.2, y - 2.4, rm.z * TS - 1.2, (rm.x + rm.w) * TS + 1.2, y + G.Level.WALL_H + 1.2, (rm.z + rm.h) * TS + 1.2]); });
    // a ship that isn't the mission's, lying off her: marked, to be boarded or left
    for (const hh of sp.hulls) if (!hh.main) S.wps.push({ id: 'other', name: SD.SIZES[hh.size].name.toUpperCase(), sub: 'Not the mission: board her for salvage, or leave her', p: new T.Vector3((hh.x0 + hh.x1) / 2, 6, (hh.z0 + hh.z1) / 2), kind: 'base' });
    const out = new T.Vector3(), a = G.ShipModel.anchor(); a.position.set(0, 150, 2600); a.rotation.y = Math.PI;
    S.anchors.push({ i: -1, obj: a, p: out, p0: a.position.clone() });
    // She's under way: the zone goes by her (and by everyone with her) at her own pace, bow first (a flying wing's is her corner).
    // The anchor is a place in the zone, so it falls astern; the others out here hold their own courses.
    S.zone!.add(a); if (S.state && S.state.zt != null) { S.zt0 = S.state.zt; S.ztAt = performance.now(); } else S.zt0 = 0;
    // the zone's ships (js/spacedata.ts zone): the one this level is isn't drawn out there (she's here); each of the rest is, on
    // her course, and is on the navigation screen: come up within 450 m of one and the squad's ship matches her course (update)
    const zi = S.zinfo;
    S.zdef = SD.zone(zi ? zi.ms : { seed: map.seed, size: sp.size, th: SD.themeIndex(map.theme), wing: !!sp.wing, name: (S.ms && S.ms.name) || '' }); S.zact = zi ? zi.act : 0;
    S.zC.set((sp.hull.x0 + sp.hull.x1) / 2, 0, (sp.hull.z0 + sp.hull.z1) / 2);
    for (const c of S.zdef) {
      if (c.k === S.zact) continue;
      const t = G.ShipModel.traffic(c.kind, c.seed); S.zone!.add(t.group);
      const wp: SpWp = { id: 't' + c.k, name: c.k === 0 ? c.name + ' · THE MISSION' : c.name, sub: SD.SIZES[c.size].name + (c.wing ? ', a flying wing' : '') + ' · come within 450 m to match her course and board', p: new T.Vector3(), kind: 'base' };
      S.wps.push(wp); S.traffic.push({ obj: t.group, c, wp, ph: (c.seed % 30) / 10 });
    }
    zoneStep(); for (let k = 0; k < S.traffic.length; k++) zoneReal(true);
    S.wps.push({ id: 'breach', name: 'SUGGESTED BREACH', sub: 'The hold: or ram any clear stretch of her hull', p: new T.Vector3(b.x, 1.4, b.face + 0.4), kind: 'breach' }, { id: 'out', name: 'ANCHOR', sub: 'Jump home', p: out, kind: 'anchor', i: -1 });
    S.tgt = 0;
    if (zi && zi.near) { // (come up with her: no jump. The squad's ship is where she was by her, heading as she was)
      const c = S.carry && S.carry.k === zi.act ? S.carry : null;
      if (c) { const rot = yawQ((sp.wing ? Math.atan2(-1, -1) : Math.atan2(-1, 0)) - c.yaw); S.P.copy(c.v).applyQuaternion(rot).add(S.zC); S.Q.copy(rot).multiply(c.Q); S.V.copy(c.V).applyQuaternion(rot); }
      else { S.P.set(b.x + 30, 28, b.face + 260); S.Q.copy(lookQ(new T.Vector3(-0.1, -0.1, -1).normalize())); S.V.set(0, 0, 0); }
      S.docked = false; S.carry = null;
    }
    else arriveAt(new T.Vector3(b.x + 260, 140, b.face + 1700), new T.Vector3(-0.15, -0.08, -1).normalize());
    things(map);
  }
  // what the mission wants aboard her: the artifact on its stand, the self-destruct's console, the pods' hatches, lights over the locked doors
  function things(map: LvMap) {
    const sp = map.sp!, M = G.ShipModel.M, lit = G.ShipModel.lit, root = G.R.levelRoot, obj = S.ms ? S.ms.obj : sp.obj;
    const put = (k: string, at: { x: number; z: number; y?: number }, o: THREE.Object3D, n?: number) => { o.position.set(at.x, at.y || 0, at.z); root.add(o); S.things.push({ k, n, x: at.x, z: at.z, y: at.y || 0, obj: o }); };
    if (obj === 'artifact' && sp.artifact) {
      const g = new T.Group(), st = new T.Mesh(new T.CylinderGeometry(0.22, 0.3, 0.8, 10), M(0x2c3036)); st.position.y = 0.4; g.add(st);
      const a = new T.Mesh(new T.OctahedronGeometry(0.2), new T.MeshStandardMaterial({ color: 0x40ffd0, emissive: 0x20c8a0, emissiveIntensity: 2, roughness: 0.2 })); a.position.y = 1.15; g.add(a); g.userData.art = a;
      const l = new T.PointLight(0x40ffd0, 2.5, 6, 1.5); l.position.y = 1.2; g.add(l);
      put('art', sp.artifact, g);
    }
    if (obj === 'destruct' && sp.console) {
      const g = new T.Group(), c = new T.Mesh(new T.BoxGeometry(0.7, 1.05, 0.4), M(0x30343a)); c.position.y = 0.52; g.add(c);
      const s2 = new T.Mesh(new T.BoxGeometry(0.56, 0.3, 0.02), lit(0xff3020)); s2.position.set(0, 1.12, 0); s2.rotation.x = -0.4; g.add(s2); g.userData.scr = s2;
      put('cons', sp.console, g);
    }
    sp.pods.forEach((p, n) => {
      const g = new T.Group(), f = new T.Mesh(new T.TorusGeometry(0.55, 0.07, 6, 18), M(0xb8862a, { emissive: 0x2a1c06 })); f.rotation.x = Math.PI / 2; f.position.y = 0.03; g.add(f);
      const d = new T.Mesh(new T.CircleGeometry(0.5, 18), lit(0x1c7a40)); d.rotation.x = -Math.PI / 2; d.position.y = 0.02; g.add(d);
      put('pod', p, g, n);
    });
    sp.salvage.forEach((p, n) => {
      const g = new T.Group(), c = new T.Mesh(new T.BoxGeometry(0.7, 0.5, 0.5), M(0x4a5a3a, { emissive: 0x0c1008 })); c.position.y = 0.25; g.add(c);
      const l2 = new T.Mesh(new T.BoxGeometry(0.5, 0.04, 0.3), lit(0x9cff8a)); l2.position.y = 0.52; g.add(l2);
      put('salv', p, g, n);
    });
    for (const id of Object.keys(sp.locks)) {
      const d = map.doors[+id], k = sp.locks[+id]; if (!d || k === 'breach') continue;
      const l = new T.Mesh(new T.BoxGeometry(0.3, 0.1, 0.9), lit(0xff3020)); l.position.set(d.x, (d.fy || 0) + G.Level.DOOR_H + 0.25, d.z); if (d.axis === 'z') l.rotation.y = Math.PI / 2; l.userData.lock = k; root.add(l); S.things.push({ k: 'lock', x: d.x, z: d.z, obj: l });
    }
  }
  // ---- The zone: open space a long way round, and what else is under way in it. Each of the others (zoneTraffic) keeps a
  // course of its own, a loop through a few points round the middle (never through it), at its own pace; where it is goes by
  // the zone's clock alone (the host's on a mission, the day's at the base), so it's the same on every screen. On a mission
  // the ship being boarded is under way too: the zone slides by her (zoneV), which is to say by the level and all aboard.
  function zoneTraffic(seed: number, c: THREE.Vector3, r0: number, rSpan: number, n: number) { // (round the base: only seen)
    const r = G.U.rng((seed ^ 0x20e5) >>> 0), KINDS = ['freighter', 'freighter', 'cutter', 'pirate', 'navy', 'wing', 'freighter'], buoy = G.ShipModel.lit(0x66c8ff), bg = new T.OctahedronGeometry(7);
    for (let i = 0; i < n; i++) {
      const m = 3 + Math.floor(r() * 3), rad = r0 + r() * rSpan, a0 = r() * 6.283, tilt = (r() - 0.5) * 0.5, pts: number[][] = [];
      for (let k = 0; k < m; k++) { const an = a0 + k * 6.283 / m + (r() - 0.5) * 0.4, rr = rad * (0.85 + r() * 0.3); pts.push([c.x + Math.cos(an) * rr, c.y + Math.sin(an) * rr * tilt + (r() - 0.5) * 300, c.z + Math.sin(an) * rr]); }
      const lens = pts.map((p, k) => Math.hypot(pts[(k + 1) % m][0] - p[0], pts[(k + 1) % m][1] - p[1], pts[(k + 1) % m][2] - p[2])), total = lens.reduce((a, b) => a + b, 0), kind = KINDS[Math.floor(r() * KINDS.length)];
      const t = G.ShipModel.traffic(kind, (seed + i * 7919) >>> 0); S.zone!.add(t.group);
      S.traffic.push({ obj: t.group, c: { pts, lens, total, speed: kind === 'freighter' ? 40 + r() * 30 : kind === 'navy' ? 60 + r() * 40 : 80 + r() * 70, off: r() * total }, wp: null, ph: r() * 3 });
      for (const p of pts) { const b = new T.Mesh(bg, buoy); b.position.set(p[0], p[1], p[2]); S.zone!.add(b); }
    }
  }
  // Where everything in the zone is now. On a mission the level is one of the zone's ships (zact), under way on her own course:
  // the zone is drawn from her (it goes by, and turns when she does), so the others, the anchor and the stars are where they'd be
  // seen from her deck or from the squad's ship keeping her company.
  const _zd = new T.Vector3(), _zq = new T.Quaternion();
  function zoneStep() {
    if (!S.zone) return;
    const t = S.zt0 + (performance.now() - S.ztAt) / 1000;
    if (S.kind === 'board' && S.zdef[S.zact]) {
      const a = SD.zonePos(S.zdef[S.zact], t), bow = S.map && S.map.sp && S.map.sp.wing ? Math.atan2(-1, -1) : Math.atan2(-1, 0);
      S.zone.quaternion.copy(yawQ(-(Math.atan2(a.d[0], a.d[2]) - bow)));
      S.zone.position.set(-a.p[0], -a.p[1], -a.p[2]).applyQuaternion(S.zone.quaternion).add(S.zC);
    }
    for (const q of S.anchors) if (q.p0) q.p.copy(q.p0).applyQuaternion(S.zone.quaternion).add(S.zone.position);
    for (const q of S.traffic) {
      const z = SD.zonePos(q.c, t);
      q.obj.position.set(z.p[0], z.p[1], z.p[2]);
      if (q.real) q.obj.quaternion.copy(yawQ(Math.atan2(z.d[0], z.d[2]) - q.bow!)); else q.obj.quaternion.copy(lookQ(_zd.set(z.d[0], z.d[1], z.d[2])));
      if (q.wp) q.wp.p.copy(q.obj.position).applyQuaternion(S.zone.quaternion).add(S.zone.position);
      const st = q.obj.userData.strobe as THREE.Object3D | undefined; if (st) st.visible = (t + q.ph) % 1.6 < 0.18;
    }
    void _zq;
    zoneReal(false);
  }
  // A ship of the zone's that's come within five kilometres is drawn as herself: her own hull (the level she'd be, laid out
  // from her seed: js/level.ts generate, js/shipmodel.ts hull), not the stand-in seen further off. So when the squad's ship
  // comes up with her and she becomes the level, nothing outside changes. One a frame (all: every one in reach, at once).
  /** The level already laid out for one of the zone's ships (for her hull, seen from outside), if it's the one now wanted: it's hers to be the level with (js/game.ts enterLevel). */
  function takeMap(seed: number, level: number, th: number | undefined, night: boolean, gen: any): LvMap | null {
    if (!G.Prep) return null;
    const key = G.Prep.keyOf(seed, level, th, night, gen);
    for (const h of zoneHulls.values()) if (h.map && h.key === key) { const m = h.map; h.map = null; return m; }
    return null;
  }
  // (the figures the host will make her level with, should the squad's ship come up with her: js/spaceserver.ts 'tboard', genOf)
  function zoneLevel(c: SpContact) {
    const zi = S.zinfo, zm = zi ? zi.ms : null, main = c.k === 0 && zm ? zm : null, diff = zm && zm.diff ? zm.diff : G.Game.level;
    return { seed: c.seed, level: main ? diff : Math.max(1, diff - 1), th: c.th, night: main ? !!main.night : false, gen: { size: c.size, obj: main ? main.obj : 'visit', ship: S.fleet.ship, other: main ? main.other : null, wing: !!c.wing } };
  }
  type ZHull = { holder: THREE.Group; h: ReturnType<typeof G.ShipModel.hull>; bow: number; map: LvMap | null; key: string };
  const viewDrop = (map: LvMap | null) => { // (what was made of her ahead, not wanted after all)
    const p = map && (map as any).viewPre as LvViewPre | null; if (!p) return;
    p.root.traverse((o: any) => { if (o.geometry) o.geometry.dispose(); if (o.material) for (const m of Array.isArray(o.material) ? o.material : [o.material]) { if (m.map) m.map.dispose(); m.dispose(); } });
    (map as any).viewPre = null;
  };
  const zoneClear = () => { for (const h of zoneHulls.values()) { viewDrop(h.map); h.holder.traverse((o: any) => { if (o.geometry) o.geometry.dispose(); }); } zoneHulls.clear(); };
  const zoneHulls = new Map<string, ZHull>(); let zoneHullsOf = -1; // (the hulls made, kept from one of the zone's ships to the next)
  function zoneReal(all: boolean) {
    if (S.kind !== 'board' || !S.zone) return;
    const zseed = S.zinfo ? S.zinfo.ms.seed : -2;
    if (zoneHullsOf !== zseed) { zoneClear(); zoneHullsOf = zseed; }
    for (const q of S.traffic) {
      if (q.real || !q.wp || q.c.k == null || S.P.distanceTo(q.wp.p) > 5000) continue;
      const c = S.zdef[q.c.k], lv = zoneLevel(c);
      // (she may be the level soon: her light's worked out on another thread meanwhile, js/prep.ts)
      if (G.Prep) G.Prep.want(lv.seed, lv.level, lv.th, lv.night, lv.gen);
      let hit = zoneHulls.get(zseed + ':' + c.k);
      if (!hit) {
        const map = q.pend || G.Level.generate(lv.seed, lv.level, lv.th, lv.night, lv.gen);
        if (!map.sp) { q.real = true; continue; }
        if (!all && !q.pend) { q.pend = map; return; } // (laid out in this frame, her hull made in the next)
        q.pend = null;
        const h = G.ShipModel.hull(map), holder = new T.Group(); h.marker.visible = false;
        h.group.position.set(-(map.sp.hull.x0 + map.sp.hull.x1) / 2, 0, -(map.sp.hull.z0 + map.sp.hull.z1) / 2); holder.add(h.group);
        hit = { holder, h, bow: map.sp.wing ? Math.atan2(-1, -1) : Math.atan2(-1, 0), map, key: G.Prep ? G.Prep.keyOf(lv.seed, lv.level, lv.th, lv.night, lv.gen) : '' }; zoneHulls.set(zseed + ':' + c.k, hit);
      }
      hit.holder.position.copy(q.obj.position); S.zone.remove(q.obj); S.zone.add(hit.holder);
      q.obj = hit.holder; q.real = true; q.bow = hit.bow;
      if (!all) return;
    }
  }
  // The nearest of them within two kilometres may be the level in a moment, and that moment mustn't show: so what the level
  // would be made of in the frame it's entered is made now, a few milliseconds a frame, nothing of it in the scene. In turn:
  // her layout, if there's none (zoneReal's, unless she's been the level before); her drawing, mesh by mesh
  // (js/levelview.ts begin, step); then all of it sent to the graphics card and its shaders found (js/render.ts preload). Her
  // light's being worked out on another thread meanwhile (js/prep.ts). js/game.ts enterLevel takes the lot (takeMap) and has
  // only to put it in the scene. Whatever isn't done by then is finished in that frame, as it all used to be.
  function zonePrep() { // (from the game's loop, once the frame's drawn: the scene lit as it's drawn, which is what the shaders are found for)
    if (!S.on || S.kind !== 'board' || !S.zone || !S.zinfo || S.docked || S.ftl || zoneHullsOf !== S.zinfo.ms.seed) return;
    let best: typeof S.traffic[0] | null = null, bd = 2000; const far = new Set<ZHull>();
    for (const q of S.traffic) {
      if (!q.real || !q.wp || q.c.k == null) continue;
      const d = S.P.distanceTo(q.wp.p), h = zoneHulls.get(S.zinfo.ms.seed + ':' + q.c.k);
      if (h && d > 3000) far.add(h);
      if (d < bd) { bd = d; best = q; }
    }
    for (const h of far) if (h.map && (h.map as any).viewPre) { viewDrop(h.map); h.map = null; } // (left behind: hers goes)
    const hit = best && zoneHulls.get(S.zinfo.ms.seed + ':' + best.c.k); if (!best || !hit) return;
    if (!hit.map) {
      const lv = zoneLevel(S.zdef[best.c.k!]);
      hit.map = G.Level.generate(lv.seed, lv.level, lv.th, lv.night, lv.gen); hit.key = G.Prep ? G.Prep.keyOf(lv.seed, lv.level, lv.th, lv.night, lv.gen) : '';
      if (G.Prep) G.Prep.want(lv.seed, lv.level, lv.th, lv.night, lv.gen);
      return;
    }
    if (!hit.key) return; // (no taking it: takeMap)
    const pre = (hit.map as any).viewPre as LvViewPre | null;
    if (!pre) { G.LevelView.begin(hit.map); return; }
    if (!pre.done) { G.LevelView.step(hit.map, 4); return; }
    if (!pre.up) { const lv = zoneLevel(S.zdef[best.c.k!]); pre.up = G.R.preload(pre.root, lv.gen.obj === 'artifact' && hit.map.sp && hit.map.sp.artifact ? 1 : 0); } // (the artifact's glow: things)
    if (pre.up !== true && (pre.up as (ms: number) => boolean)(3)) pre.up = true;
  }
  // The squad's ship has come up with one of the zone's others (within 450 m, for two seconds): the host is asked to make her the
  // level (js/spaceserver.ts 'tboard'). Whoever's flying asks.
  function zoneClose(dt: number) {
    if (S.kind !== 'board' || S.docked || S.ftl || (S.state && S.state.boom)) { S.tclose = null; return; }
    let best: typeof S.traffic[0] | null = null, bd = 450;
    for (const q of S.traffic) { if (!q.wp || q.c.k == null) continue; const d = S.P.distanceTo(q.wp.p); if (d < bd) { bd = d; best = q; } }
    if (!best) { S.tclose = null; return; }
    if (!S.tclose || S.tclose.k !== best.c.k) S.tclose = { k: best.c.k!, t: 0, name: best.wp!.name };
    S.tclose.t += dt;
    if (S.tclose.t > 2 && !S.tclose.sent) { S.tclose.sent = true; G.Net.toHost({ t: 'tboard', k: S.tclose.k }); }
  }
  // -- a base on a planet: in orbit over it first (the level out of sight), then down through the cloud to its pad
  function setupAssault(map: LvMap) {
    const R = 60000;
    S.planet = addObj(G.ShipModel.planet(map.theme, map.seed, R), new T.Vector3(S.berth.x, -R - 14000, S.berth.z));
    const out = new T.Vector3(S.berth.x - 900, 3200, S.berth.z + 2800), a = addObj(G.ShipModel.anchor(0x9cff8a), out);
    S.anchors.push({ i: -1, obj: a, p: out });
    S.wps.push({ id: 'entry', name: 'DESCENT CORRIDOR', sub: 'Fly in to go down through the cloud', p: new T.Vector3(S.berth.x + 1500, -1800, S.berth.z - 6500), kind: 'entry' }, { id: 'lz', name: 'LANDING PAD', sub: 'Set down outside the base', p: new T.Vector3(S.berth.x, 3, S.berth.z), kind: 'lz', hide: true }, { id: 'out', name: 'ANCHOR', sub: 'Jump home', p: out, kind: 'anchor', i: -1 });
    S.tgt = 0;
    // the ground for a few kilometres round the base, for the way down
    const gm = new T.Mesh(new T.CircleGeometry(9000, 48), new T.MeshStandardMaterial({ color: new T.Color(map.theme.floor as string).multiplyScalar(0.55), roughness: 1 })); gm.rotation.x = -Math.PI / 2; gm.position.set(S.berth.x, -0.45, S.berth.z); gm.visible = false; S.root!.add(gm); gm.userData.ground = 1;
    S.floorAt = (x, z) => { const d = Math.hypot(x - S.berth.x, z - S.berth.z); return S.stage === 'atmo' ? S.berth.y + G.U.clamp((d - 14) * 0.9, 0.02, 16) : -1e9; };
    stage('orbit');
    arriveAt(out.clone().add(new T.Vector3(120, -40, -260)), new T.Vector3(0.2, -0.45, -0.85).normalize());
  }
  function stage(st: 'orbit' | 'atmo') {
    S.stage = st;
    const atmo = st === 'atmo';
    G.R.levelRoot.visible = atmo;
    if (S.planet) S.planet.visible = !atmo;
    for (const o of S.root!.children) if (o.userData.ground) o.visible = atmo;
    for (const a of S.anchors) a.obj.visible = !atmo;
    for (const w of S.wps) w.hide = w.kind === 'lz' ? !atmo : atmo;
    S.tgt = S.wps.findIndex((w) => !w.hide && (atmo ? w.kind === 'lz' : S.state && S.state.done ? w.kind === 'anchor' : w.kind === 'entry'));
    sky();
  }
  // down through the cloud (or up out of it): the screen clouds over, the other place is put there, it clears
  function through(to: 'orbit' | 'atmo') {
    if (S.stage === to) return;
    veilKind('cloud'); G.Game.veil(true);
    const map = S.map;
    setTimeout(() => {
      if (S.map !== map || !S.on) return;
      stage(to);
      if (isCtl() || !S.ctl) {
        if (to === 'atmo') { S.P.set(S.berth.x + 500, 900, S.berth.z + 900); const d = new T.Vector3(-0.42, -0.5, -0.75).normalize(); S.Q.copy(lookQ(d)); S.V.copy(d).multiplyScalar(90); }
        else { const o = S.wps.find((w) => w.id === 'entry')!.p; S.P.copy(o).lerp(S.anchors[0].p, 0.25); const d = S.anchors[0].p.clone().sub(S.P).normalize(); S.Q.copy(lookQ(d)); S.V.copy(d).multiplyScalar(120); }
      }
      S.net = null;
      G.Game.veilN = G.Game.VEIL_SMOOTH;
    }, G.Game.VEIL_MS + 250);
  }
  function lookQ(dir: THREE.Vector3) { const m = new T.Matrix4().lookAt(new T.Vector3(), dir, new T.Vector3(0, 1, 0)); return new T.Quaternion().setFromRotationMatrix(m); }
  // out of a jump here: in the tunnel a few seconds more (the place is built already: this is the last of the trip)
  function arriveAt(p: THREE.Vector3, dir: THREE.Vector3) {
    S.P.copy(p); S.Q.copy(lookQ(dir)); S.V.copy(dir).multiplyScalar(60); S.docked = false;
    S.ftl = { st: 'tunnel', t: 0, to: 0, T: 4.5 };
  }

  // ------------------------------------------------------------------ her deck in the world, her doors
  function syncSolids() {
    const w = S.map && S.map.world; if (!w) return;
    const noseOpen = S.docked && S.kind === 'board', rampOpen = S.docked && S.kind !== 'board';
    for (const q of S.solids) {
      const want = q.tag === 'nose' ? !noseOpen : q.tag === 'ramp' ? !rampOpen : true;
      if (want && !q.on) { q.s = G.World.add(w, G.World.box(q.b[0], q.b[1], q.b[2], q.b[3], q.b[4], q.b[5], { kind: 'prop' })); q.on = true; }
      else if (!want && q.on) { G.World.remove(w, q.s); q.on = false; }
    }
  }
  function doors(dt: number) {
    const m = S.model!, noseOpen = S.docked && S.kind === 'board' ? 1 : 0, rampOpen = S.docked && S.kind !== 'board' && !S.auto ? 1 : 0;
    S.noseT += G.U.clamp(noseOpen - S.noseT, -dt * 1.6, dt * 1.6); S.rampT += G.U.clamp(rampOpen - S.rampT, -dt * 0.8, dt * 0.8);
    for (const lf of m.nose) lf.position.x = lf.userData.s * 0.86 * S.noseT;
    m.ramp.rotation.x = S.rampT * (Math.PI / 2 + 0.1);
  }

  // ------------------------------------------------------------------ what's outside, moved by the inverse of her pose
  const _r = new T.Quaternion(), _p = new T.Vector3();
  function outside() {
    if (!S.on || !S.root) return;
    _r.copy(S.Q).invert().premultiply(S.Dq); // R = Dq * Q^-1
    _p.copy(S.P).applyQuaternion(_r).negate().add(S.Dp);
    if (S.docked && !S.auto) { _r.identity(); _p.set(0, 0, 0); }
    for (const o of [G.R.levelRoot, S.root]) { o.quaternion.copy(_r); o.position.copy(_p); }
    const cam = G.R.camera;
    if (S.stars) { S.stars.position.copy(cam.position); S.stars.quaternion.copy(_r); if (S.zone) S.stars.quaternion.multiply(S.zone.quaternion); } // (the stars are the zone's: they turn when the ship the level is turns)
    if (S.sun) {
      const d = new T.Vector3(0.5, 0.62, 0.6).normalize().applyQuaternion(_r);
      S.sun.position.copy(cam.position).addScaledVector(d, 200); S.sun.target.position.copy(cam.position);
      const want = S.docked && !S.auto ? 0 : S.ftl ? 0.4 : 2.4; S.sun.intensity += (want - S.sun.intensity) * 0.08;
    }
  }
  // Flying, nothing of the level's that isn't in its drawing may show (it would hang beside her where the level was):
  // everything loose in the scene is put out of sight, and the people who aren't aboard; put back when she's against it again.
  function hideStrays() {
    const sc = G.R.scene, keep = new Set<THREE.Object3D>([G.R.camera, G.R.levelRoot, G.R.dynRoot, S.root!, S.model!.group, S.stars!, S.sun!, S.sun!.target]);
    if (!S.hidden) S.hidden = new Map();
    for (const c of sc.children) {
      if (keep.has(c) || (c as any).isHemisphereLight || (c as any).isAmbientLight) continue;
      if (!S.hidden.has(c)) S.hidden.set(c, c.visible);
      c.visible = false;
    }
    const crew = new Set<THREE.Object3D>();
    for (const pv of G.Views.players.values()) if (pv.rig && pv.st && aboardAt(pv.st.p[0], pv.st.p[1], pv.st.p[2])) crew.add(pv.rig.root);
    for (const c of G.R.dynRoot.children) {
      if (crew.has(c)) { c.visible = true; continue; }
      if (!S.hidden.has(c)) S.hidden.set(c, c.visible);
      c.visible = false;
    }
  }
  function unhide() {
    if (!S.hidden) return;
    for (const [o, v] of S.hidden) o.visible = v;
    S.hidden = null;
  }

  // ------------------------------------------------------------------ seats
  function seatPos(i: number) {
    const s = S.seatsDef[i] || S.seatsDef[0], w = SD.toWorld(S.berth, s.x, s.y, s.z);
    return { x: w.x, y: w.y, z: w.z, yaw: S.berth.yaw + s.yaw };
  }
  function sit(i: number, quiet?: boolean) {
    const m = me(), p = seatPos(i);
    m.seat = i; m.pos.set(p.x, p.y, p.z); m.vel.set(0, 0, 0); m.yaw = p.yaw; m.pitch = 0; m.crouch = true; m.stowed = true; m.mouse.l = m.mouse.r = false;
    if (!quiet) { G.Net.toHost({ t: 'seat', s: i }); G.Audio.click(); }
    if (S.seatsDef[i].k === 'helm') { S.ctl = G.Net.myId; S.net = null; S.helpAt = S.t; }
    S.stick.set(0, 0);
  }
  function stand() {
    const m = me(), i = m.seat; if (i == null) return;
    const s = S.seatsDef[i], w = SD.toWorld(S.berth, G.U.clamp(s.x * 0.45, -S.def.hw + 0.5, S.def.hw - 0.5), SD.FLOOR, s.z + (s.k === 'jump' || s.k === 'turret' ? 0 : 0.9));
    m.seat = null; m.pos.set(w.x, w.y, w.z); m.vel.set(0, 0, 0); m.crouch = false; m.stowed = false;
    G.Net.toHost({ t: 'seat', s: -1 }); G.Audio.click();
  }
  // everyone who's on their feet is aboard (nobody's left behind when she goes)
  function crewAboard() {
    const out: string[] = [];
    for (const pv of G.Views.players.values()) { const st = pv.st; if (pv.id === G.Net.myId || !st || st.dd || st.dn) continue; if (!aboardAt(st.p[0], st.p[1], st.p[2])) out.push(pv.name); }
    if (!aboard() && !me().dead) out.push('you');
    return out;
  }

  // ------------------------------------------------------------------ flying her
  const K = (c: string) => !!me().keys[c] && !G.Game.chatOpen && !G.Game.menuOpen();
  function fly(dt: number) {
    const d = S.def, seat = mySeat(), helm = !!seat && seat.k === 'helm' && isCtl() && !me().dead && !me().down;
    // the mouse: what it's turned your view by since the last frame is the stick's push (it springs back)
    // (the right button held: your head turns instead, to look about the cockpit and out of its glass)
    if (helm && !me().mouse.r) {
      const sy = seatPos(me().seat as number).yaw, dy = G.U.angDiff(sy, me().yaw), dp = me().pitch - S.lookP;
      me().yaw = sy; me().pitch = S.lookP = 0;
      S.stick.x = G.U.clamp(S.stick.x + dy * 2.2, -1, 1); S.stick.y = G.U.clamp(S.stick.y + dp * 2.2, -1, 1);
    } else if (helm) S.lookP = me().pitch;
    S.stick.multiplyScalar(Math.exp(-dt * 2.2));
    if (S.auto) { autoStep(dt); return; }
    if (S.docked || S.ftl) { S.V.set(0, 0, 0); S.Wv.set(0, 0, 0); return; }
    const want = new T.Vector3(), wv = new T.Vector3();
    let acc = 26;
    if (helm) {
      const far = clearOf() > 420;
      S.cruise = K('ShiftLeft') && K('KeyW') && far && S.stage !== 'atmo';
      const sp = S.cruise ? d.cruise * (SD.fitted(S.fleet, 'drive') ? 1.33 : 1) : S.stage === 'atmo' ? Math.min(d.speed, 110) : d.speed;
      want.set((K('KeyD') ? 1 : 0) - (K('KeyA') ? 1 : 0), (K('Space') ? 1 : 0) - (K('KeyC') ? 1 : 0), (K('KeyS') ? 1 : 0) - (K('KeyW') ? 1 : 0));
      want.x *= d.speed * 0.4; want.y *= d.speed * 0.4; want.z *= want.z < 0 ? sp : d.speed * 0.4;
      if (K('KeyX')) want.set(0, 0, 0);
      acc = S.cruise ? 260 : K('KeyX') ? 60 : 30;
      wv.set(S.stick.y * d.turn, S.stick.x * d.turn, ((K('KeyQ') ? 1 : 0) - (K('KeyE') ? 1 : 0)) * 1.3);
    } else S.cruise = false;
    S.Wv.lerp(wv, Math.min(1, dt * 5));
    const dq = new T.Quaternion().setFromEuler(new T.Euler(S.Wv.x * dt, S.Wv.y * dt, S.Wv.z * dt, 'YXZ'));
    S.Q.multiply(dq).normalize();
    // in air she rights herself (no rolling over above a base)
    if (S.stage === 'atmo' && S.kind === 'assault') { const up = new T.Vector3(0, 1, 0).applyQuaternion(S.Q), fix = new T.Quaternion().setFromUnitVectors(up, new T.Vector3(up.x * 0.5, Math.max(0.6, up.y), up.z * 0.5).normalize()); S.Q.premultiply(new T.Quaternion().slerp(fix, Math.min(1, dt * 1.5))).normalize(); }
    want.applyQuaternion(S.Q);
    const dv = want.sub(S.V), l = dv.length(), step = acc * dt * (S.V.length() > d.speed * 1.2 && !S.cruise ? 6 : 1);
    if (l > 1e-4) S.V.addScaledVector(dv, Math.min(1, step / l));
    S.P.addScaledVector(S.V, dt);
    collide(dt);
    events();
  }
  // how far she is from anything big (no cruising close in)
  function clearOf() {
    let dmin = 1e9;
    if (S.kind === 'hub') { const b = new T.Vector3(S.berth.x, -1500, S.berth.z); dmin = S.P.distanceTo(b) - 1500; }
    else if (S.kind === 'board') dmin = S.P.distanceTo(S.Dp);
    else if (S.stage === 'atmo') dmin = 0; else dmin = S.P.y + 4000;
    return dmin;
  }
  function collide(dt: number) {
    const R = 5.5, P = S.P; let hit = 0;
    if (S.floorAt) { const h = S.floorAt(P.x, P.z); if (P.y < h) { hit = Math.max(hit, -S.V.y); P.y = h; if (S.V.y < 0) S.V.y = 0; S.V.multiplyScalar(Math.exp(-dt * 1.5)); } }
    // (lined up on a stretch of hull she can breach, and close: the way in is clear by that site's own measure)
    const ap = S.kind === 'board' ? aim(20) : null, lined = !!ap && ap.align > 0.8 && Math.abs(ap.dy) < 1.6;
    for (const b of lined ? [] : S.boxes) {
      const qx = G.U.clamp(P.x, b[0], b[3]), qy = G.U.clamp(P.y + 1.4, b[1], b[4]), qz = G.U.clamp(P.z, b[2], b[5]);
      const dx = P.x - qx, dy = P.y + 1.4 - qy, dz = P.z - qz, dd = Math.hypot(dx, dy, dz);
      if (dd >= R) continue;
      const n = dd > 1e-3 ? new T.Vector3(dx / dd, dy / dd, dz / dd) : new T.Vector3(0, 1, 0), vn = S.V.dot(n);
      P.addScaledVector(n, R - dd);
      if (vn < 0) { hit = Math.max(hit, -vn); S.V.addScaledVector(n, -vn * 1.3); }
    }
    if (hit > 12) { damage((hit - 12) * 1.2, 'She hit something hard'); S.shake = Math.min(1, hit / 40); }
  }
  function damage(n: number, why?: string) {
    if (!isCtl()) return;
    S.hp = Math.max(0, S.hp - n);
    G.Net.toHost({ t: 'shit', i: -1, hp: S.hp });
    if (why && n > 4) G.HUD.toast('HULL ' + Math.round(S.hp / S.hpMax * 100) + '%', why, 1.5);
    if (S.hp <= 0 && !S.lostAt) {
      // she can't take any more: the drive jumps her home by itself (the mission is left as it is)
      S.lostAt = S.t;
      G.HUD.toast('HULL FAILING', 'Emergency jump: the repairs come out of your pay', 3);
      if (S.kind !== 'hub') G.Net.toHost({ t: 'jump', to: -1 }); else { S.hp = S.hpMax * 0.3; S.lostAt = 0; }
    }
  }
  // what happens as she flies: the breach, the descent, the way up
  function events() {
    if (S.kind === 'board' && S.map && !S.state?.boom) {
      // her nose into the hull, square on and fast enough: she's through, wherever that is along it
      const a = aim(6), up = new T.Vector3(0, 1, 0).applyQuaternion(S.Q);
      if (a && a.range < 2.6 && a.align > 0.8 && up.y > 0.8 && a.close > 3.5 && Math.abs(a.dy) < 1.6) {
        S.shake = 1;
        if (a.close > 45) damage((a.close - 45) * 1.5, 'Too fast into the hull');
        const at = [a.site.c, a.site.nx, a.site.nz];
        rebase(berthAt(a.site));
        auto(S.Dp, S.Dq, 0.35, null, () => { G.Net.toHost({ t: 'sdock', on: 1, site: at }); cutHere(at); dockLocal(true); });
        G.Audio.kick(2);
      }
    }
    if (S.kind === 'assault') {
      if (S.stage === 'orbit') { const e = S.wps.find((w) => w.id === 'entry'); if (e && S.P.distanceTo(e.p) < 700) through('atmo'); }
      else if (S.P.y > 1500 && S.V.y > 0) through('orbit');
    }
  }
  // an eased move to a pose (setting down, lifting off, the last of a breach), then what follows
  function auto(P1: THREE.Vector3, Q1: THREE.Quaternion, Tm: number, mid: THREE.Vector3 | null, then: () => void) {
    S.auto = { t: 0, T: Tm, P0: S.P.clone(), Q0: S.Q.clone(), P1: P1.clone(), Q1: Q1.clone(), mid, then }; S.V.set(0, 0, 0); S.Wv.set(0, 0, 0);
  }
  function autoStep(dt: number) {
    const a = S.auto!; a.t += dt;
    const u = Math.min(1, a.t / a.T), e = u * u * (3 - 2 * u);
    if (a.mid) { const k = Math.min(1, u * 2), k2 = Math.max(0, u * 2 - 1), e1 = k * k * (3 - 2 * k), e2 = k2 * k2 * (3 - 2 * k2); S.P.copy(a.P0).lerp(a.mid, e1).lerp(a.P1, e2); S.Q.copy(a.Q0).slerp(a.Q1, e1); }
    else { S.P.copy(a.P0).lerp(a.P1, e); S.Q.copy(a.Q0).slerp(a.Q1, e); }
    if (u >= 1) { S.auto = null; a.then(); }
  }
  // she's against it (or off it) on this screen
  function dockLocal(on: boolean) {
    S.docked = on;
    if (on) { S.P.copy(S.Dp); S.Q.copy(S.Dq); S.V.set(0, 0, 0); S.net = null; unhide(); }
    syncSolids();
  }
  // the pilot's: set down (the pad in the hangar, the pad outside a base), and lift off or back away
  function land() {
    const hover = S.Dp.clone().add(new T.Vector3(0, 9, 0));
    auto(S.Dp, S.Dq, 6, hover, () => { G.Net.toHost({ t: 'sdock', on: 1 }); dockLocal(true); if (S.kind === 'hub') { S.hp = S.hpMax; G.HUD.toast('DOCKED', 'Welcome home', 2); } });
  }
  function launch() {
    const left = crewAboard();
    if (left.length) { G.HUD.toast('NOT YET', 'Not aboard: ' + left.join(', '), 2); return; }
    G.Net.toHost({ t: 'sdock', on: 0 }); dockLocal(false);
    const away = S.kind === 'board' ? S.Dp.clone().add(new T.Vector3(0, 0, 30)) : S.Dp.clone().add(new T.Vector3(0, 12, 0));
    S.P.copy(S.Dp); S.Q.copy(S.Dq);
    auto(away, S.Dq, S.kind === 'board' ? 2.5 : 3.2, null, () => {});
  }

  // ------------------------------------------------------------------ the jump
  function nearAnchor() { let best: typeof S.anchors[0] | null = null, bd = 420; for (const a of S.anchors) { if (!a.obj.visible) continue; const d = S.P.distanceTo(a.p); if (d < bd && !(S.kind === 'hub' && S.board.done.includes(a.i))) { bd = d; best = a; } } return best; }
  function ftlStep(dt: number) {
    const f = S.ftl; if (!f) { if (S.tunnel) S.tunnel.visible = false; return; }
    f.t += dt;
    const tn = S.tunnel!, tex = tn.userData.tex as THREE.Texture, mat = tn.userData.mat as THREE.MeshBasicMaterial;
    tn.visible = true;
    if (f.st === 'spool') {
      const u = Math.min(1, f.t / f.T); mat.opacity = u * 0.9; tex.offset.y -= dt * (0.4 + u * 3);
      S.V.multiplyScalar(Math.exp(-dt * 3));
      if (u >= 1) { f.st = 'wait'; G.Net.toHost({ t: 'jump', to: f.to }); }
    } else if (f.st === 'wait') { mat.opacity = 0.9; tex.offset.y -= dt * 3.4; if (f.t > f.T + 6) S.ftl = null; } // (the host never answered: back to flying)
    else {
      // the tunnel on the way out: the place is there already, out of sight till she drops out of it
      const left = f.T - f.t; mat.opacity = G.U.clamp(left / 0.5, 0, 1) * 0.95; tex.offset.y -= dt * 3.4;
      if (left <= 0) { S.ftl = null; tn.visible = false; G.SpaceUI.flash(); S.V.copy(fwd(S.Q)).multiplyScalar(45); if (isCtl() || !S.ctl) sendPose(true); }
    }
    const vis = !(f.st === 'tunnel');
    if (S.root) S.root.visible = vis; if (S.kind !== 'assault') G.R.levelRoot.visible = vis; if (S.stars) S.stars.visible = vis && (S.kind !== 'assault' || S.stage !== 'atmo');
    if (!S.ftl) { if (S.root) S.root.visible = true; if (S.kind !== 'assault') G.R.levelRoot.visible = true; sky(); }
  }

  // ------------------------------------------------------------------ the pose, told and heard
  function sendPose(now?: boolean) {
    S.sendT -= 1; if (!now && S.sendT > 0) return; S.sendT = 4;
    const r3 = (v: number) => Math.round(v * 1000) / 1000;
    G.Net.toHost({ t: 'spose', a: [r3(S.P.x), r3(S.P.y), r3(S.P.z), r3(S.Q.x), r3(S.Q.y), r3(S.Q.z), r3(S.Q.w), r3(S.V.x), r3(S.V.y), r3(S.V.z), S.stage === 'atmo' ? 1 : 0, Math.round(S.hp)] });
  }
  function heardPose(a: number[]) {
    if (!S.on || isCtl()) return;
    S.net = { P: new T.Vector3(a[0], a[1], a[2]), Q: new T.Quaternion(a[3], a[4], a[5], a[6]), V: new T.Vector3(a[7], a[8], a[9]) };
    if (S.kind === 'assault' && !S.ftl) { const st = a[10] ? 'atmo' : 'orbit'; if (st !== S.stage) { through(st); S.P.copy(S.net.P); S.Q.copy(S.net.Q); } }
    if (Number.isFinite(a[11])) S.hp = a[11];
    if (S.P.distanceTo(S.net.P) > 400) { S.P.copy(S.net.P); S.Q.copy(S.net.Q); }
  }
  function follow(dt: number) {
    const n = S.net; if (!n || S.docked || S.ftl) return;
    n.P.addScaledVector(n.V, dt); S.V.copy(n.V);
    S.P.lerp(n.P, Math.min(1, dt * 8)); S.Q.slerp(n.Q, Math.min(1, dt * 8));
  }

  // ------------------------------------------------------------------ the frame
  function update(dt: number) {
    if (!S.on || !S.model || G.Game.map !== S.map) return;
    S.t += dt;
    zoneStep();
    const m = me();
    if (isCtl() || (!S.ctl && Object.keys(G.Game.roster || {}).length < 2)) { fly(dt); if (!S.docked) sendPose(); zoneClose(dt); } else { if (S.auto) S.auto = null; follow(dt); S.stick.multiplyScalar(Math.exp(-dt * 2.2)); }
    ftlStep(dt);
    doors(dt);
    turrets(dt);
    if (!S.docked || S.auto) hideStrays();
    // the view is your own, from the seat you're in (the helm's through her glass; a turret's from its gun)
    const seat = mySeat(), cam = G.R.camera;
    if (seat && seat.k === 'turret') turretView(seat);
    if (S.shake > 0.01) { cam.position.x += (Math.random() - 0.5) * S.shake * 0.25; cam.position.y += (Math.random() - 0.5) * S.shake * 0.25; S.shake *= Math.exp(-dt * 4); }
    cam.updateMatrixWorld();
    outside();
    // her engines, the status strip, the mission's things
    const th = S.docked ? 0 : G.U.clamp(S.V.length() / S.def.speed, 0.12, 1) * (S.cruise ? 1.3 : 0.75);
    S.model.thrust.opacity += (th - S.model.thrust.opacity) * Math.min(1, dt * 4);
    S.model.glow.color.setHex(S.docked ? 0x2a8a5a : S.ftl ? 0x4060ff : 0xa07020);
    for (const a of S.anchors) { a.obj.rotation.z += dt * 0.15; (a.obj.userData.film.material as THREE.MeshBasicMaterial).opacity = 0.1 + 0.05 * Math.sin(S.t * 2); }
    if (S.hull) { S.hull.marker.visible = !S.docked && Math.sin(S.t * 6) > -0.4; guns(dt); missiles(dt); }
    for (const q of S.things) {
      if (q.k === 'art') { const a = q.obj.userData.art as THREE.Mesh; a.rotation.y += dt * 1.5; a.position.y = 1.15 + Math.sin(S.t * 2) * 0.05; }
      if (q.k === 'lock') (q.obj as THREE.Mesh).material = lockMat(!!(S.state && S.state.keys.includes(q.obj.userData.lock)));
    }
    if (S.boomT >= 0) boomStep(dt);
    if (m.seat != null && (m.dead || m.down)) stand();
    G.SpaceUI.update(dt);
  }
  const _lm: Record<string, THREE.Material> = {};
  const lockMat = (open: boolean) => _lm[open ? 'o' : 'c'] || (_lm[open ? 'o' : 'c'] = G.ShipModel.lit(open ? 0x30ff60 : 0xff3020));

  // ------------------------------------------------------------------ the hardpoints, and a hull's guns
  // A turret seat looks out from its gun on the roof; the mouse lays it, the trigger fires it. Its rounds are light: what
  // they do is told (sfire, for everyone to see; shit, a hull gun's damage).
  function turretView(seat: SpSeat) {
    const tu = S.model!.turrets[seat.n || 0], m = me(), cam = G.R.camera; if (!tu) return;
    const sy = seatPos(m.seat as number).yaw, yaw = m.yaw - S.berth.yaw, pitch = G.U.clamp(m.pitch, -0.25, 1.3);
    void sy;
    tu.base.rotation.y = yaw; tu.gun.rotation.x = pitch;
    const p = new T.Vector3(0, 0.75, 0.9).applyEuler(new T.Euler(pitch, yaw, 0, 'YXZ')).add(tu.base.position).applyQuaternion(S.Dq).add(S.Dp);
    cam.position.copy(p); cam.quaternion.copy(S.Dq).multiply(new T.Quaternion().setFromEuler(new T.Euler(pitch, yaw, 0, 'YXZ')));
  }
  function turrets(dt: number) {
    const seat = mySeat(); S.fireT -= dt;
    for (let i = S.tracers.length - 1; i >= 0; i--) { const tr = S.tracers[i]; tr.t -= dt; (tr.m.material as THREE.MeshBasicMaterial).opacity = Math.max(0, tr.t / 0.12); if (tr.t <= 0) { tr.m.parent && tr.m.parent.remove(tr.m); S.tracers.splice(i, 1); } }
    if (!seat || seat.k !== 'turret' || S.docked) return;
    const e = SD.EQUIP[(S.fleet.fit[S.def.id] || [])[seat.n || 0] || ''], tu = S.model!.turrets[seat.n || 0];
    if (!e || !tu || !me().mouse.l || S.fireT > 0 || G.Game.menuOpen()) return;
    S.fireT = e.rof || 0.2;
    // from the muzzle along the gun, in the level's own coordinates (where a hull's guns are)
    const mw = tu.muzzle.getWorldPosition(new T.Vector3()), dw = new T.Vector3(0, 0, -1).applyQuaternion(tu.gun.getWorldQuaternion(new T.Quaternion()));
    const inv = _r.clone().invert(), o = mw.clone().sub(_p).applyQuaternion(inv), d = dw.clone().applyQuaternion(inv);
    let best = -1, bt = e.range || 1500;
    if (S.hull) S.hull.guns.forEach((gn, i) => { if (gn.hp <= 0) return; const to = new T.Vector3(gn.x, gn.y, gn.z).sub(o), tt = to.dot(d); if (tt < 0 || tt > bt) return; if (to.addScaledVector(d, -tt).length() < 2.2 + tt * 0.004) { bt = tt; best = i; } });
    // (a missile in the way of it is shot down)
    for (const ms of S.mis.slice()) { const to = ms.o.position.clone().sub(o), tt = to.dot(d); if (tt > 0 && tt < bt && to.addScaledVector(d, -tt).length() < 5 + tt * 0.006) { const a = [ms.id, 0, 0, 0, 1]; missile(a); G.Net.toHost({ t: 'smis', a }); } }
    tracer(o, d, bt, e.id === 'rail');
    G.Net.toHost({ t: 'sfire', a: [o.x, o.y, o.z, d.x, d.y, d.z, bt, e.id === 'rail' ? 1 : 0] });
    if (best >= 0) { const gn = S.hull!.guns[best]; gunHit(best, gn.hp - (e.dmg || 5)); G.Net.toHost({ t: 'shit', i: best, hp: gn.hp }); }
    G.Audio.click();
  }
  function tracer(o: THREE.Vector3, d: THREE.Vector3, len: number, heavy: boolean) {
    if (!S.root) return;
    const g = new T.CylinderGeometry(heavy ? 0.14 : 0.06, heavy ? 0.14 : 0.06, len, 5, 1, true); g.rotateX(Math.PI / 2); g.translate(0, 0, len / 2);
    const m = new T.Mesh(g, new T.MeshBasicMaterial({ color: heavy ? 0x9fd8ff : 0xffd070, transparent: true, opacity: 1, depthWrite: false, blending: T.AdditiveBlending }));
    m.position.copy(o); m.lookAt(o.clone().add(d)); m.frustumCulled = false; S.root.add(m); S.tracers.push({ m, t: heavy ? 0.3 : 0.12 });
  }
  function gunHit(i: number, hp: number) {
    const gn = S.hull && S.hull.guns[i]; if (!gn) return;
    const was = gn.hp; gn.hp = Math.max(0, hp);
    if (was > 0 && gn.hp <= 0) { gn.gun.rotation.x = -0.5; gn.gun.visible = false; G.HUD.feed(`<b>${gn.k === 'pd' ? 'Point defence gun' : gn.k === 'cannon' ? 'Cannon' : 'Missile launcher'} destroyed</b>`); }
  }
  // her guns: they track the squad's ship inside 1300 m and fire; the pilot's screen says what lands
  // Her weapons, by kind (js/spacedata.ts HULLGUN). Point defence: fast, short, blind close in under its own deck. Cannon: a
  // heavy shot every few seconds out to 4.5 km, poor against anything quick or close. Missiles: launched at 6.5 km, they
  // home (missiles()); a turret can shoot one down. The pilot's screen says what lands.
  function guns(dt: number) {
    if (!S.hull || S.docked || S.ftl || (S.state && S.state.boom)) return;
    if (S.state && S.state.hostile === 0) return; // (a ship that isn't the mission's holds her fire till she's breached)
    for (const gn of S.hull.guns) {
      if (gn.hp <= 0) continue;
      const H = SD.HULLGUN[gn.k], from = new T.Vector3(gn.x, gn.y, gn.z), to = S.P.clone().add(new T.Vector3(0, 1.5, 0)).sub(from), dist = to.length();
      if (dist > H.range) continue;
      if (gn.k !== 'missile' && to.y < -1.5 && Math.hypot(to.x, to.z) < (gn.k === 'pd' ? 90 : 260)) continue; // (under their own deck's edge, close in: they can't bear)
      if (gn.k !== 'missile') { gn.obj.rotation.y = Math.atan2(-to.x, -to.z); gn.gun.rotation.x = Math.asin(G.U.clamp(to.y / dist, -0.2, 1)); }
      gn.cool -= dt;
      if (gn.cool > 0) continue;
      gn.cool = H.cool[0] + Math.random() * (H.cool[1] - H.cool[0]);
      if (gn.k === 'missile') { if (isCtl()) { const a = [S.misN++, gn.x, gn.y + 1.5, gn.z, 0]; missile(a); G.Net.toHost({ t: 'smis', a }); } continue; }
      const sp = S.V.length(), miss = Math.random() < (gn.k === 'pd' ? G.U.clamp(0.25 + sp / 260 + dist / 3000, 0.25, 0.92) : G.U.clamp(0.3 + sp / 110 + dist / 12000, 0.3, 0.96)), d = to.clone().normalize();
      if (miss) d.add(new T.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).multiplyScalar(0.05)).normalize();
      tracer(from, d, miss ? dist + 300 : dist, gn.k === 'cannon');
      if (!miss && isCtl()) { damage(H.dmg, gn.k === 'cannon' ? 'A cannon shell' : undefined); S.shake = Math.max(S.shake, gn.k === 'cannon' ? 0.8 : 0.3); }
    }
  }
  // a missile: a[0] its number, where it left her; a[4] 1: it's been shot down
  function missile(a: number[]) {
    if (!S.root) return;
    const was = S.mis.find((q) => q.id === a[0]);
    if (a[4]) { if (was) { was.o.parent && was.o.parent.remove(was.o); S.mis.splice(S.mis.indexOf(was), 1); G.HUD.feed('<b>Missile shot down</b>'); } return; }
    if (was) return;
    const o = new T.Group(), body = new T.Mesh(new T.ConeGeometry(0.5, 3.4, 8), G.ShipModel.M(0xd8dde2, { emissive: 0x30343a })); body.rotation.x = -Math.PI / 2; o.add(body);
    const fl = new T.Mesh(new T.ConeGeometry(0.7, 9, 8, 1, true), new T.MeshBasicMaterial({ color: 0xffb060, transparent: true, opacity: 0.7, depthWrite: false, blending: T.AdditiveBlending, side: T.DoubleSide })); fl.rotation.x = Math.PI / 2; fl.position.z = 6; o.add(fl);
    o.position.set(a[1], a[2], a[3]); o.frustumCulled = false; S.root.add(o);
    S.mis.push({ id: a[0], o, v: new T.Vector3(0, 1, 0), t: 0 });
    G.HUD.toast('MISSILE', 'Turn across it, or have a turret shoot it down', 2.2); G.Audio.deny();
  }
  function missiles(dt: number) {
    const H = SD.HULLGUN.missile;
    for (let i = S.mis.length - 1; i >= 0; i--) {
      const m = S.mis[i], to = S.P.clone().add(new T.Vector3(0, 1.4, 0)).sub(m.o.position), d = to.length();
      m.t += dt;
      // it turns toward her no faster than it can; a hard turn across its nose leaves it behind
      const want = to.normalize(), ang = m.v.angleTo(want), k = ang > 1e-4 ? Math.min(1, H.turn * dt / ang) : 1;
      m.v.lerp(want, m.t < 1.2 ? k * 0.4 : k).normalize();
      m.o.position.addScaledVector(m.v, H.speed * (m.t < 1.2 ? 0.45 : 1) * dt); m.o.lookAt(m.o.position.clone().add(m.v));
      const gone = m.t > H.life || S.docked || !!S.ftl;
      if (d < 9 || gone) {
        if (d < 9) { if (isCtl()) damage(H.dmg, 'A missile'); S.shake = 1; G.SpaceUI.flash(0.35); G.Audio.boom(20); }
        m.o.parent && m.o.parent.remove(m.o); S.mis.splice(i, 1);
      }
    }
  }
  function boomStep(dt: number) {
    S.boomT += dt;
    if (S.hull) { const k = 1 + S.boomT * 0.6; S.hull.group.scale.setScalar(k); }
    if (S.boomT > 0.5) { G.R.levelRoot.visible = false; S.boxes = []; }
  }

  // ------------------------------------------------------------------ F, and the ship's own keys
  const hint = (k: string, what: string) => `<b>${k}</b> ${what}`;
  function holdFor(key: string, held: boolean, dt: number, need: number, done: () => void) {
    if (!held) { if (S.holdK === key) { S.hold = 0; S.holdK = ''; } return -1; }
    if (S.holdK !== key) { S.holdK = key; S.hold = 0; }
    S.hold += dt;
    if (S.hold >= need) { S.hold = -1e9; done(); return -1; }
    return Math.max(0, S.hold / need);
  }
  function interact(m: typeof G.Me, dt: number, held: boolean, F: boolean): { prompt: string; prog: number; label: string } | null {
    if (!S.on) return null;
    const out = { prompt: '', prog: -1, label: '' };
    if (!held && !K('KeyG') && !K('KeyL') && !K('KeyJ')) { S.hold = 0; S.holdK = ''; }
    const seat = mySeat();
    if (seat) {
      const lines: string[] = [];
      if (seat.k === 'helm') {
        const ctl = isCtl();
        if (!ctl) lines.push('Taking the helm...');
        else if (S.ftl) lines.push(S.ftl.st === 'tunnel' ? 'In transit' : 'Jump drive spooling');
        else if (S.auto) lines.push('Hold on');
        else if (S.docked) {
          const p = holdFor('G', K('KeyG'), dt, 0.8, launch);
          if (p >= 0) { out.prog = p; out.label = S.kind === 'board' ? 'Undocking' : 'Lifting off'; }
          lines.push(hint('Hold G', S.kind === 'board' ? 'to undock' : 'to lift off'));
        } else {
          const a = nearAnchor(), slow = S.V.length() < 80;
          if (a) {
            const to = S.kind === 'hub' ? a.i : -1, name = S.kind === 'hub' ? (SD.offers(S.board.seed, S.board.level)[a.i] || { name: '?' }).name : 'home';
            if (slow) { const p = holdFor('J', K('KeyJ'), dt, 1.2, () => { S.ftl = { st: 'spool', t: 0, to, T: 2.6 }; G.HUD.toast('JUMP', 'Spooling for ' + name, 2.4); }); if (p >= 0) { out.prog = p; out.label = 'Jump drive'; } lines.push(hint('Hold J', 'to jump to ' + G.U.esc(name))); }
            else lines.push('Slow down to jump <small>(under 80 m/s)</small>');
          }
          if (S.kind !== 'board' && !(S.kind === 'assault' && S.stage !== 'atmo')) {
            const dd = S.P.distanceTo(S.Dp);
            if (dd < 160 && S.V.length() < 45) { const p = holdFor('L', K('KeyL'), dt, 0.8, land); if (p >= 0) { out.prog = p; out.label = 'Setting down'; } lines.push(hint('Hold L', 'to set down on the pad')); }
          }
          if (S.tclose) lines.push(`Matching course with ${G.U.esc(S.tclose.name)}…`);
          if (S.kind === 'board' && !(S.state && S.state.boom)) { const a = aim(120); if (a) lines.push(a.close < 4 ? 'Ram the hull: nose on, 5 m/s or more' : 'Hold her square to the hull'); }
        }
        if (ctl && !S.docked && !S.ftl && S.t - S.helpAt < 20) lines.push('<small><b>W S A D</b> thrust · <b>Space C</b> up down · <b>Q E</b> roll · <b>Shift</b> cruise · <b>X</b> brake · <b>T</b> target · <b>right mouse</b> look about</small>');
      } else if (seat.k === 'turret') {
        const e = SD.EQUIP[(S.fleet.fit[S.def.id] || [])[seat.n || 0] || ''];
        lines.push(e ? `${G.U.esc(e.name)} <small>· the mouse lays it, the trigger fires</small>` : 'Nothing is fitted to this hardpoint');
      } else if (seat.k === 'sensors') lines.push(SD.fitted(S.fleet, 'sensors') ? 'Sensor station' : 'No scanner fitted <small>(the shipyard)</small>');
      // out of the seat
      if (held && !m.fLatch) { const p = holdFor('F', true, dt, 0.5, () => { m.fLatch = true; stand(); }); if (p >= 0 && out.prog < 0) { out.prog = p; out.label = 'Getting up'; } }
      lines.push('<small>' + hint('Hold F', 'to get up') + '</small>');
      out.prompt = lines.join('<br>');
      return out;
    }
    if (m.dead || m.down) return null;
    const px = m.pos.x, pz = m.pos.z, near = (x: number, z: number, r: number, y = m.pos.y) => Math.hypot(px - x, pz - z) < r && Math.abs(m.pos.y - y) < 2.2;
    // aboard: the nearest seat
    if (aboard()) {
      let best = -1, bd = 1.15;
      S.seatsDef.forEach((s, i) => { const w = seatPos(i), d = Math.hypot(px - w.x, pz - w.z); if (d < bd) { bd = d; best = i; } });
      if (best >= 0) {
        const s = S.seatsDef[best], taken = Object.keys(S.seats).some((id) => id !== G.Net.myId && S.seats[id] === best && G.Game.roster[id]);
        const what = s.k === 'helm' ? 'take the helm' : s.k === 'sensors' ? 'sit at the sensor station' : s.k === 'turret' ? 'man the turret' : 'sit down';
        if (taken) { out.prompt = 'Taken'; return out; }
        const p = holdFor('F', held && !m.fLatch, dt, 0.4, () => { m.fLatch = true; sit(best); });
        if (p >= 0) { out.prog = p; out.label = ''; }
        out.prompt = hint('Hold F', 'to ' + what);
        return out;
      }
      if (!S.docked) { out.prompt = ''; return out; } // (nothing else to do in flight)
    }
    // the missions terminal by the pad
    if (S.kind === 'hub' && S.term && near(S.term.x, S.term.z, 1.6)) {
      if (F) { m.fLatch = true; G.SpaceUI.openOps(); }
      out.prompt = hint('F', 'missions board and shipyard');
      return out;
    }
    // a mission's things
    if (S.kind === 'board' && S.state && !S.state.boom) {
      const st = S.state, sp = S.map!.sp!;
      const at = st.artAt ? { x: st.artAt[0], z: st.artAt[1] } : sp.artifact;
      const doIt = (k: string, label: string, text: string, need: number, n?: number) => { const p = holdFor(k + (n || 0), held && !m.fLatch, dt, need, () => { m.fLatch = true; G.Net.toHost({ t: 'mobj', k, n }); }); if (p >= 0) { out.prog = p; out.label = label; } out.prompt = hint('Hold F', text); return out; };
      if (S.ms && S.ms.obj === 'artifact' && st.art === 0 && at && near(at.x, at.z, 1.9)) return doIt('art', 'Taking it', 'to take the artifact', 0.8);
      if (S.ms && S.ms.obj === 'destruct' && st.arm == null && sp.console && near(sp.console.x, sp.console.z, 1.9, sp.console.y)) return doIt('cons', 'Arming', 'to start the self-destruct', 2.5);
      for (let n = 0; n < sp.pods.length; n++) if (near(sp.pods[n].x, sp.pods[n].z, 1.5, sp.pods[n].y)) return doIt('pod', 'Strapping in', 'to leave in the escape pod', 1.5, n);
      for (let n = 0; n < sp.salvage.length; n++) if (!(st.salv || []).includes(n) && near(sp.salvage[n].x, sp.salvage[n].z, 1.7, sp.salvage[n].y)) return doIt('salv', 'Taking it', 'to take her cargo manifest (salvage)', 1.0, n);
    }
    return null;
  }
  // a key pressed while you're in one of her seats: hers, not your own (js/player.ts keydown asks)
  function key(code: string) {
    const seat = mySeat(); if (!seat) return false;
    if (seat.k === 'helm') {
      if (code === 'KeyT') { for (let k = 1; k <= S.wps.length; k++) { const j = (S.tgt + k) % S.wps.length; if (!S.wps[j].hide) { S.tgt = j; break; } } return true; }
    }
    return ['KeyC', 'KeyV', 'KeyX', 'KeyT', 'KeyG', 'KeyQ', 'KeyE', 'KeyR', 'KeyB', 'KeyZ', 'Digit1', 'Digit2', 'Digit3', 'Digit4', 'KeyH', 'KeyN', 'KeyY'].includes(code);
  }

  // ------------------------------------------------------------------ the host's word
  function veilKind(k: string | null | undefined) { const el = document.getElementById('veil'); if (el) { el.classList.toggle('ftl', k === 'ftl'); el.classList.toggle('cloud', k === 'cloud'); } }
  function setBoard(b: any) {
    S.board = { seed: b.seed | 0, level: b.level | 0, picked: (b.picked || []).slice(), done: (b.done || []).slice() };
    placeAnchors(); G.SpaceUI.boardDraw(); G.SpaceUI.opsRender();
  }
  function onMsg(m: any): boolean {
    switch (m.t) {
      case 'board': setBoard(m); return true;
      case 'fleet': {
        const was = S.fleet.ship; S.fleet = SD.cleanFleet(m.f);
        if (G.Net.isHost) store().set('fleet', S.fleet);
        if (m.got && SD.SHIPS[m.got]) G.HUD.feed(`<b>${G.U.esc(G.Game.nameOf(m.by))}</b> bought the ${SD.SHIPS[m.got].name}`);
        // another ship on the pad, or other guns on her: she's drawn again
        if (S.on && S.kind === 'hub' && S.docked && S.map) { const sp = { fleet: S.fleet, seats: was === S.fleet.ship ? S.seats : {}, ship: { docked: 1, ctl: S.ctl }, board: S.board }; setup(S.map, 'hub', sp); }
        G.SpaceUI.opsRender();
        return true;
      }
      case 'seats': S.seats = m.s || {}; if (m.ctl !== undefined) S.ctl = m.ctl; if (m.no != null && me().seat === m.no) { stand(); G.HUD.toast('', 'That seat is taken', 1.5); } return true;
      case 'spose': heardPose(m.a); S.ctl = m.by; return true;
      case 'sdock':
        if (S.on && m.on && m.site && S.kind === 'board') { if (m.by !== G.Net.myId) rebase(berthAt(siteAt(m.site))); cutHere(m.site); }
        if (S.on && m.by !== G.Net.myId) { S.auto = null; dockLocal(!!m.on); if (!m.on) { S.P.copy(S.Dp); S.Q.copy(S.Dq); } }
        if (S.on && m.on && S.kind === 'board') { S.shake = 1; G.HUD.toast('BREACH', 'She\'s through the hull. Go.', 2.2); }
        return true;
      case 'ms': if (m.zt != null && S.kind === 'board') { S.zt0 = m.zt; S.ztAt = performance.now(); } S.state = m; raidPods(m.raid); G.SpaceUI.objDraw(); cards(); if (S.kind === 'assault' && m.done && S.stage === 'atmo') { /* (the way home shows once she's up) */ } return true;
      case 'mdone': {
        if (m.ok === 2) { me().credits += m.pay || 0; G.HUD.chat(null, 0, `Salvage: +¢${G.U.fmt(m.pay || 0)}`); G.HUD.feed(`<span class="cr">Salvage +¢${G.U.fmt(m.pay || 0)}</span>`); }
        else if (m.ok) { const n = (m.pay || 0) + (m.bonus || 0); me().credits += n; G.HUD.toast('MISSION COMPLETE', `${G.U.esc(m.name)} · +¢${G.U.fmt(n)}${m.bonus ? ' (taken alive)' : ''}`, 5); G.HUD.chat(null, 0, `Mission complete: +¢${G.U.fmt(n)}`); G.Audio.extract(); if (G.Career.run) G.Career.ev('evidence', n); }
        else G.HUD.toast('MISSION ABANDONED', G.U.esc(m.name) + ' · nothing paid', 4);
        return true;
      }
      case 'locked': G.HUD.toast('LOCKED', m.k === 'bridge' ? 'It needs the bridge keycard: one of her officers has it' : 'It needs the armoury keycard: one of her crew has it', 2.4); G.Audio.deny(); return true;
      case 'vent': { const role = S.map && S.map.sp ? S.map.sp.roles[m.r] : null; G.HUD.feed(`<span class="bad">${(role && G.ShipGen.NAMES[role]) || 'A compartment'} is open to space</span>`); return true; }
      case 'pod': {
        // out in a pod, and picked up: aboard your own ship
        const w = SD.toWorld(S.berth, 0, SD.FLOOR, S.def.z1 - 1.5); me().pos.set(w.x, w.y, w.z); me().vel.set(0, 0, 0); me().yaw = S.berth.yaw;
        G.SpaceUI.flash(); G.HUD.toast('ESCAPE POD', 'Picked up by your own ship', 2.5);
        return true;
      }
      case 'sboom': {
        S.boomT = 0; G.SpaceUI.flash(1.4); S.shake = 1; G.Audio.boom(30);
        if ((m.lost || []).includes(G.Net.myId) && !me().dead) me().die('Went up with the ship');
        return true;
      }
      case 'smis': if (S.on && m.by !== G.Net.myId) missile(m.a); return true;
      case 'sfire': if (S.on && m.by !== G.Net.myId && S.root) tracer(new T.Vector3(m.a[0], m.a[1], m.a[2]), new T.Vector3(m.a[3], m.a[4], m.a[5]), m.a[6], !!m.a[7]); return true;
      case 'shit': if (m.i >= 0) gunHit(m.i, m.hp); else if (!isCtl()) S.hp = m.hp; return true;
    }
    return false;
  }
  // keycards on the floor (they're picked up by walking over them)
  function cards() {
    for (const o of S.cardObjs) o.parent && o.parent.remove(o);
    S.cardObjs = [];
    if (!S.state || !S.on || S.kind !== 'board') return;
    for (const [key, x, z, y] of S.state.cards as [string, number, number, number][]) {
      const c = new T.Mesh(new T.BoxGeometry(0.3, 0.02, 0.2), G.ShipModel.lit(key === 'bridge' ? 0x40a0ff : 0xffb020)); c.position.set(x, (y || 0) + 0.25, z);
      const l = new T.PointLight(key === 'bridge' ? 0x40a0ff : 0xffb020, 1.2, 3.5, 1.5); c.add(l);
      G.R.levelRoot.add(c); S.cardObjs.push(c);
    }
    for (const q of S.things) if (q.k === 'art') { q.obj.visible = S.state.art === 0; if (S.state.artAt) q.obj.position.set(S.state.artAt[0], 0, S.state.artAt[1]); }
    for (const q of S.things) if (q.k === 'salv') q.obj.visible = !(S.state.salv || []).includes(q.n as number);
    for (const q of S.things) if (q.k === 'cons') ((q.obj.userData.scr as THREE.Mesh).material as THREE.MeshBasicMaterial).color.setHex(S.state.arm != null ? 0xffd020 : 0xff3020);
  }

  // into a place the host has sent everyone to (js/game.ts enterShop, enterLevel)
  function enterHub(map: LvMap, sp: any) { S.ms = null; S.state = null; setup(map, 'hub', sp || { fleet: store().get('fleet', null) }); G.SpaceUI.objDraw(); }
  function enterLevel(map: LvMap, sp: any) {
    S.ms = sp.ms; S.state = sp.state; S.zinfo = sp.zone || null;
    setup(map, sp.ms.kind === 'board' ? 'board' : 'assault', sp);
    cards(); G.SpaceUI.objDraw();
    // (joined late: the holes already in her, and the ship where she's against one)
    if (sp.state && S.kind === 'board') { for (const c of sp.state.cuts || []) cutHere(c); if (sp.state.site) rebase(berthAt(siteAt(sp.state.site))); }
    if (sp.state) raidPods(sp.state.raid);
    if (sp.state && sp.state.docked) dockLocal(true);
  }
  const dbgPrep = () => [...zoneHulls].map(([k, h]) => { const p = h.map && (h.map as any).viewPre as LvViewPre | null; return k + (h.map ? ' map' : '') + (p ? (p.done ? ' built' : ' building') + (p.up === true ? ' sent' : p.up ? ' sending' : '') : ''); }); // (tools: how far zonePrep has got)
  return { dbgPrep, prep: zonePrep, takeMap, S, on, sealed, aboard, seatPos, interact, key, update, enterHub, enterLevel, leave, reset, onMsg, veilKind, isCtl, mySeat, nearAnchor, clearOf, crewAboard, aim, dbgDock: () => { if (S.kind === 'board' && S.map && S.map.sp) { const b = S.map.sp.breach, s = G.ShipGen.sites(S.map).filter((q) => q.nz > 0).sort((p, q) => Math.hypot(p.x - b.x, p.z - b.z) - Math.hypot(q.x - b.x, q.z - b.z))[0]; if (s) { const at = [s.c, s.nx, s.nz]; rebase(berthAt(s)); G.Net.toHost({ t: 'sdock', on: 1, site: at }); cutHere(at); } } dockLocal(true); }, dbgStage: (s: 'orbit' | 'atmo') => stage(s), dbgLaunch: launch };
})();
G.Space = G_Space;
interface GameModules { Space: typeof G_Space; }
