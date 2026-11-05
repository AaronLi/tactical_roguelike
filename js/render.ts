'use strict';
const _tv = new THREE.Vector3(), _tv2 = new THREE.Vector3();
const _fq = new THREE.Quaternion(), _fq2 = new THREE.Quaternion(), _fz = new THREE.Vector3(0, 0, 1), _fn = new THREE.Vector3(), _fp = new THREE.Vector3(), _fs = new THREE.Vector3(), _fm = new THREE.Matrix4(), _fc = new THREE.Color();
const _bjc = new THREE.Color();
// Three.js scene, character models, first-person viewmodels and particle effects.
interface Trail { line: THREE.Line<THREE.BufferGeometry, THREE.LineBasicMaterial>; mat: THREE.LineBasicMaterial; n: number; N: number; shot: PShot; old: number | null; marks: THREE.Mesh<THREE.SphereGeometry, THREE.MeshBasicMaterial>[]; keys?: Set<any>; }
type ImpactKind = 'wall' | 'blood' | 'armor'; // what a round hit (impact)
type ImpactFx = 'metal' | 'stone' | 'wood' | 'plaster' | 'soft' | 'glass' | 'soil' | 'plastic' | 'water'; // what it threw up (IMPACT), js/materials.ts fx
type BloodKind = 'drop' | 'spatter' | 'pool';
interface RBloodMats { [kind: string]: THREE.MeshStandardMaterial; drop: THREE.MeshStandardMaterial; spatter: THREE.MeshStandardMaterial; pool: THREE.MeshStandardMaterial; }
type RMark = THREE.Mesh<THREE.BufferGeometry, THREE.Material>; // a pooled decal or blood mark
type RWound = (THREE.Mesh<THREE.BufferGeometry, THREE.Material> | THREE.Line<THREE.BufferGeometry, THREE.Material>) & { onRig?: any }; // a track kept on a body
interface RArc { dots: THREE.Points<THREE.BufferGeometry, THREE.PointsMaterial>; ring: THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>; N: number; f?: number; }
const G_R = {
  // (set in init / _initFx before anything uses them: they hold undefined till then, as before)
  renderer: undefined as unknown as THREE.WebGLRenderer,
  scene: undefined as unknown as THREE.Scene,
  camera: undefined as unknown as THREE.PerspectiveCamera,
  hemi: undefined as unknown as THREE.HemisphereLight,
  ambient: undefined as unknown as THREE.AmbientLight,
  muzzleLights: undefined as unknown as THREE.PointLight[],
  muzzleIdx: undefined as unknown as number,
  vmScene: undefined as unknown as THREE.Scene,
  vmHolder: undefined as unknown as THREE.Group,
  vmRoot: undefined as unknown as THREE.Group,
  vmMuzzle: undefined as unknown as THREE.PointLight,
  levelRoot: undefined as unknown as THREE.Group,
  dynRoot: undefined as unknown as THREE.Group,
  flashTex: undefined as unknown as THREE.CanvasTexture,
  tracers: undefined as unknown as THREE.Mesh<THREE.BoxGeometry, THREE.MeshBasicMaterial>[],
  tracerIdx: undefined as unknown as number,
  streaks: undefined as unknown as THREE.Mesh<THREE.BoxGeometry, THREE.MeshBasicMaterial>[],
  streakN: undefined as unknown as number,
  frameNo: undefined as unknown as number,
  glows: undefined as unknown as THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>[],
  glowN: undefined as unknown as number,
  flares: undefined as unknown as THREE.Sprite[],
  flareN: undefined as unknown as number,
  PN: undefined as unknown as number,
  pPos: undefined as unknown as Float32Array,
  pCol: undefined as unknown as Float32Array,
  pVel: undefined as unknown as Float32Array,
  pLife: undefined as unknown as Float32Array,
  pBase: undefined as unknown as Float32Array,
  pGrav: undefined as unknown as Float32Array,
  pBlood: undefined as unknown as Uint8Array,
  SN: 0, sIdx: 0, sLive: false, sPos: undefined as unknown as Float32Array, sCol: undefined as unknown as Float32Array, sVel: undefined as unknown as Float32Array, sLife: undefined as unknown as Float32Array, sBase: undefined as unknown as Float32Array,
  streamPts: undefined as unknown as THREE.Points<THREE.BufferGeometry, THREE.PointsMaterial>,
  pIdx: undefined as unknown as number,
  points: undefined as unknown as THREE.Points<THREE.BufferGeometry, THREE.PointsMaterial>,
  decals: undefined as unknown as RMark[],
  decalIdx: undefined as unknown as number,
  FRAG_MARKS: 3000, fragMarks: undefined as unknown as THREE.InstancedMesh, fragN: 0, fragDirty: false, scorches: [] as THREE.Mesh[], scorchIdx: 0,
  bloodMats: undefined as unknown as RBloodMats,
  bloodMarks: undefined as unknown as RMark[],
  bloodIdx: undefined as unknown as number,
  pools: undefined as unknown as RMark[],
  poolIdx: undefined as unknown as number,
  blasts: undefined as unknown as THREE.Mesh<THREE.SphereGeometry, THREE.MeshBasicMaterial>[],
  blastLights: undefined as unknown as THREE.PointLight[],
  lasers: undefined as unknown as THREE.Line<THREE.BufferGeometry, THREE.LineBasicMaterial>[],
  laserUsed: undefined as unknown as number,
  spots: undefined as unknown as THREE.SpotLight[],
  cones: undefined as unknown as { cone: THREE.Mesh<THREE.BufferGeometry, THREE.ShaderMaterial>; lamp: THREE.Sprite }[],
  pLasers: undefined as unknown as { line: THREE.Line<THREE.BufferGeometry, THREE.LineBasicMaterial>; dot: THREE.Sprite }[],
  spotUsed: undefined as unknown as number,
  pLaserUsed: undefined as unknown as number,
  coneUsed: undefined as unknown as number,
  // (set from outside: js/player.ts, js/views.ts)
  fisheye: undefined as unknown as number,
  hasGlow: undefined as unknown as boolean,
  pipLive: undefined as unknown as number,
  // (made when first needed)
  vm: undefined as THREE.Object3D | null | undefined,
  trails: undefined as Trail[] | undefined,
  lastShot: undefined as PShot | null | undefined,
  wounds: undefined as RWound[] | undefined,
  debris: undefined as ReturnType<typeof G_Scars.debris> | undefined,
  debrisT: undefined as number | undefined,
  trailDot: undefined as THREE.SphereGeometry | undefined,
  lastDecals: undefined as RMark[] | undefined,
  mlIdx: undefined as number | undefined,
  _bloodMats: undefined as RBloodMats | undefined,
  _flashTex: undefined as THREE.CanvasTexture | undefined,
  _tc: undefined as THREE.Color | undefined,
  _arc: undefined as RArc | undefined,
  scopeCam: undefined as THREE.PerspectiveCamera | undefined,
  _pipScale: undefined as THREE.Vector3 | undefined,
  pipRT: undefined as THREE.WebGLRenderTarget | undefined,
  fk: undefined as number | undefined,
  _fsz: undefined as THREE.Vector2 | undefined,
  fishRT: undefined as THREE.WebGLRenderTarget | undefined,
  fishQuad: undefined as THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial> | undefined,
  fishScene: undefined as THREE.Scene | undefined,
  fishCam: undefined as THREE.OrthographicCamera | undefined,
  depthOnly: undefined as THREE.MeshBasicMaterial | undefined,
  init() {
    const r = (this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' }));
    r.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    r.setSize(window.innerWidth, window.innerHeight);
    r.domElement.id = 'c';
    // Light adds up past what a screen can show (a festival's strings of bulbs over lit stalls, a muzzle flash in a lit
    // room, a shelf of packets under a shop's panels). Clipped channel by channel, an over-lit orange goes yellow, then
    // white, and its texture washes out. So the colour is rolled off instead (this.TONE), in linear light, before it's
    // turned sRGB (js/util.ts): untouched below about 80% of full brightness, above that eased toward full, the whole
    // colour scaled together so it keeps its hue, and the brighter it's pushed the more it goes toward white, as film
    // does (not a fluorescent version of itself).
    THREE.ShaderChunk.tonemapping_pars_fragment = THREE.ShaderChunk.tonemapping_pars_fragment.replace('vec3 CustomToneMapping( vec3 color ) { return color; }', this.TONE + ' vec3 CustomToneMapping( vec3 color ) { return bpTone( toneMappingExposure * color ); }');
    r.toneMapping = THREE.CustomToneMapping;
    r.shadowMap.enabled = true; // (only the weapon lights cast any: this.spots)
    document.body.prepend(r.domElement);
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x0b0d10);
    this.scene.fog = new THREE.Fog(0x0b0d10, 8, 60);
    this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.03, 280);
    this.camera.rotation.order = 'YXZ';
    this.scene.add(this.camera);

    // Dim by design: rooms are lit by their ceiling lamps, corridors are left in the gloom
    this.hemi = new THREE.HemisphereLight(0xb0c0d0, 0x302820, 0.26);
    this.scene.add(this.hemi);
    this.ambient = new THREE.AmbientLight(0xffffff, 0);
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
  // the roll-off (the shoulder of Khronos' PBR Neutral, on linear light): a channel's peak over the knee (0.76) eased
  // toward 1, the colour scaled with it, and toward white by how much was taken off (desaturation 0.15). (Not its toe:
  // taking the same off every channel near black saturates the dark, and most of a level is dark: a dim brown wall went
  // orange.)
  TONE: 'vec3 bpTone( vec3 c ) { float m = max( c.r, max( c.g, c.b ) ); const float k = 0.76, d = 0.24; if ( m < k ) return c; float f = 1.0 - d * d / ( m + d - k ); c *= f / m; return mix( c, vec3( f ), 1.0 - 1.0 / ( 0.15 * ( m - f ) + 1.0 ) ); }',
  // A soft studio-style environment (gradient dome + a few softboxes) baked with PMREM.
  _envMap(r: THREE.WebGLRenderer) {
    const env = new THREE.Scene();
    const geo = new THREE.SphereGeometry(10, 24, 12);
    const col = [], pos = geo.attributes.position as THREE.BufferAttribute, top = new THREE.Color(0x8b939c), bot = new THREE.Color(0x1c1a17), c = new THREE.Color();
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
  // the blood's materials (made once: the highlights' export worker, which never runs init, asks for them too)
  bloodMaterials(): RBloodMats {
    if (this._bloodMats) return this._bloodMats;
    const bloodTex = (kind: BloodKind) => {
      const c = document.createElement('canvas'); c.width = c.height = 64;
      const g = c.getContext('2d') as CanvasRenderingContext2D, blob = (x: number, y: number, r: number, a: number) => { g.fillStyle = `rgba(${70 + Math.random() * 20},4,6,${a})`; g.beginPath(); g.ellipse(x, y, r, r * (0.8 + Math.random() * 0.4), Math.random() * 3, 0, 7); g.fill(); };
      if (kind === 'pool') { for (let i = 0; i < 14; i++) { const a = Math.random() * 6.28, d = Math.random() * 12; blob(32 + Math.cos(a) * d, 32 + Math.sin(a) * d, 10 + Math.random() * 9, 0.9); } }
      else if (kind === 'spatter') { blob(32, 32, 8, 0.9); for (let i = 0; i < 18; i++) { const a = Math.random() * 6.28, d = 8 + Math.random() * 22; blob(32 + Math.cos(a) * d, 32 + Math.sin(a) * d, 1 + Math.random() * 3, 0.85); } }
      else { blob(32, 32, 13, 0.92); for (let i = 0; i < 5; i++) { const a = Math.random() * 6.28, d = 15 + Math.random() * 12; blob(32 + Math.cos(a) * d, 32 + Math.sin(a) * d, 1.5 + Math.random() * 3, 0.85); } }
      const t = new THREE.CanvasTexture(c); t.anisotropy = 4; return t;
    };
    const bmat = (kind: BloodKind) => new THREE.MeshStandardMaterial({ map: bloodTex(kind), transparent: true, depthWrite: false, roughness: 0.25, metalness: 0.1, polygonOffset: true, polygonOffsetFactor: -3 });
    return (this._bloodMats = { drop: bmat('drop'), spatter: bmat('spatter'), pool: bmat('pool') });
  },
  resize() {
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
  },
  setLevel(map: LvMap) {
    this.clearLevel();
    this.levelRoot.add(G.Level.buildMesh(map));
    // what stops a weapon light: the level, bar what you can see through (glass, a grating)
    const solid = (mt: THREE.Material) => !mt.transparent && !mt.alphaTest;
    this.levelRoot.traverse((o: any) => { if (o.isMesh) o.castShadow = Array.isArray(o.material) ? o.material.every(solid) : solid(o.material); });
    const th = map.theme;
    (this.scene.fog as THREE.Fog).color.setHex(th.fog);
    const fog = this.scene.fog as THREE.Fog; fog.near = th.noFog ? 1e4 : th.fogNear || 8; fog.far = th.noFog ? 2e4 : th.fogFar || 60; // (no fog: pushed out of reach, so the shaders stay the same)
    (this.scene.background as THREE.Color).setHex(th.fog);
    this.camera.far = th.far || (th.hub ? 420 : 280); this.camera.updateProjectionMatrix(); // (the hangar's range runs out to 300 m; a mountain top sees further)
    // (outdoors at night: moonlight. Its colour a tint as written, as the lamps' are: js/lightgrid.ts. The themes' figures were set when light was added up in sRGB; in linear, the same
    // fill reads far brighter in the dark, so it's squared: about as dark where no lamp reaches as it was)
    // Most of that fill's in the light grid now (js/lightgrid.ts: the sky on what's open to it, the lamps' light bounced
    // round the rooms): what's left of it flat everywhere is a little, so nowhere's black (all of it in the hangar,
    // daylit)
    this.hemi.color.setHex(th.hemi || th.light, THREE.LinearSRGBColorSpace); this.hemi.intensity = (th.hemiI || 0.26) ** 2 * (th.hub ? 1 : G.LightGrid.opts.fill);
  },
  // The level's meshes, taken out of the scene without being thrown away (js/highlights.ts replays the level in them on
  // the hangar's TVs, and disposes of them when it's done)
  detachLevel(): THREE.Object3D[] {
    for (const m of [...(this.decals || []), ...(this.bloodMarks || [])]) if (m.parent && m.parent !== this.scene) this.scene.add(m);
    const out = [...this.levelRoot.children];
    for (const c of out) this.levelRoot.remove(c);
    return out;
  },
  clearLevel() {
    for (const tr of this.trails || []) this.trailDrop(tr);
    this.trails = []; this.lastShot = null;
    if (G.ShotLog) G.ShotLog.clear();
    if (this.debris) this.debris.clear();
    for (const o of this.wounds || []) { o.removeFromParent(); if (o.geometry !== this.trailDot) o.geometry.dispose(); o.material.dispose(); }
    this.wounds = [];
    // marks on doors back into the scene first (they're pooled: they mustn't go with the doors)
    for (const m of [...(this.decals || []), ...(this.bloodMarks || [])]) if (m.parent && m.parent !== this.scene) this.scene.add(m);
    const dispose = (o: THREE.Object3D) => {
      o.traverse((c: any) => {
        if (c.geometry) c.geometry.dispose();
        if (c.material && !c.userData.keepMat) (Array.isArray(c.material) ? c.material : [c.material]).forEach((m: THREE.Material & { map?: THREE.Texture | null }) => { if (m.map) m.map.dispose(); m.dispose(); }); // (keepMat: shared, js/scars.ts's)
      });
    };
    while (this.levelRoot.children.length) { const c = this.levelRoot.children[0]; dispose(c); this.levelRoot.remove(c); }
    this.decals.forEach((d: THREE.Object3D) => (d.visible = false));
    this.fragMarks.count = 0; this.fragN = 0; this.scorches.forEach((m) => (m.visible = false));
    if (this.bloodMarks) { this.bloodMarks.forEach((d: THREE.Object3D) => (d.visible = false)); this.pools.forEach((d: THREE.Object3D) => { d.visible = false; d.userData.owner = null; }); }
  },
  // ------------------------------------------------------------ blood on the environment
  // the surface under (x, z) at or below height y: the floor, or the top of a piece of furniture
  bloodFloor(x: number, z: number, y: number) { const map = G.Game && G.Game.map; return map ? G.Level.groundAt(map, x, z, 0.01, y) : 0; },
  // a drop (or a smear, if it came in fast) lying where it landed
  bloodDrop(x: number, y: number, z: number, size = 0.06, kind: BloodKind = 'drop') {
    const m = this.bloodMarks[this.bloodIdx]; this.bloodIdx = (this.bloodIdx + 1) % this.bloodMarks.length;
    if (m.parent !== this.scene) this.scene.add(m); // (it may last have been on a door)
    m.material = this.bloodMats[kind] || this.bloodMats.drop;
    m.position.set(x, y + 0.004, z); m.rotation.set(-Math.PI / 2, 0, Math.random() * 6.28);
    m.scale.set(size * (0.8 + Math.random() * 0.5), size * (0.8 + Math.random() * 0.5), 1);
    m.visible = true;
  },
  // spatter on a wall: p the point on it, n its normal
  bloodWall(p: THREE.Vector3, n: number[], size = 0.35) {
    const m = this.bloodMarks[this.bloodIdx]; this.bloodIdx = (this.bloodIdx + 1) % this.bloodMarks.length;
    if (m.parent !== this.scene) this.scene.add(m);
    m.material = this.bloodMats.spatter;
    m.position.set(p.x + n[0] * 0.012, p.y + n[1] * 0.012, p.z + n[2] * 0.012);
    m.lookAt(p.x + n[0], p.y + n[1], p.z + n[2]); m.rotation.z = Math.random() * 6.28;
    m.scale.set(size, size, 1);
    m.visible = true;
    this.onDoor(m);
  },
  // A pool spreading out under someone (owner: anything, so it's started once and can keep growing as they
  // keep bleeding). max: how wide it gets (m), over grow seconds.
  bloodPool(owner: any, x: number, z: number, max = 0.9, grow = 25, y = 0) { // (y: about where the floor is under them)
    let m = this.pools.find((q: THREE.Object3D) => q.visible && q.userData.owner === owner);
    if (!m) {
      m = this.pools[this.poolIdx]; this.poolIdx = (this.poolIdx + 1) % this.pools.length;
      m.userData = { owner, t: 0, max, grow }; m.rotation.z = Math.random() * 6.28;
      m.position.set(x, this.bloodFloor(x, z, y + 0.3) + 0.003, z); m.scale.set(0.05, 0.05, 1); m.visible = true;
    } else { m.userData.max = Math.max(m.userData.max, max); m.userData.grow = grow; }
    return m;
  },

  // ------------------------------------------------------------ viewmodels
  // (skin: its stickers, js/stickers.ts; by default the gun in your hands', if that's this build)
  setViewmodel(def: any, skin?: any) {
    if (skin === undefined) { const w = G.Me && G.Me.cur && G.Me.cur(); skin = w && w.def === def ? w.stickers : null; }
    if (this.vm) { this.vmRoot.remove(this.vm); this.vm.traverse((o: any) => { if (o.geometry) o.geometry.dispose(); }); }
    this.vm = def ? G.GunModels.viewmodel(def, skin) : null;
    if (this.vm) this.clearStockNearEye(this.vm);
    if (this.vm) { this.vm.userData.code = def.code; this.vm.userData.key = this.vmKey(def, skin); this.vmRoot.add(this.vm); } // (code: which build it shows; key: and its stickers)
  },
  // The stock is part of the gun in first person, and when you aim the eye sits inside it: its comb and tube would fill the bottom of the
  // screen in front of the sight. So the stock's meshes (slot 'stock') are clipped to what is more than STOCK_CLEAR metres in front of the eye
  // (a clipping plane on the camera, on a copy of each material: the shared ones stay whole), the rest of it showing as it always does.
  STOCK_CLEAR: 0.1,
  clearStockNearEye(vm: THREE.Object3D) {
    this.renderer.localClippingEnabled = true;
    const plane = new THREE.Plane(), fwd = new THREE.Vector3(), eye = new THREE.Vector3(), clear = this.STOCK_CLEAR;
    vm.traverse((o: any) => {
      if (!o.isMesh || o.userData.slot !== 'stock') return;
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      const own = mats.map((m: THREE.Material) => { const c = m.clone(); c.clippingPlanes = [plane]; return c; });
      o.material = Array.isArray(o.material) ? own : own[0];
      o.onBeforeRender = (_r: any, _s: any, cam: THREE.Camera) => { cam.getWorldDirection(fwd); eye.setFromMatrixPosition(cam.matrixWorld); plane.setFromNormalAndCoplanarPoint(fwd, eye.addScaledVector(fwd, clear)); };
    });
  },
  vmKey(def: any, skin: any) { return def ? def.code + '#' + G.Stickers.key(skin) : ''; },

  // the muzzle flash's star (made once: the highlights' export worker, which never runs init, asks for it too)
  flashTexture(): THREE.CanvasTexture {
    if (this._flashTex) return this._flashTex;
    const c = document.createElement('canvas'); c.width = c.height = 64;
    const g = c.getContext('2d') as CanvasRenderingContext2D;
    const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    grd.addColorStop(0, 'rgba(255,255,255,1)'); grd.addColorStop(0.3, 'rgba(255,200,100,0.8)'); grd.addColorStop(1, 'rgba(255,120,0,0)');
    g.fillStyle = grd;
    g.beginPath();
    for (let i = 0; i < 16; i++) { const a = (i / 16) * Math.PI * 2, rr = i % 2 ? 12 : 32; g.lineTo(32 + Math.cos(a) * rr, 32 + Math.sin(a) * rr); }
    g.fill();
    return (this._flashTex = new THREE.CanvasTexture(c));
  },

  // ------------------------------------------------------------ effects
  _initFx() {
    this.flashTex = this.flashTexture();

    // tracers: stretched boxes
    this.tracers = [];
    const tg = new THREE.BoxGeometry(1, 1, 1); tg.translate(0, 0, 0.5); // (0..1 along +z: lookAt points +z at the far end)
    for (let i = 0; i < 60; i++) {
      const m = new THREE.Mesh(tg, new THREE.MeshBasicMaterial({ color: 0xffd080, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false }));
      m.visible = false; m.userData.life = 0;
      this.scene.add(m); this.tracers.push(m);
    }
    this.tracerIdx = 0;
    // rounds in flight: a streak each, drawn afresh every frame they fly (streak), gone the frame they don't
    this.streaks = [];
    for (let i = 0; i < 160; i++) {
      const m = new THREE.Mesh(tg, new THREE.MeshBasicMaterial({ color: 0xffd080, transparent: true, opacity: 1, blending: THREE.AdditiveBlending, depthWrite: false }));
      m.visible = false; m.frustumCulled = false; m.userData.f = -1;
      this.scene.add(m); this.streaks.push(m);
    }
    this.streakN = 0; this.frameNo = 0;
    // and their glow: a soft ribbon along the streak, always turned to face you (a bloom, without a bloom pass),
    // brightest at the head and fading out towards the tail
    const gc = document.createElement('canvas'); gc.width = 32; gc.height = 64;
    const gx = gc.getContext('2d') as CanvasRenderingContext2D, img = gx.createImageData(32, 64);
    for (let y = 0; y < 64; y++) for (let x = 0; x < 32; x++) {
      const u = (x + 0.5) / 32 * 2 - 1, v = 1 - (y + 0.5) / 64; // u across (-1..1), v along (0 tail .. 1 head: the canvas's top row)
      const a = Math.exp(-u * u * 4) * Math.pow(v, 1.2) * Math.min(1, (1 - v) * 12 + 0.25);
      const i = (y * 32 + x) * 4; img.data[i] = img.data[i + 1] = img.data[i + 2] = 255; img.data[i + 3] = Math.round(a * 255);
    }
    gx.putImageData(img, 0, 0);
    const gt = new THREE.CanvasTexture(gc), gq = new THREE.PlaneGeometry(1, 1); gq.translate(0, 0.5, 0);
    this.glows = [];
    for (let i = 0; i < 64; i++) {
      const m = new THREE.Mesh(gq, new THREE.MeshBasicMaterial({ map: gt, color: 0xff4a2a, transparent: true, opacity: 1, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
      m.visible = false; m.frustumCulled = false; m.matrixAutoUpdate = false; m.userData.f = -1;
      this.scene.add(m); this.glows.push(m);
    }
    this.glowN = 0;
    // and a glowing point at a tracer's head (what you see of one going straight away from you)
    const fc = document.createElement('canvas'); fc.width = fc.height = 32;
    const fx = fc.getContext('2d') as CanvasRenderingContext2D, fg = fx.createRadialGradient(16, 16, 0, 16, 16, 16);
    fg.addColorStop(0, 'rgba(255,255,255,1)'); fg.addColorStop(0.25, 'rgba(255,255,255,0.55)'); fg.addColorStop(1, 'rgba(255,255,255,0)');
    fx.fillStyle = fg; fx.fillRect(0, 0, 32, 32);
    const ft = new THREE.CanvasTexture(fc);
    this.flares = [];
    for (let i = 0; i < 48; i++) {
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: ft, color: 0xff4a2a, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
      sp.visible = false; sp.userData.f = -1; this.scene.add(sp); this.flares.push(sp);
    }
    this.flareN = 0;

    // particles
    this.PN = 800;
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
    const dg = dc.getContext('2d') as CanvasRenderingContext2D;
    const dgr = dg.createRadialGradient(16, 16, 0, 16, 16, 16);
    dgr.addColorStop(0, 'rgba(0,0,0,0.95)'); dgr.addColorStop(0.35, 'rgba(10,10,10,0.7)'); dgr.addColorStop(1, 'rgba(0,0,0,0)');
    dg.fillStyle = dgr; dg.fillRect(0, 0, 32, 32);
    const decalMat = new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(dc), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4 });
    const dgeo = new THREE.PlaneGeometry(0.14, 0.14);
    for (let i = 0; i < 260; i++) { const d = new THREE.Mesh(dgeo, decalMat); d.visible = false; this.scene.add(d); this.decals.push(d); }
    this.decalIdx = 0;

    // Frag grenade marks, kept apart from the bullet holes above (one grenade would push every one of them out): the pocks
    // its chips leave are one InstancedMesh of FRAG_MARKS tiny quads, the oldest written over; and a few soot scorches
    // where grenades went off. A mark is a write into the instance buffer, uploaded once a frame (fragMarkFlush).
    {
      const pc = document.createElement('canvas'); pc.width = pc.height = 32;
      const pg = pc.getContext('2d') as CanvasRenderingContext2D, pgr = pg.createRadialGradient(16, 16, 0, 16, 16, 16);
      pgr.addColorStop(0, 'rgba(12,12,12,1)'); pgr.addColorStop(0.3, 'rgba(18,18,18,0.95)'); pgr.addColorStop(0.45, 'rgba(215,210,198,0.55)'); pgr.addColorStop(0.7, 'rgba(215,210,198,0.15)'); pgr.addColorStop(1, 'rgba(215,210,198,0)'); // (a dark pit in a lighter chipped rim: the instance's colour tints both)
      pg.fillStyle = pgr; pg.fillRect(0, 0, 32, 32);
      const pm = new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(pc), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3 });
      const im = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), pm, this.FRAG_MARKS);
      im.count = 0; im.frustumCulled = false; im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      im.setColorAt(0, new THREE.Color(1, 1, 1)); (im.instanceColor as THREE.InstancedBufferAttribute).setUsage(THREE.DynamicDrawUsage);
      this.scene.add(im); this.fragMarks = im; this.fragN = 0;
      const sc = this.scorchTexture();
      this.scorches = [];
      for (let i = 0; i < 16; i++) {
        const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: sc, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }));
        m.rotation.x = -Math.PI / 2; m.visible = false; this.scene.add(m); this.scorches.push(m);
      }
      this.scorchIdx = 0;
    }

    // Blood where it lands: droplets (a drop with a few satellites) and smears on the floor or a tabletop,
    // spatter on walls, and pools that spread under the dead and the badly bleeding. Fixed pools of meshes,
    // reused oldest first.
    const bgeo = new THREE.PlaneGeometry(1, 1);
    this.bloodMats = this.bloodMaterials();
    this.bloodMarks = [];
    for (let i = 0; i < 400; i++) { const m = new THREE.Mesh(bgeo, this.bloodMats.drop); m.visible = false; m.renderOrder = 1; this.scene.add(m); this.bloodMarks.push(m); }
    this.bloodIdx = 0;
    this.pools = [];
    for (let i = 0; i < 24; i++) { const m = new THREE.Mesh(bgeo, this.bloodMats.pool); m.visible = false; m.rotation.x = -Math.PI / 2; m.userData = {}; this.scene.add(m); this.pools.push(m); }
    this.poolIdx = 0;
    this.pBlood = new Uint8Array(this.PN);
    // a wound's stream: fine drops, many of them, in a pool of their own (a few bleeding bodies would otherwise use up the shared
    // particles above, and drops at their size read as gobbets, not a stream). Each lands like any blood (bloodDrop), now and then.
    this.SN = 2400;
    const sg = new THREE.BufferGeometry();
    this.sPos = new Float32Array(this.SN * 3); this.sCol = new Float32Array(this.SN * 3); this.sVel = new Float32Array(this.SN * 3); this.sLife = new Float32Array(this.SN); this.sBase = new Float32Array(this.SN * 3);
    for (let i = 0; i < this.SN; i++) this.sPos[i * 3 + 1] = -100;
    sg.setAttribute('position', new THREE.BufferAttribute(this.sPos, 3));
    sg.setAttribute('color', new THREE.BufferAttribute(this.sCol, 3));
    this.streamPts = new THREE.Points(sg, new THREE.PointsMaterial({ size: 0.028, vertexColors: true, transparent: true, depthWrite: false }));
    this.streamPts.frustumCulled = false;
    this.scene.add(this.streamPts);
    this.sIdx = 0;

    // explosions: six fireballs, and two lights between them (every lit pixel of the level works through every light in
    // the scene each frame, lit or not; two blasts at once is plenty, and a third takes the dimmer one's light)
    this.blasts = []; this.blastLights = [];
    for (let i = 0; i < 2; i++) { const l = new THREE.PointLight(0xff8040, 0, 18, 2); l.userData.by = null; this.scene.add(l); this.blastLights.push(l); }
    for (let i = 0; i < 6; i++) {
      const m = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 12), new THREE.MeshBasicMaterial({ color: 0xff8830, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
      m.visible = false; m.userData.life = 0;
      this.scene.add(m); this.blasts.push(m);
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
    // switching one on never changes the shaders. Each casts a shadow, so a wall or a floor stops it: its map is drawn
    // only in a frame it's on (tacLight), once, however many times the scene's drawn (the scope, the fisheye).
    this.spots = [];
    for (let i = 0; i < 6; i++) {
      const s = new THREE.SpotLight(0xfff1dc, 0, 34, 0.3, 0.6, 1.6);
      s.target = new THREE.Object3D();
      s.castShadow = true; s.shadow.autoUpdate = false; s.shadow.camera.near = 0.1;
      s.shadow.map = new THREE.WebGLRenderTarget(512, 512, { minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter });
      this.scene.add(s, s.target); this.spots.push(s);
    }
    // what you see of someone else's light: its beam in the air, and the lamp itself
    this.cones = [];
    const cg = new THREE.ConeGeometry(1, 1, 18, 1, true).translate(0, -0.5, 0), cc = new Float32Array(cg.attributes.position.count * 3);
    for (let i = 0; i < cg.attributes.position.count; i++) { const k = (cg.attributes.position as THREE.BufferAttribute).getY(i) > -0.5 ? 1 : 0; cc.set([k, k * 0.95, k * 0.86], i * 3); } // (bright at the lamp, nothing by the far end)
    cg.setAttribute('color', new THREE.BufferAttribute(cc, 3));
    const lc = document.createElement('canvas'); lc.width = lc.height = 32;
    const lg = lc.getContext('2d') as CanvasRenderingContext2D, lgr = lg.createRadialGradient(16, 16, 0, 16, 16, 16);
    lgr.addColorStop(0, 'rgba(255,255,255,1)'); lgr.addColorStop(0.25, 'rgba(255,255,255,0.8)'); lgr.addColorStop(1, 'rgba(255,255,255,0)');
    lg.fillStyle = lgr; lg.fillRect(0, 0, 32, 32);
    const laserDotTex = new THREE.CanvasTexture(lc);
    for (let i = 0; i < 6; i++) {
      const sh = this.spots[i].shadow, cone = new THREE.Mesh(cg, new THREE.ShaderMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
        uniforms: { shMap: { value: sh.map.texture }, shMat: { value: sh.matrix } },
        // (brightest down the middle of it, nothing at its edges: no hard line round a beam in the air; it stops where its light does)
        vertexShader: 'uniform mat4 shMat; varying vec3 vC, vN, vV; varying vec4 vS; void main() { vC = color; vN = normalMatrix * normal; vec4 q = modelViewMatrix * vec4(position, 1.0); vV = -q.xyz; vS = shMat * modelMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * q; }',
        fragmentShader: '#include <packing>\nuniform sampler2D shMap; varying vec3 vC, vN, vV; varying vec4 vS; void main() { vec3 s = vS.xyz / vS.w; if (s.z > unpackRGBAToDepth(texture2D(shMap, s.xy))) discard; float a = abs(dot(normalize(vN), normalize(vV))); gl_FragColor = vec4(vC * a * a * a * 0.11, 1.0); }' }));
      const lamp = new THREE.Sprite(new THREE.SpriteMaterial({ map: laserDotTex, color: 0xfff4e0, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
      cone.visible = lamp.visible = false; cone.frustumCulled = false; this.scene.add(cone, lamp); this.cones.push({ cone, lamp });
    }
    this.pLasers = [];
    for (let i = 0; i < 8; i++) {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
      const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0xff2010, transparent: true, opacity: 0.45, depthWrite: false }));
      line.frustumCulled = false; line.visible = false;
      const dot = new THREE.Sprite(new THREE.SpriteMaterial({ map: laserDotTex, color: 0xff2010, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
      dot.visible = false;
      this.scene.add(line, dot); this.pLasers.push({ line, dot });
    }
  },
  tacBegin() { this.spotUsed = 0; this.pLaserUsed = 0; this.coneUsed = 0; },
  // a weapon light at pos shining along dir (k: how bright; seen: someone else's, so you see the beam and the lamp)
  tacLight(pos: THREE.Vector3, dir: THREE.Vector3, k = 1, seen = false) {
    const s = this.spots[this.spotUsed++]; if (!s) return;
    s.position.copy(pos); s.target.position.copy(pos).add(dir); s.intensity = 0.9 * k; s.distance = 24 + 10 * k; s.shadow.needsUpdate = true;
    const C = seen && this.cones[this.coneUsed++];
    if (!C) return;
    const len = 9 * k, r = len * Math.tan(0.3), at = _tv.subVectors(this.camera.position, pos).normalize().dot(dir); // (at: how nearly it's pointing at you)
    C.cone.position.copy(pos); C.cone.quaternion.setFromUnitVectors(_tv2.set(0, -1, 0), _tv.copy(dir)); C.cone.scale.set(r, len, r); C.cone.visible = true;
    C.lamp.position.copy(pos).addScaledVector(dir, 0.02); C.lamp.scale.setScalar(0.1 + 0.5 * k * Math.max(0, at) ** 3); C.lamp.visible = true;
  },
  // a laser from a to b (where it lands), red or green: a faint beam and a bright dot
  tacLaser(a: THREE.Vector3, b: THREE.Vector3, green: boolean) {
    const L = this.pLasers[this.pLaserUsed++]; if (!L) return;
    const col = green ? 0x30ff40 : 0xff2010, arr = (L.line.geometry.attributes.position as THREE.BufferAttribute).array as Float32Array;
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
    for (let i = this.coneUsed; i < this.cones.length; i++) this.cones[i].cone.visible = this.cones[i].lamp.visible = false;
    for (let i = this.pLaserUsed; i < this.pLasers.length; i++) this.pLasers[i].line.visible = this.pLasers[i].dot.visible = false;
  },
  tracer(from: THREE.Vector3, to: THREE.Vector3, color = 0xffd080, width = 0.018, life?: number) {
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
  // one frame of a round in flight, tail to head. solid: drawn as it is (a bolt, a grenade) instead of glowing.
  // minPx: never thinner than that on screen, so a tracer still shows far off.
  streak(from: THREE.Vector3, to: THREE.Vector3, color: number, width: number, op = 1, solid = false, minPx = 0) {
    const dx = to.x - from.x, dy = to.y - from.y, dz = to.z - from.z, len = Math.hypot(dx, dy, dz);
    if (len < 0.02) return;
    const m = this.streaks[this.streakN % this.streaks.length]; this.streakN++;
    const cp = this.camera.position, near = Math.min(cp.distanceTo(from), cp.distanceTo(to)); // (by its nearest end)
    const pxRad = this.renderer.domElement.height / (this.camera.fov * Math.PI / 180), wd = Math.max(width, near * minPx / pxRad);
    m.position.copy(from); m.lookAt(to.x, to.y, to.z);
    m.scale.set(wd, wd, len);
    m.material.color.setHex(color); m.material.opacity = op;
    const bl = solid ? THREE.NormalBlending : THREE.AdditiveBlending;
    if (m.material.blending !== bl) { m.material.blending = bl; m.material.needsUpdate = true; }
    m.userData.f = this.frameNo; m.visible = true;
  },
  // A round in flight, this frame (js/player.ts fly, js/views.ts visRound): head, the way it's going, how far
  // it's come, the gun, a tracer or not, its speed. Ordinary rounds a faint short streak; a tracer long and
  // burning (a core and a glow); a bolt or a grenade drawn solid; a rail slug a long bright line.
  // ------------------------------------------------------------ F9: rounds' paths
  // While the hitboxes are shown (js/rig.ts debug), each round you fire leaves its path as it actually flew (a point a
  // frame: drag, gravity; through a body, a point every 4 mm of its track, js/ballistics.ts through), a dot where it went
  // into someone and where it stopped. Coloured by how fast it was going there (trailColour: Mach 2 and over red, down
  // through the rainbow to violet at a stop: one scale for every gun). The last shot's (all its pellets) stays till you
  // fire again; older ones fade out over the 3 s after a newer shot takes over. Drawn over everything, so a path through
  // a body shows.
  TRAIL_FADE: 3, TRAIL_VMAX: 686,
  trailColour(v: number, out: THREE.Color) { return out.setHSL(0.78 * (1 - G.U.clamp(v / this.TRAIL_VMAX, 0, 1)), 1, 0.55); },
  trailStart(shot: PShot, p: THREE.Vector3, v: number) {
    const N = 2400, geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(N * 3), 3)); geo.setDrawRange(0, 0);
    geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(N * 3), 3));
    const mat = new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, depthTest: false, depthWrite: false });
    const line = new THREE.Line(geo, mat); line.frustumCulled = false; line.renderOrder = 998;
    this.scene.add(line);
    const tr: Trail = { line, mat, n: 0, N, shot, old: null, marks: [] };
    (this.trails = this.trails || []).push(tr);
    this.lastShot = shot;
    this.trailAdd(tr, p, false, v);
    return tr;
  },
  trailAdd(tr: Trail, p: THREE.Vector3, mark: boolean, v = 0) {
    const c = this.trailColour(v, this._tc || (this._tc = new THREE.Color()));
    if (tr.n < tr.N) {
      const g = tr.line.geometry, a = g.attributes.position as THREE.BufferAttribute, k = g.attributes.color as THREE.BufferAttribute;
      a.setXYZ(tr.n, p.x, p.y, p.z); k.setXYZ(tr.n, c.r, c.g, c.b); tr.n++;
      a.needsUpdate = k.needsUpdate = true; g.setDrawRange(0, tr.n);
    }
    if (mark) {
      this.trailDot = this.trailDot || new THREE.SphereGeometry(0.018, 8, 6);
      const m = new THREE.Mesh(this.trailDot, new THREE.MeshBasicMaterial({ color: c.getHex(), transparent: true, depthTest: false, depthWrite: false }));
      m.position.copy(p); m.renderOrder = 999; this.scene.add(m); tr.marks.push(m);
    }
  },
  // A round's track through someone, kept on them for the level (shown with the hitboxes, as the trails): a line a bone
  // (the stretch of it in each part of them, in that bone's frame, coloured by its speed as the trail is), and its dots,
  // so it goes where they go: turning, falling, carried off as a ragdoll. pts: [{ p (world), v, bone (a segment's bone
  // name, js/ballistics.ts), mark }]
  woundTrack(rig: any, pts: { p: THREE.Vector3; v: number; bone: string; mark?: boolean }[]) {
    const B = G.Ballistics, c = new THREE.Color(), objs: RWound[] = [];
    rig.root.updateMatrixWorld(true);
    let i = 0;
    while (i < pts.length) {
      const name = pts[i].bone, bone = B.boneOf(rig, name);
      let j = i; while (j < pts.length && pts[j].bone === name) j++;
      if (bone) {
        const run = pts.slice(i, Math.min(pts.length, j + 1)); // (on to the next part's first point: no gap where it crosses)
        if (run.length > 1) {
          const pos = new Float32Array(run.length * 3), col = new Float32Array(run.length * 3);
          run.forEach((q, n) => { const l = bone.worldToLocal(q.p.clone()); pos.set([l.x, l.y, l.z], n * 3); this.trailColour(q.v, c); col.set([c.r, c.g, c.b], n * 3); });
          const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.BufferAttribute(col, 3));
          const line = new THREE.Line(g, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.95, depthTest: false, depthWrite: false }));
          line.renderOrder = 997; line.frustumCulled = false; bone.add(line); objs.push(line);
        }
        for (const q of pts.slice(i, j)) if (q.mark) {
          this.trailDot = this.trailDot || new THREE.SphereGeometry(0.018, 8, 6);
          const m = new THREE.Mesh(this.trailDot, new THREE.MeshBasicMaterial({ color: this.trailColour(q.v, c).getHex(), depthTest: false, depthWrite: false, transparent: true }));
          m.position.copy(bone.worldToLocal(q.p.clone())); m.scale.divideScalar(new THREE.Vector3().setFromMatrixScale(bone.matrixWorld).x || 1); m.renderOrder = 999; bone.add(m); objs.push(m);
        }
      }
      i = j;
    }
    for (const o of objs) { o.visible = false; o.onRig = rig; }
    (this.wounds = this.wounds || []).push(...objs);
  },
  trailsUpdate() {
    const on = G.Rig.debug;
    if (G.ShotLog) G.ShotLog.frame(); // (the shots that hit someone: their ghosts, trails and markers)
    const L = G.ShotLog && G.HUD.hbLast, fk = G.ShotLog ? G.ShotLog.focus() : null;
    for (const o of this.wounds || []) o.visible = !!on && !!L && o.onRig === L.who.rig; // (the tracks kept on bodies: with the hitboxes, on whoever you've picked out)
    if (!this.trails || !this.trails.length) return;
    const now = performance.now();
    this.trails = this.trails.filter((tr: Trail) => {
      const last = tr.shot === this.lastShot;
      if (!last && tr.old == null) tr.old = now; // (the moment a newer shot took over)
      const k = last ? 1 : 1 - (now - tr.old!) / 1000 / this.TRAIL_FADE;
      if (k <= 0 || !tr.line.parent) { this.trailDrop(tr); return false; }
      const see = on && (!tr.keys || tr.keys.has(fk)); // (a round that went into someone: only with them picked out)
      tr.line.visible = see; tr.mat.opacity = k * (last ? 1 : 0.55);
      for (const m of tr.marks) { m.visible = see; m.material.opacity = k; }
      return true;
    });
  },
  trailDrop(tr: Trail) { tr.line.removeFromParent(); tr.line.geometry.dispose(); tr.mat.dispose(); for (const m of tr.marks) { m.removeFromParent(); m.material.dispose(); } },
  bullet(head: THREE.Vector3, dir: THREE.Vector3, came: number, def: any, tracer: boolean, sp: number, am: any) {
    const rail = def.cls === 'RAIL', bolt = def.cls === 'BOW', gren = !!def.explosive;
    const L = rail ? 60 : bolt ? 0.7 : gren ? 0.25 : tracer ? G.U.clamp(sp * 0.03, 3, 24) : G.U.clamp(sp * 0.008, 0.6, 5);
    const lead = bolt || gren ? 0.3 : 2; // (nothing shows in the first couple of metres: it's still in the muzzle's flash)
    if (came <= lead) return;
    const tail = head.clone().addScaledVector(dir, -Math.min(L, came - lead)), col = (tracer && G.AMMO.tracer.tracer) || def.tracer || 0xffd080;
    if (tracer) { // a normal-sized, white-hot core and its bloom
      const hot = new THREE.Color(col).lerp(new THREE.Color(0xffffff), 0.35).getHex();
      this.streak(tail, head, hot, 0.008, 1, false, 1.5);
      if (came > 4) { this.glow(tail, head, col, 0.18, 1, 24); this.flare(head, col, 0.2, 1, 18); }
    } else if (rail) { this.streak(tail, head, col, 0.02, 1, false, 2); this.glow(tail, head, col, 0.25, 0.7, 20); }
    else if (bolt) { // solid, its lit nock on the tail, and a faint line of it behind (js/bolts.ts)
      const nock = G.Bolts.colour(am);
      this.streak(tail, head, 0x24262a, 0.012, 1, true, 1.5);
      this.flare(tail, nock, 0.06, 1, 7);
      this.glow(tail.clone().addScaledVector(dir, -Math.min(2.5, came - lead)), tail, nock, 0.02, 0.5, 2);
    }
    else if (gren) this.streak(tail, head, 0x3a4a2a, 0.045, 1, true, 2);
    else this.streak(tail, head, col, 0.01, 0.4, false, 1);
  },
  // a glowing point at p: size in metres, or minPx on screen if that's bigger
  flare(p: THREE.Vector3, color: number, size: number, op: number, minPx: number) {
    const sp = this.flares[this.flareN % this.flares.length]; this.flareN++;
    const d = this.camera.position.distanceTo(p), pxRad = this.renderer.domElement.height / (this.camera.fov * Math.PI / 180);
    const sz = Math.max(size, d * minPx / pxRad);
    sp.position.copy(p); sp.scale.set(sz, sz, 1);
    sp.material.color.setHex(color); sp.material.opacity = op;
    sp.userData.f = this.frameNo; sp.visible = true;
  },
  // the glow round a streak, tail to head: width in metres, or minPx on screen if that's wider
  glow(from: THREE.Vector3, to: THREE.Vector3, color: number, width: number, op: number, minPx: number) {
    const axis = to.clone().sub(from), len = axis.length();
    if (len < 0.05) return;
    axis.divideScalar(len);
    const m = this.glows[this.glowN % this.glows.length]; this.glowN++;
    const cp = this.camera.position, near = Math.min(cp.distanceTo(from), cp.distanceTo(to));
    const pxRad = this.renderer.domElement.height / (this.camera.fov * Math.PI / 180), wd = Math.max(width, near * minPx / pxRad);
    const mid = from.clone().lerp(to, 0.5), view = cp.clone().sub(mid).normalize();
    const side = new THREE.Vector3().crossVectors(axis, view);
    if (side.lengthSq() < 1e-8) return; // (end on: it's the core you see)
    side.normalize();
    const nrm = new THREE.Vector3().crossVectors(side, axis);
    m.matrix.makeBasis(side.multiplyScalar(wd), axis.clone().multiplyScalar(len), nrm).setPosition(from);
    m.matrixWorldNeedsUpdate = true;
    m.material.color.setHex(color); m.material.opacity = op;
    m.userData.f = this.frameNo; m.visible = true;
  },
  particles(p: THREE.Vector3, n: number, color: number, speed: number, life: number, grav = 9, spread = 1, dir?: ArrayLike<number> | null, blood?: boolean) {
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
  // one drop of blood leaving a wound at p with this velocity: it falls and leaves its mark where it lands (js/views.ts woundStreams)
  bloodJet(p: THREE.Vector3, vx: number, vy: number, vz: number, color: number) {
    const i = this.sIdx; this.sIdx = (this.sIdx + 1) % this.SN;
    this.sPos[i * 3] = p.x; this.sPos[i * 3 + 1] = p.y; this.sPos[i * 3 + 2] = p.z;
    this.sVel[i * 3] = vx; this.sVel[i * 3 + 1] = vy; this.sVel[i * 3 + 2] = vz;
    this.sLife[i] = 1.3;
    const c = _bjc.setHex(color), v = 0.8 + Math.random() * 0.2;
    this.sBase[i * 3] = c.r * v; this.sBase[i * 3 + 1] = c.g * v; this.sBase[i * 3 + 2] = c.b * v;
  },
  // what a round throws up, by what it hit (js/materials.ts fx): sparks [colour, how many, speed, life, gravity], and the puff of it
  IMPACT: <Record<ImpactFx, { s: number[] | null; d: number[] | null }>>{
    metal: { s: [0xffc070, 12, 5, 0.22, 12], d: null }, stone: { s: [0xffc070, 3, 3, 0.15, 12], d: [0x9a958a, 8, 1.5] }, wood: { s: null, d: [0xa8824e, 9, 2.2] }, plaster: { s: null, d: [0xe8e4da, 10, 1.2] },
    soft: { s: null, d: [0xcfc8b8, 6, 1] }, glass: { s: null, d: [0xcfe6f0, 8, 2.5] }, soil: { s: null, d: [0x6a5238, 10, 2] }, plastic: { s: null, d: [0x77787a, 5, 2] }, water: { s: null, d: [0xa8c8d8, 8, 2.5] },
  },
  impact(p: THREE.Vector3, n: number[] | null, kind: ImpactKind, fx?: ImpactFx, o?: MarkOpts) {
    if (G.Audio && G.Audio.impactAt) G.Audio.impactAt(p, kind, fx); // heard when it's close
    if (kind === 'blood') { this.particles(p, 8, 0x8a0a0a, 2.5, 1.2, 9, 0.8, n, true); return; } // (each leaves a drop where it lands)
    if (kind === 'armor') { this.particles(p, 6, 0x9fd8ff, 3, 0.25, 6, 1); return; }
    const fxs = (this.IMPACT as Record<string, any>)[fx!] || this.IMPACT.stone;
    if (fxs.s) this.particles(p, fxs.s[1], fxs.s[0], fxs.s[2], fxs.s[3], fxs.s[4], 0.8, n);
    if (fxs.d && !o) this.particles(p, fxs.d[1], fxs.d[0], fxs.d[2], 0.6, 1, 0.6, n); // (the rest of what's thrown out: js/scars.ts)
    if (kind !== 'wall' || (o && o.m === '')) return; // (o.m '': nothing there to damage)
    // the damage it did, and what it threw out of it (js/scars.ts), by what it hit and how; marks are from the pool, so a reused
    // one has to come off the door it was on
    const q = Object.assign({ fx, k: 'e', n }, o, { n });
    (this.debris || (this.debris = G.Scars.debris(this.scene, (x, z, y) => { const map = G.Game.map; return map ? G.Level.groundAt(map, x, z, 0.01, y) : 0; }))).burst(p, q);
    if (!n || q.cut) return; // (what's been cut has its marks with the cut: js/damage.ts)
    for (const c of G.Scars.plan(q)) {
      const d = this.decals[this.decalIdx]; this.decalIdx = (this.decalIdx + 1) % this.decals.length;
      if (d.parent !== this.scene) this.scene.add(d);
      d.geometry = c.geo; d.material = c.mat; d.quaternion.copy(c.q); d.scale.set(c.s[0], c.s[1], c.s[2]);
      d.position.set(p.x + n[0] * c.off, p.y + n[1] * c.off, p.z + n[2] * c.off);
      d.visible = true;
      if (this.lastDecals) this.lastDecals.push(d);
      this.onDoor(d);
    }
  },
  // A round's mark where it stopped in something solid (a wall, a door, or a target on the range): paper targets show
  // their holes in their own picture (no mark on top); a steel plate keeps its mark as it swings or falls.
  impactOn(p: THREE.Vector3, n: number[] | null, solid: any, fx?: string, o?: MarkOpts) {
    const t = solid && solid.target, on = t && G.Range ? G.Range.markOn(t) : null;
    this.lastDecals = [];
    this.impact(p, on === 'paper' ? null : n, 'wall', fx as ImpactFx | undefined, o);
    if (on && on !== 'paper') for (const d of this.lastDecals) on.attach(d);
  },
  // put marks stuck on something about to be thrown away back in the pool (hidden)
  freeMarks(obj: THREE.Object3D) {
    const ms: THREE.Object3D[] = []; obj.traverse((o: THREE.Object3D) => { if (this.decals.includes(o as RMark) || (this.bloodMarks && this.bloodMarks.includes(o as RMark))) ms.push(o); });
    for (const m of ms) { m.visible = false; this.scene.add(m); }
  },
  // A mark that landed on a door's leaf becomes part of the leaf, so it swings with the door. (Marks are pooled:
  // each is put back in the scene before it's used again, and before a level's meshes are thrown away.)
  onDoor(m: THREE.Object3D) {
    const map = G.Game && G.Game.map, doors = map && map.doorMeshes;
    if (!doors) return;
    m.updateMatrixWorld(true);
    const p = m.getWorldPosition(new THREE.Vector3());
    for (const pivot of doors) {
      const leaf = pivot.userData && pivot.userData.leaf;
      if (!leaf || pivot.getWorldPosition(_tv).distanceTo(p) > 2.6) continue; // (its world position: a door upstairs sits in its floor's group)
      leaf.updateMatrixWorld(true);
      const l = leaf.worldToLocal(p.clone()), g = leaf.geometry.parameters;
      // (a door's solid is thicker than its leaf: on the leaf's own face, not in the air in front of it)
      if (Math.abs(l.x) <= g.width / 2 + 0.03 && Math.abs(l.y) <= g.height / 2 + 0.03 && Math.abs(l.z) <= 0.09) { leaf.attach(m); m.position.z = Math.sign(l.z || 1) * (g.depth / 2 + 0.004); return; }
    }
  },
  // ------------------------------------------------------------ frag grenade marks
  // A chip's pock where it struck a surface: at p, flat on it (n: its normal, facing the chip), by what it hit. A dark pit
  // a few mm across, in a lighter chipped rim on plaster and stone, a dark speck on wood; metal, glass, soft stuff and
  // water show nothing. k scales it with the chip's speed; r1, r2: two random numbers (a size and a turn).
  fragMark(p: THREE.Vector3, n: number[], fx: string, k: number, r1: number, r2: number) {
    const L: Record<string, [number, number, number, number]> = { plaster: [0.032, 0.9, 0.88, 0.82], stone: [0.026, 0.8, 0.78, 0.74], wood: [0.011, 0.4, 0.3, 0.2], soil: [0.014, 0.35, 0.3, 0.25], plastic: [0.012, 0.5, 0.5, 0.5] };
    const l = L[fx]; if (!l) return;
    const im = this.fragMarks, i = this.fragN % this.FRAG_MARKS, sz = l[0] * k * (0.75 + 0.5 * r1);
    _fq.setFromUnitVectors(_fz, _fn.set(n[0], n[1], n[2])); _fq2.setFromAxisAngle(_fz, r2 * 6.283); _fq.multiply(_fq2);
    _fm.compose(_fp.set(p.x + n[0] * 0.003, p.y + n[1] * 0.003, p.z + n[2] * 0.003), _fq, _fs.set(sz, sz, 1));
    im.setMatrixAt(i, _fm); im.setColorAt(i, _fc.setRGB(l[1], l[2], l[3]));
    this.fragN++; im.count = Math.min(this.fragN, this.FRAG_MARKS); this.fragDirty = true;
  },
  // the frame's marks go up to the GPU (once)
  fragMarkFlush() {
    if (!this.fragDirty) return;
    this.fragDirty = false; this.fragMarks.instanceMatrix.needsUpdate = true; if (this.fragMarks.instanceColor) this.fragMarks.instanceColor.needsUpdate = true;
  },
  // the soot of a blast on the floor under it, drawn once: a dark core fading to a streaky grey edge, with ragged radial
  // streaks reaching out further in places
  scorchTexture() {
    const S = 256, c = document.createElement('canvas'); c.width = c.height = S;
    const g = c.getContext('2d') as CanvasRenderingContext2D, rnd = G.U.rng(7741);
    g.translate(S / 2, S / 2);
    const gr = g.createRadialGradient(0, 0, 0, 0, 0, S * 0.36);
    gr.addColorStop(0, 'rgba(8,7,6,0.92)'); gr.addColorStop(0.35, 'rgba(14,13,12,0.8)'); gr.addColorStop(0.7, 'rgba(40,38,35,0.35)'); gr.addColorStop(1, 'rgba(60,58,55,0)');
    g.fillStyle = gr; g.beginPath();
    for (let i = 0; i <= 48; i++) { const a = (i / 48) * 6.283, r = S * 0.36 * (0.82 + 0.3 * rnd()); g.lineTo(Math.cos(a) * r, Math.sin(a) * r); }
    g.fill();
    g.lineCap = 'round';
    for (let i = 0; i < 70; i++) { // (the streaks: long and faint, a few reaching out to the edge)
      const a = rnd() * 6.283, r0 = S * (0.08 + 0.12 * rnd()), r1 = Math.min(S * 0.49, S * (0.22 + 0.5 * rnd() * rnd())), a1 = a + (rnd() - 0.5) * 0.12;
      g.strokeStyle = `rgba(${28 + rnd() * 24 | 0},${27 + rnd() * 22 | 0},${25 + rnd() * 20 | 0},${0.1 + 0.3 * rnd()})`; g.lineWidth = 1 + rnd() * 3;
      g.beginPath(); g.moveTo(Math.cos(a) * r0, Math.sin(a) * r0); g.lineTo(Math.cos(a1) * r1, Math.sin(a1) * r1); g.stroke();
    }
    for (let i = 0; i < 40; i++) { const a = rnd() * 6.283, r = S * (0.2 + 0.25 * rnd()); g.fillStyle = `rgba(35,33,30,${0.08 + 0.15 * rnd()})`; g.beginPath(); g.arc(Math.cos(a) * r, Math.sin(a) * r, 1 + rnd() * 4, 0, 6.283); g.fill(); } // (flecks of it)
    return new THREE.CanvasTexture(c);
  },
  // A scorch on the surface a grenade went off over (y: that surface's height): d across, k how strong (a grenade that
  // went off in the air leaves a faint one), rot: its turn. Pooled: the oldest is reused.
  scorch(x: number, y: number, z: number, d: number, k: number, rot: number) {
    const m = this.scorches[this.scorchIdx]; this.scorchIdx = (this.scorchIdx + 1) % this.scorches.length;
    m.position.set(x, y + 0.006 + 0.0005 * this.scorchIdx, z); m.rotation.z = rot; m.scale.set(d, d, 1);
    (m.material as THREE.MeshBasicMaterial).opacity = k; m.visible = true;
  },
  explosion(p: THREE.Vector3, radius: number) {
    const m = this.blasts.find((b: THREE.Mesh) => !b.visible) || this.blasts[0];
    m.position.copy(p); m.visible = true;
    m.userData.life = m.userData.max = 0.45; m.userData.r = radius;
    const l = this.blastLights.reduce((a: THREE.PointLight, b: THREE.PointLight) => (b.intensity < a.intensity ? b : a));
    l.position.copy(p); l.intensity = 6; l.userData.by = m;
    this.particles(p, 40, 0xffa040, 9, 0.6, 4, 1);
    this.particles(p, 30, 0x444038, 3, 1.4, -0.5, 1);
  },
  // The throw you're lining up: a dotted arc to where it goes off (G.Views.predictNade), and a ring there. Drawn
  // the frames it's called; cocked (pin out), brighter.
  throwArc(pts: THREE.Vector3[], cocked: boolean) {
    if (!this._arc) {
      const N = 400, geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(N * 3), 3));
      const dots = new THREE.Points(geo, new THREE.PointsMaterial({ color: 0xfff1b8, size: 0.05, transparent: true, opacity: 0.8, depthTest: false }));
      dots.frustumCulled = false; dots.renderOrder = 15;
      const ring = new THREE.Mesh(new THREE.RingGeometry(0.28, 0.36, 28), new THREE.MeshBasicMaterial({ color: 0xffd060, transparent: true, opacity: 0.8, side: THREE.DoubleSide, depthTest: false }));
      ring.rotation.x = -Math.PI / 2; ring.renderOrder = 15;
      this.scene.add(dots, ring);
      this._arc = { dots, ring, N };
    }
    const A = this._arc, pos = A.dots.geometry.attributes.position as THREE.BufferAttribute;
    let n = 0, last = null;
    for (let i = 0; i < pts.length && n < A.N; i += 2) { const q = pts[i]; pos.setXYZ(n++, q.x, q.y, q.z); last = q; }
    last = pts[pts.length - 1] || last;
    pos.needsUpdate = true; A.dots.geometry.setDrawRange(0, n);
    A.dots.material.opacity = cocked ? 0.95 : 0.45; A.ring.material.opacity = cocked ? 0.9 : 0.4;
    if (last) A.ring.position.set(last.x, last.y - 0.04, last.z);
    A.dots.visible = A.ring.visible = true; A.f = this.frameNo;
  },
  // a flashbang going off: a blinding point of light and a burst of sparks
  flashAt(p: THREE.Vector3) {
    const l = this.muzzleLights[this.mlIdx = ((this.mlIdx || 0) + 1) % this.muzzleLights.length];
    if (l) { l.position.copy(p); l.color.setHex(0xffffff); l.intensity = 40; l.distance = 26; l.userData.t = 0.12; }
    this.particles(p, 30, 0xfff6d8, 5, 0.35, 2, 1.6);
  },
  muzzleFlashAt(p: THREE.Vector3, color = 0xffb060) {
    const l = this.muzzleLights[this.muzzleIdx]; this.muzzleIdx = (this.muzzleIdx + 1) % this.muzzleLights.length;
    l.position.copy(p); l.color.setHex(color); l.intensity = 2.5; l.userData.t = 0.05;
  },
  beginLasers() { this.laserUsed = 0; },
  laser(a: THREE.Vector3, b: THREE.Vector3) {
    const l = this.lasers[this.laserUsed++]; if (!l) return;
    const arr = (l.geometry.attributes.position as THREE.BufferAttribute).array as Float32Array;
    arr[0] = a.x; arr[1] = a.y; arr[2] = a.z; arr[3] = b.x; arr[4] = b.y; arr[5] = b.z;
    l.geometry.attributes.position.needsUpdate = true;
    l.visible = true;
  },
  endLasers() { for (let i = this.laserUsed; i < this.lasers.length; i++) this.lasers[i].visible = false; },

  update(dt: number) {
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
      const l = this.blastLights.find((x: THREE.PointLight) => x.userData.by === b);
      if (l) l.intensity = b.userData.life > 0 ? (1 - k) * 6 : 0;
      if (b.userData.life <= 0) { b.visible = false; if (l) l.userData.by = null; }
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
          if (this.pBlood[i] < 2 || Math.random() < 0.4) this.bloodDrop(P[i * 3], g, P[i * 3 + 2], 0.035 + Math.random() * 0.04 + Math.min(0.05, sp * 0.012));
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
    // the wound streams' fine drops: falling until they land, where one in eight or so leaves a small drop (the stream's many:
    // every one marking the floor would use up the blood marks)
    const SP = this.sPos, SV = this.sVel, SL = this.sLife, SC = this.sCol, SB = this.sBase;
    let live = false;
    for (let i = 0; i < this.SN; i++) {
      if (SL[i] <= 0) continue;
      live = true; SL[i] -= dt;
      const g = this.bloodFloor(SP[i * 3], SP[i * 3 + 2], SP[i * 3 + 1]);
      if (SP[i * 3 + 1] <= g + 0.02 || SL[i] <= 0) {
        if (Math.random() < 0.13) this.bloodDrop(SP[i * 3], g, SP[i * 3 + 2], 0.025 + Math.random() * 0.03 + Math.min(0.04, Math.hypot(SV[i * 3], SV[i * 3 + 2]) * 0.01));
        SL[i] = 0; SP[i * 3 + 1] = -100;
        continue;
      }
      SV[i * 3 + 1] -= 9.8 * dt;
      SP[i * 3] += SV[i * 3] * dt; SP[i * 3 + 1] += SV[i * 3 + 1] * dt; SP[i * 3 + 2] += SV[i * 3 + 2] * dt;
      SC[i * 3] = SB[i * 3]; SC[i * 3 + 1] = SB[i * 3 + 1]; SC[i * 3 + 2] = SB[i * 3 + 2];
    }
    if (live || this.sLive) { this.streamPts.geometry.attributes.position.needsUpdate = true; this.streamPts.geometry.attributes.color.needsUpdate = true; }
    this.sLive = live;
  },
  // ------------------------------------------------------------ picture-in-picture scopes
  pipTexture() {
    if (!this.pipRT) this.pipRT = new THREE.WebGLRenderTarget(512, 512, { samples: 4 });
    return this.pipRT.texture;
  },
  // Render the world from the scope's ocular lens along its axis. The view is the lens's angular size (seen
  // from the eye) divided by the magnification, so things in the scope are exactly that much bigger than
  // the same things seen around it.
  _renderPip(pip: any) {
    const cam = this.camera, sc = this.scopeCam || (this.scopeCam = new THREE.PerspectiveCamera(10, 1, 0.05, 200));
    this.vmScene.updateMatrixWorld();
    pip.disk.matrixWorld.decompose(sc.position, sc.quaternion, this._pipScale || (this._pipScale = new THREE.Vector3()));
    const d = Math.max(0.03, cam.position.distanceTo(sc.position));
    sc.fov = THREE.MathUtils.radToDeg(2 * Math.atan(pip.r / d)) / pip.mag;
    sc.far = cam.far; // (as far as you can see without it)
    sc.updateProjectionMatrix();
    pip.mat.uniforms.pmil.value = (0.001 / Math.tan(THREE.MathUtils.degToRad(sc.fov) / 2)) * (pip.fp === 'sfp' ? pip.fpMag / pip.mag : 1); // (a mil's share of the lens's radius, at this power; a second focal plane's marks are true at one power only, and a mil is that much wider at any other)
    const eye = pip.disk.worldToLocal(cam.position.clone());
    pip.mat.uniforms.eye.value.set((eye.x / pip.r) * 0.8, (eye.y / pip.r) * 0.8);
    const r = this.renderer;
    r.setRenderTarget(this.pipRT!);
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
    const t0 = performance.now(), extras: THREE.Object3D[] = [];
    const put = (m: THREE.Object3D) => { if (m) { m.position.set(0, -50, 0); this.dynRoot.add(m); extras.push(m); } };
    try {
      if (G.Casings.warm) for (const m of G.Casings.warm()) put(m);
      if (G.Loot.meshFor) { put(G.Loot.meshFor(G.Gear.pack(G.Gear.medItem('bandage')))); }
      put(new THREE.Mesh(new THREE.PlaneGeometry(1, 1), this.bloodMats.spatter));
      if (G.Game.map) for (const m of G.Damage.warm(G.Game.map as unknown as Parameters<typeof G.Damage.warm>[0])) put(m);
    } catch (e) { console.warn('warmup', e); }
    const hidden: THREE.Object3D[] = [];
    for (const sc of [this.scene, this.vmScene]) sc.traverse((o: THREE.Object3D) => { if (!o.visible) { o.visible = true; hidden.push(o); } });
    try {
      this.renderer.compile(this.scene, this.camera); this.renderer.compile(this.vmScene, this.camera);
      // (and the scope's picture: anything drawn into a texture is a different shader from the same thing on the screen, for
      // all of the scene's materials, whatever gun you've got now: you can pick one up)
      this.pipTexture(); this.renderer.setRenderTarget(this.pipRT!); this.renderer.compile(this.scene, this.camera); this.renderer.setRenderTarget(null);
    } catch (e) { console.warn('warmup', e); }
    for (const o of hidden) o.visible = false;
    for (const m of extras) { m.removeFromParent(); m.traverse((o: any) => { if (o.geometry) o.geometry.dispose(); }); }
    return performance.now() - t0;
  },
  render() {
    const r = this.renderer;
    this.trailsUpdate();
    if (this.debris) { const now = performance.now(); this.debris.update(Math.min(0.05, (now - (this.debrisT || now)) / 1000)); this.debrisT = now; }
    // (the draw calls and triangles counted over the whole frame, every pass: js/profiler.ts reads them after)
    r.info.autoReset = false; r.info.reset();
    G.LightGrid.on(true); // (the lamps' light: only for the level's own frame)
    for (const m of this.streaks) if (m.visible && m.userData.f !== this.frameNo) m.visible = false; // (rounds that stopped)
    for (const m of this.glows) if (m.visible && m.userData.f !== this.frameNo) m.visible = false;
    for (const m of this.flares) if (m.visible && m.userData.f !== this.frameNo) m.visible = false;
    if (this._arc && this._arc.f !== this.frameNo) this._arc.dots.visible = this._arc.ring.visible = false; // (not lining up a throw)
    this.frameNo++;
    this.camera.updateMatrixWorld();
    this.vmHolder.matrix.copy(this.camera.matrixWorld);
    this.vmHolder.matrixWorldNeedsUpdate = true;
    // the scope picture: only rendered while you're bringing the gun up or looking through it
    const pip = this.vm && this.vm.visible && this.vm.userData.pip, live = this.pipLive || 0;
    if (pip) {
      pip.mat.uniforms.live.value = THREE.MathUtils.smoothstep(live, 0.35, 0.8);
      if (live > 0.35) this._renderPip(pip);
    }
    // a fisheye (the death camera): the scene goes into a texture, then to the screen through a barrel distortion
    this.fk = (this.fk || 0) + ((this.fisheye && G.Game && G.Game.phase === 'level' ? 1 : 0) - (this.fk || 0)) * 0.12;
    const fish = this.fk > 0.01;
    if (fish) {
      const sz = r.getDrawingBufferSize(this._fsz || (this._fsz = new THREE.Vector2()));
      if (!this.fishRT || this.fishRT.width !== sz.x || this.fishRT.height !== sz.y) {
        if (this.fishRT) this.fishRT.dispose();
        this.fishRT = new THREE.WebGLRenderTarget(sz.x, sz.y, { samples: 4, stencilBuffer: true, type: THREE.HalfFloatType }); // (half float: the over-bright survives, to be rolled off below)
      }
      r.setRenderTarget(this.fishRT);
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
    if (fish) {
      r.setRenderTarget(null);
      if (!this.fishQuad) {
        const mat = new THREE.ShaderMaterial({ depthTest: false, depthWrite: false,
          uniforms: { map: { value: null }, k: { value: 0 }, ax: { value: 1 } },
          vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
          // barrel: the edges squeezed in, the middle a little larger; the corners stay the corners
          fragmentShader: this.TONE + ' uniform sampler2D map; uniform float k; uniform float ax; varying vec2 vUv; void main() { vec2 p = (vUv - 0.5) * 2.0; p.x *= ax; float r2 = dot(p, p), R2 = ax * ax + 1.0; vec2 q = p * (1.0 + k * r2) / (1.0 + k * R2); q.x /= ax; vec4 c = texture2D(map, q * 0.5 + 0.5); gl_FragColor = linearToOutputTexel(vec4(bpTone(c.rgb), c.a)); }', toneMapped: false });
        this.fishQuad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat); this.fishQuad.frustumCulled = false;
        this.fishScene = new THREE.Scene(); this.fishScene.add(this.fishQuad);
        this.fishCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
      }
      const u = this.fishQuad.material.uniforms;
      u.map.value = this.fishRT!.texture; u.k.value = 0.3 * this.fk!; u.ax.value = this.fishRT!.width / this.fishRT!.height;
      r.clear();
      r.render(this.fishScene!, this.fishCam!);
    }
    r.clearDepth();
    r.clearStencil(); // reflex sight windows mark the stencil for their reticles
    r.render(this.vmScene, this.camera);
    G.LightGrid.on(false);
    r.info.autoReset = true;
  },
};
G.R = G_R;
interface GameModules { R: typeof G_R; }
