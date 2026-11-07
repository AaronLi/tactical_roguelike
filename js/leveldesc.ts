'use strict';
// The level as data (docs/level-data.md): one plain object, JSON as it stands, made from (seed, level, theme, night) and
// nothing else, the same on the host's simulation (its own thread: js/serverworker.ts) and on every screen, and what the Rust
// port reads. describe(map) makes it from the map the generator planned (js/level.ts); nothing here touches three.js:
//   the grid: each floor's tiles, what's open to the sky, the catwalks' grating, the rolling ground;
//   the doors, windows (and glass doors' and railings' panes), stairs and railings, as they're placed and as they start;
//   the lamps the light grid lights the level with, and the sky's share of it;
//   where you come in, where suspects can start, what's furniture (the pieces as placed: their own shapes are js/furniture.ts');
//   the solids: everything rays, sight and feet meet, as js/world.ts takes them (G.World.fromDesc builds the world from these);
//   draw: everything the level draws, as a tree of nodes (boxes, planes, cylinders, profiles, buffers), each with a material
//     id from draw.mats, a texture id from draw.tex, and where it goes. js/levelview.ts turns it into three.js meshes.
// The tree is in the order the meshes were always made in (the screen merges them by material in that order), and its
// materials are one entry each where three.js had one object each (what shares one, shares an id).
interface LdGeo { k: string; a?: number[]; ops?: any[]; pos?: number[]; col?: number[]; nrm?: number[]; uv?: number[]; idx?: number[]; pts?: number[]; parts?: LdGeo[] }
interface LdNode { t: string; g?: LdGeo; m?: number | number[]; p?: number[]; r?: number[]; q?: number[]; s?: number[]; look?: number[]; l1?: number; ro?: number; hid?: number; h?: string; c?: LdNode[]; n?: number; cnt?: number; tr?: number[]; mx?: number[]; col?: number[]; pos?: number[]; k?: string; fl?: number; cells?: number[]; sg?: number; tex?: number; hf?: number }
interface LdMat { k: string; [f: string]: any }
interface LdTex { k: string; [f: string]: any }
interface LdDraw { mats: LdMat[]; tex: LdTex[]; root: LdNode[] }
interface LvDesc { v: number; seed: number; level: number; theme: string; night: boolean; hub: boolean; [f: string]: any; draw: LdDraw; solids: any[] }

const G_LevelDesc = (() => {
  const PI = Math.PI;
  // ---------------------------------------------------------------- colour, as three.js reckons it (r186, colour management on)
  const s2l = (c: number) => (c < 0.04045 ? c * 0.0773993808 : Math.pow(c * 0.9478672986 + 0.0521327014, 2.4));
  const l2s = (c: number) => (c < 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 0.41666) - 0.055);
  const hexOf = (v: string | number) => { if (typeof v === 'number') return v; let s = String(v).replace('#', ''); if (s.length === 3) s = s.split('').map((c) => c + c).join(''); return parseInt(s, 16); };
  // a colour written in sRGB (a hex number or '#rrggbb'), in linear light (three's Color.set / setHex)
  const lin = (v: string | number) => { const h = hexOf(v); return [s2l(((h >> 16) & 255) / 255), s2l(((h >> 8) & 255) / 255), s2l((h & 255) / 255)]; };
  // (r, g, b) written in sRGB, in linear light (three's setRGB(...).convertSRGBToLinear())
  const linRGB = (r: number, g: number, b: number) => [s2l(r), s2l(g), s2l(b)];
  // a surface's colour over the theme's, linear (js/homes.ts over: a resident's ceilings and walls)
  const over = (hex: string | number, base: string | number) => { const c = lin(hex), b = lin(base); return [c[0] / b[0], c[1] / b[1], c[2] / b[2]]; };

  // ---------------------------------------------------------------- maths three.js did for the generator, as it does it
  // a quaternion from Euler angles (x, y, z: order XYZ) and a matrix (column-major, 16) from position, quaternion, scale
  function quatEuler(x: number, y: number, z: number) {
    const c1 = Math.cos(x / 2), c2 = Math.cos(y / 2), c3 = Math.cos(z / 2), s1 = Math.sin(x / 2), s2 = Math.sin(y / 2), s3 = Math.sin(z / 2);
    return [s1 * c2 * c3 + c1 * s2 * s3, c1 * s2 * c3 - s1 * c2 * s3, c1 * c2 * s3 + s1 * s2 * c3, c1 * c2 * c3 - s1 * s2 * s3];
  }
  function compose(p: number[], q: number[], s: number[]) {
    const [x, y, z, w] = q, x2 = x + x, y2 = y + y, z2 = z + z, xx = x * x2, xy = x * y2, xz = x * z2, yy = y * y2, yz = y * z2, zz = z * z2, wx = w * x2, wy = w * y2, wz = w * z2, [sx, sy, sz] = s;
    return [(1 - (yy + zz)) * sx, (xy + wz) * sx, (xz - wy) * sx, 0, (xy - wz) * sy, (1 - (xx + zz)) * sy, (yz + wx) * sy, 0, (xz + wy) * sz, (yz - wx) * sz, (1 - (xx + yy)) * sz, 0, p[0], p[1], p[2], 1];
  }
  // a point through a matrix (three's Vector3.applyMatrix4)
  function apply(e: number[], x: number, y: number, z: number) {
    const w = 1 / (e[3] * x + e[7] * y + e[11] * z + e[15]);
    return [(e[0] * x + e[4] * y + e[8] * z + e[12]) * w, (e[1] * x + e[5] * y + e[9] * z + e[13]) * w, (e[2] * x + e[6] * y + e[10] * z + e[14]) * w];
  }
  // the rotation turning unit vector a onto unit vector b (three's Quaternion.setFromUnitVectors), as [x, y, z, w]
  function quatUnit(a: number[], b: number[]) {
    let r = a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + 1, q: number[];
    if (r < 1e-8) { r = 0; q = Math.abs(a[0]) > Math.abs(a[2]) ? [-a[1], a[0], 0, r] : [0, -a[2], a[1], r]; }
    else q = [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0], r];
    const l = Math.hypot(q[0], q[1], q[2], q[3]);
    return l === 0 ? [0, 0, 0, 1] : q.map((v) => v * (1 / l));
  }
  const norm = (v: number[]) => { const l = Math.sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };
  const cross = (a: number[], b: number[]) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  // three's IcosahedronGeometry(1, 0), its triangles' corners (non-indexed, float32 as three makes them): the outcrops' rough
  // tops are drawn from it and their solids cut from it (G.Level.crestSolids), so both take these
  const ICO: number[] = (() => {
    const A = 0.8506507873535156, B = 0.525731086730957;
    return [-A,0,B,0,B,A,-B,A,0,0,B,A,B,A,0,-B,A,0,B,A,0,0,B,-A,-B,A,0,0,B,-A,-A,0,-B,-B,A,0,-A,0,-B,-A,0,B,-B,A,0,0,B,A,A,0,B,B,A,0,-A,0,B,0,-B,A,0,B,A,-A,0,-B,-B,-A,0,-A,0,B,0,B,-A,0,-B,-A,-A,0,-B,B,A,0,A,0,-B,0,B,-A,A,0,B,0,-B,A,B,-A,0,0,-B,A,-B,-A,0,B,-A,0,-B,-A,0,0,-B,-A,B,-A,0,0,-B,-A,A,0,-B,B,-A,0,A,0,-B,A,0,B,B,-A,0,A,0,B,0,B,A,0,-B,A,0,-B,A,-A,0,B,-B,-A,0,-B,-A,0,-A,0,-B,0,-B,-A,0,-B,-A,0,B,-A,A,0,-B,A,0,-B,B,A,0,A,0,B];
  })();
  // mulberry32 at its k-th draw (js/util.ts rng: each draw steps its state by the same constant)
  const rngAt = (seed: number, k: number) => G.U.rng((seed + Math.imul(k, 0x6d2b79f5)) >>> 0);
  const str = (a: ArrayLike<number> | null | undefined) => { if (!a) return null; let s = ''; for (let i = 0; i < a.length; i++) s += String.fromCharCode(48 + a[i]); return s; };
  // how many draws js/furniture.ts textures(rnd) makes for each of the festival's ground textures (they share the festival's
  // random stream with what's drawn after them: so the stars and the bulbs are where they always were). js/levelview.ts makes
  // the textures from the same stream and counts: a count that disagrees is said, and this wants updating.
  const TEX_DRAWS: Record<string, (r: () => number) => number> = {
    grass: (r) => { let n = 30; for (let i = 0; i < 30; i++) r(); for (let i = 0; i < 5000; i++) { const v = r(); const k = (v < 0.5 ? 1 : 4) + 3; for (let j = 0; j < k; j++) r(); n += 1 + k; } return n; },
    tile: () => 16 * 2 + 300 * 6,
    carpet: () => 2500 * 6,
  };

  // ---------------------------------------------------------------- the builder
  function builder() {
    const D: LdDraw = { mats: [], tex: [], root: [] };
    const mat = (k: string, o?: Record<string, any>) => { D.mats.push(Object.assign({ k }, o || {})); return D.mats.length - 1; };
    const tex = (k: string, o?: Record<string, any>) => { D.tex.push(Object.assign({ k }, o || {})); return D.tex.length - 1; };
    const std = (o?: Record<string, any>) => mat('std', o), basic = (o?: Record<string, any>) => mat('basic', o);
    const geo = (k: string, a?: number[], ops?: any[]): LdGeo => (ops && ops.length ? { k, a: a || [], ops } : { k, a: a || [] });
    const mesh = (g: LdGeo, m: number | number[], o?: Partial<LdNode>): LdNode => Object.assign({ t: 'm', g, m }, o || {});
    const group = (c: LdNode[], o?: Partial<LdNode>): LdNode => Object.assign({ t: 'g' }, o || {}, { c });
    return { D, mat, tex, std, basic, geo, mesh, group };
  }
  type LdB = ReturnType<typeof builder>;
  const lvTex = (B: LdB, kind: string, base: string, rep: number[]) => B.tex('lv', { kind, base, rep });

  // ---------------------------------------------------------------- the whole level
  function describe(map: LvMap): LvDesc {
    const L = G.Level, fms: LvMap[] = map.floors || [map], TS = L.TS;
    const pt = (p: any) => (p ? { x: p.x, z: p.z } : null);
    const desc: LvDesc = {
      v: 1, seed: map.seed, level: map.level, theme: map.theme.name, night: !!map.night, hub: !!map.hub,
      TS, WALL_H: L.WALL_H, DOOR_H: L.DOOR_H, FLOOR_H: L.FLOOR_H, W: map.W, H: map.H, NF: fms.length, base: map.base || 0,
      floors: fms.map((m, f) => ({ f, fy: m.fy || 0, skirt: m.skirt || 0, t: str(m.t), out: str(m.out), grate: str(m.grate), units: str(m.unitAt ? Array.from(m.unitAt, (u) => u + 1) : null) })),
      terrain: map.terrain ? { VW: map.terrain.VW, VH: map.terrain.VH, TS: map.terrain.TS, v: Array.from(map.terrain.v), hole: str(map.terrain.hole) } : null,
      chasm: map.chasm || 0, minY: map.minY || 0,
      rooms: (map.rooms || []).map((r) => ({ fl: r.fl || 0, type: r.type, x: r.x, z: r.z, w: r.w, h: r.h, cx: r.cx, cz: r.cz, out: !!r.out, unit: r.unit != null ? r.unit : null })),
      doors: map.doors.map((d) => ({ id: d.id, fl: d.fl || 0, fy: d.fy || 0, cells: d.cells || [d.i], x: d.x, z: d.z, axis: d.axis, w: d.w || TS, mirror: !!d.mirror, kind: d.kind || null, open: !!d.open, leaf: d.leaf || null, pane: d.pane ? d.pane.id : null })),
      windows: (map.windows || []).map((w) => ({ id: w.id, fl: w.fl || 0, fy: w.fy || 0, x: w.x, z: w.z, len: w.len, cells: w.cells, nx: w.nx || 0, nz: w.nz || 0, ext: !!w.ext, armor: !!w.armor, cooler: !!w.cooler,
        sill: w.sill != null ? w.sill : w.door || w.rail ? null : L.SILL, top: w.top != null ? w.top : w.door || w.rail ? null : L.TOP, broken: !!w.broken, door: w.door ? w.door.id : null, rail: w.rail ? map.rails.indexOf(w.rail) : null })),
      stairs: (map.stairs || []).map((s) => ({ f: s.f, y0: s.y0, rise: s.rise, axis: s.axis, up: s.up, x0: s.x0, x1: s.x1, z0: s.z0, z1: s.z1 })),
      rails: (map.rails || []).map((r: any) => ({ f: r.f, y: r.y, x0: r.x0, x1: r.x1, z0: r.z0, z1: r.z1, pane: r.pane ? r.pane.id : null })),
      railSteel: !!map.railSteel,
      lamps: map.lamps.map((l) => Object.assign({ x: l.x, y: l.y, z: l.z, color: l.color, i: l.i, d: l.d }, l.fl != null ? { fl: l.fl } : {})),
      light: lightInputs(map),
      spawn: pt(map.spawn), extract: map.extract ? { x: map.extract.x, z: map.extract.z, r: map.extract.r } : null, lz: map.lz ? { x: map.lz.x, y: map.lz.y, z: map.lz.z, f: map.lz.f } : null,
      entries: fms.map((m) => m.entries || []), enemySpots: map.enemySpots, lzSpots: map.lzSpots || [],
      cover: map.cover.map((c) => [c.x, c.z, c.cx, c.cz, c.y || 0, c.fl || 0]), wallSpots: map.wallSpots.map((c) => [c.x, c.z, c.y || 0, c.fl || 0]),
      props: propList(map).map((p) => Object.assign({ fl: (p as any)._fl, name: p.name }, p.x != null ? { x: p.x, z: p.z, q: p.q, v: p.v, gy: p.gy || 0 } : {}, p.style ? { style: p.style } : {}, p.gone ? { gone: 1 } : {}, p.own ? { own: 1 } : {})),
      boxes: { case: map.case ? box(map.case) : null, abox: map.abox ? box(map.abox) : null, sbox: map.sbox ? box(map.sbox) : null, cabinets: (map.cabinets || []).map(box) },
      crest: map.crest ? { CX0: map.crest.CX0, CX1: map.crest.CX1, SZ: map.crest.SZ, site: map.crest.site, fog: map.theme.fog, roofs: map.crest.roofs, ladders: map.crest.ladders, lines: map.crest.lines.map((l: any) => ({ a: l.a, b: l.b, sag: l.sag, on: l.on, off: l.off, gy: l.gy })), guard: map.crest.guard || null } : null,
      fx: (map.fx || []).map((f) => Object.assign({}, f)),
      world: { bounds: map.world ? map.world.bounds : null },
      solids: solidsOf(map),
      draw: draw(map),
    };
    return desc;
  }
  const box = (o: any) => ({ x: o.x, z: o.z, yaw: o.yaw, fy: o.fy || 0 });
  // the light grid's inputs besides the grid, the doors, the windows and the lamps (js/lightgrid.ts build): the sky's light on
  // what's open to it, and the colours the room's light bounces off (the theme's floor, walls and ceiling)
  function lightInputs(map: LvMap) {
    const th = map.theme;
    return { skyI: th.hub ? 0 : (th.hemiI || 0.26) ** 2, sky: th.hemi || th.light || 0xffffff, floor: th.floor || null, wall: th.wall || null, ceil: th.ceil || null, night: !!map.night };
  }
  // every piece of furniture there is, once, in the order js/world.ts meets them (each floor's placed pieces, then any the
  // cells hold besides): what a solid's prop is, by its place in this list
  function propList(map: LvMap) {
    const out: LvProp[] = [], seen = new Set<LvProp>();
    (map.floors || [map]).forEach((m: LvMap, f: number) => {
      for (const p of [...(m.propList || []), ...(m.props || new Map()).values()]) if (!seen.has(p)) { seen.add(p); (p as any)._fl = f; out.push(p); }
    });
    return out;
  }
  // ---------------------------------------------------------------- the solids, as plain records
  // { b: [x0, y0, z0, x1, y1, z1], k: kind, then only what's set: mv 0 (doesn't stop people), ry 0 (doesn't stop rays), hull (a
  // convex shape's planes), e (the map's edge), vw (an outside window's view), tr (rolling ground), bars (a grating), ns (never
  // stepped onto), pr (the furniture it's part of: props[pr]), dr (its door's id), wn (its window's id), gl (the pane it is), st
  // (its flight of stairs), mat (what it's made of, when that isn't its kind's: js/materials.ts PROPS / PARTS) }
  function solidsOf(map: LvMap) {
    const w = map.world, props = propList(map), pi = new Map<LvProp, number>(props.map((p, i) => [p, i])), stairs = map.stairs || [];
    const matKey = new Map<any, string>();
    for (const [k, v] of Object.entries(G.Materials.PROPS)) matKey.set(v, 'props:' + k);
    for (const [k, v] of Object.entries(G.Materials.PARTS)) if (!matKey.has(v)) matKey.set(v, 'parts:' + k);
    const out: any[] = [];
    for (const s of w ? w.solids : []) {
      if (!s) { out.push(null); continue; }
      const o: any = { b: [s.min[0], s.min[1], s.min[2], s.max[0], s.max[1], s.max[2]], k: s.kind || null };
      if (s.move === false) o.mv = 0;
      if (s.ray === false) o.ry = 0;
      if (s.hull) o.hull = s.hull;
      if (s.edge) o.e = 1;
      if (s.view) o.vw = 1;
      if (s.terrain) o.tr = 1;
      if (s.bars) o.bars = 1;
      if (s.nostep) o.ns = 1;
      if (s.prop) o.pr = pi.has(s.prop) ? pi.get(s.prop) : -1;
      if (s.door) o.dr = s.door.id;
      if (s.win) o.wn = s.win.id;
      if (s.glass != null) o.gl = s.glass;
      if (s.stair) o.st = stairs.indexOf(s.stair);
      if (s.mat) o.mat = matKey.get(s.mat) || null;
      out.push(o);
    }
    return out;
  }

  // ---------------------------------------------------------------- what's drawn
  function draw(map: LvMap): LdDraw {
    const B = builder();
    if (map.floors) stackNodes(map, B); else B.D.root.push(...floorNodes(map, B));
    return B.D;
  }
  // A building of several floors: each floor's nodes as a storey's, raised to its height; the stairs' steps; the railings
  function stackNodes(map: LvMap, B: LdB) {
    const L = G.Level, root = B.D.root;
    for (const m of map.floors) root.push(B.group(floorNodes(m, B), { p: [0, m.fy, 0], fl: m.fl }));
    // the stairs: each step a block (stone treads, painted risers), and a stringer down the open side
    const tread = B.std(map.railSteel ? { color: 0x5a5e62, roughness: 0.45, metalness: 0.7 } : { color: 0x8a847a, roughness: 0.8 }), riser = B.std(map.railSteel ? { color: 0x34383c, roughness: 0.5, metalness: 0.6 } : { color: 0xcfc8bb, roughness: 0.9 });
    for (const st of map.stairs) for (const s of st.steps || []) {
      const w = s.max[0] - s.min[0], h = s.max[1] - s.min[1], d = s.max[2] - s.min[2];
      root.push(B.mesh(B.geo('box', [w, h, d]), [riser, riser, tread, riser, riser, riser], { p: [(s.min[0] + s.max[0]) / 2, (s.min[1] + s.max[1]) / 2, (s.min[2] + s.max[2]) / 2], l1: 1 }));
    }
    // railings: a steel top rail on posts over a glass panel
    const steel = B.std(map.railSteel ? { color: 0xd8a820, roughness: 0.55, metalness: 0.3 } : { color: 0x2e3236, roughness: 0.4, metalness: 0.7 }), railMat = steel;
    const glass = B.std({ color: 0x9ab0bc, transparent: true, opacity: 0.22, roughness: 0.1, metalness: 0.4, depthWrite: false, side: 2 });
    for (const r of map.rails) {
      const w = r.x1 - r.x0, d = r.z1 - r.z0, cx = (r.x0 + r.x1) / 2, cz = (r.z0 + r.z1) / 2, H = L.RAIL_H;
      root.push(B.mesh(B.geo('box', [w + 0.02, 0.05, d + 0.02]), steel, { p: [cx, r.y + H - 0.025, cz] }));
      root.push(B.mesh(B.geo('box', [0.04, H, 0.04]), steel, { p: [r.x0 + (w > d ? 0.02 : w / 2), r.y + H / 2, r.z0 + (w > d ? d / 2 : 0.02)] }));
      if (map.railSteel) { for (const [y, h] of [[0.5, 0.04], [0.06, 0.12]]) root.push(B.mesh(B.geo('box', [w + 0.01, h, d + 0.01]), railMat, { p: [cx, r.y + y, cz] })); continue; }
      root.push(B.mesh(B.geo('box', [Math.max(w - 0.04, 0.01), H - 0.12, Math.max(d - 0.04, 0.01)]), glass, Object.assign({ p: [cx, r.y + H / 2 + 0.02, cz], ro: 2 }, r.pane ? { h: 'pane:' + r.pane.id } : {})));
    }
  }

  // One storey (or a level of one): its floor, ceilings and roofs, walls, furniture (js/furniture.ts, where it goes in the
  // order), windows, lamps' fittings, doors, a festival's or the Sandia Crest's dressing, what a foundry's machinery gives off,
  // the weapon case and the boxes and cabinets
  function floorNodes(map: LvMap, B: LdB): LdNode[] {
    const L = G.Level, TS = L.TS, K = L.K, WALL_H = L.WALL_H, th = map.theme, root: LdNode[] = [];
    const { W, H, t } = map, SK = map.skirt || 0, va = map.voidAbove, gr = map.grate;
    const cell = (i: number, y: number) => [((i % W) + 0.5) * TS, y, (Math.floor(i / W) + 0.5) * TS];
    // The hangar's fixed shell (its floor, ceiling, roof, lamps' fittings and roller doors) is baked with the rest of its fittings
    // (js/hangar.ts, tools/bake_hangar.mjs): marked hf, a screen with the baked hangar loaded leaves it out (js/levelview.ts).
    // What stays: the walls (a round takes cubes out of them: js/damage.ts), the windows (they break), the furniture, the lamps'
    // light (the light grid).
    const hf = <N extends LdNode>(n: N): N => (map.hub ? Object.assign(n, { hf: 1 }) : n);
    // floor + ceiling (upstairs, the floor only where there is one: not over a drop, and steel grating where it's a catwalk)
    if (!t.includes(5) && !gr) {
      const fmat = B.std({ map: lvTex(B, th.rock ? 'rock' : 'floor', th.floor, [W / K, H / K]), roughness: 0.92 });
      root.push(hf(B.mesh(B.geo('plane', [W * TS, H * TS]), fmat, { r: [-PI / 2, 0, 0], p: [(W * TS) / 2, 0, (H * TS) / 2], l1: 1 }))); // (layer 1: what hides the evidence glow: walls, floors, doors)
    } else {
      const cells: number[] = [], tr = map.terrain, hills: number[] = [];
      const raised = (i: number) => { const k = ((i / W) | 0) * tr.VW + (i % W); return Math.abs(tr.v[k]) > 1e-3 || Math.abs(tr.v[k + 1]) > 1e-3 || Math.abs(tr.v[k + tr.VW]) > 1e-3 || Math.abs(tr.v[k + tr.VW + 1]) > 1e-3; }; // (off level at 0: up or down)
      for (let i = 0; i < W * H; i++) if (t[i] !== 5 && !(gr && gr[i])) (tr && raised(i) ? hills : cells).push(i);
      const fm = B.std({ map: lvTex(B, th.rock ? 'rock' : 'floor', th.floor, [1 / K, 1 / K]), roughness: 0.92 });
      root.push({ t: 'i', g: B.geo('plane', [TS, TS], [['rx', -PI / 2]]), m: fm, n: cells.length, tr: cells.flatMap((i) => cell(i, 0)), l1: 1 });
      // the rolling ground (map.terrain: crestGround): those cells as one surface over their corners' heights (a procedural
      // surface, made from the description: proc 'terrain')
      if (hills.length) root.push(B.mesh({ k: 'proc', fn: 'terrain' } as LdGeo, fm, { l1: 1 }));
      // the slab's edge round a drop (a mountain top's gorge has cliffs instead: crest)
      if (!map.chasm) {
        let slab = -1;
        for (let z = 0; z < H; z++) for (let x = 0; x < W; x++) {
          if (t[z * W + x] === 5 || t[z * W + x] === 1 || (gr && gr[z * W + x])) continue;
          for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
            const n = (z + dz) * W + x + dx;
            if (t[n] !== 5 && !(gr && gr[n])) continue;
            if (slab < 0) slab = B.std({ color: 0xbdb6aa, roughness: 0.9 });
            root.push(B.mesh(B.geo('box', [dx ? 0.02 : TS, SK, dz ? 0.02 : TS]), slab, { p: [(x + 0.5 + dx * 0.5) * TS - dx * 0.01, -SK / 2, (z + 0.5 + dz * 0.5) * TS - dz * 0.01] }));
          }
        }
      }
    }
    // the slab over the top of a wall that stops short of the floor above (the edge of its stairwell)
    const capUp = map.above, caps: number[] = [];
    if (capUp) for (let i = 0; i < W * H; i++) if (L._capped(map, capUp, i)) caps.push(i);
    if (caps.length) root.push({ t: 'i', g: B.geo('box', [TS, capUp!.skirt, TS]), m: B.std({ color: 0xbdb6aa, roughness: 0.9 }), n: caps.length, tr: caps.flatMap((i) => cell(i, WALL_H + capUp!.skirt / 2)), l1: 1 });
    if (gr) root.push(...grate(map, B));
    // ceiling over everything indoors (gardens are open to the night sky; nor under a drop in the floor above)
    const ctex = lvTex(B, 'floor', th.ceil, [0.5, 0.5]);
    const roofed: number[] = [];
    for (let i = 0; i < W * H; i++) if (!map.out[i] && !(va && va[i])) roofed.push(i);
    // the top of it, for what's looking down from the air (you ride in over the roofs: js/landing.ts), wherever nothing's
    // built on it; a flat felt roof (a home's pitched one sits over it). Its back to the rooms below.
    const up = map.above, tops: number[] = [];
    const rockAt = (i: number) => map.crest && map.crest.kind[(((i / W) | 0) / K | 0) * map.crest.W + ((i % W) / K | 0)]; // (the Sandia Crest: 1 an outcrop, 2 the Crest House's stone, 3 the greenhouse's frame)
    for (let i = 0; i < W * H; i++) if (!map.out[i] && (!up || (up.out[i] && up.t[i] === 5)) && !(rockAt(i) & 1)) tops.push(i); // (no felt roof on a rock, nor on the greenhouse)
    if (tops.length) root.push(hf({ t: 'i', g: B.geo('plane', [TS, TS], [['rx', -PI / 2]]), m: B.basic({ color: 0x1e1f21 }), n: tops.length, tr: tops.flatMap((i) => cell(i, L.builtY(map, i) + WALL_H + 0.02)) }));
    // (a centimetre under the tops of the walls: the walls of the floor above stand on them, and their undersides, level
    // with the ceiling, fought it for the pixels). A resident's room has its own ceiling colour: a tint on its cells.
    const ceil: LdNode = { t: 'i', g: B.geo('plane', [TS, TS], [['rx', PI / 2]]), m: B.std({ map: ctex, roughness: 1 }), n: roofed.length, tr: roofed.flatMap((i) => cell(i, L.builtY(map, i) + WALL_H - 0.01)), l1: 1 };
    const tint = new Map<number, number[]>();
    for (const rm of map.rooms) if (rm.dress) { const c = over(rm.dress.ceil, th.ceil); for (const i of rm.dress.cells!) tint.set(i, c); }
    if (tint.size) ceil.col = roofed.flatMap((i) => tint.get(i) || [1, 1, 1]);
    root.push(hf(ceil));

    // walls: only tiles that border floor are visible. Each a little lighter or darker than the next (from the seed); the
    // Sandia Crest's: pink granite, grey stone, the greenhouse's white frame (the theme's pale stone tinted)
    const walls: number[] = [];
    for (let z = 0; z < H; z++) for (let x = 0; x < W; x++) {
      const v = t[z * W + x];
      if (v !== 1 || (map.winAt && map.winAt.has(z * W + x))) continue; // (a window: built below)
      let vis = false;
      for (let oz = -1; oz <= 1 && !vis; oz++) for (let ox = -1; ox <= 1; ox++) { const nx = x + ox, nz = z + oz; if (nx >= 0 && nz >= 0 && nx < W && nz < H && t[nz * W + nx] !== 1) { vis = true; break; } }
      if (vis) walls.push(z * W + x);
    }
    const heads = map.rooms.some((q) => q.lid); // (a roof's stair heads: bare grey render, a flat top, not the homes' paint and a pitched roof)
    const wtex = lvTex(B, heads || th.home >= 1 ? 'plaster' : th.rock ? 'rock' : 'wall', heads ? '#7f807c' : th.wall, [1, 2]);
    const paintWalls = map.rooms.some((rm) => rm.dress);
    const wallMat = B.std(Object.assign({ map: wtex, roughness: 0.85 }, paintWalls ? { paint: 1 } : {})); // (paint: a resident's wallpaper, js/homes.ts paint)
    const rs = G.U.rng((map.seed ^ 0x3a11c0 ^ Math.imul((map.fl || 0) + 1, 0x9e3779b1)) >>> 0), wcol: number[] = [];
    for (const i of walls) {
      const s = 0.85 + rs() * 0.2, rk = rockAt(i);
      if (rk === 1) { const p = 0.92 + rs() * 0.1; wcol.push(s * 0.86, s * 0.62 * p, s * 0.57 * p); } else if (rk === 2) wcol.push(s * 0.78, s * 0.74, s * 0.7); else wcol.push(s, s, s);
    }
    // (which of them's which tile, and how they stood: a round takes cubes out of it, js/damage.ts)
    root.push({ t: 'i', g: B.geo('box', [TS, WALL_H + SK, TS]), m: wallMat, n: walls.length, tr: walls.flatMap((i) => cell(i, L.builtY(map, i) + (WALL_H - SK) / 2)), col: wcol, l1: 1, h: 'walls', cells: walls });

    // Houses seen from the garden: a pitched roof with eaves along every wall that faces it
    if (map.out.some((v) => v)) {
      const seg: LdNode[] = [];
      // A home's roof: over each part of the house with the sky above it on this floor (the whole top storey, or a lower part
      // nothing's built on), a gable roof: its ridge along the long side, the two slopes down to eaves past the walls, a gable
      // at each end, fascia boards along the eaves.
      if (th.home >= 1 && !heads) {
        const roofMat = B.std({ color: 0x3a2f2c, roughness: 0.9 }), fascia = B.std({ color: 0xe8e4da, roughness: 0.7 });
        const sky = new Uint8Array(W * H), seen = new Uint8Array(W * H);
        for (let i = 0; i < W * H; i++) sky[i] = !map.out[i] && t[i] !== 5 && (!up || up.out[i]) ? 1 : 0; // (a hole in the floor above is its stairwell, not sky)
        const gableMat = B.std({ color: 0xd8d2c4, roughness: 0.8, side: 2 }), O = 0.35, PITCH = 0.55;
        for (let i0 = 0; i0 < W * H; i0++) {
          if (!sky[i0] || seen[i0]) continue;
          let x0 = W, z0 = H, x1 = 0, z1 = 0, n = 0;
          const stack = [i0]; seen[i0] = 1;
          while (stack.length) {
            const i = stack.pop()!, x = i % W, z = (i / W) | 0; n++;
            if (x < x0) x0 = x; if (x > x1) x1 = x; if (z < z0) z0 = z; if (z > z1) z1 = z;
            for (const j of [i - 1, i + 1, i - W, i + W]) if (j >= 0 && j < W * H && Math.abs((j % W) - x) <= 1 && sky[j] && !seen[j]) { seen[j] = 1; stack.push(j); }
          }
          if (n < 12) continue; // (a stray cell: a porch post, a chimney stub)
          const X0 = x0 * TS - O, X1 = (x1 + 1) * TS + O, Z0 = z0 * TS - O, Z1 = (z1 + 1) * TS + O, Y = WALL_H;
          const alongX = X1 - X0 >= Z1 - Z0, len = alongX ? X1 - X0 : Z1 - Z0, span = alongX ? Z1 - Z0 : X1 - X0, half = span / 2;
          const rise = Math.min(2.4, half * Math.tan(PITCH)), slope = Math.hypot(half, rise), ang = Math.atan2(rise, half);
          const cx = (X0 + X1) / 2, cz = (Z0 + Z1) / 2;
          for (const s of [-1, 1]) { // the two slopes, and the fascia along the eaves
            const off = half / 2;
            seg.push(B.mesh(alongX ? B.geo('box', [len, 0.12, slope + 0.08]) : B.geo('box', [slope + 0.08, 0.12, len]), roofMat, { p: [alongX ? cx : cx + s * off, Y + rise / 2 + 0.06, alongX ? cz + s * off : cz], r: alongX ? [s * ang, 0, 0] : [0, 0, -s * ang] }));
            seg.push(B.mesh(B.geo('box', [alongX ? len : 0.06, 0.22, alongX ? 0.06 : len]), fascia, { p: [alongX ? cx : cx + s * (half - 0.02), Y - 0.04, alongX ? cz + s * (half - 0.02) : cz] }));
          }
          for (const e of [-1, 1]) { // the gables, flush with the end walls
            seg.push(B.mesh({ k: 'shape', pts: [-half + O, 0, half - O, 0, 0, rise * (half - O) / half] }, gableMat, { p: [alongX ? cx + e * (len / 2 - O) : cx, Y, alongX ? cz : cz + e * (len / 2 - O)], r: [0, alongX ? PI / 2 : 0, 0] }));
          }
        }
      }
      root.push(B.group(seg));
    }
    root.push({ t: 'h', k: 'furniture', tex: lvTex(B, 'crate', th.crate, [1, 1]) }); // (js/furniture.ts build: the pieces in map.propList)
    root.push(...windows(map, B, wallMat, hf));

    // ceiling lamps' fittings (the light grid lights the level from the lamps: js/lightgrid.ts)
    // (a lamp that's off, a night level's: its fitting unlit, a dull glass; an exit sign: a lit panel over a doorway)
    let lampMat = -1, bayMat = -1, panelMat = -1, porchMat = -1, porchBox = -1, offMat = -1;
    const lampGeo = B.geo('sphere', [0.32, 16, 8, 0, PI * 2, 0, PI / 2], [['s', 1, 0.45, 1], ['rx', PI]]), bayGeo = B.geo('cyl', [0.1, 0.42, 0.32, 16, 1, 1]), bayLens = B.geo('circle', [0.38, 16], [['rx', PI / 2]]);
    const panelGeo = B.geo('box', [1.2, 0.04, 0.6]), signGeo = B.geo('box', [0.36, 0.15, 0.05]), signMats = new Map<number, number>();
    const M0 = () => { if (lampMat >= 0) return; lampMat = B.basic({ color: th.light }); bayMat = B.std({ color: 0x3a3e42, roughness: 0.5, metalness: 0.6, side: 2 }); panelMat = B.basic({ color: 0xf4f8ff }); porchMat = B.basic({ color: 0xffe2a8 }); porchBox = B.std({ color: 0x1c1c1e, roughness: 0.6 }); offMat = B.std({ color: 0x4a4844, roughness: 0.4 }); };
    for (const l of map.lights) {
      const lit = !!L.lampOf(l, th);
      if (l.kind === 'string') continue; // (its bulbs: festival)
      M0();
      if (l.kind === 'exit') { // an exit sign over a door (a night level's: nightify)
        const sg = l.sign!; let m = signMats.get(l.color!); if (m == null) { m = B.basic({ color: l.color! }); signMats.set(l.color!, m); }
        root.push(B.mesh(signGeo, m, Object.assign({ p: [sg.x, (l.gy || 0) + L.DOOR_H + 0.3, sg.z] }, sg.ax === 'x' ? { r: [0, PI / 2, 0] } : {})));
        continue;
      }
      if (l.porch) { // a lantern on the wall over a back door
        root.push(hf(B.mesh(B.geo('box', [0.16, 0.26, 0.14]), porchBox, { p: [l.x, (l.gy || 0) + l.y!, l.z + l.porch! * 0.07] })));
        root.push(hf(B.mesh(B.geo('box', [0.11, 0.18, 0.1]), lit ? porchMat : offMat, { p: [l.x, (l.gy || 0) + l.y!, l.z + l.porch! * 0.1] })));
        continue;
      }
      if (l.kind === 'panel') { root.push(hf(B.mesh(panelGeo, lit ? panelMat : offMat, { p: [l.x, (l.gy || 0) + WALL_H - 0.02, l.z] }))); continue; } // a shop's flat ceiling panel
      if (l.kind === 'highbay') { // a hall's: a dome on a rod down from the roof (the floor above's ceiling)
        const roof = L.FLOOR_H + WALL_H;
        root.push(hf(B.mesh(B.geo('cyl', [0.012, 0.012, roof - l.y!]), bayMat, { p: [l.x, (roof + l.y!) / 2, l.z] })));
        root.push(hf(B.mesh(bayGeo, bayMat, { p: [l.x, l.y! - 0.1, l.z] })));
        root.push(hf(B.mesh(bayLens, lit ? lampMat : offMat, { p: [l.x, l.y! - 0.26, l.z] })));
        continue;
      }
      root.push(hf(B.mesh(lampGeo, lit ? lampMat : offMat, { p: [l.x, (l.gy || 0) + WALL_H, l.z] })));
    }
    root.push(...doors(map, B, wtex, paintWalls));
    if (map.fest) root.push(...festival(map, B));
    if (map.crest) root.push(...crest(map, B));
    if (map.fx && map.fx.length) root.push({ t: 'h', k: 'fx' }); // (js/levelview.ts fx: the sparks, embers, smoke and steam off map.fx, moving each frame)
    root.push(...boxes(map, B));
    return root;
  }

  // Steel grating (a foundry's catwalks: map.grate): bar grating, bearing bars a few centimetres apart and a cross bar every so
  // often (the texture: G.Level.GRATE), seen through from above and below. Under it, a steel channel along every edge that's
  // over the drop, and hanger rods up to the roof from them every few metres. Rounds meet the bars where they're drawn (onBar).
  function grate(map: LvMap, B: LdB): LdNode[] {
    const L = G.Level, TS = L.TS, { W, H, t, grate: gr } = map, out: LdNode[] = [];
    const cells: number[] = [];
    for (let i = 0; i < W * H; i++) if (gr[i] && t[i] !== 1 && t[i] !== 5) cells.push(i);
    out.push({ t: 'i', g: B.geo('plane', [TS, TS], [['rx', -PI / 2]]), m: B.std({ color: 0x7a7e80, map: B.tex('grate'), alphaTest: 0.5, roughness: 0.5, metalness: 0.7, side: 2 }), n: cells.length, tr: cells.flatMap((i) => [((i % W) + 0.5) * TS, -0.01, (Math.floor(i / W) + 0.5) * TS]) });
    const steel = B.std({ color: 0x3e4246, roughness: 0.5, metalness: 0.7 });
    let k = 0;
    for (const i of cells) {
      const x = i % W, z = (i / W) | 0;
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        if (t[(z + dz) * W + x + dx] !== 5) continue;
        const ex = (x + 0.5 + dx * 0.5) * TS - dx * 0.04, ez = (z + 0.5 + dz * 0.5) * TS - dz * 0.04;
        out.push(B.mesh(B.geo('box', [dx ? 0.08 : TS, 0.22, dz ? 0.08 : TS]), steel, { p: [ex, -0.13, ez] }));
        if (k++ % 5 === 0) out.push(B.mesh(B.geo('cyl', [0.018, 0.018, L.WALL_H - 1.0]), steel, { p: [ex + dx * 0.06, (L.WALL_H + 1.0) / 2, ez + dz * 0.06] }));
      }
    }
    return out;
  }

  // Each window: the wall below and above the opening, a frame, the pane (handle pane:<id>, hidden once it breaks), and for an
  // outside window the view behind the glass (js/furniture.ts outsideMaterial). First the roller doors, rolled up: the wall
  // over the opening, the shutter's drum under it and a guide down each side.
  function windows(map: LvMap, B: LdB, wallMat: number, hf: (n: LdNode) => LdNode = (n) => n): LdNode[] {
    const L = G.Level, TS = L.TS, h = TS / 2, out: LdNode[] = [];
    let steel = -1;
    for (const [x0, x1, z] of map.rollers || []) {
      if (steel < 0) steel = B.std({ color: 0x5d6368, roughness: 0.5, metalness: 0.6 });
      const w = x1 - x0, cx = (x0 + x1) / 2, top = 3.0;
      out.push(hf(B.mesh(B.geo('box', [w, L.WALL_H - top, TS]), wallMat, { p: [cx, (top + L.WALL_H) / 2, z], l1: 1 })));
      out.push(hf(B.mesh(B.geo('cyl', [0.22, 0.22, w, 16]), steel, { r: [0, 0, PI / 2], p: [cx, top - 0.2, z] })));
      out.push(hf(B.mesh(B.geo('box', [w, 0.08, 0.1]), steel, { p: [cx, top - 0.44, z] }))); // the shutter's bottom bar
      for (const x of [x0 + 0.05, x1 - 0.05]) out.push(hf(B.mesh(B.geo('box', [0.1, top, 0.16]), steel, { p: [x, top / 2, z] })));
    }
    if (!map.windows || !map.windows.length) return out;
    const frameMat = B.std({ color: map.theme.home >= 1 ? 0xe8e4da : 0x3a3e42, roughness: 0.6 });
    // tinted, a little reflective, seen from both sides: it has to read as glass, not a hole
    const glassMat = B.std({ color: 0x7e98a8, transparent: true, opacity: 0.38, roughness: 0.08, metalness: 0.55, depthWrite: false, side: 2, envMapIntensity: 1.2 });
    const view = map.windows.some((w) => w.ext) ? B.mat('outside', { seed: (map.seed ^ 0x77) >>> 0, drop: map.theme.layout === 'apartments' ? 18 : 0 }) : -1;
    // bulletproof glass with steel wire in it (the grid drawn into the pane, a grey steel frame round it); a cooler's doors
    const wiredMat = map.windows.some((w) => w.armor) ? B.std({ color: 0x9fb2b8, map: B.tex('wired', { rep: [4, 4] }), transparent: true, opacity: 0.5, roughness: 0.2, metalness: 0.4, depthWrite: false, side: 2 }) : -1;
    const coolerMat = map.windows.some((w) => w.cooler) ? B.std({ color: 0xbfe6ff, transparent: true, opacity: 0.32, roughness: 0.05, metalness: 0.3, emissive: 0x0d2a3a, depthWrite: false, side: 2 }) : -1;
    const steelFrame = B.std({ color: 0x6a7076, roughness: 0.45, metalness: 0.6 }), whiteFrame = B.std({ color: 0xf0f2f2, roughness: 0.4 });
    for (const w of map.windows) {
      const SL = w.sill != null ? w.sill : L.SILL, TP = w.top != null ? w.top : L.TOP, opening = TP - SL; // (its own, or the usual)
      const c: LdNode[] = [], SK = map.skirt || 0;
      // (local: x along the wall, z out of it toward -n; on rolling ground, the ground it's in) the wall below and above (the cell's full depth)
      c.push(B.mesh(B.geo('box', [w.len, SL + SK, TS]), wallMat, { p: [0, (SL - SK) / 2, 0], l1: 1 }));
      c.push(B.mesh(B.geo('box', [w.len, L.WALL_H - TP, TS]), wallMat, { p: [0, (TP + L.WALL_H) / 2, 0], l1: 1 }));
      // the frame: sill, head, jambs and a mullion
      const fm = w.armor ? steelFrame : w.cooler ? whiteFrame : frameMat;
      const fr = (bw: number, bh: number, bd: number, x: number, y: number) => c.push(B.mesh(B.geo('box', [bw, bh, bd * (w.armor ? 1.6 : 1)]), fm, { p: [x, y, 0] }));
      fr(w.len, 0.05, 0.1, 0, SL + 0.025); fr(w.len, 0.05, 0.08, 0, TP - 0.025);
      for (const x of [-1, 1]) fr(0.05, opening, 0.08, x * (w.len / 2 - 0.025), (SL + TP) / 2);
      fr(0.04, opening, 0.05, 0, (SL + TP) / 2);
      c.push(B.mesh(B.geo('plane', [w.len - 0.08, opening - 0.08]), w.armor ? wiredMat : w.cooler ? coolerMat : glassMat, Object.assign({ p: [0, (SL + TP) / 2, 0], ro: 2, h: 'pane:' + w.id }, w.broken ? { hid: 1 } : {})));
      if (w.cooler) for (const y of [SL + 0.4, SL + 0.85, SL + 1.3]) fr(w.len - 0.1, 0.02, 0.5, 0, y); // (the shelves behind a cooler's door)
      if (w.ext && view >= 0) c.push(B.mesh(B.geo('plane', [w.len, opening]), view, { p: [0, (SL + TP) / 2, -(h - 0.01)] })); // (outside: the view, at the back of the opening)
      out.push(B.group(c, { p: [w.x, map.terrain ? w.fy || 0 : 0, w.z], r: [0, Math.atan2(-w.nx, -w.nz), 0] }));
    }
    return out;
  }

  // Doors: a lintel over the frame and a leaf on a hinge, its pivot (handle door:<id>) turned by how far open it is
  // (G.Game.updateDoors): base the shut leaf's turn, sg which way it swings. The leaf (leaf), its knobs (knob) and hinges
  // (hk, hp: a knuckle and a leaf, shot out one by one: js/damage.ts).
  function doors(map: LvMap, B: LdB, wtex: number, paint: boolean): LdNode[] {
    const L = G.Level, TS = L.TS, th = map.theme, out: LdNode[] = [];
    if (!map.doors.length) return out;
    const metal = th.name === 'Bunker' || th.name === 'Research Lab' || th.name === 'Cold Storage' || th.name === 'Foundry' || th.name === 'Warehouse'; // (as js/materials.ts builds them)
    const leafMat = B.std({ color: metal ? 0x5d666e : 0x6e4a2c, roughness: metal ? 0.5 : 0.75, metalness: metal ? 0.5 : 0 });
    const lintelMat = B.std(Object.assign({ map: wtex, roughness: 0.85 }, paint ? { paint: 1 } : {}));
    const fireMat = B.std({ color: 0x5d666e, roughness: 0.5, metalness: 0.5 }), knobMat = B.std({ color: 0xb8a060, roughness: 0.3, metalness: 0.9 }), vaultMat = B.std({ color: 0x7a8288, roughness: 0.35, metalness: 0.85 });
    const steelMat = B.std({ color: 0x3a3f44, roughness: 0.45, metalness: 0.7 }), barMat = B.std({ color: 0xc4c8cc, roughness: 0.25, metalness: 0.9 });
    const doorGlass = B.std({ color: 0x8fa8b4, transparent: true, opacity: 0.3, roughness: 0.08, metalness: 0.5, depthWrite: false, side: 2 });
    for (const d of map.doors) {
      const dw = d.w || TS, half = dw / 2, leafL = dw - 0.05, gy = map.terrain ? d.fy || 0 : 0; // (on rolling ground, the ground it's in: a storey's floor is its whole group's)
      out.push(B.mesh(d.axis === 'x' ? B.geo('box', [TS, L.WALL_H - L.DOOR_H, dw]) : B.geo('box', [dw, L.WALL_H - L.DOOR_H, TS]), lintelMat, { p: [d.x, gy + (L.WALL_H + L.DOOR_H) / 2, d.z], l1: 1 }));
      const c: LdNode[] = [], vault = d.kind === 'vault', glassDoor = d.kind === 'stair', LH = L.DOOR_H - 0.04;
      const part = (w: number, h: number, dd: number, x: number, y: number, z: number, mat = steelMat) => c.push(B.mesh(B.geo('box', [w, h, dd]), mat, { p: [x, y, z] }));
      if (glassDoor) {
        // a stairwell door: a glass leaf in a steel frame. It swings away from the side with the push bar (the bar across the
        // middle), toward the side with the pull handle (upright, by the latch edge).
        const push = d.mirror ? -1 : 1;
        for (const x of [0.02 + 0.04, leafL + 0.02 - 0.04]) part(0.08, LH, 0.06, x, LH / 2, 0); // stiles
        part(leafL, 0.08, 0.06, leafL / 2 + 0.02, LH - 0.04, 0); part(leafL, 0.22, 0.06, leafL / 2 + 0.02, 0.11, 0); // top rail, kick plate
        const bz = push * 0.075;
        part(leafL - 0.3, 0.05, 0.035, leafL / 2 + 0.06, 1.0, bz, barMat); // the push bar, on two brackets, its end by the latch
        for (const x of [0.22, leafL - 0.08]) part(0.05, 0.07, 0.05, x, 1.0, push * 0.05, steelMat);
        part(0.03, 0.42, 0.03, leafL - 0.1, 1.05, -push * 0.085, barMat); // the pull handle on the other face, on two stand-offs
        for (const y of [0.88, 1.22]) part(0.025, 0.025, 0.06, leafL - 0.1, y, -push * 0.055, barMat);
      }
      if (vault) { // the locking wheel and bolts on the outside face
        const wp = [leafL * (d.mirror ? 0.3 : 0.7), 1.2, 0.13];
        c.push(B.mesh(B.geo('torus', [0.22, 0.03, 8, 20]), knobMat, { p: wp }));
        for (let k = 0; k < 3; k++) c.push(B.mesh(B.geo('box', [0.44, 0.03, 0.03]), knobMat, { p: wp, r: [0, 0, k * PI / 3] }));
        for (const y of [0.3, 1.2, 2.0]) c.push(B.mesh(B.geo('box', [0.12, 0.08, 0.06]), knobMat, { p: [d.mirror ? 0.06 : leafL - 0.06, y, 0.12] }));
      }
      c.push(B.mesh(B.geo('box', [leafL, LH, vault ? 0.2 : 0.05]), vault ? vaultMat : glassDoor ? doorGlass : d.kind === 'fire' ? fireMat : leafMat, { p: [leafL / 2 + 0.02, (L.DOOR_H - 0.04) / 2, 0], l1: 1, h: 'leaf' }));
      if (!glassDoor) for (const side of [-1, 1]) c.push(B.mesh(B.geo('sphere', [0.03, 8, 6]), knobMat, { p: [leafL - 0.08, 1.0, side * 0.045], h: 'knob' }));
      // its hinges, on the side it opens toward (shot out, they're gone, and when they all are so's the door: js/damage.ts)
      if (!vault) for (const y of G.Damage.HINGES) {
        c.push(B.mesh(B.geo('cyl', [0.012, 0.012, 0.1, 8]), steelMat, { p: [0.005, y, -0.03], h: 'hk' }));
        c.push(B.mesh(B.geo('box', [0.05, 0.09, 0.004]), steelMat, { p: [0.04, y, -0.0275], h: 'hp' }));
      }
      // hinged on one jamb; the second leaf of a double door hinges on the opposite jamb and swings the other way
      const m = d.mirror ? -1 : 1;
      const p = d.axis === 'x' ? [d.x, gy, d.z - half * m] : [d.x - half * m, gy, d.z], base = d.axis === 'x' ? -PI / 2 * m : d.mirror ? PI : 0;
      out.push(B.group(c, { p, r: [0, base, 0], h: 'door:' + d.id, sg: m }));
    }
    return out;
  }

  // The weapon case (a hard-shell long-gun case along the wall, its lid hinged at the back: G.Views.syncCase), the attachments
  // box, the sticker box and the first aid cabinets: groups with handles on what opens (case, case.lid, abox, abox.lid,
  // abox.lights, sbox, sbox.lid, sbox.card, cab:<n>, cab:<n>.door, cab:<n>.slot)
  function boxes(map: LvMap, B: LdB): LdNode[] {
    const out: LdNode[] = [], at = (o: any) => ({ p: [o.x, map.terrain ? o.fy || 0 : 0, o.z], r: [0, o.yaw, 0] });
    const M = (color: number, roughness: number, metalness = 0) => B.std({ color, roughness, metalness });
    const bx = (list: LdNode[], w: number, h: number, d: number, m: number, x: number, y: number, z: number, o?: Partial<LdNode>) => { const n = B.mesh(B.geo('box', [w, h, d]), m, Object.assign({ p: [x, y, z] }, o || {})); list.push(n); return n; };
    if (map.case) {
      const shell = M(0x2b3026, 0.65), steel = M(0x9aa0a6, 0.3, 0.8), foam = M(0x5c6064, 1), g: LdNode[] = [], lid: LdNode[] = [], Lc = 1.35, D = 0.4, H0 = 0.075, H1 = 0.055;
      bx(g, Lc, 0.012, D, shell, 0, 0.006, 0);
      for (const s of [-1, 1]) { bx(g, Lc, H0, 0.014, shell, 0, H0 / 2, s * (D / 2 - 0.007)); bx(g, 0.014, H0, D, shell, s * (Lc / 2 - 0.007), H0 / 2, 0); }
      bx(g, Lc - 0.028, 0.02, D - 0.028, foam, 0, 0.022, 0);
      for (let i = 0; i < 6; i++) for (const s of [-1, 1]) bx(g, 0.03, H0 + 0.002, 0.01, shell, -0.55 + i * 0.22, H0 / 2, s * (D / 2 + 0.004));
      for (const x of [-0.42, 0.42]) bx(g, 0.06, 0.04, 0.012, steel, x, H0 - 0.006, D / 2 + 0.008);
      g.push(B.mesh(B.geo('torus', [0.05, 0.01, 6, 12, PI]), M(0x111111, 0.8), { r: [PI / 2, 0, PI], p: [0, 0.045, D / 2 + 0.012] }));
      // the lid, built closed around its hinge line
      g.push(B.group(lid, { p: [0, H0, -D / 2], h: 'case.lid' }));
      bx(lid, Lc, 0.012, D, shell, 0, H1 - 0.006, D / 2);
      for (const s of [-1, 1]) { bx(lid, Lc, H1, 0.014, shell, 0, H1 / 2, D / 2 + s * (D / 2 - 0.007)); bx(lid, 0.014, H1, D, shell, s * (Lc / 2 - 0.007), H1 / 2, D / 2); }
      bx(lid, Lc - 0.028, 0.018, D - 0.028, foam, 0, H1 - 0.021, D / 2);
      for (let i = 0; i < 6; i++) bx(lid, 0.03, 0.006, D + 0.004, shell, -0.55 + i * 0.22, H1 + 0.002, D / 2);
      for (const x of [-0.5, 0.5]) bx(lid, 0.05, 0.012, 0.016, steel, x, 0.004, -0.004); // hinges
      bx(lid, 0.18, 0.002, 0.08, B.basic({ color: 0xffb02e }), -0.3, H1 + 0.006, D / 2);
      out.push(B.group(g, Object.assign(at(map.case), { h: 'case' })));
    }
    // the attachments box: a small hard case (black, a yellow band round it) on the floor, its lid hinged at the back, three
    // cut-outs in the foam inside; a light on its front for each of the squad (G.Views)
    if (map.abox) {
      const shell = M(0x17191b, 0.6), band = M(0xe0a020, 0.5), steel = M(0x9aa0a6, 0.3, 0.8), foam = M(0x2a2c30, 1), hole = M(0x0c0d0e, 1);
      const g: LdNode[] = [], lid: LdNode[] = [], Lb = 0.5, D = 0.34, H0 = 0.09, H1 = 0.05;
      bx(g, Lb, 0.012, D, shell, 0, 0.006, 0);
      for (const sd of [-1, 1]) { bx(g, Lb, H0, 0.014, shell, 0, H0 / 2, sd * (D / 2 - 0.007)); bx(g, 0.014, H0, D, shell, sd * (Lb / 2 - 0.007), H0 / 2, 0); }
      for (const sd of [-1, 1]) { bx(g, Lb + 0.004, 0.018, 0.004, band, 0, H0 - 0.02, sd * (D / 2 + 0.001)); bx(g, 0.004, 0.018, D + 0.004, band, sd * (Lb / 2 + 0.001), H0 - 0.02, 0); } // (the band: round the outside)
      bx(g, Lb - 0.028, 0.03, D - 0.028, foam, 0, 0.03, 0);
      for (let i = 0; i < 3; i++) bx(g, 0.11, 0.004, 0.2, hole, -0.15 + i * 0.15, 0.046, 0);
      for (const x of [-0.14, 0.14]) bx(g, 0.05, 0.035, 0.012, steel, x, H0 - 0.012, D / 2 + 0.008);
      g.push(B.mesh(B.geo('torus', [0.04, 0.009, 6, 12, PI]), M(0x111111, 0.8), { r: [PI / 2, 0, PI], p: [0, 0.05, D / 2 + 0.012] }));
      g.push(B.group(lid, { p: [0, H0, -D / 2], h: 'abox.lid' }));
      bx(lid, Lb, 0.012, D, shell, 0, H1 - 0.006, D / 2);
      for (const sd of [-1, 1]) { bx(lid, Lb, H1, 0.014, shell, 0, H1 / 2, D / 2 + sd * (D / 2 - 0.007)); bx(lid, 0.014, H1, D, shell, sd * (Lb / 2 - 0.007), H1 / 2, D / 2); }
      bx(lid, Lb - 0.028, 0.016, D - 0.028, foam, 0, H1 - 0.02, D / 2);
      bx(lid, 0.2, 0.002, 0.07, B.basic({ color: 0xe0a020 }), 0, H1 + 0.002, D / 2);
      g.push(B.group([], { p: [0, 0.04, D / 2 + 0.008], h: 'abox.lights' }));
      out.push(B.group(g, Object.assign(at(map.abox), { h: 'abox' })));
    }
    // the sticker box: a little bright pink display box on the floor, a clear lid hinged at the back, the sticker lying on a
    // white card inside (its picture and the lid: G.Views, once the host has said which it is)
    if (map.sbox) {
      const pink = M(0xe8287a, 0.55), white = M(0xf2f0ea, 0.8), yel = M(0xffd23a, 0.5), g: LdNode[] = [], lid: LdNode[] = [], Lb = 0.24, D = 0.17, H0 = 0.05;
      bx(g, Lb, 0.008, D, pink, 0, 0.004, 0);
      for (const sd of [-1, 1]) { bx(g, Lb, H0, 0.01, pink, 0, H0 / 2, sd * (D / 2 - 0.005)); bx(g, 0.01, H0, D, pink, sd * (Lb / 2 - 0.005), H0 / 2, 0); }
      for (const sd of [-1, 1]) bx(g, Lb + 0.003, 0.012, 0.003, yel, 0, H0 - 0.014, sd * (D / 2 + 0.001)); // (a yellow stripe round it)
      bx(g, Lb - 0.02, 0.022, D - 0.02, white, 0, 0.019, 0);
      g.push(B.mesh(B.geo('plane', [1, 1]), B.std({ color: 0xffffff, roughness: 0.45, transparent: true, alphaTest: 0.03, depthWrite: false }), { r: [-PI / 2, 0, 0], p: [0, 0.031, 0], hid: 1, h: 'sbox.card' }));
      g.push(B.group(lid, { p: [0, H0, -D / 2], h: 'sbox.lid' }));
      const pane = B.std({ color: 0xdfeaf2, roughness: 0.08, metalness: 0, transparent: true, opacity: 0.22, depthWrite: false });
      bx(lid, Lb, 0.004, D, pane, 0, 0.002, D / 2);
      for (const sd of [-1, 1]) bx(lid, 0.012, 0.006, D, pink, sd * (Lb / 2 - 0.006), 0.003, D / 2);
      for (const sd of [0, 1]) bx(lid, Lb, 0.006, 0.012, pink, 0, 0.003, sd * (D - 0.012) + 0.006);
      out.push(B.group(g, Object.assign(at(map.sbox), { h: 'sbox' })));
    }
    // first aid cabinets: a white steel box on the wall with a red cross on its door (hinged on the left), two shelves inside
    // with whatever's left in it (G.Views.syncCabs)
    (map.cabinets || []).forEach((c, n) => {
      const white = M(0xe9e7e2, 0.45, 0.3), inner = M(0xd6d3cc, 0.8), red = B.basic({ color: 0xc0201a }), g: LdNode[] = [], door: LdNode[] = [], Wd = 0.44, Hh = 0.52, D = 0.15, Y = 1.32;
      bx(g, Wd, Hh, 0.012, inner, 0, Y, -D / 2 + 0.006); // back
      for (const s of [-1, 1]) { bx(g, 0.014, Hh, D, white, s * (Wd / 2 - 0.007), Y, 0); bx(g, Wd, 0.014, D, white, 0, Y + s * (Hh / 2 - 0.007), 0); }
      bx(g, Wd - 0.03, 0.01, D - 0.02, inner, 0, Y, 0); // the shelf
      g.push(B.group(door, { p: [-Wd / 2, Y, D / 2], h: 'cab:' + n + '.door' }));
      bx(door, Wd, Hh, 0.016, white, Wd / 2, 0, 0.008);
      bx(door, 0.2, 0.06, 0.004, red, Wd / 2, 0.02, 0.018); bx(door, 0.06, 0.2, 0.004, red, Wd / 2, 0.02, 0.018);
      bx(door, 0.012, 0.08, 0.02, M(0x8a8f94, 0.3, 0.8), Wd - 0.04, -0.05, 0.026); // the handle
      for (let i = 0; i < 6; i++) bx(g, 0.09, 0.1, 0.08, M(0xffffff, 0.8), -0.14 + (i % 3) * 0.14, Y + (i < 3 ? -0.2 : 0.06), -0.01, { hid: 1, h: 'cab:' + n + '.slot' }); // (up to six things on the two shelves)
      out.push(B.group(g, Object.assign(at(c), { h: 'cab:' + n })));
    });
    return out;
  }

  // ---------------------------------------------------------------- a festival's dressing
  // The lawn, the night sky (stars and a moon), the strings of lights on their poles (bulbs, or paper lanterns over the food
  // court, each with a soft glow; the real lights along them are lamps), the stage's truss with coloured lamps throwing beams,
  // its backdrop, and the arch over the gate. One random stream from the seed (the ground's textures first: TEX_DRAWS).
  function festival(map: LvMap, B: LdB): LdNode[] {
    const L = G.Level, f = map.fest, TS = L.TS, S = (map.seed ^ 0xfe57) >>> 0, Wm = map.W * TS, Hm = map.H * TS, out: LdNode[] = [];
    // (a night level's festival is the small hours, everyone gone home and the power off: the bulbs, lanterns, street lamps, stage
    // lamps, the signs, the backdrop, the LED strip and the road paint are dead glass and paint, lit only by the moon, no glows or
    // beams; nightify has their lights off. Dead glass: the colour at dim (0.35) of its linear value, js/levelview.ts mat)
    const dark = !!map.night, deadGlass = (color: number) => B.std({ color, dim: 0.35, roughness: 0.25, metalness: 0.1 });
    let drawn = 0;
    const furnTex = (fn: string, args: string[], rep: number[]) => { const id = B.tex('furn', { fn, args, seed: S, at: drawn, rep }); drawn += TEX_DRAWS[fn](rngAt(S, drawn)); return id; };
    const ground = (tx: number, w: number, d: number, x: number, y: number, z: number, rough: number) => out.push(B.mesh(B.geo('plane', [w, d]), B.std({ map: tx, roughness: rough }), { r: [-PI / 2, 0, 0], p: [x, y, z], l1: 1 }));
    // the lawn (worn in the lanes)
    ground(furnTex('grass', [], [map.W / 3, map.H / 3]), Wm, Hm, Wm / 2, 0.003, Hm / 2, 1);
    // the toilet block's floor, wall to wall (over the lawn, under each room's own tiles: the doorways too)
    const inside = map.rooms.filter((rm) => rm.type === 'washroom' || rm.type === 'cubicle');
    if (inside.length) {
      const x0 = Math.min(...inside.map((rm) => rm.x)) - 1, x1 = Math.max(...inside.map((rm) => rm.x + rm.w)) + 1, z0 = Math.min(...inside.map((rm) => rm.z)) - 1, z1 = Math.max(...inside.map((rm) => rm.z + rm.h)) + 1;
      ground(furnTex('tile', ['#c8ccc8', '#7a7e7a'], [x1 - x0, z1 - z0]), (x1 - x0) * TS, (z1 - z0) * TS, (x0 + x1) / 2 * TS, 0.0035, (z0 + z1) / 2 * TS, 0.5);
    }
    if (f.gate) { const g = f.gate; ground(furnTex('tile', ['#4e4b46', '#34322e'], [(g.x1 - g.x0) / 1.5, (g.z1 - g.z0) / 1.5]), g.x1 - g.x0, g.z1 - g.z0, (g.x0 + g.x1) / 2, 0.005, (g.z0 + g.z1) / 2, 0.9); }
    // the town square's paving, the car park's asphalt with its bays painted on
    const slab = (r: { x0: number; x1: number; z0: number; z1: number }, fn: string, args: string[], rep: number, y: number) => ground(furnTex(fn, args, [(r.x1 - r.x0) / rep, (r.z1 - r.z0) / rep]), r.x1 - r.x0, r.z1 - r.z0, (r.x0 + r.x1) / 2, y, (r.z0 + r.z1) / 2, 0.9);
    if (f.plaza) slab({ x0: f.plaza.x0 - TS, x1: f.plaza.x1, z0: f.plaza.z0 - TS, z1: f.plaza.z1 + TS * 2 }, 'tile', ['#6a645a', '#4a463e'], 1.2, 0.005);
    if (f.lot) {
      slab({ x0: f.lot.x0 - TS, x1: f.lot.x1 + TS, z0: f.lot.z0 - TS / 2, z1: f.lot.z1 + TS }, 'carpet', ['#26282a'], 2, 0.005);
      const paint = dark ? B.std({ color: 0xb8b4a8, roughness: 0.9 }) : B.basic({ color: 0xb8b4a8 }); // (by moonlight at night, lit as the road is)
      for (const [bx0, bx1, bz0, bz1] of f.bays) for (let x = bx0; x <= bx1 + 0.01; x += TS * L.K) out.push(B.mesh(B.geo('plane', [0.1, bz1 - bz0 - 0.4], [['rx', -PI / 2], ['t', x, 0.008, (bz0 + bz1) / 2]]), paint));
    }
    const r0 = rngAt(S, drawn); let used = 0; const rnd = () => { used++; return r0(); }; // (counted: the backdrop's canvas takes its draws from where the stream's got to)
    // street lamps: a tall post and a lantern head (their light is a lamp)
    const postMat = B.std({ color: 0x1c1e20, roughness: 0.5, metalness: 0.5 }), headMat = dark ? deadGlass(0xffe2b8) : B.basic({ color: 0xffe2b8 });
    const postGeo = B.geo('cyl', [0.07, 0.1, 6, 8]), headGeo = B.geo('box', [0.34, 0.42, 0.34]), globeGeo = B.geo('sphere', [0.15, 10, 8]);
    for (const [x, z] of f.lamps) { out.push(B.mesh(postGeo, postMat, { p: [x, 3, z] }), B.mesh(headGeo, postMat, { p: [x, 6.15, z] }), B.mesh(globeGeo, headMat, { p: [x, 5.92, z] })); }
    // a lit sign over each shop's door onto the square
    {
      const SIGN: Record<string, string[]> = { cafe: ['CAFE', '#ffd890'], store: ['STORE', '#a8e0ff'], bar: ['BAR', '#ff8ad0'] };
      const roomAt = (fx: number, fz: number) => map.rooms.find((rm) => fx >= rm.x && fx < rm.x + rm.w && fz >= rm.z && fz < rm.z + rm.h && SIGN[rm.type]);
      for (const d of map.doors) {
        const ax = d.axis === 'x' ? 1 : 0, az = 1 - ax, cx = Math.floor(d.x / TS), cz = Math.floor(d.z / TS);
        let rm = null, s = 0;
        for (const k of [-2, 2]) { const q = roomAt(cx + ax * k, cz + az * k); if (q) { rm = q; s = -Math.sign(k); } }
        if (!rm) continue;
        const [txt, col] = SIGN[rm.type];
        const sm = B.tex('sign', { txt, col });
        out.push(B.mesh(B.geo('plane', [1.6, 0.4]), dark ? B.std({ map: sm, roughness: 0.8 }) : B.basic({ map: sm }), { p: [d.x + ax * s * (TS / 2 + 0.03), L.DOOR_H + 0.45, d.z + az * s * (TS / 2 + 0.03)], r: [0, Math.atan2(ax * s, az * s), 0] }));
      }
    }
    // the sky: stars on a dome far off (no fog on them), a moon
    {
      const n = 1600, pos: number[] = [], col: number[] = [];
      for (let i = 0; i < n; i++) {
        const a = rnd() * PI * 2, e = Math.asin(0.08 + rnd() * 0.92), R = 145; // (inside the camera's far plane from anywhere on the field)
        pos.push(Wm / 2 + Math.cos(a) * Math.cos(e) * R, Math.sin(e) * R, Hm / 2 + Math.sin(a) * Math.cos(e) * R);
        const b = 0.35 + rnd() * 0.65, warm = rnd();
        col.push(...[b * (warm < 0.2 ? 1 : 0.85), b * 0.9, b * (warm > 0.8 ? 1 : 0.85)].map((v) => v ** 2.2)); // (linear)
      }
      out.push({ t: 'p', pos, col, m: B.mat('points', { size: 1.6, sizeAttenuation: false, vertexColors: true, fog: false, depthWrite: false }) });
      out.push(B.mesh(B.geo('circle', [9, 32]), B.basic({ color: 0xe8ecf4, fog: false }), { p: [Wm / 2 - 70, 120, -90], look: [Wm / 2, 0, Hm / 2], s: [0.5, 0.5, 0.5] }));
    }
    // the strings: a pole under each end that has one, the wire sagging between, bulbs (or lanterns) along it
    const glow = B.tex('glow');
    const BULB = [0xfff0c8, 0xfff0c8, 0xfff0c8, 0xffb347, 0xff5a4a, 0x6aff7a, 0x5ab0ff, 0xff7ad8], LANTERN = [0xff4030, 0xff9a30, 0xffd84a, 0xff6ab0, 0x4ae0d0, 0xff4030];
    const poles = new Map<string, number[]>(), wire: number[] = [], bulbs: [number[], number][] = [], lanterns: [number[], number][] = [];
    const poleMat = B.std({ color: 0x2a2c2e, roughness: 0.6, metalness: 0.4 });
    for (const s of f.strings) {
      for (const [p, has] of [[s.a, s.pa], [s.b, s.pb]]) if (has) poles.set(p[0].toFixed(1) + ',' + p[2].toFixed(1), p);
      const len = Math.hypot(s.b[0] - s.a[0], s.b[1] - s.a[1], s.b[2] - s.a[2]), sag = G.U.clamp(len * 0.07, 0.25, 1.3);
      const at = (u: number) => [s.a[0] + (s.b[0] - s.a[0]) * u, s.a[1] + (s.b[1] - s.a[1]) * u - sag * 4 * u * (1 - u), s.a[2] + (s.b[2] - s.a[2]) * u];
      for (let i = 0; i < 16; i++) wire.push(...at(i / 16), ...at((i + 1) / 16));
      const lan = s.kind === 'lantern', step = lan ? 1.3 : 0.55, n = Math.max(2, Math.floor(len / step));
      for (let i = 1; i < n; i++) {
        const p = at(i / n);
        if (lan) { p[1] -= 0.22; lanterns.push([p, LANTERN[Math.floor(rnd() * LANTERN.length)]]); }
        else { p[1] += -0.05; bulbs.push([p, BULB[Math.floor(rnd() * BULB.length)]]); }
      }
    }
    const poleGeo = B.geo('cyl', [0.06, 0.08, 1, 8]);
    for (const p of poles.values()) { out.push(B.mesh(poleGeo, poleMat, { s: [1, p[1] + 0.3, 1], p: [p[0], (p[1] + 0.3) / 2, p[2]] }), B.mesh(B.geo('cyl', [0.25, 0.3, 0.12, 10]), poleMat, { p: [p[0], 0.06, p[2]] })); }
    if (wire.length) out.push({ t: 's', pos: wire, m: B.mat('line', { color: 0x0a0a0a }) });
    const lights = (list: [number[], number][], g: LdGeo, size: number) => {
      if (!list.length) return;
      const cols = list.map(([, hex]) => lin(hex));
      out.push({ t: 'i', g, m: dark ? deadGlass(0xffffff) : B.basic({ color: 0xffffff }), n: list.length, tr: list.flatMap(([p]) => p), col: cols.flat() });
      if (dark) return; // (no glow round a dead bulb)
      out.push({ t: 'p', pos: list.flatMap(([p]) => p), col: cols.flatMap((c) => [c[0] * 0.9, c[1] * 0.9, c[2] * 0.9]), m: B.mat('points', { size, map: glow, vertexColors: true, transparent: true, depthWrite: false, blending: 'add' }) });
    };
    lights(bulbs, B.geo('sphere', [0.06, 8, 6]), 0.75);
    lights(lanterns, B.geo('sphere', [0.19, 12, 8], [['s', 1, 1.25, 1]]), 1.9);
    // the stage: a truss over it on four towers, coloured lamps on the front beam throwing beams down over the stage and the
    // front rows, a backdrop with the festival's name lit up
    const st = f.stage;
    if (st) {
      const parts: LdGeo[] = [], H = 7.2, x0 = st.x0 + 0.4, x1 = st.x1 - 0.4, zF = st.z1 - 0.5, zB = st.z0 + 0.5;
      const chord = (ax: number, ay: number, az: number, bx: number, by: number, bz: number) => { const d = [bx - ax, by - ay, bz - az], l = Math.hypot(d[0], d[1], d[2]), q = quatUnit([0, 1, 0], norm(d)); parts.push(B.geo('cyl', [0.025, 0.025, l, 6], [['q', ...q], ['t', (ax + bx) / 2, (ay + by) / 2, (az + bz) / 2], ['ni']])); };
      const truss = (a: number[], b: number[]) => { // a box truss 0.3 m square from a to b, with zig-zag bracing
        let d = [b[0] - a[0], b[1] - a[1], b[2] - a[2]]; const l = Math.hypot(d[0], d[1], d[2]); d = norm(d);
        const u = Math.abs(d[1]) > 0.9 ? [1, 0, 0] : [0, 1, 0], s1 = norm(cross(d, u)).map((v) => v * 0.15), s2 = norm(cross(d, s1)).map((v) => v * 0.15);
        const corners = [[s1[0] + s2[0], s1[1] + s2[1], s1[2] + s2[2]], [s1[0] - s2[0], s1[1] - s2[1], s1[2] - s2[2]], [-s1[0] - s2[0], -s1[1] - s2[1], -s1[2] - s2[2]], [-s1[0] + s2[0], -s1[1] + s2[1], -s1[2] + s2[2]]];
        for (const c of corners) chord(a[0] + c[0], a[1] + c[1], a[2] + c[2], b[0] + c[0], b[1] + c[1], b[2] + c[2]);
        const n = Math.max(2, Math.round(l / 0.45));
        for (let i = 0; i < n; i++) for (let k = 0; k < 4; k += 2) {
          const c1 = corners[k], c2 = corners[(k + 1) % 4], p = (i / n) * l, q = ((i + 1) / n) * l;
          chord(a[0] + d[0] * p + c1[0], a[1] + d[1] * p + c1[1], a[2] + d[2] * p + c1[2], a[0] + d[0] * q + c2[0], a[1] + d[1] * q + c2[1], a[2] + d[2] * q + c2[2]);
        }
      };
      for (const x of [x0, x1]) for (const z of [zF, zB]) truss([x, 0, z], [x, H, z]);
      truss([x0, H, zF], [x1, H, zF]); truss([x0, H, zB], [x1, H, zB]);
      for (const x of [x0, x1]) truss([x, H, zB], [x, H, zF]);
      out.push(B.mesh({ k: 'merge', parts }, B.std({ color: 0xb0b4b8, roughness: 0.4, metalness: 0.8 })));
      // the lamps and their beams
      const COLS = [0xff3fa0, 0x40c0ff, 0xffb040, 0x8a50ff, 0x40ff90, 0xff5040], can = B.geo('cyl', [0.13, 0.11, 0.3, 10]);
      for (let i = 0; i < 8; i++) {
        const x = x0 + 0.6 + (i / 7) * (x1 - x0 - 1.2), color = COLS[i % COLS.length];
        const tx = x + (rnd() - 0.5) * 6, tz = st.z1 + 1 + rnd() * 8, from = [x, H - 0.35, zF], d = [tx - from[0], 0 - from[1], tz - from[2]], l = Math.hypot(d[0], d[1], d[2]);
        const q = quatUnit([0, -1, 0], norm(d));
        out.push(B.mesh(can, dark ? deadGlass(color) : B.basic({ color }), { p: from, q }));
        if (dark) continue; // (no beam from a lamp that's off)
        out.push(B.mesh(B.geo('cone', [1.4, l, 16, 1, 1], [['t', 0, -l / 2, 0]]), B.basic({ color, transparent: true, opacity: 0.07, depthWrite: false, blending: 'add', side: 2 }), { p: from, q }));
      }
      // the backdrop (its canvas draws from the stream too)
      const bt = B.tex('backdrop', { seed: S, at: drawn + used });
      out.push(B.mesh(B.geo('plane', [x1 - x0 - 0.6, 5.2]), dark ? B.std({ map: bt, color: 0x9a9a9a, roughness: 0.9 }) : B.basic({ map: bt, color: 0xcccccc }), { // (a printed banner by moonlight, unlit, at night)
        p: [(x0 + x1) / 2, 1.2 + 2.7, zB - 0.05] }));
      for (let i = 0; i < 40 * 6; i++) rnd();
      // an LED strip along the stage's front edge
      out.push(B.mesh(B.geo('box', [st.x1 - st.x0 - 2.8, 0.04, 0.04]), dark ? deadGlass(0x40c0ff) : B.basic({ color: 0x40c0ff }), { p: [(st.x0 + st.x1) / 2, 1.18, st.z1 + 0.01] }));
    }
    // the arch over the gate (you came in under it), on the fence behind the spawn
    if (f.gate) {
      const g = f.gate, cx = (g.x0 + g.x1) / 2, z = g.z1 + TS / 2, pm = B.std({ color: 0x3a2a4a, roughness: 0.6 });
      for (const s of [-1, 1]) out.push(B.mesh(B.geo('box', [0.7, 5.2, 0.7]), pm, { p: [cx + s * 3.4, 2.6, z] }));
      const welcome = B.tex('welcome');
      const face = () => (dark ? B.std({ map: welcome, roughness: 0.8 }) : B.basic({ map: welcome }));
      out.push(B.mesh(B.geo('box', [7.5, 1.2, 0.2]), [pm, pm, pm, pm, face(), face()], { p: [cx, 4.7, z], r: [0, PI, 0] }));
    }
    return out;
  }

  // The Sandia Crest's surroundings, as functions of what the description holds of it (crestOf: the map's size, the gorge's
  // depth, where the gorge and the viewing site are, the rolling ground): the mountain's height round the map, its noise, how
  // a colour's lit at sundown
  function crestOf(map: LvMap) { const cr = map.crest; return { W: map.W, H: map.H, TS: G.Level.TS, chasm: map.chasm, cr: { CX0: cr.CX0, CX1: cr.CX1, SZ: cr.SZ, site: cr.site }, terrain: map.terrain, t: map.t as ArrayLike<number>, fog: map.theme.fog }; }
  function crestOfDesc(d: LvDesc) { const s = d.floors[0].t as string, t = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) t[i] = s.charCodeAt(i) - 48; return { W: d.W, H: d.H, TS: d.TS, chasm: d.chasm, cr: d.crest, terrain: d.terrain, t, fog: d.crest.fog }; }
  function crestEnv(o: ReturnType<typeof crestOf>) {
    const L = G.Level, cr = o.cr, TS = o.TS, CS = L.CTS, Wm = o.W * TS, Hm = o.H * TS, D = o.chasm, cx = Wm / 2, cz = Hm / 2, f32 = Math.fround;
    const gh = (x: number, z: number) => (o.terrain ? G.World.terrainAt(o.terrain, x, z) : 0);
    const sun = norm([-1, 0.075, 0.32]);
    // a colour (sRGB) as it's lit facing (nx, ny, nz): the sky's blue from above, the sun's orange where it faces west, in linear. ao: how shut in
    const lit = (r: number, g: number, b: number, nx: number, ny: number, nz: number, ao = 1) => {
      const s = Math.max(0, nx * sun[0] + ny * sun[1] + nz * sun[2]), a = (0.4 + 0.16 * ny) * ao;
      return linRGB(Math.min(1, r * (a * 0.95 + s * 1.1)), Math.min(1, g * (a * 0.95 + s * 0.78)), Math.min(1, b * (a * 1.15 + s * 0.55)));
    };
    const hash = (x: number, z: number) => { const s = Math.sin(x * 127.1 + z * 311.7) * 43758.5453; return s - Math.floor(s); };
    const vn = (x: number, z: number) => {
      const xi = Math.floor(x), zi = Math.floor(z), fx = x - xi, fz = z - zi, u = fx * fx * (3 - 2 * fx), v = fz * fz * (3 - 2 * fz);
      const a = hash(xi, zi), b = hash(xi + 1, zi), c = hash(xi, zi + 1), d = hash(xi + 1, zi + 1);
      return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
    };
    const fbm = (x: number, z: number) => vn(x, z) * 0.5 + vn(x * 2.1 + 5, z * 2.1) * 0.25 + vn(x * 4.3, z * 4.3 + 9) * 0.125 - 0.4375;
    const sm = (a: number, b: number, x: number) => { const k = G.U.clamp((x - a) / (b - a), 0, 1); return k * k * (3 - 2 * k); }; // (smoothstep)
    // ---- the mountain: the height of the ground at (x, z), metres from the summits' (fallen with them along the saddle: crestFall)
    const c0 = cr.CX0 * CS, c1 = (cr.CX1 + 1) * CS, zs = (cr.SZ + 1) * CS, STEP = 10;
    const height = (x: number, z: number) => {
      const w = -x, e = x - Wm, n = -z, s = z - Hm, off = Math.max(0, w, e, n, s), along = Math.max(0, n, s);
      // (the west face, sheer, down to the valley floor and on gently down to the city; the east side, falling more gently. Not
      // to scale: the valley's far nearer than it is, so it's seen over the wall)
      let h = w > 0 ? -Math.min(170, 1.1 * w + 0.004 * w * w) - Math.max(0, w - 140) * 0.05 : e > 0 ? -Math.min(300, 0.5 * e + 0.0012 * e * e) : -0.6;
      h -= 0.1 * along + 0.0003 * along * along; // (the crest falling away north and south)
      h += L.crestFall(cr, x);
      h += fbm(x * 0.012, z * 0.012) * Math.min(1, off / 30) * (5 + 26 * (x < 0 ? G.U.clamp((h + 165) / 40, 0, 1) : 1)); // (rough on the mountain, flat on the plain)
      // the gorge, on under the rims a step (their cliffs hide that) and on south past the map, deeper and wider as it goes
      const sp = Math.max(0, s), half = (c1 - c0) / 2 + STEP + sp * 0.2, gx = half - Math.abs(x - (c0 + c1) / 2);
      if (gx > 0 && z > zs - STEP) {
        const fl = -D - sp * 0.35 + (sp > 0 ? fbm(x * 0.05, z * 0.05) * 8 : 0); // (flat where it's solid: on the map)
        h = Math.min(h, sp > 0 ? fl + Math.max(0, 30 - gx) * 1.6 : fl);
      }
      return h;
    };
    return { W: o.W, H: o.H, t: o.t, TS, Wm, Hm, D, cx, cz, f32, sun, lit, hash, vn, fbm, sm, height, c0, c1, zs, STEP, gh };
  }
  function crestGround(E: ReturnType<typeof crestEnv>): LdGeo {
    const { cx, cz, f32, height, hash, fbm, lit, D, c0, c1, STEP } = E;
    // the ground: a 3 km square, N x N quads (a plane's grid: row by row from the north-west corner), each vertex at the
    // mountain's height, coloured by how steep it is there and what grows (the normals as three.js works them out: summed
    // over the faces round a vertex, in single precision)
      const SIZE = 3000, N = 240, N1 = N + 1, seg = SIZE / N, nv = N1 * N1, P = new Float32Array(nv * 3);
      for (let iy = 0, i = 0; iy <= N; iy++) for (let ix = 0; ix <= N; ix++, i++) {
        const x = f32(ix * seg - SIZE / 2) + cx, z = f32(iy * seg - SIZE / 2) + cz;
        P[i * 3] = x; P[i * 3 + 1] = height(x, z); P[i * 3 + 2] = z;
      }
      const idx: number[] = [];
      for (let iy = 0; iy < N; iy++) for (let ix = 0; ix < N; ix++) { const a = ix + N1 * iy, b = ix + N1 * (iy + 1), c = ix + 1 + N1 * (iy + 1), d = ix + 1 + N1 * iy; idx.push(a, b, d, b, c, d); }
      const Nn = new Float32Array(nv * 3);
      for (let k = 0; k < idx.length; k += 3) {
        const A = idx[k] * 3, Bv = idx[k + 1] * 3, C = idx[k + 2] * 3;
        const cbx = P[C] - P[Bv], cby = P[C + 1] - P[Bv + 1], cbz = P[C + 2] - P[Bv + 2], abx = P[A] - P[Bv], aby = P[A + 1] - P[Bv + 1], abz = P[A + 2] - P[Bv + 2];
        const nx = cby * abz - cbz * aby, ny = cbz * abx - cbx * abz, nz = cbx * aby - cby * abx;
        for (const o of [A, Bv, C]) { Nn[o] += nx; Nn[o + 1] += ny; Nn[o + 2] += nz; }
      }
      for (let i = 0; i < nv; i++) { const o = i * 3, l = Math.sqrt(Nn[o] * Nn[o] + Nn[o + 1] * Nn[o + 1] + Nn[o + 2] * Nn[o + 2]) || 1, k = 1 / l; Nn[o] *= k; Nn[o + 1] *= k; Nn[o + 2] *= k; }
      const col: number[] = [];
      for (let i = 0; i < nv; i++) {
        const x = P[i * 3], y = P[i * 3 + 1], z = P[i * 3 + 2], ny = Nn[i * 3 + 1], steep = 1 - ny, v = 0.86 + hash(x * 0.37, z * 0.37) * 0.24, fz = fbm(x * 0.02, z * 0.02);
        let c;
        if (y < -D + 3 && y > -D - 40 && x > c0 - STEP && x < c1 + STEP) c = [0.5, 0.42, 0.39]; // scree on the gorge's floor
        else if (x < -100 && y < -150 && steep < 0.2) c = fz > 0.05 ? [0.58, 0.5, 0.42] : [0.66, 0.58, 0.48]; // the valley's desert floor
        else if (steep > 0.3 + fz * 0.2) c = [0.72, 0.5, 0.44]; // granite
        else if (y > -120) c = fz > 0.12 ? [0.6, 0.47, 0.42] : [0.2, 0.27, 0.18]; // spruce and fir, ponderosa lower down, rock showing through
        else c = [0.44, 0.41, 0.31]; // piñon and juniper
        col.push(...lit(c[0] * v, c[1] * v, c[2] * v, Nn[i * 3], ny, Nn[i * 3 + 2]));
      }
      return { k: 'buf', pos: Array.from(P), col, idx };
  }
  function crestCliffs(E: ReturnType<typeof crestEnv>): LdGeo {
    const { TS, D, vn, fbm, lit } = E;
    // ---- the gorge's cliffs: down from every edge of the summits' ground that has the gorge's air beside it, ragged below the
    // rim (from the rim's own height, the bands closer together the less far down the gorge's floor is from it)
      const { W, H, t } = E, cp: number[] = [], cc: number[] = [], bands = [0, -0.8, -2.2, -4.5, -7.5, -11, -15, -20, -26, -32, -38, -D - 1.5];
      const jit = (x: number, y: number, z: number, top: number) => { const a = Math.min(1, (top - y) / 2.5) * 1.3; return [x + (vn(x * 0.45 + 7, y * 0.22 + z * 0.45) - 0.5) * 2 * a, z + (vn(z * 0.45 - 3, y * 0.22 + x * 0.45) - 0.5) * 2 * a]; };
      for (let z = 0; z < H; z++) for (let x = 0; x < W; x++) {
        if (t[z * W + x] === 5) continue;
        for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nx = x + dx, nz = z + dz;
          if (nx < 0 || nz < 0 || nx >= W || nz >= H || t[nz * W + nx] !== 5) continue;
          const ex = (x + 0.5 + dx * 0.5) * TS, ez = (z + 0.5 + dz * 0.5) * TS, ax = dz ? TS / 2 : 0, az = dx ? TS / 2 : 0;
          const ends = [[ex - ax, ez - az], [ex + ax, ez + az]], tops = ends.map(([px, pz]) => E.gh(px, pz)), at = (e: number, k: number) => tops[e] + bands[k] * (tops[e] + D + 1.5) / (D + 1.5);
          // in bands down the face, each a pair of triangles lit by its own slant (ragged: facets catch the sun or don't); streaks
          // of darker varnish down it, paler bands across
          for (let b = 0; b + 1 < bands.length; b++) for (const q of [[[0, b], [1, b], [1, b + 1]], [[0, b], [1, b + 1], [0, b + 1]]]) {
            const tri = q.map(([e, k]) => { const y = at(e, k), [px, pz] = jit(ends[e][0], y, ends[e][1], tops[e]); return [px, y, pz]; });
            let e1 = norm(cross([tri[1][0] - tri[0][0], tri[1][1] - tri[0][1], tri[1][2] - tri[0][2]], [tri[2][0] - tri[0][0], tri[2][1] - tri[0][1], tri[2][2] - tri[0][2]]));
            if (e1[0] * dx + e1[2] * dz < 0) e1 = [-e1[0], -e1[1], -e1[2]]; // (facing out over the gorge)
            for (const p of tri) {
              const streak = vn((p[0] + p[2]) * 0.6, 3.3), band = fbm(p[1] * 0.25 + (p[0] + p[2]) * 0.02, 1.7), ao = 0.45 + 0.55 * (1 + p[1] / (D + 2)), k2 = 0.85 + band * 0.45 - (streak > 0.7 ? 0.18 : 0);
              cp.push(p[0], p[1], p[2]);
              cc.push(...lit(0.72 * k2, 0.5 * k2, 0.45 * k2, e1[0], e1[1], e1[2], ao));
            }
          }
        }
      }
      return { k: 'buf', pos: cp, col: cc };
  }
  // a procedural surface (k 'proc'), from the description alone: its vertices (and colours, normals, texture coordinates)
  function proc(d: LvDesc, g: LdGeo): LdGeo {
    switch ((g as any).fn) {
      case 'crest.ground': return crestGround(crestEnv(crestOfDesc(d)));
      case 'crest.cliffs': return crestCliffs(crestEnv(crestOfDesc(d)));
      case 'terrain': return terrainSurface(d);
    }
    throw new Error('level: no surface ' + (g as any).fn);
  }
  // The rolling ground (desc.terrain), on the ground floor: each cell off level at 0 that has a floor (not the open air of a
  // gorge, not a catwalk's grating) as the two triangles G.World.terrainAt walks on (corners 00, 01, 10 and 10, 01, 11),
  // textured as a tile is, lit smooth (each corner's normal from the heights either side of it)
  function terrainSurface(d: LvDesc): LdGeo {
    const tr = d.terrain, TS = d.TS, W = d.W, H = d.H, t = d.floors[0].t as string, gr = d.floors[0].grate as string | null, V = tr.v, VW = tr.VW;
    const raised = (i: number) => { const k = ((i / W) | 0) * VW + (i % W); return Math.abs(V[k]) > 1e-3 || Math.abs(V[k + 1]) > 1e-3 || Math.abs(V[k + VW]) > 1e-3 || Math.abs(V[k + VW + 1]) > 1e-3; };
    const hv = (x: number, z: number) => V[G.U.clamp(z, 0, tr.VH - 1) * VW + G.U.clamp(x, 0, VW - 1)];
    const nOf = (x: number, z: number) => { const nx = (hv(x - 1, z) - hv(x + 1, z)) / (2 * TS), nz = (hv(x, z - 1) - hv(x, z + 1)) / (2 * TS), l = Math.hypot(nx, 1, nz); return [nx / l, 1 / l, nz / l]; };
    const UV = [[0, 1], [1, 1], [0, 0], [1, 0]]; // (a cell's corners 00, 10, 01, 11, as a tile's are)
    const pos: number[] = [], nrm: number[] = [], uv: number[] = [];
    for (let i = 0; i < W * H; i++) {
      if (t.charCodeAt(i) === 53 || (gr && gr.charCodeAt(i) !== 48) || !raised(i)) continue;
      const x = i % W, z = (i / W) | 0, cs = [[x, z], [x + 1, z], [x, z + 1], [x + 1, z + 1]];
      for (const c of [0, 2, 1, 1, 2, 3]) { const [vx, vz] = cs[c], nn = nOf(vx, vz); pos.push(vx * TS, hv(vx, vz), vz * TS); nrm.push(nn[0], nn[1], nn[2]); uv.push(UV[c][0], UV[c][1]); }
    }
    return { k: 'buf', pos, nrm, uv };
  }

  // ---------------------------------------------------------------- the Sandia Crest's world past its walls
  // The evening sky, the sun going down over the West Mesa, the ranges round the horizon; the mountain under the summits, its
  // granite west face dropping to the city and its forested east side; the gorge's cliffs down to its floor; Albuquerque's
  // lights; the tramway; the outcrops' rough tops; the ziplines, the flat roofs and their ladders, the guard rail, the
  // greenhouse's glass roof. What's far off is unlit (its colours lit as at sundown, the sun low in the west, here).
  function crest(map: LvMap, B: LdB): LdNode[] {
    const L = G.Level, cr = map.crest, TS = L.TS, CS = L.CTS, Wm = map.W * TS, Hm = map.H * TS, D = map.chasm, rnd = G.U.rng((map.seed ^ 0x5a7d1a) >>> 0), out: LdNode[] = [];
    const E = crestEnv(crestOf(map)), { cx, cz, f32, sun, lit, vn, fbm, sm, height, c0, c1, zs } = E;
    // the ground: a 3 km square of the mountain round the map, and the gorge's cliffs (procedural surfaces, made from the
    // description: proc 'crest.ground' and 'crest.cliffs', crestGround and crestCliffs)
    out.push(B.mesh({ k: 'proc', fn: 'crest.ground' } as LdGeo, B.basic({ vertexColors: true }), { ro: 1 })); // (renderOrder: left out of the merge)
    out.push(B.mesh({ k: 'proc', fn: 'crest.cliffs' } as LdGeo, B.basic({ vertexColors: true, side: 2 }), { ro: 1 }));
    // ---- trees on the mountain (none on the west face's cliffs, nor down on the plain), a few on the gorge's floor; boulders down there
    {
      const trees: number[][] = [];
      for (let a = 0; a < 6000 && trees.length < 2200; a++) {
        const x = cx + (rnd() - 0.5) * 1500, z = cz + (rnd() - 0.5) * 1500;
        if (x > -14 && x < Wm + 14 && z > -14 && z < Hm + 14) continue;
        const h = height(x, z), sl = Math.abs(height(x + 4, z) - h) + Math.abs(height(x, z + 4) - h);
        if (sl > 6 || (x < -100 && h < -150) || (x < 0 && rnd() < 0.6)) continue;
        trees.push([x, h - 0.5, z, 5 + rnd() * 8]);
      }
      for (let a = 0; a < 24; a++) trees.push([c0 + 4 + rnd() * (c1 - c0 - 8), -D - 0.3, zs + 4 + rnd() * (Hm - zs - 4), 6 + rnd() * 8]);
      const mx: number[] = [], col: number[] = [];
      for (const [x, y, z, h] of trees) { mx.push(...compose([x, y, z], [0, 0, 0, 1], [h * 0.3, h, h * 0.3])); const g = 0.85 + rnd() * 0.3; col.push(...lit(0.17 * g, 0.25 * g, 0.16 * g, -0.5, 0.75, 0.2, y < -D + 1 ? 0.6 : 1)); }
      out.push({ t: 'i', g: B.geo('cone', [1, 1, 6], [['t', 0, 0.5, 0]]), m: B.basic({ color: 0xffffff }), n: trees.length, mx, col, ro: 1 });
      const rm: number[] = [], rc: number[] = [];
      for (let i = 0; i < 70; i++) {
        const s = 0.5 + rnd() * rnd() * 2.5, q = quatEuler(rnd() * 3, rnd() * 3, rnd() * 3);
        const px = c0 + 1 + rnd() * (c1 - c0 - 2), pz = zs + 1 + rnd() * (Hm - zs + 30);
        rm.push(...compose([px, -D - s * 0.3, pz], q, [s, s * (0.6 + rnd() * 0.4), s]));
        rc.push(...lit(0.62, 0.46, 0.42, 0.3, 0.8, 0.2, 0.62 + rnd() * 0.2));
      }
      out.push({ t: 'i', g: B.geo('ico', [1, 0]), m: B.basic({ color: 0xffffff }), n: 70, mx: rm, col: rc, ro: 1 });
    }
    // ---- Albuquerque: the city's lights on the valley floor west of the mountain, a grid of streets (the big roads brighter, a
    // dark strip where the river runs), glowing through the haze (their own light, fainter further off)
    {
      const lp: number[] = [], lc: number[] = [];
      const reachK = (x: number, z: number) => 1 - sm(850, 1300, Math.hypot(x - cx, z - cz)); // (out to 1300 m from the summits, thinning toward there)
      const lamp = (x: number, z: number, hex: number, k: number) => { const f = k * 0.6 * reachK(x, z); lp.push(x, height(x, z) + 2, z); const c = lin(hex); lc.push(c[0] * f, c[1] * f, c[2] * f); };
      const X0 = -1300, X1 = -260, Z0 = -900, Z1 = 1000, river = (z: number) => -1000 + Math.sin(z / 210) * 60 + Math.sin(z / 73) * 15;
      const city = (x: number, z: number) => x < X1 && Math.abs(x - river(z)) > 28 && height(x, z) < -155 && fbm(x * 0.006, z * 0.006) > -0.12 && rnd() < reachK(x, z);
      const LIGHTS = [0xffb25a, 0xffb25a, 0xffc070, 0xfff1dc, 0xdfe8ff], U8 = () => LIGHTS[Math.floor(rnd() * LIGHTS.length)];
      for (let gx = X0; gx < X1; gx += 34) for (let z = Z0; z < Z1; z += 12) if (city(gx, z) && rnd() < 0.45) lamp(gx + (rnd() - 0.5) * 3, z, U8(), 0.75);
      for (let gz = Z0; gz < Z1; gz += 34) for (let x = X0; x < X1; x += 12) if (city(x, gz) && rnd() < 0.45) lamp(x, gz + (rnd() - 0.5) * 3, U8(), 0.75);
      for (let i = 0; i < 2500; i++) { const x = X0 + rnd() * (X1 - X0), z = Z0 + rnd() * (Z1 - Z0); if (city(x, z)) lamp(x, z, U8(), 0.5); } // (homes, signs)
      for (let z = Z0; z < Z1; z += 5) { const x = -700 + z * 0.06; if (Math.abs(x - river(z)) > 28 && rnd() < reachK(x, z)) { lamp(x, z, 0xfff4e0, 1); lamp(x + 6, z + 2, 0xff4030, 0.7); } } // the interstate north-south
      for (let x = X0; x < X1; x += 5) { const z = cz + 90; if (Math.abs(x - river(z)) > 28 && rnd() < reachK(x, z)) { lamp(x, z, 0xfff4e0, 1); lamp(x + 2, z + 6, 0xff4030, 0.7); } } // and east-west
      out.push({ t: 'p', pos: lp, col: lc, m: B.mat('points', { size: 2.8, sizeAttenuation: true, vertexColors: true, transparent: true, depthWrite: false, blending: 'add', fog: false }), ro: 2 });
    }
    // ---- the sky: blue overhead, gold toward the sun and pink opposite it (the belt of Venus over the earth's shadow), the
    // haze's colour (the fog's) at the horizon and under it. A sphere of 64 x 32 (three's: rows from the top), a colour a vertex.
    {
      const fogL = lin(map.theme.fog), haze = fogL.map(l2s), mix = (a: number[], b: number[], k: number) => a.map((v, i) => v + (b[i] - v) * k);
      const gold = [1.0, 0.76, 0.5], belt = [0.85, 0.6, 0.62], shadow = [0.55, 0.53, 0.66], upper = [0.5, 0.58, 0.78], zenith = [0.2, 0.32, 0.56];
      const R = 1300, WS = 64, HS = 32, skc: number[] = [];
      for (let iy = 0; iy <= HS; iy++) for (let ix = 0; ix <= WS; ix++) {
        const u = ix / WS, v = iy / HS, th0 = v * PI, ph = u * PI * 2;
        const dv = norm([f32(-R * Math.cos(ph) * Math.sin(th0)), f32(R * Math.cos(th0)), f32(R * Math.sin(ph) * Math.sin(th0))]);
        const e = Math.asin(dv[1]), hl = Math.hypot(dv[0], dv[2]) || 1, toward = (dv[0] * sun[0] + dv[2] * sun[2]) / hl / Math.hypot(sun[0], sun[2]), sunK = Math.max(0, toward) ** 2, anti = Math.max(0, -toward);
        let c = mix(mix(belt, gold, sunK), shadow, anti * (1 - sm(0.0, 0.06, e)));
        c = mix(c, belt, anti * sm(0.03, 0.08, e) * (1 - sm(0.1, 0.3, e)) * 0.7);
        c = mix(c, upper, sm(0.06, 0.5, e)); c = mix(c, zenith, sm(0.45, 1.3, e));
        const g = Math.max(0, dv[0] * sun[0] + dv[1] * sun[1] + dv[2] * sun[2]); c = c.map((q, k) => Math.min(1, q + gold[k] * (g ** 24 * 0.45 + g ** 400 * 0.6)));
        c = mix(haze, c, sm(-0.01, 0.035, e)); // (down to the haze at the horizon)
        skc.push(...linRGB(c[0], c[1], c[2]));
      }
      out.push(B.mesh(Object.assign(B.geo('sphere', [R, WS, HS]), { col: skc }), B.basic({ vertexColors: true, side: 1, fog: false, depthWrite: false }), { p: [cx, 0, cz], ro: -3 }));
      out.push(B.mesh(B.geo('circle', [20, 32]), B.basic({ color: 0xfff0d4, fog: false, depthWrite: false }), { p: [cx + sun[0] * 1200, sun[1] * 1200, cz + sun[2] * 1200], look: [cx, 0, cz], ro: -2 }));
      // the ranges round the horizon, hazy: Mount Taylor out west, the West Mesa's low line, the Jemez to the north, the Manzanos
      // south, the Sangres far off to the north-east
      const peaks = [[Math.atan2(-0.35, -1), 0.1, 0.02], [Math.atan2(-0.9, -0.45), 0.45, 0.014], [Math.atan2(1, 0.15), 0.25, 0.024], [Math.atan2(-0.8, 0.55), 0.3, 0.009], [PI, 0.9, 0.004]];
      const rp: number[] = [], rc: number[] = [], R0 = 1200;
      for (let k = 0; k <= 360; k++) {
        const az = (k / 360) * PI * 2 - PI;
        let el = 0.002 + (vn(k * 0.12, 3) - 0.5) * 0.004;
        for (const [a, w, hgt] of peaks) { const d = Math.abs(Math.atan2(Math.sin(az - a), Math.cos(az - a))); el += hgt * Math.exp(-((d / w) ** 2)); }
        const x = cx + Math.cos(az) * R0, z = cz + Math.sin(az) * R0, toward = Math.max(0, Math.cos(az - Math.atan2(sun[2], sun[0])));
        const top = mix(mix([0.62, 0.52, 0.64], [0.78, 0.55, 0.5], toward ** 2), haze, 0.35);
        rp.push(x, R0 * Math.tan(el), z, x, -260, z);
        for (const c of [top, haze]) rc.push(...linRGB(c[0], c[1], c[2]));
      }
      const ri: number[] = []; for (let k = 0; k < 360; k++) { const a = k * 2; ri.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
      out.push(B.mesh({ k: 'buf', pos: rp, col: rc, idx: ri }, B.basic({ vertexColors: true, side: 2, fog: false, depthWrite: false }), { ro: -1 }));
    }
    // ---- the tramway: its top station at the west edge of the summit, two cables sagging down the face to the city, a tower on
    // a spur on the way, a car on its way up
    {
      const top0 = [-10.5, -3, 52], foot = [-700, height(-700, 120) + 14, 120], sag = 40, dark = B.basic({ color: 0x2a2c30 });
      const cable = (s: number, off: number) => [top0[0] + (foot[0] - top0[0]) * s, top0[1] + (foot[1] - top0[1]) * s - sag * 4 * s * (1 - s), top0[2] + (foot[2] - top0[2]) * s + off];
      for (const off of [-2.5, 2.5]) { const pts: number[] = []; for (let i = 0; i <= 120; i++) pts.push(...cable(i / 120, off)); out.push({ t: 'l', pos: pts, m: B.mat('line', { color: 0x30302e }) }); }
      const tw = cable(0.33, 0), tgy = height(tw[0], tw[2]);
      out.push(B.mesh(B.geo('cyl', [0.8, 2.6, tw[1] + 2 - tgy, 4]), dark, { p: [tw[0], (tw[1] + 2 + tgy) / 2, tw[2]], ro: 1 }));
      out.push(B.mesh(B.geo('box', [1.2, 1, 7]), dark, { p: [tw[0], tw[1] + 1.5, tw[2]], ro: 1 }));
      const car = cable(0.12, -2.5), carG: LdNode[] = [];
      const part = (w: number, h: number, d: number, hex: number, y: number) => carG.push(B.mesh(B.geo('box', [w, h, d]), B.basic({ color: hex }), { p: [0, y, 0] }));
      part(3.6, 2.4, 2.6, 0xb02a26, -4.2); part(3.62, 0.5, 2.62, 0xe8e4dc, -3.7); part(3.64, 0.8, 2.64, 0x22282e, -4.2); part(0.25, 3.0, 0.25, 0x3a3c40, -1.6); part(1.6, 0.4, 0.5, 0x3a3c40, 0);
      out.push(B.group(carG, { p: car, r: [0, Math.atan2(foot[2] - top0[2], top0[0] - foot[0]), 0] }));
      // (the station hangs off the face below the wall, its roof under your sight line over it: a concrete box, a dark band of glass)
      out.push(B.mesh(B.geo('box', [9, 9, 13]), B.std({ color: 0xb4ab9e, roughness: 0.9 }), { p: [-6, -6.2, 52] }));
      out.push(B.mesh(B.geo('box', [9.1, 1.6, 13.1]), B.std({ color: 0x1c2228, roughness: 0.2, metalness: 0.5 }), { p: [-6, -3.4, 52] }));
    }
    // ---- the outcrops' tops, rough (and a lump or two at their feet): granite like their walls (G.Level.crestCaps)
    {
      const capList = L.crestCaps(map);
      out.push({ t: 'i', g: B.geo('ico', [1, 0]), m: B.std({ color: 0xffffff, roughness: 0.95, flatShading: true }), n: Math.max(1, capList.length), cnt: capList.length, mx: capList.flatMap((c) => c.m), col: capList.flatMap((c) => linRGB(0.69 * c.p, 0.5 * c.p, 0.45 * c.p)), l1: 1 });
    }
    // ---- the ziplines: a steel pole each end on the rim, an arm out over the wall to the cable, a stay back to a footing; the
    // cable sagging between (a tube along a curve through its points); at the start, the trolley and its grab bar waiting
    {
      const steel = B.std({ color: 0x4a4e52, roughness: 0.5, metalness: 0.6 }), cableM = B.std({ color: 0x26282a, roughness: 0.4, metalness: 0.7 }), yel = B.std({ color: 0xe0b020, roughness: 0.5 });
      for (const l of cr.lines) {
        const pts: number[] = []; for (let i = 0; i <= 200; i++) pts.push(...L.zipPoint(l, i / 200));
        out.push(B.mesh({ k: 'tube', pts, a: [400, 0.018, 5] }, cableM));
        for (const p of [l.a, l.b]) {
          const sx = Math.sign(p === l.a ? l.a[0] - l.b[0] : l.b[0] - l.a[0]), px = p[0] + sx * 1.3, g = l.gy[p === l.a ? 0 : 1], h = p[1] + 0.5 - g; // (sx: back onto the land; g, the ground it stands on)
          out.push(B.mesh(B.geo('cyl', [0.11, 0.14, h, 10]), steel, { p: [px, g + h / 2, p[2]] }));
          out.push(B.mesh(B.geo('box', [1.5, 0.12, 0.12]), steel, { p: [px - sx * 0.6, p[1] + 0.12, p[2]] }));
          const top = [px, g + h, p[2]], foot = [px + sx * 2.6, g, p[2]], dd = [top[0] - foot[0], top[1] - foot[1], top[2] - foot[2]];
          out.push(B.mesh(B.geo('cyl', [0.03, 0.03, Math.hypot(dd[0], dd[1], dd[2]), 6]), steel, { p: [(top[0] + foot[0]) * 0.5, (top[1] + foot[1]) * 0.5, (top[2] + foot[2]) * 0.5], q: quatUnit([0, 1, 0], norm(dd)) }));
          out.push(B.mesh(B.geo('cyl', [0.13, 0.13, 0.06, 14]), yel, { r: [PI / 2, 0, 0], p: [p[0], p[1] + 0.02, p[2]] }));
        }
        out.push({ t: 'h', k: 'zipkit', p: l.a.slice(0, 3), r: [0, Math.atan2(l.b[0] - l.a[0], l.b[2] - l.a[2]), 0] }); // (the next one, waiting: js/levelview.ts zipKit)
      }
    }
    // ---- the flat roofs (crest.roofs): a deck of grey pavers over the slab; the viewing building's out to the edge of its walls'
    // tiles, a steel railing round it on a concrete kerb. The ladder up to each on its east wall (crest.ladders), steel, its rails
    // carried on past the top to hold as you step off (over a parapet: up over it and down onto the roof, a hoop)
    for (const R of cr.roofs || []) {
      const WH = L.WALL_H, Bt = R.gy + WH, dt = lvTex(B, 'floor', '#6e6a66', [(R.x1 - R.x0) / 2, (R.z1 - R.z0) / 2]);
      // (one material to a mesh: the level's meshes are merged by material, so a box's other faces would go)
      out.push(B.mesh(B.geo('box', [R.x1 - R.x0, R.y - Bt, R.z1 - R.z0]), B.std({ color: 0x8a8580, roughness: 0.95 }), { p: [(R.x0 + R.x1) / 2, (Bt + R.y) / 2, (R.z0 + R.z1) / 2], l1: 1 }));
      out.push(B.mesh(B.geo('plane', [R.x1 - R.x0, R.z1 - R.z0]), B.std({ map: dt, roughness: 0.95 }), { r: [-PI / 2, 0, 0], p: [(R.x0 + R.x1) / 2, R.y + 0.004, (R.z0 + R.z1) / 2], l1: 1 }));
      if (!R.parapet) continue;
      // (its railing: a concrete kerb, steel posts about every 1.3 m, a top rail and a mid rail, open between: G.Level.crestSolids)
      const P = L.PARAPET, conc = B.std({ color: 0xa9a49c, roughness: 0.9 }), st = B.std({ color: 0x9aa0a4, roughness: 0.35, metalness: 0.8 });
      for (const [x0, z0, x1, z1] of L.parapetRuns(R)) {
        const along = x1 - x0 >= z1 - z0, len = along ? x1 - x0 : z1 - z0, cx2 = (x0 + x1) / 2, cz2 = (z0 + z1) / 2;
        out.push(B.mesh(B.geo('box', [x1 - x0, P.KERB, z1 - z0]), conc, { p: [cx2, R.y + P.KERB / 2, cz2], l1: 1 }));
        for (const [h, r] of [[P.H - 0.025, 0.025], [0.55, 0.012]]) out.push(B.mesh(B.geo('cyl', [r, r, len, 8]), st, { r: along ? [0, 0, PI / 2] : [PI / 2, 0, 0], p: [cx2, R.y + h, cz2] }));
        const n = Math.max(1, Math.round(len / 1.3));
        for (let i = 0; i <= n; i++) { const q = -len / 2 + 0.04 + (len - 0.08) * i / n; out.push(B.mesh(B.geo('box', [0.04, P.H - P.KERB - 0.03, 0.04]), st, { p: [along ? cx2 + q : cx2, R.y + P.KERB + (P.H - P.KERB - 0.03) / 2, along ? cz2 : cz2 + q] })); }
      }
    }
    for (const Ld of cr.ladders || []) {
      const rail = B.std({ color: 0x5a5e62, roughness: 0.45, metalness: 0.7 }), x = Ld.x + 0.1, y0 = Ld.y0 || 0, hi = Ld.top + (Ld.over ? Ld.over + 0.2 : 1.0) - y0;
      for (const s of [-1, 1]) out.push(B.mesh(B.geo('box', [0.05, hi, 0.05]), rail, { p: [x, y0 + hi / 2, Ld.z + s * 0.24] }));
      for (let y = 0.3; y < Ld.top - y0; y += 0.3) out.push(B.mesh(B.geo('cyl', [0.016, 0.016, 0.48, 6]), rail, { r: [PI / 2, 0, 0], p: [x, y0 + y, Ld.z] }));
      for (const s of [-1, 1]) { const bg = B.geo('box', [0.12, 0.04, 0.04]); out.push(B.mesh(bg, rail, { p: [Ld.x + 0.04, y0 + 1.5, Ld.z + s * 0.24] }), B.mesh(bg, rail, { p: [Ld.x + 0.04, Ld.top - 0.6, Ld.z + s * 0.24] })); } // (brackets to the wall)
      if (Ld.over) for (const s of [-1, 1]) { // (the hoop over the parapet: across it at the rails' top, and down onto the roof inside it)
        const reach = 0.1 + L.PARAPET.T + 0.35;
        out.push(B.mesh(B.geo('box', [reach, 0.05, 0.05]), rail, { p: [x - reach / 2, y0 + hi, Ld.z + s * 0.24] }));
        out.push(B.mesh(B.geo('box', [0.05, y0 + hi - Ld.top, 0.05]), rail, { p: [x - reach, (y0 + hi + Ld.top) / 2, Ld.z + s * 0.24] }));
      }
    }
    // ---- the guard rail inside the viewing building's front glass (crest.guard): brushed steel, a post at every mullion
    if (cr.guard) {
      const [gx0, gx1, gz] = cr.guard, gy = L.crestFall(cr, (gx0 + gx1) / 2), H = L.GUARD_H, st = B.std({ color: 0x9aa0a4, roughness: 0.35, metalness: 0.8 });
      out.push(B.mesh(B.geo('cyl', [0.025, 0.025, gx1 - gx0, 10]), st, { r: [0, 0, PI / 2], p: [(gx0 + gx1) / 2, gy + H - 0.025, gz] }));
      out.push(B.mesh(B.geo('cyl', [0.012, 0.012, gx1 - gx0, 8]), st, { r: [0, 0, PI / 2], p: [(gx0 + gx1) / 2, gy + 0.5, gz] }));
      for (let x = gx0 + 0.04; x <= gx1 - 0.03; x += (gx1 - gx0 - 0.08) / Math.round((gx1 - gx0) / (2 * TS))) out.push(B.mesh(B.geo('box', [0.04, H - 0.05, 0.04]), st, { p: [x, gy + (H - 0.05) / 2, gz] }));
    }
    // ---- the greenhouse's roof: a ridge down its length, white glazing bars, glass between
    {
      const [gx0, gz0] = cr.gh, x0 = gx0 * CS + 1, x1 = (gx0 + 6) * CS + 1, z0 = gz0 * CS + 1, z1 = (gz0 + 8) * CS + 1, ridge = 2.2, Y = L.groundHeight(map, x0, z0) + L.WALL_H, half = (x1 - x0) / 2, slope = Math.hypot(half, ridge), ang = Math.atan2(ridge, half);
      const bar = B.std({ color: 0xeceae4, roughness: 0.5 }), pane = B.std({ color: 0x9fb8c0, transparent: true, opacity: 0.22, roughness: 0.05, metalness: 0.4, depthWrite: false, side: 2 });
      for (const s of [-1, 1]) { // (each slope: level, then tipped down toward its eave)
        out.push(B.mesh(B.geo('plane', [slope, z1 - z0], [['rx', -PI / 2]]), pane, { r: [0, 0, -s * ang], p: [(x0 + x1) / 2 + s * half / 2, Y + ridge / 2, (z0 + z1) / 2], ro: 2 }));
        for (let z = z0; z <= z1 + 0.01; z += 2) out.push(B.mesh(B.geo('box', [slope, 0.06, 0.06]), bar, { r: [0, 0, -s * ang], p: [(x0 + x1) / 2 + s * half / 2, Y + ridge / 2, z] }));
      }
      out.push(B.mesh(B.geo('box', [0.12, 0.12, z1 - z0]), bar, { p: [(x0 + x1) / 2, Y + ridge, (z0 + z1) / 2] }));
      for (const z of [z0, z1]) {
        out.push(B.mesh({ k: 'shape', pts: [-half, 0, half, 0, 0, ridge] }, pane, { p: [(x0 + x1) / 2, Y, z], ro: 2 }));
        out.push(B.mesh(B.geo('box', [0.06, ridge, 0.06]), bar, { p: [(x0 + x1) / 2, Y + ridge / 2, z] }));
      }
    }
    return out;
  }

  // ---------------------------------------------------------------- fingerprints (the golden, the screens against the simulation)
  // FNV-1a over the canonical JSON of a part of the description, numbers rounded to 1e-4 (so a last-bit difference in a
  // platform's sin or pow doesn't show, and a real one does), keys in a fixed order
  function canon(v: any): string {
    if (v === null || v === undefined) return 'null';
    if (typeof v === 'number') { if (!Number.isFinite(v)) return v > 0 ? '"inf"' : v < 0 ? '"-inf"' : '"nan"'; const r = Math.round(v * 1e4) / 1e4; return String(Object.is(r, -0) ? 0 : r); }
    if (typeof v === 'string') return JSON.stringify(v);
    if (typeof v === 'boolean') return v ? 'true' : 'false';
    if (Array.isArray(v)) return '[' + v.map(canon).join(',') + ']';
    if (ArrayBuffer.isView(v)) return canon(Array.from(v as unknown as ArrayLike<number>));
    return '{' + Object.keys(v).sort().filter((k) => v[k] !== undefined).map((k) => JSON.stringify(k) + ':' + canon(v[k])).join(',') + '}';
  }
  function hash(s: string) { let h = 0x811c9dc5; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0).toString(16).padStart(8, '0'); }
  // each part's fingerprint, and how many there are of what it lists
  const PARTS = ['floors', 'terrain', 'rooms', 'doors', 'windows', 'stairs', 'rails', 'lamps', 'light', 'spots', 'props', 'boxes', 'crest', 'fx', 'solids', 'mats', 'tex', 'nodes'];
  function fingerprint(d: LvDesc) {
    const part = (k: string): any => {
      switch (k) {
        case 'spots': return { spawn: d.spawn, extract: d.extract, lz: d.lz, entries: d.entries, enemySpots: d.enemySpots, lzSpots: d.lzSpots, cover: d.cover, wallSpots: d.wallSpots };
        case 'mats': return d.draw.mats;
        case 'tex': return d.draw.tex;
        case 'nodes': return d.draw.root;
        default: return d[k];
      }
    };
    const out: Record<string, string> = {}, count: Record<string, number> = {};
    for (const k of PARTS) { const v = part(k); out[k] = hash(canon(v)); if (Array.isArray(v)) count[k] = v.length; }
    let n = 0; const walk = (ns: LdNode[]) => { for (const q of ns) { n++; if (q.c) walk(q.c); } }; walk(d.draw.root); count.nodes = n;
    out.all = hash(PARTS.map((k) => out[k]).join(','));
    return { hash: out.all, parts: out, count };
  }
  return { describe, propList, proc, fingerprint, canon, hash, PARTS, ICO, quatEuler, compose, apply, quatUnit, rngAt, TEX_DRAWS, lin, over };
})();
G.LevelDesc = G_LevelDesc;
interface GameModules { LevelDesc: typeof G_LevelDesc; }
