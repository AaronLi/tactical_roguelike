'use strict';
import { ReplayEnv } from './replayenv.js';
import { Casings } from './casings.js';
import { loaded, WEAPONS } from './data.js';
import { Gear } from './gear.js';
import { GunModels } from './gunmodels.js';
import { GunSounds } from './gunsounds.js';
import { GunRig } from './gunrig.js';
import { Icons } from './icons.js';
import { Level } from './level.js';
import { Gunsmith } from './parts.js';
import { R } from './render.js';
import { Game } from './game.js';
// Things lying in the world that you can pick up: anything you've dropped from your inventory (a magazine, a
// bandage, a backpack with everything in it, a gun). The host keeps the list (Server.loot) and says who gets
// what; this draws them and finds the one under your crosshair. Each is { id, x, y, z, item (packed: Gear.pack), mesh, box },
// box its own shape in its own frame: you have to aim at the thing itself to take it.
export const Loot = (() => {
  const list = new Map();
  const T = THREE;
  const texCache = new Map();
  // the item's icon as a texture, for the top of its box
  function iconTex(it: any) {
    const [w, h] = Gear.size(it);
    const key = `${it.k}|${it.mt || ''}|${it.gid || ''}|${it.pid || ''}|${it.wid || ''}|${it.vid || ''}|${it.key || ''}|${w}x${h}`;
    if (!texCache.has(key)) {
      const url = Icons.of(it, w * 34, h * 34);
      const tex = new T.TextureLoader().load(url);
      texCache.set(key, tex);
    }
    return texCache.get(key);
  }
  // An object's box in its own frame (from its meshes, so it fits however it's turned), a little proud of it
  const _inv = new T.Matrix4(), _m = new T.Matrix4(), _b = new T.Box3(), _ray = new T.Ray(), _p = new T.Vector3();
  function boxOf(obj: THREE.Object3D) {
    obj.updateMatrixWorld(true);
    _inv.copy(obj.matrixWorld).invert();
    const box = new T.Box3();
    obj.traverse((o: any) => {
      if (!o.geometry) return;
      if (!o.geometry.boundingBox) o.geometry.computeBoundingBox();
      box.union(_b.copy(o.geometry.boundingBox).applyMatrix4(_m.multiplyMatrices(_inv, o.matrixWorld)));
    });
    return box.expandByScalar(0.02);
  }
  // how far along a ray (world o, d) it meets that box: Infinity if it doesn't, or if something solid's in the way
  function rayHit(o: THREE.Vector3, d: THREE.Vector3, obj: THREE.Object3D, box: THREE.Box3, reach: number) {
    _ray.origin.copy(o); _ray.direction.copy(d);
    _ray.applyMatrix4(_inv.copy(obj.matrixWorld).invert());
    if (!_ray.intersectBox(box, _p)) return Infinity;
    const t = _p.applyMatrix4(obj.matrixWorld).distanceTo(o);
    if (t > reach) return Infinity;
    return Level.raycast(Game.map!, o.x, o.y, o.z, d.x, d.y, d.z, t, { move: true }).t < t - 0.02 ? Infinity : t;
  }
  const COL = { mag: 0x2a2c2e, ammo: 0xb0915e, med: 0xd8d2c4, frag: 0x4a5a32, tb: 0x4c5634, carrier: 0x3a4148, plate: 0x4a4d52, helmet: 0x33393f, belt: 0x3b3528, pack: 0x4a4a38, pouch: 0x404636, ifak: 0x7a2420, part: 0x2c3136 };
  // A gun lies on its side (fit: shrunk to that length if it's longer, to lie in the weapon case), a magazine on
  // its flat as it would fall; anything else is a small box the size of its footprint (10 cm a cell), its icon on top.
  function meshFor(packed: any, fit?: number) {
    if (packed.k === 'gun' && packed.w) {
      const code = Gunsmith.encode(packed.w.id, packed.w.build), gun = GunModels.world(code, packed.w.sk), wrap = new T.Group(), tmp = new T.Group();
      GunRig.setLoaded(gun, loaded(packed.w) > 0); // (a crossbow lying there with its bolt on the rail or not)
      const g = new T.Group();
      g.add(wrap);
      // (its place: lying on its side, shrunk to fit its case, its underside on the floor; done again when a gun that was still loading has come in: js/gunmodels.ts.
      // It's measured on its own, in tmp, away from where it lies (and only once it has meshes to measure), then put back in g: else the gun that came in is never drawn)
      const lay = () => {
        tmp.add(gun); gun.rotation.z = 0;
        if (fit) { gun.scale.setScalar(1); tmp.updateMatrixWorld(true); const b0 = new T.Box3().setFromObject(gun); gun.scale.setScalar(Math.min(1, fit / (b0.max.z - b0.min.z))); }
        gun.rotation.z = Math.PI / 2; tmp.updateMatrixWorld(true);
        const b = new T.Box3().setFromObject(gun);
        wrap.position.set(-(b.min.x + b.max.x) / 2, -b.min.y, -(b.min.z + b.max.z) / 2);
        wrap.add(gun);
      };
      if (gun.userData.pending) { wrap.add(gun); g.userData.gun = gun; GunModels.whenReady(gun, (ok) => { if (ok) lay(); }); } // (add() takes its box again then)
      else lay();
      return g;
    }
    const it = Gear.unpack(packed), mdef = it.k === 'mag' && WEAPONS[it.wid];
    if (mdef) {
      // its own model: the magazine off the gun it's for (that magazine in it: its variant), lying on its side; the plain one stands in
      // till the gun's model is in, and stays if it can't be had
      const { mesh, r } = Casings.magMesh(mdef, it), g = new T.Group();
      mesh.rotation.z = Math.PI / 2; mesh.position.y = r;
      g.add(mesh);
      try {
        const b = Gunsmith.defaultBuild(mdef.id); if (it.vid && b.mag !== undefined) b.mag = it.vid;
        const gun = GunModels.world(Gunsmith.encode(mdef.id, b));
        const take = () => {
          let src: THREE.Object3D | null = gun.userData.mag || null; // (the world model's magazine, kept apart for its checks: js/viewmodel.ts)
          if (!src) gun.traverse((o: any) => { if (!src && (o.name === 'part_mag' || (o.userData && o.userData.part === 'mag'))) src = o; });
          if (!src) return;
          gun.updateMatrixWorld(true);
          const m = (src as THREE.Object3D).clone(true), hold = new T.Group(), lie = new T.Group();
          m.traverse((o: any) => { if (o.geometry) o.geometry = o.geometry.clone(); }); // (its own: what's dropped is disposed with it, the gun's isn't)
          (src as THREE.Object3D).matrixWorld.decompose(m.position, m.quaternion, m.scale); // (where it sits in the gun: the gun's frame)
          hold.add(m); hold.rotation.z = Math.PI / 2; lie.add(hold); lie.updateMatrixWorld(true);
          const bb = new T.Box3().setFromObject(lie); if (bb.isEmpty()) return;
          hold.position.set(-(bb.min.x + bb.max.x) / 2, -bb.min.y, -(bb.min.z + bb.max.z) / 2);
          g.remove(mesh); mesh.geometry.dispose(); g.add(lie);
        };
        if (gun.userData.pending) { g.userData.gun = gun; GunModels.whenReady(gun, (ok) => { if (ok) take(); }); } else take();
      } catch (e) { /* the plain one, then */ }
      return g;
    }
    const [w, h] = Gear.size(it), sx = Math.max(0.06, w * 0.1), sz = Math.max(0.06, h * 0.1), sy = 0.04 + 0.02 * Math.min(w, h);
    const side = new T.MeshStandardMaterial({ color: (COL as Record<string, number>)[packed.k] || 0x3a3d40, roughness: 0.8 });
    const top = new T.MeshStandardMaterial({ map: iconTex(it), roughness: 0.8, transparent: true });
    const m = new T.Mesh(new T.BoxGeometry(sx, sy, sz), [side, side, top, side, side, side]);
    m.position.y = sy / 2;
    const g = new T.Group(); g.add(m);
    return g;
  }
  function add(id: number, x: number, y: number, z: number, packed: any, yaw: number | null | undefined, fit?: number) {
    if (list.has(id) || !R || !R.dynRoot) return;
    let mesh;
    try { mesh = meshFor(packed, fit); } catch (e) { console.warn('loot mesh', e); mesh = new T.Group(); }
    mesh.position.set(x, y + 0.002, z); mesh.rotation.y = yaw != null ? yaw : Math.random() * Math.PI * 2;
    R.dynRoot.add(mesh);
    list.set(id, { id, x, y, z, item: packed, mesh, box: boxOf(mesh) });
    GunSounds.lootGun(packed); // (a gun on the floor: its report made by the time somebody's got it)
    // a gun still loading has no shape yet to aim at: its box once it's in (else it couldn't be picked up)
    if (mesh.userData.gun) GunModels.whenReady(mesh.userData.gun, () => { const l = list.get(id); if (l && l.mesh === mesh) l.box = boxOf(mesh); });
  }
  function remove(id: number) {
    const l = list.get(id);
    if (!l) return;
    if (l.mesh.parent) l.mesh.parent.remove(l.mesh);
    l.mesh.traverse((o: any) => { if (o.geometry) o.geometry.dispose(); });
    list.delete(id);
  }
  function clear() { for (const id of [...list.keys()]) remove(id); }
  // the one under the crosshair (o, d: your aim), the nearest along it, within reach
  function aimed(o: THREE.Vector3, d: THREE.Vector3, reach = 2.2) {
    let best = null, bd = reach;
    for (const l of list.values()) {
      const t = rayHit(o, d, l.mesh, l.box, bd);
      if (t < bd) { bd = t; best = l; }
    }
    return best;
  }
  // what something's called, for prompts
  function name(packed: any) {
    if (packed.k === 'gun' && packed.w) return (WEAPONS[packed.w.id] || { name: 'gun' }).name;
    try { const it = Gear.unpack(packed); return it.k === 'mag' ? Gear.magName(it) : Gear.label(it); } catch (e) { return 'item'; }
  }
  return { add, remove, clear, aimed, boxOf, rayHit, name, meshFor, get list() { return list; } };
})();
ReplayEnv.Loot = Loot; // (what the replay asks of it: js/replayenv.ts)

