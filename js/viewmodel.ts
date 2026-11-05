'use strict';
// First-person extras and the third-person model, applied to a gun MODEL (a group of slot-tagged meshes, `part_<key>` nodes and
// `info`: docs/models.md), not to the recipes' internals. The recipes (js/gunmodels.ts) or a .glb (js/glb.ts) make the geometry;
// js/gunrig.ts binds its animation; this file adds what only the first person (or only the far-off view) needs:
//
//   G.Viewmodel.assemble(def, models)   the first-person gun: each model (a { group, info } with its sight windows) in a holder with
//                                       its muzzle flashes, a reflex sight's reticle, a scope's lens, its display surfaces; the
//                                       arms and animation bound on top (G.GunRig.bind via js/vmanim.ts prepare)
//   G.Viewmodel.reflex(group, o)        a reflex sight's collimated reticle behind its window (o: info.reflex)
//   G.Viewmodel.pipLens(group, o, def)  a scope's picture-in-picture lens (o: info.pip)
//   G.Viewmodel.flash(color)            a muzzle flash sprite
//   G.Viewmodel.surfaces(group)         the model's display_<name> meshes, each given a CanvasTexture to paint: { name: { mesh, canvas, ctx, tex, width, height } }
//   G.Viewmodel.worldProto(group, info) the third-person model of a gun: its meshes merged one per material, the magazine, a
//                                       crossbow's bolt and strings and a bipod's legs pulled out on their own (cache it)
//   G.Viewmodel.worldInstance(proto)    a group of it, sharing the proto's geometry
//
// The sight windows (info.reflex, info.pip) and the display surfaces are in the model contract (docs/models.md); a recipe's model
// gives its windows to assemble alongside, as the kit recorded them.
/** A reflex sight's window, in the gun's frame (metres; f: forward, y: up): the stencil mask's size and the reticle kind drawn in it. */
interface VmReflex { f: number; y: number; w: number; h: number; round?: boolean; kind: string }
/** A scope's ocular lens (the picture-in-picture one): r its radius. parent/pos: a lens that swings on a hinge (a magnifier's): the hinge's node (or its name) and the lens's place in it. */
interface VmPip { f: number; y: number; r: number; parent?: THREE.Object3D | string; pos?: THREE.Vector3 | number[] }
/** What a gun model gives the first person to put on it: its geometry, its anchors, its sight windows. */
interface VmModel { group: THREE.Object3D; info: GunRigInfo & { muzzles: number[][]; sy: number; fSight: number; relief: number; cheek?: number | null; pistol?: boolean | null; reflex?: VmReflex | null; pip?: VmPip | null }; reflex?: VmReflex | null; pip?: VmPip | null }
/** A display surface (display_<name>): the canvas the game draws on and the texture that shows it on the mesh. Draw, then set tex.needsUpdate. */
interface VmSurface { mesh: THREE.Mesh; canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D; tex: THREE.CanvasTexture; width: number; height: number }
const G_Viewmodel = (() => {
  const T = THREE;

  // ---------------------------------------------------------------- muzzle flash sprite
  function flash(color: number) {
    const m = new T.Mesh(new T.PlaneGeometry(0.2, 0.2), new T.MeshBasicMaterial({ map: G.R.flashTexture(), transparent: true, blending: T.AdditiveBlending, depthWrite: false, color }));
    m.visible = false;
    return m;
  }

  // ---------------------------------------------------------------- reflex reticles
  // A reflex sight's reticle is collimated: it sits at infinity along the sight's axis, so it points where the
  // gun points, not where the glass is, and you only see it through the window. It's drawn as a glowing plane
  // a few metres down the axis, masked by the stencil to the sight's window (the window mesh writes 1; hands
  // or the housing in front of the window keep it at 0).
  const RETICLE_D = 6;
  const texCache: Record<string, THREE.CanvasTexture> = {};
  function reticleTex(kind: string) {
    if (texCache[kind]) return texCache[kind];
    const N = kind === 'holo' || kind === 'cdot' ? 256 : 128, c = document.createElement('canvas');
    c.width = c.height = N;
    const g = c.getContext('2d')!, m = N / 2;
    if (kind === 'holo') {
      // 68 MOA ring with tick marks and a centre dot, laser-red, with the grain of a hologram
      g.shadowColor = 'rgba(255,40,25,1)'; g.shadowBlur = 7;
      g.strokeStyle = 'rgba(255,95,75,1)'; g.lineWidth = 4;
      g.beginPath(); g.arc(m, m, 100, 0, Math.PI * 2); g.stroke();
      g.lineWidth = 5;
      for (let i = 0; i < 4; i++) { const a = (i * Math.PI) / 2; g.beginPath(); g.moveTo(m + Math.cos(a) * 100, m + Math.sin(a) * 100); g.lineTo(m + Math.cos(a) * 84, m + Math.sin(a) * 84); g.stroke(); }
      g.fillStyle = 'rgba(255,225,215,1)'; g.beginPath(); g.arc(m, m, 8, 0, Math.PI * 2); g.fill();
      const img = g.getImageData(0, 0, N, N), d = img.data;
      for (let i = 3; i < d.length; i += 4) d[i] *= 0.62 + Math.random() * 0.38;
      g.putImageData(img, 0, 0);
    } else if (kind === 'cdot') {
      // a 65 MOA circle round a 2 MOA dot: a clean LED ring
      g.shadowColor = 'rgba(255,40,25,1)'; g.shadowBlur = 6;
      g.strokeStyle = 'rgba(255,90,70,1)'; g.lineWidth = 4;
      g.beginPath(); g.arc(m, m, 98, 0, Math.PI * 2); g.stroke();
      g.fillStyle = 'rgba(255,225,215,1)'; g.beginPath(); g.arc(m, m, 7, 0, Math.PI * 2); g.fill();
    } else if (kind === 'dotP') {
      // a precision dot (a small-dot RMR-class sight): a crisp hot core about 2 mrad across, a thin red rim, barely any halo
      const grd = g.createRadialGradient(m, m, 0, m, m, m);
      grd.addColorStop(0, 'rgba(255,248,244,1)'); grd.addColorStop(0.1, 'rgba(255,150,130,1)'); grd.addColorStop(0.14, 'rgba(255,50,35,0.85)');
      grd.addColorStop(0.2, 'rgba(255,25,15,0.12)'); grd.addColorStop(0.32, 'rgba(0,0,0,0)'); grd.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = grd; g.fillRect(0, 0, N, N);
    } else {
      // an LED dot: a hot near-white core bleeding to red (or green), with a soft halo
      const grn = kind === 'dotG', c1 = grn ? 'rgba(235,255,235,1)' : 'rgba(255,245,240,1)', c2 = grn ? 'rgba(110,255,120,1)' : 'rgba(255,120,100,1)';
      const c3 = grn ? 'rgba(40,255,60,0.75)' : 'rgba(255,45,30,0.75)', c4 = grn ? 'rgba(20,255,40,0.16)' : 'rgba(255,25,15,0.16)';
      const grd = g.createRadialGradient(m, m, 0, m, m, m);
      grd.addColorStop(0, c1); grd.addColorStop(0.16, c2); grd.addColorStop(0.26, c3);
      grd.addColorStop(0.45, c4); grd.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = grd; g.fillRect(0, 0, N, N);
    }
    const t = new T.CanvasTexture(c);
    t.minFilter = T.LinearMipmapLinearFilter;
    return (texCache[kind] = t);
  }
  // angular size (radians) of the whole reticle texture: dot core about 3.5 mrad, dotP's about 2 mrad, holo ring 50 mrad across
  const RETICLE_RAD: Record<string, number> = { dot: 0.028, dotG: 0.028, dotP: 0.016, holo: 0.064, cdot: 0.062 };
  function reflex(g: THREE.Object3D, o: VmReflex) {
    const mask = new T.Mesh(o.round ? new T.CircleGeometry(o.w / 2, 28) : new T.PlaneGeometry(o.w, o.h), new T.MeshBasicMaterial({
      colorWrite: false, depthWrite: false, transparent: true, side: T.DoubleSide,
      stencilWrite: true, stencilRef: 1, stencilFunc: T.AlwaysStencilFunc, stencilZPass: T.ReplaceStencilOp,
    }));
    mask.position.set(0, o.y, -o.f);
    mask.renderOrder = 20;
    g.add(mask);
    const size = RETICLE_D * RETICLE_RAD[o.kind];
    const ret = new T.Mesh(new T.PlaneGeometry(size, size), new T.MeshBasicMaterial({
      map: reticleTex(o.kind), transparent: true, blending: T.AdditiveBlending, depthTest: false, depthWrite: false,
      stencilWrite: true, stencilRef: 1, stencilFunc: T.EqualStencilFunc, stencilFail: T.KeepStencilOp, stencilZFail: T.KeepStencilOp, stencilZPass: T.KeepStencilOp,
    }));
    ret.position.set(0, o.y, -(o.f + RETICLE_D));
    ret.renderOrder = 21;
    ret.frustumCulled = false;
    g.add(ret);
  }

  // ---------------------------------------------------------------- picture-in-picture scopes
  // The ocular lens shows the world through the scope: G.R renders the scene from the lens along the scope's
  // axis with a field of view set by the magnification, into a texture this disk shows. The reticle is drawn
  // over it, and a dark crescent creeps in when your eye is off the scope's axis (the eyebox).
  // (dot, dotG, cdot and holo: a reflex sight's own reticle, seen through a magnifier)
  const PIP_RETICLE: Record<string, number> = { cross: 0, chevron: 1, lpvo: 2, dot: 3, dotG: 3, dotP: 3, cdot: 4, holo: 4, ring: 5, bdc: 6 };
  const PIP_ILLUM: Record<string, number> = { ring: 0x000000, cross: 0x000000, chevron: 0xff9a18, lpvo: 0xff2a20, dot: 0xff2a20, dotP: 0xff2a20, dotG: 0x30ff50, cdot: 0xff2a20, holo: 0xff2a20, bdc: 0xff2a20 };
  // The crossbow's reticle (first focal plane: js/render.ts _renderPip says how big a mil is at this power, so it grows with
  // the picture and the marks are true at any power). In mils, on a canvas BDC_R either side of the centre:
  //   - a lit dot and, to pick it up at low power, a lit horseshoe; fine wires with heavy posts outside, a tick every mil near the middle
  //   - down the post, a rung for each distance, for a broadhead (the shots' own sums, G.flight, zeroed as it comes): hold it on the
  //     target at that range. Each rung's a man's shoulders wide (0.5 m) at its range. Ticks on the left: the same for a bodkin
  //   - standing on the left wire, a man 1.75 m tall at each range, nearest furthest out: stand him on the wire and match him
  const BDC_R = 170, BDC_TEX = new Map();
  function bdcTex(def: any) {
    const ball = G.ballFor(G.calOf(def)), tip = G.boreTip({ def }), hold = (am: string, d: number) => { const q = G.flight(def, am, tip, d)[d]; return q ? (-q.h / d) * 1000 : null; }, key = [10, 30, 100].map((d) => (hold(ball, d) || 0).toFixed(2)).join();
    if (BDC_TEX.has(key)) return BDC_TEX.get(key);
    const S0 = 4096, s = S0 / (2 * BDC_R), c = document.createElement('canvas');
    c.width = c.height = S0;
    const g = c.getContext('2d')!, line = (w: number, col: string, f: () => void) => { g.lineWidth = w; g.strokeStyle = col; g.beginPath(); f(); g.stroke(); }, ink = '#000', lit = '#f00';
    const label = (txt: string, x: number, y: number, h: number, al?: CanvasTextAlign) => { g.fillStyle = ink; g.font = `600 ${h}px Arial, sans-serif`; g.textAlign = al || 'left'; g.textBaseline = 'middle'; g.fillText(txt, x, y); };
    g.translate(S0 / 2, S0 / 2); g.scale(s, s); g.lineCap = 'butt';
    // the wires and posts
    const W = 0.14, HW = 1.5, POST = 60;
    line(W, ink, () => { g.moveTo(-POST, 0); g.lineTo(POST, 0); g.moveTo(0, -POST); g.lineTo(0, POST * 1.35); });
    line(HW, ink, () => { g.moveTo(-BDC_R, 0); g.lineTo(-POST, 0); g.moveTo(POST, 0); g.lineTo(BDC_R, 0); g.moveTo(0, -BDC_R); g.lineTo(0, -POST); });
    for (let i = 1; i <= 10; i++) {
      const h = i % 5 ? 0.45 : 0.9;
      line(W, ink, () => { g.moveTo(i, -h); g.lineTo(i, h); g.moveTo(-i, 0); g.lineTo(-i, h); g.moveTo(-h, -i); g.lineTo(h, -i); });
    }
    // lit: the dot, and the horseshoe, open at the bottom for the rungs
    g.fillStyle = lit; g.beginPath(); g.arc(0, 0, 0.32, 0, 7); g.fill();
    line(0.95, lit, () => { g.arc(0, 0, 15, Math.PI * 0.62, Math.PI * 2.38); });
    // the rungs (20 m: the middle itself)
    const TH = 2.3;
    label('20', 1.2, -TH * 0.72, TH);
    for (const d of [30, 40, 50, 60, 70, 80, 100, 120, 150]) {
      const y = hold(ball, d), hw = 250 / d;
      if (y == null) continue;
      line(0.2, ink, () => { g.moveTo(-hw, y); g.lineTo(hw, y); });
      label(String(d), hw + 0.9, y, TH);
    }
    // a bodkin's
    const heavy = G.ammoTypes(G.calOf(def)).find((a) => a !== ball && (G.AMMO as Record<string, any>)[a].velK);
    if (heavy) {
      for (const d of [20, 30, 40, 50, 60, 70, 80, 100]) {
        const y = hold(heavy, d);
        if (y == null) continue;
        line(0.16, ink, () => { g.moveTo(-1.8, y); g.lineTo(0, y); });
        if (d % 20 === 0 || d < 40 || d === 50 || d === 70) label(String(d), -2.3, y, TH * 0.72, 'right');
      }
      label((G.AMMO as Record<string, any>)[heavy].tag, -2.3, hold(heavy, 20)! - TH * 0.95, TH * 0.6, 'right');
    }
    // the men on the wire: 150 m nearest the middle, 20 m furthest out
    let x = -7.5;
    for (const d of [150, 100, 75, 50, 40, 30, 20]) {
      const h = 1750 / d, bw = h * 0.26, cx = x - bw / 2, lw = 0.15 + h * 0.004, hr = h * 0.085;
      line(lw, ink, () => {
        g.moveTo(cx + hr, -h + hr); g.arc(cx, -h + hr, hr, 0, 7); // the head
        g.moveTo(cx - bw * 0.16, 0); g.lineTo(cx - bw * 0.2, -h * 0.46); g.lineTo(cx - bw * 0.5, -h * 0.4); g.lineTo(cx - bw * 0.46, -h * 0.76); g.lineTo(cx - bw * 0.14, -h * 0.82); // the left of him, from the foot
        g.lineTo(cx + bw * 0.14, -h * 0.82); g.lineTo(cx + bw * 0.46, -h * 0.76); g.lineTo(cx + bw * 0.5, -h * 0.4); g.lineTo(cx + bw * 0.2, -h * 0.46); g.lineTo(cx + bw * 0.16, 0);
      });
      label(String(d), cx, 1.8 + Math.min(1.2, h * 0.02), TH * 0.86, 'center');
      x -= bw + Math.max(2.2, h * 0.09);
    }
    const t = new T.CanvasTexture(c);
    t.generateMipmaps = true; t.minFilter = T.LinearMipmapLinearFilter; t.anisotropy = 8;
    BDC_TEX.set(key, t);
    return t;
  }
  const PIP_VS = 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }';
  const PIP_FS = G.R.TONE + `
    uniform sampler2D map; uniform float live; uniform vec2 eye; uniform int ret; uniform vec3 illum;
    uniform sampler2D rmap; uniform float pmil; // (a first-focal-plane reticle: its picture, and how much of the lens's radius a mil is at this power)
    varying vec2 vUv;
    float seg(vec2 p, vec2 a, vec2 b) { vec2 pa = p - a, ba = b - a; float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0); return length(pa - ba * h); }
    float ink(float d, float w) { float aa = fwidth(d) * 0.75; return 1.0 - smoothstep(w - aa, w + aa, d); }
    void main() {
      vec2 p = vUv * 2.0 - 1.0; float r = length(p);
      vec3 img = bpTone(texture2D(map, vUv).rgb); // (the scene through it, rolled off as the screen's is: js/render.ts)
      float black = 0.0, glow = 0.0;
      if (ret == 0) { // duplex crosshair: fine wires in the middle, heavy posts outside
        float tw = abs(p.x) > 0.42 ? 0.026 : 0.0045, th = abs(p.y) > 0.42 ? 0.026 : 0.0045;
        black = max(ink(abs(p.y), tw), ink(abs(p.x), th));
      } else if (ret == 1) { // illuminated chevron over a bullet-drop post
        glow = max(ink(seg(p, vec2(0.0), vec2(-0.085, -0.1)), 0.011), ink(seg(p, vec2(0.0), vec2(0.085, -0.1)), 0.011));
        black = ink(seg(p, vec2(0.0, -0.15), vec2(0.0, -0.78)), 0.005);
        for (int i = 1; i < 5; i++) { float y = -0.15 - float(i) * 0.13, w = 0.075 - float(i) * 0.012; black = max(black, ink(seg(p, vec2(-w, y), vec2(w, y)), 0.0045)); }
      } else if (ret == 3) { // a red dot, magnified
        glow = ink(r, 0.035);
      } else if (ret == 4) { // a holographic or circle-dot ring, magnified
        glow = max(ink(abs(r - 0.42), 0.012), ink(r, 0.03));
      } else if (ret == 5) { // the AUG's: a black ring, the target in it (its size: a man at 300 m)
        black = ink(abs(r - 0.13), 0.012);
      } else if (ret == 6) { // drawn in mils, looked up in mils: it grows with the picture
        vec2 uv = 0.5 + p / pmil / (2.0 * ${BDC_R.toFixed(1)});
        if (uv.x > 0.0 && uv.y > 0.0 && uv.x < 1.0 && uv.y < 1.0) { vec4 t = texture2D(rmap, uv); black = t.a * (1.0 - t.r); glow = t.a * mix(0.3, 1.0, t.r); } // (red: lit; the rest etched, and faintly lit, to be read in the dark)
      } else { // illuminated circle-dot with a gapped crosshair
        glow = max(ink(abs(r - 0.2), 0.006), ink(r, 0.018));
        float tw = abs(p.x) > 0.55 ? 0.022 : 0.0035, th = abs(p.y) > 0.55 ? 0.022 : 0.0035;
        black = max(ink(abs(p.y), tw), ink(abs(p.x), th)) * step(0.3, max(abs(p.x), abs(p.y)));
      }
      vec3 col = img * (1.0 - black * 0.94) + illum * glow * 1.5;
      col *= (1.0 - smoothstep(0.7, 1.0, length(p - eye))) * smoothstep(1.0, 0.9, r);
      vec3 glass = vec3(0.025, 0.04, 0.055) + vec3(0.1, 0.12, 0.18) * pow(max(0.0, 1.0 - length(p - vec2(-0.35, 0.4))), 3.0);
      glass = pow(glass, vec3(2.2)); // (sRGB, as written: to linear)
      gl_FragColor = linearToOutputTexel(vec4(mix(glass, col, live), 1.0));
    }`;
  function pipLens(g: THREE.Object3D, o: VmPip, def: any) {
    const reticle = def.reticle || 'cross';
    const mat = new T.ShaderMaterial({
      uniforms: { map: { value: G.R.pipTexture() }, live: { value: 0 }, eye: { value: new T.Vector2() }, ret: { value: PIP_RETICLE[reticle] || 0 }, illum: { value: new T.Color(PIP_ILLUM[reticle] || 0) }, rmap: { value: reticle === 'bdc' ? bdcTex(def) : null }, pmil: { value: 1 } },
      vertexShader: PIP_VS, fragmentShader: PIP_FS, extensions: { derivatives: true }, toneMapped: false, // (it rolls off the picture itself: bpTone)
    });
    const disk = new T.Mesh(new T.CircleGeometry(o.r, 48), mat);
    const parent = typeof o.parent === 'string' ? g.getObjectByName(o.parent) : o.parent;
    if (parent) { disk.position.copy(Array.isArray(o.pos) ? new T.Vector3(o.pos[0], o.pos[1], o.pos[2]) : o.pos!); parent.add(disk); } // (a magnifier's lens swings with it)
    else { disk.position.set(0, o.y, -o.f); g.add(disk); }
    return { disk, r: o.r, mat, mag: def.magnif || 4 };
  }


  // ---------------------------------------------------------------- display surfaces
  // A mesh named display_<name> (extras.display { width, height }, with UVs) is a surface the game paints at runtime: it gets a
  // canvas of that size, a CanvasTexture on it, and a material that shows the texture (the model's own material is replaced).
  // The painter keeps the surface (root.userData.displays[name], or surfaces(group)) and draws on its ctx, then sets tex.needsUpdate.
  function surfaces(group: THREE.Object3D): Record<string, VmSurface> {
    const out: Record<string, VmSurface> = {};
    group.traverse((o: any) => {
      if (!o.isMesh || !o.name.startsWith('display_')) return;
      const d = o.userData.display || {}, width = d.width || 128, height = d.height || 32;
      const canvas = document.createElement('canvas');
      canvas.width = width; canvas.height = height;
      const tex = new T.CanvasTexture(canvas);
      o.material = new T.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false });
      out[o.name.slice('display_'.length)] = { mesh: o, canvas, ctx: canvas.getContext('2d')!, tex, width, height };
    });
    return out;
  }

  // The rounds-left display (display_ammo) of a gun of several barrels: one row per barrel, in info.muzzles order (v runs from the shooter's end away, so the first barrel is the top
  // row of the canvas), one pip per round across it, lit while the round remains. left: rounds left per barrel; per: a full barrel's. Redraws only when it changed.
  function paintAmmo(s: VmSurface, left: number[], per: number) {
    const sig = left.join(',') + '/' + per;
    if ((s as any).sig === sig) return;
    (s as any).sig = sig;
    const c = s.ctx, W = s.width, H = s.height, rows = left.length, rh = H / rows, pw = W / per;
    c.fillStyle = '#04100c'; c.fillRect(0, 0, W, H);
    for (let r = 0; r < rows; r++) for (let j = 0; j < per; j++) {
      const on = j < left[r], x = j * pw + pw * 0.5, y = r * rh + rh * 0.5, rad = Math.min(pw, rh) * 0.34;
      c.fillStyle = on ? (left[r] <= 2 ? '#ffb040' : '#5dffc8') : '#0c2a22';
      c.beginPath(); c.arc(x, y, rad, 0, Math.PI * 2); c.fill();
    }
    s.tex.needsUpdate = true;
  }

  // ---------------------------------------------------------------- the first-person gun
  // models: one per gun in the hands (two for an akimbo pair), each already built and decorated
  function assemble(def: any, models: VmModel[]) {
    const root = new T.Group();
    let info0: VmModel['info'] | null = null, pip: ReturnType<typeof pipLens> | null = null;
    const dials: THREE.Group[] = [], flashes: THREE.Mesh[] = [], holders: { holder: THREE.Group; info: VmModel['info']; side: number }[] = [], displays: Record<string, VmSurface> = {};
    const guns = def.akimbo ? [-1, 1] : [1];
    guns.forEach((side, i) => {
      const m = models[i], g = m.group, info = m.info;
      const rf = m.reflex || info.reflex, pp = m.pip || info.pip;
      if (rf) reflex(g, rf);
      if (pp && !pip) pip = pipLens(g, pp, def);
      Object.assign(displays, surfaces(g));
      if (!info0) info0 = info;
      const holder = new T.Group();
      holder.add(g);
      if (info.modeDial && !(info.anim && info.anim.dial)) { // a fire-mode dial the model has no turning part for (no part_dial): a marker on its face, turned with the mode
        const md = info.modeDial, piv = new T.Group(), mk = new T.Mesh(new T.BoxGeometry(0.0006, 0.0045, 0.0014), new T.MeshBasicMaterial({ color: 0xffd36a }));
        piv.position.set(md.at[2] + (md.axis[2] < 0 ? -0.0011 : 0.0011), md.at[1], -md.at[0]); mk.position.y = 0.0047; piv.add(mk); g.add(piv);
        piv.userData.axis = new T.Vector3(md.axis[2], md.axis[1], -md.axis[0]).normalize(); dials.push(piv);
      }
      if (def.akimbo) holder.position.x = side * 0.13;
      holders.push({ holder, info, side });
      for (const [f, y, x] of info.muzzles) {
        const fl = flash(def.tracer || 0xffc070);
        fl.position.set(x, y, -f - 0.04);
        holder.add(fl);
        flashes.push(fl);
      }
      root.add(holder);
    });
    const info = info0!;
    // Aim-down-sights puts the sight's rear at eye-relief distance straight ahead of the camera.
    // where your eye is along the gun when you aim: the sight's eye relief behind it, or (a bullpup, info.cheek) your
    // cheek on the stock's comb, the sight wherever it is on the rail in front of it
    const adsZ = info.cheek != null && info.cheek <= info.fSight - 0.03 ? info.cheek : info.fSight - info.relief;
    const ads = def.akimbo ? new T.Vector3(0, -0.12, -0.36) : new T.Vector3(0, -info.sy, adsZ);
    // hip: lower-right and well forward of the eye, so the optic doesn't fill the screen
    const hip = def.akimbo ? new T.Vector3(0, -0.15, -0.34) : info.pistol ? new T.Vector3(0.1, -0.1 - info.sy, -0.32) : new T.Vector3(0.1, -0.1 - info.sy * 0.6, adsZ - 0.1);
    root.userData = { flash: flashes[0], flashes, dial: dials[0] || null, sightY: info.sy, hip, ads, anim: info.anim, info, holders, pip };
    if (Object.keys(displays).length) root.userData.displays = displays;
    G.VMAnim.prepare(root, def); // arms, reload and inspect animation (js/vmanim.ts), bound to the parts by js/gunrig.ts
    return root;
  }

  // ---------------------------------------------------------------- third-person world model (merged, cached by the caller)
  function merge(group: THREE.Object3D) {
    group.updateMatrixWorld(true);
    const byMat = new Map<THREE.Material, THREE.BufferGeometry[]>();
    group.traverse((o: any) => {
      if (!o.isMesh) return;
      const geo = (o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone());
      // (a model read from a file may have its positions and normals quantised: 16-bit and 8-bit integers, normalised; the merge is in floats)
      for (const name of ['position', 'normal']) {
        const a = geo.attributes[name] as THREE.BufferAttribute;
        if (a.array instanceof Float32Array && !a.normalized) continue;
        const f = new Float32Array(a.count * a.itemSize);
        for (let i = 0; i < a.count; i++) { f[i * 3] = a.getX(i); f[i * 3 + 1] = a.getY(i); f[i * 3 + 2] = a.getZ(i); }
        geo.setAttribute(name, new T.BufferAttribute(f, 3));
      }
      geo.applyMatrix4(o.matrixWorld);
      for (const name of Object.keys(geo.attributes)) if (name !== 'position' && name !== 'normal') geo.deleteAttribute(name);
      if (!byMat.has(o.material)) byMat.set(o.material, []);
      byMat.get(o.material)!.push(geo);
    });
    const out = [];
    for (const [material, geos] of byMat) {
      let n = 0;
      geos.forEach((gg) => (n += gg.attributes.position.count));
      const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3);
      let off = 0;
      for (const gg of geos) { pos.set((gg.attributes.position as THREE.BufferAttribute).array, off * 3); nor.set((gg.attributes.normal as THREE.BufferAttribute).array, off * 3); off += gg.attributes.position.count; gg.dispose(); }
      const bg = new T.BufferGeometry();
      bg.setAttribute('position', new T.BufferAttribute(pos, 3));
      bg.setAttribute('normal', new T.BufferAttribute(nor, 3));
      bg.computeBoundingSphere();
      out.push({ geometry: bg, material });
    }
    group.traverse((o: any) => o.geometry && o.geometry.dispose());
    return out;
  }

  // (its magazine merged on its own, centred on itself, so a rig can take it off the gun and hold it: a reload,
  // a magazine check. g.userData.mag: the magazine's group; magHome: where it sits on the gun.)
  type Merged = { geometry: THREE.BufferGeometry; material: THREE.Material }[];
  interface WorldProto { meshes: Merged; info: any; mag: { meshes: Merged; home: THREE.Vector3 } | null; xb: Record<string, Merged> | null; legs: { meshes: Merged; home: THREE.Vector3; leg: { deploy: number[] } }[] }
  // NOTE: takes the model apart (the magazine, bolt, strings and legs are taken off the group): hand it one you are done with
  function worldProto(group: THREE.Object3D, info: any): WorldProto {
    let mag = null;
    const mn = info.anim && info.anim.mag;
    if (mn && mn.parent && !info.magTop) {
      group.updateMatrixWorld(true);
      const mw = mn.matrixWorld.clone(), solo = new T.Group();
      mn.parent.remove(mn);
      solo.add(mn); mw.decompose(mn.position, mn.quaternion, mn.scale);
      const meshes = merge(solo), box = new T.Box3();
      for (const m of meshes) { m.geometry.computeBoundingBox(); box.union(m.geometry.boundingBox!); }
      const c = box.getCenter(new T.Vector3());
      for (const m of meshes) m.geometry.translate(-c.x, -c.y, -c.z);
      mag = { meshes, home: c };
    }
    // (a crossbow's bolt and its two strings, kept as groups of their own: the bolt's gone once it's shot, the string's
    // forward until it's cocked. Merged on their own, each in place; setLoaded)
    const xb: any = {};
    group.updateMatrixWorld(true);
    for (const [key, name] of [['bolt', 'quarrel'], ['cocked', 'stringCocked'], ['slack', 'stringSlack']]) {
      const n = info.anim && info.anim[name];
      if (!n || !n.parent) continue;
      const solo = new T.Group();
      n.parent.remove(n); solo.add(n); n.visible = true;
      xb[key] = merge(solo);
    }
    // (a bipod's legs, each on its own about its hinge, so they swing down: js/rig.ts. The legs are the children of part_bipod that carry extras.leg)
    group.updateMatrixWorld(true);
    const bn = info.anim && info.anim.bipod;
    const legs = (bn ? bn.children.filter((l: any) => l.userData.leg) : []).map((l: any) => {
      const home = new T.Vector3().setFromMatrixPosition(l.matrixWorld), solo = new T.Group();
      l.parent.remove(l); l.position.set(0, 0, 0); solo.add(l);
      return { meshes: merge(solo), home, leg: l.userData.leg };
    });
    return { meshes: merge(group), info, mag, xb: xb.bolt ? xb : null, legs };
  }
  function worldInstance(proto: WorldProto) {
    const g = new T.Group();
    for (const m of proto.meshes) g.add(new T.Mesh(m.geometry, m.material));
    if (proto.mag) {
      const mg = new T.Group();
      for (const m of proto.mag.meshes) mg.add(new T.Mesh(m.geometry, m.material));
      mg.position.copy(proto.mag.home);
      g.add(mg);
      g.userData.mag = mg; g.userData.magHome = proto.mag.home;
    }
    if (proto.xb) {
      g.userData.xb = {};
      for (const [key, list] of Object.entries(proto.xb)) {
        const sub = new T.Group();
        for (const m of list) sub.add(new T.Mesh(m.geometry, m.material));
        g.add(sub); g.userData.xb[key] = sub;
      }
      g.userData.xb.slack.visible = false;
    }
    if (proto.legs.length) { // (the bipod: a node whose children are the legs, each at its hinge with its extras.leg; G.GunRig.bipodPose turns them)
      const bp = new T.Group();
      for (const l of proto.legs) {
        const sub = new T.Group();
        for (const m of l.meshes) sub.add(new T.Mesh(m.geometry, m.material));
        sub.position.copy(l.home); sub.userData.leg = l.leg; bp.add(sub);
      }
      g.add(bp); g.userData.bipod = bp;
    }
    g.userData.info = proto.info;
    return g;
  }

  return { assemble, reflex, pipLens, flash, surfaces, paintAmmo, worldProto, worldInstance, merge };
})();
G.Viewmodel = G_Viewmodel;
interface GameModules { Viewmodel: typeof G_Viewmodel; }
