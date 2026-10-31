'use strict';
// Things lying in the world that you can pick up: anything you've dropped from your inventory (a magazine, a
// bandage, a backpack with everything in it, a gun). The host keeps the list (G.Server.loot) and says who gets
// what; this draws them and finds the one in reach. Each is { id, x, y, z, item (packed: G.Gear.pack), mesh }.
G.Loot = (() => {
  const list = new Map();
  const T = THREE;
  const texCache = new Map();
  // the item's icon as a texture, for the top of its box
  function iconTex(it) {
    const [w, h] = G.Gear.size(it);
    const key = `${it.k}|${it.mt || ''}|${it.gid || ''}|${it.pid || ''}|${it.wid || ''}|${it.vid || ''}|${it.key || ''}|${w}x${h}`;
    if (!texCache.has(key)) {
      const url = G.Icons.of(it, w * 34, h * 34);
      const tex = new T.TextureLoader().load(url);
      texCache.set(key, tex);
    }
    return texCache.get(key);
  }
  const COL = { mag: 0x2a2c2e, ammo: 0xb0915e, med: 0xd8d2c4, frag: 0x4a5a32, carrier: 0x3a4148, plate: 0x4a4d52, helmet: 0x33393f, belt: 0x3b3528, pack: 0x4a4a38, pouch: 0x404636, ifak: 0x7a2420, part: 0x2c3136 };
  // A gun lies on its side; anything else is a small box the size of its footprint (10 cm a cell), its
  // icon on top.
  function meshFor(packed) {
    if (packed.k === 'gun' && packed.w) {
      const code = G.Gunsmith.encode(packed.w.id, packed.w.build), gun = G.GunModels.world(code, packed.w.sk), wrap = new T.Group(), tmp = new T.Group();
      G.GunModels.setLoaded(gun, G.loaded(packed.w) > 0); // (a crossbow lying there with its bolt on the rail or not)
      gun.rotation.z = Math.PI / 2;
      wrap.add(gun); tmp.add(wrap); tmp.updateMatrixWorld(true);
      const b = new T.Box3().setFromObject(wrap);
      wrap.position.set(-(b.min.x + b.max.x) / 2, -b.min.y, -(b.min.z + b.max.z) / 2);
      tmp.remove(wrap);
      const g = new T.Group(); g.add(wrap);
      return g;
    }
    const it = G.Gear.unpack(packed), [w, h] = G.Gear.size(it), sx = Math.max(0.06, w * 0.1), sz = Math.max(0.06, h * 0.1), sy = 0.04 + 0.02 * Math.min(w, h);
    const side = new T.MeshStandardMaterial({ color: COL[packed.k] || 0x3a3d40, roughness: 0.8 });
    const top = new T.MeshStandardMaterial({ map: iconTex(it), roughness: 0.8, transparent: true });
    const m = new T.Mesh(new T.BoxGeometry(sx, sy, sz), [side, side, top, side, side, side]);
    m.position.y = sy / 2;
    const g = new T.Group(); g.add(m);
    return g;
  }
  function add(id, x, y, z, packed, yaw) {
    if (list.has(id) || !G.R || !G.R.dynRoot) return;
    let mesh;
    try { mesh = meshFor(packed); } catch (e) { console.warn('loot mesh', e); mesh = new T.Group(); }
    mesh.position.set(x, y + 0.002, z); mesh.rotation.y = yaw != null ? yaw : Math.random() * Math.PI * 2;
    G.R.dynRoot.add(mesh);
    list.set(id, { id, x, y, z, item: packed, mesh });
  }
  function remove(id) {
    const l = list.get(id);
    if (!l) return;
    if (l.mesh.parent) l.mesh.parent.remove(l.mesh);
    l.mesh.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
    list.delete(id);
  }
  function clear() { for (const id of [...list.keys()]) remove(id); }
  // the nearest you could pick up: within r, roughly in front of you (or right at your feet)
  function near(pos, yaw, r = 1.4) {
    let best = null, bd = r;
    const fx = -Math.sin(yaw), fz = -Math.cos(yaw);
    for (const l of list.values()) {
      const dx = l.x - pos.x, dz = l.z - pos.z, d = Math.hypot(dx, dz);
      if (d >= bd || Math.abs(l.y - (pos.y || 0)) > 1.6) continue;
      if (d > 0.6 && (dx * fx + dz * fz) / d < 0.3) continue; // behind you
      bd = d; best = l;
    }
    return best;
  }
  // what something's called, for prompts
  function name(packed) {
    if (packed.k === 'gun' && packed.w) return (G.WEAPONS[packed.w.id] || { name: 'gun' }).name;
    try { const it = G.Gear.unpack(packed); return it.k === 'mag' ? G.Gear.magName(it) : G.Gear.label(it); } catch (e) { return 'item'; }
  }
  return { add, remove, clear, near, name, meshFor, get list() { return list; } };
})();
