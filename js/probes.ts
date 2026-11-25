'use strict';
import { Level } from './level.js';
import { LightGrid } from './lightgrid.js';
// Reflections: what a room looks like, reflected in its floor, its metal, its glass. Each room is photographed once (a cube of six
// pictures from its middle at head height, the level only: no one in it), prefiltered for rough surfaces (three's PMREM), and the room
// you're in is the scene's environment. Its standard materials read it through the light grid's shader (js/lightgrid.ts ENV), the
// direction projected onto the room's box (so a lamp's reflection in the floor lies where the lamp is, not off at infinity), only for
// what it reflects (the light grid gives what lights a surface: the environment's own light would be counted twice) and fading out
// past the room's walls (a room seen through a door reflects little: it isn't this room).
//   level(map, scene)            a new level: the probes cleared; the environment a black one meanwhile (each lit material's shader
//                                compiled once, with a reflection in it)
//   frame(r, scene, at, levelRoot) each frame, before it's drawn: the room at `at` (the eye); its picture taken if it isn't yet, a face
//                                a frame (six level renders spread out, then the prefilter), then its neighbours' as the time's spare
//   before(), after()            the level's scene's drawing: js/render.ts hooks it
//   clear()                      the level's gone
// ?refl=k in the URL scales how much (0 off).
export const Probes = (() => {
  const T = THREE, SIZE = 128, KEEP = 10, FADE = 0.35; // (a cube's face; probes kept, least recently used let go; seconds to fade one in)
  const K0 = (() => { const q = typeof location !== 'undefined' ? new URLSearchParams(location.search).get('refl') : null; return q != null && Number.isFinite(+q) ? +q : 1; })();
  interface Box { r: number; min: THREE.Vector3; max: THREE.Vector3; c: THREE.Vector3; fl: number }
  interface Probe { box: Box; rt: THREE.WebGLRenderTarget | null; used: number }
  let map: LvMap | null = null, boxes: Box[] = [], probes = new Map<number, Probe>(), black: THREE.WebGLRenderTarget | null = null;
  let pmrem: THREE.PMREMGenerator | null = null, cubeRT: THREE.WebGLCubeRenderTarget | null = null, cubeCam: THREE.CubeCamera | null = null;
  const ms = { faces: [] as number[], last: 0, n: 0 }; // (the last dozen faces' times, the last face with its prefilter, how many taken: the stats)
  let job: { box: Box; face: number } | null = null, cur: Probe | null = null, k = 0, last = 0, capturing = false, hooked: THREE.Scene | null = null;
  const U = LightGrid.U as any;

  function level(m: LvMap, scene: THREE.Scene, r: THREE.WebGLRenderer) {
    clear();
    if (!K0) return;
    map = m;
    const L = Level, TS = L.TS, fls = (m as any).floors || [m];
    boxes = (m.rooms || []).filter((rm) => !rm.out && rm.w > 0 && rm.h > 0).map((rm, i) => {
      const fl = rm.fl || 0, y0 = (fls[fl] && fls[fl].fy) || 0, y1 = y0 + L.WALL_H;
      const min = new T.Vector3(rm.x * TS, y0, rm.z * TS), max = new T.Vector3((rm.x + rm.w) * TS, y1, (rm.z + rm.h) * TS);
      return { r: i, min, max, c: new T.Vector3((min.x + max.x) / 2, y0 + 1.6, (min.z + max.z) / 2), fl };
    });
    if (!boxes.length) { map = null; return; }
    pmrem = new T.PMREMGenerator(r);
    cubeRT = new T.WebGLCubeRenderTarget(SIZE, { type: T.HalfFloatType, generateMipmaps: false });
    cubeCam = new T.CubeCamera(0.05, 80, cubeRT);
    // the black one meanwhile: the shaders are built with a reflection from the start (none recompiled when the first picture's in)
    { const cc = r.getClearColor(new T.Color()), ca = r.getClearAlpha(), was = r.getRenderTarget(); r.setClearColor(0x000000, 1); for (let f = 0; f < 6; f++) { r.setRenderTarget(cubeRT, f); r.clear(); } r.setRenderTarget(was); r.setClearColor(cc, ca); }
    black = pmrem.fromCubemap(cubeRT.texture as unknown as THREE.CubeTexture);
    scene.environment = black.texture; scene.environmentIntensity = 1;
    hooked = scene;
  }

  // the room at p (on its floor): the smallest that holds it (a corridor running into a room's edge), else none
  function boxAt(p: THREE.Vector3) {
    let best: Box | null = null, ba = Infinity;
    const fl = map!.floors ? Level.floorAt(map!, p.x, p.y - 1.5, p.z) : 0;
    for (const b of boxes) {
      if (b.fl !== fl || p.x < b.min.x || p.x > b.max.x || p.z < b.min.z || p.z > b.max.z) continue;
      const a = (b.max.x - b.min.x) * (b.max.z - b.min.z); if (a < ba) { ba = a; best = b; }
    }
    return best;
  }

  // one face of the job's cube: the level alone (everything else in the scene hidden but the lights)
  function face(r: THREE.WebGLRenderer, scene: THREE.Scene, keep: THREE.Object3D) {
    const t0 = performance.now();
    const jb = job!, cam = cubeCam!;
    if (jb.face === 0) {
      cam.position.copy(jb.box.c); cam.updateMatrixWorld(true);
      if ((cam as any).coordinateSystem !== r.coordinateSystem) { (cam as any).coordinateSystem = r.coordinateSystem; cam.updateCoordinateSystem(); }
    }
    const hid: THREE.Object3D[] = [];
    for (const o of scene.children) if (o.visible && o !== keep && !(o as any).isLight && !o.userData.inLevel) { // (inLevel: the level's moving pieces' batches, js/proxydraw.ts)
       o.visible = false; hid.push(o); }
    const was = r.getRenderTarget(), bg = scene.background;
    capturing = true;
    r.setRenderTarget(cubeRT, jb.face); r.clear(); r.render(scene, cam.children[jb.face] as THREE.Camera);
    capturing = false;
    r.setRenderTarget(was); scene.background = bg;
    for (const o of hid) o.visible = true;
    if (++jb.face < 6) { ms.faces.push(+(performance.now() - t0).toFixed(1)); if (ms.faces.length > 12) ms.faces.shift(); return; }
    let p = probes.get(jb.box.r);
    if (!p) { p = { box: jb.box, rt: null, used: last }; probes.set(jb.box.r, p); }
    p.rt = pmrem!.fromCubemap(cubeRT!.texture as unknown as THREE.CubeTexture, p.rt);
    ms.last = performance.now() - t0; ms.n++;
    job = null;
    if (probes.size > KEEP) { // (the least recently used let go)
      let old: Probe | null = null; for (const q of probes.values()) if (q !== cur && (!old || q.used < old.used)) old = q;
      if (old) { old.rt && old.rt.dispose(); probes.delete(old.box.r); }
    }
  }

  function frame(r: THREE.WebGLRenderer, scene: THREE.Scene, at: THREE.Vector3, levelRoot: THREE.Object3D) {
    if (!map || scene !== hooked) return;
    const now = performance.now() / 1000, dt = Math.min(0.1, last ? now - last : 0); last = now;
    const b = boxAt(at), p = b ? probes.get(b.r) : null;
    // the room's own picture, if it isn't taken; else the nearest of the others on its floor not yet taken (within 20 m, while fewer than KEEP are kept)
    if (!job) {
      if (b && !(p && p.rt)) job = { box: b, face: 0 };
      else {
        let nb: Box | null = null, nd = probes.size < KEEP - 2 ? 20 : 0; // (ahead only while there's room: one let go to take another would go round for ever)
        for (const q of boxes) { if (probes.has(q.r) || (b && q.fl !== b.fl)) continue; const d = q.c.distanceTo(at); if (d < nd) { nd = d; nb = q; } }
        if (nb) job = { box: nb, face: 0 };
      }
    }
    if (job) face(r, scene, levelRoot);
    const want = b ? probes.get(b.r) : null, ready = want && want.rt ? want : null;
    if (ready !== cur) { k = Math.max(0, k - dt / FADE * 2); if (k <= 0 || !cur) { cur = ready; k = 0; } } // (the old one fades out, then the new one in)
    else if (cur) k = Math.min(1, k + dt / FADE);
    if (cur) {
      cur.used = now;
      scene.environment = cur.rt!.texture;
      U.lgEnvMin.value.copy(cur.box.min); U.lgEnvMax.value.copy(cur.box.max); U.lgEnvC.value.copy(cur.box.c);
    } else { scene.environment = black!.texture; k = 0; }
  }

  function clear() {
    for (const p of probes.values()) p.rt && p.rt.dispose();
    probes.clear(); boxes = []; map = null; job = null; cur = null; k = 0;
    if (black) { black.dispose(); black = null; }
    if (cubeRT) { cubeRT.dispose(); cubeRT = null; } cubeCam = null;
    if (pmrem) { pmrem.dispose(); pmrem = null; }
    if (hooked) { if (hooked.environment) hooked.environment = null; hooked = null; }
    U.lgEnvOn.value = 0; U.lgEnvK.value = 0;
  }
  // the level's scene's drawing (js/render.ts hooks it): the reflection on for it (a flag of its own: a tiny strength would round to nothing
  // at a GPU's medium precision and read as off), off for any other scene (the gun's studio)
  function before() { U.lgEnvOn.value = 1; U.lgEnvK.value = hooked && !capturing ? k * K0 : 0; }
  function after() { U.lgEnvOn.value = 0; U.lgEnvK.value = 0; }
  return { level, frame, clear, before, after, get stats() { return { boxes: boxes.length, probes: probes.size, cur: cur ? cur.box.r : -1, k, job: job ? job.box.r + ':' + job.face : null, ms }; } };
})();
