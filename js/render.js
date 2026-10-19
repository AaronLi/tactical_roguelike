'use strict';
const _tv = new THREE.Vector3();
// Three.js scene, character models, first-person viewmodels and particle effects.
G.R = {
  init() {
    const r = (this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' }));
    r.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    r.setSize(window.innerWidth, window.innerHeight);
    r.domElement.id = 'c';
    document.body.prepend(r.domElement);
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x0b0d10);
    this.scene.fog = new THREE.Fog(0x0b0d10, 8, 60);
    this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.03, 200);
    this.camera.rotation.order = 'YXZ';
    this.scene.add(this.camera);

    // Dim by design: rooms are lit by their ceiling lamps, corridors are left in the gloom
    this.hemi = new THREE.HemisphereLight(0xb0c0d0, 0x302820, 0.26);
    this.scene.add(this.hemi);
    this.ambient = new THREE.AmbientLight(0xffffff, 0.05);
    this.scene.add(this.ambient);

    this.muzzleLights = [0, 1, 2].map(() => {
      const l = new THREE.PointLight(0xffb060, 0, 9, 2);
      this.scene.add(l);
      l.userData.t = 0;
      return l;
    });
    this.muzzleIdx = 0;

    // Viewmodel is drawn in its own pass after clearing depth, so guns never clip into walls
    r.autoClear = false;
    this.vmScene = new THREE.Scene();
    this.vmHolder = new THREE.Group();
    this.vmHolder.matrixAutoUpdate = false;
    this.vmScene.add(this.vmHolder);
    this.vmRoot = new THREE.Group();
    this.vmHolder.add(this.vmRoot);
    this.vmScene.add(new THREE.HemisphereLight(0xdde6f0, 0x2a2622, 0.55));
    const vdl = new THREE.DirectionalLight(0xffffff, 0.3); vdl.position.set(1, 2, 1); this.vmScene.add(vdl);
    this.vmScene.environment = this._envMap(r);
    this.vmMuzzle = new THREE.PointLight(0xffb060, 0, 3, 2);
    this.vmMuzzle.position.set(0.2, -0.1, -0.8);
    this.vmHolder.add(this.vmMuzzle);

    this.levelRoot = new THREE.Group();
    this.scene.add(this.levelRoot);
    this.dynRoot = new THREE.Group();
    this.scene.add(this.dynRoot);

    this._initFx();
    window.addEventListener('resize', () => this.resize());
  },
  // A soft studio-style environment (gradient dome + a few softboxes) baked with PMREM.
  _envMap(r) {
    const env = new THREE.Scene();
    const geo = new THREE.SphereGeometry(10, 24, 12);
    const col = [], pos = geo.attributes.position, top = new THREE.Color(0x8b939c), bot = new THREE.Color(0x1c1a17), c = new THREE.Color();
    for (let i = 0; i < pos.count; i++) { c.copy(bot).lerp(top, THREE.MathUtils.clamp(pos.getY(i) / 10 * 0.5 + 0.5, 0, 1)); col.push(c.r, c.g, c.b); }
    geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    env.add(new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ side: THREE.BackSide, vertexColors: true })));
    for (const [x, y, z, w, h] of [[0, 8, 0, 8, 0.2], [6, 3, -4, 0.2, 4], [-7, 2, 3, 0.2, 3]]) {
      const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, w > 1 ? 4 : 3), new THREE.MeshBasicMaterial({ color: 0xffffff }));
      b.position.set(x, y, z); env.add(b);
    }
    const pm = new THREE.PMREMGenerator(r);
    const tex = pm.fromScene(env, 0.04).texture;
    pm.dispose();
    return tex;
  },
  resize() {
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
  },
  setLevel(map) {
    this.clearLevel();
    this.levelRoot.add(G.Level.buildMesh(map));
    const th = map.theme;
    this.scene.fog.color.setHex(th.fog);
    this.scene.background.setHex(th.fog);
    this.hemi.color.setHex(th.light);
  },
  clearLevel() {
    const dispose = (o) => {
      o.traverse((c) => {
        if (c.geometry) c.geometry.dispose();
        if (c.material) (Array.isArray(c.material) ? c.material : [c.material]).forEach((m) => { if (m.map) m.map.dispose(); m.dispose(); });
      });
    };
    while (this.levelRoot.children.length) { const c = this.levelRoot.children[0]; dispose(c); this.levelRoot.remove(c); }
    this.decals.forEach((d) => (d.visible = false));
    if (this.bloodMarks) { this.bloodMarks.forEach((d) => (d.visible = false)); this.pools.forEach((d) => { d.visible = false; d.userData.owner = null; }); }
  },
  // ------------------------------------------------------------ blood on the environment
  // the surface under (x, z) at or below height y: the floor, or the top of a piece of furniture
  bloodFloor(x, z, y) { const map = G.Game && G.Game.map; return map ? G.Level.groundAt(map, x, z, 0.01, y) : 0; },
  // a drop (or a smear, if it came in fast) lying where it landed
  bloodDrop(x, y, z, size = 0.06, kind = 'drop') {
    const m = this.bloodMarks[this.bloodIdx]; this.bloodIdx = (this.bloodIdx + 1) % this.bloodMarks.length;
    m.material = this.bloodMats[kind] || this.bloodMats.drop;
    m.position.set(x, y + 0.004, z); m.rotation.set(-Math.PI / 2, 0, Math.random() * 6.28);
    m.scale.set(size * (0.8 + Math.random() * 0.5), size * (0.8 + Math.random() * 0.5), 1);
    m.visible = true;
  },
  // spatter on a wall: p the point on it, n its normal
  bloodWall(p, n, size = 0.35) {
    const m = this.bloodMarks[this.bloodIdx]; this.bloodIdx = (this.bloodIdx + 1) % this.bloodMarks.length;
    m.material = this.bloodMats.spatter;
    m.position.set(p.x + n[0] * 0.012, p.y + n[1] * 0.012, p.z + n[2] * 0.012);
    m.lookAt(p.x + n[0], p.y + n[1], p.z + n[2]); m.rotation.z = Math.random() * 6.28;
    m.scale.set(size, size, 1);
    m.visible = true;
  },
  // A pool spreading out under someone (owner: anything, so it's started once and can keep growing as they
  // keep bleeding). max: how wide it gets (m), over grow seconds.
  bloodPool(owner, x, z, max = 0.9, grow = 25) {
    let m = this.pools.find((q) => q.visible && q.userData.owner === owner);
    if (!m) {
      m = this.pools[this.poolIdx]; this.poolIdx = (this.poolIdx + 1) % this.pools.length;
      m.userData = { owner, t: 0, max, grow }; m.rotation.z = Math.random() * 6.28;
      m.position.set(x, this.bloodFloor(x, z, 0.3) + 0.003, z); m.scale.set(0.05, 0.05, 1); m.visible = true;
    } else { m.userData.max = Math.max(m.userData.max, max); m.userData.grow = grow; }
    return m;
  },

  // ------------------------------------------------------------ characters (see js/rig.js)
  nameTag(text, color) {
    const c = document.createElement('canvas');
    c.width = 256; c.height = 64;
    const g = c.getContext('2d');
    g.font = 'bold 30px Consolas, monospace';
    g.textAlign = 'center';
    g.lineWidth = 6; g.strokeStyle = 'rgba(0,0,0,0.8)'; g.strokeText(text, 128, 42);
    g.fillStyle = G.U.hex(color); g.fillText(text, 128, 42);
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), depthTest: false, transparent: true }));
    s.scale.set(1.6, 0.4, 1);
    s.renderOrder = 10;
    return s;
  },

  // ------------------------------------------------------------ viewmodels
  setViewmodel(def) {
    if (this.vm) { this.vmRoot.remove(this.vm); this.vm.traverse((o) => { if (o.geometry) o.geometry.dispose(); }); }
    this.vm = def ? G.GunModels.viewmodel(def) : null;
    if (this.vm) this.vmRoot.add(this.vm);
  },

  // ------------------------------------------------------------ effects
  _initFx() {
    // muzzle flash texture
    const c = document.createElement('canvas'); c.width = c.height = 64;
    const g = c.getContext('2d');
    const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    grd.addColorStop(0, 'rgba(255,255,255,1)'); grd.addColorStop(0.3, 'rgba(255,200,100,0.8)'); grd.addColorStop(1, 'rgba(255,120,0,0)');
    g.fillStyle = grd;
    g.beginPath();
    for (let i = 0; i < 16; i++) { const a = (i / 16) * Math.PI * 2, rr = i % 2 ? 12 : 32; g.lineTo(32 + Math.cos(a) * rr, 32 + Math.sin(a) * rr); }
    g.fill();
    this.flashTex = new THREE.CanvasTexture(c);

    // tracers: stretched boxes
    this.tracers = [];
    const tg = new THREE.BoxGeometry(1, 1, 1); tg.translate(0, 0, -0.5);
    for (let i = 0; i < 60; i++) {
      const m = new THREE.Mesh(tg, new THREE.MeshBasicMaterial({ color: 0xffd080, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false }));
      m.visible = false; m.userData.life = 0;
      this.scene.add(m); this.tracers.push(m);
    }
    this.tracerIdx = 0;

    // particles
    this.PN = 600;
    const pg = new THREE.BufferGeometry();
    this.pPos = new Float32Array(this.PN * 3);
    this.pCol = new Float32Array(this.PN * 3);
    this.pVel = new Float32Array(this.PN * 3);
    this.pLife = new Float32Array(this.PN);
    this.pBase = new Float32Array(this.PN * 3);
    this.pGrav = new Float32Array(this.PN);
    for (let i = 0; i < this.PN; i++) this.pPos[i * 3 + 1] = -100;
    pg.setAttribute('position', new THREE.BufferAttribute(this.pPos, 3));
    pg.setAttribute('color', new THREE.BufferAttribute(this.pCol, 3));
    this.points = new THREE.Points(pg, new THREE.PointsMaterial({ size: 0.07, vertexColors: true, transparent: true, depthWrite: false }));
    this.points.frustumCulled = false;
    this.scene.add(this.points);
    this.pIdx = 0;

    // bullet hole decals
    this.decals = [];
    const dc = document.createElement('canvas'); dc.width = dc.height = 32;
    const dg = dc.getContext('2d');
    const dgr = dg.createRadialGradient(16, 16, 0, 16, 16, 16);
    dgr.addColorStop(0, 'rgba(0,0,0,0.95)'); dgr.addColorStop(0.35, 'rgba(10,10,10,0.7)'); dgr.addColorStop(1, 'rgba(0,0,0,0)');
    dg.fillStyle = dgr; dg.fillRect(0, 0, 32, 32);
    const decalMat = new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(dc), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4 });
    const dgeo = new THREE.PlaneGeometry(0.14, 0.14);
    for (let i = 0; i < 150; i++) { const d = new THREE.Mesh(dgeo, decalMat); d.visible = false; this.scene.add(d); this.decals.push(d); }
    this.decalIdx = 0;

    // Blood where it lands: droplets (a drop with a few satellites) and smears on the floor or a tabletop,
    // spatter on walls, and pools that spread under the dead and the badly bleeding. Fixed pools of meshes,
    // reused oldest first.
    const bloodTex = (kind) => {
      const c = document.createElement('canvas'); c.width = c.height = 64;
      const g = c.getContext('2d'), blob = (x, y, r, a) => { g.fillStyle = `rgba(${70 + Math.random() * 20},4,6,${a})`; g.beginPath(); g.ellipse(x, y, r, r * (0.8 + Math.random() * 0.4), Math.random() * 3, 0, 7); g.fill(); };
      if (kind === 'pool') { for (let i = 0; i < 14; i++) { const a = Math.random() * 6.28, d = Math.random() * 12; blob(32 + Math.cos(a) * d, 32 + Math.sin(a) * d, 10 + Math.random() * 9, 0.9); } }
      else if (kind === 'spatter') { blob(32, 32, 8, 0.9); for (let i = 0; i < 18; i++) { const a = Math.random() * 6.28, d = 8 + Math.random() * 22; blob(32 + Math.cos(a) * d, 32 + Math.sin(a) * d, 1 + Math.random() * 3, 0.85); } }
      else { blob(32, 32, 13, 0.92); for (let i = 0; i < 5; i++) { const a = Math.random() * 6.28, d = 15 + Math.random() * 12; blob(32 + Math.cos(a) * d, 32 + Math.sin(a) * d, 1.5 + Math.random() * 3, 0.85); } }
      const t = new THREE.CanvasTexture(c); t.anisotropy = 4; return t;
    };
    const bmat = (kind) => new THREE.MeshStandardMaterial({ map: bloodTex(kind), transparent: true, depthWrite: false, roughness: 0.25, metalness: 0.1, polygonOffset: true, polygonOffsetFactor: -3 });
    const bgeo = new THREE.PlaneGeometry(1, 1);
    this.bloodMats = { drop: bmat('drop'), spatter: bmat('spatter'), pool: bmat('pool') };
    this.bloodMarks = [];
    for (let i = 0; i < 400; i++) { const m = new THREE.Mesh(bgeo, this.bloodMats.drop); m.visible = false; m.renderOrder = 1; this.scene.add(m); this.bloodMarks.push(m); }
    this.bloodIdx = 0;
    this.pools = [];
    for (let i = 0; i < 24; i++) { const m = new THREE.Mesh(bgeo, this.bloodMats.pool); m.visible = false; m.rotation.x = -Math.PI / 2; m.userData = {}; this.scene.add(m); this.pools.push(m); }
    this.poolIdx = 0;
    this.pBlood = new Uint8Array(this.PN);

    // explosions
    this.blasts = [];
    for (let i = 0; i < 6; i++) {
      const m = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 12), new THREE.MeshBasicMaterial({ color: 0xff8830, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
      m.visible = false; m.userData.life = 0;
      const l = new THREE.PointLight(0xff8040, 0, 18, 2);
      m.userData.light = l;
      this.scene.add(m, l); this.blasts.push(m);
    }

    // laser sights for marksmen
    this.lasers = [];
    for (let i = 0; i < 8; i++) {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
      const l = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0xff1010, transparent: true, opacity: 0.85 }));
      l.frustumCulled = false; l.visible = false;
      this.scene.add(l); this.lasers.push(l);
    }
    this.laserUsed = 0;

    // weapon lights and lasers (yours and the squad's): a fixed pool, always in the scene (lit or not), so
    // switching one on never changes the shaders
    this.spots = [];
    for (let i = 0; i < 4; i++) {
      const s = new THREE.SpotLight(0xfff1dc, 0, 34, 0.3, 0.6, 1.6);
      s.target = new THREE.Object3D();
      this.scene.add(s, s.target); this.spots.push(s);
    }
    const lc = document.createElement('canvas'); lc.width = lc.height = 32;
    const lg = lc.getContext('2d'), lgr = lg.createRadialGradient(16, 16, 0, 16, 16, 16);
    lgr.addColorStop(0, 'rgba(255,255,255,1)'); lgr.addColorStop(0.25, 'rgba(255,255,255,0.8)'); lgr.addColorStop(1, 'rgba(255,255,255,0)');
    lg.fillStyle = lgr; lg.fillRect(0, 0, 32, 32);
    const laserDotTex = new THREE.CanvasTexture(lc);
    this.pLasers = [];
    for (let i = 0; i < 4; i++) {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
      const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0xff2010, transparent: true, opacity: 0.45, depthWrite: false }));
      line.frustumCulled = false; line.visible = false;
      const dot = new THREE.Sprite(new THREE.SpriteMaterial({ map: laserDotTex, color: 0xff2010, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
      dot.visible = false;
      this.scene.add(line, dot); this.pLasers.push({ line, dot });
    }
  },
  tacBegin() { this.spotUsed = 0; this.pLaserUsed = 0; },
  // a weapon light at pos shining along dir (k: how bright)
  tacLight(pos, dir, k = 1) {
    const s = this.spots[this.spotUsed++]; if (!s) return;
    s.position.copy(pos); s.target.position.copy(pos).add(dir); s.intensity = 0.9 * k; s.distance = 24 + 10 * k;
  },
  // a laser from a to b (where it lands), red or green: a faint beam and a bright dot
  tacLaser(a, b, green) {
    const L = this.pLasers[this.pLaserUsed++]; if (!L) return;
    const col = green ? 0x30ff40 : 0xff2010, arr = L.line.geometry.attributes.position.array;
    arr[0] = a.x; arr[1] = a.y; arr[2] = a.z; arr[3] = b.x; arr[4] = b.y; arr[5] = b.z;
    L.line.geometry.attributes.position.needsUpdate = true;
    L.line.material.color.setHex(col); L.dot.material.color.setHex(col);
    const back = Math.min(0.03, a.distanceTo(b) * 0.5);
    L.dot.position.copy(b).addScaledVector(_tv.subVectors(b, a).normalize(), -back);
    L.dot.scale.setScalar(0.08 + a.distanceTo(b) * 0.006);
    L.line.visible = L.dot.visible = true;
  },
  tacEnd() {
    for (let i = this.spotUsed; i < this.spots.length; i++) this.spots[i].intensity = 0;
    for (let i = this.pLaserUsed; i < this.pLasers.length; i++) this.pLasers[i].line.visible = this.pLasers[i].dot.visible = false;
  },
  tracer(from, to, color = 0xffd080, width = 0.018, life) {
    const m = this.tracers[this.tracerIdx]; this.tracerIdx = (this.tracerIdx + 1) % this.tracers.length;
    const dx = to.x - from.x, dy = to.y - from.y, dz = to.z - from.z, len = Math.hypot(dx, dy, dz);
    if (len < 0.5) return;
    m.position.copy(from);
    m.lookAt(to.x, to.y, to.z);
    m.scale.set(width, width, len);
    m.material.color.setHex(color);
    m.material.opacity = 0.9;
    m.userData.life = m.userData.max = life || (width > 0.03 ? 0.35 : 0.07);
    m.visible = true;
  },
  particles(p, n, color, speed, life, grav = 9, spread = 1, dir, blood) {
    const col = new THREE.Color(color);
    for (let k = 0; k < n; k++) {
      const i = this.pIdx; this.pIdx = (this.pIdx + 1) % this.PN;
      this.pBlood[i] = blood ? 1 : 0;
      this.pPos[i * 3] = p.x; this.pPos[i * 3 + 1] = p.y; this.pPos[i * 3 + 2] = p.z;
      let vx = (Math.random() - 0.5) * 2 * spread, vy = (Math.random() - 0.3) * 2 * spread, vz = (Math.random() - 0.5) * 2 * spread;
      if (dir) { vx += dir[0]; vy += dir[1]; vz += dir[2]; }
      const s = speed * (0.4 + Math.random() * 0.8);
      this.pVel[i * 3] = vx * s; this.pVel[i * 3 + 1] = vy * s; this.pVel[i * 3 + 2] = vz * s;
      this.pLife[i] = life * (0.5 + Math.random() * 0.7);
      this.pGrav[i] = grav;
      const v = 0.75 + Math.random() * 0.25;
      this.pBase[i * 3] = col.r * v; this.pBase[i * 3 + 1] = col.g * v; this.pBase[i * 3 + 2] = col.b * v;
    }
  },
  impact(p, n, kind) {
    if (G.Audio && G.Audio.impactAt) G.Audio.impactAt(p, kind); // heard when it's close
    if (kind === 'blood') { this.particles(p, 8, 0x8a0a0a, 2.5, 1.2, 9, 0.8, n, true); return; } // (each leaves a drop where it lands)
    if (kind === 'armor') { this.particles(p, 6, 0x9fd8ff, 3, 0.25, 6, 1); return; }
    this.particles(p, 6, 0xffc070, 4, 0.22, 12, 0.8, n);
    this.particles(p, 4, 0x777066, 1.2, 0.6, 1, 0.6, n);
    if (n) {
      const d = this.decals[this.decalIdx]; this.decalIdx = (this.decalIdx + 1) % this.decals.length;
      d.position.set(p.x + n[0] * 0.01, p.y + n[1] * 0.01, p.z + n[2] * 0.01);
      d.lookAt(p.x + n[0], p.y + n[1], p.z + n[2]);
      d.rotation.z = Math.random() * 6;
      d.visible = true;
    }
  },
  explosion(p, radius) {
    const m = this.blasts.find((b) => !b.visible) || this.blasts[0];
    m.position.copy(p); m.visible = true;
    m.userData.life = m.userData.max = 0.45; m.userData.r = radius;
    m.userData.light.position.copy(p); m.userData.light.intensity = 6;
    this.particles(p, 40, 0xffa040, 9, 0.6, 4, 1);
    this.particles(p, 30, 0x444038, 3, 1.4, -0.5, 1);
  },
  muzzleFlashAt(p, color = 0xffb060) {
    const l = this.muzzleLights[this.muzzleIdx]; this.muzzleIdx = (this.muzzleIdx + 1) % this.muzzleLights.length;
    l.position.copy(p); l.color.setHex(color); l.intensity = 2.5; l.userData.t = 0.05;
  },
  beginLasers() { this.laserUsed = 0; },
  laser(a, b) {
    const l = this.lasers[this.laserUsed++]; if (!l) return;
    const arr = l.geometry.attributes.position.array;
    arr[0] = a.x; arr[1] = a.y; arr[2] = a.z; arr[3] = b.x; arr[4] = b.y; arr[5] = b.z;
    l.geometry.attributes.position.needsUpdate = true;
    l.visible = true;
  },
  endLasers() { for (let i = this.laserUsed; i < this.lasers.length; i++) this.lasers[i].visible = false; },

  update(dt) {
    for (const m of this.tracers) if (m.visible) {
      m.userData.life -= dt;
      if (m.userData.life <= 0) m.visible = false; else m.material.opacity = 0.9 * (m.userData.life / m.userData.max);
    }
    for (const l of this.muzzleLights) if (l.intensity > 0) { l.userData.t -= dt; if (l.userData.t <= 0) l.intensity = 0; }
    if (this.vmMuzzle.intensity > 0) this.vmMuzzle.intensity = Math.max(0, this.vmMuzzle.intensity - dt * 40);
    for (const b of this.blasts) if (b.visible) {
      b.userData.life -= dt;
      const k = 1 - b.userData.life / b.userData.max;
      b.scale.setScalar(0.3 + k * b.userData.r);
      b.material.opacity = (1 - k) * 0.8;
      b.userData.light.intensity = (1 - k) * 6;
      if (b.userData.life <= 0) { b.visible = false; b.userData.light.intensity = 0; }
    }
    for (const m of this.pools || []) {
      if (!m.visible) continue;
      const u = m.userData;
      u.t += dt;
      const s = Math.max(0.05, u.max * Math.sqrt(Math.min(1, u.t / u.grow))); // fast at first, slowing as it spreads
      m.scale.set(s, s * 0.85, 1);
    }
    const P = this.pPos, V = this.pVel, L = this.pLife, C = this.pCol, B = this.pBase;
    for (let i = 0; i < this.PN; i++) {
      if (L[i] <= 0) continue;
      L[i] -= dt;
      if (this.pBlood[i]) {
        // blood: it falls until it lands on the floor or a surface, and leaves a drop there (fast ones smear)
        const g = this.bloodFloor(P[i * 3], P[i * 3 + 2], P[i * 3 + 1]);
        if (P[i * 3 + 1] <= g + 0.02 || L[i] <= 0) {
          const sp = Math.hypot(V[i * 3], V[i * 3 + 2]);
          this.bloodDrop(P[i * 3], g, P[i * 3 + 2], 0.035 + Math.random() * 0.04 + Math.min(0.05, sp * 0.012));
          this.pBlood[i] = 0; L[i] = 0; P[i * 3 + 1] = -100;
          continue;
        }
      }
      if (L[i] <= 0) { P[i * 3 + 1] = -100; continue; }
      V[i * 3 + 1] -= this.pGrav[i] * dt;
      P[i * 3] += V[i * 3] * dt; P[i * 3 + 1] += V[i * 3 + 1] * dt; P[i * 3 + 2] += V[i * 3 + 2] * dt;
      if (P[i * 3 + 1] < 0.02) { P[i * 3 + 1] = 0.02; V[i * 3 + 1] *= -0.3; V[i * 3] *= 0.6; V[i * 3 + 2] *= 0.6; }
      const f = Math.min(1, L[i] * 4);
      C[i * 3] = B[i * 3] * f; C[i * 3 + 1] = B[i * 3 + 1] * f; C[i * 3 + 2] = B[i * 3 + 2] * f;
    }
    this.points.geometry.attributes.position.needsUpdate = true;
    this.points.geometry.attributes.color.needsUpdate = true;
  },
  // ------------------------------------------------------------ picture-in-picture scopes
  pipTexture() {
    if (!this.pipRT) this.pipRT = new THREE.WebGLRenderTarget(512, 512, { samples: 4 });
    return this.pipRT.texture;
  },
  // Render the world from the scope's ocular lens along its axis. The view is the lens's angular size (seen
  // from the eye) divided by the magnification, so things in the scope are exactly that much bigger than
  // the same things seen around it.
  _renderPip(pip) {
    const cam = this.camera, sc = this.scopeCam || (this.scopeCam = new THREE.PerspectiveCamera(10, 1, 0.05, 200));
    this.vmScene.updateMatrixWorld();
    pip.disk.matrixWorld.decompose(sc.position, sc.quaternion, this._pipScale || (this._pipScale = new THREE.Vector3()));
    const d = Math.max(0.03, cam.position.distanceTo(sc.position));
    sc.fov = THREE.MathUtils.radToDeg(2 * Math.atan(pip.r / d)) / pip.mag;
    sc.updateProjectionMatrix();
    const eye = pip.disk.worldToLocal(cam.position.clone());
    pip.mat.uniforms.eye.value.set((eye.x / pip.r) * 0.8, (eye.y / pip.r) * 0.8);
    const r = this.renderer;
    r.setRenderTarget(this.pipRT);
    r.clear();
    r.render(this.scene, sc);
    r.setRenderTarget(null);
  },
  // Shaders are compiled the first time something is drawn, which is a stall (a big one on some GPUs): the
  // first shot (casing, tracer, bullet hole, blood), the first explosion, the first suspect to come into
  // view... So once a level's built and populated, everything gets compiled up front: every hidden thing
  // (the pooled effects, the viewmodel's flash) shown for a moment, and samples of what's made on first use
  // (cases, a dropped magazine and box, a loot box, a wall spatter) put in for a moment.
  warmup() {
    if (!this.renderer || !this.scene || !this.camera) return 0;
    const t0 = performance.now(), extras = [];
    const put = (m) => { if (m) { m.position.set(0, -50, 0); this.dynRoot.add(m); extras.push(m); } };
    try {
      if (G.Casings.warm) for (const m of G.Casings.warm()) put(m);
      if (G.Loot.meshFor) { put(G.Loot.meshFor(G.Gear.pack(G.Gear.medItem('bandage')))); }
      put(new THREE.Mesh(new THREE.PlaneGeometry(1, 1), this.bloodMats.spatter));
    } catch (e) { console.warn('warmup', e); }
    const hidden = [];
    for (const sc of [this.scene, this.vmScene]) sc.traverse((o) => { if (!o.visible) { o.visible = true; hidden.push(o); } });
    try { this.renderer.compile(this.scene, this.camera); this.renderer.compile(this.vmScene, this.camera); } catch (e) { console.warn('warmup', e); }
    for (const o of hidden) o.visible = false;
    for (const m of extras) { m.removeFromParent(); m.traverse((o) => { if (o.geometry) o.geometry.dispose(); }); }
    return performance.now() - t0;
  },
  render() {
    const r = this.renderer;
    this.camera.updateMatrixWorld();
    this.vmHolder.matrix.copy(this.camera.matrixWorld);
    this.vmHolder.matrixWorldNeedsUpdate = true;
    // the scope picture: only rendered while you're bringing the gun up or looking through it
    const pip = this.vm && this.vm.visible && this.vm.userData.pip, live = this.pipLive || 0;
    if (pip) {
      pip.mat.uniforms.live.value = THREE.MathUtils.smoothstep(live, 0.35, 0.8);
      if (live > 0.35) this._renderPip(pip);
    }
    r.clear();
    r.render(this.scene, this.camera);
    // Evidence outlines (layer 2): drawn over everything except walls, floors and doors. Rebuild the depth
    // buffer from just those (layer 1, depth only), then draw the outlines against it (they use the stencil).
    if (this.hasGlow) {
      const sc = this.scene, bg = sc.background, cam = this.camera;
      if (!this.depthOnly) this.depthOnly = new THREE.MeshBasicMaterial({ colorWrite: false });
      sc.background = null; // a colour background would clear the frame
      r.clearDepth(); r.clearStencil();
      cam.layers.set(1); sc.overrideMaterial = this.depthOnly; r.render(sc, cam);
      cam.layers.set(2); sc.overrideMaterial = null; r.render(sc, cam);
      cam.layers.set(0); sc.background = bg;
    }
    r.clearDepth();
    r.clearStencil(); // reflex sight windows mark the stencil for their reticles
    r.render(this.vmScene, this.camera);
  },
};
