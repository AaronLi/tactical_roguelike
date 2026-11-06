'use strict';
const _tv = new THREE.Vector3(), _tv2 = new THREE.Vector3();
const _fq = new THREE.Quaternion(), _fq2 = new THREE.Quaternion(), _fz = new THREE.Vector3(0, 0, 1), _fn = new THREE.Vector3(), _fp = new THREE.Vector3(), _fs = new THREE.Vector3(), _fm = new THREE.Matrix4(), _fc = new THREE.Color();
const _bjc = new THREE.Color();
const SCOPE_FAR = 600; // (how far a magnified scope's picture is drawn, m)
// Three.js scene, character models, first-person viewmodels and particle effects.
interface Trail { line: THREE.Line<THREE.BufferGeometry, THREE.LineBasicMaterial>; mat: THREE.LineBasicMaterial; n: number; N: number; shot: PShot; old: number | null; marks: THREE.Mesh<THREE.SphereGeometry, THREE.MeshBasicMaterial>[]; keys?: Set<any>; }
type ImpactKind = 'wall' | 'blood' | 'armor'; // what a round hit (impact)
type ImpactFx = 'metal' | 'stone' | 'wood' | 'plaster' | 'soft' | 'glass' | 'soil' | 'plastic' | 'water'; // what it threw up (IMPACT), js/materials.ts fx
type BloodKind = 'drop' | 'spatter' | 'pool';
interface RBloodMats { [kind: string]: THREE.MeshStandardMaterial; drop: THREE.MeshStandardMaterial; spatter: THREE.MeshStandardMaterial; pool: THREE.MeshStandardMaterial; }
type RMark = THREE.Mesh<THREE.BufferGeometry, THREE.Material>; // a pooled decal or blood mark
type RWound = (THREE.Mesh<THREE.BufferGeometry, THREE.Material> | THREE.Line<THREE.BufferGeometry, THREE.Material>) & { onRig?: any }; // a track kept on a body
interface RWarm { t0: number; tWait: number; waitMs?: number; done: (() => void) | null; tasks: (() => void)[]; stage: number; frames: number; undo: (() => void)[]; had: Set<any>; ask?: any[] } // (js/render.ts warmup)
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
  vmLights: [] as [THREE.Light, number][], // (the gun in your hands' own light, and how bright it is in a lit room)
  vmPts: [] as THREE.PointLight[], vmSpots: [] as THREE.SpotLight[], // (the dynamic lights' stand-ins for it: eyeLight)
  vmDark: false, // (no light of its own: the level's light at the eye is all it gets, eyeLight)
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
  nv: null as { spec: NvSpec; k: number; fov: number; ir: boolean } | null, // (night vision in front of your eyes: what it is, how far down (1: down), the view's own width unzoomed, its IR illuminator on: js/player.ts nvStep)
  nvOver: 0, // (a flashbang's glare through the tubes, 1 a whiteout, fading: flashOver)
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
  nvRT: undefined as THREE.WebGLRenderTarget | undefined,
  nvQuad: undefined as THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial> | undefined,
  nvScene: undefined as THREE.Scene | undefined,
  depthOnly: undefined as THREE.MeshBasicMaterial | undefined,
  init() {
    const r = (this.renderer = new THREE.WebGLRenderer({ antialias: true, stencil: true, powerPreference: 'high-performance', reversedDepthBuffer: true }));
    this.reverseDepth(r);
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
    this.hemi = new THREE.HemisphereLight(0xb0c0d0, 0x302820, Math.PI * 0.26);
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
    const vhl = new THREE.HemisphereLight(0xdde6f0, 0x2a2622, Math.PI * 0.55); this.vmScene.add(vhl);
    const vdl = new THREE.DirectionalLight(0xffffff, Math.PI * 0.3); vdl.position.set(1, 2, 1); this.vmScene.add(vdl);
    this.vmLights = [[vhl, Math.PI * 0.55], [vdl, Math.PI * 0.3]];
    this.vmScene.environment = this._envMap(r);
    this.vmMuzzle = new THREE.PointLight(0xffb060, 0, 3, 2);
    this.vmMuzzle.position.set(0.2, -0.1, -0.8);
    this.vmHolder.add(this.vmMuzzle);
    // the level's own dynamic lights, as they fall on the gun in your hands (a muzzle flash, a flashbang, a fireball, a
    // weapon light pointed your way): a few stand-ins in the gun's scene, set each frame from the nearest (eyeLight)
    this.vmPts = [0, 1, 2].map(() => { const l = new THREE.PointLight(0xffffff, 0, 1, 2); this.vmScene.add(l); return l; });
    this.vmSpots = [0, 1].map(() => { const s = new THREE.SpotLight(0xffffff, 0, 1, 0.3, 0.6, 1.6); s.target = new THREE.Object3D(); this.vmScene.add(s, s.target); return s; });

    this.levelRoot = new THREE.Group();
    this.scene.add(this.levelRoot);
    this.dynRoot = new THREE.Group();
    this.scene.add(this.dynRoot);

    this._initFx();
    window.addEventListener('resize', () => this.resize());
  },
  // A reversed depth buffer (EXT_clip_control: the near plane at depth 1, the far plane at 0, cleared to 0 and tested
  // greater-than; three does that, the shadow maps' comparisons included, when it's asked for and the browser has it, and
  // falls back to the usual one when it hasn't). Its point is a floating-point depth buffer: there the float's own
  // precision, finest near 0, sits at the far end, where the projection leaves least, so distant surfaces close together
  // (a roof's edge on a wall 300 m off through a scope) no longer fight. The screen's own depth buffer is 24-bit fixed
  // point (a canvas can't have another), where it changes little either way; the scope's picture, magnified, is where
  // distant surfaces come close enough to see fight, and it gets a 32-bit float one (viewRT). (Night vision's and the
  // fisheye's frames, the screen's size, keep 24 bits: a float one with its stencil there cost the GPU more and showed nothing.)
  //   - three turns a polygon offset's factor round for a reversed buffer but not its units (r186), so a decal held
  //     off its wall by units (the stickers, the range's lane numbers) went behind it: both are turned here.
  //   - a point projected through a camera that's been drawn with it is behind the eye with z < 0 (it was z > 1): behind().
  reverseDepth(r: THREE.WebGLRenderer) {
    if (!r.capabilities.reversedDepthBuffer) return;
    const st = r.state as any, po = st.setPolygonOffset;
    st.setPolygonOffset = function (on: boolean, factor: number, units: number) { return po.call(this, on, factor, st.buffers.depth.getReversed() ? -units : units); };
  },
  behind(v: THREE.Vector3, cam: THREE.Camera) { return (cam as any).reversedDepth ? v.z < 0 : v.z > 1; },
  // the scope picture's target (opts: the WebGLRenderTarget's): with a reversed depth buffer, its
  // depth 32-bit float (see above); the depth isn't read after, so it's not resolved out of the multisampled buffer
  viewRT(w: number, h: number, opts: THREE.RenderTargetOptions) {
    const rev = this.renderer && this.renderer.capabilities.reversedDepthBuffer;
    return new THREE.WebGLRenderTarget(w, h, rev ? Object.assign({}, opts, { depthTexture: new THREE.DepthTexture(w, h, THREE.FloatType), resolveDepthBuffer: false, resolveStencilBuffer: false }) : opts);
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
    // On a night level (js/level.ts nightify) there's none of that: with the power off, a room with no window is black but
    // for what the emergency lights, the moon through a doorway, a weapon light or a flash actually reach.
    this.hemi.color.setHex(th.hemi || th.light, THREE.LinearSRGBColorSpace); this.hemi.intensity = map.night ? 0 : Math.PI * (th.hemiI || 0.26) ** 2 * (th.hub ? 1 : G.LightGrid.opts.fill);
    // the gun in your hands: lit by what's lit where you stand (eyeLight), on a level with its lamps in the light grid
    this.vmDark = !th.hub && G.LightGrid.built;
    for (const [l, k] of this.vmLights) l.intensity = k;
  },
  // The light where you stand, for the gun in your hands (drawn in a scene of its own, js/render.ts render: so the level's
  // lights never reach it). Its own studio light (vmLights, and the environment its metal reflects) stands for a lit
  // room's (it lights the gun several times as brightly as the light grid does a wall there): it's turned down by how
  // much light there is at the eye, all of it in a lit room (EYE_FULL: so a day level's lit rooms look as they did;
  // outdoors under a day level's evening sky, about half, a corridor between its lamps two thirds; by an exit sign, a
  // third; moonlight a tenth), none in the dark. That light, E:
  //   the light grid's at the eye (the lamps, the sky through what's open to it, their light bounced round: as the walls
  //   there take it) + the flat fill (this.hemi)
  //   + each dynamic light's bounce: a weapon light's off what it shines on (stronger the closer that is: a wall at arm's
  //   length lights up the gun, a long corridor hardly), a flash's or a fireball's off the room round it, where you can
  //   see it.
  // The dynamic lights themselves, where you can see them from the eye (a flash, a fireball, someone's light pointed
  // at you) also light the gun directly: the nearest few copied into its scene each frame (vmPts, vmSpots).
  // Its own light takes the colour of the light at the eye: on a night level wholly (under an exit sign, green), by day
  // only as much as it's turned down (a day level's lit rooms look as they did).
  // (EYE_BOUNCE: how much of a flash's light where you are comes back to you off the room round it; SPOT_BOUNCE: of a
  // weapon light's, off the patch it lights: the patch's share of the light it reflects (half) that reaches a point a
  // metre off, its size at a metre (the beam's width) over a metre squared; so as the inverse square of how far off it is)
  EYE_FULL: 0.15, EYE_BOUNCE: 0.25, SPOT_BOUNCE: 0.045,
  _eye: new THREE.Color(), _eyeC: new THREE.Color(), _eyeT: new THREE.Color(), _eyeV: new THREE.Vector3(), _eyeD: new THREE.Vector3(), _vmSky: new THREE.Color(0xdde6f0), _vmGround: new THREE.Color(0x2a2622),
  eyeLight(): number {
    const map = G.Game && G.Game.map, cam = this.camera, E = this._eye, C = this._eyeC, p = cam.position, L = G.Level;
    for (const l of this.vmPts) l.intensity = 0;
    for (const s of this.vmSpots) s.intensity = 0;
    if (!this.vmDark || !map) return 1;
    G.LightGrid.at(p.x, p.y, p.z, E, 0.7);
    const hk = this.hemi.intensity / Math.PI; // (the lights' figures in r149's units, as the light grid's are: js/util.ts)
    E.r += this.hemi.color.r * hk; E.g += this.hemi.color.g * hk; E.b += this.hemi.color.b * hk;
    const fall = (d: number, r: number, decay: number) => (r > 0 ? Math.pow(Math.max(0, 1 - d / r), decay) : 1 / (1 + d * d)); // (three.js' own, with a reach)
    const seen = (q: THREE.Vector3) => L.los(map, q.x, q.y, q.z, p.x, p.y, p.z);
    // points: the muzzle flashes and flashbangs (not your own: the gun's own flash, vmMuzzle, has that), the fireballs
    const pts: [THREE.PointLight, number][] = [];
    for (const l of [...this.muzzleLights, ...this.blastLights]) {
      if (!(l.intensity > 0)) continue;
      const d = l.position.distanceTo(p);
      if ((this.muzzleLights.includes(l) && d < 1.2) || d >= l.distance || !seen(l.position)) continue;
      const a = l.intensity / Math.PI * fall(d, l.distance, l.decay);
      C.copy(l.color).multiplyScalar(a * this.EYE_BOUNCE); E.add(C);
      pts.push([l, a]);
    }
    pts.sort((a, b) => b[1] - a[1]);
    this.vmPts.forEach((v, i) => { const s = pts[i] && pts[i][0]; if (!s) return; v.position.copy(s.position); v.color.copy(s.color); v.intensity = s.intensity; v.distance = s.distance; v.decay = s.decay; });
    // weapon lights: their bounce off what they light (as far as the beam goes before it hits something), and pointed
    // at you, their beam
    const sps: [THREE.SpotLight, number][] = [];
    for (const s of this.spots) {
      if (!(s.intensity > 0)) continue;
      const dir = this._eyeD.subVectors(s.target.position, s.position).normalize();
      const hit = L.raycast(map, s.position.x, s.position.y, s.position.z, dir.x, dir.y, dir.z, s.distance), hp = this._eyeV.copy(s.position).addScaledVector(dir, Math.max(0, hit.t - 0.08));
      const dh = hp.distanceTo(p);
      if (dh < s.distance && (dh < 0.3 || seen(hp))) {
        const a = s.intensity / Math.PI * fall(hit.t, s.distance, s.decay) * this.SPOT_BOUNCE / Math.max(0.5, hit.t) ** 2 * fall(dh, s.distance, s.decay);
        C.copy(s.color).multiplyScalar(a); E.add(C);
      }
      const d = s.position.distanceTo(p), toEye = this._eyeV.subVectors(p, s.position).normalize();
      if (d > 0.6 && d < s.distance && toEye.dot(dir) > Math.cos(s.angle) && seen(s.position)) sps.push([s, s.intensity * fall(d, s.distance, s.decay)]);
    }
    sps.sort((a, b) => b[1] - a[1]);
    this.vmSpots.forEach((v, i) => { const s = sps[i] && sps[i][0]; if (!s) return; v.position.copy(s.position); v.target.position.copy(s.target.position); v.target.updateMatrixWorld(); v.color.copy(s.color); v.intensity = s.intensity; v.distance = s.distance; v.decay = s.decay; v.angle = s.angle; v.penumbra = s.penumbra; });
    const lum = (E.r + E.g + E.b) / 3, k = Math.min(1, lum / this.EYE_FULL);
    // (its colour: toward the light's own, the dimmer it is; the light's as a tint, its brightest channel 1)
    const m = Math.max(E.r, E.g, E.b);
    const [vhl] = this.vmLights[0] as [THREE.HemisphereLight, number];
    vhl.color.copy(this._vmSky); vhl.groundColor.copy(this._vmGround);
    const tint = map.night ? 1 : 1 - k; // (by day, a lit room's lamps leave it as it was)
    if (m > 1e-6 && tint > 0) {
      C.setRGB(E.r / m, E.g / m, E.b / m);
      vhl.color.lerp(this._eyeT.copy(this._vmSky).multiply(C), tint); vhl.groundColor.lerp(this._eyeT.copy(this._vmGround).multiply(C), tint);
    }
    return k;
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
        if (c.isBatchedMesh && c._matricesTexture) c.dispose(); // (its geometry, and the textures of its instances' matrices)
        if (c.geometry) c.geometry.dispose();
        if (c.material && !c.userData.keepMat) (Array.isArray(c.material) ? c.material : [c.material]).forEach((m: THREE.Material & { map?: THREE.Texture | null }) => { if (m.map) m.map.dispose(); m.dispose(); }); // (keepMat: shared, js/scars.ts's)
      });
    };
    while (this.levelRoot.children.length) { const c = this.levelRoot.children[0]; dispose(c); this.levelRoot.remove(c); }
    this.decals.forEach((d: THREE.Object3D) => (d.visible = false));
    this.fragMarks.count = 0; this.fragN = 0; this.scorches.forEach((m) => (m.visible = false));
    for (const r of this.fires) r.t = 1e9; this.fireStep(0); // (a thermobaric's fireball still burning: gone with the level)
    if (this.bloodMarks) { this.bloodMarks.forEach((d: THREE.Object3D) => (d.visible = false)); this.pools.forEach((d: THREE.Object3D) => { d.visible = false; d.userData.owner = null; }); }
  },
  // the chips and dust a round throws out of what it hits (js/scars.ts): made once, the first time something's hit or the
  // shaders are compiled (warmup)
  debrisFx() {
    return this.debris || (this.debris = G.Scars.debris(this.scene, (x, z, y) => { const map = G.Game.map; return map ? G.Level.groundAt(map, x, z, 0.01, y) : 0; }));
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
    // a thermobaric's fireball and smoke (fireball), one of each drawn always, too small to see: their shaders are built with the
    // level's, not on the frame the first one goes off (a hitch, on some machines a long one, just when it's least wanted)
    for (const add of [true, false]) {
      const w = new THREE.InstancedMesh(this._fireGeo || (this._fireGeo = new THREE.PlaneGeometry(2, 2)), new THREE.MeshBasicMaterial({ map: this.fireTex(), transparent: true, depthWrite: false, blending: add ? THREE.AdditiveBlending : THREE.NormalBlending }), 1);
      w.setMatrixAt(0, new THREE.Matrix4().makeScale(1e-4, 1e-4, 1e-4)); w.setColorAt(0, new THREE.Color(0, 0, 0)); w.frustumCulled = false;
      this.scene.add(w);
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
      // (its map, 512 square, is made by three the first time it's drawn: drawn the first time the scene is, so every light has
      // one from the start. three r186 lights what it's drawing from a light with no map yet with a stand-in it doesn't set up
      // for comparing (fixed in r187): the draw fails and the whole level goes unlit, the GL saying "Mismatch between texture
      // format and sampler type")
      s.castShadow = true; s.shadow.autoUpdate = false; s.shadow.needsUpdate = true; s.shadow.camera.near = 0.1;
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
      // (the light's shadow map is a depth texture three compares against, sampled as one: lit or not, the edge smoothed over a
      // texel. It's made the first time it's drawn, so the beam picks it up as it's drawn.)
      const sh = this.spots[i].shadow, cone = new THREE.Mesh(cg, new THREE.ShaderMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
        uniforms: { shMap: { value: null as THREE.Texture | null }, shMat: { value: sh.matrix } },
        // (brightest down the middle of it, nothing at its edges: no hard line round a beam in the air; it stops where its light does)
        vertexShader: 'uniform mat4 shMat; varying vec3 vC, vN, vV; varying vec4 vS; void main() { vC = color; vN = normalMatrix * normal; vec4 q = modelViewMatrix * vec4(position, 1.0); vV = -q.xyz; vS = shMat * modelMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * q; }',
        fragmentShader: 'uniform sampler2DShadow shMap; varying vec3 vC, vN, vV; varying vec4 vS; void main() { vec3 s = vS.xyz / vS.w; if (texture(shMap, s) < 0.5) discard; float a = abs(dot(normalize(vN), normalize(vV))); gl_FragColor = vec4(vC * a * a * a * 0.11, 1.0); }' }));
      cone.onBeforeRender = () => { cone.material.uniforms.shMap.value = sh.map ? sh.map.depthTexture : null; };
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
  // a weapon light at pos shining along dir (k: how bright; seen: someone else's, so you see the beam and the lamp; haze:
  // your own, on a night level: its beam in the air in front of you, without the lamp)
  tacLight(pos: THREE.Vector3, dir: THREE.Vector3, k = 1, seen = false, haze = false) {
    const s = this.spots[this.spotUsed++]; if (!s) return;
    s.position.copy(pos); s.target.position.copy(pos).add(dir); s.intensity = Math.PI * 0.9 * k; s.distance = 24 + 10 * k; s.shadow.needsUpdate = true;
    const C = (seen || haze) && this.cones[this.coneUsed++];
    if (!C) return;
    const len = 9 * k, r = len * Math.tan(0.3), at = _tv.subVectors(this.camera.position, pos).normalize().dot(dir); // (at: how nearly it's pointing at you)
    C.cone.position.copy(pos); C.cone.quaternion.setFromUnitVectors(_tv2.set(0, -1, 0), _tv.copy(dir)); C.cone.scale.set(r, len, r); C.cone.visible = true;
    C.lamp.position.copy(pos).addScaledVector(dir, 0.02); C.lamp.scale.setScalar(0.1 + 0.5 * k * Math.max(0, at) ** 3); C.lamp.visible = seen;
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
    this.debrisFx().burst(p, q);
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
    l.position.copy(p); l.intensity = Math.PI * 6; l.userData.by = m;
    this.particles(p, 40, 0xffa040, 9, 0.6, 4, 1);
    this.particles(p, 30, 0x444038, 3, 1.4, -0.5, 1);
  },
  // A thermobaric's fireball (js/player.ts tbModel): flame in every cell of floor its cloud reached, lit in the order it reached
  // them (out from where it went off, round the furniture and through the open doorways) at the speed a burning cloud's front
  // goes, and stacked two deep from the floor to the ceiling, so the room fills with it; white-yellow as it lights, orange as it
  // rolls and swells, dull red, gone in about a second and a half. Then the soot: a dark layer of smoke under the ceiling that
  // thins over a few seconds, and scorches on the floor. One of the two blast lights, bright and orange, in the middle of it.
  // Two InstancedMeshes a burst (a few hundred soft round puffs, each turned to face the camera), each instance written once a frame
  // while it lasts.
  // a soft round puff: white in the middle, fading out to nothing at the edge (tinted per puff)
  fireTex() {
    if (this._fireTex) return this._fireTex;
    const c = document.createElement('canvas'); c.width = c.height = 64;
    const g = c.getContext('2d') as CanvasRenderingContext2D, gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.35, 'rgba(255,255,255,0.75)'); gr.addColorStop(0.7, 'rgba(255,255,255,0.25)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
    return (this._fireTex = new THREE.CanvasTexture(c));
  },
  fires: [] as any[], _fireGeo: null as THREE.PlaneGeometry | null, _fireTex: null as THREE.Texture | null,
  FIRE: { LAYERS: 2, FRONT: 24, LIFE: 1.35, SMOKE: 6 },
  fireball(M: any) {
    const T = THREE, L = G.Level, TS = L.TS, F = this.FIRE, map = M.map as LvMap, W = map.W, n = M.cloud;
    if (!n) return;
    if (M.p && M.p.distanceTo) this.flashOver(G.U.clamp(1.3 - M.p.distanceTo(this.camera.position) / 20, 0, 1)); // (the tubes whited out by it: night vision)
    const geo = this._fireGeo || (this._fireGeo = new T.PlaneGeometry(2, 2)), rnd = G.U.rng(((M.p.x * 7919 + M.p.z * 104729) | 0) >>> 0 || 1);
    const N = n * F.LAYERS, tex = this.fireTex(), flame = new T.InstancedMesh(geo, new T.MeshBasicMaterial({ map: tex, transparent: true, blending: T.AdditiveBlending, depthWrite: false }), N);
    const smoke = new T.InstancedMesh(geo, new T.MeshBasicMaterial({ map: tex, color: 0xffffff, transparent: true, opacity: 0.75, depthWrite: false }), n);
    flame.frustumCulled = smoke.frustumCulled = false; flame.renderOrder = 3; smoke.renderOrder = 2;
    flame.instanceMatrix.setUsage(T.DynamicDrawUsage); smoke.instanceMatrix.setUsage(T.DynamicDrawUsage);
    const at = new Float32Array(N * 6), sm = new Float32Array(n * 5), gys = new Float32Array(n);
    let floor = Infinity, sx = 0, sz = 0;
    for (let i = 0; i < n; i++) { const c = M.fill.order[i]; gys[i] = L.groundAt(map, ((c % W) + 0.5) * TS, (((c / W) | 0) + 0.5) * TS, 0.01, M.p.y + 0.3); floor = Math.min(floor, gys[i]); }
    const ceil = floor + L.WALL_H;
    for (let i = 0; i < n; i++) {
      const c = M.fill.order[i], cx = ((c % W) + 0.5) * TS, cz = (((c / W) | 0) + 0.5) * TS, t0 = 0.08 + M.fill.d[i] / F.FRONT;
      sx += cx; sz += cz;
      for (let k = 0; k < F.LAYERS; k++) {
        const j = (i * F.LAYERS + k) * 6, lo = gys[i] + 0.25, hi = ceil - 0.5, y = lo + (hi - lo) * (k + 0.2 + 0.6 * rnd()) / F.LAYERS;
        at[j] = cx + (rnd() - 0.5) * TS * 0.6; at[j + 1] = y; at[j + 2] = cz + (rnd() - 0.5) * TS * 0.6; at[j + 3] = t0 + 0.05 * k + 0.04 * rnd(); at[j + 4] = 0.55 + 0.3 * rnd(); at[j + 5] = rnd();
      }
      const q = i * 5; sm[q] = cx + (rnd() - 0.5) * 0.3; sm[q + 1] = ceil - 0.5 - 0.6 * rnd(); sm[q + 2] = cz + (rnd() - 0.5) * 0.3; sm[q + 3] = t0 + 0.5 + 0.3 * rnd(); sm[q + 4] = i % 2 ? 0 : 0.8 + 0.5 * rnd(); // (a puff every other cell: smoke enough, half the drawing)
      smoke.setColorAt(i, new T.Color().setScalar(0.07 + 0.08 * rnd()));
    }
    flame.setColorAt(0, new T.Color(0, 0, 0)); (flame.instanceColor as THREE.InstancedBufferAttribute).setUsage(T.DynamicDrawUsage);
    this.scene.add(smoke, flame);
    const l = this.blastLights.reduce((a: THREE.PointLight, b: THREE.PointLight) => (b.intensity < a.intensity ? b : a));
    l.position.set(sx / n, floor + 1.8, sz / n); l.color.setHex(0xff7a30); l.distance = 10 + 2 * M.rc; l.intensity = 0;
    const rec = { t: 0, n, N, at, sm, flame, smoke, light: l };
    l.userData.by = rec;
    this.fires.push(rec);
    // soot on the floor where it burned, and the embers it throws
    for (let k = 0; k < Math.min(6, 1 + (n / 18 | 0)); k++) { const i = Math.floor(rnd() * n), c = M.fill.order[i]; this.scorch(((c % W) + 0.5) * TS, gys[i], (((c / W) | 0) + 0.5) * TS, 1.3 + rnd(), 0.75, rnd() * 6.283); }
    for (let k = 0; k < 6; k++) { const i = Math.floor(rnd() * n), c = M.fill.order[i]; this.particles(new T.Vector3(((c % W) + 0.5) * TS, floor + 1.2, (((c / W) | 0) + 0.5) * TS), 8, 0xffa040, 4, 0.9, 3, 1); }
  },
  fireStep(dt: number) {
    if (!this.fires.length) return;
    const F = this.FIRE, m = new THREE.Matrix4(), q = new THREE.Quaternion(), roll = new THREE.Quaternion(), z = new THREE.Vector3(0, 0, 1), cq = this.camera.quaternion, v = new THREE.Vector3(), s = new THREE.Vector3(), c = new THREE.Color();
    for (const r of [...this.fires]) {
      r.t += dt;
      const t = r.t, at = r.at;
      for (let i = 0; i < r.N; i++) {
        const j = i * 6, a = t - at[j + 3];
        let k = 0, sc = 0;
        if (a > 0 && a < F.LIFE) {
          const u = a / F.LIFE;
          sc = at[j + 4] * (a < 0.1 ? 0.4 + 6 * a : 1 + 0.5 * u); // (bursting into being, then swelling as it rolls)
          k = a < 0.12 ? 1 : 1 - (u - 0.09) / 0.91;
          // white-yellow, orange, a dull red, out
          if (u < 0.1) c.setRGB(1, 0.85, 0.55); else if (u < 0.5) c.setRGB(1, 0.5 - 0.25 * (u - 0.1) / 0.4, 0.1); else c.setRGB(0.85 - 0.4 * (u - 0.5) / 0.5, 0.16, 0.03);
          c.multiplyScalar(Math.max(0, k) * 0.34 * (0.7 + 0.6 * at[j + 5])); // (dim each: they're many deep, and add up)
        } else c.setRGB(0, 0, 0);
        q.copy(cq).multiply(roll.setFromAxisAngle(z, at[j + 5] * 6.283 + t * (at[j + 5] - 0.5))); // (facing the camera, turned, turning)
        m.compose(v.set(at[j], at[j + 1] + Math.max(0, a) * 0.35, at[j + 2]), q, s.setScalar(Math.max(0.0001, sc)));
        r.flame.setMatrixAt(i, m); r.flame.setColorAt(i, c);
      }
      r.flame.instanceMatrix.needsUpdate = true; if (r.flame.instanceColor) r.flame.instanceColor.needsUpdate = true;
      for (let i = 0; i < r.n; i++) {
        const j = i * 5, a = t - r.sm[j + 3], sc = a > 0 && r.sm[j + 4] ? r.sm[j + 4] * Math.min(1.4, 0.4 + a * 0.8) : 0.0001;
        m.compose(v.set(r.sm[j], r.sm[j + 1] + Math.min(0.4, Math.max(0, a) * 0.1), r.sm[j + 2]), q.copy(cq).multiply(roll.setFromAxisAngle(z, j)), s.setScalar(sc * 1.4));
        r.smoke.setMatrixAt(i, m);
      }
      r.smoke.instanceMatrix.needsUpdate = true;
      (r.smoke.material as THREE.MeshBasicMaterial).opacity = 0.75 * G.U.clamp(1 - (t - 2) / (F.SMOKE - 2), 0, 1);
      const l = r.light;
      if (l.userData.by === r) l.intensity = Math.PI * (t < 0.15 ? 14 * t / 0.15 : t < 0.55 ? 14 : Math.max(0, 14 * (1 - (t - 0.55) / 0.9)));
      if (t > F.SMOKE + 0.2) {
        this.scene.remove(r.flame, r.smoke);
        (r.flame.material as THREE.Material).dispose(); (r.smoke.material as THREE.Material).dispose(); r.flame.dispose(); r.smoke.dispose();
        if (l.userData.by === r) { l.userData.by = null; l.intensity = 0; l.color.setHex(0xff8040); l.distance = 18; }
        this.fires.splice(this.fires.indexOf(r), 1);
      }
    }
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
    if (l) { l.position.copy(p); l.color.setHex(0xffffff); l.intensity = Math.PI * 40; l.distance = 26; l.userData.t = 0.12; }
    this.particles(p, 30, 0xfff6d8, 5, 0.35, 2, 1.6);
  },
  muzzleFlashAt(p: THREE.Vector3, color = 0xffb060) {
    const l = this.muzzleLights[this.muzzleIdx]; this.muzzleIdx = (this.muzzleIdx + 1) % this.muzzleLights.length;
    l.position.copy(p); l.color.setHex(color); l.intensity = Math.PI * 2.5; l.userData.t = 0.05;
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
    if (this.vmMuzzle.intensity > 0) this.vmMuzzle.intensity = Math.max(0, this.vmMuzzle.intensity - Math.PI * dt * 40);
    if (this.nvOver > 0) this.nvOver = Math.max(0, this.nvOver - dt * (this.nvOver > 0.6 ? 0.5 : 1.1)); // (the tubes come back from a flash: slowly at first)
    this.fireStep(dt);
    for (const b of this.blasts) if (b.visible) {
      b.userData.life -= dt;
      const k = 1 - b.userData.life / b.userData.max;
      b.scale.setScalar(0.3 + k * b.userData.r);
      b.material.opacity = (1 - k) * 0.8;
      const l = this.blastLights.find((x: THREE.PointLight) => x.userData.by === b);
      if (l) l.intensity = b.userData.life > 0 ? Math.PI * (1 - k) * 6 : 0;
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
  // ------------------------------------------------------------ night vision
  // A flashbang or a fireball where the tubes can take it in (js/game.ts onFlash, fireball): k 1 is a whiteout; the tubes'
  // bright-source protection cuts in and the picture comes back over a second or two.
  flashOver(k: number) { if (this.nv && this.nv.k > 0.9) this.nvOver = Math.max(this.nvOver, G.U.clamp(k, 0, 1)); },
  // Night vision is image intensification: it amplifies the light there is (moonlight through a window, a streetlamp down
  // the road, an exit sign, a lamp left on), and makes none: a sealed room with the power off stays black, but for the
  // goggles' own IR illuminator if it's switched on (js/lightgrid.ts lgNv: a cone of light from the head that only this
  // frame, drawn for the tubes, has in it; others with goggles see its source glaring at them: js/player.ts nvStep).
  // The frame (the level and the gun in your hands) is drawn into a half-float texture (nvRT, its mipmaps made as it's
  // resolved: blurs at every scale for free), and a picture of distance and heat at half the size (_heatPass:
  // everything plain, drawn once more), and one pass (nvMaterial) puts it on the screen as the tubes show it:
  //   - the tubes' fields: each a circle (spec.tubes: so many degrees off straight ahead, so many across, measured in the
  //     view's own unzoomed width, so aiming in magnifies the picture and not the eyepieces), the picture inside their
  //     union, a dark rim round each (the eyepiece's edge), and round them the plain view as far as the housing leaves it
  //     (spec.rest: a monocular all of the other eye's, binoculars and panoramics little); flipping down, they swing down
  //     into place from above, and the picture comes up once they're there;
  //   - the photocathode: no colour, only how bright (weighted to the red end: it's into the near infrared), shown in the
  //     phosphor's colour (spec.phos: green P43 on the cheaper tubes, white P45 on the panoramics), saturating softly (x / (1 + x));
  //   - automatic gain: the frame's average light (its last mipmap) brought up to a set level, as far as the tube can go
  //     (spec.gain) and never below GAIN_MIN: a lamp in view, a weapon light's patch, a muzzle flash turn it down and the
  //     rest goes dark round them; a lit room or daylight washes out (a night tool);
  //   - halos: what's over-bright spreads into a glow with a soft ring round it (a blurred mipmap's bright part, read on two
  //     rings round the pixel); a flash or a fireball whites it out (nvOver);
  //   - scintillation: speckle drawn afresh every frame, more the higher the gain (the darker it is) and the fainter the spot,
  //     and the odd bright sparkle in the dark; the fibre-optic plate's faint honeycomb, fixed to the tube;
  //   - the optics: soft toward each tube's edge (a blurrier mipmap), a little pincushioned and dimmer there; focused at
  //     about 25 m to infinity, so what's close is soft (the distance from the heat picture): a wall at arm's length, and
  //     the gun in your hands a little (a reflex sight's window is sharp: its dot's at infinity; a magnified scope, prism or
  //     magnifier's lens is soft, its picture unusable through the goggles, as it is in life; a 1x one is fine);
  //   - persistence: the phosphor's afterglow, the last frame's picture lingering a moment (ping-pong targets nvOut): a
  //     smear on fast turns, trails behind bright lights;
  //   - a fused thermal channel (spec.thermal): heat, not light (_heatPass: the warm bodies, the fresh muzzle flashes and
  //     fireballs, everything else cold; smoke and haze aren't drawn in it, so it sees through them; glass is, as
  //     opaque, cold, so it doesn't see through windows; walls stop it), run through edge detection and laid over the
  //     intensified picture as amber outlines, stronger the hotter against what's behind: a warm body in a black room
  //     or in smoke is a crisp outline where the picture has nothing.
  // What the suspects see is the host's business and the same as ever: night vision only helps you see.
  GAIN_MIN: 14, NV_TARGET: 0.1, NV_DIM: 0.1, NV_VM_D: 1.1, HEAT_LAYER: 3,
  _nvTubes: [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()],
  nvMaterial() {
    return new THREE.ShaderMaterial({ depthTest: false, depthWrite: false, toneMapped: false,
      uniforms: { map: { value: null }, heatMap: { value: null }, prev: { value: null }, lod: { value: 10 }, tanB: { value: new THREE.Vector2(1, 1) }, tubes: { value: this._nvTubes }, nt: { value: 1 },
        phos: { value: new THREE.Vector3(0.3, 1, 0.45) }, gMax: { value: 300 }, gMin: { value: this.GAIN_MIN }, target: { value: this.NV_TARGET }, k: { value: 1 }, over: { value: 0 }, frame: { value: 0 },
        grain: { value: 1 }, rest: { value: 0.2 }, thermal: { value: 0 }, px: { value: new THREE.Vector2(1e-3, 1e-3) }, hpx: { value: new THREE.Vector2(3e-3, 3e-3) }, res: { value: new THREE.Vector2(1, 1) }, persist: { value: 0.5 } },
      vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
      fragmentShader: this.TONE + `
        uniform sampler2D map, heatMap, prev; uniform float lod; uniform vec2 tanB; uniform vec3 tubes[4]; uniform int nt; uniform vec3 phos;
        uniform float gMax, gMin, target, k, over, frame, grain, rest, thermal, persist; uniform vec2 px, hpx, res; varying vec2 vUv;
        float hash(vec2 p) { vec3 q = fract(vec3(p.xyx) * 0.1031); q += dot(q, q.yzx + 33.33); return fract((q.x + q.y) * q.z); }
        float cath(vec3 c) { return dot(c, vec3(0.42, 0.45, 0.13)); }
        float heat(vec2 uv) { return texture2D(heatMap, uv).r; }
        void main() {
          vec3 ray = normalize(vec3((vUv * 2.0 - 1.0) * tanB, -1.0));
          float lift = (1.0 - k) * (1.0 - k) * 1.3 + (1.0 - k) * 0.25; // (swung up out of the view, flipping)
          float e = 9.0; vec2 ctr = vec2(0.5); // (the nearest tube's field: how far off its centre, in its radius, under 1 inside; its centre on the screen)
          for (int i = 0; i < 4; i++) { if (i >= nt) break; vec3 t = tubes[i]; float ax = radians(t.x), ay = radians(t.y) + lift;
            vec3 dir = vec3(sin(ax) * cos(ay), sin(ay), -cos(ax) * cos(ay)); float q = acos(clamp(dot(ray, dir), -1.0, 1.0)) / radians(t.z);
            if (q < e) { e = q; ctr = (dir.xy / max(-dir.z, 0.05)) / tanB * 0.5 + 0.5; } }
          vec4 c0 = texture2D(map, vUv);
          float inside = smoothstep(1.0, 0.988, e), rim = smoothstep(1.0, 1.07, e);
          vec3 plain = c0.rgb * rest * rim;
          if (inside <= 0.0) { gl_FragColor = sRGBTransferOETF(vec4(bpTone(plain), 1.0)); return; }
          vec2 uv = ctr + (vUv - ctr) * (1.0 - 0.035 * e * e); // (pincushioned toward the edge)
          vec2 hq = texture2D(heatMap, uv).rg; float dist = hq.g > 0.0 ? 1.0 / hq.g - 1.0 : 1e4; // (distance: 1 / (1 + d))
          float blur = smoothstep(0.45, 1.0, e) * 2.2 + clamp(1.35 / max(dist, 0.05) - 0.12, 0.0, 2.6);
          float avg = max(cath(textureLod(map, vec2(0.5), lod).rgb), 1e-6), gain = clamp(target / avg, gMin, gMax);
          float L = cath(textureLod(map, uv, blur).rgb) * gain;
          // halos: the blurred frame's over-bright part where it is, and on two rings round it (the soft ringing edge)
          float hc = max(0.0, cath(textureLod(map, uv, 4.5).rgb) * gain - 1.2), h1 = 0.0, h2 = 0.0;
          for (int j = 0; j < 12; j++) { float an = float(j) * 0.5236 + 0.26; vec2 o = vec2(cos(an), sin(an));
            h1 += max(0.0, cath(textureLod(map, uv + o * px * 24.0, 5.0).rgb) * gain - 1.5); h2 += max(0.0, cath(textureLod(map, uv + o * px * 44.0, 5.5).rgb) * gain - 1.5); }
          float ve = L + hc * 0.35 + h1 / 12.0 * 0.22 + h2 / 12.0 * 0.12, v = ve / (1.0 + ve); // (saturating softly: a bright screen or lamp keeps some of its detail)
          // scintillation: fresh every frame, more the darker it is and the fainter the spot; sparkles in the dark
          float dk = clamp(log(gain / gMin) / log(max(gMax / gMin, 1.01)), 0.0, 1.0);
          vec2 cell = floor(vUv * res / 1.5), fo = vec2(frame * 37.0, frame * 71.0);
          v *= 1.0 + (hash(cell + fo) - 0.5) * grain * (0.15 + 0.7 * dk) / (0.6 + 2.0 * sqrt(max(v, 0.0)));
          v += (hash(cell + fo + 513.0) - 0.5) * grain * 0.05 * dk;
          if (hash(cell + fo + 1029.0) > 1.0 - 0.0035 * dk * grain) v += 0.55;
          // the fibre-optic plate's honeycomb, fixed to the tube
          vec2 hp = (vUv - ctr) * res / 5.0; vec2 hr = vec2(1.0, 1.732), ha = mod(hp, hr) - hr * 0.5, hb = mod(hp - hr * 0.5, hr) - hr * 0.5;
          float hx = min(dot(ha, ha), dot(hb, hb)); v *= 1.0 - 0.06 * smoothstep(0.16, 0.25, hx);
          vec3 col = phos * max(v, 0.0);
          // the thermal channel: its edges, by how sharply the heat changes (a body against the cooler room behind it)
          if (thermal > 0.5) {
            float tl = heat(uv + vec2(-hpx.x, hpx.y)), tc = heat(uv + vec2(0.0, hpx.y)), tr = heat(uv + hpx), ml = heat(uv - vec2(hpx.x, 0.0)), mr = heat(uv + vec2(hpx.x, 0.0)), bl = heat(uv - hpx), bc = heat(uv - vec2(0.0, hpx.y)), br = heat(uv + vec2(hpx.x, -hpx.y));
            float gx = (tr + 2.0 * mr + br) - (tl + 2.0 * ml + bl), gy = (tl + 2.0 * tc + tr) - (bl + 2.0 * bc + br);
            float edge = smoothstep(0.35, 1.1, length(vec2(gx, gy))); // (a body against a room: about 3; a wall against the floor, a few tenths)
            col += vec3(1.0, 0.58, 0.16) * edge * 1.3;
          }
          col = mix(col, phos * 1.15 + 0.1, over);
          col *= smoothstep(0.75, 1.0, k) * mix(1.0, 0.62, smoothstep(0.5, 1.0, e)); // (on once it's down; dimmer toward the edge)
          // the phosphor's afterglow: the last frame lingering (its output, as it was shown)
          vec3 pv = pow(texture2D(prev, vUv).rgb, vec3(2.2));
          col = max(col, pv * persist * 0.85) * (1.0 - 0.18 * persist) + pv * 0.18 * persist;
          gl_FragColor = sRGBTransferOETF(vec4(bpTone(mix(plain, col, inside)), 1.0)); // (into a target: encoded here, copied to the screen as it is)
        }` });
  },
  // The heat (r) and distance (g: 1 / (1 + d), 0 far off) picture (for night vision's focus and thermal channel, and a
  // thermal sight's picture: js/viewmodel.ts), from cam into rt: everything solid drawn plain and cold (glass too: it's
  // opaque to heat; smoke, haze, glows, particles and beams left out: heat goes through them); then the warm things over it,
  // on HEAT_LAYER (js/rig.ts heatMark: a living body's warm, a dead one cooling), and the hot spots (the muzzle flashes and
  // fireballs this moment); then, with vm, the gun in your hands (near, at the room's temperature: but a reflex sight's window far, its dot
  // being at infinity, and a 1x scope's lens likewise)
  heatMats: null as null | { cold: THREE.ShaderMaterial; near: THREE.ShaderMaterial; far: THREE.ShaderMaterial; warm: THREE.ShaderMaterial[] },
  heatFx: null as null | { scene: THREE.Scene; spots: THREE.Mesh[] },
  // (heat < 0: the room's own temperature, as the cold things are: a little warmer facing up (the warm air under the ceiling,
  // the floor's own), a slow mottle over it, so a thermal picture has walls and floors to it)
  _heatMat(heat: number, d: number | null, opts: THREE.ShaderMaterialParameters = {}) {
    return new THREE.ShaderMaterial(Object.assign({ toneMapped: false, fog: false,
      vertexShader: `#include <batching_pars_vertex>
        varying float vD; varying vec3 vW; varying float vN; void main() { vec4 p = vec4(position, 1.0); vec3 n = normal;
        #include <batching_vertex>
        #ifdef USE_BATCHING
        p = batchingMatrix * p; n = mat3(batchingMatrix) * n;
        #endif
        #ifdef USE_INSTANCING
        p = instanceMatrix * p; n = mat3(instanceMatrix) * n;
        #endif
        vec4 wp = modelMatrix * p; vW = wp.xyz; vN = normalize(mat3(modelMatrix) * n).y; vD = distance(wp.xyz, cameraPosition); gl_Position = projectionMatrix * viewMatrix * wp; }`,
      fragmentShader: `varying float vD; varying vec3 vW; varying float vN; void main() {
        float h = ${heat < 0 ? '0.16 + 0.04 * vN + 0.02 * sin(vW.x * 1.7 + vW.y * 0.9) * sin(vW.z * 1.3 - vW.y * 0.7)' : heat.toFixed(3)};
        gl_FragColor = vec4(h, ${d == null ? '1.0 / (1.0 + vD)' : d === Infinity ? '0.0' : (1 / (1 + d)).toFixed(4)}, 0.0, 1.0); }` }, opts));
  },
  // A thermal sight's screen (js/viewmodel.ts thermalLens): the sensor's picture (map: _heatPass's heat, its pixels kept square,
  // nearest), the middle of it zoomed (digital zoom: coarser as it goes), levelled from the room's temperature to a body's, in a
  // palette (0 white-hot, 1 black-hot, 2 ironbow), a red cross with a gap and a dot, the readout over it (osd), a faint
  // scanline; and as far faded in as you're looking into it (live)
  thermalMaterial(osd: THREE.Texture) {
    return new THREE.ShaderMaterial({ toneMapped: false,
      uniforms: { map: { value: null }, osd: { value: osd }, live: { value: 0 }, eye: { value: new THREE.Vector2() }, pmil: { value: 1 }, zoom: { value: 1 }, pal: { value: 0 }, dim: { value: 1 } },
      vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: `uniform sampler2D map, osd; uniform float live, zoom, dim; uniform int pal; varying vec2 vUv;
        vec3 iron(float t) { return clamp(vec3(1.6 * t - 0.1, 2.2 * t * t - 0.25, 0.55 * sin(3.1416 * t * 1.25) + max(0.0, t - 0.85) * 4.0), 0.0, 1.0); }
        void main() {
          vec2 p = vUv * 2.0 - 1.0;
          float h = texture2D(map, 0.5 + (vUv - 0.5) / zoom).r, t = clamp((h - 0.06) / 0.7, 0.0, 1.0); // (the room a dark grey, a body full scale)
          t = pow(t, 0.75);
          vec3 c = pal == 1 ? vec3(1.0 - t) * 0.92 : pal == 2 ? iron(t) : vec3(t) * 0.95;
          c *= 0.94 + 0.06 * step(0.5, fract(vUv.y * 144.0));
          float ax = abs(p.x), ay = abs(p.y), w = 0.008;
          float cr = (ax < w && ay > 0.06 && ay < 0.5) || (ay < w && ax > 0.06 && ax < 0.5) || length(p) < 0.014 ? 1.0 : 0.0;
          c = mix(c, vec3(1.0, 0.16, 0.12), cr);
          vec4 o = texture2D(osd, vUv); c = mix(c, o.rgb, o.a);
          gl_FragColor = vec4(c * live * dim, 1.0); // (a screen: its own levels, as they are; dimmed for night vision)
        }` });
  },
  _heatPass(cam: THREE.Camera, rt: THREE.WebGLRenderTarget, vm: boolean) {
    const r = this.renderer, sc = this.scene, bg = sc.background, hid: THREE.Object3D[] = [];
    const H = this.heatMats || (this.heatMats = { cold: this._heatMat(-1, null), near: this._heatMat(-1, this.NV_VM_D), far: this._heatMat(-1, Infinity, { depthTest: false, depthWrite: false, side: THREE.DoubleSide }), warm: Array.from({ length: 11 }, (_, i) => this._heatMat(i / 10, null)) });
    const cc = r.getClearColor(new THREE.Color()), ca = r.getClearAlpha();
    r.setRenderTarget(rt); r.setClearColor(0x000000, 1); r.clear();
    sc.background = null;
    sc.traverseVisible((o: any) => {
      const ms = o.material ? ([] as any[]).concat(o.material) : [];
      if (o.isPoints || o.isLine || o.isSprite || ms.some((m) => (m.transparent && !m.isMeshStandardMaterial) || m.blending === THREE.AdditiveBlending || m.colorWrite === false)) hid.push(o);
    });
    for (const o of hid) o.visible = false;
    sc.overrideMaterial = H.cold; r.render(sc, cam); sc.overrideMaterial = null;
    // the warm: each body's meshes on the heat layer drawn in its warmth (a living body 1, a dead one cooling to the room's over minutes)
    const swapped: [THREE.Mesh, THREE.Material | THREE.Material[]][] = [];
    for (const rig of G.Rig.live) {
      if (rig.cold || !rig.root.visible) continue;
      const w = rig.state === 'dead' ? Math.max(0.35, 1 - (rig.deadT || 0) / 420) : 1, mat = H.warm[Math.round(w * 10)];
      rig.root.traverse((o: any) => { if (o.isMesh && o.layers.isEnabled(this.HEAT_LAYER)) { swapped.push([o, o.material]); o.material = mat; } });
    }
    const L0 = cam.layers.mask;
    cam.layers.set(this.HEAT_LAYER); r.render(sc, cam); cam.layers.mask = L0;
    for (const [o, m] of swapped) o.material = m;
    for (const o of hid) o.visible = true;
    sc.background = bg;
    // the hot spots: a muzzle flash's (the gas, the muzzle a moment), a fireball's
    if (!this.heatFx) { const s = new THREE.Scene(), spots = Array.from({ length: 6 }, () => { const m = new THREE.Mesh(new THREE.SphereGeometry(1, 10, 8), this._heatMat(1, null)); s.add(m); return m; }); this.heatFx = { scene: s, spots }; }
    let n = 0;
    for (const l of [...this.muzzleLights, ...this.blastLights]) { if (!(l.intensity > 0) || n >= this.heatFx.spots.length) continue; const m = this.heatFx.spots[n++]; m.visible = true; m.position.copy(l.position); m.scale.setScalar(this.blastLights.includes(l) ? 0.6 + l.intensity * 0.25 : 0.1); }
    for (let i = n; i < this.heatFx.spots.length; i++) this.heatFx.spots[i].visible = false;
    if (n) r.render(this.heatFx.scene, cam);
    if (vm) {
      r.clearDepth();
      const pip = this.vm && this.vm.userData.pip, vsw: [THREE.Mesh, THREE.Material | THREE.Material[]][] = [], vh: THREE.Object3D[] = [];
      this.vmRoot.traverseVisible((o: any) => {
        if (!o.isMesh) { if (o.isSprite || o.isPoints || o.isLine) vh.push(o); return; }
        const m = o.material;
        if (pip && o === pip.disk) { vsw.push([o, m]); o.material = pip.mag <= 1.05 || pip.thermal ? H.far : H.near; return; } // (a 1x scope, and a thermal sight's screen, in focus; magnified glass not)
        if (m.colorWrite === false && m.stencilWrite) { vsw.push([o, m]); o.material = H.far; return; } // (a reflex sight's window)
        if (m.stencilWrite || m.transparent || m.blending === THREE.AdditiveBlending) { vh.push(o); return; } // (its reticle, a flash, glass)
        vsw.push([o, m]); o.material = H.near;
      });
      for (const o of vh) o.visible = false;
      r.render(this.vmScene, cam);
      for (const o of vh) o.visible = true;
      for (const [o, m] of vsw) o.material = m;
    }
    r.setClearColor(cc, ca);
  },
  // the night vision's picture (see above), into the next of the two out targets, then onto the screen
  nvOut: null as null | THREE.WebGLRenderTarget[], nvFrame: 0, nvHeat: undefined as THREE.WebGLRenderTarget | undefined, nvCopy: undefined as THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial> | undefined,
  _nvComposite() {
    const r = this.renderer, nv = this.nv!, sp = nv.spec, rt = this.nvRT!, W = rt.width, Hh = rt.height;
    if (!this.nvQuad) { this.nvQuad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.nvMaterial()); this.nvQuad.frustumCulled = false; this.nvScene = new THREE.Scene(); this.nvScene.add(this.nvQuad); if (!this.fishCam) this.fishCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1); }
    if (!this.nvOut || this.nvOut[0].width !== W || this.nvOut[0].height !== Hh) {
      if (this.nvOut) for (const t of this.nvOut) t.dispose();
      this.nvOut = [0, 1].map(() => new THREE.WebGLRenderTarget(W, Hh, { depthBuffer: false }));
    }
    const out = this.nvOut[this.nvFrame & 1], prev = this.nvOut[(this.nvFrame + 1) & 1];
    const u = this.nvQuad.material.uniforms, tv = Math.tan(THREE.MathUtils.degToRad(nv.fov) / 2), asp = W / Hh;
    u.map.value = rt.texture; u.heatMap.value = this.nvHeat!.texture; u.prev.value = prev.texture; u.lod.value = Math.ceil(Math.log2(Math.max(W, Hh)));
    u.tanB.value.set(tv * asp, tv); u.px.value.set(1 / W, 1 / Hh); u.hpx.value.set(1 / this.nvHeat!.width, 1 / this.nvHeat!.height); u.res.value.set(W, Hh);
    sp.tubes.forEach((t, i) => this._nvTubes[i].set(t[0], t[1], t[2])); u.nt.value = sp.tubes.length;
    u.phos.value.set(sp.phos[0], sp.phos[1], sp.phos[2]); u.gMax.value = sp.gain; u.grain.value = sp.grain; u.rest.value = sp.rest; u.thermal.value = sp.thermal ? 1 : 0;
    u.k.value = nv.k; u.over.value = this.nvOver; u.frame.value = this.nvFrame % 997; u.persist.value = this.nvFrame > 1 ? (sp.persist || 0.5) : 0;
    r.setRenderTarget(out); r.clear(); r.render(this.nvScene!, this.fishCam!);
    if (!this.nvCopy) { this.nvCopy = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.ShaderMaterial({ depthTest: false, depthWrite: false, toneMapped: false, uniforms: { map: { value: null } }, vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }', fragmentShader: 'uniform sampler2D map; varying vec2 vUv; void main() { gl_FragColor = texture2D(map, vUv); }' })); this.nvCopy.frustumCulled = false; }
    this.nvCopy.material.uniforms.map.value = out.texture;
    this.nvQuad.visible = false; this.nvScene!.add(this.nvCopy);
    r.setRenderTarget(null); r.clear(); r.render(this.nvScene!, this.fishCam!);
    this.nvScene!.remove(this.nvCopy); this.nvQuad.visible = true;
    this.nvFrame++;
  },
  // ------------------------------------------------------------ picture-in-picture scopes
  pipTexture() {
    if (!this.pipRT) this.pipRT = this.viewRT(512, 512, { samples: 4 });
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
    if (pip.thermal) { // a thermal sight: its sensor's picture of heat, at its widest (the zoom's the screen's: thermalMaterial), 30 times a second (a frame behind: the lag of its processing)
      if (!pip.heatRT) { pip.heatRT = new THREE.WebGLRenderTarget(288, 288, { type: THREE.HalfFloatType, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter }); pip.mat.uniforms.map.value = pip.heatRT.texture; }
      pip.mat.uniforms.live.value = THREE.MathUtils.smoothstep(this.pipLive || 0, 0.35, 0.8);
      pip.mat.uniforms.dim.value = this.nv && this.nv.k > 0.5 ? this.NV_DIM * 0.25 : 1; // (its night-vision mode: the screen turned right down, so it doesn't bloom the tubes)
      if (this.frameNo & 1) return;
      sc.fov = THREE.MathUtils.radToDeg(2 * Math.atan(pip.r / d)) / pip.mag0; sc.far = this.scopeReach(pip.mag0).far; sc.updateProjectionMatrix();
      this._heatPass(sc, pip.heatRT, false);
      this.renderer.setRenderTarget(null);
      return;
    }
    sc.fov = THREE.MathUtils.radToDeg(2 * Math.atan(pip.r / d)) / pip.mag;
    const reach = this.scopeReach(pip.mag);
    sc.far = reach.far;
    sc.updateProjectionMatrix();
    pip.mat.uniforms.pmil.value = (0.001 / Math.tan(THREE.MathUtils.degToRad(sc.fov) / 2)) * (pip.fp === 'sfp' ? pip.fpMag / pip.mag : 1); // (a mil's share of the lens's radius, at this power; a second focal plane's marks are true at one power only, and a mil is that much wider at any other)
    const eye = pip.disk.worldToLocal(cam.position.clone());
    pip.mat.uniforms.eye.value.set((eye.x / pip.r) * 0.8, (eye.y / pip.r) * 0.8);
    const r = this.renderer;
    r.setRenderTarget(this.pipRT!);
    r.clear();
    const fog = this.scene.fog as THREE.Fog | null, n0 = fog ? fog.near : 0, f0 = fog ? fog.far : 0;
    if (fog && reach.k > 1) { fog.near = n0 * reach.k; fog.far = f0 * reach.k; } // (the haze in the scope picture thins out: the same air, but it takes the power's worth of distance to see as little)
    r.render(this.scene, sc);
    if (fog) { fog.near = n0; fog.far = f0; }
    r.setRenderTarget(null);
  },
  // How far a scope of this power sees: a magnified one reaches out to 600 m (the main view's far plane is 280 m, or
  // the level's own), and its picture's fog is stretched by the power (k) so it still thickens with distance, without
  // the wall at 60 m; never stretched past the far plane, so there's no edge to pop at.
  scopeReach(mag: number) {
    const cam = this.camera, fog = this.scene.fog as THREE.Fog | null;
    if (!(mag > 1)) return { k: 1, far: cam.far };
    const far = Math.max(cam.far, SCOPE_FAR), f = fog && fog.far < 1e4 ? fog.far : 0;
    return { k: f ? Math.min(mag, Math.max(1, far / f)) : 1, far };
  },
  // ------------------------------------------------------------ shaders, built ahead (under the loading screen)
  // three.js builds a shader program the first time it draws a kind of surface in a kind of place: a material's type with
  // its maps, its sides, instanced or not, and the place's lights, fog and what it's drawn into (the screen, the scope's
  // picture, a shadow map, the hangar's TVs). Building one stalls the page 0.1 to 0.2 s here (longer on some machines): the
  // first chip off a wall, the first gun picked up, the first look through a scope, the first suspect down... But nothing in
  // a level is truly random: whatever can turn up is one of a known set (the catalogue's gun materials, the bodies and their
  // kit, the effects' pools). So once a level's built and populated, all of it is built up front, under the veil:
  //   - the scene as it stands, every hidden thing (the pooled effects, the viewmodel's flash) shown for a moment, with
  //     samples of what's made later (warmKit: every catalogue material and a sticker, every kind of body in every piece of
  //     kit with a gun, a scope's lens, a reflex sight's reticle, the outlines; and, made for the level and not kept, cases,
  //     a dropped magazine and box, a loot box, a wall spatter, a hole's lining)
  //   - in every place it's drawn: the screen, the gun in your hands' own scene, the scope's picture, the fisheye's pass,
  //     and in the hangar the TVs' sets (js/highlights.ts warm)
  //   - then a few real frames with nothing culled, for what only drawing builds: the weapon lights' shadow maps (their
  //     depth shaders, one for each kind of thing that casts) and the evidence outlines' passes.
  // The programs go to the graphics driver all at once and it builds them side by side (three's compile asks for them and
  // looks at none till it's first used; each program's isReady() asks KHR_parallel_shader_compile without waiting, as
  // compileAsync does: waited on frame by frame, so the veil keeps moving: warmStep), and they're kept for good (pinned), so
  // the next level, or the hangar, finds most of them built. The light counts every program is built for never change:
  // every dynamic light is one of a fixed pool, always in the scene, dark when it's not in use (muzzleLights, blastLights,
  // spots; vmMuzzle, vmPts, vmSpots in the gun's scene).
  _kit: null as null | { world: THREE.Group; vm: THREE.Group; vmClip: THREE.Group },
  _warm: null as null | RWarm,
  _pinned: new Set<any>(),
  warmStats: null as null | { programs: number; ms: number; waitMs: number; frames: number },
  warmKit() {
    if (this._kit) return this._kit;
    const T = THREE, geo = new T.BoxGeometry(0.02, 0.02, 0.02), world = new T.Group(), vm = new T.Group(), vmClip = new T.Group();
    const M = G.GunMaterials.M as Record<string, () => THREE.Material>, tex = this.flashTexture();
    // every gun's surfaces: the catalogue's materials (a baked gun only names them: js/gunmaterials.ts), and a sticker on one
    // (js/stickers.ts), in the world and in your hands
    const sticker = new T.MeshStandardMaterial({ map: tex, transparent: true, alphaTest: 0.03, depthWrite: false, roughness: 0.45, metalness: 0, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 });
    for (const g of [world, vm]) { for (const k of Object.keys(M)) g.add(new T.Mesh(geo, M[k]())); g.add(new T.Mesh(geo, sticker)); }
    // (and a stock in your hands, cut off where it would be in your eye: its materials' own copies, with a clipping plane: clearStockNearEye)
    const plane = new T.Plane(new T.Vector3(0, 0, -1), 0);
    for (const k of Object.keys(M)) { const c = M[k]().clone(); c.clippingPlanes = [plane]; vmClip.add(new T.Mesh(geo, c)); }
    // the gun in your hands' own pieces (js/viewmodel.ts): a reflex sight's window and reticle, a scope's lens, a muzzle
    // flash, a display surface, a fire-mode dial's marker
    try {
      const V = G.Viewmodel, g = new T.Group();
      V.reflex(g, { f: 0.1, y: 0, w: 0.02, h: 0.02, kind: 'dot' });
      V.pipLens(g, { f: 0.1, y: 0, r: 0.02 }, { reticle: 'cross' });
      g.add(V.flash(0xffc070));
      const d = new T.Mesh(new T.PlaneGeometry(0.02, 0.01), M.black()); d.name = 'display_warm'; d.userData.display = { width: 8, height: 4 }; g.add(d); V.surfaces(g);
      g.add(new T.Mesh(geo, new T.MeshBasicMaterial({ color: 0xffd36a })));
      vm.add(g);
    } catch (e) { console.warn('warm kit', e); }
    // every kind of body: officers in every piece of kit and every look (their patches, their callsigns on their backs),
    // with a gun; every kind of suspect, a few of each (what they wear is picked by their seed), in the armour they come
    // in; civilians
    try {
      const R = G.Rig, byKind: Record<string, string[]> = {};
      for (const d of Object.values(G.Gear.DEFS) as any[]) (byKind[d.kind] || (byKind[d.kind] = [])).push(d.id);
      const looks = R.LOOKS as Record<string, string[]>, of = (k: string, i: number) => { const a = byKind[k] || []; return a.length ? a[i % a.length] : 0; };
      const n = Math.max(...['helmet', 'face', 'carrier', 'plate', 'shoulder', 'groin', 'belt', 'legs', 'pack'].map((k) => (byKind[k] || []).length), ...Object.values(looks).map((v) => v.length));
      const animals = G.Callsigns.LIST as { id: string }[];
      for (let i = 0; i < n; i++) {
        const look: Record<string, string> = {};
        for (const [k, v] of Object.entries(looks)) look[k] = v[i % v.length];
        const rig = G.Views.newPlayerRig({ color: [0x4080ff, 0xff5040, 0x40d060, 0xffc030][i % 4], animal: animals[i % animals.length].id, name: 'Warm', look }, 'warm' + i);
        rig.setKit({ helmet: of('helmet', i), face: of('face', i), carrier: of('carrier', i), plate: of('plate', i) ? 1 : 0, sh: of('shoulder', i), gr: of('groin', i), cp: 4, belt: of('belt', i), lg: of('legs', i), bp: 2, pack: of('pack', i), ifak: of('ifak', i) });
        rig.setGun('m4');
        rig.root.removeFromParent(); rig.root.visible = true; world.add(rig.root);
      }
      const vests = ['soft2', 'soft', 'steel', 'ceramic', 'assault', ''], helms = ['ach', 'riflehelm', 'visor', ''];
      Object.values(G.ENEMIES as Record<string, any>).forEach((def, j) => {
        for (let s = 0; s < 3; s++) {
          const rig = R.create({ style: def.style, scale: def.scale, boss: !!def.boss, leader: !!def.leader, seed: j * 7919 + s * 131 + 13, dressed: true });
          if (!def.civ) rig.setKit(R.armourKit(vests[(j + s) % vests.length], helms[(j + s) % helms.length], def.style === 'armored', s % 2, []));
          if (def.wpn) rig.setGun(def.wpn);
          world.add(rig.root);
        }
      });
    } catch (e) { console.warn('warm kit', e); }
    // what's drawn over the evidence and what F would take (js/views.ts outlineMats: layer 2), and a few plain kinds the
    // replays' and the reports' sets use (ghosts, rings, guides, sprites, particles)
    try {
      for (const blue of [false, true]) { const o = G.Views.outlineMats(blue); for (const m of [o.silhouette, ...o.bands]) { const x = new T.Mesh(geo, m); x.layers.set(2); world.add(x); } }
    } catch (e) { console.warn('warm kit', e); }
    const pts = new T.BufferGeometry(); pts.setAttribute('position', new T.Float32BufferAttribute([0, 0, 0, 0.01, 0, 0], 3)); pts.setAttribute('color', new T.Float32BufferAttribute([1, 1, 1, 1, 1, 1], 3));
    // (and the marks a round leaves, as the replays put them back: js/scars.ts, js/damage.ts)
    for (const m of [new T.MeshStandardMaterial({ vertexColors: true, side: T.DoubleSide }), new T.MeshLambertMaterial({ vertexColors: true, side: T.DoubleSide }), new T.MeshLambertMaterial({ map: tex, transparent: true, depthWrite: false }), new T.MeshStandardMaterial({ map: tex, transparent: true, depthWrite: false })]) world.add(new T.Mesh(geo, m));
    for (const m of [new T.MeshBasicMaterial({ transparent: true, blending: T.AdditiveBlending, depthWrite: false }), new T.MeshBasicMaterial({ transparent: true, side: T.DoubleSide }), new T.MeshBasicMaterial({ map: tex, transparent: true }), new T.MeshBasicMaterial({ map: tex, transparent: true, side: T.BackSide })]) world.add(new T.Mesh(geo, m));
    world.add(new T.Sprite(new T.SpriteMaterial({ map: tex, transparent: true, depthWrite: false })));
    world.add(new T.Points(pts, new T.PointsMaterial({ map: tex, transparent: true, depthWrite: false })), new T.Points(pts, new T.PointsMaterial({ vertexColors: true, transparent: true, depthWrite: false })));
    world.add(new T.Line(pts, new T.LineBasicMaterial({ transparent: true })), new T.LineSegments(pts, new T.LineBasicMaterial({ vertexColors: true })));
    return (this._kit = { world, vm, vmClip });
  },
  // Starts building the shaders (above); done() once they're all built and the level can be shown (js/views.ts applySnap).
  // The work is done a frame at a time by warmStep, from the game's loop.
  warmup(done?: () => void) {
    const r = this.renderer;
    if (!r || !this.scene || !this.camera) { if (done) done(); return; }
    if (this._warm) this._warmEnd(); // (one still going: put the scene back as it was first)
    const W: RWarm = (this._warm = { t0: performance.now(), tWait: 0, done: done || null, tasks: [], stage: 0, frames: 0, undo: [], had: new Set(r.info.programs || []) });
    const extras: THREE.Object3D[] = [];
    const put = (m: THREE.Object3D | null | undefined) => { if (m) { m.position.set(0, -50, 0); this.dynRoot.add(m); extras.push(m); } };
    try {
      if (G.Casings.warm) for (const m of G.Casings.warm()) put(m);
      if (G.Loot.meshFor) { put(G.Loot.meshFor(G.Gear.pack(G.Gear.medItem('bandage')))); }
      put(new THREE.Mesh(new THREE.PlaneGeometry(1, 1), this.bloodMats.spatter));
      if (G.Game.map) for (const m of G.Damage.warm(G.Game.map as unknown as Parameters<typeof G.Damage.warm>[0])) put(m);
      this.debrisFx(); this.fishSetup(); this.pipTexture();
      if (!this._arc) this.throwArc([], false); // (a throw's arc: its dots and the ring where it lands)
      r.localClippingEnabled = true; // (as it is once there's a gun in your hands: clearStockNearEye)
    } catch (e) { console.warn('warmup', e); }
    const kit = this.warmKit();
    kit.world.position.set(0, -50, 0); this.dynRoot.add(kit.world);
    kit.vm.position.set(0, 0, -0.6); this.vmHolder.add(kit.vm);
    // everything shown, and nothing culled (the real frames at the end draw all of it, into the shadow maps too)
    const hidden: THREE.Object3D[] = [], culled: THREE.Object3D[] = [];
    for (const sc of [this.scene, this.vmScene]) sc.traverse((o: THREE.Object3D) => { if (!o.visible) { o.visible = true; hidden.push(o); } if (o.frustumCulled) { o.frustumCulled = false; culled.push(o); } });
    W.undo.push(() => {
      for (const o of hidden) o.visible = false;
      for (const o of culled) o.frustumCulled = true;
      kit.world.removeFromParent(); kit.vm.removeFromParent();
      for (const m of extras) { m.removeFromParent(); m.traverse((o: any) => { if (o.geometry) o.geometry.dispose(); }); }
    });
    // each place things are drawn, one compile a task: (scene, camera, what it's drawn into, the layer a pass draws and the
    // material it draws everything in, if it's such a pass)
    // (away: another scene the world's samples are drawn in, the TVs' sets: they go there for it)
    // (a plain place is compiled a piece at a time, each with the whole scene's lights and fog (compile's target scene), so no
    // frame takes more than a few dozen programs: the scene's children, a big one's children, and theirs. A piece holds no
    // light: compile counts a piece's lights on top of its target scene's, and would build for the wrong number)
    const lit = (o: THREE.Object3D) => { let f = false; o.traverse((x) => { if ((x as THREE.Light).isLight) f = true; }); return f; };
    const compile = (scene: THREE.Scene, cam: THREE.Camera, target: THREE.WebGLRenderTarget | null, layer?: number, over?: THREE.Material, away = false) => {
      if (layer == null && !away) {
        const bare = new Set<THREE.Object3D>(); // (compiled without its children, which are pieces of their own)
        const split = (o: THREE.Object3D, d: number): THREE.Object3D[] => {
          if ((o as THREE.Light).isLight) return [];
          if (!lit(o) && (o.children.length <= 8 || d >= 3)) return [o];
          bare.add(o); return [o, ...o.children.flatMap((c) => split(c, d + 1))];
        };
        const pieces = scene.children.flatMap((c) => split(c, 0));
        for (const c of pieces) W.tasks.push(() => {
          const kids = bare.has(c) ? c.children.splice(0) : null;
          try { r.setRenderTarget(target); r.compile(c, cam, scene); } catch (e) { console.warn('warmup', e); }
          if (kids) c.children.push(...kids);
          r.setRenderTarget(null);
        });
        return;
      }
      W.tasks.push(() => {
        if (away) scene.add(kit.world);
        const swapped: [any, THREE.Material][] = [];
        if (layer != null) {
          kit.world.traverse((o) => o.layers.enable(layer));
          cam.layers.set(layer);
          if (over) scene.traverse((o: any) => { if (o.material && o.layers.test(cam.layers)) { swapped.push([o, o.material]); o.material = over; } });
        }
        // (into a target: three builds what's drawn into one for it, from the target that's set. compile, not compileAsync: that
        // asks after the programs straight away, and on ANGLE the question waits for the driver to have translated every shader
        // just handed over, a 0.2-0.6 s stall a task; the asking's done below, a frame at a time, once they're all handed over)
        try { r.setRenderTarget(target); r.compile(scene, cam); } catch (e) { console.warn('warmup', e); }
        r.setRenderTarget(null);
        for (const [o, m] of swapped) o.material = m;
        if (layer != null) { cam.layers.set(0); kit.world.traverse((o) => o.layers.disable(layer)); }
        if (away) this.dynRoot.add(kit.world);
      });
    };
    compile(this.scene, this.camera, null);
    compile(this.vmScene, this.camera, null);
    // (the stocks: in a scene of their own with the same lights as the gun's, so only they are built cut)
    const vmClip = new THREE.Scene(); vmClip.environment = this.vmScene.environment; vmClip.add(kit.vmClip);
    this.vmScene.traverse((l: any) => { if (l.isLight) vmClip.add(l.isSpotLight ? new THREE.SpotLight() : l.isPointLight ? new THREE.PointLight() : l.isDirectionalLight ? new THREE.DirectionalLight() : l.isHemisphereLight ? new THREE.HemisphereLight() : new THREE.AmbientLight()); });
    compile(vmClip, this.camera, null);
    // (anything drawn into a texture is a different shader from the same thing on the screen: the scope's picture, for all
    // of the scene's materials, whatever gun you've got now, since you can pick one up; the fisheye's is the same)
    compile(this.scene, this.camera, this.pipRT!);
    compile(this.fishScene!, this.fishCam!, null);
    if (G.Highlights && G.Highlights.warm) G.Highlights.warm((scene, cam, target, layer, over) => compile(scene, cam, target, layer, over, true));
    G.Game.veilSay('Compiling shaders');
  },
  // A frame of the warmup (from the game's loop): true while it's going, and nothing should be drawn. The compiles, as many
  // as fit in a frame; then waiting for the driver to finish them; then the real frames, and the scene put back.
  warmStep() {
    const W = this._warm;
    if (!W) return false;
    const r = this.renderer;
    W.frames++;
    if (W.stage === 0) {
      const t = performance.now();
      while (W.tasks.length && performance.now() - t < 12) W.tasks.shift()!();
      if (!W.tasks.length) { W.stage = 1; W.tWait = performance.now(); }
      return true;
    }
    if (W.stage === 1) {
      // (every program built since it began, a material's for the scope's picture or the TVs' as well as its last one, which
      // is all compileAsync would wait for: so the first frame that draws one doesn't stand and wait)
      const progs = ((r.info.programs || []) as any[]).filter((p) => !W.had.has(p)), left = progs.filter((p) => !p.isReady()).length;
      if (left && performance.now() - W.tWait < 20000) { G.Game.veilSay(`Compiling shaders ${progs.length - left} / ${progs.length}`); return true; }
      // (built: then what three asks of a program the first time it's used, whether it linked and where its inputs are, a
      // few dozen calls that each wait on the driver: asked here, 50 ms of them a frame, not in the first frame that
      // looks through a scope)
      const t = performance.now();
      W.ask = W.ask || progs;
      while (W.ask.length && performance.now() - t < 50) { const p = W.ask.pop(); p.getUniforms(); p.getAttributes(); }
      if (W.ask.length) return true;
      W.stage = 2;
      W.waitMs = performance.now() - W.tWait;
      return true;
    }
    // the real frames: a weapon light's shadow map drawn (nothing culled: every kind of thing that casts), with the
    // outlines' passes and without (the depth shaders are built for the light counts the scene's last pass left)
    const glow = this.hasGlow, s0 = this.spots[0];
    try { for (const g of [true, false, false]) { s0.shadow.needsUpdate = true; this.hasGlow = g; this.render(); } } catch (e) { console.warn('warmup', e); }
    this.hasGlow = glow; s0.shadow.needsUpdate = false;
    this._warmEnd();
    return true;
  },
  _warmEnd() {
    const W = this._warm, r = this.renderer;
    if (!W) return;
    this._warm = null;
    for (const f of W.undo) f();
    // (kept for good: three.js lets a program go when the last material using it does, and the next level would build it again)
    let n = 0;
    for (const p of (r.info.programs || []) as any[]) if (!this._pinned.has(p)) { this._pinned.add(p); p.usedTimes++; n++; }
    this.warmStats = { programs: n, ms: performance.now() - W.t0, waitMs: W.waitMs || 0, frames: W.frames };
    if (W.done) W.done();
  },
  // the fisheye's pass (the death camera): the picture through a barrel distortion, onto the screen (made once: the first
  // time it's needed, or the shaders are compiled)
  fishSetup() {
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
    return this.fishQuad;
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
    // night vision down (or on its way): the frame goes into a texture for its pass (nvMaterial), the goggles' IR illuminator on
    // in it if it's switched on (js/lightgrid.ts: from before the scope's picture is drawn, which is seen through them too)
    const dbs = r.getDrawingBufferSize(this._fsz || (this._fsz = new THREE.Vector2())), nv = this.nv && this.nv.k > 0.01 && G.Game && G.Game.phase === 'level' && dbs.x >= 16 && dbs.y >= 16 ? this.nv : null, // (not into a window that isn't shown: nothing to draw into)
      LU = G.LightGrid.U;
    if (nv) {
      const cp = this.camera.position, fw = this._eyeD.set(0, 0, -1).applyQuaternion(this.camera.quaternion);
      LU.lgNv.value.set(cp.x, cp.y, cp.z, nv.ir ? nv.spec.ir * THREE.MathUtils.smoothstep(nv.k, 0.75, 1) : 0); LU.lgNvD.value.set(fw.x, fw.y, fw.z, Math.cos(0.5));
      const sz = r.getDrawingBufferSize(this._fsz || (this._fsz = new THREE.Vector2()));
      if (!this.nvRT || this.nvRT.width !== sz.x || this.nvRT.height !== sz.y) {
        if (this.nvRT) this.nvRT.dispose();
        if (this.nvHeat) this.nvHeat.dispose();
        this.nvRT = new THREE.WebGLRenderTarget(sz.x, sz.y, { samples: 4, stencilBuffer: true, type: THREE.HalfFloatType, minFilter: THREE.LinearMipmapLinearFilter, generateMipmaps: true }); // (half float: the faint light of a dark room kept, to be amplified)
        this.nvHeat = new THREE.WebGLRenderTarget(Math.ceil(sz.x / 2), Math.ceil(sz.y / 2), { type: THREE.HalfFloatType });
        this.nvFrame = 0;
      }
      this.nvRT.texture.generateMipmaps = false; // (made once, after the last of the frame's drawn into it)
    } else this.nvFrame = 0;
    // the scope picture: only rendered while you're bringing the gun up or looking through it
    const pip = this.vm && this.vm.visible && this.vm.userData.pip, live = this.pipLive || 0;
    if (pip) {
      pip.mat.uniforms.live.value = THREE.MathUtils.smoothstep(live, 0.35, 0.8);
      if (live > 0.35) this._renderPip(pip);
    }
    // a fisheye (the death camera): the scene goes into a texture, then to the screen through a barrel distortion
    this.fk = (this.fk || 0) + ((this.fisheye && G.Game && G.Game.phase === 'level' ? 1 : 0) - (this.fk || 0)) * 0.12;
    const fish = this.fk > 0.01 && !nv;
    if (fish) {
      const sz = r.getDrawingBufferSize(this._fsz || (this._fsz = new THREE.Vector2()));
      if (!this.fishRT || this.fishRT.width !== sz.x || this.fishRT.height !== sz.y) {
        if (this.fishRT) this.fishRT.dispose();
        this.fishRT = new THREE.WebGLRenderTarget(sz.x, sz.y, { samples: 4, stencilBuffer: true, type: THREE.HalfFloatType }); // (half float: the over-bright survives, to be rolled off below)
      }
      r.setRenderTarget(this.fishRT);
    }
    if (nv) r.setRenderTarget(this.nvRT!);
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
      const u = this.fishSetup().material.uniforms;
      u.map.value = this.fishRT!.texture; u.k.value = 0.3 * this.fk!; u.ax.value = this.fishRT!.width / this.fishRT!.height;
      r.clear();
      r.render(this.fishScene!, this.fishCam!);
    }
    r.clearDepth();
    r.clearStencil(); // reflex sight windows mark the stencil for their reticles
    // the gun's own light, as much as there is where you stand (eyeLight): its lights and what its metal reflects
    // (what its metal reflects: three takes the scene's figure for a material lit by the scene's environment, not the material's own)
    const ek = this.eyeLight();
    for (const [l, k] of this.vmLights) l.intensity = k * ek;
    this.vmScene.environmentIntensity = ek;
    if (nv) this.nvRT!.texture.generateMipmaps = true;
    r.render(this.vmScene, this.camera);
    if (nv) { LU.lgNv.value.w = 0; this._heatPass(this.camera, this.nvHeat!, true); this._nvComposite(); }
    G.LightGrid.on(false);
    r.info.autoReset = true;
  },
};
G.R = G_R;
interface GameModules { R: typeof G_R; }
