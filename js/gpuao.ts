'use strict';
import { Level } from './level.js';
// Ambient occlusion baked on the GPU, from the level's own meshes (the same textures js/lightgrid.ts bakeAO makes from the boxes).
//
// What stands in a level is read off what is drawn: the level's static meshes (R.levelRoot: walls, furniture, props, doors, rocks,
// trees: whatever shape) are drawn twice per floor with an orthographic camera and a shader that writes the world height of the surface it
// meets: from above (the highest thing in each cell: the top of a piece) and from below (the lowest thing that faces down: the
// underside of a hanging box, a shelf, a table's top), the floor and the ceiling left out (a fragment under 3 cm or over a wall's height
// is dropped). A cell holds a solid from its underside to its top (a piece with nothing seen below it stands on the floor). The walls come
// from the floor plan (every tile that is wall), as they do for the box bake. Then a shader works out, for each cell, what bakeAO does
// (the floor, the ceiling, the top of a piece, vertical surfaces at two heights, a hemisphere of rays against all that), into the two
// textures the lit materials read. Nothing goes through the CPU, so it can't be done ahead in the prep worker: it is done as the level is put
// up, in the frame, and costs the draws of the static world twice a floor and the shader's pass. A cell is a sixth of a metre or so (S a tile).
// Off unless ?gpuao=1 is in the URL (the box bake is used); falls back to it if the GPU can't draw into half-float textures.
export const GpuAo = (() => {
  const T = THREE;
  const S = 4, NDIR = 20, LAYER = 6;
  const on = () => new URLSearchParams(location.search).get('gpuao') === '1';
  let rtA: THREE.WebGLRenderTarget | null = null, rtB: THREE.WebGLRenderTarget | null = null;
  let heightMat: THREE.ShaderMaterial | null = null, aoMat: THREE.ShaderMaterial | null = null, quad: THREE.Mesh | null = null, qScene: THREE.Scene | null = null, qCam: THREE.OrthographicCamera | null = null;

  const VS = `
    varying float vY;
    void main() {
      #include <begin_vertex>
      vec4 lw = vec4(transformed, 1.0);
      #ifdef USE_INSTANCING
      lw = instanceMatrix * lw;
      #endif
      vec4 wp = modelMatrix * lw;
      vY = wp.y;
      gl_Position = projectionMatrix * viewMatrix * wp;
    }`;
  // (the height a fragment is at over the floor, plus one: 0 is nothing; a fragment outside the floor's own height range is dropped)
  const FS = `
    uniform vec2 uRange; varying float vY;
    void main() {
      if (vY < uRange.x || vY > uRange.y) discard;
      gl_FragColor = vec4(vY - uRange.x + 1.03, 0.0, 0.0, 1.0);
    }`;
  const AO_VS = `varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;
  const AO_FS = `
    precision highp float;
    uniform sampler2D uTop, uBot, uTiles;
    uniform vec2 uMap;      // the map's size, m
    uniform vec3 uGrid;     // cells across, cells down, cell size (m)
    uniform float uWH;      // the wall's height
    uniform int uPass;      // 0: the floor, the ceiling, the top of a piece; 1: the vertical surfaces
    varying vec2 vUv;
    float stp(int k) { return k == 0 ? 0.08 : k == 1 ? 0.2 : k == 2 ? 0.38 : k == 3 ? 0.6 : k == 4 ? 0.85 : 1.15; }
    float gMin = 0.0; // (a piece counts only if it is at least this tall: set while looking for the surface up above the head)
    bool solidAt(vec3 p) {
      vec2 uv = p.xz / uMap;
      if (uv.x < 0.0 || uv.y < 0.0 || uv.x >= 1.0 || uv.y >= 1.0) return false;
      if (texture2D(uTiles, uv).r > 0.5) return true;
      float hi = texture2D(uTop, vec2(uv.x, 1.0 - uv.y)).r, lo = texture2D(uBot, uv).r;
      if (hi < 0.5 && lo < 0.5) return false;
      float h = hi < 0.5 ? lo - 1.0 + 0.05 : hi - 1.0, l = lo < 0.5 ? 0.0 : lo - 1.0;
      if (l > h) l = 0.0; // (an underside seen above its own top: a piece that stands on the floor)
      if (h < gMin) return false;
      return p.y >= l && p.y <= h;
    }
    float openAt(vec3 p, vec3 n) {
      float sum = 0.0;
      for (int i = 0; i < ${NDIR}; i++) {
        float u = (float(i) + 0.5) / float(${NDIR}), r = sqrt(u), ph = float(i) * 2.399963;
        vec3 h = vec3(r * cos(ph), sqrt(1.0 - u), r * sin(ph));
        vec3 d = n.y != 0.0 ? vec3(h.x, n.y * h.y, h.z) : n.x != 0.0 ? vec3(n.x * h.y, h.x, h.z) : vec3(h.x, h.z, n.z * h.y);
        for (int k = 0; k < 6; k++) { float s = stp(k); if (solidAt(p + d * s)) { sum += 1.0 - s / 1.3; break; } }
      }
      return 1.0 - sum / float(${NDIR});
    }
    float wallAx(float h, bool ax, vec2 c) {
      float best = 9.0, v = 1.0;
      gMin = h > 1.0 ? h + 0.35 : 0.0;
      bool within = solidAt(vec3(c.x, h, c.y)); // (a cell that is itself inside a piece at this height: nothing looks at a surface from here)
      gMin = 0.0;
      if (within) return 1.0;
      for (int sg = 0; sg < 2; sg++) {
        float sgn = sg == 0 ? 1.0 : -1.0;
        vec2 dd = ax ? vec2(sgn, 0.0) : vec2(0.0, sgn);
        for (int k = 1; k <= 10; k++) {
          float d = 0.07 * float(k); if (d >= best) break;
          gMin = h > 1.0 ? h + 0.35 : 0.0; // (up above the head: a piece shorter than that is not what this surface faces: the wall behind it is)
          bool hit = solidAt(vec3(c.x - dd.x * d, h, c.y - dd.y * d));
          if (hit) { best = d; v = openAt(vec3(c.x - dd.x * (d - 0.02), h, c.y - dd.y * (d - 0.02)), vec3(dd.x, 0.0, dd.y)); gMin = 0.0; break; }
          gMin = 0.0;
        }
      }
      return v;
    }
    void main() {
      vec2 cell = floor(vUv * uGrid.xy), c = (cell + 0.5) * uGrid.z;
      bool inside = solidAt(vec3(c.x, 0.05, c.y));
      if (uPass == 0) {
        float topH = 0.0, topAO = 1.0, hiRaw = texture2D(uTop, vec2(c.x / uMap.x, 1.0 - c.y / uMap.y)).r, hi = hiRaw - 1.0;
        bool wallTile = texture2D(uTiles, c / uMap).r > 0.5;
        if (!wallTile && hiRaw > 0.5 && hi >= 0.15 && hi < uWH - 0.2) { topAO = openAt(vec3(c.x, hi + 0.03, c.y), vec3(0.0, 1.0, 0.0)); topH = hi / uWH; }
        float fl = inside ? 70.0 / 255.0 : openAt(vec3(c.x, 0.04, c.y), vec3(0.0, 1.0, 0.0));
        float ce = inside ? 1.0 : openAt(vec3(c.x, uWH - 0.04, c.y), vec3(0.0, -1.0, 0.0));
        gl_FragColor = vec4(fl, ce, topAO, topH);
      } else {
        if (inside) { gl_FragColor = vec4(1.0); return; }
        gl_FragColor = vec4(wallAx(0.6, true, c), wallAx(0.6, false, c), wallAx(1.8, true, c), wallAx(1.8, false, c));
      }
    }`;

  function supported(r: THREE.WebGLRenderer) {
    const e = r.extensions;
    return !!(e.has('EXT_color_buffer_float') || e.has('EXT_color_buffer_half_float'));
  }

  // the level's meshes: the opaque ones are put on a layer of their own (the camera for the height passes sees nothing else)
  function mark(root: THREE.Object3D) {
    root.traverse((o: any) => {
      if (!(o.isMesh || o.isInstancedMesh) || !o.geometry) return;
      const ms = Array.isArray(o.material) ? o.material : [o.material];
      if (ms.some((m: THREE.Material) => m && (m.transparent || m.alphaTest > 0 || m.visible === false))) return;
      o.layers.enable(LAYER);
    });
  }

  function bake(r: THREE.WebGLRenderer, scene: THREE.Scene, root: THREE.Object3D, map: LvMap): { a: THREE.Texture; b: THREE.Texture; ms: number } | null {
    if (!on() || !supported(r)) return null;
    const t0 = performance.now(), TS = Level.TS, floors = map.floors || [map], NF = floors.length, W = map.W, H = map.H, WH = Level.WALL_H, AW = W * S, AH = H * S, s = TS / S, MW = W * TS, MH = H * TS;
    dispose();
    mark(root);
    const rtOpt = { type: T.HalfFloatType, format: T.RGBAFormat, minFilter: T.NearestFilter, magFilter: T.NearestFilter, depthBuffer: true, generateMipmaps: false };
    // (the heights at a finer grain than the occlusion (SH a tile: 8 cm): a door frame or a post a few centimetres across is a few of the rays' steps, not a whole cell)
    const SH = Math.max(S, Math.min(8, Math.floor(Math.sqrt(2.5e6 / (W * H))))), rtTop = new T.WebGLRenderTarget(W * SH, H * SH, rtOpt), rtBot = new T.WebGLRenderTarget(W * SH, H * SH, rtOpt);
    const outOpt = { type: T.UnsignedByteType, format: T.RGBAFormat, minFilter: T.LinearFilter, magFilter: T.LinearFilter, depthBuffer: false, generateMipmaps: false };
    rtA = new T.WebGLRenderTarget(AW, AH * NF, outOpt); rtB = new T.WebGLRenderTarget(AW, AH * NF, outOpt);
    heightMat = new T.ShaderMaterial({ vertexShader: VS, fragmentShader: FS, uniforms: { uRange: { value: new T.Vector2() } }, side: T.FrontSide });
    heightMat.toneMapped = false;
    const tiles = new T.DataTexture(new Uint8Array(W * H), W, H, T.RedFormat, T.UnsignedByteType); tiles.minFilter = tiles.magFilter = T.NearestFilter; tiles.wrapS = tiles.wrapT = T.ClampToEdgeWrapping;
    aoMat = new T.ShaderMaterial({ vertexShader: AO_VS, fragmentShader: AO_FS, depthTest: false, depthWrite: false, uniforms: { uTop: { value: rtTop.texture }, uBot: { value: rtBot.texture }, uTiles: { value: tiles }, uMap: { value: new T.Vector2(MW, MH) }, uGrid: { value: new T.Vector3(AW, AH, s) }, uWH: { value: WH }, uPass: { value: 0 } } });
    aoMat.toneMapped = false;
    quad = new T.Mesh(new T.PlaneGeometry(2, 2), aoMat); quad.frustumCulled = false; qScene = new T.Scene(); qScene.add(quad); qCam = new T.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    // the renderer as the game left it
    const prevRT = r.getRenderTarget(), prevClear = new T.Color(), prevAlpha = r.getClearAlpha(), prevAuto = r.autoClear, prevBg = scene.background, prevFog = scene.fog, prevShadow = r.shadowMap.autoUpdate, prevOver = scene.overrideMaterial, prevAutoInfo = r.info.autoReset;
    r.getClearColor(prevClear);
    r.autoClear = false; scene.background = null; scene.fog = null; r.shadowMap.autoUpdate = false; r.info.autoReset = false;
    const cam = new T.OrthographicCamera(0, MW, 0, -MH, 0.1, 60); // (looking down: x to the right, z down the picture: row 0 is the greatest z)
    const camUp = new T.OrthographicCamera(0, MW, MH, 0, 0.1, 60); // (looking up)
    const cx = MW / 2, cz = MH / 2;
    try {
      for (let f = 0; f < NF; f++) {
        const fm = floors[f], fy = fm.fy || 0;
        heightMat.uniforms.uRange.value.set(fy + 0.03, fy + WH - 0.05);
        const tl = tiles.image.data as Uint8Array; for (let i = 0; i < W * H; i++) tl[i] = fm.t[i] === 1 ? 255 : 0; tiles.needsUpdate = true;
        scene.overrideMaterial = heightMat;
        // from above
        cam.position.set(cx, fy + 30, cz); cam.up.set(0, 0, -1); cam.lookAt(cx, fy, cz); cam.layers.set(LAYER); cam.left = -MW / 2; cam.right = MW / 2; cam.top = MH / 2; cam.bottom = -MH / 2; cam.updateProjectionMatrix();
        r.setRenderTarget(rtTop); r.setClearColor(0x000000, 0); r.clear(); r.render(scene, cam);
        // from below
        camUp.position.set(cx, fy - 30, cz); camUp.up.set(0, 0, 1); camUp.lookAt(cx, fy, cz); camUp.layers.set(LAYER); camUp.left = -MW / 2; camUp.right = MW / 2; camUp.top = MH / 2; camUp.bottom = -MH / 2; camUp.updateProjectionMatrix();
        r.setRenderTarget(rtBot); r.clear(); r.render(scene, camUp);
        scene.overrideMaterial = null;
        // the occlusion, into this floor's rows
        for (const [rt, pass] of [[rtA, 0], [rtB, 1]] as [THREE.WebGLRenderTarget, number][]) {
          aoMat.uniforms.uPass.value = pass;
          rt.viewport.set(0, f * AH, AW, AH); rt.scissor.set(0, f * AH, AW, AH); rt.scissorTest = true;
          r.setRenderTarget(rt); r.render(qScene, qCam);
        }
      }
    } finally {
      scene.overrideMaterial = prevOver; scene.background = prevBg; scene.fog = prevFog; r.shadowMap.autoUpdate = prevShadow; r.autoClear = prevAuto; r.info.autoReset = prevAutoInfo;
      r.setRenderTarget(prevRT); r.setClearColor(prevClear, prevAlpha);
      rtA.scissorTest = false; rtB.scissorTest = false;
      rtTop.dispose(); rtBot.dispose(); tiles.dispose();
    }
    r.getContext().finish(); // (the GPU's work counted too: what the cost is; the frame would wait on it anyway)
    return { a: rtA.texture, b: rtB.texture, ms: Math.round(performance.now() - t0) };
  }

  function dispose() {
    for (const x of [rtA, rtB]) if (x) x.dispose();
    rtA = rtB = null;
    if (heightMat) { heightMat.dispose(); heightMat = null; }
    if (aoMat) { aoMat.dispose(); aoMat = null; }
    if (quad) { quad.geometry.dispose(); quad = null; }
  }
  return { bake, dispose, on, S, targets: () => ({ a: rtA, b: rtB }) };
})();
