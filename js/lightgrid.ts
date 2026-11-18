'use strict';
import { Homes } from './homes.js';
import { Level } from './level.js';
// The light grid: every lamp in the level lights its surroundings, at a fixed cost however many there are.
//
// A real THREE.PointLight costs every lit pixel a pass over it (three.js shades forward, with no culling per light),
// and changing how many there are recompiles every shader. Measured on the festival (115 lamps): 12 lights put 40%
// on a frame, 48 lights 160%, 96 lights 320% (and a 12 s recompile, in software). So only a dozen ever were real,
// handed to the lamps nearest you: the rest stayed dark (the far end of a corridor), and as you moved lamps
// switched on and off as they joined and left the dozen (the festival's flicker).
//
// Instead, when a level is built, each lamp's light is worked out over the floor of the level, in four slabs of it (a metre each:
// BANDS, below: furniture and the lamps' heights matter), tile by tile (the
// fine grid, 2/3 m), stopped by walls (a line from the lamp to the tile through no wall), falling off as a point
// light's does (three.js' own: (1 - d / distance) ^ decay). Each tile keeps the light reaching it (RGB) and where it
// comes from on average (a direction, shorter the more it comes from all round). That goes in two textures (one
// layer per floor, stacked), and every lit material reads them: one texture lookup per pixel, however many lamps.
//   - A surface takes the light at its own spot on the floor plan (a wall: just off its face, on the side it faces,
//     so a room's light doesn't reach through the wall to the next), from the layer of the floor it's on, and turns
//     it by how squarely it faces where the light comes from (half-Lambert: a floor under a lamp gets it all, a wall
//     beside it half or so).
//   - Walls hold no light: each tile also stores 1 if it's open, 0 if it's wall, the light premultiplied by it, so
//     the texture's own filtering averages only the open tiles round a spot (the shader divides by the filtered
//     weight). A thin wall's two sides never mix.
//   - It's on only while the level itself is drawn (R.render): the gunsmith's and the icons' renderers share the
//     materials, and don't want the level's lamps.
// Dynamic lights (muzzle flashes, weapon lights, explosions) are still real lights.
export const LightGrid = (() => {
  const T = THREE;
  const blank = new T.DataTexture(new Uint16Array(4), 1, 1, T.RGBAFormat, T.HalfFloatType); blank.needsUpdate = true;
  // the uniforms every patched material shares (one object: changing a value changes it everywhere)
  const U = {
    lgLight: { value: blank }, lgDir: { value: blank },
    lgGrid: { value: new T.Vector4(0, 0, 1, 0) }, // x0, z0 (the map's corner, metres), cell size, on (0/1)
    lgSize: { value: new T.Vector4(1, 1, 1, 0) }, // W, H (cells), floors, where the lowest floor's layer starts (y)
    lgFloorH: { value: 4.3 },
    lgPaint: { value: blank }, // (residents' wall colours, a cell of the floor plan each: js/homes.ts paint)
    // night vision's IR illuminator (js/render.ts), only on a frame drawn for the goggles with it switched on: lgNv where it
    // is (the eye: x, y, z) and how bright (w, 0 off), lgNvD which way it points (x, y, z) and the cosine of its cone's half-angle (w)
    lgNv: { value: new T.Vector4(0, 0, 0, 0) }, lgNvD: { value: new T.Vector4(0, 0, -1, 0.9) },
    // ambient occlusion (below): x how much (0 off, 1 as made), y the walls' height (m); js/render.ts setAO
    lgAoK: { value: new Float32Array(8).fill(1) }, // (the moving parts' layers of the occlusion: 1 in place, 0 away; js/gunao.ts)
    lgAo: { value: new T.Vector4(1, 4, 0, 0.28) }, lgAoA: { value: blank }, lgAoB: { value: blank },
    lgBand: { value: new T.Vector4(1, 0.5, 1, 0) }, // the slabs of a floor: how many, the first one's middle, each one's height (m) // (z: the baked one's in; else the open share, below)
  };
  let built = false;
  // bounce: how much of what a surface reflects comes back into the room (on top of its colour: the theme's walls',
  // floor's and ceiling's, js below); bounces: how many times it goes round at most, and settle: it stops sooner once a
  // bounce adds no tile more than that share of its light (bounced: a pale shop's or lab's goes round five times, a
  // dark foundry's or bunker's three; every tile then within about two steps of the screen's 255 of where it would
  // settle, its doors open or shut. Each bounce costs 50-130 ms of a level's build, the festival's 150, the foundry's 250:
  // with the doors' layers worked out no further than the light gets (REACH), most places build in 0.1 to 0.6 s);
  // reach: see REACH; sky: the night sky's (the theme's fill); spill, spillK: the sky's light carried in through what's open
  // to it, how many tiles and how much of it the first tile in gets (below)
  // through what's open to it, a window, a doorway; fill: what's left of the flat fill everywhere (js/render.ts)
  const opts = { bounce: 1.75, bounces: 6, settle: 0.06, sky: 1, fill: 0.25, reach: 5, spill: 4, spillK: 0.55 };

  // every lit material reads the grid (added to its shader as three.js compiles it)
  // (aOcc: a gun's occlusion at the vertex, js/gunao.ts: 0 none, and 0 too for a mesh that has none: a missing attribute reads as 0)
  const VS_HEAD = 'varying vec3 vLgP;\nvarying vec3 vLgN;\nattribute float aOcc;\nattribute float aOccD;\nattribute float aOccI;\nuniform float lgAoK[8];\nvarying float vOcc;\n';
  const VS_BODY = `
    { vec4 lgp = vec4(transformed, 1.0); vec3 lgn = objectNormal;
      #ifdef USE_BATCHING
      lgp = batchingMatrix * lgp; lgn = mat3(batchingMatrix) * lgn;
      #endif
      #ifdef USE_INSTANCING
      lgp = instanceMatrix * lgp; lgn = mat3(instanceMatrix) * lgn;
      #endif
      lgp = modelMatrix * lgp; vLgP = lgp.xyz; vLgN = normalize(mat3(modelMatrix) * lgn); vOcc = aOcc + aOccD * lgAoK[int(aOccI + 0.5)]; }`; // (a moving part's occlusion on what's round it, as the part is in place: js/gunao.ts layers)
  const FS_HEAD = `varying vec3 vLgP;\nvarying vec3 vLgN;\nvarying float vOcc;\nuniform sampler2D lgLight;\nuniform sampler2D lgDir;\nuniform vec4 lgGrid;\nuniform vec4 lgSize;\nuniform float lgFloorH;\nuniform sampler2D lgPaint;\nuniform vec4 lgNv;\nuniform vec4 lgNvD;
uniform vec4 lgAo;\nuniform vec4 lgBand;\nuniform sampler2D lgAoA;\nuniform sampler2D lgAoB;\n`;
  // A wall's colour by the room it faces (a material with LG_PAINT: only a level with a resident's room). A wall cell is one
  // box with a room on each side, so the box can't be tinted: each face takes it from the floor plan, just off the face on
  // its own side, as it does the light, so the room next door keeps its own, and so do a wall's faces once they've been
  // shot (js/damage.ts: the same material). Stored as a share of the theme's wall colour, halved to fit a byte; a: 0 not
  // painted, 0.5 painted, 1 papered (a faint stripe up the wall).
  const FS_PAINT = `
    #include <color_fragment>
    #ifdef LG_PAINT
    if (lgGrid.w > 0.5) {
      vec3 lpn = normalize(vLgN);
      if (abs(lpn.y) < 0.5) {
        float lpf = clamp(floor((vLgP.y - lgSize.w) / lgFloorH), 0.0, lgSize.z - 1.0);
        vec2 lpc = (vLgP.xz + lpn.xz * 0.3 - lgGrid.xy) / lgGrid.z;
        lpc.y = clamp(lpc.y, 0.5, lgSize.y - 0.5) + lpf * lgSize.y;
        vec4 lpp = texture2D(lgPaint, vec2(lpc.x / lgSize.x, lpc.y / (lgSize.y * lgSize.z)));
        if (lpp.a > 0.25) {
          diffuseColor.rgb *= lpp.rgb * 2.0;
          if (lpp.a > 0.75) diffuseColor.rgb *= 1.0 - 0.07 * step(0.5, fract((abs(lpn.x) > 0.5 ? vLgP.z : vLgP.x) / 0.36));
        }
      }
    }
    #endif`;
  const FS_BODY = `
    if (lgGrid.w > 0.5) {
      vec3 lgn = normalize(vLgN);
      float lgf = clamp(floor((vLgP.y - lgSize.w) / lgFloorH), 0.0, lgSize.z - 1.0); // (which floor's layer)
      vec2 lgc = (vLgP.xz + lgn.xz * 0.3 - lgGrid.xy) / lgGrid.z; // (in cells; a wall's face samples just off it, its own side)
      float lgcy = clamp(lgc.y, 0.5, lgSize.y - 0.5);
      vec2 lguv = vec2(lgc.x / lgSize.x, (lgcy + lgf * lgSize.y) / (lgSize.y * lgSize.z)); // (the floor's own rows: the paint and the occlusion)
      // (the light: the two slabs of the floor the surface's height is between, blended by how far between)
      float lgbp = clamp((vLgP.y - (lgSize.w + lgf * lgFloorH) - lgAo.w - lgBand.y) / lgBand.z, 0.0, lgBand.x - 1.0), lgb0 = floor(lgbp), lgbf = lgbp - lgb0, lgb1 = min(lgb0 + 1.0, lgBand.x - 1.0);
      float lgrows = lgSize.y * lgSize.z * lgBand.x;
      vec2 lguv0 = vec2(lgc.x / lgSize.x, (lgcy + (lgf * lgBand.x + lgb0) * lgSize.y) / lgrows), lguv1 = vec2(lgc.x / lgSize.x, (lgcy + (lgf * lgBand.x + lgb1) * lgSize.y) / lgrows);
      vec4 lgL = mix(texture2D(lgLight, lguv0), texture2D(lgLight, lguv1), lgbf), lgD = mix(texture2D(lgDir, lguv0), texture2D(lgDir, lguv1), lgbf);
      // Ambient occlusion: the open share of the floor plan round the spot (lgL.a: the tiles' open (1) and wall (0), filtered) is how
      // boxed in it is. A floor or ceiling falls off toward the foot of a wall, a wall (sampled just off its face) toward the corner
      // it's in; a wall too toward the floor and the ceiling it meets. It takes the fill (the hemisphere) and the lamps' light (the
      // grid), not the real lights (a muzzle flash is a light in the room), and costs nothing more than the lookup already made.
      float lgao = 1.0;
      if (lgAo.x > 0.0) {
        float lgy = vLgP.y - (lgSize.w + lgf * lgFloorH) - lgAo.w; // (its height over the floor it's on)
        if (lgAo.z > 0.5) { // (the baked: js ambient occlusion above, the floor, the ceiling or the wall facing the way this one does)
          vec4 lga = texture2D(lgAoA, lguv), lgb = texture2D(lgAoB, lguv);
          float lgk = 1.0;
          if (lgn.y > 0.5) {
            // up: the floor at the floor; the top of a piece standing here at its height (the floor's was baked at the floor itself)
            float lgtop = lga.a * lgAo.y, lgtw = lgtop > 0.15 ? 1.0 - smoothstep(0.08, 0.3, abs(lgy - lgtop)) : 0.0;
            lgk = min(mix(lga.r, 1.0, smoothstep(0.06, 0.3, lgy)), mix(1.0, lga.b, lgtw));
          } else if (lgn.y < -0.5) {
            lgk = mix(lga.g, 1.0, smoothstep(0.06, 0.3, lgAo.y - lgy)); // (down: the ceiling, only at the ceiling)
          } else {
            float lgh = smoothstep(0.6, 1.8, lgy); // (a vertical surface: the nearer thing on its axis, knee height to above the head)
            lgk = abs(lgn.x) > abs(lgn.z) ? mix(lgb.r, lgb.b, lgh) : mix(lgb.g, lgb.a, lgh);
          }
          lgao = clamp(mix(1.0, lgk * lgk, lgAo.x), 0.0, 1.0);
        } else lgao = mix(1.0, smoothstep(0.4, 1.0, clamp(lgL.a, 0.0, 1.0)), 0.55 * lgAo.x); // (no bake: the floor plan's open share round the spot)
        if (abs(lgn.y) < 0.5) {
          lgao *= mix(1.0, 0.5 + 0.5 * smoothstep(0.0, 0.55, lgy), lgAo.x) * mix(1.0, 0.65 + 0.35 * smoothstep(0.0, 0.45, lgAo.y - lgy), lgAo.x);
        }
        #if defined( RE_IndirectDiffuse )
        irradiance *= lgao; // (the fill: the hemisphere's light, taken into reflectedLight just after this, in lights_fragment_end)
        #endif
      }
      float lgg = 1.0 - clamp(vOcc, 0.0, 1.0) * clamp(lgAo.x, 0.0, 1.0); // (a gun's own occlusion, js/gunao.ts: the fill and the grid's light)
      lgao *= lgg;
      #if defined( RE_IndirectDiffuse )
      irradiance *= lgg;
      #endif
      if (lgL.a > 0.02) {
        vec3 lgdir = lgD.rgb / lgL.a;
        float lgturn = clamp(0.5 + 0.5 * dot(lgn, lgdir), 0.0, 1.0);
        reflectedLight.directDiffuse += diffuseColor.rgb * (lgL.rgb / lgL.a) * lgturn * lgao;
      }
    }
    // (night vision's IR illuminator: a cone from the eye, soft-edged, out to about 18 m, on what faces it; what's behind a
    // wall isn't seen from the eye anyway, so no shadow's needed)
    if (lgNv.w > 0.0) {
      vec3 nvd = lgNv.xyz - vLgP; float nvr = max(length(nvd), 0.05), nvf = max(0.0, 1.0 - nvr / 18.0);
      float nvc = smoothstep(lgNvD.w, mix(lgNvD.w, 1.0, 0.5), dot(-nvd / nvr, lgNvD.xyz));
      reflectedLight.directDiffuse += diffuseColor.rgb * lgNv.w * nvc * nvf * nvf * clamp(dot(normalize(vLgN), nvd / nvr), 0.0, 1.0) / (1.0 + nvr * nvr) * (0.15 + 0.85 * smoothstep(0.5, 1.8, nvr)); // (the gun in your hands below the head-mounted lamp, mostly out of its beam)
    }
    #include <lights_fragment_end>
    { float lgg2 = 1.0 - clamp(vOcc, 0.0, 1.0) * clamp(lgAo.x, 0.0, 1.0); // (and what it reflects of the room, and the fill where there's no grid: a gun in the gunsmith)
      reflectedLight.indirectSpecular *= lgg2;
      #ifdef AO_DIRECT
      reflectedLight.directDiffuse *= lgg2;
      #endif
      if (lgGrid.w < 0.5) reflectedLight.indirectDiffuse *= lgg2; }`;
  function patch(shader: THREE.WebGLProgramParametersWithUniforms) {
    if (!shader.fragmentShader.includes('#include <lights_fragment_end>') || !shader.vertexShader.includes('#include <worldpos_vertex>')) return;
    Object.assign(shader.uniforms, U);
    shader.vertexShader = VS_HEAD + shader.vertexShader.replace('#include <worldpos_vertex>', '#include <worldpos_vertex>' + VS_BODY);
    shader.fragmentShader = FS_HEAD + shader.fragmentShader.replace('#include <color_fragment>', FS_PAINT).replace('#include <lights_fragment_end>', FS_BODY);
  }
  // (and a Lambert or Phong material takes nothing from the scene's environment, as in three r149: only a standard one did. three
  // now lights them by it too, and reflects it in them: the gun's scene has one for its metal (js/render.ts), and the hands and
  // the plastic in it would come out lit by the studio at night, as would the gunsmith's and the icons' pictures)
  const noEnv = (shader: THREE.WebGLProgramParametersWithUniforms) => { patch(shader); shader.vertexShader = '#undef USE_ENVMAP\n' + shader.vertexShader; shader.fragmentShader = '#undef USE_ENVMAP\n' + shader.fragmentShader; };
  T.MeshStandardMaterial.prototype.onBeforeCompile = patch;
  for (const C of [T.MeshLambertMaterial, T.MeshPhongMaterial]) C.prototype.onBeforeCompile = noEnv;
  // and anything can be shaded from a weapon light (js/render.ts), not only what's been told to
  Object.defineProperty(T.Mesh.prototype, 'receiveShadow', { get: () => true, set() {} });

  // ---- building it
  // (A lamp's colour is a tint of white, picked by eye: taken as written, not decoded from sRGB as a surface's is. Decoded,
  // a warm white's blue drops by a third and the room goes amber: js/util.ts.)
  // The doors. Everything's worked out with every opaque door shut (a glass one lets the light through either way),
  // and each door keeps a layer of its own: what reaches past it once it's open, and its own doorway, lit. As a door
  // swings, its layer's blended in by how far open it is: only the tiles it reaches change (on the CPU, the texture
  // sent again), and the shader's the same single lookup. (A line through two shut doors stays dark: a room two
  // doors away lights up only through what each door alone lets by.)
  //   sums per tile: light (RGB), where it comes from weighted by how bright (xyz), how bright (1), open (1)
  const K = 8;
  interface LgState { W: number; H: number; NF: number; NB: number; N: number; cur: Float32Array; hl: Uint16Array; hd: Uint16Array; tl: THREE.DataTexture; td: THREE.DataTexture; dirty: Set<number>; layers: ({ at: Int32Array; v: Float32Array } | null)[]; k: Float32Array }
  let G0: LgState | null = null; // { W, H, NF, N, cur (sums, K a tile), hl, hd (half floats sent), tl, td (textures), layers: [door id] -> { at, v } , k: [door id] -> how far open it counts }
  // build = compute + install. compute is the sums alone (no texture, nothing of the renderer's): it's most of what building a
  // level costs a screen (a second, for a cruiser), so it can be done ahead on another thread (js/prepworker.ts, js/prep.ts)
  // and handed over (map.lgPre), and then install is all that's left for the frame the level's put up in.
  interface LgData { W: number; H: number; NF: number; NB?: number; cur: Float32Array; layers: ({ at: Int32Array; v: Float32Array } | null)[]; bounces: number[]; ms: number; ao?: LgAo }
  function build(map: LvMap & { lightGridMs?: number; lightLayers?: number; lightBounces?: number[]; lgPre?: LgData | null }) {
    const floors = map.floors || [map], pre = map.lgPre; map.lgPre = null;
    const d = pre && pre.W === map.W && pre.H === map.H && pre.NF === floors.length && pre.NB === BANDS && pre.layers.length === (map.doors || []).length ? pre : compute(map);
    if (!d.ao) d.ao = bakeAO(map); // (a prep that came without one)
    install(map, d);
  }
  // ---- ambient occlusion, baked with the light: short rays from where a surface is, into the room, against the boxes that
  // are in it (the walls, floor to ceiling; every piece of furniture and prop, its footprint and the heights it fills), and
  // the share of them that meet something within a metre. The walls and the furniture are all boxes, so a ray is a few steps
  // over a fine grid (a third of a metre) and a lookup in each. Per cell of it, for the surfaces that could face the room:
  //   a: the floor (R), the ceiling (G), the top of a piece standing here (B) and its height (A, a share of the wall's)
  //   b: a vertical surface near on the x axis and the z axis, at knee height (R, G) and above the head (B, A)
  // each the hemisphere about the way that surface faces, 1 open .. 0 shut in (a byte). A vertical surface's is for the nearer of the
  // two on that axis (a wall or a piece of furniture, whichever the cell is nearest), itself, on the cell's side; the shader blends
  // the two heights by the surface's and adds how it nears the floor and the ceiling. The floor's is at its foot, the ceiling's at its,
  // a piece's top's at its top. A door counts as open (it moves). The cost is where something is near: most of a room's floor is clear
  // of everything, and is left alone (1).
  interface LgAo { AW: number; AH: number; a: Uint8Array; b: Uint8Array; ms: number }
  function bakeAO(map: LvMap): LgAo {
    const t0 = performance.now(), L = Level, TS = L.TS, floors = map.floors || [map], NF = floors.length, W = map.W, H = map.H, S = 3, AW = W * S, AH = H * S, s = TS / S, WH = L.WALL_H, AN = AW * AH; // (S: cells a tile a side: a fifth of a metre)
    const a = new Uint8Array(AN * NF * 4).fill(255), b = new Uint8Array(AN * NF * 4).fill(255);
    const R = 1.3, STEPS = [0.08, 0.2, 0.38, 0.6, 0.85, 1.15], NDIR = 20, hemi: number[][] = [];
    for (let i = 0; i < NDIR; i++) { const u = (i + 0.5) / NDIR, r = Math.sqrt(u), ph = i * 2.399963; hemi.push([r * Math.cos(ph), Math.sqrt(1 - u), r * Math.sin(ph)]); } // (cosine weighted about y)
    floors.forEach((fm: LvMap, f: number) => {
      const t = fm.t, lo = new Float32Array(AN).fill(Infinity), hi = new Float32Array(AN).fill(-Infinity), near = new Uint8Array(AN);
      const fill = (x0: number, x1: number, z0: number, z1: number, y0: number, y1: number) => {
        for (let z = Math.max(0, z0); z <= Math.min(AH - 1, z1); z++) for (let x = Math.max(0, x0); x <= Math.min(AW - 1, x1); x++) { const k = z * AW + x; if (y0 < lo[k]) lo[k] = y0; if (y1 > hi[k]) hi[k] = y1; }
      };
      for (let z = 0; z < H; z++) for (let x = 0; x < W; x++) if (t[z * W + x] === 1) fill(x * S, x * S + S - 1, z * S, z * S + S - 1, 0, WH);
      const props: Iterable<LvProp> = (fm as any).propList || (fm.props ? new Set(fm.props.values()) : []);
      for (const p of props) for (const bx of p.boxes) fill(Math.floor((bx.cx - bx.hx) / s), Math.floor((bx.cx + bx.hx - 1e-4) / s), Math.floor((bx.cz - bx.hz) / s), Math.floor((bx.cz + bx.hz - 1e-4) / s), bx.y0, bx.h);
      // where something is within about 1.4 m: what's farther has nothing to be shut in by
      const RN = Math.ceil(1.4 / s);
      for (let z = 0; z < AH; z++) for (let x = 0; x < AW; x++) if (hi[z * AW + x] >= 0) for (let dz = -RN; dz <= RN; dz++) for (let dx = -RN; dx <= RN; dx++) { const xx = x + dx, zz = z + dz; if (xx >= 0 && zz >= 0 && xx < AW && zz < AH) near[zz * AW + xx] = 1; }
      const solid = (x: number, y: number, z: number) => { const ix = Math.floor(x / s), iz = Math.floor(z / s); if (ix < 0 || iz < 0 || ix >= AW || iz >= AH) return false; const k = iz * AW + ix; return y >= lo[k] && y <= hi[k]; };
      // the hemisphere about the axis n (one of +-x, +-y, +-z), from (px, py, pz): 1 nothing near .. 0 shut in
      const open = (px: number, py: number, pz: number, nx: number, ny: number, nz: number) => {
        let sum = 0;
        for (let i = 0; i < NDIR; i++) {
          const h = hemi[i];
          const dx = ny ? h[0] : nx ? nx * h[1] : h[0], dy = ny ? ny * h[1] : nx ? h[0] : h[2], dz = ny ? h[2] : nx ? h[2] : nz * h[1];
          for (const d of STEPS) { if (solid(px + dx * d, py + dy * d, pz + dz * d)) { sum += 1 - d / R; break; } }
        }
        return 1 - sum / NDIR;
      };
      const base = f * AN * 4, HS = [0.6, 1.8];
      for (let z = 0; z < AH; z++) for (let x = 0; x < AW; x++) {
        const k = z * AW + x, o = base + k * 4, cx = (x + 0.5) * s, cz = (z + 0.5) * s;
        if (!near[k]) continue;
        // the top of a piece standing here (a counter, a table, a crate, a shelving unit): the surface up on it, a hemisphere up from there
        if (hi[k] >= 0.15 && hi[k] < WH - 0.2) { a[o + 2] = Math.round(255 * open(cx, hi[k] + 0.03, cz, 0, 1, 0)); a[o + 3] = Math.round(255 * hi[k] / WH); }
        if (hi[k] >= 0 && lo[k] <= 0.05 && hi[k] >= 0.05) { a[o] = 70; a[o + 1] = 255; continue; } // (inside a wall, or a piece standing on the floor)
        a[o] = Math.round(255 * open(cx, 0.04, cz, 0, 1, 0)); // the floor
        a[o + 1] = Math.round(255 * open(cx, WH - 0.04, cz, 0, -1, 0)); // the ceiling
        // a vertical surface near on this axis (a wall, a piece of furniture) at this height: the nearer of the two sides within 0.7 m, the surface
        // itself, a hemisphere out from it. (A surface looking at this cell from its own side is the nearest on its axis: it's sampled just off its face)
        const wall = (h: number, ax: number) => {
          let best = 9, v = 255;
          for (const sg of [1, -1]) {
            const dx = ax === 0 ? sg : 0, dz = ax === 1 ? sg : 0;
            for (let d = 0.07; d <= 0.7 && d < best; d += 0.07) if (solid(cx - dx * d, h, cz - dz * d)) { best = d; v = Math.round(255 * open(cx - dx * (d - 0.02), h, cz - dz * (d - 0.02), dx, 0, dz)); break; }
          }
          return v;
        };
        b[o] = wall(HS[0], 0); b[o + 1] = wall(HS[0], 1); b[o + 2] = wall(HS[1], 0); b[o + 3] = wall(HS[1], 1);
      }
    });
    return { AW, AH, a, b, ms: Math.round(performance.now() - t0) };
  }


  // Height. The grid is a floor plan, so one value a tile would be the same from floor to ceiling: a fridge, a shelving unit or a
  // pillar lit as bare floor all the way up, lamps hung high lighting what's at the foot of a wall as much as what's at the top.
  // So each floor is BANDS slabs (a metre each, BAND0 the first one's middle: 0.5, 1.5, 2.5, 3.5 m up), each worked out as the
  // whole floor was: its own solid (the walls, and every piece of furniture that fills some of its height: a counter is solid in
  // the lower bands and open above it, a fridge in the lower three), the lamps at their own heights (the light a point in the slab
  // would take: nearer a lamp's height, brighter), the light stopped by what stands in the slab and bounced round it. A surface takes
  // the two slabs its height is between, by how far between. Each is a layer of the textures, floor by floor and band by band.
  // BANDS 1 is the grid as it was: one layer a floor, a point a metre up, only the walls (and windows) in its way, furniture not in the light at all.
  // 4 is the layers described above: 3.5 to 6 times the bake (an apartment 7.5 s, a festival 3.6 s), 4 times the light textures, furniture throwing
  // shadow and not lit as bare floor. Off for now; the ambient occlusion (below) has the furniture in it either way.
  const BANDS = 1, BAND0 = BANDS === 1 ? 1.0 : 0.5, BANDH = 1.0;

  // What stands on each tile, by height: from its lowest to its highest (a wall: all of it, a window's glass too (the light goes
  // through it, below)), as a lamp's line of sight meets it. A line from a lamp high up to a tile on the floor passes over a
  // shelf, under a lamp's own bracket, and the check on it is whether the line is at a height where something is.
  function heightMap(fm: LvMap, W: number, H: number): { top: Float32Array; bot: Float32Array } {
    const TS = Level.TS, N = W * H, top = new Float32Array(N).fill(-1), bot = new Float32Array(N).fill(1e9), cover = new Float32Array(N), t = fm.t;
    for (let i = 0; i < N; i++) if (t[i] === 1) { top[i] = 1e9; bot[i] = -1; }
    const props: Iterable<LvProp> = (fm as any).propList || (fm.props ? new Set(fm.props.values()) : []);
    for (const p of props) for (const bx of p.boxes) {
      if (bx.walk || BANDS === 1) continue;
      for (let z = Math.max(0, Math.floor((bx.cz - bx.hz) / TS)); z <= Math.min(H - 1, Math.floor((bx.cz + bx.hz) / TS)); z++) for (let x = Math.max(0, Math.floor((bx.cx - bx.hx) / TS)); x <= Math.min(W - 1, Math.floor((bx.cx + bx.hx) / TS)); x++) {
        const i = z * W + x, ox = Math.min((x + 1) * TS, bx.cx + bx.hx) - Math.max(x * TS, bx.cx - bx.hx), oz = Math.min((z + 1) * TS, bx.cz + bx.hz) - Math.max(z * TS, bx.cz - bx.hz);
        if (ox <= 0 || oz <= 0 || t[i] === 1) continue;
        const c = ox * oz / (TS * TS);
        if (c >= 0.4) { if (bx.h > top[i]) top[i] = bx.h; if (bx.y0 < bot[i]) bot[i] = bx.y0; }
        cover[i] += c;
      }
    }
    return { top, bot };
  }
  function bandSolid(fm: LvMap, b: number, W: number, H: number): Uint8Array {
    if (BANDS === 1) return Uint8Array.from(fm.t as ArrayLike<number>);
    const TS = Level.TS, t = Uint8Array.from(fm.t as ArrayLike<number>), cover = new Float32Array(W * H), lo = b * BANDH, hi = lo + BANDH, props: Iterable<LvProp> = (fm as any).propList || (fm.props ? new Set(fm.props.values()) : []);
    for (const p of props) for (const bx of p.boxes) {
      if (bx.walk || Math.min(bx.h, hi) - Math.max(bx.y0, lo) < 0.4) continue; // (fills 40 cm of the slab at least)
      for (let z = Math.max(0, Math.floor((bx.cz - bx.hz) / TS)); z <= Math.min(H - 1, Math.floor((bx.cz + bx.hz) / TS)); z++) for (let x = Math.max(0, Math.floor((bx.cx - bx.hx) / TS)); x <= Math.min(W - 1, Math.floor((bx.cx + bx.hx) / TS)); x++) {
        const ox = Math.min((x + 1) * TS, bx.cx + bx.hx) - Math.max(x * TS, bx.cx - bx.hx), oz = Math.min((z + 1) * TS, bx.cz + bx.hz) - Math.max(z * TS, bx.cz - bx.hz);
        if (ox > 0 && oz > 0) cover[z * W + x] += ox * oz / (TS * TS);
      }
    }
    for (let i = 0; i < W * H; i++) if (cover[i] >= 0.4 && t[i] === 0) t[i] = 1; // (a piece that covers a good part of a tile)
    return t;
  }
  function compute(map: LvMap): LgData {
    const L = Level, TS = L.TS, floors = map.floors || [map], NF = floors.length, W = map.W, H = map.H, N = W * H;
    const col = new T.Color(), DECAY = 1.6, t0 = performance.now();
    const cur = new Float32Array(N * NF * BANDS * K), doors = map.doors || [], layers: (Map<number, Float32Array> | null)[] = doors.map(() => null), shutAt: Map<number, LvDoor>[] = [], winAt: Set<number>[] = [];
    // the sky: the theme's fill (as js/render.ts had it everywhere), on what's open to it (not the hangar's: its
    // daylight stays the flat fill)
    const th = map.theme || {}, skyI = th.hub ? 0 : (th.hemiI || 0.26) ** 2 * opts.sky, skyHex = th.hemi || th.light || 0xffffff;
    const heights: { top: Float32Array; bot: Float32Array }[] = [];
    const shutOf = (d: LvDoor) => d.kind !== 'stair'; // (a glass one: the light goes through it)
    for (let vf = 0; vf < NF * BANDS; vf++) { // (a floor and a band of it: the slab's layer)
      const f = (vf / BANDS) | 0, bd = vf % BANDS, fm = floors[f], hb = BAND0 + bd * BANDH;
      const t = bandSolid(fm, bd, W, H), hm = heights[f] || (heights[f] = heightMap(fm, W, H)), fy = fm.fy || 0, base = vf * N;
      const doorAt = new Map<number, LvDoor>(); // (this floor's shut doorway cells)
      for (const d of doors) if ((d.fl || 0) === f && shutOf(d)) for (const c of d.cells || [d.i]) doorAt.set(c, d);
      shutAt[f] = doorAt;
      // its windows' cells: glass, the light goes through (they're wall to everything else)
      const win = new Set<number>(); winAt[f] = win;
      for (const w of map.windows || []) if ((w.fl || 0) === f) for (const c of w.cells) win.add(c);
      for (let i = 0; i < N; i++) if (t[i] !== 1 && !doorAt.has(i)) cur[(base + i) * K + 7] = 1; // (open: a doorway's open only with its door)
      const lamps = (map.lamps || []).filter((l: LvLight) => (map.floors ? (l.fl || 0) === f : true));
      const into = (d: LvDoor | null, gi: number, a: number, dx: number, dy: number, dz: number, lum: number) => {
        let o: Float32Array | undefined;
        if (d) { const ly = layers[d.id] || (layers[d.id] = new Map()); o = ly.get(gi); if (!o) { o = new Float32Array(K); ly.set(gi, o); } } else o = cur.subarray(gi * K, gi * K + K);
        o[0] += col.r * a; o[1] += col.g * a; o[2] += col.b * a; o[3] += dx * lum; o[4] += dy * lum; o[5] += dz * lum; o[6] += lum;
      };
      for (const l of lamps) {
        col.setHex(l.color!, T.LinearSRGBColorSpace); const k = l.i!, ly = l.y! - fy, r = l.d!;
        const x0 = Math.max(0, Math.floor((l.x - r) / TS)), x1 = Math.min(W - 1, Math.floor((l.x + r) / TS));
        const z0 = Math.max(0, Math.floor((l.z - r) / TS)), z1 = Math.min(H - 1, Math.floor((l.z + r) / TS));
        for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) {
          const i = z * W + x;
          if (t[i] === 1) continue;
          const cx = (x + 0.5) * TS, cz = (z + 0.5) * TS, dx = l.x - cx, dy = ly - hb, dz = l.z - cz, d = Math.hypot(dx, dy, dz);
          if (d >= r) continue;
          // a line from the lamp to the tile: through no wall (it may start in one: a lantern on a wall), and through
          // at most one shut door (then it's that door's light). A doorway itself is lit by its own door's opening.
          const own = doorAt.get(i), flat = Math.hypot(dx, dz), steps = Math.ceil(flat / (TS * 0.4));
          let blocked = false, via = own || null;
          for (let s = 1; s < steps && !blocked; s++) {
            const u = s / steps, along = flat * (1 - u);
            if (along < 0.35) continue;
            const j = Math.floor((cz + dz * u) / TS) * W + Math.floor((cx + dx * u) / TS);
            if (j === i) continue;
            const ry = hb + dy * u; // (the line's height here)
            if (!win.has(j) && hm.top[j] >= ry && hm.bot[j] <= ry) { blocked = true; break; }
            const dd = doorAt.get(j);
            if (dd && dd !== via) { if (via) blocked = true; else via = dd; }
          }
          if (blocked) continue;
          const a = Math.pow(1 - d / r, DECAY) * k;
          into(via, base + i, a, dx / d, dy / d, dz / d, a * (col.r + col.g + col.b) / 3);
        }
      }
      // the sky: straight down on whatever's open to it; through an outside window (the city's glow), onto the room's
      // side of it, from the window
      if (skyI > 0) {
        col.setHex(skyHex, T.LinearSRGBColorSpace); const lum = (col.r + col.g + col.b) / 3;
        if (fm.out) for (let i = 0; i < N; i++) if (fm.out[i] && t[i] !== 1 && !doorAt.has(i)) into(null, base + i, skyI, 0, 1, 0, skyI * lum);
        for (const w of map.windows || []) if ((w.fl || 0) === f && w.ext) for (const c of w.cells) {
          const r = c - w.nx - w.nz * W;
          if (r >= 0 && r < N && t[r] !== 1) into(null, base + r, skyI * 0.6, w.nx * 0.8, 0.6, w.nz * 0.8, skyI * 0.6 * lum);
        }
        // and carried on in: through an open doorway, a garage door, an outside window, the sky's light reaches some way into
        // the building, less with every tile (SPILL: how far, in tiles; SPILL_K: the first tile in's share of the sky's), from
        // the way it came in, round no wall and through no shut door. Without it a doorway's the edge of the dark, one tile wide
        // (sharpest at night, where the goggles' gain finds it)
        if (fm.out) {
          const R = opts.spill, dist = new Int16Array(N).fill(-1), dir = new Float32Array(N * 2), q: number[] = [];
          for (let i = 0; i < N; i++) if (fm.out[i] && t[i] !== 1 && !doorAt.has(i)) { dist[i] = 0; q.push(i); }
          for (const w of map.windows || []) if ((w.fl || 0) === f && w.ext) for (const c of w.cells) {
            const r = c - w.nx - w.nz * W;
            if (r >= 0 && r < N && t[r] !== 1 && dist[r] < 0 && !fm.out[r]) { dist[r] = 1; dir[r * 2] = w.nx; dir[r * 2 + 1] = w.nz; q.push(r); }
          }
          for (let h = 0; h < q.length; h++) {
            const i = q[h], d = dist[i]; if (d >= R) continue;
            const x = i % W, z = (i / W) | 0;
            for (const [ox, oz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
              const nx = x + ox, nz = z + oz; if (nx < 0 || nz < 0 || nx >= W || nz >= H) continue;
              const j = nz * W + nx;
              if (dist[j] >= 0 || t[j] === 1 || doorAt.has(j) || fm.out[j]) continue;
              dist[j] = d + 1; dir[j * 2] = d === 0 ? -ox : dir[i * 2]; dir[j * 2 + 1] = d === 0 ? -oz : dir[i * 2 + 1]; q.push(j);
              const a = skyI * opts.spillK * Math.pow(1 - (d + 1) / (R + 1), 1.6);
              into(null, base + j, a, dir[j * 2] * 0.6, 0.5, dir[j * 2 + 1] * 0.6, a * lum);
            }
          }
        }
      }
      // a doorway's open weight comes with its door
      for (const [c, d] of doorAt) { const ly = layers[d.id] || (layers[d.id] = new Map()); let o = ly.get(base + c); if (!o) { o = new Float32Array(K); ly.set(base + c, o); } o[7] = 1; }
    }
    // ---- the light that bounces: off the floor, the walls, the ceiling, back into the room. The light is spread over
    // the open floor round it, stopped by walls and shut doors as the light was (through glass: a window's cells pass
    // it on, though nothing's lit in them) (a few dozen passes of each open tile taking the average of itself and its
    // open neighbours: a blur that stays in the room), turned the colour of the room (RHO: the theme's floor, walls and
    // ceiling, what each reflects), BOUNCE of that added back, and that spread and added again (BOUNCES: each goes
    // further, round corners, down a corridor). It comes mostly up off the floor (UP: so the ceiling, which no lamp
    // hanging from it lights, gets the most of it, the walls half, the floor least).
    //   A door's layer is what it changes, open: everything round it (the base's light and its own) bounced with its
    // doorway open, less the base's bounced with it shut (a dark room next to a lit one gets the lit one's glow through
    // the door, the street's sky comes in; the lit room loses a little out of it).
    //   Open to the sky, most of it goes up and away (OUTB of it stays).
    // (REACH: how far round a door its layer's worked out. Each pass of the spread moves the light about a tile at most, but
    // on average much less: it spreads as a random walk does, a standard deviation of sqrt(2/3 passes) tiles down a corridor
    // (less in a room). Out to opts.reach of those, past which what's left is nothing to see; and never more than a tile a pass.)
    const BOUNCE = opts.bounce, NB = opts.bounces, PASSES = 28, UP = 0.6, OUTB = 0.3;
    const reachOf = (nb: number) => Math.min(PASSES * nb, opts.reach > 0 ? Math.ceil(opts.reach * Math.sqrt(PASSES * nb * 2 / 3)) : Infinity);
    // (what the room reflects: its colour, half as strong as the paint's (a beige corridor doesn't go yellow), and how
    // much, the square root of the paint's (its textures darken it, and the furniture in it's lighter than a foundry's
    // floor): a pale room's about 0.45 a bounce, at most 0.5, a dark one's 0.3)
    const RHO = (() => {
      const c = new T.Color(), out = [0, 0, 0];
      for (const [hex, k] of [[th.floor, 0.45], [th.wall, 0.4], [th.ceil, 0.15]] as [string, number][]) { c.set(hex || '#808080'); out[0] += c.r * k; out[1] += c.g * k; out[2] += c.b * k; }
      const m = (out[0] + out[1] + out[2]) / 3 || 1, mag = Math.min(0.5, Math.sqrt(m * 0.25) * BOUNCE);
      return out.map((v) => mag * (0.5 + 0.5 * v / m));
    })();
    // open: 1 a tile the light spreads over, a bw x bh box of them
    const spread = (src: Float32Array, open: ArrayLike<number>, bw: number, bh: number) => { // src: RGB+lum a tile (4), over the box (left as it is)
      let a = Float32Array.from(src), b = new Float32Array(a.length);
      for (let pass = 0; pass < PASSES; pass++) {
        for (let z = 0, i = 0; z < bh; z++) for (let x = 0; x < bw; x++, i++) {
          const o = i * 4;
          if (!open[i]) { b[o] = b[o + 1] = b[o + 2] = b[o + 3] = 0; continue; }
          let n = 1, r = a[o], g = a[o + 1], bl = a[o + 2], l = a[o + 3];
          if (x > 0 && open[i - 1]) { const q = o - 4; r += a[q]; g += a[q + 1]; bl += a[q + 2]; l += a[q + 3]; n++; }
          if (x < bw - 1 && open[i + 1]) { const q = o + 4; r += a[q]; g += a[q + 1]; bl += a[q + 2]; l += a[q + 3]; n++; }
          if (z > 0 && open[i - bw]) { const q = o - bw * 4; r += a[q]; g += a[q + 1]; bl += a[q + 2]; l += a[q + 3]; n++; }
          if (z < bh - 1 && open[i + bw]) { const q = o + bw * 4; r += a[q]; g += a[q + 1]; bl += a[q + 2]; l += a[q + 3]; n++; }
          const k = 1 / n; b[o] = r * k; b[o + 1] = g * k; b[o + 2] = bl * k; b[o + 3] = l * k;
        }
        [a, b] = [b, a];
      }
      return a;
    };
    // (nb: that many bounces; or, left out, as many as change anything: until the last one added no tile more than
    // opts.settle of the light it has (a little light counted as more, so a near-black corner doesn't keep it going),
    // at most NB. A pale room's light goes round more times before it's spent than a dark one's.)
    const bounced = (src: Float32Array, open: ArrayLike<number>, bw: number, bh: number, nb?: number) => {
      const acc = new Float32Array(src.length);
      let s = src, n = 0;
      while (n < (nb || NB)) {
        s = spread(s, open, bw, bh); n++;
        let most = 0;
        for (let q = 0; q < s.length; q += 4) {
          s[q] *= RHO[0]; s[q + 1] *= RHO[1]; s[q + 2] *= RHO[2]; s[q + 3] = (s[q] + s[q + 1] + s[q + 2]) / 3; acc[q] += s[q]; acc[q + 1] += s[q + 1]; acc[q + 2] += s[q + 2]; acc[q + 3] += s[q + 3];
          if (!nb && s[q + 3] > 1e-4) { const k = s[q + 3] / (src[q + 3] + acc[q + 3] + 0.005); if (k > most) most = k; }
        }
        if (!nb && n >= 2 && most < opts.settle) break;
      }
      return { acc, n };
    };
    const bouncesUsed: number[] = [];
    for (let vf = 0; vf < NF * BANDS; vf++) {
      const f = (vf / BANDS) | 0, fm = floors[f], base = vf * N, win = winAt[f], out0 = fm.out;
      // (takes light: open floor; passes it on, the doors shut: that, or glass)
      const lit = new Uint8Array(N), shut = new Uint8Array(N);
      for (let i = 0; i < N; i++) { lit[i] = cur[(base + i) * K + 7] > 0.5 ? 1 : 0; shut[i] = lit[i] || win.has(i) ? 1 : 0; }
      const keep = (i: number) => (out0 && out0[i] ? OUTB : 1);
      // the base: everything with the doors shut
      const src = new Float32Array(N * 4);
      for (let i = 0; i < N; i++) { const o = (base + i) * K; src[i * 4] = cur[o]; src[i * 4 + 1] = cur[o + 1]; src[i * 4 + 2] = cur[o + 2]; src[i * 4 + 3] = cur[o + 6]; }
      // (the doors' layers go round as many times as the floor's light did)
      const { acc: out, n: nf } = bounced(src, shut, W, H), REACH = reachOf(nf);
      bouncesUsed.push(nf);
      // each door's (worked out before the base's bounce goes in: from the light as it came off the lamps and the sky)
      doors.forEach((d: LvDoor) => {
        const ly = layers[d.id];
        if (!ly || (d.fl || 0) !== f) return;
        let x0 = W, z0 = H, x1 = 0, z1 = 0;
        for (const gi of ly.keys()) { if (gi < base || gi >= base + N) continue; const i = gi - base, x = i % W, z = (i / W) | 0; if (x < x0) x0 = x; if (x > x1) x1 = x; if (z < z0) z0 = z; if (z > z1) z1 = z; }
        x0 = Math.max(0, x0 - REACH); z0 = Math.max(0, z0 - REACH); x1 = Math.min(W - 1, x1 + REACH); z1 = Math.min(H - 1, z1 + REACH);
        const bw = x1 - x0 + 1, bh = z1 - z0 + 1, sb = new Float32Array(bw * bh * 4), ms = new Uint8Array(bw * bh);
        for (let z = z0, j = 0; z <= z1; z++) for (let x = x0; x <= x1; x++, j++) { const q = j * 4, i = z * W + x, p = i * 4; sb[q] = src[p]; sb[q + 1] = src[p + 1]; sb[q + 2] = src[p + 2]; sb[q + 3] = src[p + 3]; ms[j] = shut[i]; }
        const so = Float32Array.from(sb), mo = Uint8Array.from(ms);
        for (const [gi, o] of ly) { if (gi < base || gi >= base + N) continue; const i = gi - base, q = ((((i / W) | 0) - z0) * bw + (i % W) - x0) * 4; so[q] += o[0]; so[q + 1] += o[1]; so[q + 2] += o[2]; so[q + 3] += o[6]; }
        for (const c of d.cells || [d.i]) { const x = c % W, z = (c / W) | 0; if (x >= x0 && x <= x1 && z >= z0 && z <= z1) mo[(z - z0) * bw + x - x0] = 1; }
        const rOpen = bounced(so, mo, bw, bh, nf).acc, rShut = bounced(sb, ms, bw, bh, nf).acc;
        for (let z = z0, j = 0; z <= z1; z++) for (let x = x0; x <= x1; x++, j++) {
          const q = j * 4, i = z * W + x;
          if (!(lit[i] || (mo[j] && !ms[j] && !win.has(i)))) continue;
          const k = keep(i), dl = (rOpen[q + 3] - rShut[q + 3]) * k;
          if (Math.abs(dl) < 1e-5) continue;
          const gi = base + i; let o = ly.get(gi); if (!o) { o = new Float32Array(K); ly.set(gi, o); }
          o[0] += (rOpen[q] - rShut[q]) * k; o[1] += (rOpen[q + 1] - rShut[q + 1]) * k; o[2] += (rOpen[q + 2] - rShut[q + 2]) * k; o[4] -= dl * UP; o[6] += dl;
        }
      });
      for (let i = 0; i < N; i++) { const o = (base + i) * K, k = keep(i); if (!lit[i]) continue; cur[o] += out[i * 4] * k; cur[o + 1] += out[i * 4 + 1] * k; cur[o + 2] += out[i * 4 + 2] * k; cur[o + 4] -= out[i * 4 + 3] * UP * k; cur[o + 6] += out[i * 4 + 3] * k; }
    }
    const ao = bakeAO(map);
    return { W, H, NF, NB: BANDS, cur, bounces: bouncesUsed, ms: Math.round(performance.now() - t0), ao,
      layers: layers.map((ly) => { if (!ly) return null; const at = Int32Array.from(ly.keys()), v = new Float32Array(at.length * K); let n = 0; for (const o of ly.values()) v.set(o, K * n++); return { at, v }; }) };
  }
  function install(map: LvMap & { lightGridMs?: number; lightLayers?: number; lightBounces?: number[] }, d: LgData) {
    const L = Level, TS = L.TS, floors = map.floors || [map], doors = map.doors || [], { W, H, NF, cur } = d, N = W * H;
    dispose();
    const tex = (data: Uint16Array) => {
      const tx = new T.DataTexture(data as Uint16Array<ArrayBuffer>, W, H * NF * BANDS, T.RGBAFormat, T.HalfFloatType);
      tx.magFilter = tx.minFilter = T.LinearFilter; tx.wrapS = tx.wrapT = T.ClampToEdgeWrapping; tx.generateMipmaps = false; tx.needsUpdate = true;
      return tx;
    };
    const hl = new Uint16Array(N * NF * BANDS * 4), hd = new Uint16Array(N * NF * BANDS * 4);
    G0 = { W, H, NF, NB: BANDS, N, cur, hl, hd, tl: tex(hl), td: tex(hd), dirty: new Set(), layers: d.layers, k: new Float32Array(doors.length) };
    for (let gi = 0; gi < N * NF * BANDS; gi++) write(gi);
    doors.forEach((d: LvDoor, i: number) => setDoor(i, d.open ? 1 : 0));
    flush();
    U.lgLight.value = G0.tl; U.lgDir.value = G0.td;
    U.lgPaint.value = Homes.paint(map) || blank;
    if (d.ao) {
      const aoTex = (data: Uint8Array) => { const tx = new T.DataTexture(data as Uint8Array<ArrayBuffer>, d.ao!.AW, d.ao!.AH * NF, T.RGBAFormat, T.UnsignedByteType); tx.magFilter = tx.minFilter = T.LinearFilter; tx.wrapS = tx.wrapT = T.ClampToEdgeWrapping; tx.generateMipmaps = false; tx.needsUpdate = true; return tx; };
      U.lgAoA.value = aoTex(d.ao.a); U.lgAoB.value = aoTex(d.ao.b); U.lgAo.value.z = 1; U.lgAo.value.w = L.FLOOR_H - L.WALL_H - 0.02; U.lgAo.value.y = L.WALL_H; // (w: the layer's start is this far under the floor)
      (map as any).aoBakeMs = d.ao.ms;
    }
    U.lgGrid.value.set(0, 0, TS, 0);
    // a floor's layer: from just under its floor (the slab's edge round a drop) to just over its ceiling. (Not
    // higher: the top of a room's walls and its ceiling took the light of the floor above, and flickered with it.)
    U.lgBand.value.set(BANDS, BAND0, BANDH, 0);
    U.lgSize.value.set(W, H, NF, (floors[0].fy || 0) - (L.FLOOR_H - L.WALL_H) + 0.02);
    U.lgFloorH.value = L.FLOOR_H;
    built = true;
    map.lightGridMs = d.ms;
    map.lightLayers = G0.layers.filter(Boolean).length;
    map.lightBounces = d.bounces;
  }
  // a tile's sums, to what the textures hold: the light and its direction, premultiplied by how open the tile is
  // (so the texture's filtering averages only open tiles: the shader divides by it)
  const h = T.DataUtils.toHalfFloat;
  function write(gi: number) {
    const c = G0!.cur, o = gi * K, w = Math.max(0, Math.min(1, c[o + 7])), s = c[o + 6] > 1e-6 ? w / c[o + 6] : 0, q = gi * 4;
    G0!.hl[q] = h(Math.max(0, c[o]) * w); G0!.hl[q + 1] = h(Math.max(0, c[o + 1]) * w); G0!.hl[q + 2] = h(Math.max(0, c[o + 2]) * w); G0!.hl[q + 3] = h(w); // (a door's layer can take light away: never below none)
    G0!.hd[q] = h(c[o + 3] * s); G0!.hd[q + 1] = h(c[o + 4] * s); G0!.hd[q + 2] = h(c[o + 5] * s); G0!.hd[q + 3] = h(w);
  }
  // how far a door's open (0 shut .. 1): its layer goes in by as much (Game.updateDoors, each frame)
  function setDoor(id: number, k: number) {
    const ly = G0 && G0.layers[id];
    if (!ly) return;
    const dk = k - G0!.k[id];
    if (Math.abs(dk) < 0.004 && !((k === 0 || k === 1) && dk)) return;
    G0!.k[id] = k;
    const c = G0!.cur, v = ly.v;
    for (let n = 0; n < ly.at.length; n++) { const o = ly.at[n] * K; for (let e = 0; e < K; e++) c[o + e] += dk * v[n * K + e]; G0!.dirty.add(ly.at[n]); }
  }
  // what changed this frame, to the textures
  function flush() {
    if (!G0 || !G0.dirty.size) return;
    for (const gi of G0.dirty) write(gi);
    G0.dirty.clear();
    G0.tl.needsUpdate = G0.td.needsUpdate = true;
  }
  function dispose() {
    if (held) { for (const t of [...held.cpu, ...held.gpu]) if (t && t !== blank) t.dispose(); held = null; }
    for (const k of ['lgLight', 'lgDir', 'lgPaint', 'lgAoA', 'lgAoB'] as const) if (U[k].value !== blank) { U[k].value.dispose(); U[k].value = blank; }
    U.lgAo.value.z = 0;
    G0 = null; built = false;
  }
  // The light at a point (x, y, z in metres), as a surface there would take it facing every way at once: the four tiles
  // round it blended as the texture's filtering does (only the open ones), from the layer of the floor it's on. Into out
  // (linear RGB); black with no grid. Spread: averaged over a square that wide round it too (a body's width: standing in
  // a doorway, the rooms either side). (For what has no place in the grid: the gun in your hands, js/render.ts eyeLight.)
  function at(x: number, y: number, z: number, out: THREE.Color, spread = 0) {
    out.setRGB(0, 0, 0);
    if (!G0) return out;
    const TS = U.lgGrid.value.z, { W, H, NF, NB, N, cur } = G0, s = spread / 2;
    const f = Math.max(0, Math.min(NF - 1, Math.floor((y - U.lgSize.value.w) / U.lgFloorH.value)));
    const bp = Math.max(0, Math.min(NB - 1, (y - (U.lgSize.value.w + f * U.lgFloorH.value) - U.lgAo.value.w - BAND0) / BANDH)), b0 = Math.floor(bp), bf = bp - b0, b1 = Math.min(b0 + 1, NB - 1);
    let r = 0, g = 0, b = 0, w = 0;
    for (let q = 0; q < (s > 0 ? 4 : 1); q++) {
      const u = (x + (s > 0 ? ((q & 1) ? s : -s) : 0)) / TS - 0.5, v = Math.max(0, Math.min(H - 1, (z + (s > 0 ? ((q >> 1) ? s : -s) : 0)) / TS - 0.5));
      const x0 = Math.floor(u), z0 = Math.floor(v), fx = u - x0, fz = v - z0;
      for (let k = 0; k < 4; k++) {
        const tx = Math.max(0, Math.min(W - 1, x0 + (k & 1))), tz = Math.max(0, Math.min(H - 1, z0 + (k >> 1)));
        for (const [bb, bk] of [[b0, 1 - bf], [b1, bf]] as [number, number][]) {
          if (bk <= 0) continue;
          const o = ((f * NB + bb) * N + tz * W + tx) * K, ow = Math.max(0, Math.min(1, cur[o + 7])) * ((k & 1) ? fx : 1 - fx) * ((k >> 1) ? fz : 1 - fz) * bk;
          r += Math.max(0, cur[o]) * ow; g += Math.max(0, cur[o + 1]) * ow; b += Math.max(0, cur[o + 2]) * ow; w += ow;
        }
      }
    }
    if (w > 0.02) out.setRGB(r / w, g / w, b / w);
    return out;
  }
  // on while the level's drawn (R.render), off for anything else drawn with the same materials
  const on = (v: boolean) => { U.lgGrid.value.w = v && built ? 1 : 0; };
  // the occlusion baked on the GPU in place of the box bake's (js/gpuao.ts): its textures, which the grid then holds and lets go of
  // (the box bake's are kept beside them, for swapAo: to see the two on the same level)
  let held: { cpu: any[]; gpu: any[] } | null = null;
  function useGpuAo(a: THREE.Texture, b: THREE.Texture) {
    held = { cpu: [U.lgAoA.value, U.lgAoB.value], gpu: [a, b] };
    U.lgAoA.value = a as any; U.lgAoB.value = b as any; U.lgAo.value.z = 1; U.lgAo.value.w = Level.FLOOR_H - Level.WALL_H - 0.02; U.lgAo.value.y = Level.WALL_H;
  }
  function swapAo(gpu: boolean) { if (!held) return false; const [a, b] = gpu ? held.gpu : held.cpu; U.lgAoA.value = a; U.lgAoB.value = b; return true; }
  return { build, compute, dispose, on, at, useGpuAo, swapAo, setDoor: (id: number, k: number) => { if (built) setDoor(id, k); }, flush, U, opts, get built() { return built; }, get layers() { return G0 && G0.layers; } };
})();
