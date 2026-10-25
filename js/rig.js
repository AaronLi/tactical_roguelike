'use strict';
// Character rig: a jointed skeleton animated procedurally, with hitboxes that ride the bones.
//
//   root (ground, yaw) → body (tips over when downed) → hips → spine → chest → neck → head
//                                                                    chest → shoulders → upper arm → forearm
//                                                             hips → thigh → shin
// Legs use two-bone IK onto procedurally placed feet (no foot sliding, works for strafing and
// backpedalling, and crouching just lowers the hips). Arms use two-bone IK onto the grip and
// support-hand points of the carried gun (G.GunModels), so hands stay on any weapon.
// Upper body handles aim pitch, low-ready, corner leans, recoil, flinches and grenade throws.
// Dead characters go to a Verlet ragdoll (see ragdollInit). Living suspects and civilians are the same ragdoll,
// powered: muscles pull each joint toward the animation, as strong as the person is (see powerStep).
G.Rig = (() => {
  const T = THREE;
  const UP = new T.Vector3(0, 1, 0);
  const _a = new T.Vector3(), _b = new T.Vector3(), _c = new T.Vector3(), _d = new T.Vector3(), _e = new T.Vector3();
  const _q = new T.Quaternion(), _q2 = new T.Quaternion(), _m = new T.Matrix4();

  // limb proportions (metres at scale 1)
  const THIGH = 0.44, SHIN = 0.44, UARM = 0.29, FARM = 0.27;
  const HIP_H = 0.95, CROUCH_H = 0.58;

  let debug = false;
  try { debug = new URLSearchParams(location.search).has('hitboxes'); } catch (e) { /* ignore */ }

  // Rotate a bone (whose length runs down its local -Y) so it points from a to b in world space,
  // with its local X along `side` (keeps limb twist stable).
  function aimBone(bone, a, b, side) {
    const y = _d.subVectors(a, b).normalize();                 // bone's +Y points back toward its parent joint
    const z = _e.crossVectors(side, y).normalize();
    const x = _c.crossVectors(y, z);
    _m.makeBasis(x, y, z);
    _q.setFromRotationMatrix(_m);
    bone.parent.getWorldQuaternion(_q2).invert();
    bone.quaternion.copy(_q2.multiply(_q));
    bone.updateMatrixWorld(true);
  }
  // Two-bone IK: place upper/lower so the end reaches `target`, bending toward `pole`.
  function ik(upper, lower, l1, l2, target, pole) {
    const A = upper.getWorldPosition(_a);
    const D = _b.subVectors(target, A);
    const dist = G.U.clamp(D.length(), 0.01, (l1 + l2) * 0.999);
    const dir = D.normalize();
    const cosA = G.U.clamp((l1 * l1 + dist * dist - l2 * l2) / (2 * l1 * dist), -1, 1);
    const sinA = Math.sqrt(1 - cosA * cosA);
    const toPole = new T.Vector3().subVectors(pole, A);
    const bend = toPole.sub(dir.clone().multiplyScalar(toPole.dot(dir))).normalize();
    const elbow = A.clone().addScaledVector(dir, l1 * cosA).addScaledVector(bend, l1 * sinA);
    const end = A.clone().addScaledVector(dir, dist);
    const side = new T.Vector3().crossVectors(dir, bend).normalize();
    aimBone(upper, A, elbow, side);
    aimBone(lower, elbow, end, side);
  }

  function capsule(r, len, m) {
    const geo = new T.CapsuleGeometry(r, Math.max(0.001, len), 4, 10);
    return new T.Mesh(geo, m);
  }
  function joint(parent, x, y, z) { const j = new T.Group(); j.position.set(x, y, z); parent.add(j); return j; }

  // Clothing palettes. Suspects wear street clothes (a share in balaclavas); civilians wear brighter,
  // everyday clothes with faces and hair showing — telling the two apart is the job.
  const PAL = {
    hoodie: [0x2b2b2d, 0x3c4a5a, 0x5a3a2a, 0x2f4a3a, 0x5e5e60, 0x4a2f48, 0x1f2a3a],
    shirt: [0xd9d9d6, 0x9ec5e8, 0xe8c79e, 0xb84a4a, 0x6aa86a, 0xe0d050, 0xd88fb0, 0x8fa3d8],
    pants: [0x2b3550, 0x3a3a3c, 0x4a4030, 0x3b4a66, 0x6b5b45],
    skin: [0x8a6a52, 0xc89a78, 0x5a3e2c, 0xe0b896, 0xa47458],
    hair: [0x1c1612, 0x3b2a1a, 0x6b4a2a, 0xa08060, 0x2a2a2a],
  };

  // ---------------------------------------------------------------- an officer's kit, as worn
  // k: { helmet, face, carrier, plate, cp (pouches on the carrier), belt, bp (on the belt), pack, ifak } (gear ids, or
  // flags). Built from boxes in the chest / head / hips frames: x right, y up, -z the front.
  // An officer's own look (the main menu), and what they wear if they haven't picked
  const OFFICER_LOOK = { top: 'combat', topC: 0x3a4048, pants: 'combat', pantsC: 0x2e3238, eyes: 'shooting', gloves: 'tactical' };
  const LOOKS = { top: ['combat', 'longsleeve', 'tshirt', 'hoodie'], pants: ['combat', 'cargo', 'jeans'], eyes: ['none', 'glasses', 'shooting', 'goggles'], gloves: ['tactical', 'leather', 'fingerless', 'none'] };
  // a look from anywhere (the network): known options and colours only
  function cleanLook(l) {
    const o = Object.assign({}, OFFICER_LOOK);
    if (!l || typeof l !== 'object') return o;
    for (const k of Object.keys(LOOKS)) if (LOOKS[k].includes(l[k])) o[k] = l[k];
    for (const k of ['topC', 'pantsC']) if (Number.isInteger(l[k]) && l[k] >= 0 && l[k] <= 0xffffff) o[k] = l[k];
    return o;
  }
  const KIT_COL = (d) => (!d ? 0x2e3236 : /Sable|Paragon/.test(d.brand || '') ? 0x5a5240 : /Kestrel|Vantage/.test(d.brand || '') ? 0x4d5639 : 0x2e3236);
  const kitMat = new Map();
  const KM = (c, o) => { const key = c + JSON.stringify(o || {}); if (!kitMat.has(key)) kitMat.set(key, new T.MeshLambertMaterial(Object.assign({ color: c }, o || {}))); return kitMat.get(key); };
  const PACK = { 'k.sling': [0.22, 0.26, 0.09, 0.12], 'k.assault': [0.3, 0.36, 0.13, 0.14], 'k.ruck': [0.34, 0.5, 0.2, 0.2] };
  // the name patch, high on the back (rig.callsign: { id: their animal, name }): on the backpack if they wear
  // one, else on the carrier, else on the shirt
  function backPatch(rig, k) {
    const cs = rig.callsign;
    if (!cs || !G.Callsigns) return;
    const D = (id) => (id && G.Gear && G.Gear.DEFS[id]) || null, cd = D(k && k.carrier), pd = D(k && k.pack);
    let y = 0.22, z = 0.128;
    if (pd) { const [, h, d, py] = PACK[pd.id] || PACK['k.assault']; z = (cd && cd.id !== 'c.recon' ? 0.15 : 0.12) + d + 0.003; y = py + h / 2 - 0.05; }
    else if (cd && cd.id === 'c.ghost') z = 0.126;
    else if (cd && cd.id !== 'c.recon') { y = 0.2; z = ((cd.id === 'c.heavy' ? 0.3 : 0.27) + (k.plate ? 0.03 : 0)) / 2 + 0.003; }
    const m = new T.Mesh(new T.PlaneGeometry(0.2, 0.05), new T.MeshLambertMaterial({ map: G.Callsigns.backTex(cs.id, cs.name) }));
    m.position.set(0, y, z);
    rig.chest.add(m); rig.kitParts.push(m);
  }
  function setKit(rig, k) {
    const key = JSON.stringify(k || {}) + (rig.callsign ? '|' + rig.callsign.id + '|' + rig.callsign.name : '');
    if (rig.kitKey === key) return;
    rig.kitKey = key; rig.kit = k;
    for (const m of rig.kitParts) { if (m.parent) m.parent.remove(m); if (m.geometry) m.geometry.dispose(); }
    rig.kitParts = [];
    backPatch(rig, k);
    if (!k) return;
    const D = (id) => (id && G.Gear && G.Gear.DEFS[id]) || null;
    let part = null; // (which piece of kit the parts being made are: the hangar shows each on its own)
    const box = (parent, w, h, d, c, x, y, z, o) => { const m = new T.Mesh(new T.BoxGeometry(w, h, d), KM(c, o)); m.position.set(x, y, z); m.userData.part = part; parent.add(m); rig.kitParts.push(m); return m; };
    const add = (parent, m, x, y, z) => { m.position.set(x, y, z); m.userData.part = part; parent.add(m); rig.kitParts.push(m); return m; };
    const pouches = (parent, n, c, x0, y0, z, w = 0.07, h = 0.09) => { for (let i = 0; i < Math.min(n, 8); i++) box(parent, w, h, 0.05, c, x0 + (i % 4) * (w + 0.015), y0 - Math.floor(i / 4) * (h + 0.015), z); };
    const C = rig.chest, Hd = rig.head, Hp = rig.hips;
    // the helmet: its cut and colour by model; rails and a night-vision mount on the modern ones
    const hd = D(k.helmet);
    part = 'helmet';
    if (rig.hairMesh) rig.hairMesh.visible = !hd;
    const putHd = (m) => add(Hd, m, m.position.x, m.position.y, m.position.z);
    if (hd) G.Headgear.helmet(hd.id, KM, putHd); // (its cut, rails, shroud and visor: js/headgear.js)
    // on the helmet's mount: a mandible round the jaw, or a shield over the face
    const fd = D(k.face);
    part = 'face';
    if (fd && hd) G.Headgear.face(fd.id, hd.id, KM, putHd);
    // the carrier: a soft vest, a slick plate carrier, a chest rig, or a full carrier with its pouches
    const cd = D(k.carrier), cc = KIT_COL(cd);
    part = 'carrier';
    if (cd) {
      if (cd.id === 'c.ghost') box(C, 0.4, 0.27, 0.245, 0x34373b, 0, 0.12, 0);
      else if (cd.id === 'c.recon') { // a chest rig: a panel of pouches across the front, straps over the shoulders
        box(C, 0.36, 0.15, 0.06, cc, 0, 0.03, -0.13);
        for (const x of [-1, 1]) box(C, 0.04, 0.26, 0.24, cc, x * 0.12, 0.17, 0);
        pouches(C, Math.max(2, k.cp || 0), 0x23251f, -0.13, 0.04, -0.17);
      } else {
        const heavy = cd.id === 'c.heavy', depth = (heavy ? 0.3 : 0.27) + (k.plate ? 0.03 : 0);
        box(C, heavy ? 0.44 : 0.4, heavy ? 0.32 : 0.28, depth, cc, 0, 0.12, 0);
        if (k.plate) { part = 'plate'; box(C, 0.26, 0.22, 0.02, cc, 0, 0.14, -depth / 2 - 0.005); part = 'carrier'; } // the plate's outline at the front
        pouches(C, k.cp || 0, 0x23251f, -0.16, 0.06, -depth / 2 - 0.03);
        if (heavy || cd.id === 'c.assault') for (const x of [-1, 1]) box(C, 0.13, 0.07, 0.2, cc, x * 0.22, 0.3, 0); // shoulder armour
        if (heavy) { box(C, 0.3, 0.07, 0.26, cc, 0, 0.32, 0.01); box(Hp, 0.2, 0.16, 0.04, cc, 0, -0.06, -0.12); } // collar, groin plate
      }
    }
    // the belt and what's on it; the IFAK at the back
    const bd = D(k.belt);
    part = 'belt';
    if (bd) {
      box(Hp, 0.35, 0.06, 0.25, bd.id === 'b.war' ? 0x3b3528 : 0x232527, 0, 0.06, 0);
      const n = k.bp || 0;
      for (let i = 0; i < Math.min(n, 6); i++) { const side = i % 2 ? 1 : -1, j = i >> 1; box(Hp, 0.05, 0.08, 0.07, 0x23251f, side * 0.18, 0.04, -0.06 + j * 0.08); }
    }
    part = 'ifak';
    if (k.ifak) box(bd ? Hp : C, 0.12, 0.1, 0.06, 0x7a2420, 0, bd ? 0.04 : -0.02, bd ? 0.14 : 0.13);
    // the backpack, by size
    const pd = D(k.pack);
    part = 'pack';
    if (pd) {
      const [w, h, d, y] = PACK[pd.id] || PACK['k.assault'];
      const back = (cd && cd.id !== 'c.recon' ? 0.15 : 0.12) + d / 2;
      box(C, w, h, d, KIT_COL(pd), 0, y, back);
      box(C, w * 0.8, h * 0.3, 0.04, 0x23251f, 0, y - h * 0.2, back + d / 2 + 0.02); // a pocket
    }
  }
  // A suspect's armour (G.ARMORS ids) as the gear an officer would wear: the same models for the same kit
  function armourKit(vest, helmet, armored, face) {
    const V = { soft: ['c.ghost', 0, 0], steel: ['c.patrol', 1, 2], ceramic: ['c.assault', 1, 3], assault: ['c.heavy', 1, 2] }[vest] || (armored ? ['c.heavy', 1, 2] : null);
    const H = { ach: 'h.ach', riflehelm: 'h.rifle', visor: 'h.visor' }[helmet] || (armored ? 'h.rifle' : 0);
    return { helmet: H, face: (H && face) || 0, carrier: V ? V[0] : 0, plate: V ? V[1] : 0, cp: V ? V[2] : 0, belt: armored ? 'b.battle' : 0, bp: armored ? 2 : 0, pack: 0, ifak: 0 };
  }
  function create(o) {
    const s = o.scale || 1, style = o.style || 'tactical';
    let seed = (o.seed || Math.floor(Math.random() * 1e6)) >>> 0;
    const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
    const pick = (a) => a[Math.floor(rnd() * a.length)];
    const L = (c) => new T.MeshLambertMaterial({ color: c });
    // ---- what they're wearing: a look { top, topC, pants, pantsC, eyes, gloves }. Officers bring their own (the
    // main menu); everyone else is dressed for who they are.
    let vestM = null, helmetM = null, headCover = null, hairM = null;
    const skin = L(o.mannequin ? 0xa9afb5 : o.skinColor != null ? o.skinColor : pick(PAL.skin)); // (a mannequin: plain grey, no face, no hair: see G.Hangar)
    const gear = L(0x23251f);
    let look;
    if (style === 'tactical') look = Object.assign({}, OFFICER_LOOK, o.look || {});
    // everyone else, from the same wardrobe, by who they are: enforcers in combat clothes and balaclavas,
    // suspects in hoodies mostly (sometimes a T-shirt or a combat shirt, gloves, shooting glasses), civilians in
    // everyday clothes (some in glasses)
    else if (style === 'armored') look = { top: 'combat', topC: pick([0x2e3136, 0x26282c, 0x3a3d40, 0x4d5639]), pants: 'combat', pantsC: pick([0x26282c, 0x2e3238, 0x3a3a3c]), eyes: rnd() < 0.4 ? 'goggles' : rnd() < 0.5 ? 'shooting' : 'none', gloves: 'tactical' };
    else if (style === 'suspect') {
      const tp = rnd();
      look = { top: tp < 0.55 ? 'hoodie' : tp < 0.75 ? 'tshirt' : tp < 0.9 ? 'longsleeve' : 'combat', topC: pick(PAL.hoodie), pants: pick(['jeans', 'jeans', 'cargo', 'combat']), pantsC: pick(PAL.pants),
        eyes: rnd() < 0.1 ? 'shooting' : rnd() < 0.08 ? 'glasses' : 'none', gloves: rnd() < 0.3 ? 'tactical' : rnd() < 0.15 ? 'fingerless' : rnd() < 0.1 ? 'leather' : 'none' };
    } else {
      const tp = rnd();
      look = { top: tp < 0.5 ? 'tshirt' : tp < 0.85 ? 'longsleeve' : 'hoodie', topC: pick(PAL.shirt), pants: pick(['jeans', 'jeans', 'cargo']), pantsC: pick(PAL.pants), eyes: rnd() < 0.15 ? 'glasses' : 'none', gloves: 'none' };
    }
    const top = L(look.topC), bottom = L(look.pantsC);
    // a combat shirt: a light body (it's worn under armour) with the sleeves in its colour
    const torsoM = look.top === 'combat' ? L(new T.Color(look.topC).lerp(new T.Color(0xb8b0a0), 0.4).getHex()) : top;
    if (style === 'tactical') { if (o.bare) hairM = o.mannequin ? null : L(pick(PAL.hair)); else { vestM = L(0x2a2c28); helmetM = L(0x26282a); } }
    else if (style === 'armored') { if (!o.dressed) { vestM = L(o.boss ? 0x3a2f24 : 0x3b4232); helmetM = L(0x2a2d30); } headCover = L(0x161616); }
    else if (style === 'suspect') { if (rnd() < 0.6) headCover = L(0x151515); else hairM = L(pick(PAL.hair)); }
    else hairM = L(pick(PAL.hair));
    // armour worn over street clothes (o.vest: 'soft' or a plate carrier; o.helmet)
    if (!o.dressed && o.vest && !vestM) vestM = L(o.vest === 'soft' ? 0x34373b : 0x3b4232);
    if (!o.dressed && o.helmet && !helmetM) { helmetM = L(0x2a2d30); hairM = null; }
    const gloveM = { tactical: L(0x1c1d1f), leather: L(0x5e3e24), fingerless: L(0x1c1d1f) }[look.gloves] || null;
    const bootM = style === 'civ' ? L(pick([0xeeeeee, 0x3a2a1a, 0x222222])) : L(0x1e1f21);
    const dark = L(0x141414);
    const mats = [top, bottom, skin];
    const tieMat = L(0xe6e6e0); // white zip tie, easy to spot on a body
    const M_ = (geo, m, x = 0, y = 0, z = 0, parent) => { const me = new T.Mesh(geo, m); me.position.set(x, y, z); if (parent) parent.add(me); return me; };
    const cyl = (rt, rb, h, m, seg = 12) => new T.CylinderGeometry(rt, rb, h, seg);

    // ---- the body: a tapered chest and waist, sloping shoulders, a rounded head with a face
    const root = new T.Group();
    const body = joint(root, 0, 0, 0);
    body.scale.setScalar(s);
    const hips = joint(body, 0, HIP_H, 0);
    const pelvis = M_(cyl(0.155, 0.14, 0.2), bottom, 0, 0, 0, hips); pelvis.scale.z = 0.7;
    const spine = joint(hips, 0, 0.08, 0);
    const abdomen = M_(cyl(0.145, 0.152, 0.17), torsoM, 0, 0.1, 0, spine); abdomen.scale.z = 0.7;
    const chest = joint(spine, 0, 0.19, 0);
    const torso = M_(cyl(0.2, 0.152, 0.33, 14), torsoM, 0, 0.14, 0, chest); torso.scale.z = 0.62;
    const traps = M_(cyl(0.075, 0.19, 0.07, 14), torsoM, 0, 0.34, 0, chest); traps.scale.z = 0.6; // neck down to the shoulders
    if (vestM) {
      M_(new T.BoxGeometry(0.41, 0.28, 0.28), vestM, 0, 0.12, 0, chest);
      for (const x of [-0.12, 0, 0.12]) M_(new T.BoxGeometry(0.09, 0.09, 0.05), gear, x, 0.05, -0.16, chest);
      if (style === 'armored') for (const x of [-0.22, 0.22]) M_(new T.BoxGeometry(0.13, 0.07, 0.2), vestM, x, 0.3, 0, chest);
    }
    if (look.top === 'hoodie') { const hood = M_(new T.SphereGeometry(0.11, 12, 8), top, 0, 0.31, 0.1, chest); hood.scale.set(1.25, 0.55, 0.75); } // the hood, down
    const neck = joint(chest, 0, 0.3, 0);
    const faceM = headCover || skin;
    M_(cyl(0.048, 0.056, 0.1, 10), faceM, 0, 0.02, 0, neck);
    const head = joint(neck, 0, 0.06, 0);
    // the head: cranium, jaw, nose, ears; the same shape whatever's on it (it sits inside every helmet)
    const cranium = M_(new T.SphereGeometry(0.1, 18, 14), faceM, 0, 0.13, 0, head); cranium.scale.set(0.92, 1.06, 1.0);
    const jaw = M_(new T.SphereGeometry(0.075, 14, 10), faceM, 0, 0.065, -0.018, head); jaw.scale.set(1.0, 0.95, 1.05);
    M_(new T.BoxGeometry(0.022, 0.038, 0.03), faceM, 0, 0.105, -0.1, head); // nose
    for (const x of [-1, 1]) { const ear = M_(new T.SphereGeometry(0.026, 8, 6), faceM, x * 0.091, 0.12, 0.005, head); ear.scale.set(0.45, 1, 0.75); }
    if (headCover) { // balaclava: the eyes show through a slot
      M_(new T.BoxGeometry(0.12, 0.034, 0.012), skin, 0, 0.136, -0.094, head);
      for (const x of [-0.033, 0.033]) M_(new T.BoxGeometry(0.02, 0.012, 0.006), dark, x, 0.136, -0.1, head);
    } else if (!o.mannequin) {
      for (const x of [-0.033, 0.033]) { M_(new T.BoxGeometry(0.022, 0.013, 0.008), dark, x, 0.135, -0.097, head); M_(new T.BoxGeometry(0.03, 0.007, 0.01), hairM || dark, x, 0.152, -0.097, head); } // eyes, brows
      M_(new T.BoxGeometry(0.04, 0.006, 0.006), L(0x5a3a32), 0, 0.055, -0.096, head); // mouth
    }
    let hairMesh = null;
    if (hairM) { hairMesh = M_(new T.SphereGeometry(0.104, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.46), hairM, 0, 0.134, 0.006, head); hairMesh.scale.set(0.94, 1.06, 1.02); }
    // eyewear
    if (look.eyes === 'glasses') {
      const fr = dark, lens = L(0x9ab4c4); lens.transparent = true; lens.opacity = 0.35;
      for (const x of [-0.034, 0.034]) { M_(new T.BoxGeometry(0.034, 0.024, 0.004), lens, x, 0.136, -0.107, head); M_(new T.BoxGeometry(0.036, 0.004, 0.005), fr, x, 0.149, -0.107, head); }
      M_(new T.BoxGeometry(0.018, 0.004, 0.005), fr, 0, 0.142, -0.107, head);
      for (const x of [-1, 1]) M_(new T.BoxGeometry(0.004, 0.004, 0.1), fr, x * 0.088, 0.142, -0.06, head);
    } else if (look.eyes === 'shooting') { // wraparound shooting glasses
      const lens = L(0x1a1d22); lens.transparent = true; lens.opacity = 0.85;
      M_(new T.BoxGeometry(0.13, 0.03, 0.008), lens, 0, 0.137, -0.105, head);
      for (const x of [-1, 1]) M_(new T.BoxGeometry(0.005, 0.012, 0.1), dark, x * 0.088, 0.142, -0.06, head);
    } else if (look.eyes === 'goggles') { // a frame, a tinted lens and a strap round the head
      M_(new T.BoxGeometry(0.14, 0.052, 0.03), L(0x2a2c2e), 0, 0.137, -0.098, head);
      const lens = L(0x5a6a50); lens.transparent = true; lens.opacity = 0.8;
      M_(new T.BoxGeometry(0.12, 0.036, 0.006), lens, 0, 0.137, -0.115, head);
      const strap = M_(new T.TorusGeometry(0.1, 0.007, 4, 28), dark, 0, 0.14, 0.004, head); strap.rotation.x = Math.PI / 2; strap.scale.set(0.95, 1.04, 1);
    }
    if (helmetM) G.Headgear.helmet(style === 'tactical' ? 'h.fast' : 'generic', (c, op) => (op ? new T.MeshLambertMaterial(Object.assign({ color: c }, op)) : L(c)), (m) => head.add(m), helmetM.color.getHex()); // (js/headgear.js)
    if (o.vex) { // Vex, as his portrait has him: a dark hood, a black visor with two orange eyes, a grey respirator, a gold strap
      const hoodM = new T.MeshLambertMaterial({ color: 0x1d1c18, side: T.DoubleSide });
      const hood = M_(new T.SphereGeometry(0.128, 18, 12, 5.58, 4.54, 0, Math.PI * 0.66), hoodM, 0, 0.125, 0.012, head); hood.scale.set(0.98, 1.04, 1.06); // (open at the front)
      const cowl = M_(new T.CylinderGeometry(0.115, 0.215, 0.17, 16, 1, true), hoodM, 0, 0.3, 0.02, chest); cowl.scale.z = 0.8; // (over the shoulders)
      M_(new T.BoxGeometry(0.19, 0.052, 0.05), L(0x101010), 0, 0.137, -0.088, head); // the visor
      const glow = new T.MeshBasicMaterial({ color: 0xff9a2e }), pupil = new T.MeshBasicMaterial({ color: 0xfff3c4 });
      for (const x of [-0.04, 0.04]) {
        const e = M_(new T.CylinderGeometry(0.0185, 0.0185, 0.008, 14), glow, x, 0.137, -0.116, head); e.rotation.x = Math.PI / 2;
        const p = M_(new T.CylinderGeometry(0.0085, 0.0085, 0.009, 10), pupil, x, 0.137, -0.1205, head); p.rotation.x = Math.PI / 2;
      }
      const mask = M_(new T.BoxGeometry(0.125, 0.07, 0.05), L(0x3b3b36), 0, 0.055, -0.083, head); mask.rotation.x = 0.12; // the respirator
      for (const x of [-0.03, 0, 0.03]) { const v = M_(new T.CylinderGeometry(0.0075, 0.0075, 0.006, 8), L(0x1b1b19), x, 0.05, -0.1105, head); v.rotation.x = Math.PI / 2; }
      const strap = M_(new T.BoxGeometry(0.045, 0.34, 0.012), L(0xc9a227), -0.1, 0.12, -0.151, chest); strap.rotation.z = -0.5; // gold, across the chest
    }
    if (style === 'suspect' && !headCover && rnd() < 0.5) { if (hairMesh) hairMesh.scale.y *= 0.9; G.Headgear.cap((c, op) => (op ? new T.MeshLambertMaterial(Object.assign({ color: c }, op)) : L(c)), (m) => head.add(m), pick(PAL.hoodie)); } // a baseball cap

    // ---- arms: tapered, with elbows; sleeves (short for a T-shirt), and hands with fingers and a thumb
    const longSleeves = look.top !== 'tshirt';
    const mkArm = (side) => {
      const sh = joint(chest, side * 0.2, 0.26, 0);
      M_(new T.SphereGeometry(0.066, 10, 8), vestM || top, 0, 0, 0, sh);
      const up = joint(sh, 0, 0, 0);
      if (longSleeves) M_(cyl(0.056, 0.047, UARM, 10), top, 0, -UARM / 2, 0, up);
      else { M_(cyl(0.06, 0.056, UARM * 0.45, 10), top, 0, -UARM * 0.22, 0, up); M_(cyl(0.05, 0.045, UARM * 0.7, 10), skin, 0, -UARM * 0.62, 0, up); }
      if (style === 'tactical' && side < 0 && o.animal && G.Callsigns) { // their animal's patch on the shoulder
        const p = new T.Mesh(new T.PlaneGeometry(0.058, 0.058), new T.MeshLambertMaterial({ map: G.Callsigns.armTex(o.animal) }));
        p.position.set(side * 0.06, -0.085, 0); p.rotation.y = side * Math.PI / 2; up.add(p);
      } else if (style === 'tactical' && side < 0 && o.color != null) M_(cyl(0.059, 0.059, 0.03, 12), L(o.color), 0, -0.08, 0, up); // the squad armband
      const lo = joint(up, 0, -UARM, 0);
      M_(new T.SphereGeometry(0.047, 10, 8), longSleeves ? top : skin, 0, 0, 0, lo); // elbow
      M_(cyl(0.046, 0.036, FARM, 10), longSleeves ? top : skin, 0, -FARM / 2, 0, lo);
      const handM = gloveM || skin, fingerM = look.gloves === 'fingerless' ? skin : handM;
      M_(new T.BoxGeometry(0.068, 0.08, 0.035), handM, 0, -FARM - 0.035, 0, lo); // palm
      const fing = M_(new T.BoxGeometry(0.066, 0.045, 0.03), fingerM, 0, -FARM - 0.095, -0.006, lo); fing.rotation.x = 0.25;
      const thumb = M_(new T.BoxGeometry(0.022, 0.045, 0.024), fingerM, side * -0.036, -FARM - 0.045, -0.02, lo); thumb.rotation.z = side * 0.35;
      const tie = new T.Mesh(new T.TorusGeometry(0.04, 0.011, 5, 12), tieMat); tie.rotation.x = Math.PI / 2; tie.position.y = -FARM + 0.025; tie.visible = false; lo.add(tie);
      return { sh, up, lo, tie };
    };
    const armL = mkArm(-1), armR = mkArm(1);
    // ---- legs: tapered thighs and shins, knees; cargo pockets or knee pads; boots (shoes for civilians)
    const mkLeg = (side) => {
      const th = joint(hips, side * 0.1, -0.03, 0);
      M_(cyl(0.088, 0.064, THIGH, 12), bottom, 0, -THIGH / 2, 0, th);
      if (look.pants === 'cargo') M_(new T.BoxGeometry(0.035, 0.12, 0.1), bottom, side * 0.08, -THIGH * 0.5, 0, th); // the cargo pocket
      const sh = joint(th, 0, -THIGH, 0);
      M_(new T.SphereGeometry(0.064, 10, 8), bottom, 0, 0, 0, sh); // knee
      if (look.pants === 'combat') M_(new T.BoxGeometry(0.09, 0.1, 0.03), dark, 0, -0.03, -0.06, sh); // knee pad
      M_(cyl(0.061, 0.046, SHIN, 10), bottom, 0, -SHIN / 2, 0, sh);
      if (style !== 'civ') M_(cyl(0.054, 0.058, 0.13, 10), bootM, 0, -SHIN + 0.03, 0, sh); // the boot's upper
      M_(new T.BoxGeometry(0.1, 0.07, 0.25), bootM, 0, -SHIN - 0.01, -0.05, sh);
      return { th, sh };
    };
    const legL = mkLeg(-1), legR = mkLeg(1);

    const gunMount = joint(chest, 0.12, 0.27, -0.16);
    // where a weapon rides when it isn't in the hands: rifles slung across the back, pistols holstered at the hip
    // muzzle up and over one shoulder, diagonally across the back (Y before X so the tilt applies)
    const slingMount = joint(chest, 0.14, -0.22, 0.17); slingMount.rotation.set(Math.PI / 2, 0.6, 0);
    const hipMount = joint(hips, 0.2, 0.02, -0.02); hipMount.rotation.set(-Math.PI / 2, 0, 0);

    const rig = {
      hairMesh, look, kitParts: [], kitKey: null, kit: null, callsign: o.animal ? { id: o.animal, name: o.callName || '' } : null,
      root, body, hips, spine, chest, neck, head, armL, armR, legL, legR, gunMount, slingMount, hipMount, slung: false, mats, scale: s, style,
      gun: null, gunInfo: null, gunKey: null,
      phase: rnd() * 10, vel: new T.Vector3(), lastPos: null,
      crouchW: 0, aimW: 0, lean: 0, kick: 0, flinch: new T.Vector3(), throwT: -1,
      state: 'alive', deadT: 0, fallX: 1, fallZ: 0, downW: 0,
      hb: null, dbg: null,
    };
    rig.setGun = (code, skin) => setGun(rig, code, skin); // (skin: its stickers, js/stickers.js)
    rig.update = (dt, p) => update(rig, dt, p);
    rig.hitboxes = () => hitboxes(rig);
    // a shot: the animation's kick, and on a powered body the gun's muzzle rise (deg, from the host's kickOf)
    // and a shove back through the arms and shoulders along the bore
    rig.recoil = (deg) => {
      rig.kick = Math.min(1, rig.kick + 0.6);
      if (!deg || !rig.powered || !rig.rd || rig.state === 'dead') return;
      rig.gunKick = (rig.gunKick || 0) + deg * D2R;
      const g = rig.gun, rd = rig.rd;
      if (!g) return;
      const back = new T.Vector3(0, 0, 1).transformDirection(g.matrixWorld), k = Math.min(0.03, deg * 0.0018);
      for (const [i, f] of [[11, 1], [10, 0.8], [9, 0.7], [8, 0.5], [5, 0.45], [4, 0.3], [3, 0.25], [7, 0.15]]) rd.prev[i].addScaledVector(back, -k * f);
    };
    rig.hit = (dir) => { // dir: world-space direction the bullet travelled
      const inv = rig.root.quaternion.clone().invert();
      const l = dir.clone().applyQuaternion(inv);
      rig.flinch.set(l.z * 0.35, l.x * 0.35, 1); // a flinch away from it (no colour flash)
      // a powered body takes it physically: the upper body's knocked the way the round went
      const rd = rig.rd;
      if (rig.powered && rd && rig.state !== 'dead') [[3, 0.055], [4, 0.045], [5, 0.045], [6, 0.05], [7, 0.055], [0, 0.02]].forEach(([i, k]) => rd.prev[i].addScaledVector(dir, -k * (0.8 + Math.random() * 0.4)));
    };
    // let go of the weapon: it falls and stays on the floor
    rig.dropGun = () => {
      if (!rig.gun) return;
      const g = rig.gun;
      g.getWorldPosition(_a); g.getWorldQuaternion(_q);
      if (g.parent) g.parent.remove(g);
      rig.slung = false;
      if (rig.dropped && rig.dropped.g.parent) rig.dropped.g.parent.remove(rig.dropped.g);
      root.parent && root.parent.add(g);
      g.position.copy(_a); g.quaternion.copy(_q); g.scale.setScalar(s);
      rig.dropped = { g, vy: 1.5, spin: (Math.random() - 0.5) * 6 };
      rig.gun = null; rig.gunInfo = null; rig.gunKey = null;
    };
    // Down for good (alive, bleeding out): limp, the same ragdoll as the dead, carrying on from however the body was
    // moving (its powered ragdoll, if it had one), no muscles pulling it toward a pose to snap back to.
    rig.goLimp = () => {
      if (rig.limp || rig.state === 'dead') return;
      rig.limp = true; rig.deadT = 0;
      if (rig.rd) { rig.rd.drive = null; rig.rd.asleep = false; rig.rd.still = 0; } else ragdollInit(rig, null);
    };
    rig.die = (dir) => {
      if (rig.state === 'dead') return;
      rig.state = 'dead'; rig.deadT = 0;
      ragdollInit(rig, dir);
      if (dir) {
        const l = dir.clone().applyQuaternion(rig.root.quaternion.clone().invert());
        // fall the way the killing shot pushed: +z travel (from the front) -> fall backward
        if (Math.abs(l.x) > Math.abs(l.z)) { rig.fallX = 0; rig.fallZ = -Math.sign(l.x); } else { rig.fallX = Math.sign(l.z) || 1; rig.fallZ = 0; }
      } else { rig.fallX = Math.random() < 0.6 ? 1 : -1; rig.fallZ = 0; }
      rig.dropGun();
    };
    // a throw: an enemy's (the gun still in the other hand), or an officer's from the grenade they're holding
    // (str 0 underhand, 1-2 overhand)
    rig.throwNade = (str) => { rig.throwT = 0; rig.throwHand = str != null; rig.throwStr = str; };
    rig.setKit = (k) => setKit(rig, k);
    rig.setCallsign = (id, name) => { rig.callsign = id ? { id, name: name || '' } : null; setKit(rig, rig.kit); };
    setKit(rig, null); // (the back patch, before any kit)
    // put the weapon away (true) or bring it to the hands (false)
    rig.holster = (on) => {
      if (!rig.gun || rig.slung === on) return;
      rig.slung = on;
      if (rig.gunBaseOf === rig.gun) gunHome(rig); // (off the hand it was following)
      (on ? (rig.gunInfo && rig.gunInfo.pistol ? rig.hipMount : rig.slingMount) : rig.gunMount).add(rig.gun);
    };
    // zip-tie the wrists (living arrests and secured bodies)
    rig.zip = (on, instant) => {
      if (on && !rig.zipped && (rig.state === 'dead' || rig.limp)) rollFaceDown(rig, instant);
      rig.zipped = on; rig.armL.tie.visible = rig.armR.tie.visible = on;
    };
    // An officer securing this body: t is their progress (0..1), or -1 once nobody is. They turn it onto its
    // front over the first 40%, then draw the wrists behind the back; the tie goes on at the end.
    rig.secure = (t) => {
      const rd = rig.rd;
      if (!rd || rig.zipped) return;
      if (t < 0) {
        if (!rd.handled) return;
        rd.keepPin = rd.handled.t > 0.9 ? 2 : 0; // finished: hold the wrists until the host confirms the tie
        if (rd.roll && rd.roll.driven) rd.roll = null; // let go part-way: it flops back under gravity
        rd.handled = null; rd.asleep = false; rd.still = 0; rd.calm = 0.6;
        return;
      }
      if (!rd.handled) { rd.handled = { t: 0 }; rd.roll = planRoll(rig); if (rd.roll) rd.roll.driven = true; }
      rd.handled.t = t;
      rd.asleep = false;
      if (rd.roll && rd.roll.driven) {
        rd.roll.t = G.U.smooth(0.03, 0.4, t);
        if (rd.roll.t >= 1) { rd.roll = null; rd.calm = 0.8; rd.still = 0; } // on its front: physics again, wrists next
      }
    };
    // a body that was already lying there when we arrived: let it fall and come to rest at once
    rig.settle = (sec = 3) => {
      for (let t = 0; t < sec; t += 1 / 30) { rig.deadT += 1 / 30; if (rig.rd) ragdollStep(rig, 1 / 30); }
      if (rig.rd) ragdollPose(rig);
    };
    rig.startle = () => { rig.flinch.set(0.7, 0, 1); }; // a jolt backward
    // (its geometry is its own, each piece made for it: thrown away with it, or every body that's ever left the scene
    // stays on the graphics card. The materials are shared between bodies, so they stay.)
    rig.dispose = () => {
      if (rig.dropped && rig.dropped.g.parent) rig.dropped.g.parent.remove(rig.dropped.g);
      if (rig.dbg) rig.dbg.forEach((m) => m.parent && m.parent.remove(m));
      for (const o of [rig.root, rig.dropped && rig.dropped.g]) if (o) o.traverse((c) => { if (c.geometry) c.geometry.dispose(); });
    };
    return rig;
  }

  // code: a build code (or a plain weapon id for its factory build)
  function setGun(rig, code, skin) {
    const key = code ? code + (skin && skin.length ? '#' + G.Stickers.key(skin) : '') : null;
    if (rig.gunKey === key) return;
    if (rig.gun && rig.gun.parent) rig.gun.parent.remove(rig.gun);
    if (rig.gun) rig.gun.traverse((o) => { if (o.userData.sticker) o.geometry.dispose(); }); // (its stickers' own: the model's shared)
    rig.slung = false;
    rig.gunKey = key;
    const def = code ? G.Gunsmith.fromCode(code) : null;
    if (!def) { rig.gun = null; rig.gunInfo = null; return; }
    rig.gun = G.GunModels.world(def, skin);
    rig.gunInfo = rig.gun.userData.info;
    rig.gunMount.add(rig.gun);
  }

  // Prone (an officer lying down to shoot), as the rig draws it: how far the chest is propped up on the elbows (rad),
  // the head lifted, turned and rolled down onto the stock; the gun drawn in toward the middle (chest frame: x across,
  // up off the ground, forward); the feet (body frame: across, along the body, off the ground: the right one drawn up
  // and out, the left straight back), and where the elbows bend toward (rig frame: across, height, ahead: -z)
  const PRONE = { prop: 0.2, neck: 1.05, turn: 0, roll: 0, gunX: 0.07, gunUp: 0.09, gunFwd: 0.22,
    footR: [0.42, 0.42, 0.08], footL: [-0.26, 0.04, 0.04], elbowX: 0.32, elbowY: -0.4, elbowZ: -2.05 };
  // p: { pos (Vector3 ground position), yaw, pitch, crouch, alert, lean, state: 'alive'|'down', moving override }
  function update(rig, dt, p) {
    const U = G.U, s = rig.scale;
    const root = rig.root;
    // velocity in the rig's local frame (for stepping)
    if (!rig.lastPos) rig.lastPos = p.pos.clone();
    const dv = _a.subVectors(p.pos, rig.lastPos);
    rig.lastPos.copy(p.pos);
    if (dt > 0) rig.vel.lerp(dv.multiplyScalar(1 / dt), Math.min(1, dt * 10));
    root.position.copy(p.pos);
    root.rotation.y = p.yaw;
    if (rig.powered && rig.state !== 'dead' && !rig.limp) gunHome(rig); // (before the hands reach for it)
    root.updateMatrixWorld(true);


    if (rig.state === 'dead' || rig.limp) { animateDeath(rig, dt); drawDebug(rig); return; }

    const sy = Math.sin(p.yaw), cy = Math.cos(p.yaw);
    const vx = rig.vel.x, vz = rig.vel.z;
    const localRight = vx * cy - vz * sy;          // +x in rig space
    const localFwd = -(vx * sy + vz * cy);         // forward (-z) in rig space
    const speed = Math.hypot(vx, vz) / s;
    const moving = speed > 0.25 ? 1 : speed / 0.25;

    const posed = p.pose === 'handsup' || p.pose === 'cuffed' || p.pose === 'cower' || p.pose === 'takedown';
    // restrained suspects lie face down; during a takedown they're pushed over as it progresses
    const tk = p.pose === 'takedown' ? p.tk || 0 : 0;
    const proneT = p.pose === 'cuffed' ? 1 : p.pose === 'takedown' ? U.smooth(0.05, 0.42, tk) : 0;
    rig.proneW = (rig.proneW || 0) + (proneT - (rig.proneW || 0)) * Math.min(1, dt * (p.pose === 'takedown' ? 14 : 5));
    // prone, to shoot (an officer, p.prone): on their front, propped on the elbows, head up, the gun level in front;
    // the body lies out ahead of the feet, so it's slid back to keep the head over where they're looking from
    rig.proneS = (rig.proneS || 0) + ((p.prone && !posed && p.state !== 'down' ? 1 : 0) - (rig.proneS || 0)) * Math.min(1, dt * 4);
    const lie = Math.max(rig.proneW, rig.proneS);
    if (rig.proneS > 0.001) { root.position.x += Math.sin(p.yaw) * 1.45 * s * rig.proneS; root.position.z += Math.cos(p.yaw) * 1.45 * s * rig.proneS; }
    rig.crouchW += ((p.crouch || posed ? 1 - lie : 0) - rig.crouchW) * Math.min(1, dt * 9);
    rig.downW += ((p.state === 'down' ? 1 : 0) - rig.downW) * Math.min(1, dt * 5);
    rig.aimW += ((p.alert && !posed && !rig.slung ? 1 : 0) - rig.aimW) * Math.min(1, dt * 6);
    rig.lean += ((p.lean || 0) - rig.lean) * Math.min(1, dt * 8);
    rig.kick = Math.max(0, rig.kick - dt * 7);
    rig.flinch.z = Math.max(0, rig.flinch.z - dt * 5);
    if (rig.throwT >= 0) { rig.throwT += dt; if (rig.throwT > 0.9) rig.throwT = -1; }

    // gait: one full cycle = two steps; longer strides when running
    const stride = U.lerp(1.1, 1.8, U.clamp(speed / 6, 0, 1)) * (1 - rig.crouchW * 0.35);
    rig.phase += (speed * dt / stride) * Math.PI * 2;
    const bob = Math.abs(Math.sin(rig.phase)) * 0.035 * moving;

    // body: hips height, lean, downed pose
    const hipH = U.lerp(HIP_H, CROUCH_H, rig.crouchW) - bob + 0.02 * moving;
    rig.body.rotation.set(-Math.PI / 2 * 0.96 * lie, 0, 0); // tips forward about the feet
    rig.body.position.y = 0.12 * lie;
    rig.hips.position.set(rig.lean * 0.14, U.lerp(hipH, 0.17, rig.downW), U.lerp(0, 0.06, rig.crouchW));
    rig.hips.rotation.set(0, Math.sin(rig.phase) * 0.12 * moving, 0);
    const fl = rig.flinch.z;
    rig.spine.rotation.set(-localFwd * 0.025 - rig.crouchW * 0.4 + rig.downW * 0.35 + fl * rig.flinch.x * 0.6, -rig.hips.rotation.y, -rig.lean * 0.28 + fl * rig.flinch.y * -0.6);
    const pitch = U.clamp(p.pitch || 0, -1.2, 1.2) * rig.aimW;
    rig.chest.rotation.set(pitch * 0.75 + rig.crouchW * 0.32 - rig.downW * 0.25 + rig.kick * 0.08 + rig.proneS * PRONE.prop, 0, -rig.lean * 0.25); // (prone: up on the elbows, a little)
    rig.neck.rotation.set(pitch * 0.25 - fl * rig.flinch.x * 0.3 - rig.proneW * 0.5 + rig.proneS * PRONE.neck, rig.proneW * 0.9 + rig.proneS * PRONE.turn, rig.lean * 0.3 + rig.proneS * PRONE.roll); // cheek to the floor (cuffed); head up, cheek down on the stock (prone)
    rig.head.rotation.set(0, 0, 0);

    // gun: shouldered when alert, low-ready otherwise; pistols held out in front
    const gi = rig.gunInfo;
    const pistol = gi && gi.pistol;
    const mount = rig.gunMount;
    if (pistol) mount.position.set(0.02, U.lerp(0.18, 0.27, rig.aimW), U.lerp(-0.32, -0.46, rig.aimW));
    else mount.position.set(0.12, U.lerp(0.2, 0.28, rig.aimW) - (gi ? gi.sy * 0.6 : 0), -0.21 + rig.kick * 0.04); // (well out in front, the support arm bent)
    mount.rotation.set(U.lerp(-0.75, 0, rig.aimW) + rig.kick * 0.12 + rig.proneS * (Math.PI / 2 * 0.96 - PRONE.prop), U.lerp(-0.35, 0, rig.aimW), 0); // (prone: back up level, off the chest lying flat)
    // a bullpup's grip (and so its butt) is well forward of a rifle's: back with it, so the butt's in the shoulder
    const pup = gi && !pistol ? Math.max(0, gi.grip[0] - 0.05) : 0;
    if (pup) { mount.position.z += pup * (1 - rig.proneS); mount.position.y -= pup * rig.proneS; }
    if (rig.proneS > 0.001) { mount.position.x += (PRONE.gunX - mount.position.x) * rig.proneS; mount.position.z += PRONE.gunUp * rig.proneS; mount.position.y += PRONE.gunFwd * rig.proneS; } // (in under the cheek, up off the ground)
    if (rig.throwT >= 0 && !rig.throwHand) mount.rotation.x -= 0.6 * Math.sin(Math.PI * Math.min(1, rig.throwT / 0.9));
    // a reload: the gun canted toward the support hand; inspecting it: rolled over and turned to look along it
    const rl = p.reload != null && p.reload >= 0 ? p.reload : -1, ins = p.inspect != null && p.inspect >= 0 ? p.inspect : -1;
    if (rl >= 0) { const k = Math.sin(Math.PI * Math.min(1, rl)); mount.rotation.z += 0.5 * k; mount.rotation.x += 0.12 * k; mount.position.y -= 0.03 * k; }
    if (ins >= 0) { const k = U.smooth(0, 0.15, ins) * (1 - U.smooth(0.85, 1, ins)); mount.rotation.z -= 1.0 * k; mount.rotation.y += 0.55 * k; mount.position.y += 0.05 * k; mount.position.z += 0.06 * k; }
    root.updateMatrixWorld(true);

    // legs: feet planted on a stepping cycle along the travel direction
    const dirLen = Math.hypot(localRight, localFwd) || 1;
    const dX = localRight / dirLen, dZ = -localFwd / dirLen;    // rig-local travel direction (z = back)
    const stepLen = Math.min(stride * 0.27, 0.42) * moving;
    for (const [leg, side] of [[rig.legL, -1], [rig.legR, 1]]) {
      const ph = rig.phase + (side > 0 ? Math.PI : 0);
      const swing = Math.sin(ph), lift = Math.max(0, Math.cos(ph)) * 0.13 * moving * (1 - rig.crouchW * 0.5);
      let fx = side * U.lerp(0.11, 0.16, rig.crouchW) + dX * swing * stepLen + rig.lean * 0.05;
      let fz = dZ * swing * stepLen + rig.crouchW * (side > 0 ? 0.42 : -0.32);
      if (rig.downW > 0.5) { fz = -0.75; fx = side * 0.16; }
      let fy = 0.06 + lift;
      let legPole = null;
      if (rig.proneS > 0.01) { // prone: legs spread, toes down; the right knee drawn up and out to the side
        const k = rig.proneS, [px, py, pz] = side > 0 ? PRONE.footR : PRONE.footL;
        fx = U.lerp(fx, px, k); fy = U.lerp(fy, py, k); fz = U.lerp(fz, pz, k);
        legPole = rig.body.localToWorld(_d.set(side * 1.2, side > 0 ? 0.9 : 0.6, 0.12)).clone();
      }
      if (p.act && p.act.kind === 'kick' && side > 0) { const k = G.U.kickFoot(p.act.t); fx = 0.1; fy = k.y; fz = k.z; } // right leg kicks
      const target = rig.body.localToWorld(_c.set(fx, fy, fz)).clone();
      const pole = legPole || rig.body.localToWorld(_d.set(fx, 0.6, -1.2)).clone();
      ik(leg.th, leg.sh, THIGH * s, SHIN * s, target, pole);
    }

    // arms: hands on the gun's grip and support points; right arm can override to throw
    const shL = rig.armL.up, shHome = shL.userData.home || (shL.userData.home = shL.position.clone());
    shL.position.copy(shHome); // (the left shoulder, unless it's reaching: below)
    if (posed) {
      // hands up / hands behind the back / hands over the head
      for (const [arm, side] of [[rig.armL, -1], [rig.armR, 1]]) {
        let tgt, pole;
        const behind = p.pose === 'cuffed' || (p.pose === 'takedown' && tk > 0.5);
        if (p.pose === 'takedown' && tk < 0.42) { // shoved forward: hands come down to break the fall
          const up = rig.head.localToWorld(new T.Vector3(side * 0.22, 0.34, -0.04)), out = rig.chest.localToWorld(new T.Vector3(side * 0.3, 0.1, -0.5));
          tgt = up.lerp(out, U.smooth(0.05, 0.35, tk)); pole = rig.chest.localToWorld(new T.Vector3(side * 0.9, 0.2, 0.1));
        } else if (p.pose === 'takedown' && !behind) { // flat on the floor, arms out, waiting to be pulled back
          tgt = rig.chest.localToWorld(new T.Vector3(side * 0.55, 0.1, -0.1)); pole = rig.chest.localToWorld(new T.Vector3(side * 0.9, 0.4, 0.3));
        } else if (behind) { tgt = rig.hips.localToWorld(new T.Vector3(side * 0.04, 0.06, 0.22)); pole = rig.chest.localToWorld(new T.Vector3(side * 0.7, -0.2, 0.2)); }
        else if (p.pose === 'handsup') { tgt = rig.head.localToWorld(new T.Vector3(side * 0.22, 0.34, -0.04)); pole = rig.chest.localToWorld(new T.Vector3(side * 0.9, 0.2, 0.1)); }
        else if (p.pose === 'cower') { tgt = rig.head.localToWorld(new T.Vector3(side * 0.08, 0.24, 0.02)); pole = rig.chest.localToWorld(new T.Vector3(side * 0.6, 0.2, -0.7)); }
        else { tgt = rig.hips.localToWorld(new T.Vector3(side * 0.04, 0.06, 0.22)); pole = rig.chest.localToWorld(new T.Vector3(side * 0.7, -0.2, 0.2)); }
        ik(arm.up, arm.lo, UARM * s, FARM * s, tgt, pole);
      }
    } else if (rig.gun && gi && !rig.slung) {
      // held out in front: a long gun's forend can be past where the left arm reaches; it comes back along itself
      // till the support hand's on it
      if (!gi.pistol) {
        rig.chest.updateMatrixWorld(true);
        const S = rig.gun.localToWorld(_a.set(gi.support[2] - 0.01, gi.support[1], -gi.support[0])), P = rig.armL.up.getWorldPosition(_b);
        const f = _c.set(0, 0, -1).transformDirection(rig.gun.matrixWorld), D = _d.subVectors(S, P), R = (UARM + FARM) * s * 0.98;
        // first the shoulder rolls forward toward it (as reaching does), up to 7 cm; then the gun comes back
        const far = D.length() - R;
        if (far > 0) {
          P.addScaledVector(D, Math.min(0.07 * s, far) / D.length()); shL.position.copy(shL.parent.worldToLocal(_e.copy(P)));
          D.subVectors(S, P);
        }
        const df = D.dot(f), over = D.lengthSq() - R * R;
        if (over > 0) {
          const back = df - Math.sqrt(Math.max(0, df * df - over));
          if (back > 0) rig.gunMount.position.addScaledVector(_e.set(0, 0, 1).applyQuaternion(rig.gunMount.quaternion), back / s);
        }
      }
      rig.gunMount.updateMatrixWorld(true);
      const grip = rig.gun.localToWorld(new T.Vector3(gi.grip[2], gi.grip[1], -gi.grip[0]));
      const supp = rig.gun.localToWorld(new T.Vector3(gi.support[2] - 0.01, gi.support[1], -gi.support[0]));
      let rTarget = grip;
      if (rig.throwT >= 0) {
        const t = rig.throwT / 0.9;
        const wind = t < 0.45 ? t / 0.45 : 1 - (t - 0.45) / 0.55;
        rTarget = rig.chest.localToWorld(new T.Vector3(0.28, U.lerp(0.3, 0.55, wind), U.lerp(-0.45, 0.25, wind)));
      }
      // the support hand in a reload: to the magazine, down to a pouch on the belt, back up with the new one,
      // seating it; in a magazine check: the magazine out and up in front of the chest
      const well = rig.gun.localToWorld(new T.Vector3(gi.grip[2], gi.grip[1] - 0.07, -(gi.grip[0] + 0.09)));
      let sp = supp;
      if (rl >= 0) {
        const pouch = rig.hips.localToWorld(new T.Vector3(-0.2, 0.06, -0.12)), L2 = (a, b, u) => a.clone().lerp(b, U.smooth(0, 1, u));
        sp = rl < 0.15 ? L2(supp, well, rl / 0.15) : rl < 0.35 ? L2(well, pouch, (rl - 0.15) / 0.2) : rl < 0.6 ? L2(pouch, well, (rl - 0.35) / 0.25) : rl < 0.82 ? well : L2(well, supp, (rl - 0.82) / 0.18);
      } else if (p.magChk != null && p.magChk >= 0) sp = well.clone().lerp(rig.chest.localToWorld(new T.Vector3(-0.04, 0.32, -0.4)), U.smooth(0.25, 1, p.magChk));
      // the elbows: out and down beside you standing; prone, planted on the ground ahead of the shoulders
      const elbow = (side, stand) => { const q = rig.chest.localToWorld(stand); if (rig.proneS > 0.01) q.lerp(rig.root.localToWorld(new T.Vector3(side * PRONE.elbowX, PRONE.elbowY, PRONE.elbowZ)), rig.proneS); return q; };
      ik(rig.armR.up, rig.armR.lo, UARM * s, FARM * s, rTarget, elbow(1, new T.Vector3(0.6, -0.2, 0.4)));
      ik(rig.armL.up, rig.armL.lo, UARM * s, FARM * s, sp, elbow(-1, new T.Vector3(-0.6, -0.3, 0.2)));
      // the magazine: in the support hand from when it comes out to when the new one's seated (or while it's
      // checked), otherwise on the gun
      const mg = rig.gun.userData.mag;
      if (mg) {
        const inHand = (rl >= 0.15 && rl < 0.8) || (p.magChk != null && p.magChk >= 0.12);
        if (inHand) {
          const hp = rig.armL.lo.localToWorld(new T.Vector3(0, -FARM - 0.06, -0.01)); // (in the palm)
          mg.position.copy(rig.gun.worldToLocal(hp));
        } else mg.position.copy(rig.gun.userData.magHome);
      }
    } else {
      // unarmed: arms swing opposite the legs
      for (const [arm, side] of [[rig.armL, -1], [rig.armR, 1]]) {
        arm.up.quaternion.identity(); arm.lo.quaternion.identity();
        arm.up.rotation.set(Math.sin(rig.phase + (side > 0 ? 0 : Math.PI)) * 0.55 * moving, 0, side * 0.1);
        arm.lo.rotation.set(0.25 + 0.35 * moving, 0, 0); // elbows bend forward (the rig faces -z)
      }
    }
    // a grenade in the hand (an officer's: the weapon slung): held in front, drawn back (high overhand, low
    // underhand) with the other arm out ahead, then thrown and followed through
    const handThrow = rig.throwT >= 0 && rig.throwHand;
    if ((p.hold || handThrow) && !posed) {
      const h = p.hold || {}, under = (handThrow ? rig.throwStr : h.str) === 0, C = (x, y, z) => rig.chest.localToWorld(new T.Vector3(x, y, z));
      let rh;
      if (handThrow) {
        const t = Math.min(1, rig.throwT / 0.6), a = under ? [C(0.3, -0.32, 0.22), C(0.2, 0.06, -0.55), C(0.2, -0.18, -0.38)] : [C(0.3, 0.5, 0.16), C(0.22, 0.42, -0.6), C(0.2, 0.02, -0.42)];
        rh = t < 0.35 ? a[0].lerp(a[1], U.smooth(0, 0.35, t)) : a[1].lerp(a[2], U.smooth(0.35, 1, t));
      } else rh = h.cock ? (under ? C(0.3, -0.32, 0.22) : C(0.3, 0.5, 0.16)) : C(0.2, 0.12, -0.34);
      ik(rig.armR.up, rig.armR.lo, UARM * s, FARM * s, rh, C(0.7, -0.2, 0.3));
      const lh = h.cock || handThrow ? C(-0.24, 0.3, -0.46) : C(-0.18, 0.04, -0.3);
      ik(rig.armL.up, rig.armL.lo, UARM * s, FARM * s, lh, C(-0.7, -0.3, 0.2));
    }
    // the grenade itself, in their right hand until it's thrown
    if (p.hold || rig.handNade) {
      if (!rig.handNade) {
        rig.handNade = { frag: new T.Mesh(new T.SphereGeometry(0.04, 10, 8), new T.MeshLambertMaterial({ color: 0x3a4a2a })), flash: new T.Mesh(new T.CylinderGeometry(0.027, 0.027, 0.1, 10), new T.MeshLambertMaterial({ color: 0x7d8388 })) };
        for (const m of Object.values(rig.handNade)) { m.position.set(0, -FARM - 0.07, -0.03); rig.armR.lo.add(m); }
      }
      for (const [k, m] of Object.entries(rig.handNade)) m.visible = !!p.hold && p.hold.kind === k && !handThrow && !posed;
    }
    // door actions: one hand reaches for the handle / door edge (players use the right hand with the
    // weapon put away; an enemy with a gun in hand uses his free left hand)
    if (p.act && (p.act.kind === 'open' || p.act.kind === 'close')) {
      const h = p.act.kind === 'open' ? G.U.openHand(p.act.t) : G.U.closeHand(p.act.t);
      const left = p.act.hand === 'L', arm = left ? rig.armL : rig.armR, sx = left ? -1 : 1;
      const tgt = rig.body.localToWorld(new T.Vector3(h.x * sx, h.y, h.z));
      ik(arm.up, arm.lo, UARM * s, FARM * s, tgt, rig.chest.localToWorld(new T.Vector3(sx * 0.7, -0.3, 0.2)));
    }
    // zip-tying: kneel over them, shove them down, then both hands at their wrists
    if (p.act && p.act.kind === 'zip') {
      const t = p.act.t, S = U.smooth, reach = p.act.pull ? 1 : S(0, 0.14, t), spread = t < 0.45 ? 0.12 : 0.06;
      for (const [arm, side] of [[rig.armL, -1], [rig.armR, 1]]) {
        // on the person (their back, then their wrists) when we know where they are
        const on = p.act.pt ? rig.body.worldToLocal(p.act.pt.clone()).add(new T.Vector3(side * spread, 0.03, 0)) : new T.Vector3(side * 0.08, 0.32, -0.58);
        const local = new T.Vector3(side * 0.25, 0.85, -0.15).lerp(on, reach);
        ik(arm.up, arm.lo, UARM * s, FARM * s, rig.body.localToWorld(local), rig.chest.localToWorld(new T.Vector3(side * 0.7, -0.3, 0.2)));
      }
    }
    // bagging evidence: pick it up off the floor, hold the envelope, set it down
    if (p.act && p.act.kind === 'bag') {
      const { reach, lift, envUp: env, down } = U.bagPhases(p.act.t);
      const rh = new T.Vector3(0.25, 0.8, -0.1).lerp(new T.Vector3(0.12, 0.1, -0.5), reach).lerp(new T.Vector3(0.05, 0.62, -0.42), lift).lerp(new T.Vector3(0.1, 0.1, -0.5), down);
      const lh = new T.Vector3(-0.25, 0.8, -0.1).lerp(new T.Vector3(-0.08, 0.6, -0.4), env).lerp(new T.Vector3(-0.08, 0.1, -0.5), down);
      ik(rig.armR.up, rig.armR.lo, UARM * s, FARM * s, rig.body.localToWorld(rh), rig.chest.localToWorld(new T.Vector3(0.7, -0.3, 0.2)));
      ik(rig.armL.up, rig.armL.lo, UARM * s, FARM * s, rig.body.localToWorld(lh), rig.chest.localToWorld(new T.Vector3(-0.7, -0.3, 0.2)));
    }
    if (rig.powered && p.str != null) powerStep(rig, dt, p.str, p.aimAt);
    else if (rig.powered) rig.rd = null; // (far off: animated only; the body starts again from the pose when near)
    if (rig.dropped) dropGun(rig, dt);
    drawDebug(rig);
  }

  // ---------------------------------------------------------------- the powered body
  // A living body is physically simulated: the ragdoll's particles and joints (below), each pulled toward where
  // the animation has put that joint by "muscles": a spring to the pose and a damper to its motion, as strong
  // as the person is (str 0..1, from the host: what blood loss has left them). Strong, they move as animated
  // but with weight: a hit jolts them, they sway as they stop. Weakening, gravity starts to win: the knees
  // buckle, they sag and stagger, and the legs strain to push back up in efforts that come and go and fade.
  // Below the collapse point they go down (forward, the way a body folds) and can't get up. Dead, the muscles
  // are gone and it's simply the ragdoll.
  // (the host's thresholds: js/server.js)
  const COLLAPSE = 0.3, TWO_HAND = 0.4;
  const KPI_BRACE = [1, 1, 1, 1, 6, 1, 1, 1, 6, 1, 8, 1, 1, 1, 1, 1]; // left shoulder, elbow, hand
  const _gb = new T.Vector3();
  function sample(rig) { // the animated pose, at the ragdoll's particles (0 pelvis ... 15 right foot)
    const { hips, chest, neck, head, armL, armR, legL, legR } = rig;
    const w = (o, x = 0, y = 0, z = 0) => o.localToWorld(new T.Vector3(x, y, z));
    return [w(hips), w(legL.th), w(legR.th), w(chest, 0, 0.14, 0), w(armL.up), w(armR.up), w(neck), w(head, 0, 0.1, 0),
      w(armL.lo), w(armR.lo), w(armL.lo, 0, -FARM, 0), w(armR.lo, 0, -FARM, 0), w(legL.sh), w(legR.sh), w(legL.sh, 0, -SHIN, 0), w(legR.sh, 0, -SHIN, 0)];
  }
  const _gm = new T.Matrix4(), _gl = new T.Matrix4(), _gp = new T.Vector3(), _gq = new T.Quaternion(), _gs = new T.Vector3();
  // the gun back in its own place on the mount (where the animation's hands go for it); powerStep then moves it
  // with the simulated hand. Done first thing each frame, or the arms would chase where the hand took it last
  // frame (and the hand, the gun: round and round).
  function gunHome(rig) {
    const g = rig.gun;
    if (!g) return;
    if (rig.gunBaseOf !== g) { rig.gunBaseOf = g; rig.gunBase = { p: g.position.clone(), q: g.quaternion.clone(), s: g.scale.clone() }; }
    g.position.copy(rig.gunBase.p); g.quaternion.copy(rig.gunBase.q); g.scale.copy(rig.gunBase.s);
  }
  function powerStep(rig, dt, str, aimAt) {
    // the gun in their hands goes where the (simulated) right hand goes, not where the chest mount is: its pose
    // and the forearm's as animated, so it can be moved with the forearm afterwards (gun base: its own place on
    // the mount, put back each frame before anything moves it)
    // (it was put back on its mount at the start of the frame, before the arms reached for it: gunHome)
    const g = rig.gun && !rig.slung && rig.gun.parent === rig.gunMount ? rig.gun : null;
    rig.root.updateMatrixWorld(true);
    const loAnim = g ? rig.armR.lo.matrixWorld.clone() : null, gunAnim = g ? g.matrixWorld.clone() : null;
    const Tg = sample(rig);
    // The off hand. With the strength to (str >= TWO_HAND, as on the host: it steadies their aim), it's on
    // the gun's forend where the arms are holding it now. Without, it goes to the floor beside them and props
    // them up, the elbow locked.
    const yaw = rig.root.rotation.y, fx = -Math.sin(yaw), fz = -Math.cos(yaw), rx = Math.cos(yaw), rz = -Math.sin(yaw);
    rig.braceW = (rig.braceW || 0) + ((str < TWO_HAND ? 1 : 0) - (rig.braceW || 0)) * Math.min(1, dt * 4);
    if (rig.braceW > 0.02) {
      // on the floor beside them if it can reach (down there, or folded over), else leaning on the knee
      const P0 = rig.rd && rig.rd.P, sh = P0 ? P0[4] : Tg[4], kn = P0 ? P0[12] : Tg[12], reach = rig.rd && rig.rd.armL ? rig.rd.armL : 0.56 * rig.scale;
      _gb.set(Tg[0].x - rx * 0.3 * rig.scale + fx * 0.12, 0.04, Tg[0].z - rz * 0.3 * rig.scale + fz * 0.12);
      if (_gb.distanceTo(sh) > reach * 0.98) _gb.set(kn.x + fx * 0.03, kn.y + 0.07 * rig.scale, kn.z + fz * 0.03);
      Tg[10].lerp(_gb, rig.braceW);
    }
    else if (g && rig.gunSupport && rig.gunAimW > 0.05) Tg[10].lerp(rig.gunSupport, rig.gunAimW);
    let rd = rig.rd;
    if (!rd || rd.P[0].distanceTo(Tg[0]) > 1.2 * rig.scale) { // first time near, or they've jumped (a snap): start at the pose, still
      ragdollInit(rig, null); rd = rig.rd;
      rd.P.forEach((p, i) => p.copy(Tg[i])); rd.prev = Tg.map((p) => p.clone()); rd.Tprev = Tg.map((p) => p.clone());
      rd.rigid = RIGID.map(([a, b]) => [a, b, Tg[a].distanceTo(Tg[b])]); rd.min = MIN.map(([a, b, f]) => [a, b, Tg[a].distanceTo(Tg[b]) * f]);
    }
    if (rig.effPh == null) rig.effPh = Math.random() * 6.3;
    if (rd.armL == null) { const len = (a, b) => rd.rigid.find((r) => r[0] === a && r[1] === b)[2]; rd.armL = len(4, 8) + len(8, 10); } // (the left arm, straight)
    rig.effT = (rig.effT || 0) + dt;
    // weak, the legs strain: efforts to stand that come and go (and fade with the strength behind them)
    const m = str >= 0.6 ? str : str * (0.7 + 0.7 * Math.max(0, Math.sin(rig.effT * 2.4 + rig.effPh)));
    const fwd = new T.Vector3(-Math.sin(rig.root.rotation.y), 0, -Math.cos(rig.root.rotation.y));
    // unsteady: the body the muscles are trying to hold drifts about over the feet (a stagger, a sway), more the
    // weaker they are
    const sway = G.U.clamp((0.75 - str) / 0.55, 0, 1);
    if (sway > 0) {
      const t = rig.effT, a = 0.13 * sway * rig.scale, sx = Math.sin(t * 1.3 + rig.effPh) + 0.5 * Math.sin(t * 2.9 + rig.effPh * 2), sz = Math.cos(t * 0.9 + rig.effPh * 3) + 0.5 * Math.sin(t * 2.3);
      for (const [i, k] of [[0, 0.4], [1, 0.4], [2, 0.4], [3, 0.9], [4, 0.9], [5, 0.9], [6, 1], [7, 1.1], [8, 0.9], [9, 0.9], [10, 0.9], [11, 0.9]]) { Tg[i].x += sx * a * k; Tg[i].z += sz * a * k; }
    }
    const steps = Math.max(1, Math.min(3, Math.round(dt * 60)));
    for (let s = 0; s < steps; s++) {
      const f = (s + 1) / steps;
      rd.drive = {
        T: Tg.map((t, i) => rd.Tprev[i].clone().lerp(t, f)), Tv: Tg.map((t, i) => t.clone().sub(rd.Tprev[i]).multiplyScalar(1 / steps)),
        kp: 0.4 * Math.pow(m, 1.6), kv: Math.min(0.9, 0.9 * Math.pow(m, 1.6)), // spring to the pose, damper to its motion
        trem: str < 0.5 ? (0.5 - str) * 0.006 : 0, // trembling legs
        fall: str < COLLAPSE ? fwd : null, // going down: folding forward over the knees
        // the bracing arm: held straight and firm (it takes little strength to lean on a locked arm)
        kpI: rig.braceW > 0.02 ? KPI_BRACE.map((k) => 1 + (k - 1) * rig.braceW) : null,
        brace: rig.braceW > 0.3 ? rd.armL * 0.93 : 0,
        self: m < 0.45, // (strong, the muscles keep the limbs apart; weak, they can tangle, so check)
      };
      rd.asleep = false; rd.still = 0;
      ragdollStep(rig, dt / steps);
    }
    rd.drive = null;
    rd.Tprev = Tg;
    ragdollPose(rig);
    // the gun moves with the right forearm: by exactly what the forearm moved from its animated pose (none at
    // full strength; weak, it sags and swings with the hand; down, it hangs from it)
    if (g) {
      _gm.copy(rig.armR.lo.matrixWorld).multiply(_gl.copy(loAnim).invert()).multiply(gunAnim); // the gun's world pose now
      _gl.copy(g.parent.matrixWorld).invert().multiply(_gm).decompose(_gp, _gq, _gs);
      g.position.copy(_gp); g.quaternion.copy(_gq); g.scale.copy(_gs);
      g.updateMatrixWorld(true);
      // Aiming: the arms hold the gun on what they're shooting at, as hard as they still can. Strong, it's
      // dead on; weakening, it's held toward you but sags; down on the floor it's half raised. (Only for a
      // target roughly in front of them: one off to the side, they're still turning to it.)
      let aw = 0;
      if (aimAt) {
        const tx = aimAt.x - rig.root.position.x, tz = aimAt.z - rig.root.position.z, tl = Math.hypot(tx, tz) || 1;
        const facing = G.U.clamp(((tx * -Math.sin(rig.root.rotation.y) + tz * -Math.cos(rig.root.rotation.y)) / tl - 0.5) / 0.3, 0, 1);
        aw = facing;
      }
      const sag = (1 - G.U.clamp(str / 0.6, 0, 1)) * 45 * D2R; // how far off it's left: as much as the arms can't hold
      rig.gunAimW = (rig.gunAimW || 0) + (aw - (rig.gunAimW || 0)) * Math.min(1, dt * 6);
      if (rig.gunAimW > 0.01 && aimAt) {
        const gi = rig.gunInfo, grip = g.localToWorld(_ga.set(gi.grip[2], gi.grip[1], -gi.grip[0]));
        const f = _gf.set(0, 0, -1).transformDirection(g.matrixWorld), want = _gw.subVectors(aimAt, grip).normalize();
        const off = Math.acos(G.U.clamp(f.dot(want), -1, 1)), turn = Math.max(0, off - sag) * rig.gunAimW;
        _gq.setFromUnitVectors(f, want); if (off > 1e-4) _gq.slerp(_gI, 1 - turn / off);
        // turn the gun about the grip: its world pose = T(grip) R T(-grip) pose
        _gm.makeTranslation(-grip.x, -grip.y, -grip.z).premultiply(_gl.makeRotationFromQuaternion(_gq)).premultiply(_gr.makeTranslation(grip.x, grip.y, grip.z)).multiply(g.matrixWorld);
        _gl.copy(g.parent.matrixWorld).invert().multiply(_gm).decompose(_gp, _gq, _gs);
        g.position.copy(_gp); g.quaternion.copy(_gq); g.scale.copy(_gs);
        g.updateMatrixWorld(true);
      }
      // Held in a hand, the right way up: it can roll at most 25 degrees off level about its bore (a forearm
      // twisting in the simulation doesn't turn it over)
      {
        const gi = rig.gunInfo, grip = g.localToWorld(_ga.set(gi.grip[2], gi.grip[1], -gi.grip[0]));
        const b = _gf.set(0, 0, -1).transformDirection(g.matrixWorld), up = _gw.set(0, 1, 0).transformDirection(g.matrixWorld);
        const lv = _gb.set(0, 1, 0).addScaledVector(b, -b.y);
        if (lv.lengthSq() > 0.01) {
          lv.normalize();
          const roll = Math.atan2(_gc.crossVectors(up, lv).dot(b), up.dot(lv)), lim = 25 * D2R;
          if (Math.abs(roll) > lim) {
            _gq.setFromAxisAngle(b, roll - Math.sign(roll) * lim);
            _gm.makeTranslation(-grip.x, -grip.y, -grip.z).premultiply(_gl.makeRotationFromQuaternion(_gq)).premultiply(_gr.makeTranslation(grip.x, grip.y, grip.z)).multiply(g.matrixWorld);
            _gl.copy(g.parent.matrixWorld).invert().multiply(_gm).decompose(_gp, _gq, _gs);
            g.position.copy(_gp); g.quaternion.copy(_gq); g.scale.copy(_gs);
            g.updateMatrixWorld(true);
          }
        }
      }
      // the last shots' kick: the muzzle up, about the grip, coming back as fast as the arms can bring it
      if (rig.gunKick > 1e-4) {
        const gi = rig.gunInfo, grip = g.localToWorld(_ga.set(gi.grip[2], gi.grip[1], -gi.grip[0]));
        const ax = _gf.set(1, 0, 0).transformDirection(g.matrixWorld);
        _gq.setFromAxisAngle(ax, rig.gunKick);
        _gm.makeTranslation(-grip.x, -grip.y, -grip.z).premultiply(_gl.makeRotationFromQuaternion(_gq)).premultiply(_gr.makeTranslation(grip.x, grip.y, grip.z)).multiply(g.matrixWorld);
        _gl.copy(g.parent.matrixWorld).invert().multiply(_gm).decompose(_gp, _gq, _gs);
        g.position.copy(_gp); g.quaternion.copy(_gq); g.scale.copy(_gs);
        g.updateMatrixWorld(true);
        rig.gunKick *= Math.exp(-(str >= TWO_HAND ? 7 : 4) * (0.4 + 0.6 * G.U.clamp(str / 0.6, 0, 1)) * dt); // (as js/server.js kickBack)
      }
      // and never through the floor (down on the ground, the hand rests on it instead)
      if (str < 0.4) {
        const low = _gbox.setFromObject(g).min.y;
        const fl = rig.root.position.y + 0.01; // (the floor they're on)
        if (low < fl) { _gp.set(0, fl - low, 0); g.parent.getWorldQuaternion(_gq).invert(); g.position.add(_gp.applyQuaternion(_gq).divideScalar(g.parent.getWorldScale(_gs).x)); g.updateMatrixWorld(true); }
      }
      // where the support hand should be on it (next frame, the left hand reaches for it there)
      const gi = rig.gunInfo;
      rig.gunSupport = gi && !gi.pistol ? g.localToWorld((rig.gunSupport || new T.Vector3()).set(gi.support[2] - 0.01, gi.support[1], -gi.support[0])) : null;
    } else rig.gunSupport = null;
  }
  const _gbox = new T.Box3(), _gc = new T.Vector3(), _ga = new T.Vector3(), _gf = new T.Vector3(), _gw = new T.Vector3(), _gI = new T.Quaternion(), _gr = new T.Matrix4();

  // ---------------------------------------------------------------- ragdoll
  // On death the skeleton goes limp: Verlet particles at the joints, held together by distance constraints,
  // fall under gravity onto the floor and the level's boxes (walls, doors, furniture), and the bones are
  // posed from the particles every frame. Secured bodies are rolled face down with the wrists behind the back.
  //   0 pelvis 1 hipL 2 hipR 3 chest 4 shL 5 shR 6 neck 7 head 8 elL 9 elR 10 haL 11 haR 12 knL 13 knR 14 ftL 15 ftR
  const RAD = [0.13, 0.08, 0.08, 0.14, 0.07, 0.07, 0.06, 0.12, 0.05, 0.05, 0.05, 0.05, 0.06, 0.06, 0.05, 0.05];
  const RIGID = [[0, 1], [0, 2], [1, 2], [3, 4], [3, 5], [4, 5], [3, 6], [4, 6], [5, 6], [0, 3], [1, 4], [2, 5], [6, 7], [3, 7],
    [4, 8], [8, 10], [5, 9], [9, 11], [1, 12], [12, 14], [2, 13], [13, 15]];
  // [a, b, fraction of rest length they can't get closer than]: stops the spine, neck and limbs folding flat
  const MIN = [[1, 5, 0.85], [2, 4, 0.85], [0, 6, 0.92], [4, 7, 0.9], [5, 7, 0.9], [4, 10, 0.45], [5, 11, 0.45], [1, 14, 0.6], [2, 15, 0.6], [0, 7, 0.9]];
  const GRAV = 9.8;
  // Joints aren't free: each has a range, the body has a twist limit, limbs are capsules that can't pass
  // through the torso or each other, and every joint has some friction (relative motion across a bone is
  // damped), so a limb swings and stops rather than spinning loose.
  //   cones: [joint, child, axis (in the torso frame: x right, y up the spine, z out of the back), half-angle]
  const D2R = Math.PI / 180;
  const CONES = [
    // hips: centred down and 45 deg forward, 70 deg either way (flex to ~115, extend to ~25 behind)
    [1, 12, [-0.15, -Math.cos(45 * D2R), -Math.sin(45 * D2R)], 70], [2, 13, [0.15, -Math.cos(45 * D2R), -Math.sin(45 * D2R)], 70],
    // shoulders: wide, centred down, out and a little forward
    [4, 8, [-0.55, -0.7, -0.3], 105], [5, 9, [0.55, -0.7, -0.3], 105],
  ];
  // capsules [a, b, radius] by name, and the pairs that mustn't overlap ([x, y, ignore near the root of x])
  const CAPS = { B1: [0, 3, 0.13], B2: [3, 6, 0.11], HD: [7, 7, 0.11], UL: [4, 8, 0.05], UR: [5, 9, 0.05], FL: [8, 10, 0.045], FR: [9, 11, 0.045],
    TL: [1, 12, 0.07], TR: [2, 13, 0.07], SL: [12, 14, 0.055], SR: [13, 15, 0.055] };
  const SELF = [['FL', 'B1'], ['FR', 'B1'], ['FL', 'B2'], ['FR', 'B2'], ['FL', 'FR'], ['FL', 'TL'], ['FL', 'TR'], ['FR', 'TL'], ['FR', 'TR'],
    ['FL', 'UR'], ['FR', 'UL'], ['UL', 'B1', 0.35], ['UR', 'B1', 0.35], ['UL', 'UR', 0.3], ['SL', 'SR'], ['SL', 'TR'], ['SR', 'TL'], ['TL', 'TR', 0.3],
    ['SL', 'B1'], ['SR', 'B1'], ['TL', 'SR'], ['FL', 'SL'], ['FL', 'SR'], ['FR', 'SL'], ['FR', 'SR'], ['FL', 'HD'], ['FR', 'HD'], ['SL', 'HD'], ['SR', 'HD'],
    ['UL', 'TL', 0.3], ['UR', 'TR', 0.3], ['UL', 'TR'], ['UR', 'TL']];
  const _s1 = new T.Vector3(), _s2 = new T.Vector3(), _sr = new T.Vector3(), _c1 = new T.Vector3(), _c2 = new T.Vector3(), _n = new T.Vector3();
  // closest points between segments p1-q1 and p2-q2: [s, t] along each
  function closest(p1, q1, p2, q2) {
    _s1.subVectors(q1, p1); _s2.subVectors(q2, p2); _sr.subVectors(p1, p2);
    const a = _s1.dot(_s1), e = _s2.dot(_s2), f = _s2.dot(_sr), c = _s1.dot(_sr), b = _s1.dot(_s2), den = a * e - b * b;
    if (a < 1e-9 && e < 1e-9) return [0, 0];
    if (a < 1e-9) return [0, G.U.clamp(f / e, 0, 1)];
    if (e < 1e-9) return [G.U.clamp(-c / a, 0, 1), 0];
    let s = den > 1e-9 ? G.U.clamp((b * f - c * e) / den, 0, 1) : 0, t = (b * s + f) / e;
    if (t < 0) { t = 0; s = G.U.clamp(-c / a, 0, 1); } else if (t > 1) { t = 1; s = G.U.clamp((b - c) / a, 0, 1); }
    return [s, t];
  }
  // Push two capsules apart, splitting the correction over each one's ends by where they touch (equal and
  // opposite, so the body as a whole isn't shoved), at most a couple of centimetres a pass.
  function separate(P, A, B, skip, sc) {
    const [s, t] = closest(P[A[0]], P[A[1]], P[B[0]], P[B[1]]);
    if (skip && s < skip) return;
    _c1.copy(P[A[0]]).lerp(P[A[1]], s); _c2.copy(P[B[0]]).lerp(P[B[1]], t);
    _n.subVectors(_c1, _c2);
    const d = _n.length(), pen = (A[2] + B[2]) * sc - d;
    if (pen <= 0 || d < 1e-6) return;
    _n.multiplyScalar(Math.min(pen, 0.02) * 0.5 / d);
    const wa = 1 / ((1 - s) * (1 - s) + s * s), wb = 1 / ((1 - t) * (1 - t) + t * t);
    const mv = (i, f) => P[i].addScaledVector(_n, f);
    if (A[0] === A[1]) mv(A[0], 1); else { mv(A[0], (1 - s) * wa); mv(A[1], s * wa); }
    if (B[0] === B[1]) mv(B[0], -1); else { mv(B[0], -(1 - t) * wb); mv(B[1], -t * wb); }
  }
  // Keep P[b] within `max` of `axis` as seen from P[a]. The correction is shared: the limb moves toward the
  // range and the joint the other way by as much (so it can't add momentum and send the body skating off),
  // and it's capped per pass (a limb far outside its range comes back over a few steps, not in one jerk).
  const CONE_STEP = 0.025;
  function cone(P, a, b, axis, max, k = 0.6) {
    _a.subVectors(P[b], P[a]);
    const len = _a.length();
    if (len < 1e-6) return;
    const cos = _a.dot(axis) / len, cmax = Math.cos(max);
    if (cos >= cmax) return;
    _b.copy(_a).addScaledVector(axis, -_a.dot(axis));
    if (_b.lengthSq() < 1e-9) _b.set(axis.y, -axis.x, 0); // straight opposite: pick any side
    _b.normalize().multiplyScalar(Math.sin(max) * len).addScaledVector(axis, cmax * len).add(P[a]);
    _b.sub(P[b]).multiplyScalar(k);
    const l = _b.length();
    if (l > CONE_STEP) _b.multiplyScalar(CONE_STEP / l);
    _b.multiplyScalar(0.5);
    P[b].add(_b); P[a].sub(_b);
  }
  const _ay = new T.Vector3(), _t1 = new T.Vector3(), _t2 = new T.Vector3(), _t3 = new T.Vector3();
  function ragdollInit(rig, dir) {
    const { root, hips, chest, neck, head, armL, armR, legL, legR } = rig;
    root.updateMatrixWorld(true);
    const w = (o, x = 0, y = 0, z = 0) => o.localToWorld(new T.Vector3(x, y, z));
    const P = [w(hips), w(legL.th), w(legR.th), w(chest, 0, 0.14, 0), w(armL.up), w(armR.up), w(neck), w(head, 0, 0.1, 0),
      w(armL.lo), w(armR.lo), w(armL.lo, 0, -FARM, 0), w(armR.lo, 0, -FARM, 0), w(legL.sh), w(legR.sh), w(legL.sh, 0, -SHIN, 0), w(legR.sh, 0, -SHIN, 0)];
    const s = rig.scale, dt = 1 / 60;
    // initial motion: whatever the body was doing, plus the shot shoving the upper body
    const v = rig.vel.clone().setY(0);
    const push = dir ? dir.clone().setY(0).normalize() : new T.Vector3(Math.random() - 0.5, 0, Math.random() - 0.5).normalize();
    const kick = [1, 0.4, 0.4, 2.2, 2, 2, 2.4, 2.6, 1.6, 1.6, 1.4, 1.4, -0.4, -0.4, -0.6, -0.6];
    const prev = P.map((p, i) => p.clone().sub(v.clone().multiplyScalar(0.6).addScaledVector(push, kick[i] * (0.3 + Math.random() * 0.15)).multiplyScalar(dt)));
    // knees give first: a nudge forward and down so the legs fold instead of toppling like a plank
    const fwd = new T.Vector3(-Math.sin(root.rotation.y), 0, -Math.cos(root.rotation.y));
    for (const k of [12, 13]) { prev[k].addScaledVector(fwd, -0.02); prev[k].y += 0.01; }
    const rest = (a, b) => P[a].distanceTo(P[b]);
    rig.rd = {
      P, prev, r: RAD.map((r) => r * s), still: 0, asleep: false, roll: null,
      rigid: RIGID.map(([a, b]) => [a, b, rest(a, b)]),
      topple: push.clone(), // the way the upper body goes over (the way the shot was travelling)
      min: MIN.map(([a, b, f]) => [a, b, rest(a, b) * f]),
    };
    rig.body.rotation.set(0, 0, 0); rig.body.position.set(0, 0, 0);
  }
  function relax(P, a, b, d, onlyMin) {
    const pa = P[a], pb = P[b];
    _a.subVectors(pb, pa);
    const len = _a.length() || 1e-6;
    if (onlyMin && len >= d) return;
    const k = ((len - d) / len) * 0.5;
    pa.addScaledVector(_a, k); pb.addScaledVector(_a, -k);
  }
  // Contacts are inelastic: pushing a joint out of the floor or a box also cancels its velocity into it, so
  // bodies land with a dead weight instead of springing back up.
  function collide(rd, i) {
    const p = rd.P[i], q = rd.prev[i], r = rd.r[i], L = G.Level, map = G.Game && G.Game.map;
    if (map && map.world) { // out of whatever solid it's in (the world's: any floor, a step, a sofa), the shallowest way
      G.World.query(map.world, [p.x - r, p.y - r, p.z - r], [p.x + r, p.y + r, p.z + r], (s) => {
        if (!s.move) return;
        const xl = p.x + r - s.min[0], xh = s.max[0] - (p.x - r), yl = p.y + r - s.min[1], yh = s.max[1] - (p.y - r), zl = p.z + r - s.min[2], zh = s.max[2] - (p.z - r);
        const ox = Math.min(xl, xh), oy = Math.min(yl, yh), oz = Math.min(zl, zh);
        if (ox <= 0 || oy <= 0 || oz <= 0) return;
        // resting on top of it wins for anything low (bodies can end up across a sofa, or down a flight of stairs)
        if (yh <= yl && (yh < ox && yh < oz || s.max[1] - s.min[1] < 1.4 && yh < 0.5)) { p.y += yh; q.y = Math.max(q.y, p.y); }
        else if (oy < ox && oy < oz) { p.y -= yl; q.y = Math.min(q.y, p.y); }
        else if (ox < oz) { p.x += xh < xl ? xh : -xl; q.x = p.x; } else { p.z += zh < zl ? zh : -zl; q.z = p.z; }
      });
      return;
    }
    if (p.y < r) { p.y = r; if (q.y < r) q.y = r; }
    if (!map) return;
    const tx = Math.floor(p.x / L.TS), tz = Math.floor(p.z / L.TS);
    for (let oz = -1; oz <= 1; oz++) for (let ox = -1; ox <= 1; ox++) for (const b of L.boxesAt(map, tx + ox, tz + oz)) {
      if (p.y - r > b.h || p.y + r < b.y0) continue;
      const dx = p.x - b.cx, dz = p.z - b.cz, px = b.hx + r - Math.abs(dx), pz = b.hz + r - Math.abs(dz);
      if (px <= 0 || pz <= 0) continue;
      const up = b.h + r - p.y; // or rest on top of it (bodies can end up across a sofa)
      if (b.h < 1.4 && up < px && up < pz) { p.y += up; q.y = Math.max(q.y, p.y); }
      else if (px < pz) { p.x += Math.sign(dx || 1) * px; q.x = p.x; } else { p.z += Math.sign(dz || 1) * pz; q.z = p.z; }
    }
  }
  // torso frame from the particles: x to the right, y up the spine, z out of the back
  function torsoFrame(P) {
    const x = new T.Vector3().subVectors(P[5], P[4]).normalize(), y = new T.Vector3().subVectors(P[6], P[0]).normalize();
    const z = new T.Vector3().crossVectors(x, y).normalize();
    return { x, y: new T.Vector3().crossVectors(z, x), z };
  }
  function ragdollStep(rig, dt) {
    const rd = rig.rd, P = rd.P, prev = rd.prev;
    if (rd.roll) { // rolling the body face down to secure it
      const ro = rd.roll;
      if (!ro.driven) ro.t = Math.min(1, ro.t + dt / 0.5);
      const q = new T.Quaternion().setFromAxisAngle(ro.axis, ro.angle * G.U.smooth(0, 1, ro.t));
      let sink = 0;
      P.forEach((p, i) => { p.copy(ro.base[i]).sub(ro.pivot).applyQuaternion(q).add(ro.pivot); sink = Math.max(sink, rd.r[i] - p.y); });
      const up = Math.max(0, sink) + ro.lift * Math.sin(Math.PI * ro.t); // nothing passes through the floor
      P.forEach((p, i) => { p.y += up; prev[i].copy(p); });
      if (ro.t >= 1 && !ro.driven) { rd.roll = null; rd.asleep = false; rd.still = 0; rd.calm = 0.8; rd.pinT = 0; }
      return;
    }
    if (rd.asleep) return;
    const h = Math.min(dt, 1 / 30), h2 = h * h;
    // A clean fall: while the spine is still upright, the chest, shoulders and head are pulled over the way
    // the body's going, so it ends up lying down rather than balanced on its knees or sitting up.
    const upright = _a.subVectors(P[6], P[0]).normalize().y;
    if (upright > 0.3 && rig.deadT < 3 && rd.topple && !rd.handled && !rig.zipped) {
      const acc = 9 * upright * h2;
      for (const i of [3, 4, 5, 6, 7]) P[i].addScaledVector(rd.topple, acc);
    }
    const down = upright < 0.5; // lying, more or less
    for (let i = 0; i < P.length; i++) {
      const p = P[i], q = prev[i];
      let k = rd.calm > 0 ? 0.85 : rig.deadT > 2.5 ? 0.8 : 0.975; // damping (heavier while settling after being moved, and once it's been down a while)
      if (down && p.y <= rd.r[i] + 0.02) k = Math.min(k, 0.88); // down on the floor: it stops, it doesn't bounce about
      const vx = (p.x - q.x) * k, vy = (p.y - q.y) * k, vz = (p.z - q.z) * k;
      q.copy(p);
      p.x += vx; p.y += vy - GRAV * h2; p.z += vz;
    }
    // a living body's muscles (powerStep): toward the animated pose, at its speed
    const D = rd.drive;
    if (D) {
      for (let i = 0; i < P.length; i++) {
        const p = P[i], q = prev[i], t = D.T[i], tv = D.Tv[i], ki = D.kpI ? D.kpI[i] : 1, kp = Math.min(0.5, D.kp * ki), kv = Math.min(0.9, D.kv * ki);
        let vx = p.x - q.x, vy = p.y - q.y, vz = p.z - q.z;
        vx += (tv.x - vx) * kv; vy += (tv.y - vy) * kv; vz += (tv.z - vz) * kv;
        p.x += (t.x - p.x) * kp; p.y += (t.y - p.y) * kp; p.z += (t.z - p.z) * kp;
        q.set(p.x - vx, p.y - vy, p.z - vz);
      }
      if (D.trem) for (const i of [0, 12, 13]) { P[i].x += (Math.random() - 0.5) * D.trem; P[i].z += (Math.random() - 0.5) * D.trem; }
      if (D.fall && _a.subVectors(P[6], P[0]).normalize().y > 0.25) for (const i of [3, 4, 5, 6, 7]) P[i].addScaledVector(D.fall, 3 * h2);
    }
    // joint friction: across each bone, some of the relative motion is lost every step
    for (const [a, b] of rd.rigid) {
      const pa = P[a], pb = P[b], qa = prev[a], qb = prev[b];
      _c.subVectors(pa, qa); _d.subVectors(pb, qb); // this step's motion
      _e.addVectors(_c, _d).multiplyScalar(0.5);
      const f = 0.2; // stiff enough that limbs follow the body down instead of flailing
      qa.copy(pa).sub(_c.lerp(_e, f)); qb.copy(pb).sub(_d.lerp(_e, f));
    }
    // secured: wrists pulled together at the small of the back
    let wrist = null;
    if (rd.calm > 0) rd.calm -= h;
    rd.pinT = (rd.pinT || 0) + h;
    rd.keepPin = Math.max(0, (rd.keepPin || 0) - h);
    let pin = 0; // wrists drawn together over a moment, not snapped
    if (rig.zipped) pin = 0.5 * Math.min(1, rd.pinT / 0.6);
    else if (rd.handled && !rd.roll) pin = 0.5 * G.U.smooth(0.42, 0.62, rd.handled.t); // pulled behind the back
    else if (rd.keepPin > 0) pin = 0.5; // tie done, waiting for the host to confirm it
    if (pin > 0) { const f = torsoFrame(P); wrist = P[0].clone().addScaledVector(f.z, 0.16 * rig.scale).addScaledVector(f.y, 0.12 * rig.scale); }
    const iters = D ? 4 : 8, self = !D || D.self; // (a strong living body: fewer passes, no tangling to check)
    for (let it = 0; it < iters; it++) {
      for (const [a, b, d] of rd.rigid) relax(P, a, b, d, false);
      for (const [a, b, d] of rd.min) relax(P, a, b, d, true);
      if (D && D.brace) relax(P, 4, 10, D.brace, true); // a locked arm holds the shoulder off the hand on the floor
      // hinges: knees bend forward, elbows bend back
      const f = torsoFrame(P);
      for (const [hp, kn, ft] of [[1, 12, 14], [2, 13, 15]]) {
        const off = _a.subVectors(P[kn], _b.addVectors(P[hp], P[ft]).multiplyScalar(0.5)).dot(f.z);
        if (off > 0) P[kn].addScaledVector(f.z, -off);
      }
      for (const [sh, el, ha] of [[4, 8, 10], [5, 9, 11]]) {
        const off = _a.subVectors(P[el], _b.addVectors(P[sh], P[ha]).multiplyScalar(0.5)).dot(f.z);
        if (off < 0) P[el].addScaledVector(f.z, -off);
      }
      // ball joints within their range (hips, shoulders), in the torso's frame
      for (const [j, c, ax, deg] of CONES) {
        _ay.set(0, 0, 0).addScaledVector(f.x, ax[0]).addScaledVector(f.y, ax[1]).addScaledVector(f.z, ax[2]).normalize();
        cone(P, j, c, _ay, deg * D2R);
      }
      // the spine bends so far (neck on chest 35 deg, head on neck 45 deg)
      _ay.subVectors(P[3], P[0]).normalize(); cone(P, 3, 6, _ay, 35 * D2R);
      _ay.subVectors(P[6], P[3]).normalize(); cone(P, 6, 7, _ay, 45 * D2R);
      // and twists so far: the shoulders turn at most 45 deg on the hips
      {
        const up = f.y;
        _a.subVectors(P[2], P[1]).addScaledVector(up, -_a.dot(up));
        _b.subVectors(P[5], P[4]); _b.addScaledVector(up, -_b.dot(up));
        const la = _a.length(), lb = _b.length();
        if (la > 1e-4 && lb > 1e-4) {
          const tw = Math.atan2(_c.crossVectors(_a, _b).dot(up), _a.dot(_b)), lim = 45 * D2R;
          if (Math.abs(tw) > lim) {
            // turn the shoulders and the hips half the excess each, about the spine
            const ex = (Math.abs(tw) - lim) * Math.sign(tw) * 0.5, mid = _d.addVectors(P[0], P[3]).multiplyScalar(0.5);
            const qs = _q2.setFromAxisAngle(up, -ex);
            for (const i of [4, 5]) P[i].sub(mid).applyQuaternion(qs).add(mid);
            qs.setFromAxisAngle(up, ex);
            for (const i of [1, 2]) P[i].sub(mid).applyQuaternion(qs).add(mid);
          }
        }
      }
      // limbs don't pass through the body or each other
      if (self) for (const [x, y, skip] of SELF) separate(P, CAPS[x], CAPS[y], skip, rig.scale);
      if (wrist) for (const [k, sd] of [[10, -1], [11, 1]]) P[k].lerp(_a.copy(wrist).addScaledVector(f.x, sd * 0.035 * rig.scale), pin);
      for (let i = 0; i < P.length; i++) collide(rd, i);
    }
    // a last pass of body-on-body, then the floor, so neither is left the loser
    for (let it = 0; it < 2; it++) { if (self) for (const [x, y, skip] of SELF) separate(P, CAPS[x], CAPS[y], skip, rig.scale); for (let i = 0; i < P.length; i++) collide(rd, i); }
    // friction against the floor; sleep once everything has come to rest
    let moved = 0;
    for (let i = 0; i < P.length; i++) {
      const p = P[i], q = prev[i];
      if (p.y <= rd.r[i] + 0.01) { q.x += (p.x - q.x) * 0.5; q.z += (p.z - q.z) * 0.5; } // heavy: drags, doesn't skate
      moved = Math.max(moved, p.distanceToSquared(q));
    }
    rd.still = moved < 4e-6 && (down || rig.deadT > 3) ? rd.still + 1 : 0;
    if (rd.still > 30 || (rig.deadT > (down ? 4.5 : 8) && !(rd.calm > 0) && !rd.handled && !rd.keepPin && !rig.zipped)) rd.asleep = true; // a body that's been down a while lies still
  }
  function setWorldQ(bone, q) { bone.parent.getWorldQuaternion(_q2).invert(); bone.quaternion.copy(_q2.multiply(q)); bone.updateMatrixWorld(true); }
  function frameQ(xv, yv) {
    const x = xv.clone().normalize(), z = new T.Vector3().crossVectors(x, yv).normalize(), y = new T.Vector3().crossVectors(z, x);
    _m.makeBasis(x, y, z); return new T.Quaternion().setFromRotationMatrix(_m);
  }
  function ragdollPose(rig) {
    const P = rig.rd.P, { root, body, hips, spine, chest, neck, head } = rig;
    root.updateMatrixWorld(true);
    hips.position.copy(body.worldToLocal(P[0].clone()));
    hips.updateMatrixWorld(true);
    const across = new T.Vector3().subVectors(P[2], P[1]);
    setWorldQ(hips, frameQ(across, new T.Vector3().subVectors(P[3], P[0])));
    spine.quaternion.identity();
    const shoulders = new T.Vector3().subVectors(P[5], P[4]);
    setWorldQ(chest, frameQ(shoulders, new T.Vector3().subVectors(P[6], P[3])));
    setWorldQ(neck, frameQ(shoulders, new T.Vector3().subVectors(P[7], P[6])));
    head.quaternion.identity();
    // A limb's roll about its own length: its hinge (knee, elbow) axis comes from the bend when it's bent,
    // turned to agree with the torso's left-right; nearly straight (no bend to go by) it's the torso's; and it
    // can't twist more than 50 deg away from that either way. (Without this a straight limb spins freely.)
    const ref = torsoFrame(P).x, TW = 50 * D2R;
    const sideFor = (dir, bend, w) => {
      const r = _t1.copy(ref).addScaledVector(dir, -ref.dot(dir));
      if (r.lengthSq() < 1e-6) r.set(dir.y, -dir.x, 0);
      r.normalize();
      const s = _t2.copy(bend).addScaledVector(dir, -bend.dot(dir));
      if (s.lengthSq() < 1e-8 || w <= 0) return r.clone();
      s.normalize();
      if (s.dot(r) < 0) s.negate();
      s.lerp(r, 1 - w).normalize();
      const ang = Math.atan2(_t3.crossVectors(r, s).dot(dir), r.dot(s));
      if (Math.abs(ang) <= TW) return s.clone();
      return r.clone().applyAxisAngle(dir, Math.sign(ang) * TW);
    };
    const limb = (up, lo, j, e) => {
      const a = up.getWorldPosition(new T.Vector3());
      const u = new T.Vector3().subVectors(P[j], a), l = new T.Vector3().subVectors(P[e], P[j]);
      const bend = new T.Vector3().crossVectors(u, l), sinB = bend.length() / Math.max(1e-6, u.length() * l.length());
      const w = G.U.smooth(0.08, 0.3, sinB); // how much there is to go on
      aimBone(up, a, P[j], sideFor(u.normalize(), bend, w));
      const lp = lo.getWorldPosition(new T.Vector3()); // where the lower bone actually starts once the upper is placed
      aimBone(lo, lp, P[e], sideFor(l.subVectors(P[e], lp).normalize(), bend, w));
    };
    limb(rig.armL.up, rig.armL.lo, 8, 10); limb(rig.armR.up, rig.armR.lo, 9, 11);
    limb(rig.legL.th, rig.legL.sh, 12, 14); limb(rig.legR.th, rig.legR.sh, 13, 15);
    root.updateMatrixWorld(true);
  }
  function animateDeath(rig, dt) {
    rig.deadT += dt;
    if (!rig.rd) ragdollInit(rig, null);
    ragdollStep(rig, dt);
    ragdollPose(rig);
    if (rig.dropped) dropGun(rig, dt);
  }
  // roll a body onto its front to zip-tie it (instant when it was secured before we saw it)
  // the turn that puts a body onto its front, about the line from hips to neck (null if it's already face down)
  function planRoll(rig) {
    const rd = rig.rd, P = rd.P, f = torsoFrame(P);
    const axis = new T.Vector3().subVectors(P[6], P[0]).setY(0);
    if (axis.lengthSq() < 1e-4) return null;
    axis.normalize();
    const zp = f.z.clone().addScaledVector(axis, -axis.dot(f.z)), up = UP.clone().addScaledVector(axis, -axis.dot(UP));
    const angle = Math.atan2(axis.dot(new T.Vector3().crossVectors(zp, up)), zp.dot(up));
    if (Math.abs(angle) < 0.6) return null; // already face down enough
    return { axis, angle, pivot: P[0].clone(), base: P.map((p) => p.clone()), t: 0, lift: 0.15 * rig.scale };
  }
  function rollFaceDown(rig, instant) {
    const rd = rig.rd; if (!rd) return;
    const handled = !!rd.handled || rd.keepPin > 0; // an officer already turned it over and held the wrists
    rd.handled = null; rd.keepPin = 0;
    rd.asleep = false; rd.still = 0; rd.calm = 0.8; rd.pinT = handled ? 1 : 0;
    if (rd.roll && rd.roll.driven) { rd.roll.driven = false; return; } // finish the turn that's under way
    const ro = planRoll(rig);
    if (!ro) return;
    ro.t = instant ? 1 : 0;
    rd.roll = ro;
    if (instant) ragdollStep(rig, 0);
  }
  function dropGun(rig, dt) {
    const d = rig.dropped, g = d.g, map = G.Game && G.Game.map;
    if (d.floor == null) d.floor = (map ? G.Level.groundAt(map, g.position.x, g.position.z, 0.05, g.position.y, 0.05) : 0) + 0.05; // (the floor it falls to: upstairs or down)
    if (g.position.y <= d.floor) return;
    d.vy -= 12 * dt;
    g.position.y = Math.max(d.floor, g.position.y + d.vy * dt);
    g.rotation.z += d.spin * dt;
    if (g.position.y <= d.floor) g.rotation.z = Math.PI / 2;
  }

  // ---------------------------------------------------------------- hitboxes
  // Zones: head, chest (heart, lungs), abdomen (liver, gut, spine), upper arm, forearm, thigh, shin. These capsules
  // are what a round is checked against first; what it does inside is worked out on the body's real shape, organ by
  // organ (js/ballistics.js).
  function hitboxes(rig) {
    if (!rig.hb) {
      const mk = (zone, r, side) => ({ zone, r, side, a: new T.Vector3(), b: new T.Vector3() });
      rig.hb = [mk('head', 0.135), mk('chest', 0.19), mk('abdomen', 0.16), mk('uarm', 0.06, 'L'), mk('farm', 0.055, 'L'), mk('uarm', 0.06, 'R'), mk('farm', 0.055, 'R'),
        mk('thigh', 0.09, 'L'), mk('shin', 0.07, 'L'), mk('thigh', 0.09, 'R'), mk('shin', 0.07, 'R')];
    }
    const s = rig.scale, h = rig.hb;
    const W = (o, x, y, z, out) => o.localToWorld(out.set(x, y, z));
    W(rig.head, 0, 0.1, -0.01, h[0].a); h[0].b.copy(h[0].a);                    // head (sphere)
    W(rig.chest, 0, 0.05, 0, h[1].a); W(rig.chest, 0, 0.135, 0, h[1].b);        // chest (its rounded top stops at the chin)
    W(rig.hips, 0, 0.0, 0, h[2].a); W(rig.spine, 0, 0.16, 0, h[2].b);           // abdomen / pelvis
    let i = 3;
    for (const arm of [rig.armL, rig.armR]) {
      W(arm.up, 0, 0, 0, h[i].a); W(arm.up, 0, -UARM, 0, h[i].b); i++;
      W(arm.lo, 0, 0, 0, h[i].a); W(arm.lo, 0, -FARM - 0.04, 0, h[i].b); i++;
    }
    for (const leg of [rig.legL, rig.legR]) {
      W(leg.th, 0, 0, 0, h[i].a); W(leg.th, 0, -THIGH, 0, h[i].b); i++;
      W(leg.sh, 0, 0, 0, h[i].a); W(leg.sh, 0, -SHIN - 0.03, 0, h[i].b); i++;
    }
    for (const b of h) b.rs = b.r * s;
    return h;
  }
  // Ray vs capsule (segment a-b, radius r); returns distance along the unit ray or -1.
  function rayCapsule(ro, rd, pa, pb, r) {
    const bax = pb.x - pa.x, bay = pb.y - pa.y, baz = pb.z - pa.z;
    const oax = ro.x - pa.x, oay = ro.y - pa.y, oaz = ro.z - pa.z;
    const baba = bax * bax + bay * bay + baz * baz;
    const bard = bax * rd.x + bay * rd.y + baz * rd.z;
    const baoa = bax * oax + bay * oay + baz * oaz;
    const rdoa = rd.x * oax + rd.y * oay + rd.z * oaz;
    const oaoa = oax * oax + oay * oay + oaz * oaz;
    if (baba > 1e-9) {
      const a = baba - bard * bard, b = baba * rdoa - baoa * bard, c = baba * oaoa - baoa * baoa - r * r * baba;
      const hh = b * b - a * c;
      if (hh >= 0 && a > 1e-9) {
        const t = (-b - Math.sqrt(hh)) / a, y = baoa + t * bard;
        if (y > 0 && y < baba) return t >= 0 ? t : -1;
      }
    }
    // end caps
    let best = -1;
    for (const p of [pa, pb]) {
      const ox = ro.x - p.x, oy = ro.y - p.y, oz = ro.z - p.z;
      const b = rd.x * ox + rd.y * oy + rd.z * oz, c = ox * ox + oy * oy + oz * oz - r * r, hh = b * b - c;
      if (hh > 0) { const t = -b - Math.sqrt(hh); if (t >= 0 && (best < 0 || t < best)) best = t; }
    }
    return best;
  }
  // Closest distance between the ray's line and the segment pa-pb: how near the round's path comes to the
  // middle of that body part.
  function rayAxisDist(ro, rd, pa, pb) {
    const vx = pb.x - pa.x, vy = pb.y - pa.y, vz = pb.z - pa.z, wx = ro.x - pa.x, wy = ro.y - pa.y, wz = ro.z - pa.z;
    const b = rd.x * vx + rd.y * vy + rd.z * vz, c = vx * vx + vy * vy + vz * vz, d = rd.x * wx + rd.y * wy + rd.z * wz, e = vx * wx + vy * wy + vz * wz;
    const D = c - b * b;
    let tc = c > 1e-9 ? (D > 1e-9 ? (e - b * d) / D : e / c) : 0;
    tc = Math.max(0, Math.min(1, tc));
    const sc = tc * b - d;
    return Math.hypot(wx + sc * rd.x - tc * vx, wy + sc * rd.y - tc * vy, wz + sc * rd.z - tc * vz);
  }
  // Nearest hit on a rig: { t, zone, c } or null. c: 0 when the round goes through the middle of the part,
  // 1 when it only grazes it.
  // up: where it struck, from -1 (bottom of the part) to 1 (top): a helmet only covers the top of the head.
  // A round that goes through an arm carries on into whatever's behind it: `behind` is the next part it hits
  // (an arm held across the chest doesn't stop a round reaching the chest).
  function raycast(rig, ro, rd, maxT) {
    const hits = [];
    for (const b of hitboxes(rig)) {
      const t = rayCapsule(ro, rd, b.a, b.b, b.rs);
      if (t >= 0 && t < maxT) hits.push({ t, zone: b.zone, b });
    }
    if (!hits.length) return null;
    hits.sort((p, q) => p.t - q.t);
    const fin = (h) => { h.c = Math.min(1, rayAxisDist(ro, rd, h.b.a, h.b.b) / h.b.rs); h.up = (ro.y + rd.y * h.t - h.b.a.y) / h.b.rs; h.side = h.b.side; delete h.b; return h; };
    const best = hits[0];
    if (best.zone === 'uarm' || best.zone === 'farm') { const nx = hits.find((h) => h.zone !== 'uarm' && h.zone !== 'farm'); if (nx) best.behind = fin(nx); }
    return fin(best);
  }

  // ---------------------------------------------------------------- debug view (?hitboxes or F9)
  const dbgMat = { head: new T.MeshBasicMaterial({ color: 0xff3030, wireframe: true }), chest: new T.MeshBasicMaterial({ color: 0xff8030, wireframe: true }), abdomen: new T.MeshBasicMaterial({ color: 0xffd030, wireframe: true }) };
  dbgMat.uarm = dbgMat.farm = new T.MeshBasicMaterial({ color: 0x30ff60, wireframe: true });
  dbgMat.thigh = dbgMat.shin = new T.MeshBasicMaterial({ color: 0x30a0ff, wireframe: true });
  function drawDebug(rig) {
    if (!debug) { if (rig.dbg) rig.dbg.forEach((m) => (m.visible = false)); return; }
    const h = hitboxes(rig);
    const parent = rig.root.parent;
    if (!parent) return;
    // bones are rigid, so each capsule is built once at its exact radius and length
    if (!rig.dbg) rig.dbg = h.map((b) => { const m = new T.Mesh(new T.CapsuleGeometry(b.rs, Math.max(0.001, b.a.distanceTo(b.b)), 3, 8), dbgMat[b.zone]); parent.add(m); return m; });
    h.forEach((b, i) => {
      const m = rig.dbg[i];
      m.visible = rig.state !== 'dead';
      m.position.addVectors(b.a, b.b).multiplyScalar(0.5);
      if (b.a.distanceToSquared(b.b) > 1e-8) m.quaternion.setFromUnitVectors(UP, _a.subVectors(b.b, b.a).normalize());
    });
  }

  // where an officer's hands are on someone being restrained: between the shoulder blades while they're shoved down,
  // then at the wrists (a body: a hand on the shoulder to turn it over, then at the wrists)
  function zipPoint(rig, t, living) {
    rig.root.updateMatrixWorld(true);
    const wr = rig.armL.tie.getWorldPosition(new THREE.Vector3()).add(rig.armR.tie.getWorldPosition(new THREE.Vector3())).multiplyScalar(0.5);
    if (!living) return rig.chest.localToWorld(new THREE.Vector3(0, 0.22, 0)).lerp(wr, G.U.smooth(0.38, 0.6, t));
    return rig.chest.localToWorld(new THREE.Vector3(0, 0.16, 0.14)).lerp(wr, G.U.smooth(0.42, 0.56, t));
  }
  // where someone lying (dead, or down for good) is: their ragdoll's hips, wherever it came to rest
  function bodyAt(rig) { return (rig.hips || rig.root).getWorldPosition(new THREE.Vector3()); }
  return {
    create, raycast, rayCapsule, OFFICER_LOOK, LOOKS, cleanLook, armourKit, zipPoint, bodyAt,
    get debug() { return debug; },
    toggleDebug() { debug = !debug; return debug; },
  };
})();
