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
  clearLevel() {
    this.vRounds = [];
    G.Casings.clear();
    if (this.pings2) { for (const q of this.pings2.values()) { G.R.dynRoot.remove(q.s); q.s.material.map.dispose(); q.s.material.dispose(); } this.pings2.clear(); }
    for (const ev of this.enemies.values()) this.removeRig(ev.rig);
    this.enemies.clear();
    for (const n of this.nades) G.R.dynRoot.remove(n.mesh);
    this.nades = [];
    this.pings = [];
    for (const v of this.evidence.values()) G.R.dynRoot.remove(v.mesh);
    this.evidence.clear();
    for (const pv of this.players.values()) { pv.st = null; pv.rig.root.visible = false; }
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
        const rig = G.Rig.create({ style: 'tactical', color: info.color, animal: info.animal, callName: info.name, seed: id.length * 977, bare: true, look: info.look }); // dressed as they picked, kit from st.kt
        const tag = null; // (no nameplates over teammates' heads: you know them by their patches and kit)
        rig.root.visible = false;
        G.R.dynRoot.add(rig.root);
        pv = { id, name: info.name, color: info.color, animal: info.animal, rig, tag, st: null, pos: new THREE.Vector3(), yaw: 0, pitch: 0, first: true };
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
    if (!this.warmed) { this.warmed = true; setTimeout(() => G.R.warmup(), 0); } // (compile everything once the level's full)
    const seen = new Set();
    for (const [id, type, x, z, yaw, hp, aim, alert, crouch, lean, armed, scode, surp, door, kit, fl, str] of m.e) {
      seen.add(id);
      let ev = this.enemies.get(id);
      if (!ev) {
        if (!G.ENEMIES[type]) continue;
        // the type, with this suspect's kit (weapon | vest | helmet) laid over it
        const def = Object.create(G.ENEMIES[type]);
        if (kit) { const [wpn, vest, helmet] = kit.split('|'); def.wpn = wpn; def.vest = vest; def.helmet = helmet; }
        const rig = G.Rig.create({ style: def.style, scale: def.scale, boss: !!def.boss, seed: id * 7919 + 13, dressed: true });
        rig.powered = true; // a physically simulated body, held up by its muscles (js/rig.js powerStep)
        if (!def.civ) rig.setKit(G.Rig.armourKit(def.vest, def.helmet, def.style === 'armored')); // their armour, as an officer's would look
        if (def.wpn && armed) { rig.setGun(def.wpn); rig.holster(armed === 1); }
        G.R.dynRoot.add(rig.root);
        ev = { id, type, def, rig, pos: new THREE.Vector3(x, 0, z), tgt: new THREE.Vector3(x, 0, z), yaw, tgtYaw: yaw, hp, alive: true, deadT: 0, lean: 0 };
        this.enemies.set(id, ev);
      }
      if (!ev.alive) continue;
      // health dropped from someone else's shot: flinch away from the nearest player
      if (hp < ev.hp && !ev.selfHit) {
        const src = this.nearestPlayer(ev.pos);
        if (src) ev.rig.hit(ev.pos.clone().sub(src).setY(0).normalize());
      }
      ev.selfHit = false;
      ev.tgt.set(x, 0, z); ev.tgtYaw = yaw; ev.hp = hp; ev.aim = aim; ev.alert = alert; ev.crouch = !!crouch; ev.lean = lean || 0;
      ev.scode = scode || 0;
      ev.bleed = !!(fl & 1); ev.limp = !!(fl & 2); ev.reloading = !!(fl & 4); // wounds and reloads, from the host
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
  addEvidence(i, wpn, x, z) {
    if (this.evidence.has(i)) return;
    const mesh = G.GunModels.world(wpn);
    mesh.position.set(x, 0.05, z);
    mesh.rotation.set(0, Math.random() * Math.PI * 2, Math.PI / 2); // lying on its side
    // a glowing yellow outline until it's bagged, seen through anything but walls and floors (G.R.render)
    this.addOutline(mesh);
    G.R.dynRoot.add(mesh);
    this.evidence.set(i, { mesh, wpn, x, z });
  },
  // Outline: the gun's silhouette marks the stencil, then three shells pushed out along the surface normals
  // by a fixed number of pixels draw only outside it: a bright line fading out in two softer bands. Each band
  // draws a pixel once (it marks the stencil as it goes), so overlapping triangles don't stack up.
  outlineMats() {
    if (this._outline) return this._outline;
    const vs = `uniform float px; uniform vec2 res;
      void main() {
        vec4 clip = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        vec2 d = (projectionMatrix * vec4(normalize(normalMatrix * normal), 0.0)).xy;
        float l = length(d);
        if (l > 1e-5) clip.xy += d / l * px * clip.w * 2.0 / res;
        gl_Position = clip;
      }`;
    const fs = 'uniform vec3 color; uniform float opacity; void main() { gl_FragColor = vec4(color, opacity); }';
    const res = { value: new THREE.Vector2(window.innerWidth, window.innerHeight) };
    const silhouette = new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false, fog: false,
      stencilWrite: true, stencilRef: 4, stencilFunc: THREE.AlwaysStencilFunc, stencilZPass: THREE.ReplaceStencilOp });
    // ref 3, 2, 1: each band draws where the stencil is still below its ref, then raises it
    const bands = [[3, 2.2, 1], [2, 5, 0.42], [1, 9, 0.16]].map(([ref, px, op], i) => {
      const m = new THREE.ShaderMaterial({ vertexShader: vs, fragmentShader: fs, transparent: true, depthWrite: false,
        uniforms: { px: { value: px }, res, color: { value: new THREE.Color(0xffc830) }, opacity: { value: op } },
        stencilWrite: true, stencilRef: ref, stencilFunc: THREE.GreaterStencilFunc, stencilZPass: THREE.ReplaceStencilOp });
      m.userData.base = op;
      m.userData.order = i + 1;
      return m;
    });
    return (this._outline = { silhouette, bands, res });
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
    out.boundingSphere = geo.boundingSphere;
    this._smooth.set(geo, out);
    return out;
  },
  addOutline(mesh) {
    const O = this.outlineMats();
    for (const part of [...mesh.children]) {
      const sil = new THREE.Mesh(part.geometry, O.silhouette);
      sil.layers.set(2);
      mesh.add(sil);
      const sg = this.smoothGeo(part.geometry);
      for (const m of O.bands) {
        const b = new THREE.Mesh(sg, m);
        b.layers.set(2); b.renderOrder = m.userData.order; b.frustumCulled = false;
        mesh.add(b);
      }
    }
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
  // The weapon case's contents and lid. The gun lies on its side in the foam, centred, muzzle to one end
  // (scaled down only if it's longer than the case).
  syncCase() {
    const map = G.Game.map, cv = map && map.caseView;
    if (!cv) return;
    if (!cv.synced) { cv.synced = true; if (G.Game.caseOpen) cv.open = 1; } // joined with it already open
    const code = G.Game.wcase ? G.Game.wcase.code : null;
    if (code === cv.code) return;
    cv.code = code;
    cv.holder.clear();
    if (!code) return;
    const gun = G.GunModels.world(code), wrap = new THREE.Group(), tmp = new THREE.Group();
    gun.updateMatrixWorld(true);
    const b0 = new THREE.Box3().setFromObject(gun), len = b0.max.z - b0.min.z;
    gun.scale.setScalar(Math.min(1, 1.28 / len));
    gun.rotation.z = Math.PI / 2; // on its side
    wrap.rotation.y = Math.PI / 2; // along the case
    wrap.add(gun); tmp.add(wrap); tmp.updateMatrixWorld(true);
    const b = new THREE.Box3().setFromObject(wrap);
    wrap.position.set(-(b.min.x + b.max.x) / 2, -b.min.y, -(b.min.z + b.max.z) / 2);
    tmp.remove(wrap);
    cv.holder.add(wrap);
  },
  // a body that died before we joined: lay it out where it fell
  addBody(id, type, x, z, yaw, secured) {
    if (this.enemies.has(id)) return;
    const def = G.ENEMIES[type];
    if (!def) return;
    const rig = G.Rig.create({ style: def.style, scale: def.scale, boss: !!def.boss, seed: id * 7919 + 13, dressed: true });
    if (!def.civ) rig.setKit(G.Rig.armourKit(def.vest, def.helmet, def.style === 'armored'));
    G.R.dynRoot.add(rig.root);
    const ev = { id, type, def, rig, pos: new THREE.Vector3(x, 0, z), tgt: new THREE.Vector3(x, 0, z), yaw, tgtYaw: yaw, hp: 0, alive: false, deadT: 0, lean: 0 };
    rig.root.position.set(x, 0, z); rig.root.rotation.y = yaw;
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
    v.mesh.position.set(v.x, 0.008, v.z);
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
  zipPoint(ev, t, living) {
    const rig = ev.rig;
    rig.root.updateMatrixWorld(true);
    const wr = rig.armL.tie.getWorldPosition(new THREE.Vector3()).add(rig.armR.tie.getWorldPosition(new THREE.Vector3())).multiplyScalar(0.5);
    if (!living) { // a body: a hand on the shoulder to turn it over, then at the wrists
      return rig.chest.localToWorld(new THREE.Vector3(0, 0.22, 0)).lerp(wr, G.U.smooth(0.38, 0.6, t));
    }
    return rig.chest.localToWorld(new THREE.Vector3(0, 0.16, 0.14)).lerp(wr, G.U.smooth(0.42, 0.56, t));
  },
  discardDrop(rig) { if (rig.dropped) { if (rig.dropped.g.parent) rig.dropped.g.parent.remove(rig.dropped.g); rig.dropped = null; } },
  // A window breaking: the pane goes, a burst of glass falls both sides of it, and it's heard. at, dir: where
  // the round went through (optional)
  breakGlass(id, at, dir) {
    const map = G.Game.map, w = map && map.windows && map.windows[id];
    if (!w || w.broken) return;
    w.broken = true;
    const pane = map.winMeshes && map.winMeshes[id];
    if (pane) pane.visible = false;
    const p = at ? at.clone() : new THREE.Vector3(w.x, (G.Level.SILL + G.Level.TOP) / 2, w.z);
    for (let k = 0; k < 4; k++) {
      const q = new THREE.Vector3(w.x + (w.nz ? (Math.random() - 0.5) * w.len : 0), G.Level.SILL + Math.random() * (G.Level.TOP - G.Level.SILL), w.z + (w.nx ? (Math.random() - 0.5) * w.len : 0));
      G.R.particles(q, 14, 0xd8eef5, 1.6, 1.2, 9, 0.7, dir ? [dir.x * 1.5, 0, dir.z * 1.5] : null);
    }
    if (G.Me && G.Me.pos) G.Audio.glass(Math.hypot(w.x - G.Me.pos.x, w.z - G.Me.pos.z));
  },
  // A weapon light and/or laser from `from` along dir: the light shines, the laser lands on the first wall or
  // person in its way (a person as a rough column: standing up to 1.8 m, 0.25 m round). skip: whose it is.
  tacBeam(from, dir, fl, skip, drawFrom) {
    const map = G.Game.map;
    if (!map) return;
    const src = drawFrom || from; // (where the light and the beam visibly come from)
    if (fl & 1) G.R.tacLight(src, dir, fl & 8 ? 1.6 : 1);
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
    for (const ev of this.enemies.values()) if (ev.alive) body(ev.pos, ev.crouch ? 1.2 : 1.8);
    for (const [id, pv] of this.players) if (id !== skip && pv.st && !pv.st.dd) body(pv.pos, pv.st.cr ? 1.2 : 1.8);
    if (skip != null) body(G.Me.pos, G.Me.crouch ? 1.2 : 1.8);
    G.R.tacLaser(src, from.clone().addScaledVector(dir, t - 0.01), !!(fl & 4));
  },
  // a suspect reloading: the magazine out and in (or shells going in one by one), heard if you're close
  enemyReload(m) {
    const ev = this.enemies.get(m.e);
    if (!ev || !ev.alive || !G.Me || !G.Me.pos) return;
    const d = ev.pos.distanceTo(G.Me.pos);
    if (d > 25) return;
    const A = G.Audio, dur = Math.min(5, +m.dur || 2) * 1000;
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
      // a miss from a gun pointing well off the line (someone weak, shooting from the floor) goes where the
      // barrel points, to whatever it meets
      const bore = new THREE.Vector3(0, 0, -1).transformDirection(sh.rig.gun.matrixWorld), line = to.clone().sub(f).normalize();
      if (!(m.d > 0) && bore.dot(line) < Math.cos(10 * Math.PI / 180) && G.Game.map) to = f.clone().addScaledVector(bore, G.Level.raycast(G.Game.map, f.x, f.y, f.z, bore.x, bore.y, bore.z, 60).t);
    }
    G.R.muzzleFlashAt(f);
    const me = G.R.camera.position;
    const wdef = G.WEAPONS[m.w] || G.WEAPONS[G.ENEMIES[m.ty].wpn];
    // their round flies there (a machine gunner's belt has a tracer every fourth), and does what the host
    // decided when it arrives: hits you, or someone else, or the wall
    const ev0 = this.enemies.get(m.e), tr = wdef.cls === 'LMG' && ev0 && ((ev0.shots = (ev0.shots || 0) + 1) % 4 === 1);
    const hitMe = m.d > 0 && m.tg === G.Net.myId, hz = m.hz, fromP = f.clone(), toP = to.clone();
    this.visRound(f, to, wdef, tr ? 'tracer' : G.ballFor(G.calOf(wdef)), () => {
      if (m.d > 0) { if (hitMe) { if (G.Game.phase === 'level') G.Me.takeHits(hz, wdef, fromP); } else G.R.impact(toP, null, 'blood'); }
      else this.wallHit(fromP, toP);
    });
    G.Casings.fired(wdef, false, f, to);
    if (!G.GunAudio.play(wdef.id, f)) G.Audio.shot(G.CLASS_SND[wdef.cls] || G.CLASS_SND.AR, me.distanceTo(f));
    if (m.tg !== G.Net.myId || !(m.d > 0)) G.Audio.flyby(f, to, wdef, G.ballFor(G.calOf(wdef))); // past you (a hit on you is felt, not heard going by)
    this.pings.push({ x: m.f[0], z: m.f[2], t: 2.5 });
    const ev = this.enemies.get(m.e);
    if (ev) ev.rig.recoil(G.Server.kickOf({ str: ev.str }, wdef)); // (the same kick the host gave it)
  },
  // a round that missed: where its line meets a wall (or a door, or furniture), with the surface's normal so it
  // leaves a hole there; sparks only if it ends in the air
  wallHit(f, to) {
    const map = G.Game.map, d = to.clone().sub(f), len = d.length();
    if (map && len > 0.01) {
      d.divideScalar(len);
      const h = G.Level.raycast(map, f.x, f.y, f.z, d.x, d.y, d.z, len + 0.5);
      if (h.n && h.t <= len + 0.45 && !h.view) { G.R.impact(f.clone().addScaledVector(d, h.t), h.n, 'wall'); return; }
    }
    G.R.impact(to, null, 'wall');
  },
  enemyThrow(id) { const ev = this.enemies.get(id); if (ev && ev.alive) ev.rig.throwNade(); },
  remoteShot(m) {
    const f = new THREE.Vector3(m.f[0], m.f[1], m.f[2]), to = new THREE.Vector3(m.to[0], m.to[1], m.to[2]);
    const def = G.Gunsmith.fromCode(m.w);
    if (!def) return;
    const pv = this.players.get(m.id);
    if (pv) pv.rig.recoil();
    G.Audio.flyby(f, to, def, m.am || G.ballFor(G.calOf(def))); // a teammate's round going past you
    // their round flies to where it was headed (the walls it'll meet, as the shooter worked it out)
    const am = m.am || G.ballFor(G.calOf(def)), fromP = f.clone(), toP = to.clone();
    this.visRound(f, to, def, am, () => {
      if (def.cls === 'RAIL') G.R.tracer(fromP, toP, def.tracer || 0x55ddff, 0.06);
      if (!def.explosive) this.wallHit(fromP, toP);
    });
    if (!m.sil) G.R.muzzleFlashAt(f, def.tracer || 0xffb060);
    G.Casings.fired(def, false, f, to, m.am);
    const d = G.R.camera.position.distanceTo(f);
    if (def.cls === 'RAIL') G.Audio.rail(d);
    else if (def.cls === 'BOW') G.Audio.bow(d);
    else if (!G.GunAudio.play(def.soundKey, f)) G.Audio.shot(m.sil ? G.SUPPRESSOR.snd : def.snd, d);
  },

  // ---------------------------------------------------------------- other people's rounds
  // A round someone else fired, as you see it: from f straight to `to` at its speed (G.roundSpeed, slowing with
  // drag), drawn like your own (G.R.bullet); arrive: what happens when it gets there.
  visRound(f, to, def, am, arrive) {
    const len = f.distanceTo(to);
    if (len < 0.05) { arrive(); return; }
    const rail = def.cls === 'RAIL';
    (this.vRounds = this.vRounds || []).push({ f: f.clone(), dir: to.clone().sub(f).divideScalar(len), len, d: 0, def, arrive,
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
      G.R.bullet(b.f.clone().addScaledVector(b.dir, b.d), b.dir, b.d, b.def, b.tracer, b.v);
      if (b.d >= b.len || b.v < 30) { rs.splice(i, 1); b.arrive(); }
    }
  },
  addNade(p, v, fuse, own, enemy) {
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(0.08, 8, 6), new THREE.MeshLambertMaterial({ color: 0x3a4a2a, emissive: 0x220000 }));
    mesh.position.copy(p);
    G.R.dynRoot.add(mesh);
    this.nades.push({ pos: new THREE.Vector3().copy(p), vel: new THREE.Vector3().copy(v), fuse, own, enemy, mesh });
  },

  // An officer losing blood: drops where they stand or walk (more, the heavier the bleeding), and a pool
  // under them when they're down or dead. who: the owner key, pos: their feet, bl: 0 none, 1 light, 2 heavy.
  officerBlood(who, pos, bl, down, dt) {
    if (!bl) return;
    const k = who === G.Me ? (this._myDrip = (this._myDrip || 0) - dt) : (who._drip = (who._drip || 0) - dt);
    if (down) G.R.bloodPool(who, pos.x, pos.z, bl > 1 ? 1.0 : 0.5, bl > 1 ? 30 : 60);
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
        if (ev.deadT > 1.5 && ev.rig.rd && !ev.pooled) { ev.pooled = true; const P = ev.rig.rd.P; G.R.bloodPool(ev, (P[0].x + P[3].x) / 2, (P[0].z + P[3].z) / 2, 1.1 + Math.random() * 0.4, 30); }
      }
      // aim pitch toward whoever they're engaging
      let pitch = 0;
      const aimed = ev.aim === G.Net.myId ? G.Me.pos : ev.aim && this.players.get(ev.aim) ? this.players.get(ev.aim).pos : null;
      const tgt = aimed || (ev.alert ? this.nearestPlayer(ev.pos) : null);
      if (tgt) pitch = Math.atan2(tgt.y + 1.2 - 1.4 * ev.def.scale, Math.max(1, Math.hypot(tgt.x - ev.pos.x, tgt.z - ev.pos.z)));
      let pose = ev.scode === 1 ? 'handsup' : ev.scode === 2 ? 'cuffed' : ev.scode === 3 ? 'cower' : null;
      // being taken down and zip-tied by an officer (me or a teammate)
      let tk = -1;
      const ma = G.Me.action;
      if (ma && ma.kind === 'zip' && ma.target === ev.id) tk = ma.t / ma.dur;
      for (const pv of this.players.values()) if (pv.st && pv.st.act === 'z' && pv.st.zt === ev.id) tk = pv.st.ap || 0;
      const tied = ev.scode === 2 || ev.arrested;
      if (!ev.alive && !ev.def.civ && !ev.bodySecured) ev.rig.secure(tk); // turned over and wrists behind the back
      if (ev.alive && !tied && tk >= 0) { pose = 'takedown'; ev.rig.zip(tk > 0.8); }
      else if (ev.alive && ev.rig.zipped !== tied) ev.rig.zip(tied); // let go before the tie was done
      if (ev.arrested && ev.scode !== 2) pose = 'cuffed'; // the arrest message can beat the next snapshot
      let act = null;
      if (ev.alive && ev.doorT != null && ev.doorT < 0.6) { ev.doorT += dt; act = { kind: 'open', t: Math.min(1, ev.doorT / 0.5), hand: ev.rig.gun && !ev.rig.slung ? 'L' : 'R' }; }
      // Lying prone (restrained, or being taken down), a body stretches about 1.85 m ahead of the feet: with a
      // wall closer than that, it's drawn slid back from it (as far as the room behind allows) instead of
      // lying through it.
      let at = ev.pos;
      // Leaning out round a corner, the body really is out at the lean point (where the host shoots from: 0.55 m
      // to the side), not tilting from behind the edge (eased in and out with the lean itself)
      ev.leanS = (ev.leanS || 0) + ((ev.alive ? ev.lean : 0) - (ev.leanS || 0)) * Math.min(1, dt * 7);
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
      // (the body's physics only near you: farther off they're animated, which no one can tell apart)
      const near = ev.pos.distanceToSquared(G.R.camera.position) < 40 * 40;
      // (what they're aiming at: a weakened or downed suspect points the gun at it from the hand, js/rig.js)
      const aimAt = tgt && ev.armed === 2 && ev.alert && !ev.surp && !ev.reloading && !pose ? new THREE.Vector3(tgt.x, tgt.y + 1.2, tgt.z) : null;
      ev.rig.update(dt, { pos: at, yaw: ev.yaw, pitch, crouch: ev.crouch || (ev.str != null && ev.str < 0.4), alert: !!ev.alert && ev.armed === 2 && !ev.surp && !ev.reloading, lean: ev.lean, pose, tk, act, str: near ? (ev.str == null ? 1 : ev.str) : null, aimAt });
      // bleeding: drips falling from them as they go
      if (ev.alive && ev.bleed && (ev.dripT = (ev.dripT || 0) - dt) <= 0) {
        ev.dripT = 0.25 + Math.random() * 0.35;
        G.R.particles(new THREE.Vector3(ev.pos.x + (Math.random() - 0.5) * 0.3, (ev.crouch ? 0.6 : 0.9) * ev.def.scale, ev.pos.z + (Math.random() - 0.5) * 0.3), 2, 0x7a0808, 0.3, 0.7, 9, 0.2, null, true);
      }
    }

    // remote players
    for (const pv of this.players.values()) {
      if (!pv.st) { pv.rig.root.visible = false; continue; }
      const st = pv.st;
      pv.rig.root.visible = !st.dd;
      if (st.dd) continue;
      pv.pos.lerp(new THREE.Vector3(st.p[0], st.p[1], st.p[2]), Math.min(1, dt * 14));
      pv.yaw += G.U.angDiff(pv.yaw, st.yw) * Math.min(1, dt * 14);
      pv.pitch += (st.pt - pv.pitch) * Math.min(1, dt * 14);
      pv.rig.setGun(st.w); // their build code: the same parts on their gun
      pv.rig.holster(!!st.sw); // hands busy: weapon away
      const act = st.act ? { kind: { o: 'open', c: 'close', k: 'kick', z: 'zip', b: 'bag' }[st.act], t: st.ap || 0, hand: 'R' } : null;
      if (act && act.kind === 'zip') { const tv = this.enemies.get(st.zt); if (tv) act.pt = this.zipPoint(tv, act.t, tv.alive); act.pull = !!st.pl; }
      // their restraining / bagging sounds, as they reach each step
      if (act && pv.lastAct === st.act) G.Audio.foley(act.kind, pv.lastAp || 0, act.t, pv.pos.distanceTo(G.Me.pos));
      pv.lastAct = st.act; pv.lastAp = act ? act.t : 0;
      const kneel = (st.act === 'z' && (st.ap || 0) > 0.3) || st.act === 'b';
      pv.rig.update(dt, { pos: pv.pos, yaw: pv.yaw, pitch: pv.pitch, crouch: (!!st.cr || kneel) && !st.dn, alert: !st.lr && !st.sw, lean: st.ln || 0, state: st.dn ? 'down' : 'alive', act });
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
      G.R.laser(a, b);
    }
    G.R.endLasers();
    this.laserBeep -= dt;
    if (aimedAtMe && this.laserBeep <= 0) { G.Audio.laser(); this.laserBeep = 0.25; }
    G.HUD.sniperWarn(aimedAtMe);

    // weapon lights and lasers: yours (from the gun in your hands, along its bore) and your squad's (flags in
    // their state: 1 light, 2 laser, 4 the laser's green, 8 a bright light)
    G.R.tacBegin();
    const me = G.Me, mw = G.Game.phase === 'level' && me.cur ? me.cur() : null, mf = mw && !me.dead ? me.tacFlags(mw) : 0;
    if (mf) {
      // aimed from the eye along the bore (where the rounds go); drawn from the gun in your hands
      const dir = me.boreDir(), vm = G.R.vm, fl = vm && vm.userData.flash;
      let gun = null;
      if (fl) { vm.updateMatrixWorld(true); gun = fl.getWorldPosition(new THREE.Vector3()); }
      this.tacBeam(G.R.camera.position.clone(), dir, mf, null, gun);
    }
    for (const [id, pv] of this.players) {
      const st = pv.st;
      if (!st || !st.tl || st.dd || st.sw || !pv.rig.root.visible) continue;
      const cp = Math.cos(pv.pitch), dir = new THREE.Vector3(-Math.sin(pv.yaw) * cp, Math.sin(pv.pitch), -Math.cos(pv.yaw) * cp);
      const gi = pv.rig.gunInfo, from = pv.rig.gun && gi ? pv.rig.gun.localToWorld(new THREE.Vector3(gi.muzzles[0][2], gi.muzzles[0][1], -gi.muzzles[0][0])) : pv.pos.clone().add(new THREE.Vector3(0, 1.4, 0)).addScaledVector(dir, 0.5);
      this.tacBeam(from, dir, st.tl, id);
    }
    G.R.tacEnd();

    // first aid cabinet doors swinging open
    const cabV = G.Game.map && G.Game.map.cabViews;
    if (cabV) cabV.forEach((cv, i) => {
      const want = G.Game.cabs && G.Game.cabs[i] && G.Game.cabs[i][0] ? 1 : 0;
      if (want && cv.open === 0) { const c = G.Game.map.cabinets[i]; G.Audio.clink(Math.hypot(c.x - G.Me.pos.x, c.z - G.Me.pos.z)); }
      cv.open = want ? Math.min(1, cv.open + dt / 0.5) : 0;
      cv.door.rotation.y = -1.9 * (1 - Math.pow(1 - cv.open, 3));
    });
    // the weapon case lid: latches clack, then it swings up and back against the wall
    const cv = G.Game.map && G.Game.map.caseView;
    if (cv) {
      const want = G.Game.caseOpen ? 1 : 0;
      if (want && cv.open === 0) { const mc = G.Game.map.case; G.Audio.clink(Math.hypot(mc.x - G.Me.pos.x, mc.z - G.Me.pos.z)); }
      cv.open = want ? Math.min(1, cv.open + dt / 0.8) : 0;
      cv.lid.rotation.x = -1.78 * (1 - Math.pow(1 - cv.open, 3));
    }

    // evidence outline: on while any weapon is still to be bagged, gently pulsing
    let glowing = false;
    for (const v of this.evidence.values()) if (!v.secured && v.mesh.visible) { glowing = true; break; }
    G.R.hasGlow = glowing;
    if (glowing && this._outline) {
      const p = 0.5 + 0.5 * Math.sin(performance.now() / 300);
      this._outline.res.value.set(window.innerWidth, window.innerHeight);
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
      m.position.set(v.x, 0.05, v.z); m.scale.setScalar(1); m.visible = true;
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
      n.vel.y -= 18 * dt;
      const p = n.pos;
      const inside = (x, y, z) => {
        return L.boxesAt(map, Math.floor(x / L.TS), Math.floor(z / L.TS)).some((b) => y >= b.y0 && y < b.h && Math.abs(x - b.cx) < b.hx && Math.abs(z - b.cz) < b.hz);
      };
      let nx = p.x + n.vel.x * dt;
      if (inside(nx, p.y, p.z)) { n.vel.x *= -0.45; nx = p.x; }
      let nz = p.z + n.vel.z * dt;
      if (inside(nx, p.y, nz)) { n.vel.z *= -0.45; nz = p.z; }
      let ny = p.y + n.vel.y * dt;
      if (inside(nx, ny, nz)) { n.vel.y *= -0.4; n.vel.x *= 0.7; n.vel.z *= 0.7; ny = p.y; }
      if (ny < 0.08) { ny = 0.08; n.vel.y *= -0.4; n.vel.x *= 0.7; n.vel.z *= 0.7; }
      if (ny > L.WALL_H - 0.1) { ny = L.WALL_H - 0.1; n.vel.y *= -0.3; }
      p.set(nx, ny, nz);
      n.mesh.position.copy(p);
      n.fuse -= dt;
      n.mesh.material.emissive.setHex(Math.floor(n.fuse * 8) % 2 ? 0xff2200 : 0x220000);
      if (n.fuse <= 0) {
        G.R.dynRoot.remove(n.mesh);
        this.nades.splice(this.nades.indexOf(n), 1);
        if (n.own) G.Me.explode(p.clone().setY(Math.max(p.y, 0.3)), 5, 160, true);
        else if (n.enemy && G.Net.isHost) G.Server.enemyBoom(p.clone().setY(Math.max(p.y, 0.3)));
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
