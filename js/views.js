'use strict';
// Client-side representations of networked things: remote players, enemies, grenades.
// Characters are G.Rig skeletons; their hitboxes ride the animated bones (see js/rig.js).
G.Views = {
  players: new Map(),
  enemies: new Map(),
  nades: [],
  pings: [],
  evidence: new Map(), // id -> { mesh, wpn, x, z }
  laserBeep: 0,

  removeRig(rig) { G.R.dynRoot.remove(rig.root); rig.dispose(); },
  // Could any of them be in view from the camera: a look at their middle, head, feet and both sides (where the body is
  // drawn: the hips, wherever a fall's taken them), stopped only by walls, floors and ceilings. A look that starts in
  // one (the camera pressed to a wall) starts again past it.
  inSight(rig, at) {
    const map = G.Game.map, w = map && map.world, c = G.R.camera.position;
    if (!w) return true;
    const hp = rig.hips.getWorldPosition(this._sp || (this._sp = new THREE.Vector3())), y = at.y;
    if (Math.hypot(hp.x - c.x, hp.z - c.z) < 2.5) return true;
    const skip = this._occ || (this._occ = (s) => s.kind !== 'wall' && s.kind !== 'floor' && s.kind !== 'ceil' && s.kind !== 'lintel');
    const sx = -(hp.z - c.z), sz = hp.x - c.x, sl = Math.hypot(sx, sz) || 1; // (across the view)
    for (const [a, h] of [[0, 0.9], [0, 1.6], [0, 0.15], [-0.45, 1.0], [0.45, 1.0], [-0.45, 1.5], [0.45, 1.5]]) {
      const tx = hp.x + (sx / sl) * a, ty = y + h, tz = hp.z + (sz / sl) * a;
      let dx = tx - c.x, dy = ty - c.y, dz = tz - c.z;
      const d = Math.hypot(dx, dy, dz); dx /= d; dy /= d; dz /= d;
      let r = G.World.raycast(w, c.x, c.y, c.z, dx, dy, dz, d, { skip });
      if (r.t < 0.3) r = G.World.raycast(w, c.x + dx * 0.3, c.y + dy * 0.3, c.z + dz * 0.3, dx, dy, dz, d - 0.3, { skip }), r.t += 0.3;
      if (r.t >= d - 0.05) return true;
    }
    return G.Damage.seenThrough(map, c, hp); // (or down a hole shot through the wall)
  },
  // an officer's body: dressed as they picked, kit from their state (st.kt)
  newPlayerRig(info, id) {
    const rig = G.Rig.create({ style: 'tactical', color: info.color, animal: info.animal, callName: info.name, seed: id.length * 977, bare: true, look: info.look });
    rig.root.visible = false;
    G.R.dynRoot.add(rig.root);
    return rig;
  },
  // Your own body when you die: you don't have one in first person, so one is made, dressed as you are, and falls where you
  // were (what a teammate sees on their screen; now you see it too, from the camera on theirs)
  spawnSelfBody() {
    this.clearSelfBody();
    const me = G.Me, g = G.Game, wasDown = !!me.down;
    const rig = this.newPlayerRig({ color: g.myColor, animal: g.myAnimal, name: g.myName, look: g.myLook }, G.Net.myId || 'me');
    rig.setKit(me.kitLook());
    rig.setGun(me.cur().def.code, me.cur().stickers);
    rig.root.visible = true;
    const pos = me.pos.clone(), p = { pos, yaw: me.yaw, pitch: me.pitch, crouch: wasDown || !!me.crouch, alert: false, lean: 0, state: wasDown ? 'down' : 'alive' };
    for (let i = 0; i < 6; i++) rig.update(0.016, p); // (in the pose you were in, then down)
    rig.die(null);
    this.selfBody = { rig, pos, yaw: me.yaw };
  },
  clearSelfBody() { if (this.selfBody) { this.removeRig(this.selfBody.rig); this.selfBody = null; } },
  // a dead officer's body is a ragdoll where they fell (they come back whole next level)
  resetPlayerRig(pv) {
    this.removeRig(pv.rig);
    pv.rig = this.newPlayerRig(pv, pv.id);
    pv.dead = false; pv.first = true; pv.deadAt = null;
  },
  clearLevel() {
    this.vRounds = [];
    G.Casings.clear();
    G.Bolts.clear();
    if (this.pings2) { for (const q of this.pings2.values()) { G.R.dynRoot.remove(q.s); q.s.material.map.dispose(); q.s.material.dispose(); } this.pings2.clear(); }
    for (const ev of this.enemies.values()) this.removeRig(ev.rig);
    this.enemies.clear();
    for (const n of this.nades) G.R.dynRoot.remove(n.mesh);
    this.nades = [];
    this.pings = [];
    for (const v of this.evidence.values()) G.R.dynRoot.remove(v.mesh);
    this.evidence.clear();
    for (const pv of this.players.values()) { if (pv.dead) this.resetPlayerRig(pv); pv.st = null; pv.rig.root.visible = false; }
    this.clearSelfBody();
  },
  clearAll() {
    this.clearLevel();
    for (const pv of this.players.values()) this.removeRig(pv.rig);
    this.players.clear();
  },

  syncRoster(roster) {
    for (const [id, info] of Object.entries(roster)) {
      if (id === G.Net.myId) continue;
      let pv = this.players.get(id);
      if (pv && (pv.color !== info.color || pv.animal !== info.animal)) { this.removeRig(pv.rig); this.players.delete(id); pv = null; }
      if (!pv) {
        const rig = this.newPlayerRig(info, id); // (dressed as they picked, kit from st.kt)
        const tag = null; // (no nameplates over teammates' heads: you know them by their patches and kit)
        pv = { id, name: info.name, color: info.color, animal: info.animal, look: info.look, rig, tag, st: null, pos: new THREE.Vector3(), yaw: 0, pitch: 0, first: true };
        this.players.set(id, pv);
      }
      if (pv.name !== info.name) pv.rig.setCallsign(info.animal, info.name);
      pv.name = info.name;
    }
    for (const id of [...this.players.keys()]) if (!roster[id]) this.removePlayer(id);
  },
  removePlayer(id) {
    const pv = this.players.get(id);
    if (!pv) return;
    this.removeRig(pv.rig);
    this.players.delete(id);
  },

  applySnap(m) {
    if (!this.warmed) { this.warmed = true; G.Game.veilSay('Compiling shaders'); setTimeout(() => { G.R.warmup(); G.Game.veilN = 3; }, 60); } // (compile everything once the level's full, then a few frames drawn and the veil lifts: js/game.js veil. The wait: time to draw that line first)
    const seen = new Set();
    for (const [id, type, x, z, yaw, hp, aim, alert, crouch, lean, armed, scode, surp, door, kit, fl, str, y = 0] of m.e) {
      seen.add(id);
      let ev = this.enemies.get(id);
      if (!ev) {
        if (!G.ENEMIES[type]) continue;
        // the type, with this suspect's kit (weapon | vest | helmet | face | tac | what's mounted) laid over it
        const def = Object.create(G.ENEMIES[type]);
        if (kit) { const [wpn, vest, helmet, face, tac, ex] = kit.split('|'); def.wpn = wpn; def.vest = vest; def.helmet = helmet; def.face = face || 0; def.tac = +tac || 0; def.ex = ex ? ex.split(',') : []; }
        const rig = G.Rig.create({ style: def.style, scale: def.scale, boss: !!def.boss, seed: id * 7919 + 13, dressed: true });
        rig.powered = true; // a physically simulated body, held up by its muscles (js/rig.js powerStep)
        if (!def.civ) rig.setKit(G.Rig.armourKit(def.vest, def.helmet, def.style === 'armored', def.face, def.ex)); // their armour, as an officer's would look
        if (def.wpn && armed) { rig.setGun(def.wpn); rig.holster(armed === 1); this.tacOnGun(rig, def.tac); }
        G.R.dynRoot.add(rig.root);
        ev = { id, type, def, rig, tac: def.tac || 0, pos: new THREE.Vector3(x, y, z), tgt: new THREE.Vector3(x, y, z), yaw, tgtYaw: yaw, hp, alive: true, deadT: 0, lean: 0 };
        this.enemies.set(id, ev);
      }
      if (!ev.alive) continue;
      // health dropped from someone else's shot: flinch away from the nearest player
      if (hp < ev.hp && !ev.selfHit) {
        const src = this.nearestPlayer(ev.pos);
        if (src) ev.rig.hit(ev.pos.clone().sub(src).setY(0).normalize());
      }
      ev.selfHit = false;
      ev.tgt.set(x, y, z); ev.tgtYaw = yaw; ev.hp = hp; ev.aim = aim; ev.alert = alert; ev.crouch = !!crouch; ev.lean = lean || 0;
      ev.scode = scode || 0;
      ev.bleed = !!(fl & 1); ev.limp = !!(fl & 2); ev.reloading = !!(fl & 4); ev.down = !!(fl & 8); // wounds, reloads, down for good: from the host
      ev.str = str == null ? 1 : str / 100; // what blood loss leaves them to stand with (js/rig.js powered body)
      // weapon in hand follows the host: dropped on surrender, drawn again by a fake surrender
      if (!armed && ev.rig.gun) { ev.rig.dropGun(); this.discardDrop(ev.rig); }
      else if (armed && !ev.rig.gun && ev.def.wpn) ev.rig.setGun(ev.def.wpn);
      ev.armed = armed;
      if (ev.rig.gun) ev.rig.holster(armed === 1); // 1 = holstered/slung, 2 = in hand
      if (surp && !ev.surp) ev.rig.startle();
      ev.surp = !!surp;
      if (door && !ev.doorOn) ev.doorT = 0; // started opening a door
      ev.doorOn = !!door;
    }
    for (const ev of this.enemies.values()) if (ev.alive && !seen.has(ev.id)) this.kill({ e: ev.id });
    for (const [id, st] of Object.entries(m.p)) {
      if (id === G.Net.myId) continue;
      const pv = this.players.get(id);
      if (!pv) continue;
      pv.st = st;
      if (pv.first) { pv.pos.set(st.p[0], st.p[1], st.p[2]); pv.yaw = st.yw; pv.first = false; }
      if (st.kt) pv.rig.setKit(st.kt); // their helmet, carrier, belt, pack... as they're wearing them
    }
    G.Game.extract.active = !!m.x[0];
    G.Game.extract.votes = m.x[1] || 0; G.Game.extract.need = m.x[2] || 0; G.Game.extract.civDead = m.x[3] || 0;
    G.Game.extract.voted = (m.x[4] || []).includes(G.Net.myId);
    G.Game.unitsCleared = m.x[5] || 0;
    G.Game.enemiesLeft = m.n;
    G.Game.civsLeft = m.c || 0;
    G.Game.bodiesLeft = m.b || 0;
    G.Game.weaponsLeft = m.w || 0;
  },
  // world position of the closest living player (including you)
  nearestPlayer(p) {
    let best = null, bd = 1e9;
    if (G.Me.pos && !G.Me.dead && !G.Me.down) { bd = G.Me.pos.distanceTo(p); best = G.Me.pos; }
    for (const pv of this.players.values()) {
      if (!pv.st || pv.st.dd || pv.st.dn) continue;
      const d = pv.pos.distanceTo(p);
      if (d < bd) { bd = d; best = pv.pos; }
    }
    return best;
  },

  kill(m) {
    const ev = this.enemies.get(m.e);
    if (!ev || !ev.alive) return;
    ev.alive = false; ev.deadT = 0;
    let dir = ev.lastHitDir;
    if (!dir) {
      const killer = m.by && m.by !== G.Net.myId && this.players.get(m.by) ? this.players.get(m.by).pos : this.nearestPlayer(ev.pos);
      if (killer) dir = ev.pos.clone().sub(killer).setY(0).normalize();
    }
    ev.rig.die(dir);
    this.discardDrop(ev.rig);
    G.R.impact(new THREE.Vector3(ev.pos.x, 1.2 * ev.def.scale, ev.pos.z), null, 'blood');
  },

  // evidence is drawn from the host's record; the rig's own falling gun is discarded so there's one copy
  addEvidence(i, wpn, x, z, y = 0) {
    if (this.evidence.has(i)) return;
    const mesh = G.GunModels.world(wpn);
    mesh.position.set(x, y + 0.05, z);
    mesh.rotation.set(0, Math.random() * Math.PI * 2, Math.PI / 2); // lying on its side
    // a glowing yellow outline until it's bagged, seen through anything but walls and floors (G.R.render)
    mesh.userData.outline = this.addOutline(mesh);
    G.R.dynRoot.add(mesh);
    this.evidence.set(i, { mesh, wpn, x, y, z });
  },
  // Outline: the gun's silhouette marks the stencil, then three shells pushed out along the surface normals
  // by a fixed number of pixels draw only outside it: a bright line fading out in two softer bands. Each band
  // draws a pixel once (it marks the stencil as it goes), so overlapping triangles don't stack up.
  // (blue: the halo on what F would take: G.Views.setHalo)
  outlineMats(blue) {
    const key = blue ? '_haloMats' : '_outline';
    if (this[key]) return this[key];
    const vs = `uniform float px; uniform vec2 res;
      void main() {
        vec4 clip = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        vec2 d = (projectionMatrix * vec4(normalize(normalMatrix * normal), 0.0)).xy;
        float l = length(d);
        if (l > 1e-5) clip.xy += d / l * px * clip.w * 2.0 / res;
        gl_Position = clip;
      }`;
    const fs = 'uniform vec3 color; uniform float opacity; void main() { gl_FragColor = linearToOutputTexel(vec4(color, opacity)); }';
    const res = this._outRes || (this._outRes = { value: new THREE.Vector2(window.innerWidth, window.innerHeight) });
    const silhouette = new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false, fog: false,
      stencilWrite: true, stencilRef: 4, stencilFunc: THREE.AlwaysStencilFunc, stencilZPass: THREE.ReplaceStencilOp });
    // ref 3, 2, 1: each band draws where the stencil is still below its ref, then raises it
    const bands = [[3, 2.2, 1], [2, 5, 0.42], [1, 9, 0.16]].map(([ref, px, op], i) => {
      const m = new THREE.ShaderMaterial({ vertexShader: vs, fragmentShader: fs, transparent: true, depthWrite: false,
        uniforms: { px: { value: px }, res, color: { value: new THREE.Color(blue ? 0x3a9dff : 0xffc830) }, opacity: { value: op } },
        stencilWrite: true, stencilRef: ref, stencilFunc: THREE.GreaterStencilFunc, stencilZPass: THREE.ReplaceStencilOp });
      m.userData.base = op;
      m.userData.order = i + 1;
      return m;
    });
    return (this[key] = { silhouette, bands, res });
  },
  // the world model's merged meshes have flat (per-face) normals; the outline needs them averaged per corner
  // so the pushed-out shells stay closed
  smoothGeo(geo) {
    this._smooth = this._smooth || new WeakMap();
    let out = this._smooth.get(geo);
    if (out) return out;
    const pos = geo.attributes.position, nor = geo.attributes.normal, sum = new Map(), keys = [];
    for (let i = 0; i < pos.count; i++) {
      const k = `${Math.round(pos.getX(i) * 1e4)},${Math.round(pos.getY(i) * 1e4)},${Math.round(pos.getZ(i) * 1e4)}`;
      keys.push(k);
      const s = sum.get(k) || [0, 0, 0];
      s[0] += nor.getX(i); s[1] += nor.getY(i); s[2] += nor.getZ(i);
      sum.set(k, s);
    }
    const n = new Float32Array(pos.count * 3);
    keys.forEach((k, i) => { const s = sum.get(k), l = Math.hypot(s[0], s[1], s[2]) || 1; n[i * 3] = s[0] / l; n[i * 3 + 1] = s[1] / l; n[i * 3 + 2] = s[2] / l; });
    out = new THREE.BufferGeometry();
    out.setAttribute('position', pos);
    out.setAttribute('normal', new THREE.BufferAttribute(n, 3));
    if (geo.index) out.setIndex(geo.index);
    out.boundingSphere = geo.boundingSphere;
    this._smooth.set(geo, out);
    return out;
  },
  addOutline(mesh, blue) {
    const O = this.outlineMats(blue), parts = [], shells = [];
    // (every mesh in it, each outlined where it sits: a gun's, its magazine's, which is a group of its own: js/gunmodels.js world)
    mesh.traverse((o) => { if (o.geometry && !o.layers.isEnabled(2)) parts.push(o); });
    for (const part of parts) {
      const sil = new THREE.Mesh(part.geometry, O.silhouette);
      sil.layers.set(2); sil.frustumCulled = false;
      part.add(sil); shells.push(sil);
      const sg = this.smoothGeo(part.geometry);
      for (const m of O.bands) {
        const b = new THREE.Mesh(sg, m);
        b.layers.set(2); b.renderOrder = m.userData.order; b.frustumCulled = false;
        part.add(b); shells.push(b);
      }
    }
    return shells;
  },
  // A blue halo round what you'd take if you held F (obj: its mesh; null, nothing), in place of evidence's yellow while it's on
  setHalo(obj) {
    const was = this._haloOn || null;
    if (obj === was) return;
    const show = (o, on) => {
      for (const s of o.userData.halo) s.visible = on;
      for (const s of o.userData.outline || []) s.visible = !on;
    };
    if (was) show(was, false);
    if (obj) { if (!obj.userData.halo) obj.userData.halo = this.addOutline(obj, true); show(obj, true); }
    this._haloOn = obj;
  },
  // First aid cabinets: what's on the shelves (a box per stack, in its item's colour), and the door
  syncCabs() {
    const map = G.Game.map, cvs = map && map.cabViews, cabs = G.Game.cabs || [];
    if (!cvs) return;
    const COL = { bandage: 0xe8e2d0, pills: 0xe8c040, tourniquet: 0x2a2a2a, gauze: 0x4a7ab0, seal: 0xb03a3a, splint: 0xd27b4b, bloodbag: 0x7a0d12 };
    cvs.forEach((cv, i) => {
      const c = cabs[i], items = c ? c[1] : [];
      if (c && c[0] && cv.key === null) cv.open = 1; // joined with it already open
      cv.key = JSON.stringify(c || null);
      cv.slots.forEach((s, k) => { s.visible = k < items.length; if (s.visible) s.material.color.setHex(COL[items[k][0]] || 0xffffff); });
    });
  },
  // The weapon case's lid (what's in it is G.Loot's)
  syncCase() {
    const map = G.Game.map, cv = map && map.caseView;
    if (!cv || cv.synced) return;
    cv.synced = true;
    if (G.Game.caseOpen) cv.open = 1; // joined with it already open
  },
  // a body that died before we joined: lay it out where it fell
  addBody(id, type, x, z, yaw, secured, y = 0) {
    if (this.enemies.has(id)) return;
    const def = G.ENEMIES[type];
    if (!def) return;
    const rig = G.Rig.create({ style: def.style, scale: def.scale, boss: !!def.boss, seed: id * 7919 + 13, dressed: true });
    if (!def.civ) rig.setKit(G.Rig.armourKit(def.vest, def.helmet, def.style === 'armored'));
    G.R.dynRoot.add(rig.root);
    const ev = { id, type, def, rig, pos: new THREE.Vector3(x, y, z), tgt: new THREE.Vector3(x, y, z), yaw, tgtYaw: yaw, hp: 0, alive: false, deadT: 0, lean: 0 };
    rig.root.position.set(x, y, z); rig.root.rotation.y = yaw;
    rig.die(null);
    rig.settle(3);
    if (secured) { ev.bodySecured = true; rig.zip(!def.civ, true); rig.settle(2); }
    this.enemies.set(id, ev);
  },
  // sealed evidence envelope left where the weapon was, so it's clear what's been bagged
  envelopeMesh() {
    if (!this._envMat) {
      const c = document.createElement('canvas'); c.width = 128; c.height = 176;
      const g = c.getContext('2d');
      g.fillStyle = '#c9a86a'; g.fillRect(0, 0, 128, 176);
      g.fillStyle = '#b3262a'; g.fillRect(0, 10, 128, 30);
      g.fillStyle = '#fff'; g.font = 'bold 22px Arial'; g.textAlign = 'center'; g.fillText('EVIDENCE', 64, 33);
      g.strokeStyle = 'rgba(40,30,20,0.6)'; g.lineWidth = 2;
      for (let y = 60; y < 150; y += 18) { g.beginPath(); g.moveTo(12, y); g.lineTo(116, y); g.stroke(); }
      g.fillStyle = '#222'; for (let x = 20; x < 108; x += 5) g.fillRect(x, 156, x % 3 ? 2 : 3, 12);
      this._envMat = new THREE.MeshLambertMaterial({ map: new THREE.CanvasTexture(c) });
      this._envGeo = new THREE.BoxGeometry(0.24, 0.012, 0.33);
    }
    return new THREE.Mesh(this._envGeo, this._envMat);
  },
  secureEvidence(i) {
    const v = this.evidence.get(i);
    if (!v || v.secured) return;
    G.R.dynRoot.remove(v.mesh);
    v.mesh = this.envelopeMesh();
    v.mesh.position.set(v.x, (v.y || 0) + 0.008, v.z);
    v.mesh.rotation.y = Math.random() * Math.PI * 2;
    G.R.dynRoot.add(v.mesh);
    v.secured = true;
  },
  removeEvidence(i) {
    const v = this.evidence.get(i);
    if (!v) return;
    G.R.dynRoot.remove(v.mesh);
    this.evidence.delete(i);
  },
  // where an officer's hands are on someone being restrained: between the shoulder blades while they're
  // shoved down, then at the wrists (shared by first person, teammates' rigs and the camera)
  zipPoint(ev, t, living) { return G.Rig.zipPoint(ev.rig, t, living); },
  discardDrop(rig) { if (rig.dropped) { if (rig.dropped.g.parent) rig.dropped.g.parent.remove(rig.dropped.g); rig.dropped = null; } },
  // A window breaking: the pane goes, a burst of glass falls both sides of it, and it's heard. at, dir: where
  // the round went through (optional)
  // A pane that's taken its first round: fractured right across from where it was hit (js/damage.js crack), still up
  crackGlass(id, at, dir) {
    const map = G.Game.map, w = map && map.windows && map.windows[id];
    if (!w || w.broken || w.armor || w.cracked) return;
    w.cracked = true; map.cracked = true;
    if (G.Highlights) G.Highlights.crack(id, at);
    G.Damage.crack(map.winMeshes && map.winMeshes[id], at);
    G.R.particles(at, 8, 0xd8eef5, 1.2, 0.8, 9, 0.7, dir ? [dir.x, 0, dir.z] : null);
    G.Audio.glass(Math.hypot(w.x - G.R.camera.position.x, w.z - G.R.camera.position.z) + 10); // (from the camera: on a helmet cam, what they hear)
  },
  breakGlass(id, at, dir) {
    const map = G.Game.map, w = map && map.windows && map.windows[id];
    if (!w || w.broken || w.armor) return; // (bulletproof glass doesn't break)
    w.broken = true;
    if (G.Highlights) G.Highlights.glass(id);
    G.World.windowSolids(map.world, map, w);
    const pane = map.winMeshes && map.winMeshes[id];
    if (pane) pane.visible = false;
    const Y = w.fy || 0, lo = w.door ? 0.25 : w.rail ? 0.1 : w.sill != null ? w.sill : G.Level.SILL, hi = w.door ? G.Level.DOOR_H - 0.1 : w.rail ? G.Level.RAIL_H - 0.05 : w.top != null ? w.top : G.Level.TOP; // (a glass door: its pane, nearly floor to top rail; a railing's: under its handrail)
    const ax = w.door ? (w.door.axis === 'x' ? 0 : 1) : (w.nz ? 1 : 0), az = w.door ? (w.door.axis === 'x' ? 1 : 0) : (w.nx ? 1 : 0); // (along the glass)
    for (let k = 0; k < 4; k++) {
      const q = new THREE.Vector3(w.x + ax * (Math.random() - 0.5) * w.len, Y + lo + Math.random() * (hi - lo), w.z + az * (Math.random() - 0.5) * w.len);
      G.R.particles(q, 14, 0xd8eef5, 1.6, 1.2, 9, 0.7, dir ? [dir.x * 1.5, 0, dir.z * 1.5] : null);
    }
    G.Audio.glass(Math.hypot(w.x - G.R.camera.position.x, w.z - G.R.camera.position.z));
  },
  // A weapon light and/or laser from `from` along dir: the light shines, the laser lands on the first wall or
  // person in its way (a person as a rough column: standing up to 1.8 m, 0.25 m round). skip: whose it is.
  // (selfEv: a suspect's own: their body doesn't stop their laser.) Anyone else's light can dazzle you: js/glare.js.
  tacBeam(from, dir, fl, skip, drawFrom, selfEv) {
    const map = G.Game.map;
    if (!map) return;
    const src = drawFrom || from; // (where the light and the beam visibly come from)
    if (fl & 1) { G.R.tacLight(src, dir, fl & 8 ? 1.6 : 1, skip != null); if (skip != null) G.Glare.add(skip, src, dir, fl & 8 ? 1.6 : 1); }
    if (!(fl & 2)) return;
    let t = G.Level.raycast(map, from.x, from.y, from.z, dir.x, dir.y, dir.z, 60, { glass: true }).t;
    const hz = Math.hypot(dir.x, dir.z) || 1e-6;
    const body = (p, h) => {
      const ox = p.x - from.x, oz = p.z - from.z, along = (ox * dir.x + oz * dir.z) / hz; // (along the ground)
      if (along <= 0) return;
      const tt = along / hz, sx = from.x + dir.x * tt - p.x, sz = from.z + dir.z * tt - p.z;
      if (Math.hypot(sx, sz) > 0.25 || tt >= t) return;
      const y = from.y + dir.y * tt;
      if (y > p.y && y < p.y + h) t = tt;
    };
    for (const ev of this.enemies.values()) if (ev.alive && ev !== selfEv) body(ev.pos, ev.crouch ? 1.2 : 1.8);
    for (const [id, pv] of this.players) if (id !== skip && pv.st && !pv.st.dd) body(pv.pos, pv.st.cr ? 1.2 : 1.8);
    if (skip != null) body(G.Me.pos, G.Me.crouch ? 1.2 : 1.8);
    const end = from.clone().addScaledVector(dir, t - 0.01);
    G.R.tacLaser(src, end, !!(fl & 4));
    if (G.Highlights) G.Highlights.laser(selfEv ? skip : skip == null ? null : 'p' + skip, end, !!(fl & 4)); // (where it landed: the replays show it)
  },
  // the light or laser on a suspect's gun, to see: a little black housing under the barrel
  tacOnGun(rig, tac) {
    const gi = rig.gunInfo, m = gi && gi.muzzles && gi.muzzles[0];
    if (!tac || !rig.gun || !m) return;
    const box = new THREE.Mesh(this.tacGeo || (this.tacGeo = new THREE.CylinderGeometry(0.014, 0.016, 0.08, 8).rotateX(Math.PI / 2)), this.tacMat || (this.tacMat = new THREE.MeshLambertMaterial({ color: 0x17181a })));
    box.position.set(m[2], m[1] - 0.032, -m[0] * 0.72); rig.gun.add(box);
  },
  // a suspect reloading: the magazine out and in (or shells going in one by one), heard if you're close
  enemyReload(m) {
    const ev = this.enemies.get(m.e);
    if (!ev || !ev.alive) return;
    if (ev.pos.distanceTo(G.R.camera.position) > 25) return;
    const A = G.Audio, dur = Math.min(5, +m.dur || 2) * 1000;
    if (!(m.n > 0)) { ev.reloadAt = performance.now(); ev.reloadDur = dur; } // (a magazine change: their hands show it, js/rig.js)
    // from their hands, wherever they are when each part of it happens (heard from that side, muffled through walls)
    const at = () => new THREE.Vector3(ev.pos.x, 1.15 * (ev.crouch ? 0.7 : 1) * ev.def.scale, ev.pos.z);
    if (m.n > 0) { for (let i = 0; i < Math.min(8, m.n); i++) setTimeout(() => { if (ev.alive && ev.reloading !== false) A.sampleAt('insert_magazine', at(), 0.45, 1.6) || A.shell(); }, i * dur + dur * 0.7); return; }
    A.sampleAt('pull_magazine', at(), 0.6, 1);
    setTimeout(() => { if (ev.alive) A.sampleAt('insert_magazine', at(), 0.6, 1); }, dur * 0.6);
    setTimeout(() => { if (ev.alive) A.sampleAt('rack_slide', at(), 0.5, 1); }, dur * 0.88);
  },
  enemyShot(m) {
    let to = new THREE.Vector3(m.to[0], m.to[1], m.to[2]);
    let f = new THREE.Vector3(m.f[0], m.f[1], m.f[2]);
    // the round leaves the barrel of the gun in their hands, as you see it (the host's own muzzle point is a
    // stand-in: it doesn't know how their body is lying)
    const sh = this.enemies.get(m.e), gi = sh && sh.rig.gun && sh.rig.gunInfo;
    if (gi && gi.muzzles && gi.muzzles[0]) {
      sh.rig.gun.updateMatrixWorld(true);
      f = sh.rig.gun.localToWorld(new THREE.Vector3(gi.muzzles[0][2], gi.muzzles[0][1], -gi.muzzles[0][0]));
    }
    G.R.muzzleFlashAt(f);
    const me = G.R.camera.position;
    const wdef = G.WEAPONS[m.w] || G.WEAPONS[G.ENEMIES[m.ty].wpn];
    // what you see of their round (a machine gunner's belt has a tracer every fourth): what it does is the host's, flown there
    // (js/player.js enemyRound), its marks and wounds told to you as they happen
    const ev0 = this.enemies.get(m.e), tr = wdef.cls === 'LMG' && ev0 && ((ev0.shots = (ev0.shots || 0) + 1) % 4 === 1);
    if (G.Highlights) G.Highlights.shot('e' + m.e, f, to, wdef.code || m.w, undefined, undefined, m.sid);
    this.visRound(f, to, wdef, tr ? 'tracer' : G.ballFor(G.calOf(wdef)), () => {});
    G.Casings.fired(wdef, false, f, to);
    if (!G.GunAudio.play(wdef.id, f, 'e' + m.e)) G.Audio.shot(G.CLASS_SND[wdef.cls] || G.CLASS_SND.AR, me.distanceTo(f));
    G.Audio.flyby(f, to, wdef, G.ballFor(G.calOf(wdef)));
    this.pings.push({ x: m.f[0], z: m.f[2], t: 2.5 });
    const ev = this.enemies.get(m.e);
    if (ev) ev.rig.recoil(G.Server.kickOf({ str: ev.str }, wdef)); // (the same kick the host gave it)
  },
  // The marks a round left (js/ballistics.js mark: [x, y, z, normal, what it looks like, e(ntry) x (exit) r(icochet)]), on your
  // screen: skip the first (the arrival drew it). A ricochet's next leg shows as a streak.
  roundFx(list, skip) {
    let last = null;
    (list || []).forEach((f, i) => {
      const p = new THREE.Vector3(f[0], f[1], f[2]);
      if (!(skip && i === 0)) G.R.impactOn(p, f.slice(3, 6), null, f[6], f.length > 8 ? { m: f[12], k: f[7], dir: f.slice(8, 11), J: f[11], stop: !!f[13], cal: f[14], cut: f[15] || 0 } : undefined);
      if (last && last[7] === 'r') G.R.tracer(new THREE.Vector3(last[0], last[1], last[2]), p, 0xffd080, 0.05);
      if (f[7] === 'r' && G.Audio.ricochet) G.Audio.ricochet(p);
      last = f;
    });
  },
  enemyThrow(id) { const ev = this.enemies.get(id); if (ev && ev.alive) ev.rig.throwNade(); },
  remoteShot(m) {
    const f = new THREE.Vector3(m.f[0], m.f[1], m.f[2]), to = new THREE.Vector3(m.to[0], m.to[1], m.to[2]);
    const def = G.Gunsmith.fromCode(m.w);
    if (!def) return;
    const pv = this.players.get(m.id);
    if (pv) pv.rig.recoil();
    if (G.Highlights) G.Highlights.shot('p' + m.id, f, to, m.w, m.am, m.tos, m.sid);
    G.Audio.flyby(f, to, def, m.am || G.ballFor(G.calOf(def))); // a teammate's round going past you
    // their round flies to where it was headed (the walls it'll meet, as the shooter worked it out)
    const am = m.am || G.ballFor(G.calOf(def)), fromP = f.clone(), toP = to.clone();
    this.visRound(f, to, def, am, () => {
      if (def.cls === 'RAIL') G.R.tracer(fromP, toP, def.tracer || 0x55ddff, 0.06);
    });
    if (!m.sil) G.R.muzzleFlashAt(f, def.tracer || 0xffb060);
    G.Casings.fired(def, false, f, to, m.am);
    const d = G.R.camera.position.distanceTo(f);
    if (def.cls === 'RAIL') G.Audio.rail(d);
    else if (def.cls === 'BOW') G.Audio.bow(d);
    else if (!G.GunAudio.play(G.Gunsmith.roundSoundKey(def, am), f, 'p' + m.id)) G.Audio.shot(m.sil ? G.SUPPRESSOR.snd : def.snd, d);
  },

  // ---------------------------------------------------------------- other people's rounds
  // A round someone else fired, as you see it: from f straight to `to` at its speed (G.roundSpeed, slowing with
  // drag), drawn like your own (G.R.bullet); arrive: what happens when it gets there.
  visRound(f, to, def, am, arrive) {
    const len = f.distanceTo(to);
    if (len < 0.05) { arrive(); return; }
    const rail = def.cls === 'RAIL';
    (this.vRounds = this.vRounds || []).push({ f: f.clone(), dir: to.clone().sub(f).divideScalar(len), len, d: 0, def, am, arrive,
      v: rail ? 3000 : Math.max(40, G.roundSpeed(def, am) || 400), drag: rail ? 1e9 : G.dragOf(def, am), tracer: !!(G.AMMO[am] && G.AMMO[am].tracer) });
  },
  stepRounds(dt) {
    const rs = this.vRounds;
    if (!rs || !rs.length) return;
    dt = Math.min(dt, 0.05);
    for (let i = rs.length - 1; i >= 0; i--) {
      const b = rs[i], step = b.v * dt;
      b.d = Math.min(b.len, b.d + step);
      b.v *= Math.exp(-step / b.drag);
      G.R.bullet(b.f.clone().addScaledVector(b.dir, b.d), b.dir, b.d, b.def, b.tracer, b.v, b.am);
      if (b.d >= b.len || b.v < 30) { rs.splice(i, 1); b.arrive(); }
    }
  },
  // kind: 'frag', or 'flash' (a flashbang: a grey can)
  // ---------------------------------------------------------------- a thrown grenade's flight
  // Gravity, bounces off walls, floors and ceilings (some of its speed lost each time, a floor taking more), then
  // rolling along the floor, slowed by friction, till it stops. n: { pos, vel } (and n.onGround, set here). The
  // same steps for everyone's grenades and for the throw you're lining up (predictNade), so where the arc says it
  // ends up is where it does.
  NADE_R: 0.05, NADE_G: 14,
  nadeStep(n, dt, map) {
    const R = this.NADE_R, w = map && map.world, p = n.pos, v = n.vel;
    const hits = (x0, y0, z0, x1, y1, z1) => { if (!w) return y0 < 0; let h = false; G.World.query(w, [x0, y0, z0], [x1, y1, z1], (s) => { if (s.move || s.ray) h = true; }); return h; };
    const side = (x, y, z) => hits(x - R, y - R + 0.03, z - R, x + R, y + R, z + R); // (clear of the floor it's on)
    const below = (x, y, z) => hits(x - R + 0.01, y - R, z - R + 0.01, x + R - 0.01, y + R - 0.02, z + R - 0.01);
    const N = Math.max(1, Math.ceil(dt / (1 / 120))), h = dt / N;
    for (let k = 0; k < N; k++) {
      v.y -= this.NADE_G * h;
      let nx = p.x + v.x * h;
      if (side(nx, p.y, p.z)) { v.x *= -0.42; v.z *= 0.85; nx = p.x; }
      let nz = p.z + v.z * h;
      if (side(nx, p.y, nz)) { v.z *= -0.42; v.x *= 0.85; nz = p.z; }
      let ny = p.y + v.y * h;
      if (v.y < 0 ? below(nx, ny, nz) : hits(nx - R, ny - R + 0.03, nz - R, nx + R, ny + R, nz + R)) {
        if (v.y < 0) { v.y = v.y < -1.6 ? -v.y * 0.32 : 0; v.x *= 0.78; v.z *= 0.78; } // (a floor: a bounce, or it settles)
        else v.y *= -0.3;
        ny = p.y;
      }
      p.set(nx, ny, nz);
      // rolling on the floor: friction slows it to a stop
      n.onGround = v.y === 0 && below(p.x, p.y - 0.02, p.z);
      if (n.onGround) { const f = Math.exp(-2.4 * h); v.x *= f; v.z *= f; if (Math.hypot(v.x, v.z) < 0.04) v.x = v.z = 0; }
    }
  },
  // Where a throw goes: its path, stepped as a grenade flies (nadeStep) for as long as the fuse burns. Returns
  // the points along it (Vector3s) and where it goes off (the last).
  predictNade(p, v, fuse, map) {
    const n = { pos: p.clone(), vel: v.clone() }, pts = [n.pos.clone()], h = 1 / 60;
    for (let t = 0; t < fuse; t += h) { this.nadeStep(n, h, map); pts.push(n.pos.clone()); }
    return pts;
  },
  addNade(p, v, fuse, own, enemy, kind = 'frag') {
    const flash = kind === 'flash';
    const mesh = new THREE.Mesh(flash ? new THREE.CylinderGeometry(0.035, 0.035, 0.13, 10) : new THREE.SphereGeometry(0.08, 8, 6), new THREE.MeshLambertMaterial({ color: flash ? 0x7d8388 : 0x3a4a2a, emissive: 0x220000 }));
    mesh.position.copy(p);
    G.R.dynRoot.add(mesh);
    this.nades.push({ pos: new THREE.Vector3().copy(p), vel: new THREE.Vector3().copy(v), fuse, own, enemy, mesh, kind });
  },

  // An officer losing blood: drops where they stand or walk (more, the heavier the bleeding), and a pool
  // under them when they're down or dead. who: the owner key, pos: their feet, bl: 0 none, 1 light, 2 heavy.
  officerBlood(who, pos, bl, down, dt) {
    if (!bl) return;
    const k = who === G.Me ? (this._myDrip = (this._myDrip || 0) - dt) : (who._drip = (who._drip || 0) - dt);
    if (down) G.R.bloodPool(who, pos.x, pos.z, bl > 1 ? 1.0 : 0.5, bl > 1 ? 30 : 60, pos.y);
    else if (k <= 0) {
      const next = bl > 1 ? 0.12 + Math.random() * 0.12 : 0.6 + Math.random() * 0.6;
      if (who === G.Me) this._myDrip = next; else who._drip = next;
      G.R.particles(new THREE.Vector3(pos.x + (Math.random() - 0.5) * 0.35, 0.9, pos.z + (Math.random() - 0.5) * 0.35), 1, 0x7a0808, 0.2, 0.8, 9, 0.1, null, true);
    }
  },
  // ---------------------------------------------------------------- pings
  // A teammate's ping (or yours): a marker in their colour with their name at the spot (nothing about what's
  // there), seen through walls,
  // the same size on screen however far off, gone after a few seconds. One per player: a new one replaces it.
  PING_T: 6,
  addPing(id, p) {
    const me = id === G.Net.myId, r = G.Game.roster && G.Game.roster[id], name = me ? G.Game.myName : r ? r.name : '?', color = me ? G.Game.myColor : r ? r.color : 0xffffff, animal = me ? G.Game.myAnimal : r ? r.animal : null;
    this.pings2 = this.pings2 || new Map();
    const old = this.pings2.get(id);
    if (old) { G.R.dynRoot.remove(old.s); old.s.material.map.dispose(); old.s.material.dispose(); }
    const c = document.createElement('canvas'); c.width = 400; c.height = 160;
    const g = c.getContext('2d'), col = G.U.hex(color);
    g.font = 'bold 30px Consolas, monospace'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.lineWidth = 6; g.strokeStyle = 'rgba(0,0,0,0.85)';
    const label = name;
    while (g.measureText(label).width > 380 && parseInt(g.font, 10) > 16) g.font = `bold ${parseInt(g.font.split(' ')[1], 10) - 2}px Consolas, monospace`; // (a long name: smaller)
    const tw = g.measureText(label).width, ax = animal ? 22 : 0; // (their animal before their name)
    g.strokeText(label, 200 + ax, 30); g.fillStyle = col; g.fillText(label, 200 + ax, 30);
    if (animal) { g.save(); g.translate(200 + ax - tw / 2 - 48, 8); g.beginPath(); g.arc(22, 22, 23, 0, Math.PI * 2); g.fillStyle = 'rgba(0,0,0,0.6)'; g.fill(); G.Callsigns.draw(g, animal, 44, color); g.restore(); }
    // the marker: a diamond pointing down at the spot
    g.beginPath(); g.moveTo(200, 150); g.lineTo(176, 100); g.lineTo(200, 62); g.lineTo(224, 100); g.closePath();
    g.lineWidth = 5; g.strokeStyle = 'rgba(0,0,0,0.85)'; g.stroke(); g.fillStyle = col; g.fill();
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), depthTest: false, transparent: true }));
    s.center.set(0.5, 0.06); s.renderOrder = 20;
    s.position.set(p[0], p[1], p[2]);
    G.R.dynRoot.add(s);
    this.pings2.set(id, { s, t: this.PING_T });
    G.Audio.tone && G.Audio.tone(880, 0.08, 'sine', 0.08); // (a soft blip)
  },
  updatePings(dt) {
    if (!this.pings2) return;
    const cam = G.R.camera.position;
    for (const [id, q] of this.pings2) {
      q.t -= dt;
      if (q.t <= 0) { G.R.dynRoot.remove(q.s); q.s.material.map.dispose(); q.s.material.dispose(); this.pings2.delete(id); continue; }
      const d = q.s.position.distanceTo(cam), sc = Math.max(0.9, d * 0.085); // (about the same size on screen at any range)
      q.s.scale.set(sc * 1.56, sc * 0.625, 1);
      q.s.material.opacity = Math.min(1, q.t / 1.2);
    }
  },
  update(dt) {
    G.Casings.update(dt);
    G.Bolts.update();
    this.updatePings(dt);
    this.stepRounds(dt);
    if (G.Game.map && G.R.camera) { // the lights follow you (and, aiming, what you're aiming at)
      let focus = null;
      if (G.Me.adsT > 0.5 && G.Game.map.theme.layout === 'festival') {
        const c = G.R.camera, f = new THREE.Vector3(0, 0, -1).applyQuaternion(c.quaternion), h = G.Level.raycast(G.Game.map, c.position.x, c.position.y, c.position.z, f.x, f.y, f.z, 120);
        focus = c.position.clone().addScaledVector(f, h.t);
      }
      G.Level.updateLights(G.Game.map, G.R.camera.position, false, focus);
    }
    // officers bleeding: you, and your teammates from what their bodies report
    if (G.Game.phase === 'level' && G.Me.body && G.Me.pos) {
      const parts = Object.values(G.Me.body.parts), bl = parts.some((q) => q.heavy) ? 2 : parts.some((q) => q.light) ? 1 : 0;
      this.officerBlood(G.Me, G.Me.pos, bl, G.Me.down || G.Me.dead, dt);
      for (const pv of this.players.values()) {
        if (!pv.st || !pv.st.bd || !pv.pos) continue;
        const b = pv.st.bd.p || [], bl2 = b.some((q) => q[1] & 2) ? 2 : b.some((q) => q[1] & 1) ? 1 : 0;
        this.officerBlood(pv, pv.pos, bl2, pv.st.dn || pv.st.dd, dt);
      }
    }
    const map = G.Game.map, L = G.Level;
    // enemies
    for (const ev of [...this.enemies.values()]) {
      if (ev.alive) {
        ev.pos.lerp(ev.tgt, Math.min(1, dt * 12));
        ev.yaw += G.U.angDiff(ev.yaw, ev.tgtYaw) * Math.min(1, dt * 12);
      } else {
        ev.deadT += dt;
        // the dead: once the body's down, a pool spreads from under the chest
        if (ev.deadT > 1.5 && ev.rig.rd && !ev.pooled) { ev.pooled = true; const P = ev.rig.rd.P; G.R.bloodPool(ev, (P[0].x + P[3].x) / 2, (P[0].z + P[3].z) / 2, 1.1 + Math.random() * 0.4, 30, Math.min(P[0].y, P[3].y) - 0.2); }
      }
      // aim pitch toward whoever they're engaging
      let pitch = 0;
      const aimed = ev.aim === G.Net.myId ? G.Me.pos : ev.aim && this.players.get(ev.aim) ? this.players.get(ev.aim).pos : null;
      const tgt = aimed || (ev.alert ? this.nearestPlayer(ev.pos) : null);
      if (tgt) pitch = Math.atan2(tgt.y + 1.2 - (ev.pos.y + 1.4 * ev.def.scale), Math.max(1, Math.hypot(tgt.x - ev.pos.x, tgt.z - ev.pos.z))); // (from their own height: upstairs, level)
      ev.recPitch = pitch; // (for the highlights: js/highlights.js)
      let pose = ev.scode === 1 ? 'handsup' : ev.scode === 2 ? 'cuffed' : ev.scode === 3 ? 'cower' : null;
      // being taken down and zip-tied by an officer (me or a teammate)
      let tk = -1;
      const ma = G.Me.action;
      if (ma && ma.kind === 'zip' && ma.target === ev.id) tk = ma.t / ma.dur;
      for (const pv of this.players.values()) if (pv.st && pv.st.act === 'z' && pv.st.zt === ev.id) tk = pv.st.ap || 0;
      ev.recTk = tk; // (for the highlights: js/highlights.js)
      const tied = ev.scode === 2 || ev.arrested;
      // (dead, or down for good: limp, turned over and the wrists put behind the back as a body is)
      const limp = !ev.alive || ev.down;
      if (limp && !ev.bodySecured && (!ev.def.civ || ev.alive)) ev.rig.secure(tk); // turned over and wrists behind the back
      if (ev.alive && !limp && !tied && tk >= 0) { pose = 'takedown'; ev.rig.zip(tk > 0.8); }
      else if (ev.alive && ev.rig.zipped !== tied) ev.rig.zip(tied); // let go before the tie was done (or tied, limp)
      if (ev.arrested && ev.scode !== 2) pose = 'cuffed'; // the arrest message can beat the next snapshot
      let act = null;
      if (ev.alive && ev.doorT != null && ev.doorT < 0.6) { ev.doorT += dt; act = { kind: 'open', t: Math.min(1, ev.doorT / 0.5), hand: ev.rig.gun && !ev.rig.slung ? 'L' : 'R' }; }
      // Lying prone (restrained, or being taken down), a body stretches about 1.85 m ahead of the feet: with a
      // wall closer than that, it's drawn slid back from it (as far as the room behind allows) instead of
      // lying through it.
      let at = ev.pos;
      // Leaning out round a corner, the body really is out at the lean point (where the host shoots from: 0.55 m
      // to the side), not tilting from behind the edge (eased in and out with the lean itself)
      const leanTo = ev.alive ? ev.lean : 0;
      ev.leanS = (ev.leanS || 0) + (leanTo - (ev.leanS || 0)) * Math.min(1, dt * (Math.abs(leanTo) > Math.abs(ev.leanS || 0) ? 3.5 : 7)); // (out slowly, the Server's PEEK.UP; back quickly)
      if (Math.abs(ev.leanS) > 0.01) at = ev.pos.clone().add(new THREE.Vector3(Math.cos(ev.yaw), 0, -Math.sin(ev.yaw)).multiplyScalar(ev.leanS * 0.45 * (ev.def.scale || 1)));
      if (ev.alive && (pose === 'cuffed' || pose === 'takedown')) {
        const key = `${ev.pos.x.toFixed(2)},${ev.pos.z.toFixed(2)},${ev.yaw.toFixed(2)}`;
        if (ev.proneKey !== key) {
          ev.proneKey = key;
          const fx = -Math.sin(ev.yaw), fz = -Math.cos(ev.yaw), need = 1.85 * ev.def.scale;
          const ahead = L.raycast(map, ev.pos.x, 0.3, ev.pos.z, fx, 0, fz, need + 0.2).t, behind = L.raycast(map, ev.pos.x, 0.3, ev.pos.z, -fx, 0, -fz, need).t;
          const back = Math.max(0, Math.min(need + 0.15 - ahead, behind - 0.3));
          ev.proneShift = back > 0.01 ? new THREE.Vector3(-fx * back, 0, -fz * back) : null;
        }
        if (ev.proneShift) at = ev.pos.clone().add(ev.proneShift);
      }
      // (the body's physics only near you: farther off they're animated, which no one can tell apart; but one you've
      // hit in the last 8 s is yours to watch wherever it is, so a long shot's hits rock it and it falls from where they
      // left it: the recording of its fall, js/highlights.js, is yours)
      const near = ev.pos.distanceToSquared(G.R.camera.position) < 40 * 40 || (ev.engagedT && performance.now() - ev.engagedT < 8000);
      if (ev.down && ev.alive) ev.rig.goLimp(); // (down for good: a limp body, bleeding out)
      // (what they're aiming at: a weakened or downed suspect points the gun at it from the hand, js/rig.js)
      const aimAt = tgt && ev.armed === 2 && ev.alert && !ev.surp && !ev.reloading && !pose && !ev.down ? new THREE.Vector3(tgt.x, tgt.y + 1.2, tgt.z) : null;
      const rlP = ev.reloadAt && ev.reloading ? (performance.now() - ev.reloadAt) / ev.reloadDur : -1; // (how far into a magazine change)
      ev.aimP = aimed ? aimAt : null; // (who they're on: where their light and laser go)
      ev.rig.update(dt, { pos: at, yaw: ev.yaw, pitch, crouch: ev.crouch || (ev.str != null && ev.str < 0.4), rise: 3.5, alert: !!ev.alert && ev.armed === 2 && !ev.surp && !ev.reloading, lean: ev.leanS, pose, tk, act, str: near ? (ev.str == null ? 1 : ev.str) : null, aimAt,
        reload: rlP >= 0 && rlP < 1 ? rlP : -1 });
      // past the fog (it's the background's colour out there: nothing to see) they aren't drawn, each one's forty-odd
      // pieces a draw call. The body, not the root: the root's what a shot checks for (js/player.js), and it still hits.
      // Nor behind a wall, floor or ceiling (furniture, doors, glass, rails and stairs don't count: you might see them
      // round, over or through it).
      const fog = G.R.scene.fog, cam = G.R.camera;
      if (fog) {
        const e = cam.matrixWorld.elements, depth = -((at.x - e[12]) * e[8] + (at.y - e[13]) * e[9] + (at.z - e[14]) * e[10]); // (along the view, as the fog's reckoned)
        ev.rig.body.visible = depth < fog.far + 2.5 && this.inSight(ev.rig, at);
      }
      // bleeding: drips falling from them as they go; down for good, from the body where it lies (its ragdoll's hips,
      // not where they last stood)
      if (ev.alive && ev.bleed && (ev.dripT = (ev.dripT || 0) - dt) <= 0) {
        ev.dripT = 0.25 + Math.random() * 0.35;
        const lying = ev.rig.limp, b = lying ? G.Rig.bodyAt(ev.rig) : ev.pos;
        G.R.particles(new THREE.Vector3(b.x + (Math.random() - 0.5) * (lying ? 0.2 : 0.3), lying ? b.y + 0.05 : (ev.crouch ? 0.6 : 0.9) * ev.def.scale, b.z + (Math.random() - 0.5) * (lying ? 0.2 : 0.3)), 2, 0x7a0808, 0.3, lying ? 0.3 : 0.7, 9, 0.2, null, true);
      }
    }

    // your own body, if you're dead: a ragdoll where you fell
    if (this.selfBody) { const sb = this.selfBody; sb.rig.update(dt, { pos: sb.pos, yaw: sb.yaw, pitch: 0, crouch: false, alert: false, lean: 0, state: 'dead' }); }
    // remote players
    for (const pv of this.players.values()) {
      if (!pv.st) { pv.rig.root.visible = false; continue; }
      const st = pv.st;
      // dead: a ragdoll where they fell, staying there; alive again (a new level): a whole body
      if (st.dd) {
        pv.rig.root.visible = true;
        if (!pv.dead) { pv.dead = true; pv.rig.holster(false); pv.rig.die(null); G.R.impact(new THREE.Vector3(pv.pos.x, pv.pos.y + 1.2, pv.pos.z), null, 'blood'); }
        pv.rig.update(dt, { pos: pv.pos, yaw: pv.yaw, pitch: 0, crouch: false, alert: false, lean: 0, state: 'dead' });
        continue;
      }
      if (pv.dead) this.resetPlayerRig(pv);
      pv.rig.root.visible = true;
      pv.pos.lerp(new THREE.Vector3(st.p[0], st.p[1], st.p[2]), Math.min(1, dt * 14));
      pv.yaw += G.U.angDiff(pv.yaw, st.yw) * Math.min(1, dt * 14);
      pv.pitch += (st.pt - pv.pitch) * Math.min(1, dt * 14);
      pv.rig.setGun(st.w, G.Stickers.of(st.sk)); // their build code: the same parts on their gun (and its stickers, by their hash: js/stickers.js)
      pv.rig.holster(!!st.sw); // hands busy: weapon away
      const act = st.act ? { kind: { o: 'open', c: 'close', k: 'kick', z: 'zip', b: 'bag' }[st.act], t: st.ap || 0, hand: 'R' } : null;
      if (act && act.kind === 'zip') { const tv = this.enemies.get(st.zt); if (tv) act.pt = this.zipPoint(tv, act.t, tv.alive && !tv.down); act.pull = !!st.pl; }
      // their restraining / bagging sounds, as they reach each step
      if (act && pv.lastAct === st.act) G.Audio.foley(act.kind, pv.lastAp || 0, act.t, pv.pos.distanceTo(G.R.camera.position));
      pv.lastAct = st.act; pv.lastAp = act ? act.t : 0;
      const kneel = (st.act === 'z' && (st.ap || 0) > 0.3) || st.act === 'b';
      const hold = st.hk ? { kind: st.hk === 2 ? 'flash' : 'frag', cock: !!st.hc, str: st.hs == null ? 2 : st.hs } : null; // (a grenade in their hand)
      pv.rig.update(dt, { pos: pv.pos, yaw: pv.yaw, pitch: pv.pitch, crouch: (!!st.cr || kneel) && !st.dn, prone: !!st.pr, alert: !st.lr && !st.sw, lean: st.ln || 0, state: st.dn ? 'down' : 'alive', act,
        hold, reload: st.rl == null ? -1 : st.rl, loaded: st.ld == null ? null : !!st.ld, inspect: st.in == null ? -1 : st.in, magChk: st.mc == null ? -1 : st.mc });
      if (pv.tag) pv.tag.position.y = st.dn ? 0.8 : st.cr ? 1.7 : 2.15;
    }

    // marksman lasers
    G.R.beginLasers();
    let aimedAtMe = false;
    for (const ev of this.enemies.values()) {
      if (!ev.alive || !ev.aim || !ev.rig.gun || ev.rig.slung) continue;
      const a = ev.rig.head.localToWorld(new THREE.Vector3(0, 0.08, -0.12));
      let b;
      if (ev.aim === G.Net.myId) { b = G.R.camera.position.clone(); b.y -= 0.25; aimedAtMe = true; }
      else { const pv = this.players.get(ev.aim); if (!pv) continue; b = pv.pos.clone(); b.y += 1.3; }
      if (!(ev.tac & 2)) G.R.laser(a, b); // (one on their gun shows for itself, below)
    }
    G.R.endLasers();
    this.laserBeep -= dt;
    if (aimedAtMe && this.laserBeep <= 0) { G.Audio.laser(); this.laserBeep = 0.25; }
    G.HUD.sniperWarn(aimedAtMe);

    // weapon lights and lasers: yours (from the gun in your hands, along its bore) and your squad's (flags in
    // their state: 1 light, 2 laser, 4 the laser's green, 8 a bright light)
    G.R.tacBegin(); G.Glare.begin();
    const me = G.Me, mw = G.Game.phase === 'level' && me.cur ? me.cur() : null, mf = mw && !me.dead ? me.tacFlags(mw) : 0;
    if (mf) {
      // the gun points them, always: along its barrel as you see it (sway, bob, a turn's lag, the kick: the dot goes
      // with it), drawn from the gun in your hands. With the gun up that line runs from your eye (where the rounds
      // start: held steady, the barrel and the bore agree, so the dot is where they go); with the gun off the line
      // (lowered, coming up, mid-reload) from its muzzle.
      let dir = me.boreDir(), from = G.R.camera.position.clone(), gun = null;
      const vm = G.R.vm, fl = vm && vm.userData.flash;
      if (fl) {
        G.R.vmHolder.updateMatrixWorld(true);
        gun = fl.getWorldPosition(new THREE.Vector3());
        const axis = new THREE.Vector3(0, 0, -1).transformDirection(fl.parent.matrixWorld); // (the barrel: -z in its holder)
        const off = THREE.MathUtils.smoothstep(Math.acos(G.U.clamp(axis.dot(dir), -1, 1)), 0.03, 0.12); // (~2° to 7° off)
        dir = axis; if (off > 0) from.lerp(gun, off);
      }
      this.tacBeam(from, dir, mf, null, gun);
    }
    for (const [id, pv] of this.players) {
      const st = pv.st;
      if (!st || !st.tl || st.dd || st.sw || !pv.rig.root.visible) continue;
      const cp = Math.cos(pv.pitch);
      let dir = new THREE.Vector3(-Math.sin(pv.yaw) * cp, Math.sin(pv.pitch), -Math.cos(pv.yaw) * cp);
      if (st.lr && pv.rig.gun) { pv.rig.gun.updateMatrixWorld(true); dir = new THREE.Vector3(0, 0, -1).transformDirection(pv.rig.gun.matrixWorld); } // (lowered: where the gun points)
      const gi = pv.rig.gunInfo, from = pv.rig.gun && gi ? pv.rig.gun.localToWorld(new THREE.Vector3(gi.muzzles[0][2], gi.muzzles[0][1], -gi.muzzles[0][0])) : pv.pos.clone().add(new THREE.Vector3(0, 1.4, 0)).addScaledVector(dir, 0.5);
      this.tacBeam(from, dir, st.tl, id);
    }
    // and suspects': the light's on with the gun out, the laser once they're alert; the nearest get what's left of the pool
    const tac = [];
    if (G.Game.phase === 'level') for (const ev of this.enemies.values()) {
      if (!ev.tac || !ev.alive || ev.down || ev.scode || !ev.rig.gun || ev.rig.slung) continue;
      const d = ev.pos.distanceToSquared(G.R.camera.position), f = ev.tac & (ev.alert ? 15 : 9);
      if (f && d < 2500) tac.push([d, ev, f]);
    }
    tac.sort((a, b) => a[0] - b[0]);
    for (const [, ev, f] of tac) {
      const gun = ev.rig.gun, gi = ev.rig.gunInfo; gun.updateMatrixWorld(true);
      const from = gun.localToWorld(new THREE.Vector3(gi.muzzles[0][2], gi.muzzles[0][1], -gi.muzzles[0][0])), dir = ev.aimP ? ev.aimP.clone().sub(from).normalize() : new THREE.Vector3(0, 0, -1).transformDirection(gun.matrixWorld);
      this.tacBeam(from, dir, f, 'e' + ev.id, null, ev);
    }
    G.R.tacEnd(); G.Glare.end(dt);

    // first aid cabinet doors swinging open
    const cabV = G.Game.map && G.Game.map.cabViews;
    if (cabV) cabV.forEach((cv, i) => {
      const want = G.Game.cabs && G.Game.cabs[i] && G.Game.cabs[i][0] ? 1 : 0;
      if (want && cv.open === 0) { const c = G.Game.map.cabinets[i]; G.Audio.clink(Math.hypot(c.x - G.R.camera.position.x, c.z - G.R.camera.position.z)); }
      cv.open = want ? Math.min(1, cv.open + dt / 0.5) : 0;
      cv.door.rotation.y = -1.9 * (1 - Math.pow(1 - cv.open, 3));
    });
    // the sticker box: its sticker on the card (once the host's said which), the lid up and the card gone once it's taken
    const sv = G.Game.map && G.Game.map.sboxView;
    if (sv) {
      const sb = G.Game.sbox, name = sb && sb[0], taken = !!(sb && sb[1]);
      if (!sv.synced) { sv.synced = true; if (taken) sv.open = 1; } // (joined with it opened)
      sv.g.visible = !!name;
      if (name && sv.name !== name) {
        const p = G.Stickers.pic(name);
        if (p.bm) { sv.name = name; const k = 0.12 / Math.max(p.w, p.h); sv.card.scale.set(p.w * k, p.h * k, 1); sv.card.material.map = G.Stickers.material(name).map; sv.card.material.needsUpdate = true; }
      }
      sv.card.visible = sv.name === name && !taken;
      if (taken && sv.open === 0) { const b = G.Game.map.sbox; G.Audio.clink(Math.hypot(b.x - G.R.camera.position.x, b.z - G.R.camera.position.z)); }
      sv.open = taken ? Math.min(1, sv.open + dt / 0.5) : 0;
      sv.lid.rotation.x = -1.8 * (1 - Math.pow(1 - sv.open, 3));
    }
    // the attachments box lid: up and back on its hinge once it's been opened
    const av = G.Game.map && G.Game.map.aboxView;
    if (av) {
      const want = G.Game.abox && G.Game.abox[0] ? 1 : 0;
      if (!av.synced) { av.synced = true; if (want) av.open = 1; } // (joined with it already open)
      if (want && av.open === 0) { const ab = G.Game.map.abox; G.Audio.clink(Math.hypot(ab.x - G.R.camera.position.x, ab.z - G.R.camera.position.z)); }
      av.open = want ? Math.min(1, av.open + dt / 0.6) : 0;
      av.lid.rotation.x = -1.9 * (1 - Math.pow(1 - av.open, 3));
      // its lights: one for each of the squad, lit in their colour till they've had their pick, then dark
      const ids = Object.keys(G.Game.roster || {}).sort(), uses = (G.Game.abox && G.Game.abox[1]) || {};
      const key = ids.map((id) => `${id}:${(G.Game.roster[id] || {}).color}:${uses[id] && uses[id][1] ? 1 : 0}`).join('|');
      if (key !== av.key) {
        av.key = key;
        for (const c of av.lights.children) { c.geometry.dispose(); c.material.dispose(); }
        av.lights.clear();
        const gap = Math.min(0.05, 0.24 / Math.max(1, ids.length));
        ids.forEach((id, i) => {
          const used = uses[id] && uses[id][1], x = (i - (ids.length - 1) / 2) * gap;
          const bezel = new THREE.Mesh(new THREE.BoxGeometry(Math.min(0.04, gap - 0.006), 0.03, 0.004), new THREE.MeshStandardMaterial({ color: 0x0c0c0c, roughness: 0.6 }));
          bezel.position.set(x, 0, 0);
          const lens = new THREE.Mesh(new THREE.BoxGeometry(Math.min(0.032, gap - 0.014), 0.022, 0.004), new THREE.MeshBasicMaterial({ color: used ? 0x1c1c1c : (G.Game.roster[id] || {}).color || 0x44ff66 }));
          lens.position.set(x, 0, 0.002);
          av.lights.add(bezel, lens);
        });
      }
    }
    // the weapon case lid: latches clack, then it swings up and back against the wall
    const cv = G.Game.map && G.Game.map.caseView;
    if (cv) {
      const want = G.Game.caseOpen ? 1 : 0;
      if (want && cv.open === 0) { const mc = G.Game.map.case; G.Audio.clink(Math.hypot(mc.x - G.R.camera.position.x, mc.z - G.R.camera.position.z)); }
      cv.open = want ? Math.min(1, cv.open + dt / 0.8) : 0;
      cv.lid.rotation.x = -1.78 * (1 - Math.pow(1 - cv.open, 3));
    }

    // evidence outline: on while any weapon is still to be bagged, gently pulsing
    let glowing = false;
    for (const v of this.evidence.values()) if (!v.secured && v.mesh.visible) { glowing = true; break; }
    G.R.hasGlow = glowing || !!this._haloOn;
    if (this._haloMats) for (const m of this._haloMats.bands) m.uniforms.opacity.value = m.userData.base;
    if (G.R.hasGlow) this._outRes.value.set(window.innerWidth, window.innerHeight);
    if (glowing && this._outline) {
      const p = 0.5 + 0.5 * Math.sin(performance.now() / 300);
      for (const m of this._outline.bands) m.uniforms.opacity.value = m.userData.base * (0.7 + 0.3 * p);
    }

    // evidence being bagged: picked up off the floor and slid into an envelope (mine is drawn in first person)
    for (const [i, v] of this.evidence) {
      if (v.secured) continue;
      let t = -1, who = null;
      const ma = G.Me.action;
      if (ma && ma.kind === 'bag' && ma.target === i) { t = ma.t / ma.dur; who = 'me'; }
      for (const pv of this.players.values()) if (pv.st && pv.st.act === 'b' && pv.st.bt === i) { t = pv.st.ap || 0; who = pv; }
      const m = v.mesh;
      m.position.set(v.x, (v.y || 0) + 0.05, v.z); m.scale.setScalar(1); m.visible = true; // (on its own floor)
      if (who === 'me') m.visible = t < 0.22;
      else if (who) {
        const ph = G.U.bagPhases(t), gone = ph.insert;
        m.position.lerp(who.rig.armR.tie.getWorldPosition(new THREE.Vector3()), ph.lift);
        m.scale.setScalar(Math.max(0.02, 1 - gone));
        m.visible = gone < 0.98;
      }
    }

    // grenades
    for (const n of [...this.nades]) {
      const p = n.pos, was = p.clone();
      this.nadeStep(n, dt, map);
      // rolling: turned about the axis across its travel, as far as it's rolled
      const dx = p.x - was.x, dz = p.z - was.z, roll = Math.hypot(dx, dz);
      if (roll > 1e-4 && n.onGround) n.mesh.rotateOnWorldAxis(new THREE.Vector3(dz / roll, 0, -dx / roll), roll / this.NADE_R);
      n.mesh.position.copy(p);
      n.fuse -= dt;
      n.mesh.material.emissive.setHex(Math.floor(n.fuse * 8) % 2 ? 0xff2200 : 0x220000);
      if (n.fuse <= 0) {
        if (n.kind === 'flash' && !n.own) { G.R.dynRoot.remove(n.mesh); this.nades.splice(this.nades.indexOf(n), 1); continue; } // (someone else's: its bang comes from the host)
        G.R.dynRoot.remove(n.mesh);
        this.nades.splice(this.nades.indexOf(n), 1);
        if (n.own && n.kind === 'flash') G.Me.flashBang(p.clone().add(new THREE.Vector3(0, 0.1, 0)));
        else if (n.own) G.Me.explode(p.clone().add(new THREE.Vector3(0, 0.25, 0)), 5, 160, true); // (just off the floor it's on, any floor)
        else if (n.enemy && G.Net.isHost) G.Server.enemyBoom(p.clone().add(new THREE.Vector3(0, 0.25, 0)));
      }
    }

    // warn about any live grenade nearby (yours hurt too)
    let near = null, nd = 7;
    if (G.Me.pos && !G.Me.dead) for (const n of this.nades) { const d = n.pos.distanceTo(G.Me.pos); if (d < nd) { nd = d; near = n; } }
    G.HUD.nadeWarn(near);

    for (const pg of this.pings) pg.t -= dt;
    this.pings = this.pings.filter((pg) => pg.t > 0);
  },
};
