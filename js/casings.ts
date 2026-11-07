'use strict';
// Spent cases. Every gun that ejects throws its case out of the ejection port: flicked right and up, tumbling,
// with the shooter's own movement. Cases fly under gravity, bounce off floors, furniture tops, walls and props,
// and come to rest lying on their side, where they stay (the oldest are recycled). Each real impact makes its
// own sound: brass rings, steel cases ring duller and lower, shotgun hulls tock, and a case's length sets its
// pitch (a 9 mm case pings near 4 kHz, a .50 BMG case near 1 kHz). The surface matters too: tile and concrete
// let it ring, wood shortens it, carpet and grass all but swallow it. Client-side only: everyone simulates the
// cases they can see and hear.
//
// Dropped magazines (a dump reload with no dump pouch) fall the same way: out of the magazine well, onto
// the floor with a clatter, where they stay until the level ends. Each carries its magazine item (rounds
// left and all), so you can walk over and pick it up again.
//
// When a gun ejects: semi and full autos as they fire; pump, lever and bolt guns when they're worked (a beat
// after the shot); revolvers and break-actions when they're reloaded (the empties dumped out); launchers, the
// crossbow and the railgun not at all.
const G_Casings = (() => {
  const T = THREE, MAX = 180, GRAV = 9.8;
  const COLORS: Record<CaseMat, number> = { brass: 0xc9a14a, steel: 0x5c5444, aluminum: 0xb9bdc2, plastic: 0x9c2a22 };
  // the case: what it's made of, its length (mm) and radius (m) (h: its length in m, for a case; a dropped magazine's has none)
  type CaseGun = Record<string, any>; // a gun, as far as a case is concerned (its id)
  interface CaseKind { mat: CaseMat; len: number; r: number; h?: number }
  // one thing falling: a spent case (slots in the instanced meshes, am: its load) or a dropped magazine (mesh, item: what it carries, box: its pick-up box)
  interface Spent { k: CaseKind; p: THREE.Vector3; v: THREE.Vector3; q: THREE.Quaternion; w: THREE.Vector3; rest: boolean; age: number; slots?: number[]; am?: string; mesh?: THREE.Mesh; item?: any; box?: any; drop?: { def: WeaponDef; fill: number } | null; quiet?: boolean }
  // a case or some cases due out of a gun, in t seconds
  interface Pending { t: number; def: WeaponDef; local: boolean; from?: THREE.Vector3 | null; to?: THREE.Vector3 | null; am?: string | string[]; drop?: boolean; n?: number }
  let metal: THREE.InstancedMesh = null!, hull: THREE.InstancedMesh = null!, live: Spent[] = [], queue: Pending[] = [], free: number[] = [], sounds = 0;
  const tmpM = new T.Matrix4(), tmpS = new T.Vector3(), tmpQ = new T.Quaternion(), hide = new T.Matrix4().makeScale(0, 0, 0);
  const col = new T.Color();

  function meshes() {
    if (metal) return;
    const geo = new T.CylinderGeometry(1, 1, 1, 8);
    metal = new T.InstancedMesh(geo, new T.MeshStandardMaterial({ roughness: 0.35, metalness: 0.35, emissive: 0x2a1e08 }), MAX); // not too mirror-like: rooms have no reflections to show
    hull = new T.InstancedMesh(geo, new T.MeshStandardMaterial({ color: 0xffffff, roughness: 0.6 }), MAX); // (each hull coloured for its load: setColorAt)
    for (const m of [metal, hull]) { m.frustumCulled = false; m.instanceMatrix.setUsage(T.DynamicDrawUsage); for (let i = 0; i < MAX; i++) m.setMatrixAt(i, hide); }
    for (let i = 0; i < MAX; i++) { metal.setColorAt(i, col.set(COLORS.brass)); hull.setColorAt(i, col.set(COLORS.plastic)); }
    free = [...Array(MAX).keys()];
  }
  function attach() { meshes(); if (metal.parent !== G.R.dynRoot) { G.R.dynRoot.add(metal); G.R.dynRoot.add(hull); } }

  // how a gun gets rid of its cases
  function mode(def: WeaponDef | null | undefined) {
    if (!def || def.explosive || def.cls === 'BOW' || def.cls === 'RAIL') return null;
    const plat = G.Gunsmith.PLATFORMS[def.id], spec = (plat && plat.spec) || {};
    if ((plat && (plat.arch === 'revolver' || plat.arch === 'derringer' || plat.arch === 'pepperbox')) || spec.rcv === 'break') return 'reload'; // (a falling block's come out as the block drops)
    if (def.manual) return 'cycle';
    return 'shot';
  }
  // the case: what it's made of, its length (mm) and radius (m)
  function kind(def: CaseGun): CaseKind {
    const gs: Record<string, any> = G.GUN_SPECS[def.id] || {}, mat: CaseMat = gs.caseMaterial || 'brass', len = gs.caseLength || 30;
    const r = mat === 'plastic' ? 0.0105 : len > 80 ? 0.0105 : len > 50 ? 0.0062 : len > 26 ? 0.0055 : 0.0048;
    return { mat, len, r, h: len / 1000 };
  }

  // A case leaving the gun at pos, thrown along `right` and `up` (world vectors), plus the shooter's velocity.
  // drop: tipped out of a revolver or a break-action instead of flung.
  function spawn(def: CaseGun, pos: THREE.Vector3, right: THREE.Vector3, up: THREE.Vector3, fwd: THREE.Vector3, vel: THREE.Vector3 | null, drop: boolean, am?: string) {
    if (!G.R || !G.R.camera || pos.distanceTo(G.R.camera.position) > 32) return;
    attach();
    const k = kind(def);
    if (!free.length) recycle();
    const c: Spent = { k, p: pos.clone(), v: new T.Vector3(), q: new T.Quaternion().setFromEuler(new T.Euler(Math.random() * 6, Math.random() * 6, Math.random() * 6)),
      w: new T.Vector3((Math.random() - 0.5) * 50, (Math.random() - 0.5) * 30, (Math.random() - 0.5) * 50), rest: false, age: 0, slots: [free.pop()!], am };
    if (k.mat === 'plastic' && free.length) c.slots!.push(free.pop()!); // a hull: red body and a brass head
    const big = k.len > 60 ? 0.7 : 1;
    if (drop) c.v.copy(up).multiplyScalar(-0.4 - Math.random() * 0.4).addScaledVector(fwd, -0.6 - Math.random() * 0.5).addScaledVector(right, (Math.random() - 0.5) * 0.6);
    else c.v.copy(right).multiplyScalar((2.0 + Math.random() * 1.4) * big).addScaledVector(up, (1.0 + Math.random() * 0.9) * big).addScaledVector(fwd, -0.4 + Math.random() * 0.5);
    if (vel) c.v.add(vel);
    live.push(c);
    draw(c);
  }
  function recycle() {
    const old = live.shift();
    if (!old) return;
    for (const s of old.slots!) { metal.setMatrixAt(s, hide); hull.setMatrixAt(s, hide); free.push(s); }
  }

  // ---------------------------------------------------------------- where cases come from
  const V = () => new T.Vector3();
  // your own gun: the ejection port of the first-person model, at the moment it ejects
  function fromView(def: WeaponDef, drop: boolean, n = 1, am?: string | string[]) {
    const vm = G.R.vm, h = vm && vm.userData.holders && vm.userData.holders[0];
    if (!h) return;
    const info = vm.userData.info, port = info.port || (info.pistol ? [0.075, 0.022, 0] : [0.12, 0.02, 0]);
    h.holder.updateMatrixWorld(true);
    const m = h.holder.matrixWorld;
    const right = V().setFromMatrixColumn(m, 0).normalize(), up = V().setFromMatrixColumn(m, 1).normalize(), fwd = V().setFromMatrixColumn(m, 2).normalize().negate();
    const vel = G.Me.vel ? V().set(G.Me.vel.x, 0, G.Me.vel.z) : null;
    for (let i = 0; i < n; i++) spawn(def, h.holder.localToWorld(V().set(drop ? 0 : 0.022, port[1] + 0.006, -port[0])), right, up, fwd, vel, drop, Array.isArray(am) ? am[i] : am);
  }
  // someone else's gun, from where its round left and where it went
  function fromShot(def: WeaponDef, from: THREE.Vector3, to: THREE.Vector3, am?: string) {
    const fwd = V().subVectors(to, from).normalize(), right = V().crossVectors(fwd, V().set(0, 1, 0)).normalize(), up = V().crossVectors(right, fwd);
    const back = def.slot === 's' ? 0.16 : 0.42;
    spawn(def, V().copy(from).addScaledVector(fwd, -back).addScaledVector(right, 0.04).addScaledVector(up, 0.02), right, up, fwd, null, false, am);
  }
  // when the gun's action throws the case: now, after it's worked, or not at all
  // am: the round's type (a spent shotgun hull keeps its load's colour)
  // (at: when, if the caller knows: a bolt worked by hand)
  function fired(def: WeaponDef, local: boolean, from: THREE.Vector3 | null, to: THREE.Vector3 | null, am?: string, at?: number) {
    const md = mode(def);
    if (md === 'shot' || md === 'cycle') queue.push({ t: at != null ? at : md === 'cycle' ? Math.min(0.55, (60 / def.rpm) * 0.45) : 0.015, def, local, from: from && from.clone(), to: to && to.clone(), am });
  }
  // a revolver or break-action opened to reload: the empties come out
  function emptied(def: WeaponDef, n: number, am?: string | string[]) {
    if (mode(def) === 'reload' && n > 0) queue.push({ t: 0.25, def, local: true, drop: true, n: Math.min(n, 8), am });
  }

  // one let go of by hand, at pos (holder: the gun in the hand, for which way's which)
  function loose(def: CaseGun, pos: THREE.Vector3, holder: THREE.Object3D, am?: string) {
    holder.updateMatrixWorld(true);
    const m = holder.matrixWorld, right = V().setFromMatrixColumn(m, 0).normalize(), up = V().setFromMatrixColumn(m, 1).normalize(), fwd = V().setFromMatrixColumn(m, 2).normalize().negate();
    spawn(def, pos, right, up, fwd, G.Me.vel ? V().set(G.Me.vel.x, 0, G.Me.vel.z) : null, true, am);
  }

  // ---------------------------------------------------------------- dropped magazines
  const MAX_MAGS = 40;
  let mags: Spent[] = [], magMat: THREE.MeshStandardMaterial = null!;
  let boxMat: THREE.MeshStandardMaterial = null!;
  function magMesh(def: WeaponDef, item: any) {
    const am = G.Gear.ammoFor(def), pistol = def.cls === 'PST' || def.cls === 'MP';
    // a drum is a drum: a disc that lies on one face (the variant in the item, or the gun's own when it's in it)
    const vid = item ? item.vid : def.build && def.build.mag, mp = vid && G.Gunsmith.PARTS[vid];
    if (mp && mp.model && mp.model.mag && mp.model.mag.t === 'drum' && !(item && item.k === 'ammo')) {
      if (!magMat) magMat = new T.MeshStandardMaterial({ color: 0x232527, roughness: 0.55, metalness: 0.3 });
      const r = mp.model.mag.r || 0.07, w = mp.model.mag.dw || 0.05, geo = new T.CylinderGeometry(r, r, w, 20);
      geo.rotateZ(Math.PI / 2); // (its axis across, as it sits in the gun: it falls and lands on a face)
      return { mesh: new T.Mesh(geo, magMat), r: w / 2 };
    }
    // thickness (it lies on this), height, depth; a box of rounds is a cardboard box
    const [x, y, z] = item && item.k === 'ammo' ? [0.05, 0.09, 0.12] : G.beltFed(def) ? [0.09, 0.1, 0.13] : pistol ? [0.022, 0.11, 0.032] : am.h === 1 ? [0.026, 0.11, 0.06] : [0.026, 0.18, 0.065];
    if (!magMat) magMat = new T.MeshStandardMaterial({ color: 0x232527, roughness: 0.55, metalness: 0.3 });
    if (!boxMat) boxMat = new T.MeshStandardMaterial({ color: 0xb0915e, roughness: 0.9 });
    return { mesh: new T.Mesh(new T.BoxGeometry(x, y, z), item && item.k === 'ammo' ? boxMat : magMat), r: x / 2 };
  }
  // (fill: how full it was, 0..1: its fall's sound, js/handling.ts drop)
  function dropMag(def: WeaponDef, fill = 0) {
    const vm = G.R.vm, a = vm && vm.userData.vma, h = vm && vm.userData.holders && vm.userData.holders[0];
    if (!h || !G.R.dynRoot) return undefined;
    const { mesh, r } = magMesh(def, null);
    h.holder.updateMatrixWorld(true);
    const home = a && a.hs[0] && a.hs[0].A.magHome ? a.hs[0].A.magHome.clone() : V().set(0, -0.06, -0.12);
    const p = h.holder.localToWorld(home), q = new T.Quaternion();
    h.holder.getWorldQuaternion(q);
    const v = G.Me.vel ? V().set(G.Me.vel.x, 0, G.Me.vel.z) : V();
    v.y -= 0.6;
    const c: Spent = { mesh, p, q, v, w: new T.Vector3((Math.random() - 0.5) * 6, (Math.random() - 0.5) * 4, (Math.random() - 0.5) * 6), rest: false, age: 0, k: { mat: 'steel', len: 120, r }, drop: { def, fill } };
    G.R.dynRoot.add(mesh);
    mags.push(c);
    // too many lying about: the oldest one that nobody can pick up goes
    while (mags.length > MAX_MAGS) { const i = Math.max(0, mags.findIndex((o) => !o.item)); takeMag(mags[i]); }
    draw(c);
    return c;
  }
  function takeMag(c: Spent) {
    const i = mags.indexOf(c);
    if (i < 0) return;
    mags.splice(i, 1);
    if (c.mesh!.parent) c.mesh!.parent.remove(c.mesh!);
    c.mesh!.geometry.dispose();
  }
  // the dropped magazine under the crosshair (o, d: your aim) that you can pick up, within reach
  function aimedMag(o: any, d: any, reach = 2.2) {
    let best: Spent | null = null, bd = reach;
    for (const c of mags) {
      if (!c.item) continue;
      const t = G.Loot.rayHit(o, d, c.mesh!, c.box || (c.box = G.Loot.boxOf(c.mesh!)), bd);
      if (t < bd) { bd = t; best = c; }
    }
    return best;
  }

  // ---------------------------------------------------------------- physics
  function surface(map: any, x: number, z: number, y: number) {
    const L = G.Level, f = map.floors ? L.floorAt(map, x, y, z)! : 0, fy = map.floors ? map.floors[f].fy : 0; // (which floor it's on)
    if (y - fy > 0.05) return 'wood'; // something's top: a table, a crate, a sofa (or a step)
    if (!map.surf) {
      // what each tile's floor is, as it's drawn (each floor its own): the open ground what the level lays outside (a
      // festival's lawn, the mountain's granite), indoors the level's own floor (a home's boards); then each room's floor
      // (out of doors too: a road's paving, a lawn's grass, the Crest's dirt tracks; js/furniture.ts ROOMS, `sound` where
      // a case or a foot hears it differently from what's drawn), a festival's slabs over its lawn (the square's paving, the
      // gate's, the car park's asphalt, the toilet block's tiles: G.Level.buildFestival), and a resident's room its own
      const WH = map.W * map.H, NF = map.NF || 1, TS = L.TS, ROOMS = G.Furniture.ROOMS as Record<string, any>;
      const ground = map.fest ? 'grass' : map.theme.rock ? 'gravel' : 'concrete', inside = map.theme.home >= 1 ? 'hard' : 'concrete';
      map.surf = new Array(WH * NF);
      const sky = new Uint8Array(WH * NF);
      for (let f = 0; f < NF; f++) { const o = (map.floors ? map.floors[f] : map).out; for (let i = 0; i < WH; i++) { sky[f * WH + i] = o && o[i] ? 1 : 0; map.surf[f * WH + i] = o && o[i] ? null : inside; } }
      const lay = (rm: any, fl: string) => { for (let tz = rm.z; tz < rm.z + rm.h; tz++) for (let tx = rm.x; tx < rm.x + rm.w; tx++) map.surf[(rm.fl || 0) * WH + tz * map.W + tx] = fl; };
      for (const rm of map.rooms) if (rm.out) { const sp = ROOMS[rm.type] || {}, fl = sp.sound || sp.floor; if (fl) lay(rm, fl); }
      // the seams between the outdoor rooms (a kerb, a fence line, the strip round a house): the ground beside them, a
      // couple of tiles out (not at a festival: its lawn is laid wall to wall under everything); anywhere further out of
      // doors, the level's open ground
      for (let step = 0; step < (map.fest ? 0 : 2); step++) {
        const was = map.surf.slice();
        for (let i = 0; i < was.length; i++) if (was[i] === null) {
          const x = i % map.W, z = ((i % WH) / map.W) | 0;
          const by = (j: number) => sky[j] ? was[j] : null, n = (x > 0 && by(i - 1)) || (x < map.W - 1 && by(i + 1)) || (z > 0 && by(i - map.W)) || (z < map.H - 1 && by(i + map.W));
          if (n) map.surf[i] = n;
        }
      }
      for (let i = 0; i < map.surf.length; i++) if (map.surf[i] === null) map.surf[i] = ground;
      const fest = map.fest;
      if (fest) {
        const slab = (r: any, fl: string) => { if (!r) return; for (let tz = Math.max(0, Math.floor(r.z0 / TS)); tz < Math.min(map.H, Math.ceil(r.z1 / TS)); tz++) for (let tx = Math.max(0, Math.floor(r.x0 / TS)); tx < Math.min(map.W, Math.ceil(r.x1 / TS)); tx++) map.surf[tz * map.W + tx] = fl; };
        slab(fest.gate, 'pave');
        if (fest.plaza) slab({ x0: fest.plaza.x0 - TS, x1: fest.plaza.x1, z0: fest.plaza.z0 - TS, z1: fest.plaza.z1 + TS * 2 }, 'pave');
        if (fest.lot) slab({ x0: fest.lot.x0 - TS, x1: fest.lot.x1 + TS, z0: fest.lot.z0 - TS / 2, z1: fest.lot.z1 + TS }, 'concrete'); // (asphalt)
        const wc = map.rooms.filter((rm: any) => rm.type === 'washroom' || rm.type === 'cubicle');
        if (wc.length) slab({ x0: (Math.min(...wc.map((rm: any) => rm.x)) - 1) * TS, x1: (Math.max(...wc.map((rm: any) => rm.x + rm.w)) + 1) * TS, z0: (Math.min(...wc.map((rm: any) => rm.z)) - 1) * TS, z1: (Math.max(...wc.map((rm: any) => rm.z + rm.h)) + 1) * TS }, 'tile');
      }
      for (const rm of map.rooms) if (!rm.out) { const fl = rm.dress ? rm.dress.floor.sound || rm.dress.floor.kind : (ROOMS[rm.type] || {}).floor; if (fl) lay(rm, fl); } // (a resident's room has its own: js/homes.ts)
    }
    const tx = Math.floor(x / L.TS), tz = Math.floor(z / L.TS);
    return map.surf[f * map.W * map.H + tz * map.W + tx] || 'concrete';
  }
  function impact(c: Spent, speed: number, map: any) {
    if (c.quiet || speed < 0.35 || sounds > 5) return;
    const cam = G.R.camera, d = c.p.distanceTo(cam.position);
    if (d > 26) return;
    sounds++;
    // a magazine of yours on a hard floor: its own fall (js/handling.ts: that gun's magazine simulated landing, every
    // contact of it from this first one), where it lands; then the rest of its bounces are in that
    if (c.drop) {
      const dr = c.drop, surf = surface(map, c.p.x, c.p.z, c.p.y - c.k.r);
      c.drop = null;
      if (!G.Audio.SOFT[surf] && G.Handling.drop(dr.def, dr.fill, c.p)) { c.quiet = true; return; }
    }
    // left or right of you
    const rel = V().subVectors(c.p, cam.position).normalize(), right = V().setFromMatrixColumn(cam.matrixWorld, 0);
    G.Audio.casing(d, c.k.mat, c.k.len, surface(map, c.p.x, c.p.z, c.p.y - c.k.r), speed, G.U.clamp(rel.dot(right), -1, 1), c.p);
  }
  function step(c: Spent, h: number, map: any) {
    const L = G.Level;
    c.v.y -= GRAV * h;
    c.p.addScaledVector(c.v, h);
    const wl = c.w.length();
    if (wl > 1e-3) { tmpQ.setFromAxisAngle(tmpS.copy(c.w).divideScalar(wl), wl * h); c.q.premultiply(tmpQ); }
    // walls, doors and furniture sides (the solids of the level, every floor's at its height: the tile plan is
    // the ground floor's, at ground level, and upstairs or in a basement put walls where there were none)
    const hit = (cx: number, cz: number, hx: number, hz: number) => {
      const px = hx + c.k.r - Math.abs(c.p.x - cx), pz = hz + c.k.r - Math.abs(c.p.z - cz);
      if (px <= 0 || pz <= 0) return;
      const vn = px < pz ? c.v.x : c.v.z;
      if (px < pz) { c.p.x += Math.sign(c.p.x - cx || 1) * px; c.v.x *= -0.3; c.v.z *= 0.7; }
      else { c.p.z += Math.sign(c.p.z - cz || 1) * pz; c.v.z *= -0.3; c.v.x *= 0.7; }
      c.w.multiplyScalar(0.7);
      impact(c, Math.abs(vn) * 0.7, map);
    };
    if (map.world) {
      const r = c.k.r;
      G.World.query(map.world, [c.p.x - r, c.p.y, c.p.z - r], [c.p.x + r, c.p.y, c.p.z + r], (s: any) => {
        if (!s.move || c.p.y < s.min[1] || c.p.y > s.max[1] - 0.01) return;
        hit((s.min[0] + s.max[0]) / 2, (s.min[2] + s.max[2]) / 2, (s.max[0] - s.min[0]) / 2, (s.max[2] - s.min[2]) / 2);
      });
    } else {
      const tx = Math.floor(c.p.x / L.TS), tz = Math.floor(c.p.z / L.TS);
      for (let oz = -1; oz <= 1; oz++) for (let ox = -1; ox <= 1; ox++) for (const b of L.boxesAt(map, tx + ox, tz + oz)) {
        if (c.p.y < b.y0 || c.p.y > b.h - 0.01) continue;
        hit(b.cx, b.cz, b.hx, b.hz);
      }
    }
    // the floor, or the top of something
    const g = L.groundAt(map, c.p.x, c.p.z, 0.01, c.p.y + 0.03);
    if (c.p.y - c.k.r <= g) {
      c.p.y = g + c.k.r;
      if (c.v.y < 0) {
        const vn = -c.v.y;
        impact(c, vn, map);
        c.v.y = vn * (0.25 + Math.random() * 0.2);
        c.v.x *= 0.55; c.v.z *= 0.55;
        c.w.set((Math.random() - 0.5) * 30, (Math.random() - 0.5) * 20, (Math.random() - 0.5) * 30).multiplyScalar(Math.min(1, vn / 3));
        if (vn < 0.6 && Math.hypot(c.v.x, c.v.z) < 0.3) settle(c, g);
      }
    }
    const floor = (G.Game.map && G.Game.map.minY) || 0;
    if (c.p.y < floor - 1) settle(c, floor); // (a basement's floor is below the ground)
  }
  // lying on its side, wherever it stopped
  function settle(c: Spent, g: number) {
    c.rest = true;
    c.p.y = g + c.k.r;
    c.q.setFromEuler(new T.Euler(0, Math.random() * Math.PI * 2, Math.PI / 2, 'YXZ'));
    draw(c);
  }
  function draw(c: Spent) {
    if (c.mesh) { c.mesh.position.copy(c.p); c.mesh.quaternion.copy(c.q); return; }
    const k = c.k;
    if (k.mat === 'plastic') {
      // hull body, and the brass head at one end
      tmpS.set(k.r, k.h! * 0.78, k.r); tmpM.compose(c.p, c.q, tmpS); hull.setMatrixAt(c.slots![0], tmpM); hull.setColorAt(c.slots![0], col.set(G.Icons.shellCol(c.am as string)));
      if (c.slots![1] != null) {
        const off = V().set(0, -k.h! * 0.39 - k.h! * 0.11, 0).applyQuaternion(c.q).add(c.p);
        tmpS.set(k.r * 1.04, k.h! * 0.22, k.r * 1.04); tmpM.compose(off, c.q, tmpS); metal.setMatrixAt(c.slots![1], tmpM); metal.setColorAt(c.slots![1], col.set(COLORS.brass));
      }
    } else {
      tmpS.set(k.r, k.h!, k.r); tmpM.compose(c.p, c.q, tmpS); metal.setMatrixAt(c.slots![0], tmpM); metal.setColorAt(c.slots![0], col.set(COLORS[k.mat] || COLORS.brass));
    }
  }

  return {
    mode, fired, emptied, loose, dropMag, magMesh, takeMag, aimedMag, surface,
    // for G.R.warmup: the cases' meshes in the scene now, and a sample magazine and box (not kept)
    warm() { attach(); const def = G.WEAPONS.m4; return [magMesh(def, null).mesh, magMesh(def, { k: 'ammo' }).mesh]; },
    get mags() { return mags; }, // for debugging
    get live() { return live; }, // for debugging
    update(dt: number) {
      const map = G.Game.map;
      if (!map) return;
      sounds = 0;
      for (const c of mags) {
        if (c.rest) continue;
        const h = Math.min(dt, 0.05), n = Math.ceil(h / 0.006);
        c.age += h;
        for (let i = 0; i < n && !c.rest; i++) step(c, h / n, map);
        if (c.age > 6 && !c.rest) settle(c, G.Level.groundAt(map, c.p.x, c.p.z, 0.01, c.p.y + 0.03));
        draw(c);
      }
      if (!metal && !queue.length) return;
      // cases due out of a gun
      for (const e of [...queue]) {
        e.t -= dt;
        if (e.t > 0) continue;
        queue.splice(queue.indexOf(e), 1);
        if (e.local) fromView(e.def, e.drop!, e.n || 1, e.am); else if (e.from) fromShot(e.def, e.from, e.to!, e.am as string | undefined);
      }
      if (!metal) return;
      const h = Math.min(dt, 0.05);
      let moved = false;
      for (const c of live) {
        if (c.rest) continue;
        c.age += h;
        const n = Math.ceil(h / 0.006);
        for (let i = 0; i < n && !c.rest; i++) step(c, h / n, map);
        if (c.age > 6 && !c.rest) settle(c, G.Level.groundAt(map, c.p.x, c.p.z, 0.01, c.p.y + 0.03));
        draw(c); moved = true;
      }
      if (moved || queue.length === 0) { metal.instanceMatrix.needsUpdate = true; hull.instanceMatrix.needsUpdate = true; if (metal.instanceColor) metal.instanceColor.needsUpdate = true; if (hull.instanceColor) hull.instanceColor.needsUpdate = true; }
    },
    clear() {
      for (const o of mags) { o.mesh!.parent && o.mesh!.parent.remove(o.mesh!); o.mesh!.geometry.dispose(); }
      mags = [];
      queue = []; live = [];
      if (!metal) return;
      for (let i = 0; i < MAX; i++) { metal.setMatrixAt(i, hide); hull.setMatrixAt(i, hide); }
      free = [...Array(MAX).keys()];
      metal.instanceMatrix.needsUpdate = true; hull.instanceMatrix.needsUpdate = true;
      if (metal.parent) metal.parent.remove(metal);
      if (hull.parent) hull.parent.remove(hull);
    },
  };
})();
G.Casings = G_Casings;
interface GameModules { Casings: typeof G_Casings; }
