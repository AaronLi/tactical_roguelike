'use strict';
// Crossbow bolts that stayed where they hit: in a suspect (it follows the bone it's in), in a soft vest, or
// in timber and plasterboard. Whoever fired it decides (js/player.js roundSegment) and tells the squad; each machine draws
// its own. The lit nock stays on, in the load's colour (G.AMMO glow), so you can see from across a room where one went.
G.Bolts = (() => {
  const T = THREE, LEN = 0.4, MAX = 40, list = [];
  // what won't hold a bolt: it glances or breaks on these, and drops
  const HARD = new Set(['metal', 'stone', 'glass', 'concrete', 'brick']);
  const FWD = new T.Vector3(0, 0, -1);
  let parts = null, glowTex = null;
  const nockMats = new Map();
  function build() {
    const shaft = new T.CylinderGeometry(0.0045, 0.0045, LEN, 8); shaft.rotateX(Math.PI / 2); shaft.translate(0, 0, LEN / 2);
    const vane = new T.BoxGeometry(0.0008, 0.016, 0.06);
    const blade = new T.ConeGeometry(0.015, 0.05, 3); blade.rotateX(-Math.PI / 2); blade.translate(0, 0, 0.025);
    const open = new T.ConeGeometry(0.025, 0.04, 3); open.rotateX(-Math.PI / 2); open.translate(0, 0, 0.02);
    const needle = new T.ConeGeometry(0.0055, 0.07, 4); needle.rotateX(-Math.PI / 2); needle.translate(0, 0, 0.035);
    const nock = new T.CylinderGeometry(0.0052, 0.0052, 0.024, 8); nock.rotateX(Math.PI / 2);
    parts = { shaft, vane, heads: { broadhead: blade, mechanical: open, bodkin: needle }, nock,
      carbon: new T.MeshStandardMaterial({ color: 0x24262a, roughness: 0.5, metalness: 0.3 }),
      steel: new T.MeshStandardMaterial({ color: 0x9aa0a6, roughness: 0.35, metalness: 0.9 }) };
    const c = document.createElement('canvas'); c.width = c.height = 64;
    const g = c.getContext('2d'), r = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(0.3, 'rgba(255,255,255,0.45)'); r.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = r; g.fillRect(0, 0, 64, 64);
    glowTex = new T.CanvasTexture(c);
  }
  const colour = (am) => (G.AMMO[am] && G.AMMO[am].glow) || 0x39ff5a;
  function nockMat(am) {
    const col = colour(am);
    if (!nockMats.has(col)) nockMats.set(col, { lit: new T.MeshStandardMaterial({ color: col, emissive: col, emissiveIntensity: 1.2, roughness: 0.4 }),
      halo: new T.SpriteMaterial({ map: glowTex, color: col, blending: T.AdditiveBlending, transparent: true, depthWrite: false, opacity: 0.55 }) });
    return nockMats.get(col);
  }
  // a bolt, its tip at the origin, its tail back along +z
  function mesh(am) {
    if (!parts) build();
    const g = new T.Group(), N = nockMat(am), add = (geo, mat, z = 0) => { const m = new T.Mesh(geo, mat); m.position.z = z; g.add(m); return m; };
    add(parts.shaft, parts.carbon);
    add(parts.heads[am] || parts.heads.broadhead, parts.steel);
    for (let i = 0; i < 3; i++) { const v = add(parts.vane, parts.carbon, LEN - 0.05); const a = (i / 3) * Math.PI * 2; v.rotation.z = a; v.position.x = -Math.sin(a) * 0.012; v.position.y = Math.cos(a) * 0.012; }
    add(parts.nock, N.lit, LEN);
    const halo = new T.Sprite(N.halo); halo.scale.setScalar(0.045); halo.position.z = LEN + 0.01; g.add(halo);
    return g;
  }
  function keep(g) { list.push(g); if (list.length > MAX) { const old = list.shift(); if (old.parent) old.parent.remove(old); } }
  // Following a bone by hand, not as its child: the rig's bones are scaled unevenly, which would shear a bolt
  const _p = new T.Vector3(), _q = new T.Quaternion(), _s = new T.Vector3();
  function follow(g, rig, bone, l) { g.userData.on = { rig, bone, p: new T.Vector3(l[0], l[1], l[2]), q: new T.Quaternion(l[3], l[4], l[5], l[6]) }; G.R.dynRoot.add(g); keep(g); place(g); }
  function place(g) {
    const on = g.userData.on;
    on.bone.updateWorldMatrix(true, false);
    on.bone.matrixWorld.decompose(_p, _q, _s);
    g.quaternion.copy(_q).multiply(on.q);
    g.position.copy(on.p).applyMatrix4(on.bone.matrixWorld);
    g.visible = on.rig.root.visible;
  }
  // every frame: the ones in someone, with them (and gone with them)
  function update() {
    for (let i = list.length - 1; i >= 0; i--) {
      const g = list[i], on = g.userData.on;
      if (!on) continue;
      if (!on.rig.root.parent) { if (g.parent) g.parent.remove(g); list.splice(i, 1); continue; }
      place(g);
    }
  }
  // into the world, its tip at `at`, going `dir`
  function inWorld(at, dir, am) {
    const g = mesh(am);
    g.position.copy(at); g.quaternion.setFromUnitVectors(FWD, dir);
    G.R.dynRoot.add(g); keep(g);
  }
  // into someone, where it is now in the world: returns where that is on the bone, for the squad
  function onBone(rig, bone, at, dir, am) {
    bone.updateWorldMatrix(true, false);
    bone.matrixWorld.decompose(_p, _q, _s);
    const q = new T.Quaternion().setFromUnitVectors(FWD, dir).premultiply(_q.clone().invert()), p = at.clone().applyMatrix4(new T.Matrix4().copy(bone.matrixWorld).invert());
    const l = [...p.toArray(), ...q.toArray()].map((x) => Math.round(x * 1000) / 1000);
    follow(mesh(am), rig, bone, l);
    return l;
  }
  // the squad's: what the shooter's machine decided (e, the suspect; b, the bone; l, where on it; or at, u: in the world)
  function fromNet(m) {
    if (!m || !G.AMMO[m.am]) return;
    if (m.at) { inWorld(new T.Vector3(...m.at), new T.Vector3(...m.u).normalize(), m.am); return; }
    const ev = G.Views.enemies.get(m.e), bone = ev && ev.rig && G.Ballistics.boneOf(ev.rig, m.b);
    if (bone && Array.isArray(m.l)) follow(mesh(m.am), ev.rig, bone, m.l);
  }
  function clear() { for (const g of list) if (g.parent) g.parent.remove(g); list.length = 0; }
  const holds = (fx) => !HARD.has(fx);
  return { LEN, HARD, colour, inWorld, onBone, fromNet, update, clear, holds, get count() { return list.length; } };
})();
